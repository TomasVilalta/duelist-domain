# Decisions

Architecture decisions for v0. Add new entries at the bottom, and don't rewrite old ones: mark a replaced decision as superseded instead.

## D1: Purely manual play
The app has no rules engine. The server checks only who owns a card or seat. Players are trusted the same way they are at a physical table.

## D2: Self-hosted Node server (Fastify + `ws`)
Chosen over PartyKit (Cloudflare Durable Objects). One Node process can serve REST and WebSockets now, and accounts and a database can be added later without splitting the backend across two platforms. Room logic stays behind a small interface, so moving to Durable Objects remains possible.

## D3: The server is authoritative and redacts hidden information
The server holds the full state, does all random operations (shuffling, drawing, later dice and coins), and sends each seat a view from `redact(state, seat)`. Clients never receive hidden card identities.

## D4: Shared pure game core
`shared/` holds `GameState`, the `Action` union, `apply(state, action)`, `redact()`, message types and the `.ydk` parser, with no Three.js or DOM code. The client and server run the same `apply()`.

## D5: Seat-based state
Zone keys look like `s{seat}:{zone}[:{index}]`, for example `s0:monster:2` and `s1:hand`. There are no hard-coded `p1`/`p2` fields, so 2-player and 4-player use the same model.

## D6: Rendering is separate from game state
Three.js renders from the store. Card meshes are views keyed by `uid`, and animations come from the difference between the old and new state. The current Three.js code stays as it is (no react-three-fiber).

## D7: Client UI uses React, Tailwind and shadcn on top of the canvas
The canvas is a full-screen layer, with the React overlay on top using `pointer-events-none` except on its controls. A Zustand store connects the two: Three.js uses `getState()` and `subscribe()`, and React uses hooks.

## D8: No accounts in v0
A player enters a name and uploads a `.ydk` file. The name, seat token and last deck are stored in localStorage.

## D9: Card data from YGOPRODeck, images hotlinked for now
The full catalog comes from the YGOPRODeck API. Hotlinking images is acceptable while only the developer is testing. Caching the catalog and proxying images is deferred to the end of v0 and must be done before anyone else uses the app.

## D10: pnpm monorepo
`client/`, `server/` and `shared/` live in one repo, so the shared types keep the client and server in sync.

## D11: JSON over WebSocket with sequence numbers
Messages are JSON. Every applied action gets an increasing `seq`, and a reconnecting client receives a full snapshot.

## D12: Rooms in memory
v0 has no database. Rooms are lost when the server restarts.
