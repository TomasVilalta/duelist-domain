/**
 * Model names for the files in public/Ashen_Ruins, and the shape of public/layout.json.
 * The layout itself lives in that JSON file and is edited at /editor.
 *
 * Coordinates are world units (a card is 1 wide). The board slab spans
 * x -8..8 and z -6.5..6.5. y = 0 is the top of the slab; props stand on the
 * ground, which is 0.3 below it. The player sits at +z.
 *
 *   x    left (-) / right (+) as seen from the player's side
 *   z    toward the opponent (-) / toward the player (+)
 *   rot  degrees around the vertical axis. 0 faces +z (toward the player)
 *   s    uniform scale, default 1
 *   y    height offset above the ground, default 0
 */

/**
 * Short name to file, relative to public/. Ruins are .glb files; the nature
 * pack is .gltf plus a .bin and loose textures.
 */
export const MODELS = {
  floor: 'Ashen_Ruins/AS_01_Floor_Intact.glb',
  floorCracked: 'Ashen_Ruins/AS_02_Floor_Cracked.glb',
  floorBroken: 'Ashen_Ruins/AS_03_Floor_Broken.glb',
  stairs: 'Ashen_Ruins/AS_04_Stairs_Wide.glb',
  step: 'Ashen_Ruins/AS_05_Step_Single.glb',
  wall: 'Ashen_Ruins/AS_06_Wall_Solid.glb',
  wallBroken: 'Ashen_Ruins/AS_07_Wall_Broken.glb',
  wallWindow: 'Ashen_Ruins/AS_08_Wall_Window.glb',
  pillar: 'Ashen_Ruins/AS_09_Pillar_Intact.glb',
  pillarBroken: 'Ashen_Ruins/AS_10_Pillar_Broken.glb',
  pillarObsidian: 'Ashen_Ruins/AS_11_Pillar_Obsidian.glb',
  arch: 'Ashen_Ruins/AS_12_Archway.glb',
  gate: 'Ashen_Ruins/AS_13_Gate_Ember.glb',
  altar: 'Ashen_Ruins/AS_14_Altar.glb',
  brazierTall: 'Ashen_Ruins/AS_15_Brazier_Tall.glb',
  brazierLow: 'Ashen_Ruins/AS_16_Brazier_Low.glb',
  statue: 'Ashen_Ruins/AS_17_Statue_Sentinel.glb',
  banner: 'Ashen_Ruins/AS_18_Banner_Torn.glb',
  bowl: 'Ashen_Ruins/AS_19_Offering_Bowl.glb',
  obsidian: 'Ashen_Ruins/AS_20_Obsidian_Cluster.glb',
  rubble: 'Ashen_Ruins/AS_21_Rubble_Pile.glb',
  plinth: 'Ashen_Ruins/AS_22_Plinth.glb',
  urn: 'Ashen_Ruins/AS_23_Urn.glb',
  runestone: 'Ashen_Ruins/AS_24_Runestone.glb',
  lantern: 'Ashen_Ruins/AS_25_Lantern_Ember.glb',
  censer: 'Ashen_Ruins/AS_26_Incense_Censer.glb',
  gong: 'Ashen_Ruins/AS_27_Ritual_Gong.glb',
  bench: 'Ashen_Ruins/AS_28_Stone_Bench.glb',
  chest: 'Ashen_Ruins/AS_29_Reliquary_Chest.glb',
  chains: 'Ashen_Ruins/AS_30_Chain_Barrier.glb',

  commonTree1: 'gltf/CommonTree/CommonTree_1.gltf',
  commonTree2: 'gltf/CommonTree/CommonTree_2.gltf',
  commonTree3: 'gltf/CommonTree/CommonTree_3.gltf',
  commonTree4: 'gltf/CommonTree/CommonTree_4.gltf',
  commonTree5: 'gltf/CommonTree/CommonTree_5.gltf',
  pine1: 'gltf/Pine/Pine_1.gltf',
  pine2: 'gltf/Pine/Pine_2.gltf',
  pine3: 'gltf/Pine/Pine_3.gltf',
  pine4: 'gltf/Pine/Pine_4.gltf',
  pine5: 'gltf/Pine/Pine_5.gltf',
  deadTree1: 'gltf/DeadTree/DeadTree_1.gltf',
  deadTree2: 'gltf/DeadTree/DeadTree_2.gltf',
  deadTree3: 'gltf/DeadTree/DeadTree_3.gltf',
  deadTree4: 'gltf/DeadTree/DeadTree_4.gltf',
  deadTree5: 'gltf/DeadTree/DeadTree_5.gltf',
  twistedTree1: 'gltf/TwistedTree/TwistedTree_1.gltf',
  twistedTree2: 'gltf/TwistedTree/TwistedTree_2.gltf',
  twistedTree3: 'gltf/TwistedTree/TwistedTree_3.gltf',
  twistedTree4: 'gltf/TwistedTree/TwistedTree_4.gltf',
  twistedTree5: 'gltf/TwistedTree/TwistedTree_5.gltf',
  bush: 'gltf/Bush/Bush_Common.gltf',
  bushFlowers: 'gltf/Bush/Bush_Common_Flowers.gltf',
  clover1: 'gltf/Clover/Clover_1.gltf',
  clover2: 'gltf/Clover/Clover_2.gltf',
  fern: 'gltf/Fern/Fern_1.gltf',
  flower3Group: 'gltf/Flower/Flower_3_Group.gltf',
  flower3Single: 'gltf/Flower/Flower_3_Single.gltf',
  flower4Group: 'gltf/Flower/Flower_4_Group.gltf',
  flower4Single: 'gltf/Flower/Flower_4_Single.gltf',
  grassCommonShort: 'gltf/Grass/Grass_Common_Short.gltf',
  grassCommonTall: 'gltf/Grass/Grass_Common_Tall.gltf',
  grassWispyShort: 'gltf/Grass/Grass_Wispy_Short.gltf',
  grassWispyTall: 'gltf/Grass/Grass_Wispy_Tall.gltf',
  mushroom: 'gltf/Mushroom/Mushroom_Common.gltf',
  mushroomShelf: 'gltf/Mushroom/Mushroom_Laetiporus.gltf',
  plant1: 'gltf/Plant/Plant_1.gltf',
  plant1Big: 'gltf/Plant/Plant_1_Big.gltf',
  plant7: 'gltf/Plant/Plant_7.gltf',
  plant7Big: 'gltf/Plant/Plant_7_Big.gltf',
  rock1: 'gltf/Rock/Rock_Medium_1.gltf',
  rock2: 'gltf/Rock/Rock_Medium_2.gltf',
  rock3: 'gltf/Rock/Rock_Medium_3.gltf',
  pebbleRound1: 'gltf/Pebble/Pebble_Round_1.gltf',
  pebbleRound2: 'gltf/Pebble/Pebble_Round_2.gltf',
  pebbleRound3: 'gltf/Pebble/Pebble_Round_3.gltf',
  pebbleRound4: 'gltf/Pebble/Pebble_Round_4.gltf',
  pebbleRound5: 'gltf/Pebble/Pebble_Round_5.gltf',
  pebbleSquare1: 'gltf/Pebble/Pebble_Square_1.gltf',
  pebbleSquare2: 'gltf/Pebble/Pebble_Square_2.gltf',
  pebbleSquare3: 'gltf/Pebble/Pebble_Square_3.gltf',
  pebbleSquare4: 'gltf/Pebble/Pebble_Square_4.gltf',
  pebbleSquare5: 'gltf/Pebble/Pebble_Square_5.gltf',
  pebbleSquare6: 'gltf/Pebble/Pebble_Square_6.gltf',
  petal1: 'gltf/Petal/Petal_1.gltf',
  petal2: 'gltf/Petal/Petal_2.gltf',
  petal3: 'gltf/Petal/Petal_3.gltf',
  petal4: 'gltf/Petal/Petal_4.gltf',
  petal5: 'gltf/Petal/Petal_5.gltf',
  pathRoundSmall1: 'gltf/RockPath/RockPath_Round_Small_1.gltf',
  pathRoundSmall2: 'gltf/RockPath/RockPath_Round_Small_2.gltf',
  pathRoundSmall3: 'gltf/RockPath/RockPath_Round_Small_3.gltf',
  pathRoundThin: 'gltf/RockPath/RockPath_Round_Thin.gltf',
  pathRoundWide: 'gltf/RockPath/RockPath_Round_Wide.gltf',
  pathSquareSmall1: 'gltf/RockPath/RockPath_Square_Small_1.gltf',
  pathSquareSmall2: 'gltf/RockPath/RockPath_Square_Small_2.gltf',
  pathSquareSmall3: 'gltf/RockPath/RockPath_Square_Small_3.gltf',
  pathSquareThin: 'gltf/RockPath/RockPath_Square_Thin.gltf',
  pathSquareWide: 'gltf/RockPath/RockPath_Square_Wide.gltf',
} as const

export type ModelKey = keyof typeof MODELS

export interface Prop {
  m: ModelKey
  x: number
  z: number
  rot?: number
  s?: number
  y?: number
}

const MODEL_KEYS = new Set<string>(Object.keys(MODELS))

function isProp(value: unknown): value is Prop {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.m === 'string' && MODEL_KEYS.has(v.m) && typeof v.x === 'number' && typeof v.z === 'number'
}

/** The scene layout. Missing or invalid entries are dropped. */
export async function loadLayout(): Promise<Prop[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}layout.json`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`layout.json: ${res.status}`)
  const data: unknown = await res.json()
  if (!Array.isArray(data)) throw new Error('layout.json must be an array')
  return data.filter(isProp)
}
