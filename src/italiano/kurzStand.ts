// Parla Italiano — der Stand in einem Satz, für die Pausenraum-Kachel und die tägliche Erinnerung.
// Liest den verschlüsselten Lernstand über denselben Speicher wie der Kurs; lädt aber weder die
// Lerninhalte noch die Oberfläche des Kurses.
import { useItaliano } from './kern/speicher'
import { tagesStand } from './kern/stand'
import { serie } from './kern/serie'
import { heute } from './kern/zeit'
import { station, AM_ZIEL } from './kern/lehrplan'

export interface KurzStand {
  /** hat der Benutzer den Kurs schon begonnen? */
  begonnen: boolean
  level: number
  ort: string
  /** ist für heute noch etwas offen (Lektion, Tagestest oder Prüfung)? */
  offen: boolean
  /** ein Satz, was heute dran ist */
  text: string
  /** wie lange das Offene ungefähr dauert („15 Minuten genügen“) – leer, wenn nichts offen ist */
  dauer: string
  serie: number
  /** Erinnerung gewünscht, und ab wann (HH:MM) */
  erinnerung: boolean
  erinnerungUm: string
}

export async function ladeKurzStand(benutzer: string): Promise<KurzStand | null> {
  if (!benutzer) return null
  await useItaliano.getState().lade(benutzer)
  const z = useItaliano.getState()
  if (z.benutzer.toLowerCase() !== benutzer.toLowerCase()) return null
  const d = z.daten
  const begonnen = d.lektionen > 0 || Object.keys(d.tage).length > 0 || d.level > 1
  const h = heute()
  const s = tagesStand(d, h)
  const amZiel = d.level >= AM_ZIEL
  const ort = amZiel ? 'Cagliari' : station(d.level).ort
  let text = '', dauer = '', offen = false
  if (amZiel) text = 'Am Ziel – das Training hält dein Italienisch frisch'
  else if (s.lektion === 'frei' && s.naechsterTag) { text = `Heute wartet Lerntag ${s.naechsterTag}`; dauer = '15 Minuten genügen'; offen = true }
  else if (s.testOffen) { text = 'Der Tagestest ist noch offen'; dauer = '5 Minuten genügen'; offen = true }
  else if (s.pruefungOffen) { text = `Die Prüfung in ${station(s.pruefungOffen).ort} wartet`; dauer = 'etwa 12 Minuten'; offen = true }
  else text = 'Für heute geschafft'
  return { begonnen, level: d.level, ort, offen, text, dauer, serie: serie(d, h).aktuell, erinnerung: d.einstellungen.erinnerung !== false, erinnerungUm: d.einstellungen.erinnerungUm || '11:30' }
}
