// ── Backup-Sofortlauf-Store ──────────────────────────────────────────────────
// Startet ein Sofort-Backup und pollt den Fortschritt via Fenster-level
// setInterval (ueberlebt Menue-/Komponentenwechsel), analog swInstallStore.

import { create } from 'zustand'
import { startRunNow, pollRunNow, type RunHandle } from '../services/backupEngine'
import { updateJob, recordRun, type BackupJob } from '../services/backups'

type Phase = 'idle' | 'starting' | 'running' | 'done' | 'error'

interface BackupRunState {
  phase: Phase
  jobId: string
  jobName: string
  copiedFiles: number
  expectedFiles: number
  message: string
  startedAt: number
  run: (job: BackupJob, opts?: { slot?: string; by?: string; silent?: boolean }) => Promise<void>
  reset: () => void
}

let _poll: ReturnType<typeof setInterval> | null = null
let _handle: RunHandle | null = null
let _startTs = 0
let _ctx: { jobId: string; jobName: string; slot?: string; by: string } | null = null

function stop() { if (_poll) { clearInterval(_poll); _poll = null } }

async function finish(result: 'success' | 'error', message: string) {
  stop()
  useBackupRunStore.setState({ phase: result === 'success' ? 'done' : 'error', message })
  const ctx = _ctx
  if (ctx) {
    const at = new Date().toISOString()
    try {
      await updateJob(ctx.jobId, { lastRun: at, lastResult: result, lastMessage: message })
      if (ctx.slot) await recordRun({ jobId: ctx.jobId, slot: ctx.slot, at, by: ctx.by, result, message })
    } catch { /* best effort */ }
  }
}

async function pollOnce() {
  if (!_handle) { stop(); return }
  // Sicherheits-Timeout: 6 Stunden
  if (Date.now() - _startTs > 6 * 60 * 60 * 1000) { void finish('error', 'Zeitüberschreitung (6 h).'); return }
  try {
    const p = await pollRunNow(_handle)
    if (p.done) {
      useBackupRunStore.setState({ copiedFiles: p.copiedFiles })
      void finish(p.result === 'success' ? 'success' : 'error', p.result === 'success' ? 'Backup abgeschlossen.' : (p.error || 'Backup fehlgeschlagen.'))
    } else {
      useBackupRunStore.setState({ copiedFiles: p.copiedFiles, phase: 'running' })
    }
  } catch { /* stiller Retry */ }
}

export const useBackupRunStore = create<BackupRunState>((set) => ({
  phase: 'idle',
  jobId: '',
  jobName: '',
  copiedFiles: 0,
  expectedFiles: 0,
  message: '',
  startedAt: 0,

  reset: () => { stop(); _handle = null; _ctx = null; set({ phase: 'idle', jobId: '', jobName: '', copiedFiles: 0, expectedFiles: 0, message: '', startedAt: 0 }) },

  run: async (job, opts) => {
    stop()
    _startTs = Date.now()
    _ctx = { jobId: job.id, jobName: job.name, slot: opts?.slot, by: opts?.by || '' }
    set({ phase: 'starting', jobId: job.id, jobName: job.name, copiedFiles: 0, expectedFiles: 0, message: 'Backup wird gestartet…', startedAt: _startTs })
    try { await updateJob(job.id, { lastResult: 'running', lastMessage: 'läuft…' }) } catch { /* egal */ }

    const r = await startRunNow(job)
    if (!r.ok || !r.handle) { await finish('error', r.error || 'Start fehlgeschlagen.'); return }
    _handle = r.handle
    set({ phase: 'running', expectedFiles: r.handle.expectedFiles, message: 'Backup läuft…' })
    _poll = setInterval(() => { void pollOnce() }, 4000)
    void pollOnce()
  },
}))
