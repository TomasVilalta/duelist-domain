import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import EditorPage from '@/editor/EditorPage.tsx'

const path = window.location.pathname.replace(/\/$/, '')
const editor = path === '/editor' || path.endsWith('/editor')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {editor ? <EditorPage /> : <App />}
  </StrictMode>,
)
