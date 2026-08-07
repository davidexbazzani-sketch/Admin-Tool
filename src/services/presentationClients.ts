// ── Presentation Clients Service ──────────────────────────────────────────────
// Tracks which Kiosk-Players are currently running. Each running player writes
// a heartbeat file every 30 seconds; the master-admin overview reads them all.
//
// Identifier: Windows username of the account that runs the player.
// Storage:    config/presentation/heartbeats/<username>.json (one per client)
//
// A client counts as "online" when the last heartbeat is at most 90 seconds old
// (giving us 3× the write interval for jitter, briefly missed writes, etc.).

import { api } from '../electronAPI'

export const HEARTBEAT_INTERVAL_MS = 30_000
export const HEARTBEAT_ONLINE_WINDOW_MS = 90_000

export interface ClientHeartbeat {
  username: string          // Windows username (lower-case for matching)
  displayUsername: string   // original casing for display
  hostname: string
  lastSeen: string          // ISO timestamp
  currentSlideIndex?: number
  totalSlides?: number
  slideTitle?: string
  slideUrl?: string
  playlistName?: string     // aktuell abgespielte Playlist / Konfiguration
}

function safeFilename(username: string): string {
  return username.toLowerCase().replace(/[^a-z0-9._-]/g, '_')
}

function pathFor(username: string): string {
  return `config/presentation/heartbeats/${safeFilename(username)}.json`
}

export async function writeHeartbeat(data: Omit<ClientHeartbeat, 'username' | 'lastSeen'> & { username: string }): Promise<void> {
  const payload: ClientHeartbeat = {
    username: data.username.toLowerCase(),
    displayUsername: data.displayUsername || data.username,
    hostname: data.hostname,
    lastSeen: new Date().toISOString(),
    currentSlideIndex: data.currentSlideIndex,
    totalSlides: data.totalSlides,
    slideTitle: data.slideTitle,
    slideUrl: data.slideUrl,
    playlistName: data.playlistName,
  }
  try { await api().netWriteJson(pathFor(data.username), payload) } catch { /* offline → silently skip */ }
}

export async function clearHeartbeat(username: string): Promise<void> {
  try { await api().netDeleteFile(pathFor(username)) } catch { /* ok */ }
}

export interface ListedClient extends ClientHeartbeat {
  online: boolean
  ageMs: number
}

export async function listClients(): Promise<ListedClient[]> {
  try {
    const files = await api().netListDir('config/presentation/heartbeats')
    if (!Array.isArray(files)) return []
    const now = Date.now()
    const result: ListedClient[] = []
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.json')) continue
      try {
        const data = await api().netReadJson<ClientHeartbeat>(`config/presentation/heartbeats/${f}`)
        if (!data || !data.username || !data.lastSeen) continue
        const ts = new Date(data.lastSeen).getTime()
        if (isNaN(ts)) continue
        const age = now - ts
        result.push({
          ...data,
          ageMs: age,
          online: age <= HEARTBEAT_ONLINE_WINDOW_MS,
        })
      } catch { /* skip malformed */ }
    }
    // Online first, then sorted by displayUsername
    result.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1
      return a.displayUsername.localeCompare(b.displayUsername, 'de', { sensitivity: 'base' })
    })
    return result
  } catch {
    return []
  }
}

export function formatLastSeen(iso: string): string {
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 5) return 'jetzt'
  if (s < 60) return `vor ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `vor ${m} Min`
  const h = Math.floor(m / 60)
  if (h < 24) return `vor ${h} Std`
  const d = Math.floor(h / 24)
  return `vor ${d} ${d === 1 ? 'Tag' : 'Tagen'}`
}
