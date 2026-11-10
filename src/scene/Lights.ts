import { DirectionalLight, Group, HemisphereLight, type WebGLRenderer } from 'three'

export class Lights {
  readonly group = new Group()
  readonly key = new DirectionalLight(0xffb15a, 3.4)
  readonly rim = new DirectionalLight(0x8eb4d8, 0.45)
  readonly fill = new HemisphereLight(0xffd7a8, 0x3a4a22, 0.7)

  private renderer: WebGLRenderer

  constructor(renderer: WebGLRenderer, shadowSize: number) {
    this.renderer = renderer
    const k = this.key
    // Low and from the side, so the light rakes across the board.
    k.position.set(-18, 7, 12)
    k.castShadow = true
    k.shadow.mapSize.set(shadowSize, shadowSize)
    const c = k.shadow.camera
    c.left = -20
    c.right = 20
    c.top = 18
    c.bottom = -18
    c.near = 1
    c.far = 60
    k.shadow.bias = -0.0004
    k.shadow.normalBias = 0.03
    k.shadow.radius = 3

    this.rim.position.set(10, 5, -8)

    this.group.add(k, this.rim, this.fill)
  }

  /** Shadows are static; refresh only when the casters change. */
  refreshShadows() {
    this.renderer.shadowMap.needsUpdate = true
  }
}
