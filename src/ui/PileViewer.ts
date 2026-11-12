import type { Card } from '@/cards/Card'

const NAMES: Record<string, string> = { gy: 'GY', banished: 'Banished', extra: 'Extra Deck' }
const BACK_URL = `${import.meta.env.BASE_URL}cards/back.png`
/** Pointer travel, in card-widths, before a pile card becomes a board drag. */
const DRAG_CARD_WIDTHS = 1.5

function title(key: string, n: number): string {
  const [owner, type] = key.split(':')
  const who = owner === 'p1' ? 'You' : 'Opponent'
  return `${who} · ${NAMES[type] ?? type} (${n})`
}

interface Hooks {
  onOpen?: () => void
  onClose?: () => void
  onCardContext?: (card: Card, clientX: number, clientY: number) => void
  onDragOut?: (card: Card, pointerEvent: PointerEvent) => void
  onCardClick?: (card: Card) => void
  onCardHover?: (card: Card | null) => void
}

interface Gesture {
  card: Card
  pointerId: number
  x: number
  y: number
  el: HTMLElement
  /** Distance in pixels the pointer must travel before the card leaves the pile. */
  distance: number
  sent: boolean
}

/** Centred grid of a GY, banished pile, or extra deck. */
export class PileViewer {
  private root: HTMLDivElement
  private dialog: HTMLDivElement
  private grid: HTMLDivElement
  private titleEl: HTMLDivElement
  private key: string | null = null
  private selected: Card | null = null
  private cells = new Map<Card, HTMLElement>()
  private gesture: Gesture | null = null
  private getCards: (key: string) => Card[]
  private hooks: Hooks

  constructor(parent: HTMLElement, getCards: (key: string) => Card[], hooks: Hooks = {}) {
    this.getCards = getCards
    this.hooks = hooks

    this.root = document.createElement('div')
    this.root.className = 'pile-view'
    this.root.hidden = true
    this.root.addEventListener('click', this.onBackdrop)

    this.dialog = document.createElement('div')
    this.dialog.className = 'pile-dialog'
    this.dialog.setAttribute('role', 'dialog')
    this.dialog.setAttribute('aria-modal', 'true')
    this.dialog.addEventListener('contextmenu', (e) => e.preventDefault())

    const head = document.createElement('div')
    head.className = 'pile-head'
    this.titleEl = document.createElement('div')
    this.titleEl.id = 'pile-dialog-title'
    this.dialog.setAttribute('aria-labelledby', this.titleEl.id)
    const close = document.createElement('button')
    close.type = 'button'
    close.textContent = 'Close'
    close.addEventListener('click', this.close)
    head.append(this.titleEl, close)

    this.grid = document.createElement('div')
    this.grid.className = 'pile-grid'

    this.dialog.append(head, this.grid)
    this.root.appendChild(this.dialog)
    parent.appendChild(this.root)
    window.addEventListener('keydown', this.onKey)
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close()
  }

  private onBackdrop = (e: MouseEvent) => {
    if (e.target === this.root) this.close()
  }

  open(key: string) {
    const opening = this.key === null
    this.key = key
    this.render()
    if (opening) this.hooks.onOpen?.()
  }

  close = () => {
    if (this.key === null) return
    this.key = null
    this.clearGesture()
    this.cells.clear()
    this.hooks.onCardHover?.(null)
    this.root.hidden = true
    this.grid.replaceChildren()
    this.hooks.onClose?.()
  }

  refresh() {
    if (this.key) this.render()
  }

  /** Highlight the clicked pile card. `null` clears it. */
  setSelected(card: Card | null) {
    this.selected = card
    this.markSelected()
  }

  private render() {
    const key = this.key
    if (!key) return
    const cards = [...this.getCards(key)].reverse()
    const scroll = this.grid.scrollTop
    this.titleEl.textContent = title(key, cards.length)
    this.root.hidden = false
    this.grid.replaceChildren()
    this.cells.clear()
    if (cards.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'pile-empty'
      empty.textContent = 'No cards'
      this.grid.appendChild(empty)
    } else {
      for (const card of cards) this.grid.appendChild(this.cardCell(card))
    }
    this.grid.scrollTop = scroll
    this.markSelected()
  }

  private cardCell(card: Card): HTMLElement {
    const cell = document.createElement('div')
    cell.className = 'pile-card'
    this.cells.set(card, cell)
    const image = card.data.image
    if (!card.faceUp || image) {
      const img = document.createElement('img')
      img.draggable = false
      img.alt = card.faceUp ? card.data.name : `${card.data.name} (face-down)`
      img.src = card.faceUp && image ? image : BACK_URL
      cell.appendChild(img)
      if (!card.faceUp) {
        const tag = document.createElement('span')
        tag.className = 'pile-tag'
        tag.textContent = 'face-down'
        cell.appendChild(tag)
        if (image) {
          cell.addEventListener('pointerenter', () => {
            img.src = image
          })
          cell.addEventListener('pointerleave', () => {
            img.src = BACK_URL
          })
        }
      }
    } else {
      const tile = document.createElement('div')
      tile.className = 'pile-fallback'
      tile.textContent = card.data.name
      cell.appendChild(tile)
    }
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      this.hooks.onCardContext?.(card, e.clientX, e.clientY)
    })
    cell.addEventListener('pointerenter', () => this.hooks.onCardHover?.(card))
    cell.addEventListener('pointerleave', (e) => {
      const next = e.relatedTarget
      if (next instanceof Node && this.grid.contains(next)) return
      this.hooks.onCardHover?.(null)
    })
    cell.addEventListener('pointerdown', (e) => this.onCardDown(e, card, cell))
    return cell
  }

  private onCardDown(e: PointerEvent, card: Card, el: HTMLElement) {
    if (e.button !== 0 || this.gesture) return
    e.preventDefault()
    el.setPointerCapture(e.pointerId)
    const distance = el.getBoundingClientRect().width * DRAG_CARD_WIDTHS
    this.gesture = { card, pointerId: e.pointerId, x: e.clientX, y: e.clientY, el, distance, sent: false }
    el.addEventListener('pointermove', this.onCardMove)
    el.addEventListener('pointerup', this.onCardUp)
    el.addEventListener('pointercancel', this.onCardUp)
  }

  private onCardMove = (e: PointerEvent) => {
    const g = this.gesture
    if (!g || e.pointerId !== g.pointerId || g.sent) return
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < g.distance) return
    g.sent = true
    if (g.el.hasPointerCapture(e.pointerId)) g.el.releasePointerCapture(e.pointerId)
    this.hooks.onDragOut?.(g.card, e)
  }

  private onCardUp = (e: PointerEvent) => {
    const g = this.gesture
    if (!g || e.pointerId !== g.pointerId) return
    const click = !g.sent
    const card = g.card
    this.clearGesture()
    if (click) this.hooks.onCardClick?.(card)
  }

  private markSelected() {
    for (const [card, el] of this.cells) el.classList.toggle('is-selected', card === this.selected)
  }

  private clearGesture() {
    const g = this.gesture
    if (!g) return
    g.el.removeEventListener('pointermove', this.onCardMove)
    g.el.removeEventListener('pointerup', this.onCardUp)
    g.el.removeEventListener('pointercancel', this.onCardUp)
    if (!g.sent && g.el.hasPointerCapture(g.pointerId)) g.el.releasePointerCapture(g.pointerId)
    this.gesture = null
  }

  dispose() {
    window.removeEventListener('keydown', this.onKey)
    this.close()
    this.root.remove()
  }
}
