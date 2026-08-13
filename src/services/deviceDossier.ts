// ── Geräte-Dossier (zentrale Geräteakte) ──────────────────────────────────────
// Analog zum Personen-Dossier (personDossier.ts), nur mit dem HOSTNAMEN als
// Schluessel. Zu JEDEM PC/Gerät (ueberall per Info-Button erreichbar) koennen
// datierte, signierte Eintraege (Notizen / Vorgaenge) samt Datei-Anhaengen
// gesammelt werden. Zentral auf dem Netzlaufwerk -> fuer alle App-User sichtbar.
//
// Speicher:
//   device-dossiers/data/<key>.json
//   device-dossiers/files/<key>/<id>__<name>

import { api } from '../electronAPI'

export interface DossierFile {
  id: string
  name: string
  size: number
  addedAt: string
  addedBy: string
  path: string     // relativer Pfad auf dem Netzlaufwerk
}

export interface DeviceDossierEntry {
  id: string
  text: string
  createdAt: string
  createdBy: string
  files: DossierFile[]
  kind?: 'note' | 'action'   // 'action' = automatisch protokollierter Eingriff
  source?: string            // Herkunft (z. B. "Daylis", "Remote Doc", "Abfrage")
}

export interface DeviceDossier {
  key: string
  hostname: string
  serial?: string
  entries: DeviceDossierEntry[]
  updatedAt?: string
  updatedBy?: string
}

const DIR = 'device-dossiers'
const DATA = `${DIR}/data`
const FILES = `${DIR}/files`

/** Hostname kanonisieren: Domain-Suffix weg, Grossbuchstaben, getrimmt.
 *  IP-Adressen (IPv4/IPv6) werden NICHT am Punkt abgeschnitten (sonst würde
 *  z. B. 192.168.1.50 zu "192" verstümmelt → Datei-Kollision + kaputte Lookups). */
export function canonicalHost(hostname: string): string {
  const t = (hostname || '').trim()
  if (!t) return ''
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(t) || t.includes(':')) return t.toUpperCase()
  return t.split('.')[0].toUpperCase()
}

/** true, wenn der Bezeichner eine IPv4-Adresse ist (kein AD-Namobjekt möglich). */
export function isIpAddress(s: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test((s || '').trim())
}

/** Stabiler, dateisicherer Schluessel je Gerät (aus dem kanonischen Hostnamen). */
export function deviceKey(hostname: string): string {
  const c = canonicalHost(hostname).toLowerCase().replace(/[\\/:*?"<>|]/g, '_').slice(0, 120)
  return c || 'unbenannt'
}
function fileSafe(s: string): string { return (s || '').replace(/[\\/:*?"<>|]/g, '_') }

export function emptyDeviceDossier(hostname: string, serial?: string): DeviceDossier {
  return { key: deviceKey(hostname), hostname: canonicalHost(hostname), serial, entries: [] }
}

export async function loadDeviceDossier(hostname: string): Promise<DeviceDossier | null> {
  try {
    const r = await api().netReadJson<DeviceDossier>(`${DATA}/${fileSafe(deviceKey(hostname))}.json`)
    if (r && r.key) return { ...r, entries: Array.isArray(r.entries) ? r.entries : [] }
  } catch { /* noch keins */ }
  return null
}

export async function saveDeviceDossier(d: DeviceDossier, updatedBy: string): Promise<boolean> {
  const payload: DeviceDossier = { ...d, updatedBy, updatedAt: new Date().toISOString() }
  try { return await api().netWriteJson(`${DATA}/${fileSafe(d.key)}.json`, payload) } catch { return false }
}

// ── Serialisierung je Gerät ──────────────────────────────────────────────────
// Alle Schreibvorgänge (Notiz anlegen/löschen, auto-Eingriff protokollieren)
// laufen als load→modify→save. Ohne Serialisierung würden gleichzeitige
// Vorgänge (z. B. zwei Daylis-Aktionen, oder Aktion + Notiz) einander
// überschreiben und Einträge verlieren. Deshalb pro Geräteschlüssel eine
// Promise-Kette (async Mutex); jeder Schritt liest den FRISCHEN Stand.
const locks = new Map<string, Promise<unknown>>()
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  locks.set(key, next.then(() => {}, () => {}))
  return next
}

/**
 * Fügt einen Eintrag hinzu — liest dabei IMMER den aktuellen Stand von der
 * Platte (statt einen veralteten UI-Snapshot zu überschreiben) und serialisiert
 * gegen andere Schreibvorgänge. Liefert das gespeicherte Dossier zurück.
 */
export async function addDeviceEntry(
  hostname: string, serial: string | undefined, entry: DeviceDossierEntry, by: string,
): Promise<DeviceDossier> {
  return withLock(deviceKey(hostname), async () => {
    const d = (await loadDeviceDossier(hostname)) ?? emptyDeviceDossier(hostname, serial)
    if (!d.serial && serial) d.serial = serial
    d.hostname = canonicalHost(hostname)
    d.entries = [entry, ...d.entries]
    await saveDeviceDossier(d, by)
    return d
  })
}

/** Löscht einen Eintrag anhand seiner id (frischer Stand + serialisiert). */
export async function deleteDeviceEntry(hostname: string, entryId: string, by: string): Promise<DeviceDossier> {
  return withLock(deviceKey(hostname), async () => {
    const d = (await loadDeviceDossier(hostname)) ?? emptyDeviceDossier(hostname)
    d.entries = d.entries.filter(e => e.id !== entryId)
    await saveDeviceDossier(d, by)
    return d
  })
}

/**
 * Protokolliert automatisch einen AUSGEFUEHRTEN Eingriff (Daylis-Aktion, Remote
 * Doc, Abfrage) im Geräte-Dossier. NUR fuer real ausgefuehrte Aktionen — keine
 * reinen Lesevorgaenge. Fehler werden verschluckt (darf den Ablauf nie stoeren).
 */
export async function logDeviceAction(
  hostname: string, serial: string | undefined, text: string, by: string, source?: string,
): Promise<void> {
  if (!hostname || !hostname.trim() || !text || !text.trim()) return
  try {
    const entry: DeviceDossierEntry = {
      id: 'a_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      text: text.trim(),
      createdAt: new Date().toISOString(),
      createdBy: by,
      files: [],
      kind: 'action',
      source,
    }
    // Serialisiert + frischer Read (verhindert verlorene Einträge, siehe addDeviceEntry).
    await addDeviceEntry(hostname, serial, entry, by)
  } catch { /* Protokollierung darf den Ablauf nie stoeren */ }
}

/** Waehlt Dateien (alle Endungen) aus und legt sie zentral ab. */
export async function pickAndStoreDeviceFiles(key: string, addedBy: string): Promise<DossierFile[]> {
  const paths = await api().openFilesDialog([
    { name: 'Alle Dateien', extensions: ['*'] },
    { name: 'Dokumente & Medien', extensions: ['pdf', 'msg', 'eml', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'txt', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'zip', 'html', 'log'] },
  ])
  if (!paths || paths.length === 0) return []
  const out: DossierFile[] = []
  for (const p of paths) {
    try {
      const read = await api().readFile(p)
      if (!read.success || !read.data) continue
      const base = p.split(/[\\/]/).pop() || 'datei'
      const id = 'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
      const rel = `${FILES}/${fileSafe(key)}/${id}__${fileSafe(base)}`
      const okWrite = await api().netWriteRawFile(rel, read.data)
      if (!okWrite) continue
      const size = Math.max(0, Math.floor((read.data.length * 3) / 4))
      out.push({ id, name: base, size, addedAt: new Date().toISOString(), addedBy, path: rel })
    } catch { /* naechste */ }
  }
  return out
}

export async function openDeviceFile(relPath: string): Promise<void> {
  try {
    const base = await api().netGetBasePath()
    const full = base.replace(/[\\/]+$/, '') + '\\' + relPath.replace(/\//g, '\\')
    await api().openPath(full)
  } catch { /* ignore */ }
}

export async function deleteDeviceFile(relPath: string): Promise<void> {
  try { await api().netDeleteFile(relPath) } catch { /* ignore */ }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
