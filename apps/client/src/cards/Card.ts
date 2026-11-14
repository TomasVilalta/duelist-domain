import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  type Object3D,
  Quaternion,
  type Texture,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { parseZoneKey, type CardInfo, type CardState } from '@duelist/shared'
import { CARD_H, CARD_W } from '@/config'
import type { CardData } from '@/data/demoDeck'
import { getZoneByKey } from '@/scene/ZoneLayout'
import { cardArt, cardBack } from './CardArt'
import { makeBadgeTexture, makeFaceTexture, makeLevelTexture, makeScaleTexture, makeSleeveTexture, makeStatsTexture } from './CardTextures'

function roundedShape(w: number, h: number, r: number): Shape {
  const x = -w / 2
  const y = -h / 2
  const s = new Shape()
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

let shared: { geometry: BufferGeometry; back: MeshBasicMaterial; badge: PlaneGeometry } | undefined

const STRIP_W = 1.25
const LEVEL_W = 0.5
const STRIP_GEO = new PlaneGeometry(STRIP_W, STRIP_W * (96 / 512))
const LEVEL_GEO = new PlaneGeometry(LEVEL_W, LEVEL_W / 2)
const P = new Vector3()
const V = new Vector3()
const PS = new Vector3()
const RIGHT = new Vector3()
const DOWN = new Vector3()
const PQ = new Quaternion()
const CQ = new Quaternion()
const LQ = new Quaternion()

/** One geometry + one back material for every card. Group 0 = front, group 1 = back. */
export function getSharedCardResources() {
  if (shared) return shared
  const front = new ShapeGeometry(roundedShape(CARD_W, CARD_H, 0.06), 6)
  const pos = front.getAttribute('position')
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / CARD_W + 0.5
    uv[i * 2 + 1] = pos.getY(i) / CARD_H + 0.5
  }
  front.setAttribute('uv', new BufferAttribute(uv, 2))
  front.translate(0, 0, 0.002)

  const back = front.clone()
  back.rotateY(Math.PI)
  back.translate(0, 0, -0.004)
  // mirror back UVs so the sleeve reads correctly from behind
  const buv = back.getAttribute('uv')
  for (let i = 0; i < buv.count; i++) buv.setX(i, 1 - buv.getX(i))

  const geometry = mergeGeometries([front, back], true)
  front.dispose()
  back.dispose()

  const backMat = new MeshBasicMaterial({
    map: cardBack() ?? makeSleeveTexture(),
    color: new Color(0.62, 0.62, 0.62),
  })
  backMat.fog = false
  shared = { geometry, back: backMat, badge: new PlaneGeometry(0.3, 0.3) }
  return shared
}

export function getSleeveMaterial() {
  return getSharedCardResources().back
}

/** `CreateView` for `CardViews`. */
export function createCardMesh(uid: string, info: CardInfo): Card {
  // TODO(T10): `CardData.uid` becomes the string uid.
  return new Card({ ...info, uid: Number(uid.slice(1)) })
}

export class Card {
  readonly mesh: Mesh
  readonly data: CardData
  /**
   * Derived from `CardState` and set by `applyState()` (via `CardViews`).
   * The pre-store interaction code still writes them directly until T9 rewires it to dispatch actions.
   */
  zoneKey: string | null = null
  faceUp = true
  defense = false
  counters = 0
  /** Derived: under another card in a monster zone. Stats, level, scale, and counters stay hidden. */
  covered = false
  private badge: Mesh | null = null
  private overlay: Mesh[] = []
  /** ATK / DEF strip and level badge. Shown in the hand and in monster zones. */
  private stats: Mesh | null = null
  private levelMark: Mesh | null = null
  /** Pendulum scale. Shown face-up in a spell/trap zone. */
  private scaleMark: Mesh | null = null

  constructor(data: CardData) {
    this.data = data
    const { geometry, back } = getSharedCardResources()
    // Unlit, but scaled down so the white card frame stays under the bloom threshold.
    const front = new MeshBasicMaterial({
      map: cardArt(data) ?? makeFaceTexture(data),
      color: new Color(0.62, 0.62, 0.62),
    })
    front.fog = false
    this.mesh = new Mesh(geometry, [front, back])
    this.mesh.userData.card = this
    this.buildOverlay()
  }

  /** Store edited ATK/DEF. Printed art is left as-is; generated faces are redrawn. */
  setStats(atk: number, def: number) {
    this.data.atk = atk
    this.data.def = def
    this.buildOverlay()
    if (this.data.image) return
    const mat = (this.mesh.material as MeshBasicMaterial[])[0]
    if (!mat.map?.userData.shared) mat.map?.dispose()
    mat.map = makeFaceTexture(this.data)
    mat.needsUpdate = true
  }

  /** Level badge and ATK / DEF strip for monsters, plus a pendulum scale badge. */
  private clearOverlay() {
    for (const m of this.overlay) {
      const mat = m.material as MeshBasicMaterial
      if (!mat.map?.userData.shared) mat.map?.dispose()
      mat.dispose()
      this.mesh.remove(m)
    }
    this.overlay = []
    this.stats = null
    this.levelMark = null
    this.scaleMark = null
  }

  private makeOverlay(map: Texture, geo: PlaneGeometry): Mesh {
    const mat = new MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false })
    mat.color.setScalar(0.85)
    mat.fog = false
    const m = new Mesh(geo, mat)
    m.renderOrder = 10
    this.mesh.add(m)
    this.overlay.push(m)
    return m
  }

  private buildOverlay() {
    this.clearOverlay()
    const { atk, def, level, scale } = this.data
    if (atk !== undefined) {
      this.stats = this.makeOverlay(makeStatsTexture(atk, def ?? 0), STRIP_GEO)
      if (level) this.levelMark = this.makeOverlay(makeLevelTexture(level), LEVEL_GEO)
    }
    if (scale != null) this.scaleMark = this.makeOverlay(makeScaleTexture(scale), LEVEL_GEO)
  }

  /**
   * Keep the overlay facing the camera. ATK and level sit on hand cards and
   * monster zones. The pendulum scale sits under a face-up card in a spell/trap zone.
   */
  billboard(camera: Object3D) {
    if (this.covered) {
      for (const m of this.overlay) m.visible = false
      if (this.badge) this.badge.visible = false
      return
    }
    if (this.badge) this.badge.visible = true
    if (this.overlay.length === 0) return
    const type = this.zoneKey ? (parseZoneKey(this.zoneKey)?.type ?? getZoneByKey(this.zoneKey)?.id.type) : undefined
    const monsterSpot = this.faceUp && (!this.zoneKey || type === 'monster' || type === 'emz')
    const spellSpot = this.faceUp && type === 'spell'
    if (this.stats) this.stats.visible = monsterSpot
    if (this.levelMark) this.levelMark.visible = monsterSpot
    if (this.scaleMark) this.scaleMark.visible = spellSpot
    if (!monsterSpot && !spellSpot) return
    const mesh = this.mesh
    mesh.updateWorldMatrix(true, false)
    mesh.getWorldPosition(P)
    mesh.getWorldQuaternion(PQ)
    mesh.getWorldScale(PS)
    camera.getWorldQuaternion(CQ)
    RIGHT.set(1, 0, 0).applyQuaternion(CQ)
    DOWN.set(0, -1, 0).applyQuaternion(CQ)
    let maxD = 0
    let maxR = 0
    for (let c = 0; c < 4; c++) {
      const sx = c & 1 ? 1 : -1
      const sy = c & 2 ? 1 : -1
      V.set((sx * CARD_W) / 2, (sy * CARD_H) / 2, 0).applyMatrix4(mesh.matrixWorld).sub(P)
      maxD = Math.max(maxD, V.dot(DOWN))
      maxR = Math.max(maxR, V.dot(RIGHT))
    }
    const k = PS.x
    LQ.copy(PQ).invert().multiply(CQ)
    if (monsterSpot && this.stats) {
      this.place(this.stats, P, RIGHT, DOWN, 0, maxD + STRIP_W * (96 / 512) * 0.5 * k - 0.03 * k)
    }
    if (monsterSpot && this.levelMark) {
      this.place(this.levelMark, P, RIGHT, DOWN, maxR - LEVEL_W * 0.42 * k, maxD - LEVEL_W * 0.2 * k)
    }
    if (spellSpot && this.scaleMark) {
      this.place(this.scaleMark, P, RIGHT, DOWN, 0, maxD + LEVEL_W * 0.28 * k)
    }
  }

  private place(m: Mesh, p: Vector3, right: Vector3, down: Vector3, dx: number, dy: number) {
    V.copy(p).addScaledVector(right, dx).addScaledVector(down, dy)
    this.mesh.worldToLocal(V)
    m.position.copy(V)
    m.quaternion.copy(LQ)
  }

  /** Copies the visual fields from the game state. */
  applyState(state: CardState, zoneKey: string, covered: boolean) {
    this.zoneKey = zoneKey
    this.faceUp = state.faceUp
    this.defense = state.defense
    this.covered = covered
    if (state.counters !== this.counters) this.setCounters(state.counters)
  }

  setCounters(n: number) {
    this.counters = Math.max(0, n)
    if (this.badge) {
      const m = this.badge.material as MeshBasicMaterial
      m.map?.dispose()
      m.dispose()
      this.mesh.remove(this.badge)
      this.badge = null
    }
    if (this.counters === 0) return
    const mat = new MeshBasicMaterial({ map: makeBadgeTexture(this.counters), transparent: true })
    mat.fog = false
    this.badge = new Mesh(getSharedCardResources().badge, mat)
    this.badge.position.set(CARD_W / 2 - 0.13, CARD_H / 2 - 0.13, 0.008)
    this.mesh.add(this.badge)
  }

  dispose() {
    this.setCounters(0)
    this.clearOverlay()
    const m = this.mesh.material as MeshBasicMaterial[]
    if (m[0].map && !m[0].map.userData.shared) m[0].map.dispose()
    m[0].dispose()
  }
}
