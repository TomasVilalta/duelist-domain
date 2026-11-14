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

  it('dispatch before load is ignored', () => {
    const store = createGameStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.getState().dispatch({ type: 'endTurn', seat: 0 })
    expect(listener).not.toHaveBeenCalled()
  })
})
