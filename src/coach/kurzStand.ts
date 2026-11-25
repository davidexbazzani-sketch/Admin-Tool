// Der Coach — der Stand in einem Satz, für die Pausenraum-Kachel und die Erinnerung.
// Liest den verschlüsselten Lernstand über denselben Speicher wie der Raum; lädt weder Inhalte noch Oberfläche.
// Nennt nie Bereiche, Schwerpunkte oder Titel (Diskretion: nichts Persönliches außerhalb des Raums).
import { setzeHost, host } from './host/aktiv'
import { adminToolHost } from './host/adminTool'
import { useCoach } from './kern/speicher'
import { serie } from './kern/serie'
import { heute, uhrzeit } from './kern/zeit'

setzeHost(adminToolHost)

export interface CoachKurz {
  darf: boolean
  begonnen: boolean
  diskret: boolean
  /** Training heute schon gemacht? */
  heuteFertig: boolean
  /** heute ein Trainingstag? */
  trainingstag: boolean
  serie: number
  runde: number
  woche: string
  erinnerung: { an: boolean; um: string; windows: boolean }
  /** Uhrzeit erreicht? */
  zeit: boolean
}

export async function ladeCoachKurz(): Promise<CoachKurz | null> {
  const h = host()
  const benutzer = h.benutzer()
  if (!benutzer) return null
  if (!h.darfSehen()) return { darf: false, begonnen: false, diskret: true, heuteFertig: false, trainingstag: false, serie: 0, runde: 1, woche: '', erinnerung: { an: false, um: '10:00', windows: false }, zeit: false }
  await useCoach.getState().lade(benutzer)
  const d = useCoach.getState().daten
  const tag = heute()
  const s = serie(d, tag)
  const wt = new Date(`${tag}T12:00:00`).getDay() || 7
  return {
    darf: true, begonnen: d.eingestiegen, diskret: d.profil.diskret, heuteFertig: s.heute, trainingstag: d.profil.tage.includes(wt),
    serie: s.aktuell, runde: d.runde.nr, woche: `${s.woche.geschafft} von ${s.woche.ziel}`,
    erinnerung: { an: d.profil.erinnerung.an, um: d.profil.erinnerung.um, windows: d.profil.erinnerung.windows },
    zeit: uhrzeit() >= d.profil.erinnerung.um,
  }
}
