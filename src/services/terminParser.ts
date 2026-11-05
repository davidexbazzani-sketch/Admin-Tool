// ── Terminvorschläge aus freien Mail-Antworten lesen (ohne KI, regelbasiert) ─────
// Erkennt typische deutsche Schreibweisen, z. B.:
//   „Freitag ab 10 Uhr" · „am 23.10. zwischen 9 und 11" · „Do, 22.10.2026 13:30–15:00"
//   „morgen vormittag" · „nächste Woche Dienstag um 14 Uhr" · „übermorgen 8-12"
//   „kann erst am 3. November nachmittags"
// Liefert Start/Ende + „eindeutig" (Datum UND konkrete Uhrzeit genannt). Nur eindeutige
// Vorschläge werden automatisch umgetragen, alles andere als Vorschlag angezeigt.
//
// WICHTIG: Antworten enthalten fast immer den zitierten Original-Termin. Darum wird der
// Text vor dem ersten Zitat-Kopf abgeschnitten („Von:", „-----Original", „Am … schrieb").

export interface TerminVorschlag {
  start: Date
  ende: Date
  eindeutig: boolean
  /** Erkannte Textstelle (für die Anzeige „erkannt aus: …"). */
  fundstelle: string
  /** true = nur aus einem verneinten Satz gelesen („um 9 kann ich nicht") — kein echter Vorschlag. */
  ausVerneinung?: boolean
  /** true = konkrete Uhrzeit genannt (nicht nur „vormittags"). */
  zeitKonkret?: boolean
  /** true = genau EINE Uhrzeit („um 09:00", „halb 10") — das ist die Ankunftszeit. */
  einzelzeit?: boolean
}

// Kürzel nur für Mo–Fr; „so"/„sa" kommen als normale Wörter zu oft vor („so passt es").
const WOCHENTAGE: [RegExp, number][] = [
  [/\bsonntag\b/i, 0], [/\b(montag|mo\.?)(?=[\s,.]|$)/i, 1], [/\b(dienstag|di\.?)(?=[\s,.]|$)/i, 2],
  [/\b(mittwoch|mi\.?)(?=[\s,.]|$)/i, 3], [/\b(donnerstag|do\.?)(?=[\s,.]|$)/i, 4], [/\b(freitag|fr\.?)(?=[\s,.]|$)/i, 5],
  [/\bsamstag\b/i, 6],
]
const MONATE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']

/** Nur den neuen Teil der Antwort (ohne zitierte Originalnachricht). */
export function ohneZitat(text: string): string {
  const t = (text || '').replace(/\r\n/g, '\n')
  const marken = [
    /^\s*(von|from|gesendet|sent)\s*:/im,
    /^-{2,}\s*(original|ursprüngliche|urspr)/im,
    /^\s*am .{3,80}schrieb/im,
    /^\s*on .{3,80}wrote/im,
    /^\s*>/m,
  ]
  let ende = t.length
  for (const m of marken) { const i = t.search(m); if (i >= 0 && i < ende) ende = i }
  return t.slice(0, ende)
}

function tagBeginn(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

/** Nächster Wochentag `wt` NACH dem Bezugstag (heute zählt nicht); „nächste Woche" → in der Folgewoche. */
function naechsterWochentag(bezug: Date, wt: number, folgewoche: boolean): Date {
  const d = tagBeginn(bezug)
  if (folgewoche) {
    const montag = new Date(d); montag.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))   // nächster Montag
    const r = new Date(montag); r.setDate(montag.getDate() + ((wt + 6) % 7))
    return r
  }
  const r = new Date(d); r.setDate(d.getDate() + (((wt - d.getDay()) + 7) % 7 || 7))
  return r
}

/** Datum ohne Jahr: das nächste Vorkommen ab dem Bezugstag (sonst nächstes Jahr). */
function mitJahr(tag: number, monat: number, jahr: number | undefined, bezug: Date): Date | null {
  if (monat < 0 || monat > 11 || tag < 1 || tag > 31) return null
  if (jahr !== undefined) { const j = jahr < 100 ? 2000 + jahr : jahr; const d = new Date(j, monat, tag); return d.getMonth() === monat ? d : null }
  const b = tagBeginn(bezug)
  let d = new Date(b.getFullYear(), monat, tag)
  if (d < b) d = new Date(b.getFullYear() + 1, monat, tag)
  return d.getMonth() === monat ? d : null
}

function findeDatum(t: string, bezug: Date): { d: Date; stelle: string } | null {
  let m = t.match(/\b(\d{1,2})\.\s?(\d{1,2})\.(\s?(\d{4}|\d{2})\b)?/)
  if (m) { const d = mitJahr(+m[1], +m[2] - 1, m[4] ? +m[4] : undefined, bezug); if (d) return { d, stelle: m[0] } }
  // Ohne Schlusspunkt („den 27.10 um 10") — aber keine Uhrzeit wie „um 10.30" oder „9.15 Uhr"
  m = t.match(/(?<!\b(?:um|ab|gegen|bis|von)\s)\b(\d{1,2})\.(\d{1,2})\b(?!\s*uhr)(?![:.]\d)/i)
  if (m && +m[2] >= 1 && +m[2] <= 12) { const d = mitJahr(+m[1], +m[2] - 1, undefined, bezug); if (d) return { d, stelle: m[0] } }
  const mon = new RegExp(`\\b(\\d{1,2})\\.?\\s*(${MONATE.join('|')})(\\s+(\\d{4}))?`, 'i')
  m = t.match(mon)
  if (m) { const d = mitJahr(+m[1], MONATE.indexOf(m[2].toLowerCase()), m[4] ? +m[4] : undefined, bezug); if (d) return { d, stelle: m[0] } }
  // \b kennt „ü" nicht als Buchstaben → eigene Grenze
  if (/(?<![a-zäöüß])übermorgen(?![a-zäöüß])/i.test(t)) { const d = tagBeginn(bezug); d.setDate(d.getDate() + 2); return { d, stelle: 'übermorgen' } }
  if (/\bmorgen\b/i.test(t.replace(/\bmorgens\b/gi, ''))) { const d = tagBeginn(bezug); d.setDate(d.getDate() + 1); return { d, stelle: 'morgen' } }
  if (/\bheute\b/i.test(t)) return { d: tagBeginn(bezug), stelle: 'heute' }
  const folgewoche = /\b(nächste|naechste|kommende)n?\s+woche\b/i.test(t)
  for (const [re, wt] of WOCHENTAGE) {
    const w = t.match(re)
    if (w) return { d: naechsterWochentag(bezug, wt, folgewoche), stelle: (folgewoche ? 'nächste Woche ' : '') + w[0] }
  }
  return null
}

const ZAHLWORT: Record<string, number> = { eins: 1, ein: 1, zwei: 2, drei: 3, vier: 4, 'fünf': 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, 'zwölf': 12 }
const stunde = (s: string) => (/^\d+$/.test(s) ? +s : ZAHLWORT[s.toLowerCase()] ?? NaN)
/** Im Arbeitsalltag ist „2" = 14 Uhr (1–5 → nachmittags). */
const nachmittag = (h: number) => (h >= 1 && h <= 5 ? h + 12 : h)
const zeit = (h: string, min?: string) => ({ h: nachmittag(+h), m: min ? +min : 0 })
const gueltig = (z: { h: number; m: number }) => z.h >= 6 && z.h <= 20 && z.m >= 0 && z.m < 60

function findeZeit(t: string): { von: { h: number; m: number }; bis?: { h: number; m: number }; konkret: boolean; ab?: boolean; stelle: string } | null {
  // Spanne: „zwischen 9 und 11", „9-11 Uhr", „13:30 – 15:00", „von 8 bis 12"
  let m = t.match(/\b(?:zwischen|von)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?\s*(?:-|–|bis|und)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?/i)
  if (m) {
    const a = zeit(m[1], m[2]), b = zeit(m[3], m[4])
    // Datum wie „22.10" nicht als Uhrzeit lesen: nur wenn „uhr", ":" oder Schlüsselwort beteiligt
    const echt = /uhr|:|zwischen|von|bis/i.test(m[0])
    if (echt && gueltig(a) && gueltig(b) && (b.h * 60 + b.m) > (a.h * 60 + a.m)) return { von: a, bis: b, konkret: true, stelle: m[0].trim() }
  }
  // Umgangssprache: „halb 9" = 8:30, „viertel nach 9", „viertel vor 10"/„dreiviertel 10", „kurz nach/vor 9",
  // auch mit Zahlwort („halb neun", „um zehn"). Stunden 1–5 = nachmittags („halb 2" = 13:30).
  const H = `(\\d{1,2}|${Object.keys(ZAHLWORT).join('|')})`
  const relativ: [RegExp, (h: number) => { h: number; m: number }][] = [
    [new RegExp(`\\bhalb\\s+${H}\\b`, 'i'), h => ({ h: h - 1, m: 30 })],
    [new RegExp(`\\bviertel\\s+nach\\s+${H}\\b`, 'i'), h => ({ h, m: 15 })],
    [new RegExp(`\\b(?:viertel\\s+vor|dreiviertel)\\s+${H}\\b`, 'i'), h => ({ h: h - 1, m: 45 })],
    [new RegExp(`\\bkurz\\s+nach\\s+${H}\\b`, 'i'), h => ({ h, m: 10 })],
    [new RegExp(`\\bkurz\\s+vor\\s+${H}\\b`, 'i'), h => ({ h: h - 1, m: 50 })],
    [new RegExp(`\\b(?:um|gegen|ab)\\s+(${Object.keys(ZAHLWORT).join('|')})\\b`, 'i'), h => ({ h, m: 0 })],
  ]
  for (const [re, f] of relativ) {
    const r = t.match(re)
    if (!r) continue
    const a = f(nachmittag(stunde(r[1])))
    if (gueltig(a)) return { von: a, konkret: true, ab: /^ab\b/i.test(r[0].trim()), stelle: r[0].trim() }
  }
  // Einzelzeit: „ab 10", „um 14:30", „10 Uhr", „gegen 9"
  m = t.match(/\b(?:ab|um|gegen)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?/i) || t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*uhr\b/i) || t.match(/\b(\d{1,2}):(\d{2})\b/)
  if (m) { const a = zeit(m[1], m[2]); if (gueltig(a)) return { von: a, konkret: true, ab: /^ab\b/i.test(m[0].trim()), stelle: m[0].trim() } }
  // Tageszeit-Wörter
  if (/vormittag|morgens|früh/i.test(t)) return { von: { h: 8, m: 0 }, bis: { h: 12, m: 0 }, konkret: false, stelle: 'vormittags' }
  if (/nachmittag/i.test(t)) return { von: { h: 13, m: 0 }, bis: { h: 16, m: 0 }, konkret: false, stelle: 'nachmittags' }
  if (/mittag/i.test(t)) return { von: { h: 11, m: 30 }, bis: { h: 13, m: 30 }, konkret: false, stelle: 'mittags' }
  return null
}

/**
 * @param bezug  Empfangszeitpunkt der Mail (relative Angaben wie „morgen" beziehen sich darauf)
 * @param bisher bisheriger Termin (Fallback für fehlendes Datum bzw. fehlende Uhrzeit)
 */
export function leseTerminVorschlag(text: string, bezug: Date, bisher: { start: Date; ende: Date }): TerminVorschlag | null {
  // Grußformel entfernen („Guten Morgen" ≠ morgen)
  const t = ohneZitat(text).replace(/guten\s+morgen/gi, ' ').replace(/\s+/g, ' ')
  if (!t.trim()) return null

  // In Teilsätze zerlegen — an Satzzeichen (Punkt NICHT zwischen Ziffern, Daten bleiben ganz),
  // an KOMMAS und an Wendungen, die einen Gegenvorschlag einleiten. Dann den LETZTEN
  // Teilsatz mit Datum/Uhrzeit nehmen, der nicht verneint ist:
  //   „Donnerstag leider nicht. Freitag ab 10"                  → Freitag 10
  //   „kann leider nicht, wie wäre es mit Dienstag 10 Uhr?"     → Dienstag 10
  //   „Freitag, 10 Uhr"                                         → Uhrzeit-Teil + Datum davor
  const teile = t.split(/[!?;,]|(?<!\d)\.(?!\d)|\baber\b|\bsondern\b|\bdafür\b|\bstattdessen\b|\bwie wäre es\b|\bginge?\b|\bwäre\b/i).map(s => s.trim()).filter(Boolean)
  // Verneint = der Teilsatz lehnt ab. „leider" allein verneint nicht („wäre leider erst Dienstag möglich").
  const verneint = (s: string) => /\b(nicht|kein|keine|keinen)\b/i.test(s)
  const lese = (s: string) => { const d = findeDatum(s, bezug); return { d, z: findeZeit(d ? s.replace(d.stelle, ' ') : s) } }
  let datum: ReturnType<typeof findeDatum> = null
  let z: ReturnType<typeof findeZeit> = null
  for (let i = teile.length - 1; i >= 0; i--) {
    if (verneint(teile[i])) continue
    const r = lese(teile[i])
    if (!r.d && !r.z) continue
    datum = r.d; z = r.z
    // Datum ohne Uhrzeit → Uhrzeit evtl. im direkt folgenden Teilsatz („Freitag. Ab 10 Uhr")
    if (datum && !z && teile[i + 1] && !verneint(teile[i + 1])) z = findeZeit(teile[i + 1])
    // Uhrzeit ohne Datum → Datum evtl. in den Teilsätzen davor („Freitag, 10 Uhr"), aber nicht aus verneinten
    if (z && !datum) {
      for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
        if (verneint(teile[j])) break
        const d = findeDatum(teile[j], bezug)
        if (d) { datum = d; break }
      }
    }
    break
  }
  let ausVerneinung = false
  if (!datum && !z) {
    // Alles verneint/ohne Treffer: notfalls den ganzen Text (z. B. „nicht vor 10 Uhr")
    const r = lese(t); datum = r.d; z = r.z
    ausVerneinung = !!(datum || z) && verneint(t)
  }
  if (!datum && !z) return null

  const tag = datum?.d ?? tagBeginn(bisher.start)
  const dauerMin = Math.round((bisher.ende.getTime() - bisher.start.getTime()) / 60000)
  const start = new Date(tag), ende = new Date(tag)
  if (z) {
    start.setHours(z.von.h, z.von.m, 0, 0)
    if (z.bis) ende.setHours(z.bis.h, z.bis.m, 0, 0)
    else if (z.ab) {
      // „ab 10" → ab da bis zum bisherigen Fensterende (mindestens 1 Std.)
      ende.setHours(bisher.ende.getHours(), bisher.ende.getMinutes(), 0, 0)
      if (ende.getTime() - start.getTime() < 3600000) ende.setTime(start.getTime() + 3600000)
    } else { ende.setTime(start.getTime() + Math.min(dauerMin, 60) * 60000) }   // „um X" → bis zu 1 Std.
  } else {
    start.setHours(bisher.start.getHours(), bisher.start.getMinutes(), 0, 0)
    ende.setHours(bisher.ende.getHours(), bisher.ende.getMinutes(), 0, 0)
  }
  if (start.getTime() === bisher.start.getTime() && ende.getTime() === bisher.ende.getTime()) return null   // nur der alte Termin wiederholt
  return {
    start, ende,
    // Eindeutig = konkrete Uhrzeit genannt. Ohne Datum ist der Tag der Einladung gemeint
    // („Zusage, aber erst ab 14 Uhr"). Nur Datum oder nur „vormittags" bleibt ein Vorschlag.
    eindeutig: !!z?.konkret,
    fundstelle: [datum?.stelle, z?.stelle].filter(Boolean).join(' · '),
    ausVerneinung,
    zeitKonkret: !!z?.konkret,
    einzelzeit: !!z?.konkret && !z.bis && !z.ab,
  }
}

/** Grobe Einordnung einer Antwort ohne erkennbaren Vorschlag. */
export function leseAbsicht(text: string): 'absage' | 'zusage' | 'unklar' {
  const t = ohneZitat(text).toLowerCase()
  if (/(schaffe|kann|komme|passt).{0,30}(nicht|leider)|leider nicht|verhindert|im urlaub|krank|abwesend/.test(t)) return 'absage'
  // Zusage-Formulierungen (Absage wird oben zuerst geprüft, „ja, leider nicht" landet dort)
  if (/(^|[^a-zäöüß])(ja|jo|jep|ok|okay|passt|alles klar|geht klar|klappt|gerne?|super|perfekt|top|bin dabei|zusage|einverstanden|danke,? passt|bis dann|bis morgen)([^a-zäöüß]|$)/.test(t)) return 'zusage'
  if (/\bbin\b.{0,25}\bda\b|\bkomme\b(?!.{0,20}nicht)|👍/.test(t)) return 'zusage'
  return 'unklar'
}

/** Was will der Mitarbeiter mit seiner Antwort? */
export type Antwort =
  | { typ: 'zusage'; ankunft?: string; fundstelle?: string }     // ankunft „HH:mm" oder „HH:mm–HH:mm" innerhalb des Zeitfensters
  | { typ: 'vorschlag'; vorschlag: TerminVorschlag }
  | { typ: 'absage' }
  | { typ: 'unklar' }

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/**
 * Antwort auf eine Übergabe-Einladung einordnen.
 * Kernregel: Eine Uhrzeit INNERHALB des bestehenden Zeitfensters (gleicher Tag) ist eine
 * Zusage mit Ankunftszeit („alles klar, bin um 08:30 da" bei 08–13 Uhr) — kein Verschieben.
 * Liegt sie außerhalb oder an einem anderen Tag, ist es ein Gegenvorschlag.
 */
export function leseAntwort(text: string, bezug: Date, termin: { start: Date; ende: Date }, outlookKlasse?: number): Antwort {
  const absicht = outlookKlasse === 55 ? 'absage' : leseAbsicht(text)
  const tv = leseTerminVorschlag(text, bezug, termin)
  if (tv && !tv.ausVerneinung) {
    const gleicherTag = tv.start.toDateString() === termin.start.toDateString()
    // Im Fenster = Beginn im Fenster und (bei Zeitraum) Ende nicht danach
    // Bei einer ABLEHNUNG ist eine genannte Zeit immer ein Gegenvorschlag — auch wenn sie im
    // alten Fenster liegt („Ablehnen: schaffe erst 12 Uhr" → Termin auf 12 Uhr, keine Zusage)
    const imFenster = outlookKlasse !== 55 && gleicherTag && tv.start.getTime() >= termin.start.getTime() && tv.start.getTime() < termin.ende.getTime()
      && (tv.einzelzeit || tv.ende.getTime() <= termin.ende.getTime())
    if (imFenster) {
      // Ankunft nur bei konkreter Uhrzeit — „morgen vormittag" ist eine Zusage ohne genaue Zeit.
      // Einzelzeit → „08:30", Zeitraum („zwischen 9 und 10") → „09:00–10:00"
      if (!tv.zeitKonkret) return { typ: 'zusage', fundstelle: tv.fundstelle }
      return { typ: 'zusage', ankunft: tv.einzelzeit ? hhmm(tv.start) : `${hhmm(tv.start)}–${hhmm(tv.ende)}`, fundstelle: tv.fundstelle }
    }
    return { typ: 'vorschlag', vorschlag: tv }
  }
  if (outlookKlasse === 56 || absicht === 'zusage') return { typ: 'zusage' }
  if (absicht === 'absage') return { typ: 'absage' }
  return { typ: 'unklar' }
}
