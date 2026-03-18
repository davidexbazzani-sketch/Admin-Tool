import { useState, useRef } from 'react'
import {
  ChevronDown, ChevronRight, Play, ArrowLeft,
  CheckSquare, Square, MessageSquare, Volume2, XCircle, Search, CheckCircle, Loader,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { QUERY_DEFINITIONS, QUERY_CATEGORIES } from '../utils/queries'
import type { QueryId, QueryResult } from '../types'
import { api } from '../electronAPI'
import Spinner from '../components/Spinner'

const MSG_CATEGORY = 'Nachrichten versenden'

// Escape single quotes for PowerShell single-quoted strings
function escapePsSingle(s: string): string {
  return s.replace(/'/g, "''")
}

export default function QueryMenu() {
  const setScreen      = useAppStore((s) => s.setScreen)
  const devices        = useAppStore((s) => s.devices)
  const isAdmin        = useAppStore((s) => s.isAdmin)
  const selectedQueryIds   = useAppStore((s) => s.selectedQueryIds)
  const toggleQuery        = useAppStore((s) => s.toggleQuery)
  const setSelectedQueryIds = useAppStore((s) => s.setSelectedQueryIds)
  const setResults     = useAppStore((s) => s.setResults)
  const updateResult   = useAppStore((s) => s.updateResult)
  const setIsQuerying  = useAppStore((s) => s.setIsQuerying)
  const isQuerying     = useAppStore((s) => s.isQuerying)

  // Start with all categories CLOSED.
  // Previously they were all open by default, which put 40+ DOM nodes into the render tree
  // on mount. Every checkbox click caused a full re-render of that entire tree.
  // With software rendering (GPU disabled on some machines) this caused the white-screen bug.
  // Starting closed means the DOM only contains 7 header buttons until the user opens a category.
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<Record<string, string>>({})
  const [cancelled, setCancelled] = useState(false)
  const cancelledRef = useRef(false)

  // ── Nachrichten state ──────────────────────────────────────────────────────
  const [msgScreenText, setMsgScreenText] = useState('')
  const [msgVoiceText,  setMsgVoiceText]  = useState('')
  const [msgVoiceLang,  setMsgVoiceLang]  = useState<'de-DE' | 'en-US'>('de-DE')

  // ── helpers ────────────────────────────────────────────────────────────────
  function toggleCategory(key: string) {
    setOpenCategories((s) => {
      const next = new Set(s)
      next.has(key) ? next.delete(key) : next.add(key)
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
      setSelectedQueryIds(Array.from(new Set([...selectedQueryIds, ...catIds])))
    }
  }

  // Build the final PowerShell command, substituting message sentinels
  function buildCommand(queryId: QueryId, hostname: string): string {
    const def = QUERY_DEFINITIONS.find((q) => q.id === queryId)!
    let cmd = def.psCommand(hostname)
    if (queryId === 'msg_screen') {
      cmd = cmd.replace('__MSG__', escapePsSingle(msgScreenText))
    } else if (queryId === 'msg_voice') {
      cmd = cmd
        .replace('__MSG__', escapePsSingle(msgVoiceText))
        .replace('__LANG__', msgVoiceLang)
    }
    return cmd
  }

  // Validation: message fields must be filled when their query is selected
  const msgScreenSelected = selectedQueryIds.includes('msg_screen')
  const msgVoiceSelected  = selectedQueryIds.includes('msg_voice')
  const msgValidationOk =
    (!msgScreenSelected || msgScreenText.trim() !== '') &&
    (!msgVoiceSelected  || msgVoiceText.trim()  !== '')

  const canRun = selectedQueryIds.length > 0 && !isQuerying && msgValidationOk

  // Collect all hostnames from selected devices
  const hostnames: string[] = []
  for (const d of devices) {
    for (const h of d.resolvedHostnames) {
      if (h && !hostnames.includes(h)) hostnames.push(h)
    }
  }

  async function cancelQueries() {
    cancelledRef.current = true
    await api().cancelAll()
    setIsQuerying(false)
    setCancelled(true)
  }

  async function runQueries() {
    if (!canRun) return
    cancelledRef.current = false
    setCancelled(false)

    if (hostnames.length === 0) return

    setIsQuerying(true)
    setResults([])
    setProgress({})

    // Sort queries so msg_screen always runs before msg_voice (per spec)
    const queryOrder: QueryId[] = ['msg_screen', 'msg_voice']
    const queries = [
      ...QUERY_DEFINITIONS.filter(
        (q) => selectedQueryIds.includes(q.id) && !queryOrder.includes(q.id)
      ),
      ...queryOrder
        .filter((id) => selectedQueryIds.includes(id))
        .map((id) => QUERY_DEFINITIONS.find((q) => q.id === id)!),
    ]

    const tasks: Array<() => Promise<void>> = []
    for (const hostname of hostnames) {
      for (const q of queries) {
        tasks.push(async () => {
          const key = `${hostname}::${q.id}`
          setProgress((p) => ({ ...p, [key]: 'running' }))
          updateResult({ queryId: q.id, hostname, status: 'running', output: '', timestamp: Date.now() })

          try {
            const cmd = buildCommand(q.id, hostname)
            const result = await api().runPowerShell(cmd, 30000)
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
            updateResult({ queryId: q.id, hostname, status: 'error', output: '', error: String(err), timestamp: Date.now() })
            setProgress((p) => ({ ...p, [key]: 'error' }))
          }
        })
      }
    }

    // Batch execution: check cancel flag before each batch
    const BATCH = 5
    for (let i = 0; i < tasks.length; i += BATCH) {
      if (cancelledRef.current) break
      await Promise.all(tasks.slice(i, i + BATCH).map((fn) => fn()))
    }

    setIsQuerying(false)
    if (!cancelledRef.current) {
      setScreen('results')
    } else {
      setCancelled(true)
    }
  }

  const total = Object.keys(progress).length
  const done  = Object.values(progress).filter((s) => s !== 'running').length

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
          <button onClick={selectAll}  className="text-xs text-primary hover:underline">Alle auswählen</button>
          <span className="text-muted-foreground">·</span>
          <button onClick={selectNone} className="text-xs text-muted-foreground hover:underline">Keine</button>
          <button
            onClick={runQueries}
            disabled={!canRun}
            title={
              !msgValidationOk
                ? 'Bitte Nachrichtentext eingeben'
                : selectedQueryIds.length === 0
                ? 'Mindestens eine Abfrage auswählen'
                : undefined
            }
            className="ml-3 flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isQuerying ? <Spinner size={14} /> : <Play size={14} />}
            {isQuerying ? `Läuft… (${done}/${total})` : 'Abfrage starten'}
          </button>
          <button
            onClick={cancelQueries}
            disabled={!isQuerying}
            title="Laufende Abfrage sofort stoppen"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/80 text-destructive-foreground text-sm font-semibold hover:bg-destructive transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <XCircle size={14} />
            Abbrechen
          </button>
        </div>
      </div>

      {/* Cancellation notice */}
      {cancelled && (
        <div className="flex items-center gap-2 px-6 py-2 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
          <XCircle size={13} className="text-amber-400 shrink-0" />
          <span className="text-xs text-amber-400 flex-1">Abfrage wurde abgebrochen.</span>
          <button
            onClick={() => setScreen('results')}
            className="text-xs text-primary hover:underline font-medium"
          >
            Teilergebnisse anzeigen →
          </button>
          <button
            onClick={() => setCancelled(false)}
            className="ml-2 text-amber-400/60 hover:text-amber-400 text-xs"
          >
            ✕
          </button>
        </div>
      )}

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
          const queries    = QUERY_DEFINITIONS.filter((q) => q.category === cat.key)
          const available  = queries.filter((q) => !q.adminOnly || isAdmin)
          const locked     = queries.filter((q) => q.adminOnly && !isAdmin)
          const catSelected = available.filter((q) => selectedQueryIds.includes(q.id))
          const isOpen     = openCategories.has(cat.key)
          const isNachricht = cat.key === MSG_CATEGORY

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
                {/* span avoids nested <button> HTML violation */}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); selectCategory(cat.key) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); selectCategory(cat.key) } }}
                  className="text-xs text-primary hover:underline mr-2 cursor-pointer select-none"
                >
                  {catSelected.length === available.length && available.length > 0 ? 'Alle ab' : 'Alle'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {catSelected.length}/{available.length}
                </span>
                <span className="ml-1 text-muted-foreground">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>

              {isOpen && (
                <div className="divide-y divide-border">
                  {/* ── Standard categories: simple checkbox rows ─────────── */}
                  {!isNachricht && (
                    <>
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
                            <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleQuery(q.id)} />
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
                    </>
                  )}

                  {/* ── Nachrichten versenden: checkbox + inline input fields ── */}
                  {isNachricht && isAdmin && (
                    <>
                      {/* Bildschirmnachricht */}
                      <NachrichtItem
                        id="msg_screen"
                        label="Bildschirmnachricht senden"
                        icon={<MessageSquare size={14} />}
                        checked={selectedQueryIds.includes('msg_screen')}
                        onToggle={() => toggleQuery('msg_screen')}
                        hint="Wird über msg.exe an den Geräteschlüssel gesendet (erfordert Netzwerkzugriff)"
                        isAdmin={isAdmin}
                        hostnames={hostnames}
                      >
                        <div>
                          <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                            Nachricht
                          </label>
                          <textarea
                            rows={3}
                            placeholder="Nachricht hier eingeben..."
                            value={msgScreenText}
                            onChange={(e) => setMsgScreenText(e.target.value)}
                            className={`
                              w-full px-3 py-2 text-sm rounded-md border bg-background text-foreground
                              placeholder:text-muted-foreground focus:outline-none resize-none transition-colors
                              ${msgScreenSelected && !msgScreenText.trim()
                                ? 'border-destructive/50 focus:border-destructive'
                                : 'border-border focus:border-primary'
                              }
                            `}
                          />
                          {msgScreenSelected && !msgScreenText.trim() && (
                            <p className="text-[11px] text-destructive mt-1">Nachrichtentext erforderlich</p>
                          )}
                        </div>
                      </NachrichtItem>

                      {/* Sprachnachricht */}
                      {/* PROBLEM 2: showWinrmCheck aktiviert den WinRM-Pre-Flight-Check */}
                      <NachrichtItem
                        id="msg_voice"
                        label="Sprachnachricht über Lautsprecher senden"
                        icon={<Volume2 size={14} />}
                        checked={selectedQueryIds.includes('msg_voice')}
                        onToggle={() => toggleQuery('msg_voice')}
                        hint="Erfordert PowerShell-Remoting (WinRM) auf dem Zielgerät"
                        isAdmin={isAdmin}
                        hostnames={hostnames}
                        showWinrmCheck={true}
                      >
                        <div className="space-y-2.5">
                          <div>
                            <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                              Sprachtext
                            </label>
                            <textarea
                              rows={3}
                              placeholder="Sprachtext hier eingeben..."
                              value={msgVoiceText}
                              onChange={(e) => setMsgVoiceText(e.target.value)}
                              className={`
                                w-full px-3 py-2 text-sm rounded-md border bg-background text-foreground
                                placeholder:text-muted-foreground focus:outline-none resize-none transition-colors
                                ${msgVoiceSelected && !msgVoiceText.trim()
                                  ? 'border-destructive/50 focus:border-destructive'
                                  : 'border-border focus:border-primary'
                                }
                              `}
                            />
                            {msgVoiceSelected && !msgVoiceText.trim() && (
                              <p className="text-[11px] text-destructive mt-1">Sprachtext erforderlich</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                              Sprache
                            </label>
                            <select
                              value={msgVoiceLang}
                              onChange={(e) => setMsgVoiceLang(e.target.value as 'de-DE' | 'en-US')}
                              className="px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary transition-colors"
                            >
                              <option value="de-DE">Deutsch (de-DE)</option>
                              <option value="en-US">Englisch (en-US)</option>
                            </select>
                          </div>
                        </div>
                      </NachrichtItem>
                    </>
                  )}

                  {/* Nachrichten-Kategorie gesperrt für Nicht-Admins */}
                  {isNachricht && !isAdmin && (
                    <>
                      {queries.map((q) => (
                        <div key={q.id} className="flex items-center gap-3 px-4 py-2.5 opacity-40">
                          <Square size={15} className="text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">{q.label}</span>
                          <span className="ml-auto text-[10px] text-amber-400">🔐 Admin</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* FIX 5: Service Check Panel – admin only */}
        {isAdmin && hostnames.length > 0 && (
          <ServiceCheckPanel hostnames={hostnames} />
        )}
      </div>
    </div>
  )
}

// ── Sub-component: expandable Nachricht row with inline inputs ─────────────────
interface NachrichtItemProps {
  id: string
  label: string
  icon: React.ReactNode
  checked: boolean
  onToggle: () => void
  hint: string
  children: React.ReactNode
  isAdmin: boolean
  hostnames: string[]
  // PROBLEM 2: showWinrmCheck=true activates the WinRM pre-flight check section (msg_voice)
  showWinrmCheck?: boolean
}

function NachrichtItem({ id, label, icon, checked, onToggle, hint, children, isAdmin, hostnames, showWinrmCheck }: NachrichtItemProps) {
  // PROBLEM 2: WinRM status per hostname – only used when showWinrmCheck=true
  const [winrmStatus, setWinrmStatus] = useState<Record<string, 'checking' | 'ok' | 'stopped' | 'error'>>({})
  const [winrmActivating, setWinrmActivating] = useState<Record<string, boolean>>({})

  // Check WinRM on each target host via Test-WSMan
  async function checkWinRM() {
    const initial: Record<string, 'checking'> = {}
    hostnames.forEach((h) => { initial[h] = 'checking' })
    setWinrmStatus(initial)
    for (const h of hostnames) {
      try {
        const cmd = `try { Test-WSMan -ComputerName "${h}" -ErrorAction Stop | Out-Null; Write-Output 'ok' } catch { Write-Output 'err' }`
        const result = await api().runPowerShell(cmd, 10000)
        const ok = result.stdout.trim() === 'ok'
        setWinrmStatus((prev) => ({ ...prev, [h]: ok ? 'ok' : 'stopped' }))
      } catch {
        setWinrmStatus((prev) => ({ ...prev, [h]: 'error' }))
      }
    }
  }

  // Try to enable PS Remoting (WinRM) on the target host
  async function activateWinRM(hostname: string) {
    setWinrmActivating((prev) => ({ ...prev, [hostname]: true }))
    try {
      // Enable-PSRemoting via WMI/WS-Management – works even when WinRM is not yet fully running
      const cmd = `Invoke-Command -ComputerName "${hostname}" -ScriptBlock { Enable-PSRemoting -Force -SkipNetworkProfileCheck -ErrorAction Stop } -ErrorAction Stop; Write-Output 'ok'`
      const result = await api().runPowerShell(cmd, 30000)
      const ok = result.stdout.trim().includes('ok')
      setWinrmStatus((prev) => ({ ...prev, [hostname]: ok ? 'ok' : 'error' }))
    } catch {
      setWinrmStatus((prev) => ({ ...prev, [hostname]: 'error' }))
    } finally {
      setWinrmActivating((prev) => ({ ...prev, [hostname]: false }))
    }
  }

  return (
    <div className={`transition-colors ${checked ? 'bg-primary/5' : ''}`}>
      {/* Checkbox row */}
      <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-accent/30 transition-colors">
        <span className={checked ? 'text-primary' : 'text-muted-foreground'}>
          {checked ? <CheckSquare size={15} /> : <Square size={15} />}
        </span>
        <input type="checkbox" className="sr-only" checked={checked} onChange={onToggle} />
        <span className={`flex items-center gap-2 text-sm ${checked ? 'text-foreground font-medium' : 'text-foreground'}`}>
          <span className={checked ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
          {label}
        </span>
      </label>

      {/* Expanded inputs — only shown when checked */}
      {checked && (
        <div className="px-10 pb-4 pt-1 space-y-2">
          {children}

          {/* PROBLEM 2: WinRM pre-flight check – only for msg_voice, only for admins */}
          {showWinrmCheck && isAdmin && hostnames.length > 0 && (
            <div className="rounded-md border border-border p-3 space-y-2 bg-muted/20">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground">
                  WinRM-Dienststatus (Voraussetzung für Sprachnachrichten)
                </p>
                <button
                  onClick={checkWinRM}
                  className="text-[11px] px-2.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                >
                  Prüfen
                </button>
              </div>
              {Object.keys(winrmStatus).length === 0 && (
                <p className="text-[11px] text-muted-foreground/60">
                  Klicke „Prüfen" um WinRM-Status auf allen Zielgeräten zu überprüfen.
                </p>
              )}
              {hostnames.map((h) => {
                const st = winrmStatus[h]
                if (!st) return null
                return (
                  <div key={h} className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono text-muted-foreground min-w-0 truncate flex-1">{h}</span>
                    {st === 'checking' && <Loader size={11} className="animate-spin text-blue-400 shrink-0" />}
                    {st === 'ok' && (
                      <span className="flex items-center gap-1 text-emerald-400 shrink-0">
                        <CheckCircle size={10} /> Aktiv
                      </span>
                    )}
                    {st === 'stopped' && (
                      <span className="flex items-center gap-1 text-red-400 shrink-0">
                        <XCircle size={10} /> Nicht aktiv
                      </span>
                    )}
                    {st === 'error' && (
                      <span className="text-amber-400 shrink-0">Prüffehler</span>
                    )}
                    {(st === 'stopped' || st === 'error') && isAdmin && (
                      <button
                        onClick={() => activateWinRM(h)}
                        disabled={winrmActivating[h]}
                        className="ml-2 text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors disabled:opacity-50 shrink-0"
                      >
                        {winrmActivating[h] ? 'Aktiviere…' : 'WinRM aktivieren'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground/60 pt-0.5">{hint}</p>
        </div>
      )}
    </div>
  )
}

// ── FIX 5: Service Check Panel ────────────────────────────────────────────────
interface ServiceCheckPanelProps {
  hostnames: string[]
}

type ServiceStatus = 'idle' | 'checking' | 'done' | 'error'

interface ServiceResult {
  hostname: string
  serviceName: string
  status: string
  startType: string
  displayName: string
  error?: string
}

function ServiceCheckPanel({ hostnames }: ServiceCheckPanelProps) {
  const [serviceInput, setServiceInput] = useState('')
  const [checkStatus, setCheckStatus] = useState<ServiceStatus>('idle')
  const [serviceResults, setServiceResults] = useState<ServiceResult[]>([])
  const [serviceError, setServiceError] = useState('')

  async function checkService() {
    const svcName = serviceInput.trim()
    if (!svcName) return
    setCheckStatus('checking')
    setServiceError('')
    setServiceResults([])

    const allResults: ServiceResult[] = []
    for (const hostname of hostnames) {
      const cmd = `Get-Service -ComputerName "${hostname}" -Name "${svcName.replace(/"/g, '')}" -ErrorAction SilentlyContinue | Select-Object Name,DisplayName,Status,StartType | ConvertTo-Json -Compress`
      try {
        const result = await api().runPowerShell(cmd, 15000)
        if (result.stdout.trim()) {
          try {
            const parsed = JSON.parse(result.stdout.trim())
            const arr = Array.isArray(parsed) ? parsed : [parsed]
            for (const s of arr) {
              allResults.push({
                hostname,
                serviceName: s.Name ?? svcName,
                displayName: s.DisplayName ?? '',
                status: String(s.Status ?? ''),
                startType: String(s.StartType ?? ''),
              })
            }
          } catch {
            allResults.push({ hostname, serviceName: svcName, displayName: '', status: 'Fehler beim Parsen', startType: '' })
          }
        } else {
          allResults.push({ hostname, serviceName: svcName, displayName: '', status: 'Nicht gefunden', startType: '' })
        }
      } catch (err) {
        allResults.push({ hostname, serviceName: svcName, displayName: '', status: 'Fehler', startType: '', error: String(err) })
      }
    }

    setServiceResults(allResults)
    setCheckStatus('done')
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
        <span className="text-base">⚙️</span>
        <span className="flex-1 text-sm font-semibold text-foreground">Dienst-Status prüfen</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Admin</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex gap-2 max-w-md">
          <input
            type="text"
            placeholder="Dienstname (z.B. wuauserv, spooler)…"
            value={serviceInput}
            onChange={(e) => setServiceInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') checkService() }}
            className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <button
            onClick={checkService}
            disabled={checkStatus === 'checking' || !serviceInput.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {checkStatus === 'checking' ? <Loader size={13} className="animate-spin" /> : <Search size={13} />}
            Prüfen
          </button>
        </div>
        {serviceError && <p className="text-xs text-destructive">{serviceError}</p>}
        {serviceResults.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-card">
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Gerät</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Anzeigename</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Starttyp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {serviceResults.map((r, i) => (
                  <tr key={i} className="hover:bg-accent/20">
                    <td className="px-3 py-2 font-mono text-foreground">{r.hostname}</td>
                    <td className="px-3 py-2 text-foreground">{r.displayName || r.serviceName}</td>
                    <td className="px-3 py-2">
                      {r.status === 'Running' || r.status === '4' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle size={9} /> Läuft
                        </span>
                      ) : r.status === 'Stopped' || r.status === '1' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/10 text-red-400 border border-red-500/20">
                          <XCircle size={9} /> Gestoppt
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{r.status || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.startType || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
