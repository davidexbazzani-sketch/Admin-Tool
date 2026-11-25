// Terra Incognita — Festungen (Stufe 3): die eigene Festung auf einer entdeckten Insel, ihr Ertrag in echter Zeit,
// der Ausbau, die Belagerung durch einen Kollegen und was ein Überfall anrichtet.
//
// Wünsche des Nutzers: Kampf gegen Kollegen mit vollem Risiko — aber wer drei Tage nicht gespielt hat, liegt „im Nebel“
// und ist unangreifbar, und nach jedem Überfall gilt eine Schonfrist. Grundsatz dieser Umsetzung: Wer sich nicht messen
// will, baut keine Festung. Angreifen kann nur, wer selbst eine hat; angegriffen werden nur Festungen, nie ein Schiff.
//
// Die Reihenfolge mehrerer Überfälle entscheidet der Dateiserver (netz/festungen.ts: nummerierte Berichte, exklusiv
// angelegt). Hier steht, wie gerechnet wird — für Angreifer und Verteidiger dieselbe Rechnung (werteAus).
// Wie überall in kern/: nur Ganzzahlen, kein Zufall ohne Startwert, keine Uhr (die echte Zeit kommt von außen).
import type { Gegner } from '../kampf/gegner'
import { bilanz, neuerKampf, type KampfAkte } from '../kampf/kampf'
import type { Kampf, KampfStart, SchiffStart } from '../kampf/regeln'
import { eigeneSchiffe } from './gefecht'
import { gebietVon, HEIMATSEE, stufeVon } from './gebiete'
import { abstand, feldAus, feldNr, RICHTUNGEN } from './hex'
import { KLASSEN, rangVon } from './schiff'
import { kehreUm, ladungMenge, werteVon, type Spiel, type Umwelt } from './spiel'
import { BAU_ARTEN, CHRONIK_MAX, FESTUNG_CHRONIK_MAX, merkeErledigt, ZUGESTELLT_MAX, type BauArt, type FestungStand, type FestungsZiel, type KampfAusgang, type OffenerBericht, type TiStand } from './stand'
import { streu, streu3 } from './streu'
import { WAREN, wareNr } from './waren'
import { gelaende, inselVon, istLand, ortBei } from './welt'
import { windIn } from './wind'

const S_WARE = 9701, S_BELAGERUNG = 9702

/** ab diesem Rang (Bootsmann) darf man eine Festung gründen */
export const FESTUNG_RANG = 3
export const FESTUNG_PREIS = 5000
/** Ertrag in echter Zeit: Er sammelt sich im Lagerhaus, bis es voll ist — schon das kleinste fasst zwei Tage (Wunsch des
 *  Nutzers: Deckel etwa zwei Tage, nie Nachteile fürs Wegbleiben), jede Ausbaustufe einen halben Tag mehr. Wer länger
 *  wegbleibt, verliert nichts — es kommt nur nicht mehr dazu. (Dieser Deckel ist nur die äußerste Grenze der Rechnung.) */
export const ERTRAG_DECKEL_MS = 96 * 3600 * 1000
/** wer so viele Tage nicht gespielt hat, liegt „im Nebel“ */
export const NEBEL_TAGE = 3
/** nach einem Überfall am Tag d ist die Festung bis einschließlich d + SCHONFRIST geschützt */
export const SCHONFRIST = 1
/** eine neue Festung ist noch im Bau: geschützt bis einschließlich Gründungstag + NEU_SCHUTZ */
export const NEU_SCHUTZ = 2
/** so viel Prozent dessen, was nicht in der Schatzkammer liegt, nimmt ein Sieger mit */
export const BEUTE_ANTEIL = 50
export const VERGELTUNG_TAGE = 7
export const KOPFGELD_TAGE = 7
/** Kopfgeld auf einen Plünderer: so viel Prozent vom Wert seiner Beute */
export const KOPFGELD_ANTEIL = 25

export interface BauInfo { id: BauArt; name: string; max: number; start: number; preis: readonly number[]; text: string }
export const BAUTEN: Record<BauArt, BauInfo> = {
  mauer: { id: 'mauer', name: 'Mauern', max: 5, start: 1, preis: [0, 0, 2500, 6000, 12000, 22000], text: 'Wälle aus Stein und Erde: so viel hält die Festung aus, bevor sie fällt.' },
  tuerme: { id: 'tuerme', name: 'Kanonentürme', max: 5, start: 1, preis: [0, 0, 2000, 5000, 10000, 18000], text: 'Geschütze hinter Brustwehren. Sie feuern in alle Richtungen auf jedes Schiff, das bis auf drei Felder herankommt.' },
  kette: { id: 'kette', name: 'Hafenkette', max: 3, start: 0, preis: [0, 3000, 8000, 16000], text: 'Eine Kette vor der Einfahrt, Pfähle im Wasser: Angreifer finden weniger Platz und haben eine Runde weniger Zeit.' },
  lager: { id: 'lager', name: 'Lagerhaus', max: 5, start: 1, preis: [0, 0, 1500, 4000, 8000, 14000], text: 'Hier sammelt sich, was die Insel erzeugt. Je größer, desto länger kann man wegbleiben.' },
  kammer: { id: 'kammer', name: 'Schatzkammer', max: 5, start: 0, preis: [0, 2000, 4500, 8000, 13000, 20000], text: 'Hinter Stahl und Stein: Was hier liegt, rührt kein Plünderer an.' },
  wache: { id: 'wache', name: 'Wachschiffe', max: 3, start: 0, preis: [0, 4000, 9000, 18000], text: 'Eigene Schiffe vor der Festung stellen jeden Angreifer: ein Schoner, dann zwei, zuletzt eine Brigg mit einem Schoner.' },
}

/** Wert der Wehr im Gefecht */
const MAUER_HP: readonly number[] = [0, 34, 50, 68, 88, 110]
const TURM_KANONEN: readonly number[] = [2, 3, 4, 5, 6, 8]
const WACHEN: readonly (readonly number[])[] = [[], [2], [2, 2], [3, 2]]
/** Lagerhaus und Schatzkammer fassen so viele Stunden Ertrag */
export const LAGER_STUNDEN: readonly number[] = [0, 48, 60, 72, 84, 96]
const KAMMER_STUNDEN: readonly number[] = [0, 8, 14, 20, 26, 32]

/** Was alle über eine Festung wissen dürfen (steht in der öffentlichen Lage des Besitzers). Kurze Namen: die Lage
 *  wird oft geschrieben und von allen gelesen. */
export interface FestungBild {
  /** Insel, Feld, Name */
  i: string; q: number; r: number; n: string
  /** Stufe und Gebiet der Insel, Ware, Gründungstag */
  st: number; ge: number; w: string; seit: number
  /** Stufen der Bauten in der Reihenfolge BAU_ARTEN */
  b: number[]
  /** Schaden: Mauern %, Türme %, verlorene Wachschiffe */
  sd: [number, number, number]
  /** Ware im Lager */
  l: number
  /** verbuchte Berichte, letzter gezählter Überfall, Schutz bis einschließlich */
  g: number; lz: number; sb: number
}

const clamp = (x: number, von: number, bis: number): number => Math.max(von, Math.min(bis, Math.floor(x)))
const stufeBau = (b: readonly number[], art: BauArt): number => clamp(b[BAU_ARTEN.indexOf(art)] ?? 0, 0, BAUTEN[art].max)
export const bauListe = (f: FestungStand): number[] => BAU_ARTEN.map(a => f.bau[a])

// ── Ertrag ──
/** Erzeugung in Hundertstel Einheiten je Stunde: wächst mit der Entfernung von Hamburg und mit dem Ausbau
 *  (je Baustufe ein Zwanzigstel mehr — wo eine Festung wächst, siedeln sich Leute an) */
export function ertragRate(stufe: number, ware: string, b: readonly number[]): number {
  const w = WAREN[wareNr(ware)] ?? WAREN[0]
  let ausbau = 0
  for (const x of b) ausbau += Math.max(0, Math.floor(x))
  return Math.max(1, Math.floor((4 * (2 + clamp(stufe, 0, 9)) * (100 + 5 * ausbau)) / w.preis))
}
export const rateVon = (f: FestungStand): number => ertragRate(f.stufe, f.ware, bauListe(f))
export const lagerKapazitaet = (rate: number, lager: number): number => Math.max(4, Math.floor((rate * LAGER_STUNDEN[clamp(lager, 0, 5)]) / 100))
export const kammerPlaetze = (rate: number, kammer: number): number => Math.floor((rate * KAMMER_STUNDEN[clamp(kammer, 0, 5)]) / 100)
export const lagerVon = (f: FestungStand): number => lagerKapazitaet(rateVon(f), f.bau.lager)
export const sicherVon = (f: FestungStand): number => kammerPlaetze(rateVon(f), f.bau.kammer)

/** Ertrag seit der letzten Abrechnung ins Lager buchen. Höchstens 48 Stunden am Stück, höchstens bis das Lager voll
 *  ist; die angebrochene Einheit geht nicht verloren. Eine zurückgestellte Uhr bringt nichts. Gibt die neuen Einheiten zurück. */
export function erntet(f: FestungStand, jetzt: number): number {
  if (!(jetzt > f.zeit)) return 0
  const rate = rateVon(f)
  const dauer = Math.min(ERTRAG_DECKEL_MS, jetzt - f.zeit)
  const stueck = Math.floor((rate * dauer) / 360000000)
  const neu = Math.min(stueck, Math.max(0, lagerVon(f) - f.lager))
  if (neu < stueck) f.zeit = jetzt                                  // Lager voll: was darüber hinaus entstand, ist verloren
  else f.zeit = jetzt - (dauer - Math.min(dauer, stueck > 0 ? Math.ceil((stueck * 360000000) / rate) : 0))
  f.lager += neu
  return neu
}

// ── Gründung ──
/** die Ware, die eine Insel erzeugt: fest aus ihrem Schlüssel, passend zum Gebiet */
export function inselWare(inselKey: string, gebiet: number): string {
  const f = feldAus(inselKey.slice(1))
  const passt = WAREN.filter(w => w.herkunft.includes(gebiet))
  const liste = passt.length ? passt : WAREN.slice(0, 3)
  return liste[streu(f.q, f.r, S_WARE) % liste.length].id
}

/** Auf welchem Feld der Insel stünde die Festung, wenn das Schiff hier liegt? (Landfeld der Insel neben dem Schiff,
 *  ohne Hafen oder Dorf darauf; bei mehreren das mit der kleinsten Nummer.) null = keines. */
export function festungsFeld(inselKey: string, q: number, r: number): { q: number; r: number } | null {
  let beste: { q: number; r: number } | null = null, bn = Infinity
  for (const [dq, dr] of RICHTUNGEN) {
    const fq = q + dq, fr = r + dr
    if (!istLand(gelaende(fq, fr)) || ortBei(fq, fr)) continue
    const insel = inselVon(fq, fr)
    if (!insel || insel.key !== inselKey) continue
    const n = feldNr(fq, fr)
    if (n < bn) { bn = n; beste = { q: fq, r: fr } }
  }
  return beste
}

/** Inseln neben dem Schiff, auf denen sich eine Festung gründen ließe (getauft und gemeldet, nicht in der Heimatsee) */
export function inselnZumGruenden(s: TiStand): string[] {
  const aus: string[] = []
  for (const [dq, dr] of RICHTUNGEN) {
    const fq = s.q + dq, fr = s.r + dr
    if (!istLand(gelaende(fq, fr))) continue
    const insel = inselVon(fq, fr)
    if (!insel || insel.festland || !insel.key || aus.includes(insel.key)) continue
    const e = s.entdeckt[insel.key]
    if (!e || e.t !== 'i' || !e.gemeldet || e.anspruch === 3) continue
    if (gebietVon(fq, fr) === HEIMATSEE) continue
    if (festungsFeld(insel.key, s.q, s.r)) aus.push(insel.key)
  }
  return aus
}

export type Antwort = { ok: true; text: string } | { ok: false; grund: string }

/** Kann hier eine Festung gegründet werden? (ohne den Blick aufs Netzlaufwerk: ob die Insel noch frei ist) */
export function kannGruenden(s: TiStand, inselKey: string): Antwort {
  if (s.festung) return { ok: false, grund: 'Du hast schon eine Festung.' }
  if (rangVon(s.ruhm) < FESTUNG_RANG) return { ok: false, grund: 'Eine Festung darf erst ein Bootsmann gründen.' }
  if (s.gold < FESTUNG_PREIS) return { ok: false, grund: `Die Gründung kostet ${FESTUNG_PREIS} Gold.` }
  if (s.imHafen !== null) return { ok: false, grund: 'Dafür muss das Schiff vor der Insel ankern, nicht im Hafen.' }
  if (!inselnZumGruenden(s).includes(inselKey)) return { ok: false, grund: 'Hier lässt sich keine Festung bauen: Die Insel muss getauft und gemeldet sein, außerhalb der Heimatsee, und das Schiff muss davor liegen.' }
  return { ok: true, text: '' }
}

/** Die Festung gründen (die Insel ist auf dem Netzlaufwerk schon beansprucht). gebucht: höchste Berichtsnummer, die
 *  es für diesen Kapitän schon gibt — ältere Berichte gehören zu einer früheren Festung. */
export function gruende(spiel: Spiel, inselKey: string, name: string, u: Umwelt, gebucht = 0): Antwort {
  const s = spiel.stand, k = kannGruenden(s, inselKey)
  if (!k.ok) return k
  const feld = festungsFeld(inselKey, s.q, s.r) as { q: number; r: number }
  const gebiet = gebietVon(feld.q, feld.r), e = s.entdeckt[inselKey]
  s.gold -= FESTUNG_PREIS
  s.festung = {
    insel: inselKey, q: feld.q, r: feld.r, name: saubererName(name) || `Fort ${e?.name || 'ohne Namen'}`.slice(0, 28),
    stufe: stufeVon(feld.q, feld.r), gebiet, ware: inselWare(inselKey, gebiet), seit: u.tag,
    bau: { mauer: 1, tuerme: 1, kette: 0, lager: 1, kammer: 0, wache: 0 }, schaden: { mauer: 0, tuerme: 0, wache: 0 },
    lager: 0, zeit: u.jetzt, gebucht, letzterSieg: gebucht, schonBis: u.tag + NEU_SCHUTZ, verteidigt: 0, gepluendert: 0, vergeltung: {}, chronik: [],
  }
  s.ruhm += 100
  s.zug++
  return { ok: true, text: `Der Grundstein ist gelegt. Drei Tage lang wird gebaut – so lange kann niemand angreifen. (+100 Ruhm)` }
}
export const saubererName = (n: string): string => n.replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28)

/** Festung aufgeben: Insel und Bauten sind verloren, die Ware im Lager auch */
export function gibAuf(spiel: Spiel): Antwort {
  const s = spiel.stand
  if (!s.festung) return { ok: false, grund: 'Du hast keine Festung.' }
  s.festung = null
  s.zug++
  return { ok: true, text: 'Die Flagge wird eingeholt. Die Insel ist wieder frei.' }
}

// ── Ausbau und Reparatur (aus der Ferne: ein Bautrupp wird beauftragt) ──
export function baupreis(f: FestungStand, art: BauArt): number | null {
  const ziel = f.bau[art] + 1, b = BAUTEN[art]
  return ziel > b.max ? null : b.preis[ziel]
}
export function baue(spiel: Spiel, art: BauArt, u: Umwelt): Antwort {
  const s = spiel.stand, f = s.festung
  if (!f) return { ok: false, grund: 'Du hast keine Festung.' }
  erntet(f, u.jetzt)                                       // (der Ausbau ändert den Ertrag: erst bis jetzt abrechnen)
  const p = baupreis(f, art)
  if (p === null) return { ok: false, grund: 'Weiter lässt sich das nicht ausbauen.' }
  if (s.gold < p) return { ok: false, grund: `Das kostet ${p} Gold.` }
  s.gold -= p
  f.bau[art]++
  s.ruhm += 10 * f.bau[art]
  s.zug++
  return { ok: true, text: `${BAUTEN[art].name}: Stufe ${f.bau[art]}.` }
}
export function reparaturPreis(f: FestungStand): number {
  const { mauer, tuerme } = f.bau, sd = f.schaden
  return Math.floor((sd.mauer * (800 + 700 * mauer) + sd.tuerme * (600 + 600 * tuerme)) / 100) + sd.wache * 1500
}
export function repariere(spiel: Spiel): Antwort {
  const s = spiel.stand, f = s.festung
  if (!f) return { ok: false, grund: 'Du hast keine Festung.' }
  const p = reparaturPreis(f)
  if (p <= 0) return { ok: false, grund: 'Es gibt nichts auszubessern.' }
  if (s.gold < p) return { ok: false, grund: `Die Reparatur kostet ${p} Gold.` }
  s.gold -= p
  f.schaden = { mauer: 0, tuerme: 0, wache: 0 }
  s.zug++
  return { ok: true, text: 'Mauern geflickt, Geschütze neu aufgestellt, die Wachschiffe liegen wieder vor Anker.' }
}

/** Liegt das Schiff vor der eigenen Festung? (auch aus einem Hafen gleich daneben) */
export const vorDerFestung = (s: TiStand): boolean => !!s.festung && abstand(s.q, s.r, s.festung.q, s.festung.r) <= 1

/** Ware aus dem Lager an Bord nehmen (nur vor der Festung, so viel in den Laderaum passt) */
export function hole(spiel: Spiel, u: Umwelt): Antwort {
  const s = spiel.stand, f = s.festung
  if (!f || !vorDerFestung(s)) return { ok: false, grund: 'Dafür muss das Schiff vor der Festung liegen.' }
  erntet(f, u.jetzt)
  const platz = Math.max(0, werteVon(s).laderaum - ladungMenge(s)), n = Math.min(platz, f.lager)
  if (n <= 0) return { ok: false, grund: f.lager ? 'Der Laderaum ist voll.' : 'Das Lager ist leer.' }
  f.lager -= n
  s.ladung[f.ware] = (s.ladung[f.ware] ?? 0) + n
  s.zug++
  const w = WAREN[wareNr(f.ware)]
  return { ok: true, text: `${n} ${w?.name ?? f.ware} an Bord.` }
}

// ── was die anderen sehen ──
export function bildVon(f: FestungStand): FestungBild {
  return { i: f.insel, q: f.q, r: f.r, n: f.name, st: f.stufe, ge: f.gebiet, w: f.ware, seit: f.seit, b: bauListe(f), sd: [f.schaden.mauer, f.schaden.tuerme, f.schaden.wache], l: f.lager, g: f.gebucht, lz: f.letzterSieg, sb: f.schonBis }
}

/** Ein öffentliches Bild in eine sichere Form bringen (es stammt aus der Datei eines Kollegen). null = unbrauchbar. */
export function saubereBild(roh: unknown): FestungBild | null {
  if (!roh || typeof roh !== 'object') return null
  const d = roh as Record<string, unknown>
  const z = (x: unknown, von: number, bis: number, ersatz = von): number => (typeof x === 'number' && Number.isFinite(x) ? clamp(x, von, bis) : ersatz)
  if (typeof d.i !== 'string' || !/^i-?\d{1,5},-?\d{1,5}$/.test(d.i) || !Array.isArray(d.b) || !Array.isArray(d.sd)) return null
  const b = BAU_ARTEN.map((a, i) => z((d.b as unknown[])[i], a === 'mauer' || a === 'lager' ? 1 : 0, BAUTEN[a].max))
  const sd = d.sd as unknown[]
  return {
    i: d.i, q: z(d.q, -30000, 30000, 0), r: z(d.r, -30000, 30000, 0), n: typeof d.n === 'string' ? d.n.slice(0, 28) : 'Festung',
    st: z(d.st, 0, 9), ge: z(d.ge, 0, 9), w: typeof d.w === 'string' && wareNr(d.w) >= 0 ? d.w : 'salz', seit: z(d.seit, 0, 1e6),
    b, sd: [z(sd[0], 0, 100), z(sd[1], 0, 100), z(sd[2], 0, 3)], l: z(d.l, 0, 1e6), g: z(d.g, 0, 1e9), lz: z(d.lz, 0, 1e9), sb: z(d.sb, 0, 1e6),
  }
}

export const bildRate = (bild: FestungBild): number => ertragRate(bild.st, bild.w, bild.b)
/** so viel lässt sich beim Überfall aus dem Lager holen (vor der Grenze durch den eigenen Laderaum) */
export function beuteVon(bild: FestungBild): number {
  const sicher = kammerPlaetze(bildRate(bild), stufeBau(bild.b, 'kammer'))
  return Math.floor((Math.max(0, bild.l - sicher) * BEUTE_ANTEIL) / 100)
}

export type Schutz = 'nebel' | 'bau' | 'schonfrist' | null
/** Ist die Festung heute geschützt? lageTag = an dem Tag hat der Besitzer zuletzt gespielt */
export function schutzVon(bild: FestungBild, lageTag: number, heute: number): Schutz {
  if (heute - lageTag >= NEBEL_TAGE) return 'nebel'
  if (heute <= bild.seit + NEU_SCHUTZ) return 'bau'
  if (heute <= bild.sb) return 'schonfrist'
  return null
}

// ── Belagerung ──
/** Die Verteidiger: die Festung selbst (Mauern = Rumpf, Türme = Kanonen) und die Wachschiffe */
export function festungSchiffe(bild: FestungBild): SchiffStart[] {
  const m = Math.max(1, stufeBau(bild.b, 'mauer')), t = stufeBau(bild.b, 'tuerme'), w = stufeBau(bild.b, 'wache')
  const hp = MAUER_HP[m]
  const aus: SchiffStart[] = [{
    id: 10, seite: 1, name: bild.n || 'Festung', art: 'fort', klasse: 0, rumpf: Math.max(1, Math.floor((hp * (100 - bild.sd[0])) / 100)), rumpfMax: hp,
    crewMax: 1, kanonen: Math.max(1, Math.floor((TURM_KANONEN[t] * (100 - bild.sd[1])) / 100)), bewegung: 0, enter: 0, drehbassen: false, navigator: false, arzt: 0, mut: 1, staerke: 0,
  }]
  const wachen = WACHEN[w].slice(0, Math.max(0, WACHEN[w].length - bild.sd[2]))
  wachen.forEach((kl, i) => {
    const k = KLASSEN[kl]
    aus.push({ id: 11 + i, seite: 1, name: `Wache ${i ? 'II' : 'I'} von ${bild.n || 'der Festung'}`.slice(0, 40), art: 'segler', klasse: kl, rumpf: k.rumpf, rumpfMax: k.rumpf, crewMax: k.crew, kanonen: k.kanonen, bewegung: k.fahrt, enter: 0, drehbassen: w >= 2, navigator: false, arzt: 0, mut: 1, staerke: 0 })
  })
  return aus
}

/** Aufstellung einer Belagerung: eigene Schiffe gegen Festung und Wachschiffe. Die Kette bringt Pfähle (Felsen) und
 *  nimmt dem Angreifer je Stufe eine Runde. */
export function belagerungStart(spiel: Spiel, bild: FestungBild, u: Umwelt): KampfStart {
  const s = spiel.stand, saat = streu3(s.saat, s.zug, 97, S_BELAGERUNG), kette = stufeBau(bild.b, 'kette')
  return { saat, wind: windIn(bild.ge, u.tag), felsen: Math.min(8, 2 + kette + (saat % 2)), maxRunden: 12 - kette, ersterZug: 0, nahe: false, schiffe: [...eigeneSchiffe(s), ...festungSchiffe(bild)] }
}

export const festungGegner = (u: string, bild: FestungBild): Gegner => ({ id: `f:${u}`, art: 'festung', q: bild.q, r: bild.r, stufe: Math.max(1, bild.st), saat: streu(bild.q, bild.r, S_BELAGERUNG), u, n: bild.n })

/** Was der Angreifer beim Beginn festhält. bild: der Stand der Festung mit allen schon zählenden Berichten (siehe
 *  wendeAn); veroeffentlicht: g, sb, lz aus der Lage des Besitzers (daran rechnen beide dieselbe Reihenfolge). */
export function zielVon(s: TiStand, u: string, kn: string, bild: FestungBild, veroeffentlicht: { g: number; sb: number; lz: number }, basis: number, kg: number, heute: number): FestungsZiel {
  const platz = Math.max(0, werteVon(s).laderaum - ladungMenge(s))
  const wehr = stufeBau(bild.b, 'mauer') + stufeBau(bild.b, 'tuerme') + stufeBau(bild.b, 'wache')
  return {
    u, kn, n: bild.n, i: bild.i, g0: veroeffentlicht.g, sb0: veroeffentlicht.sb, lz0: veroeffentlicht.lz, basis,
    w: bild.w, beute: Math.min(beuteVon(bild), platz), kg, vg: (s.festung?.vergeltung[u] ?? -1) >= heute,
    stufe: bild.st, wehr, wachen: festungSchiffe(bild).length - 1, rumpf: s.rumpf, geleit: s.geleit.map(g => g.rumpf),
  }
}

/** Die Belagerung beginnen: als laufender Kampf vermerkt; heute greift man diese Festung nicht noch einmal an */
export function beginneBelagerung(spiel: Spiel, ziel: FestungsZiel, bild: FestungBild, u: Umwelt): Kampf {
  const s = spiel.stand, start = belagerungStart(spiel, bild, u), g = festungGegner(ziel.u, bild)
  s.kampf.laufend = { art: 'festung', gegner: g, akte: { start, aktionen: [] }, ziel }
  merkeErledigt(s, g.id, u.tag)
  s.zug++
  return neuerKampf(start)
}

export interface BelagerungFolge { ausgang: KampfAusgang; titel: string; text: string; zeilen: string[]; umkehr: boolean; offen: boolean }

/** Nach der Belagerung. Niederlage, Flucht, Rückzug: gilt sofort (wie gegen Piraten). Sieg: Die Beute gibt es erst,
 *  wenn der Bericht auf dem Netzlaufwerk liegt (stelleZu) — dort entscheidet sich, ob ein anderer schneller war. */
export function belagerungEnde(spiel: Spiel, k: Kampf, u: Umwelt): BelagerungFolge {
  const s = spiel.stand, l = s.kampf.laufend, w = werteVon(s), b = bilanz(k), zeilen: string[] = []
  const ziel = l?.ziel
  s.kampf.laufend = null
  if (!ziel) { s.zug++; return { ausgang: 'remis', titel: 'Abgebrochen', text: 'Die Belagerung lässt sich nicht mehr zuordnen. Sie bleibt ohne Folgen.', zeilen, umkehr: false, offen: false } }
  for (const [id, rumpf] of Object.entries(b.geleit)) { const i = Number(id) - 1; if (s.geleit[i]) { s.geleit[i].rumpf = rumpf; if (rumpf <= 0) zeilen.push(`Die „${s.geleit[i].name}“ ist kampfunfähig und muss in die Werft.`) } }
  const wv = b.bezwungen.filter(x => x.art === 'segler').length
  const akte: KampfAkte = { start: k.start, aktionen: k.aktionen.slice() }
  s.kampf.bericht = { ziel, aus: b.ausgang, akte, tag: u.tag, wv }
  s.zug++
  if (b.ausgang === 'sieg') {
    s.rumpf = Math.max(1, Math.min(b.rumpf, w.rumpfMax))
    const ware = WAREN[wareNr(ziel.w)]
    zeilen.unshift(ziel.beute > 0 ? `Im Lager: ${ziel.beute} ${ware?.name ?? ziel.w} für dich` : 'Das Lager ist leer – es bleibt der Ruhm')
    return { ausgang: 'sieg', titel: 'Die Festung ist genommen!', text: `Die Flagge von Kpt. ${ziel.kn || ziel.u} sinkt. Sobald der Bericht bei der Admiralität ist, wird die Beute verbucht – war ein anderer Angreifer schneller, gilt dein Gefecht als Übung.`, zeilen, umkehr: false, offen: true }
  }
  let titel: string, text: string, umkehr = false
  if (b.ausgang === 'niederlage') {
    const gold = Math.floor(s.gold / 10)
    s.gold -= gold
    kehreUm(spiel)
    s.rumpf = Math.max(1, Math.floor(w.rumpfMax / 10))
    s.kampf.niederlagen++
    umkehr = true
    titel = 'Zurückgeschlagen'
    text = 'Die Geschütze der Festung haben ganze Arbeit getan. Mit leckem Rumpf schleppt die Mannschaft das Schiff in den letzten Hafen.'
    zeilen.push(`−${gold} Gold`, 'Die halbe Ladung ist verloren', `Rumpf schwer beschädigt (${s.rumpf}/${w.rumpfMax}) – die Werft bessert ihn aus`)
  } else {
    s.rumpf = Math.max(1, Math.min(b.rumpf, w.rumpfMax))
    if (b.ausgang === 'flucht') { s.kampf.fluchten++; titel = 'Abgedreht'; text = 'Unter vollen Segeln aus der Reichweite der Geschütze. Für heute ist diese Festung kein Ziel mehr.' }
    else { titel = 'Die Festung hält stand'; text = 'Es wird dunkel, bevor die Mauern fallen. Die Besatzung flickt über Nacht, was du zerschossen hast.' }
  }
  pushChronik(s, u, ziel, b.ausgang, zeilen, akte)
  return { ausgang: b.ausgang, titel, text, zeilen, umkehr, offen: false }
}

function pushChronik(s: TiStand, u: Umwelt, ziel: FestungsZiel, aus: KampfAusgang, zeilen: string[], akte: KampfAkte): void {
  s.kampf.nr++
  const g: Gegner = { id: `f:${ziel.u}`, art: 'festung', q: 0, r: 0, stufe: Math.max(1, ziel.stufe), saat: 0, u: ziel.u, n: ziel.n }
  s.kampf.chronik.push({ nr: s.kampf.nr, tag: u.tag, art: 'festung', gegner: g, titel: `die Festung „${ziel.n}“ von Kpt. ${ziel.kn || ziel.u}`, ausgang: aus, zeilen: zeilen.slice(0, 12), akte })
  while (s.kampf.chronik.length > CHRONIK_MAX) s.kampf.chronik.shift()
}

// ── Berichte: die gemeinsame Rechnung von Angreifer und Verteidiger ──
/** ein Angriffsbericht, wie er auf dem Netzlaufwerk liegt (terra/angriffe/<verteidiger>/<n>.json) */
export interface AngriffsBericht {
  n: number
  /** Verteidiger, Angreifer (Benutzer), Kapitänsname des Angreifers, Insel der Festung */
  v: string; a: string; an: string; i: string
  tag: number
  /** höchste Berichtsnummer, die der Angreifer beim Beginn kannte */
  basis: number
  /** Ausgang aus Sicht des Angreifers */
  aus: KampfAusgang
  /** Beute (Einheiten der Ware), verlorene Wachschiffe, Kopfgeld, Vergeltung */
  beute: number; wv: number; kg: number; vg: boolean
  akte: KampfAkte
}
export interface BerichtKurz { n: number; aus: KampfAusgang; basis: number; tag: number }

/** Welche Überfälle zählen? Der Reihe nach (Nummern aufsteigend, alle über der verbuchten): Ein Sieg zählt nur, wenn
 *  die Festung an dem Tag nicht geschützt war UND seit der Grundlage des Angreifers kein anderer Sieg gezählt hat —
 *  sonst war ein anderer schneller, und das Gefecht gilt als Übung. */
export function werteAus(sb: number, lz: number, berichte: readonly BerichtKurz[]): boolean[] {
  let schutz = sb, letzter = lz
  return berichte.map(b => {
    if (b.aus !== 'sieg' || b.tag <= schutz || letzter > b.basis) return false
    schutz = Math.max(schutz, b.tag + SCHONFRIST)
    letzter = b.n
    return true
  })
}

/** Ein zählender Überfall, angewandt auf das Bild der Festung (Sicht des nächsten Angreifers) */
export function wendeAn(bild: FestungBild, b: BerichtKurz & { beute: number; wv: number }): FestungBild {
  const w = stufeBau(bild.b, 'wache')
  return { ...bild, l: bild.l - Math.min(bild.l, b.beute), sd: [Math.max(bild.sd[0], 50), Math.max(bild.sd[1], 50), Math.min(WACHEN[w].length, bild.sd[2] + b.wv)], sb: Math.max(bild.sb, b.tag + SCHONFRIST), lz: b.n }
}

/** Ein Bericht über einen Angriff auf meine Festung wird verbucht (Verteidiger). Gibt die Zeile für die Hafenzeitung
 *  zurück. heute: um zu sagen, wie lange die Schonfrist noch gilt (verbucht wird erst, wenn der Besitzer spielt). */
export function bucheBericht(spiel: Spiel, b: AngriffsBericht, zaehlt: boolean, heute = b.tag): string | null {
  const s = spiel.stand, f = s.festung
  if (!f || b.n <= f.gebucht) return null
  f.gebucht = b.n
  s.zug++
  if (b.i !== f.insel) return null                             // gilt einer früheren Festung
  const ware = WAREN[wareNr(f.ware)]?.name ?? f.ware
  if (zaehlt) {
    const weg = Math.min(f.lager, b.beute)
    f.lager -= weg
    f.schaden = { mauer: Math.max(f.schaden.mauer, 50), tuerme: Math.max(f.schaden.tuerme, 50), wache: Math.min(WACHEN[f.bau.wache].length, f.schaden.wache + b.wv) }
    f.schonBis = Math.max(f.schonBis, b.tag + SCHONFRIST)
    f.letzterSieg = b.n
    f.gepluendert++
    f.vergeltung[b.a] = b.tag + VERGELTUNG_TAGE
    // das Kopfgeld, das der Angreifer bekommen hat, ist abgegolten (nur dieses — später ausgesetztes bleibt stehen)
    if (b.kg > 0) {
      let rest = b.kg
      s.kampf.gesucht = s.kampf.gesucht.filter(([g]) => { if (g > 0 && g <= rest) { rest -= g; return false } return true })
    }
    neueChronik(f, b, true, weg)
    const frist = f.schonBis > heute ? (f.schonBis === heute + 1 ? 'bis morgen Abend gilt die Schonfrist' : `die Schonfrist gilt noch ${f.schonBis - heute} Tage`) : f.schonBis === heute ? 'bis heute Abend gilt die Schonfrist' : 'die Schonfrist ist schon vorbei'
    return `Kpt. ${b.an || b.a} hat deine Festung „${f.name}“ überfallen${weg ? ` und ${weg} ${ware} erbeutet` : ''}. Die Mauern sind beschädigt – ${frist}. Eine Vergeltung binnen ${VERGELTUNG_TAGE} Tagen belohnt die Admiralität.`
  }
  if (b.aus === 'sieg') return null                             // ein anderer war schneller: Übung, nichts geschehen
  f.verteidigt++
  const ruhm = 20 * (1 + f.stufe)
  s.ruhm += ruhm
  neueChronik(f, b, false, 0)
  return `Deine Festung „${f.name}“ hat Kpt. ${b.an || b.a} zurückgeschlagen. (+${ruhm} Ruhm)`
}
function neueChronik(f: FestungStand, b: AngriffsBericht, zaehlt: boolean, beute: number): void {
  f.chronik.push({ n: b.n, tag: b.tag, von: b.a, vn: b.an, aus: b.aus, beute, zaehlt, akte: b.akte })
  while (f.chronik.length > FESTUNG_CHRONIK_MAX) f.chronik.shift()
}

/** Der Bericht des Angreifers liegt auf dem Netzlaufwerk (bzw. das Gefecht gilt als Übung): jetzt abrechnen.
 *  kennung: '<verteidiger>/<nummer>' des zählenden Berichts — steht er schon unter „zugestellt“ (dieser Stand ist
 *  älter als einer, der die Beute längst bekommen hat), wird nur abgeschlossen, nichts ausgezahlt.
 *  Gibt die Zeilen für die Meldung zurück. */
export function berichtZugestellt(spiel: Spiel, zaehlt: boolean, u: Umwelt, kennung = ''): { titel: string; zeilen: string[] } {
  const s = spiel.stand, o = s.kampf.bericht as OffenerBericht
  s.kampf.bericht = null
  s.zug++
  if (o.aus !== 'sieg') return { titel: '', zeilen: [] }       // (die Folgen galten schon sofort)
  const z = o.ziel, zeilen: string[] = []
  if (zaehlt && kennung && s.kampf.zugestellt.includes(kennung)) return { titel: 'Schon verbucht', zeilen: ['Die Beute aus diesem Überfall ist schon verbucht – auf einem neueren Stand dieses Spiels.'] }
  if (zaehlt && kennung) s.kampf.zugestellt = [...s.kampf.zugestellt, kennung].slice(-ZUGESTELLT_MAX)
  if (!zaehlt) {
    // ein anderer war schneller: Das Gefecht gilt als Übung — keine Beute, aber auch der Schaden am Schiff ist vergessen
    s.rumpf = Math.max(s.rumpf, z.rumpf)
    z.geleit.forEach((r, i) => { if (s.geleit[i]) s.geleit[i].rumpf = Math.max(s.geleit[i].rumpf, r) })
    zeilen.push('Ein anderer Kapitän war schneller – dein Gefecht gilt als Übung. Die Schäden am Schiff sind behoben.')
    pushChronik(s, u, z, 'remis', ['Übung: ein anderer war schneller'], o.akte)
    return { titel: 'Nur eine Übung', zeilen }
  }
  const ware = WAREN[wareNr(z.w)] ?? WAREN[0]
  const platz = Math.max(0, werteVon(s).laderaum - ladungMenge(s)), anBord = Math.min(platz, z.beute), rest = z.beute - anBord
  if (anBord > 0) { s.ladung[ware.id] = (s.ladung[ware.id] ?? 0) + anBord; zeilen.push(`+${anBord} ${ware.name}`) }
  let gold = rest * ware.preis
  if (rest > 0) zeilen.push(`${rest} ${ware.name} passten nicht mehr an Bord – der Hafenmeister zahlt ${rest * ware.preis} Gold dafür`)
  if (z.kg > 0) { gold += z.kg; zeilen.push(`+${z.kg} Gold Kopfgeld von der Admiralität`) }
  if (z.vg) { const v = Math.floor((z.beute * ware.preis) / 2) + 50 * (1 + z.stufe); gold += v; zeilen.push(`+${v} Gold: Die Admiralität belohnt die Vergeltung`); if (s.festung) delete s.festung.vergeltung[z.u] }
  s.gold += gold
  const ruhm = 30 * (1 + z.stufe) + 10 * z.wehr
  s.ruhm += ruhm
  zeilen.push(`+${ruhm} Ruhm`)
  s.kampf.siege++
  s.kampf.versenkt.festung = (s.kampf.versenkt.festung ?? 0) + 1
  const kopf = Math.floor((z.beute * ware.preis * KOPFGELD_ANTEIL) / 100)
  if (kopf > 0) { s.kampf.gesucht = [...s.kampf.gesucht.filter(x => x[1] >= u.tag), [kopf, u.tag + KOPFGELD_TAGE] as [number, number]].slice(-20); zeilen.push(`Die Admiralität setzt ${kopf} Gold Kopfgeld auf dich aus (${KOPFGELD_TAGE} Tage).`) }
  pushChronik(s, u, z, 'sieg', zeilen, o.akte)
  return { titel: 'Beute verbucht', zeilen }
}

/** Kopfgeld auf mich, das heute gilt: [Gold, bis Tag] (0 = keins) */
export function gesuchtVon(s: TiStand, heute: number): [number, number] {
  let gold = 0, bis = 0
  for (const [g, b] of s.kampf.gesucht) if (b >= heute) { gold += g; bis = Math.max(bis, b) }
  return [gold, bis]
}
