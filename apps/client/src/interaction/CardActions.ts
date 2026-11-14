import { findCard, parseZoneKey, zoneKey, type Action, type CardKind, type GameState, type Seat, type ZoneType } from '@duelist/shared'
import type { Card } from '@/cards/Card'
import type { CardData } from '@/data/demoDeck'
import type { MenuItem } from '@/ui/ContextMenu'

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
export function targetZoneKeys(owner: Seat, zone: PlayZone, isEmpty: (key: string) => boolean): string[] {
  if (zone === 'field') return [`s${owner}:field:0`]
  if (zone === 'pendulum') {
    const keys = [`s${owner}:spell:0`, `s${owner}:spell:4`]
    const empty = keys.filter(isEmpty)
    return empty.length > 0 ? empty : keys
  }
  const keys = Array.from({ length: 5 }, (_, i) => `s${owner}:${zone}:${i}`)
  const empty = keys.filter(isEmpty)
  return empty.length > 0 ? empty : keys
}

/** `seat`'s monsters on the field. The extra monster zones are shared but count as yours for now. */
export function isAttacker(game: GameState, uid: string, seat: Seat): boolean {
  const at = findCard(game, uid)
  const id = at ? parseZoneKey(at.key) : null
  return !!id && ((id.type === 'monster' && id.owner === seat) || id.type === 'emz')
}

/** The seat that `seat` attacks. */
export function opponentOf(game: GameState, seat: Seat): Seat {
  return (seat + 1) % game.seats.length
}

/** Every monster zone of the opponent, in order. */
export function opposingMonsterKeys(game: GameState, seat: Seat): string[] {
  const owner = opponentOf(game, seat)
  return Array.from({ length: 5 }, (_, i) => zoneKey({ owner, type: 'monster', index: i }))
}

/** Opponent monster zones that hold a card. Empty means a direct attack. */
export function attackTargetKeys(game: GameState, seat: Seat): string[] {
  return opposingMonsterKeys(game, seat).filter((key) => (game.zones[key]?.length ?? 0) > 0)
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
  game: () => GameState
  dispatch: (action: Action) => void
  /** Several actions as a single undo step. */
  dispatchAll: (actions: Action[]) => void
  localSeat: () => Seat
  /** A random order for a shuffle. The client chooses it for now. */
  shuffled: (uids: string[]) => string[]
  editStats: (uid: string) => void
  /** Close the pile dialog, which shuffles the deck if it was the deck dialog. */
  closeViewer: () => void
  /** A card action finished: summon, move, position change, and the like. */
  onAction: () => void
  /** Summon, set, or activate: the player picks the zone. */
  requestTarget: (uid: string, action: PlayAction) => void
  /** True during the Battle phase. */
  inBattle: () => boolean
  /** Pick a target, or attack directly when the opponent has no monsters. */
  attack: (uid: string) => void
}

/** Where a card is, and the seat that owns that zone (the local seat for shared zones). */
export function locate(game: GameState, uid: string, local: Seat) {
  const at = findCard(game, uid)
  const id = at ? parseZoneKey(at.key) : null
  return { key: at?.key ?? null, type: id?.type, owner: typeof id?.owner === 'number' ? id.owner : local }
}

/** Manual card actions. Nothing is validated: every action is always allowed. Each one dispatches to the game store. */
export class CardActions {
  private d: Deps

  constructor(deps: Deps) {
    this.d = deps
  }

  private get seat() {
    return this.d.localSeat()
  }

  private zone(owner: Seat, type: ZoneType) {
    return zoneKey({ owner, type, index: 0 })
  }

  /** Ask the player to click a zone for this play. */
  play(uid: string, action: PlayAction) {
    this.d.requestTarget(uid, action)
  }

  /** Primary plays, then off-type plays, each group closed by a separator. */
  private playItems(card: CardInfo, uid: string): MenuItem[] {
    const item = (play: PlayAction): MenuItem => ({
      label: play.label,
      action: () => this.play(uid, play),
    })
    return [
      ...primaryPlays(card).map(item),
      { separator: true },
      ...otherPlays(card).map(item),
      { separator: true },
    ]
  }

  moveTo(uid: string, key: string, faceUp: boolean, defense: boolean) {
    this.d.dispatch({ type: 'move', seat: this.seat, uid, to: key, faceUp, defense })
    this.d.onAction()
  }

  flip(uid: string) {
    this.d.dispatch({ type: 'flip', seat: this.seat, uid })
    this.d.onAction()
  }

  togglePosition(uid: string) {
    const card = this.d.game().cards[uid]
    if (!card) return
    this.setPosition(uid, card.faceUp, !card.defense)
  }

  setPosition(uid: string, faceUp: boolean, defense: boolean) {
    this.d.dispatch({ type: 'setPosition', seat: this.seat, uid, faceUp, defense })
    this.d.onAction()
  }

  toHand(uid: string) {
    this.moveTo(uid, this.zone(this.seat, 'hand'), false, false)
  }

  addCounter(uid: string, delta: number) {
    this.d.dispatch({ type: 'addCounter', seat: this.seat, uid, delta })
    this.d.onAction()
  }

  /** Put a card back into the local deck: on top, on the bottom, or shuffled in. */
  returnToDeck(uid: string, pos: DeckPos) {
    const seat = this.seat
    const key = this.zone(seat, 'deck')
    const to = { type: 'move', seat, uid, to: key, faceUp: false, defense: false } as const
    if (pos === 'bottom') {
      this.d.dispatch({ ...to, index: 0 })
    } else if (pos === 'top') {
      this.d.dispatch(to)
    } else {
      // Move on top, then shuffle the new pile: one undo step.
      const pile = (this.d.game().zones[key] ?? []).filter((u) => u !== uid)
      // TODO(server): the server will choose the order.
      this.d.dispatchAll([to, { type: 'shuffle', seat, zone: key, order: this.d.shuffled([...pile, uid]) }])
    }
    this.d.onAction()
  }

  // ---- menus ----

  handItems(card: Card): MenuItem[] {
    const uid = card.uid
    const own = this.seat
    return [
      ...this.playItems(card, uid),
      { label: 'Send to GY', action: () => this.moveTo(uid, this.zone(own, 'gy'), true, false) },
      { label: 'Banish', action: () => this.moveTo(uid, this.zone(own, 'banished'), true, false) },
      { label: 'Banish face-down', action: () => this.moveTo(uid, this.zone(own, 'banished'), false, false) },
      { label: 'Return to deck (top)', action: () => this.returnToDeck(uid, 'top') },
      { label: 'Shuffle into deck', action: () => this.returnToDeck(uid, 'shuffle') },
    ]
  }

  pileItems(card: Card): MenuItem[] {
    const uid = card.uid
    const own = this.seat
    return [
      ...this.playItems(card, uid),
      { label: 'Add to hand', action: () => this.toHand(uid) },
      { label: 'Send to GY', action: () => this.moveTo(uid, this.zone(own, 'gy'), true, false) },
      { label: 'Banish', action: () => this.moveTo(uid, this.zone(own, 'banished'), true, false) },
      { label: 'Banish face-down', action: () => this.moveTo(uid, this.zone(own, 'banished'), false, false) },
      { label: 'Return to deck (top)', action: () => this.returnToDeck(uid, 'top') },
      { label: 'Return to deck (bottom)', action: () => this.returnToDeck(uid, 'bottom') },
      { label: 'Shuffle into deck', action: () => this.returnToDeck(uid, 'shuffle') },
    ]
  }

  /**
   * Menu for a card that is still in the deck (it has no mesh). Plays close the dialog first,
   * which shuffles the deck, and then wait for a zone. Moves happen in place.
   */
  deckItems(uid: string, data: CardData): MenuItem[] {
    const own = this.seat
    const play = (action: PlayAction) => () => {
      this.d.closeViewer()
      this.play(uid, action)
    }
    const info = { data }
    return [
      ...primaryPlays(info).map((action) => ({ label: action.label, action: play(action) })),
      { separator: true },
      ...otherPlays(info).map((action) => ({ label: action.label, action: play(action) })),
      { separator: true },
      { label: 'Add to hand', action: () => this.toHand(uid) },
      { label: 'Send to GY', action: () => this.moveTo(uid, this.zone(own, 'gy'), true, false) },
      { label: 'Banish', action: () => this.moveTo(uid, this.zone(own, 'banished'), true, false) },
      { label: 'Banish face-down', action: () => this.moveTo(uid, this.zone(own, 'banished'), false, false) },
      { label: 'Return to deck (top)', action: () => this.returnToDeck(uid, 'top') },
      { label: 'Return to deck (bottom)', action: () => this.returnToDeck(uid, 'bottom') },
      { label: 'Shuffle into deck', action: () => this.returnToDeck(uid, 'shuffle') },
    ]
  }

  private positionItems(uid: string): MenuItem[] {
    const game = this.d.game()
    const state = game.cards[uid]
    const type = locate(game, uid, this.seat).type
    if (!state) return []
    const opt = (label: string, faceUp: boolean, defense: boolean): MenuItem => ({
      label,
      disabled: state.faceUp === faceUp && state.defense === defense,
      action: () => this.setPosition(uid, faceUp, defense),
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
    const uid = card.uid
    const game = this.d.game()
    const own = locate(game, uid, this.seat).owner
    const isMonster = card.data.atk !== undefined
    const positions = this.positionItems(uid)
    const battle: MenuItem[] =
      this.d.inBattle() && isAttacker(game, uid, this.seat)
        ? [
            {
              label: attackTargetKeys(game, this.seat).length ? 'Attack' : 'Direct attack',
              action: () => this.d.attack(uid),
            },
            { separator: true },
          ]
        : []
    return [
      ...battle,
      ...positions,
      ...(positions.length ? [{ separator: true }] : []),
      { label: 'Send to GY', action: () => this.moveTo(uid, this.zone(own, 'gy'), true, false) },
      { label: 'Banish', action: () => this.moveTo(uid, this.zone(own, 'banished'), true, false) },
      { label: 'Banish face-down', action: () => this.moveTo(uid, this.zone(own, 'banished'), false, false) },
      { separator: true },
      { label: 'Return to hand', action: () => this.toHand(uid) },
      { label: 'Return to deck (top)', action: () => this.returnToDeck(uid, 'top') },
      { label: 'Return to deck (bottom)', action: () => this.returnToDeck(uid, 'bottom') },
      { label: 'Shuffle into deck', action: () => this.returnToDeck(uid, 'shuffle') },
      { separator: true },
      { label: 'Edit ATK/DEF…', disabled: !isMonster, action: () => this.d.editStats(uid) },
      { label: 'Add counter', action: () => this.addCounter(uid, 1) },
      { label: 'Remove counter', disabled: (game.cards[uid]?.counters ?? 0) === 0, action: () => this.addCounter(uid, -1) },
    ]
  }
}
