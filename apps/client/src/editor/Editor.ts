import {
  BoxHelper,
  GridHelper,
  MathUtils,
  MOUSE,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Group,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { loadPBR } from '@/core/Assets'
import { createBoard, GROUND_Y } from '@/scene/Board'
import { setupEnvironment } from '@/scene/Environment'
import { Lights } from '@/scene/Lights'
import { MODELS, loadLayout, type ModelKey, type Prop } from '@/scene/layout'
import { propTemplate } from '@/scene/Ruins'

type Mode = 'translate' | 'rotate' | 'scale'

const SNAP = { move: 0.5, rot: MathUtils.degToRad(15), scale: 0.1 }

export interface EditorHooks {
  onStatus: (text: string) => void
  onSelection: (model: ModelKey | null) => void
  onPlacing: (model: ModelKey | null) => void
  onMode: (mode: Mode) => void
}

/** Click-to-place scene editor. The gizmo moves, rotates and scales the selection. */
export class Editor {
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(45, 1, 0.1, 200)
  private readonly renderer: WebGLRenderer
  private readonly orbit: OrbitControls
  private readonly gizmo: TransformControls
  private readonly ray = new Raycaster()
  private readonly ndc = new Vector2()
  private readonly hit = new Vector3()
  private readonly props: Group[] = []
  private readonly templates = new Map<ModelKey, Group>()
  private readonly box: BoxHelper
  private selected: Group | null = null
  private placing: ModelKey | null = null
  private snap = true
  private mode: Mode = 'translate'
  private skipClick = false
  private disposed = false
  private raf = 0
  private down = { x: 0, y: 0 }

  private readonly canvas: HTMLCanvasElement
  private readonly hooks: EditorHooks

  constructor(canvas: HTMLCanvasElement, hooks: EditorHooks) {
    this.canvas = canvas
    this.hooks = hooks
    this.renderer = new WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFShadowMap
    this.camera.position.set(0, 16, 18)

    this.orbit = new OrbitControls(this.camera, canvas)
    this.orbit.target.set(0, 0, 0)
    this.orbit.maxPolarAngle = Math.PI / 2.05
    this.orbit.mouseButtons.LEFT = null
    this.orbit.mouseButtons.RIGHT = MOUSE.ROTATE
    this.orbit.mouseButtons.MIDDLE = MOUSE.PAN
    this.orbit.update()

    this.gizmo = new TransformControls(this.camera, canvas)
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !(e as unknown as { value: boolean }).value
    })
    this.gizmo.addEventListener('mouseUp', () => {
      this.skipClick = true
      this.settle()
    })
    this.scene.add(this.gizmo.getHelper())

    const grid = new GridHelper(48, 96, 0x4a4338, 0x2c2824)
    grid.position.y = GROUND_Y + 0.02
    this.scene.add(grid)
    this.box = new BoxHelper(new Object3D(), 0xffb15a)
    this.box.visible = false
    this.scene.add(this.box)

    this.applySnap()
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('contextmenu', this.blockMenu)
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('resize', this.onResize)
    this.onResize()
  }

  async start() {
    this.hooks.onStatus('Loading models…')
    const [stone, grass] = await Promise.all([
      loadPBR('stone', 'stone', this.renderer, 4, true),
      loadPBR('grass', 'grass', this.renderer, 1),
      setupEnvironment(this.scene, this.renderer),
    ])
    if (this.disposed) return
    this.scene.add(createBoard(stone, grass))
    const lights = new Lights(this.renderer, 2048)
    this.scene.add(lights.group)
    const layout = await loadLayout().catch(() => [] as Prop[])
    if (this.disposed) return
    for (const prop of layout) this.props.push(await this.make(prop.m, prop))
    this.scene.add(...this.props)
    this.hooks.onStatus(`${this.props.length} props · right-drag orbits, wheel zooms`)
    this.tick()
  }

  setMode(mode: Mode) {
    this.mode = mode
    this.gizmo.setMode(mode)
    this.hooks.onMode(mode)
    const rotating = mode === 'rotate'
    this.gizmo.showX = !rotating
    this.gizmo.showZ = !rotating
  }

  setSnap(on: boolean) {
    this.snap = on
    this.applySnap()
  }

  /** Next click on the ground drops one of these. Click again or press Esc to stop. */
  arm(model: ModelKey) {
    this.placing = this.placing === model ? null : model
    if (this.placing) this.gizmo.detach()
    this.hooks.onPlacing(this.placing)
    this.hooks.onStatus(this.placing ? `Placing ${this.placing} · click the ground · Esc cancels` : 'Placement cancelled')
  }

  duplicate() {
    const g = this.selected
    if (!g) return
    const copy = g.clone()
    copy.position.x += SNAP.move
    copy.userData.model = g.userData.model
    this.tag(copy)
    this.props.push(copy)
    this.scene.add(copy)
    this.select(copy)
  }

  remove() {
    const g = this.selected
    if (!g) return
    this.gizmo.detach()
    this.scene.remove(g)
    this.props.splice(this.props.indexOf(g), 1)
    this.selected = null
    this.box.visible = false
    this.hooks.onSelection(null)
  }

  async save() {
    const body = JSON.stringify(this.serialize(), null, 2)
    const res = await fetch('/api/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    if (!res.ok) {
      this.download()
      this.hooks.onStatus('The dev server rejected the save, so the file was downloaded instead')
      return
    }
    this.hooks.onStatus('Saved to public/layout.json · reload the game to see it')
  }

  download() {
    const blob = new Blob([JSON.stringify(this.serialize(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'layout.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.canvas.removeEventListener('pointerdown', this.onDown)
    this.canvas.removeEventListener('pointerup', this.onUp)
    this.canvas.removeEventListener('contextmenu', this.blockMenu)
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('resize', this.onResize)
    this.gizmo.dispose()
    this.orbit.dispose()
    this.renderer.dispose()
  }

  private serialize(): Prop[] {
    const n = (v: number) => Math.round(v * 1000) / 1000
    return this.props.map((g) => ({
      m: g.userData.model as ModelKey,
      x: n(g.position.x),
      z: n(g.position.z),
      rot: n(MathUtils.radToDeg(g.rotation.y)),
      s: n(g.scale.x),
      y: n(g.position.y - GROUND_Y),
    }))
  }

  /** Keep props upright and uniformly scaled, which is all the layout stores. */
  private settle() {
    const g = this.selected
    if (!g) return
    g.rotation.x = 0
    g.rotation.z = 0
    if (this.mode === 'scale') g.scale.setScalar(Math.max(0.05, g.scale.x, g.scale.y, g.scale.z))
  }

  private applySnap() {
    this.gizmo.setTranslationSnap(this.snap ? SNAP.move : null)
    this.gizmo.setRotationSnap(this.snap ? SNAP.rot : null)
    this.gizmo.setScaleSnap(this.snap ? SNAP.scale : null)
  }

  private async make(model: ModelKey, prop: Prop): Promise<Group> {
    let src = this.templates.get(model)
    if (!src) {
      src = await propTemplate(model)
      this.templates.set(model, src)
    }
    const g = src.clone()
    g.position.set(prop.x, GROUND_Y + (prop.y ?? 0), prop.z)
    g.rotation.y = MathUtils.degToRad(prop.rot ?? 0)
    g.scale.setScalar(prop.s ?? 1)
    g.userData.model = model
    this.tag(g)
    return g
  }

  private tag(g: Group) {
    g.traverse((o) => {
      const mesh = o as { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean; userData: { prop?: Group } }
      if (!mesh.isMesh) return
      mesh.castShadow = mesh.receiveShadow = true
      mesh.userData.prop = g
    })
  }

  private select(g: Group | null) {
    this.selected = g
    if (g) this.gizmo.attach(g)
    else this.gizmo.detach()
    this.box.visible = !!g
    this.hooks.onSelection(g ? (g.userData.model as ModelKey) : null)
  }

  private pointer(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect()
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.camera)
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    this.down = { x: e.clientX, y: e.clientY }
  }

  private onUp = (e: PointerEvent) => {
    if (e.button !== 0) return
    if (this.skipClick) {
      this.skipClick = false
      return
    }
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 4) return
    this.pointer(e)
    if (this.placing) {
      void this.drop(this.placing)
      return
    }
    const hits = this.ray.intersectObjects(this.props, true)
    const prop = hits[0]?.object.userData.prop as Group | undefined
    this.select(prop ?? null)
  }

  private async drop(model: ModelKey) {
    const helper = this.gizmo.getHelper()
    const ground = this.ray.intersectObjects(this.scene.children, true).find((h) => {
      let o: Object3D | null = h.object
      while (o) {
        if (o.userData.prop || o === this.box || o === helper) return false
        o = o.parent
      }
      return true
    })
    if (!ground) return
    this.hit.copy(ground.point)
    const g = await this.make(model, { m: model, x: this.hit.x, z: this.hit.z, y: this.hit.y - GROUND_Y })
    if (this.disposed) return
    this.props.push(g)
    this.scene.add(g)
    this.select(g)
  }

  private onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (e.key === 'Escape') {
      this.placing = null
      this.hooks.onPlacing(null)
      this.select(null)
      this.hooks.onStatus('Selection cleared')
      return
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault()
      void this.save()
      return
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault()
      this.duplicate()
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      this.remove()
      return
    }
    if (e.key === 'w' || e.key === 'W') this.setMode('translate')
    if (e.key === 'e' || e.key === 'E') this.setMode('rotate')
    if (e.key === 'r' || e.key === 'R') this.setMode('scale')
  }

  private blockMenu = (e: Event) => e.preventDefault()

  private onResize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  private tick = () => {
    if (this.disposed) return
    if (this.selected) {
      this.box.setFromObject(this.selected)
    }
    this.renderer.render(this.scene, this.camera)
    this.raf = requestAnimationFrame(this.tick)
  }
}

export const MODEL_LIST = Object.keys(MODELS) as ModelKey[]
