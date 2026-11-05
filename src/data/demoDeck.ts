export type CardKind = 'monster' | 'spell' | 'trap'

export interface CardData {
  uid: number
  name: string
  kind: CardKind
  atk?: number
  def?: number
  level?: number
  /** YGOPRODeck passcode. Copies of a card share one image. */
  passcode?: number
  /** Local card image, when this came from the catalog. */
  image?: string
  /** Printed text, for example "Normal Monster" or "Spell Card". */
  type?: string
  race?: string
  attribute?: string
  archetype?: string
  desc?: string
}

type Template = Omit<CardData, 'uid'>

const TEMPLATES: Template[] = [
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
]

interface CatalogCard {
  passcode: number
  name: string
  kind: CardKind
  atk?: number
  def?: number
  level?: number
  type?: string
  race?: string
  attribute?: string
  archetype?: string
  desc?: string
  file: string
}

/** 40 cards from the local YGOPRODeck catalog: each card twice. */
export async function loadDemoDeck(): Promise<CardData[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}cards/catalog.json`)
  if (!res.ok) throw new Error(`card catalog ${res.status}`)
  const list = (await res.json()) as CatalogCard[]
  const deck: CardData[] = []
  let uid = 1
  const base = import.meta.env.BASE_URL
  for (let copy = 0; copy < 2; copy++) {
    for (const c of list) {
      deck.push({
        uid: uid++,
        name: c.name,
        kind: c.kind,
        atk: c.atk,
        def: c.def,
        level: c.level,
        passcode: c.passcode,
        image: `${base}cards/${c.file}`,
        type: c.type,
        race: c.race,
        attribute: c.attribute,
        archetype: c.archetype,
        desc: c.desc,
      })
    }
  }
  return deck
}

/** 40 cards: each template twice, with unique ids. */
export function buildDemoDeck(): CardData[] {
  const deck: CardData[] = []
  let uid = 1
  for (let copy = 0; copy < 2; copy++) for (const t of TEMPLATES) deck.push({ ...t, uid: uid++ })
  return deck
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
