import type { Scene } from 'three'
import type { Card } from '@/cards/Card'
import type { Hand } from '@/cards/Hand'
import type { BoardState } from '@/state/BoardState'
import type { MenuItem } from '@/ui/ContextMenu'
import { getZoneByKey, type ZoneType } from '@/scene/ZoneLayout'

export type DeckPos = 'top' | 'bottom' | 'shuffle'

interface Deps {
  scene: Scene
  hand: Hand
  board: BoardState
  returnToDeck: (card: Card, pos: DeckPos) => void
  editStats: (card: Card) => void
  invalidate: () => void
  /** Snapshot the board before a menu action. */
  commit: () => void
  onChange: () => void
}

type Owner = 'p1' | 'p2'

/** Manual card actions. Nothing is validated: every action is always allowed. */
export class CardActions {
  private d: Deps

  constructor(deps: Deps) {
    this.d = deps
  }

  private ownerOf(card: Card): Owner {
    return card.zoneKey?.startsWith('p2') ? 'p2' : 'p1'
  }

  private freeZone(type: 'monster' | 'spell', owner: Owner): string {
    for (let i = 0; i < 5; i++) {
      const key = `${owner}:${type}:${i}`
      if (this.d.board.cardsIn(key).length === 0) return key
    }
    return `${owner}:${type}:0`
  }

  /** Detach from the hand (if it's there) so the card can be placed in the world. */
  private release(card: Card) {
    if (this.d.hand.cards.includes(card)) {
      this.d.hand.remove(card)
      this.d.scene.attach(card.mesh)
    }
  }

  moveTo(card: Card, key: string, faceUp: boolean, defense: boolean) {
    this.d.commit()
    this.release(card)
    card.faceUp = faceUp
    card.defense = defense
    this.d.board.place(card, key)
    this.d.onChange()
  }

  flip(card: Card) {
    card.faceUp = !card.faceUp
    this.relayout(card)
  }

  togglePosition(card: Card) {
    card.defense = !card.defense
    this.relayout(card)
  }

  setPosition(card: Card, faceUp: boolean, defense: boolean) {
    this.d.commit()
    card.faceUp = faceUp
    card.defense = defense
    this.relayout(card)
    this.d.onChange()
  }

  private relayout(card: Card) {
    if (card.zoneKey) this.d.board.layoutZone(card.zoneKey, 0.35)
  }

  toHand(card: Card) {
    this.d.commit()
    this.d.board.remove(card)
    this.d.hand.add(card, 0.4)
    this.d.onChange()
  }

  addCounter(card: Card, delta: number) {
    this.d.commit()
    card.setCounters(card.counters + delta)
    this.d.invalidate()
    this.d.onChange()
  }

  // ---- menus ----

  handItems(card: Card): MenuItem[] {
    const own: Owner = 'p1'
    return [
      { label: 'Summon ATK', action: () => this.moveTo(card, this.freeZone('monster', own), true, false) },
      { label: 'Summon DEF (Face up)', action: () => this.moveTo(card, this.freeZone('monster', own), true, true) },
      { label: 'Set DEF', action: () => this.moveTo(card, this.freeZone('monster', own), false, true) },
      { separator: true },
      { label: 'Place spell/trap face-up', action: () => this.moveTo(card, this.freeZone('spell', own), true, false) },
      { label: 'Set spell/trap face-down', action: () => this.moveTo(card, this.freeZone('spell', own), false, false) },
      { separator: true },
      { label: 'Send to GY', action: () => this.moveTo(card, `${own}:gy:0`, true, false) },
      { label: 'Banish', action: () => this.moveTo(card, `${own}:banished:0`, true, false) },
      { label: 'Banish face-down', action: () => this.moveTo(card, `${own}:banished:0`, false, false) },
      { label: 'Return to deck (top)', action: () => this.d.returnToDeck(card, 'top') },
      { label: 'Shuffle into deck', action: () => this.d.returnToDeck(card, 'shuffle') },
    ]
  }

  pileItems(card: Card): MenuItem[] {
    const own: Owner = 'p1'
    return [
      { label: 'Summon ATK', action: () => this.moveTo(card, this.freeZone('monster', own), true, false) },
      { label: 'Summon DEF (Face up)', action: () => this.moveTo(card, this.freeZone('monster', own), true, true) },
      { label: 'Set DEF', action: () => this.moveTo(card, this.freeZone('monster', own), false, true) },
      { separator: true },
      { label: 'Place spell/trap face-up', action: () => this.moveTo(card, this.freeZone('spell', own), true, false) },
      { label: 'Set spell/trap face-down', action: () => this.moveTo(card, this.freeZone('spell', own), false, false) },
      { separator: true },
      { label: 'Add to hand', action: () => this.toHand(card) },
      { label: 'Send to GY', action: () => this.moveTo(card, `${own}:gy:0`, true, false) },
      { label: 'Banish', action: () => this.moveTo(card, `${own}:banished:0`, true, false) },
      { label: 'Banish face-down', action: () => this.moveTo(card, `${own}:banished:0`, false, false) },
      { label: 'Return to deck (top)', action: () => this.d.returnToDeck(card, 'top') },
      { label: 'Return to deck (bottom)', action: () => this.d.returnToDeck(card, 'bottom') },
      { label: 'Shuffle into deck', action: () => this.d.returnToDeck(card, 'shuffle') },
    ]
  }

  private positionItems(card: Card): MenuItem[] {
    const type: ZoneType | undefined = card.zoneKey ? getZoneByKey(card.zoneKey)?.id.type : undefined
    const opt = (label: string, faceUp: boolean, defense: boolean): MenuItem => ({
      label,
      disabled: card.faceUp === faceUp && card.defense === defense,
      action: () => this.setPosition(card, faceUp, defense),
    })
    if (type === 'monster' || type === 'emz') {
      return [opt('To ATK', true, false), opt('To DEF (Face up)', true, true), opt('To DEF (Face down)', false, true)]
    }
    if (type === 'spell' || type === 'field' || type === 'banished' || type === 'extra') {
      return [opt('Face up', true, false), opt('Face down', false, false)]
    }
    return []
  }

  boardItems(card: Card): MenuItem[] {
    const own = this.ownerOf(card)
    const isMonster = card.data.atk !== undefined
    const positions = this.positionItems(card)
    return [
      ...positions,
      ...(positions.length ? [{ separator: true }] : []),
      { label: 'Send to GY', action: () => this.moveTo(card, `${own}:gy:0`, true, false) },
      { label: 'Banish', action: () => this.moveTo(card, `${own}:banished:0`, true, false) },
      { label: 'Banish face-down', action: () => this.moveTo(card, `${own}:banished:0`, false, false) },
      { separator: true },
      { label: 'Return to hand', action: () => this.toHand(card) },
      { label: 'Return to deck (top)', action: () => this.d.returnToDeck(card, 'top') },
      { label: 'Return to deck (bottom)', action: () => this.d.returnToDeck(card, 'bottom') },
      { label: 'Shuffle into deck', action: () => this.d.returnToDeck(card, 'shuffle') },
      { separator: true },
      { label: 'Edit ATK/DEF…', disabled: !isMonster, action: () => this.d.editStats(card) },
      { label: 'Add counter', action: () => this.addCounter(card, 1) },
      { label: 'Remove counter', disabled: card.counters === 0, action: () => this.addCounter(card, -1) },
    ]
  }
}
