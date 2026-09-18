// ── Generischer Hintergrund-Job-Store fürs Migrations-Cockpit ────────────────
// Hält kurze/mittlere WinRM-Aktionen (Drucker, Schnellzugriffe, Sprache, Env,
// Netzlaufwerke, Windows-Updates, Neustart) AUSSERHALB von React, damit sie
// weiterlaufen und ihr Ergebnis erhalten bleiben, wenn man die Kachel wechselt
// oder das Cockpit schließt. Key-Konvention: `${host.toLowerCase()}:${tileId}`.

import { create } from 'zustand'

export interface MigJob { status: 'running' | 'done' | 'error'; text?: string; startedAt: number; endedAt?: number }

interface MigJobsState {
  jobs: Record<string, MigJob>
  isRunning: (key: string) => boolean
  get: (key: string) => MigJob | undefined
  clear: (key: string) => void
  run: (key: string, fn: () => Promise<{ ok: boolean; text?: string }>) => Promise<void>
}

export const useMigrationJobs = create<MigJobsState>((set, get) => ({
  jobs: {},
  isRunning: (key) => get().jobs[key]?.status === 'running',
  get: (key) => get().jobs[key],
  clear: (key) => set(st => { const j = { ...st.jobs }; delete j[key]; return { jobs: j } }),
  run: async (key, fn) => {
    if (get().jobs[key]?.status === 'running') return
    const startedAt = Date.now()
    set(st => ({ jobs: { ...st.jobs, [key]: { status: 'running', startedAt } } }))
    try {
      const r = await fn()
      set(st => ({ jobs: { ...st.jobs, [key]: { status: r.ok ? 'done' : 'error', text: r.text, startedAt, endedAt: Date.now() } } }))
    } catch (e) {
      set(st => ({ jobs: { ...st.jobs, [key]: { status: 'error', text: e instanceof Error ? e.message : String(e), startedAt, endedAt: Date.now() } } }))
    }
  },
}))
