// ── PC-Überwachung – Hintergrund-Takt (in App.tsx, angemeldetes Hauptfenster) ─
// Jede offene Instanz fragt jede Minute nur die kleine Sperrdatei; geprüft wird von
// genau einem Rechner (der die Sperre hält). Beim Beenden wird die Sperre freigegeben.

import { useEffect, useRef } from 'react'
import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'
import { beende, takt, type Pruefer } from './runner'
import { ladeAuftrag, speichereAuftrag } from './store'

const TAKT_MS = 60_000
const ERSTER_MS = 40_000

let aktuell: Pruefer | null = null
let rechnerName = ''

/** „Jetzt prüfen“: im Auftrag vermerken (falls ein anderer Rechner prüft) und selbst versuchen. */
export async function pruefeJetzt(id: string): Promise<string> {
  const a = await ladeAuftrag(id)
  if (a) await speichereAuftrag({ ...a, jetztPruefen: new Date().toISOString() })
  if (!aktuell) return 'Prüfung angefordert.'
  const r = await takt(aktuell, id)
  return r.gelaufen ? 'Geprüft.' : r.grund === 'ein anderer Rechner prüft' ? 'Angefordert — ein anderer Rechner prüft und holt es innerhalb einer Minute nach.' : 'Prüfung läuft bereits.'
}

export default function MonitorController() {
  const user = useAuthStore(s => s.session?.user)
  const busy = useRef(false)

  useEffect(() => {
    if (!user?.username) { aktuell = null; return }
    let weg = false
    void api().getHostname().then(h => { rechnerName = (h || '').trim().toUpperCase(); if (aktuell) aktuell.rechner = rechnerName }).catch(() => {})
    aktuell = { username: user.username, displayName: user.displayName || user.username, rechner: rechnerName }
    const lauf = async () => {
      if (weg || busy.current || !aktuell) return
      busy.current = true
      try { await takt(aktuell) } catch { /* nächster Takt */ } finally { busy.current = false }
    }
    const t1 = setTimeout(() => void lauf(), ERSTER_MS)
    const t2 = setInterval(() => void lauf(), TAKT_MS)
    const ab = () => { void beende() }
    window.addEventListener('beforeunload', ab)
    return () => { weg = true; clearTimeout(t1); clearInterval(t2); window.removeEventListener('beforeunload', ab); void beende() }
  }, [user?.username, user?.displayName])

  return null
}
