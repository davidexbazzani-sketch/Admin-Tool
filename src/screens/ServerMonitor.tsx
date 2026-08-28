// ── Infrastruktur → Server: Kachel-Monitor ───────────────────────────────────
// Alle Server als Kacheln (Ping-Status, letzter Reboot), per Drag umsortierbar,
// hinzufügbar/löschbar, mit optionaler Offline-Mail je Kachel. Live-Status kommt
// aus dem geteilten server_monitor/status.json (vom Hintergrund-Controller gepflegt).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Server, RefreshCw, Loader, Plus, Trash2, ServerOff, ServerCog, Mail, Check, X, Download,
  History, Clock, Send, Pin, FileText,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import {
  loadServerConfig, saveServerConfig, loadInventoryServers, mergeInventoryServers,
  loadServerStatus, runPingCycle, hostKey, removeHostState,
  type ServerTile, type ServerMonitorStatus,
} from '../services/serverMonitor'
import {
  loadHistoryFor, addHistoryEntry, deleteHistoryEntry, ensureSteckbriefeSeeded,
  type ServerHistoryEntry,
} from '../services/serverHistory'

// ── Historie-Dialog je Server (frei beschreibbar, automatischer Zeitstempel) ──
function fmtStamp(iso: string, dateOnly?: boolean): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return dateOnly ? d.toLocaleDateString('de-DE') : d.toLocaleString('de-DE')
}

function HistoryDialog({ tile, by, onClose }: { tile: ServerTile; by: string; onClose: () => void }) {
  const [entries, setEntries] = useState<ServerHistoryEntry[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { void loadHistoryFor(tile.hostname).then(setEntries) }, [tile.hostname])

  async function add() {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    try { setEntries(await addHistoryEntry(tile.hostname, t, by)); setText('') }
    finally { setBusy(false) }
  }
  async function remove(id: string) {
    setEntries(await deleteHistoryEntry(tile.hostname, id))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 px-4 py-3 border-b border-border flex items-center gap-2">
          <History size={16} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">Historie <span className="font-mono">{tile.hostname}</span>{tile.description && <span className="text-muted-foreground font-normal"> · {tile.description}</span>}</h3>
          <button onClick={onClose} className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"><X size={16} /></button>
        </div>

        {/* Neuer Eintrag */}
        <div className="shrink-0 px-4 py-3 border-b border-border">
          <div className="flex gap-2 items-end">
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
              onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { void add() } }}
              placeholder="Neuer Eintrag (Ausfall, Einsatz, Change, Notiz …) — wird automatisch mit Zeitstempel versehen"
              className="flex-1 px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground resize-none focus:outline-none focus:border-primary" />
            <button onClick={add} disabled={!text.trim() || busy}
              className="flex items-center gap-1 px-3 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              {busy ? <Loader size={12} className="animate-spin" /> : <Send size={12} />}Eintragen
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Tipp: Strg+Enter trägt ein. Eintrag von <span className="text-foreground">{by}</span>.</p>
        </div>

        {/* Verlauf */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {entries === null ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2"><Loader size={14} className="animate-spin" />Verlauf wird geladen…</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">Noch keine Einträge.</div>
          ) : entries.map(e => (
            <div key={e.id} className={`rounded-lg border p-2.5 ${e.pinned ? 'border-primary/40 bg-primary/5' : 'border-border bg-background'}`}>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {e.pinned ? <Pin size={10} className="text-primary" /> : e.seed ? <FileText size={10} /> : <Clock size={10} />}
                <span>{e.pinned ? 'Stammdaten' : fmtStamp(e.at, e.dateOnly)}</span>
                <span>· {e.by}</span>
                {e.source && <span className="italic">· {e.source}</span>}
                {!e.seed && (
                  <button onClick={() => remove(e.id)} title="Eintrag löschen" className="ml-auto p-0.5 rounded text-muted-foreground/60 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={11} /></button>
                )}
              </div>
              <p className="mt-1 text-xs text-foreground whitespace-pre-wrap">{e.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ServerMonitor() {
  const session = useAuthStore(s => s.session)
  const by = session?.user.displayName || session?.user.username || 'manuell'

  const [tiles, setTiles] = useState<ServerTile[]>([])
  const [status, setStatus] = useState<ServerMonitorStatus>({ pingRunAt: null, rebootRunAt: null, servers: {} })
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [msg, setMsg] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newHost, setNewHost] = useState('')
  const [newIp, setNewIp] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [historyTile, setHistoryTile] = useState<ServerTile | null>(null)

  const refreshStatus = useCallback(async () => {
    try { setStatus(await loadServerStatus()) } catch { /* offline */ }
  }, [])

  // Initial: Config laden (bei leer → aus Inventar befüllen) + Status + Polling.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      let cfg = await loadServerConfig()
      if (cfg.tiles.length === 0) {
        const inv = await loadInventoryServers()
        if (inv.length) { const m = mergeInventoryServers([], inv); cfg = { tiles: m.tiles }; await saveServerConfig(cfg) }
      }
      if (!cancelled) { setTiles(cfg.tiles.slice().sort((a, b) => a.position - b.position)); setLoading(false) }
      await refreshStatus()
      // Steckbrief-Historie einmalig importieren (idempotent, geteilt für alle Admins).
      try { await ensureSteckbriefeSeeded() } catch { /* offline */ }
    })()
    const t = setInterval(() => { void refreshStatus() }, 30_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [refreshStatus])

  async function persist(next: ServerTile[]) {
    setTiles(next)
    await saveServerConfig({ tiles: next })
  }

  async function addFromInventory() {
    const inv = await loadInventoryServers()
    const m = mergeInventoryServers(tiles, inv)
    if (m.added > 0) { await persist(m.tiles.slice().sort((a, b) => a.position - b.position)); setMsg(`${m.added} Server aus der Standort-Übersicht ergänzt.`) }
    else setMsg('Keine neuen Server in der Standort-Übersicht gefunden.')
  }

  async function addManual() {
    const host = newHost.trim()
    if (!host) return
    const pos = tiles.reduce((mx, t) => Math.max(mx, t.position), -1) + 1
    const tile: ServerTile = { id: `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, hostname: host, ip: newIp.trim() || undefined, notifyEnabled: false, position: pos }
    await persist([...tiles, tile])
    setNewHost(''); setNewIp(''); setShowAdd(false)
  }

  async function removeTile(id: string) {
    const gone = tiles.find(t => t.id === id)
    const next = tiles.filter(t => t.id !== id).map((t, i) => ({ ...t, position: i }))
    await persist(next)
    // Offline-Status/Alarm des gelöschten Servers sofort aufräumen.
    if (gone) { await removeHostState(gone.hostname); await refreshStatus() }
  }
  function patchTile(id: string, patch: Partial<ServerTile>) {
    void persist(tiles.map(t => t.id === id ? { ...t, ...patch } : t))
  }

  async function checkNow() {
    if (checking) return
    setChecking(true); setMsg('')
    try {
      const r = await runPingCycle(by)
      await refreshStatus()
      setMsg(`Prüfung fertig: ${r.online} online · ${r.offline} offline.`)
    } catch (e) {
      setMsg('Prüfung fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setChecking(false) }
  }

  // ── Drag & Drop (Raster-Umsortieren, wie im Dashboard) ──
  function onDragStart(e: React.DragEvent, id: string) {
    // Kein Drag, wenn man in einem Bedienelement (Eingabe/Checkbox/Button) startet.
    if ((e.target as HTMLElement).closest('input,textarea,button,label')) { e.preventDefault(); return }
    setDragId(id); e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e: React.DragEvent) { e.preventDefault() }
  function onDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    if (!dragId || dragId === targetId) { setDragId(null); return }
    const next = [...tiles]
    const from = next.findIndex(t => t.id === dragId)
    const to = next.findIndex(t => t.id === targetId)
    if (from < 0 || to < 0) { setDragId(null); return }
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    next.forEach((t, i) => { t.position = i })
    void persist(next)
    setDragId(null)
  }

  const onlineCount = tiles.filter(t => status.servers[hostKey(t.hostname)]?.online === true).length
  const offlineCount = tiles.filter(t => status.servers[hostKey(t.hostname)]?.online === false).length

  if (loading) {
    return <div className="flex items-center justify-center h-full gap-2 text-muted-foreground"><Loader size={16} className="animate-spin" /> Server werden geladen…</div>
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <Server size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">Server</h1>
        <span className="text-xs text-muted-foreground">{onlineCount} online · {offlineCount > 0 ? <span className="text-red-400 font-medium">{offlineCount} offline</span> : '0 offline'}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={checkNow} disabled={checking}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-40">
            {checking ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}Jetzt prüfen
          </button>
          <button onClick={addFromInventory}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground">
            <Download size={12} />Aus Standort-Übersicht laden
          </button>
          <button onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20">
            <Plus size={12} />Kachel hinzufügen
          </button>
        </div>
      </div>

      {msg && (
        <div className="shrink-0 mx-4 mt-2 px-3 py-2 text-xs rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 flex items-center gap-2">
          <span className="flex-1">{msg}</span>
          <button onClick={() => setMsg('')} className="text-blue-300/70 hover:text-blue-200 text-sm leading-none">×</button>
        </div>
      )}

      {showAdd && (
        <div className="shrink-0 mx-4 mt-2 px-3 py-2 rounded-md bg-card border border-border flex items-center gap-2 flex-wrap">
          <input value={newHost} onChange={e => setNewHost(e.target.value)} placeholder="Hostname (z. B. W3172)"
            className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground w-48 focus:outline-none focus:border-primary" />
          <input value={newIp} onChange={e => setNewIp(e.target.value)} placeholder="IP (optional)"
            className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground w-36 focus:outline-none focus:border-primary" />
          <button onClick={addManual} disabled={!newHost.trim()} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground disabled:opacity-40"><Check size={12} />Hinzufügen</button>
          <button onClick={() => { setShowAdd(false); setNewHost(''); setNewIp('') }} className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-md border border-border text-muted-foreground"><X size={12} /></button>
        </div>
      )}

      {/* Kacheln */}
      <div className="flex-1 overflow-y-auto p-4">
        {tiles.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Server size={48} className="mx-auto opacity-20 mb-3" />
            <p className="text-sm">Noch keine Server-Kacheln.</p>
            <p className="text-xs opacity-60 mt-1">„Aus Standort-Übersicht laden" oder „Kachel hinzufügen".</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {tiles.map(tile => {
              const st = status.servers[hostKey(tile.hostname)]
              const state: 'online' | 'offline' | 'unknown' = st?.online === true ? 'online' : st?.online === false ? 'offline' : 'unknown'
              const border = state === 'offline' ? 'border-red-500/60' : state === 'online' ? 'border-emerald-500/40' : 'border-border'
              return (
                <div key={tile.id} draggable
                  onDragStart={e => onDragStart(e, tile.id)} onDragOver={onDragOver} onDrop={e => onDrop(e, tile.id)}
                  className={`rounded-xl border ${border} bg-card p-3 cursor-grab active:cursor-grabbing ${state === 'offline' ? 'animate-pulse bg-red-500/5' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${state === 'online' ? 'bg-emerald-400' : state === 'offline' ? 'bg-red-500' : 'bg-muted-foreground/40'}`} />
                    <span className="text-sm font-semibold text-foreground truncate flex-1" title={`${tile.hostname}${tile.description ? ' · ' + tile.description : ''}`}>
                      <span className="font-mono">{tile.hostname}</span>
                      {tile.description && <span className="text-muted-foreground font-normal"> · {tile.description}</span>}
                    </span>
                    {state === 'offline' ? <ServerOff size={14} className="text-red-400 shrink-0" /> : <ServerCog size={14} className="text-muted-foreground shrink-0" />}
                    <button onClick={() => setHistoryTile(tile)} title="Historie öffnen" className="shrink-0 p-0.5 rounded text-muted-foreground/60 hover:text-primary hover:bg-primary/10"><History size={13} /></button>
                    <button onClick={() => removeTile(tile.id)} title="Kachel entfernen" className="shrink-0 p-0.5 rounded text-muted-foreground/60 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={12} /></button>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                    {tile.ip && <span className="font-mono">{tile.ip}</span>}
                    <span className={state === 'offline' ? 'text-red-400 font-medium' : state === 'online' ? 'text-emerald-400' : ''}>
                      {state === 'online' ? 'online' : state === 'offline' ? `offline${st?.consecutiveFailures ? ` (${st.consecutiveFailures}×)` : ''}` : 'noch nicht geprüft'}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[11px] text-muted-foreground">
                    Letzter Reboot: <span className="text-foreground">{st?.lastReboot || '—'}</span>
                  </div>
                  <textarea defaultValue={tile.note || ''} placeholder="Info / Notiz zum Server…" rows={2}
                    onBlur={e => patchTile(tile.id, { note: e.target.value.trim() })}
                    className="mt-2 w-full px-2 py-1 text-[11px] rounded-md border border-border bg-background text-foreground resize-none focus:outline-none focus:border-primary" />
                  <label className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                    <input type="checkbox" className="rounded accent-primary" checked={tile.notifyEnabled}
                      onChange={e => patchTile(tile.id, { notifyEnabled: e.target.checked })} />
                    <Mail size={11} />Bei Offline benachrichtigen
                  </label>
                  {tile.notifyEnabled && (
                    <input
                      defaultValue={tile.notifyEmail || ''} placeholder="mail@firma.de"
                      onBlur={e => patchTile(tile.id, { notifyEmail: e.target.value.trim() })}
                      className="mt-1 w-full px-2 py-1 text-[11px] rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {historyTile && <HistoryDialog tile={historyTile} by={by} onClose={() => setHistoryTile(null)} />}
    </div>
  )
}
