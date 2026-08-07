import { useCallback, useEffect, useState } from 'react'
import {
  Boxes, Plus, RefreshCw, AlertTriangle, Loader2, ChevronRight, PackageCheck,
  Trash2, CheckCircle2, XCircle, FileSpreadsheet, PackageX,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import {
  listRuns, deleteRun, loadRun,
  type InventoryRunSummary,
} from '../services/hardwareInventory'
import ImportDialog from '../components/hardwareInventory/ImportDialog'
import ScanPanel from '../components/hardwareInventory/ScanPanel'
import ResultsView from '../components/hardwareInventory/ResultsView'
import LostDevicesView from '../components/hardwareInventory/LostDevicesView'

type View = { kind: 'list' } | { kind: 'scan'; runId: string } | { kind: 'results'; runId: string } | { kind: 'lost' }

const POLL_MS = 30000

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function HardwareInventory() {
  const user = useAuthStore(s => s.session?.user)
  const currentUserName = user?.displayName || user?.username || ''

  const [view, setView] = useState<View>({ kind: 'list' })
  const [runs, setRuns] = useState<InventoryRunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const reload = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const list = await listRuns()
      setRuns(list)
      setError('')
    } catch {
      setError('Inventur-Berichte konnten nicht geladen werden. Netzlaufwerk erreichbar?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload(true) }, [reload])
  useEffect(() => {
    if (view.kind !== 'list') return
    const t = setInterval(() => reload(false), POLL_MS)
    const onFocus = () => reload(false)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [reload, view.kind])

  async function handleOpenRun(runId: string) {
    const run = await loadRun(runId)
    if (!run) { setError('Bericht konnte nicht geladen werden.'); return }
    if (run.status === 'open') setView({ kind: 'scan', runId })
    else setView({ kind: 'results', runId })
  }

  async function handleDelete(id: string) {
    await deleteRun(id)
    setConfirmDeleteId(null)
    await reload(false)
  }

  if (view.kind === 'scan') {
    return (
      <ScanPanel
        runId={view.runId}
        currentUser={currentUserName}
        onBack={() => { setView({ kind: 'list' }); reload(false) }}
        onCompleted={() => setView({ kind: 'results', runId: view.runId })}
      />
    )
  }
  if (view.kind === 'results') {
    return (
      <ResultsView
        runId={view.runId}
        currentUser={currentUserName}
        onBack={() => { setView({ kind: 'list' }); reload(false) }}
      />
    )
  }
  if (view.kind === 'lost') {
    return <LostDevicesView currentUser={currentUserName} onBack={() => setView({ kind: 'list' })} />
  }

  // Liste
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <Boxes className="text-primary" size={22} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Hardware-Inventur</h1>
          <p className="text-[11px] text-muted-foreground">{runs.length} Berichte · alle 2 Wochen Lagerbestands-Abgleich gegen ServiceNow</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => reload(true)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-border" title="Aktualisieren"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => setView({ kind: 'lost' })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-amber-500/40 text-amber-300 hover:bg-amber-500/10" title="Verloren gemeldete Geräte verwalten">
            <PackageX size={14} />Verlorene Geräte
          </button>
          <button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90">
            <Plus size={14} />Neue Inventur starten
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0">
          <AlertTriangle size={14} />{error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {!loading && runs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Boxes size={48} className="opacity-30" />
            <p className="text-sm">Noch keine Inventur-Berichte.</p>
            <p className="text-xs opacity-70 max-w-md text-center">Klick auf „Neue Inventur starten", wähle den aktuellen ServiceNow-Export (Excel/CSV) und ordne die Spalten zu.</p>
            <button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90"><Plus size={14} />Erste Inventur starten</button>
          </div>
        )}

        <div className="space-y-2">
          {runs.map(r => {
            const isOpen = r.status === 'open'
            const allOk = r.missingCount === 0
            return (
              <div key={r.id} className={`rounded-lg border-l-4 ${isOpen ? 'border-l-blue-500' : allOk ? 'border-l-emerald-500' : 'border-l-amber-500'} border-y border-r border-border bg-card`}>
                <button onClick={() => handleOpenRun(r.id)} className="w-full text-left px-3 py-2.5 hover:bg-accent/20 flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    {isOpen
                      ? <FileSpreadsheet size={16} className="text-blue-400" />
                      : allOk
                        ? <CheckCircle2 size={16} className="text-emerald-400" />
                        : <XCircle size={16} className="text-amber-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground truncate">{r.title}</h3>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        isOpen ? 'bg-blue-500/15 text-blue-200'
                          : allOk ? 'bg-emerald-500 text-black'
                          : 'bg-amber-500/15 text-amber-200'
                      }`}>
                        {isOpen ? 'Offen' : allOk ? 'Vollständig' : `${r.missingCount} fehlend`}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {r.deviceCount} Geräte · {r.scannedCount} erfasst{r.extrasCount > 0 && <> · {r.extrasCount} unerwartete Scans</>}
                      <span className="ml-2 opacity-70">· Importiert {fmtDate(r.importedAt)} von {r.importedBy}</span>
                      {r.completedAt && <span className="ml-2 opacity-70">· Abgeschlossen {fmtDate(r.completedAt)} von {r.completedBy}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {confirmDeleteId === r.id ? (
                      <span className="inline-flex items-center gap-1 text-[11px]" onClick={e => e.stopPropagation()}>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id) }} className="px-2 py-1 rounded bg-red-500/20 text-red-300">Löschen</button>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }} className="px-2 py-1 rounded text-muted-foreground hover:bg-accent/40">Abbruch</button>
                      </span>
                    ) : (
                      <>
                        {!isOpen && <PackageCheck size={13} className="text-muted-foreground" />}
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(r.id) }} className="p-1.5 rounded text-muted-foreground hover:text-red-300 hover:bg-red-500/10" title="Löschen"><Trash2 size={12} /></button>
                        <ChevronRight size={14} className="text-muted-foreground" />
                      </>
                    )}
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {importOpen && (
        <ImportDialog
          currentUser={currentUserName}
          onClose={() => setImportOpen(false)}
          onCreated={(runId) => { setImportOpen(false); setView({ kind: 'scan', runId }) }}
        />
      )}

      {loading && runs.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-2"><Loader2 size={16} className="animate-spin" />Lade Berichte…</div>
      )}
    </div>
  )
}
