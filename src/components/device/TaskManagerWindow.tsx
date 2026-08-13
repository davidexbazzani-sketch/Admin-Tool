// ── Standalone-Fenster für den Remote-Task-Manager (#taskmgr?host=…) ──────────
// Wird von App.tsx gerendert, wenn das eigenständige Fenster geladen ist. Kein
// Auth/Sidebar — nur der Task-Manager des Ziel-PCs, vollflächig.

import { Cpu, X } from 'lucide-react'
import { api } from '../../electronAPI'
import { DeviceTaskManager } from './DeviceTaskManager'

export default function TaskManagerWindow() {
  const params = new URLSearchParams(window.location.search)
  const host = (params.get('host') || '').trim()
  // Reale Admin-Rolle aus der Query (vom Öffner durchgereicht) — NICHT hardcoden,
  // sonst umgeht ein Nicht-Admin das UI-Gate für Beenden/Neustart.
  const isAdmin = params.get('admin') === '1'

  if (!host) {
    return <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground text-sm">Kein Ziel-Computer angegeben.</div>
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card">
        <Cpu size={16} className="text-blue-400" />
        <h1 className="text-sm font-bold text-foreground">Task-Manager · <span className="font-mono">{host}</span></h1>
        <button onClick={() => api().taskmgrClose(host)} title="Schließen" className="ml-auto p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><X size={16} /></button>
      </div>
      <div className="flex-1 min-h-0">
        <DeviceTaskManager hostname={host} isAdmin={isAdmin} inWindow />
      </div>
    </div>
  )
}
