import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Quaternion,
  Vector3,
  Euler,
} from 'three'
import { ZONES, ZONE_H, ZONE_W } from './ZoneLayout'

const vert = /* glsl */ `
attribute float aHighlight;
attribute float aRadius;
varying vec2 vUv;
varying float vH;
varying float vR;
void main() {
  vUv = uv;
  vH = aHighlight;
  vR = aRadius;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`

const frag = /* glsl */ `
uniform vec2 uSize;
uniform vec3 uBase;
uniform vec3 uGlow;
varying vec2 vUv;
varying float vH;
varying float vR;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = sdRoundBox(p, uSize * 0.5, vR);
  if (d > 0.0) discard;

  float aa = fwidth(d) * 1.5;
  // engraved fill: darker toward the edge (fake inner shadow)
  float depth = smoothstep(0.0, -0.18, d);
  float fill = mix(0.55, 0.28, depth);

  // rim line
  float line = 1.0 - smoothstep(0.0, 0.035 + aa, abs(d + 0.035));
  float soft = exp(d * 14.0);

  vec3 rim = uBase * 0.9 + uGlow * vH * 2.4;
  vec3 col = vec3(0.0);
  float alpha = fill;
  col += rim * line;
  col += uGlow * vH * soft * 0.9;
  alpha = clamp(alpha + line * 0.6 + vH * soft * 0.4, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}`

export class Zones {
  readonly mesh: InstancedMesh
  private highlight: InstancedBufferAttribute
  private index = new Map<string, number>()

  private invalidate: () => void

  constructor(invalidate: () => void) {
    this.invalidate = invalidate
    const geo = new PlaneGeometry(1, 1)
    geo.rotateX(-Math.PI / 2)

    const highlight = new InstancedBufferAttribute(new Float32Array(ZONES.length), 1)
    highlight.setUsage(DynamicDrawUsage)
    const radius = new InstancedBufferAttribute(new Float32Array(ZONES.length), 1)
    geo.setAttribute('aHighlight', highlight)
    geo.setAttribute('aRadius', radius)
    this.highlight = highlight

    const mat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      uniforms: {
        uSize: { value: new Vector2(ZONE_W, ZONE_H) },
        uBase: { value: new Color(0.3, 0.55, 0.5) },
        uGlow: { value: new Color(0.25, 0.9, 1.0) },
      },
    })

    this.mesh = new InstancedMesh(geo, mat, ZONES.length)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1

    const m = new Matrix4()
    const q = new Quaternion()
    const e = new Euler()
    ZONES.forEach((z, i) => {
      e.set(0, z.rotY, 0)
      q.setFromEuler(e)
      m.compose(new Vector3(z.x, 0.012, z.z), q, new Vector3(z.w, 1, z.h))
      this.mesh.setMatrixAt(i, m)
      radius.setX(i, z.pile ? 0.3 : 0.09)
      this.index.set(z.key, i)
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }

  setHighlight(key: string, value: number) {
    const i = this.index.get(key)
    if (i === undefined) return
    this.highlight.setX(i, value)
    this.highlight.needsUpdate = true
    this.invalidate()
  }

  setAllHighlights(value: number) {
    this.highlight.array.fill(value)
    this.highlight.needsUpdate = true
    this.invalidate()
  }
}
