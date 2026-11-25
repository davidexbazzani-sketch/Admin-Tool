// Kleine gemeinsame Bausteine der Einstellungen.
import type { ReactNode } from 'react'
import { Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

export function Schalter({ an, onChange, disabled, label, data }: { an: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; data?: string }) {
  return (
    <button type="button" role="switch" aria-checked={an} aria-label={label} title={label} disabled={disabled}
      onClick={() => onChange(!an)} className="es-schalter" data-schalter={data}>
      <span />
    </button>
  )
}

type Ton = 'info' | 'warn' | 'ok' | 'fehler'
const ICON: Record<Ton, ReactNode> = {
  info: <Info size={14} className="es-info shrink-0 mt-px" />,
  warn: <AlertTriangle size={14} className="es-warn shrink-0 mt-px" />,
  ok: <CheckCircle size={14} className="es-ok shrink-0 mt-px" />,
  fehler: <XCircle size={14} className="es-fehler shrink-0 mt-px" />,
}

export function Hinweis({ ton = 'info', children, className = '' }: { ton?: Ton; children: ReactNode; className?: string }) {
  return (
    <div className={`es-box-${ton} rounded-lg px-3 py-2 text-xs text-foreground flex items-start gap-2 ${className}`}>
      {ICON[ton]}<div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  )
}

/** Abschnitt innerhalb einer Detailansicht. */
export function Abschnitt({ titel, untertitel, rechts, children, id }: { titel: string; untertitel?: string; rechts?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" id={id}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{titel}</h3>
          {untertitel && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{untertitel}</p>}
        </div>
        {rechts}
      </div>
      {children}
    </section>
  )
}

export const eingabe = 'w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary'
export const knopf = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
export const knopfLeise = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50'

export const datumZeit = (iso?: string | null) => {
  if (!iso) return 'noch nie'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? 'noch nie' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
