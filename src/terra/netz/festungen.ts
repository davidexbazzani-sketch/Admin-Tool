// Terra Incognita — Festungen auf dem Netzlaufwerk (Stufe 3).
//
//  terra/festungen/<insel>.json                Anspruch auf eine Insel: exklusiv angelegt — eine Festung je Insel
//  terra/angriffe/<verteidiger>/<n>.json       Angriffsbericht Nr. n, exklusiv angelegt: Der Dateiserver bringt die
//                                              Überfälle in eine feste Reihenfolge. Es zählt, wer zuerst fertig ist —
//                                              das Gefecht des anderen gilt als Übung (kern/festung.ts: werteAus).
//  terra/angriffe/<verteidiger>/b_<angreifer>.json   „wird gerade belagert“ (schreibt der Angreifer; solange er liegt,
//                                              bleibt das Lager des Verteidigers verschlossen)
//
// Die Beute steht fest im Bericht. Der Verteidiger verbucht die Berichte der Reihe nach, bevor er an seiner Festung
// etwas tun kann; was er verbucht hat, steht in seiner Lage (g, lz, sb). Daran setzt der nächste Angreifer an.
// Nummern weit über dem Verbuchten (mehr als NUMMERN_LUFT) übergeht jeder: Eine untergeschobene Datei mit riesiger
// Nummer verdeckt so nichts und verschiebt nichts.
// Wie alles Gemeinsame: nur durch die Schleuse, nur solange der Raum offen ist, nie Uhrzeiten (nur Kalendertage).
import { create } from 'zustand'
import { auskaempfen, nachspielen, pruefeAkte } from '../kampf/kampf'
import {
  berichtZugestellt, bucheBericht, erntet, gibAuf, gruende, hole, kannGruenden, NEBEL_TAGE, repariere, schutzVon, werteAus, wendeAn, zielVon,
  type AngriffsBericht, type FestungBild, type Schutz,
} from '../kern/festung'
import { abstand } from '../kern/hex'
import type { FestungsZiel, KampfAusgang } from '../kern/stand'
import { umwelt, useTerra } from '../speicher'
import { aktualisiere, darfSchreiben, melde, sicher, useGemeinsam, veroeffentliche, type Kapitaen } from './gemeinsam'
import { oeffne, versiegle } from './huelle'
import { netzLegeAn, netzListeGenau, netzLiesGenau, netzLoesche, netzSchreibe } from './schleuse'

const ANGRIFFE = 'terra/angriffe', FESTUNGEN = 'terra/festungen'
const inselDatei = (insel: string): string => `${FESTUNGEN}/${insel.slice(1).replace(',', '_')}.json`
const berichtPfad = (v: string, n: number): string => `${ANGRIFFE}/${v}/${n}.json`
const markePfad = (v: string, a: string): string => `${ANGRIFFE}/${v}/b_${a}.json`
/** so viele verbuchte Berichte bleiben liegen (für ein zweites Gerät, eine zurückgespielte Sicherung, den Angreifer) */
const BERICHTE_HALTEN = 20
/** Berichtsnummern über dem Verbuchten, die noch zählen: Mehr Überfälle zwischen zwei Abgleichen des Besitzers gibt
 *  es nicht (spätestens nach drei Tagen liegt seine Festung im Nebel) */
const NUMMERN_LUFT = 500

const ich = (): string => useTerra.getState().benutzer
const spiel = () => (useTerra.getState().zustand === 'bereit' ? useTerra.getState().spiel : null)
const tue = useTerra.getState().tue

/** für die Oberfläche: Wer belagert gerade meine Festung? (Hinweise von heute) */
export const useFestungNetz = create<{ belagerer: string[] }>(() => ({ belagerer: [] }))

// Berichte ändern sich nie: einmal gelesen und geprüft genügt (null = unbrauchbar)
const berichtCache = new Map<string, AngriffsBericht | null>()
const fehlVersuche = new Map<string, number>()
let anspruchGeprueft = ''
export function vergissFestungen(): void { berichtCache.clear(); fehlVersuche.clear(); lueckeSeit.clear(); anspruchGeprueft = ''; useFestungNetz.setState({ belagerer: [] }) }

const AUSGAENGE: readonly KampfAusgang[] = ['sieg', 'niederlage', 'flucht', 'remis']
const ganz = (x: unknown, von: number, bis: number): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(von, Math.min(bis, Math.floor(x))) : von)

function sauberBericht(roh: unknown, n: number, v: string, u: string): AngriffsBericht | null {
  if (!roh || typeof roh !== 'object') return null
  const d = roh as Record<string, unknown>
  if (d.n !== n || d.v !== v || d.a !== u || typeof d.i !== 'string' || !AUSGAENGE.includes(d.aus as KampfAusgang)) return null
  const akte = pruefeAkte(d.akte)
  if (!akte || (akte.start.mensch && akte.start.mensch.length !== 1)) return null
  return {
    n, v, a: u, an: typeof d.an === 'string' ? d.an.slice(0, 28) : '', i: d.i.slice(0, 20), tag: ganz(d.tag, 0, 1e6), basis: ganz(d.basis, 0, 1e12),
    aus: d.aus as KampfAusgang, beute: ganz(d.beute, 0, 1e5), wv: ganz(d.wv, 0, 3), kg: ganz(d.kg, 0, 1e7), vg: d.vg === true, akte,
  }
}

/** Geht der Kampf so aus, wie der Bericht sagt? (aus Aufstellung und Befehlen nachgespielt — dieselbe Rechnung auf jedem PC) */
function kampfStimmt(b: AngriffsBericht): boolean {
  try {
    const k = nachspielen(b.akte)
    if (!k.ende) auskaempfen(k)
    return k.ende === b.aus && k.schiffe.some(s => s.seite === 1 && s.art === 'fort')
  } catch { return false }
}

/** Einen Bericht lesen und prüfen. 'netz' = Laufwerk antwortet nicht, 'warte' = gerade nicht lesbar (wird vielleicht
 *  noch geschrieben, oder stammt aus einer neueren Tool-Version), null = unbrauchbar (zählt nicht) */
async function liesBericht(v: string, n: number): Promise<AngriffsBericht | null | 'warte' | 'netz'> {
  const key = `${v}/${n}`
  if (berichtCache.has(key)) return berichtCache.get(key) ?? null
  const r = await netzLiesGenau(berichtPfad(v, n))
  if (!r.ok || r.wert.status === 'fehler') return 'netz'
  if (r.wert.status !== 'ok') {
    const f = (fehlVersuche.get(key) ?? 0) + 1
    fehlVersuche.set(key, f)
    if (f < 3) return 'warte'
    berichtCache.set(key, null)
    return null
  }
  const o = await oeffne<unknown>(r.wert.daten, { art: 'angriff', rev: n })
  if (!o.ok && o.grund === 'neuer') return 'warte'
  const b = o.ok ? sauberBericht(o.inhalt, n, v, sicher(o.u)) : null
  const gut = b && kampfStimmt(b) ? b : null
  berichtCache.set(key, gut)
  return gut
}

/** Berichtsnummern im Verzeichnis, aufsteigend — nur die über `ab` und höchstens NUMMERN_LUFT darüber */
const nummernAus = (namen: readonly string[], ab: number): number[] => namen.map(x => /^(\d{1,12})\.json$/.exec(x)).filter((m): m is RegExpExecArray => !!m).map(m => Number(m[1])).filter(n => n > 0 && n > ab && n <= ab + NUMMERN_LUFT).sort((a, b) => a - b)

// ── Verteidiger: Berichte der Reihe nach verbuchen ──
const lueckeSeit = new Map<number, number>()
/** 'fertig' = alles verbucht, was es gibt (sicher gelesen); 'offen' = noch nicht (Laufwerk, Lücke, Bericht im Entstehen) */
async function bucheAngriffe(mich: string): Promise<'fertig' | 'offen'> {
  if (!spiel()?.stand.festung) return 'fertig'
  const l = await netzListeGenau(`${ANGRIFFE}/${mich}`)
  if (!l.ok) return 'offen'
  const g0 = spiel()?.stand.festung?.gebucht ?? 0
  const nummern = nummernAus(l.wert, g0)
  let neu = false, offen = false
  for (const n of nummern) {
    const f = spiel()?.stand.festung
    if (!f || !darfSchreiben()) { offen = true; break }
    if (n <= f.gebucht) continue
    // eine Lücke (Nummer fehlt): drei Runden warten, dann übergehen
    if (n !== f.gebucht + 1) {
      const runden = (lueckeSeit.get(f.gebucht + 1) ?? 0) + 1
      lueckeSeit.set(f.gebucht + 1, runden)
      if (runden < 3) { offen = true; break }
      tue(sp => { if (sp.stand.festung && sp.stand.festung.gebucht < n - 1) sp.stand.festung.gebucht = n - 1 })
    }
    const b = await liesBericht(mich, n)
    if (b === 'netz' || b === 'warte' || !darfSchreiben()) { offen = true; break }
    const f2 = spiel()?.stand.festung
    if (!f2 || n <= f2.gebucht) continue
    const zaehlt = b ? werteAus(f2.schonBis, f2.letzterSieg, [b])[0] : false
    const heute = umwelt().tag
    const zeile = tue(sp => {
      if (b) return bucheBericht(sp, b, zaehlt, heute)
      if (sp.stand.festung) { sp.stand.festung.gebucht = n; sp.stand.zug++ }
      return null
    })
    if (zeile) melde(zeile)
    neu = true
  }
  if (neu) { aktualisiere(); void veroeffentliche(true) }
  // Hinweise „wird gerade belagert“: die von heute zeigen, ältere wegräumen; alte Berichte aufräumen (die letzten
  // 20 bleiben) — höchstens vier Löschungen je Runde
  const f = spiel()?.stand.festung
  if (!f) return offen ? 'offen' : 'fertig'
  let weg = 0
  for (const x of l.wert) { const m = /^(\d{1,12})\.json$/.exec(x); const n = m ? Number(m[1]) : 0; if (n && n < f.gebucht - BERICHTE_HALTEN && weg++ < 4) void netzLoesche(berichtPfad(mich, n)) }
  const heute = umwelt().tag, belagerer: string[] = []
  for (const name of l.wert) {
    const m = /^b_([a-z0-9._-]{1,60})\.json$/.exec(name)
    if (!m) continue
    const r = await netzLiesGenau(`${ANGRIFFE}/${mich}/${name}`)
    if (!r.ok) break
    const o = r.wert.status === 'ok' ? await oeffne<{ tag?: number; n?: string }>(r.wert.daten, { art: 'belagerung' }) : null
    const tag = o && o.ok ? Number(o.inhalt?.tag ?? 0) : 0
    if (o && o.ok && sicher(o.u) === m[1] && tag === heute) belagerer.push(String(o.inhalt?.n || m[1]).slice(0, 28))
    else if (r.wert.status !== 'fehler' && tag < heute && weg++ < 4) void netzLoesche(`${ANGRIFFE}/${mich}/${name}`)
  }
  useFestungNetz.setState({ belagerer })
  return offen ? 'offen' : 'fertig'
}

// ── Angreifer ──
export const SCHUTZ_TEXT: Record<Exclude<Schutz, null>, string> = {
  nebel: `Der Besitzer hat seit ${NEBEL_TAGE} Tagen nicht gespielt – die Festung liegt im Nebel und ist nicht zu finden.`,
  bau: 'Die Festung ist noch im Bau. Bis dahin greift sie niemand an.',
  schonfrist: 'Die Festung wurde gerade erst überfallen – es gilt die Schonfrist.',
}

/** Was spricht dagegen, diese Festung jetzt anzugreifen? (ohne Netzlaufwerk; null = nichts) */
export function sperreFuer(k: Kapitaen, heute: number): string | null {
  const sp = spiel(), g = useGemeinsam.getState()
  if (!sp) return 'Kein Spiel geladen.'
  const s = sp.stand, fe = k.fe
  if (!fe) return 'Diese Festung gibt es nicht mehr.'
  if (!s.festung) return 'Angreifen kann nur, wer selbst eine Festung hat – wer sich nicht messen will, baut keine.'
  if (s.kampf.bericht) return 'Erst muss der Bericht über die letzte Belagerung bei der Admiralität sein.'
  if (g.verbunden !== true || !darfSchreiben()) return 'Dafür braucht es die Verbindung zum Netzlaufwerk.'
  const mich = sicher(ich())
  if (s.bund && g.buende.some(b => b.key === s.bund?.key && b.mitglieder.includes(mich) && b.mitglieder.includes(k.u))) return 'Ihr gehört zum selben Bündnis.'
  if (s.kampf.erledigt[`f:${k.u}`] === heute) return 'Diese Festung hast du heute schon angegriffen. Morgen wieder.'
  const schutz = schutzVon(fe, k.tag, heute)
  if (schutz) return SCHUTZ_TEXT[schutz]
  if (abstand(s.q, s.r, fe.q, fe.r) > 1) return 'Dafür muss dein Schiff vor der Festung liegen.'
  return null
}

export interface ZielPruefung { ok: boolean; grund?: string; bild?: FestungBild; ziel?: FestungsZiel; belagert: string[] }

/** Vor dem Angriff frisch nachsehen: Welche Berichte gibt es schon (auch unverbuchte), ist die Festung geschützt,
 *  belagert gerade jemand anderes? Daraus wird das Ziel, an dem nach dem Kampf gerechnet wird. */
export async function pruefeZiel(owner: string): Promise<ZielPruefung> {
  const heute = umwelt().tag, k = useGemeinsam.getState().kapitaene.find(x => x.u === owner && !x.ich)
  if (!k || !k.fe) return { ok: false, grund: 'Diese Festung gibt es nicht mehr.', belagert: [] }
  const vorab = sperreFuer(k, heute)
  if (vorab) return { ok: false, grund: vorab, bild: k.fe, belagert: [] }
  const l = await netzListeGenau(`${ANGRIFFE}/${owner}`)
  if (!l.ok) return { ok: false, grund: 'Das Netzlaufwerk antwortet gerade nicht.', bild: k.fe, belagert: [] }
  const nummern = nummernAus(l.wert, k.fe.g)
  let bild = k.fe
  const basis = Math.max(k.fe.g, ...nummern)
  const kurz: AngriffsBericht[] = []
  for (const n of nummern) {
    const b = await liesBericht(owner, n)
    if (b === 'netz') return { ok: false, grund: 'Das Netzlaufwerk antwortet gerade nicht.', bild, belagert: [] }
    if (b === 'warte') return { ok: false, grund: 'Gerade wird ein anderer Angriff auf diese Festung verbucht. Gleich noch einmal versuchen.', bild, belagert: [] }
    if (b) kurz.push(b)
  }
  const zaehlt = werteAus(k.fe.sb, k.fe.lz, kurz)
  kurz.forEach((b, i) => { if (zaehlt[i]) bild = wendeAn(bild, b) })
  const schutz = schutzVon(bild, k.tag, heute)
  if (schutz) return { ok: false, grund: SCHUTZ_TEXT[schutz], bild, belagert: [] }
  // wer belagert gerade? (Hinweise von heute, außer dem eigenen)
  const mich = sicher(ich()), belagert: string[] = []
  for (const name of l.wert) {
    const m = /^b_([a-z0-9._-]{1,60})\.json$/.exec(name)
    if (!m || m[1] === mich || belagert.length >= 3) continue
    const r = await netzLiesGenau(`${ANGRIFFE}/${owner}/${name}`)
    if (!r.ok || r.wert.status !== 'ok') continue
    const o = await oeffne<{ tag?: number; n?: string }>(r.wert.daten, { art: 'belagerung' })
    if (o.ok && sicher(o.u) === m[1] && o.inhalt.tag === heute) belagert.push(String(o.inhalt.n || m[1]).slice(0, 28))
  }
  const sp = spiel()
  if (!sp) return { ok: false, grund: 'Kein Spiel geladen.', belagert }
  // Kopfgeld: nur, solange es noch keiner kassiert hat (ein zählender, noch nicht verbuchter Überfall mit Kopfgeld)
  const kassiert = kurz.some((b, i) => zaehlt[i] && b.kg > 0)
  const kg = k.kg && k.kg[1] >= heute && !kassiert ? k.kg[0] : 0
  const ziel = zielVon(sp.stand, owner, k.n || owner, bild, { g: k.fe.g, sb: k.fe.sb, lz: k.fe.lz }, basis, kg, heute)
  return { ok: true, bild, ziel, belagert }
}

/** „wird gerade belagert“ setzen oder wegnehmen (nur ein Hinweis — ein Fehler hier ändert nichts) */
export async function meldeBelagerung(owner: string, an: boolean): Promise<void> {
  const u = ich(), sp = spiel()
  if (!u || !sp) return
  if (an) await netzSchreibe(markePfad(owner, sicher(u)), await versiegle('belagerung', u, 1, { tag: umwelt().tag, n: sp.stand.kapitaen }))
  else await netzLoesche(markePfad(owner, sicher(u)))
}

export interface Zustellung { titel: string; zeilen: string[]; zaehlt: boolean }
let zustellLauf: Promise<Zustellung | null> | null = null
/** Den Bericht über die letzte Belagerung zustellen. Bei einem Sieg entscheidet sich erst hier, ob er zählt (dann gibt
 *  es die Beute) oder ein anderer schneller war (Übung). null = noch nicht möglich (Laufwerk, Verbindung) */
export function stelleZu(): Promise<Zustellung | null> {
  if (zustellLauf) return zustellLauf
  zustellLauf = (async () => { try { return await stelleZuEinmal() } catch { return null } finally { zustellLauf = null } })()
  return zustellLauf
}
async function stelleZuEinmal(): Promise<Zustellung | null> {
  for (let versuch = 0; versuch < 6; versuch++) {
    const sp = spiel(), o = sp?.stand.kampf.bericht, u = ich()
    if (!sp || !o || !u || !darfSchreiben()) return null
    const mich = sicher(u), v = o.ziel.u
    const l = await netzListeGenau(`${ANGRIFFE}/${v}`)
    if (!l.ok) return null
    const nummern = nummernAus(l.wert, o.ziel.g0), kurz: AngriffsBericht[] = []
    let eigen = -1
    for (const n of nummern) {
      const b = await liesBericht(v, n)
      if (b === 'netz' || b === 'warte') return null
      if (!b) continue
      kurz.push(b)
      // schon geschrieben (das Tool wurde zwischen Schreiben und Verbuchen geschlossen — oder dieser Stand ist älter
      // als einer, der die Beute längst hat: das klärt berichtZugestellt an „zugestellt“)?
      if (b.a === mich && b.akte.start.saat === o.akte.start.saat && b.tag >= o.tag) { eigen = kurz.length - 1; break }
    }
    if (spiel()?.stand.kampf.bericht !== o) return null
    if (eigen >= 0) {
      // was im Bericht steht, gilt (Beute und Kopfgeld wurden beim Schreiben festgelegt)
      const b = kurz[eigen]
      if (b.kg !== o.ziel.kg || b.beute !== o.ziel.beute) tue(s2 => { const b2 = s2.stand.kampf.bericht; if (b2 === o) b2.ziel = { ...b2.ziel, kg: b.kg, beute: b.beute } })
      return fertig(o.aus === 'sieg' && werteAus(o.ziel.sb0, o.ziel.lz0, kurz)[eigen], v, b.n)
    }
    const N = Math.max(o.ziel.g0, o.ziel.basis, ...nummern) + 1, heute = umwelt().tag, sieg = o.aus === 'sieg'
    if (N > o.ziel.g0 + NUMMERN_LUFT) return null
    // das Kopfgeld gibt es nur einmal: Hat ein früherer, zählender Überfall es schon kassiert, bleibt es hier bei null
    const zaehltVorher = werteAus(o.ziel.sb0, o.ziel.lz0, kurz)
    const kg = sieg && !kurz.some((b, i) => zaehltVorher[i] && b.kg > 0) ? o.ziel.kg : 0
    const neu: AngriffsBericht = { n: N, v, a: mich, an: sp.stand.kapitaen, i: o.ziel.i, tag: heute, basis: o.ziel.basis, aus: o.aus, beute: sieg ? o.ziel.beute : 0, wv: sieg ? o.wv : 0, kg, vg: sieg && o.ziel.vg, akte: o.akte }
    // ein Sieg, der nicht mehr zählen kann (ein anderer war schneller): Übung — es braucht keinen Bericht
    if (sieg) { const z = werteAus(o.ziel.sb0, o.ziel.lz0, [...kurz, neu]); if (!z[z.length - 1]) return fertig(false, v, N) }
    const r = await netzLegeAn(berichtPfad(v, N), await versiegle('angriff', u, N, neu))
    if (!r.ok || r.wert === 'fehler') return null
    if (r.wert === 'ok') {
      berichtCache.set(`${v}/${N}`, neu)
      if (kg !== o.ziel.kg) tue(s2 => { const b2 = s2.stand.kampf.bericht; if (b2 === o) b2.ziel = { ...b2.ziel, kg } })
      return fertig(sieg, v, N)
    }
    // 'vorhanden': ein anderer war im selben Augenblick dran — neu ansehen
  }
  return null
}
function fertig(zaehlt: boolean, v: string, n: number): Zustellung | null {
  if (!spiel()?.stand.kampf.bericht) return null
  const erg = tue(sp => berichtZugestellt(sp, zaehlt, umwelt(), `${v}/${n}`))
  void meldeBelagerung(v, false)
  aktualisiere()
  void useTerra.getState().sichere().then(() => veroeffentliche(true))
  return { ...erg, zaehlt }
}
/** Den Bericht nicht mehr zustellen (dauerhaft unzustellbar, z. B. ohne Netzlaufwerk): Ein Sieg gilt dann als Übung —
 *  die Schäden am Schiff sind behoben, Beute gibt es keine. Danach kann wieder angegriffen werden. */
export function verwirfBericht(): void {
  const o = spiel()?.stand.kampf.bericht
  if (!o) return
  const v = o.ziel.u
  tue(sp => berichtZugestellt(sp, false, umwelt()))
  void meldeBelagerung(v, false)
  aktualisiere()
  void veroeffentliche(true)
}

// ── Gründen, Aufgeben, der Inselanspruch ──
interface Anspruch { u: string; i: string; tag: number }
/** den Anspruch auf eine Insel lesen: null = es gibt keinen, 'netz' = Laufwerk antwortet nicht, 'kaputt' = unbrauchbar */
async function liesAnspruch(inselKey: string): Promise<Anspruch | null | 'netz' | 'kaputt'> {
  const r = await netzLiesGenau(inselDatei(inselKey))
  if (!r.ok || r.wert.status === 'fehler') return 'netz'
  if (r.wert.status === 'fehlt') return null
  if (r.wert.status !== 'ok') return 'kaputt'
  const o = await oeffne<{ i?: string; tag?: number }>(r.wert.daten, { art: 'festung' })
  if (!o.ok || o.inhalt?.i !== inselKey) return 'kaputt'
  return { u: sicher(o.u), i: inselKey, tag: ganz(o.inhalt.tag, 0, 1e6) }
}
/** Ist ein fremder Anspruch verwaist? Sein Besitzer hat nach dem Anspruch veröffentlicht, und seine Lage zeigt auf
 *  dieser Insel keine Festung (aufgegeben, neu begonnen, das Löschen scheiterte). Erst ab dem zweiten Tag. */
function verwaist(a: Anspruch, heute: number): boolean {
  if (a.tag >= heute - 1) return false
  const k = useGemeinsam.getState().kapitaene.find(x => x.u === a.u)
  return !!k && k.tag > a.tag && k.fe?.i !== a.i
}

/** Eine Festung gründen: Die Insel wird exklusiv beansprucht — auf jeder Insel steht höchstens eine. Gibt einen
 *  Fehlertext zurück oder null, wenn es geklappt hat. */
export async function gruendeFestung(inselKey: string, name: string): Promise<string | null> {
  const sp = spiel(), u = ich()
  if (!sp || !u) return 'Kein Spiel geladen.'
  if (useGemeinsam.getState().verbunden !== true || !darfSchreiben()) return 'Dafür braucht es die Verbindung zum Netzlaufwerk.'
  const k = kannGruenden(sp.stand, inselKey)
  if (!k.ok) return k.grund
  const mich = sicher(u), pfad = inselDatei(inselKey), heute = umwelt().tag
  const inhalt = await versiegle('festung', u, 1, { i: inselKey, tag: heute })
  let r = await netzLegeAn(pfad, inhalt)
  if (!r.ok || r.wert === 'fehler') return 'Das Netzlaufwerk antwortet gerade nicht.'
  if (r.wert === 'vorhanden') {
    const a = await liesAnspruch(inselKey)
    if (a === 'netz') return 'Das Netzlaufwerk antwortet gerade nicht.'
    if (a && a !== 'kaputt' && a.u !== mich) {
      if (!verwaist(a, heute)) { const wer = useGemeinsam.getState().kapitaene.find(x => x.u === a.u)?.n; return `Auf dieser Insel steht schon eine Festung${wer ? ` von Kpt. ${wer}` : ''}.` }
      // ein verwaister Anspruch: weg damit, dann neu (wieder exklusiv — kommt jemand zuvor, gilt seiner)
      const w = await netzLoesche(pfad)
      if (!w.ok || !w.wert) return 'Das Netzlaufwerk antwortet gerade nicht.'
      r = await netzLegeAn(pfad, inhalt)
      if (!r.ok || r.wert !== 'ok') return 'Auf dieser Insel steht schon eine Festung.'
    } else if (a === null) return 'Das ging gerade nicht – bitte gleich noch einmal.'
    else if (a === 'kaputt') return 'Auf dieser Insel steht schon eine Festung.'
  }
  // Berichte, die es für mich schon gibt, gehören zu einer früheren Festung
  const alt = await netzListeGenau(`${ANGRIFFE}/${mich}`)
  const max = alt.ok ? Math.max(0, ...alt.wert.map(x => /^(\d{1,12})\.json$/.exec(x)).filter((m): m is RegExpExecArray => !!m).map(m => Number(m[1])).filter(n => n <= 1e9)) : 0
  if (!spiel() || spiel()?.stand.festung) return 'Das ging gerade nicht.'
  const g = tue(s => gruende(s, inselKey, name, umwelt(), max))
  if (!g.ok) { void netzLoesche(pfad); return g.grund }
  anspruchGeprueft = inselKey
  melde(g.text)
  aktualisiere()
  void veroeffentliche(true)
  return null
}

/** Die Festung aufgeben: den eigenen Anspruch auf die Insel löschen (nur den eigenen — ein fremder bleibt), dann lokal. */
export async function gibFestungAuf(): Promise<string | null> {
  const f = spiel()?.stand.festung
  if (!f) return null
  if (useGemeinsam.getState().verbunden !== true || !darfSchreiben()) return 'Dafür braucht es die Verbindung zum Netzlaufwerk.'
  const a = await liesAnspruch(f.insel)
  if (a === 'netz') return 'Das Netzlaufwerk antwortet gerade nicht.'
  if (a && a !== 'kaputt' && a.u === sicher(ich())) {
    const r = await netzLoesche(inselDatei(f.insel))
    if (!r.ok || !r.wert) return 'Das Netzlaufwerk antwortet gerade nicht.'
  }
  if (spiel()?.stand.festung !== f) return null
  tue(sp => gibAuf(sp))
  anspruchGeprueft = ''
  aktualisiere()
  void veroeffentliche(true)
  return null
}

/** Vor allem, was am Lager der eigenen Festung hängt: Ist das Laufwerk da, sind alle Überfälle verbucht, liegt keine
 *  Belagerung von heute an? (Die Beute steht beim Angreifer ab Beginn fest — was jetzt beiseitegeschafft würde, gäbe
 *  es doppelt.) null = alles gut, sonst der Grund. */
async function lagerFrei(): Promise<string | null> {
  const u = ich()
  if (!spiel()?.stand.festung || !u) return 'Du hast keine Festung.'
  if (useGemeinsam.getState().verbunden !== true || !darfSchreiben()) return 'Erst müssen die Berichte der Admiralität gelesen sein – dafür braucht es das Netzlaufwerk.'
  if ((await bucheAngriffe(sicher(u))) !== 'fertig') return 'Noch sind nicht alle Berichte der Admiralität gelesen – gleich noch einmal versuchen.'
  if (!darfSchreiben()) return 'Das Netzlaufwerk antwortet gerade nicht.'
  const bel = useFestungNetz.getState().belagerer
  if (bel.length) return `Kpt. ${bel.join(' und Kpt. ')} ${bel.length > 1 ? 'belagern' : 'belagert'} gerade deine Festung – solange bleiben Lager und Bautrupp in den Mauern.`
  return null
}

/** Ware aus dem Lager an Bord nehmen — erst, wenn alle Berichte über Überfälle sicher verbucht sind und keine
 *  Belagerung läuft (Wunsch aus dem Plan: Vorräte lassen sich nicht nachträglich beiseiteschaffen). */
export async function holeWare(): Promise<{ ok: true; text: string } | { ok: false; grund: string }> {
  const vorher = spiel()?.stand.festung?.gebucht ?? 0
  const grund = await lagerFrei()
  if (grund) return { ok: false, grund }
  const sp = spiel()
  if (!sp?.stand.festung) return { ok: false, grund: 'Du hast keine Festung.' }
  const a = tue(s => hole(s, umwelt()))
  if (a.ok) { aktualisiere(); void veroeffentliche(true) }
  return a.ok && sp.stand.festung.gebucht > vorher ? { ok: true, text: `${a.text} (Vorher verbucht: ein Bericht über deine Festung.)` } : a
}
/** Ausbessern — erst nach dem Verbuchen (sonst wäre eine Reparatur vor einem noch liegenden Überfall verloren) */
export async function repariereFestung(): Promise<{ ok: true; text: string } | { ok: false; grund: string }> {
  const grund = await lagerFrei()
  if (grund) return { ok: false, grund }
  const a = tue(s => repariere(s))
  if (a.ok) { aktualisiere(); void veroeffentliche(true) }
  return a
}

/** Gehört der Anspruch auf die Insel der eigenen Festung noch mir? (einmal je Lauf und Festung) — Fehlt er, wird er
 *  neu angelegt; gehört er inzwischen einem anderen (ein älterer Stand nach dem Aufgeben), gilt der Anspruch: Diese
 *  Festung steht nicht mehr. */
async function pruefeAnspruch(mich: string): Promise<void> {
  const f = spiel()?.stand.festung
  if (!f || anspruchGeprueft === f.insel || !darfSchreiben()) return
  const a = await liesAnspruch(f.insel)
  if (a === 'netz' || a === 'kaputt') return
  if (spiel()?.stand.festung !== f) return
  if (a === null) {
    const r = await netzLegeAn(inselDatei(f.insel), await versiegle('festung', ich(), 1, { i: f.insel, tag: umwelt().tag }))
    if (!r.ok || r.wert === 'fehler') return
    if (r.wert === 'vorhanden') return                       // (der nächste Lauf sieht nach, wessen er ist)
  } else if (a.u !== mich) {
    const wer = useGemeinsam.getState().kapitaene.find(x => x.u === a.u)?.n
    tue(sp => gibAuf(sp))
    melde(`Deine Festung „${f.name}“ steht nicht mehr: Die Insel gehört inzwischen ${wer ? `Kpt. ${wer}` : 'einem anderen Kapitän'}. (Dieser Spielstand ist älter als einer, in dem du sie aufgegeben hast.)`)
    aktualisiere()
    void veroeffentliche(true)
    return
  }
  anspruchGeprueft = f.insel
}

// ── im Abgleich (alle 90 s, wenn dieser PC maßgeblich ist) ──
export async function festungenAbgleich(mich: string): Promise<void> {
  const sp = spiel()
  if (!sp) return
  if (sp.stand.festung) {
    // Ertrag nur verbuchen, wenn sich etwas ändert (sonst zöge jeder Abgleich ein Neuzeichnen und Speichern nach sich)
    const f = sp.stand.festung, jetzt = umwelt().jetzt, probe = { ...f }
    erntet(probe, jetzt)
    if (probe.lager !== f.lager) { tue(s => (s.stand.festung ? erntet(s.stand.festung, jetzt) : 0)); aktualisiere() }
    await pruefeAnspruch(mich)
    await bucheAngriffe(mich)
  }
  if (spiel()?.stand.kampf.bericht && darfSchreiben()) {
    const z = await stelleZu()
    if (z && z.titel) melde(`${z.titel}: ${z.zeilen.join(' · ')}`)
  }
}
