import { parseZoneKey, type CardInfo, type CardState, type GameState, type ZoneType } from '@duelist/shared'
import type { Object3D } from 'three'
import type { Card } from './Card'

/** What `CardViews` needs from a card mesh. `Card` implements it; tests use fakes. */
export interface CardView {
  readonly mesh: Object3D
  applyState(state: CardState, zoneKey: string, covered: boolean): void
  dispose(): void
}

/** The deck renders as a `DeckPile` stack, not as individual meshes. The extra deck keeps real cards (a Pendulum shows face-up on top). */
const PILE_ZONES: readonly ZoneType[] = ['deck']
/** Zones where stacked cards are Xyz materials under the top card. */
const STACK_ZONES: readonly ZoneType[] = ['monster', 'emz']

export type CreateView<V extends CardView> = (uid: string, info: CardInfo, state: CardState) => V

interface Hooks<V extends CardView> {
  /** Zones that get no views, for example another seat's hand. */
  hidden?: (zoneKey: string) => boolean
  /** Called just before a view that left every rendered zone is disposed. */
  onRelease?: (uid: string, view: V) => void
}

/** One view per rendered card uid, created when the uid first appears in a rendered zone and disposed when it leaves. */
export class CardViews<V extends CardView = Card> {
  private views = new Map<string, V>()
  private lookup: (passcode: number) => CardInfo | undefined
  private create: CreateView<V>
  private hooks: Hooks<V>

  constructor(lookup: (passcode: number) => CardInfo | undefined, create: CreateView<V>, hooks: Hooks<V> = {}) {
    this.lookup = lookup
    this.create = create
    this.hooks = hooks
  }

  get(uid: string): V | undefined {
    return this.views.get(uid)
  }

  get size() {
    return this.views.size
  }

  values() {
    return this.views.values()
  }

  /** Creates a view for a card that is not in a rendered zone yet, for example a deck card being dragged. */
  ensure(game: GameState, uid: string): V | undefined {
    const existing = this.views.get(uid)
    if (existing) return existing
    const state = game.cards[uid]
    const info = state && this.lookup(state.passcode)
    if (!state || !info) return undefined
    const view = this.create(uid, info, state)
    this.views.set(uid, view)
    return view
  }

  /** Creates, updates, and disposes views so they match `game`. Returns the uids added and removed. */
  sync(game: GameState): { added: string[]; removed: string[] } {
    const seen = new Set<string>()
    const added: string[] = []
    for (const [key, list] of Object.entries(game.zones)) {
      const type = parseZoneKey(key)?.type
      if (!type || PILE_ZONES.includes(type) || this.hooks.hidden?.(key)) continue
      const stack = STACK_ZONES.includes(type)
      list.forEach((uid, i) => {
        const state = game.cards[uid]
        if (!state) return
        let view = this.views.get(uid)
        if (!view) {
          const info = this.lookup(state.passcode)
          if (!info) {
            console.warn(`no catalog entry for ${state.passcode} (${uid})`)
            return
          }
          view = this.create(uid, info, state)
          this.views.set(uid, view)
          added.push(uid)
        }
        view.applyState(state, key, stack && i < list.length - 1)
        seen.add(uid)
      })
    }
    const removed: string[] = []
    for (const [uid, view] of this.views) {
      if (seen.has(uid)) continue
      this.release(uid, view)
      removed.push(uid)
    }
    return { added, removed }
  }

  dispose() {
    for (const [uid, view] of this.views) this.release(uid, view)
  }

  private release(uid: string, view: V) {
    this.hooks.onRelease?.(uid, view)
    view.mesh.removeFromParent()
    view.dispose()
    this.views.delete(uid)
  }
}
