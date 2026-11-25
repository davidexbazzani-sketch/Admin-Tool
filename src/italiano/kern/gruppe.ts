// Parla Italiano — die Reisegruppe: Level aller Benutzer, für alle sichtbar.
//
// Vorgabe des Nutzers (18.11.2026): „Die Level werden allen Usern in der App angezeigt.“
// Auf das Netzlaufwerk geht NUR: Name, Level und seit wann. Ergebnisse, Fehler und der
// Lernstand bleiben lokal und verschlüsselt (kern/speicher.ts).
// Gelesen wird nur beim Öffnen des Bereichs — keine Abfrage im Hintergrund.
import { api } from '../../electronAPI'
import type { GruppenEintrag } from './typen'
import { LEVEL_ANZAHL } from './inhaltTypen'

const ORDNER = 'italiano/level'
const sicher = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9._-]/g, '_')
const pfad = (username: string) => `${ORDNER}/${sicher(username)}.json`

export async function ladeGruppe(): Promise<GruppenEintrag[]> {
  let dateien: string[] = []
  try { dateien = (await api().netListDirAsync(ORDNER)).filter(f => /\.json$/i.test(f)) } catch { return [] }
  const roh = await Promise.all(dateien.map(f => api().netReadJsonAsync<Partial<GruppenEintrag>>(`${ORDNER}/${f}`).catch(() => null)))
  const aus: GruppenEintrag[] = []
  for (const e of roh) {
    if (!e || typeof e.username !== 'string' || typeof e.level !== 'number') continue
    aus.push({
      username: e.username,
      displayName: typeof e.displayName === 'string' && e.displayName ? e.displayName : e.username,
      level: Math.max(1, Math.min(LEVEL_ANZAHL + 1, Math.round(e.level))),
      seit: typeof e.seit === 'string' ? e.seit : '',
    })
  }
  return aus.sort((a, b) => b.level - a.level || a.seit.localeCompare(b.seit) || a.displayName.localeCompare(b.displayName, 'de'))
}

/** eigenen Eintrag lesen (z. B. um an einem anderen PC beim selben Level weiterzumachen) */
export async function ladeEigenen(username: string): Promise<GruppenEintrag | null> {
  try {
    const e = await api().netReadJsonAsync<Partial<GruppenEintrag>>(pfad(username))
    if (!e || typeof e.level !== 'number') return null
    return { username: username.toLowerCase(), displayName: String(e.displayName || username), level: Math.max(1, Math.min(LEVEL_ANZAHL + 1, Math.round(e.level))), seit: String(e.seit || '') }
  } catch { return null }
}

/** eigenes Level veröffentlichen (ersetzt den früheren Eintrag) */
export async function veroeffentliche(e: GruppenEintrag): Promise<boolean> {
  try { return await api().netWriteJsonAsync(pfad(e.username), { ...e, username: e.username.toLowerCase() }) } catch { return false }
}
export async function entferneEintrag(username: string): Promise<boolean> {
  try { return await api().netDeleteFileAsync(pfad(username)) } catch { return false }
}
