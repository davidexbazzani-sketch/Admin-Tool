// ── Treiber-Installation (HP): Hintergrund-Store ─────────────────────────────
// Hält den Installations-Vorgang außerhalb der React-Komponente, damit er
// weiterläuft, wenn man den Menüpunkt wechselt (analog gpuDeployStore/swInstallStore).

import { create } from 'zustand'
import { installDrivers, type DriverItem, type HpDeployOptions, type HpDeployResult } from '../services/hpDrivers'

export interface HpDeployProgress { done: number; total: number; host: string; phase: string }

interface HpDeployState {
  running: boolean
  progress: HpDeployProgress | null
  results: Record<string, HpDeployResult>   // key = host.toLowerCase()
  finishedTick: number
  startedAt: number | null
  run: (plan: { host: string; items: DriverItem[] }[], opts: HpDeployOptions) => Promise<void>
  clearResults: () => void
}

export const useHpDeployStore = create<HpDeployState>((set, get) => ({
  running: false,
  progress: null,
  results: {},
  finishedTick: 0,
  startedAt: null,

  clearResults: () => set({ results: {} }),

  run: async (plan, opts) => {
    const jobs = plan.filter(p => p.items.length)
    if (get().running || jobs.length === 0) return
    set({ running: true, startedAt: Date.now(), progress: { done: 0, total: jobs.length, host: '', phase: '' } })
    let done = 0
    try {
      await installDrivers(
        jobs, opts,
        (s) => set(st => (st.progress ? { progress: { ...st.progress, host: s.host, phase: s.phase } } : {})),
        (r) => {
          done++
          set(st => ({
            results: { ...st.results, [r.host.toLowerCase()]: r },
            progress: st.progress ? { ...st.progress, done } : st.progress,
          }))
        },
      )
    } finally {
      set(st => ({ running: false, progress: null, finishedTick: st.finishedTick + 1 }))
    }
  },
}))
