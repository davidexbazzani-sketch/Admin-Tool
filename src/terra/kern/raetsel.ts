// Terra Incognita — die vier Rätselarten der Ruinen (und der Tagesfahrt). Jedes Rätsel entsteht aus einem Startwert
// und wird von einem Löser geprüft, bevor es jemand zu sehen bekommt: Es gibt immer eine Lösung.
import { rng, type Rng } from '../../brain/kern/zufall'

export const RAETSEL_NAME: readonly string[] = ['Riff-Lotse', 'Taue spleißen', 'Runenschloss', 'Sternbild']
export const RAETSEL_TEXT: readonly string[] = [
  'Das Boot gleitet in eine Richtung, bis ein Riff oder der Rand es aufhält. Bring es genau auf das Leuchtfeuer.',
  'Dreh die Stücke, bis alle Taue zu einem einzigen Netz verbunden sind und kein Ende lose hängt.',
  'Vier Runen öffnen das Schloss. Nach jedem Versuch zeigt es: wie viele stimmen genau, wie viele stehen nur am falschen Platz.',
  'Die Zahlen am Rand sagen, wie lang die Reihen gefüllter Felder sind. Fülle das Sternbild aus.',
]

// ── 1) Riff-Lotse: gleiten, bis etwas im Weg ist ──
export interface RiffRaetsel { n: number; riff: boolean[]; start: number; ziel: number; par: number }
const VIER: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]]

/** wohin das Boot von `pos` in Richtung k gleitet */
export function gleite(r: Pick<RiffRaetsel, 'n' | 'riff'>, pos: number, k: number): number {
  let x = pos % r.n, y = Math.floor(pos / r.n)
  for (;;) {
    const nx = x + VIER[k][0], ny = y + VIER[k][1]
    if (nx < 0 || ny < 0 || nx >= r.n || ny >= r.n || r.riff[ny * r.n + nx]) break
    x = nx; y = ny
  }
  return y * r.n + x
}
/** kürzeste Zugzahlen vom Start zu allen Haltepunkten */
function riffWege(r: Pick<RiffRaetsel, 'n' | 'riff'>, start: number): Map<number, number> {
  const weg = new Map<number, number>([[start, 0]])
  const reihe = [start]
  for (let i = 0; i < reihe.length; i++) {
    const p = reihe[i], z = weg.get(p) as number
    for (let k = 0; k < 4; k++) { const q = gleite(r, p, k); if (q !== p && !weg.has(q)) { weg.set(q, z + 1); reihe.push(q) } }
  }
  return weg
}
export function riffRaetsel(saat: number, stufe: number): RiffRaetsel {
  const n = 7 + Math.min(3, Math.floor(stufe / 3))
  const wunsch = 4 + Math.min(5, Math.floor((stufe + 1) / 2))            // gewünschte Zugzahl 4 … 9
  let bestes: RiffRaetsel | null = null
  for (let versuch = 0; versuch < 400; versuch++) {
    const z = rng((saat ^ Math.imul(versuch + 1, 0x9E3779B1)) >>> 0)
    const riff: boolean[] = []
    for (let i = 0; i < n * n; i++) riff.push(z.chance(0.16))
    const frei: number[] = []
    for (let i = 0; i < n * n; i++) if (!riff[i]) frei.push(i)
    if (frei.length < n * n * 0.6) continue
    const start = z.aus(frei)
    const wege = riffWege({ n, riff }, start)
    let ziel = -1, zuege = 0
    for (const [p, w] of wege) if (w <= wunsch && (w > zuege || (w === zuege && z.chance(0.3)))) { ziel = p; zuege = w }
    if (ziel < 0 || zuege < 3) continue
    const r: RiffRaetsel = { n, riff, start, ziel, par: zuege }
    if (zuege === wunsch) return r
    if (!bestes || zuege > bestes.par) bestes = r
  }
  // sollte nie nötig sein: ein kleines, sicher lösbares Rätsel
  return bestes ?? { n: 5, riff: new Array<boolean>(25).fill(false), start: 0, ziel: 4, par: 1 }
}
/** löst das Rätsel (kürzeste Zugfolge) — für Tests und als Beweis der Lösbarkeit */
export function loeseRiff(r: RiffRaetsel): number | null { return riffWege(r, r.start).get(r.ziel) ?? null }

// ── 2) Taue spleißen: Teile drehen, bis alles ein Netz ist ──
// Verbindungen als Bits: 1 = oben, 2 = rechts, 4 = unten, 8 = links
export interface TauRaetsel { b: number; h: number; teile: number[]; loesung: number[]; par: number }
export const dreheTeil = (m: number): number => ((m << 1) & 15) | (m >> 3)
const GEGEN = [4, 8, 1, 2], DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]

export function tauRaetsel(saat: number, stufe: number): TauRaetsel {
  const b = 4 + Math.min(2, Math.floor((stufe + 1) / 3)), h = 4 + Math.min(2, Math.floor(stufe / 3))
  const z = rng(saat >>> 0)
  const loesung = new Array<number>(b * h).fill(0)
  // Spannbaum durch zufällige Tiefensuche: jedes Feld erreicht, keine Schleifen
  const besucht = new Array<boolean>(b * h).fill(false)
  const stapel = [z.int(0, b * h - 1)]
  besucht[stapel[0]] = true
  while (stapel.length) {
    const p = stapel[stapel.length - 1], x = p % b, y = Math.floor(p / b)
    const frei = [0, 1, 2, 3].filter(k => { const nx = x + DX[k], ny = y + DY[k]; return nx >= 0 && ny >= 0 && nx < b && ny < h && !besucht[ny * b + nx] })
    if (!frei.length) { stapel.pop(); continue }
    const k = z.aus(frei), q = (y + DY[k]) * b + x + DX[k]
    loesung[p] |= 1 << k; loesung[q] |= GEGEN[k]
    besucht[q] = true
    stapel.push(q)
  }
  const teile: number[] = []
  let par = 0
  for (let i = 0; i < b * h; i++) {
    let m = loesung[i]
    const dreh = z.int(0, 3)
    for (let d = 0; d < dreh; d++) m = dreheTeil(m)
    teile.push(m)
    // wie viele Rechtsdrehungen führen mindestens zurück zur Lösung?
    let t = m, n = 0
    while (t !== loesung[i] && n < 4) { t = dreheTeil(t); n++ }
    par += n
  }
  if (par === 0) {
    // nie schon gelöst vorlegen: das erste Teil verdrehen, bei dem das etwas ändert
    for (let i = 0; i < b * h; i++) {
      const gedreht = dreheTeil(teile[i])
      if (gedreht === loesung[i]) continue
      teile[i] = gedreht
      let t = gedreht
      while (t !== loesung[i] && par < 4) { t = dreheTeil(t); par++ }
      break
    }
  }
  return { b, h, teile, loesung, par }
}
/** Ist alles verbunden — kein loses Ende, kein Tau über den Rand, ein einziges Netz? (jede gültige Lösung zählt) */
export function tauFertig(b: number, h: number, teile: readonly number[]): boolean {
  for (let i = 0; i < b * h; i++) {
    const x = i % b, y = Math.floor(i / b)
    for (let k = 0; k < 4; k++) {
      if (!(teile[i] & (1 << k))) continue
      const nx = x + DX[k], ny = y + DY[k]
      if (nx < 0 || ny < 0 || nx >= b || ny >= h) return false
      if (!(teile[ny * b + nx] & GEGEN[k])) return false
    }
  }
  const gesehen = new Array<boolean>(b * h).fill(false)
  const reihe = [0]
  gesehen[0] = true
  for (let i = 0; i < reihe.length; i++) {
    const p = reihe[i], x = p % b, y = Math.floor(p / b)
    for (let k = 0; k < 4; k++) if (teile[p] & (1 << k)) { const q = (y + DY[k]) * b + x + DX[k]; if (!gesehen[q]) { gesehen[q] = true; reihe.push(q) } }
  }
  return reihe.length === b * h
}

// ── 3) Runenschloss: vier Runen, Rückmeldung nach jedem Versuch ──
export interface RunenRaetsel { laenge: number; zeichen: number; versuche: number; code: number[] }
export const RUNEN: readonly string[] = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ']
export function runenRaetsel(saat: number, stufe: number): RunenRaetsel {
  const z = rng(saat >>> 0)
  // Versuche: Wer bei jedem Tipp alle bisherigen Rückmeldungen beachtet, braucht höchstens „Zeichen + 3“
  // (über alle Codes nachgerechnet: 5 Zeichen → 8, 6 → 9, 7 → 10). Dazu gibt es einen Versuch Luft.
  const zeichen = 5 + Math.min(2, Math.floor(stufe / 3)), versuche = zeichen + 4
  const code: number[] = []
  for (let i = 0; i < 4; i++) code.push(z.int(0, zeichen - 1))
  return { laenge: 4, zeichen, versuche, code }
}
/** [genau richtig, richtig am falschen Platz] */
export function runenPruefe(code: readonly number[], tipp: readonly number[]): [number, number] {
  let genau = 0
  const restCode: number[] = [], restTipp: number[] = []
  for (let i = 0; i < code.length; i++) { if (code[i] === tipp[i]) genau++; else { restCode.push(code[i]); restTipp.push(tipp[i]) } }
  let fast = 0
  for (const t of restTipp) { const i = restCode.indexOf(t); if (i >= 0) { fast++; restCode.splice(i, 1) } }
  return [genau, fast]
}
/** Löser: probiert der Reihe nach den ersten Code, der zu allen bisherigen Rückmeldungen passt. Gibt die Zahl der Versuche zurück. */
export function loeseRunen(r: RunenRaetsel): number {
  const alle: number[][] = []
  const baue = (vor: number[]): void => { if (vor.length === r.laenge) { alle.push(vor); return } for (let s = 0; s < r.zeichen; s++) baue([...vor, s]) }
  baue([])
  let moeglich = alle
  for (let n = 1; n <= 20; n++) {
    const tipp = moeglich[0], [g, f] = runenPruefe(r.code, tipp)
    if (g === r.laenge) return n
    moeglich = moeglich.filter(c => { const [a, b] = runenPruefe(c, tipp); return a === g && b === f })
  }
  return 99
}

// ── 4) Sternbild: Zahlen am Rand, Bild im Inneren (Nonogramm) ──
export interface SternRaetsel { n: number; bild: boolean[]; zeilen: number[][]; spalten: number[][] }
function hinweise(reihe: readonly boolean[]): number[] {
  const aus: number[] = []
  let lauf = 0
  for (const v of reihe) { if (v) lauf++; else if (lauf) { aus.push(lauf); lauf = 0 } }
  if (lauf) aus.push(lauf)
  return aus
}
const zeileVon = (bild: readonly boolean[], n: number, y: number): boolean[] => bild.slice(y * n, y * n + n)
const spalteVon = (bild: readonly boolean[], n: number, x: number): boolean[] => { const a: boolean[] = []; for (let y = 0; y < n; y++) a.push(bild[y * n + x]); return a }

/** alle Belegungen einer Reihe, die zu den Hinweisen und dem schon Bekannten passen: was ist in allen gleich?
 *  bekannt: 1 = gefüllt, 0 = leer, −1 = offen. Gibt die neue Kenntnis zurück oder null bei Widerspruch. */
function schliesse(n: number, hinweis: readonly number[], bekannt: readonly number[]): number[] | null {
  const immerVoll = new Array<boolean>(n).fill(true), immerLeer = new Array<boolean>(n).fill(true)
  let gefunden = false
  const reihe = new Array<number>(n).fill(0)
  const setze = (i: number, ab: number): void => {
    if (i === hinweis.length) {
      for (let x = ab; x < n; x++) if (bekannt[x] === 1) return
      for (let x = ab; x < n; x++) reihe[x] = 0
      gefunden = true
      for (let x = 0; x < n; x++) { if (reihe[x]) immerLeer[x] = false; else immerVoll[x] = false }
      return
    }
    let rest = 0
    for (let j = i; j < hinweis.length; j++) rest += hinweis[j] + (j > i ? 1 : 0)
    for (let s = ab; s + rest <= n; s++) {
      let geht = true
      for (let x = ab; x < s; x++) if (bekannt[x] === 1) { geht = false; break }
      if (!geht) break
      for (let x = s; x < s + hinweis[i]; x++) if (bekannt[x] === 0) { geht = false; break }
      if (geht && s + hinweis[i] < n && bekannt[s + hinweis[i]] === 1) geht = false
      if (!geht) continue
      for (let x = ab; x < s; x++) reihe[x] = 0
      for (let x = s; x < s + hinweis[i]; x++) reihe[x] = 1
      if (s + hinweis[i] < n) reihe[s + hinweis[i]] = 0
      setze(i + 1, s + hinweis[i] + 1)
    }
  }
  setze(0, 0)
  if (!gefunden) return null
  return bekannt.map((b, x) => (b !== -1 ? b : immerVoll[x] ? 1 : immerLeer[x] ? 0 : -1))
}
/** Löst ein Sternbild nur mit Reihen-Logik. Gelingt das, ist die Lösung eindeutig und ohne Raten zu finden. */
export function loeseStern(n: number, zeilen: readonly number[][], spalten: readonly number[][]): boolean[] | null {
  const feld = new Array<number>(n * n).fill(-1)
  for (let runde = 0; runde < n * 4; runde++) {
    let neu = false
    for (let y = 0; y < n; y++) {
      const k = schliesse(n, zeilen[y], feld.slice(y * n, y * n + n))
      if (!k) return null
      for (let x = 0; x < n; x++) if (feld[y * n + x] !== k[x]) { feld[y * n + x] = k[x]; neu = true }
    }
    for (let x = 0; x < n; x++) {
      const sp: number[] = []
      for (let y = 0; y < n; y++) sp.push(feld[y * n + x])
      const k = schliesse(n, spalten[x], sp)
      if (!k) return null
      for (let y = 0; y < n; y++) if (feld[y * n + x] !== k[y]) { feld[y * n + x] = k[y]; neu = true }
    }
    if (!neu) break
  }
  return feld.includes(-1) ? null : feld.map(v => v === 1)
}
export function sternRaetsel(saat: number, stufe: number): SternRaetsel {
  for (let n = 5 + Math.min(3, Math.floor((stufe + 1) / 3)); n >= 4; n--) {
    for (let versuch = 0; versuch < 60; versuch++) {
      const z: Rng = rng((saat ^ Math.imul(versuch + 7, 0x85EBCA6B) ^ n) >>> 0)
      const bild: boolean[] = []
      for (let i = 0; i < n * n; i++) bild.push(z.chance(0.58))
      const zeilen = Array.from({ length: n }, (_, y) => hinweise(zeileVon(bild, n, y))), spalten = Array.from({ length: n }, (_, x) => hinweise(spalteVon(bild, n, x)))
      if (zeilen.some(h => !h.length) || spalten.some(h => !h.length)) continue          // leere Reihen sind langweilig
      const l = loeseStern(n, zeilen, spalten)
      if (l && l.every((v, i) => v === bild[i])) return { n, bild, zeilen, spalten }
    }
  }
  const bild = [true, true, false, true, true, true, false, true, true]
  return { n: 3, bild, zeilen: [[2], [3], [2]], spalten: [[2], [3], [2]] }
}
/** passt die Belegung zu allen Hinweisen? */
export function sternFertig(r: SternRaetsel, feld: readonly boolean[]): boolean {
  for (let i = 0; i < r.n; i++) {
    if (hinweise(zeileVon(feld, r.n, i)).join() !== r.zeilen[i].join()) return false
    if (hinweise(spalteVon(feld, r.n, i)).join() !== r.spalten[i].join()) return false
  }
  return true
}
