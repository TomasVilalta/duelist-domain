import { useEffect, useRef, useState } from 'react'
import { Editor, MODEL_LIST, type EditorHooks } from './Editor'
import type { ModelKey } from '@/scene/layout'
import './editor.css'

type Mode = 'translate' | 'rotate' | 'scale'

/** Layout editor, mounted at /editor. */
export default function EditorPage() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const editor = useRef<Editor | null>(null)
  const [status, setStatus] = useState('Loading…')
  const [selected, setSelected] = useState<ModelKey | null>(null)
  const [placing, setPlacing] = useState<ModelKey | null>(null)
  const [mode, setMode] = useState<Mode>('translate')
  const [snap, setSnap] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    const hooks: EditorHooks = {
      onStatus: setStatus,
      onSelection: setSelected,
      onPlacing: setPlacing,
      onMode: setMode,
    }
    const ed = new Editor(canvas.current!, hooks)
    editor.current = ed
    void ed.start()
    return () => ed.dispose()
  }, [])

  const choose = (next: Mode) => {
    setMode(next)
    editor.current?.setMode(next)
  }

  const shown = MODEL_LIST.filter((m) => m.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="editor">
      <canvas ref={canvas} />
      <aside>
        <header>
          <a href="/">← Game</a>
          <h1>Layout</h1>
        </header>
        <div className="row">
          <button type="button" onClick={() => void editor.current?.save()}>Save</button>
          <button type="button" onClick={() => editor.current?.download()}>Download</button>
        </div>
        <p className="status">{status}</p>
        <div className="modes">
          {(['translate', 'rotate', 'scale'] as Mode[]).map((m) => (
            <button key={m} type="button" className={mode === m ? 'is-on' : ''} onClick={() => choose(m)}>
              {m === 'translate' ? 'Move' : m === 'rotate' ? 'Rotate' : 'Scale'}
            </button>
          ))}
        </div>
        <label className="snap">
          <input
            type="checkbox"
            checked={snap}
            onChange={(e) => {
              setSnap(e.target.checked)
              editor.current?.setSnap(e.target.checked)
            }}
          />
          Snap (0.5 m · 15° · 0.1)
        </label>
        <p className="keys">W move · E rotate · R scale · Ctrl+D duplicate · Del delete · Ctrl+S save</p>
        {selected && (
          <div className="selection">
            <strong>{selected}</strong>
            <div className="row">
              <button type="button" onClick={() => editor.current?.duplicate()}>Duplicate</button>
              <button type="button" className="danger" onClick={() => editor.current?.remove()}>Delete</button>
            </div>
          </div>
        )}
        <input
          className="filter"
          placeholder="Place a model…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <ul>
          {shown.map((m) => (
            <li key={m}>
              <button type="button" className={placing === m ? 'is-on' : ''} onClick={() => editor.current?.arm(m)}>
                {m}
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
