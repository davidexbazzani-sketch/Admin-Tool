// ── Hintergrund-Lauf-Store für manuelle Scans ─────────────────────────────────
// Startet einen Scan „fire-and-forget": der Lauf-Promise lebt außerhalb von
// React (im Modul-Store), läuft also im Hintergrund weiter, auch wenn der Nutzer
// den Einstellungen-Screen verlässt und normal weiterarbeitet. Die eigentliche
// Arbeit (PowerShell) läuft ohnehin im Main-Prozess.

import { create } from 'zustand'
import type { ScanDef } from '../services/scanRegistry'

export interface ScanRunResult { ok: boolean; summary: string; at: string }

interface ScanState {
  running: Record<string, boolean>
  results: Record<string, ScanRunResult>
  start: (def: ScanDef, by: string) => void
}

export const useScanStore = create<ScanState>((set, get) => ({
  running: {},
  results: {},
  start: (def, by) => {
    if (get().running[def.id]) return   // läuft bereits
    set(s => ({ running: { ...s.running, [def.id]: true } }))
    // KEIN await — läuft im Hintergrund; Ergebnis landet später im Store.
    def.run(by)
      .then(r => set(s => ({
        running: { ...s.running, [def.id]: false },
        results: { ...s.results, [def.id]: { ok: r.ok, summary: r.summary, at: new Date().toISOString() } },
      })))
      .catch(e => set(s => ({
        running: { ...s.running, [def.id]: false },
        results: { ...s.results, [def.id]: { ok: false, summary: e instanceof Error ? e.message : String(e), at: new Date().toISOString() } },
      })))
  },
}))
