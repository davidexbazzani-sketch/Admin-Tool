// ── Treiber-Installation (HP-Flotte) ─────────────────────────────────────────
// PCs aus der Endgeräte-Übersicht filtern/auswählen → auf veraltete Treiber
// scannen (HP-Live-Katalog via HPCMSL am Admin-PC) → gewählte Treiber installieren.
// Kritische Treiber (GPU/Audio/Netzwerk) sind orange + opt-in; BIOS ist gesperrt
// und nur nach Bestätigung installierbar.

import { useEffect, useMemo, useState } from 'react'
import {
  HardDriveDownload, Play, Loader, Server, CheckCircle, XCircle,
  AlertTriangle, Cpu, ShieldAlert, Info, Download, Wifi,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { loadDevices, classifyModel, MODEL_CATEGORIES, type EndpointDevice } from '../services/endpointDevices'
import { ensureCmsl, scanHosts, type HpHostReport, type DriverItem, type DriverKlasse, type DriverStatus } from '../services/hpDrivers'
import { useHpDeployStore } from '../store/hpDeployStore'
import { clearWinRMCache } from '../utils/winrmUtils'
import { getPsExecDir } from '../utils/remoteCommands'
import WinRMActivationModal from '../components/WinRMActivationModal'

const keyOf = (host: string, id: string) => `${host.toLowerCase()}::${id}`

const STATUS_STYLE: Record<DriverStatus, { badge: string; label: string }> = {
  veraltet:   { badge: 'bg-red-500/15 text-red-300 border-red-500/40',       label: 'veraltet' },
  aktuell:    { badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', label: 'aktuell' },
  verfuegbar: { badge: 'bg-blue-500/15 text-blue-300 border-blue-500/40',    label: 'verfügbar' },
  unbekannt:  { badge: 'bg-muted/40 text-muted-foreground border-border',    label: 'unbekannt' },
}
const KLASSE_ROW: Record<DriverKlasse, string> = {
  normal:   '',
  kritisch: 'bg-amber-500/5',
  firmware: 'bg-amber-500/5',
  bios:     'bg-red-500/5',
}

export default function TreiberInstallation() {
  const session = useAuthStore(s => s.session)
  const by = session?.user.displayName || session?.user.username || 'unbekannt'

  // ── PC-Auswahl (wie GpuDriverMgmt) ─────────────────────────────────────────
  const [mode, setMode] = useState<'endpoint' | 'manual'>('endpoint')
  const [devices, setDevices] = useState<EndpointDevice[]>([])
  const [modelFilter, setModelFilter] = useState<string>('')
  const [stateFilter, setStateFilter] = useState('')
  const [substateFilter, setSubstateFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [manualInput, setManualInput] = useState('')

  useEffect(() => { loadDevices().then(setDevices).catch(() => {}) }, [])

  const endpointCandidates = useMemo(() => devices
    .filter(d => d.hostname.trim())
    .filter(d => !modelFilter || classifyModel(d.model) === modelFilter)
    .filter(d => !stateFilter || d.state === stateFilter)
    .filter(d => !substateFilter || d.substate === substateFilter)
    .sort((a, b) => a.hostname.localeCompare(b.hostname)), [devices, modelFilter, stateFilter, substateFilter])
  const distinctStates = useMemo(() => Array.from(new Set(devices.map(d => d.state).filter(Boolean))).sort(), [devices])
  const distinctSubstates = useMemo(() => Array.from(new Set(devices.map(d => d.substate).filter(Boolean))).sort(), [devices])
  const manualHosts = useMemo(() => Array.from(new Set(manualInput.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))), [manualInput])
  const hostsToScan = useMemo(() => mode === 'manual' ? manualHosts : endpointCandidates.filter(d => selected.has(d.hostname)).map(d => d.hostname), [mode, manualHosts, endpointCandidates, selected])

  function toggle(host: string) { setSelected(prev => { const n = new Set(prev); n.has(host) ? n.delete(host) : n.add(host); return n }) }

  // ── Scan ────────────────────────────────────────────────────────────────────
  const [cmsl, setCmsl] = useState<{ ok: boolean; version: string; error?: string } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanProg, setScanProg] = useState<{ done: number; total: number; host: string } | null>(null)
  const [reports, setReports] = useState<HpHostReport[]>([])
  const [error, setError] = useState('')

  // Auswahl der zu installierenden Treiber-Items + bestätigte BIOS-Items.
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [biosOk, setBiosOk] = useState<Set<string>>(new Set())
  const [biosDialog, setBiosDialog] = useState<{ host: string; item: DriverItem } | null>(null)
  const [rebootMode, setRebootMode] = useState<'notify' | 'reboot'>('notify')
  const [activateHost, setActivateHost] = useState<string | null>(null)   // WinRM-Aktivierung (wie Remote Doc)

  const running = useHpDeployStore(s => s.running)
  const deployProg = useHpDeployStore(s => s.progress)
  const deployResults = useHpDeployStore(s => s.results)
  const startDeploy = useHpDeployStore(s => s.run)

  async function scan() {
    if (scanning || hostsToScan.length === 0) return
    setScanning(true); setError(''); setReports([]); setScanProg({ done: 0, total: hostsToScan.length, host: '' })
    try {
      const c = await ensureCmsl(true)
      setCmsl(c)
      if (!c.ok) { setError('HP CMSL am Admin-PC nicht verfügbar: ' + (c.error || '') + ' — Katalog kann nicht online abgefragt werden.'); return }
      const rep = await scanHosts(hostsToScan, (done, total, host) => setScanProg({ done, total, host }))
      setReports(rep)
      // Vorauswahl: veraltete unkritische Treiber ankreuzen.
      const init = new Set<string>()
      for (const r of rep) for (const it of r.items) {
        if (it.status === 'veraltet' && it.klasse === 'normal') init.add(keyOf(r.hostname, it.softpaqId))
      }
      setChecked(init); setBiosOk(new Set())
    } catch (e) { setError('Scan fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e))) }
    finally { setScanning(false); setScanProg(null) }
  }

  // Nach WinRM-Aktivierung diesen einen PC neu scannen. clearWinRMCache ist PFLICHT,
  // sonst bleibt das gecachte „nicht erreichbar" und der Nachscan meldet weiter offline.
  async function rescanHost(host: string) {
    clearWinRMCache(host)
    try {
      const [rep] = await scanHosts([host])
      if (!rep) return
      setReports(prev => prev.map(r => r.hostname.toLowerCase() === host.toLowerCase() ? rep : r))
      setChecked(prev => {
        const n = new Set(prev)
        for (const it of rep.items) if (it.status === 'veraltet' && it.klasse === 'normal') n.add(keyOf(rep.hostname, it.softpaqId))
        return n
      })
    } catch { /* ignore */ }
  }

  function toggleItem(host: string, item: DriverItem) {
    const k = keyOf(host, item.softpaqId)
    if (item.klasse === 'bios' && !biosOk.has(k) && !checked.has(k)) { setBiosDialog({ host, item }); return }
    setChecked(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  }
  function confirmBios() {
    if (!biosDialog) return
    const k = keyOf(biosDialog.host, biosDialog.item.softpaqId)
    setBiosOk(prev => new Set(prev).add(k))
    setChecked(prev => new Set(prev).add(k))
    setBiosDialog(null)
  }

  const selectedCount = checked.size
  function install() {
    if (running || selectedCount === 0) return
    const plan = reports.map(r => ({
      host: r.hostname,
      items: r.items.filter(it => checked.has(keyOf(r.hostname, it.softpaqId))),
    })).filter(p => p.items.length)
    if (!plan.length) return
    void startDeploy(plan, { rebootMode, by })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3">
        <HardDriveDownload size={18} className="text-primary" />
        <h2 className="text-base font-bold text-foreground">Treiber-Installation</h2>
        <span className="text-[11px] text-muted-foreground">HP-Flotte · Live-Katalog von HP (HPCMSL)</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground"><input type="radio" checked={rebootMode === 'notify'} onChange={() => setRebootMode('notify')} className="accent-primary" />Nur Hinweis</label>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground"><input type="radio" checked={rebootMode === 'reboot'} onChange={() => setRebootMode('reboot')} className="accent-primary" />Neustart (2 Min.)</label>
          <button onClick={install} disabled={running || selectedCount === 0} title="Gewählte Treiber auf den Ziel-PCs installieren" className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-40">
            {running ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}Installieren ({selectedCount})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* 1 · PC-Auswahl */}
        <div className="bg-card rounded-lg border border-border p-4 space-y-3 max-w-3xl">
          <div className="flex items-center gap-2"><Server size={15} className="text-primary" /><h3 className="text-sm font-bold text-foreground">1 · PCs auswählen</h3></div>
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            <button onClick={() => setMode('endpoint')} className={`px-3 py-1.5 ${mode === 'endpoint' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>Aus Endgeräte-Übersicht</button>
            <button onClick={() => setMode('manual')} className={`px-3 py-1.5 border-l border-border ${mode === 'manual' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>Manuell (Hostname/IP)</button>
          </div>

          {mode === 'endpoint' ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Model-Typ:</span>
                {(['', ...MODEL_CATEGORIES] as string[]).map(cat => (
                  <button key={cat || 'all'} onClick={() => setModelFilter(cat)} className={`text-[11px] px-2 py-1 rounded-full border ${modelFilter === cat ? 'bg-primary/15 text-primary border-primary/30' : 'text-muted-foreground border-border hover:text-foreground'}`}>{cat || 'Alle'}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <label className="flex items-center gap-1.5"><span className="text-muted-foreground">Status:</span>
                  <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground"><option value="">Alle</option>{distinctStates.map(s => <option key={s} value={s}>{s}</option>)}</select>
                </label>
                <label className="flex items-center gap-1.5"><span className="text-muted-foreground">Verwendung:</span>
                  <select value={substateFilter} onChange={e => setSubstateFilter(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground"><option value="">Alle</option>{distinctSubstates.map(s => <option key={s} value={s}>{s}</option>)}</select>
                </label>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <button onClick={() => setSelected(new Set(endpointCandidates.map(d => d.hostname)))} className="px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">Alle auswählen</button>
                <button onClick={() => setSelected(new Set())} className="px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">Keine</button>
                <span className="text-muted-foreground ml-1">{selected.size} von {endpointCandidates.length} ausgewählt</span>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border/60">
                {endpointCandidates.length === 0 && <div className="p-3 text-[12px] text-muted-foreground">Keine Geräte für diesen Filter.</div>}
                {endpointCandidates.map(d => (
                  <label key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-muted/20 cursor-pointer">
                    <input type="checkbox" checked={selected.has(d.hostname)} onChange={() => toggle(d.hostname)} className="accent-primary" />
                    <Server size={12} className="text-muted-foreground shrink-0" />
                    <span className="font-mono text-foreground">{d.hostname}</span>
                    <span className="text-muted-foreground truncate">· {d.assignedTo || 'nicht zugewiesen'}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{classifyModel(d.model) || '—'}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <textarea value={manualInput} onChange={e => setManualInput(e.target.value)} rows={3}
                placeholder={'Hostname oder IP — je Zeile oder mit Komma getrennt'}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground font-mono resize-y focus:outline-none focus:border-primary" />
              <p className="text-[11px] text-muted-foreground">{manualHosts.length} PC(s) erkannt</p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button onClick={scan} disabled={scanning || hostsToScan.length === 0} className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              {scanning ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}Treiber scannen ({hostsToScan.length})
            </button>
            {cmsl && (cmsl.ok
              ? <span className="text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle size={12} />HPCMSL {cmsl.version}</span>
              : <span className="text-[11px] text-red-400 flex items-center gap-1"><XCircle size={12} />HPCMSL fehlt</span>)}
          </div>
          {scanProg && <div className="space-y-1"><div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{ width: `${scanProg.total ? (scanProg.done / scanProg.total) * 100 : 0}%` }} /></div><p className="text-[11px] text-muted-foreground">{scanProg.done}/{scanProg.total} · {scanProg.host}</p></div>}
          {error && <p className="text-xs text-red-400 flex items-center gap-1"><XCircle size={12} />{error}</p>}
        </div>

        {/* 2 · Fortschritt Installation */}
        {running && deployProg && (
          <div className="max-w-3xl bg-card border border-border rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1"><Loader size={12} className="animate-spin text-blue-400" />PC {deployProg.done + 1}/{deployProg.total} · <span className="font-mono">{deployProg.host}</span> · {deployProg.phase}</p>
            <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{ width: `${deployProg.total ? (deployProg.done / deployProg.total) * 100 : 0}%` }} /></div>
            <p className="text-[11px] text-muted-foreground">läuft im Hintergrund — Menüpunkt kann gewechselt werden.</p>
          </div>
        )}

        {/* 3 · Ergebnis je PC */}
        {reports.map(r => {
          const veraltet = r.items.filter(i => i.status === 'veraltet').length
          const res = deployResults[r.hostname.toLowerCase()]
          return (
            <div key={r.hostname} className="bg-card rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <Cpu size={14} className="text-primary" />
                <span className="text-sm font-semibold text-foreground font-mono">{r.hostname}</span>
                {r.model && <span className="text-[11px] text-muted-foreground">{r.model} · SysID {r.sysId || '—'} · {r.osVer}</span>}
                {r.biosVersion && <span className="text-[10px] text-muted-foreground">BIOS {r.biosVersion}</span>}
                {r.loggedOnUser && <span className="text-[10px] text-amber-400/80">angemeldet: {r.loggedOnUser}</span>}
                {!r.online && <span className="text-[11px] text-red-400 flex items-center gap-1"><XCircle size={11} />nicht erreichbar</span>}
                {!r.online && <button onClick={() => setActivateHost(r.hostname)} title="WinRM auf diesem PC aktivieren (genau wie in Remote Doc)" className="text-[11px] flex items-center gap-1 px-2 py-0.5 rounded border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"><Wifi size={11} />WinRM aktivieren</button>}
                {r.error && <span className="text-[11px] text-amber-400 flex items-center gap-1"><AlertTriangle size={11} />{r.error}</span>}
                {r.online && !r.error && <span className={`ml-auto text-[11px] ${veraltet ? 'text-amber-400' : 'text-emerald-400'}`}>{veraltet} veraltet · {r.items.length} verfügbar</span>}
                {res && <span className={`text-[11px] ${res.status === 'installiert' ? 'text-emerald-400' : res.status === 'teilweise' ? 'text-amber-400' : 'text-red-400'}`}>{res.message}</span>}
              </div>

              {r.online && !r.error && r.items.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-[10px] uppercase text-muted-foreground border-b border-border">
                      <th className="w-7"></th><th className="text-left py-1.5 pr-2">Treiber / Gerät</th><th className="text-left px-2">Kategorie</th>
                      <th className="text-left px-2">Installiert</th><th className="text-left px-2">Neueste</th><th className="text-left px-2">Status</th>
                    </tr></thead>
                    <tbody>
                      {r.items.map(it => {
                        const k = keyOf(r.hostname, it.softpaqId)
                        const isChecked = checked.has(k)
                        const st = STATUS_STYLE[it.status]
                        return (
                          <tr key={it.softpaqId} className={`border-b border-border/40 ${KLASSE_ROW[it.klasse]}`}>
                            <td className="py-1.5 pl-1">
                              <input type="checkbox" checked={isChecked} onChange={() => toggleItem(r.hostname, it)} className={it.klasse === 'kritisch' ? 'accent-amber-500' : it.klasse === 'bios' ? 'accent-red-500' : 'accent-primary'} />
                            </td>
                            <td className="py-1.5 pr-2 text-foreground">
                              <span className="flex items-center gap-1.5">
                                {it.name}
                                {it.klasse === 'kritisch' && <span title="Kritisch: betrifft die aktuell laufende Sitzung des Anwenders (Bild/Ton/Netz kann kurz aussetzen)."><Info size={11} className="text-amber-400" /></span>}
                                {it.klasse === 'firmware' && <span title="Firmware/Dock: extra anhaken, kann Neustart erfordern."><Info size={11} className="text-amber-400" /></span>}
                                {it.klasse === 'bios' && <span title="BIOS: nur nach Bestätigung – Unterbrechung kann den PC unbrauchbar machen."><ShieldAlert size={11} className="text-red-400" /></span>}
                              </span>
                            </td>
                            <td className="px-2 text-muted-foreground">{it.category}</td>
                            <td className="px-2 text-muted-foreground font-mono">{it.installedVersion || '—'}</td>
                            <td className="px-2 text-foreground font-mono">{it.latestVersion}</td>
                            <td className="px-2"><span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] ${st.badge}`}>{st.label}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {r.online && !r.error && r.items.length === 0 && <p className="text-[11px] text-muted-foreground">Keine Treiber im HP-Katalog für dieses Modell/OS gefunden.</p>}
            </div>
          )
        })}
      </div>

      {/* BIOS-Bestätigungsdialog */}
      {biosDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setBiosDialog(null)}>
          <div className="bg-card border border-red-500/40 rounded-lg p-5 max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-red-300 flex items-center gap-2"><ShieldAlert size={16} />BIOS-Aktualisierung bestätigen</p>
            <p className="text-xs text-foreground leading-relaxed">
              Eine BIOS-Aktualisierung greift tief ins System ein. Wird sie unterbrochen (Stromausfall, erzwungenes
              Ausschalten), kann der PC <span className="font-semibold">nicht mehr starten</span>. Nur fortfahren bei
              stabiler Stromversorgung (Netzteil angeschlossen) und wenn der Rechner gerade nicht gebraucht wird.
            </p>
            <p className="text-[11px] text-muted-foreground font-mono">{biosDialog.item.name} → {biosDialog.item.latestVersion}</p>
            <div className="flex items-center gap-2 justify-end pt-1">
              <button onClick={() => setBiosDialog(null)} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground">Abbrechen</button>
              <button onClick={confirmBios} className="px-3 py-1.5 text-xs rounded-md border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20">Ich bin mir bewusst – BIOS anhaken</button>
            </div>
          </div>
        </div>
      )}

      {/* WinRM-Aktivierung – dieselbe 6-Methoden-Leiter wie in Remote Doc */}
      {activateHost && (
        <WinRMActivationModal
          hostname={activateHost}
          psExecPath={getPsExecDir()}
          onSuccess={() => { const h = activateHost; setActivateHost(null); if (h) void rescanHost(h) }}
          onRestricted={() => { setError(`WinRM ließ sich auf ${activateHost} nicht aktivieren – PC bleibt eingeschränkt.`); setActivateHost(null) }}
          onCancel={() => setActivateHost(null)}
        />
      )}
    </div>
  )
}
