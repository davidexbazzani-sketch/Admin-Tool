// Merkfolge: Eine Zeichenfolge wird kurz gezeigt und dann ausgeblendet — danach eine Frage dazu.
// (Merkfähigkeit / Arbeitsgedächtnis; als Aufgabenart auch im IQ-Test)
//
// Stufe 1–3: 4–6 Ziffern, „Welche Folge hast du gesehen?“ · 4–6: 6–8 Ziffern, RÜCKWÄRTS ·
// 7–8: 7–8 Buchstaben und Ziffern gemischt, Frage nach einer Stelle oder dem Nachfolger ·
// 9–10: 9–10 Zeichen, zwei Stellen bzw. Zählfragen. Die Zeigedauer wächst mit der Länge
// (0,8–0,9 s je Zeichen), die falschen Antworten unterscheiden sich nur in ein bis zwei Stellen.
import type { Darstellung, Frage, FragenGenerator } from '../kern/typen'
import { T } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { klemme } from '../kern/zufall'
import { mischeAuswahl, textAuswahl } from './hilfen'

const ZIFFERN = '0123456789'.split('')
// leicht verwechselbare Buchstaben (I/1, O/0, S/5 …) fehlen bewusst
const BUCHSTABEN = 'ABCDEFGHKLMNPRTUVWXYZ'.split('')
const zeig = (z: string[]): string => z.join(' ')

/** Folge ohne gleiche Nachbarn */
function folge(r: Rng, n: number, vorrat: string[]): string[] {
  const aus: string[] = []
  while (aus.length < n) { const z = r.aus(vorrat); if (aus[aus.length - 1] !== z) aus.push(z) }
  return aus
}
/** ähnliche, aber falsche Folgen: zwei Nachbarn vertauscht bzw. eine Stelle verändert */
function aehnliche(r: Rng, f: string[], vorrat: string[]): string[][] {
  const aus: string[][] = []
  for (let v = 0; v < 30; v++) {
    const k = f.slice()
    if (r.chance(0.5)) {
      const i = r.int(0, k.length - 2)
      if (k[i] === k[i + 1]) continue
      ;[k[i], k[i + 1]] = [k[i + 1], k[i]]
    } else {
      const i = r.int(0, k.length - 1)
      k[i] = r.aus(vorrat.filter(z => z !== k[i]))
    }
    aus.push(k)
  }
  return aus
}
const ordnung = (i: number) => `${i}.`

export const erzeuge: FragenGenerator = (r, stufeRoh): Frage => {
  const s = klemme(Math.round(stufeRoh), 1, 10)
  const zeit = 25

  if (s <= 6) {
    const n = s <= 3 ? s + 3 : s + 2            // 4,5,6 | 6,7,8
    const f = folge(r, n, ZIFFERN)
    const rueck = s >= 4
    const ziel = rueck ? f.slice().reverse() : f
    const falsche = aehnliche(r, ziel, ZIFFERN)
    // beliebter Fehler beim Rückwärts-Merken: die Folge vorwärts
    if (rueck) falsche.unshift(f)
    const { optionen, richtig } = mischeAuswahl(r, ziel, falsche, z => T(zeig(z)), z => z.join(''), 4)
    return {
      aufgabe: rueck ? 'Wie lautet die Folge RÜCKWÄRTS?' : 'Welche Folge hast du gesehen?',
      vorab: { zeige: T(zeig(f)), sek: Math.round(n * 0.9 * 10) / 10 + 1, hinweis: rueck ? 'Präge dir die Folge ein — gefragt wird RÜCKWÄRTS' : 'Präge dir die Folge ein' },
      optionen, richtig, spalten: 2,
      erklaerung: `Gezeigt wurde ${zeig(f)}${rueck ? ` — rückwärts also ${zeig(ziel)}` : ''}.`,
      zeitSek: zeit,
    }
  }

  // gemischte Zeichen, Fragen nach Stellen
  const n = s <= 8 ? s : s                        // 7,8,9,10
  let f: string[] = []
  // jedes Zeichen nur einmal → Fragen nach „dem Zeichen nach X“ sind eindeutig
  f = r.ausN([...BUCHSTABEN, ...ZIFFERN.slice(2)], n)
  const sek = Math.round(n * 0.85 * 10) / 10 + 1
  const vorab = { zeige: T(zeig(f)), sek, hinweis: 'Präge dir die Zeichen und ihre Reihenfolge ein' }
  const art = s <= 8 ? r.aus(['stelle', 'danach'] as const) : r.aus(['stelle', 'danach', 'davor', 'zwischen'] as const)
  let aufgabe: string, antwort: string, erkl: string
  if (art === 'stelle') {
    const i = r.int(1, n - 2)                     // nicht das erste/letzte (zu leicht)
    aufgabe = `Welches Zeichen stand an ${ordnung(i + 1)} Stelle?`
    antwort = f[i]; erkl = `An ${ordnung(i + 1)} Stelle stand ${f[i]}.`
  } else if (art === 'danach') {
    const i = r.int(0, n - 2)
    aufgabe = `Welches Zeichen kam direkt NACH „${f[i]}“?`
    antwort = f[i + 1]; erkl = `Nach ${f[i]} kam ${f[i + 1]}.`
  } else if (art === 'davor') {
    const i = r.int(1, n - 1)
    aufgabe = `Welches Zeichen kam direkt VOR „${f[i]}“?`
    antwort = f[i - 1]; erkl = `Vor ${f[i]} kam ${f[i - 1]}.`
  } else {
    const i = r.int(0, n - 3)
    aufgabe = `Welches Zeichen stand ZWISCHEN „${f[i]}“ und „${f[i + 2]}“?`
    antwort = f[i + 1]; erkl = `Zwischen ${f[i]} und ${f[i + 2]} stand ${f[i + 1]}.`
  }
  // falsche Antworten: andere Zeichen der Folge (naheliegend) — bevorzugt die Nachbarn
  const andere = f.filter(z => z !== antwort)
  const { optionen, richtig } = textAuswahl(r, antwort, andere, 5)
  const opt: Darstellung[] = optionen
  return { aufgabe, vorab, optionen: opt, richtig, spalten: 5, erklaerung: `Gezeigt wurde ${zeig(f)}. ${erkl}`, zeitSek: zeit }
}
