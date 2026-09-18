// ── Generische Karten-Schicht über die drei Standort-Karten ──────────────────
// OT-Geräte, Prüffeld & Zoll, Verwaltungsgebäude sind Klone mit gleichem OtDevice-
// Modell (Identifier = hostname). Dieses Modul behandelt sie einheitlich:
//  • findDeviceLocation(hostname/serial) → auf welcher Karte + wo (fürs Geräte-„i")
//  • moveDeviceOnAllMaps(alt, neu)       → Refresh-Umzug über ALLE drei Karten
import * as ot from './otDevices'
import * as pz from './pruffeldZoll'
import * as vg from './verwaltungsgebaeude'
import { serialFromHostname } from './deviceMasterData'
import { normalizeSerial } from './hardwareInventory'
import { loadDevices as loadEndpointDevices } from './endpointDevices'
import type { OtDevice } from './otDevices'
import type { Screen } from '../types'

export interface MapSvc {
  listDevices(): Promise<OtDevice[]>
  updateDevice(id: string, patch: Partial<Pick<OtDevice, 'hostname' | 'arbeitsplatz' | 'notes' | 'page' | 'x' | 'y'>>): Promise<boolean>
  createDevice(d: { page: number; x: number; y: number; hostname?: string; createdBy?: string }): Promise<OtDevice>
  canonHost(h: string): string
}
export interface MapDef { id: Screen; label: string; roomLabel: string; svc: MapSvc }

export const DEVICE_MAPS: MapDef[] = [
  { id: 'ot-devices', label: 'OT-Geräte / Halle', roomLabel: 'Arbeitsplatz', svc: ot },
  { id: 'pruffeld-zoll', label: 'Prüffeld & Zoll', roomLabel: 'Arbeitsplatz', svc: pz },
  { id: 'verwaltungsgebaeude', label: 'Verwaltungsgebäude', roomLabel: 'Raumnummer', svc: vg },
]
export function mapById(id: Screen): MapDef | undefined { return DEVICE_MAPS.find(m => m.id === id) }

// ── Standort eines Geräts finden (erste Fundstelle über alle Karten) ─────────
export interface FoundLocation { mapId: Screen; label: string; roomLabel: string; device: OtDevice }
export async function findDeviceLocation(hostname: string, serial?: string): Promise<FoundLocation | null> {
  const wantHost = (hostname || '').trim()
  const wantSer = normalizeSerial(serial || serialFromHostname(hostname) || '')
  for (const m of DEVICE_MAPS) {
    const ch = m.svc.canonHost(wantHost)
    const list = await m.svc.listDevices()
    const hit = (ch ? list.find(d => m.svc.canonHost(d.hostname) === ch) : undefined)
      ?? (wantSer ? list.find(d => normalizeSerial(serialFromHostname(d.hostname) || '') === wantSer) : undefined)
    if (hit) return { mapId: m.id, label: m.label, roomLabel: m.roomLabel, device: hit }
  }
  return null
}

// ── Refresh-Umzug: Altgerät → Neugerät auf allen Karten (Position bleibt) ────
function istHostname(s: string): boolean { return /^(DEHAM|DESCH|DE)[A-Z0-9]/.test((s || '').trim().toUpperCase().replace(/\s+/g, '')) }
function serialOf(v: string): string { return istHostname(v) ? serialFromHostname(v) : normalizeSerial(v) }

export interface MapMoveResult { mapId: Screen; label: string; entries: { alt: string; neu: string; arbeitsplatz: string }[] }

/** Altgerät (Serial/Hostname) durch das Neugerät ersetzen — auf ALLEN drei Karten. Idempotent. */
export async function moveDeviceOnAllMaps(oldDeviceId: string, newDeviceSerial: string): Promise<MapMoveResult[]> {
  const oldId = (oldDeviceId || '').trim()
  const newRaw = (newDeviceSerial || '').trim()
  if (!oldId || !newRaw) return []
  const oldSer = serialOf(oldId)
  const out: MapMoveResult[] = []
  for (const m of DEVICE_MAPS) {
    const canon = m.svc.canonHost
    const all = await m.svc.listDevices()
    const entries: { alt: string; neu: string; arbeitsplatz: string }[] = []
    for (const d of all) {
      const markerSer = serialFromHostname(d.hostname) || canon(d.hostname)
      const matchBySerial = !!(oldSer && markerSer && oldSer === markerSer)
      const matchByHost = canon(d.hostname) === canon(oldId)
      if (!matchBySerial && !matchByHost) continue
      // Neue Geräte heißen IMMER „DE" + Seriennummer (das alte Präfix, z. B. DEHAM, wird NICHT übernommen).
      const newSer = serialOf(newRaw)
      if (!newSer) continue
      const newHost = 'DE' + newSer
      if (canon(newHost) === canon(d.hostname)) continue
      const ok = await m.svc.updateDevice(d.id, { hostname: newHost })
      if (ok) entries.push({ alt: d.hostname, neu: newHost, arbeitsplatz: d.arbeitsplatz })
    }
    if (entries.length) out.push({ mapId: m.id, label: m.label, entries })
  }
  return out
}

// ── Endgeräte-Status je Marker (für die rote Markierung „nicht in use") ──────
/** Nur „in use" gilt als aktiv im Einsatz; alles andere (missing, in stock, retired, …) nicht. */
export function isDeviceInUse(state: string): boolean {
  const s = (state || '').trim().toLowerCase()
  return s === 'in use' || s === 'in-use' || s === 'inuse'
}
/**
 * Lädt die Endgeräte-Liste EINMAL und liefert eine Funktion hostname → Status
 * ('' = kein Endgeräte-Eintrag/unbekannt). Abgleich Host-zuerst, dann Serial.
 */
export async function loadEndpointStatusLookup(): Promise<(hostname: string) => string> {
  const byHost = new Map<string, string>()
  const bySerial = new Map<string, string>()
  try {
    const devs = await loadEndpointDevices()
    for (const d of devs) {
      const h = ot.canonHost(d.hostname); if (h && !byHost.has(h)) byHost.set(h, d.state || '')
      const s = normalizeSerial(d.serial); if (s && !bySerial.has(s)) bySerial.set(s, d.state || '')
    }
  } catch { /* leer → alles unbekannt */ }
  return (hostname: string) => {
    const h = ot.canonHost(hostname)
    if (byHost.has(h)) return byHost.get(h) || ''
    const s = normalizeSerial(serialFromHostname(hostname) || '')
    return (s && bySerial.get(s)) || ''
  }
}
