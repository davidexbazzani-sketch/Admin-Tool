// Fortschritt: Serie, Wochenziel, Kalender, Tages-Training, Einsichten, Abzeichen.
// Reine Funktionen über den gespeicherten Daten — getestet in .tmp-test/brain/.
import type { BrainDaten, Gebiet, TagEintrag, UebungMeta } from './typen'
import { GEBIETE, gebietName, tagVon } from './typen'
import { profil, standUebung, type GebietStand } from './wertung'
import { rng } from './zufall'

const TAG_MS = 86400_000
const tagPlus = (d: Date, n: number): Date => { const k = new Date(d); k.setDate(k.getDate() + n); return k }

// ── Serie (Tage in Folge) ─────────────────────────────────────────────────────
export interface Serie { aktuell: number; laengste: number; heuteGeuebt: boolean }

export function serie(tage: Record<string, TagEintrag>, heute: Date = new Date()): Serie {
  const hat = (d: Date) => (tage[tagVon(d)]?.n ?? 0) > 0
  const heuteGeuebt = hat(heute)
  // Die Serie lebt, solange heute ODER gestern geübt wurde
  let aktuell = 0
  let d = heuteGeuebt ? heute : tagPlus(heute, -1)
  while (hat(d)) { aktuell++; d = tagPlus(d, -1) }
  // längste Serie über alle Tage
  const schluessel = Object.keys(tage).filter(k => (tage[k]?.n ?? 0) > 0).sort()
  let laengste = 0, lauf = 0, vorher = 0
  for (const k of schluessel) {
    const [j, m, t] = k.split('-').map(Number)
    const zeit = new Date(j, m - 1, t).getTime()
    lauf = vorher && Math.round((zeit - vorher) / TAG_MS) === 1 ? lauf + 1 : 1
    if (lauf > laengste) laengste = lauf
    vorher = zeit
  }
  return { aktuell, laengste: Math.max(laengste, aktuell), heuteGeuebt }
}

// ── Woche (Montag bis Sonntag) ────────────────────────────────────────────────
export function wochenStart(d: Date = new Date()): Date {
  const k = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  k.setDate(k.getDate() - ((k.getDay() + 6) % 7))
  return k
}

export interface Woche { tage: { tag: string; kurz: string; geuebt: boolean; heute: boolean; zukunft: boolean }[]; geuebt: number; ziel: number; erreicht: boolean }

export function woche(d: Pick<BrainDaten, 'tage' | 'einstellungen'>, heute: Date = new Date()): Woche {
  const start = wochenStart(heute)
  const kurz = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
  const heuteKey = tagVon(heute)
  const tage = kurz.map((k, i) => {
    const tag = tagVon(tagPlus(start, i))
    return { tag, kurz: k, geuebt: (d.tage[tag]?.n ?? 0) > 0, heute: tag === heuteKey, zukunft: tag > heuteKey }
  })
  const geuebt = tage.filter(t => t.geuebt).length
  const ziel = Math.max(1, Math.min(7, d.einstellungen.wochenziel || 4))
  return { tage, geuebt, ziel, erreicht: geuebt >= ziel }
}

// ── Kalender der letzten Wochen ───────────────────────────────────────────────
export interface KalenderTag { tag: string; n: number; stufe: 0 | 1 | 2 | 3 | 4; zukunft: boolean }

/** `wochen` Spalten (Mo–So), die letzte Spalte ist die laufende Woche. */
export function kalender(tage: Record<string, TagEintrag>, wochen = 12, heute: Date = new Date()): KalenderTag[][] {
  const start = tagPlus(wochenStart(heute), -7 * (wochen - 1))
  const heuteKey = tagVon(heute)
  const spalten: KalenderTag[][] = []
  for (let w = 0; w < wochen; w++) {
    const spalte: KalenderTag[] = []
    for (let i = 0; i < 7; i++) {
      const tag = tagVon(tagPlus(start, w * 7 + i))
      const n = tage[tag]?.n ?? 0
      spalte.push({ tag, n, stufe: n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4, zukunft: tag > heuteKey })
    }
    spalten.push(spalte)
  }
  return spalten
}

// ── Tages-Training ────────────────────────────────────────────────────────────
export interface PlanPunkt { id: string; gebiet: Gebiet; grund: string }

/**
 * Fünf Übungen aus fünf Gebieten, stabil für den Tag (gleicher Tag + Benutzer = gleicher Plan).
 * Vorrang: noch nie geübt → schwächster Stand → am längsten nicht geübt.
 */
export function tagesPlan(d: Pick<BrainDaten, 'laeufe' | 'benutzer'>, katalog: UebungMeta[], heute: Date = new Date(), anzahl = 5): PlanPunkt[] {
  const r = rng(`plan|${tagVon(heute)}|${d.benutzer}`)
  const stand = profil(d, 30, heute.getTime())
  const tauglich = katalog.filter(u => !u.lang)
  const gebiete = GEBIETE.map(g => g.id).filter(g => tauglich.some(u => u.gebiet === g))
  const jetzt = heute.getTime()
  const info = (g: Gebiet) => stand.find(s => s.gebiet === g) as GebietStand
  const alter = (g: Gebiet) => { const z = info(g).zuletzt; return z ? (jetzt - new Date(z).getTime()) / TAG_MS : 9999 }

  const gewaehlt: { g: Gebiet; grund: string }[] = []
  const nimm = (g: Gebiet | undefined, grund: string) => { if (g && !gewaehlt.some(x => x.g === g) && gewaehlt.length < anzahl) gewaehlt.push({ g, grund }) }

  const gemischt = r.misch(gebiete)
  // 1) noch nie geübt (höchstens 2, damit Bekanntes dabei bleibt)
  for (const g of gemischt.filter(g => info(g).jetzt === null).slice(0, 2)) nimm(g, 'Neu für dich')
  // 2) die zwei schwächsten
  const schwach = gemischt.filter(g => info(g).jetzt !== null).sort((a, b) => (info(a).jetzt as number) - (info(b).jetzt as number))
  for (const g of schwach.slice(0, 2)) nimm(g, 'Hier ist am meisten zu holen')
  // 3) am längsten nicht geübt
  for (const g of gemischt.slice().sort((a, b) => alter(b) - alter(a))) nimm(g, alter(g) >= 9999 ? 'Neu für dich' : alter(g) >= 2 ? 'Länger nicht geübt' : 'Zur Abwechslung')

  return gewaehlt.map(({ g, grund }) => {
    const kandidaten = tauglich.filter(u => u.gebiet === g)
    // innerhalb des Gebiets: die am längsten nicht geübte Übung, bei Gleichstand Zufall
    const letzte = (id: string) => { for (let i = d.laeufe.length - 1; i >= 0; i--) if (d.laeufe[i].u === id) return new Date(d.laeufe[i].t).getTime(); return 0 }
    const sortiert = r.misch(kandidaten).sort((a, b) => letzte(a.id) - letzte(b.id))
    return { id: sortiert[0].id, gebiet: g, grund }
  })
}

// ── Einsichten in Klartext ────────────────────────────────────────────────────
export interface Einsicht { art: 'stark' | 'fortschritt' | 'pause' | 'tipp' | 'start'; titel: string; text: string; gebiet?: Gebiet }

export function einsichten(d: Pick<BrainDaten, 'laeufe' | 'tage'>, jetzt: Date = new Date()): Einsicht[] {
  const aus: Einsicht[] = []
  if (!d.laeufe.length) {
    return [{ art: 'start', titel: 'Noch keine Daten', text: 'Mach dein erstes Tages-Training — danach siehst du hier, wo deine Stärken liegen.' }]
  }
  const p = profil(d, 30, jetzt.getTime())
  const mit = p.filter(s => s.jetzt !== null)
  if (mit.length >= 2) {
    const beste = mit.slice().sort((a, b) => (b.jetzt as number) - (a.jetzt as number))[0]
    aus.push({ art: 'stark', gebiet: beste.gebiet, titel: `Stärkstes Gebiet: ${gebietName(beste.gebiet)}`, text: `Stand ${beste.jetzt} von 1000.` })
    const schwach = mit.slice().sort((a, b) => (a.jetzt as number) - (b.jetzt as number))[0]
    if (schwach.gebiet !== beste.gebiet) {
      aus.push({ art: 'tipp', gebiet: schwach.gebiet, titel: `Am meisten zu holen: ${gebietName(schwach.gebiet)}`, text: `Stand ${schwach.jetzt} von 1000 — kurze, regelmäßige Durchgänge bringen hier am meisten.` })
    }
  }
  const zuwachs = p.filter(s => s.jetzt !== null && s.vorher !== null).map(s => ({ s, plus: (s.jetzt as number) - (s.vorher as number) })).sort((a, b) => b.plus - a.plus)[0]
  if (zuwachs && zuwachs.plus >= 15) {
    aus.push({ art: 'fortschritt', gebiet: zuwachs.s.gebiet, titel: `Größter Fortschritt: ${gebietName(zuwachs.s.gebiet)}`, text: `+${zuwachs.plus} Punkte in den letzten 30 Tagen.` })
  }
  const pause = p.filter(s => s.zuletzt).map(s => ({ s, tage: Math.floor((jetzt.getTime() - new Date(s.zuletzt as string).getTime()) / TAG_MS) })).sort((a, b) => b.tage - a.tage)[0]
  if (pause && pause.tage >= 7) {
    aus.push({ art: 'pause', gebiet: pause.s.gebiet, titel: `${gebietName(pause.s.gebiet)} macht Pause`, text: `Seit ${pause.tage} Tagen nicht geübt.` })
  }
  const neu = p.filter(s => s.jetzt === null)
  if (neu.length) {
    aus.push({ art: 'tipp', gebiet: neu[0].gebiet, titel: `Noch offen: ${neu.map(s => gebietName(s.gebiet)).join(', ')}`, text: 'Diese Gebiete hast du noch nicht ausprobiert.' })
  }
  return aus
}

// ── Abzeichen ─────────────────────────────────────────────────────────────────
export interface AbzeichenInfo { id: string; name: string; text: string; symbol: 'flamme' | 'stern' | 'kompass' | 'berg' | 'ziel' | 'pokal' | 'hirn' | 'blitz' }

export const ABZEICHEN: AbzeichenInfo[] = [
  { id: 'start', name: 'Erster Schritt', text: 'Den ersten Durchgang gemacht', symbol: 'stern' },
  { id: 'serie3', name: '3 Tage in Folge', text: 'Drei Tage hintereinander geübt', symbol: 'flamme' },
  { id: 'serie7', name: 'Eine Woche am Stück', text: 'Sieben Tage hintereinander geübt', symbol: 'flamme' },
  { id: 'serie14', name: 'Zwei Wochen am Stück', text: '14 Tage hintereinander geübt', symbol: 'flamme' },
  { id: 'serie30', name: '30 Tage am Stück', text: '30 Tage hintereinander geübt', symbol: 'flamme' },
  { id: 'woche', name: 'Wochenziel erreicht', text: 'In einer Woche das eigene Ziel geschafft', symbol: 'ziel' },
  { id: 'tagesrund', name: 'Rundum-Tag', text: 'An einem Tag fünf verschiedene Gebiete geübt', symbol: 'kompass' },
  { id: 'rundum', name: 'Alle Gebiete', text: 'Jedes der neun Gebiete ausprobiert', symbol: 'kompass' },
  { id: 'stufe5', name: 'Stufe 5', text: 'In einer Übung Stufe 5 erreicht', symbol: 'berg' },
  { id: 'stufe8', name: 'Stufe 8', text: 'In einer Übung Stufe 8 erreicht', symbol: 'berg' },
  { id: 'stufe10', name: 'Gipfel', text: 'In einer Übung Stufe 10 erreicht', symbol: 'berg' },
  { id: 'lauf50', name: '50 Durchgänge', text: '50 Durchgänge geschafft', symbol: 'blitz' },
  { id: 'lauf250', name: '250 Durchgänge', text: '250 Durchgänge geschafft', symbol: 'blitz' },
  { id: 'iq', name: 'Standortbestimmung', text: 'Einen IQ-Test gespeichert', symbol: 'hirn' },
  { id: 'duell1', name: 'Erster Duell-Sieg', text: 'Ein Duell gewonnen', symbol: 'pokal' },
  { id: 'duell10', name: 'Duell-Profi', text: 'Zehn Duelle gewonnen', symbol: 'pokal' },
]

/** Welche Abzeichen sind nach dem Stand der Daten verdient? */
export function verdienteAbzeichen(d: BrainDaten, heute: Date = new Date()): string[] {
  const aus: string[] = []
  const s = serie(d.tage, heute)
  const laeufe = d.laeufe.length
  const hoechst = Math.max(0, ...Object.values(d.hoechst))
  const siege = d.duelle.filter(x => x.ausgang === 1).length
  if (laeufe >= 1) aus.push('start')
  if (s.laengste >= 3) aus.push('serie3')
  if (s.laengste >= 7) aus.push('serie7')
  if (s.laengste >= 14) aus.push('serie14')
  if (s.laengste >= 30) aus.push('serie30')
  if (woche(d, heute).erreicht) aus.push('woche')
  if (Object.values(d.tage).some(t => new Set(t.g).size >= 5)) aus.push('tagesrund')
  if (new Set(d.laeufe.map(l => l.g)).size >= GEBIETE.length) aus.push('rundum')
  if (hoechst >= 5) aus.push('stufe5')
  if (hoechst >= 8) aus.push('stufe8')
  if (hoechst >= 10) aus.push('stufe10')
  if (laeufe >= 50) aus.push('lauf50')
  if (laeufe >= 250) aus.push('lauf250')
  if (d.iq.length >= 1) aus.push('iq')
  if (siege >= 1) aus.push('duell1')
  if (siege >= 10) aus.push('duell10')
  return aus
}

// ── Verläufe für Diagramme ────────────────────────────────────────────────────
export interface VerlaufPunkt { tag: string; wert: number }

/** Stand eines Gebiets am Ende jedes Tages, an dem darin geübt wurde (höchstens `max` Punkte). */
export function verlaufGebiet(d: Pick<BrainDaten, 'laeufe'>, gebiet: Gebiet, max = 60): VerlaufPunkt[] {
  const tage = Array.from(new Set(d.laeufe.filter(l => l.g === gebiet).map(l => tagVon(new Date(l.t))))).sort()
  const punkte = tage.map(tag => {
    const [j, m, t] = tag.split('-').map(Number)
    const ende = new Date(j, m - 1, t, 23, 59, 59, 999).getTime()
    const ids = new Set(d.laeufe.filter(l => l.g === gebiet && new Date(l.t).getTime() <= ende).map(l => l.u))
    let summe = 0
    for (const id of ids) summe += standUebung(d.laeufe, id, ende) ?? 0
    return { tag, wert: ids.size ? Math.round(summe / ids.size) : 0 }
  })
  return punkte.slice(-max)
}

/** Bestwert und Zahl der Durchgänge je Übung. */
export function bestwerte(d: Pick<BrainDaten, 'laeufe'>): Record<string, { best: number; n: number; zuletzt: string }> {
  const aus: Record<string, { best: number; n: number; zuletzt: string }> = {}
  for (const l of d.laeufe) {
    const e = aus[l.u] ?? (aus[l.u] = { best: 0, n: 0, zuletzt: l.t })
    e.n++
    if (l.p > e.best) e.best = l.p
    e.zuletzt = l.t
  }
  return aus
}
