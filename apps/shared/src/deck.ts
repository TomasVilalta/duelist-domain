import type { DeckList } from './state'

export interface YdkDeck {
  main: number[]
  extra: number[]
  side: number[]
}

/**
 * Parses a `.ydk` file: passcodes, one per line, under `#main`, `#extra` and `!side`.
 * Other comment lines (`#created by ...`), blank lines and CRLF endings are ignored, and duplicates are kept.
 */
export function parseYdk(text: string): YdkDeck {
  const deck: YdkDeck = { main: [], extra: [], side: [] }
  let section: keyof YdkDeck | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '#main') section = 'main'
    else if (line === '#extra') section = 'extra'
    else if (line === '!side') section = 'side'
    else if (section && /^\d+$/.test(line)) deck[section].push(Number(line))
  }
  return deck
}

/** Drops passcodes the catalog doesn't know, and reports them in `missing` (each once). */
export function resolveDeck(deck: DeckList, known: (passcode: number) => boolean): { deck: DeckList; missing: number[] } {
  const missing = new Set<number>()
  const keep = (list: number[]) =>
    list.filter((p) => {
      if (known(p)) return true
      missing.add(p)
      return false
    })
  return { deck: { main: keep(deck.main), extra: keep(deck.extra) }, missing: [...missing] }
}
