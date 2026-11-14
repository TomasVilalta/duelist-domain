import GUI from 'lil-gui'
import { QUALITY, type QualityName } from '@/config'
import { ZONES } from '@/scene/ZoneLayout'
import { dumpGame, useGameStore, type GameDump } from '@/state/gameStore'
import type { App } from './App'

export function setupDebug(app: App): () => void {
  const gui = new GUI({ title: 'Debug' })
  const state = {
    quality: app.quality as QualityName,
    pauseParticles: false,
    view: 'player',
    zone: ZONES[0].key,
    zoneGlow: 0,
    allGlow: 0,
    drawCalls: 0,
    triangles: 0,
  }

  gui.add(state, 'quality', Object.keys(QUALITY)).onChange((v: QualityName) => {
    app.renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[v].pixelRatio))
    app.renderer.setSize(window.innerWidth, window.innerHeight, false)
    app.fx.setSize(window.innerWidth, window.innerHeight)
    app.loop.invalidate()
  }).name('pixel ratio preset')
  gui.add(state, 'pauseParticles').onChange((v: boolean) => {
    app.particles.enabled = !v
    app.loop.invalidate()
  })
  gui.add(state, 'view', ['player', 'top', 'opponent']).onChange((v: 'player' | 'top' | 'opponent') => app.rig.setView(v))

  const light = gui.addFolder('Lights / FX')
  light.add(app.lights.key, 'intensity', 0, 6).name('key').onChange(app.loop.invalidate)
  light.add(app.lights.rim, 'intensity', 0, 4).name('rim').onChange(app.loop.invalidate)
  light.add(app.scene, 'environmentIntensity', 0, 2).onChange(app.loop.invalidate)
  light.add(app.fx.bloom, 'intensity', 0, 4).name('bloom').onChange(app.loop.invalidate)

  const zones = gui.addFolder('Zones')
  zones.add(state, 'zone', ZONES.map((z) => z.key))
  zones.add(state, 'zoneGlow', 0, 1).onChange((v: number) => app.zones.setHighlight(state.zone, v))
  zones.add(state, 'allGlow', 0, 1).onChange((v: number) => app.zones.setAllHighlights(v))

  const info = gui.addFolder('Renderer')
  info.add(state, 'drawCalls').listen().disable()
  info.add(state, 'triangles').listen().disable()
  const timer = window.setInterval(() => {
    state.drawCalls = app.renderer.info.render.calls
    state.triangles = app.renderer.info.render.triangles
  }, 500)

  // `copy(__game())` dumps the game state and action log as JSON. `__loadGame(json)` replaces the board with a dump.
  const w = window as unknown as { __game?: () => string; __loadGame?: (json: string) => void }
  w.__game = () => dumpGame(useGameStore.getState())
  w.__loadGame = (json) => app.loadDump(JSON.parse(json) as GameDump)

  return () => {
    delete w.__game
    delete w.__loadGame
    clearInterval(timer)
    gui.destroy()
  }
}
