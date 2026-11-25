// Terra Incognita — die Welt: Gelände, Inseln und Orte, berechnet aus einem festen Startwert.
//
// EINGEFROREN: Alles hier ist für alle Kollegen dasselbe und darf sich nie mehr ändern, sobald jemand spielt —
// Taufnamen und Entdeckungen hängen an Feldern. Neue Inhalte nur als zusätzliche Lage mit eigenem Salz, die
// bestehendes Gelände und bestehende Orte nicht berührt. Eine Prüfsumme im Test (.tmp-test/terra) wacht darüber.
import { abschnittKey, abstand, feldKey, feldNr, qAusSpalte, RICHTUNGEN, spalte, type Feld } from './hex'
import { ebeneX, ebeneY, gebirge, rauschen, streu } from './streu'
import { EISMEER, GEBIETE, gebietVon, RAND, SARGASSO, stufeVon } from './gebiete'

/** Startwert der Welt. NIE ändern.
 *  Die Welt ist seit dem 22.11.2026 EINGEFROREN: An ihren Feldern und Inselschlüsseln hängen die Taufnamen aller
 *  Kollegen. Alles in dieser Datei, in streu.ts, gebiete.ts und hex.ts, was bestimmt, wo Land, Riffe, Orte und Inseln
 *  liegen, darf sich nie mehr ändern. Prüfsummen (Test .tmp-test/terra/kern_test.ts, siehe auch LIESMICH.md):
 *  Welt 1936389723 · abgeleiteter Inhalt 3161979827. */
export const WELT_SAAT = 130458
export const WELT_VERSION = 1

// Gelände
export const TIEF = 0, SEE = 1, FLACH = 2, RIFF = 3, EIS = 4, TANG = 5, LAND = 6, BERG = 7
export const istLand = (g: number): boolean => g >= LAND
export const istWasser = (g: number): boolean => g < LAND
/** Wasser, in dem jedes Schiff ankern und fahren kann */
export const istOffen = (g: number): boolean => g <= FLACH

/** Hamburg liegt am Rand einer kleinen Heimatinsel; rundherum ist garantiert offenes Wasser */
export const HAMBURG: Feld = { q: 0, r: 0 }
const HEIMAT_Q = -2, HEIMAT_R = 1
/** hier liegt das Schiff im Hamburger Hafen */
export const HAMBURG_REEDE: Feld = { q: 1, r: 0 }

function hoehe(q: number, r: number): number {
  const x = ebeneX(q, r), y = ebeneY(r)
  return Math.floor((gebirge(x, y, 42, WELT_SAAT + 1) * 3 + rauschen(x, y, 16, WELT_SAAT + 7)) / 4)
}

function gelaendeRoh(q: number, r: number): number {
  const dh = abstand(q, r, HEIMAT_Q, HEIMAT_R)
  if (dh <= 2) return dh === 0 ? BERG : LAND
  if (dh <= 3) return FLACH
  if (dh <= 5) return SEE
  const g = GEBIETE[gebietVon(q, r)]
  const h = hoehe(q, r)
  if (h >= g.land) return h >= g.land + 3400 ? BERG : LAND
  const x = ebeneX(q, r), y = ebeneY(r)
  if (g.id === EISMEER && rauschen(x, y, 30, WELT_SAAT + 31) > 35500) return EIS
  if (g.id === SARGASSO && rauschen(x, y, 26, WELT_SAAT + 41) > 34500) return TANG
  if (h >= g.land - 2600) return streu(q, r, WELT_SAAT + 51) % 100 < g.riff ? RIFF : FLACH
  if (g.riffBank > 0 && rauschen(x, y, 16, WELT_SAAT + 53) > g.riffBank) return RIFF
  return h >= g.land - 7000 ? SEE : TIEF
}

// ── Zwischenspeicher je Abschnitt (reine Beschleunigung — das Ergebnis hängt nie von der Reihenfolge ab) ──
const gelaendeCache = new Map<string, Uint8Array>()
const MAX_ABSCHNITTE = 3000

function abschnittGelaende(ax: number, ay: number): Uint8Array {
  const k = abschnittKey(ax, ay)
  let a = gelaendeCache.get(k)
  if (a) return a
  a = new Uint8Array(256)
  for (let ly = 0; ly < 16; ly++) {
    const r = ay * 16 + ly
    for (let lx = 0; lx < 16; lx++) a[(ly << 4) | lx] = gelaendeRoh(qAusSpalte(ax * 16 + lx, r), r)
  }
  if (gelaendeCache.size >= MAX_ABSCHNITTE) { const erster = gelaendeCache.keys().next().value as string; gelaendeCache.delete(erster) }
  gelaendeCache.set(k, a)
  return a
}

export function gelaende(q: number, r: number): number {
  const sp = spalte(q, r)
  return abschnittGelaende(sp >> 4, r >> 4)[((r & 15) << 4) | (sp & 15)]
}

/** Landfeld mit mindestens einem Wasser-Nachbarn */
export function istKueste(q: number, r: number): boolean {
  if (!istLand(gelaende(q, r))) return false
  for (const [dq, dr] of RICHTUNGEN) if (istWasser(gelaende(q + dq, r + dr))) return true
  return false
}

/** Nachbarfelder, an denen man vor diesem Landfeld ankern kann (offenes Wasser) */
export function ankerplaetze(q: number, r: number): Feld[] {
  const aus: Feld[] = []
  for (const [dq, dr] of RICHTUNGEN) if (istOffen(gelaende(q + dq, r + dr))) aus.push({ q: q + dq, r: r + dr })
  return aus
}

/** Hängt dieses Wasserfeld an der offenen See (und nicht nur an einem eingeschlossenen Tümpel)? */
function anOffenerSee(q: number, r: number): boolean {
  const gesehen = new Set<number>([feldNr(q, r)])
  const reihe: number[] = [q, r]
  let i = 0
  while (i < reihe.length) {
    const cq = reihe[i++], cr = reihe[i++]
    for (const [dq, dr] of RICHTUNGEN) {
      const nq = cq + dq, nr = cr + dr, n = feldNr(nq, nr)
      if (gesehen.has(n) || !istWasser(gelaende(nq, nr))) continue
      gesehen.add(n)
      if (gesehen.size >= 70) return true
      reihe.push(nq, nr)
    }
  }
  return false
}

// ── Inseln ──
export interface Insel {
  /** Schlüssel der Insel: ihr Feld mit der kleinsten Nummer */
  key: string
  felder: Feld[]
  /** zu groß zum Benennen (über INSEL_MAX Felder) — dann ist key = '' */
  festland: boolean
}
export const INSEL_MAX = 400
/** ab so vielen Feldern wird eine Insel getauft; kleinere sind namenlose Klippen */
export const INSEL_MIN_TAUFE = 2
const inselCache = new Map<number, Insel>()

/** die Insel, zu der dieses Landfeld gehört (null bei Wasser) */
export function inselVon(q: number, r: number): Insel | null {
  if (!istLand(gelaende(q, r))) return null
  const start = feldNr(q, r)
  const schon = inselCache.get(start)
  if (schon) return schon
  const felder: Feld[] = [{ q, r }]
  const gesehen = new Set<number>([start])
  let kleinste = start, kq = q, kr = r, zuGross = false
  for (let i = 0; i < felder.length; i++) {
    const f = felder[i]
    for (const [dq, dr] of RICHTUNGEN) {
      const nq = f.q + dq, nr = f.r + dr, n = feldNr(nq, nr)
      if (gesehen.has(n) || !istLand(gelaende(nq, nr))) continue
      gesehen.add(n)
      felder.push({ q: nq, r: nr })
      if (n < kleinste) { kleinste = n; kq = nq; kr = nr }
    }
    if (felder.length > INSEL_MAX) { zuGross = true; break }
  }
  const insel: Insel = zuGross ? { key: '', felder: [], festland: true } : { key: `i${feldKey(kq, kr)}`, felder, festland: false }
  if (zuGross) inselCache.set(start, insel)
  else for (const f of felder) inselCache.set(feldNr(f.q, f.r), insel)
  if (inselCache.size > 60000) inselCache.clear()
  return insel
}

// ── Orte ──
export type OrtArt = 'hafen' | 'dorf' | 'quelle' | 'ruine' | 'wunder' | 'einsiedler' | 'wrack' | 'fischgrund' | 'strudel' | 'treibgut'
export const ORT_AN_LAND: readonly OrtArt[] = ['hafen', 'dorf', 'quelle', 'ruine', 'wunder', 'einsiedler']
export const istSeeOrt = (a: OrtArt): boolean => a === 'wrack' || a === 'fischgrund' || a === 'strudel' || a === 'treibgut'

export interface Ort {
  key: string
  q: number
  r: number
  art: OrtArt
  gebiet: number
  stufe: number
  /** fester Zufallswert des Ortes — daraus entstehen Name, Angebot, Inhalt */
  saat: number
}

const S_ORT = WELT_SAAT + 60, S_ORT_ART = WELT_SAAT + 61, S_HAFEN = WELT_SAAT + 70, S_SEE = WELT_SAAT + 80, S_SEE_ART = WELT_SAAT + 81, S_SAAT = WELT_SAAT + 90

/** Ist dieses Feld größer als alle Mitbewerber im Umkreis? (gleichmäßige, von der Reihenfolge unabhängige Auswahl) */
function hoechsterImUmkreis(q: number, r: number, n: number, wert: number, bewerber: (q: number, r: number) => number): boolean {
  const ich = feldNr(q, r)
  for (let dq = -n; dq <= n; dq++) {
    const von = Math.max(-n, -dq - n), bis = Math.min(n, -dq + n)
    for (let dr = von; dr <= bis; dr++) {
      if (dq === 0 && dr === 0) continue
      const w = bewerber(q + dq, r + dr)
      if (w < 0) continue
      if (w > wert || (w === wert && feldNr(q + dq, r + dr) > ich)) return false
    }
  }
  return true
}

/** Bewerbung als Hafenstadt: Wert ≥ 0 oder −1 */
function hafenBewerbung(q: number, r: number): number {
  if (q === HAMBURG.q && r === HAMBURG.r) return 0x7FFFFFFF
  const w = streu(q, r, S_HAFEN)
  // je weiter draußen, desto seltener die Häfen — dort entscheidet der Proviantraum, wer hinkommt
  if (w % 1000 >= Math.floor((GEBIETE[gebietVon(q, r)].hafenDichte * HAFEN_FERNE[stufeVon(q, r)]) / 100)) return -1
  if (abstand(q, r, HEIMAT_Q, HEIMAT_R) <= 5) return -1
  if (!istLand(gelaende(q, r))) return -1
  const anker = ankerplaetze(q, r)
  if (!anker.length || !anOffenerSee(anker[0].q, anker[0].r)) return -1
  return w >>> 1
}
function landBewerbung(q: number, r: number): number {
  const w = streu(q, r, S_ORT)
  if (w % 100 >= GEBIETE[gebietVon(q, r)].ortDichte) return -1
  if (abstand(q, r, HEIMAT_Q, HEIMAT_R) <= 2) return -1
  if (!istLand(gelaende(q, r))) return -1
  const anker = ankerplaetze(q, r)
  if (!anker.length || !anOffenerSee(anker[0].q, anker[0].r)) return -1
  return w >>> 1
}
function seeBewerbung(q: number, r: number): number {
  const w = streu(q, r, S_SEE)
  if (w % 1000 >= GEBIETE[gebietVon(q, r)].seeDichte) return -1
  if (abstand(q, r, HEIMAT_Q, HEIMAT_R) <= 5) return -1
  if (!istOffen(gelaende(q, r))) return -1
  return w >>> 1
}

const HAFEN_ABSTAND = 6, ORT_ABSTAND = 2, SEE_ABSTAND = 3
/** Anteil der Häfen in Prozent, nach Stufe (Entfernung von Hamburg) */
const HAFEN_FERNE: readonly number[] = [100, 100, 100, 60, 40, 28, 22, 20, 20, 20]

// Anteile der Arten an Land je 100, nach Gebiet: quelle, dorf, ruine, wunder, einsiedler
const LAND_ARTEN: readonly OrtArt[] = ['quelle', 'dorf', 'ruine', 'wunder', 'einsiedler']
const LAND_ANTEIL: readonly (readonly number[])[] = [
  [34, 24, 16, 12, 14], [30, 18, 20, 16, 16], [34, 10, 20, 22, 14], [30, 22, 18, 16, 14], [24, 28, 18, 16, 14],
  [26, 30, 16, 14, 14], [30, 18, 20, 20, 12], [30, 10, 26, 20, 14], [36, 10, 20, 20, 14], [26, 6, 28, 26, 14],
]
const SEE_ARTEN: readonly OrtArt[] = ['fischgrund', 'wrack', 'treibgut', 'strudel']
const SEE_ANTEIL: readonly number[] = [36, 28, 24, 12]

function waehle<T>(arten: readonly T[], anteil: readonly number[], wurf: number): T {
  let rest = wurf % 100
  for (let i = 0; i < arten.length; i++) { if (rest < anteil[i]) return arten[i]; rest -= anteil[i] }
  return arten[arten.length - 1]
}

function ortRoh(q: number, r: number): Ort | null {
  let art: OrtArt | null = null
  const h = hafenBewerbung(q, r)
  if (h >= 0 && hoechsterImUmkreis(q, r, HAFEN_ABSTAND, h, hafenBewerbung)) art = 'hafen'
  if (!art) {
    const l = landBewerbung(q, r)
    if (l >= 0 && hoechsterImUmkreis(q, r, ORT_ABSTAND, l, landBewerbung)) art = waehle(LAND_ARTEN, LAND_ANTEIL[gebietVon(q, r)], streu(q, r, S_ORT_ART))
  }
  if (!art) {
    const s = seeBewerbung(q, r)
    if (s >= 0 && hoechsterImUmkreis(q, r, SEE_ABSTAND, s, seeBewerbung)) art = waehle(SEE_ARTEN, SEE_ANTEIL, streu(q, r, S_SEE_ART))
  }
  if (!art) return null
  const stufe = stufeVon(q, r), saat = streu(q, r, S_SAAT), gebiet = gebietVon(q, r)
  // weit draußen sind auch Dörfer selten: zwei von dreien sind dort nur noch die Hütte eines Einsiedlers.
  // Am Rand der Welt gibt es gar keine Siedlung mehr (und keinen Hafen, siehe gebiete.ts): Wer dorthin will, muss
  // seinen Proviant mitbringen — das macht ihn zum Ziel für die größten Schiffe.
  if (art === 'dorf' && (gebiet === RAND || (stufe >= 4 && saat % 3 !== 0))) art = 'einsiedler'
  return { key: feldKey(q, r), q, r, art, gebiet, stufe, saat }
}

const ortCache = new Map<string, Ort[]>()

/** alle Orte eines Abschnitts */
export function orteImAbschnitt(ax: number, ay: number): Ort[] {
  const k = abschnittKey(ax, ay)
  let liste = ortCache.get(k)
  if (liste) return liste
  liste = []
  for (let ly = 0; ly < 16; ly++) {
    const r = ay * 16 + ly
    for (let lx = 0; lx < 16; lx++) { const o = ortRoh(qAusSpalte(ax * 16 + lx, r), r); if (o) liste.push(o) }
  }
  if (ortCache.size >= MAX_ABSCHNITTE) { const erster = ortCache.keys().next().value as string; ortCache.delete(erster) }
  ortCache.set(k, liste)
  return liste
}

/** der Ort auf diesem Feld, falls es einen gibt */
export function ortBei(q: number, r: number): Ort | null {
  const sp = spalte(q, r)
  for (const o of orteImAbschnitt(sp >> 4, r >> 4)) if (o.q === q && o.r === r) return o
  return null
}

/** alle Orte, deren Abschnitt den Umkreis berührt (für Suchen in der Umgebung) */
export function orteNahe(q: number, r: number, n: number): Ort[] {
  const sp = spalte(q, r)
  const aus: Ort[] = []
  for (let ay = (r - n) >> 4; ay <= (r + n) >> 4; ay++) {
    for (let ax = (sp - n - 1) >> 4; ax <= (sp + n + 1) >> 4; ax++) {
      for (const o of orteImAbschnitt(ax, ay)) if (abstand(q, r, o.q, o.r) <= n) aus.push(o)
    }
  }
  return aus
}

/** nur für Tests: Zwischenspeicher leeren (um Unabhängigkeit von der Reihenfolge zu prüfen) */
export function leereWeltCache(): void { gelaendeCache.clear(); ortCache.clear(); inselCache.clear() }
