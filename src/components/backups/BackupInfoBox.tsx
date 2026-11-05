// ── Infobox „Was dieses Backup macht" ─────────────────────────────────────────
// Klartext je Karte: Was / Wann (+ wie oft) / Wie / Wo — immer sichtbar.
// „Details" zeigt jeden Ordner (Quelle → Ziel) und die Sonderfälle.
import { Fragment, useState } from 'react'
import { Info, ChevronDown, ChevronRight, ArrowRight, AlertTriangle } from 'lucide-react'
import type { BackupBeschreibung } from '../../services/backupBeschreibung'

export default function BackupInfoBox({ b, titel = 'Was dieses Backup macht' }: { b: BackupBeschreibung; titel?: string }) {
  const [details, setDetails] = useState(false)
  return (
    <div className="mt-1.5 rounded-md border border-border bg-muted/20 px-2.5 py-2" data-infobox>
      <div className="flex items-center gap-1.5 mb-1">
        <Info size={12} className="text-blue-500 shrink-0" />
        <span className="text-[11px] font-semibold text-foreground">{titel}</span>
        <button onClick={() => setDetails(v => !v)} aria-expanded={details}
          className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground">
          {details ? <ChevronDown size={11} /> : <ChevronRight size={11} />}{details ? 'Weniger' : 'Details'}
        </button>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 text-[11px] leading-snug">
        {b.zeilen.map(z => (
          <Fragment key={z.titel}>
            <dt className="text-muted-foreground font-medium">{z.titel}</dt>
            <dd className={z.warn ? 'text-amber-500' : 'text-foreground'}>{z.text}</dd>
          </Fragment>
        ))}
      </dl>
      {details && (
        <div className="mt-2 pt-2 border-t border-border space-y-2">
          {b.ordner.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{b.ordnerTitel}: Quelle → Ziel</p>
              <div className="space-y-0.5">
                {b.ordner.map((o, i) => (
                  <div key={`${o.quelle}-${i}`} className={`text-[10px] font-mono break-all flex flex-wrap items-center gap-x-1 ${o.aus ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {o.name && <span className="font-sans font-semibold mr-0.5">{o.name}{o.aus ? ' (deaktiviert, wird nicht kopiert)' : ''}:</span>}
                    <span>{o.quelle}</span>
                    <ArrowRight size={10} className="text-muted-foreground shrink-0" />
                    <span>{o.ziel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Gut zu wissen</p>
            <ul className="space-y-0.5">
              {b.hinweise.map((h, i) => (
                <li key={i} className={`text-[11px] leading-snug flex items-start gap-1.5 ${h.warn ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  {h.warn ? <AlertTriangle size={11} className="mt-0.5 shrink-0" /> : <span className="mt-[7px] w-1 h-1 rounded-full bg-muted-foreground/60 shrink-0" />}
                  <span>{h.text}</span>
                </li>
              ))}
            </ul>
          </div>
          {b.meta && <p className="text-[10px] text-muted-foreground">{b.meta}</p>}
        </div>
      )}
    </div>
  )
}
