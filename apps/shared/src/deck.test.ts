import { describe, expect, it } from 'vitest'
import { parseYdk, resolveDeck } from './deck'

describe('parseYdk', () => {
  it('parses the three sections in order, keeping duplicates', () => {
    const text = '#created by Someone\n#main\n111\n222\n111\n#extra\n333\n!side\n444\n444\n'
    expect(parseYdk(text)).toEqual({ main: [111, 222, 111], extra: [333], side: [444, 444] })
  })

  it('ignores comments, blank lines, CRLF and trailing whitespace', () => {
    const text = '#created by X\r\n\r\n#main  \r\n 111 \r\n\r\n#extra\r\n222\t\r\n!side\r\n'
    expect(parseYdk(text)).toEqual({ main: [111], extra: [222], side: [] })
  })

  it('ignores lines that are not passcodes, and passcodes before any section', () => {
    expect(parseYdk('999\n#main\nabc\n12x\n5\n')).toEqual({ main: [5], extra: [], side: [] })
  })

  it('gives three empty lists for an empty file', () => {
    expect(parseYdk('')).toEqual({ main: [], extra: [], side: [] })
  })
})

describe('resolveDeck', () => {
  const known = (p: number) => p < 100

  it('keeps known passcodes and reports unknown ones once', () => {
    const r = resolveDeck({ main: [1, 200, 2, 200], extra: [3, 300] }, known)
    expect(r.deck).toEqual({ main: [1, 2], extra: [3] })
    expect(r.missing).toEqual([200, 300])
  })

  it('reports nothing when everything is known', () => {
    expect(resolveDeck({ main: [1], extra: [] }, known).missing).toEqual([])
  })
})
