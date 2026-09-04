// ── Treiber-Installation (HP-Flotte) ─────────────────────────────────────────
// PCs aus der Endgeräte-Übersicht filtern/auswählen → auf veraltete Treiber
// scannen (HP-Live-Katalog via HPCMSL am Admin-PC) → gewählte Treiber installieren.
// Kritische Treiber (GPU/Audio/Netzwerk) sind orange + opt-in; BIOS ist gesperrt
// und nur nach Bestätigung installierbar.

import { useEffect, useMemo, useState } from 'react'
import {
  HardDriveDownload, Play, Loader, Server, CheckCircle, XCircle,
  AlertTriangle, Cpu, ShieldAlert, Info, Download, Wifi, FileDown, ClipboardCheck, Search, User, RefreshCw,
  ChevronDown, Building2,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { api } from '../electronAPI'
import { loadDevices, classifyModel, MODEL_CATEGORIES, type EndpointDevice } from '../services/endpointDevices'
import { ensureCmsl, installCmslAllUsers, scanHosts, type HpHostReport, type DriverItem, type DriverKlasse, type DriverStatus } from '../services/hpDrivers'
import { exportHpDriverReport } from '../services/hpDriversReport'
import { useHpDeployStore } from '../store/hpDeployStore'
import { clearWinRMCache } from '../utils/winrmUtils'
import { buildParallelOnlineCheck, parseOnlineCheckLine } from '../utils/connectivityCheck'
import { ensureDailyAdUsers, buildNameIndex, lookupUserByName } from '../services/adUserDirectory'
import type { AdUserListItem } from '../services/adUsersList'
import { getPsExecDir } from '../utils/remoteCommands'
import WinRMActivationModal from '../components/WinRMActivationModal'
import { DeviceInfoButton } from '../components/device/DeviceDossier'

const keyOf = (host: string, id: string) => `${host.toLowerCase()}::${id}`

// Eine Person mit ihren zugewiesenen Geräten (für Abteilungs-/Namenssuche).
interface Person { name: string; department: string; devices: EndpointDevice[] }

// HP-Katalog-Abrufdatum als „TT.MM.JJJJ (vor N Tagen)".
function katalogAlter(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  const tage = Math.floor((Date.now() - d.getTime()) / 86400000)
  const wann = tage <= 0 ? 'heute' : tage === 1 ? 'gestern' : `vor ${tage} Tagen`
  return `${d.toLocaleDateString('de-DE')} (${wann})`
}

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

// Ein Treiber ist „anwendbar", wenn er zur vorhandenen Hardware passt ODER keinen
// Hardware-Bezug hat (BIOS/Firmware/Software). Nur nicht-anwendbare werden gesperrt.
const istAnwendbar = (it: DriverItem) => it.anwendbar || it.ohneHardwareBezug

// Status-Badge: nicht-anwendbare überschreiben den Versionsstatus (der wäre sinnlos).
function statusBadge(it: DriverItem): { badge: string; label: string } {
  if (!istAnwendbar(it)) return { badge: 'bg-muted/30 text-muted-foreground border-border', label: 'nicht anwendbar' }
  return STATUS_STYLE[it.status]
}

export default function TreiberInstallation() {
  const session = useAuthStore(s => s.session)
  const by = session?.user.displayName || session?.user.username || 'unbekannt'

  // ── PC-Auswahl (wie GpuDriverMgmt) ─────────────────────────────────────────
  const [mode, setMode] = useState<'endpoint' | 'name' | 'manual'>('endpoint')
  const [devices, setDevices] = useState<EndpointDevice[]>([])
  const [modelFilter, setModelFilter] = useState<string>('')
  const [stateFilter, setStateFilter] = useState('')
  const [substateFilter, setSubstateFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [manualInput, setManualInput] = useState('')
  // Personensuche / Abteilungsfilter: Name oder Abteilung → Personen + zugewiesene Geräte + Online-Status.
  const [nameQuery, setNameQuery] = useState('')
  const [nameSubmitted, setNameSubmitted] = useState('')
  const [deptSel, setDeptSel] = useState<Set<string>>(new Set())                 // gewählte Abteilungen (Mehrfach)
  const [deptOpen, setDeptOpen] = useState(false)                                // Abteilungs-Übersicht ein-/ausgeklappt
  const [deptSearch, setDeptSearch] = useState('')                              // Suchfeld innerhalb der Abteilungen
  const [onlineMap, setOnlineMap] = useState<Map<string, boolean>>(new Map())   // hostname(lc) → online
  const [onlineChecking, setOnlineChecking] = useState(false)
  const [adUsers, setAdUsers] = useState<AdUserListItem[]>([])                    // AD-Verzeichnis (Name → Abteilung)
  const [adLoading, setAdLoading] = useState(false)
  const [adInfo, setAdInfo] = useState('')

  useEffect(() => { loadDevices().then(setDevices).catch(() => {}) }, [])

  // AD-Verzeichnis (für Abteilungen) laden — erst beim Wechsel in den Personen-Modus (zentraler
  // Tages-Cache, kein Live-Query pro Öffnen). `force` = frisch aus AD nachziehen (kann dauern).
  async function ladeAd(force: boolean) {
    setAdLoading(true); setAdInfo('')
    try {
      const { dir, error } = await ensureDailyAdUsers(force)
      if (dir) { setAdUsers(dir.users); setAdInfo(`AD-Stand ${new Date(dir.loadedAt).toLocaleDateString('de-DE')} · ${dir.users.length} Personen`) }
      else setAdInfo('AD-Verzeichnis nicht verfügbar' + (error ? ': ' + error : ''))
    } catch (e) { setAdInfo('AD-Fehler: ' + (e instanceof Error ? e.message : String(e))) }
    finally { setAdLoading(false) }
  }
  useEffect(() => { if (mode === 'name' && !adUsers.length && !adLoading) void ladeAd(false) }, [mode])   // eslint-disable-line react-hooks/exhaustive-deps

  const endpointCandidates = useMemo(() => devices
    .filter(d => d.hostname.trim())
    .filter(d => !modelFilter || classifyModel(d.model) === modelFilter)
    .filter(d => !stateFilter || d.state === stateFilter)
    .filter(d => !substateFilter || d.substate === substateFilter)
    .sort((a, b) => a.hostname.localeCompare(b.hostname)), [devices, modelFilter, stateFilter, substateFilter])
  const distinctStates = useMemo(() => Array.from(new Set(devices.map(d => d.state).filter(Boolean))).sort(), [devices])
  const distinctSubstates = useMemo(() => Array.from(new Set(devices.map(d => d.substate).filter(Boolean))).sort(), [devices])
  const manualHosts = useMemo(() => Array.from(new Set(manualInput.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))), [manualInput])

  // Name → AD-User (mit Abteilung); löst auch „Nachname, Vorname" auf.
  const nameIndex = useMemo(() => buildNameIndex(adUsers), [adUsers])
  const deptOf = (assignedTo: string): string => lookupUserByName(nameIndex, assignedTo)?.department || ''
  // Abteilungen, die tatsächlich zugewiesene Geräte im Inventar haben.
  const departments = useMemo(() => {
    const s = new Set<string>()
    for (const d of devices) { if (!d.hostname.trim()) continue; const dep = deptOf(d.assignedTo); if (dep) s.add(dep) }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [devices, nameIndex])   // eslint-disable-line react-hooks/exhaustive-deps

  // Personen (gruppiert) für die aktuelle Filterung: gewählte Abteilungen UND/ODER Namenssuche.
  const personenFuer = (depts: Set<string>, q: string): Person[] => {
    const s = q.trim().toLowerCase()
    if (!depts.size && !s) return []
    const map = new Map<string, Person>()
    for (const d of devices) {
      if (!d.hostname.trim()) continue
      const dep = deptOf(d.assignedTo)
      if (depts.size && !depts.has(dep)) continue
      const person = d.assignedTo.trim() || 'nicht zugewiesen'
      if (s && !`${person} ${dep} ${d.hostname} ${d.serial}`.toLowerCase().includes(s)) continue
      const key = person.toLowerCase()
      if (!map.has(key)) map.set(key, { name: person, department: dep, devices: [] })
      map.get(key)!.devices.push(d)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }
  const personen = useMemo(() => personenFuer(deptSel, nameSubmitted), [devices, nameIndex, deptSel, nameSubmitted])   // eslint-disable-line react-hooks/exhaustive-deps
  const personenAktiv = deptSel.size > 0 || !!nameSubmitted
  const alleTreffHosts = useMemo(() => personen.flatMap(p => p.devices.map(d => d.hostname)), [personen])
  const nameModeHosts = useMemo(() => alleTreffHosts.filter(h => selected.has(h)), [alleTreffHosts, selected])

  const hostsToScan = useMemo(() =>
    mode === 'manual' ? manualHosts
      : mode === 'name' ? nameModeHosts
        : endpointCandidates.filter(d => selected.has(d.hostname)).map(d => d.hostname),
    [mode, manualHosts, nameModeHosts, endpointCandidates, selected])

  function toggle(host: string) { setSelected(prev => { const n = new Set(prev); n.has(host) ? n.delete(host) : n.add(host); return n }) }

  // Online-Status der Hosts prüfen (paralleler Ping→SMB→RPC-Check, kein WinRM) — auch für ganze Abteilungen zügig.
  async function pruefeOnline(hosts: string[]) {
    const clean = [...new Set(hosts.map(h => h.trim()).filter(Boolean))]
    if (!clean.length) { setOnlineMap(new Map()); return }
    setOnlineChecking(true)
    try {
      const r = await api().runPowerShell(buildParallelOnlineCheck(clean), Math.min(240000, 30000 + clean.length * 800))
      const m = new Map<string, boolean>()
      for (const line of (r.stdout || '').split(/\r?\n/)) {
        if (!/:OK:|:OFFLINE/.test(line)) continue
        const p = parseOnlineCheckLine(line)
        if (p.hostname) m.set(p.hostname.trim().toLowerCase(), p.online)
      }
      setOnlineMap(m)
    } catch { /* Fehler → Status bleibt unbekannt */ }
    finally { setOnlineChecking(false) }
  }

  // Filter anwenden: Treffer bestimmen, alle vorauswählen und Online-Status prüfen.
  function anwenden(depts: Set<string>, q: string) {
    const hosts = personenFuer(depts, q).flatMap(p => p.devices.map(d => d.hostname))
    setSelected(new Set(hosts)); setOnlineMap(new Map())
    void pruefeOnline(hosts)
  }
  function sucheName() { const q = nameQuery.trim(); setNameSubmitted(q); anwenden(deptSel, q) }
  function toggleDept(dep: string) {
    const next = new Set(deptSel); next.has(dep) ? next.delete(dep) : next.add(dep)
    setDeptSel(next); anwenden(next, nameSubmitted)
  }
  // Ganze Person an-/abwählen (alle ihre Geräte).
  function togglePerson(p: Person) {
    const hosts = p.devices.map(d => d.hostname)
    const allSel = hosts.every(h => selected.has(h))
    setSelected(prev => { const n = new Set(prev); for (const h of hosts) allSel ? n.delete(h) : n.add(h); return n })
  }

  // ── Scan ────────────────────────────────────────────────────────────────────
  const [cmsl, setCmsl] = useState<{ ok: boolean; version: string; error?: string } | null>(null)
  const [cmslBusy, setCmslBusy] = useState(false)
  // HP CMSL EINMALIG systemweit (AllUsers) installieren → danach kann JEDER Nutzer scannen.
  async function setupCmsl() {
    if (cmslBusy) return
    setCmslBusy(true); setError('')
    try {
      const c = await installCmslAllUsers()
      setCmsl(c)
      setError(c.ok ? '' : 'HP CMSL konnte nicht systemweit installiert werden: ' + (c.error || ''))
    } finally { setCmslBusy(false) }
  }
  const [scanning, setScanning] = useState(false)
  const [scanProg, setScanProg] = useState<{ done: number; total: number; host: string } | null>(null)
  const [reports, setReports] = useState<HpHostReport[]>([])
  const [error, setError] = useState('')

  // Auswahl der zu installierenden Treiber-Items + bestätigte BIOS-Items.
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [biosOk, setBiosOk] = useState<Set<string>>(new Set())
  // Firmware wird nur EINMAL pro Vorgang bestätigt (danach kein erneuter Dialog); BIOS bleibt pro Stück.
  const [firmwareAckd, setFirmwareAckd] = useState(false)
  const [biosDialog, setBiosDialog] = useState<{ host: string; item: DriverItem } | null>(null)
  const [rebootMode, setRebootMode] = useState<'notify' | 'reboot'>('notify')
  const [activateHost, setActivateHost] = useState<string | null>(null)   // WinRM-Aktivierung (wie Remote Doc)
  // Je PC: nicht-anwendbare Treiber trotzdem anhakbar machen (Sonderfälle).
  const [forceHosts, setForceHosts] = useState<Set<string>>(new Set())
  const isForced = (host: string) => forceHosts.has(host.toLowerCase())
  const toggleForce = (host: string) => setForceHosts(prev => { const n = new Set(prev); const k = host.toLowerCase(); n.has(k) ? n.delete(k) : n.add(k); return n })
  const [pdfBusy, setPdfBusy] = useState(false)
  // „aktuelle" Treiber nach dem Scan standardmäßig ausblenden → der (Re-)Scan zeigt nur Offenes.
  const [showAktuell, setShowAktuell] = useState(false)
  // Sichtbare Treiber eines Hosts (aktuelle nur, wenn eingeblendet).
  const sichtbareItems = (r: HpHostReport) => showAktuell ? r.items : r.items.filter(it => it.status !== 'aktuell')

  const activeHosts = useHpDeployStore(s => s.activeHosts)
  const queuedHosts = useHpDeployStore(s => s.queuedHosts)
  const phaseByHost = useHpDeployStore(s => s.phaseByHost)
  const deployResults = useHpDeployStore(s => s.results)
  const startDeploy = useHpDeployStore(s => s.run)
  const cancelDeploy = useHpDeployStore(s => s.cancel)
  const clearDeployResults = useHpDeployStore(s => s.clearResults)
  const busy = activeHosts.length + queuedHosts.length > 0
  const hostBusy = (host: string) => activeHosts.includes(host.toLowerCase()) ? 'läuft' : queuedHosts.includes(host.toLowerCase()) ? 'wartet' : null

  async function scan(refreshCatalog = false) {
    if (scanning || hostsToScan.length === 0) return
    setScanning(true); setError(''); setReports([]); clearDeployResults(); setShowAktuell(false); setScanProg({ done: 0, total: hostsToScan.length, host: '' })
    try {
      const c = await ensureCmsl(true)
      setCmsl(c)
      if (!c.ok) { setError('HP CMSL am Admin-PC nicht verfügbar: ' + (c.error || '') + ' — Katalog kann nicht online abgefragt werden.'); return }
      const rep = await scanHosts(hostsToScan, (done, total, host) => setScanProg({ done, total, host }), refreshCatalog)
      setReports(rep)
      // Vorauswahl: nur ANWENDBARE, sicher gematchte, veraltete, unkritische Treiber.
      const init = new Set<string>()
      for (const r of rep) for (const it of r.items) {
        if (it.anwendbar && !it.ohneHardwareBezug && !it.matchUnsicher && it.status === 'veraltet' && it.klasse === 'normal') {
          init.add(keyOf(r.hostname, it.softpaqId))
        }
      }
      setChecked(init); setBiosOk(new Set()); setFirmwareAckd(false); setForceHosts(new Set())
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
        for (const it of rep.items) if (it.anwendbar && !it.ohneHardwareBezug && !it.matchUnsicher && it.status === 'veraltet' && it.klasse === 'normal') n.add(keyOf(rep.hostname, it.softpaqId))
        return n
      })
    } catch { /* ignore */ }
  }

  function toggleItem(host: string, item: DriverItem) {
    const k = keyOf(host, item.softpaqId)
    // Nicht-anwendbare nur anhaken, wenn „erzwingen" aktiv ist.
    if (!istAnwendbar(item) && !isForced(host) && !checked.has(k)) return
    // BIOS: pro Stück bestätigen. Firmware: nur EINMAL pro Vorgang bestätigen (danach direkt anhaken).
    if (item.klasse === 'bios' && !biosOk.has(k) && !checked.has(k)) { setBiosDialog({ host, item }); return }
    if (item.klasse === 'firmware' && !firmwareAckd && !checked.has(k)) { setBiosDialog({ host, item }); return }
    setChecked(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  }
  function confirmBios() {
    if (!biosDialog) return
    const k = keyOf(biosDialog.host, biosDialog.item.softpaqId)
    // Firmware einmalig für den ganzen Vorgang freigeben; BIOS nur diesen einen Eintrag.
    if (biosDialog.item.klasse === 'firmware') setFirmwareAckd(true)
    else setBiosOk(prev => new Set(prev).add(k))
    setChecked(prev => new Set(prev).add(k))
    setBiosDialog(null)
  }
  // Alle SICHTBAREN anwendbaren Treiber eines PCs auswählen — BIOS und Firmware bleiben
  // Opt-in (Firmware ist remote unzuverlässig/nachrangig). Sind „aktuelle" eingeblendet,
  // werden sie mit angehakt (Reinstall unschädlich); ausgeblendet zählen sie nicht.
  // Nicht-anwendbare bleiben aus, außer „erzwingen" ist für diesen PC aktiv.
  function selectAllHost(r: HpHostReport) {
    const forced = isForced(r.hostname)
    setChecked(prev => {
      const n = new Set(prev)
      for (const it of sichtbareItems(r)) {
        if (it.klasse === 'bios' || it.klasse === 'firmware') continue
        if (!istAnwendbar(it) && !forced) continue
        n.add(keyOf(r.hostname, it.softpaqId))
      }
      return n
    })
  }
  function selectNoneHost(r: HpHostReport) {
    setChecked(prev => { const n = new Set(prev); for (const it of r.items) n.delete(keyOf(r.hostname, it.softpaqId)); return n })
  }

  const selectedCount = checked.size
  function install() {
    if (selectedCount === 0) return
    // Bereits laufende/wartende PCs überspringt der Store selbst — man kann also weitere
    // PCs starten, während andere noch installieren.
    const plan = reports.map(r => ({
      host: r.hostname,
      items: r.items.filter(it => checked.has(keyOf(r.hostname, it.softpaqId))),
    })).filter(p => p.items.length)
    if (!plan.length) return
    void startDeploy(plan, { rebootMode, by })
  }

  // Abschluss-Übersicht (nach Installation + Nachprüfung).
  const resultList = Object.values(deployResults)
  const gesamtErgebnisse = resultList.reduce((n, r) => n + (r.ergebnisse?.length || 0), 0)
  const gesamtBestaetigt = resultList.reduce((n, r) => n + (r.ergebnisse?.filter(e => e.verifiziert).length || 0), 0)
  async function exportPdf() {
    if (pdfBusy || !resultList.length) return
    setPdfBusy(true)
    try {
      const r = await exportHpDriverReport(resultList, by)
      if (!r.ok) setError('PDF-Export fehlgeschlagen: ' + (r.error || ''))
    } finally { setPdfBusy(false) }
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
          <button onClick={install} disabled={selectedCount === 0} title="Gewählte Treiber auf den Ziel-PCs installieren (weitere PCs können auch während laufender Installation gestartet werden)" className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-40">
            {busy ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}Installieren ({selectedCount})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* 1 · PC-Auswahl */}
        <div className="bg-card rounded-lg border border-border p-4 space-y-3 max-w-3xl">
          <div className="flex items-center gap-2"><Server size={15} className="text-primary" /><h3 className="text-sm font-bold text-foreground">1 · PCs auswählen</h3></div>
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            <button onClick={() => setMode('endpoint')} className={`px-3 py-1.5 ${mode === 'endpoint' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>Aus Endgeräte-Übersicht</button>
            <button onClick={() => setMode('name')} className={`px-3 py-1.5 border-l border-border ${mode === 'name' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>Nach Person / Abteilung</button>
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
                    <span className="font-mono text-foreground"><span className="inline-flex items-center gap-1">{d.hostname}{d.hostname && <DeviceInfoButton hostname={d.hostname} serial={d.serial} />}</span></span>
                    <span className="text-muted-foreground truncate">· {d.assignedTo || 'nicht zugewiesen'}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{classifyModel(d.model) || '—'}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : mode === 'name' ? (
            <div className="space-y-2">
              {/* 1) Personensuche (zuerst) */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[220px] max-w-md">
                  <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={nameQuery} onChange={e => setNameQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sucheName() }}
                    placeholder="Person suchen (z. B. Nachname)"
                    className="w-full pl-7 pr-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                </div>
                <button onClick={sucheName} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"><Search size={12} />Suchen</button>
                {personenAktiv && (
                  <button onClick={() => pruefeOnline(alleTreffHosts)} disabled={onlineChecking || alleTreffHosts.length === 0}
                    title="Online-Status erneut prüfen" className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
                    {onlineChecking ? <Loader size={11} className="animate-spin" /> : <Wifi size={11} />}Status aktualisieren
                  </button>
                )}
              </div>

              {/* 2) Abteilungs-Übersicht — standardmäßig zugeklappt */}
              <div className="rounded-md border border-border">
                <button onClick={() => setDeptOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted/20">
                  <Building2 size={13} className="text-muted-foreground" />
                  <span className="font-medium">Abteilungs-Übersicht</span>
                  {deptSel.size > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">{deptSel.size} gewählt</span>}
                  <ChevronDown size={14} className={`ml-auto text-muted-foreground transition-transform ${deptOpen ? 'rotate-180' : ''}`} />
                </button>
                {deptOpen && (
                  <div className="border-t border-border p-2 space-y-2">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {adLoading ? <span className="flex items-center gap-1"><Loader size={11} className="animate-spin" />AD-Verzeichnis wird geladen …</span> : <span>{adInfo || 'AD-Verzeichnis (für Abteilungen)'}</span>}
                      {!adLoading && <button onClick={() => void ladeAd(true)} className="underline hover:text-foreground">frisch aus AD laden</button>}
                    </div>
                    <div className="relative max-w-xs">
                      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input value={deptSearch} onChange={e => setDeptSearch(e.target.value)} placeholder="Abteilung suchen"
                        className="w-full pl-7 pr-3 py-1 text-[12px] rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                    </div>
                    {(() => {
                      const gefiltert = departments.filter(d => d.toLowerCase().includes(deptSearch.trim().toLowerCase()))
                      return (
                        <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1.5">
                          {departments.length === 0 && !adLoading && <span className="text-[11px] text-muted-foreground">Keine Abteilungen ermittelbar (AD-Verzeichnis leer oder Namen passen nicht). Namenssuche funktioniert trotzdem.</span>}
                          {departments.length > 0 && gefiltert.length === 0 && <span className="text-[11px] text-muted-foreground">Keine Abteilung passt zu „{deptSearch}".</span>}
                          {gefiltert.map(dep => (
                            <button key={dep} onClick={() => toggleDept(dep)} className={`text-[11px] px-2 py-0.5 rounded-full border ${deptSel.has(dep) ? 'bg-primary/15 text-primary border-primary/30' : 'text-muted-foreground border-border hover:text-foreground'}`}>{dep}</button>
                          ))}
                        </div>
                      )
                    })()}
                    {deptSel.size > 0 && <button onClick={() => { setDeptSel(new Set()); anwenden(new Set(), nameSubmitted) }} className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground">Abteilungen zurücksetzen</button>}
                  </div>
                )}
              </div>

              {personenAktiv ? (
                <>
                  <div className="flex items-center gap-2 text-[11px] flex-wrap">
                    <button onClick={() => setSelected(new Set(alleTreffHosts))} className="px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">Alle</button>
                    <button onClick={() => setSelected(new Set())} className="px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">Keine</button>
                    <span className="text-muted-foreground ml-1">{personen.length} Person(en) · {nameModeHosts.length} von {alleTreffHosts.length} Geräten ausgewählt{deptSel.size ? ` · ${deptSel.size} Abteilung(en)` : ''}{nameSubmitted ? ` · Suche „${nameSubmitted}"` : ''}</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border/60">
                    {personen.length === 0 && <div className="p-3 text-[12px] text-muted-foreground">Keine Personen/Geräte für diese Auswahl gefunden.</div>}
                    {personen.map(p => {
                      const hosts = p.devices.map(d => d.hostname)
                      const selCount = hosts.filter(h => selected.has(h)).length
                      const allSel = hosts.length > 0 && selCount === hosts.length
                      return (
                        <div key={p.name} className="px-2 py-1.5">
                          <label className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                            <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = selCount > 0 && !allSel }} onChange={() => togglePerson(p)} className="accent-primary" />
                            <User size={12} className="text-muted-foreground shrink-0" />
                            <span className="font-medium text-foreground">{p.name}</span>
                            {p.department && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">{p.department}</span>}
                            <span className="ml-auto text-[10px] text-muted-foreground">{p.devices.length} Gerät{p.devices.length === 1 ? '' : 'e'}{selCount > 0 && !allSel ? ` · ${selCount} gewählt` : ''}</span>
                          </label>
                          <div className="ml-6 mt-0.5 space-y-0.5">
                            {p.devices.map(d => {
                              const on = onlineMap.get(d.hostname.toLowerCase())
                              return (
                                <label key={d.id} className="flex items-center gap-2 text-[11.5px] hover:bg-muted/20 rounded px-1 py-0.5 cursor-pointer">
                                  <input type="checkbox" checked={selected.has(d.hostname)} onChange={() => toggle(d.hostname)} className="accent-primary" />
                                  <Server size={11} className="text-muted-foreground shrink-0" />
                                  <span className="font-mono text-foreground"><span className="inline-flex items-center gap-1">{d.hostname}{d.hostname && <DeviceInfoButton hostname={d.hostname} serial={d.serial} />}</span></span>
                                  <span className="text-[10px] text-muted-foreground">{classifyModel(d.model) || '—'}</span>
                                  {onlineChecking && on === undefined
                                    ? <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1 shrink-0"><Loader size={10} className="animate-spin" />prüfe …</span>
                                    : on === true ? <span className="ml-auto text-[10px] text-emerald-400 flex items-center gap-1 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />online</span>
                                      : on === false ? <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />offline</span>
                                        : <span className="ml-auto text-[10px] text-muted-foreground/50 shrink-0">Status?</span>}
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">{departments.length === 0 && !adLoading ? 'Keine Abteilungen ermittelbar (AD-Verzeichnis leer oder Namen der Zuweisungen passen nicht). Namenssuche funktioniert trotzdem.' : 'Person suchen — oder oben „Abteilungs-Übersicht" öffnen und eine Abteilung wählen.'}</p>
              )}
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
            <button onClick={() => scan(false)} disabled={scanning || hostsToScan.length === 0} className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              {scanning ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}Treiber scannen ({hostsToScan.length})
            </button>
            <button onClick={() => scan(true)} disabled={scanning || hostsToScan.length === 0}
              title={'HP-Katalog für die gewählten Modelle sofort frisch von HP laden (statt aus dem zwischengespeicherten Stand). Normalerweise reicht „Treiber scannen" — der Katalog wird automatisch aufgefrischt, wenn er älter als 14 Tage ist.'}
              className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
              <RefreshCw size={13} />HP-Katalog frisch laden
            </button>
            {cmsl && (cmsl.ok
              ? <span className="text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle size={12} />HPCMSL {cmsl.version}</span>
              : <>
                  <span className="text-[11px] text-red-400 flex items-center gap-1"><XCircle size={12} />HPCMSL fehlt</span>
                  <button onClick={setupCmsl} disabled={cmslBusy} title="HP CMSL EINMALIG systemweit (für alle Windows-Nutzer dieses Admin-PCs) installieren. Erfordert einmalig Adminrechte (UAC-Abfrage). Danach kann jeder scannen — ohne eigene Installation."
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-40">
                    {cmslBusy ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}{cmslBusy ? 'installiere…' : 'HP CMSL systemweit installieren (Admin)'}
                  </button>
                </>)}
          </div>
          {cmsl && !cmsl.ok && !cmslBusy && (
            <p className="text-[11px] text-muted-foreground">HP CMSL ist auf diesem Admin-PC nur pro Benutzerprofil oder gar nicht installiert. Ein Admin installiert es einmal <span className="font-semibold text-foreground">systemweit</span> (Button oben, UAC) — danach kann <span className="font-semibold text-foreground">jeder</span> Nutzer Treiber scannen/installieren, ohne selbst etwas einzurichten.</p>
          )}
          {scanProg && <div className="space-y-1"><div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{ width: `${scanProg.total ? (scanProg.done / scanProg.total) * 100 : 0}%` }} /></div><p className="text-[11px] text-muted-foreground">{scanProg.done}/{scanProg.total} · {scanProg.host}</p></div>}
          {error && <p className="text-xs text-red-400 flex items-center gap-1"><XCircle size={12} />{error}</p>}
        </div>

        {/* 2 · Fortschritt Installation (mehrere PCs parallel möglich) */}
        {busy && (
          <div className="max-w-3xl bg-card border border-border rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Loader size={12} className="animate-spin text-blue-400" />
                Installation läuft — {activeHosts.length} aktiv{queuedHosts.length > 0 ? `, ${queuedHosts.length} in Warteschlange` : ''}
              </p>
              <button onClick={() => cancelDeploy()} title="Installation abbrechen — Warteschlange leeren und laufende Installer stoppen (der aktuell laufende Treiber wird noch beendet)"
                className="ml-auto flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20">
                <XCircle size={12} />Abbrechen
              </button>
            </div>
            {activeHosts.map(h => (
              <p key={h} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span className="font-mono uppercase">{h}</span> · {phaseByHost[h] || '…'}
              </p>
            ))}
            {queuedHosts.map(h => (
              <p key={h} className="text-[11px] text-muted-foreground/70 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                <span className="font-mono uppercase">{h}</span> · wartet auf freien Slot
              </p>
            ))}
            <p className="text-[11px] text-muted-foreground pt-0.5">läuft im Hintergrund — Menüpunkt kann gewechselt werden. Weitere PCs können jederzeit gestartet werden.</p>
          </div>
        )}

        {/* 2b · Abschluss-Übersicht: welche Treiber wurden (bestätigt) installiert */}
        {resultList.length > 0 && (
          <div className="max-w-4xl bg-card border border-emerald-500/30 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <ClipboardCheck size={15} className="text-emerald-500" />
              <h3 className="text-sm font-bold text-foreground">Übersicht: installierte Treiber</h3>
              <span className="text-[11px] text-muted-foreground">{gesamtBestaetigt}/{gesamtErgebnisse} erfolgreich installiert · {resultList.length} PC(s) · Notiz im PC-Dossier hinterlegt</span>
              <button onClick={exportPdf} disabled={pdfBusy} title="Diese Übersicht als PDF speichern" className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-40">
                {pdfBusy ? <Loader size={12} className="animate-spin" /> : <FileDown size={12} />}Als PDF
              </button>
            </div>
            {resultList.map(res => (
              <div key={res.host} className="rounded-md border border-border/60 p-2 space-y-1">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-mono font-semibold text-foreground">{res.host}</span>
                  <span className={res.status === 'installiert' ? 'text-emerald-400' : res.status === 'teilweise' ? 'text-amber-400' : 'text-red-400'}>{res.message}</span>
                  {res.needsReboot && <span className="text-[11px] text-amber-400 flex items-center gap-1"><AlertTriangle size={11} />Neustart nötig</span>}
                  {!res.verifyMoeglich && <span className="text-[11px] text-amber-400">Nachprüfung nicht möglich</span>}
                </div>
                {res.ergebnisse.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead><tr className="text-[10px] uppercase text-muted-foreground border-b border-border">
                        <th className="text-left py-1 pr-2">Treiber / Gerät</th><th className="text-left px-2">Treiberversion vorher</th><th className="text-left px-2">nachher</th><th className="text-left px-2">Ergebnis</th>
                      </tr></thead>
                      <tbody>
                        {res.ergebnisse.map(e => {
                          const geaendert = e.nachher && e.vorher && e.nachher !== e.vorher
                          return (
                            <tr key={e.softpaqId} className="border-b border-border/30">
                              <td className="py-1 pr-2 text-foreground">{e.name}</td>
                              <td className="px-2 font-mono text-muted-foreground">{e.vorher || '—'}</td>
                              <td className={`px-2 font-mono ${geaendert ? 'text-emerald-400' : 'text-foreground'}`}>{e.nachher || '—'}</td>
                              <td className={`px-2 ${e.verifiziert ? 'text-emerald-400' : 'text-red-400'}`}>{e.verifiziert ? '✓ ' : '✗ '}{e.info}{e.versuche > 1 ? ` (${e.versuche} Versuche)` : ''}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 3 · Ergebnis je PC */}
        {reports.map(r => {
          const updates = r.items.filter(i => i.anwendbar && !i.ohneHardwareBezug && i.status === 'veraltet').length
          const nichtAnwendbar = r.items.filter(i => !istAnwendbar(i)).length
          const forced = isForced(r.hostname)
          const res = deployResults[r.hostname.toLowerCase()]
          const sichtbar = sichtbareItems(r)
          const aktuellVersteckt = r.items.filter(i => i.status === 'aktuell').length
          return (
            <div key={r.hostname} className="bg-card rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <Cpu size={14} className="text-primary" />
                <span className="text-sm font-semibold text-foreground font-mono"><span className="inline-flex items-center gap-1">{r.hostname}{r.hostname && <DeviceInfoButton hostname={r.hostname} />}</span></span>
                {r.model && <span className="text-[11px] text-muted-foreground">{r.model} · SysID {r.sysId || '—'} · {r.osVer}</span>}
                {r.biosVersion && <span className="text-[10px] text-muted-foreground">BIOS {r.biosVersion}</span>}
                {r.catalogAt && <span className={`text-[10px] ${r.catalogStale ? 'text-amber-400' : 'text-muted-foreground'}`} title={r.catalogStale ? 'HP war nicht erreichbar — es wird ein zwischengespeicherter (evtl. veralteter) Katalog verwendet. „HP-Katalog frisch laden" wiederholen, wenn HP wieder erreichbar ist.' : 'Abrufdatum des HP-Treiberkatalogs für dieses Modell (wird ab 14 Tagen automatisch aufgefrischt).'}>HP-Katalog: {katalogAlter(r.catalogAt)}{r.catalogStale ? ' · veraltet' : ''}</span>}
                {r.loggedOnUser && <span className="text-[10px] text-amber-400/80">angemeldet: {r.loggedOnUser}</span>}
                {!r.online && <span className="text-[11px] text-red-400 flex items-center gap-1"><XCircle size={11} />nicht erreichbar</span>}
                {!r.online && <button onClick={() => setActivateHost(r.hostname)} title="WinRM auf diesem PC aktivieren (genau wie in Remote Doc)" className="text-[11px] flex items-center gap-1 px-2 py-0.5 rounded border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"><Wifi size={11} />WinRM aktivieren</button>}
                {r.error && <span className="text-[11px] text-amber-400 flex items-center gap-1"><AlertTriangle size={11} />{r.error}</span>}
                {r.online && !r.error && <span className={`ml-auto text-[11px] ${updates ? 'text-amber-400' : 'text-emerald-400'}`}>{updates} Update{updates === 1 ? '' : 's'} · {nichtAnwendbar} nicht anwendbar · {r.items.length} gesamt</span>}
                {hostBusy(r.hostname) === 'läuft' && <span className="text-[11px] text-blue-300 flex items-center gap-1"><Loader size={11} className="animate-spin" />{phaseByHost[r.hostname.toLowerCase()] || 'installiert …'}</span>}
                {hostBusy(r.hostname) === 'wartet' && <span className="text-[11px] text-muted-foreground">in Warteschlange …</span>}
                {res && <span className={`text-[11px] ${res.status === 'installiert' ? 'text-emerald-400' : res.status === 'teilweise' ? 'text-amber-400' : 'text-red-400'}`}>{res.message}</span>}
              </div>

              {r.hardwareInventarFehlt && r.online && !r.error && (
                <p className="text-[11px] text-amber-400 flex items-center gap-1.5 bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1">
                  <AlertTriangle size={12} />Hardware-Inventar (PnP) nicht lesbar — Treiber sind <span className="font-semibold">ungefiltert</span> (alte Heuristik). Anwendbarkeit konnte nicht geprüft werden.
                </p>
              )}

              {r.online && !r.error && r.items.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <button onClick={() => selectAllHost(r)} title="Alle sichtbaren, anwendbaren Treiber anhaken. BIOS und Firmware bleiben außen vor (Opt-in). Sind aktuelle eingeblendet, werden sie mit angehakt (Reinstall unschädlich)." className="px-2 py-1 rounded border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20">Alle auswählen (außer BIOS &amp; Firmware)</button>
                    <button onClick={() => selectNoneHost(r)} className="px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">Keine</button>
                    {aktuellVersteckt > 0 && (
                      <button onClick={() => setShowAktuell(v => !v)} title={showAktuell ? 'Bereits aktuelle Treiber wieder ausblenden' : 'Bereits aktuelle Treiber einblenden (standardmäßig ausgeblendet, damit nur Offenes zu sehen ist)'}
                        className={`px-2 py-1 rounded border ${showAktuell ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                        {showAktuell ? `${aktuellVersteckt} aktuelle ausblenden` : `${aktuellVersteckt} bereits aktuell — einblenden`}
                      </button>
                    )}
                    {nichtAnwendbar > 0 && (
                      <button onClick={() => toggleForce(r.hostname)} title="Nicht-anwendbare Treiber trotzdem anhakbar machen (Sonderfälle)"
                        className={`px-2 py-1 rounded border ${forced ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                        {forced ? 'Erzwingen: an' : `Nicht-anwendbare erzwingen (${nichtAnwendbar})`}
                      </button>
                    )}
                    <span className="text-muted-foreground/70">{r.items.filter(it => checked.has(keyOf(r.hostname, it.softpaqId))).length} gewählt</span>
                    <span className="ml-auto flex flex-wrap items-center gap-2.5 text-[10px] text-muted-foreground/70">
                      <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />veraltet = älter als HP-Stand</span>
                      <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" />verfügbar</span>
                      <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />aktuell</span>
                      <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/50" />nicht anwendbar = andere Hardware</span>
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-[10px] uppercase text-muted-foreground border-b border-border">
                      <th className="w-7"></th><th className="text-left py-1.5 pr-2">Treiber / Gerät</th><th className="text-left px-2">Kategorie</th>
                      <th className="text-left px-2">Installiert</th><th className="text-left px-2">Neueste</th><th className="text-left px-2">Status</th>
                    </tr></thead>
                    <tbody>
                      {sichtbar.length === 0 && (
                        <tr><td colSpan={6} className="py-3 text-center text-[11px] text-emerald-400">Alle anwendbaren Treiber sind aktuell — nichts offen. {aktuellVersteckt > 0 && <button onClick={() => setShowAktuell(true)} className="underline hover:text-emerald-300">alle anzeigen</button>}</td></tr>
                      )}
                      {sichtbar.map(it => {
                        const k = keyOf(r.hostname, it.softpaqId)
                        const isChecked = checked.has(k)
                        const st = statusBadge(it)
                        const anwendbar = istAnwendbar(it)
                        const gesperrt = !anwendbar && !forced
                        return (
                          <tr key={it.softpaqId} className={`border-b border-border/40 ${KLASSE_ROW[it.klasse]} ${!anwendbar ? 'opacity-45' : ''}`}>
                            <td className="py-1.5 pl-1">
                              <input type="checkbox" checked={isChecked} disabled={gesperrt} onChange={() => toggleItem(r.hostname, it)}
                                title={gesperrt ? 'Nicht anwendbar für dieses Gerät — über „…erzwingen" freischalten' : undefined}
                                className={`${gesperrt ? 'opacity-40 cursor-not-allowed' : ''} ${it.klasse === 'kritisch' ? 'accent-amber-500' : it.klasse === 'bios' ? 'accent-red-500' : 'accent-primary'}`} />
                            </td>
                            <td className="py-1.5 pr-2 text-foreground">
                              <span className="flex items-center gap-1.5">
                                {it.name}
                                {it.klasse === 'kritisch' && <span title="Kritisch: betrifft die aktuell laufende Sitzung des Anwenders (Bild/Ton/Netz kann kurz aussetzen)."><Info size={11} className="text-amber-400" /></span>}
                                {it.klasse === 'firmware' && <span title="Firmware/EFI: Opt-in (wie BIOS). Wird interaktiv in der Sitzung des angemeldeten Benutzers installiert und flasht beim Neustart — jemand muss am Ziel angemeldet sein."><Info size={11} className="text-amber-400" /></span>}
                                {it.klasse === 'bios' && <span title="BIOS: nur nach Bestätigung – Unterbrechung kann den PC unbrauchbar machen."><ShieldAlert size={11} className="text-red-400" /></span>}
                                {it.matchUnsicher && <span title={it.matchGrund} className="text-[9px] px-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 cursor-help">unsicher</span>}
                              </span>
                            </td>
                            <td className="px-2 text-muted-foreground">{it.category}</td>
                            <td className="px-2 text-muted-foreground font-mono">{it.installedVersion || '—'}</td>
                            <td className="px-2 text-foreground font-mono">{it.latestVersion}</td>
                            <td className="px-2">
                              <span title={it.matchGrund || undefined} className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] ${st.badge} ${it.matchGrund ? 'cursor-help' : ''}`}>{st.label}</span>
                              {it.ohneHardwareBezug && it.klasse !== 'bios' && it.klasse !== 'firmware' && <span className="ml-1 text-[9px] text-muted-foreground/60" title={it.matchGrund}>ohne HW-Bezug</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
              {r.online && !r.error && r.items.length === 0 &&<p className="text-[11px] text-muted-foreground">Keine Treiber im HP-Katalog für dieses Modell/OS gefunden.</p>}
            </div>
          )
        })}
      </div>

      {/* BIOS-Bestätigungsdialog */}
      {biosDialog && (biosDialog.item.klasse === 'firmware' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setBiosDialog(null)}>
          <div className="bg-card border border-amber-500/40 rounded-lg p-5 max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-amber-300 flex items-center gap-2"><ShieldAlert size={16} />Firmware anhaken – bewusst?</p>
            <p className="text-xs text-foreground leading-relaxed">
              Firmware/EFI wird <span className="font-semibold">interaktiv in der Sitzung des angemeldeten Benutzers</span>
              installiert (nicht still) und flasht meist erst beim <span className="font-semibold">Neustart</span>.
              Voraussetzung: am Ziel-PC muss jemand <span className="font-semibold">angemeldet</span> sein; beim Anwender
              kann kurz ein Fenster erscheinen. Häufig ist die Firmware auch bereits aktuell. Standardmäßig ausgeklammert
              (wie BIOS) — nur anhaken, wenn du das gezielt willst. <span className="font-semibold">Diese Bestätigung gilt
              für alle Firmware in diesem Vorgang</span> — weitere Firmware kannst du danach ohne erneute Nachfrage anhaken
              (BIOS bleibt einzeln zu bestätigen).
            </p>
            <p className="text-[11px] text-muted-foreground font-mono">{biosDialog.item.name} → {biosDialog.item.latestVersion}</p>
            <div className="flex items-center gap-2 justify-end pt-1">
              <button onClick={() => setBiosDialog(null)} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground">Abbrechen</button>
              <button onClick={confirmBios} className="px-3 py-1.5 text-xs rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20">Firmware freigeben & anhaken</button>
            </div>
          </div>
        </div>
      ) : (
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
      ))}

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
