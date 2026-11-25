// Anagramme — reine Logik (ohne Oberfläche, damit sie testbar ist): Wörter je Stufe, Buchstaben mischen,
// Lösung prüfen, Wertung. Die Wortliste steht in aufgaben/sprachdaten/woerter.ts.
import type { Rohergebnis } from '../../kern/typen'
import { klemme, rng, type Rng } from '../../kern/zufall'
import { guete, tempoAus } from '../../kern/wertung'
import { AUCH_GUELTIG, WOERTER, WOERTER_NACH_LAENGE } from '../../aufgaben/sprachdaten/woerter'

/** Wörter je Trainings-Durchgang */
export const ANZAHL_TRAINING = 8
/** Wortlängen im Duell — für beide Spieler gleich, unabhängig von der eigenen Stufe */
export const DUELL_LAENGEN = [5, 6]

const LAENGEN: number[][] = [[5], [5, 6], [6], [6, 7], [7], [7, 8], [8], [8, 9], [9], [9, 10]]
/** Wortlängen einer Stufe: 5 Buchstaben (Stufe 1) … 9–10 Buchstaben (Stufe 10) */
export const laengenFuer = (stufe: number): number[] => LAENGEN[klemme(Math.round(stufe), 1, 10) - 1]
/** Zeit je Wort im Training: 25 s bei 5 Buchstaben, je weiterem Buchstaben 7 s mehr (10 Buchstaben: 60 s) */
export const zeitSekFuer = (laenge: number): number => 25 + (klemme(laenge, 5, 10) - 5) * 7

/** Buchstabensatz eines Wortes (sortiert) — gleiche Kennung = Anagramme voneinander */
export const buchstabensatz = (wort: string): string => [...wort].sort().join('')

const GUELTIG = new Set<string>([...WOERTER, ...AUCH_GUELTIG])
const JE_SATZ = new Map<string, string[]>()
for (const w of GUELTIG) { const k = buchstabensatz(w); JE_SATZ.set(k, [...(JE_SATZ.get(k) ?? []), w]) }

/** alle Wörter, die aus den Buchstaben von `wort` gebildet werden können und gelten */
export const loesungenFuer = (wort: string): string[] => JE_SATZ.get(buchstabensatz(wort)) ?? [wort]
/** Stimmt die gelegte Buchstabenfolge? Jedes Listenwort mit denselben Buchstaben zählt. */
export const istLoesung = (eingabe: string, wort: string): boolean => loesungenFuer(wort).includes(eingabe.toUpperCase())
/** Ist die Buchstabenfolge ein bekanntes Wort? (so etwas darf beim Mischen nicht herauskommen) */
export const istWort = (folge: string): boolean => GUELTIG.has(folge)

/**
 * Buchstaben mischen. Das Ergebnis ist nie die Lösung und nie ein anderes bekanntes Wort, und höchstens ein
 * Viertel der Buchstaben bleibt am alten Platz (sonst läse man das Wort fast schon ab).
 */
export function mische(r: Rng, wort: string): string[] {
  const b = [...wort]
  let ersatz: string[] | null = null
  for (let i = 0; i < 120; i++) {
    const k = r.misch(b)
    if (istWort(k.join(''))) continue
    if (k.filter((x, j) => x === b[j]).length <= Math.floor(b.length / 4)) return k
    ersatz ??= k
  }
  if (ersatz) return ersatz
  // Notnagel (praktisch nie nötig): Buchstaben im Kreis verschieben, bis kein Wort dasteht
  for (let d = 1; d < b.length; d++) {
    const k = [...b.slice(d), ...b.slice(0, d)]
    if (!istWort(k.join(''))) return k
  }
  return b.slice().reverse()
}

export interface AnagrammAufgabe { wort: string; kacheln: string[]; zeitSek: number }

/**
 * Endlose Wortfolge zu einem Startwert: aufgabe(0), aufgabe(1) … Gleicher Startwert = gleiche Wörter in gleicher
 * Mischung (im Duell für beide Spieler). Innerhalb eines Durchlaufs durch den Vorrat wiederholt sich kein Wort,
 * und von Anagramm-Paaren (LAMPE/PALME) kommt nur eines.
 */
export function wortFolge(start: number, stufe: number, duell: boolean): (k: number) => AnagrammAufgabe {
  const vorrat = (duell ? DUELL_LAENGEN : laengenFuer(stufe)).flatMap(l => WOERTER_NACH_LAENGE[l] ?? [])
  const runden: string[][] = []
  const runde = (i: number): string[] => {
    while (runden.length <= i) {
      const gesehen = new Set<string>()
      runden.push(rng(start).zweig('folge' + runden.length).misch(vorrat).filter(w => {
        const s = buchstabensatz(w)
        if (gesehen.has(s)) return false
        gesehen.add(s)
        return true
      }))
    }
    return runden[i]
  }
  return k => {
    const laenge = runde(0).length
    const wort = runde(Math.floor(k / laenge))[k % laenge]
    return { wort, kacheln: mische(rng(start).zweig('misch' + k), wort), zeitSek: zeitSekFuer(wort.length) }
  }
}

/** ein bearbeitetes Wort: gelöst oder nicht (übersprungen / Zeit abgelaufen), gebrauchte und erlaubte Zeit */
export interface Versuch { geloest: boolean; ms: number; zeitMs: number }

/** Duell-Punkte: +10 je gelöstes Wort, −5 je übersprungenes, nie unter 0 */
export function duellPunkte(v: Versuch[]): number {
  const gut = v.filter(x => x.geloest).length
  return Math.max(0, gut * 10 - (v.length - gut) * 5)
}

const median = (w: number[]): number => {
  if (!w.length) return 0
  const s = w.slice().sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/**
 * Wertung eines Durchgangs.
 * Training: Anteil gelöster Wörter (von `gesamt`) und Tempo — volle Tempo-Punkte bis zu einem Viertel der
 *           erlaubten Zeit, keine mehr bei voller Zeit.
 * Duell:    Anteil gelöster unter den bearbeiteten Wörtern und Menge (Richtwert: ein Wort je 8 Sekunden).
 */
export function wertung(v: Versuch[], gesamt: number, duellSek?: number): Rohergebnis {
  const gut = v.filter(x => x.geloest)
  const tempo = gut.length ? gut.reduce((s, x) => s + tempoAus(x.ms, x.zeitMs * 0.25, x.zeitMs), 0) / gut.length : 0
  const leistung = duellSek
    ? guete(v.length ? gut.length / v.length : 0, Math.min(1, gut.length / Math.max(1, duellSek / 8)))
    : guete(gesamt ? gut.length / gesamt : 0, tempo)
  const mitte = median(gut.map(x => x.ms))
  return {
    leistung,
    richtig: gut.length,
    gesamt: duellSek ? v.length : gesamt,
    rtMs: mitte ? Math.round(mitte) : undefined,
    text: mitte ? `${(mitte / 1000).toFixed(1).replace('.', ',')} s je Wort` : undefined,
    duellPunkte: duellPunkte(v),
  }
}
