import { Euler, Group, MathUtils, Quaternion, Vector3 } from 'three'
import type { Tweens } from '@/anim/Tweens'
import type { Card } from './Card'

// The hand lives in camera space so it stays at the bottom of the screen.
const DEPTH = 8
const SCALE = 0.78
const FOV = 40
/** Half of the visible height at the hand plane, in hand-local units. */
const HALF_H = (DEPTH * Math.tan(MathUtils.degToRad(FOV / 2))) / SCALE
const REST_Y = -HALF_H + 0.45
const HOVER_Y = -HALF_H + 0.58
const HOVER_SCALE = 1.03

export class Hand {
  readonly group = new Group()
  readonly cards: Card[] = []
  private hover = -1
  private aspect = 16 / 9
  private tweens: Tweens

  constructor(tweens: Tweens) {
    this.tweens = tweens
    this.group.position.set(0, 0, -DEPTH)
    this.group.scale.setScalar(SCALE)
  }

  setAspect(a: number) {
    this.aspect = a
    this.layout()
  }

  get hoverIndex() {
    return this.hover
  }

  private spacing(): number {
    const n = this.cards.length
    const halfW = HALF_H * this.aspect
    return Math.min(0.85, (halfW * 2 - 3) / Math.max(n, 1))
  }

  baseX(i: number): number {
    return (i - (this.cards.length - 1) / 2) * this.spacing()
  }

  /** Is a hand-local point over the hand region? Returns the card index or -1. */
  pick(x: number, y: number): number {
    const n = this.cards.length
    if (n === 0) return -1
    const bottom = -HALF_H - 1
    const sp = this.spacing()
    // Keep the raised card only while the pointer is inside its enlarged footprint.
    if (this.hover >= 0 && this.hover < n) {
      const hx = this.baseX(this.hover)
      if (Math.abs(x - hx) <= 0.5 * HOVER_SCALE && y <= HOVER_Y + 0.73 * HOVER_SCALE && y >= bottom) return this.hover
    }
    // Resting cards: only the visible strip counts.
    if (y > REST_Y + 0.73 || y < bottom) return -1
    const half = (n - 1) * sp * 0.5 + 0.5
    if (Math.abs(x) > half) return -1
    return Math.max(0, Math.min(n - 1, Math.round(x / sp + (n - 1) / 2)))
  }

  setHover(i: number) {
    if (i === this.hover) return
    this.hover = i
    this.layout()
  }

  /** Add a card (already parented anywhere in the scene) to the hand. */
  add(card: Card, dur = 0.55, index?: number) {
    this.group.attach(card.mesh)
    card.zoneKey = null
    card.faceUp = true
    card.defense = false
    // `index` counts from the first card, like the game state. Omitted means the end.
    this.cards.splice(index === undefined ? this.cards.length : Math.max(0, Math.min(index, this.cards.length)), 0, card)
    this.layout(card, dur)
  }

  has(card: Card): boolean {
    return this.cards.includes(card)
  }

  clear() {
    this.cards.length = 0
    this.hover = -1
  }

  remove(card: Card) {
    const i = this.cards.indexOf(card)
    if (i < 0) return
    this.cards.splice(i, 1)
    this.hover = -1
    this.layout()
  }

  layout(slow?: Card, slowDur = 0.5) {
    const n = this.cards.length
    const sp = this.spacing()
    this.cards.forEach((card, i) => {
      let x = (i - (n - 1) / 2) * sp
      const isHover = i === this.hover
      let y = REST_Y - x * x * 0.012
      let rotZ = -x * 0.05
      let s = 1
      // Just in front of the fan. A large z pulls the card closer to the camera,
      // and perspective then slides it down the screen.
      let z = i * 0.02
      if (isHover) {
        y = HOVER_Y
        rotZ *= 0.5
        s = HOVER_SCALE
        z = (n - 1) * 0.02 + 0.03
      } else if (this.hover >= 0) {
        const d = i - this.hover
        x += Math.sign(d) * Math.max(0, 0.12 - Math.abs(d) * 0.04)
      }
      const q = new Quaternion().setFromEuler(new Euler(0, 0, rotZ))
      const isSlow = card === slow
      this.tweens.animate(
        card.mesh,
        { position: new Vector3(x, y, z), quaternion: q, scale: new Vector3(s, s, s) },
        isSlow ? slowDur : 0.2,
      )
    })
  }
}
