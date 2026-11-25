// Brain-Duell: zwei Benutzer spielen dieselben Aufgaben gegeneinander (höchstens 3 Minuten).
//
// Transport: nur das Netzlaufwerk (kein Server), ausschließlich über die NICHT blockierenden
// Aufrufe. Abgefragt wird nur, während ein Duell wartet oder läuft — nie dauerhaft im Hintergrund.
// Die Einladung selbst kommt als Chat-Nachricht (vorhandener Chat-Takt).
//
// Ablage (flach, nur für die Dauer des Duells):
//   brain/duelle/<id>__meta.json        – wer gegen wen, Disziplin, Dauer, Startwert, Zustand
//   brain/duelle/<id>__<benutzer>.json  – laufender Punktestand; JEDER schreibt nur seine eigene Datei
// Es gibt bewusst keine gemeinsame Datei, in die beide schreiben → keine Schreibkonflikte.
import { api } from '../../electronAPI'
import { sende, type ChatIch } from '../../services/chat'
import { neuerStart } from '../kern/zufall'

export interface Spieler { username: string; displayName: string }
export type DuellStatus = 'offen' | 'angenommen' | 'abgelehnt' | 'abgebrochen'
export interface DuellMeta {
  id: string
  von: Spieler
  an: Spieler
  /** Übungs-Kennung aus dem Katalog */
  disziplin: string
  disziplinName: string
  dauerSek: number
  /** gemeinsamer Startwert → beide bekommen dieselben Aufgaben */
  start: number
  erstellt: string
  status: DuellStatus
  geaendert: string
}
export interface DuellStand { username: string; punkte: number; fertig: boolean; at: string }

const ORDNER = 'brain/duelle'
/** so lange kann eine Einladung angenommen werden */
export const EINLADUNG_GILT_MS = 120_000
export const DUELL_DAUERN = [60, 120, 180] as const
/** Stufe der Aufgaben im Duell (fest, damit es für beide gleich schwer ist) */
export const DUELL_STUFE = 5
/** ältere Dateien werden beim Öffnen der Duelle weggeräumt */
const ALT_NACH_MS = 30 * 60_000

const lc = (s: string) => (s || '').toLowerCase()
const sicher = (s: string) => lc(s).replace(/[^a-z0-9._-]/g, '_')
export const gleicherBenutzer = (a: string, b: string): boolean => sicher(a) === sicher(b)
const metaPfad = (id: string) => `${ORDNER}/${sicher(id)}__meta.json`
const standPfad = (id: string, username: string) => `${ORDNER}/${sicher(id)}__${sicher(username)}.json`
const neueId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
export const dauerText = (sek: number): string => (sek % 60 === 0 ? `${sek / 60} min` : `${sek} s`)

export function istAbgelaufen(m: Pick<DuellMeta, 'erstellt' | 'status'>, jetzt: number = Date.now()): boolean {
  return m.status === 'offen' && jetzt - new Date(m.erstellt).getTime() > EINLADUNG_GILT_MS
}

function gueltig(m: unknown): m is DuellMeta {
  const x = m as Partial<DuellMeta> | null
  return !!x && typeof x.id === 'string' && !!x.von?.username && !!x.an?.username && typeof x.disziplin === 'string' && typeof x.dauerSek === 'number' && typeof x.start === 'number' && typeof x.erstellt === 'string'
}

export async function ladeMeta(id: string): Promise<DuellMeta | null> {
  try { const m = await api().netReadJsonAsync<DuellMeta>(metaPfad(id)); return gueltig(m) ? m : null } catch { return null }
}
async function schreibeMeta(m: DuellMeta): Promise<boolean> {
  try { return await api().netWriteJsonAsync(metaPfad(m.id), { ...m, geaendert: new Date().toISOString() }) } catch { return false }
}

/** Herausfordern: Duell anlegen und die Einladung als Chat-Nachricht schicken. */
export async function fordereHeraus(ich: Spieler, gegner: Spieler, disziplin: { id: string; name: string }, dauerSek: number): Promise<DuellMeta | null> {
  const jetzt = new Date()
  const m: DuellMeta = {
    id: neueId(), von: { username: lc(ich.username), displayName: ich.displayName || ich.username },
    an: { username: lc(gegner.username), displayName: gegner.displayName || gegner.username },
    disziplin: disziplin.id, disziplinName: disziplin.name, dauerSek: Math.max(30, Math.min(180, Math.round(dauerSek))),
    start: neuerStart(), erstellt: jetzt.toISOString(), status: 'offen', geaendert: jetzt.toISOString(),
  }
  if (!(await schreibeMeta(m))) return null
  const titel = `${disziplin.name} · ${dauerText(m.dauerSek)}`
  const chatIch: ChatIch = { username: ich.username, displayName: ich.displayName }
  const n = await sende(chatIch, gegner, `⚔️ Ich fordere dich zu einem Brain-Duell heraus: ${titel}. (Annehmen geht 2 Minuten lang — Pausenraum → Brain Trainer → Duelle.)`,
    undefined, { art: 'brain', id: m.id, titel, gueltigBis: new Date(jetzt.getTime() + EINLADUNG_GILT_MS).toISOString() })
  if (!n) { try { await api().netDeleteFileAsync(metaPfad(m.id)) } catch { /* egal */ } ; return null }
  return m
}

/** Annehmen — nur der Eingeladene, nur solange die Einladung offen und nicht abgelaufen ist. */
export async function nimmAn(id: string, ich: string): Promise<{ ok: true; meta: DuellMeta } | { ok: false; grund: string }> {
  const m = await ladeMeta(id)
  if (!m) return { ok: false, grund: 'Das Duell gibt es nicht mehr.' }
  if (!gleicherBenutzer(m.an.username, ich)) return { ok: false, grund: 'Diese Einladung ist nicht für dich.' }
  if (m.status === 'angenommen') return { ok: true, meta: m }
  if (m.status !== 'offen') return { ok: false, grund: m.status === 'abgebrochen' ? 'Die Einladung wurde zurückgezogen.' : 'Die Einladung wurde schon abgelehnt.' }
  if (istAbgelaufen(m)) return { ok: false, grund: 'Die Einladung ist abgelaufen.' }
  const neu: DuellMeta = { ...m, status: 'angenommen' }
  if (!(await schreibeMeta(neu))) return { ok: false, grund: 'Netzlaufwerk nicht erreichbar.' }
  return { ok: true, meta: neu }
}
export async function lehneAb(id: string, ich: string): Promise<void> {
  const m = await ladeMeta(id)
  if (m && m.status === 'offen' && gleicherBenutzer(m.an.username, ich)) await schreibeMeta({ ...m, status: 'abgelehnt' })
}
/** Der Herausforderer zieht die Einladung zurück (solange noch nicht angenommen). */
export async function zieheZurueck(id: string, ich: string): Promise<void> {
  const m = await ladeMeta(id)
  if (m && m.status === 'offen' && gleicherBenutzer(m.von.username, ich)) await schreibeMeta({ ...m, status: 'abgebrochen' })
}

export async function schreibeStand(id: string, username: string, punkte: number, fertig: boolean): Promise<void> {
  const s: DuellStand = { username: lc(username), punkte: Math.max(0, Math.round(punkte)), fertig, at: new Date().toISOString() }
  try { await api().netWriteJsonAsync(standPfad(id, username), s) } catch { /* nächster Takt */ }
}
export async function ladeStand(id: string, username: string): Promise<DuellStand | null> {
  try {
    const s = await api().netReadJsonAsync<DuellStand>(standPfad(id, username))
    return s && typeof s.punkte === 'number' ? s : null
  } catch { return null }
}

/** Offene Einladungen an mich (für die Duell-Seite; ergänzt die Chat-Nachricht). */
export async function offeneEinladungen(ich: string): Promise<DuellMeta[]> {
  let dateien: string[] = []
  try { dateien = (await api().netListDirAsync(ORDNER)).filter(f => /__meta\.json$/i.test(f)) } catch { return [] }
  const metas = await Promise.all(dateien.map(f => api().netReadJsonAsync<DuellMeta>(`${ORDNER}/${f}`).catch(() => null)))
  return metas.filter((m): m is DuellMeta => gueltig(m) && m.status === 'offen' && !istAbgelaufen(m) && gleicherBenutzer(m.an.username, ich))
    .sort((a, b) => b.erstellt.localeCompare(a.erstellt))
}

/** Dateien eines beendeten Duells entfernen (jeder räumt seine eigene Standdatei, der Herausforderer auch die Meta-Datei). */
export async function raeumeAuf(m: DuellMeta, ich: string): Promise<void> {
  try { await api().netDeleteFileAsync(standPfad(m.id, ich)) } catch { /* egal */ }
  if (gleicherBenutzer(m.von.username, ich)) { try { await api().netDeleteFileAsync(metaPfad(m.id)) } catch { /* egal */ } }
}

/** Liegengebliebenes wegräumen: alles, was älter als 30 Minuten ist und an dem ich beteiligt war. */
export async function raeumeAlteAuf(ich: string, jetzt: number = Date.now()): Promise<number> {
  let dateien: string[] = []
  try { dateien = (await api().netListDirAsync(ORDNER)).filter(f => /\.json$/i.test(f)) } catch { return 0 }
  let entfernt = 0
  for (const f of dateien.filter(x => /__meta\.json$/i.test(x))) {
    const m = await api().netReadJsonAsync<DuellMeta>(`${ORDNER}/${f}`).catch(() => null)
    if (!gueltig(m)) continue
    const alt = jetzt - new Date(m.geaendert || m.erstellt).getTime() > ALT_NACH_MS
    if (!alt || !(gleicherBenutzer(m.von.username, ich) || gleicherBenutzer(m.an.username, ich))) continue
    for (const u of [m.von.username, m.an.username]) { try { if (await api().netDeleteFileAsync(standPfad(m.id, u))) entfernt++ } catch { /* egal */ } }
    try { if (await api().netDeleteFileAsync(`${ORDNER}/${f}`)) entfernt++ } catch { /* egal */ }
  }
  return entfernt
}

/** Ausgang aus Sicht von „ich“ */
export function ausgang(ich: number, er: number): 1 | 0 | -1 { return ich > er ? 1 : ich < er ? -1 : 0 }
