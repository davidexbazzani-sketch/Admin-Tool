import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { ipcRenderer } from './utils/ipc'

// Electron/Windows: Nach alert/confirm/prompt nehmen Eingabefelder keinen Fokus mehr an
// (Knöpfe gehen, in Textfelder kann man nicht klicken). Danach das Fenster neu anwählen lassen.
for (const name of ['alert', 'confirm', 'prompt'] as const) {
  const original = window[name].bind(window) as (...a: unknown[]) => unknown
  ;(window as unknown as Record<string, unknown>)[name] = (...a: unknown[]) => {
    try { return original(...a) } finally { ipcRenderer('window:refocus') }
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
