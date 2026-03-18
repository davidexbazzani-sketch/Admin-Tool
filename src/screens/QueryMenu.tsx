import { useState } from 'react'
import { ChevronDown, ChevronRight, Play, ArrowLeft, CheckSquare, Square } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { QUERY_DEFINITIONS, QUERY_CATEGORIES } from '../utils/queries'
import type { QueryId, QueryResult } from '../types'
import { api } from '../electronAPI'
import Spinner from '../components/Spinner'

export default function QueryMenu() {
  const setScreen = useAppStore((s) => s.setScreen)
  const devices = useAppStore((s) => s.devices)
  const isAdmin = useAppStore((s) => s.isAdmin)
  const selectedQueryIds = useAppStore((s) => s.selectedQueryIds)
  const toggleQuery = useAppStore((s) => s.toggleQuery)
  const setSelectedQueryIds = useAppStore((s) => s.setSelectedQueryIds)
  const setResults = useAppStore((s) => s.setResults)
  const updateResult = useAppStore((s) => s.updateResult)
  const setIsQuerying = useAppStore((s) => s.setIsQuerying)
  const isQuerying = useAppStore((s) => s.isQuerying)

  const [openCategories, setOpenCategories] = useState<Set<string>>(
    new Set(QUERY_CATEGORIES.map((c) => c.key))
  )
  const [progress, setProgress] = useState<Record<string, string>>({})

  function toggleCategory(key: string) {
    setOpenCategories((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAll() {
    const ids = QUERY_DEFINITIONS
      .filter((q) => !q.adminOnly || isAdmin)
      .map((q) => q.id)
    setSelectedQueryIds(ids)
  }

  function selectNone() {
    setSelectedQueryIds([])
  }

  function selectCategory(catKey: string) {
    const catIds = QUERY_DEFINITIONS
      .filter((q) => q.category === catKey && (!q.adminOnly || isAdmin))
      .map((q) => q.id)
    const allSelected = catIds.every((id) => selectedQueryIds.includes(id))
    if (allSelected) {
      setSelectedQueryIds(selectedQueryIds.filter((id) => !catIds.includes(id)))
    } else {
      const merged = Array.from(new Set([...selectedQueryIds, ...catIds]))
      setSelectedQueryIds(merged)
    }
  }

  async function runQueries() {
    if (selectedQueryIds.length === 0) return

    // Collect all hostnames to query
    const hostnames: string[] = []
    for (const d of devices) {
      for (const h of d.resolvedHostnames) {
        if (h && !hostnames.includes(h)) hostnames.push(h)
      }
    }
    if (hostnames.length === 0) return

    setIsQuerying(true)
    setResults([])
    const newProgress: Record<string, string> = {}
    setProgress(newProgress)

    const queries = QUERY_DEFINITIONS.filter((q) => selectedQueryIds.includes(q.id))

    // Build all tasks
    const tasks: Array<() => Promise<void>> = []
    for (const hostname of hostnames) {
      for (const q of queries) {
        tasks.push(async () => {
          const key = `${hostname}::${q.id}`
          setProgress((p) => ({ ...p, [key]: 'running' }))

          const partial: QueryResult = {
            queryId: q.id,
            hostname,
            status: 'running',
            output: '',
            timestamp: Date.now(),
          }
          updateResult(partial)

          try {
            const result = await api().runPowerShell(q.psCommand(hostname), 30000)
            const done: QueryResult = {
              queryId: q.id,
              hostname,
              status: result.timedOut ? 'timeout' : result.exitCode === 0 ? 'done' : 'error',
              output: result.stdout || result.stderr,
              error: result.exitCode !== 0 ? result.stderr : undefined,
              timestamp: Date.now(),
            }
            updateResult(done)
            setProgress((p) => ({ ...p, [key]: done.status }))
          } catch (err) {
            updateResult({
              queryId: q.id,
              hostname,
              status: 'error',
              output: '',
              error: String(err),
              timestamp: Date.now(),
            })
            setProgress((p) => ({ ...p, [key]: 'error' }))
          }
        })
      }
    }

    // Run all in parallel (batched 5 at a time)
    const BATCH = 5
    for (let i = 0; i < tasks.length; i += BATCH) {
      await Promise.all(tasks.slice(i, i + BATCH).map((fn) => fn()))
    }

    setIsQuerying(false)
    setScreen('results')
  }

  const total = Object.keys(progress).length
  const done = Object.values(progress).filter((s) => s !== 'running').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setScreen('home')}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">Abfrage-Menü</h1>
            <p className="text-xs text-muted-foreground">
              {devices.length} Gerät(e) | {selectedQueryIds.length} Abfrage(n) ausgewählt
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={selectAll} className="text-xs text-primary hover:underline">Alle auswählen</button>
          <span className="text-muted-foreground">·</span>
          <button onClick={selectNone} className="text-xs text-muted-foreground hover:underline">Keine</button>
          <button
            onClick={runQueries}
            disabled={selectedQueryIds.length === 0 || isQuerying}
            className="ml-3 flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isQuerying ? <Spinner size={14} /> : <Play size={14} />}
            {isQuerying ? `Läuft… (${done}/${total})` : 'Abfrage starten'}
          </button>
        </div>
      </div>

      {/* Device summary */}
      <div className="px-6 py-3 border-b border-border bg-muted/30 shrink-0">
        <div className="flex flex-wrap gap-2">
          {devices.map((d) =>
            d.resolvedHostnames.map((h) => (
              <span key={h} className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20 font-mono">
                {h}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Query list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {QUERY_CATEGORIES.map((cat) => {
          const queries = QUERY_DEFINITIONS.filter((q) => q.category === cat.key)
          const available = queries.filter((q) => !q.adminOnly || isAdmin)
          const locked = queries.filter((q) => q.adminOnly && !isAdmin)
          const catSelected = available.filter((q) => selectedQueryIds.includes(q.id))
          const isOpen = openCategories.has(cat.key)

          return (
            <div key={cat.key} className="border border-border rounded-xl overflow-hidden">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat.key)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/50 transition-colors"
              >
                <span className="text-base">{cat.icon}</span>
                <span className="flex-1 text-left text-sm font-semibold text-foreground">{cat.key}</span>
                {cat.adminOnly && !isAdmin && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Nur Admin
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); selectCategory(cat.key) }}
                  className="text-xs text-primary hover:underline mr-2"
                >
                  {catSelected.length === available.length && available.length > 0 ? 'Alle ab' : 'Alle'}
                </button>
                <span className="text-xs text-muted-foreground">
                  {catSelected.length}/{available.length}
                </span>
                <span className="ml-1 text-muted-foreground">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>

              {isOpen && (
                <div className="divide-y divide-border">
                  {available.map((q) => {
                    const checked = selectedQueryIds.includes(q.id)
                    return (
                      <label
                        key={q.id}
                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-accent/30 transition-colors"
                      >
                        <span className={checked ? 'text-primary' : 'text-muted-foreground'}>
                          {checked ? <CheckSquare size={15} /> : <Square size={15} />}
                        </span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggleQuery(q.id)}
                        />
                        <span className="text-sm text-foreground">{q.label}</span>
                      </label>
                    )
                  })}
                  {locked.map((q) => (
                    <div key={q.id} className="flex items-center gap-3 px-4 py-2.5 opacity-40">
                      <Square size={15} className="text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{q.label}</span>
                      <span className="ml-auto text-[10px] text-amber-400">🔐 Admin</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
