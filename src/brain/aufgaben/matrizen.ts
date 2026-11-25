// Figuren-Matrizen (3×3): Welche Figur gehört in das leere Feld?
// Aufgabenart wie in sprachfreien Intelligenztests — hier vollständig selbst erzeugt:
// jede Eigenschaft (Form, Anzahl, Füllung, Größe, Drehung, Farbe) folgt einer eigenen Regel,
// dazu ab Stufe 6 „Zusätze“ (Punkte/Striche am Rand), die sich je Zeile verknüpfen.
import type { Form, FormTyp, Fuellung, FragenGenerator, Szene } from '../kern/typen'
import { S } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { klemme } from '../kern/zufall'
import { mischeAuswahl } from './hilfen'

type Attr = 'form' | 'anzahl' | 'fuell' | 'groesse' | 'dreh' | 'ton'
type Regel = 'zeile' | 'spalte' | 'folge' | 'verteilung'
type Verknuepfung = 'vereinigung' | 'xor' | 'schnitt'

export interface Zelle { form: FormTyp; anzahl: number; fuell: Fuellung; groesse: number; dreh: number; ton: 0 | 1 | 2; zusatz: boolean[] }

const FORMEN: FormTyp[] = ['kreis', 'quadrat', 'dreieck', 'raute', 'stern', 'kreuz', 'sechseck']
const WERTE: Record<Attr, (string | number)[]> = {
  form: FORMEN, anzahl: [1, 2, 3], fuell: ['leer', 'schraffur', 'voll'], groesse: [0, 1, 2], dreh: [0, 90, 180, 270], ton: [0, 1, 2],
}
const NAME: Record<Attr, string> = { form: 'Form', anzahl: 'Anzahl', fuell: 'Füllung', groesse: 'Größe', dreh: 'Drehung', ton: 'Farbe' }
const ZUSATZ_ANZAHL = 6

interface Plan { n: number; regeln: Regel[]; verkn?: Verknuepfung[]; dreh?: boolean; optionen: number }
const PLAN: Plan[] = [
  { n: 1, regeln: ['zeile', 'spalte'], optionen: 6 },
  { n: 1, regeln: ['folge', 'verteilung'], optionen: 6 },
  { n: 2, regeln: ['zeile', 'spalte', 'folge'], optionen: 6 },
  { n: 2, regeln: ['folge', 'verteilung'], optionen: 6 },
  { n: 3, regeln: ['zeile', 'folge', 'verteilung'], optionen: 8 },
  { n: 2, regeln: ['zeile', 'verteilung'], verkn: ['vereinigung'], optionen: 8 },
  { n: 3, regeln: ['verteilung', 'folge'], dreh: true, optionen: 8 },
  { n: 2, regeln: ['verteilung'], verkn: ['xor'], optionen: 8 },
  { n: 3, regeln: ['verteilung'], verkn: ['xor', 'schnitt'], optionen: 8 },
  { n: 4, regeln: ['verteilung'], verkn: ['xor'], dreh: true, optionen: 8 },
]

// ── Zeichnen ──────────────────────────────────────────────────────────────────
const GROESSE = [26, 36, 46]
const LAGE: Record<number, { p: [number, number][]; f: number }> = {
  1: { p: [[50, 50]], f: 1 },
  2: { p: [[33, 50], [67, 50]], f: 0.62 },
  3: { p: [[50, 31], [31, 66], [69, 66]], f: 0.54 },
  4: { p: [[33, 33], [67, 33], [33, 67], [67, 67]], f: 0.5 },
}
/** Zusätze: vier Eckpunkte + Strich oben + Strich unten */
function zusatzFormen(z: boolean[]): Form[] {
  const aus: Form[] = []
  const ecke: [number, number][] = [[9, 9], [91, 9], [9, 91], [91, 91]]
  ecke.forEach(([x, y], i) => { if (z[i]) aus.push({ typ: 'punkt', x, y, g: 9, ton: 3 }) })
  if (z[4]) aus.push({ typ: 'linie', x: 30, y: 7, x2: 70, y2: 7, ton: 3, dick: 3.5 })
  if (z[5]) aus.push({ typ: 'linie', x: 30, y: 93, x2: 70, y2: 93, ton: 3, dick: 3.5 })
  return aus
}
export function zelleAlsSzene(z: Zelle): Szene {
  const lage = LAGE[klemme(z.anzahl, 1, 4)]
  const g = GROESSE[klemme(z.groesse, 0, 2)] * lage.f * (z.anzahl === 1 ? 1.25 : 1.1)
  const formen: Form[] = lage.p.map(([x, y]) => ({ typ: z.form, x, y, g, dreh: z.dreh, fuell: z.fuell, ton: z.ton, dick: 3 }))
  return { elemente: [...formen, ...zusatzFormen(z.zusatz)] }
}
const schluessel = (z: Zelle) => `${z.form}|${z.anzahl}|${z.fuell}|${z.groesse}|${z.dreh}|${z.ton}|${z.zusatz.map(b => (b ? 1 : 0)).join('')}`

// ── Bauen ─────────────────────────────────────────────────────────────────────
interface AttrPlan { attr: Attr; regel: Regel; werte: (string | number)[]; perm: number[]; k: number }

function wertIndex(p: AttrPlan, zeile: number, spalte: number): number {
  switch (p.regel) {
    case 'zeile': return p.perm[zeile]
    case 'spalte': return p.perm[spalte]
    case 'folge': return spalte
    case 'verteilung': return p.perm[(zeile + p.k * spalte) % 3]
  }
}
function regelText(p: AttrPlan): string {
  switch (p.regel) {
    case 'zeile': return `${NAME[p.attr]}: in jeder Zeile gleich`
    case 'spalte': return `${NAME[p.attr]}: in jeder Spalte gleich`
    case 'folge': return `${NAME[p.attr]}: ändert sich in jeder Zeile von links nach rechts in derselben Reihenfolge`
    case 'verteilung': return `${NAME[p.attr]}: jede Ausprägung kommt in jeder Zeile und jeder Spalte genau einmal vor`
  }
}
const VERKN_TEXT: Record<Verknuepfung, string> = {
  vereinigung: 'Punkte/Striche am Rand: das dritte Feld zeigt alles aus dem ersten UND dem zweiten Feld zusammen',
  xor: 'Punkte/Striche am Rand: das dritte Feld zeigt nur, was in genau EINEM der ersten beiden Felder vorkommt',
  schnitt: 'Punkte/Striche am Rand: das dritte Feld zeigt nur, was in BEIDEN ersten Feldern vorkommt',
}

function zufallsMenge(r: Rng, min: number, max: number): boolean[] {
  const n = r.int(min, max)
  const an = new Set(r.ausN(Array.from({ length: ZUSATZ_ANZAHL }, (_, i) => i), n))
  return Array.from({ length: ZUSATZ_ANZAHL }, (_, i) => an.has(i))
}
function verknuepfe(a: boolean[], b: boolean[], v: Verknuepfung): boolean[] {
  return a.map((x, i) => (v === 'vereinigung' ? x || b[i] : v === 'xor' ? x !== b[i] : x && b[i]))
}

export interface Matrix { zellen: Zelle[]; regeln: string[]; plaene: AttrPlan[]; verkn: Verknuepfung | null }

export function baueMatrix(r: Rng, stufe: number): Matrix {
  const plan = PLAN[klemme(Math.round(stufe), 1, 10) - 1]
  // welche Eigenschaften ändern sich?
  let kandidaten: Attr[] = ['form', 'anzahl', 'fuell', 'groesse', 'ton']
  const mitDreh = !!plan.dreh && r.chance(0.8)
  if (mitDreh) kandidaten = ['dreh', ...kandidaten.filter(a => a !== 'form')]
  const gewaehlt: Attr[] = mitDreh ? ['dreh', ...r.ausN(kandidaten.filter(a => a !== 'dreh'), plan.n - 1)] : r.ausN(kandidaten, plan.n)

  const plaene: AttrPlan[] = gewaehlt.map(attr => {
    const regel = r.aus(plan.regeln)
    const pool = WERTE[attr]
    // 'folge' nimmt aufsteigende Werte in natürlicher Reihenfolge (z. B. 1-2-3, klein-mittel-groß, 0°-90°-180°)
    const werte = regel === 'folge' && attr !== 'form' ? pool.slice(0, 3) : r.ausN(pool, 3)
    return { attr, regel, werte, perm: r.misch([0, 1, 2]), k: r.aus([1, 2]) }
  })
  // feste Werte für alles, was sich nicht ändert
  const fest: Zelle = {
    form: mitDreh ? 'pfeil' : r.aus(FORMEN),
    anzahl: 1, fuell: r.aus(['leer', 'voll', 'schraffur'] as Fuellung[]), groesse: 1, dreh: 0, ton: r.aus([0, 1, 2] as const),
    zusatz: Array(ZUSATZ_ANZAHL).fill(false),
  }
  // Zusätze je Zeile verknüpfen
  const verkn = plan.verkn ? r.aus(plan.verkn) : null
  const zusatz: boolean[][] = Array.from({ length: 9 }, () => Array(ZUSATZ_ANZAHL).fill(false))
  if (verkn) {
    for (let z = 0; z < 3; z++) {
      let a: boolean[], b: boolean[], c: boolean[]
      let versuch = 0
      do {
        a = zufallsMenge(r, 1, 3); b = zufallsMenge(r, 1, 3); c = verknuepfe(a, b, verkn)
        versuch++
        // das Ergebnis soll nie leer sein und sich von beiden Vorgaben unterscheiden — sonst wäre die Regel nicht ablesbar
      } while (versuch < 40 && (!c.some(Boolean) || c.join() === a.join() || c.join() === b.join()))
      zusatz[z * 3] = a; zusatz[z * 3 + 1] = b; zusatz[z * 3 + 2] = c
    }
  }
  const zellen: Zelle[] = []
  for (let z = 0; z < 3; z++) {
    for (let s = 0; s < 3; s++) {
      const zelle: Zelle = { ...fest, zusatz: zusatz[z * 3 + s] }
      for (const p of plaene) (zelle as unknown as Record<string, unknown>)[p.attr] = p.werte[wertIndex(p, z, s)]
      zellen.push(zelle)
    }
  }
  const regeln = plaene.map(regelText)
  if (verkn) regeln.push(VERKN_TEXT[verkn])
  return { zellen, regeln, plaene, verkn }
}

/** Falsche Antworten: die richtige Figur, in genau einer (bei Bedarf zwei) Eigenschaften verändert. */
function falsche(r: Rng, m: Matrix, anzahl: number): Zelle[] {
  const richtig = m.zellen[8]
  const aus: Zelle[] = []
  const gesehen = new Set([schluessel(richtig)])
  const veraendere = (z: Zelle): Zelle => {
    const k: Zelle = { ...z, zusatz: z.zusatz.slice() }
    const moeglich: (Attr | 'zusatz')[] = [...m.plaene.map(p => p.attr), ...(m.verkn ? (['zusatz', 'zusatz'] as const) : [])]
    // gelegentlich auch eine feste Eigenschaft ändern (sonst verrät „nur was sich ändert“ die Lösung)
    if (r.chance(0.2)) moeglich.push(r.aus(['fuell', 'anzahl', 'ton'] as Attr[]))
    const was = r.aus(moeglich)
    if (was === 'zusatz') {
      const i = r.int(0, ZUSATZ_ANZAHL - 1)
      k.zusatz[i] = !k.zusatz[i]
    } else {
      const p = m.plaene.find(x => x.attr === was)
      const pool = (p ? p.werte : WERTE[was]).filter(w => w !== (k as unknown as Record<string, unknown>)[was])
      if (pool.length) (k as unknown as Record<string, unknown>)[was] = r.aus(pool)
    }
    return k
  }
  let versuch = 0
  while (aus.length < anzahl && versuch < 400) {
    versuch++
    let k = veraendere(richtig)
    if (r.chance(0.3)) k = veraendere(k)
    const s = schluessel(k)
    if (gesehen.has(s)) continue
    gesehen.add(s); aus.push(k)
  }
  return aus
}

export const erzeuge: FragenGenerator = (r, stufe) => {
  const s = klemme(Math.round(stufe), 1, 10)
  const m = baueMatrix(r, s)
  const plan = PLAN[s - 1]
  const { optionen, richtig } = mischeAuswahl(r, m.zellen[8], falsche(r, m, plan.optionen - 1), z => S(zelleAlsSzene(z)), schluessel, plan.optionen)
  return {
    aufgabe: 'Welche Figur gehört in das leere Feld?',
    zeige: { art: 'matrix', zellen: m.zellen.map((z, i) => (i === 8 ? null : zelleAlsSzene(z))) },
    optionen, richtig,
    spalten: plan.optionen === 6 ? 6 : 4,
    erklaerung: m.regeln.join('. ') + '.',
    zeitSek: 40 + s * 8,
  }
}
