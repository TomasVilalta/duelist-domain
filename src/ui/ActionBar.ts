import type { Card } from '@/cards/Card'
import { cardKind, primaryPlays, type PlayAction, type PlayIcon } from '@/interaction/CardActions'

const ICONS: Record<PlayIcon, string> = {
  summon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 4h9L12 11.2 16.5 20h-9L12 11.2 7.5 4z" /></svg>`,
  set: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.2 8.4a4.8 4.8 0 1 0 .6 5.2" /><path d="M16.4 5.2v3.6h-3.5" /></svg>`,
  defense: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.8" y="8.2" width="16.4" height="7.6" rx="1.3" /></svg>`,
  activate: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2v4.6M12 16.2v4.6M3.2 12h4.6M16.2 12h4.6M6.1 6.1l3.2 3.2M14.7 14.7l3.2 3.2M17.9 6.1l-3.2 3.2M9.3 14.7 6.1 17.9" /></svg>`,
}

const ATTACK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 4.5 10 14M19.5 4.5h-4M19.5 4.5v4M7.5 12.5l4 4M9.5 14.5l-4.8 4.8" /></svg>`

const CANCEL_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>`

/** Round shortcut buttons for the selected hand card, centered above the hand. */
export class ActionBar {
  private readonly root: HTMLDivElement
  private card: Card | null = null
  /** Set when the card is a field monster that can attack; true means a direct attack. */
  private direct: boolean | null = null
  private targeting = false

  constructor(
    parent: HTMLElement,
    private readonly onPlay: (card: Card, play: PlayAction) => void,
    private readonly onCancel: () => void,
    private readonly onAttack: (card: Card) => void,
  ) {
    this.root = document.createElement('div')
    this.root.className = 'action-bar'
    this.root.hidden = true
    parent.appendChild(this.root)
  }

  /** Show plays for a hand card, or hide the bar. A pending zone choice keeps Cancel up. */
  setCard(card: Card | null) {
    this.card = card
    this.direct = null
    this.paint()
  }

  /** Show a single Attack button for a field monster during battle. */
  setAttacker(card: Card, direct: boolean) {
    this.card = card
    this.direct = direct
    this.paint()
  }

  /** Replace the plays with Cancel while a zone is being chosen. */
  setTargeting(active: boolean) {
    if (this.targeting === active) return
    this.targeting = active
    this.paint()
  }

  private paint() {
    if (this.targeting) {
      this.root.hidden = false
      this.root.className = 'action-bar is-cancel'
      this.root.dataset.card = ''
      if (this.root.querySelector('.action-cancel')) return
      this.root.replaceChildren()
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'action-btn action-cancel'
      btn.innerHTML = `<i>${CANCEL_ICON}</i><span>Cancel</span>`
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.onCancel()
      })
      this.root.appendChild(btn)
      return
    }
    const card = this.card
    if (!card) {
      this.root.hidden = true
      this.root.className = 'action-bar'
      this.root.dataset.card = ''
      this.root.replaceChildren()
      return
    }
    const id = `${card.data.uid}:${this.direct ?? 'hand'}`
    const same = this.root.dataset.card === id && !this.root.hidden
    this.root.hidden = false
    this.root.className = this.direct === null ? `action-bar kind-${cardKind(card)}` : 'action-bar is-attack'
    this.root.dataset.card = id
    if (same) return
    this.root.replaceChildren()
    if (this.direct !== null) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'action-btn action-attack'
      btn.innerHTML = `<i>${ATTACK_ICON}</i><span>${this.direct ? 'Direct attack' : 'Attack'}</span>`
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (this.card) this.onAttack(this.card)
      })
      this.root.appendChild(btn)
      return
    }
    for (const play of primaryPlays(card)) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'action-btn'
      btn.innerHTML = `<i>${ICONS[play.icon]}</i><span>${play.label}</span>`
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (this.card) this.onPlay(this.card, play)
      })
      this.root.appendChild(btn)
    }
  }

  dispose() {
    this.root.remove()
  }
}
