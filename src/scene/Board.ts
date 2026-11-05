import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  type Texture,
  Vector2,
} from 'three'
import { BOARD } from '@/config'
import type { PBRSet } from '@/core/Assets'

export const GROUND_Y = -BOARD.slabH

function patchStoneWithGrass(mat: MeshStandardMaterial, grass: Texture) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrass = { value: grass }
    shader.uniforms.uHalf = { value: new Vector2(BOARD.slabW / 2, BOARD.slabD / 2) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWPos;
uniform sampler2D uGrass;
uniform vec2 uHalf;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float n = vnoise(vWPos.xz * 0.8) * 0.6 + vnoise(vWPos.xz * 3.3) * 0.4;
  vec2 q = abs(vWPos.xz) / uHalf;
  float edge = max(q.x, q.y);
  float m = smoothstep(0.93, 1.03, edge + (n - 0.5) * 0.16);
  // small moss patches inside the arena
  m = max(m, smoothstep(0.78, 0.86, vnoise(vWPos.xz * 1.1)) * 0.3);
  vec3 g = texture2D(uGrass, vWPos.xz * 0.3).rgb * vec3(0.55, 0.85, 0.4);
  diffuseColor.rgb = mix(diffuseColor.rgb, g, m);
}`,
      )
  }
  mat.customProgramCacheKey = () => 'stone-grass'
}

export function createBoard(stone: PBRSet, grass: PBRSet): Group {
  const group = new Group()

  // Grass ground
  const groundColor = grass.color.clone()
  const groundNormal = grass.normal.clone()
  const groundRough = grass.roughness.clone()
  for (const t of [groundColor, groundNormal, groundRough]) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(16, 16)
    t.needsUpdate = true
  }
  const ground = new Mesh(
    new PlaneGeometry(70, 70),
    new MeshStandardMaterial({ map: groundColor, normalMap: groundNormal, roughnessMap: groundRough, roughness: 1, color: new Color(0.55, 0.85, 0.4) }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = GROUND_Y
  ground.receiveShadow = true
  group.add(ground)

  // Stone slab (top face at y = 0)
  grass.color.wrapS = grass.color.wrapT = RepeatWrapping
  const stoneMat = new MeshStandardMaterial({
    map: stone.color,
    normalMap: stone.normal,
    roughnessMap: stone.roughness,
    aoMap: stone.ao,
    roughness: 1,
    color: new Color(1.9, 1.9, 1.8),
  })
  const wallMat = new MeshStandardMaterial({
    map: stone.color,
    normalMap: stone.normal,
    roughnessMap: stone.roughness,
    roughness: 1,
    color: new Color(1.3, 1.3, 1.25),
  })
  patchStoneWithGrass(stoneMat, grass.color)

  const slab = new Mesh(new BoxGeometry(BOARD.slabW, BOARD.slabH, BOARD.slabD), stoneMat)
  slab.position.y = -BOARD.slabH / 2
  slab.castShadow = true
  slab.receiveShadow = true
  group.add(slab)

  // Raised centre divider
  const divider = new Mesh(new BoxGeometry(BOARD.slabW - 1.2, 0.04, 0.12), stoneMat)
  divider.position.y = 0.02
  divider.receiveShadow = true
  group.add(divider)

  // Low border wall
  const t = 0.4
  const h = 0.4
  const borders: [number, number, number, number][] = [
    [BOARD.slabW + t, t, 0, BOARD.slabD / 2],
    [BOARD.slabW + t, t, 0, -BOARD.slabD / 2],
    [t, BOARD.slabD, BOARD.slabW / 2, 0],
    [t, BOARD.slabD, -BOARD.slabW / 2, 0],
  ]
  for (const [w, d, x, z] of borders) {
    const b = new Mesh(new BoxGeometry(w, h, d), wallMat)
    b.position.set(x, h / 2 - BOARD.slabH / 2, z)
    b.castShadow = true
    b.receiveShadow = true
    group.add(b)
  }

  return group
}
