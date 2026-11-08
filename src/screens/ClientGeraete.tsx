// ── Standort → „Client Geräte“: die drei Lageplan-Bereiche als Kacheln ───────
// Ein Klick öffnet den Bereich genau so wie früher der eigene Menüpunkt
// (OT-Geräte, Halle & Zoll, Verwaltungsgebäude). Sichtbar sind nur die Bereiche,
// die der Benutzer sehen darf (gleiche Regeln wie in der Sidebar).

import { useEffect, useState } from 'react'
import { Factory, ClipboardCheck, Building, MonitorSmartphone, ChevronRight, Loader2 } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useMenuSichtbar } from '../store/menuSichtbarStore'
import { kinderVon } from '../utils/menuCatalog'
import type { Screen } from '../types'

const INFO: Partial<Record<Screen, { icon: React.ReactNode; text: string }>> = {
  'ot-devices': { icon: <Factory size={26} />, text: 'PCs und Geräte auf dem Hallenplan verorten — Hostname, Arbeitsplatz, Liste mit Aufleuchten im Plan.' },
  'pruffeld-zoll': { icon: <ClipboardCheck size={26} />, text: 'Geräte auf dem Lageplan „Halle 1–11, Gesamtübersicht“ verorten — eigene Liste.' },
  'verwaltungsgebaeude': { icon: <Building size={26} />, text: 'Geräte auf dem Grundriss „KG – Staffelgeschoss“ verorten — mit Raumnummer.' },
}

export default function ClientGeraete() {
  const setScreen = useAppStore(s => s.setScreen)
  const sichtbar = useMenuSichtbar(s => s.sichtbar)
  const [anzahl, setAnzahl] = useState<Record<string, number | null>>({})
  const bereiche = kinderVon('client-geraete').filter(k => !sichtbar || sichtbar[k.id] !== false)

  // Anzahl verorteter Geräte je Plan (nebenbei, blockiert nichts)
  useEffect(() => {
    let weg = false
    void import('../services/deviceMaps').then(async ({ DEVICE_MAPS }) => {
      for (const m of DEVICE_MAPS) {
        try { const l = await m.svc.listDevices(); if (!weg) setAnzahl(a => ({ ...a, [m.id]: l.filter(d => (d.hostname || '').trim()).length })) }
        catch { if (!weg) setAnzahl(a => ({ ...a, [m.id]: null })) }
      }
    })
    return () => { weg = true }
  }, [])

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-6" data-client-geraete>
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><MonitorSmartphone size={24} /> Client Geräte</h1>
        <p className="text-sm text-muted-foreground mt-1">Geräte auf den Lageplänen der Standorte — Bereich wählen.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl">
        {bereiche.map(b => {
          const i = INFO[b.id]
          const n = anzahl[b.id]
          return (
            <button key={b.id} onClick={() => setScreen(b.id)} data-bereich={b.id}
              className="group text-left rounded-xl border border-border bg-card p-5 hover:border-primary/50 hover:bg-accent/30 transition-colors flex flex-col gap-3 min-h-[150px]">
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">{i?.icon || <MonitorSmartphone size={26} />}</span>
                <span className="text-base font-semibold text-foreground">{b.label}</span>
                <ChevronRight size={18} className="ml-auto text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className="text-xs text-muted-foreground flex-1">{i?.text}</p>
              <p className="text-[11px] text-muted-foreground">
                {n === undefined ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" />zähle Geräte …</span> : n === null ? 'Anzahl nicht lesbar' : `${n} Gerät${n === 1 ? '' : 'e'} verortet`}
              </p>
            </button>
          )
        })}
        {!bereiche.length && <p className="text-sm text-muted-foreground">Für dich ist kein Bereich freigegeben.</p>}
      </div>
    </div>
  )
}
