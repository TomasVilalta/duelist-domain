import { Quaternion, Vector3, type Mesh } from 'three'
import { landingFor, type LandingFx, type LandingPose } from '@/anim/LandingFx'
import type { Tweens } from '@/anim/Tweens'
import type { Card } from '@/cards/Card'
import { getZoneByKey, legalOrientation } from '@/scene/ZoneLayout'

const Y = new Vector3(0, 1, 0)
const X = new Vector3(1, 0, 0)
const STACK_STEP = 0.012
const BASE_Y = 0.045
const HOVER_LIFT = 0.12
const HOVER_SCALE = 1.06

/** Orientation of a card lying on the board. Face-down is a half-turn around the card's upright axis. */
export function boardQuat(faceUp: boolean, defense: boolean, rotY: number): Quaternion {
  const q = new Quaternion().setFromAxisAngle(Y, rotY + (defense ? Math.PI / 2 : 0))
  q.multiply(new Quaternion().setFromAxisAngle(X, -Math.PI / 2))
  if (!faceUp) q.multiply(new Quaternion().setFromAxisAngle(Y, Math.PI))
  return q
}

/** Which cards are in which zone. Rules are not enforced; any zone can hold any number of cards. */
export class BoardState {
  private zones = new Map<string, Card[]>()
  private tweens: Tweens
  private landingFx: LandingFx | null
  private hovered: Card | null = null
  /** Cards whose landing tween must not be overwritten by a layout. */
  private busy = new Set<Card>()

  constructor(tweens: Tweens, landingFx: LandingFx | null = null) {
    this.tweens = tweens
    this.landingFx = landingFx
  }

  cardsIn(key: string): Card[] {
    return this.zones.get(key) ?? []
  }

  entries(): Iterable<[string, Card[]]> {
    return this.zones
  }

  clear() {
    for (const card of this.busy) this.landingFx?.cancel(card)
    this.busy.clear()
    this.hovered = null
    this.zones.clear()
  }

  meshes(): Mesh[] {
    const out: Mesh[] = []
    for (const list of this.zones.values()) for (const c of list) out.push(c.mesh)
    return out
  }

  /** Hovered card gets a slight lift; only the top card of a stack can be hovered. */
  setHover(card: Card | null) {
    if (card === this.hovered) return
    const prev = this.hovered
    this.hovered = card
    if (prev?.zoneKey) this.layoutZone(prev.zoneKey, 0.15)
    if (card?.zoneKey) this.layoutZone(card.zoneKey, 0.15)
  }

  isTop(card: Card): boolean {
    const list = card.zoneKey ? this.zones.get(card.zoneKey) : undefined
    return !!list && list[list.length - 1] === card
  }

  remove(card: Card) {
    const key = card.zoneKey
    if (!key) return
    this.stopLanding(card)
    if (this.hovered === card) this.hovered = null
    const list = this.zones.get(key)
    if (list) list.splice(list.indexOf(card), 1)
    card.zoneKey = null
    this.layoutZone(key, 0.15)
  }

  /**
   * `origin` is set when the card is arriving from the hand (`from: null`), a pile, or the deck.
   * Field-to-field moves pass a field key and get no landing animation.
   */
  place(card: Card, key: string, dur = 0.28, origin?: { from: string | null }) {
    const from = origin?.from
    this.remove(card)
    let list = this.zones.get(key)
    if (!list) this.zones.set(key, (list = []))
    list.push(card)
    card.zoneKey = key
    const zone = getZoneByKey(key)
    const fit = zone ? legalOrientation(zone.id.type, card.faceUp, card.defense) : null
    const landing = origin && fit ? landingFor(key, from ?? null, fit.faceUp, fit.defense) : null
    if (landing && this.landingFx) this.busy.add(card)
    this.layoutZone(key, dur)
    if (!landing || !this.landingFx) return
    const pose = this.restPose(card)
    if (!pose) {
      this.busy.delete(card)
      return
    }
    this.landingFx.play(card, landing, pose, () => {
      this.busy.delete(card)
      if (card.zoneKey) this.layoutZone(card.zoneKey, 0.12)
    })
  }

  layoutZone(key: string, dur: number) {
    const zone = getZoneByKey(key)
    const list = this.zones.get(key)
    if (!zone || !list) return
    list.forEach((card, i) => {
      const fit = legalOrientation(zone.id.type, card.faceUp, card.defense)
      card.faceUp = fit.faceUp
      card.defense = fit.defense
      if (this.busy.has(card)) return
      const hov = card === this.hovered
      const s = hov ? HOVER_SCALE : 1
      this.tweens.animate(
        card.mesh,
        {
          position: new Vector3(zone.x, BASE_Y + i * STACK_STEP + (hov ? HOVER_LIFT : 0), zone.z),
          quaternion: boardQuat(card.faceUp, card.defense, zone.rotY),
          scale: new Vector3(s, s, s),
        },
        dur,
      )
    })
  }

  /** Keep layout off this card while another animation drives it. Returns its rest pose. */
  hold(card: Card): LandingPose | null {
    const pose = this.restPose(card)
    if (pose) this.busy.add(card)
    return pose
  }

  /** Hand a held card back to the layout. */
  letGo(card: Card) {
    if (!this.busy.delete(card)) return
    if (card.zoneKey) this.layoutZone(card.zoneKey, 0.15)
  }

  private stopLanding(card: Card) {
    if (!this.busy.has(card)) return
    this.busy.delete(card)
    this.landingFx?.cancel(card)
  }

  /** Flat pose on the zone, without the hover lift. */
  private restPose(card: Card): LandingPose | null {
    const key = card.zoneKey
    const zone = key ? getZoneByKey(key) : undefined
    const list = key ? this.zones.get(key) : undefined
    if (!zone || !list) return null
    const i = Math.max(0, list.indexOf(card))
    return {
      position: new Vector3(zone.x, BASE_Y + i * STACK_STEP, zone.z),
      quaternion: boardQuat(card.faceUp, card.defense, zone.rotY),
    }
  }
}
