// ── Menüpunkt „Drucker" (IT Support) ─────────────────────────────────────────
// Reiter: Übersicht (alle Drucker + Warnungen) · Toner-Lager · Charts · Drucker verbinden.
// Beim Öffnen wird KEIN Drucker abgefragt — gezeigt wird der gespeicherte Stand des letzten
// (gedrosselten, nächtlichen) Scans, siehe services/druckerFlotte.ts.

import { useCallback, useEffect, useState } from 'react'
import { Printer, ListChecks, Package, BarChart3, Link2 } from 'lucide-react'
import { ladeDruckerListe, ladeFlotte, ladeLager, type DruckerZiel, type FlottenStand, type Lager } from '../services/druckerFlotte'
import DruckerListe from '../components/drucker/DruckerListe'
import TonerLager from '../components/drucker/TonerLager'
import DruckerCharts from '../components/drucker/DruckerCharts'
import DruckerVerbinden from '../components/drucker/DruckerVerbinden'

type Reiter = 'uebersicht' | 'lager' | 'charts' | 'verbinden'
const REITER: { id: Reiter; label: string; icon: JSX.Element }[] = [
  { id: 'uebersicht', label: 'Übersicht', icon: <ListChecks size={14} /> },
  { id: 'lager', label: 'Toner-Lager', icon: <Package size={14} /> },
  { id: 'charts', label: 'Charts', icon: <BarChart3 size={14} /> },
  { id: 'verbinden', label: 'Drucker verbinden', icon: <Link2 size={14} /> },
]

export interface DruckerDaten {
  drucker: DruckerZiel[]
  flotte: FlottenStand
  lager: Lager | null          // null = Lagerdatei nicht lesbar
}

export default function Drucker() {
  const [reiter, setReiter] = useState<Reiter>('uebersicht')
  const [daten, setDaten] = useState<DruckerDaten | null>(null)
  const [bestellenFuer, setBestellenFuer] = useState<string | null>(null)

  const laden = useCallback(async () => {
    const [drucker, flotte, lager] = await Promise.all([ladeDruckerListe(), ladeFlotte(), ladeLager()])
    setDaten({ drucker, flotte, lager })
  }, [])
  useEffect(() => { void laden() }, [laden])

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-4">
      <div className="flex items-center gap-3">
        <Printer size={28} className="text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Drucker</h1>
          <p className="text-sm text-muted-foreground">Alle Drucker mit Warnungen, Toner-Lager, Nutzung und Verbinden — schonend fürs Netz (automatische Prüfung nur vor 07:00 / ab 16:00)</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {REITER.map(r => (
          <button key={r.id} onClick={() => setReiter(r.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px ${reiter === r.id ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {r.icon}{r.label}
          </button>
        ))}
      </div>

      {reiter === 'uebersicht' && <DruckerListe daten={daten} neuLaden={laden} onBestellen={m => { setBestellenFuer(m); setReiter('lager') }} />}
      {reiter === 'lager' && <TonerLager daten={daten} neuLaden={laden} bestellenFuer={bestellenFuer} onBestellenErledigt={() => setBestellenFuer(null)} />}
      {reiter === 'charts' && <DruckerCharts daten={daten} />}
      {reiter === 'verbinden' && <DruckerVerbinden daten={daten} />}
    </div>
  )
}
