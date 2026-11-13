import { Matrix4, type Mesh, type PerspectiveCamera, Raycaster, type Scene, Vector2, Vector3 } from 'three'
import type { Tweens } from '@/anim/Tweens'
import type { Card } from '@/cards/Card'
import type { Hand } from '@/cards/Hand'
import type { Updatable } from '@/core/Loop'
import { boardQuat, type BoardState } from '@/state/BoardState'
import type { Zones } from '@/scene/Zones'
import { targetZoneKeys, isPendulum, type PlayAction } from '@/interaction/CardActions'
import { getZoneByKey, isViewPile, legalOrientation, zoneAt, zonePoses, ZONES } from '@/scene/ZoneLayout'
import { CARD_H } from '@/config'

interface Options {
  canvas: HTMLCanvasElement
  camera: PerspectiveCamera
  scene: Scene
  hand: Hand
  deck: Mesh
  board: BoardState
  tweens: Tweens
  zones: Zones
  /** Card dropped on your own deck zone. */
  onReturnToDeck: (card: Card) => void
  /** `above` anchors the menu over the point instead of below the cursor. */
  onContext: (target: ContextTarget, x: number, y: number, above: boolean) => void
  /** Called once a drag actually starts, before the card is moved. */
  onCommit: () => void
  onChange: () => void
  onViewPile: (key: string) => void
  /** The card under the pointer, or null. Face-down cards are still passed through. */
  onHoverCard?: (card: Card | null) => void
  /** A click that never became a drag. `null` is an empty-board click. */
  onSelectCard?: (card: Card | null) => void
  /** A board drag started or ended. */
  onDrag?: (active: boolean) => void
  /** A drag dropped the card somewhere new, or changed its pose. */
  onAction?: () => void
  /** Player confirmed a summon, set, or activate by clicking a zone. */
  onPlace?: (card: Card, key: string, faceUp: boolean, defense: boolean) => void
  /** Player picked a monster to attack. */
  onAttack?: (attacker: Card, target: Card | null) => void
  /** An attack target was declared (zone key), or cleared. Drives the arrow and tooltip. */
  onDeclare?: (attacker: Card | null, key: string | null, declared: boolean) => void
  /** Targeting mode started or ended. `attack` is true for battle targeting. */
  onTargeting?: (active: boolean, attack: boolean) => void
}

interface Target {
  attack: boolean
  /** Attack only: the zone declared as target, awaiting confirmation. */
  declared: string | null
  card: Card
  faceUp: boolean
  defense: boolean
  keys: string[]
  hot: string | null
}

export type ContextTarget =
  | { kind: 'hand'; card: Card }
  | { kind: 'board'; card: Card }
  | { kind: 'deck' }

interface Drag {
  card: Card
  fromHand: boolean
  fromZone: string | null
  startX: number
  startY: number
  active: boolean
  over: string | null
  /** Pose the card had when the drag started, restored while it isn't over a zone. */
  faceUp: boolean
  defense: boolean
}

const DRAG_Y = 0.7
const DRAG_THRESHOLD = 5
const HAND_DROP_NDC_Y = -0.6
const OWN_DECK = 'p1:deck:0'

/** Pointer input: hand hover, deck click, and dragging cards between hand and zones. */
export class HandInteraction implements Updatable {
  private ndc = new Vector2()
  private ray = new Raycaster()
  private inv = new Matrix4()
  private o = new Vector3()
  private d = new Vector3()
  private p = new Vector3()
  private target = new Vector3()
  private deckHover = false
  private locks = 0
  private drag: Drag | null = null
  private hovered: Card | null = null
  /** Card under the pointer. Separate from the raised card, which can be the pin. */
  private pointer: Card | null = null
  private pinned: Card | null = null
  private targeting: Target | null = null
  private opts: Options

  constructor(opts: Options) {
    this.opts = opts
    const c = opts.canvas
    c.addEventListener('pointermove', this.onMove)
    c.addEventListener('pointerdown', this.onDown)
    c.addEventListener('pointerup', this.onUp)
    c.addEventListener('pointercancel', this.onUp)
    c.addEventListener('pointerleave', this.onLeave)
    c.addEventListener('contextmenu', this.onContextMenu)
    window.addEventListener('keydown', this.onKey)
  }

  dispose() {
    this.opts.canvas.removeEventListener('contextmenu', this.onContextMenu)
    const c = this.opts.canvas
    c.removeEventListener('pointermove', this.onMove)
    c.removeEventListener('pointerdown', this.onDown)
    c.removeEventListener('pointerup', this.onUp)
    c.removeEventListener('pointercancel', this.onUp)
    c.removeEventListener('pointerleave', this.onLeave)
    window.removeEventListener('keydown', this.onKey)
  }

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    if (this.targeting) {
      this.cancelTarget()
      return
    }
    if (this.drag?.active) return
    this.setNdc(e)
    const { hand } = this.opts
    const idx = this.handIndex()
    if (idx >= 0) {
      const card = hand.cards[idx]
      this.publishHover(card)
      const top = this.screenOfCardTop(card)
      this.opts.onContext({ kind: 'hand', card }, top.x, top.y, true)
      return
    }
    const card = this.boardCardAt()
    this.publishHover(card)
    if (card) this.opts.onContext({ kind: 'board', card }, e.clientX, e.clientY, false)
    else if (this.deckAt()) this.opts.onContext({ kind: 'deck' }, e.clientX, e.clientY, false)
  }

  /** Screen point of the top edge of a card, used to place the menu above it. */
  private screenOfCardTop(card: Card): { x: number; y: number } {
    const { camera, canvas } = this.opts
    this.p.set(0, (CARD_H / 2) * card.mesh.scale.y, 0.01)
    this.p.applyMatrix4(card.mesh.matrixWorld)
    this.p.project(camera)
    const r = canvas.getBoundingClientRect()
    return {
      x: (this.p.x * 0.5 + 0.5) * r.width + r.left,
      y: (-this.p.y * 0.5 + 0.5) * r.height + r.top,
    }
  }

  private setNdc(e: { clientX: number; clientY: number }) {
    const r = this.opts.canvas.getBoundingClientRect()
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.opts.camera)
  }

  private handIndex(): number {
    const { hand } = this.opts
    hand.group.updateMatrixWorld(true)
    this.inv.copy(hand.group.matrixWorld).invert()
    this.o.copy(this.ray.ray.origin).applyMatrix4(this.inv)
    this.d.copy(this.ray.ray.direction).transformDirection(this.inv)
    if (Math.abs(this.d.z) < 1e-6) return -1
    const t = -this.o.z / this.d.z
    if (t < 0) return -1
    return hand.pick(this.o.x + this.d.x * t, this.o.y + this.d.y * t)
  }

  /** Point where the pointer ray crosses the horizontal plane at height y. */
  private planePoint(y: number, out: Vector3): boolean {
    const { origin, direction } = this.ray.ray
    if (direction.y > -1e-5) return false
    const t = (y - origin.y) / direction.y
    out.copy(direction).multiplyScalar(t).add(origin)
    return true
  }

  /** Nearest board card under the pointer, only if it is the top of its stack. */
  private boardCardAt(): Card | null {
    const hits = this.ray.intersectObjects(this.opts.board.meshes(), false)
    if (!hits.length) return null
    const card = hits[0].object.userData.card as Card
    return this.opts.board.isTop(card) ? card : null
  }

  private get locked() {
    return this.locks > 0
  }

  /** While locked (context menu or pile dialog) hover states don't change. */
  lock() {
    this.locks++
  }

  unlock() {
    this.locks = Math.max(0, this.locks - 1)
  }

  /** Keep this card raised after the pointer leaves. `null` clears it. */
  setPinned(card: Card | null) {
    this.pinned = card
    this.showHover()
  }

  get pinnedCard(): Card | null {
    return this.pinned
  }

  get isDragging(): boolean {
    return !!this.drag?.active
  }

  /** Highlight the legal zones and wait for a click. Esc, right-click, or a click elsewhere cancels. */
  beginTarget(card: Card, play: PlayAction) {
    const restart = this.targeting !== null
    this.targeting = null
    this.opts.zones.setAllHighlights(0)
    const owner = card.zoneKey?.startsWith('p2') ? 'p2' : 'p1'
    const keys = targetZoneKeys(owner, play.zone, (key) => this.opts.board.cardsIn(key).length === 0)
    this.targeting = { attack: false, card, faceUp: play.faceUp, defense: play.defense, keys, hot: null, declared: null }
    for (const key of keys) this.opts.zones.setHighlight(key, 0.7)
    if (!restart) this.lock()
    this.opts.onTargeting?.(true, false)
  }

  /** Highlight the zones holding attackable monsters and wait for a click. */
  beginAttack(card: Card, keys: string[]) {
    const restart = this.targeting !== null
    this.targeting = null
    this.opts.zones.setAllHighlights(0)
    this.targeting = { attack: true, card, faceUp: card.faceUp, defense: card.defense, keys, hot: null, declared: null }
    for (const key of keys) this.opts.zones.setHighlight(key, 0.7)
    if (!restart) this.lock()
    this.opts.onTargeting?.(true, true)
  }

  /** Leave targeting without placing the card. */
  cancelTargeting() {
    this.cancelTarget()
  }

  private cancelTarget() {
    this.endTarget()
  }

  private endTarget() {
    if (!this.targeting) return
    this.opts.zones.setAllHighlights(0)
    const wasAttack = this.targeting.attack
    this.targeting = null
    if (wasAttack) this.opts.onDeclare?.(null, null, false)
    this.opts.canvas.style.cursor = 'default'
    this.unlock()
    this.opts.onTargeting?.(false, false)
  }

  private setTargetHot(key: string | null) {
    const t = this.targeting
    if (!t || key === t.hot) return
    if (t.hot) this.opts.zones.setHighlight(t.hot, t.hot === t.declared ? 1 : 0.7)
    if (key) this.opts.zones.setHighlight(key, 1)
    t.hot = key
    this.opts.canvas.style.cursor = key ? 'pointer' : 'default'
  }

  private finishTarget() {
    const t = this.targeting
    if (!t) return
    const key = this.zoneUnder()
    const hit = key && t.keys.includes(key) ? key : null
    const { card, faceUp, defense } = t
    if (!hit) {
      this.cancelTarget()
      return
    }
    if (t.attack) {
      if (t.declared !== hit) {
        // Step 1: declare. The arrow shows who attacks what.
        if (t.declared) this.opts.zones.setHighlight(t.declared, 0.7)
        t.declared = hit
        this.opts.zones.setHighlight(hit, 1)
        this.opts.onDeclare?.(card, hit, true)
        return
      }
      // Step 2: confirm.
      const list = this.opts.board.cardsIn(hit)
      const victim = list[list.length - 1] ?? null
      this.endTarget()
      this.opts.onAttack?.(card, victim)
      return
    }
    this.endTarget()
    this.opts.onPlace?.(card, hit, faceUp, defense)
  }

  /**
   * Board drag started outside the canvas. The pointer is already past the drag threshold.
   * `fromZone` overrides the card's zone (a deck card has none). `commit` snapshots first.
   */
  beginExternalDrag(card: Card, e: PointerEvent, fromZone: string | null = card.zoneKey, commit = true) {
    this.setNdc(e)
    const drag = this.newDrag(card, false, fromZone, e)
    this.drag = drag
    try {
      this.opts.canvas.setPointerCapture(e.pointerId)
    } catch {
      // The dialog then closes, so later moves still hit the canvas.
    }
    this.startDrag(drag, commit)
    this.updateDrag(drag)
  }

  /** Drop an in-progress drag without moving the card. Undo restores the board. */
  cancelDrag() {
    const active = this.drag?.active ?? false
    this.drag = null
    if (!active) return
    this.opts.zones.setAllHighlights(0)
    this.opts.canvas.style.cursor = 'default'
    this.opts.onDrag?.(false)
  }

  private zoneUnder(): string | null {
    const hits = this.ray.intersectObject(this.opts.zones.mesh, false)
    const id = hits[0]?.instanceId
    if (id === undefined) return null
    return ZONES[id]?.key ?? null
  }

  private deckAt(): boolean {
    return this.ray.intersectObject(this.opts.deck, false).length > 0
  }

  private setDeckHover(v: boolean) {
    if (v === this.deckHover) return
    this.deckHover = v
    this.opts.zones.setHighlight(OWN_DECK, v ? 0.7 : 0)
  }

  // ---- events ----

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    if (this.targeting) return
    this.setNdc(e)
    const idx = this.handIndex()
    let drag: Drag | null = null
    if (idx >= 0) {
      drag = this.newDrag(this.opts.hand.cards[idx], true, null, e)
    } else {
      const card = this.boardCardAt()
      if (card) drag = this.newDrag(card, false, card.zoneKey, e)
    }
    if (drag) {
      this.drag = drag
      this.opts.canvas.setPointerCapture(e.pointerId)
    }
  }

  private newDrag(card: Card, fromHand: boolean, fromZone: string | null, e: PointerEvent): Drag {
    return {
      card,
      fromHand,
      fromZone,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      over: null,
      faceUp: card.faceUp,
      defense: card.defense,
    }
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.targeting) {
      e.preventDefault()
      this.cancelTarget()
      return
    }
    if ((e.key !== 'r' && e.key !== 'R') || e.repeat) return
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    const drag = this.drag
    if (drag?.active) {
      e.preventDefault()
      this.cyclePose(drag)
      return
    }
    if (this.locked) return
    const card = this.pointer
    if (!card?.zoneKey || !this.opts.board.isTop(card)) return
    const zone = getZoneByKey(card.zoneKey)
    if (!zone) return
    const poses = zonePoses(zone.id.type)
    if (poses.length < 2) return
    e.preventDefault()
    const i = poses.findIndex((p) => p.faceUp === card.faceUp && p.defense === card.defense)
    const next = poses[(i + 1) % poses.length]
    this.opts.onCommit()
    card.faceUp = next.faceUp
    card.defense = next.defense
    this.opts.board.layoutZone(card.zoneKey, 0.2)
    this.hovered = null
    this.publishHover(card)
    this.opts.onChange()
  }

  private onMove = (e: PointerEvent) => {
    this.setNdc(e)
    if (this.targeting) {
      const key = this.zoneUnder()
      this.setTargetHot(key && this.targeting.keys.includes(key) ? key : null)
      return
    }
    const drag = this.drag
    if (drag) {
      if (!drag.active && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD) {
        this.startDrag(drag)
      }
      if (drag.active) this.updateDrag(drag)
      return
    }

    if (this.locked) return
    const idx = this.handIndex()
    let overDeck = false
    let card: Card | null = null
    if (idx >= 0) card = this.opts.hand.cards[idx]
    else {
      overDeck = this.deckAt()
      if (!overDeck) card = this.boardCardAt()
    }
    this.publishHover(card)
    this.setDeckHover(overDeck)
    const pile = !card && !overDeck && idx < 0 ? this.zoneUnder() : null
    const overPile = !!pile && isViewPile(pile)
    this.opts.canvas.style.cursor = idx >= 0 || overDeck || card || overPile ? 'pointer' : 'default'
  }

  private onUp = (e: PointerEvent) => {
    if (this.targeting) {
      if (e.button !== 0) return
      this.setNdc(e)
      this.finishTarget()
      return
    }
    const drag = this.drag
    this.drag = null
    if (this.opts.canvas.hasPointerCapture(e.pointerId)) this.opts.canvas.releasePointerCapture(e.pointerId)
    this.setNdc(e)
    if (drag?.active) {
      this.updateDrag(drag)
      this.drop(drag)
      return
    }
    if (drag?.fromZone && isViewPile(drag.fromZone)) {
      this.opts.onViewPile(drag.fromZone)
      return
    }
    if (e.button !== 0) return
    // A click that never became a drag.
    if (drag) {
      this.opts.onSelectCard?.(drag.card)
      return
    }
    if (this.deckAt()) {
      this.opts.onViewPile(OWN_DECK)
      return
    }
    const key = this.zoneUnder()
    if (key && isViewPile(key)) this.opts.onViewPile(key)
    else this.opts.onSelectCard?.(null)
  }

  private onLeave = () => {
    if (this.targeting) {
      this.setTargetHot(null)
      return
    }
    if (this.drag || this.locked) return
    this.publishHover(null)
    this.setDeckHover(false)
  }

  // ---- drag ----

  private startDrag(drag: Drag, commit = true) {
    const { hand, board, scene, tweens, zones } = this.opts
    const card = drag.card
    drag.active = true
    if (commit) this.opts.onCommit()
    this.publishHover(null)
    this.setDeckHover(false)
    if (drag.fromHand) {
      hand.remove(card)
      scene.attach(card.mesh)
      card.faceUp = true
      card.defense = false
    } else {
      const from = drag.fromZone ?? ''
      const reveal = !card.faceUp && (from.includes(':extra:') || from.includes(':banished:'))
      board.remove(card)
      if (reveal) {
        card.faceUp = true
        card.defense = false
      }
    }
    drag.faceUp = card.faceUp
    drag.defense = card.defense
    this.showHover()
    this.target.copy(card.mesh.position)
    tweens.animate(
      card.mesh,
      { quaternion: boardQuat(card.faceUp, card.defense, 0), scale: new Vector3(1.05, 1.05, 1.05) },
      0.2,
    )
    zones.setAllHighlights(0.12)
    this.opts.canvas.style.cursor = 'grabbing'
    this.opts.onDrag?.(true)
  }

  private updateDrag(drag: Drag) {
    const { zones } = this.opts
    this.planePoint(DRAG_Y, this.target)
    let over: string | null = null
    if (this.ndc.y > HAND_DROP_NDC_Y && this.planePoint(0.02, this.p)) {
      over = zoneAt(this.p.x, this.p.z)?.key ?? null
    }
    if (over !== drag.over) {
      if (drag.over) zones.setHighlight(drag.over, 0.12)
      if (over) zones.setHighlight(over, 1)
      drag.over = over
      this.previewPose(drag)
    }
  }

  /** Show a legal pose for the zone under the card, or the pose it was picked up in. */
  private previewPose(drag: Drag) {
    const zone = drag.over && !drag.over.endsWith(':deck:0') ? getZoneByKey(drag.over) : undefined
    if (!zone) {
      this.applyPose(drag, { faceUp: drag.faceUp, defense: drag.defense }, 0)
      return
    }
    if (zone.id.type === 'extra') {
      this.applyPose(drag, { faceUp: isPendulum(drag.card), defense: false }, zone.rotY)
      return
    }
    const poses = zonePoses(zone.id.type)
    const card = drag.card
    const kept = poses.find((p) => p.faceUp === card.faceUp && p.defense === card.defense)
    this.applyPose(drag, kept ?? legalOrientation(zone.id.type, drag.faceUp, drag.defense), zone.rotY)
  }

  private cyclePose(drag: Drag) {
    const zone = drag.over && !drag.over.endsWith(':deck:0') ? getZoneByKey(drag.over) : undefined
    if (!zone || zone.id.type === 'extra') return
    const poses = zonePoses(zone.id.type)
    if (poses.length < 2) return
    const card = drag.card
    const i = poses.findIndex((p) => p.faceUp === card.faceUp && p.defense === card.defense)
    this.applyPose(drag, poses[(i + 1) % poses.length], zone.rotY)
  }

  private applyPose(drag: Drag, pose: { faceUp: boolean; defense: boolean }, rotY: number) {
    drag.card.faceUp = pose.faceUp
    drag.card.defense = pose.defense
    this.opts.tweens.animate(drag.card.mesh, { quaternion: boardQuat(pose.faceUp, pose.defense, rotY) }, 0.12)
  }

  private drop(drag: Drag) {
    const { hand, board, zones, onReturnToDeck } = this.opts
    const card = drag.card
    zones.setAllHighlights(0)
    this.opts.canvas.style.cursor = 'default'

    const poseChanged = card.faceUp !== drag.faceUp || card.defense !== drag.defense
    const fromDeck = drag.fromZone === OWN_DECK
    let acted = false
    if (drag.over === OWN_DECK) {
      onReturnToDeck(card)
    } else if (drag.over && !drag.over.endsWith(':deck:0')) {
      acted = drag.over !== drag.fromZone || poseChanged
      board.place(card, drag.over, 0.28, { from: drag.fromHand ? null : drag.fromZone })
    } else if (!drag.over && this.ndc.y < HAND_DROP_NDC_Y) {
      acted = !drag.fromHand
      hand.add(card, 0.35)
    } else if (fromDeck) {
      onReturnToDeck(card)
    } else if (drag.fromZone) {
      board.place(card, drag.fromZone, 0.28, { from: drag.fromZone })
    } else {
      hand.add(card, 0.35)
    }
    this.publishHover(null)
    this.opts.onDrag?.(false)
    this.opts.onChange()
    if (acted) this.opts.onAction?.()
  }

  /** Raise the card under the pointer, or the pinned card when the pointer is elsewhere. */
  private showHover() {
    const dragging = this.drag?.active ? this.drag.card : null
    let card = this.pointer ?? this.pinned
    if (card && card === dragging) card = this.pinned !== dragging ? this.pinned : null
    const { hand, board } = this.opts
    const idx = card ? hand.cards.indexOf(card) : -1
    hand.setHover(idx)
    board.setHover(idx < 0 && card?.zoneKey ? card : null)
  }

  private publishHover(card: Card | null) {
    this.pointer = card
    this.showHover()
    if (card === this.hovered) return
    this.hovered = card
    this.opts.onHoverCard?.(card)
  }

  update(dt: number): boolean {
    const drag = this.drag
    if (!drag || !drag.active) return false
    const k = 1 - Math.exp(-dt * 22)
    drag.card.mesh.position.lerp(this.target, k)
    return true
  }
}
