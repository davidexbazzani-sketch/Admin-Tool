import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Network, Loader, RefreshCw, ZoomIn, ZoomOut, Maximize2, Crown, User,
  Briefcase, Building2, ChevronDown, ChevronRight, Users as UsersIcon,
} from 'lucide-react'
import {
  fetchOrgChart, buildTree, ORG_ROOT_SAM,
  type OrgNode, type OrgTreeNode,
} from '../services/adOrgChart'
import { PersonInfoButton } from '../components/person/PersonDossier'

// Initial expand depth (root = 0, direct reports = 1)
const INITIAL_EXPAND_DEPTH = 1
const ZOOM_MIN = 0.4
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.1
const ZOOM_DEFAULT = 1.0

// ── Persistent cache ─────────────────────────────────────────────────────────
// The org chart is heavy to load (one AD call per person). We cache the result
// in localStorage so re-entering the screen is instant. The user explicitly
// refreshes via the "Neu laden" button when they want fresh data.
const CACHE_KEY = 'organizationStructure.cache.v1'

interface CachedOrgData {
  nodes: OrgNode[]
  rootSam: string
  loadedAt: string
}

function loadCache(): CachedOrgData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as CachedOrgData
    if (!Array.isArray(data.nodes) || data.nodes.length === 0) return null
    return data
  } catch { return null }
}

function saveCache(nodes: OrgNode[], rootSam: string, loadedAt: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ nodes, rootSam, loadedAt } satisfies CachedOrgData))
  } catch { /* quota / mode issues — silently skip */ }
}

function formatRelativeAge(iso: string): string {
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min`
  const h = Math.floor(min / 60)
  if (h < 24) return `vor ${h} Std`
  const d = Math.floor(h / 24)
  return `vor ${d} ${d === 1 ? 'Tag' : 'Tagen'}`
}

export default function OrganizationStructure() {
  const [nodes, setNodes] = useState<OrgNode[]>([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [durationMs, setDurationMs] = useState<number | null>(null)
  const [loadedAt, setLoadedAt] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setProgress(0)
    setError(null)
    const res = await fetchOrgChart(ORG_ROOT_SAM, n => setProgress(n))
    setNodes(res.nodes)
    setDurationMs(res.durationMs)
    setError(res.ok ? null : (res.error ?? 'Unbekannter Fehler'))
    if (res.ok) {
      const ts = new Date().toISOString()
      setLoadedAt(ts)
      saveCache(res.nodes, ORG_ROOT_SAM, ts)
    }
    setLoading(false)
  }

  // On mount: use cached data if available, otherwise fetch once.
  useEffect(() => {
    const cached = loadCache()
    if (cached && cached.rootSam.toUpperCase() === ORG_ROOT_SAM.toUpperCase()) {
      setNodes(cached.nodes)
      setLoadedAt(cached.loadedAt)
      setLoading(false)
    } else {
      void load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tree = useMemo<OrgTreeNode | null>(
    () => buildTree(nodes, ORG_ROOT_SAM),
    [nodes],
  )

  // Initialize expanded set when the tree changes (initial 2 levels open)
  useEffect(() => {
    if (!tree) return
    const next = new Set<string>()
    function walk(t: OrgTreeNode) {
      if (t.depth <= INITIAL_EXPAND_DEPTH) {
        next.add(t.node.sam.toUpperCase())
        for (const c of t.children) walk(c)
      }
    }
    walk(tree)
    setExpanded(next)
  }, [tree])

  function toggleNode(sam: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      const key = sam.toUpperCase()
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function expandAll() {
    if (!tree) return
    const next = new Set<string>()
    function walk(t: OrgTreeNode) {
      next.add(t.node.sam.toUpperCase())
      for (const c of t.children) walk(c)
    }
    walk(tree)
    setExpanded(next)
  }

  function collapseAll() {
    if (!tree) return
    const next = new Set<string>()
    next.add(tree.node.sam.toUpperCase()) // keep root visible
    setExpanded(next)
  }

  function adjustZoom(delta: number) {
    setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))))
  }
  function resetZoom() { setZoom(ZOOM_DEFAULT) }

  // ── Pan-to-drag (click + hold + move = scroll the container) ────────────
  const scrollRef = useRef<HTMLDivElement>(null)
  const panRef = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, moved: false })

  function onPanMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return // only left mouse button
    // Don't hijack clicks on interactive elements (cards are buttons)
    const target = e.target as HTMLElement
    if (target.closest('button, [role="button"], input, label, a')) return
    const c = scrollRef.current
    if (!c) return
    panRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: c.scrollLeft,
      scrollTop: c.scrollTop,
      moved: false,
    }
    c.style.cursor = 'grabbing'
    e.preventDefault()
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const p = panRef.current
      if (!p.active) return
      const c = scrollRef.current
      if (!c) return
      const dx = e.clientX - p.startX
      const dy = e.clientY - p.startY
      if (!p.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) p.moved = true
      c.scrollLeft = p.scrollLeft - dx
      c.scrollTop = p.scrollTop - dy
    }
    function onUp() {
      const p = panRef.current
      if (!p.active) return
      p.active = false
      const c = scrollRef.current
      if (c) c.style.cursor = 'grab'
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  // Capture-phase click handler: if the user just panned (moved during drag),
  // swallow the click so cards don't accidentally toggle when releasing.
  function onClickCapture(e: React.MouseEvent) {
    if (panRef.current.moved) {
      e.stopPropagation()
      e.preventDefault()
      panRef.current.moved = false
    }
  }

  // Stats
  const stats = useMemo(() => {
    const total = nodes.length
    const managers = nodes.filter(n => n.reports.length > 0).length
    const leaves = total - managers
    return { total, managers, leaves }
  }, [nodes])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <Network size={22} className="text-blue-400" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-foreground">Organisationsstruktur</h2>
          <p className="text-xs text-muted-foreground">
            Stammbaum ausgehend von <strong className="text-foreground">{tree?.node.displayName || 'Martin Johannsmann'}</strong>
            {loading && <> · lädt … {progress > 0 ? `${progress} Personen` : ''}</>}
            {!loading && loadedAt && (
              <>
                {' '}· Zuletzt geladen: <span className="text-foreground">{formatRelativeAge(loadedAt)}</span>
                {' '}<span className="text-muted-foreground/70">({new Date(loadedAt).toLocaleString('de-DE')})</span>
                {durationMs != null && <span className="text-muted-foreground/70"> · {(durationMs / 1000).toFixed(1)}s</span>}
              </>
            )}
          </p>
        </div>

        {/* Stats */}
        {!loading && nodes.length > 0 && (
          <div className="hidden md:flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><UsersIcon size={11} />{stats.total} gesamt</span>
            <span className="inline-flex items-center gap-1"><Crown size={11} className="text-amber-400" />{stats.managers} Manager</span>
            <span>{stats.leaves} Mitarbeiter</span>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-1">
          <button onClick={() => adjustZoom(-ZOOM_STEP)} title="Heraus zoomen"
            className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground">
            <ZoomOut size={13} />
          </button>
          <span className="text-[11px] tabular-nums w-12 text-center text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => adjustZoom(ZOOM_STEP)} title="Hinein zoomen"
            className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground">
            <ZoomIn size={13} />
          </button>
          <button onClick={resetZoom} title="Zoom zurücksetzen"
            className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground">
            <Maximize2 size={13} />
          </button>
          <span className="mx-1 w-px h-5 bg-border" />
          <button onClick={expandAll} disabled={!tree}
            className="text-[11px] px-2 py-1 rounded-md border border-border hover:bg-accent text-muted-foreground disabled:opacity-40">
            Alle aufklappen
          </button>
          <button onClick={collapseAll} disabled={!tree}
            className="text-[11px] px-2 py-1 rounded-md border border-border hover:bg-accent text-muted-foreground disabled:opacity-40">
            Alle einklappen
          </button>
          <span className="mx-1 w-px h-5 bg-border" />
          <button onClick={load} disabled={loading} title="Frisch aus Active Directory laden"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-40 transition-colors">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Neu laden
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground text-sm">
          <Loader size={14} className="animate-spin" />
          Stammbaum wird aus Active Directory geladen
          {progress > 0 ? ` (${progress} Personen bisher) …` : ' …'}
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center text-center px-6">
          <div>
            <Network size={36} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-foreground">Stammbaum konnte nicht geladen werden</p>
            <p className="text-xs text-red-300 mt-1 max-w-md">{error}</p>
            <button onClick={load} className="mt-3 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
              Erneut versuchen
            </button>
          </div>
        </div>
      ) : !tree ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Keine Daten verfügbar.
        </div>
      ) : (
        <div
          ref={scrollRef}
          onMouseDown={onPanMouseDown}
          onClickCapture={onClickCapture}
          className="flex-1 overflow-auto bg-muted/5 p-8 select-none"
          style={{ cursor: 'grab' }}
          title="Mit gedrückter Maustaste ziehen zum Verschieben"
        >
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease-out',
              display: 'inline-block',
              minWidth: '100%',
            }}
          >
            <div className="org-tree">
              <OrgNodeView
                node={tree}
                isRoot
                expanded={expanded}
                onToggle={toggleNode}
              />
            </div>
          </div>
        </div>
      )}

      {/*
        Top-down org chart layout. Each subtree is:
          <div class="org-node">
            <PersonCard />
            <div class="org-children">       ← horizontal row of branches
              <div class="org-branch">
                <OrgNodeView />              ← recursive
              </div>
              <div class="org-branch">...</div>
            </div>
          </div>

        Connector lines are drawn via pseudo-elements so the tree scales cleanly
        with CSS zoom and supports arbitrary children counts.
      */}
      <style>{`
        .org-tree {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          padding: 8px;
        }
        .org-node {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .org-children {
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          justify-content: center;
          padding-top: 32px;
          position: relative;
        }
        /* Vertical connector from parent card down to the horizontal branch line */
        .org-children::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          width: 2px;
          height: 16px;
          background: hsl(var(--border));
          transform: translateX(-50%);
        }
        .org-branch {
          position: relative;
          padding: 16px 14px 0 14px;
        }
        /* Horizontal connector line at the top of each branch */
        .org-branch::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: hsl(var(--border));
        }
        /* Outer branches: only half of the horizontal line is drawn */
        .org-branch:first-child::before {
          left: 50%;
        }
        .org-branch:last-child::before {
          right: 50%;
        }
        .org-branch:only-child::before {
          display: none;
        }
        /* Short vertical connector from the horizontal line down to the child card */
        .org-branch::after {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          width: 2px;
          height: 16px;
          background: hsl(var(--border));
          transform: translateX(-50%);
        }
        .org-branch:only-child::after {
          display: none;
        }
      `}</style>
    </div>
  )
}

// ── A single tree node (recursive) ───────────────────────────────────────────

interface OrgNodeViewProps {
  node: OrgTreeNode
  isRoot?: boolean
  expanded: Set<string>
  onToggle: (sam: string) => void
}

function OrgNodeView({ node, isRoot = false, expanded, onToggle }: OrgNodeViewProps) {
  const samKey = node.node.sam.toUpperCase()
  const hasReports = node.children.length > 0
  const isOpen = expanded.has(samKey)
  const isManager = hasReports

  return (
    <div className="org-node">
      <PersonCard
        node={node.node}
        isRoot={isRoot}
        isManager={isManager}
        isOpen={isOpen}
        hasReports={hasReports}
        reportCount={node.children.length}
        onToggle={() => onToggle(node.node.sam)}
      />
      {hasReports && isOpen && (
        <div className="org-children">
          {node.children.map(child => (
            <div key={child.node.sam} className="org-branch">
              <OrgNodeView
                node={child}
                expanded={expanded}
                onToggle={onToggle}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Person card ──────────────────────────────────────────────────────────────

interface PersonCardProps {
  node: OrgNode
  isRoot: boolean
  isManager: boolean
  isOpen: boolean
  hasReports: boolean
  reportCount: number
  onToggle: () => void
}

function PersonCard({ node, isRoot, isManager, isOpen, hasReports, reportCount, onToggle }: PersonCardProps) {
  // Manager cards are highlighted (light amber). Leaves stay neutral white.
  // The text is intentionally black against a light background — classic org
  // chart look that prints/screenshots well.
  const bg = isManager
    ? 'bg-amber-50 border-amber-300'
    : 'bg-white border-slate-300'
  const ringRoot = isRoot ? 'ring-2 ring-amber-500/60' : ''

  return (
    <div
      onClick={hasReports ? onToggle : undefined}
      role={hasReports ? 'button' : undefined}
      tabIndex={hasReports ? 0 : undefined}
      onKeyDown={hasReports ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() }
      } : undefined}
      className={`inline-block ${bg} ${ringRoot} border rounded-lg shadow-sm px-3 py-2 min-w-[220px] max-w-[320px] ${
        hasReports ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Avatar / role icon */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isRoot ? 'bg-amber-200' : isManager ? 'bg-amber-100' : 'bg-slate-100'
        }`}>
          {isRoot ? (
            <Crown size={14} className="text-amber-700" />
          ) : isManager ? (
            <UsersIcon size={14} className="text-amber-700" />
          ) : (
            <User size={14} className="text-slate-600" />
          )}
        </div>

        {/* Name + details (intentionally text-black for classic look) */}
        <div className="flex-1 min-w-0 text-black">
          <p className="text-sm font-semibold truncate flex items-center gap-1" title={node.displayName}>
            <span className="truncate">{node.displayName}</span>
            <PersonInfoButton name={node.displayName} sam={node.sam} className="shrink-0 p-0.5 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-500/10" />
          </p>
          {node.title && (
            <p className="text-[11px] text-slate-700 flex items-center gap-1 truncate" title={node.title}>
              <Briefcase size={9} className="text-slate-500 shrink-0" />
              {node.title}
            </p>
          )}
          {node.department && (
            <p className="text-[10px] text-slate-600 flex items-center gap-1 truncate" title={node.department}>
              <Building2 size={9} className="text-slate-500 shrink-0" />
              {node.department}
            </p>
          )}
          <p className="text-[10px] font-mono text-slate-500 mt-0.5">{node.sam}</p>
        </div>

        {/* Expand chevron */}
        {hasReports && (
          <div className="shrink-0 flex flex-col items-center gap-0.5 text-slate-600">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-[9px] font-semibold">{reportCount}</span>
          </div>
        )}
      </div>
    </div>
  )
}
