import type { CardInfo } from '@duelist/shared'

/** Printed card data, as the client draws it. The card's game uid lives on `Card.uid`. */
export type CardData = Omit<CardInfo, 'passcode'> & { passcode?: number }

type Template = CardData

/** Placeholder cards, used when the card catalog can't be loaded. */
export const TEMPLATES: Template[] = [
  { name: 'Ember Drake', kind: 'monster', atk: 2400, def: 1800, level: 7 },
  { name: 'Moss Golem', kind: 'monster', atk: 1900, def: 2300, level: 6 },
  { name: 'Silver Wolf', kind: 'monster', atk: 1600, def: 1200, level: 4 },
  { name: 'Ruin Sentinel', kind: 'monster', atk: 2800, def: 2000, level: 8 },
  { name: 'Glade Archer', kind: 'monster', atk: 1400, def: 1000, level: 3 },
  { name: 'Stone Imp', kind: 'monster', atk: 800, def: 1500, level: 3 },
  { name: 'Storm Falcon', kind: 'monster', atk: 1800, def: 900, level: 4 },
  { name: 'Dusk Mage', kind: 'monster', atk: 2100, def: 1700, level: 5 },
  { name: 'Thorn Beast', kind: 'monster', atk: 1700, def: 1400, level: 4 },
  { name: 'Ancient Titan', kind: 'monster', atk: 3000, def: 2500, level: 10 },
  { name: 'Healing Spring', kind: 'spell' },
  { name: 'Lightning Bolt', kind: 'spell' },
  { name: 'Ancient Pact', kind: 'spell' },
  { name: 'Arcane Draw', kind: 'spell' },
  { name: 'Wild Growth', kind: 'spell' },
  { name: 'Hidden Snare', kind: 'trap' },
  { name: 'Mirror Ward', kind: 'trap' },
  { name: 'Rune Seal', kind: 'trap' },
  { name: 'Bramble Wall', kind: 'trap' },
  { name: 'Final Gambit', kind: 'trap' },
  { name: 'Ember Chimera', kind: 'monster', atk: 2500, def: 2000, level: 8, type: 'Fusion Monster' },
  { name: 'Gale Wyrm', kind: 'monster', atk: 2500, def: 2000, level: 8, type: 'Synchro Monster' },
  { name: 'Ruin Number', kind: 'monster', atk: 2500, def: 2000, level: 4, type: 'XYZ Monster' },
  { name: 'Thorn Linker', kind: 'monster', atk: 2300, type: 'Link Monster' },
  { name: 'Dusk Pendulum', kind: 'monster', atk: 1500, def: 1500, level: 4, scale: 8, type: 'Pendulum Effect Monster' },
  { name: 'Glade Pendulum', kind: 'monster', atk: 1800, def: 800, level: 5, scale: 1, type: 'Pendulum Effect Monster' },
]

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
