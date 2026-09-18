// ── Rollout-Detail: Gesamtübersicht (erreicht/offen) + je PC eingespielte Treiber ──
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw, Play, FileDown, Trash2, Loader2, ChevronRight, ChevronDown, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react'
import {
  loadRollouts, runRolloutNow, deleteRollout, countRollout, type Rollout, type RolloutTarget,
} from '../../services/driverRollout'
import { describeSchedule } from '../../services/scanSchedules'
import { exportHpDriverReport } from '../../services/hpDriversReport'
import type { HpDeployResult } from '../../services/hpDrivers'
import { DeviceInfoButton } from '../device/DeviceDossier'

const STATUS_BADGE: Record<RolloutTarget['status'], { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
  done: { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', label: 'fertig', Icon: CheckCircle2 },
  unreachable: { cls: 'bg-red-500/15 text-red-300 border-red-500/40', label: 'nicht erreicht', Icon: XCircle },
  pending: { cls: 'bg-muted/40 text-muted-foreground border-border', label: 'offen', Icon: Clock },
  'in-progress': { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40', label: 'läuft', Icon: Loader2 },
}

export default function RolloutDetail({ rolloutId, by, onBack, onDeleted }: {
  rolloutId: string; by: string; onBack: () => void; onDeleted: () => void
}) {
  const [r, setR] = useState<Rollout | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState('')

  const reload = useCallback(async () => {
    const list = await loadRollouts()
    setR(list.find(x => x.id === rolloutId) ?? null)
  }, [rolloutId])

  useEffect(() => {
    void reload()
    const t = setInterval(() => { void reload() }, 15000)
    return () => clearInterval(t)
  }, [reload])

  async function runNow() {
    if (running) return
    setRunning(true); setMsg('Rollout läuft — PCs werden gescannt und aktualisiert…')
    const res = await runRolloutNow(rolloutId, by)
    setMsg(res.summary)
    await reload()
    setRunning(false)
  }

  async function exportReport() {
    if (!r) return
    const results = Object.values(r.targets).map(t => t.result).filter((x): x is HpDeployResult => !!x)
    if (!results.length) { setMsg('Noch keine PCs mit eingespielten Treibern für den Report.'); return }
    await exportHpDriverReport(results, by)
  }

  async function remove() {
    if (!r) return
    await deleteRollout(r.id)
    onDeleted()
  }

  if (!r) return <div className="p-6 text-sm text-muted-foreground">Rollout wird geladen…</div>
  const c = countRollout(r)
  const targets = Object.values(r.targets).sort((a, b) => a.hostname.localeCompare(b.hostname))

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"><ArrowLeft size={12} />Zurück</button>
        <div className="min-w-0">
          <div className="text-sm font-bold text-foreground truncate">{r.name}</div>
          <div className="text-[11px] text-muted-foreground">{describeSchedule(r.schedule)} · {r.rebootMode === 'reboot' ? 'Neustart' : 'nur Hinweis'}{r.notifyUser ? ' · Benutzer-Nachricht' : ''} · Status {r.status}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void reload()} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"><RefreshCw size={13} />Aktualisieren</button>
          <button onClick={() => void runNow()} disabled={running} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50">{running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}Jetzt ausführen</button>
          <button onClick={() => void exportReport()} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"><FileDown size={13} />Report</button>
          <button onClick={() => void remove()} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-red-500/40 text-red-300 hover:bg-red-500/10"><Trash2 size={13} />Löschen</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {/* Zähler */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">{c.done} fertig</span>
          <span className="px-2 py-1 rounded-full bg-muted/40 text-muted-foreground border border-border">{c.pending} offen</span>
          {c.running > 0 && <span className="px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40">{c.running} läuft</span>}
          <span className="px-2 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/40">{c.unreachable} nicht erreicht</span>
          <span className="text-muted-foreground">von {c.total} PC(s)</span>
        </div>
        {msg && <div className="text-xs text-foreground bg-muted/30 border border-border rounded px-2 py-1.5 flex items-center gap-1.5">{running && <Loader2 size={12} className="animate-spin" />}{msg}</div>}

        {/* Tabelle */}
        <div className="rounded-lg border border-border divide-y divide-border/50">
          {targets.map(t => {
            const b = STATUS_BADGE[t.status]
            const isOpen = open.has(t.hostname)
            const installed = t.result?.ergebnisse?.length || 0
            return (
              <div key={t.hostname}>
                <button onClick={() => setOpen(prev => { const n = new Set(prev); n.has(t.hostname) ? n.delete(t.hostname) : n.add(t.hostname); return n })}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/10">
                  {t.result ? (isOpen ? <ChevronDown size={13} className="text-muted-foreground shrink-0" /> : <ChevronRight size={13} className="text-muted-foreground shrink-0" />) : <span className="w-3.5 shrink-0" />}
                  <span className="inline-flex items-center gap-1"><span className="text-sm font-mono font-semibold text-foreground">{t.hostname}</span><DeviceInfoButton hostname={t.hostname} /></span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 ${b.cls}`}><b.Icon size={10} className={t.status === 'in-progress' ? 'animate-spin' : ''} />{b.label}</span>
                  {t.status === 'done' && <span className="text-[11px] text-muted-foreground">{installed > 0 ? `${installed} Treiber` : (t.message || 'keine Updates')}</span>}
                  {t.status === 'unreachable' && <span className="text-[11px] text-muted-foreground truncate">{t.message || 'nicht erreichbar'}</span>}
                  {t.attempts > 0 && <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{t.attempts} Versuch(e)</span>}
                </button>
                {isOpen && t.result && (
                  <div className="px-8 pb-2">
                    <div className="text-[11px] text-muted-foreground mb-1">{t.result.status} · {t.result.message}{t.result.needsReboot ? ' · Neustart nötig' : ''}</div>
                    <div className="rounded border border-border/60 divide-y divide-border/40">
                      {(t.result.ergebnisse || []).map((e, i) => (
                        <div key={i} className="flex items-center gap-2 px-2 py-1 text-[11px]">
                          {e.verifiziert ? <CheckCircle2 size={11} className="text-emerald-400 shrink-0" /> : <AlertTriangle size={11} className="text-amber-400 shrink-0" />}
                          <span className="text-foreground flex-1 min-w-0 truncate" title={e.name}>{e.name}</span>
                          <span className="font-mono text-muted-foreground">{e.vorher || '—'} → {e.nachher || '—'}</span>
                        </div>
                      ))}
                      {(t.result.ergebnisse || []).length === 0 && <div className="px-2 py-1 text-[11px] text-muted-foreground italic">keine Detaildaten</div>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
