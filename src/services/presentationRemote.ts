// ── Presentation Remote-Push Service ──────────────────────────────────────────
// Erlaubt dem Master-Admin, einem laufenden Kiosk-Player aus der Ferne sofort
// einen Inhalt (HTML-Datei, Website, Bild, PDF) als Vollbild-Overlay einzublenden
// — ohne die Playlist dauerhaft zu aendern.
//
// Ablauf:
//   - Master-Admin schreibt eine Push-Datei pro Ziel-Kiosk:
//       config/presentation/commands/<username>.json
//   - Der laufende Player pollt diese Datei (alle paar Sekunden) und zeigt den
//     Inhalt sofort an. Nach Ablauf der Dauer (oder bei "Stop") kehrt er zur
//     normalen Praesentation zurueck.
//
// Identifikation: Windows-Benutzername des Kiosk-Accounts (= ein Player).

import { api } from '../electronAPI'

export interface RemotePush {
  id: string                 // stabile ID pro Push — Player zeigt jeden neuen Push genau einmal
  url: string                // Roh-URL: http(s), UNC (\\server\...) oder lokaler Pfad
  title: string
  durationSec: number        // 0 = bis manuell beendet
  zoom: number               // Webview-Zoomfaktor
  pushedAt: string           // ISO
  pushedBy: string           // Anzeigename des Master-Admins
  active: boolean            // false = beendet → Player blendet das Overlay aus
}

function safeFilename(username: string): string {
  return username.toLowerCase().replace(/[^a-z0-9._-]/g, '_')
}

function pathFor(username: string): string {
  return `config/presentation/commands/${safeFilename(username)}.json`
}

export function makePushId(): string {
  return `push_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export interface PushInput {
  url: string
  title: string
  durationSec: number
  zoom: number
  pushedBy: string
}

/** Inhalt sofort auf einem laufenden Kiosk-Player anzeigen. */
export async function pushToClient(username: string, input: PushInput): Promise<{ ok: boolean; push?: RemotePush; error?: string }> {
  if (!username) return { ok: false, error: 'Kein Ziel-Kiosk angegeben' }
  if (!input.url.trim()) return { ok: false, error: 'Keine URL/Datei angegeben' }
  const push: RemotePush = {
    id: makePushId(),
    url: input.url.trim(),
    title: input.title.trim(),
    durationSec: Math.max(0, Math.round(input.durationSec) || 0),
    zoom: input.zoom > 0 ? input.zoom : 1,
    pushedAt: new Date().toISOString(),
    pushedBy: input.pushedBy || 'unbekannt',
    active: true,
  }
  try {
    const ok = await api().netWriteJson(pathFor(username), push)
    if (!ok) return { ok: false, error: 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.' }
    return { ok: true, push }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Laufenden Push beenden — Player kehrt zur normalen Praesentation zurueck. */
export async function stopClientPush(username: string, pushedBy: string): Promise<{ ok: boolean; error?: string }> {
  if (!username) return { ok: false, error: 'Kein Ziel-Kiosk angegeben' }
  try {
    const existing = await readClientPush(username)
    const cleared: RemotePush = existing
      ? { ...existing, active: false, pushedAt: new Date().toISOString(), pushedBy: pushedBy || existing.pushedBy }
      : { id: makePushId(), url: '', title: '', durationSec: 0, zoom: 1, pushedAt: new Date().toISOString(), pushedBy: pushedBy || 'unbekannt', active: false }
    const ok = await api().netWriteJson(pathFor(username), cleared)
    if (!ok) return { ok: false, error: 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Aktuellen Push eines Kiosks lesen (null = keiner hinterlegt). */
export async function readClientPush(username: string): Promise<RemotePush | null> {
  if (!username) return null
  try {
    const data = await api().netReadJson<RemotePush>(pathFor(username))
    if (!data || typeof data.id !== 'string' || typeof data.url !== 'string') return null
    return {
      id: data.id,
      url: data.url,
      title: typeof data.title === 'string' ? data.title : '',
      durationSec: Math.max(0, Number(data.durationSec) || 0),
      zoom: Number(data.zoom) > 0 ? Number(data.zoom) : 1,
      pushedAt: typeof data.pushedAt === 'string' ? data.pushedAt : '',
      pushedBy: typeof data.pushedBy === 'string' ? data.pushedBy : '',
      active: data.active !== false,
    }
  } catch {
    return null
  }
}
