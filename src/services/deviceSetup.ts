// ── Geräte-Einrichtung: Zustand + Auto-Pull für Refresh-Geräte ────────────────
// Persistiert je Checkliste (Netzlaufwerk), welche Drucker vom Altgerät ermittelt
// wurden und ob die Explorer-Schnellzugriff-Datei (AutomaticDestinations) auf dem
// Netzlaufwerk zwischengespeichert bzw. schon aufs Neugerät übertragen ist. Das Tool
// zieht diese Infos für Refresh-Geräte selbstständig (best-effort). Die QA-Datei wird
// nach dem Übertragen wieder vom Netz gelöscht ([[refresh_migration_feature]]).

import { api } from '../electronAPI'
import { readOldPrinters, readOldPrintersLive, stageOldQuickAccess, type MigrationPrinter } from './refreshMigration'
import { getNetworkDrives, type NetDrive } from './migrationOps'
import { checkReachability } from './onboardingDeploy'

const STATE_FILE = 'device_setup/state.json'

export interface DeviceSetupItem {
  printers: MigrationPrinter[]
  printersFrom: 'scan' | 'live' | ''
  quickAccessStaged: boolean
  quickAccessApplied: boolean
  networkDrives?: NetDrive[]         // vom Altgerät gescannte Netzlaufwerke (einmalig, dann gecacht)
  networkDrivesAt?: string           // Zeitpunkt der erfolgreichen (nicht-leeren) Erfassung
  networkDrivesTriedAt?: string      // letzter Scan-Versuch (Tages-Drossel, ~12:00)
  networkDrivesApplied?: boolean     // als .bat aufs Neugerät gelegt
  updatedAt: string
}
interface StateFile { version: number; items: Record<string, DeviceSetupItem> }

function emptyItem(): DeviceSetupItem {
  return { printers: [], printersFrom: '', quickAccessStaged: false, quickAccessApplied: false, updatedAt: '' }
}

/** Gleicher Kalendertag (lokal) — für die Tages-Drossel des Netzlaufwerk-Scans. */
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export async function loadDeviceSetupState(): Promise<Record<string, DeviceSetupItem>> {
  try {
    const d = await api().netReadJson<StateFile>(STATE_FILE)
    if (d && d.items && typeof d.items === 'object') return d.items
  } catch { /* noch keiner */ }
  return {}
}
async function saveDeviceSetupState(items: Record<string, DeviceSetupItem>): Promise<boolean> {
  try { return await api().netWriteJson(STATE_FILE, { version: 1, items }) } catch { return false }
}
/** Ein Item aktualisieren (read-modify-write). */
export async function updateDeviceSetupItem(id: string, patch: Partial<DeviceSetupItem>): Promise<DeviceSetupItem> {
  const items = await loadDeviceSetupState()
  const next = { ...(items[id] || emptyItem()), ...patch, updatedAt: new Date().toISOString() }
  items[id] = next
  await saveDeviceSetupState(items)
  return next
}

/**
 * Für ein Refresh-Gerät selbstständig Drucker + Schnellzugriffe vom Altgerät ziehen und
 * im State persistieren. Drucker aus dem Verbindungs-Scan, sonst live (wenn Altgerät online).
 * QA-Datei nur sichern, wenn noch nicht gesichert/angewendet und das Altgerät erreichbar ist.
 */
export async function autoPullRefresh(id: string, oldRaw: string, oldHost: string, corpId: string, current?: DeviceSetupItem): Promise<DeviceSetupItem> {
  let item = current || (await loadDeviceSetupState())[id] || emptyItem()

  // Drucker einmal ermitteln, wenn noch keine vorliegen.
  if (!item.printers || item.printers.length === 0) {
    let printers = await readOldPrinters(oldRaw)
    let from: 'scan' | 'live' | '' = printers.length ? 'scan' : ''
    if (printers.length === 0 && oldHost) {
      const reach = await checkReachability(oldHost)
      if (reach.online) { const live = await readOldPrintersLive(oldHost); if (live.length) { printers = live; from = 'live' } }
    }
    if (printers.length) item = await updateDeviceSetupItem(id, { printers, printersFrom: from })
  }

  // Schnellzugriffe sichern, wenn noch nicht gesichert und noch nicht angewendet.
  if (!item.quickAccessStaged && !item.quickAccessApplied && oldHost) {
    const reach = await checkReachability(oldHost)
    if (reach.online) {
      const s = await stageOldQuickAccess(oldHost, corpId, id)
      if (s.ok) item = await updateDeviceSetupItem(id, { quickAccessStaged: true })
    }
  }

  // Netzlaufwerke vom Altgerät: einmal täglich ab 12:00 versuchen, bis sie erfasst sind.
  // Sind sie einmal (nicht-leer) erfasst, wird NICHT erneut gescannt.
  if (!item.networkDrivesAt && oldHost) {
    const now = new Date()
    const triedToday = item.networkDrivesTriedAt ? sameDay(new Date(item.networkDrivesTriedAt), now) : false
    if (now.getHours() >= 12 && !triedToday) {
      const reach = await checkReachability(oldHost)
      if (reach.online) {
        const r = await getNetworkDrives(oldHost)
        if (r.ok && r.drives && r.drives.length) {
          item = await updateDeviceSetupItem(id, { networkDrives: r.drives, networkDrivesAt: now.toISOString(), networkDrivesTriedAt: now.toISOString() })
        } else {
          // erreichbar, aber (noch) keine Laufwerke sichtbar (z. B. Benutzer abgemeldet) → morgen erneut.
          item = await updateDeviceSetupItem(id, { networkDrivesTriedAt: now.toISOString() })
        }
      } else {
        item = await updateDeviceSetupItem(id, { networkDrivesTriedAt: now.toISOString() })
      }
    }
  }
  return item
}
