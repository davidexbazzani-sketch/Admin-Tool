import { useMemo } from 'react'
import { CalendarRange, AlertTriangle } from 'lucide-react'
import type { Regelwerk, Abwesenheiten } from '../../services/zuweisung/types'
import { vertretungsluecken } from '../../services/zuweisung/analyse'

function d(iso: string): Date { return new Date(iso + 'T00:00:00') }
function fmt(iso: string): string { const x = d(iso); return isNaN(x.getTime()) ? iso : x.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) }
function days(a: string, b: string): number { return Math.round((d(b).getTime() - d(a).getTime()) / 86400000) }

export default function KalenderUebersicht({ regelwerk, abwesenheiten }: { regelwerk: Regelwerk; abwesenheiten: Abwesenheiten | null }) {
  const luecken = useMemo(() => vertretungsluecken(regelwerk, abwesenheiten), [regelwerk, abwesenheiten])
  if (!abwesenheiten || !abwesenheiten.zeitraum) {
    return <div className="text-sm text-muted-foreground">Kein Team-Kalender geladen. Oben „Team-Kalender laden" (JSON oder XLSX).</div>
  }
  const start = abwesenheiten.zeitraum.von, ende = abwesenheiten.zeitraum.bis
  const span = Math.max(1, days(start, ende))
  const personen = Object.entries(abwesenheiten.personen).sort((a, b) => b[1].tage - a[1].tage)
  const monate = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

  return (
    <div className="space-y-6 max-w-[70rem]">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2"><CalendarRange size={15} className="text-primary" />Wer ist wann weg</h3>
        <div className="text-[11px] text-muted-foreground mb-3">Zeitraum {fmt(start)}–{fmt(ende)} · Quelle {abwesenheiten.quelle || '—'} · Stand {abwesenheiten.stand_datei || '—'} · {abwesenheiten.betriebsfrei?.length || 0} betriebsfreie Werktage</div>
        {/* Monatsraster */}
        <div className="relative h-4 ml-40 mb-1">
          {monate.map((m, i) => <span key={m} className="absolute text-[9px] text-muted-foreground" style={{ left: `${(i / 12) * 100}%` }}>{m}</span>)}
        </div>
        <div className="flex flex-col gap-1">
          {personen.map(([name, p]) => (
            <div key={name} className="flex items-center gap-2">
              <div className="w-40 shrink-0 text-xs text-foreground truncate" title={name}>{name} <span className="text-muted-foreground">({p.tage})</span></div>
              <div className="relative flex-1 h-4 rounded bg-muted/40 overflow-hidden">
                {p.zeitraeume.map((z, i) => {
                  const left = Math.max(0, (days(start, z.von) / span) * 100)
                  const width = Math.max(0.6, ((days(z.von, z.bis) + 1) / span) * 100)
                  return <div key={i} title={`${fmt(z.von)}–${fmt(z.bis)} (${z.tage})`} className="absolute top-0 bottom-0 bg-amber-500/70 rounded-sm" style={{ left: `${left}%`, width: `${width}%` }} />
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2"><AlertTriangle size={15} className="text-red-400" />Vertretungslücken</h3>
        <div className="text-[11px] text-muted-foreground mb-2">Werktage, an denen Haupt- und beide Vertretungsbearbeiter eines Themas gleichzeitig abwesend sind (nur Themen, deren komplette Kette im Kalender steht).</div>
        {luecken.length === 0 ? (
          <div className="text-xs text-emerald-300">Keine vollständigen Lücken im geladenen Zeitraum.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {luecken.map(l => (
              <div key={l.regel} className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{l.regel}</span>
                  <span className="text-foreground">{l.thema}</span>
                  <span className="text-muted-foreground">Kette: {l.kette.join(' → ')}</span>
                  <span className="ml-auto text-red-300 font-medium">{l.tage} Werktag(e)</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{l.ranges.map(r => r.von === r.bis ? fmt(r.von) : `${fmt(r.von)}–${fmt(r.bis)}`).join(' · ')}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
