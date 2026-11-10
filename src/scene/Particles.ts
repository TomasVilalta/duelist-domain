import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial } from 'three'
import type { Updatable } from '@/core/Loop'

const vert = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute vec3 aSeed;
varying float vAlpha;
varying float vTint;
void main() {
  vec3 p = position;
  float rise = mod(uTime * (0.15 + aSeed.x * 0.25) + aSeed.y * 10.0, 5.0);
  p.y += rise;
  p.x += sin(uTime * 0.4 + aSeed.z * 6.283) * 0.6;
  p.z += cos(uTime * 0.33 + aSeed.y * 6.283) * 0.6;
  vAlpha = smoothstep(0.0, 0.8, rise) * (1.0 - smoothstep(3.8, 5.0, rise));
  vTint = aSeed.z;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (0.05 + aSeed.x * 0.08) * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`

const frag = /* glsl */ `
varying float vAlpha;
varying float vTint;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  a *= a;
  vec3 c = mix(vec3(0.4, 1.8, 1.6), vec3(1.6, 1.7, 0.6), step(0.75, vTint));
  gl_FragColor = vec4(c * a * vAlpha, a * vAlpha);
}`

const AMBIENT_STEP = 1 / 30

export class Particles implements Updatable {
  readonly points: Points
  enabled = true
  private mat: ShaderMaterial
  private since = 0

  constructor(count: number) {
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20
      pos[i * 3 + 1] = -0.2
      pos[i * 3 + 2] = (Math.random() - 0.5) * 16
      seed[i * 3] = Math.random()
      seed[i * 3 + 1] = Math.random()
      seed[i * 3 + 2] = Math.random()
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new BufferAttribute(seed, 3))

    this.mat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 800 } },
    })
    this.points = new Points(geo, this.mat)
    this.points.frustumCulled = false
  }

  setViewportHeight(px: number) {
    this.mat.uniforms.uScale.value = px * 0.9
  }

  update(dt: number, time: number): boolean {
    if (!this.enabled) return false
    this.mat.uniforms.uTime.value = time
    // Ambient drift is slow: 30 fps is enough and halves idle GPU work.
    this.since += dt
    if (this.since < AMBIENT_STEP) return false
    this.since = 0
    return true
  }
}
