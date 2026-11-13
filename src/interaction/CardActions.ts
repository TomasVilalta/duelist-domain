import type { Scene } from 'three'
import type { Card } from '@/cards/Card'
import type { Hand } from '@/cards/Hand'
import type { CardData, CardKind } from '@/data/demoDeck'
import type { BoardState } from '@/state/BoardState'
import type { MenuItem } from '@/ui/ContextMenu'
import { getZoneByKey, type ZoneType } from '@/scene/ZoneLayout'

export type DeckPos = 'top' | 'bottom' | 'shuffle'

export type PlayZone = 'monster' | 'spell' | 'field' | 'pendulum'
export type PlayIcon = 'summon' | 'set' | 'defense' | 'activate' | 'pendulum' | 'hand'

/** A way to put a card onto the board. Shared by the context menu and the shortcut bar. */
export interface PlayAction {
  label: string
  icon: PlayIcon
  zone: PlayZone
  faceUp: boolean
  defense: boolean
}

/** Anything that carries printed card data. A live `Card` satisfies this. */
type CardInfo = { data: CardData }

/** Monster, spell, or trap. Falls back to the printed type line when `kind` is missing. */
export function cardKind(card: CardInfo): CardKind {
  const kind = card.data.kind
  if (kind === 'monster' || kind === 'spell' || kind === 'trap') return kind
  const type = card.data.type?.toLowerCase() ?? ''
  if (type.includes('trap')) return 'trap'
  if (type.includes('spell')) return 'spell'
  return 'monster'
}

export function isFieldSpell(card: CardInfo): boolean {
  if (cardKind(card) !== 'spell') return false
  const race = card.data.race?.toLowerCase() ?? ''
  const type = card.data.type?.toLowerCase() ?? ''
  return race === 'field' || type.includes('field')
}

export function isPendulum(card: CardInfo): boolean {
  return card.data.type?.toLowerCase().includes('pendulum') ?? false
}

/** Most relevant plays for this card, in the order they should be offered. */
export function primaryPlays(card: CardInfo): PlayAction[] {
  const kind = cardKind(card)
  if (kind === 'monster') {
    const plays: PlayAction[] = [
      { label: 'Summon', icon: 'summon', zone: 'monster', faceUp: true, defense: false },
      { label: 'Set', icon: 'set', zone: 'monster', faceUp: false, defense: true },
      { label: 'Summon in DEF', icon: 'defense', zone: 'monster', faceUp: true, defense: true },
    ]
    if (isPendulum(card)) {
      plays.unshift({ label: 'Activate', icon: 'pendulum', zone: 'pendulum', faceUp: true, defense: false })
    }
    return plays
  }
  if (kind === 'trap') {
    return [
      { label: 'Set', icon: 'set', zone: 'spell', faceUp: false, defense: false },
      { label: 'Activate', icon: 'activate', zone: 'spell', faceUp: true, defense: false },
    ]
  }
  const zone: PlayZone = isFieldSpell(card) ? 'field' : 'spell'
  return [
    { label: 'Activate', icon: 'activate', zone, faceUp: true, defense: false },
    { label: 'Set', icon: 'set', zone, faceUp: false, defense: false },
  ]
}

/**
 * Zones this play can land on. Empty ones when any are free; every zone of that
 * row when they are all full, so the card can be stacked. Field spells only
 * ever offer the field zone.
 */
export function targetZoneKeys(owner: 'p1' | 'p2', zone: PlayZone, isEmpty: (key: string) => boolean): string[] {
  if (zone === 'field') return [`${owner}:field:0`]
  if (zone === 'pendulum') {
    const keys = [`${owner}:spell:0`, `${owner}:spell:4`]
    const empty = keys.filter(isEmpty)
    return empty.length > 0 ? empty : keys
  }
  const keys = Array.from({ length: 5 }, (_, i) => `${owner}:${zone}:${i}`)
  const empty = keys.filter(isEmpty)
  return empty.length > 0 ? empty : keys
}

/** Your monsters on the field. The extra monster zones are shared but count as yours for now. */
export function isAttacker(card: Card): boolean {
  const key = card.zoneKey ?? ''
  return key.startsWith('p1:monster:') || key.startsWith('shared:emz:')
}

/** Opponent monster zones that hold a card. Empty means a direct attack. */
export function attackTargetKeys(board: BoardState): string[] {
  return Array.from({ length: 5 }, (_, i) => `p2:monster:${i}`).filter((key) => board.cardsIn(key).length > 0)
}

/** Plays that don't match the card's kind. Still allowed, listed last. */
function otherPlays(card: CardInfo): PlayAction[] {
  const monster: PlayAction[] = [
    { label: 'Summon', icon: 'summon', zone: 'monster', faceUp: true, defense: false },
    { label: 'Summon in DEF', icon: 'defense', zone: 'monster', faceUp: true, defense: true },
    { label: 'Set as monster', icon: 'set', zone: 'monster', faceUp: false, defense: true },
  ]
  const spellTrap: PlayAction[] = [
    { label: 'Place in S/T zone', icon: 'activate', zone: 'spell', faceUp: true, defense: false },
    { label: 'Set in S/T zone', icon: 'set', zone: 'spell', faceUp: false, defense: false },
  ]
  if (cardKind(card) === 'monster') return spellTrap
  if (isFieldSpell(card)) return [...spellTrap, ...monster]
  return monster
}

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
  /** A card action finished: summon, move, position change, and the like. */
  onAction: () => void
  /** Summon, set, or activate: the player picks the zone. */
  requestTarget: (card: Card, action: PlayAction) => void
  /** True during the Battle phase. */
  inBattle: () => boolean
  /** Pick a target, or attack directly when the opponent has no monsters. */
  attack: (card: Card) => void
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

  /** Ask the player to click a zone for this play. */
  play(card: Card, action: PlayAction) {
    this.d.requestTarget(card, action)
  }

  /** Primary plays, then off-type plays, each group closed by a separator. */
  private playItems(card: Card): MenuItem[] {
    const item = (play: PlayAction): MenuItem => ({
      label: play.label,
      action: () => this.play(card, play),
    })
    return [
      ...primaryPlays(card).map(item),
      { separator: true },
      ...otherPlays(card).map(item),
      { separator: true },
    ]
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
    const from = this.d.hand.cards.includes(card) ? null : card.zoneKey
    this.release(card)
    card.faceUp = faceUp
    card.defense = defense
    this.d.board.place(card, key, 0.28, { from })
    this.d.onAction()
    this.d.onChange()
  }

  flip(card: Card) {
    card.faceUp = !card.faceUp
    this.relayout(card)
    this.d.onAction()
  }

  togglePosition(card: Card) {
    card.defense = !card.defense
    this.relayout(card)
    this.d.onAction()
  }

  setPosition(card: Card, faceUp: boolean, defense: boolean) {
    this.d.commit()
    card.faceUp = faceUp
    card.defense = defense
    this.relayout(card)
    this.d.onAction()
    this.d.onChange()
  }

  private relayout(card: Card) {
    if (card.zoneKey) this.d.board.layoutZone(card.zoneKey, 0.35)
  }

  toHand(card: Card) {
    this.d.commit()
    this.d.board.remove(card)
    this.d.hand.add(card, 0.4)
    this.d.onAction()
    this.d.onChange()
  }

  addCounter(card: Card, delta: number) {
    this.d.commit()
    card.setCounters(card.counters + delta)
    this.d.invalidate()
    this.d.onAction()
    this.d.onChange()
  }

  // ---- menus ----

  handItems(card: Card): MenuItem[] {
    const own: Owner = 'p1'
    return [
      ...this.playItems(card),
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
      ...this.playItems(card),
      { label: 'Add to hand', action: () => this.toHand(card) },
      { label: 'Send to GY', action: () => this.moveTo(card, `${own}:gy:0`, true, false) },
      { label: 'Banish', action: () => this.moveTo(card, `${own}:banished:0`, true, false) },
      { label: 'Banish face-down', action: () => this.moveTo(card, `${own}:banished:0`, false, false) },
      { label: 'Return to deck (top)', action: () => this.d.returnToDeck(card, 'top') },
      { label: 'Return to deck (bottom)', action: () => this.d.returnToDeck(card, 'bottom') },
      { label: 'Shuffle into deck', action: () => this.d.returnToDeck(card, 'shuffle') },
    ]
  }

  /**
   * Graveyard menu for a card that is still data in the deck.
   * `pull(true)` closes the dialog before the card is taken, so a shuffle snapshot
   * still contains it. Immediate moves pass false and take the card in place.
   */
  deckItems(data: CardData, pull: (closeFirst: boolean) => Card | null): MenuItem[] {
    const own: Owner = 'p1'
    const play = (action: PlayAction) => () => {
      const card = pull(true)
      if (card) this.play(card, action)
    }
    const act = (fn: (card: Card) => void) => () => {
      const card = pull(false)
      if (card) fn(card)
    }
    const info = { data }
    return [
      ...primaryPlays(info).map((action) => ({ label: action.label, action: play(action) })),
      { separator: true },
      ...otherPlays(info).map((action) => ({ label: action.label, action: play(action) })),
      { separator: true },
      { label: 'Add to hand', action: act((card) => this.toHand(card)) },
      { label: 'Send to GY', action: act((card) => this.moveTo(card, `${own}:gy:0`, true, false)) },
      { label: 'Banish', action: act((card) => this.moveTo(card, `${own}:banished:0`, true, false)) },
      { label: 'Banish face-down', action: act((card) => this.moveTo(card, `${own}:banished:0`, false, false)) },
      { label: 'Return to deck (top)', action: act((card) => this.d.returnToDeck(card, 'top')) },
      { label: 'Return to deck (bottom)', action: act((card) => this.d.returnToDeck(card, 'bottom')) },
      { label: 'Shuffle into deck', action: act((card) => this.d.returnToDeck(card, 'shuffle')) },
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
    if (type === 'spell' || type === 'field' || type === 'banished') {
      return [opt('Face up', true, false), opt('Face down', false, false)]
    }
    return []
  }

  boardItems(card: Card): MenuItem[] {
    const own = this.ownerOf(card)
    const isMonster = card.data.atk !== undefined
    const positions = this.positionItems(card)
    const battle: MenuItem[] =
      this.d.inBattle() && isAttacker(card)
        ? [
            {
              label: attackTargetKeys(this.d.board).length ? 'Attack' : 'Direct attack',
              action: () => this.d.attack(card),
            },
            { separator: true },
          ]
        : []
    return [
      ...battle,
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
