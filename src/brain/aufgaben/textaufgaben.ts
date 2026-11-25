// Textaufgaben: aus einem kurzen Text die Rechnung herauslesen (rechnerisches Denken).
//
// Stufe 1: mal/geteilt im Alltag · 2: Wechselgeld, Dreisatz · 3: Strecke und Zeit · 4: Prozent ·
// 5: Altersrätsel · 6: umgekehrter Dreisatz (mehr Leute, weniger Zeit) · 7: Durchschnitt ·
// 8: gemeinsame Arbeit · 9: Prozent rückwärts, Begegnung · 10: Gleichungen im Text, Mischungen.
// Alle Lösungen sind ganze Zahlen; die falschen Antworten sind typische Denkfehler.
import type { Frage, FragenGenerator } from '../kern/typen'
import { T } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { klemme } from '../kern/zufall'
import { zahlAuswahl } from './hilfen'

interface Aufgabe { text: string; loesung: number; einheit: string; weg: string; fallen: number[] }
type Bau = (r: Rng) => Aufgabe

const DINGE = [['Heft', 'Hefte'], ['Brötchen', 'Brötchen'], ['Stift', 'Stifte'], ['Becher', 'Becher'], ['Schraube', 'Schrauben'], ['Apfel', 'Äpfel']]

const einkauf: Bau = r => {
  const [ein, viele] = r.aus(DINGE), p = r.int(2, 9), n = r.int(3, 9)
  return r.chance(0.5)
    ? { text: `Ein ${ein} kostet ${p} €. Wie viel kosten ${n} ${viele}?`, loesung: p * n, einheit: '€', weg: `${n} · ${p} € = ${p * n} €`, fallen: [p + n, p * (n - 1), p * (n + 1)] }
    : { text: `${n} ${viele} kosten zusammen ${p * n} €. Wie viel kostet ein Stück?`, loesung: p, einheit: '€', weg: `${p * n} € : ${n} = ${p} €`, fallen: [p * n - n, p + 1, p - 1, n] }
}
const wechselgeld: Bau = r => {
  const p = r.int(3, 8), n = r.int(2, 5), schein = r.aus([20, 50].filter(s => s > p * n))
  return { text: `Du kaufst ${n} Karten zu je ${p} € und zahlst mit einem ${schein}-€-Schein. Wie viel bekommst du zurück?`, loesung: schein - p * n, einheit: '€', weg: `${n} · ${p} € = ${p * n} €, ${schein} € − ${p * n} € = ${schein - p * n} €`, fallen: [schein - p, p * n, schein - p * n + p] }
}
const dreisatz: Bau = r => {
  const je = r.int(4, 15), a = r.int(2, 6), b = r.aus([2, 3, 4, 5, 6, 7, 8, 9].filter(x => x !== a))
  return { text: `${a} Maschinen fertigen in einer Stunde ${a * je} Teile. Wie viele Teile fertigen ${b} gleiche Maschinen in einer Stunde?`, loesung: b * je, einheit: 'Teile', weg: `Eine Maschine schafft ${a * je} : ${a} = ${je} Teile, ${b} Maschinen also ${b} · ${je} = ${b * je}`, fallen: [a * je + b, a * je + (b - a), b * je + je, a * je * b] }
}
const strecke: Bau = r => {
  const v = r.aus([40, 50, 60, 70, 80, 90, 120]), t1 = r.int(2, 4), t2 = r.aus([3, 5, 6, 7].filter(x => x !== t1))
  return { text: `Ein Zug fährt gleichmäßig schnell und legt in ${t1} Stunden ${v * t1} km zurück. Wie weit kommt er in ${t2} Stunden?`, loesung: v * t2, einheit: 'km', weg: `Tempo: ${v * t1} km : ${t1} h = ${v} km/h, in ${t2} h also ${v * t2} km`, fallen: [v * t1 + t2, v * t1 + v, v * (t2 - 1), v * (t2 + 1)] }
}
const prozent: Bau = r => {
  const g = r.aus([40, 60, 80, 120, 150, 160, 200, 240, 300]), p = r.aus([10, 20, 25, 30, 50])
  const weniger = r.chance(0.6), teil = (g * p) / 100
  return weniger
    ? { text: `Eine Jacke kostet ${g} €. Im Angebot ist sie ${p} % günstiger. Was kostet sie jetzt?`, loesung: g - teil, einheit: '€', weg: `${p} % von ${g} € sind ${teil} €, ${g} € − ${teil} € = ${g - teil} €`, fallen: [teil, g - p, g + teil] }
    : { text: `Ein Verein hat ${g} Mitglieder. Die Zahl steigt um ${p} %. Wie viele Mitglieder sind es dann?`, loesung: g + teil, einheit: 'Mitglieder', weg: `${p} % von ${g} sind ${teil}, ${g} + ${teil} = ${g + teil}`, fallen: [teil, g + p, g - teil] }
}
const alter: Bau = r => {
  const j = r.int(8, 30), d = r.int(2, 9)
  return { text: `Anna ist ${d} Jahre älter als Ben. Zusammen sind sie ${2 * j + d} Jahre alt. Wie alt ist Anna?`, loesung: j + d, einheit: 'Jahre', weg: `Ohne den Unterschied: ${2 * j + d} − ${d} = ${2 * j}, die Hälfte ist Bens Alter (${j}); Anna ist ${d} Jahre älter: ${j + d}`, fallen: [j, (2 * j + d) / 2 + d, j + 2 * d, 2 * j] }
}
const umgekehrt: Bau = r => {
  const paare: [number, number, number][] = [[4, 6, 12], [6, 12, 9], [3, 8, 4], [5, 12, 6], [8, 9, 12], [6, 10, 4], [10, 6, 15], [4, 15, 6], [9, 8, 12], [12, 5, 10]]
  const [a, tage, b] = r.aus(paare), neu = (a * tage) / b
  return { text: `${a} Handwerker brauchen für einen Auftrag ${tage} Tage. Wie lange brauchen ${b} gleich schnelle Handwerker?`, loesung: neu, einheit: 'Tage', weg: `Der Auftrag umfasst ${a} · ${tage} = ${a * tage} Arbeitstage, geteilt durch ${b} sind das ${neu} Tage. Mehr Leute — weniger Zeit`, fallen: [Math.round((tage * b) / a), tage + (b - a), tage - (b - a), neu + 2] }
}
const durchschnitt: Bau = r => {
  const n = r.int(4, 5), mittel = r.int(12, 30)
  let bekannt: number[] = [], fehlt = 0
  // die fehlende Zahl soll positiv sein und nicht zufällig genau der Durchschnitt
  for (let v = 0; v < 50; v++) {
    bekannt = Array.from({ length: n - 1 }, () => mittel + r.int(-6, 6))
    fehlt = n * mittel - bekannt.reduce((a, b) => a + b, 0)
    if (fehlt >= 2 && fehlt !== mittel) break
  }
  return { text: `Der Durchschnitt von ${n} Zahlen ist ${mittel}. ${n - 1} davon sind ${bekannt.join(', ')}. Wie lautet die fehlende Zahl?`, loesung: fehlt, einheit: '', weg: `Summe aller Zahlen: ${n} · ${mittel} = ${n * mittel}. Davon ab die bekannten (${bekannt.reduce((a, b) => a + b, 0)}): ${fehlt}`, fallen: [mittel, Math.round(bekannt.reduce((a, b) => a + b, 0) / (n - 1)), fehlt + n, fehlt - n] }
}
const gemeinsam: Bau = r => {
  const paare: [number, number, number][] = [[6, 3, 2], [12, 4, 3], [10, 15, 6], [20, 5, 4], [12, 6, 4], [30, 6, 5], [24, 8, 6], [20, 30, 12], [15, 30, 10], [18, 9, 6]]
  const [a, b, zusammen] = r.aus(paare)
  return { text: `Pumpe A füllt ein Becken allein in ${a} Stunden, Pumpe B allein in ${b} Stunden. Wie lange brauchen beide zusammen?`, loesung: zusammen, einheit: 'Stunden', weg: `In einer Stunde schafft A 1/${a}, B 1/${b} des Beckens — zusammen 1/${zusammen}. Also ${zusammen} Stunden`, fallen: [(a + b) / 2, a + b, Math.min(a, b), Math.abs(a - b), zusammen + 1] }
}
const prozentRueck: Bau = r => {
  // nur Paare, bei denen der neue Preis glatt ist
  const paare: [number, number][] = [[40, 10], [40, 25], [50, 10], [50, 20], [60, 10], [60, 25], [60, 50], [70, 10], [70, 20], [80, 25], [80, 50], [120, 10], [120, 25], [150, 20], [200, 25], [250, 20]]
  const [alt, p] = r.aus(paare)
  const neu = Math.round(alt * (1 + p / 100))
  return { text: `Nach einer Preiserhöhung um ${p} % kostet ein Gerät ${neu} €. Was hat es vorher gekostet?`, loesung: alt, einheit: '€', weg: `${neu} € sind ${100 + p} % des alten Preises: ${neu} : ${100 + p} · 100 = ${alt} €. (Nicht einfach ${p} % vom neuen Preis abziehen!)`, fallen: [Math.round(neu * (1 - p / 100)), neu - p, alt + 5, alt - 5] }
}
const begegnung: Bau = r => {
  const v1 = r.aus([40, 50, 60, 70]), v2 = r.aus([50, 60, 80, 90]), t = r.int(2, 5)
  return { text: `Zwei Züge starten gleichzeitig in zwei Städten, die ${(v1 + v2) * t} km voneinander entfernt sind, und fahren aufeinander zu — der eine mit ${v1} km/h, der andere mit ${v2} km/h. Nach wie vielen Stunden treffen sie sich?`, loesung: t, einheit: 'Stunden', weg: `Sie kommen sich pro Stunde ${v1} + ${v2} = ${v1 + v2} km näher: ${(v1 + v2) * t} : ${v1 + v2} = ${t}`, fallen: [t + 1, t - 1, t * 2, t + 2] }
}
const vaterSohn: Bau = r => {
  // heute k1-mal so alt, in d Jahren k2-mal so alt:  k1·x + d = k2·(x + d)  →  x = d·(k2 − 1) / (k1 − k2)
  // nur Fälle mit glaubhaften Altern (Vater mindestens 20 Jahre älter)
  const faelle: [number, number, number][] = [[3, 2, 12], [3, 2, 15], [4, 2, 14], [4, 2, 16], [5, 3, 6], [4, 3, 5], [6, 3, 6], [5, 2, 18], [7, 3, 8]]
  const [k1, k2, d] = r.aus(faelle), x = (d * (k2 - 1)) / (k1 - k2)
  const wort = (k: number) => (['', '', 'doppelt', 'dreimal', 'viermal', 'fünfmal', 'sechsmal', 'siebenmal'][k])
  return { text: `Ein Vater ist heute ${wort(k1)} so alt wie sein Sohn. In ${d} Jahren ist er nur noch ${wort(k2)} so alt. Wie alt ist der Sohn heute?`, loesung: x, einheit: 'Jahre', weg: `Sohn heute x, Vater ${k1}·x. In ${d} Jahren: ${k1}·x + ${d} = ${k2}·(x + ${d}) → x = ${x}. Probe: Vater ${k1 * x}, in ${d} Jahren ${k1 * x + d} und ${x + d}`, fallen: [x + d, d, x * 2, x - 2, x + 3] }
}
const mischung: Bau = r => {
  const faelle: [number, number, number, number][] = [[2, 30, 3, 50], [1, 20, 3, 60], [3, 10, 2, 60], [4, 25, 1, 50], [1, 10, 4, 60], [3, 20, 1, 60], [2, 10, 3, 60], [4, 15, 1, 40]]
  const [l1, p1, l2, p2] = r.aus(faelle), p = (l1 * p1 + l2 * p2) / (l1 + l2)
  return { text: `${l1} Liter Saft mit ${p1} % Fruchtanteil werden mit ${l2 === 1 ? 'einem Liter' : `${l2} Litern`} Saft mit ${p2} % Fruchtanteil gemischt. Wie hoch ist der Fruchtanteil der Mischung?`, loesung: p, einheit: '%', weg: `Frucht insgesamt: ${l1} · ${p1} % + ${l2} · ${p2} % = ${String((l1 * p1 + l2 * p2) / 100).replace('.', ',')} Liter in ${l1 + l2} Litern → ${p} %. Die größere Menge zählt stärker`, fallen: [(p1 + p2) / 2, p1 + p2, p + 5, p - 5] }
}

const STUFEN: Bau[][] = [
  [einkauf], [wechselgeld, dreisatz], [strecke, dreisatz], [prozent], [alter],
  [umgekehrt], [durchschnitt], [gemeinsam, umgekehrt], [prozentRueck, begegnung], [vaterSohn, mischung, prozentRueck],
]

export const erzeuge: FragenGenerator = (r, stufeRoh): Frage => {
  const s = klemme(Math.round(stufeRoh), 1, 10)
  const a = r.aus(STUFEN[s - 1])(r)
  const fallen = a.fallen.filter(x => Number.isInteger(x) && x > 0 && x !== a.loesung)
  const { optionen, richtig } = zahlAuswahl(r, a.loesung, fallen, 5, true)
  const mitEinheit = optionen.map(o => (o.art === 'text' && a.einheit ? T(`${o.text} ${a.einheit}`) : o))
  return {
    aufgabe: 'Lies genau und rechne',
    zeige: T(a.text),
    optionen: mitEinheit, richtig, spalten: 5,
    erklaerung: `${a.weg}.`,
    zeitSek: 40 + s * 8,
  }
}
