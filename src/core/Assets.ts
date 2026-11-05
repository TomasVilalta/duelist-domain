import {
  ClampToEdgeWrapping,
  type DataTexture,
  type Texture,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type WebGLRenderer,
} from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

const loader = new TextureLoader()

export function loadTexture(url: string, srgb: boolean, renderer: WebGLRenderer, repeat = 1): Promise<Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (t) => {
        t.wrapS = t.wrapT = repeat === 1 ? ClampToEdgeWrapping : RepeatWrapping
        t.repeat.set(repeat, repeat)
        if (srgb) t.colorSpace = SRGBColorSpace
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
        resolve(t)
      },
      undefined,
      reject,
    )
  })
}

export function loadHDR(url: string): Promise<DataTexture> {
  return new Promise((resolve, reject) => new HDRLoader().load(url, resolve, undefined, reject))
}

export interface PBRSet {
  color: Texture
  normal: Texture
  roughness: Texture
  ao?: Texture
}

export async function loadPBR(dir: string, name: string, renderer: WebGLRenderer, repeat: number, ao = false): Promise<PBRSet> {
  const base = `${import.meta.env.BASE_URL}textures/${dir}/${name}`
  const [color, normal, roughness, aoTex] = await Promise.all([
    loadTexture(`${base}_color.jpg`, true, renderer, repeat),
    loadTexture(`${base}_normal.jpg`, false, renderer, repeat),
    loadTexture(`${base}_roughness.jpg`, false, renderer, repeat),
    ao ? loadTexture(`${base}_ao.jpg`, false, renderer, repeat) : Promise.resolve(undefined),
  ])
  return { color, normal, roughness, ao: aoTex }
}
