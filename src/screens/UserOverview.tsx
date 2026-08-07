import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Users as UsersIcon, RefreshCw, Loader, Search, Filter, ChevronDown,
  CheckCircle, XCircle, Send, Terminal, Zap, Info, X, Play, Eye,
  ListFilter, Monitor, User as UserIcon, Briefcase, Building2, Cpu,
} from 'lucide-react'
import { api } from '../electronAPI'
import { useAppStore } from '../store/appStore'
import { useIsAdmin } from '../store/authStore'
import { useAuthStore } from '../store/authStore'
import { logDossierAction } from '../services/personDossier'
import { PersonInfoButton } from '../components/person/PersonDossier'
import { ProcessPanel } from '../components/ProcessPanel'
import { type AdUserListItem } from '../services/adUsersList'
import { ensureDailyAdUsers } from '../services/adUserDirectory'
import {
  DAILY_QUERIES, DAILY_ACTIONS, getCommandById,
  type DailyCommand, type DailyResult,
} from '../services/dailyCommands'
import type { InventoryItem } from '../types/auth'

const INVENTORY_FILE = 'inventory/inventory.json'
const CACHE_KEY = 'userOverview.cache.v1'

interface CacheData {
  users: AdUserListItem[]
  loadedAt: string
}
function loadCache(): CacheData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as CacheData
    if (!Array.isArray(d.users) || d.users.length === 0) return null
    return d
  } catch { return null }
}
function saveCache(users: AdUserListItem[], loadedAt: string) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ users, loadedAt } satisfies CacheData)) } catch {}
}
function fmtRelative(iso: string): string {
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

export interface UserRow extends AdUserListItem {
  hostnames: string[]   // from inventory.json
}

export default function UserOverview() {
  const setDevices = useAppStore(s => s.setDevices)
  const setScreen = useAppStore(s => s.setScreen)

  // ── Data load ──────────────────────────────────────────────────────────
  const [users, setUsers] = useState<AdUserListItem[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loadedAt, setLoadedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // ── Filters (Excel-style multi-select per column) ──────────────────────
  const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set())
  const [filterCorp, setFilterCorp] = useState<Set<string>>(new Set())
  const [filterDept, setFilterDept] = useState<Set<string>>(new Set())
  const [filterTitle, setFilterTitle] = useState<Set<string>>(new Set())
  const [filterHost, setFilterHost] = useState<Set<string>>(new Set())

  // ── Selection ──────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set()) // by sam (uppercase)

  // ── Daylis modal ───────────────────────────────────────────────────────
  const [daylisOpen, setDaylisOpen] = useState(false)
  // chosen host per user (only relevant when a user has multiple devices and
  // the action target (Remote Doc / Daylis) needs exactly one)
  const [chosenHostBySam, setChosenHostBySam] = useState<Map<string, string>>(new Map())

  // ── Host picker modal (shown when at least one selected user has multiple devices) ─
  const [hostPickModal, setHostPickModal] = useState<{
    kind: 'remote-doc' | 'daylis'
    candidates: UserRow[]
  } | null>(null)

  // Global ESC: closes any open modal so the screen never gets "stuck"
  // with an invisible overlay blocking inputs.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setHostPickModal(null)
      setDaylisOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Initial: from cache + fetch inventory ──────────────────────────────
  async function loadInventory() {
    try {
      const inv = await api().netReadJson<InventoryItem[]>(INVENTORY_FILE)
      setInventory(Array.isArray(inv) ? inv : [])
    } catch { setInventory([]) }
  }

  // "Neu laden": erzwingt eine frische AD-Abfrage und aktualisiert den ZENTRALEN
  // Stand (fuer alle Clients gleich).
  async function refreshUsers() {
    setLoading(true)
    setError(null)
    const { dir, error } = await ensureDailyAdUsers(true)
    if (dir) {
      setUsers(dir.users)
      setLoadedAt(dir.loadedAt)
      saveCache(dir.users, dir.loadedAt)
    } else {
      setError(error ?? 'Unbekannter Fehler')
    }
    setLoading(false)
  }

  useEffect(() => {
    void (async () => {
      // 1) Sofort aus lokalem Spiegel zeichnen (schneller erster Eindruck)
      const local = loadCache()
      if (local) { setUsers(local.users); setLoadedAt(local.loadedAt) }
      else setLoading(true)
      // 2) Zentralen Stand holen + automatisch 1x pro Tag frisch aus AD nachladen
      const { dir, error } = await ensureDailyAdUsers()
      if (dir) {
        setUsers(dir.users)
        setLoadedAt(dir.loadedAt)
        saveCache(dir.users, dir.loadedAt)
      } else if (!local && error) {
        setError(error)
      }
      setLoading(false)
    })()
    void loadInventory()
  }, [])

  // Build per-user hostname map from inventory (matched via assignedTo == sam OR displayName)
  const hostnamesBySam = useMemo<Map<string, string[]>>(() => {
    const samToHostnames = new Map<string, string[]>()
    // First pass: index inventory items by trimmed assignedTo
    const byAssigned = new Map<string, string[]>()
    for (const i of inventory) {
      const key = (i.assignedTo ?? '').trim()
      if (!key) continue
      const k = key.toUpperCase()
      if (!byAssigned.has(k)) byAssigned.set(k, [])
      byAssigned.get(k)!.push(i.name)
    }
    // For each AD user, match by sam (corpId) or displayName
    for (const u of users) {
      const hosts: string[] = []
      const samKey = u.sam.toUpperCase()
      const dnKey = (u.displayName ?? '').toUpperCase()
      const fromSam = byAssigned.get(samKey)
      const fromDn = dnKey ? byAssigned.get(dnKey) : undefined
      if (fromSam) hosts.push(...fromSam)
      if (fromDn) for (const h of fromDn) if (!hosts.includes(h)) hosts.push(h)
      // Also: inventory items where corpId matches sam
      for (const i of inventory) {
        if ((i.corpId ?? '').toUpperCase() === samKey && !hosts.includes(i.name)) hosts.push(i.name)
      }
      if (hosts.length > 0) samToHostnames.set(samKey, hosts)
    }
    return samToHostnames
  }, [inventory, users])

  const rows: UserRow[] = useMemo(() => {
    return users.map(u => ({
      ...u,
      hostnames: hostnamesBySam.get(u.sam.toUpperCase()) ?? [],
    }))
  }, [users, hostnamesBySam])

  // Distinct values per filter column
  const distinct = useMemo(() => {
    const status = new Map<string, number>()
    const corp = new Map<string, number>()
    const dept = new Map<string, number>()
    const title = new Map<string, number>()
    const host = new Map<string, number>()
    for (const r of rows) {
      const s = r.enabled ? 'Aktiv' : 'Inaktiv'
      status.set(s, (status.get(s) ?? 0) + 1)
      corp.set(r.sam, (corp.get(r.sam) ?? 0) + 1)
      const d = (r.department ?? '').trim()
      dept.set(d, (dept.get(d) ?? 0) + 1)
      const t = (r.title ?? '').trim()
      title.set(t, (title.get(t) ?? 0) + 1)
      if (r.hostnames.length === 0) host.set('', (host.get('') ?? 0) + 1)
      else for (const h of r.hostnames) host.set(h, (host.get(h) ?? 0) + 1)
    }
    return { status, corp, dept, title, host }
  }, [rows])

  const anyFilter = filterStatus.size + filterCorp.size + filterDept.size + filterTitle.size + filterHost.size > 0
  function resetAllFilters() {
    setFilterStatus(new Set()); setFilterCorp(new Set()); setFilterDept(new Set()); setFilterTitle(new Set()); setFilterHost(new Set())
  }

  // Combined filter logic (search + column filters)
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (q) {
        const matches =
          r.sam.toLowerCase().includes(q) ||
          r.displayName.toLowerCase().includes(q) ||
          (r.title ?? '').toLowerCase().includes(q) ||
          (r.department ?? '').toLowerCase().includes(q) ||
          (r.email ?? '').toLowerCase().includes(q) ||
          r.hostnames.some(h => h.toLowerCase().includes(q))
        if (!matches) return false
      }
      if (filterStatus.size > 0) {
        const s = r.enabled ? 'Aktiv' : 'Inaktiv'
        if (!filterStatus.has(s)) return false
      }
      if (filterCorp.size > 0 && !filterCorp.has(r.sam)) return false
      if (filterDept.size > 0 && !filterDept.has((r.department ?? '').trim())) return false
      if (filterTitle.size > 0 && !filterTitle.has((r.title ?? '').trim())) return false
      if (filterHost.size > 0) {
        if (r.hostnames.length === 0) {
          if (!filterHost.has('')) return false
        } else {
          if (!r.hostnames.some(h => filterHost.has(h))) return false
        }
      }
      return true
    })
  }, [rows, search, filterStatus, filterCorp, filterDept, filterTitle, filterHost])

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every(r => selected.has(r.sam.toUpperCase()))
  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelected(prev => { const n = new Set(prev); filteredRows.forEach(r => n.delete(r.sam.toUpperCase())); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); filteredRows.forEach(r => n.add(r.sam.toUpperCase())); return n })
    }
  }
  function toggleSelect(sam: string) {
    setSelected(prev => {
      const next = new Set(prev)
      const k = sam.toUpperCase()
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const selectedRows = useMemo(
    () => filteredRows.filter(r => selected.has(r.sam.toUpperCase())),
    [filteredRows, selected],
  )

  // Build the per-user host map for an action. For users with exactly one
  // hostname we use it directly; users with multiple hostnames are returned in
  // `needsPick` so the UI can show a chooser.
  function planHosts(rows: UserRow[]): { map: Map<string, string>; needsPick: UserRow[] } {
    const map = new Map<string, string>()
    const needsPick: UserRow[] = []
    for (const r of rows) {
      if (r.hostnames.length === 0) continue
      const prePicked = chosenHostBySam.get(r.sam.toUpperCase())
      if (prePicked && r.hostnames.includes(prePicked)) {
        map.set(r.sam.toUpperCase(), prePicked)
        continue
      }
      if (r.hostnames.length === 1) map.set(r.sam.toUpperCase(), r.hostnames[0])
      else needsPick.push(r)
    }
    return { map, needsPick }
  }

  // ── Actions: hand selection over to other screens ──────────────────────
  function sendToQueryMenu() {
    // Query menu can handle multiple hosts → just pass them all
    const allHosts: string[] = []
    for (const r of selectedRows) for (const h of r.hostnames) if (!allHosts.includes(h)) allHosts.push(h)
    if (allHosts.length === 0) return
    setDevices(allHosts.map((n, idx) => ({
      id: `usr-${idx}`,
      type: 'hostname' as const,
      value: n,
      resolvedHostnames: [n],
    })))
    setScreen('query-menu')
  }

  function triggerRemoteDoc() {
    const rowsWithHost = selectedRows.filter(r => r.hostnames.length > 0)
    if (rowsWithHost.length === 0) return
    if (rowsWithHost.length > 1) {
      alert('Remote Doc unterstützt nur einen Benutzer gleichzeitig. Bitte nur einen Benutzer auswählen.')
      return
    }
    const { map, needsPick } = planHosts(rowsWithHost)
    if (needsPick.length > 0) {
      setHostPickModal({ kind: 'remote-doc', candidates: needsPick })
      return
    }
    finishRemoteDoc(map)
  }

  function finishRemoteDoc(map: Map<string, string>) {
    const hosts = [...map.values()]
    if (hosts.length === 0) return
    setDevices(hosts.map((n, idx) => ({
      id: `usr-${idx}`,
      type: 'hostname' as const,
      value: n,
      resolvedHostnames: [n],
    })))
    setScreen('remote-doc')
  }

  function triggerDaylis() {
    const rowsWithHost = selectedRows.filter(r => r.hostnames.length > 0)
    const { needsPick } = planHosts(rowsWithHost)
    if (needsPick.length > 0) {
      setHostPickModal({ kind: 'daylis', candidates: needsPick })
      return
    }
    setDaylisOpen(true)
  }

  // Called from the HostPicker modal when the user confirms the choice.
  function handleHostPickConfirm(picked: Map<string, string>) {
    // Persist for subsequent re-clicks
    setChosenHostBySam(prev => {
      const next = new Map(prev)
      for (const [k, v] of picked) next.set(k, v)
      return next
    })
    const kind = hostPickModal?.kind
    setHostPickModal(null)
    // Run the originally requested action
    if (kind === 'remote-doc') {
      // Merge picks with single-host rows we already resolved
      const merged = new Map(picked)
      for (const r of selectedRows) {
        if (r.hostnames.length === 1 && !merged.has(r.sam.toUpperCase())) {
          merged.set(r.sam.toUpperCase(), r.hostnames[0])
        }
      }
      finishRemoteDoc(merged)
    } else if (kind === 'daylis') {
      setDaylisOpen(true)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <UsersIcon size={22} className="text-blue-400" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-foreground">Benutzer-Übersicht</h2>
          <p className="text-xs text-muted-foreground">
            Alle Benutzer aus SKF Marine — aktiv und inaktiv.
            {loadedAt && !loading && (
              <> · Zuletzt geladen: <span className="text-foreground">{fmtRelative(loadedAt)}</span></>
            )}
            {loading && <> · lädt …</>}
          </p>
        </div>

        <button onClick={refreshUsers} disabled={loading} title="Frisch aus Active Directory laden"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-40">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Neu laden
        </button>
      </div>

      {/* Toolbar: search + actions */}
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Name, CorpID, Abteilung, Hostname…"
            className="w-full pl-7 pr-7 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              title="Suche leeren"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              <X size={11} />
            </button>
          )}
        </div>

        <span className="text-xs text-muted-foreground">
          {filteredRows.length} von {rows.length} Benutzern
          {selected.size > 0 && <> · <strong className="text-foreground">{selected.size} ausgewählt</strong></>}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={sendToQueryMenu} disabled={selectedRows.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed">
            <Send size={12} />Zur Abfrage
          </button>
          <button onClick={triggerRemoteDoc} disabled={selectedRows.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed">
            <Terminal size={12} />Remote Doc
          </button>
          <button onClick={triggerDaylis} disabled={selectedRows.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-neutral-700 bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed font-semibold">
            <Zap size={12} />Daylis
          </button>
        </div>
      </div>

      {/* Column filters */}
      <div className="shrink-0 px-6 py-2 border-b border-border flex items-center gap-2 flex-wrap bg-muted/5">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">
          <Filter size={11} />Filter
        </span>
        <ColumnFilter label="Status"             icon={<ListFilter size={11} />} values={distinct.status} selected={filterStatus} onChange={setFilterStatus} />
        <ColumnFilter label="Corp ID"            icon={<UserIcon size={11} />}   values={distinct.corp}   selected={filterCorp}   onChange={setFilterCorp} />
        <ColumnFilter label="Abteilung"          icon={<Building2 size={11} />}  values={distinct.dept}   selected={filterDept}   onChange={setFilterDept} />
        <ColumnFilter label="Stellenbezeichnung" icon={<Briefcase size={11} />}  values={distinct.title}  selected={filterTitle}  onChange={setFilterTitle} />
        <ColumnFilter label="Hostname"           icon={<Monitor size={11} />}    values={distinct.host}   selected={filterHost}   onChange={setFilterHost} />
        {anyFilter && (
          <button onClick={resetAllFilters}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 ml-auto">
            <X size={11} />Alle Filter zurücksetzen
          </button>
        )}
      </div>

      {/* Table */}
      {error ? (
        <div className="flex flex-1 items-center justify-center text-center px-6">
          <div>
            <UsersIcon size={36} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-foreground">Benutzer konnten nicht geladen werden</p>
            <p className="text-xs text-red-300 mt-1 max-w-md">{error}</p>
            <button onClick={refreshUsers} className="mt-3 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
              Erneut versuchen
            </button>
          </div>
        </div>
      ) : loading && users.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground text-sm">
          <Loader size={14} className="animate-spin" />Benutzer werden aus Active Directory geladen …
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background border-b border-border z-10">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 w-8">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} className="accent-primary" />
                </th>
                <th className="px-3 py-2 w-20">Status</th>
                <th className="px-3 py-2 w-28 font-mono">Corp ID</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Abteilung</th>
                <th className="px-3 py-2">Stellenbezeichnung</th>
                <th className="px-3 py-2">E-Mail</th>
                <th className="px-3 py-2">Hostname(s)</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(r => {
                const isSel = selected.has(r.sam.toUpperCase())
                return (
                  <tr key={r.sam}
                    className={`border-b border-border/40 hover:bg-accent/10 cursor-pointer ${isSel ? 'bg-primary/5' : ''}`}
                    onClick={() => toggleSelect(r.sam)}>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSel} onChange={() => toggleSelect(r.sam)} className="accent-primary" />
                    </td>
                    <td className="px-3 py-2">
                      {r.enabled ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-black border border-emerald-600">
                          <CheckCircle size={9} />Aktiv
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">
                          <XCircle size={9} />Inaktiv
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-foreground">{r.sam}</td>
                    <td className="px-3 py-2 text-foreground" onClick={e => e.stopPropagation()}>
                      <span className="inline-flex items-center gap-1">{r.displayName}<PersonInfoButton name={r.displayName} sam={r.sam} /></span>
                    </td>
                    <td className="px-3 py-2 text-foreground">{r.department || <span className="text-muted-foreground/50 italic">—</span>}</td>
                    <td className="px-3 py-2 text-foreground">{r.title || <span className="text-muted-foreground/50 italic">—</span>}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.email || <span className="text-muted-foreground/50 italic">—</span>}</td>
                    <td className="px-3 py-2 font-mono text-foreground">
                      {r.hostnames.length === 0
                        ? <span className="text-muted-foreground/50 italic">—</span>
                        : r.hostnames.join(', ')}
                    </td>
                  </tr>
                )
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground text-sm">
                    Keine Benutzer entsprechen den aktuellen Filtern.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {daylisOpen && (
        <DaylisModal
          selectedRows={selectedRows}
          chosenHostBySam={chosenHostBySam}
          onClose={() => setDaylisOpen(false)}
        />
      )}

      {hostPickModal && (
        <HostPickerModal
          kind={hostPickModal.kind}
          candidates={hostPickModal.candidates}
          onConfirm={handleHostPickConfirm}
          onCancel={() => setHostPickModal(null)}
        />
      )}
    </div>
  )
}

// ── Host picker modal (when users have multiple devices) ─────────────────────

interface HostPickerModalProps {
  kind: 'remote-doc' | 'daylis'
  candidates: UserRow[]
  onConfirm: (picked: Map<string, string>) => void
  onCancel: () => void
}

function HostPickerModal({ kind, candidates, onConfirm, onCancel }: HostPickerModalProps) {
  // Initial pick: first hostname per user
  const [pick, setPick] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const r of candidates) init[r.sam.toUpperCase()] = r.hostnames[0]
    return init
  })

  const allChosen = candidates.every(r => !!pick[r.sam.toUpperCase()])

  function confirm() {
    if (!allChosen) return
    const map = new Map<string, string>()
    for (const r of candidates) map.set(r.sam.toUpperCase(), pick[r.sam.toUpperCase()])
    onConfirm(map)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onCancel}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <Monitor size={16} className="text-amber-400" />
          <h3 className="text-base font-semibold text-foreground">Gerät auswählen</h3>
          <button onClick={onCancel} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            {kind === 'remote-doc'
              ? 'Der ausgewählte Benutzer hat mehrere Geräte. Bitte wähle aus, welches Gerät du in Remote Doc öffnen möchtest.'
              : `${candidates.length === 1 ? 'Ein Benutzer hat' : `${candidates.length} Benutzer haben`} mehrere Geräte. Bitte wähle pro Benutzer ein Gerät aus — Daylis wird dann auf dem gewählten Gerät ausgeführt.`}
          </p>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {candidates.map(r => (
              <div key={r.sam} className="bg-muted/10 border border-border rounded-md p-3">
                <div className="flex items-center gap-2 mb-2">
                  <UserIcon size={12} className="text-blue-400" />
                  <span className="text-sm font-semibold text-foreground">{r.displayName}</span>
                  <span className="text-xs font-mono text-muted-foreground">{r.sam}</span>
                </div>
                <div className="space-y-1">
                  {r.hostnames.map(h => (
                    <label key={h} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/20 cursor-pointer">
                      <input
                        type="radio"
                        name={`host-${r.sam}`}
                        checked={pick[r.sam.toUpperCase()] === h}
                        onChange={() => setPick(p => ({ ...p, [r.sam.toUpperCase()]: h }))}
                        className="accent-primary"
                      />
                      <Monitor size={11} className="text-muted-foreground" />
                      <span className="text-xs font-mono text-foreground">{h}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
            Abbrechen
          </button>
          <button onClick={confirm} disabled={!allChosen}
            className={`px-3 py-1.5 text-xs rounded-md font-semibold ${
              allChosen ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}>
            Weiter
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Column filter (Excel-style) ──────────────────────────────────────────────

export interface ColumnFilterProps {
  label: string
  values: Map<string, number>
  selected: Set<string>
  onChange: (next: Set<string>) => void
  icon?: React.ReactNode
}
export function ColumnFilter({ label, values, selected, onChange, icon }: ColumnFilterProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...values.entries()]
      .filter(([v]) => !q || v.toLowerCase().includes(q) || (v === '' && '(leer)'.includes(q)))
    list.sort((a, b) => {
      if (a[0] === '' && b[0] !== '') return 1
      if (a[0] !== '' && b[0] === '') return -1
      return a[0].localeCompare(b[0], 'de', { sensitivity: 'base' })
    })
    return list
  }, [values, query])

  function toggle(v: string) {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onChange(next)
  }
  function pickAll() { const next = new Set(selected); for (const [v] of entries) next.add(v); onChange(next) }
  function pickNone() { const next = new Set(selected); for (const [v] of entries) next.delete(v); onChange(next) }

  const active = selected.size > 0

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors ${
          active ? 'border-blue-500/60 bg-blue-500/10 text-blue-300' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'
        }`}>
        {icon}<span>{label}</span>
        {active && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-200">{selected.size}</span>}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 w-72 rounded-lg border border-border bg-card shadow-2xl">
          <div className="p-2 border-b border-border space-y-2">
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder={`In ${label.toLowerCase()} suchen…`}
                className="w-full pl-7 pr-2 py-1 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            </div>
            <div className="flex items-center gap-1 text-[10px]">
              <button onClick={pickAll} className="px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">Alle</button>
              <button onClick={pickNone} className="px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">Keine</button>
              {selected.size > 0 && (
                <button onClick={() => onChange(new Set())} className="px-2 py-0.5 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 ml-auto">
                  Filter aufheben
                </button>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {entries.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Keine Werte</p>
            ) : entries.map(([v, count]) => {
              const checked = selected.has(v)
              return (
                <label key={v || '__empty__'} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/20 cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={() => toggle(v)} className="rounded accent-primary" />
                  <span className={`flex-1 truncate ${v === '' ? 'italic text-muted-foreground' : 'text-foreground'}`}>
                    {v || '(leer)'}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70">{count}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Daylis modal ─────────────────────────────────────────────────────────────

export interface DaylisModalProps {
  selectedRows: UserRow[]
  chosenHostBySam: Map<string, string>
  onClose: () => void
}

interface RunResultRow {
  sam: string
  displayName: string
  hostname: string         // '' if user-only command
  commandId: string
  commandLabel: string
  status: 'pending' | 'running' | 'done' | 'error'
  text?: string
}

export function DaylisModal({ selectedRows, chosenHostBySam, onClose }: DaylisModalProps) {
  const isAdmin = useIsAdmin()
  const dsAuthUser = useAuthStore(s => s.session?.user)
  const dsCurrentUser = dsAuthUser?.displayName || dsAuthUser?.username || 'unbekannt'
  const [pickedQueries, setPickedQueries] = useState<Set<string>>(new Set())
  const [pickedActions, setPickedActions] = useState<Set<string>>(new Set())
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [results, setResults] = useState<RunResultRow[]>([])
  const [running, setRunning] = useState(false)
  const [procHost, setProcHost] = useState<string | null>(null)

  // Aufgeloeste (eindeutige) Hosts der Auswahl — Prozess-Verwaltung braucht genau einen.
  const resolvedHosts = useMemo(() => {
    const hs = selectedRows.map(r => chosenHostBySam.get(r.sam.toUpperCase()) ?? (r.hostnames[0] || '')).filter(Boolean)
    return [...new Set(hs)]
  }, [selectedRows, chosenHostBySam])
  const singleHost = resolvedHosts.length === 1 ? resolvedHosts[0] : ''

  const allPicked = useMemo(() => [
    ...DAILY_QUERIES.filter(c => pickedQueries.has(c.id)),
    ...DAILY_ACTIONS.filter(c => pickedActions.has(c.id)),
  ], [pickedQueries, pickedActions])

  // Determine which parameter fields are needed by the picked commands
  const neededParams = useMemo(() => {
    const map = new Map<string, { name: string; label: string; type?: 'text' | 'password' }>()
    for (const c of allPicked) {
      if (c.needsParams) for (const p of c.needsParams) map.set(p.name, p)
    }
    return [...map.values()]
  }, [allPicked])

  function toggle(set: Set<string>, setSet: (n: Set<string>) => void, id: string) {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSet(next)
  }

  async function execute() {
    if (allPicked.length === 0) return
    const queue: RunResultRow[] = []
    for (const row of selectedRows) {
      // For host-requiring commands we use exactly ONE host per user:
      //   - if the user pre-picked one in the HostPickerModal → that one
      //   - else (single-host or no hosts) → first hostname or empty
      const chosenHost =
        chosenHostBySam.get(row.sam.toUpperCase()) ??
        (row.hostnames.length > 0 ? row.hostnames[0] : '')
      for (const c of allPicked) {
        if (c.requiresHost) {
          if (chosenHost) {
            queue.push({ sam: row.sam, displayName: row.displayName, hostname: chosenHost, commandId: c.id, commandLabel: c.label, status: 'pending' })
          } else {
            queue.push({ sam: row.sam, displayName: row.displayName, hostname: '', commandId: c.id, commandLabel: c.label, status: 'error', text: 'Kein Hostname zugewiesen' })
          }
        } else {
          // User-only commands still receive chosenHost (when available) so
          // they can use it opportunistically — e.g. "Zuletzt online" pings
          // the device first and reports "aktuell online" on success.
          queue.push({ sam: row.sam, displayName: row.displayName, hostname: chosenHost ?? '', commandId: c.id, commandLabel: c.label, status: 'pending' })
        }
      }
    }
    setResults(queue)
    setRunning(true)

    // Sequential execution (keeps load on AD/PS predictable + clear progress)
    for (let i = 0; i < queue.length; i++) {
      const r = queue[i]
      if (r.status === 'error') continue
      r.status = 'running'
      setResults([...queue])
      const cmd = getCommandById(r.commandId)
      if (!cmd) { r.status = 'error'; r.text = 'Befehl unbekannt'; setResults([...queue]); continue }
      try {
        const res: DailyResult = await cmd.run({
          hostname: r.hostname,
          sam: r.sam,
          extra: paramValues,
        })
        r.status = res.ok ? 'done' : 'error'
        r.text = res.text
      } catch (e) {
        r.status = 'error'
        r.text = e instanceof Error ? e.message : String(e)
      }
      setResults([...queue])
      // Nur AUSGEFUEHRTE Eingriffe (Aktionen, keine Abfragen) ins Personen-Dossier
      // protokollieren.
      if (r.status === 'done' && DAILY_ACTIONS.some(a => a.id === r.commandId)) {
        const on = r.hostname ? ` (Gerät: ${r.hostname})` : ''
        void logDossierAction(r.displayName, r.sam, `Daylis-Eingriff ausgeführt: ${r.commandLabel}${on}`, dsCurrentUser, 'Daylis')
      }
    }
    setRunning(false)
  }

  return (
   <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onClick={() => { if (!running) onClose() }}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-5 py-3 border-b border-border flex items-center gap-2">
          <Zap size={16} className="text-amber-400" />
          <h3 className="text-base font-semibold text-foreground">Daylis</h3>
          <span className="text-xs text-muted-foreground">
            für {selectedRows.length} {selectedRows.length === 1 ? 'Benutzer' : 'Benutzer'}
          </span>
          <button
            onClick={() => singleHost && setProcHost(singleHost)}
            disabled={!singleHost || !isAdmin}
            title={!isAdmin ? 'Nur für Admins' : singleHost ? `Prozesse auf ${singleHost} verwalten` : 'Nur für genau ein Gerät möglich'}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed">
            <Cpu size={13} />Prozesse
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: command pickers */}
          <div className="w-80 shrink-0 border-r border-border overflow-y-auto p-4 space-y-5">
            <CommandList
              title="Abfragen"
              icon={<Eye size={13} className="text-blue-400" />}
              commands={DAILY_QUERIES}
              picked={pickedQueries}
              onToggle={id => toggle(pickedQueries, setPickedQueries, id)}
            />
            <CommandList
              title="Eingriffe"
              icon={<Zap size={13} className="text-amber-400" />}
              commands={DAILY_ACTIONS}
              picked={pickedActions}
              onToggle={id => toggle(pickedActions, setPickedActions, id)}
            />

            {neededParams.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-border">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Parameter</p>
                {neededParams.map(p => (
                  <div key={p.name}>
                    <label className="text-[11px] text-muted-foreground block mb-1">{p.label}</label>
                    <input
                      type={p.type ?? 'text'}
                      value={paramValues[p.name] ?? ''}
                      onChange={e => setParamValues(v => ({ ...v, [p.name]: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={execute}
              disabled={running || allPicked.length === 0}
              className={`w-full flex items-center justify-center gap-2 py-2 text-sm rounded-md font-semibold ${
                running || allPicked.length === 0
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-amber-600 hover:bg-amber-500 text-white'
              }`}
            >
              {running ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
              Ausführen ({allPicked.length} Befehl{allPicked.length === 1 ? '' : 'e'} × {selectedRows.length} Benutzer)
            </button>
          </div>

          {/* Right: results */}
          <div className="flex-1 overflow-y-auto p-4">
            {results.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-muted-foreground text-xs">
                <div>
                  <Zap size={36} className="text-muted-foreground/20 mx-auto mb-3" />
                  <p>Wähle links Abfragen und/oder Eingriffe, dann "Ausführen".</p>
                  <p className="text-[11px] mt-1 text-muted-foreground/70">Mehrfachauswahl möglich · Eingaben (Passwort/Nachricht) erscheinen bei Bedarf.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {results.map((r, i) => (
                  <div key={i} className={`p-2 rounded-md border text-xs ${
                    r.status === 'done' ? 'border-emerald-500/30 bg-emerald-500/5' :
                    r.status === 'error' ? 'border-red-500/30 bg-red-500/5' :
                    r.status === 'running' ? 'border-blue-500/30 bg-blue-500/5' :
                    'border-border bg-muted/10'
                  }`}>
                    <div className="flex items-center gap-2">
                      {r.status === 'pending' && <span className="text-muted-foreground">⋯</span>}
                      {r.status === 'running' && <Loader size={12} className="animate-spin text-blue-400" />}
                      {r.status === 'done' && <CheckCircle size={12} className="text-emerald-400" />}
                      {r.status === 'error' && <XCircle size={12} className="text-red-400" />}
                      <span className="font-semibold text-foreground">{r.displayName}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="font-mono text-muted-foreground">{r.sam}</span>
                      {r.hostname && (<>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-mono text-foreground">{r.hostname}</span>
                      </>)}
                      <span className="text-muted-foreground">·</span>
                      <span className="text-foreground">{r.commandLabel}</span>
                    </div>
                    {r.text && (
                      <pre className="text-[11px] mt-1 ml-6 whitespace-pre-wrap font-mono text-muted-foreground">
                        {r.text}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {procHost && (
      <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={e => { e.stopPropagation(); setProcHost(null) }}>
        <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="shrink-0 px-5 py-3 border-b border-border flex items-center gap-2">
            <Cpu size={16} className="text-blue-400" />
            <h3 className="text-base font-semibold text-foreground">Prozesse — {procHost}</h3>
            <button onClick={() => setProcHost(null)} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><X size={16} /></button>
          </div>
          <div className="overflow-y-auto"><ProcessPanel hostname={procHost} isAdmin={isAdmin} /></div>
        </div>
      </div>
    )}
   </>
  )
}

function CommandList({ title, icon, commands, picked, onToggle }: {
  title: string
  icon: React.ReactNode
  commands: DailyCommand[]
  picked: Set<string>
  onToggle: (id: string) => void
}) {
  const [infoFor, setInfoFor] = useState<string | null>(null)
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
        {icon}{title}
      </p>
      <div className="space-y-0.5">
        {commands.map(c => {
          const isPicked = picked.has(c.id)
          const showInfo = infoFor === c.id
          return (
            <div key={c.id}>
              <label className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer ${
                isPicked ? 'bg-amber-500/10' : 'hover:bg-accent/20'
              }`}>
                <input type="checkbox" checked={isPicked} onChange={() => onToggle(c.id)} className="accent-primary" />
                <span className="flex-1 text-foreground">{c.label}</span>
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); setInfoFor(infoFor === c.id ? null : c.id) }}
                  title="Info"
                  className={`p-1 rounded ${showInfo ? 'text-blue-300 bg-blue-500/10' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Info size={11} />
                </button>
              </label>
              {showInfo && (
                <p className="ml-7 mr-2 mt-1 mb-2 px-2 py-1 text-[10px] text-muted-foreground border-l-2 border-blue-500/40 bg-blue-500/5 rounded-r">
                  {c.info}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
