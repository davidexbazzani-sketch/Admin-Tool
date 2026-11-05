// ── Chat zwischen Tool-Nutzern (über das Netzlaufwerk) ────────────────────────
// Kein Server/Push — wie der Pausenraum ([[pausenraum_game_feature]]) nur Dateien + Polling.
// Alle Zugriffe ASYNCHRON (net*Async), damit der Hauptprozess nicht wartet.
//
// Ablage (unter dem Tool-Netzordner):
//   chat/presence/<user>.json        Anwesenheit: Herzschlag alle 30 s → „hat das Tool offen"
//   chat/conv/<a>__<b>/<id>.json     jede Nachricht eine eigene Datei (nie zwei Schreiber
//                                    auf derselben Datei → keine verlorenen Nachrichten)
//   chat/inbox/<empfänger>/<id>.json kleiner Hinweis „ungelesen" — der Empfänger fragt nur
//                                    diesen Ordner ab; beim Lesen wird der Hinweis gelöscht
//                                    (daraus ergibt sich auch „gelesen" für den Absender)

import { api } from '../electronAPI'

const ROOT = 'chat'
export const HERZSCHLAG_MS = 30_000
export const ONLINE_FENSTER_MS = 95_000          // 3 verpasste Herzschläge = offline
export const INAKTIV_NACH_MS = 10 * 60_000       // keine Maus/Tastatur seit 10 Min
export const MAX_ZEICHEN = 2000
const SICHTBAR_TAGE = 60                          // länger nicht gesehene Nutzer ausblenden

export interface ChatIch { username: string; displayName: string }

export interface ChatNutzer {
  username: string
  displayName: string
  at: string           // letzter Herzschlag
  aktivAt: string      // letzte Eingabe (Maus/Tastatur)
  online: boolean
  inaktiv: boolean
  ageMs: number
  /** PC, auf dem das Tool zuletzt lief (seit 05.11.2026 im Herzschlag; ältere Einträge ohne) */
  rechner?: string
}

export interface ChatNachricht {
  id: string
  from: string
  fromDisplay: string
  to: string
  toDisplay: string
  text: string
  at: string
}

export interface PosteingangHinweis { id: string; from: string; fromDisplay: string; at: string; vorschau: string }

// ── Helfer ────────────────────────────────────────────────────────────────────
const lc = (s: string) => (s || '').toLowerCase()
export const sicher = (s: string) => lc(s).replace(/[^a-z0-9._-]/g, '_')
export const gleich = (a: string, b: string) => sicher(a) === sicher(b)
const praesenzPfad = (u: string) => `${ROOT}/presence/${sicher(u)}.json`
const posteingang = (u: string) => `${ROOT}/inbox/${sicher(u)}`
export const gespraechOrdner = (a: string, b: string) => `${ROOT}/conv/${[sicher(a), sicher(b)].sort().join('__')}`

/** Sortierbare Kennung: Zeitstempel + Absender + Zufall (Absender steckt auch im Dateinamen). */
function neueId(von: string): string {
  const d = new Date()
  const z = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
    + `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}${String(d.getUTCMilliseconds()).padStart(3, '0')}`
  return `${z}_${sicher(von)}_${Math.random().toString(36).slice(2, 7)}`
}
const idAusDatei = (f: string) => f.replace(/\.json$/i, '')
const istJson = (f: string) => /\.json$/i.test(f) && !/\.tmp$/i.test(f)

// ── Anwesenheit ───────────────────────────────────────────────────────────────
// Rechnername einmal holen — die Kachel „IT Admin Tool" schlägt damit die PCs vor, auf denen das Tool läuft
let rechnerName: Promise<string> | null = null
function rechner(): Promise<string> {
  if (!rechnerName) rechnerName = api().getHostname().then(h => (h || '').trim().toUpperCase()).catch(() => '')
  return rechnerName
}

export async function schreibeHerzschlag(ich: ChatIch, aktivAt: Date): Promise<void> {
  const pc = await rechner()
  const daten = { username: lc(ich.username), displayName: ich.displayName || ich.username, at: new Date().toISOString(), aktivAt: aktivAt.toISOString(), ...(pc ? { rechner: pc } : {}) }
  try { await api().netWriteJsonAsync(praesenzPfad(ich.username), daten) } catch { /* offline → nächster Takt */ }
}

/** Beim Beenden: sofort als offline zeigen (sonst erst nach dem Online-Fenster). */
export async function meldeAb(ich: ChatIch): Promise<void> {
  try { await api().netDeleteFileAsync(praesenzPfad(ich.username)) } catch { /* egal */ }
}

export async function ladeNutzer(): Promise<ChatNutzer[]> {
  let dateien: string[] = []
  try { dateien = (await api().netListDirAsync(`${ROOT}/presence`)).filter(istJson) } catch { return [] }
  const jetzt = Date.now()
  const roh = await Promise.all(dateien.map(f => api().netReadJsonAsync<Partial<ChatNutzer>>(`${ROOT}/presence/${f}`).catch(() => null)))
  const out: ChatNutzer[] = []
  for (const d of roh) {
    if (!d || typeof d.username !== 'string' || typeof d.at !== 'string') continue
    const t = new Date(d.at).getTime()
    if (isNaN(t)) continue
    const ageMs = jetzt - t
    if (ageMs > SICHTBAR_TAGE * 86400_000) continue
    const aktiv = new Date(typeof d.aktivAt === 'string' ? d.aktivAt : d.at).getTime()
    const online = ageMs <= ONLINE_FENSTER_MS
    out.push({
      username: d.username, displayName: typeof d.displayName === 'string' && d.displayName ? d.displayName : d.username,
      at: d.at, aktivAt: typeof d.aktivAt === 'string' ? d.aktivAt : d.at,
      online, inaktiv: online && !isNaN(aktiv) && jetzt - aktiv > INAKTIV_NACH_MS, ageMs,
      ...(typeof d.rechner === 'string' && d.rechner.trim() ? { rechner: d.rechner.trim() } : {}),
    })
  }
  return out.sort((a, b) => Number(b.online) - Number(a.online) || Number(a.inaktiv) - Number(b.inaktiv)
    || (a.online ? a.displayName.localeCompare(b.displayName, 'de', { sensitivity: 'base' }) : a.ageMs - b.ageMs))
}

// ── Senden ────────────────────────────────────────────────────────────────────
export async function sende(ich: ChatIch, an: { username: string; displayName: string }, text: string): Promise<ChatNachricht | null> {
  const t = text.replace(/\s+$/, '').slice(0, MAX_ZEICHEN)
  if (!t.trim()) return null
  const n: ChatNachricht = {
    id: neueId(ich.username), from: lc(ich.username), fromDisplay: ich.displayName || ich.username,
    to: lc(an.username), toDisplay: an.displayName || an.username, text: t, at: new Date().toISOString(),
  }
  // Erst die Nachricht, dann der Hinweis — ohne gespeicherte Nachricht kein „ungelesen"
  if (!(await api().netWriteJsonAsync(`${gespraechOrdner(n.from, n.to)}/${n.id}.json`, n))) return null
  const hinweis: PosteingangHinweis = { id: n.id, from: n.from, fromDisplay: n.fromDisplay, at: n.at, vorschau: t.slice(0, 140) }
  await api().netWriteJsonAsync(`${posteingang(n.to)}/${n.id}.json`, hinweis)
  return n
}

// ── Lesen ─────────────────────────────────────────────────────────────────────
/** Neue Nachrichten eines Gesprächs (bereits bekannte IDs werden nicht erneut gelesen). */
export async function ladeGespraech(ich: string, partner: string, bekannt: Set<string>, max = 300): Promise<ChatNachricht[]> {
  const ordner = gespraechOrdner(ich, partner)
  let dateien: string[] = []
  try { dateien = (await api().netListDirAsync(ordner)).filter(istJson).sort() } catch { return [] }
  const neu = dateien.slice(-max).filter(f => !bekannt.has(idAusDatei(f)))
  const roh = await Promise.all(neu.map(f => api().netReadJsonAsync<ChatNachricht>(`${ordner}/${f}`).catch(() => null)))
  return roh.filter((n): n is ChatNachricht => !!n && typeof n.text === 'string' && typeof n.id === 'string')
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** Dateinamen im eigenen Posteingang (= ungelesene Nachrichten). */
export async function listePosteingang(ich: string): Promise<string[]> {
  try { return (await api().netListDirAsync(posteingang(ich))).filter(istJson).map(idAusDatei) } catch { return [] }
}

export async function leseHinweis(ich: string, id: string): Promise<PosteingangHinweis | null> {
  const h = await api().netReadJsonAsync<PosteingangHinweis>(`${posteingang(ich)}/${id}.json`).catch(() => null)
  return h && typeof h.from === 'string' ? h : null
}

/** Absender steckt im Dateinamen: <zeit>_<absender>_<zufall> */
export const absenderAusId = (id: string) => id.split('_').slice(1, -1).join('_')

/** Gelesen markieren = Hinweise im eigenen Posteingang löschen. */
export async function markiereGelesen(ich: string, ids: string[]): Promise<void> {
  await Promise.all(ids.map(id => api().netDeleteFileAsync(`${posteingang(ich)}/${id}.json`).catch(() => false)))
}

/** Welche meiner Nachrichten hat der Partner noch NICHT gelesen? (Hinweis liegt noch in seinem Posteingang) */
export async function ungelesenBeiPartner(partner: string): Promise<Set<string>> {
  return new Set(await listePosteingang(partner))
}
