// ── VLAN-Übersicht ────────────────────────────────────────────────────────────
// Zeigt alle VLANs/Subnetze am Standort und je VLAN die enthaltenen Geräte.
// VLAN = IP-Subnetz: Subnetze kommen aus dem AD (Sites & Services), die IT
// beschriftet sie mit VLAN-ID/Name. Geräte kombiniert aus Inventar + Live-Scan.
// Der komplette Scan-Baukasten stammt aus userPresenceScan (wiederverwendet).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Network, RefreshCw, Loader2, Square, Search, Save, Plus, Trash2, Edit2, Check, X,
  Wifi, WifiOff, Boxes, AlertTriangle, HelpCircle, Upload, GitCompareArrows, ScanLine, Download,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { DeviceInfoButton } from '../components/device/DeviceDossier'
import { getSiteSubnets } from '../services/userPresenceScan'
import {
  loadVlanConfig, saveVlanConfig, loadScanCache, saveScanCache, discoverDevices,
  labelFor, normalizeCidr, ipToInt, DEFAULT_SITE, mergeVlanSeed, computeVlanDrift,
  classifyDevicesPassive, probeDeviceTypes, isTypeMismatch, findVlanDef,
  loadDeviceTypes, saveDeviceTypes, DEVICE_TYPE_LABEL,
  type VlanConfig, type VlanDef, type VlanDrift, type DriftStatus, type DeviceType, type VlanDevice,
} from '../services/vlans'
import { VLAN_SEED, VLAN_SEED_NOTE, VLAN_SEED_SITE } from '../data/vlanSeed'
import type { InventoryItem } from '../types/auth'
import { api } from '../electronAPI'
import { useVlanStore, beginScanToken, currentScanToken, abortScan, isScanAborted, wasAborted } from '../store/vlanStore'

const UNKNOWN = '__unknown__'

const TYPE_CLS: Record<DeviceType, string> = {
  printer: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  phone: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  pc: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  server: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  other: 'bg-muted/30 text-muted-foreground border-border',
}

function driftBadge(s: DriftStatus): { label: string; cls: string } {
  switch (s) {
    case 'not-in-ad': return { label: 'nicht in AD', cls: 'bg-red-500/15 text-red-300 border-red-500/30' }
    case 'new-in-ad': return { label: 'neu in AD', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' }
    case 'empty': return { label: 'leer', cls: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/30' }
    case 'active': return { label: 'bestätigt', cls: 'bg-green-500/15 text-green-300 border-green-500/30' }
  }
}

export default function VlanOverview() {
  const user = useAuthStore(s => s.session?.user)
  const currentUser = user?.displayName || user?.username || 'unbekannt'

  const store = useVlanStore()
  const { scanning, phase, progress, total, up, devices, capped, partial, scanDate } = store

  const [config, setConfig] = useState<VlanConfig>({ site: DEFAULT_SITE, vlans: [] })
  const [site, setSite] = useState<string>(DEFAULT_SITE)
  const [selectedCidr, setSelectedCidr] = useState<string>('')
  const [search, setSearch] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [newCidr, setNewCidr] = useState('')
  const [savingCfg, setSavingCfg] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [showDrift, setShowDrift] = useState(false)
  const [driftLoading, setDriftLoading] = useState(false)
  const [drift, setDrift] = useState<VlanDrift[]>([])
  const [driftMsg, setDriftMsg] = useState('')
  // Gerätetyp-Check
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [activeTypes, setActiveTypes] = useState<Record<string, { type: DeviceType; detail: string }>>({})
  const [probing, setProbing] = useState(false)
  const [probeProg, setProbeProg] = useState({ done: 0, total: 0 })
  const [onlyForeign, setOnlyForeign] = useState(false)
  const probeAbort = useRef(false)

  // Config + Cache beim Öffnen laden
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cfg = await loadVlanConfig()
      if (cancelled) return
      setConfig(cfg)
      setSite(cfg.site || DEFAULT_SITE)
      // Inventar für die passive Gerätetyp-Erkennung (Kategorie „Drucker"/„Computer" …).
      try { const inv = await api().netReadJson<InventoryItem[]>('inventory/inventory.json'); if (!cancelled) setInventory(Array.isArray(inv) ? inv : []) } catch { /* leer */ }
      // LIVE-Zustand lesen (nicht den Mount-Snapshot) — sonst könnte ein Scan, der
      // während loadVlanConfig/loadScanCache startet, vom Cache überschrieben werden.
      const live = useVlanStore.getState()
      if (live.devices.length === 0 && !live.scanning) {
        const cache = await loadScanCache()
        const live2 = useVlanStore.getState()
        if (!cancelled && cache && live2.devices.length === 0 && !live2.scanning) {
          live2.loadCached(cache.devices, cache.subnets, cache.site, cache.scanDate, !!cache.capped)
        }
      }
      // Gespeicherte Gerätetypen (Port-Check) laden — nur wenn sie zum aktuell
      // geladenen Scan gehören (sonst veraltet → erst nach erneuter Prüfung).
      const dt = await loadDeviceTypes()
      if (!cancelled && dt && dt.scanDate && dt.scanDate === useVlanStore.getState().scanDate) {
        setActiveTypes(dt.types)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Scan ────────────────────────────────────────────────────────────────────
  async function runScan() {
    if (scanning) return
    // Subnetze = AD-Standort-Subnetze ∪ konfigurierte/manuelle Subnetze
    const cfgCidrs = config.vlans.map(v => normalizeCidr(v.cidr)).filter(Boolean)
    let adCidrs: string[] = []
    try {
      const res = await getSiteSubnets(site.trim() || DEFAULT_SITE)
      if (res.ok) adCidrs = res.subnets.map(normalizeCidr).filter(Boolean)
    } catch { /* AD evtl. nicht erreichbar → nur Config-Subnetze */ }
    const subnets = [...new Set([...adCidrs, ...cfgCidrs])]
    if (subnets.length === 0) {
      store.failScan('Keine Subnetze gefunden. AD (Sites & Services) nicht erreichbar oder kein Standort-Treffer — bitte Subnetze unten manuell ergänzen.')
      return
    }
    const token = beginScanToken()
    store.startScan(subnets, site.trim() || DEFAULT_SITE)
    try {
      const { devices: found, capped: cap, pingError } = await discoverDevices(
        subnets,
        p => { if (currentScanToken() === token) store.updateProgress(p.phase, p.done, p.total, p.up) },
        () => isScanAborted(token),
      )
      if (currentScanToken() !== token) return   // von einem neueren Scan abgelöst → Store nicht anfassen
      const aborted = wasAborted()
      const now = new Date().toISOString()
      // Bei Abbruch: Teilergebnis anzeigen, aber KEIN frisches „Letzter Scan"-Datum stempeln.
      store.finishScan(found, cap, aborted ? (useVlanStore.getState().scanDate ?? now) : now, aborted)
      if (!aborted) {
        await saveScanCache({ scanDate: now, scannedBy: user?.username, site: site.trim() || DEFAULT_SITE, subnets, capped: cap, devices: found })
        // Neuer Scan → alte Port-Typ-Ergebnisse verwerfen (gelten „bis zum nächsten Scan").
        setActiveTypes({}); void saveDeviceTypes(now, {})
        if (pingError && found.length === 0) store.failScan(`Ping-Sweep fehlgeschlagen: ${pingError}`)
      }
    } catch (e) {
      if (currentScanToken() === token) store.failScan(e instanceof Error ? e.message : String(e))
    }
  }

  function stopScan() { abortScan(); store.stopScan() }

  // ── VLAN/Subnetz-Gruppen ──────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const cidrSet = new Set<string>()
    for (const c of store.subnets) { const n = normalizeCidr(c); if (n) cidrSet.add(n) }
    for (const v of config.vlans) { const n = normalizeCidr(v.cidr); if (n) cidrSet.add(n) }
    for (const d of devices) { if (d.cidr) cidrSet.add(d.cidr) }
    const arr = [...cidrSet].map(cidr => {
      const devs = devices.filter(d => d.cidr === cidr)
      const def = findVlanDef(cidr, config)   // Config zuerst, sonst gefundener VLAN-Seed (auch /23-vs-/24 tolerant)
      return { cidr, def, total: devs.length, online: devs.filter(d => d.online).length }
    })
    arr.sort((a, b) => {
      // Nicht-numerische / fehlende VLAN-IDs ans Ende (nie NaN zurückgeben).
      const num = (s?: string) => { const n = s ? Number(s) : NaN; return Number.isFinite(n) ? n : Infinity }
      const va = num(a.def?.vlanId), vb = num(b.def?.vlanId)
      if (va !== vb) return va - vb
      return ipToInt(a.cidr.split('/')[0]) - ipToInt(b.cidr.split('/')[0])
    })
    const unknownCount = devices.filter(d => !d.cidr).length
    return { arr, unknownCount }
  }, [devices, config, store.subnets])

  // Auswahl gültig halten
  useEffect(() => {
    const valid = groups.arr.some(g => g.cidr === selectedCidr) || (selectedCidr === UNKNOWN && groups.unknownCount > 0)
    if (!valid) setSelectedCidr(groups.arr[0]?.cidr ?? (groups.unknownCount > 0 ? UNKNOWN : ''))
  }, [groups, selectedCidr])

  // ── Gerätetyp-Erkennung + „passt nicht"-Prüfung ──────────────────────────────
  const vlanDeviceList = useMemo(() => {
    const base = selectedCidr === UNKNOWN ? devices.filter(d => !d.cidr) : devices.filter(d => d.cidr === selectedCidr)
    return [...base].sort((a, b) => ipToInt(a.ip) - ipToInt(b.ip))
  }, [devices, selectedCidr])

  const passiveTypes = useMemo(() => classifyDevicesPassive(devices, inventory), [devices, inventory])
  const selectedDef = useMemo(() => findVlanDef(selectedCidr, config), [config, selectedCidr])
  const expectedType = (selectedDef?.expectedType || '') as DeviceType | ''

  const typeOf = useCallback((d: VlanDevice): { type?: DeviceType; source?: 'inventory' | 'hostname' | 'ports'; detail?: string } => {
    const act = activeTypes[d.ip]
    if (act) return { type: act.type, source: 'ports', detail: act.detail }
    const p = passiveTypes.get(d.ip)
    if (p) return { type: p.type, source: p.source }
    return {}
  }, [activeTypes, passiveTypes])

  const typeStatus = useCallback((d: VlanDevice): 'ok' | 'foreign' | 'unknown' | 'none' => {
    if (!expectedType) return 'none'
    const t = typeOf(d).type
    if (!t) return 'unknown'
    return t === expectedType ? 'ok' : 'foreign'
  }, [expectedType, typeOf])

  const foreignStats = useMemo(() => {
    let foreign = 0, unknown = 0
    for (const d of vlanDeviceList) { const s = typeStatus(d); if (s === 'foreign') foreign++; else if (s === 'unknown') unknown++ }
    return { foreign, unknown }
  }, [vlanDeviceList, typeStatus])

  const selectedDevices = useMemo(() => {
    const q = search.trim().toLowerCase()
    return vlanDeviceList.filter(d => {
      if (onlyForeign) { const s = typeStatus(d); if (s !== 'foreign' && s !== 'unknown') return false }
      if (!q) return true
      return d.ip.includes(q) || (d.hostname || '').toLowerCase().includes(q) || (d.user || '').toLowerCase().includes(q)
    })
  }, [vlanDeviceList, search, onlyForeign, typeStatus])

  // Port-Typ-Check über eine IP-Menge; Ergebnis wird bis zum nächsten Scan gespeichert.
  async function runProbeOver(ips: string[]) {
    const targets = [...new Set(ips)]
    if (targets.length === 0 || probing) return
    probeAbort.current = false
    setProbing(true); setProbeProg({ done: 0, total: targets.length })
    try {
      const map = await probeDeviceTypes(targets, (done, total) => setProbeProg({ done, total }), () => probeAbort.current)
      setActiveTypes(prev => {
        const next = { ...prev }
        map.forEach((v, ip) => { next[ip] = v })
        void saveDeviceTypes(scanDate || '', next)   // persistiert bis zum nächsten Scan
        return next
      })
    } finally { setProbing(false) }
  }
  const runTypeProbe = () => runProbeOver(vlanDeviceList.filter(d => d.online).map(d => d.ip))
  const runAllProbe = () => runProbeOver(devices.filter(d => d.online).map(d => d.ip))
  const stopProbe = () => { probeAbort.current = true }

  async function exportForeign() {
    const flagged = vlanDeviceList.filter(d => { const s = typeStatus(d); return s === 'foreign' || s === 'unknown' })
    if (flagged.length === 0) return
    const vlanLbl = selectedDef ? [selectedDef.vlanId ? `VLAN ${selectedDef.vlanId}` : '', selectedDef.name || ''].filter(Boolean).join(' ') : ''
    const header = ['VLAN', 'Subnetz', 'IP', 'Hostname', 'Benutzer', 'Online', 'Erkannter Typ', 'Status', 'Quelle/Detail']
    const rows = flagged.map(d => {
      const t = typeOf(d); const s = typeStatus(d)
      return [vlanLbl, selectedCidr, d.ip, d.hostname || '', d.user || '', d.online ? 'ja' : 'nein',
        t.type ? DEVICE_TYPE_LABEL[t.type] : 'unbekannt',
        s === 'foreign' ? `Fremd (kein ${expectedType ? DEVICE_TYPE_LABEL[expectedType] : '?'})` : 'unklar – prüfen',
        [t.source, t.detail].filter(Boolean).join(' ')]
    })
    const esc = (x: string) => `"${(x ?? '').replace(/"/g, '""')}"`
    const csv = '﻿' + [header, ...rows].map(r => r.map(esc).join(';')).join('\r\n')
    const path = await api().saveFileDialog(`VLAN_Fremdgeraete_${(selectedDef?.vlanId || selectedCidr).replace(/[/.]/g, '-')}.csv`, [{ name: 'CSV', extensions: ['csv'] }])
    if (!path) return
    const bytes = new TextEncoder().encode(csv)
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    await api().writeFile(path, btoa(bin))
  }

  // ── Config-Editor ─────────────────────────────────────────────────────────────
  function updateDef(cidr: string, patch: Partial<VlanDef>) {
    setConfig(prev => {
      const norm = normalizeCidr(cidr)
      const idx = prev.vlans.findIndex(v => normalizeCidr(v.cidr) === norm)
      const vlans = [...prev.vlans]
      if (idx >= 0) vlans[idx] = { ...vlans[idx], ...patch }
      else vlans.push({ cidr: norm, ...patch })
      return { ...prev, vlans }
    })
  }
  function addManualCidr() {
    const norm = normalizeCidr(newCidr)
    if (!norm) { window.alert('Ungültiges CIDR. Beispiel: 10.20.30.0/24'); return }
    if (config.vlans.some(v => normalizeCidr(v.cidr) === norm)) { setNewCidr(''); return }
    setConfig(prev => ({ ...prev, vlans: [...prev.vlans, { cidr: norm }] }))
    setNewCidr('')
  }
  function removeDef(cidr: string) {
    setConfig(prev => ({ ...prev, vlans: prev.vlans.filter(v => normalizeCidr(v.cidr) !== normalizeCidr(cidr)) }))
  }
  async function saveConfig() {
    setSavingCfg(true)
    try { await saveVlanConfig({ ...config, site: site.trim() || DEFAULT_SITE }, currentUser) }
    finally { setSavingCfg(false) }
  }

  // Gefundene VLAN-Liste (Stand ~2022) mergen + speichern; bestehende Labels bleiben.
  async function importSeed() {
    const { merged, added, updated } = mergeVlanSeed(config, VLAN_SEED, VLAN_SEED_NOTE)
    const withSite: VlanConfig = { ...merged, site: site.trim() || VLAN_SEED_SITE }
    setConfig(withSite); setSite(withSite.site)
    setSavingCfg(true); setImportMsg('')
    try {
      const ok = await saveVlanConfig(withSite, currentUser)
      setImportMsg(ok
        ? `VLAN-Liste importiert: ${added} neu, ${updated} ergänzt (${VLAN_SEED_NOTE}). Gespeichert — bitte per „Scannen" / „Drift-Check" verifizieren.`
        : 'Zusammengeführt, aber Speichern fehlgeschlagen (Netzlaufwerk erreichbar?).')
    } finally { setSavingCfg(false) }
  }

  // Drift-Check: VLAN-Liste vs. AD-Subnetze vs. letzter Scan.
  async function runDrift() {
    setShowDrift(true); setDriftLoading(true); setDriftMsg('')
    let adCidrs: string[] = []
    try { const res = await getSiteSubnets(site.trim() || DEFAULT_SITE); if (res.ok) adCidrs = res.subnets } catch { /* AD offline */ }
    setDrift(computeVlanDrift(config, adCidrs, devices))
    if (adCidrs.length === 0) setDriftMsg('AD-Subnetze (Sites & Services) nicht abrufbar — „nicht in AD"/„neu in AD" ist ohne diesen Abgleich nicht aussagekräftig.')
    else if (devices.length === 0) setDriftMsg('Noch kein Scan geladen — „leer" bedeutet daher nur „nicht gescannt". Für echte Geräte-Bestätigung einmal „Scannen".')
    setDriftLoading(false)
  }

  // Zeilen für den Editor: alle bekannten Subnetze (Gruppen) ∪ konfigurierte
  const editorCidrs = useMemo(() => {
    const s = new Set<string>()
    for (const g of groups.arr) s.add(g.cidr)
    for (const v of config.vlans) { const n = normalizeCidr(v.cidr); if (n) s.add(n) }
    return [...s].sort((a, b) => ipToInt(a.split('/')[0]) - ipToInt(b.split('/')[0]))
  }, [groups, config])

  const fmtDate = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Kopf + Steuerung */}
      <div className="shrink-0 px-6 pt-6 pb-3 border-b border-border">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Network size={24} />VLAN-Übersicht</h1>
            <p className="text-sm text-muted-foreground mt-1">Alle VLANs/Subnetze am Standort und die enthaltenen Geräte (Inventar + Live-Scan).</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Standort
              <input value={site} onChange={e => setSite(e.target.value)} placeholder={DEFAULT_SITE}
                className="w-24 px-2 py-1 rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            </label>
            {scanning ? (
              <button onClick={stopScan} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-red-500/90 text-white hover:bg-red-500">
                <Square size={14} />Stoppen
              </button>
            ) : (
              <button onClick={runScan} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
                <RefreshCw size={14} />Scannen
              </button>
            )}
            <button onClick={() => setEditMode(e => !e)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border ${editMode ? 'border-primary text-foreground bg-accent/30' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'}`}>
              <Edit2 size={14} />VLAN-Zuordnung
            </button>
            <button onClick={runDrift}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border ${showDrift ? 'border-primary text-foreground bg-accent/30' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'}`}>
              <GitCompareArrows size={14} />Drift-Check
            </button>
            {probing ? (
              <button onClick={stopProbe}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-red-500/50 text-red-300 hover:bg-red-500/10">
                <Loader2 size={14} className="animate-spin" />Typen {probeProg.done}/{probeProg.total} · Stoppen
              </button>
            ) : (
              <button onClick={runAllProbe} disabled={scanning || devices.filter(d => d.online).length === 0}
                title="Port-Typ-Check über ALLE online-Geräte aller Subnetze — Ergebnis wird bis zum nächsten Scan gespeichert"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30 disabled:opacity-40">
                <ScanLine size={14} />Alle Typen prüfen
              </button>
            )}
          </div>
        </div>

        {importMsg && (
          <div className="mt-2 rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2 text-xs text-green-300 flex items-start gap-2">
            <Check size={13} className="shrink-0 mt-px" /><span className="flex-1">{importMsg}</span>
            <button onClick={() => setImportMsg('')} className="shrink-0 text-green-300/70 hover:text-green-200"><X size={13} /></button>
          </div>
        )}

        {/* Fortschritt / Status */}
        {scanning && (
          <div className="mt-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Loader2 size={13} className="animate-spin" />
              {phase === 'ping' ? `Ping-Sweep ${progress}/${total} · ${up} erreichbar` : phase === 'resolve' ? `Geräte auflösen ${progress}/${total}` : 'Starte…'}
            </div>
            <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: total > 0 ? `${Math.round((progress / total) * 100)}%` : '10%' }} />
            </div>
          </div>
        )}
        {!scanning && (
          <div className="mt-2 flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
            {scanDate && <span>Letzter Scan: {fmtDate(scanDate)}</span>}
            {partial && <span className="text-amber-400">· abgebrochen (Teilergebnis)</span>}
            {devices.length > 0 && <span>· {devices.length} Geräte · {devices.filter(d => d.online).length} online</span>}
            {capped && <span className="inline-flex items-center gap-1 text-amber-400"><AlertTriangle size={11} />IP-Bereich gekappt (max. 8192) — sehr große Subnetze werden nur teilweise gescannt.</span>}
          </div>
        )}
        {store.error && <p className="mt-2 text-xs text-red-400">{store.error}</p>}
      </div>

      {/* VLAN-Zuordnung bearbeiten */}
      {editMode && (
        <div className="shrink-0 px-6 py-3 border-b border-border bg-muted/5 max-h-[38vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2 gap-2">
            <p className="text-sm font-semibold text-foreground">VLAN-Zuordnung (je Subnetz VLAN-ID + Name vergeben)</p>
            <div className="flex items-center gap-2">
              <button onClick={importSeed} disabled={savingCfg}
                title="Gefundene VLAN-Liste (Stand ~2022) übernehmen — bestehende Labels bleiben erhalten"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
                <Upload size={13} />Liste importieren ({VLAN_SEED.length})
              </button>
              <button onClick={saveConfig} disabled={savingCfg}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                {savingCfg ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Zuordnung speichern
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground px-1">
              <span className="w-40 shrink-0">Subnetz (CIDR)</span><span className="w-20 shrink-0">VLAN-ID</span><span className="w-44 shrink-0">Name</span><span className="w-28 shrink-0">Soll-Typ</span><span className="flex-1">Beschreibung</span>
            </div>
            {editorCidrs.map(cidr => {
              const def = config.vlans.find(v => normalizeCidr(v.cidr) === cidr)
              const manual = !store.subnets.some(s => normalizeCidr(s) === cidr) && !devices.some(d => d.cidr === cidr)
              return (
                <div key={cidr} className="flex items-center gap-2">
                  <span className="w-40 shrink-0 font-mono text-xs text-foreground">{cidr}</span>
                  <input value={def?.vlanId ?? ''} onChange={e => updateDef(cidr, { vlanId: e.target.value })} placeholder="z.B. 30"
                    className="w-20 shrink-0 px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                  <input value={def?.name ?? ''} onChange={e => updateDef(cidr, { name: e.target.value })} placeholder="z.B. Drucker-VLAN"
                    className="w-44 shrink-0 px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                  <select value={def?.expectedType ?? ''} onChange={e => updateDef(cidr, { expectedType: e.target.value as DeviceType | '' })}
                    title="Erwarteter Gerätetyp – Basis für die Fremdgerät-Prüfung"
                    className="w-28 shrink-0 px-1.5 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary">
                    <option value="">— (keine Prüfung)</option>
                    <option value="printer">Drucker</option>
                    <option value="phone">Telefon (VoIP)</option>
                    <option value="pc">PC/Laptop</option>
                    <option value="server">Server</option>
                    <option value="other">Sonstiges</option>
                  </select>
                  <input value={def?.description ?? ''} onChange={e => updateDef(cidr, { description: e.target.value })} placeholder="optional"
                    className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                  {manual && <button onClick={() => removeDef(cidr)} title="Manuelles Subnetz entfernen" className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 shrink-0"><Trash2 size={13} /></button>}
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <input value={newCidr} onChange={e => setNewCidr(e.target.value)} placeholder="Subnetz manuell ergänzen, z.B. 10.20.30.0/24"
              onKeyDown={e => { if (e.key === 'Enter') addManualCidr() }}
              className="w-64 px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            <button onClick={addManualCidr} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"><Plus size={12} />Hinzufügen</button>
          </div>
        </div>
      )}

      {/* Drift-Check */}
      {showDrift && (
        <div className="shrink-0 px-6 py-3 border-b border-border bg-muted/5 max-h-[40vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2 gap-2">
            <p className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5"><GitCompareArrows size={14} />Drift-Check — VLAN-Liste vs. AD-Subnetze vs. letzter Scan</p>
            <div className="flex items-center gap-2">
              <button onClick={runDrift} disabled={driftLoading} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
                {driftLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Neu prüfen
              </button>
              <button onClick={() => setShowDrift(false)} className="p-1 rounded text-muted-foreground hover:text-foreground"><X size={15} /></button>
            </div>
          </div>
          {driftMsg && <p className="text-[11px] text-amber-400 mb-2 inline-flex items-start gap-1"><AlertTriangle size={12} className="shrink-0 mt-px" />{driftMsg}</p>}
          {driftLoading && drift.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3"><Loader2 size={13} className="animate-spin" />AD-Subnetze werden abgeglichen…</div>
          ) : drift.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Keine Daten. Erst „Liste importieren" + „Scannen", dann „Drift-Check".</p>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap mb-2 text-[11px]">
                {(['not-in-ad', 'new-in-ad', 'empty', 'active'] as DriftStatus[]).map(st => {
                  const n = drift.filter(d => d.status === st).length
                  if (!n) return null
                  const b = driftBadge(st)
                  return <span key={st} className={`px-2 py-0.5 rounded-full border ${b.cls}`}>{b.label}: {n}</span>
                })}
              </div>
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-xs">
                  <thead><tr className="bg-muted/20 text-muted-foreground">
                    <th className="text-left font-semibold px-2 py-1.5">Status</th>
                    <th className="text-left font-semibold px-2 py-1.5">Subnetz</th>
                    <th className="text-left font-semibold px-2 py-1.5">VLAN</th>
                    <th className="text-left font-semibold px-2 py-1.5">Name</th>
                    <th className="text-left font-semibold px-2 py-1.5">Geräte</th>
                    <th className="text-left font-semibold px-2 py-1.5">Hinweis</th>
                  </tr></thead>
                  <tbody>
                    {drift.map(d => {
                      const b = driftBadge(d.status)
                      return (
                        <tr key={d.cidr} className="border-t border-border/50">
                          <td className="px-2 py-1.5"><span className={`px-1.5 py-0.5 rounded-full border text-[10px] whitespace-nowrap ${b.cls}`}>{b.label}</span></td>
                          <td className="px-2 py-1.5 font-mono text-foreground whitespace-nowrap">{d.cidr}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{d.vlanId ? `VLAN ${d.vlanId}` : '—'}</td>
                          <td className="px-2 py-1.5">{d.name || '—'}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{d.deviceCount > 0 ? `${d.onlineCount}/${d.deviceCount} online` : '—'}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{d.note}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Hauptbereich: VLAN-Liste + Geräte */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_1fr]">
        {/* Links: VLAN/Subnetz-Liste */}
        <div className="border-r border-border overflow-y-auto">
          {groups.arr.length === 0 && groups.unknownCount === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Network size={36} className="mx-auto mb-2 opacity-30" />
              Noch keine Daten. „Scannen" startet einen Ping-Sweep über die Standort-Subnetze.
            </div>
          ) : (
            <div className="py-1">
              {groups.arr.map(g => (
                <button key={g.cidr} onClick={() => setSelectedCidr(g.cidr)}
                  className={`w-full text-left px-4 py-2.5 border-b border-border/40 hover:bg-accent/20 ${selectedCidr === g.cidr ? 'bg-accent/30' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {g.def?.vlanId ? <span className="text-blue-400">VLAN {g.def.vlanId}</span> : <span className="text-muted-foreground">Subnetz</span>}
                      {g.def?.name ? ` · ${g.def.name}` : ''}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{g.online}/{g.total}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] font-mono text-muted-foreground">{g.cidr}</span>
                    {g.def?.description && <span className="text-[10px] text-muted-foreground/70 truncate">{g.def.description}</span>}
                  </div>
                </button>
              ))}
              {groups.unknownCount > 0 && (
                <button onClick={() => setSelectedCidr(UNKNOWN)}
                  className={`w-full text-left px-4 py-2.5 border-b border-border/40 hover:bg-accent/20 ${selectedCidr === UNKNOWN ? 'bg-accent/30' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5"><HelpCircle size={13} className="text-amber-400" />Unbekanntes Subnetz</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{groups.unknownCount}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Geräte, deren IP zu keinem bekannten Subnetz passt</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Rechts: Geräte des gewählten VLANs */}
        <div className="flex flex-col min-h-0">
          <div className="shrink-0 border-b border-border">
            <div className="px-4 py-2.5 flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="IP, Hostname oder Benutzer filtern…"
                  className="w-full pl-7 pr-2 py-1.5 text-sm rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              </div>
              <span className="text-[11px] text-muted-foreground ml-auto">{selectedDevices.length} Gerät(e)</span>
            </div>
            {/* Gerätetyp-Check */}
            <div className="px-4 pb-2 flex items-center gap-2 flex-wrap text-[11px]">
              <span className="text-muted-foreground">Soll-Typ: {expectedType
                ? <span className="text-foreground font-medium">{DEVICE_TYPE_LABEL[expectedType]}</span>
                : <span className="text-amber-400">nicht gesetzt (in „VLAN-Zuordnung" wählen)</span>}</span>
              {expectedType && (foreignStats.foreign > 0 || foreignStats.unknown > 0) && (
                <>
                  {foreignStats.foreign > 0 && <span className="inline-flex items-center gap-1 text-red-300"><AlertTriangle size={11} />{foreignStats.foreign} Fremdgerät(e)</span>}
                  {foreignStats.unknown > 0 && <span className="text-amber-300">{foreignStats.unknown} unklar</span>}
                  <label className="inline-flex items-center gap-1 text-muted-foreground">
                    <input type="checkbox" checked={onlyForeign} onChange={e => setOnlyForeign(e.target.checked)} className="accent-primary" />nur auffällige
                  </label>
                </>
              )}
              <button onClick={runTypeProbe} disabled={probing} title="Aktiver Port-Check (9100/515/631 = Drucker · 5060 = Telefon · 3389/445 = PC) über die online-Geräte dieses VLANs"
                className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
                {probing ? <><Loader2 size={12} className="animate-spin" />prüfe {probeProg.done}/{probeProg.total}</> : <><ScanLine size={12} />Typ prüfen (Ports)</>}
              </button>
              {expectedType && (foreignStats.foreign > 0 || foreignStats.unknown > 0) && (
                <button onClick={exportForeign} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground"><Download size={12} />CSV</button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {selectedDevices.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Keine Geräte in diesem VLAN.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card border-b border-border">
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left font-semibold px-4 py-2">Status</th>
                    <th className="text-left font-semibold px-2 py-2">IP-Adresse</th>
                    <th className="text-left font-semibold px-2 py-2">Hostname</th>
                    <th className="text-left font-semibold px-2 py-2">Typ</th>
                    <th className="text-left font-semibold px-2 py-2">Angemeldet</th>
                    <th className="text-left font-semibold px-2 py-2">Quelle</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDevices.map(d => {
                    const t = typeOf(d); const st = typeStatus(d)
                    return (
                    <tr key={d.ip} className={`border-b border-border/40 hover:bg-accent/10 ${st === 'foreign' ? 'bg-red-500/5' : ''}`}>
                      <td className="px-4 py-1.5">
                        {d.online ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-green-300"><Wifi size={12} />online</span>
                        ) : d.scanned ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><WifiOff size={12} />offline</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60"><WifiOff size={12} />—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-foreground">{d.ip}</td>
                      <td className="px-2 py-1.5 text-foreground">
                        <span className="inline-flex items-center gap-1">{d.hostname || <span className="text-muted-foreground">—</span>}{d.hostname && <DeviceInfoButton hostname={d.hostname} />}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="inline-flex items-center gap-1 flex-wrap">
                          {t.type
                            ? <span title={[t.source, t.detail].filter(Boolean).join(' · ')} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${TYPE_CLS[t.type]}`}>{DEVICE_TYPE_LABEL[t.type]}</span>
                            : <span className="text-[10px] text-muted-foreground/60">unbekannt</span>}
                          {st === 'foreign' && <span title={`Erwartet: ${expectedType ? DEVICE_TYPE_LABEL[expectedType] : ''}`} className="text-[10px] px-1.5 py-0.5 rounded-full border bg-red-500/15 text-red-300 border-red-500/30 inline-flex items-center gap-0.5"><AlertTriangle size={9} />passt nicht</span>}
                          {st === 'unknown' && <span className="text-[10px] text-amber-400">prüfen</span>}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">{d.user || '—'}</td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${d.source === 'both' ? 'bg-blue-500/10 text-blue-300 border-blue-500/25' : d.source === 'inventory' ? 'bg-purple-500/10 text-purple-300 border-purple-500/25' : 'bg-muted/30 text-muted-foreground border-border'}`}>
                          {d.source === 'both' ? <><Boxes size={9} />Inventar+Scan</> : d.source === 'inventory' ? <><Boxes size={9} />Inventar</> : 'Scan'}
                        </span>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
