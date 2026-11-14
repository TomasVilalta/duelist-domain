import { describe, expect, it } from 'vitest'
import { apply as applyWith, type ApplyContext } from './apply'
import type { Action } from './actions'
import { createGame, type GameState } from './state'

const PENDULUM = 9000
const ctx: ApplyContext = { isPendulum: (p) => p === PENDULUM }
const apply = (state: GameState, action: Action) => applyWith(state, action, ctx)

function newGame(): GameState {
  return createGame({
    players: [
      { name: 'A', deck: { main: Array.from({ length: 10 }, (_, i) => 100 + i), extra: [PENDULUM, 7001, 7002] } },
      { name: 'B', deck: { main: Array.from({ length: 10 }, (_, i) => 200 + i), extra: [] } },
    ],
  })
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o)
    for (const v of Object.values(o)) deepFreeze(v)
  }
  return o
}

function run(state: GameState, action: Action): GameState {
  const r = apply(state, action)
  if (!r.ok) throw new Error(r.error)
  return r.state
}

/** State after seat 0 drew `n` cards. */
function drawn(n: number) {
  return run(newGame(), { type: 'draw', seat: 0, count: n })
}

describe('move', () => {
  it('moves a card from the hand to a monster zone', () => {
    const g = drawn(2)
    const uid = g.zones['s0:hand:0']![0]!
    const next = run(g, { type: 'move', seat: 0, uid, to: 's0:monster:0', faceUp: true, defense: false })
    expect(next.zones['s0:hand:0']).toHaveLength(1)
    expect(next.zones['s0:monster:0']).toEqual([uid])
    expect(next.cards[uid]).toMatchObject({ faceUp: true, defense: false })
  })

  it('stacks onto an occupied monster zone', () => {
    let g = drawn(2)
    const [a, b] = g.zones['s0:hand:0']!
    g = run(g, { type: 'move', seat: 0, uid: a!, to: 's0:monster:0', faceUp: true })
    g = run(g, { type: 'move', seat: 0, uid: b!, to: 's0:monster:0', faceUp: true })
    expect(g.zones['s0:monster:0']).toEqual([a, b])
  })

  it('puts a card on the bottom with index 0 and on top by default', () => {
    const g = drawn(2)
    const [a, b] = g.zones['s0:hand:0']!
    const bottom = run(g, { type: 'move', seat: 0, uid: a!, to: 's0:deck:0', index: 0 })
    expect(bottom.zones['s0:deck:0']![0]).toBe(a)
    const top = run(g, { type: 'move', seat: 0, uid: b!, to: 's0:deck:0' })
    expect(top.zones['s0:deck:0']!.at(-1)).toBe(b)
  })

  it('forces face-down in the deck and the hand', () => {
    let g = drawn(1)
    const uid = g.zones['s0:hand:0']![0]!
    g = run(g, { type: 'move', seat: 0, uid, to: 's0:monster:0', faceUp: true })
    for (const to of ['s0:deck:0', 's0:hand:0']) {
      const next = run(g, { type: 'move', seat: 0, uid, to, faceUp: true, defense: true })
      expect(next.cards[uid]).toMatchObject({ faceUp: false, defense: false })
    }
  })

  it('keeps Pendulum monsters face-up and on top of the extra deck', () => {
    let g = newGame()
    const extra = g.zones['s0:extra:0']!
    expect(g.cards[extra[0]!]).toMatchObject({ faceUp: false })
    g = run(g, { type: 'move', seat: 0, uid: extra[0]!, to: 's0:hand:0' })
    g = run(g, { type: 'move', seat: 0, uid: extra[0]!, to: 's0:extra:0', index: 0, faceUp: false })
    const list = g.zones['s0:extra:0']!
    expect(list.at(-1)).toBe(extra[0])
    expect(g.cards[extra[0]!]!.faceUp).toBe(true)
    expect(list.slice(0, -1).every((u) => !g.cards[u]!.faceUp)).toBe(true)
  })

  it('keeps face-up banished cards above face-down ones', () => {
    let g = drawn(2)
    const [a, b] = g.zones['s0:hand:0']!
    g = run(g, { type: 'move', seat: 0, uid: a!, to: 's0:banished:0', faceUp: true })
    g = run(g, { type: 'move', seat: 0, uid: b!, to: 's0:banished:0', faceUp: false })
    expect(g.zones['s0:banished:0']).toEqual([b, a])
  })

  it('rejects bad indexes and zones', () => {
    const g = drawn(1)
    const uid = g.zones['s0:hand:0']![0]!
    expect(apply(g, { type: 'move', seat: 0, uid, to: 's0:deck:0', index: 99 }).ok).toBe(false)
    expect(apply(g, { type: 'move', seat: 0, uid, to: 's0:nowhere:0' }).ok).toBe(false)
  })
})

describe('orientation and counters', () => {
  function onField() {
    let g = drawn(1)
    const uid = g.zones['s0:hand:0']![0]!
    g = run(g, { type: 'move', seat: 0, uid, to: 's0:monster:0', faceUp: true })
    return { g, uid }
  }

  it('flip toggles face-up', () => {
    const { g, uid } = onField()
    const down = run(g, { type: 'flip', seat: 0, uid })
    expect(down.cards[uid]!.faceUp).toBe(false)
    expect(run(down, { type: 'flip', seat: 0, uid }).cards[uid]!.faceUp).toBe(true)
  })

  it('setPosition sets face-down defense, and normalizes face-down attack', () => {
    const { g, uid } = onField()
    expect(run(g, { type: 'setPosition', seat: 0, uid, faceUp: false, defense: true }).cards[uid]).toMatchObject({ faceUp: false, defense: true })
    expect(run(g, { type: 'setPosition', seat: 0, uid, faceUp: false, defense: false }).cards[uid]).toMatchObject({ faceUp: false, defense: true })
  })

  it('flip and setPosition never turn a card face-up in the deck or hand', () => {
    const g = drawn(1)
    const inHand = g.zones['s0:hand:0']![0]!
    const inDeck = g.zones['s0:deck:0']![0]!
    for (const uid of [inHand, inDeck]) {
      expect(run(g, { type: 'flip', seat: 0, uid }).cards[uid]!.faceUp).toBe(false)
      expect(run(g, { type: 'setPosition', seat: 0, uid, faceUp: true, defense: true }).cards[uid]).toMatchObject({ faceUp: false, defense: false })
    }
  })

  it('addCounter never goes below 0, and counters reset in the graveyard', () => {
    const { g, uid } = onField()
    expect(run(g, { type: 'addCounter', seat: 0, uid, delta: -1 }).cards[uid]!.counters).toBe(0)
    const two = run(run(g, { type: 'addCounter', seat: 0, uid, delta: 1 }), { type: 'addCounter', seat: 0, uid, delta: 1 })
    expect(two.cards[uid]!.counters).toBe(2)
    expect(run(two, { type: 'move', seat: 0, uid, to: 's0:monster:1' }).cards[uid]!.counters).toBe(2)
    expect(run(two, { type: 'move', seat: 0, uid, to: 's0:gy:0' }).cards[uid]!.counters).toBe(0)
  })
})

describe('draw, mill and shuffle', () => {
  it('draws from the top of the deck, top card first', () => {
    const g = newGame()
    const deck = g.zones['s0:deck:0']!
    const next = run(g, { type: 'draw', seat: 0, count: 2 })
    expect(next.zones['s0:hand:0']).toEqual([deck.at(-1), deck.at(-2)])
    expect(next.zones['s0:deck:0']).toEqual(deck.slice(0, -2))
  })

  it('only draws from the acting seat deck', () => {
    const next = run(newGame(), { type: 'draw', seat: 1, count: 1 })
    expect(next.zones['s1:hand:0']).toHaveLength(1)
    expect(next.zones['s0:hand:0']).toHaveLength(0)
  })

  it('errors when the deck is too small, leaving the state unchanged', () => {
    const g = newGame()
    expect(apply(g, { type: 'draw', seat: 0, count: 11 }).ok).toBe(false)
    expect(apply(g, { type: 'draw', seat: 0, count: 0 }).ok).toBe(false)
    const empty = run(g, { type: 'draw', seat: 0, count: 10 })
    expect(apply(empty, { type: 'draw', seat: 0, count: 1 }).ok).toBe(false)
  })

  it('mills the top card face-up to the top of the graveyard', () => {
    const g = newGame()
    const top = g.zones['s0:deck:0']!.at(-1)!
    const next = run(g, { type: 'mill', seat: 0, count: 1 })
    expect(next.zones['s0:gy:0']).toEqual([top])
    expect(next.cards[top]!.faceUp).toBe(true)
  })

  it('shuffles with a valid permutation and rejects an invalid one', () => {
    const g = newGame()
    const deck = g.zones['s0:deck:0']!
    const order = [...deck].reverse()
    expect(run(g, { type: 'shuffle', seat: 0, zone: 's0:deck:0', order }).zones['s0:deck:0']).toEqual(order)
    expect(apply(g, { type: 'shuffle', seat: 0, zone: 's0:deck:0', order: deck.slice(1) }).ok).toBe(false)
    expect(apply(g, { type: 'shuffle', seat: 0, zone: 's0:deck:0', order: [...deck.slice(1), 'c999'] }).ok).toBe(false)
    expect(apply(g, { type: 'shuffle', seat: 0, zone: 's0:deck:0', order: [...deck.slice(1), deck[1]!] }).ok).toBe(false)
  })
})

describe('life points, phases and turns', () => {
  it('setLP clamps at 0', () => {
    const next = run(newGame(), { type: 'setLP', seat: 0, target: 1, lp: -300 })
    expect(next.seats[1]!.lp).toBe(0)
    expect(next.seats[0]!.lp).toBe(8000)
  })

  it('setPhase validates the phase', () => {
    expect(run(newGame(), { type: 'setPhase', seat: 0, phase: 3 }).phase).toBe(3)
    expect(apply(newGame(), { type: 'setPhase', seat: 0, phase: 6 }).ok).toBe(false)
  })

  it('endTurn advances the turn, rotates seats, resets the phase and clears the attack', () => {
    let g = drawn(1)
    const uid = g.zones['s0:hand:0']![0]!
    g = run(g, { type: 'move', seat: 0, uid, to: 's0:monster:0', faceUp: true })
    g = run(g, { type: 'setPhase', seat: 0, phase: 3 })
    g = run(g, { type: 'declareAttack', seat: 0, attacker: uid, target: null })
    g = run(g, { type: 'endTurn', seat: 0 })
    expect(g).toMatchObject({ turn: 2, activeSeat: 1, phase: 0, attack: null })
    expect(run(g, { type: 'endTurn', seat: 1 }).activeSeat).toBe(0)
  })

  it('endTurn rotates through four seats', () => {
    let g = createGame({ players: [0, 1, 2, 3].map((i) => ({ name: `P${i}`, deck: { main: [], extra: [] } })) })
    const seen: number[] = []
    for (let i = 0; i < 5; i++) {
      g = run(g, { type: 'endTurn', seat: g.activeSeat })
      seen.push(g.activeSeat)
    }
    expect(seen).toEqual([1, 2, 3, 0, 1])
  })

  it('declareAttack sets and clearAttack clears', () => {
    let g = drawn(2)
    const [a, b] = g.zones['s0:hand:0']!
    g = run(g, { type: 'move', seat: 0, uid: a!, to: 's0:monster:0', faceUp: true })
    g = run(g, { type: 'move', seat: 0, uid: b!, to: 'shared:emz:0', faceUp: true })
    const declared = run(g, { type: 'declareAttack', seat: 0, attacker: a!, target: b! })
    expect(declared.attack).toEqual({ attacker: a, target: b })
    expect(run(g, { type: 'declareAttack', seat: 0, attacker: a!, target: null }).attack).toEqual({ attacker: a, target: null })
    expect(run(declared, { type: 'clearAttack', seat: 0 }).attack).toBeNull()
    expect(apply(g, { type: 'declareAttack', seat: 0, attacker: 'nope', target: null }).ok).toBe(false)
  })

  it('declareAttack needs the attacker and target in a monster zone', () => {
    let g = drawn(2)
    const [a, b] = g.zones['s0:hand:0']!
    const deckCard = g.zones['s0:deck:0']![0]!
    expect(apply(g, { type: 'declareAttack', seat: 0, attacker: deckCard, target: null }).ok).toBe(false)
    expect(apply(g, { type: 'declareAttack', seat: 0, attacker: a!, target: null }).ok).toBe(false)
    g = run(g, { type: 'move', seat: 0, uid: a!, to: 's0:monster:0', faceUp: true })
    expect(apply(g, { type: 'declareAttack', seat: 0, attacker: a!, target: b! }).ok).toBe(false)
  })
})

describe('purity and errors', () => {
  it('unknown cards and seats return an error', () => {
    const g = newGame()
    for (const a of [
      { type: 'move', seat: 0, uid: 'nope', to: 's0:hand:0' },
      { type: 'flip', seat: 0, uid: 'nope' },
      { type: 'setPosition', seat: 0, uid: 'nope', faceUp: true, defense: false },
      { type: 'addCounter', seat: 0, uid: 'nope', delta: 1 },
      { type: 'setLP', seat: 0, target: 9, lp: 1 },
      { type: 'draw', seat: 7, count: 1 },
    ] satisfies Action[]) {
      expect(apply(g, a).ok).toBe(false)
    }
  })

  it('never mutates its input, for every action type', () => {
    let base = drawn(2)
    const [a, b] = base.zones['s0:hand:0']!
    base = run(base, { type: 'move', seat: 0, uid: a!, to: 's0:monster:0', faceUp: true })
    base = run(base, { type: 'move', seat: 0, uid: b!, to: 's0:monster:1', faceUp: true })
    const deck = base.zones['s0:deck:0']!
    const actions: Action[] = [
      { type: 'move', seat: 0, uid: a!, to: 's0:monster:0', faceUp: true },
      { type: 'flip', seat: 0, uid: a! },
      { type: 'setPosition', seat: 0, uid: a!, faceUp: true, defense: true },
      { type: 'addCounter', seat: 0, uid: a!, delta: 1 },
      { type: 'draw', seat: 0, count: 1 },
      { type: 'mill', seat: 0, count: 1 },
      { type: 'shuffle', seat: 0, zone: 's0:deck:0', order: [...deck].reverse() },
      { type: 'setLP', seat: 0, target: 0, lp: 100 },
      { type: 'setPhase', seat: 0, phase: 2 },
      { type: 'endTurn', seat: 0 },
      { type: 'declareAttack', seat: 0, attacker: a!, target: b! },
      { type: 'clearAttack', seat: 0 },
    ]
    const frozen = deepFreeze(structuredClone(base))
    for (const action of actions) {
      expect(apply(frozen, action).ok).toBe(true)
    }
    expect(frozen).toEqual(base)
  })

  it('keeps every uid in exactly one zone over 500 random actions', () => {
    let seed = 12345
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed % n
    }
    let g = newGame()
    const uids = Object.keys(g.cards)
    const zones = Object.keys(g.zones)
    for (let i = 0; i < 500; i++) {
      const uid = uids[rnd(uids.length)]!
      const to = zones[rnd(zones.length)]!
      const action: Action =
        rnd(4) === 0
          ? { type: 'flip', seat: 0, uid }
          : { type: 'move', seat: 0, uid, to, faceUp: rnd(2) === 0, defense: rnd(2) === 0 }
      const r = apply(g, action)
      if (r.ok) g = r.state
    }
    const all = Object.values(g.zones).flat()
    expect(all).toHaveLength(uids.length)
    expect(new Set(all).size).toBe(uids.length)
  })
})
