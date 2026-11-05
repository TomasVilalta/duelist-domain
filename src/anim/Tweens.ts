import { Quaternion, Vector3, type Object3D } from 'three'
import type { Updatable } from '@/core/Loop'

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export interface TweenTarget {
  position?: Vector3
  quaternion?: Quaternion
  scale?: Vector3
}

interface Tween {
  obj: Object3D
  fromP: Vector3
  fromQ: Quaternion
  fromS: Vector3
  to: TweenTarget
  t: number
  dur: number
  delay: number
  ease: (t: number) => number
  onDone?: () => void
}

/** Transform tweens, one per object (a new tween replaces the old one). */
export class Tweens implements Updatable {
  private tweens = new Map<Object3D, Tween>()
  private invalidate: () => void

  constructor(invalidate: () => void) {
    this.invalidate = invalidate
  }

  animate(
    obj: Object3D,
    to: TweenTarget,
    dur = 0.25,
    opts: { delay?: number; ease?: (t: number) => number; onDone?: () => void } = {},
  ) {
    this.tweens.set(obj, {
      obj,
      fromP: obj.position.clone(),
      fromQ: obj.quaternion.clone(),
      fromS: obj.scale.clone(),
      to,
      t: 0,
      dur,
      delay: opts.delay ?? 0,
      ease: opts.ease ?? easeOutCubic,
      onDone: opts.onDone,
    })
    this.invalidate()
  }

  cancel(obj: Object3D) {
    this.tweens.delete(obj)
  }

  update(dt: number): boolean {
    for (const tw of this.tweens.values()) {
      if (tw.delay > 0) {
        tw.delay -= dt
        continue
      }
      tw.t += dt
      const done = tw.t >= tw.dur
      const k = done ? 1 : tw.ease(tw.t / tw.dur)
      if (tw.to.position) tw.obj.position.lerpVectors(tw.fromP, tw.to.position, k)
      if (tw.to.quaternion) tw.obj.quaternion.slerpQuaternions(tw.fromQ, tw.to.quaternion, k)
      if (tw.to.scale) tw.obj.scale.lerpVectors(tw.fromS, tw.to.scale, k)
      if (done) {
        this.tweens.delete(tw.obj)
        tw.onDone?.()
      }
    }
    return this.tweens.size > 0
  }
}
