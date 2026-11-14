import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame, type GameState } from '@duelist/shared'
import { HISTORY_LIMIT, createGameStore } from './gameStore'

const ctx = { isPendulum: () => false }

function game(): GameState {
  const deck = { main: Array.from({ length: 40 }, (_, i) => 1000 + i), extra: [] }
  return createGame({ players: [{ name: 'A', deck }, { name: 'B', deck }] })
}

function loaded() {
  const store = createGameStore()
  store.getState().load(game(), ctx)
  return store
}

describe('gameStore', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('draw then undo restores the original state', () => {
    const store = loaded()
    const original = structuredClone(store.getState().game)
    store.getState().dispatch({ type: 'draw', seat: 0, count: 1 })
    expect(store.getState().game).not.toEqual(original)
    expect(store.getState().log).toHaveLength(1)
    store.getState().undo()
    expect(store.getState().game).toEqual(original)
    expect(store.getState().log).toHaveLength(0)
    expect(store.getState().history).toHaveLength(0)
  })

  it('undo with empty history does nothing', () => {
    const store = loaded()
    const before = store.getState().game
    store.getState().undo()
    expect(store.getState().game).toBe(before)
  })

  it(`keeps at most ${HISTORY_LIMIT} history entries`, () => {
    const store = loaded()
    for (let i = 0; i < HISTORY_LIMIT + 1; i++) store.getState().dispatch({ type: 'setLP', seat: 0, target: 0, lp: i })
    expect(store.getState().history).toHaveLength(HISTORY_LIMIT)
    expect(store.getState().log).toHaveLength(HISTORY_LIMIT + 1)
  })

  it('subscribers fire once per successful dispatch and not for a failed one', () => {
    const store = loaded()
    const listener = vi.fn()
    store.subscribe(listener)
    store.getState().dispatch({ type: 'draw', seat: 0, count: 1 })
    expect(listener).toHaveBeenCalledTimes(1)
    store.getState().dispatch({ type: 'flip', seat: 0, uid: 'nope' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('a failed dispatch adds nothing to history or log and warns', () => {
    const store = loaded()
    const before = store.getState().game
    store.getState().dispatch({ type: 'draw', seat: 0, count: 41 })
    expect(store.getState().game).toBe(before)
    expect(store.getState().history).toHaveLength(0)
    expect(store.getState().log).toHaveLength(0)
    expect(console.warn).toHaveBeenCalledOnce()
  })

  it('dispatchAll is one undo step and one notification, and applies nothing if one action fails', () => {
    const store = loaded()
    const original = structuredClone(store.getState().game)
    const listener = vi.fn()
    store.subscribe(listener)
    store.getState().dispatchAll([
      { type: 'draw', seat: 0, count: 1 },
      { type: 'draw', seat: 0, count: 1 },
    ])
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getState().log).toHaveLength(2)
    expect(store.getState().history).toHaveLength(1)
    store.getState().dispatchAll([
      { type: 'draw', seat: 0, count: 1 },
      { type: 'flip', seat: 0, uid: 'nope' },
    ])
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getState().log).toHaveLength(2)
    store.getState().undo()
    expect(store.getState().game).toEqual(original)
    expect(store.getState().log).toHaveLength(0)
  })

  it('attack actions are logged but are not undo steps', () => {
    const store = loaded()
    store.getState().dispatch({ type: 'draw', seat: 0, count: 1 })
    const uid = store.getState().game.zones['s0:hand:0']![0]!
    store.getState().dispatch({ type: 'move', seat: 0, uid, to: 's0:monster:0', faceUp: true })
    const before = store.getState().history.length
    store.getState().dispatch({ type: 'declareAttack', seat: 0, attacker: uid, target: null })
    store.getState().dispatch({ type: 'clearAttack', seat: 0 })
    expect(store.getState().history).toHaveLength(before)
    expect(store.getState().log).toHaveLength(4)
    store.getState().undo()
    expect(store.getState().game.zones['s0:monster:0']).toEqual([])
    expect(store.getState().log).toHaveLength(1)
  })

  it('dispatch before load is ignored', () => {
    const store = createGameStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.getState().dispatch({ type: 'endTurn', seat: 0 })
    expect(listener).not.toHaveBeenCalled()
  })
})
