import type { Texture, WebGLRenderer } from 'three'
import { loadTexture } from '@/core/Assets'
import type { CardData } from '@/data/demoDeck'

const cache = new Map<string, Texture>()
const BACK_URL = `${import.meta.env.BASE_URL}cards/back.png`

export function cardBack(): Texture | undefined {
  return cache.get(BACK_URL)
}

/** Load each distinct card image once. Failures fall back to the generated face. */
export async function preloadCardArt(cards: CardData[], renderer: WebGLRenderer) {
  const urls = [...new Set([BACK_URL, ...cards.flatMap((c) => (c.image ? [c.image] : []))])]
  await Promise.all(
    urls.map(async (url) => {
      try {
        const tex = await loadTexture(url, true, renderer)
        tex.userData.shared = true
        cache.set(url, tex)
      } catch (e) {
        console.warn('Card image failed', url, e)
      }
    }),
  )
}

export function cardArt(data: CardData): Texture | undefined {
  return data.image ? cache.get(data.image) : undefined
}

export function disposeCardArt() {
  for (const tex of cache.values()) tex.dispose()
  cache.clear()
}
