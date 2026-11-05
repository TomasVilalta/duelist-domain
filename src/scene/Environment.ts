import { Color, EquirectangularReflectionMapping, FogExp2, PMREMGenerator, type Scene, type WebGLRenderer } from 'three'
import { loadHDR } from '@/core/Assets'

export async function setupEnvironment(scene: Scene, renderer: WebGLRenderer) {
  const hdr = await loadHDR(`${import.meta.env.BASE_URL}hdri/sky.hdr`)
  hdr.mapping = EquirectangularReflectionMapping

  const pmrem = new PMREMGenerator(renderer)
  scene.environment = pmrem.fromEquirectangular(hdr).texture
  scene.environmentIntensity = 0.55
  pmrem.dispose()

  scene.background = hdr
  scene.backgroundBlurriness = 0.35
  scene.backgroundIntensity = 0.45
  scene.fog = new FogExp2(new Color(0x16241a), 0.018)
}
