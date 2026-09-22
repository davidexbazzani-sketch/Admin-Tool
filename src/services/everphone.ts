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
