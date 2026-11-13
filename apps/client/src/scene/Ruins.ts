import {
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  LoadingManager,
  Material,
  MathUtils,
  Matrix4,
  Mesh,
  type MeshStandardMaterial,
  Object3D,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GROUND_Y } from './Board'
import { MODELS, type ModelKey, type Prop } from './layout'

const BASE = import.meta.env.BASE_URL

/** The nature glTF files point at bare texture names. The files live in subfolders. */
const TEXTURE_DIRS: [string, string][] = [
  ['Bark_', 'Bark/'],
  ['Leaves_', 'Leaves/'],
  ['Leaf_', 'Leaf/'],
  ['Rocks_', 'Rocks/'],
  ['PathRocks_', 'PathRocks/'],
]
const manager = new LoadingManager()
manager.setURLModifier((url) => {
  const name = url.slice(url.lastIndexOf('/') + 1)
  if (!name.endsWith('.png')) return url
  const dir = TEXTURE_DIRS.find(([prefix]) => name.startsWith(prefix))?.[1] ?? ''
  return `${BASE}gltf/${dir}${name}`
})
const loader = new GLTFLoader(manager)

interface Part {
  geometry: BufferGeometry
  material: Material
}

/** Materials are shared by name across models. */
const materials = new Map<string, Material>()

function shared(mat: MeshStandardMaterial, vertexColors: boolean): Material {
  const key = `${mat.name}|${vertexColors}`
  const hit = materials.get(key)
  if (hit) {
    if (hit !== mat) {
      mat.map?.dispose()
      mat.normalMap?.dispose()
      mat.dispose()
    }
    return hit
  }
  mat.vertexColors = vertexColors
  materials.set(key, mat)
  return mat
}

/**
 * A model arrives as dozens of small meshes. Bake their transforms and merge
 * them per material, so each prop costs one draw call per material.
 */
const modelCache = new Map<ModelKey, Promise<Part[]>>()

function loadModel(key: ModelKey): Promise<Part[]> {
  const cached = modelCache.get(key)
  if (cached) return cached
  const pending = loadModelParts(key)
  modelCache.set(key, pending)
  return pending
}

/** One editable copy of a model. Geometry and materials are shared across copies. */
export async function propTemplate(key: ModelKey): Promise<Group> {
  const parts = await loadModel(key)
  const group = new Group()
  for (const part of parts) group.add(new Mesh(part.geometry, part.material))
  return group
}

async function loadModelParts(key: ModelKey): Promise<Part[]> {
  const gltf = await loader.loadAsync(`${BASE}${MODELS[key]}`)
  gltf.scene.updateMatrixWorld(true)
  const byMaterial = new Map<Material, BufferGeometry[]>()
  gltf.scene.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const geo = mesh.geometry.toNonIndexed().applyMatrix4(mesh.matrixWorld)
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') geo.deleteAttribute(name)
    }
    const mat = shared(mesh.material as MeshStandardMaterial, !!geo.getAttribute('color'))
    const list = byMaterial.get(mat)
    if (list) list.push(geo)
    else byMaterial.set(mat, [geo])
  })
  const parts: Part[] = []
  for (const [material, geos] of byMaterial) {
    if (geos.some((g) => g.getAttribute('color'))) {
      for (const g of geos) {
        if (g.getAttribute('color')) continue
        const count = g.getAttribute('position').count
        g.setAttribute('color', new BufferAttribute(new Float32Array(count * 3).fill(1), 3))
      }
    }
    const geometry = mergeGeometries(geos)
    if (geometry) parts.push({ geometry, material })
    geos.forEach((g) => g.dispose())
  }
  return parts
}

/** Build a layout. Everything is static and instanced. */
export async function createRuins(layout: Prop[]): Promise<Group> {
  const group = new Group()
  const used = [...new Set(layout.map((prop) => prop.m))]
  const parts = new Map<ModelKey, Part[]>()
  await Promise.all(used.map(async (key) => parts.set(key, await loadModel(key))))

  const byModel = new Map<ModelKey, Prop[]>()
  for (const prop of layout) {
    const list = byModel.get(prop.m)
    if (list) list.push(prop)
    else byModel.set(prop.m, [prop])
  }

  const dummy = new Object3D()
  const m = new Matrix4()
  for (const [key, props] of byModel) {
    for (const part of parts.get(key) ?? []) {
      const mesh = new InstancedMesh(part.geometry, part.material, props.length)
      props.forEach((prop, i) => {
        dummy.position.set(prop.x, GROUND_Y + (prop.y ?? 0), prop.z)
        dummy.rotation.set(0, MathUtils.degToRad(prop.rot ?? 0), 0)
        dummy.scale.setScalar(prop.s ?? 1)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, m.copy(dummy.matrix))
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.matrixAutoUpdate = false
      mesh.computeBoundingSphere()
      group.add(mesh)
    }
  }
  return group
}
