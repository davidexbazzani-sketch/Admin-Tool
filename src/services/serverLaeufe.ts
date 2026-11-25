// ── Server-Prüfungen, die dauernd laufen: an/aus und Takt (Einstellungen → „Automatik & Scans“) ──
// Bisher fest im Code: Ping alle 5 min (ServerMonitorController), Neustart-Erkennung nach jedem
// Ping, Rundlauf „Dienste & Prüfungen“ mit 5 s Pause (serverRundlauf.ts). Seit 19.11.2026 in
// settings/server_laeufe.json einstellbar — aber NIE schneller als vorher (Netz und Server schonen).
// Gelesen nur auf dem Automatik-PC, höchstens einmal pro Minute. Fehlt die Datei → heutige Werte.
import { api } from '../electronAPI'

export const SERVER_LAEUFE_PFAD = 'settings/server_laeufe.json'

export interface ServerLaeufe {
  ping: { an: boolean; minuten: number }
  neustart: { an: boolean }
  rundlauf: { an: boolean; pauseSek: number }
}

/** erlaubte Werte — der kleinste ist jeweils der bisherige feste Wert */
export const PING_TAKTE = [5, 10, 15, 30] as const
export const RUNDLAUF_PAUSEN = [5, 10, 30, 60] as const

export const SERVER_LAEUFE_STANDARD: ServerLaeufe = {
  ping: { an: true, minuten: 5 },
  neustart: { an: true },
  rundlauf: { an: true, pauseSek: 5 },
}

const naechsterErlaubter = (wert: unknown, erlaubt: readonly number[], standard: number): number => {
  const n = Number(wert)
  if (!Number.isFinite(n)) return standard
  return erlaubt.find(e => e >= n) ?? erlaubt[erlaubt.length - 1]
}

/** Gespeicherte Werte prüfen: Unbekanntes → Standard, Takte auf erlaubte (nie schnellere) Werte. */
export function bereinigeServerLaeufe(x: unknown): ServerLaeufe {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, Record<string, unknown> | undefined>
  const bool = (v: unknown, s: boolean) => typeof v === 'boolean' ? v : s
  const S = SERVER_LAEUFE_STANDARD
  return {
    ping: { an: bool(o.ping?.an, S.ping.an), minuten: naechsterErlaubter(o.ping?.minuten ?? S.ping.minuten, PING_TAKTE, S.ping.minuten) },
    neustart: { an: bool(o.neustart?.an, S.neustart.an) },
    rundlauf: { an: bool(o.rundlauf?.an, S.rundlauf.an), pauseSek: naechsterErlaubter(o.rundlauf?.pauseSek ?? S.rundlauf.pauseSek, RUNDLAUF_PAUSEN, S.rundlauf.pauseSek) },
  }
}

let cache: { wert: ServerLaeufe; am: number } | null = null
const CACHE_MS = 60_000

/** Aktuelle Einstellung (höchstens einmal pro Minute vom Netzlaufwerk; bei Fehler der letzte bekannte Stand). */
export async function ladeServerLaeufe(frisch = false): Promise<ServerLaeufe> {
  if (!frisch && cache && Date.now() - cache.am < CACHE_MS) return cache.wert
  try {
    const roh = await api().netReadJsonAsync<unknown>(SERVER_LAEUFE_PFAD)
    // null = Datei fehlt ODER kurz nicht lesbar → den letzten bekannten Stand behalten
    if (roh == null && cache) { cache = { wert: cache.wert, am: Date.now() }; return cache.wert }
    const wert = bereinigeServerLaeufe(roh)
    cache = { wert, am: Date.now() }
    return wert
  } catch {
    return cache?.wert ?? SERVER_LAEUFE_STANDARD
  }
}

export async function speichereServerLaeufe(v: ServerLaeufe): Promise<boolean> {
  const sauber = bereinigeServerLaeufe(v)
  try {
    const ok = await api().netWriteJsonAsync(SERVER_LAEUFE_PFAD, sauber)
    if (ok) cache = { wert: sauber, am: Date.now() }
    return ok
  } catch { return false }
}

/** nur für Tests */
export function _cacheLeeren(): void { cache = null }
