// ── PC-Diagnose: Kacheln (Komplett-Diagnose, SAP, SolidWorks, Netzwerk) + „Gib dein Problem ein“ ──
// Die Komplett-Diagnose (Volldiagnose 2.0) liegt in src/vollDiagnose/: liest erst nur (Rundumscan,
// Vertiefungen, Ursachenbild) und greift erst im Maßnahmenplan nach Bestätigung ein — auch für Server.
// Die alte Bereichs-Engine (10 Bereiche, Remote-Doc-Skills) ist darin aufgegangen.

import { lazy, Suspense, useEffect, useState } from 'react'
import { Stethoscope, Activity, Boxes, Wrench, Wifi, X, Loader } from 'lucide-react'
import SapFehlersuche from '../sapCheck/SapFehlersuche'
import SolidWorksDiagnose from '../swCheck/SolidWorksDiagnose'
import NetzwerkDiagnose from '../netCheck/NetzwerkDiagnose'
import SolidWorksHelp from '../components/solidworks/SolidWorksHelp'
import ProblemAssistent from '../problemAssistent/ProblemAssistent'
import MonitorUebersicht from '../monitoring/MonitorUebersicht'
import { useMonitorDialog } from '../store/monitorDialogStore'
import { useAppStore } from '../store/appStore'
import { useVollDiagnoseStore } from '../vollDiagnose/store'
import { VollDiagnoseInfo, VOLLDIAGNOSE_DAUER } from '../vollDiagnose/VollDiagnoseInfo'
import { oeffneWerkzeug } from './Startseite'

const VollDiagnose = lazy(() => import('../vollDiagnose/VollDiagnose'))

type Fach = { art: 'netz' | 'sap' | 'sw'; host: string }

export default function PCDiagnosis() {
  const [fach, setFach] = useState<Fach | null>(null)
  const [monMode, setMonMode] = useState(false)
  const [vollOffen, setVollOffen] = useState(false)
  const [vollStart, setVollStart] = useState<{ host?: string; text?: string; n: number }>({ n: 0 })
  const oeffneMonitor = useMonitorDialog(s => s.oeffne)
  const vdAktiv = useVollDiagnoseStore(s => s.aktiv)

  function werkzeug(id: string, host: string, text?: string) {
    if (id === 'netzdiagnose') setFach({ art: 'netz', host })
    else if (id === 'sap-fehlersuche') setFach({ art: 'sap', host })
    else if (id === 'solidworks-diagnose') setFach({ art: 'sw', host })
    else if (id === 'voll-diagnose') {
      useVollDiagnoseStore.getState().zeige(null)
      setVollStart(v => ({ host: host || undefined, text, n: v.n + 1 }))
      setVollOffen(true)
      setTimeout(() => document.querySelector('[data-voll-diagnose]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
    else if (id === 'ueberwachung') oeffneMonitor(host ? { host } : undefined)
    else oeffneWerkzeug(id, host)
  }

  // Werkzeug-Wunsch von der Startseite („Gib dein Problem ein“) einmalig ausführen
  const wunsch = useAppStore(s => s.pcDiagnoseWunsch)
  useEffect(() => {
    if (!wunsch) return
    useAppStore.getState().setPcDiagnoseWunsch(null)
    werkzeug(wunsch.werkzeug, wunsch.host, wunsch.text)
  }, [wunsch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Läuft (oder liegt) eine Komplett-Diagnose im Hintergrund, beim Öffnen gleich zeigen
  useEffect(() => { if (vdAktiv) setVollOffen(true) }, [vdAktiv])

  const zurueck = () => setFach(null)
  if (fach?.art === 'sap') return <SapFehlersuche onBack={zurueck} startHost={fach.host} autoStart={!!fach.host} />
  if (fach?.art === 'sw') return <SolidWorksDiagnose onBack={zurueck} startHost={fach.host} autoStart={!!fach.host} />
  if (fach?.art === 'netz') return <NetzwerkDiagnose onBack={zurueck} startHost={fach.host} autoStart={!!fach.host} />
  if (monMode) return <MonitorUebersicht onBack={() => setMonMode(false)} />

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-6">
      <div>
        <div className="flex items-center gap-3 flex-wrap max-w-5xl">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Stethoscope size={24} /> PC-Diagnose</h1>
          <button onClick={() => setMonMode(true)} data-ueberwachung-knopf
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/10">
            <Activity size={14} /> Überwachung über Zeit
          </button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Komplett-Diagnose, Fachdiagnosen und „Gib dein Problem ein“ – für PCs und Server.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-5xl">
        <div role="button" tabIndex={0} onClick={() => setVollOffen(o => !o)} onKeyDown={e => { if (e.key === 'Enter') setVollOffen(o => !o) }} data-kachel-voll aria-expanded={vollOffen}
          className={`text-left rounded-lg border p-4 cursor-pointer transition-colors ${vollOffen ? 'border-primary bg-primary/10 ring-2 ring-primary/30' : 'border-border bg-card hover:border-primary/40 hover:bg-accent/30'}`}>
          <div className="flex items-center gap-2"><Stethoscope size={18} className="text-primary" /><span className="text-sm font-semibold text-foreground">Komplett-Diagnose</span><span className="ml-auto" onClick={e => e.stopPropagation()}><VollDiagnoseInfo klein /></span></div>
          <p className="text-[11px] text-muted-foreground mt-1">Alles prüfen, gezielt vertiefen, Ursache finden, Lösung nach Bestätigung – auch für Server. {VOLLDIAGNOSE_DAUER}.</p>
        </div>
        <button onClick={() => setFach({ art: 'sap', host: '' })} className="text-left rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:bg-accent/30 transition-colors">
          <div className="flex items-center gap-2"><Boxes size={18} className="text-primary" /><span className="text-sm font-semibold text-foreground">SAP Fehlersuche</span></div>
          <p className="text-[11px] text-muted-foreground mt-1">Fokussiert auf SAP: Installation, Konfiguration, Netz/Kerberos, Logs, Edge — mit Vergleich &amp; Baseline.</p>
        </button>
        <button onClick={() => setFach({ art: 'sw', host: '' })} className="text-left rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:bg-accent/30 transition-colors">
          <div className="flex items-center gap-2"><Wrench size={18} className="text-primary" /><span className="text-sm font-semibold text-foreground"><SolidWorksHelp>SolidWorks</SolidWorksHelp> Diagnose</span></div>
          <p className="text-[11px] text-muted-foreground mt-1">Mehrere Workstations auf einmal (Typ/Status) oder Einzel-PC — Bestandsaufnahme + Lizenzserver, mit Sammel-Export.</p>
        </button>
        <button onClick={() => setFach({ art: 'netz', host: '' })} className="text-left rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:bg-accent/30 transition-colors">
          <div className="flex items-center gap-2"><Wifi size={18} className="text-primary" /><span className="text-sm font-semibold text-foreground">Netzwerk Probleme</span></div>
          <p className="text-[11px] text-muted-foreground mt-1">WLAN-Aussetzer analysieren: mehrere PCs + Referenz-PCs vergleichen, Fehl-Einstellungen erkennen und direkt beheben.</p>
        </button>
      </div>

      {vollOffen && (
        <div className="max-w-5xl w-full relative" data-voll-diagnose>
          {!vdAktiv && <button onClick={() => setVollOffen(false)} className="absolute right-2 top-2 z-10 p-1 rounded hover:bg-accent text-muted-foreground" title="Schließen"><X size={15} /></button>}
          <Suspense fallback={<p className="text-xs text-muted-foreground inline-flex items-center gap-2"><Loader size={13} className="animate-spin" />Komplett-Diagnose wird geladen …</p>}>
            <VollDiagnose key={vollStart.n} startHost={vollStart.host} startText={vollStart.text} onWerkzeug={werkzeug} />
          </Suspense>
        </div>
      )}

      <div className="max-w-5xl w-full">
        <ProblemAssistent onWerkzeug={werkzeug} />
      </div>
    </div>
  )
}
