import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DatabaseBackup, Plus, Play, Pencil, Trash2, Pause, RefreshCw, Loader2, X, Check,
  HardDrive, Server, FolderOpen, Folder, ChevronRight, ChevronDown, ArrowUp, AlertTriangle,
  CheckCircle2, Clock, CalendarClock, Network, FolderPlus, ShieldCheck, Square, History,
  ExternalLink, Wrench, PlugZap, HelpCircle, Hourglass, Factory,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import {
  listJobs, createJob, updateJob, deleteJob, newId, nextSlotAfter, naechsterLauf, listRuns, gleicherPlan,
  type BackupJob, type BackupSchedule, type RunLogEntry,
} from '../services/backups'
import {
  listRemoteDrives, listRemoteDirs, createRemoteDir, isHostOderIp, isLaufwerksWurzel, zielOrdner, jobFehler,
  registerNativeTask, unregisterNativeTask, setNativeTaskAktiv, queryNativeTask, pruefeEinrichtung, zielUnc,
  localToUnc, isAbsoluteLocalPath, type NativeTaskInfo, type PruefPunkt,
} from '../services/backupEngine'
import { syncPcErgebnisse, type PcSyncStand } from '../services/backupPcSync'
import { fmtBytes, fmtDauer, type LaufBericht } from '../services/backupBericht'
import { useBackupRunStore, eigenerRechner } from '../store/backupRunStore'
import BackupBerichtBox from '../components/backups/BackupBerichtBox'
import BackupInfoBox from '../components/backups/BackupInfoBox'
import { beschreibeJob } from '../services/backupBeschreibung'
import ChironKarte from '../components/backups/ChironKarte'
import { standardKonfig, protokolliere } from '../services/chironBackup'
import { api } from '../electronAPI'

const WEEKDAYS = [
  { d: 1, label: 'Mo' }, { d: 2, label: 'Di' }, { d: 3, label: 'Mi' }, { d: 4, label: 'Do' },
  { d: 5, label: 'Fr' }, { d: 6, label: 'Sa' }, { d: 0, label: 'So' },
]

function fmtDate(iso?: string | Date | null): string {
  if (!iso) return '—'
  const d = iso instanceof Date ? iso : new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

const TASK_STATE: Record<string, string> = { Ready: 'bereit', Running: 'läuft gerade', Disabled: 'deaktiviert', Queued: 'wartet', Unknown: 'unbekannt' }
function taskErgebnisText(code?: number): string | null {
  if (code == null || code === 0) return null
  if (code === 1) return 'letzter Lauf mit Fehlern'
  if (code === 3) return 'letzter Start übersprungen (lief noch)'
  if (code === 267009) return 'läuft gerade'
  if (code === 267011) return 'noch nie gelaufen'
  if (code === 4294770688 || code === -196608) return 'Skriptdatei fehlt — neu einrichten'
  return `Ergebnis-Code ${code}`
}

// ── Remote-Ordner-Browser ─────────────────────────────────────────────────────
// Lädt erst nach einer kurzen Tipp-Pause (sonst startete JEDER Tastendruck ein
// PowerShell) und verwirft veraltete Antworten.
function RemoteFolderPicker({ target, mode, selected, startPfad, onToggle, onPickDest }: {
  target: string
  mode: 'source' | 'dest'
  selected?: string[]
  startPfad?: string
  onToggle?: (fullPath: string) => void
  onPickDest?: (fullPath: string) => void
}) {
  const start = startPfad && isAbsoluteLocalPath(startPfad) ? startPfad.replace(/[\\/]+$/, '') || `${startPfad[0]}:\\` : 'C:\\'
  const [drives, setDrives] = useState<string[]>([])
  const [path, setPath] = useState(start.length === 2 ? `${start}\\` : start)
  const [eingabe, setEingabe] = useState(path)
  const [entries, setEntries] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [newFolder, setNewFolder] = useState('')
  const [creating, setCreating] = useState(false)
  const anfrage = useRef(0)
  const drive = (path[0] || 'C').toUpperCase()

  // Laufwerke: 700 ms nach der letzten Änderung des PC-Namens
  useEffect(() => {
    const t = target.trim()
    if (!t) return
    const id = ++anfrage.current
    setErr(''); setLoading(true); setDrives([])
    const timer = setTimeout(async () => {
      const r = await listRemoteDrives(t)
      if (id !== anfrage.current) return
      setLoading(false)
      if (r.ok) {
        setDrives(r.drives)
        if (!r.drives.includes(drive)) { const p = `${r.drives[0]}:\\`; setPath(p); setEingabe(p) }
        else void ladeOrdner(path)
      } else { setEntries([]); setErr(r.error || 'Keine Laufwerke erreichbar.') }
    }, 700)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  const ladeOrdner = useCallback(async (p: string) => {
    const t = target.trim()
    if (!t) return
    const id = ++anfrage.current
    setErr(''); setLoading(true)
    const r = await listRemoteDirs(t, p)
    if (id !== anfrage.current) return
    setLoading(false)
    if (r.ok) setEntries(r.dirs)
    else { setEntries([]); setErr(r.error || 'Ordner nicht lesbar') }
  }, [target])

  useEffect(() => { if (drives.length) void ladeOrdner(path) /* eslint-disable-next-line */ }, [path])

  function gehe(p: string) { setPath(p); setEingabe(p) }
  function goInto(name: string) { gehe(`${path.replace(/\\+$/, '')}\\${name}`) }
  function goUp() {
    const trimmed = path.replace(/\\+$/, '')
    const idx = trimmed.lastIndexOf('\\')
    gehe(idx <= 2 ? `${drive}:\\` : trimmed.slice(0, idx))
  }
  function eingabeUebernehmen() {
    const p = eingabe.trim()
    if (!isAbsoluteLocalPath(p) && !/^[A-Za-z]:$/.test(p)) { setErr('Bitte einen Pfad mit Laufwerk eingeben (z. B. C:\\Users).'); return }
    const norm = /^[A-Za-z]:$/.test(p) ? `${p}\\` : p
    if (norm === path) void ladeOrdner(norm); else gehe(norm)
  }

  async function doCreate() {
    const name = newFolder.trim()
    if (!name) return
    if (/[<>:"/\\|?*]/.test(name)) { setErr('Ordnername enthält unzulässige Zeichen.'); return }
    setCreating(true)
    const full = `${path.replace(/\\+$/, '')}\\${name}`
    const r = await createRemoteDir(target.trim(), full)
    setCreating(false)
    if (r.ok) { setNewFolder(''); await ladeOrdner(path); onPickDest?.(full) }
    else setErr(r.error || 'Ordner konnte nicht angelegt werden')
  }

  const aktuell = path.replace(/\\+$/, '')
  const istWurzel = isLaufwerksWurzel(path)

  return (
    <div className="rounded-lg border border-border bg-background/60">
      <div className="flex items-center gap-2 p-2 border-b border-border">
        <HardDrive size={14} className="text-muted-foreground shrink-0" />
        <select value={drive} onChange={e => gehe(`${e.target.value}:\\`)} disabled={!drives.length}
          className="text-xs rounded-md bg-background border border-border px-1.5 py-1 text-foreground disabled:opacity-50">
          {(drives.length ? drives : [drive]).map(d => <option key={d} value={d}>{d}:</option>)}
        </select>
        <input value={eingabe} onChange={e => setEingabe(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') eingabeUebernehmen() }} onBlur={() => { if (eingabe !== path) eingabeUebernehmen() }}
          className="flex-1 min-w-0 text-xs font-mono rounded-md bg-background border border-border px-2 py-1 text-foreground" />
        <button onClick={() => ladeOrdner(path)} title="Neu laden" className="p-1 rounded hover:bg-accent text-muted-foreground"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        <button onClick={goUp} title="Eine Ebene nach oben" className="p-1 rounded hover:bg-accent text-muted-foreground"><ArrowUp size={13} /></button>
      </div>
      {err && <p className="px-2 py-1 text-[11px] text-amber-500 flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{err}</p>}
      <div className="max-h-52 overflow-y-auto p-1">
        {loading && entries.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground flex items-center gap-1"><Loader2 size={12} className="animate-spin" />Lade…</p>
        ) : entries.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{err ? '' : 'Keine Unterordner.'}</p>
        ) : entries.map(name => {
          const full = `${aktuell}\\${name}`
          const isSel = mode === 'source' && selected?.some(s => s.toLowerCase() === full.toLowerCase())
          return (
            <div key={name} className={`flex items-center gap-2 px-2 py-1 rounded-md hover:bg-accent/30 ${isSel ? 'bg-emerald-500/10' : ''}`}>
              {mode === 'source' && (
                <input type="checkbox" checked={!!isSel} onChange={() => onToggle?.(full)} className="accent-primary" title="Diesen Ordner sichern" />
              )}
              <button onClick={() => goInto(name)} className="flex items-center gap-1.5 flex-1 min-w-0 text-left text-xs text-foreground" title="Öffnen">
                <Folder size={13} className="text-amber-500 shrink-0" /><span className="truncate">{name}</span>
                <ChevronRight size={12} className="text-muted-foreground/50 ml-auto shrink-0" />
              </button>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-2 p-2 border-t border-border flex-wrap">
        {mode === 'source' ? (
          <button onClick={() => onToggle?.(aktuell)} disabled={istWurzel} title={istWurzel ? 'Ein ganzes Laufwerk kann nicht gesichert werden' : undefined}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40"><Plus size={12} />Diesen Ordner ({aktuell}) hinzufügen</button>
        ) : (
          <button onClick={() => onPickDest?.(aktuell.length === 2 ? `${aktuell}\\` : aktuell)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"><Check size={12} />{aktuell} als Ziel nehmen</button>
        )}
        {mode === 'dest' && (
          <div className="flex items-center gap-1">
            <input value={newFolder} onChange={e => setNewFolder(e.target.value)} placeholder="Neuer Ordner…" onKeyDown={e => { if (e.key === 'Enter') void doCreate() }}
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

function autoName(d: Draft): string {
  const src = d.srcTarget.trim() || 'PC'
  const ziel = d.destKind === 'network' ? (d.destTarget.trim() || 'Ziel') : 'lokal'
  return `${src} → ${ziel}`
}

function BackupEditor({ initial, original, username, vorschlaege, onClose, onSaved }: {
  initial: Draft; original?: BackupJob; username: string; vorschlaege: string[]; onClose: () => void; onSaved: () => void
}) {
  const [d, setD] = useState<Draft>(initial)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [gespeichertMitFehler, setGespeichertMitFehler] = useState(false)
  const [pruefung, setPruefung] = useState<PruefPunkt[] | null>(null)
  const [pruefeLaeuft, setPruefeLaeuft] = useState(false)
  const run = useBackupRunStore(s => s.run)

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD(p => ({ ...p, [k]: v })); setPruefung(null) }
  const toggleFolder = (full: string) => {
    if (isLaufwerksWurzel(full)) return
    setD(p => ({ ...p, folders: p.folders.some(f => f.toLowerCase() === full.toLowerCase()) ? p.folders.filter(f => f.toLowerCase() !== full.toLowerCase()) : [...p.folders, full] }))
    setPruefung(null)
  }
  const toggleDay = (day: number) => setD(p => ({ ...p, days: p.days.includes(day) ? p.days.filter(x => x !== day) : [...p.days, day] }))

  const srcValid = isHostOderIp(d.srcTarget)
  const destTargetValid = d.destKind === 'local' || isHostOderIp(d.destTarget)
  const destPathValid = isAbsoluteLocalPath(d.destPath)

  function buildJob(): BackupJob {
    const scheduled = d.mode !== 'now'
    const schedule: BackupSchedule | undefined = !scheduled ? undefined
      : d.mode === 'once'
        ? { type: 'once', date: d.date, time: d.time }
        : { type: 'recurring', repeat: d.repeat, time: d.time, days: d.repeat === 'weekly' ? [...d.days].sort() : undefined }
    const id = d.id || newId()
    const planGleich = !!original && original.scheduled === scheduled && gleicherPlan(original.schedule, schedule)
    return {
      id, name: d.name.trim() || autoName(d),
      source: { target: d.srcTarget.trim(), drive: (d.folders[0]?.slice(0, 1) || 'C'), folders: d.folders },
      dest: { kind: d.destKind, target: d.destKind === 'network' ? d.destTarget.trim() : undefined, drive: (d.destPath.trim().slice(0, 1) || 'C'), path: d.destPath.trim() },
      mirror: d.mirror, scheduled, schedule,
      planSeit: scheduled ? (planGleich ? original?.planSeit : new Date().toISOString()) : undefined,
      mechanism: d.destKind === 'local' ? 'native' : 'tool',
      nativeTaskName: original?.nativeTaskName || `ITAdminBackup_${id}`,
      // Beim Bearbeiten bleiben Ersteller, Anlagedatum und Pausen-Status erhalten
      status: original?.status ?? 'active',
      createdBy: original?.createdBy || username, createdAt: original?.createdAt || new Date().toISOString(),
    }
  }

  const fehlt = useMemo(() => {
    const f: string[] = []
    if (!d.srcTarget.trim()) f.push('Quell-PC eintragen')
    else if (!srcValid) f.push('Quell-PC: ungültiger Name/IP')
    if (!d.folders.length) f.push('mindestens einen Quell-Ordner auswählen')
    if (d.destKind === 'network' && !d.destTarget.trim()) f.push('Ziel-PC eintragen')
    else if (!destTargetValid) f.push('Ziel-PC: ungültiger Name/IP')
    if (!d.destPath.trim()) f.push('Zielordner wählen')
    else if (!destPathValid) f.push('Zielordner: vollständiger Pfad mit Laufwerk nötig (z. B. D:\\Backups)')
    if (d.mode === 'once') {
      if (!d.date || !d.time) f.push('Datum und Uhrzeit wählen')
      else if (new Date(`${d.date}T${d.time}`).getTime() < Date.now()) f.push('Zeitpunkt liegt in der Vergangenheit')
    }
    if (d.mode === 'recurring' && !d.time) f.push('Uhrzeit wählen')
    if (d.mode === 'recurring' && d.repeat === 'weekly' && !d.days.length) f.push('mindestens einen Wochentag wählen')
    if (!f.length) { const jf = jobFehler(buildJob()); if (jf) f.push(jf) }
    return f
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, srcValid, destTargetValid, destPathValid])
  const canSave = fehlt.length === 0
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const zusammenfassung = useMemo(() => (canSave ? beschreibeJob(buildJob()) : null), [d, canSave])

  const vorschau = useMemo(() => (d.folders.length && destPathValid ? zielOrdner(buildJob()) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.folders, d.destPath, destPathValid])

  async function pruefen() {
    setPruefeLaeuft(true); setPruefung(null)
    try { setPruefung(await pruefeEinrichtung(buildJob())) } finally { setPruefeLaeuft(false) }
  }

  async function save() {
    setSaving(true); setErr('')
    const job = buildJob()
    if (job.scheduled && job.schedule) job.nextDue = nextSlotAfter(job.schedule, new Date())?.toISOString()

    const isEdit = !!original
    // Alte PC-Aufgabe entfernen, wenn sie nicht mehr passt (anderer PC, kein lokales Ziel, kein Zeitplan)
    if (isEdit && original.mechanism === 'native' && original.scheduled) {
      const bleibtNativ = job.mechanism === 'native' && job.scheduled && original.source.target.toLowerCase() === job.source.target.toLowerCase()
      if (!bleibtNativ) {
        const u = await unregisterNativeTask(original)
        if (!u.ok) { setSaving(false); setErr(`Die bisherige PC-Aufgabe auf ${original.source.target} konnte nicht entfernt werden: ${u.error}. Ohne das liefe das alte Backup dort weiter — bitte erneut versuchen, wenn der PC erreichbar ist.`); return }
      }
    }

    let nativeFehler: string | undefined
    if (job.scheduled && job.mechanism === 'native' && job.status === 'active') {
      const rt = await registerNativeTask(job)
      if (!rt.ok) nativeFehler = rt.error || 'unbekannter Fehler'
    }
    job.nativeFehler = nativeFehler
    const res = isEdit ? await updateJob(job.id, job) : await createJob(job)
    if (!res.ok) { setSaving(false); setErr(res.error || 'Speichern fehlgeschlagen.'); return }
    setSaving(false)
    if (nativeFehler) {
      setGespeichertMitFehler(true)
      setErr(`Gespeichert — aber die PC-Aufgabe auf ${job.source.target} konnte nicht eingerichtet werden: ${nativeFehler}. Auf der Karte kannst du es später mit „PC-Aufgabe einrichten" erneut versuchen.`)
      return
    }
    onSaved()
    if (d.mode === 'now') void run(job, { by: username })
  }

  const inp = 'w-full px-2.5 py-1.5 text-sm rounded-md bg-background border text-foreground focus:outline-none'
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border sticky top-0 bg-card z-10">
          <DatabaseBackup size={18} className="text-blue-500" />
          <h3 className="text-base font-semibold text-foreground">{d.id ? 'Backup bearbeiten' : 'Neues Backup'}</h3>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground"><X size={16} /></button>
        </div>
        <datalist id="backup-hosts">{vorschlaege.map(v => <option key={v} value={v} />)}</datalist>

        <div className="p-5 space-y-5">
          {/* 1 Quelle */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] flex items-center justify-center">1</span><FolderOpen size={14} className="text-amber-500" />Was soll gesichert werden?</p>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Quell-PC (Hostname oder IP) *</label>
              <input value={d.srcTarget} onChange={e => set('srcTarget', e.target.value)} placeholder="z. B. DEHAM12345678, w3148 oder 10.20.30.40" list="backup-hosts"
                className={`${inp} ${d.srcTarget && !srcValid ? 'border-red-500/50' : 'border-border focus:border-primary'}`} />
            </div>
            {d.srcTarget && srcValid && (
              <RemoteFolderPicker target={d.srcTarget} mode="source" selected={d.folders} onToggle={toggleFolder}
                startPfad={d.folders[0] ? d.folders[0].replace(/[\\/][^\\/]+$/, '') : undefined} />
            )}
            {d.folders.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {d.folders.map(f => (
                  <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-foreground font-mono">
                    {f}<button onClick={() => toggleFolder(f)} className="text-muted-foreground hover:text-foreground" title="Entfernen"><X size={11} /></button>
                  </span>
                ))}
              </div>
            ) : d.srcTarget && srcValid ? <p className="text-[10px] text-muted-foreground">Ordner im Browser anhaken (Klick auf den Namen öffnet ihn).</p> : null}
            <p className="text-[10px] text-emerald-500 flex items-start gap-1">
              <ShieldCheck size={12} className="mt-0.5 shrink-0" />
              Die Quelle wird ausschließlich <strong>gelesen (kopiert)</strong> — nie verändert, gelöscht oder verschoben.
            </p>
          </div>

          {/* 2 Ziel */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] flex items-center justify-center">2</span><Server size={14} className="text-blue-500" />Wohin?</p>
            <div className="flex gap-2">
              <button onClick={() => set('destKind', 'local')} className={`flex-1 px-3 py-2 text-xs rounded-md border text-left ${d.destKind === 'local' ? 'border-primary bg-primary/10 text-foreground font-medium' : 'border-border text-muted-foreground hover:bg-accent/30'}`}>
                <HardDrive size={13} className="inline mr-1" />Gleicher PC (anderes Laufwerk/Ordner)
                <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">läuft als Aufgabe direkt auf dem PC — auch ohne offenes Tool</span>
              </button>
              <button onClick={() => set('destKind', 'network')} className={`flex-1 px-3 py-2 text-xs rounded-md border text-left ${d.destKind === 'network' ? 'border-primary bg-primary/10 text-foreground font-medium' : 'border-border text-muted-foreground hover:bg-accent/30'}`}>
                <Network size={13} className="inline mr-1" />Anderer PC / Server
                <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">kopiert über das Tool (ein Admin-Tool muss zur Zeit offen sein)</span>
              </button>
            </div>
            {d.destKind === 'network' && (
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Ziel-PC / Server (Hostname oder IP) *</label>
                <input value={d.destTarget} onChange={e => set('destTarget', e.target.value)} placeholder="z. B. w3172 oder 10.20.30.50" list="backup-hosts"
                  className={`${inp} ${d.destTarget && !destTargetValid ? 'border-red-500/50' : 'border-border focus:border-primary'}`} />
              </div>
            )}
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Zielordner * (unten auswählen oder direkt eingeben)</label>
              <input value={d.destPath} onChange={e => set('destPath', e.target.value)} placeholder="z. B. D:\Backups\PC01"
                className={`${inp} font-mono ${d.destPath.trim() && !destPathValid ? 'border-red-500/50' : 'border-border focus:border-primary'}`} />
            </div>
            {(d.destKind === 'local' ? d.srcTarget && srcValid : d.destTarget && destTargetValid) && (
              <RemoteFolderPicker
                key={d.destKind === 'local' ? `l-${d.srcTarget}` : `n-${d.destTarget}`}
                target={d.destKind === 'local' ? d.srcTarget : d.destTarget}
                mode="dest" startPfad={d.destPath || undefined}
                onPickDest={p => set('destPath', p)}
              />
            )}
            {vorschau.length > 0 && (
              <div className="rounded-md bg-muted/20 border border-border px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground mb-0.5">So wird gespeichert:</p>
                {vorschau.map(v => <p key={v.quelle} className="text-[10px] font-mono text-foreground break-all">{v.quelle} <span className="text-muted-foreground">→</span> {d.destKind === 'network' && d.destTarget ? `${d.destTarget}: ` : ''}{v.ziel}</p>)}
              </div>
            )}
            <label className="flex items-start gap-2 text-[11px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={d.mirror} onChange={e => set('mirror', e.target.checked)} className="mt-0.5 accent-primary shrink-0" />
              <span>Spiegeln (/MIR — löscht <strong>nur im Ziel</strong> Dateien, die in der Quelle entfernt wurden; die <strong>Quelle bleibt unberührt</strong>). Standard: aus (nur neue/geänderte Dateien kopieren).</span>
            </label>
          </div>

          {/* 3 Ausführung */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] flex items-center justify-center">3</span><Clock size={14} className="text-purple-500" />Wann?</p>
            <div className="flex gap-2 flex-wrap">
              {([['now', 'Nur manuell (jetzt einmal ausführen)', Play], ['once', 'Einmalig (Zeitpunkt)', CalendarClock], ['recurring', 'Regelmäßig', RefreshCw]] as const).map(([m, label, Icon]) => (
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
                <div className="flex gap-2 items-end">
                  <label className="text-[11px] text-muted-foreground">Rhythmus
                    <select value={d.repeat} onChange={e => set('repeat', e.target.value as 'daily' | 'weekly')} className="block mt-0.5 text-sm rounded-md bg-background border border-border px-2 py-1 text-foreground">
                      <option value="daily">Täglich</option><option value="weekly">Wöchentlich</option>
                    </select>
                  </label>
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
            {d.mode !== 'now' && (
              <p className="text-[10px] text-muted-foreground">
                {d.destKind === 'local'
                  ? 'Läuft als Aufgabe direkt auf dem PC (als SYSTEM). War der PC zur Zeit aus, wird beim nächsten Einschalten nachgeholt.'
                  : 'Läuft über das IT-Tool. Ist ein PC zur Zeit aus, wartet der Lauf und wird alle 5 Minuten erneut versucht, sobald ein Admin-Tool offen ist.'}
                {d.mode === 'recurring' && !original && ' Der erste Lauf ist zum nächsten eingestellten Zeitpunkt.'}
              </p>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="text-[11px] text-muted-foreground font-medium block mb-1">Name (optional)</label>
            <input value={d.name} onChange={e => set('name', e.target.value)} placeholder={autoName(d)}
              className={`${inp} border-border focus:border-primary`} />
          </div>

          {/* Zusammenfassung — derselbe Text, der danach auf der Karte steht */}
          {zusammenfassung && <BackupInfoBox b={zusammenfassung} titel="Zusammenfassung — so wird das Backup laufen" />}

          {/* Prüfung */}
          {pruefung && (
            <div className="rounded-lg border border-border p-3 space-y-1">
              <p className="text-xs font-semibold text-foreground mb-1">Ergebnis der Prüfung</p>
              {pruefung.map((p, i) => (
                <div key={i} className="text-[11px] flex items-start gap-1.5">
                  {p.ok === true ? <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 shrink-0" /> : p.ok === false ? <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" /> : <HelpCircle size={13} className="text-amber-500 mt-0.5 shrink-0" />}
                  <div><p className="text-foreground">{p.titel}</p>{p.detail && <p className="text-muted-foreground">{p.detail}</p>}</div>
                </div>
              ))}
            </div>
          )}

          {err && <p className={`text-xs flex items-start gap-1 ${gespeichertMitFehler ? 'text-amber-500' : 'text-red-500'}`}><AlertTriangle size={13} className="mt-0.5 shrink-0" />{err}</p>}
          {!canSave && !gespeichertMitFehler && (
            <p className="text-[11px] text-muted-foreground">Noch offen: {fehlt.join(' · ')}</p>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-border sticky bottom-0 bg-card">
          {gespeichertMitFehler ? (
            <button onClick={() => { onSaved() }} className="ml-auto px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90">Schließen</button>
          ) : (<>
            <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Abbrechen</button>
            <button onClick={pruefen} disabled={!canSave || pruefeLaeuft} title="Erreichbarkeit, Rechte und freien Speicher prüfen — ändert nichts"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40">
              {pruefeLaeuft ? <Loader2 size={13} className="animate-spin" /> : <PlugZap size={13} />}Verbindung prüfen
            </button>
            <button onClick={save} disabled={!canSave || saving}
              className="ml-auto inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              {saving ? <Loader2 size={13} className="animate-spin" /> : d.mode === 'now' ? <Play size={13} /> : <Check size={13} />}
              {saving ? (d.destKind === 'local' && d.mode !== 'now' ? 'Richte PC-Aufgabe ein…' : 'Speichere…') : d.mode === 'now' ? 'Speichern & jetzt ausführen' : 'Speichern'}
            </button>
          </>)}
        </div>
      </div>
    </div>
  )
}

// ── Laufender Lauf (oben) ─────────────────────────────────────────────────────
function LaufBanner({ username, oeffnePfad }: { username: string; oeffnePfad: (b: LaufBericht, p: string) => string }) {
  const s = useBackupRunStore()
  const [bestaetigen, setBestaetigen] = useState(false)
  if (s.phase === 'idle') return null
  const laeuft = s.phase === 'starting' || s.phase === 'pruefen' || s.phase === 'running'
  const pct = s.expectedFiles > 0 ? Math.min(99, Math.round((s.copiedFiles / s.expectedFiles) * 100)) : 0
  const unbestimmt = laeuft && (s.phase !== 'running' || s.expectedFiles === 0)
  const farbe = s.phase === 'error' ? 'bg-red-500' : s.phase === 'warning' ? 'bg-amber-500' : s.phase === 'done' ? 'bg-emerald-500' : 'bg-primary'
  return (
    <div className="shrink-0 px-6 py-3 border-b border-border bg-muted/5">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        {s.phase === 'done' ? <CheckCircle2 size={15} className="text-emerald-500" />
          : s.phase === 'error' ? <AlertTriangle size={15} className="text-red-500" />
          : s.phase === 'warning' ? <AlertTriangle size={15} className="text-amber-500" />
          : <Loader2 size={15} className="animate-spin text-blue-500" />}
        <span className="text-sm font-medium text-foreground">{s.jobName || 'Backup'}</span>
        {s.art && laeuft && <span className="text-[10px] text-muted-foreground">{s.art === 'pc' ? `läuft auf ${s.host}` : 'läuft über diesen PC'}</span>}
        <span className="text-xs text-muted-foreground">{laeuft ? s.message : ''}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {laeuft && s.phase !== 'starting' && !s.abbrechend && (bestaetigen ? (
            <>
              <span className="text-[11px] text-muted-foreground">Wirklich abbrechen?</span>
              <button onClick={() => { setBestaetigen(false); void s.abbrechen(username) }} className="px-2 py-0.5 text-[11px] rounded-md bg-red-600 text-white hover:bg-red-500">Ja, abbrechen</button>
              <button onClick={() => setBestaetigen(false)} className="px-2 py-0.5 text-[11px] rounded-md border border-border text-muted-foreground hover:bg-accent">Nein</button>
            </>
          ) : (
            <button onClick={() => setBestaetigen(true)} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent"><Square size={11} />Abbrechen</button>
          ))}
          {!laeuft && <button onClick={s.reset} title="Ausblenden" className="p-1 rounded hover:bg-accent text-muted-foreground"><X size={14} /></button>}
        </div>
      </div>
      {laeuft && (
        <>
          <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
            {unbestimmt
              ? <div className="h-full w-1/3 bg-primary/70 animate-pulse rounded-full" />
              : <div className={`h-full transition-all duration-500 ${farbe}`} style={{ width: `${pct}%` }} />}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {s.phase === 'running' && (s.expectedFiles > 0
              ? `${s.copiedFiles.toLocaleString('de-DE')} von ${s.expectedFiles.toLocaleString('de-DE')} zu kopierenden Dateien${s.expectedBytes ? ` (${fmtBytes(s.expectedBytes)})` : ''}`
              : `${s.copiedFiles.toLocaleString('de-DE')} Dateien kopiert`)}
            {s.hinweis && <span className="text-amber-500"> {s.hinweis}</span>}
          </p>
        </>
      )}
      {!laeuft && s.bericht && <BackupBerichtBox bericht={s.bericht} oeffnePfad={p => oeffnePfad(s.bericht as LaufBericht, p)} />}
    </div>
  )
}

// ── Verlauf ───────────────────────────────────────────────────────────────────
function Verlauf({ jobId, aktualisiert }: { jobId: string; aktualisiert: number }) {
  const [runs, setRuns] = useState<RunLogEntry[] | null>(null)
  useEffect(() => { let alive = true; void listRuns(jobId, 12).then(r => { if (alive) setRuns(r) }); return () => { alive = false } }, [jobId, aktualisiert])
  if (!runs) return <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1"><Loader2 size={11} className="animate-spin" />Lade Verlauf…</p>
  if (!runs.length) return <p className="text-[11px] text-muted-foreground mt-2">Noch keine Läufe aufgezeichnet.</p>
  return (
    <div className="mt-2 rounded-md border border-border divide-y divide-border">
      {runs.map((r, i) => (
        <div key={`${r.runId || r.slot}-${i}`} className="px-2 py-1 text-[11px] flex items-start gap-2">
          <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${r.result === 'success' ? 'bg-emerald-500' : r.result === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`} />
          <span className="text-muted-foreground shrink-0 w-24">{fmtDate(r.at)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-foreground truncate" title={r.message}>{r.message || r.result}</p>
            {r.gruende && r.gruende.length > 0 && r.result !== 'success' && <p className="text-muted-foreground truncate" title={r.gruende.join(' · ')}>{r.gruende.join(' · ')}</p>}
          </div>
          <span className="text-muted-foreground shrink-0 text-[10px]">{r.art === 'pc-aufgabe' ? 'PC-Aufgabe' : r.art === 'geplant' ? 'geplant' : r.by || 'manuell'}{r.dauerSek != null ? ` · ${fmtDauer(r.dauerSek)}` : ''}</span>
        </div>
      ))}
    </div>
  )
}

// ── Karte ─────────────────────────────────────────────────────────────────────
function statusAnzeige(job: BackupJob, laeuftHier: boolean): { punkt: string; text: string; farbe: string } {
  if (laeuftHier || job.lastResult === 'running') return { punkt: 'bg-blue-500 animate-pulse', text: 'läuft', farbe: 'text-blue-500' }
  if (job.status === 'paused') return { punkt: 'bg-muted-foreground/50', text: 'pausiert', farbe: 'text-muted-foreground' }
  if (job.lastResult === 'waiting') return { punkt: 'bg-amber-500', text: 'wartet auf PC', farbe: 'text-amber-500' }
  if (job.lastResult === 'error') return { punkt: 'bg-red-500', text: 'Fehler', farbe: 'text-red-500' }
  if (job.lastResult === 'warning') return { punkt: 'bg-amber-500', text: 'teilweise', farbe: 'text-amber-500' }
  if (job.lastResult === 'success') return { punkt: 'bg-emerald-500', text: 'ok', farbe: 'text-emerald-500' }
  return { punkt: 'bg-muted-foreground/30', text: 'noch nie gelaufen', farbe: 'text-muted-foreground' }
}

function JobKarte({ job, username, ich, nativ, pcStand, busy, aktualisiert, onEdit, onDelete, onPause, onNeuEinrichten, oeffnePfad }: {
  job: BackupJob; username: string; ich: string
  nativ?: NativeTaskInfo | 'laedt'; pcStand?: PcSyncStand
  busy: string; aktualisiert: number
  onEdit: () => void; onDelete: () => void; onPause: () => void; onNeuEinrichten: () => void
  oeffnePfad: (b: LaufBericht, p: string) => string
}) {
  const run = useBackupRunStore(s => s.run)
  const runPhase = useBackupRunStore(s => s.phase)
  const runJobId = useBackupRunStore(s => s.jobId)
  const [verlauf, setVerlauf] = useState(false)
  const [oeffnenFehler, setOeffnenFehler] = useState('')
  const laeuftIrgendwo = runPhase === 'starting' || runPhase === 'pruefen' || runPhase === 'running'
  const laeuftHier = laeuftIrgendwo && runJobId === job.id
  const st = statusAnzeige(job, laeuftHier)
  const naechster = naechsterLauf(job)
  const beschreibung = useMemo(() => beschreibeJob(job), [job])
  const nativInfo = nativ && nativ !== 'laedt' ? nativ : undefined
  const pcProblem = job.mechanism === 'native' && job.scheduled && job.status === 'active' && (
    job.nativeFehler ? `PC-Aufgabe nicht eingerichtet: ${job.nativeFehler}`
      : nativInfo && nativInfo.erreichbar && !nativInfo.exists ? 'PC-Aufgabe fehlt auf dem PC'
      : nativInfo?.alterStand ? 'PC-Aufgabe hat noch den alten Stand (ohne Fehlerauswertung)'
      : nativInfo?.exists && nativInfo.state === 'Disabled' ? 'PC-Aufgabe ist auf dem PC deaktiviert'
      : null)
  const fremderLauf = job.lauf && job.lastResult === 'running' && !laeuftHier && job.lauf.rechner !== ich

  async function zielOeffnen() {
    setOeffnenFehler('')
    const p = zielUnc(job)
    const r = await api().openPath(p)
    if (!r.success) setOeffnenFehler(`Ziel nicht erreichbar: ${p}${r.error ? ` (${r.error})` : ''}`)
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${st.punkt}`} title={st.text} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground truncate">{job.name}</h3>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${job.mechanism === 'native' ? 'bg-blue-500/15 text-blue-500' : 'bg-purple-500/15 text-purple-500'}`} title={job.mechanism === 'native' ? 'Läuft als geplante Aufgabe direkt auf dem PC' : 'Läuft über das IT-Tool'}>{job.mechanism === 'native' ? 'PC-Aufgabe' : 'Tool-Job'}</span>
            <span className={`text-[10px] font-medium ${st.farbe}`}>{st.text}</span>
          </div>
          <BackupInfoBox b={beschreibung} />
          <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1 flex-wrap">
            <Clock size={11} className="shrink-0" />
            {naechster ? <>nächster Lauf: <span className="text-foreground">{fmtDate(naechster)}</span> · </> : null}
            letzter Lauf: {fmtDate(job.lastRun)}
          </p>
          {nativ === 'laedt' && <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1"><Loader2 size={10} className="animate-spin" />PC-Aufgabe wird geprüft…</p>}
          {nativInfo && nativInfo.exists && !pcProblem && (
            <p className="text-[10px] text-blue-500 mt-0.5">PC-Aufgabe: {TASK_STATE[nativInfo.state || ''] || nativInfo.state}{nativInfo.nextRun ? ` · nächster Start auf dem PC ${fmtDate(nativInfo.nextRun)}` : ''}{taskErgebnisText(nativInfo.lastResult) && !job.lastReport ? ` · ${taskErgebnisText(nativInfo.lastResult)}` : ''}</p>
          )}
          {nativInfo && !nativInfo.erreichbar && !pcProblem && job.mechanism === 'native' && job.scheduled && (
            <p className="text-[10px] text-muted-foreground mt-0.5">PC-Aufgabe: Stand nicht abrufbar ({nativInfo.fehler})</p>
          )}
          {pcStand?.laeuft && !laeuftHier && (
            <p className="text-[11px] text-blue-500 mt-0.5 flex items-center gap-1"><Loader2 size={11} className="animate-spin" />läuft gerade auf dem PC{pcStand.laeuft.ordnerAnzahl > 1 ? ` (Ordner ${pcStand.laeuft.ordnerNr}/${pcStand.laeuft.ordnerAnzahl})` : ''} · {pcStand.laeuft.aktuell.toLocaleString('de-DE')} Dateien kopiert</p>
          )}
          {fremderLauf && job.lauf && (
            <p className="text-[11px] text-blue-500 mt-0.5">läuft gerade über {job.lauf.rechner} (gestartet von {job.lauf.by || '?'} um {fmtDate(job.lauf.start)})</p>
          )}
          {job.lastResult === 'waiting' && job.wartet && (
            <p className="text-[11px] text-amber-500 mt-1 flex items-start gap-1"><Hourglass size={12} className="mt-0.5 shrink-0" />{job.wartet.grund} — geplanter Lauf vom {fmtDate(job.wartet.slot)} wird nachgeholt, sobald erreichbar (wartet seit {fmtDate(job.wartet.seit)}).</p>
          )}
          {pcProblem && (
            <div className="mt-1 text-[11px] text-amber-500 flex items-start gap-1 flex-wrap">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /><span className="flex-1 min-w-0">{pcProblem}</span>
              <button onClick={onNeuEinrichten} disabled={!!busy} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-amber-500/40 text-amber-500 hover:bg-amber-500/10 disabled:opacity-40">
                {busy === 'einrichten' ? <Loader2 size={11} className="animate-spin" /> : <Wrench size={11} />}PC-Aufgabe einrichten
              </button>
            </div>
          )}
          {job.lastReport && !laeuftHier && job.lastResult !== 'running' && (
            <BackupBerichtBox bericht={job.lastReport} kompakt oeffnePfad={p => oeffnePfad(job.lastReport as LaufBericht, p)} />
          )}
          {!job.lastReport && job.lastResult === 'error' && job.lastMessage && (
            <p className="text-[11px] text-red-500 mt-1">{job.lastMessage} <span className="text-muted-foreground">(Grund wurde bei diesem älteren Lauf nicht erfasst — beim nächsten Lauf steht er hier.)</span></p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <button onClick={() => run(job, { by: username })} disabled={laeuftIrgendwo || !!busy || job.lastResult === 'running'} title={laeuftIrgendwo ? 'Es läuft bereits ein Backup' : undefined} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-40"><Play size={12} />Jetzt ausführen</button>
        <button onClick={onEdit} disabled={!!busy} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40"><Pencil size={12} />Bearbeiten</button>
        {job.scheduled && (
          <button onClick={onPause} disabled={!!busy} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40">
            {busy === 'pause' ? <Loader2 size={12} className="animate-spin" /> : job.status === 'active' ? <Pause size={12} /> : <Play size={12} />}{job.status === 'active' ? 'Pausieren' : 'Fortsetzen'}
          </button>
        )}
        <button onClick={zielOeffnen} title={`Ziel öffnen: ${zielUnc(job)}`} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent"><ExternalLink size={12} />Ziel öffnen</button>
        <button onClick={() => setVerlauf(v => !v)} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent">{verlauf ? <ChevronDown size={12} /> : <History size={12} />}Verlauf</button>
        <button onClick={onDelete} disabled={!!busy} className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-red-500/40 text-red-500 hover:bg-red-500/10 disabled:opacity-40"><Trash2 size={12} />Löschen</button>
      </div>
      {oeffnenFehler && <p className="text-[10px] text-amber-500 mt-1 break-all">{oeffnenFehler}</p>}
      {verlauf && <Verlauf jobId={job.id} aktualisiert={aktualisiert} />}
    </div>
  )
}

// ── Hauptscreen ───────────────────────────────────────────────────────────────
export default function Backups() {
  const username = useAuthStore(s => s.session?.user?.username || s.session?.user?.displayName || '')
  const [jobs, setJobs] = useState<BackupJob[]>([])
  const [loading, setLoading] = useState(true)
  const [ladeFehler, setLadeFehler] = useState('')
  const [editor, setEditor] = useState<{ draft: Draft; original?: BackupJob } | null>(null)
  const [nativeInfo, setNativeInfo] = useState<Record<string, NativeTaskInfo | 'laedt'>>({})
  const [pcStand, setPcStand] = useState<Record<string, PcSyncStand>>({})
  const [busy, setBusy] = useState<Record<string, string>>({})
  const [aktionsFehler, setAktionsFehler] = useState<Record<string, string>>({})
  const [pendingDelete, setPendingDelete] = useState<{ job: BackupJob; fehler?: string; laeuft?: boolean } | null>(null)
  const [ich, setIch] = useState('')
  const [serverHosts, setServerHosts] = useState<string[]>([])
  const fertigZaehler = useBackupRunStore(s => s.fertigZaehler)
  const nativGeprueft = useRef<Set<string>>(new Set())

  useEffect(() => { void eigenerRechner().then(setIch) }, [])
  useEffect(() => {
    void api().netReadJsonAsync<{ tiles?: { hostname?: string }[] }>('server_monitor/config.json')
      .then(c => setServerHosts((c?.tiles ?? []).map(t => (t.hostname || '').trim()).filter(Boolean)))
      .catch(() => { /* keine Vorschläge */ })
  }, [])

  const refresh = useCallback(async (still = false) => {
    if (!still) setLoading(true)
    try { setJobs(await listJobs()); setLadeFehler('') }
    catch (e) { setLadeFehler(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  // Nach jedem Lauf und jede Minute still nachladen (Status anderer Admins/PC-Aufgaben)
  useEffect(() => { if (fertigZaehler) void refresh(true) }, [fertigZaehler, refresh])
  useEffect(() => { const t = setInterval(() => { void refresh(true) }, 60_000); return () => clearInterval(t) }, [refresh])

  // PC-Aufgaben: Live-Status (WinRM) + Ergebnisse (UNC) — je Job einmal pro Öffnen, 2 gleichzeitig
  const pruefeNativ = useCallback(async (liste: BackupJob[], erzwingen = false) => {
    const offen = liste.filter(j => j.mechanism === 'native' && j.scheduled && (erzwingen || !nativGeprueft.current.has(j.id)))
    offen.forEach(j => nativGeprueft.current.add(j.id))
    if (!offen.length) return
    setNativeInfo(prev => ({ ...prev, ...Object.fromEntries(offen.map(j => [j.id, 'laedt' as const])) }))
    let neu = 0
    for (let i = 0; i < offen.length; i += 2) {
      await Promise.all(offen.slice(i, i + 2).map(async j => {
        const [info, stand] = await Promise.all([queryNativeTask(j), syncPcErgebnisse(j).catch(() => null)])
        setNativeInfo(prev => ({ ...prev, [j.id]: info }))
        if (stand) { setPcStand(prev => ({ ...prev, [j.id]: stand })); neu += stand.neu }
      }))
    }
    if (neu) void refresh(true)
  }, [refresh])
  useEffect(() => { const std = jobs.filter(j => j.art !== 'chiron'); if (std.length) void pruefeNativ(std) }, [jobs, pruefeNativ])

  async function chironAnlegen() {
    const k = standardKonfig()
    const job: BackupJob = {
      id: newId('chiron'), art: 'chiron', name: 'Chiron Backup',
      source: { target: 'w3294', drive: 'D', folders: [] }, dest: { kind: 'network', target: 'w3294', drive: 'D', path: k.basePath },
      mirror: false, scheduled: false, mechanism: 'tool', status: 'active', createdBy: username, createdAt: new Date().toISOString(),
      chiron: { server: 'w3294', konfig: k },
    }
    const r = await createJob(job)
    if (!r.ok) { setLadeFehler(r.error || 'Kachel konnte nicht angelegt werden'); return }
    void protokolliere('w3294', username, 'kachel-angelegt')
    void refresh(true)
  }

  const vorschlaege = useMemo(() => {
    const s = new Set<string>()
    for (const h of serverHosts) s.add(h)
    for (const j of jobs) { if (j.source.target) s.add(j.source.target); if (j.dest.target) s.add(j.dest.target) }
    return [...s].sort((a, b) => a.localeCompare(b, 'de'))
  }, [jobs, serverHosts])

  function setzeBusy(id: string, v: string) { setBusy(prev => { const n = { ...prev }; if (v) n[id] = v; else delete n[id]; return n }) }
  function setzeFehler(id: string, v: string) { setAktionsFehler(prev => { const n = { ...prev }; if (v) n[id] = v; else delete n[id]; return n }) }

  async function togglePause(job: BackupJob) {
    const next = job.status === 'active' ? 'paused' : 'active'
    setzeBusy(job.id, 'pause'); setzeFehler(job.id, '')
    try {
      let nativeFehler = job.nativeFehler
      if (job.mechanism === 'native' && job.scheduled) {
        const r = await setNativeTaskAktiv(job, next === 'active')
        if (!r.ok && r.fehlt && next === 'active') {
          const reg = await registerNativeTask(job)
          nativeFehler = reg.ok ? undefined : reg.error
        } else if (!r.ok && !r.fehlt) {
          setzeFehler(job.id, `${next === 'paused' ? 'Pausieren' : 'Fortsetzen'} auf dem PC fehlgeschlagen: ${r.error}${next === 'paused' ? ' — die Aufgabe läuft dort weiter!' : ''}`)
          return
        } else if (r.ok) nativeFehler = undefined
      }
      // Nach dem Fortsetzen zählen nur noch künftige Termine (kein sofortiges Nachholen der Pause)
      const res = await updateJob(job.id, { status: next, nativeFehler, ...(next === 'active' ? { planSeit: new Date().toISOString() } : {}) })
      if (!res.ok) setzeFehler(job.id, res.error || 'Speichern fehlgeschlagen')
    } finally { setzeBusy(job.id, ''); void refresh(true); nativGeprueft.current.delete(job.id) }
  }

  async function neuEinrichten(job: BackupJob) {
    setzeBusy(job.id, 'einrichten'); setzeFehler(job.id, '')
    try {
      const r = await registerNativeTask(job)
      await updateJob(job.id, { nativeFehler: r.ok ? undefined : r.error })
      if (!r.ok) setzeFehler(job.id, `PC-Aufgabe konnte nicht eingerichtet werden: ${r.error}`)
    } finally {
      setzeBusy(job.id, '')
      await refresh(true)
      void pruefeNativ(jobs.filter(j => j.id === job.id), true)
    }
  }

  async function doDelete(trotzdem = false) {
    if (!pendingDelete) return
    const job = pendingDelete.job
    setzeBusy(job.id, 'loeschen')
    try {
      if (job.mechanism === 'native' && job.scheduled && !trotzdem) {
        const u = await unregisterNativeTask(job)
        if (!u.ok) { setPendingDelete({ job, fehler: u.error }); return }
      }
      const r = await deleteJob(job.id)
      if (!r.ok) { setPendingDelete({ job, fehler: r.error }); return }
      setPendingDelete(null)
    } finally { setzeBusy(job.id, ''); void refresh(true) }
  }

  /** Protokollpfad des ausführenden PCs → hier öffenbar (eigener PC lokal, sonst über C$). */
  const oeffnePfad = useCallback((b: LaufBericht, p: string, job?: BackupJob) => {
    if (!isAbsoluteLocalPath(p)) return p
    if (b.art === 'pc' && job) return localToUnc(job.source.target, p)
    const r = (b.rechner || '').toUpperCase()
    if (r && ich && r !== ich) return localToUnc(r, p)
    return p
  }, [ich])

  const runJobId = useBackupRunStore(s => s.jobId)
  const runJob = jobs.find(j => j.id === runJobId)

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <DatabaseBackup size={22} className="text-blue-500" />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-foreground">Back-Ups</h1>
          <p className="text-xs text-muted-foreground">Ordner eines PCs (per Admin-Freigabe) sichern — nur neue/geänderte Dateien, lokal oder auf einen anderen PC/Server, sofort oder geplant.</p>
        </div>
        <button onClick={() => { void refresh(); nativGeprueft.current.clear() }} disabled={loading} title="Neu laden" className="p-2 rounded-md border border-border hover:bg-accent text-muted-foreground disabled:opacity-40"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
        {!jobs.some(j => j.art === 'chiron') && !loading && !ladeFehler && (
          <button onClick={chironAnlegen} title="Kachel für den AMCube-Sync (Chiron-Anlagen → w3294) anlegen" className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent"><Factory size={14} />Chiron Backup</button>
        )}
        <button onClick={() => setEditor({ draft: emptyDraft() })} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={14} />Neues Backup</button>
      </div>

      <LaufBanner username={username} oeffnePfad={(b, p) => oeffnePfad(b, p, runJob)} />

      <div className="flex-1 overflow-y-auto p-6">
        {ladeFehler && (
          <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-500 flex items-center gap-2">
            <AlertTriangle size={14} />{ladeFehler}
            <button onClick={() => refresh()} className="ml-auto underline">Erneut versuchen</button>
          </div>
        )}
        {loading && !jobs.length ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 size={16} className="animate-spin" />Lade…</div>
        ) : jobs.length === 0 && !ladeFehler ? (
          <div className="text-center py-16">
            <DatabaseBackup size={40} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-foreground">Noch keine Backups angelegt</p>
            <button onClick={() => setEditor({ draft: emptyDraft() })} className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={14} />Neues Backup</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {[...jobs.filter(j => j.art === 'chiron'), ...jobs.filter(j => j.art !== 'chiron')].map(job => job.art === 'chiron' && job.chiron ? (
              <div key={job.id} className="xl:col-span-2">
                <ChironKarte job={job} username={username} ich={ich} onGeaendert={() => { void refresh(true) }} />
              </div>
            ) : (
              <div key={job.id}>
                <JobKarte job={job} username={username} ich={ich}
                  nativ={nativeInfo[job.id]} pcStand={pcStand[job.id]} busy={busy[job.id] || ''} aktualisiert={fertigZaehler}
                  onEdit={() => setEditor({ draft: draftFromJob(job), original: job })}
                  onDelete={() => setPendingDelete({ job, laeuft: job.lastResult === 'running' })}
                  onPause={() => togglePause(job)} onNeuEinrichten={() => neuEinrichten(job)}
                  oeffnePfad={(b, p) => oeffnePfad(b, p, job)} />
                {aktionsFehler[job.id] && <p className="text-[11px] text-red-500 mt-1 px-1 flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{aktionsFehler[job.id]}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {editor && (
        <BackupEditor initial={editor.draft} original={editor.original} username={username} vorschlaege={vorschlaege}
          onClose={() => setEditor(null)}
          onSaved={() => { const id = editor.original?.id; setEditor(null); if (id) nativGeprueft.current.delete(id); void refresh(true) }} />
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setPendingDelete(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2"><Trash2 size={18} className="text-red-500" /><h3 className="text-base font-semibold text-foreground">Backup löschen?</h3></div>
            <p className="text-sm text-muted-foreground mb-2">„{pendingDelete.job.name}" wirklich löschen? {pendingDelete.job.mechanism === 'native' && pendingDelete.job.scheduled ? 'Die Aufgabe auf dem PC wird ebenfalls entfernt.' : ''} Bereits gesicherte Daten im Ziel bleiben erhalten.</p>
            {pendingDelete.laeuft && <p className="text-xs text-amber-500 mb-2">Das Backup läuft gerade — ein laufender Kopiervorgang wird dadurch nicht abgebrochen.</p>}
            {pendingDelete.fehler && (
              <p className="text-xs text-red-500 mb-3 flex items-start gap-1"><AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>Nicht gelöscht: {pendingDelete.fehler}{pendingDelete.job.mechanism === 'native' ? ' Wenn du trotzdem löschst, läuft die Aufgabe auf dem PC weiter, bis sie dort von Hand entfernt wird (Aufgabenplanung → ' + (pendingDelete.job.nativeTaskName || 'ITAdminBackup_…') + ').' : ''}</span>
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingDelete(null)} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Abbrechen</button>
              {pendingDelete.fehler && pendingDelete.job.mechanism === 'native' && (
                <button onClick={() => doDelete(true)} className="px-3 py-1.5 text-xs rounded-md border border-red-500/40 text-red-500 hover:bg-red-500/10">Trotzdem löschen</button>
              )}
              <button onClick={() => doDelete(false)} disabled={busy[pendingDelete.job.id] === 'loeschen'} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-50">
                {busy[pendingDelete.job.id] === 'loeschen' && <Loader2 size={12} className="animate-spin" />}{pendingDelete.fehler ? 'Erneut versuchen' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
