import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
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
    this.mesh.position.y = h / 2 + 0.01
  }

  get size() {
    return this.count
  }

  /** World Y of the top card. */
  get topY() {
    return this.mesh.scale.y + 0.012
  }
}
