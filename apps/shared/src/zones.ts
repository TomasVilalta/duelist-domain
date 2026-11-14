import type { ZoneType } from './state'

export interface CardPose {
  faceUp: boolean
  defense: boolean
}

/** Legal poses in cycle order. Empty for zones that don't hold a placed card. */
export function zonePoses(type: ZoneType): CardPose[] {
  if (type === 'monster' || type === 'emz') {
    return [
      { faceUp: true, defense: false },
      { faceUp: true, defense: true },
      { faceUp: false, defense: true },
    ]
  }
  if (type === 'spell' || type === 'field' || type === 'banished' || type === 'extra') {
    return [
      { faceUp: true, defense: false },
      { faceUp: false, defense: false },
    ]
  }
  if (type === 'gy') return [{ faceUp: true, defense: false }]
  return []
}

/** Snap a pose to one this zone allows, keeping face-up or face-down when that is legal. */
export function legalOrientation(type: ZoneType, faceUp: boolean, defense: boolean): CardPose {
  const poses = zonePoses(type)
  if (poses.length === 0) return { faceUp, defense }
  return poses.find((p) => p.faceUp === faceUp && p.defense === defense) ?? poses.find((p) => p.faceUp === faceUp) ?? poses[0]!
}
