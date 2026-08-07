import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DatabaseBackup, Plus, Play, Pencil, Trash2, Pause, RefreshCw, Loader2, X, Check,
  HardDrive, Server, FolderOpen, Folder, ChevronRight, ArrowUp, AlertTriangle,
  CheckCircle2, Clock, CalendarClock, Network, FolderPlus, ShieldCheck,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { isValidRemoteTarget } from '../utils/remoteTarget'
import {
  listJobs, createJob, updateJob, deleteJob, newId, nextSlotAfter,
  type BackupJob, type BackupSchedule,
} from '../services/backups'
import {
  listRemoteDrives, listRemoteDirs, createRemoteDir, checkTargetReachable,
  registerNativeTask, unregisterNativeTask, queryNativeTask,
  type NativeTaskInfo,
} from '../services/backupEngine'
import { useBackupRunStore } from '../store/backupRunStore'

const WEEKDAYS = [
  { d: 1, label: 'Mo' }, { d: 2, label: 'Di' }, { d: 3, label: 'Mi' }, { d: 4, label: 'Do' },
  { d: 5, label: 'Fr' }, { d: 6, label: 'Sa' }, { d: 0, label: 'So' },
]

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso); return isNaN(d.getTime()) ? '—' : d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

function scheduleSummary(job: BackupJob): string {
  if (!job.scheduled || !job.schedule) return 'Nur manuell'
  const s = job.schedule
  if (s.type === 'once') return `Einmalig am ${s.date} um ${s.time}`
  if (s.repeat === 'weekly') {
    const days = (s.days && s.days.length ? s.days : [1]).map(d => WEEKDAYS.find(w => w.d === d)?.label || d).join(', ')
    return `Wöchentlich (${days}) um ${s.time}`
  }
  return `Täglich um ${s.time}`
}

// ── Remote-Ordner-Browser ─────────────────────────────────────────────────────
function RemoteFolderPicker({ target, mode, selected, onToggle, onPickDest }: {
  target: string
  mode: 'source' | 'dest'
  selected?: string[]
  onToggle?: (fullPath: string) => void
  onPickDest?: (fullPath: string) => void
}) {
  const [drives, setDrives] = useState<string[]>([])
  const [drive, setDrive] = useState('C')
  const [path, setPath] = useState('C:\\')
  const [entries, setEntries] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [newFolder, setNewFolder] = useState('')
  const [creating, setCreating] = useState(false)

  const loadDrives = useCallback(async () => {
    if (!target.trim()) return
    setErr(''); setLoading(true)
    const ds = await listRemoteDrives(target.trim())
    setLoading(false)
    if (ds.length) { setDrives(ds); if (!ds.includes(drive)) { setDrive(ds[0]); setPath(`${ds[0]}:\\`) } }
    else setErr('Keine Laufwerke erreichbar (Admin-Freigabe / Rechte prüfen).')
  }, [target, drive])

  const loadDirs = useCallback(async (p: string) => {
    if (!target.trim()) return
    setErr(''); setLoading(true)
    const r = await listRemoteDirs(target.trim(), p)
    setLoading(false)
    if (r.ok) setEntries(r.dirs)
    else { setEntries([]); setErr(r.error || 'Ordner nicht lesbar') }
  }, [target])

  useEffect(() => { void loadDrives() /* eslint-disable-next-line */ }, [target])
  useEffect(() => { void loadDirs(path) /* eslint-disable-next-line */ }, [path])

  function goInto(name: string) { setPath(p => `${p.replace(/\\+$/, '')}\\${name}`) }
  function goUp() {
    setPath(p => {
      const trimmed = p.replace(/\\+$/, '')
      const idx = trimmed.lastIndexOf('\\')
      if (idx <= 2) return `${drive}:\\`
      return trimmed.slice(0, idx)
    })
  }
  function changeDrive(d: string) { setDrive(d); setPath(`${d}:\\`) }

  async function doCreate() {
    if (!newFolder.trim()) return
    setCreating(true)
    const full = `${path.replace(/\\+$/, '')}\\${newFolder.trim()}`
    const r = await createRemoteDir(target.trim(), full)
    setCreating(false)
    if (r.ok) { setNewFolder(''); await loadDirs(path); if (onPickDest) onPickDest(full) }
    else setErr(r.error || 'Ordner konnte nicht angelegt werden')
  }

  return (
    <div className="rounded-lg border border-border bg-background/60">
      {/* Laufwerk + Pfad */}
      <div className="flex items-center gap-2 p-2 border-b border-border">
        <HardDrive size={14} className="text-muted-foreground shrink-0" />
        <select value={drive} onChange={e => changeDrive(e.target.value)}
          className="text-xs rounded-md bg-background border border-border px-1.5 py-1 text-foreground">
          {(drives.length ? drives : [drive]).map(d => <option key={d} value={d}>{d}$</option>)}
        </select>
        <input value={path} onChange={e => setPath(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') loadDirs(path) }}
          className="flex-1 min-w-0 text-xs font-mono rounded-md bg-background border border-border px-2 py-1 text-foreground" />
        <button onClick={() => loadDirs(path)} title="Laden" className="p-1 rounded hover:bg-accent text-muted-foreground"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        <button onClick={goUp} title="Nach oben" className="p-1 rounded hover:bg-accent text-muted-foreground"><ArrowUp size={13} /></button>
      </div>
      {err && <p className="px-2 py-1 text-[11px] text-amber-300 flex items-center gap-1"><AlertTriangle size={11} />{err}</p>}
      {/* Ordner-Liste */}
      <div className="max-h-52 overflow-y-auto p-1">
        {loading && entries.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground flex items-center gap-1"><Loader2 size={12} className="animate-spin" />Lade…</p>
        ) : entries.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">Keine Unterordner.</p>
        ) : entries.map(name => {
          const full = `${path.replace(/\\+$/, '')}\\${name}`
          const isSel = mode === 'source' && selected?.includes(full)
          return (
            <div key={name} className={`flex items-center gap-2 px-2 py-1 rounded-md hover:bg-accent/30 ${isSel ? 'bg-emerald-500/10' : ''}`}>
              {mode === 'source' && (
                <input type="checkbox" checked={!!isSel} onChange={() => onToggle?.(full)} className="accent-primary" />
              )}
              <button onClick={() => goInto(name)} className="flex items-center gap-1.5 flex-1 min-w-0 text-left text-xs text-foreground">
                <Folder size={13} className="text-amber-400 shrink-0" /><span className="truncate">{name}</span>
                <ChevronRight size={12} className="text-muted-foreground/50 ml-auto shrink-0" />
              </button>
            </div>
          )
        })}
      </div>
      {/* Aktionen */}
      <div className="flex items-center gap-2 p-2 border-t border-border flex-wrap">
        {mode === 'source' ? (
          <button onClick={() => onToggle?.(path.replace(/\\+$/, ''))}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent"><Plus size={12} />Aktuellen Ordner hinzufügen</button>
        ) : (
          <button onClick={() => onPickDest?.(path.replace(/\\+$/, ''))}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"><Check size={12} />Dieses Verzeichnis als Ziel</button>
        )}
        {mode === 'dest' && (
          <div className="flex items-center gap-1">
            <input value={newFolder} onChange={e => setNewFolder(e.target.value)} placeholder="Neuer Ordner…"
              className="w-32 text-[11px] rounded-md bg-background border border-border px-2 py-1 text-foreground" />
            <button onClick={doCreate} disabled={!newFolder.trim() || creating}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40">
              {creating ? <Loader2 size={12} className="animate-spin" /> : <FolderPlus size={12} />}Anlegen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Editor ────────────────────────────────────────────────────────────────────
type Mode = 'now' | 'once' | 'recurring'
interface Draft {
  id?: string
  name: string
  srcTarget: string
  folders: string[]
  destKind: 'local' | 'network'
  destTarget: string
  destPath: string
  mirror: boolean
  mode: Mode
  date: string
  time: string
  repeat: 'daily' | 'weekly'
  days: number[]
}

function emptyDraft(): Draft {
  return { name: '', srcTarget: '', folders: [], destKind: 'local', destTarget: '', destPath: '', mirror: false, mode: 'now', date: '', time: '20:00', repeat: 'daily', days: [1] }
}
function draftFromJob(j: BackupJob): Draft {
  const s = j.schedule
  return {
    id: j.id, name: j.name, srcTarget: j.source.target, folders: [...j.source.folders],
    destKind: j.dest.kind, destTarget: j.dest.target || '', destPath: j.dest.path,
    mirror: j.mirror,
    mode: !j.scheduled ? 'now' : (s?.type === 'once' ? 'once' : 'recurring'),
    date: s?.date || '', time: s?.time || '20:00', repeat: s?.repeat || 'daily', days: s?.days || [1],
  }
}

function BackupEditor({ initial, username, onClose, onSaved }: {
  initial: Draft; username: string; onClose: () => void; onSaved: () => void
}) {
  const [d, setD] = useState<Draft>(initial)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const run = useBackupRunStore(s => s.run)

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(p => ({ ...p, [k]: v }))
  const toggleFolder = (full: string) => setD(p => ({ ...p, folders: p.folders.includes(full) ? p.folders.filter(f => f !== full) : [...p.folders, full] }))
  const toggleDay = (day: number) => setD(p => ({ ...p, days: p.days.includes(day) ? p.days.filter(x => x !== day) : [...p.days, day] }))

  const srcValid = isValidRemoteTarget(d.srcTarget)
  const destTargetValid = d.destKind === 'local' || isValidRemoteTarget(d.destTarget)
  // Zielordner MUSS ein absoluter Laufwerkspfad sein (z. B. D:\Backups) — sonst
  // wuerde robocopy relativ ins App-Verzeichnis schreiben.
  const destPathValid = /^[A-Za-z]:[\\/]/.test(d.destPath.trim())
  const foldersValid = d.folders.length > 0 && d.folders.every(f => /^[A-Za-z]:[\\/]/.test(f.trim()))
  const canSave = d.name.trim() && srcValid && foldersValid && destPathValid && destTargetValid
    && (d.mode !== 'once' || (d.date && d.time)) && (d.mode !== 'recurring' || d.time)

  function buildJob(): BackupJob {
    const scheduled = d.mode !== 'now'
    const schedule: BackupSchedule | undefined = !scheduled ? undefined
      : d.mode === 'once'
        ? { type: 'once', date: d.date, time: d.time }
        : { type: 'recurring', repeat: d.repeat, time: d.time, days: d.repeat === 'weekly' ? d.days : undefined }
    const id = d.id || newId()
    const mechanism = d.destKind === 'local' ? 'native' : 'tool'
    return {
      id, name: d.name.trim(),
      source: { target: d.srcTarget.trim(), drive: (d.folders[0]?.slice(0, 1) || 'C'), folders: d.folders },
      dest: { kind: d.destKind, target: d.destKind === 'network' ? d.destTarget.trim() : undefined, drive: (d.destPath.slice(0, 1) || 'C'), path: d.destPath.trim() },
      mirror: d.mirror, scheduled, schedule, mechanism,
      nativeTaskName: `ITAdminBackup_${id}`,
      status: 'active', createdBy: username, createdAt: new Date().toISOString(),
    }
  }

  async function save() {
    setSaving(true); setErr('')
    const job = buildJob()
    // nextDue berechnen
    if (job.scheduled && job.schedule) job.nextDue = nextSlotAfter(job.schedule, new Date())?.toISOString()

    const isEdit = !!d.id
    const res = isEdit ? await updateJob(job.id, job) : await createJob(job)
    if (!res.ok) { setSaving(false); setErr(res.error || 'Speichern fehlgeschlagen.'); return }

    // Native Aufgabe (lokales Ziel) registrieren / bei Netzwerk-Ziel evtl. alte entfernen
    if (job.scheduled && job.mechanism === 'native') {
      const rt = await registerNativeTask(job)
      if (!rt.ok) { setSaving(false); setErr('Job gespeichert, aber native Aufgabe fehlgeschlagen: ' + (rt.error || '')); return }
    } else if (isEdit) {
      // War evtl. vorher nativ → aufräumen
      try { await unregisterNativeTask(job) } catch { /* egal */ }
    }
    setSaving(false)
    onSaved()
    // Sofort ausführen
    if (d.mode === 'now') void run(job, { by: username })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border sticky top-0 bg-card z-10">
          <DatabaseBackup size={18} className="text-blue-400" />
          <h3 className="text-base font-semibold text-foreground">{d.id ? 'Backup bearbeiten' : 'Neues Backup'}</h3>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Name */}
          <div>
            <label className="text-[11px] text-muted-foreground font-medium block mb-1">Name des Backups *</label>
            <input value={d.name} onChange={e => set('name', e.target.value)} placeholder="z.B. Buchhaltung PC01 → Server"
              className="w-full px-2.5 py-1.5 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary" />
          </div>

          {/* Quelle */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><FolderOpen size={14} className="text-amber-400" />Quelle</p>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Quell-PC (Hostname oder IP) *</label>
              <input value={d.srcTarget} onChange={e => set('srcTarget', e.target.value)} placeholder="z.B. DEHAM12345678 oder 10.20.30.40"
                className={`w-full px-2.5 py-1.5 text-sm rounded-md bg-background border text-foreground focus:outline-none ${d.srcTarget && !srcValid ? 'border-red-500/50' : 'border-border focus:border-primary'}`} />
            </div>
            {d.srcTarget && srcValid && (
              <RemoteFolderPicker target={d.srcTarget} mode="source" selected={d.folders} onToggle={toggleFolder} />
            )}
            {d.folders.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {d.folders.map(f => (
                  <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-200 font-mono">
                    {f}<button onClick={() => toggleFolder(f)} className="hover:text-white"><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[10px] text-emerald-300/90 flex items-start gap-1">
              <ShieldCheck size={12} className="mt-0.5 shrink-0" />
              Die Quelle wird ausschließlich <strong>gelesen (kopiert)</strong> — nie verändert, gelöscht oder verschoben.
            </p>
          </div>

          {/* Ziel */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Server size={14} className="text-blue-400" />Ziel</p>
            <div className="flex gap-2">
              <button onClick={() => set('destKind', 'local')} className={`flex-1 px-3 py-2 text-xs rounded-md border ${d.destKind === 'local' ? 'border-primary bg-primary/10 text-foreground font-medium' : 'border-border text-muted-foreground hover:bg-accent/30'}`}>
                <HardDrive size={13} className="inline mr-1" />Gleicher PC (lokal)
              </button>
              <button onClick={() => set('destKind', 'network')} className={`flex-1 px-3 py-2 text-xs rounded-md border ${d.destKind === 'network' ? 'border-primary bg-primary/10 text-foreground font-medium' : 'border-border text-muted-foreground hover:bg-accent/30'}`}>
                <Network size={13} className="inline mr-1" />Anderer PC / Server
              </button>
            </div>
            {d.destKind === 'network' && (
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Ziel-PC (Hostname oder IP) *</label>
                <input value={d.destTarget} onChange={e => set('destTarget', e.target.value)} placeholder="z.B. w3172 oder 10.20.30.50"
                  className={`w-full px-2.5 py-1.5 text-sm rounded-md bg-background border text-foreground focus:outline-none ${d.destTarget && !destTargetValid ? 'border-red-500/50' : 'border-border focus:border-primary'}`} />
              </div>
            )}
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Zielordner (direkt eingeben oder unten wählen) *</label>
              <input value={d.destPath} onChange={e => set('destPath', e.target.value)} placeholder="z.B. D:\\Backups\\PC01"
                className={`w-full px-2.5 py-1.5 text-sm font-mono rounded-md bg-background border text-foreground focus:outline-none ${d.destPath.trim() && !destPathValid ? 'border-red-500/50' : 'border-border focus:border-primary'}`} />
              {d.destPath.trim() && !destPathValid && <p className="text-[10px] text-red-400 mt-1">Bitte einen vollständigen Pfad mit Laufwerksbuchstaben angeben (z. B. D:\\Backups\\PC01) — kein relativer Pfad.</p>}
            </div>
            {(d.destKind === 'local' ? d.srcTarget && srcValid : d.destTarget && destTargetValid) && (
              <RemoteFolderPicker
                target={d.destKind === 'local' ? d.srcTarget : d.destTarget}
                mode="dest"
                onPickDest={p => set('destPath', p)}
              />
            )}
            <label className="flex items-start gap-2 text-[11px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={d.mirror} onChange={e => set('mirror', e.target.checked)} className="mt-0.5 accent-primary shrink-0" />
              <span>Spiegeln (/MIR — löscht <strong>nur im Ziel</strong> Dateien, die in der Quelle entfernt wurden; die <strong>Quelle bleibt unberührt</strong>). Standard: aus (nur neue/geänderte Dateien kopieren).</span>
            </label>
          </div>

          {/* Ausführung */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Clock size={14} className="text-purple-400" />Ausführung</p>
            <div className="flex gap-2 flex-wrap">
              {([['now', 'Sofort', Play], ['once', 'Einmalig (Zeitpunkt)', CalendarClock], ['recurring', 'Wiederkehrend (Job)', RefreshCw]] as const).map(([m, label, Icon]) => (
                <button key={m} onClick={() => set('mode', m)} className={`px-3 py-2 text-xs rounded-md border flex items-center gap-1 ${d.mode === m ? 'border-primary bg-primary/10 text-foreground font-medium' : 'border-border text-muted-foreground hover:bg-accent/30'}`}>
                  <Icon size={13} />{label}
                </button>
              ))}
            </div>
            {d.mode === 'once' && (
              <div className="flex gap-2">
                <label className="text-[11px] text-muted-foreground">Datum<input type="date" value={d.date} onChange={e => set('date', e.target.value)} className="block mt-0.5 px-2 py-1 text-sm rounded-md bg-background border border-border text-foreground" /></label>
                <label className="text-[11px] text-muted-foreground">Uhrzeit<input type="time" value={d.time} onChange={e => set('time', e.target.value)} className="block mt-0.5 px-2 py-1 text-sm rounded-md bg-background border border-border text-foreground" /></label>
              </div>
            )}
            {d.mode === 'recurring' && (
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <select value={d.repeat} onChange={e => set('repeat', e.target.value as 'daily' | 'weekly')} className="text-sm rounded-md bg-background border border-border px-2 py-1 text-foreground">
                    <option value="daily">Täglich</option><option value="weekly">Wöchentlich</option>
                  </select>
                  <label className="text-[11px] text-muted-foreground">Uhrzeit<input type="time" value={d.time} onChange={e => set('time', e.target.value)} className="block mt-0.5 px-2 py-1 text-sm rounded-md bg-background border border-border text-foreground" /></label>
                </div>
                {d.repeat === 'weekly' && (
                  <div className="flex gap-1">
                    {WEEKDAYS.map(w => (
                      <button key={w.d} onClick={() => toggleDay(w.d)} className={`w-9 py-1 text-[11px] rounded-md border ${d.days.includes(w.d) ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-accent/30'}`}>{w.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              {d.destKind === 'local'
                ? 'Lokales Ziel → läuft als native Aufgabe direkt auf dem PC (autonom, auch bei geschlossenem Tool; verpasste Läufe werden nachgeholt).'
                : 'Netzwerk-Ziel → wird über das IT-Tool ausgeführt; verpasste Läufe werden nachgeholt, sobald ein berechtigtes Tool läuft.'}
            </p>
          </div>

          {err && <p className="text-xs text-red-300 flex items-center gap-1"><AlertTriangle size={13} />{err}</p>}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-border sticky bottom-0 bg-card">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Abbrechen</button>
          <button onClick={save} disabled={!canSave || saving}
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
            {saving ? <Loader2 size={13} className="animate-spin" /> : d.mode === 'now' ? <Play size={13} /> : <Check size={13} />}
            {d.mode === 'now' ? 'Speichern & jetzt ausführen' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hauptscreen ───────────────────────────────────────────────────────────────
export default function Backups() {
  const username = useAuthStore(s => s.session?.user?.username) || useAuthStore(s => s.session?.user?.displayName) || ''
  const [jobs, setJobs] = useState<BackupJob[]>([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<Draft | null>(null)
  const [nativeInfo, setNativeInfo] = useState<Record<string, NativeTaskInfo>>({})
  const [pendingDelete, setPendingDelete] = useState<BackupJob | null>(null)

  const run = useBackupRunStore(s => s.run)
  const runPhase = useBackupRunStore(s => s.phase)
  const runJobName = useBackupRunStore(s => s.jobName)
  const runCopied = useBackupRunStore(s => s.copiedFiles)
  const runExpected = useBackupRunStore(s => s.expectedFiles)
  const runMessage = useBackupRunStore(s => s.message)
  const runReset = useBackupRunStore(s => s.reset)

  const refresh = useCallback(async () => {
    setLoading(true)
    setJobs(await listJobs())
    setLoading(false)
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  // Live-Status der nativen Aufgaben nachladen
  useEffect(() => {
    let alive = true
    ;(async () => {
      for (const j of jobs.filter(x => x.mechanism === 'native' && x.scheduled)) {
        const info = await queryNativeTask(j)
        if (!alive) return
        setNativeInfo(prev => ({ ...prev, [j.id]: info }))
      }
    })()
    return () => { alive = false }
  }, [jobs])

  async function togglePause(job: BackupJob) {
    const next = job.status === 'active' ? 'paused' : 'active'
    await updateJob(job.id, { status: next })
    // Native Aufgabe entsprechend aktivieren/deaktivieren
    if (job.mechanism === 'native' && job.scheduled) {
      if (next === 'paused') await unregisterNativeTask(job)
      else await registerNativeTask(job)
    }
    void refresh()
  }

  async function doDelete() {
    if (!pendingDelete) return
    const job = pendingDelete; setPendingDelete(null)
    if (job.mechanism === 'native' && job.scheduled) { try { await unregisterNativeTask(job) } catch { /* egal */ } }
    await deleteJob(job.id)
    void refresh()
  }

  const runPct = useMemo(() => runExpected > 0 ? Math.min(99, Math.round((runCopied / runExpected) * 100)) : 0, [runCopied, runExpected])

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <DatabaseBackup size={22} className="text-blue-400" />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-foreground">Back-Ups</h1>
          <p className="text-xs text-muted-foreground">Ordner eines PCs (per Admin-Share) inkrementell sichern — lokal oder über das Netzwerk, sofort oder geplant.</p>
        </div>
        <button onClick={() => refresh()} disabled={loading} className="p-2 rounded-md border border-border hover:bg-accent text-muted-foreground disabled:opacity-40"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
        <button onClick={() => setEditor(emptyDraft())} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={14} />Neues Backup</button>
      </div>

      {/* Laufender Backup-Fortschritt */}
      {runPhase !== 'idle' && (
        <div className="shrink-0 px-6 py-3 border-b border-border bg-muted/5">
          <div className="flex items-center gap-2 mb-1.5">
            {runPhase === 'done' ? <CheckCircle2 size={15} className="text-emerald-400" />
              : runPhase === 'error' ? <AlertTriangle size={15} className="text-red-400" />
              : <Loader2 size={15} className="animate-spin text-blue-400" />}
            <span className="text-sm font-medium text-foreground">{runJobName || 'Backup'}</span>
            <span className="text-xs text-muted-foreground">{runMessage}</span>
            {(runPhase === 'done' || runPhase === 'error') && (
              <button onClick={runReset} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground"><X size={14} /></button>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
            <div className={`h-full transition-all duration-500 ${runPhase === 'error' ? 'bg-red-500' : runPhase === 'done' ? 'bg-emerald-500' : 'bg-primary'}`}
              style={{ width: `${runPhase === 'done' ? 100 : runPct}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {runExpected > 0 ? `${runCopied.toLocaleString('de-DE')} / ${runExpected.toLocaleString('de-DE')} Dateien im Ziel` : `${runCopied.toLocaleString('de-DE')} Dateien im Ziel`}
          </p>
        </div>
      )}

      {/* Job-Liste */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 size={16} className="animate-spin" />Lade…</div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16">
            <DatabaseBackup size={40} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-foreground">Noch keine Backups angelegt</p>
            <button onClick={() => setEditor(emptyDraft())} className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={14} />Neues Backup</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {jobs.map(job => {
              const ni = nativeInfo[job.id]
              return (
                <div key={job.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${job.status === 'paused' ? 'bg-amber-400' : job.lastResult === 'error' ? 'bg-red-400' : 'bg-emerald-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-foreground truncate">{job.name}</h3>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${job.mechanism === 'native' ? 'bg-blue-500/15 text-blue-300' : 'bg-purple-500/15 text-purple-300'}`}>{job.mechanism === 'native' ? 'PC-Aufgabe' : 'Tool-Job'}</span>
                        {job.status === 'paused' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300">pausiert</span>}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <FolderOpen size={11} className="text-amber-400" />{job.source.target} · {job.source.folders.length} Ordner
                        <ChevronRight size={10} />
                        {job.dest.kind === 'network' ? <><Network size={11} className="text-blue-400" />{job.dest.target}:</> : <HardDrive size={11} className="text-blue-400" />}
                        <span className="font-mono">{job.dest.path}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{scheduleSummary(job)} · letzter Lauf: {fmtDate(job.lastRun)} {job.lastResult === 'error' ? <span className="text-red-300">(Fehler)</span> : job.lastResult === 'success' ? <span className="text-emerald-300">(ok)</span> : ''}</p>
                      {ni?.exists && <p className="text-[10px] text-blue-300/80 mt-0.5">PC-Aufgabe: {ni.state} · nächster Lauf {ni.nextRun ? new Date(ni.nextRun).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <button onClick={() => run(job, { by: username })} disabled={runPhase === 'running' || runPhase === 'starting'} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"><Play size={12} />Jetzt ausführen</button>
                    <button onClick={() => setEditor(draftFromJob(job))} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent"><Pencil size={12} />Bearbeiten</button>
                    <button onClick={() => togglePause(job)} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent">{job.status === 'active' ? <><Pause size={12} />Pausieren</> : <><Play size={12} />Fortsetzen</>}</button>
                    <button onClick={() => setPendingDelete(job)} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-red-500/40 text-red-300 hover:bg-red-500/10"><Trash2 size={12} />Löschen</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {editor && (
        <BackupEditor initial={editor} username={username} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void refresh() }} />
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setPendingDelete(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2"><Trash2 size={18} className="text-red-400" /><h3 className="text-base font-semibold text-foreground">Backup löschen?</h3></div>
            <p className="text-sm text-muted-foreground mb-4">„{pendingDelete.name}" wirklich löschen? {pendingDelete.mechanism === 'native' && pendingDelete.scheduled ? 'Die native Aufgabe auf dem PC wird ebenfalls entfernt.' : ''} Bereits gesicherte Daten im Ziel bleiben erhalten.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingDelete(null)} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Abbrechen</button>
              <button onClick={doDelete} className="px-3 py-1.5 text-xs rounded-md font-medium bg-red-600 text-white hover:bg-red-500">Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
