// ── Geräte-Einrichtung: Zustand + Auto-Pull für Refresh-Geräte ────────────────
// Persistiert je Checkliste (Netzlaufwerk), welche Drucker vom Altgerät ermittelt
// wurden und ob die Explorer-Schnellzugriff-Datei (AutomaticDestinations) auf dem
// Netzlaufwerk zwischengespeichert bzw. schon aufs Neugerät übertragen ist. Das Tool
// zieht diese Infos für Refresh-Geräte selbstständig (best-effort). Die QA-Datei wird
// nach dem Übertragen wieder vom Netz gelöscht ([[refresh_migration_feature]]).

import { api } from '../electronAPI'
import { readOldPrinters, readOldPrintersLive, stageOldQuickAccess, checkQuickAccessApplied, deleteQuickAccessBundle, type MigrationPrinter } from './refreshMigration'
import type { NetDrive } from './migrationOps'
import { checkReachability } from './onboardingDeploy'
import type { EuroparFolderState } from './europar'
import type { EuroparEnvState } from './europarEnv'
import type { BasicScriptId, BasicStepResult } from './basicSetup'
import type { AutoStepResult } from './autoSetup'

const STATE_FILE = 'device_setup/state.json'

export interface DeviceSetupItem {
  printers: MigrationPrinter[]
  printersFrom: 'scan' | 'live' | ''
  quickAccessStaged: boolean
  quickAccessApplied: boolean
  // Netzlaufwerke alt → neu — [[network_drive_migration]]
  networkDrives?: NetDrive[]         // vom Altgerät gelesene Netzlaufwerke
  networkDrivesAt?: string           // Zeitpunkt der erfolgreichen (nicht-leeren) Erfassung
  networkDrivesTriedAt?: string      // letzter Erfassungs-Versuch
  networkDrivesText?: string         // Ergebnis/Grund des letzten Erfassungs-Versuchs
  networkDrivesApplyTriedAt?: string // letzter Versuch, sie auf dem Neugerät zu verbinden
  networkDrivesApplyText?: string    // Ergebnis/Grund des letzten Verbinde-Versuchs
  networkDrivesApplied?: boolean     // auf dem Neugerät verbunden
  networkDrivesAppliedAt?: string
  // EuroPAR-Ordner (C:\EuroPAR, C:\Local, C:\SCHNITTDATEN) — [[europar_folder_migration]]
  europarScannedAt?: string          // letzter Ordner-Scan des Altgeräts (Scan „europar-scan")
  europarScanText?: string           // Fehlertext, wenn das Altgerät beim Scan nicht erreichbar war
  europarMarked?: boolean            // Altgerät hat mind. einen der drei Ordner → EuroPAR-Gerät
  europarFound?: string[]            // beim Scan gefundene Ordnernamen
  europarDir?: string                // Unterordner im Netz-Zwischenspeicher (= Hostname des neuen PCs)
  europarFolders?: EuroparFolderState[]
  europarStaged?: boolean            // vom Altgerät in den Zwischenspeicher gesichert (geprüft)
  europarStagedAt?: string
  europarTriedAt?: string            // letzter Sicherungs-Versuch
  europarStageText?: string          // Ergebnis/Grund des letzten Sicherungs-Versuchs
  europarApplyTriedAt?: string       // letzter Übertragungs-Versuch aufs Neugerät
  europarApplyText?: string          // Ergebnis/Grund des letzten Übertragungs-Versuchs
  europarApplied?: boolean           // vollständig auf dem neuen PC, Zwischenspeicher geleert
  europarAppliedAt?: string
  europarEnvVars?: EuroparEnvState[] // Teil 2: Ist-Zustand der EuroPAR-Umgebungsvariablen
  europarEnvApplied?: boolean        // alle Soll-Variablen auf dem neuen PC gesetzt
  europarEnvAt?: string
  // Basic-Grundeinrichtung (Kachel „Basic") — [[setup_scripts_feature]]
  basicRunAt?: string                // Zeitpunkt des letzten Laufs (ISO)
  basicRunOk?: boolean               // true = alle Schritte ok/teilweise, kein Fehler
  basicScriptId?: BasicScriptId      // ausgeführte Variante
  basicSteps?: BasicStepResult[]     // Ergebnis je Schritt
  // Automatische Windows-Updates (8-h-Takt, solange das Gerät hier sichtbar ist)
  winUpdateTriedAt?: string          // letzter Versuch (auch wenn das Gerät offline war)
  winUpdateAt?: string               // letzter erfolgreicher Lauf
  winUpdateOk?: boolean
  winUpdateText?: string             // Ergebnistext des letzten Laufs
  // Drucker / Schnellzugriffe: zusätzliche Marker für die Komplett-Einrichtung
  printersApplied?: boolean          // Drucker auf dem Neugerät eingerichtet
  printersAppliedAt?: string
  quickAccessDeployedAt?: string     // .cmd für die Schnellzugriffe auf dem Desktop abgelegt
  networkDrivesDeployedAt?: string   // .bat für die Netzlaufwerke auf dem Desktop abgelegt
  europarEnvDeployedAt?: string      // .cmd für die EuroPAR-Variablen abgelegt
  driversRunAt?: string              // Treiber-Installation durchgelaufen
  driversText?: string
  // Komplett-Einrichtung (Kachel-Reihenfolge, automatisch oder manuell) — [[auto_setup_feature]]
  autoSetupDoneAt?: string           // wann ein vollständiger Durchlauf endete
  autoSetupOk?: boolean              // true = kein Schritt mit Fehler
  autoSetupSteps?: AutoStepResult[]  // Ergebnis je Schritt
  autoSetupAutomatikAus?: boolean    // true = stündlicher Ping für dieses Gerät eingestellt
  autoSetupPingAt?: string           // letzter Erreichbarkeits-Versuch der Automatik
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
 * Mehrere Items in EINEM read-modify-write aktualisieren. Wird vom EuroPAR-Scan genutzt,
 * der viele Geräte parallel prüft — einzelne updateDeviceSetupItem-Aufrufe würden sich
 * dabei gegenseitig überschreiben.
 */
export async function updateDeviceSetupItems(patches: Record<string, Partial<DeviceSetupItem>>): Promise<Record<string, DeviceSetupItem>> {
  const items = await loadDeviceSetupState()
  const now = new Date().toISOString()
  for (const [id, patch] of Object.entries(patches)) {
    items[id] = { ...(items[id] || emptyItem()), ...patch, updatedAt: now }
  }
  await saveDeviceSetupState(items)
  return items
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

  // Hat der Anwender die .cmd auf dem Desktop selbst ausgeführt? Die läuft im Benutzer-
  // kontext und meldet dem Tool nichts zurück — deshalb hinterlässt sie eine Markerdatei
  // im Zwischenspeicher. Ist sie da, gilt der Punkt als erledigt und das Netz-Bundle
  // wird aufgeräumt (sonst bliebe es für immer liegen).
  if (item.quickAccessStaged && !item.quickAccessApplied) {
    if (await checkQuickAccessApplied(id)) {
      await deleteQuickAccessBundle(id)
      item = await updateDeviceSetupItem(id, { quickAccessStaged: false, quickAccessApplied: true })
    }
  }

  // Netzlaufwerke werden NICHT mehr hier erfasst — das erledigt der NetworkDriveSetup-
  // Controller im Hintergrund (networkDriveSetup.ts). Hier hing es am geöffneten
  // Menüpunkt und lief zudem über eine Abfrage, die über WinRM immer leer blieb.
  return item
}

/** Ein Gerät ist ein EuroPAR-Gerät, sobald der Scan mindestens einen der Ordner gefunden hat. */
export function isEuroparDevice(st?: DeviceSetupItem): boolean {
  return !!(st && (st.europarMarked || st.europarStaged || st.europarApplied))
}

