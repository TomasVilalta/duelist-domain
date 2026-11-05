import { Matrix4, type Mesh, type PerspectiveCamera, Raycaster, type Scene, Vector2, Vector3 } from 'three'
import type { Tweens } from '@/anim/Tweens'
import type { Card } from '@/cards/Card'
import type { Hand } from '@/cards/Hand'
import type { Updatable } from '@/core/Loop'
import { boardQuat, type BoardState } from '@/state/BoardState'
import type { Zones } from '@/scene/Zones'
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
  onDeckClick: () => void
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
  /** Double-click: the card activates. */
  onActivate?: (card: Card) => void
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
  private clickCard: Card | null = null
  private clickAt = 0
  private clickTimer = 0
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
    window.clearTimeout(this.clickTimer)
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

  /** Board drag started outside the canvas. The pointer is already past the drag threshold. */
  beginExternalDrag(card: Card, e: PointerEvent) {
    this.setNdc(e)
    const drag = this.newDrag(card, false, card.zoneKey, e)
    this.drag = drag
    try {
      this.opts.canvas.setPointerCapture(e.pointerId)
    } catch {
      // The dialog then closes, so later moves still hit the canvas.
    }
    this.startDrag(drag)
    this.updateDrag(drag)
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
    this.setNdc(e)
    const idx = this.handIndex()
    let drag: Drag | null = null
    if (idx >= 0) {
      drag = this.newDrag(this.opts.hand.cards[idx], true, null, e)
    } else {
      const card = this.boardCardAt()
      if (card) drag = this.newDrag(card, false, card.zoneKey, e)
      else if (this.deckAt()) this.opts.onDeckClick()
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
    // A click that never became a drag. A later hand raise shares this branch.
    if (drag) {
      this.noteClick(drag.card)
      return
    }
    const key = this.zoneUnder()
    if (key && isViewPile(key)) this.opts.onViewPile(key)
    else if (!this.deckAt()) {
      this.cancelClick()
      this.opts.onSelectCard?.(null)
    }
  }

  /** Single click selects after a short wait, so a double-click can activate instead. */
  private noteClick(card: Card) {
    const now = performance.now()
    if (this.clickCard === card && now - this.clickAt < 320) {
      this.cancelClick()
      this.opts.onActivate?.(card)
      return
    }
    this.clickCard = card
    this.clickAt = now
    window.clearTimeout(this.clickTimer)
    this.clickTimer = window.setTimeout(() => {
      this.clickCard = null
      this.opts.onSelectCard?.(card)
    }, 260)
  }

  private cancelClick() {
    window.clearTimeout(this.clickTimer)
    this.clickCard = null
  }

  private onLeave = () => {
    if (this.drag || this.locked) return
    this.publishHover(null)
    this.setDeckHover(false)
  }

  // ---- drag ----

  private startDrag(drag: Drag) {
    const { hand, board, scene, tweens, zones } = this.opts
    const card = drag.card
    drag.active = true
    this.opts.onCommit()
    this.publishHover(null)
    this.setDeckHover(false)
    if (drag.fromHand) {
      hand.remove(card)
      scene.attach(card.mesh)
      card.faceUp = true
      card.defense = false
    } else {
      board.remove(card)
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
    const poses = zonePoses(zone.id.type)
    const card = drag.card
    const kept = poses.find((p) => p.faceUp === card.faceUp && p.defense === card.defense)
    this.applyPose(drag, kept ?? legalOrientation(zone.id.type, drag.faceUp, drag.defense), zone.rotY)
  }

  private cyclePose(drag: Drag) {
    const zone = drag.over && !drag.over.endsWith(':deck:0') ? getZoneByKey(drag.over) : undefined
    if (!zone) return
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

    if (drag.over === OWN_DECK) {
      onReturnToDeck(card)
    } else if (drag.over && !drag.over.endsWith(':deck:0')) {
      board.place(card, drag.over)
    } else if (!drag.over && this.ndc.y < HAND_DROP_NDC_Y) {
      hand.add(card, 0.35)
    } else if (drag.fromZone) {
      board.place(card, drag.fromZone)
    } else {
      hand.add(card, 0.35)
    }
    this.publishHover(null)
    this.opts.onChange()
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
