import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowRightLeft, Monitor, CheckCircle, XCircle, Loader, Wifi,
  ChevronRight, ChevronDown, RefreshCw, Play, Download,
  FileText, Clock, Users, Package, Printer, Settings2,
  LayoutList, BookTemplate, History, AlertTriangle, Info,
  Folder, ArrowRight, Minus, Check, X,
} from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'
import { createLogger } from '../utils/activityLogger'
import type {
  MigrationPhase, MainTab, PcInfo, FolderEntry, SoftwareEntry,
  DriveEntry, PrinterEntry, SettingEntry, MigrationAnalysis,
  MigrationOptions, MigrationTask, TaskStatus,
  MigrationReport, MigrationHistoryEntry, MigrationTemplate,
} from '../types/migration'
import {
  psCheckOnline, psEnsureWinRM, psGetDeviceInfo,
  psGetFolderSizes, psGetSoftwareList, psGetWingetPackages,
  psGetNetworkDrives, psGetPrinters, psCheckSettingsAvailability,
  psRobocopyFolder, psInstallWinget, psMapDrive, psAddNetworkPrinter,
  psCopySettingFolder, psCopySettingFile, psTransferWlanProfiles, psTransferEnvVars,
  parseWingetExport, matchWingetId, isSystemComponent, localToUNC,
} from '../utils/migrationCommands'

const log = createLogger('pc-migration')

// ── Constants ─────────────────────────────────────────────────────────────

const HISTORY_PATH   = 'migrations/history.json'
const TEMPLATES_PATH = 'migrations/templates.json'
const reportPath = (id: string) => `migrations/reports/${id}.json`

const SYSTEM_PRINTERS = [
  'Microsoft Print to PDF', 'Microsoft XPS Document Writer',
  'Fax', 'OneNote', 'Send To OneNote',
]

const DEFAULT_OPTIONS: MigrationOptions = {
  conflictMode: 'skip',
  autoInstallSoftware: true,
  silentInstall: true,
  excludeTempFiles: true,
  createReport: true,
  reportEmail: '',
}

const DEFAULT_SETTINGS: Omit<SettingEntry, 'available'>[] = [
  { key: 'outlook-signatures', label: 'Outlook-Signaturen',      description: 'E-Mail Signaturen (Roaming\\Microsoft\\Signatures)', selected: true },
  { key: 'edge-bookmarks',     label: 'Edge-Lesezeichen',         description: 'Favoriten aus Microsoft Edge',                        selected: true },
  { key: 'chrome-bookmarks',   label: 'Chrome-Lesezeichen',       description: 'Lesezeichen aus Google Chrome',                       selected: true },
  { key: 'wlan-profiles',      label: 'WLAN-Profile',             description: 'Gespeicherte WLAN-Verbindungen',                      selected: true },
  { key: 'quick-access',       label: 'Schnellzugriff (Explorer)', description: 'Angepinnte Ordner in der Explorer-Leiste',            selected: true },
  { key: 'env-vars',           label: 'Umgebungsvariablen',        description: 'Benutzerspezifische Umgebungsvariablen (HKCU)',        selected: false },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtMb(mb: number): string {
  if (mb < 1024) return `${mb.toFixed(0)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

function fmtMs(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} Sek.`
  const m = Math.floor(s / 60)
  return `${m} Min. ${s % 60} Sek.`
}

function statusIcon(status: TaskStatus) {
  if (status === 'waiting')  return <Minus size={13} className="text-muted-foreground" />
  if (status === 'running')  return <Loader size={13} className="animate-spin text-primary" />
  if (status === 'success')  return <Check size={13} className="text-emerald-400" />
  if (status === 'error')    return <X size={13} className="text-red-400" />
  if (status === 'warning')  return <AlertTriangle size={13} className="text-amber-400" />
  if (status === 'skipped')  return <Minus size={13} className="text-muted-foreground/40" />
  return null
}

function overallStatus(tasks: MigrationTask[]): 'success' | 'partial' | 'failed' {
  const errors = tasks.filter(t => t.status === 'error')
  const fileTasks = tasks.filter(t => t.category === 'files')
  if (fileTasks.length > 0 && fileTasks.every(t => t.status === 'error')) return 'failed'
  if (errors.length === 0) return 'success'
  return 'partial'
}

// ── Component ─────────────────────────────────────────────────────────────

export default function PCMigration() {
  const session  = useAuthStore(s => s.session)
  const performer = session?.user.displayName ?? session?.user.username ?? 'Unknown'

  // ── Tab / Phase ─────────────────────────────────────────────────────────
  const [mainTab,  setMainTab]  = useState<MainTab>('wizard')
  const [phase,    setPhase]    = useState<MigrationPhase>('connect')

  // ── Connection ──────────────────────────────────────────────────────────
  const [srcInput,     setSrcInput]     = useState('')
  const [dstInput,     setDstInput]     = useState('')
  const [srcInfo,      setSrcInfo]      = useState<PcInfo | null>(null)
  const [dstInfo,      setDstInfo]      = useState<PcInfo | null>(null)
  const [connecting,   setConnecting]   = useState<'src' | 'dst' | 'both' | null>(null)
  const [connectErr,   setConnectErr]   = useState('')

  // ── Analysis ────────────────────────────────────────────────────────────
  const [analysis,     setAnalysis]     = useState<MigrationAnalysis | null>(null)
  const [analysisLog,  setAnalysisLog]  = useState<string[]>([])

  // ── Options ─────────────────────────────────────────────────────────────
  const [options,      setOptions]      = useState<MigrationOptions>(DEFAULT_OPTIONS)

  // ── Migration ───────────────────────────────────────────────────────────
  const [tasks,        setTasks]        = useState<MigrationTask[]>([])
  const [taskIdx,      setTaskIdx]      = useState(0)
  const [progressMsg,  setProgressMsg]  = useState('')
  const [expandedTask, setExpandedTask] = useState<string | null>(null)

  // ── Report ──────────────────────────────────────────────────────────────
  const [report,       setReport]       = useState<MigrationReport | null>(null)
  const [reportNotes,  setReportNotes]  = useState('')

  // ── History & Templates ─────────────────────────────────────────────────
  const [history,      setHistory]      = useState<MigrationHistoryEntry[]>([])
  const [histLoading,  setHistLoading]  = useState(false)
  const [histDetail,   setHistDetail]   = useState<MigrationReport | null>(null)
  const [templates,    setTemplates]    = useState<MigrationTemplate[]>([])
  const [tmplName,     setTmplName]     = useState('')
  const [tmplDesc,     setTmplDesc]     = useState('')

  const cancelledRef = useRef(false)
  const startTimeRef = useRef<number>(0)

  // ── Step helper ─────────────────────────────────────────────────────────
  const stepIndex = { analyzing: 0, selection: 1, settings: 2, overview: 3, migrating: 4, report: 4 } as Record<string, number>
  const currentStep = stepIndex[phase] ?? -1

  // ── Load history / templates on tab change ───────────────────────────────
  useEffect(() => {
    if (mainTab === 'history') loadHistory()
    if (mainTab === 'templates') loadTemplates()
  }, [mainTab])

  async function loadHistory() {
    setHistLoading(true)
    try {
      const h = await api().netReadJson<MigrationHistoryEntry[]>(HISTORY_PATH)
      setHistory((h ?? []).slice().reverse()) // newest first
    } finally { setHistLoading(false) }
  }

  async function loadTemplates() {
    const t = await api().netReadJson<MigrationTemplate[]>(TEMPLATES_PATH).catch(() => null)
    setTemplates(t ?? [])
  }

  // ── Save history entry ───────────────────────────────────────────────────
  async function saveToHistory(rep: MigrationReport) {
    try {
      await api().netWriteJson(reportPath(rep.id), rep)
      const existing = await api().netReadJson<MigrationHistoryEntry[]>(HISTORY_PATH).catch(() => null) ?? []
      const entry: MigrationHistoryEntry = {
        id: rep.id, date: rep.date,
        sourcePc: rep.sourcePc, targetPc: rep.targetPc,
        sourceUser: rep.sourceUser, performedBy: rep.performedBy,
        durationMs: rep.durationMs, overallStatus: rep.overallStatus,
      }
      await api().netWriteJson(HISTORY_PATH, [...existing, entry])
    } catch { /* non-fatal */ }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 0: Connect
  // ──────────────────────────────────────────────────────────────────────────

  async function handleConnect(side: 'src' | 'dst' | 'both') {
    const srcH = srcInput.trim().toUpperCase()
    const dstH = dstInput.trim().toUpperCase()
    if (!srcH || !dstH) { setConnectErr('Bitte beide Hostnamen eingeben.'); return }
    setConnectErr('')
    setConnecting(side)

    async function connectOne(hostname: string): Promise<PcInfo> {
      const info: PcInfo = { hostname, model: '', os: '', loggedUser: '', connected: false, winrmOk: false }
      try {
        // 1. Ping
        const pingRes = await api().runPowerShell(psCheckOnline(hostname), 10000)
        if (pingRes.stdout.trim().toLowerCase() !== 'true') {
          return { ...info, error: `Nicht erreichbar (Ping fehlgeschlagen)` }
        }
        info.connected = true

        // 2. WinRM
        const winrmRes = await api().runPowerShell(psEnsureWinRM(hostname), 40000)
        const winrmOut = winrmRes.stdout.trim()
        if (winrmOut.startsWith('ERR:')) {
          return { ...info, error: `WinRM nicht aktivierbar: ${winrmOut.slice(4)}` }
        }
        info.winrmOk = true

        // 3. Device info
        const infoRes = await api().runPowerShell(psGetDeviceInfo(hostname), 20000)
        const raw = infoRes.stdout.trim()
        if (!raw.startsWith('ERR:')) {
          const d = JSON.parse(raw)
          info.model = d.model ?? ''
          info.os = d.os ?? ''
          const fullUser: string = d.loggedUser ?? ''
          info.loggedUser = fullUser.includes('\\') ? fullUser.split('\\').pop()! : fullUser
        }
        return info
      } catch (e) {
        return { ...info, error: String(e) }
      }
    }

    try {
      if (side === 'src' || side === 'both') {
        const info = await connectOne(srcH)
        setSrcInfo(info)
        if (info.error) { setConnectErr(`Quelle: ${info.error}`); setConnecting(null); return }
      }
      if (side === 'dst' || side === 'both') {
        const info = await connectOne(dstH)
        setDstInfo(info)
        if (info.error) { setConnectErr(`Ziel: ${info.error}`); setConnecting(null); return }
      }
      // If both are now connected, start analysis
      const finalSrc = side === 'src' ? srcInfo : (await connectOne(srcH))
      if (srcInfo?.winrmOk && dstInfo?.winrmOk) {
        setPhase('analyzing')
        await handleAnalyze(srcH, srcInfo?.loggedUser ?? '')
      }
    } catch (e) {
      setConnectErr(String(e))
    } finally {
      setConnecting(null)
    }
  }

  async function handleConnectBoth() {
    const srcH = srcInput.trim().toUpperCase()
    const dstH = dstInput.trim().toUpperCase()
    if (!srcH || !dstH) { setConnectErr('Bitte beide Hostnamen eingeben.'); return }
    setConnectErr('')
    setConnecting('both')

    async function connectOne(hostname: string): Promise<PcInfo> {
      const info: PcInfo = { hostname, model: '', os: '', loggedUser: '', connected: false, winrmOk: false }
      try {
        const pingRes = await api().runPowerShell(psCheckOnline(hostname), 10000)
        if (pingRes.stdout.trim().toLowerCase() !== 'true') {
          return { ...info, error: `Nicht erreichbar (Ping)` }
        }
        info.connected = true
        const winrmRes = await api().runPowerShell(psEnsureWinRM(hostname), 40000)
        if (winrmRes.stdout.trim().startsWith('ERR:')) {
          return { ...info, error: `WinRM: ${winrmRes.stdout.trim().slice(4)}` }
        }
        info.winrmOk = true
        const infoRes = await api().runPowerShell(psGetDeviceInfo(hostname), 20000)
        const raw = infoRes.stdout.trim()
        if (!raw.startsWith('ERR:') && raw.startsWith('{')) {
          const d = JSON.parse(raw)
          info.model = d.model ?? ''; info.os = d.os ?? ''
          const u: string = d.loggedUser ?? ''
          info.loggedUser = u.includes('\\') ? u.split('\\').pop()! : u
        }
        return info
      } catch (e) { return { ...info, error: String(e) } }
    }

    try {
      const [s, d] = await Promise.all([connectOne(srcH), connectOne(dstH)])
      setSrcInfo(s); setDstInfo(d)
      if (s.error)  { setConnectErr(`ALTER PC: ${s.error}`); return }
      if (d.error)  { setConnectErr(`NEUER PC: ${d.error}`); return }
      setPhase('analyzing')
      await handleAnalyze(srcH, s.loggedUser)
    } finally {
      setConnecting(null)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 1: Analysis
  // ──────────────────────────────────────────────────────────────────────────

  const addLog = useCallback((msg: string) => {
    setAnalysisLog(prev => [...prev, msg])
  }, [])

  async function handleAnalyze(srcH: string, srcUser: string) {
    setAnalysisLog([])
    cancelledRef.current = false
    const errors: string[] = []

    try {
      // ── Folders ─────────────────────────────────────────────────────────
      addLog('🔍 Analysiere Benutzerordner…')
      let folders: FolderEntry[] = []
      try {
        const r = await api().runPowerShell(psGetFolderSizes(srcH, srcUser), 90000)
        const raw = r.stdout.trim()
        if (!raw.startsWith('ERR:') && raw.startsWith('[')) {
          const arr = JSON.parse(raw)
          folders = arr.map((f: Record<string, unknown>) => ({
            label: String(f.label ?? ''), localPath: String(f.localPath ?? ''),
            sizeMb: Number(f.sizeMb ?? 0), fileCount: Number(f.fileCount ?? 0),
            exists: Boolean(f.exists), selected: Boolean(f.exists) && Number(f.fileCount) > 0,
          }))
        }
        const total = folders.reduce((s, f) => s + f.sizeMb, 0)
        addLog(`✅ ${folders.filter(f => f.exists).length} Ordner gefunden (${fmtMb(total)} gesamt)`)
      } catch (e) { errors.push(`Ordner: ${e}`); addLog(`⚠️ Ordner-Analyse fehlgeschlagen`) }

      if (cancelledRef.current) return

      // ── Software ─────────────────────────────────────────────────────────
      addLog('🔍 Analysiere installierte Software…')
      let software: SoftwareEntry[] = []
      try {
        const r = await api().runPowerShell(psGetSoftwareList(srcH), 60000)
        const raw = r.stdout.trim()
        if (!raw.startsWith('ERR:') && (raw.startsWith('[') || raw.startsWith('{'))) {
          const arr = JSON.parse(raw)
          const swArr = Array.isArray(arr) ? arr : [arr]
          software = swArr.map((s: Record<string, unknown>) => ({
            name: String(s.DisplayName ?? ''),
            version: String(s.DisplayVersion ?? ''),
            publisher: String(s.Publisher ?? ''),
            isSystemComponent: isSystemComponent(String(s.DisplayName ?? '')),
            selected: !isSystemComponent(String(s.DisplayName ?? '')),
          })).filter(s => s.name)
        }
        addLog(`✅ ${software.length} Programme gefunden`)
      } catch (e) { errors.push(`Software: ${e}`); addLog(`⚠️ Software-Analyse fehlgeschlagen`) }

      if (cancelledRef.current) return

      // ── Winget packages ──────────────────────────────────────────────────
      addLog('🔍 Prüfe Winget-Verfügbarkeit…')
      try {
        const r = await api().runPowerShell(psGetWingetPackages(srcH), 120000)
        const wingetIds = parseWingetExport(r.stdout.trim())
        software = software.map(s => ({
          ...s,
          wingetId: matchWingetId(s.name, wingetIds),
        }))
        const wgCount = software.filter(s => s.wingetId).length
        addLog(`✅ ${wgCount} Programme per Winget verfügbar`)
      } catch { addLog('⚠️ Winget-Prüfung fehlgeschlagen') }

      if (cancelledRef.current) return

      // ── Network drives ───────────────────────────────────────────────────
      addLog('🔍 Analysiere Netzlaufwerke…')
      let drives: DriveEntry[] = []
      try {
        const r = await api().runPowerShell(psGetNetworkDrives(srcH), 20000)
        const raw = r.stdout.trim()
        if (raw.startsWith('[') || raw.startsWith('{')) {
          const arr = JSON.parse(raw)
          const dArr = Array.isArray(arr) ? arr : [arr]
          drives = dArr
            .filter((d: Record<string, unknown>) => d.letter && d.uncPath)
            .map((d: Record<string, unknown>) => ({
              letter: String(d.letter ?? ''), uncPath: String(d.uncPath ?? ''), selected: true,
            }))
        }
        addLog(`✅ ${drives.length} Netzlaufwerk${drives.length !== 1 ? 'e' : ''} gefunden`)
      } catch (e) { errors.push(`Laufwerke: ${e}`); addLog('⚠️ Laufwerk-Analyse fehlgeschlagen') }

      if (cancelledRef.current) return

      // ── Printers ─────────────────────────────────────────────────────────
      addLog('🔍 Analysiere Drucker…')
      let printers: PrinterEntry[] = []
      try {
        const r = await api().runPowerShell(psGetPrinters(srcH), 25000)
        const raw = r.stdout.trim()
        if (raw.startsWith('[') || raw.startsWith('{')) {
          const arr = JSON.parse(raw)
          const pArr = Array.isArray(arr) ? arr : [arr]
          printers = pArr.map((p: Record<string, unknown>) => {
            const name = String(p.Name ?? '')
            const isSys = SYSTEM_PRINTERS.some(s => name.includes(s))
            return {
              name, portName: String(p.PortName ?? ''),
              driverName: String(p.DriverName ?? ''),
              isNetwork: Boolean(p.isNetwork),
              isSystemPrinter: isSys,
              selected: !isSys && Boolean(p.isNetwork),
            }
          }).filter((p: PrinterEntry) => p.name)
        }
        addLog(`✅ ${printers.length} Drucker gefunden`)
      } catch (e) { errors.push(`Drucker: ${e}`); addLog('⚠️ Drucker-Analyse fehlgeschlagen') }

      if (cancelledRef.current) return

      // ── Settings ─────────────────────────────────────────────────────────
      addLog('🔍 Analysiere Einstellungen…')
      let settings: SettingEntry[] = DEFAULT_SETTINGS.map(s => ({ ...s, available: true }))
      try {
        const r = await api().runPowerShell(psCheckSettingsAvailability(srcH, srcUser), 30000)
        const raw = r.stdout.trim()
        if (!raw.startsWith('ERR:') && raw.startsWith('{')) {
          const avail = JSON.parse(raw)
          settings = DEFAULT_SETTINGS.map(s => ({
            ...s,
            available: Boolean(avail[s.key] ?? true),
            selected: s.selected && Boolean(avail[s.key] ?? true),
          }))
        }
        addLog(`✅ Einstellungen analysiert`)
      } catch { addLog('⚠️ Einstellungen-Analyse fehlgeschlagen') }

      const totalMb = folders.reduce((s, f) => s + (f.selected ? f.sizeMb : 0), 0)

      setAnalysis({
        sourceUser: srcUser, folders, software, drives, printers, settings,
        analysisLog: [], totalSizeMb: totalMb,
      })
      addLog('✅ Analyse abgeschlossen')
      setPhase('selection')

    } catch (e) {
      addLog(`❌ Analyse abgebrochen: ${e}`)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Selection helpers
  // ──────────────────────────────────────────────────────────────────────────

  function toggleFolder(idx: number) {
    setAnalysis(prev => prev ? {
      ...prev, folders: prev.folders.map((f, i) => i === idx ? { ...f, selected: !f.selected } : f)
    } : prev)
  }
  function toggleSoftware(idx: number) {
    setAnalysis(prev => prev ? {
      ...prev, software: prev.software.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s)
    } : prev)
  }
  function toggleDrive(idx: number) {
    setAnalysis(prev => prev ? {
      ...prev, drives: prev.drives.map((d, i) => i === idx ? { ...d, selected: !d.selected } : d)
    } : prev)
  }
  function togglePrinter(idx: number) {
    setAnalysis(prev => prev ? {
      ...prev, printers: prev.printers.map((p, i) => i === idx ? { ...p, selected: !p.selected } : p)
    } : prev)
  }
  function toggleSetting(idx: number) {
    setAnalysis(prev => prev ? {
      ...prev, settings: prev.settings.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s)
    } : prev)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Build task list from selection
  // ──────────────────────────────────────────────────────────────────────────

  function buildTasks(): MigrationTask[] {
    if (!analysis) return []
    const tasks: MigrationTask[] = []
    // Folders
    for (const f of analysis.folders.filter(f => f.selected && f.exists)) {
      tasks.push({ id: `folder-${f.label}`, label: `📁 ${f.label} (${fmtMb(f.sizeMb)})`, category: 'files', status: 'waiting' })
    }
    // Software
    if (options.autoInstallSoftware) {
      for (const s of analysis.software.filter(s => s.selected && s.wingetId)) {
        tasks.push({ id: `sw-${s.name}`, label: `📦 ${s.name}`, category: 'software', status: 'waiting' })
      }
    }
    // Drives
    for (const d of analysis.drives.filter(d => d.selected)) {
      tasks.push({ id: `drive-${d.letter}`, label: `🗺️ ${d.letter}: → ${d.uncPath}`, category: 'drives', status: 'waiting' })
    }
    // Printers
    for (const p of analysis.printers.filter(p => p.selected)) {
      tasks.push({ id: `printer-${p.name}`, label: `🖨️ ${p.name}`, category: 'printers', status: 'waiting' })
    }
    // Settings
    for (const s of analysis.settings.filter(s => s.selected && s.available)) {
      tasks.push({ id: `setting-${s.key}`, label: `⚙️ ${s.label}`, category: 'settings', status: 'waiting' })
    }
    return tasks
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 5: Run Migration
  // ──────────────────────────────────────────────────────────────────────────

  async function handleStartMigration() {
    if (!analysis || !srcInfo || !dstInfo) return
    const srcH = srcInfo.hostname
    const dstH = dstInfo.hostname
    const srcUser = analysis.sourceUser

    cancelledRef.current = false
    startTimeRef.current = Date.now()
    const taskList = buildTasks()
    setTasks(taskList)
    setTaskIdx(0)
    setPhase('migrating')

    function updateTask(id: string, patch: Partial<MigrationTask>) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
    }

    await log(`Migration gestartet: ${srcH} → ${dstH}`)

    let taskI = 0
    for (const task of taskList) {
      if (cancelledRef.current) {
        updateTask(task.id, { status: 'skipped', detail: 'Abgebrochen' })
        taskI++; continue
      }
      setTaskIdx(taskI)
      updateTask(task.id, { status: 'running' })
      setProgressMsg(task.label)

      try {
        // ── Files ──────────────────────────────────────────────────────
        if (task.category === 'files') {
          const folder = analysis.folders.find(f => task.id === `folder-${f.label}`)
          if (!folder) { updateTask(task.id, { status: 'skipped' }); taskI++; continue }
          const r = await api().runPowerShell(psRobocopyFolder({
            srcPc: srcH, dstPc: dstH, localPath: folder.localPath,
            conflictMode: options.conflictMode, excludeTemp: options.excludeTempFiles,
          }), 3600000) // 1h
          const raw = r.stdout.trim()
          if (raw.startsWith('{')) {
            const d = JSON.parse(raw)
            const isErr = Number(d.exitCode ?? 0) >= 8
            updateTask(task.id, {
              status: isErr ? 'error' : 'success',
              bytesCopied: Number(d.bytesCopied ?? 0),
              filesCopied: Number(d.filesCopied ?? 0),
              detail: isErr ? `Robocopy exit: ${d.exitCode}` : `${d.filesCopied} Dateien`,
              output: String(d.summary ?? '').slice(0, 500),
            })
          } else {
            updateTask(task.id, { status: 'error', detail: raw.slice(0, 200) })
          }
        }

        // ── Software ───────────────────────────────────────────────────
        else if (task.category === 'software') {
          const sw = analysis.software.find(s => task.id === `sw-${s.name}`)
          if (!sw?.wingetId) { updateTask(task.id, { status: 'skipped' }); taskI++; continue }
          const r = await api().runPowerShell(psInstallWinget(dstH, sw.wingetId, options.silentInstall), 300000)
          const raw = r.stdout.trim()
          if (raw.startsWith('{')) {
            const d = JSON.parse(raw)
            updateTask(task.id, {
              status: Number(d.exitCode) === 0 ? 'success' : 'warning',
              detail: Number(d.exitCode) === 0 ? 'Installiert' : 'Möglicherweise bereits vorhanden',
              output: String(d.output ?? '').slice(0, 400),
            })
          } else {
            updateTask(task.id, { status: 'warning', detail: raw.slice(0, 200) })
          }
        }

        // ── Drives ─────────────────────────────────────────────────────
        else if (task.category === 'drives') {
          const drive = analysis.drives.find(d => task.id === `drive-${d.letter}`)
          if (!drive) { updateTask(task.id, { status: 'skipped' }); taskI++; continue }
          const r = await api().runPowerShell(psMapDrive(dstH, drive.letter, drive.uncPath), 20000)
          const out = r.stdout.trim()
          updateTask(task.id, {
            status: out === 'OK' ? 'success' : 'error',
            detail: out.startsWith('ERR:') ? out.slice(4) : 'Gemappt',
          })
        }

        // ── Printers ───────────────────────────────────────────────────
        else if (task.category === 'printers') {
          const printer = analysis.printers.find(p => task.id === `printer-${p.name}`)
          if (!printer) { updateTask(task.id, { status: 'skipped' }); taskI++; continue }
          if (!printer.isNetwork) {
            updateTask(task.id, { status: 'skipped', detail: 'Lokaler Drucker – übersprungen' })
            taskI++; continue
          }
          const r = await api().runPowerShell(psAddNetworkPrinter(dstH, printer.name), 30000)
          const out = r.stdout.trim()
          updateTask(task.id, {
            status: out === 'OK' ? 'success' : 'error',
            detail: out.startsWith('ERR:') ? out.slice(4) : 'Hinzugefügt',
          })
        }

        // ── Settings ───────────────────────────────────────────────────
        else if (task.category === 'settings') {
          const key = task.id.replace('setting-', '')
          let res = 'OK'

          if (key === 'outlook-signatures') {
            const path = `C:\\Users\\${srcUser}\\AppData\\Roaming\\Microsoft\\Signatures`
            res = (await api().runPowerShell(psCopySettingFolder(srcH, dstH, path), 120000)).stdout.trim()
          }
          else if (key === 'edge-bookmarks') {
            const path = `C:\\Users\\${srcUser}\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Bookmarks`
            res = (await api().runPowerShell(psCopySettingFile(srcH, dstH, path), 30000)).stdout.trim()
          }
          else if (key === 'chrome-bookmarks') {
            const path = `C:\\Users\\${srcUser}\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Bookmarks`
            res = (await api().runPowerShell(psCopySettingFile(srcH, dstH, path), 30000)).stdout.trim()
          }
          else if (key === 'wlan-profiles') {
            res = (await api().runPowerShell(psTransferWlanProfiles(srcH, dstH), 60000)).stdout.trim()
          }
          else if (key === 'quick-access') {
            // Copy Quick Access pinned folders: read from source via shell, apply on target
            // We do a best-effort: transfer via AppData NetworkPlacements shortcut folder
            const path = `C:\\Users\\${srcUser}\\AppData\\Roaming\\Microsoft\\Windows\\Network Shortcuts`
            res = (await api().runPowerShell(psCopySettingFolder(srcH, dstH, path), 30000)).stdout.trim()
          }
          else if (key === 'env-vars') {
            res = (await api().runPowerShell(psTransferEnvVars(srcH, dstH, srcUser), 30000)).stdout.trim()
          }

          const isSkipped = res.startsWith('SKIPPED:')
          const isErr = res.startsWith('ERR:')
          updateTask(task.id, {
            status: isErr ? 'error' : isSkipped ? 'skipped' : 'success',
            detail: isErr ? res.slice(4) : isSkipped ? res.slice(8) : 'OK',
          })
        }

      } catch (e) {
        updateTask(task.id, { status: 'error', detail: String(e).slice(0, 200) })
      }

      taskI++
    }

    // ── Build report ─────────────────────────────────────────────────────
    const durationMs = Date.now() - startTimeRef.current
    const finalTasks = taskList // note: state is async, use the local var updated by updateTask
    // Actually we need the tasks from state – but since updateTask is async state update,
    // we build the report from taskList with final statuses tracked manually
    // For simplicity, we use a small delay then read state
    await new Promise(r => setTimeout(r, 100))

    setTasks(prev => {
      const rep: MigrationReport = {
        id: `mig-${Date.now()}`,
        date: new Date().toISOString(),
        sourcePc: srcInfo.hostname,
        targetPc: dstInfo.hostname,
        sourceUser: srcUser,
        performedBy: performer,
        durationMs,
        tasks: prev,
        overallStatus: overallStatus(prev),
        notes: '',
      }
      setReport(rep)
      if (options.createReport) saveToHistory(rep)
      log(`Migration abgeschlossen: ${srcInfo.hostname} → ${dstInfo.hostname}`)
      return prev
    })

    setPhase('report')
    setProgressMsg('')
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Templates
  // ──────────────────────────────────────────────────────────────────────────

  async function saveTemplate() {
    if (!tmplName.trim() || !analysis) return
    const t: MigrationTemplate = {
      id: `tmpl-${Date.now()}`,
      name: tmplName.trim(), description: tmplDesc.trim(),
      createdBy: performer, createdAt: new Date().toISOString(),
      folderLabels: analysis.folders.filter(f => f.selected).map(f => f.label),
      settingKeys:  analysis.settings.filter(s => s.selected).map(s => s.key),
      conflictMode: options.conflictMode, excludeTempFiles: options.excludeTempFiles,
    }
    const existing = await api().netReadJson<MigrationTemplate[]>(TEMPLATES_PATH).catch(() => null) ?? []
    await api().netWriteJson(TEMPLATES_PATH, [...existing, t])
    setTemplates(prev => [...prev, t])
    setTmplName(''); setTmplDesc('')
  }

  async function applyTemplate(t: MigrationTemplate) {
    if (!analysis) return
    setAnalysis(prev => prev ? {
      ...prev,
      folders:  prev.folders.map(f => ({ ...f, selected: t.folderLabels.includes(f.label) })),
      settings: prev.settings.map(s => ({ ...s, selected: t.settingKeys.includes(s.key) })),
    } : prev)
    setOptions(prev => ({ ...prev, conflictMode: t.conflictMode, excludeTempFiles: t.excludeTempFiles }))
    setMainTab('wizard')
    if (phase !== 'selection' && phase !== 'settings') setPhase('selection')
  }

  async function deleteTemplate(id: string) {
    const updated = templates.filter(t => t.id !== id)
    await api().netWriteJson(TEMPLATES_PATH, updated)
    setTemplates(updated)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ──────────────────────────────────────────────────────────────────────────

  const bothConnected = srcInfo?.winrmOk && dstInfo?.winrmOk

  // Computed selection summary
  const selFolders   = analysis?.folders.filter(f => f.selected && f.exists) ?? []
  const selSoftware  = analysis?.software.filter(s => s.selected && s.wingetId) ?? []
  const selDrives    = analysis?.drives.filter(d => d.selected) ?? []
  const selPrinters  = analysis?.printers.filter(p => p.selected) ?? []
  const selSettings  = analysis?.settings.filter(s => s.selected && s.available) ?? []
  const totalSelMb   = selFolders.reduce((s, f) => s + f.sizeMb, 0)

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3">
        <ArrowRightLeft size={20} className="text-primary" />
        <h1 className="text-base font-bold text-foreground">PC-Migration / Gerätetausch</h1>
        <div className="ml-auto flex items-center bg-muted/30 rounded-lg p-0.5 gap-0.5">
          {(['wizard', 'history', 'templates'] as const).map(t => (
            <button key={t} onClick={() => setMainTab(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${mainTab === t ? 'bg-card text-foreground font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {t === 'wizard'    && <ArrowRightLeft size={11} />}
              {t === 'history'   && <History size={11} />}
              {t === 'templates' && <BookTemplate size={11} />}
              {t === 'wizard' ? 'Assistent' : t === 'history' ? 'Verlauf' : 'Vorlagen'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Wizard Tab ─────────────────────────────────────────────────────── */}
      {mainTab === 'wizard' && (
        <div className="flex-1 overflow-y-auto">
          {/* Connection Panel */}
          <div className="p-6 border-b border-border">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start max-w-3xl mx-auto">
              {/* Source */}
              <PcPanel
                side="source" label="ALTER PC (Quelle)" emoji="📦"
                value={srcInput} onChange={setSrcInput}
                info={srcInfo} connecting={connecting === 'src' || connecting === 'both'}
                disabled={phase !== 'connect'}
              />
              <div className="flex items-center justify-center pt-8">
                <ArrowRight size={24} className="text-primary/40" />
              </div>
              {/* Target */}
              <PcPanel
                side="target" label="NEUER PC (Ziel)" emoji="🆕"
                value={dstInput} onChange={setDstInput}
                info={dstInfo} connecting={connecting === 'dst' || connecting === 'both'}
                disabled={phase !== 'connect'}
              />
            </div>

            {phase === 'connect' && (
              <div className="flex flex-col items-center gap-2 mt-4">
                {connectErr && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-400 max-w-xl">
                    <XCircle size={12} /> {connectErr}
                  </div>
                )}
                <button
                  onClick={handleConnectBoth}
                  disabled={connecting !== null || !srcInput.trim() || !dstInput.trim()}
                  className="flex items-center gap-2 px-6 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors font-semibold"
                >
                  {connecting ? <Loader size={14} className="animate-spin" /> : <Wifi size={14} />}
                  Verbinden & Analysieren
                </button>
              </div>
            )}
          </div>

          {/* ── Stepper ──────────────────────────────────────────────── */}
          {phase !== 'connect' && (
            <div className="flex items-center gap-0 px-6 py-3 border-b border-border bg-muted/10">
              {['Analyse', 'Auswahl', 'Einstellungen', 'Übersicht', 'Migration'].map((label, i) => (
                <div key={label} className="flex items-center">
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    i === currentStep ? 'bg-primary text-primary-foreground'
                    : i < currentStep ? 'text-emerald-400'
                    : 'text-muted-foreground'
                  }`}>
                    {i < currentStep ? <Check size={10} /> : <span className="w-3 h-3 rounded-full border text-center text-[9px] flex items-center justify-center">{i+1}</span>}
                    {label}
                  </div>
                  {i < 4 && <ChevronRight size={12} className="text-muted-foreground/40 mx-0.5" />}
                </div>
              ))}
            </div>
          )}

          {/* ── Phase: Analyzing ─────────────────────────────────────── */}
          {phase === 'analyzing' && (
            <div className="p-6 max-w-xl mx-auto">
              <div className="space-y-3 rounded-lg border border-border p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Loader size={14} className="animate-spin text-primary" />
                  Analysiere alten PC…
                </div>
                <div className="space-y-1 font-mono text-xs text-muted-foreground max-h-48 overflow-y-auto">
                  {analysisLog.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              </div>
            </div>
          )}

          {/* ── Phase: Selection ─────────────────────────────────────── */}
          {phase === 'selection' && analysis && (
            <div className="p-6 space-y-4 max-w-3xl mx-auto">

              {/* Folders */}
              <SelectSection
                title="📁 Lokale Dateien" badge={`${selFolders.length} Ordner · ${fmtMb(totalSelMb)}`}>
                {analysis.folders.filter(f => f.exists).map((f, i) => (
                  <CheckRow key={f.localPath} checked={f.selected} onChange={() => toggleFolder(i)}
                    label={f.label}
                    right={<span className="text-[10px] text-muted-foreground">{fmtMb(f.sizeMb)} · {f.fileCount} Dateien</span>}
                  />
                ))}
              </SelectSection>

              {/* Software */}
              <SelectSection title="📦 Software" badge={`${analysis.software.filter(s=>s.selected).length} ausgewählt`}>
                <div className="mb-1.5">
                  <p className="text-[10px] text-muted-foreground mb-1.5 px-1">
                    ✅ = Winget verfügbar (auto-Installation) · ℹ = Nur zur Information (keine Auto-Installation)
                  </p>
                  {analysis.software.filter(s => !s.isSystemComponent).map((s, i) => (
                    <CheckRow key={s.name} checked={s.selected} onChange={() => toggleSoftware(i)}
                      label={`${s.name}${s.version ? ` ${s.version}` : ''}`}
                      right={
                        s.wingetId
                          ? <span className="text-[9px] text-emerald-400 px-1 py-0.5 rounded bg-emerald-500/10">✅ Winget</span>
                          : <span className="text-[9px] text-muted-foreground px-1 py-0.5 rounded bg-muted/30">ℹ Info</span>
                      }
                    />
                  ))}
                  {analysis.software.some(s => s.isSystemComponent) && (
                    <p className="text-[10px] text-muted-foreground mt-2 px-1">
                      + {analysis.software.filter(s => s.isSystemComponent).length} System-Komponenten (immer übersprungen)
                    </p>
                  )}
                </div>
              </SelectSection>

              {/* Drives */}
              {analysis.drives.length > 0 && (
                <SelectSection title="🗺️ Netzlaufwerke" badge={`${selDrives.length} ausgewählt`}>
                  {analysis.drives.map((d, i) => (
                    <CheckRow key={d.letter} checked={d.selected} onChange={() => toggleDrive(i)}
                      label={`${d.letter}: → ${d.uncPath}`} />
                  ))}
                </SelectSection>
              )}

              {/* Printers */}
              {analysis.printers.length > 0 && (
                <SelectSection title="🖨️ Drucker" badge={`${selPrinters.length} ausgewählt`}>
                  {analysis.printers.map((p, i) => (
                    <CheckRow key={p.name} checked={p.selected} onChange={() => togglePrinter(i)}
                      label={p.name}
                      right={
                        p.isSystemPrinter
                          ? <span className="text-[9px] text-muted-foreground/60">System</span>
                          : p.isNetwork
                            ? <span className="text-[9px] text-primary/70">Netzwerk</span>
                            : <span className="text-[9px] text-amber-400/70">Lokal</span>
                      }
                    />
                  ))}
                </SelectSection>
              )}

              {/* Settings */}
              <SelectSection title="⚙️ Windows-Einstellungen" badge={`${selSettings.length} ausgewählt`}>
                {analysis.settings.map((s, i) => (
                  <CheckRow key={s.key} checked={s.selected} onChange={() => toggleSetting(i)}
                    disabled={!s.available}
                    label={s.label}
                    right={!s.available ? <span className="text-[9px] text-muted-foreground/40">Nicht vorhanden</span> : undefined}
                    sublabel={s.description}
                  />
                ))}
              </SelectSection>

              <div className="flex justify-between items-center pt-2">
                <p className="text-xs text-muted-foreground">
                  {selFolders.length} Ordner · {selSoftware.length} Software · {selDrives.length} Laufwerke · {selPrinters.length} Drucker · {selSettings.length} Einstellungen
                </p>
                <button onClick={() => setPhase('settings')}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                  Weiter <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}

          {/* ── Phase: Settings ──────────────────────────────────────── */}
          {phase === 'settings' && (
            <div className="p-6 max-w-2xl mx-auto space-y-5">

              {/* Conflict */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <p className="text-xs font-semibold text-foreground">Konfliktbehandlung</p>
                <p className="text-[10px] text-muted-foreground">Was passiert wenn auf dem neuen PC bereits eine Datei gleichen Namens vorhanden ist?</p>
                <div className="flex gap-2">
                  {(['skip', 'overwrite', 'rename'] as const).map(m => (
                    <button key={m} onClick={() => setOptions(p => ({ ...p, conflictMode: m }))}
                      className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${options.conflictMode === m ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}>
                      {m === 'skip' ? 'Überspringen' : m === 'overwrite' ? 'Überschreiben' : 'Umbenennen'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Software */}
              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-xs font-semibold text-foreground">Software-Installation</p>
                <ToggleRow label="Programme automatisch per Winget installieren"
                  checked={options.autoInstallSoftware}
                  onChange={v => setOptions(p => ({ ...p, autoInstallSoftware: v }))} />
                <ToggleRow label="Stille Installation (kein Popup beim Benutzer)"
                  checked={options.silentInstall}
                  onChange={v => setOptions(p => ({ ...p, silentInstall: v }))} />
              </div>

              {/* Files */}
              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-xs font-semibold text-foreground">Datei-Optionen</p>
                <ToggleRow label="Temporäre Dateien ausschließen (.tmp, .log, Cache)"
                  checked={options.excludeTempFiles}
                  onChange={v => setOptions(p => ({ ...p, excludeTempFiles: v }))} />
              </div>

              {/* Report */}
              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-xs font-semibold text-foreground">Bericht</p>
                <ToggleRow label="Migrationsbericht auf Netzlaufwerk speichern"
                  checked={options.createReport}
                  onChange={v => setOptions(p => ({ ...p, createReport: v }))} />
                <div className="flex items-center gap-2 pl-6">
                  <label className="text-[10px] text-muted-foreground w-24 shrink-0">E-Mail senden an:</label>
                  <input value={options.reportEmail} onChange={e => setOptions(p => ({ ...p, reportEmail: e.target.value }))}
                    placeholder="admin@firma.de"
                    className="flex-1 px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button onClick={() => setPhase('selection')}
                  className="px-4 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
                  Zurück
                </button>
                <button onClick={() => setPhase('overview')}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                  Weiter <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}

          {/* ── Phase: Overview ──────────────────────────────────────── */}
          {phase === 'overview' && analysis && srcInfo && dstInfo && (
            <div className="p-6 max-w-2xl mx-auto space-y-4">
              <div className="rounded-lg border border-border p-5 space-y-4">
                <div className="text-center pb-2 border-b border-border">
                  <p className="text-xs font-bold text-foreground tracking-wider">MIGRATIONS-ÜBERSICHT</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {srcInfo.hostname} ({srcInfo.model}) → {dstInfo.hostname} ({dstInfo.model})
                  </p>
                  <p className="text-[10px] text-muted-foreground">User: {analysis.sourceUser}</p>
                </div>

                <OverviewGroup icon={<Folder size={13} />} label="Dateien" count={`${fmtMb(totalSelMb)}`}>
                  {selFolders.map(f => (
                    <div key={f.label} className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">{f.label}</span>
                      <span className="text-foreground">{fmtMb(f.sizeMb)} · {f.fileCount} Dateien</span>
                    </div>
                  ))}
                </OverviewGroup>

                {selSoftware.length > 0 && (
                  <OverviewGroup icon={<Package size={13} />} label="Software" count={`${selSoftware.length} Pakete (Winget)`}>
                    {selSoftware.slice(0, 6).map(s => (
                      <div key={s.name} className="text-[10px] text-muted-foreground">{s.name}</div>
                    ))}
                    {selSoftware.length > 6 && <div className="text-[10px] text-muted-foreground">+{selSoftware.length - 6} weitere…</div>}
                  </OverviewGroup>
                )}

                {selDrives.length > 0 && (
                  <OverviewGroup icon={<ArrowRightLeft size={13} />} label="Netzlaufwerke" count={`${selDrives.length}`}>
                    {selDrives.map(d => <div key={d.letter} className="text-[10px] text-muted-foreground">{d.letter}: → {d.uncPath}</div>)}
                  </OverviewGroup>
                )}

                {selPrinters.length > 0 && (
                  <OverviewGroup icon={<Printer size={13} />} label="Drucker" count={`${selPrinters.length}`}>
                    {selPrinters.map(p => <div key={p.name} className="text-[10px] text-muted-foreground">{p.name}</div>)}
                  </OverviewGroup>
                )}

                {selSettings.length > 0 && (
                  <OverviewGroup icon={<Settings2 size={13} />} label="Einstellungen" count={`${selSettings.length}`}>
                    {selSettings.map(s => <div key={s.key} className="text-[10px] text-muted-foreground">{s.label}</div>)}
                  </OverviewGroup>
                )}

                <div className="pt-2 border-t border-border flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Clock size={10} />
                  Konflikte: {options.conflictMode} · Winget: {options.autoInstallSoftware ? 'Ja' : 'Nein'} · Temp-Ausschluss: {options.excludeTempFiles ? 'Ja' : 'Nein'}
                </div>
              </div>

              <div className="flex justify-between">
                <button onClick={() => setPhase('settings')}
                  className="px-4 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
                  Zurück
                </button>
                <button
                  onClick={() => { if (window.confirm('Migration jetzt starten? Der alte PC sollte während der Migration nicht ausgeschaltet werden.')) handleStartMigration() }}
                  className="flex items-center gap-2 px-6 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-semibold">
                  <Play size={14} /> Migration starten
                </button>
              </div>
            </div>
          )}

          {/* ── Phase: Migrating ─────────────────────────────────────── */}
          {phase === 'migrating' && (
            <div className="p-6 max-w-2xl mx-auto space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <Loader size={16} className="animate-spin text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">Migration läuft…</p>
                  <p className="text-[10px] text-muted-foreground truncate">{progressMsg}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {taskIdx + 1} / {tasks.length}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-border overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500 rounded-full"
                  style={{ width: `${tasks.length ? ((taskIdx) / tasks.length) * 100 : 0}%` }} />
              </div>

              <TaskList tasks={tasks} expandedTask={expandedTask} setExpandedTask={setExpandedTask} />
            </div>
          )}

          {/* ── Phase: Report ─────────────────────────────────────────── */}
          {phase === 'report' && report && (
            <div className="p-6 max-w-2xl mx-auto space-y-4">
              {/* Status banner */}
              <div className={`flex items-center gap-3 p-4 rounded-lg border ${
                report.overallStatus === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : report.overallStatus === 'partial' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}>
                {report.overallStatus === 'success' ? <CheckCircle size={18} />
                  : report.overallStatus === 'partial' ? <AlertTriangle size={18} />
                  : <XCircle size={18} />}
                <div>
                  <p className="text-sm font-bold">
                    {report.overallStatus === 'success' ? '✅ Migration erfolgreich abgeschlossen'
                      : report.overallStatus === 'partial' ? '⚠️ Migration teilweise abgeschlossen (mit Fehlern)'
                      : '❌ Migration fehlgeschlagen'}
                  </p>
                  <p className="text-[10px] opacity-80">Dauer: {fmtMs(report.durationMs)} · {report.tasks.length} Aufgaben</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Erfolgreich', value: report.tasks.filter(t => t.status === 'success').length, color: 'text-emerald-400' },
                  { label: 'Warnung',     value: report.tasks.filter(t => t.status === 'warning').length,  color: 'text-amber-400'  },
                  { label: 'Fehler',      value: report.tasks.filter(t => t.status === 'error').length,    color: 'text-red-400'    },
                ].map(s => (
                  <div key={s.label} className="rounded-lg border border-border p-3 text-center">
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Failed items */}
              {report.tasks.filter(t => t.status === 'error').length > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-1">
                  <p className="text-xs font-semibold text-red-400 mb-2">⚠️ Handlungsbedarf</p>
                  {report.tasks.filter(t => t.status === 'error').map(t => (
                    <div key={t.id} className="text-[10px] text-foreground">
                      → {t.label}: <span className="text-red-400">{t.detail}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Task detail */}
              <TaskList tasks={report.tasks} expandedTask={expandedTask} setExpandedTask={setExpandedTask} />

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1">Notizen (optional)</label>
                <textarea value={reportNotes} onChange={e => setReportNotes(e.target.value)}
                  rows={3} placeholder="Besonderheiten, manuelle Nacharbeiten…"
                  className="w-full px-3 py-2 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary resize-none" />
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => {
                    const data = JSON.stringify({ ...report, notes: reportNotes }, null, 2)
                    const blob = new Blob([data], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = `migration_${report.sourcePc}_${report.date.slice(0,10)}.json`
                    a.click(); URL.revokeObjectURL(url)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
                  <Download size={11} /> JSON exportieren
                </button>
                <button
                  onClick={() => {
                    setPhase('connect')
                    setAnalysis(null); setTasks([]); setReport(null); setReportNotes('')
                    setSrcInfo(null); setDstInfo(null)
                    setSrcInput(''); setDstInput('')
                    setAnalysisLog([])
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                  <RefreshCw size={11} /> Neue Migration
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── History Tab ──────────────────────────────────────────────────────── */}
      {mainTab === 'history' && (
        <div className="flex-1 overflow-y-auto p-6">
          {histLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
              <Loader size={14} className="animate-spin" /> Lade Verlauf…
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <History size={32} className="opacity-30" />
              <p className="text-sm">Noch keine Migrationen durchgeführt</p>
            </div>
          ) : (
            <div className="space-y-3">
              {histDetail && (
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">Bericht: {histDetail.sourcePc} → {histDetail.targetPc}</p>
                    <button onClick={() => setHistDetail(null)} className="text-muted-foreground hover:text-foreground">
                      <X size={14} />
                    </button>
                  </div>
                  <TaskList tasks={histDetail.tasks} expandedTask={expandedTask} setExpandedTask={setExpandedTask} />
                </div>
              )}
              <table className="w-full text-xs">
                <thead className="bg-muted/20 border-b border-border">
                  <tr>
                    {['Datum', 'Quelle', 'Ziel', 'Benutzer', 'Durchgeführt von', 'Dauer', 'Status', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map(e => (
                    <tr key={e.id} className="hover:bg-accent/10">
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{new Date(e.date).toLocaleDateString('de-DE')}</td>
                      <td className="px-3 py-2 font-mono text-foreground">{e.sourcePc}</td>
                      <td className="px-3 py-2 font-mono text-foreground">{e.targetPc}</td>
                      <td className="px-3 py-2 text-muted-foreground">{e.sourceUser}</td>
                      <td className="px-3 py-2 text-muted-foreground">{e.performedBy}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtMs(e.durationMs)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          e.overallStatus === 'success' ? 'bg-emerald-500/10 text-emerald-400'
                          : e.overallStatus === 'partial' ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-red-500/10 text-red-400'
                        }`}>
                          {e.overallStatus === 'success' ? '✅ OK' : e.overallStatus === 'partial' ? '⚠️ Teilweise' : '❌ Fehler'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={async () => {
                          const rep = await api().netReadJson<MigrationReport>(`migrations/reports/${e.id}.json`).catch(() => null)
                          if (rep) setHistDetail(rep)
                        }} className="text-[10px] text-primary hover:underline">
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Templates Tab ────────────────────────────────────────────────────── */}
      {mainTab === 'templates' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Save current config as template */}
          {analysis && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground">Aktuelle Konfiguration als Vorlage speichern</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Name *</label>
                  <input value={tmplName} onChange={e => setTmplName(e.target.value)}
                    placeholder="z.B. Standard-Arbeitsplatz"
                    className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Beschreibung</label>
                  <input value={tmplDesc} onChange={e => setTmplDesc(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                </div>
              </div>
              <button onClick={saveTemplate} disabled={!tmplName.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                <FileText size={11} /> Vorlage speichern
              </button>
            </div>
          )}

          {/* Template list */}
          {templates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <BookTemplate size={32} className="opacity-30" />
              <p className="text-sm">Noch keine Vorlagen vorhanden</p>
              {!analysis && <p className="text-xs">Führen Sie zuerst eine Analyse durch, dann können Sie die Konfiguration als Vorlage speichern.</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map(t => (
                <div key={t.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">{t.name}</p>
                      {t.description && <p className="text-[10px] text-muted-foreground">{t.description}</p>}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {t.folderLabels.join(', ')} · Konflikte: {t.conflictMode}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => applyTemplate(t)}
                        className="px-2 py-1 text-[10px] rounded border border-border hover:bg-accent text-foreground">
                        Anwenden
                      </button>
                      <button onClick={() => deleteTemplate(t.id)}
                        className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PcPanel({ side, label, emoji, value, onChange, info, connecting, disabled }: {
  side: 'source' | 'target'; label: string; emoji: string
  value: string; onChange: (v: string) => void
  info: PcInfo | null; connecting: boolean; disabled: boolean
}) {
  return (
    <div className={`rounded-lg border p-4 space-y-2 ${info?.winrmOk ? 'border-emerald-500/40 bg-emerald-500/5' : info?.error ? 'border-red-500/30 bg-red-500/5' : 'border-border'}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{emoji}</span>
        <p className="text-xs font-semibold text-foreground">{label}</p>
      </div>
      <input value={value} onChange={e => onChange(e.target.value.toUpperCase())}
        placeholder="Hostname eingeben…"
        disabled={disabled}
        className="w-full px-2 py-1.5 text-sm font-mono rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary disabled:opacity-50" />
      {connecting && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Loader size={10} className="animate-spin" /> Verbinde…
        </div>
      )}
      {info && !connecting && (
        <div className="space-y-0.5">
          {info.winrmOk && (
            <>
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                <CheckCircle size={10} /> Verbunden
              </div>
              <p className="text-[10px] text-foreground">{info.model}</p>
              <p className="text-[10px] text-muted-foreground">{info.os}</p>
              {info.loggedUser && <p className="text-[10px] text-muted-foreground">User: {info.loggedUser}</p>}
            </>
          )}
          {info.error && (
            <div className="flex items-start gap-1.5 text-[10px] text-red-400">
              <XCircle size={10} className="mt-0.5 shrink-0" /> {info.error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SelectSection({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-accent/20 transition-colors text-left bg-muted/10">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="text-xs font-semibold text-foreground flex-1">{title}</span>
        {badge && <span className="text-[10px] text-muted-foreground">{badge}</span>}
      </button>
      {open && <div className="divide-y divide-border">{children}</div>}
    </div>
  )
}

function CheckRow({ checked, onChange, label, right, sublabel, disabled }: {
  checked: boolean; onChange: () => void
  label: string; right?: React.ReactNode; sublabel?: string; disabled?: boolean
}) {
  return (
    <label className={`flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-accent/10 transition-colors ${disabled ? 'opacity-40' : ''} ${checked ? 'bg-primary/5' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled}
        className="rounded border-border accent-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className={`text-xs truncate ${checked ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</p>
        {sublabel && <p className="text-[10px] text-muted-foreground/60">{sublabel}</p>}
      </div>
      {right}
    </label>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button onClick={() => onChange(!checked)}
        className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${checked ? 'bg-primary' : 'bg-border'}`}>
        <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
      <span className="text-xs text-foreground">{label}</span>
    </label>
  )
}

function OverviewGroup({ icon, label, count, children }: {
  icon: React.ReactNode; label: string; count: string; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-primary">{icon}</span>
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <span className="text-[10px] text-muted-foreground ml-auto">{count}</span>
      </div>
      <div className="pl-5 space-y-0.5">{children}</div>
    </div>
  )
}

function TaskList({ tasks, expandedTask, setExpandedTask }: {
  tasks: MigrationTask[]
  expandedTask: string | null
  setExpandedTask: (id: string | null) => void
}) {
  const cats = ['files', 'software', 'drives', 'printers', 'settings'] as const
  return (
    <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
      {cats.flatMap(cat => {
        const catTasks = tasks.filter(t => t.category === cat)
        if (!catTasks.length) return []
        return catTasks.map(t => (
          <div key={t.id}>
            <button
              onClick={() => setExpandedTask(expandedTask === t.id ? null : t.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/10 transition-colors ${
                t.status === 'running' ? 'bg-primary/5' : ''
              }`}>
              {statusIcon(t.status)}
              <span className={`flex-1 text-xs truncate ${t.status === 'success' ? 'text-foreground' : t.status === 'error' ? 'text-red-400' : 'text-muted-foreground'}`}>
                {t.label}
              </span>
              {t.detail && <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">{t.detail}</span>}
              {t.output && <ChevronDown size={10} className={`text-muted-foreground shrink-0 transition-transform ${expandedTask === t.id ? 'rotate-180' : ''}`} />}
            </button>
            {expandedTask === t.id && t.output && (
              <div className="px-8 py-2 bg-muted/10 border-t border-border">
                <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all">{t.output}</pre>
              </div>
            )}
          </div>
        ))
      })}
    </div>
  )
}
