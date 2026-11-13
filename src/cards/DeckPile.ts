import { BoxGeometry, Euler, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import { easeInOutCubic, type Tweens } from '@/anim/Tweens'
import { CARD_H, CARD_W } from '@/config'
import { getZoneByKey } from '@/scene/ZoneLayout'
import { getSleeveMaterial } from './Card'

const THICKNESS = 0.012
let edge: MeshStandardMaterial | undefined
let geo: BoxGeometry | undefined

export class DeckPile {
  readonly mesh: Mesh
  private count = 0

  constructor(zoneKey: string, count: number) {
    const z = getZoneByKey(zoneKey)
    if (!z) throw new Error(`Unknown zone ${zoneKey}`)
    geo ??= new BoxGeometry(CARD_W, 1, CARD_H)
    edge ??= new MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.8 })
    const sleeve = getSleeveMaterial()
    this.mesh = new Mesh(geo, [edge, edge, sleeve, edge, edge, edge])
    this.mesh.position.x = z.x
    this.mesh.position.z = z.z
    this.mesh.rotation.y = z.rotY
    this.mesh.castShadow = false
    this.setCount(count)
  }

  setCount(n: number) {
    this.count = n
    this.mesh.visible = n > 0
    const h = Math.max(n, 1) * THICKNESS
    this.mesh.scale.y = h
    this.mesh.position.y = h / 2 + 0.35
  }

  get size() {
    return this.count
  }

  /** Quick riffle: the pile jolts side to side with a little twist, then settles. */
  shuffle(tweens: Tweens) {
    if (this.count < 2) return
    const mesh = this.mesh
    const rest = () => new Vector3(mesh.position.x, this.count ? Math.max(this.count, 1) * THICKNESS / 2 + 0.35 : 0, mesh.position.z)
    const base = mesh.position.clone()
    const baseY = Math.atan2(2 * (mesh.quaternion.y * mesh.quaternion.w), 1 - 2 * mesh.quaternion.y ** 2)
    const turn = (a: number) => new Quaternion().setFromEuler(new Euler(0, baseY + a, 0))
    const step = (dx: number, a: number, dur: number, next?: () => void) => {
      const to = rest()
      to.x = base.x + dx
      to.y += Math.abs(dx) * 0.4
      tweens.animate(mesh, { position: to, quaternion: turn(a) }, dur, { ease: easeInOutCubic, onDone: next })
    }
    step(-0.28, 0.12, 0.09, () =>
      step(0.28, -0.12, 0.12, () =>
        step(-0.16, 0.07, 0.1, () => {
          const to = rest()
          to.x = base.x
          tweens.animate(mesh, { position: to, quaternion: turn(0) }, 0.1, { ease: easeInOutCubic })
        }),
      ),
    )
  }

  /** World Y of the top card. */
  get topY() {
    return this.mesh.position.y + this.mesh.scale.y / 2
  }
}
