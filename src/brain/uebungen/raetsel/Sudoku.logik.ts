// Sudoku — Logik ohne Oberfläche: Gitter erzeugen, lösen, prüfen, werten.
//
// Stufen (Größe · Vorgaben · nötige Technik · Richtzeit):
//    1  4×4 (Kästchen 2×2) ·  8 von 16 · nur Einzelschritte · 0:40
//    2  4×4                ·  6        · nur Einzelschritte · 0:55
//    3  6×6 (Kästchen 2×3) · 20 von 36 · nur Einzelschritte · 2:00
//    4  6×6                · 17        · nur Einzelschritte · 2:45
//    5  6×6                · 14        · nur Einzelschritte · 3:30
//    6  9×9 (Kästchen 3×3) · 40 von 81 · nur Einzelschritte · 7:00
//    7  9×9                · 36        · nur Einzelschritte · 9:00
//    8  9×9                · 32        · nur Einzelschritte · 12:00
//    9  9×9                · 29        · beliebig           · 15:00
//   10  9×9                · 26        · beliebig           · 19:00
// „Nur Einzelschritte“ heißt: Das Rätsel lässt sich allein damit lösen, dass in einem Feld nur noch
// eine Ziffer möglich ist oder eine Ziffer in Zeile/Spalte/Kästchen nur noch an einer Stelle passt.
// Ab Stufe 9 können Zwischenschritte mit Notizen nötig sein. Jedes Rätsel hat genau EINE Lösung.
//
// Erzeugung: gültiges volles Gitter füllen (Rückverfolgung mit Zufall), dann Felder in zufälliger
// Reihenfolge leeren (möglichst punktsymmetrisch), solange der Löser genau eine Lösung bestätigt.
// Wird die Zahl der Vorgaben nicht ganz erreicht, bleiben einzelne Vorgaben mehr stehen.
//
// Wertung: vor allem die Zeit gegen die Richtzeit; jeder falsche Eintrag kostet 3 % (höchstens 30 %).
import type { Rng } from '../../kern/zufall'
import { klemme } from '../../kern/zufall'
import { tempoAus } from '../../kern/wertung'

export interface SudokuForm { n: number; /** Kästchen-Höhe (Zeilen) */ kh: number; /** Kästchen-Breite (Spalten) */ kb: number }
export interface SudokuStufe extends SudokuForm { vorgaben: number; nurEinzel: boolean; richtSek: number }
export interface SudokuRaetsel extends SudokuForm {
  /** n·n Felder zeilenweise, 0 = leer */
  vorgabe: number[]
  loesung: number[]
  /** tatsächliche Zahl der Vorgaben */
  vorgaben: number
}

const FORM4: SudokuForm = { n: 4, kh: 2, kb: 2 }
const FORM6: SudokuForm = { n: 6, kh: 2, kb: 3 }
const FORM9: SudokuForm = { n: 9, kh: 3, kb: 3 }

const STUFEN: SudokuStufe[] = [
  { ...FORM4, vorgaben: 8, nurEinzel: true, richtSek: 40 },
  { ...FORM4, vorgaben: 6, nurEinzel: true, richtSek: 55 },
  { ...FORM6, vorgaben: 20, nurEinzel: true, richtSek: 120 },
  { ...FORM6, vorgaben: 17, nurEinzel: true, richtSek: 165 },
  { ...FORM6, vorgaben: 14, nurEinzel: true, richtSek: 210 },
  { ...FORM9, vorgaben: 40, nurEinzel: true, richtSek: 420 },
  { ...FORM9, vorgaben: 36, nurEinzel: true, richtSek: 540 },
  { ...FORM9, vorgaben: 32, nurEinzel: true, richtSek: 720 },
  { ...FORM9, vorgaben: 29, nurEinzel: false, richtSek: 900 },
  { ...FORM9, vorgaben: 26, nurEinzel: false, richtSek: 1140 },
]
export const sudokuStufe = (stufe: number): SudokuStufe => STUFEN[klemme(Math.round(stufe), 1, 10) - 1]

/** Nummer des Kästchens (0..n−1) zu Zeile und Spalte */
export const sudokuKasten = (f: SudokuForm, zeile: number, spalte: number): number =>
  Math.floor(zeile / f.kh) * f.kh + Math.floor(spalte / f.kb)

const bitzahl = (m: number): number => { let a = 0; while (m) { m &= m - 1; a++ } return a }

export interface SudokuSuche {
  /** gefundene Lösungen (höchstens `grenze`) */
  anzahl: number
  /** die erste gefundene Lösung */
  loesung: number[] | null
  /** Suche wurde wegen der Knotengrenze abgebrochen (Ergebnis dann unsicher) */
  abbruch: boolean
}

/**
 * Rückverfolgung mit „engstes Feld zuerst“. Zählt Lösungen bis `grenze` (2 genügt für „eindeutig?“).
 * Mit `r` werden die Ziffern in zufälliger Reihenfolge probiert (zum Füllen eines neuen Gitters).
 */
export function sudokuSuche(feld: readonly number[], f: SudokuForm, grenze = 2, knotenMax = 20000, r?: Rng): SudokuSuche {
  const { n } = f
  const N = n * n
  const voll = (1 << n) - 1
  const g = feld.slice()
  const zm = new Int32Array(n), sm = new Int32Array(n), km = new Int32Array(n)
  const zi = new Int8Array(N), si = new Int8Array(N), ki = new Int8Array(N)
  for (let i = 0; i < N; i++) { zi[i] = Math.floor(i / n); si[i] = i % n; ki[i] = sudokuKasten(f, zi[i], si[i]) }
  for (let i = 0; i < N; i++) {
    if (!g[i]) continue
    const bit = 1 << (g[i] - 1)
    if ((zm[zi[i]] | sm[si[i]] | km[ki[i]]) & bit) return { anzahl: 0, loesung: null, abbruch: false }   // Widerspruch in den Vorgaben
    zm[zi[i]] |= bit; sm[si[i]] |= bit; km[ki[i]] |= bit
  }
  let anzahl = 0, knoten = 0, abbruch = false
  let loesung: number[] | null = null
  const geh = (): void => {
    if (++knoten > knotenMax) { abbruch = true; return }
    let best = -1, bestAnz = 99, bestMaske = 0
    for (let i = 0; i < N; i++) {
      if (g[i]) continue
      const m = voll & ~(zm[zi[i]] | sm[si[i]] | km[ki[i]])
      if (!m) return                                    // Sackgasse
      const a = bitzahl(m)
      if (a < bestAnz) { best = i; bestAnz = a; bestMaske = m; if (a === 1) break }
    }
    if (best < 0) { anzahl++; if (!loesung) loesung = g.slice(); return }
    let ziffern: number[] = []
    for (let w = 1; w <= n; w++) if (bestMaske & (1 << (w - 1))) ziffern.push(w)
    if (r) ziffern = r.misch(ziffern)
    const z = zi[best], s = si[best], k = ki[best]
    for (const w of ziffern) {
      const bit = 1 << (w - 1)
      g[best] = w; zm[z] |= bit; sm[s] |= bit; km[k] |= bit
      geh()
      g[best] = 0; zm[z] &= ~bit; sm[s] &= ~bit; km[k] &= ~bit
      if (anzahl >= grenze || abbruch) return
    }
  }
  geh()
  return { anzahl, loesung, abbruch }
}

/** Hat das Rätsel genau eine Lösung? (bei Abbruch der Suche: nein, zur Sicherheit) */
export function sudokuEindeutig(feld: readonly number[], f: SudokuForm): boolean {
  const e = sudokuSuche(feld, f, 2)
  return !e.abbruch && e.anzahl === 1
}

/** Alle Einheiten (Zeilen, Spalten, Kästchen) als Listen von Feld-Nummern */
export function sudokuEinheiten(f: SudokuForm): number[][] {
  const { n } = f
  const e: number[][] = Array.from({ length: 3 * n }, () => [])
  for (let z = 0; z < n; z++) for (let s = 0; s < n; s++) {
    const i = z * n + s
    e[z].push(i); e[n + s].push(i); e[2 * n + sudokuKasten(f, z, s)].push(i)
  }
  return e
}

/**
 * Lässt sich das Rätsel allein mit Einzelschritten lösen?
 * (nur eine Ziffer im Feld möglich · Ziffer passt in der Einheit nur an einer Stelle)
 */
export function sudokuNurEinzel(feld: readonly number[], f: SudokuForm): boolean {
  const { n } = f
  const N = n * n
  const voll = (1 << n) - 1
  const g = feld.slice()
  const einheiten = sudokuEinheiten(f)
  const zm = new Int32Array(n), sm = new Int32Array(n), km = new Int32Array(n)
  const setze = (i: number, w: number) => {
    const z = Math.floor(i / n), s = i % n, bit = 1 << (w - 1)
    g[i] = w; zm[z] |= bit; sm[s] |= bit; km[sudokuKasten(f, z, s)] |= bit
  }
  const moeglich = (i: number): number => {
    const z = Math.floor(i / n), s = i % n
    return voll & ~(zm[z] | sm[s] | km[sudokuKasten(f, z, s)])
  }
  let offen = 0
  for (let i = 0; i < N; i++) { if (feld[i]) setze(i, feld[i]); else offen++ }
  let weiter = true
  while (weiter && offen > 0) {
    weiter = false
    for (let i = 0; i < N; i++) {
      if (g[i]) continue
      const m = moeglich(i)
      if (!m) return false
      if ((m & (m - 1)) === 0) { setze(i, 32 - Math.clz32(m)); offen--; weiter = true }
    }
    for (const e of einheiten) {
      for (let w = 1; w <= n; w++) {
        const bit = 1 << (w - 1)
        let ort = -1, anz = 0
        for (const i of e) {
          if (g[i] === w) { anz = 9; break }
          if (!g[i] && (moeglich(i) & bit)) { ort = i; anz++ }
        }
        if (anz === 1) { setze(ort, w); offen--; weiter = true }
      }
    }
  }
  return offen === 0
}

/** Ist ein VOLLES Gitter gültig (jede Ziffer je Zeile, Spalte, Kästchen genau einmal)? */
export function sudokuGueltig(gitter: readonly number[], f: SudokuForm): boolean {
  if (gitter.length !== f.n * f.n) return false
  for (const e of sudokuEinheiten(f)) {
    let m = 0
    for (const i of e) { const w = gitter[i]; if (!(w >= 1 && w <= f.n)) return false; m |= 1 << (w - 1) }
    if (m !== (1 << f.n) - 1) return false
  }
  return true
}

/** Felder, deren Ziffer in Zeile, Spalte oder Kästchen doppelt vorkommt */
export function sudokuKonflikte(feld: readonly number[], f: SudokuForm): boolean[] {
  const k: boolean[] = new Array(f.n * f.n).fill(false)
  for (const e of sudokuEinheiten(f)) {
    for (let a = 0; a < e.length; a++) {
      if (!feld[e[a]]) continue
      for (let b = a + 1; b < e.length; b++) if (feld[e[a]] === feld[e[b]]) { k[e[a]] = true; k[e[b]] = true }
    }
  }
  return k
}

/** Ein neues Rätsel. Gleicher Zufall + gleiche Stufe = gleiches Rätsel. */
export function sudokuErzeuge(r: Rng, stufe: number): SudokuRaetsel {
  const st = sudokuStufe(stufe)
  const f: SudokuForm = { n: st.n, kh: st.kh, kb: st.kb }
  const N = st.n * st.n
  let best: SudokuRaetsel | null = null
  // höchstens 5 Anläufe mit je einem neuen Gitter; der beste (wenigste Vorgaben) gewinnt
  for (let versuch = 0; versuch < 5; versuch++) {
    const voll = sudokuSuche(new Array(N).fill(0), f, 1, 200000, r).loesung
    if (!voll) continue
    const feld = voll.slice()
    let rest = N
    const geht = (): boolean => sudokuEindeutig(feld, f) && (!st.nurEinzel || sudokuNurEinzel(feld, f))
    for (const i of r.misch(Array.from({ length: N }, (_, k) => k))) {
      if (rest <= st.vorgaben) break
      if (!feld[i]) continue
      const j = N - 1 - i                               // punktsymmetrischer Partner
      const a = feld[i], b = feld[j]
      if (j !== i && b && rest - 2 >= st.vorgaben) {
        feld[i] = 0; feld[j] = 0
        if (geht()) { rest -= 2; continue }
        feld[j] = b
      } else feld[i] = 0
      if (geht()) rest--
      else feld[i] = a
    }
    if (!best || rest < best.vorgaben) best = { ...f, vorgabe: feld, loesung: voll, vorgaben: rest }
    if (rest <= st.vorgaben) break
  }
  if (!best) {
    // praktisch unerreichbar (das Füllen gelingt immer) — zur Sicherheit ein gelöstes Gitter mit einer Lücke
    const voll = sudokuSuche(new Array(N).fill(0), f, 1, 1e7).loesung as number[]
    const feld = voll.slice(); feld[0] = 0
    best = { ...f, vorgabe: feld, loesung: voll, vorgaben: N - 1 }
  }
  return best
}

/** Güte eines gelösten Rätsels: Zeit gegen die Richtzeit, falsche Einträge kosten je 3 % (höchstens 30 %). */
export function sudokuLeistung(stufe: number, ms: number, fehler: number): number {
  const richt = sudokuStufe(stufe).richtSek * 1000
  const sorgfalt = 1 - Math.min(0.3, Math.max(0, fehler) * 0.03)
  return klemme(sorgfalt * (0.55 + 0.45 * tempoAus(ms, richt * 0.4, richt * 2)), 0, 1)
}

/** Güte nach „Aufgeben“: höchstens 0,3 — je nach Anteil der schon richtig gefüllten Felder. */
export const sudokuAufgabeLeistung = (richtig: number, offenGesamt: number): number =>
  offenGesamt > 0 ? klemme(0.3 * richtig / offenGesamt, 0, 0.3) : 0
