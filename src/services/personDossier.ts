// ── Personen-Dossier (globale Personenakte) ───────────────────────────────────
// Zu JEDER Person (ueberall im Tool per Info-Button erreichbar) koennen datierte,
// signierte Eintraege (Notizen / Vorgaenge) samt beliebigen Datei-Anhaengen
// gesammelt werden. Zentral auf dem Netzlaufwerk -> fuer alle App-User sichtbar.
//
// Schluessel = kanonischer Anzeigename (versteht "Nachname, Vorname" ebenso wie
// "Vorname Nachname"), damit dieselbe Person ueberall dasselbe Dossier trifft.
//
// Speicher:
//   person-dossiers/data/<key>.json
//   person-dossiers/files/<key>/<id>__<name>

import { api } from '../electronAPI'

export interface DossierFile {
  id: string
  name: string
  size: number
  addedAt: string
  addedBy: string
  path: string     // relativer Pfad auf dem Netzlaufwerk
}

export interface DossierEntry {
  id: string
  text: string
  createdAt: string
  createdBy: string
  files: DossierFile[]
  kind?: 'note' | 'action'   // 'action' = automatisch protokollierter, ausgefuehrter Eingriff
  source?: string            // Herkunft des Eingriffs (z. B. "Daylis", "Remote Doc")
}

export interface PersonDossier {
  key: string
  personName: string
  sam?: string
  roomNumber?: string   // manuell gepflegte Raum-/Arbeitsplatznummer (Stammdaten-Tab)
  entries: DossierEntry[]
  updatedAt?: string
  updatedBy?: string
}

const DIR = 'person-dossiers'
const DATA = `${DIR}/data`
const FILES = `${DIR}/files`

/** "Nachname, Vorname" -> "Vorname Nachname"; sonst unveraendert (getrimmt). */
export function canonicalName(name: string): string {
  let n = (name || '').trim().replace(/\s+/g, ' ')
  if (n.includes(',')) {
    const p = n.split(',')
    if (p.length === 2 && p[0].trim() && p[1].trim()) n = `${p[1].trim()} ${p[0].trim()}`
  }
  return n
}

/** Stabiler, dateisicherer Schluessel je Person (aus dem kanonischen Namen). */
export function personKey(name: string): string {
  const c = canonicalName(name).toLowerCase().replace(/[\\/:*?"<>|]/g, '_').slice(0, 120)
  return c || 'unbenannt'
}
function fileSafe(s: string): string { return (s || '').replace(/[\\/:*?"<>|]/g, '_') }

export function emptyDossier(name: string, sam?: string): PersonDossier {
  return { key: personKey(name), personName: canonicalName(name), sam, entries: [] }
}

export async function loadDossier(name: string): Promise<PersonDossier | null> {
  try {
    const r = await api().netReadJson<PersonDossier>(`${DATA}/${fileSafe(personKey(name))}.json`)
    if (r && r.key) return { ...r, entries: Array.isArray(r.entries) ? r.entries : [] }
  } catch { /* noch keins */ }
  return null
}

export async function saveDossier(d: PersonDossier, updatedBy: string): Promise<boolean> {
  const payload: PersonDossier = { ...d, updatedBy, updatedAt: new Date().toISOString() }
  try { return await api().netWriteJson(`${DATA}/${fileSafe(d.key)}.json`, payload) } catch { return false }
}

/**
 * Protokolliert automatisch einen AUSGEFUEHRTEN Eingriff (z. B. Daylis-Aktion,
 * Remote Doc) im Dossier der Person. NUR fuer real ausgefuehrte Aktionen
 * verwenden — keine reinen Abfragen/Lesevorgaenge!
 */
export async function logDossierAction(
  name: string, sam: string | undefined, text: string, by: string, source?: string,
): Promise<void> {
  if (!name || !name.trim() || !text || !text.trim()) return
  try {
    const d = (await loadDossier(name)) ?? emptyDossier(name, sam)
    if (!d.sam && sam) d.sam = sam
    const entry: DossierEntry = {
      id: 'a_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      text: text.trim(),
      createdAt: new Date().toISOString(),
      createdBy: by,
      files: [],
      kind: 'action',
      source,
    }
    d.entries = [entry, ...d.entries]
    await saveDossier(d, by)
  } catch { /* Protokollierung darf den Ablauf nie stoeren */ }
}

/** Waehlt Dateien (alle Endungen) aus und legt sie zentral ab. */
export async function pickAndStoreDossierFiles(key: string, addedBy: string): Promise<DossierFile[]> {
  const paths = await api().openFilesDialog([
    { name: 'Alle Dateien', extensions: ['*'] },
    { name: 'Dokumente & Medien', extensions: ['pdf', 'msg', 'eml', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'txt', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'zip', 'html'] },
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
      const ok = await api().netWriteRawFile(rel, read.data)
      if (!ok) continue
      const size = Math.max(0, Math.floor((read.data.length * 3) / 4))
      out.push({ id, name: base, size, addedAt: new Date().toISOString(), addedBy, path: rel })
    } catch { /* naechste */ }
  }
  return out
}

/** Oeffnet einen Anhang direkt vom Netzlaufwerk (z. B. .msg in Outlook). */
export async function openDossierFile(relPath: string): Promise<void> {
  try {
    const base = await api().netGetBasePath()
    const full = base.replace(/[\\/]+$/, '') + '\\' + relPath.replace(/\//g, '\\')
    await api().openPath(full)
  } catch { /* ignore */ }
}

export async function deleteDossierFile(relPath: string): Promise<void> {
  try { await api().netDeleteFile(relPath) } catch { /* ignore */ }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
