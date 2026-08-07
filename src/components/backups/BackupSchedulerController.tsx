// ── Backup-Scheduler-Controller ──────────────────────────────────────────────
// Fuehrt faellige/verpasste TOOL-getriggerte Backup-Jobs aus, sobald ein
// berechtigtes IT-Tool laeuft (Nachhol-Logik). Native Aufgaben (lokales Ziel)
// laufen dagegen autonom auf dem PC und werden hier NICHT angefasst.
// Muster: LicenseAlarmController (tick auf Mount + Intervall + Fokus).

import { useCallback, useEffect } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { listJobs, dueSlot, updateJob } from '../../services/backups'
import { useBackupRunStore } from '../../store/backupRunStore'

const POLL_MS = 5 * 60 * 1000

export default function BackupSchedulerController() {
  const username = useAuthStore(s => s.session?.user?.username) || ''
  const isAdmin = useIsAdmin()

  const tick = useCallback(async () => {
    if (!isAdmin || !username) return
    // Store beschaeftigt? Dann diesen Tick auslassen (ein Job nach dem anderen).
    const phase = useBackupRunStore.getState().phase
    if (phase === 'starting' || phase === 'running') return

    let jobs
    try { jobs = await listJobs() } catch { return }
    const now = new Date()
    for (const job of jobs) {
      const slot = dueSlot(job, now)
      if (!slot) continue
      // Optimistisch als "gelaufen" markieren, damit ein zweites offenes Tool
      // denselben Slot nicht ebenfalls startet (Best-Effort-Sperre).
      try { await updateJob(job.id, { lastRun: slot, lastResult: 'running' }) } catch { /* egal */ }
      void useBackupRunStore.getState().run(job, { slot, by: username })
      return // nur einen Job pro Tick starten
    }
  }, [isAdmin, username])

  useEffect(() => {
    if (!username) return
    void tick()
    const t = setInterval(() => { void tick() }, POLL_MS)
    const onFocus = () => { void tick() }
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [tick, username])

  return null
}
