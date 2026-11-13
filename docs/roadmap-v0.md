# Roadmap: v0

See [decisions.md](./decisions.md) for the reasoning behind these steps.

## 0. Setup
- A pnpm monorepo with workspaces. The current app moves into `client/`, and `shared/` is linked into both the client and server.
- Client: install Tailwind, shadcn/ui and Zustand.
- Server: scaffold Fastify with `ws`.

## 1. Separate game state from rendering
Everything else depends on this step.
- `shared/`: `GameState` (seats, LP, phase, turn, active seat, zones by seat-based key), with cards as plain data `{uid, passcode, faceUp, defense, counters}`.
- `shared/`: the `Action` union (`move`, `flip`, `changePosition`, `draw`, `shuffle`, `setLP`, `addCounter`, `reveal`, `phase`, `endTurn`, `chat`) and a pure `apply(state, action)`.
- Client: a Zustand game store with `dispatch(action)`, which applies locally in hotseat mode or sends to the server when online.
- Rework `BoardState` and `Hand` to render from the state. Meshes are keyed by `uid`, and animations come from the difference between the old and new state.
- `CardActions` and `HandInteraction` dispatch Actions instead of changing meshes.
- Decks (the demo deck or a `.ydk` file) are loaded from the YGOPRODeck catalog by passcode.
- Undo becomes history over the action log.

**Done when:** local hotseat play works the same as it does today.

## 2. React + shadcn UI overlay
Can overlap with the end of step 1.
- Rebuild `src/ui/*` as React components: HUD (LP, phase, turn), action bar, context menu (shadcn `DropdownMenu` opened at the card's screen position after a raycast), pile viewer (`Dialog`), card detail (`Sheet`) and an action log panel.
- The canvas stays full-screen, with the overlay on top using `pointer-events-none` except on its controls.

## 3. Server and 2-player online play
- Fastify with a `/ws` endpoint. Client messages: `createRoom`, `joinRoom`, `action`. Server messages: `snapshot`, `actionApplied`, `error`.
- A room holds a code, seats, the full state, the action log and `seq`. Uploaded decks are checked against known passcodes.
- Shuffling and drawing happen on the server only. Each seat receives `redact(state, seat)`.
- Reconnecting with the room code and seat token returns a full snapshot.
- Rooms are cleaned up when they're empty or have been inactive past a timeout.

**Done when:** two browsers can play a full manual duel and neither can see the other's hidden cards.

## 4. Lobby flow
- Screens: enter a name, upload a `.ydk` file (unknown passcodes are listed), create a room or join by code, a waiting room, then the duel.
- The name, seat token and last deck are stored in localStorage.

## 5. Domain format
- Add the extra monster zone: a new zone key per seat plus the layout change.
- 4-player layout: zone placement that works for any seat around the table, the camera anchored to the local seat, a HUD per opponent and turn order rotating through the seats.
- Domain deck rules come later, as a pure `validateDeck(deck, format)` function.

## 6. Deck builder
- Catalog search and filters (type, attribute, level, archetype, text).
- Main, extra and side sections with drag and drop. Count limits: main 40–60, extra and side up to 15 each, and up to 3 copies of a card.
- `.ydk` import and export, with decks saved in localStorage.

## 7. YGOPRODeck caching and storage
- The server fetches and caches `cardinfo.php` and refreshes it daily, then serves a slimmed-down catalog (also cached in IndexedDB on the client).
- An image proxy with disk or R2 storage replaces hotlinking. This must be done before anyone besides the developer uses the app.

## Later
- Accounts and Postgres, and decks saved on the server
- Spectators
- Server-side dice and coin flips
- Replays built from the action log
- Card highlighting and pinging
