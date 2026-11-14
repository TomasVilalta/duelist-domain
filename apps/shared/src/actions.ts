import type { Seat } from './seat'
import type { Phase } from './state'

/** Every action carries the seat of the player who performed it. */
interface Base {
  seat: Seat
}

export type Action =
  /** `index` counts from the bottom of the destination. Omitted means the top. */
  | (Base & { type: 'move'; uid: string; to: string; index?: number; faceUp?: boolean; defense?: boolean })
  | (Base & { type: 'flip'; uid: string })
  | (Base & { type: 'setPosition'; uid: string; faceUp: boolean; defense: boolean })
  | (Base & { type: 'addCounter'; uid: string; delta: number })
  /** Top of the acting seat's deck to its hand. */
  | (Base & { type: 'draw'; count: number })
  /** Top of the acting seat's deck to its graveyard. */
  | (Base & { type: 'mill'; count: number })
  /** `order` is the new bottom-to-top order and must be a permutation of the zone's cards. */
  | (Base & { type: 'shuffle'; zone: string; order: string[] })
  | (Base & { type: 'setLP'; target: Seat; lp: number })
  | (Base & { type: 'setPhase'; phase: Phase })
  | (Base & { type: 'endTurn' })
  | (Base & { type: 'declareAttack'; attacker: string; target: string | null })
  | (Base & { type: 'clearAttack' })

export type ActionType = Action['type']
