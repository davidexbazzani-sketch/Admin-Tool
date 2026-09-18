// ── Support Tools · Deinstallation ───────────────────────────────────────────
// Programm auf einem Remote-PC vollständig entfernen. Ablauf:
//   Host → Scannen → Programm wählen → Vorschau (was wird entfernt?) → Bestätigen → Bericht.
// Read-only bis zur ausdrücklichen Bestätigung; Ausführung mit Schutzschranken im Service.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft, Trash2, Search, Loader2, RefreshCw, AlertTriangle, Check, X, Wifi,
  Folder, KeyRound, Cog, CalendarClock, Link2, PackageX, History, ChevronRight, ShieldAlert,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { DeviceInfoButton } from '../device/DeviceDossier'
import WinRMActivationModal from '../WinRMActivationModal'
import { getPsExecDir } from '../../utils/remoteCommands'
import { clearWinRMCache } from '../../utils/winrmUtils'
import {
  scanPrograms, previewUninstall, runUninstall, listUninstalls, loadUninstall,
  type InstalledProgram, type RemovalItem, type RemovalKind, type UninstallPreview,
  type UninstallReport, type UninstallIndexEntry,
} from '../../services/supportTools/uninstall'

const itemKey = (it: RemovalItem) => `${it.kind}::${it.path.toLowerCase()}`

const KIND_META: Record<RemovalKind, { label: string; icon: React.ReactNode }> = {
  folder: { label: 'Ordner & Dateien', icon: <Folder size={14} className="text-amber-400" /> },
  regkey: { label: 'Registry-Schlüssel', icon: <KeyRound size={14} className="text-purple-400" /> },
  service: { label: 'Dienste', icon: <Cog size={14} className="text-blue-400" /> },
  task: { label: 'Geplante Aufgaben', icon: <CalendarClock size={14} className="text-cyan-400" /> },
  shortcut: { label: 'Verknüpfungen', icon: <Link2 size={14} className="text-emerald-400" /> },
}
const KIND_ORDER: RemovalKind[] = ['folder', 'regkey', 'service', 'task', 'shortcut']

function fmtDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso); if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Deinstallation({ onBack }: { onBack: () => void }) {
  const user = useAuthStore(s => s.session?.user)
  const currentUser = user?.displayName || user?.username || 'unbekannt'

  const [host, setHost] = useState('')
  const [scannedHost, setScannedHost] = useState('')
  const [scanning, setScanning] = useState(false)
  const [programs, setPrograms] = useState<InstalledProgram[]>([])
  const [scanMsg, setScanMsg] = useState('')
  const [error, setError] = useState('')
  const [activateHost, setActivateHost] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [selected, setSelected] = useState<InstalledProgram | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<UninstallPreview | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [runUninstallStep, setRunUninstallStep] = useState(true)

  const [executing, setExecuting] = useState(false)
  const [report, setReport] = useState<UninstallReport | null>(null)

  const [history, setHistory] = useState<UninstallIndexEntry[]>([])
  const [histOpen, setHistOpen] = useState(false)

  useEffect(() => { void listUninstalls().then(setHistory) }, [report])

  const progKeyOf = (p: InstalledProgram) => `${p.name}|${p.version}|${p.hive}`

  async function doScan(h?: string) {
    const target = (h ?? host).trim()
    if (!target || scanning) return
    setScanning(true); setError(''); setScanMsg(''); setPrograms([]); setSelected(null); setPreview(null); setReport(null)
    try {
      const r = await scanPrograms(target)
      if (!r.ok) {
        setError(r.error || 'Scan fehlgeschlagen.')
        if (r.unreachable) setActivateHost(target)
        return
      }
      setPrograms(r.programs)
      setScannedHost(target.toUpperCase())
      setScanMsg(`${r.programs.length} Programm(e) auf ${target.toUpperCase()} gefunden.`)
    } catch (e) {
      setError('Scan fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setScanning(false) }
  }

  async function doPreview(p: InstalledProgram) {
    setSelected(p); setPreview(null); setReport(null); setError(''); setPreviewing(true)
    try {
      const pv = await previewUninstall(scannedHost, p)
      if (!pv.ok) { setError(pv.error || 'Vorschau fehlgeschlagen.'); setPreviewing(false); return }
      setPreview(pv)
      // Vorauswahl: nur sichere Produkt-Treffer
      setChecked(new Set(pv.items.filter(it => it.match === 'product').map(itemKey)))
      setRunUninstallStep(true)
    } catch (e) {
      setError('Vorschau fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setPreviewing(false) }
  }

  async function doExecute() {
    if (!selected || !preview || executing) return
    setExecuting(true); setError('')
    try {
      const items = preview.items.filter(it => checked.has(itemKey(it)))
      const r = await runUninstall(scannedHost, selected, items, runUninstallStep, currentUser)
      if (!r.ok || !r.report) { setError(r.error || 'Ausführung fehlgeschlagen.'); return }
      setReport(r.report)
      // Programm aus der Liste entfernen, wenn Deinstaller bestätigt hat
      if (r.report.uninstallOk) setPrograms(prev => prev.filter(x => progKeyOf(x) !== progKeyOf(selected)))
      setPreview(null); setSelected(null)
    } catch (e) {
      setError('Ausführung fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setExecuting(false) }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return programs
    return programs.filter(p => p.name.toLowerCase().includes(q) || (p.publisher || '').toLowerCase().includes(q))
  }, [programs, search])

  const grouped = useMemo(() => {
    const m = new Map<RemovalKind, RemovalItem[]>()
    for (const it of preview?.items ?? []) { if (!m.has(it.kind)) m.set(it.kind, []); m.get(it.kind)!.push(it) }
    return m
  }, [preview])

  const checkedCount = useMemo(() => (preview?.items ?? []).filter(it => checked.has(itemKey(it))).length, [preview, checked])

  const toggle = (it: RemovalItem) => setChecked(prev => { const n = new Set(prev); const k = itemKey(it); n.has(k) ? n.delete(k) : n.add(k); return n })
  const setAll = (val: boolean) => setChecked(val ? new Set((preview?.items ?? []).map(itemKey)) : new Set())

  return (
    <div className="relative flex flex-col h-full bg-background">
      {/* Kopf */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="p-1 rounded text-muted-foreground hover:bg-accent/40"><ChevronLeft size={16} /></button>
        <Trash2 className="text-red-400" size={20} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Deinstallation · Programm komplett entfernen</h1>
          <p className="text-[11px] text-muted-foreground">Deinstalliert ein Programm auf einem PC und räumt alle Reste weg (Ordner + Registry) – nach Vorschau.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setHistOpen(o => !o)} title="Verlauf früherer Deinstallationen"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border ${histOpen ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-foreground hover:bg-accent/40'}`}>
            <History size={14} />Verlauf
          </button>
        </div>
      </div>

      {/* Host-Eingabe */}
      <div className="shrink-0 flex items-center gap-2 px-5 py-2.5 border-b border-border bg-muted/5 flex-wrap">
        <label className="text-xs text-muted-foreground">Ziel-PC:</label>
        <input value={host} onChange={e => setHost(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void doScan() }}
          placeholder="Hostname oder IP" className="w-56 px-2.5 py-1.5 rounded-md bg-card border border-border text-sm font-mono" />
        <button onClick={() => void doScan()} disabled={scanning || !host.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}Scannen
        </button>
        {scannedHost && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-mono ml-1">{scannedHost}<DeviceInfoButton hostname={scannedHost} /></span>}
        {programs.length > 0 && (
          <div className="relative ml-auto w-56">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Programm filtern…" className="w-full pl-6 pr-2 py-1 rounded-md bg-card border border-border text-xs" />
          </div>
        )}
      </div>

      {scanMsg && !error && <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs shrink-0 flex items-center gap-2"><Check size={13} />{scanMsg}<button onClick={() => setScanMsg('')} className="ml-auto text-muted-foreground hover:text-foreground"><X size={12} /></button></div>}
      {error && <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0 flex items-center gap-2"><AlertTriangle size={13} />{error}{activateHost && <button onClick={() => setActivateHost(activateHost)} className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded border border-red-500/40 hover:bg-red-500/10"><Wifi size={11} />WinRM aktivieren</button>}</div>}

      {/* Inhalt: Liste links, Detail rechts */}
      <div className="flex-1 min-h-0 flex">
        {/* Programm-Liste */}
        <div className="w-1/2 min-w-[320px] border-r border-border overflow-y-auto">
          {scanning ? (
            <div className="flex items-center justify-center h-full text-muted-foreground gap-2 py-16"><Loader2 size={16} className="animate-spin" />Programme werden gelesen…</div>
          ) : programs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-16 px-6 text-center">
              <PackageX size={40} className="opacity-30" />
              <p className="text-sm">Hostname oben eingeben und „Scannen". Dann erscheint hier die Liste der installierten Programme.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {filtered.map(p => {
                const isSel = selected && progKeyOf(selected) === progKeyOf(p)
                return (
                  <li key={progKeyOf(p)}>
                    <button onClick={() => void doPreview(p)}
                      className={`w-full text-left px-4 py-2.5 flex items-start gap-2 hover:bg-accent/20 ${isSel ? 'bg-primary/10' : ''}`}>
                      <PackageX size={15} className={`mt-0.5 shrink-0 ${isSel ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-foreground truncate">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{[p.publisher, p.version].filter(Boolean).join(' · ') || '—'}{p.hive === 'user' ? ' · nur dieser Benutzer' : p.hive === 'machine32' ? ' · 32-bit' : ''}</div>
                      </div>
                      {isSel && <ChevronRight size={14} className="text-primary mt-1 shrink-0" />}
                    </button>
                  </li>
                )
              })}
              {filtered.length === 0 && <li className="px-4 py-6 text-xs text-muted-foreground text-center">Kein Programm passt zum Filter.</li>}
            </ul>
          )}
        </div>

        {/* Detail / Vorschau / Bericht */}
        <div className="flex-1 overflow-y-auto">
          {report ? (
            <ReportView report={report} onClose={() => setReport(null)} />
          ) : previewing ? (
            <div className="flex items-center justify-center h-full text-muted-foreground gap-2 py-16"><Loader2 size={16} className="animate-spin" />Ermittle alle Reste auf {scannedHost}…</div>
          ) : preview && selected ? (
            <div className="p-4">
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <Trash2 size={16} className="text-red-400" />
                  <h2 className="text-sm font-semibold text-foreground">{selected.name}</h2>
                  <span className="text-[11px] text-muted-foreground">{[selected.publisher, selected.version].filter(Boolean).join(' · ')}</span>
                </div>
              </div>

              {/* Warnhinweis */}
              <div className="mb-3 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] flex items-start gap-2">
                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                <span>Die unten <b>angehakten</b> Objekte werden auf <b>{scannedHost}</b> endgültig entfernt. Gelb markierte Treffer passen nur zum <b>Hersteller</b> und könnten von anderer Software genutzt werden – standardmäßig nicht angehakt. System-/Windows-Pfade werden zur Sicherheit immer übersprungen.</span>
              </div>

              {/* Deinstaller-Schritt */}
              <label className="mb-3 flex items-start gap-2 px-3 py-2 rounded-md border border-border bg-card cursor-pointer">
                <input type="checkbox" checked={runUninstallStep} onChange={e => setRunUninstallStep(e.target.checked)} className="mt-0.5" />
                <span className="text-xs">
                  <span className="text-foreground font-medium">Hersteller-Deinstaller ausführen</span>
                  <span className="block text-[11px] text-muted-foreground font-mono mt-0.5 break-all">{preview.uninstallCmd || '(kein Deinstaller-Befehl gefunden – dann nur Reste entfernen)'}</span>
                </span>
              </label>

              {/* Aktionsleiste */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[11px] text-muted-foreground">{checkedCount} von {preview.items.length} Objekten ausgewählt</span>
                <button onClick={() => setAll(true)} className="text-[11px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent/30">Alle</button>
                <button onClick={() => setAll(false)} className="text-[11px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent/30">Keine</button>
                <button onClick={() => setChecked(new Set(preview.items.filter(it => it.match === 'product').map(itemKey)))} className="text-[11px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent/30">Nur sichere</button>
                <button onClick={() => void doExecute()} disabled={executing || (!runUninstallStep && checkedCount === 0)}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50">
                  {executing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}Endgültig entfernen
                </button>
              </div>

              {/* Objekte gruppiert */}
              {preview.items.length === 0 ? (
                <div className="px-3 py-6 text-xs text-muted-foreground text-center border border-dashed border-border rounded-md">Keine zusätzlichen Reste gefunden. Nur der Hersteller-Deinstaller läuft.</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {KIND_ORDER.filter(k => grouped.has(k)).map(k => (
                    <div key={k}>
                      <div className="flex items-center gap-1.5 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{KIND_META[k].icon}{KIND_META[k].label} <span className="text-muted-foreground/60">({grouped.get(k)!.length})</span></div>
                      <div className="flex flex-col gap-1">
                        {grouped.get(k)!.map(it => {
                          const on = checked.has(itemKey(it))
                          const pub = it.match === 'publisher'
                          return (
                            <label key={itemKey(it)} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-md border cursor-pointer text-xs ${on ? 'border-red-500/40 bg-red-500/5' : pub ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-card'}`}>
                              <input type="checkbox" checked={on} onChange={() => toggle(it)} className="mt-0.5" />
                              <span className="min-w-0 flex-1">
                                <span className="text-foreground">{it.label}</span>
                                {pub && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">Hersteller-Treffer</span>}
                                <span className="block text-[10px] text-muted-foreground font-mono break-all">{it.path}{it.detail ? `  ·  ${it.detail}` : ''}</span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-16 px-6 text-center">
              <Trash2 size={40} className="opacity-20" />
              <p className="text-sm">{programs.length > 0 ? 'Links ein Programm wählen – dann werden alle betroffenen Objekte zur Vorschau ermittelt.' : 'Noch kein Scan.'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Verlauf-Panel */}
      {histOpen && <HistoryPanel history={history} onClose={() => setHistOpen(false)} onOpen={r => { setReport(r); setHistOpen(false) }} />}

      {/* WinRM aktivieren */}
      {activateHost && (
        <WinRMActivationModal
          hostname={activateHost}
          psExecPath={getPsExecDir()}
          onSuccess={() => { const h = activateHost; setActivateHost(null); clearWinRMCache(h || undefined); if (h) void doScan(h) }}
          onRestricted={() => { setError(`WinRM ließ sich auf ${activateHost} nicht aktivieren. Ohne WinRM ist keine Deinstallation möglich.`); setActivateHost(null) }}
          onCancel={() => setActivateHost(null)}
        />
      )}
    </div>
  )
}

// ── Bericht ──────────────────────────────────────────────────────────────────
function ReportView({ report, onClose }: { report: UninstallReport; onClose: () => void }) {
  const okN = report.log.filter(l => l.ok).length
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-1">
        {report.uninstallOk || !report.uninstallRun ? <Check size={16} className="text-emerald-400" /> : <AlertTriangle size={16} className="text-amber-400" />}
        <h2 className="text-sm font-semibold text-foreground">Bericht: {report.program}{report.version ? ` (${report.version})` : ''}</h2>
        <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground"><X size={14} /></button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        {report.host} · {fmtDateTime(report.ranAt)} · {report.ranBy} · {report.uninstallRun ? (report.uninstallOk ? 'Deinstaller: entfernt' : 'Deinstaller: nicht bestätigt') : 'Deinstaller übersprungen'} · Reste {okN}/{report.log.length} bereinigt
      </p>
      <div className="flex flex-col gap-1">
        {report.log.map((l, i) => (
          <div key={i} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-md border text-xs ${l.ok ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
            {l.ok ? <Check size={13} className="text-emerald-400 mt-0.5 shrink-0" /> : <X size={13} className="text-red-400 mt-0.5 shrink-0" />}
            <span className="min-w-0 flex-1">
              <span className="text-foreground">{l.label}</span>
              {l.info && <span className="block text-[10px] text-muted-foreground font-mono break-all">{l.info}</span>}
            </span>
          </div>
        ))}
        {report.log.length === 0 && <div className="text-xs text-muted-foreground">Keine Objekte verarbeitet.</div>}
      </div>
    </div>
  )
}

// ── Verlauf ──────────────────────────────────────────────────────────────────
function HistoryPanel({ history, onClose, onOpen }: { history: UninstallIndexEntry[]; onClose: () => void; onOpen: (r: UninstallReport) => void }) {
  const [loading, setLoading] = useState('')
  async function open(e: UninstallIndexEntry) {
    setLoading(e.id)
    try { const r = await loadUninstall(e.pfad); if (r) onOpen(r) } finally { setLoading('') }
  }
  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-[420px] max-w-full h-full bg-background border-l border-border shadow-xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-background border-b border-border px-4 py-3 flex items-center gap-2">
          <History size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Verlauf</h3>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground"><X size={15} /></button>
        </div>
        {history.length === 0 ? (
          <div className="p-6 text-xs text-muted-foreground text-center">Noch keine Deinstallationen protokolliert.</div>
        ) : (
          <ul className="divide-y divide-border/40">
            {history.map(e => (
              <li key={e.id}>
                <button onClick={() => void open(e)} className="w-full text-left px-4 py-2.5 hover:bg-accent/20 flex items-start gap-2">
                  {loading === e.id ? <Loader2 size={14} className="animate-spin mt-0.5 text-primary" /> : <PackageX size={14} className="mt-0.5 text-muted-foreground shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground truncate">{e.program}{e.version ? ` (${e.version})` : ''}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{e.host} · {fmtDateTime(e.ranAt)} · {e.ranBy} · {e.ok}/{e.total} bereinigt</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
