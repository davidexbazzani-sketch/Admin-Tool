// Terra Incognita — die Grundzüge des Spiels: neues Spiel, ein Schritt auf See, Sichten, Einlaufen, Melden, Umkehr.
// Alle Funktionen verändern das übergebene Spiel und hängen nur von ihren Eingaben ab (kein Zufall ohne Startwert,
// keine Uhr): Dieselben Züge ergeben immer denselben Stand.
import { OFFIZIERE } from '../inhalt/offiziere'
import { verbrauch, schrittStunden, type FahrtUmwelt } from './fahrt'
import { GEBIETE, gebietVon, stufeVon } from './gebiete'
import { abstand, feldAus, feldKey, richtungZu, type Feld } from './hex'
import { deckeAuf, type Karte } from './nebel'
import { schiffWerte, type SchiffWerte } from './schiff'
import { leererStand, type Entdeckung, type TiStand } from './stand'
import { streu3 } from './streu'
import { feldLohn, goldFuerRuhm, marktVon, preise, ruhmFuer, ruhmInsel, WAREN } from './waren'
import { ankerplaetze, EIS, gelaende, HAMBURG, HAMBURG_REEDE, INSEL_MIN_TAUFE, inselVon, istLand, ortBei, RIFF, type Ort } from './welt'
import { hinterhalt, stelltHier } from './piraten'
import type { Gegner } from '../kampf/gegner'

export interface Spiel { stand: TiStand; karte: Karte }
/** was von außen kommt: der Kalendertag (Berliner Zeit) und die echte Uhrzeit */
export interface Umwelt { tag: number; jetzt: number }

export const werteVon = (s: TiStand): SchiffWerte => schiffWerte(s, OFFIZIERE)
export const fahrtUmwelt = (s: TiStand, u: Umwelt): FahrtUmwelt => ({ tag: u.tag, werte: werteVon(s) })
export const sichtBei = (s: TiStand, q: number, r: number): number => { const w = werteVon(s); return GEBIETE[gebietVon(q, r)].nebel ? w.sichtNebel : w.sicht }
export const ladungMenge = (s: TiStand): number => { let n = 0; for (const m of Object.values(s.ladung)) n += m; for (const a of s.auftraege) if (a.art === 'fracht') n += a.menge ?? 0; return n }
export const ortVon = (key: string): Ort | null => { const f = feldAus(key); return ortBei(f.q, f.r) }

export const HEIMAT_NAME = 'Elbinsel'
const S_EREIGNIS = 6001

export function neuesSpiel(benutzer: string, kapitaen: string, schiffName: string, saat: number, u: Umwelt): Spiel {
  const stand = leererStand(benutzer, saat, u.tag, u.jetzt)
  stand.kapitaen = kapitaen; stand.schiffName = schiffName
  stand.q = HAMBURG_REEDE.q; stand.r = HAMBURG_REEDE.r
  stand.entdeckt['o0,0'] = { t: 'o', art: 'hafen', q: 0, r: 0, stufe: 0, tag: u.tag, gemeldet: true, anspruch: 3, besucht: true }
  const insel = inselVon(HAMBURG.q, HAMBURG.r)
  if (insel && insel.key) { const f = feldAus(insel.key.slice(1)); stand.entdeckt[insel.key] = { t: 'i', art: 'insel', q: f.q, r: f.r, stufe: 0, tag: u.tag, gemeldet: true, anspruch: 3, name: HEIMAT_NAME, felder: insel.felder.length } }
  const spiel: Spiel = { stand, karte: new Map() }
  // die Heimatgewässer sind von Anfang an bekannt und zählen nicht als Vermessung
  deckeAuf(spiel.karte, HAMBURG_REEDE.q, HAMBURG_REEDE.r, 3)
  return spiel
}

/** Neu aufgedeckte Felder auswerten: Lohn der Gilde, neue Orte und Inseln. Gibt die Schlüssel der neuen Entdeckungen zurück. */
export function sichte(spiel: Spiel, neu: readonly Feld[], u: Umwelt): string[] {
  const s = spiel.stand, w = werteVon(s)
  const funde: string[] = []
  for (const f of neu) {
    const stufe = stufeVon(f.q, f.r)
    s.gildeLohn += feldLohn(stufe) * w.gilde           // Hundertstel Gold
    s.neueFelder++
    s.statistik.felder++
    const gebiet = gebietVon(f.q, f.r)
    for (const a of s.auftraege) if (a.art === 'vermessung' && a.gebiet === gebiet) a.stand++
    const ort = ortBei(f.q, f.r)
    if (ort && !s.entdeckt[`o${ort.key}`]) {
      s.entdeckt[`o${ort.key}`] = { t: 'o', art: ort.art, q: ort.q, r: ort.r, stufe: ort.stufe, tag: u.tag, gemeldet: false, anspruch: 0 }
      funde.push(`o${ort.key}`)
      for (const a of s.auftraege) if (a.art === 'suche' && a.sucheArt === ort.art) a.stand++
    }
    if (istLand(gelaende(f.q, f.r))) {
      const insel = inselVon(f.q, f.r)
      if (insel && !insel.festland && insel.felder.length >= INSEL_MIN_TAUFE && !s.entdeckt[insel.key]) {
        const k = feldAus(insel.key.slice(1))
        s.entdeckt[insel.key] = { t: 'i', art: 'insel', q: k.q, r: k.r, stufe: stufeVon(k.q, k.r), tag: u.tag, gemeldet: false, anspruch: 0, felder: insel.felder.length }
        funde.push(insel.key)
      }
    }
  }
  return funde
}

export interface SchrittErgebnis {
  ok: boolean
  grund?: 'land' | 'riff' | 'eis' | 'fern'
  stunden: number
  neu: Feld[]
  entdeckt: string[]
  /** hier ist jetzt ein Ereignis fällig (Kennung) */
  ereignis?: boolean
  /** Proviant aufgebraucht oder Rumpf am Ende: zurück in den letzten Hafen */
  umkehr?: 'proviant' | 'rumpf'
  /** Ort auf See, auf dem das Schiff jetzt liegt */
  hier?: Ort
  /** gefangener Proviant in Stunden (Fischgrund) */
  fisch?: number
  /** ein Gegner stellt das Schiff (Pirat oder Ungeheuer auf dem Nachbarfeld) oder überfällt es aus dem Hinterhalt */
  gegner?: Gegner
  stellung?: 'gestellt' | 'hinterhalt'
}

/** Ein Schritt auf ein Nachbarfeld. */
export function schritt(spiel: Spiel, ziel: Feld, u: Umwelt): SchrittErgebnis {
  const s = spiel.stand
  const kurs = richtungZu(s.q, s.r, ziel.q, ziel.r)
  if (kurs < 0) return { ok: false, grund: 'fern', stunden: 0, neu: [], entdeckt: [] }
  const fu = fahrtUmwelt(s, u)
  const std = schrittStunden(ziel.q, ziel.r, kurs, fu)
  if (std === null) {
    const g = gelaende(ziel.q, ziel.r)
    return { ok: false, grund: g === RIFF ? 'riff' : g === EIS ? 'eis' : 'land', stunden: 0, neu: [], entdeckt: [] }
  }
  const vorher = s.stunden
  s.imHafen = null
  s.q = ziel.q; s.r = ziel.r; s.kurs = kurs
  s.stunden += std
  s.zug++
  s.proviant -= verbrauch(std, fu)
  if (fu.werte.flicken && s.rumpf < fu.werte.rumpfMax) {
    const takt = fu.werte.flicken === 2 ? 24 : 48
    s.rumpf = Math.min(fu.werte.rumpfMax, s.rumpf + Math.floor(s.stunden / takt) - Math.floor(vorher / takt))
  }
  const weit = abstand(s.q, s.r, HAMBURG.q, HAMBURG.r)
  if (weit > s.statistik.weiteste) s.statistik.weiteste = weit
  const neu = deckeAuf(spiel.karte, s.q, s.r, sichtBei(s, s.q, s.r))
  const erg: SchrittErgebnis = { ok: true, stunden: std, neu, entdeckt: sichte(spiel, neu, u) }
  const ort = ortBei(s.q, s.r)
  if (ort) {
    if (ort.art === 'fischgrund') {
      const zuletzt = s.genutzt[ort.key]
      if (zuletzt === undefined || s.stunden - zuletzt >= 72) {
        const fang = Math.min(fu.werte.proviantMax - s.proviant, 18 + 6 * (ort.saat % 3))
        if (fang > 0) { s.proviant += fang; s.genutzt[ort.key] = s.stunden; erg.fisch = fang }
      }
    } else erg.hier = ort
  }
  if (s.proviant <= 0) { kehreUm(spiel); erg.umkehr = 'proviant'; return erg }
  // Gegner: Wer neben einem Piraten oder Ungeheuer landet, wird gestellt; sonst vielleicht ein Hinterhalt
  const gestellt = stelltHier(s, u.tag)
  if (gestellt) { erg.gegner = gestellt; erg.stellung = 'gestellt'; return erg }
  const ueberfall = hinterhalt(s)
  if (ueberfall) { s.kampf.hinterhalt = s.zug; erg.gegner = ueberfall; erg.stellung = 'hinterhalt'; return erg }
  // ein Ereignis auf See: im Mittel alle 22 Schritte, frühestens 6 Schritte nach dem letzten
  if (!erg.hier && !erg.entdeckt.length && s.zug - (s.genutzt['#ereignis'] ?? -99) >= 6 && streu3(s.saat, s.zug, 0, S_EREIGNIS) % 1000 < 45) {
    s.genutzt['#ereignis'] = s.zug
    erg.ereignis = true
  }
  return erg
}

/** Die Mannschaft bringt das Schiff in den letzten Hafen zurück: halbe Ladung über Bord, Aufträge mit Fracht verfallen. */
export function kehreUm(spiel: Spiel): void {
  const s = spiel.stand
  const hafen = ortVon(s.letzterHafen) ?? (ortBei(0, 0) as Ort)
  const anker = ankerplaetze(hafen.q, hafen.r)[0] ?? HAMBURG_REEDE
  s.q = anker.q; s.r = anker.r
  s.imHafen = hafen.key
  s.stunden += 48
  s.zug++
  // Hamburg lässt niemanden ohne Brot liegen (wie beim Einlaufen): vier Tage Proviant vom Hafenmeister.
  // In jedem anderen Hafen gibt es Arbeit für alle, die knapp bei Kasse sind (handel.ts: hafenarbeit).
  s.proviant = hafen.key === '0,0' ? 96 : 0
  s.rumpf = Math.max(1, s.rumpf)
  for (const k of Object.keys(s.ladung)) { s.ladung[k] = Math.floor(s.ladung[k] / 2); if (!s.ladung[k]) delete s.ladung[k] }
  s.auftraege = s.auftraege.filter(a => a.art !== 'fracht')
  s.statistik.umkehr++
}

/** Schaden am Rumpf; ist er am Ende, schleppt sich das Schiff in den letzten Hafen. Gibt true zurück, wenn es so weit kam. */
export function schaden(spiel: Spiel, punkte: number): boolean {
  const s = spiel.stand
  const gemildert = Math.max(1, Math.floor((punkte * (100 - werteVon(s).schutz)) / 100))
  s.rumpf -= gemildert
  if (s.rumpf > 0) return false
  kehreUm(spiel)
  return true
}

/** Kann das Schiff hier in diesen Ort einlaufen (liegt es auf einem Nachbarfeld)? */
export function liegtVor(s: TiStand, ort: Ort): boolean { return abstand(s.q, s.r, ort.q, ort.r) <= 1 }

export interface EinlaufErgebnis { ok: boolean; kontorGold: number; geschenkt: number; kopfgeld: number }

/** In einen Hafen oder ein Dorf einlaufen. */
export function laufeEin(spiel: Spiel, key: string, u: Umwelt): EinlaufErgebnis {
  const s = spiel.stand, ort = ortVon(key)
  if (!ort || (ort.art !== 'hafen' && ort.art !== 'dorf') || !liegtVor(s, ort)) return { ok: false, kontorGold: 0, geschenkt: 0, kopfgeld: 0 }
  const warAufSee = s.imHafen === null
  s.imHafen = key
  const e = s.entdeckt[`o${key}`]
  if (e) e.besucht = true
  let kontorGold = 0, geschenkt = 0, kopfgeld = 0
  if (ort.art === 'hafen') {
    s.letzterHafen = key
    if (warAufSee) s.statistik.fahrten++
    kontorGold = kontorAbrechnen(s, u.jetzt)
    merkeKurse(s, ort, u)
    // Hamburg lässt niemanden ohne Brot auslaufen: bis zu vier Tage Proviant gibt der Hafenmeister umsonst
    if (key === '0,0' && s.proviant < 96) { geschenkt = 96 - s.proviant; s.proviant = 96 }
    // Kopfgeld für bezwungene Piraten zahlt der Hafenmeister jeder Hafenstadt aus
    if (s.kampf.kopfgeld > 0) { kopfgeld = s.kampf.kopfgeld; s.gold += kopfgeld; s.kampf.kopfgeld = 0 }
  }
  return { ok: true, kontorGold, geschenkt, kopfgeld }
}

/** die heutigen Preise des Hafens ins Kursbuch schreiben */
export function merkeKurse(s: TiStand, ort: Ort, u: Umwelt): void {
  const p: Record<string, [number, number]> = {}
  const handel = werteVon(s).handel
  for (let i = 0; i < WAREN.length; i++) { const pr = preise(ort, i, u.tag, s.druck[ort.key]?.[WAREN[i].id], s.stunden, handel); p[WAREN[i].id] = [pr.kauf ?? 0, pr.verkauf] }
  s.kursbuch[ort.key] = { std: s.stunden, tag: u.tag, p }
}

// ── Kontore: bringen in echter Zeit Gold, höchstens für 48 Stunden ──
export const KONTOR_DECKEL_MS = 48 * 3600 * 1000
export function kontorRate(s: TiStand): number {
  let rate = 0
  for (const [key, stufe] of Object.entries(s.kontore)) { const o = ortVon(key); if (o) rate += (2 + o.stufe) * stufe }
  return rate
}
/** aufgelaufener Ertrag (ohne ihn auszuzahlen) */
export function kontorErtrag(s: TiStand, jetzt: number): number {
  if (jetzt < s.zeitGesehen) return 0                       // Uhr zurückgestellt: nichts
  const dauer = Math.min(KONTOR_DECKEL_MS, Math.max(0, jetzt - s.kontorZeit))
  return Math.floor((kontorRate(s) * dauer) / 3600000)
}
export function kontorAbrechnen(s: TiStand, jetzt: number): number {
  const gold = kontorErtrag(s, jetzt)
  if (jetzt >= s.zeitGesehen) { s.zeitGesehen = jetzt; s.kontorZeit = jetzt }
  s.gold += gold
  return gold
}

export interface MeldeErgebnis { ok: boolean; gold: number; ruhm: number; felder: number; gemeldet: string[] }

/** Entdeckungen und neue Karten bei der Gilde eines Hafens melden: Ruhm und Gold. Der Anspruch als Erstentdecker
 *  wird danach über das Netzlaufwerk geklärt (siehe gemeinsam.ts) und mit anspruchErgebnis verbucht. */
export function melde(spiel: Spiel): MeldeErgebnis {
  const s = spiel.stand, hafen = s.imHafen ? ortVon(s.imHafen) : null
  if (!hafen || hafen.art !== 'hafen') return { ok: false, gold: 0, ruhm: 0, felder: 0, gemeldet: [] }
  let gold = Math.floor(s.gildeLohn / 100), ruhm = 0
  const felder = s.neueFelder
  s.gildeLohn -= gold * 100
  s.neueFelder = 0
  const gemeldet: string[] = []
  for (const [key, e] of Object.entries(s.entdeckt)) {
    if (e.gemeldet) continue
    e.gemeldet = true
    const r = ruhmVon(e)
    ruhm += r; gold += goldFuerRuhm(r)
    gemeldet.push(key)
  }
  s.gold += gold; s.ruhm += ruhm
  if (gemeldet.length || felder) s.zug++
  return { ok: true, gold, ruhm, felder, gemeldet }
}

export const ruhmVon = (e: Entdeckung): number => (e.t === 'i' ? ruhmInsel(e.felder ?? 2, e.stufe) : ruhmFuer(e.art, e.stufe))

/** Ergebnis des Anspruchs verbuchen: 1 = ich bin Erstentdecker (Ruhm noch einmal obendrauf), 2 = jemand war früher. Nur einmal wirksam. */
export function anspruchErgebnis(spiel: Spiel, key: string, ergebnis: 1 | 2, daten?: { name?: string; von?: string; seit?: number }): number {
  const e = spiel.stand.entdeckt[key]
  if (!e || e.anspruch !== 0) return 0
  e.anspruch = ergebnis
  if (daten?.seit !== undefined) e.seit = daten.seit
  if (ergebnis === 1) {
    // der Erstentdecker tauft: Inseln und Naturwunder tragen ab jetzt seinen Namen
    const name = daten?.name ?? e.vorschlag
    if (name && (e.t === 'i' || e.art === 'wunder')) e.name = name
    const bonus = ruhmVon(e)
    spiel.stand.ruhm += bonus
    return bonus
  }
  if (daten?.name) e.name = daten.name
  if (daten?.von) e.von = daten.von
  return 0
}

/** Angebot eines Marktes als Liste für die Oberfläche */
export const marktListe = (ort: Ort): { angebot: number[]; nachfrage: number[] } => marktVon(ort)
export { feldKey }
