import { Group, Scene, Vector3, WebGLRenderer, NoToneMapping, PCFSoftShadowMap } from 'three'
import { QUALITY, detectQuality, type QualityName } from '@/config'
import { loadPBR } from './Assets'
import { Loop } from './Loop'
import { createBoard } from '@/scene/Board'
import { loadLayout } from '@/scene/layout'
import { createRuins } from '@/scene/Ruins'
import { setupEnvironment } from '@/scene/Environment'
import { Lights } from '@/scene/Lights'
import { Zones } from '@/scene/Zones'
import { Particles } from '@/scene/Particles'
import { CameraRig } from '@/scene/CameraRig'
import { PostFX } from '@/scene/PostFX'
import { Tweens } from '@/anim/Tweens'
import { LandingFx } from '@/anim/LandingFx'
import { CardGlow } from '@/anim/CardGlow'
import { AttackFx } from '@/anim/AttackFx'
import { AttackArrow } from '@/anim/AttackArrow'
import { BoardState } from '@/state/BoardState'
import { Card } from '@/cards/Card'
import { DeckPile } from '@/cards/DeckPile'
import { Hand } from '@/cards/Hand'
import { HandInteraction, type ContextTarget } from '@/interaction/HandInteraction'
import { attackTargetKeys, CardActions, isAttacker, type DeckPos } from '@/interaction/CardActions'
import { ContextMenu } from '@/ui/ContextMenu'
import { Hud } from '@/ui/Hud'
import { CardDetail } from '@/ui/CardDetail'
import { PileViewer } from '@/ui/PileViewer'
import { ActionBar, type BarExtra } from '@/ui/ActionBar'
import { buildDemoDeck, loadDemoDeck, shuffle, type CardData } from '@/data/demoDeck'
import { disposeCardArt, preloadCardArt } from '@/cards/CardArt'
import { getZoneByKey, isViewPile } from '@/scene/ZoneLayout'
import { copyData, type CardSnap, type Snap } from '@/state/Snapshot'

const PHASES = ['Draw', 'Standby', 'Main 1', 'Battle', 'Main 2', 'End']

export class App {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly loop: Loop
  readonly rig: CameraRig
  quality: QualityName = detectQuality()
  zones!: Zones
  lights!: Lights
  particles!: Particles
  landing!: LandingFx
  private attackFx!: AttackFx
  private arrow!: AttackArrow
  fx!: PostFX
  disposed = false
  readonly tweens: Tweens
  readonly hand: Hand
  private deckCards: CardData[] = []
  private deckPile!: DeckPile
  private board!: BoardState
  private actions!: CardActions
  private menu = new ContextMenu()
  private menuPos = { x: 0, y: 0 }
  private hud?: Hud
  private detail?: CardDetail
  private viewer?: PileViewer
  private actionBar?: ActionBar
  private glow?: CardGlow
  private hintDefault = ''
  private live = new Map<number, Card>()
  private past: Snap[] = []
  private lp1 = 8000
  private lp2 = 8000
  private phase = 0
  private turn = 1
  private activePlayer: 'p1' | 'p2' = 'p1'
  private interaction?: HandInteraction
  private timers: number[] = []
  private canvas: HTMLCanvasElement
  private debugDispose?: () => void
  private lastDt = 1 / 60

  constructor(canvas: HTMLCanvasElement) {
    const q = QUALITY[this.quality]
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.toneMapping = NoToneMapping // handled in PostFX
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFSoftShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio))

    // Overlays are oriented here, only on frames that actually render.
    this.loop = new Loop(() => {
      for (const card of this.live.values()) card.billboard(this.rig.camera)
      this.fx.render(this.lastDt)
    })
    this.rig = new CameraRig(this.loop.invalidate)
    this.canvas = canvas
    this.tweens = new Tweens(this.loop.invalidate)
    this.hand = new Hand(this.tweens)
    // hand is parented to the camera so it stays at the bottom of the screen
    this.rig.camera.add(this.hand.group)
    this.scene.add(this.rig.camera)
  }

  /** Draw the top card of player 1's deck into the hand. */
  drawCard(commit = true) {
    if (this.deckCards.length === 0) return
    if (commit) this.record()
    const card = this.spawnFromDeck()
    if (!card) return
    this.hand.add(card)
    this.sync()
  }

  /** Take the top card off the deck as a face-down mesh lying on the deck pile. */
  private spawnFromDeck(): Card | null {
    const data = this.deckCards.pop()
    if (!data) return null
    this.deckPile.setCount(this.deckCards.length)
    const zone = getZoneByKey('p1:deck:0')!
    const card = new Card(data)
    card.mesh.position.set(zone.x, this.deckPile.topY + 0.02, zone.z)
    card.mesh.rotation.set(Math.PI / 2, 0, 0)
    this.scene.add(card.mesh)
    this.live.set(card.data.uid, card)
    this.loop.invalidate()
    return card
  }

  private millCard() {
    if (this.deckCards.length === 0) return
    this.record()
    const card = this.spawnFromDeck()
    if (!card) return
    card.faceUp = true
    this.board.place(card, 'p1:gy:0', 0.4)
    this.sync()
  }

  private shuffleDeck() {
    this.record()
    shuffle(this.deckCards)
    this.sync()
  }

  /** Put a card back into player 1's deck. `commit` is false when a drag already snapshotted. */
  private returnToDeck(card: Card, pos: DeckPos = 'top', commit = true) {
    if (commit) this.record()
    this.tweens.cancel(card.mesh)
    this.board.remove(card)
    this.hand.remove(card)
    // the mesh may still be parented to the hand group, not the scene
    card.mesh.removeFromParent()
    this.live.delete(card.data.uid)
    card.dispose()
    if (pos === 'bottom') this.deckCards.unshift(card.data)
    else this.deckCards.push(card.data)
    if (pos === 'shuffle') shuffle(this.deckCards)
    this.deckPile.setCount(this.deckCards.length)
    this.deselect()
    this.sync()
  }

  private openContext = (t: ContextTarget, x: number, y: number, above: boolean) => {
    this.menuPos = { x, y }
    if (t.kind === 'deck') {
      this.menu.open(x, y, `Deck (${this.deckCards.length})`, [
        { label: 'Draw', action: () => this.drawCard() },
        { label: 'Mill 1 (to GY)', action: () => this.millCard() },
        { label: 'Shuffle', action: () => this.shuffleDeck() },
      ], above)
    } else if (t.kind === 'hand') {
      this.menu.open(x, y, t.card.data.name, this.actions.handItems(t.card), above)
    } else {
      this.menu.open(x, y, t.card.data.name, this.actions.boardItems(t.card), above)
    }
  }

  drawCards(n: number) {
    for (let i = 0; i < n; i++) this.timers.push(window.setTimeout(() => this.drawCard(false), i * 180))
  }

  private changeLp(owner: 'p1' | 'p2', delta: number) {
    this.record()
    if (owner === 'p1') this.lp1 = Math.max(0, this.lp1 + delta)
    else this.lp2 = Math.max(0, this.lp2 + delta)
    this.sync()
  }

  /** Jump to a phase. Does not change whose turn it is. */
  setPhase(i: number) {
    if (i < 0 || i >= PHASES.length || i === this.phase) return
    this.record()
    this.phase = i
    this.sync()
  }

  /** Hand the turn over: next turn, back to Draw, other player. */
  private endTurn() {
    this.record()
    this.turn += 1
    this.phase = 0
    this.activePlayer = this.activePlayer === 'p1' ? 'p2' : 'p1'
    this.sync()
  }

  private record() {
    this.past.push(this.capture())
    if (this.past.length > 80) this.past.shift()
    this.hud?.setUndoEnabled(true)
  }

  private undo() {
    const snap = this.past.pop()
    if (!snap) return
    this.menu.close()
    this.restore(snap)
    this.sync()
  }

  private capture(): Snap {
    const cards: CardSnap[] = []
    this.deckCards.forEach((data, index) => {
      cards.push({ data: copyData(data), faceUp: false, defense: false, counters: 0, place: 'deck', index })
    })
    this.hand.cards.forEach((card, index) => cards.push(this.snapOf(card, 'hand', index)))
    for (const [key, list] of this.board.entries()) {
      list.forEach((card, index) => cards.push(this.snapOf(card, 'zone', index, key)))
    }
    return { cards, lp1: this.lp1, lp2: this.lp2, phase: this.phase, turn: this.turn, activePlayer: this.activePlayer }
  }

  private snapOf(card: Card, place: 'hand' | 'zone', index: number, key?: string): CardSnap {
    return { data: copyData(card.data), faceUp: card.faceUp, defense: card.defense, counters: card.counters, place, key, index }
  }

  private restore(snap: Snap) {
    for (const card of this.live.values()) {
      this.tweens.cancel(card.mesh)
      card.mesh.removeFromParent()
    }
    this.hand.clear()
    this.board.clear()
    this.deckCards = []
    const keep = new Map<number, Card>()

    for (const s of snap.cards.filter((c) => c.place === 'deck').sort((a, b) => a.index - b.index)) {
      this.deckCards.push(copyData(s.data))
    }
    for (const s of snap.cards.filter((c) => c.place === 'hand').sort((a, b) => a.index - b.index)) {
      const fresh = !this.live.has(s.data.uid)
      const card = this.take(s, keep)
      if (fresh) {
        const deck = getZoneByKey('p1:deck:0')!
        card.mesh.position.set(deck.x, 0.4, deck.z)
        card.mesh.rotation.set(Math.PI / 2, 0, 0)
      }
      this.scene.add(card.mesh)
      this.hand.add(card, 0.3)
    }
    const zoned = snap.cards.filter((c) => c.place === 'zone').sort((a, b) => a.key!.localeCompare(b.key!) || a.index - b.index)
    for (const s of zoned) {
      const fresh = !this.live.has(s.data.uid)
      const card = this.take(s, keep)
      card.faceUp = s.faceUp
      card.defense = s.defense
      if (fresh && s.key) {
        const zone = getZoneByKey(s.key)
        if (zone) card.mesh.position.set(zone.x, 0.3, zone.z)
      }
      this.scene.add(card.mesh)
      this.board.place(card, s.key!, 0.25)
    }
    for (const [uid, card] of this.live) if (!keep.has(uid)) card.dispose()
    this.live = keep
    this.deckPile.setCount(this.deckCards.length)
    this.lp1 = snap.lp1
    this.lp2 = snap.lp2
    this.phase = snap.phase
    this.turn = snap.turn
    this.activePlayer = snap.activePlayer
  }

  private take(s: CardSnap, keep: Map<number, Card>): Card {
    let card = this.live.get(s.data.uid)
    if (!card) card = new Card(copyData(s.data))
    else if (s.data.atk !== undefined && (card.data.atk !== s.data.atk || card.data.def !== s.data.def)) {
      card.setStats(s.data.atk, s.data.def ?? 0)
    }
    card.setCounters(s.counters)
    keep.set(s.data.uid, card)
    return card
  }

  private sync() {
    this.hud?.setLp('p1', this.lp1)
    this.hud?.setLp('p2', this.lp2)
    this.hud?.setPhase(this.turn, PHASES[this.phase] ?? 'Draw', this.activePlayer)
    this.hud?.setUndoEnabled(this.past.length > 0)
    this.viewer?.refresh()
    this.refreshShortcuts()
    this.loop.invalidate()
  }

  /** Swap the top hint while a summon, set, or activate is waiting for a zone. */
  private setTargetHint(active: boolean, attack = false) {
    const el = document.querySelector<HTMLElement>('.hint')
    if (!el) return
    if (!this.hintDefault) this.hintDefault = el.textContent ?? ''
    const direct = attackTargetKeys(this.board).length === 0
    const prompt = attack
      ? direct
        ? 'Waiting for a target · click an opposing zone for a direct attack · Esc to cancel'
        : 'Waiting for a target · click a monster to attack · Esc to cancel'
      : 'Choose a zone · Esc to cancel'
    el.textContent = active ? prompt : this.hintDefault
    el.classList.toggle('is-target', active)
  }

  /** Drop the pinned card after a summon, move, or other card action. */
  private deselect() {
    this.detail?.pin(null)
  }

  /** Shortcut buttons for a selected hand card, or a card clicked in a pile. */
  private refreshShortcuts() {
    const card = this.interaction?.pinnedCard ?? null
    const dragging = this.interaction?.isDragging ?? false
    const inHand = !!card && !dragging && this.hand.cards.includes(card)
    const inPile = !!card && !dragging && !!card.zoneKey && isViewPile(card.zoneKey)
    const extra: BarExtra[] =
      inPile && card.zoneKey?.includes(':gy:')
        ? [{ label: 'To Hand', icon: 'hand', run: (c) => this.actions.toHand(c) }]
        : []
    this.actionBar?.setCard(inHand || inPile ? card : null, extra)
    this.viewer?.setSelected(inPile ? card : null)
    this.glow?.set(inHand ? card : null)
  }

  /** Step 1 feedback: arrow to the declared zone and a confirm prompt. */
  private onDeclare(attacker: Card | null, key: string | null, declared: boolean) {
    const zone = key ? getZoneByKey(key) : undefined
    if (attacker && zone && declared) {
      const from = attacker.mesh.position
      this.arrow.show(from, new Vector3(zone.x, from.y, zone.z))
      this.setHintText('Click the target again to confirm the attack · Esc to cancel')
    } else {
      this.arrow.hide()
    }
  }

  private setHintText(text: string) {
    const el = document.querySelector<HTMLElement>('.hint')
    if (el) el.textContent = text
  }

  private inBattle() {
    return PHASES[this.phase] === 'Battle'
  }

  /** Visual only: no damage, no destruction. */
  private declareAttack(card: Card) {
    if (!this.inBattle() || !isAttacker(card)) return
    // No monsters to hit: every opposing monster zone is a direct-attack target.
    const hit = attackTargetKeys(this.board)
    const keys = hit.length ? hit : Array.from({ length: 5 }, (_, i) => `p2:monster:${i}`)
    this.interaction?.beginAttack(card, keys)
  }

  /** Face-down extra deck: one Fusion, Synchro, XYZ, and Link monster. */
  private seedExtra(cards: CardData[]) {
    const zone = getZoneByKey('p1:extra:0')
    if (!zone) return
    for (const data of cards) {
      const card = new Card(data)
      card.faceUp = false
      card.mesh.position.set(zone.x, 0.4, zone.z)
      this.scene.add(card.mesh)
      this.live.set(card.data.uid, card)
      this.board.place(card, zone.key, 0)
    }
  }

  async init() {
    const q = QUALITY[this.quality]
    const r = this.renderer
    const deckPromise = loadDemoDeck()
      .catch((e) => {
        console.warn('Card catalog unavailable, using placeholders', e)
        return buildDemoDeck()
      })
      .then(async (deck) => {
        await preloadCardArt([...deck.main, ...deck.extra], r)
        return deck
      })
    const ruinsPromise = loadLayout()
      .then(createRuins)
      .catch((e) => {
      console.warn('Ruins failed to load', e)
      return new Group()
    })
    const [stone, grass, deck, ruins] = await Promise.all([
      loadPBR('stone', 'stone', r, 4, true),
      loadPBR('grass', 'grass', r, 1),
      deckPromise,
      ruinsPromise,
      setupEnvironment(this.scene, r),
    ])
    if (this.disposed) return
    this.deckCards = shuffle(deck.main)

    this.scene.add(createBoard(stone, grass), ruins)

    this.lights = new Lights(r, q.shadowMapSize)
    this.scene.add(this.lights.group)

    this.zones = new Zones(this.loop.invalidate)
    this.scene.add(this.zones.mesh)

    this.particles = new Particles(q.particleCount)
    this.scene.add(this.particles.points)
    this.landing = new LandingFx(this.scene, this.tweens)

    this.fx = new PostFX(r, this.scene, this.rig.camera, q)

    this.deckPile = new DeckPile('p1:deck:0', this.deckCards.length)
    const oppDeck = new DeckPile('p2:deck:0', 40)
    this.scene.add(this.deckPile.mesh, oppDeck.mesh)
    this.board = new BoardState(this.tweens, this.landing)
    this.seedExtra(deck.extra)
    this.attackFx = new AttackFx(this.tweens, this.board, this.landing)
    this.arrow = new AttackArrow(this.scene, this.loop.invalidate)
    this.loop.add(this.arrow)
    this.interaction = new HandInteraction({
      canvas: this.canvas,
      camera: this.rig.camera,
      scene: this.scene,
      hand: this.hand,
      deck: this.deckPile.mesh,
      board: this.board,
      tweens: this.tweens,
      zones: this.zones,
      onDeckClick: () => this.drawCard(),
      onReturnToDeck: (card) => this.returnToDeck(card, 'top', false),
      onContext: this.openContext,
      onCommit: () => this.record(),
      onChange: () => this.sync(),
      onViewPile: (key) => this.viewer?.open(key),
      onHoverCard: (card) => this.detail?.hover(card),
      onSelectCard: (card) => this.detail?.pin(card),
      onDrag: () => this.refreshShortcuts(),
      onAction: () => this.deselect(),
      onPlace: (card, key, faceUp, defense) => this.actions.moveTo(card, key, faceUp, defense),
      onAttack: (attacker, target) => {
        this.attackFx.attack(attacker, target)
        this.deselect()
      },
      onDeclare: (attacker, key, declared) => this.onDeclare(attacker, key, declared),
      onTargeting: (active, attack) => {
        this.setTargetHint(active, attack)
        this.actionBar?.setTargeting(active)
      },
    })
    this.actions = new CardActions({
      scene: this.scene,
      hand: this.hand,
      board: this.board,
      returnToDeck: (card, pos) => this.returnToDeck(card, pos),
      editStats: (card) => {
        const p = this.menuPos
        this.menu.openStats(p.x, p.y, card.data.atk ?? 0, card.data.def ?? 0, (a, d) => {
          this.record()
          card.setStats(a, d)
          this.deselect()
          this.sync()
        })
      },
      invalidate: this.loop.invalidate,
      commit: () => this.record(),
      onChange: () => this.sync(),
      onAction: () => this.deselect(),
      requestTarget: (card, play) => {
        this.viewer?.close()
        this.interaction?.beginTarget(card, play)
      },
      inBattle: () => this.inBattle(),
      attack: (card) => this.declareAttack(card),
    })

    const ui = document.getElementById('ui') ?? document.body
    this.hud = new Hud(ui, {
      onLp: (owner, delta) => this.changeLp(owner, delta),
      phases: PHASES,
      onSetPhase: (i) => this.setPhase(i),
      onEndTurn: () => this.endTurn(),
      onUndo: () => this.undo(),
      onDie: () => this.hud?.toast(`Die: ${1 + Math.floor(Math.random() * 6)}`),
      onCoin: () => this.hud?.toast(Math.random() < 0.5 ? 'Heads' : 'Tails'),
    })
    const interaction = this.interaction
    this.glow = new CardGlow()
    this.loop.add(this.glow)
    this.actionBar = new ActionBar(
      ui,
      (card, play) => this.actions.play(card, play),
      () => interaction?.cancelTargeting(),
      (card) => this.declareAttack(card),
    )
    this.detail = new CardDetail(ui, (card) => {
      interaction?.setPinned(card)
      this.refreshShortcuts()
      // Selecting a field monster in battle starts the attack declaration.
      if (card && this.inBattle() && isAttacker(card)) this.declareAttack(card)
    })
    this.viewer = new PileViewer(ui, (key) => this.board.cardsIn(key), {
      onOpen: () => {
        interaction?.lock()
        this.deselect()
      },
      onClose: () => {
        interaction?.unlock()
        this.deselect()
      },
      onCardContext: (card, x, y) => {
        this.menuPos = { x, y }
        this.menu.open(x, y, card.data.name, this.actions.pileItems(card))
      },
      onDragOut: (card, ev) => {
        try {
          interaction?.beginExternalDrag(card, ev)
        } finally {
          this.viewer?.close()
        }
      },
      onCardHover: (card) => this.detail?.hover(card, true),
      onCardClick: (card) => this.detail?.pin(card),
    })
    this.hud.setPhase(this.turn, PHASES[0], this.activePlayer)

    this.menu.onOpen = () => interaction?.lock()
    this.menu.onClose = () => interaction?.unlock()

    this.loop.add(this.interaction)
    this.loop.add(this.rig)
    this.loop.add(this.tweens)
    this.loop.add(this.particles)
    this.loop.add(this.landing)
    window.addEventListener('resize', this.onResize)
    window.addEventListener('keydown', this.onKey)
    this.onResize()
    this.lights.refreshShadows()

    this.loop.start()
    this.drawCards(5)

    if (import.meta.env.DEV) {
      const { setupDebug } = await import('./Debug')
      if (this.disposed) return
      this.debugDispose = setupDebug(this)
    }
  }

  private onResize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setSize(w, h, false)
    this.rig.resize(w, h)
    this.hand.setAspect(w / h)
    this.fx.setSize(w, h)
    this.particles.setViewportHeight(h * this.renderer.getPixelRatio())
    this.loop.invalidate()
  }

  private onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault()
      this.undo()
      return
    }
    if (e.key === 'v' || e.key === 'V') this.rig.cycleView()
    if (e.key === 'd' || e.key === 'D') this.drawCard()
  }

  dispose() {
    this.disposed = true
    this.loop.stop()
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('keydown', this.onKey)
    this.timers.forEach(clearTimeout)
    this.interaction?.dispose()
    this.menu.dispose()
    this.hud?.dispose()
    this.detail?.dispose()
    this.actionBar?.dispose()
    this.glow?.dispose()
    this.arrow?.dispose()
    this.viewer?.dispose()
    this.landing?.dispose()
    disposeCardArt()
    this.debugDispose?.()
    this.fx?.dispose()
    this.scene.traverse((o) => {
      const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] }
      m.geometry?.dispose()
      if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose())
      else m.material?.dispose()
    })
    this.renderer.dispose()
  }
}
