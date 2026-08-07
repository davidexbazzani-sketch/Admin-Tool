// ── Personen-Dossier: globaler Info-Button + grosse Uebersicht ────────────────
// <DossierProvider> einmal um die App legen. Ueberall wo ein Name steht:
//   <PersonInfoButton name={anzeigeName} sam={optionaleCorpId} />
// Klick oeffnet EIN gemeinsames, grosses Fenster mit allen datierten, signierten
// Eintraegen (Notizen/Vorgaenge) und Datei-Anhaengen zu dieser Person.

import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import { Info, X, Loader2, Upload, Paperclip, Trash2, ExternalLink, FileText, User, Plus, Zap, ListTree } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import {
  loadDossier, saveDossier, emptyDossier, personKey, canonicalName,
  pickAndStoreDossierFiles, openDossierFile, deleteDossierFile, formatFileSize,
  type PersonDossier, type DossierEntry, type DossierFile,
} from '../../services/personDossier'
import { PersonMasterData } from './PersonMasterData'

interface DossierCtx { open: (name: string, sam?: string) => void }
const DossierContext = createContext<DossierCtx | null>(null)

/** Kleiner Info-Button hinter einem Namen. Rendert nichts, wenn kein Name/Provider. */
export function PersonInfoButton({ name, sam, className, size = 12 }: { name?: string | null; sam?: string; className?: string; size?: number }) {
  const ctx = useContext(DossierContext)
  const n = (name || '').trim()
  if (!ctx || !n) return null
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); e.preventDefault(); ctx.open(n, sam) }}
      title={`Infos & Notizen zu ${n}`}
      className={className ?? 'inline-flex items-center justify-center shrink-0 p-0.5 rounded text-muted-foreground/70 hover:text-blue-400 hover:bg-blue-500/10'}
    >
      <Info size={size} />
    </button>
  )
}

export function DossierProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<{ name: string; sam?: string } | null>(null)
  const open = useCallback((name: string, sam?: string) => setTarget({ name, sam }), [])
  return (
    <DossierContext.Provider value={{ open }}>
      {children}
      {target && <PersonDossierModal name={target.name} sam={target.sam} onClose={() => setTarget(null)} />}
    </DossierContext.Provider>
  )
}

function fmtDateTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function newId(): string { return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7) }

function PersonDossierModal({ name, sam, onClose }: { name: string; sam?: string; onClose: () => void }) {
  const authUser = useAuthStore(s => s.session?.user)
  const currentUser = authUser?.displayName || authUser?.username || 'unbekannt'
  const display = canonicalName(name)
  const ctx = useContext(DossierContext)

  const [dossier, setDossier] = useState<PersonDossier | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [newText, setNewText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<DossierFile[]>([])
  const [tab, setTab] = useState<'info' | 'notes'>('info')
  const key = personKey(name)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const d = await loadDossier(name)
      if (!cancelled) { setDossier(d ?? emptyDossier(name, sam)); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [name, sam])

  // ESC schliesst
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function persist(next: PersonDossier) {
    setDossier(next)
    await saveDossier(next, currentUser)
  }

  async function attachPending() {
    setBusy(true)
    try {
      const added = await pickAndStoreDossierFiles(key, currentUser)
      if (added.length) setPendingFiles(prev => [...prev, ...added])
    } finally { setBusy(false) }
  }
  async function removePending(id: string) {
    const f = pendingFiles.find(x => x.id === id)
    if (f) await deleteDossierFile(f.path)
    setPendingFiles(prev => prev.filter(x => x.id !== id))
  }

  async function addEntry() {
    if (!dossier) return
    const text = newText.trim()
    if (!text && pendingFiles.length === 0) return
    setBusy(true)
    try {
      const entry: DossierEntry = { id: newId(), text, createdAt: new Date().toISOString(), createdBy: currentUser, files: pendingFiles }
      const next: PersonDossier = { ...dossier, personName: display, sam: dossier.sam || sam, entries: [entry, ...dossier.entries] }
      await persist(next)
      setNewText(''); setPendingFiles([])
    } finally { setBusy(false) }
  }

  async function deleteEntry(id: string) {
    if (!dossier) return
    if (!window.confirm('Diesen Eintrag inkl. Anhängen wirklich löschen?')) return
    setBusy(true)
    try {
      const entry = dossier.entries.find(e => e.id === id)
      if (entry) for (const f of entry.files) await deleteDossierFile(f.path)
      await persist({ ...dossier, entries: dossier.entries.filter(e => e.id !== id) })
    } finally { setBusy(false) }
  }

  const entryCount = dossier?.entries.length ?? 0

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Kopf */}
        <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0">
            <User size={22} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-foreground truncate">{display}</h2>
            <p className="text-xs text-muted-foreground">
              Personen-Dossier · {entryCount} {entryCount === 1 ? 'Eintrag' : 'Einträge'}
              {(dossier?.sam || sam) && <span className="font-mono"> · {dossier?.sam || sam}</span>}
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40"><X size={18} /></button>
        </div>

        {/* Tabs: Stammdaten (alle bekannten Infos) | Notizen & Dateien */}
        <div className="shrink-0 px-6 border-b border-border flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTab('info')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === 'info' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <ListTree size={13} />Stammdaten
          </button>
          <button
            type="button"
            onClick={() => setTab('notes')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === 'notes' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <FileText size={13} />Notizen &amp; Dateien{entryCount > 0 ? ` (${entryCount})` : ''}
          </button>
        </div>

        {/* Stammdaten: alle im Tool bekannten Infos zur Person als Stammbaum */}
        {tab === 'info' && (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <PersonMasterData
              name={display}
              sam={dossier?.sam || sam}
              onOpenPerson={(n, s) => ctx?.open(n, s)}
              manualRoom={dossier?.roomNumber || ''}
              onSaveRoom={async room => {
                if (!dossier) return
                await persist({ ...dossier, roomNumber: room.trim() || undefined })
              }}
            />
          </div>
        )}

        {tab === 'notes' && (<>
        {/* Neuer Eintrag */}
        <div className="shrink-0 px-6 py-3 border-b border-border bg-muted/5 space-y-2">
          <textarea
            value={newText}
            onChange={e => setNewText(e.target.value)}
            rows={3}
            placeholder="Neuer Eintrag: Notiz, Vorgang, Rückmeldung…"
            className="w-full px-3 py-2 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary leading-relaxed"
          />
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

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
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
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30" title="Automatisch protokollierter, ausgeführter Eingriff">
                        <Zap size={9} />Eingriff{en.source ? ` · ${en.source}` : ''}
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
                          <button onClick={() => openDossierFile(f.path)} title="Öffnen" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/30"><ExternalLink size={13} /></button>
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
