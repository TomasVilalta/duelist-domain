import { DirectionalLight, Group, HemisphereLight, type WebGLRenderer } from 'three'

export class Lights {
  readonly group = new Group()
  readonly key = new DirectionalLight(0xffe0b0, 2.6)
  readonly rim = new DirectionalLight(0x6fa8ff, 1.2)
  readonly fill = new HemisphereLight(0xbfd8ff, 0x1e3a1a, 0.35)

  private renderer: WebGLRenderer

  constructor(renderer: WebGLRenderer, shadowSize: number) {
    this.renderer = renderer
    const k = this.key
    k.position.set(-7, 13, 7)
    k.castShadow = true
    k.shadow.mapSize.set(shadowSize, shadowSize)
    const c = k.shadow.camera
    c.left = -11
    c.right = 11
    c.top = 9
    c.bottom = -9
    c.near = 1
    c.far = 35
    k.shadow.bias = -0.0004
    k.shadow.normalBias = 0.03
    k.shadow.radius = 3

    this.rim.position.set(8, 6, -9)

    this.group.add(k, this.rim, this.fill)
  }

  /** Shadows are static; refresh only when the casters change. */
  refreshShadows() {
    this.renderer.shadowMap.needsUpdate = true
  }
}
