// ── Zentrales AD-Benutzerverzeichnis ──────────────────────────────────────────
// Die vollstaendige Benutzerliste aus Active Directory wird EINMAL PRO TAG
// abgefragt und ZENTRAL auf dem Netzlaufwerk abgelegt. Dadurch:
//   - sehen alle Clients denselben Stand (keine lokalen Insel-Caches mehr),
//   - wird AD nur einmal taeglich belastet (nicht bei jedem Screen-Wechsel),
//   - koennen andere Module (z. B. Endgeraete-Uebersicht) die E-Mail-Adressen
//     direkt aus dieser Liste ziehen, statt selbst live in AD zu suchen.
//
// Die eigentliche AD-Abfrage macht fetchAdUsers() (adUsersList.ts).

import { api } from '../electronAPI'
import { fetchAdUsers, type AdUserListItem } from './adUsersList'

const CENTRAL_FILE = 'config/user-overview/ad-users.json'

export interface AdUserDirectory {
  users: AdUserListItem[]
  loadedAt: string   // ISO-Zeitstempel der letzten AD-Abfrage
}

export async function readCentralAdUsers(): Promise<AdUserDirectory | null> {
  try {
    const d = await api().netReadJson<AdUserDirectory>(CENTRAL_FILE)
    if (d && Array.isArray(d.users) && d.users.length > 0 && typeof d.loadedAt === 'string') return d
  } catch { /* Datei fehlt oder Netzlaufwerk nicht erreichbar */ }
  return null
}

export async function writeCentralAdUsers(users: AdUserListItem[], loadedAt: string): Promise<void> {
  try { await api().netWriteJson(CENTRAL_FILE, { users, loadedAt } satisfies AdUserDirectory) } catch { /* Schreiben best effort */ }
}

// Gleicher Kalendertag (lokale Zeit) wie jetzt?
function isSameLocalDay(iso: string): boolean {
  const t = new Date(iso); if (isNaN(t.getTime())) return false
  const now = new Date()
  return t.getFullYear() === now.getFullYear()
    && t.getMonth() === now.getMonth()
    && t.getDate() === now.getDate()
}

// Verhindert, dass mehrere gleichzeitige Aufrufe innerhalb DERSELBEN App-Sitzung
// parallel dieselbe (teure) AD-Abfrage ausloesen.
let inFlight: Promise<AdUserDirectory | null> | null = null

/**
 * Liefert das zentrale Benutzerverzeichnis. Frischt es hoechstens EINMAL pro
 * Kalendertag frisch aus AD nach (bzw. sofort, wenn `force` gesetzt ist oder noch
 * gar kein zentraler Stand existiert). Ergebnis wird zentral gespeichert.
 */
export async function ensureDailyAdUsers(
  force = false,
): Promise<{ dir: AdUserDirectory | null; refreshed: boolean; error?: string }> {
  const central = await readCentralAdUsers()
  if (!force && central && isSameLocalDay(central.loadedAt)) {
    return { dir: central, refreshed: false }
  }

  if (!inFlight) {
    inFlight = (async () => {
      const res = await fetchAdUsers()
      if (res.ok) {
        const loadedAt = new Date().toISOString()
        await writeCentralAdUsers(res.users, loadedAt)
        return { users: res.users, loadedAt }
      }
      return null
    })()
  }

  try {
    const dir = await inFlight
    if (dir) return { dir, refreshed: true }
    // AD-Abfrage fehlgeschlagen -> auf vorhandenen (evtl. aelteren) Stand zurueckfallen
    return { dir: central, refreshed: false, error: central ? undefined : 'AD-Abfrage fehlgeschlagen' }
  } finally {
    inFlight = null
  }
}

// ── Namensabgleich (fuer Module, die nur den Anzeigenamen kennen) ─────────────

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

// "Nachname, Vorname" -> "Vorname Nachname"
export function reverseCommaName(name: string): string {
  const m = name.split(',')
  if (m.length !== 2) return ''
  const last = m[0].trim(), first = m[1].trim()
  if (!last || !first) return ''
  return `${first} ${last}`
}

/** Baut einen Index Anzeigename(normalisiert) -> Benutzer. */
export function buildNameIndex(users: AdUserListItem[]): Map<string, AdUserListItem> {
  const idx = new Map<string, AdUserListItem>()
  for (const u of users) {
    if (u.displayName) idx.set(normName(u.displayName), u)
  }
  return idx
}

/** Findet einen Benutzer per Anzeigename — probiert auch die "Nachname, Vorname"-Umkehrung. */
export function lookupUserByName(
  index: Map<string, AdUserListItem>,
  name: string,
): AdUserListItem | undefined {
  const direct = index.get(normName(name))
  if (direct) return direct
  const rev = reverseCommaName(name)
  if (rev) { const r = index.get(normName(rev)); if (r) return r }
  return undefined
}
