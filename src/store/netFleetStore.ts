// ── Flotten-WLAN-Scan: Hintergrund-Store (gedrosselte Parallelität) ──────────
// Scannt viele Laptops auf WLAN-Gesundheit. Im Gegensatz zum Einzel-/Vergleichs-
// Scan (netScanStore, strikt seriell) läuft hier ein BESCHRÄNKTER Worker-Pool
// (max. 5 gleichzeitige WinRM-Sitzungen, netz-/IDS-schonend). Abbruch ist
// kooperativ (kein api().cancelAll(), das würde ALLE PS-Prozesse killen) — es
// werden nur keine neuen Scans mehr gestartet.

import { create } from 'zustand'
import { runNetScan } from '../netCheck/runScan'
import { saveLauf, pushRecentHost } from '../netCheck/store'
import type { NetLauf } from '../netCheck/types'
import type { NetRunLog } from './netScanStore'

const CONCURRENCY = 5

interface NetFleetState {
  running: boolean
  done: number
  total: number
  current: string[]           // gerade laufende Hosts
  ergebnisse: NetLauf[]
  runLog: NetRunLog[]
  error: string
  finishedTick: number
  runFleet: (hosts: string[], by: string) => Promise<void>
  cancel: () => void
  clear: () => void
}

let abort = false

export const useNetFleetStore = create<NetFleetState>((set, get) => ({
  running: false,
  done: 0,
  total: 0,
  current: [],
  ergebnisse: [],
  runLog: [],
  error: '',
  finishedTick: 0,

  clear: () => { if (!get().running) set({ ergebnisse: [], runLog: [], error: '', done: 0, total: 0, current: [] }) },
  cancel: () => { abort = true },

  runFleet: async (hosts, by) => {
    if (get().running) return
    const list = [...new Set(hosts.map(h => (h || '').trim().toUpperCase()).filter(Boolean))]
    if (list.length === 0) { set({ error: 'Keine Laptops für den Scan.' }); return }
    abort = false
    set({ running: true, error: '', ergebnisse: [], runLog: [], done: 0, total: list.length, current: [] })
    const results: NetLauf[] = []
    const log: NetRunLog[] = []
    const active = new Set<string>()
    let nextIdx = 0
    let doneCount = 0

    const worker = async () => {
      for (;;) {
        if (abort) return
        const i = nextIdx++
        if (i >= list.length) return
        const host = list[i]
        active.add(host); set({ current: [...active] })
        try {
          const r = await runNetScan(host, by, 'problem', { isAborted: () => abort })
          if (r.ok && r.lauf) {
            results.push(r.lauf); await saveLauf(r.lauf); pushRecentHost(host)
            const dc = r.lauf.daten?.ereignisse?.disconnects ?? 0
            log.push({ pc: r.lauf.pc, ok: true, text: `${dc} Aussetzer (14 T.)` })
          } else {
            log.push({ pc: host, ok: false, text: r.error || 'Fehlgeschlagen' })
          }
        } catch (e) {
          log.push({ pc: host, ok: false, text: e instanceof Error ? e.message : String(e) })
        }
        active.delete(host); doneCount++
        set({ ergebnisse: [...results], runLog: [...log], done: doneCount, current: [...active] })
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, () => worker()))
    } finally {
      set(st => ({ running: false, current: [], finishedTick: st.finishedTick + 1 }))
    }
  },
}))
