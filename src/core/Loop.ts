export interface Updatable {
  /** Return true while the system is still animating (keeps rendering). */
  update(dt: number, time: number): boolean
}

/** Render-on-demand loop. Renders only when invalidated or a system is active. */
export class Loop {
  private systems: Updatable[] = []
  private dirty = true
  private raf = 0
  private last = 0
  private time = 0
  private running = false

  private render: () => void

  constructor(render: () => void) {
    this.render = render
  }

  add(s: Updatable) {
    this.systems.push(s)
  }

  invalidate = () => {
    this.dirty = true
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.tick)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  private onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf)
    } else if (this.running) {
      this.last = performance.now()
      this.raf = requestAnimationFrame(this.tick)
    }
  }

  private tick = (now: number) => {
    if (!this.running) return
    const dt = Math.min((now - this.last) / 1000, 0.1)
    this.last = now
    this.time += dt
    let active = false
    for (const s of this.systems) if (s.update(dt, this.time)) active = true
    if (active || this.dirty) {
      this.dirty = false
      this.render()
    }
    this.raf = requestAnimationFrame(this.tick)
  }
}
