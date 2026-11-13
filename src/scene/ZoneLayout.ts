// Pure data: no three.js imports, reusable by game state and interaction code.

export type Owner = 'p1' | 'p2'
export type ZoneType = 'monster' | 'spell' | 'field' | 'gy' | 'deck' | 'extra' | 'banished' | 'emz'

export interface ZoneId {
  owner: Owner | 'shared'
  type: ZoneType
  index: number
}

export interface ZoneTransform {
  id: ZoneId
  key: string
  x: number
  z: number
  /** Rotation around Y in radians (PI for player 2). */
  rotY: number
  w: number
  h: number
  pile: boolean
}

export const ZONE_W = 1.2
export const ZONE_H = 1.7
const PITCH = 1.5
const MONSTER_Z = 1.95
const SPELL_Z = 3.75
const SIDE_X = 4.4

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
  return poses.find((p) => p.faceUp === faceUp && p.defense === defense) ?? poses.find((p) => p.faceUp === faceUp) ?? poses[0]
}

/** GY, banished, extra deck, and your deck open the pile viewer. */
export function isViewPile(key: string): boolean {
  return key.includes(':gy:') || key.includes(':banished:') || key.includes(':extra:') || key === 'p1:deck:0'
}

export function zoneKey(id: ZoneId): string {
  return `${id.owner}:${id.type}:${id.index}`
}

function make(id: ZoneId, x: number, z: number, rotY: number, pile: boolean): ZoneTransform {
  return { id, key: zoneKey(id), x, z, rotY, w: ZONE_W, h: ZONE_H, pile }
}

function sideZones(owner: Owner): ZoneTransform[] {
  const s = owner === 'p1' ? 1 : -1
  const rot = owner === 'p1' ? 0 : Math.PI
  const at = (type: ZoneType, index: number, x: number, z: number, pile: boolean) =>
    make({ owner, type, index }, x * s, z * s, rot, pile)
  const out: ZoneTransform[] = []
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * PITCH
    out.push(at('monster', i, x, MONSTER_Z, false))
    out.push(at('spell', i, x, SPELL_Z, false))
  }
  out.push(at('field', 0, -SIDE_X, MONSTER_Z, false))
  out.push(at('extra', 0, -SIDE_X, SPELL_Z, true))
  out.push(at('gy', 0, SIDE_X, MONSTER_Z, true))
  out.push(at('deck', 0, SIDE_X, SPELL_Z, true))
  out.push(at('banished', 0, SIDE_X + 1.5, MONSTER_Z, true))
  return out
}

export const ZONES: ZoneTransform[] = [
  ...sideZones('p1'),
  ...sideZones('p2'),
  make({ owner: 'shared', type: 'emz', index: 0 }, -PITCH, 0, 0, false),
  make({ owner: 'shared', type: 'emz', index: 1 }, PITCH, 0, 0, false),
]

const BY_KEY = new Map(ZONES.map((z) => [z.key, z]))

export function getZoneTransform(id: ZoneId): ZoneTransform {
  const z = BY_KEY.get(zoneKey(id))
  if (!z) throw new Error(`Unknown zone ${zoneKey(id)}`)
  return z
}

/** Zone containing a world-space XZ point, if any. */
export function zoneAt(x: number, z: number): ZoneTransform | undefined {
  for (const zn of ZONES) {
    const dx = x - zn.x
    const dz = z - zn.z
    const c = Math.cos(zn.rotY)
    const s = Math.sin(zn.rotY)
    const lx = dx * c - dz * s
    const lz = dx * s + dz * c
    if (Math.abs(lx) <= zn.w / 2 && Math.abs(lz) <= zn.h / 2) return zn
  }
  return undefined
}

export function getZoneByKey(key: string): ZoneTransform | undefined {
  return BY_KEY.get(key)
}
