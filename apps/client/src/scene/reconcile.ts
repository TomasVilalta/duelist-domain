import { parseZoneKey, type GameState } from '@duelist/shared'

/** `animate` follows one dispatched action. `jump` is undo, load, or a resync: snap to the layout with no landing effects. */
export type Mode = 'animate' | 'jump'

export type Op =
  /** Put the card's view at `index` of zone `key`. `from` is where it came from, for the landing effect (`null` = hand or deck). */
  | { op: 'place'; uid: string; key: string; index: number; prevKey: string | null; from: string | null; landing: boolean }
  /** A card in this zone changed face-up or position. */
  | { op: 'relayout'; key: string }
  /** The deck pile's cards were reordered. */
  | { op: 'shuffle'; key: string }
  | { op: 'attack'; attacker: string; target: string | null }

export interface Layout {
  /** The zone key the card's view was last placed in, or null when it has no view or is lifted (being dragged). */
  where(uid: string): string | null
  /** Zones drawn as card meshes. The deck is a pile and some seats' hands are hidden. */
  rendered(zoneKey: string): boolean
}

export interface Plan {
  ops: Op[]
  /** Card count of every deck zone, for the `DeckPile` stacks. */
  deckCounts: Record<string, number>
}

function positions(game: GameState): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, list] of Object.entries(game.zones)) for (const uid of list) out.set(uid, key)
  return out
}

function reordered(prev: string[], next: string[]): boolean {
  const inNext = new Set(next)
  const inPrev = new Set(prev)
  const a = prev.filter((u) => inNext.has(u))
  const b = next.filter((u) => inPrev.has(u))
  return a.some((u, i) => u !== b[i])
}

/**
 * Compares the view layout with `next` and lists what the views must do. `prev` only supplies hints:
 * where a card came from, so landing effects and the deck spawn point are right.
 * Pure: it reads no meshes, so it is tested without WebGL.
 */
export function reconcile(prev: GameState | null, next: GameState, layout: Layout, mode: Mode): Plan {
  const ops: Op[] = []
  const deckCounts: Record<string, number> = {}
  const before = prev ? positions(prev) : null
  const animate = mode === 'animate' && !!prev

  for (const [key, list] of Object.entries(next.zones)) {
    if (parseZoneKey(key)?.type === 'deck') {
      deckCounts[key] = list.length
      if (animate && reordered(prev!.zones[key] ?? [], list)) ops.push({ op: 'shuffle', key })
      continue
    }
    if (!layout.rendered(key)) continue
    let posed = false
    list.forEach((uid, index) => {
      if (layout.where(uid) !== key) {
        const prevKey = before?.get(uid) ?? null
        const prevType = prevKey ? parseZoneKey(prevKey)?.type : undefined
        const fromPile = !prevKey || prevType === 'hand' || prevType === 'deck'
        ops.push({ op: 'place', uid, key, index, prevKey, from: fromPile ? null : prevKey, landing: animate })
        return
      }
      const was = prev?.cards[uid]
      const now = next.cards[uid]
      if (was && now && (was.faceUp !== now.faceUp || was.defense !== now.defense)) posed = true
    })
    if (posed) ops.push({ op: 'relayout', key })
  }

  if (animate && next.attack && !sameAttack(prev!.attack, next.attack)) {
    ops.push({ op: 'attack', attacker: next.attack.attacker, target: next.attack.target })
  }
  return { ops, deckCounts }
}

function sameAttack(a: GameState['attack'], b: GameState['attack']): boolean {
  return a?.attacker === b?.attacker && a?.target === b?.target
}
