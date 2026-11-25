// Terra Incognita — Ereignisse auf See, Landgänge und Fundstellen, Schatzkarten und die Legende.
import { LEGENDE, STERNPLATTE, WUNDER, type Kapitel, type WunderArt } from '../inhalt/atlas'
import { EREIGNISSE, type Ereignis, type Wahl } from '../inhalt/ereignisse'
import { offizier } from '../inhalt/offiziere'
import { gebietVon, stufeVon } from './gebiete'
import { offizierHier } from './handel'
import { abstand } from './hex'
import { klima } from './namen'
import type { Offizier } from './schiff'
import { laufeEin, liegtVor, ortVon, werteVon, type Spiel, type Umwelt } from './spiel'
import type { TiStand } from './stand'
import { streu, streu3 } from './streu'
import { WAREN } from './waren'
import { istSeeOrt, type Ort } from './welt'
import { wirke, type Folge, type Wirkung } from './wirkung'

const S_WAHL = 6201, S_AUSGANG = 6202, S_FUND = 6203

// ── Ereignisse auf See ──
function passt(e: Ereignis, s: TiStand, gebiet: number, stufe: number, proviantProzent: number): boolean {
  if (e.klima && !e.klima.includes(klima(gebiet))) return false
  if (e.nurGebiet && !e.nurGebiet.includes(gebiet)) return false
  if ((e.abStufe ?? 0) > stufe) return false
  if (e.proviantUnter !== undefined && proviantProzent >= e.proviantUnter) return false
  return !s.erlebt.includes(e.id)
}

/** das Ereignis, das jetzt eintritt (fest aus dem Spielstand bestimmt) */
export function faelligesEreignis(s: TiStand): Ereignis {
  const gebiet = gebietVon(s.q, s.r), stufe = stufeVon(s.q, s.r)
  const prozent = Math.floor((s.proviant * 100) / Math.max(1, werteVon(s).proviantMax))
  let liste = EREIGNISSE.filter(e => passt(e, s, gebiet, stufe, prozent))
  if (!liste.length) liste = EREIGNISSE.filter(e => !e.nurGebiet && !e.klima && !e.abStufe && e.proviantUnter === undefined)
  let summe = 0
  for (const e of liste) summe += e.gewicht
  let wurf = streu3(s.saat, s.zug, 1, S_WAHL) % summe
  for (const e of liste) { if (wurf < e.gewicht) return e; wurf -= e.gewicht }
  return liste[0]
}
export const ereignisVon = (id: string): Ereignis | undefined => EREIGNISSE.find(e => e.id === id)

/** Kann der Spieler diese Antwort wählen? */
export function kannWaehlen(s: TiStand, w: Wahl): boolean {
  const b = w.braucht
  if (!b) return true
  if (b.gold !== undefined && s.gold < b.gold) return false
  if (b.ausbau && !s.ausbauten.includes(b.ausbau)) return false
  if (b.ware && !(s.ladung[b.ware] > 0)) return false
  if (b.rolle && !s.offiziere.some(id => offizier(id)?.rolle === b.rolle)) return false
  return true
}

export interface Antwortfolge { text: string; folge: Folge }
/** Antwort auf ein Ereignis geben */
export function antworte(spiel: Spiel, ereignisId: string, wahlNr: number, u: Umwelt): Antwortfolge | null {
  const s = spiel.stand, e = ereignisVon(ereignisId), w = e?.wahl[wahlNr]
  if (!e || !w || !kannWaehlen(s, w)) return null
  let summe = 0
  for (const a of w.aus) summe += a.p
  let wurf = streu3(s.saat, s.zug, wahlNr, S_AUSGANG) % summe
  let ausgang = w.aus[0]
  for (const a of w.aus) { if (wurf < a.p) { ausgang = a; break } wurf -= a.p }
  s.erlebt.push(e.id)
  if (s.erlebt.length > 10) s.erlebt.shift()
  return { text: ausgang.text, folge: wirke(spiel, ausgang.w, u) }
}

// ── Naturwunder ──
export function wunderVon(ort: Ort): WunderArt {
  const k = klima(ort.gebiet)
  const passend = WUNDER.filter(w => !w.klima || w.klima.includes(k))
  return passend[streu(ort.saat, 0, 6301) % passend.length]
}

// ── Legende ──
/** Gibt es hier das nächste Kapitel? Verbucht es und gibt es zurück. */
function legendeHier(spiel: Spiel, ort: Ort): Kapitel | null {
  const s = spiel.stand, k = LEGENDE[s.atlas.legende]
  if (!k || !k.gebiete.includes(ort.gebiet) || ort.stufe < k.abStufe) return null
  s.atlas.legende = k.nr
  s.ruhm += k.nr === 8 ? 5000 : 80 * k.nr
  if (k.nr === 8 && !s.atlas.kurios.includes(STERNPLATTE.id)) s.atlas.kurios.push(STERNPLATTE.id)
  return k
}

/** Richtiges Gebiet, aber noch nicht weit genug draußen: Dann gibt es wenigstens einen Fingerzeig. */
function legendeFastHier(s: TiStand, ort: Ort): boolean {
  const k = LEGENDE[s.atlas.legende]
  return !!k && k.gebiete.includes(ort.gebiet) && ort.stufe < k.abStufe
}

// ── Landgang und Fundstellen ──
export interface LandErgebnis {
  ok: boolean
  grund?: string
  titel: string
  text: string
  folge: Folge
  /** ein Rätsel versperrt den Weg: Art 0 … 3 */
  raetsel?: number
  kapitel?: Kapitel
  /** hier bietet jemand seine Dienste an */
  offizier?: Offizier
  wunder?: WunderArt
  /** das Schiff liegt jetzt im Hafen/Dorf */
  hafen?: boolean
}
const leer = (): Folge => ({ zeilen: [] })
const nein = (grund: string): LandErgebnis => ({ ok: false, grund, titel: '', text: '', folge: leer() })

const NACHWUCHS_STUNDEN = 240

/** Einen Ort untersuchen: an Land gehen, tauchen, bergen. */
export function untersuche(spiel: Spiel, key: string, u: Umwelt): LandErgebnis {
  const s = spiel.stand, ort = ortVon(key)
  if (!ort) return nein('Hier ist nichts.')
  if (istSeeOrt(ort.art) ? (s.q !== ort.q || s.r !== ort.r) : !liegtVor(s, ort)) return nein('Dafür muss das Schiff näher heran.')
  const e = s.entdeckt[`o${key}`]
  const neu = !e?.besucht
  if (e) e.besucht = true
  const w = werteVon(s), wurf = streu(ort.saat, s.saat, S_FUND)
  switch (ort.art) {
    case 'hafen': case 'dorf': {
      const r = laufeEin(spiel, key, u)
      const zeilen: string[] = []
      if (r.kontorGold) zeilen.push(`+${r.kontorGold} Gold aus den Kontoren`)
      if (r.geschenkt) zeilen.push('Der Hafenmeister füllt den Proviant auf vier Tage auf – in Hamburg läuft niemand hungrig aus.')
      if (r.kopfgeld) zeilen.push(`+${r.kopfgeld} Gold Kopfgeld für bezwungene Piraten`)
      return { ok: r.ok, titel: '', text: '', folge: { zeilen }, hafen: true, offizier: offizierHier(ort) ?? undefined }
    }
    case 'quelle': {
      const zuletzt = s.genutzt[key]
      if (zuletzt !== undefined && s.stunden - zuletzt < NACHWUCHS_STUNDEN) return { ok: true, titel: 'Noch nichts nachgewachsen', text: 'Hier war die Mannschaft erst vor Kurzem. Es dauert, bis die Fässer wieder zu füllen sind.', folge: leer() }
      s.genutzt[key] = s.stunden
      const menge = Math.floor(((72 + 24 * (ort.saat % 3)) * (w.beiboot ? 150 : 100)) / 100)
      return { ok: true, titel: 'Frischer Proviant', text: 'Das Beiboot bringt Wasser, Früchte und was die Insel sonst hergibt.', folge: wirke(spiel, { proviant: menge }, u, ort.stufe) }
    }
    case 'wunder': {
      const art = wunderVon(ort)
      if (!neu) return { ok: true, titel: art.art, text: art.text, folge: leer(), wunder: art }
      return { ok: true, titel: art.art, text: art.text, folge: wirke(spiel, { ruhm: 20 + 10 * ort.stufe }, u, ort.stufe), wunder: art }
    }
    case 'einsiedler': {
      const zuletzt = s.genutzt[key]
      if (!neu && zuletzt !== undefined && s.stunden - zuletzt < NACHWUCHS_STUNDEN) return { ok: true, titel: 'Stille', text: 'Der Einsiedler nickt zum Gruß, hat aber nichts Neues zu erzählen.', folge: leer(), offizier: offizierHier(ort) ?? undefined }
      s.genutzt[key] = s.stunden
      const fast = legendeFastHier(s, ort)
      const kapitel = legendeHier(spiel, ort) ?? undefined
      const folge = wirke(spiel, neu ? { proviant: 24, geruecht: 1 } : { geruecht: 1 }, u, ort.stufe)
      const text = (neu ? 'Ein wortkarger Mensch, der seit Jahren niemanden gesehen hat. Er teilt seinen Fisch – und was er über die Gegend weiß.' : 'Der Einsiedler erkennt das Schiff wieder und winkt schon von Weitem.')
        + (fast ? ' Nach der Fortuna gefragt, zeigt er aufs offene Meer hinaus: Davon wisse man erst weiter draußen etwas.' : '')
      return { ok: true, titel: 'Besuch beim Einsiedler', text, folge, kapitel, offizier: offizierHier(ort) ?? undefined }
    }
    case 'ruine': {
      if (s.raetsel[key]?.geloest) return { ok: true, titel: 'Erforscht', text: 'Diese Mauern haben ihr Geheimnis preisgegeben.', folge: leer() }
      return { ok: true, titel: 'Verschlossen', text: 'Zwischen den Mauern liegt etwas verborgen – aber es ist gesichert. Wer es haben will, muss den Kopf anstrengen.', folge: leer(), raetsel: ort.saat % 4 }
    }
    case 'wrack': {
      // das letzte Kapitel der Legende liegt in einem Wrack ganz draußen am Rand der Welt — auch in einem, das schon leergeräumt ist
      const letztes = LEGENDE[s.atlas.legende]?.nr === 8
      const spur = letztes && legendeFastHier(s, ort)
      const kapitel = (letztes ? legendeHier(spiel, ort) : null) ?? undefined
      if (s.erledigt[key]) {
        if (kapitel) return { ok: true, titel: 'Hinter dem Wrack', text: 'Das Wrack ist längst leergeräumt. Aber diesmal fällt der Blick auf die Lagune dahinter.', folge: leer(), kapitel }
        return { ok: true, titel: 'Leergeräumt', text: 'Hier liegt nur noch das Gerippe.', folge: leer() }
      }
      s.erledigt[key] = 1
      const mal = w.taucherglocke ? 2 : 1
      const wirkung: Wirkung = { gold: 35 * mal }
      const art = wurf % 100
      if (art < 30) wirkung.ware = [WAREN[(wurf >>> 8) % WAREN.length].id, 2 + ((wurf >>> 16) % 3)]
      else if (art < 30 + 22 * mal) wirkung.kurios = 1
      else if (art < 30 + 40 * mal) wirkung.karte = 1
      const text = (w.taucherglocke ? 'Mit der Taucherglocke kommt man bis in den Laderaum. Dort unten liegt mehr, als von oben zu ahnen war.' : 'Was sich vom Deck aus greifen und heraufholen lässt, kommt an Bord.')
        + (spur ? ' Zwischen den Spanten steckt ein Kupfernagel mit eingeschlagenem Stern: Die Fortuna war hier – und ist weitergefahren, weiter nach Westen.' : '')
      return { ok: true, titel: 'Geborgen', text, folge: wirke(spiel, wirkung, u, ort.stufe), kapitel }
    }
    case 'treibgut': {
      if (s.erledigt[key]) return { ok: true, titel: 'Nichts mehr da', text: 'Hier schwimmen nur noch ein paar Planken.', folge: leer() }
      s.erledigt[key] = 1
      const art = wurf % 3
      const wirkung: Wirkung = art === 0 ? { gold: 14 } : art === 1 ? { proviant: 20 } : { ware: [WAREN[(wurf >>> 8) % 6].id, 1 + ((wurf >>> 16) % 2)] }
      return { ok: true, titel: 'Treibgut', text: 'Kisten und Fässer von einem Schiff, das mehr Pech hatte.', folge: wirke(spiel, wirkung, u, ort.stufe) }
    }
    case 'strudel': {
      const stark = 1 + (streu3(s.saat, s.zug, 0, S_FUND) % 2)
      const wirkung: Wirkung = { stunden: 10 * stark, rumpf: -stark }
      if (!s.erledigt[key] && wurf % 100 < 25) wirkung.kurios = 1
      s.erledigt[key] = 1
      return { ok: true, titel: 'Im Strudel', text: 'Das Wasser dreht sich wie in einem Trichter. Das Schiff wird zweimal herumgerissen, bevor es wieder freikommt.', folge: wirke(spiel, wirkung, u, ort.stufe) }
    }
    default: return nein('Hier ist nichts zu holen.')
  }
}

/** Ein Rätsel in einer Ruine ist gelöst: Belohnung. */
export function loeseRuine(spiel: Spiel, key: string, u: Umwelt): LandErgebnis {
  const s = spiel.stand, ort = ortVon(key)
  if (!ort || ort.art !== 'ruine' || !liegtVor(s, ort)) return nein('Dafür muss das Schiff vor der Ruine liegen.')
  if (s.raetsel[key]?.geloest) return nein('Diese Ruine ist schon erforscht.')
  s.raetsel[key] = { ...(s.raetsel[key] ?? {}), geloest: true, daten: undefined }
  const wurf = streu(ort.saat, s.saat, S_FUND + 1) % 100
  const wirkung: Wirkung = { gold: 70, ruhm: 30 + 15 * ort.stufe }
  if (wurf < 35) wirkung.kurios = 1
  else if (wurf < 60) wirkung.karte = 1
  else wirkung.gold = 110
  const kapitel = legendeHier(spiel, ort) ?? undefined
  return { ok: true, titel: 'Das Schloss gibt nach', text: 'Stein schabt über Stein. Dahinter, seit Menschengedenken unberührt, liegt der Lohn der Mühe.', folge: wirke(spiel, wirkung, u, ort.stufe), kapitel }
}

/** Den Schatz einer Schatzkarte heben (das Schiff liegt vor dem Ort oder auf ihm). */
export function hebeSchatz(spiel: Spiel, id: string, u: Umwelt): LandErgebnis {
  const s = spiel.stand, k = s.schatzkarten.find(x => x.id === id)
  if (!k || k.gehoben) return nein('Diese Karte führt zu nichts mehr.')
  if (abstand(s.q, s.r, k.q, k.r) > 1) return nein('Das Kreuz auf der Karte liegt woanders.')
  k.gehoben = true
  const wirkung: Wirkung = { gold: 160, ruhm: 40 + 20 * k.stufe }
  if (streu(k.q, k.r, s.saat) % 2 === 0) wirkung.kurios = 1
  return { ok: true, titel: 'Der Schatz', text: 'Drei Schritte vom krummen Baum, ein Spatenstich – und der Spaten trifft auf Holz. Die Truhe ist schwerer, als zwei Mann tragen können.', folge: wirke(spiel, wirkung, u, k.stufe) }
}
