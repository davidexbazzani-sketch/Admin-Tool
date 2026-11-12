// ── Wochenend-Check: Welche genutzten PCs laufen am Wochenende noch? ─────────
// Jeden Sonntag (Standard 12:00, Einstellungen → Automatische Scans — Tag dort änderbar)
// werden alle PCs aus der Endgeräte-Übersicht mit Status „In use" + Verwendung „Active"
// angepingt. Das Ergebnis wird je Messtag dauerhaft gespeichert und im Proaktiven Radar
// (Reiter „Wochenend-Check") als fortlaufende Tabelle angezeigt.
// Bei jedem PC, der an ist, wird zusätzlich ausgelesen, wer angemeldet ist (Konsole,
// gesperrte/getrennte Sitzungen) und ob das die zugewiesene Person ist — nur lesend,
// ohne WinRM einzuschalten (services/anmeldeAbgleich.ts).
//
// WICHTIG: Es wird NIE nachgeholt. Ein Ping am Montag würde nichts über das Wochenende
// aussagen — verpasste Messtage bleiben „nicht gemessen" (siehe isInWindow).
//
// Speicherregeln (Memory scan_result_retention): unmittelbar vor dem Schreiben frisch
// nachladen, nur den Eintrag des aktuellen Messtags setzen/ergänzen, bei unlesbarer
// Datei abbrechen statt überschreiben.

import { api } from '../electronAPI'
import { loadDevices, type EndpointDevice } from './endpointDevices'
import { isDeviceInUse } from './deviceMaps'
import { latestWeeklySlot, type ScanScheduleConfig } from './scanSchedules'
import { buildParallelOnlineCheck, parseOnlineCheckLine } from '../utils/connectivityCheck'
import { pruefeAnmeldung, zuweisungText, type AngemeldeterBenutzer, type AbgleichStufe } from './anmeldeAbgleich'

export const WEEKEND_CHECK_ID = 'weekend-check'
export const WEEKEND_CHECK_STATUS = 'weekend-check/_scan_status.json'
const RESULTS_PATH = 'weekend-check/results.json'

/** Wie lange nach dem geplanten Zeitpunkt (So 12:00) noch gemessen werden darf. */
export const WINDOW_MS = 2 * 60 * 60 * 1000
/** Wartezeit bis zur zweiten Prüfung der Offline-Geräte (kurze Netzaussetzer abfangen). */
const RETRY_DELAY_MS = 5 * 60 * 1000
const CHUNK = 40
/** So viele PCs werden gleichzeitig nach dem angemeldeten Benutzer gefragt (Bulk-Regel: max. 10). */
const ANMELDE_PARALLEL = 5

/** Wer zum Messzeitpunkt an einem eingeschalteten PC angemeldet war. */
export interface WeekendAnmeldung {
  /** [] = niemand angemeldet (bzw. nicht ermittelbar, siehe stufe/fehler). */
  benutzer: AngemeldeterBenutzer[]
  /** Abgleich mit der Zuweisung zum Messzeitpunkt. */
  stufe: AbgleichStufe
  /** Zugewiesene Person zum Messzeitpunkt (Anzeigetext). */
  zugewiesen?: string
  weg?: string
  fehler?: string
  am: string
}
export interface HostResult {
  online: boolean
  method: string
  /** Nur bei online — fehlt bei Messungen vor dem 10.11.26 oder wenn noch nicht ausgelesen. */
  anmeldung?: WeekendAnmeldung
}
export interface MessResult {
  checkedAt: string
  by: string
  /** Anzahl Geräte, die an diesem Messtag geprüft wurden. */
  total: number
  hosts: Record<string, HostResult>
}
export interface WeekendResults { messungen: Record<string, MessResult> }

export interface WeekendDevice { hostname: string; serial: string; model: string; assignedTo: string }

/** Hostname-Schlüssel: Großbuchstaben, ohne Domänenteil. */
export function hostKey(h: string): string {
  return (h || '').trim().split('.')[0].toUpperCase()
}

/** Lokales Datum als 'YYYY-MM-DD' (kein UTC-Versatz). */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** „In use" + Verwendung „Active"/„Aktiv" + Hostname vorhanden. */
export function isWeekendRelevant(d: Pick<EndpointDevice, 'state' | 'substate' | 'hostname'>): boolean {
  return isDeviceInUse(d.state) && /^(active|aktiv)$/i.test((d.substate || '').trim()) && !!(d.hostname || '').trim()
}

/** Alle genutzten PCs (live aus der Endgeräte-Übersicht), je Hostname einmal. */
export async function listWeekendDevices(): Promise<WeekendDevice[]> {
  const all = await loadDevices().catch(() => [] as EndpointDevice[])
  const seen = new Map<string, WeekendDevice>()
  for (const d of all) {
    if (!isWeekendRelevant(d)) continue
    const k = hostKey(d.hostname)
    if (!k || seen.has(k)) continue
    seen.set(k, { hostname: d.hostname.trim(), serial: d.serial, model: d.model, assignedTo: d.assignedTo })
  }
  return [...seen.values()].sort((a, b) => a.hostname.localeCompare(b.hostname))
}

/** null = Datei existiert, ist aber nicht lesbar → NICHT überschreiben. */
async function readResults(): Promise<WeekendResults | null> {
  let raw: unknown
  try { raw = await api().netReadJson<WeekendResults>(RESULTS_PATH) } catch { return null }
  if (raw == null) {
    // netReadJson liefert null für „fehlt" UND „kaputt" — nur wenn sie wirklich fehlt, neu anfangen.
    let exists = true
    try { exists = await api().netExists(RESULTS_PATH) } catch { /* Netzlaufwerk weg → nicht schreiben */ }
    return exists ? null : { messungen: {} }
  }
  const r = raw as WeekendResults
  if (typeof r !== 'object' || !r.messungen || typeof r.messungen !== 'object') return null
  return { messungen: r.messungen }
}

export async function loadWeekendResults(): Promise<WeekendResults> {
  return (await readResults()) ?? { messungen: {} }
}

/**
 * Darf JETZT gemessen werden? Nur wenn der jüngste geplante Zeitpunkt HEUTE liegt und
 * höchstens WINDOW_MS zurück. Liefert das Datum des Messtags oder null.
 */
export function isInWindow(cfg: ScanScheduleConfig, now: Date): string | null {
  if (!cfg.enabled) return null
  const slot = latestWeeklySlot(now, cfg.days, cfg.time)
  if (!slot) return null
  if (dateKey(slot) !== dateKey(now)) return null
  if (now.getTime() - slot.getTime() > WINDOW_MS) return null
  return dateKey(slot)
}

/**
 * Alle geplanten Messtage (Wochentage `days`, 0=So … 6=Sa) von `fromKey` (inkl.) bis
 * heute — für die Tabellenspalten. Folgt dem Zeitplan in den Einstellungen.
 */
export function messtageSince(fromKey: string, days: number[], today = new Date()): string[] {
  const set = new Set(days)
  if (set.size === 0) return []
  const [y, m, d] = fromKey.split('-').map(n => parseInt(n, 10))
  const out: string[] = []
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  for (const c = new Date(y, (m || 1) - 1, d || 1); c.getTime() <= end.getTime(); c.setDate(c.getDate() + 1)) {
    if (set.has(c.getDay())) out.push(dateKey(c))
  }
  return out
}

const WOCHENTAG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
/** 'YYYY-MM-DD' → Wochentag, z. B. „Sonntag". */
export function wochentag(key: string): string {
  const [y, m, d] = key.split('-').map(n => parseInt(n, 10))
  return WOCHENTAG[new Date(y, m - 1, d).getDay()]
}

async function pingHosts(hosts: string[], onTick?: () => void): Promise<Map<string, HostResult>> {
  const res = new Map<string, HostResult>()
  for (let i = 0; i < hosts.length; i += CHUNK) {
    const part = hosts.slice(i, i + CHUNK)
    try {
      const r = await api().runPowerShell(buildParallelOnlineCheck(part), Math.min(240000, 30000 + part.length * 800))
      for (const line of (r.stdout || '').split(/\r?\n/)) {
        if (!/:OK:|:OFFLINE/.test(line)) continue
        const p = parseOnlineCheckLine(line)
        if (p.hostname) res.set(hostKey(p.hostname), { online: p.online, method: p.online ? p.method : '' })
      }
    } catch { /* Block nicht prüfbar → bleibt ohne Ergebnis */ }
    onTick?.()
  }
  return res
}

/** Ergebnis frisch nachladen, nur diesen Messtag zusammenführen, schreiben. */
async function mergeAndSave(slotKey: string, by: string, total: number, found: Map<string, HostResult>): Promise<boolean> {
  const cur = await readResults()
  if (!cur) return false
  const prev = cur.messungen[slotKey]
  const hosts: Record<string, HostResult> = { ...(prev?.hosts ?? {}) }
  for (const [k, v] of found) {
    // Einmal „an" bleibt „an" (zweite Prüfung kann nur offline → online korrigieren).
    if (hosts[k]?.online && !v.online) continue
    // Gelesene Anmeldung eines weiterhin eingeschalteten PCs nicht verwerfen.
    const alt = hosts[k]?.anmeldung
    hosts[k] = v.online && alt && !v.anmeldung ? { ...v, anmeldung: alt } : v
  }
  cur.messungen[slotKey] = { checkedAt: new Date().toISOString(), by, total: Math.max(total, prev?.total ?? 0), hosts }
  try { return await api().netWriteJson(RESULTS_PATH, cur) } catch { return false }
}

/**
 * Ein Messlauf für den Messtag `slotKey`. Erst alle Geräte, Ergebnis sofort sichern;
 * dann nach RETRY_DELAY_MS die Offline-Geräte ein zweites Mal prüfen.
 */
export async function runWeekendCheckOnce(by: string, slotKey: string, onTick?: () => void): Promise<{ ok: boolean; summary: string }> {
  const devices = await listWeekendDevices()
  if (devices.length === 0) return { ok: false, summary: 'Keine genutzten PCs (In use + Active) in der Endgeräte-Übersicht gefunden.' }
  if (!(await readResults())) return { ok: false, summary: 'Ergebnisdatei nicht lesbar – abgebrochen, nichts überschrieben.' }

  const hosts = devices.map(d => d.hostname)
  const first = await pingHosts(hosts, onTick)
  if (first.size === 0) return { ok: false, summary: 'Keine Antwort von der Online-Prüfung (PowerShell).' }
  if (!(await mergeAndSave(slotKey, by, devices.length, first))) return { ok: false, summary: 'Ergebnis konnte nicht gespeichert werden.' }

  // Wer ist an den eingeschalteten PCs angemeldet? Läuft in der Wartezeit bis zur zweiten Runde.
  const zweiteRundeAb = Date.now() + RETRY_DELAY_MS
  const an = hosts.filter(h => first.get(hostKey(h))?.online)
  await speichereAnmeldungen(slotKey, await leseAnmeldungen(an, onTick))

  const offline = hosts.filter(h => !first.get(hostKey(h))?.online)
  if (offline.length > 0) {
    while (Date.now() < zweiteRundeAb) {
      await new Promise(r => setTimeout(r, Math.min(30_000, Math.max(1000, zweiteRundeAb - Date.now()))))
      onTick?.()
    }
    const second = await pingHosts(offline, onTick)
    await mergeAndSave(slotKey, by, devices.length, second)
    const spaeterAn = offline.filter(h => second.get(hostKey(h))?.online)
    await speichereAnmeldungen(slotKey, await leseAnmeldungen(spaeterAn, onTick))
  }

  const final = (await loadWeekendResults()).messungen[slotKey]
  return { ok: true, summary: zusammenfassung(slotKey, final, devices.length) }
}

// ── Angemeldete Benutzer an den eingeschalteten PCs ──────────────────────────

/** Ergebnis von pruefeAnmeldung → gespeicherte Form. */
async function leseEineAnmeldung(host: string): Promise<WeekendAnmeldung> {
  try {
    const e = await pruefeAnmeldung(host)
    // Der PC hat auf Ping geantwortet — „nicht erreichbar" heißt hier: Fernabfrage-Ports zu.
    const fehler = e.fehler && /^PC nicht erreichbar/i.test(e.fehler)
      ? 'PC antwortet, aber weder WinRM (5985) noch RPC (135) sind erreichbar.'
      : e.fehler
    return {
      benutzer: e.angemeldet,
      stufe: e.stufe,
      zugewiesen: e.zuweisung ? zuweisungText(e.zuweisung) : undefined,
      weg: e.weg,
      fehler: fehler || undefined,
      am: new Date(e.geprueftAm).toISOString(),
    }
  } catch (err) {
    return { benutzer: [], stufe: 'unbekannt', fehler: err instanceof Error ? err.message : 'Abfrage fehlgeschlagen.', am: new Date().toISOString() }
  }
}

/** Liest bei allen übergebenen PCs, wer angemeldet ist (höchstens ANMELDE_PARALLEL gleichzeitig). */
async function leseAnmeldungen(hosts: string[], onTick?: () => void): Promise<Map<string, WeekendAnmeldung>> {
  const aus = new Map<string, WeekendAnmeldung>()
  let i = 0
  const arbeiter = async () => {
    while (i < hosts.length) {
      const h = hosts[i++]
      aus.set(hostKey(h), await leseEineAnmeldung(h))
      onTick?.()
    }
  }
  await Promise.all(Array.from({ length: Math.min(ANMELDE_PARALLEL, hosts.length) }, arbeiter))
  return aus
}

/** Frisch nachladen, Anmeldungen nur bei eingeschalteten PCs dieses Messtags eintragen, schreiben. */
async function speichereAnmeldungen(slotKey: string, gelesen: Map<string, WeekendAnmeldung>): Promise<boolean> {
  if (gelesen.size === 0) return true
  const cur = await readResults()
  const m = cur?.messungen[slotKey]
  if (!cur || !m) return false
  for (const [k, a] of gelesen) {
    const h = m.hosts[k]
    if (!h?.online) continue
    // Ein gelesenes Ergebnis nicht durch einen späteren Fehlversuch ersetzen.
    if (h.anmeldung && h.anmeldung.stufe !== 'unbekannt' && a.stufe === 'unbekannt') continue
    m.hosts[k] = { ...h, anmeldung: a }
  }
  try { return await api().netWriteJson(RESULTS_PATH, cur) } catch { return false }
}

/** Eingeschaltete PCs eines Messtags, bei denen der angemeldete Benutzer noch fehlt. */
export function fehlendeAnmeldungen(m: MessResult | undefined): string[] {
  if (!m) return []
  return Object.entries(m.hosts).filter(([, h]) => h.online && !h.anmeldung).map(([k]) => k)
}

/**
 * Nachlesen im Messfenster: Stammt die Messung z. B. von einer älteren Tool-Version oder
 * wurde sie abgebrochen, fehlen bei eingeschalteten PCs die angemeldeten Benutzer.
 */
export async function leseFehlendeAnmeldungen(slotKey: string, onTick?: () => void): Promise<{ ok: boolean; summary: string }> {
  const cur = await readResults()
  if (!cur) return { ok: false, summary: 'Ergebnisdatei nicht lesbar – abgebrochen, nichts überschrieben.' }
  const m = cur.messungen[slotKey]
  const fehlen = fehlendeAnmeldungen(m)
  if (!m || fehlen.length === 0) return { ok: true, summary: zusammenfassung(slotKey, m, m?.total ?? 0) }
  if (!(await speichereAnmeldungen(slotKey, await leseAnmeldungen(fehlen, onTick)))) {
    return { ok: false, summary: 'Angemeldete Benutzer konnten nicht gespeichert werden.' }
  }
  const final = (await loadWeekendResults()).messungen[slotKey]
  return { ok: true, summary: zusammenfassung(slotKey, final, final?.total ?? m.total) }
}

/** „Sonntag 15.11.2026: 12 von 180 PCs an, bei 9 war jemand angemeldet (3× nicht die zugewiesene Person)." */
export function zusammenfassung(slotKey: string, m: MessResult | undefined, total: number): string {
  const an = m ? Object.values(m.hosts).filter(h => h.online) : []
  const mitBenutzer = an.filter(h => (h.anmeldung?.benutzer.length ?? 0) > 0).length
  const fremd = an.filter(h => h.anmeldung?.stufe === 'fremd').length
  const kopf = `${wochentag(slotKey)} ${slotKey.split('-').reverse().join('.')}: ${an.length} von ${total} PCs an`
  if (an.length === 0) return kopf + '.'
  return `${kopf}, bei ${mitBenutzer} war jemand angemeldet${fremd ? ` (${fremd}× nicht die zugewiesene Person)` : ''}.`
}
