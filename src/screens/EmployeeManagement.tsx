import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Users, UploadCloud, FileText, FileSpreadsheet, Download, Plus, RefreshCw,
  ChevronDown, ChevronRight, Pencil, Trash2, X, Check, Loader, CheckCircle2,
  AlertTriangle, KeyRound, Calendar, Search, UserMinus, Mail, MessageCircle, Rocket, ClipboardCheck,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useAppStore } from '../store/appStore'
import { api } from '../electronAPI'
import { PersonInfoButton } from '../components/person/PersonDossier'
import {
  listEmployees, listDepartures, createEmployee, updateEmployee, deleteEmployee,
  createDeparture, updateDeparture, deleteDeparture, applyAccessPass,
  replaceAllEmployees, replaceAllDepartures, daysUntil, formatGermanDate,
  isFullyChecked, isOnboarded, toIsoDate, missingPreparationSteps,
  HARDWARE_OPTIONS, hardwareLabel,
  type Employee, type Departure, type HardwareType,
} from '../services/employees'
import { listChecklists, createChecklist } from '../services/checklists'
import {
  parsePersonnelPdf, parseAccessPassMsg, parseAccessPassEml, parseExistingExcel,
  exportEmployeesExcel, classifyFile,
} from '../services/employeeImport'
import { readCentralAdUsers, buildNameIndex, lookupUserByName } from '../services/adUserDirectory'

const POLL_MS = 15_000

interface ImportLine { name: string; status: 'ok' | 'warn' | 'error' | 'busy'; message: string }

/**
 * Liest die Bytes einer per Drag & Drop abgelegten Datei. Bevorzugt den
 * Electron-IPC-Weg (echter Pfad via webUtils.getPathForFile + readFile), weil
 * File.arrayBuffer() im contextIsolation-Modus nicht zuverlaessig ist. Faellt
 * auf arrayBuffer() zurueck (z. B. Outlook-Virtual-File ohne Pfad).
 */
async function readDroppedBytes(f: File): Promise<Uint8Array | null> {
  const ed = (window as Window & { electronDrop?: { getPath: (file: File) => string } }).electronDrop
  const path = ed ? ed.getPath(f) : ''
  if (path) {
    try {
      const r = await api().readFile(path)
      if (r.success && r.data) {
        const bin = atob(r.data)
        const arr = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
        return arr
      }
    } catch { /* Fallback unten */ }
  }
  try { return new Uint8Array(await f.arrayBuffer()) } catch { return null }
}

export default function EmployeeManagement() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''

  const [employees, setEmployees] = useState<Employee[]>([])
  const [departures, setDepartures] = useState<Departure[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [importLog, setImportLog] = useState<ImportLine[]>([])
  const [showOnboarded, setShowOnboarded] = useState(false)
  const [showDepartures, setShowDepartures] = useState(true)
  const [search, setSearch] = useState('')
  const [editEmp, setEditEmp] = useState<Employee | null>(null)
  const [editDep, setEditDep] = useState<Departure | null>(null)
  const [mailEmp, setMailEmp] = useState<Employee | null>(null)
  // Corp-/Global-IDs, für die es einen Checklisten-Eintrag gibt (Gating "Alles Vorbereitet").
  const [checklistCorpIds, setChecklistCorpIds] = useState<Set<string>>(new Set())
  const setScreen = useAppStore(s => s.setScreen)
  const setOnboardingPreselectId = useAppStore(s => s.setOnboardingPreselectId)
  const openOnboarding = useCallback((e: Employee) => {
    setOnboardingPreselectId(e.id)
    setScreen('onboarding')
  }, [setOnboardingPreselectId, setScreen])
  const [busy, setBusy] = useState(false)
  const excelInputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<(files: File[]) => void>(() => {})

  const refresh = useCallback(async () => {
    try {
      const [emps, deps, cls] = await Promise.all([listEmployees(), listDepartures(), listChecklists()])
      setEmployees(emps)
      setDepartures(deps)
      setChecklistCorpIds(new Set(cls.map(c => (c.corpId || '').trim().toUpperCase()).filter(Boolean)))
      setError('')
    } catch {
      setError('Liste konnte nicht geladen werden (Netzlaufwerk?).')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, POLL_MS)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [refresh])

  // ── Kern-Verarbeitung: arbeitet auf {name, bytes} — egal ob aus Drop oder Dialog
  async function processItems(items: { name: string; bytes: Uint8Array }[]) {
    if (items.length === 0) return
    setBusy(true)
    const log: ImportLine[] = items.map(it => ({ name: it.name, status: 'busy', message: 'wird verarbeitet…' }))
    setImportLog(log)
    for (let i = 0; i < items.length; i++) {
      const { name, bytes } = items[i]
      const kind = classifyFile(name)
      try {
        if (kind === 'pdf') {
          const r = await parsePersonnelPdf(bytes, name)
          if (!r.ok || !r.data) { log[i] = { name, status: 'error', message: r.error || 'Konnte PDF nicht lesen.' }; continue }
          const d = r.data
          if (d.type === 'entry') {
            const existing = employees.find(e => e.globalId && e.globalId.toUpperCase() === d.globalId.toUpperCase())
            if (existing) {
              await updateEmployee(existing.id, {
                startDate: d.date || existing.startDate, name: d.name || existing.name, vorname: d.vorname || existing.vorname,
                manager: d.manager || existing.manager, jobTitle: d.jobTitle || existing.jobTitle,
                department: d.department || existing.department, costCenter: d.costCenter || existing.costCenter,
              })
              log[i] = { name, status: 'ok', message: `Eintritt aktualisiert: ${d.vorname} ${d.name} (${d.globalId})` }
            } else {
              await createEmployee({
                startDate: d.date, name: d.name, vorname: d.vorname, globalId: d.globalId, manager: d.manager,
                jobTitle: d.jobTitle, department: d.department, costCenter: d.costCenter, createdBy: username,
              })
              log[i] = { name, status: 'ok', message: `Neuer Eintritt: ${d.vorname} ${d.name} (${d.globalId}) · ${formatGermanDate(d.date)}` }
            }
          } else {
            const existing = departures.find(x => x.globalId && x.globalId.toUpperCase() === d.globalId.toUpperCase())
            const fullName = `${d.name}${d.vorname ? ' ' + d.vorname : ''}`.trim()
            if (existing) {
              await updateDeparture(existing.id, { exitDate: d.date || existing.exitDate, name: fullName || existing.name, manager: d.manager || existing.manager })
              log[i] = { name, status: 'ok', message: `Austritt aktualisiert: ${fullName} (${d.globalId})` }
            } else {
              await createDeparture({ exitDate: d.date, name: fullName, globalId: d.globalId, manager: d.manager, createdBy: username })
              log[i] = { name, status: 'ok', message: `Neuer Austritt: ${fullName} (${d.globalId}) · ${formatGermanDate(d.date)}` }
            }
          }
        } else if (kind === 'msg' || kind === 'eml') {
          const r = kind === 'msg'
            ? parseAccessPassMsg(bytes)
            : parseAccessPassEml(new TextDecoder('utf-8').decode(bytes))
          if (!r.ok || !r.data) { log[i] = { name, status: 'error', message: r.error || 'Konnte Mail nicht lesen.' }; continue }
          const applied = await applyAccessPass(r.data.globalId, r.data.accessPass, r.data.upn, r.data.valid)
          if (applied.ok && applied.matched) {
            log[i] = { name, status: 'ok', message: `Access Pass eingetragen bei ${applied.matched.vorname} ${applied.matched.name} (${r.data.globalId})` }
          } else {
            log[i] = { name, status: 'warn', message: applied.error || `Kein Treffer fuer Global ID ${r.data.globalId}.` }
          }
        } else {
          log[i] = { name, status: 'error', message: 'Nicht unterstuetzt — bitte PDF, .msg oder .eml.' }
        }
      } catch (err) {
        log[i] = { name, status: 'error', message: err instanceof Error ? err.message : String(err) }
      }
      setImportLog([...log])
    }
    await refresh()
    setBusy(false)
  }

  // Drop-Pfad: aus dem File-Objekt Bytes lesen (IPC-Pfad bevorzugt), dann verarbeiten
  async function processFiles(files: File[]) {
    const items: { name: string; bytes: Uint8Array }[] = []
    const fails: ImportLine[] = []
    for (const f of files) {
      const bytes = await readDroppedBytes(f)
      if (bytes) items.push({ name: f.name, bytes })
      else fails.push({ name: f.name, status: 'error', message: 'Datei konnte nicht gelesen werden.' })
    }
    if (fails.length) setImportLog(prev => [...prev, ...fails])
    await processItems(items)
  }

  // Datei-Dialog: garantierter Weg (nativer Dialog), unabhaengig von Drag & Drop.
  async function pickFiles() {
    const paths = await api().openFilesDialog([
      { name: 'PDF & Access-Pass-Mails', extensions: ['pdf', 'msg', 'eml'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ])
    if (!paths || paths.length === 0) return
    const items: { name: string; bytes: Uint8Array }[] = []
    for (const p of paths) {
      const name = p.split(/[\\/]/).pop() || p
      try {
        const r = await api().readFile(p)
        if (r.success && r.data) {
          const bin = atob(r.data)
          const arr = new Uint8Array(bin.length)
          for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j)
          items.push({ name, bytes: arr })
        }
      } catch { /* skip */ }
    }
    await processItems(items)
  }

  // Native Drag&Drop-Listener (zuverlaessiger als React-Synthetic-Events,
  // besonders im elevated/contextIsolation-Electron). dropRef haelt immer die
  // aktuelle processFiles-Closure, damit der Listener nur einmal gebunden wird.
  dropRef.current = processFiles
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const over = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; setDragging(true) }
    const leave = (e: DragEvent) => { if (!el.contains(e.relatedTarget as Node)) setDragging(false) }
    const drop = (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation(); setDragging(false)
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length) dropRef.current(files)
    }
    el.addEventListener('dragenter', over)
    el.addEventListener('dragover', over)
    el.addEventListener('dragleave', leave)
    el.addEventListener('drop', drop)
    return () => {
      el.removeEventListener('dragenter', over)
      el.removeEventListener('dragover', over)
      el.removeEventListener('dragleave', leave)
      el.removeEventListener('drop', drop)
    }
  }, [])

  // ── Excel-Import (Alt-Liste) ────────────────────────────────────────────────
  async function onExcelChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (employees.length > 0 || departures.length > 0) {
      if (!window.confirm('Die zentrale Liste enthaelt bereits Eintraege. Beim Import wird die komplette Liste durch den Excel-Inhalt ERSETZT. Fortfahren?')) return
    }
    setBusy(true)
    setImportLog([{ name: file.name, status: 'busy', message: 'Excel wird gelesen…' }])
    try {
      const buf = await file.arrayBuffer()
      const r = await parseExistingExcel(buf)
      if (!r.ok) { setImportLog([{ name: file.name, status: 'error', message: r.error || 'Import fehlgeschlagen.' }]); setBusy(false); return }
      await replaceAllEmployees(r.employees, username)
      await replaceAllDepartures(r.departures, username)
      setImportLog([{ name: file.name, status: 'ok', message: `Importiert: ${r.employees.length} Eintritte, ${r.departures.length} Austritte` }])
      await refresh()
    } catch (err) {
      setImportLog([{ name: file.name, status: 'error', message: err instanceof Error ? err.message : String(err) }])
    }
    setBusy(false)
  }

  async function onExport() {
    setBusy(true)
    const r = await exportEmployeesExcel(employees, departures)
    if (!r.ok && !r.cancelled) setError(r.error || 'Export fehlgeschlagen.')
    setBusy(false)
  }

  async function toggleCheck(emp: Employee, field: 'managerContacted' | 'laptopReady' | 'workplaceReady' | 'allDone') {
    // Optimistisch aktualisieren
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, [field]: !e[field] } : e))
    await updateEmployee(emp.id, { [field]: !emp[field] })
    refresh()
  }

  // Hardware-Auswahl setzen: Geräteart → "fertig" (grün), 'inprogress' → "In
  // Bearbeitung" (orange, mit Ort + Bearbeiter), null = zurücksetzen.
  async function setHardware(emp: Employee, key: HardwareType | null, location?: string) {
    const patch: Partial<Employee> =
      key === null ? { laptopReady: false, hardwareType: '', hardwareLocation: '', hardwareBy: '' }
      : key === 'none' ? { laptopReady: true, hardwareType: 'none', hardwareLocation: '', hardwareBy: '' }
      : key === 'inprogress' ? { laptopReady: false, hardwareType: 'inprogress', hardwareLocation: (location || '').trim(), hardwareBy: username }
      : { laptopReady: true, hardwareType: key, hardwareLocation: (location || '').trim(), hardwareBy: username }
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, ...patch } : e))
    await updateEmployee(emp.id, patch)
    refresh()
  }

  // "Gerät übergeben" -> Eintrag wandert zu "Bereits onboardet".
  async function handover(emp: Employee) {
    const patch: Partial<Employee> = { deviceHandedOver: true, handedOverAt: new Date().toISOString(), handedOverBy: username }
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, ...patch } : e))
    await updateEmployee(emp.id, patch)
    refresh()
  }

  // "Access Pass Reminder" -> vorbefuellte Outlook-Mail an den Manager (CC fest
  // support.marine@SKF.com), die den noch fehlenden Access Pass Code anfordert.
  async function accessPassReminder(emp: Employee) {
    const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || ''
    const fullName = `${emp.vorname} ${emp.name}`.trim() || 'der neue Mitarbeiter'
    const vorname = emp.vorname.trim() || fullName
    const mgrFirst = firstName(emp.manager) || emp.manager.trim()
    const by = firstName(user?.displayName || '') || (user?.displayName || '').trim() || 'Deine IT'
    const start = emp.startDate ? ` (${formatGermanDate(emp.startDate)})` : ''
    const corp = (emp.globalId || '').trim()

    // Manager-Mailadresse aus dem zentralen AD-Cache aufloesen (kein Live-AD).
    let to = ''
    try {
      const dir = await readCentralAdUsers()
      if (dir) {
        const hit = lookupUserByName(buildNameIndex(dir.users), emp.manager)
        if (hit?.email) to = hit.email
      }
    } catch { /* dann ohne Empfaenger oeffnen */ }

    const subject = `Access Pass Code benötigt – ${fullName}${corp ? ` (${corp})` : ''}`
    const body =
      `Hallo ${mgrFirst},\n\n` +
      `für ${fullName}${corp ? ` (Corp ID ${corp})` : ''} fehlt uns noch der Access Pass Code ` +
      `(Temporary Access Pass). Bitte lass ihn uns zukommen, damit sich ${vorname} an seinem ` +
      `ersten Arbeitstag${start} anmelden kann.\n\n` +
      `Vielen Dank und viele Grüße\n${by}\n`
    await api().composeEmail({ to, cc: 'support.marine@SKF.com', subject, body })
  }

  // ── Aufteilung in offene / onboardete / gefiltert ───────────────────────────
  const q = search.trim().toLowerCase()
  const matches = (e: Employee) => !q || [e.name, e.vorname, e.globalId, e.manager, e.department, e.jobTitle].some(v => v.toLowerCase().includes(q))
  const filteredEmps = useMemo(() => employees.filter(matches), [employees, q])
  const activeEmps = filteredEmps.filter(e => !isOnboarded(e))
  const onboardedEmps = filteredEmps.filter(e => isOnboarded(e))
  const filteredDeps = useMemo(() => departures.filter(d => !q || [d.name, d.globalId, d.manager, d.deviceName].some(v => v.toLowerCase().includes(q))), [departures, q])

  const newEmptyEmployee = (): Employee => ({
    id: '', startDate: '', name: '', vorname: '', globalId: '', manager: '', jobTitle: '', department: '', costCenter: '',
    managerContacted: false, laptopReady: false, hardwareType: '', hardwareLocation: '', hardwareBy: '', workplaceReady: false, allDone: false, deviceHandedOver: false, request: '', ritmLaptop: '', deploymentTask: '', hardwareSerial: '', laptopType: '',
    accessPass: '', accessPassUpn: '', accessPassValid: '', extraSoftware: '', groupMailbox: '', roomNumber: '',
    standardEquipment: '', extraEquipment: '', handoverDate: '', phoneExtension: '', notes: '', createdBy: username, createdAt: '',
  })
  const newEmptyDeparture = (): Departure => ({
    id: '', exitDate: '', name: '', globalId: '', manager: '', deviceName: '', task: '', deviceReturned: false, notes: '',
    createdBy: username, createdAt: '',
  })

  return (
    <div
      ref={rootRef}
      className={`h-full flex flex-col bg-background relative transition-shadow ${dragging ? 'ring-4 ring-inset ring-primary/50' : ''}`}
    >
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Users className="text-primary" size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-foreground">Mitarbeiterverwaltung</h1>
            <p className="text-xs text-muted-foreground">Onboarding neuer Mitarbeiter & Austritte — HR-PDFs und Access-Pass-Mails (.msg/.eml) per Drag & Drop einlesen</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} title="Aktualisieren" className="p-2 rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground"><RefreshCw size={15} /></button>
            <button onClick={pickFiles} className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground"><UploadCloud size={14} />PDF / Mail einlesen</button>
            <button onClick={() => excelInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground"><FileSpreadsheet size={14} />Excel importieren</button>
            <button onClick={onExport} className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground"><Download size={14} />Excel exportieren</button>
            <button onClick={() => setEditEmp(newEmptyEmployee())} className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={14} />Neuer Mitarbeiter</button>
            <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onExcelChosen} />
          </div>
        </div>

        {/* Suche */}
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche nach Name, Global ID, Manager…"
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <span className="text-xs text-muted-foreground">{activeEmps.length} aktiv · {onboardedEmps.length} onboarded · {filteredDeps.length} Austritte</span>
        </div>
      </div>

      {/* Import-Protokoll */}
      {importLog.length > 0 && (
        <div className="shrink-0 px-6 py-2 border-b border-border bg-card/50">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Letzter Import</p>
            <button onClick={() => setImportLog([])} className="text-muted-foreground hover:text-foreground"><X size={13} /></button>
          </div>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {importLog.map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {l.status === 'busy' && <Loader size={12} className="animate-spin text-blue-400 shrink-0" />}
                {l.status === 'ok' && <CheckCircle2 size={12} className="text-green-400 shrink-0" />}
                {l.status === 'warn' && <AlertTriangle size={12} className="text-amber-400 shrink-0" />}
                {l.status === 'error' && <X size={12} className="text-red-400 shrink-0" />}
                <span className="text-muted-foreground truncate max-w-[18rem]" title={l.name}>{l.name}</span>
                <span className={`truncate ${l.status === 'error' ? 'text-red-300' : l.status === 'warn' ? 'text-amber-300' : 'text-foreground'}`}>{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="shrink-0 px-6 py-2 bg-red-500/10 border-b border-red-500/30 text-sm text-red-300">{error}</div>}

      {/* Inhalt */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2"><Loader className="animate-spin" size={18} />Wird geladen…</div>
        ) : (
          <>
            {/* Aktive / bevorstehende Eintritte */}
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <UploadCloud size={15} className="text-primary" />Anstehende & laufende Onboardings
              </h2>
              {activeEmps.length === 0 ? (
                <button onClick={pickFiles} className="w-full rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 py-10 text-center text-sm text-muted-foreground transition-colors">
                  <UploadCloud size={28} className="mx-auto mb-2 text-primary/70" />
                  Keine offenen Onboardings.<br />
                  HR-PDFs oder Access-Pass-Mails (.msg/.eml) hierher ziehen — oder klicken zum Auswählen.
                </button>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {activeEmps.map(e => (
                    <EmployeeCard key={e.id} emp={e} onToggle={toggleCheck} onSetHardware={setHardware} onHandover={handover} hasChecklist={checklistCorpIds.has((e.globalId || '').trim().toUpperCase())} onEdit={() => setEditEmp(e)} onMail={() => setMailEmp(e)} onOnboarding={() => openOnboarding(e)} onAccessPassReminder={accessPassReminder} />
                  ))}
                </div>
              )}
            </section>

            {/* Onboarded (eingeklappt) */}
            {onboardedEmps.length > 0 && (
              <section>
                <button onClick={() => setShowOnboarded(v => !v)} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
                  {showOnboarded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  Bereits onboardet ({onboardedEmps.length})
                </button>
                {showOnboarded && (
                  <div className="mt-2 grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {onboardedEmps.map(e => (
                      <EmployeeCard key={e.id} emp={e} onToggle={toggleCheck} onSetHardware={setHardware} onHandover={handover} hasChecklist={checklistCorpIds.has((e.globalId || '').trim().toUpperCase())} onEdit={() => setEditEmp(e)} onMail={() => setMailEmp(e)} onOnboarding={() => openOnboarding(e)} onAccessPassReminder={accessPassReminder} compact />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Austritte */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => setShowDepartures(v => !v)} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
                  {showDepartures ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <UserMinus size={15} className="text-amber-400" />Austritte ({filteredDeps.length})
                </button>
                <button onClick={() => setEditDep(newEmptyDeparture())} className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground"><Plus size={12} />Austritt</button>
              </div>
              {showDepartures && (
                filteredDeps.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Keine Austritte.</p>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-card text-muted-foreground text-xs">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Austritt</th>
                          <th className="text-left px-3 py-2 font-medium">Name</th>
                          <th className="text-left px-3 py-2 font-medium">Global ID</th>
                          <th className="text-left px-3 py-2 font-medium">Manager</th>
                          <th className="text-left px-3 py-2 font-medium">Gerät</th>
                          <th className="text-center px-3 py-2 font-medium">Abgegeben</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDeps.map(d => {
                          const days = daysUntil(d.exitDate)
                          const soon = !isNaN(days) && days >= 0 && days <= 7
                          return (
                            <tr key={d.id} className="border-t border-border hover:bg-accent/20">
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className="text-foreground">{formatGermanDate(d.exitDate)}</span>
                                {!isNaN(days) && <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${soon ? 'bg-amber-500/20 text-amber-200' : 'bg-accent text-muted-foreground'}`}>{days < 0 ? 'erfolgt' : `in ${days} T`}</span>}
                              </td>
                              <td className="px-3 py-2 text-foreground"><span className="inline-flex items-center gap-1">{d.name}<PersonInfoButton name={d.name} /></span></td>
                              <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{d.globalId}</td>
                              <td className="px-3 py-2 text-muted-foreground">{d.manager}</td>
                              <td className="px-3 py-2 text-muted-foreground">{d.deviceName}</td>
                              <td className="px-3 py-2 text-center">
                                <input type="checkbox" checked={d.deviceReturned} onChange={async () => { await updateDeparture(d.id, { deviceReturned: !d.deviceReturned }); refresh() }} className="accent-primary" />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => setEditDep(d)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><Pencil size={13} /></button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </section>
          </>
        )}
      </div>

      {/* Drag-Hinweis: kleines, nicht-blockierendes Banner oben (kein Vollbild-Overlay,
          damit der Drop-Event nicht abgefangen wird) */}
      {dragging && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground shadow-lg text-sm font-medium pointer-events-none">
          <UploadCloud size={16} />PDF oder Access-Pass-Mail (.msg / .eml) hier loslassen
        </div>
      )}

      {busy && !dragging && (
        <div className="absolute bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border shadow-lg text-sm text-foreground">
          <Loader className="animate-spin text-primary" size={15} />Verarbeite…
        </div>
      )}

      {editEmp && <EmployeeEditModal emp={editEmp} username={username} onClose={() => setEditEmp(null)} onSaved={() => { setEditEmp(null); refresh() }} />}
      {editDep && <DepartureEditModal dep={editDep} username={username} onClose={() => setEditDep(null)} onSaved={() => { setEditDep(null); refresh() }} />}
      {mailEmp && <ManagerMailDialog emp={mailEmp} onClose={() => setMailEmp(null)} />}
    </div>
  )
}

// ── Mitarbeiter-Karte ───────────────────────────────────────────────────────
function EmployeeCard({ emp, onToggle, onSetHardware, onHandover, hasChecklist, onEdit, onMail, onOnboarding, onAccessPassReminder, compact }: {
  emp: Employee
  onToggle: (e: Employee, f: 'managerContacted' | 'laptopReady' | 'workplaceReady' | 'allDone') => void
  onSetHardware: (e: Employee, key: HardwareType | null, location?: string) => void
  onHandover: (e: Employee) => void
  hasChecklist: boolean
  onEdit: () => void
  onMail: () => void
  onOnboarding: () => void
  onAccessPassReminder: (e: Employee) => void
  compact?: boolean
}) {
  const [prepHint, setPrepHint] = useState('')
  const missing = missingPreparationSteps(emp, hasChecklist)
  const done = isFullyChecked(emp)
  const days = daysUntil(emp.startDate)
  const tone = done ? 'border-green-500/40 bg-green-500/5' : 'border-red-500/40 bg-red-500/5'

  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-start gap-3">
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${done ? 'bg-green-400' : 'bg-red-400'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground truncate">{emp.vorname} {emp.name}</h3>
            <PersonInfoButton name={`${emp.vorname} ${emp.name}`.trim()} />
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-accent text-muted-foreground">{emp.globalId || '—'}</span>
            {!isNaN(days) && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
                {days < 0 ? 'gestartet' : days === 0 ? 'startet heute' : `in ${days} Tagen`}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
            <Calendar size={11} />{emp.startDate ? formatGermanDate(emp.startDate) : 'kein Datum'}
            {emp.manager && <span>· Manager: <span className="text-foreground">{emp.manager}</span></span>}
            {emp.department && <span>· {emp.department}</span>}
            {emp.jobTitle && <span>· {emp.jobTitle}</span>}
          </p>
          {emp.accessPass && (
            <p className="text-[11px] mt-1 flex items-center gap-1 text-green-300"><KeyRound size={11} />Access Pass: <span className="font-mono text-foreground">{emp.accessPass}</span>{emp.accessPassValid && <span className="text-muted-foreground">({emp.accessPassValid})</span>}</p>
          )}
          {!compact && (emp.groupMailbox || emp.roomNumber || emp.standardEquipment) && (
            <p className="text-[11px] text-muted-foreground mt-1">
              {emp.groupMailbox && <span>Postfach: {emp.groupMailbox} · </span>}
              {emp.roomNumber && <span>Platz: {emp.roomNumber} · </span>}
              {emp.standardEquipment && <span>Ausstattung: {emp.standardEquipment}</span>}
            </p>
          )}

          {/* 3 Checkboxen */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <CheckPill label="Manager kontaktiert" on={emp.managerContacted} onClick={() => onToggle(emp, 'managerContacted')} />
            <HardwarePill laptopReady={emp.laptopReady} hardwareType={emp.hardwareType} hardwareLocation={emp.hardwareLocation} hardwareBy={emp.hardwareBy} onPick={(key, loc) => onSetHardware(emp, key, loc)} />
            <CheckPill label="Arbeitsplatz steht" on={emp.workplaceReady} onClick={() => onToggle(emp, 'workplaceReady')} />
            <button
              onClick={() => {
                if (emp.allDone) { setPrepHint(''); onToggle(emp, 'allDone'); return }
                if (missing.length) { setPrepHint('Noch offen: ' + missing.join(' · ')); return }
                setPrepHint(''); onToggle(emp, 'allDone')
              }}
              title={emp.allDone ? 'Vorbereitung zurücksetzen' : missing.length ? 'Noch nicht vollständig – siehe Hinweis' : 'Als vorbereitet markieren'}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border transition-colors ${
                emp.allDone ? 'bg-green-600 border-green-700 text-white'
                  : missing.length ? 'bg-card border-border text-muted-foreground/70 hover:text-foreground'
                    : 'bg-card border-green-500/40 text-green-300 hover:bg-green-500/10'
              }`}>
              <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${emp.allDone ? 'bg-green-500 border-green-500' : 'border-muted-foreground'}`}>
                {emp.allDone && <Check size={10} className="text-white" />}
              </span>
              Alles Vorbereitet
            </button>
            {emp.allDone && !emp.deviceHandedOver && (
              <button onClick={() => onHandover(emp)}
                title="Gerät wurde an den Mitarbeiter übergeben – Eintrag wandert zu Bereits onboardet"
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border bg-blue-600 border-blue-700 text-white hover:bg-blue-500">
                <CheckCircle2 size={12} />Gerät übergeben
              </button>
            )}
            {emp.deviceHandedOver && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-green-600/40 text-green-300">
                <CheckCircle2 size={12} />Übergeben{emp.handedOverAt ? ` · ${formatGermanDate(emp.handedOverAt.slice(0, 10))}` : ''}
              </span>
            )}
            <button
              onClick={onMail}
              disabled={!emp.manager.trim()}
              title={emp.manager.trim() ? `Info-Anfrage an ${emp.manager} vorbereiten` : 'Kein Manager hinterlegt'}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Mail size={12} className="text-blue-400" />E-Mail an Manager
            </button>
            {!(emp.accessPass || '').trim() && (() => {
              const urgent = !isNaN(days) && days <= 5   // ab 5 Tagen vor Start bis überfällig
              return (
                <button
                  onClick={() => onAccessPassReminder(emp)}
                  disabled={!emp.manager.trim()}
                  title={emp.manager.trim()
                    ? `Access-Pass-Erinnerung an ${emp.manager} (CC support.marine@SKF.com) vorbereiten`
                    : 'Kein Manager hinterlegt'}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    urgent
                      ? 'bg-red-600 border-red-700 text-white hover:bg-red-500 animate-pulse'
                      : 'bg-card border-amber-500/40 text-amber-300 hover:bg-amber-500/10'
                  }`}
                >
                  <KeyRound size={12} />Access Pass Reminder
                </button>
              )
            })()}
            <button
              onClick={onOnboarding}
              title="Onboarding-Dashboard für diesen Mitarbeiter erstellen und verteilen"
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            >
              <Rocket size={12} className="text-purple-400" />Onboarding-Dashboard
            </button>
          </div>
          {prepHint && (
            <p className="text-[11px] text-red-700 font-medium mt-1.5">
              {prepHint} <button onClick={() => setPrepHint('')} className="underline opacity-70 hover:opacity-100">ok</button>
            </p>
          )}
        </div>
        <button onClick={onEdit} className="shrink-0 p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
      </div>
    </div>
  )
}

// ── "E-Mail an Manager": Teams-Rueckfrage + vorausgefuellte Outlook-Mail ──────
// Prozess: Wir fragen die Onboarding-Infos IMMER zuerst persoenlich (Teams) beim
// Manager an. Erst wenn das versucht wurde, oeffnet der Dialog eine vorbereitete
// Outlook-Mail (wird NICHT automatisch versendet) mit allen Fragen, die wir fuer
// die IT-Vorbereitung des neuen Mitarbeiters brauchen.

function buildManagerMailSubject(emp: Employee): string {
  const fullName = `${emp.vorname} ${emp.name}`.trim()
  const start = emp.startDate ? formatGermanDate(emp.startDate) : ''
  return `Neuer Mitarbeiter ${fullName}${start ? ` (Start ${start})` : ''} – Infos für die IT-Vorbereitung`
}

// ServiceNow-Bestellkatalog: Rufnummer/Durchwahl für einen Mitarbeiter.
const PHONE_ORDER_URL = 'https://skfprod.service-now.com/sp?id=sc_cat_item&table=sc_cat_item&sys_id=b7ab5f9c874e1190c85f43b90cbb35d3&recordUrl=com.glideapp.servicecatalog_cat_item_view.do%3Fv%3D1&sysparm_id=b7ab5f9c874e1190c85f43b90cbb35d3'

// HTML-Body, damit der ServiceNow-Bestelllink als klickbarer Text („jetzt
// bestellen") erscheint. Wird via composeEmail({ html: true }) an Outlook übergeben.
function buildManagerMailBody(emp: Employee): string {
  const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const fullName = `${emp.vorname} ${emp.name}`.trim() || 'der neue Mitarbeiter'
  const vorname = emp.vorname.trim() || fullName
  const start = emp.startDate ? `am ${formatGermanDate(emp.startDate)}` : 'in Kürze'
  const fn = esc(fullName), vn = esc(vorname)
  const href = PHONE_ORDER_URL.replace(/&/g, '&amp;')
  return (
    `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:11pt;color:#111;">` +
    `<p>Moin,</p>` +
    `<p>${esc(start)} startet ${fn} bei uns – wir möchten von IT-Seite alles perfekt vorbereiten.</p>` +
    `<p>Dafür benötigen wir bitte folgende Informationen:</p>` +
    `<ol>` +
    `<li>Erhält ${vn} ein Arbeitsgerät (PC oder Laptop)?<br>Falls ja: Bitte gib uns die Bestellnummer aus ServiceNow (REQ...) mit.</li>` +
    `<li>Welche Raumnummer / welcher Arbeitsplatz ist vorgesehen?</li>` +
    `<li>Wird zusätzliche Software benötigt, die noch nicht über ServiceNow bestellt wurde?</li>` +
    `<li>Ist der Arbeitsplatz bereits komplett ausgestattet?</li>` +
    `<li>Liegt der Temporary Access Pass bereits vor?</li>` +
    `<li>Sollen Gruppenpostfächer in Outlook eingebunden werden? Falls ja, welche?</li>` +
    `<li>Soll ${fn} eine Rufnummer/Durchwahl erhalten? Bitte hier bestellen: <a href="${href}">jetzt bestellen</a></li>` +
    `<li>Gibt es sonst noch Dinge, die wir beachten sollten?</li>` +
    `<li>Wann kommt ${vn} zur Geräteübergabe? (sofern Hardware von uns bereitgestellt wird)</li>` +
    `</ol>` +
    `<p>Vielen Dank und viele Grüße<br>Deine IT</p>` +
    `</div>`
  )
}

function ManagerMailDialog({ emp, onClose }: { emp: Employee; onClose: () => void }) {
  const [stage, setStage] = useState<'ask' | 'teamsFirst'>('ask')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')

  // ESC schliesst
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function openMail() {
    setBusy(true)
    try {
      // Manager-Mailadresse aus dem zentralen AD-Verzeichnis aufloesen (nur
      // Cache-Lesen vom Netzlaufwerk — keine AD-Live-Abfrage noetig).
      let to = ''
      try {
        const dir = await readCentralAdUsers()
        if (dir) {
          const hit = lookupUserByName(buildNameIndex(dir.users), emp.manager)
          if (hit?.email) to = hit.email
        }
      } catch { /* dann ohne Empfaenger oeffnen */ }
      await api().composeEmail({ to, cc: 'support.marine@skf.com', subject: buildManagerMailSubject(emp), body: buildManagerMailBody(emp), html: true })
      if (to) onClose()
      else setHint('E-Mail-Adresse des Managers wurde nicht automatisch gefunden – bitte im geöffneten Outlook-Fenster ergänzen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Mail size={16} className="text-blue-400" />
          <h3 className="text-sm font-semibold text-foreground flex-1">E-Mail an Manager: {emp.manager}</h3>
          <button onClick={onClose} disabled={busy} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40"><X size={15} /></button>
        </div>

        {stage === 'ask' && (
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-start gap-2.5">
              <MessageCircle size={18} className="text-purple-400 shrink-0 mt-0.5" />
              <p className="text-sm text-foreground leading-relaxed">
                Hast du schon versucht, <span className="font-semibold">{emp.manager}</span> persönlich
                über <span className="font-semibold">Teams</span> zu erreichen?
              </p>
            </div>
            {hint && <p className="text-xs text-amber-300">{hint}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setStage('teamsFirst')}
                disabled={busy}
                className="px-4 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30 disabled:opacity-40"
              >Nein</button>
              <button
                onClick={openMail}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >{busy ? <Loader size={13} className="animate-spin" /> : <Mail size={13} />}Ja, E-Mail öffnen</button>
            </div>
          </div>
        )}

        {stage === 'teamsFirst' && (
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-start gap-2.5">
              <MessageCircle size={18} className="text-purple-400 shrink-0 mt-0.5" />
              <p className="text-sm text-foreground leading-relaxed">
                Bitte versuche zuerst, <span className="font-semibold">{emp.manager}</span> persönlich
                über Teams zu erreichen – wir bevorzugen den persönlichen Kontakt.
                Wenn das nicht klappt, kannst du danach hier die E-Mail öffnen.
              </p>
            </div>
            <div className="flex items-center justify-end">
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
              >Verstanden</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CheckPill({ label, on, onClick, final }: { label: string; on: boolean; onClick: () => void; final?: boolean }) {
  // "final" = der vierte Haken "Alles erledigt" (blau abgesetzt) — er verschiebt
  // den Eintrag nach "Bereits onboardet".
  // Erledigt = gruen, aber Schrift SCHWARZ (sonst gruen auf gruen, unlesbar).
  const onCls = final ? 'bg-blue-500/20 border-blue-500/40 text-blue-200' : 'bg-green-500/90 border-green-600 text-black'
  const boxCls = final ? 'bg-blue-500 border-blue-500' : 'bg-green-500 border-green-500'
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border transition-colors ${on ? onCls : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'} ${final && !on ? 'font-semibold' : ''}`}>
      <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${on ? boxCls : 'border-muted-foreground'}`}>
        {on && <Check size={10} className="text-white" />}
      </span>
      {label}
    </button>
  )
}

// "Hardware fertig"-Dropdown: statt eines festen "Laptop fertig"-Hakens waehlt
// man die tatsaechlich bereitgestellte Geraeteart. Gruener Haken = erledigt.
function HardwarePill({ laptopReady, hardwareType, hardwareLocation, hardwareBy, onPick }: {
  laptopReady: boolean
  hardwareType: string
  hardwareLocation?: string
  hardwareBy?: string
  onPick: (key: HardwareType | null, location?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<HardwareType | null>(null)   // Gerät, das auf die Ort-Eingabe wartet
  const [loc, setLoc] = useState('')
  const done = laptopReady
  const inprogress = hardwareType === 'inprogress'
  const label = done ? hardwareLabel(hardwareType) : inprogress ? 'In Bearbeitung' : 'Hardware fertig'
  const btnCls = done
    ? 'bg-green-500/90 border-green-600 text-black'
    : inprogress
      ? 'bg-orange-500/90 border-orange-600 text-black'
      : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
  const boxCls = done ? 'bg-green-500 border-green-500' : inprogress ? 'bg-orange-500 border-orange-500' : 'border-muted-foreground'
  function closeAll() { setOpen(false); setPending(null) }
  function pick(key: HardwareType) {
    if (key === 'none') { onPick('none'); closeAll(); return }        // "Keine Hardware" -> keine Ortsabfrage
    setLoc(hardwareLocation || ''); setPending(key)                    // Laptop/Z-Book/Tower/Mini-PC/In Bearbeitung -> Ort abfragen
  }
  function confirmPending() { if (!pending || !loc.trim()) return; onPick(pending, loc.trim()); closeAll() }
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border transition-colors ${btnCls}`}>
        <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${boxCls}`}>
          {done && <Check size={10} className="text-white" />}
        </span>
        {label}
        {(done || inprogress) && hardwareLocation ? <span className="font-normal">· {hardwareLocation}</span> : null}
        {(done || inprogress) && hardwareBy ? <span className="opacity-70 text-[9px]">({hardwareBy})</span> : null}
        <ChevronDown size={12} className="opacity-70" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={closeAll} />
          <div className="absolute z-20 mt-1 left-0 min-w-[220px] rounded-md border border-border bg-card shadow-xl py-1">
            {!pending ? (
              <>
                {HARDWARE_OPTIONS.filter(o => o.key !== 'inprogress').map(o => (
                  <button key={o.key} onClick={() => pick(o.key)}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-foreground hover:bg-accent flex items-center gap-2">
                    <span className="w-3 flex justify-center shrink-0">{done && hardwareType === o.key && <Check size={11} className="text-green-400" />}</span>
                    {o.label}
                  </button>
                ))}
                <div className="my-1 border-t border-border" />
                <button onClick={() => pick('inprogress')}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-orange-300 hover:bg-orange-500/10 flex items-center gap-2">
                  <span className="w-3 flex justify-center shrink-0">{inprogress && <Check size={11} className="text-orange-400" />}</span>
                  In Bearbeitung…
                </button>
                {(done || inprogress) && (
                  <>
                    <div className="my-1 border-t border-border" />
                    <button onClick={() => { onPick(null); closeAll() }}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-red-300 hover:bg-red-500/10 flex items-center gap-2">
                      <span className="w-3 shrink-0" />Zurücksetzen
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="px-3 py-2 space-y-1.5">
                <p className="text-[10px] text-muted-foreground">
                  {pending === 'inprogress' ? 'In Bearbeitung – Ort/Raum, wo das Gerät gerade ist:' : `${hardwareLabel(pending)} – Ort/Raum, wo das Gerät liegt:`}
                </p>
                <input autoFocus value={loc} onChange={e => setLoc(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmPending() }}
                  placeholder="z. B. Werkstatt / Raum 123"
                  className="w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/40" />
                <div className="flex items-center gap-1.5">
                  <button onClick={confirmPending} disabled={!loc.trim()}
                    className={`px-2 py-1 text-[11px] rounded text-black disabled:opacity-40 ${pending === 'inprogress' ? 'bg-orange-500 hover:bg-orange-400' : 'bg-green-500 hover:bg-green-400'}`}>Setzen</button>
                  <button onClick={() => setPending(null)} className="px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:text-foreground">Zurück</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Edit-Modal: Mitarbeiter ─────────────────────────────────────────────────
function EmployeeEditModal({ emp, username, onClose, onSaved }: { emp: Employee; username: string; onClose: () => void; onSaved: () => void }) {
  const isNew = !emp.id
  const [f, setF] = useState<Employee>({ ...emp, startDate: emp.startDate ? formatGermanDate(emp.startDate) : '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = <K extends keyof Employee>(k: K, v: Employee[K]) => setF(prev => ({ ...prev, [k]: v }))

  async function save() {
    setSaving(true); setErr('')
    const payload: Partial<Employee> = { ...f, startDate: toIsoDate(f.startDate), handoverDate: f.handoverDate }
    const r = isNew
      ? await createEmployee({ ...payload, createdBy: username })
      : await updateEmployee(emp.id, payload)
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Speichern fehlgeschlagen.'); return }
    onSaved()
  }
  async function remove() {
    if (!window.confirm(`${f.vorname} ${f.name} wirklich loeschen?`)) return
    setSaving(true)
    await deleteEmployee(emp.id)
    setSaving(false); onSaved()
  }

  // Alle Pflichtangaben für eine Checkliste vorhanden?
  const canCreateChecklist =
    f.vorname.trim() !== '' && f.name.trim() !== '' && f.globalId.trim() !== '' &&
    f.deploymentTask.trim() !== '' && f.hardwareSerial.trim() !== ''

  async function createChecklistFromEmp() {
    const missing: string[] = []
    if (!f.vorname.trim()) missing.push('Vorname')
    if (!f.name.trim()) missing.push('Nachname')
    if (!f.globalId.trim()) missing.push('Global ID')
    if (!f.deploymentTask.trim()) missing.push('Deployment-TASK')
    if (!f.hardwareSerial.trim()) missing.push('Seriennummer Hardware')
    if (missing.length) { setErr('Für die Checkliste fehlen noch: ' + missing.join(', ')); return }
    setSaving(true); setErr('')
    // 1. Mitarbeiter zuerst speichern, damit Deployment-TASK/Seriennummer persistiert sind.
    const payload: Partial<Employee> = { ...f, startDate: toIsoDate(f.startDate) }
    const rSave = isNew
      ? await createEmployee({ ...payload, createdBy: username })
      : await updateEmployee(emp.id, payload)
    if (!rSave.ok) { setSaving(false); setErr(rSave.error || 'Speichern fehlgeschlagen.'); return }
    // 2. Duplikat-Check über die Global ID.
    try {
      const existing = await listChecklists()
      const dupe = existing.find(c => (c.corpId || '').toUpperCase() === f.globalId.toUpperCase().trim())
      if (dupe && !window.confirm(`Für Global ID ${f.globalId.toUpperCase().trim()} gibt es bereits eine Checkliste${dupe.taskNumber ? ` (${dupe.taskNumber})` : ''}. Trotzdem eine weitere anlegen?`)) {
        setSaving(false); onSaved(); return
      }
    } catch { /* Liste nicht ladbar -> trotzdem anlegen */ }
    // 3. Checkliste anlegen (Pflichtfelder aus dem Mitarbeiter übernommen).
    const cr = await createChecklist({
      taskNumber: f.deploymentTask.trim(),
      name: `${f.vorname.trim()} ${f.name.trim()}`,
      corpId: f.globalId.toUpperCase().trim(),
      technician: username,
      deviceType: 'new',
      newDeviceSerial: f.hardwareSerial.trim(),
      createdBy: username,
    })
    setSaving(false)
    if (!cr.ok) { setErr(cr.error || 'Checkliste konnte nicht erstellt werden.'); return }
    onSaved()
  }

  return (
    <ModalShell title={isNew ? 'Neuer Mitarbeiter' : `${emp.vorname} ${emp.name} bearbeiten`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vorname"><Inp v={f.vorname} on={v => set('vorname', v)} /></Field>
        <Field label="Nachname"><Inp v={f.name} on={v => set('name', v)} /></Field>
        <Field label="Global ID"><Inp v={f.globalId} on={v => set('globalId', v.toUpperCase())} mono /></Field>
        <Field label="Eintrittsdatum (TT.MM.JJJJ)"><Inp v={f.startDate} on={v => set('startDate', v)} placeholder="z.B. 01.07.2026" /></Field>
        <Field label="Manager"><Inp v={f.manager} on={v => set('manager', v)} /></Field>
        <Field label="Stellenbezeichnung"><Inp v={f.jobTitle} on={v => set('jobTitle', v)} /></Field>
        <Field label="Abteilung"><Inp v={f.department} on={v => set('department', v)} /></Field>
        <Field label="Kostenstelle"><Inp v={f.costCenter} on={v => set('costCenter', v)} /></Field>
        <Field label="SNOW Request"><Inp v={f.request} on={v => set('request', v)} /></Field>
        <Field label="RITM Laptop"><Inp v={f.ritmLaptop} on={v => set('ritmLaptop', v)} /></Field>
        <Field label="Deployment-TASK"><Inp v={f.deploymentTask} on={v => set('deploymentTask', v)} mono /></Field>
        <Field label="Seriennummer Hardware"><Inp v={f.hardwareSerial} on={v => set('hardwareSerial', v)} mono /></Field>
        <Field label="Laptop Typ"><Inp v={f.laptopType} on={v => set('laptopType', v)} /></Field>
        <Field label="Durchwahl"><Inp v={f.phoneExtension} on={v => set('phoneExtension', v)} /></Field>
        <Field label="Einmal-Passwort / Access Pass"><Inp v={f.accessPass} on={v => set('accessPass', v)} mono /></Field>
        <Field label="Access Pass UPN"><Inp v={f.accessPassUpn} on={v => set('accessPassUpn', v)} /></Field>
        <Field label="Gruppenpostfach"><Inp v={f.groupMailbox} on={v => set('groupMailbox', v)} /></Field>
        <Field label="Raumnummer / Arbeitsplatz"><Inp v={f.roomNumber} on={v => set('roomNumber', v)} /></Field>
        <Field label="Standard-Ausrüstung"><Inp v={f.standardEquipment} on={v => set('standardEquipment', v)} /></Field>
        <Field label="Extra-Ausrüstung"><Inp v={f.extraEquipment} on={v => set('extraEquipment', v)} /></Field>
        <Field label="Extra Software"><Inp v={f.extraSoftware} on={v => set('extraSoftware', v)} /></Field>
        <Field label="Geräte-Übergabe-Termin"><Inp v={f.handoverDate} on={v => set('handoverDate', v)} /></Field>
      </div>
      <Field label="Sonstiges"><textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows={2} className="w-full px-2.5 py-1.5 text-sm rounded-md bg-card border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary" /></Field>

      {/* Checkboxen */}
      <div className="flex items-center gap-3 mt-1 flex-wrap">
        <CheckPill label="Manager kontaktiert" on={f.managerContacted} onClick={() => set('managerContacted', !f.managerContacted)} />
        <HardwarePill laptopReady={f.laptopReady} hardwareType={f.hardwareType} hardwareLocation={f.hardwareLocation} hardwareBy={f.hardwareBy}
          onPick={(key, loc) => setF(prev =>
            key === null ? { ...prev, laptopReady: false, hardwareType: '', hardwareLocation: '', hardwareBy: '' }
            : key === 'none' ? { ...prev, laptopReady: true, hardwareType: 'none', hardwareLocation: '', hardwareBy: '' }
            : key === 'inprogress' ? { ...prev, laptopReady: false, hardwareType: 'inprogress', hardwareLocation: (loc || '').trim(), hardwareBy: username }
            : { ...prev, laptopReady: true, hardwareType: key, hardwareLocation: (loc || '').trim(), hardwareBy: username })} />
        <CheckPill label="Arbeitsplatz steht" on={f.workplaceReady} onClick={() => set('workplaceReady', !f.workplaceReady)} />
        <CheckPill label="Alles Vorbereitet" on={f.allDone} onClick={() => set('allDone', !f.allDone)} final />
      </div>

      {err && <p className="text-xs text-red-300 mt-2">{err}</p>}
      <div className="flex items-center gap-2 mt-4">
        {!isNew && <button onClick={remove} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-red-500/40 text-red-300 hover:bg-red-500/10"><Trash2 size={13} />Löschen</button>}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Abbrechen</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}Speichern</button>
          <button onClick={createChecklistFromEmp} disabled={saving || !canCreateChecklist}
            title={canCreateChecklist ? 'Checkliste unter „Checklisten" anlegen (speichert den Mitarbeiter mit)' : 'Benötigt: Vorname, Nachname, Global ID, Deployment-TASK und Seriennummer Hardware'}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed">
            <ClipboardCheck size={13} />Checkliste erstellen
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Edit-Modal: Austritt ─────────────────────────────────────────────────────
function DepartureEditModal({ dep, username, onClose, onSaved }: { dep: Departure; username: string; onClose: () => void; onSaved: () => void }) {
  const isNew = !dep.id
  const [f, setF] = useState<Departure>({ ...dep, exitDate: dep.exitDate ? formatGermanDate(dep.exitDate) : '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = <K extends keyof Departure>(k: K, v: Departure[K]) => setF(prev => ({ ...prev, [k]: v }))

  async function save() {
    setSaving(true); setErr('')
    const payload: Partial<Departure> = { ...f, exitDate: toIsoDate(f.exitDate) }
    const r = isNew ? await createDeparture({ ...payload, createdBy: username }) : await updateDeparture(dep.id, payload)
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Speichern fehlgeschlagen.'); return }
    onSaved()
  }
  async function remove() {
    if (!window.confirm(`Austritt von ${f.name} wirklich loeschen?`)) return
    setSaving(true); await deleteDeparture(dep.id); setSaving(false); onSaved()
  }

  return (
    <ModalShell title={isNew ? 'Neuer Austritt' : `Austritt: ${dep.name}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><Inp v={f.name} on={v => set('name', v)} /></Field>
        <Field label="Global ID"><Inp v={f.globalId} on={v => set('globalId', v.toUpperCase())} mono /></Field>
        <Field label="Austrittsdatum (TT.MM.JJJJ)"><Inp v={f.exitDate} on={v => set('exitDate', v)} placeholder="z.B. 31.07.2026" /></Field>
        <Field label="Manager"><Inp v={f.manager} on={v => set('manager', v)} /></Field>
        <Field label="Geräte-Name"><Inp v={f.deviceName} on={v => set('deviceName', v)} /></Field>
        <Field label="SNOW Task"><Inp v={f.task} on={v => set('task', v)} /></Field>
      </div>
      <Field label="Sonstiges"><textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows={2} className="w-full px-2.5 py-1.5 text-sm rounded-md bg-card border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary" /></Field>
      <label className="flex items-center gap-2 mt-1 text-sm text-foreground cursor-pointer">
        <input type="checkbox" checked={f.deviceReturned} onChange={() => set('deviceReturned', !f.deviceReturned)} className="accent-primary" />Gerät wurde abgegeben
      </label>
      {err && <p className="text-xs text-red-300 mt-2">{err}</p>}
      <div className="flex items-center gap-2 mt-4">
        {!isNew && <button onClick={remove} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-red-500/40 text-red-300 hover:bg-red-500/10"><Trash2 size={13} />Löschen</button>}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Abbrechen</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}Speichern</button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── kleine UI-Helfer ──────────────────────────────────────────────────────────
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Nur schließen, wenn Maus-DRUCK und -LOSLASSEN beide auf dem Backdrop selbst
  // passieren. Verhindert das versehentliche Schließen, wenn man Text in einem
  // Feld markiert und dabei mit der Maus aus dem Fenster/über den Rand zieht
  // (dabei würde ein Klick auf den Backdrop ausgelöst).
  const downOnBackdrop = useRef(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget }}
      onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose() }}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <FileText size={16} className="text-primary" />
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">{children}</div>
      </div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] text-muted-foreground">{label}</span><div className="mt-0.5">{children}</div></label>
}
function Inp({ v, on, mono, placeholder }: { v: string; on: (v: string) => void; mono?: boolean; placeholder?: string }) {
  return <input value={v} placeholder={placeholder} onChange={e => on(e.target.value)}
    className={`w-full px-2.5 py-1.5 text-sm rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary ${mono ? 'font-mono' : ''}`} />
}
