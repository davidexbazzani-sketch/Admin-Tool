import { useState, useEffect, useCallback } from 'react'
import { FileText, Search, RefreshCw, Loader, Download, Filter, X } from 'lucide-react'
import { api } from '../electronAPI'
import type { ActivityLog } from '../types/auth'

export default function UserLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterScreen, setFilterScreen] = useState('')
  const [filterDate, setFilterDate] = useState('')

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const all = await api().getLogs()
      setLogs(all)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadLogs() }, [loadLogs])

  const uniqueUsers   = [...new Set(logs.map(l => l.username))].sort()
  const uniqueScreens = [...new Set(logs.map(l => l.screen))].sort()

  const filtered = logs.filter(l => {
    if (filterUser   && l.username !== filterUser) return false
    if (filterScreen && l.screen   !== filterScreen) return false
    if (filterDate   && !l.timestamp.startsWith(filterDate)) return false
    if (search) {
      const q = search.toLowerCase()
      return l.action.toLowerCase().includes(q) ||
             l.username.toLowerCase().includes(q) ||
             l.displayName.toLowerCase().includes(q) ||
             (l.target ?? '').toLowerCase().includes(q)
    }
    return true
  })

  function clearFilters() {
    setSearch(''); setFilterUser(''); setFilterScreen(''); setFilterDate('')
  }

  const hasFilters = search || filterUser || filterScreen || filterDate

  function exportCsv() {
    const header = 'Zeitstempel;Benutzer;Anzeigename;Aktion;Ziel;Bildschirm;Quell-PC'
    const rows = filtered.map(l =>
      [new Date(l.timestamp).toLocaleString('de-DE'), l.username, l.displayName,
       l.action, l.target ?? '', l.screen, l.sourceHost].join(';')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `activity-logs-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const screenColors: Record<string, string> = {
    'remote-doc': 'text-purple-400', 'user-info': 'text-blue-400',
    'user-management': 'text-amber-400', 'query-menu': 'text-emerald-400',
    'location-overview': 'text-cyan-400', 'scheduled-tasks': 'text-orange-400',
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <FileText size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">Benutzer-Logs</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{filtered.length} von {logs.length} Einträge</span>
          <button onClick={exportCsv} title="Als CSV exportieren"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
            <Download size={12} /> CSV
          </button>
          <button onClick={loadLogs} title="Aktualisieren"
            className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 px-6 py-3 border-b border-border bg-muted/5 flex items-center gap-3 flex-wrap">
        <Filter size={13} className="text-muted-foreground shrink-0" />
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Suchen…" className="pl-7 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary w-40" />
        </div>
        <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary">
          <option value="">Alle Benutzer</option>
          {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={filterScreen} onChange={e => setFilterScreen(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary">
          <option value="">Alle Bereiche</option>
          {uniqueScreens.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
        {hasFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X size={12} /> Filter zurücksetzen
          </button>
        )}
      </div>

      {/* Log table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-12">
            <Loader size={14} className="animate-spin" /> Logs werden geladen…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
            Keine Einträge gefunden
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/20 border-b border-border">
              <tr>
                {['Zeitstempel', 'Benutzer', 'Aktion', 'Ziel', 'Bereich', 'Quell-PC'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(l => (
                <tr key={l.id} className="hover:bg-accent/10 transition-colors">
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                    {new Date(l.timestamp).toLocaleString('de-DE')}
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium text-foreground">{l.displayName}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">@{l.username}</div>
                  </td>
                  <td className="px-4 py-2 text-foreground max-w-xs truncate" title={l.action}>{l.action}</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground">{l.target ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] font-medium ${screenColors[l.screen] ?? 'text-muted-foreground'}`}>
                      {l.screen}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground font-mono text-[10px]">{l.sourceHost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
