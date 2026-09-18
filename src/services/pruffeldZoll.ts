// ── Prüffeld & Zoll: Datenservice ────────────────────────────────────────────
// Wie OT-Geräte (otDevices.ts), nur mit EIGENER Ablage/Datei und eigenem Lageplan
// (Halle 1–11, Gesamtübersicht). Geräte werden auf dem Plan verortet (Position
// normiert 0..1 → zoomunabhängig), zentral auf dem Netzlaufwerk gespeichert.
// Typ, Suche und Hostname-Normalisierung werden aus otDevices wiederverwendet.

import { api } from '../electronAPI'
import type { OtDevice } from './otDevices'

export type { OtDevice } from './otDevices'
export { searchDevices, canonHost } from './otDevices'

interface Store { version: number; devices: OtDevice[]; updatedAt?: string }

const FILE = 'pruffeld-zoll/devices.json'

function newId(): string { return `pz_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
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
  const d: OtDevice = {
    id: newId(), page: Math.max(1, Math.round(data.page) || 1),
    x: clamp01(data.x), y: clamp01(data.y),
    hostname: (data.hostname || '').trim(), arbeitsplatz: '', notes: '',
    createdBy: data.createdBy || '', createdAt: now, updatedAt: now,
  }
  const all = await listDevices()
  all.push(d)
  await saveAll(all)
  return d
}

export async function updateDevice(id: string, patch: Partial<Pick<OtDevice, 'hostname' | 'arbeitsplatz' | 'notes' | 'page' | 'x' | 'y'>>): Promise<boolean> {
  const all = await listDevices()
  const next = all.map(d => d.id === id
    ? { ...d, ...patch, x: patch.x != null ? clamp01(patch.x) : d.x, y: patch.y != null ? clamp01(patch.y) : d.y, updatedAt: new Date().toISOString() }
    : d)
  return saveAll(next)
}

export async function moveDevice(id: string, x: number, y: number, page?: number): Promise<boolean> {
  return updateDevice(id, { x, y, ...(page ? { page } : {}) })
}

export async function deleteDevice(id: string): Promise<boolean> {
  const all = await listDevices()
  return saveAll(all.filter(d => d.id !== id))
}
