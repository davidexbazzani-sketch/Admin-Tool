import { useState } from 'react'
import { Copy, Check, MapPin, Lightbulb, AlertTriangle, Info } from 'lucide-react'
import type { Ergebnis, VertretungErgebnis, Regelwerk, SignalArt } from '../../services/zuweisung/types'
import { WISSENSINSEL_BADGE } from '../../services/zuweisung/engine'

const SIGNAL_LABEL: Record<SignalArt, string> = {
  kw_bei_ci_short: 'Schlagwort (Short description)', kw_bei_ci_text: 'Schlagwort (Text)', ci: 'Configuration Item',
  kw_short: 'Schlagwort (Short description)', kw_desc: 'Schlagwort (Description)', subcat: 'Subcategory',
  melder: 'Melder-Regel', abteilung: 'Abteilung des Melders', rest: 'Rest-Regel der Queue', gruppen_reihenfolge: 'Gruppen-Reihenfolge (kein Signal)',
}

function fmt(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00'); if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function ResultCard({ pred, vert, regelwerk }: { pred: Ergebnis; vert: VertretungErgebnis | null; regelwerk: Regelwerk }) {
  const [copied, setCopied] = useState('')
  const istInaktiv = (n: string) => !( (regelwerk.personen?.[n]?.status || 'aktiv').startsWith('aktiv') )
  const zuweisen = vert?.zuweisen || pred.primary
  const vertretung = pred.vertretung || []
  const copy = async (text: string, tag: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(''), 1500) } catch { /* egal */ }
  }

  const primaryInaktiv = istInaktiv(pred.primary)

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      {/* Zuweisen an */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Zuweisen an</div>
          <div className="text-2xl font-bold text-foreground leading-tight">{zuweisen || '—'}</div>
        </div>
        <button onClick={() => copy(zuweisen, 'main')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-primary/40 text-primary hover:bg-primary/10">
          {copied === 'main' ? <Check size={13} /> : <Copy size={13} />}Namen kopieren
        </button>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {pred.pool && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-foreground border border-amber-500/40"><MapPin size={11} className="text-amber-600" />Vor-Ort-Pool — Verfügbarkeit entscheidet</span>}
          {WISSENSINSEL_BADGE.has(pred.regel) && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-foreground border border-fuchsia-500/40"><Info size={11} className="text-fuchsia-600" />Wissensinsel — bei Abwesenheit rückfragen</span>}
        </div>
      </div>

      {/* Kette Haupt / Vertretung 1 / Vertretung 2 */}
      <div className="grid grid-cols-3 gap-2">
        {[{ label: 'Hauptbearbeiter', name: pred.primary }, { label: 'Vertretung 1', name: vertretung[0] || '—' }, { label: 'Vertretung 2', name: vertretung[1] || '—' }].map((c, idx) => {
          const inaktiv = c.name !== '—' && istInaktiv(c.name)
          const isAssigned = c.name === zuweisen
          return (
            <div key={idx} className={`rounded-lg border p-2 ${isAssigned ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-background'}`}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
              <div className={`text-sm font-medium ${inaktiv ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{c.name}</div>
              {inaktiv && <div className="text-[10px] text-red-400">inaktiv</div>}
            </div>
          )
        })}
      </div>

      {/* Warum */}
      <div className="rounded-lg border border-border bg-background p-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Lightbulb size={13} className="text-amber-400" />Warum</div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          <span>Regel: <span className="font-mono text-foreground">{pred.regel}</span>{pred.id !== pred.regel && <> · Unterregel <span className="font-mono text-foreground">{pred.id}</span></>}</span>
          <span>Thema: <span className="text-foreground">{pred.thema}</span></span>
          {pred.signal && <span>Signal: <span className="text-foreground">{SIGNAL_LABEL[pred.signal]}</span></span>}
        </div>
        {pred.grund && <div className="text-xs text-foreground/80">{pred.grund}</div>}
      </div>

      {/* Pflegehinweis bei inaktivem Hauptbearbeiter */}
      {primaryInaktiv && (
        <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>Hauptbearbeiter „{pred.primary}" ist als inaktiv hinterlegt — bitte im Regelwerk pflegen. Vorschlag ist der nächste aktive Bearbeiter der Kette.</span>
        </div>
      )}

      {/* Vertretung / Abwesenheiten (Schritt 2) */}
      {vert && (vert.abwesend.length > 0 || vert.hinweise.length > 0) && (
        <div className="rounded-lg border border-border bg-background p-3 space-y-2">
          <div className="text-xs font-semibold text-foreground">Vertretung (Team-Kalender, {fmt(vert.datum)})</div>
          {vert.kette.some(k => k.zustand === 'abwesend' || k.zustand === 'inaktiv') && (
            <div className="flex flex-col gap-0.5">
              {vert.kette.map((k, i) => (
                <div key={i} className="text-xs flex items-center gap-2">
                  <span className={k.zustand === 'zuweisen' ? 'text-emerald-300 font-medium' : (k.zustand === 'abwesend' || k.zustand === 'inaktiv') ? 'line-through text-muted-foreground' : 'text-foreground/70'}>{k.name}</span>
                  {k.zustand === 'abwesend' && <span className="text-[11px] text-foreground/70">abwesend bis {fmt(k.bis)}</span>}
                  {k.zustand === 'inaktiv' && <span className="text-[11px] text-red-400">inaktiv</span>}
                  {k.zustand === 'zuweisen' && <span className="text-[11px] text-emerald-400">← zuweisen</span>}
                </div>
              ))}
            </div>
          )}
          {vert.hinweise.map((h, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-foreground"><AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />{h}</div>
          ))}
        </div>
      )}
    </div>
  )
}
