import type { Card } from '@/cards/Card'
import { makeFaceTexture } from '@/cards/CardTextures'
import type { CardData } from '@/data/demoDeck'

const BACK_URL = `${import.meta.env.BASE_URL}cards/back.png`

/** Fixed left-hand readout. Hover previews a card; a click pins it. */
export class CardDetail {
  private root: HTMLElement
  private img: HTMLImageElement
  private nameEl: HTMLElement
  private typeEl: HTMLElement
  private statsEl: HTMLElement
  private descEl: HTMLElement
  private closeBtn: HTMLButtonElement
  private pinned: Card | null = null
  private hovered: Card | null = null
  /** Deck card kept on screen. It has no mesh, so it is not a pin. */
  private sticky: CardData | null = null
  private reveal = false
  private faces = new Map<number, string>()

  private onPinned?: (card: Card | null) => void

  constructor(parent: HTMLElement, onPinned?: (card: Card | null) => void) {
    this.onPinned = onPinned
    this.root = document.createElement('aside')
    this.root.className = 'card-detail'
    this.root.innerHTML = `
      <button type="button" class="card-detail-x" hidden aria-label="Unpin">×</button>
      <img class="card-detail-art" alt="" />
      <div class="card-detail-name"></div>
      <div class="card-detail-type"></div>
      <div class="card-detail-stats"></div>
      <div class="card-detail-desc"></div>`
    parent.appendChild(this.root)
    this.img = this.root.querySelector('.card-detail-art')!
    this.nameEl = this.root.querySelector('.card-detail-name')!
    this.typeEl = this.root.querySelector('.card-detail-type')!
    this.statsEl = this.root.querySelector('.card-detail-stats')!
    this.descEl = this.root.querySelector('.card-detail-desc')!
    this.closeBtn = this.root.querySelector('.card-detail-x')!
    this.closeBtn.addEventListener('click', () => this.pin(null))
  }

  /** Hover preview. A different card is ignored while one is pinned. `reveal` shows a face-down card's face. */
  hover(card: Card | null, reveal = false) {
    this.hovered = card
    this.reveal = reveal
    if (this.pinned && this.pinned !== card) return
    if (this.sticky) return
    this.paint(this.pinned ?? card, reveal || !!this.pinned?.faceUp)
  }

  /** Face-up preview of a deck card. Ignored while one is pinned or selected. */
  previewData(data: CardData | null) {
    if (this.pinned || this.sticky) return
    this.paintData(data)
  }

  /** Keep a deck card's details up. `null` clears it. */
  stickData(data: CardData | null) {
    this.sticky = data
    if (data) this.pinned = null
    this.closeBtn.hidden = !data && !this.pinned
    this.root.classList.toggle('is-pinned', !!data || !!this.pinned)
    if (data) this.paintData(data)
    else this.paint(this.pinned ?? this.hovered, this.reveal || !!this.pinned?.faceUp)
    if (data) this.onPinned?.(null)
  }

  /**
   * Pin `card`, or unpin when it is already pinned.
   * `null` unpins and falls back to whatever is hovered.
   */
  pin(card: Card | null) {
    this.sticky = null
    if (!card || this.pinned === card) this.pinned = null
    else this.pinned = card
    this.closeBtn.hidden = !this.pinned
    this.root.classList.toggle('is-pinned', !!this.pinned)
    if (this.pinned) this.paint(this.pinned, this.pinned.faceUp || (this.reveal && this.hovered === this.pinned))
    else this.paint(this.hovered, this.reveal)
    this.onPinned?.(this.pinned)
  }

  dispose() {
    this.root.remove()
  }

  private paint(card: Card | null, reveal: boolean) {
    const show = !!card && (reveal || card.faceUp)
    this.root.classList.toggle('is-on', !!card)
    if (!card) return
    if (!show) {
      this.img.src = BACK_URL
      this.img.alt = 'Face-down card'
      this.nameEl.textContent = 'Face-down'
      this.typeEl.textContent = ''
      this.statsEl.textContent = ''
      this.descEl.textContent = ''
      return
    }
    this.paintData(card.data)
  }

  private paintData(data: CardData | null) {
    this.root.classList.toggle('is-on', !!data)
    if (!data) return
    this.img.src = this.faceUrl(data)
    this.img.alt = data.name
    this.nameEl.textContent = data.name
    const typeLine = [data.type, data.race, data.attribute].filter(Boolean)
    if (typeLine.length === 0) typeLine.push(data.kind === 'monster' ? 'Monster' : data.kind === 'spell' ? 'Spell' : 'Trap')
    if (data.archetype) typeLine.push(data.archetype)
    this.typeEl.textContent = typeLine.join(' · ')
    const stats: string[] = []
    if (data.level != null) stats.push(`Level ${data.level}`)
    if (data.atk != null || data.def != null) stats.push(`${data.atk ?? '—'} / ${data.def ?? '—'}`)
    this.statsEl.textContent = stats.join(' · ')
    this.descEl.textContent = data.desc ?? ''
  }

  private faceUrl(data: CardData): string {
    if (data.image) return data.image
    const cached = this.faces.get(data.uid)
    if (cached) return cached
    const tex = makeFaceTexture(data)
    const url = (tex.image as HTMLCanvasElement).toDataURL('image/png')
    tex.dispose()
    this.faces.set(data.uid, url)
    return url
  }
}
