// Kopfrechnen: Ergebnis eintippen. (Rechenfertigkeit und Zahlen im Kopf halten)
//
// Stufe 1: plus bis 20 · 2: plus/minus bis 50 · 3: plus/minus bis 100 · 4: kleines Einmaleins ·
// 5: teilen und drei Zahlen · 6: zweistellig mal einstellig · 7: Punkt vor Strich ·
// 8: zweistellig mal zweistellig (klein), dreistellig geteilt · 9: Prozent, Brüche, Quadrate ·
// 10: große Produkte und zwei Produkte verrechnen.
import type { Frage, FragenGenerator } from '../kern/typen'
import { T } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { klemme } from '../kern/zufall'
import { zahlText } from './hilfen'

interface Rechnung { text: string; ergebnis: number; weg?: string }
type Bau = (r: Rng) => Rechnung
const mal = '·', geteilt = ':'

const plus = (max: number): Bau => r => { const a = r.int(2, max - 2), b = r.int(2, max - a); return { text: `${a} + ${b}`, ergebnis: a + b } }
const minus = (max: number): Bau => r => { const a = r.int(Math.floor(max / 3), max), b = r.int(2, a - 1); return { text: `${a} − ${b}`, ergebnis: a - b } }
const einmaleins: Bau = r => { const a = r.int(2, 10), b = r.int(2, 10); return { text: `${a} ${mal} ${b}`, ergebnis: a * b } }
const teilen: Bau = r => { const b = r.int(2, 10), q = r.int(2, 10); return { text: `${b * q} ${geteilt} ${b}`, ergebnis: q } }
const dreiZahlen: Bau = r => {
  const a = r.int(20, 70), b = r.int(5, 30), c = r.int(5, Math.min(40, a + b - 1))
  return { text: `${a} + ${b} − ${c}`, ergebnis: a + b - c }
}
const zweiMalEins: Bau = r => { const a = r.int(12, 49), b = r.int(3, 9); return { text: `${a} ${mal} ${b}`, ergebnis: a * b, weg: `${Math.floor(a / 10) * 10} ${mal} ${b} = ${Math.floor(a / 10) * 10 * b}, dazu ${a % 10} ${mal} ${b} = ${(a % 10) * b}` } }
const punktVorStrich: Bau = r => {
  const a = r.int(3, 9), b = r.int(4, 12), c = r.int(5, 40)
  return r.chance(0.5)
    ? { text: `${c} + ${a} ${mal} ${b}`, ergebnis: c + a * b, weg: `erst ${a} ${mal} ${b} = ${a * b} (Punkt vor Strich)` }
    : { text: `${a} ${mal} ${b} − ${Math.min(c, a * b - 1)}`, ergebnis: a * b - Math.min(c, a * b - 1), weg: `erst ${a} ${mal} ${b} = ${a * b}` }
}
const zweiMalZwei = (max: number): Bau => r => { const a = r.int(11, max), b = r.int(11, Math.min(max, 25)); return { text: `${a} ${mal} ${b}`, ergebnis: a * b, weg: `${a} ${mal} ${Math.floor(b / 10) * 10} = ${a * Math.floor(b / 10) * 10}, dazu ${a} ${mal} ${b % 10} = ${a * (b % 10)}` } }
const dreiGeteilt: Bau = r => { const b = r.int(3, 9), q = r.int(12, 99); return { text: `${b * q} ${geteilt} ${b}`, ergebnis: q } }
const prozent: Bau = r => {
  const p = r.aus([5, 10, 15, 20, 25, 30, 40, 50, 75]), g = r.aus([40, 60, 80, 120, 160, 200, 240, 320, 360, 400, 480, 600])
  return { text: `${p} % von ${g}`, ergebnis: (p * g) / 100, weg: `10 % von ${g} sind ${g / 10}` }
}
const bruch: Bau = r => {
  const n = r.aus([3, 4, 5, 6, 8]), z = r.int(2, n - 1), g = n * r.int(6, 20)
  return { text: `${z}/${n} von ${g}`, ergebnis: (z * g) / n, weg: `1/${n} von ${g} ist ${g / n}` }
}
const quadrat = (von: number, bis: number): Bau => r => { const a = r.int(von, bis); return { text: `${a}²`, ergebnis: a * a } }
const zweiProdukte: Bau = r => {
  const a = r.int(6, 15), b = r.int(6, 12), c = r.int(3, 9), d = r.int(3, 9)
  return a * b > c * d ? { text: `${a} ${mal} ${b} − ${c} ${mal} ${d}`, ergebnis: a * b - c * d, weg: `${a * b} − ${c * d}` } : { text: `${a} ${mal} ${b} + ${c} ${mal} ${d}`, ergebnis: a * b + c * d, weg: `${a * b} + ${c * d}` }
}

const STUFEN: Bau[][] = [
  [plus(20)],
  [plus(50), minus(50)],
  [plus(100), minus(100)],
  [einmaleins],
  [teilen, dreiZahlen],
  [zweiMalEins],
  [punktVorStrich, zweiMalEins],
  [zweiMalZwei(25), dreiGeteilt],
  [prozent, bruch, quadrat(11, 20)],
  [zweiMalZwei(99), zweiProdukte, quadrat(16, 30)],
]
const ZEIT = [12, 14, 16, 12, 16, 22, 22, 32, 28, 40]

export const erzeuge: FragenGenerator = (r, stufeRoh): Frage => {
  const s = klemme(Math.round(stufeRoh), 1, 10)
  const a = r.aus(STUFEN[s - 1])(r)
  return {
    aufgabe: 'Rechne im Kopf',
    zeige: T(`${a.text} = ?`),
    optionen: [], richtig: -1, eingabe: 'zahl', loesungen: [zahlText(a.ergebnis)],
    erklaerung: `${a.text} = ${zahlText(a.ergebnis)}${a.weg ? ` — ${a.weg}.` : '.'}`,
    zeitSek: ZEIT[s - 1],
  }
}
