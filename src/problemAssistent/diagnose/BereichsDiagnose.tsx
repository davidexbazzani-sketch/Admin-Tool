// ── „Problem nicht behoben“ → komplette Diagnose des Problembereichs ─────────
import { useMemo } from 'react'
import { Stethoscope } from 'lucide-react'
import { PROBLEME } from '../katalog'
import type { PaVerbindung } from '../motor'
import type { PaBereich } from '../types'
import { bereichsDiagnose } from './bereich'
import { Diagnose, type DgErsatzBenutzer } from './KeineAhnung'

export default function BereichsDiagnose({ bereich, host, verb, versucht, onLoesung, ersatz }: {
  bereich: PaBereich; host: string; verb: PaVerbindung | null; versucht: string[]; onLoesung: (id: string) => void; ersatz?: DgErsatzBenutzer | null
}) {
  const unter = useMemo(() => bereichsDiagnose(bereich), [bereich])
  const titel = useMemo(() => new Map(PROBLEME.map(p => [p.id, p])), [])
  if (!unter) return <p className="text-xs text-muted-foreground">Für den Bereich „{bereich}“ gibt es noch keine Diagnose.</p>
  return (
    <div className="rounded-xl border-2 border-violet-500/30 bg-violet-500/[0.03] p-3 space-y-2" data-bereichs-diagnose>
      <p className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5"><Stethoscope size={15} className="text-violet-600 dark:text-violet-400" />{unter.titel}</p>
      <Diagnose unter={unter} host={host} verb={verb} titel={titel} onLoesung={onLoesung} autoStart versucht={versucht} ersatz={ersatz} />
    </div>
  )
}
