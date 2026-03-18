import { useState } from 'react'
import { ArrowLeft, Download, FileSpreadsheet, FileText, Printer, Mail, CheckCircle, XCircle, Clock, Loader, FolderOpen, ChevronDown, ChevronRight, Paperclip } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { QUERY_DEFINITIONS } from '../utils/queries'
import { exportExcel, exportWord, exportPdf } from '../utils/exportUtils'
import { api } from '../electronAPI'
import type { QueryResult, QueryStatus } from '../types'

function StatusBadge({ status }: { status: QueryStatus }) {
  const map = {
    done:    { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle size={11} />, label: 'OK' },
    error:   { cls: 'bg-red-500/10 text-red-400 border-red-500/20',             icon: <XCircle size={11} />,    label: 'Fehler' },
    timeout: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',       icon: <Clock size={11} />,      label: 'Timeout' },
    running: { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',          icon: <Loader size={11} className="animate-spin" />, label: 'Läuft' },
    pending: { cls: 'bg-muted text-muted-foreground border-border',             icon: null,                     label: 'Ausstehend' },
  }
  const { cls, icon, label } = map[status] ?? map.pending
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border font-medium ${cls}`}>
      {icon}{label}
    </span>
  )
}

function getLabel(queryId: string) {
  return QUERY_DEFINITIONS.find((q) => q.id === queryId)?.label ?? queryId
}

function getCategory(queryId: string) {
  return QUERY_DEFINITIONS.find((q) => q.id === queryId)?.category ?? 'Sonstige'
}

export default function Results() {
  const setScreen = useAppStore((s) => s.setScreen)
  const results = useAppStore((s) => s.results)
  const settings = useAppStore((s) => s.settings)

  const [emailDialog, setEmailDialog] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailCc, setEmailCc] = useState('')
  const [emailSubject, setEmailSubject] = useState('IT-Abfrageergebnisse')
  const [emailBody, setEmailBody] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null)
  // FIX 3: Attachment option
  const [attachFile, setAttachFile] = useState(true)

  // FIX 6: sw_installed expandable search state
  const [swSearch, setSwSearch] = useState<Record<string, string>>({})
  const [swExpanded, setSwExpanded] = useState<Set<string>>(new Set())

  function toggleSwExpand(key: string) {
    setSwExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Group results by hostname
  const byHost = new Map<string, QueryResult[]>()
  for (const r of results) {
    if (!byHost.has(r.hostname)) byHost.set(r.hostname, [])
    byHost.get(r.hostname)!.push(r)
  }

  async function doExport(format: 'xlsx' | 'docx' | 'pdf') {
    const ext = format
    const defaultName = `IT-Report_${new Date().toISOString().slice(0, 10)}.${ext}`
    const savePath = await api().saveFileDialog(
      `${settings.exportPath}/${defaultName}`,
      [{ name: format.toUpperCase(), extensions: [ext] }]
    )
    if (!savePath) return

    setExporting(true)
    setExportError('')
    setLastSavedPath(null)
    try {
      if (format === 'xlsx') await exportExcel(results, savePath)
      if (format === 'docx') await exportWord(results, savePath)
      if (format === 'pdf')  await exportPdf(results, savePath)
      // Success — remember path so user can open the file
      setLastSavedPath(savePath)
    } catch (err) {
      setExportError(String(err))
    } finally {
      setExporting(false)
    }
  }

  // FIX 3: sendMail now uses Outlook COM (with attachment support), falls back to mailto:
  async function sendMail() {
    const defaultBody = `IT-Abfrageergebnisse vom ${new Date().toLocaleString('de-DE')}\n\nBitte Anhang beachten.`
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setScreen('query-menu')} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">Ergebnis-Anzeige</h1>
            <p className="text-xs text-muted-foreground">{results.length} Ergebnis(se) für {byHost.size} Gerät(e)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => doExport('xlsx')} disabled={exporting} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50">
            <FileSpreadsheet size={13} className="text-emerald-400" /> Excel
          </button>
          <button onClick={() => doExport('docx')} disabled={exporting} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50">
            <FileText size={13} className="text-blue-400" /> Word
          </button>
          <button onClick={() => doExport('pdf')} disabled={exporting} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground transition-colors disabled:opacity-50">
            <Printer size={13} className="text-red-400" /> PDF
          </button>
          {/* FIX 3: Mail button only active after export */}
          <button
            onClick={() => { setAttachFile(true); setEmailDialog(true) }}
            disabled={!lastSavedPath}
            title={lastSavedPath ? 'Per E-Mail versenden' : 'Erst exportieren, dann per Mail versenden'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Mail size={13} /> E-Mail
          </button>
        </div>
      </div>

      {/* Export feedback bar */}
      {(lastSavedPath || exportError) && (
        <div className={`flex items-center gap-3 px-6 py-2.5 text-sm shrink-0 ${exportError ? 'bg-destructive/10 border-b border-destructive/20' : 'bg-emerald-500/10 border-b border-emerald-500/20'}`}>
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

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {[...byHost.entries()].map(([hostname, hostResults]) => {
          const byCategory = new Map<string, QueryResult[]>()
          for (const r of hostResults) {
            const cat = getCategory(r.queryId)
            if (!byCategory.has(cat)) byCategory.set(cat, [])
            byCategory.get(cat)!.push(r)
          }

          return (
            <div key={hostname} className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
                <span className="font-mono text-sm font-semibold text-primary">{hostname}</span>
                <span className="text-xs text-muted-foreground">
                  {hostResults.filter((r) => r.status === 'done').length}/{hostResults.length} OK
                </span>
              </div>

              {[...byCategory.entries()].map(([cat, catResults]) => (
                <div key={cat}>
                  <div className="px-4 py-2 bg-muted/20 border-b border-border">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{cat}</p>
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      {catResults.map((r) => {
                        // FIX 6: Special expandable panel for sw_installed
                        if (r.queryId === 'sw_installed' && r.status === 'done' && r.output) {
                          const swKey = `${hostname}::sw_installed`
                          const isExpanded = swExpanded.has(swKey)
                          const searchTerm = swSearch[swKey] ?? ''

                          let swItems: Array<{ DisplayName: string; DisplayVersion?: string; Publisher?: string; InstallDate?: string }> | null = null
                          try {
                            const parsed = JSON.parse(r.output)
                            const raw: typeof swItems = Array.isArray(parsed) ? parsed : [parsed]
                            // PROBLEM 3 FIX: PS-interne Felder (PSComputerName, RunspaceId,
                            // PSShowComputerName etc.) filtern – nur Einträge mit DisplayName behalten.
                            // Diese Felder können durch Invoke-Command in manchen PS-Versionen
                            // an die JSON-Ausgabe angehängt werden.
                            swItems = raw.filter((item) => item.DisplayName && String(item.DisplayName).trim() !== '')
                          } catch {
                            // JSON parse failed, fall back to raw output
                          }

                          if (swItems) {
                            const filtered = searchTerm
                              ? swItems.filter((item) =>
                                  item.DisplayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                  item.Publisher?.toLowerCase().includes(searchTerm.toLowerCase())
                                )
                              : swItems

                            return (
                              <tr key={r.queryId} className="hover:bg-accent/20 transition-colors">
                                <td colSpan={3} className="px-4 py-0">
                                  {/* Header row */}
                                  <div className="flex items-center gap-2 py-2.5">
                                    <button
                                      onClick={() => toggleSwExpand(swKey)}
                                      className="flex items-center gap-1.5 text-foreground text-xs hover:text-primary transition-colors"
                                    >
                                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                      <span>{getLabel(r.queryId)}</span>
                                    </button>
                                    <div className="ml-2">
                                      <StatusBadge status={r.status} />
                                    </div>
                                    <span className="text-[11px] text-muted-foreground ml-2">
                                      {swItems.length} Programme
                                    </span>
                                  </div>
                                  {/* Expanded panel */}
                                  {isExpanded && (
                                    <div className="pb-3 space-y-2">
                                      <input
                                        type="text"
                                        placeholder="Software suchen…"
                                        value={searchTerm}
                                        onChange={(e) => setSwSearch(prev => ({ ...prev, [swKey]: e.target.value }))}
                                        className="w-full max-w-sm px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                                      />
                                      <div className="text-[11px] text-muted-foreground">
                                        {filtered.length} von {swItems.length} Einträgen
                                      </div>
                                      <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                                        <table className="w-full text-[11px]">
                                          <thead className="sticky top-0 bg-card">
                                            <tr className="border-b border-border">
                                              <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Name</th>
                                              <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Version</th>
                                              <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Hersteller</th>
                                              <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Installiert</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-border">
                                            {filtered.map((item, idx) => (
                                              <tr key={idx} className="hover:bg-accent/20">
                                                <td className="px-3 py-1.5 text-foreground font-medium">{item.DisplayName || '—'}</td>
                                                <td className="px-3 py-1.5 text-muted-foreground font-mono">{item.DisplayVersion || '—'}</td>
                                                <td className="px-3 py-1.5 text-muted-foreground">{item.Publisher || '—'}</td>
                                                <td className="px-3 py-1.5 text-muted-foreground">{item.InstallDate || '—'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )
                          }
                        }

                        // Default row for all other queries
                        return (
                          <tr key={r.queryId} className="hover:bg-accent/20 transition-colors">
                            <td className="px-4 py-2.5 w-56 shrink-0">
                              <span className="text-foreground text-xs">{getLabel(r.queryId)}</span>
                            </td>
                            <td className="px-2 py-2.5 w-20">
                              <StatusBadge status={r.status} />
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground max-w-0 w-full truncate">
                              <span className="block truncate" title={r.output || r.error || ''}>
                                {r.output || r.error || '—'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )
        })}

        {results.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Download size={40} className="opacity-20 mb-3" />
            <p className="text-sm">Noch keine Ergebnisse vorhanden</p>
            <button onClick={() => setScreen('query-menu')} className="mt-3 text-xs text-primary hover:underline">
              Zurück zum Abfrage-Menü
            </button>
          </div>
        )}
      </div>

      {/* Email dialog */}
      {emailDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-[440px] space-y-4 shadow-2xl">
            <h2 className="text-base font-semibold text-foreground">Per E-Mail versenden</h2>
            <div className="space-y-3">
              {[
                { label: 'An', value: emailTo, set: setEmailTo, placeholder: 'empfaenger@firma.de' },
                { label: 'CC', value: emailCc, set: setEmailCc, placeholder: 'cc@firma.de' },
                { label: 'Betreff', value: emailSubject, set: setEmailSubject, placeholder: 'IT-Abfrageergebnisse' },
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
