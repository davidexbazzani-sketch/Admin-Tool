// ── Netzwerk-Diagnose: Hintergrund-Store ─────────────────────────────────────
// Hält den (Mehr-PC-)Scan außerhalb der React-Komponente, damit er beim Menü-
// wechsel weiterläuft. Scan läuft sequentiell je PC (Projektregel: nicht zu viele
// WinRM-Sitzungen gleichzeitig). Jeder Lauf wird sofort awaited gespeichert.

import { create } from 'zustand'
import { runNetScan } from '../netCheck/runScan'
import { saveLauf, pushRecentHost } from '../netCheck/store'
import type { NetLauf, HostRolle } from '../netCheck/types'

export interface NetScanEntry { host: string; rolle: HostRolle }
export interface NetRunLog { pc: string; ok: boolean; text: string }

interface NetScanState {
  running: boolean
  done: number
  total: number
  current: string
  ergebnisse: NetLauf[]
  runLog: NetRunLog[]
  error: string
  finishedTick: number
  run: (entries: NetScanEntry[], by: string) => Promise<void>
  cancel: () => void
  clear: () => void
}

let abort = false

export const useNetScanStore = create<NetScanState>((set, get) => ({
  running: false,
  done: 0,
  total: 0,
  current: '',
  ergebnisse: [],
  runLog: [],
  error: '',
  finishedTick: 0,

  clear: () => { if (!get().running) set({ ergebnisse: [], runLog: [], error: '', done: 0, total: 0, current: '' }) },

  cancel: () => { abort = true; try { void import('../electronAPI').then(m => m.api().cancelAll()) } catch { /* egal */ } },

  run: async (entries, by) => {
    if (get().running) return
    const list = entries.filter(e => (e.host || '').trim())
    if (list.length === 0) { set({ error: 'Keine PCs angegeben.' }); return }
    abort = false
    set({ running: true, error: '', ergebnisse: [], runLog: [], done: 0, total: list.length, current: '' })
    const results: NetLauf[] = []
    const log: NetRunLog[] = []
    try {
      for (let i = 0; i < list.length; i++) {
        if (abort) break
        const { host, rolle } = list[i]
        set({ done: i, current: host })
        const r = await runNetScan(host, by, rolle, { isAborted: () => abort })
        if (r.ok && r.lauf) {
          results.push(r.lauf)
          await saveLauf(r.lauf); pushRecentHost(host)
          const dc = r.lauf.daten?.ereignisse?.disconnects ?? 0
          log.push({ pc: r.lauf.pc, ok: true, text: `${dc} Aussetzer (14 T.)` })
        } else {
          log.push({ pc: host, ok: false, text: r.error || 'Fehlgeschlagen' })
        }
        set({ ergebnisse: [...results], runLog: [...log], done: i + 1 })
      }
    } finally {
      set(st => ({ running: false, current: '', finishedTick: st.finishedTick + 1 }))
    }
  },
}))
