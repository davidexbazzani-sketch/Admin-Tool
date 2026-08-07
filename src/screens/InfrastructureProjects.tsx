import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FolderKanban, Plus, Archive, RefreshCw, GripVertical, Paperclip,
  CalendarClock, AlertTriangle, LayoutGrid,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import {
  listActiveProjects, listArchivedProjects, createProject, updatePosition,
  STATUS_LABEL, STATUS_COLORS, STATUS_ORDER,
  type InfraProject, type ProjectStatus,
} from '../services/infraProjects'
import ProjectDetail from '../components/infraProjects/ProjectDetail'

const POLL_MS = 15000
const BOARD_W = 2400
const BOARD_H = 1400
const CARD_W = 260

// ── kleine Status-Badge ─────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ProjectStatus }) {
  const c = STATUS_COLORS[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.badgeBg} ${c.badgeText}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {STATUS_LABEL[status]}
    </span>
  )
}

function fmtRelative(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function InfrastructureProjects() {
  const user = useAuthStore(s => s.session?.user)
  const currentUserName = user?.displayName || user?.username || ''

  const [view, setView] = useState<'board' | 'archive'>('board')
  const [active, setActive] = useState<InfraProject[]>([])
  const [archived, setArchived] = useState<InfraProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newStatus, setNewStatus] = useState<ProjectStatus>('pending')
  const [busy, setBusy] = useState(false)

  const boardRef = useRef<HTMLDivElement>(null)

  // Drag-State (nur die gezogene Kachel rendert aus dragPos neu)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const grabOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const movedRef = useRef(false)

  // ── Laden ──────────────────────────────────────────────────────────────────
  const reload = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const [a, arc] = await Promise.all([listActiveProjects(), listArchivedProjects()])
      setActive(a)
      setArchived(arc)
      setLastSync(new Date())
      setError('')
    } catch {
      setError('Projekte konnten nicht geladen werden. Netzlaufwerk erreichbar?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload(true) }, [reload])

  // Live-Sync: Polling + Reload bei Fenster-Fokus. Während eine Kachel gezogen
  // wird, NICHT neu laden (sonst springt sie zurück).
  useEffect(() => {
    const tick = () => { if (!dragId) reload(false) }
    const timer = setInterval(tick, POLL_MS)
    const onFocus = () => { if (!dragId) reload(false) }
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [reload, dragId])

  const openProject = useMemo(
    () => [...active, ...archived].find(p => p.id === openId) ?? null,
    [active, archived, openId],
  )

  // ── Drag-Handling ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dragId) return
    const onMove = (e: MouseEvent) => {
      const board = boardRef.current
      if (!board) return
      const rect = board.getBoundingClientRect()
      const x = e.clientX - rect.left + board.scrollLeft - grabOffset.current.x
      const y = e.clientY - rect.top + board.scrollTop - grabOffset.current.y
      movedRef.current = true
      setDragPos({
        x: Math.max(0, Math.min(BOARD_W - CARD_W, x)),
        y: Math.max(0, Math.min(BOARD_H - 60, y)),
      })
    }
    const onUp = async () => {
      const id = dragId
      const pos = dragPos
      setDragId(null)
      if (movedRef.current && id) {
        // Optimistisch lokal setzen, dann persistieren
        setActive(prev => prev.map(p => p.id === id ? { ...p, x: pos.x, y: pos.y } : p))
        updatePosition(id, pos.x, pos.y).catch(() => {})
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragId, dragPos])

  function startDrag(e: React.MouseEvent, p: InfraProject) {
    const board = boardRef.current
    if (!board) return
    const rect = board.getBoundingClientRect()
    grabOffset.current = {
      x: e.clientX - rect.left + board.scrollLeft - p.x,
      y: e.clientY - rect.top + board.scrollTop - p.y,
    }
    movedRef.current = false
    setDragPos({ x: p.x, y: p.y })
    setDragId(p.id)
  }

  // ── Neues Projekt ────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!newTitle.trim()) return
    setBusy(true)
    const res = await createProject({
      title: newTitle.trim(),
      description: newDesc.trim(),
      status: newStatus,
      createdBy: currentUserName,
    })
    setBusy(false)
    if (!res.ok) { setError(res.error || 'Anlegen fehlgeschlagen.'); return }
    setShowNew(false); setNewTitle(''); setNewDesc(''); setNewStatus('pending')
    await reload(false)
    if (res.project) setOpenId(res.project.id)
  }

  // Gruppierung Archiv nach Reihenfolge bereits sortiert
  const counts = useMemo(() => {
    const m: Record<ProjectStatus, number> = { pending: 0, 'in-progress': 0, 'action-sascha': 0, done: archived.length }
    for (const p of active) m[p.status]++
    return m
  }, [active, archived])

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Kopfzeile */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <FolderKanban className="text-primary" size={22} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Infrastruktur Projekte</h1>
          <p className="text-[11px] text-muted-foreground">
            {view === 'board'
              ? `${active.length} laufende Projekte · ${archived.length} im Archiv`
              : `${archived.length} erledigte Projekte`}
            {lastSync && <span className="ml-2 opacity-60">· Stand {lastSync.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => reload(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-border"
            title="Aktualisieren"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setView('board')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs ${view === 'board' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}
            >
              <LayoutGrid size={13} />Whiteboard
            </button>
            <button
              onClick={() => setView('archive')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs ${view === 'archive' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}
            >
              <Archive size={13} />Archiv
            </button>
          </div>
          {view === 'board' && (
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90"
            >
              <Plus size={14} />Neues Projekt
            </button>
          )}
        </div>
      </div>

      {/* Status-Legende */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-border/60 shrink-0 text-[11px] text-muted-foreground">
        {STATUS_ORDER.map(s => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[s].dot}`} />
            {STATUS_LABEL[s]}
            <span className="opacity-60">({counts[s]})</span>
          </span>
        ))}
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
          <AlertTriangle size={14} />{error}
        </div>
      )}

      {/* Inhalt */}
      {view === 'board' ? (
        <div ref={boardRef} className="flex-1 overflow-auto relative">
          <div
            className="relative"
            style={{
              width: BOARD_W,
              height: BOARD_H,
              backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.18) 1px, transparent 1px)',
              backgroundSize: '26px 26px',
            }}
          >
            {!loading && active.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-3 pointer-events-none">
                <FolderKanban size={48} className="opacity-30" />
                <p className="text-sm">Noch keine laufenden Projekte.</p>
                <p className="text-xs opacity-70">Klicke oben rechts auf „Neues Projekt".</p>
              </div>
            )}
            {active.map(p => {
              const isDragging = dragId === p.id
              const pos = isDragging ? dragPos : { x: p.x, y: p.y }
              const c = STATUS_COLORS[p.status]
              const attCount = p.entries.reduce((n, e) => n + e.attachments.length, 0)
              return (
                <div
                  key={p.id}
                  className={`absolute rounded-xl border bg-card shadow-lg select-none ${c.border} ${isDragging ? 'opacity-90 cursor-grabbing z-20 shadow-2xl' : 'z-10'}`}
                  style={{ left: pos.x, top: pos.y, width: CARD_W, borderTopWidth: 3, borderTopColor: c.ring }}
                  onMouseDown={() => { movedRef.current = false }}
                  onClick={() => { if (!movedRef.current) setOpenId(p.id) }}
                >
                  <div className="flex items-start gap-2 px-3 pt-2.5">
                    <div
                      className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
                      onMouseDown={(e) => { e.stopPropagation(); startDrag(e, p) }}
                      onClick={(e) => e.stopPropagation()}
                      title="Verschieben"
                    >
                      <GripVertical size={15} />
                    </div>
                    <h3 className="flex-1 text-sm font-semibold text-foreground leading-snug line-clamp-2 cursor-pointer">{p.title}</h3>
                  </div>
                  <div className="px-3 pt-1.5">
                    <StatusBadge status={p.status} />
                  </div>
                  {p.description && (
                    <p className="px-3 pt-2 text-[11px] text-muted-foreground line-clamp-2">{p.description}</p>
                  )}
                  <div className="flex items-center gap-3 px-3 py-2.5 mt-1 text-[10px] text-muted-foreground border-t border-border/50">
                    <span className="inline-flex items-center gap-1"><FolderKanban size={11} />{p.entries.length} Einträge</span>
                    {attCount > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={11} />{attCount}</span>}
                    <span className="inline-flex items-center gap-1 ml-auto"><CalendarClock size={11} />{fmtRelative(p.updatedAt || p.createdAt)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        // ── Archiv ──────────────────────────────────────────────────────────────
        <div className="flex-1 overflow-auto p-5">
          {!loading && archived.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <Archive size={48} className="opacity-30" />
              <p className="text-sm">Noch keine erledigten Projekte im Archiv.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {archived.map(p => {
                const attCount = p.entries.reduce((n, e) => n + e.attachments.length, 0)
                return (
                  <button
                    key={p.id}
                    onClick={() => setOpenId(p.id)}
                    className="text-left rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-accent/20 transition-colors p-3"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <StatusBadge status={p.status} />
                      <span className="text-[10px] text-muted-foreground">{fmtRelative(p.archivedAt || p.updatedAt)}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{p.title}</h3>
                    {p.description && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">{p.description}</p>}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><FolderKanban size={11} />{p.entries.length}</span>
                      {attCount > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={11} />{attCount}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Detail-Ansicht */}
      {openProject && (
        <ProjectDetail
          project={openProject}
          currentUserName={currentUserName}
          onClose={() => setOpenId(null)}
          onChanged={() => reload(false)}
          onDeleted={() => { setOpenId(null); reload(false) }}
        />
      )}

      {/* Neues Projekt Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !busy && setShowNew(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Plus size={16} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Neues Projekt anlegen</h2>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Projektname *</label>
                <input
                  autoFocus
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                  placeholder="z. B. Migration Fileserver HAM"
                  className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Kurzbeschreibung</label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  rows={3}
                  placeholder="Worum geht es in diesem Projekt?"
                  className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Status</label>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_ORDER.filter(s => s !== 'done').map(s => (
                    <button
                      key={s}
                      onClick={() => setNewStatus(s)}
                      className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${newStatus === s ? `${STATUS_COLORS[s].badgeBg} ${STATUS_COLORS[s].badgeText} ${STATUS_COLORS[s].border}` : 'border-border text-muted-foreground hover:bg-accent/40'}`}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={() => setShowNew(false)} disabled={busy} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40">Abbrechen</button>
              <button onClick={handleCreate} disabled={busy || !newTitle.trim()} className="px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {busy ? 'Wird angelegt…' : 'Anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
