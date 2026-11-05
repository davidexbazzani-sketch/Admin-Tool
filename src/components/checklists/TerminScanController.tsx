// ── Übergabe-Termine: Antworten automatisch im Hintergrund abgleichen ──────────
// Antworten auf eine Einladung landen beim ABSENDER (und ggf. im IT-Support-Postfach,
// wenn der Mitarbeiter „Allen antworten" nutzt). Den Teilnehmerstatus (Zusage/Absage)
// führt Outlook nur im Kalender des Absenders. Darum prüft jeder Admin mit offenem Tool
// regelmäßig SEIN Postfach + SEINEN Kalender für die Einladungen, die ER verschickt hat.
//
// Leichtgewichtig: nur wenn es eigene offene Termine gibt und Outlook bereits läuft
// (Outlook wird nicht im Hintergrund gestartet). Kein Fokus-Auslöser (siehe appFocus.ts).

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { api } from '../../electronAPI'
import { ladeTermine, postfachScan, kennung as kennungVon, ausLokal } from '../../services/uebergabeTermine'
import { ersterLaufEntzerrt } from '../../utils/appFocus'

const POLL_MS = 20 * 60 * 1000
const OFFEN = ['geplant', 'zugesagt', 'verschoben', 'abgesagt']

export default function TerminScanController() {
  const user = useAuthStore(s => s.session?.user)
  const isAdmin = useIsAdmin()
  const busy = useRef(false)
  const ich = kennungVon(user)

  const tick = useCallback(async () => {
    if (!isAdmin || !user || busy.current) return
    busy.current = true
    try {
      const store = await ladeTermine()
      const grenze = Date.now() - 86400000
      const eigene = store.termine.filter(t => OFFEN.includes(t.status) && ausLokal(t.ende).getTime() > grenze
        && (t.outlook?.gesendetBy === ich || t.nachricht?.by === ich))
      if (!eigene.length) return
      // Nur wenn Outlook schon läuft — sonst würde die COM-Abfrage Outlook unsichtbar starten
      const p = await api().runPowerShell("if (Get-Process OUTLOOK -EA SilentlyContinue) { 'JA' }", 15000).catch(() => null)
      if (!p || !(p.stdout || '').includes('JA')) return
      await postfachScan(ich)
    } catch { /* nächster Durchlauf */ } finally {
      busy.current = false
    }
  }, [isAdmin, user, ich])

  useEffect(() => {
    if (!user) return
    const startAbbrechen = ersterLaufEntzerrt(() => { void tick() })
    const t = setInterval(() => { void tick() }, POLL_MS)
    return () => { clearInterval(t); startAbbrechen() }
  }, [tick, user])

  return null
}
