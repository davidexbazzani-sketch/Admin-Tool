// ── Drucker → Übersicht: alle Drucker, Warnungen je Drucker ───────────────────
// Klick auf die Zeile = Drucker-Übersicht (wie das „i"). Klick auf eine Warnung klappt die
// Details mit direkten Aktionen auf (Übersicht, Web-Oberfläche, Toner bestellen).
// Schriftfarben: Warn-Chips sind gefüllt mit dunkler/heller Schrift passend zur Füllung —
// nie farbige Schrift auf gleichfarbigem Grund.

import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Globe, Loader2, Info, RefreshCw, Search, ShoppingCart, WifiOff } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { PrinterInfoButton, useOeffnePrinterDossier } from '../printer/PrinterDossier'
import { openPrinterWeb } from '../../services/printerActions'
import {
  pruefeAlleDrucker, warnungenVon, druckerKey, lagerKey, PARALLEL,
  type DruckerStatus, type DruckerWarnung,
} from '../../services/druckerFlotte'
import { istToner } from '../../services/tonerWarnung'
import type { DruckerDaten } from '../../screens/Drucker'

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

const CHIP: Record<DruckerWarnung['schwere'] | 'offline', string> = {
  kritisch: 'bg-red-600 text-white border-red-700',
  warnung: 'bg-amber-400 text-black border-amber-500',
  offline: 'bg-zinc-500 text-white border-zinc-600',
}

/** Füllstand als schmaler Balken + Zahl (Zahl trägt die Info, Farbe nur Zusatz). */
function Fuell({ name, prozent }: { name: string; prozent: number | null }) {
  const farbe = prozent === null ? 'bg-zinc-400' : prozent < 4 ? 'bg-red-500' : prozent < 15 ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <span className="inline-flex items-center gap-1" title={`${name}: ${prozent === null ? 'unbekannt / OK' : prozent + ' %'}`}>
      <span className="w-8 h-1.5 rounded-full bg-muted overflow-hidden"><span className={`block h-full ${farbe}`} style={{ width: `${prozent ?? 100}%` }} /></span>
      <span className="text-[10px] tabular-nums text-muted-foreground w-7">{prozent === null ? 'OK' : `${prozent}%`}</span>
    </span>
  )
}

type Filter = 'alle' | 'warnungen' | 'offline' | 'ungeprueft'

export default function DruckerListe({ daten, neuLaden, onBestellen }: {
  daten: DruckerDaten | null; neuLaden: () => Promise<void>; onBestellen: (material: string) => void
}) {
  const ich = useAuthStore(s => s.session?.user?.username || '')
  const oeffne = useOeffnePrinterDossier()
  const [suche, setSuche] = useState('')
  const [filter, setFilter] = useState<Filter>('alle')
  const [auf, setAuf] = useState<string | null>(null)
  const [pruefung, setPruefung] = useState<{ fertig: number; gesamt: number } | null>(null)
  const [meldung, setMeldung] = useState('')

  const zeilen = useMemo(() => (daten?.drucker || []).map(d => {
    const s: DruckerStatus | undefined = daten?.flotte.drucker[druckerKey(d.name)]
    return { d, s, w: warnungenVon(s) }
  }), [daten])

  const zahl = {
    warnungen: zeilen.filter(z => z.w.some(w => w.art !== 'offline')).length,
    offline: zeilen.filter(z => z.s && !z.s.erreichbar).length,
    ungeprueft: zeilen.filter(z => !z.s).length,
  }
  const q = suche.trim().toLowerCase()
  const sichtbar = zeilen
    .filter(z => filter === 'alle' || (filter === 'warnungen' ? z.w.some(w => w.art !== 'offline') : filter === 'offline' ? z.s && !z.s.erreichbar : !z.s))
    .filter(z => !q || [z.d.name, z.d.standort, z.d.ip, z.s?.modell].some(x => (x || '').toLowerCase().includes(q)))
    .sort((a, b) => Number(!a.w.some(w => w.schwere === 'kritisch')) - Number(!b.w.some(w => w.schwere === 'kritisch')) || b.w.length - a.w.length || a.d.name.localeCompare(b.d.name, 'de', { numeric: true }))

  async function allePruefen() {
    setMeldung(''); setPruefung({ fertig: 0, gesamt: daten?.drucker.length || 0 })
    const r = await pruefeAlleDrucker(ich, { manuell: true, onFortschritt: (fertig, gesamt) => setPruefung({ fertig, gesamt }) }).catch(e => ({ gelaufen: false, grund: String(e) }))
    setPruefung(null)
    setMeldung(r.gelaufen ? `Geprüft: ${'erreicht' in r ? r.erreicht : 0} von ${'drucker' in r ? r.drucker : 0} erreichbar.` : `Nicht gestartet: ${r.grund}`)
    await neuLaden()
  }

  const ls = daten?.flotte.letzterScan
  if (!daten) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" />Drucker werden geladen …</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-border bg-card px-3 py-2 text-xs">
        <Info size={13} className="text-sky-500 shrink-0" />
        <span className="text-foreground">
          {ls ? <>Stand: <b>{fmt(ls.am)}</b> ({ls.manuell ? 'von Hand' : 'automatisch'}, {ls.von}) · {ls.erreicht} von {ls.drucker} erreichbar · {ls.dauerS} s</> : 'Noch keine Prüfung gelaufen.'}
          <span className="text-muted-foreground"> · automatisch nur vor 07:00 und ab 16:00, {PARALLEL} Drucker gleichzeitig</span>
        </span>
        <button onClick={() => void allePruefen()} disabled={!!pruefung}
          title={`Alle Drucker jetzt nacheinander abfragen (${PARALLEL} gleichzeitig, mit Pausen) — dauert einige Minuten, belastet das Netz kaum`}
          className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border hover:bg-accent text-foreground disabled:opacity-50">
          {pruefung ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {pruefung ? `prüfe ${pruefung.fertig}/${pruefung.gesamt} …` : 'Jetzt alle prüfen'}
        </button>
      </div>
      {meldung && <p className="text-xs text-foreground">{meldung}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Drucker, Standort, IP, Modell …"
            className="pl-7 pr-2 py-1.5 w-72 rounded-md bg-background border border-border text-xs text-foreground" />
        </div>
        {([['alle', `Alle (${zeilen.length})`], ['warnungen', `Mit Warnungen (${zahl.warnungen})`], ['offline', `Nicht erreichbar (${zahl.offline})`], ['ungeprueft', `Noch nicht geprüft (${zahl.ungeprueft})`]] as [Filter, string][]).map(([id, t]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`px-2.5 py-1 rounded-full border text-xs ${filter === id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:bg-accent'}`}>{t}</button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Drucker</th>
              <th className="text-left font-medium px-2 py-2">Standort</th>
              <th className="text-left font-medium px-2 py-2">IP / Modell</th>
              <th className="text-left font-medium px-2 py-2">Toner</th>
              <th className="text-right font-medium px-2 py-2">Seiten</th>
              <th className="text-left font-medium px-3 py-2">Warnungen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sichtbar.map(({ d, s, w }) => {
              const toner = (s?.supplies || []).filter(x => istToner(x.name))
              const offen = auf === d.name
              return [
                <tr key={d.name} onClick={() => oeffne?.(d.name)} className="hover:bg-accent/30 cursor-pointer align-top">
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 font-semibold text-foreground">{d.name}<PrinterInfoButton printerName={d.name} /></span>
                  </td>
                  <td className="px-2 py-2 text-foreground max-w-[14rem] truncate" title={d.standort}>{d.standort || '—'}</td>
                  <td className="px-2 py-2">
                    <span className="block font-mono text-foreground">{d.ip || '—'}</span>
                    {s?.modell && <span className="block text-[10px] text-muted-foreground max-w-[16rem] truncate" title={s.modell}>{s.modell}</span>}
                  </td>
                  <td className="px-2 py-2">
                    {toner.length ? <span className="flex flex-col gap-0.5">{toner.map(t => <Fuell key={t.name} name={t.name} prozent={t.prozent} />)}</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-foreground">{s?.seiten ? s.seiten.toLocaleString('de-DE') : '—'}</td>
                  <td className="px-3 py-2">
                    {!s ? <span className="text-muted-foreground">noch nicht geprüft</span>
                      : !w.length ? <span className="inline-flex items-center gap-1 text-foreground"><CheckCircle2 size={13} className="text-emerald-500" />alles in Ordnung</span>
                      : <span className="flex flex-wrap gap-1">
                          {w.map((x, i) => (
                            <button key={i} onClick={e => { e.stopPropagation(); setAuf(offen ? null : d.name) }} title={`${x.detail} — klicken für Details`}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-semibold hover:opacity-90 ${CHIP[x.art === 'offline' ? 'offline' : x.schwere]}`}>
                              {x.art === 'offline' ? <WifiOff size={11} /> : <AlertTriangle size={11} />}{x.text}
                            </button>
                          ))}
                        </span>}
                  </td>
                </tr>,
                offen && (
                  <tr key={d.name + '_details'} className="bg-muted/20">
                    <td colSpan={6} className="px-3 py-2.5">
                      <div className="space-y-1.5">
                        {w.map((x, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${CHIP[x.art === 'offline' ? 'offline' : x.schwere]}`}>{x.schwere === 'kritisch' ? 'Kritisch' : x.art === 'offline' ? 'Offline' : 'Warnung'}</span>
                            <span className="flex-1 text-foreground">{x.detail}</span>
                            {x.art === 'toner' && x.material && (
                              <LagerHinweis material={x.material} daten={daten} onBestellen={() => onBestellen(x.material!)} />
                            )}
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button onClick={() => oeffne?.(d.name)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-semibold"><Info size={12} />Drucker-Übersicht öffnen</button>
                          {d.ip && <button onClick={() => void openPrinterWeb(d.ip)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-foreground hover:bg-accent"><Globe size={12} />Web-Oberfläche des Druckers</button>}
                          <span className="text-[11px] text-muted-foreground self-center">zuletzt geprüft {fmt(s?.geprueftAm)}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ),
              ]
            })}
          </tbody>
        </table>
        {!sichtbar.length && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Keine Drucker für diesen Filter.</p>}
      </div>
    </div>
  )
}

function LagerHinweis({ material, daten, onBestellen }: { material: string; daten: DruckerDaten; onBestellen: () => void }) {
  const a = daten.lager?.artikel[lagerKey(material)]
  return (
    <span className="shrink-0 inline-flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground">{a ? `im Lager: ${a.bestand}` : 'nicht im Lager gepflegt'}</span>
      <button onClick={onBestellen} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-foreground hover:bg-accent text-[11px]"><ShoppingCart size={11} />bestellen</button>
    </span>
  )
}
