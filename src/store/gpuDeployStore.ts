// ── GPU-Treiber-Verteilung: Hintergrund-Store ────────────────────────────────
// Hält den Verteilungs-Vorgang außerhalb der React-Komponente, damit er
// weiterläuft, wenn man den Menüpunkt wechselt (analog swInstallStore/vlanStore).
// Der eigentliche Rollout (deployDriver) wird hier gestartet; die Übersicht
// abonniert nur den Fortschritt und die Ergebnisse.

import { create } from 'zustand'
import { deployDriver, type DeployOptions, type DeployResult } from '../services/gpuDrivers'

export interface DeployProgress { done: number; total: number; host: string; phase: string }

interface GpuDeployState {
  running: boolean
  packageName: string
  progress: DeployProgress | null
  results: Record<string, DeployResult>
  finishedTick: number   // erhöht sich bei jedem Abschluss -> Screen lädt Scan-Daten neu
  startedAt: number | null
  run: (hosts: string[], packageName: string, opts: DeployOptions) => Promise<void>
  clearResults: () => void
}

export const useGpuDeployStore = create<GpuDeployState>((set, get) => ({
  running: false,
  packageName: '',
  progress: null,
  results: {},
  finishedTick: 0,
  startedAt: null,

  clearResults: () => set({ results: {} }),

  run: async (hosts, packageName, opts) => {
    if (get().running || hosts.length === 0 || !packageName) return
    set({ running: true, packageName, startedAt: Date.now(), progress: { done: 0, total: hosts.length, host: '', phase: '' } })
    let done = 0
    try {
      await deployDriver(
        hosts, packageName, opts,
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
