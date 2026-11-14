import { describe, expect, it, vi } from 'vitest'
import { Object3D } from 'three'
import { apply, createGame, type Action, type CardInfo, type CardState, type GameState } from '@duelist/shared'
import { CardViews, type CardView } from './CardViews'

class FakeView implements CardView {
  readonly mesh = new Object3D()
  state: CardState | null = null
  zoneKey = ''
  covered = false
  disposed = false
  readonly uid: string
  constructor(uid: string) {
    this.uid = uid
  }
  applyState(state: CardState, zoneKey: string, covered: boolean) {
    this.state = state
    this.zoneKey = zoneKey
    this.covered = covered
  }
  dispose() {
    this.disposed = true
  }
}

const ctx = { isPendulum: () => false }
const info = (passcode: number): CardInfo => ({ passcode, name: `#${passcode}`, kind: 'monster' })

function setup() {
  const deck = { main: Array.from({ length: 10 }, (_, i) => 100 + i), extra: [900] }
  let game = createGame({ players: [{ name: 'A', deck }, { name: 'B', deck }] })
  const created: FakeView[] = []
  const views = new CardViews<FakeView>(info, (uid) => {
    const v = new FakeView(uid)
    created.push(v)
    return v
  })
  const run = (a: Action) => {
    const r = apply(game, a, ctx)
    if (!r.ok) throw new Error(r.error)
    game = r.state
    return views.sync(game)
  }
  return { views, created, run, game: () => game }
}

const top = (g: GameState, key: string) => g.zones[key]!.at(-1)!

describe('CardViews', () => {
  it('creates no views for deck and extra deck cards', () => {
    const { views, game } = setup()
    expect(views.sync(game())).toEqual({ added: [], removed: [] })
    expect(views.size).toBe(0)
  })

  it('creates a view when a card is drawn and disposes it when it returns to the deck', () => {
    const { views, run, created } = setup()
    const { added } = run({ type: 'draw', seat: 0, count: 5 })
    expect(added).toHaveLength(5)
    expect(views.size).toBe(5)
    for (const uid of added) {
      const { removed } = run({ type: 'move', seat: 0, uid, to: 's0:deck:0' })
      expect(removed).toEqual([uid])
    }
    expect(views.size).toBe(0)
    expect(created.every((v) => v.disposed)).toBe(true)
  })

  it('keeps the same view while a card moves between rendered zones and applies its state', () => {
    const { views, run, game } = setup()
    const [uid] = run({ type: 'draw', seat: 0, count: 1 }).added
    const view = views.get(uid!)!
    const r = run({ type: 'move', seat: 0, uid: uid!, to: 's0:monster:2', faceUp: false, defense: true })
    expect(r).toEqual({ added: [], removed: [] })
    expect(views.get(uid!)).toBe(view)
    expect(view.zoneKey).toBe('s0:monster:2')
    expect(view.state).toBe(game().cards[uid!])
    expect(view.state).toMatchObject({ faceUp: false, defense: true })
  })

  it('marks Xyz materials under the top card as covered', () => {
    const { views, run, game } = setup()
    const [a, b] = run({ type: 'draw', seat: 0, count: 2 }).added
    run({ type: 'move', seat: 0, uid: a!, to: 's0:monster:0', faceUp: true })
    run({ type: 'move', seat: 0, uid: b!, to: 's0:monster:0', faceUp: true })
    expect(top(game(), 's0:monster:0')).toBe(b)
    expect(views.get(a!)!.covered).toBe(true)
    expect(views.get(b!)!.covered).toBe(false)
  })

  it('skips cards missing from the catalog with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const views = new CardViews<FakeView>(() => undefined, (uid) => new FakeView(uid))
    const deck = { main: [1, 2], extra: [] }
    const game = createGame({ players: [{ name: 'A', deck }, { name: 'B', deck }] })
    const r = apply(game, { type: 'draw', seat: 0, count: 1 }, ctx)
    if (!r.ok) throw new Error(r.error)
    expect(views.sync(r.state).added).toEqual([])
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('dispose releases every view', () => {
    const { views, run, created } = setup()
    run({ type: 'draw', seat: 0, count: 3 })
    views.dispose()
    expect(views.size).toBe(0)
    expect(created.every((v) => v.disposed)).toBe(true)
  })
})
