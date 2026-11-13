type Owner = 'p1' | 'p2'

interface Handlers {
  onLp: (owner: Owner, delta: number) => void
  phases: readonly string[]
  onSetPhase: (index: number) => void
  onEndTurn: () => void
  onUndo: () => void
  onDie: () => void
  onCoin: () => void
}

/** Life points, phase badge, undo and dice. DOM only; the canvas stays underneath. */
export class Hud {
  private root: HTMLElement
  private lpNum: Record<Owner, HTMLElement>
  private phaseWrap: HTMLElement
  private phaseBtn: HTMLButtonElement
  private phasePop: HTMLElement
  private phaseItems: HTMLButtonElement[] = []
  private lpEl: Record<Owner, HTMLElement>
  private undoBtn: HTMLButtonElement
  private toastEl: HTMLElement
  private toastTimer = 0
  private shown: Record<Owner, number> = { p1: 8000, p2: 8000 }
  private target: Record<Owner, number> = { p1: 8000, p2: 8000 }
  private runs: Record<Owner, number> = { p1: 0, p2: 0 }

  constructor(parent: HTMLElement, handlers: Handlers) {
    this.root = document.createElement('div')
    this.root.innerHTML = `
      <section class="lp lp-you lp-active">
        <div class="lp-label">You</div>
        <div class="lp-num" data-lp="p1">8,000</div>
        <div class="lp-row"></div>
      </section>
      <section class="lp lp-opp">
        <div class="lp-label">Opponent</div>
        <div class="lp-num" data-lp="p2">8,000</div>
        <div class="lp-row"></div>
      </section>
      <div class="phase-wrap">
        <button type="button" class="phase-badge phase-you">Turn 1 · Draw</button>
        <div class="phase-pop" hidden></div>
      </div>
      <div class="hud-tools">
        <button type="button" data-act="undo" disabled>Undo</button>
        <button type="button" data-act="die">Die</button>
        <button type="button" data-act="coin">Coin</button>
      </div>
      <div class="toast" hidden></div>`
    parent.appendChild(this.root)

    this.lpNum = {
      p1: this.root.querySelector('[data-lp="p1"]')!,
      p2: this.root.querySelector('[data-lp="p2"]')!,
    }
    this.phaseWrap = this.root.querySelector('.phase-wrap')!
    this.phaseBtn = this.root.querySelector('.phase-badge')!
    this.phasePop = this.root.querySelector('.phase-pop')!
    this.lpEl = {
      p1: this.root.querySelector('.lp-you')!,
      p2: this.root.querySelector('.lp-opp')!,
    }
    this.undoBtn = this.root.querySelector('[data-act="undo"]')!
    this.toastEl = this.root.querySelector('.toast')!

    const steps = [-1000, -100, 100, 1000]
    this.root.querySelectorAll('.lp-row').forEach((row, i) => {
      const owner: Owner = i === 0 ? 'p1' : 'p2'
      for (const step of steps) {
        const b = document.createElement('button')
        b.type = 'button'
        b.textContent = step > 0 ? `+${step}` : `${step}`
        b.addEventListener('click', () => handlers.onLp(owner, step))
        row.appendChild(b)
      }
    })
    handlers.phases.forEach((name, i) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = name
      b.addEventListener('click', () => {
        this.phasePop.hidden = true
        handlers.onSetPhase(i)
      })
      this.phaseItems.push(b)
      this.phasePop.appendChild(b)
    })
    const end = document.createElement('button')
    end.type = 'button'
    end.className = 'phase-end'
    end.textContent = 'End turn'
    end.addEventListener('click', () => {
      this.phasePop.hidden = true
      handlers.onEndTurn()
    })
    this.phasePop.appendChild(end)
    this.phaseBtn.addEventListener('click', () => {
      this.phasePop.hidden = !this.phasePop.hidden
    })
    this.undoBtn.addEventListener('click', handlers.onUndo)
    window.addEventListener('pointerdown', this.onOutside)
    window.addEventListener('keydown', this.onKey)
    this.root.querySelector('[data-act="die"]')!.addEventListener('click', handlers.onDie)
    this.root.querySelector('[data-act="coin"]')!.addEventListener('click', handlers.onCoin)
  }

  setUndoEnabled(v: boolean) {
    this.undoBtn.disabled = !v
  }

  private onOutside = (e: PointerEvent) => {
    if (this.phasePop.hidden) return
    if (this.phaseWrap.contains(e.target as Node)) return
    this.phasePop.hidden = true
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.phasePop.hidden = true
  }

  setPhase(turn: number, phase: string, active: Owner) {
    this.phaseBtn.textContent = `Turn ${turn} · ${phase}`
    this.phaseBtn.classList.toggle('phase-you', active === 'p1')
    this.phaseBtn.classList.toggle('phase-opp', active === 'p2')
    this.phaseItems.forEach((b) => b.classList.toggle('is-current', b.textContent === phase))
    this.lpEl.p1.classList.toggle('lp-active', active === 'p1')
    this.lpEl.p2.classList.toggle('lp-active', active === 'p2')
  }

  setLp(owner: Owner, value: number) {
    if (this.target[owner] === value) return
    const from = this.shown[owner]
    this.target[owner] = value
    cancelAnimationFrame(this.runs[owner])
    const t0 = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 320)
      const eased = 1 - Math.pow(1 - k, 3)
      this.shown[owner] = Math.round(from + (value - from) * eased)
      this.paint(owner)
      if (k < 1) this.runs[owner] = requestAnimationFrame(tick)
    }
    this.runs[owner] = requestAnimationFrame(tick)
  }

  private paint(owner: Owner) {
    this.lpNum[owner].textContent = this.shown[owner].toLocaleString('en-US')
  }

  toast(text: string) {
    this.toastEl.hidden = false
    this.toastEl.textContent = text
    clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.hidden = true
    }, 1600)
  }

  dispose() {
    cancelAnimationFrame(this.runs.p1)
    cancelAnimationFrame(this.runs.p2)
    clearTimeout(this.toastTimer)
    window.removeEventListener('pointerdown', this.onOutside)
    window.removeEventListener('keydown', this.onKey)
    this.root.remove()
  }
}
