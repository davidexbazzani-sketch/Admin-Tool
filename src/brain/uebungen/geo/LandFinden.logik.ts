// „Land finden“ – Logik ohne Oberfläche (testbar): Stufen, Reihenfolge der Länder, Wertung.
import type { Rohergebnis } from '../../kern/typen'
import { rng, klemme } from '../../kern/zufall'
import { guete, tempoAus } from '../../kern/wertung'
import { LAENDER, type Kontinent, type Land } from '../../geo/laender'
import { weltLand, type AusschnittName } from '../../geo/welt'

/** Ein Topf = aus welchen Ländern ein Durchgang gezogen wird und welcher Kartenausschnitt dazu passt */
export interface Topf {
  name: string
  ausschnitt: AusschnittName
  /** leer = alle Erdteile */
  kontinente?: Kontinent[]
  rangVon: number
  rangBis: number
}

const T = (name: string, ausschnitt: AusschnittName, rangVon: number, rangBis: number, kontinente?: Kontinent[]): Topf => ({ name, ausschnitt, rangVon, rangBis, kontinente })
const OHNE_EUROPA: Kontinent[] = ['asien', 'afrika', 'nordamerika', 'suedamerika', 'ozeanien']

/** Je Stufe: mögliche Töpfe (je Durchgang wird einer gezogen) und Zeit je Land */
export const FINDEN_STUFEN: { toepfe: Topf[]; zeitSek: number }[] = [
  { zeitSek: 15, toepfe: [T('Europa – die bekannten Länder', 'europa', 1, 2, ['europa'])] },
  { zeitSek: 14, toepfe: [T('Europa', 'europa', 1, 3, ['europa'])] },
  { zeitSek: 13, toepfe: [T('Nord- und Mittelamerika', 'nordamerika', 1, 3, ['nordamerika']), T('Südamerika', 'suedamerika', 1, 3, ['suedamerika'])] },
  { zeitSek: 12, toepfe: [T('Asien – die bekannten Länder', 'asien', 1, 2, ['asien']), T('Afrika – die bekannten Länder', 'afrika', 1, 3, ['afrika'])] },
  { zeitSek: 12, toepfe: [T('Welt ohne Europa – die bekannten Länder', 'welt', 1, 2, OHNE_EUROPA), T('Europa – die weniger bekannten Länder', 'europa', 2, 4, ['europa'])] },
  { zeitSek: 11, toepfe: [T('Asien', 'asien', 1, 3, ['asien']), T('Afrika', 'afrika', 2, 4, ['afrika']), T('Welt – die bekannten Länder', 'welt', 1, 2)] },
  { zeitSek: 10, toepfe: [T('Welt', 'welt', 2, 3)] },
  { zeitSek: 10, toepfe: [T('Afrika – die schweren Länder', 'afrika', 3, 5, ['afrika']), T('Asien – die schweren Länder', 'asien', 3, 5, ['asien']), T('Mittelamerika und Karibik', 'nordamerika', 3, 5, ['nordamerika'])] },
  { zeitSek: 9, toepfe: [T('Welt – die weniger bekannten Länder', 'welt', 3, 4)] },
  { zeitSek: 8, toepfe: [T('Welt – die schweren Länder', 'welt', 4, 5)] },
]

export const FINDEN_ANZAHL = 10

export const topfLaender = (t: Topf): Land[] =>
  LAENDER.filter(l => l.rang >= t.rangVon && l.rang <= t.rangBis && (!t.kontinente || t.kontinente.includes(l.kontinent)))

export interface FindenPlan { topf: Topf; laender: Land[]; zeitSek: number }

/** Training: Topf und die zehn Länder eines Durchgangs (ohne Wiederholung) */
export function findenPlan(start: number, stufe: number): FindenPlan {
  const s = klemme(Math.round(stufe), 1, 10)
  const r = rng(start)
  const { toepfe, zeitSek } = FINDEN_STUFEN[s - 1]
  const topf = r.aus(toepfe)
  return { topf, laender: r.ausN(topfLaender(topf), FINDEN_ANZAHL), zeitSek }
}

/**
 * Duell: feste mittlere Schwierigkeit – bekannte Länder der ganzen Welt (Rang 1–2), auf der Weltkarte.
 * Länder, die dort nur wenige Pixel groß sind, bleiben weg (sonst entscheidet die ruhige Hand statt des Wissens).
 */
export const DUELL_TOPF: Topf = T('Welt – die bekannten Länder', 'welt', 1, 2)
export const duellLaender = (): Land[] => topfLaender(DUELL_TOPF).filter(l => (weltLand(l.id)?.r ?? 0) >= 3.4)

/** die Folge einer Runde: alle Länder einmal, neu gemischt; nie mit dem Land beginnen, mit dem die vorige Runde aufgehört hat */
function duellRunde(start: number, runde: number, alle: Land[]): Land[] {
  const folge = rng(start).zweig(`runde${runde}`).misch(alle)
  if (runde > 0) {
    const davor = duellRunde(start, runde - 1, alle)
    if (folge[0].id === davor[davor.length - 1].id) [folge[0], folge[1]] = [folge[1], folge[0]]
  }
  return folge
}

/** Duell: das Land Nummer `nr` (0, 1, 2 …) einer endlosen Folge – für beide Spieler gleich, nie zweimal dasselbe hintereinander */
export function duellLand(start: number, nr: number): Land {
  const alle = duellLaender()
  return duellRunde(start, Math.floor(nr / alle.length), alle)[nr % alle.length]
}

export interface FindenAntwort { richtig: boolean; ms: number }

const median = (w: number[]): number => {
  if (!w.length) return 0
  const s = w.slice().sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const sekText = (ms: number): string => (ms / 1000).toFixed(1).replace('.', ',')

/** Duell-Punkte: +10 je richtiges Land, −5 je falsches, nie unter 0 */
export const findenPunkte = (antworten: FindenAntwort[]): number => {
  const r = antworten.filter(a => a.richtig).length
  return Math.max(0, r * 10 - (antworten.length - r) * 5)
}

/**
 * Training: Güte aus Trefferquote und Tempo. Tempo zählt nur für richtige Antworten:
 * 2,5 s (oder schneller) = volles Tempo, die ganze Zeit ausgeschöpft = keines.
 */
export function findenWertung(antworten: FindenAntwort[], gesamt: number, zeitSek: number): Rohergebnis {
  const gut = antworten.filter(a => a.richtig)
  const tempo = gut.length ? gut.reduce((s, a) => s + tempoAus(a.ms, 2500, zeitSek * 1000), 0) / gut.length : 0
  const rt = Math.round(median(gut.map(a => a.ms)))
  return {
    leistung: guete(gesamt ? gut.length / gesamt : 0, tempo),
    richtig: gut.length, gesamt,
    rtMs: rt || undefined,
    text: gut.length ? `Ø ${sekText(rt)} s je Land` : undefined,
    duellPunkte: findenPunkte(antworten),
  }
}

/** Duell: Güte aus Trefferquote und Menge (Richtwert: ein richtiges Land je 5 Sekunden) */
export function findenDuellWertung(antworten: FindenAntwort[], dauerSek: number): Rohergebnis {
  const gut = antworten.filter(a => a.richtig)
  const rt = Math.round(median(gut.map(a => a.ms)))
  return {
    leistung: guete(antworten.length ? gut.length / antworten.length : 0, Math.min(1, gut.length / Math.max(1, dauerSek / 5))),
    richtig: gut.length, gesamt: antworten.length,
    rtMs: rt || undefined,
    text: gut.length ? `Ø ${sekText(rt)} s je Land` : undefined,
    duellPunkte: findenPunkte(antworten),
  }
}
