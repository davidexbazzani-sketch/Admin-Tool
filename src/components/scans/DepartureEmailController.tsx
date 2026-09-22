// ── Austritts-Reminder: automatischer Versand (nur Davides Session) ───────────
// Prüft periodisch fällige Austritts-Reminder und verschickt sie automatisch an
// den Manager (CC support.marine). Läuft NUR in Davides Founder-Session
// (useIsFounder), da die Mail über sein Outlook = seinen Account rausgeht; ist er
// beim Sendezeitpunkt offline, wird sie beim nächsten Online-Poll nachgeholt.
// Exklusiv-Claim verhindert Doppelversand über mehrere offene Instanzen.

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsFounder } from '../../store/authStore'
import { api } from '../../electronAPI'
import { listDepartures } from '../../services/employees'
import { loadRunStatus, saveRunStatus, isStatusClaimed, claimExclusive } from '../../services/scanSchedules'
import {
  loadReminderStore, saveReminderStore, reconcile, dueDepartures, markSent,
  buildDepartureReminder, loadReminderContext, DEPARTURE_REMINDER_STATUS, SUPPORT_CC,
} from '../../services/departureReminder'

const POLL_MS = 20 * 60 * 1000

export default function DepartureEmailController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isFounder = useIsFounder()
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (!isFounder || !username || busy.current) return
    busy.current = true
    try {
      const [departures, store0] = await Promise.all([listDepartures().catch(() => []), loadReminderStore()])
      // Terminieren / seeden
      const rec = reconcile(store0, departures, new Date().toISOString())
      let store = rec.store
      if (rec.changed) await saveReminderStore(store)

      const due = dueDepartures(store, departures)
      if (due.length === 0) return

      // Exklusiv-Claim (nur eine Instanz sendet)
      const status = await loadRunStatus(DEPARTURE_REMINDER_STATUS)
      if (isStatusClaimed(status, Date.now())) return
      const token = `${username}#${Math.random().toString(36).slice(2, 10)}`
      if (!(await claimExclusive(DEPARTURE_REMINDER_STATUS, token, status))) return

      try {
        const ctx = await loadReminderContext()
        const by = user?.displayName || username
        for (const dep of due) {
          const mail = await buildDepartureReminder(dep, ctx)
          if (!mail.ok || !mail.to) continue // keine Manager-E-Mail → nur manuell (UI)
          const res = await api().sendEmailRaw({ to: mail.to, cc: SUPPORT_CC, subject: mail.subject, body: mail.body, smtp: '', port: 587 })
          if (res.success) {
            store = markSent(store, dep.id, by, new Date().toISOString())
            await saveReminderStore(store) // sofort persistieren → idempotent
          }
        }
      } finally {
        try { const cur = await loadRunStatus(DEPARTURE_REMINDER_STATUS); await saveRunStatus(DEPARTURE_REMINDER_STATUS, { ...cur, lastRunAt: new Date().toISOString(), running: undefined }) } catch { /* egal */ }
      }
    } catch { /* nächster Poll */ }
    finally { busy.current = false }
  }, [isFounder, username, user?.displayName])

  useEffect(() => {
    if (!isFounder || !username) return
    void tick()
    const t = setInterval(() => { void tick() }, POLL_MS)
    const onFocus = () => { void tick() }
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [tick, isFounder, username])

  return null
}
