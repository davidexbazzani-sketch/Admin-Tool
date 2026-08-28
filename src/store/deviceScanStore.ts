// ── Geräte-Scan-Store (manueller Scan, läuft im Hintergrund weiter) ───────────
// Der manuelle „Geräte scannen (IP/MAC/Serial)"-Lauf wird hier gestartet, NICHT
// im Screen — so überlebt er einen Menüwechsel/Unmount der Standort-Übersicht.
// Zustand (running/Fortschritt/Ergebnis) ist global, damit die UI beim
// Zurückkehren den aktuellen Stand zeigt.

import { create } from 'zustand'
import { runDeviceScan, saveDeviceScanSchedule } from '../services/deviceScan'

interface DeviceScanState {
  running: boolean
  done: number
  total: number
  message: string
  finishedAt: number   // Timestamp des letzten Abschlusses (Signal fürs Neuladen der Liste)
  start: (by: string) => void
  clearMessage: () => void
}

export const useDeviceScanStore = create<DeviceScanState>((set, get) => ({
  running: false,
  done: 0,
  total: 0,
  message: '',
  finishedAt: 0,
  clearMessage: () => set({ message: '' }),
  start: (by: string) => {
    if (get().running) return
    set({ running: true, done: 0, total: 0, message: '' })
    // Fire-and-forget: läuft unabhängig vom Screen weiter.
    void (async () => {
      try {
        const r = await runDeviceScan(by, (done, total) => set({ done, total }))
        set({ running: false, message: `Geräte-Scan fertig: ${r.updated}/${r.scanned} Geräte aktualisiert (IP/MAC/Seriennummer).`, finishedAt: Date.now() })
        // Manuellen Lauf im Schedule vermerken, damit der 3-Tage-Automatik-Timer
        // ab jetzt zählt (kein sofortiger Doppellauf durch den Controller).
        try { await saveDeviceScanSchedule({ lastRunAt: new Date().toISOString(), lastResult: 'ok', lastSummary: `${r.updated}/${r.scanned} (manuell)`, running: undefined }) } catch { /* offline */ }
      } catch (e) {
        set({ running: false, message: 'Geräte-Scan fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)), finishedAt: Date.now() })
      }
    })()
  },
}))
