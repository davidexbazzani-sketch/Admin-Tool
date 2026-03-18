import { useState, useRef } from 'react'
import {
  Plus, Minus, Search, Phone, Smartphone, User,
  FileSpreadsheet, FileText, Printer, Mail, CheckCircle, XCircle, FolderOpen, Paperclip,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { queryXelionUser, queryAllEmployees, type XelionResult } from '../utils/adUtils'
import { exportExcelXelion, exportWordXelion, exportPdfXelion } from '../utils/exportUtils'
import { api } from '../electronAPI'
import Spinner from '../components/Spinner'
import Card from '../components/Card'
import PhoneCheck from '../components/PhoneCheck'

type Tab = 'single' | 'list' | 'all'

function makeId() { return Math.random().toString(36).slice(2) }

export default function XelionCheck() {
  const settings = useAppStore((s) => s.settings)
  const isAdmin = useAppStore((s) => s.isAdmin)

  const [tab, setTab] = useState<Tab>('single')
  const [singleInput, setSingleInput] = useState('')
  const [listItems, setListItems] = useState([{ id: makeId(), value: '' }])

  const [options, setOptions] = useState({
    showNumbers: true,
    noXelionButMobile: false,
    showPwdLastSet: false,
  })

  const [results, setResults] = useState<XelionResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // FIX 2: Cancel support
  const cancelledRef = useRef(false)
  const [cancelled, setCancelled] = useState(false)

  // Export state
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null)

  // FIX 3: Email dialog state – now includes attachment option
  const [emailDialog, setEmailDialog] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailCc, setEmailCc] = useState('')
  const [emailSubject, setEmailSubject] = useState('Diensthandy & Xelion – Abfrageergebnisse')
  const [emailBody, setEmailBody] = useState('')
  const [attachFile, setAttachFile] = useState(true) // attach exported file by default

  // FIX 2: Cancel running queries
  async function cancelQuery() {
    cancelledRef.current = true
    await api().cancelAll()
    setLoading(false)
    setCancelled(true)
  }

  async function run() {
    setError('')
    setCancelled(false)
    cancelledRef.current = false
    setLoading(true)
    setResults([])
    try {
      if (tab === 'all') {
        const data = await queryAllEmployees('Hermann Blohm', settings.adDomain)
        if (!cancelledRef.current) {
          let filtered = data
          if (options.noXelionButMobile) filtered = filtered.filter((r) => r.hasAnyPhone && !r.hasXelion)
          setResults(filtered)
        }
      } else {
        // FIX 2: Process items one by one to support cancellation mid-run
        const items: string[] = tab === 'single'
          ? [singleInput.trim()].filter(Boolean)
          : listItems.map((i) => i.value.trim()).filter(Boolean)

        const accumulated: XelionResult[] = []
        for (const v of items) {
          if (cancelledRef.current) break
          try {
            const result = await queryXelionUser(v, settings.adDomain)
            accumulated.push(result)
            // Show partial results as they come in
            const filtered = options.noXelionButMobile
              ? accumulated.filter((r) => r.hasAnyPhone && !r.hasXelion)
              : [...accumulated]
            setResults(filtered)
          } catch {
            // Skip failed items, continue with rest
          }
        }
      }
    } catch (err) {
      if (!cancelledRef.current) setError(String(err))
    } finally {
      setLoading(false)
      if (cancelledRef.current) setCancelled(true)
    }
  }

  async function doExport(format: 'xlsx' | 'docx' | 'pdf') {
    const ext = format
    const defaultName = `Xelion_${new Date().toISOString().slice(0, 10)}.${ext}`
    const savePath = await api().saveFileDialog(
      `${settings.exportPath}/${defaultName}`,
      [{ name: format.toUpperCase(), extensions: [ext] }]
    )
    if (!savePath) return

    setExporting(true)
    setExportError('')
    setLastSavedPath(null)
    try {
      const opts = { showNumbers: options.showNumbers, showPwdLastSet: options.showPwdLastSet }
      if (format === 'xlsx') await exportExcelXelion(results, opts, savePath)
      if (format === 'docx') await exportWordXelion(results, opts, savePath)
      if (format === 'pdf')  await exportPdfXelion(results, opts, savePath)
      setLastSavedPath(savePath)
    } catch (err) {
      setExportError(String(err))
    } finally {
      setExporting(false)
    }
  }

  // FIX 3: sendMail now uses Outlook COM (with attachment support), falls back to mailto:
  async function sendMail() {
    const defaultBody = `Diensthandy & Xelion – Abfrageergebnisse vom ${new Date().toLocaleString('de-DE')}\n\nBitte Anhang beachten.`
    const body = emailBody.trim() || defaultBody
    await api().composeEmail({
      to: emailTo,
      cc: emailCc,
      subject: emailSubject,
      body,
      // Attach the exported file only if user checked the option and export exists
      attachmentPath: attachFile && lastSavedPath ? lastSavedPath : undefined,
    })
    setEmailDialog(false)
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'single', label: 'Einzelabfrage' },
    { id: 'list', label: 'Liste' },
    { id: 'all', label: 'Alle Mitarbeiter' },
  ]

  // FIX 3: Export action buttons – mail button only active after successful export
  const exportActions = results.length > 0 ? (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => doExport('xlsx')}
        disabled={exporting}
        title="Als Excel exportieren"
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50"
      >
        <FileSpreadsheet size={13} className="text-emerald-400" /> Excel
      </button>
      <button
        onClick={() => doExport('docx')}
        disabled={exporting}
        title="Als Word exportieren"
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50"
      >
        <FileText size={13} className="text-blue-400" /> Word
      </button>
      <button
        onClick={() => doExport('pdf')}
        disabled={exporting}
        title="Als PDF exportieren"
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50"
      >
        <Printer size={13} className="text-red-400" /> PDF
      </button>
      {/* FIX 3: Mail button only active after export */}
      <button
        onClick={() => { setAttachFile(true); setEmailDialog(true) }}
        disabled={!lastSavedPath}
        title={lastSavedPath ? 'Per E-Mail versenden' : 'Erst exportieren, dann per Mail versenden'}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Mail size={13} /> E-Mail
      </button>
    </div>
  ) : undefined

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">📱 Diensthandy & Xelion</h1>
        <p className="text-sm text-muted-foreground mt-1">AD-Abfrage für Telefonnummern und Xelion-Accounts</p>
      </div>

      <Card title="Eingabe">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="mt-3">
          {tab === 'single' && (
            <input
              type="text"
              placeholder="Name oder Corp-ID..."
              value={singleInput}
              onChange={(e) => setSingleInput(e.target.value)}
              className="w-full max-w-sm px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          )}
          {tab === 'list' && (
            <div className="space-y-2 max-w-sm">
              {listItems.map((item) => (
                <div key={item.id} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Name oder Corp-ID..."
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
              <button
                onClick={() => setListItems((l) => [...l, { id: makeId(), value: '' }])}
                className="flex items-center gap-1 text-xs text-primary"
              >
                <Plus size={13} /> Hinzufügen
              </button>
            </div>
          )}
          {tab === 'all' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Standort:</span>
              <span className="font-medium text-foreground">Hamburg – Hermann Blohm Strasse</span>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="flex flex-wrap gap-4 pt-2 border-t border-border mt-2">
          {[
            { key: 'showNumbers', label: 'Alle hinterlegten Rufnummern anzeigen' },
            { key: 'noXelionButMobile', label: 'Kein Xelion Account aber Diensthandy vorhanden' },
            { key: 'showPwdLastSet', label: 'Passwort zuletzt zurückgesetzt' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options[key as keyof typeof options]}
                onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))}
                className="accent-primary"
              />
              <span className="text-sm text-foreground">{label}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? <Spinner size={14} /> : <Search size={14} />}
            Abfrage starten
          </button>
          {/* FIX 2: Cancel button */}
          <button
            onClick={cancelQuery}
            disabled={!loading}
            title="Laufende Abfrage sofort stoppen"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/80 text-destructive-foreground text-sm font-semibold hover:bg-destructive transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <XCircle size={14} />
            Abbrechen
          </button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {/* FIX 2: Cancellation notice */}
        {cancelled && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg mt-1">
            <XCircle size={13} className="text-amber-400 shrink-0" />
            <span className="text-xs text-amber-400 flex-1">Abfrage wurde abgebrochen. Teilergebnisse werden angezeigt.</span>
            <button onClick={() => setCancelled(false)} className="text-amber-400/60 hover:text-amber-400 text-xs">✕</button>
          </div>
        )}
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <>
          <Card title={`Ergebnisse (${results.length})`} actions={exportActions}>
            <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Name</th>
                    {options.showNumbers && (
                      <>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">
                          <span className="flex items-center gap-1"><Phone size={11} /> Telefon</span>
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">
                          <span className="flex items-center gap-1"><Smartphone size={11} /> Mobil</span>
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">IP-Phone</th>
                      </>
                    )}
                    {options.showPwdLastSet && (
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">PW zuletzt geändert</th>
                    )}
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-accent/20 transition-colors">
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2 text-foreground font-medium">
                          <User size={13} className="text-muted-foreground" />{r.name}
                        </span>
                      </td>
                      {options.showNumbers && (
                        <>
                          <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.telephoneNumber || '—'}</td>
                          <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.mobile || '—'}</td>
                          <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.ipPhone || '—'}</td>
                        </>
                      )}
                      {options.showPwdLastSet && (
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.pwdLastSet || '—'}</td>
                      )}
                      <td className="px-3 py-2.5">
                        {r.hasAnyPhone && !r.hasXelion ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            📱 Kein Xelion
                          </span>
                        ) : r.hasXelion ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            ✓ Xelion aktiv
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground border border-border">
                            Keine Daten
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Export feedback bar */}
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

      {/* Phone Check – admin only */}
      {isAdmin && <PhoneCheck settings={settings} />}

      {/* FIX 3: Email dialog with attachment option */}
      {emailDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-[460px] space-y-4 shadow-2xl">
            <h2 className="text-base font-semibold text-foreground">Per E-Mail versenden</h2>
            <div className="space-y-3">
              {[
                { label: 'An', value: emailTo, set: setEmailTo, placeholder: 'empfaenger@firma.de' },
                { label: 'CC', value: emailCc, set: setEmailCc, placeholder: 'cc@firma.de' },
                { label: 'Betreff', value: emailSubject, set: setEmailSubject, placeholder: 'Diensthandy & Xelion – Abfrageergebnisse' },
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
                rows={3}
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
