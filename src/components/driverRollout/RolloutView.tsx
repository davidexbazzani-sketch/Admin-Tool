// ── Rollout-Ansicht: Liste vorhandener Rollouts / anlegen / Detail ───────────
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Plus, Rocket, Loader2, ChevronRight } from 'lucide-react'
import { loadRollouts, countRollout, type Rollout } from '../../services/driverRollout'
import { describeSchedule } from '../../services/scanSchedules'
import RolloutCreate from './RolloutCreate'
import RolloutDetail from './RolloutDetail'

export default function RolloutView({ by, onBack }: { by: string; onBack: () => void }) {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [selId, setSelId] = useState<string | null>(null)
  const [rollouts, setRollouts] = useState<Rollout[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try { setRollouts(await loadRollouts()) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (view === 'list') void reload() }, [view, reload])

  if (view === 'create') return <RolloutCreate by={by} onCancel={() => setView('list')} onCreated={r => { setSelId(r.id); setView('detail') }} />
  if (view === 'detail' && selId) return <RolloutDetail rolloutId={selId} by={by} onBack={() => setView('list')} onDeleted={() => setView('list')} />

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"><ArrowLeft size={12} />Zurück</button>
        <Rocket size={18} className="text-primary" />
        <h2 className="text-base font-bold text-foreground">Rollout</h2>
        <span className="text-[11px] text-muted-foreground">Geplante Treiber-Verteilung (ohne BIOS)</span>
        <button onClick={() => setView('create')} className="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90"><Plus size={13} />Neuer Rollout</button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {loading && rollouts.length === 0 ? (
          <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" />Wird geladen…</p>
        ) : rollouts.length === 0 ? (
          <div className="text-sm text-muted-foreground">Noch keine Rollouts. Mit „Neuer Rollout" PCs auswählen, verfügbare Treiber prüfen und einen geplanten Rollout anlegen.</div>
        ) : (
          rollouts.map(r => {
            const c = countRollout(r)
            return (
              <button key={r.id} onClick={() => { setSelId(r.id); setView('detail') }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card hover:border-primary/40 text-left">
                <Rocket size={16} className="text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground truncate">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground">{describeSchedule(r.schedule)} · {c.total} PC(s)</div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] shrink-0">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">{c.done} fertig</span>
                  {c.unreachable > 0 && <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/40">{c.unreachable} offen</span>}
                  {c.pending > 0 && <span className="px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border">{c.pending} offen</span>}
                  <span className={`px-2 py-0.5 rounded-full border ${r.status === 'fertig' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-primary/10 text-primary border-primary/30'}`}>{r.status}</span>
                </div>
                <ChevronRight size={15} className="text-muted-foreground shrink-0" />
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
