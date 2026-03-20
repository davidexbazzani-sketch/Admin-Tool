import { api } from '../electronAPI'
import type { DashboardConfig } from '../types/dashboard'

const PRIVATE_BASE = (username: string) => `dashboards/private/${username}`
const SHARED_BASE = 'dashboards/shared'

// ── Private dashboard CRUD ────────────────────────────────────────────────────
export async function listPrivateDashboards(username: string): Promise<DashboardConfig[]> {
  try {
    const files = await api().netListDir(PRIVATE_BASE(username))
    const jsonFiles = files.filter(f => f.endsWith('.json'))
    const results = await Promise.all(
      jsonFiles.map(f => api().netReadJson<DashboardConfig>(`${PRIVATE_BASE(username)}/${f}`))
    )
    return results.filter((d): d is DashboardConfig => d !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

export async function savePrivateDashboard(username: string, config: DashboardConfig): Promise<boolean> {
  const path = `${PRIVATE_BASE(username)}/${config.id}.json`
  // Backup before overwrite
  const existing = await api().netReadJson(`${path}`).catch(() => null)
  if (existing) {
    await api().netWriteJson(`${path}.bak`, existing).catch(() => {})
  }
  const updated = { ...config, updatedAt: new Date().toISOString() }
  return api().netWriteJson(path, updated)
}

export async function deletePrivateDashboard(username: string, id: string): Promise<boolean> {
  try {
    await api().netDeleteFile(`${PRIVATE_BASE(username)}/${id}.json`)
    await api().netDeleteFile(`${PRIVATE_BASE(username)}/${id}.json.bak`).catch(() => {})
    return true
  } catch {
    return false
  }
}

export async function loadPrivateDashboard(username: string, id: string): Promise<DashboardConfig | null> {
  return api().netReadJson<DashboardConfig>(`${PRIVATE_BASE(username)}/${id}.json`)
}

// ── Shared dashboard operations ───────────────────────────────────────────────
export async function listSharedDashboards(): Promise<DashboardConfig[]> {
  try {
    const files = await api().netListDir(SHARED_BASE)
    const jsonFiles = files.filter(f => f.endsWith('.json'))
    const results = await Promise.all(
      jsonFiles.map(f => api().netReadJson<DashboardConfig>(`${SHARED_BASE}/${f}`))
    )
    return results.filter((d): d is DashboardConfig => d !== null)
      .sort((a, b) => (b.sharedAt ?? b.updatedAt).localeCompare(a.sharedAt ?? a.updatedAt))
  } catch {
    return []
  }
}

export async function shareDashboard(username: string, config: DashboardConfig): Promise<boolean> {
  const shared: DashboardConfig = {
    ...config,
    isShared: true,
    sharedAt: new Date().toISOString(),
    sharedBy: username,
  }
  // Update private copy too
  await savePrivateDashboard(username, shared)
  // Write to shared
  return api().netWriteJson(`${SHARED_BASE}/${config.id}.json`, shared)
}

export async function unshareDashboard(username: string, config: DashboardConfig): Promise<boolean> {
  try {
    await api().netDeleteFile(`${SHARED_BASE}/${config.id}.json`)
    const unshared = { ...config, isShared: false, sharedAt: undefined }
    await savePrivateDashboard(username, unshared)
    return true
  } catch {
    return false
  }
}

export async function cloneSharedDashboard(
  username: string, displayName: string, shared: DashboardConfig
): Promise<DashboardConfig> {
  const now = new Date().toISOString()
  const clone: DashboardConfig = {
    ...shared,
    id: `dash-${Date.now()}`,
    name: `${shared.name} (Kopie)`,
    createdBy: username,
    createdByDisplay: displayName,
    createdAt: now,
    updatedAt: now,
    isShared: false,
    sharedAt: undefined,
    sharedBy: undefined,
  }
  await savePrivateDashboard(username, clone)
  return clone
}

// ── Factory: new empty dashboard ─────────────────────────────────────────────
export function createEmptyDashboard(username: string, displayName: string, name: string): DashboardConfig {
  const now = new Date().toISOString()
  return {
    id: `dash-${Date.now()}`,
    name,
    description: '',
    createdBy: username,
    createdByDisplay: displayName,
    createdAt: now,
    updatedAt: now,
    background: { color: '#0f0f1a' },
    gridEnabled: true,
    gridSize: 20,
    defaultRefreshInterval: 60,
    canvasWidth: 2400,
    canvasHeight: 1600,
    elements: [],
  }
}
