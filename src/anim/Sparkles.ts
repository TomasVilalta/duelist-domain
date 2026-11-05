import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, Scene, ShaderMaterial, Vector3 } from 'three'
import type { Updatable } from '@/core/Loop'

const vert = /* glsl */ `
uniform float uT;
attribute vec3 aDir;
attribute float aSeed;
varying float vAlpha;
varying float vTint;
void main() {
  float t = clamp(uT, 0.0, 1.0);
  float travel = 1.0 - (1.0 - t) * (1.0 - t);
  vec3 p = aDir * travel;
  p.y += travel * 0.12;
  float fade = sin(t * 3.14159);
  float tw = abs(sin(t * 22.0 + aSeed * 40.0));
  vAlpha = fade * (0.15 + 0.5 * tw);
  vTint = aSeed;
  float size = (1.6 + aSeed * 2.2) * (aSeed > 0.82 ? 1.7 : 1.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = size * fade * (160.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`

const frag = /* glsl */ `
varying float vAlpha;
varying float vTint;
void main() {
  vec2 q = abs(gl_PointCoord - 0.5);
  float core = smoothstep(0.08, 0.0, length(q));
  float armX = smoothstep(0.045, 0.0, q.x) * smoothstep(0.5, 0.02, q.y);
  float armY = smoothstep(0.045, 0.0, q.y) * smoothstep(0.5, 0.02, q.x);
  float a = max(core, max(armX, armY));
  vec3 c = mix(vec3(1.0, 0.95, 0.55), vec3(0.75, 1.0, 0.95), step(0.62, vTint));
  gl_FragColor = vec4(c, 1.0) * (a * vAlpha);
}`

interface Burst {
  points: Points
  mat: ShaderMaterial
  age: number
  life: number
}

/** Short sparkle bursts parented in the scene. */
export class Sparkles implements Updatable {
  private bursts: Burst[] = []

  constructor(private scene: Scene, private invalidate: () => void) {}

  burst(at: Vector3) {
    const n = 36
    const dir = new Float32Array(n * 3)
    const seed = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2
      const up = 0.15 + Math.random() * 0.55
      const spread = 0.35 + Math.random() * 0.7
      dir[i * 3] = Math.cos(ang) * spread
      dir[i * 3 + 1] = up
      dir[i * 3 + 2] = Math.sin(ang) * spread
      seed[i] = Math.random()
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3))
    geo.setAttribute('aDir', new BufferAttribute(dir, 3))
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1))
    const mat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uT: { value: 0 } },
    })
    const points = new Points(geo, mat)
    points.position.copy(at)
    points.frustumCulled = false
    points.renderOrder = 2
    this.scene.add(points)
    this.bursts.push({ points, mat, age: 0, life: 0.45 })
    this.invalidate()
  }

  update(dt: number): boolean {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]
      b.age += dt
      b.mat.uniforms.uT.value = b.age / b.life
      if (b.age >= b.life) {
        this.scene.remove(b.points)
        b.points.geometry.dispose()
        b.mat.dispose()
        this.bursts.splice(i, 1)
      }
    }
    return this.bursts.length > 0
  }

  dispose() {
    for (const b of this.bursts) {
      this.scene.remove(b.points)
      b.points.geometry.dispose()
      b.mat.dispose()
    }
    this.bursts.length = 0
  }
}
