// ── Verloren gemeldete Geräte ─────────────────────────────────────────────────
// Zentrale Liste aller als "verloren" gemeldeten Seriennummern + eine getrennte
// Liste der "wieder aufgefundenen" Geräte (inkl. Fundort-Info). Zentral auf dem
// Netzlaufwerk, damit alle Benutzer denselben Stand sehen.
//
// Layout: hardware-inventory/lost-devices.json  → { lost[], recovered[] }

import { api } from '../electronAPI'
import { normalizeSerial } from './hardwareInventory'

export interface LostDevice {
  serial: string          // normalisiert UPPERCASE
  deviceType?: string
  comment?: string
  source: string          // Herkunft: Dateiname des Imports oder "Manuell"
  note?: string
  addedAt: string
  addedBy: string
}

export interface RecoveredDevice extends LostDevice {
  foundAt: string
  foundBy: string
  foundLocation: string   // wo/wie wurde es gefunden (Freitext)
  foundVia: 'manuell' | 'inventur'
}

interface LostFile { version: number; lost: LostDevice[]; recovered: RecoveredDevice[] }

const FILE = 'hardware-inventory/lost-devices.json'
const ERR_NET = 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.'

async function load(): Promise<LostFile> {
  try {
    const d = await api().netReadJson<LostFile>(FILE)
    if (d && Array.isArray(d.lost) && Array.isArray(d.recovered)) return d
  } catch { /* leer */ }
  return { version: 1, lost: [], recovered: [] }
}
async function save(d: LostFile): Promise<boolean> {
  try { return await api().netWriteJson(FILE, d) } catch { return false }
}

export async function loadLostData(): Promise<{ lost: LostDevice[]; recovered: RecoveredDevice[] }> {
  const d = await load()
  // neueste zuerst
  const lost = [...d.lost].sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''))
  const recovered = [...d.recovered].sort((a, b) => (b.foundAt || '').localeCompare(a.foundAt || ''))
  return { lost, recovered }
}

/** Set aller aktuell als verloren markierten Seriennummern (fuer den Inventur-Abgleich). */
export async function loadLostSerialSet(): Promise<Set<string>> {
  const d = await load()
  return new Set(d.lost.map(x => x.serial))
}

export interface AddLostInput { serial: string; deviceType?: string; comment?: string }

/**
 * Seriennummern zur Verlust-Liste hinzufuegen. Bereits vorhandene (schon als
 * verloren gemeldete) werden uebersprungen. Liefert added/skipped zurueck.
 */
export async function addLostSerials(
  items: AddLostInput[], source: string, by: string, note?: string,
): Promise<{ ok: boolean; added: number; skipped: number; error?: string }> {
  const d = await load()
  const existing = new Set(d.lost.map(x => x.serial))
  let added = 0, skipped = 0
  const now = new Date().toISOString()
  for (const it of items) {
    const serial = normalizeSerial(it.serial)
    if (!serial) continue
    if (existing.has(serial)) { skipped++; continue }
    existing.add(serial)
    d.lost.push({
      serial,
      deviceType: (it.deviceType || '').trim() || undefined,
      comment: (it.comment || '').trim() || undefined,
      source,
      note: (note || '').trim() || undefined,
      addedAt: now, addedBy: by,
    })
    added++
  }
  const ok = await save(d)
  return ok ? { ok: true, added, skipped } : { ok: false, added: 0, skipped: 0, error: ERR_NET }
}

/** Gerät als wieder aufgefunden markieren -> von "lost" nach "recovered" verschieben. */
export async function markRecovered(
  serial: string, location: string, by: string, via: 'manuell' | 'inventur',
): Promise<{ ok: boolean; error?: string }> {
  const norm = normalizeSerial(serial)
  const d = await load()
  const idx = d.lost.findIndex(x => x.serial === norm)
  if (idx < 0) return { ok: false, error: 'Seriennummer ist nicht (mehr) in der Verlust-Liste.' }
  const [dev] = d.lost.splice(idx, 1)
  d.recovered.unshift({
    ...dev,
    foundAt: new Date().toISOString(),
    foundBy: by,
    foundLocation: (location || '').trim(),
    foundVia: via,
  })
  const ok = await save(d)
  return ok ? { ok: true } : { ok: false, error: ERR_NET }
}

export async function removeLost(serial: string): Promise<boolean> {
  const norm = normalizeSerial(serial)
  const d = await load()
  const before = d.lost.length
  d.lost = d.lost.filter(x => x.serial !== norm)
  if (d.lost.length === before) return false
  return save(d)
}

export async function removeRecovered(serial: string): Promise<boolean> {
  const norm = normalizeSerial(serial)
  const d = await load()
  const before = d.recovered.length
  d.recovered = d.recovered.filter(x => x.serial !== norm)
  if (d.recovered.length === before) return false
  return save(d)
}
