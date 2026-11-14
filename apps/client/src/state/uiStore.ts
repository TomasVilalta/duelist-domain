import { create } from 'zustand'
import type { Seat } from '@duelist/shared'

export type TargetingMode = { kind: 'attack'; attacker: string } | null

/** Non-game state: never sent to the server and never part of undo. */
export interface UiStore {
  localSeat: Seat
  selected: string | null
  hovered: string | null
  pinned: string | null
  targeting: TargetingMode
  select(uid: string | null): void
  hover(uid: string | null): void
  pin(uid: string | null): void
  setTargeting(mode: TargetingMode): void
}

export const useUiStore = create<UiStore>()((set) => ({
  localSeat: 0,
  selected: null,
  hovered: null,
  pinned: null,
  targeting: null,
  select: (selected) => set({ selected }),
  hover: (hovered) => set({ hovered }),
  pin: (pinned) => set({ pinned }),
  setTargeting: (targeting) => set({ targeting }),
}))
