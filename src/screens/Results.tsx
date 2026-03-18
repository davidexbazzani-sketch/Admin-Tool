import { useState } from 'react'
import { ArrowLeft, Download, FileSpreadsheet, FileText, Printer, Mail, CheckCircle, XCircle, Clock, Loader } from 'lucide-react'
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
  const [exporting, setExporting] = useState(false)

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
    try {
      if (format === 'xlsx') await exportExcel(results, savePath)
      if (format === 'docx') await exportWord(results, savePath)
      if (format === 'pdf') await exportPdf(results, savePath)
    } finally {
      setExporting(false)
    }
  }

  function sendMail() {
    const body = `IT-Abfrageergebnisse vom ${new Date().toLocaleString('de-DE')}\n\nBitte Anhang beachten.`
    const url = `mailto:${encodeURIComponent(emailTo)}?cc=${encodeURIComponent(emailCc)}&subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(body)}`
    api().openExternal(url)
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
          <button onClick={() => setEmailDialog(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <Mail size={13} /> E-Mail
          </button>
        </div>
      </div>

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
                      {catResults.map((r) => (
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
                      ))}
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
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEmailDialog(false)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors">Abbrechen</button>
              <button onClick={sendMail} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Senden</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
