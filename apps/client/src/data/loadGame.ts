import {
  EXTRA_KINDS,
  apply,
  createGame,
  extraDeckKind,
  resolveDeck,
  zoneKey,
  type ApplyContext,
  type CardInfo,
  type CardKind,
  type DeckList,
  type GameState,
} from '@duelist/shared'
import { TEMPLATES, shuffle } from './demoDeck'

export type Catalog = Map<number, CardInfo>

interface CatalogEntry {
  passcode: number
  name: string
  kind: CardKind
  atk?: number
  def?: number | null
  level?: number
  scale?: number | null
  type?: string
  race?: string
  attribute?: string
  archetype?: string
  desc?: string
  file: string
}

/** The local card catalog, keyed by passcode. */
export async function loadCatalog(): Promise<Catalog> {
  const base = import.meta.env.BASE_URL
  const res = await fetch(`${base}cards/catalog.json`)
  if (!res.ok) throw new Error(`card catalog ${res.status}`)
  const list = (await res.json()) as CatalogEntry[]
  return new Map(
    list.map((c) => [
      c.passcode,
      {
        passcode: c.passcode,
        name: c.name,
        kind: c.kind,
        atk: c.atk,
        def: c.def ?? undefined,
        level: c.level || undefined,
        scale: c.scale ?? undefined,
        image: `${base}cards/${c.file}`,
        type: c.type,
        race: c.race,
        attribute: c.attribute,
        archetype: c.archetype,
        desc: c.desc,
      },
    ]),
  )
}

/** Two copies of each card, one of each Pendulum, and one of each extra deck monster. Extra deck is sorted by type. */
export function demoDeckList(catalog: Catalog): DeckList {
  const main: number[] = []
  const extra: { passcode: number; kind: number }[] = []
  for (const card of catalog.values()) {
    const kind = extraDeckKind(card.type)
    if (kind) extra.push({ passcode: card.passcode, kind: EXTRA_KINDS.indexOf(kind) })
    else {
      const copies = card.type?.includes('Pendulum') ? 1 : 2
      for (let i = 0; i < copies; i++) main.push(card.passcode)
    }
  }
  extra.sort((a, b) => a.kind - b.kind)
  return { main, extra: extra.map((e) => e.passcode) }
}

/** Builds a fresh `GameState`. Passcodes missing from the catalog are left out and listed in `missing`. */
export function buildGame(players: { name: string; deck: DeckList }[], catalog: Catalog): { game: GameState; missing: number[] } {
  const missing = new Set<number>()
  const resolved = players.map((p) => {
    const r = resolveDeck(p.deck, (code) => catalog.has(code))
    r.missing.forEach((m) => missing.add(m))
    return { name: p.name, deck: r.deck }
  })
  return { game: createGame({ players: resolved }), missing: [...missing] }
}

/** Catalog of the placeholder cards, for when `catalog.json` can't be loaded. */
export function placeholderCatalog(): Catalog {
  return new Map(
    TEMPLATES.map((t, i): [number, CardInfo] => {
      const passcode = 900000 + i
      return [passcode, { ...t, passcode }]
    }),
  )
}

/** What `apply()` needs to know about cards: which extra deck cards are Pendulum monsters. */
export function applyContext(catalog: Catalog): ApplyContext {
  return { isPendulum: (passcode) => catalog.get(passcode)?.type?.toLowerCase().includes('pendulum') ?? false }
}

/** Shuffles every seat's deck. */
export function shuffleDecks(game: GameState, ctx: ApplyContext): GameState {
  let state = game
  for (let seat = 0; seat < game.seats.length; seat++) {
    const zone = zoneKey({ owner: seat, type: 'deck', index: 0 })
    // TODO(server): the server will choose the order.
    const order = shuffle([...(state.zones[zone] ?? [])])
    const result = apply(state, { type: 'shuffle', seat, zone, order }, ctx)
    if (result.ok) state = result.state
  }
  return state
}

/** A two-player game where both seats play the demo deck, with both decks shuffled. */
export async function loadStartGame(): Promise<{ game: GameState; catalog: Catalog; ctx: ApplyContext; missing: number[] }> {
  let catalog: Catalog
  try {
    catalog = await loadCatalog()
  } catch (e) {
    console.warn('Card catalog unavailable, using placeholders', e)
    catalog = placeholderCatalog()
  }
  const deck = demoDeckList(catalog)
  const { game, missing } = buildGame(
    [
      { name: 'Player 1', deck },
      { name: 'Player 2', deck },
    ],
    catalog,
  )
  const ctx = applyContext(catalog)
  return { game: shuffleDecks(game, ctx), catalog, ctx, missing }
}
