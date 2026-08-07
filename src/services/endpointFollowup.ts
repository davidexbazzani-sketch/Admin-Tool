// ── Endgeraete-Uebersicht: Nachverfolgung je Person (Mehrfach-Geraete-Nutzer) ──
// Haelt fest, ob eine Person nachgefragt/erledigt wurde, plus eine Notiz
// (Rueckmeldung) und beliebige Datei-Nachweise (z. B. Outlook-Verlauf .msg/.eml).
// Zentral auf dem Netzlaufwerk -> fuer alle App-User sichtbar und dauerhaft.
//
// Speicher:
//   endpoint-followups/data/<key>.json          (Metadaten je Person)
//   endpoint-followups/files/<key>/<id>__<name> (Roh-Dateien als Nachweis)

import { api } from '../electronAPI'

export interface FollowupFile {
  id: string
  name: string        // urspruenglicher Dateiname
  size: number        // Bytes (ungefaehr, aus base64 abgeleitet)
  addedAt: string
  addedBy: string
  path: string        // relativer Pfad auf dem Netzlaufwerk
}

export interface PersonFollowup {
  key: string
  personName: string
  nachgefragt: boolean
  nachgefragtAt?: string
  nachgefragtBy?: string
  erledigt: boolean
  erledigtAt?: string
  erledigtBy?: string
  note?: string
  files: FollowupFile[]
  updatedAt?: string
  updatedBy?: string
}

const DIR = 'endpoint-followups'
const DATA = `${DIR}/data`
const FILES = `${DIR}/files`

/** Stabiler, dateisicherer Schluessel aus dem Personennamen. */
export function followupKey(name: string): string {
  return (name || '')
    .trim().toLowerCase().replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 120) || 'unbenannt'
}
function fileSafe(s: string): string { return (s || '').replace(/[\\/:*?"<>|]/g, '_') }

export function emptyFollowup(name: string): PersonFollowup {
  return { key: followupKey(name), personName: name, nachgefragt: false, erledigt: false, files: [] }
}

export async function listFollowups(): Promise<Map<string, PersonFollowup>> {
  const map = new Map<string, PersonFollowup>()
  try {
    const files = await api().netListDir(DATA)
    for (const f of (files ?? []).filter(n => n.toLowerCase().endsWith('.json'))) {
      try {
        const r = await api().netReadJson<PersonFollowup>(`${DATA}/${f}`)
        if (r && r.key) map.set(r.key, { ...r, files: Array.isArray(r.files) ? r.files : [] })
      } catch { /* defekte Datei ueberspringen */ }
    }
  } catch { /* Verzeichnis evtl. noch leer */ }
  return map
}

export async function saveFollowup(f: PersonFollowup): Promise<boolean> {
  const payload: PersonFollowup = { ...f, updatedAt: new Date().toISOString() }
  try { return await api().netWriteJson(`${DATA}/${fileSafe(f.key)}.json`, payload) } catch { return false }
}

/** Waehlt Dateien aus, kopiert sie zentral aufs Netzlaufwerk und liefert die Metadaten. */
export async function pickAndStoreFiles(key: string, addedBy: string): Promise<FollowupFile[]> {
  const paths = await api().openFilesDialog([
    { name: 'Nachweise (Outlook, PDF, Bilder, Office)', extensions: ['msg', 'eml', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'txt', 'html', 'htm', 'docx', 'doc', 'xlsx'] },
    { name: 'Alle Dateien', extensions: ['*'] },
  ])
  if (!paths || paths.length === 0) return []
  const out: FollowupFile[] = []
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
    } catch { /* naechste Datei */ }
  }
  return out
}

/** Oeffnet den gespeicherten Nachweis direkt vom Netzlaufwerk (z. B. .msg in Outlook). */
export async function openFollowupFile(relPath: string): Promise<void> {
  try {
    const base = await api().netGetBasePath()
    const full = base.replace(/[\\/]+$/, '') + '\\' + relPath.replace(/\//g, '\\')
    await api().openPath(full)
  } catch { /* ignore */ }
}

export async function deleteFollowupFile(relPath: string): Promise<void> {
  try { await api().netDeleteFile(relPath) } catch { /* ignore */ }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
