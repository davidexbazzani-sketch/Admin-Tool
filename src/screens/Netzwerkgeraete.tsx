// ── Menüpunkt „Netzwerkgeräte" (früher „USV") ───────────────────────────────────
// Sammelt Geräte im Netz, die keine PCs sind — je Gerät ein Reiter. Neues Gerät:
// Eintrag in GERAETE + eigene Komponente unter components/netzwerkgeraete/.
// Die Screen-Kennung bleibt 'usv', damit gespeicherte Favoriten/Ausblendungen gelten.

import { lazy, Suspense, useState, type ReactNode } from 'react'
import { BatteryCharging, Network, Phone } from 'lucide-react'

const USV = lazy(() => import('./USV'))
const Telefonanlage = lazy(() => import('../components/netzwerkgeraete/Telefonanlage'))

type GeraetId = 'usv' | 'telefonanlage'
const GERAETE: { id: GeraetId; name: string; info: string; icon: ReactNode }[] = [
  { id: 'usv', name: 'USV', info: '2× APC Smart-UPS', icon: <BatteryCharging size={16} className="text-emerald-400" /> },
  { id: 'telefonanlage', name: 'Telefonanlage', info: 'Notruftelefone · Keller', icon: <Phone size={16} className="text-red-400" /> },
]

const MERK_KEY = 'netzwerkgeraete.reiter'

export default function Netzwerkgeraete() {
  const [aktiv, setAktiv] = useState<GeraetId>(() => {
    try { const v = localStorage.getItem(MERK_KEY); if (v === 'usv' || v === 'telefonanlage') return v } catch { /* egal */ }
    return 'usv'
  })
  function waehle(id: GeraetId) {
    setAktiv(id)
    try { localStorage.setItem(MERK_KEY, id) } catch { /* egal */ }
  }

  const laden = <div className="flex items-center justify-center h-full text-muted-foreground">Laden...</div>

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="shrink-0 px-6 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Network size={20} className="text-blue-400" />
          <h1 className="text-lg font-semibold text-foreground">Netzwerkgeräte</h1>
          <span className="text-xs text-muted-foreground">Geräte im Netz, die keine PCs sind — mit Zugang und Anleitung.</span>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {GERAETE.map(g => (
            <button key={g.id} onClick={() => waehle(g.id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${aktiv === g.id ? 'border-primary/60 bg-primary/10' : 'border-border hover:bg-accent'}`}>
              {g.icon}
              <span>
                <span className="block text-sm font-semibold text-foreground leading-tight">{g.name}</span>
                <span className="block text-[11px] text-muted-foreground leading-tight">{g.info}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Suspense fallback={laden}>
          {aktiv === 'usv' ? <USV /> : (
            <div className="h-full overflow-auto px-6 py-4"><Telefonanlage /></div>
          )}
        </Suspense>
      </div>
    </div>
  )
}
