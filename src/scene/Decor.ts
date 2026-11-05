import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from 'three'
import { BOARD } from '@/config'
import type { PBRSet } from '@/core/Assets'
import { GROUND_Y } from './Board'

export function createDecor(stone: PBRSet, grassCount: number): Group {
  const group = new Group()
  const hx = BOARD.slabW / 2 + 0.1
  const hz = BOARD.slabD / 2 + 0.1

  // Corner pillars + glowing orbs (1 draw call each)
  const pillarMat = new MeshStandardMaterial({
    map: stone.color,
    normalMap: stone.normal,
    roughnessMap: stone.roughness,
    roughness: 1,
    color: 0xaaaaa2,
  })
  const pillars = new InstancedMesh(new CylinderGeometry(0.42, 0.55, 1.6, 8), pillarMat, 4)
  const orbs = new InstancedMesh(
    new SphereGeometry(0.22, 16, 12),
    new MeshBasicMaterial({ color: new Color(0.5, 2.2, 2.4) }),
    4,
  )
  pillars.castShadow = true
  pillars.receiveShadow = true
  const dummy = new Object3D()
  const corners: [number, number][] = [
    [-hx, -hz],
    [hx, -hz],
    [-hx, hz],
    [hx, hz],
  ]
  corners.forEach(([x, z], i) => {
    dummy.position.set(x, 0.8 + GROUND_Y + 0.3, z)
    dummy.updateMatrix()
    pillars.setMatrixAt(i, dummy.matrix)
    dummy.position.y += 1.05
    dummy.updateMatrix()
    orbs.setMatrixAt(i, dummy.matrix)
  })
  group.add(pillars, orbs)

  // Grass blades around the arena (static, 1 draw call)
  if (grassCount > 0) {
    const blades = new InstancedMesh(
      new ConeGeometry(0.022, 0.4, 3, 1, true),
      new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: 2 }),
      grassCount,
    )
    blades.receiveShadow = true
    const m = new Matrix4()
    const c = new Color()
    let seed = 1337
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < grassCount; i++) {
      let x: number
      let z: number
      do {
        x = (rnd() - 0.5) * 2 * (hx + 6)
        z = (rnd() - 0.5) * 2 * (hz + 6)
      } while (Math.abs(x) < hx + 0.5 && Math.abs(z) < hz + 0.5)
      const s = 0.6 + rnd() * 0.9
      dummy.position.set(x, GROUND_Y + 0.25 * s, z)
      dummy.rotation.set((rnd() - 0.5) * 0.4, rnd() * 6.28, (rnd() - 0.5) * 0.4)
      dummy.scale.set(s, s, s)
      dummy.updateMatrix()
      m.copy(dummy.matrix)
      blades.setMatrixAt(i, m)
      blades.setColorAt(i, c.setHSL(0.24 + rnd() * 0.06, 0.5, 0.1 + rnd() * 0.07))
    }
    group.add(blades)
  }

  group.traverse((o) => {
    if (o instanceof Mesh || o instanceof InstancedMesh) o.matrixAutoUpdate = false
  })
  group.updateMatrixWorld(true)
  return group
}
