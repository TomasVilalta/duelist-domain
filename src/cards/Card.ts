import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CARD_H, CARD_W } from '@/config'
import type { CardData } from '@/data/demoDeck'
import { cardArt, cardBack } from './CardArt'
import { makeBadgeTexture, makeFaceTexture, makeSleeveTexture } from './CardTextures'

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

export class Card {
  readonly mesh: Mesh
  readonly data: CardData
  /** Board state (manual, no rules): where the card is and how it's turned. */
  zoneKey: string | null = null
  faceUp = true
  defense = false
  counters = 0
  private badge: Mesh | null = null

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
  }

  /** Store edited ATK/DEF. Printed art is left as-is; generated faces are redrawn. */
  setStats(atk: number, def: number) {
    this.data.atk = atk
    this.data.def = def
    if (this.data.image) return
    const mat = (this.mesh.material as MeshBasicMaterial[])[0]
    if (!mat.map?.userData.shared) mat.map?.dispose()
    mat.map = makeFaceTexture(this.data)
    mat.needsUpdate = true
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
    const m = this.mesh.material as MeshBasicMaterial[]
    if (m[0].map && !m[0].map.userData.shared) m[0].map.dispose()
    m[0].dispose()
  }
}
