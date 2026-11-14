import { describe, expect, it } from 'vitest'
import {
  ZONE_TYPES,
  createGame,
  findCard,
  parseZoneKey,
  zoneKey,
  zonesOf,
  type GameState,
  type ZoneId,
} from './state'

const main = (n: number, base = 1000) => Array.from({ length: n }, (_, i) => base + i)

function newGame(): GameState {
  return createGame({
    players: [
      { name: 'A', deck: { main: main(40), extra: main(5, 5000) } },
      { name: 'B', deck: { main: main(40, 2000), extra: main(5, 6000) } },
    ],
  })
}

describe('zone keys', () => {
  it('round-trips every zone type', () => {
    for (const type of ZONE_TYPES) {
      const owner = type === 'emz' ? 'shared' : 1
      const id: ZoneId = { owner, type, index: 3 }
      expect(parseZoneKey(zoneKey(id))).toEqual(id)
    }
    expect(parseZoneKey('shared:emz:1')).toEqual({ owner: 'shared', type: 'emz', index: 1 })
    expect(zoneKey({ owner: 0, type: 'monster', index: 2 })).toBe('s0:monster:2')
  })

  it('returns null for invalid keys', () => {
    expect(parseZoneKey('garbage')).toBeNull()
    expect(parseZoneKey('p1:monster:0')).toBeNull()
    expect(parseZoneKey('s0:moon:0')).toBeNull()
    expect(parseZoneKey('s0:monster')).toBeNull()
  })
})

describe('createGame', () => {
  it('fills the deck and extra deck and leaves other zones empty', () => {
    const g = newGame()
    for (const seat of [0, 1]) {
      expect(g.zones[`s${seat}:deck:0`]).toHaveLength(40)
      expect(g.zones[`s${seat}:extra:0`]).toHaveLength(5)
      for (const key of zonesOf(seat)) {
        if (!key.includes(':deck:') && !key.includes(':extra:')) expect(g.zones[key]).toEqual([])
      }
    }
    expect(g.zones['shared:emz:0']).toEqual([])
    expect(g.zones['shared:emz:1']).toEqual([])
  })

  it('sets the starting values', () => {
    const g = newGame()
    expect(g.seats).toEqual([
      { name: 'A', lp: 8000 },
      { name: 'B', lp: 8000 },
    ])
    expect(g).toMatchObject({ turn: 1, phase: 0, activeSeat: 0, attack: null })
    expect(Object.values(g.cards).every((c) => !c.faceUp && !c.defense && c.counters === 0)).toBe(true)
  })

  it('puts every uid in exactly one zone, with unique uids across seats', () => {
    const g = newGame()
    const all = Object.values(g.zones).flat()
    expect(all).toHaveLength(90)
    expect(new Set(all).size).toBe(90)
    expect(Object.keys(g.cards).sort()).toEqual([...all].sort())
    for (const [key, list] of Object.entries(g.zones)) {
      for (const uid of list) expect(`s${g.cards[uid]!.owner}`).toBe(key.split(':')[0])
    }
  })

  it('supports more than two seats', () => {
    const g = createGame({
      players: [0, 1, 2, 3].map((i) => ({ name: `P${i}`, deck: { main: main(3), extra: [] } })),
    })
    expect(g.seats).toHaveLength(4)
    expect(g.zones['s3:deck:0']).toHaveLength(3)
  })

  it('survives a JSON and structuredClone round-trip', () => {
    const g = newGame()
    expect(JSON.parse(JSON.stringify(g))).toEqual(g)
    expect(structuredClone(g)).toEqual(g)
  })
})

describe('findCard', () => {
  it('returns the zone and index', () => {
    const g = newGame()
    const uid = g.zones['s1:extra:0']![2]!
    expect(findCard(g, uid)).toEqual({ key: 's1:extra:0', index: 2 })
  })

  it('returns null for an unknown uid', () => {
    expect(findCard(newGame(), 'nope')).toBeNull()
  })
})
