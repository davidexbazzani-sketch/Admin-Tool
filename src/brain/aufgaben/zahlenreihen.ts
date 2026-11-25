// Zahlenreihen: Regel erkennen und fortsetzen (klassische IQ-Aufgabenart, numerisch-logisch).
// Stufe 1: „immer +3“ … Stufe 10: verschachtelte und mehrstufige Regeln.
import type { FragenGenerator } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { klemme } from '../kern/zufall'
import { zahlAuswahl, zahlText } from './hilfen'

/** werte = gezeigte Glieder + das gesuchte als LETZTES */
interface Reihe { werte: number[]; regel: string; fallen?: number[] }
type Bau = (r: Rng) => Reihe

const PRIM = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]
const vz = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

const plus = (von: number, bis: number): Bau => r => {
  const k = r.int(von, bis), a = r.int(1, 15)
  return { werte: Array.from({ length: 7 }, (_, i) => a + i * k), regel: `Immer ${vz(k)}.` }
}
const minus = (von: number, bis: number): Bau => r => {
  const k = r.int(von, bis), a = r.int(6 * k + 3, 6 * k + 40)
  return { werte: Array.from({ length: 7 }, (_, i) => a - i * k), regel: `Immer ${vz(-k)}.` }
}
const mal = (von: number, bis: number): Bau => r => {
  const k = r.int(von, bis), a = r.int(1, k === 2 ? 6 : 3), n = k === 2 ? 7 : 6
  return { werte: Array.from({ length: n }, (_, i) => a * k ** i), regel: `Immer mal ${k}.` }
}
const wechsel = (mitMinus: boolean): Bau => r => {
  const a = r.int(2, 9)
  let b = mitMinus ? -r.int(1, a - 1 || 1) : r.int(2, 9)
  if (b === a) b = a + 2
  const w = [r.int(1, 20)]
  for (let i = 1; i < 8; i++) w.push(w[i - 1] + (i % 2 === 1 ? a : b))
  return { werte: w, regel: `Abwechselnd ${vz(a)} und ${vz(b)}.`, fallen: [w[6] + a, w[6] + b] }
}
const wachsend = (d0Von: number, d0Bis: number, ddVon: number, ddBis: number): Bau => r => {
  const d0 = r.int(d0Von, d0Bis), dd = r.int(ddVon, ddBis)
  const w = [r.int(1, 15)]
  for (let i = 1; i < 7; i++) w.push(w[i - 1] + d0 + (i - 1) * dd)
  const letzter = d0 + 4 * dd
  return { werte: w, regel: `Der Abstand ändert sich jedes Mal um ${vz(dd)} (${vz(d0)}, ${vz(d0 + dd)}, ${vz(d0 + 2 * dd)} …).`, fallen: [w[5] + letzter, w[5] + letzter + 2 * dd] }
}
const verschraenkt: Bau = r => {
  const ka = r.int(2, 6), kb = r.int(2, 7) * (r.chance(0.4) ? -1 : 1)
  const a0 = r.int(1, 12), b0 = r.int(20, 50)
  const w: number[] = []
  for (let i = 0; i < 9; i++) w.push(i % 2 === 0 ? a0 + (i / 2) * ka : b0 + ((i - 1) / 2) * kb)
  return { werte: w, regel: `Zwei Reihen wechseln sich ab: die 1., 3., 5. … Zahl ${vz(ka)}, die 2., 4., 6. … Zahl ${vz(kb)}.`, fallen: [w[7] + kb, w[7] + ka, w[6] + kb] }
}
const verschraenktMal: Bau = r => {
  const kb = r.int(2, 5), a0 = r.int(1, 3), b0 = r.int(30, 60)
  const w: number[] = []
  for (let i = 0; i < 9; i++) w.push(i % 2 === 0 ? a0 * 2 ** (i / 2) : b0 - ((i - 1) / 2) * kb)
  return { werte: w, regel: `Zwei Reihen wechseln sich ab: die 1., 3., 5. … Zahl mal 2, die 2., 4., 6. … Zahl ${vz(-kb)}.`, fallen: [w[7] - kb, w[6] + w[4], w[6] * 2 + 1] }
}
const malPlus = (kVon: number, kBis: number): Bau => r => {
  const k = r.int(kVon, kBis), c = r.int(1, 4) * (r.chance(0.3) ? -1 : 1)
  const w = [r.int(1, 4)]
  for (let i = 1; i < 8; i++) w.push(i % 2 === 1 ? w[i - 1] * k : w[i - 1] + c)
  return { werte: w, regel: `Abwechselnd mal ${k} und ${vz(c)}.`, fallen: [w[6] * k, w[6] + c] }
}
const fibo = (c: number): Bau => r => {
  const w = [r.int(1, 5), r.int(1, 6)]
  for (let i = 2; i < 8; i++) w.push(w[i - 1] + w[i - 2] + c)
  return {
    werte: w,
    regel: c ? `Jede Zahl ist die Summe der beiden davor, ${vz(c)}.` : 'Jede Zahl ist die Summe der beiden Zahlen davor.',
    fallen: [w[6] + w[5], w[6] * 2 - w[5], w[6] + w[6] - w[4]],
  }
}
const quadrat = (mitZusatz: boolean): Bau => r => {
  const s = r.int(1, 4), c = mitZusatz ? r.int(1, 6) * (r.chance(0.5) ? -1 : 1) : 0
  const w = Array.from({ length: 7 }, (_, i) => (s + i) ** 2 + c)
  return { werte: w, regel: c ? `Quadratzahlen (${s}², ${s + 1}², ${s + 2}² …), jeweils ${vz(c)}.` : `Quadratzahlen: ${s}², ${s + 1}², ${s + 2}² …`, fallen: [w[5] + (w[5] - w[4]), w[5] + (w[5] - w[4]) + 1] }
}
const kubik: Bau = r => {
  const c = r.chance(0.5) ? 0 : r.int(1, 3)
  const w = Array.from({ length: 6 }, (_, i) => (i + 1) ** 3 + c)
  return { werte: w, regel: c ? `Kubikzahlen (1³, 2³, 3³ …), jeweils +${c}.` : 'Kubikzahlen: 1³, 2³, 3³ …', fallen: [w[4] + (w[4] - w[3]), w[4] * 2] }
}
const diffMal: Bau = r => {
  const d = r.int(1, 3), k = r.int(2, 3)
  const w = [r.int(1, 9)]
  for (let i = 1; i < 7; i++) w.push(w[i - 1] + d * k ** (i - 1))
  return { werte: w, regel: `Der Abstand wird jedes Mal mit ${k} malgenommen (${vz(d)}, ${vz(d * k)}, ${vz(d * k * k)} …).`, fallen: [w[5] + d * k ** 4, w[5] + d * k ** 4 + d] }
}
const primzahlen: Bau = r => {
  const s = r.int(0, 4), c = r.chance(0.5) ? 0 : r.int(1, 5)
  const w = PRIM.slice(s, s + 7).map(p => p + c)
  return { werte: w, regel: c ? `Primzahlen, jeweils +${c}.` : 'Die Primzahlen der Reihe nach.', fallen: [w[5] + 2, w[5] + 4, w[5] + 6] }
}
const diffPrim: Bau = r => {
  const w = [r.int(1, 12)]
  for (let i = 1; i < 7; i++) w.push(w[i - 1] + PRIM[i - 1])
  return { werte: w, regel: 'Die Abstände sind die Primzahlen: +2, +3, +5, +7, +11, +13.', fallen: [w[5] + 12, w[5] + 15, w[5] + 11] }
}
const fakultaet: Bau = r => {
  const a = r.int(1, 3)
  const w = [a]
  for (let i = 1; i < 7; i++) w.push(w[i - 1] * i)
  return { werte: w, regel: 'Mal 1, mal 2, mal 3, mal 4 … der Faktor wächst um 1.', fallen: [w[5] * 5, w[5] * 7, w[5] + w[4]] }
}
const zweiteOrdnung: Bau = r => {
  const dd = r.int(3, 6), d0 = -r.int(4, 12)
  const w = [r.int(20, 45)]
  for (let i = 1; i < 7; i++) w.push(w[i - 1] + d0 + (i - 1) * dd)
  return { werte: w, regel: `Der Abstand wächst jedes Mal um ${dd} (${vz(d0)}, ${vz(d0 + dd)}, ${vz(d0 + 2 * dd)} …) — erst fällt die Reihe, dann steigt sie.`, fallen: [w[5] + d0 + 4 * dd, w[5] + (w[5] - w[4])] }
}
const malMinus = (kVon: number, kBis: number): Bau => r => {
  const k = r.int(kVon, kBis), c = r.int(1, 4)
  const w = [r.int(c + 1, c + 4)]
  for (let i = 1; i < 6; i++) w.push(w[i - 1] * k - c)
  return { werte: w, regel: `Jede Zahl mal ${k}, dann ${vz(-c)}.`, fallen: [w[4] * k, w[4] * k - c - 1, w[4] * k + c] }
}
const dreierZyklus = (schwer: boolean): Bau => r => {
  const a = r.int(2, schwer ? 7 : 5), k = r.int(2, schwer ? 3 : 2), c = r.int(1, schwer ? 6 : 3)
  const w = [r.int(1, 5)]
  const schritt = [(x: number) => x + a, (x: number) => x * k, (x: number) => x - c]
  for (let i = 1; i < 8; i++) w.push(schritt[(i - 1) % 3](w[i - 1]))
  return { werte: w, regel: `Drei Schritte wiederholen sich: ${vz(a)}, mal ${k}, ${vz(-c)}.`, fallen: [w[6] + a, w[6] * k, w[6] - c] }
}
const nMalZweiHochN: Bau = () => {
  const w = Array.from({ length: 7 }, (_, i) => (i + 1) * 2 ** (i + 1))
  return { werte: w, regel: 'Stelle mal Zweierpotenz: 1·2, 2·4, 3·8, 4·16 …', fallen: [w[5] * 2, w[5] * 2 + 64, w[5] + (w[5] - w[4]) * 2] }
}
const quadratUndMal: Bau = r => {
  const b0 = r.int(1, 3)
  const w: number[] = []
  for (let i = 0; i < 9; i++) w.push(i % 2 === 0 ? (i / 2 + 2) ** 2 : b0 * 3 ** ((i - 1) / 2))
  return { werte: w, regel: 'Zwei Reihen wechseln sich ab: Quadratzahlen (2², 3², 4² …) und eine Reihe „mal 3“.', fallen: [w[6] + 11, w[7] * 3, w[6] + (w[6] - w[4])] }
}

/** Je Stufe die möglichen Bauarten */
const STUFEN: Bau[][] = [
  [plus(2, 5)],
  [plus(6, 12), minus(2, 6), mal(2, 2)],
  [mal(2, 3), wechsel(false), minus(7, 15)],
  [wachsend(1, 4, 1, 2), wechsel(true)],
  [verschraenkt, malPlus(2, 2), wachsend(2, 6, 2, 3)],
  [fibo(0), quadrat(false), diffMal],
  [quadrat(true), primzahlen, fakultaet, wachsend(-12, -4, 3, 5)],
  [verschraenktMal, zweiteOrdnung, kubik, malMinus(2, 2)],
  [dreierZyklus(false), fibo(2), diffPrim, malPlus(3, 3)],
  [nMalZweiHochN, malMinus(3, 3), dreierZyklus(true), quadratUndMal],
]

/**
 * Eindeutigkeit: Welche Fortsetzungen ergäben die EINFACHEN Regeln, die auf alle gezeigten Glieder passen?
 * (gleicher Abstand · gleicher Faktor · Abstände im Zweier-/Dreier-Wechsel · gleichmäßig wachsender Abstand ·
 * zwei verschränkte Reihen mit festem Abstand). Beispiel: 9, 13, 15, 19, 21, 25 ist „Primzahlen + 2“ (→ 31),
 * liest sich aber viel einfacher als „+4, +2 im Wechsel“ (→ 27) — so eine Reihe darf nicht gestellt werden.
 */
export function einfacheFortsetzungen(w: number[]): number[] {
  const aus: number[] = []
  const n = w.length
  if (n < 4) return aus
  const d = w.slice(1).map((x, i) => x - w[i])
  const letzter = w[n - 1]
  if (d.every(x => x === d[0])) aus.push(letzter + d[0])
  if (w.every(x => x !== 0) && w.slice(1).every((x, i) => x * w[0] === w[i] * w[1])) aus.push(letzter * w[1] / w[0])
  if (d.length >= 4 && d.every((x, i) => i < 2 || x === d[i - 2])) aus.push(letzter + d[d.length - 2])
  if (d.length >= 6 && d.every((x, i) => i < 3 || x === d[i - 3])) aus.push(letzter + d[d.length - 3])
  const dd = d.slice(1).map((x, i) => x - d[i])
  if (dd.length >= 3 && dd.every(x => x === dd[0])) aus.push(letzter + d[d.length - 1] + dd[0])
  if (n >= 6) {
    // verschränkt: das nächste Glied gehört zur Teilreihe mit derselben Parität wie Index n
    const teil = w.filter((_, i) => i % 2 === n % 2)
    const andere = w.filter((_, i) => i % 2 !== n % 2)
    const gleich = (t: number[]) => t.length >= 3 && t.slice(1).every((x, i) => x - t[i] === t[1] - t[0])
    if (gleich(teil) && gleich(andere)) aus.push(teil[teil.length - 1] + (teil[1] - teil[0]))
  }
  return aus
}

export const erzeuge: FragenGenerator = (r, stufe) => {
  const s = klemme(Math.round(stufe), 1, 10)
  let reihe: Reihe | null = null
  for (let versuch = 0; versuch < 60 && !reihe; versuch++) {
    const k = r.aus(STUFEN[s - 1])(r)
    // überschaubare Zahlen, keine doppelten Nachbarn (sonst ist die Regel nicht eindeutig lesbar)
    if (!(k.werte.every(x => Math.abs(x) <= 20000) && new Set(k.werte).size >= k.werte.length - 1)) continue
    // keine Reihe, die sich mit einer einfacheren Regel ANDERS fortsetzen ließe
    const soll = k.werte[k.werte.length - 1]
    if (einfacheFortsetzungen(k.werte.slice(0, -1)).some(x => x !== soll)) continue
    reihe = k
  }
  if (!reihe) reihe = plus(2, 5)(r)
  const gezeigt = reihe.werte.slice(0, -1)
  const richtig = reihe.werte[reihe.werte.length - 1]
  const letzter = gezeigt[gezeigt.length - 1]
  const abstand = letzter - gezeigt[gezeigt.length - 2]
  const fallen = [...(reihe.fallen ?? []), letzter + abstand, richtig + abstand, richtig - abstand, richtig + 1, richtig - 1, richtig + 2, richtig - 2, richtig + 10, richtig - 10]
    .filter(x => x !== richtig)
  const { optionen, richtig: index } = zahlAuswahl(r, richtig, fallen, 5, gezeigt.every(x => x >= 0) && richtig >= 0)
  return {
    aufgabe: 'Welche Zahl setzt die Reihe fort?',
    zeige: { art: 'folge', teile: [...gezeigt.map(x => zahlText(x)), null] },
    optionen, richtig: index,
    erklaerung: `${reihe.regel} Gesucht: ${zahlText(richtig)}.`,
    zeitSek: 35 + s * 6,
  }
}
