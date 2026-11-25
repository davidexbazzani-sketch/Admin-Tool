// Terra Incognita — Wirkungen: was Ereignisse, Landgänge und Funde am Spielstand ändern.
import { KURIOSA, TIERE, type Kurios, type Tier } from '../inhalt/atlas'
import { abstand, peilung, type Feld } from './hex'
import { klima } from './namen'
import { deckeAuf } from './nebel'
import { gebietVon, stufeVon } from './gebiete'
import type { OffizierRolle } from './schiff'
import { kehreUm, ladungMenge, schaden, sichte, werteVon, type Spiel, type Umwelt } from './spiel'
import type { Geruecht, TiStand } from './stand'
import { streu, streu3 } from './streu'
import { WAREN, wareNr } from './waren'
import { orteNahe, type Ort } from './welt'

export interface Wirkung {
  /** Proviant in Stunden (±) */
  proviant?: number
  /** Gold (±); wächst mit der Stufe des Ortes */
  gold?: number
  /** Rumpfpunkte (negativ = Schaden) */
  rumpf?: number
  ruhm?: number
  /** Zeitverlust in Stunden — kostet entsprechend Proviant */
  stunden?: number
  /** Tier-Sichtung fürs Atlas: höchstens so selten (1 … 3) */
  tier?: 1 | 2 | 3
  kurios?: 1
  ware?: readonly [string, number]
  karte?: 1
  /** Umkreis um das Schiff aufdecken */
  aufdecken?: number
  geruecht?: 1
}

export interface Folge {
  /** Zeilen für die Anzeige („+3 Tage Proviant“) */
  zeilen: string[]
  tier?: Tier
  kurios?: Kurios
  karte?: boolean
  geruecht?: Geruecht
  neu?: Feld[]
  entdeckt?: string[]
  /** das Schiff musste in den letzten Hafen zurück */
  umkehr?: boolean
}

export const tage = (stunden: number): string => {
  const zehntel = Math.round((Math.abs(stunden) * 10) / 24)
  const t = `${Math.floor(zehntel / 10)}${zehntel % 10 ? ',' + (zehntel % 10) : ''}`
  return `${t} ${zehntel === 10 ? 'Tag' : 'Tage'}`
}
const S_TIER = 6101, S_KURIOS = 6102, S_KARTE = 6103

/** ein Tier aus diesem Gebiet, das noch nicht im Atlas steht (seltene nur, wenn erlaubt) */
export function neuesTier(s: TiStand, gebiet: number, maxSelten: number): Tier | null {
  const k = klima(gebiet)
  const moeglich = TIERE.filter(t => t.klima.includes(k) && t.selten <= maxSelten && !s.atlas.tiere.includes(t.id))
  if (!moeglich.length) return null
  // häufige zuerst: unter den Möglichen die mit der kleinsten Seltenheit, darunter nach festem Wurf
  const haeufig = Math.min(...moeglich.map(t => t.selten))
  const wahl = moeglich.filter(t => t.selten === haeufig || streu3(s.saat, s.zug, t.selten, S_TIER) % 3 === 0)
  return wahl[streu3(s.saat, s.zug, 7, S_TIER) % wahl.length]
}
export function neuesKurios(s: TiStand): Kurios | null {
  const frei = KURIOSA.filter(k => !s.atlas.kurios.includes(k.id))
  return frei.length ? frei[streu3(s.saat, s.zug, 3, S_KURIOS) % frei.length] : null
}

/** Schatzkarte: ein Kreuz bei einem Ort in der Umgebung, der noch nicht geplündert ist */
export function neueSchatzkarte(s: TiStand, q: number, r: number): boolean {
  const ziele = orteNahe(q, r, 26).filter(o => (o.art === 'quelle' || o.art === 'ruine' || o.art === 'wunder' || o.art === 'einsiedler') && abstand(q, r, o.q, o.r) >= 7 && !s.schatzkarten.some(k => k.q === o.q && k.r === o.r))
  if (!ziele.length || s.schatzkarten.filter(k => !k.gehoben).length >= 5) return false
  const o = ziele[streu3(s.saat, s.zug, 5, S_KARTE) % ziele.length]
  s.schatzkarten.push({ id: `k${s.zug}`, vq: q, vr: r, q: o.q, r: o.r, stufe: o.stufe })
  return true
}

const BEMERKENSWERT = ['wunder', 'ruine', 'hafen', 'einsiedler', 'wrack']
/** Gerücht über den nächsten bemerkenswerten Ort, den der Spieler noch nicht kennt */
export function geruechtNahe(s: TiStand, q: number, r: number, u: Umwelt, weite = 34): Geruecht | null {
  let bester: Ort | null = null, bd = 1e9
  for (const o of orteNahe(q, r, weite)) {
    if (!BEMERKENSWERT.includes(o.art) || s.entdeckt[`o${o.key}`] || s.geruechte.some(g => g.q === o.q && g.r === o.r)) continue
    const d = abstand(q, r, o.q, o.r)
    if (d < 4) continue
    // nicht immer der allernächste: ein fester Wurf mischt mit
    const wert = d * 16 + (streu(o.saat, s.saat, 6104) % 48)
    if (wert < bd) { bd = wert; bester = o }
  }
  if (!bester) return null
  const g: Geruecht = { q: bester.q, r: bester.r, art: bester.art, von: '', tag: u.tag }
  s.geruechte.push(g)
  if (s.geruechte.length > 12) s.geruechte.shift()
  return g
}

const GERUECHT_WAS: Record<string, string> = {
  wunder: 'ein Naturwunder, wie es kein Mensch je gesehen hat', ruine: 'alte Mauern, älter als jede Chronik', hafen: 'eine Hafenstadt mit vollen Speichern',
  einsiedler: 'jemand, der allein lebt und viel weiß', wrack: 'ein Wrack, das noch niemand geplündert hat',
}
/** Gerücht in Worten: Peilung und ungefähre Entfernung von einem Bezugspunkt */
export function geruechtText(g: Geruecht, vonQ: number, vonR: number): string {
  const d = abstand(vonQ, vonR, g.q, g.r)
  const etwa = d < 8 ? 'nur ein paar Felder' : `etwa ${Math.round(d / 5) * 5} Felder`
  return `Im ${peilung(vonQ, vonR, g.q, g.r)}, ${etwa} von hier, soll es ${GERUECHT_WAS[g.art] ?? 'etwas Besonderes'} geben.`
}

/** Eine Wirkung auf das Spiel anwenden. `stufe` vervielfacht Gold (× (1 + Stufe/2)). */
export function wirke(spiel: Spiel, w: Wirkung | undefined, u: Umwelt, stufe = stufeVon(spiel.stand.q, spiel.stand.r)): Folge {
  const s = spiel.stand, f: Folge = { zeilen: [] }
  if (!w) return f
  const werte = werteVon(s)
  if (w.stunden) {
    s.stunden += w.stunden
    const kost = Math.floor((w.stunden * werte.verbrauch) / 100)
    s.proviant -= kost
    f.zeilen.push(`${tage(w.stunden)} verloren`)
  }
  if (w.proviant) {
    const vorher = s.proviant
    s.proviant = Math.min(Math.max(werte.proviantMax, s.proviant), s.proviant + w.proviant)
    const diff = s.proviant - vorher
    if (diff > 0) f.zeilen.push(`+${tage(diff)} Proviant`)
    else if (diff < 0) f.zeilen.push(`−${tage(diff)} Proviant`)
    else if (w.proviant > 0) f.zeilen.push('Der Proviantraum ist schon voll.')
  }
  if (w.gold) {
    const g = w.gold > 0 ? Math.floor((w.gold * (2 + stufe)) / 2) : Math.max(-s.gold, w.gold)
    s.gold += g
    if (g) f.zeilen.push(`${g > 0 ? '+' : '−'}${Math.abs(g)} Gold`)
  }
  if (w.ruhm) { s.ruhm += w.ruhm; f.zeilen.push(`+${w.ruhm} Ruhm`) }
  if (w.ware) {
    const [id, menge] = w.ware
    const nr = wareNr(id)
    if (nr >= 0) {
      if (menge > 0) {
        const platz = Math.max(0, werte.laderaum - ladungMenge(s)), n = Math.min(platz, menge)
        if (n > 0) { s.ladung[id] = (s.ladung[id] ?? 0) + n; f.zeilen.push(`+${n} ${WAREN[nr].name}`) }
        else f.zeilen.push(`Kein Platz für ${WAREN[nr].name} – der Laderaum ist voll.`)
      } else {
        const n = Math.min(s.ladung[id] ?? 0, -menge)
        if (n > 0) { s.ladung[id] -= n; if (!s.ladung[id]) delete s.ladung[id]; f.zeilen.push(`−${n} ${WAREN[nr].name}`) }
      }
    }
  }
  if (w.tier) {
    const t = neuesTier(s, gebietVon(s.q, s.r), w.tier)
    if (t) { s.atlas.tiere.push(t.id); const r = 15 * t.selten * t.selten; s.ruhm += r; f.tier = t; f.zeilen.push(`Neu im Atlas: ${t.name} (+${r} Ruhm)`) }
  }
  if (w.kurios) {
    const k = neuesKurios(s)
    if (k) { s.atlas.kurios.push(k.id); s.ruhm += 25; f.kurios = k; f.zeilen.push(`Neu in der Sammlung: ${k.name} (+25 Ruhm)`) }
    else { const g = 60 * (1 + stufe); s.gold += g; f.zeilen.push(`+${g} Gold`) }
  }
  if (w.karte) {
    if (neueSchatzkarte(s, s.q, s.r)) { f.karte = true; f.zeilen.push('Eine Schatzkarte! Das Kreuz steht jetzt auf deiner Seekarte.') }
    else { const g = 40 * (1 + stufe); s.gold += g; f.zeilen.push(`+${g} Gold`) }
  }
  if (w.aufdecken) {
    f.neu = deckeAuf(spiel.karte, s.q, s.r, w.aufdecken)
    f.entdeckt = sichte(spiel, f.neu, u)
    if (f.neu.length) f.zeilen.push(`${f.neu.length} Felder Karte gewonnen`)
  }
  if (w.geruecht) {
    const g = geruechtNahe(s, s.q, s.r, u)
    if (g) { f.geruecht = g; f.zeilen.push(geruechtText(g, s.q, s.r)) }
  }
  if (w.rumpf) {
    if (w.rumpf > 0) { s.rumpf = Math.min(werte.rumpfMax, s.rumpf + w.rumpf); f.zeilen.push(`Rumpf ausgebessert (+${w.rumpf})`) }
    else {
      const vorher = s.rumpf
      if (schaden(spiel, -w.rumpf)) { f.umkehr = true; f.zeilen.push('Der Rumpf hält nicht mehr – das Schiff schleppt sich in den letzten Hafen.') }
      else f.zeilen.push(`Rumpf beschädigt (−${vorher - s.rumpf})`)
    }
  }
  if (s.proviant <= 0 && s.imHafen === null && !f.umkehr) {
    kehreUm(spiel)
    f.umkehr = true
    f.zeilen.push('Der Proviant ist aufgebraucht – die Mannschaft kehrt um.')
  }
  s.zug++
  return f
}

export type Bedarf = { rolle?: OffizierRolle; ausbau?: string; ware?: string; gold?: number }
