// ── Drucker → Charts: wie stark wird welcher Drucker genutzt? ─────────────────
// Zwei getrennte Balkendiagramme (nie zwei Achsen in einem): gedruckte Seiten im Zeitraum und
// Personen, die den Drucker eingerichtet haben. Darunter alle Drucker als Tabelle mit Hinweisen.
// Datenquellen ohne eigene Abfragen: Seitenzähler aus dem Drucker-Scan (seiten.json), Personen
// aus dem vorhandenen Verbindungs-Scan (printer_connections/scan_data.json).
// Farben: eine Reihe = eine Farbe (--viz-1), Text immer in Textfarben.

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Info } from 'lucide-react'
import { PrinterInfoButton, useOeffnePrinterDossier } from '../printer/PrinterDossier'
import { ladeSeiten, ladeVerbindungsZahlen, seitenSeit, druckerKey, type SeitenVerlauf, type VerbindungsZahl } from '../../services/druckerFlotte'
import type { DruckerDaten } from '../../screens/Drucker'

type Zeitraum = 7 | 30 | 90 | 0   // 0 = Zählerstand gesamt
const ZEITRAUM: [Zeitraum, string][] = [[7, '7 Tage'], [30, '30 Tage'], [90, '90 Tage'], [0, 'Gesamt (Zählerstand)']]
const zahl = (n: number) => n.toLocaleString('de-DE')

interface Zeile { name: string; standort?: string; seitenZeit: number | null; seitenGesamt: number | null; v?: VerbindungsZahl; hinweise: string[] }

function Balken({ titel, untertitel, werte, einheit }: { titel: string; untertitel: string; werte: { name: string; wert: number }[]; einheit: string }) {
  const [alle, setAlle] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const oeffne = useOeffnePrinterDossier()
  const sortiert = werte.filter(w => w.wert > 0).sort((a, b) => b.wert - a.wert)
  const liste = alle ? sortiert : sortiert.slice(0, 15)
  const max = Math.max(1, ...sortiert.map(w => w.wert))
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 min-w-0">
      <div>
        <p className="text-sm font-semibold text-foreground">{titel}</p>
        <p className="text-[11px] text-muted-foreground">{untertitel}</p>
      </div>
      {!liste.length ? <p className="text-xs text-muted-foreground py-6 text-center">Noch keine Daten.</p> : (
        <div className="flex flex-col gap-1">
          {liste.map(w => (
            <button key={w.name} onClick={() => oeffne?.(w.name)} onMouseEnter={() => setHover(w.name)} onMouseLeave={() => setHover(null)}
              title={`${w.name}: ${zahl(w.wert)} ${einheit} — klicken für die Drucker-Übersicht`}
              className={`grid grid-cols-[7rem_1fr_4.5rem] items-center gap-2 text-left rounded px-1 py-0.5 ${hover === w.name ? 'bg-accent/40' : ''}`}>
              <span className="text-xs text-foreground truncate">{w.name}</span>
              <span className="h-3 rounded-r bg-muted/40">
                <span className="block h-full rounded-r" style={{ width: `${Math.max(1, (w.wert / max) * 100)}%`, background: 'var(--viz-1)', opacity: hover && hover !== w.name ? 0.55 : 1 }} />
              </span>
              <span className="text-xs text-foreground tabular-nums text-right">{zahl(w.wert)}</span>
            </button>
          ))}
        </div>
      )}
      {sortiert.length > 15 && <button onClick={() => setAlle(x => !x)} className="self-start text-[11px] text-primary hover:underline">{alle ? 'nur Top 15' : `alle ${sortiert.length} anzeigen`}</button>}
    </div>
  )
}

export default function DruckerCharts({ daten }: { daten: DruckerDaten | null }) {
  const [zeitraum, setZeitraum] = useState<Zeitraum>(30)
  const [seiten, setSeiten] = useState<SeitenVerlauf | null>(null)
  const [verb, setVerb] = useState<{ stand?: string; je: Map<string, VerbindungsZahl> } | null>(null)
  useEffect(() => { void ladeSeiten().then(setSeiten); void ladeVerbindungsZahlen().then(setVerb) }, [])

  const verlaufAb = useMemo(() => {
    const tage = Object.values(seiten || {}).flatMap(r => Object.keys(r)).sort()
    return tage[0]
  }, [seiten])

  const zeilen: Zeile[] = useMemo(() => {
    if (!daten || !seiten || !verb) return []
    const roh = daten.drucker.map(d => {
      const k = druckerKey(d.name)
      const gesamt = daten.flotte.drucker[k]?.seiten ?? null
      const z = zeitraum === 0 ? gesamt : (seitenSeit(seiten[k], zeitraum)?.seiten ?? null)
      return { name: d.name, standort: d.standort, seitenZeit: z, seitenGesamt: gesamt, v: verb.je.get(k), hinweise: [] as string[] }
    })
    // Hinweise: stärkste 10 %, kaum genutzt, bei niemandem eingerichtet, Standard für viele
    const mitWert = roh.filter(r => r.seitenZeit !== null).sort((a, b) => (b.seitenZeit || 0) - (a.seitenZeit || 0))
    const top = new Set(mitWert.slice(0, Math.max(1, Math.ceil(mitWert.length * 0.1))).filter(r => (r.seitenZeit || 0) > 0).map(r => r.name))
    for (const r of roh) {
      if (top.has(r.name)) r.hinweise.push('stark genutzt')
      if (zeitraum !== 0 && r.seitenZeit !== null && r.seitenZeit < 20) r.hinweise.push('kaum genutzt')
      if (verb.stand && !r.v) r.hinweise.push('bei niemandem eingerichtet')
      if (r.v && r.v.standard >= 10) r.hinweise.push(`Standard bei ${r.v.standard}`)
    }
    return roh
  }, [daten, seiten, verb, zeitraum])

  if (!daten || !seiten || !verb) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" />Nutzungsdaten werden geladen …</p>

  const zeitText = zeitraum === 0 ? 'Zählerstand gesamt (seit Inbetriebnahme)' : `letzte ${zeitraum} Tage`
  const ohneVerlauf = zeitraum !== 0 && !zeilen.some(z => z.seitenZeit !== null)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-muted-foreground">Zeitraum:</span>
        {ZEITRAUM.map(([z, t]) => (
          <button key={z} onClick={() => setZeitraum(z)} className={`px-2.5 py-1 rounded-full border ${zeitraum === z ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:bg-accent'}`}>{t}</button>
        ))}
        <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground"><Info size={12} />
          Seitenverlauf seit {verlaufAb ? new Date(verlaufAb).toLocaleDateString('de-DE') : '— (startet mit der ersten Prüfung)'} · Verbindungen laut Scan vom {verb.stand ? new Date(verb.stand).toLocaleDateString('de-DE') : '— (noch keiner)'}
        </span>
      </div>
      {ohneVerlauf && <p className="text-xs text-foreground rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2">Für Zeiträume braucht es mindestens zwei Prüfungen an verschiedenen Tagen — bis dahin „Gesamt (Zählerstand)" wählen.</p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Balken titel="Gedruckte Seiten" untertitel={zeitText} einheit="Seiten" werte={zeilen.map(z => ({ name: z.name, wert: z.seitenZeit || 0 }))} />
        <Balken titel="Eingerichtet bei (Personen)" untertitel="wie viele Personen den Drucker auf ihrem PC haben" einheit="Personen" werte={zeilen.map(z => ({ name: z.name, wert: z.v?.personen || 0 }))} />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Drucker</th>
              <th className="text-left font-medium px-2 py-2">Standort</th>
              <th className="text-right font-medium px-2 py-2">Seiten ({zeitraum === 0 ? 'gesamt' : `${zeitraum} T.`})</th>
              <th className="text-right font-medium px-2 py-2">Zählerstand</th>
              <th className="text-right font-medium px-2 py-2">Personen</th>
              <th className="text-right font-medium px-2 py-2">PCs</th>
              <th className="text-right font-medium px-2 py-2">Standard bei</th>
              <th className="text-left font-medium px-3 py-2">Hinweise</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[...zeilen].sort((a, b) => (b.seitenZeit ?? -1) - (a.seitenZeit ?? -1)).map(z => (
              <tr key={z.name}>
                <td className="px-3 py-1.5"><span className="inline-flex items-center gap-1 font-semibold text-foreground">{z.name}<PrinterInfoButton printerName={z.name} /></span></td>
                <td className="px-2 py-1.5 text-foreground max-w-[14rem] truncate">{z.standort || '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{z.seitenZeit === null ? '—' : zahl(z.seitenZeit)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{z.seitenGesamt === null ? '—' : zahl(z.seitenGesamt)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{z.v?.personen ?? '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{z.v?.pcs ?? '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{z.v?.standard ?? '—'}</td>
                <td className="px-3 py-1.5">
                  <span className="flex flex-wrap gap-1">{z.hinweise.map(h => <span key={h} className="px-1.5 py-0.5 rounded border border-border bg-muted/40 text-foreground text-[10px]">{h}</span>)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
