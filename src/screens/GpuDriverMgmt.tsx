// ── Grafik-/Treiber-Verwaltung (Infrastruktur) – Etappe 1: Scan + Bewertung ──
// Auswählen von Geräten (aus der Endgeräte-Übersicht oder manuell), Remote-Scan
// der GPU-Treiber, Eignungsbewertung für SolidWorks und eine gespeicherte
// Übersicht. Verteilen/Installieren folgt in Etappe 2.

import { useEffect, useMemo, useState } from 'react'
import {
  Cpu, RefreshCw, Loader2, Search, Plus, Trash2, CheckCircle2, XCircle,
  HelpCircle, AlertTriangle, ListChecks, ChevronDown, ChevronUp, Info, Server,
  FileSpreadsheet, FileText, FileDown, ArrowUpDown, Rocket, PackageCheck, PackageX, Ban,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { ColumnFilter } from './UserOverview'
import {
  loadDevices, classifyModel, MODEL_CATEGORIES, type EndpointDevice,
} from '../services/endpointDevices'
import {
  loadScanData, saveScanResults, deleteScanRecord, loadApproved, saveApproved, loadBlocked, saveBlocked,
  scanGpuDrivers, SUITABILITY_LABEL, DEFAULT_APPROVED,
  listDriverPackages,
  type GpuDriverRecord, type ApprovedDriver, type Suitability,
  type DriverPackage, type RebootMode,
} from '../services/gpuDrivers'
import { exportGpuDrivers, type GpuExportFormat, type GpuDeviceInfo } from '../services/gpuDriversExport'
import { useGpuDeployStore } from '../store/gpuDeployStore'

const inputCls = 'w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-blue-500/40'

const SUIT_STYLE: Record<Suitability, { badge: string; icon: JSX.Element }> = {
  'geeignet':       { badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', icon: <CheckCircle2 size={13} /> },
  'nicht-geeignet': { badge: 'bg-red-500/10 text-red-300 border-red-500/30',             icon: <XCircle size={13} /> },
  'unbekannt':      { badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',       icon: <HelpCircle size={13} /> },
  'fehler':         { badge: 'bg-muted/40 text-muted-foreground border-border',          icon: <AlertTriangle size={13} /> },
}

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function GpuDriverMgmt() {
  const user = useAuthStore(s => s.session?.user)
  const currentUser = user?.displayName || user?.username || 'unbekannt'

  // Geräteauswahl
  const [mode, setMode] = useState<'endpoint' | 'manual'>('endpoint')
  const [devices, setDevices] = useState<EndpointDevice[]>([])
  const [modelFilter, setModelFilter] = useState<string>('Desktop Workstation')
  const [stateFilter, setStateFilter] = useState('')      // Status (in stock, in use, …)
  const [substateFilter, setSubstateFilter] = useState('') // Verwendung (active, inactive, …)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [manualInput, setManualInput] = useState('')
  const [exporting, setExporting] = useState(false)

  // Daten
  const [scanData, setScanData] = useState<GpuDriverRecord[]>([])
  const [approved, setApproved] = useState<ApprovedDriver[]>([])
  const [blocked, setBlocked] = useState<ApprovedDriver[]>([])
  const [scanning, setScanning] = useState<{ done: number; total: number; host: string } | null>(null)

  // Tabelle
  const [search, setSearch] = useState('')
  const [suitFilter, setSuitFilter] = useState<Suitability | ''>('')
  // Excel-artige Spaltenfilter (leer = kein Filter) + Sortierung
  const [fAssigned, setFAssigned] = useState<Set<string>>(new Set())
  const [fCpu, setFCpu] = useState<Set<string>>(new Set())
  const [fRam, setFRam] = useState<Set<string>>(new Set())
  const [fGpu, setFGpu] = useState<Set<string>>(new Set())
  const [fDriver, setFDriver] = useState<Set<string>>(new Set())
  const [fNvidia, setFNvidia] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'hostname', dir: 'asc' })

  // Katalog
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [draft, setDraft] = useState<{ label: string; match: string; gpuContains: string; note: string }>({ label: '', match: '', gpuContains: '', note: '' })

  // Verteilen (Etappe 2)
  const [packages, setPackages] = useState<DriverPackage[]>([])
  const [deployPkg, setDeployPkg] = useState('')
  const [rebootMode, setRebootMode] = useState<RebootMode>('notify')
  const [deploySel, setDeploySel] = useState<Set<string>>(new Set())
  const [forceCad, setForceCad] = useState(false)
  // Verteilung läuft im Hintergrund-Store weiter (überlebt Menüwechsel).
  const deployProgress = useGpuDeployStore(s => s.progress)
  const deployRunning = useGpuDeployStore(s => s.running)
  const deployResults = useGpuDeployStore(s => s.results)
  const deployFinishedTick = useGpuDeployStore(s => s.finishedTick)
  const startDeploy = useGpuDeployStore(s => s.run)
  const clearDeployResults = useGpuDeployStore(s => s.clearResults)

  useEffect(() => {
    loadDevices().then(setDevices).catch(() => {})
    loadScanData().then(setScanData).catch(() => {})
    loadApproved().then(setApproved).catch(() => {})
    loadBlocked().then(setBlocked).catch(() => {})
    listDriverPackages().then(pkgs => { setPackages(pkgs); setDeployPkg(prev => prev || pkgs[0]?.name || '') }).catch(() => {})
  }, [])

  // Nach Abschluss einer (Hintergrund-)Verteilung die „installiert"-Markierungen übernehmen.
  useEffect(() => {
    if (deployFinishedTick > 0) loadScanData().then(setScanData).catch(() => {})
  }, [deployFinishedTick])

  function toggleDeploy(host: string) {
    setDeploySel(prev => { const n = new Set(prev); n.has(host) ? n.delete(host) : n.add(host); return n })
  }
  // Kern-Rollout: an beliebige Hosts, mit/ohne erzwungenem CAD-Beenden.
  // Fire-and-forget in den Hintergrund-Store -> läuft weiter bei Menüwechsel.
  function deployHosts(hosts: string[], force: boolean) {
    if (hosts.length === 0 || !deployPkg || useGpuDeployStore.getState().running) return
    const pkgVersion = packages.find(p => p.name === deployPkg)?.version || ''
    void startDeploy(hosts, deployPkg, { rebootMode, by: currentUser, version: pkgVersion, forceCloseCad: force })
  }

  function runDeploy() {
    const hosts = Array.from(deploySel)
    if (hosts.length === 0 || !deployPkg || useGpuDeployStore.getState().running) return
    if (!window.confirm(
      `Treiber „${deployPkg}" auf ${hosts.length} Gerät(e) verteilen und installieren?\n\n` +
      (forceCad
        ? `• ACHTUNG: Laufendes SolidWorks/HiCAD wird nach 30 Sek. Vorwarnung ERZWUNGEN beendet (nicht gespeicherte Arbeit geht verloren!).\n`
        : `• Geräte, auf denen SolidWorks oder HiCAD läuft, werden übersprungen.\n`) +
      `• Vorher erhält der Nutzer eine Desktop-Warnung.\n` +
      `• Nach der Installation: ${rebootMode === 'reboot' ? 'automatischer Neustart in 2 Min.' : 'Nutzer wird per Meldung um Neustart gebeten'}.`,
    )) return
    clearDeployResults()
    deployHosts(hosts, forceCad)
  }

  // Einzelnes blockiertes Gerät: CAD erzwungen beenden und trotzdem installieren.
  function forceDeployHost(host: string) {
    if (useGpuDeployStore.getState().running || !deployPkg) return
    if (!window.confirm(
      `Auf ${host} laufendes SolidWorks/HiCAD ERZWUNGEN beenden und Treiber installieren?\n\n` +
      `Der Nutzer wird 30 Sekunden vorher gewarnt. Nicht gespeicherte Arbeit geht verloren!`,
    )) return
    deployHosts([host], true)
  }

  // Installierten Grafiktreiber auf einem Gerät wieder deinstallieren.
  function uninstallDriverHost(host: string) {
    if (useGpuDeployStore.getState().running) return
    if (!deployPkg) { window.alert('Bitte oben unter „3 · Treiber verteilen" ein Treiber-Paket wählen — das NVIDIA-Setup wird zum Deinstallieren verwendet.'); return }
    if (!window.confirm(
      `Grafiktreiber auf ${host} DEINSTALLIEREN?\n\n` +
      `• Danach läuft der PC auf dem Windows-Basis-Anzeigetreiber (keine GPU-Beschleunigung, evtl. falsche Auflösung), bis wieder ein Treiber installiert wird — der alte Treiber kommt NICHT automatisch zurück.\n` +
      `• Ein Neustart ist nötig.\n` +
      `• Läuft SolidWorks/HiCAD, wird abgebrochen (ggf. „Beenden erzwingen" oben aktivieren).`,
    )) return
    clearDeployResults()
    void startDeploy([host], deployPkg, { rebootMode, by: currentUser, version: '', forceCloseCad: forceCad, mode: 'uninstall' })
  }

  // Geräte der Endgeräte-Übersicht nach Model-Typ / Status / Verwendung gefiltert
  const endpointCandidates = useMemo(() => {
    return devices
      .filter(d => d.hostname.trim())
      .filter(d => !modelFilter || classifyModel(d.model) === modelFilter)
      .filter(d => !stateFilter || d.state === stateFilter)
      .filter(d => !substateFilter || d.substate === substateFilter)
      .sort((a, b) => a.hostname.localeCompare(b.hostname))
  }, [devices, modelFilter, stateFilter, substateFilter])

  const distinctStates = useMemo(() => Array.from(new Set(devices.map(d => d.state).filter(Boolean))).sort(), [devices])
  const distinctSubstates = useMemo(() => Array.from(new Set(devices.map(d => d.substate).filter(Boolean))).sort(), [devices])

  // hostname -> Zusatzinfo (Model/Status/Verwendung) für den Export
  const deviceInfo: GpuDeviceInfo = useMemo(() => {
    const m: GpuDeviceInfo = {}
    for (const d of devices) if (d.hostname.trim()) m[d.hostname.trim().toLowerCase()] = { model: d.model, assignedTo: d.assignedTo, state: d.state, substate: d.substate }
    return m
  }, [devices])

  const manualHosts = useMemo(
    () => Array.from(new Set(manualInput.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))),
    [manualInput],
  )

  const hostsToScan = useMemo(
    () => mode === 'manual' ? manualHosts : endpointCandidates.filter(d => selected.has(d.hostname)).map(d => d.hostname),
    [mode, manualHosts, endpointCandidates, selected],
  )

  function toggle(host: string) {
    setSelected(prev => { const n = new Set(prev); n.has(host) ? n.delete(host) : n.add(host); return n })
  }
  function selectAll() { setSelected(new Set(endpointCandidates.map(d => d.hostname))) }
  function selectNone() { setSelected(new Set()) }

  async function runScan() {
    if (hostsToScan.length === 0 || scanning) return
    setScanning({ done: 0, total: hostsToScan.length, host: '' })
    try {
      const results = await scanGpuDrivers(hostsToScan, approved, (done, total, host) => setScanning({ done, total, host }), blocked)
      const merged = await saveScanResults(results)
      setScanData(merged)
    } catch { /* ignore */ } finally {
      setScanning(null)
    }
  }

  async function removeRecord(host: string) {
    const merged = await deleteScanRecord(host)
    setScanData(merged)
  }

  async function addCatalog() {
    const label = draft.label.trim(); const match = draft.match.trim()
    if (!label || !match) return
    const entry: ApprovedDriver = {
      id: 'apv_' + Date.now().toString(36),
      label, match, gpuContains: draft.gpuContains.trim() || undefined, note: draft.note.trim() || undefined,
      addedBy: currentUser, addedAt: new Date().toISOString(),
    }
    const next = [...approved, entry]
    setApproved(next); setDraft({ label: '', match: '', gpuContains: '', note: '' })
    await saveApproved(next)
  }
  async function removeCatalog(id: string) {
    const next = approved.filter(a => a.id !== id)
    setApproved(next); await saveApproved(next)
  }
  // Eine Freigabe/Version sperren -> künftig „nicht geeignet" + aus Freigaben raus.
  async function blockDriver(a: ApprovedDriver) {
    if (!window.confirm(`„${a.match}${a.gpuContains ? ' / ' + a.gpuContains : ''}" sperren?\n\nWird künftig als „nicht geeignet" bewertet und aus den Freigaben entfernt.`)) return
    const entry: ApprovedDriver = { id: 'blk_' + Date.now().toString(36), label: `${a.label} (gesperrt)`, match: a.match, gpuContains: a.gpuContains, note: a.note || 'Manuell gesperrt', addedBy: currentUser, addedAt: new Date().toISOString() }
    await saveBlocked([...blocked, entry])
    loadApproved().then(setApproved).catch(() => {}); loadBlocked().then(setBlocked).catch(() => {})
  }
  async function unblockDriver(id: string) {
    await saveBlocked(blocked.filter(b => b.id !== id))
    loadBlocked().then(setBlocked).catch(() => {})
  }
  function updateCatalog(id: string, patch: Partial<ApprovedDriver>) {
    setApproved(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  }
  function persistCatalog() { saveApproved(approved) }
  async function insertRecommended() {
    const present = (d: ApprovedDriver) => approved.some(x => x.match === d.match && (x.gpuContains || '') === (d.gpuContains || ''))
    const toAdd = DEFAULT_APPROVED.filter(d => !present(d)).map(d => ({ ...d, id: 'apv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }))
    if (toAdd.length === 0) return
    const next = [...approved, ...toAdd]
    setApproved(next); await saveApproved(next)
  }

  const assignedOf = (r: GpuDriverRecord) => deviceInfo[r.hostname.trim().toLowerCase()]?.assignedTo || ''
  const ramLabel = (gb: number) => gb ? `${gb} GB` : ''

  // Werte je Spalte für die Excel-artigen Filter (Wert -> Anzahl)
  const colValues = useMemo(() => {
    const mk = (acc: (r: GpuDriverRecord) => string) => {
      const m = new Map<string, number>()
      for (const r of scanData) { const v = acc(r); m.set(v, (m.get(v) || 0) + 1) }
      return m
    }
    return {
      assigned: mk(assignedOf),
      cpu: mk(r => r.cpu || ''),
      ram: mk(r => ramLabel(r.ramGB)),
      gpu: mk(r => r.gpuName || ''),
      driver: mk(r => r.driverVersion || ''),
      nvidia: mk(r => r.nvidiaVersion || ''),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanData, deviceInfo])

  function toggleSort(key: string) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }
  function sortVal(r: GpuDriverRecord, key: string): string | number {
    switch (key) {
      case 'assignedTo': return assignedOf(r).toLowerCase()
      case 'cpu': return (r.cpu || '').toLowerCase()
      case 'ramGB': return r.ramGB || 0
      case 'gpuName': return (r.gpuName || '').toLowerCase()
      case 'driverVersion': return (r.driverVersion || '').toLowerCase()
      case 'nvidiaVersion': return (r.nvidiaVersion || '').toLowerCase()
      case 'suitability': return r.suitability
      case 'scannedAt': return r.scannedAt || ''
      default: return (r.hostname || '').toLowerCase()
    }
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = scanData.filter(r => {
      if (suitFilter && r.suitability !== suitFilter) return false
      if (q && ![r.hostname, r.gpuName, r.driverVersion, r.nvidiaVersion, r.cpu, assignedOf(r)].some(v => (v || '').toLowerCase().includes(q))) return false
      if (fAssigned.size && !fAssigned.has(assignedOf(r))) return false
      if (fCpu.size && !fCpu.has(r.cpu || '')) return false
      if (fRam.size && !fRam.has(ramLabel(r.ramGB))) return false
      if (fGpu.size && !fGpu.has(r.gpuName || '')) return false
      if (fDriver.size && !fDriver.has(r.driverVersion || '')) return false
      if (fNvidia.size && !fNvidia.has(r.nvidiaVersion || '')) return false
      return true
    })
    rows.sort((a, b) => {
      const va = sortVal(a, sort.key), vb = sortVal(b, sort.key)
      const cmp = (typeof va === 'number' && typeof vb === 'number')
        ? va - vb
        : String(va).localeCompare(String(vb), 'de', { numeric: true, sensitivity: 'base' })
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanData, search, suitFilter, deviceInfo, fAssigned, fCpu, fRam, fGpu, fDriver, fNvidia, sort])

  const anyColFilter = fAssigned.size || fCpu.size || fRam.size || fGpu.size || fDriver.size || fNvidia.size
  function clearColFilters() { setFAssigned(new Set()); setFCpu(new Set()); setFRam(new Set()); setFGpu(new Set()); setFDriver(new Set()); setFNvidia(new Set()) }

  const sortableHead = (col: string, label: string) => (
    <th className="px-2.5 py-2 font-semibold">
      <button onClick={() => toggleSort(col)} className="inline-flex items-center gap-1 hover:text-foreground" title="Sortieren">
        {label}
        {sort.key === col
          ? (sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
          : <ArrowUpDown size={10} className="opacity-30" />}
      </button>
    </th>
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { geeignet: 0, 'nicht-geeignet': 0, unbekannt: 0, fehler: 0 }
    for (const r of scanData) c[r.suitability] = (c[r.suitability] || 0) + 1
    return c
  }, [scanData])

  async function doExport(format: GpuExportFormat) {
    if (filteredRows.length === 0 || exporting) return
    setExporting(true)
    try { await exportGpuDrivers(filteredRows, format, { deviceInfo }) } catch { /* ignore */ } finally { setExporting(false) }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1240px] mx-auto space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Cpu size={20} className="text-blue-400" />Grafik-/Treiber-Verwaltung</h1>
          <p className="text-sm text-muted-foreground mt-0.5">SolidWorks-Workstations: Grafiktreiber prüfen und bewerten. <span className="text-muted-foreground/80">(Etappe 1 – Scan &amp; Bewertung; Verteilen/Installieren folgt.)</span></p>
        </div>

        {/* Info */}
        <div className="flex gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-[12.5px] text-muted-foreground">
          <Info size={15} className="text-blue-400 shrink-0 mt-0.5" />
          <p>Für SolidWorks ist <strong className="text-foreground">nur der Grafiktreiber zertifiziert</strong>. Consumer-/„Game&nbsp;Ready"-Treiber (GeForce/GTX) sind <strong className="text-foreground">nicht zertifiziert</strong> und lösen die bekannte Warnung aus. „Zertifiziert" ist versionsspezifisch — trage im <strong className="text-foreground">Freigabe-Katalog</strong> (unten) die von euch freigegebenen Treiberversionen ein, dann bewertet der Scan sie als „geeignet".</p>
        </div>

        {/* 1. Geräteauswahl */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ListChecks size={15} className="text-blue-400" />
            <h2 className="text-sm font-bold text-foreground">1 · Geräte auswählen</h2>
          </div>

          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            <button onClick={() => setMode('endpoint')} className={`px-3 py-1.5 ${mode === 'endpoint' ? 'bg-blue-500/15 text-blue-300' : 'text-muted-foreground hover:text-foreground'}`}>Aus Endgeräte-Übersicht</button>
            <button onClick={() => setMode('manual')} className={`px-3 py-1.5 border-l border-border ${mode === 'manual' ? 'bg-blue-500/15 text-blue-300' : 'text-muted-foreground hover:text-foreground'}`}>Manuell (Hostname/IP)</button>
          </div>

          {mode === 'endpoint' ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Model-Typ:</span>
                {(['', ...MODEL_CATEGORIES] as string[]).map(cat => (
                  <button key={cat || 'all'} onClick={() => setModelFilter(cat)}
                    className={`text-[11px] px-2 py-1 rounded-full border ${modelFilter === cat ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : 'text-muted-foreground border-border hover:text-foreground'}`}>
                    {cat || 'Alle'}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <label className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Status:</span>
                  <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/40">
                    <option value="">Alle</option>
                    {distinctStates.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Verwendung:</span>
                  <select value={substateFilter} onChange={e => setSubstateFilter(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/40">
                    <option value="">Alle</option>
                    {distinctSubstates.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <button onClick={selectAll} className="px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">Alle auswählen</button>
                <button onClick={selectNone} className="px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">Keine</button>
                <span className="text-muted-foreground ml-1">{selected.size} von {endpointCandidates.length} ausgewählt</span>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border/60">
                {endpointCandidates.length === 0 && <div className="p-3 text-[12px] text-muted-foreground">Keine Geräte für diesen Filter (Endgeräte-Übersicht ggf. leer/ungefiltert).</div>}
                {endpointCandidates.map(d => (
                  <label key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-muted/20 cursor-pointer">
                    <input type="checkbox" checked={selected.has(d.hostname)} onChange={() => toggle(d.hostname)} className="accent-blue-500" />
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
              <textarea value={manualInput} onChange={e => setManualInput(e.target.value)} rows={4}
                placeholder={'Hostnamen oder IPs — je Zeile oder mit Komma getrennt\nz. B. DE12345\n192.168.10.20'}
                className={`${inputCls} font-mono resize-y`} />
              <p className="text-[11px] text-muted-foreground">{manualHosts.length} Gerät(e) erkannt.</p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button onClick={runScan} disabled={hostsToScan.length === 0 || !!scanning}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed">
              {scanning ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              {scanning ? 'Scan läuft…' : `Treiber scannen (${hostsToScan.length})`}
            </button>
            {scanning && <span className="text-[12px] text-muted-foreground">{scanning.done}/{scanning.total} · {scanning.host}</span>}
          </div>
          {scanning && (
            <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${scanning.total ? (scanning.done / scanning.total) * 100 : 0}%` }} />
            </div>
          )}
        </section>

        {/* 2. Übersicht */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2"><Cpu size={15} className="text-blue-400" />2 · Übersicht ({scanData.length})</h2>
            <div className="flex items-center gap-1.5 ml-auto text-[11px]">
              {(['geeignet', 'nicht-geeignet', 'unbekannt', 'fehler'] as Suitability[]).map(s => (
                <button key={s} onClick={() => setSuitFilter(suitFilter === s ? '' : s)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border ${suitFilter === s ? SUIT_STYLE[s].badge : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  {SUIT_STYLE[s].icon}{SUITABILITY_LABEL[s]} <span className="opacity-70">{counts[s] || 0}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche Hostname / GPU / Version…" className={`${inputCls} pl-7`} />
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Export ({filteredRows.length}):</span>
              <button onClick={() => doExport('excel')} disabled={filteredRows.length === 0 || exporting} title="Als Excel exportieren" className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"><FileSpreadsheet size={13} />Excel</button>
              <button onClick={() => doExport('word')} disabled={filteredRows.length === 0 || exporting} title="Als Word exportieren" className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"><FileText size={13} />Word</button>
              <button onClick={() => doExport('pdf')} disabled={filteredRows.length === 0 || exporting} title="Als PDF exportieren" className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"><FileDown size={13} />PDF</button>
              {exporting && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
            </div>
          </div>

          {/* Excel-artige Spaltenfilter */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground mr-0.5">Filter:</span>
            <ColumnFilter label="Zugewiesen an" values={colValues.assigned} selected={fAssigned} onChange={setFAssigned} />
            <ColumnFilter label="CPU" values={colValues.cpu} selected={fCpu} onChange={setFCpu} />
            <ColumnFilter label="RAM" values={colValues.ram} selected={fRam} onChange={setFRam} />
            <ColumnFilter label="Grafikkarte" values={colValues.gpu} selected={fGpu} onChange={setFGpu} />
            <ColumnFilter label="Treiber" values={colValues.driver} selected={fDriver} onChange={setFDriver} />
            <ColumnFilter label="NVIDIA" values={colValues.nvidia} selected={fNvidia} onChange={setFNvidia} />
            {anyColFilter ? <button onClick={clearColFilters} className="text-[11px] px-2 py-1 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10">Alle Filter aufheben</button> : null}
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-muted/20 text-left text-[11px] text-muted-foreground">
                  <th className="px-2 py-2 w-8 text-center">
                    <input type="checkbox" aria-label="Alle auswählen"
                      checked={filteredRows.length > 0 && filteredRows.every(r => deploySel.has(r.hostname))}
                      onChange={e => setDeploySel(e.target.checked ? new Set(filteredRows.map(r => r.hostname)) : new Set())}
                      className="accent-blue-500" />
                  </th>
                  {sortableHead('hostname', 'Hostname')}
                  {sortableHead('assignedTo', 'Zugewiesen an')}
                  {sortableHead('cpu', 'CPU')}
                  {sortableHead('ramGB', 'RAM')}
                  {sortableHead('gpuName', 'Grafikkarte')}
                  {sortableHead('driverVersion', 'Treiber (WMI)')}
                  {sortableHead('nvidiaVersion', 'NVIDIA')}
                  {sortableHead('suitability', 'Eignung')}
                  {sortableHead('scannedAt', 'Geprüft')}
                  <th className="px-2.5 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredRows.length === 0 && (
                  <tr><td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">Noch keine Scan-Ergebnisse. Oben Geräte auswählen und „Treiber scannen".</td></tr>
                )}
                {filteredRows.map(r => (
                  <tr key={r.hostname} className="hover:bg-muted/10">
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={deploySel.has(r.hostname)} onChange={() => toggleDeploy(r.hostname)} className="accent-blue-500" />
                    </td>
                    <td className="px-2.5 py-1.5 font-mono text-foreground whitespace-nowrap">
                      <div className="flex items-center">
                        {r.hostname}
                        {r.installedViaTool && <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30" title={`Über das Tool installiert von ${r.installedBy || '?'}`}>Tool</span>}
                        {deployResults[r.hostname.toLowerCase()] && (
                          <span className={`ml-1.5 text-[9px] px-1 py-0.5 rounded border ${
                            deployResults[r.hostname.toLowerCase()].status === 'installiert' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                              : deployResults[r.hostname.toLowerCase()].status === 'deinstalliert' ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                              : deployResults[r.hostname.toLowerCase()].status === 'blockiert' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                : 'bg-red-500/10 text-red-300 border-red-500/30'
                          }`} title={deployResults[r.hostname.toLowerCase()].message}>
                            {deployResults[r.hostname.toLowerCase()].status}
                          </span>
                        )}
                      </div>
                      {r.installedViaTool && (
                        <div className="font-sans text-[10px] text-emerald-400/80 mt-0.5">
                          ✓ per Tool aktualisiert {fmtDate(r.installedAt)}
                          {r.previousVersion ? <span className="text-muted-foreground"> · vorher {r.previousVersion}</span> : null}
                        </div>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-foreground whitespace-nowrap">{deviceInfo[r.hostname.trim().toLowerCase()]?.assignedTo || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2.5 py-1.5 text-foreground">{r.cpu || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2.5 py-1.5 text-foreground whitespace-nowrap">{r.ramGB ? `${r.ramGB} GB` : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2.5 py-1.5 text-foreground">{r.gpuName || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2.5 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{r.driverVersion || '—'}</td>
                    <td className="px-2.5 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{r.nvidiaVersion || '—'}</td>
                    <td className="px-2.5 py-1.5">
                      <span title={r.suitabilityReason || r.error || ''} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11px] ${SUIT_STYLE[r.suitability].badge}`}>
                        {SUIT_STYLE[r.suitability].icon}{SUITABILITY_LABEL[r.suitability]}
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5 text-muted-foreground whitespace-nowrap">{fmtDate(r.scannedAt)}</td>
                    <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
                      {r.gpuVendor === 'nvidia' && (
                        <button onClick={() => uninstallDriverHost(r.hostname)} disabled={deployRunning} title="Grafiktreiber auf diesem Gerät deinstallieren"
                          className="p-1 rounded text-muted-foreground hover:text-amber-400 disabled:opacity-40"><PackageX size={13} /></button>
                      )}
                      <button onClick={() => removeRecord(r.hostname)} title="Aus Übersicht entfernen" className="p-1 rounded text-muted-foreground hover:text-red-400"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">Tipp: Mit der Maus über „Eignung" fahren zeigt die Begründung. Links die Häkchen wählen die Ziele für „Verteilen".</p>
        </section>

        {/* 3 · Treiber verteilen */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Rocket size={15} className="text-blue-400" />
            <h2 className="text-sm font-bold text-foreground">3 · Treiber verteilen &amp; installieren</h2>
          </div>
          <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-[12px] text-muted-foreground">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <p>Oben in der Übersicht die <strong className="text-foreground">Zielgeräte (Häkchen)</strong> wählen, hier den Treiber. Es wird <strong className="text-foreground">nur installiert, wenn SolidWorks/HiCAD geschlossen</strong> ist — sonst wird das Gerät übersprungen. Der Nutzer bekommt vorher eine Desktop-Warnung, danach ist ein <strong className="text-foreground">Neustart</strong> nötig.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1.7fr_1.5fr_auto] gap-3 items-end">
            <div>
              <label className="text-[11px] text-muted-foreground">Treiber-Paket</label>
              {packages.length === 0 ? (
                <p className="text-[12px] text-amber-300 mt-1">Kein Treiber gefunden — .exe in <code className="font-mono">…\Tool IT\gpu-drivers\packages</code> auf der Freigabe ablegen.</p>
              ) : (
                <select value={deployPkg} onChange={e => setDeployPkg(e.target.value)} className={`${inputCls} mt-1 font-mono`}>
                  {packages.map(p => <option key={p.name} value={p.name}>{p.name}{p.version ? `  (v${p.version})` : ''}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Nach der Installation</label>
              <div className="mt-1 flex flex-col gap-1 text-[12px]">
                <label className="inline-flex items-center gap-2"><input type="radio" name="rebootMode" checked={rebootMode === 'notify'} onChange={() => setRebootMode('notify')} className="accent-blue-500" />Nur Meldung an Nutzer („bitte neu starten")</label>
                <label className="inline-flex items-center gap-2"><input type="radio" name="rebootMode" checked={rebootMode === 'reboot'} onChange={() => setRebootMode('reboot')} className="accent-blue-500" />Neustart automatisch (Countdown 2 Min.)</label>
              </div>
            </div>
            <button onClick={runDeploy} disabled={deploySel.size === 0 || !deployPkg || deployRunning}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed">
              {deployRunning ? <Loader2 size={15} className="animate-spin" /> : <PackageCheck size={15} />}
              {deployRunning ? 'Verteilt…' : `Verteilen an ${deploySel.size}`}
            </button>
          </div>
          <label className={`inline-flex items-start gap-2 text-[12px] rounded-md border p-2 ${forceCad ? 'border-red-500/40 bg-red-500/5 text-red-200' : 'border-border text-muted-foreground'}`}>
            <input type="checkbox" checked={forceCad} onChange={e => setForceCad(e.target.checked)} className="accent-red-500 mt-0.5" />
            <span>Laufendes <strong className="text-foreground">SolidWorks/HiCAD erzwungen beenden</strong> statt überspringen. Der Nutzer wird 30 Sek. vorher am Ziel-PC gewarnt — <strong className="text-red-300">nicht gespeicherte Arbeit geht verloren.</strong> Nur nutzen, wenn der Nutzer Bescheid weiß.</span>
          </label>
          {deployProgress && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 size={13} className="animate-spin" />{deployProgress.done}/{deployProgress.total} · {deployProgress.host} {deployProgress.phase ? `· ${deployProgress.phase}` : ''}</div>
              <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{ width: `${deployProgress.total ? (deployProgress.done / deployProgress.total) * 100 : 0}%` }} /></div>
              <p className="text-[11px] text-muted-foreground">Läuft im Hintergrund weiter — du kannst den Menüpunkt wechseln, die Verteilung läuft trotzdem zu Ende.</p>
            </div>
          )}
          {Object.keys(deployResults).length > 0 && !deployRunning && (
            <div className="rounded-md border border-border divide-y divide-border/60 text-[12px]">
              {Object.values(deployResults).map(r => (
                <div key={r.host} className="flex items-center gap-2 px-3 py-1.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${r.status === 'installiert' ? 'bg-emerald-400' : r.status === 'deinstalliert' ? 'bg-sky-400' : r.status === 'blockiert' ? 'bg-amber-400' : 'bg-red-400'}`} />
                  <span className="font-mono text-foreground shrink-0">{r.host}</span>
                  <span className="text-muted-foreground">{r.message}</span>
                  {r.status === 'blockiert' && /läuft/i.test(r.message) && (
                    <button onClick={() => forceDeployHost(r.host)} disabled={deployRunning}
                      className="ml-auto shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed">
                      <XCircle size={12} /> Beenden &amp; installieren
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 3. Freigabe-Katalog */}
        <section className="rounded-lg border border-border bg-card">
          <button onClick={() => setCatalogOpen(o => !o)} className="w-full flex items-center gap-2 p-4 text-sm font-bold text-foreground">
            <ListChecks size={15} className="text-blue-400" />
            Freigabe-Katalog (freigegebene Treiberversionen) · {approved.length}
            <ChevronDown size={15} className={`ml-auto text-muted-foreground transition-transform ${catalogOpen ? 'rotate-180' : ''}`} />
          </button>
          {catalogOpen && (
            <div className="px-4 pb-4 space-y-3 border-t border-border/60 pt-3">
              <p className="text-[12px] text-muted-foreground">
                Trage hier die von der IT/SolidWorks freigegebenen Treiberversionen ein. Der Scan bewertet eine Version als <strong className="text-emerald-300">geeignet</strong>, wenn sie hier steht.
                <strong className="text-foreground"> Version</strong> = entweder die NVIDIA-Anzeige (z. B. <code className="font-mono">596.86</code>) oder die WMI-Version (z. B. <code className="font-mono">32.0.15.9686</code>). <strong className="text-foreground">GPU enthält</strong> (optional) grenzt die Freigabe auf passende Karten ein (z. B. <code className="font-mono">RTX A</code>).
              </p>
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1.4fr_auto] gap-2 items-center">
                <input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder="Bezeichnung (z. B. RTX Enterprise 596.86)" className={inputCls} />
                <input value={draft.match} onChange={e => setDraft({ ...draft, match: e.target.value })} placeholder="Version (596.86)" className={`${inputCls} font-mono`} />
                <input value={draft.gpuContains} onChange={e => setDraft({ ...draft, gpuContains: e.target.value })} placeholder="GPU enthält (optional)" className={inputCls} />
                <input value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="Notiz (optional)" className={inputCls} />
                <button onClick={addCatalog} disabled={!draft.label.trim() || !draft.match.trim()} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"><Plus size={13} />Hinzufügen</button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={insertRecommended} className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><Plus size={12} />Empfohlene Treiber einfügen</button>
                <span className="text-[10px] text-muted-foreground">RTX 2000 Ada · RTX A4000 → 596.86 · <span className="text-red-300">Quadro RTX 4000 → 596.86 gesperrt</span></span>
              </div>
              {approved.length > 0 && (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[1.4fr_1fr_1fr_1.4fr_auto] gap-2 text-[10px] text-muted-foreground px-0.5">
                    <span>Bezeichnung</span><span>Version</span><span>GPU enthält</span><span>Notiz / Beleglage</span><span></span>
                  </div>
                  {approved.map(a => (
                    <div key={a.id} className="grid grid-cols-[1.4fr_1fr_1fr_1.4fr_auto] gap-2 items-center">
                      <input value={a.label} onChange={e => updateCatalog(a.id, { label: e.target.value })} onBlur={persistCatalog} className={inputCls} />
                      <input value={a.match} onChange={e => updateCatalog(a.id, { match: e.target.value })} onBlur={persistCatalog} className={`${inputCls} font-mono`} />
                      <input value={a.gpuContains || ''} onChange={e => updateCatalog(a.id, { gpuContains: e.target.value })} onBlur={persistCatalog} placeholder="(alle GPUs)" className={inputCls} />
                      <input value={a.note || ''} onChange={e => updateCatalog(a.id, { note: e.target.value })} onBlur={persistCatalog} placeholder="Notiz" className={inputCls} />
                      <div className="flex items-center gap-1 justify-self-center">
                        <button onClick={() => blockDriver(a)} title="Diese Version sperren (→ nicht geeignet)" className="p-1 rounded text-muted-foreground hover:text-red-400"><Ban size={13} /></button>
                        <button onClick={() => removeCatalog(a.id)} title="Entfernen" className="p-1 rounded text-muted-foreground hover:text-red-400"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Gesperrte Versionen */}
              <div className="pt-2 border-t border-border/60 space-y-1.5">
                <p className="text-[12px] font-semibold text-foreground flex items-center gap-1.5"><Ban size={13} className="text-red-400" />Gesperrte Versionen · {blocked.length}</p>
                <p className="text-[11px] text-muted-foreground">Diese Treiber-/GPU-Kombinationen werden IMMER als <strong className="text-red-300">nicht geeignet</strong> bewertet — z. B. weil sie Probleme verursachen (596.86 bringt auf der Quadro RTX 4000 den „RTX Desktop Manager" mit, der Chromium/Edge bricht).</p>
                {blocked.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/70">Keine Sperren.</p>
                ) : blocked.map(b => (
                  <div key={b.id} className="flex items-center gap-2 text-[12px] rounded-md border border-red-500/30 bg-red-500/5 px-2.5 py-1.5">
                    <Ban size={12} className="text-red-400 shrink-0" />
                    <span className="font-mono text-foreground">{b.match}</span>
                    {b.gpuContains && <span className="text-muted-foreground">· GPU: {b.gpuContains}</span>}
                    {b.note && <span className="text-muted-foreground truncate">· {b.note}</span>}
                    <button onClick={() => unblockDriver(b.id)} title="Entsperren" className="ml-auto shrink-0 text-[11px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground">Entsperren</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
