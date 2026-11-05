// ── Toner-Warnung – Hintergrund ───────────────────────────────────────────────
// Läuft im angemeldeten Hauptfenster (App.tsx, neben dem ChatController):
//   • alle 2 Min (und beim Zurückkehren ins Tool) den gemeinsamen Stand lesen → Popups
//   • alle 10 Min fragen, ob eine Drucker-Prüfung fällig ist — automatisch geprüft wird nur
//     vor 07:00 / ab 16:00, höchstens alle 3 Stunden und nur von EINEM Rechner, gedrosselt
//     (siehe services/druckerFlotte.ts) — tagsüber bleibt das Netz in Ruhe
// Die Popups selbst rendert der ChatController im gemeinsamen Stapel oben rechts.

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useTonerWarnungStore } from '../../store/tonerWarnungStore'
import { ladeStand, ladeBestaetigt, bestaetige } from '../../services/tonerWarnung'
import { pruefeAlleDrucker, imScanFenster } from '../../services/druckerFlotte'
import { onAppFocus } from '../../utils/appFocus'
import { ipcRenderer } from '../../utils/ipc'

const LESEN_MS = 2 * 60_000
const PRUEFEN_MS = 10 * 60_000
const ERSTE_PRUEFUNG_MS = 3 * 60_000     // nach dem Start erst einmal Ruhe

export default function TonerWarnungController() {
  const username = useAuthStore(s => s.session?.user?.username || '')
  const ich = useRef(username)
  ich.current = username
  const bekannt = useRef<Set<string> | null>(null)
  const busy = useRef(false)

  const lesen = useCallback(async () => {
    const me = ich.current
    if (!me || busy.current) return
    busy.current = true
    try {
      const [stand, gelesen] = await Promise.all([ladeStand(), ladeBestaetigt(me)])
      if (!stand) return
      const offen = stand.warnungen.filter(w => w.aktiv && !gelesen.has(w.id))
        .sort((a, b) => a.prozent - b.prozent || a.drucker.localeCompare(b.drucker))
      // Neue Warnung, während das Tool im Hintergrund ist → Windows-Benachrichtigung
      const erstesMal = bekannt.current === null
      const neu = offen.filter(w => !bekannt.current?.has(w.id))
      bekannt.current = new Set(offen.map(w => w.id))
      if (!erstesMal && neu.length && !document.hasFocus()) {
        try {
          const n = new Notification(neu.length === 1 ? `Toner fast leer: ${neu[0].drucker}` : `${neu.length} Toner fast leer`, {
            body: neu.map(w => `${w.drucker}: ${w.material} (${w.prozent} %)`).join('\n'), tag: 'toner-warnung',
          })
          n.onclick = () => ipcRenderer('window:focus')
        } catch { /* Benachrichtigungen nicht verfügbar */ }
      }
      useTonerWarnungStore.getState().setOffen(offen)
    } finally { busy.current = false }
  }, [])

  const bestaetigen = useCallback(async (ids: string[]) => {
    const me = ich.current
    if (!me || !ids.length) return
    const st = useTonerWarnungStore.getState()
    const rest = st.offen.filter(w => !ids.includes(w.id))
    st.setOffen(rest)                                         // sofort weg — Speichern im Hintergrund
    const stand = await ladeStand()
    const aktiv = (stand?.warnungen || []).filter(w => w.aktiv).map(w => w.id)
    if (!(await bestaetige(me, ids, aktiv))) void lesen()     // nicht gespeichert → beim nächsten Lesen wieder da
  }, [lesen])

  const pruefen = useCallback(async () => {
    const me = ich.current
    if (!me || !imScanFenster()) return     // tagsüber nicht einmal nachsehen
    const r = await pruefeAlleDrucker(me).catch(() => null)
    if (r?.gelaufen) void lesen()
  }, [lesen])

  useEffect(() => {
    if (!username) return
    bekannt.current = null
    useTonerWarnungStore.getState().setBestaetigen(ids => void bestaetigen(ids))
    const t0 = setTimeout(() => void lesen(), 8_000)
    const t1 = setTimeout(() => void pruefen(), ERSTE_PRUEFUNG_MS)
    const l = setInterval(() => void lesen(), LESEN_MS)
    const p = setInterval(() => void pruefen(), PRUEFEN_MS)
    const fokus = onAppFocus(() => void lesen(), 60_000)
    return () => {
      clearTimeout(t0); clearTimeout(t1); clearInterval(l); clearInterval(p); fokus()
      useTonerWarnungStore.getState().setBestaetigen(null)
      useTonerWarnungStore.getState().setOffen([])
    }
  }, [username, lesen, pruefen, bestaetigen])

  return null
}
