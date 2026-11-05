// ── Toner-Warnung – Popups oben rechts ────────────────────────────────────────
// Bleiben stehen, bis der Nutzer „Gelesen" bestätigt. Farben bewusst schlicht: normale
// Schrift auf der Kartenfarbe, die Warnfarbe nur als Rand/Leiste und am Symbol — so bleibt
// alles in hellem wie dunklem Design lesbar (kein roter Text auf rotem Grund).

import { Printer, Check, CheckCheck } from 'lucide-react'
import { useTonerWarnungStore } from '../../store/tonerWarnungStore'

const MAX_EINZELN = 3

const datum = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function TonerPopups() {
  const offen = useTonerWarnungStore(s => s.offen)
  const bestaetigen = useTonerWarnungStore(s => s.bestaetigen)
  if (!offen.length || !bestaetigen) return null
  const einzeln = offen.slice(0, MAX_EINZELN)
  const mehr = offen.length - einzeln.length

  return (
    <>
      {einzeln.map(w => (
        <div key={w.id} role="alert" className="rounded-xl border-2 border-red-500 bg-card shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white">
            <Printer size={14} className="shrink-0" />
            <span className="text-xs font-bold tracking-wide">Toner fast leer</span>
            <span className="ml-auto text-[11px] font-bold tabular-nums">{w.prozent} %</span>
          </div>
          <div className="px-3 py-2.5 space-y-1">
            <p className="text-sm font-semibold text-foreground">{w.drucker}</p>
            <p className="text-xs text-foreground">benötigt eine neue Patrone:</p>
            <p className="text-xs font-semibold text-foreground break-words">{w.material}</p>
            <p className="text-[11px] text-muted-foreground">
              {w.standort ? `${w.standort} · ` : ''}{w.ip ? `${w.ip} · ` : ''}seit {datum(w.seit)}
            </p>
            {/* Füllstand als Balken — die Zahl steht oben, der Balken ist nur Zusatz */}
            <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden>
              <div className="h-full bg-red-500" style={{ width: `${Math.max(2, w.prozent)}%` }} />
            </div>
          </div>
          <div className="flex justify-end px-3 pb-2.5">
            <button onClick={() => bestaetigen([w.id])}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90">
              <Check size={13} />Gelesen
            </button>
          </div>
        </div>
      ))}
      {mehr > 0 && (
        <div className="rounded-xl border-2 border-red-500 bg-card shadow-2xl px-3 py-2 flex items-center gap-2">
          <Printer size={14} className="shrink-0 text-red-500" />
          <span className="flex-1 text-xs text-foreground">
            <b>{mehr} weitere</b> Patrone{mehr === 1 ? '' : 'n'} fast leer: {offen.slice(MAX_EINZELN).map(w => w.drucker).join(', ')}
          </span>
        </div>
      )}
      {offen.length > 1 && (
        <div className="flex justify-end">
          <button onClick={() => bestaetigen(offen.map(w => w.id))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-foreground text-xs font-semibold shadow-lg hover:bg-accent">
            <CheckCheck size={13} />Alle {offen.length} als gelesen bestätigen
          </button>
        </div>
      )}
    </>
  )
}
