// ── Onboarding-Übersicht ──────────────────────────────────────────────────────
// Startansicht des Onboarding-Screens: Wer startet demnaechst (aus der
// Mitarbeiterverwaltung), welche Rechner sind der Person zugeordnet, und liegt
// die Onboarding-HTML schon auf dem Public Desktop? Status kommt aus zwei
// Quellen: dem zentralen Verteil-Protokoll (sofort sichtbar) und einem
// Live-Check per Test-Path (max. 3 parallel, offline-PCs blocken nicht).

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2, RefreshCw, Rocket, CheckCircle2, XCircle, WifiOff, HelpCircle,
  Calendar, MonitorSmartphone, Users, Search,
} from 'lucide-react'
import { api } from '../../electronAPI'
import { listEmployees, daysUntil, formatGermanDate, type Employee } from '../../services/employees'
import { loadDevices, type EndpointDevice } from '../../services/endpointDevices'
import { samePerson } from '../../services/personMasterData'
import { loadDeployments, type OnboardingDeployment } from '../../services/onboarding'
import { checkDesktopStatus, type DesktopStatus } from '../../services/onboardingDeploy'
import { PersonInfoButton } from '../person/PersonDossier'
import type { InventoryItem } from '../../types/auth'

interface Row {
  emp: Employee
  hosts: string[]
  lastDeploy?: OnboardingDeployment
}

type LiveStatus = DesktopStatus | 'checking' | 'unknown'

/** Wie weit zurueck gestartete Mitarbeiter noch angezeigt werden (Tage). */
const SHOW_STARTED_DAYS = 14

export default function OnboardingOverview({ onDeploy, onDeployExisting }: {
  onDeploy: (employeeId: string) => void
  onDeployExisting: () => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<Record<string, LiveStatus>>({})   // hostname -> Status
  const [checking, setChecking] = useState(false)
  // Filter
  const [search, setSearch] = useState('')
  const [startFrom, setStartFrom] = useState('')   // YYYY-MM-DD (Start ab)
  const [startTo, setStartTo] = useState('')       // YYYY-MM-DD (Start bis)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [emps, deployments, inventory, endpoint] = await Promise.all([
        listEmployees(),
        loadDeployments(),
        api().netReadJson<InventoryItem[]>('inventory/inventory.json').catch(() => null),
        loadDevices().catch(() => [] as EndpointDevice[]),
      ])
      const inv = Array.isArray(inventory) ? inventory : []
      const out: Row[] = emps.map(emp => {
        const fullName = `${emp.vorname} ${emp.name}`.trim()
        const gid = (emp.globalId || '').trim().toLowerCase()
        const hosts = new Set<string>()
        for (const it of inv) {
          const match = (it.assignedTo && samePerson(it.assignedTo, fullName)) ||
            (gid && ((it.corpId && it.corpId.trim().toLowerCase() === gid) || (it.assignedTo && it.assignedTo.trim().toLowerCase() === gid)))
          if (match && it.name) hosts.add(it.name.trim().toUpperCase())
        }
        for (const d of endpoint) {
          const match = (d.assignedTo && samePerson(d.assignedTo, fullName)) ||
            (gid && d.assignedTo.trim().toLowerCase() === gid)
          if (match && (d.hostname || d.serial)) hosts.add((d.hostname || d.serial).trim().toUpperCase())
        }
        const lastDeploy = deployments.find(x =>
          (x.employeeId && x.employeeId === emp.id) || samePerson(x.personName, fullName))
        return { emp, hosts: [...hosts], lastDeploy }
      })
      setRows(out)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // ── Filter ──────────────────────────────────────────────────────────────────
  // Ohne aktiven Filter: nur anstehende / kürzlich gestartete (wie bisher).
  // Sobald Suche oder ein Start-Datum gesetzt ist, wird diese Begrenzung
  // aufgehoben → man sieht ALLE passenden Mitarbeiter (z. B. „Start ab 01.09.2026").
  const hasFilter = !!(search.trim() || startFrom || startTo)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const res = rows.filter(({ emp, hosts }) => {
      if (!hasFilter) {
        const d = daysUntil(emp.startDate)
        if (!(isNaN(d) || d >= -SHOW_STARTED_DAYS)) return false
      }
      if (startFrom && !(emp.startDate && emp.startDate >= startFrom)) return false
      if (startTo && !(emp.startDate && emp.startDate <= startTo)) return false
      if (q) {
        const hay = `${emp.vorname} ${emp.name} ${emp.globalId || ''} ${hosts.join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return res.slice().sort((a, b) => (a.emp.startDate || '9999-99-99').localeCompare(b.emp.startDate || '9999-99-99'))
  }, [rows, search, startFrom, startTo, hasFilter])

  // ── Live-Check (max. 3 parallel) ────────────────────────────────────────────
  const allHosts = useMemo(() => [...new Set(filtered.flatMap(r => r.hosts))], [filtered])

  const runChecks = useCallback(async (hosts: string[]) => {
    if (hosts.length === 0 || checking) return
    setChecking(true)
    setStatus(prev => {
      const next = { ...prev }
      for (const h of hosts) next[h] = 'checking'
      return next
    })
    try {
      const queue = [...hosts]
      const worker = async () => {
        for (;;) {
          const h = queue.shift()
          if (!h) return
          const st = await checkDesktopStatus(h)
          setStatus(prev => ({ ...prev, [h]: st }))
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, () => worker()))
    } finally {
      setChecking(false)
    }
  }, [checking])

  // Automatischer Check nach dem Laden (im Hintergrund, blockiert nichts)
  useEffect(() => {
    if (!loading && allHosts.length > 0) {
      const unchecked = allHosts.filter(h => !status[h])
      if (unchecked.length > 0) void runChecks(unchecked)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, allHosts.join('|')])

  function statusBadge(h: string) {
    const st: LiveStatus = status[h] ?? 'unknown'
    if (st === 'checking') return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 size={9} className="animate-spin" />prüfe…</span>
    if (st === 'present') return <span className="inline-flex items-center gap-1 text-[10px] text-green-400" title="HTML liegt auf dem Public Desktop"><CheckCircle2 size={10} />liegt drauf</span>
    if (st === 'missing') return <span className="inline-flex items-center gap-1 text-[10px] text-red-400" title="HTML liegt NICHT auf dem Desktop"><XCircle size={10} />fehlt</span>
    if (st === 'offline') return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title="PC nicht erreichbar (SMB 445)"><WifiOff size={10} />offline</span>
    return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60"><HelpCircle size={10} />—</span>
  }

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />Lade Übersicht…</div>
  }

  return (
    <div className="max-w-5xl space-y-3 pb-8">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{filtered.length}</span>{hasFilter ? ` von ${rows.length}` : ''} Mitarbeiter
          {hasFilter ? ' (gefiltert)' : ' mit anstehendem oder kürzlichem Start'} (Quelle: Mitarbeiterverwaltung).
        </p>
        <button onClick={onDeployExisting}
          className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground"
          title="Dashboard an eine Person verteilen, die schon länger dabei ist (Namenssuche im AD, allgemeine Begrüßung)">
          <Users size={12} />An bestehenden Mitarbeiter verteilen
        </button>
        <button onClick={() => runChecks(allHosts)} disabled={checking || allHosts.length === 0}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
          {checking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}Status aller Rechner prüfen
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-end gap-2 flex-wrap rounded-lg border border-border bg-card px-3 py-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, Global-ID oder Rechner…"
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
        </div>
        <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">Start ab
          <input type="date" value={startFrom} onChange={e => setStartFrom(e.target.value)}
            className="px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">Start bis
          <input type="date" value={startTo} onChange={e => setStartTo(e.target.value)}
            className="px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
        </label>
        {hasFilter && (
          <button onClick={() => { setSearch(''); setStartFrom(''); setStartTo('') }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground">
            <XCircle size={12} />Filter zurücksetzen
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground rounded-lg border border-border bg-card">
          {hasFilter ? 'Keine Mitarbeiter für diesen Filter.' : 'Keine anstehenden Starts. Neue Mitarbeiter werden in der Mitarbeiterverwaltung gepflegt.'}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card text-muted-foreground text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Start</th>
                <th className="text-left px-3 py-2 font-medium">Mitarbeiter</th>
                <th className="text-left px-3 py-2 font-medium">Rechner &amp; HTML-Status</th>
                <th className="text-left px-3 py-2 font-medium">Zuletzt verteilt</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ emp, hosts, lastDeploy }) => {
                const days = daysUntil(emp.startDate)
                const fullName = `${emp.vorname} ${emp.name}`.trim()
                return (
                  <tr key={emp.id} className="border-t border-border hover:bg-accent/20 align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-foreground"><Calendar size={12} className="text-muted-foreground" />{emp.startDate ? formatGermanDate(emp.startDate) : '—'}</span>
                      {!isNaN(days) && (
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${days < 0 ? 'bg-accent text-muted-foreground' : days <= 5 ? 'bg-amber-500/20 text-amber-200' : 'bg-accent text-muted-foreground'}`}>
                          {days < 0 ? 'gestartet' : days === 0 ? 'heute' : `in ${days} T`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 text-foreground">{fullName}<PersonInfoButton name={fullName} sam={emp.globalId || undefined} /></span>
                      {emp.globalId && <span className="block text-[10px] font-mono text-muted-foreground">{emp.globalId}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {hosts.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Kein Rechner zugeordnet</span>
                      ) : (
                        <div className="space-y-0.5">
                          {hosts.map(h => (
                            <div key={h} className="flex items-center gap-2">
                              <MonitorSmartphone size={11} className="text-muted-foreground shrink-0" />
                              <span className="text-xs font-mono text-foreground">{h}</span>
                              {statusBadge(h)}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {lastDeploy ? (
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(lastDeploy.deployedAt).toLocaleDateString('de-DE')} auf <span className="font-mono text-foreground">{lastDeploy.hostname}</span>
                          <span className="block">von {lastDeploy.deployedBy}</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/60">noch nie</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => onDeploy(emp.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
                        <Rocket size={12} />Verteilen
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
