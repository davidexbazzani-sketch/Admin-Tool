import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ClipboardList, Plus, Trash2, Download, Eye, RefreshCw, Search, Loader,
  FileText, Edit3, X, Save, CheckCircle, XCircle, AlertTriangle, ArrowLeft, Printer,
  PackageCheck, RotateCcw, Check, ChevronDown, Mail, Flame, Maximize2, Minimize2, Filter, Info, Columns3, Move,
  FileSpreadsheet, ChevronRight, MapPin,
} from 'lucide-react'
import {
  listChecklists, createChecklist, updateChecklist, deleteChecklist,
  type Checklist, type DeviceType,
} from '../services/checklists'
import { importTasks, type ImportResult } from '../services/checklistImport'
import { openFileForImport, parseExcelSheet, type ExcelSheetData } from '../utils/fileImport'
import TaskColumnDialog, { detectTaskCol } from '../components/TaskColumnDialog'
import { downloadChecklistPdf, printChecklist } from '../services/checklistPdf'
import { batchAdLookup } from '../services/adUserLookup'
import { listEmployees, formatGermanDate, HARDWARE_OPTIONS, hardwareLabel, type Employee, type HardwareType } from '../services/employees'
import { readCentralAdUsers, buildNameIndex, lookupUserByName } from '../services/adUserDirectory'
import { ensureSkfLogo } from '../services/skfLogo'
import SignaturePad from '../components/SignaturePad'
import { useAuthStore } from '../store/authStore'
import { api } from '../electronAPI'
import { PersonInfoButton } from '../components/person/PersonDossier'
import { DeviceInfoButton } from '../components/device/DeviceDossier'
import { loadChecklistDeviceInfos, BEKANNTE_SOFTWARE, type ChecklistDeviceInfo } from '../services/deviceMasterData'
import { moveDeviceOnAllMaps, DEVICE_MAPS } from '../services/deviceMaps'
import { useAppStore } from '../store/appStore'
import { useMapIntentStore } from '../store/mapIntentStore'
import { runHandoverAutomation, handoverSummary } from '../services/checklistServiceNow'
import SolidWorksHelp from '../components/solidworks/SolidWorksHelp'
import CoscomHelp from '../components/coscom/CoscomHelp'

type View = 'list' | 'edit' | 'preview'

// Spalten mit Excel-artigem Filter, deren Wert DIREKT aus der Checkliste kommt.
// (Software/Model kommen aus den asynchron geladenen Geräteinfos → siehe colValue().)
const FILTER_COLS: { id: string; label: string; val: (c: Checklist) => string }[] = [
  { id: 'name', label: 'Name', val: c => c.name || '—' },
  { id: 'typ', label: 'Typ', val: c => c.deviceType === 'new' ? 'Neu' : 'Refresh' },
  { id: 'corpId', label: 'Corp-ID', val: c => c.corpId || '—' },
  { id: 'newSn', label: 'Neu (SN)', val: c => c.newDeviceSerial || '—' },
  { id: 'alt', label: 'Alt', val: c => c.oldDeviceId || '—' },
  { id: 'task', label: 'TASK', val: c => c.taskNumber || '—' },
  { id: 'signiert', label: 'Signiert', val: c => c.signatureDataUrl ? 'Signiert' : 'Offen' },
]

// Alle filterbaren Spalten inkl. der dynamischen (Software/Model). Der Wert wird über
// colValue() ermittelt (statisch aus der Checkliste oder aus den Geräteinfos).
const FILTERABLE_COLS: { id: string; label: string }[] = [
  ...FILTER_COLS.map(c => ({ id: c.id, label: c.label })),
  { id: 'software', label: 'Software' },
  { id: 'model', label: 'Model' },
]

// Ein-/ausblendbare Spalten (pro Nutzer lokal). "aktion" bleibt immer sichtbar.
const HIDEABLE_COLS: { id: string; label: string }[] = [
  { id: 'task', label: 'TASK' },
  { id: 'name', label: 'Name' },
  { id: 'notiz', label: 'Notiz' },
  { id: 'corpId', label: 'Corp-ID' },
  { id: 'typ', label: 'Typ' },
  { id: 'software', label: 'Software' },
  { id: 'newSn', label: 'Neu (SN)' },
  { id: 'model', label: 'Model' },
  { id: 'alt', label: 'Alt' },
  { id: 'erstellt', label: 'Erstellt' },
  { id: 'signiert', label: 'Signiert' },
  { id: 'uebergeben', label: 'Übergeben' },
]

// Spalten-Metadaten (Reihenfolge = Standardanordnung; th-/td-Klassen je Spalte).
const COLS: Record<string, { label: string; th: string; td: string }> = {
  task: { label: 'TASK', th: 'w-32', td: 'font-mono text-foreground' },
  name: { label: 'Name', th: '', td: 'text-foreground' },
  notiz: { label: 'Notiz', th: 'w-48', td: 'align-top' },
  corpId: { label: 'Corp-ID', th: 'w-24', td: 'font-mono text-foreground' },
  typ: { label: 'Typ', th: 'w-20', td: '' },
  software: { label: 'Software', th: 'w-44', td: '' },
  newSn: { label: 'Neu (SN)', th: '', td: 'font-mono text-foreground' },
  model: { label: 'Model', th: 'w-40', td: 'text-muted-foreground' },
  alt: { label: 'Alt', th: '', td: 'font-mono text-muted-foreground' },
  erstellt: { label: 'Erstellt', th: 'w-28', td: 'text-muted-foreground' },
  signiert: { label: 'Signiert', th: 'w-24 text-center', td: 'text-center' },
  uebergeben: { label: 'Übergeben', th: 'w-32', td: 'text-muted-foreground' },
}
const DEFAULT_COL_ORDER = HIDEABLE_COLS.map(c => c.id)
const DRAG_INDICATOR = '#3b82f6'   // blaue Linie, die anzeigt, wohin das Element kommt

// Anordnung normalisieren: unbekannte IDs raus, fehlende (z.B. nach Update) hinten anhängen.
function normColOrder(stored: string[] | null | undefined): string[] {
  const base = (stored || []).filter(id => DEFAULT_COL_ORDER.includes(id))
  for (const id of DEFAULT_COL_ORDER) if (!base.includes(id)) base.push(id)
  return base
}

// Element im Array vor/hinter ein Ziel verschieben.
function moveInOrder(arr: string[], dragId: string, targetId: string, before: boolean): string[] {
  const a = arr.filter(x => x !== dragId)
  const idx = a.indexOf(targetId)
  if (idx < 0) return arr
  a.splice(before ? idx : idx + 1, 0, dragId)
  return a
}

// Vergleich nach gespeicherter Reihenfolge; noch nicht einsortierte (z.B. neu angelegte)
// Checklisten stehen oben und dort nach Erstelldatum (neueste zuerst).
function cmpByOrder(order: string[]) {
  const pos = new Map(order.map((id, i) => [id, i]))
  return (a: Checklist, b: Checklist) => {
    const pa = pos.has(a.id) ? (pos.get(a.id) as number) : -1
    const pb = pos.has(b.id) ? (pos.get(b.id) as number) : -1
    if (pa !== pb) return pa - pb
    return (b.createdAt || '').localeCompare(a.createdAt || '')
  }
}
// Checklisten-IDs nach gespeicherter Reihenfolge sortieren.
function orderIds(items: Checklist[], order: string[]): string[] {
  return [...items].sort(cmpByOrder(order)).map(x => x.id)
}

function emptyDraft(currentUser: string): Omit<Checklist, 'id' | 'createdAt'> {
  return {
    taskNumber: '',
    name: '',
    corpId: '',
    technician: currentUser,
    deviceType: 'new',
    newDeviceSerial: '',
    oldDeviceId: '',
    comment: '',
    priority: false,
    signatureDataUrl: undefined,
    signatureDate: undefined,
    createdBy: currentUser,
  }
}

/** Import-Platzhalter (nur TASK gesetzt, Kerndaten fehlen) → in der Übersicht rot markiert. */
function isPlaceholder(c: Checklist): boolean {
  return !c.completed && (!(c.name || '').trim() || !(c.newDeviceSerial || '').trim())
}

type Toast = { kind: 'success' | 'error'; text: string }

// Kanonischer Name fuer den Abgleich: klein, Leerzeichen normiert; "Nachname,
// Vorname" wird zu "Vorname Nachname" umgestellt.
function canonName(s: string): string {
  let n = (s || '').trim().replace(/\s+/g, ' ')
  if (n.includes(',')) { const p = n.split(','); if (p.length === 2 && p[0].trim() && p[1].trim()) n = `${p[1].trim()} ${p[0].trim()}` }
  return n.toLowerCase()
}

export default function Checklists() {
  const user = useAuthStore(s => s.session?.user)
  const currentUserName = user?.displayName || user?.username || ''

  const [view, setView] = useState<View>('list')
  const [items, setItems] = useState<Checklist[]>([])
  const [loading, setLoading] = useState(true)
  const [importBusy, setImportBusy] = useState(false)
  const [pendingExcel, setPendingExcel] = useState<ExcelSheetData | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [search, setSearch] = useState('')
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({})   // Excel-Spaltenfilter: erlaubte Werte je Spalte
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Omit<Checklist, 'id' | 'createdAt'>>(emptyDraft(currentUserName))
  const [toast, setToast] = useState<Toast | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Checklist | null>(null)
  const [printingId, setPrintingId] = useState<string | null>(null)
  // Uebersichts-Tab: offene vs. erledigte (uebergebene) Checklisten
  const [listTab, setListTab] = useState<'open' | 'done'>('open')
  // Neue Mitarbeiter (aus der Mitarbeiterverwaltung) fuer die Markierung
  const [employees, setEmployees] = useState<Employee[]>([])
  // Checkliste, deren Geraeteuebergabe gerade bestaetigt werden soll
  const [pendingComplete, setPendingComplete] = useState<Checklist | null>(null)
  const [placeOnMap, setPlaceOnMap] = useState<Checklist | null>(null)   // Neu-Gerät: Standort einzeichnen?
  const setScreen = useAppStore(s => s.setScreen)
  // Geräteinfos je Checklisten-ID (Modell des neuen Geräts, Kommentar + relevante
  // Software des Altgeräts). Live aus zwei netzgecachten JSON.
  const [deviceInfos, setDeviceInfos] = useState<Map<string, ChecklistDeviceInfo>>(new Map())
  const [infoLoading, setInfoLoading] = useState(false)
  // Pro Nutzer lokal gespeicherte Ansicht (nur für diesen Nutzer, nicht geteilt;
  // bleibt im localStorage auch über Tool-Updates hinweg erhalten).
  const userTag = user?.username || user?.displayName || 'default'
  const hideKey = `checklists.hiddenCols.${userTag}`
  const colOrderKey = `checklists.colOrder.${userTag}`
  const rowOrderKey = `checklists.rowOrder.${userTag}`
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try { const raw = localStorage.getItem(hideKey); return new Set(raw ? JSON.parse(raw) as string[] : []) }
    catch { return new Set() }
  })
  const [colOrder, setColOrder] = useState<string[]>(() => {
    try { return normColOrder(JSON.parse(localStorage.getItem(colOrderKey) || 'null')) } catch { return normColOrder(null) }
  })
  const [rowOrder, setRowOrder] = useState<string[]>(() => {
    try { const raw = localStorage.getItem(rowOrderKey); return raw ? JSON.parse(raw) as string[] : [] } catch { return [] }
  })
  const vis = (id: string) => !hiddenCols.has(id)
  function toggleCol(id: string) {
    setHiddenCols(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      try { localStorage.setItem(hideKey, JSON.stringify([...next])) } catch { /* localStorage optional */ }
      return next
    })
  }
  function resetAnordnung() {
    setColOrder(normColOrder(null)); setRowOrder([])
    try { localStorage.removeItem(colOrderKey); localStorage.removeItem(rowOrderKey) } catch { /* egal */ }
  }

  // ── Drag & Drop: Spalten und Zeilen per Gedrückthalten verschieben ──────────
  // Long-Press (~230 ms) startet den Ziehmodus (Cursor = Hand). Beim Ziehen zeigt
  // eine blaue Linie, wohin das Element kommt. Reihenfolge ist pro Nutzer lokal.
  const [dragKind, setDragKind] = useState<{ type: 'col' | 'row'; id: string } | null>(null)
  const [dropInfo, setDropInfo] = useState<{ type: 'col' | 'row'; id: string; before: boolean } | null>(null)
  const pressRef = useRef<{ timer: number; x: number; y: number; type: 'col' | 'row'; id: string; started: boolean } | null>(null)
  const dragRef = useRef<{ type: 'col' | 'row'; id: string } | null>(null)
  const dropRef = useRef<{ type: 'col' | 'row'; id: string; before: boolean } | null>(null)
  const itemsRef = useRef<Checklist[]>(items)
  itemsRef.current = items

  function dragStart(e: ReactPointerEvent, type: 'col' | 'row', id: string) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const t = e.target as HTMLElement
    if (t.closest('button, input, textarea, a, label, select, [role="button"]')) return   // Bedienelemente nicht blockieren
    const x = e.clientX, y = e.clientY
    const timer = window.setTimeout(() => {
      const p = pressRef.current
      if (!p) return
      p.started = true
      dragRef.current = { type, id }
      setDragKind({ type, id })
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'
    }, 230)
    pressRef.current = { timer, x, y, type, id, started: false }
  }

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pressRef.current
      if (!p) return
      if (!p.started) {
        if (Math.abs(e.clientX - p.x) > 6 || Math.abs(e.clientY - p.y) > 6) { clearTimeout(p.timer); pressRef.current = null }
        return
      }
      e.preventDefault()
      const d = dragRef.current
      if (!d) return
      // Neuen Drop-Zielwert bestimmen; nur bei Änderung neu rendern.
      const apply = (next: { type: 'col' | 'row'; id: string; before: boolean } | null) => {
        const cur = dropRef.current
        if ((cur?.id === next?.id) && (cur?.before === next?.before) && (cur?.type === next?.type)) return
        dropRef.current = next; setDropInfo(next)
      }
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      if (!el) { apply(null); return }
      if (d.type === 'col') {
        const holder = el.closest('[data-colid]') as HTMLElement | null
        const cid = holder?.dataset.colid
        if (!holder || !cid || cid === 'aktion' || cid === d.id) { apply(null); return }
        const r = holder.getBoundingClientRect()
        apply({ type: 'col', id: cid, before: e.clientX < r.left + r.width / 2 })
      } else {
        const holder = el.closest('[data-rowid]') as HTMLElement | null
        const rid = holder?.dataset.rowid
        if (!holder || !rid || rid === d.id) { apply(null); return }
        const r = holder.getBoundingClientRect()
        apply({ type: 'row', id: rid, before: e.clientY < r.top + r.height / 2 })
      }
    }
    const finish = () => {
      const p = pressRef.current
      if (p) clearTimeout(p.timer)
      const d = dragRef.current, drop = dropRef.current
      if (p?.started && d && drop) {
        if (d.type === 'col') {
          setColOrder(prev => {
            const next = moveInOrder(prev, d.id, drop.id, drop.before)
            try { localStorage.setItem(colOrderKey, JSON.stringify(next)) } catch { /* egal */ }
            return next
          })
        } else {
          setRowOrder(prev => {
            const next = moveInOrder(orderIds(itemsRef.current, prev), d.id, drop.id, drop.before)
            try { localStorage.setItem(rowOrderKey, JSON.stringify(next)) } catch { /* egal */ }
            return next
          })
        }
      }
      pressRef.current = null; dragRef.current = null; dropRef.current = null
      setDragKind(null); setDropInfo(null)
      document.body.style.cursor = ''; document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isDragging = (type: 'col' | 'row', id: string) => dragKind?.type === type && dragKind.id === id
  const dropStyle = (type: 'col' | 'row', id: string): CSSProperties | undefined => {
    if (!dropInfo || dropInfo.type !== type || dropInfo.id !== id) return undefined
    if (type === 'col') return { boxShadow: `inset ${dropInfo.before ? '3px' : '-3px'} 0 0 0 ${DRAG_INDICATOR}` }
    return { boxShadow: `inset 0 ${dropInfo.before ? '3px' : '-3px'} 0 0 ${DRAG_INDICATOR}` }
  }

  // AD lookup for Corp-ID: auto-fires (debounced) when the name field changes
  // — only fills the Corp-ID field if it's currently empty, so manual edits
  // are never overwritten. Manual refresh button next to the Corp-ID field
  // forces a re-lookup and overrides.
  const [corpLookup, setCorpLookup] = useState<'idle' | 'loading' | 'found' | 'notFound' | 'error'>('idle')
  const lastLookupNameRef = useRef<string>('')

  function showToast(t: Toast) {
    setToast(t)
    setTimeout(() => setToast(curr => (curr === t ? null : curr)), 4000)
  }

  async function reload() {
    setLoading(true)
    try { setItems(await listChecklists()) }
    finally { setLoading(false) }
  }

  // ── Checklisten importieren: fehlende TASK-Nummern aus Excel anlegen ─────────
  async function runImportFromExcel(sheet: ExcelSheetData, taskCols: string[]) {
    const tasks = sheet.rows.flatMap(r => taskCols.map(c => String(r[c] ?? '').trim())).filter(Boolean)
    if (tasks.length === 0) { showToast({ kind: 'error', text: 'In der gewählten Spalte wurden keine TASK-Nummern gefunden.' }); return }
    setImportBusy(true)
    try {
      const res = await importTasks(tasks, currentUserName)
      setImportResult(res)
      if (res.ok) { await reload(); setListTab('open') }
      else showToast({ kind: 'error', text: res.error || 'Import fehlgeschlagen.' })
    } finally { setImportBusy(false) }
  }

  async function handleImportClick() {
    if (importBusy) return
    setImportBusy(true)
    try {
      const file = await openFileForImport()
      if (!file) return
      if (!['xlsx', 'xls', 'csv'].includes(file.ext)) { showToast({ kind: 'error', text: 'Bitte eine Excel-/CSV-Datei wählen.' }); return }
      const sheet = parseExcelSheet(file.bytes)
      if (sheet.columns.length === 0) { showToast({ kind: 'error', text: 'Keine Spalten in der Datei gefunden.' }); return }
      const auto = sheet.columns.filter(c => detectTaskCol(c) === 'task')
      if (auto.length === 1) { await runImportFromExcel(sheet, [auto[0].name]) }
      else setPendingExcel(sheet)   // nicht eindeutig → Spalten-Wähler
    } catch (e) {
      showToast({ kind: 'error', text: 'Import fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)) })
    } finally { setImportBusy(false) }
  }

  function onTaskColConfirm(taskColNames: string[]) {
    const sheet = pendingExcel
    setPendingExcel(null)
    if (sheet && taskColNames.length > 0) void runImportFromExcel(sheet, taskColNames)
  }

  // Abhol-Mail-Dialog (nur Bestandsmitarbeiter)
  const [pickupMail, setPickupMail] = useState<Checklist | null>(null)

  // "Hardware fertig" für Bestandsmitarbeiter setzen (Gerät + Abhol-Ort + Bearbeiter).
  async function setChecklistHardware(c: Checklist, key: HardwareType | null, location?: string) {
    const now = new Date().toISOString()
    const patch: Partial<Checklist> =
      key === null ? { hardwareReady: false, hardwareType: '', hardwareLocation: '', hardwareBy: '', hardwareAt: '' }
      : key === 'none' ? { hardwareReady: true, hardwareType: 'none', hardwareLocation: '', hardwareBy: currentUserName, hardwareAt: now }
      : key === 'inprogress' ? { hardwareReady: false, hardwareType: 'inprogress', hardwareLocation: (location || '').trim(), hardwareBy: currentUserName, hardwareAt: now }
      : { hardwareReady: true, hardwareType: key, hardwareLocation: (location || '').trim(), hardwareBy: currentUserName, hardwareAt: now }
    setItems(prev => prev.map(x => x.id === c.id ? { ...x, ...patch } : x))
    await updateChecklist(c.id, patch)
  }

  // Notiz je Eintrag direkt aus der Übersicht speichern.
  async function saveNotiz(c: Checklist, text: string) {
    if ((c.notiz || '') === text) return
    setItems(prev => prev.map(x => x.id === c.id ? { ...x, notiz: text } : x))
    await updateChecklist(c.id, { notiz: text })
  }

  // Manuell ergänzte Software je Eintrag speichern (zusätzlich zur Auto-Erkennung).
  async function saveManualSoftware(c: Checklist, list: string[]) {
    const clean = [...new Set(list.map(s => s.trim()).filter(Boolean))]
    setItems(prev => prev.map(x => x.id === c.id ? { ...x, manualSoftware: clean } : x))
    await updateChecklist(c.id, { manualSoftware: clean })
  }

  useEffect(() => { reload() }, [])

  // Resolve one identity (name) against AD and return the SAM if found
  async function lookupCorpId(name: string, opts: { overwrite: boolean }): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) { setCorpLookup('idle'); return }
    setCorpLookup('loading')
    try {
      const result = await batchAdLookup([trimmed])
      const res = result.get(trimmed)
      if (res?.found && res.sam) {
        setCorpLookup('found')
        setDraft(d => {
          if (!opts.overwrite && d.corpId.trim()) return d  // keep existing manual value
          return { ...d, corpId: res.sam! }
        })
      } else {
        setCorpLookup('notFound')
      }
    } catch {
      setCorpLookup('error')
    }
  }

  // Debounced auto-lookup when name changes (only in edit view).
  useEffect(() => {
    if (view !== 'edit') return
    const name = draft.name.trim()
    if (name.length < 3) { setCorpLookup('idle'); return }
    if (name === lastLookupNameRef.current) return
    const handle = setTimeout(() => {
      lastLookupNameRef.current = name
      void lookupCorpId(name, { overwrite: false })
    }, 700)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.name, view])

  // Neue Mitarbeiter laden -> Index nach kanonischem Namen
  useEffect(() => { listEmployees().then(setEmployees).catch(() => {}) }, [])
  const empByName = useMemo(() => {
    const m = new Map<string, Employee>()
    for (const e of employees) {
      for (const v of [`${e.vorname} ${e.name}`, `${e.name} ${e.vorname}`]) {
        const k = canonName(v)
        if (k.trim()) m.set(k, e)
      }
    }
    return m
  }, [employees])

  // Geräteinfos laden: pro Checkliste das Modell des NEUEN Geräts sowie Software +
  // Kommentar des ALTGERÄTS aus Endgeräte-Übersicht + Software-Inventar zusammenführen.
  // Async, damit die Übersicht nie blockiert; die Zellen zeigen bis dahin "…".
  const infoQueries = useMemo(
    () => items.map(c => ({
      key: c.id,
      newSerial: c.newDeviceSerial || '',
      oldId: c.deviceType === 'refresh' ? (c.oldDeviceId || '') : '',
    })),
    [items],
  )
  const infoSig = infoQueries.map(q => `${q.key}${q.newSerial}${q.oldId}`).join('|')
  useEffect(() => {
    if (!infoQueries.length) { setDeviceInfos(new Map()); return }
    let abbruch = false
    setInfoLoading(true)
    loadChecklistDeviceInfos(infoQueries)
      .then(m => { if (!abbruch) setDeviceInfos(m) })
      .catch(() => { if (!abbruch) setDeviceInfos(new Map()) })
      .finally(() => { if (!abbruch) setInfoLoading(false) })
    return () => { abbruch = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoSig])

  // Aufteilung nach Tab (offen / erledigt), Suche wirkt in beiden Ansichten.
  // Sortierung nach der pro Nutzer gespeicherten Zeilen-Reihenfolge (Rest: neueste zuerst).
  const tabItems = useMemo(
    () => items.filter(c => (listTab === 'done') === !!c.completed).sort(cmpByOrder(rowOrder)),
    [items, listTab, rowOrder],
  )
  const openCount = useMemo(() => items.filter(c => !c.completed).length, [items])
  const doneCount = items.length - openCount

  // Wert einer Filterspalte — statisch aus der Checkliste oder dynamisch aus den Geräteinfos.
  const colValue = useCallback((colId: string, c: Checklist): string => {
    if (colId === 'software') {
      const info = deviceInfos.get(c.id)
      const detected = c.deviceType === 'refresh' && info ? info.software : []
      const manual = (c.manualSoftware || []).filter(m => !detected.some(d => d.toLowerCase() === m.toLowerCase()))
      const all = [...detected, ...manual]
      return all.length ? all.join(', ') : '—'
    }
    if (colId === 'model') return deviceInfos.get(c.id)?.newModel || '—'
    const fc = FILTER_COLS.find(x => x.id === colId)
    return fc ? fc.val(c) : ''
  }, [deviceInfos])

  // Verfügbare Werte je Filterspalte (aus dem aktuellen Tab) — für die Filter-Dropdowns.
  const colValues = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const col of FILTERABLE_COLS) out[col.id] = [...new Set(tabItems.map(c => colValue(col.id, c)))].sort((a, b) => a.localeCompare(b, 'de'))
    return out
  }, [tabItems, colValue])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    const aktiveFilter = FILTERABLE_COLS.filter(col => colFilters[col.id])
    return tabItems.filter(c => {
      // Spaltenfilter (Excel): Zeile passt, wenn ihr Wert je aktiver Spalte in der erlaubten Menge liegt.
      for (const col of aktiveFilter) { if (!colFilters[col.id].has(colValue(col.id, c))) return false }
      if (!q) return true
      return c.name.toLowerCase().includes(q) ||
        c.corpId.toLowerCase().includes(q) ||
        c.taskNumber.toLowerCase().includes(q) ||
        c.newDeviceSerial.toLowerCase().includes(q) ||
        (c.oldDeviceId ?? '').toLowerCase().includes(q) ||
        c.technician.toLowerCase().includes(q)
    })
  }, [tabItems, search, colFilters, colValue])

  // Einen Spaltenfilter setzen (Wertmenge). Deckt sie ALLE Werte ab → Filter entfernen (kein Effekt).
  function setColFilter(colId: string, allowed: Set<string>) {
    setColFilters(prev => {
      const next = { ...prev }
      const alle = colValues[colId] || []
      if (allowed.size >= alle.length) delete next[colId]   // alle Werte erlaubt → kein Filter
      else next[colId] = allowed                            // Teilmenge (auch leer = „nichts") → aktiver Filter
      return next
    })
  }

  // Sichtbare Spalten in der (pro Nutzer) gespeicherten Reihenfolge; "uebergeben" nur im Erledigt-Tab.
  const orderedCols = colOrder.filter(id => COLS[id] && vis(id) && (id !== 'uebergeben' || listTab === 'done'))
  const isFilterable = (id: string) => FILTERABLE_COLS.some(f => f.id === id)

  // Kopf-Inhalt einer Spalte (Titel + ggf. Excel-Filter + Software-Info).
  function headerInner(id: string): ReactNode {
    const label = COLS[id].label
    return (
      <>
        {label}
        {isFilterable(id) && <ColumnFilter label={label} values={colValues[id] || []} active={colFilters[id]} onApply={s => setColFilter(id, s)} />}
        {id === 'software' && <SoftwareInfo />}
      </>
    )
  }
  const cellTitle = (id: string, c: Checklist): string | undefined => {
    if (id === 'model') return deviceInfos.get(c.id)?.newModel || undefined
    if (id === 'uebergeben') return c.completedBy ? `Bestätigt von ${c.completedBy}` : undefined
    return undefined
  }

  // Zellinhalt einer Spalte.
  function cellInner(id: string, c: Checklist, info: ChecklistDeviceInfo | undefined, emp: Employee | undefined): ReactNode {
    switch (id) {
      case 'task': return (
        <span className="inline-flex items-center gap-1.5">
          {c.taskNumber || '—'}
          {isPlaceholder(c) && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500 text-white font-semibold animate-pulse whitespace-nowrap" title="Importiert, aber noch nicht befüllt">nicht befüllt</span>
          )}
        </span>
      )
      case 'name': return (
        <span className="inline-flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1">{c.name}{c.name && <PersonInfoButton name={c.name} sam={c.corpId} />}</span>
          {c.priority && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500 text-black border border-orange-600 font-semibold inline-flex items-center gap-1">
              <Flame size={10} />Hohe Priorität
            </span>
          )}
          {emp && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-300 text-black border border-sky-400 font-medium">
              Neuer Mitarbeiter{emp.startDate ? ` · ${formatGermanDate(emp.startDate)}` : ''}
            </span>
          )}
          {!emp && (
            <>
              <ChecklistHardwarePill c={c} onPick={(key, loc) => setChecklistHardware(c, key, loc)} />
              {c.hardwareReady && (
                <button onClick={() => setPickupMail(c)} title="Abhol-Mail an den Mitarbeiter vorbereiten"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] border bg-card border-blue-500/40 text-blue-300 hover:bg-blue-500/10">
                  <Mail size={11} />Abhol-Mail
                </button>
              )}
            </>
          )}
        </span>
      )
      case 'notiz': return <NotizFeld c={c} onSave={t => saveNotiz(c, t)} />
      case 'corpId': return c.corpId || '—'
      case 'typ': return c.deviceType === 'new'
        ? <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-emerald-500 text-black border border-emerald-600">Neu</span>
        : <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-amber-400 text-black border border-amber-500">Refresh</span>
      case 'software': {
        const detected = c.deviceType === 'refresh' && info ? info.software : []
        const manual = (c.manualSoftware || []).filter(m => !detected.some(d => d.toLowerCase() === m.toLowerCase()))
        const leer = detected.length === 0 && manual.length === 0
        const laedt = c.deviceType === 'refresh' && infoLoading && !info
        return (
          <span className="inline-flex items-center flex-wrap gap-1">
            {laedt && detected.length === 0 && <span className="text-muted-foreground/50">…</span>}
            {detected.map(sw => (
              <span key={`d-${sw}`} title="Auf dem Altgerät erkannt — muss installiert werden"
                className="px-1.5 py-0.5 text-[10px] rounded-full bg-violet-400 text-black border border-violet-500">
                {/solidworks/i.test(sw) ? <SolidWorksHelp>{sw}</SolidWorksHelp> : /coscom/i.test(sw) ? <CoscomHelp>{sw}</CoscomHelp> : sw}</span>
            ))}
            {manual.map(sw => (
              <span key={`m-${sw}`} title="Manuell ergänzt"
                className="px-1.5 py-0.5 text-[10px] rounded-full bg-sky-300 text-black border border-sky-400">
                {/solidworks/i.test(sw) ? <SolidWorksHelp>{sw}</SolidWorksHelp> : /coscom/i.test(sw) ? <CoscomHelp>{sw}</CoscomHelp> : sw}</span>
            ))}
            {leer && !laedt && (
              <span className="text-muted-foreground/50"
                title={c.deviceType === 'refresh' && info && !info.inSwInventar ? 'Altgerät nicht (aktuell) im Software-Inventar' : 'Keine relevante Software erkannt'}>—</span>
            )}
            <SoftwareEditor manual={c.manualSoftware || []} detected={detected} onSave={list => saveManualSoftware(c, list)} />
          </span>
        )
      }
      case 'newSn': return (
        <span className="inline-flex items-center gap-1">
          {c.newDeviceSerial || '—'}
          {(c.newDeviceSerial || '').trim() && info?.newHostname && <DeviceInfoButton hostname={info.newHostname} serial={info.newSerial} />}
        </span>
      )
      case 'model': return infoLoading && !info
        ? <span className="text-muted-foreground/50">…</span>
        : (info?.newModel
          ? <span className="inline-flex flex-col leading-tight"><span>{info.newModel}</span><span className="text-[10px] text-muted-foreground/70">(neues Gerät)</span></span>
          : <span className="text-muted-foreground/50">—</span>)
      case 'alt': return (
        <span className="inline-flex items-center gap-1">
          {c.oldDeviceId || '—'}
          {c.deviceType === 'refresh' && (c.oldDeviceId || '').trim() && info?.oldHostname &&
            <DeviceInfoButton hostname={info.oldHostname} serial={info.oldSerial} />}
        </span>
      )
      case 'erstellt': return c.createdAt ? new Date(c.createdAt).toLocaleDateString('de-DE') : '—'
      case 'signiert': return c.signatureDataUrl
        ? <CheckCircle size={13} className="text-emerald-400 inline" />
        : <XCircle size={13} className="text-muted-foreground/40 inline" />
      case 'uebergeben': return c.completedAt ? new Date(c.completedAt).toLocaleDateString('de-DE') : '—'
      default: return null
    }
  }

  function startNew() {
    setDraft(emptyDraft(currentUserName))
    setEditingId(null)
    setCorpLookup('idle')
    lastLookupNameRef.current = ''
    setView('edit')
  }

  function startEdit(c: Checklist) {
    setDraft({
      taskNumber: c.taskNumber,
      name: c.name,
      corpId: c.corpId,
      technician: c.technician || currentUserName,
      deviceType: c.deviceType,
      newDeviceSerial: c.newDeviceSerial,
      oldDeviceId: c.oldDeviceId,
      comment: c.comment,
      priority: c.priority,
      signatureDataUrl: c.signatureDataUrl,
      signatureDate: c.signatureDate,
      createdBy: c.createdBy,
      updatedAt: c.updatedAt,
    })
    setEditingId(c.id)
    // For an existing entry assume the Corp-ID is correct — no auto-overwrite
    setCorpLookup('idle')
    lastLookupNameRef.current = c.name.trim()
    setView('edit')
  }

  function backToList() {
    setView('list')
    setEditingId(null)
  }

  // Validation: required core fields
  const validation = useMemo(() => {
    const errors: string[] = []
    if (!draft.name.trim()) errors.push('Name')
    if (!draft.taskNumber.trim()) errors.push('TASK-Nr')
    if (!draft.newDeviceSerial.trim()) errors.push('Neu-Gerät SN')
    if (draft.deviceType === 'refresh' && !(draft.oldDeviceId ?? '').trim()) errors.push('Alt-Gerät')
    return errors
  }, [draft])

  async function handleSaveDraft(thenView: View): Promise<Checklist | null> {
    if (validation.length > 0) {
      showToast({ kind: 'error', text: `Pflichtfelder fehlen: ${validation.join(', ')}` })
      return null
    }
    if (editingId) {
      const res = await updateChecklist(editingId, draft)
      if (!res.ok || !res.checklist) {
        showToast({ kind: 'error', text: res.error || 'Speichern fehlgeschlagen' })
        return null
      }
      await reload()
      showToast({ kind: 'success', text: 'Checkliste aktualisiert' })
      setView(thenView)
      return res.checklist
    } else {
      const res = await createChecklist(draft)
      if (!res.ok || !res.checklist) {
        showToast({ kind: 'error', text: res.error || 'Anlegen fehlgeschlagen' })
        return null
      }
      await reload()
      setEditingId(res.checklist.id)
      showToast({ kind: 'success', text: 'Checkliste angelegt' })
      setView(thenView)
      return res.checklist
    }
  }

  async function handleExport(c: Checklist) {
    // Persist any latest changes from the preview (signature, date) before export
    let toExport = c
    if (editingId === c.id) {
      const res = await updateChecklist(c.id, draft)
      if (res.ok && res.checklist) toExport = res.checklist
    }
    try {
      await downloadChecklistPdf(toExport)
      showToast({ kind: 'success', text: 'PDF erstellt — bitte speichern' })
    } catch (e) {
      showToast({ kind: 'error', text: `PDF-Export fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  async function handleExportFromPreview() {
    const saved = await handleSaveDraft('preview')
    if (saved) await handleExport(saved)
  }

  // Direktdruck auf dem Standarddrucker — ohne Dialog und ohne Rueckfrage
  async function handlePrint(c: Checklist) {
    // Wie beim Export: offene Aenderungen aus der Vorschau vorher speichern
    let toPrint = c
    if (editingId === c.id) {
      const res = await updateChecklist(c.id, draft)
      if (res.ok && res.checklist) toPrint = res.checklist
    }
    setPrintingId(c.id)
    try {
      const r = await printChecklist(toPrint)
      if (r.success) showToast({ kind: 'success', text: 'Checkliste wird gedruckt' })
      else showToast({ kind: 'error', text: `Drucken fehlgeschlagen: ${r.error || 'unbekannt'}` })
    } finally {
      setPrintingId(null)
    }
  }

  // Geraeteuebergabe bestaetigt -> Checkliste wandert in "Alle erledigten Checklisten"
  async function confirmComplete() {
    if (!pendingComplete) return
    const c = pendingComplete
    setPendingComplete(null)
    const res = await updateChecklist(c.id, {
      completed: true,
      completedAt: new Date().toISOString(),
      completedBy: currentUserName,
    })
    if (res.ok) {
      showToast({ kind: 'success', text: `Checkliste für "${c.name}" als erledigt verschoben` })
      // OT-Geräte-Inventar aktuell halten: wird ein verortetes Gerät getauscht,
      // wandert der Marker (Position + Arbeitsplatz) auf das neue Gerät.
      let refreshMarkerGesetzt = false
      if (c.deviceType === 'refresh' && (c.oldDeviceId || '').trim() && (c.newDeviceSerial || '').trim()) {
        try {
          const moved = await moveDeviceOnAllMaps(c.oldDeviceId!, c.newDeviceSerial)
          for (const m of moved) {
            const t = m.entries.map(e => `${e.alt} → ${e.neu}`).join(', ')
            showToast({ kind: 'success', text: `${m.label} aktualisiert: ${t}` })
          }
          refreshMarkerGesetzt = moved.length > 0
        } catch { /* best effort – Checkliste bleibt erledigt */ }
      }
      await reload()
      void runServiceNowHandover(c)   // Hintergrund: Task schließen + Checkliste anhängen + Primary-User-Incident
      // Neugerät → zum Einzeichnen auffordern (überspringbar). Auch bei Refresh, wenn das
      // Altgerät auf KEINER Karte verortet war (sonst wurde der Marker bereits umgeschrieben).
      if ((c.newDeviceSerial || '').trim() && (c.deviceType === 'new' || (c.deviceType === 'refresh' && !refreshMarkerGesetzt))) setPlaceOnMap(c)
    } else {
      showToast({ kind: 'error', text: res.error || 'Speichern fehlgeschlagen.' })
    }
  }

  // ServiceNow-Automatik im Hintergrund (blockiert die Oberfläche nicht; Ergebnis als Toast).
  async function runServiceNowHandover(c: Checklist) {
    try {
      const r = await runHandoverAutomation(c, currentUserName)
      if (r.skipped) {
        if (r.reason !== 'Automatik deaktiviert') showToast({ kind: 'error', text: `ServiceNow-Automatik übersprungen: ${r.reason} — Task/Incident nicht automatisch erledigt.` })
        return
      }
      const s = handoverSummary(r)
      showToast({ kind: s.allOk ? 'success' : 'error', text: s.text })
    } catch (e) {
      showToast({ kind: 'error', text: 'ServiceNow-Automatik fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)) })
    }
  }

  // Versehentlich abgeschlossen? Zurueck in die offene Uebersicht holen.
  async function reopenChecklist(c: Checklist) {
    const res = await updateChecklist(c.id, { completed: false, completedAt: undefined, completedBy: undefined })
    if (res.ok) {
      showToast({ kind: 'success', text: `Checkliste für "${c.name}" wieder geöffnet` })
      await reload()
    } else {
      showToast({ kind: 'error', text: res.error || 'Speichern fehlgeschlagen.' })
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const { id, name } = pendingDelete
    setPendingDelete(null)
    const res = await deleteChecklist(id)
    if (!res.ok) {
      showToast({ kind: 'error', text: res.error || 'Löschen fehlgeschlagen' })
      return
    }
    await reload()
    showToast({ kind: 'success', text: `Checkliste "${name}" gelöscht` })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <ClipboardList size={22} className="text-blue-400" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-foreground">Checklisten</h2>
          <p className="text-xs text-muted-foreground">
            Geräteübergabe-Dokumente erstellen, unterschreiben und als PDF exportieren.
          </p>
        </div>
        {view === 'list' ? (
          <>
            <button onClick={startNew}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-emerald-500/40 bg-emerald-500 text-black hover:bg-emerald-500/20">
              <Plus size={12} />Neue Checkliste
            </button>
            <button onClick={handleImportClick} disabled={importBusy}
              title="Excel importieren: für jede TASK-Nummer, die es noch nicht gibt, wird ein leerer Eintrag angelegt. Bestehende bleiben unberührt."
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 disabled:opacity-50">
              {importBusy ? <Loader size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}Importieren
            </button>
          </>
        ) : (
          <button onClick={backToList}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
            <ArrowLeft size={12} />Zur Liste
          </button>
        )}
        {view === 'list' && (
          <button onClick={reload} disabled={loading}
            className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground" title="Aktualisieren">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* LIST VIEW */}
      {view === 'list' && (
        <>
          <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3">
            {/* Tabs: offene vs. erledigte Checklisten */}
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              <button onClick={() => setListTab('open')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${listTab === 'open' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground'}`}>
                Offen ({openCount})
              </button>
              <button onClick={() => setListTab('done')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${listTab === 'done' ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground'}`}>
                <PackageCheck size={12} />Erledigt ({doneCount})
              </button>
            </div>
            <div className="relative flex-1 max-w-xs">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Name, TASK, SN, Hostname…"
                className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            </div>
            <span className="text-xs text-muted-foreground">{filteredItems.length} von {tabItems.length}</span>
            {Object.keys(colFilters).length > 0 && (
              <button type="button" onClick={() => setColFilters({})}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary">
                <Filter size={12} />Filter zurücksetzen
              </button>
            )}
            <span className="ml-auto inline-flex items-center gap-2">
              <span className="hidden lg:inline text-[10px] text-muted-foreground" title="Spalten- und Zeilenüberschriften gedrückt halten und ziehen">
                <Move size={11} className="inline mr-0.5" />Spalten &amp; Zeilen per Gedrückthalten verschiebbar
              </span>
              <SpaltenAuswahl hidden={hiddenCols} onToggle={toggleCol}
                onReset={() => { setHiddenCols(new Set()); try { localStorage.removeItem(hideKey) } catch { /* egal */ } }}
                onResetOrder={resetAnordnung} />
            </span>
          </div>

          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground text-sm">
              <Loader size={14} className="animate-spin" />Lade Checklisten…
            </div>
          ) : tabItems.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-center px-6">
              <div>
                {listTab === 'open' ? (
                  <>
                    <ClipboardList size={36} className="text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-foreground">Keine offenen Checklisten</p>
                    <p className="text-xs text-muted-foreground mt-1">Klick "Neue Checkliste" oben rechts um eine anzulegen.</p>
                  </>
                ) : (
                  <>
                    <PackageCheck size={36} className="text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-foreground">Noch keine erledigten Checklisten</p>
                    <p className="text-xs text-muted-foreground mt-1">Bestätige in der offenen Übersicht die Geräteübergabe — die Checkliste wandert dann hierher.</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background border-b border-border z-10">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground align-middle">
                    {orderedCols.map(id => (
                      <th key={id} data-colid={id}
                        onPointerDown={e => dragStart(e, 'col', id)}
                        style={dropStyle('col', id)}
                        title="Spalte verschieben: gedrückt halten und ziehen"
                        className={`px-3 py-2 whitespace-nowrap align-middle select-none ${COLS[id].th} ${isDragging('col', id) ? 'opacity-40' : ''}`}>
                        {headerInner(id)}
                      </th>
                    ))}
                    <th data-colid="aktion" className="px-3 py-2 w-48 text-right whitespace-nowrap align-middle">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(c => {
                    const emp = empByName.get(canonName(c.name))
                    const info = deviceInfos.get(c.id)
                    return (
                    <tr key={c.id} data-rowid={c.id}
                      onPointerDown={e => dragStart(e, 'row', c.id)}
                      style={dropStyle('row', c.id)}
                      className={`border-b border-border/40 hover:bg-accent/10 ${isPlaceholder(c) ? 'bg-red-500/10' : c.priority ? 'bg-orange-500/5' : ''} ${isDragging('row', c.id) ? 'opacity-40' : ''} ${dropInfo?.type === 'row' && dropInfo.id === c.id ? 'bg-blue-500/10' : ''}`}>
                      {orderedCols.map(id => (
                        <td key={id} data-colid={id} title={cellTitle(id, c)}
                          className={`px-3 py-2 ${COLS[id].td} ${id === 'task' && isPlaceholder(c) ? 'border-l-4 border-l-red-500' : id === 'task' && c.priority ? 'border-l-4 border-l-orange-500' : ''}`}>
                          {cellInner(id, c, info, emp)}
                        </td>
                      ))}
                      <td data-colid="aktion" className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => { setEditingId(c.id); startEdit(c); setView('preview') }}
                            title="Vorschau"
                            className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
                            <Eye size={12} />
                          </button>
                          {listTab === 'open' && (
                            <button onClick={() => startEdit(c)} title="Bearbeiten"
                              className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
                              <Edit3 size={12} />
                            </button>
                          )}
                          <button onClick={() => handleExport(c)} title="Als PDF exportieren"
                            className="p-1.5 rounded border border-blue-500/40 text-blue-300 hover:bg-blue-500/10">
                            <Download size={12} />
                          </button>
                          <button onClick={() => handlePrint(c)} disabled={printingId !== null}
                            title="Drucken (direkt auf dem Standarddrucker)"
                            className="p-1.5 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40">
                            {printingId === c.id ? <Loader size={12} className="animate-spin" /> : <Printer size={12} />}
                          </button>
                          {listTab === 'open' ? (
                            <button onClick={() => setPendingComplete(c)}
                              title="Gerät übergeben — Checkliste als erledigt verschieben"
                              className="p-1.5 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10">
                              <PackageCheck size={12} />
                            </button>
                          ) : (
                            <button onClick={() => reopenChecklist(c)}
                              title="Zurück zu den offenen Checklisten"
                              className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
                              <RotateCcw size={12} />
                            </button>
                          )}
                          <button onClick={() => setPendingDelete(c)} title="Löschen"
                            className="p-1.5 rounded border border-red-500/40 text-red-300 hover:bg-red-500/10">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* EDIT VIEW */}
      {view === 'edit' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2 flex-1">
                <FileText size={15} className="text-blue-400" />
                {editingId ? 'Checkliste bearbeiten' : 'Neue Checkliste anlegen'}
              </h3>
              <button type="button" onClick={() => setDraft(d => ({ ...d, priority: !d.priority }))}
                title="Als hohe Priorität markieren – orange in der Übersicht"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold border transition-colors ${
                  draft.priority
                    ? 'bg-orange-500 text-black border-orange-600 hover:bg-orange-500/90'
                    : 'border-orange-500/40 text-orange-300 hover:bg-orange-500/10'
                }`}>
                <Flame size={13} />Hohe Priorität{draft.priority ? ' ✓' : ''}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="TASK-Nummer *">
                <input value={draft.taskNumber} onChange={e => setDraft(d => ({ ...d, taskNumber: e.target.value }))}
                  placeholder="z.B. TASK1087336"
                  className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary font-mono" />
              </Field>
              <Field label="Name (Empfänger) *">
                <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="Vorname Nachname"
                  className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              </Field>
              <Field label="Corp-ID (automatisch aus AD)">
                <div className="flex gap-1">
                  <div className="relative flex-1">
                    <input value={draft.corpId}
                      onChange={e => setDraft(d => ({ ...d, corpId: e.target.value }))}
                      placeholder="wird ermittelt…"
                      className="w-full pr-7 px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary font-mono"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2">
                      {corpLookup === 'loading' && <Loader size={12} className="animate-spin text-blue-400" />}
                      {corpLookup === 'found' && <CheckCircle size={12} className="text-emerald-400" />}
                      {corpLookup === 'notFound' && <XCircle size={12} className="text-amber-400" />}
                      {corpLookup === 'error' && <AlertTriangle size={12} className="text-red-400" />}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => lookupCorpId(draft.name, { overwrite: true })}
                    disabled={!draft.name.trim() || corpLookup === 'loading'}
                    title="Aus AD neu auslesen (überschreibt manuell eingetragene Corp-ID)"
                    className="px-2 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={12} className={corpLookup === 'loading' ? 'animate-spin' : ''} />
                  </button>
                </div>
                {corpLookup === 'notFound' && (
                  <p className="text-[10px] text-amber-400 mt-0.5">
                    Kein eindeutiger AD-Treffer für "{draft.name}" — Corp-ID bitte manuell eintragen.
                  </p>
                )}
                {corpLookup === 'error' && (
                  <p className="text-[10px] text-red-400 mt-0.5">AD-Abfrage fehlgeschlagen — bitte manuell eintragen.</p>
                )}
              </Field>
              <Field label="Techniker">
                <input value={draft.technician} onChange={e => setDraft(d => ({ ...d, technician: e.target.value }))}
                  placeholder="z.B. dein Name"
                  className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              </Field>
            </div>

            <Field label="Geräte-Typ *">
              <div className="flex gap-2">
                {(['new', 'refresh'] as DeviceType[]).map(t => (
                  <button key={t} type="button"
                    onClick={() => setDraft(d => ({ ...d, deviceType: t }))}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      draft.deviceType === t
                        ? (t === 'new' ? 'border-emerald-500/40 bg-emerald-500 text-black' : 'border-amber-500/40 bg-amber-500/10 text-amber-300')
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}>
                    {t === 'new' ? 'Neu-Gerät' : 'Refresh (Tausch alle 4 Jahre)'}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Neu-Gerät (Seriennummer) *">
                <input value={draft.newDeviceSerial} onChange={e => setDraft(d => ({ ...d, newDeviceSerial: e.target.value }))}
                  placeholder="z.B. 5CG54551F8"
                  className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary font-mono" />
              </Field>
              {draft.deviceType === 'refresh' && (
                <Field label="Alt-Gerät (Seriennummer oder Hostname) *">
                  <input value={draft.oldDeviceId ?? ''} onChange={e => setDraft(d => ({ ...d, oldDeviceId: e.target.value }))}
                    placeholder="z.B. DEHAM12345 oder SN"
                    className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary font-mono" />
                </Field>
              )}
            </div>

            <Field label="Bemerkung (optional)">
              <textarea value={draft.comment ?? ''} onChange={e => setDraft(d => ({ ...d, comment: e.target.value }))}
                rows={3} placeholder="Notizen, Zubehör, Besonderheiten…"
                className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary resize-y" />
            </Field>

            <div className="flex items-center gap-2 pt-2 border-t border-border">
              {validation.length > 0 && (
                <span className="text-[11px] text-amber-300 inline-flex items-center gap-1">
                  <AlertTriangle size={11} />Fehlt noch: {validation.join(', ')}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => handleSaveDraft('list')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
                  <Save size={12} />Speichern
                </button>
                <button onClick={() => handleSaveDraft('preview')}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-blue-600 hover:bg-blue-500 text-white">
                  <Eye size={12} />Vorschau + Unterschreiben
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW VIEW */}
      {view === 'preview' && (
        <div className="flex-1 overflow-y-auto p-6 bg-muted/10">
          <div className="max-w-3xl mx-auto bg-white text-black rounded-lg shadow-xl px-10 pt-6 pb-10 relative">
            {/* SKF Marine logo (canvas-rendered, matches PDF exactly) */}
            <SkfLogo />

            <h2 className="text-2xl font-bold mb-4">Geräteübergabe-Dokument</h2>

            <div className="space-y-1.5 text-sm">
              <p><strong>Auftragsnummer:</strong> {draft.taskNumber || '—'}</p>
              <p><strong>Typ:</strong> {draft.deviceType === 'new' ? 'Neu-Gerät' : 'Refresh (Geräte-Tausch)'}</p>
              <p><strong>Name:</strong> {draft.name || '—'}</p>
              <p><strong>Corp-ID:</strong> {draft.corpId || '—'}</p>
              <p><strong>Techniker:</strong> {draft.technician || '—'}</p>
            </div>

            <div className="mt-5 space-y-2 text-sm">
              {draft.deviceType === 'refresh' && (
                <p>
                  <strong>Hardware alt:</strong> {draft.oldDeviceId || '—'}
                  <span className="italic text-slate-500 text-xs ml-2">(Seriennummer oder Hostname)</span>
                </p>
              )}
              <p>
                <strong>Hardware neu:</strong> {draft.newDeviceSerial || '—'}
                <span className="italic text-slate-500 text-xs ml-2">(Seriennummer)</span>
              </p>
            </div>

            <div className="mt-5">
              <p className="italic text-sm">Kommentare:</p>
              <p className="text-sm whitespace-pre-wrap min-h-[40px]">{draft.comment || ''}</p>
            </div>

            <hr className="my-6 border-slate-400" />

            <p className="text-xs leading-relaxed">
              Mit meiner Unterschrift bestätige ich, das oben aufgeführte Gerät nebst Zubehör in einwandfreiem Zustand erhalten zu haben.
              Ich bin ab diesem Zeitpunkt für den sachgemäßen Umgang, die Sicherheit und den <strong>Verbleib</strong> des Rechners sowie aller Unternehmensdaten darauf verantwortlich.
            </p>

            <div className="mt-8 flex items-end gap-8 flex-wrap">
              <div>
                <p className="text-sm font-semibold mb-1">Datum</p>
                <p className="text-sm font-mono border-b border-slate-800 pb-1 min-w-[140px]">
                  {draft.signatureDate
                    ? new Date(draft.signatureDate).toLocaleDateString('de-DE')
                    : <span className="text-slate-400 italic">noch nicht unterschrieben</span>}
                </p>
              </div>
              <div className="flex-1 min-w-[280px]">
                <p className="text-sm font-semibold mb-1">Unterschrift</p>
                {/*
                  `key` here forces a remount when switching between checklists
                  (different editingId) so the correct stored signature loads.
                  Within ONE editing session the SignaturePad keeps its canvas
                  intact across re-renders → user can lift the mouse and keep
                  drawing without losing previous strokes.
                */}
                <SignaturePad
                  key={editingId ?? 'new'}
                  initialValue={draft.signatureDataUrl}
                  onChange={(dataUrl) => {
                    setDraft(d => ({
                      ...d,
                      signatureDataUrl: dataUrl ?? undefined,
                      signatureDate: dataUrl ? new Date().toISOString() : (d.signatureDate),
                    }))
                  }}
                />
              </div>
            </div>
          </div>

          {/* Preview action bar */}
          <div className="max-w-3xl mx-auto flex items-center justify-end gap-2 mt-4">
            <button onClick={() => setView('edit')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
              <Edit3 size={12} />Felder bearbeiten
            </button>
            <button onClick={() => handleSaveDraft('preview')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
              <Save size={12} />Speichern
            </button>
            <button onClick={handleExportFromPreview}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-blue-600 hover:bg-blue-500 text-white">
              <Download size={12} />Als PDF exportieren
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm">
          <div className={`flex items-start gap-2 px-4 py-3 rounded-lg shadow-2xl border ${
            toast.kind === 'success'
              ? 'bg-green-500 border-green-600 text-black'
              : 'bg-red-500/15 border-red-500/40 text-red-200'
          }`}>
            {toast.kind === 'success' ? <CheckCircle size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
            <p className="text-sm">{toast.text}</p>
          </div>
        </div>
      )}

      {/* Geraeteuebergabe bestaetigen */}
      {pendingComplete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setPendingComplete(null)}>
          <div className="bg-card border border-amber-500/40 rounded-xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <PackageCheck size={16} className="text-amber-400" />
              <h3 className="text-base font-semibold text-foreground">Geräteübergabe bestätigen</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Im Kontext <strong className="text-foreground">{pendingComplete.taskNumber || '—'}</strong>:
              wurde das Gerät an <strong className="text-foreground">{pendingComplete.name || '—'}</strong> übergeben
              und ist die Checkliste unterschrieben?
            </p>
            {!pendingComplete.signatureDataUrl && (
              <p className="flex items-center gap-1.5 text-xs text-amber-300 mb-2">
                <AlertTriangle size={12} className="shrink-0" />
                Hinweis: Diese Checkliste hat noch keine digitale Unterschrift.
              </p>
            )}
            <p className="text-xs text-muted-foreground mb-4">
              Nach der Bestätigung wird die Checkliste in die Übersicht „Erledigt" verschoben.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingComplete(null)}
                className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-accent/30">
                Abbrechen
              </button>
              <button onClick={confirmComplete}
                className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
                Ja, Gerät wurde übergeben
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Neu-Gerät: Standort auf einer Karte einzeichnen? */}
      {placeOnMap && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setPlaceOnMap(null)}>
          <div className="bg-card border border-primary/30 rounded-xl p-5 max-w-md w-full space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-primary" />
              <h3 className="text-base font-semibold text-foreground">Standort einzeichnen?</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Neues Gerät <span className="font-mono text-foreground">DE{(placeOnMap.newDeviceSerial || '').trim().toUpperCase()}</span> für <strong className="text-foreground">{placeOnMap.name || '—'}</strong> auf einer Karte verorten? Du landest dann im Platzieren-Modus — einfach die Position anklicken.
            </p>
            <div className="grid grid-cols-1 gap-2">
              {DEVICE_MAPS.map(m => (
                <button key={m.id} onClick={() => {
                  const host = 'DE' + (placeOnMap.newDeviceSerial || '').trim().toUpperCase().replace(/\s+/g, '')
                  useMapIntentStore.getState().setIntent({ screen: m.id, hostname: host, mode: 'place' })
                  setScreen(m.id); setPlaceOnMap(null)
                }}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-border hover:border-primary/40 hover:bg-accent/20 text-foreground text-left">
                  <MapPin size={14} className="text-primary shrink-0" />{m.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setPlaceOnMap(null)}
                className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-accent/30">
                Später / kein Kartenstandort
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setPendingDelete(null)}>
          <div className="bg-card border border-red-500/40 rounded-xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Trash2 size={16} className="text-red-400" />
              <h3 className="text-base font-semibold text-foreground">Checkliste löschen?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Checkliste <strong className="text-foreground">{pendingDelete.taskNumber || '—'}</strong> für <strong className="text-foreground">{pendingDelete.name}</strong> wirklich löschen?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingDelete(null)}
                className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-accent/30">
                Abbrechen
              </button>
              <button onClick={confirmDelete}
                className="px-3 py-1.5 text-sm rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold">
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {pickupMail && <PickupMailDialog checklist={pickupMail} bearbeiter={currentUserName} onClose={() => setPickupMail(null)} />}
      {pendingExcel && (
        <TaskColumnDialog columns={pendingExcel.columns} rows={pendingExcel.rows}
          onConfirm={onTaskColConfirm} onCancel={() => setPendingExcel(null)} />
      )}
      {importResult && <ChecklistImportResultModal result={importResult} onClose={() => setImportResult(null)} />}
    </div>
  )
}

// ── Excel-artiger Spaltenfilter (Wertauswahl per Häkchen, mit Suche) ──────────
function ColumnFilter({ label, values, active, onApply }: {
  label: string; values: string[]; active?: Set<string>; onApply: (allowed: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const [suche, setSuche] = useState('')
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const isActive = !!active
  const allowed = active ?? new Set(values)   // Default: alle erlaubt
  const shown = values.filter(v => v.toLowerCase().includes(suche.trim().toLowerCase()))
  const toggle = (v: string) => { const n = new Set(allowed); n.has(v) ? n.delete(v) : n.add(v); onApply(n) }
  const oeffnen = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ left: Math.min(r.left, window.innerWidth - 236), top: r.bottom + 4 })
    setOpen(true)
  }
  const schliessen = () => { setOpen(false); setSuche('') }
  return (
    <span className="inline-block align-middle ml-1">
      <button ref={btnRef} type="button" onClick={e => { e.stopPropagation(); open ? schliessen() : oeffnen() }} title={`Filtern: ${label}`}
        className={`p-0.5 rounded ${isActive ? 'text-primary bg-primary/15' : 'text-muted-foreground/50 hover:text-foreground'}`}>
        <Filter size={11} />
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={schliessen} />
          <div style={{ position: 'fixed', left: pos.left, top: pos.top }}
            className="z-[61] w-56 bg-card border border-border rounded-md shadow-xl p-2 space-y-1.5 normal-case tracking-normal font-normal text-foreground" onClick={e => e.stopPropagation()}>
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input autoFocus value={suche} onChange={e => setSuche(e.target.value)} placeholder="Suchen"
                className="w-full pl-6 pr-2 py-1 text-[11px] rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <button onClick={() => onApply(new Set(values))} className="px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground">Alle</button>
              <button onClick={() => onApply(new Set())} className="px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground">Keine</button>
              <span className="ml-auto text-muted-foreground">{allowed.size}/{values.length}</span>
            </div>
            <div className="max-h-52 overflow-y-auto space-y-0.5">
              {shown.length === 0 && <div className="text-[11px] text-muted-foreground px-1 py-2">Keine Werte.</div>}
              {shown.map(v => (
                <label key={v} className="flex items-center gap-2 px-1 py-0.5 text-[11px] hover:bg-muted/20 rounded cursor-pointer">
                  <input type="checkbox" checked={allowed.has(v)} onChange={() => toggle(v)} className="accent-primary shrink-0" />
                  <span className="truncate">{v}</span>
                </label>
              ))}
            </div>
          </div>
        </>, document.body)}
    </span>
  )
}

// ── Info-"i" hinter der Software-Überschrift: erklärt, wie die Software-Spalte zu lesen ist ──
function SoftwareInfo() {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const oeffnen = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ left: Math.min(r.left, window.innerWidth - 336), top: r.bottom + 4 })
    setOpen(true)
  }
  return (
    <span className="inline-block align-middle ml-0.5">
      <button ref={btnRef} type="button" onClick={e => { e.stopPropagation(); open ? setOpen(false) : oeffnen() }}
        title="Hinweise zur Software-Spalte" className="p-0.5 rounded text-sky-400/70 hover:text-sky-300">
        <Info size={11} />
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', left: pos.left, top: pos.top }}
            className="z-[61] w-80 max-w-[92vw] bg-card border border-border rounded-md shadow-xl p-3 normal-case tracking-normal font-normal text-foreground" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              <Info size={11} />Hinweise zur Software-Spalte
            </div>
            <div className="text-xs space-y-2 leading-relaxed">
              <p>Diese Spalte zeigt relevante Programme (SolidWorks, COSCOM, MATLAB, EPLAN, MATRIX, FSPP, CorelDRAW), die auf dem <strong>Altgerät</strong> erkannt wurden.</p>
              <p><span className="px-1 rounded bg-violet-400 text-black text-[10px]">Violett</span> = automatisch erkannt, <span className="px-1 rounded bg-sky-300 text-black text-[10px]">blau</span> = manuell ergänzt (über das <strong>+</strong>).</p>
              <p><strong>Wird hier eine Software angezeigt</strong>, wurde sie auf dem alten Rechner gefunden — dann muss sie auf dem neuen Gerät <strong>zwingend (100 %)</strong> ebenfalls installiert werden.</p>
              <p><strong>Steht hier nichts</strong>, ist das <em>keine</em> Garantie, dass keine dieser Programme benötigt wird. Als Faustregel gilt:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Mini-/Desktop-PCs: COSCOM ist eher selten nötig.</li>
                <li>Tower &amp; ZBooks: SolidWorks wird fast immer benötigt.</li>
              </ul>
              <p className="text-muted-foreground">Im Zweifel bitte mit dem Mitarbeiter bzw. der Abteilung abklären.</p>
            </div>
          </div>
        </>, document.body)}
    </span>
  )
}

// ── Software manuell ergänzen: "+"-Button in der Software-Zelle ──
// Bekannte Programme per Häkchen auswählbar + Freitext. Die Auswahl wird auf der
// Checkliste gespeichert und zusätzlich zur Auto-Erkennung als Schild angezeigt.
function SoftwareEditor({ manual, detected, onSave }: {
  manual: string[]; detected: string[]; onSave: (list: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [text, setText] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)
  const has = (s: string) => manual.some(m => m.toLowerCase() === s.toLowerCase())
  const toggleKnown = (s: string) => onSave(has(s) ? manual.filter(m => m.toLowerCase() !== s.toLowerCase()) : [...manual, s])
  const addFree = () => { const t = text.trim(); if (t && !has(t)) onSave([...manual, t]); setText('') }
  const remove = (s: string) => onSave(manual.filter(m => m !== s))
  const oeffnen = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ left: Math.min(r.left, window.innerWidth - 256), top: r.bottom + 4 })
    setOpen(true)
  }
  return (
    <span className="inline-block align-middle">
      <button ref={btnRef} type="button" onClick={e => { e.stopPropagation(); open ? setOpen(false) : oeffnen() }}
        title="Software ergänzen" className="p-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent/40">
        <Plus size={12} />
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', left: pos.left, top: pos.top }}
            className="z-[61] w-60 bg-card border border-border rounded-md shadow-xl p-2 space-y-2 normal-case tracking-normal font-normal text-foreground" onClick={e => e.stopPropagation()}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Software ergänzen</div>
            {detected.length > 0 && (
              <div className="text-[10px] text-muted-foreground">Automatisch erkannt: {detected.join(', ')}</div>
            )}
            <div className="space-y-0.5 max-h-40 overflow-y-auto">
              {BEKANNTE_SOFTWARE.map(sw => {
                const auto = detected.some(d => d.toLowerCase() === sw.toLowerCase())
                return (
                  <label key={sw} className={`flex items-center gap-2 px-1 py-0.5 text-[11px] rounded ${auto ? 'opacity-50' : 'hover:bg-muted/20 cursor-pointer'}`}>
                    <input type="checkbox" disabled={auto} checked={auto || has(sw)} onChange={() => toggleKnown(sw)} className="accent-primary shrink-0" />
                    <span className="truncate">{sw}{auto ? ' (erkannt)' : ''}</span>
                  </label>
                )
              })}
            </div>
            <div className="flex items-center gap-1">
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addFree() }}
                placeholder="Andere Software…"
                className="flex-1 min-w-0 px-2 py-1 text-[11px] rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              <button onClick={addFree} className="px-2 py-1 rounded border border-border text-[11px] text-muted-foreground hover:text-foreground shrink-0">Add</button>
            </div>
            {manual.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1 border-t border-border">
                {manual.map(sw => (
                  <span key={sw} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full bg-sky-300 text-black border border-sky-400">
                    {sw}
                    <button onClick={() => remove(sw)} title="Entfernen" className="hover:text-red-700"><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </>, document.body)}
    </span>
  )
}

// ── Spalten-Auswahl: jeder Nutzer kann Spalten für SICH lokal aus-/einblenden ──
// (Die Auswahl wird nur im localStorage des Nutzers gespeichert, nicht geteilt.)
function SpaltenAuswahl({ hidden, onToggle, onReset, onResetOrder }: {
  hidden: Set<string>; onToggle: (id: string) => void; onReset: () => void; onResetOrder: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const oeffnen = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ left: Math.min(r.left, window.innerWidth - 236), top: r.bottom + 4 })
    setOpen(true)
  }
  const anzahlAus = hidden.size
  return (
    <span className="inline-block align-middle">
      <button ref={btnRef} type="button" onClick={e => { e.stopPropagation(); open ? setOpen(false) : oeffnen() }}
        title="Spalten ein-/ausblenden (nur für dich)"
        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border ${anzahlAus > 0 ? 'border-primary/50 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-primary'}`}>
        <Columns3 size={13} />Spalten{anzahlAus > 0 ? ` (${anzahlAus} aus)` : ''}
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', left: pos.left, top: pos.top }}
            className="z-[61] w-56 bg-card border border-border rounded-md shadow-xl p-2 space-y-1 normal-case tracking-normal font-normal text-foreground" onClick={e => e.stopPropagation()}>
            <div className="text-[10px] text-muted-foreground px-1 pb-1">Nur für dich sichtbar/ausgeblendet</div>
            <div className="max-h-72 overflow-y-auto space-y-0.5">
              {HIDEABLE_COLS.map(col => (
                <label key={col.id} className="flex items-center gap-2 px-1 py-0.5 text-[11px] hover:bg-muted/20 rounded cursor-pointer">
                  <input type="checkbox" checked={!hidden.has(col.id)} onChange={() => onToggle(col.id)} className="accent-primary shrink-0" />
                  <span className="truncate">{col.label}</span>
                </label>
              ))}
            </div>
            {anzahlAus > 0 && (
              <button onClick={onReset} className="w-full mt-1 px-1.5 py-1 rounded border border-border text-[11px] text-muted-foreground hover:text-foreground">
                Alle Spalten anzeigen
              </button>
            )}
            <button onClick={onResetOrder} className="w-full mt-1 px-1.5 py-1 rounded border border-border text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1">
              <RotateCcw size={11} />Anordnung zurücksetzen
            </button>
            <div className="text-[10px] text-muted-foreground/70 px-1 pt-1 leading-snug">
              Spalten- und Zeilenreihenfolge per Gedrückthalten &amp; Ziehen anpassbar — nur für dich, bleibt auch nach Updates erhalten.
            </div>
          </div>
        </>, document.body)}
    </span>
  )
}

// ── Notizfeld je Eintrag (aus der Übersicht bearbeitbar, optional vergrößert) ──
// Kompakt = einzeilige Eingabe; per Button auf ein mehrzeiliges Textfeld umschaltbar.
// Gespeichert wird beim Verlassen des Feldes (onBlur) bzw. Enter im Kompaktmodus.
function NotizFeld({ c, onSave }: { c: Checklist; onSave: (text: string) => void }) {
  const [val, setVal] = useState(c.notiz || '')
  const [expanded, setExpanded] = useState(false)
  // Wenn sich der Eintrag von außen ändert (Neuladen), Feld nachziehen.
  useEffect(() => { setVal(c.notiz || '') }, [c.id, c.notiz])
  const commit = () => { const t = val.trim(); if (t !== (c.notiz || '')) onSave(t) }
  return (
    <div className="flex items-start gap-1">
      {expanded ? (
        <textarea value={val} onChange={e => setVal(e.target.value)} onBlur={commit} rows={4} autoFocus
          placeholder="Notiz …"
          className="w-full min-w-[180px] px-2 py-1 text-[11px] rounded border border-border bg-background text-foreground resize-y focus:outline-none focus:border-primary" />
      ) : (
        <input value={val} onChange={e => setVal(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          placeholder="Notiz …" title={val || 'Notiz hinzufügen'}
          className="w-full min-w-[100px] px-2 py-1 text-[11px] rounded border border-border bg-background text-foreground truncate focus:outline-none focus:border-primary" />
      )}
      <button type="button" onClick={() => setExpanded(x => !x)} title={expanded ? 'Notiz verkleinern' : 'Notiz vergrößern'}
        className="shrink-0 p-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
        {expanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
      </button>
    </div>
  )
}

// ── "Hardware fertig"-Dropdown für Bestandsmitarbeiter (Gerät + Abhol-Ort) ─────
function ChecklistHardwarePill({ c, onPick }: { c: Checklist; onPick: (key: HardwareType | null, location?: string) => void }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<HardwareType | null>(null)
  const [loc, setLoc] = useState('')
  const ready = c.hardwareReady === true
  const inprogress = c.hardwareType === 'inprogress'
  const label = ready ? hardwareLabel(c.hardwareType || '') : inprogress ? 'In Bearbeitung' : 'Hardware fertig'
  const btnCls = ready ? 'bg-green-500/90 border-green-600 text-black'
    : inprogress ? 'bg-orange-500/90 border-orange-600 text-black'
      : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
  const boxCls = ready ? 'bg-green-500 border-green-500' : inprogress ? 'bg-orange-500 border-orange-500' : 'border-muted-foreground'
  function closeAll() { setOpen(false); setPending(null) }
  function pick(key: HardwareType) {
    if (key === 'none') { onPick('none'); closeAll(); return }
    setLoc(c.hardwareLocation || ''); setPending(key)
  }
  function confirmPending() { if (!pending || !loc.trim()) return; onPick(pending, loc.trim()); closeAll() }
  return (
    <span className="relative inline-block">
      <button onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] border transition-colors ${btnCls}`}>
        <span className={`w-3 h-3 rounded-sm border flex items-center justify-center ${boxCls}`}>{ready && <Check size={9} className="text-white" />}</span>
        {label}
        {(ready || inprogress) && c.hardwareLocation ? <span className="font-normal">· {c.hardwareLocation}</span> : null}
        {(ready || inprogress) && c.hardwareBy ? <span className="opacity-70 text-[9px]">({c.hardwareBy})</span> : null}
        <ChevronDown size={10} className="opacity-70" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={closeAll} />
          <div className="absolute z-20 mt-1 left-0 min-w-[210px] rounded-md border border-border bg-card shadow-xl py-1 text-left">
            {!pending ? (
              <>
                {HARDWARE_OPTIONS.filter(o => o.key !== 'inprogress').map(o => (
                  <button key={o.key} onClick={() => pick(o.key)}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-foreground hover:bg-accent flex items-center gap-2">
                    <span className="w-3 flex justify-center shrink-0">{ready && c.hardwareType === o.key && <Check size={11} className="text-green-400" />}</span>{o.label}
                  </button>
                ))}
                <div className="my-1 border-t border-border" />
                <button onClick={() => pick('inprogress')}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-orange-300 hover:bg-orange-500/10 flex items-center gap-2">
                  <span className="w-3 flex justify-center shrink-0">{inprogress && <Check size={11} className="text-orange-400" />}</span>In Bearbeitung…
                </button>
                {(ready || inprogress) && (
                  <>
                    <div className="my-1 border-t border-border" />
                    <button onClick={() => { onPick(null); closeAll() }}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-red-300 hover:bg-red-500/10 flex items-center gap-2"><span className="w-3 shrink-0" />Zurücksetzen</button>
                  </>
                )}
              </>
            ) : (
              <div className="px-3 py-2 space-y-1.5">
                <p className="text-[10px] text-muted-foreground">{pending === 'inprogress' ? 'In Bearbeitung – Ort/Raum:' : `${hardwareLabel(pending)} – Abhol-Ort/Raum:`}</p>
                <input autoFocus value={loc} onChange={e => setLoc(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') confirmPending() }}
                  placeholder="z. B. Raum 123" className="w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/40" />
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
    </span>
  )
}

function firstName(full: string): string { return (full || '').trim().split(/\s+/)[0] || '' }

// ── Ergebnis des Checklisten-Imports ──────────────────────────────────────────
function ChecklistImportResultModal({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const toggle = (k: string) => setOpen(p => ({ ...p, [k]: !p[k] }))

  const Section = ({ id, label, tasks, tone }: { id: string; label: string; tasks: string[]; tone: 'red' | 'muted' | 'amber' }) => {
    if (tasks.length === 0) return null
    const toneCls = tone === 'red' ? 'text-red-300' : tone === 'amber' ? 'text-amber-300' : 'text-muted-foreground'
    const isOpen = !!open[id]
    return (
      <div className="rounded-md border border-border">
        <button onClick={() => toggle(id)} className={`w-full flex items-center gap-1.5 px-3 py-2 text-xs ${toneCls} hover:brightness-125`}>
          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span className="font-semibold">{tasks.length}</span> {label}
        </button>
        {isOpen && (
          <div className="max-h-48 overflow-y-auto px-3 pb-2 text-[11px] font-mono text-muted-foreground grid grid-cols-2 sm:grid-cols-3 gap-x-4">
            {tasks.map((t, i) => <div key={i} className="truncate">{t}</div>)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <FileSpreadsheet size={16} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground flex-1">Checklisten-Import</h3>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-2">
              <div className="text-lg font-bold text-red-300 tabular-nums">{result.created.length}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">neu angelegt (rot)</div>
            </div>
            <div className="rounded-md border border-border bg-background px-2 py-2">
              <div className="text-lg font-bold text-foreground tabular-nums">{result.alreadyPresent.length}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">bereits vorhanden</div>
            </div>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-2">
              <div className="text-lg font-bold text-amber-300 tabular-nums">{result.missing.length}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">nicht in der Excel</div>
            </div>
          </div>

          <p className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-md px-3 py-2">
            Es wurde <strong>nichts überschrieben oder gelöscht</strong> — nur fehlende TASK-Nummern wurden als leere Einträge angelegt.
          </p>

          <div className="space-y-2">
            <Section id="created" label="neue TASKs (in der Übersicht rot, bis befüllt)" tasks={result.created} tone="red" />
            <Section id="present" label="bereits im Tool (unberührt)" tasks={result.alreadyPresent} tone="muted" />
            <Section id="missing" label="im Tool, aber nicht (mehr) in der Excel — nur Hinweis" tasks={result.missing} tone="amber" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90">Schließen</button>
        </div>
      </div>
    </div>
  )
}

// ── Abhol-Mail an den (Bestands-)Mitarbeiter: vorausgefüllte Outlook-Mail ──────
function PickupMailDialog({ checklist, bearbeiter, onClose }: { checklist: Checklist; bearbeiter: string; onClose: () => void }) {
  const [room, setRoom] = useState(checklist.hardwareLocation || '')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])
  async function openMail() {
    setBusy(true)
    try {
      let to = ''
      try {
        const dir = await readCentralAdUsers()
        if (dir) { const hit = lookupUserByName(buildNameIndex(dir.users), checklist.name); if (hit?.email) to = hit.email }
      } catch { /* ohne Empfaenger oeffnen */ }
      const vorname = firstName(checklist.name)
      // Text je nach Gerätetyp: Refresh -> Altgerät mitbringen + "Viele Grüße",
      // Neu -> nur Handy + "Gruß".
      const isRefresh = checklist.deviceType === 'refresh'
      const bringLine = isRefresh
        ? 'Bitte bringe dein Altgerät sowie dein Handy (zwecks Authentifizierung) mit.'
        : 'Bitte bringe dein Handy (zwecks Authentifizierung) mit.'
      const gruss = isRefresh ? 'Viele Grüße' : 'Gruß'
      const body =
        `Hallo ${vorname},\n\n` +
        `dein neuer Rechner liegt im Raum ${room.trim()} abholbereit.\n` +
        `${bringLine}\n\n` +
        `${gruss}\n${firstName(bearbeiter)}\n`
      await api().composeEmail({ to, cc: 'support.marine@SKF.com', subject: 'Dein neuer Rechner ist abholbereit', body })
      if (to) onClose(); else setHint('E-Mail-Adresse nicht automatisch gefunden – bitte im Outlook-Fenster ergänzen.')
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Mail size={16} className="text-blue-400" />
          <h3 className="text-sm font-semibold text-foreground flex-1">Abhol-Mail an {checklist.name}</h3>
          <button onClick={onClose} disabled={busy} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40"><X size={15} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground">Abhol-Ort / Raum (kommt in die Mail):</label>
            <input autoFocus value={room} onChange={e => setRoom(e.target.value)} placeholder="z. B. Raum 123"
              className="w-full mt-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/40" />
          </div>
          <p className="text-[11px] text-muted-foreground">Die Mail wird nur vorbereitet (nicht automatisch versendet). CC: support.marine@SKF.com</p>
          {hint && <p className="text-xs text-amber-300">{hint}</p>}
          <div className="flex items-center justify-end gap-2">
            <button onClick={onClose} disabled={busy} className="px-4 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">Abbrechen</button>
            <button onClick={openMail} disabled={busy || !room.trim()} className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">{busy ? <Loader size={13} className="animate-spin" /> : <Mail size={13} />}E-Mail öffnen</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground font-medium block mb-1">{label}</label>
      {children}
    </div>
  )
}

// Renders the SKF Marine logo. Prefers the user-supplied file
// public/skf-marine-logo.png; falls back to a canvas-rendered version, and
// finally to a pure text logo if even the canvas fails.
function SkfLogo() {
  const [dataUrl, setDataUrl] = useState<string>('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    ensureSkfLogo().then(({ url }) => {
      if (!cancelled && url) setDataUrl(url)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  if (failed || !dataUrl) {
    return (
      <div className="absolute right-10 top-3 text-right leading-none">
        <div style={{ color: '#0066b3', fontFamily: 'Arial Black, Arial, sans-serif', fontWeight: 900, fontSize: 36, letterSpacing: -1 }}>
          SKF
        </div>
        <div style={{ color: '#0066b3', fontFamily: 'Arial, sans-serif', fontWeight: 500, fontSize: 14, marginTop: 4 }}>
          SKF Marine
        </div>
      </div>
    )
  }
  return (
    <img
      src={dataUrl}
      alt="SKF Marine"
      className="absolute right-10 top-3"
      style={{ height: 56, width: 'auto' }}
      onError={() => setFailed(true)}
    />
  )
}
