import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import type { Updatable } from '@/core/Loop'

export type ViewName = 'player' | 'top' | 'opponent'

const VIEWS: Record<ViewName, { azimuth: number; elevation: number }> = {
  player: { azimuth: 0, elevation: MathUtils.degToRad(55) },
  top: { azimuth: 0, elevation: MathUtils.degToRad(88) },
  opponent: { azimuth: Math.PI, elevation: MathUtils.degToRad(55) },
}

/** Static camera; only moves when switching view presets (V key). */
export class CameraRig implements Updatable {
  readonly camera = new PerspectiveCamera(40, 1, 0.1, 120)
  private azimuth = 0
  private elevation = VIEWS.player.elevation
  private targetView = VIEWS.player
  private distance = 16
  private readonly center = new Vector3(0, 0, 1.0)
  private pos = new Vector3()
  view: ViewName = 'player'
  private invalidate: () => void

  constructor(invalidate: () => void) {
    this.invalidate = invalidate
    this.apply()
  }

  setView(v: ViewName) {
    this.view = v
    this.targetView = VIEWS[v]
    this.invalidate()
  }

  cycleView() {
    const order: ViewName[] = ['player', 'top', 'opponent']
    this.setView(order[(order.indexOf(this.view) + 1) % order.length])
  }

  resize(w: number, h: number) {
    const cam = this.camera
    cam.aspect = w / h
    const tanHalf = Math.tan(MathUtils.degToRad(cam.fov / 2))
    const fitW = 16.5 / (2 * tanHalf * cam.aspect)
    const fitH = (13.5 * Math.sin(VIEWS.player.elevation) + 2) / (2 * tanHalf)
    this.distance = Math.max(fitW, fitH)
    cam.updateProjectionMatrix()
    this.apply()
    this.invalidate()
  }

  private apply() {
    const cosE = Math.cos(this.elevation)
    this.pos.set(
      Math.sin(this.azimuth) * cosE * this.distance,
      Math.sin(this.elevation) * this.distance,
      Math.cos(this.azimuth) * cosE * this.distance,
    )
    this.pos.add(this.center)
    this.camera.position.copy(this.pos)
    this.camera.lookAt(this.center)
  }

  update(dt: number): boolean {
    const dAz = this.targetView.azimuth - this.azimuth
    const dEl = this.targetView.elevation - this.elevation
    if (Math.abs(dAz) < 1e-3 && Math.abs(dEl) < 1e-3) {
      if (dAz === 0 && dEl === 0) return false
      this.azimuth = this.targetView.azimuth
      this.elevation = this.targetView.elevation
      this.apply()
      return true
    }
    const k = 1 - Math.exp(-dt * 5)
    this.azimuth += dAz * k
    this.elevation += dEl * k
    this.apply()
    return true
  }
}
