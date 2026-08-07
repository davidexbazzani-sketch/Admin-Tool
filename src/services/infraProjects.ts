// ── Infrastruktur Projekte – Service ──────────────────────────────────────────
// Zentrale Dokumentation aller laufenden Infrastruktur-Projekte. Alle Daten
// liegen auf dem Netzlaufwerk, sodass Änderungen für alle App-Benutzer live
// sichtbar sind (Polling + Reload-on-Focus im Screen).
//
// Speicher-Layout auf dem Netzlaufwerk:
//   infra-projects/projects.json                     → der gesamte Store
//   infra-projects/attachments/<projectId>/<entryId>/<attId>__<datei>  → Anhänge (roh)
//
// Nebenläufigkeit: Jede Mutation lädt den Store frisch, patcht und schreibt
// zurück (last-write-wins pro Projekt). Das minimiert das Überschreiben
// paralleler Änderungen anderer Benutzer.

import { api } from '../electronAPI'

export type ProjectStatus = 'pending' | 'in-progress' | 'action-sascha' | 'done'

export const STATUS_ORDER: ProjectStatus[] = ['pending', 'in-progress', 'action-sascha', 'done']

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  pending: 'Steht an',
  'in-progress': 'In Bearbeitung',
  'action-sascha': 'Handlungsbedarf Sascha',
  done: 'Erledigt',
}

/** Tailwind-freundliche Farbwerte je Status (für Badges / Kachelrand). */
export const STATUS_COLORS: Record<ProjectStatus, { dot: string; badgeBg: string; badgeText: string; border: string; ring: string }> = {
  pending: { dot: 'bg-slate-400', badgeBg: 'bg-slate-500/15', badgeText: 'text-slate-300', border: 'border-slate-500/40', ring: '#64748b' },
  'in-progress': { dot: 'bg-blue-400', badgeBg: 'bg-blue-500/15', badgeText: 'text-blue-300', border: 'border-blue-500/40', ring: '#3b82f6' },
  'action-sascha': { dot: 'bg-amber-400', badgeBg: 'bg-amber-500/15', badgeText: 'text-amber-300', border: 'border-amber-500/50', ring: '#f59e0b' },
  done: { dot: 'bg-emerald-400', badgeBg: 'bg-emerald-500/15', badgeText: 'text-emerald-300', border: 'border-emerald-500/40', ring: '#10b981' },
}

export interface Attachment {
  id: string
  filename: string         // ursprünglicher Dateiname
  size: number             // Bytes
  mime?: string
  storedPath: string       // relativer Netzlaufwerk-Pfad zur Rohdatei
  uploadedBy: string
  uploadedAt: string       // ISO
}

export interface ProjectEntry {
  id: string
  title: string            // Überschrift
  body: string             // Freitext
  author: string           // Bearbeiter
  createdAt: string        // ISO (Datum + Uhrzeit)
  attachments: Attachment[]
}

export interface InfraProject {
  id: string
  title: string
  description?: string
  status: ProjectStatus
  // Whiteboard-Position (gemeinsam für alle Benutzer)
  x: number
  y: number
  color?: string           // optionale Akzentfarbe der Kachel
  entries: ProjectEntry[]
  createdAt: string        // ISO
  createdBy: string
  updatedAt?: string       // ISO – bei jeder Änderung gesetzt
  archivedAt?: string      // ISO – gesetzt sobald Status auf 'done' wechselt
}

const STORE_FILE = 'infra-projects/projects.json'
const ATT_DIR = 'infra-projects/attachments'

interface StoreFile {
  version: number
  projects: InfraProject[]
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function makeEmptyStore(): StoreFile {
  return { version: 1, projects: [] }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120)
}

async function loadStore(): Promise<StoreFile> {
  try {
    const data = await api().netReadJson<StoreFile>(STORE_FILE)
    if (!data || !Array.isArray(data.projects)) return makeEmptyStore()
    // Defensive: alte/teilweise Datensätze auffüllen
    const projects = data.projects.map(normalizeProject)
    return { version: data.version ?? 1, projects }
  } catch {
    return makeEmptyStore()
  }
}

function normalizeProject(p: Partial<InfraProject>): InfraProject {
  return {
    id: p.id ?? newId('prj'),
    title: p.title ?? 'Unbenanntes Projekt',
    description: p.description ?? '',
    status: (p.status as ProjectStatus) ?? 'pending',
    x: typeof p.x === 'number' ? p.x : 40,
    y: typeof p.y === 'number' ? p.y : 40,
    color: p.color,
    entries: Array.isArray(p.entries) ? p.entries.map(normalizeEntry) : [],
    createdAt: p.createdAt ?? new Date().toISOString(),
    createdBy: p.createdBy ?? '',
    updatedAt: p.updatedAt,
    archivedAt: p.archivedAt,
  }
}

function normalizeEntry(e: Partial<ProjectEntry>): ProjectEntry {
  return {
    id: e.id ?? newId('ent'),
    title: e.title ?? '',
    body: e.body ?? '',
    author: e.author ?? '',
    createdAt: e.createdAt ?? new Date().toISOString(),
    attachments: Array.isArray(e.attachments) ? e.attachments : [],
  }
}

async function saveStore(store: StoreFile): Promise<boolean> {
  try {
    return await api().netWriteJson(STORE_FILE, store)
  } catch {
    return false
  }
}

const ERR_NET = 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.'

// ── Reads ────────────────────────────────────────────────────────────────────

/** Aktive Projekte (nicht erledigt) – fürs Whiteboard. */
export async function listActiveProjects(): Promise<InfraProject[]> {
  const store = await loadStore()
  return store.projects.filter(p => p.status !== 'done')
}

/** Erledigte Projekte – fürs Archiv. */
export async function listArchivedProjects(): Promise<InfraProject[]> {
  const store = await loadStore()
  return store.projects
    .filter(p => p.status === 'done')
    .sort((a, b) => (b.archivedAt || b.updatedAt || '').localeCompare(a.archivedAt || a.updatedAt || ''))
}

/** Alle Projekte (für Live-Reload). */
export async function listAllProjects(): Promise<InfraProject[]> {
  const store = await loadStore()
  return store.projects
}

export async function getProject(id: string): Promise<InfraProject | null> {
  const store = await loadStore()
  return store.projects.find(p => p.id === id) ?? null
}

// ── Project mutations ──────────────────────────────────────────────────────────

export async function createProject(data: {
  title: string
  description?: string
  status?: ProjectStatus
  createdBy: string
  x?: number
  y?: number
  color?: string
}): Promise<{ ok: boolean; project?: InfraProject; error?: string }> {
  const store = await loadStore()
  const now = new Date().toISOString()
  const project: InfraProject = {
    id: newId('prj'),
    title: data.title,
    description: data.description ?? '',
    status: data.status ?? 'pending',
    x: data.x ?? 40 + (store.projects.length % 5) * 30,
    y: data.y ?? 40 + (store.projects.length % 5) * 24,
    color: data.color,
    entries: [],
    createdAt: now,
    createdBy: data.createdBy,
    updatedAt: now,
  }
  store.projects.push(project)
  const ok = await saveStore(store)
  if (!ok) return { ok: false, error: ERR_NET }
  return { ok: true, project }
}

export async function updateProject(id: string, patch: Partial<Pick<InfraProject, 'title' | 'description' | 'color' | 'status'>>): Promise<{ ok: boolean; project?: InfraProject; error?: string }> {
  const store = await loadStore()
  const idx = store.projects.findIndex(p => p.id === id)
  if (idx < 0) return { ok: false, error: 'Projekt nicht gefunden' }
  const prev = store.projects[idx]
  const next: InfraProject = { ...prev, ...patch, updatedAt: new Date().toISOString() }
  // Archiv-Zeitpunkt pflegen, wenn der Status auf/ von 'done' wechselt
  if (patch.status === 'done' && prev.status !== 'done') next.archivedAt = next.updatedAt
  if (patch.status && patch.status !== 'done') next.archivedAt = undefined
  store.projects[idx] = next
  const ok = await saveStore(store)
  if (!ok) return { ok: false, error: ERR_NET }
  return { ok: true, project: next }
}

export async function setStatus(id: string, status: ProjectStatus): Promise<{ ok: boolean; project?: InfraProject; error?: string }> {
  return updateProject(id, { status })
}

/** Whiteboard-Position speichern (debounced vom Screen aufgerufen). */
export async function updatePosition(id: string, x: number, y: number): Promise<boolean> {
  const store = await loadStore()
  const idx = store.projects.findIndex(p => p.id === id)
  if (idx < 0) return false
  store.projects[idx] = { ...store.projects[idx], x, y }
  return saveStore(store)
}

export async function deleteProject(id: string): Promise<{ ok: boolean; error?: string }> {
  const store = await loadStore()
  const project = store.projects.find(p => p.id === id)
  store.projects = store.projects.filter(p => p.id !== id)
  const ok = await saveStore(store)
  if (!ok) return { ok: false, error: ERR_NET }
  // Anhänge best-effort entfernen
  if (project) {
    for (const entry of project.entries) {
      for (const att of entry.attachments) {
        api().netDeleteFile(att.storedPath).catch(() => {})
      }
    }
  }
  return { ok: true }
}

// ── Entry mutations ────────────────────────────────────────────────────────────

export async function addEntry(projectId: string, data: {
  title: string
  body: string
  author: string
  attachments?: Attachment[]
}): Promise<{ ok: boolean; entry?: ProjectEntry; error?: string }> {
  const store = await loadStore()
  const idx = store.projects.findIndex(p => p.id === projectId)
  if (idx < 0) return { ok: false, error: 'Projekt nicht gefunden' }
  const entry: ProjectEntry = {
    id: newId('ent'),
    title: data.title,
    body: data.body,
    author: data.author,
    createdAt: new Date().toISOString(),
    attachments: data.attachments ?? [],
  }
  store.projects[idx].entries.push(entry)
  store.projects[idx].updatedAt = new Date().toISOString()
  const ok = await saveStore(store)
  if (!ok) return { ok: false, error: ERR_NET }
  return { ok: true, entry }
}

export async function updateEntry(projectId: string, entryId: string, patch: Partial<Pick<ProjectEntry, 'title' | 'body' | 'author'>>): Promise<{ ok: boolean; error?: string }> {
  const store = await loadStore()
  const p = store.projects.find(pr => pr.id === projectId)
  if (!p) return { ok: false, error: 'Projekt nicht gefunden' }
  const e = p.entries.find(en => en.id === entryId)
  if (!e) return { ok: false, error: 'Eintrag nicht gefunden' }
  Object.assign(e, patch)
  p.updatedAt = new Date().toISOString()
  const ok = await saveStore(store)
  if (!ok) return { ok: false, error: ERR_NET }
  return { ok: true }
}

export async function deleteEntry(projectId: string, entryId: string): Promise<{ ok: boolean; error?: string }> {
  const store = await loadStore()
  const p = store.projects.find(pr => pr.id === projectId)
  if (!p) return { ok: false, error: 'Projekt nicht gefunden' }
  const entry = p.entries.find(en => en.id === entryId)
  p.entries = p.entries.filter(en => en.id !== entryId)
  p.updatedAt = new Date().toISOString()
  const ok = await saveStore(store)
  if (!ok) return { ok: false, error: ERR_NET }
  if (entry) {
    for (const att of entry.attachments) api().netDeleteFile(att.storedPath).catch(() => {})
  }
  return { ok: true }
}

// ── Attachments ────────────────────────────────────────────────────────────────

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  txt: 'text/plain', csv: 'text/csv',
}

function extOf(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : ''
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

/**
 * Datei-Dialog öffnen, ausgewählte Dateien aufs Netzlaufwerk hochladen und
 * Attachment-Metadaten zurückgeben. Wird VOR dem Speichern eines Eintrags
 * aufgerufen (für neue Einträge: projectId + entryId vorab generieren).
 */
export async function pickAndUploadAttachments(
  projectId: string,
  entryId: string,
  uploadedBy: string,
): Promise<{ ok: boolean; attachments: Attachment[]; error?: string }> {
  const paths = await api().openFilesDialog([
    { name: 'Dokumente & Bilder', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'txt', 'csv'] },
    { name: 'Alle Dateien', extensions: ['*'] },
  ])
  if (!paths || paths.length === 0) return { ok: true, attachments: [] }

  const uploaded: Attachment[] = []
  for (const path of paths) {
    try {
      const read = await api().readFile(path)
      if (!read.success || !read.data) continue
      const filename = basename(path)
      const attId = newId('att')
      const storedPath = `${ATT_DIR}/${projectId}/${entryId}/${attId}__${sanitizeFilename(filename)}`
      const ok = await api().netWriteRawFile(storedPath, read.data)
      if (!ok) return { ok: false, attachments: uploaded, error: `Anhang "${filename}" konnte nicht gespeichert werden.` }
      const size = Math.round(read.data.length * 0.75) // base64 → bytes (approx)
      uploaded.push({
        id: attId,
        filename,
        size,
        mime: MIME_BY_EXT[extOf(filename)],
        storedPath,
        uploadedBy,
        uploadedAt: new Date().toISOString(),
      })
    } catch {
      return { ok: false, attachments: uploaded, error: 'Anhang konnte nicht gelesen werden.' }
    }
  }
  return { ok: true, attachments: uploaded }
}

/** Anhang lokal speichern (Save-As) und öffnen. */
export async function downloadAttachment(att: Attachment): Promise<{ ok: boolean; error?: string }> {
  try {
    const base64 = await api().netReadRawFile(att.storedPath)
    if (!base64) return { ok: false, error: 'Anhang nicht gefunden.' }
    const savePath = await api().saveFileDialog(att.filename, [
      { name: att.filename.split('.').pop()?.toUpperCase() || 'Datei', extensions: [extOf(att.filename) || '*'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ])
    if (!savePath) return { ok: true } // Benutzer hat abgebrochen
    const res = await api().writeFile(savePath, base64)
    if (!res.success) return { ok: false, error: res.error || 'Speichern fehlgeschlagen.' }
    api().openPath(savePath).catch(() => {})
    return { ok: true }
  } catch {
    return { ok: false, error: 'Anhang konnte nicht geladen werden.' }
  }
}

/** Rohdaten (base64) eines Anhangs holen – z. B. für Bild-Vorschau / Export. */
export async function readAttachmentBase64(att: Attachment): Promise<string | null> {
  try {
    return await api().netReadRawFile(att.storedPath)
  } catch {
    return null
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function isImageAttachment(att: Attachment): boolean {
  return (att.mime || '').startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(extOf(att.filename))
}
