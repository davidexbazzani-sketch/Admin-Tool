// ── Drucker-Dossier: globaler Info-Button + große Übersicht ──────────────────
// <PrinterDossierProvider> einmal um die App legen. Überall wo ein Druckername
// steht: <PrinterInfoButton printerName={name} />
// Klick öffnet EIN gemeinsames Fenster mit ALLEN Drucker-Infos:
//   • Stammdaten (Wizard-Seed + frei editierbare Felder + Live-Scan)
//   • Aktionen (Warteschlange leeren, Neustart, Testseite … übers Netzwerk)
//   • Notizen & Dateien (datierte, signierte Einträge + Anhänge)

import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import {
  Info, X, Loader2, Upload, Paperclip, Trash2, ExternalLink, FileText, Printer,
  Plus, Zap, ListTree, Wrench, Users,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import {
  loadPrinterDossier, emptyPrinterDossier, printerKey, canonicalPrinter,
  pickAndStorePrinterFiles, openPrinterFile, deletePrinterFile, formatFileSize,
  addPrinterEntry, deletePrinterEntry, savePrinterMaster,
  type PrinterDossier, type PrinterDossierEntry, type PrinterMasterData, type DossierFile,
} from '../../services/printerDossier'
import { PrinterMasterData as PrinterMasterDataTab } from './PrinterMasterData'
import { PrinterActions } from './PrinterActions'
import { PrinterConnections } from './PrinterConnections'

interface PrinterDossierCtx { open: (printerName: string) => void }
const PrinterDossierContext = createContext<PrinterDossierCtx | null>(null)

/** Kleiner Info-Button hinter einem Druckernamen. Rendert nichts ohne Name/Provider. */
export function PrinterInfoButton({ printerName, className, size = 12 }: { printerName?: string | null; className?: string; size?: number }) {
  const ctx = useContext(PrinterDossierContext)
  const n = (printerName || '').trim()
  if (!ctx || !n) return null
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); e.preventDefault(); ctx.open(n) }}
      title={`Infos & Aktionen zu ${n}`}
      className={className ?? 'inline-flex items-center justify-center shrink-0 p-0.5 rounded text-muted-foreground/70 hover:text-blue-400 hover:bg-blue-500/10'}
    >
      <Info size={size} />
    </button>
  )
}

export function PrinterDossierProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<{ printerName: string } | null>(null)
  const open = useCallback((printerName: string) => setTarget({ printerName }), [])
  return (
    <PrinterDossierContext.Provider value={{ open }}>
      {children}
      {target && <PrinterDossierModal printerName={target.printerName} onClose={() => setTarget(null)} />}
    </PrinterDossierContext.Provider>
  )
}

function fmtDateTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function newId(): string { return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7) }

function PrinterDossierModal({ printerName, onClose }: { printerName: string; onClose: () => void }) {
  const authUser = useAuthStore(s => s.session?.user)
  const currentUser = authUser?.displayName || authUser?.username || 'unbekannt'
  const display = canonicalPrinter(printerName)

  const [dossier, setDossier] = useState<PrinterDossier | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [newText, setNewText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<DossierFile[]>([])
  const [tab, setTab] = useState<'info' | 'actions' | 'connections' | 'notes'>('info')
  const key = printerKey(printerName)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const d = await loadPrinterDossier(printerName)
      if (!cancelled) { setDossier(d ?? emptyPrinterDossier(printerName)); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [printerName])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  // Beim Wechsel auf den Notizen-Tab frisch laden — protokollierte Aktionen
  // (aus dem Aktionen-Tab) tauchen so sofort auf.
  useEffect(() => {
    if (tab !== 'notes') return
    let cancelled = false
    loadPrinterDossier(printerName).then(d => { if (!cancelled && d) setDossier(d) })
    return () => { cancelled = true }
  }, [tab, printerName])

  async function saveMaster(m: PrinterMasterData) {
    const updated = await savePrinterMaster(printerName, m, currentUser)
    setDossier(updated)
  }

  async function attachPending() {
    setBusy(true)
    try {
      const added = await pickAndStorePrinterFiles(key, currentUser)
      if (added.length) setPendingFiles(prev => [...prev, ...added])
    } finally { setBusy(false) }
  }
  async function removePending(id: string) {
    const f = pendingFiles.find(x => x.id === id)
    if (f) await deletePrinterFile(f.path)
    setPendingFiles(prev => prev.filter(x => x.id !== id))
  }
  async function addEntry() {
    if (!dossier) return
    const text = newText.trim()
    if (!text && pendingFiles.length === 0) return
    setBusy(true)
    try {
      const entry: PrinterDossierEntry = { id: newId(), text, createdAt: new Date().toISOString(), createdBy: currentUser, files: pendingFiles }
      const updated = await addPrinterEntry(printerName, entry, currentUser)
      setDossier(updated)
      setNewText(''); setPendingFiles([])
    } finally { setBusy(false) }
  }
  async function deleteEntry(id: string) {
    if (!dossier) return
    if (!window.confirm('Diesen Eintrag inkl. Anhängen wirklich löschen?')) return
    setBusy(true)
    try {
      const entry = dossier.entries.find(e => e.id === id)
      if (entry) for (const f of entry.files) await deletePrinterFile(f.path)
      const updated = await deletePrinterEntry(printerName, id, currentUser)
      setDossier(updated)
    } finally { setBusy(false) }
  }

  const entryCount = dossier?.entries.length ?? 0

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Kopf */}
        <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0">
            <Printer size={22} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-foreground truncate font-mono">{display}</h2>
            <p className="text-xs text-muted-foreground">
              Drucker-Dossier · {entryCount} {entryCount === 1 ? 'Eintrag' : 'Einträge'}
              {dossier?.master?.location && <span> · {dossier.master.location}</span>}
              {dossier?.master?.ip && <span className="font-mono"> · {dossier.master.ip}</span>}
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="shrink-0 px-6 border-b border-border flex items-center gap-1">
          <button type="button" onClick={() => setTab('info')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === 'info' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <ListTree size={13} />Stammdaten
          </button>
          <button type="button" onClick={() => setTab('actions')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === 'actions' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Wrench size={13} />Aktionen
          </button>
          <button type="button" onClick={() => setTab('connections')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === 'connections' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Users size={13} />Verbundene Geräte
          </button>
          <button type="button" onClick={() => setTab('notes')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === 'notes' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <FileText size={13} />Notizen &amp; Dateien{entryCount > 0 ? ` (${entryCount})` : ''}
          </button>
        </div>

        {/* Stammdaten — bleibt gemountet (nur ausgeblendet), damit nicht gespeicherte
            Eingaben beim Tab-Wechsel nicht verloren gehen. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4" style={{ display: tab === 'info' ? 'block' : 'none' }}>
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm py-16"><Loader2 size={14} className="animate-spin" />Lade Dossier…</div>
          ) : (
            <PrinterMasterDataTab printerName={display} master={dossier?.master} onSave={saveMaster} />
          )}
        </div>

        {/* Aktionen */}
        {tab === 'actions' && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <PrinterActions printerName={display} master={dossier?.master} currentUser={currentUser} />
          </div>
        )}

        {/* Verbundene Geräte/Personen */}
        {tab === 'connections' && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <PrinterConnections printerName={display} />
          </div>
        )}

        {/* Notizen & Dateien */}
        {tab === 'notes' && (<>
          <div className="shrink-0 px-6 py-3 border-b border-border bg-muted/5 space-y-2">
            <textarea value={newText} onChange={e => setNewText(e.target.value)} rows={3}
              placeholder="Neuer Eintrag: Notiz, Vorgang, Rückmeldung…"
              className="w-full px-3 py-2 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary leading-relaxed" />
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pendingFiles.map(f => (
                  <span key={f.id} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border bg-background text-foreground">
                    <Paperclip size={10} className="text-muted-foreground" />{f.name}
                    <button onClick={() => removePending(f.id)} className="text-muted-foreground hover:text-red-400"><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={attachPending} disabled={busy}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30 disabled:opacity-40">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}Dateien anhängen
              </button>
              <span className="text-[11px] text-muted-foreground">Alle Dateitypen · wird mit Datum &amp; deinem Namen gespeichert</span>
              <button onClick={addEntry} disabled={busy || (!newText.trim() && pendingFiles.length === 0)}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
                <Plus size={13} />Eintrag hinzufügen
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm py-16"><Loader2 size={14} className="animate-spin" />Lade Dossier…</div>
            ) : entryCount === 0 ? (
              <div className="text-center py-16 text-sm text-muted-foreground">
                <FileText size={36} className="mx-auto mb-2 opacity-30" />
                Noch keine Einträge. Erfasse oben die erste Notiz oder lade eine Datei hoch.
              </div>
            ) : (
              <div className="space-y-3">
                {dossier!.entries.map(en => (
                  <div key={en.id} className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/10">
                      <span className="text-xs font-semibold text-foreground">{fmtDateTime(en.createdAt)}</span>
                      <span className="text-[11px] text-muted-foreground">· {en.createdBy}</span>
                      {en.kind === 'action' && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30" title="Automatisch protokollierte, ausgeführte Aktion">
                          <Zap size={9} />Aktion{en.source ? ` · ${en.source}` : ''}
                        </span>
                      )}
                      <button onClick={() => deleteEntry(en.id)} disabled={busy} title="Eintrag löschen"
                        className="ml-auto p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40"><Trash2 size={13} /></button>
                    </div>
                    {en.text && <p className="px-3 py-2 text-sm text-foreground whitespace-pre-wrap leading-relaxed">{en.text}</p>}
                    {en.files.length > 0 && (
                      <div className="px-3 pb-2 space-y-1">
                        {en.files.map(f => (
                          <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border bg-background">
                            <FileText size={13} className="text-muted-foreground shrink-0" />
                            <span className="text-xs text-foreground truncate flex-1" title={f.name}>{f.name}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">{formatFileSize(f.size)}</span>
                            <button onClick={() => openPrinterFile(f.path)} title="Öffnen" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/30"><ExternalLink size={13} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}
      </div>
    </div>
  )
}
