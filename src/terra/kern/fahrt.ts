// Terra Incognita — Fahrtregeln: was ein Schritt kostet, Wegsuche und Reichweite.
// Zeiteinheit ist die Stunde (24 Stunden = 1 Tag Proviant).
import { abstand, feldNr, nrZuFeld, RICHTUNGEN, type Feld } from './hex'
import { gebietVon } from './gebiete'
import { kennt, type Karte } from './nebel'
import type { SchiffWerte } from './schiff'
import { EIS, gelaende, istLand, RIFF, TANG } from './welt'
import { feldStunden, STUNDEN_MIN, windIn } from './wind'

export interface FahrtUmwelt {
  /** Tagesnummer (bestimmt den Wind) */
  tag: number
  werte: SchiffWerte
}

const runde = (stunden: number, tempo: number): number => Math.max(3, Math.floor((stunden * 100 + (tempo >> 1)) / tempo))

/** Stunden für den Schritt auf ein Feld mit dem Kurs `kurs` (0 … 5); null = dort kommt dieses Schiff nicht hin */
export function schrittStunden(zq: number, zr: number, kurs: number, u: FahrtUmwelt): number | null {
  const g = gelaende(zq, zr)
  if (istLand(g)) return null
  if (g === RIFF && !u.werte.lot) return null
  if (g === EIS && !u.werte.eisbug) return null
  const wind = windIn(gebietVon(zq, zr), u.tag)
  let h = feldStunden(kurs, wind)
  const beste = feldStunden(wind.richtung, wind)
  if (h > beste && u.werte.gegenwind < 100) h = beste + Math.floor(((h - beste) * u.werte.gegenwind) / 100)
  if (g === RIFF) h += 6
  else if (g === EIS) h += 10
  else if (g === TANG) h *= 2
  return runde(h, u.werte.tempo)
}

/** angenommene Stunden für ein noch unbekanntes Feld (für die Planung ins Ungewisse) */
export const stundenUnbekannt = (u: FahrtUmwelt): number => runde(12, u.werte.tempo)
/** Proviantverbrauch für eine Zahl von Stunden (der Koch streckt den Vorrat) */
export const verbrauch = (stunden: number, u: FahrtUmwelt): number => Math.max(1, Math.floor((stunden * u.werte.verbrauch + 50) / 100))

// ── kleine Vorrangschlange (kleinster Wert zuerst) ──
class Schlange {
  private wert: number[] = []
  private nr: number[] = []
  get leer(): boolean { return this.wert.length === 0 }
  rein(w: number, n: number): void {
    const wert = this.wert, nr = this.nr
    let i = wert.length
    wert.push(w); nr.push(n)
    while (i > 0) {
      const e = (i - 1) >> 1
      if (wert[e] <= w) break
      wert[i] = wert[e]; nr[i] = nr[e]; i = e
    }
    wert[i] = w; nr[i] = n
  }
  raus(): [number, number] {
    const wert = this.wert, nr = this.nr
    const w0 = wert[0], n0 = nr[0]
    const w = wert.pop() as number, n = nr.pop() as number
    const len = wert.length
    if (len) {
      let i = 0
      for (;;) {
        let k = 2 * i + 1
        if (k >= len) break
        if (k + 1 < len && wert[k + 1] < wert[k]) k++
        if (wert[k] >= w) break
        wert[i] = wert[k]; nr[i] = nr[k]; i = k
      }
      wert[i] = w; nr[i] = n
    }
    return [w0, n0]
  }
}

export interface Route {
  /** Felder der Route ohne das Startfeld */
  felder: Feld[]
  stunden: number
  /** so viele Felder der Route sind noch unbekannt — ihre Kosten sind geschätzt */
  unbekannt: number
}

/**
 * Günstigste Route zu einem der Ziele. Bekannte Felder zählen mit ihren echten Kosten; unbekannte gelten als
 * befahrbar mit Schätzwert (unterwegs kann sich herausstellen, dass dort Land liegt).
 * @param nurBekannt true = unbekannte Felder werden nicht betreten
 * @param meiden Felder (Feldnummern), um die die Route herumführt — z. B. rund um sichtbare Piraten (außer sie sind das Ziel)
 */
export function sucheRoute(vq: number, vr: number, ziele: readonly Feld[], karte: Karte, u: FahrtUmwelt, nurBekannt = false, maxKnoten = 40000, meiden?: ReadonlySet<number>): Route | null {
  if (!ziele.length) return null
  const zielNr = new Set(ziele.map(z => feldNr(z.q, z.r)))
  const start = feldNr(vq, vr)
  if (zielNr.has(start)) return { felder: [], stunden: 0, unbekannt: 0 }
  const kleinst = runde(STUNDEN_MIN, u.werte.tempo), fremd = stundenUnbekannt(u)
  const schaetze = (q: number, r: number): number => {
    let d = 1e9
    for (const z of ziele) { const a = abstand(q, r, z.q, z.r); if (a < d) d = a }
    return d * kleinst
  }
  const kosten = new Map<number, number>([[start, 0]])
  const woher = new Map<number, number>()
  const offen = new Schlange()
  offen.rein(schaetze(vq, vr), start)
  let knoten = 0
  while (!offen.leer) {
    const [, n] = offen.raus()
    const bisher = kosten.get(n) as number
    if (zielNr.has(n)) {
      const felder: Feld[] = []
      let unbekannt = 0
      for (let x = n; x !== start; x = woher.get(x) as number) { const f = nrZuFeld(x); felder.push(f); if (!kennt(karte, f.q, f.r)) unbekannt++ }
      felder.reverse()
      return { felder, stunden: bisher, unbekannt }
    }
    if (++knoten > maxKnoten) return null
    const f = nrZuFeld(n)
    for (let k = 0; k < 6; k++) {
      const nq = f.q + RICHTUNGEN[k][0], nr = f.r + RICHTUNGEN[k][1]
      let schritt: number | null
      if (kennt(karte, nq, nr)) schritt = schrittStunden(nq, nr, k, u)
      else schritt = nurBekannt ? null : fremd
      if (schritt === null) continue
      const neu = bisher + schritt, m = feldNr(nq, nr)
      if (meiden && meiden.has(m) && !zielNr.has(m)) continue
      const alt = kosten.get(m)
      if (alt !== undefined && alt <= neu) continue
      kosten.set(m, neu); woher.set(m, n)
      offen.rein(neu + schaetze(nq, nr), m)
    }
  }
  return null
}

/** Stunden vom Schiff zu allen bekannten Feldern, die es mit `grenze` Stunden erreicht */
export function reichweite(vq: number, vr: number, karte: Karte, u: FahrtUmwelt, grenze: number): Map<number, number> {
  const kosten = new Map<number, number>([[feldNr(vq, vr), 0]])
  const offen = new Schlange()
  offen.rein(0, feldNr(vq, vr))
  while (!offen.leer) {
    const [w, n] = offen.raus()
    if (w > (kosten.get(n) as number)) continue
    const f = nrZuFeld(n)
    for (let k = 0; k < 6; k++) {
      const nq = f.q + RICHTUNGEN[k][0], nr = f.r + RICHTUNGEN[k][1]
      if (!kennt(karte, nq, nr)) continue
      const schritt = schrittStunden(nq, nr, k, u)
      if (schritt === null) continue
      const neu = w + schritt
      if (neu > grenze) continue
      const m = feldNr(nq, nr), alt = kosten.get(m)
      if (alt !== undefined && alt <= neu) continue
      kosten.set(m, neu)
      offen.rein(neu, m)
    }
  }
  return kosten
}

/** Stunden von jedem bekannten Feld bis zum nächsten der Ziele (Ankerfelder von Häfen) — rückwärts gerechnet,
 *  weil der Wind hin und zurück verschieden viel kostet */
export function heimweg(ziele: readonly Feld[], karte: Karte, u: FahrtUmwelt, grenze: number): Map<number, number> {
  const kosten = new Map<number, number>()
  const offen = new Schlange()
  for (const z of ziele) { const n = feldNr(z.q, z.r); kosten.set(n, 0); offen.rein(0, n) }
  while (!offen.leer) {
    const [w, n] = offen.raus()
    if (w > (kosten.get(n) as number)) continue
    const f = nrZuFeld(n)
    // der Schritt VON einem Nachbarn AUF dieses Feld: Kosten hängen von diesem Feld und dem Kurs ab
    for (let k = 0; k < 6; k++) {
      const schritt = schrittStunden(f.q, f.r, k, u)
      if (schritt === null) break   // dieses Feld ist unpassierbar (kann nur ein Ziel auf Land sein) — dann für keinen Kurs
      const pq = f.q - RICHTUNGEN[k][0], pr = f.r - RICHTUNGEN[k][1]
      if (!kennt(karte, pq, pr)) continue
      const gp = gelaende(pq, pr)
      if (istLand(gp) || (gp === RIFF && !u.werte.lot) || (gp === EIS && !u.werte.eisbug)) continue
      const neu = w + schritt
      if (neu > grenze) continue
      const m = feldNr(pq, pr), alt = kosten.get(m)
      if (alt !== undefined && alt <= neu) continue
      kosten.set(m, neu)
      offen.rein(neu, m)
    }
  }
  return kosten
}
