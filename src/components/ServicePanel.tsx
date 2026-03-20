import { useState, useEffect } from 'react'
import {
  Play, Square, RotateCcw, Loader, XCircle, AlertTriangle, RefreshCw, CheckCircle,
} from 'lucide-react'
import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import { CRITICAL_SERVICES, SvcItem, svcStatusColor, buildSvcActionScript } from '../utils/svcUtils'

interface Props {
  hostname: string
  isAdmin: boolean
  /** If provided, the panel starts with these items and skips loading. */
  initialItems?: SvcItem[]
  /** Called once items are known (for updating a parent label/count). */
  onCountLoaded?: (count: number) => void
}

export function ServicePanel({ hostname, isAdmin, initialItems, onCountLoaded }: Props) {
  const [items, setItems]           = useState<SvcItem[]>(initialItems ?? [])
  const [loading, setLoading]       = useState(!initialItems)
  const [loadError, setLoadError]   = useState('')
  const [search, setSearch]         = useState('')
  const [actionStatus, setActionStatus] = useState<Record<string, 'loading' | 'ok' | 'error'>>({})
  const [actionMsg, setActionMsg]   = useState<Record<string, string>>({})
  const [confirm, setConfirm]       = useState<{ name: string; displayName: string; action: 'stop' | 'restart'; critical: boolean } | null>(null)
  const [winrmChecking, setWinrmChecking] = useState(true)
  const [winrmOk, setWinrmOk]       = useState<boolean | null>(null)

  async function loadItems() {
    setLoading(true)
    setLoadError('')
    try {
      const script = [
        `try {`,
        `  $out = Invoke-Command -ComputerName '${hostname}' -EA Stop -ScriptBlock {`,
        `    Get-Service | Select-Object Name,DisplayName,@{N='Status';E={$_.Status.ToString()}},@{N='StartType';E={$_.StartType.ToString()}} | Sort-Object DisplayName | ConvertTo-Json -Compress`,
        `  }`,
        `  Write-Output $out`,
        `} catch {`,
        `  Write-Output """ERR:$($_.Exception.Message)"""`,
        `}`,
      ].join('\n')
      const result = await api().runPowerShell(script, 30000)
      const out = result.stdout.trim()
      if (out.startsWith('ERR:') || out.startsWith('"ERR:')) throw new Error(out.replace(/^"?ERR:/, ''))
      const parsed = JSON.parse(out)
      const arr: SvcItem[] = Array.isArray(parsed) ? parsed : [parsed]
      const clean = arr.filter(i => i.Name && String(i.Name).trim() !== '')
      setItems(clean)
      onCountLoaded?.(clean.length)
    } catch (e) {
      setLoadError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Check WinRM eagerly (returns from cache when RemoteDoc has already connected)
    ensureWinRM(hostname).then(ok => {
      setWinrmOk(ok)
      setWinrmChecking(false)
    })
    if (initialItems) {
      onCountLoaded?.(initialItems.length)
      setLoading(false)
    } else {
      loadItems()
    }
  }, [hostname]) // eslint-disable-line react-hooks/exhaustive-deps

  async function doAction(svcName: string, action: 'start' | 'stop' | 'restart') {
    setConfirm(null)
    if (!winrmOk) {
      setActionStatus(prev => ({ ...prev, [svcName]: 'error' }))
      setActionMsg(prev => ({ ...prev, [svcName]: 'WinRM nicht verfügbar' }))
      return
    }
    setActionStatus(prev => ({ ...prev, [svcName]: 'loading' }))
    setActionMsg(prev => ({ ...prev, [svcName]: '' }))
    const result = await api().runPowerShell(buildSvcActionScript(hostname, svcName, action), 45000)
    try {
      const parsed = JSON.parse(result.stdout.trim())
      if (parsed.success) {
        setActionStatus(prev => ({ ...prev, [svcName]: 'ok' }))
        setActionMsg(prev => ({ ...prev, [svcName]: parsed.message || 'Erfolgreich' }))
        if (parsed.newStatus) {
          setItems(prev => prev.map(i => i.Name === svcName ? { ...i, Status: parsed.newStatus } : i))
        }
      } else {
        setActionStatus(prev => ({ ...prev, [svcName]: 'error' }))
        setActionMsg(prev => ({ ...prev, [svcName]: parsed.message || 'Unbekannter Fehler' }))
      }
    } catch {
      setActionStatus(prev => ({ ...prev, [svcName]: 'error' }))
      setActionMsg(prev => ({ ...prev, [svcName]: result.stderr || result.stdout || 'Fehler beim Verarbeiten' }))
    }
  }

  const filtered = search
    ? items.filter(i =>
        i.DisplayName?.toLowerCase().includes(search.toLowerCase()) ||
        i.Name?.toLowerCase().includes(search.toLowerCase())
      )
    : items

  const running = items.filter(i => i.Status === 'Running').length

  return (
    <div className="relative">
      {/* WinRM status bar */}
      {winrmChecking && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-blue-500/5 text-xs text-blue-400">
          <Loader size={11} className="animate-spin shrink-0" />
          WinRM wird geprüft…
        </div>
      )}
      {!winrmChecking && winrmOk === false && (
        <div className="flex items-start gap-2 px-4 py-2.5 border-b border-border bg-red-500/5">
          <XCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-red-400">WinRM nicht verfügbar – Remote-Verwaltung nicht möglich.</p>
            <p className="text-[11px] text-red-400/70">Bitte Verbindung neu herstellen oder WinRM manuell aktivieren.</p>
          </div>
        </div>
      )}
      {!winrmChecking && winrmOk === true && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-emerald-500/5 text-[11px] text-emerald-400">
          <CheckCircle size={11} className="shrink-0" />
          WinRM aktiv – Remote-Verwaltung verfügbar
        </div>
      )}

      {/* Search + stats */}
      {!loading && !loadError && (
        <div className="px-4 py-2 border-b border-border flex items-center gap-3">
          <input
            type="text"
            placeholder="Dienst suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 max-w-xs px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <span className="text-[11px] text-muted-foreground">
            {filtered.length !== items.length
              ? `${filtered.length} von ${items.length} Diensten`
              : `${items.length} Dienste`}
            <span className="text-emerald-400/80 ml-1.5">({running} aktiv)</span>
          </span>
          <button
            onClick={loadItems}
            title="Aktualisieren"
            className="ml-auto flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={11} /> Aktualisieren
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 px-4 py-6 text-xs text-muted-foreground">
          <Loader size={13} className="animate-spin text-blue-400" />
          Dienste werden geladen…
        </div>
      )}

      {/* Error */}
      {loadError && !loading && (
        <div className="flex items-center gap-2 px-4 py-4 text-xs text-red-400">
          <XCircle size={13} />
          <span className="flex-1">Fehler: {loadError}</span>
          <button
            onClick={loadItems}
            className="flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={11} /> Erneut
          </button>
        </div>
      )}

      {/* Service list */}
      {!loading && !loadError && (
        <div className={`divide-y divide-border max-h-[520px] overflow-y-auto ${winrmOk === false ? 'opacity-50 pointer-events-none' : ''}`}>
          {filtered.map(item => {
            const actionSt = actionStatus[item.Name]
            const msg = actionMsg[item.Name]
            const isDisabled = item.StartType === 'Disabled'
            return (
              <div key={item.Name} className="flex items-center gap-3 px-4 py-2 hover:bg-accent/10">
                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{item.DisplayName || item.Name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{item.Name}</div>
                </div>
                {/* Status */}
                <span className={`text-[11px] font-medium w-20 shrink-0 ${svcStatusColor(item.Status)}`}>
                  {item.Status}
                </span>
                {/* Action feedback */}
                <div className="w-32 shrink-0 text-[10px]">
                  {actionSt === 'loading' && (
                    <span className="flex items-center gap-1 text-blue-400">
                      <Loader size={11} className="animate-spin" /> Läuft…
                    </span>
                  )}
                  {actionSt === 'ok' && (
                    <span className="text-emerald-400">✓ {msg}</span>
                  )}
                  {actionSt === 'error' && (
                    <span className="text-red-400 truncate block cursor-help" title={msg}>
                      ✕ {msg?.slice(0, 28)}{(msg?.length || 0) > 28 ? '…' : ''}
                    </span>
                  )}
                </div>
                {/* Buttons */}
                {isAdmin && (
                  <div className="flex gap-1.5 shrink-0 w-36">
                    {isDisabled ? (
                      <span className="text-[10px] text-muted-foreground">Deaktiviert</span>
                    ) : (
                      <>
                        {item.Status === 'Stopped' && (
                          <button
                            onClick={() => doAction(item.Name, 'start')}
                            disabled={actionSt === 'loading' || winrmChecking}
                            title="Starten"
                            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Play size={10} /> Start
                          </button>
                        )}
                        {item.Status === 'Running' && (
                          <>
                            <button
                              onClick={() => setConfirm({ name: item.Name, displayName: item.DisplayName, action: 'stop', critical: CRITICAL_SERVICES.has(item.Name) })}
                              disabled={actionSt === 'loading' || winrmChecking}
                              title="Stoppen"
                              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Square size={10} /> Stop
                            </button>
                            <button
                              onClick={() => setConfirm({ name: item.Name, displayName: item.DisplayName, action: 'restart', critical: CRITICAL_SERVICES.has(item.Name) })}
                              disabled={actionSt === 'loading' || winrmChecking}
                              title="Neu starten"
                              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <RotateCcw size={10} /> Restart
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Confirmation dialog */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`bg-card rounded-xl p-5 w-[420px] shadow-2xl border ${confirm.critical ? 'border-amber-500/50' : 'border-border'}`}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={15} className={confirm.critical ? 'text-amber-400' : 'text-muted-foreground'} />
              <h3 className="text-sm font-semibold text-foreground">
                {confirm.action === 'stop' ? 'Dienst stoppen' : 'Dienst neu starten'}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Möchten Sie den Dienst <span className="font-semibold text-foreground">„{confirm.displayName}"</span>{' '}
              (<span className="font-mono text-[11px]">{confirm.name}</span>) auf{' '}
              <span className="font-mono text-foreground">{hostname}</span> wirklich{' '}
              {confirm.action === 'stop' ? 'stoppen' : 'neu starten'}?
            </p>
            {confirm.critical && (
              <div className="flex items-start gap-1.5 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 mb-3">
                <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-400">
                  Dies ist ein System-Dienst. Das {confirm.action === 'stop' ? 'Stoppen' : 'Neustarten'} kann die
                  Remote-Verwaltung oder andere Funktionen beeinträchtigen.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirm(null)}
                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={() => doAction(confirm.name, confirm.action)}
                className={`px-4 py-2 text-sm rounded-md text-white transition-colors ${
                  confirm.action === 'stop' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {confirm.action === 'stop' ? 'Stoppen' : 'Neu starten'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
