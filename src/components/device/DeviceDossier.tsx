// ── Geräte-Dossier: globaler Info-Button + grosse Übersicht ──────────────────
// <DeviceDossierProvider> einmal um die App legen. Überall wo ein Hostname steht:
//   <DeviceInfoButton hostname={pcName} serial={optionaleSeriennr} />
// Klick öffnet EIN gemeinsames Fenster mit ALLEN Geräte-Infos (Stammdaten:
// AD/Inventar/Software/ServiceNow) + Notizen/Dateien + Direktsprüngen zu
// Daylis, Remote Doc und Abfrage.

import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import {
  Info, X, Loader2, Upload, Paperclip, Trash2, ExternalLink, FileText, MonitorSmartphone,
  Plus, Zap, ListTree, Terminal, Radio, Search, Check, ChevronDown, ChevronRight, Cpu,
} from 'lucide-react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { useAppStore } from '../../store/appStore'
import { useMapIntentStore } from '../../store/mapIntentStore'
import type { DeviceEntry, Screen } from '../../types'
import {
  loadDeviceDossier, emptyDeviceDossier, deviceKey, canonicalHost,
  pickAndStoreDeviceFiles, openDeviceFile, deleteDeviceFile, formatFileSize, logDeviceAction,
  addDeviceEntry, deleteDeviceEntry,
  type DeviceDossier, type DeviceDossierEntry, type DossierFile,
} from '../../services/deviceDossier'
import { ALL_DAILY_COMMANDS, type DailyCommand } from '../../services/dailyCommands'
import { DeviceMasterData } from './DeviceMasterData'
import { DeviceTaskManager } from './DeviceTaskManager'

interface DeviceDossierCtx { open: (hostname: string, serial?: string) => void }
const DeviceDossierContext = createContext<DeviceDossierCtx | null>(null)

/** Kleiner Info-Button hinter einem Hostnamen. Rendert nichts ohne Hostname/Provider. */
export function DeviceInfoButton({ hostname, serial, className, size = 12 }: { hostname?: string | null; serial?: string; className?: string; size?: number }) {
  const ctx = useContext(DeviceDossierContext)
  const h = (hostname || '').trim()
  if (!ctx || !h) return null
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); e.preventDefault(); ctx.open(h, serial) }}
      title={`Infos & Aktionen zu ${h}`}
      className={className ?? 'inline-flex items-center justify-center shrink-0 p-0.5 rounded text-muted-foreground/70 hover:text-blue-400 hover:bg-blue-500/10'}
    >
      <Info size={size} />
    </button>
  )
}

export function DeviceDossierProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<{ hostname: string; serial?: string } | null>(null)
  const open = useCallback((hostname: string, serial?: string) => setTarget({ hostname, serial }), [])
  return (
    <DeviceDossierContext.Provider value={{ open }}>
      {children}
      {target && <DeviceDossierModal hostname={target.hostname} serial={target.serial} onClose={() => setTarget(null)} />}
    </DeviceDossierContext.Provider>
  )
}

function fmtDateTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function newId(): string { return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7) }

function DeviceDossierModal({ hostname, serial, onClose }: { hostname: string; serial?: string; onClose: () => void }) {
  const authUser = useAuthStore(s => s.session?.user)
  const currentUser = authUser?.displayName || authUser?.username || 'unbekannt'
  const setDevices = useAppStore(s => s.setDevices)
  const setScreen = useAppStore(s => s.setScreen)
  const isAdmin = useIsAdmin()
  const display = canonicalHost(hostname)

  const [dossier, setDossier] = useState<DeviceDossier | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [newText, setNewText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<DossierFile[]>([])
  const [tab, setTab] = useState<'info' | 'notes' | 'daylis' | 'tasks'>('info')
  const key = deviceKey(hostname)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const d = await loadDeviceDossier(hostname)
      if (!cancelled) { setDossier(d ?? emptyDeviceDossier(hostname, serial)); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [hostname, serial])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  // Beim Wechsel auf den Notizen-Tab den aktuellen Stand neu laden — so tauchen
  // die im Daylis-Tab automatisch protokollierten Eingriffe sofort auf.
  useEffect(() => {
    if (tab !== 'notes') return
    let cancelled = false
    loadDeviceDossier(hostname).then(d => { if (!cancelled && d) setDossier(d) })
    return () => { cancelled = true }
  }, [tab, hostname])

  async function attachPending() {
    setBusy(true)
    try {
      const added = await pickAndStoreDeviceFiles(key, currentUser)
      if (added.length) setPendingFiles(prev => [...prev, ...added])
    } finally { setBusy(false) }
  }
  async function removePending(id: string) {
    const f = pendingFiles.find(x => x.id === id)
    if (f) await deleteDeviceFile(f.path)
    setPendingFiles(prev => prev.filter(x => x.id !== id))
  }
  async function addEntry() {
    if (!dossier) return
    const text = newText.trim()
    if (!text && pendingFiles.length === 0) return
    setBusy(true)
    try {
      const entry: DeviceDossierEntry = { id: newId(), text, createdAt: new Date().toISOString(), createdBy: currentUser, files: pendingFiles }
      // Frischer Read-Modify-Write (serialisiert) — überschreibt keine parallel
      // protokollierten Eingriffe aus dem Daylis-Tab.
      const updated = await addDeviceEntry(hostname, dossier.serial || serial, entry, currentUser)
      setDossier(updated)
      setNewText(''); setPendingFiles([])
    } finally { setBusy(false) }
  }
  async function deleteEntry(id: string) {
    if (!dossier) return
    if (!window.confirm('Diesen Eintrag inkl. Anhängen wirklich löschen?')) return
    setBusy(true)
    try {
      const entry = dossier.entries.find(e => e.id === id)
      if (entry) for (const f of entry.files) await deleteDeviceFile(f.path)
      const updated = await deleteDeviceEntry(hostname, id, currentUser)
      setDossier(updated)
    } finally { setBusy(false) }
  }

  // ── Direktsprünge (Aktionsleiste) ───────────────────────────────────────────
  function mkDevice(h: string): DeviceEntry {
    return { id: 'dossier-0', type: 'hostname', value: h, resolvedHostnames: [h] }
  }
  function goRemoteDoc() {
    if (busy) return
    setDevices([mkDevice(display)])
    void logDeviceAction(display, dossier?.serial || serial, `Remote Doc geöffnet für ${display}`, currentUser, 'Remote Doc')
    setScreen('remote-doc')
    onClose()
  }
  function goQuery() {
    if (busy) return
    setDevices([mkDevice(display)])
    void logDeviceAction(display, dossier?.serial || serial, `Abfrage geöffnet für ${display}`, currentUser, 'Abfrage')
    setScreen('query-menu')
    onClose()
  }
  function goLocation(screen: Screen, host: string) {
    useMapIntentStore.getState().setIntent({ screen, hostname: host, mode: 'focus' })
    setScreen(screen)
    onClose()
  }

  const entryCount = dossier?.entries.length ?? 0

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Kopf */}
        <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0">
            <MonitorSmartphone size={22} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-foreground truncate font-mono">{display}</h2>
            <p className="text-xs text-muted-foreground">
              Geräte-Dossier · {entryCount} {entryCount === 1 ? 'Eintrag' : 'Einträge'}
              {(dossier?.serial || serial) && <span className="font-mono"> · SN {dossier?.serial || serial}</span>}
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40"><X size={18} /></button>
        </div>

        {/* Aktionsleiste: Direktsprünge */}
        <div className="shrink-0 px-6 py-2.5 border-b border-border bg-muted/5 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">Aktionen</span>
          <button onClick={() => setTab('daylis')} disabled={busy}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border font-semibold disabled:opacity-40 ${tab === 'daylis' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'}`}>
            <Terminal size={13} />Daylis
          </button>
          <button onClick={goRemoteDoc} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30 disabled:opacity-40">
            <Radio size={13} className="text-blue-400" />Remote Doc
          </button>
          <button onClick={goQuery} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30 disabled:opacity-40">
            <Search size={13} className="text-blue-400" />Abfrage
          </button>
        </div>

        {/* Tabs */}
        <div className="shrink-0 px-6 border-b border-border flex items-center gap-1">
          <button type="button" onClick={() => setTab('info')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === 'info' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <ListTree size={13} />Stammdaten
          </button>
          <button type="button" onClick={() => setTab('daylis')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === 'daylis' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Terminal size={13} />Daylis
          </button>
          <button type="button" onClick={() => setTab('tasks')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === 'tasks' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Cpu size={13} />Task-Manager
          </button>
          <button type="button" onClick={() => setTab('notes')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === 'notes' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <FileText size={13} />Notizen &amp; Dateien{entryCount > 0 ? ` (${entryCount})` : ''}
          </button>
        </div>

        {/* Stammdaten */}
        {tab === 'info' && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <DeviceMasterData hostname={display} serial={dossier?.serial || serial} onOpenPerson={() => { /* PersonInfoButton nutzt eigenen Provider */ }} onShowLocation={goLocation} />
          </div>
        )}

        {/* Daylis */}
        {tab === 'daylis' && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <DeviceDaylisPanel hostname={display} serial={dossier?.serial || serial} currentUser={currentUser} />
          </div>
        )}

        {/* Task-Manager (Prozesse + Leistung, live) */}
        {tab === 'tasks' && (
          <div className="flex-1 min-h-0">
            <DeviceTaskManager hostname={display} isAdmin={isAdmin} />
          </div>
        )}

        {/* Notizen */}
        {tab === 'notes' && (<>
          <div className="shrink-0 px-6 py-3 border-b border-border bg-muted/5 space-y-2">
            <textarea value={newText} onChange={e => setNewText(e.target.value)} rows={3}
              placeholder="Neuer Eintrag: Notiz, Vorgang, Rückmeldung…"
              className="w-full px-3 py-2 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary leading-relaxed" />
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pendingFiles.map(f => (
                  <span key={f.id} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border bg-background text-foreground">
                    <Paperclip size={10} className="text-muted-foreground" />{f.name}
                    <button onClick={() => removePending(f.id)} className="text-muted-foreground hover:text-red-400"><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={attachPending} disabled={busy}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30 disabled:opacity-40">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}Dateien anhängen
              </button>
              <span className="text-[11px] text-muted-foreground">Alle Dateitypen · wird mit Datum &amp; deinem Namen gespeichert</span>
              <button onClick={addEntry} disabled={busy || (!newText.trim() && pendingFiles.length === 0)}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
                <Plus size={13} />Eintrag hinzufügen
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm py-16"><Loader2 size={14} className="animate-spin" />Lade Dossier…</div>
            ) : entryCount === 0 ? (
              <div className="text-center py-16 text-sm text-muted-foreground">
                <FileText size={36} className="mx-auto mb-2 opacity-30" />
                Noch keine Einträge. Erfasse oben die erste Notiz oder lade eine Datei hoch.
              </div>
            ) : (
              <div className="space-y-3">
                {dossier!.entries.map(en => (
                  <div key={en.id} className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/10">
                      <span className="text-xs font-semibold text-foreground">{fmtDateTime(en.createdAt)}</span>
                      <span className="text-[11px] text-muted-foreground">· {en.createdBy}</span>
                      {en.kind === 'action' && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30" title="Automatisch protokollierter, ausgeführter Eingriff">
                          <Zap size={9} />Eingriff{en.source ? ` · ${en.source}` : ''}
                        </span>
                      )}
                      <button onClick={() => deleteEntry(en.id)} disabled={busy} title="Eintrag löschen"
                        className="ml-auto p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40"><Trash2 size={13} /></button>
                    </div>
                    {en.text && <p className="px-3 py-2 text-sm text-foreground whitespace-pre-wrap leading-relaxed">{en.text}</p>}
                    {en.files.length > 0 && (
                      <div className="px-3 pb-2 space-y-1">
                        {en.files.map(f => (
                          <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border bg-background">
                            <FileText size={13} className="text-muted-foreground shrink-0" />
                            <span className="text-xs text-foreground truncate flex-1" title={f.name}>{f.name}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">{formatFileSize(f.size)}</span>
                            <button onClick={() => openDeviceFile(f.path)} title="Öffnen" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/30"><ExternalLink size={13} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}
      </div>
    </div>
  )
}

// ── Geräte-Daylis-Panel (host-basierte Befehle direkt aus dem Dossier) ────────
// Zeigt alle Daylis-Befehle, die NUR einen Hostnamen brauchen (requiresHost,
// kein requiresUser). Ausgeführte Schreib-Aktionen werden im Dossier
// protokolliert (logDeviceAction).

function DeviceDaylisPanel({ hostname, serial, currentUser }: { hostname: string; serial?: string; currentUser: string }) {
  const hostCommands = ALL_DAILY_COMMANDS.filter(c => c.requiresHost && !c.requiresUser)
  const reads = hostCommands.filter(c => c.kind === 'read')
  const writes = hostCommands.filter(c => c.kind === 'write')
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Befehle für <span className="font-mono text-foreground">{hostname}</span>. Abfragen zeigen nur Informationen; Aktionen (rot) verändern das Gerät und werden im Dossier protokolliert.
      </p>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Abfragen</p>
        <div className="space-y-1.5">
          {reads.map(c => <DaylisRow key={c.id} cmd={c} hostname={hostname} serial={serial} currentUser={currentUser} />)}
        </div>
      </div>
      {writes.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Aktionen</p>
          <div className="space-y-1.5">
            {writes.map(c => <DaylisRow key={c.id} cmd={c} hostname={hostname} serial={serial} currentUser={currentUser} isWrite />)}
          </div>
        </div>
      )}
    </div>
  )
}

function DaylisRow({ cmd, hostname, serial, currentUser, isWrite }: { cmd: DailyCommand; hostname: string; serial?: string; currentUser: string; isWrite?: boolean }) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [open, setOpen] = useState(false)
  const [params, setParams] = useState<Record<string, string>>({})

  async function run() {
    if (running) return
    if (isWrite && !window.confirm(`Aktion „${cmd.label}" wirklich auf ${hostname} ausführen?`)) return
    setRunning(true); setResult(null); setOpen(true)
    try {
      const r = await cmd.run({ hostname, extra: params })
      setResult(r)
      if (isWrite) {
        void logDeviceAction(hostname, serial, `Daylis: ${cmd.label} → ${r.ok ? 'OK' : 'Fehler'}${r.text ? ' — ' + r.text.slice(0, 200) : ''}`, currentUser, 'Daylis')
      }
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally { setRunning(false) }
  }

  return (
    <div className={`rounded-md border ${isWrite ? 'border-red-500/25' : 'border-border'} bg-background overflow-hidden`}>
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-foreground shrink-0">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-semibold ${isWrite ? 'text-red-300' : 'text-foreground'}`}>{cmd.label}</span>
          <span className="block text-[10px] text-muted-foreground truncate" title={cmd.info}>{cmd.info}</span>
        </div>
        <button onClick={run} disabled={running}
          className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md font-semibold shrink-0 disabled:opacity-40 ${isWrite ? 'bg-red-500/90 text-white hover:bg-red-500' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
          {running ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}Ausführen
        </button>
      </div>
      {open && (
        <div className="px-3 pb-2 space-y-1.5 border-t border-border/50 pt-1.5">
          {cmd.needsParams?.map(p => (
            <input key={p.name} type={p.type === 'password' ? 'password' : 'text'} placeholder={p.label}
              value={params[p.name] ?? ''} onChange={e => setParams(prev => ({ ...prev, [p.name]: e.target.value }))}
              className="w-full px-2 py-1 text-xs rounded bg-card border border-border text-foreground" />
          ))}
          {result && (
            <pre className={`text-[11px] whitespace-pre-wrap break-words max-h-56 overflow-y-auto rounded p-2 ${result.ok ? 'bg-muted/20 text-foreground' : 'bg-red-500/10 text-red-300'}`}>{result.text || (result.ok ? 'OK' : 'Fehler')}</pre>
          )}
          {!result && !running && <p className="text-[10px] text-muted-foreground italic">Noch nicht ausgeführt.</p>}
        </div>
      )}
    </div>
  )
}
