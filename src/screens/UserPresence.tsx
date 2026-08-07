import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MonitorSmartphone, Search, Loader, RefreshCw, Send, Terminal, Zap, X,
  CheckCircle, XCircle, Monitor, Wifi, WifiOff, UserSearch, AlertTriangle,
  ListChecks, Network, Play, Square, History, Filter, ListFilter, Building2,
  Globe, Trash2, MapPin, Plus, FileDown, Layers, CheckSquare, Crown,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useAuthStore } from '../store/authStore'
import { fetchAdUsers, type AdUserListItem } from '../services/adUsersList'
import type { SessionHit } from '../services/userPresence'
import {
  getSiteSubnets, expandSubnets, pingBatch, scanIpsBatch, buildScanRows, saveProtocol,
  listProtocols, loadProtocol, deleteProtocol, makeProtocolId, resolveHostsToIps,
  dnsCheckBatch, listDnsProtocols, loadDnsProtocol, saveDnsProtocol, deleteDnsProtocol, makeDnsProtocolId,
  winrmDnsCheckBatch, listWinrmProtocols, loadWinrmProtocol, saveWinrmProtocol, deleteWinrmProtocol, makeWinrmProtocolId,
  PING_BATCH_SIZE, IP_PROBE_BATCH_SIZE_SINGLE, DNS_BATCH_SIZE, WINRM_DNS_BATCH_SIZE,
  type ScanRow, type ScanProtocol, type ScanProtocolMeta, type ComputerRecord, type SiteSubnets,
  type DnsRow, type DnsProtocol, type DnsProtocolMeta, type DnsStatus,
  type WinrmDnsRow, type WinrmDnsProtocol, type WinrmDnsProtocolMeta, type WinrmDnsStatus,
} from '../services/userPresenceScan'
import { exportPresenceScan, exportPresenceDns, exportPresenceWinrm, type ExportFormat } from '../services/userPresenceExport'
import { DaylisModal, ColumnFilter, type UserRow } from './UserOverview'
import { PersonInfoButton } from '../components/person/PersonDossier'
import { loadDevices as loadEndpointDevices, classifyModel } from '../services/endpointDevices'
import { api } from '../electronAPI'
import type { InventoryItem } from '../types/auth'

const CACHE_KEY = 'userOverview.cache.v1'
const ONLINE_CACHE_MS = 5 * 60 * 1000
const INVENTORY_FILE = 'inventory/inventory.json'
// Ping-Sweep: so viele 256er-Batches laufen gleichzeitig (ICMP ist billig,
// der Gewinn kommt v. a. durch das Einsparen serieller PowerShell-Starts)
const PING_PARALLEL = 4

interface CacheData { users: AdUserListItem[]; loadedAt: string }
function loadCache(): CacheData | null {
  try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null; const d = JSON.parse(raw) as CacheData; return Array.isArray(d.users) && d.users.length ? d : null } catch { return null }
}
function fmtDateTime(iso: string): string { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }

type Mode = 'single' | 'mass' | 'dns' | 'winrm'
type Phase = '' | 'detect' | 'quick' | 'ping' | 'probe' | 'activate' | 'dns'

// Mehrfach-Fremdnutzung: Person nutzte ein NICHT zugewiesenes Geraet mehrfach.
interface FlaggedUse {
  sam: string; displayName: string; department?: string; enabled: boolean
  hostname: string; count: number; assignedTo: string; lastIp: string
  deviceType?: string  // Model-Typ aus der Endgeraete-Uebersicht
}

// Zuweisungs-Kategorie einer Scan-Zeile (fuer Filter + Spalte)
function assignFilterLabel(r: ScanRow): string {
  if (!r.loggedIn) return '—'
  return r.assignmentStatus === 'ok' ? 'Richtig zugewiesen'
    : r.assignmentStatus === 'mismatch' ? 'Falsch zugewiesen'
    : 'Nicht im Inventar'
}

const DNS_LABEL: Record<DnsStatus, string> = { OK: 'OK', MISMATCH: 'Falsche IP', NO_PTR: 'PTR fehlt', NO_A: 'Hostname unauflösbar' }
const WINRM_LABEL: Record<WinrmDnsStatus, string> = { OK: 'OK', MISMATCH: 'PTR-Mismatch', NO_A: 'Kein A-Record', NO_PTR: 'Kein PTR' }

export default function UserPresence() {
  const setDevices = useAppStore(s => s.setDevices)
  const setScreen = useAppStore(s => s.setScreen)
  const authUser = useAuthStore(s => s.session?.user)
  const currentUser = authUser?.displayName || authUser?.username || 'unbekannt'

  const [mode, setMode] = useState<Mode>('single')
  const [users, setUsers] = useState<AdUserListItem[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  // Inventar (Geraet -> zugewiesener Benutzer) fuer den Fast-Path der Einzel-Suche
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  // Endgeraete-Uebersicht: Model-Typ je Geraet — einmal exakt per PC-Name, einmal
  // per Seriennummer (Hostnamen = Praefix + Serie, daher Suffix-Match noetig).
  const [deviceTypeByHost, setDeviceTypeByHost] = useState<Map<string, string>>(new Map())
  const [deviceSerials, setDeviceSerials] = useState<Array<[string, string]>>([])

  // Standort / Subnetze (gemeinsam fuer beide Modi)
  const [siteInfo, setSiteInfo] = useState<SiteSubnets | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [manualSubnets, setManualSubnets] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [manualInput, setManualInput] = useState('')
  const onlineCache = useRef<{ ips: string[]; at: number } | null>(null)

  // Einzel-Suche
  const [query, setQuery] = useState('')
  const [pickedUser, setPickedUser] = useState<AdUserListItem | null>(null)
  const [sScanning, setSScanning] = useState(false)
  const [sPhase, setSPhase] = useState<Phase>('')
  const [sProgress, setSProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [sHits, setSHits] = useState<SessionHit[]>([])
  const [sError, setSError] = useState('')
  const sCancel = useRef(false)
  const [daylisRows, setDaylisRows] = useState<{ rows: UserRow[]; chosen: Map<string, string> } | null>(null)

  // Massen-Scan
  const [massRows, setMassRows] = useState<ScanRow[]>([])
  const [massRunning, setMassRunning] = useState(false)
  const [massPhase, setMassPhase] = useState<Phase>('')
  const [massProgress, setMassProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [massError, setMassError] = useState('')
  const [loadedProtocol, setLoadedProtocol] = useState<ScanProtocolMeta | null>(null)
  const [protocols, setProtocols] = useState<ScanProtocolMeta[]>([])
  const massCancel = useRef(false)
  const [mSearch, setMSearch] = useState('')
  const [fStatus, setFStatus] = useState<Set<string>>(new Set())
  const [fLogin, setFLogin] = useState<Set<string>>(new Set())
  const [fDns, setFDns] = useState<Set<string>>(new Set())
  const [fDept, setFDept] = useState<Set<string>>(new Set())
  const [fAssign, setFAssign] = useState<Set<string>>(new Set())

  // DNS-Check
  const [dnsRows, setDnsRows] = useState<DnsRow[]>([])
  const [dnsRunning, setDnsRunning] = useState(false)
  const [dnsPhase, setDnsPhase] = useState<Phase>('')
  const [dnsProgress, setDnsProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [dnsError, setDnsError] = useState('')
  const [loadedDnsProtocol, setLoadedDnsProtocol] = useState<DnsProtocolMeta | null>(null)
  const [dnsProtocols, setDnsProtocols] = useState<DnsProtocolMeta[]>([])
  const dnsCancel = useRef(false)
  const [dnsSearch, setDnsSearch] = useState('')
  const [fDnsStatus, setFDnsStatus] = useState<Set<string>>(new Set())
  const [dnsMergedFrom, setDnsMergedFrom] = useState(0)  // >0 = zusammengeführte Fehlerliste

  // WinRM/DNS-Fehler (Forward/Reverse-Mismatch je Hostname aus dem Inventar)
  const [winrmRows, setWinrmRows] = useState<WinrmDnsRow[]>([])
  const [winrmRunning, setWinrmRunning] = useState(false)
  const [winrmProgress, setWinrmProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [winrmError, setWinrmError] = useState('')
  const [loadedWinrmProtocol, setLoadedWinrmProtocol] = useState<WinrmDnsProtocolMeta | null>(null)
  const [winrmProtocols, setWinrmProtocols] = useState<WinrmDnsProtocolMeta[]>([])
  const winrmCancel = useRef(false)
  const [winrmSearch, setWinrmSearch] = useState('')
  const [fWinrmStatus, setFWinrmStatus] = useState<Set<string>>(new Set())
  const [winrmOnlyProblems, setWinrmOnlyProblems] = useState(true)
  const [winrmMergedFrom, setWinrmMergedFrom] = useState(0)

  useEffect(() => {
    const cached = loadCache(); if (cached) setUsers(cached.users); else void refreshUsers()
    void detectSubnets()
    void refreshProtocols()
    void refreshDnsProtocols()
    void refreshWinrmProtocols()
    void (async () => { try { const inv = await api().netReadJson<InventoryItem[]>(INVENTORY_FILE); setInventory(Array.isArray(inv) ? inv : []) } catch { setInventory([]) } })()
    // Endgeraete-Uebersicht laden -> Model-Typ je PC-Name UND je Seriennummer
    void (async () => {
      try {
        const devs = await loadEndpointDevices()
        const byHost = new Map<string, string>()
        const serials: Array<[string, string]> = []
        for (const d of devs) {
          const cat = classifyModel(d.model)
          if (!cat) continue
          const host = (d.hostname || '').split('.')[0].trim().toUpperCase()
          if (host) byHost.set(host, cat)
          const ser = (d.serial || '').trim().toUpperCase()
          if (ser.length >= 5) serials.push([ser, cat])
        }
        setDeviceTypeByHost(byHost)
        setDeviceSerials(serials)
      } catch { /* Endgeraete-Uebersicht evtl. noch leer */ }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setDaylisRows(null) } window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [])

  async function refreshUsers() {
    setLoadingUsers(true)
    const res = await fetchAdUsers()
    if (res.ok) { setUsers(res.users); try { localStorage.setItem(CACHE_KEY, JSON.stringify({ users: res.users, loadedAt: new Date().toISOString() })) } catch {} }
    setLoadingUsers(false)
  }
  async function refreshProtocols() { setProtocols(await listProtocols()) }
  async function refreshDnsProtocols() { setDnsProtocols(await listDnsProtocols()) }

  // ── DNS-Check ──
  async function runDnsCheck() {
    setDnsRunning(true); setDnsError(''); setLoadedDnsProtocol(null); setDnsMergedFrom(0); dnsCancel.current = false
    setDnsPhase('ping'); setDnsProgress({ done: 0, total: 0 })
    const sweep = await sweepOnline((done, total) => setDnsProgress({ done, total }), dnsCancel, true)
    if (sweep.error) { setDnsError(sweep.error); setDnsRunning(false); setDnsPhase(''); return }
    const online = sweep.ips
    setDnsPhase('dns'); setDnsProgress({ done: 0, total: online.length })
    const rows: DnsRow[] = []
    for (let i = 0; i < online.length; i += DNS_BATCH_SIZE) {
      if (dnsCancel.current) break
      rows.push(...await dnsCheckBatch(online.slice(i, i + DNS_BATCH_SIZE)))
      setDnsProgress({ done: Math.min(i + DNS_BATCH_SIZE, online.length), total: online.length })
      setDnsRows([...rows])
    }
    setDnsRows([...rows])
    const problems = rows.filter(r => r.status !== 'OK').length
    const protocol: DnsProtocol = { id: makeDnsProtocolId(), createdAt: new Date().toISOString(), by: currentUser, total: rows.length, problems, rows }
    if (!dnsCancel.current) { await saveDnsProtocol(protocol).catch(() => {}); setLoadedDnsProtocol(protocol); await refreshDnsProtocols() }
    setDnsRunning(false); setDnsPhase('')
  }
  async function openDnsProtocol(id: string) { const p = await loadDnsProtocol(id); if (!p) return; setDnsRows(p.rows); setLoadedDnsProtocol(p); setDnsMergedFrom(0) }
  async function removeDnsProtocol(id: string) { await deleteDnsProtocol(id); if (loadedDnsProtocol?.id === id) { setLoadedDnsProtocol(null); setDnsRows([]) } await refreshDnsProtocols() }

  // Mehrere DNS-Protokolle zu einer deduplizierten Fehlerliste zusammenführen.
  // Pro IP zählt der jüngste Scan; aufgenommen wird nur, wenn dieser zuletzt ein
  // DNS-Problem zeigte (bereits behobene Eintraege fallen so raus).
  async function mergeDnsProtocols(ids: string[]) {
    const metasDesc = dnsProtocols.filter(m => ids.includes(m.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const latestByIp = new Map<string, DnsRow>()
    for (const m of metasDesc) {
      const p = await loadDnsProtocol(m.id)
      if (!p) continue
      for (const r of p.rows) { if (!latestByIp.has(r.ip)) latestByIp.set(r.ip, r) }
    }
    const merged = [...latestByIp.values()].filter(r => r.status !== 'OK')
      .sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }))
    setDnsRows(merged)
    setLoadedDnsProtocol(null)
    setDnsMergedFrom(ids.length)
    setMode('dns')
  }

  const dnsDistinct = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of dnsRows) { const l = DNS_LABEL[r.status]; m.set(l, (m.get(l) ?? 0) + 1) }
    return m
  }, [dnsRows])
  const filteredDns = useMemo(() => {
    const q = dnsSearch.trim().toLowerCase()
    return dnsRows.filter(r => {
      if (q && !(r.ip.toLowerCase().includes(q) || r.host.toLowerCase().includes(q) || r.fwdIp.toLowerCase().includes(q))) return false
      if (fDnsStatus.size && !fDnsStatus.has(DNS_LABEL[r.status])) return false
      return true
    })
  }, [dnsRows, dnsSearch, fDnsStatus])

  // ── WinRM/DNS-Fehler ──
  async function refreshWinrmProtocols() { setWinrmProtocols(await listWinrmProtocols()) }

  async function runWinrmCheck() {
    setWinrmRunning(true); setWinrmError(''); setLoadedWinrmProtocol(null); setWinrmMergedFrom(0); winrmCancel.current = false
    setWinrmProgress({ done: 0, total: 0 })
    // Hostnamen aus dem Inventar (Standort-Uebersicht)
    const names = [...new Set(inventory.map(i => (i.name || '').split('.')[0].trim()).filter(Boolean))]
    if (names.length === 0) {
      setWinrmError('Keine Geräte im Inventar (Standort-Übersicht) gefunden. Bitte dort zuerst die Geräteliste importieren.')
      setWinrmRunning(false); return
    }
    setWinrmProgress({ done: 0, total: names.length })
    const rows: WinrmDnsRow[] = []
    for (let i = 0; i < names.length; i += WINRM_DNS_BATCH_SIZE) {
      if (winrmCancel.current) break
      rows.push(...await winrmDnsCheckBatch(names.slice(i, i + WINRM_DNS_BATCH_SIZE)))
      setWinrmProgress({ done: Math.min(i + WINRM_DNS_BATCH_SIZE, names.length), total: names.length })
      setWinrmRows([...rows])
    }
    setWinrmRows([...rows])
    const problems = rows.filter(r => r.status !== 'OK').length
    const protocol: WinrmDnsProtocol = { id: makeWinrmProtocolId(), createdAt: new Date().toISOString(), by: currentUser, total: rows.length, problems, rows }
    if (!winrmCancel.current) { await saveWinrmProtocol(protocol).catch(() => {}); setLoadedWinrmProtocol(protocol); await refreshWinrmProtocols() }
    setWinrmRunning(false)
  }
  async function openWinrmProtocol(id: string) { const p = await loadWinrmProtocol(id); if (!p) return; setWinrmRows(p.rows); setLoadedWinrmProtocol(p); setWinrmMergedFrom(0) }
  async function removeWinrmProtocol(id: string) { await deleteWinrmProtocol(id); if (loadedWinrmProtocol?.id === id) { setLoadedWinrmProtocol(null); setWinrmRows([]) } await refreshWinrmProtocols() }
  function exportWinrm(format: ExportFormat) {
    const merged = winrmMergedFrom > 0
    // Standardmaessig nur die fehlerhaften Eintraege exportieren (fuer die Abteilung)
    const rowsToExport = winrmRows.filter(r => r.status !== 'OK')
    void exportPresenceWinrm(rowsToExport.length ? rowsToExport : winrmRows, {
      createdAt: merged ? new Date().toISOString() : (loadedWinrmProtocol?.createdAt ?? new Date().toISOString()),
      by: loadedWinrmProtocol?.by ?? currentUser,
      mergedFrom: merged ? winrmMergedFrom : undefined,
    }, format)
  }

  // Mehrere WinRM/DNS-Berichte zu einer deduplizierten Fehlerliste zusammenführen
  // (je Hostname der jüngste Scan; nur Einträge, die zuletzt fehlerhaft waren).
  async function mergeWinrmProtocols(ids: string[]) {
    const metasDesc = winrmProtocols.filter(m => ids.includes(m.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const latestByHost = new Map<string, WinrmDnsRow>()
    for (const m of metasDesc) {
      const p = await loadWinrmProtocol(m.id)
      if (!p) continue
      for (const r of p.rows) { const key = r.hostname.toUpperCase(); if (!latestByHost.has(key)) latestByHost.set(key, r) }
    }
    const merged = [...latestByHost.values()].filter(r => r.status !== 'OK').sort((a, b) => a.hostname.localeCompare(b.hostname, undefined, { numeric: true }))
    setWinrmRows(merged); setLoadedWinrmProtocol(null); setWinrmMergedFrom(ids.length); setWinrmOnlyProblems(false); setMode('winrm')
  }

  const winrmDistinct = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of winrmRows) { const l = WINRM_LABEL[r.status]; m.set(l, (m.get(l) ?? 0) + 1) }
    return m
  }, [winrmRows])
  const filteredWinrm = useMemo(() => {
    const q = winrmSearch.trim().toLowerCase()
    return winrmRows.filter(r => {
      if (winrmOnlyProblems && r.status === 'OK') return false
      if (q && !(r.hostname.toLowerCase().includes(q) || r.ip.toLowerCase().includes(q) || r.ptr.toLowerCase().includes(q))) return false
      if (fWinrmStatus.size && !fWinrmStatus.has(WINRM_LABEL[r.status])) return false
      return true
    })
  }, [winrmRows, winrmSearch, fWinrmStatus, winrmOnlyProblems])

  async function detectSubnets() {
    setDetecting(true)
    const info = await getSiteSubnets()
    setSiteInfo(info)
    if (info.ok && info.subnets.length) setSelected(new Set(info.subnets))
    onlineCache.current = null
    setDetecting(false)
  }

  const allSubnets = useMemo(() => {
    const s = new Set<string>([...(siteInfo?.subnets ?? []), ...manualSubnets])
    return [...s]
  }, [siteInfo, manualSubnets])
  const effectiveCidrs = useMemo(() => allSubnets.filter(c => selected.has(c)), [allSubnets, selected])
  const ipCount = useMemo(() => expandSubnets(effectiveCidrs).ips.length, [effectiveCidrs])

  function toggleSubnet(c: string) { setSelected(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n }); onlineCache.current = null }
  function addManualSubnet() {
    const c = manualInput.trim()
    if (!/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(c)) return
    if (!manualSubnets.includes(c)) setManualSubnets(prev => [...prev, c])
    setSelected(prev => new Set(prev).add(c))
    setManualInput(''); onlineCache.current = null
  }

  // ── Ping-Sweep (DNS-unabhaengig) -> online IPs (mit Cache) ──
  async function sweepOnline(onPing: (done: number, total: number) => void, cancel: { current: boolean }, force: boolean): Promise<{ ips: string[]; error?: string }> {
    if (effectiveCidrs.length === 0) return { ips: [], error: 'Keine Subnetze gewählt. Bitte Standort erkennen oder Subnetz manuell hinzufügen.' }
    if (!force && onlineCache.current && (Date.now() - onlineCache.current.at) < ONLINE_CACHE_MS) return { ips: onlineCache.current.ips }
    const { ips } = expandSubnets(effectiveCidrs)
    if (ips.length === 0) return { ips: [], error: 'Die gewählten Subnetze ergeben keine IP-Adressen — bitte Subnetze prüfen (neu erkennen / manuell eintragen).' }
    const online: string[] = []
    const batchErrors: string[] = []
    // PING_PARALLEL Batches gleichzeitig — spart die seriellen PowerShell-Starts
    // (Sweep ~4x schneller); ICMP-Last bleibt fuer das Netz vernachlaessigbar.
    const stride = PING_BATCH_SIZE * PING_PARALLEL
    for (let i = 0; i < ips.length; i += stride) {
      if (cancel.current) break
      const chunks: string[][] = []
      for (let j = 0; j < PING_PARALLEL; j++) {
        const part = ips.slice(i + j * PING_BATCH_SIZE, i + (j + 1) * PING_BATCH_SIZE)
        if (part.length > 0) chunks.push(part)
      }
      const results = await Promise.all(chunks.map(c => pingBatch(c)))
      for (const res of results) {
        online.push(...res.up)
        if (res.error) batchErrors.push(res.error)
      }
      onPing(Math.min(i + stride, ips.length), ips.length)
    }
    // 0 Treffer bei tausenden IPs ist praktisch immer ein Fehler (VPN/Netz/
    // PowerShell) — nicht als "alles offline" durchwinken, sondern melden.
    if (!cancel.current && online.length === 0) {
      const detail = batchErrors[0] ? ` (${batchErrors[0]})` : ''
      return { ips: [], error: `Ping-Sweep fand 0 erreichbare IPs von ${ips.length} geprüften${detail}. Bitte Netzwerk/VPN prüfen und erneut versuchen.` }
    }
    onlineCache.current = { ips: online, at: Date.now() }
    return { ips: online }
  }

  // ── Navigation (via IP) ──
  function goQuery(ip: string, host: string) { const h = (ip || host).trim(); if (!h) return; setDevices([{ id: 'pres-0', type: 'hostname', value: h, resolvedHostnames: [h] }]); setScreen('query-menu') }
  function goRemoteDoc(ip: string, host: string) { const h = (ip || host).trim(); if (!h) return; setDevices([{ id: 'pres-0', type: 'hostname', value: h, resolvedHostnames: [h] }]); setScreen('remote-doc') }
  function goDaylis(ip: string, host: string, u: { sam: string; displayName: string; enabled: boolean }) {
    const h = (ip || host).trim(); if (!h) return
    setDaylisRows({ rows: [{ sam: u.sam, displayName: u.displayName, enabled: u.enabled, hostnames: [h] }], chosen: new Map([[u.sam.toUpperCase(), h]]) })
  }

  // ── Einzel-Suche ──
  const matches = useMemo<AdUserListItem[]>(() => {
    const q = query.trim().toLowerCase(); if (!q) return []
    const tokens = q.split(/\s+/).filter(Boolean)
    return users.filter(u => { const dn = u.displayName.toLowerCase(); const sam = u.sam.toLowerCase(); if (sam.includes(q)) return true; return tokens.every(t => dn.includes(t) || sam.includes(t)) })
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.displayName.localeCompare(b.displayName, 'de')).slice(0, 60)
  }, [users, query])

  // Bekannte Geraete des Users aus dem Inventar (gleiche Zuordnung wie in der
  // Benutzer-Uebersicht: assignedTo == Corp-ID/Anzeigename oder corpId == sam)
  function knownHostsFor(u: AdUserListItem): string[] {
    const samKey = u.sam.toUpperCase()
    const dnKey = (u.displayName ?? '').trim().toUpperCase()
    const hosts: string[] = []
    for (const i of inventory) {
      const assigned = (i.assignedTo ?? '').trim().toUpperCase()
      const corp = (i.corpId ?? '').trim().toUpperCase()
      if ((assigned && (assigned === samKey || (dnKey && assigned === dnKey))) || (corp && corp === samKey)) {
        if (i.name && !hosts.includes(i.name)) hosts.push(i.name)
      }
    }
    return hosts
  }

  async function selectUser(u: AdUserListItem) {
    setPickedUser(u); setSHits([]); setSError(''); setSScanning(true); sCancel.current = false
    const samKey = u.sam.toLowerCase()
    const hits: SessionHit[] = []

    // ── Fast-Path: bekannte Geraete des Users zuerst direkt proben ──────────
    // Findet den User in Sekunden, wenn er an "seinem" Geraet sitzt. Nur bei
    // Nichttreffer folgt der volle Subnetz-Scan.
    const known = knownHostsFor(u)
    if (known.length > 0) {
      setSPhase('quick'); setSProgress({ done: 0, total: known.length })
      const ips = await resolveHostsToIps(known)
      if (!sCancel.current && ips.length > 0) {
        const alive = await pingBatch(ips)
        if (!sCancel.current && alive.up.length > 0) {
          const recs = await scanIpsBatch(alive.up)
          for (const r of recs) {
            if (r.status === 'OK' && r.sam && r.sam.toLowerCase() === samKey && !hits.some(h => h.ip === r.ip)) {
              hits.push({ hostname: r.hostname, state: 'Aktiv', ip: r.ip, dnsIp: r.dnsIp, dnsProblem: r.dnsProblem })
            }
          }
        }
      }
      if (hits.length > 0) { setSHits([...hits]); setSScanning(false); setSPhase(''); return }
    }
    if (sCancel.current) { setSScanning(false); setSPhase(''); return }

    // ── Voller Scan (Fallback) ───────────────────────────────────────────────
    setSPhase('ping'); setSProgress({ done: 0, total: 0 })
    const sweep = await sweepOnline((done, total) => setSProgress({ done, total }), sCancel, false)
    if (sweep.error) { setSError(sweep.error); setSScanning(false); setSPhase(''); return }
    const online = sweep.ips
    setSPhase('probe'); setSProgress({ done: 0, total: online.length })
    // Ausnahme Einzel-Suche: 50 Geraete parallel (statt 10) — bricht ab, sobald
    // der gesuchte Benutzer gefunden wurde.
    for (let i = 0; i < online.length; i += IP_PROBE_BATCH_SIZE_SINGLE) {
      if (sCancel.current) break
      const recs = await scanIpsBatch(online.slice(i, i + IP_PROBE_BATCH_SIZE_SINGLE))
      for (const r of recs) {
        if (r.status === 'OK' && r.sam && r.sam.toLowerCase() === samKey && !hits.some(h => h.ip === r.ip)) {
          hits.push({ hostname: r.hostname, state: 'Aktiv', ip: r.ip, dnsIp: r.dnsIp, dnsProblem: r.dnsProblem })
        }
      }
      setSHits([...hits])
      setSProgress({ done: Math.min(i + IP_PROBE_BATCH_SIZE_SINGLE, online.length), total: online.length })
      if (hits.length > 0) break  // gefunden -> fertig
    }
    setSScanning(false); setSPhase('')
  }

  // Inventar-Zuordnung (Standort-Uebersicht): kurzer Hostname (UPPERCASE) -> Item
  const invByHost = useMemo(() => {
    const m = new Map<string, InventoryItem>()
    for (const it of inventory) {
      const key = (it.name || '').split('.')[0].trim().toUpperCase()
      if (key) m.set(key, it)
    }
    return m
  }, [inventory])

  // Vorgesetzten-Index (aus dem Inventar / Standort-Uebersicht, gleiche Quelle wie
  // die Abteilungs-Uebersicht): CorpID bzw. Anzeigename einer Person -> ihr
  // Abteilungsleiter (manager/managerSam).
  const managerLookup = useMemo(() => {
    const bySam = new Map<string, { sam: string; name: string }>()
    const byName = new Map<string, { sam: string; name: string }>()
    for (const it of inventory) {
      const mgrName = (it.manager || '').trim()
      const mgrSam = (it.managerSam || '').trim()
      if (!mgrName && !mgrSam) continue
      const entry = { sam: mgrSam, name: mgrName }
      const corp = (it.corpId || '').trim().toUpperCase()
      const assigned = (it.assignedTo || '').trim().toUpperCase()
      if (corp && !bySam.has(corp)) bySam.set(corp, entry)
      if (assigned && !byName.has(assigned)) byName.set(assigned, entry)
    }
    return { bySam, byName }
  }, [inventory])

  // Gleicht den angemeldeten Benutzer gegen die im Inventar hinterlegte Zuweisung
  // ab. mismatch -> assignedTo enthaelt, wem das Geraet eigentlich gehoert.
  // Model-Typ zu einem Hostnamen finden: erst exakt per PC-Name, sonst per
  // Seriennummer als Suffix (Hostname = Praefix wie DEHAM/DESCH/DE + Serie).
  function deviceTypeForHost(shortHostUpper: string): string | undefined {
    const exact = deviceTypeByHost.get(shortHostUpper)
    if (exact) return exact
    let best: string | undefined, bestLen = 0
    for (const [serial, type] of deviceSerials) {
      if (serial.length > bestLen && shortHostUpper.endsWith(serial)) { best = type; bestLen = serial.length }
    }
    return best
  }

  function enrichAssignment(rows: ScanRow[]): ScanRow[] {
    return rows.map(r => {
      if (!r.loggedIn || !r.hostname) return r
      const shortHost = r.hostname.split('.')[0].trim().toUpperCase()
      const deviceType = deviceTypeForHost(shortHost)
      const inv = invByHost.get(shortHost)
      if (!inv) return { ...r, assignmentStatus: 'unknown' as const, deviceType }
      const expected = (inv.corpId || '').trim()
      const assignedName = (inv.assignedTo || '').trim() || expected
      if (!expected) return { ...r, assignmentStatus: 'unknown' as const, assignedTo: assignedName || undefined, deviceType }
      if (expected.toUpperCase() === r.sam.toUpperCase()) return { ...r, assignmentStatus: 'ok' as const, assignedTo: assignedName, deviceType }
      // Falsch zugewiesen. Ohne DNS-Problem zusaetzlich pruefen, ob das Geraet
      // wenigstens dem Abteilungsleiter der angemeldeten Person gehoert.
      let leaderMatch: 'yes' | 'no' | 'unknown' | undefined
      if (!r.dnsProblem) {
        const mgr = managerLookup.bySam.get(r.sam.toUpperCase()) || managerLookup.byName.get((r.displayName || '').trim().toUpperCase())
        if (!mgr || (!mgr.sam && !mgr.name)) leaderMatch = 'unknown'
        else {
          const mgrSamUp = mgr.sam.toUpperCase(), mgrNameUp = mgr.name.toUpperCase()
          const expUp = expected.toUpperCase(), assignedUp = assignedName.toUpperCase()
          leaderMatch = ((mgrSamUp && mgrSamUp === expUp) || (mgrNameUp && mgrNameUp === assignedUp)) ? 'yes' : 'no'
        }
      }
      return { ...r, assignmentStatus: 'mismatch' as const, assignedTo: assignedName, deviceType, leaderMatch }
    })
  }

  // ── Massen-Scan: Zusammenführung -> Mehrfach-Fremdnutzung ──────────────────
  const [massAgg, setMassAgg] = useState<FlaggedUse[] | null>(null)   // null = keine Auswertung offen
  const [massMergedFrom, setMassMergedFrom] = useState(0)
  const [flagThreshold, setFlagThreshold] = useState(3)               // "mehr als N mal"

  async function mergeMassProtocols(ids: string[]) {
    const acc = new Map<string, FlaggedUse>()
    for (const id of ids) {
      const p = await loadProtocol(id)
      if (!p) continue
      for (const r of p.rows) {
        if (!r.loggedIn || !r.hostname || !r.sam) continue
        const shortHost = r.hostname.split('.')[0].trim().toUpperCase()
        const inv = invByHost.get(shortHost)
        const expected = (inv?.corpId || '').trim()
        if (!expected) continue                                   // keine Zuweisung -> nicht bewertbar
        if (expected.toUpperCase() === r.sam.toUpperCase()) continue  // korrekt zugewiesen
        const key = r.sam.toUpperCase() + '|' + shortHost
        const cur = acc.get(key)
        if (cur) { cur.count++; if (r.ip) cur.lastIp = r.ip }
        else acc.set(key, { sam: r.sam, displayName: r.displayName, department: r.department, enabled: r.enabled, hostname: r.hostname, count: 1, assignedTo: (inv?.assignedTo || expected), lastIp: r.ip, deviceType: deviceTypeForHost(shortHost) })
      }
    }
    const list = [...acc.values()].sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName, 'de'))
    setMassAgg(list)
    setMassMergedFrom(ids.length)
  }
  const flaggedUsers = useMemo(() => (massAgg ?? []).filter(f => f.count > flagThreshold), [massAgg, flagThreshold])

  // ── Massen-Scan ──
  async function runMassScan() {
    setMassRunning(true); setMassError(''); setLoadedProtocol(null); massCancel.current = false
    let userList = users
    if (userList.length === 0) { const r = await fetchAdUsers(); if (r.ok) { userList = r.users; setUsers(r.users) } }
    setMassPhase('ping'); setMassProgress({ done: 0, total: 0 })
    const sweep = await sweepOnline((done, total) => setMassProgress({ done, total }), massCancel, true)
    if (sweep.error) { setMassError(sweep.error); setMassRunning(false); setMassPhase(''); return }
    const online = sweep.ips
    setMassPhase('probe'); setMassProgress({ done: 0, total: online.length })
    setMassRows(buildScanRows([], userList))
    const records: ComputerRecord[] = []

    // Pass 1 — Schnell-Pass: 50 parallel, OHNE WinRM-Aktivierung. Liefert die
    // grosse Mehrheit (WinRM laeuft schon) schnell; Geraete ohne laufendes
    // WinRM kommen als OFFLINE zurueck und werden in Pass 2 nachgezogen.
    const needsActivation: string[] = []
    for (let i = 0; i < online.length; i += IP_PROBE_BATCH_SIZE_SINGLE) {
      if (massCancel.current) break
      const recs = await scanIpsBatch(online.slice(i, i + IP_PROBE_BATCH_SIZE_SINGLE), false)
      for (const r of recs) {
        if (r.status === 'OFFLINE') needsActivation.push(r.ip)
        else records.push(r)
      }
      setMassProgress({ done: Math.min(i + IP_PROBE_BATCH_SIZE_SINGLE, online.length), total: online.length })
      setMassRows(enrichAssignment(buildScanRows(records, userList)))
    }

    // Pass 2 — WinRM aktivieren und die restlichen Geraete nachziehen.
    if (!massCancel.current && needsActivation.length > 0) {
      setMassPhase('activate'); setMassProgress({ done: 0, total: needsActivation.length })
      for (let i = 0; i < needsActivation.length; i += IP_PROBE_BATCH_SIZE_SINGLE) {
        if (massCancel.current) break
        const recs = await scanIpsBatch(needsActivation.slice(i, i + IP_PROBE_BATCH_SIZE_SINGLE), true)
        records.push(...recs)
        setMassProgress({ done: Math.min(i + IP_PROBE_BATCH_SIZE_SINGLE, needsActivation.length), total: needsActivation.length })
        setMassRows(enrichAssignment(buildScanRows(records, userList)))
      }
    }
    const rows = enrichAssignment(buildScanRows(records, userList))
    setMassRows(rows)
    const withSession = rows.filter(r => r.loggedIn).length
    const dnsProblems = rows.filter(r => r.loggedIn && r.dnsProblem).length
    const protocol: ScanProtocol = { id: makeProtocolId(), createdAt: new Date().toISOString(), by: currentUser, totalUsers: rows.length, withSession, dnsProblems, computersScanned: online.length, rows }
    if (!massCancel.current) { await saveProtocol(protocol).catch(() => {}); setLoadedProtocol(protocol); await refreshProtocols() }
    setMassRunning(false); setMassPhase('')
  }
  async function openProtocol(id: string) { const p = await loadProtocol(id); if (!p) return; setMassRows(p.rows); setLoadedProtocol(p) }
  async function removeProtocol(id: string) { await deleteProtocol(id); if (loadedProtocol?.id === id) { setLoadedProtocol(null); setMassRows([]) } await refreshProtocols() }
  function exportMass(format: ExportFormat) {
    void exportPresenceScan(massRows, { createdAt: loadedProtocol?.createdAt ?? new Date().toISOString(), by: loadedProtocol?.by ?? currentUser }, format)
  }
  function exportDns(format: ExportFormat) {
    const merged = dnsMergedFrom > 0
    void exportPresenceDns(dnsRows, {
      createdAt: merged ? new Date().toISOString() : (loadedDnsProtocol?.createdAt ?? new Date().toISOString()),
      by: loadedDnsProtocol?.by ?? currentUser,
      mergedFrom: merged ? dnsMergedFrom : undefined,
    }, format)
  }

  const distinct = useMemo(() => {
    const status = new Map<string, number>(), login = new Map<string, number>(), dns = new Map<string, number>(), dept = new Map<string, number>(), assign = new Map<string, number>()
    for (const r of massRows) {
      const st = r.enabled ? 'Aktiv' : 'Inaktiv'; status.set(st, (status.get(st) ?? 0) + 1)
      const lg = r.loggedIn ? 'Angemeldet' : 'Nicht angemeldet'; login.set(lg, (login.get(lg) ?? 0) + 1)
      const dn = r.loggedIn ? (r.dnsProblem ? 'DNS-Problem' : 'DNS OK') : '—'; dns.set(dn, (dns.get(dn) ?? 0) + 1)
      const dp = (r.department ?? '').trim(); dept.set(dp, (dept.get(dp) ?? 0) + 1)
      const asn = assignFilterLabel(r); assign.set(asn, (assign.get(asn) ?? 0) + 1)
    }
    return { status, login, dns, dept, assign }
  }, [massRows])
  const filteredMass = useMemo(() => {
    const q = mSearch.trim().toLowerCase()
    return massRows.filter(r => {
      if (q) { const hit = r.displayName.toLowerCase().includes(q) || r.sam.toLowerCase().includes(q) || r.ip.toLowerCase().includes(q) || r.hostname.toLowerCase().includes(q); if (!hit) return false }
      if (fStatus.size && !fStatus.has(r.enabled ? 'Aktiv' : 'Inaktiv')) return false
      if (fLogin.size && !fLogin.has(r.loggedIn ? 'Angemeldet' : 'Nicht angemeldet')) return false
      if (fDns.size) { const dn = r.loggedIn ? (r.dnsProblem ? 'DNS-Problem' : 'DNS OK') : '—'; if (!fDns.has(dn)) return false }
      if (fDept.size && !fDept.has((r.department ?? '').trim())) return false
      if (fAssign.size && !fAssign.has(assignFilterLabel(r))) return false
      return true
    })
  }, [massRows, mSearch, fStatus, fLogin, fDns, fDept, fAssign])
  const anyFilter = fStatus.size + fLogin.size + fDns.size + fDept.size + fAssign.size > 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <MonitorSmartphone size={22} className="text-blue-400" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-foreground">Wo angemeldet?</h2>
          <p className="text-xs text-muted-foreground">Findet per IP (DNS-unabhängig), an welchem Gerät ein Benutzer gerade angemeldet ist.</p>
        </div>
        <div className="flex rounded-md border border-border overflow-hidden">
          <button onClick={() => setMode('single')} className={`px-3 py-1.5 text-xs flex items-center gap-1.5 ${mode === 'single' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}><UserSearch size={13} />Einzelne Suche</button>
          <button onClick={() => setMode('mass')} className={`px-3 py-1.5 text-xs flex items-center gap-1.5 ${mode === 'mass' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}><ListChecks size={13} />Massen-Scan</button>
          <button onClick={() => setMode('dns')} className={`px-3 py-1.5 text-xs flex items-center gap-1.5 ${mode === 'dns' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}><Globe size={13} />DNS-Check</button>
          <button onClick={() => setMode('winrm')} className={`px-3 py-1.5 text-xs flex items-center gap-1.5 ${mode === 'winrm' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}><AlertTriangle size={13} />WinRM/DNS-Fehler</button>
        </div>
      </div>

      {/* Standort / Subnetze */}
      <div className="shrink-0 px-6 py-2 border-b border-border bg-muted/5 flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1"><MapPin size={11} />Standort</span>
        {detecting ? (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader size={11} className="animate-spin" />erkenne …</span>
        ) : (
          <>
            <span className="text-xs text-foreground font-medium">{siteInfo?.ok && siteInfo.site ? siteInfo.site : 'unbekannt'}</span>
            {allSubnets.length === 0 && <span className="text-[11px] text-amber-300">keine Subnetze erkannt — bitte manuell ergänzen</span>}
            {allSubnets.map(c => {
              const on = selected.has(c)
              return <button key={c} onClick={() => toggleSubnet(c)} className={`text-[11px] font-mono px-2 py-0.5 rounded-md border ${on ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'border-border text-muted-foreground hover:text-foreground'}`}>{c}</button>
            })}
            <span className="text-[11px] text-muted-foreground">· {ipCount} IPs</span>
            <input value={manualInput} onChange={e => setManualInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addManualSubnet() }} placeholder="z.B. 10.20.30.0/24"
              className="ml-1 w-36 px-2 py-1 text-[11px] font-mono rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            <button onClick={addManualSubnet} className="p-1 rounded border border-border text-muted-foreground hover:text-foreground" title="Subnetz hinzufügen"><Plus size={12} /></button>
            <button onClick={detectSubnets} className="ml-auto text-[11px] text-blue-400 hover:underline flex items-center gap-1"><RefreshCw size={10} />neu erkennen</button>
          </>
        )}
      </div>

      {mode === 'single' ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-96 shrink-0 border-r border-border flex flex-col">
            <div className="shrink-0 p-4 border-b border-border">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Vor-/Nachname oder Corp ID…"
                  className="w-full pl-8 pr-8 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                {query && <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent text-muted-foreground"><X size={12} /></button>}
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-[11px] text-muted-foreground">{loadingUsers ? 'lädt …' : query.trim() ? `${matches.length} Treffer` : `${users.length} Benutzer`}</p>
                <button onClick={refreshUsers} disabled={loadingUsers} className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"><RefreshCw size={10} className={loadingUsers ? 'animate-spin' : ''} />neu laden</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {matches.map(u => (
                <button key={u.sam} onClick={() => selectUser(u)} disabled={sScanning}
                  className={`w-full text-left px-4 py-2.5 border-b border-border/40 hover:bg-accent/10 flex items-center gap-3 disabled:opacity-50 ${pickedUser?.sam === u.sam ? 'bg-primary/10' : ''}`}>
                  {u.enabled ? <CheckCircle size={14} className="text-emerald-400 shrink-0" /> : <XCircle size={14} className="text-red-400 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{u.displayName}</p>
                    <p className="text-[11px] text-muted-foreground truncate"><span className="font-mono">{u.sam}</span>{u.department && <> · {u.department}</>}</p>
                  </div>
                </button>
              ))}
              {query.trim() && matches.length === 0 && !loadingUsers && <p className="text-xs text-muted-foreground text-center py-8">Kein Benutzer gefunden.</p>}
              {!query.trim() && <div className="text-center text-muted-foreground/70 py-12 px-6"><UserSearch size={32} className="mx-auto mb-3 opacity-30" /><p className="text-xs">Tippe einen Namen oder eine Corp ID ein.</p></div>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {!pickedUser ? (
              <div className="h-full flex items-center justify-center text-center text-muted-foreground"><div><MonitorSmartphone size={40} className="mx-auto mb-3 opacity-20" /><p className="text-sm">Wähle links einen Benutzer aus.</p></div></div>
            ) : (
              <div className="max-w-3xl space-y-5">
                <div className="flex items-center gap-3">
                  {pickedUser.enabled
                    ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-black border border-emerald-600"><CheckCircle size={9} />Aktiv</span>
                    : <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30"><XCircle size={9} />Inaktiv</span>}
                  <div>
                    <h3 className="text-base font-bold text-foreground">{pickedUser.displayName}</h3>
                    <p className="text-xs text-muted-foreground"><span className="font-mono">{pickedUser.sam}</span>{pickedUser.department && <> · {pickedUser.department}</>}</p>
                  </div>
                  {sScanning
                    ? <button onClick={() => { sCancel.current = true }} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"><Square size={12} />Abbrechen</button>
                    : <button onClick={() => selectUser(pickedUser)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground"><RefreshCw size={12} />Erneut suchen</button>}
                </div>

                {sError && <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3"><XCircle size={16} />{sError}</div>}

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-2">
                    <Wifi size={12} />Aktuell angemeldet
                    {sScanning && <span className="font-normal normal-case text-blue-300 inline-flex items-center gap-1"><Loader size={11} className="animate-spin" />
                      {sPhase === 'quick' ? `prüfe bekannte Geräte (${sProgress.total}) …` : sPhase === 'ping' ? `Ping-Sweep … ${sProgress.done}/${sProgress.total} IPs` : `prüfe ${sProgress.done}/${sProgress.total} online-Geräte`}</span>}
                  </p>
                  {sHits.length === 0 ? (
                    sScanning ? <div className="text-sm text-muted-foreground bg-blue-500/5 border border-blue-500/20 rounded-lg px-4 py-3">Durchsuche die Standort-IPs nach einer aktiven Anmeldung …</div>
                      : <div className="text-sm text-muted-foreground bg-muted/10 border border-border rounded-lg px-4 py-4"><div className="flex items-center gap-2 text-foreground font-medium mb-1"><WifiOff size={15} className="text-amber-400" />Keine aktive Anmeldung gefunden</div><p className="text-xs">{pickedUser.displayName} ist aktuell an keinem erreichbaren Gerät im Standort angemeldet.</p></div>
                  ) : (
                    <div className="space-y-2">
                      {sHits.map(d => (
                        <div key={d.ip} className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                          <Monitor size={18} className="text-emerald-400" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-base font-mono font-bold text-foreground">{d.ip}</span>
                              <DnsBadge dnsProblem={d.dnsProblem} ip={d.ip} dnsIp={d.dnsIp} />
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300"><Wifi size={10} />aktiv angemeldet</span>
                            </div>
                            <p className="text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap"><Monitor size={10} className="text-muted-foreground" /><span className="font-mono text-muted-foreground">{d.hostname}</span>{d.dnsProblem && d.dnsIp && <span className="text-red-300">· DNS zeigt auf {d.dnsIp}</span>}</p>
                          </div>
                          <ActionButtons ip={d.ip} hostname={d.hostname} onQuery={goQuery} onRemote={goRemoteDoc} onDaylis={(ip, h) => goDaylis(ip, h, pickedUser)} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : mode === 'mass' ? (
        <MassView
          running={massRunning} phase={massPhase} progress={massProgress} error={massError} rows={filteredMass}
          totalRows={massRows.length} loadedProtocol={loadedProtocol} protocols={protocols} canStart={effectiveCidrs.length > 0}
          onRun={runMassScan} onCancel={() => { massCancel.current = true }} onOpenProtocol={openProtocol} onDeleteProtocol={removeProtocol}
          mSearch={mSearch} setMSearch={setMSearch} distinct={distinct} anyFilter={anyFilter}
          fStatus={fStatus} setFStatus={setFStatus} fLogin={fLogin} setFLogin={setFLogin} fDns={fDns} setFDns={setFDns} fDept={fDept} setFDept={setFDept}
          fAssign={fAssign} setFAssign={setFAssign}
          resetFilters={() => { setFStatus(new Set()); setFLogin(new Set()); setFDns(new Set()); setFDept(new Set()); setFAssign(new Set()) }}
          goQuery={goQuery} goRemoteDoc={goRemoteDoc} goDaylis={goDaylis}
          onExport={exportMass} canExport={massRows.length > 0 && !massRunning}
          onMerge={mergeMassProtocols}
        />
      ) : mode === 'dns' ? (
        <DnsView
          onExport={exportDns} canExport={dnsRows.length > 0 && !dnsRunning}
          running={dnsRunning} phase={dnsPhase} progress={dnsProgress} error={dnsError} rows={filteredDns} totalRows={dnsRows.length}
          loadedProtocol={loadedDnsProtocol} protocols={dnsProtocols} canStart={effectiveCidrs.length > 0}
          onRun={runDnsCheck} onCancel={() => { dnsCancel.current = true }} onOpenProtocol={openDnsProtocol} onDeleteProtocol={removeDnsProtocol}
          search={dnsSearch} setSearch={setDnsSearch} distinct={dnsDistinct} fStatus={fDnsStatus} setFStatus={setFDnsStatus}
          goQuery={goQuery} goRemoteDoc={goRemoteDoc}
          onMerge={mergeDnsProtocols} mergedFrom={dnsMergedFrom}
        />
      ) : (
        <WinrmView
          onExport={exportWinrm} canExport={winrmRows.length > 0 && !winrmRunning}
          running={winrmRunning} progress={winrmProgress} error={winrmError} rows={filteredWinrm} totalRows={winrmRows.length}
          loadedProtocol={loadedWinrmProtocol} protocols={winrmProtocols}
          onRun={runWinrmCheck} onCancel={() => { winrmCancel.current = true }} onOpenProtocol={openWinrmProtocol} onDeleteProtocol={removeWinrmProtocol}
          search={winrmSearch} setSearch={setWinrmSearch} distinct={winrmDistinct} fStatus={fWinrmStatus} setFStatus={setFWinrmStatus}
          onlyProblems={winrmOnlyProblems} setOnlyProblems={setWinrmOnlyProblems}
          goQuery={goQuery} goRemoteDoc={goRemoteDoc}
          onMerge={mergeWinrmProtocols} mergedFrom={winrmMergedFrom} deviceCount={inventory.length}
        />
      )}

      {daylisRows && <DaylisModal selectedRows={daylisRows.rows} chosenHostBySam={daylisRows.chosen} onClose={() => setDaylisRows(null)} />}

      {/* Mehrfach-Fremdnutzung (aus zusammengeführten Massen-Scans) */}
      {massAgg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => setMassAgg(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" />
                <h3 className="text-base font-semibold text-foreground">Mehrfach-Fremdnutzung</h3>
                <button onClick={() => setMassAgg(null)} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><X size={16} /></button>
              </div>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <p className="text-[11px] text-muted-foreground">Personen, die ein NICHT ihnen zugewiesenes Gerät mehrfach genutzt haben · zusammengeführt aus {massMergedFrom} Scans.</p>
                <label className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                  mehr als
                  <select value={flagThreshold} onChange={e => setFlagThreshold(Number(e.target.value))} className="px-1.5 py-1 rounded-md border border-border bg-background text-foreground focus:outline-none">
                    <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option><option value={5}>5</option>
                  </select>
                  mal
                </label>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {flaggedUsers.length === 0 ? (
                <div className="text-center py-16 text-sm text-muted-foreground">
                  <CheckCircle size={36} className="mx-auto mb-2 text-emerald-400/60" />
                  Keine Person hat ein nicht zugewiesenes Gerät mehr als {flagThreshold}× genutzt.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background border-b border-border z-10">
                    <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 font-mono w-24">Corp ID</th><th className="px-3 py-2">Person</th>
                      <th className="px-3 py-2 w-40">Genutztes Gerät</th><th className="px-3 py-2 w-20 text-center">Anzahl</th>
                      <th className="px-3 py-2">Eigentlich zugewiesen an</th><th className="px-3 py-2 w-40 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flaggedUsers.map(f => (
                      <tr key={f.sam + '|' + f.hostname} className="border-b border-border/40 hover:bg-accent/10">
                        <td className="px-3 py-2 font-mono text-foreground">{f.sam}</td>
                        <td className="px-3 py-2 text-foreground">{f.displayName}{f.department && <span className="text-muted-foreground"> · {f.department}</span>}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {f.hostname}
                          {f.deviceType && <span title="Model-Typ aus der Endgeräte-Übersicht" className="ml-1.5 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 font-sans"><MonitorSmartphone size={9} />{f.deviceType}</span>}
                        </td>
                        <td className="px-3 py-2 text-center"><span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40 font-semibold">{f.count}×</span></td>
                        <td className="px-3 py-2 text-foreground">{f.assignedTo || '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button onClick={() => goRemoteDoc(f.lastIp, f.hostname)} title="Remote Doc (Gerät)" className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground"><Terminal size={11} />Remote</button>
                            <button onClick={() => goDaylis(f.lastIp, f.hostname, { sam: f.sam, displayName: f.displayName, enabled: f.enabled })} title="Daylis (Gerät)" className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 font-semibold"><Zap size={11} />Daylis</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-5 py-2.5 border-t border-border text-[11px] text-muted-foreground">{flaggedUsers.length} markierte Person(en)/Gerät-Kombination(en)</div>
          </div>
        </div>
      )}
    </div>
  )
}

function AssignmentBadge({ status, assignedTo, deviceType, leaderMatch }: { status?: 'ok' | 'mismatch' | 'unknown'; assignedTo?: string; deviceType?: string; leaderMatch?: 'yes' | 'no' | 'unknown' }) {
  if (status === 'ok') {
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-black border border-emerald-600"><CheckCircle size={9} />richtig zugewiesen</span>
  }
  if (status === 'mismatch') {
    return (
      <span className="inline-flex items-center gap-1 flex-wrap">
        <span title={`Falsch zugewiesen — laut Inventar eigentlich: ${assignedTo || 'unbekannt'}`}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-500/40">
          <AlertTriangle size={9} />falsch → {assignedTo || 'unbekannt'}
        </span>
        {deviceType && (
          <span title="Model-Typ aus der Endgeräte-Übersicht"
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
            <MonitorSmartphone size={9} />{deviceType}
          </span>
        )}
        {leaderMatch === 'yes' && (
          <span title="Das Gerät ist dem Abteilungsleiter der angemeldeten Person zugewiesen — plausibel."
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-black border border-emerald-600">
            <Crown size={9} />Gerät des Abteilungsleiters
          </span>
        )}
        {leaderMatch === 'no' && (
          <span title="Das Gerät gehört WEDER der Person NOCH ihrem Abteilungsleiter — bitte prüfen."
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/50 font-semibold">
            <AlertTriangle size={9} />nicht vom Abteilungsleiter
          </span>
        )}
        {leaderMatch === 'unknown' && (
          <span title="Abteilungsleiter der angemeldeten Person nicht ermittelbar (keine AD-Daten im Inventar)."
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border">
            Leiter unbekannt
          </span>
        )}
      </span>
    )
  }
  return <span title="Gerät nicht im Inventar oder keine Zuweisung hinterlegt" className="text-[10px] text-muted-foreground/50">nicht im Inventar</span>
}
function DnsBadge({ dnsProblem, ip, dnsIp }: { dnsProblem: boolean; ip: string; dnsIp: string }) {
  if (dnsProblem) return <span title={`Echte IP: ${ip} · DNS liefert: ${dnsIp || 'nicht auflösbar'}`} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30"><AlertTriangle size={9} />DNS-Problem</span>
  return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-black border border-emerald-600"><CheckCircle size={9} />DNS OK</span>
}
function ActionButtons({ ip, hostname, onQuery, onRemote, onDaylis }: { ip: string; hostname: string; onQuery: (ip: string, h: string) => void; onRemote: (ip: string, h: string) => void; onDaylis: (ip: string, h: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button onClick={() => onQuery(ip, hostname)} title="Zur Abfrage (via IP)" className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground"><Send size={11} />Abfrage</button>
      <button onClick={() => onRemote(ip, hostname)} title="Remote Doc (via IP)" className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground"><Terminal size={11} />Remote Doc</button>
      <button onClick={() => onDaylis(ip, hostname)} title="Daylis (via IP)" className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 font-semibold"><Zap size={11} />Daylis</button>
    </div>
  )
}

function ExportButtons({ canExport, onExport }: { canExport: boolean; onExport: (f: ExportFormat) => void }) {
  const btn = 'flex items-center gap-1 px-2 py-1.5 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed'
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-0.5">Export</span>
      <button onClick={() => onExport('excel')} disabled={!canExport} title="Als Excel (.xlsx)" className={btn}><FileDown size={12} className="text-emerald-400" />Excel</button>
      <button onClick={() => onExport('pdf')} disabled={!canExport} title="Als PDF" className={btn}><FileDown size={12} className="text-red-400" />PDF</button>
      <button onClick={() => onExport('word')} disabled={!canExport} title="Als Word (.docx)" className={btn}><FileDown size={12} className="text-blue-400" />Word</button>
    </div>
  )
}

interface DnsViewProps {
  running: boolean; phase: Phase; progress: { done: number; total: number }; error: string
  rows: DnsRow[]; totalRows: number; loadedProtocol: DnsProtocolMeta | null; protocols: DnsProtocolMeta[]; canStart: boolean
  onRun: () => void; onCancel: () => void; onOpenProtocol: (id: string) => void; onDeleteProtocol: (id: string) => void
  search: string; setSearch: (s: string) => void
  distinct: Map<string, number>; fStatus: Set<string>; setFStatus: (s: Set<string>) => void
  goQuery: (ip: string, h: string) => void; goRemoteDoc: (ip: string, h: string) => void
  onExport: (f: ExportFormat) => void; canExport: boolean
  onMerge: (ids: string[]) => void; mergedFrom: number
}
function DnsView(p: DnsViewProps) {
  const [showMerge, setShowMerge] = useState(false)
  const [mergeSel, setMergeSel] = useState<Set<string>>(new Set())
  const pct = p.progress.total > 0 ? Math.round((p.progress.done / p.progress.total) * 100) : 0
  const phaseLabel = p.phase === 'ping' ? `Ping-Sweep … ${p.progress.done}/${p.progress.total} IPs` : p.phase === 'dns' ? `DNS-Prüfung … ${p.progress.done}/${p.progress.total} online-IPs` : ''
  function statusBadge(s: DnsStatus) {
    if (s === 'OK') return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-black border border-emerald-600"><CheckCircle size={9} />OK</span>
    if (s === 'MISMATCH') return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30"><AlertTriangle size={9} />Falsche IP</span>
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"><AlertTriangle size={9} />{DNS_LABEL[s]}</span>
  }
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        {!p.running
          ? <button onClick={p.onRun} disabled={!p.canStart} className="flex items-center gap-2 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"><Play size={14} />DNS-Check starten</button>
          : <button onClick={p.onCancel} className="flex items-center gap-2 px-4 py-2 text-sm rounded-md font-semibold bg-red-600 hover:bg-red-500 text-white"><Square size={14} />Abbrechen</button>}
        <ExportButtons canExport={p.canExport} onExport={p.onExport} />
        <div className="flex items-center gap-1.5">
          <History size={14} className="text-muted-foreground" />
          <select value={p.loadedProtocol?.id ?? ''} onChange={e => e.target.value && p.onOpenProtocol(e.target.value)} className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground max-w-xs">
            <option value="">Protokoll wählen …</option>
            {p.protocols.map(pr => <option key={pr.id} value={pr.id}>{fmtDateTime(pr.createdAt)} · {pr.total} geprüft · {pr.problems} Probleme</option>)}
          </select>
          {p.loadedProtocol && !p.running && <button onClick={() => p.onDeleteProtocol(p.loadedProtocol!.id)} title="Protokoll löschen" className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-red-300 hover:border-red-500/40"><Trash2 size={13} /></button>}
        </div>
        <button onClick={() => { setMergeSel(new Set()); setShowMerge(true) }} disabled={p.protocols.length === 0}
          title="Mehrere Protokolle zu einer deduplizierten Fehlerliste zusammenführen"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed">
          <Layers size={13} />Zusammenführen
        </button>
        <div className="ml-auto text-xs text-muted-foreground">
          {p.running ? `${phaseLabel} (${pct}%)`
            : p.mergedFrom > 0 ? `Sammelliste · zusammengeführt aus ${p.mergedFrom} Protokollen · ${p.totalRows} DNS-Fehler`
            : p.loadedProtocol ? `Protokoll vom ${fmtDateTime(p.loadedProtocol.createdAt)} · ${p.loadedProtocol.problems} von ${p.loadedProtocol.total} mit DNS-Problem`
            : (p.canStart ? 'Bereit' : 'Kein Subnetz gewählt')}
        </div>
      </div>
      {p.running && <div className="shrink-0 h-1 bg-border"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>}
      {p.error && <div className="mx-6 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs"><XCircle size={14} />{p.error}</div>}

      <div className="shrink-0 px-6 py-2 border-b border-border flex items-center gap-2 flex-wrap bg-muted/5">
        <div className="relative max-w-[220px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={p.search} onChange={e => p.setSearch(e.target.value)} placeholder="IP oder Hostname…" className="pl-7 pr-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary w-[220px]" />
        </div>
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mx-1"><Filter size={11} />Filter</span>
        <ColumnFilter label="DNS-Status" icon={<Globe size={11} />} values={p.distinct} selected={p.fStatus} onChange={p.setFStatus} />
        {p.fStatus.size > 0 && <button onClick={() => p.setFStatus(new Set())} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 ml-auto"><X size={11} />Filter zurücksetzen</button>}
      </div>

      <div className="flex-1 overflow-auto">
        {p.totalRows === 0 && !p.running ? (
          <div className="h-full flex items-center justify-center text-center text-muted-foreground">
            <div><Globe size={40} className="mx-auto mb-3 opacity-20" /><p className="text-sm">Noch kein DNS-Check. „DNS-Check starten" oder ein Protokoll laden.</p><p className="text-[11px] mt-1 text-muted-foreground/70">Pingt die Standort-IPs und prüft je IP: Reverse-DNS (PTR) → Hostname, dann ob der Hostname wieder auf dieselbe IP zeigt.</p></div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background border-b border-border z-10">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 w-32">Status</th><th className="px-3 py-2 w-36 font-mono">IP-Adresse</th><th className="px-3 py-2">Hostname (PTR)</th><th className="px-3 py-2 w-36 font-mono">DNS → IP</th><th className="px-3 py-2 w-40 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map(r => (
                <tr key={r.ip} className={`border-b border-border/40 hover:bg-accent/10 ${r.status !== 'OK' ? 'bg-red-500/[0.03]' : ''}`}>
                  <td className="px-3 py-2">{statusBadge(r.status)}</td>
                  <td className="px-3 py-2 font-mono text-foreground font-semibold">{r.ip}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{r.host || <span className="text-muted-foreground/40 italic">keine PTR</span>}</td>
                  <td className="px-3 py-2 font-mono">{r.fwdIp ? <span className={r.status === 'MISMATCH' ? 'text-red-300' : 'text-muted-foreground'}>{r.fwdIp}</span> : <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => p.goQuery(r.ip, r.host)} title="Zur Abfrage (via IP)" className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground"><Send size={11} />Abfrage</button>
                      <button onClick={() => p.goRemoteDoc(r.ip, r.host)} title="Remote Doc (via IP)" className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground"><Terminal size={11} />Remote Doc</button>
                    </div>
                  </td>
                </tr>
              ))}
              {p.rows.length === 0 && <tr><td colSpan={5} className="px-3 py-12 text-center text-muted-foreground text-sm">Keine Einträge entsprechen den Filtern.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Zusammenfuehren-Modal: mehrere DNS-Protokolle zu einer deduplizierten Fehlerliste mergen */}
      {showMerge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => setShowMerge(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-blue-400" />
                <h3 className="text-base font-semibold text-foreground">Protokolle zusammenführen</h3>
                <button onClick={() => setShowMerge(false)} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><X size={16} /></button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Wähle aus, welche Berichte zu einer gemeinsamen Fehlerliste zusammengeführt werden sollen.</p>
            </div>
            <div className="px-5 py-2.5 border-b border-border flex items-center gap-2 text-xs">
              <button onClick={() => setMergeSel(new Set(p.protocols.map(x => x.id)))} className="px-2 py-1 rounded border border-border hover:bg-accent text-muted-foreground"><CheckSquare size={11} className="inline mr-1" />Alle</button>
              <button onClick={() => setMergeSel(new Set())} className="px-2 py-1 rounded border border-border hover:bg-accent text-muted-foreground">Keine</button>
              <span className="ml-auto text-muted-foreground">{mergeSel.size} ausgewählt</span>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {p.protocols.length === 0 ? <p className="text-xs text-muted-foreground text-center py-6">Keine Protokolle vorhanden.</p> : p.protocols.map(pr => {
                const on = mergeSel.has(pr.id)
                return (
                  <label key={pr.id} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/20 cursor-pointer">
                    <input type="checkbox" checked={on} onChange={() => setMergeSel(prev => { const n = new Set(prev); if (n.has(pr.id)) n.delete(pr.id); else n.add(pr.id); return n })} className="accent-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{fmtDateTime(pr.createdAt)}</p>
                      <p className="text-[11px] text-muted-foreground">{pr.by} · {pr.total} geprüft · <span className={pr.problems > 0 ? 'text-red-300' : ''}>{pr.problems} Probleme</span></p>
                    </div>
                  </label>
                )
              })}
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground flex-1">Duplikate werden entfernt; je IP zählt der jüngste Scan. Behobene Einträge fallen raus.</p>
              <button onClick={() => { p.onMerge([...mergeSel]); setShowMerge(false) }} disabled={mergeSel.size === 0}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                <Layers size={14} />Zusammenführen ({mergeSel.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface WinrmViewProps {
  running: boolean; progress: { done: number; total: number }; error: string
  rows: WinrmDnsRow[]; totalRows: number; loadedProtocol: WinrmDnsProtocolMeta | null; protocols: WinrmDnsProtocolMeta[]
  onRun: () => void; onCancel: () => void; onOpenProtocol: (id: string) => void; onDeleteProtocol: (id: string) => void
  search: string; setSearch: (s: string) => void
  distinct: Map<string, number>; fStatus: Set<string>; setFStatus: (s: Set<string>) => void
  onlyProblems: boolean; setOnlyProblems: (v: boolean) => void
  goQuery: (ip: string, h: string) => void; goRemoteDoc: (ip: string, h: string) => void
  onExport: (f: ExportFormat) => void; canExport: boolean
  onMerge: (ids: string[]) => void; mergedFrom: number; deviceCount: number
}
function WinrmView(p: WinrmViewProps) {
  const [showMerge, setShowMerge] = useState(false)
  const [mergeSel, setMergeSel] = useState<Set<string>>(new Set())
  const pct = p.progress.total > 0 ? Math.round((p.progress.done / p.progress.total) * 100) : 0
  const canStart = p.deviceCount > 0
  function statusBadge(s: WinrmDnsStatus) {
    if (s === 'OK') return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-black border border-emerald-600"><CheckCircle size={9} />OK</span>
    if (s === 'MISMATCH') return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30"><AlertTriangle size={9} />PTR-Mismatch</span>
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"><AlertTriangle size={9} />{WINRM_LABEL[s]}</span>
  }
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        {!p.running
          ? <button onClick={p.onRun} disabled={!canStart} className="flex items-center gap-2 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"><Play size={14} />Prüfung starten</button>
          : <button onClick={p.onCancel} className="flex items-center gap-2 px-4 py-2 text-sm rounded-md font-semibold bg-red-600 hover:bg-red-500 text-white"><Square size={14} />Abbrechen</button>}
        <ExportButtons canExport={p.canExport} onExport={p.onExport} />
        <div className="flex items-center gap-1.5">
          <History size={14} className="text-muted-foreground" />
          <select value={p.loadedProtocol?.id ?? ''} onChange={e => e.target.value && p.onOpenProtocol(e.target.value)} className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground max-w-xs">
            <option value="">Protokoll wählen …</option>
            {p.protocols.map(pr => <option key={pr.id} value={pr.id}>{fmtDateTime(pr.createdAt)} · {pr.total} geprüft · {pr.problems} Fehler</option>)}
          </select>
          {p.loadedProtocol && !p.running && <button onClick={() => p.onDeleteProtocol(p.loadedProtocol!.id)} title="Protokoll löschen" className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-red-300 hover:border-red-500/40"><Trash2 size={13} /></button>}
        </div>
        <button onClick={() => { setMergeSel(new Set()); setShowMerge(true) }} disabled={p.protocols.length === 0}
          title="Mehrere Berichte zu einer deduplizierten Fehlerliste zusammenführen"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed">
          <Layers size={13} />Zusammenführen
        </button>
        <div className="ml-auto text-xs text-muted-foreground">
          {p.running ? `Prüfe DNS (Forward/Reverse) … ${p.progress.done}/${p.progress.total} Geräte (${pct}%)`
            : p.mergedFrom > 0 ? `Sammelliste · zusammengeführt aus ${p.mergedFrom} Berichten · ${p.totalRows} betroffene Geräte`
            : p.loadedProtocol ? `Bericht vom ${fmtDateTime(p.loadedProtocol.createdAt)} · ${p.loadedProtocol.problems} Fehler von ${p.loadedProtocol.total}`
            : (canStart ? `${p.deviceCount} Geräte im Inventar` : 'Kein Inventar geladen')}
        </div>
      </div>
      {p.running && <div className="shrink-0 h-1 bg-border"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>}
      {p.error && <div className="mx-6 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs"><XCircle size={14} />{p.error}</div>}

      <div className="shrink-0 px-6 py-2 border-b border-border flex items-center gap-2 flex-wrap bg-muted/5">
        <div className="relative max-w-[220px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={p.search} onChange={e => p.setSearch(e.target.value)} placeholder="Hostname, IP, PTR…" className="pl-7 pr-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary w-[220px]" />
        </div>
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mx-1"><Filter size={11} />Filter</span>
        <ColumnFilter label="Status" icon={<AlertTriangle size={11} />} values={p.distinct} selected={p.fStatus} onChange={p.setFStatus} />
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={p.onlyProblems} onChange={e => p.setOnlyProblems(e.target.checked)} className="accent-primary" />nur Fehler
        </label>
        {p.fStatus.size > 0 && <button onClick={() => p.setFStatus(new Set())} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"><X size={11} />Filter zurücksetzen</button>}
      </div>

      <div className="flex-1 overflow-auto">
        {p.totalRows === 0 && !p.running ? (
          <div className="h-full flex items-center justify-center text-center text-muted-foreground">
            <div className="max-w-md">
              <AlertTriangle size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">Noch keine Prüfung. „Prüfung starten" oder einen Bericht laden.</p>
              <p className="text-[11px] mt-1 text-muted-foreground/70">Prüft für jedes Gerät aus der Standort-Übersicht: Hostname → A-Record → IP, und ob der PTR dieser IP wieder auf denselben Hostnamen zeigt. Weicht der PTR ab, schlägt WinRM/Kerberos fehl (Gerät „online, aber nicht erreichbar").</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background border-b border-border z-10">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 w-32">Status</th><th className="px-3 py-2">Hostname (Gerät)</th><th className="px-3 py-2 w-36 font-mono">A-Record IP</th><th className="px-3 py-2">PTR zeigt auf</th><th className="px-3 py-2 w-40 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map(r => (
                <tr key={r.hostname} className={`border-b border-border/40 hover:bg-accent/10 ${r.status !== 'OK' ? 'bg-red-500/[0.03]' : ''}`}>
                  <td className="px-3 py-2">{statusBadge(r.status)}</td>
                  <td className="px-3 py-2 font-mono text-foreground font-semibold">{r.hostname}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{r.ip || <span className="text-muted-foreground/40 italic">—</span>}</td>
                  <td className="px-3 py-2 font-mono">{r.ptr ? <span className={r.status === 'MISMATCH' ? 'text-red-300' : 'text-muted-foreground'}>{r.ptr}</span> : <span className="text-muted-foreground/40 italic">kein PTR</span>}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => p.goQuery(r.ip || r.hostname, r.hostname)} title="Zur Abfrage" className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground"><Send size={11} />Abfrage</button>
                      <button onClick={() => p.goRemoteDoc(r.ip || r.hostname, r.hostname)} title="Remote Doc" className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground"><Terminal size={11} />Remote Doc</button>
                    </div>
                  </td>
                </tr>
              ))}
              {p.rows.length === 0 && <tr><td colSpan={5} className="px-3 py-12 text-center text-muted-foreground text-sm">Keine Einträge entsprechen den Filtern.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Zusammenführen-Modal */}
      {showMerge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => setShowMerge(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-blue-400" />
                <h3 className="text-base font-semibold text-foreground">Berichte zusammenführen</h3>
                <button onClick={() => setShowMerge(false)} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><X size={16} /></button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Wähle aus, welche Prüf-Berichte zu einer gemeinsamen Fehlerliste (für die DNS-/Netzwerk-Abteilung) zusammengeführt werden sollen.</p>
            </div>
            <div className="px-5 py-2.5 border-b border-border flex items-center gap-2 text-xs">
              <button onClick={() => setMergeSel(new Set(p.protocols.map(x => x.id)))} className="px-2 py-1 rounded border border-border hover:bg-accent text-muted-foreground"><CheckSquare size={11} className="inline mr-1" />Alle</button>
              <button onClick={() => setMergeSel(new Set())} className="px-2 py-1 rounded border border-border hover:bg-accent text-muted-foreground">Keine</button>
              <span className="ml-auto text-muted-foreground">{mergeSel.size} ausgewählt</span>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {p.protocols.length === 0 ? <p className="text-xs text-muted-foreground text-center py-6">Keine Berichte vorhanden.</p> : p.protocols.map(pr => {
                const on = mergeSel.has(pr.id)
                return (
                  <label key={pr.id} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/20 cursor-pointer">
                    <input type="checkbox" checked={on} onChange={() => setMergeSel(prev => { const n = new Set(prev); if (n.has(pr.id)) n.delete(pr.id); else n.add(pr.id); return n })} className="accent-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{fmtDateTime(pr.createdAt)}</p>
                      <p className="text-[11px] text-muted-foreground">{pr.by} · {pr.total} geprüft · <span className={pr.problems > 0 ? 'text-red-300' : ''}>{pr.problems} Fehler</span></p>
                    </div>
                  </label>
                )
              })}
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground flex-1">Duplikate werden entfernt; je Hostname zählt der jüngste Scan. Behobene Geräte fallen raus.</p>
              <button onClick={() => { p.onMerge([...mergeSel]); setShowMerge(false) }} disabled={mergeSel.size === 0}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                <Layers size={14} />Zusammenführen ({mergeSel.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface MassViewProps {
  running: boolean; phase: Phase; progress: { done: number; total: number }; error: string
  rows: ScanRow[]; totalRows: number; loadedProtocol: ScanProtocolMeta | null; protocols: ScanProtocolMeta[]; canStart: boolean
  onRun: () => void; onCancel: () => void; onOpenProtocol: (id: string) => void; onDeleteProtocol: (id: string) => void
  mSearch: string; setMSearch: (s: string) => void
  distinct: { status: Map<string, number>; login: Map<string, number>; dns: Map<string, number>; dept: Map<string, number>; assign: Map<string, number> }
  anyFilter: boolean
  fStatus: Set<string>; setFStatus: (s: Set<string>) => void; fLogin: Set<string>; setFLogin: (s: Set<string>) => void
  fDns: Set<string>; setFDns: (s: Set<string>) => void; fDept: Set<string>; setFDept: (s: Set<string>) => void
  fAssign: Set<string>; setFAssign: (s: Set<string>) => void
  resetFilters: () => void
  goQuery: (ip: string, h: string) => void; goRemoteDoc: (ip: string, h: string) => void
  goDaylis: (ip: string, h: string, u: { sam: string; displayName: string; enabled: boolean }) => void
  onExport: (f: ExportFormat) => void; canExport: boolean
  onMerge: (ids: string[]) => void
}
function MassView(p: MassViewProps) {
  const pct = p.progress.total > 0 ? Math.round((p.progress.done / p.progress.total) * 100) : 0
  const [showMerge, setShowMerge] = useState(false)
  const [mergeSel, setMergeSel] = useState<Set<string>>(new Set())
  const phaseLabel = p.phase === 'ping' ? `Ping-Sweep … ${p.progress.done}/${p.progress.total} IPs`
    : p.phase === 'probe' ? `Prüfe angemeldete Benutzer … ${p.progress.done}/${p.progress.total} online-Geräte`
    : p.phase === 'activate' ? `Aktiviere WinRM auf restlichen Geräten … ${p.progress.done}/${p.progress.total}`
    : ''
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        {!p.running
          ? <button onClick={p.onRun} disabled={!p.canStart} className="flex items-center gap-2 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"><Play size={14} />Neuen Scan starten</button>
          : <button onClick={p.onCancel} className="flex items-center gap-2 px-4 py-2 text-sm rounded-md font-semibold bg-red-600 hover:bg-red-500 text-white"><Square size={14} />Scan abbrechen</button>}
        <ExportButtons canExport={p.canExport} onExport={p.onExport} />
        <div className="flex items-center gap-1.5">
          <History size={14} className="text-muted-foreground" />
          <select value={p.loadedProtocol?.id ?? ''} onChange={e => e.target.value && p.onOpenProtocol(e.target.value)} className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground max-w-xs">
            <option value="">Protokoll wählen …</option>
            {p.protocols.map(pr => <option key={pr.id} value={pr.id}>{fmtDateTime(pr.createdAt)} · {pr.withSession} angemeldet · {pr.dnsProblems} DNS-Probleme</option>)}
          </select>
          {p.loadedProtocol && !p.running && <button onClick={() => p.onDeleteProtocol(p.loadedProtocol!.id)} title="Protokoll löschen" className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-red-300 hover:border-red-500/40"><Trash2 size={13} /></button>}
        </div>
        <button onClick={() => { setMergeSel(new Set()); setShowMerge(true) }} disabled={p.protocols.length === 0}
          title="Mehrere Scans zusammenführen und Personen finden, die ein nicht zugewiesenes Gerät mehrfach genutzt haben"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed">
          <Layers size={13} />Zusammenführen
        </button>
        <div className="ml-auto text-xs text-muted-foreground">
          {p.running ? `${phaseLabel} (${pct}%)` : p.loadedProtocol ? `Protokoll vom ${fmtDateTime(p.loadedProtocol.createdAt)} · ${p.loadedProtocol.withSession} angemeldet · ${p.loadedProtocol.dnsProblems} DNS-Probleme` : (p.canStart ? 'Bereit' : 'Kein Subnetz gewählt')}
        </div>
      </div>
      {p.running && <div className="shrink-0 h-1 bg-border"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>}
      {p.error && <div className="mx-6 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs"><XCircle size={14} />{p.error}</div>}

      <div className="shrink-0 px-6 py-2 border-b border-border flex items-center gap-2 flex-wrap bg-muted/5">
        <div className="relative max-w-[220px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={p.mSearch} onChange={e => p.setMSearch(e.target.value)} placeholder="Name, Corp ID, IP, Host…" className="pl-7 pr-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary w-[220px]" />
        </div>
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mx-1"><Filter size={11} />Filter</span>
        <ColumnFilter label="Status" icon={<ListFilter size={11} />} values={p.distinct.status} selected={p.fStatus} onChange={p.setFStatus} />
        <ColumnFilter label="Angemeldet" icon={<Wifi size={11} />} values={p.distinct.login} selected={p.fLogin} onChange={p.setFLogin} />
        <ColumnFilter label="DNS" icon={<Globe size={11} />} values={p.distinct.dns} selected={p.fDns} onChange={p.setFDns} />
        <ColumnFilter label="Zuweisung" icon={<UserSearch size={11} />} values={p.distinct.assign} selected={p.fAssign} onChange={p.setFAssign} />
        <ColumnFilter label="Abteilung" icon={<Building2 size={11} />} values={p.distinct.dept} selected={p.fDept} onChange={p.setFDept} />
        {p.anyFilter && <button onClick={p.resetFilters} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 ml-auto"><X size={11} />Filter zurücksetzen</button>}
      </div>

      <div className="flex-1 overflow-auto">
        {p.totalRows === 0 && !p.running ? (
          <div className="h-full flex items-center justify-center text-center text-muted-foreground">
            <div><Network size={40} className="mx-auto mb-3 opacity-20" /><p className="text-sm">Noch kein Scan. „Neuen Scan starten" oder ein Protokoll laden.</p><p className="text-[11px] mt-1 text-muted-foreground/70">Der Scan pingt zuerst die Standort-IPs (DNS-unabhängig) und fragt nur online-Geräte ab.</p></div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background border-b border-border z-10">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 w-16">Status</th><th className="px-3 py-2 font-mono w-24">Corp ID</th><th className="px-3 py-2">Name</th>
                <th className="px-3 py-2 w-32">IP-Adresse</th><th className="px-3 py-2 w-40">Hostname</th><th className="px-3 py-2 w-52">Zuweisung</th><th className="px-3 py-2 w-28">DNS</th><th className="px-3 py-2 w-44 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map(r => (
                <tr key={r.sam} className="border-b border-border/40 hover:bg-accent/10">
                  <td className="px-3 py-2">{r.enabled ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-black border border-emerald-600"><CheckCircle size={9} />Aktiv</span> : <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30"><XCircle size={9} />Inaktiv</span>}</td>
                  <td className="px-3 py-2 font-mono text-foreground">{r.sam}</td>
                  <td className="px-3 py-2 text-foreground"><span className="inline-flex items-center gap-1">{r.displayName}<PersonInfoButton name={r.displayName} sam={r.sam} /></span></td>
                  <td className="px-3 py-2 font-mono">{r.loggedIn && r.ip ? <span className="text-foreground font-semibold">{r.ip}</span> : r.loggedIn ? <span className="text-muted-foreground/60">IP?</span> : <span className="text-muted-foreground/40 italic">nicht angemeldet</span>}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{r.hostname || <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="px-3 py-2">{r.loggedIn ? <AssignmentBadge status={r.assignmentStatus} assignedTo={r.assignedTo} deviceType={r.deviceType} leaderMatch={r.leaderMatch} /> : <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="px-3 py-2">{r.loggedIn ? <DnsBadge dnsProblem={r.dnsProblem} ip={r.ip} dnsIp={r.dnsIp} /> : <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="px-3 py-2">{r.loggedIn ? <ActionButtons ip={r.ip} hostname={r.hostname} onQuery={p.goQuery} onRemote={p.goRemoteDoc} onDaylis={(ip, h) => p.goDaylis(ip, h, r)} /> : <span className="text-muted-foreground/30 text-[11px] block text-right">—</span>}</td>
                </tr>
              ))}
              {p.rows.length === 0 && <tr><td colSpan={8} className="px-3 py-12 text-center text-muted-foreground text-sm">Keine Einträge entsprechen den Filtern.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Zusammenführen-Modal: mehrere Scans für die Fremdnutzungs-Auswertung wählen */}
      {showMerge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => setShowMerge(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-blue-400" />
                <h3 className="text-base font-semibold text-foreground">Scans zusammenführen</h3>
                <button onClick={() => setShowMerge(false)} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><X size={16} /></button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Wähle die Massen-Scans aus, die für die Auswertung „Mehrfach-Fremdnutzung" zusammengeführt werden sollen.</p>
            </div>
            <div className="px-5 py-2.5 border-b border-border flex items-center gap-2 text-xs">
              <button onClick={() => setMergeSel(new Set(p.protocols.map(x => x.id)))} className="px-2 py-1 rounded border border-border hover:bg-accent text-muted-foreground"><CheckSquare size={11} className="inline mr-1" />Alle</button>
              <button onClick={() => setMergeSel(new Set())} className="px-2 py-1 rounded border border-border hover:bg-accent text-muted-foreground">Keine</button>
              <span className="ml-auto text-muted-foreground">{mergeSel.size} ausgewählt</span>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {p.protocols.length === 0 ? <p className="text-xs text-muted-foreground text-center py-6">Keine Scans vorhanden.</p> : p.protocols.map(pr => {
                const on = mergeSel.has(pr.id)
                return (
                  <label key={pr.id} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/20 cursor-pointer">
                    <input type="checkbox" checked={on} onChange={() => setMergeSel(prev => { const n = new Set(prev); if (n.has(pr.id)) n.delete(pr.id); else n.add(pr.id); return n })} className="accent-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{fmtDateTime(pr.createdAt)}</p>
                      <p className="text-[11px] text-muted-foreground">{pr.by} · {pr.withSession} angemeldet · {pr.totalUsers} Benutzer</p>
                    </div>
                  </label>
                )
              })}
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground flex-1">Gezählt wird je Person+Gerät, wie oft jemand an einem Gerät angemeldet war, das ihm laut Inventar NICHT zugewiesen ist.</p>
              <button onClick={() => { p.onMerge([...mergeSel]); setShowMerge(false) }} disabled={mergeSel.size === 0}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                <Layers size={14} />Auswerten ({mergeSel.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
