// ── Filterlogik der Durchwahl-Prüfung ──────────────────────────────────────
//
// Bewusst von der Ansicht getrennt: was hier durchfällt, landet nicht im Export —
// und der Export ist die Grundlage dafür, welche Durchwahlen gekündigt werden.
// Diese Logik ist deshalb ohne Oberfläche prüfbar gehalten.
//
// Verhalten wie der Excel-Autofilter:
//   · Gespeichert wird je Spalte die Menge der AUSGEBLENDETEN Werte.
//   · Nichts ausgeblendet  → alles sichtbar (Vorgabe, auch für später neu dazukommende
//     Werte — etwa nachdem die AD-Prüfung durchgelaufen ist).
//   · Alle Werte ausgeblendet → keine Zeile sichtbar.
//   · Gezählt wird je Spalte auf der Grundmenge, die ALLE ANDEREN Filter passiert.

import {
  BEFUND_TEXT, STATUS_TEXT, OHNE_XELION, tageSeit, passtText,
  type DurchwahlZeile,
} from '../../services/rufnummerPruefung'
import { farbName, type FarbId } from '../../services/durchwahlAnsicht'

/**
 * Die Farbmarkierung liegt nicht in der Prüfliste, sondern im geteilten Arbeitsstand.
 * Für das Filtern wird sie der Zeile angeheftet — so bleibt die Spalte „Markierung"
 * eine Spalte wie jede andere.
 */
export type ZeileMitFarbe = DurchwahlZeile & { farbe: FarbId | '' }

export type SpaltenId =
  | 'farbe' | 'durchwahl' | 'name' | 'email' | 'corpId' | 'abteilung' | 'befund'
  | 'anmeldung' | 'rufnummerAd' | 'passt' | 'xelion' | 'status' | 'bemerkung'

export interface SpaltenDef {
  id: SpaltenId
  titel: string
  /**
   * Die Werte, unter denen die Zeile in dieser Spalte zählt. Eine Liste, weil eine Zeile
   * mehrfach zählen kann (mehrere Xelion-Gruppen). Leerer String = kein Wert vorhanden;
   * angezeigt wird dann `leerText`.
   */
  werte: (z: ZeileMitFarbe) => string[]
  leerText?: string
}

/** Altersklassen der letzten Anmeldung — als Filter brauchbarer als das rohe Datum. */
export function anmeldeKlasse(z: DurchwahlZeile): string {
  if (z.befund === 'nicht-im-ad') return 'kein AD-Konto'
  if (z.befund === 'ohne-namen') return 'kein Name'
  const tage = tageSeit(z.zuletztOnline)
  if (tage === null) return 'nie / unbekannt'
  if (tage <= 30) return 'letzte 30 Tage'
  if (tage <= 90) return '31–90 Tage'
  if (tage <= 180) return '91–180 Tage'
  return 'älter als 180 Tage'
}

/** Eine Spalte hier eintragen genügt — Kopfzeile, Filter und Zählwerte folgen daraus. */
export const SPALTEN_DEF: SpaltenDef[] = [
  { id: 'farbe',       titel: 'Markierung',          werte: z => [farbName(z.farbe)], leerText: '(ohne Markierung)' },
  { id: 'durchwahl',   titel: 'Durchwahl',           werte: z => [z.durchwahl] },
  { id: 'name',        titel: 'Name (Liste)',        werte: z => [z.name], leerText: '(nicht vergeben)' },
  { id: 'email',       titel: 'E-Mail',              werte: z => [z.email], leerText: '(ohne E-Mail)' },
  { id: 'corpId',      titel: 'Corp ID',             werte: z => [z.corpId], leerText: '(ohne Corp ID)' },
  { id: 'abteilung',   titel: 'Abteilung',           werte: z => [z.abteilung || z.abteilungListe], leerText: '(ohne Abteilung)' },
  { id: 'befund',      titel: 'AD-Status',           werte: z => [BEFUND_TEXT[z.befund]] },
  { id: 'anmeldung',   titel: 'Zuletzt angemeldet',  werte: z => [anmeldeKlasse(z)] },
  { id: 'rufnummerAd', titel: 'Rufnummer im AD',     werte: z => [z.rufnummerAd], leerText: '(keine im AD)' },
  // Vergleich der letzten vier Stellen mit der Durchwahl. „keine Rufnummer" ist bewusst
  // ein eigener Wert — das ist etwas anderes als „ungleich".
  { id: 'passt',       titel: 'Rufnummer = Durchwahl', werte: z => [passtText(z)], leerText: '(keine Rufnummer)' },
  { id: 'xelion',      titel: 'Xelion-Berechtigung', werte: z => (z.xelionGruppen.length ? z.xelionGruppen : [OHNE_XELION]) },
  { id: 'status',      titel: 'Durchwahl-Status',    werte: z => [STATUS_TEXT[z.status]] },
  { id: 'bemerkung',   titel: 'Bemerkung',           werte: z => [z.bemerkung], leerText: '(ohne Bemerkung)' },
]

/** Je Spalte die ausgeblendeten Werte; fehlender Eintrag = nichts ausgeblendet. */
export type Ausgeblendet = Partial<Record<SpaltenId, Set<string>>>

export const KEIN_FILTER: Set<string> = new Set()

/** Die Felder, die die freie Suche durchsucht. */
function suchfelder(z: ZeileMitFarbe): string[] {
  return [z.durchwahl, z.name, z.email, z.corpId, z.abteilung, z.abteilungListe,
    z.gefundenAls, z.rufnummerAd, z.xelionGruppen.join(' '), z.bemerkung, z.grund]
}

/**
 * Je Spalte eine eigene Bedingung, plus eine für die freie Suche. Getrennt gehalten,
 * damit für die Zählwerte gezielt EINE davon weggelassen werden kann.
 */
export function baueFilter(aus: Ausgeblendet, suche: string): Record<string, (z: ZeileMitFarbe) => boolean> {
  const q = suche.trim().toLowerCase()
  const p: Record<string, (z: ZeileMitFarbe) => boolean> = {
    suche: z => !q || suchfelder(z).some(x => (x || '').toLowerCase().includes(q)),
  }
  for (const d of SPALTEN_DEF) {
    const weg = aus[d.id]
    // Mehrfachzugehörigkeit: die Zeile bleibt sichtbar, solange EINER ihrer Werte
    // eingeblendet ist.
    p[d.id] = weg && weg.size ? (z => d.werte(z).some(v => !weg.has(v))) : () => true
  }
  return p
}

export function wendeAn(zeilen: ZeileMitFarbe[], p: Record<string, (z: ZeileMitFarbe) => boolean>): ZeileMitFarbe[] {
  return zeilen.filter(z => Object.values(p).every(f => f(z)))
}

/** Grundmenge für die Zählwerte EINER Spalte: alle anderen Filter gelten, die eigene nicht. */
export function basisOhne(
  zeilen: ZeileMitFarbe[], p: Record<string, (z: ZeileMitFarbe) => boolean>, ausser: string,
): ZeileMitFarbe[] {
  return zeilen.filter(z => Object.entries(p).every(([k, f]) => k === ausser || f(z)))
}

export function zaehlwerte(
  zeilen: ZeileMitFarbe[], p: Record<string, (z: ZeileMitFarbe) => boolean>,
): Record<SpaltenId, Map<string, number>> {
  const r = {} as Record<SpaltenId, Map<string, number>>
  for (const d of SPALTEN_DEF) {
    const m = new Map<string, number>()
    for (const z of basisOhne(zeilen, p, d.id)) {
      for (const v of d.werte(z)) m.set(v, (m.get(v) || 0) + 1)
    }
    r[d.id] = m
  }
  return r
}

// ── Umwandlung für die geteilte Ablage ──────────────────────────────────────
// `Set` übersteht kein JSON, deshalb wird je Spalte eine Liste gespeichert. Unbekannte
// Spalten (etwa aus einer älteren Programmversion) werden beim Lesen verworfen, damit
// ein alter Stand nicht stillschweigend einen Filter setzt, den niemand sieht.

export function ausAlsObjekt(aus: Ausgeblendet): Record<string, string[]> {
  const o: Record<string, string[]> = {}
  for (const d of SPALTEN_DEF) {
    const s = aus[d.id]
    // Sortiert, damit zwei inhaltsgleiche Filter auch gleich aussehen (siehe gleicherFilter).
    if (s && s.size) o[d.id] = [...s].sort()
  }
  return o
}

export function ausAusObjekt(o: Record<string, string[]> | undefined): Ausgeblendet {
  const aus: Ausgeblendet = {}
  if (!o) return aus
  for (const d of SPALTEN_DEF) {
    const l = o[d.id]
    if (Array.isArray(l) && l.length) aus[d.id] = new Set(l)
  }
  return aus
}

/** Gleichheitsprüfung, damit nur echte Änderungen geschrieben werden. */
export function gleicherFilter(a: Ausgeblendet, b: Ausgeblendet): boolean {
  return JSON.stringify(ausAlsObjekt(a)) === JSON.stringify(ausAlsObjekt(b))
}

export function filterAktiv(aus: Ausgeblendet, suche: string): boolean {
  return Object.values(aus).some(s => s && s.size > 0) || !!suche.trim()
}

/** Nur einen Statuswert einblenden — Grundlage des Schnellgriffs „Kündigung möglich". */
export function nurDiesenStatus(text: string): Ausgeblendet {
  return { status: new Set(Object.values(STATUS_TEXT).filter(t => t !== text)) }
}

/**
 * Was gefiltert ist, gehört in den Export-Kopf — sonst ist später nicht nachvollziehbar,
 * auf welchen Ausschnitt sich eine Kündigungsliste bezieht.
 */
export function filterBeschreibung(
  aus: Ausgeblendet, werte: Record<SpaltenId, Map<string, number>>, suche: string,
): string {
  const teile: string[] = []
  for (const d of SPALTEN_DEF) {
    const weg = aus[d.id]
    if (!weg || !weg.size) continue
    const alle = [...(werte[d.id]?.keys() ?? [])]
    const sichtbar = alle.filter(v => !weg.has(v)).map(v => v || (d.leerText ?? '(leer)'))
    if (!sichtbar.length) teile.push(`${d.titel}: nichts eingeblendet`)
    else if (sichtbar.length > 8) teile.push(`${d.titel}: ${sichtbar.length} von ${alle.length} Werten`)
    else teile.push(`${d.titel}: ${sichtbar.join(', ')}`)
  }
  if (suche.trim()) teile.push(`Suche: „${suche.trim()}“`)
  return teile.length ? `Filter — ${teile.join(' | ')}` : ''
}
