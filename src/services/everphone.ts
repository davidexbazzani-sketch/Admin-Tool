// ── Everphone-Register (Mobilgeräte je Mitarbeiter) ──────────────────────────
// Wer hat wie viele Diensthandys/Tablets (Everphone) + zugehörige Rufnummer.
// Quelle: der native Everphone-Portal-Export (Excel). Das Format ist „2-zeilig":
//   Kopfzeile je Person:  A=Name | B=E-Mail(+angehängte Rufnummer) | D="N Devices"
//   danach je Gerät:      A=Geräte-ID (Rest leer)  … bis zur nächsten Kopfzeile
// Zentral auf dem Netzlaufwerk (everphone/devices.json) → für alle Tool-Nutzer.
// Speist auch die Austritts-Reminder-Mail (Handy-Rückgabe).

import * as XLSX from 'xlsx'
import { api } from '../electronAPI'
import { fuzzyNameMatch } from '../utils/nameMatch'

export interface EverphoneEntry {
  name: string
  email?: string
  phone?: string
  deviceCount: number
  deviceIds: string[]
}
export interface EverphoneStore {
  entries: EverphoneEntry[]
  updatedAt: string
  updatedBy: string
  importedFilename?: string
}

const EVERPHONE_PATH = 'everphone/devices.json'
const EVERPHONE_ARCHIVE_PATH = 'everphone/archive.json'

export async function loadEverphone(): Promise<EverphoneStore> {
  try {
    const d = await api().netReadJson<EverphoneStore>(EVERPHONE_PATH)
    if (d && Array.isArray(d.entries)) return d
  } catch { /* noch keiner */ }
  return { entries: [], updatedAt: '', updatedBy: '' }
}

export async function saveEverphone(entries: EverphoneEntry[], by: string, importedFilename?: string): Promise<boolean> {
  try {
    return await api().netWriteJson(EVERPHONE_PATH, {
      entries, updatedAt: new Date().toISOString(), updatedBy: by, importedFilename,
    } satisfies EverphoneStore)
  } catch { return false }
}

/** Parst den nativen Everphone-Export (2-Zeilen-Format) → Einträge je Person. */
export function parseEverphoneWorkbook(bytes: Uint8Array): EverphoneEntry[] {
  const wb = XLSX.read(bytes, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  const out: EverphoneEntry[] = []
  let cur: EverphoneEntry | null = null
  for (const r of rows) {
    const a = String(r?.[0] ?? '').trim()
    const b = String(r?.[1] ?? '').trim()
    const d = String(r?.[3] ?? '').trim()
    const m = d.match(/(\d+)\s*Devices?/i)
    if (m) {
      // Personen-Kopfzeile
      let email = '', phone = ''
      if (b) {
        const plus = b.indexOf('+')
        if (plus >= 0) { email = b.slice(0, plus).trim(); phone = b.slice(plus).replace(/\s+/g, '') }
        else email = b
      }
      cur = { name: a, email: email || undefined, phone: phone || undefined, deviceCount: parseInt(m[1], 10) || 0, deviceIds: [] }
      out.push(cur)
    } else if (cur && a && !b && !d) {
      // Geräte-ID-Zeile (nur Spalte A gefüllt)
      cur.deviceIds.push(a)
    }
  }
  return out.filter(e => e.name)
}

// ── Archiv ───────────────────────────────────────────────────────────────────
//
// Jeder Import ersetzt das Register vollständig. Wer im neuen Export fehlt, verschwände
// damit spurlos — gerade das ist aber die Information, die man später braucht („wer hatte
// dieses Gerät?"). Deshalb wandern fehlende Einträge ins Archiv.
//
// Das Archiv ist ANFÜGEND: es wird nie etwas gelöscht, nur ergänzt. Jedes Verschwinden ist
// ein eigener Eintrag mit Zeitstempel — taucht eine Person später wieder auf, bleibt der
// alte Archiv-Eintrag stehen und wird als „wieder da" gekennzeichnet. So baut sich mit der
// Zeit eine Geschichte auf statt eines Zustands.

export interface EverphoneArchiveEntry extends EverphoneEntry {
  /** Stand der Liste, in der der Eintrag zuletzt stand. */
  lastSeenAt: string
  /** Der Import, bei dem er fehlte. */
  archivedAt: string
  archivedBy: string
  importFilename?: string
  /** Gesetzt, sobald die Person in einem späteren Import wieder auftauchte. */
  returnedAt?: string
}

export interface EverphoneArchiveStore {
  version: number
  entries: EverphoneArchiveEntry[]
  updatedAt: string
  updatedBy: string
}

export async function loadEverphoneArchive(): Promise<EverphoneArchiveStore> {
  try {
    const d = await api().netReadJson<EverphoneArchiveStore>(EVERPHONE_ARCHIVE_PATH)
    if (d && Array.isArray(d.entries)) return { version: 1, entries: d.entries, updatedAt: d.updatedAt, updatedBy: d.updatedBy }
  } catch { /* noch keins */ }
  return { version: 1, entries: [], updatedAt: '', updatedBy: '' }
}

/**
 * Ist dieselbe Person im neuen Import enthalten? Erst über die E-Mail (stabil), sonst
 * über den unscharfen Namensvergleich.
 *
 * Bewusst GROSSZÜGIG: ein Treffer zu viel heißt „bleibt im Register" — nichts passiert.
 * Ein Treffer zu wenig legt eine noch aktive Person ins Archiv und lässt sie aus dem
 * Register verschwinden. Nur die zweite Richtung tut weh.
 */
export function isSamePerson(a: { name: string; email?: string }, b: { name: string; email?: string }): boolean {
  const ea = (a.email || '').trim().toLowerCase()
  const eb = (b.email || '').trim().toLowerCase()
  if (ea && eb && ea === eb) return true
  return fuzzyNameMatch(a.name || '', b.name || '')
}

export interface ArchivePlan {
  /** Alte Register-Einträge, die im neuen Import fehlen. */
  vanished: EverphoneEntry[]
  /** Archiv-Einträge, deren Person im neuen Import wieder auftaucht. */
  returning: EverphoneArchiveEntry[]
}

/**
 * Reine Rechnung, ohne Netzzugriff: was würde dieser Import am Archiv ändern?
 * Wird vor dem Speichern gezeigt, damit ein falsch gewählter Export nicht stillschweigend
 * das halbe Register ins Archiv schiebt.
 */
export function planArchive(
  prev: EverphoneEntry[], next: EverphoneEntry[], archive: EverphoneArchiveEntry[],
): ArchivePlan {
  const vanished = prev.filter(alt => !next.some(neu => isSamePerson(alt, neu)))
  // „Wieder da" gilt nur für noch offene Archiv-Einträge — ein bereits abgeschlossener
  // bleibt unangetastet, sonst würde die Geschichte nachträglich umgeschrieben.
  const returning = archive.filter(a => !a.returnedAt && next.some(neu => isSamePerson(a, neu)))
  return { vanished, returning }
}

/** Ein falsch gewählter Export würde fast alles archivieren — dann erst zurückfragen. */
export const ARCHIVE_VERDACHT_ANTEIL = 0.3
export const ARCHIVE_VERDACHT_MINDEST = 10

export function istVerdaechtig(plan: ArchivePlan, prevAnzahl: number): boolean {
  return plan.vanished.length >= ARCHIVE_VERDACHT_MINDEST
    && prevAnzahl > 0
    && plan.vanished.length / prevAnzahl >= ARCHIVE_VERDACHT_ANTEIL
}

// Schreibvorgänge dieser Sitzung hintereinander, damit sich zwei Importe nicht überholen.
let kette: Promise<unknown> = Promise.resolve()
function nacheinander<T>(fn: () => Promise<T>): Promise<T> {
  const next = kette.then(fn, fn)
  kette = next.then(() => {}, () => {})
  return next
}

/**
 * Den Plan ins Archiv schreiben. Das Archiv wird vorher frisch gelesen und nur ERGÄNZT —
 * damit nichts verloren geht, wenn in der Zwischenzeit jemand anders importiert hat.
 */
export async function commitArchive(
  plan: ArchivePlan, lastSeenAt: string, by: string, importFilename?: string,
): Promise<boolean> {
  if (plan.vanished.length === 0 && plan.returning.length === 0) return true
  return nacheinander(async () => {
    const store = await loadEverphoneArchive()
    const jetzt = new Date().toISOString()

    // Rückkehrer kennzeichnen (nicht entfernen — das Archiv bleibt vollständig).
    const zurueck = new Set(plan.returning.map(a => `${a.archivedAt}|${(a.email || a.name).toLowerCase()}`))
    const bestehend = store.entries.map(a =>
      !a.returnedAt && zurueck.has(`${a.archivedAt}|${(a.email || a.name).toLowerCase()}`)
        ? { ...a, returnedAt: jetzt }
        : a)

    const neu: EverphoneArchiveEntry[] = plan.vanished.map(e => ({
      ...e,
      lastSeenAt: lastSeenAt || jetzt,
      archivedAt: jetzt,
      archivedBy: by,
      importFilename,
    }))

    try {
      return await api().netWriteJson(EVERPHONE_ARCHIVE_PATH, {
        version: 1,
        entries: [...bestehend, ...neu],
        updatedAt: jetzt,
        updatedBy: by,
      } satisfies EverphoneArchiveStore)
    } catch { return false }
  })
}

/** Everphone-Eintrag zu einem (Mitarbeiter-)Namen finden (fuzzy: Reihenfolge/Tippfehler/Umlaute). */
export function findEverphoneForName(name: string, entries: EverphoneEntry[]): EverphoneEntry | undefined {
  const nm = (name || '').trim()
  if (!nm) return undefined
  return entries.find(e => fuzzyNameMatch(e.name, nm))
}

/** Hat die Person laut Everphone ein aktives Mobilgerät? */
export function hasMobileDevice(e: EverphoneEntry | undefined): boolean {
  return !!e && (e.deviceCount > 0 || e.deviceIds.length > 0)
}
