import { describe, expect, it } from 'vitest'
import { apply, createGame, parseZoneKey, type Action, type GameState } from '@duelist/shared'
import { reconcile, type Layout, type Mode, type Op } from './reconcile'

const ctx = { isPendulum: () => false }

/** A fake view layout: remembers where each uid was last placed, like `BoardView` does. */
class FakeLayout implements Layout {
  placed = new Map<string, string>()
  where(uid: string) {
    return this.placed.get(uid) ?? null
  }
  rendered(key: string) {
    const type = parseZoneKey(key)?.type
    return type !== 'deck' && !key.startsWith('s1:hand')
  }
  /** Applies the plan the way the real view does. */
  run(prev: GameState | null, next: GameState, mode: Mode = 'animate') {
    const plan = reconcile(prev, next, this, mode)
    for (const op of plan.ops) if (op.op === 'place') this.placed.set(op.uid, op.key)
    // views for cards that left every rendered zone are disposed
    for (const uid of [...this.placed.keys()]) {
      const at = Object.entries(next.zones).find(([, l]) => l.includes(uid))?.[0]
      if (!at || !this.rendered(at)) this.placed.delete(uid)
    }
    return plan
  }
}

function start() {
  const deck = { main: Array.from({ length: 10 }, (_, i) => 100 + i), extra: [900, 901] }
  let game = createGame({ players: [{ name: 'A', deck }, { name: 'B', deck }] })
  const layout = new FakeLayout()
  layout.run(null, game, 'jump')
  const step = (a: Action, mode: Mode = 'animate') => {
    const r = apply(game, a, ctx)
    if (!r.ok) throw new Error(r.error)
    const prev = game
    game = r.state
    return { prev, next: game, plan: layout.run(prev, game, mode) }
  }
  return { layout, step, game: () => game }
}

const places = (ops: Op[]) => ops.filter((o) => o.op === 'place')

describe('reconcile', () => {
  it('places the extra deck cards on first sync and counts the decks', () => {
    const layout = new FakeLayout()
    const deck = { main: [1, 2, 3], extra: [9, 8] }
    const game = createGame({ players: [{ name: 'A', deck }, { name: 'B', deck }] })
    const plan = reconcile(null, game, layout, 'jump')
    expect(places(plan.ops).map((o) => o.op === 'place' && o.key)).toEqual(['s0:extra:0', 's0:extra:0', 's1:extra:0', 's1:extra:0'])
    expect(plan.deckCounts).toEqual({ 's0:deck:0': 3, 's1:deck:0': 3 })
    expect(plan.ops.every((o) => o.op === 'place' && !o.landing)).toBe(true)
  })

  it('draw: each drawn card is placed in the hand with the deck as its source', () => {
    const { step } = start()
    const { plan, next } = step({ type: 'draw', seat: 0, count: 2 })
    const hand = next.zones['s0:hand:0']!
    expect(places(plan.ops)).toEqual([
      { op: 'place', uid: hand[0], key: 's0:hand:0', index: 0, prevKey: 's0:deck:0', from: null, landing: true },
      { op: 'place', uid: hand[1], key: 's0:hand:0', index: 1, prevKey: 's0:deck:0', from: null, landing: true },
    ])
    expect(plan.deckCounts['s0:deck:0']).toBe(8)
  })

  it("a hidden seat's hand gets no ops", () => {
    const { step } = start()
    const { plan } = step({ type: 'draw', seat: 1, count: 1 })
    expect(places(plan.ops)).toEqual([])
    expect(plan.deckCounts['s1:deck:0']).toBe(9)
  })

  it('summon from hand: a place op from the hand, so the landing effect plays', () => {
    const { step } = start()
    const { next } = step({ type: 'draw', seat: 0, count: 1 })
    const uid = next.zones['s0:hand:0']![0]!
    const { plan } = step({ type: 'move', seat: 0, uid, to: 's0:monster:2', faceUp: true, defense: false })
    expect(plan.ops).toEqual([{ op: 'place', uid, key: 's0:monster:2', index: 0, prevKey: 's0:hand:0', from: null, landing: true }])
  })

  it('field to field keeps the old zone as the source, and Xyz stacking gets index 1', () => {
    const { step } = start()
    const drawn = step({ type: 'draw', seat: 0, count: 2 }).next.zones['s0:hand:0']!
    step({ type: 'move', seat: 0, uid: drawn[0]!, to: 's0:monster:0', faceUp: true })
    step({ type: 'move', seat: 0, uid: drawn[1]!, to: 's0:monster:1', faceUp: true })
    const { plan } = step({ type: 'move', seat: 0, uid: drawn[1]!, to: 's0:monster:0', faceUp: true })
    expect(plan.ops).toEqual([{ op: 'place', uid: drawn[1], key: 's0:monster:0', index: 1, prevKey: 's0:monster:1', from: 's0:monster:1', landing: true }])
  })

  it('a pose change in place relayouts the zone and places nothing', () => {
    const { step } = start()
    const uid = step({ type: 'draw', seat: 0, count: 1 }).next.zones['s0:hand:0']![0]!
    step({ type: 'move', seat: 0, uid, to: 's0:monster:0', faceUp: true })
    const { plan } = step({ type: 'setPosition', seat: 0, uid, faceUp: true, defense: true })
    expect(plan.ops).toEqual([{ op: 'relayout', key: 's0:monster:0' }])
  })

  it('a counter change alone needs no layout op', () => {
    const { step } = start()
    const uid = step({ type: 'draw', seat: 0, count: 1 }).next.zones['s0:hand:0']![0]!
    step({ type: 'move', seat: 0, uid, to: 's0:monster:0', faceUp: true })
    expect(step({ type: 'addCounter', seat: 0, uid, delta: 2 }).plan.ops).toEqual([])
  })

  it('sending to the GY and banishing are place ops with the field as the source', () => {
    const { step } = start()
    const uid = step({ type: 'draw', seat: 0, count: 1 }).next.zones['s0:hand:0']![0]!
    step({ type: 'move', seat: 0, uid, to: 's0:monster:0', faceUp: true })
    const gy = step({ type: 'move', seat: 0, uid, to: 's0:gy:0', faceUp: true }).plan.ops
    expect(gy).toEqual([{ op: 'place', uid, key: 's0:gy:0', index: 0, prevKey: 's0:monster:0', from: 's0:monster:0', landing: true }])
    const banish = step({ type: 'move', seat: 0, uid, to: 's0:banished:0', faceUp: false }).plan.ops
    expect(banish).toMatchObject([{ op: 'place', key: 's0:banished:0', prevKey: 's0:gy:0' }])
  })

  it('returning a card to the deck places nothing and shrinks no view layout entry', () => {
    const { step, layout } = start()
    const uid = step({ type: 'draw', seat: 0, count: 1 }).next.zones['s0:hand:0']![0]!
    expect(layout.where(uid)).toBe('s0:hand:0')
    const { plan } = step({ type: 'move', seat: 0, uid, to: 's0:deck:0' })
    expect(plan.ops).toEqual([])
    expect(plan.deckCounts['s0:deck:0']).toBe(10)
    expect(layout.where(uid)).toBeNull()
  })

  it('a deck shuffle gives a shuffle op, but a draw does not', () => {
    const { step, game } = start()
    expect(step({ type: 'draw', seat: 0, count: 1 }).plan.ops.some((o) => o.op === 'shuffle')).toBe(false)
    const order = [...game().zones['s0:deck:0']!].reverse()
    const { plan } = step({ type: 'shuffle', seat: 0, zone: 's0:deck:0', order })
    expect(plan.ops).toEqual([{ op: 'shuffle', key: 's0:deck:0' }])
  })

  it('shuffling a card into the deck from the field reports the shuffle once', () => {
    const { step, game } = start()
    const uid = step({ type: 'draw', seat: 0, count: 1 }).next.zones['s0:hand:0']![0]!
    const prev = game()
    const moved = apply(prev, { type: 'move', seat: 0, uid, to: 's0:deck:0' }, ctx)
    if (!moved.ok) throw new Error(moved.error)
    const order = [...moved.state.zones['s0:deck:0']!].reverse()
    const shuffled = apply(moved.state, { type: 'shuffle', seat: 0, zone: 's0:deck:0', order }, ctx)
    if (!shuffled.ok) throw new Error(shuffled.error)
    const plan = reconcile(prev, shuffled.state, new FakeLayout(), 'animate')
    expect(plan.ops.filter((o) => o.op === 'shuffle')).toHaveLength(1)
  })

  it('declareAttack gives an attack op once, and clearing gives none', () => {
    const { step } = start()
    const drawn = step({ type: 'draw', seat: 0, count: 1 }).next.zones['s0:hand:0']!
    step({ type: 'move', seat: 0, uid: drawn[0]!, to: 's0:monster:0', faceUp: true })
    const hit = step({ type: 'declareAttack', seat: 0, attacker: drawn[0]!, target: null })
    expect(hit.plan.ops).toEqual([{ op: 'attack', attacker: drawn[0], target: null }])
    expect(step({ type: 'clearAttack', seat: 0 }).plan.ops).toEqual([])
  })

  it('jump mode (undo or load) places cards with no landing effect, with no attack and no shuffle', () => {
    const { step, layout } = start()
    const uid = step({ type: 'draw', seat: 0, count: 1 }).next.zones['s0:hand:0']![0]!
    const { prev, next } = step({ type: 'move', seat: 0, uid, to: 's0:monster:0', faceUp: true })
    // undo: next -> prev
    const plan = layout.run(next, prev, 'jump')
    expect(plan.ops).toEqual([{ op: 'place', uid, key: 's0:hand:0', index: 0, prevKey: 's0:monster:0', from: 's0:monster:0', landing: false }])
  })

  it('a lifted card (being dragged, where() is null) is placed back in its zone by the next sync', () => {
    const { step, layout, game } = start()
    const uid = step({ type: 'draw', seat: 0, count: 1 }).next.zones['s0:hand:0']![0]!
    layout.placed.delete(uid)
    const plan = reconcile(game(), game(), layout, 'jump')
    expect(plan.ops).toMatchObject([{ op: 'place', uid, key: 's0:hand:0' }])
  })

  it('is idempotent: syncing an unchanged state gives no ops', () => {
    const { layout, game, step } = start()
    step({ type: 'draw', seat: 0, count: 3 })
    expect(layout.run(game(), game(), 'jump').ops).toEqual([])
  })
})
