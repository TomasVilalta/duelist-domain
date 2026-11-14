import { EXTRA_KINDS, extraDeckKind, type CardInfo, type CardKind } from '@duelist/shared'

/** A card instance in the current client: shared catalog data plus a per-game uid. */
export type CardData = Omit<CardInfo, 'passcode'> & { uid: number; passcode?: number }

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
  { name: 'Ember Chimera', kind: 'monster', atk: 2500, def: 2000, level: 8, type: 'Fusion Monster' },
  { name: 'Gale Wyrm', kind: 'monster', atk: 2500, def: 2000, level: 8, type: 'Synchro Monster' },
  { name: 'Ruin Number', kind: 'monster', atk: 2500, def: 2000, level: 4, type: 'XYZ Monster' },
  { name: 'Thorn Linker', kind: 'monster', atk: 2300, type: 'Link Monster' },
  { name: 'Dusk Pendulum', kind: 'monster', atk: 1500, def: 1500, level: 4, scale: 8, type: 'Pendulum Effect Monster' },
  { name: 'Glade Pendulum', kind: 'monster', atk: 1800, def: 800, level: 5, scale: 1, type: 'Pendulum Effect Monster' },
]

export interface DemoDeck {
  /** Shuffled into the Deck. Two copies of each card, one of each Pendulum. */
  main: CardData[]
  /** One Fusion, Synchro, XYZ, and Link monster. */
  extra: CardData[]
}

function copiesFor(type?: string): { n: number; extra: boolean } {
  if (extraDeckKind(type)) return { n: 1, extra: true }
  if (type?.includes('Pendulum')) return { n: 1, extra: false }
  return { n: 2, extra: false }
}

function deal(templates: Template[]): DemoDeck {
  const main: CardData[] = []
  const extra: CardData[] = []
  let uid = 1
  for (const t of templates) {
    const { n, extra: toExtra } = copiesFor(t.type)
    for (let i = 0; i < n; i++) {
      const card = { ...t, uid: uid++ }
      if (toExtra) extra.push(card)
      else main.push(card)
    }
  }
  extra.sort((a, b) => EXTRA_KINDS.indexOf(extraDeckKind(a.type)!) - EXTRA_KINDS.indexOf(extraDeckKind(b.type)!))
  return { main, extra }
}

interface CatalogCard {
  passcode: number
  name: string
  kind: CardKind
  atk?: number
  def?: number
  level?: number
  scale?: number
  type?: string
  race?: string
  attribute?: string
  archetype?: string
  desc?: string
  file: string
}

/** Main deck plus one extra-deck monster of each type, from the local catalog. */
export async function loadDemoDeck(): Promise<DemoDeck> {
  const res = await fetch(`${import.meta.env.BASE_URL}cards/catalog.json`)
  if (!res.ok) throw new Error(`card catalog ${res.status}`)
  const list = (await res.json()) as CatalogCard[]
  const base = import.meta.env.BASE_URL
  return deal(
    list.map((c) => ({
      name: c.name,
      kind: c.kind,
      atk: c.atk,
      def: c.def ?? undefined,
      level: c.level || undefined,
      scale: c.scale ?? undefined,
      passcode: c.passcode,
      image: `${base}cards/${c.file}`,
      type: c.type,
      race: c.race,
      attribute: c.attribute,
      archetype: c.archetype,
      desc: c.desc,
    })),
  )
}

/** Placeholder main deck and extra deck, used when the catalog cannot be loaded. */
export function buildDemoDeck(): DemoDeck {
  return deal(TEMPLATES)
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
