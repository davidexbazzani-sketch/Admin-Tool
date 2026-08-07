// ── Kiosk-Verwaltung: geteilte Meta (Name/Notiz) + persoenliche Zuweisung ─────
// - Geteilt (fuer ALLE Admins gleich): pro Kiosk ein uebergeordneter Name + Notiz
//     Speicher: config/presentation/kiosk_meta.json
// - Persoenlich (pro Admin): welche Kioske "verwaltet" er (nur Fokus/Filter)
//     Speicher: config/presentation/kiosk_assignments/<username>.json
//
// Schluessel je Kiosk = Windows-Username (lowercase), identisch zu presentationClients.

import { api } from '../electronAPI'

export interface KioskMeta {
  friendlyName?: string
  note?: string
  updatedAt?: string
  updatedBy?: string
}

interface KioskMetaFile { version: number; items: Record<string, KioskMeta> }

const META_FILE = 'config/presentation/kiosk_meta.json'
const ASSIGN_FILE = (u: string) => `config/presentation/kiosk_assignments/${(u || '').toLowerCase().replace(/[^a-z0-9._-]/g, '_')}.json`

function keyOf(username: string): string { return (username || '').toLowerCase() }

export async function loadKioskMeta(): Promise<Record<string, KioskMeta>> {
  try {
    const d = await api().netReadJson<KioskMetaFile>(META_FILE)
    if (d && d.items && typeof d.items === 'object') return d.items
  } catch { /* leer */ }
  return {}
}

export async function setKioskMeta(username: string, patch: Partial<KioskMeta>, by: string): Promise<boolean> {
  const items = await loadKioskMeta()
  const k = keyOf(username)
  items[k] = { ...items[k], ...patch, updatedAt: new Date().toISOString(), updatedBy: by }
  try { return await api().netWriteJson(META_FILE, { version: 1, items } satisfies KioskMetaFile) } catch { return false }
}

/** Anzeigename eines Kiosks: uebergeordneter Name (falls gesetzt), sonst der Fallback. */
export function kioskDisplayName(username: string, meta: Record<string, KioskMeta>, fallback: string): string {
  const m = meta[keyOf(username)]
  return (m?.friendlyName && m.friendlyName.trim()) || fallback
}

// ── Persoenliche Zuweisung ("Meine Kioske") ──────────────────────────────────

interface AssignFile { username: string; kiosks: string[] }

export async function loadMyKiosks(username: string): Promise<Set<string>> {
  try {
    const d = await api().netReadJson<AssignFile>(ASSIGN_FILE(username))
    if (d && Array.isArray(d.kiosks)) return new Set(d.kiosks.map(keyOf))
  } catch { /* leer */ }
  return new Set()
}

export async function toggleMyKiosk(username: string, kioskUsername: string): Promise<Set<string>> {
  const set = await loadMyKiosks(username)
  const k = keyOf(kioskUsername)
  if (set.has(k)) set.delete(k); else set.add(k)
  try { await api().netWriteJson(ASSIGN_FILE(username), { username: keyOf(username), kiosks: [...set] } satisfies AssignFile) } catch { /* best effort */ }
  return set
}
