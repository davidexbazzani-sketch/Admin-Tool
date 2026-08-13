// ── Remote-Task-Manager (Prozesse + Leistung) ─────────────────────────────────
// Wird sowohl im Geräte-Dossier-Tab als auch im ablösbaren Zweitfenster
// (#taskmgr) verwendet. Live-Poll über WinRM. Prozesse beenden/neustarten (Admin).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader, XCircle, CheckCircle, RefreshCw, Search, Square, AlertTriangle, Cpu,
  MemoryStick, MonitorPlay, Pause, Play, ExternalLink, RotateCcw, ArrowUp, ArrowDown,
} from 'lucide-react'
import { api } from '../../electronAPI'
import { ensureWinRM } from '../../utils/winrmUtils'
import {
  listProcesses, killProcess, restartProcess, getPerformance,
  CRITICAL_PROCS, type ProcInfo, type PerfSnapshot,
} from '../../services/deviceTaskManager'

const POLL_MS = 2500

type SortKey = 'name' | 'pid' | 'cpuPct' | 'memMB'

export function DeviceTaskManager({ hostname, isAdmin, inWindow }: { hostname: string; isAdmin: boolean; inWindow?: boolean }) {
  const [sub, setSub] = useState<'procs' | 'perf'>('procs')
  const [paused, setPaused] = useState(false)
  const [winrmChecking, setWinrmChecking] = useState(true)
  const [winrmOk, setWinrmOk] = useState<boolean | null>(null)
  const isMounted = useRef(true)

  // Prozesse
  const [procs, setProcs] = useState<ProcInfo[]>([])
  const [procsErr, setProcsErr] = useState('')
  const [procsLoading, setProcsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('cpuPct')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [busyPid, setBusyPid] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [confirmKill, setConfirmKill] = useState<ProcInfo | null>(null)

  // Leistung
  const [perf, setPerf] = useState<PerfSnapshot | null>(null)
  const [perfLoading, setPerfLoading] = useState(true)
  const [perfSel, setPerfSel] = useState<'cpu' | 'ram' | 'gpu'>('cpu')

  useEffect(() => { isMounted.current = true; return () => { isMounted.current = false } }, [])

  useEffect(() => {
    setWinrmChecking(true)
    ensureWinRM(hostname).then(ok => { if (isMounted.current) { setWinrmOk(ok); setWinrmChecking(false) } })
  }, [hostname])

  const loadProcs = useCallback(async () => {
    const r = await listProcesses(hostname)
    if (!isMounted.current) return
    if (r.ok) { setProcs(r.items); setProcsErr('') } else { setProcsErr(r.error || 'Fehler') }
    setProcsLoading(false)
  }, [hostname])

  const loadPerf = useCallback(async () => {
    const r = await getPerformance(hostname)
    if (!isMounted.current) return
    setPerf(r); setPerfLoading(false)
  }, [hostname])

  // Live-Poll je nach Unter-Tab (Muster WidgetRenderer: Ref-Guard + Interval + Cleanup).
  // inFlight verhindert, dass sich langsame WinRM-Abfragen stapeln / überholen.
  const inFlight = useRef(false)
  useEffect(() => {
    if (winrmOk !== true) return
    const load = sub === 'procs' ? loadProcs : loadPerf
    const tick = async () => {
      if (inFlight.current) return
      inFlight.current = true
      try { await load() } finally { inFlight.current = false }
    }
    void tick()
    if (paused) return
    const t = setInterval(() => { void tick() }, POLL_MS)
    return () => clearInterval(t)
  }, [sub, paused, winrmOk, loadProcs, loadPerf])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir(k === 'name' ? 'asc' : 'desc') }
  }

  async function doKill(p: ProcInfo) {
    setConfirmKill(null)
    setBusyPid(p.pid); setMsg('')
    const r = await killProcess(hostname, p.pid)
    if (!isMounted.current) return
    setMsg(r.ok ? `„${p.name}" (PID ${p.pid}) beendet.` : `Konnte „${p.name}" nicht beenden: ${r.message}`)
    if (r.ok) setProcs(prev => prev.filter(x => x.pid !== p.pid))
    setBusyPid(null)
  }
  async function doRestart(p: ProcInfo) {
    if (!window.confirm(`Prozess „${p.name}" (PID ${p.pid}) auf ${hostname} neu starten?`)) return
    setBusyPid(p.pid); setMsg('')
    const r = await restartProcess(hostname, p.pid)
    if (!isMounted.current) return
    setMsg(r.ok ? `„${p.name}" neu gestartet — ${r.message}` : `Neustart fehlgeschlagen: ${r.message}`)
    setBusyPid(null)
    void loadProcs()
  }

  const q = search.trim().toLowerCase()
  const filtered = (q ? procs.filter(p => p.name.toLowerCase().includes(q) || String(p.pid).includes(q)) : procs)
    .slice().sort((a, b) => {
      let d = 0
      if (sortKey === 'name') d = a.name.localeCompare(b.name, 'de')
      else d = (a[sortKey] as number) - (b[sortKey] as number)
      return sortDir === 'asc' ? d : -d
    })

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Kopf: Unter-Tabs + Aktionen */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-border">
        <button onClick={() => setSub('procs')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md ${sub === 'procs' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'}`}><Square size={13} />Prozesse</button>
        <button onClick={() => setSub('perf')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md ${sub === 'perf' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'}`}><Cpu size={13} />Leistung</button>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setPaused(p => !p)} title={paused ? 'Fortsetzen' : 'Pausieren'} className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">{paused ? <Play size={12} /> : <Pause size={12} />}{paused ? 'Auto aus' : 'Live'}</button>
          <button onClick={() => { void (sub === 'procs' ? loadProcs() : loadPerf()) }} title="Aktualisieren" className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"><RefreshCw size={12} /></button>
          {!inWindow && (
            // Reale Admin-Rolle mitgeben (Fenster darf nicht mehr dürfen als der eingebettete Tab);
            // eingebetteten Poller pausieren, damit nicht zwei Poller denselben Host abfragen.
            <button onClick={() => { api().taskmgrOpen({ host: hostname, admin: isAdmin }); setPaused(true) }} title="Task-Manager in eigenem Fenster öffnen (pausiert diese Ansicht)" className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-md border border-border text-foreground hover:bg-accent/30"><ExternalLink size={12} />Als Fenster</button>
          )}
        </div>
      </div>

      {/* WinRM-Status */}
      {winrmChecking && <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 text-[11px] text-blue-400 border-b border-border bg-blue-500/5"><Loader size={11} className="animate-spin" />WinRM wird geprüft…</div>}
      {!winrmChecking && winrmOk === false && <div className="shrink-0 flex items-center gap-2 px-3 py-2 text-xs text-red-400 border-b border-border bg-red-500/5"><XCircle size={12} />WinRM nicht verfügbar — Task-Manager nicht möglich.</div>}

      {winrmOk === true && (<>
        {msg && <div className="shrink-0 px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border bg-muted/10">{msg}</div>}

        {/* ── Prozesse ── */}
        {sub === 'procs' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 px-3 py-2 border-b border-border flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Prozess suchen…" className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              </div>
              <span className="text-[11px] text-muted-foreground">{filtered.length} / {procs.length} Prozesse</span>
            </div>
            <div className="shrink-0 grid grid-cols-[1fr_70px_80px_90px_120px] gap-0 bg-muted/20 border-b border-border px-3">
              <div className="py-2"><SortHead k="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} /></div>
              <div className="py-2 flex justify-end"><SortHead k="pid" label="PID" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} /></div>
              <div className="py-2 flex justify-end"><SortHead k="cpuPct" label="CPU %" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} /></div>
              <div className="py-2 flex justify-end"><SortHead k="memMB" label="RAM MB" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} /></div>
              <div className="py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Aktion</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {procsLoading && procs.length === 0 && <div className="flex items-center gap-2 px-3 py-6 text-xs text-muted-foreground"><Loader size={13} className="animate-spin" />Prozesse werden geladen…</div>}
              {procsErr && procs.length === 0 && <div className="px-3 py-4 text-xs text-red-400">Fehler: {procsErr}</div>}
              {filtered.map(p => (
                <div key={p.pid} className={`grid grid-cols-[1fr_70px_80px_90px_120px] items-center px-3 border-b border-border/40 hover:bg-accent/10 ${busyPid === p.pid ? 'opacity-50' : ''}`}>
                  <div className="py-1.5 text-xs text-foreground truncate flex items-center gap-1.5">{CRITICAL_PROCS.has(p.name) && <AlertTriangle size={10} className="text-amber-400 shrink-0" />}{p.name}</div>
                  <div className="py-1.5 text-[11px] text-muted-foreground font-mono text-right">{p.pid}</div>
                  <div className={`py-1.5 text-[11px] font-mono text-right ${p.cpuPct >= 50 ? 'text-red-300' : p.cpuPct >= 15 ? 'text-amber-300' : 'text-muted-foreground'}`}>{p.cpuPct.toFixed(1)}</div>
                  <div className="py-1.5 text-[11px] text-muted-foreground font-mono text-right">{p.memMB.toFixed(0)}</div>
                  <div className="py-1 flex items-center justify-end gap-1">
                    {isAdmin && (<>
                      <button onClick={() => doRestart(p)} disabled={busyPid !== null} title="Neu starten" className="p-1 rounded text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 disabled:opacity-40"><RotateCcw size={13} /></button>
                      <button onClick={() => setConfirmKill(p)} disabled={busyPid !== null} title="Beenden" className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40"><Square size={13} /></button>
                    </>)}
                  </div>
                </div>
              ))}
              {!procsLoading && filtered.length === 0 && !procsErr && <div className="px-3 py-8 text-center text-xs text-muted-foreground">Keine Prozesse gefunden.</div>}
            </div>
          </div>
        )}

        {/* ── Leistung ── */}
        {sub === 'perf' && (
          <div className="flex-1 min-h-0 grid grid-cols-[200px_1fr]">
            <div className="border-r border-border overflow-y-auto py-1">
              <PerfNavItem icon={<Cpu size={15} />} label="CPU" value={perf?.cpu ? `${perf.cpu.loadPct}%` : '—'} active={perfSel === 'cpu'} onClick={() => setPerfSel('cpu')} />
              <PerfNavItem icon={<MemoryStick size={15} />} label="Arbeitsspeicher" value={perf?.ram ? `${perf.ram.pct}%` : '—'} active={perfSel === 'ram'} onClick={() => setPerfSel('ram')} />
              <PerfNavItem icon={<MonitorPlay size={15} />} label="GPU" value={perf?.gpuUtilPct != null ? `${perf.gpuUtilPct}%` : (perf?.gpus.length ? '—' : '—')} active={perfSel === 'gpu'} onClick={() => setPerfSel('gpu')} />
            </div>
            <div className="overflow-y-auto p-4">
              {perfLoading && !perf && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader size={13} className="animate-spin" />Leistungsdaten werden geladen…</div>}
              {perf && !perf.ok && <div className="text-xs text-red-400">Fehler: {perf.error}</div>}
              {perf?.ok && perfSel === 'cpu' && <CpuDetail perf={perf} />}
              {perf?.ok && perfSel === 'ram' && <RamDetail perf={perf} />}
              {perf?.ok && perfSel === 'gpu' && <GpuDetail perf={perf} />}
            </div>
          </div>
        )}
      </>)}

      {/* Beenden-Bestätigung */}
      {confirmKill && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmKill(null)}>
          <div className={`bg-card rounded-xl p-5 w-[420px] shadow-2xl border ${CRITICAL_PROCS.has(confirmKill.name) ? 'border-amber-500/50' : 'border-border'}`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2"><Square size={15} className="text-red-400" /><h3 className="text-sm font-semibold text-foreground">Prozess beenden</h3></div>
            <p className="text-xs text-muted-foreground mb-2">„<span className="font-semibold text-foreground">{confirmKill.name}</span>" (PID {confirmKill.pid}) auf <span className="font-mono text-foreground">{hostname}</span> wirklich beenden?</p>
            {CRITICAL_PROCS.has(confirmKill.name) && (
              <div className="flex items-start gap-1.5 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 mb-3">
                <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-400">System-Prozess — Beenden kann zu Abmeldung/Instabilität führen.</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmKill(null)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground">Abbrechen</button>
              <button onClick={() => doKill(confirmKill)} className="px-4 py-2 text-sm rounded-md text-white bg-red-600 hover:bg-red-700">Beenden</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SortHead({ k, label, align, sortKey, sortDir, onSort }: { k: SortKey; label: string; align?: 'right'; sortKey: SortKey; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void }) {
  return (
    <button onClick={() => onSort(k)} className={`flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground ${align === 'right' ? 'ml-auto' : ''}`}>
      {label}{sortKey === k && (sortDir === 'asc' ? <ArrowUp size={9} /> : <ArrowDown size={9} />)}
    </button>
  )
}

function PerfNavItem({ icon, label, value, active, onClick }: { icon: React.ReactNode; label: string; value: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-l-2 ${active ? 'border-primary bg-accent/30' : 'border-transparent hover:bg-accent/15'}`}>
      <span className={active ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-foreground truncate">{label}</div>
        <div className="text-[11px] text-muted-foreground">{value}</div>
      </div>
    </button>
  )
}

function Bar({ pct, warnAt = 75, critAt = 90 }: { pct: number; warnAt?: number; critAt?: number }) {
  const p = Math.max(0, Math.min(100, pct))
  const color = p >= critAt ? 'bg-red-500' : p >= warnAt ? 'bg-amber-500' : 'bg-green-500'
  return <div className="h-2 rounded-full bg-muted/40 overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${p}%` }} /></div>
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-start gap-2 py-1"><span className="text-xs text-muted-foreground w-40 shrink-0">{label}</span><span className="text-sm text-foreground min-w-0 flex-1 break-words">{value}</span></div>
}

function CpuDetail({ perf }: { perf: PerfSnapshot }) {
  const c = perf.cpu
  if (!c) return <p className="text-xs text-muted-foreground">Keine CPU-Daten.</p>
  return (
    <div className="space-y-3">
      <div><div className="flex items-baseline justify-between mb-1"><h3 className="text-sm font-semibold text-foreground">CPU</h3><span className="text-2xl font-bold text-foreground">{c.loadPct}%</span></div><Bar pct={c.loadPct} /></div>
      <Row label="Modell" value={c.model} />
      <Row label="Kerne" value={`${c.cores} physisch · ${c.logical} logisch`} />
      <Row label="Max. Takt" value={`${(c.maxClockMhz / 1000).toFixed(2)} GHz`} />
      <Row label="Auslastung" value={`${c.loadPct} %`} />
    </div>
  )
}
function RamDetail({ perf }: { perf: PerfSnapshot }) {
  const r = perf.ram
  if (!r) return <p className="text-xs text-muted-foreground">Keine RAM-Daten.</p>
  return (
    <div className="space-y-3">
      <div><div className="flex items-baseline justify-between mb-1"><h3 className="text-sm font-semibold text-foreground">Arbeitsspeicher</h3><span className="text-2xl font-bold text-foreground">{r.pct}%</span></div><Bar pct={r.pct} /></div>
      <Row label="Belegt / Gesamt" value={`${r.usedGB} GB / ${r.totalGB} GB`} />
      <Row label="Frei" value={`${r.freeGB} GB`} />
      <Row label="Steckplätze" value={`${r.slotsUsed} von ${r.slotsTotal} belegt`} />
      {r.modules.length > 0 && (
        <div className="pt-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Module</p>
          <div className="space-y-1">
            {r.modules.map((m, i) => (
              <div key={i} className="text-xs text-foreground flex items-center gap-2 flex-wrap border-b border-border/40 py-1">
                <span className="font-mono text-muted-foreground">{m.slot || `#${i + 1}`}</span>
                <span>{m.sizeGB} GB</span>
                {m.speed > 0 && <span className="text-muted-foreground">{m.speed} MHz</span>}
                {m.manufacturer && <span className="text-muted-foreground">{m.manufacturer}</span>}
                {m.partNumber && <span className="text-muted-foreground/70 font-mono text-[10px]">{m.partNumber}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
function GpuDetail({ perf }: { perf: PerfSnapshot }) {
  if (!perf.gpus.length) return <p className="text-xs text-muted-foreground">Keine GPU erkannt.</p>
  return (
    <div className="space-y-4">
      {perf.gpuUtilPct != null && (
        <div><div className="flex items-baseline justify-between mb-1"><h3 className="text-sm font-semibold text-foreground">GPU-Auslastung (gesamt)</h3><span className="text-2xl font-bold text-foreground">{perf.gpuUtilPct}%</span></div><Bar pct={perf.gpuUtilPct} /></div>
      )}
      {perf.gpuUtilPct == null && <p className="text-[11px] text-amber-400 inline-flex items-center gap-1"><AlertTriangle size={11} />GPU-Auslastung auf diesem Gerät nicht verfügbar.</p>}
      {perf.gpus.map((g, i) => (
        <div key={i} className="rounded-lg border border-border bg-background p-3 space-y-1">
          <p className="text-sm font-semibold text-foreground">{g.name}</p>
          <Row label="VRAM" value={g.vram === 'N/A' ? 'unbekannt' : g.vram} />
          <Row label="Treiberversion" value={g.driver || '—'} />
          {g.videoMode && <Row label="Anzeigemodus" value={g.videoMode} />}
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground">Hinweis: VRAM per WMI ist bei &gt; 4 GB technisch gedeckelt und kann zu niedrig angezeigt werden.</p>
    </div>
  )
}
