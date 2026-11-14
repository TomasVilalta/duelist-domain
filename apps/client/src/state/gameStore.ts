import { create } from 'zustand'
import { apply, createGame, type Action, type ApplyContext, type GameState } from '@duelist/shared'

export const HISTORY_LIMIT = 100

/** Declaring and clearing an attack only drive the attack animation. They are logged but never become an undo step. */
const TRANSIENT: ReadonlySet<Action['type']> = new Set(['declareAttack', 'clearAttack'])

export interface GameStore {
  game: GameState
  log: Action[]
  history: GameState[]
  /** `log.length` before each history entry, so `undo()` can drop every action of that step. */
  marks: number[]
  dispatch(a: Action): void
  /** Applies the actions in order as one step: one undo, one notification. If any action fails, none are applied. */
  dispatchAll(actions: Action[]): void
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
    marks: [],
    dispatch(action) {
      get().dispatchAll([action])
    },
    dispatchAll(actions) {
      if (actions.length === 0) return
      if (!applyCtx) {
        console.warn('dispatch before load()', actions)
        return
      }
      const { game, log, history, marks } = get()
      let next = game
      for (const action of actions) {
        const result = apply(next, action, applyCtx)
        if (!result.ok) {
          console.warn(`action ${action.type} rejected: ${result.error}`, action)
          return
        }
        next = result.state
      }
      const undoable = actions.some((a) => !TRANSIENT.has(a.type))
      set({
        game: next,
        log: [...log, ...actions],
        history: undoable ? [...history, game].slice(-HISTORY_LIMIT) : history,
        marks: undoable ? [...marks, log.length].slice(-HISTORY_LIMIT) : marks,
      })
    },
    undo() {
      const { history, log, marks } = get()
      const prev = history.at(-1)
      if (!prev) return
      set({ game: prev, history: history.slice(0, -1), log: log.slice(0, marks.at(-1)), marks: marks.slice(0, -1) })
    },
    load(game, ctx) {
      applyCtx = ctx
      set({ game, log: [], history: [], marks: [] })
    },
  }))
}

export const useGameStore = createGameStore()

/** Debug dump: the whole game plus the action log that led to it. Plain JSON. */
export interface GameDump {
  game: GameState
  log: Action[]
}

export function dumpGame(s: Pick<GameStore, 'game' | 'log'>): string {
  const dump: GameDump = { game: s.game, log: s.log }
  return JSON.stringify(dump)
}

/** A store that starts from a dump. History and log start empty. */
export function createStoreFrom(dump: GameDump, ctx: ApplyContext) {
  const store = createGameStore(ctx)
  store.getState().load(dump.game, ctx)
  return store
}
