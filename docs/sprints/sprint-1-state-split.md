# Sprint 1: Separate game state from rendering

Roadmap step 1. See [roadmap-v0.md](../roadmap-v0.md), and decisions D4, D5 and D6 in [decisions.md](../decisions.md).

## Goal
Game state becomes a plain, serializable `GameState` in `@duelist/shared`, changed only by `apply(state, action)`. The Three.js client renders from a Zustand store holding that state. Local hotseat play must work the same as it does today.

## Out of scope
- Server, networking and `redact()`. `redact()` is designed here (T4) but used in sprint 3.
- React or shadcn UI. `src/ui/*` stays in plain TypeScript and only switches to reading from the store.
- The Domain extra zone and 4 players. The model must *allow* N seats, but only 2 are rendered.

## Current state (what changes)
- `BoardState`, `Hand`, `DeckPile` and `Card` hold the game state on Three.js objects (`card.zoneKey`, `card.faceUp`, `card.defense`, counters).
- `core/App.ts` changes them directly: `drawCard`, `millCard`, `shuffleDeck`, `returnToDeck`, `changeLp`, `setPhase`, `endTurn`, plus `capture()`/`restore()` for undo.
- `CardActions` and `HandInteraction` call `BoardState.place()` and similar methods directly.
- Zone keys are `p1:monster:2`, `p2:gy:0` and `shared:emz:0` (`ZoneLayout.zoneKey`).

## Conventions
- **Zone keys:** `s{seat}:{type}:{index}`, for example `s0:monster:2`, `s1:gy:0`, `s0:hand:0` and `s0:deck:0`. The Extra Monster Zones stay `shared:emz:{0|1}`. Every zone, including the hand and deck, is an ordered list of card uids, with index 0 at the **bottom** of the pile (the last card is the top of the deck or GY).
- **Card uid:** a string unique within a game (for example `"c17"`). Uids are assigned when the deck loads, never reused, and don't change when a card moves.
- **Determinism:** `apply()` is pure. All randomness (the shuffle order) is chosen *before* the action is dispatched and carried inside the action, so the server can own it later.

---

## T1: Set up tests in `@duelist/shared` (done, approved)
Add Vitest to `apps/shared`, with a `test` script and a root `pnpm test` that runs it across packages.

**DoD**
- `pnpm test` at the root runs the shared tests and exits with code 0.
- A sample test passes. The tests also run in watch mode with `pnpm --filter @duelist/shared test:watch`.
- The `typecheck` script ignores nothing that the tests need.

**Test cases**
- `pnpm test` with a deliberately failing test exits with a non-zero code.

---

## T2: Card and catalog types in shared (built, awaiting review)
Move the card data model out of `client/src/data/demoDeck.ts` into `shared/src/cards.ts`.
- `CardInfo`: the static catalog data keyed by passcode (name, kind, frame type, atk/def/level/scale/link value, race, attribute, archetype, desc, image URL).
- `CardKind`, and `extraDeckKind()` (moved as-is).
- Instance fields (`uid`) are not part of `CardInfo`.

**DoD**
- The client imports these types from `@duelist/shared`, and the duplicates in `demoDeck.ts` are removed.
- `pnpm typecheck` and `pnpm lint` pass.

**Test cases**
- `extraDeckKind('Fusion Monster') === 'Fusion'`, Synchro/XYZ/Link likewise (the function returns the capitalized kind, as it did before the move), and `'Pendulum Effect Fusion Monster'` gives `'Fusion'`.
- `extraDeckKind('Effect Monster') === null`.

---

## T3: `GameState` model and zone-key helpers
`shared/src/state.ts`:
```ts
type ZoneType = 'monster'|'spell'|'field'|'pendulum'|'gy'|'deck'|'extra'|'banished'|'hand'|'emz'
interface CardState { uid: string; passcode: number; owner: Seat; faceUp: boolean; defense: boolean; counters: number }
interface PlayerState { name: string; lp: number }
interface GameState {
  seats: PlayerState[]           // length 2 for now
  cards: Record<string, CardState>
  zones: Record<string, string[]> // zoneKey → uids, bottom → top
  turn: number; phase: Phase; activeSeat: Seat
  attack: { attacker: string; target: string | null } | null
}
```
Helpers: `zoneKey()`, `parseZoneKey()`, `zonesOf(seat)`, `findCard(state, uid) → {key, index}`, and `createGame({ players, decks }) → GameState`. A deck is passcodes plus their `CardInfo`, split into main and extra.

**DoD**
- `createGame` places main deck cards face-down in `s{n}:deck:0`, extra deck cards in `s{n}:extra:0`, sets LP to 8000, and sets turn 1, the first phase and active seat 0.
- Every card uid appears in exactly one zone.
- The state contains no class instances, Three.js types or functions, so `structuredClone(state)` and `JSON.parse(JSON.stringify(state))` deep-equal the original.

**Test cases**
- `parseZoneKey(zoneKey(x))` deep-equals `x` for every zone type, including `shared:emz:1`.
- `parseZoneKey('garbage')` throws or returns `null` (pick one and document it).
- `createGame` with a 40-card main and 5-card extra gives 40 uids in the deck, 5 in the extra and 0 in every other zone.
- Uids are unique across both seats.
- `findCard` returns the correct zone and index, and `null` for an unknown uid.

---

## T4: `Action` union and `apply()`
`shared/src/actions.ts`. Every action carries `seat` (the player who did it).

| Action | Payload |
|---|---|
| `move` | `uid, to, index?, faceUp?, defense?` (index defaults to the top of the pile) |
| `flip` | `uid` |
| `setPosition` | `uid, faceUp, defense` |
| `addCounter` | `uid, delta` |
| `draw` | `count` (from the top of the seat's own deck to its hand) |
| `mill` | `count` |
| `shuffle` | `zone, order: string[]` (the new order is supplied by the caller) |
| `setLP` | `target: Seat, lp` |
| `setPhase` | `phase` |
| `endTurn` | none |
| `declareAttack` / `clearAttack` | `attacker, target \| null` |

`apply(state, action): GameState` returns a **new** state and never changes its input. Invalid actions (unknown uid, a draw from an empty deck, a `shuffle.order` that isn't a permutation of the pile) return the state unchanged and report the problem through a `Result`, or by throwing a typed `ActionError`. Pick one approach.

Zone rules enforced in `apply()`, because they are layout facts rather than game rules:
- The face-up and defense values a zone allows (move `legalOrientation()` from `ZoneLayout`): cards in the deck, hand and extra deck are normalized, and Pendulum cards in the extra deck stay face-up.
- Banished and extra deck piles: face-up cards are kept above face-down ones.
- Counters reset when a card leaves the field.

**DoD**
- Every action type has a handler, and the union is exhaustive (a `never` check in the switch).
- No handler changes its input. A test freezes the state with deep `Object.freeze` and every action still works.
- `apply` is about 250 lines or fewer, or is split into a file per group of actions.

**Test cases**
- `move` from the hand to `s0:monster:0` face-up in attack position: the hand shrinks by 1 and the zone holds `[uid]`.
- `move` onto an occupied monster zone stacks the card (Xyz material): the zone becomes `[old, new]`.
- `move` with `index: 0` into the deck puts the card on the bottom, and with no index on the top.
- `move` to the deck forces `faceUp: false` and `defense: false`, and so does `move` to the hand.
- A Pendulum monster moved to the extra deck is face-up and sits above face-down extra deck cards.
- `flip` toggles `faceUp`. `setPosition` to face-down defense on a monster zone works, and face-down attack is normalized according to `legalOrientation`.
- `addCounter` with `-1` at 0 counters stays at 0. Counters reset to 0 when the card moves to the GY.
- `draw 2` moves the top 2 deck cards to the hand, top card first. `draw` from an empty deck returns an error and the state is unchanged.
- `mill 1` moves the top deck card to the top of the GY, face-up.
- `shuffle` with a valid permutation reorders the pile, and with a missing or extra uid it errors.
- `setLP` with a negative value clamps to 0.
- `endTurn` increments `turn`, rotates `activeSeat` (through N seats), resets the phase to the first phase, and clears `attack`.
- `declareAttack` sets `attack`, and `clearAttack` and `endTurn` clear it.
- An unknown uid in any action returns an error and leaves the state unchanged.
- Property test (optional): 500 random valid actions keep every uid in exactly one zone.

---

## T5: Client deck loading into `GameState`
Replace `loadDemoDeck`/`buildDemoDeck` with a function that takes passcode lists (from the current demo list, and later a `.ydk` file), resolves them through the catalog (the local `catalog.json` for now, then YGOPRODeck), and calls `createGame`. Add a `parseYdk(text)` function in shared for sprint 4, since it's small.

**DoD**
- The client starts by building a `GameState` from the demo deck, without creating any meshes yet.
- An unknown passcode is reported in a list (`missing: number[]`) and left out of the deck rather than crashing.

**Test cases (shared, `parseYdk`)**
- A typical `.ydk` with `#main`, `#extra` and `!side` gives the correct three arrays, in order and with duplicates kept.
- Comment lines (`#created by …`), blank lines, CRLF line endings and trailing whitespace are ignored.
- An empty file gives three empty arrays.

---

## T6: Zustand game store
`client/src/state/gameStore.ts`:
```ts
{ game: GameState; log: Action[]; history: GameState[];
  dispatch(a: Action): void; undo(): void; load(g: GameState): void }
```
- `dispatch` calls `apply()`, keeps the previous state in `history` (limited to the last 100), and appends the action to `log`.
- A `uiStore` holds non-game state: selection, hover, pinned card, targeting mode, and `localSeat` (always 0 in hotseat mode).
- The store module is the single place that changes game state. Nothing else writes to it.

**DoD**
- Three.js code can use `useGameStore.getState()` and `.subscribe()` without React.
- `undo()` restores the previous state, and calling it with empty history does nothing.
- A failed `apply()` doesn't add to the history or log. It logs a warning in the console.

**Test cases (Vitest in the client, or a pure store factory tested in shared)**
- `dispatch(draw 1)` followed by `undo()` returns state deep-equal to the original.
- 101 dispatches leave `history.length === 100`.
- Subscribers fire once per successful dispatch and not at all for a failed one.

---

## T7: Rendering from the state, part 1 (card views)
Create `CardViews`: a `Map<uid, Card>` that creates a `Card` mesh the first time a uid appears in a rendered zone and disposes it when the card is no longer rendered. `Card` loses its game fields (`zoneKey`, `faceUp`, `defense` and counters become derived from the state) and keeps only the visual state set from `CardState`.

**DoD**
- `Card` has no fields that duplicate `CardState`, or they are clearly marked as derived and set only by the view sync.
- Mesh count equals the number of visible cards. Deck and extra deck piles still render as `DeckPile` stacks, not individual meshes.
- Creating and destroying views leaks no textures or geometry (`renderer.info.memory` stays stable over 20 card moves into and out of the deck).

**Test cases (manual)**
- Draw 5 and then return 5 to the deck: `renderer.info.memory.geometries` and `.textures` return to the same counts.

---

## T8: Rendering from the state, part 2 (reconciling with animation)
A `reconcile(prev, next)` function runs on every store change:
- It compares zone lists to find, for each uid, a move (`fromKey → toKey`), a change in face-up or position, or a counter change.
- It calls the existing `BoardState.place()` and `layoutZone()`, `Hand.add()`/`remove()`/`layout()` and `DeckPile.setCount()`, so the current animations (`LandingFx`, tweens, the deck shuffle animation) keep working.
- `BoardState` and `Hand` become **view layouts**: they hold meshes in the order the state gives, but no longer decide where cards belong.
- The source of a move (hand, deck, pile or field) is derived from `prev`, which replaces the current `origin` parameter.
- `load()`/`undo()` (a large jump between states) snaps to the new layout or plays a short animation, without per-card landing effects.

**DoD**
- Every visual change on the board comes from a store change, and no code moves meshes between zones outside `reconcile`.
- Drawing, summoning (attack, defense and set), activating, Xyz stacking, sending to the GY, banishing (face-up and face-down), returning to the hand or deck, and the deck shuffle all animate as they do today.
- Hover lift and drag previews still work. These are *temporary visual states* outside the game state.

**Test cases (manual checklist, compared against `main`)**
- Draw 1 and draw 5: cards fly from the deck to the hand, and the hand fans out again.
- Normal Summon from the hand, Set a monster, Set a spell/trap, and activate a Field Spell.
- Xyz: drop a monster onto another. Materials peek out on the left and only the top card shows ATK.
- Send to the GY, banish face-up, banish face-down, and return to the top or bottom of the deck or shuffle it in. The deck count updates.
- Put a Pendulum monster in the extra deck: it shows face-up on top.
- Undo after each of the steps above: the board matches the previous state with no stray meshes.

---

## T9: Interactions dispatch Actions
Rewire `CardActions`, `HandInteraction` and the deck/pile handlers in `App.ts` (`drawCard`, `millCard`, `shuffleDeck`, `returnToDeck`, `playFromDeck`, `handFromDeck`, `changeLp`, `setPhase`, `endTurn`, `declareAttack`) so they build `Action`s and call `dispatch`. `shuffle` creates its random order on the client for now, with a `TODO(server)` marker.
- `targetZoneKeys`, `attackTargetKeys` and `isAttacker` read from `GameState` and take a `seat` instead of `'p1' | 'p2'`.
- Drag and drop: during the drag the card is a temporary visual. On drop, the client dispatches `move` (with `faceUp`/`defense` from the chosen pose), and on cancel nothing is dispatched.
- `ZoneLayout.Owner` (`'p1' | 'p2'`) is replaced by `Seat`, with a mapping from seat to board side (local seat at the bottom).

**DoD**
- Searching `apps/client/src` for `.place(`, `.remove(` and `hand.add(` finds them only inside the reconcile and view-layout code.
- No `'p1'`/`'p2'` strings remain in game logic. They may remain only in the layout data for board sides.
- Every context-menu item and keyboard shortcut that works on `main` still works.

**Test cases (manual)**
- Every context-menu entry on hand cards, board cards, pile viewer cards and deck viewer cards does its action.
- Dragging from the hand to a zone and pressing the pose-cycle key while dragging sets the right position. Dropping on an invalid area returns the card to the hand with nothing logged.
- Attack: declare, the arrow and effects play, and canceling clears the attack. A direct attack works when the opponent has no monsters.
- LP buttons, the phase bar and End Turn update the HUD. End Turn hands control to the other seat.

---

## T10: Remove the old snapshot and undo code, and add a debug view
- Delete `state/Snapshot.ts` and `App.capture()`, `restore()`, `take()` and `snapOf()`. Undo uses `gameStore.undo()`.
- Remove `CardData.uid: number` in favor of string uids from the state.
- Add a debug panel (lil-gui or a `window.__game` getter) that can dump the current `GameState` and the action log as JSON.

**DoD**
- `Snapshot.ts` no longer exists, and no code imports it.
- `window.__game()` returns valid JSON, and `createStoreFrom(JSON.parse(dump))` renders the same board.
- `pnpm typecheck`, `pnpm lint` and `pnpm test` all pass.

**Test cases**
- Play about 20 actions, dump the state, reload the page, load the dump: the board is identical.
- Undo 20 times back to the start: the board shows a fresh game.

---

## Order and dependencies
```
T1 → T2 → T3 → T4 ─┬─→ T6 → T7 → T8 → T9 → T10
                   └─→ T5 ───────┘
```
T1 to T4 are shared code only and can be tested without the renderer. T7 to T9 are the risky part, so keep `main` playable by merging T8 and T9 together, or keep the old path behind a flag until T9 is done.

## Sprint DoD
- All task DoDs are met, and `pnpm typecheck`, `pnpm lint` and `pnpm test` pass.
- The T8 and T9 manual checklists pass in hotseat mode.
- `@duelist/shared` has no dependencies other than dev dependencies, and imports no DOM or Three.js code.
- `GameState` round-trips through JSON, which is the requirement for sprint 3 (the server).
