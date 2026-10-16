// ── Software-Inventar → „Software suchen" ─────────────────────────────────────
// Aus den gespeicherten Software-Scans (software_inventar/scan_data.json) einen Index
// „Software → PCs" bauen und für die gewählte(n) Software je PC zusammenführen:
//   Hostname · Corp-ID des zugewiesenen Users · Vorname Name · Modell · Kommentar · Standort
// Quellen: Endgeräte-Übersicht (Zuweisung, Modell, Kommentar), Inventar (Corp-ID, per AD
// aufgelöst), Live-AD als Ersatz für fehlende Corp-IDs, die drei Standort-Karten.

import { loadPersistent } from './softwareInventoryScan'
import { loadDevices as loadEndpointDevices, type EndpointDevice } from './endpointDevices'
import { loadLocationLookup, type LocationHit } from './deviceMaps'
import { serialFromHostname } from './deviceMasterData'
import { batchAdLookup } from './adUserLookup'
import { api } from '../electronAPI'
import type { InventoryItem } from '../types/auth'

export interface SoftwareTreffer {
  key: string               // DisplayName klein/getrimmt
  name: string
  publisher: string
  versionen: string[]
  pcs: { hostname: string; version: string }[]
}

export interface SoftwareIndex { eintraege: SoftwareTreffer[]; pcAnzahl: number; stand?: string }

export interface SucheZeile {
  hostname: string
  serial: string
  /** Gefundene Software mit Version (bei Mehrfachauswahl mehrere, kommagetrennt). */
  software: string
  corpId: string
  name: string              // Vorname Nachname
  modell: string
  kommentar: string
  standort: LocationHit | null
}

export function hostKey(h: string): string {
  return (h || '').trim().split('.')[0].toUpperCase()
}

/** „Nachname, Vorname" → „Vorname Nachname" (sonst unverändert). */
export function vornameName(s: string): string {
  const t = (s || '').trim()
  if (!t.includes(',')) return t
  const [nach, vor] = t.split(',', 2).map(x => x.trim())
  return vor ? `${vor} ${nach}` : nach
}

export async function ladeSoftwareIndex(): Promise<SoftwareIndex> {
  const data = await loadPersistent()
  const m = new Map<string, SoftwareTreffer>()
  let pcAnzahl = 0
  for (const pc of data?.scannedPCs ?? []) {
    if (!pc.software?.length) continue
    pcAnzahl++
    const gesehen = new Set<string>()
    for (const sw of pc.software) {
      const name = (sw.DisplayName || '').trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (gesehen.has(key)) continue
      gesehen.add(key)
      let t = m.get(key)
      if (!t) { t = { key, name, publisher: (sw.Publisher || '').trim(), versionen: [], pcs: [] }; m.set(key, t) }
      const v = (sw.DisplayVersion || '').trim()
      if (v && !t.versionen.includes(v)) t.versionen.push(v)
      t.pcs.push({ hostname: pc.hostname, version: v })
    }
  }
  const eintraege = [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }))
  return { eintraege, pcAnzahl, stand: data?.lastUpdated }
}

/** Ergebniszeilen je PC für die gewählte Software (ohne AD — das macht ergaenzeCorpIds). */
export async function baueErgebnis(gewaehlt: SoftwareTreffer[]): Promise<SucheZeile[]> {
  const [endpoints, inventar, standortVon] = await Promise.all([
    loadEndpointDevices().catch(() => [] as EndpointDevice[]),
    api().netReadJson<InventoryItem[]>('inventory/inventory.json').catch(() => null),
    loadLocationLookup().catch(() => () => null),
  ])
  const epHost = new Map<string, EndpointDevice>()
  const epSer = new Map<string, EndpointDevice>()
  for (const d of endpoints) {
    if (d.hostname) epHost.set(hostKey(d.hostname), d)
    if (d.serial) epSer.set(d.serial.trim().toUpperCase(), d)
  }
  const inv = new Map<string, InventoryItem>()
  for (const i of Array.isArray(inventar) ? inventar : []) if (i?.name) inv.set(hostKey(i.name), i)

  const proPc = new Map<string, { hostname: string; software: string[] }>()
  for (const t of gewaehlt) for (const p of t.pcs) {
    const k = hostKey(p.hostname)
    if (!proPc.has(k)) proPc.set(k, { hostname: p.hostname, software: [] })
    proPc.get(k)!.software.push(p.version ? `${t.name} ${p.version}` : t.name)
  }

  const zeilen: SucheZeile[] = []
  for (const [k, pc] of proPc) {
    const serial = serialFromHostname(pc.hostname)
    const ep = epHost.get(k) ?? (serial ? epSer.get(serial) : undefined)
    const it = inv.get(k)
    const zugewiesen = ep?.assignedTo || it?.assignedTo || ''
    zeilen.push({
      hostname: pc.hostname,
      serial: ep?.serial || serial,
      software: pc.software.join(', '),
      corpId: it?.corpId || '',
      name: vornameName(zugewiesen),
      modell: ep?.model || it?.model || '',
      kommentar: ep?.comments || '',
      standort: standortVon(pc.hostname, ep?.serial || serial),
    })
  }
  return zeilen.sort((a, b) => a.hostname.localeCompare(b.hostname, 'de', { numeric: true }))
}

/** Fehlende Corp-IDs live aus dem AD holen (über den Namen des zugewiesenen Users). */
export async function ergaenzeCorpIds(zeilen: SucheZeile[], onProgress?: (d: number, t: number) => void): Promise<SucheZeile[]> {
  const offen = [...new Set(zeilen.filter(z => !z.corpId && z.name).map(z => z.name))]
  if (!offen.length) return zeilen
  // Beide Schreibweisen probieren (AD-DisplayName ist teils „Nachname, Vorname")
  const varianten = (n: string) => { const p = n.split(/\s+/); return p.length >= 2 ? [n, `${p.slice(1).join(' ')}, ${p[0]}`] : [n] }
  const res = await batchAdLookup(offen.flatMap(varianten), onProgress)
  const sam = (n: string) => varianten(n).map(v => res.get(v)).find(r => r?.found && r.sam)?.sam || ''
  return zeilen.map(z => (!z.corpId && z.name ? { ...z, corpId: sam(z.name) } : z))
}
