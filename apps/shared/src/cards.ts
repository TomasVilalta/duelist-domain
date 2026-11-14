export type CardKind = 'monster' | 'spell' | 'trap'

/** Static catalog data for one card, keyed by passcode. Contains no per-game instance fields. */
export interface CardInfo {
  /** YGOPRODeck passcode. Copies of a card share one. */
  passcode: number
  name: string
  kind: CardKind
  atk?: number
  def?: number
  level?: number
  /** Pendulum scale, when this is a Pendulum monster. */
  scale?: number
  /** Card image URL or path. */
  image?: string
  /** Printed text, for example "Normal Monster" or "Spell Card". */
  type?: string
  race?: string
  attribute?: string
  archetype?: string
  desc?: string
}

export const EXTRA_KINDS = ['Fusion', 'Synchro', 'XYZ', 'Link'] as const
export type ExtraKind = (typeof EXTRA_KINDS)[number]

/** Fusion, Synchro, XYZ, or Link. Pendulum monsters in the main deck do not match. */
export function extraDeckKind(type?: string): ExtraKind | null {
  if (!type) return null
  const lower = type.toLowerCase()
  return EXTRA_KINDS.find((kind) => lower.includes(kind.toLowerCase())) ?? null
}
