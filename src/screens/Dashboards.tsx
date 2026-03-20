import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Plus, Edit2, Eye, Share2, Trash2, Copy, RefreshCw,
  Loader, Clock, User, Globe, Lock, X, AlertTriangle, CheckCircle,
} from 'lucide-react'
import { useAuthStore, useIsMasterAdmin } from '../store/authStore'
import {
  listPrivateDashboards, listSharedDashboards, deletePrivateDashboard,
  shareDashboard, unshareDashboard, cloneSharedDashboard,
  createEmptyDashboard, savePrivateDashboard,
} from '../utils/dashboardStorage'
import DashboardEditor from './DashboardEditor'
import type { DashboardConfig } from '../types/dashboard'

type View = 'manager' | 'editor' | 'viewer'
type Tab  = 'private' | 'shared'

export default function Dashboards() {
  const session     = useAuthStore(s => s.session)
  const isMaster    = useIsMasterAdmin()
  const user        = session?.user
  const username    = user?.username ?? ''
  const displayName = user?.displayName ?? username

  const [view,               setView]               = useState<View>('manager')
  const [activeDashboard,    setActiveDashboard]    = useState<DashboardConfig | null>(null)
  const [activeMode,         setActiveMode]         = useState<'edit' | 'live'>('live')
  const [tab,                setTab]                = useState<Tab>('private')
  const [privateDashboards,  setPrivateDashboards]  = useState<DashboardConfig[]>([])
  const [sharedDashboards,   setSharedDashboards]   = useState<DashboardConfig[]>([])
  const [loading,            setLoading]            = useState(true)
  const [showCreate,         setShowCreate]         = useState(false)
  const [newName,            setNewName]            = useState('')
  const [newDesc,            setNewDesc]            = useState('')
  const [creating,           setCreating]           = useState(false)
  const [deleteConfirm,      setDeleteConfirm]      = useState<DashboardConfig | null>(null)
  const [deleting,           setDeleting]           = useState(false)
  const [operationId,        setOperationId]        = useState<string | null>(null) // for share/clone spinner

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [priv, shared] = await Promise.all([
        listPrivateDashboards(username),
        listSharedDashboards(),
      ])
      setPrivateDashboards(priv)
      setSharedDashboards(shared)
    } finally {
      setLoading(false)
    }
  }, [username])

  useEffect(() => { loadData() }, [loadData])

  // ── Create ───────────────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const dash = createEmptyDashboard(username, displayName, newName.trim())
      dash.description = newDesc.trim()
      await savePrivateDashboard(username, dash)
      setShowCreate(false)
      setNewName(''); setNewDesc('')
      openEditor(dash)
    } finally {
      setCreating(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteConfirm) return
    setDeleting(true)
    await deletePrivateDashboard(username, deleteConfirm.id)
    // If shared, also remove from shared
    if (deleteConfirm.isShared) {
      await unshareDashboard(username, deleteConfirm).catch(() => {})
    }
    setDeleteConfirm(null)
    setDeleting(false)
    loadData()
  }

  // ── Share / Unshare ───────────────────────────────────────────────────────────
  async function handleShare(dash: DashboardConfig) {
    setOperationId(dash.id)
    if (dash.isShared) {
      await unshareDashboard(username, dash)
    } else {
      await shareDashboard(username, dash)
    }
    setOperationId(null)
    loadData()
  }

  // ── Duplicate ────────────────────────────────────────────────────────────────
  async function handleDuplicate(dash: DashboardConfig) {
    setOperationId(dash.id + '-dup')
    const now = new Date().toISOString()
    const copy: DashboardConfig = {
      ...dash,
      id: `dash-${Date.now()}`,
      name: `${dash.name} (Kopie)`,
      createdAt: now,
      updatedAt: now,
      isShared: false,
      sharedAt: undefined,
    }
    await savePrivateDashboard(username, copy)
    setOperationId(null)
    loadData()
  }

  // ── Clone shared ──────────────────────────────────────────────────────────────
  async function handleClone(shared: DashboardConfig) {
    setOperationId(shared.id + '-clone')
    await cloneSharedDashboard(username, displayName, shared)
    setOperationId(null)
    loadData()
    setTab('private')
  }

  // ── Master admin: delete shared dashboard ─────────────────────────────────────
  async function handleDeleteShared(shared: DashboardConfig) {
    await unshareDashboard(shared.createdBy, shared)
    loadData()
  }

  // ── Navigation ────────────────────────────────────────────────────────────────
  function openEditor(dash: DashboardConfig) {
    setActiveDashboard(dash); setActiveMode('edit'); setView('editor')
  }
  function openViewer(dash: DashboardConfig) {
    setActiveDashboard(dash); setActiveMode('live'); setView('viewer')
  }

  async function handleSave(config: DashboardConfig) {
    await savePrivateDashboard(username, config)
    setPrivateDashboards(prev => prev.map(d => d.id === config.id ? config : d))
    setActiveDashboard(config)
  }

  // ── Show editor/viewer ───────────────────────────────────────────────────────
  if ((view === 'editor' || view === 'viewer') && activeDashboard) {
    return (
      <DashboardEditor
        dashboard={activeDashboard}
        initialMode={activeMode}
        username={username}
        displayName={displayName}
        onClose={() => { setView('manager'); setActiveDashboard(null); loadData() }}
        onSave={handleSave}
      />
    )
  }

  // ── Manager view ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <LayoutDashboard size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">Dashboards</h1>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={loadData} className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus size={13} /> Neues Dashboard
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex gap-1 px-6 pt-3">
        {(['private', 'shared'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors ${tab === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}>
            {t === 'private' ? <><Lock size={11} /> Meine Dashboards ({privateDashboards.length})</>
              : <><Globe size={11} /> Geteilt ({sharedDashboards.length})</>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-16">
            <Loader size={16} className="animate-spin" /> Wird geladen…
          </div>
        ) : tab === 'private' ? (
          /* ── Private dashboards ── */
          privateDashboards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
              <LayoutDashboard size={48} className="opacity-20" />
              <p className="text-sm">Noch keine Dashboards vorhanden</p>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus size={13} /> Erstes Dashboard erstellen
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {privateDashboards.map(dash => (
                <DashboardCard
                  key={dash.id}
                  dash={dash}
                  username={username}
                  isMaster={isMaster}
                  operationId={operationId}
                  onOpen={() => openViewer(dash)}
                  onEdit={() => openEditor(dash)}
                  onShare={() => handleShare(dash)}
                  onDuplicate={() => handleDuplicate(dash)}
                  onDelete={() => setDeleteConfirm(dash)}
                />
              ))}
            </div>
          )
        ) : (
          /* ── Shared dashboards ── */
          sharedDashboards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Globe size={48} className="opacity-20" />
              <p className="text-sm">Keine geteilten Dashboards vorhanden</p>
              <p className="text-xs">Teile eines deiner eigenen Dashboards um es hier anzuzeigen</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sharedDashboards.map(dash => (
                <SharedDashboardCard
                  key={dash.id}
                  dash={dash}
                  currentUsername={username}
                  isMaster={isMaster}
                  operationId={operationId}
                  onOpen={() => openViewer(dash)}
                  onClone={() => handleClone(dash)}
                  onDelete={() => handleDeleteShared(dash)}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-96 p-5">
            <div className="flex items-center gap-2 mb-4">
              <LayoutDashboard size={15} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Neues Dashboard</h3>
              <button onClick={() => { setShowCreate(false); setNewName(''); setNewDesc('') }}
                className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground">
                <X size={14} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} required autoFocus
                  placeholder="z.B. Server-Monitoring"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Beschreibung</label>
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2}
                  placeholder="Kurze Beschreibung…"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-primary resize-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-2 text-xs rounded-lg border border-border hover:bg-accent text-muted-foreground">
                  Abbrechen
                </button>
                <button type="submit" disabled={!newName.trim() || creating}
                  className="flex-1 py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {creating ? <Loader size={12} className="animate-spin" /> : <><Plus size={12} /> Erstellen & bearbeiten</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-red-500/30 rounded-xl p-5 w-80 shadow-2xl space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-400" />
              <h3 className="text-sm font-semibold text-foreground">Dashboard löschen</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Soll "<span className="text-foreground font-medium">{deleteConfirm.name}</span>" wirklich gelöscht werden?
              {deleteConfirm.isShared && ' Das Dashboard wird auch aus den geteilten Dashboards entfernt.'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 text-xs rounded-lg border border-border hover:bg-accent text-muted-foreground">
                Abbrechen
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                {deleting ? <Loader size={12} className="animate-spin mx-auto" /> : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Dashboard Card (private) ───────────────────────────────────────────────────
function DashboardCard({
  dash, username, isMaster, operationId,
  onOpen, onEdit, onShare, onDuplicate, onDelete,
}: {
  dash: DashboardConfig; username: string; isMaster: boolean; operationId: string | null
  onOpen: () => void; onEdit: () => void; onShare: () => void
  onDuplicate: () => void; onDelete: () => void
}) {
  const isOwn = dash.createdBy === username
  const sharing = operationId === dash.id
  const duplicating = operationId === dash.id + '-dup'

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors group">
      {/* Preview area */}
      <div
        className="h-32 relative cursor-pointer flex items-center justify-center"
        style={{ backgroundColor: dash.background.color }}
        onClick={onOpen}
      >
        <LayoutDashboard size={32} className="opacity-20 text-white" />
        {dash.elements.length > 0 && (
          <span className="absolute bottom-2 right-2 text-[10px] bg-black/40 text-white px-1.5 py-0.5 rounded">
            {dash.elements.length} Widget{dash.elements.length !== 1 ? 's' : ''}
          </span>
        )}
        {dash.isShared && (
          <span className="absolute top-2 left-2 flex items-center gap-1 text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded-full">
            <Globe size={8} /> Geteilt
          </span>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
            <button onClick={e => { e.stopPropagation(); onOpen() }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground">
              <Eye size={11} /> Öffnen
            </button>
            <button onClick={e => { e.stopPropagation(); onEdit() }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-card border border-border text-foreground">
              <Edit2 size={11} /> Bearbeiten
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-foreground truncate">{dash.name}</p>
        {dash.description && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{dash.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
          <Clock size={9} />
          <span>Bearbeitet: {new Date(dash.updatedAt).toLocaleDateString('de-DE')}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-3 pb-3 flex items-center gap-1 border-t border-border pt-2.5">
        <button onClick={onEdit} title="Bearbeiten"
          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
          <Edit2 size={13} />
        </button>
        <button onClick={onShare} disabled={sharing} title={dash.isShared ? 'Freigabe aufheben' : 'Teilen'}
          className={`p-1.5 rounded hover:bg-accent transition-colors ${dash.isShared ? 'text-blue-400' : 'text-muted-foreground hover:text-foreground'}`}>
          {sharing ? <Loader size={13} className="animate-spin" /> : <Share2 size={13} />}
        </button>
        <button onClick={onDuplicate} disabled={duplicating} title="Duplizieren"
          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
          {duplicating ? <Loader size={13} className="animate-spin" /> : <Copy size={13} />}
        </button>
        <div className="flex-1" />
        {isOwn && (
          <button onClick={onDelete} title="Löschen"
            className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Shared Dashboard Card ──────────────────────────────────────────────────────
function SharedDashboardCard({
  dash, currentUsername, isMaster, operationId,
  onOpen, onClone, onDelete,
}: {
  dash: DashboardConfig; currentUsername: string; isMaster: boolean; operationId: string | null
  onOpen: () => void; onClone: () => void; onDelete: () => void
}) {
  const isOwn    = dash.createdBy === currentUsername
  const cloning  = operationId === dash.id + '-clone'

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors group">
      <div
        className="h-28 relative cursor-pointer flex items-center justify-center"
        style={{ backgroundColor: dash.background.color }}
        onClick={onOpen}
      >
        <LayoutDashboard size={28} className="opacity-20 text-white" />
        {dash.elements.length > 0 && (
          <span className="absolute bottom-2 right-2 text-[10px] bg-black/40 text-white px-1.5 py-0.5 rounded">
            {dash.elements.length} Widgets
          </span>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={e => { e.stopPropagation(); onOpen() }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground">
              <Eye size={11} /> Ansehen
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-foreground truncate">{dash.name}</p>
        {dash.description && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{dash.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
          <User size={9} />
          <span>von {dash.createdByDisplay || dash.createdBy}</span>
          <span>·</span>
          <Clock size={9} />
          <span>{new Date(dash.sharedAt ?? dash.updatedAt).toLocaleDateString('de-DE')}</span>
        </div>
      </div>

      <div className="px-3 pb-3 flex items-center gap-2 border-t border-border pt-2.5">
        <button onClick={onClone} disabled={cloning}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-50">
          {cloning ? <Loader size={11} className="animate-spin" /> : <Copy size={11} />}
          Als Kopie übernehmen
        </button>
        <div className="flex-1" />
        {(isOwn || isMaster) && (
          <button onClick={onDelete} title="Teilen aufheben"
            className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
