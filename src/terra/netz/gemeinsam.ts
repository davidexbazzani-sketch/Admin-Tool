// Terra Incognita — die gemeinsame Welt auf dem Netzlaufwerk (Ordner terra/).
//
// Grundsätze:
//  • Jeder Spieler schreibt NUR seine eigenen Dateien (terra/kapitaene/<benutzer>.<art>.<nummer>.json). Sie sind ein
//    reines Abbild seines lokalen Spielstands — nie umgekehrt. Die Nummer steht im Dateinamen: Ein Abgleich ist ein
//    Blick ins Verzeichnis; gelesen wird nur, was eine höhere Nummer hat. Jede Nummer wird exklusiv angelegt: Zwei
//    PCs desselben Benutzers können sich nichts gegenseitig überschreiben.
//  • Wer eine Entdeckung als Erster gemeldet hat, entscheidet der Dateiserver: Die Meldung legt die Datei des Ortes
//    exklusiv an (terra/funde/…). Das gelingt nur einem. PC-Uhren spielen keine Rolle.
//  • Geschenke stehen nummeriert im öffentlichen „Buch“ des Absenders (stamm); der Empfänger verbucht alles über
//    seiner höchsten verbuchten Nummer und quittiert sie in seinem eigenen Buch. DAS BUCH GILT: Bevor dieser PC etwas
//    verbucht oder veröffentlicht, muss er die neueste Fassung seines eigenen Buchs kennen (buchRev). Liegt lokal ein
//    älterer Stand (zurückgespielt, anderer PC, Sicherung), wird er erst nachgezogen — so zählt kein Geschenk doppelt
//    und keines kommt zurück.
//  • Öffentlich sind nur Kalendertage, nie Uhrzeiten.
//  • Alles läuft durch die Schleuse (schleuse.ts) und nur, solange der Raum offen ist.
import { create } from 'zustand'
import { BUND_MAX, BUND_PREIS, BUND_RANG, bundKey, bundLageVon, bundWandel, buendeAus, sauberesBund, type Bund, type BundLage } from '../kern/buendnis'
import { bildVon, gesuchtVon, saubereBild, type FestungBild } from '../kern/festung'
import { duelleAbgleich, vergissDuelle } from './duell'
import { festungenAbgleich, vergissFestungen } from './festungen'
import { wocheVon } from '../kern/piraten'
import { karteZuText } from '../kern/nebel'
import { rangVon } from '../kern/schiff'
import { anspruchErgebnis, type Spiel } from '../kern/spiel'
import { kuerzeDuelle, ZUGESTELLT_MAX, type TiStand } from '../kern/stand'
import { TAGES_FASSUNG, tagesArt } from '../kern/tagesfahrt'
import { geraeteKennung, umwelt, useTerra } from '../speicher'
import { wochentag } from '../zeit'
import { entschluessle, oeffne, PV, versiegle, verschluessle } from './huelle'
import { netzLegeAn, netzLies, netzLiesGenau, netzListe, netzLoesche, netzSchreibe } from './schleuse'

const KAPITAENE = 'terra/kapitaene', FUNDE = 'terra/funde', TAGE = `terra/tage/f${TAGES_FASSUNG}`, SICHERUNG = 'terra/sicherung', AUFSICHT = 'terra/aufsicht.json'
/** Stufe 2: Gründungsurkunden der Bündnisse (eine je Name, exklusiv angelegt) und „bezwungen“-Siegel des großen Gegners (eines je Woche) */
const BUENDE = 'terra/buende', GROSS = 'terra/gross'
/** Gold je Punkt Lebensbalken, das der große Gegner nach Anteil am Schaden hergibt (nicht bezwungen: zwei Fünftel davon) */
export const GROSS_LOHN = 25
export const sicher = (s: string): string => (s || '').toLowerCase().replace(/[^a-z0-9._-]/g, '_')
/** so viele Geschenke dürfen gleichzeitig unterwegs (noch nicht verbucht) sein */
export const GABEN_OFFEN_MAX = 40

export interface LageInhalt {
  n: string; a: string; sn: string; schiff: number; rang: number; ruhm: number; fl: [number, number, number, number]
  /** zuletzt gespielt (Tagesnummer), Gerät, Zugzähler */
  tag: number; geraet: string; zug: number
  z: { funde: number; erst: number; felder: number; weit: number; med: [number, number, number]; atlas: number }
  // ── Stufe 2 (keine Pflichtfelder: ältere Tools lesen darüber hinweg) ──
  /** Bündnis: Gründer (mit Mitgliederliste), Mitglied oder Antrag */
  b?: BundLage
  /** großer Gegner: [Woche, Schaden, Anteil am Lebensbalken, Kämpfe] — diese und die vorige Woche */
  gr?: [number, number, number, number]
  gp?: [number, number, number, number]
  /** Gefechte: [Siege, bezwungene Gegner] */
  kz?: [number, number]
  // ── Stufe 3 ──
  /** die Festung (was alle wissen dürfen: Bauten, Schaden, Lager, verbuchte Berichte, Schutz) */
  fe?: FestungBild
  /** Kopfgeld auf diesen Kapitän: [Gold, gilt bis Tag] */
  kg?: [number, number]
}
/** der große Gegner dieser Woche, wie ihn alle Lagen zusammen ergeben */
export interface GrossAnzeige {
  w: number
  schaden: number
  hp: number
  teilnehmer: { u: string; n: string; schaden: number; hp: number; ich: boolean }[]
  besiegt: boolean
  /** wer den „bezwungen“-Vermerk angelegt hat, und wann */
  besiegtVon?: string
  besiegtTag?: number
}
export interface StammInhalt {
  /** Kennung des Spiels (Startwert des Spielstands): unterscheidet einen Neuanfang von einem zurückgespielten Stand */
  spiel: number
  /** letzte Erstmeldungen: [Schlüssel, Art, Name, Tag] */
  funde: [string, string, string, number][]
  /** ausgesetzte Flaschenpost: [Kennung, q, r, Text, Tag] */
  flaschen: [string, number, number, string, number][]
  /** Geschenke je Empfänger: höchste Nummer, verschenktes Gold insgesamt, noch nicht quittierte Einträge [Nummer, was, Menge, Tag] */
  gaben: Record<string, { nr: number; gold: number; offen: [number, string, number, number][] }>
  /** höchste verbuchte Geschenk-Nummer je Absender */
  gebucht: Record<string, number>
  /** Stufe 2: Wochen, in denen der Anteil am großen Gegner schon ausgezahlt ist (das Buch gilt: nie zweimal) */
  gb?: number[]
  /** Stufe 3: verbuchte Duelle, die Gold bewegt haben [Kennung, Gold (+ gewonnen, − verloren)] — ein älterer Stand
   *  zahlt einen verlorenen Einsatz nach und bekommt einen gewonnenen nicht noch einmal */
  dz?: [string, number][]
  /** Stufe 3: offene Duelle [Kennung, Einsatz, Rolle, Gegner, Tag] — ihr Pfand ist aus der Kasse; ein älterer Stand
   *  übernimmt sie (samt Pfand) und verbucht sie, wenn sie entschieden sind */
  do?: [string, number, 'a' | 'b', string, number][]
  /** Stufe 3: zugestellte Angriffsberichte mit verbuchter Beute ('<verteidiger>/<nummer>') */
  fz?: string[]
}
export interface Kapitaen extends LageInhalt { u: string; ich: boolean }
export interface FremdFund { u: string; von: string; key: string; art: string; name: string; tag: number }
export interface FremdFlasche { id: string; u: string; von: string; q: number; r: number; text: string; tag: number }
export interface Aufsicht { namenAus: string[]; flaschenAus: string[] }
export interface TagesErgebnis { u: string; n: string; art: string; p: number; z: number; m: number }

interface GemeinsamStore {
  /** null = noch nicht versucht */
  verbunden: boolean | null
  kapitaene: Kapitaen[]
  funde: FremdFund[]
  flaschen: FremdFlasche[]
  aufsicht: Aufsicht
  /** auf dem Netzlaufwerk liegt ein neuerer Stand von einem anderen Gerät — dieser PC veröffentlicht und verbucht nichts */
  fremderStand: boolean
  /** die eigenen Dateien stammen von einer neueren Tool-Version (anderer PC) — dieser PC veröffentlicht und verbucht nichts */
  veraltet: boolean
  /** Rückmeldungen für die Oberfläche (Erstentdecker, Geschenke …) */
  meldungen: string[]
  nimmMeldungen: () => string[]
  /** Stufe 2 */
  buende: Bund[]
  gross: GrossAnzeige | null
  /** Entdeckungen der Bündnis-Kameraden, die ich noch nicht kenne (stehen als Vermerk auf der Karte) */
  bundHinweise: FremdFund[]
}

export const useGemeinsam = create<GemeinsamStore>((set, get) => ({
  verbunden: null, kapitaene: [], funde: [], flaschen: [], aufsicht: { namenAus: [], flaschenAus: [] }, fremderStand: false, veraltet: false, meldungen: [],
  nimmMeldungen: () => { const m = get().meldungen; if (m.length) set({ meldungen: [] }); return m },
  buende: [], gross: null, bundHinweise: [],
}))
export const melde = (text: string): void => useGemeinsam.setState(s => ({ meldungen: [...s.meldungen, text] }))

// ── Abbild des eigenen Spielstands ──
export function lageVon(s: TiStand, anzeigeName: string, tag: number): LageInhalt {
  let funde = 0, erst = 0
  for (const e of Object.values(s.entdeckt)) { if (e.anspruch === 3) continue; funde++; if (e.anspruch === 1) erst++ }
  const lage: LageInhalt = {
    n: s.kapitaen, a: anzeigeName, sn: s.schiffName, schiff: s.klasse, rang: rangVon(s.ruhm), ruhm: s.ruhm, fl: s.flagge, tag, geraet: geraeteKennung(), zug: s.zug,
    z: { funde, erst, felder: s.statistik.felder, weit: s.statistik.weiteste, med: s.medaillen, atlas: s.atlas.tiere.length + s.atlas.kurios.length + s.atlas.legende },
  }
  const b = bundLageVon(s.bund)
  if (b) lage.b = b
  if (s.gross.w && s.gross.kaempfe) lage.gr = [s.gross.w, s.gross.schaden, s.gross.hp, s.gross.kaempfe]
  if (s.gross.vorher) lage.gp = s.gross.vorher
  let versenkt = 0
  for (const n of Object.values(s.kampf.versenkt)) versenkt += n
  if (s.kampf.siege || versenkt) lage.kz = [s.kampf.siege, versenkt]
  if (s.festung) lage.fe = bildVon(s.festung)
  const kg = gesuchtVon(s, tag)
  if (kg[0] > 0) lage.kg = kg
  return lage
}
export function stammVon(s: TiStand): StammInhalt {
  const erste = Object.entries(s.entdeckt).filter(([, e]) => e.anspruch === 1).sort((a, b) => (b[1].seit ?? b[1].tag) - (a[1].seit ?? a[1].tag)).slice(0, 40)
  // jeder Empfänger, der je etwas bekam, bleibt im Buch stehen (Nummer und Summe) — auch wenn alles quittiert ist
  const gaben: StammInhalt['gaben'] = {}
  for (const [an, nr] of Object.entries(s.gaben.raus)) gaben[an] = { nr, gold: s.gaben.gold[an] ?? 0, offen: [] }
  for (const g of s.gabenOffen) (gaben[g.an] ??= { nr: g.nr, gold: s.gaben.gold[g.an] ?? 0, offen: [] }).offen.push([g.nr, g.was, g.menge, g.tag])
  const dz = duellBuch(s), offen = s.duelle.filter(d => !d.fertig)
  return {
    spiel: s.saat,
    funde: erste.map(([k, e]) => [k, e.art, e.name ?? '', e.seit ?? e.tag]),
    flaschen: s.flaschenRaus.map(f => [f.id, f.q, f.r, f.text, f.tag]),
    gaben, gebucht: { ...s.gaben.rein },
    ...(s.gross.bezahlt.length ? { gb: s.gross.bezahlt.slice(-8) } : {}),
    ...(dz.length ? { dz } : {}),
    ...(offen.length ? { do: offen.map(d => [d.id, d.es ? d.ein : 0, d.rolle, d.gegner, d.tag] as [string, number, 'a' | 'b', string, number]) } : {}),
    ...(s.kampf.zugestellt.length ? { fz: s.kampf.zugestellt.slice() } : {}),
  }
}
/** verbuchte Duelle, die Gold bewegt haben: [Kennung, + gewonnen / − verloren] */
const duellBuch = (s: TiStand): [string, number][] => s.duelle.filter(d => d.fertig && d.ein > 0 && (d.erg === 'sieg' || d.erg === 'niederlage')).map(d => [d.id, d.erg === 'sieg' ? d.ein : -d.ein])

const zahl = (x: unknown, ersatz = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : ersatz)
/** Was in einer fremden Lage-Datei steht, in eine sichere Form bringen (auch eine spätere Tool-Version darf die Oberfläche nie stolpern lassen). */
function saubereLage(roh: unknown): LageInhalt | null {
  if (!roh || typeof roh !== 'object') return null
  const d = roh as Record<string, unknown>, z = (d.z && typeof d.z === 'object' ? d.z : {}) as Record<string, unknown>
  const fl = Array.isArray(d.fl) ? d.fl : [], med = Array.isArray(z.med) ? z.med : []
  const lage: LageInhalt = {
    n: String(d.n ?? '').slice(0, 28), a: String(d.a ?? '').slice(0, 40), sn: String(d.sn ?? '').slice(0, 28),
    schiff: Math.max(0, Math.min(6, Math.floor(zahl(d.schiff)))), rang: Math.max(0, Math.min(9, Math.floor(zahl(d.rang)))), ruhm: Math.max(0, Math.floor(zahl(d.ruhm))),
    fl: [Math.floor(zahl(fl[0])), Math.floor(zahl(fl[1])), Math.floor(zahl(fl[2], 1)), Math.floor(zahl(fl[3]))],
    tag: Math.floor(zahl(d.tag)), geraet: String(d.geraet ?? '').slice(0, 12), zug: Math.max(0, Math.floor(zahl(d.zug))),
    z: { funde: Math.floor(zahl(z.funde)), erst: Math.floor(zahl(z.erst)), felder: Math.floor(zahl(z.felder)), weit: Math.floor(zahl(z.weit)), med: [Math.floor(zahl(med[0])), Math.floor(zahl(med[1])), Math.floor(zahl(med[2]))], atlas: Math.floor(zahl(z.atlas)) },
  }
  const b = sauberesBund(d.b)
  if (b) lage.b = b
  const vier = (x: unknown): [number, number, number, number] | undefined => (Array.isArray(x) && x.length === 4 && x.every(v => typeof v === 'number' && Number.isFinite(v)) ? [Math.max(0, Math.floor(x[0])), Math.max(0, Math.min(1e9, Math.floor(x[1]))), Math.max(0, Math.min(1e9, Math.floor(x[2]))), Math.max(0, Math.min(1e4, Math.floor(x[3])))] : undefined)
  const gr = vier(d.gr), gp = vier(d.gp)
  if (gr) lage.gr = gr
  if (gp) lage.gp = gp
  if (Array.isArray(d.kz) && d.kz.length === 2) lage.kz = [Math.max(0, Math.floor(zahl(d.kz[0]))), Math.max(0, Math.floor(zahl(d.kz[1])))]
  const fe = saubereBild(d.fe)
  if (fe) lage.fe = fe
  if (Array.isArray(d.kg) && d.kg.length === 2) lage.kg = [Math.max(0, Math.min(1e7, Math.floor(zahl(d.kg[0])))), Math.max(0, Math.floor(zahl(d.kg[1])))]
  return lage
}

// ── Zustand dieses Laufs ──
interface Bekannt { lageRev: number; lage?: LageInhalt; stammRev: number; stamm?: StammInhalt; schlecht: Set<string>; fehl: Map<string, number> }
const bekannt = new Map<string, Bekannt>()
let meineRev = { lage: 0, stamm: 0 }
/** höchste eigene Nummer, die dieser Lauf selbst geschrieben oder als echt erkannt hat (Maß fürs Aufräumen) */
let eigenGut = { lage: 0, stamm: 0 }
/** zuletzt veröffentlicht: Inhalt (ohne Zugzähler), Zeit des letzten Versuchs, Zugzähler und Zeit der letzten Lage */
let zuletztVeroeffentlicht = { lage: '', stamm: '', zeit: 0, zug: -1, lageZeit: 0 }
let uhr: ReturnType<typeof setInterval> | null = null
let laeuft: Promise<void> | null = null
let aktiv = false
/** Entdeckungen, bei denen in diesem Lauf schon nachgesehen wurde (frisch gesichtet) bzw. deren Datei unbrauchbar ist */
const geprueft = new Set<string>()
const unbrauchbar = new Set<string>()
let sicherungZeit = 0
/** Nummer des eigenen öffentlichen Buchs, dessen Inhalt dieser Lauf kennt (selbst geschrieben oder gelesen und nachgezogen) */
let buchRev = 0
/** die neueste Fassung des eigenen Buchs ist bekannt — erst dann wird verbucht und veröffentlicht */
let buchOk = false
/** Zähler des Spielstands (speicher.ts), mit dem zuletzt abgeglichen wurde: Wechselt der Stand, beginnt die Prüfung neu */
let standGesehen = -1
/** Tagesergebnisse sind einmal geschrieben und ändern sich nie: einmal gelesen genügt */
const tagGelesen = new Map<string, TagesErgebnis | null>()
/** Tage, deren eigenes Ergebnis in diesem Lauf sicher auf dem Laufwerk liegt */
const tagGemeldet = new Set<number>()
/** Stufe 2: geprüfte Gründungsurkunden (Kennung → Gründer; '' = keine gültige) und „bezwungen“-Vermerke je Woche
 *  (null = für eine vergangene Woche sicher keiner) */
const urkunden = new Map<string, string>()
const bezwungen = new Map<number, { von: string; tag: number } | null>()

const ich = (): string => useTerra.getState().benutzer
/** Ist noch derselbe Spielstand geladen wie zu Beginn dieses Abgleichs? (Nach jedem Warten aufs Laufwerk zu prüfen:
 *  Der Spieler kann inzwischen neu begonnen oder eine Sicherung übernommen haben.) */
const gleicherStand = (): boolean => useTerra.getState().standNr === standGesehen
/** Darf dieser PC gerade verbuchen und veröffentlichen? (Raum offen, Laufwerk da, eigenes Buch bekannt, kein anderes
 *  Gerät weiter, Tool nicht veraltet, derselbe Spielstand wie beim Abgleich) — für Festungen und Duelle (Stufe 3) */
export function darfSchreiben(): boolean {
  const g = useGemeinsam.getState()
  return aktiv && buchOk && g.verbunden === true && !g.fremderStand && !g.veraltet && gleicherStand() && !!spiel()
}
/** die Listen für die Oberfläche neu bilden (nach einer Änderung am eigenen Stand) */
export function aktualisiere(): void { const u = ich(); if (u && aktiv) leiteAb(sicher(u)) }
/** das zuletzt gelesene öffentliche Buch eines Kollegen (z. B. ob er ein Duell schon verbucht hat) */
export function fremdesBuch(u: string): StammInhalt | undefined { return bekannt.get(sicher(u))?.stamm }
const spiel = (): Spiel | null => (useTerra.getState().zustand === 'bereit' ? useTerra.getState().spiel : null)
const datei = (u: string, art: 'lage' | 'stamm', rev: number): string => `${KAPITAENE}/${sicher(u)}.${art}.${rev}.json`
const fundPfad = (key: string): string => {
  const [q, r] = key.slice(1).split(',').map(Number)
  return `${FUNDE}/s${Math.floor(q / 32)}_${Math.floor(r / 32)}/${key.replace(',', '_')}.json`
}

/** Abgleich starten (beim Öffnen des Raums) */
export function starteGemeinsam(): void {
  if (aktiv) { if (useTerra.getState().standNr !== standGesehen) void abgleich(); return }
  aktiv = true
  void abgleich()
  uhr = setInterval(() => { if (document.hasFocus() && !document.hidden) void abgleich() }, 90000)
}
export function stoppeGemeinsam(): void {
  aktiv = false
  if (uhr) { clearInterval(uhr); uhr = null }
  bekannt.clear(); geprueft.clear(); unbrauchbar.clear(); tagGelesen.clear(); tagGemeldet.clear(); urkunden.clear(); bezwungen.clear(); beitraege.clear()
  vergissFestungen(); vergissDuelle()
  sicherungZeit = 0; buchRev = 0; buchOk = false; standGesehen = -1
  meineRev = { lage: 0, stamm: 0 }; eigenGut = { lage: 0, stamm: 0 }; zuletztVeroeffentlicht = { lage: '', stamm: '', zeit: 0, zug: -1, lageZeit: 0 }
  useGemeinsam.setState({ verbunden: null, kapitaene: [], funde: [], flaschen: [], fremderStand: false, veraltet: false, meldungen: [], buende: [], gross: null, bundHinweise: [] })
}

/** Ein Abgleich: Verzeichnis ansehen, Geändertes lesen, Geschenke verbuchen, Ansprüche klären, Eigenes veröffentlichen. */
export function abgleich(): Promise<void> {
  if (laeuft) return laeuft
  laeuft = (async () => { try { await abgleichEinmal() } catch { /* nie nach außen: Das Spiel läuft auch ohne gemeinsame Welt */ } finally { laeuft = null } })()
  return laeuft
}

async function abgleichEinmal(): Promise<void> {
  const u = ich()
  if (!aktiv || !u) return
  const mich = sicher(u)
  // anderer Spielstand als beim letzten Mal (neu begonnen, Sicherung übernommen …): alles Eigene neu prüfen
  const standNr = useTerra.getState().standNr
  if (standNr !== standGesehen) {
    // (Duelle und Festungsberichte des bisherigen Stands vergessen: Die Ansicht eines Duells aus dem alten Stand darf
    // im neuen nicht weiterlaufen)
    if (standGesehen !== -1) { vergissDuelle(); vergissFestungen() }
    standGesehen = standNr; buchRev = 0; buchOk = false; geprueft.clear(); zuletztVeroeffentlicht = { lage: '', stamm: '', zeit: 0, zug: -1, lageZeit: 0 }
  }

  // 1) Ist das Laufwerk da? (Ein leeres Verzeichnis sagt das nicht — die Aufsichts-Datei lesen sagt es.)
  const auf = await netzLiesGenau(AUFSICHT)
  if (!auf.ok) { if (auf.grund !== 'zu') useGemeinsam.setState({ verbunden: false }); return }
  if (auf.wert.status === 'fehler') { useGemeinsam.setState({ verbunden: false }); return }
  let aufsicht = useGemeinsam.getState().aufsicht
  if (auf.wert.status === 'ok') {
    const o = await oeffne<Aufsicht>(auf.wert.daten, { art: 'aufsicht' })
    if (o.ok) aufsicht = { namenAus: (Array.isArray(o.inhalt.namenAus) ? o.inhalt.namenAus : []).filter(x => typeof x === 'string').slice(0, 2000), flaschenAus: (Array.isArray(o.inhalt.flaschenAus) ? o.inhalt.flaschenAus : []).filter(x => typeof x === 'string').slice(0, 2000) }
  }

  wendeAufsichtAn(aufsicht)

  // 2) Verzeichnis: alle Nummern je Benutzer und Art, die höchste zuerst
  const liste = await netzListe(KAPITAENE)
  if (!liste.ok) { if (liste.grund !== 'zu') useGemeinsam.setState({ verbunden: false }); return }
  const alle = new Map<string, { lage: number[]; stamm: number[] }>()
  for (const name of liste.wert) {
    const m = /^(.+)\.(lage|stamm)\.(\d+)\.json$/.exec(name)
    if (!m) continue
    const art = m[2] as 'lage' | 'stamm', rev = Number(m[3])
    if (!Number.isSafeInteger(rev) || rev < 1) continue
    let e = alle.get(m[1])
    if (!e) { e = { lage: [], stamm: [] }; alle.set(m[1], e) }
    e[art].push(rev)
  }
  for (const e of alle.values()) { e.lage.sort((x, y) => y - x); e.stamm.sort((x, y) => y - x) }
  const eigene = alle.get(mich) ?? { lage: [], stamm: [] }
  if (eigene.lage.length && eigene.lage[0] > meineRev.lage) meineRev.lage = eigene.lage[0]
  if (eigene.stamm.length && eigene.stamm[0] > meineRev.stamm) meineRev.stamm = eigene.stamm[0]

  // 3) Das eigene Buch: Liegt eine Fassung vor, die dieser Lauf nicht kennt, erst lesen und nachziehen
  let veraltet = false
  if (eigene.stamm.length && eigene.stamm[0] > buchRev) {
    const e = await liesEigenesBuch(mich, eigene.stamm)
    buchOk = e === 'ok'
    veraltet = e === 'neuer'
  } else buchOk = true
  if (!aktiv || !gleicherStand()) return

  // 4) Was sich bei den anderen (und an der eigenen Lage) geändert hat
  let fremderStand = false, gestoert = false
  for (const [wer, revs] of alle) {
    let b = bekannt.get(wer)
    if (!b) { b = { lageRev: 0, stammRev: 0, schlecht: new Set(), fehl: new Map() }; bekannt.set(wer, b) }
    if (!(await liesNeueste(wer, 'lage', revs.lage, b))) { gestoert = true; break }            // Laufwerk weg oder Raum zu: Rest beim nächsten Mal
    if (wer !== mich && !(await liesNeueste(wer, 'stamm', revs.stamm, b))) { gestoert = true; break }
    if (wer === mich) {
      if (b.lageRev > eigenGut.lage) eigenGut.lage = b.lageRev
      const sp = spiel()
      // ein anderes Gerät war weiter: nichts überschreiben, der Spieler entscheidet (Einstellungen)
      if (sp && b.lage && b.lage.geraet !== geraeteKennung() && b.lage.zug > sp.stand.zug) fremderStand = true
    }
  }
  if (!aktiv || !gleicherStand()) return
  // mittendrin weggeblieben: Was schon gelesen ist, gilt; verbucht und geschrieben wird erst wieder, wenn es antwortet
  useGemeinsam.setState({ verbunden: !gestoert, fremderStand, veraltet, aufsicht })
  const darf = buchOk && !fremderStand && !veraltet && !gestoert
  if (darf) verbucheGeschenke(mich)
  leiteAb(mich)
  if (gestoert) return
  for (let i = 0; i < 3 && (await klaereAnsprueche()); i++) { if (!aktiv || !gleicherStand()) return }
  if (!aktiv || !gleicherStand()) return
  if (darf) await veroeffentliche()
  await reicheTagNach()
  leiteAb(mich)
  // Stufe 2: Bündnisse und der große Gegner (verbucht wird nur, wenn dieser PC maßgeblich ist — wie bei Geschenken)
  if (darf) { await stufeZwei(mich); if (!aktiv || !gleicherStand()) return }
  // Stufe 3: Ertrag und Überfälle der eigenen Festung, Bericht über die letzte Belagerung, Duelle
  if (darf) {
    await festungenAbgleich(mich); if (!aktiv || !gleicherStand()) return
    await duelleAbgleich(); if (!aktiv || !gleicherStand()) return
  }
  // 5) Aufräumen: eigene Dateien, die älter sind als die vorletzte GÜLTIGE (höchstens zwei je Runde). Gemessen wird an
  //    dem, was dieser Lauf selbst geschrieben oder als echt erkannt hat — nie an der bloßen Nummer im Verzeichnis.
  let weg = 0
  for (const art of ['lage', 'stamm'] as const) for (const rev of eigene[art]) { if (rev < eigenGut[art] - 1 && weg++ < 2 && aktiv) void netzLoesche(datei(u, art, rev)) }
}

/** Die neueste brauchbare Fassung einer Datei eines Kapitäns lesen (höchstens zwei Versuche je Runde). Unbrauchbare —
 *  falsches Siegel, falscher Name, falsche Nummer — werden gemerkt und übergangen: Eine untergeschobene Datei mit
 *  hoher Nummer verdeckt die echte nicht. Gibt false zurück, wenn das Laufwerk nicht antwortet. */
async function liesNeueste(wer: string, art: 'lage' | 'stamm', revs: readonly number[], b: Bekannt): Promise<boolean> {
  let versuche = 0
  for (const rev of revs) {
    if (rev <= (art === 'lage' ? b.lageRev : b.stammRev)) break
    const kennung = `${art}.${rev}`
    if (b.schlecht.has(kennung)) continue
    if (versuche++ >= 2) break
    const r = await netzLies<unknown>(`${KAPITAENE}/${wer}.${art}.${rev}.json`)
    if (!r.ok) return false
    const o = await oeffne<unknown>(r.wert, { art, rev })
    if (o.ok && sicher(o.u) === wer) {
      if (art === 'lage') { const lage = saubereLage(o.inhalt); if (lage) { b.lageRev = rev; b.lage = lage; return true } }
      else if (o.inhalt && typeof o.inhalt === 'object') { b.stammRev = rev; b.stamm = o.inhalt as StammInhalt; return true }
    }
    // unbrauchbar: merken. Nur „nicht lesbar“ (wird vielleicht gerade geschrieben) bekommt drei Versuche.
    const fehl = (b.fehl.get(kennung) ?? 0) + 1
    if (o.ok || o.grund !== 'kaputt' || fehl >= 3) { b.schlecht.add(kennung); b.fehl.delete(kennung) } else b.fehl.set(kennung, fehl)
  }
  return true
}

/** Ausgeblendete Taufnamen verschwinden bei allen — auch dort, wo sie schon auf der eigenen Karte standen. */
function wendeAufsichtAn(aufsicht: Aufsicht): void {
  const sp = spiel()
  if (!sp || !aufsicht.namenAus.length) return
  const betroffen = aufsicht.namenAus.filter(k => { const e = sp.stand.entdeckt[k]; return !!e && (e.name !== undefined || e.vorschlag !== undefined) && e.anspruch !== 3 })
  if (!betroffen.length) return
  useTerra.getState().tue(s => { for (const k of betroffen) { const e = s.stand.entdeckt[k]; if (e) { delete e.name; delete e.vorschlag } } })
}

/** Das eigene öffentliche Buch lesen und den lokalen Stand nachziehen.
 *  'ok' = bekannt (oder es gibt kein gültiges), 'spaeter' = gerade nicht lesbar, 'neuer' = von einer neueren Tool-Version */
async function liesEigenesBuch(mich: string, revs: readonly number[]): Promise<'ok' | 'spaeter' | 'neuer'> {
  for (const rev of revs.slice(0, 6)) {                       // die neueste; ist sie unbrauchbar, die davor
    const r = await netzLiesGenau(`${KAPITAENE}/${mich}.stamm.${rev}.json`)
    if (!r.ok || r.wert.status === 'fehler' || r.wert.status === 'fehlt') return 'spaeter'       // Laufwerk weg oder gerade ersetzt
    if (r.wert.status !== 'ok') continue
    const o = await oeffne<StammInhalt>(r.wert.daten, { art: 'stamm', rev })
    if (!o.ok) { if (o.grund === 'neuer') return 'neuer'; continue }
    if (sicher(o.u) !== mich || !o.inhalt || typeof o.inhalt !== 'object') continue
    if (o.pv > PV) return 'neuer'                            // mein eigenes Buch kommt von einem neueren Tool (anderer PC)
    if (!gleicherStand()) return 'spaeter'
    gleicheMitEigenemBuch(o.inhalt)
    buchRev = revs[0]
    if (rev > eigenGut.stamm) eigenGut.stamm = rev
    return 'ok'
  }
  buchRev = revs[0]            // keine brauchbare Fassung: Es gibt kein gültiges Buch
  return 'ok'
}

/** Stufe 2 und 3 aus dem eigenen Buch nachziehen (nur für einen älteren Stand DESSELBEN Spiels). Grundsatz wie bei den
 *  Geschenken: Ein zurückgespielter Stand gewinnt nie etwas dazu, bleibt aber auch nichts schuldig.
 *  • großer Gegner: Wochen, deren Anteil ausgezahlt ist, gelten als ausgezahlt
 *  • Duelle (dz): Ein verlorener Einsatz ist weg — auch wenn dieser Stand das Duell gar nicht kennt; ein gewonnener
 *    wird nicht noch einmal ausgezahlt (ein schon genommenes Pfand kommt zurück)
 *  • offene Duelle (do): werden samt Pfand übernommen und verbucht, sobald sie entschieden sind
 *  • Beute (fz): zugestellte Berichte gelten als zugestellt (ihre Beute gibt es kein zweites Mal) */
function gleicheStufeDrei(buch: StammInhalt, s0: TiStand): void {
  const gb = (Array.isArray(buch.gb) ? buch.gb : []).filter((w): w is number => typeof w === 'number' && Number.isSafeInteger(w) && !s0.gross.bezahlt.includes(w))
  if (gb.length) useTerra.getState().tue(s => { s.stand.gross.bezahlt = [...s.stand.gross.bezahlt, ...gb].sort((a, b) => a - b).slice(-8); s.stand.zug++ })
  const kennung = (x: unknown): x is string => typeof x === 'string' && /^[a-z0-9_.-]{6,100}$/.test(x)
  const betrag = (x: unknown, von: number): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= von && x <= 1e6
  const dz = (Array.isArray(buch.dz) ? buch.dz : []).filter((x): x is [string, number] => Array.isArray(x) && kennung(x[0]) && betrag(x[1], -1e6) && x[1] !== 0)
  const offen = (Array.isArray(buch.do) ? buch.do : []).filter((x): x is [string, number, 'a' | 'b', string, number] => Array.isArray(x) && kennung(x[0]) && betrag(x[1], 0) && (x[2] === 'a' || x[2] === 'b') && typeof x[3] === 'string' && typeof x[4] === 'number')
  const fz = (Array.isArray(buch.fz) ? buch.fz : []).filter((x): x is string => typeof x === 'string' && /^[a-z0-9._-]{1,60}\/\d{1,12}$/.test(x))
  const neuDz = dz.filter(([id]) => !s0.duelle.some(d => d.id === id && d.fertig))
  const neuOffen = offen.filter(([id]) => !s0.duelle.some(d => d.id === id))
  const neuFz = fz.filter(x => !s0.kampf.zugestellt.includes(x))
  if (!neuDz.length && !neuOffen.length && !neuFz.length) return
  let ab = 0
  useTerra.getState().tue(s => {
    const st = s.stand
    for (const [id, delta] of neuDz) {
      const d = st.duelle.find(x => x.id === id)
      if (d?.fertig) continue
      // gemessen am Stand vor dem Duell zählt nur der Verlust; ein schon genommenes Pfand ist darin schon enthalten
      const korrektur = Math.min(delta, 0) - (d && d.es ? -d.ein : 0)
      if (korrektur < 0) ab += Math.min(-korrektur, st.gold)
      st.gold = Math.max(0, st.gold + korrektur)
      const erg = delta > 0 ? 'sieg' : 'niederlage'
      if (d) { d.fertig = true; d.erg = erg; delete d.ang }
      else st.duelle.push({ id, gegner: '', gn: '', rolle: 'a', ein: Math.abs(delta), tag: 0, erg, fertig: true })
    }
    for (const [id, ein, rolle, gegner, tag] of neuOffen) {
      if (st.duelle.some(x => x.id === id)) continue
      st.duelle.push({ id, gegner: sicher(gegner).slice(0, 60), gn: gegner.slice(0, 40), rolle, ein, tag: Math.max(0, Math.floor(tag)), es: true })
      ab += Math.min(ein, st.gold)
      st.gold = Math.max(0, st.gold - ein)
    }
    if (neuFz.length) st.kampf.zugestellt = [...st.kampf.zugestellt, ...neuFz].slice(-ZUGESTELLT_MAX)
    kuerzeDuelle(st)
    st.zug++
  })
  if (ab) melde(`Dieser Spielstand ist älter als dein Buch auf dem Netzlaufwerk: ${ab} Gold Einsatz aus Duellen wurde nachgetragen.`)
}

/** Das eigene öffentliche Buch gilt: Kennt der lokale Stand weniger (zurückgespielt, anderer PC, Neuanfang), wird er
 *  nachgezogen — empfangene Geschenke werden nicht noch einmal verbucht, verschickte nicht zurückerstattet. */
function gleicheMitEigenemBuch(buch: StammInhalt): void {
  const sp = spiel()
  if (!sp) return
  const s0 = sp.stand
  // Was nur dieses Spiel betrifft (großer Gegner, Duelle, Beute), gilt nur für einen älteren Stand DESSELBEN Spiels —
  // ein neu begonnenes Spiel übernimmt davon nichts (es zahlt keine alten Einsätze und verliert keine Anteile).
  if (Number(buch.spiel) === s0.saat) gleicheStufeDrei(buch, s0)
  const rein = Object.entries(buch.gebucht && typeof buch.gebucht === 'object' ? buch.gebucht : {}).filter(([wer, nr]) => typeof nr === 'number' && Number.isSafeInteger(nr) && nr > (s0.gaben.rein[wer] ?? 0))
  const raus = Object.entries(buch.gaben && typeof buch.gaben === 'object' ? buch.gaben : {}).filter(([an, g]) => g && typeof g === 'object' && Number.isSafeInteger(g.nr) && g.nr > (s0.gaben.raus[an] ?? 0))
  if (!rein.length && !raus.length) return
  // derselbe Spielstand, nur älter → das seither verschenkte Gold ist lokal noch da und muss wieder weg.
  // Ein neu begonnenes Spiel übernimmt nur die Nummern (sonst würden Empfänger seine nächsten Geschenke übergehen).
  const selbesSpiel = Number(buch.spiel) === s0.saat
  let abzug = 0
  useTerra.getState().tue(s => {
    const st = s.stand
    for (const [wer, nr] of rein) st.gaben.rein[wer] = nr
    for (const [an, g] of raus) {
      const lokal = st.gaben.raus[an] ?? 0
      for (const e of Array.isArray(g.offen) ? g.offen : []) {
        if (!Array.isArray(e)) continue
        const nr = Number(e[0])
        if (!Number.isSafeInteger(nr) || nr <= lokal || st.gabenOffen.some(x => x.an === an && x.nr === nr)) continue
        st.gabenOffen.push({ an, nr, was: String(e[1]).slice(0, 16), menge: Math.max(1, Math.min(1e7, Math.floor(Number(e[2]) || 0))), tag: Math.max(0, Math.floor(Number(e[3]) || 0)) })
      }
      const summe = Math.max(0, Math.floor(zahl(g.gold))), bisher = st.gaben.gold[an] ?? 0
      if (selbesSpiel && summe > bisher) abzug += summe - bisher
      if (summe > bisher) st.gaben.gold[an] = summe
      st.gaben.raus[an] = g.nr
    }
    if (abzug > 0) st.gold = Math.max(0, st.gold - abzug)
    st.zug++
  })
  if (abzug > 0) melde(`Dieser Spielstand ist älter als dein Geschenkbuch auf dem Netzlaufwerk: ${abzug} verschenktes Gold wurde nachgetragen.`)
}

/** aus den gelesenen Dateien die Listen für die Oberfläche bauen */
function leiteAb(mich: string): void {
  const sp = spiel(), anzeige = useTerra.getState().anzeigeName, { aufsicht } = useGemeinsam.getState()
  const kapitaene: Kapitaen[] = [], funde: FremdFund[] = [], flaschen: FremdFlasche[] = []
  for (const [wer, b] of bekannt) {
    if (wer === mich || !b.lage) continue
    kapitaene.push({ ...b.lage, u: wer, ich: false })
    const von = b.lage.n || wer
    const st = b.stamm
    for (const f of (st && Array.isArray(st.funde) ? st.funde : []).slice(0, 40)) if (Array.isArray(f) && typeof f[0] === 'string') funde.push({ u: wer, von, key: f[0].slice(0, 20), art: String(f[1]).slice(0, 16), name: aufsicht.namenAus.includes(f[0]) ? '' : String(f[2] ?? '').slice(0, 28), tag: Number(f[3]) || 0 })
    for (const f of (st && Array.isArray(st.flaschen) ? st.flaschen : []).slice(0, 20)) if (Array.isArray(f) && typeof f[0] === 'string' && !aufsicht.flaschenAus.includes(f[0])) flaschen.push({ id: f[0].slice(0, 60), u: wer, von, q: Math.floor(Number(f[1]) || 0), r: Math.floor(Number(f[2]) || 0), text: String(f[3] ?? '').slice(0, 160), tag: Number(f[4]) || 0 })
  }
  if (sp) kapitaene.push({ ...lageVon(sp.stand, anzeige, umwelt().tag), u: mich, ich: true })
  kapitaene.sort((a, b) => b.ruhm - a.ruhm)
  funde.sort((a, b) => b.tag - a.tag)
  // Bündnisse (nur mit gültiger Gründungsurkunde) und der große Gegner dieser Woche
  const buende = buendeAus(kapitaene.map(k => ({ u: k.u, n: k.n || k.u, ruhm: k.ruhm, b: k.b })), (key, u) => urkunden.get(key) === u)
  const w = wocheVon(umwelt().tag)
  let schaden = 0, hp = 0
  const teilnehmer: GrossAnzeige['teilnehmer'] = []
  for (const k of kapitaene) if (k.gr && k.gr[0] === w && k.gr[3] > 0) { schaden += k.gr[1]; hp += k.gr[2]; teilnehmer.push({ u: k.u, n: k.n || k.u, schaden: k.gr[1], hp: k.gr[2], ich: k.ich }) }
  teilnehmer.sort((a, b) => b.schaden - a.schaden)
  const bz = bezwungen.get(w)
  const gross: GrossAnzeige = { w, schaden, hp, teilnehmer, besiegt: !!bz, besiegtVon: bz?.von, besiegtTag: bz?.tag }
  // was Bündnis-Kameraden entdeckt haben und ich noch nicht kenne: als Vermerk auf die Karte
  const meinBund = sp?.stand.bund ? buende.find(b => b.key === sp.stand.bund?.key && b.mitglieder.includes(mich)) : undefined
  const bundHinweise = meinBund && sp ? funde.filter(f => f.u !== mich && meinBund.mitglieder.includes(f.u) && !sp.stand.entdeckt[f.key]).slice(0, 60) : []
  useGemeinsam.setState({ kapitaene, funde, flaschen, buende, gross, bundHinweise })
}

// ── Stufe 2: Bündnisse und der große Gegner ──
async function stufeZwei(mich: string): Promise<void> {
  // 1) Gründungsurkunden prüfen (höchstens vier je Runde, jede nur einmal je Lauf)
  let gelesen = 0
  for (const k of useGemeinsam.getState().kapitaene) {
    if (!k.b || k.b.r !== 'g' || urkunden.has(k.b.k)) continue
    if (gelesen++ >= 4) break
    const r = await netzLiesGenau(`${BUENDE}/${k.b.k}.json`)
    if (!r.ok || r.wert.status === 'fehler') return
    if (r.wert.status !== 'ok') { urkunden.set(k.b.k, ''); continue }
    const o = await oeffne<{ k?: string }>(r.wert.daten, { art: 'bund' })
    urkunden.set(k.b.k, o.ok && o.inhalt && o.inhalt.k === k.b.k ? sicher(o.u) : '')
  }
  if (!aktiv || !gleicherStand()) return
  leiteAb(mich)
  // 2) mein Bündnis nachziehen
  pruefeMeinBund(mich)
  // 3) der große Gegner: „bezwungen“ lesen oder anlegen, Anteile auszahlen
  await pruefeGross(mich)
}

function pruefeMeinBund(mich: string): void {
  const sp = spiel(), mein = sp?.stand.bund
  if (!sp || !mein) return
  if (mein.rolle === 'gruender') {
    // Wer selbst nichts mehr von diesem Bündnis sagt (gelesene Lage), ist ausgetreten: aus der Liste nehmen
    const raus = mein.mitglieder.filter(u => { if (u === mich) return false; const l = bekannt.get(u)?.lage; return !!l && (!l.b || l.b.k !== mein.key || l.b.r === 'g') })
    // eine Ablehnung bleibt nur stehen, solange der Antrag noch da ist (danach darf man es noch einmal versuchen)
    const vergessen = mein.nein.filter(u => { const l = bekannt.get(u)?.lage; return !!l && !(l.b && l.b.k === mein.key && l.b.r === 'a') })
    if (raus.length || vergessen.length) {
      useTerra.getState().tue(s => { if (s.stand.bund) { s.stand.bund.mitglieder = s.stand.bund.mitglieder.filter(u => !raus.includes(u)); s.stand.bund.nein = s.stand.bund.nein.filter(u => !vergessen.includes(u)) } })
      void veroeffentliche(true)
    }
    return
  }
  const gb = bekannt.get(mein.gruender)
  const wandel = bundWandel(mich, mein, gb?.lage?.b ?? null, !!gb?.lage)
  if (wandel === 'gleich') return
  const name = mein.name
  useTerra.getState().tue(s => {
    if (!s.stand.bund || s.stand.bund.key !== mein.key) return
    if (wandel === 'aufgenommen') { s.stand.bund.rolle = 'mitglied'; s.stand.bund.seit = umwelt().tag } else s.stand.bund = null
    s.stand.zug++
  })
  melde(wandel === 'aufgenommen' ? `Willkommen im Bündnis „${name}“!` : wandel === 'abgelehnt' ? `Das Bündnis „${name}“ hat den Antrag abgelehnt.` : wandel === 'entlassen' ? `Du gehörst nicht mehr zum Bündnis „${name}“.` : `Das Bündnis „${name}“ gibt es nicht mehr.`)
  void veroeffentliche(true)
}

/** Der „bezwungen“-Vermerk trägt die Beiträge, wie sie der sah, der ihn anlegte: [Benutzer, Schaden, Anteil am
 *  Lebensbalken]. Danach rechnen alle ihren Anteil an der Beute — so kommen alle auf dieselbe Rechnung, auch wenn einer
 *  im selben Augenblick noch einen älteren Stand eines anderen kannte. */
interface BezwungenInhalt { w: number; von: string; tag: number; schaden: number; hp: number; t?: [string, number, number][] }
const beitraege = new Map<number, [string, number, number][]>()
/** „bezwungen“-Vermerk einer Woche lesen. true/false, null = Laufwerk antwortet nicht */
async function liesBezwungen(w: number, vorbei: boolean): Promise<boolean | null> {
  const schon = bezwungen.get(w)
  if (schon) return true
  if (schon === null) return false
  const r = await netzLiesGenau(`${GROSS}/w${w}.json`)
  if (!r.ok || r.wert.status === 'fehler') return null
  if (r.wert.status !== 'ok') { if (vorbei && r.wert.status === 'fehlt') bezwungen.set(w, null); return false }
  const o = await oeffne<BezwungenInhalt>(r.wert.daten, { art: 'gross', rev: w })
  if (!o.ok || !o.inhalt || o.inhalt.w !== w) { if (vorbei) bezwungen.set(w, null); return false }
  bezwungen.set(w, { von: String(o.inhalt.von ?? o.u).slice(0, 28), tag: Math.floor(Number(o.inhalt.tag) || 0) })
  const t = Array.isArray(o.inhalt.t) ? o.inhalt.t : []
  beitraege.set(w, t.filter(x => Array.isArray(x) && typeof x[0] === 'string' && Number.isFinite(x[1]) && Number.isFinite(x[2])).slice(0, 200).map(x => [sicher(x[0]), Math.max(0, Math.floor(x[1])), Math.max(0, Math.floor(x[2]))]))
  return true
}

async function pruefeGross(mich: string): Promise<void> {
  const sp = spiel(), u = ich()
  if (!sp || !u) return
  const tag = umwelt().tag, w = wocheVon(tag), g = useGemeinsam.getState().gross
  // a) diese Woche: Ist der Balken leer, legt der Erste den Vermerk an (exklusiv — es gibt genau einen); ab halber
  //    Strecke wird nachgesehen, ob ein anderer ihn schon angelegt hat
  if (g && g.hp > 0 && !bezwungen.get(w)) {
    if (g.schaden >= g.hp) {
      const t: [string, number, number][] = g.teilnehmer.map(x => [x.u, x.schaden, x.hp])
      const inhalt: BezwungenInhalt = { w, von: sp.stand.kapitaen, tag, schaden: g.schaden, hp: g.hp, t }
      const r = await netzLegeAn(`${GROSS}/w${w}.json`, await versiegle('gross', u, w, inhalt))
      if (!r.ok || r.wert === 'fehler') return
      if (r.wert === 'ok') { bezwungen.set(w, { von: inhalt.von, tag }); beitraege.set(w, t); melde('Der große Gegner ist bezwungen! Die Beute wird nach Anteil am Schaden geteilt.') }
      else if ((await liesBezwungen(w, false)) === null) return
    } else if (g.schaden * 2 >= g.hp && (await liesBezwungen(w, false)) === null) return
    if (!aktiv || !gleicherStand()) return
    leiteAb(mich)
  }
  // b) Auszahlen: diese Woche, sobald bezwungen; frühere Wochen, sobald sie vorbei sind (nicht bezwungen: zwei Fünftel)
  const s = spiel()?.stand
  if (!s) return
  const wochen: [number, number, number, number][] = []
  if (s.gross.w && s.gross.kaempfe) wochen.push([s.gross.w, s.gross.schaden, s.gross.hp, s.gross.kaempfe])
  if (s.gross.vorher) wochen.push(s.gross.vorher)
  for (const [wo, schaden, hp] of wochen) {
    if (schaden <= 0 || s.gross.bezahlt.includes(wo) || wo > w) continue
    const besiegt = await liesBezwungen(wo, wo < w)
    if (besiegt === null) return
    if (wo === w && !besiegt) continue
    // bezwungen: nach den Beiträgen im Vermerk (für alle dieselbe Rechnung); wer dort fehlt, kommt mit seinem eigenen Beitrag dazu.
    // entkommen: nach den Lagen aller (die Woche ist vorbei, daran ändert sich nichts mehr)
    let D = 0, H = 0, d = schaden
    const t = besiegt ? beitraege.get(wo) ?? [] : []
    if (besiegt && t.length) {
      for (const [, s2, h2] of t) { D += s2; H += h2 }
      const eigen = t.find(x => x[0] === mich)
      if (eigen) d = eigen[1]
      else { D += schaden; H += hp }
    } else {
      D = schaden; H = hp
      for (const [wer, b] of bekannt) {
        if (wer === mich || !b.lage) continue
        const x = b.lage.gr && b.lage.gr[0] === wo ? b.lage.gr : b.lage.gp && b.lage.gp[0] === wo ? b.lage.gp : null
        if (x && x[3] > 0) { D += x[1]; H += x[2] }
      }
    }
    const voll = Math.floor((GROSS_LOHN * H * d) / Math.max(1, D)), betrag = besiegt ? voll : Math.floor((voll * 2) / 5)
    if (!gleicherStand()) return
    useTerra.getState().tue(sp2 => { const st = sp2.stand; if (st.gross.bezahlt.includes(wo)) return; st.gross.bezahlt = [...st.gross.bezahlt, wo].slice(-8); st.gold += betrag; st.zug++ })
    melde(besiegt ? `Dein Anteil an der Beute des großen Gegners: ${betrag} Gold.` : `Der große Gegner ist entkommen. Für deinen Mut zahlt die Admiralität ${betrag} Gold.`)
    // gleich ins Buch: Ein später übernommener älterer Stand bekommt den Anteil dann nicht noch einmal
    void veroeffentliche(true)
  }
}

/** Bonus gegen den großen Gegner (Prozent): ein Zehntel je Bündnis-Kamerad, der diese Woche mitgekämpft hat */
export function grossBonus(): number {
  const sp = spiel(), mich = sicher(ich()), g = useGemeinsam.getState()
  if (!sp?.stand.bund) return 0
  const bund = g.buende.find(b => b.key === sp.stand.bund?.key) ?? null
  if (!bund || !bund.mitglieder.includes(mich)) return 0
  let n = 0
  for (const t of g.gross?.teilnehmer ?? []) if (t.u !== mich && bund.mitglieder.includes(t.u)) n++
  return 10 * Math.min(3, n)
}

/** Ein Bündnis gründen: Die Urkunde wird exklusiv angelegt — einen Namen gibt es nur einmal. Gibt einen Fehlertext
 *  zurück oder null, wenn es geklappt hat. */
export async function gruendeBund(name: string, fl: [number, number, number, number]): Promise<string | null> {
  const sp = spiel(), u = ich(), g = useGemeinsam.getState()
  const sauber = name.replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28), key = bundKey(sauber)
  if (!sp || !u) return 'Kein Spiel geladen.'
  if (g.verbunden !== true || !buchOk || g.fremderStand || g.veraltet) return 'Dafür braucht es die Verbindung zum Netzlaufwerk.'
  if (sp.stand.bund) return 'Du gehörst schon zu einem Bündnis (oder hast einen Antrag gestellt).'
  if (rangVon(sp.stand.ruhm) < BUND_RANG) return 'Ein Bündnis darf erst ein Matrose gründen.'
  if (sp.stand.gold < BUND_PREIS) return `Die Gründung kostet ${BUND_PREIS} Gold.`
  if (key.length < 3) return 'Der Name braucht mindestens drei Buchstaben oder Ziffern.'
  const tag = umwelt().tag
  const r = await netzLegeAn(`${BUENDE}/${key}.json`, await versiegle('bund', u, 1, { k: key, n: sauber, tag }))
  if (!r.ok || r.wert === 'fehler') return 'Das Netzlaufwerk antwortet gerade nicht.'
  if (r.wert === 'vorhanden') {
    const l = await netzLiesGenau(`${BUENDE}/${key}.json`)
    const o = l.ok && l.wert.status === 'ok' ? await oeffne<{ k?: string }>(l.wert.daten, { art: 'bund' }) : null
    if (!o || !o.ok || sicher(o.u) !== sicher(u)) return 'Diesen Namen trägt schon ein Bündnis.'
  }
  if (!gleicherStand() || spiel()?.stand.bund) return 'Das ging gerade nicht.'
  urkunden.set(key, sicher(u))
  useTerra.getState().tue(s => {
    s.stand.gold -= BUND_PREIS
    s.stand.bund = { key, name: sauber, rolle: 'gruender', fl, seit: tag, mitglieder: [sicher(u)], nein: [], gruender: sicher(u) }
    s.stand.zug++
  })
  leiteAb(sicher(u))
  void veroeffentliche(true)
  return null
}
/** um Aufnahme bitten */
export function beantrageBund(b: Bund): boolean {
  const sp = spiel()
  if (!sp || sp.stand.bund || useGemeinsam.getState().verbunden !== true || b.mitglieder.length >= BUND_MAX) return false
  useTerra.getState().tue(s => { s.stand.bund = { key: b.key, name: b.name, rolle: 'antrag', fl: b.fl, seit: umwelt().tag, mitglieder: [], nein: [], gruender: b.gruender }; s.stand.zug++ })
  leiteAb(sicher(ich()))
  void veroeffentliche(true)
  return true
}
/** Antrag zurückziehen, austreten — oder (als Gründer) das Bündnis auflösen */
export function verlasseBund(): void {
  if (!spiel()?.stand.bund) return
  useTerra.getState().tue(s => { s.stand.bund = null; s.stand.zug++ })
  leiteAb(sicher(ich()))
  void veroeffentliche(true)
}
/** als Gründer: aufnehmen, ablehnen, entlassen */
export function entscheideAntrag(wer: string, aufnehmen: boolean): boolean {
  const sp = spiel(), b = sp?.stand.bund
  if (!b || b.rolle !== 'gruender') return false
  if (aufnehmen && b.mitglieder.length >= BUND_MAX) return false
  useTerra.getState().tue(s => {
    const st = s.stand.bund
    if (!st) return
    if (aufnehmen) { if (!st.mitglieder.includes(wer)) st.mitglieder.push(wer); st.nein = st.nein.filter(x => x !== wer) }
    else { st.mitglieder = st.mitglieder.filter(x => x !== wer); if (!st.nein.includes(wer)) st.nein = [...st.nein, wer].slice(-30) }
    s.stand.zug++
  })
  leiteAb(sicher(ich()))
  void veroeffentliche(true)
  return true
}
export function entlasseMitglied(wer: string): boolean {
  const sp = spiel(), b = sp?.stand.bund
  if (!b || b.rolle !== 'gruender' || wer === sicher(ich())) return false
  useTerra.getState().tue(s => { if (s.stand.bund) s.stand.bund.mitglieder = s.stand.bund.mitglieder.filter(x => x !== wer); s.stand.zug++ })
  leiteAb(sicher(ich()))
  void veroeffentliche(true)
  return true
}

/** Geschenke an mich verbuchen (alles über meiner höchsten verbuchten Nummer je Absender); Quittiertes bei mir streichen */
function verbucheGeschenke(mich: string): void {
  const sp = spiel()
  if (!sp) return
  const neu: { von: string; wer: string; nr: number; was: string; menge: number }[] = []
  let quittiert = false
  for (const [wer, b] of bekannt) {
    if (wer === mich || !b.stamm) continue
    const fuerMich = b.stamm.gaben && typeof b.stamm.gaben === 'object' ? b.stamm.gaben[mich] : undefined
    if (fuerMich && Array.isArray(fuerMich.offen)) {
      const schon = sp.stand.gaben.rein[wer] ?? 0
      for (const g of fuerMich.offen) if (Array.isArray(g) && Number.isSafeInteger(Number(g[0])) && Number(g[0]) > schon) neu.push({ von: b.lage?.n || wer, wer, nr: Number(g[0]), was: String(g[1]), menge: Math.max(0, Math.floor(Number(g[2]) || 0)) })
    }
    const erhalten = Number(b.stamm.gebucht?.[mich] ?? 0)
    if (sp.stand.gabenOffen.some(g => g.an === wer && g.nr <= erhalten)) quittiert = true
  }
  if (!neu.length && !quittiert) return
  neu.sort((a, b) => a.nr - b.nr)
  useTerra.getState().tue(s => {
    for (const g of neu) {
      if ((s.stand.gaben.rein[g.wer] ?? 0) >= g.nr) continue
      s.stand.gaben.rein[g.wer] = g.nr
      if (g.was === 'gold') { s.stand.gold += Math.min(g.menge, 1e7); melde(`${g.von} schickt dir ${g.menge} Gold.`) }
    }
    for (const [wer, b] of bekannt) { const erhalten = Number(b.stamm?.gebucht?.[mich] ?? 0); if (erhalten) s.stand.gabenOffen = s.stand.gabenOffen.filter(g => !(g.an === wer && g.nr <= erhalten)) }
    s.stand.zug++
  })
}

/** Eigene Dateien schreiben, wenn sich ihr Inhalt geändert hat (höchstens alle 10 Sekunden; „sofort“ übergeht die
 *  Bremse). Es läuft immer nur EIN Schreibvorgang: Kommt währenddessen ein weiterer „sofort“-Wunsch, folgt danach
 *  genau einer mit dem dann aktuellen Stand — zwei schnelle Geschenke kommen sich so nicht in die Quere. */
let schreibLauf: Promise<void> | null = null
let schreibNochmal = false
export function veroeffentliche(sofort = false): Promise<void> {
  if (schreibLauf) { if (sofort) schreibNochmal = true; return schreibLauf }
  schreibLauf = (async () => {
    try {
      let jetzt = sofort
      do { schreibNochmal = false; await veroeffentlicheEinmal(jetzt); jetzt = true } while (schreibNochmal && aktiv)
    } catch { /* nie nach außen */ } finally { schreibLauf = null; schreibNochmal = false }
  })()
  return schreibLauf
}
/** Jede Nummer wird exklusiv angelegt: Gibt es sie schon (anderer PC desselben Benutzers), klärt das der nächste Abgleich. */
async function veroeffentlicheEinmal(sofort: boolean): Promise<void> {
  const sp = spiel(), u = ich(), g = useGemeinsam.getState()
  if (!aktiv || !sp || !u || !buchOk || g.fremderStand || g.veraltet || g.verbunden !== true) return
  if (!sp.stand.kapitaen) return
  if (useTerra.getState().standNr !== standGesehen) return                    // der Stand wurde gewechselt: erst der nächste Abgleich
  if (!sofort && Date.now() - zuletztVeroeffentlicht.zeit < 10000) return
  const tag = umwelt().tag
  const lage = lageVon(sp.stand, useTerra.getState().anzeigeName, tag), stamm = stammVon(sp.stand)
  // der Zugzähler ändert sich ständig — verglichen wird ohne ihn, geschrieben mit ihm
  const lageText = JSON.stringify({ ...lage, zug: 0 }), stammText = JSON.stringify(stamm)
  zuletztVeroeffentlicht.zeit = Date.now()
  if (stammText !== zuletztVeroeffentlicht.stamm) {
    const rev = meineRev.stamm + 1
    const r = await netzLegeAn(datei(u, 'stamm', rev), await versiegle('stamm', u, rev, stamm))
    if (r.ok && r.wert === 'ok') { meineRev.stamm = rev; eigenGut.stamm = rev; if (buchRev === rev - 1) buchRev = rev; zuletztVeroeffentlicht.stamm = stammText; if (rev > 2) void netzLoesche(datei(u, 'stamm', rev - 2)) }
    else if (r.ok && r.wert === 'vorhanden') { meineRev.stamm = rev; buchOk = false; return }       // jemand anders (mein anderer PC) war schneller: erst lesen
    else return
  }
  // Auch ohne sichtbare Änderung wird die Lage ab und zu neu geschrieben, wenn weitergespielt wurde (höchstens alle fünf
  // Minuten, bei wichtigen Schritten sofort): An ihrem Zugzähler erkennt ein zweiter PC desselben Spielers, dass er
  // nicht mehr den neuesten Stand hat (Handel, Gold, Duelle ändern sonst nichts an der Lage).
  const nurZug = sp.stand.zug !== zuletztVeroeffentlicht.zug && (sofort || Date.now() - zuletztVeroeffentlicht.lageZeit > 5 * 60 * 1000)
  if (lageText !== zuletztVeroeffentlicht.lage || nurZug) {
    const rev = meineRev.lage + 1
    const r = await netzLegeAn(datei(u, 'lage', rev), await versiegle('lage', u, rev, lage))
    // (die eigene Lage kennt dieser Lauf jetzt — sie muss beim nächsten Abgleich nicht vom Laufwerk gelesen werden)
    if (r.ok && r.wert === 'ok') { const b = bekannt.get(sicher(u)); if (b) { b.lageRev = rev; b.lage = lage }
      meineRev.lage = rev; eigenGut.lage = rev; zuletztVeroeffentlicht.lage = lageText; zuletztVeroeffentlicht.zug = lage.zug; zuletztVeroeffentlicht.lageZeit = Date.now(); if (rev > 2) void netzLoesche(datei(u, 'lage', rev - 2)) }
    else if (r.ok && r.wert === 'vorhanden') meineRev.lage = rev
  }
}

/** o = Schlüssel des Ortes: steht im versiegelten Inhalt, damit eine Fund-Datei nicht an einen anderen Ort kopiert werden kann */
interface FundInhalt { o: string; k: string; n: string; a: string; tag: number }

/** Gemeldete Entdeckungen beanspruchen und bei frisch Gesichtetem nachsehen, ob schon jemand dort war.
 *  Höchstens 40 je Durchgang; gibt true zurück, wenn danach noch welche offen sind. Was dabei an Erstentdeckungen
 *  herauskommt, wird zu EINER Meldung zusammengefasst (nach einer langen Fahrt wären es sonst ein Dutzend auf einmal). */
export async function klaereAnsprueche(): Promise<boolean> {
  const sp = spiel(), u = ich()
  if (!aktiv || !sp || !u) return false
  const tag = umwelt().tag
  let anzahl = 0, erste = 0, ruhm = 0, mehr = false
  const getauft: string[] = []
  try {
    for (const [key, e] of Object.entries(sp.stand.entdeckt)) {
      if (e.anspruch !== 0 || unbrauchbar.has(key)) continue
      if (!e.gemeldet && geprueft.has(key)) continue
      if (anzahl >= 40) { mehr = true; break }
      anzahl++
      const pfad = fundPfad(key)
      if (e.gemeldet) {
        const inhalt: FundInhalt = { o: key, k: sp.stand.kapitaen, n: e.vorschlag ?? '', a: e.art, tag }
        const r = await netzLegeAn(pfad, await versiegle('fund', u, 1, inhalt))
        if (!r.ok || r.wert === 'fehler') return false               // Laufwerk weg: später
        if (!gleicherStand()) return false                           // inzwischen ein anderer Spielstand: Der nächste Abgleich klärt es
        if (r.wert === 'ok') {
          const bonus = useTerra.getState().tue(s => anspruchErgebnis(s, key, 1, { name: e.vorschlag, seit: tag }))
          if (bonus) { erste++; ruhm += bonus; if (e.vorschlag && (e.t === 'i' || e.art === 'wunder')) getauft.push(e.vorschlag) }
        } else if (!(await uebernimmFremden(key, pfad))) return false
      } else {
        geprueft.add(key)
        if (!(await uebernimmFremden(key, pfad))) return false
      }
    }
    return mehr
  } finally {
    if (erste === 1) melde(getauft.length ? `Erstentdecker! „${getauft[0]}“ steht jetzt auf allen Karten. (+${ruhm} Ruhm)` : `Erstentdecker! (+${ruhm} Ruhm)`)
    else if (erste > 1) melde(`Erstentdecker von ${erste} Entdeckungen! (+${ruhm} Ruhm)${getauft.length ? ` – ${getauft.slice(0, 2).map(n => `„${n}“`).join(' und ')}${getauft.length > 2 ? ` und ${getauft.length - 2} weitere Namen` : ''} ${getauft.length === 1 ? 'steht' : 'stehen'} jetzt auf allen Karten.` : ''}`)
  }
}
/** Nachsehen, wer einen Ort gemeldet hat. false = das Laufwerk antwortet nicht (dann für diese Runde aufhören). */
async function uebernimmFremden(key: string, pfad: string): Promise<boolean> {
  const r = await netzLiesGenau(pfad)
  if (!r.ok || r.wert.status === 'fehler' || !gleicherStand() || !spiel()) return false
  if (r.wert.status === 'fehlt') return true                               // noch niemand: beim Melden wird angelegt
  // nicht lesbar oder kein gültiges Siegel: In diesem Lauf nicht wieder anfassen (die Datei entscheidet nichts)
  if (r.wert.status !== 'ok') { unbrauchbar.add(key); return true }
  const o = await oeffne<FundInhalt>(r.wert.daten, { art: 'fund' })
  if (!o.ok || !o.inhalt || typeof o.inhalt !== 'object' || o.inhalt.o !== key) { unbrauchbar.add(key); return true }
  if (!gleicherStand() || !spiel()) return false
  const seit = Math.max(0, Math.floor(Number(o.inhalt.tag) || 0))
  if (sicher(o.u) === sicher(ich())) { useTerra.getState().tue(s => anspruchErgebnis(s, key, 1, { name: String(o.inhalt.n ?? '').slice(0, 28) || undefined, seit })); return true }   // eigene Meldung (anderer PC, früherer Stand)
  const name = useGemeinsam.getState().aufsicht.namenAus.includes(key) ? '' : String(o.inhalt.n ?? '').slice(0, 28)
  useTerra.getState().tue(s => anspruchErgebnis(s, key, 2, { name, von: String(o.inhalt.k || o.u).slice(0, 28), seit }))
  return true
}

// ── Flaschenpost und Geschenke ──
export function wirfFlasche(text: string): boolean {
  const sp = spiel(), sauber = text.replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)
  if (!sp || !sauber || sp.stand.imHafen !== null) return false
  useTerra.getState().tue(s => {
    s.stand.flaschenRaus.push({ id: `${sicher(s.stand.benutzer).slice(0, 40)}-${s.stand.zug}`, q: s.stand.q, r: s.stand.r, text: sauber, tag: umwelt().tag })
    if (s.stand.flaschenRaus.length > 20) s.stand.flaschenRaus.shift()
    s.stand.zug++
  })
  void veroeffentliche(true)
  return true
}
/** Kann dieser PC gerade Geschenke verschicken? (nur mit Verbindung und wenn er den maßgeblichen Stand hat) */
export function kannSchenken(): boolean {
  const g = useGemeinsam.getState(), sp = spiel()
  return !!sp && g.verbunden === true && buchOk && useTerra.getState().standNr === standGesehen && !g.fremderStand && !g.veraltet && sp.stand.gabenOffen.length < GABEN_OFFEN_MAX
}
export function schenkeGold(an: string, menge: number): boolean {
  const sp = spiel(), ziel = sicher(an)
  if (!sp || !ziel || ziel === sicher(ich()) || !Number.isSafeInteger(menge) || menge < 1 || menge > sp.stand.gold || menge > 1e7 || !kannSchenken()) return false
  useTerra.getState().tue(s => {
    const nr = (s.stand.gaben.raus[ziel] ?? 0) + 1
    s.stand.gaben.raus[ziel] = nr
    s.stand.gaben.gold[ziel] = (s.stand.gaben.gold[ziel] ?? 0) + menge
    s.stand.gold -= menge
    s.stand.gabenOffen.push({ an: ziel, nr, was: 'gold', menge, tag: umwelt().tag })
    s.stand.zug++
  })
  void veroeffentliche(true)
  return true
}
/** Flaschenpost in Sichtweite, die noch nicht gefunden ist */
export function flaschenInSicht(s: TiStand, sicht: number, abstandFn: (q1: number, r1: number, q2: number, r2: number) => number): FremdFlasche[] {
  return useGemeinsam.getState().flaschen.filter(f => !s.atlas.flaschen.includes(f.id) && abstandFn(s.q, s.r, f.q, f.r) <= sicht)
}

/** Der Spieler hat entschieden, auf DIESEM PC weiterzuspielen (Sicherung übernommen oder bewusst mit dem älteren Stand):
 *  Der Zugzähler springt über den des anderen Geräts — ab jetzt gilt dieser PC, der andere stellt sich zurück. */
export function spieleHierWeiter(): void {
  const sp = spiel(), b = bekannt.get(sicher(ich()))
  if (!sp) return
  const fremd = b?.lage && b.lage.geraet !== geraeteKennung() ? b.lage.zug : 0
  if (fremd >= sp.stand.zug) useTerra.getState().tue(s => { s.stand.zug = fremd + 1 })
  useGemeinsam.setState({ fremderStand: false })
  void abgleich()
}

// ── Tagesfahrt: ein Ergebnis je Benutzer und Tag, einmal geschrieben ──
export async function meldeTag(tag: number, art: string, punkte: number, zuege: number, medaille: number): Promise<void> {
  const sp = spiel(), u = ich()
  if (!sp || !u) return
  const r = await netzLegeAn(`${TAGE}/${tag}/${sicher(u)}.json`, await versiegle('tag', u, tag, { n: sp.stand.kapitaen, art, p: punkte, z: zuege, m: medaille }))
  if (r.ok && r.wert !== 'fehler') tagGemeldet.add(tag)
}
/** Das heutige Ergebnis nachreichen, falls es beim Lösen nicht aufs Laufwerk kam (Home Office, Laufwerk kurz weg).
 *  Geschrieben wird der gewertete erste Versuch aus dem Spielstand — einmal, exklusiv. */
async function reicheTagNach(): Promise<void> {
  const sp = spiel(), u = ich()
  if (!aktiv || !sp || !u) return
  const tag = umwelt().tag, e = sp.stand.tagesfahrt[String(tag)]
  if (!e || tagGemeldet.has(tag)) return
  const r = await netzLegeAn(`${TAGE}/${tag}/${sicher(u)}.json`, await versiegle('tag', u, tag, { n: sp.stand.kapitaen, art: tagesArt(wochentag(tag)), p: e.p, z: 0, m: e.m }))
  if (r.ok && r.wert !== 'fehler') tagGemeldet.add(tag)
}
export async function ladeTag(tag: number): Promise<TagesErgebnis[] | null> {
  const liste = await netzListe(`${TAGE}/${tag}`)
  if (!liste.ok) return null
  const aus: TagesErgebnis[] = []
  for (const name of liste.wert.filter(n => /\.json$/.test(n)).slice(0, 80)) {
    const schluessel = `${tag}/${name}`
    let e = tagGelesen.get(schluessel)
    if (e === undefined) {
      const r = await netzLies<unknown>(`${TAGE}/${tag}/${name}`)
      if (!r.ok) break                                                  // Laufwerk weg: was schon da ist, zeigen
      const o = await oeffne<{ n: string; art: string; p: number; z: number; m: number }>(r.wert, { art: 'tag', rev: tag })
      e = o.ok && o.inhalt && typeof o.inhalt === 'object' && `${sicher(o.u)}.json` === name
        ? { u: sicher(o.u), n: String(o.inhalt.n ?? o.u).slice(0, 28), art: String(o.inhalt.art).slice(0, 16), p: Math.floor(Number(o.inhalt.p) || 0), z: Math.floor(Number(o.inhalt.z) || 0), m: Math.max(0, Math.min(3, Math.floor(Number(o.inhalt.m) || 0))) }
        : null
      if (r.wert !== null) tagGelesen.set(schluessel, e)                // (null = gerade nicht lesbar: beim nächsten Mal noch einmal)
    }
    if (e) aus.push(e)
  }
  return aus.sort((a, b) => a.p - b.p || a.z - b.z)
}

// ── Aufsicht (Masteradmin): unpassende Namen und Flaschenpost ausblenden ──
export async function blendeAus(was: 'name' | 'flasche', id: string): Promise<boolean> {
  const u = ich()
  if (!u) return false
  const jetzt = useGemeinsam.getState().aufsicht
  const neu: Aufsicht = { namenAus: [...jetzt.namenAus], flaschenAus: [...jetzt.flaschenAus] }
  const liste = was === 'name' ? neu.namenAus : neu.flaschenAus
  if (!liste.includes(id)) liste.push(id)
  const r = await netzSchreibe(AUFSICHT, await versiegle('aufsicht', u, 1, neu))
  if (!r.ok || !r.wert) return false
  useGemeinsam.setState({ aufsicht: neu })
  leiteAb(sicher(u))
  return true
}

// ── Sicherung des Spielstands (verschlüsselt, zwei Generationen) ──
interface SicherungInhalt { geraet: string; tag: number; zug: number; stand: string; karte: string }
export interface SicherungInfo { zug: number; tag: number; geraet: string; platz: 'a' | 'b'; hole: () => Promise<{ stand: unknown; karte: unknown } | null> }

async function liesSicherung(u: string, platz: 'a' | 'b'): Promise<{ status: 'ok' | 'fehlt' | 'unklar'; inhalt?: SicherungInhalt }> {
  const r = await netzLiesGenau(`${SICHERUNG}/${sicher(u)}.${platz}.json`)
  if (!r.ok || r.wert.status === 'fehler') return { status: 'unklar' }
  if (r.wert.status === 'fehlt') return { status: 'fehlt' }
  if (r.wert.status === 'kaputt') return { status: 'unklar' }
  const o = await oeffne<SicherungInhalt>(r.wert.daten, { art: 'sicherung', u })
  return o.ok && o.inhalt && typeof o.inhalt === 'object' && typeof o.inhalt.stand === 'string' && Number.isFinite(o.inhalt.zug) ? { status: 'ok', inhalt: o.inhalt } : { status: 'unklar' }
}

/** Sicherung schreiben (höchstens alle 10 Minuten). Überschrieben wird nur ein Platz, der sicher fehlt oder sicher älter ist. */
export async function sichereInsNetz(sofort = false): Promise<boolean> {
  const sp = spiel(), u = ich(), g = useGemeinsam.getState()
  if (!aktiv || !sp || !u || !sp.stand.kapitaen || g.fremderStand || g.veraltet) return false
  if (!sofort && Date.now() - sicherungZeit < 600000) return false
  sicherungZeit = Date.now()
  const [a, b] = [await liesSicherung(u, 'a'), await liesSicherung(u, 'b')]
  const za = a.status === 'ok' ? (a.inhalt as SicherungInhalt).zug : a.status === 'fehlt' ? -1 : null
  const zb = b.status === 'ok' ? (b.inhalt as SicherungInhalt).zug : b.status === 'fehlt' ? -1 : null
  // den älteren (oder fehlenden) Platz nehmen; ein Platz mit unklarem Inhalt wird nie angefasst
  let platz: 'a' | 'b' | null = null
  if (za !== null && (zb === null || za <= zb)) platz = 'a'
  else if (zb !== null) platz = 'b'
  if (!platz) return false
  // (der Stand kann sich während des Lesens geändert haben: jetzt noch einmal holen)
  const jetzt = spiel()
  // liegt dieser Stand (oder ein neuerer) schon auf einem der Plätze, gibt es nichts zu tun — sonst lägen bald zwei
  // gleiche Sicherungen da und die ältere Generation wäre verdrängt
  if (!jetzt || Math.max(za ?? -1, zb ?? -1) >= jetzt.stand.zug) return false
  const inhalt: SicherungInhalt = { geraet: geraeteKennung(), tag: umwelt().tag, zug: jetzt.stand.zug, stand: await verschluessle(u, JSON.stringify(jetzt.stand)), karte: await verschluessle(u, JSON.stringify(karteZuText(jetzt.karte))) }
  const r = await netzSchreibe(`${SICHERUNG}/${sicher(u)}.${platz}.json`, await versiegle('sicherung', u, inhalt.zug, inhalt))
  return r.ok && r.wert
}

/** Liegt auf dem Netzlaufwerk ein neuerer Stand als lokal? (lokalZug = −1, wenn es lokal keinen gibt) */
export async function neuereSicherung(u: string, lokalZug: number): Promise<SicherungInfo | null> {
  let beste: SicherungInfo | null = null
  for (const platz of ['a', 'b'] as const) {
    const s = await liesSicherung(u, platz)
    if (s.status !== 'ok' || !s.inhalt) continue
    const i = s.inhalt
    if (i.zug > lokalZug && (!beste || i.zug > beste.zug)) {
      beste = { zug: i.zug, tag: i.tag, geraet: i.geraet, platz, hole: async () => {
        const st = await entschluessle(u, i.stand), ka = typeof i.karte === 'string' ? await entschluessle(u, i.karte) : null
        if (!st) return null
        try { return { stand: JSON.parse(st), karte: ka ? JSON.parse(ka) : {} } } catch { return null }
      } }
    }
  }
  return beste
}
