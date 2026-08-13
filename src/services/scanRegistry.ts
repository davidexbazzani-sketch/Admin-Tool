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
  description: 'Ermittelt je Computer, welche (Netzwerk-)Drucker der angemeldete Benutzer verbunden hat + den Standarddrucker.',
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

export const SCAN_REGISTRY: ScanDef[] = [softwareScan, printerConnScan]
