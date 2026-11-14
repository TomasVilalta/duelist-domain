import type { Seat } from './seat'

export const PHASES = ['Draw', 'Standby', 'Main 1', 'Battle', 'Main 2', 'End'] as const
/** Index into PHASES. */
export type Phase = number

export const START_LP = 8000

export type ZoneType = 'monster' | 'spell' | 'field' | 'gy' | 'deck' | 'extra' | 'banished' | 'hand' | 'emz'

/** Owner of a zone: a seat, or `shared` for the Extra Monster Zones. */
export interface ZoneId {
  owner: Seat | 'shared'
  type: ZoneType
  index: number
}

export const ZONE_TYPES: readonly ZoneType[] = ['monster', 'spell', 'field', 'gy', 'deck', 'extra', 'banished', 'hand', 'emz']

/** Zones per seat and how many slots of each exist. */
const SEAT_ZONES: readonly [ZoneType, number][] = [
  ['hand', 1],
  ['deck', 1],
  ['extra', 1],
  ['monster', 5],
  ['spell', 5],
  ['field', 1],
  ['gy', 1],
  ['banished', 1],
]
const EMZ_COUNT = 2

export interface CardState {
  uid: string
  passcode: number
  owner: Seat
  faceUp: boolean
  defense: boolean
  counters: number
}

export interface PlayerState {
  name: string
  lp: number
}

export interface GameState {
  seats: PlayerState[]
  cards: Record<string, CardState>
  /** Zone key to card uids, ordered bottom to top. The last uid is the top of a pile. */
  zones: Record<string, string[]>
  turn: number
  phase: Phase
  activeSeat: Seat
  attack: { attacker: string; target: string | null } | null
}

/** `s0:monster:2`, `s1:hand:0`, `shared:emz:1`. */
export function zoneKey(id: ZoneId): string {
  const owner = id.owner === 'shared' ? 'shared' : `s${id.owner}`
  return `${owner}:${id.type}:${id.index}`
}

/** Returns null when the key is not a valid zone key. */
export function parseZoneKey(key: string): ZoneId | null {
  const m = /^(shared|s(\d+)):([a-z]+):(\d+)$/.exec(key)
  if (!m) return null
  const type = m[3] as ZoneType
  if (!ZONE_TYPES.includes(type)) return null
  const owner = m[1] === 'shared' ? 'shared' : Number(m[2])
  return { owner, type, index: Number(m[4]) }
}

/** Every zone key a seat owns. */
export function zonesOf(seat: Seat): string[] {
  const keys: string[] = []
  for (const [type, count] of SEAT_ZONES) {
    for (let index = 0; index < count; index++) keys.push(zoneKey({ owner: seat, type, index }))
  }
  return keys
}

/** The Extra Monster Zones, which belong to no seat. */
export function sharedZones(): string[] {
  return Array.from({ length: EMZ_COUNT }, (_, index) => zoneKey({ owner: 'shared', type: 'emz', index }))
}

export function findCard(state: GameState, uid: string): { key: string; index: number } | null {
  for (const [key, list] of Object.entries(state.zones)) {
    const index = list.indexOf(uid)
    if (index >= 0) return { key, index }
  }
  return null
}

export interface DeckList {
  /** Passcodes, in deck order. The caller decides what is main and what is extra. */
  main: number[]
  extra: number[]
}

export interface NewGame {
  players: { name: string; deck: DeckList }[]
}

/**
 * Builds a fresh game: decks face-down in `deck`/`extra`, LP at 8000, turn 1, seat 0 to play.
 * Cards are not shuffled here. The caller dispatches a `shuffle` action so randomness stays outside the core.
 */
export function createGame({ players }: NewGame): GameState {
  const zones: Record<string, string[]> = {}
  for (let seat = 0; seat < players.length; seat++) {
    for (const key of zonesOf(seat)) zones[key] = []
  }
  for (const key of sharedZones()) zones[key] = []

  const cards: Record<string, CardState> = {}
  let next = 1
  const add = (owner: Seat, passcode: number, zone: ZoneType) => {
    const uid = `c${next++}`
    cards[uid] = { uid, passcode, owner, faceUp: false, defense: false, counters: 0 }
    zones[zoneKey({ owner, type: zone, index: 0 })]!.push(uid)
  }
  players.forEach((p, seat) => {
    for (const passcode of p.deck.main) add(seat, passcode, 'deck')
    for (const passcode of p.deck.extra) add(seat, passcode, 'extra')
  })

  return {
    seats: players.map((p) => ({ name: p.name, lp: START_LP })),
    cards,
    zones,
    turn: 1,
    phase: 0,
    activeSeat: 0,
    attack: null,
  }
}
