import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'
import type { CardData, CardKind } from '@/data/demoDeck'

const W = 320
const H = 467

const PALETTE: Record<CardKind, { frame: string; art: [string, string]; name: string }> = {
  monster: { frame: '#c98a2e', art: ['#5a3a1c', '#d99a45'], name: '#f3d9a4' },
  spell: { frame: '#1f9a8a', art: ['#0f3d44', '#44d1c0'], name: '#bff3ea' },
  trap: { frame: '#a2318f', art: ['#3b1236', '#c867b8'], name: '#f0c4e8' },
}

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  return [c, c.getContext('2d')!]
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function toTexture(c: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

export function makeFaceTexture(card: CardData): Texture {
  const [c, ctx] = makeCanvas()
  const p = PALETTE[card.kind]

  ctx.fillStyle = '#16120d'
  ctx.fillRect(0, 0, W, H)
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, p.frame)
  bg.addColorStop(1, '#2a1c0e')
  ctx.fillStyle = bg
  roundRect(ctx, 6, 6, W - 12, H - 12, 18)
  ctx.fill()

  // name plate
  ctx.fillStyle = 'rgba(10,8,5,0.8)'
  roundRect(ctx, 20, 20, W - 40, 44, 8)
  ctx.fill()
  ctx.fillStyle = p.name
  ctx.font = 'bold 26px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(card.name, 30, 43, W - 60)

  // art box
  const ax = 28
  const ay = 100
  const aw = W - 56
  const ah = 220
  const g = ctx.createLinearGradient(ax, ay, ax + aw, ay + ah)
  g.addColorStop(0, p.art[0])
  g.addColorStop(1, p.art[1])
  ctx.fillStyle = g
  ctx.fillRect(ax, ay, aw, ah)
  ctx.strokeStyle = '#e8d8a8'
  ctx.lineWidth = 3
  ctx.strokeRect(ax, ay, aw, ah)
  // simple emblem
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.beginPath()
  ctx.arc(ax + aw / 2, ay + ah / 2, 62, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = 'bold 84px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(card.name[0], ax + aw / 2, ay + ah / 2 + 4)
  ctx.textAlign = 'left'

  // level stars
  if (card.level) {
    ctx.fillStyle = '#ffd24a'
    ctx.font = '22px system-ui, sans-serif'
    ctx.fillText(`★ ${card.level}`, 28, 80)
  } else {
    ctx.fillStyle = p.name
    ctx.font = 'italic 20px system-ui, sans-serif'
    ctx.fillText(card.kind === 'spell' ? '[ Spell Card ]' : '[ Trap Card ]', 28, 80)
  }

  // text box + stats
  ctx.fillStyle = 'rgba(240,230,200,0.9)'
  roundRect(ctx, 20, 336, W - 40, 100, 8)
  ctx.fill()
  ctx.fillStyle = '#2a1c0e'
  ctx.font = '16px system-ui, sans-serif'
  if (card.atk !== undefined) {
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.fillText(`ATK/${card.atk}`, 34, 376)
    ctx.fillText(`DEF/${card.def}`, 34, 410)
  } else {
    ctx.fillText('Placeholder effect text.', 34, 376)
  }

  return toTexture(c)
}

export function makeBadgeTexture(n: number): Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#e8b830'
  ctx.beginPath()
  ctx.arc(64, 64, 58, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 8
  ctx.strokeStyle = '#3a2a08'
  ctx.stroke()
  ctx.fillStyle = '#2a1c08'
  ctx.font = 'bold 76px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(n), 64, 68)
  return toTexture(c)
}

/** "ATK / DEF" strip shown under a monster. */
export function makeStatsTexture(atk: number, def: number): Texture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 96
  const ctx = c.getContext('2d')!
  const text = `${atk} / ${def}`
  ctx.font = 'bold 84px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 16
  ctx.strokeStyle = 'rgba(10, 8, 4, 0.95)'
  ctx.strokeText(text, 256, 50)
  ctx.fillStyle = '#f6efe0'
  ctx.fillText(text, 256, 50)
  return toTexture(c)
}

const levelCache = new Map<number, Texture>()

/** Star icon and level number. One shared texture per level; never dispose it. */
export function makeLevelTexture(level: number): Texture {
  const cached = levelCache.get(level)
  if (cached) return cached
  const tex = drawLevelTexture(level)
  tex.userData.shared = true
  levelCache.set(level, tex)
  return tex
}

function drawLevelTexture(level: number): Texture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const ctx = c.getContext('2d')!
  const tex = toTexture(c)
  const paint = () => {
    ctx.clearRect(0, 0, 256, 128)
    if (starImg.complete && starImg.naturalWidth) ctx.drawImage(starImg, 8, 8, 112, 112)
    const text = String(level)
    ctx.font = 'bold 96px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 16
    ctx.strokeStyle = 'rgba(10, 8, 4, 0.95)'
    ctx.strokeText(text, 132, 68)
    ctx.fillStyle = '#f6efe0'
    ctx.fillText(text, 132, 68)
    tex.needsUpdate = true
  }
  paint()
  if (!starImg.complete) starImg.addEventListener('load', paint, { once: true })
  return tex
}

const starImg = new Image()
starImg.src = `${import.meta.env.BASE_URL}level-star.png`

export function makeSleeveTexture(): Texture {
  const [c, ctx] = makeCanvas()
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#142a55')
  g.addColorStop(1, '#0a1230')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = '#d6b25a'
  ctx.lineWidth = 6
  roundRect(ctx, 14, 14, W - 28, H - 28, 16)
  ctx.stroke()
  ctx.lineWidth = 2
  roundRect(ctx, 26, 26, W - 52, H - 52, 10)
  ctx.stroke()

  // diamond emblem
  ctx.save()
  ctx.translate(W / 2, H / 2)
  ctx.strokeStyle = '#e6c870'
  ctx.lineWidth = 4
  for (const r of [110, 80, 50]) {
    ctx.beginPath()
    ctx.moveTo(0, -r * 1.35)
    ctx.lineTo(r, 0)
    ctx.lineTo(0, r * 1.35)
    ctx.lineTo(-r, 0)
    ctx.closePath()
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(80,170,255,0.85)'
  ctx.beginPath()
  ctx.arc(0, 0, 18, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  return toTexture(c)
}
