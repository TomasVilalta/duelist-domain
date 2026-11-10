import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
} from 'three'
import type { Card } from '@/cards/Card'
import { CARD_H, CARD_W } from '@/config'
import type { Updatable } from '@/core/Loop'
import { cardKind } from '@/interaction/CardActions'
import { getZoneByKey, type ZoneType } from '@/scene/ZoneLayout'
import { easeOutCubic, type Tweens } from './Tweens'

export type Landing = 'summon-atk' | 'summon-def' | 'set-monster' | 'activate' | 'set-st'

const FIELD: ReadonlySet<ZoneType> = new Set(['monster', 'emz', 'spell', 'field'])
/** Starts slow, then slams. */
const easeInQuart = (t: number) => t * t * t * t
/** Hangs, then covers most of the drop in the last moment. */
const easeSlam = (t: number) => t * t * t * t * t
/** Printed card faces are tinted down so they stay under the bloom. */
const FACE = 0.62
const FACE_PEAK = 0.9

const TINT = { monster: 0xff8a32, spell: 0x3ee0c8, trap: 0xff4aa8 }
export const ATK = 0xff4a28
const DEF = 0x3aa0ff

export interface LandingPose {
  position: Vector3
  quaternion: Quaternion
}

/**
 * Which arrival animation a card should play, or null when it should just slide.
 * Field-to-field moves and non-field destinations (GY, banished, extra, deck) are null.
 * `fromKey` null means the hand or anywhere off the board.
 */
export function landingFor(toKey: string, fromKey: string | null, faceUp: boolean, defense: boolean): Landing | null {
  const to = getZoneByKey(toKey)
  if (!to || !FIELD.has(to.id.type)) return null
  if (fromKey) {
    const from = getZoneByKey(fromKey)
    if (from && FIELD.has(from.id.type)) return null
  }
  if (to.id.type === 'monster' || to.id.type === 'emz') {
    if (!faceUp) return 'set-monster'
    return defense ? 'summon-def' : 'summon-atk'
  }
  return faceUp ? 'activate' : 'set-st'
}

interface Glow {
  card: Card
  mesh: Mesh
  mat: MeshBasicMaterial
  front: MeshBasicMaterial
  age: number
}

interface Spark {
  points: Points
  mat: PointsMaterial
  pos: Float32Array
  vel: Float32Array
  age: number
  life: number
}

interface Ring {
  mesh: Mesh
  mat: MeshBasicMaterial
  age: number
  delay: number
  life: number
  from: number
  to: number
}

/**
 * Short arrivals onto a field zone. `activate` is its own path so a monster
 * effect can use the same pulse later.
 */
export class LandingFx implements Updatable {
  private readonly ringGeo = new PlaneGeometry(1.2, 1.2)
  private readonly ringTex = ringTexture()
  private readonly glowGeo = new PlaneGeometry(CARD_W * 1.12, CARD_H * 1.12)
  private readonly glowTex = glowTexture()
  private readonly sparkTex = sparkTexture()
  private readonly glows: Glow[] = []
  private readonly rings: Ring[] = []
  private readonly sparks: Spark[] = []
  private readonly jobs = new Map<Card, () => void>()
  private readonly scene: Scene
  private readonly tweens: Tweens

  constructor(scene: Scene, tweens: Tweens) {
    this.scene = scene
    this.tweens = tweens
    this.ringGeo.rotateX(-Math.PI / 2)
  }

  /** Play `kind` into `pose`, then call `done`. A new play on the same card replaces the old one. */
  play(card: Card, kind: Landing, pose: LandingPose, done?: () => void) {
    this.cancel(card)
    if (done) this.jobs.set(card, done)
    if (kind === 'activate') this.activate(card, pose)
    else this.drop(card, pose, kind)
  }

  /**
   * Face-up spell or trap activation: a short scale pulse and a fading rim.
   * Monster effects can call this later with the same landing.
   */
  activate(card: Card, pose: LandingPose) {
    const rest = pose.position.clone()
    const lifted = rest.clone()
    lifted.y += 0.06
    const quat = pose.quaternion.clone()
    const one = new Vector3(1, 1, 1)
    const popped = new Vector3(1.07, 1.07, 1.07)
    this.tweens.animate(card.mesh, { position: rest, quaternion: quat, scale: one }, 0.2, {
      onDone: () => {
        this.addGlow(card)
        this.motes(card)
        this.tweens.animate(card.mesh, { position: lifted, scale: popped }, 0.22, {
          ease: easeOutCubic,
          onDone: () => {
            this.tweens.animate(card.mesh, { position: rest, scale: one }, 0.42, {
              onDone: () => this.finish(card),
            })
          },
        })
      },
    })
  }

  cancel(card: Card) {
    this.jobs.delete(card)
    this.tweens.cancel(card.mesh)
    this.removeGlow(card)
  }

  update(dt: number): boolean {
    for (let i = this.glows.length - 1; i >= 0; i--) {
      const g = this.glows[i]
      g.age += dt
      const t = g.age
      // Rise over the pulse, then fade out. The whole glow lasts about a second.
      const fadeIn = Math.min(t / 0.18, 1)
      const fadeOut = t < 0.4 ? 1 : Math.max(0, 1 - (t - 0.4) / 0.7)
      const k = fadeIn * fadeOut
      g.mat.opacity = k * 0.32
      g.mesh.scale.setScalar(1 + k * 0.06)
      g.front.color.setScalar(FACE + (FACE_PEAK - FACE) * k)
      if (t >= 1.1) this.removeGlow(g.card)
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]
      s.age += dt
      const n = s.vel.length / 3
      for (let p = 0; p < n; p++) {
        s.vel[p * 3 + 1] -= dt * 0.8
        s.pos[p * 3] += s.vel[p * 3] * dt
        s.pos[p * 3 + 1] += s.vel[p * 3 + 1] * dt
        s.pos[p * 3 + 2] += s.vel[p * 3 + 2] * dt
      }
      s.points.geometry.attributes.position.needsUpdate = true
      const t = Math.min(s.age / s.life, 1)
      s.mat.opacity = (1 - t) * 0.55
      s.mat.size = 0.07 * (1 - t * 0.35)
      if (t >= 1) this.removeSpark(i)
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]
      r.age += dt
      if (r.age < r.delay) continue
      const t = Math.min((r.age - r.delay) / r.life, 1)
      r.mesh.scale.setScalar(r.from + (r.to - r.from) * t)
      r.mat.opacity = (1 - t) * (1 - t)
      if (t >= 1) this.removeRing(i)
    }
    return this.glows.length > 0 || this.rings.length > 0 || this.sparks.length > 0
  }

  dispose() {
    for (const card of [...this.jobs.keys()]) this.cancel(card)
    for (let i = this.rings.length - 1; i >= 0; i--) this.removeRing(i)
    this.ringGeo.dispose()
    this.ringTex.dispose()
    this.glowGeo.dispose()
    this.glowTex.dispose()
    this.sparkTex.dispose()
    for (let i = this.sparks.length - 1; i >= 0; i--) this.removeSpark(i)
  }

  private drop(card: Card, pose: LandingPose, kind: Exclude<Landing, 'activate'>) {
    const summon = kind === 'summon-atk' || kind === 'summon-def'
    const lift = summon ? 1.5 : kind === 'set-monster' ? 0.72 : 0.32
    const gather = summon ? 0.16 : kind === 'set-monster' ? 0.18 : 0.14
    const fall = summon ? 0.22 : kind === 'set-monster' ? 0.32 : 0.4
    const rest = pose.position.clone()
    const high = rest.clone()
    high.y += lift
    const quat = pose.quaternion.clone()
    const looming = new Vector3(summon ? 1 : 1.06, summon ? 1 : 1.06, summon ? 1 : 1.06)
    const one = new Vector3(1, 1, 1)
    this.tweens.animate(card.mesh, { position: high, quaternion: quat, scale: looming }, gather, {
      ease: easeOutCubic,
      onDone: () => {
        this.tweens.animate(card.mesh, { position: rest, quaternion: quat, scale: one }, fall, {
          ease: summon ? easeSlam : kind === 'set-st' ? easeOutCubic : easeInQuart,
          onDone: () => {
            if (summon) this.slam(card, rest, kind === 'summon-def' ? DEF : ATK)
            else if (kind === 'set-monster') this.impact(card, rest, 0xfff1d2, false)
            else this.tap(card, rest)
          },
        })
      },
    })
  }

  /** Summon: stop on the board. Attack is orange-red, defense is blue. */
  private slam(card: Card, rest: Vector3, color: number) {
    card.mesh.position.copy(rest)
    card.mesh.scale.set(1, 1, 1)
    this.shockwave(rest, color, true)
    this.finish(card)
  }

  /** Monster set: a smaller thud that still leaves the table a little. */
  private impact(card: Card, rest: Vector3, color: number, declared: boolean) {
    const popped = new Vector3(declared ? 1.28 : 1.12, declared ? 1.28 : 1.12, declared ? 1.28 : 1.12)
    const one = new Vector3(1, 1, 1)
    const up = rest.clone()
    up.y += declared ? 0.09 : 0.045
    this.shockwave(rest, color, declared)
    this.tweens.animate(card.mesh, { position: up, scale: popped }, declared ? 0.09 : 0.07, {
      onDone: () => {
        this.tweens.animate(card.mesh, { position: rest, scale: one }, declared ? 0.22 : 0.16, {
          ease: easeOutCubic,
          onDone: () => this.finish(card),
        })
      },
    })
  }

  /** Spell/trap set: a soft press into the zone, no shockwave. */
  private tap(card: Card, rest: Vector3) {
    const pressed = new Vector3(1.05, 1.05, 1.05)
    const one = new Vector3(1, 1, 1)
    this.tweens.animate(card.mesh, { position: rest, scale: pressed }, 0.08, {
      onDone: () => {
        this.tweens.animate(card.mesh, { scale: one }, 0.16, {
          onDone: () => this.finish(card),
        })
      },
    })
  }

  shockwave(at: Vector3, color: number, declared: boolean) {
    const spread = declared ? 2.6 : 1.5
    this.ring(at, color, 0, declared ? 0.5 : 0.32, 0.35, spread)
    if (declared) this.ring(at, color, 0.1, 0.62, 0.15, spread * 0.72)
  }

  private ring(at: Vector3, color: number, delay: number, life: number, from: number, to: number) {
    const mat = new MeshBasicMaterial({
      map: this.ringTex,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      opacity: 1,
    })
    // Above 1 so the bloom picks the shockwave up.
    const hdr = color === DEF ? [0.45, 1.15, 2.6] : color === ATK ? [2.6, 0.55, 0.15] : [1.4, 1.15, 0.7]
    mat.color.setRGB(hdr[0], hdr[1], hdr[2])
    mat.fog = false
    const mesh = new Mesh(this.ringGeo, mat)
    mesh.position.set(at.x, at.y + 0.02, at.z)
    mesh.scale.setScalar(from)
    mesh.renderOrder = 1
    this.scene.add(mesh)
    this.rings.push({ mesh, mat, age: 0, delay, life, from, to })
  }

  private addGlow(card: Card) {
    this.removeGlow(card)
    const mat = new MeshBasicMaterial({
      map: this.glowTex,
      color: TINT[cardKind(card)],
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
      opacity: 0,
    })
    mat.fog = false
    const mesh = new Mesh(this.glowGeo, mat)
    mesh.position.z = -0.001
    mesh.renderOrder = 3
    card.mesh.add(mesh)
    const front = (card.mesh.material as MeshBasicMaterial[])[0]
    this.glows.push({ card, mesh, mat, front, age: 0 })
  }

  /** A handful of short sparks rising off the card. */
  private motes(card: Card) {
    const n = 14
    const pos = new Float32Array(n * 3)
    const vel = new Float32Array(n * 3)
    const at = new Vector3()
    card.mesh.getWorldPosition(at)
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2
      const rad = Math.random() * 0.28
      pos[i * 3] = at.x + Math.cos(ang) * rad
      pos[i * 3 + 1] = at.y + 0.03
      pos[i * 3 + 2] = at.z + Math.sin(ang) * rad
      vel[i * 3] = Math.cos(ang) * (0.12 + Math.random() * 0.2)
      vel[i * 3 + 1] = 0.28 + Math.random() * 0.35
      vel[i * 3 + 2] = Math.sin(ang) * (0.12 + Math.random() * 0.2)
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(pos, 3))
    const mat = new PointsMaterial({
      map: this.sparkTex,
      color: TINT[cardKind(card)],
      size: 0.07,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      opacity: 0.55,
      sizeAttenuation: true,
    })
    mat.fog = false
    const points = new Points(geo, mat)
    points.frustumCulled = false
    points.renderOrder = 3
    this.scene.add(points)
    this.sparks.push({ points, mat, pos, vel, age: 0, life: 0.55 })
  }

  private removeGlow(card: Card) {
    const i = this.glows.findIndex((g) => g.card === card)
    if (i < 0) return
    const g = this.glows[i]
    g.front.color.setScalar(FACE)
    g.mesh.removeFromParent()
    g.mat.dispose()
    this.glows.splice(i, 1)
  }

  private removeSpark(i: number) {
    const s = this.sparks[i]
    s.points.geometry.dispose()
    s.mat.dispose()
    s.points.removeFromParent()
    this.sparks.splice(i, 1)
  }

  private removeRing(i: number) {
    const r = this.rings[i]
    r.mesh.removeFromParent()
    r.mat.dispose()
    this.rings.splice(i, 1)
  }

  private finish(card: Card) {
    const done = this.jobs.get(card)
    this.jobs.delete(card)
    done?.()
  }
}

function ringTexture(): CanvasTexture {
  const s = 128
  const canvas = document.createElement('canvas')
  canvas.width = s
  canvas.height = s
  const ctx = canvas.getContext('2d')
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  if (!ctx) return tex
  const img = ctx.createImageData(s, s)
  const c = s / 2
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = Math.hypot(x - c, y - c) / c
      const band = Math.exp(-((d - 0.7) ** 2) / 0.01)
      const i = (y * s + x) * 4
      img.data[i] = 255
      img.data[i + 1] = 255
      img.data[i + 2] = 255
      img.data[i + 3] = Math.min(255, Math.round(band * 255))
    }
  }
  ctx.putImageData(img, 0, 0)
  tex.needsUpdate = true
  return tex
}

/** Thin rounded-rect rim, so the halo follows the card instead of reading as an oval. */
function glowTexture(): CanvasTexture {
  const w = 160
  const h = Math.round(w * (CARD_H / CARD_W))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  if (!ctx) return tex
  const img = ctx.createImageData(w, h)
  const hx = w / (2 * 1.12)
  const hy = h / (2 * 1.12)
  const cx = w / 2
  const cy = h / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = sdRoundBox(x - cx, y - cy, hx, hy, 14)
      const a = Math.exp(-(d * d) / 42)
      const i = (y * w + x) * 4
      img.data[i] = 255
      img.data[i + 1] = 255
      img.data[i + 2] = 255
      img.data[i + 3] = Math.min(255, Math.round(a * 180))
    }
  }
  ctx.putImageData(img, 0, 0)
  tex.needsUpdate = true
  return tex
}

function sdRoundBox(px: number, py: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(px) - hx + r
  const qy = Math.abs(py) - hy + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function sparkTexture(): CanvasTexture {
  const s = 32
  const canvas = document.createElement('canvas')
  canvas.width = s
  canvas.height = s
  const ctx = canvas.getContext('2d')
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  if (!ctx) return tex
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.7)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  tex.needsUpdate = true
  return tex
}
