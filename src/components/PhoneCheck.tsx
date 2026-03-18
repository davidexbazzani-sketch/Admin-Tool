import { useState } from 'react'
import {
  Plus, Minus, Search, Upload, CheckCircle, XCircle, FolderOpen,
  FileSpreadsheet, FileText, Printer, Mail, Paperclip,
} from 'lucide-react'
import { checkPhoneNumbers, PHONE_FIELD_LABELS, type PhoneCheckEntry } from '../utils/phoneUtils'
import {
  exportExcelPhoneCheck,
  exportWordPhoneCheck,
  exportPdfPhoneCheck,
} from '../utils/exportUtils'
import {
  openFileForImport,
  parseExcelSheet,
  extractPhoneNumbersFromText,
  extractPhonesFromExcel,
  type ExcelSheetData,
} from '../utils/fileImport'
import { api } from '../electronAPI'
import type { AppSettings } from '../types'
import Card from './Card'
import Spinner from './Spinner'
import PhoneColumnDialog from './PhoneColumnDialog'

function makeId() { return Math.random().toString(36).slice(2) }

type InputTab = 'single' | 'list' | 'file'

const SUPPORTED_EXTS = ['xlsx', 'xls', 'csv', 'docx', 'pdf']

interface Props {
  settings: AppSettings
}

export default function PhoneCheck({ settings }: Props) {
  const [tab, setTab] = useState<InputTab>('single')

  // Single input
  const [singleInput, setSingleInput] = useState('')

  // List input
  const [listItems, setListItems] = useState([{ id: makeId(), value: '' }])

  // File import
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [importedNumbers, setImportedNumbers] = useState<string[]>([])
  const [pendingExcel, setPendingExcel] = useState<ExcelSheetData | null>(null)

  // Query
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<PhoneCheckEntry[]>([])

  // Export
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null)

  // Email dialog
  const [emailDialog, setEmailDialog] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailCc, setEmailCc] = useState('')
  const [emailSubject, setEmailSubject] = useState('Rufnummern People Core Check – Ergebnisse')
  const [emailBody, setEmailBody] = useState('')
  // FIX 3: Attachment option
  const [attachFile, setAttachFile] = useState(true)

  // ── File import logic ────────────────────────────────────────────────────────

  async function processImportedFile(bytes: Uint8Array, ext: string) {
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      const sheetData = parseExcelSheet(bytes)
      if (sheetData.columns.length === 0) {
        setImportError('Keine Spalten in der Datei gefunden.')
        return
      }
      setPendingExcel(sheetData)
    } else if (ext === 'pdf' || ext === 'docx') {
      const found = extractPhoneNumbersFromText(bytes)
      if (found.length === 0) {
        setImportError('Keine Rufnummern in der Datei gefunden.')
        return
      }
      setImportedNumbers(found)
      setImportError('')
    } else {
      setImportError(`Nicht unterstütztes Dateiformat: .${ext}`)
    }
  }

  async function handleBrowse() {
    setImportError('')
    setImportLoading(true)
    try {
      const file = await openFileForImport()
      if (!file) return
      await processImportedFile(file.bytes, file.ext)
    } catch (err) {
      setImportError(String(err))
    } finally {
      setImportLoading(false)
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false)
  }

  // PROBLEM 1 FIX: Helper to extract filesystem path from a dropped File object.
  // Uses Electron's webUtils.getPathForFile (via electronDrop bridge) which is the
  // official API in Electron 28+. Falls back to File.path for older environments.
  function getDroppedFilePath(file: File): string {
    const electronDrop = (window as Window & { electronDrop?: { getPath: (f: File) => string } }).electronDrop
    return electronDrop
      ? electronDrop.getPath(file)
      : (file as File & { path?: string }).path ?? ''
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    const nativeFile = e.dataTransfer.files[0]
    if (!nativeFile) return
    const filePath = getDroppedFilePath(nativeFile)
    const ext = filePath.toLowerCase().split('.').pop() ?? ''
    if (!SUPPORTED_EXTS.includes(ext)) {
      setImportError('Dieses Dateiformat wird nicht unterstützt.')
      return
    }
    setImportError('')
    setImportLoading(true)
    try {
      const readResult = await api().readFile(filePath)
      if (!readResult.success || !readResult.data) throw new Error(readResult.error ?? 'Lesefehler')
      const binaryStr = atob(readResult.data)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
      await processImportedFile(bytes, ext)
    } catch (err) {
      setImportError(String(err))
    } finally {
      setImportLoading(false)
    }
  }

  // PROBLEM 1 + FIX 4: Card-level drag handlers – auto-switch to 'file' tab on any drag,
  // and use getDroppedFilePath for reliable path retrieval via webUtils.
  function handleCardDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (tab !== 'file') setTab('file')
    setIsDragOver(true)
  }

  function handleCardDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsDragOver(false)
    }
  }

  async function handleCardDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    const nativeFile = e.dataTransfer.files[0]
    if (!nativeFile) return
    const filePath = getDroppedFilePath(nativeFile)
    const ext = filePath.toLowerCase().split('.').pop() ?? ''
    if (!SUPPORTED_EXTS.includes(ext)) {
      setImportError('Dieses Dateiformat wird nicht unterstützt.')
      return
    }
    setImportError('')
    setImportLoading(true)
    try {
      const readResult = await api().readFile(filePath)
      if (!readResult.success || !readResult.data) throw new Error(readResult.error ?? 'Lesefehler')
      const binaryStr = atob(readResult.data)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
      await processImportedFile(bytes, ext)
    } catch (err) {
      setImportError(String(err))
    } finally {
      setImportLoading(false)
    }
  }

  function handleExcelConfirm(phoneColNames: string[]) {
    if (!pendingExcel) return
    const found = extractPhonesFromExcel(pendingExcel.rows, phoneColNames)
    if (found.length === 0) {
      setImportError('In den ausgewählten Spalten wurden keine Rufnummern gefunden.')
    } else {
      setImportedNumbers(found)
      setImportError('')
    }
    setPendingExcel(null)
  }

  // ── Run query ────────────────────────────────────────────────────────────────

  function collectNumbers(): string[] {
    if (tab === 'single') return [singleInput.trim()].filter(Boolean)
    if (tab === 'list') return listItems.map((i) => i.value.trim()).filter(Boolean)
    return importedNumbers
  }

  async function run() {
    const numbers = collectNumbers()
    if (numbers.length === 0) {
      setError('Bitte mindestens eine Rufnummer eingeben.')
      return
    }
    setError('')
    setLoading(true)
    setResults([])
    try {
      const data = await checkPhoneNumbers(numbers)
      setResults(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  // ── Export ───────────────────────────────────────────────────────────────────

  async function doExport(format: 'xlsx' | 'docx' | 'pdf') {
    const ext = format
    const defaultName = `PhoneCheck_${new Date().toISOString().slice(0, 10)}.${ext}`
    const savePath = await api().saveFileDialog(
      `${settings.exportPath}/${defaultName}`,
      [{ name: format.toUpperCase(), extensions: [ext] }]
    )
    if (!savePath) return
    setExporting(true)
    setExportError('')
    setLastSavedPath(null)
    try {
      if (format === 'xlsx') await exportExcelPhoneCheck(results, savePath)
      if (format === 'docx') await exportWordPhoneCheck(results, savePath)
      if (format === 'pdf')  await exportPdfPhoneCheck(results, savePath)
      setLastSavedPath(savePath)
    } catch (err) {
      setExportError(String(err))
    } finally {
      setExporting(false)
    }
  }

  // FIX 3: sendMail now uses Outlook COM (with attachment support), falls back to mailto:
  async function sendMail() {
    const defaultBody = `Rufnummern People Core Check – Ergebnisse vom ${new Date().toLocaleString('de-DE')}\n\nBitte Anhang beachten.`
    const body = emailBody.trim() || defaultBody
    await api().composeEmail({
      to: emailTo,
      cc: emailCc,
      subject: emailSubject,
      body,
      attachmentPath: attachFile && lastSavedPath ? lastSavedPath : undefined,
    })
    setEmailDialog(false)
  }

  // ── Counts ───────────────────────────────────────────────────────────────────
  const foundCount   = results.filter((r) => r.found).length
  const missing      = results.filter((r) => !r.found).length

  const TABS: { id: InputTab; label: string }[] = [
    { id: 'single', label: 'Einzelne Rufnummer' },
    { id: 'list',   label: 'Liste' },
    { id: 'file',   label: 'Datei importieren' },
  ]

  // FIX 3: Mail button only active after export
  const exportActions = results.length > 0 ? (
    <div className="flex items-center gap-1.5">
      <button onClick={() => doExport('xlsx')} disabled={exporting} title="Excel exportieren"
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50">
        <FileSpreadsheet size={13} className="text-emerald-400" /> Excel
      </button>
      <button onClick={() => doExport('docx')} disabled={exporting} title="Word exportieren"
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50">
        <FileText size={13} className="text-blue-400" /> Word
      </button>
      <button onClick={() => doExport('pdf')} disabled={exporting} title="PDF exportieren"
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50">
        <Printer size={13} className="text-red-400" /> PDF
      </button>
      <button
        onClick={() => { setAttachFile(true); setEmailDialog(true) }}
        disabled={!lastSavedPath}
        title={lastSavedPath ? 'Per E-Mail versenden' : 'Erst exportieren, dann per Mail versenden'}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        <Mail size={13} /> E-Mail
      </button>
    </div>
  ) : undefined

  return (
    // FIX 4: Wrap root in a div with card-level drag handlers so any drag anywhere
    // on the PhoneCheck component auto-switches to the file tab
    <div
      onDragOver={handleCardDragOver}
      onDragLeave={handleCardDragLeave}
      onDrop={handleCardDrop}
      className="contents"
    >
      <Card
        title="🔍 Rufnummern People Core Check"
        subtitle="AD-Abfrage für Rufnummern (telephoneNumber, mobile, ipPhone u.a.) — nur Admins"
      >
        {/* Tab selector */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setImportError(''); setError('') }}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Single input ── */}
        {tab === 'single' && (
          <input
            type="text"
            placeholder="+49 40 3012345 oder 040 3012345 …"
            value={singleInput}
            onChange={(e) => setSingleInput(e.target.value)}
            className="w-full max-w-sm px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        )}

        {/* ── List input ── */}
        {tab === 'list' && (
          <div className="space-y-2 max-w-sm">
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {listItems.map((item) => (
                <div key={item.id} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="+49 40 3012345 …"
                    value={item.value}
                    onChange={(e) => setListItems((l) => l.map((i) => i.id === item.id ? { ...i, value: e.target.value } : i))}
                    className="flex-1 px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => setListItems((l) => l.filter((i) => i.id !== item.id))}
                    disabled={listItems.length === 1}
                    className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-30"
                  >
                    <Minus size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setListItems((l) => [...l, { id: makeId(), value: '' }])}
              className="flex items-center gap-1 text-xs text-primary"
            >
              <Plus size={13} /> Hinzufügen
            </button>
          </div>
        )}

        {/* ── File import ── */}
        {tab === 'file' && (
          <div className="space-y-3">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                flex flex-col items-center justify-center py-6 gap-2.5 rounded-lg border-2 border-dashed
                transition-all duration-150 select-none max-w-md
                ${isDragOver
                  ? 'border-primary bg-primary/10 scale-[1.01]'
                  : 'border-border hover:border-primary/40 hover:bg-muted/20'
                }
              `}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isDragOver ? 'bg-primary/20' : 'bg-primary/10'}`}>
                <Upload size={18} className="text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {isDragOver ? 'Datei loslassen…' : 'Datei hier hineinziehen'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">oder auf „Durchsuchen" klicken</p>
              </div>
              <button
                onClick={handleBrowse}
                disabled={importLoading}
                className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {importLoading ? 'Lese…' : 'Durchsuchen'}
              </button>
            </div>

            {importError && <p className="text-xs text-destructive">{importError}</p>}

            {importedNumbers.length > 0 && (
              <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-xs text-emerald-400 font-medium">
                  {importedNumbers.length} Rufnummer(n) erkannt
                </p>
                <div className="mt-1.5 max-h-28 overflow-y-auto space-y-0.5">
                  {importedNumbers.map((n, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground font-mono">{n}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Run button ── */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? <Spinner size={14} /> : <Search size={14} />}
            {loading ? 'AD wird abgefragt…' : 'People Core Check starten'}
          </button>
          {loading && (
            <p className="text-xs text-muted-foreground">
              Alle aktiven AD-Benutzer werden geprüft — das kann bis zu 90 Sekunden dauern…
            </p>
          )}
          {error && !loading && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </Card>

      {/* ── Results ── */}
      {results.length > 0 && (
        <>
          <Card
            title={`Ergebnisse (${results.length} Rufnummer(n) geprüft: ${foundCount} gefunden, ${missing} nicht gefunden)`}
            actions={exportActions}
          >
            <div className="overflow-x-auto overflow-y-auto max-h-[55vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Rufnummer (Eingabe)</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Name</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Benutzername</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">AD-Feld</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Hinterlegte Nummer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-accent/20 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-xs text-foreground">{r.inputNumber}</td>
                      <td className="px-3 py-2.5">
                        {r.found ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                            <CheckCircle size={10} /> Gefunden
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
                            <XCircle size={10} /> Nicht gefunden
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-foreground">{r.displayName || '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.samAccountName || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {r.matchedField ? (PHONE_FIELD_LABELS[r.matchedField] ?? r.matchedField) : '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.matchedValue || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Export feedback */}
          {(lastSavedPath || exportError) && (
            <div className={`flex items-center gap-3 px-4 py-2.5 text-sm rounded-xl border ${exportError ? 'bg-destructive/10 border-destructive/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
              {exportError ? (
                <>
                  <XCircle size={14} className="text-destructive shrink-0" />
                  <span className="text-destructive flex-1 truncate">{exportError}</span>
                  <button onClick={() => setExportError('')} className="text-destructive/70 hover:text-destructive text-xs">✕</button>
                </>
              ) : (
                <>
                  <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                  <span className="text-emerald-400 flex-1 truncate font-mono text-xs">{lastSavedPath}</span>
                  <button
                    onClick={() => api().openPath(lastSavedPath!)}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors shrink-0 font-medium"
                  >
                    <FolderOpen size={12} /> Datei öffnen
                  </button>
                  <button onClick={() => setLastSavedPath(null)} className="text-emerald-400/60 hover:text-emerald-400 text-xs ml-1">✕</button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Excel column picker ── */}
      {pendingExcel && (
        <PhoneColumnDialog
          columns={pendingExcel.columns}
          onConfirm={handleExcelConfirm}
          onCancel={() => setPendingExcel(null)}
        />
      )}

      {/* ── Email dialog ── */}
      {emailDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-[440px] space-y-4 shadow-2xl">
            <h2 className="text-base font-semibold text-foreground">Per E-Mail versenden</h2>
            <div className="space-y-3">
              {[
                { label: 'An',      value: emailTo,      set: setEmailTo,      placeholder: 'empfaenger@firma.de' },
                { label: 'CC',      value: emailCc,      set: setEmailCc,      placeholder: 'cc@firma.de' },
                { label: 'Betreff', value: emailSubject, set: setEmailSubject, placeholder: 'Rufnummern People Core Check' },
              ].map(({ label, value, set, placeholder }) => (
                <div key={label}>
                  <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Nachricht <span className="text-muted-foreground/50">(optional)</span>
              </label>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Begleittext für die E-Mail…"
                rows={4}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
              />
            </div>
            {/* FIX 3: Attachment option */}
            {lastSavedPath && (
              <div className="p-3 rounded-md bg-muted/30 border border-border space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attachFile}
                    onChange={(e) => setAttachFile(e.target.checked)}
                    className="accent-primary"
                  />
                  <span className="text-sm text-foreground">Exportierte Datei anhängen</span>
                </label>
                {attachFile && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono pl-5">
                    <Paperclip size={11} className="shrink-0" />
                    <span className="truncate">{lastSavedPath.split(/[\\/]/).pop()}</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEmailDialog(false)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors">Abbrechen</button>
              <button onClick={sendMail} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Senden</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
