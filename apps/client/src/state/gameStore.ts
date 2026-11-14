import { create } from 'zustand'
import { apply, createGame, type Action, type ApplyContext, type GameState } from '@duelist/shared'

export const HISTORY_LIMIT = 100

export interface GameStore {
  game: GameState
  log: Action[]
  history: GameState[]
  dispatch(a: Action): void
  undo(): void
  /** Replaces the game and clears history and log. `ctx` is the catalog lookup `apply()` needs. */
  load(g: GameState, ctx: ApplyContext): void
}

function emptyGame(): GameState {
  const deck = { main: [], extra: [] }
  return createGame({ players: [{ name: 'Player 1', deck }, { name: 'Player 2', deck }] })
}

/** The only code that writes game state. Usable without React through `getState()` and `subscribe()`. */
export function createGameStore(ctx?: ApplyContext) {
  let applyCtx = ctx
  return create<GameStore>()((set, get) => ({
    game: emptyGame(),
    log: [],
    history: [],
    dispatch(action) {
      if (!applyCtx) {
        console.warn('dispatch before load()', action)
        return
      }
      const { game, log, history } = get()
      const result = apply(game, action, applyCtx)
      if (!result.ok) {
        console.warn(`action ${action.type} rejected: ${result.error}`, action)
        return
      }
      set({
        game: result.state,
        log: [...log, action],
        history: [...history, game].slice(-HISTORY_LIMIT),
      })
    },
    undo() {
      const { history, log } = get()
      const prev = history.at(-1)
      if (!prev) return
      set({ game: prev, history: history.slice(0, -1), log: log.slice(0, -1) })
    },
    load(game, ctx) {
      applyCtx = ctx
      set({ game, log: [], history: [] })
    },
  }))
}

export const useGameStore = createGameStore()
