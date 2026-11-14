import { parseZoneKey, type CardInfo, type CardState, type GameState, type ZoneType } from '@duelist/shared'
import type { Object3D } from 'three'
import type { Card } from './Card'

/** What `CardViews` needs from a card mesh. `Card` implements it; tests use fakes. */
export interface CardView {
  readonly mesh: Object3D
  applyState(state: CardState, zoneKey: string, covered: boolean): void
  dispose(): void
}

/** Deck and extra deck render as `DeckPile` stacks, not as individual meshes. */
const PILE_ZONES: readonly ZoneType[] = ['deck', 'extra']
/** Zones where stacked cards are Xyz materials under the top card. */
const STACK_ZONES: readonly ZoneType[] = ['monster', 'emz']

export type CreateView<V extends CardView> = (uid: string, info: CardInfo, state: CardState) => V

/** One view per rendered card uid, created when the uid first appears in a rendered zone and disposed when it leaves. */
export class CardViews<V extends CardView = Card> {
  private views = new Map<string, V>()
  private lookup: (passcode: number) => CardInfo | undefined
  private create: CreateView<V>

  constructor(lookup: (passcode: number) => CardInfo | undefined, create: CreateView<V>) {
    this.lookup = lookup
    this.create = create
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

  /** Creates, updates, and disposes views so they match `game`. Returns the uids added and removed. */
  sync(game: GameState): { added: string[]; removed: string[] } {
    const seen = new Set<string>()
    const added: string[] = []
    for (const [key, list] of Object.entries(game.zones)) {
      const type = parseZoneKey(key)?.type
      if (!type || PILE_ZONES.includes(type)) continue
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
    view.mesh.removeFromParent()
    view.dispose()
    this.views.delete(uid)
  }
}
