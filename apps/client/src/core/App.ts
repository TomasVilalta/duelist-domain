import { Group, Scene, Vector3, WebGLRenderer, NoToneMapping, PCFSoftShadowMap } from 'three'
import { PHASES, type Action, type ApplyContext, type GameState, type Seat } from '@duelist/shared'
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
import { BoardView } from '@/scene/BoardView'
import { Tweens } from '@/anim/Tweens'
import { LandingFx } from '@/anim/LandingFx'
import { CardGlow } from '@/anim/CardGlow'
import { AttackFx } from '@/anim/AttackFx'
import { AttackArrow } from '@/anim/AttackArrow'
import { BoardState } from '@/state/BoardState'
import { useGameStore } from '@/state/gameStore'
import { useUiStore } from '@/state/uiStore'
import { createCardMesh, type Card } from '@/cards/Card'
import { DeckPile } from '@/cards/DeckPile'
import { Hand } from '@/cards/Hand'
import { HandInteraction, type ContextTarget, type Drop } from '@/interaction/HandInteraction'
import {
  attackTargetKeys,
  CardActions,
  isAttacker,
  opposingMonsterKeys,
  type PlayAction,
} from '@/interaction/CardActions'
import { ContextMenu } from '@/ui/ContextMenu'
import { Hud } from '@/ui/Hud'
import { CardDetail } from '@/ui/CardDetail'
import { PileViewer, type PileView } from '@/ui/PileViewer'
import { ActionBar, type BarExtra } from '@/ui/ActionBar'
import { shuffle, type CardData } from '@/data/demoDeck'
import { loadStartGame, type Catalog } from '@/data/loadGame'
import { disposeCardArt, preloadCardArt } from '@/cards/CardArt'
import { deckKey, getZoneByKey, isViewPile } from '@/scene/ZoneLayout'

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
  private catalog: Catalog = new Map()
  private applyCtx!: ApplyContext
  /** Renders the game state: the only code that moves card meshes between zones. */
  private bv!: BoardView
  private piles = new Map<string, DeckPile>()
  private unsubscribe?: () => void
  /** ATK/DEF edited from the menu. Not part of the game state yet, so they aren't undone. */
  private statEdits = new Map<string, { atk: number; def: number }>()
  /** Pile dialog that is open, if any. */
  private viewing: string | null = null
  /** Selected card in the deck dialog. */
  private deckPick: string | null = null
  /** Drag-out already shuffled; closing the dialog must not shuffle again. */
  private skipDeckShuffle = false
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
      if (this.bv) for (const card of this.bv.views.values()) card.billboard(this.rig.camera)
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

  // ---- game state: read it here, change it only through `dispatch` ----

  private get game(): GameState {
    return useGameStore.getState().game
  }

  private get seat(): Seat {
    return useUiStore.getState().localSeat
  }

  private dispatch = (action: Action) => useGameStore.getState().dispatch(action)

  private get ownDeck() {
    return deckKey(this.seat)
  }

  /** Printed data of a card by uid, with any edited ATK/DEF. */
  private dataOf(uid: string): CardData | null {
    const state = this.game.cards[uid]
    const info = state && this.catalog.get(state.passcode)
    if (!info) return null
    return { ...info, uid: Number(uid.slice(1)), ...this.statEdits.get(uid) }
  }

  /** Draw the top card of the local deck into the hand. */
  drawCard() {
    if ((this.game.zones[this.ownDeck]?.length ?? 0) === 0) return
    this.dispatch({ type: 'draw', seat: this.seat, count: 1 })
  }

  private millCard() {
    if ((this.game.zones[this.ownDeck]?.length ?? 0) === 0) return
    this.dispatch({ type: 'mill', seat: this.seat, count: 1 })
  }

  private shuffleDeck() {
    const list = this.game.zones[this.ownDeck] ?? []
    if (list.length < 2) return
    // TODO(server): the server will choose the order.
    this.dispatch({ type: 'shuffle', seat: this.seat, zone: this.ownDeck, order: shuffle([...list]) })
  }

  private pileViews(key: string): PileView[] {
    const game = this.game
    const deck = key === this.ownDeck
    return (game.zones[key] ?? []).flatMap((uid): PileView[] => {
      const data = this.dataOf(uid)
      const state = game.cards[uid]
      if (!data || !state) return []
      return [{ uid, name: data.name, image: data.image, faceUp: deck || state.faceUp }]
    })
  }

  private cardByUid(uid: string): Card | null {
    return this.bv.views.get(uid) ?? null
  }

  private openContext = (t: ContextTarget, x: number, y: number, above: boolean) => {
    this.menuPos = { x, y }
    if (t.kind === 'deck') {
      this.menu.open(x, y, `Deck (${this.game.zones[this.ownDeck]?.length ?? 0})`, [
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
    for (let i = 0; i < n; i++) this.timers.push(window.setTimeout(() => this.drawCard(), i * 180))
  }

  private changeLp(seat: Seat, delta: number) {
    const lp = this.game.seats[seat]?.lp
    if (lp === undefined) return
    this.dispatch({ type: 'setLP', seat: this.seat, target: seat, lp: Math.max(0, lp + delta) })
  }

  /** Jump to a phase. Does not change whose turn it is. */
  setPhase(i: number) {
    if (i < 0 || i >= PHASES.length || i === this.game.phase) return
    this.dispatch({ type: 'setPhase', seat: this.seat, phase: i })
  }

  /** Hand the turn over: next turn, back to Draw, other player. */
  private endTurn() {
    this.dispatch({ type: 'endTurn', seat: this.seat })
  }

  private undo() {
    if (useGameStore.getState().history.length === 0) return
    this.menu.close()
    this.skipDeckShuffle = true
    this.viewer?.close()
    this.skipDeckShuffle = false
    this.interaction?.cancelDrag()
    this.interaction?.cancelTargeting()
    useGameStore.getState().undo()
  }

  /** Everything that follows the game state except the meshes: HUD, dialogs and shortcut buttons. */
  private syncUi() {
    const game = this.game
    this.hud?.setLp(0, game.seats[0]?.lp ?? 0)
    this.hud?.setLp(1, game.seats[1]?.lp ?? 0)
    this.hud?.setPhase(game.turn, PHASES[game.phase] ?? 'Draw', game.activeSeat)
    this.hud?.setUndoEnabled(useGameStore.getState().history.length > 0)
    this.viewer?.refresh()
    this.refreshShortcuts()
    this.loop.invalidate()
  }

  /** Swap the top hint while a summon, set, or activate is waiting for a zone. */
  private setTargetHint(active: boolean, attack = false) {
    const el = document.querySelector<HTMLElement>('.hint')
    if (!el) return
    if (!this.hintDefault) this.hintDefault = el.textContent ?? ''
    const direct = attackTargetKeys(this.game, this.seat).length === 0
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

  /** Shortcut buttons for a selected hand card, a pile card, or a card in the deck dialog. */
  private refreshShortcuts() {
    if (this.viewing === this.ownDeck && this.deckPick != null) {
      const uid = this.deckPick
      const data = this.dataOf(uid)
      if (data && this.game.zones[this.ownDeck]?.includes(uid)) {
        this.actionBar?.setFromData(data, (play) => this.playFromDeck(uid, play), [
          { label: 'To Hand', icon: 'hand', run: () => this.handFromDeck(uid) },
        ])
        this.viewer?.setSelected(uid)
        this.glow?.set(null)
        return
      }
      this.deckPick = null
    }
    const card = this.interaction?.pinnedCard ?? null
    const dragging = this.interaction?.isDragging ?? false
    const inHand = !!card && !dragging && this.hand.cards.includes(card)
    const inPile = !!card && !dragging && !!card.zoneKey && isViewPile(card.zoneKey, this.seat)
    const extra: BarExtra[] =
      inPile && card.zoneKey?.includes(':gy:')
        ? [{ label: 'To Hand', icon: 'hand', run: (c) => this.actions.toHand(c.uid) }]
        : []
    this.actionBar?.setCard(inHand || inPile ? card : null, extra)
    this.viewer?.setSelected(inPile && card ? card.uid : null)
    this.glow?.set(inHand ? card : null)
  }

  /** Close the deck dialog, then wait for a zone. Closing shuffles the deck first. */
  private playFromDeck(uid: string, play: PlayAction) {
    this.viewer?.close()
    this.actions.play(uid, play)
  }

  private handFromDeck(uid: string) {
    this.deckPick = null
    this.detail?.stickData(null)
    this.actions.toHand(uid)
  }

  /** Step 1 feedback: arrow to the declared zone and a confirm prompt. */
  private onDeclare(attackerUid: string | null, key: string | null, declared: boolean) {
    const attacker = attackerUid ? this.cardByUid(attackerUid) : null
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
    return PHASES[this.game.phase] === 'Battle'
  }

  /** Visual only: no damage, no destruction. */
  private declareAttack(card: Card) {
    if (!this.inBattle() || !isAttacker(this.game, card.uid, this.seat)) return
    // No monsters to hit: every opposing monster zone is a direct-attack target.
    const hit = attackTargetKeys(this.game, this.seat)
    const keys = hit.length ? hit : opposingMonsterKeys(this.game, this.seat)
    this.interaction?.beginAttack(card.uid, keys)
  }

  /** A drag ended. Dispatch the move, or nothing, then put the lifted card back where the state says. */
  private onDrop = (card: Card, drop: Drop) => {
    const uid = card.uid
    if (drop.kind === 'zone') {
      if (drop.changed) {
        this.dispatch({ type: 'move', seat: this.seat, uid, to: drop.key, faceUp: drop.faceUp, defense: drop.defense })
      }
    } else if (drop.kind === 'deck') {
      this.actions.returnToDeck(uid, 'top')
    } else if (drop.kind === 'hand') {
      this.actions.toHand(uid)
    }
    this.bv.resync(this.game)
  }

  async init() {
    const q = QUALITY[this.quality]
    const r = this.renderer
    const startPromise = loadStartGame().then(async (start) => {
      await preloadCardArt(start.catalog.values(), r)
      return start
    })
    const ruinsPromise = loadLayout()
      .then(createRuins)
      .catch((e) => {
      console.warn('Ruins failed to load', e)
      return new Group()
    })
    const [stone, grass, start, ruins] = await Promise.all([
      loadPBR('stone', 'stone', r, 4, true),
      loadPBR('grass', 'grass', r, 1),
      startPromise,
      ruinsPromise,
      setupEnvironment(this.scene, r),
    ])
    if (this.disposed) return
    this.catalog = start.catalog
    this.applyCtx = start.ctx
    if (start.missing.length) console.warn('Cards missing from the catalog', start.missing)

    this.scene.add(createBoard(stone, grass), ruins)

    this.lights = new Lights(r, q.shadowMapSize)
    this.scene.add(this.lights.group)

    this.zones = new Zones(this.loop.invalidate)
    this.scene.add(this.zones.mesh)

    this.particles = new Particles(q.particleCount)
    this.scene.add(this.particles.points)
    this.landing = new LandingFx(this.scene, this.tweens)

    this.fx = new PostFX(r, this.scene, this.rig.camera, q)

    for (let seat = 0; seat < start.game.seats.length; seat++) {
      const key = deckKey(seat)
      const pile = new DeckPile(key, start.game.zones[key]?.length ?? 0)
      this.piles.set(key, pile)
      this.scene.add(pile.mesh)
    }
    this.board = new BoardState(this.tweens, this.landing)
    this.attackFx = new AttackFx(this.tweens, this.board, this.landing)
    this.arrow = new AttackArrow(this.scene, this.loop.invalidate)
    this.loop.add(this.arrow)
    this.bv = new BoardView({
      scene: this.scene,
      tweens: this.tweens,
      board: this.board,
      hand: this.hand,
      piles: this.piles,
      attackFx: this.attackFx,
      lookup: (passcode) => this.catalog.get(passcode),
      create: (uid, info) => {
        const card = createCardMesh(uid, info)
        const edit = this.statEdits.get(uid)
        if (edit) card.setStats(edit.atk, edit.def)
        return card
      },
      localSeat: this.seat,
      invalidate: this.loop.invalidate,
      onAttackDone: () => {
        if (this.game.attack) this.dispatch({ type: 'clearAttack', seat: this.seat })
      },
    })
    this.interaction = new HandInteraction({
      canvas: this.canvas,
      camera: this.rig.camera,
      hand: this.hand,
      deck: this.piles.get(this.ownDeck)!.mesh,
      board: this.board,
      tweens: this.tweens,
      zones: this.zones,
      localSeat: this.seat,
      getGame: () => this.game,
      lift: (card) => this.bv.lift(card),
      onDrop: this.onDrop,
      onPose: (card, faceUp, defense) => this.dispatch({ type: 'setPosition', seat: this.seat, uid: card.uid, faceUp, defense }),
      onContext: this.openContext,
      onChange: () => this.syncUi(),
      onViewPile: (key) => {
        this.viewing = key
        this.viewer?.open(key)
      },
      onHoverCard: (card) => this.detail?.hover(card),
      onSelectCard: (card) => this.detail?.pin(card),
      onDrag: () => this.refreshShortcuts(),
      onAction: () => this.deselect(),
      onPlace: (uid, key, faceUp, defense) => this.actions.moveTo(uid, key, faceUp, defense),
      onAttack: (attacker, target) => {
        this.dispatch({ type: 'declareAttack', seat: this.seat, attacker, target })
        this.deselect()
      },
      onDeclare: (attacker, key, declared) => this.onDeclare(attacker, key, declared),
      onTargeting: (active, attack) => {
        this.setTargetHint(active, attack)
        this.actionBar?.setTargeting(active)
      },
    })
    this.actions = new CardActions({
      game: () => this.game,
      dispatch: this.dispatch,
      dispatchAll: (actions) => useGameStore.getState().dispatchAll(actions),
      localSeat: () => this.seat,
      shuffled: (uids) => shuffle([...uids]),
      editStats: (uid) => {
        const card = this.cardByUid(uid)
        if (!card) return
        const p = this.menuPos
        this.menu.openStats(p.x, p.y, card.data.atk ?? 0, card.data.def ?? 0, (a, d) => {
          this.statEdits.set(uid, { atk: a, def: d })
          card.setStats(a, d)
          this.deselect()
          this.loop.invalidate()
        })
      },
      closeViewer: () => this.viewer?.close(),
      onAction: () => this.deselect(),
      requestTarget: (uid, play) => {
        this.viewer?.close()
        this.interaction?.beginTarget(uid, play)
      },
      inBattle: () => this.inBattle(),
      attack: (uid) => {
        const card = this.cardByUid(uid)
        if (card) this.declareAttack(card)
      },
    })

    const ui = document.getElementById('ui') ?? document.body
    this.hud = new Hud(ui, {
      onLp: (seat, delta) => this.changeLp(seat, delta),
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
      (card, play) => this.actions.play(card.uid, play),
      () => interaction?.cancelTargeting(),
      (card) => this.declareAttack(card),
    )
    this.detail = new CardDetail(ui, (card) => {
      interaction?.setPinned(card)
      this.refreshShortcuts()
      // Selecting a field monster in battle starts the attack declaration.
      if (card && this.inBattle() && isAttacker(this.game, card.uid, this.seat)) this.declareAttack(card)
    })
    this.viewer = new PileViewer(ui, (key) => this.pileViews(key), {
      onOpen: () => {
        interaction?.lock()
        this.deselect()
      },
      onClose: (key) => {
        interaction?.unlock()
        this.viewing = null
        this.deckPick = null
        this.deselect()
        if (key === this.ownDeck && !this.skipDeckShuffle && !this.disposed) this.shuffleDeck()
        this.skipDeckShuffle = false
      },
      onCardContext: (view, x, y) => {
        this.menuPos = { x, y }
        if (this.viewing === this.ownDeck) {
          const data = this.dataOf(view.uid)
          if (data) this.menu.open(x, y, data.name, this.actions.deckItems(view.uid, data))
          return
        }
        const card = this.cardByUid(view.uid)
        if (card) this.menu.open(x, y, card.data.name, this.actions.pileItems(card))
      },
      onDragOut: (view, ev) => {
        if (this.viewing === this.ownDeck) {
          // Shuffle first so the card is taken from a random spot, then drag a mesh made for it.
          this.shuffleDeck()
          const card = this.bv.liftFromDeck(this.game, view.uid)
          if (!card) return
          this.skipDeckShuffle = true
          try {
            interaction?.beginExternalDrag(card, ev, this.ownDeck)
          } finally {
            this.viewer?.close()
          }
          return
        }
        const card = this.cardByUid(view.uid)
        if (!card) return
        try {
          interaction?.beginExternalDrag(card, ev)
        } finally {
          this.viewer?.close()
        }
      },
      onCardHover: (view) => {
        if (this.viewing === this.ownDeck) {
          this.detail?.previewData(view ? this.dataOf(view.uid) : null)
          return
        }
        this.detail?.hover(view ? this.cardByUid(view.uid) : null, true)
      },
      onCardClick: (view) => {
        if (this.viewing === this.ownDeck) {
          this.deckPick = this.deckPick === view.uid ? null : view.uid
          this.detail?.stickData(this.deckPick ? this.dataOf(view.uid) : null)
          this.refreshShortcuts()
          return
        }
        const card = this.cardByUid(view.uid)
        if (card) this.detail?.pin(card)
      },
    })

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

    // Every visual change comes from a store change. One dispatch animates; undo and load snap.
    this.unsubscribe = useGameStore.subscribe((s, prev) => {
      this.bv.sync(s.game, prev.game, s.log.length > prev.log.length ? 'animate' : 'jump')
      this.syncUi()
    })
    useGameStore.getState().load(start.game, start.ctx)

    this.loop.start()
    this.drawCards(5)
    // The opening hand isn't an undo step: forget it once it has been drawn.
    this.timers.push(
      window.setTimeout(() => {
        if (!this.disposed) useGameStore.getState().load(this.game, this.applyCtx)
      }, 5 * 180 + 50),
    )

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
    this.unsubscribe?.()
    this.bv?.dispose()
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
