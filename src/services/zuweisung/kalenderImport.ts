// ── Team-Kalender (Teams-Urlaubsexport, XLSX) → Abwesenheiten ─────────────────
// Portierung von resources/Ticket Zuweisung/abwesenheiten.py.
// Erstes Blatt: Kopfzeile "Mitarbeitername"/"Employee Name"/"Name" + je Tag eine
// Spalte (TT.MM.JJJJ), Zelle "X" = arbeitsfrei/abwesend (auch WE/Feiertage).
// Nur Werktage zählen; Werktage mit X bei ALLEN = betriebsfrei; zusammenhängende
// X-Tage (Lücke ≤ 3 Tage, also auch über ein Wochenende) → Zeiträume. Namen werden
// auf die Schreibweise des Regelwerks abgebildet (Titel/Akzente/Umlaute).

import * as XLSX from 'xlsx'
import type { Abwesenheiten, Zeitraum } from './types'

const KOPF = new Set(['mitarbeitername', 'employee name', 'name'])
const TITEL = /^(dipl\.?-?ing\.?|dr\.?|prof\.?|b\.?sc\.?|m\.?sc\.?)\s+/i

/** Normalschlüssel für den Namensabgleich (wie abwesenheiten.schluessel). */
export function schluessel(n: string): string {
  let s = TITEL.exec(String(n).trim()) ? String(n).trim().replace(TITEL, '') : String(n).trim()
  s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
       .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '')  // Akzente entfernen
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}
function titelWeg(n: string): string { return String(n).trim().replace(TITEL, '') }

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Header-Zelle → Datum (Excel-Date, JS-Date oder "TT.MM.JJJJ"/"JJJJ-MM-TT"). */
function parseTag(h: unknown): Date | null {
  if (h instanceof Date && !isNaN(h.getTime())) return new Date(h.getFullYear(), h.getMonth(), h.getDate())
  const s = String(h ?? '').trim()
  if (!s) return null
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/.exec(s)
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]) }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  return null
}
function istWochenende(d: Date): boolean { const w = d.getDay(); return w === 0 || w === 6 }

export interface KalenderErgebnis extends Abwesenheiten { unbekannte_namen: string[] }

/**
 * Wertet einen XLSX-Kalender aus. `regelwerkNamen` = Namen aus regelwerk.personen,
 * damit die Kalendernamen auf deren Schreibweise abgebildet werden.
 */
export function parseTeamKalender(bytes: Uint8Array, regelwerkNamen: string[], quelleName = 'Kalender.xlsx'): KalenderErgebnis {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false, defval: null })
  const rows = grid.filter(r => Array.isArray(r) && r.some(v => v !== null && v !== undefined && String(v).trim() !== ''))
  if (rows.length === 0) throw new Error('Leeres Blatt.')
  const hdr = rows[0]
  const a1 = String(hdr[0] ?? '').trim().toLowerCase()
  if (!KOPF.has(a1)) throw new Error(`Unerwartete Kopfzeile „${hdr[0]}" (erwartet: Mitarbeitername/Employee Name/Name).`)

  // Spaltenindex → Datum
  const tage = new Map<number, Date>()
  for (let i = 1; i < hdr.length; i++) { const d = parseTag(hdr[i]); if (d) tage.set(i, d) }

  const zuordnung = new Map<string, string>()
  for (const k of regelwerkNamen) zuordnung.set(schluessel(k), k)

  const unbekannt: string[] = []
  const raw = new Map<string, Set<string>>()   // kanonischer Name → Set<ISO-Datum mit X>
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const name = String(row[0] ?? '').trim()
    if (!name || name.includes('=') || name.toLowerCase().startsWith('x ')) continue
    const key = schluessel(name)
    let kanon = zuordnung.get(key)
    if (!kanon) { unbekannt.push(name); kanon = titelWeg(name) }
    const set = raw.get(kanon) ?? new Set<string>()
    for (const [i, d] of tage) {
      const v = row[i]
      if (v !== null && v !== undefined && String(v).trim().toUpperCase() === 'X') set.add(isoOf(d))
    }
    raw.set(kanon, set)
  }

  // Werktage; betriebsfrei = Werktag mit X bei ALLEN Personen
  const werktage = [...tage.values()].filter(d => !istWochenende(d)).map(isoOf).sort()
  const werktageUniq = [...new Set(werktage)]
  const alle = [...raw.values()]
  const betriebsfrei = alle.length
    ? werktageUniq.filter(iso => alle.every(s => s.has(iso)))
    : []
  const bf = new Set(betriebsfrei)

  const personen: Record<string, { tage: number; zeitraeume: Zeitraum[] }> = {}
  for (const [kanon, set] of raw) {
    const abw = [...set].filter(iso => {
      const [y, m, d] = iso.split('-').map(Number)
      return !istWochenende(new Date(y, m - 1, d)) && !bf.has(iso)
    }).sort()
    const per: [string, string, number][] = []
    for (const iso of abw) {
      const last = per[per.length - 1]
      if (last && diffTage(last[1], iso) <= 3) { last[1] = iso; last[2] += 1 }
      else per.push([iso, iso, 1])
    }
    personen[kanon] = { tage: abw.length, zeitraeume: per.map(([von, bis, tage]) => ({ von, bis, tage })) }
  }

  const alleDaten = [...tage.values()].map(isoOf).sort()
  return {
    quelle: quelleName,
    blatt: wb.SheetNames[0],
    stand_datei: isoOf(new Date()),
    zeitraum: alleDaten.length ? { von: alleDaten[0], bis: alleDaten[alleDaten.length - 1] } : null,
    legende: 'X = arbeitsfrei/abwesend; Wochenenden herausgerechnet; Werktage mit X bei allen = betriebsfrei',
    betriebsfrei,
    unbekannte_namen: unbekannt,
    personen,
  }
}

function diffTage(isoA: string, isoB: string): number {
  const a = new Date(isoA + 'T00:00:00'), b = new Date(isoB + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
