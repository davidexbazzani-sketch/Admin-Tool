import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Clock, Plus, Pause, Play, Trash2, Loader, ChevronRight, ChevronDown,
  X, Save, Monitor, CheckSquare, Info, Pencil, Bell, RefreshCw,
  ArrowUp, ArrowDown, Search, Wifi,
} from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore, useIsMasterAdmin } from '../store/authStore'
import { createLogger } from '../utils/activityLogger'
import { CATEGORIES } from '../utils/remoteCommands'
import type { ScheduledTask, UserEmailConfig } from '../types/auth'

const log = createLogger('scheduled-tasks')
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const EMAIL_CONFIG_PATH = (u: string) => `email_config/${u}.json`

type View = 'list' | 'form'
interface SelCmd { catId: string; cmdId: string; input?: string; notifyEmail?: string }
interface SvcInfo { name: string; displayName: string; status: string }

// ── Helper: load per-user email config ────────────────────────────────────────
async function loadEmailCfg(username: string): Promise<UserEmailConfig | null> {
  try {
    return await api().netReadJson<UserEmailConfig>(EMAIL_CONFIG_PATH(username))
  } catch { return null }
}

// ── Helper: send email via nodemailer ─────────────────────────────────────────
async function sendMail(cfg: UserEmailConfig, to: string, subject: string, body: string) {
  if (!cfg.email || !cfg.smtp) return
  await api().sendEmailRaw({
    to, subject, body,
    smtp: cfg.smtp, port: cfg.port, useTls: cfg.useTls, from: cfg.email,
  })
}

// ── Helper: check if a task should run now ────────────────────────────────────
function shouldRunNow(task: ScheduledTask, now: Date): boolean {
  if (task.status !== 'active') return false
  const s = task.schedule
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  if (s.time !== hhmm) return false
  const today = now.toISOString().slice(0, 10)
  const dow = now.getDay()
  if (s.type === 'once') {
    return (s.dates ?? []).includes(today)
  }
  // recurring
  if (!(s.days ?? []).includes(dow)) return false
  if (s.repeat === 'biweekly') {
    // count weeks since epoch monday
    const ms = now.getTime()
    const weekNum = Math.floor(ms / (7 * 24 * 60 * 60 * 1000))
    return weekNum % 2 === 0
  }
  if (s.repeat === 'monthly') {
    // run on the first matching weekday of the month
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    // find first occurrence of this dow in month
    let d = firstOfMonth
    while (d.getDay() !== dow) d = new Date(d.getTime() + 86400000)
    return d.getDate() === now.getDate()
  }
  return true // weekly
}

export default function ScheduledTasks() {
  const isMaster = useIsMasterAdmin()
  const session  = useAuthStore(s => s.session)
  const user     = session?.user
  const username = user?.username ?? ''

  const [view, setView]         = useState<View>('list')
  const [tasks, setTasks]       = useState<ScheduledTask[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null)

  // Form state
  const [taskName,    setTaskName]    = useState('')
  const [deviceInput, setDeviceInput] = useState('')
  const [selCmds,     setSelCmds]     = useState<SelCmd[]>([])
  const [inputVals,   setInputVals]   = useState<Record<string, string>>({})
  const [openCats,    setOpenCats]    = useState<Set<string>>(new Set())
  const [schedType,   setSchedType]   = useState<'once' | 'recurring'>('recurring')
  const [schedTime,   setSchedTime]   = useState('08:00')
  const [schedDays,   setSchedDays]   = useState<number[]>([1])
  const [schedDate,   setSchedDate]   = useState('')
  const [schedRepeat, setSchedRepeat] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly')
  // Reboot options
  const [rebootPre,       setRebootPre]       = useState(false)
  const [rebootPreRecip,  setRebootPreRecip]  = useState('')
  const [rebootPreMins,   setRebootPreMins]   = useState(30)
  const [rebootOnline,    setRebootOnline]    = useState(false)
  const [rebootOnlineRecip, setRebootOnlineRecip] = useState('')
  const [rebootSvcCheck,  setRebootSvcCheck]  = useState('')

  // Service query state (per service-command)
  const [svcQueryDevice, setSvcQueryDevice] = useState<Record<string, string>>({})
  const [svcList, setSvcList]               = useState<Record<string, SvcInfo[]>>({})
  const [svcLoading, setSvcLoading]         = useState<Record<string, boolean>>({})
  const [svcError, setSvcError]             = useState<Record<string, string>>({})
  const [svcSearch, setSvcSearch]           = useState<Record<string, string>>({})

  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ranThisMinute = useRef<Set<string>>(new Set())

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api().netReadJson<ScheduledTask[]>('scheduled_tasks/tasks.json')
      setTasks(data ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadTasks() }, [loadTasks])

  // ── Scheduler: check every 30 seconds ────────────────────────────────────────
  useEffect(() => {
    schedulerRef.current = setInterval(async () => {
      const now = new Date()
      const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`
      // Get fresh tasks from state (closure issue: use ref)
      const currentTasks: ScheduledTask[] = await api().netReadJson('scheduled_tasks/tasks.json').catch(() => []) ?? []
      for (const task of currentTasks) {
        const taskKey = `${task.id}-${minuteKey}`
        if (ranThisMinute.current.has(taskKey)) continue
        if (!shouldRunNow(task, now)) continue
        ranThisMinute.current.add(taskKey)
        runTask(task)
      }
      // Clean up old minute keys
      if (ranThisMinute.current.size > 500) ranThisMinute.current.clear()
    }, 30000)
    return () => { if (schedulerRef.current) clearInterval(schedulerRef.current) }
  }, [])

  async function runTask(task: ScheduledTask) {
    const emailCfg = await loadEmailCfg(username)
    // Check if reboot task with pre-email
    const hasReboot = task.commands.some(c => c.catId === 'reboot')
    if (hasReboot && task.rebootOptions?.preRebootEmail?.enabled && emailCfg) {
      const mins = task.rebootOptions.preRebootEmail.minutesBefore
      const recip = task.rebootOptions.preRebootEmail.recipients || emailCfg.notifyEmail
      if (recip && mins > 0) {
        setTimeout(async () => {
          try {
            await sendMail(emailCfg, recip,
              `IT Admin Tool – Reboot geplant: ${task.name}`,
              `Geräte: ${task.devices.join(', ')}\nReboot startet in ${mins} Minuten.`)
          } catch { /* ignore */ }
        }, Math.max(0, (task.schedule.time ? 0 : mins * 60000) - mins * 60000))
      }
    }

    // Execute commands on all devices
    const results: Record<string, 'success' | 'error'> = {}
    for (const device of task.devices) {
      for (const sc of task.commands) {
        const cat = CATEGORIES.find(c => c.id === sc.catId)
        const cmd = cat?.commands.find(c => c.id === sc.cmdId)
        if (!cmd) continue
        let ok = false
        try {
          const psCmd = cmd.buildCmd(device, sc.input)
          const res = await api().runPowerShell(psCmd, 120000)
          ok = res.exitCode === 0
          results[`${device}/${sc.cmdId}`] = ok ? 'success' : 'error'
        } catch {
          results[`${device}/${sc.cmdId}`] = 'error'
        }
        // Per-command email notification
        if (sc.notifyEmail && emailCfg) {
          try {
            await sendMail(emailCfg, sc.notifyEmail,
              `IT Admin Tool – Aufgabe: ${task.name} (${cmd.func})`,
              `Aufgabe: ${task.name}\nBefehl: ${cmd.func}\nGerät: ${device}\nErgebnis: ${ok ? 'Erfolgreich' : 'Fehler'}\nZeit: ${new Date().toLocaleString('de-DE')}`)
          } catch { /* ignore */ }
        }
      }
    }

    // Update lastRun / lastResult
    const allOk = Object.values(results).every(r => r === 'success')
    const updated = tasks.map(t =>
      t.id === task.id ? { ...t, lastRun: new Date().toISOString(), lastResult: allOk ? 'success' : 'error' as const } : t
    )
    await api().netWriteJson('scheduled_tasks/tasks.json', updated)
    setTasks(updated)

    // After-reboot online notification
    if (hasReboot && task.rebootOptions?.onlineNotification?.enabled && emailCfg) {
      const recip = task.rebootOptions.onlineNotification.recipients || emailCfg.notifyEmail
      if (recip) {
        const services = task.rebootOptions.onlineNotification.checkServices ?? []
        // Poll all devices until online
        for (const device of task.devices) {
          pollUntilOnline(device, services, emailCfg, recip, task.name)
        }
      }
    }
  }

  async function pollUntilOnline(device: string, services: string[], cfg: UserEmailConfig, recip: string, taskName: string) {
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 60000))
      try {
        const pingResult = await api().runPowerShell(`Test-Connection -ComputerName '${device}' -Count 1 -Quiet`, 10000)
        if (pingResult.stdout.trim().toLowerCase() === 'true') {
          // Check services if needed
          if (services.length > 0) {
            const svcScript = `Get-Service -ComputerName '${device}' -Name ${services.map(s => `'${s}'`).join(',')} -EA SilentlyContinue | Where-Object {$_.Status -ne 'Running'} | Measure-Object | Select-Object -ExpandProperty Count`
            const svcRes = await api().runPowerShell(svcScript, 15000)
            if (parseInt(svcRes.stdout.trim()) > 0) continue // services not yet running
          }
          await sendMail(cfg, recip, `IT Admin Tool – ${device} wieder online`,
            `Aufgabe: ${taskName}\nGerät: ${device}\nStatus: Online und bereit\nZeit: ${new Date().toLocaleString('de-DE')}`)
          return
        }
      } catch { /* ignore */ }
    }
  }

  async function saveTasks(updated: ScheduledTask[]) {
    await api().netWriteJson('scheduled_tasks/tasks.json', updated)
    setTasks(updated)
  }

  function hasRebootCmd() {
    return selCmds.some(sc => sc.catId === 'reboot')
  }

  function buildTaskFromForm(id?: string): ScheduledTask {
    const devices = deviceInput.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
    const commands: ScheduledTask['commands'] = selCmds.map(sc => ({
      catId: sc.catId, cmdId: sc.cmdId,
      input: inputVals[sc.catId + sc.cmdId] || undefined,
      notifyEmail: sc.notifyEmail || undefined,
    }))
    const rebootOptions: ScheduledTask['rebootOptions'] = hasRebootCmd() ? {
      preRebootEmail: { enabled: rebootPre, recipients: rebootPreRecip, minutesBefore: rebootPreMins },
      onlineNotification: { enabled: rebootOnline, recipients: rebootOnlineRecip, checkServices: rebootSvcCheck.split(',').map(s=>s.trim()).filter(Boolean) },
    } : undefined
    return {
      id: id ?? `task-${Date.now()}`,
      name: taskName.trim(),
      devices,
      commands,
      schedule: schedType === 'recurring'
        ? { type: 'recurring', days: schedDays, time: schedTime, repeat: schedRepeat }
        : { type: 'once', dates: [schedDate], time: schedTime },
      rebootOptions,
      status: editingTask?.status ?? 'active',
      createdAt: editingTask?.createdAt ?? new Date().toISOString(),
      createdBy: editingTask?.createdBy ?? (user?.displayName ?? user?.username ?? 'Unknown'),
      lastRun: editingTask?.lastRun,
      lastResult: editingTask?.lastResult,
    }
  }

  function populateFormFromTask(task: ScheduledTask) {
    setTaskName(task.name)
    setDeviceInput(task.devices.join('\n'))
    const cmds: SelCmd[] = task.commands.map(c => ({ catId: c.catId, cmdId: c.cmdId, input: c.input, notifyEmail: c.notifyEmail }))
    setSelCmds(cmds)
    const vals: Record<string, string> = {}
    task.commands.forEach(c => { if (c.input) vals[c.catId + c.cmdId] = c.input })
    setInputVals(vals)
    setSchedType(task.schedule.type)
    setSchedTime(task.schedule.time)
    setSchedDays(task.schedule.days ?? [1])
    setSchedDate(task.schedule.dates?.[0] ?? '')
    setSchedRepeat(task.schedule.repeat ?? 'weekly')
    const ro = task.rebootOptions
    setRebootPre(ro?.preRebootEmail?.enabled ?? false)
    setRebootPreRecip(ro?.preRebootEmail?.recipients ?? '')
    setRebootPreMins(ro?.preRebootEmail?.minutesBefore ?? 30)
    setRebootOnline(ro?.onlineNotification?.enabled ?? false)
    setRebootOnlineRecip(ro?.onlineNotification?.recipients ?? '')
    setRebootSvcCheck((ro?.onlineNotification?.checkServices ?? []).join(', '))
  }

  function openEdit(task: ScheduledTask) {
    setEditingTask(task)
    populateFormFromTask(task)
    setView('form')
  }

  function resetForm() {
    setTaskName(''); setDeviceInput(''); setSelCmds([]); setInputVals({})
    setOpenCats(new Set())
    setSchedType('recurring'); setSchedTime('08:00'); setSchedDays([1])
    setSchedDate(''); setSchedRepeat('weekly')
    setRebootPre(false); setRebootPreRecip(''); setRebootPreMins(30)
    setRebootOnline(false); setRebootOnlineRecip(''); setRebootSvcCheck('')
    setEditingTask(null)
    setSvcQueryDevice({}); setSvcList({}); setSvcLoading({}); setSvcError({}); setSvcSearch({})
  }

  async function loadServices(key: string, device: string) {
    if (!device.trim()) return
    setSvcLoading(p => ({ ...p, [key]: true }))
    setSvcError(p => ({ ...p, [key]: '' }))
    try {
      const ps = `Get-Service -ComputerName '${device.trim()}' -EA Stop | Select-Object Name,DisplayName,Status | Sort-Object DisplayName | ConvertTo-Json -Compress`
      const res = await api().runPowerShell(ps, 30000)
      if (res.exitCode !== 0) throw new Error(res.stderr || res.stdout)
      const raw = res.stdout.trim()
      const parsed = JSON.parse(raw)
      const arr: SvcInfo[] = (Array.isArray(parsed) ? parsed : [parsed]).map((s: Record<string, unknown>) => ({
        name: String(s.Name ?? ''), displayName: String(s.DisplayName ?? ''), status: String(s.Status ?? ''),
      }))
      setSvcList(p => ({ ...p, [key]: arr }))
    } catch (e) {
      setSvcError(p => ({ ...p, [key]: String(e) }))
      setSvcList(p => ({ ...p, [key]: [] }))
    } finally {
      setSvcLoading(p => ({ ...p, [key]: false }))
    }
  }

  function toggleSvcName(key: string, name: string) {
    const current = (inputVals[key] || '').split(',').map(s => s.trim()).filter(Boolean)
    const next = current.includes(name) ? current.filter(s => s !== name) : [...current, name]
    setInputVals(p => ({ ...p, [key]: next.join(', ') }))
  }

  function isSvcSelected(key: string, name: string) {
    return (inputVals[key] || '').split(',').map(s => s.trim()).includes(name)
  }

  function moveCmdUp(idx: number) {
    if (idx === 0) return
    setSelCmds(prev => { const n = [...prev]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n })
  }
  function moveCmdDown(idx: number) {
    setSelCmds(prev => {
      if (idx >= prev.length - 1) return prev
      const n = [...prev]; [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; return n
    })
  }
  function setCmdNotifyEmail(catId: string, cmdId: string, email: string) {
    setSelCmds(prev => prev.map(sc =>
      sc.catId === catId && sc.cmdId === cmdId ? { ...sc, notifyEmail: email } : sc
    ))
  }

  async function handleSave() {
    const devices = deviceInput.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
    if (!taskName.trim() || devices.length === 0 || selCmds.length === 0) return
    if (schedType === 'once' && !schedDate) return
    setSaving(true)
    try {
      const task = buildTaskFromForm(editingTask?.id)
      let updated: ScheduledTask[]
      if (editingTask) {
        updated = tasks.map(t => t.id === editingTask.id ? task : t)
        await log(`Aufgabe bearbeitet: "${task.name}"`, task.id)
      } else {
        updated = [...tasks, task]
        await log(`Geplante Aufgabe erstellt: "${task.name}"`, task.id)
      }
      await saveTasks(updated)
      resetForm()
      setView('list')
    } finally { setSaving(false) }
  }

  async function togglePause(task: ScheduledTask) {
    const updated = tasks.map(t =>
      t.id === task.id ? { ...t, status: t.status === 'active' ? 'paused' : 'active' } : t
    ) as ScheduledTask[]
    await saveTasks(updated)
    await log(`Aufgabe ${task.status === 'active' ? 'pausiert' : 'fortgesetzt'}: "${task.name}"`, task.id)
  }

  async function handleDelete(id: string) {
    const task = tasks.find(t => t.id === id)
    const updated = tasks.filter(t => t.id !== id)
    await saveTasks(updated)
    if (task) await log(`Aufgabe gelöscht: "${task.name}"`, id)
    setDeleteConfirm(null)
  }

  function toggleDay(d: number) {
    setSchedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort())
  }
  function toggleCat(catId: string) {
    setOpenCats(prev => { const n = new Set(prev); n.has(catId) ? n.delete(catId) : n.add(catId); return n })
  }
  function cmdKey(catId: string, cmdId: string) { return catId + cmdId }
  function isSelected(catId: string, cmdId: string) {
    return selCmds.some(sc => sc.catId === catId && sc.cmdId === cmdId)
  }
  function toggleCmd(catId: string, cmdId: string) {
    if (isSelected(catId, cmdId)) {
      setSelCmds(prev => prev.filter(sc => !(sc.catId === catId && sc.cmdId === cmdId)))
      setInputVals(prev => { const n = { ...prev }; delete n[cmdKey(catId, cmdId)]; return n })
    } else {
      setSelCmds(prev => [...prev, { catId, cmdId }])
    }
  }
  function setInput(catId: string, cmdId: string, val: string) {
    setInputVals(prev => ({ ...prev, [cmdKey(catId, cmdId)]: val }))
  }
  function formatSchedule(t: ScheduledTask) {
    const s = t.schedule
    if (s.type === 'once') return `Einmalig · ${s.dates?.[0] ?? ''} um ${s.time}`
    const days = (s.days ?? []).map(d => WEEKDAYS[d]).join(', ')
    const rep = s.repeat === 'biweekly' ? 'zweiwöchentl.' : s.repeat === 'monthly' ? 'monatl.' : 'wöchentl.'
    return `${rep} · ${days} · ${s.time}`
  }

  const devices = deviceInput.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
  const formValid = taskName.trim() && devices.length > 0 && selCmds.length > 0 &&
    (schedType === 'recurring' ? schedDays.length > 0 : !!schedDate)

  return (
    <div className="flex flex-col h-full">
      {/* Info banner */}
      <div className="shrink-0 flex items-center gap-2.5 px-5 py-2 bg-amber-500/10 border-b border-amber-500/30">
        <Info size={13} className="text-amber-400 shrink-0" />
        <p className="text-xs text-amber-400">
          Hinweis: Geplante Aufgaben werden nur ausgeführt wenn das IT Admin Tool aktiv läuft.
        </p>
      </div>

      {/* Header */}
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3">
        <Clock size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">Geplante Aufgaben</h1>
        <div className="ml-auto flex items-center gap-2">
          {view === 'list' && (
            <button onClick={() => loadTasks()} title="Aktualisieren"
              className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground transition-colors">
              <RefreshCw size={13} />
            </button>
          )}
          {view === 'list' && isMaster && (
            <button onClick={() => { resetForm(); setView('form') }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus size={12} /> Neue Aufgabe
            </button>
          )}
          {view === 'form' && (
            <button onClick={() => { resetForm(); setView('list') }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
              <X size={12} /> Abbrechen
            </button>
          )}
        </div>
      </div>

      {view === 'form' ? (
        /* ── Create / Edit Form ── */
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {editingTask && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
                <Pencil size={11} /> Aufgabe bearbeiten: <strong>{editingTask.name}</strong>
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Aufgaben-Name *</label>
              <input value={taskName} onChange={e => setTaskName(e.target.value)}
                placeholder="z.B. Wöchentlicher Neustart Produktion"
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            </div>

            {/* Devices */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Geräte * <span className="text-muted-foreground font-normal">(Hostnames, einer pro Zeile oder mit Komma getrennt)</span>
              </label>
              <textarea value={deviceInput} onChange={e => setDeviceInput(e.target.value)}
                rows={4} placeholder="PC001&#10;PC002&#10;SRV-PROD01"
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary font-mono resize-none" />
              {devices.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">{devices.length} Gerät(e) erkannt</p>
              )}
            </div>

            {/* Commands */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-2">
                Befehle * <span className="text-muted-foreground font-normal">({selCmds.length} ausgewählt)</span>
              </label>
              <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                {CATEGORIES.map(cat => {
                  const isOpen = openCats.has(cat.id)
                  const selectedCount = cat.commands.filter(cmd => isSelected(cat.id, cmd.id)).length
                  return (
                    <div key={cat.id}>
                      <button onClick={() => toggleCat(cat.id)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-accent/30 transition-colors text-left">
                        {isOpen ? <ChevronDown size={13} className="text-muted-foreground shrink-0" />
                                : <ChevronRight size={13} className="text-muted-foreground shrink-0" />}
                        <span className="text-xs font-medium text-foreground flex-1">{cat.label}</span>
                        {selectedCount > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-primary">
                            <CheckSquare size={10} /> {selectedCount}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">{cat.commands.length}</span>
                      </button>
                      {isOpen && (
                        <div className="bg-muted/5 divide-y divide-border border-t border-border">
                          {cat.commands.map(cmd => {
                            const sel = isSelected(cat.id, cmd.id)
                            const key = cmdKey(cat.id, cmd.id)
                            return (
                              <div key={cmd.id}
                                className={`px-4 py-2 ${sel ? 'bg-primary/5' : 'hover:bg-accent/20'} transition-colors`}>
                                <label className="flex items-start gap-2.5 cursor-pointer">
                                  <input type="checkbox" checked={sel}
                                    onChange={() => toggleCmd(cat.id, cmd.id)}
                                    className="mt-0.5 rounded border-border accent-primary shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-medium ${sel ? 'text-foreground' : 'text-muted-foreground'}`}>
                                        {cmd.func}
                                      </span>
                                      <span className={`text-[9px] px-1 py-0.5 rounded border ${
                                        cmd.action === 'critical' ? 'text-red-400 border-red-500/30 bg-red-500/10'
                                        : cmd.action === 'write' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                                        : 'text-muted-foreground border-border bg-muted/20'
                                      }`}>{cmd.action}</span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{cmd.when}</p>
                                    {sel && cmd.input && (
                                      <div className="mt-1.5" onClick={e => e.stopPropagation()}>
                                        {cmd.input.type === 'dropdown' ? (
                                          <select value={inputVals[key] ?? ''}
                                            onChange={e => setInput(cat.id, cmd.id, e.target.value)}
                                            className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary">
                                            <option value="">— auswählen —</option>
                                            {cmd.input.options?.map(o => <option key={o} value={o}>{o}</option>)}
                                          </select>
                                        ) : cmd.input.type === 'service' ? (
                                          /* ── Service selector ── */
                                          <div className="space-y-1.5 p-2 rounded-md bg-muted/10 border border-border">
                                            <div className="flex items-center gap-1.5">
                                              <input
                                                value={svcQueryDevice[key] ?? (deviceInput.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)[0] ?? '')}
                                                onChange={e => setSvcQueryDevice(p => ({ ...p, [key]: e.target.value }))}
                                                placeholder="Gerät für Dienst-Abfrage"
                                                className="flex-1 px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary"
                                              />
                                              <button
                                                onClick={() => loadServices(key, svcQueryDevice[key] ?? deviceInput.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)[0] ?? '')}
                                                disabled={svcLoading[key] || !(svcQueryDevice[key] ?? deviceInput.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)[0])}
                                                className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                                              >
                                                {svcLoading[key] ? <Loader size={10} className="animate-spin" /> : <Wifi size={10} />}
                                                Laden
                                              </button>
                                            </div>
                                            {svcError[key] && <p className="text-[10px] text-red-400">{svcError[key]}</p>}
                                            {(svcList[key]?.length ?? 0) > 0 && (
                                              <>
                                                <div className="relative">
                                                  <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                  <input
                                                    value={svcSearch[key] ?? ''}
                                                    onChange={e => setSvcSearch(p => ({ ...p, [key]: e.target.value }))}
                                                    placeholder="Suchen…"
                                                    className="w-full pl-6 pr-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary"
                                                  />
                                                </div>
                                                <div className="max-h-36 overflow-y-auto divide-y divide-border rounded border border-border">
                                                  {svcList[key]
                                                    .filter(s => !svcSearch[key] || s.displayName.toLowerCase().includes(svcSearch[key].toLowerCase()) || s.name.toLowerCase().includes(svcSearch[key].toLowerCase()))
                                                    .map(s => (
                                                      <label key={s.name} className={`flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-accent/20 ${isSvcSelected(key, s.name) ? 'bg-primary/5' : ''}`}>
                                                        <input type="checkbox" checked={isSvcSelected(key, s.name)}
                                                          onChange={() => toggleSvcName(key, s.name)}
                                                          className="rounded accent-primary shrink-0" />
                                                        <span className={`text-[10px] flex-1 min-w-0 ${isSvcSelected(key, s.name) ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                                                          {s.displayName}
                                                        </span>
                                                        <span className={`text-[9px] shrink-0 ${s.status === 'Running' ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                                                          {s.status === 'Running' ? '●' : '○'}
                                                        </span>
                                                      </label>
                                                    ))}
                                                </div>
                                              </>
                                            )}
                                            {inputVals[key] && (
                                              <p className="text-[10px] text-primary">
                                                Ausgewählt: {inputVals[key]}
                                              </p>
                                            )}
                                            {!svcList[key]?.length && !svcLoading[key] && (
                                              <input value={inputVals[key] ?? ''}
                                                onChange={e => setInput(cat.id, cmd.id, e.target.value)}
                                                placeholder="Oder manuell eingeben (komma-getrennt)"
                                                className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                                            )}
                                          </div>
                                        ) : (
                                          <input value={inputVals[key] ?? ''}
                                            onChange={e => setInput(cat.id, cmd.id, e.target.value)}
                                            placeholder={cmd.input.placeholder ?? ''}
                                            className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </label>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Schedule */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-2">Zeitplan *</label>
              <div className="flex gap-2 mb-3">
                {(['recurring', 'once'] as const).map(t => (
                  <button key={t} onClick={() => setSchedType(t)}
                    className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${schedType === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}>
                    {t === 'recurring' ? 'Wiederkehrend' : 'Einmalig'}
                  </button>
                ))}
              </div>
              {schedType === 'recurring' && (
                <div className="space-y-3 p-4 rounded-md border border-border bg-muted/5">
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-2">Wochentage</p>
                    <div className="flex gap-1.5">
                      {WEEKDAYS.map((d, i) => (
                        <button key={i} onClick={() => toggleDay(i)}
                          className={`w-8 h-8 text-xs rounded-md border font-medium transition-colors ${schedDays.includes(i) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-4 items-center">
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">Uhrzeit</p>
                      <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                        className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">Wiederholung</p>
                      <select value={schedRepeat} onChange={e => setSchedRepeat(e.target.value as 'weekly' | 'biweekly' | 'monthly')}
                        className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary">
                        <option value="weekly">Wöchentlich</option>
                        <option value="biweekly">Zweiwöchentlich</option>
                        <option value="monthly">Monatlich (1. Vorkommen)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
              {schedType === 'once' && (
                <div className="flex gap-4 items-center p-4 rounded-md border border-border bg-muted/5">
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">Datum *</p>
                    <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                      className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">Uhrzeit</p>
                    <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                      className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                  </div>
                </div>
              )}
            </div>

            {/* Reboot special options */}
            {hasRebootCmd() && (
              <div className="space-y-3 p-4 rounded-md border border-amber-500/30 bg-amber-500/5">
                <div className="flex items-center gap-2">
                  <Bell size={13} className="text-amber-400" />
                  <p className="text-xs font-semibold text-amber-400">Reboot-Optionen</p>
                </div>

                {/* Pre-reboot email */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={rebootPre} onChange={e => setRebootPre(e.target.checked)}
                      className="rounded accent-amber-500" />
                    <span className="text-xs text-foreground">E-Mail X Minuten vor Reboot senden</span>
                  </label>
                  {rebootPre && (
                    <div className="flex gap-3 pl-5">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1">Minuten vorher</p>
                        <input type="number" min={1} max={1440} value={rebootPreMins}
                          onChange={e => setRebootPreMins(Number(e.target.value))}
                          className="w-20 px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] text-muted-foreground mb-1">Empfänger (leer = Benachrichtigungs-E-Mail)</p>
                        <input type="email" placeholder="empfaenger@firma.de" value={rebootPreRecip}
                          onChange={e => setRebootPreRecip(e.target.value)}
                          className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Online notification */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={rebootOnline} onChange={e => setRebootOnline(e.target.checked)}
                      className="rounded accent-amber-500" />
                    <span className="text-xs text-foreground">E-Mail wenn Gerät wieder online</span>
                  </label>
                  {rebootOnline && (
                    <div className="flex gap-3 pl-5 flex-wrap">
                      <div className="flex-1 min-w-[180px]">
                        <p className="text-[10px] text-muted-foreground mb-1">Empfänger</p>
                        <input type="email" placeholder="empfaenger@firma.de" value={rebootOnlineRecip}
                          onChange={e => setRebootOnlineRecip(e.target.value)}
                          className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                      </div>
                      <div className="flex-1 min-w-[180px]">
                        <p className="text-[10px] text-muted-foreground mb-1">Dienste prüfen (optional, komma-getrennt)</p>
                        <input type="text" placeholder="WinRM, Spooler" value={rebootSvcCheck}
                          onChange={e => setRebootSvcCheck(e.target.value)}
                          className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Timeline overview */}
            {selCmds.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/10 border-b border-border">
                  <Clock size={12} className="text-primary" />
                  <p className="text-xs font-semibold text-foreground">Zeitplan-Übersicht</p>
                  <span className="text-[10px] text-muted-foreground ml-1">({selCmds.length} Aktivität{selCmds.length !== 1 ? 'en' : ''})</span>
                </div>
                <div className="divide-y divide-border">
                  {selCmds.map((sc, idx) => {
                    const cat = CATEGORIES.find(c => c.id === sc.catId)
                    const cmd = cat?.commands.find(c => c.id === sc.cmdId)
                    if (!cat || !cmd) return null
                    const inputSummary = inputVals[sc.catId + sc.cmdId]
                    return (
                      <div key={sc.catId + sc.cmdId + idx} className="px-3 py-2 hover:bg-accent/10 transition-colors">
                        <div className="flex items-center gap-2">
                          {/* Order controls */}
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button onClick={() => moveCmdUp(idx)} disabled={idx === 0}
                              className="p-0.5 rounded hover:bg-accent disabled:opacity-20 text-muted-foreground">
                              <ArrowUp size={9} />
                            </button>
                            <button onClick={() => moveCmdDown(idx)} disabled={idx === selCmds.length - 1}
                              className="p-0.5 rounded hover:bg-accent disabled:opacity-20 text-muted-foreground">
                              <ArrowDown size={9} />
                            </button>
                          </div>
                          {/* Position badge */}
                          <span className="text-[9px] w-4 text-center font-mono text-muted-foreground shrink-0">{idx + 1}</span>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] text-muted-foreground">{cat.label}</span>
                              <span className="text-muted-foreground">›</span>
                              <span className="text-xs font-medium text-foreground">{cmd.func}</span>
                              <span className={`text-[9px] px-1 py-0.5 rounded border ${
                                cmd.action === 'critical' ? 'text-red-400 border-red-500/30 bg-red-500/10'
                                : cmd.action === 'write' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                                : 'text-muted-foreground border-border bg-muted/20'
                              }`}>{cmd.action}</span>
                            </div>
                            {inputSummary && (
                              <p className="text-[10px] text-primary mt-0.5 truncate max-w-xs" title={inputSummary}>
                                {inputSummary}
                              </p>
                            )}
                            {/* Per-command email notification */}
                            <div className="flex items-center gap-1.5 mt-1">
                              <Bell size={9} className={sc.notifyEmail ? 'text-amber-400' : 'text-muted-foreground'} />
                              <input
                                value={sc.notifyEmail ?? ''}
                                onChange={e => setCmdNotifyEmail(sc.catId, sc.cmdId, e.target.value)}
                                placeholder="E-Mail nach Ausführung (optional)"
                                className="flex-1 px-1.5 py-0.5 text-[10px] rounded border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
                              />
                            </div>
                          </div>
                          {/* Delete */}
                          <button onClick={() => toggleCmd(sc.catId, sc.cmdId)}
                            className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors shrink-0">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Schedule summary row */}
                <div className="px-3 py-2 bg-muted/5 border-t border-border flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Clock size={10} />
                  <span>
                    {schedType === 'once'
                      ? `Einmalig am ${schedDate || '—'} um ${schedTime}`
                      : `${schedRepeat === 'biweekly' ? 'Zweiwöchentlich' : schedRepeat === 'monthly' ? 'Monatlich' : 'Wöchentlich'} · ${schedDays.map(d => WEEKDAYS[d]).join(', ')} · ${schedTime}`
                    }
                  </span>
                  {devices.length > 0 && (
                    <>
                      <span className="text-border">·</span>
                      <Monitor size={10} />
                      <span>{devices.length} Gerät(e)</span>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { resetForm(); setView('list') }}
                className="px-4 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
                Abbrechen
              </button>
              <button onClick={handleSave} disabled={!formValid || saving}
                className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
                {editingTask ? 'Änderungen speichern' : 'Aufgabe erstellen'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── Task List ── */
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-12">
              <Loader size={14} className="animate-spin" /> Aufgaben werden geladen…
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Clock size={32} className="opacity-30" />
              <p className="text-sm">Keine geplanten Aufgaben vorhanden</p>
              {isMaster && (
                <button onClick={() => setView('form')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 mt-1">
                  <Plus size={12} /> Erste Aufgabe erstellen
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/20 border-b border-border">
                <tr>
                  {['Name', 'Geräte', 'Befehle', 'Zeitplan', 'Letzter Lauf', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tasks.map(task => (
                  <tr key={task.id} className="hover:bg-accent/10 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{task.name}</div>
                      <div className="text-[10px] text-muted-foreground">von {task.createdBy}</div>
                      {task.rebootOptions?.preRebootEmail?.enabled && (
                        <div className="text-[10px] text-amber-400 flex items-center gap-1 mt-0.5">
                          <Bell size={9} /> Pre-Mail {task.rebootOptions.preRebootEmail.minutesBefore}min
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Monitor size={11} /><span>{task.devices.length}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[120px]" title={task.devices.join(', ')}>
                        {task.devices.slice(0, 2).join(', ')}{task.devices.length > 2 ? ` +${task.devices.length - 2}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{task.commands.length} Befehl(e)</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatSchedule(task)}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      <div>{task.lastRun ? new Date(task.lastRun).toLocaleString('de-DE') : '—'}</div>
                      {task.lastResult && (
                        <div className={`text-[10px] ${task.lastResult === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {task.lastResult === 'success' ? '✓ Erfolgreich' : '✗ Fehler'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        task.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground'
                      }`}>
                        {task.status === 'active' ? 'Aktiv' : 'Pausiert'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isMaster && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(task)} title="Bearbeiten"
                            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-primary">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => togglePause(task)} title={task.status === 'active' ? 'Pausieren' : 'Fortsetzen'}
                            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground">
                            {task.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                          </button>
                          <button onClick={() => setDeleteConfirm(task.id)} title="Löschen"
                            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-red-400">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl p-6 w-80 shadow-xl">
            <h3 className="font-semibold text-foreground mb-2">Aufgabe löschen?</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Die Aufgabe "{tasks.find(t => t.id === deleteConfirm)?.name}" wird unwiderruflich gelöscht.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
                Abbrechen
              </button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="px-3 py-1.5 text-xs rounded-md bg-red-600 text-white hover:bg-red-700">
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
