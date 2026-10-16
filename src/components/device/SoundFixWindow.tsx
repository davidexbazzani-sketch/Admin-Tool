// ── Standalone-Fenster für „Sound Fix“ (#soundfix?host=…) ────────────────────
// Klon des Task-Manager-Fensters: wird von App.tsx gerendert, wenn das eigene
// Fenster geladen ist. Kein Auth/Sidebar — nur die drei Sound-Schritte, damit im
// Hauptfenster weitergearbeitet werden kann, während die Treibersuche läuft.

import { Volume2, X } from 'lucide-react'
import { api } from '../../electronAPI'
import { SoundFixPanel } from './SoundFixPanel'

export default function SoundFixWindow() {
  const params = new URLSearchParams(window.location.search)
  const host = (params.get('host') || '').trim()

  if (!host) {
    return <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground text-sm">Kein Ziel-Computer angegeben.</div>
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card">
        <Volume2 size={16} className="text-emerald-400" />
        <h1 className="text-sm font-bold text-foreground">Sound Fix · <span className="font-mono">{host}</span></h1>
        <span className="text-[11px] text-muted-foreground">Fenster offen lassen, solange ein Schritt läuft</span>
        <button onClick={() => api().soundfixClose(host)} title="Schließen" className="ml-auto p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><X size={16} /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <SoundFixPanel hostname={host} inWindow />
      </div>
    </div>
  )
}
