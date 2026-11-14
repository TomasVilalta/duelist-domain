import { describe, expect, it } from 'vitest'
import { extraDeckKind } from './cards'

describe('extraDeckKind', () => {
  it('detects each extra deck type', () => {
    expect(extraDeckKind('Fusion Monster')).toBe('Fusion')
    expect(extraDeckKind('Synchro Monster')).toBe('Synchro')
    expect(extraDeckKind('XYZ Monster')).toBe('XYZ')
    expect(extraDeckKind('Link Monster')).toBe('Link')
  })

  it('is case-insensitive and handles combined types', () => {
    expect(extraDeckKind('Xyz Monster')).toBe('XYZ')
    expect(extraDeckKind('Pendulum Effect Fusion Monster')).toBe('Fusion')
  })

  it('returns null for main deck monsters and missing types', () => {
    expect(extraDeckKind('Effect Monster')).toBeNull()
    expect(extraDeckKind('Pendulum Effect Monster')).toBeNull()
    expect(extraDeckKind('Spell Card')).toBeNull()
    expect(extraDeckKind(undefined)).toBeNull()
  })
})
