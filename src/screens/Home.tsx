import { useState } from 'react'
import { Plus, Minus, Upload, ArrowRight, Monitor, Hash, FileText, ChevronsRight } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import type { DeviceEntry, Prefix } from '../types'
import Card from '../components/Card'
import PrefixPopup from '../components/PrefixPopup'
import ExcelColumnDialog from '../components/ExcelColumnDialog'
import {
  openFileForImport,
  parseExcelSheet,
  extractFromExcel,
  extractFromTextBytes,
  type ExcelSheetData,
  type FileOpenResult,
} from '../utils/fileImport'
import { api } from '../electronAPI'

function makeId() {
  return Math.random().toString(36).slice(2)
}

function makeDevice(type: DeviceEntry['type']): DeviceEntry {
  return { id: makeId(), type, value: '', prefixes: [], customPrefix: '', resolvedHostnames: [] }
}

function resolveHostnames(d: DeviceEntry): string[] {
  if (d.type === 'hostname') return d.value.trim() ? [d.value.trim()] : []
  if (!d.value.trim()) return []
  const results: string[] = []
  for (const p of d.prefixes ?? []) {
    if (p === 'Sonstige') {
      const cp = d.customPrefix?.trim() ?? ''
      if (cp) results.push(`${cp}${d.value.trim()}`)
    } else {
      results.push(`${p}${d.value.trim()}`)
    }
  }
  if ((d.prefixes ?? []).length === 0) results.push(d.value.trim())
  return results
}

const SUPPORTED_EXTS = ['xlsx', 'xls', 'csv', 'docx', 'pdf']
const GLOBAL_PREFIX_BTNS: Prefix[] = ['DE', 'DEHAM', 'DESCH']

export default function Home() {
  const setScreen = useAppStore((s) => s.setScreen)
  const setDevices = useAppStore((s) => s.setDevices)

  // Single query
  const [singleHostname, setSingleHostname] = useState('')
  const [singleSerial, setSingleSerial] = useState('')
  const [singlePrefixes, setSinglePrefixes] = useState<Prefix[]>([])
  const [singleCustom, setSingleCustom] = useState('')

  // List
  const [hostnameRows, setHostnameRows] = useState<DeviceEntry[]>([makeDevice('hostname')])
  const [serialRows, setSerialRows] = useState<DeviceEntry[]>([makeDevice('serial')])

  // Global prefix multi-select
  const [globalPrefixes, setGlobalPrefixes] = useState<Prefix[]>([])

  // Import state
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState('')
  const [pendingExcelData, setPendingExcelData] = useState<ExcelSheetData | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  // ── helpers ──────────────────────────────────────────────────────────────────

  function updateHostnameRow(id: string, value: string) {
    setHostnameRows((rows) => rows.map((r) => (r.id === id ? { ...r, value } : r)))
  }
  function updateSerialRow(id: string, value: string) {
    setSerialRows((rows) => rows.map((r) => (r.id === id ? { ...r, value } : r)))
  }
  function updateSerialPrefixes(id: string, prefixes: Prefix[], customPrefix: string) {
    setSerialRows((rows) => rows.map((r) => (r.id === id ? { ...r, prefixes, customPrefix } : r)))
  }

  // Toggle one prefix in the global multi-select and apply to all serial rows
  function toggleGlobalPrefix(prefix: Prefix) {
    const next = globalPrefixes.includes(prefix)
      ? globalPrefixes.filter((p) => p !== prefix)
      : [...globalPrefixes, prefix]
    setGlobalPrefixes(next)
    setSerialRows((rows) => rows.map((r) => ({ ...r, prefixes: next })))
  }

  function clearGlobalPrefixes() {
    setGlobalPrefixes([])
    setSerialRows((rows) => rows.map((r) => ({ ...r, prefixes: [], customPrefix: '' })))
  }

  // Apply imported results to the lists
  function applyImportResults(hostnames: string[], serials: string[]) {
    if (hostnames.length > 0) {
      const newRows = hostnames.map((v) => ({ ...makeDevice('hostname'), value: v }))
      setHostnameRows((rows) => [...rows.filter((r) => r.value), ...newRows])
    }
    if (serials.length > 0) {
      const newRows = serials.map((v) => ({
        ...makeDevice('serial'),
        value: v,
        prefixes: globalPrefixes.length > 0 ? ([...globalPrefixes] as Prefix[]) : [],
      }))
      setSerialRows((rows) => [...rows.filter((r) => r.value), ...newRows])
    }
  }

  // Process a FileOpenResult (shared between dialog and drag-drop)
  async function processFile(file: FileOpenResult) {
    if (file.ext === 'xlsx' || file.ext === 'xls' || file.ext === 'csv') {
      const sheetData = parseExcelSheet(file.bytes)
      if (sheetData.columns.length === 0) {
        setImportError('Keine Spalten in der Datei gefunden.')
        return
      }
      setPendingExcelData(sheetData)
    } else if (file.ext === 'pdf' || file.ext === 'docx') {
      const { hostnames, serials } = extractFromTextBytes(file.bytes)
      applyImportResults(hostnames, serials)
    } else {
      setImportError(`Nicht unterstütztes Dateiformat: .${file.ext}`)
    }
  }

  // File-dialog import
  async function handleImport() {
    setImportError('')
    setImportLoading(true)
    try {
      const file = await openFileForImport()
      if (!file) return
      await processFile(file)
    } catch (err) {
      setImportError(String(err))
    } finally {
      setImportLoading(false)
    }
  }

  // Drag & Drop handlers
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    const nativeFile = e.dataTransfer.files[0]
    if (!nativeFile) return

    // PROBLEM 1 FIX: Use Electron webUtils.getPathForFile (exposed via electronDrop bridge).
    // In Electron 28+ with contextIsolation=true, File.path is unreliable.
    // electronDrop.getPath() uses the official webUtils API for correct path retrieval.
    const electronDrop = (window as Window & { electronDrop?: { getPath: (f: File) => string } }).electronDrop
    const filePath = electronDrop
      ? electronDrop.getPath(nativeFile)
      : (nativeFile as File & { path?: string }).path ?? ''
    const ext = filePath.toLowerCase().split('.').pop() ?? ''

    if (!SUPPORTED_EXTS.includes(ext)) {
      setImportError('Dieses Dateiformat wird nicht unterstützt.')
      return
    }

    setImportError('')
    setImportLoading(true)
    try {
      const readResult = await api().readFile(filePath)
      if (!readResult.success || !readResult.data) {
        throw new Error(readResult.error ?? 'Datei konnte nicht gelesen werden')
      }
      // Convert base64 → Uint8Array without Buffer
      const binaryStr = atob(readResult.data)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
      await processFile({ filePath, ext, bytes })
    } catch (err) {
      setImportError(String(err))
    } finally {
      setImportLoading(false)
    }
  }

  function handleColumnDialogConfirm(hostnameColNames: string[], serialColNames: string[]) {
    if (!pendingExcelData) return
    const { hostnames, serials } = extractFromExcel(
      pendingExcelData.rows,
      hostnameColNames,
      serialColNames
    )
    applyImportResults(hostnames, serials)
    setPendingExcelData(null)
  }

  // ── proceed to query ──────────────────────────────────────────────────────────

  function handleProceed() {
    const all: DeviceEntry[] = []

    if (singleHostname.trim()) {
      all.push({
        id: makeId(), type: 'hostname', value: singleHostname.trim(),
        resolvedHostnames: [singleHostname.trim()],
      })
    }
    if (singleSerial.trim()) {
      const d: DeviceEntry = {
        id: makeId(), type: 'serial', value: singleSerial.trim(),
        prefixes: singlePrefixes, customPrefix: singleCustom, resolvedHostnames: [],
      }
      d.resolvedHostnames = resolveHostnames(d)
      all.push(d)
    }
    for (const r of hostnameRows) {
      if (r.value.trim()) all.push({ ...r, resolvedHostnames: [r.value.trim()] })
    }
    for (const r of serialRows) {
      if (r.value.trim()) all.push({ ...r, resolvedHostnames: resolveHostnames(r) })
    }

    setDevices(all)
    setScreen('query-menu')
  }

  const hasInput =
    singleHostname.trim() ||
    singleSerial.trim() ||
    hostnameRows.some((r) => r.value.trim()) ||
    serialRows.some((r) => r.value.trim())

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Startbildschirm</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Geräte eingeben oder importieren, dann Abfrage starten
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Card 1: Einzelabfrage */}
        <Card title="Einzelabfrage" icon={<Monitor size={16} />} subtitle="Hostname oder Seriennummer">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Hostname</label>
              <input
                type="text"
                placeholder="z.B. DEHAM12345678"
                value={singleHostname}
                onChange={(e) => setSingleHostname(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Seriennummer</label>
              <div className="flex gap-2">
                <PrefixPopup
                  selectedPrefixes={singlePrefixes}
                  customPrefix={singleCustom}
                  onChange={(p, c) => { setSinglePrefixes(p); setSingleCustom(c) }}
                  serial={singleSerial}
                />
                <input
                  type="text"
                  placeholder="z.B. 12345678"
                  value={singleSerial}
                  onChange={(e) => setSingleSerial(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              {singleSerial && singlePrefixes.length > 0 && (
                <p className="text-xs text-primary mt-1 font-mono">
                  → {resolveHostnames({
                    id: '', type: 'serial', value: singleSerial,
                    prefixes: singlePrefixes, customPrefix: singleCustom, resolvedHostnames: [],
                  }).join(', ')}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Card 2: Datei-Import with Drag & Drop */}
        <Card title="Datei-Import" icon={<FileText size={16} />} subtitle=".xlsx, .xls, .csv, .docx, .pdf">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              flex flex-col items-center justify-center py-8 gap-3 rounded-lg border-2 border-dashed
              transition-all duration-150 select-none
              ${isDragOver
                ? 'border-primary bg-primary/10 scale-[1.01]'
                : 'border-border hover:border-primary/40 hover:bg-muted/20'
              }
            `}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isDragOver ? 'bg-primary/20' : 'bg-primary/10'}`}>
              <Upload size={22} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {isDragOver ? 'Datei loslassen…' : 'Datei hier hineinziehen'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                oder auf „Durchsuchen" klicken
              </p>
            </div>
            <button
              onClick={handleImport}
              disabled={importLoading}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {importLoading ? 'Importiere…' : 'Durchsuchen'}
            </button>
            {importError && (
              <p className="text-xs text-destructive text-center max-w-xs">{importError}</p>
            )}
          </div>
        </Card>
      </div>

      {/* Card 3: Liste erstellen */}
      <Card title="Liste erstellen" icon={<Hash size={16} />} subtitle="Mehrere Geräte auf einmal">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Hostnames */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Hostnames
              </p>
              <button
                onClick={() => setHostnameRows((r) => [...r, makeDevice('hostname')])}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <Plus size={13} /> Hinzufügen
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {hostnameRows.map((row) => (
                <div key={row.id} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Hostname..."
                    value={row.value}
                    onChange={(e) => updateHostnameRow(row.id, e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                  <button
                    onClick={() => setHostnameRows((r) => r.filter((x) => x.id !== row.id))}
                    disabled={hostnameRows.length === 1}
                    className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-30"
                  >
                    <Minus size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Seriennummern */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Seriennummern
              </p>
              <button
                onClick={() => setSerialRows((r) => [...r, makeDevice('serial')])}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <Plus size={13} /> Hinzufügen
              </button>
            </div>

            {/* Multi-select global prefix toggles */}
            <div className="flex items-start gap-2 mb-3 p-2 rounded-md bg-muted/30 border border-border">
              <ChevronsRight size={13} className="text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground mb-1.5">Präfix für alle:</p>
                <div className="flex flex-wrap gap-1">
                  {GLOBAL_PREFIX_BTNS.map((p) => (
                    <button
                      key={p}
                      onClick={() => toggleGlobalPrefix(p)}
                      className={`px-2 py-0.5 text-xs rounded border font-mono transition-colors ${
                        globalPrefixes.includes(p)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={clearGlobalPrefixes}
                    className="px-2 py-0.5 text-xs rounded border border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive transition-colors"
                  >
                    Keiner
                  </button>
                </div>
                {globalPrefixes.length > 0 && (
                  <p className="text-[10px] text-primary mt-1">
                    Aktiv: {globalPrefixes.join(', ')} → {globalPrefixes.length} Hostname(s) pro Seriennummer
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {serialRows.map((row) => (
                <div key={row.id} className="flex gap-2 items-center">
                  <PrefixPopup
                    selectedPrefixes={row.prefixes ?? []}
                    customPrefix={row.customPrefix ?? ''}
                    onChange={(p, c) => updateSerialPrefixes(row.id, p, c)}
                    serial={row.value}
                  />
                  <input
                    type="text"
                    placeholder="Seriennummer..."
                    value={row.value}
                    onChange={(e) => updateSerialRow(row.id, e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                  <button
                    onClick={() => setSerialRows((r) => r.filter((x) => x.id !== row.id))}
                    disabled={serialRows.length === 1}
                    className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-30"
                  >
                    <Minus size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>
      </Card>

      {/* CTA */}
      <div className="flex justify-end pb-2">
        <button
          onClick={handleProceed}
          disabled={!hasInput}
          className={`
            flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all
            ${hasInput
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
            }
          `}
        >
          Zur Abfrage
          <ArrowRight size={16} />
        </button>
      </div>

      {/* Excel column picker dialog */}
      {pendingExcelData && (
        <ExcelColumnDialog
          columns={pendingExcelData.columns}
          onConfirm={handleColumnDialogConfirm}
          onCancel={() => setPendingExcelData(null)}
        />
      )}
    </div>
  )
}
