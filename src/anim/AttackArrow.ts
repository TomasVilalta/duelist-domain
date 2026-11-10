import { ConeGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Scene, Vector3 } from 'three'
import type { Updatable } from '@/core/Loop'

const Y = 0.16

/** Flat arrow on the board from the attacker to its declared target. Pulses while shown. */
export class AttackArrow implements Updatable {
  private readonly group = new Group()
  private readonly shaft: Mesh
  private readonly head: Mesh
  private readonly mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false })
  private readonly shaftGeo = new PlaneGeometry(1, 0.1)
  private readonly headGeo = new ConeGeometry(0.2, 0.42, 20)
  private t = 0

  constructor(private readonly scene: Scene, private readonly invalidate: () => void) {
    this.mat.color.setRGB(2.6, 0.55, 0.15)
    this.mat.fog = false
    this.shaftGeo.rotateX(-Math.PI / 2)
    // cone points up by default; lay it along +X
    this.headGeo.rotateZ(-Math.PI / 2)
    this.shaft = new Mesh(this.shaftGeo, this.mat)
    this.head = new Mesh(this.headGeo, this.mat)
    this.shaft.renderOrder = this.head.renderOrder = 4
    this.group.add(this.shaft, this.head)
    this.group.visible = false
    scene.add(this.group)
  }

  show(from: Vector3, to: Vector3) {
    const dir = to.clone().sub(from).setY(0)
    const len = dir.length()
    if (len < 0.01) return this.hide()
    dir.normalize()
    const headLen = 0.42
    const start = from.clone().addScaledVector(dir, 0.5)
    const end = to.clone().addScaledVector(dir, -0.45)
    const span = Math.max(0.05, end.distanceTo(start) - headLen)
    this.group.position.set(start.x, Y, start.z)
    this.group.rotation.y = -Math.atan2(dir.z, dir.x)
    this.shaft.scale.x = span
    this.shaft.position.x = span / 2
    this.head.position.x = span + headLen / 2
    this.group.visible = true
    this.invalidate()
  }

  hide() {
    this.group.visible = false
    this.invalidate()
  }

  update(dt: number): boolean {
    if (!this.group.visible) return false
    this.t += dt
    this.mat.opacity = 0.65 + 0.3 * Math.sin(this.t * 7)
    return true
  }

  dispose() {
    this.group.removeFromParent()
    this.mat.dispose()
    this.shaftGeo.dispose()
    this.headGeo.dispose()
  }
}
