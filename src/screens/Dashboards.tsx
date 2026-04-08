import { useState, useEffect, useCallback, useRef } from 'react'
import {
  LayoutDashboard, Plus, Edit2, Trash2, RefreshCw, Loader, X, AlertTriangle,
  Pause, Play, MoreVertical, GripVertical, Settings,
  ArrowUp, ArrowDown, Check, Search, BarChart3,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { api } from '../electronAPI'
import { CATEGORIES } from '../utils/remoteCommands'
import { searchSkills, buildSearchIndex, type SkillDescription } from '../utils/remoteDocSearch'
import {
  loadDashboards, saveDashboards, createDashboard, createTile,
  DASHBOARD_TEMPLATES, evaluateStatus,
} from '../utils/dashboardStorage'
import type { DashboardsData, Dashboard, DashboardTile, TileStatus, TileSize } from '../types/dashboard'

// ── Status colors ─────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<TileStatus, string> = {
  ok: 'bg-emerald-400', warning: 'bg-amber-400', error: 'bg-red-400',
  unknown: 'bg-muted-foreground/30', loading: 'bg-blue-400 animate-pulse',
}
const STATUS_BG: Record<TileStatus, string> = {
  ok: 'border-emerald-500/20', warning: 'border-amber-500/20', error: 'border-red-500/20 animate-pulse',
  unknown: 'border-border', loading: 'border-blue-500/20',
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const h = 24, w = 80
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const points = values.map((v, i) =>
    `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`
  ).join(' ')
  return (
    <svg width={w} height={h} className="opacity-50">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Tile Component ────────────────────────────────────────────────────────────
function TileCard({
  tile, onRefresh, onMenu, onDragStart, onDragOver, onDrop,
}: {
  tile: DashboardTile
  onRefresh: () => void
  onMenu: (tileId: string) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, id: string) => void
}) {
  const isMulti = tile.hostnames.length > 1
  const firstHost = tile.hostnames[0] ?? '???'
  const result = tile.lastResults[firstHost]
  const status: TileStatus = result?.status ?? 'unknown'
  const value = result?.value ?? '—'

  // Extract numeric values for sparkline
  const sparkValues = tile.history
    .map(h => {
      const m = h.value.match(/(\d+(?:\.\d+)?)/)
      return m ? parseFloat(m[1]) : null
    })
    .filter((v): v is number => v !== null)

  const sizeClass = tile.size === 'small' ? 'min-h-[100px]'
    : tile.size === 'large' ? 'min-h-[200px] col-span-2 row-span-2'
    : 'min-h-[140px]'

  const ago = result?.timestamp
    ? `vor ${Math.round((Date.now() - new Date(result.timestamp).getTime()) / 1000)}s`
    : '—'

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, tile.id)}
      onDragOver={onDragOver}
      onDrop={e => onDrop(e, tile.id)}
      className={`rounded-xl border bg-card p-3 flex flex-col gap-2 transition-all hover:shadow-md cursor-grab active:cursor-grabbing ${sizeClass} ${STATUS_BG[status]}`}
    >
      {/* Header */}
      <div className="flex items-center gap-1">
        <GripVertical size={12} className="text-muted-foreground/30 shrink-0" />
        <span className="text-xs font-medium text-foreground flex-1 truncate">{tile.name}</span>
        <button onClick={() => onMenu(tile.id)} className="p-0.5 rounded hover:bg-accent text-muted-foreground shrink-0">
          <MoreVertical size={12} />
        </button>
      </div>

      {/* Multi-host view */}
      {isMulti ? (
        <div className="flex-1 space-y-1 overflow-y-auto">
          {tile.hostnames.map(h => {
            const r = tile.lastResults[h]
            const s: TileStatus = r?.status ?? 'unknown'
            return (
              <div key={h} className="flex items-center gap-2 text-[10px]">
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[s]}`} />
                <span className="font-mono text-foreground flex-1 truncate">{h}</span>
                <span className="text-muted-foreground">{r?.value ?? '—'}</span>
              </div>
            )
          })}
          <p className="text-[9px] text-muted-foreground mt-1">
            {Object.values(tile.lastResults).filter(r => r.status === 'ok').length}/{tile.hostnames.length} Online
          </p>
        </div>
      ) : (
        /* Single host view */
        <div className="flex-1 flex flex-col items-center justify-center gap-1">
          <span className={`w-4 h-4 rounded-full ${STATUS_COLORS[status]}`} />
          <span className="text-lg font-bold text-foreground">{value.length > 20 ? value.slice(0, 20) + '…' : value}</span>
          {tile.size !== 'small' && (
            <>
              <span className="text-[10px] text-muted-foreground font-mono">{firstHost}</span>
              <span className="text-[9px] text-muted-foreground">{tile.skillLabel}</span>
            </>
          )}
          {tile.size === 'large' && sparkValues.length >= 2 && (
            <Sparkline values={sparkValues} />
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
        <span className="flex-1 truncate">↻ {ago}</span>
        {tile.liveEnabled && (
          <span className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-red-500/10 text-red-400 text-[8px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            LIVE {tile.liveIntervalSeconds}s
          </span>
        )}
        <button onClick={onRefresh} className="p-0.5 rounded hover:bg-accent">
          <RefreshCw size={10} />
        </button>
      </div>
    </div>
  )
}

// ── Add Tile Dialog ───────────────────────────────────────────────────────────
function AddTileDialog({
  onAdd, onClose,
}: {
  onAdd: (tile: DashboardTile) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [hostnames, setHostnames] = useState('')
  const [skillId, setSkillId] = useState('')
  const [skillLabel, setSkillLabel] = useState('')
  const [liveEnabled, setLiveEnabled] = useState(true)
  const [interval, setInterval_] = useState(30)
  const [size, setSize] = useState<TileSize>('normal')
  const [searchQ, setSearchQ] = useState('')
  const [searchRes, setSearchRes] = useState<ReturnType<typeof searchSkills>>([])

  useEffect(() => {
    if (searchQ.length >= 2) {
      const r = searchSkills(searchQ)
      setSearchRes(r)
    } else {
      setSearchRes([])
    }
  }, [searchQ])

  function selectSkill(catId: string, cmdId: string, func: string) {
    setSkillId(`rd_${catId}_${cmdId}`)
    setSkillLabel(func)
    setSearchQ('')
    setSearchRes([])
    if (!name) setName(`${hostnames.split(',')[0]?.trim() || 'PC'} ${func}`)
  }

  function handleAdd() {
    if (!hostnames.trim() || !skillId) return
    const hosts = hostnames.split(',').map(h => h.trim()).filter(Boolean)
    const tile = createTile({
      name: name || `${hosts[0]} ${skillLabel}`,
      hostnames: hosts,
      skillId,
      skillLabel,
      liveEnabled,
      liveIntervalSeconds: interval,
      size,
    })
    onAdd(tile)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-5 w-[420px] shadow-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Plus size={15} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground flex-1">Neue Kachel</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground"><X size={14} /></button>
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">Hostname(s) *</label>
          <input value={hostnames} onChange={e => setHostnames(e.target.value)}
            placeholder="DEHAM12345 oder W3172, W3143, W3150"
            className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary font-mono" />
          <p className="text-[9px] text-muted-foreground mt-0.5">Mehrere Hostnamen kommasepariert</p>
        </div>

        <div className="relative">
          <label className="text-[10px] text-muted-foreground block mb-1">Skill *</label>
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={skillId ? skillLabel : searchQ}
              onChange={e => { setSearchQ(e.target.value); setSkillId(''); setSkillLabel('') }}
              placeholder="Skill suchen..."
              className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
          </div>
          {searchRes.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-card border border-border rounded-lg shadow-xl max-h-40 overflow-y-auto">
              {searchRes.slice(0, 8).map(r => (
                <button key={`${r.catId}-${r.cmdId}`}
                  onClick={() => selectSkill(r.catId, r.cmdId, r.cmd.func)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/30 border-b border-border/30">
                  <span className="font-medium text-foreground">{r.cmd.func}</span>
                  <span className="text-[9px] text-muted-foreground ml-2">{r.catLabel}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">Kachel-Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Automatisch generiert"
            className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-[10px] text-muted-foreground block mb-1">Live-Funktion</label>
            <div className="flex items-center gap-2">
              <button onClick={() => setLiveEnabled(!liveEnabled)}
                className={`px-2 py-1 text-[10px] rounded-md border ${liveEnabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'text-muted-foreground border-border'}`}>
                {liveEnabled ? 'An' : 'Aus'}
              </button>
              {liveEnabled && (
                <select value={interval} onChange={e => setInterval_(Number(e.target.value))}
                  className="px-2 py-1 text-[10px] rounded-md border border-border bg-background text-foreground">
                  <option value={15}>15s</option>
                  <option value={30}>30s</option>
                  <option value={60}>60s</option>
                  <option value={120}>2 Min</option>
                  <option value={300}>5 Min</option>
                </select>
              )}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Größe</label>
            <div className="flex gap-1">
              {(['small', 'normal', 'large'] as TileSize[]).map(s => (
                <button key={s} onClick={() => setSize(s)}
                  className={`px-2 py-1 text-[10px] rounded-md border ${size === s ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground border-border hover:bg-accent'}`}>
                  {s === 'small' ? 'Klein' : s === 'normal' ? 'Normal' : 'Groß'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">Abbrechen</button>
          <button onClick={handleAdd} disabled={!hostnames.trim() || !skillId}
            className="flex-1 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            Kachel erstellen
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Dashboard Screen ─────────────────────────────────────────────────────
export default function Dashboards() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username ?? ''

  const [data, setData] = useState<DashboardsData>({
    dashboards: [], settings: { soundEnabled: false, notificationsEnabled: true, blinkEnabled: true },
  })
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [showAddTile, setShowAddTile] = useState(false)
  const [showNewDash, setShowNewDash] = useState(false)
  const [newDashName, setNewDashName] = useState('')
  const [tileMenu, setTileMenu] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [deletingDash, setDeletingDash] = useState(false)

  // Live intervals
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!username) return
    setLoading(true)
    const d = await loadDashboards(username)
    setData(d)
    if (d.dashboards.length > 0 && !activeId) setActiveId(d.dashboards[0].id)
    setLoading(false)

    // Build search index immediately so skill search works right away
    buildSearchIndex(CATEGORIES, null)

    // Then try to enhance with descriptions from network (non-blocking)
    ;(async () => {
      try {
        let descs = await api().netReadJson<Record<string, SkillDescription>>('knowledge_base/skill_descriptions.json')
        if (!descs) descs = await api().netReadJson<Record<string, SkillDescription>>('skill_descriptions.json')
        if (descs) buildSearchIndex(CATEGORIES, descs)
      } catch { /* offline — index already built without descriptions */ }
    })()
  }, [username]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  // ── Save helper ─────────────────────────────────────────────────────────────
  async function save(newData: DashboardsData) {
    setData(newData)
    if (username) await saveDashboards(username, newData)
  }

  // ── Active dashboard ────────────────────────────────────────────────────────
  const activeDash = data.dashboards.find(d => d.id === activeId) ?? null

  // ── Live engine ─────────────────────────────────────────────────────────────
  useEffect(() => {
    // Stop all existing intervals
    intervalsRef.current.forEach(iv => clearInterval(iv))
    intervalsRef.current.clear()

    if (!activeDash || paused) return

    for (const tile of activeDash.tiles) {
      if (!tile.liveEnabled) continue
      // Execute immediately
      executeTile(tile)
      // Then on interval
      const iv = setInterval(() => executeTile(tile), tile.liveIntervalSeconds * 1000)
      intervalsRef.current.set(tile.id, iv)
    }

    return () => {
      intervalsRef.current.forEach(iv => clearInterval(iv))
      intervalsRef.current.clear()
    }
  }, [activeId, activeDash?.tiles.length, paused]) // eslint-disable-line

  async function executeTile(tile: DashboardTile) {
    // Find the skill command
    for (const cat of CATEGORIES) {
      const cmd = cat.commands.find(c => `rd_${cat.id}_${c.id}` === tile.skillId)
      if (!cmd) continue

      for (const host of tile.hostnames) {
        try {
          const psCmd = cmd.buildCmd(host, tile.skillParams?.input)
          const res = await api().runPowerShell(psCmd, 15000)
          const output = res.stdout?.trim() || res.stderr?.trim() || 'OK'
          const status = evaluateStatus(output, tile.thresholds)

          setData(prev => {
            const updated = { ...prev }
            const dash = updated.dashboards.find(d => d.id === activeId)
            if (!dash) return prev
            const t = dash.tiles.find(tt => tt.id === tile.id)
            if (!t) return prev
            t.lastResults[host] = { status, value: output.slice(0, 100), timestamp: new Date().toISOString() }
            if (host === tile.hostnames[0]) {
              t.history = [...(t.history || []).slice(-19), { value: output.slice(0, 50), timestamp: new Date().toISOString() }]
            }
            return { ...updated }
          })
        } catch (err) {
          setData(prev => {
            const updated = { ...prev }
            const dash = updated.dashboards.find(d => d.id === activeId)
            const t = dash?.tiles.find(tt => tt.id === tile.id)
            if (t) t.lastResults[host] = { status: 'error', value: String(err), timestamp: new Date().toISOString() }
            return { ...updated }
          })
        }
      }
      break
    }
  }

  // ── Dashboard CRUD ──────────────────────────────────────────────────────────
  function handleNewDash() {
    if (!newDashName.trim()) return
    const dash = createDashboard(newDashName.trim())
    const newData = { ...data, dashboards: [...data.dashboards, dash] }
    save(newData)
    setActiveId(dash.id)
    setShowNewDash(false)
    setNewDashName('')
  }

  function handleDeleteDash() {
    if (!activeId) return
    const newData = { ...data, dashboards: data.dashboards.filter(d => d.id !== activeId) }
    save(newData)
    setActiveId(newData.dashboards[0]?.id ?? null)
    setDeletingDash(false)
  }

  function handleRenameDash() {
    if (!activeId || !editName.trim()) return
    const newData = { ...data, dashboards: data.dashboards.map(d => d.id === activeId ? { ...d, name: editName.trim() } : d) }
    save(newData)
    setEditingName(null)
  }

  // ── Tile CRUD ───────────────────────────────────────────────────────────────
  function handleAddTile(tile: DashboardTile) {
    let targetId = activeId

    // If no dashboard exists, auto-create one
    if (!targetId || !data.dashboards.find(d => d.id === targetId)) {
      if (data.dashboards.length > 0) {
        // Dashboards exist but none active — activate the first one
        targetId = data.dashboards[0].id
        setActiveId(targetId)
      } else {
        // No dashboards at all — create one automatically
        const dash = createDashboard('Mein Dashboard')
        const newData = { ...data, dashboards: [...data.dashboards, dash] }
        targetId = dash.id
        setActiveId(targetId)
        tile.position = 0
        const withTile = {
          ...newData,
          dashboards: newData.dashboards.map(d =>
            d.id === targetId ? { ...d, tiles: [tile] } : d
          ),
        }
        save(withTile)
        setShowAddTile(false)
        return
      }
    }

    tile.position = data.dashboards.find(d => d.id === targetId)?.tiles.length ?? 0
    const newData = {
      ...data,
      dashboards: data.dashboards.map(d =>
        d.id === targetId ? { ...d, tiles: [...d.tiles, tile] } : d
      ),
    }
    save(newData)
    setShowAddTile(false)
  }

  function handleRemoveTile(tileId: string) {
    if (!activeId) return
    const iv = intervalsRef.current.get(tileId)
    if (iv) { clearInterval(iv); intervalsRef.current.delete(tileId) }
    const newData = {
      ...data,
      dashboards: data.dashboards.map(d =>
        d.id === activeId ? { ...d, tiles: d.tiles.filter(t => t.id !== tileId) } : d
      ),
    }
    save(newData)
    setTileMenu(null)
  }

  function handleMoveTile(tileId: string, dir: 'up' | 'down') {
    if (!activeId || !activeDash) return
    const tiles = [...activeDash.tiles].sort((a, b) => a.position - b.position)
    const idx = tiles.findIndex(t => t.id === tileId)
    if (idx < 0) return
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= tiles.length) return
    const tmp = tiles[idx].position
    tiles[idx].position = tiles[swapIdx].position
    tiles[swapIdx].position = tmp
    const newData = { ...data, dashboards: data.dashboards.map(d => d.id === activeId ? { ...d, tiles } : d) }
    save(newData)
    setTileMenu(null)
  }

  // ── Drag & Drop ─────────────────────────────────────────────────────────────
  function onDragStart(e: React.DragEvent, id: string) {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e: React.DragEvent) { e.preventDefault() }
  function onDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    if (!dragId || dragId === targetId || !activeDash) return
    const tiles = [...activeDash.tiles]
    const fromIdx = tiles.findIndex(t => t.id === dragId)
    const toIdx = tiles.findIndex(t => t.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return
    const [moved] = tiles.splice(fromIdx, 1)
    tiles.splice(toIdx, 0, moved)
    tiles.forEach((t, i) => { t.position = i })
    const newData = { ...data, dashboards: data.dashboards.map(d => d.id === activeId ? { ...d, tiles } : d) }
    save(newData)
    setDragId(null)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader size={16} className="animate-spin" /> Dashboards laden...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3">
        <LayoutDashboard size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">Dashboards</h1>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowNewDash(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus size={12} /> Neu
          </button>
        </div>
      </div>

      {/* Dashboard tabs */}
      {data.dashboards.length > 0 && (
        <div className="shrink-0 px-6 py-2 border-b border-border flex items-center gap-2 overflow-x-auto">
          {data.dashboards.map(d => (
            <button key={d.id} onClick={() => setActiveId(d.id)}
              className={`px-3 py-1.5 text-xs rounded-lg border whitespace-nowrap transition-colors ${
                d.id === activeId
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'text-muted-foreground border-border hover:bg-accent'
              }`}>
              {d.name}
            </button>
          ))}
        </div>
      )}

      {/* Active dashboard */}
      {activeDash ? (
        <div className="flex-1 overflow-y-auto p-6">
          {/* Dashboard header */}
          <div className="flex items-center gap-2 mb-4">
            {editingName === activeId ? (
              <div className="flex items-center gap-1">
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRenameDash(); if (e.key === 'Escape') setEditingName(null) }}
                  autoFocus className="px-2 py-1 text-sm rounded border border-border bg-background text-foreground" />
                <button onClick={handleRenameDash} className="p-1 text-emerald-400"><Check size={14} /></button>
                <button onClick={() => setEditingName(null)} className="p-1 text-muted-foreground"><X size={14} /></button>
              </div>
            ) : (
              <h2 className="text-sm font-semibold text-foreground">{activeDash.name}</h2>
            )}
            <button onClick={() => { setEditingName(activeId); setEditName(activeDash.name) }}
              className="p-1 rounded hover:bg-accent text-muted-foreground" title="Umbenennen"><Edit2 size={12} /></button>
            <button onClick={() => setDeletingDash(true)}
              className="p-1 rounded hover:bg-accent text-red-400" title="Löschen"><Trash2 size={12} /></button>
            <button onClick={() => setPaused(!paused)}
              className={`p-1 rounded hover:bg-accent ${paused ? 'text-amber-400' : 'text-muted-foreground'}`}
              title={paused ? 'Live fortsetzen' : 'Live pausieren'}>
              {paused ? <Play size={12} /> : <Pause size={12} />}
            </button>
            {paused && <span className="text-[10px] text-amber-400">PAUSIERT</span>}
            <span className="text-[10px] text-muted-foreground ml-auto">{activeDash.tiles.length} Kacheln</span>
          </div>

          {/* Tiles grid */}
          {activeDash.tiles.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
              {[...activeDash.tiles].sort((a, b) => a.position - b.position).map(tile => (
                <div key={tile.id} className="relative">
                  <TileCard
                    tile={tile}
                    onRefresh={() => executeTile(tile)}
                    onMenu={() => setTileMenu(tileMenu === tile.id ? null : tile.id)}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                  />
                  {/* Tile context menu */}
                  {tileMenu === tile.id && (
                    <div className="absolute right-2 top-8 z-20 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[150px]">
                      <button onClick={() => handleMoveTile(tile.id, 'up')}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] hover:bg-accent text-foreground">
                        <ArrowUp size={10} /> Nach oben
                      </button>
                      <button onClick={() => handleMoveTile(tile.id, 'down')}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] hover:bg-accent text-foreground">
                        <ArrowDown size={10} /> Nach unten
                      </button>
                      <div className="my-1 h-px bg-border" />
                      <button onClick={() => handleRemoveTile(tile.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] hover:bg-accent text-red-400">
                        <Trash2 size={10} /> Entfernen
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <BarChart3 size={40} className="opacity-20 mb-3" />
              <p className="text-sm">Noch keine Kacheln</p>
              <p className="text-xs opacity-60 mt-1">Fügen Sie Kacheln hinzu um PCs zu überwachen</p>
            </div>
          )}

          {/* Add tile button */}
          <button onClick={() => setShowAddTile(true)}
            className="mt-4 flex items-center gap-1.5 px-4 py-2 text-xs rounded-lg border border-dashed border-border hover:bg-accent text-muted-foreground mx-auto">
            <Plus size={12} /> Kachel hinzufügen
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <LayoutDashboard size={48} className="opacity-20 mb-4" />
          <p className="text-sm">Kein Dashboard vorhanden</p>
          <button onClick={() => setShowNewDash(true)}
            className="mt-3 flex items-center gap-1 px-4 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus size={12} /> Erstes Dashboard erstellen
          </button>
        </div>
      )}

      {/* New dashboard dialog */}
      {showNewDash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-5 w-[380px] shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Neues Dashboard</h3>

            {/* Templates */}
            <div className="grid grid-cols-2 gap-2">
              {DASHBOARD_TEMPLATES.map(t => (
                <button key={t.id} onClick={() => { setNewDashName(t.name) }}
                  className={`text-left p-2 rounded-lg border transition-colors ${newDashName === t.name ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`}>
                  <span className="text-lg">{t.icon}</span>
                  <p className="text-xs font-medium text-foreground mt-0.5">{t.name}</p>
                  <p className="text-[9px] text-muted-foreground">{t.description}</p>
                </button>
              ))}
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Dashboard-Name</label>
              <input value={newDashName} onChange={e => setNewDashName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleNewDash() }}
                placeholder="z.B. Server-Monitoring"
                className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowNewDash(false)} className="flex-1 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">Abbrechen</button>
              <button onClick={handleNewDash} disabled={!newDashName.trim()}
                className="flex-1 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Erstellen</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingDash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-red-500/40 rounded-xl p-5 w-[350px] shadow-2xl space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-400" />
              <h3 className="text-sm font-semibold text-foreground">Dashboard löschen?</h3>
            </div>
            <p className="text-xs text-muted-foreground">Alle Kacheln in "{activeDash?.name}" gehen verloren.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeletingDash(false)} className="flex-1 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">Abbrechen</button>
              <button onClick={handleDeleteDash} className="flex-1 py-2 text-xs rounded-md bg-red-600 hover:bg-red-700 text-white">Löschen</button>
            </div>
          </div>
        </div>
      )}

      {/* Add tile dialog */}
      {showAddTile && <AddTileDialog onAdd={handleAddTile} onClose={() => setShowAddTile(false)} />}
    </div>
  )
}
