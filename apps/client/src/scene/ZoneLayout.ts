// Pure data: no three.js imports, reusable by game state and interaction code.

import { zoneKey as stateZoneKey, type Seat, type ZoneType } from '@duelist/shared'

export { legalOrientation, zonePoses, type CardPose, type ZoneType } from '@duelist/shared'

export interface ZoneId {
  owner: Seat | 'shared'
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

/** GY, banished, extra deck, and your deck open the pile viewer. */
export function isViewPile(key: string, localSeat: Seat = 0): boolean {
  return key.includes(':gy:') || key.includes(':banished:') || key.includes(':extra:') || key === deckKey(localSeat)
}

export function zoneKey(id: ZoneId): string {
  return stateZoneKey(id)
}

function make(id: ZoneId, x: number, z: number, rotY: number, pile: boolean): ZoneTransform {
  return { id, key: zoneKey(id), x, z, rotY, w: ZONE_W, h: ZONE_H, pile }
}

/** Seat sitting on the near side of the board (bottom of the screen). Hotseat: the local seat is always 0. */
export const NEAR_SEAT: Seat = 0
export const FAR_SEAT: Seat = 1

/** Zone key of a seat's own deck. */
export function deckKey(seat: Seat): string {
  return stateZoneKey({ owner: seat, type: 'deck', index: 0 })
}

function sideZones(owner: Seat, near: boolean): ZoneTransform[] {
  const s = near ? 1 : -1
  const rot = near ? 0 : Math.PI
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
  ...sideZones(NEAR_SEAT, true),
  ...sideZones(FAR_SEAT, false),
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
