import { useEffect, useRef } from 'react'
import { App } from '@/core/App'

export default function BoardCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const app = new App(ref.current!)
    app.init().catch((e) => console.error('App init failed', e))
    return () => app.dispose()
  }, [])

  return <canvas ref={ref} className="board-canvas" />
}
