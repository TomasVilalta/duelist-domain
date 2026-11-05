export type QualityName = 'low' | 'medium' | 'high'

export interface QualityPreset {
  pixelRatio: number
  shadowMapSize: number
  bloom: boolean
  msaa: number
  grassCount: number
  particleCount: number
}

export const QUALITY: Record<QualityName, QualityPreset> = {
  low: { pixelRatio: 1, shadowMapSize: 1024, bloom: false, msaa: 0, grassCount: 150, particleCount: 80 },
  medium: { pixelRatio: 1.5, shadowMapSize: 2048, bloom: true, msaa: 2, grassCount: 1200, particleCount: 200 },
  high: { pixelRatio: 2, shadowMapSize: 2048, bloom: true, msaa: 4, grassCount: 2500, particleCount: 350 },
}

/** 1 unit = 1 card width. */
export const CARD_W = 1
export const CARD_H = 1.46

export const BOARD = {
  slabW: 16,
  slabD: 13,
  slabH: 0.3,
}

export function detectQuality(): QualityName {
  const dpr = window.devicePixelRatio || 1
  const px = window.innerWidth * window.innerHeight * dpr * dpr
  if (px > 3840 * 2160) return 'medium'
  return 'high'
}
