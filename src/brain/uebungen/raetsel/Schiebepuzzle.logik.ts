// Schiebepuzzle — Logik ohne Oberfläche: mischen, kürzesten Weg suchen, werten.
//
// Nummerierte Steine und eine Lücke; ein Stein neben der Lücke rutscht hinein. Ziel: 1, 2, 3 … der
// Reihe nach, die Lücke unten rechts.
//
// Stufen (Brett · Abstand zum Ziel · Bretter je Durchgang):
//    1  3×3 · kürzester Weg  4–6  Züge · 3 Bretter       6  4×4 · kürzester Weg 12–16 Züge · 2 Bretter
//    2  3×3 · kürzester Weg  7–10 Züge · 3 Bretter       7  4×4 · kürzester Weg 18–22 Züge · 2 Bretter
//    3  3×3 · kürzester Weg 11–14 Züge · 2 Bretter       8  4×4 · kürzester Weg 24–28 Züge · 1 Brett
//    4  3×3 · kürzester Weg 15–19 Züge · 2 Bretter       9  4×4 · tief gemischt, meist um 36 Züge (24–42) · 1 Brett
//    5  3×3 · kürzester Weg 20–26 Züge · 1 Brett        10  4×4 · voll gemischt, meist um 48 Züge (34–56) · 1 Brett
//
// Erzeugung: vom gelösten Brett aus zufällige erlaubte Züge, nie der Zug zurück; Schleifen werden
// herausgeschnitten, der Mischweg besucht also kein Brett zweimal. So ist jedes Brett lösbar (den
// Mischweg rückwärts gehen) und nie schon gelöst.
//   Stufe 1–8: Nach dem Mischen wird der KÜRZESTE Weg gesucht (IDA*, exakt). Ist er kürzer als für
//     die Stufe gewürfelt, wird um genau die fehlenden Züge weitergemischt — der kürzeste Weg kann
//     dabei nie über das Ziel hinauswachsen — bis er im Bereich der Stufe liegt.
//   Stufe 9–10: Es wird gemischt, bis die Summe der Abstände aller Steine zu ihrem Platz den Wert der
//     Stufe erreicht (24–28 bzw. 32–38). Der kürzeste Weg ist dort meist nicht mehr schnell
//     berechenbar; der Richtwert ist dann eine Schätzung (Abstandssumme × 1,45, an rund 90 nachgerechneten
//     Brettern bestimmt) und `exakt` ist false.
// Die Suche hat einen festen Rahmen an Knoten (Stufe 1–8: alle Suchen eines Bretts zusammen 500 000,
// auf 3×3 1 000 000; Stufe 9–10: ein Versuch mit 150 000) — reicht er nicht, gilt die Schätzung.
//
// Wertung: Züge gegen den Richtwert („Par“) — bis zum 1,5-fachen volle Güte, danach je weiteres Par 15 %
// weniger (mindestens 0,5) — und Zeit gegen die Richtzeit (3×3: 8 s + 2,5 s je Par-Zug · 4×4: 10 s + 3 s).
import type { Rng } from '../../kern/zufall'
import { klemme, rng } from '../../kern/zufall'
import { guete, tempoAus } from '../../kern/wertung'

export interface SchiebeStufe {
  n: number
  /** Stufe 1–8: Länge des kürzesten Wegs · Stufe 9–10 (`tief`): Summe der Abstände */
  von: number
  bis: number
  bretter: number
  tief?: boolean
}
export interface SchiebeBrett {
  n: number
  /** n·n Plätze zeilenweise: Nummer des Steins, 0 = Lücke */
  start: number[]
  /** eine Lösung: diese Steine der Reihe nach schieben (bei `exakt` die kürzeste, sonst der Mischweg rückwärts) */
  loesung: number[]
  /** Richtwert: Länge des kürzesten Wegs (bei `exakt` nachgewiesen, sonst geschätzt) */
  par: number
  exakt: boolean
}

const STUFEN: SchiebeStufe[] = [
  { n: 3, von: 4, bis: 6, bretter: 3 },
  { n: 3, von: 7, bis: 10, bretter: 3 },
  { n: 3, von: 11, bis: 14, bretter: 2 },
  { n: 3, von: 15, bis: 19, bretter: 2 },
  { n: 3, von: 20, bis: 26, bretter: 1 },
  { n: 4, von: 12, bis: 16, bretter: 2 },
  { n: 4, von: 18, bis: 22, bretter: 2 },
  { n: 4, von: 24, bis: 28, bretter: 1 },
  { n: 4, von: 24, bis: 28, bretter: 1, tief: true },
  { n: 4, von: 32, bis: 38, bretter: 1, tief: true },
]
export const schiebeStufe = (stufe: number): SchiebeStufe => STUFEN[klemme(Math.round(stufe), 1, 10) - 1]

/** Das gelöste Brett: 1 … n²−1, Lücke am Ende */
export const schiebeZiel = (n: number): number[] => Array.from({ length: n * n }, (_, i) => (i + 1) % (n * n))

export const schiebeGeloest = (feld: readonly number[]): boolean => feld.every((w, i) => w === (i + 1) % feld.length)

/** Plätze neben Platz p (oben, unten, links, rechts) */
export function schiebeNachbarn(n: number, p: number): number[] {
  const z = Math.floor(p / n), s = p % n
  const a: number[] = []
  if (z > 0) a.push(p - n)
  if (z < n - 1) a.push(p + n)
  if (s > 0) a.push(p - 1)
  if (s < n - 1) a.push(p + 1)
  return a
}

/** Stein in die Lücke schieben. Gibt das neue Brett zurück, oder null, wenn der Stein nicht neben der Lücke liegt. */
export function schiebeZug(feld: readonly number[], n: number, stein: number): number[] | null {
  if (stein <= 0) return null
  const p = feld.indexOf(stein), l = feld.indexOf(0)
  if (p < 0 || !schiebeNachbarn(n, l).includes(p)) return null
  const neu = feld.slice()
  neu[l] = stein; neu[p] = 0
  return neu
}

/**
 * Welcher Stein bewegt sich bei einer Pfeiltaste? Die Richtung ist die Bewegung des Steins:
 * „hoch“ schiebt den Stein unter der Lücke nach oben. Gibt 0 zurück, wenn dort kein Stein liegt.
 */
export function schiebeStein(feld: readonly number[], n: number, richtung: 'hoch' | 'runter' | 'links' | 'rechts'): number {
  const l = feld.indexOf(0), z = Math.floor(l / n), s = l % n
  if (richtung === 'hoch') return z < n - 1 ? feld[l + n] : 0
  if (richtung === 'runter') return z > 0 ? feld[l - n] : 0
  if (richtung === 'links') return s < n - 1 ? feld[l + 1] : 0
  return s > 0 ? feld[l - 1] : 0
}

/** Summe der Abstände aller Steine zu ihrem Zielplatz (untere Schranke für die Zahl der Züge) */
export function schiebeAbstand(feld: readonly number[], n: number): number {
  let h = 0
  for (let p = 0; p < feld.length; p++) {
    const t = feld[p]
    if (!t) continue
    h += Math.abs(Math.floor((t - 1) / n) - Math.floor(p / n)) + Math.abs(((t - 1) % n) - (p % n))
  }
  return h
}

/** Geschätzte Länge des kürzesten Wegs, wenn er sich nicht berechnen lässt (gleiche Parität wie die Abstandssumme) */
export function schiebeSchaetzung(feld: readonly number[], n: number): number {
  const md = schiebeAbstand(feld, n)
  const s = Math.round(md * 1.45)
  return (s - md) % 2 === 0 ? s : s + 1
}

/**
 * Kürzester Weg zum Ziel (IDA* mit der Summe der Abstände). Gibt die zu schiebenden Steine zurück;
 * null, wenn die Knotengrenze oder `maxTiefe` überschritten wird. `zaehler.knoten` zählt mit —
 * so können sich mehrere Suchen einen Rahmen teilen.
 */
export function schiebeLoese(start: readonly number[], n: number, knotenMax = 400000, maxTiefe = 200, zaehler?: { knoten: number }): number[] | null {
  const N = n * n
  const feld = start.slice()
  const nachbarn = Array.from({ length: N }, (_, p) => schiebeNachbarn(n, p))
  // Abstand von Stein t auf Platz p zum Zielplatz
  const md: number[][] = Array.from({ length: N }, (_, t) => Array.from({ length: N }, (_, p) =>
    t === 0 ? 0 : Math.abs(Math.floor((t - 1) / n) - Math.floor(p / n)) + Math.abs(((t - 1) % n) - (p % n))))
  const pfad: number[] = []
  let luecke = feld.indexOf(0)
  let knoten = 0, abbruch = false
  const suche = (g: number, h: number, grenze: number, vorher: number): number => {
    if (g + h > grenze) return g + h
    if (h === 0) return -1
    if (++knoten > knotenMax) { abbruch = true; return Infinity }
    let min = Infinity
    const l = luecke
    for (const p of nachbarn[l]) {
      if (p === vorher) continue
      const t = feld[p]
      feld[l] = t; feld[p] = 0; luecke = p; pfad.push(t)
      const e = suche(g + 1, h - md[t][p] + md[t][l], grenze, l)
      if (e === -1) return -1
      pfad.pop(); feld[p] = t; feld[l] = 0; luecke = l
      if (abbruch) return Infinity
      if (e < min) min = e
    }
    return min
  }
  const h0 = schiebeAbstand(feld, n)
  let grenze = h0
  let ergebnis: number[] | null = null
  while (grenze <= maxTiefe) {
    const e = suche(0, h0, grenze, -1)
    if (e === -1) { ergebnis = pfad; break }
    if (abbruch || e === Infinity) break
    grenze = e
  }
  if (zaehler) zaehler.knoten += knoten
  return ergebnis
}

/** Irrweg vom gelösten Brett: zufällige Züge ohne Zurück, Schleifen werden herausgeschnitten. Lässt sich fortsetzen. */
function irrweg(r: Rng, n: number) {
  let feld = schiebeZiel(n)
  const staende: number[][] = [feld]                 // Bretter entlang des Wegs
  const weg: number[] = []                           // geschobene Steine
  const ort = new Map<string, number>([[feld.join(','), 0]])
  const schritt = (): void => {
    const l = feld.indexOf(0)
    const vorher = staende.length > 1 ? staende[staende.length - 2].indexOf(0) : -1
    const p = r.aus(schiebeNachbarn(n, l).filter(x => x !== vorher))
    const stein = feld[p]
    const neu = feld.slice()
    neu[l] = stein; neu[p] = 0
    const schluessel = neu.join(',')
    const schon = ort.get(schluessel)
    if (schon !== undefined) {
      // Schleife: zurück bis zum ersten Besuch dieses Bretts
      while (staende.length > schon + 1) { ort.delete((staende.pop() as number[]).join(',')); weg.pop() }
      feld = staende[staende.length - 1]
    } else {
      staende.push(neu); weg.push(stein); ort.set(schluessel, staende.length - 1)
      feld = neu
    }
  }
  return {
    /** so viele Schritte gehen; am Ende ist das Brett sicher nicht das gelöste */
    geh(schritte: number): void {
      for (let i = 0; i < schritte; i++) schritt()
      for (let i = 0; i < 50 && !weg.length; i++) schritt()
    },
    feld: (): number[] => feld,
    /** Steine des Mischwegs in Mischreihenfolge */
    weg: (): number[] => weg,
  }
}

/** Ein neues Brett. Gleicher Zufall + gleiche Stufe = gleiches Brett. */
export function schiebeErzeuge(r: Rng, stufe: number): SchiebeBrett {
  const st = schiebeStufe(stufe)
  const n = st.n
  const ziel = r.int(st.von, st.bis)
  const gang = irrweg(r, n)
  const rahmen = n === 3 ? 1_000_000 : 500_000          // Knoten für alle Suchen dieses Bretts zusammen (3×3 braucht nie so viele)
  const zaehler = { knoten: 0 }
  const geschaetzt = (): SchiebeBrett => {
    const feld = gang.feld()
    const rueck = gang.weg().slice().reverse()
    // der Mischweg rückwärts ist eine Lösung — länger als er kann der kürzeste Weg nicht sein
    return { n, start: feld.slice(), loesung: rueck, par: Math.min(schiebeSchaetzung(feld, n), rueck.length), exakt: false }
  }
  if (st.tief) {
    gang.geh(ziel)
    for (let i = 0; i < 3000 && schiebeAbstand(gang.feld(), n) < ziel; i++) gang.geh(1)
    // ein Versuch mit kleinem Rahmen: gelingt er, ist der Richtwert exakt — sonst gilt die Schätzung
    const kurz = schiebeLoese(gang.feld(), n, 150_000, gang.weg().length)
    return kurz ? { n, start: gang.feld().slice(), loesung: kurz, par: kurz.length, exakt: true } : geschaetzt()
  }
  gang.geh(ziel)
  for (let runde = 0; runde < 60; runde++) {
    const kurz = schiebeLoese(gang.feld(), n, rahmen - zaehler.knoten, gang.weg().length, zaehler)
    if (!kurz) return geschaetzt()                                     // Rahmen erschöpft
    if (kurz.length >= st.von) return { n, start: gang.feld().slice(), loesung: kurz.slice(), par: kurz.length, exakt: true }
    gang.geh(ziel - kurz.length)                                       // der kürzeste Weg wächst dabei höchstens bis `ziel`
  }
  // praktisch unerreichbar: nach 60 Runden noch zu nah am Ziel — das Brett so nehmen, wie es ist
  const kurz = schiebeLoese(gang.feld(), n, rahmen, gang.weg().length)
  return kurz ? { n, start: gang.feld().slice(), loesung: kurz, par: kurz.length, exakt: true } : geschaetzt()
}

/** Alle Bretter eines Durchgangs — verschieden voneinander (bei kleinen Brettern gibt es nur wenige). */
export function schiebeDurchgang(start: number, stufe: number): SchiebeBrett[] {
  const st = schiebeStufe(stufe)
  const bretter: SchiebeBrett[] = []
  for (let salz = 0; bretter.length < st.bretter; salz++) {
    const b = schiebeErzeuge(rng(start).zweig(`schiebe${salz}`), stufe)
    // ein Brett, das es in diesem Durchgang schon gab, wird übersprungen (nach 20 Würfen nicht mehr → endet sicher)
    if (salz < 20 && bretter.some(x => x.start.join(',') === b.start.join(','))) continue
    bretter.push(b)
  }
  return bretter
}

/** Richtzeit für ein Brett in Sekunden */
export const schiebeRichtSek = (n: number, par: number): number => (n <= 3 ? 8 + par * 2.5 : 10 + par * 3)

/** Güte eines gelösten Durchgangs: Züge gegen den Richtwert, dazu die Zeit gegen die Richtzeit. */
export function schiebeLeistung(zuege: number, par: number, ms: number, richtMs: number): number {
  const sorgfalt = par > 0 ? klemme(1 - (zuege / par - 1.5) * 0.15, 0.5, 1) : 0
  return guete(sorgfalt, tempoAus(ms, richtMs * 0.5, richtMs * 2))
}

/** Güte nach „Aufgeben“: höchstens 0,4 — je nach Anteil der schon gelösten Bretter. */
export const schiebeAufgabeLeistung = (geloest: number, bretter: number): number =>
  bretter > 0 ? klemme(0.45 * geloest / bretter, 0, 0.4) : 0
