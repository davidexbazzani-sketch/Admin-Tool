// Würfelnetze: Ein flaches Netz aus sechs Flächen wird zum Würfel gefaltet (räumliches Vorstellen).
//
// Stufe 1–2: Welches Zeichen liegt einem anderen GEGENÜBER? (1: einfache Netze, 2: alle elf Netze)
// Stufe 3–5: Welcher Würfel lässt sich falten? Falsche zeigen zwei gegenüberliegende Flächen nebeneinander.
// Stufe 6–8: Falsche sind zunehmend „Spiegelwürfel“ — richtige Flächen, aber falsch herum angeordnet.
// Stufe 9–10: Welcher Würfel lässt sich NICHT falten? (nur ein Spiegelwürfel unter richtigen)
//
// Die sechs Zeichen sehen nach jeder Vierteldrehung gleich aus (Punkt, Ring, Quadrat, Raute, Plus,
// Kreuz) — so kommt es nur auf die Lage der Flächen an, nicht auf die Drehung der Zeichen.
// Gefaltet wird mit der bedruckten Seite nach außen.
import type { Darstellung, Form, FragenGenerator, Szene } from '../kern/typen'
import { S } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { klemme } from '../kern/zufall'

type Zelle = [number, number]
type V = [number, number, number]

/** die elf Würfelnetze */
export const NETZE: Zelle[][] = [
  // 1-4-1 (Viererreihe mit je einer Fläche oben und unten)
  [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]],
  [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2]],
  [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]],
  [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [2, 2]],
  [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [3, 2]],
  [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [2, 2]],
  // 2-3-1
  [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [1, 2]],
  [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [2, 2]],
  [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [3, 2]],
  // 2-2-2 (Treppe)
  [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]],
  // 3-3
  [[0, 0], [1, 0], [2, 0], [2, 1], [3, 1], [4, 1]],
]

const neg = (a: V): V => [-a[0], -a[1], -a[2]]
const gleich = (a: V, b: V) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
const skalar = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const kreuz = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/**
 * Faltet das Netz: liefert je Fläche die Richtung, in die sie am Würfel zeigt.
 * Achsen: x nach rechts, y nach unten, z zum Betrachter. Die erste Fläche bleibt liegen (zeigt zum
 * Betrachter), alle anderen klappen nach hinten weg.
 */
export function falte(netz: Zelle[]): V[] {
  const aus: (V | null)[] = netz.map(() => null)
  const rahmen: ({ r: V; d: V; n: V } | null)[] = netz.map(() => null)
  rahmen[0] = { r: [1, 0, 0], d: [0, 1, 0], n: [0, 0, 1] }
  aus[0] = [0, 0, 1]
  const offen = [0]
  while (offen.length) {
    const i = offen.shift() as number
    const f = rahmen[i] as { r: V; d: V; n: V }
    const [x, y] = netz[i]
    const nachbarn: [number, number, (g: { r: V; d: V; n: V }) => { r: V; d: V; n: V }][] = [
      [1, 0, g => ({ n: g.r, r: neg(g.n), d: g.d })],
      [-1, 0, g => ({ n: neg(g.r), r: g.n, d: g.d })],
      [0, 1, g => ({ n: g.d, d: neg(g.n), r: g.r })],
      [0, -1, g => ({ n: neg(g.d), d: g.n, r: g.r })],
    ]
    for (const [dx, dy, klappe] of nachbarn) {
      const j = netz.findIndex(z => z[0] === x + dx && z[1] === y + dy)
      if (j < 0 || rahmen[j]) continue
      rahmen[j] = klappe(f)
      aus[j] = (rahmen[j] as { n: V }).n
      offen.push(j)
    }
  }
  return aus as V[]
}

/** Darf man die drei Flächen so sehen? oben, vorn, rechts — müssen aneinanderstoßen und richtig herum liegen. */
export function ansichtGueltig(oben: V, vorn: V, rechts: V): boolean {
  return skalar(oben, vorn) === 0 && skalar(oben, rechts) === 0 && skalar(vorn, rechts) === 0 && gleich(rechts, kreuz(vorn, oben))
}

// ── Zeichen ───────────────────────────────────────────────────────────────────
export const ZEICHEN_NAME = ['Punkt', 'Ring', 'Quadrat', 'Raute', 'Plus', 'Kreuz']
const kreisPunkte = (r: number, n = 20): [number, number][] => Array.from({ length: n }, (_, i) => [0.5 + r * Math.cos((2 * Math.PI * i) / n), 0.5 + r * Math.sin((2 * Math.PI * i) / n)] as [number, number])
const plusPunkte = (a: number, b: number, gedreht: boolean): [number, number][] => {
  const p: [number, number][] = [[-b, -a], [b, -a], [b, -b], [a, -b], [a, b], [b, b], [b, a], [-b, a], [-b, b], [-a, b], [-a, -b], [-b, -b]]
  const c = Math.SQRT1_2
  return p.map(([x, y]) => (gedreht ? [0.5 + (x - y) * c, 0.5 + (x + y) * c] : [0.5 + x, 0.5 + y]) as [number, number])
}
const ZEICHEN: { punkte: [number, number][]; voll: boolean }[] = [
  { punkte: kreisPunkte(0.27), voll: true },
  { punkte: kreisPunkte(0.26), voll: false },
  { punkte: [[0.26, 0.26], [0.74, 0.26], [0.74, 0.74], [0.26, 0.74]], voll: true },
  { punkte: [[0.5, 0.18], [0.82, 0.5], [0.5, 0.82], [0.18, 0.5]], voll: false },
  { punkte: plusPunkte(0.3, 0.1, false), voll: true },
  { punkte: plusPunkte(0.3, 0.1, true), voll: true },
]
/** Zeichen in eine (auch schräge) Fläche legen: Ursprung + u·ex + v·ey */
function zeichenForm(zeichen: number, o: [number, number], ex: [number, number], ey: [number, number]): Form {
  const z = ZEICHEN[zeichen]
  const d = z.punkte.map(([u, v], i) => `${i ? 'L' : 'M'}${(o[0] + u * ex[0] + v * ey[0]).toFixed(1)},${(o[1] + u * ex[1] + v * ey[1]).toFixed(1)}`).join('') + 'Z'
  return { typ: 'pfad', x: 0, y: 0, d, fuell: z.voll ? 'voll' : 'leer', ton: 1, dick: z.voll ? 1 : 3.2 }
}
const flaeche = (o: [number, number], ex: [number, number], ey: [number, number], dunkel: boolean): Form => ({
  typ: 'pfad', x: 0, y: 0, ton: 0, dick: 2.4, fuell: dunkel ? 'halb' : 'leer',
  d: `M${o[0]},${o[1]}L${o[0] + ex[0]},${o[1] + ex[1]}L${o[0] + ex[0] + ey[0]},${o[1] + ex[1] + ey[1]}L${o[0] + ey[0]},${o[1] + ey[1]}Z`,
})

export function netzBild(netz: Zelle[], zeichen: number[]): Szene {
  const breite = Math.max(...netz.map(z => z[0])) + 1, hoehe = Math.max(...netz.map(z => z[1])) + 1
  const k = Math.min(23, 92 / breite, 92 / hoehe)
  const x0 = 50 - (breite * k) / 2, y0 = 50 - (hoehe * k) / 2
  const e: Form[] = []
  netz.forEach(([x, y], i) => {
    const o: [number, number] = [x0 + x * k, y0 + y * k]
    e.push(flaeche(o, [k, 0], [0, k], false), zeichenForm(zeichen[i], o, [k, 0], [0, k]))
  })
  return { elemente: e }
}
/** Würfel von vorn-oben-rechts gesehen */
export function wuerfelBild(oben: number, vorn: number, rechts: number): Szene {
  const k = 46, a: [number, number] = [18, 38], t: [number, number] = [18, -16]
  return { elemente: [
    flaeche(a, [k, 0], [0, k], false), zeichenForm(vorn, a, [k, 0], [0, k]),
    flaeche([a[0] + t[0], a[1] + t[1]], [k, 0], [-t[0], -t[1]], false), zeichenForm(oben, [a[0] + t[0], a[1] + t[1]], [k, 0], [-t[0], -t[1]]),
    flaeche([a[0] + k, a[1]], t, [0, k], true), zeichenForm(rechts, [a[0] + k, a[1]], t, [0, k]),
  ] }
}
const einzelBild = (zeichen: number): Szene => ({ elemente: [flaeche([22, 22], [56, 0], [0, 56], false), zeichenForm(zeichen, [22, 22], [56, 0], [0, 56])] })

// ── Aufgaben ──────────────────────────────────────────────────────────────────
const schluessel = (a: Ansicht) => `${a.oben}|${a.vorn}|${a.rechts}`

export interface Ansicht { oben: number; vorn: number; rechts: number }   // Zeichen-Nummern
export interface Gefaltet { netz: Zelle[]; zeichen: number[]; richtung: V[]; zeichenBei: (v: V) => number; gegenueber: (zeichen: number) => number }

export function baue(r: Rng, einfach: boolean): Gefaltet {
  let netz = einfach ? r.aus(NETZE.slice(0, 3)) : r.aus(NETZE)
  // zur Abwechslung drehen/spiegeln (das Netz bleibt dasselbe, sieht aber anders aus)
  if (!einfach) {
    const viertel = r.int(0, 3), spiegel = r.chance(0.5)
    let z = netz.map(([x, y]) => (spiegel ? [-x, y] : [x, y]) as Zelle)
    for (let i = 0; i < viertel; i++) z = z.map(([x, y]) => [-y, x] as Zelle)
    const mx = Math.min(...z.map(p => p[0])), my = Math.min(...z.map(p => p[1]))
    netz = z.map(([x, y]) => [x - mx, y - my] as Zelle)
  }
  const zeichen = r.misch([0, 1, 2, 3, 4, 5])
  const richtung = falte(netz)
  const zeichenBei = (v: V) => zeichen[richtung.findIndex(n => gleich(n, v))]
  const gegenueber = (z: number) => zeichenBei(neg(richtung[zeichen.indexOf(z)]))
  return { netz, zeichen, richtung, zeichenBei, gegenueber }
}

const ACHSEN: V[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
function gueltigeAnsichten(g: Gefaltet): Ansicht[] {
  const aus: Ansicht[] = []
  for (const u of ACHSEN) for (const f of ACHSEN) {
    if (skalar(u, f) !== 0) continue
    aus.push({ oben: g.zeichenBei(u), vorn: g.zeichenBei(f), rechts: g.zeichenBei(kreuz(f, u)) })
  }
  return aus
}
/** falsch, weil zwei gegenüberliegende Flächen nebeneinander stehen */
function gegenueberFalsch(r: Rng, g: Gefaltet): Ansicht {
  const a = r.aus([0, 1, 2, 3, 4, 5]), b = g.gegenueber(a)
  const c = r.aus([0, 1, 2, 3, 4, 5].filter(x => x !== a && x !== b))
  const [o, v, re] = r.misch([a, b, c])
  return { oben: o, vorn: v, rechts: re }
}
/** falsch, weil spiegelverkehrt: aus einer richtigen Ansicht zwei Flächen vertauscht */
function spiegelFalsch(r: Rng, richtige: Ansicht[]): Ansicht {
  const a = r.aus(richtige)
  const art = r.int(0, 2)
  return art === 0 ? { oben: a.oben, vorn: a.rechts, rechts: a.vorn } : art === 1 ? { oben: a.vorn, vorn: a.oben, rechts: a.rechts } : { oben: a.rechts, vorn: a.vorn, rechts: a.oben }
}

/** Auswahl mischen und die Dinge selbst zurückgeben (für die Prüfung der Aufgaben) */
function mische<A>(r: Rng, richtig: A, falsche: A[], schl: (a: A) => string, anzahl: number): { auswahl: A[]; richtig: number } {
  const gesehen = new Set([schl(richtig)])
  const rest: A[] = []
  for (const f of falsche) { if (rest.length >= anzahl - 1) break; if (!gesehen.has(schl(f))) { gesehen.add(schl(f)); rest.push(f) } }
  const alle = r.misch([{ a: richtig, ok: true }, ...rest.map(a => ({ a, ok: false }))])
  return { auswahl: alle.map(x => x.a), richtig: alle.findIndex(x => x.ok) }
}

export type WuerfelAufgabe =
  | { art: 'gegenueber'; g: Gefaltet; zeichen: number; auswahl: number[]; richtig: number }
  | { art: 'falten' | 'nicht'; g: Gefaltet; auswahl: Ansicht[]; richtig: number }

/** Die Aufgabe als Daten (die Prüfung rechnet damit nach, ob wirklich genau eine Antwort stimmt). */
export function waehle(r: Rng, stufeRoh: number): WuerfelAufgabe {
  const stufe = klemme(Math.round(stufeRoh), 1, 10)
  const g = baue(r, stufe === 1)
  if (stufe <= 2) {
    const zeichen = r.int(0, 5), gegen = g.gegenueber(zeichen)
    return { art: 'gegenueber', g, zeichen, ...mische(r, gegen, r.misch([0, 1, 2, 3, 4, 5].filter(x => x !== zeichen && x !== gegen)), String, 4) }
  }
  const richtige = gueltigeAnsichten(g)
  const gueltig = new Set(richtige.map(schluessel))
  const falscheGegen = Array.from({ length: 16 }, () => gegenueberFalsch(r, g)).filter(a => !gueltig.has(schluessel(a)))
  const falscheSpiegel = Array.from({ length: 30 }, () => spiegelFalsch(r, richtige)).filter(a => !gueltig.has(schluessel(a)))
  if (stufe >= 9) {
    // drei bzw. vier richtige, EIN Spiegelwürfel
    return { art: 'nicht', g, ...mische(r, falscheSpiegel[0] ?? falscheGegen[0], r.misch(richtige), schluessel, stufe === 9 ? 4 : 5) }
  }
  // ein richtiger, sonst falsche: der Anteil der Spiegelwürfel wächst mit der Stufe
  const anzahl = stufe >= 8 ? 5 : 4
  const spiegelAnzahl = stufe <= 4 ? 0 : stufe === 5 ? 1 : stufe === 6 ? 2 : anzahl - 1
  const gesehen = new Set<string>()
  const eindeutig = (liste: Ansicht[], max: number): Ansicht[] => {
    const aus: Ansicht[] = []
    for (const a of liste) { if (aus.length >= max) break; if (!gesehen.has(schluessel(a))) { gesehen.add(schluessel(a)); aus.push(a) } }
    return aus
  }
  const spiegel = eindeutig(falscheSpiegel, spiegelAnzahl)
  const rest = eindeutig([...falscheGegen, ...falscheSpiegel], anzahl - 1 - spiegel.length)
  return { art: 'falten', g, ...mische(r, r.aus(richtige), [...spiegel, ...rest], schluessel, anzahl) }
}

export const erzeuge: FragenGenerator = (r, stufeRoh) => {
  const stufe = klemme(Math.round(stufeRoh), 1, 10)
  const a = waehle(r, stufe)
  const g = a.g
  const paare = [0, 1, 2, 3, 4, 5].filter(z => z < g.gegenueber(z)).map(z => `${ZEICHEN_NAME[z]} – ${ZEICHEN_NAME[g.gegenueber(z)]}`).join(', ')
  const zeige: Darstellung = S(netzBild(g.netz, g.zeichen))
  const zeitSek = 35 + stufe * 7
  if (a.art === 'gegenueber') {
    return {
      aufgabe: `Das Netz wird zum Würfel gefaltet. Welches Zeichen liegt dem Zeichen „${ZEICHEN_NAME[a.zeichen]}“ gegenüber?`,
      zeige, optionen: a.auswahl.map(x => S(einzelBild(x))), richtig: a.richtig, spalten: 4,
      erklaerung: `Gegenüber liegen sich: ${paare}. Flächen, die im Netz nebeneinander liegen, stoßen am Würfel aneinander — gegenüber liegt, was in einer Reihe eine Fläche überspringt.`,
      zeitSek,
    }
  }
  return {
    aufgabe: a.art === 'nicht' ? 'Welcher Würfel lässt sich aus dem Netz NICHT falten?' : 'Welcher Würfel lässt sich aus dem Netz falten?',
    zeige, optionen: a.auswahl.map(x => S(wuerfelBild(x.oben, x.vorn, x.rechts))), richtig: a.richtig, spalten: a.auswahl.length,
    erklaerung: `Gegenüber liegen sich: ${paare} — solche Flächen sind nie gleichzeitig zu sehen. Stimmen die drei Flächen, kommt es auf ihre Anordnung um die Ecke an: spiegelverkehrt geht nicht.`,
    zeitSek,
  }
}
