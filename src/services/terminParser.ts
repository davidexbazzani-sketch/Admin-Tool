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

const zeit = (h: string, min?: string) => ({ h: +h, m: min ? +min : 0 })
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

  // In Teilsätze zerlegen (Punkt NICHT zwischen Ziffern → Daten bleiben ganz) und den
  // LETZTEN Teilsatz mit Datum/Uhrzeit nehmen, der nicht verneint ist:
  // „Donnerstag leider nicht. Freitag ab 10" → Freitag.
  const teile = t.split(/(?<!\d)[.!?;](?!\d)|\baber\b|\bsondern\b|\bdafür\b/i).map(s => s.trim()).filter(Boolean)
  const verneint = (s: string) => /\b(nicht|leider|kein|keine)\b/i.test(s)
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
    break
  }
  if (!datum && !z) {
    // Alles verneint/ohne Treffer: notfalls den ganzen Text (z. B. „nicht vor 10 Uhr")
    const r = lese(t); datum = r.d; z = r.z
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
    eindeutig: !!datum && !!z?.konkret,
    fundstelle: [datum?.stelle, z?.stelle].filter(Boolean).join(' · '),
  }
}

/** Grobe Einordnung einer Antwort ohne erkennbaren Vorschlag. */
export function leseAbsicht(text: string): 'absage' | 'zusage' | 'unklar' {
  const t = ohneZitat(text).toLowerCase()
  if (/(schaffe|kann|komme|passt).{0,30}(nicht|leider)|leider nicht|verhindert|im urlaub|krank|abwesend/.test(t)) return 'absage'
  if (/\b(passt|komme gern|komme gerne|bin dabei|ok|okay|alles klar|danke, passt|zusage)\b/.test(t)) return 'zusage'
  return 'unklar'
}
