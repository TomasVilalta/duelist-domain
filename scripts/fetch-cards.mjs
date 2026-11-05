// One-shot pull from the YGOPRODeck API. Images are saved locally so the
// client does not hotlink them (the API guide asks for that).
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'cards')

const NAMES = [
  'Blue-Eyes White Dragon',
  'Dark Magician',
  'Red-Eyes Black Dragon',
  'Summoned Skull',
  'Dark Magician Girl',
  'Celtic Guardian',
  'Gaia The Fierce Knight',
  'Kuriboh',
  'Mystical Elf',
  'La Jinn the Mystical Genie of the Lamp',
  'Monster Reborn',
  'Dark Hole',
  'Raigeki',
  'Pot of Greed',
  'Swords of Revealing Light',
  'Change of Heart',
  'Mirror Force',
  'Trap Hole',
  'Solemn Judgment',
  'Magic Cylinder',
]

const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(NAMES.join('|'))}`
const res = await fetch(url)
const json = await res.json()
if (!res.ok) throw new Error(json.error || `cardinfo ${res.status}`)

await mkdir(root, { recursive: true })

const catalog = []
for (const card of json.data) {
  const image = card.card_images[0].image_url
  const file = `${card.id}.jpg`
  const dest = join(root, file)
  let have = true
  try {
    await access(dest)
  } catch {
    have = false
  }
  if (!have) {
    const img = await fetch(image)
    if (!img.ok) throw new Error(`image ${card.name} ${img.status}`)
    await writeFile(dest, Buffer.from(await img.arrayBuffer()))
  }
  const kind = card.type.includes('Trap') ? 'trap' : card.type.includes('Spell') ? 'spell' : 'monster'
  catalog.push({
    passcode: card.id,
    name: card.name,
    kind,
    atk: card.atk,
    def: card.def,
    level: card.level,
    desc: card.desc,
    type: card.type,
    race: card.race,
    attribute: card.attribute,
    archetype: card.archetype,
    file,
  })
  console.log(card.name)
}

await writeFile(join(root, 'catalog.json'), JSON.stringify(catalog, null, 2))
console.log(`saved ${catalog.length} cards`)
