import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'
import { BOARD } from '@/config'
import type { PBRSet } from '@/core/Assets'

export const GROUND_Y = -BOARD.slabH

/** Top of the ruin floor tiles. Cards and zone outlines sit just above this. */
export const PLAY_Y = 0.36

/** Flat olive ground around the stone stage. */
const FLOOR = new Color(0x4e660e)

export function createBoard(_stone: PBRSet, _grass: PBRSet): Group {
  const group = new Group()
  const mat = new MeshStandardMaterial({ color: FLOOR, roughness: 1 })

  const ground = new Mesh(new PlaneGeometry(70, 70), mat)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = GROUND_Y
  ground.receiveShadow = true
  group.add(ground)

  const slab = new Mesh(new BoxGeometry(BOARD.slabW, BOARD.slabH, BOARD.slabD), mat)
  slab.position.y = -BOARD.slabH / 2
  slab.castShadow = true
  slab.receiveShadow = true
  group.add(slab)

  return group
}
