import type { Action } from './actions'
import { PHASES, parseZoneKey, findCard, zoneKey, type GameState, type ZoneType } from './state'
import { legalOrientation } from './zones'

export type ApplyResult = { ok: true; state: GameState } | { ok: false; error: string }

export interface ApplyContext {
  /** Pendulum monsters stay face-up in the extra deck. Defaults to "never". */
  isPendulum?: (passcode: number) => boolean
}

const FIELD_ZONES: readonly ZoneType[] = ['monster', 'spell', 'field', 'emz']

class Invalid extends Error {}

function fail(message: string): never {
  throw new Invalid(message)
}

/** Draft that copies a card or zone list the first time it is changed, so the input is never mutated. */
class Draft {
  readonly state: GameState
  private cardsCopied = new Set<string>()
  private zonesCopied = new Set<string>()

  constructor(base: GameState) {
    this.state = { ...base, seats: base.seats, cards: { ...base.cards }, zones: { ...base.zones } }
  }

  card(uid: string) {
    const card = this.state.cards[uid] ?? fail(`unknown card ${uid}`)
    if (!this.cardsCopied.has(uid)) {
      this.cardsCopied.add(uid)
      this.state.cards[uid] = { ...card }
    }
    return this.state.cards[uid]!
  }

  zone(key: string) {
    const list = this.state.zones[key] ?? fail(`unknown zone ${key}`)
    if (!this.zonesCopied.has(key)) {
      this.zonesCopied.add(key)
      this.state.zones[key] = [...list]
    }
    return this.state.zones[key]!
  }

  seat(seat: number) {
    if (!this.state.seats[seat]) fail(`unknown seat ${seat}`)
  }
}

function zoneType(key: string): ZoneType {
  return parseZoneKey(key)?.type ?? fail(`invalid zone ${key}`)
}

/** Put a card in its legal orientation for the zone it is in, and keep face-up cards above face-down ones where that matters. */
function settle(d: Draft, key: string, ctx: ApplyContext) {
  const type = zoneType(key)
  const list = d.zone(key)
  if (type === 'extra') {
    for (const uid of list) {
      const card = d.card(uid)
      card.faceUp = ctx.isPendulum?.(card.passcode) ?? false
      card.defense = false
    }
  }
  if (type === 'extra' || type === 'banished') {
    list.sort((a, b) => Number(d.state.cards[a]!.faceUp) - Number(d.state.cards[b]!.faceUp))
  }
}

function placeCard(d: Draft, uid: string, to: string, ctx: ApplyContext, opts: { index?: number; faceUp?: boolean; defense?: boolean }) {
  const from = findCard(d.state, uid) ?? fail(`card ${uid} is not in any zone`)
  if (!d.state.zones[to]) fail(`unknown zone ${to}`)
  const toType = zoneType(to)
  d.zone(from.key).splice(from.index, 1)
  const dest = d.zone(to)
  const index = opts.index ?? dest.length
  if (!Number.isInteger(index) || index < 0 || index > dest.length) fail(`index ${index} out of range for ${to}`)
  dest.splice(index, 0, uid)

  const card = d.card(uid)
  const pose = legalOrientation(toType, opts.faceUp ?? card.faceUp, opts.defense ?? card.defense)
  card.faceUp = pose.faceUp
  card.defense = pose.defense
  if (toType === 'deck' || toType === 'hand') {
    card.faceUp = false
    card.defense = false
  }
  if (!FIELD_ZONES.includes(toType)) card.counters = 0
  settle(d, from.key, ctx)
  settle(d, to, ctx)
}

function handle(d: Draft, a: Action, ctx: ApplyContext) {
  d.seat(a.seat)
  const s = d.state
  switch (a.type) {
    case 'move':
      placeCard(d, a.uid, a.to, ctx, a)
      return
    case 'flip': {
      const at = findCard(s, a.uid) ?? fail(`card ${a.uid} is not in any zone`)
      const card = d.card(a.uid)
      const pose = legalOrientation(zoneType(at.key), !card.faceUp, card.defense)
      card.faceUp = pose.faceUp
      card.defense = pose.defense
      settle(d, at.key, ctx)
      return
    }
    case 'setPosition': {
      const at = findCard(s, a.uid) ?? fail(`card ${a.uid} is not in any zone`)
      const card = d.card(a.uid)
      const pose = legalOrientation(zoneType(at.key), a.faceUp, a.defense)
      card.faceUp = pose.faceUp
      card.defense = pose.defense
      settle(d, at.key, ctx)
      return
    }
    case 'addCounter': {
      if (!Number.isInteger(a.delta)) fail('delta must be an integer')
      const card = d.card(a.uid)
      card.counters = Math.max(0, card.counters + a.delta)
      return
    }
    case 'draw':
    case 'mill': {
      if (!Number.isInteger(a.count) || a.count < 1) fail('count must be a positive integer')
      const deckKey = zoneKey({ owner: a.seat, type: 'deck', index: 0 })
      const deck = s.zones[deckKey] ?? fail(`unknown zone ${deckKey}`)
      if (deck.length < a.count) fail(`deck has ${deck.length} cards, cannot ${a.type} ${a.count}`)
      const to = zoneKey({ owner: a.seat, type: a.type === 'draw' ? 'hand' : 'gy', index: 0 })
      const taken = deck.slice(deck.length - a.count).reverse()
      for (const uid of taken) placeCard(d, uid, to, ctx, a.type === 'mill' ? { faceUp: true } : {})
      return
    }
    case 'shuffle': {
      const current = s.zones[a.zone] ?? fail(`unknown zone ${a.zone}`)
      const sorted = [...current].sort()
      const given = [...a.order].sort()
      if (sorted.length !== given.length || sorted.some((uid, i) => uid !== given[i])) {
        fail('order is not a permutation of the zone')
      }
      s.zones[a.zone] = [...a.order]
      return
    }
    case 'setLP': {
      d.seat(a.target)
      if (!Number.isFinite(a.lp)) fail('lp must be a number')
      s.seats = s.seats.map((p, i) => (i === a.target ? { ...p, lp: Math.max(0, Math.round(a.lp)) } : p))
      return
    }
    case 'setPhase': {
      if (!Number.isInteger(a.phase) || a.phase < 0 || a.phase >= PHASES.length) fail(`invalid phase ${a.phase}`)
      s.phase = a.phase
      return
    }
    case 'endTurn':
      s.turn += 1
      s.activeSeat = (s.activeSeat + 1) % s.seats.length
      s.phase = 0
      s.attack = null
      return
    case 'declareAttack': {
      if (!s.cards[a.attacker]) fail(`unknown card ${a.attacker}`)
      if (a.target !== null && !s.cards[a.target]) fail(`unknown card ${a.target}`)
      s.attack = { attacker: a.attacker, target: a.target }
      return
    }
    case 'clearAttack':
      s.attack = null
      return
    default: {
      const never: never = a
      fail(`unknown action ${JSON.stringify(never)}`)
    }
  }
}

/**
 * Returns a new state with the action applied. The input is never changed.
 * An invalid action returns `{ ok: false }` and has no effect. Permissions (whose card it is) are not checked here.
 */
export function apply(state: GameState, action: Action, ctx: ApplyContext = {}): ApplyResult {
  const draft = new Draft(state)
  try {
    handle(draft, action, ctx)
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message }
    throw e
  }
  return { ok: true, state: draft.state }
}
