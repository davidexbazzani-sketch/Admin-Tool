// ── Zentrales Register aller automatischen Hintergrund-Scans ──────────────────
// Eine Quelle für die Einstellungen-Sektion „Automatische Scans": Metadaten
// (Name, Beschreibung, Turnus), Status-Laden (letzter Lauf) und ein manueller
// Sofort-Lauf je Scan. Der manuelle Lauf läuft im Hintergrund (siehe scanStore).

import {
  runAutoScanOnce, loadSchedule as loadSwSchedule, saveSchedule as saveSwSchedule, isClaimed as isSwClaimed,
} from './softwareInventoryScan'
import {
  runConnectionScanManual, loadConnSchedule, isConnClaimed,
} from './printerConnections'
import { runPrinterIpScan, loadIpScanSchedule, saveIpScanSchedule } from './printerIpScan'
import { runDeviceScan, loadDeviceScanSchedule, saveDeviceScanSchedule, isDeviceScanClaimed } from './deviceScan'
import { runRadarScanOnce, runVlanScanOnce, RADAR_SCAN_SCHEDULE, VLAN_SCAN_SCHEDULE } from './extraScans'
import { runServerMetricsScan, SERVER_METRICS_STATUS } from './serverMonitor'
import { runZertifikatsScan, SERVER_CERTS_SCAN_ID, SERVER_CERTS_STATUS } from './serverZertifikate'
import { runLostDevicesScanOnce, LOST_SCAN_SCHEDULE } from './lostDevices'
import { runAccessCheckScanOnce, NIS2_ACCESS_STATUS } from './nis2Access'
import { runNetworkDrivesScanOnce, NETWORK_DRIVES_STATUS } from './deviceNetworkDrives'
import { runEuroparScanClaimed, EUROPAR_SCAN_STATUS, EUROPAR_SCAN_ID } from './europarScan'
import { runWeekendCheckOnce, dateKey, WEEKEND_CHECK_ID, WEEKEND_CHECK_STATUS } from './weekendCheck'
import { runPcVerlaufScan, PC_VERLAUF_ID, PC_VERLAUF_STATUS } from '../pcVerlauf/lesen'
import { runPcFehlerScan, PC_FEHLER_ID, PC_FEHLER_STATUS } from '../pcFehler/lauf'
import { loadRunStatus, saveRunStatus, isStatusClaimed, claimExclusive, getScanSchedule, WEEKDAY_LABELS } from './scanSchedules'

export interface ScanStatus {
  lastRunAt: string | null
  lastResult?: 'success' | 'error'
  lastSummary?: string
  runningElsewhere?: boolean   // eine andere Instanz führt den Scan gerade aus
}

export interface ScanDef {
  id: string
  label: string
  description: string
  cadence: string
  loadStatus(): Promise<ScanStatus>
  /** Führt EINEN Lauf aus und schreibt den Zeitplan-Status fort. Läuft im Hintergrund. */
  run(by: string): Promise<{ ok: boolean; summary: string }>
}

// ── Software-Inventar (alle 72h) ──────────────────────────────────────────────
const softwareScan: ScanDef = {
  id: 'software-inventory',
  label: 'Software-Inventar',
  description: 'Erfasst die installierte Software aller Computer (WinRM → Registry → PsExec). Ergebnisse verfallen nach 30 Tagen.',
  cadence: 'automatisch alle 72 Stunden',
  async loadStatus() {
    const s = await loadSwSchedule()
    return { lastRunAt: s.lastRunAt, lastResult: s.lastResult, lastSummary: s.lastSummary, runningElsewhere: isSwClaimed(s) }
  },
  async run() {
    // Gating: nicht starten, wenn bereits ein Lauf aktiv ist (Hintergrund/andere Instanz).
    const s = await loadSwSchedule()
    if (isSwClaimed(s)) return { ok: false, summary: 'Ein Scan läuft bereits (Hintergrund oder andere Instanz).' }
    const token = `manual#${Math.random().toString(36).slice(2, 10)}`
    try { await saveSwSchedule({ ...s, running: { by: token, at: new Date().toISOString() } }) } catch { /* egal */ }
    try {
      const res = await runAutoScanOnce()
      const summary = res.ok ? `${res.updated} aktualisiert / ${res.online} online / ${res.candidates} fällig` : (res.reason || 'Fehler')
      // lastRunAt nur bei Erfolg fortschreiben; Claim immer freigeben.
      try { await saveSwSchedule({ lastRunAt: res.ok ? new Date().toISOString() : s.lastRunAt, lastResult: res.ok ? 'success' : 'error', lastSummary: summary, running: undefined }) } catch { /* egal */ }
      return { ok: res.ok, summary }
    } catch (e) {
      try { await saveSwSchedule({ ...s, running: undefined }) } catch { /* egal */ }
      return { ok: false, summary: e instanceof Error ? e.message : String(e) }
    }
  },
}

// ── Drucker-Verbindungen (alle 2 Wochen, freitags 14:00) ──────────────────────
const printerConnScan: ScanDef = {
  id: 'printer-connections',
  label: 'Drucker-Verbindungen',
  description: 'Ermittelt je Computer die installierten Drucker (inkl. SEAL/PLOSSYS) + den Standarddrucker. Offline-Rechner behalten ihren letzten bekannten Stand.',
  cadence: 'automatisch alle 2 Wochen · freitags 14:00',
  async loadStatus() {
    const s = await loadConnSchedule()
    return { lastRunAt: s.lastRunAt, lastResult: s.lastResult, lastSummary: s.lastSummary, runningElsewhere: isConnClaimed(s) }
  },
  async run(by) {
    // runConnectionScanManual gated intern (Claim + Zeitplan-Fortschreibung, lastRunAt nur bei Erfolg).
    const res = await runConnectionScanManual(by)
    const summary = res.ok ? `${res.withPrinters} PCs mit Druckern / ${res.online} online / ${res.candidates} Computer` : (res.reason || 'Fehler')
    return { ok: res.ok, summary }
  },
}

// ── Drucker-IP-Scan ───────────────────────────────────────────────────────────
const printerIpScan: ScanDef = {
  id: 'printer-ip',
  label: 'Drucker-IP-Scan',
  description: 'Ermittelt die IP-Adressen aller Inventar-Drucker (Inventar-IP, sonst DNS) und hinterlegt sie im Drucker-Dossier.',
  cadence: '',
  async loadStatus() {
    const s = await loadIpScanSchedule()
    return { lastRunAt: s.lastRunAt, lastResult: s.lastResult === 'ok' ? 'success' : s.lastResult === 'error' ? 'error' : undefined, lastSummary: s.lastSummary, runningElsewhere: s.lastResult === 'running' }
  },
  async run(by) {
    try {
      const r = await runPrinterIpScan(by)
      const summary = `${r.updated}/${r.scanned} Drucker-IPs aktualisiert`
      try { await saveIpScanSchedule({ lastRunAt: new Date().toISOString(), lastResult: 'ok', lastSummary: summary }) } catch { /* egal */ }
      return { ok: true, summary }
    } catch (e) {
      return { ok: false, summary: e instanceof Error ? e.message : String(e) }
    }
  },
}

// ── Geräte-Scan (IP/MAC/Serial) ───────────────────────────────────────────────
const deviceScan: ScanDef = {
  id: 'device-scan',
  label: 'Geräte-Scan (IP/MAC/Serial) — ohne Drucker',
  description: 'Liest für Server und Computer IP-Adresse, MAC-Adresse und (wenn möglich) Seriennummer aus und hinterlegt sie in den Stammdaten. DRUCKER SIND AUSGENOMMEN: deren Daten kommen aus dem Drucker-Import der ERP-Liste (Standort-Übersicht → Kategorie Drucker) und werden hier nicht angefasst.',
  cadence: '',
  async loadStatus() {
    const s = await loadDeviceScanSchedule()
    return { lastRunAt: s.lastRunAt, lastResult: s.lastResult === 'ok' ? 'success' : s.lastResult === 'error' ? 'error' : undefined, lastSummary: s.lastSummary, runningElsewhere: isDeviceScanClaimed(s) }
  },
  async run(by) {
    const s = await loadDeviceScanSchedule()
    if (isDeviceScanClaimed(s)) return { ok: false, summary: 'Ein Geräte-Scan läuft bereits (Hintergrund oder andere Instanz).' }
    const token = `manual#${Math.random().toString(36).slice(2, 10)}`
    try { await saveDeviceScanSchedule({ ...s, running: { by: token, at: new Date().toISOString() } }) } catch { /* egal */ }
    try {
      const r = await runDeviceScan(by)
      const summary = `${r.updated}/${r.scanned} Geräte aktualisiert`
      try { await saveDeviceScanSchedule({ lastRunAt: new Date().toISOString(), lastResult: 'ok', lastSummary: summary, running: undefined }) } catch { /* egal */ }
      return { ok: true, summary }
    } catch (e) {
      try { await saveDeviceScanSchedule({ ...s, running: undefined }) } catch { /* egal */ }
      return { ok: false, summary: e instanceof Error ? e.message : String(e) }
    }
  },
}

// ── Generischer manueller Lauf mit Claim (für Radar/VLAN über eine Status-Datei) ─
async function runWithClaim(path: string, fn: () => Promise<{ ok: boolean; summary: string }>): Promise<{ ok: boolean; summary: string }> {
  const s = await loadRunStatus(path)
  if (isStatusClaimed(s)) return { ok: false, summary: 'Läuft bereits (Hintergrund oder andere Instanz).' }
  const token = `manual#${Math.random().toString(36).slice(2, 10)}`
  // Robuste Einmal-Wahl (Claim + Rücklese-Prüfung): verhindert, dass zwei Instanzen gleichzeitig loslaufen.
  const won = await claimExclusive(path, token, s)
  if (!won) return { ok: false, summary: 'Läuft bereits (andere Instanz war schneller).' }
  try {
    const res = await fn()
    try { await saveRunStatus(path, { lastRunAt: res.ok ? new Date().toISOString() : s.lastRunAt, lastResult: res.ok ? 'success' : 'error', lastSummary: res.summary, running: undefined }) } catch { /* egal */ }
    return res
  } catch (e) {
    try { await saveRunStatus(path, { ...s, running: undefined }) } catch { /* egal */ }
    return { ok: false, summary: e instanceof Error ? e.message : String(e) }
  }
}

// ── Proaktives Radar (AD-Hygiene) ─────────────────────────────────────────────
const radarScan: ScanDef = {
  id: 'proactive-radar',
  label: 'Proaktives Radar (AD-Hygiene)',
  description: 'Prüft AD-Konten: ausgetretene Mitarbeiter mit aktivem Konto, verwaiste Konten, Passwort-/Konto-Ablauf.',
  cadence: '',
  async loadStatus() {
    const s = await loadRunStatus(RADAR_SCAN_SCHEDULE)
    return { lastRunAt: s.lastRunAt, lastResult: s.lastResult, lastSummary: s.lastSummary, runningElsewhere: isStatusClaimed(s) }
  },
  run() { return runWithClaim(RADAR_SCAN_SCHEDULE, () => runRadarScanOnce()) },
}

// ── VLAN-/Netzwerk-Scan ───────────────────────────────────────────────────────
const vlanScan: ScanDef = {
  id: 'vlan-scan',
  label: 'VLAN-/Netzwerk-Scan',
  description: 'Ping-Sweep über die Standort-Subnetze + Geräte-Zuordnung; erkennt Netz-Drift und Fremdgeräte.',
  cadence: '',
  async loadStatus() {
    const s = await loadRunStatus(VLAN_SCAN_SCHEDULE)
    return { lastRunAt: s.lastRunAt, lastResult: s.lastResult, lastSummary: s.lastSummary, runningElsewhere: isStatusClaimed(s) }
  },
  run(by) { return runWithClaim(VLAN_SCAN_SCHEDULE, () => runVlanScanOnce(by)) },
}

// ── Server-Auslastung (RAM/Festplatte) ────────────────────────────────────────
const serverMetricsScan: ScanDef = {
  id: 'server-metrics',
  label: 'Server-Auslastung (RAM/Festplatte)',
  description: 'Liest je Server-Kachel die Arbeitsspeicher-Auslastung und die Festplatten-Kapazität (WinRM) und zeigt sie in der jeweiligen Kachel im Server-Monitor an.',
  cadence: '',
  async loadStatus() {
    const s = await loadRunStatus(SERVER_METRICS_STATUS)
    return { lastRunAt: s.lastRunAt, lastResult: s.lastResult, lastSummary: s.lastSummary, runningElsewhere: isStatusClaimed(s) }
  },
  run(by) { return runWithClaim(SERVER_METRICS_STATUS, () => runServerMetricsScan(by)) },
}

// ── Verlorene Geräte – Online-Check (Mi + Do 11:00) ───────────────────────────
const lostDevicesScan: ScanDef = {
  id: 'lost-devices',
  label: 'Verlorene Geräte – Online-Check',
  description: 'Prüft für alle als verloren gemeldeten Geräte per AD/Ping, ob sie online sind und wann sie zuletzt online waren. Ergebnis erscheint in der Liste „Verlorene Geräte".',
  cadence: '',
  async loadStatus() {
    const s = await loadRunStatus(LOST_SCAN_SCHEDULE)
    return { lastRunAt: s.lastRunAt, lastResult: s.lastResult, lastSummary: s.lastSummary, runningElsewhere: isStatusClaimed(s) }
  },
  run(by) { return runWithClaim(LOST_SCAN_SCHEDULE, () => runLostDevicesScanOnce(by)) },
}

// ── NIS2 · Zugänge-Check (lokale Adminrechte, täglich 11:00) ──────────────────
const nis2AccessScan: ScanDef = {
  id: 'nis2-access',
  label: 'NIS2 · Zugänge-Check (lokale Admins)',
  description: 'Scannt alle Computer per WinRM auf lokale Adminrechte und listet alle Nutzer mit lokalem Admin (inkl. PCs). Abgleich mit der genehmigten Liste in NIS2 → Zugänge-Check.',
  cadence: '',
  async loadStatus() {
    const s = await loadRunStatus(NIS2_ACCESS_STATUS)
    return { lastRunAt: s.lastRunAt, lastResult: s.lastResult, lastSummary: s.lastSummary, runningElsewhere: isStatusClaimed(s) }
  },
  run(by) { return runWithClaim(NIS2_ACCESS_STATUS, () => runAccessCheckScanOnce(by)) },
}

// ── Verbundene Netzlaufwerke (alle Computer) ──────────────────────────────────
const networkDrivesScan: ScanDef = {
  id: 'network-drives',
  label: 'Verbundene Netzlaufwerke',
  description: 'Liest für alle Computer per WinRM die verbundenen Netzlaufwerke ein. Das Ergebnis erscheint im Geräte-„i" (hinter dem Hostnamen) unter „Verbundene Netzlaufwerke".',
  cadence: '',
  async loadStatus() {
    const s = await loadRunStatus(NETWORK_DRIVES_STATUS)
    return { lastRunAt: s.lastRunAt, lastResult: s.lastResult, lastSummary: s.lastSummary, runningElsewhere: isStatusClaimed(s) }
  },
  run(by) { return runWithClaim(NETWORK_DRIVES_STATUS, () => runNetworkDrivesScanOnce(by)) },
}

// ── EuroPAR-Ordner auf den Altgeräten (täglich 12:00) ─────────────────────────
const europarScan: ScanDef = {
  id: EUROPAR_SCAN_ID,
  label: 'EuroPAR-Ordner (Altgeräte)',
  description: 'Prüft bei allen offenen Refresh-Checklisten, ob auf dem Altgerät C:\\EuroPAR, C:\\Local und C:\\SCHNITTDATEN liegen. Nur markierte Geräte bekommen in der Geräte-Einrichtung die EuroPAR-Kachel und werden automatisch gesichert.',
  cadence: '',
  async loadStatus() {
    const s = await loadRunStatus(EUROPAR_SCAN_STATUS)
    return { lastRunAt: s.lastRunAt, lastResult: s.lastResult, lastSummary: s.lastSummary, runningElsewhere: isStatusClaimed(s) }
  },
  run(by) { return runEuroparScanClaimed(by) },
}

// ── Wochenend-Check (So 12:00): welche genutzten PCs laufen noch? ─────────────
const weekendCheckScan: ScanDef = {
  id: WEEKEND_CHECK_ID,
  label: 'Wochenend-Check (PCs an?)',
  description: 'Pingt sonntags alle genutzten PCs (Endgeräte-Übersicht: In use + Active) an und dokumentiert im Proaktiven Radar (Reiter „Wochenend-Check"), welche am Wochenende nicht ausgeschaltet wurden — bei eingeschalteten PCs auch, wer angemeldet ist (nur lesend). Läuft nur, wenn das Tool zur Uhrzeit (bis 2 Std. danach) bei einem Admin geöffnet ist — verpasste Messtage werden nicht nachgeholt.',
  cadence: '',
  async loadStatus() {
    const s = await loadRunStatus(WEEKEND_CHECK_STATUS)
    return { lastRunAt: s.lastRunAt, lastResult: s.lastResult, lastSummary: s.lastSummary, runningElsewhere: isStatusClaimed(s) }
  },
  async run(by) {
    // Manuell nur an einem geplanten Messtag — sonst würde die Messung das Wochenende verfälschen.
    const today = new Date()
    const cfg = await getScanSchedule(WEEKEND_CHECK_ID)
    if (!cfg.days.includes(today.getDay())) {
      const tage = cfg.days.map(d => WEEKDAY_LABELS[d]).join(', ') || '—'
      return { ok: false, summary: `Der Wochenend-Check kann nur an einem geplanten Messtag ausgeführt werden (${tage}).` }
    }
    return runWithClaim(WEEKEND_CHECK_STATUS, () => runWeekendCheckOnce(by, dateKey(today)))
  },
}

// ── Server-Zertifikate (täglich 07:00) ────────────────────────────────────────
const serverCertsScan: ScanDef = {
  id: SERVER_CERTS_SCAN_ID,
  label: 'Server-Zertifikate (Ablauf)',
  description: 'Liest je Server die Zertifikate (Speicher, IIS/http.sys, RDP, SQL, TLS-Ports) nur lesend und meldet verwendete Zertifikate 30 und 5 Tage vor Ablauf (Popup + Mail laut Kachel-Haken).',
  cadence: '',
  async loadStatus() {
    const s = await loadRunStatus(SERVER_CERTS_STATUS)
    return { lastRunAt: s.lastRunAt, lastResult: s.lastResult, lastSummary: s.lastSummary, runningElsewhere: isStatusClaimed(s) }
  },
  run(by) { return runWithClaim(SERVER_CERTS_STATUS, () => runZertifikatsScan(by)) },
}

// ── Änderungsverlauf je PC (Mo–Fr 10:00) ──────────────────────────────────────
const pcVerlaufScan: ScanDef = {
  id: PC_VERLAUF_ID,
  label: 'Änderungsverlauf je PC (aktueller Stand, „Was hat sich geändert?")',
  description: 'Liest werktags von allen genutzten PCs (Endgeräte-Übersicht: In use + Active, keine Server) den Stand von Programmen, Windows-Updates, Treibern, Diensten, Autostart, geplanten Aufgaben, festen Netzwerkeinstellungen und BIOS und hält fest, was sich geändert hat. Nur lesend, netzschonend: höchstens 3 PCs gleichzeitig, WinRM wird nicht eingeschaltet, ein unveränderter PC schickt nur wenige hundert Bytes. Anzeige in „Gib dein Problem ein“ (Änderungen der letzten 14 Tage, passend zum Problem) und im Geräte-„i".',
  cadence: '',
  async loadStatus() {
    const s = await loadRunStatus(PC_VERLAUF_STATUS)
    return { lastRunAt: s.lastRunAt, lastResult: s.lastResult, lastSummary: s.lastSummary, runningElsewhere: isStatusClaimed(s) }
  },
  run(by) { return runWithClaim(PC_VERLAUF_STATUS, () => runPcVerlaufScan(by)) },
}

// ── Proaktive Fehlersuche (Mo–Fr 09:00) — eigener Scan, getrennt vom Änderungsverlauf ──
const pcFehlerScan: ScanDef = {
  id: PC_FEHLER_ID,
  label: 'Proaktive Fehlersuche (PC-Fehler im Proaktiven Radar)',
  description: 'Sucht werktags auf allen genutzten PCs (keine Server) nach Fehlern, bevor sie jemand meldet: alle Windows-Ereignisprotokolle der letzten 7 Tage (Abstürze von Outlook, Teams, SolidWorks …, Bluescreens, Festplatten- und Hardwarefehler, abgestürzte Dienste, fehlgeschlagene Updates, Fehlermeldungen von Office) und ob Laufwerk I: verbunden ist. Der PC zählt selbst zusammen, übers Netz geht nur die Zusammenfassung. Nur lesend und für den Benutzer unsichtbar (kein Fenster), höchstens 3 PCs gleichzeitig. Ergebnis: Proaktives Radar → „PC-Fehler“, jeweils mit Lösungsweg.',
  cadence: '',
  async loadStatus() {
    const s = await loadRunStatus(PC_FEHLER_STATUS)
    return { lastRunAt: s.lastRunAt, lastResult: s.lastResult, lastSummary: s.lastSummary, runningElsewhere: isStatusClaimed(s) }
  },
  run(by) { return runWithClaim(PC_FEHLER_STATUS, () => runPcFehlerScan(by)) },
}

export const SCAN_REGISTRY: ScanDef[] = [pcFehlerScan, pcVerlaufScan, softwareScan, printerConnScan, printerIpScan, deviceScan, radarScan, vlanScan, serverMetricsScan, serverCertsScan, lostDevicesScan, nis2AccessScan, networkDrivesScan, europarScan, weekendCheckScan]
