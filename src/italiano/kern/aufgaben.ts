// Parla Italiano — aus den Lerninhalten Aufgaben bauen (Lektion, Tagestest, Prüfung, freies Training).
// Alles hier ist berechenbar: gleicher Startwert → gleiche Aufgaben. Ein zweiter Prüfungsversuch
// bekommt einen anderen Startwert und damit andere Aufgaben.
import { rng, type Rng } from '../../brain/kern/zufall'
import type { DialogZeile, GrammatikUebung, LevelInhalt, Lesetext, Rollenspiel, TagInhalt, AuswahlFrage } from './inhaltTypen'
import type { AAuswahl, APaare, ASatzbau, ATippen, Aufgabe, Faehigkeit, GewerteteAufgabe, PruefungsTeil, TonStelle } from './typen'
import { glatt, inKacheln, kachelKern, legeKacheln, ohneArtikel } from './antwort'
import { EIGENNAMEN } from './eigennamen'
import { woerterVon, type WortMitOrt } from './inhalt'
import { station } from './lehrplan'

export interface Wuensche {
  /** Ton ist an und für diesen Lerntag vorhanden → Hör-Aufgaben möglich */
  ton: (tag: number) => boolean
  /** einzelne Dialogzeilen dieses Lerntags sind sicher getrennt → Hör-Aufgaben mit ganzen Sätzen (fehlt = wie `ton`) */
  zeilen?: (tag: number) => boolean
  /** Schreib-Aufgaben stellen */
  tippen: boolean
}

let zaehler = 0
const kennung = (vor: string): string => `${vor}${++zaehler}`

const wortTon = (w: WortMitOrt): TonStelle => ({ tag: w.tag, art: 'w', nr: w.platz - 1 })

/** drei falsche Wörter zu einem richtigen — möglichst gleiche Wortart, nie dieselbe Bedeutung */
function ablenker(w: WortMitOrt, pool: readonly WortMitOrt[], r: Rng, feld: 'it' | 'de'): string[] {
  const eigen = glatt(w.w[feld])
  const frei = pool.filter(p => p.kennung !== w.kennung && glatt(p.w[feld]) !== eigen && glatt(p.w.de) !== glatt(w.w.de))
  const gleich = frei.filter(p => p.w.art === w.w.art)
  const wahl = r.ausN(gleich.length >= 3 ? gleich : frei, 12)
  const aus: string[] = []
  for (const p of wahl) {
    const text = p.w[feld]
    if (!aus.some(a => glatt(a) === glatt(text))) aus.push(text)
    if (aus.length === 3) break
  }
  return aus
}

function mische(richtig: string, falsch: readonly string[], r: Rng): { optionen: string[]; richtig: number } {
  const optionen = r.misch([richtig, ...falsch])
  return { optionen, richtig: optionen.indexOf(richtig) }
}

// ── einzelne Aufgaben ───────────────────────────────────────────────────────────────────

export function wortItDe(w: WortMitOrt, pool: readonly WortMitOrt[], r: Rng, mitTon: boolean): AAuswahl | null {
  const falsch = ablenker(w, pool, r, 'de')
  if (falsch.length < 3) return null
  return { typ: 'auswahl', id: kennung('wi'), f: 'wortschatz', wort: w.kennung, kopf: 'Was bedeutet das?', frage: w.w.it, frageIt: true, ton: mitTon ? wortTon(w) : undefined, ...mische(w.w.de, falsch, r) }
}
export function wortDeIt(w: WortMitOrt, pool: readonly WortMitOrt[], r: Rng): AAuswahl | null {
  const falsch = ablenker(w, pool, r, 'it')
  if (falsch.length < 3) return null
  return { typ: 'auswahl', id: kennung('wd'), f: 'wortschatz', wort: w.kennung, kopf: 'Wie heißt das auf Italienisch?', frage: w.w.de, optIt: true, ...mische(w.w.it, falsch, r) }
}
export function wortHoeren(w: WortMitOrt, pool: readonly WortMitOrt[], r: Rng): AAuswahl | null {
  const falsch = ablenker(w, pool, r, 'de')
  if (falsch.length < 3) return null
  return { typ: 'auswahl', id: kennung('wh'), f: 'hoeren', wort: w.kennung, kopf: 'Was hörst du?', frage: w.w.it, frageIt: true, ton: wortTon(w), nurTon: true, ...mische(w.w.de, falsch, r) }
}
export function wortTippen(w: WortMitOrt): ATippen {
  return { typ: 'tippen', id: kennung('wt'), f: 'schreiben', wort: w.kennung, kopf: 'Schreib es auf Italienisch', frage: w.w.de, loesung: w.w.it, auch: w.w.auch }
}
export function wortDiktat(w: WortMitOrt): ATippen {
  return { typ: 'tippen', id: kennung('wk'), f: 'hoeren', wort: w.kennung, kopf: 'Schreib, was du hörst', ton: wortTon(w), nurTon: true, zusatz: w.w.de, loesung: w.w.it, auch: w.w.auch }
}
/** Lücke im Beispielsatz — nur wenn das Wort dort unverändert vorkommt */
export function wortLuecke(w: WortMitOrt): ATippen | null {
  const kern = ohneArtikel(w.w.it.toLowerCase()).replace(/[?!.]/g, '').trim()
  if (kern.length < 3 || kern.includes(' ')) return null
  const satz = w.w.bsp.it
  const m = new RegExp(`(^|[\\s'«(])(${kern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[\\s.,;:!?»)])`, 'i').exec(satz)
  if (!m) return null
  const ab = m.index + m[1].length
  return { typ: 'tippen', id: kennung('wl'), f: 'schreiben', wort: w.kennung, kopf: 'Ergänze den Satz', vor: satz.slice(0, ab), nachText: satz.slice(ab + m[2].length), zusatz: w.w.bsp.de, loesung: m[2] }
}
export function paare(ws: readonly WortMitOrt[]): APaare {
  return { typ: 'paare', id: kennung('pa'), f: 'wortschatz', paare: ws.map(w => ({ it: w.w.it, de: w.w.de, wort: w.kennung })) }
}

export function grammatikFrage(u: GrammatikUebung, r: Rng): AAuswahl {
  // die Übersetzung erst NACH der Antwort zeigen — vorher würde sie oft die Lösung verraten
  return { typ: 'auswahl', id: kennung('gr'), f: 'grammatik', kopf: 'Was passt in die Lücke?', frage: u.satz, frageIt: true, optIt: true, nach: [u.de, u.warum].filter(Boolean).join(' · '), ...mische(u.loesung, u.falsch, r) }
}
function verstehFrage(q: AuswahlFrage, r: Rng, f: Faehigkeit, kopf: string, text?: Lesetext): AAuswahl {
  return { typ: 'auswahl', id: kennung('vf'), f, kopf, frage: q.frage, text: text ? { titel: text.titel, it: text.it } : undefined, ...mische(q.richtig, q.falsch, r) }
}
export function rollenFrage(x: Rollenspiel, r: Rng): AAuswahl {
  return { typ: 'auswahl', id: kennung('ro'), f: 'gespraech', kopf: 'Was sagst du?', frage: x.lage, optIt: true, nach: `«${x.richtig}» – ${x.de}`, ...mische(x.richtig, x.falsch, r) }
}

/** ein Satz zum Bauen: Dialogzeile (mit Ton) oder Beispielsatz eines Wortes */
export interface BauSatz { it: string; de: string; ton?: TonStelle; ausDialog: boolean }
const zumBauen = (it: string): boolean => { const n = inKacheln(it).map(kachelKern).filter(Boolean).length; return n >= 3 && n <= 9 }
/** was auf den Kacheln groß bleibt (Namen, Städte, Länder) */
const NAMEN: ReadonlySet<string> = new Set(EIGENNAMEN)
/** alle Sätze eines Lerntags mit 3 bis 9 Wörtern: erst die Dialogzeilen, dann die Beispielsätze der Wörter */
export function bauSaetze(t: TagInhalt, mitTon: boolean): BauSatz[] {
  const dialog = t.dialog.zeilen.map((z, i): BauSatz => ({ it: z.it, de: z.de, ton: mitTon ? { tag: t.tag, art: 'd', nr: i } : undefined, ausDialog: true }))
  const beispiele = t.woerter.map((w): BauSatz => ({ it: w.bsp.it, de: w.bsp.de, ausDialog: false }))
  const gesehen = new Set<string>()
  return [...dialog, ...beispiele].filter(s => zumBauen(s.it) && !gesehen.has(glatt(s.it)) && !!gesehen.add(glatt(s.it)))
}
/** n Sätze wählen — Dialogzeilen bevorzugt, Beispielsätze füllen auf */
function waehleSaetze(saetze: readonly BauSatz[], r: Rng, n: number): BauSatz[] {
  return [...r.ausN(saetze.filter(s => s.ausDialog), n), ...r.ausN(saetze.filter(s => !s.ausDialog), n)].slice(0, n)
}
export function satzbau(s: BauSatz, andere: readonly BauSatz[], r: Rng): ASatzbau {
  // Kacheln ohne Satzzeichen und ohne großen Satzanfang — sonst verrät die Schreibweise die Reihenfolge
  const teile = legeKacheln(s.it, NAMEN)
  const drin = new Set(teile.map(t => glatt(t)))
  const fremd = [...new Set(r.ausN(andere.filter(a => a !== s), 6).flatMap(a => legeKacheln(a.it, NAMEN)).filter(t => !drin.has(glatt(t)) && glatt(t).length > 1))]
  return { typ: 'satzbau', id: kennung('sb'), f: 'schreiben', de: s.de, loesung: s.it, teile, extra: r.ausN(fremd, teile.length <= 4 ? 2 : 3), ton: s.ton }
}
/** eine Dialogzeile hören und die richtige Übersetzung wählen */
function zeileHoeren(tag: number, nr: number, zeilen: readonly DialogZeile[], fremde: readonly DialogZeile[], r: Rng): AAuswahl | null {
  const z = zeilen[nr]
  const falsch = r.ausN([...zeilen, ...fremde].filter(x => glatt(x.de) !== glatt(z.de)).map(x => x.de).filter((d, i, a) => a.indexOf(d) === i), 3)
  if (falsch.length < 3) return null
  return { typ: 'auswahl', id: kennung('zh'), f: 'hoeren', kopf: 'Was hörst du?', frage: z.it, frageIt: true, ton: { tag, art: 'd', nr }, nurTon: true, ...mische(z.de, falsch, r) }
}

// ── Lektion (etwa 10 Minuten) ───────────────────────────────────────────────────────────

export function baueLezione(t: TagInhalt, vortag: TagInhalt | null, pool: readonly WortMitOrt[], o: Wuensche, start: number): Aufgabe[] {
  const r = rng(start).zweig(`lezione/${t.tag}`)
  const ton = o.ton(t.tag)
  const ws = woerterVon(t)
  const alle = [...pool.filter(p => p.tag !== t.tag), ...ws]
  const level = Math.floor((t.tag - 1) / 5) + 1
  const aus: Aufgabe[] = []
  const plus = (a: Aufgabe | null | undefined) => { if (a) aus.push(a) }

  plus({ typ: 'einstieg', id: kennung('ei'), tag: t.tag, level, ort: station(level).ort, titel: t.titel, ziel: t.ziel, rueckblick: vortag?.dialog.folge })

  // 12 Wörter in drei Häppchen: zeigen, dann sofort üben
  for (let g = 0; g < 3; g++) {
    const gruppe = ws.slice(g * 4, g * 4 + 4)
    for (const w of gruppe) plus({ typ: 'karte', id: kennung('ka'), wort: w.kennung, w: w.w, ton: ton ? wortTon(w) : undefined })
    const reihe = r.misch(gruppe)
    plus(wortItDe(reihe[0], alle, r, ton))
    plus(wortDeIt(reihe[1], alle, r))
    plus(paare(gruppe))
    plus(ton ? wortHoeren(reihe[2], alle, r) : wortItDe(reihe[2], alle, r, false))
    plus(wortDeIt(reihe[3], alle, r))
    if (g > 0) {
      // ein Wort aus dem vorigen Häppchen noch einmal — diesmal schreiben oder erkennen
      const alt = r.aus(ws.slice((g - 1) * 4, g * 4))
      plus(o.tippen ? (wortLuecke(alt) ?? wortTippen(alt)) : wortItDe(alt, alle, r, ton))
    }
  }

  // Grammatik: Erklärung, dann die ersten vier Übungen (die anderen vier hebt der Tagestest auf)
  plus({ typ: 'grammatik', id: kennung('gk'), g: t.grammatik })
  for (const u of t.grammatik.uebungen.slice(0, 4)) plus(grammatikFrage(u, r))

  // Dialog: ansehen/anhören, verstehen, selbst antworten, Sätze bauen
  plus({ typ: 'dialog', id: kennung('di'), tag: t.tag, d: t.dialog })
  for (const q of t.dialog.fragen) plus(verstehFrage(q, r, ton ? 'hoeren' : 'lesen', 'Hast du es verstanden?'))
  for (const x of t.dialog.rollenspiel.slice(0, 2)) plus(rollenFrage(x, r))
  const saetze = bauSaetze(t, ton)
  // Sprechen: zwei Sätze aus dem Dialog laut nachsprechen (ohne Wertung — das Tool hört nicht zu)
  const zumSprechen = r.ausN(saetze.filter(s => s.ausDialog && inKacheln(s.it).length >= 4), 2)
  if (zumSprechen.length) plus({ typ: 'nachsprechen', id: kennung('ns'), saetze: zumSprechen.map(s => ({ it: s.it, de: s.de, ton: s.ton })) })
  for (const s of waehleSaetze(saetze, r, 2)) plus(satzbau(s, saetze, r))
  if (o.tippen) { const w = r.aus(ws.slice(8)); plus(ton ? wortDiktat(w) : wortTippen(w)) }

  plus({ typ: 'wissen', id: kennung('ws'), titel: t.wissen.titel, text: t.wissen.text })
  return aus
}

// ── Tagestest (5 Minuten, Stoff des Vortags + fällige Wiederholungen) ────────────────────

export const TAGESTEST_SEKUNDEN = 300
export const TAGESTEST_AUFGABEN = 18

export function baueTagestest(stoff: TagInhalt, faellig: readonly WortMitOrt[], pool: readonly WortMitOrt[], o: Wuensche, start: number): GewerteteAufgabe[] {
  const r = rng(start).zweig(`test/${stoff.tag}`)
  const ton = o.ton(stoff.tag)
  const ws = r.misch(woerterVon(stoff))
  const alle = [...pool.filter(p => p.tag !== stoff.tag), ...woerterVon(stoff)]
  const aus: GewerteteAufgabe[] = []
  const plus = (a: GewerteteAufgabe | null | undefined) => { if (a) aus.push(a) }

  // 8 Wörter des Vortags in wechselnder Form
  ws.slice(0, 8).forEach((w, i) => {
    const art = i % 4
    if (art === 0) plus(wortItDe(w, alle, r, false))
    else if (art === 1) plus(wortDeIt(w, alle, r))
    else if (art === 2) plus(o.tippen ? wortTippen(w) : wortDeIt(w, alle, r))
    else plus(ton ? wortHoeren(w, alle, r) : wortItDe(w, alle, r, false))
  })
  // die vier Grammatik-Übungen, die in der Lektion noch nicht dran waren
  for (const u of stoff.grammatik.uebungen.slice(4, 8)) plus(grammatikFrage(u, r))
  // Sätze und Gespräch
  const saetze = bauSaetze(stoff, false)
  for (const s of waehleSaetze(saetze, r, 2)) plus(satzbau(s, saetze, r))
  plus(rollenFrage(stoff.dialog.rollenspiel[stoff.dialog.rollenspiel.length - 1], r))
  // fällige Wörter aus älteren Tagen; fehlen welche, die restlichen Wörter des Vortags
  const alt = [...faellig.filter(w => w.tag !== stoff.tag), ...ws.slice(8)]
  for (const w of alt) {
    if (aus.length >= TAGESTEST_AUFGABEN) break
    plus(r.chance(0.5) ? wortItDe(w, alle, r, false) : wortDeIt(w, alle, r))
  }
  return r.misch(aus).slice(0, TAGESTEST_AUFGABEN)
}

export { sterneFuer, BESTEHEN_AB } from './regeln'

// ── Große Prüfung am Ende des Levels ────────────────────────────────────────────────────

export interface PruefAufgabe { teil: PruefungsTeil; a: GewerteteAufgabe }
export const TEIL_NAME: Record<PruefungsTeil, string> = { wortschatz: 'Wortschatz', grammatik: 'Grammatik', lesen: 'Lesen', hoeren: 'Hören', gespraech: 'Gespräch' }

interface PruefStoff { tage: TagInhalt[]; lesetext: Lesetext }

function bauePruefung(stoff: PruefStoff, pool: readonly WortMitOrt[], o: Wuensche, r: Rng, mengen: { wort: number; gram: number; hoer: number; gespr: number }): PruefAufgabe[] {
  const aus: PruefAufgabe[] = []
  const plus = (teil: PruefungsTeil, a: GewerteteAufgabe | null | undefined) => { if (a) aus.push({ teil, a }) }
  const ws = r.misch(stoff.tage.flatMap(woerterVon))
  const alle = [...pool, ...ws.filter(w => !pool.some(p => p.kennung === w.kennung))]

  // Wortschatz: erkennen, übersetzen, schreiben, zuordnen
  ws.slice(0, mengen.wort - 1).forEach((w, i) => {
    const art = i % 3
    plus('wortschatz', art === 0 ? wortItDe(w, alle, r, false) : art === 1 ? wortDeIt(w, alle, r) : o.tippen ? wortTippen(w) : wortDeIt(w, alle, r))
  })
  plus('wortschatz', paare(ws.slice(mengen.wort, mengen.wort + 5)))

  // Grammatik: quer durch alle Themen, je Tag gleich viele
  const jeTag = stoff.tage.map(t => r.misch(t.grammatik.uebungen))
  for (let i = 0, n = 0; n < mengen.gram && i < 8; i++) for (const liste of jeTag) { if (n >= mengen.gram) break; if (liste[i]) { plus('grammatik', grammatikFrage(liste[i], r)); n++ } }

  // Lesen
  for (const q of stoff.lesetext.fragen) plus('lesen', verstehFrage(q, r, 'lesen', 'Lies den Text', stoff.lesetext))

  // Hören — ohne Ton stattdessen Sätze bauen (zählt dann als Schreiben, bleibt aber in diesem Teil)
  const zeilen = stoff.tage.flatMap(t => t.dialog.zeilen.map((z, i) => ({ t, z, i })))
  const hoerWoerter = ws.filter(w => o.ton(w.tag))
  if (hoerWoerter.length >= mengen.hoer) {
    // ganze Sätze nur von Tagen, an denen die Dialogzeilen sicher getrennt sind; den Rest füllen Wörter auf
    const saetze = r.ausN(zeilen.filter(x => (o.zeilen ?? o.ton)(x.t.tag) && inKacheln(x.z.it).length >= 3), Math.floor(mengen.hoer / 2))
    for (const w of hoerWoerter.slice(-(mengen.hoer - saetze.length))) plus('hoeren', wortHoeren(w, alle, r))
    for (const x of saetze) plus('hoeren', zeileHoeren(x.t.tag, x.i, x.t.dialog.zeilen, zeilen.filter(y => y.t !== x.t).map(y => y.z), r))
  } else {
    const saetze = stoff.tage.flatMap(t => bauSaetze(t, false))
    for (const s2 of waehleSaetze(saetze, r, mengen.hoer)) plus('hoeren', satzbau(s2, saetze, r))
  }

  // Gespräch: Rollenspiele aus allen Tagen
  for (const x of r.ausN(stoff.tage.flatMap(t => t.dialog.rollenspiel), mengen.gespr)) plus('gespraech', rollenFrage(x, r))
  return aus
}

/** Prüfung am Ende eines Levels: rund 40 Aufgaben in fünf Teilen. `versuch` ändert die Auswahl. */
export function baueEsame(inhalt: LevelInhalt, pool: readonly WortMitOrt[], o: Wuensche, versuch: number): PruefAufgabe[] {
  return bauePruefung({ tage: inhalt.tage, lesetext: inhalt.pruefung.lesetext }, pool, o, rng(`esame/${inhalt.level}/${versuch}`), { wort: 12, gram: 10, hoer: 6, gespr: 8 })
}

/** Abschnittsprüfung über mehrere Level (A1 = 1–8, A2 = 9–16, B1 = 17–24) */
export function baueAbschnittspruefung(level: readonly LevelInhalt[], o: Wuensche, versuch: number): PruefAufgabe[] {
  const r = rng(`abschnitt/${level[0]?.level}/${versuch}`)
  const tage = r.ausN(level.flatMap(l => l.tage), 12)
  return bauePruefung({ tage, lesetext: r.aus(level).pruefung.lesetext }, level.flatMap(l => l.tage).flatMap(woerterVon), o, r, { wort: 14, gram: 12, hoer: 6, gespr: 8 })
}

// ── Einstufung ──────────────────────────────────────────────────────────────────────────

export const EINSTUFUNG_STUFEN = [1, 5, 9, 13, 17, 21]
export interface EinstufAufgabe { block: number; a: GewerteteAufgabe }

/** je Block von vier Leveln sechs Aufgaben (drei Wörter, drei Grammatik), vom Leichten zum Schweren */
export function baueEinstufung(alle: readonly LevelInhalt[], start: number): EinstufAufgabe[] {
  const r = rng(start).zweig('einstufung')
  const aus: EinstufAufgabe[] = []
  for (let b = 0; b < 5; b++) {
    const level = alle.filter(l => l.level > b * 4 && l.level <= b * 4 + 4)
    if (level.length < 4) break
    const ws = level.flatMap(l => l.tage).flatMap(woerterVon)
    for (const w of r.ausN(ws, 3)) { const a = wortItDe(w, ws, r, false); if (a) aus.push({ block: b, a }) }
    for (const u of r.ausN(level.flatMap(l => l.tage.flatMap(t => t.grammatik.uebungen.slice(2))), 3)) aus.push({ block: b, a: grammatikFrage(u, r) })
  }
  return aus
}
/** Startlevel aus den Ergebnissen je Block: der erste Block mit weniger als 5 von 6 richtig */
export function einstufungsLevel(richtigJeBlock: readonly number[]): number {
  for (let b = 0; b < richtigJeBlock.length; b++) if (richtigJeBlock[b] < 5) return EINSTUFUNG_STUFEN[b]
  return EINSTUFUNG_STUFEN[Math.min(richtigJeBlock.length, EINSTUFUNG_STUFEN.length - 1)]
}

// ── Freies Training ─────────────────────────────────────────────────────────────────────

export function baueVokabeln(ws: readonly WortMitOrt[], pool: readonly WortMitOrt[], o: Wuensche, start: number, anzahl: number): GewerteteAufgabe[] {
  const r = rng(start).zweig('vokabeln')
  const aus: GewerteteAufgabe[] = []
  const wahl = r.ausN(ws, anzahl)
  wahl.forEach((w, i) => {
    const art = i % 5
    const a = art === 0 ? wortItDe(w, pool, r, o.ton(w.tag)) : art === 1 ? wortDeIt(w, pool, r)
      : art === 2 && o.tippen ? wortTippen(w) : art === 3 && o.ton(w.tag) ? wortHoeren(w, pool, r)
      : art === 4 && o.tippen ? (wortLuecke(w) ?? wortTippen(w)) : wortDeIt(w, pool, r)
    if (a) aus.push(a)
  })
  // zwischendurch Paare, wenn genug Wörter da sind
  if (wahl.length >= 10) aus.splice(Math.floor(aus.length / 2), 0, paare(wahl.slice(0, 5)))
  return aus
}
export function baueHoeren(ws: readonly WortMitOrt[], tage: readonly TagInhalt[], pool: readonly WortMitOrt[], o: Wuensche, start: number, anzahl: number): GewerteteAufgabe[] {
  const r = rng(start).zweig('hoeren')
  const aus: GewerteteAufgabe[] = []
  const hw = r.ausN(ws.filter(w => o.ton(w.tag)), Math.ceil(anzahl * 0.6))
  hw.forEach((w, i) => { const a = i % 3 === 2 && o.tippen ? wortDiktat(w) : wortHoeren(w, pool, r); if (a) aus.push(a) })
  const zeilen = tage.filter(t => (o.zeilen ?? o.ton)(t.tag)).flatMap(t => t.dialog.zeilen.map((z, i) => ({ t, z, i }))).filter(x => inKacheln(x.z.it).length >= 3)
  for (const x of r.ausN(zeilen, anzahl - aus.length)) { const a = zeileHoeren(x.t.tag, x.i, x.t.dialog.zeilen, zeilen.filter(y => y.t !== x.t).map(y => y.z), r); if (a) aus.push(a) }
  return r.misch(aus)
}
export function baueGrammatik(tage: readonly TagInhalt[], start: number, anzahl: number): GewerteteAufgabe[] {
  const r = rng(start).zweig('grammatik')
  return r.ausN(tage.flatMap(t => t.grammatik.uebungen), anzahl).map(u => grammatikFrage(u, r))
}
export function baueSatzbau(tage: readonly TagInhalt[], o: Wuensche, start: number, anzahl: number): GewerteteAufgabe[] {
  const r = rng(start).zweig('satzbau')
  const saetze = tage.flatMap(t => bauSaetze(t, o.ton(t.tag)))
  return waehleSaetze(saetze, r, anzahl).map(s => satzbau(s, saetze, r))
}
export function baueGespraech(tage: readonly TagInhalt[], start: number, anzahl: number): GewerteteAufgabe[] {
  const r = rng(start).zweig('gespraech')
  return r.ausN(tage.flatMap(t => t.dialog.rollenspiel), anzahl).map(x => rollenFrage(x, r))
}
export function baueLesen(level: readonly LevelInhalt[], start: number): GewerteteAufgabe[] {
  const r = rng(start).zweig('lesen')
  const l = r.aus(level)
  return l ? l.pruefung.lesetext.fragen.map(q => verstehFrage(q, r, 'lesen', 'Lies den Text', l.pruefung.lesetext)) : []
}
/** Tempo-Runde: so viele Wörter wie möglich in 60 Sekunden */
export const TEMPO_SEKUNDEN = 60
export function baueTempo(ws: readonly WortMitOrt[], start: number): GewerteteAufgabe[] {
  const r = rng(start).zweig('tempo')
  const aus: GewerteteAufgabe[] = []
  for (const w of r.ausN(ws, 60)) { const a = r.chance(0.5) ? wortItDe(w, ws, r, false) : wortDeIt(w, ws, r); if (a) aus.push(a) }
  return aus
}
