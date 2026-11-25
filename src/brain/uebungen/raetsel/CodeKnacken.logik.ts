// Code knacken — Logik ohne Oberfläche: Geheimcode erzeugen, Tipp bewerten, werten.
//
// Ein geheimer Farbcode ist zu erraten. Nach jedem Tipp gibt es zwei Zahlen:
//   „richtig“  = richtige Farbe am richtigen Platz
//   „verdreht“ = richtige Farbe, aber am falschen Platz
// (gezählt wie beim klassischen Spiel: je Farbe höchstens so oft, wie sie im Code vorkommt).
//
// Stufen (Stellen · Farben · doppelte Farben · Versuche · guter Wert):
//    1  4 Stellen · 5 Farben · nein · 10 Versuche · gut: 4       6  4 Stellen · 8 Farben · ja · 10 Versuche · gut: 6
//    2  4 Stellen · 6 Farben · nein · 10 Versuche · gut: 5       7  5 Stellen · 6 Farben · ja · 10 Versuche · gut: 6
//    3  4 Stellen · 7 Farben · nein · 10 Versuche · gut: 5       8  5 Stellen · 7 Farben · ja ·  9 Versuche · gut: 7
//    4  4 Stellen · 6 Farben · ja   · 10 Versuche · gut: 5       9  5 Stellen · 8 Farben · ja ·  9 Versuche · gut: 7
//    5  4 Stellen · 7 Farben · ja   · 10 Versuche · gut: 6      10  5 Stellen · 8 Farben · ja ·  8 Versuche · gut: 7
//
// Wertung: nach der Zahl der Versuche — bis einen unter dem guten Wert 1,0, beim guten Wert 0,88, je
// weiterem Versuch 0,12 weniger (mindestens 0,4). Die Zeit zählt nur wenig (Richtzeit: guter Wert ×
// (12 s + 3 s je Stelle)). Nicht geknackt oder aufgegeben: höchstens 0,3.
import type { Rng } from '../../kern/zufall'
import { klemme } from '../../kern/zufall'
import { guete, tempoAus } from '../../kern/wertung'

export interface CodeStufe { stellen: number; farben: number; doppelt: boolean; versuche: number; gut: number }
export interface CodeBewertung { /** richtige Farbe am richtigen Platz */ platz: number; /** richtige Farbe am falschen Platz */ farbe: number }

const STUFEN: CodeStufe[] = [
  { stellen: 4, farben: 5, doppelt: false, versuche: 10, gut: 4 },
  { stellen: 4, farben: 6, doppelt: false, versuche: 10, gut: 5 },
  { stellen: 4, farben: 7, doppelt: false, versuche: 10, gut: 5 },
  { stellen: 4, farben: 6, doppelt: true, versuche: 10, gut: 5 },
  { stellen: 4, farben: 7, doppelt: true, versuche: 10, gut: 6 },
  { stellen: 4, farben: 8, doppelt: true, versuche: 10, gut: 6 },
  { stellen: 5, farben: 6, doppelt: true, versuche: 10, gut: 6 },
  { stellen: 5, farben: 7, doppelt: true, versuche: 9, gut: 7 },
  { stellen: 5, farben: 8, doppelt: true, versuche: 9, gut: 7 },
  { stellen: 5, farben: 8, doppelt: true, versuche: 8, gut: 7 },
]
export const codeStufe = (stufe: number): CodeStufe => STUFEN[klemme(Math.round(stufe), 1, 10) - 1]

/** Geheimcode: je Stelle eine Farbe 0 … farben−1. Gleicher Zufall + gleiche Stufe = gleicher Code. */
export function codeErzeuge(r: Rng, stufe: number): number[] {
  const st = codeStufe(stufe)
  const farben = Array.from({ length: st.farben }, (_, i) => i)
  if (!st.doppelt) return r.ausN(farben, st.stellen)
  return Array.from({ length: st.stellen }, () => r.int(0, st.farben - 1))
}

/** Tipp bewerten (klassische Zählung, stimmt auch bei doppelten Farben). */
export function codeBewerte(geheim: readonly number[], tipp: readonly number[]): CodeBewertung {
  let platz = 0
  const imCode = new Map<number, number>(), imTipp = new Map<number, number>()
  for (let i = 0; i < geheim.length; i++) {
    if (geheim[i] === tipp[i]) platz++
    imCode.set(geheim[i], (imCode.get(geheim[i]) ?? 0) + 1)
    imTipp.set(tipp[i], (imTipp.get(tipp[i]) ?? 0) + 1)
  }
  // je Farbe zählt die kleinere der beiden Häufigkeiten; davon gehen die Volltreffer ab
  let gemeinsam = 0
  for (const [f, a] of imCode) gemeinsam += Math.min(a, imTipp.get(f) ?? 0)
  return { platz, farbe: gemeinsam - platz }
}

/** Richtzeit in Sekunden */
export const codeRichtSek = (st: CodeStufe): number => st.gut * (12 + 3 * st.stellen)

/** Güte eines geknackten Codes: nach der Zahl der Versuche, die Zeit zählt nur wenig. */
export function codeLeistung(stufe: number, versuche: number, ms: number): number {
  const st = codeStufe(stufe)
  const sorgfalt = versuche <= st.gut - 1 ? 1 : klemme(0.88 - 0.12 * (versuche - st.gut), 0.4, 1)
  const richt = codeRichtSek(st) * 1000
  return guete(sorgfalt, tempoAus(ms, richt * 0.5, richt * 2))
}

/** Güte, wenn der Code nicht geknackt wurde: höchstens 0,3 — je nach bestem Tipp (Volltreffer zählen doppelt). */
export function codeFehlLeistung(stufe: number, bestePlatz: number, besteFarbe: number): number {
  const st = codeStufe(stufe)
  return klemme(0.3 * (2 * bestePlatz + besteFarbe) / (2 * st.stellen), 0, 0.3)
}
