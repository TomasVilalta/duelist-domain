import BoardCanvas from '@/three/BoardCanvas'
import './App.css'

export default function App() {
  return (
    <div className="app">
      <BoardCanvas />
      <div id="ui" className="ui-overlay">
        <div className="hint">Drag cards · R cycles position over a zone · right-click for actions · click GY, banished or extra to view · Ctrl+Z undo</div>
      </div>
    </div>
  )
}
