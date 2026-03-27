/**
 * Global Zustand store for Netzwerk-Radar scan state.
 * Persists across page navigations — the scan keeps running
 * even when the user switches to another screen.
 */
import { create } from 'zustand'

export interface RadarHealthScore {
  hostname: string
  label?: string
  online: boolean
  total: number
  hardware: number
  security: number
  performance: number
  prediction: number
  details: Record<string, string>
  recommendations: Array<{ severity: 'critical' | 'warning' | 'info'; text: string; skillId?: string }>
  timestamp: string
}

export interface RadarPattern {
  id: string
  severity: 'critical' | 'warning' | 'info'
  icon: string
  title: string
  description: string
  affectedCount: number
  affectedHosts: string[]
  recommendation: string
  detectedAt: string
}

interface RadarState {
  scanning: boolean
  progress: number
  total: number
  scores: RadarHealthScore[]
  patterns: RadarPattern[]
  error: string | null

  // Actions
  startScan: (total: number) => void
  updateProgress: (done: number, scores: RadarHealthScore[]) => void
  finishScan: (scores: RadarHealthScore[], patterns: RadarPattern[]) => void
  failScan: (error: string) => void
  stopScan: () => void
  loadCached: (scores: RadarHealthScore[], patterns: RadarPattern[]) => void
}

// Abort handle — lives outside React, survives unmounts
let abortFlag = false
export function getAbortFlag(): boolean { return abortFlag }
export function setAbortFlag(v: boolean) { abortFlag = v }

export const useRadarStore = create<RadarState>((set) => ({
  scanning: false,
  progress: 0,
  total: 0,
  scores: [],
  patterns: [],
  error: null,

  startScan: (total) => {
    abortFlag = false
    set({ scanning: true, progress: 0, total, scores: [], patterns: [], error: null })
  },

  updateProgress: (done, scores) => set({ progress: done, scores }),

  finishScan: (scores, patterns) => set({ scanning: false, scores, patterns }),

  failScan: (error) => set({ scanning: false, error }),

  stopScan: () => {
    abortFlag = true
    set({ scanning: false })
  },

  loadCached: (scores, patterns) => set({ scores, patterns }),
}))
