// Terra Incognita — die Tagesfahrt: jeden Tag eine Aufgabe, für alle Kollegen dieselbe (aus der Tagesnummer berechnet).
// Montag und Donnerstag: Regatta. Dienstag und Freitag: Riff-Lotse. Mittwoch und Sonntag: Taue. Samstag: Sternbild.
import { rng } from '../../brain/kern/zufall'
import { abstand, drehung, feldNr, RICHTUNGEN, umkreis, type Feld } from './hex'
import { riffRaetsel, sternRaetsel, tauRaetsel, type RiffRaetsel, type SternRaetsel, type TauRaetsel } from './raetsel'
import { streu } from './streu'
import { feldStunden, type Wind } from './wind'

export type TagesArt = 'regatta' | 'riff' | 'taue' | 'stern'
/** Fassung der Tagesaufgaben. Alle Kollegen lösen am selben Tag dieselbe Aufgabe und stehen in einer Rangliste —
 *  ändert sich je, wie die Aufgaben erzeugt werden, MUSS diese Zahl steigen: Dann bekommt die neue Fassung ihre
 *  eigene Rangliste (Ordner terra/tage/f<Fassung>), und niemand wird mit Leuten verglichen, die etwas anderes lösen. */
export const TAGES_FASSUNG = 1
export const TAGES_NAME: Record<TagesArt, string> = { regatta: 'Regatta', riff: 'Riff-Lotse', taue: 'Taue spleißen', stern: 'Sternbild' }
const NACH_WOCHENTAG: readonly TagesArt[] = ['taue', 'regatta', 'riff', 'taue', 'regatta', 'riff', 'stern']      // Sonntag … Samstag
const S_TAG = 9301

export const tagesArt = (wochentag: number): TagesArt => NACH_WOCHENTAG[((wochentag % 7) + 7) % 7]
export const tagesSaat = (tag: number): number => streu(tag, 17, S_TAG)

// ── Regatta: drei Bojen runden und zurück zum Start, in möglichst wenig Zeit ──
export interface Regatta {
  radius: number
  /** Feldnummern, die Land sind */
  land: number[]
  /** Wind je Zone; die Zone eines Feldes ergibt sich aus seiner Lage (zoneVon) */
  zonen: Wind[]
  start: Feld
  bojen: Feld[]
  /** bestmögliche Zeit in Stunden */
  best: number
}
/** Zone eines Feldes: drei Streifen von Nord nach Süd */
export const zoneVon = (reg: Pick<Regatta, 'radius'>, f: Feld): number => (f.r < -Math.floor(reg.radius / 3) ? 0 : f.r > Math.floor(reg.radius / 3) ? 2 : 1)

/** Stunden für einen Schritt auf das Feld `nach` (null = geht nicht) */
export function regattaSchritt(reg: Regatta, von: Feld, nach: Feld): number | null {
  if (abstand(0, 0, nach.q, nach.r) > reg.radius || reg.land.includes(feldNr(nach.q, nach.r))) return null
  for (let k = 0; k < 6; k++) if (von.q + RICHTUNGEN[k][0] === nach.q && von.r + RICHTUNGEN[k][1] === nach.r) return feldStunden(k, reg.zonen[zoneVon(reg, nach)])
  return null
}

/** kürzeste Zeit: Suche über (Feld, welche Bojen schon gerundet) */
export function loeseRegatta(reg: Regatta): number | null {
  const felder = umkreis(0, 0, reg.radius).filter(f => !reg.land.includes(feldNr(f.q, f.r)))
  const index = new Map<number, number>(felder.map((f, i) => [feldNr(f.q, f.r), i]))
  const boje = new Map<number, number>(reg.bojen.map((b, i) => [feldNr(b.q, b.r), i]))
  const alle = (1 << reg.bojen.length) - 1
  const kosten = new Float64Array(felder.length * (alle + 1)).fill(Infinity)
  const s = index.get(feldNr(reg.start.q, reg.start.r))
  if (s === undefined) return null
  kosten[s * (alle + 1)] = 0
  // die Zahl der Zustände ist klein: einfache Suche mit wiederholtem Entspannen genügt nicht (Kosten verschieden) → sortierte Liste
  const offen: [number, number, number][] = [[0, s, 0]]
  while (offen.length) {
    let bi = 0
    for (let i = 1; i < offen.length; i++) if (offen[i][0] < offen[bi][0]) bi = i
    const [k, i, m] = offen.splice(bi, 1)[0]
    if (k > kosten[i * (alle + 1) + m]) continue
    if (i === s && m === alle) return k
    const f = felder[i]
    for (let d = 0; d < 6; d++) {
      const g = { q: f.q + RICHTUNGEN[d][0], r: f.r + RICHTUNGEN[d][1] }, j = index.get(feldNr(g.q, g.r))
      if (j === undefined) continue
      const b = boje.get(feldNr(g.q, g.r)), nm = b === undefined ? m : m | (1 << b)
      const nk = k + feldStunden(d, reg.zonen[zoneVon(reg, g)])
      if (nk < kosten[j * (alle + 1) + nm]) { kosten[j * (alle + 1) + nm] = nk; offen.push([nk, j, nm]) }
    }
  }
  return null
}

export function regatta(saat: number): Regatta {
  for (let versuch = 0; versuch < 200; versuch++) {
    const z = rng((saat ^ Math.imul(versuch + 3, 0xC2B2AE35)) >>> 0)
    const radius = 5
    const alle = umkreis(0, 0, radius)
    const start = { q: 0, r: 0 }
    const land: number[] = []
    for (const f of alle) if (abstand(0, 0, f.q, f.r) > 1 && z.chance(0.13)) land.push(feldNr(f.q, f.r))
    const frei = alle.filter(f => !land.includes(feldNr(f.q, f.r)) && abstand(0, 0, f.q, f.r) >= 3)
    if (frei.length < 12) continue
    const bojen: Feld[] = []
    for (let i = 0; i < 60 && bojen.length < 3; i++) { const f = z.aus(frei); if (!bojen.some(b => abstand(b.q, b.r, f.q, f.r) < 4)) bojen.push(f) }
    if (bojen.length < 3) continue
    // drei Windzonen mit verschiedenen Richtungen — sonst wäre es nur eine Frage der Reihenfolge
    const r0 = z.int(0, 5)
    const zonen: Wind[] = [{ richtung: r0, staerke: 2 }, { richtung: (r0 + z.int(1, 2)) % 6, staerke: z.chance(0.5) ? 3 : 2 }, { richtung: (r0 + z.int(3, 5)) % 6, staerke: z.chance(0.4) ? 1 : 2 }]
    if (drehung(zonen[0].richtung, zonen[2].richtung) === 0) continue
    const reg: Regatta = { radius, land, zonen, start, bojen, best: 0 }
    const best = loeseRegatta(reg)
    if (best === null) continue
    reg.best = best
    return reg
  }
  // sicherer Rückfall: offenes Wasser
  const reg: Regatta = { radius: 4, land: [], zonen: [{ richtung: 0, staerke: 2 }, { richtung: 2, staerke: 2 }, { richtung: 4, staerke: 2 }], start: { q: 0, r: 0 }, bojen: [{ q: 3, r: 0 }, { q: -3, r: 3 }, { q: 0, r: -3 }], best: 0 }
  reg.best = loeseRegatta(reg) ?? 0
  return reg
}

export type TagesAufgabe =
  | { art: 'regatta'; regatta: Regatta }
  | { art: 'riff'; riff: RiffRaetsel }
  | { art: 'taue'; taue: TauRaetsel }
  | { art: 'stern'; stern: SternRaetsel }

/** die Aufgabe eines Tages (tag = Tagesnummer, wochentag 0 = Sonntag) */
export function tagesAufgabe(tag: number, wochentag: number): TagesAufgabe {
  const art = tagesArt(wochentag), saat = tagesSaat(tag)
  if (art === 'regatta') return { art, regatta: regatta(saat) }
  if (art === 'riff') return { art, riff: riffRaetsel(saat, 8) }
  if (art === 'taue') return { art, taue: tauRaetsel(saat, 6) }
  return { art, stern: sternRaetsel(saat, 6) }
}

/** Medaille: 1 = Gold, 2 = Silber, 3 = Bronze. punkte = Stunden (Regatta), Züge (Riff), Drehungen (Taue), Fehlgriffe (Sternbild) */
export function medaille(a: TagesAufgabe, punkte: number): 1 | 2 | 3 {
  if (a.art === 'regatta') return punkte <= a.regatta.best ? 1 : punkte * 100 <= a.regatta.best * 112 ? 2 : 3
  if (a.art === 'riff') return punkte <= a.riff.par ? 1 : punkte <= a.riff.par + 2 ? 2 : 3
  if (a.art === 'taue') return punkte <= a.taue.par ? 1 : punkte * 10 <= a.taue.par * 13 ? 2 : 3
  return punkte === 0 ? 1 : punkte <= 2 ? 2 : 3
}
export const MEDAILLE_NAME: readonly string[] = ['', 'Gold', 'Silber', 'Bronze']
/** Lohn einer Tagesfahrt: [Gold, Ruhm] */
export const tagesLohn = (m: number, rang: number): [number, number] => [Math.floor(([0, 60, 40, 25][m] * (2 + rang)) / 2), [0, 12, 8, 5][m]]
