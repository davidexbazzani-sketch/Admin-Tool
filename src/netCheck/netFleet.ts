// ── Flotten-WLAN-Analyse: Aggregation + Cluster + Persistenz ─────────────────
// Baut aus vielen Einzel-Scans (NetLauf) eine Flotten-Tabelle und ermittelt den
// „gemeinsamen Nenner" der auffälligen Laptops (Adapter/Treiber/Energie/Roaming).
// Laptop-Liste aus der Endgeräte-Übersicht (Desktops haben kein WLAN).

import { api } from '../electronAPI'
import { loadDevices, classifyModel } from '../services/endpointDevices'
import { analysiere } from './analyse'
import type { NetLauf } from './types'

// Laptop (oder unbekanntes Modell → Scan filtert selbst, wenn kein WLAN-Adapter).
const istLaptop = (model: string): boolean => { const c = classifyModel(model || ''); return c === '' || c.startsWith('Laptop') }

export interface FleetRow {
  pc: string
  adapter: string          // WLAN-Adapter (ifDesc)
  driverVersion: string
  driverDate: string
  wlanSpar: string         // "AC/DC"
  turnOff: boolean | null  // Adapter abschaltbar (Energie)
  roaming: string
  uapsd: string
  disconnects: number      // 14 T.
  securityStops: number
  authFehler: number       // 802.1X (Event 11006)
  hochBefunde: number      // HOCH-Befunde (WLAN)
  fehler?: string          // Scan-Fehler / offline
}

export interface FleetRun { id: string; ranAt: string; ranBy: string; rows: FleetRow[] }
export interface FleetIndexEntry { id: string; ranAt: string; ranBy: string; pcs: number; auffaellig: number; pfad: string }

const FLEET_DIR = 'netzwerk-diagnose/fleet'
const FLEET_INDEX = `${FLEET_DIR}/index.json`

/** Laptop-Hostnamen aus der Endgeräte-Übersicht (nicht ausgemustert, dedupliziert). */
export async function laptopHosts(): Promise<string[]> {
  try {
    const devs = await loadDevices()
    const seen = new Set<string>()
    const out: string[] = []
    for (const d of devs) {
      const h = (d.hostname || '').trim()
      if (!h || d.retiredDate || !istLaptop(d.model)) continue
      const key = h.toUpperCase()
      if (seen.has(key)) continue
      seen.add(key); out.push(key)
    }
    return out
  } catch { return [] }
}

function advVal(lauf: NetLauf, rx: RegExp): string {
  const p = (lauf.daten.advanced || []).find(x => rx.test(x.name || '') || rx.test(x.keyword || ''))
  return p ? (p.value || p.regValue || '') : ''
}

export function buildFleetRow(lauf: NetLauf): FleetRow {
  const d = lauf.daten
  const ev = d.ereignisse
  const bef = lauf.ok ? analysiere(lauf) : []
  return {
    pc: lauf.pc,
    adapter: d.adapter?.ifDesc || (d.lan?.ifDesc ? '(nur LAN)' : '—'),
    driverVersion: d.adapter?.driverVersion || '',
    driverDate: d.adapter?.driverDate || '',
    wlanSpar: `${d.powercfg?.wlanAc ?? '—'}/${d.powercfg?.wlanDc ?? '—'}`,
    turnOff: d.powerMgmt?.allowTurnOff ?? null,
    roaming: advVal(lauf, /roam/i),
    uapsd: advVal(lauf, /uapsd|u-?apsd/i),
    disconnects: ev?.disconnects ?? 0,
    securityStops: ev?.securityStops ?? 0,
    authFehler: ev?.authFehler ?? 0,
    hochBefunde: bef.filter(b => b.gewicht === 'HOCH' && b.verbindung !== 'LAN').length,
    fehler: lauf.ok ? undefined : (lauf.fehler || d.fehler),
  }
}

export function buildFleetRows(laeufe: NetLauf[]): FleetRow[] {
  return laeufe.map(buildFleetRow).sort((a, b) => b.disconnects - a.disconnects || b.authFehler - a.authFehler)
}

/** „Auffällig" = viele Trennungen ODER 802.1X-Auth-Fehler ODER HOCH-Befund. */
export function istAuffaellig(r: FleetRow, discThresh = 5, authThresh = 3): boolean {
  return !r.fehler && (r.disconnects >= discThresh || r.authFehler >= authThresh || r.hochBefunde > 0)
}

export interface ClusterAttr { label: string; wert: string; anteil: number; gesamt: number }
/** Gemeinsamer Nenner der AUFFÄLLIGEN: je Attribut die häufigste Ausprägung (nur echte Cluster ≥2). */
export function fleetCluster(rows: FleetRow[]): { auffaellig: number; attrs: ClusterAttr[] } {
  const aff = rows.filter(r => istAuffaellig(r))
  const n = aff.length
  const dominant = (label: string, pick: (r: FleetRow) => string): ClusterAttr | null => {
    const counts = new Map<string, number>()
    for (const r of aff) { const v = (pick(r) || '').trim() || '—'; counts.set(v, (counts.get(v) || 0) + 1) }
    let best = ''; let bc = 0
    for (const [v, c] of counts) if (c > bc && v !== '—') { best = v; bc = c }
    return best ? { label, wert: best, anteil: bc, gesamt: n } : null
  }
  const attrs = [
    dominant('Adapter', r => r.adapter),
    dominant('Treiber', r => r.driverVersion),
    dominant('WLAN-Energiesparen (Netz/Akku)', r => r.wlanSpar),
    dominant('Adapter abschaltbar', r => r.turnOff == null ? '' : (r.turnOff ? 'ja' : 'nein')),
    dominant('Roaming', r => r.roaming),
    dominant('U-APSD', r => r.uapsd),
  ].filter((a): a is ClusterAttr => a !== null && a.anteil >= 2)
  return { auffaellig: n, attrs }
}

// ── FleetRun-Persistenz (Netzlaufwerk, für alle Nutzer) ──────────────────────
function newId(): string { return `fleet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }

export async function saveFleetRun(rows: FleetRow[], by: string): Promise<FleetRun> {
  const run: FleetRun = { id: newId(), ranAt: new Date().toISOString(), ranBy: by, rows }
  const pfad = `${FLEET_DIR}/${run.id}.json`
  try { await api().netWriteJson(pfad, run) } catch { /* egal */ }
  try {
    const idx = (await api().netReadJson<{ items: FleetIndexEntry[] }>(FLEET_INDEX))?.items ?? []
    const auff = rows.filter(r => istAuffaellig(r)).length
    const next = [{ id: run.id, ranAt: run.ranAt, ranBy: by, pcs: rows.length, auffaellig: auff, pfad }, ...idx].slice(0, 30)
    await api().netWriteJson(FLEET_INDEX, { items: next })
  } catch { /* egal */ }
  return run
}
export async function listFleetRuns(): Promise<FleetIndexEntry[]> {
  try { return (await api().netReadJson<{ items: FleetIndexEntry[] }>(FLEET_INDEX))?.items ?? [] } catch { return [] }
}
export async function loadFleetRun(pfad: string): Promise<FleetRun | null> {
  try { return await api().netReadJson<FleetRun>(pfad) } catch { return null }
}

// ── Flotten-Fix-Protokoll (Audit: was/wann/wo behoben) ───────────────────────
import type { AenderungsBericht } from './pdf'
export interface FleetFixReport { id: string; ranAt: string; ranBy: string; berichte: AenderungsBericht[] }
export interface FleetFixIndexEntry { id: string; ranAt: string; ranBy: string; pcs: number; changes: number; pfad: string }
const FLEETFIX_DIR = 'netzwerk-diagnose/fleet-fixes'
const FLEETFIX_INDEX = `${FLEETFIX_DIR}/index.json`

export function newFleetFixId(): string { return `fix_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }

export async function saveFleetFixReport(report: FleetFixReport): Promise<void> {
  const pfad = `${FLEETFIX_DIR}/${report.id}.json`
  try { await api().netWriteJson(pfad, report) } catch { /* egal */ }
  try {
    const idx = (await api().netReadJson<{ items: FleetFixIndexEntry[] }>(FLEETFIX_INDEX))?.items ?? []
    const changes = report.berichte.reduce((n, b) => n + b.ok, 0)
    const next = [{ id: report.id, ranAt: report.ranAt, ranBy: report.ranBy, pcs: report.berichte.length, changes, pfad }, ...idx].slice(0, 50)
    await api().netWriteJson(FLEETFIX_INDEX, { items: next })
  } catch { /* egal */ }
}
export async function listFleetFixReports(): Promise<FleetFixIndexEntry[]> {
  try { return (await api().netReadJson<{ items: FleetFixIndexEntry[] }>(FLEETFIX_INDEX))?.items ?? [] } catch { return [] }
}
export async function loadFleetFixReport(pfad: string): Promise<FleetFixReport | null> {
  try { return await api().netReadJson<FleetFixReport>(pfad) } catch { return null }
}
