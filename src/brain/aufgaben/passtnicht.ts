// Was passt nicht? Fünf Figuren, vier haben etwas gemeinsam — welche fällt heraus?
// (Regel selbst finden: Klassifizieren und Abstrahieren.)
//
// Stufe 1: andere Form · 2: andere Füllung · 3: andere Anzahl · 4: gespiegelt statt gedreht ·
// 5: nicht symmetrisch · 6: Innen- und Außenform verschieden · 7: ungerade statt gerade Anzahl ·
// 8: Zahl der Punkte ≠ Zahl der Ecken · 9: „Runde gefüllt, Eckige leer“ verletzt ·
// 10: Größer-oben-Regel verletzt bzw. die schwierigen Regeln gemischt.
//
// Damit nur EINE Figur herausfällt, kommen alle übrigen Unterschiede („Rauschen“) immer bei
// mindestens zwei Figuren vor — keine Figur ist in einer Nebensache allein.
import type { Form, FormTyp, Fuellung, FragenGenerator, Szene } from '../kern/typen'
import { S } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { klemme } from '../kern/zufall'
import { alsSzene, drehe, festeFigur, spiegle, zufallsFigur } from './polyomino'

interface Aufgabe { bilder: Szene[]; fremd: number; regel: string }

/** Rauschen: zwei Werte, aufgeteilt 2 : 3 (oder 3 : 2), gemischt */
function rauschen<A>(r: Rng, a: A, b: A): A[] {
  const drei = r.chance(0.5)
  return r.misch([a, a, b, b, drei ? a : b])
}
const ECKIG: FormTyp[] = ['quadrat', 'dreieck', 'raute', 'sechseck', 'fuenfeck']
const RUND: FormTyp[] = ['kreis']
const ALLE: FormTyp[] = ['kreis', 'quadrat', 'dreieck', 'raute', 'sechseck', 'stern', 'kreuz', 'fuenfeck']
const ECKEN: Partial<Record<FormTyp, number>> = { dreieck: 3, quadrat: 4, fuenfeck: 5, sechseck: 6 }

function mitFremd(r: Rng, normal: (i: number) => Szene, fremd: (i: number) => Szene): { bilder: Szene[]; fremd: number } {
  const f = r.int(0, 4)
  return { bilder: Array.from({ length: 5 }, (_, i) => (i === f ? fremd(i) : normal(i))), fremd: f }
}

// 1) andere Form
function form(r: Rng): Aufgabe {
  const [a, b] = r.ausN(ALLE, 2)
  const groesse = rauschen(r, 34, 50)
  const fuell = r.aus(['leer', 'voll'] as Fuellung[])
  const bild = (t: FormTyp, i: number): Szene => ({ elemente: [{ typ: t, x: 50, y: 50, g: groesse[i], fuell, ton: 1 }] })
  return { ...mitFremd(r, i => bild(a, i), i => bild(b, i)), regel: 'Vier Figuren haben dieselbe Form, eine hat eine andere.' }
}
// 2) andere Füllung
function fuellung(r: Rng): Aufgabe {
  const [fa, fb] = r.ausN(['leer', 'voll', 'schraffur'] as Fuellung[], 2)
  const [t1, t2] = r.ausN(ALLE, 2)
  const formen = rauschen(r, t1, t2)
  const bild = (f: Fuellung, i: number): Szene => ({ elemente: [{ typ: formen[i], x: 50, y: 50, g: 46, fuell: f, ton: 1 }] })
  return { ...mitFremd(r, i => bild(fa, i), i => bild(fb, i)), regel: 'Vier Figuren sind gleich gefüllt, eine anders — die Form spielt keine Rolle.' }
}
// verteilt GENAU n kleine Formen (n ≤ 9) ohne Überlappung: zufällige Felder eines 3×3-Rasters, leicht versetzt
function streue(r: Rng, n: number, form: (k: number) => Form): Form[] {
  const felder = r.ausN([0, 1, 2, 3, 4, 5, 6, 7, 8], Math.min(9, n))
  return felder.map((f, k) => ({ ...form(k), x: 22 + (f % 3) * 28 + r.int(-4, 4), y: 22 + Math.floor(f / 3) * 28 + r.int(-4, 4) }))
}
// 3) andere Anzahl
function anzahl(r: Rng): Aufgabe {
  const n = r.int(2, 5), m = n + (r.chance(0.5) || n === 2 ? 1 : -1)
  const [t1, t2] = r.ausN(['kreis', 'quadrat', 'dreieck', 'raute'] as FormTyp[], 2)
  const formen = rauschen(r, t1, t2)
  const bild = (k: number, i: number): Szene => ({ elemente: streue(r, k, () => ({ typ: formen[i], x: 0, y: 0, g: 17, fuell: 'voll', ton: 1 })) })
  return { ...mitFremd(r, i => bild(n, i), i => bild(m, i)), regel: `Vier Bilder zeigen ${n} Figuren, eines zeigt ${m}.` }
}
// 4) gespiegelt statt gedreht
function gespiegelt(r: Rng, schwer: boolean): Aufgabe {
  const fig = schwer ? zufallsFigur(r, r.int(6, 7)) : festeFigur(r, r.aus([4, 5, 5, 5]))
  const lagen = r.misch([0, 1, 2, 3])
  const f = r.int(0, 4)
  const bilder = Array.from({ length: 5 }, (_, i) => (i === f ? alsSzene(drehe(spiegle(fig), r.int(0, 3))) : alsSzene(drehe(fig, lagen[i % 4]))))
  return { bilder, fremd: f, regel: 'Vier Figuren sind dieselbe, nur gedreht. Eine ist das Spiegelbild — sie lässt sich durch Drehen nicht zur Deckung bringen.' }
}
// 5) nicht symmetrisch
function symmetrie(r: Rng): Aufgabe {
  const bild = (sym: boolean): Szene => {
    const mitte: FormTyp = r.aus(['quadrat', 'kreis', 'dreieck', 'sechseck'])
    const seite: FormTyp = r.aus(['kreis', 'quadrat', 'raute'])
    const y = r.int(28, 72)
    const e: Form[] = [
      { typ: mitte, x: 50, y: 50, g: 30, fuell: 'leer', ton: 1 },
      { typ: seite, x: 20, y, g: 14, fuell: 'voll', ton: 0 },
      // symmetrisch: Gegenstück auf gleicher Höhe · sonst deutlich versetzt
      { typ: seite, x: 80, y: sym ? y : y + (y > 50 ? -1 : 1) * r.int(18, 24), g: 14, fuell: 'voll', ton: 0 },
    ]
    return { elemente: e }
  }
  return { ...mitFremd(r, () => bild(true), () => bild(false)), regel: 'Vier Bilder sind spiegelsymmetrisch (links wie rechts), eines nicht.' }
}
// 6) Innen- und Außenform
function innenAussen(r: Rng): Aufgabe {
  const pool: FormTyp[] = ['kreis', 'quadrat', 'dreieck', 'sechseck', 'raute']
  const fuell = rauschen<Fuellung>(r, 'voll', 'leer')
  const bild = (gleich: boolean, i: number): Szene => {
    const aussen = r.aus(pool)
    const innen = gleich ? aussen : r.aus(pool.filter(p => p !== aussen))
    return { elemente: [{ typ: aussen, x: 50, y: 50, g: 62, fuell: 'leer', ton: 1 }, { typ: innen, x: 50, y: aussen === 'dreieck' ? 56 : 50, g: 22, fuell: fuell[i], ton: 2 }] }
  }
  return { ...mitFremd(r, i => bild(true, i), i => bild(false, i)), regel: 'In vier Bildern hat die innere Figur dieselbe Form wie die äußere, in einem nicht.' }
}
// 7) gerade / ungerade
function paritaet(r: Rng): Aufgabe {
  const gerade = r.chance(0.5)
  const g1 = [2, 4, 6], u1 = [3, 5, 7]
  const [t1, t2] = r.ausN(['kreis', 'quadrat', 'raute'] as FormTyp[], 2)
  const formen = rauschen(r, t1, t2)
  const bild = (k: number, i: number): Szene => ({ elemente: streue(r, k, () => ({ typ: formen[i], x: 0, y: 0, g: 13, fuell: 'voll', ton: 1 })) })
  // die vier „normalen“ Bilder zeigen NICHT alle dieselbe Zahl — sonst wäre es Regel 3
  const zahlen = r.misch(gerade ? [2, 4, 6, r.aus(g1)] : [3, 5, 7, r.aus(u1)])
  let z = 0
  const { bilder, fremd } = mitFremd(r, i => bild(zahlen[z++], i), i => bild(r.aus(gerade ? [3, 5] : [4, 6]), i))
  return { bilder, fremd, regel: `Vier Bilder zeigen eine ${gerade ? 'gerade' : 'ungerade'} Anzahl von Figuren, eines eine ${gerade ? 'ungerade' : 'gerade'}.` }
}
// 8) Punkte = Ecken
function punkteEcken(r: Rng): Aufgabe {
  const formen: FormTyp[] = ['dreieck', 'quadrat', 'fuenfeck', 'sechseck']
  const bild = (passt: boolean): Szene => {
    const t = r.aus(formen), ecken = ECKEN[t] as number
    const n = passt ? ecken : ecken + r.aus(ecken <= 3 ? [1, 2] : [-1, 1])
    const punkte: Form[] = Array.from({ length: n }, (_, i) => ({ typ: 'punkt' as FormTyp, x: 50 + (i - (n - 1) / 2) * 11, y: 90, g: 8, ton: 0 as const }))
    return { elemente: [{ typ: t, x: 50, y: 42, g: 56, fuell: 'leer', ton: 1 }, ...punkte] }
  }
  return { ...mitFremd(r, () => bild(true), () => bild(false)), regel: 'In vier Bildern stehen unter der Figur so viele Punkte, wie sie Ecken hat. In einem stimmt die Zahl nicht.' }
}
// 9) Runde gefüllt, Eckige leer
function rundGefuellt(r: Rng): Aufgabe {
  const rundVoll = r.chance(0.5)
  const bild = (verletzt: boolean): Szene => {
    const plaetze: [number, number][] = r.misch([[28, 30], [72, 30], [28, 72], [72, 72], [50, 51]] as [number, number][]).slice(0, 3)
    const arten = r.misch([true, false, r.chance(0.5)])            // true = rund; mindestens eine runde und eine eckige
    const falschBei = verletzt ? r.int(0, 2) : -1
    const e: Form[] = plaetze.map(([x, y], i) => {
      const rund = arten[i]
      let voll = rund === rundVoll
      if (i === falschBei) voll = !voll
      return { typ: rund ? r.aus(RUND) : r.aus(ECKIG), x, y, g: 22, fuell: voll ? 'voll' : 'leer', ton: 1 }
    })
    return { elemente: e }
  }
  return {
    ...mitFremd(r, () => bild(false), () => bild(true)),
    regel: rundVoll ? 'In vier Bildern sind alle Kreise gefüllt und alle eckigen Figuren leer. In einem bricht eine Figur diese Regel.' : 'In vier Bildern sind alle Kreise leer und alle eckigen Figuren gefüllt. In einem bricht eine Figur diese Regel.',
  }
}
// 10) die größere Figur steht oben
function groesserOben(r: Rng): Aufgabe {
  const oben = r.chance(0.5)
  const fuell = rauschen<Fuellung>(r, 'voll', 'leer')
  const bild = (passt: boolean, i: number): Szene => {
    const [t1, t2] = r.ausN(ALLE, 2)
    const grossOben = passt ? oben : !oben
    const x1 = r.int(34, 66), x2 = r.int(34, 66)
    return { elemente: [
      { typ: t1, x: x1, y: 28, g: grossOben ? 38 : 20, fuell: fuell[i], ton: 1 },
      { typ: t2, x: x2, y: 74, g: grossOben ? 20 : 38, fuell: fuell[i], ton: 2 },
    ] }
  }
  return { ...mitFremd(r, i => bild(true, i), i => bild(false, i)), regel: `In vier Bildern steht die größere Figur ${oben ? 'oben' : 'unten'}, in einem ${oben ? 'unten' : 'oben'} — Form, Farbe und Füllung spielen keine Rolle.` }
}

export const erzeuge: FragenGenerator = (r, stufeRoh) => {
  const s = klemme(Math.round(stufeRoh), 1, 10)
  const a: Aufgabe = s === 1 ? form(r) : s === 2 ? fuellung(r) : s === 3 ? anzahl(r) : s === 4 ? gespiegelt(r, false)
    : s === 5 ? symmetrie(r) : s === 6 ? innenAussen(r) : s === 7 ? paritaet(r) : s === 8 ? punkteEcken(r)
      : s === 9 ? rundGefuellt(r) : r.aus([groesserOben, rundGefuellt, punkteEcken, (x: Rng) => gespiegelt(x, true)])(r)
  return {
    aufgabe: 'Welches Bild passt nicht zu den anderen?',
    optionen: a.bilder.map(S), richtig: a.fremd, spalten: 5,
    erklaerung: a.regel,
    zeitSek: 30 + s * 6,
  }
}
