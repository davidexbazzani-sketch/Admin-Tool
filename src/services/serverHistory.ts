// ── Server-Historie: freie, zeitgestempelte Einträge je Server ────────────────
// Pro Server ein Verlauf (Ausfälle, Einsätze, Changes, eigene Notizen). Geteilt für
// alle Admins auf dem Netzlaufwerk unter server_monitor/history.json. Neue Einträge
// bekommen automatisch einen Zeitstempel. Die Steckbrief-Daten (SERVER_STECKBRIEF_SEED)
// werden einmalig importiert (dedupliziert über stabile Seed-IDs), damit das
// Betriebsgedächtnis sofort vorhanden ist. Muster: serverMonitor.ts (net-JSON).

import { api } from '../electronAPI'
import { hostKey } from './serverMonitor'
import { SERVER_STECKBRIEF_SEED, SEED_VERSION } from './serverHistorySeed'

const HISTORY_PATH = 'server_monitor/history.json'

export interface ServerHistoryEntry {
  id: string
  at: string              // ISO-Zeitstempel (Erstellzeit bzw. Ereignisdatum)
  text: string
  by: string              // Autor bzw. „Steckbrief" beim Import
  source?: string         // Quelle (z. B. Ticketnummer / MD-Abschnitt)
  seed?: boolean          // aus dem Steckbrief-Import (nicht selbst geschrieben)
  pinned?: boolean        // Stammdaten/Rolle oben anheften
  dateOnly?: boolean      // nur Datum anzeigen (Ereignis ohne Uhrzeit)
}
export interface ServerHistoryFile {
  seededVersion: number
  byHost: Record<string, ServerHistoryEntry[]>
}

export async function loadServerHistoryFile(): Promise<ServerHistoryFile> {
  try {
    const f = await api().netReadJson<ServerHistoryFile>(HISTORY_PATH)
    if (f && typeof f === 'object' && f.byHost) return { seededVersion: f.seededVersion || 0, byHost: f.byHost }
  } catch { /* noch keine */ }
  return { seededVersion: 0, byHost: {} }
}
async function saveServerHistoryFile(f: ServerHistoryFile): Promise<boolean> {
  try { return await api().netWriteJson(HISTORY_PATH, f) } catch { return false }
}

function sortEntries(list: ServerHistoryEntry[]): ServerHistoryEntry[] {
  // Angeheftete (Stammdaten) zuerst, danach neueste zuoberst.
  return [...list].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return a.at < b.at ? 1 : a.at > b.at ? -1 : 0
  })
}

/** Verlauf eines Servers (sortiert). */
export async function loadHistoryFor(host: string): Promise<ServerHistoryEntry[]> {
  const f = await loadServerHistoryFile()
  return sortEntries(f.byHost[hostKey(host)] ?? [])
}

/** Freien Eintrag hinzufügen — wird automatisch mit Zeitstempel versehen. */
export async function addHistoryEntry(host: string, text: string, by: string): Promise<ServerHistoryEntry[]> {
  const clean = text.trim()
  const f = await loadServerHistoryFile()
  const key = hostKey(host)
  const entry: ServerHistoryEntry = {
    id: `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(), text: clean, by: by || 'unbekannt',
  }
  const next = { ...f, byHost: { ...f.byHost, [key]: [entry, ...(f.byHost[key] ?? [])] } }
  await saveServerHistoryFile(next)
  return sortEntries(next.byHost[key])
}

/** Eigenen (nicht-Seed-)Eintrag löschen. */
export async function deleteHistoryEntry(host: string, id: string): Promise<ServerHistoryEntry[]> {
  const f = await loadServerHistoryFile()
  const key = hostKey(host)
  const list = (f.byHost[key] ?? []).filter(e => e.id !== id)
  const next = { ...f, byHost: { ...f.byHost, [key]: list } }
  await saveServerHistoryFile(next)
  return sortEntries(list)
}

function seedAt(date?: string): { at: string; dateOnly: boolean } {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return { at: `${date}T12:00:00.000Z`, dateOnly: true }
  return { at: '2026-08-25T12:00:00.000Z', dateOnly: true }
}

/**
 * Steckbrief-Daten einmalig importieren (idempotent). Fügt nur fehlende Seed-Einträge
 * hinzu (stabile IDs `seed_<HOST>_<idx>`), lässt eigene Einträge unberührt. Läuft beim
 * ersten Öffnen automatisch; kann über force erneut angestoßen werden.
 */
export async function ensureSteckbriefeSeeded(force = false): Promise<{ added: number }> {
  const f = await loadServerHistoryFile()
  if (!force && f.seededVersion >= SEED_VERSION) return { added: 0 }

  const byHost: Record<string, ServerHistoryEntry[]> = { ...f.byHost }
  const perHostIdx: Record<string, number> = {}
  let added = 0

  for (const s of SERVER_STECKBRIEF_SEED) {
    const key = hostKey(s.host)
    const idx = (perHostIdx[key] = (perHostIdx[key] ?? -1) + 1)
    const id = `seed_${key}_${idx}`
    const list = byHost[key] ? [...byHost[key]] : []
    if (list.some(e => e.id === id)) { byHost[key] = list; continue }
    const { at, dateOnly } = seedAt(s.date)
    list.push({ id, at, text: s.text, by: 'Steckbrief', source: s.source, seed: true, pinned: !!s.role, dateOnly })
    byHost[key] = list
    added++
  }

  await saveServerHistoryFile({ seededVersion: SEED_VERSION, byHost })
  return { added }
}
