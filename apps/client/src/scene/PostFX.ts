import { HalfFloatType, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three'
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing'
import type { QualityPreset } from '@/config'

export class PostFX {
  readonly composer: EffectComposer
  readonly bloom: BloomEffect

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, q: QualityPreset) {
    this.composer = new EffectComposer(renderer, {
      frameBufferType: HalfFloatType,
      multisampling: q.msaa,
    })
    this.composer.addPass(new RenderPass(scene, camera))

    this.bloom = new BloomEffect({
      mipmapBlur: true,
      intensity: 0.9,
      luminanceThreshold: 1.0,
      luminanceSmoothing: 0.15,
      radius: 0.7,
    })
    const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.65 })
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })

    const effects = q.bloom ? [this.bloom, vignette, tone] : [vignette, tone]
    this.composer.addPass(new EffectPass(camera, ...effects))
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h)
  }

  render(dt: number) {
    this.composer.render(dt)
  }

  dispose() {
    this.composer.dispose()
  }
}
