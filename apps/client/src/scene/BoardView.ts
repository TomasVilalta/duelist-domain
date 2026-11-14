import { parseZoneKey, type CardInfo, type GameState, type Seat } from '@duelist/shared'
import type { Scene } from 'three'
import type { AttackFx } from '@/anim/AttackFx'
import type { Tweens } from '@/anim/Tweens'
import type { Card } from '@/cards/Card'
import { CardViews, type CreateView } from '@/cards/CardViews'
import type { DeckPile } from '@/cards/DeckPile'
import type { Hand } from '@/cards/Hand'
import type { BoardState } from '@/state/BoardState'
import { reconcile, type Layout, type Mode, type Op } from './reconcile'
import { deckKey, getZoneByKey } from './ZoneLayout'

interface Deps {
  scene: Scene
  tweens: Tweens
  board: BoardState
  hand: Hand
  /** One `DeckPile` per seat, by deck zone key. */
  piles: Map<string, DeckPile>
  attackFx: AttackFx
  lookup: (passcode: number) => CardInfo | undefined
  create: CreateView<Card>
  localSeat: Seat
  invalidate: () => void
  /** An attack animation finished. */
  onAttackDone: () => void
}

/**
 * The only code that moves card meshes between zones. It follows the game state: `sync(next, prev, mode)` makes
 * the `CardViews`, `BoardState` and `Hand` layouts match `next`, using the `reconcile()` plan.
 * `BoardState` and `Hand` keep the meshes in the order the state gives, and decide nothing about where cards belong.
 */
export class BoardView implements Layout {
  readonly views: CardViews<Card>
  /** Zone each view was last placed in. A lifted (dragged) card has no entry, so the next sync puts it back. */
  private placed = new Map<string, string>()
  private d: Deps

  constructor(deps: Deps) {
    this.d = deps
    this.views = new CardViews<Card>(deps.lookup, deps.create, {
      hidden: (key) => this.hidden(key),
      onRelease: (uid, card) => {
        this.detach(card)
        this.placed.delete(uid)
      },
    })
  }

  // ---- Layout (read by reconcile) ----

  where(uid: string): string | null {
    return this.placed.get(uid) ?? null
  }

  rendered(key: string): boolean {
    const id = parseZoneKey(key)
    return !!id && id.type !== 'deck' && !this.hidden(key)
  }

  /** Another seat's hand is not shown. */
  private hidden(key: string): boolean {
    const id = parseZoneKey(key)
    return id?.type === 'hand' && id.owner !== this.d.localSeat
  }

  // ---- sync ----

  /** `prev` is the state before the change (null when unknown). `jump` snaps, for undo, load and resync. */
  sync(next: GameState, prev: GameState | null, mode: Mode) {
    const { added } = this.views.sync(next)
    const fresh = new Set(added)
    const plan = reconcile(prev, next, this, mode)
    for (const [key, n] of Object.entries(plan.deckCounts)) this.d.piles.get(key)?.setCount(n)
    for (const op of plan.ops) this.run(op, fresh, mode)
    this.d.invalidate()
  }

  /** Put every view where the state says, with no animation hints. Used after a cancelled drag. */
  resync(game: GameState) {
    this.sync(game, null, 'jump')
  }

  private run(op: Op, fresh: Set<string>, mode: Mode) {
    const { board, hand, piles, tweens, attackFx } = this.d
    switch (op.op) {
      case 'place': {
        const card = this.views.get(op.uid)
        if (!card) return
        if (fresh.has(op.uid)) this.spawn(card, op.key, op.prevKey, mode)
        this.detach(card)
        const jump = mode === 'jump'
        if (parseZoneKey(op.key)?.type === 'hand') {
          const fromDeck = !!op.prevKey && parseZoneKey(op.prevKey)?.type === 'deck'
          hand.add(card, jump ? 0.3 : fromDeck ? 0.55 : 0.4, op.index)
        } else {
          this.d.scene.attach(card.mesh)
          board.place(card, op.key, jump ? 0.25 : 0.28, op.landing ? { from: op.from } : undefined, op.index)
        }
        this.placed.set(op.uid, op.key)
        return
      }
      case 'relayout':
        board.layoutZone(op.key, 0.35)
        return
      case 'shuffle':
        piles.get(op.key)?.shuffle(tweens)
        return
      case 'attack': {
        const attacker = this.views.get(op.attacker)
        if (!attacker) {
          this.d.onAttackDone()
          return
        }
        attackFx.attack(attacker, op.target ? (this.views.get(op.target) ?? null) : null, this.d.onAttackDone)
        return
      }
    }
  }

  /** Where a brand-new mesh starts: on top of the deck it was drawn from, or on its destination. */
  private spawn(card: Card, key: string, prevKey: string | null, mode: Mode) {
    const from = prevKey ? parseZoneKey(prevKey) : null
    const to = parseZoneKey(key)
    if (from?.type === 'deck' && mode === 'animate') {
      this.placeOnDeck(card, prevKey!)
    } else if (to?.type === 'hand') {
      const zone = getZoneByKey(deckKey(typeof to.owner === 'number' ? to.owner : this.d.localSeat))
      if (zone) card.mesh.position.set(zone.x, 0.4, zone.z)
      card.mesh.rotation.set(Math.PI / 2, 0, 0)
    } else {
      const zone = getZoneByKey(key)
      if (zone) card.mesh.position.set(zone.x, 0.3, zone.z)
    }
    this.d.scene.add(card.mesh)
  }

  private placeOnDeck(card: Card, deck: string) {
    const zone = getZoneByKey(deck)
    const pile = this.d.piles.get(deck)
    if (!zone || !pile) return
    card.mesh.position.set(zone.x, pile.topY + 0.02, zone.z)
    card.mesh.rotation.set(Math.PI / 2, 0, 0)
  }

  /** Take the card out of whichever layout holds it. */
  private detach(card: Card) {
    this.d.tweens.cancel(card.mesh)
    if (this.d.hand.has(card)) {
      this.d.hand.remove(card)
      this.d.scene.attach(card.mesh)
    }
    this.d.board.remove(card)
  }

  // ---- temporary visuals (drag) ----

  /** Lift a card out of its zone or the hand for a drag. The next `sync`/`resync` puts it back where the state says. */
  lift(card: Card) {
    this.detach(card)
    this.placed.delete(card.uid)
  }

  /** A mesh for a deck card, lying on top of the deck, so it can be dragged. Disposed by the next sync unless the state moves it. */
  liftFromDeck(game: GameState, uid: string): Card | undefined {
    const card = this.views.ensure(game, uid)
    if (!card) return undefined
    const loc = Object.entries(game.zones).find(([, list]) => list.includes(uid))?.[0]
    if (loc) this.placeOnDeck(card, loc)
    this.d.scene.add(card.mesh)
    this.placed.delete(uid)
    return card
  }

  dispose() {
    this.views.dispose()
    this.placed.clear()
  }
}
