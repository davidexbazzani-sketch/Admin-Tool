// Tempo-Familie — der gemeinsame Zeichensatz für „Symbol-Suche“ und „Zahlen-Symbol-Code“.
//
// 13 Familien abstrakter Zeichen (Winkel, T, Wanne, Zacke, Fahne, Spitze, Gabel, Kreis, Plus, Kasten,
// Dreieck, Stab, Geteilt). Jede Familie hat 4 Varianten (die Fahne 8): dieselbe Grundform, gedreht oder
// gespiegelt. Zeichen aus VERSCHIEDENEN Familien sind auf einen Blick zu unterscheiden; Zeichen aus
// DERSELBEN Familie nur, wenn man auf die Lage achtet. So steuern die Übungen die Schwierigkeit:
// leichte Stufen mischen Familien, schwere Stufen stellen Varianten einer Familie nebeneinander.
//
// Die Zeichen sind Striche, Kreise und Punkte im Raum 0..100 und werden mit `SzeneBild` gezeichnet.
import type { Form, Szene } from '../../kern/typen'

/** Rohform: Linienzüge (x1,y1,x2,y2,…), Kreise (x, y, Durchmesser), Punkte (x, y) */
interface Roh { zuege: number[][]; kreise?: number[][]; punkte?: number[][] }
type Wandel = (x: number, y: number) => [number, number]

const gleich: Wandel = (x, y) => [x, y]
const d90: Wandel = (x, y) => [100 - y, x]
const d180: Wandel = (x, y) => [100 - x, 100 - y]
const d270: Wandel = (x, y) => [y, 100 - x]
const spiegel: Wandel = (x, y) => [100 - x, y]
const nach = (a: Wandel, b: Wandel): Wandel => (x, y) => { const [u, v] = a(x, y); return b(u, v) }
const DREH4: Wandel[] = [gleich, d90, d180, d270]

const KASTEN = [20, 20, 80, 20, 80, 80, 20, 80, 20, 20]

/** Grundformen je Familie, jeweils mit den Abbildungen, die verschiedene Varianten ergeben */
const BAUPLAN: { name: string; formen: [Roh, Wandel[]][] }[] = [
  { name: 'Winkel', formen: [[{ zuege: [[18, 18, 18, 82, 82, 82]] }, DREH4]] },
  { name: 'T', formen: [[{ zuege: [[18, 18, 82, 18], [50, 18, 50, 82]] }, DREH4]] },
  { name: 'Wanne', formen: [[{ zuege: [[18, 18, 18, 82, 82, 82, 82, 18]] }, DREH4]] },
  { name: 'Zacke', formen: [[{ zuege: [[18, 18, 82, 18, 18, 82, 82, 82]] }, [gleich, spiegel, d90, nach(spiegel, d90)]]] },
  { name: 'Fahne', formen: [[{ zuege: [[30, 82, 30, 18, 78, 18], [30, 50, 64, 50]] }, [...DREH4, spiegel, nach(spiegel, d90), nach(spiegel, d180), nach(spiegel, d270)]]] },
  { name: 'Spitze', formen: [[{ zuege: [[18, 24, 50, 78, 82, 24]] }, DREH4]] },
  { name: 'Gabel', formen: [[{ zuege: [[20, 18, 50, 50, 80, 18], [50, 50, 50, 84]] }, DREH4]] },
  { name: 'Kreis', formen: [
    [{ zuege: [[14, 50, 86, 50]], kreise: [[50, 50, 60]] }, [gleich, d90]],
    [{ zuege: [[24, 76, 76, 24]], kreise: [[50, 50, 60]] }, [gleich, d90]],
  ] },
  { name: 'Plus', formen: [[{ zuege: [[50, 18, 50, 82], [18, 50, 82, 50]], punkte: [[77, 23]] }, DREH4]] },
  { name: 'Kasten', formen: [
    [{ zuege: [KASTEN, [20, 50, 80, 50]] }, [gleich, d90]],
    [{ zuege: [KASTEN, [20, 80, 80, 20]] }, [gleich, d90]],
  ] },
  { name: 'Dreieck', formen: [[{ zuege: [[50, 18, 84, 80, 16, 80, 50, 18]] }, DREH4]] },
  { name: 'Stab', formen: [[{ zuege: [[50, 44, 50, 84]], punkte: [[50, 20]] }, DREH4]] },
  { name: 'Geteilt', formen: [
    [{ zuege: [[16, 50, 84, 50]], punkte: [[50, 24], [50, 76]] }, [gleich, d90]],
    [{ zuege: [[24, 76, 76, 24]], punkte: [[30, 30], [70, 70]] }, [gleich, d90]],
  ] },
]

const STRICH = 9
const PUNKT = 17

function wandle(r: Roh, w: Wandel): Roh {
  const paar = (p: number[]): number[] => { const a: number[] = []; for (let i = 0; i + 1 < p.length; i += 2) a.push(...w(p[i], p[i + 1])); return a }
  return {
    zuege: r.zuege.map(paar),
    kreise: r.kreise?.map(k => [...w(k[0], k[1]), k[2]]),
    punkte: r.punkte?.map(p => w(p[0], p[1])),
  }
}

/** Eindeutige Beschreibung der Form, unabhängig von Reihenfolge und Richtung der Striche */
function signaturVon(r: Roh): string {
  const s: string[] = []
  for (const z of r.zuege) {
    for (let i = 0; i + 3 < z.length; i += 2) {
      const a = [z[i], z[i + 1]], b = [z[i + 2], z[i + 3]]
      const vorn = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1])
      s.push(`s${(vorn ? a : b).join(',')}-${(vorn ? b : a).join(',')}`)
    }
  }
  for (const k of r.kreise ?? []) s.push(`k${k.join(',')}`)
  for (const p of r.punkte ?? []) s.push(`p${p.join(',')}`)
  return s.sort().join('|')
}

function szeneVon(r: Roh): Szene {
  const elemente: Form[] = []
  for (const z of r.zuege) {
    const zu = z.length >= 6 && z[0] === z[z.length - 2] && z[1] === z[z.length - 1]
    const punkte: string[] = []
    for (let i = 0; i + 1 < (zu ? z.length - 2 : z.length); i += 2) punkte.push(`${z[i]} ${z[i + 1]}`)
    elemente.push({ typ: 'pfad', x: 50, y: 50, dick: STRICH, d: `M${punkte.join(' L')}${zu ? ' Z' : ''}` })
  }
  for (const k of r.kreise ?? []) elemente.push({ typ: 'kreis', x: k[0], y: k[1], g: k[2], dick: STRICH })
  for (const p of r.punkte ?? []) elemente.push({ typ: 'punkt', x: p[0], y: p[1], g: PUNKT })
  return { elemente }
}

export interface Glyphe {
  /** laufende Nummer = Stelle in GLYPHEN */
  nr: number
  /** Nummer der Familie (0 … FAMILIEN_ZAHL − 1) */
  familie: number
  /** z. B. „Winkel 2“ */
  name: string
  szene: Szene
  /** eindeutig je Form — zwei Zeichen mit gleicher Signatur sähen gleich aus */
  signatur: string
}

/** alle Zeichen */
export const GLYPHEN: Glyphe[] = []
const JE_FAMILIE: number[][] = []
BAUPLAN.forEach((familie, f) => {
  JE_FAMILIE.push([])
  for (const [roh, wandel] of familie.formen) {
    for (const w of wandel) {
      const form = wandle(roh, w)
      const nr = GLYPHEN.length
      JE_FAMILIE[f].push(nr)
      GLYPHEN.push({ nr, familie: f, name: `${familie.name} ${JE_FAMILIE[f].length}`, szene: szeneVon(form), signatur: signaturVon(form) })
    }
  }
})

export const FAMILIEN_ZAHL = BAUPLAN.length
export const FAMILIEN_NAMEN: string[] = BAUPLAN.map(f => f.name)
/** die Zeichen einer Familie (Nummern in GLYPHEN) */
export const glyphenVon = (familie: number): readonly number[] => JE_FAMILIE[familie] ?? []
