import { AdditiveBlending, CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three'
import type { Card } from '@/cards/Card'
import { CARD_H, CARD_W } from '@/config'
import type { Updatable } from '@/core/Loop'
import { cardKind, isPendulum } from '@/interaction/CardActions'

const SCALE = 1.45
/** Fade-in length and the size the glow grows from. */
const ENTER_TIME = 0.28
const ENTER_SCALE = 0.88
const TINT = { monster: 0xff8a32, spell: 0x3ee0c8, trap: 0xff4aa8 }
const MONSTER_RGB: Rgb = [255, 138, 50]
const SPELL_RGB: Rgb = [62, 224, 200]

type Rgb = [number, number, number]

function glowTexture(tint?: (x: number, w: number) => Rgb): CanvasTexture {
  const w = 160
  const h = Math.round(w * (CARD_H / CARD_W))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return new CanvasTexture(canvas)
  const img = ctx.createImageData(w, h)
  const hx = w / (2 * SCALE)
  const hy = h / (2 * SCALE)
  const radius = 10
  const cx = w / 2
  const cy = h / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = sdRoundBox(x - cx, y - cy, hx, hy, radius)
      const a = d >= 0 ? Math.exp(-(d * d) / 196) : Math.exp(-(d * d) / 36) * 0.45
      const rgb = tint ? tint(x, w) : ([255, 255, 255] as Rgb)
      const i = (y * w + x) * 4
      img.data[i] = rgb[0]
      img.data[i + 1] = rgb[1]
      img.data[i + 2] = rgb[2]
      img.data[i + 3] = Math.min(255, Math.round(a * 230))
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return tex
}

/** Signed distance to a rounded rectangle centered on the origin. */
function sdRoundBox(px: number, py: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(px) - hx + r
  const qy = Math.abs(py) - hy + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/** Soft rim behind the pinned card. Follows the card because it is parented to the mesh. */
export class CardGlow implements Updatable {
  private readonly mesh: Mesh
  private readonly mat: MeshBasicMaterial
  private readonly plain: CanvasTexture
  private readonly pendulum: CanvasTexture
  private card: Card | null = null
  private time = 0
  /** Seconds since the glow attached, drives the fade-in. */
  private age = 0

  constructor() {
    this.plain = glowTexture()
    this.pendulum = glowTexture((x, w) => {
      const t = w <= 1 ? 0 : x / (w - 1)
      return [
        MONSTER_RGB[0] + (SPELL_RGB[0] - MONSTER_RGB[0]) * t,
        MONSTER_RGB[1] + (SPELL_RGB[1] - MONSTER_RGB[1]) * t,
        MONSTER_RGB[2] + (SPELL_RGB[2] - MONSTER_RGB[2]) * t,
      ] as Rgb
    })
    this.mat = new MeshBasicMaterial({
      map: this.plain,
      color: TINT.monster,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
    })
    this.mat.fog = false
    this.mesh = new Mesh(new PlaneGeometry(CARD_W * SCALE, CARD_H * SCALE), this.mat)
    // Between the two faces, so whichever side is up hides the center and leaves the rim.
    this.mesh.position.z = -0.001
    this.mesh.renderOrder = 2
    this.mesh.visible = false
  }

  /** Attach to `card`, or clear the glow. */
  set(card: Card | null) {
    if (this.card === card) return
    this.mesh.removeFromParent()
    this.card = card
    if (!card) {
      this.mesh.visible = false
      return
    }
    const pendulum = isPendulum(card)
    this.mat.map = pendulum ? this.pendulum : this.plain
    this.mat.color.setHex(pendulum ? 0xffffff : TINT[cardKind(card)])
    this.mat.needsUpdate = true
    this.age = 0
    this.mat.opacity = 0
    this.mesh.scale.setScalar(ENTER_SCALE)
    this.mesh.visible = true
    card.mesh.add(this.mesh)
  }

  update(dt: number): boolean {
    if (!this.card) return false
    this.time += dt
    this.age += dt
    const t = Math.min(this.age / ENTER_TIME, 1)
    const ease = 1 - (1 - t) ** 3
    this.mat.opacity = ease * (0.55 + 0.35 * Math.sin(this.time * 3.4))
    this.mesh.scale.setScalar(ENTER_SCALE + (1 - ENTER_SCALE) * ease)
    return true
  }

  dispose() {
    this.mesh.removeFromParent()
    this.plain.dispose()
    this.pendulum.dispose()
    this.mat.dispose()
    this.mesh.geometry.dispose()
  }
}
