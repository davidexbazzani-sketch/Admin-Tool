// ── Geteilter Arbeitsstand der Durchwahl-Prüfung ────────────────────────────
//
// Zwei Ablagen auf dem Netzlaufwerk, bewusst getrennt:
//
//   · xelion/durchwahl_ansicht.json — Farbmarkierungen, Spaltenfilter, Suche, Karenzzeit.
//     Klein, wird oft geschrieben, alle Nutzer sehen dasselbe (das war die Vorgabe:
//     „live für alle anderen user auch immer gleich").
//   · xelion/durchwahl_stand.json — die geprüfte Liste selbst. Damit steht sie beim
//     Menüwechsel sofort wieder da, statt bei jedem Öffnen neu gegen das AD zu laufen.
//
// Farbmarkierungen werden je Durchwahl EINZELN zusammengeführt (lesen → nur den eigenen
// Schlüssel ändern → schreiben). Sonst würde beim gleichzeitigen Arbeiten die Markierung
// eines Kollegen überschrieben. Bei Filtern ist Überschreiben gewollt, denn die sollen
// bei allen gleich stehen.

import { api } from '../electronAPI'
import { KARENZ_VORGABE_TAGE, type PruefErgebnis } from './rufnummerPruefung'

const ANSICHT_FILE = 'xelion/durchwahl_ansicht.json'
const STAND_FILE = 'xelion/durchwahl_stand.json'

export type FarbId = 'gelb' | 'gruen' | 'rot' | 'blau' | 'orange' | 'lila' | 'grau'

export interface Farbe {
  id: FarbId
  /** Name in der Filterliste und im Export. */
  name: string
  /** Hintergrund der Zeile — nur getönt, die Schrift bleibt schwarz/weiß wie überall. */
  zeile: string
  /** Der Farbpunkt zum Auswählen. */
  punkt: string
}

export const FARBEN: Farbe[] = [
  { id: 'gelb',   name: 'Gelb',   zeile: 'bg-yellow-400/20',  punkt: 'bg-yellow-400' },
  { id: 'gruen',  name: 'Grün',   zeile: 'bg-emerald-400/20', punkt: 'bg-emerald-400' },
  { id: 'rot',    name: 'Rot',    zeile: 'bg-red-400/20',     punkt: 'bg-red-400' },
  { id: 'blau',   name: 'Blau',   zeile: 'bg-sky-400/20',     punkt: 'bg-sky-400' },
  { id: 'orange', name: 'Orange', zeile: 'bg-orange-400/20',  punkt: 'bg-orange-400' },
  { id: 'lila',   name: 'Lila',   zeile: 'bg-violet-400/20',  punkt: 'bg-violet-400' },
  { id: 'grau',   name: 'Grau',   zeile: 'bg-slate-400/25',   punkt: 'bg-slate-400' },
]

const NACH_ID = new Map(FARBEN.map(f => [f.id, f]))
export function farbe(id: FarbId | '' | undefined): Farbe | undefined {
  return id ? NACH_ID.get(id) : undefined
}
/** Der Wert, unter dem die Spalte „Markierung" filtert — leer = keine Markierung. */
export function farbName(id: FarbId | '' | undefined): string {
  return farbe(id)?.name ?? ''
}

export interface AnsichtStand {
  version: number
  /** Durchwahl → Farbe. Die Nummer ist der stabile Schlüssel, nicht die Zeilennummer. */
  markierungen: Record<string, FarbId>
  /** SpaltenId → die ausgeblendeten Werte dieser Spalte. */
  ausgeblendet: Record<string, string[]>
  suche: string
  karenzTage: number
  updatedAt: string
  updatedBy: string
  /**
   * Zeitstempel des zuletzt geteilten Listen-Schnappschusses. Steht mit in dieser kleinen
   * Datei, damit die Ansicht im Takt nur ein paar Bytes lesen muss und die große
   * Listendatei nur dann holt, wenn sie sich wirklich geändert hat.
   */
  standAt: string
}

export function leererStand(karenzTage: number): AnsichtStand {
  return {
    version: 1, markierungen: {}, ausgeblendet: {}, suche: '', karenzTage,
    updatedAt: '', updatedBy: '', standAt: '',
  }
}

function bereinige(s: unknown, karenzTage: number): AnsichtStand {
  const leer = leererStand(karenzTage)
  if (!s || typeof s !== 'object') return leer
  const o = s as Partial<AnsichtStand>
  const mark: Record<string, FarbId> = {}
  for (const [k, v] of Object.entries(o.markierungen || {})) {
    if (typeof v === 'string' && NACH_ID.has(v as FarbId)) mark[k] = v as FarbId
  }
  const aus: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(o.ausgeblendet || {})) {
    if (Array.isArray(v)) aus[k] = v.filter(x => typeof x === 'string')
  }
  return {
    version: 1,
    markierungen: mark,
    ausgeblendet: aus,
    suche: typeof o.suche === 'string' ? o.suche : '',
    karenzTage: typeof o.karenzTage === 'number' && o.karenzTage >= 0 ? o.karenzTage : karenzTage,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : '',
    updatedBy: typeof o.updatedBy === 'string' ? o.updatedBy : '',
    standAt: typeof o.standAt === 'string' ? o.standAt : '',
  }
}

export async function ladeAnsicht(karenzVorgabe: number = KARENZ_VORGABE_TAGE): Promise<AnsichtStand> {
  try { return bereinige(await api().netReadJson<AnsichtStand>(ANSICHT_FILE), karenzVorgabe) }
  catch { return leererStand(karenzVorgabe) }
}

// Schreibvorgänge dieser Sitzung hintereinander, damit sich zwei schnelle Klicks
// nicht gegenseitig überholen.
let kette: Promise<unknown> = Promise.resolve()
function nacheinander<T>(fn: () => Promise<T>): Promise<T> {
  const next = kette.then(fn, fn)
  kette = next.then(() => {}, () => {})
  return next
}

async function schreibe(stand: AnsichtStand, by: string): Promise<AnsichtStand> {
  const neu: AnsichtStand = { ...stand, version: 1, updatedAt: new Date().toISOString(), updatedBy: by }
  try { await api().netWriteJson(ANSICHT_FILE, neu) } catch { /* dann steht es nur lokal */ }
  return neu
}

/**
 * Eine Markierung setzen (oder mit `null` entfernen) — zusammengeführt, damit die
 * Markierungen anderer Nutzer dabei nicht verloren gehen.
 */
export async function setzeMarkierung(
  durchwahl: string, f: FarbId | null, by: string, karenzVorgabe: number = KARENZ_VORGABE_TAGE,
): Promise<AnsichtStand> {
  return nacheinander(async () => {
    const stand = await ladeAnsicht(karenzVorgabe)
    const mark = { ...stand.markierungen }
    if (f) mark[durchwahl] = f; else delete mark[durchwahl]
    return schreibe({ ...stand, markierungen: mark }, by)
  })
}

/**
 * Mehrere Durchwahlen in EINEM Schreibvorgang markieren (oder mit `null` freigeben) —
 * für die Zeilenauswahl. Wichtig, dass das nicht je Zeile einzeln läuft: bei 100
 * ausgewählten Zeilen wären das 100 Lese-Schreib-Runden aufs Netzlaufwerk.
 */
export async function setzeMarkierungen(
  durchwahlen: string[], f: FarbId | null, by: string, karenzVorgabe: number = KARENZ_VORGABE_TAGE,
): Promise<AnsichtStand> {
  return nacheinander(async () => {
    const stand = await ladeAnsicht(karenzVorgabe)
    if (durchwahlen.length === 0) return stand
    const mark = { ...stand.markierungen }
    for (const d of durchwahlen) {
      if (!d) continue
      if (f) mark[d] = f; else delete mark[d]
    }
    return schreibe({ ...stand, markierungen: mark }, by)
  })
}

/** Alle Markierungen auf einmal entfernen. */
export async function loescheAlleMarkierungen(by: string, karenzVorgabe: number = KARENZ_VORGABE_TAGE): Promise<AnsichtStand> {
  return nacheinander(async () => {
    const stand = await ladeAnsicht(karenzVorgabe)
    return schreibe({ ...stand, markierungen: {} }, by)
  })
}

/**
 * Filter, Suche und Karenzzeit sichern. Hier ist Überschreiben gewollt — der Filterstand
 * soll bei allen gleich sein. Die Markierungen werden vorher frisch nachgeladen, damit
 * ein Filterwechsel keine fremde Markierung zurückdreht.
 */
export async function speichereFilter(
  teil: { ausgeblendet: Record<string, string[]>; suche: string; karenzTage: number },
  by: string,
): Promise<AnsichtStand> {
  return nacheinander(async () => {
    const stand = await ladeAnsicht(teil.karenzTage)
    // Nichts geändert → nicht schreiben. Sonst würde jedes Öffnen der Ansicht einen
    // neuen Zeitstempel erzeugen und bei allen anderen als fremde Änderung ankommen.
    const gleich = stand.suche === teil.suche
      && stand.karenzTage === teil.karenzTage
      && JSON.stringify(stand.ausgeblendet) === JSON.stringify(teil.ausgeblendet)
    if (gleich) return stand
    return schreibe({ ...stand, ...teil }, by)
  })
}

// ── Schnappschuss der geprüften Liste ───────────────────────────────────────

export interface Schnappschuss {
  version: number
  ergebnis: PruefErgebnis
  updatedAt: string
  updatedBy: string
}

export async function ladeSchnappschuss(): Promise<Schnappschuss | null> {
  try {
    const s = await api().netReadJson<Schnappschuss>(STAND_FILE)
    if (s?.ergebnis && Array.isArray(s.ergebnis.zeilen)) return s
  } catch { /* noch keiner */ }
  return null
}

/** Gibt den Zeitstempel der geteilten Liste zurück (leer, wenn nichts geschrieben wurde). */
export async function speichereSchnappschuss(ergebnis: PruefErgebnis, by: string): Promise<string> {
  // Nur eine fertig gegengeprüfte Liste ist es wert, geteilt zu werden — eine halbe
  // würde bei den anderen als „fertig" aussehen und niemand sähe, dass die AD-Prüfung fehlt.
  if (!ergebnis.gegengeprueft) return ''
  const zeit = new Date().toISOString()
  try {
    await api().netWriteJson(STAND_FILE, {
      version: 1, ergebnis, updatedAt: zeit, updatedBy: by,
    } satisfies Schnappschuss)
  } catch { return '' }  // nicht geschrieben → auch keinen Zeitstempel ankündigen

  // Nur den Zeiger auf die neue Liste nachtragen. `updatedAt`/`updatedBy` des Arbeitsstands
  // bleiben bewusst unberührt, sonst würde ein Neuladen bei allen anderen als Filterwechsel
  // ankommen und deren gerade getippten Stand überschreiben.
  await nacheinander(async () => {
    const stand = await ladeAnsicht()
    try { await api().netWriteJson(ANSICHT_FILE, { ...stand, standAt: zeit }) } catch { /* egal */ }
  })
  return zeit
}

/** Alter des Schnappschusses in Stunden (null, wenn unbekannt). */
export function alterStunden(zeitpunkt: string | undefined): number | null {
  if (!zeitpunkt) return null
  const t = Date.parse(zeitpunkt)
  if (Number.isNaN(t)) return null
  return (Date.now() - t) / 3_600_000
}
