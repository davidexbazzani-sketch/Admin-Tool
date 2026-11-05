// ── PC-Aufgaben: Ergebnisse einsammeln ───────────────────────────────────────
// Eine PC-Aufgabe (lokales Ziel) läuft autonom auf dem PC — auch wenn kein Tool offen
// ist. Ihr Baustein legt je Lauf eine ergebnis.json ab (C:\ProgramData\ITAdminTool\
// Backups\<Aufgabe>\logs\<Lauf>\). Hier werden neue Ergebnisse per \\PC\C$ gelesen
// (ohne WinRM), in den Verlauf übernommen und der neueste als lastReport am Job gesetzt.

import { liesPcErgebnisse, type LaufStatus } from './backupEngine'
import { bewerteErgebnis } from './backupBericht'
import { updateJob, recordRuns, runAusBericht, stufeZuResult, type BackupJob } from './backups'

export interface PcSyncStand { erreichbar: boolean; fehler?: string; laeuft: LaufStatus | null; neu: number }

export async function syncPcErgebnisse(job: BackupJob): Promise<PcSyncStand> {
  const r = await liesPcErgebnisse(job)
  if (!r.lesbar && !r.ergebnisse.length) return { erreichbar: false, fehler: r.fehler, laeuft: null, neu: 0 }
  const laeuft = r.status && r.status.phase !== 'fertig' && r.status.aktualisiert && Date.now() - new Date(r.status.aktualisiert).getTime() < 3 * 60_000 ? r.status : null
  const fertige = r.ergebnisse.filter(e => e.runId && e.ende)
  if (!fertige.length) return { erreichbar: true, laeuft, neu: 0 }
  const eintraege = fertige.map(e => {
    const b = { ...bewerteErgebnis(e), art: 'pc' as const }
    return { e, b, run: runAusBericht(job.id, b, { slot: `pc:${e.runId}`, runId: e.runId, by: 'PC-Aufgabe', art: 'pc-aufgabe' }) }
  })
  await recordRuns(eintraege.map(x => x.run))
  const neuester = eintraege.sort((a, b) => (b.e.ende ?? '').localeCompare(a.e.ende ?? ''))[0]
  const bekannt = job.lastRun ? new Date(job.lastRun).getTime() : 0
  const endeMs = new Date(neuester.e.ende ?? 0).getTime()
  let neu = 0
  if (neuester.e.runId !== job.lastRunId && endeMs > bekannt + 1000 && !job.lauf) {
    neu = 1
    await updateJob(job.id, {
      lastRun: neuester.e.ende, lastResult: stufeZuResult(neuester.b.stufe), lastMessage: neuester.b.titel,
      lastReport: neuester.b, lastRunId: neuester.e.runId,
    })
  }
  return { erreichbar: true, laeuft, neu }
}
