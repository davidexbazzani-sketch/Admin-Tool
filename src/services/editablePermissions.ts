// ── Editable Permissions Catalog Service ──────────────────────────────────────
// Manages the permissions catalog as editable JSON on network share.

import { api } from '../electronAPI'
import { PERMISSIONS, type PermissionEntry } from '../data/infraMarineData'

const CATALOG_PATH = 'config/berechtigungen_beantragen/permissions_catalog.json'
const HISTORY_PATH = 'config/berechtigungen_beantragen/permissions_history.json'

export interface PermCatalogEntry {
  id: string
  name: string
  adGroupName: string | null
  snowLabel: string | null
  snowUrl: string | null
  section: 'standard' | 'homeoffice'
  notes?: string
  active: boolean
}

export interface PermissionsCatalog {
  version: number
  lastModified: string
  modifiedBy: string
  comment: string
  entries: PermCatalogEntry[]
}

export interface PermHistoryEntry {
  timestamp: string
  user: string
  action: string
  detail: string
}

function permToEditable(p: PermissionEntry): PermCatalogEntry {
  return {
    id: p.id,
    name: p.name,
    adGroupName: p.adGroupName,
    snowLabel: p.snowLabel,
    snowUrl: p.snowUrl,
    section: p.section,
    notes: p.notes,
    active: true,
  }
}

export function buildDefaultCatalog(): PermissionsCatalog {
  return {
    version: 1,
    lastModified: new Date().toISOString(),
    modifiedBy: 'system',
    comment: 'Initial migration from hardcoded data',
    entries: PERMISSIONS.map(permToEditable),
  }
}

/** Bis 11.11.2026 stand bei „Remote Access to Drive I:“ fälschlich der Fileshare-Antrag (der ist für Abteilungsordner). */
function berichtige(c: PermissionsCatalog): PermissionsCatalog {
  const soll = PERMISSIONS.find(p => p.id === 'perm-ho-laufwerk-i')
  for (const e of c.entries) {
    if (e.id === 'perm-ho-laufwerk-i' && soll && /fileshare access request/i.test(e.snowLabel || '')) { e.snowLabel = soll.snowLabel; e.snowUrl = soll.snowUrl }
  }
  return c
}

export async function loadCatalog(): Promise<PermissionsCatalog> {
  try {
    const data = await api().netReadJson<PermissionsCatalog>(CATALOG_PATH)
    if (data && Array.isArray(data.entries)) return berichtige(data)
  } catch { /* fallback */ }
  const defaults = buildDefaultCatalog()
  try { await api().netWriteJson(CATALOG_PATH, defaults) } catch { /* ok */ }
  return defaults
}

export async function saveCatalog(catalog: PermissionsCatalog, user: string): Promise<{ success: boolean; error?: string }> {
  catalog.lastModified = new Date().toISOString()
  catalog.modifiedBy = user
  try {
    await api().netWriteJson(CATALOG_PATH, catalog)
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function addPermHistoryEntry(entry: PermHistoryEntry): Promise<void> {
  try {
    const existing = await api().netReadJson<PermHistoryEntry[]>(HISTORY_PATH) || []
    existing.unshift(entry)
    await api().netWriteJson(HISTORY_PATH, existing.slice(0, 200))
  } catch { /* ok */ }
}
