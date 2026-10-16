// ── OT-Geräte: Datenservice ──────────────────────────────────────────────────
// PCs (mit Hostname) auf dem Hallenplan verorten. Position normiert (0..1) →
// zoomunabhängig. Zentral auf dem Netzlaufwerk gespeichert (eine kleine JSON).

import { api } from '../electronAPI'

export interface OtDevice {
  id: string
  page: number        // 1-basiert (Hallenplan hat i. d. R. 1 Seite)
  x: number           // 0..1 (normiert auf Seitenbreite)
  y: number           // 0..1 (normiert auf Seitenhöhe)
  hostname: string
  arbeitsplatz: string
  notes: string
  kind?: 'device' | 'lock'   // 'lock' = Marker „verschlossene Tür" (nur Verwaltungsgebäude); leer = Gerät
  createdBy: string
  createdAt: string   // ISO
  updatedAt: string   // ISO
  // Unlöschbarer Stempel: wer/wann das GERÄT (Hostname) in die Karte gesetzt hat.
  placedBy?: string
  placedAt?: string   // ISO
  placedVia?: 'manual' | 'refresh'   // 'refresh' = beim Geräte-Austausch (Refresh) neu gesetzt
}

interface Store { version: number; devices: OtDevice[]; updatedAt?: string }

const FILE = 'ot-devices/devices.json'

function newId(): string { return `ot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
const clamp01 = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))

function normalize(raw: unknown): OtDevice | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<OtDevice>
  const now = new Date().toISOString()
  return {
    id: typeof r.id === 'string' && r.id ? r.id : newId(),
    page: Number.isFinite(Number(r.page)) ? Math.max(1, Math.round(Number(r.page))) : 1,
    x: clamp01(Number(r.x) || 0),
    y: clamp01(Number(r.y) || 0),
    hostname: typeof r.hostname === 'string' ? r.hostname : '',
    arbeitsplatz: typeof r.arbeitsplatz === 'string' ? r.arbeitsplatz : '',
    notes: typeof r.notes === 'string' ? r.notes : '',
    createdBy: typeof r.createdBy === 'string' ? r.createdBy : '',
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : now,
    placedBy: typeof r.placedBy === 'string' ? r.placedBy : undefined,
    placedAt: typeof r.placedAt === 'string' ? r.placedAt : undefined,
    placedVia: r.placedVia === 'refresh' || r.placedVia === 'manual' ? r.placedVia : undefined,
  }
}

export async function listDevices(): Promise<OtDevice[]> {
  try {
    const s = await api().netReadJson<Store>(FILE)
    if (s && Array.isArray(s.devices)) return s.devices.map(normalize).filter((d): d is OtDevice => d !== null)
  } catch { /* leer */ }
  return []
}

async function saveAll(devices: OtDevice[]): Promise<boolean> {
  try { return await api().netWriteJson(FILE, { version: 1, devices, updatedAt: new Date().toISOString() }) }
  catch { return false }
}

export async function createDevice(data: { page: number; x: number; y: number; hostname?: string; createdBy?: string }): Promise<OtDevice> {
  const now = new Date().toISOString()
  const host = (data.hostname || '').trim()
  const d: OtDevice = {
    id: newId(), page: Math.max(1, Math.round(data.page) || 1),
    x: clamp01(data.x), y: clamp01(data.y),
    hostname: host, arbeitsplatz: '', notes: '',
    createdBy: data.createdBy || '', createdAt: now, updatedAt: now,
    ...(host ? { placedBy: data.createdBy || '', placedAt: now, placedVia: 'manual' as const } : {}),
  }
  const all = await listDevices()
  all.push(d)
  await saveAll(all)
  return d
}

export async function updateDevice(id: string, patch: Partial<Pick<OtDevice, 'hostname' | 'arbeitsplatz' | 'notes' | 'page' | 'x' | 'y'>>, opts?: { by?: string; refresh?: boolean }): Promise<boolean> {
  const all = await listDevices()
  const now = new Date().toISOString()
  const settingHost = patch.hostname != null && patch.hostname.trim() !== ''
  const next = all.map(d => {
    if (d.id !== id) return d
    const m: OtDevice = { ...d, ...patch, x: patch.x != null ? clamp01(patch.x) : d.x, y: patch.y != null ? clamp01(patch.y) : d.y, updatedAt: now }
    if (settingHost) {
      if (opts?.refresh) { m.placedBy = opts.by || d.placedBy || d.createdBy || ''; m.placedAt = now; m.placedVia = 'refresh' }
      else if (!d.placedAt) { m.placedBy = opts?.by || d.createdBy || ''; m.placedAt = now; m.placedVia = 'manual' }
    }
    return m
  })
  return saveAll(next)
}

export async function moveDevice(id: string, x: number, y: number, page?: number): Promise<boolean> {
  return updateDevice(id, { x, y, ...(page ? { page } : {}) })
}

export async function deleteDevice(id: string): Promise<boolean> {
  const all = await listDevices()
  return saveAll(all.filter(d => d.id !== id))
}

/** Hostname normalisieren (Groß, ohne Domain) für den Abgleich. */
export function canonHost(h: string): string {
  return (h || '').trim().toUpperCase().replace(/\s+/g, '').split('.')[0]
}

/** OT-Gerät zu einem Hostnamen finden (für die „Standort"-Zeile im Geräte-Dossier). */
export async function findDeviceByHostname(hostname: string): Promise<OtDevice | null> {
  const h = canonHost(hostname)
  if (!h) return null
  const all = await listDevices()
  return all.find(d => canonHost(d.hostname) === h) ?? null
}

export function searchDevices(list: OtDevice[], q: string): OtDevice[] {
  const s = q.trim().toLowerCase()
  if (!s) return list
  return list.filter(d => d.hostname.toLowerCase().includes(s) || d.arbeitsplatz.toLowerCase().includes(s) || d.notes.toLowerCase().includes(s))
}
