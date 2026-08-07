import { useState, useEffect, useRef } from 'react'
import { Loader, XCircle, AlertTriangle, RefreshCw, CheckCircle, Search, Square, Cpu } from 'lucide-react'
import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'

interface ProcItem { Name: string; Id: number; Mem: number }

interface Props {
  hostname: string
  isAdmin: boolean
  onCountLoaded?: (count: number) => void
}

// Prozesse, die man nicht versehentlich beenden sollte (Warnhinweis).
const CRITICAL_PROCS = new Set([
  'System', 'Idle', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'smss',
  'svchost', 'explorer', 'dwm', 'fontdrvhost', 'sihost', 'ctfmon', 'RuntimeBroker',
  'LogonUI', 'WmiPrvSE',
])

export function ProcessPanel({ hostname, isAdmin, onCountLoaded }: Props) {
  const [items, setItems] = useState<ProcItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [winrmChecking, setWinrmChecking] = useState(true)
  const [winrmOk, setWinrmOk] = useState<boolean | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [msg, setMsg] = useState('')

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; proc: ProcItem } | null>(null)
  const [confirm, setConfirm] = useState<{ proc: ProcItem; critical: boolean } | null>(null)

  async function loadItems() {
    setLoading(true); setLoadError('')
    try {
      const script = [
        `try {`,
        `  $out = Invoke-Command -ComputerName '${hostname}' -EA Stop -ScriptBlock {`,
        `    Get-Process -EA SilentlyContinue | Select-Object Name, Id, @{N='Mem';E={[math]::Round($_.WorkingSet64/1MB,1)}} | Sort-Object Mem -Descending | ConvertTo-Json -Compress`,
        `  }`,
        `  Write-Output $out`,
        `} catch { Write-Output """ERR:$($_.Exception.Message)""" }`,
      ].join('\n')
      const result = await api().runPowerShell(script, 30000)
      const out = result.stdout.trim()
      if (out.startsWith('ERR:') || out.startsWith('"ERR:')) throw new Error(out.replace(/^"?ERR:/, ''))
      const parsed = JSON.parse(out)
      const arr: ProcItem[] = Array.isArray(parsed) ? parsed : [parsed]
      const clean = arr.filter(i => i && i.Name)
      setItems(clean)
      onCountLoaded?.(clean.length)
    } catch (e) {
      setLoadError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    ensureWinRM(hostname).then(ok => { setWinrmOk(ok); setWinrmChecking(false) })
    loadItems()
  }, [hostname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Kontextmenue schliessen bei Klick/Scroll/Escape
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [ctxMenu])

  async function killProcess(proc: ProcItem) {
    setConfirm(null)
    if (!winrmOk) { setMsg('WinRM nicht verfügbar'); return }
    setBusyId(proc.Id); setMsg('')
    const script = [
      `try {`,
      `  $r = Invoke-Command -ComputerName '${hostname}' -EA Stop -ScriptBlock {`,
      `    try { Stop-Process -Id ${proc.Id} -Force -EA Stop; @{ success=$true } | ConvertTo-Json -Compress }`,
      `    catch { @{ success=$false; message=$_.Exception.Message } | ConvertTo-Json -Compress }`,
      `  }`,
      `  Write-Output $r`,
      `} catch { Write-Output ('{""success"":false,""message"":""' + $_.Exception.Message + '""}') }`,
    ].join('\n')
    try {
      const res = await api().runPowerShell(script, 30000)
      const parsed = JSON.parse(res.stdout.trim())
      if (parsed.success) {
        setItems(prev => prev.filter(i => i.Id !== proc.Id))
        setMsg(`„${proc.Name}" (PID ${proc.Id}) beendet.`)
        onCountLoaded?.(items.length - 1)
      } else {
        setMsg(`Konnte „${proc.Name}" nicht beenden: ${parsed.message || 'Unbekannter Fehler'}`)
      }
    } catch {
      setMsg(`Konnte „${proc.Name}" nicht beenden.`)
    } finally {
      setBusyId(null)
    }
  }

  function askKill(proc: ProcItem) {
    setCtxMenu(null)
    setConfirm({ proc, critical: CRITICAL_PROCS.has(proc.Name) })
  }

  const q = search.trim().toLowerCase()
  const filtered = q ? items.filter(i => i.Name.toLowerCase().includes(q) || String(i.Id).includes(q)) : items

  return (
    <div className="relative">
      {winrmChecking && <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-blue-500/5 text-xs text-blue-400"><Loader size={11} className="animate-spin shrink-0" />WinRM wird geprüft…</div>}
      {!winrmChecking && winrmOk === false && <div className="flex items-start gap-2 px-4 py-2.5 border-b border-border bg-red-500/5"><XCircle size={12} className="text-red-400 shrink-0 mt-0.5" /><p className="text-xs font-medium text-red-400">WinRM nicht verfügbar – Prozess-Verwaltung nicht möglich.</p></div>}
      {!winrmChecking && winrmOk === true && <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-emerald-500/5 text-[11px] text-emerald-400"><CheckCircle size={11} className="shrink-0" />WinRM aktiv – Rechtsklick auf einen Prozess zum Beenden</div>}

      {!loading && !loadError && (
        <div className="px-4 py-2 border-b border-border flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder="Prozess suchen… (z.B. cos)" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
          </div>
          <span className="text-[11px] text-muted-foreground">{filtered.length !== items.length ? `${filtered.length} von ${items.length} Prozessen` : `${items.length} Prozesse`}</span>
          <button onClick={loadItems} title="Aktualisieren" className="ml-auto flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground"><RefreshCw size={11} /> Aktualisieren</button>
        </div>
      )}

      {msg && <div className="px-4 py-1.5 text-[11px] text-muted-foreground border-b border-border bg-muted/10">{msg}</div>}

      {loading && <div className="flex items-center gap-2 px-4 py-6 text-xs text-muted-foreground"><Loader size={13} className="animate-spin text-blue-400" />Prozesse werden geladen…</div>}
      {loadError && !loading && (
        <div className="flex items-center gap-2 px-4 py-4 text-xs text-red-400">
          <XCircle size={13} /><span className="flex-1">Fehler: {loadError}</span>
          <button onClick={loadItems} className="flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground"><RefreshCw size={11} /> Erneut</button>
        </div>
      )}

      {!loading && !loadError && (
        <div className={`max-h-[520px] overflow-y-auto ${winrmOk === false ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="grid grid-cols-[1fr_90px_90px] gap-0 bg-muted/20 border-b border-border sticky top-0">
            <div className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Name</div>
            <div className="px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">PID</div>
            <div className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">RAM (MB)</div>
          </div>
          {filtered.map(p => (
            <div key={p.Id}
              onContextMenu={e => { if (!isAdmin) return; e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, proc: p }) }}
              title={isAdmin ? 'Rechtsklick: Prozess beenden' : undefined}
              className={`grid grid-cols-[1fr_90px_90px] gap-0 items-center hover:bg-accent/10 border-b border-border/40 ${busyId === p.Id ? 'opacity-50' : ''} ${isAdmin ? 'cursor-context-menu' : ''}`}>
              <div className="px-4 py-1.5 text-xs text-foreground truncate flex items-center gap-1.5">
                {CRITICAL_PROCS.has(p.Name) && <AlertTriangle size={10} className="text-amber-400 shrink-0" />}
                {p.Name}
              </div>
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground font-mono text-right">{p.Id}</div>
              <div className="px-4 py-1.5 text-[11px] text-muted-foreground font-mono text-right">{p.Mem}</div>
            </div>
          ))}
          {filtered.length === 0 && <div className="px-4 py-8 text-center text-xs text-muted-foreground">Keine Prozesse gefunden.</div>}
        </div>
      )}

      {/* Rechtsklick-Menue */}
      {ctxMenu && (
        <div className="fixed z-[60] min-w-[200px] rounded-md border border-border bg-card shadow-xl py-1"
          style={{ top: Math.min(ctxMenu.y, window.innerHeight - 90), left: Math.min(ctxMenu.x, window.innerWidth - 220) }}
          onClick={e => e.stopPropagation()} onContextMenu={e => { e.preventDefault(); e.stopPropagation() }}>
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border truncate">{ctxMenu.proc.Name} · PID {ctxMenu.proc.Id}</div>
          <button onClick={() => askKill(ctxMenu.proc)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"><Square size={12} />Prozess beenden</button>
        </div>
      )}

      {/* Bestaetigung */}
      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirm(null)}>
          <div className={`bg-card rounded-xl p-5 w-[420px] shadow-2xl border ${confirm.critical ? 'border-amber-500/50' : 'border-border'}`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2"><Cpu size={15} className={confirm.critical ? 'text-amber-400' : 'text-muted-foreground'} /><h3 className="text-sm font-semibold text-foreground">Prozess beenden</h3></div>
            <p className="text-xs text-muted-foreground mb-2">
              Prozess <span className="font-semibold text-foreground">„{confirm.proc.Name}"</span> (<span className="font-mono text-[11px]">PID {confirm.proc.Id}</span>) auf <span className="font-mono text-foreground">{hostname}</span> wirklich beenden?
            </p>
            {confirm.critical && (
              <div className="flex items-start gap-1.5 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 mb-3">
                <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-400">Das ist ein System-Prozess. Das Beenden kann zu Abmeldung, Instabilität oder Datenverlust auf dem Ziel-PC führen.</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground">Abbrechen</button>
              <button onClick={() => killProcess(confirm.proc)} className="px-4 py-2 text-sm rounded-md text-white bg-red-600 hover:bg-red-700">Beenden</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
