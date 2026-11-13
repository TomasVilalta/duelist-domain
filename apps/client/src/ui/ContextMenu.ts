export interface MenuItem {
  label?: string
  action?: () => void
  separator?: boolean
  disabled?: boolean
}

/** Lightweight DOM context menu + small stats dialog, positioned at the cursor. */
export class ContextMenu {
  private el: HTMLDivElement
  private open_ = false

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'ctx-menu'
    this.el.hidden = true
    document.body.appendChild(this.el)
    window.addEventListener('pointerdown', this.onOutside, true)
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('blur', this.close)
  }

  dispose() {
    window.removeEventListener('pointerdown', this.onOutside, true)
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('blur', this.close)
    this.el.remove()
  }

  private onOutside = (e: PointerEvent) => {
    if (this.open_ && !this.el.contains(e.target as Node)) this.close()
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close()
  }

  onOpen?: () => void
  onClose?: () => void

  close = () => {
    if (!this.open_) return
    this.open_ = false
    this.el.hidden = true
    this.el.replaceChildren()
    this.onClose?.()
  }

  /**
   * `above` places the menu so its bottom edge sits just over (x, y),
   * with x treated as the horizontal centre. Otherwise (x, y) is the top-left.
   */
  private show(x: number, y: number, above: boolean) {
    this.open_ = true
    this.el.hidden = false
    const margin = 8
    this.el.style.maxHeight = `${window.innerHeight - margin * 2}px`
    // restart the small pop-in animation on every open
    this.el.classList.remove('ctx-anim')
    this.el.classList.toggle('ctx-above', above)
    void this.el.offsetWidth
    this.el.classList.add('ctx-anim')
    this.onOpen?.()
    const r = this.el.getBoundingClientRect()
    const h = Math.min(r.height, window.innerHeight - margin * 2)
    let left = above ? x - r.width / 2 : x
    let top = above ? y - h - 10 : y
    left = Math.max(margin, Math.min(left, window.innerWidth - r.width - margin))
    top = Math.max(margin, Math.min(top, window.innerHeight - h - margin))
    this.el.style.left = `${left}px`
    this.el.style.top = `${top}px`
  }

  open(x: number, y: number, title: string, items: MenuItem[], above = false) {
    this.el.replaceChildren()
    const t = document.createElement('div')
    t.className = 'ctx-title'
    t.textContent = title
    this.el.appendChild(t)
    for (const it of items) {
      if (it.separator) {
        const s = document.createElement('div')
        s.className = 'ctx-sep'
        this.el.appendChild(s)
        continue
      }
      const b = document.createElement('button')
      b.className = 'ctx-item'
      b.textContent = it.label ?? ''
      b.disabled = !!it.disabled
      b.addEventListener('click', () => {
        this.close()
        it.action?.()
      })
      this.el.appendChild(b)
    }
    this.show(x, y, above)
  }

  openStats(x: number, y: number, atk: number, def: number, onOk: (atk: number, def: number) => void) {
    this.el.replaceChildren()
    const t = document.createElement('div')
    t.className = 'ctx-title'
    t.textContent = 'Edit ATK / DEF'
    const form = document.createElement('form')
    form.className = 'ctx-form'
    const mk = (label: string, value: number) => {
      const l = document.createElement('label')
      l.textContent = label
      const i = document.createElement('input')
      i.type = 'number'
      i.step = '100'
      i.value = String(value)
      l.appendChild(i)
      form.appendChild(l)
      return i
    }
    const a = mk('ATK', atk)
    const d = mk('DEF', def)
    const ok = document.createElement('button')
    ok.type = 'submit'
    ok.className = 'ctx-item'
    ok.textContent = 'Apply'
    form.appendChild(ok)
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      this.close()
      onOk(Number(a.value) || 0, Number(d.value) || 0)
    })
    this.el.append(t, form)
    this.show(x, y, false)
    a.focus()
    a.select()
  }
}
