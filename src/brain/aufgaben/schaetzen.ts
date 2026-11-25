// Schätzen: Nicht ausrechnen — überschlagen. Welcher Wert liegt am nächsten?
// (Zahlengefühl: Größenordnungen sicher einschätzen)
//
// Stufe 1–2: Summen · 3–4: Produkte · 5: Teilen · 6: Prozent · 7: große Produkte ·
// 8: Wurzeln und Quadrate · 9: Welcher Bruch ist am größten? · 10: gemischte Ausdrücke.
// Die falschen Antworten liegen deutlich daneben (mindestens 20 %), die Zeit ist knapp.
import type { Darstellung, Frage, FragenGenerator } from '../kern/typen'
import { T } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { klemme } from '../kern/zufall'
import { zahlText } from './hilfen'

interface Ausdruck { text: string; wert: number; tipp: string }
type Bau = (r: Rng) => Ausdruck
const mal = '·'

const summe = (n: number): Bau => r => {
  const z = Array.from({ length: n }, () => r.int(13, 98))
  return { text: z.join(' + '), wert: z.reduce((a, b) => a + b, 0), tipp: `Auf Zehner runden: ${z.map(x => Math.round(x / 10) * 10).join(' + ')}` }
}
const produkt = (aMin: number, aMax: number, bMin: number, bMax: number): Bau => r => {
  const a = r.int(aMin, aMax), b = r.int(bMin, bMax)
  const ra = a >= 100 ? Math.round(a / 50) * 50 : Math.round(a / 10) * 10 || a, rb = b >= 20 ? Math.round(b / 10) * 10 : b
  return { text: `${a} ${mal} ${b}`, wert: a * b, tipp: `Runden: ${ra} ${mal} ${rb} = ${ra * rb}` }
}
const quotient: Bau = r => {
  const b = r.int(12, 48), q = r.int(11, 60), rest = r.int(0, b - 1)
  return { text: `${b * q + rest} : ${b}`, wert: (b * q + rest) / b, tipp: `${b} passt etwa ${q}-mal hinein` }
}
const prozent: Bau = r => {
  const p = r.aus([9, 11, 19, 21, 24, 26, 32, 49, 51, 74]), g = r.int(18, 95) * 10 + r.int(1, 9)
  return { text: `${p} % von ${g}`, wert: (p * g) / 100, tipp: `${p} % sind etwa ${p <= 11 ? 'ein Zehntel' : p <= 21 ? 'ein Fünftel' : p <= 26 ? 'ein Viertel' : p <= 34 ? 'ein Drittel' : p <= 51 ? 'die Hälfte' : 'drei Viertel'}` }
}
const wurzel: Bau = r => {
  if (r.chance(0.5)) { const n = r.int(30, 900); return { text: `√${n}`, wert: Math.sqrt(n), tipp: `${Math.floor(Math.sqrt(n))}² = ${Math.floor(Math.sqrt(n)) ** 2}, ${Math.ceil(Math.sqrt(n))}² = ${Math.ceil(Math.sqrt(n)) ** 2}` } }
  const a = r.int(21, 69)
  return { text: `${a}²`, wert: a * a, tipp: `${Math.round(a / 10) * 10}² = ${(Math.round(a / 10) * 10) ** 2}` }
}
const gemischt: Bau = r => {
  const a = r.int(21, 89), b = r.int(21, 69), c = r.int(11, 39)
  return { text: `${a} ${mal} ${b} : ${c}`, wert: (a * b) / c, tipp: `Erst grob ${Math.round(a / 10) * 10} ${mal} ${Math.round(b / 10) * 10}, dann durch etwa ${Math.round(c / 10) * 10 || 10}` }
}

/** „schöne“ Zahl in der Nähe (zwei gültige Ziffern) */
function schoen(x: number): number {
  if (x < 20) return Math.round(x * 2) / 2
  const stellen = Math.pow(10, Math.floor(Math.log10(x)) - 1)
  return Math.round(x / stellen) * stellen
}

function naechsterWert(r: Rng, a: Ausdruck, stufe: number): Frage {
  const richtig = schoen(a.wert)
  // Faktoren deutlich neben dem richtigen Wert; die richtige Antwort bleibt mit Abstand die nächste
  const faktoren = r.ausN([0.5, 0.65, 0.78, 1.28, 1.5, 2], 3)
  const werte = [richtig, ...faktoren.map(f => schoen(a.wert * f))]
  const eindeutig = [...new Set(werte)].sort((x, y) => x - y)
  return {
    aufgabe: 'Überschlage: Welcher Wert liegt am nächsten?',
    zeige: T(a.text),
    optionen: eindeutig.map(w => T(zahlText(w, 1))), richtig: eindeutig.indexOf(richtig), spalten: eindeutig.length,
    erklaerung: `${a.tipp}. Genau: ${zahlText(a.wert, 1)}.`,
    zeitSek: 10 + stufe * 2,
  }
}

/** Welcher Bruch ist am größten? Abstand zwischen größtem und zweitgrößtem mindestens 0,04 */
function groessterBruch(r: Rng, stufe: number): Frage {
  for (let versuch = 0; versuch < 200; versuch++) {
    const b = Array.from({ length: 4 }, () => { const n = r.int(3, 13); return { z: r.int(1, n - 1), n } })
    const w = b.map(x => x.z / x.n)
    const sortiert = w.slice().sort((x, y) => y - x)
    if (new Set(w.map(x => x.toFixed(4))).size < 4 || sortiert[0] - sortiert[1] < 0.04 || sortiert[0] - sortiert[1] > 0.15) continue
    const richtig = w.indexOf(sortiert[0])
    const optionen: Darstellung[] = b.map(x => T(`${x.z}/${x.n}`))
    return {
      aufgabe: 'Welcher Bruch ist am größten?',
      optionen, richtig, spalten: 4,
      erklaerung: `Als Dezimalzahlen: ${b.map((x, i) => `${x.z}/${x.n} ≈ ${zahlText(w[i])}`).join(', ')}.`,
      zeitSek: 10 + stufe * 2,
    }
  }
  return naechsterWert(r, gemischt(r), stufe)
}

const STUFEN: Bau[][] = [
  [summe(2)], [summe(4)],
  [produkt(12, 49, 3, 9)], [produkt(12, 49, 12, 49)],
  [quotient], [prozent], [produkt(110, 890, 12, 79)], [wurzel],
]

export const erzeuge: FragenGenerator = (r, stufeRoh) => {
  const s = klemme(Math.round(stufeRoh), 1, 10)
  if (s === 9) return groessterBruch(r, s)
  if (s === 10) return r.chance(0.35) ? groessterBruch(r, s) : naechsterWert(r, r.aus([gemischt, wurzel, produkt(110, 890, 12, 79)])(r), s)
  return naechsterWert(r, r.aus(STUFEN[s - 1])(r), s)
}
