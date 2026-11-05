// ── Backup-Scheduler-Controller ──────────────────────────────────────────────
// Führt fällige/verpasste TOOL-getriggerte Backup-Jobs aus, sobald ein berechtigtes
// IT-Tool läuft (Nachhol-Logik). Native Aufgaben (lokales Ziel) laufen autonom auf
// dem PC — hier werden nur ihre Ergebnisse stündlich eingesammelt.
// Zusätzlich:
//   - Ist der Quell-/Ziel-PC zum geplanten Zeitpunkt aus, wird der Lauf NICHT als
//     Fehler verbucht, sondern wartet und wird alle 5 min erneut versucht („wartet").
//   - Ein Lauf, der von DIESEM PC gestartet wurde und beim Schließen des Tools noch
//     lief, wird beim nächsten Start wieder aufgenommen (Ergebnis wird nachgetragen).
//   - Hängengebliebene „läuft…"-Einträge (Tool war zu) werden aufgeräumt.
// Muster: onAppFocus + ersterLaufEntzerrt (siehe ui_ruckeln_ursachen).

import { useCallback, useEffect } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { listJobs, dueSlot, updateJob, claimJob, type BackupJob } from '../../services/backups'
import { pruefeErreichbar } from '../../services/backupEngine'
import { syncPcErgebnisse } from '../../services/backupPcSync'
import { berichtAusFehler } from '../../services/backupBericht'
import { useBackupRunStore, backupLaeuft, eigenerRechner } from '../../store/backupRunStore'
import { onAppFocus, ersterLaufEntzerrt } from '../../utils/appFocus'

const POLL_MS = 5 * 60 * 1000
const PC_SYNC_MS = 60 * 60 * 1000
let letzterPcSync = 0
let tickLaeuft = false

async function raeumeAuf(jobs: BackupJob[], ich: string): Promise<void> {
  const jetzt = Date.now()
  for (const j of jobs) {
    if (j.lastResult !== 'running') continue
    if (!j.lauf) {
      // Altlast (vor 11/2026): Lauf wurde nicht verfolgt, weil das Tool geschlossen wurde
      const seit = new Date(j.updatedAt || j.lastRun || j.createdAt).getTime()
      if (jetzt - seit > 7 * 3600_000) {
        const b = berichtAusFehler('Lauf wurde nicht zu Ende verfolgt', 'Das Tool wurde während des Backups geschlossen; das Ergebnis ist unbekannt. Bitte „Jetzt ausführen" — bereits kopierte Dateien werden übersprungen.')
        await updateJob(j.id, { lastResult: 'error', lastMessage: b.titel, lastReport: b })
      }
      continue
    }
    const alter = jetzt - new Date(j.lauf.start).getTime()
    if (j.lauf.rechner !== ich && alter > 12 * 3600_000) {
      const b = berichtAusFehler(`Lauf auf ${j.lauf.rechner || 'einem anderen PC'} wurde nicht abgeschlossen gemeldet`, 'Das Tool auf dem anderen PC wurde vermutlich geschlossen. Bitte erneut ausführen.')
      await updateJob(j.id, { lastResult: 'error', lastMessage: b.titel, lastReport: b, lauf: undefined })
    }
  }
}

export default function BackupSchedulerController() {
  const username = useAuthStore(s => s.session?.user?.username) || ''
  const isAdmin = useIsAdmin()

  const tick = useCallback(async () => {
    if (!isAdmin || !username || tickLaeuft) return
    if (backupLaeuft()) return
    tickLaeuft = true
    try {
      let jobs: BackupJob[]
      // Chiron-Kacheln laufen als Aufgabe auf ihrem Server — hier nichts zu tun
      try { jobs = (await listJobs()).filter(j => j.art !== 'chiron') } catch { return }
      const ich = await eigenerRechner()

      // 1) Eigenen unterbrochenen Lauf wieder aufnehmen
      const eigen = jobs.find(j => j.lauf && j.lastResult === 'running' && j.lauf.rechner === ich)
      if (eigen && await useBackupRunStore.getState().fortsetzen(eigen)) return

      // 2) Hängende Einträge aufräumen
      await raeumeAuf(jobs, ich)

      // 3) Ergebnisse der PC-Aufgaben einsammeln (stündlich, je 2 gleichzeitig)
      if (Date.now() - letzterPcSync > PC_SYNC_MS) {
        letzterPcSync = Date.now()
        const nativ = jobs.filter(j => j.mechanism === 'native' && j.scheduled && !j.lauf)
        for (let i = 0; i < nativ.length; i += 2) {
          await Promise.all(nativ.slice(i, i + 2).map(j => syncPcErgebnisse(j).catch(() => null)))
        }
      }

      // 4) Fällige Tool-Jobs (einer pro Tick)
      const now = new Date()
      for (const job of jobs) {
        const slot = dueSlot(job, now)
        if (!slot) continue
        const problem = await pruefeErreichbar(job)
        if (problem) {
          // PC aus o. ä.: warten statt Fehler — nächster Versuch beim nächsten Tick
          if (job.wartet?.slot !== slot || job.wartet.grund !== problem.titel || job.lastResult !== 'waiting') {
            await updateJob(job.id, {
              lastResult: 'waiting', lastMessage: `${problem.titel} — wird nachgeholt, sobald erreichbar`,
              wartet: { slot, seit: job.wartet?.slot === slot ? job.wartet.seit : now.toISOString(), grund: problem.titel },
            })
          }
          continue
        }
        const lauf = { runId: `claim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, art: 'admin' as const, rechner: ich, by: username, start: new Date().toISOString(), slot }
        if (!(await claimJob(job.id, lauf))) continue
        void useBackupRunStore.getState().run({ ...job, lauf }, { slot, by: username, claimed: true })
        return
      }
    } finally { tickLaeuft = false }
  }, [isAdmin, username])

  useEffect(() => {
    if (!username) return
    // Erster Lauf entzerrt: sonst greifen beim Start alle Controller gleichzeitig
    // aufs Netzlaufwerk zu und das Fenster hakt in den ersten Sekunden.
    const startAbbrechen = ersterLaufEntzerrt(() => { void tick() })
    const t = setInterval(() => { void tick() }, POLL_MS)
    // Nach einem Lauf zeitnah den nächsten fälligen Job prüfen
    let vorher = useBackupRunStore.getState().fertigZaehler
    const abo = useBackupRunStore.subscribe(s => {
      if (s.fertigZaehler !== vorher) { vorher = s.fertigZaehler; setTimeout(() => { void tick() }, 20_000) }
    })
    // Beim Zurückkehren ins Fenster nachsehen — gebündelt und entzerrt über den
    // gemeinsamen Melder, damit nicht alle Controller gleichzeitig loslaufen.
    const abmelden = onAppFocus(() => { void tick() })
    return () => { clearInterval(t); abmelden(); startAbbrechen(); abo() }
  }, [tick, username])

  return null
}
