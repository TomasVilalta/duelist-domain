import type { CardData } from '@/data/demoDeck'

export interface CardSnap {
  data: CardData
  faceUp: boolean
  defense: boolean
  counters: number
  place: 'deck' | 'hand' | 'zone'
  /** Zone key, or absent for the hand and the deck. */
  key?: string
  index: number
}

export interface Snap {
  cards: CardSnap[]
  lp1: number
  lp2: number
  phase: number
  turn: number
  /** Whose turn it is. Odd turns start as you, even turns as the opponent. */
  activePlayer: 'p1' | 'p2'
}

export function copyData(d: CardData): CardData {
  return {
    uid: d.uid,
    name: d.name,
    kind: d.kind,
    atk: d.atk,
    def: d.def,
    level: d.level,
    passcode: d.passcode,
    image: d.image,
    type: d.type,
    race: d.race,
    attribute: d.attribute,
    archetype: d.archetype,
    desc: d.desc,
  }
}
