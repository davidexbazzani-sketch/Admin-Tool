// Terra Incognita — Gebiete der Welt: wo sie liegen und wodurch sie sich unterscheiden.
// Teil der eingefrorenen Welt-Erzeugung (siehe streu.ts): Zahlen hier bestimmen, wo Land und Orte liegen.
import { abstand } from './hex'
import { ebeneX, ebeneY, rauschen } from './streu'

export interface Gebiet {
  id: number
  name: string
  kurz: string
  /** ab dieser Höhe (0 … 65535) ist ein Feld Land — höher = weniger Inseln */
  land: number
  /** Anteil Riffe im Flachwasser in Prozent */
  riff: number
  /** ab diesem Rauschwert liegen Riff-Felder auch weiter draußen (0 = keine Riffbänke) */
  riffBank: number
  /** so viele Küstenfelder von 100 kommen als Ort in Frage */
  ortDichte: number
  /** so viele Küstenfelder von 1000 kommen als Hafenstadt in Frage */
  hafenDichte: number
  /** so viele Wasserfelder von 1000 kommen als Ort auf See in Frage */
  seeDichte: number
  /** Sicht ist ohne Laterne um 1 verringert */
  nebel?: boolean
  text: string
}

export const HEIMATSEE = 0, NEBELBAENKE = 1, EISMEER = 2, SCHAEREN = 3, BERNSTEIN = 4, KAUFMANNSSEE = 5, KORALLENMEER = 6, SARGASSO = 7, OFFENE_SEE = 8, RAND = 9

export const GEBIETE: readonly Gebiet[] = [
  { id: 0, name: 'Heimatsee', kurz: 'Heimatsee', land: 42900, riff: 3, riffBank: 0, ortDichte: 46, hafenDichte: 150, seeDichte: 20, text: 'Ruhige, vertraute Gewässer rund um Hamburg.' },
  { id: 1, name: 'Nebelbänke', kurz: 'Nebelbänke', land: 44200, riff: 10, riffBank: 0, ortDichte: 40, hafenDichte: 90, seeDichte: 22, nebel: true, text: 'Grauer Dunst liegt über dem Wasser. Ohne Laterne sieht man kaum die eigene Bugspitze.' },
  { id: 2, name: 'Eismeer', kurz: 'Eismeer', land: 44800, riff: 4, riffBank: 0, ortDichte: 36, hafenDichte: 60, seeDichte: 18, text: 'Treibeis, Robben und endlose Sommernächte. Nur ein Schiff mit Eisbug kommt hier durch.' },
  { id: 3, name: 'Schärengarten', kurz: 'Schären', land: 42000, riff: 26, riffBank: 45500, ortDichte: 44, hafenDichte: 100, seeDichte: 18, text: 'Tausend Inselchen und zwischen ihnen Riffe. Wer ohne Lot fährt, kommt nicht weit.' },
  { id: 4, name: 'Bernsteinküste', kurz: 'Bernsteinküste', land: 42800, riff: 12, riffBank: 0, ortDichte: 42, hafenDichte: 130, seeDichte: 17, text: 'Reiche Handelsstädte hinter den Schären, berühmt für Bernstein und Eisen.' },
  { id: 5, name: 'Kaufmannssee', kurz: 'Kaufmannssee', land: 43000, riff: 5, riffBank: 0, ortDichte: 44, hafenDichte: 150, seeDichte: 20, text: 'Die große Handelsstraße des Südens. Hier wechselt jede Ware den Besitzer.' },
  { id: 6, name: 'Korallenmeer', kurz: 'Korallenmeer', land: 43200, riff: 30, riffBank: 46500, ortDichte: 46, hafenDichte: 100, seeDichte: 22, text: 'Warmes, leuchtend blaues Wasser, Palmeninseln und tückische Korallenbänke.' },
  { id: 7, name: 'Sargassosee', kurz: 'Sargassosee', land: 45200, riff: 8, riffBank: 0, ortDichte: 40, hafenDichte: 60, seeDichte: 26, text: 'Teppiche aus Tang bremsen jedes Schiff. Was hier liegen bleibt, bleibt lange liegen.' },
  { id: 8, name: 'Offene See', kurz: 'Offene See', land: 46400, riff: 3, riffBank: 0, ortDichte: 44, hafenDichte: 0, seeDichte: 17, text: 'Wasser bis zum Horizont. Wochenlang kein Land – wer hier fährt, braucht einen vollen Proviantraum.' },
  // (keine Häfen, keine Dörfer — siehe welt.ts: Am Rand der Welt gibt es nur, was Meer und Inseln hergeben)
  { id: 9, name: 'Rand der Welt', kurz: 'Rand der Welt', land: 45400, riff: 10, riffBank: 0, ortDichte: 48, hafenDichte: 0, seeDichte: 30, text: 'Hier enden die Karten. Kein Hafen, kein Dorf – nur Wasser, Inseln und was noch niemand berichtet hat.' },
]

const SALZ_GRENZE = 9101, SALZ_RICHTUNG = 9102

/** in welchem Gebiet liegt das Feld? Grenzen sind unregelmäßig (Rauschen), aber für alle gleich */
export function gebietVon(q: number, r: number): number {
  const x = ebeneX(q, r), y = ebeneY(r)
  const d = abstand(q, r, 0, 0) + Math.floor(((rauschen(x, y, 110, SALZ_GRENZE) - 32768) * 5) / 32768)
  if (d <= 14) return HEIMATSEE
  // Himmelsrichtung: Vergleich von |x| und |y|, mit etwas Unruhe an der Grenze
  const unruhe = Math.floor((rauschen(x, y, 190, SALZ_RICHTUNG) - 32768) / 80)      // etwa ±400 von 1024
  const nordSued = Math.abs(y) * 1024 > Math.abs(x) * (1024 + unruhe)
  if (nordSued) {
    if (y < 0) return d <= 44 ? NEBELBAENKE : EISMEER
    return d <= 38 ? KAUFMANNSSEE : d <= 74 ? KORALLENMEER : SARGASSO
  }
  if (x > 0) return d <= 42 ? SCHAEREN : BERNSTEIN
  return d <= 78 ? OFFENE_SEE : RAND
}

/** Stufe 0 … 9: wie weit draußen ein Feld liegt — bestimmt Lohn und Anspruch */
export const stufeVon = (q: number, r: number): number => Math.min(9, Math.floor(abstand(q, r, 0, 0) / 14))
