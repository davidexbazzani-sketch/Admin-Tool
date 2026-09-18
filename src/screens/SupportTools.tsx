// ── Support Tools (IT Support) ────────────────────────────────────────────────
// Sammel-Menüpunkt für Support-Werkzeuge. Erste Kachel: „Deinstallation" –
// entfernt ein Programm auf einem Remote-PC vollständig (inkl. Registry-Reste),
// nach vorheriger Vorschau aller betroffenen Objekte.

import { useState } from 'react'
import { LifeBuoy, Trash2, ChevronRight } from 'lucide-react'
import Deinstallation from '../components/supportTools/Deinstallation'

export default function SupportTools() {
  const [view, setView] = useState<'hub' | 'uninstall'>('hub')
  if (view === 'uninstall') return <Deinstallation onBack={() => setView('hub')} />

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <LifeBuoy size={22} className="text-primary" />
        <div>
          <h1 className="text-lg font-bold text-foreground">Support Tools</h1>
          <p className="text-xs text-muted-foreground">Werkzeuge für den IT-Support · weitere Kacheln folgen</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          <button onClick={() => setView('uninstall')}
            className="text-left rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:bg-accent/20 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-red-500/15 flex items-center justify-center mb-3"><Trash2 size={20} className="text-red-400" /></div>
            <h3 className="font-semibold text-foreground">Deinstallation</h3>
            <p className="text-xs text-muted-foreground mt-1">Programm auf einem PC komplett entfernen – inkl. aller Reste in Ordnern und Registry. Vorher werden alle betroffenen Objekte angezeigt.</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary font-medium">Öffnen <ChevronRight size={13} /></span>
          </button>
          <div className="rounded-xl border border-dashed border-border/70 bg-card/40 p-5 flex items-center justify-center text-center">
            <p className="text-xs text-muted-foreground/70">Weitere Support-Werkzeuge folgen …</p>
          </div>
        </div>
      </div>
    </div>
  )
}
