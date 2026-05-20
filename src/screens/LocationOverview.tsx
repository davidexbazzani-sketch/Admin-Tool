import { useState, useEffect, useCallback } from 'react'
import {
  MapPin, Plus, Trash2, Edit2, Check, X, Upload, Monitor, Server,
  Printer, Package, Loader, Search, RefreshCw, AlertTriangle, ChevronRight,
  UserSearch, Briefcase, Building2,
} from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore, useIsMasterAdmin } from '../store/authStore'
import { useAppStore } from '../store/appStore'
import { createLogger } from '../utils/activityLogger'
import type { InventoryItem } from '../types/auth'
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

export default function LocationOverview() {
  const isMaster   = useIsMasterAdmin()
  const session    = useAuthStore(s => s.session)
  const setScreen  = useAppStore(s => s.setScreen)
  const setDevices = useAppStore(s => s.setDevices)

  const [activeCategory, setActiveCategory] = useState<string>('Computer')
  const [items, setItems]     = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
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
  // After parsing the source file, hold the prepared name list here until the
  // user explicitly confirms a destructive replace of the current category.
  const [pendingReplace, setPendingReplace] = useState<{
    names: string[]
    assignedToMap?: Record<string, string>
    previousCount: number
  } | null>(null)

  // AD enrichment (Title + Department for assigned users)
  const [adEnriching, setAdEnriching] = useState(false)
  const [adEnrichStatus, setAdEnrichStatus] = useState('')

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

  async function saveItems(updated: InventoryItem[]) {
    await api().netWriteJson(INVENTORY_FILE, updated)
    setItems(updated)
  }

  const categoryItems = items.filter(i => i.category === activeCategory)
  const filteredItems = (() => {
    const q = search.trim().toLowerCase()
    if (!q) return categoryItems
    return categoryItems.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.ip ?? '').includes(search) ||
      (i.description ?? '').toLowerCase().includes(q) ||
      (i.assignedTo ?? '').toLowerCase().includes(q) ||
      (i.department ?? '').toLowerCase().includes(q) ||
      (i.jobTitle ?? '').toLowerCase().includes(q)
    )
  })()

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

  // Stage an import — show a confirm modal so the user can see exactly how many
  // existing entries will be replaced. The actual replace happens in
  // confirmReplaceImport() below.
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
    const previousCount = items.filter(i => i.category === activeCategory).length
    setPendingReplace({ names: cleaned, assignedToMap, previousCount })
  }

  async function confirmReplaceImport() {
    if (!pendingReplace) return
    const { names, assignedToMap, previousCount } = pendingReplace
    setPendingReplace(null)
    // Build new items for the active category, then keep all items from other
    // categories untouched.
    const otherCategoryItems = items.filter(i => i.category !== activeCategory)
    const baseTime = Date.now()
    const newItems: InventoryItem[] = names.map((name, idx) => ({
      id: `${baseTime}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      category: activeCategory,
      addedAt: new Date().toISOString(),
      addedBy: session?.user.username ?? '',
      assignedTo: assignedToMap?.[name] || undefined,
    }))
    await saveItems([...otherCategoryItems, ...newItems])
    await log(`Import (ersetzt): ${previousCount} alte Eintraege durch ${newItems.length} neue ersetzt (${activeCategory})`)
    setImportStatus(`${previousCount} alte Eintraege ersetzt durch ${newItems.length} neue Hostnamen`)
  }

  // ── AD enrichment for assigned users ────────────────────────────────────────
  // Resolves Active Directory data (Department + Title) for the items the user
  // has SELECTED via checkbox. Only items that also have a ServiceNow assignment
  // are queried. Items that are not selected stay untouched.
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
    setAdEnriching(true)
    setAdEnrichStatus(`AD-Abfrage fuer ${withAssignment.length} ausgewaehlte${withAssignment.length === 1 ? 's' : ''} Geraet${withAssignment.length === 1 ? '' : 'e'} laeuft...`)
    try {
      const identities = withAssignment.map(i => i.assignedTo!.trim())
      const lookup = await batchAdLookup(identities)
      const now = new Date().toISOString()
      let resolved = 0
      let notFound = 0
      const updated = items.map(i => {
        // Only touch selected items in the active category that have an assignment
        if (!selected.has(i.id) || i.category !== activeCategory || !i.assignedTo) return i
        const res = lookup.get(i.assignedTo.trim())
        if (!res || !res.found) {
          if (res && !res.found) notFound++
          return i
        }
        resolved++
        return {
          ...i,
          department: res.department || undefined,
          jobTitle: res.title || undefined,
          adLookupAt: now,
        }
      })
      await saveItems(updated)
      await log(`AD-Daten aktualisiert (Auswahl): ${resolved} aufgeloest, ${notFound} nicht gefunden (${activeCategory})`)
      setAdEnrichStatus(`${resolved} Benutzer aufgeloest${notFound > 0 ? `, ${notFound} nicht in AD gefunden` : ''}.`)
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
          <button onClick={loadItems} className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

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
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
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
                              <p className="text-sm font-medium text-foreground font-mono truncate">{item.name}</p>
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                {item.ip && <span className="text-[10px] text-muted-foreground">{item.ip}</span>}
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
                                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-muted/30 text-foreground border border-border whitespace-nowrap">
                                      {item.assignedTo}
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

      {/* Import replace confirm */}
      {pendingReplace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-amber-500/40 rounded-xl p-5 w-[440px] shadow-2xl space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-foreground">Liste ersetzen?</h3>
            </div>
            <div className="text-xs text-muted-foreground space-y-2">
              <p>
                Die Datei enthält <strong className="text-foreground">{pendingReplace.names.length}</strong> Hostnamen.
              </p>
              <p>
                Die aktuelle Liste in <strong className="text-foreground">{activeCategory}</strong> enthält{' '}
                <strong className="text-foreground">{pendingReplace.previousCount}</strong> Einträge — diese werden{' '}
                <strong className="text-red-400">komplett ersetzt</strong>.
              </p>
              <p className="text-[11px] text-muted-foreground/80">
                Andere Kategorien bleiben unangetastet.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPendingReplace(null)}
                className="flex-1 py-2 text-sm rounded-lg border border-border hover:bg-accent text-muted-foreground">Abbrechen</button>
              <button onClick={confirmReplaceImport}
                className="flex-1 py-2 text-sm rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold">Ersetzen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
