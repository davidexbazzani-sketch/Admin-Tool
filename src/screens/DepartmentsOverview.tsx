import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Building2, Loader, Search, RefreshCw, Crown, User, Briefcase,
  Monitor, Users as UsersIcon, ChevronRight, ArrowUpRight, Mail,
} from 'lucide-react'
import { api } from '../electronAPI'
import { PersonInfoButton } from '../components/person/PersonDossier'
import { ensureDailyAdUsers } from '../services/adUserDirectory'
import type { AdUserListItem } from '../services/adUsersList'
import type { InventoryItem } from '../types/auth'

const INVENTORY_FILE = 'inventory/inventory.json'

// Eine "Abteilung" = eine Person, die mindestens einen direkten Untergebenen hat.
interface ManagerDept {
  sam: string
  name: string
  title?: string
  department?: string
  enabled?: boolean
  email?: string
  managerName?: string     // eigener Vorgesetzter
  managerSam?: string
  reports: AdUserListItem[] // direkte Untergebene
}

const SIDEBAR_WIDTH_KEY = 'departmentsOverview.sidebarWidth'
const SIDEBAR_DEFAULT = 320
const SIDEBAR_MIN = 220
const SIDEBAR_MAX = 800

function byName(a: { displayName?: string; name?: string }, b: { displayName?: string; name?: string }): number {
  return (a.displayName ?? a.name ?? '').localeCompare(b.displayName ?? b.name ?? '', 'de', { sensitivity: 'base' })
}

export default function DepartmentsOverview() {
  const [users, setUsers] = useState<AdUserListItem[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadedAt, setLoadedAt] = useState<string>('')
  const [selected, setSelected] = useState<string | null>(null)  // managerSam (lowercase)
  const [search, setSearch] = useState('')

  // ── Resizable sidebar (persisted in localStorage) ────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY)
      if (stored) {
        const n = parseInt(stored, 10)
        if (n >= SIDEBAR_MIN && n <= SIDEBAR_MAX) return n
      }
    } catch {}
    return SIDEBAR_DEFAULT
  })
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current || !splitContainerRef.current) return
      const rect = splitContainerRef.current.getBoundingClientRect()
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX - rect.left))
      setSidebarWidth(w)
    }
    function onUp() {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)) } catch {}
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [sidebarWidth])

  function startDrag(e: React.MouseEvent) {
    draggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }
  function resetSidebarWidth() {
    setSidebarWidth(SIDEBAR_DEFAULT)
    try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(SIDEBAR_DEFAULT)) } catch {}
  }

  // Inventar (fuer die Geraete-Zuordnung pro Person) + AD-Verzeichnis laden.
  async function loadAll(force = false) {
    if (force) setRefreshing(true); else setLoading(true)
    try {
      const [dir, inv] = await Promise.all([
        ensureDailyAdUsers(force),
        api().netReadJson<InventoryItem[]>(INVENTORY_FILE).catch(() => [] as InventoryItem[]),
      ])
      setUsers(dir.dir?.users ?? [])
      setLoadedAt(dir.dir?.loadedAt ?? '')
      setItems(Array.isArray(inv) ? inv : [])
    } catch {
      setUsers([]); setItems([])
    }
    setLoading(false); setRefreshing(false)
  }

  useEffect(() => { loadAll(false) }, [])

  // Geraete je Corp-ID (fuer die Zuordnung zu den Personen)
  const devicesByCorp = useMemo(() => {
    const m = new Map<string, InventoryItem[]>()
    for (const it of items) {
      const c = (it.corpId ?? '').toLowerCase().trim()
      if (!c) continue
      if (!m.has(c)) m.set(c, [])
      m.get(c)!.push(it)
    }
    return m
  }, [items])

  // Untergebene je Vorgesetztem (aus der AD-Manager-Verknuepfung).
  const reportsByManager = useMemo(() => {
    const m = new Map<string, AdUserListItem[]>()
    for (const u of users) {
      const mgr = (u.managerSam ?? '').toLowerCase().trim()
      if (!mgr) continue
      if (!m.has(mgr)) m.set(mgr, [])
      m.get(mgr)!.push(u)
    }
    return m
  }, [users])

  const bySam = useMemo(() => {
    const m = new Map<string, AdUserListItem>()
    for (const u of users) m.set(u.sam.toLowerCase(), u)
    return m
  }, [users])

  // "Abteilungen" = alle Personen, die mindestens einen Untergebenen haben.
  const managers = useMemo<ManagerDept[]>(() => {
    const list: ManagerDept[] = []
    for (const [mgrSam, reports] of reportsByManager.entries()) {
      const u = bySam.get(mgrSam)
      const name = u?.displayName || reports[0]?.managerName || mgrSam
      const sorted = [...reports].sort(byName)
      list.push({
        sam: u?.sam ?? mgrSam,
        name,
        title: u?.title,
        department: u?.department,
        enabled: u?.enabled,
        email: u?.email,
        managerName: u?.managerName,
        managerSam: u?.managerSam,
        reports: sorted,
      })
    }
    list.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }))
    return list
  }, [reportsByManager, bySam])

  const filteredManagers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return managers
    return managers.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.sam.toLowerCase().includes(q) ||
      (m.title ?? '').toLowerCase().includes(q) ||
      (m.department ?? '').toLowerCase().includes(q),
    )
  }, [managers, search])

  const current = useMemo(
    () => managers.find(m => m.sam.toLowerCase() === selected) ?? null,
    [managers, selected],
  )

  const isManager = (sam?: string) => !!sam && reportsByManager.has(sam.toLowerCase())

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <Building2 size={22} className="text-blue-400" />
        <div className="flex-1">
          <h2 className="text-lg font-bold text-foreground">Abteilungs-Übersicht</h2>
          <p className="text-xs text-muted-foreground">
            Jede Person mit Untergebenen = eine Abteilung — aus der AD-Vorgesetzten-Struktur
            {loadedAt && <span> · Stand: {new Date(loadedAt).toLocaleString('de-DE')}</span>}
          </p>
        </div>
        <button onClick={() => loadAll(true)} disabled={loading || refreshing}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground text-xs"
          title="Frisch aus Active Directory laden (dauert ggf. 1–2 Minuten)">
          <RefreshCw size={13} className={loading || refreshing ? 'animate-spin' : ''} />
          AD aktualisieren
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground text-sm">
          <Loader size={14} className="animate-spin" />Lade…
        </div>
      ) : managers.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center px-6">
          <div>
            <Building2 size={36} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-foreground">Keine Vorgesetzten-Struktur gefunden</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              {users.length === 0
                ? 'Es ist noch kein AD-Benutzerverzeichnis vorhanden.'
                : 'Die vorhandenen AD-Daten enthalten noch keine Vorgesetzten-Verknüpfung.'}{' '}
              Klicke auf <strong>„AD aktualisieren"</strong>, um die aktuelle Struktur aus Active Directory zu laden.
            </p>
            <button onClick={() => loadAll(true)} disabled={refreshing}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {refreshing ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}AD aktualisieren
            </button>
          </div>
        </div>
      ) : (
        <div ref={splitContainerRef} className="flex flex-1 overflow-hidden">
          {/* Left: manager (=department) list */}
          <div
            className="shrink-0 border-r border-border flex flex-col overflow-hidden"
            style={{ width: `${sidebarWidth}px` }}
          >
            <div className="shrink-0 p-3 border-b border-border">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Person / Corp ID / Stelle suchen…"
                  className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {filteredManagers.length} von {managers.length} Personen mit Untergebenen
              </p>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {filteredManagers.map(d => {
                const active = d.sam.toLowerCase() === selected
                return (
                  <button
                    key={d.sam}
                    onClick={() => setSelected(d.sam.toLowerCase())}
                    className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors border-l-2 ${
                      active ? 'bg-blue-500/10 border-blue-500' : 'border-transparent hover:bg-accent/20'
                    }`}
                  >
                    <Crown size={13} className={`mt-0.5 shrink-0 ${active ? 'text-amber-400' : 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${active ? 'text-foreground' : 'text-foreground/90'}`}>
                        {d.name}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span className="inline-flex items-center gap-0.5">
                          <UsersIcon size={9} />{d.reports.length}
                        </span>
                        <span className="font-mono">{d.sam}</span>
                        {d.title && <span className="truncate max-w-[110px]" title={d.title}>· {d.title}</span>}
                      </div>
                    </div>
                    {active && <ChevronRight size={12} className="text-blue-400 shrink-0 mt-0.5" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Drag handle */}
          <div
            onMouseDown={startDrag}
            onDoubleClick={resetSidebarWidth}
            title="Ziehen zum Vergroessern · Doppelklick = Standardbreite"
            className="w-1 shrink-0 cursor-col-resize bg-border/40 hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors"
          />

          {/* Right: detail */}
          <div className="flex-1 overflow-y-auto">
            {!current ? (
              <div className="flex h-full items-center justify-center text-center px-6">
                <div>
                  <Crown size={36} className="text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-foreground">Person wählen</p>
                  <p className="text-xs text-muted-foreground mt-1">Links auf eine Person klicken, um ihre Untergebenen zu sehen.</p>
                </div>
              </div>
            ) : (
              <div className="p-6 max-w-4xl">
                {/* Header */}
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                    <User size={18} className="text-amber-300" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xl font-bold text-foreground flex items-center gap-1.5">
                      {current.name}
                      <PersonInfoButton name={current.name} sam={current.sam} size={15} />
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span className="font-mono">{current.sam}</span>
                      {current.title && <span className="inline-flex items-center gap-1"><Briefcase size={11} className="text-purple-400" />{current.title}</span>}
                      {current.department && <span>· {current.department}</span>}
                      {current.email && <span className="inline-flex items-center gap-1"><Mail size={11} />{current.email}</span>}
                    </div>
                  </div>
                </div>

                {/* Eigener Vorgesetzter */}
                {current.managerName && (
                  <p className="text-[11px] text-muted-foreground mb-4 flex items-center gap-1">
                    Vorgesetzter:
                    {isManager(current.managerSam) ? (
                      <button onClick={() => setSelected((current.managerSam ?? '').toLowerCase())}
                        className="inline-flex items-center gap-0.5 text-blue-300 hover:underline">
                        {current.managerName}<ArrowUpRight size={10} />
                      </button>
                    ) : (
                      <span className="text-foreground">{current.managerName}</span>
                    )}
                    <PersonInfoButton name={current.managerName} sam={current.managerSam} size={12} />
                  </p>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-card border border-border rounded-lg p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Direkte Untergebene</p>
                    <p className="text-2xl font-bold text-foreground">{current.reports.length}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">davon selbst Leiter</p>
                    <p className="text-2xl font-bold text-foreground">{current.reports.filter(r => isManager(r.sam)).length}</p>
                  </div>
                </div>

                {/* Untergebene */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[1.6fr_0.7fr_1.4fr_1fr] gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-border bg-muted/10">
                    <span>Name</span>
                    <span>Corp ID</span>
                    <span>Stellenbezeichnung</span>
                    <span>Gerät(e)</span>
                  </div>
                  <div className="divide-y divide-border">
                    {current.reports.map(r => {
                      const subLeader = isManager(r.sam)
                      const devs = devicesByCorp.get(r.sam.toLowerCase()) ?? []
                      return (
                        <div
                          key={r.sam}
                          className={`grid grid-cols-[1.6fr_0.7fr_1.4fr_1fr] gap-3 px-3 py-2 text-xs items-center ${subLeader ? 'bg-amber-500/5' : ''}`}
                        >
                          <span className="text-foreground truncate flex items-center gap-1">
                            {subLeader && <Crown size={11} className="text-amber-400 shrink-0" title="Hat selbst Untergebene" />}
                            {subLeader ? (
                              <button onClick={() => setSelected(r.sam.toLowerCase())} className="truncate hover:underline text-left" title="Deren Abteilung öffnen">
                                {r.displayName}
                              </button>
                            ) : (
                              <span className="truncate">{r.displayName}</span>
                            )}
                            <PersonInfoButton name={r.displayName} sam={r.sam} />
                            {!r.enabled && <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/15 text-red-300 shrink-0">inaktiv</span>}
                          </span>
                          <span className="font-mono text-muted-foreground truncate">{r.sam}</span>
                          <span className="text-foreground truncate flex items-center gap-1">
                            {r.title ? (<><Briefcase size={11} className="text-purple-400 shrink-0" />{r.title}</>)
                              : <span className="text-muted-foreground italic">—</span>}
                          </span>
                          <span className="text-foreground truncate flex items-center gap-1" title={devs.map(d => d.name).join(', ')}>
                            {devs.length > 0 ? (
                              <><Monitor size={11} className="text-muted-foreground shrink-0" />
                                {devs.length === 1 ? devs[0].name : `${devs.length} Geräte`}</>
                            ) : <span className="text-muted-foreground italic">—</span>}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
