import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  MapPin, Plus, Trash2, Edit2, Check, X, Upload, Monitor, Server,
  Printer, Package, Loader, Search, RefreshCw, AlertTriangle, ChevronRight,
  UserSearch, Briefcase, Building2, Filter, ChevronDown, ScanLine,
} from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore, useIsMasterAdmin, useIsAdmin } from '../store/authStore'
import { runPrinterIpScan } from '../services/printerIpScan'
import { useDeviceScanStore } from '../store/deviceScanStore'
import { useAppStore } from '../store/appStore'
import { createLogger } from '../utils/activityLogger'
import type { InventoryItem } from '../types/auth'
import { PersonInfoButton } from '../components/person/PersonDossier'
import { DeviceInfoButton } from '../components/device/DeviceDossier'
import { PrinterInfoButton } from '../components/printer/PrinterDossier'
import { PRINTER_SEED } from '../data/printerSeed'
import ExcelColumnDialog from '../components/ExcelColumnDialog'
import { parseExcelSheet, extractFromExcel, type ExcelSheetData } from '../utils/fileImport'
import { batchAdLookup } from '../services/adUserLookup'

const log = createLogger('location-overview')

type Category = 'Computer' | 'Server' | 'Drucker' | 'Sonstige'
const DEFAULT_CATEGORIES: Category[] = ['Computer', 'Server', 'Drucker', 'Sonstige']

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Computer: <Monitor size={14} />,
  Server:   <Server size={14} />,
  Drucker:  <Printer size={14} />,
  Sonstige: <Package size={14} />,
}

const INVENTORY_FILE = 'inventory/inventory.json'

// Einmaliges, idempotentes Befüllen der Kategorie "Drucker" aus dem SEAL-Wizard-
// Seed. Der zentrale Marker verhindert Wiederholung (auch instanzübergreifend) —
// insbesondere kein "Wiederauferstehen" gelöschter Drucker. Version erhöhen, um
// neu hinzugekommene Seed-Drucker nachzuziehen (fügt nur fehlende hinzu).
const PRINTER_SEED_VERSION = 1
const PRINTER_SEED_MARKER = 'drucker/seed_state.json'

export default function LocationOverview() {
  const isMaster   = useIsMasterAdmin()
  const isAdmin    = useIsAdmin()
  const session    = useAuthStore(s => s.session)
  const setScreen  = useAppStore(s => s.setScreen)
  const setDevices = useAppStore(s => s.setDevices)
  const seededRef  = useRef(false)

  const [activeCategory, setActiveCategory] = useState<string>('Computer')
  const [items, setItems]     = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [ipScanBusy, setIpScanBusy] = useState(false)
  const [ipScanMsg, setIpScanMsg] = useState('')
  // Geräte-Scan läuft über einen globalen Store → überlebt Menüwechsel/Unmount.
  const deviceScanRunning = useDeviceScanStore(s => s.running)
  const deviceScanDone = useDeviceScanStore(s => s.done)
  const deviceScanTotal = useDeviceScanStore(s => s.total)
  const deviceScanMsg = useDeviceScanStore(s => s.message)
  const deviceScanFinishedAt = useDeviceScanStore(s => s.finishedAt)
  const startDeviceScan = useDeviceScanStore(s => s.start)
  const clearDeviceScanMsg = useDeviceScanStore(s => s.clearMessage)
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Add item form
  const [showAdd, setShowAdd]         = useState(false)
  const [newName, setNewName]         = useState('')
  const [newIp, setNewIp]             = useState('')
  const [newDesc, setNewDesc]         = useState('')
  const [newAssigned, setNewAssigned] = useState('')
  const [adding, setAdding]           = useState(false)

  // Edit item
  const [editId, setEditId]         = useState<string | null>(null)
  const [editName, setEditName]     = useState('')
  const [editIp, setEditIp]         = useState('')
  const [editDesc, setEditDesc]     = useState('')
  const [editAssigned, setEditAssigned] = useState('')

  // Inline assignedTo edit (click-to-edit, outside full edit mode)
  const [assignedEditId, setAssignedEditId]   = useState<string | null>(null)
  const [assignedEditVal, setAssignedEditVal] = useState('')

  // Delete confirm
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null)

  // Import
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [pendingExcelData, setPendingExcelData] = useState<ExcelSheetData | null>(null)
  // After parsing the source file, hold the prepared name list + a preview of
  // what the smart-sync will do (added / kept / removed).
  const [pendingReplace, setPendingReplace] = useState<{
    names: string[]
    assignedToMap?: Record<string, string>
    previousCount: number
    addedCount: number
    keptCount: number
    removedCount: number
  } | null>(null)

  // AD enrichment (Title + Department for assigned users)
  const [adEnriching, setAdEnriching] = useState(false)
  const [adEnrichStatus, setAdEnrichStatus] = useState('')

  // Excel-style column filters. Each set contains the values the user wants to
  // INCLUDE — empty set = no filter on that column. Empty string in the set
  // matches items where that field is empty/missing.
  const [filterHost, setFilterHost] = useState<Set<string>>(new Set())
  const [filterCorpId, setFilterCorpId] = useState<Set<string>>(new Set())
  const [filterAssigned, setFilterAssigned] = useState<Set<string>>(new Set())
  const [filterDept, setFilterDept] = useState<Set<string>>(new Set())
  const [filterTitle, setFilterTitle] = useState<Set<string>>(new Set())

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api().netReadJson<InventoryItem[]>(INVENTORY_FILE)
      setItems(data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadItems() }, [loadItems])

  // ── Einmaliges Drucker-Seeding (Kategorie "Drucker" aus dem SEAL-Wizard) ────
  // Legt fehlende Drucker als Inventar-Objekte an, damit sie in der Standort-
  // Übersicht erscheinen. Nur für Admins, nur wenn das Netzlaufwerk verfügbar
  // ist, und nur einmal (zentraler Marker verhindert Wiederholung/Resurrection).
  useEffect(() => {
    if (!isAdmin || seededRef.current) return
    seededRef.current = true
    let cancelled = false
    ;(async () => {
      try {
        if (!(await api().netIsAvailable())) { seededRef.current = false; return }
        const marker = await api().netReadJson<{ version?: number }>(PRINTER_SEED_MARKER).catch(() => null)
        if (marker && (marker.version ?? 0) >= PRINTER_SEED_VERSION) return

        // WICHTIG (Datenverlust-Schutz): netReadJson liefert bei einem LESEFEHLER
        // (beschädigte/teilgeschriebene Datei, Netz-Hänger) ebenfalls null —
        // ununterscheidbar von "Datei existiert nicht". Würden wir null als []
        // behandeln und schreiben, überschrieben wir das GESAMTE Inventar (alle
        // Computer/Server) mit nur den Seed-Druckern. Daher: existiert die Datei,
        // ließ sie sich aber nicht lesen → Seeding ABBRECHEN (nicht überschreiben).
        const current = await api().netReadJson<InventoryItem[]>(INVENTORY_FILE)
        if (current === null) {
          const exists = await api().netExists(INVENTORY_FILE).catch(() => false)
          if (exists) { seededRef.current = false; return }   // vorhanden, aber unlesbar → Abbruch
        }
        const base = Array.isArray(current) ? current : []      // wirklich absent/leer → mit [] starten
        const existing = new Set(base.filter(i => i.category === 'Drucker').map(i => (i.name || '').trim().toUpperCase()))
        const now = new Date().toISOString()
        const by = session?.user.username ?? 'seed'
        const toAdd: InventoryItem[] = []
        for (const p of PRINTER_SEED) {
          const key = p.name.trim().toUpperCase()
          if (existing.has(key)) continue
          existing.add(key)
          toAdd.push({
            id: `seed-${p.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: p.name, description: p.location, category: 'Drucker', addedAt: now, addedBy: by,
          })
        }
        if (toAdd.length > 0) {
          const merged = [...base, ...toAdd]
          const ok = await api().netWriteJson(INVENTORY_FILE, merged)
          if (!ok) { seededRef.current = false; return }        // Schreibfehler → Marker NICHT setzen, später erneut
          if (!cancelled) await loadItems()                     // autoritativen Stand nachladen (kein Race mit initialem Load)
        }
        // Marker nur setzen, wenn nichts hinzuzufügen war ODER das Inventar erfolgreich geschrieben wurde.
        await api().netWriteJson(PRINTER_SEED_MARKER, { version: PRINTER_SEED_VERSION, seededAt: now, seededBy: by, added: toAdd.length })
      } catch { seededRef.current = false /* nächster Versuch beim nächsten Öffnen */ }
    })()
    return () => { cancelled = true }
  }, [isAdmin, session, loadItems])

  async function saveItems(updated: InventoryItem[]) {
    await api().netWriteJson(INVENTORY_FILE, updated)
    setItems(updated)
  }

  const categoryItems = items.filter(i => i.category === activeCategory)

  // Distinct values per filterable column (with counts) — used to populate the
  // Excel-style filter dropdowns. Computed from the unfiltered category list so
  // the user always sees all options regardless of the current filter state.
  const distinctValues = useMemo(() => {
    const host = new Map<string, number>()
    const corpId = new Map<string, number>()
    const assigned = new Map<string, number>()
    const dept = new Map<string, number>()
    const title = new Map<string, number>()
    for (const i of categoryItems) {
      host.set(i.name, (host.get(i.name) ?? 0) + 1)
      const c = (i.corpId ?? '').trim()
      corpId.set(c, (corpId.get(c) ?? 0) + 1)
      const a = (i.assignedTo ?? '').trim()
      assigned.set(a, (assigned.get(a) ?? 0) + 1)
      const d = (i.department ?? '').trim()
      dept.set(d, (dept.get(d) ?? 0) + 1)
      const t = (i.jobTitle ?? '').trim()
      title.set(t, (title.get(t) ?? 0) + 1)
    }
    return { host, corpId, assigned, dept, title }
  }, [categoryItems])

  const anyColumnFilterActive =
    filterHost.size > 0 || filterCorpId.size > 0 || filterAssigned.size > 0 || filterDept.size > 0 || filterTitle.size > 0

  function resetAllColumnFilters() {
    setFilterHost(new Set())
    setFilterCorpId(new Set())
    setFilterAssigned(new Set())
    setFilterDept(new Set())
    setFilterTitle(new Set())
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return categoryItems.filter(i => {
      // Search bar (matches across all relevant fields)
      if (q) {
        const matchesSearch =
          i.name.toLowerCase().includes(q) ||
          (i.ip ?? '').includes(search) ||
          (i.description ?? '').toLowerCase().includes(q) ||
          (i.corpId ?? '').toLowerCase().includes(q) ||
          (i.assignedTo ?? '').toLowerCase().includes(q) ||
          (i.department ?? '').toLowerCase().includes(q) ||
          (i.jobTitle ?? '').toLowerCase().includes(q)
        if (!matchesSearch) return false
      }
      // Column filters (empty set = no filter on that column)
      if (filterHost.size > 0 && !filterHost.has(i.name)) return false
      if (filterCorpId.size > 0 && !filterCorpId.has((i.corpId ?? '').trim())) return false
      if (filterAssigned.size > 0 && !filterAssigned.has((i.assignedTo ?? '').trim())) return false
      if (filterDept.size > 0 && !filterDept.has((i.department ?? '').trim())) return false
      if (filterTitle.size > 0 && !filterTitle.has((i.jobTitle ?? '').trim())) return false
      return true
    })
  }, [categoryItems, search, filterHost, filterCorpId, filterAssigned, filterDept, filterTitle])

  // ── Add item ────────────────────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    const item: InventoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: newName.trim(),
      ip: newIp.trim() || undefined,
      description: newDesc.trim() || undefined,
      assignedTo: newAssigned.trim() || undefined,
      category: activeCategory,
      addedAt: new Date().toISOString(),
      addedBy: session?.user.username ?? '',
    }
    await saveItems([...items, item])
    await log(`Objekt hinzugefügt: ${item.name} (${activeCategory})`, item.name)
    setNewName(''); setNewIp(''); setNewDesc(''); setNewAssigned(''); setShowAdd(false)
    setAdding(false)
  }

  // ── Edit item ───────────────────────────────────────────────────────────────
  function startEdit(item: InventoryItem) {
    setEditId(item.id)
    setEditName(item.name)
    setEditIp(item.ip ?? '')
    setEditDesc(item.description ?? '')
    setEditAssigned(item.assignedTo ?? '')
    setAssignedEditId(null)
  }
  async function saveEdit(id: string) {
    const updated = items.map(i => i.id === id
      ? { ...i, name: editName.trim(), ip: editIp.trim() || undefined, description: editDesc.trim() || undefined, assignedTo: editAssigned.trim() || undefined }
      : i)
    await saveItems(updated)
    await log(`Objekt bearbeitet: ${editName}`, editName)
    setEditId(null)
  }

  async function saveAssignedTo(id: string) {
    const updated = items.map(i => i.id === id
      ? { ...i, assignedTo: assignedEditVal.trim() || undefined }
      : i)
    await saveItems(updated)
    await log(`ServiceNow Zuweisung geändert`, assignedEditVal)
    setAssignedEditId(null)
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteIds) return
    const updated = items.filter(i => !deleteIds.includes(i.id))
    await saveItems(updated)
    await log(`${deleteIds.length} Objekt(e) gelöscht (${activeCategory})`)
    setSelected(new Set()); setDeleteIds(null)
  }

  // ── Import from file ────────────────────────────────────────────────────────
  async function handleImport() {
    const path = await api().openFileDialog([
      { name: 'Tabellen & Dokumente', extensions: ['xlsx', 'xls', 'csv', 'txt'] }
    ])
    if (!path) return
    setImporting(true)
    setImportStatus('')
    try {
      const res = await api().readFile(path)
      if (!res.success || !res.data) throw new Error(res.error ?? 'Lesefehler')
      const binaryStr = atob(res.data)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
      const ext = path.toLowerCase().split('.').pop() ?? ''

      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        // Excel/CSV: show column picker dialog
        const sheetData = parseExcelSheet(bytes)
        if (sheetData.columns.length === 0) { setImportStatus('Keine Spalten gefunden'); return }
        setPendingExcelData(sheetData)
      } else {
        // Plain text: extract hostnames directly
        const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
        applyTextImport(text)
      }
    } catch (err) {
      setImportStatus('Fehler: ' + String(err))
    } finally {
      setImporting(false)
    }
  }

  function applyTextImport(text: string) {
    const hostnameRegex = /^[A-Za-z0-9][A-Za-z0-9\-\.]{1,62}$/
    const names = text.split(/[\r\n;,\t]+/)
      .map(s => s.trim().replace(/^["']|["']$/g, ''))
      .filter(s => hostnameRegex.test(s) && s.length > 1)
    if (!names.length) { setImportStatus('Keine gültigen Hostnamen gefunden'); return }
    addImportedNames(names)
  }

  // Stage an import — compute a preview of the smart sync (what would change)
  // and show a confirm modal so the user can see exactly what will happen
  // before any data is touched.
  //
  // Smart sync rules (matching by hostname, case-insensitive):
  //   - Hostname exists in current category   → KEEP existing item unchanged
  //                                              (preserves manual edits,
  //                                              ServiceNow assignment, AD data)
  //   - Hostname is new in the import         → ADD as new (AD data empty)
  //   - Hostname exists but not in the import → REMOVE
  function addImportedNames(names: string[], assignedToMap?: Record<string, string>) {
    // De-duplicate the incoming list (case-insensitive)
    const seen = new Set<string>()
    const cleaned: string[] = []
    for (const n of names) {
      const key = n.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      cleaned.push(n)
    }
    if (!cleaned.length) { setImportStatus('Keine gueltigen Hostnamen in der Datei gefunden'); return }

    const existingInCategory = items.filter(i => i.category === activeCategory)
    const existingByName = new Map(existingInCategory.map(i => [i.name.toLowerCase(), i]))
    const importedSet = new Set(cleaned.map(n => n.toLowerCase()))

    let added = 0, kept = 0
    for (const n of cleaned) {
      if (existingByName.has(n.toLowerCase())) kept++
      else added++
    }
    let removed = 0
    for (const i of existingInCategory) {
      if (!importedSet.has(i.name.toLowerCase())) removed++
    }

    setPendingReplace({
      names: cleaned,
      assignedToMap,
      previousCount: existingInCategory.length,
      addedCount: added,
      keptCount: kept,
      removedCount: removed,
    })
  }

  async function confirmReplaceImport() {
    if (!pendingReplace) return
    const { names, assignedToMap } = pendingReplace
    setPendingReplace(null)

    // Map existing items in active category by lower-case hostname for lookup
    const existingInCategory = items.filter(i => i.category === activeCategory)
    const existingByName = new Map(existingInCategory.map(i => [i.name.toLowerCase(), i]))

    const otherCategoryItems = items.filter(i => i.category !== activeCategory)
    const baseTime = Date.now()
    let kept = 0
    let added = 0

    const nextCategoryItems: InventoryItem[] = []
    for (let idx = 0; idx < names.length; idx++) {
      const name = names[idx]
      const existing = existingByName.get(name.toLowerCase())
      if (existing) {
        // Keep existing item unchanged — preserves manual edits + AD lookup data
        nextCategoryItems.push(existing)
        kept++
      } else {
        // New host — add with imported data (AD fields stay empty until next
        // "AD-Daten aktualisieren" run in Standort-Übersicht)
        nextCategoryItems.push({
          id: `${baseTime}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          category: activeCategory,
          addedAt: new Date().toISOString(),
          addedBy: session?.user.username ?? '',
          assignedTo: assignedToMap?.[name] || undefined,
        })
        added++
      }
    }

    const removed = existingInCategory.length - kept
    await saveItems([...otherCategoryItems, ...nextCategoryItems])
    await log(`Import (Smart-Sync): ${added} neu, ${kept} unveraendert, ${removed} entfernt (${activeCategory})`)
    setImportStatus(`${added} neu hinzugefuegt, ${kept} bestehende unveraendert (AD-Daten erhalten), ${removed} entfernt`)
  }

  // ── AD enrichment for assigned users ────────────────────────────────────────
  // Resolves Active Directory data (CorpID + Department + Title + Manager) for
  // the items the user has SELECTED via checkbox. Items that already have all
  // three core fields (corpId + department + jobTitle) are SKIPPED — only items
  // missing at least one of those are queried against AD.
  function isAdComplete(i: InventoryItem): boolean {
    return !!(i.corpId && i.corpId.trim()
      && i.department && i.department.trim()
      && i.jobTitle && i.jobTitle.trim())
  }

  async function handleAdEnrich() {
    const selectedItems = items.filter(i => i.category === activeCategory && selected.has(i.id))
    if (selectedItems.length === 0) {
      setAdEnrichStatus('Bitte erst Geraete in der Liste auswaehlen (Checkbox links).')
      return
    }
    const withAssignment = selectedItems.filter(i => i.assignedTo && i.assignedTo.trim())
    if (withAssignment.length === 0) {
      setAdEnrichStatus('Die ausgewaehlten Geraete haben keine ServiceNow-Zuweisung.')
      return
    }
    // Skip items where all three core AD fields are already filled
    const needsLookup = withAssignment.filter(i => !isAdComplete(i))
    const skippedComplete = withAssignment.length - needsLookup.length
    if (needsLookup.length === 0) {
      setAdEnrichStatus(`Alle ${withAssignment.length} ausgewaehlten Geraete haben bereits vollstaendige AD-Daten. Nichts zu tun.`)
      return
    }
    setAdEnriching(true)
    setAdEnrichStatus(`AD-Abfrage fuer ${needsLookup.length} Geraet${needsLookup.length === 1 ? '' : 'e'} laeuft${skippedComplete > 0 ? ` (${skippedComplete} bereits vollstaendig, werden uebersprungen)` : ''}...`)
    try {
      const identities = needsLookup.map(i => i.assignedTo!.trim())
      const lookup = await batchAdLookup(identities, (done, total) => {
        setAdEnrichStatus(`AD-Abfrage laeuft: ${done} von ${total} verarbeitet${skippedComplete > 0 ? ` (+ ${skippedComplete} uebersprungen)` : ''}...`)
      })
      const now = new Date().toISOString()
      const needsLookupIds = new Set(needsLookup.map(i => i.id))
      let resolved = 0
      let notFound = 0
      const updated = items.map(i => {
        // Only touch items we actually queried — already-complete items stay untouched
        if (!needsLookupIds.has(i.id) || !i.assignedTo) return i
        const res = lookup.get(i.assignedTo.trim())
        if (!res || !res.found) {
          if (res && !res.found) notFound++
          return i
        }
        resolved++
        return {
          ...i,
          corpId: res.sam || i.corpId || undefined,
          department: res.department || i.department || undefined,
          jobTitle: res.title || i.jobTitle || undefined,
          manager: res.manager || i.manager || undefined,
          managerSam: res.managerSam || i.managerSam || undefined,
          adLookupAt: now,
        }
      })
      await saveItems(updated)
      await log(`AD-Daten aktualisiert (Auswahl): ${resolved} aufgeloest, ${notFound} nicht gefunden, ${skippedComplete} uebersprungen (${activeCategory})`)
      const parts: string[] = [`${resolved} aufgeloest`]
      if (notFound > 0) parts.push(`${notFound} nicht in AD gefunden`)
      if (skippedComplete > 0) parts.push(`${skippedComplete} bereits vollstaendig (uebersprungen)`)
      setAdEnrichStatus(parts.join(', ') + '.')
    } catch (e) {
      setAdEnrichStatus(`Fehler: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setAdEnriching(false)
    }
  }

  function handleExcelConfirm(hostnameColNames: string[], _serialColNames: string[], assignedToColNames: string[]) {
    if (!pendingExcelData) return
    const { hostnames, assignedToMap } = extractFromExcel(pendingExcelData.rows, hostnameColNames, [], assignedToColNames)
    setPendingExcelData(null)
    addImportedNames(hostnames, assignedToMap)
  }

  // ── Send to query/remote ────────────────────────────────────────────────────
  const [remoteDocError, setRemoteDocError] = useState('')

  function sendToScreen(target: 'query-menu' | 'remote-doc') {
    const selectedItems = filteredItems.filter(i => selected.has(i.id))
    const names = selectedItems.map(i => i.name)
    if (!names.length) return
    if (target === 'remote-doc' && names.length > 1) {
      setRemoteDocError('Remote Doc unterstützt nur ein Gerät gleichzeitig. Bitte wählen Sie nur ein Objekt aus.')
      setTimeout(() => setRemoteDocError(''), 4000)
      return
    }
    setRemoteDocError('')
    setDevices(names.map((n, idx) => ({
      id: `inv-${idx}`,
      type: 'hostname' as const,
      value: n,
      resolvedHostnames: [n],
    })))
    setScreen(target)
    log(`${names.length} Gerät(e) an "${target}" übergeben`, names.join(', '))
  }

  const allCatSelected = filteredItems.length > 0 && filteredItems.every(i => selected.has(i.id))

  function toggleSelectAll() {
    if (allCatSelected) setSelected(prev => { const n = new Set(prev); filteredItems.forEach(i => n.delete(i.id)); return n })
    else setSelected(prev => { const n = new Set(prev); filteredItems.forEach(i => n.add(i.id)); return n })
  }

  // Drucker-IPs sofort ermitteln (statt bis 15:00 zu warten); schreibt master.ip in die Dossiers.
  async function scanPrinterIpsNow() {
    if (ipScanBusy) return
    setIpScanBusy(true); setIpScanMsg('')
    try {
      const r = await runPrinterIpScan(session?.user.displayName || session?.user.username || 'manuell')
      setIpScanMsg(`Drucker-IP-Scan fertig: ${r.updated}/${r.scanned} IP-Adressen aktualisiert.`)
    } catch (e) {
      setIpScanMsg('Drucker-IP-Scan fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setIpScanBusy(false) }
  }

  // Geräte-Scan (IP/MAC/Seriennummer) für Server, Computer und Drucker starten.
  // Läuft im Store (Hintergrund) weiter, auch wenn dieser Screen verlassen wird.
  function scanDevicesNow() {
    startDeviceScan(session?.user.displayName || session?.user.username || 'manuell')
  }

  // Nach Abschluss eines (auch im Hintergrund gelaufenen) Geräte-Scans neu laden.
  useEffect(() => {
    if (deviceScanFinishedAt) void loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceScanFinishedAt])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <MapPin size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">Standort-Übersicht</h1>
        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{selected.size} ausgewählt</span>
              <button onClick={() => sendToScreen('query-menu')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                <ChevronRight size={12} /> Zum Abfrage-Menü
              </button>
              <button onClick={() => sendToScreen('remote-doc')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-purple-500/40 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors">
                <ChevronRight size={12} /> Zu Remote Doc
              </button>
              <span className="text-[10px] text-muted-foreground">(maximal 1 Objekt)</span>
              {isMaster && (
                <button onClick={() => setDeleteIds(Array.from(selected))}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                  <Trash2 size={12} /> Löschen
                </button>
              )}
            </>
          )}
          {activeCategory === 'Drucker' && (
            <button onClick={scanPrinterIpsNow} disabled={ipScanBusy}
              title="IP-Adressen aller Drucker jetzt ermitteln und in den Dossiers hinterlegen (läuft sonst automatisch täglich um 15:00)"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-40">
              {ipScanBusy ? <Loader size={12} className="animate-spin" /> : <Printer size={12} />}Drucker-IPs scannen
            </button>
          )}
          <button onClick={scanDevicesNow} disabled={deviceScanRunning}
            title="IP, MAC und Seriennummer aller Geräte (Server/Computer/Drucker) jetzt auslesen und in den Stammdaten hinterlegen. Läuft im Hintergrund weiter (auch bei Menüwechsel) und sonst automatisch alle 3 Tage um 15:00 Uhr."
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40">
            {deviceScanRunning ? <Loader size={12} className="animate-spin" /> : <ScanLine size={12} />}Geräte scannen (IP/MAC/Serial)
          </button>
          <button onClick={loadItems} className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>
      {ipScanMsg && (
        <div className="shrink-0 mx-4 mt-2 px-3 py-2 text-xs rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 flex items-center gap-2">
          <span className="flex-1">{ipScanMsg}</span>
          <button onClick={() => setIpScanMsg('')} className="text-blue-300/70 hover:text-blue-200 text-sm leading-none">×</button>
        </div>
      )}
      {(deviceScanRunning || deviceScanMsg) && (
        <div className="shrink-0 mx-4 mt-2 px-3 py-2 text-xs rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center gap-2">
          {deviceScanRunning && <Loader size={12} className="animate-spin shrink-0" />}
          <span className="flex-1">
            {deviceScanRunning
              ? `Geräte werden gescannt (IP/MAC/Seriennummer)…${deviceScanTotal ? ` ${deviceScanDone}/${deviceScanTotal}` : ''} — läuft im Hintergrund weiter`
              : deviceScanMsg}
          </span>
          {!deviceScanRunning && <button onClick={clearDeviceScanMsg} className="text-emerald-300/70 hover:text-emerald-200 text-sm leading-none">×</button>}
        </div>
      )}

      {remoteDocError && (
        <div className="shrink-0 mx-4 mt-2 px-3 py-2 text-xs rounded-md bg-red-500/10 border border-red-500/20 text-red-400">
          {remoteDocError}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {/* Category sidebar */}
        <div className="w-44 shrink-0 border-r border-border py-3 space-y-0.5 px-2">
          {DEFAULT_CATEGORIES.map(cat => {
            const count = items.filter(i => i.category === cat).length
            return (
              <button key={cat} onClick={() => { setActiveCategory(cat); setSelected(new Set()); setSearch('') }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${activeCategory === cat ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'}`}>
                {CATEGORY_ICONS[cat] ?? <Package size={14} />}
                <span className="flex-1 text-left">{cat}</span>
                <span className="text-[10px] opacity-70">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="shrink-0 px-4 py-3 border-b border-border flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Suchen…"
                className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            </div>
            <span className="text-xs text-muted-foreground">{filteredItems.length} Geräte</span>
            {isMaster && (
              <>
                <button onClick={() => setShowAdd(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-emerald-500/40 bg-emerald-500 text-black hover:bg-emerald-500/20 transition-colors">
                  <Plus size={12} /> Hinzufügen
                </button>
                <button onClick={handleImport} disabled={importing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground transition-colors disabled:opacity-50">
                  {importing ? <Loader size={12} className="animate-spin" /> : <Upload size={12} />} Import
                </button>
                <button onClick={handleAdEnrich} disabled={adEnriching || selected.size === 0}
                  title={selected.size === 0
                    ? 'Erst Geraete per Checkbox auswaehlen, dann AD-Daten holen'
                    : `AD-Daten fuer ${selected.size} ausgewaehlte${selected.size === 1 ? 's Geraet' : ' Geraete'} aktualisieren`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {adEnriching ? <Loader size={12} className="animate-spin" /> : <UserSearch size={12} />}
                  AD-Daten aktualisieren{selected.size > 0 ? ` (${selected.size})` : ''}
                </button>
              </>
            )}
          </div>

          {/* ── Excel-style column filters ── */}
          <div className="shrink-0 px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap bg-muted/5">
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">
              <Filter size={11} />Filter
            </span>
            <ColumnFilter
              label="Hostname"
              icon={<Monitor size={11} />}
              values={distinctValues.host}
              selected={filterHost}
              onChange={setFilterHost}
            />
            <ColumnFilter
              label="Corp ID"
              icon={<UserSearch size={11} />}
              values={distinctValues.corpId}
              selected={filterCorpId}
              onChange={setFilterCorpId}
            />
            <ColumnFilter
              label="Name"
              icon={<UserSearch size={11} />}
              values={distinctValues.assigned}
              selected={filterAssigned}
              onChange={setFilterAssigned}
            />
            <ColumnFilter
              label="Abteilung"
              icon={<Building2 size={11} />}
              values={distinctValues.dept}
              selected={filterDept}
              onChange={setFilterDept}
            />
            <ColumnFilter
              label="Stellenbezeichnung"
              icon={<Briefcase size={11} />}
              values={distinctValues.title}
              selected={filterTitle}
              onChange={setFilterTitle}
            />
            {anyColumnFilterActive && (
              <button
                onClick={resetAllColumnFilters}
                className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 ml-auto"
              >
                <X size={11} />Alle Filter zurücksetzen
              </button>
            )}
          </div>

          {importStatus && (
            <div className="mx-4 mt-2 px-3 py-2 text-xs rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400">
              {importStatus}
            </div>
          )}

          {adEnrichStatus && (
            <div className="mx-4 mt-2 px-3 py-2 text-xs rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-300 flex items-center justify-between gap-2">
              <span>{adEnrichStatus}</span>
              <button onClick={() => setAdEnrichStatus('')} className="text-purple-300/60 hover:text-purple-300">
                <X size={12} />
              </button>
            </div>
          )}

          {/* Add form */}
          {showAdd && isMaster && (
            <form onSubmit={handleAdd} className="shrink-0 px-4 py-3 border-b border-border bg-muted/5 flex items-end gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Name/Hostname *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} required
                  placeholder="DEHAM12345"
                  className="px-2.5 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary w-40" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">IP (optional)</label>
                <input value={newIp} onChange={e => setNewIp(e.target.value)} placeholder="192.168.1.1"
                  className="px-2.5 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary w-32" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground block mb-1">Beschreibung (optional)</label>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="z.B. Buchhaltung EG"
                  className="w-full px-2.5 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              </div>
              <div className="w-40">
                <label className="text-[10px] text-muted-foreground block mb-1">ServiceNow Zuweisung (optional)</label>
                <input value={newAssigned} onChange={e => setNewAssigned(e.target.value)} placeholder="Vorname Nachname"
                  className="w-full px-2.5 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              </div>
              <button type="submit" disabled={adding}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-50">
                {adding ? <Loader size={12} className="animate-spin" /> : <Check size={12} />} Hinzufügen
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground">
                <X size={14} />
              </button>
            </form>
          )}

          {/* Item list */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-12">
                <Loader size={14} className="animate-spin" /> Wird geladen…
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <MapPin size={32} className="opacity-20 mb-3" />
                <p className="text-sm">Keine Geräte in "{activeCategory}"</p>
                {isMaster && <p className="text-xs mt-1 opacity-60">Klicken Sie "Hinzufügen" oder "Import" um Geräte hinzuzufügen</p>}
              </div>
            ) : (
              <>
                {/* Select all */}
                <div className="flex items-center gap-3 px-3 py-2 mb-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={allCatSelected} onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 accent-primary" />
                  <span>Alle auswählen ({filteredItems.length})</span>
                </div>

                <div className="space-y-1">
                  {filteredItems.map(item => {
                    const isEditing = editId === item.id
                    const isSelected = selected.has(item.id)
                    return (
                      <div key={item.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${isSelected ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-accent/10'}`}>
                        <input type="checkbox" checked={isSelected}
                          onChange={() => setSelected(prev => { const n = new Set(prev); isSelected ? n.delete(item.id) : n.add(item.id); return n })}
                          className="w-3.5 h-3.5 accent-primary shrink-0" />

                        {isEditing && isMaster ? (
                          <>
                            <input value={editName} onChange={e => setEditName(e.target.value)}
                              className="flex-1 px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary min-w-0" />
                            <input value={editIp} onChange={e => setEditIp(e.target.value)} placeholder="IP"
                              className="w-28 px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary shrink-0" />
                            <input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Beschreibung"
                              className="flex-1 px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary min-w-0" />
                            <input value={editAssigned} onChange={e => setEditAssigned(e.target.value)} placeholder="ServiceNow Zuweisung"
                              className="w-36 px-2 py-1 text-xs rounded border border-purple-500/40 bg-background text-foreground focus:outline-none focus:border-purple-400 shrink-0" />
                            <button onClick={() => saveEdit(item.id)} className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded shrink-0">
                              <Check size={13} />
                            </button>
                            <button onClick={() => setEditId(null)} className="p-1 text-muted-foreground hover:bg-accent rounded shrink-0">
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground font-mono truncate inline-flex items-center gap-1">{item.name}{item.name && (item.category === 'Drucker' ? <PrinterInfoButton printerName={item.name} /> : <DeviceInfoButton hostname={item.name} />)}</p>
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                {item.ip && <span className="text-[10px] text-muted-foreground">{item.ip}</span>}
                                {item.mac && <span className="text-[10px] text-muted-foreground font-mono" title="MAC-Adresse (Geräte-Scan)">{item.mac}</span>}
                                {item.serial && <span className="text-[10px] text-muted-foreground font-mono" title="Seriennummer (Geräte-Scan)">SN: {item.serial}</span>}
                                {item.description && <span className="text-[10px] text-muted-foreground">{item.description}</span>}
                                {item.department && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-foreground" title="Abteilung (aus AD)">
                                    <Building2 size={10} className="text-blue-400" />{item.department}
                                  </span>
                                )}
                                {item.jobTitle && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-foreground" title="Stellenbezeichnung (aus AD)">
                                    <Briefcase size={10} className="text-purple-400" />{item.jobTitle}
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground/50">
                                  {new Date(item.addedAt).toLocaleDateString('de-DE')}
                                </span>
                              </div>
                            </div>

                            {/* CorpID (Windows-Anmeldung, aus AD-Lookup befuellt) */}
                            {item.corpId && (
                              <div className="shrink-0 flex items-center" title="Corp ID / Windows-Anmeldung (aus AD)">
                                <span className="px-2 py-0.5 text-[10px] rounded-full bg-indigo-500/15 text-foreground border border-indigo-500/30 font-mono whitespace-nowrap">
                                  {item.corpId}
                                </span>
                              </div>
                            )}

                            {/* ServiceNow Zuweisung — visible to all, editable by master admin */}
                            <div className="shrink-0 flex items-center">
                              {assignedEditId === item.id && isMaster ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    value={assignedEditVal}
                                    onChange={e => setAssignedEditVal(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') saveAssignedTo(item.id)
                                      if (e.key === 'Escape') setAssignedEditId(null)
                                    }}
                                    autoFocus
                                    placeholder="Zugewiesen an…"
                                    className="px-2 py-0.5 text-[11px] rounded border border-purple-500/40 bg-background text-foreground focus:outline-none w-36"
                                  />
                                  <button onClick={() => saveAssignedTo(item.id)} className="p-0.5 text-emerald-400 hover:bg-emerald-500/10 rounded">
                                    <Check size={11} />
                                  </button>
                                  <button onClick={() => setAssignedEditId(null)} className="p-0.5 text-muted-foreground hover:bg-accent rounded">
                                    <X size={11} />
                                  </button>
                                </div>
                              ) : (
                                <div
                                  onClick={() => {
                                    if (isMaster) {
                                      setAssignedEditId(item.id)
                                      setAssignedEditVal(item.assignedTo ?? '')
                                    }
                                  }}
                                  className={isMaster ? 'cursor-pointer' : ''}
                                  title={isMaster ? 'Klicken zum Bearbeiten' : undefined}
                                >
                                  {item.assignedTo ? (
                                    <span className="inline-flex items-center gap-1">
                                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-muted/30 text-foreground border border-border whitespace-nowrap">
                                        {item.assignedTo}
                                      </span>
                                      <PersonInfoButton name={item.assignedTo} sam={item.corpId} />
                                    </span>
                                  ) : isMaster ? (
                                    <span className="text-[10px] text-muted-foreground/40 italic">+ Zuweisung</span>
                                  ) : null}
                                </div>
                              )}
                            </div>

                            {isMaster && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => startEdit(item)} className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded">
                                  <Edit2 size={12} />
                                </button>
                                <button onClick={() => setDeleteIds([item.id])} className="p-1 text-red-400 hover:bg-red-500/10 rounded">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      {deleteIds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-red-500/40 rounded-xl p-5 w-[380px] shadow-2xl space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-400" />
              <h3 className="text-sm font-semibold text-foreground">Löschen bestätigen</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {deleteIds.length === 1
                ? `Soll dieses Gerät wirklich gelöscht werden?`
                : `Sollen ${deleteIds.length} Geräte wirklich gelöscht werden?`}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteIds(null)}
                className="flex-1 py-2 text-sm rounded-lg border border-border hover:bg-accent text-muted-foreground">Abbrechen</button>
              <button onClick={handleDelete}
                className="flex-1 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold">Löschen</button>
            </div>
          </div>
        </div>
      )}

      {/* Excel column picker */}
      {pendingExcelData && (
        <ExcelColumnDialog
          columns={pendingExcelData.columns}
          rows={pendingExcelData.rows}
          onConfirm={handleExcelConfirm}
          onCancel={() => setPendingExcelData(null)}
        />
      )}

      {/* Import smart-sync confirm */}
      {pendingReplace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-blue-500/40 rounded-xl p-5 w-[480px] shadow-2xl space-y-4">
            <div className="flex items-center gap-2">
              <RefreshCw size={15} className="text-blue-400" />
              <h3 className="text-sm font-semibold text-foreground">Mit Standort-Übersicht synchronisieren?</h3>
            </div>
            <div className="text-xs text-muted-foreground space-y-2">
              <p>
                Die Datei enthält <strong className="text-foreground">{pendingReplace.names.length}</strong> Hostnamen.
                Die aktuelle Liste in <strong className="text-foreground">{activeCategory}</strong> hat{' '}
                <strong className="text-foreground">{pendingReplace.previousCount}</strong> Einträge.
              </p>

              <div className="bg-muted/20 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-foreground">
                    <strong>{pendingReplace.addedCount}</strong> neu hinzugefügt
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-foreground">
                    <strong>{pendingReplace.keptCount}</strong> bestehende bleiben unverändert
                  </span>
                  <span className="text-[10px] text-muted-foreground/80">(AD-Daten + manuelle Edits werden behalten)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-foreground">
                    <strong>{pendingReplace.removedCount}</strong> entfernt
                  </span>
                  <span className="text-[10px] text-muted-foreground/80">(nicht mehr in der neuen Liste)</span>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground/80">
                Match per Hostname (Groß-/Kleinschreibung egal). Andere Kategorien bleiben unangetastet.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPendingReplace(null)}
                className="flex-1 py-2 text-sm rounded-lg border border-border hover:bg-accent text-muted-foreground">Abbrechen</button>
              <button onClick={confirmReplaceImport}
                className="flex-1 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold">Synchronisieren</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Excel-style column filter ────────────────────────────────────────────────
// Multi-select dropdown with a search box and counts per value.
// Empty input value (= field not set) is shown as "(leer)".

interface ColumnFilterProps {
  label: string
  values: Map<string, number>     // value -> occurrence count
  selected: Set<string>           // currently included values (empty = no filter)
  onChange: (next: Set<string>) => void
  icon?: React.ReactNode
}

function ColumnFilter({ label, values, selected, onChange, icon }: ColumnFilterProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...values.entries()]
      .filter(([v]) => !q || v.toLowerCase().includes(q) || (v === '' && '(leer)'.includes(q)))
    list.sort((a, b) => {
      // Empty values last, then alphabetical
      if (a[0] === '' && b[0] !== '') return 1
      if (a[0] !== '' && b[0] === '') return -1
      return a[0].localeCompare(b[0], 'de', { sensitivity: 'base' })
    })
    return list
  }, [values, query])

  function toggle(v: string) {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onChange(next)
  }

  function selectAllVisible() {
    const next = new Set(selected)
    for (const [v] of entries) next.add(v)
    onChange(next)
  }
  function clearAllVisible() {
    const next = new Set(selected)
    for (const [v] of entries) next.delete(v)
    onChange(next)
  }

  const total = values.size
  const filterActive = selected.size > 0

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={filterActive ? `${selected.size} von ${total} ausgewaehlt` : `Nach ${label} filtern`}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors ${
          filterActive
            ? 'border-blue-500/60 bg-blue-500/10 text-blue-300'
            : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'
        }`}
      >
        {icon}
        <span>{label}</span>
        {filterActive && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-200">
            {selected.size}
          </span>
        )}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 w-72 rounded-lg border border-border bg-card shadow-2xl">
          {/* Header: search + bulk */}
          <div className="p-2 border-b border-border space-y-2">
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={`In ${label.toLowerCase()} suchen…`}
                className="w-full pl-7 pr-2 py-1 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div className="flex items-center gap-1 text-[10px]">
              <button
                onClick={selectAllVisible}
                className="px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"
              >
                Alle
              </button>
              <button
                onClick={clearAllVisible}
                className="px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"
              >
                Keine
              </button>
              {selected.size > 0 && (
                <button
                  onClick={() => onChange(new Set())}
                  className="px-2 py-0.5 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 ml-auto"
                >
                  Filter aufheben
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto py-1">
            {entries.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Keine Werte</p>
            ) : (
              entries.map(([v, count]) => {
                const checked = selected.has(v)
                return (
                  <label
                    key={v || '__empty__'}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/20 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(v)}
                      className="rounded accent-primary"
                    />
                    <span className={`flex-1 truncate ${v === '' ? 'italic text-muted-foreground' : 'text-foreground'}`}>
                      {v || '(leer)'}
                    </span>
                    <span className="text-[10px] text-muted-foreground/70">{count}</span>
                  </label>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
