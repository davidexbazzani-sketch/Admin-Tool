// ── Kritische Geräte (Tag-Store) ─────────────────────────────────────────────
// Markiert Geräte als „kritisch" (Rückhol-Watchlist): v. a. Geräte, die einem
// ausgetretenen Mitarbeiter noch zugewiesen sind und (noch) keinen Standort auf
// einer der 3 Karten haben. Ein Gerät wird automatisch getaggt (reconcile) und
// wieder freigegeben, sobald sein Standort in einer Karte eingetragen ist;
// zusätzlich kann Davide es manuell enttaggen. Zentrale Ablage device-tags/tags.json.

import { api } from '../electronAPI'
import { serialFromHostname } from './deviceMasterData'
import { normalizeSerial } from './hardwareInventory'
import { deviceKey } from './deviceDossier'
import { listDepartures, daysUntil } from './employees'
import { loadDevices, type EndpointDevice } from './endpointDevices'
import { devicesForName } from './departureDevices'
import { DEVICE_MAPS } from './deviceMaps'

const TAGS_FILE = 'device-tags/tags.json'

export interface CriticalEntry {
  key: string
  hostname?: string
  serial?: string
  model?: string
  assignedTo?: string
  note?: string
  source: 'auto' | 'manual'
  by: string
  at: string
  status: 'active' | 'cleared'
  clearedBy?: string
  clearedAt?: string
  clearReason?: string
}
interface TagsStore { version: number; devices: Record<string, CriticalEntry>; updatedAt?: string; updatedBy?: string }

/** Stabiler Schlüssel je Gerät — SERIAL-first (damit Hostname- und Serial-Sichten dasselbe Gerät treffen). */
export function tagKey(hostname?: string, serial?: string): string {
  const s = normalizeSerial(serial || '') || serialFromHostname(hostname || '')
  if (s) return 's:' + s.toUpperCase()
  const h = hostname ? deviceKey(hostname) : ''
  return h ? 'h:' + h : ''
}

let chain: Promise<unknown> = Promise.resolve()
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn)
  chain = next.then(() => {}, () => {})
  return next
}

export async function loadTags(): Promise<TagsStore> {
  try {
    const s = await api().netReadJson<TagsStore>(TAGS_FILE)
    if (s && s.devices && typeof s.devices === 'object') return { version: 1, devices: s.devices, updatedAt: s.updatedAt, updatedBy: s.updatedBy }
  } catch { /* noch keiner */ }
  return { version: 1, devices: {} }
}
async function saveTags(store: TagsStore, by: string): Promise<boolean> {
  try { return await api().netWriteJson(TAGS_FILE, { ...store, version: 1, updatedAt: new Date().toISOString(), updatedBy: by }) } catch { return false }
}

export async function getEntry(hostname?: string, serial?: string): Promise<CriticalEntry | undefined> {
  const k = tagKey(hostname, serial); if (!k) return undefined
  return (await loadTags()).devices[k]
}

/** Gerät als kritisch markieren (aktivieren). Auto-Quelle reaktiviert NIE ein von Davide freigegebenes Gerät. */
export async function setCritical(dev: { hostname?: string; serial?: string; model?: string; assignedTo?: string }, note: string, by: string, source: 'auto' | 'manual'): Promise<boolean> {
  const k = tagKey(dev.hostname, dev.serial); if (!k) return false
  return withLock(async () => {
    const store = await loadTags()
    const prev = store.devices[k]
    if (prev && prev.status === 'cleared' && source === 'auto') return true  // freigegeben bleibt freigegeben (nur manuell erneut taggen)
    const keepActive = prev && prev.status === 'active'
    store.devices[k] = {
      key: k,
      hostname: dev.hostname || prev?.hostname,
      serial: dev.serial || prev?.serial,
      model: dev.model || prev?.model,
      assignedTo: dev.assignedTo ?? prev?.assignedTo,
      note: note || prev?.note || '',
      source: keepActive ? prev!.source : source,
      by: keepActive ? prev!.by : by,
      at: keepActive ? prev!.at : new Date().toISOString(),
      status: 'active',
    }
    return saveTags(store, by)
  })
}

/** Gerät freigeben (enttaggen). `by`='system' bei Auto-Freigabe (Standort auf Karte). */
export async function clearCritical(key: string, by: string, reason?: string): Promise<boolean> {
  return withLock(async () => {
    const store = await loadTags()
    const e = store.devices[key]; if (!e) return false
    store.devices[key] = { ...e, status: 'cleared', clearedBy: by, clearedAt: new Date().toISOString(), clearReason: reason }
    return saveTags(store, by)
  })
}

export async function listActive(): Promise<CriticalEntry[]> {
  const store = await loadTags()
  return Object.values(store.devices).filter(e => e.status === 'active').sort((a, b) => (b.at || '').localeCompare(a.at || ''))
}

// ── Karten-Präsenz (einmal alle 3 Karten laden → schneller Set-Check) ────────
async function loadMapKeySet(): Promise<Set<string>> {
  const set = new Set<string>()
  for (const m of DEVICE_MAPS) {
    const list = await m.svc.listDevices().catch(() => [])
    for (const d of list) {
      const h = (d.hostname || '').trim(); if (!h) continue
      const s = serialFromHostname(h); if (s) set.add('s:' + s.toUpperCase())
      const hk = deviceKey(h); if (hk) set.add('h:' + hk)
    }
  }
  return set
}
function onMap(set: Set<string>, hostname?: string, serial?: string): boolean {
  const s = normalizeSerial(serial || '') || serialFromHostname(hostname || '')
  if (s && set.has('s:' + s.toUpperCase())) return true
  const h = hostname ? deviceKey(hostname) : ''
  return !!h && set.has('h:' + h)
}

/**
 * Abgleich: ALLE noch zugewiesenen Austritts-Geräte (jeder Typ) ohne Karten-Standort
 * werden aktiv getaggt; aktive Einträge, deren Gerät jetzt auf einer Karte steht,
 * werden auto-freigegeben. Idempotent; von Davide freigegebene Geräte bleiben freigegeben.
 */
export async function reconcileCriticalDevices(by: string): Promise<{ added: number; cleared: number }> {
  let added = 0, cleared = 0
  try {
    const [departures, devices, mapSet] = await Promise.all([
      listDepartures().catch(() => []),
      loadDevices().catch(() => [] as EndpointDevice[]),
      loadMapKeySet(),
    ])
    // 1) ADD
    const store0 = await loadTags()
    const seen = new Set<string>()
    for (const dep of departures) {
      if (!(daysUntil(dep.exitDate) < 0)) continue    // NUR bereits ausgetretene MA (Austritt „erfolgt")
      for (const d of devicesForName(dep.name, dep.globalId, devices)) {
        // KEIN Typ-/Status-Filter — auch „Retired" wird ganz normal mit-getaggt (kein isActiveAssignment,
        // da retiredDate=Leasingende/Zukunft alle Leasing-Geräte fälschlich ausschlösse).
        const k = tagKey(d.hostname, d.serial); if (!k || seen.has(k)) continue
        seen.add(k)
        if (store0.devices[k]) continue                 // bereits getaggt/freigegeben
        if (onMap(mapSet, d.hostname, d.serial)) continue // hat Karten-Standort → nicht kritisch
        const ok = await setCritical(
          { hostname: d.hostname, serial: d.serial, model: d.model, assignedTo: d.assignedTo },
          `Ausgetretener MA „${dep.name}": Gerät noch zugewiesen${d.state ? ` (${d.state})` : ''}, kein Karten-Standort`,
          by, 'auto',
        )
        if (ok) added++
      }
    }
    // 2) CLEAR: NUR automatisch getaggte Geräte werden durch Karten-Standort freigegeben.
    //    Manuell markierte bleiben kritisch, bis Davide sie freigibt.
    const store1 = await loadTags()
    for (const e of Object.values(store1.devices)) {
      if (e.status !== 'active' || e.source !== 'auto') continue
      if (onMap(mapSet, e.hostname, e.serial)) { await clearCritical(e.key, 'system', 'Standort auf Karte eingetragen'); cleared++ }
    }
  } catch { /* best effort */ }
  return { added, cleared }
}
