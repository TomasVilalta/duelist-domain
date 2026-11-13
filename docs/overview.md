# Duelist Domain: Overview

Duelist Domain is a manual Yu-Gi-Oh! play client, built mainly for the **Domain** format. "Manual" means the app doesn't enforce game rules: players move cards, change LP and advance phases themselves, the same way as on a physical table or in DuelingBook.

## What it does (target v0)

- A 3D board rendered with Three.js, with a hand, piles and animated card movement.
- 2-player online duels over WebSockets, and later 4-player duels for Domain.
- No accounts: a player enters a name, uploads a `.ydk` deck, and creates or joins a room by code.
- Card data comes from the [YGOPRODeck API](https://ygoprodeck.com/api-guide/), with the full card catalog available.

## Stack

| Layer | Tech |
|---|---|
| Client rendering | Three.js (imperative, no react-three-fiber) with postprocessing |
| Client UI | React 19, Tailwind, shadcn/ui on top of the canvas |
| Client state | Zustand store shared by the Three.js layer and React |
| Shared | Pure TypeScript: `GameState`, the `Action` union, `apply()`, `redact()`, message types and the `.ydk` parser |
| Server | Node, Fastify and `ws`, with game rooms kept in memory |
| Repo | pnpm monorepo: `client/`, `server/`, `shared/` |

## How it fits together

```
client (Three.js + React)  ──Action──▶  server (room)
        ▲                                 │ apply(state, action)
        └──── redacted state / action ◀───┘ redact(state, seat)
```

- The **server is authoritative**. It holds the full game state, does all shuffling and drawing, and only checks permissions (for example, whether a card belongs to the player), never game rules.
- Each player receives a **redacted view**: other players' hands and decks, and every face-down card, are hidden.
- The **client renders state**. Three.js subscribes to the store and animates the difference between the old and new state. The UI dispatches Actions.

## Docs

- [Roadmap (v0)](./roadmap-v0.md)
- [Decisions](./decisions.md)
