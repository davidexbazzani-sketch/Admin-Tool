// Terra Incognita — der private Spielstand eines Spielers (liegt lokal und verschlüsselt, siehe speicher.ts).
import { pruefeGegner, type Gegner } from '../kampf/gegner'
import { pruefeAkte, type KampfAkte } from '../kampf/kampf'
import type { DruckBuch } from './waren'

/** Version des Spielstands. Ein Stand mit höherer Version (neueres Tool) wird nur gelesen, nie überschrieben.
 *  2 = Stufe 2 (Gefechte, großer Gegner, Bündnisse, Begleitschiffe), 3 = Stufe 3 (Festung, Überfälle, Duelle): Ein
 *  älteres Tool öffnet so einen Stand nicht und kann ihn deshalb auch nicht ohne die neuen Teile zurückschreiben. */
export const STAND_VERSION = 3

export type StellungArt = 'gestellt' | 'hinterhalt' | 'angriff' | 'nest' | 'gross' | 'festung'
export type KampfAusgang = 'sieg' | 'niederlage' | 'flucht' | 'remis'
/** ein vergangener Kampf im Logbuch — mit Aufstellung und Befehlen, damit er sich als Wiederholung ansehen lässt */
export interface ChronikEintrag { nr: number; tag: number; art: StellungArt; gegner: Gegner; titel: string; ausgang: KampfAusgang; zeilen: string[]; akte: KampfAkte }
/** ein Kampf, der gerade läuft: wird nach jedem Befehl gespeichert. Wer das Tool mittendrin schließt, kommt nicht
 *  davon — beim nächsten Öffnen kämpft die Mannschaft ihn zu Ende. */
export interface LaufenderKampf { art: StellungArt; gegner: Gegner; akte: KampfAkte; ziel?: FestungsZiel }

// ── Stufe 3: Festungen, Überfälle, Duelle ──
export type BauArt = 'mauer' | 'tuerme' | 'kette' | 'lager' | 'kammer' | 'wache'
export const BAU_ARTEN: readonly BauArt[] = ['mauer', 'tuerme', 'kette', 'lager', 'kammer', 'wache']
/** ein Angriff auf meine Festung, wie er im Bericht des Angreifers stand (Chronik der Festung, mit Wiederholung) */
export interface FestungsChronik { n: number; tag: number; von: string; vn: string; aus: KampfAusgang; beute: number; zaehlt: boolean; akte: KampfAkte }
/** die eigene Festung (privat; was alle sehen dürfen, steht als FestungBild in der öffentlichen Lage) */
export interface FestungStand {
  /** Inselschlüssel ('i<q>,<r>') und das Feld, auf dem die Festung steht */
  insel: string; q: number; r: number; name: string
  /** Stufe und Gebiet der Insel, die Ware, die sie erzeugt; Tag der Gründung */
  stufe: number; gebiet: number; ware: string; seit: number
  bau: Record<BauArt, number>
  /** Schaden nach einem Überfall: Mauern und Türme in Prozent, verlorene Wachschiffe */
  schaden: { mauer: number; tuerme: number; wache: number }
  /** Ware im Lager (Einheiten) */
  lager: number
  /** echte Zeit (ms), bis zu der der Ertrag verbucht ist */
  zeit: number
  /** höchste verbuchte Nummer eines Angriffsberichts */
  gebucht: number
  /** Nummer des letzten Überfalls, der gezählt hat */
  letzterSieg: number
  /** bis einschließlich dieses Tages kann niemand angreifen (Schonfrist, neue Festung) */
  schonBis: number
  verteidigt: number
  gepluendert: number
  /** wer mich überfallen hat → bis zu welchem Tag die Vergeltung belohnt wird */
  vergeltung: Record<string, number>
  chronik: FestungsChronik[]
}
/** was der Angreifer beim Beginn einer Belagerung über die Festung wusste — daran wird nach dem Kampf gerechnet */
export interface FestungsZiel {
  /** Besitzer (Benutzer), sein Kapitänsname, Name der Festung, Insel */
  u: string; kn: string; n: string; i: string
  /** veröffentlichter Stand der Festung: verbuchte Berichte, Schonfrist, letzter gezählter Überfall */
  g0: number; sb0: number; lz0: number
  /** höchste Berichtsnummer, die der Angreifer beim Beginn kannte */
  basis: number
  /** Ware, Beute in Einheiten (schon auf den Laderaum begrenzt), Kopfgeld, Vergeltung */
  w: string; beute: number; kg: number; vg: boolean
  /** Stufe der Insel, Ausbau der Wehr (Mauern + Türme + Wachschiffe), Zahl der Wachschiffe beim Beginn */
  stufe: number; wehr: number; wachen: number
  /** eigener Rumpf und der der Begleitschiffe vor dem Kampf (gilt der Kampf als Übung, wird er wiederhergestellt) */
  rumpf: number; geleit: number[]
}
/** ein Angriffsbericht, der noch nicht auf dem Netzlaufwerk liegt (Sieg: erst dann gibt es die Beute) */
export interface OffenerBericht { ziel: FestungsZiel; aus: KampfAusgang; akte: KampfAkte; tag: number; wv: number }
/** ein Duell (offen oder entschieden). fertig = Einsatz verbucht. es = der Einsatz ist als Pfand aus der Kasse genommen
 *  (beim Einladen bzw. Annehmen); bis = echte Zeit (ms), bis zu der die Einladung gilt (nur lokal); ang = die eigene
 *  Annahme ist noch nicht sicher auf dem Netzlaufwerk; weg = die Dateien des Duells sind weggeräumt */
export interface DuellEintrag { id: string; gegner: string; gn: string; rolle: 'a' | 'b'; ein: number; tag: number; erg?: 'sieg' | 'niederlage' | 'remis'; fertig?: boolean; es?: boolean; bis?: number; ang?: boolean; weg?: boolean }
export interface KampfBuch {
  siege: number; niederlagen: number; fluchten: number; zoelle: number
  /** bezwungene Gegner je Art */
  versenkt: Record<string, number>
  /** Kopfgeld, das im nächsten Hafen ausgezahlt wird */
  kopfgeld: number
  /** Gegner (Kennung) → Tag, an dem er bezwungen, umgangen oder freigekauft wurde: an dem Tag stellt er einen nicht mehr */
  erledigt: Record<string, number>
  /** Zugzähler des letzten Hinterhalts */
  hinterhalt: number
  /** fürs Atlas: bezwungene Piratenkapitäne und Ungeheuer (Kennung → Name) */
  trophaeen: Record<string, string>
  chronik: ChronikEintrag[]
  laufend: LaufenderKampf | null
  /** laufende Nummer der Chronik */
  nr: number
  /** Stufe 3: Bericht über eine Belagerung, der noch zugestellt werden muss */
  bericht: OffenerBericht | null
  /** Kopfgeld auf mich nach eigenen Überfällen: [Gold, gilt bis Tag] */
  gesucht: [number, number][]
  /** zugestellte Angriffsberichte, deren Beute verbucht ist ('<verteidiger>/<nummer>'): steht auch im öffentlichen
   *  Buch — ein zurückgespielter Stand mit demselben offenen Bericht bekommt die Beute nicht noch einmal */
  zugestellt: string[]
}
/** der große Gegner der Woche: eigener Beitrag dieser Woche (w = Wochennummer) und der Woche davor */
export interface GrossBuch { w: number; schaden: number; hp: number; kaempfe: number; tag: number; vorher: [number, number, number, number] | null; bezahlt: number[] }
export type BundRolle = 'antrag' | 'mitglied' | 'gruender'
/** das eigene Bündnis (oder der Antrag darauf) */
export interface BundStand { key: string; name: string; rolle: BundRolle; fl: [number, number, number, number]; seit: number; mitglieder: string[]; nein: string[]; gruender: string }
export interface Geleit { klasse: number; name: string; rumpf: number }

export interface Entdeckung {
  /** 'o' = Ort, 'i' = Insel */
  t: 'o' | 'i'
  /** Ortsart oder 'insel' */
  art: string
  q: number
  r: number
  stufe: number
  /** Tag der Sichtung (Tagesnummer) */
  tag: number
  /** im Hafen gemeldet (Ruhm und Gold erhalten) */
  gemeldet: boolean
  /** 0 = Anspruch noch offen, 1 = ich bin Erstentdecker, 2 = jemand war früher, 3 = seit jeher bekannt (Heimat) */
  anspruch: 0 | 1 | 2 | 3
  /** gültiger Taufname (Inseln) */
  name?: string
  /** mein Namenswunsch für die Meldung */
  vorschlag?: string
  /** Erstentdecker, wenn es jemand anders war: Kapitänsname */
  von?: string
  /** Tag der Erstmeldung (Tagesnummer) */
  seit?: number
  /** an Land gewesen / untersucht */
  besucht?: boolean
  /** Größe der Insel in Feldern */
  felder?: number
}

export interface Auftrag {
  id: string
  art: 'fracht' | 'post' | 'vermessung' | 'suche'
  /** Hafen, der den Auftrag vergeben hat */
  von: string
  /** Zielhafen (Fracht, Post) */
  ziel?: string
  ware?: string
  menge?: number
  /** Vermessung: Gebiet und Zahl neuer Felder; Suche: Ortsart */
  gebiet?: number
  felder?: number
  sucheArt?: string
  /** Fortschritt (vermessene Felder / gefunden) */
  stand: number
  gold: number
  ruhm: number
  text: string
}

export interface Schatzkarte {
  id: string
  /** Fundort der Karte */
  vq: number
  vr: number
  /** das Feld mit dem Schatz */
  q: number
  r: number
  stufe: number
  gehoben?: boolean
}

export interface Geruecht {
  /** das Feld, um das es wirklich geht */
  q: number
  r: number
  art: string
  /** von wem das Gerücht stammt ('' = Seemannsgarn aus der Taverne, sonst Kapitänsname eines Kollegen) */
  von: string
  tag: number
}

export interface Gabe { an: string; nr: number; was: string; menge: number; tag: number }
export interface FlascheRaus { id: string; q: number; r: number; text: string; tag: number }

export interface RaetselStand { geloest?: boolean; versuche?: number; daten?: unknown }

export interface TiEinstellungen { ton: boolean; musik: boolean; laut: number; wind: boolean; schnell: boolean }

export interface TiStand {
  v: number
  benutzer: string
  /** eigener Zufalls-Startwert dieses Spielstands (für Ereignisse) */
  saat: number
  kapitaen: string
  schiffName: string
  /** Flagge: [Muster, Farbe 1, Farbe 2, Zeichen] */
  flagge: [number, number, number, number]
  begonnenTag: number
  /** Zähler aller Spielzüge — wächst nur; daran erkennt man den neueren Stand */
  zug: number
  q: number
  r: number
  kurs: number
  /** Schlüssel des Ortes (Hafen oder Dorf), in dem das Schiff liegt */
  imHafen: string | null
  /** letzter angelaufener Hafen — dorthin bringt die Mannschaft das Schiff zurück, wenn der Proviant ausgeht */
  letzterHafen: string
  /** Proviant in Stunden */
  proviant: number
  gold: number
  ruhm: number
  rumpf: number
  klasse: number
  ausbauten: string[]
  offiziere: string[]
  ladung: Record<string, number>
  /** durchschnittlicher Einkaufspreis je Ware (nur Anzeige) */
  einkauf: Record<string, number>
  /** Stunden auf See insgesamt (die Uhr des Spiels) */
  stunden: number
  entdeckt: Record<string, Entdeckung>
  /** Lohn der Gilde für neu vermessene Felder, der im nächsten Hafen ausgezahlt wird (in Hundertstel Gold) */
  gildeLohn: number
  /** neu vermessene Felder seit der letzten Meldung */
  neueFelder: number
  kursbuch: Record<string, { std: number; tag: number; p: Record<string, [number, number]> }>
  druck: DruckBuch
  auftraege: Auftrag[]
  /** Kontore: Hafen → Stufe */
  kontore: Record<string, number>
  /** echte Zeit (ms), bis zu der der Kontor-Ertrag abgerechnet ist */
  kontorZeit: number
  /** Proviantstellen und Fischgründe: Ort → Stunden-Stand der letzten Nutzung */
  genutzt: Record<string, number>
  /** einmalige Fundstellen, die erledigt sind */
  erledigt: Record<string, 1>
  raetsel: Record<string, RaetselStand>
  schatzkarten: Schatzkarte[]
  /** Gerüchte: ungefähr dort soll es etwas geben (auf der Karte als Fragezeichen) */
  geruechte: Geruecht[]
  atlas: { tiere: string[]; kurios: string[]; legende: number; flaschen: string[]; offiziere: string[] }
  /** zuletzt erlebte Ereignisse (damit sie sich nicht gleich wiederholen) */
  erlebt: string[]
  tagesfahrt: Record<string, { p: number; m: number }>
  medaillen: [number, number, number]
  einstellungen: TiEinstellungen
  gesehen: Record<string, 1>
  /** Geschenke: höchste verschickte Nummer je Empfänger, höchste verbuchte Nummer je Absender, verschenktes Gold je
   *  Empfänger (Summe über alle Nummern — damit lässt sich nach einem zurückgespielten Stand nachrechnen, was fehlt) */
  gaben: { raus: Record<string, number>; rein: Record<string, number>; gold: Record<string, number> }
  /** verschickte Geschenke, die der Empfänger noch nicht verbucht hat (stehen in meiner öffentlichen Datei) */
  gabenOffen: Gabe[]
  /** Flaschenpost, die ich ausgesetzt habe (steht in meiner öffentlichen Datei) */
  flaschenRaus: FlascheRaus[]
  statistik: { felder: number; weiteste: number; fahrten: number; umkehr: number; gehandelt: number }
  /** späteste echte Zeit (ms), die dieser Stand gesehen hat — Schutz gegen eine zurückgestellte Uhr */
  zeitGesehen: number
  // ── Stufe 2 ──
  kampf: KampfBuch
  gross: GrossBuch
  bund: BundStand | null
  /** Begleitschiffe (höchstens zwei) */
  geleit: Geleit[]
  // ── Stufe 3 ──
  festung: FestungStand | null
  duelle: DuellEintrag[]
}

export const leeresKampfBuch = (): KampfBuch => ({ siege: 0, niederlagen: 0, fluchten: 0, zoelle: 0, versenkt: {}, kopfgeld: 0, erledigt: {}, hinterhalt: -1000, trophaeen: {}, chronik: [], laufend: null, nr: 0, bericht: null, gesucht: [], zugestellt: [] })
/** so viele zugestellte Berichte merkt sich der Stand (und das Buch) */
export const ZUGESTELLT_MAX = 30
/** Einträge in kampf.erledigt, die älter sind, braucht keiner mehr (Piraten ziehen täglich um, ein Nest erholt sich nach
 *  sieben Tagen): Sie werden beim Laden und beim Eintragen weggeräumt — sonst wüchse die Liste ohne Ende */
export const ERLEDIGT_TAGE = 10
export const ERLEDIGT_MAX = 600
/** Gegner als erledigt vermerken (und dabei Altes wegräumen) */
export function merkeErledigt(s: TiStand, kennung: string, tag: number): void {
  s.kampf.erledigt[kennung] = tag
  const k = Object.keys(s.kampf.erledigt)
  if (k.length <= ERLEDIGT_MAX / 2) return
  for (const x of k) if (s.kampf.erledigt[x] < tag - ERLEDIGT_TAGE) delete s.kampf.erledigt[x]
  const rest = Object.entries(s.kampf.erledigt)
  if (rest.length > ERLEDIGT_MAX) { rest.sort((a, b) => b[1] - a[1]); s.kampf.erledigt = Object.fromEntries(rest.slice(0, ERLEDIGT_MAX)) }
}
export const CHRONIK_MAX = 10
export const FESTUNG_CHRONIK_MAX = 8
export const DUELLE_MAX = 60
/** Die Liste der Duelle kürzen: offene bleiben immer; zuerst gehen die ältesten ohne Gold-Folgen (Unentschieden,
 *  Abgelehnt …), dann die ältesten überhaupt. (Was Gold bewegt hat, steht so lange wie möglich im Buch.) */
export function kuerzeDuelle(s: TiStand): void {
  while (s.duelle.length > DUELLE_MAX) {
    let i = s.duelle.findIndex(d => d.fertig && (d.erg === 'remis' || !d.ein))
    if (i < 0) i = s.duelle.findIndex(d => d.fertig)
    if (i < 0) break
    s.duelle.splice(i, 1)
  }
}

export function leererStand(benutzer: string, saat: number, tag: number, jetzt: number): TiStand {
  return {
    v: STAND_VERSION, benutzer: benutzer.toLowerCase(), saat: saat >>> 0, kapitaen: '', schiffName: '', flagge: [0, 0, 1, 0], begonnenTag: tag, zug: 0,
    q: 1, r: 0, kurs: 0, imHafen: '0,0', letzterHafen: '0,0', proviant: 8 * 24, gold: 60, ruhm: 0, rumpf: 10, klasse: 0, ausbauten: [], offiziere: [],
    ladung: {}, einkauf: {}, stunden: 0, entdeckt: {}, gildeLohn: 0, neueFelder: 0, kursbuch: {}, druck: {}, auftraege: [], kontore: {}, kontorZeit: jetzt,
    genutzt: {}, erledigt: {}, raetsel: {}, schatzkarten: [], geruechte: [], atlas: { tiere: [], kurios: [], legende: 0, flaschen: [], offiziere: [] }, erlebt: [],
    tagesfahrt: {}, medaillen: [0, 0, 0], einstellungen: { ton: true, musik: true, laut: 35, wind: true, schnell: false }, gesehen: {},
    gaben: { raus: {}, rein: {}, gold: {} }, gabenOffen: [], flaschenRaus: [], statistik: { felder: 0, weiteste: 0, fahrten: 0, umkehr: 0, gehandelt: 0 }, zeitGesehen: jetzt,
    kampf: leeresKampfBuch(), gross: { w: 0, schaden: 0, hp: 0, kaempfe: 0, tag: 0, vorher: null, bezahlt: [] }, bund: null, geleit: [],
    festung: null, duelle: [],
  }
}

// ── Prüfen beim Laden: nie abstürzen, nichts Unsinniges durchlassen ──
const zahl = (x: unknown, ersatz: number, von = -1e12, bis = 1e12): number => (typeof x === 'number' && Number.isFinite(x) ? Math.min(bis, Math.max(von, x)) : ersatz)
const ganz = (x: unknown, ersatz: number, von = 0, bis = 1e12): number => Math.floor(zahl(x, ersatz, von, bis))
const text = (x: unknown, max: number, ersatz = ''): string => (typeof x === 'string' ? x.slice(0, max) : ersatz)
const objekt = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {})
const liste = (x: unknown, max: number): unknown[] => (Array.isArray(x) ? x.slice(0, max) : [])
const texte = (x: unknown, max: number, laenge = 40): string[] => liste(x, max).filter((s): s is string => typeof s === 'string').map(s => s.slice(0, laenge))
function zahlBuch(x: unknown, max: number, von = 0, bis = 1e12): Record<string, number> {
  const aus: Record<string, number> = {}
  let n = 0
  for (const [k, v] of Object.entries(objekt(x))) { if (n++ >= max) break; if (typeof v === 'number' && Number.isFinite(v)) aus[k.slice(0, 40)] = Math.min(bis, Math.max(von, v)) }
  return aus
}
/** Tag-Buch (Kennung → Tag): nur Einträge ab dem Tag `ab`, davon höchstens `max` — die JÜNGSTEN bleiben */
function juengste(x: unknown, max: number, ab: number): Record<string, number> {
  const alle = Object.entries(objekt(x)).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] >= ab)
  alle.sort((a, b) => b[1] - a[1])
  const aus: Record<string, number> = {}
  for (const [k, v] of alle.slice(0, max)) aus[k.slice(0, 40)] = Math.min(1e6, Math.max(0, Math.floor(v)))
  return aus
}

export type PruefErgebnis = { ok: true; stand: TiStand } | { ok: false; grund: 'neuer' | 'fremd' | 'kaputt' }

/** Geladene Daten in einen gültigen Spielstand verwandeln. Wirft nie. */
export function pruefeStand(roh: unknown, benutzer: string, tag: number, jetzt: number): PruefErgebnis {
  try {
    const d = objekt(roh)
    if (typeof d.v !== 'number' || d.v < 1) return { ok: false, grund: 'kaputt' }
    if (d.v > STAND_VERSION) return { ok: false, grund: 'neuer' }
    if (typeof d.benutzer !== 'string' || d.benutzer.toLowerCase() !== benutzer.toLowerCase()) return { ok: false, grund: 'fremd' }
    const s = leererStand(benutzer, ganz(d.saat, 1, 0, 0xFFFFFFFF), ganz(d.begonnenTag, tag, 0, 1e6), jetzt)
    s.kapitaen = text(d.kapitaen, 28); s.schiffName = text(d.schiffName, 28)
    const fl = liste(d.flagge, 4)
    s.flagge = [ganz(fl[0], 0, 0, 20), ganz(fl[1], 0, 0, 20), ganz(fl[2], 1, 0, 20), ganz(fl[3], 0, 0, 40)]
    s.zug = ganz(d.zug, 0)
    s.q = ganz(d.q, 1, -30000, 30000); s.r = ganz(d.r, 0, -30000, 30000); s.kurs = ganz(d.kurs, 0, 0, 5)
    s.imHafen = typeof d.imHafen === 'string' ? d.imHafen.slice(0, 20) : null
    s.letzterHafen = text(d.letzterHafen, 20, '0,0') || '0,0'
    s.proviant = ganz(d.proviant, 0, 0, 1e6); s.gold = ganz(d.gold, 0, 0, 1e10); s.ruhm = ganz(d.ruhm, 0, 0, 1e9); s.rumpf = ganz(d.rumpf, 1, 0, 1000)
    s.klasse = ganz(d.klasse, 0, 0, 20)
    s.ausbauten = texte(d.ausbauten, 20); s.offiziere = texte(d.offiziere, 10)
    s.ladung = zahlBuch(d.ladung, 40, 0, 1e6); s.einkauf = zahlBuch(d.einkauf, 40, 0, 1e9)
    s.stunden = ganz(d.stunden, 0)
    for (const [k, v] of Object.entries(objekt(d.entdeckt))) {
      const e = objekt(v)
      if (e.t !== 'o' && e.t !== 'i') continue
      const a = ganz(e.anspruch, 0, 0, 3) as 0 | 1 | 2 | 3
      const ent: Entdeckung = { t: e.t, art: text(e.art, 16), q: ganz(e.q, 0, -30000, 30000), r: ganz(e.r, 0, -30000, 30000), stufe: ganz(e.stufe, 0, 0, 9), tag: ganz(e.tag, tag, 0, 1e6), gemeldet: e.gemeldet === true, anspruch: a }
      if (typeof e.name === 'string') ent.name = e.name.slice(0, 28)
      if (typeof e.vorschlag === 'string') ent.vorschlag = e.vorschlag.slice(0, 28)
      if (typeof e.von === 'string') ent.von = e.von.slice(0, 40)
      if (typeof e.seit === 'number') ent.seit = ganz(e.seit, tag, 0, 1e6)
      if (e.besucht === true) ent.besucht = true
      if (typeof e.felder === 'number') ent.felder = ganz(e.felder, 1, 1, 1000)
      s.entdeckt[k.slice(0, 20)] = ent
    }
    s.gildeLohn = ganz(d.gildeLohn, 0); s.neueFelder = ganz(d.neueFelder, 0)
    for (const [k, v] of Object.entries(objekt(d.kursbuch))) {
      const e = objekt(v), p: Record<string, [number, number]> = {}
      for (const [w, pr] of Object.entries(objekt(e.p))) { const a = liste(pr, 2); p[w.slice(0, 16)] = [ganz(a[0], 0), ganz(a[1], 0)] }
      s.kursbuch[k.slice(0, 20)] = { std: ganz(e.std, 0), tag: ganz(e.tag, tag, 0, 1e6), p }
    }
    for (const [k, v] of Object.entries(objekt(d.druck))) {
      const ziel: Record<string, { v: number; k: number; std: number }> = {}
      for (const [w, dr] of Object.entries(objekt(v))) { const e = objekt(dr); ziel[w.slice(0, 16)] = { v: ganz(e.v, 0, 0, 1e4), k: ganz(e.k, 0, 0, 1e4), std: ganz(e.std, 0) } }
      s.druck[k.slice(0, 20)] = ziel
    }
    s.auftraege = liste(d.auftraege, 6).map(x => objekt(x)).filter(a => ['fracht', 'post', 'vermessung', 'suche'].includes(a.art as string)).map(a => ({
      id: text(a.id, 40), art: a.art as Auftrag['art'], von: text(a.von, 20), ziel: typeof a.ziel === 'string' ? a.ziel.slice(0, 20) : undefined,
      ware: typeof a.ware === 'string' ? a.ware.slice(0, 16) : undefined, menge: typeof a.menge === 'number' ? ganz(a.menge, 1, 1, 1000) : undefined,
      gebiet: typeof a.gebiet === 'number' ? ganz(a.gebiet, 0, 0, 9) : undefined, felder: typeof a.felder === 'number' ? ganz(a.felder, 1, 1, 1e5) : undefined,
      sucheArt: typeof a.sucheArt === 'string' ? a.sucheArt.slice(0, 16) : undefined, stand: ganz(a.stand, 0), gold: ganz(a.gold, 0), ruhm: ganz(a.ruhm, 0), text: text(a.text, 300),
    }))
    s.kontore = zahlBuch(d.kontore, 30, 1, 5)
    s.kontorZeit = zahl(d.kontorZeit, jetzt, 0, jetzt)
    s.genutzt = zahlBuch(d.genutzt, 5000)
    for (const k of Object.keys(objekt(d.erledigt)).slice(0, 20000)) s.erledigt[k.slice(0, 24)] = 1
    for (const [k, v] of Object.entries(objekt(d.raetsel)).slice(0, 5000)) { const e = objekt(v); s.raetsel[k.slice(0, 24)] = { geloest: e.geloest === true, versuche: ganz(e.versuche, 0, 0, 1e4), daten: e.daten } }
    s.schatzkarten = liste(d.schatzkarten, 40).map(x => objekt(x)).map(k => ({ id: text(k.id, 24), vq: ganz(k.vq, 0, -30000, 30000), vr: ganz(k.vr, 0, -30000, 30000), q: ganz(k.q, 0, -30000, 30000), r: ganz(k.r, 0, -30000, 30000), stufe: ganz(k.stufe, 0, 0, 9), gehoben: k.gehoben === true }))
    s.geruechte = liste(d.geruechte, 16).map(x => objekt(x)).map(g => ({ q: ganz(g.q, 0, -30000, 30000), r: ganz(g.r, 0, -30000, 30000), art: text(g.art, 16), von: text(g.von, 40), tag: ganz(g.tag, tag, 0, 1e6) }))
    const at = objekt(d.atlas)
    s.atlas = { tiere: texte(at.tiere, 200), kurios: texte(at.kurios, 200), legende: ganz(at.legende, 0, 0, 50), flaschen: texte(at.flaschen, 400, 60), offiziere: texte(at.offiziere, 40) }
    s.erlebt = texte(d.erlebt, 12)
    for (const [k, v] of Object.entries(objekt(d.tagesfahrt)).slice(-40)) { const e = objekt(v); s.tagesfahrt[k.slice(0, 8)] = { p: ganz(e.p, 0), m: ganz(e.m, 0, 0, 3) } }
    const md = liste(d.medaillen, 3)
    s.medaillen = [ganz(md[0], 0), ganz(md[1], 0), ganz(md[2], 0)]
    const es = objekt(d.einstellungen)
    s.einstellungen = { ton: es.ton !== false, musik: es.musik !== false, laut: ganz(es.laut, 35, 0, 100), wind: es.wind !== false, schnell: es.schnell === true }
    for (const k of Object.keys(objekt(d.gesehen)).slice(0, 200)) s.gesehen[k.slice(0, 30)] = 1
    const gb = objekt(d.gaben)
    s.gaben = { raus: zahlBuch(gb.raus, 200), rein: zahlBuch(gb.rein, 200), gold: zahlBuch(gb.gold, 200) }
    s.gabenOffen = liste(d.gabenOffen, 60).map(x => objekt(x)).filter(g => typeof g.an === 'string' && typeof g.was === 'string').map(g => ({ an: text(g.an, 60), nr: ganz(g.nr, 1, 1), was: text(g.was, 16), menge: ganz(g.menge, 1, 1, 1e7), tag: ganz(g.tag, tag, 0, 1e6) }))
    s.flaschenRaus = liste(d.flaschenRaus, 20).map(x => objekt(x)).filter(f => typeof f.text === 'string').map(f => ({ id: text(f.id, 60), q: ganz(f.q, 0, -30000, 30000), r: ganz(f.r, 0, -30000, 30000), text: text(f.text, 160), tag: ganz(f.tag, tag, 0, 1e6) }))
    const st = objekt(d.statistik)
    s.statistik = { felder: ganz(st.felder, 0), weiteste: ganz(st.weiteste, 0, 0, 60000), fahrten: ganz(st.fahrten, 0), umkehr: ganz(st.umkehr, 0), gehandelt: ganz(st.gehandelt, 0) }
    s.zeitGesehen = zahl(d.zeitGesehen, jetzt, 0, 1e15)
    // ── Stufe 2 (in einem Stand der Version 1 fehlt das alles: dann bleibt es leer) ──
    const kb = objekt(d.kampf)
    s.kampf = {
      siege: ganz(kb.siege, 0), niederlagen: ganz(kb.niederlagen, 0), fluchten: ganz(kb.fluchten, 0), zoelle: ganz(kb.zoelle, 0),
      versenkt: zahlBuch(kb.versenkt, 20), kopfgeld: ganz(kb.kopfgeld, 0, 0, 1e9), erledigt: juengste(kb.erledigt, ERLEDIGT_MAX, tag - ERLEDIGT_TAGE),
      hinterhalt: Math.floor(zahl(kb.hinterhalt, -1000)), trophaeen: {}, chronik: [], laufend: null, nr: ganz(kb.nr, 0), bericht: null, gesucht: [],
      zugestellt: texte(kb.zugestellt, ZUGESTELLT_MAX, 80).filter(x => /^[a-z0-9._-]{1,60}\/\d{1,12}$/.test(x)),
    }
    for (const [k, v] of Object.entries(objekt(kb.trophaeen)).slice(0, 300)) if (typeof v === 'string') s.kampf.trophaeen[k.slice(0, 40)] = v.slice(0, 60)
    for (const x of liste(kb.chronik, CHRONIK_MAX)) {
      const e = objekt(x), akte = pruefeAkte(e.akte), gegner = pruefeGegner(e.gegner)
      if (!akte || !gegner || !AUSGAENGE.includes(e.ausgang as string) || !STELLUNGEN.includes(e.art as string)) continue
      s.kampf.chronik.push({ nr: ganz(e.nr, 0), tag: ganz(e.tag, tag, 0, 1e6), art: e.art as StellungArt, gegner, titel: text(e.titel, 80), ausgang: e.ausgang as KampfAusgang, zeilen: texte(e.zeilen, 12, 120), akte })
    }
    const lf = objekt(kb.laufend), lfAkte = pruefeAkte(lf.akte), lfGegner = pruefeGegner(lf.gegner)
    if (lfAkte && lfGegner && STELLUNGEN.includes(lf.art as string)) {
      s.kampf.laufend = { art: lf.art as StellungArt, gegner: lfGegner, akte: lfAkte }
      // eine Belagerung ohne ihr Ziel lässt sich nicht abrechnen: dann gibt es sie nicht
      if (lf.art === 'festung') { const z = pruefeZiel(lf.ziel); if (z) s.kampf.laufend.ziel = z; else s.kampf.laufend = null }
    }
    const gr = objekt(d.gross), vor = liste(gr.vorher, 4)
    s.gross = {
      w: ganz(gr.w, 0, 0, 1e6), schaden: ganz(gr.schaden, 0, 0, 1e9), hp: ganz(gr.hp, 0, 0, 1e9), kaempfe: ganz(gr.kaempfe, 0, 0, 1e4), tag: ganz(gr.tag, 0, 0, 1e6),
      vorher: vor.length === 4 && vor.every(v => typeof v === 'number') ? [ganz(vor[0], 0, 0, 1e6), ganz(vor[1], 0, 0, 1e9), ganz(vor[2], 0, 0, 1e9), ganz(vor[3], 0, 0, 1e4)] : null,
      bezahlt: liste(gr.bezahlt, 12).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).map(v => Math.floor(v)),
    }
    const bd = objekt(d.bund)
    if (typeof bd.key === 'string' && /^[a-z0-9_-]{1,40}$/.test(bd.key) && ['antrag', 'mitglied', 'gruender'].includes(bd.rolle as string)) {
      const bfl = liste(bd.fl, 4)
      s.bund = { key: bd.key, name: text(bd.name, 28), rolle: bd.rolle as BundRolle, fl: [ganz(bfl[0], 0, 0, 20), ganz(bfl[1], 0, 0, 20), ganz(bfl[2], 1, 0, 20), ganz(bfl[3], 0, 0, 40)], seit: ganz(bd.seit, tag, 0, 1e6), mitglieder: texte(bd.mitglieder, 30, 60), nein: texte(bd.nein, 30, 60), gruender: text(bd.gruender, 60) }
    }
    s.geleit = liste(d.geleit, 2).map(x => objekt(x)).filter(g => typeof g.klasse === 'number').map(g => ({ klasse: ganz(g.klasse, 0, 0, 5), name: text(g.name, 28), rumpf: ganz(g.rumpf, 0, 0, 1000) }))
    // ── Stufe 3 (in einem Stand der Version 1 oder 2 fehlt das alles: dann bleibt es leer) ──
    const ob = objekt(kb.bericht), obZiel = pruefeZiel(ob.ziel), obAkte = pruefeAkte(ob.akte)
    if (obZiel && obAkte && AUSGAENGE.includes(ob.aus as string)) s.kampf.bericht = { ziel: obZiel, aus: ob.aus as KampfAusgang, akte: obAkte, tag: ganz(ob.tag, tag, 0, 1e6), wv: ganz(ob.wv, 0, 0, 3) }
    s.kampf.gesucht = liste(kb.gesucht, 30).filter((x): x is unknown[] => Array.isArray(x) && x.length === 2).map(x => [ganz(x[0], 0, 0, 1e7), ganz(x[1], 0, 0, 1e6)] as [number, number]).filter(x => x[0] > 0)
    s.festung = pruefeFestung(d.festung, tag, jetzt)
    s.duelle = liste(d.duelle, DUELLE_MAX).map(x => objekt(x)).filter(e => typeof e.id === 'string' && /^[a-z0-9_.-]{6,100}$/.test(e.id) && typeof e.gegner === 'string').map(e => {
      const de: DuellEintrag = { id: e.id as string, gegner: text(e.gegner, 60), gn: text(e.gn, 40), rolle: e.rolle === 'b' ? 'b' : 'a', ein: ganz(e.ein, 0, 0, 1e6), tag: ganz(e.tag, tag, 0, 1e6) }
      if (e.erg === 'sieg' || e.erg === 'niederlage' || e.erg === 'remis') de.erg = e.erg
      if (e.fertig === true) de.fertig = true
      if (e.es === true) de.es = true
      if (typeof e.bis === 'number' && Number.isFinite(e.bis)) de.bis = zahl(e.bis, 0, 0, 1e15)
      if (e.ang === true) de.ang = true
      if (e.weg === true) de.weg = true
      return de
    })
    return { ok: true, stand: s }
  } catch {
    return { ok: false, grund: 'kaputt' }
  }
}

const AUSGAENGE = ['sieg', 'niederlage', 'flucht', 'remis'], STELLUNGEN = ['gestellt', 'hinterhalt', 'angriff', 'nest', 'gross', 'festung']
const BENUTZER = /^[a-z0-9._-]{1,60}$/
const INSEL = /^i-?\d{1,5},-?\d{1,5}$/

function pruefeZiel(x: unknown): FestungsZiel | null {
  const z = objekt(x)
  if (typeof z.u !== 'string' || !BENUTZER.test(z.u) || typeof z.i !== 'string' || !INSEL.test(z.i)) return null
  return {
    u: z.u, kn: text(z.kn, 28), n: text(z.n, 40), i: z.i,
    g0: ganz(z.g0, 0), sb0: ganz(z.sb0, 0, 0, 1e6), lz0: ganz(z.lz0, 0), basis: ganz(z.basis, 0),
    w: text(z.w, 16, 'salz') || 'salz', beute: ganz(z.beute, 0, 0, 1e6), kg: ganz(z.kg, 0, 0, 1e7), vg: z.vg === true,
    stufe: ganz(z.stufe, 0, 0, 9), wehr: ganz(z.wehr, 0, 0, 30), wachen: ganz(z.wachen, 0, 0, 3),
    rumpf: ganz(z.rumpf, 1, 1, 1000), geleit: liste(z.geleit, 2).map(v => ganz(v, 0, 0, 1000)),
  }
}

/** Die eigene Festung prüfen (fehlt sie oder ist sie unbrauchbar: keine) */
function pruefeFestung(x: unknown, tag: number, jetzt: number): FestungStand | null {
  const f = objekt(x)
  if (typeof f.insel !== 'string' || !INSEL.test(f.insel)) return null
  const bau = objekt(f.bau), sd = objekt(f.schaden)
  const fs: FestungStand = {
    insel: f.insel, q: ganz(f.q, 0, -30000, 30000), r: ganz(f.r, 0, -30000, 30000), name: text(f.name, 28) || 'Festung',
    stufe: ganz(f.stufe, 1, 0, 9), gebiet: ganz(f.gebiet, 1, 0, 9), ware: text(f.ware, 16, 'salz') || 'salz', seit: ganz(f.seit, tag, 0, 1e6),
    bau: { mauer: ganz(bau.mauer, 1, 1, 5), tuerme: ganz(bau.tuerme, 1, 0, 5), kette: ganz(bau.kette, 0, 0, 3), lager: ganz(bau.lager, 1, 1, 5), kammer: ganz(bau.kammer, 0, 0, 5), wache: ganz(bau.wache, 0, 0, 3) },
    schaden: { mauer: ganz(sd.mauer, 0, 0, 100), tuerme: ganz(sd.tuerme, 0, 0, 100), wache: ganz(sd.wache, 0, 0, 3) },
    lager: ganz(f.lager, 0, 0, 1e6), zeit: zahl(f.zeit, jetzt, 0, 1e15), gebucht: ganz(f.gebucht, 0), letzterSieg: ganz(f.letzterSieg, 0), schonBis: ganz(f.schonBis, 0, 0, 1e6),
    verteidigt: ganz(f.verteidigt, 0), gepluendert: ganz(f.gepluendert, 0), vergeltung: {}, chronik: [],
  }
  for (const [k, v] of Object.entries(objekt(f.vergeltung)).slice(0, 60)) if (BENUTZER.test(k) && typeof v === 'number' && Number.isFinite(v)) fs.vergeltung[k] = ganz(v, 0, 0, 1e6)
  for (const c of liste(f.chronik, FESTUNG_CHRONIK_MAX)) {
    const e = objekt(c), akte = pruefeAkte(e.akte)
    if (!akte || !AUSGAENGE.includes(e.aus as string)) continue
    fs.chronik.push({ n: ganz(e.n, 0), tag: ganz(e.tag, tag, 0, 1e6), von: text(e.von, 60), vn: text(e.vn, 28), aus: e.aus as KampfAusgang, beute: ganz(e.beute, 0, 0, 1e6), zaehlt: e.zaehlt === true, akte })
  }
  return fs
}
