import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Star, Plus, RefreshCw, ChevronDown, ChevronRight, ChevronUp,
  MoreVertical, Trash2, Edit2, Check, X, Loader, Play,
  Monitor, Wrench, ArrowUp, ArrowDown, Terminal, Search as SearchIcon,
} from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore, useIsAdmin } from '../store/authStore'
import { useAppStore } from '../store/appStore'
import { CATEGORIES, type Category as RdCategory } from '../utils/remoteCommands'
import type { FavoritesData, FavoriteDevice, FavoriteSkill } from '../types/favorites'
import {
  loadFavorites, saveFavorites,
  addDevice, removeDevice, updateDeviceLabel, moveDevice, isDeviceFavorite,
  addSkill, removeSkill, moveSkill,
} from '../utils/favorites'

export default function FavoritesPanel() {
  const session   = useAuthStore(s => s.session)
  const isAdmin   = useIsAdmin()
  const setScreen = useAppStore(s => s.setScreen)
  const setDevices = useAppStore(s => s.setDevices)
  const username  = session?.user?.username

  const [open, setOpen]   = useState(false)
  const [data, setData]   = useState<FavoritesData>({ devices: [], skills: [] })
  const [loading, setLoading] = useState(false)
  const [pinging, setPinging] = useState(false)
  const [pingResults, setPingResults] = useState<Record<string, boolean | null>>({})

  // Selection
  const [selDevices, setSelDevices] = useState<Set<string>>(new Set())
  const [selSkill, setSelSkill]     = useState<string | null>(null)

  // Inline edit
  const [editHost, setEditHost]     = useState<string | null>(null)
  const [editLabel, setEditLabel]   = useState('')

  // Context menu
  const [menuHost, setMenuHost]     = useState<string | null>(null)
  const [menuSkill, setMenuSkill]   = useState<string | null>(null)

  // Add dialog
  const [showAdd, setShowAdd]       = useState(false)
  const [addTab, setAddTab]         = useState<'device' | 'skill'>('device')
  const [addHostname, setAddHostname] = useState('')
  const [addLabel, setAddLabel]       = useState('')
  const [addCatId, setAddCatId]       = useState('')
  const [addCmdId, setAddCmdId]       = useState('')

  // Execution
  const [executing, setExecuting] = useState(false)
  const [execResults, setExecResults] = useState<{ hostname: string; output: string }[] | null>(null)

  // ── Load/Save ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!username) return
    setLoading(true)
    try {
      const d = await loadFavorites(username)
      setData(d)
    } finally {
      setLoading(false)
    }
  }, [username])

  async function save(newData: FavoritesData) {
    if (!username) return
    setData(newData)
    await saveFavorites(username, newData)
  }

  useEffect(() => { if (open) load() }, [open, load])

  // ── Ping all devices ──────────────────────────────────────────────────────────
  const pingAll = useCallback(async () => {
    if (!data.devices.length) return
    setPinging(true)
    const results: Record<string, boolean | null> = {}
    await Promise.all(
      data.devices.map(async (d) => {
        try {
          const h = d.hostname.replace(/'/g, "''")
          const script = [
            '$o=$false',
            "try{if(Test-Connection -ComputerName '" + h + "' -Count 1 -Quiet -EA SilentlyContinue){$o=$true}}catch{}",
            "if(-not $o){try{$t=New-Object System.Net.Sockets.TcpClient;if($t.ConnectAsync('" + h + "',445).Wait(2000)){$o=$true};$t.Close()}catch{}}",
            'if($o){"True"}else{"False"}',
          ].join(';')
          const res = await api().runPowerShell(script, 5000)
          results[d.hostname] = res.stdout?.trim() === 'True'
        } catch {
          results[d.hostname] = null
        }
      })
    )
    setPingResults(results)
    setPinging(false)
  }, [data.devices])

  // Auto-ping when opened
  useEffect(() => { if (open && data.devices.length > 0) pingAll() }, [open, data.devices.length]) // eslint-disable-line

  // ── Refresh interval (60s while open) ─────────────────────────────────────────
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (open && data.devices.length > 0) {
      intervalRef.current = setInterval(pingAll, 60000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [open, data.devices.length, pingAll])

  // ── Handlers ──────────────────────────────────────────────────────────────────
  function handleAddDevice() {
    if (!addHostname.trim()) return
    const updated = addDevice(data, addHostname.trim(), addLabel.trim())
    save(updated)
    setAddHostname(''); setAddLabel(''); setShowAdd(false)
  }

  function handleAddSkill() {
    if (!addCatId || !addCmdId) return
    const cat = CATEGORIES.find(c => c.id === addCatId)
    const cmd = cat?.commands.find(c => c.id === addCmdId)
    if (!cat || !cmd) return
    const updated = addSkill(data, {
      skillId: `rd::${cat.id}::${cmd.id}`,
      label: cmd.func,
      category: cat.label,
      source: 'remote-doc',
    })
    save(updated)
    setAddCatId(''); setAddCmdId(''); setShowAdd(false)
  }

  function handleRemoveDevice(hostname: string) {
    save(removeDevice(data, hostname))
    setSelDevices(prev => { const n = new Set(prev); n.delete(hostname); return n })
    setMenuHost(null)
  }

  function handleRemoveSkill(skillId: string) {
    save(removeSkill(data, skillId))
    if (selSkill === skillId) setSelSkill(null)
    setMenuSkill(null)
  }

  function handleSaveLabel(hostname: string) {
    save(updateDeviceLabel(data, hostname, editLabel))
    setEditHost(null)
  }

  function handleMoveDevice(hostname: string, dir: 'up' | 'down') {
    save(moveDevice(data, hostname, dir))
    setMenuHost(null)
  }

  function handleMoveSkill(skillId: string, dir: 'up' | 'down') {
    save(moveSkill(data, skillId, dir))
    setMenuSkill(null)
  }

  // Toggle device selection
  function toggleDevSel(hostname: string) {
    setSelDevices(prev => {
      const n = new Set(prev)
      n.has(hostname) ? n.delete(hostname) : n.add(hostname)
      return n
    })
  }

  // ── Execute skill on selected devices ─────────────────────────────────────────
  async function executeSkill() {
    if (!selSkill || selDevices.size === 0) return
    setExecuting(true)
    setExecResults(null)

    const skill = data.skills.find(s => s.skillId === selSkill)
    if (!skill) { setExecuting(false); return }

    const hosts = Array.from(selDevices)
    const results: { hostname: string; output: string }[] = []

    if (skill.source === 'remote-doc' && skill.skillId.startsWith('rd::')) {
      // Parse rd::catId::cmdId
      const parts = skill.skillId.split('::')
      const catId = parts[1]
      const cmdId = parts[2]
      const cat = CATEGORIES.find(c => c.id === catId)
      const cmd = cat?.commands.find(c => c.id === cmdId)
      if (!cmd) { setExecuting(false); return }

      // Execute in batches of 10 per performance rules
      const batchSize = 10
      for (let i = 0; i < hosts.length; i += batchSize) {
        const batch = hosts.slice(i, i + batchSize)
        const batchResults = await Promise.allSettled(
          batch.map(async (h) => {
            const psCmd = cmd.buildCmd(h)
            const res = await api().runPowerShell(psCmd, 15000)
            return { hostname: h, output: res.stdout?.trim() || res.stderr?.trim() || 'Kein Ergebnis' }
          })
        )
        for (const r of batchResults) {
          if (r.status === 'fulfilled') results.push(r.value)
          else results.push({ hostname: hosts[results.length], output: `Fehler: ${r.reason}` })
        }
      }
    }

    setExecResults(results)
    setExecuting(false)
  }

  // ── Navigation handlers ───────────────────────────────────────────────────────
  function goToQueryMenu() {
    const hosts = Array.from(selDevices)
    if (!hosts.length) return
    setDevices(hosts.map((h, i) => ({
      id: `fav-${i}`, type: 'hostname' as const, value: h, resolvedHostnames: [h],
    })))
    setScreen('query-menu')
  }

  function goToRemoteDoc() {
    const hosts = Array.from(selDevices)
    if (hosts.length !== 1) return
    setDevices([{ id: 'fav-0', type: 'hostname' as const, value: hosts[0], resolvedHostnames: [hosts[0]] }])
    setScreen('remote-doc')
  }

  // ── Sorted lists ──────────────────────────────────────────────────────────────
  const sortedDevices = [...data.devices].sort((a, b) => a.position - b.position)
  const sortedSkills  = [...data.skills].sort((a, b) => a.position - b.position)
  const totalCount    = data.devices.length + data.skills.length

  const hasSelection = selDevices.size > 0 || selSkill
  const canExecute   = selDevices.size > 0 && selSkill

  if (!username) return null

  return (
    <div className="px-2 mb-1">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
          open
            ? 'bg-amber-500/10 text-amber-400'
            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
        }`}
      >
        <Star size={16} className={open ? 'fill-amber-400 text-amber-400' : ''} />
        <span className="flex-1 text-left">Favoriten</span>
        {totalCount > 0 && (
          <span className="text-[10px] opacity-70">({totalCount})</span>
        )}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="mt-1 mx-1 rounded-lg border border-sidebar-border bg-sidebar overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-sidebar-border">
            <span className="text-[10px] text-muted-foreground flex-1">
              {loading ? 'Laden...' : `${totalCount} Favoriten`}
            </span>
            <button onClick={() => setShowAdd(true)} title="Favorit hinzufügen"
              className="p-0.5 rounded hover:bg-accent text-muted-foreground">
              <Plus size={12} />
            </button>
            <button onClick={pingAll} title="Status aktualisieren" disabled={pinging}
              className="p-0.5 rounded hover:bg-accent text-muted-foreground">
              <RefreshCw size={12} className={pinging ? 'animate-spin' : ''} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-1 py-4 text-xs text-muted-foreground">
              <Loader size={12} className="animate-spin" /> Laden...
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto">
              {/* ── Devices section ── */}
              {sortedDevices.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20 flex items-center gap-1">
                    <Monitor size={10} /> Geräte ({sortedDevices.length})
                  </div>
                  {sortedDevices.map(d => {
                    const online = pingResults[d.hostname]
                    const isSel = selDevices.has(d.hostname)
                    return (
                      <div key={d.hostname}
                        className={`flex items-center gap-1.5 px-2 py-1.5 text-xs hover:bg-accent/30 transition-colors relative ${isSel ? 'bg-primary/5' : ''}`}>
                        <input type="checkbox" checked={isSel} onChange={() => toggleDevSel(d.hostname)}
                          className="w-3 h-3 accent-primary shrink-0" />
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          online === true ? 'bg-emerald-400' : online === false ? 'bg-red-400' : 'bg-muted-foreground/30'
                        }`} />

                        {editHost === d.hostname ? (
                          <div className="flex-1 flex items-center gap-1 min-w-0">
                            <input value={editLabel} onChange={e => setEditLabel(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveLabel(d.hostname); if (e.key === 'Escape') setEditHost(null) }}
                              autoFocus placeholder="Bezeichnung"
                              className="flex-1 px-1 py-0.5 text-[10px] rounded border border-border bg-background text-foreground min-w-0" />
                            <button onClick={() => handleSaveLabel(d.hostname)} className="p-0.5 text-emerald-400"><Check size={10} /></button>
                            <button onClick={() => setEditHost(null)} className="p-0.5 text-muted-foreground"><X size={10} /></button>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1 min-w-0">
                              <span className="font-mono text-foreground truncate block text-[11px]">{d.hostname}</span>
                              {d.label && <span className="text-[9px] text-muted-foreground truncate block">{d.label}</span>}
                            </div>
                            <button onClick={() => { setMenuHost(menuHost === d.hostname ? null : d.hostname); setMenuSkill(null) }}
                              className="p-0.5 rounded hover:bg-accent text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0">
                              <MoreVertical size={11} />
                            </button>
                          </>
                        )}

                        {/* Context menu */}
                        {menuHost === d.hostname && (
                          <div className="absolute right-1 top-full z-20 bg-card border border-border rounded-md shadow-lg py-1 min-w-[140px]">
                            <button onClick={() => { setEditHost(d.hostname); setEditLabel(d.label ?? ''); setMenuHost(null) }}
                              className="w-full flex items-center gap-2 px-3 py-1 text-[10px] hover:bg-accent text-foreground">
                              <Edit2 size={10} /> Bezeichnung ändern
                            </button>
                            <button onClick={() => handleMoveDevice(d.hostname, 'up')}
                              className="w-full flex items-center gap-2 px-3 py-1 text-[10px] hover:bg-accent text-foreground">
                              <ArrowUp size={10} /> Nach oben
                            </button>
                            <button onClick={() => handleMoveDevice(d.hostname, 'down')}
                              className="w-full flex items-center gap-2 px-3 py-1 text-[10px] hover:bg-accent text-foreground">
                              <ArrowDown size={10} /> Nach unten
                            </button>
                            <div className="my-1 h-px bg-border" />
                            <button onClick={() => handleRemoveDevice(d.hostname)}
                              className="w-full flex items-center gap-2 px-3 py-1 text-[10px] hover:bg-accent text-red-400">
                              <Trash2 size={10} /> Entfernen
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Skills section ── */}
              {sortedSkills.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20 flex items-center gap-1">
                    <Wrench size={10} /> Skills ({sortedSkills.length})
                  </div>
                  {sortedSkills.map(s => {
                    const isSel = selSkill === s.skillId
                    return (
                      <div key={s.skillId}
                        className={`flex items-center gap-1.5 px-2 py-1.5 text-xs hover:bg-accent/30 transition-colors relative ${isSel ? 'bg-primary/5' : ''}`}>
                        <input type="checkbox" checked={isSel}
                          onChange={() => setSelSkill(isSel ? null : s.skillId)}
                          className="w-3 h-3 accent-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-foreground truncate block text-[11px]">{s.label}</span>
                          <span className="text-[9px] text-muted-foreground truncate block">{s.category}</span>
                        </div>
                        <button onClick={() => { setMenuSkill(menuSkill === s.skillId ? null : s.skillId); setMenuHost(null) }}
                          className="p-0.5 rounded hover:bg-accent text-muted-foreground shrink-0">
                          <MoreVertical size={11} />
                        </button>

                        {menuSkill === s.skillId && (
                          <div className="absolute right-1 top-full z-20 bg-card border border-border rounded-md shadow-lg py-1 min-w-[140px]">
                            <button onClick={() => handleMoveSkill(s.skillId, 'up')}
                              className="w-full flex items-center gap-2 px-3 py-1 text-[10px] hover:bg-accent text-foreground">
                              <ArrowUp size={10} /> Nach oben
                            </button>
                            <button onClick={() => handleMoveSkill(s.skillId, 'down')}
                              className="w-full flex items-center gap-2 px-3 py-1 text-[10px] hover:bg-accent text-foreground">
                              <ArrowDown size={10} /> Nach unten
                            </button>
                            <div className="my-1 h-px bg-border" />
                            <button onClick={() => handleRemoveSkill(s.skillId)}
                              className="w-full flex items-center gap-2 px-3 py-1 text-[10px] hover:bg-accent text-red-400">
                              <Trash2 size={10} /> Entfernen
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Empty state */}
              {totalCount === 0 && (
                <div className="py-4 text-center text-[10px] text-muted-foreground/50">
                  <Star size={16} className="mx-auto mb-1 opacity-30" />
                  Keine Favoriten vorhanden
                </div>
              )}

              {/* ── Action buttons ── */}
              {hasSelection && (
                <div className="px-2 py-2 border-t border-sidebar-border flex flex-wrap gap-1">
                  {canExecute && isAdmin && (
                    <button onClick={executeSkill} disabled={executing}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-50">
                      {executing ? <Loader size={10} className="animate-spin" /> : <Play size={10} />}
                      Ausführen
                    </button>
                  )}
                  {selDevices.size > 0 && (
                    <>
                      <button onClick={goToQueryMenu}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20">
                        <SearchIcon size={10} /> Zur Abfrage
                      </button>
                      {selDevices.size === 1 && (
                        <button onClick={goToRemoteDoc}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/30 hover:bg-purple-500/20">
                          <Terminal size={10} /> Remote Doc
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Execution results ── */}
              {execResults && (
                <div className="px-2 py-2 border-t border-sidebar-border">
                  <p className="text-[9px] font-semibold text-muted-foreground mb-1">Ergebnisse:</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {execResults.map((r, i) => (
                      <div key={i} className="text-[10px] p-1 rounded bg-muted/20">
                        <span className="font-mono text-foreground">{r.hostname}</span>
                        <span className="text-muted-foreground ml-1">— {r.output.slice(0, 200)}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setExecResults(null)}
                    className="text-[9px] text-muted-foreground hover:text-foreground mt-1">
                    Schließen
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Add dialog ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-4 w-[340px] shadow-2xl space-y-3">
            <div className="flex items-center gap-2">
              <Star size={14} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-foreground">Favorit hinzufügen</h3>
              <button onClick={() => setShowAdd(false)} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground">
                <X size={13} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1">
              <button onClick={() => setAddTab('device')}
                className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${addTab === 'device' ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-accent'}`}>
                Gerät
              </button>
              <button onClick={() => setAddTab('skill')}
                className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${addTab === 'skill' ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-accent'}`}>
                Skill
              </button>
            </div>

            {addTab === 'device' ? (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Hostname *</label>
                  <input value={addHostname} onChange={e => setAddHostname(e.target.value)}
                    placeholder="DEHAM12345"
                    className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Bezeichnung (optional)</label>
                  <input value={addLabel} onChange={e => setAddLabel(e.target.value)}
                    placeholder="z.B. Mein Laptop"
                    className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                </div>
                <button onClick={handleAddDevice} disabled={!addHostname.trim()}
                  className="w-full py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  Hinzufügen
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Kategorie</label>
                  <select value={addCatId} onChange={e => { setAddCatId(e.target.value); setAddCmdId('') }}
                    className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary">
                    <option value="">Kategorie wählen…</option>
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                {addCatId && (
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">Skill</label>
                    <select value={addCmdId} onChange={e => setAddCmdId(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary">
                      <option value="">Skill wählen…</option>
                      {CATEGORIES.find(c => c.id === addCatId)?.commands.map(cmd => (
                        <option key={cmd.id} value={cmd.id}>{cmd.func}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button onClick={handleAddSkill} disabled={!addCatId || !addCmdId}
                  className="w-full py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  Hinzufügen
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
