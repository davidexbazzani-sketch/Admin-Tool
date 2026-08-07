// ── Access Points – Datenservice ──────────────────────────────────────────────
// Verwaltet zentrale Daten auf dem Netzlaufwerk:
//   access-points/floorplans.json   → Liste aller Pläne (Metadaten)
//   access-points/floorplans/<id>.pdf
//   access-points/markers.json      → platzierte APs (mit normierter x/y-Position)
//   access-points/inventory.json    → importiertes AP-Inventar (Excel)
//   access-points/screenshots/<markerId>/<file>.png
//
// Live für alle Benutzer: der Screen pollt diese JSONs periodisch.

import { api } from '../electronAPI'

// ── Typen ──────────────────────────────────────────────────────────────────────

export interface FloorPlan {
  id: string
  name: string                // Anzeigename (frei wählbar)
  filename: string            // Dateiname auf Share (relativ zu floorplans/)
  originalFilename: string    // Original-Dateiname beim Upload
  pageCount: number           // bei mehrseitigen PDFs
  size: number                // Bytes
  uploadedBy: string
  uploadedAt: string
  order: number
}

export interface MarkerScreenshot {
  id: string
  filename: string            // Original-Dateiname
  storedPath: string          // Pfad auf Share
  size: number
  addedBy: string
  addedAt: string
}

/** Position normiert auf Seitenbreite/Höhe (0..1) — unabhängig vom Zoom. */
export interface Marker {
  id: string
  floorplanId: string
  page: number                // 1-basiert
  x: number                   // 0..1
  y: number                   // 0..1
  name: string
  mac: string
  serial: string
  model: string
  notes: string
  /** Weitere freie Felder aus dem Inventar-Import. */
  extra: Record<string, string>
  screenshots: MarkerScreenshot[]
  inventoryItemId?: string    // Verlinkung zu einem Inventar-Eintrag
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface InventoryColumn {
  key: string                 // Originalspalte aus Excel
  label: string               // Anzeige-Label
}

/** Mapping der Standard-Felder auf Excel-Spalten (vom Benutzer gewählt). */
export interface InventoryFieldMap {
  name: string
  mac: string
  serial: string
  model: string
  location: string
}

export interface InventoryItem {
  id: string
  fields: Record<string, string>  // alle Spaltenwerte aus Excel
  placedMarkerId?: string          // gesetzt, sobald als Marker auf einem Plan
}

export interface InventoryStore {
  version: number
  uploadedFilename: string
  uploadedBy: string
  uploadedAt: string
  columns: InventoryColumn[]
  fieldMap: InventoryFieldMap
  items: InventoryItem[]
}

interface FloorPlansStore { version: number; floorplans: FloorPlan[] }
interface MarkersStore { version: number; markers: Marker[] }

const FP_INDEX = 'access-points/floorplans.json'
const FP_DIR = 'access-points/floorplans'
const MK_INDEX = 'access-points/markers.json'
const INV_INDEX = 'access-points/inventory.json'
const SCREENSHOT_DIR = 'access-points/screenshots'

const ERR_NET = 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.'

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120)
}

// ── Floor Plans ─────────────────────────────────────────────────────────────────

async function loadPlans(): Promise<FloorPlansStore> {
  try {
    const d = await api().netReadJson<FloorPlansStore>(FP_INDEX)
    if (!d || !Array.isArray(d.floorplans)) return { version: 1, floorplans: [] }
    return { version: d.version ?? 1, floorplans: d.floorplans }
  } catch { return { version: 1, floorplans: [] } }
}

async function savePlans(s: FloorPlansStore): Promise<boolean> {
  try { return await api().netWriteJson(FP_INDEX, s) } catch { return false }
}

export async function listFloorPlans(): Promise<FloorPlan[]> {
  const s = await loadPlans()
  return s.floorplans.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'de'))
}

/** Datei-Dialog öffnen, ausgewählte PDFs hochladen, Metadaten ergänzen. */
export async function uploadFloorPlans(uploadedBy: string, onProgress?: (current: number, total: number) => void): Promise<{ ok: boolean; added: number; error?: string }> {
  const paths = await api().openFilesDialog([{ name: 'PDF-Lageplan', extensions: ['pdf'] }])
  if (!paths || paths.length === 0) return { ok: true, added: 0 }

  const store = await loadPlans()
  let added = 0
  for (let i = 0; i < paths.length; i++) {
    onProgress?.(i, paths.length)
    const path = paths[i]
    try {
      const read = await api().readFile(path)
      if (!read.success || !read.data) continue
      const originalFilename = path.split(/[\\/]/).pop() || 'Lageplan.pdf'
      const id = newId('fp')
      const filename = `${id}.pdf`
      const storedPath = `${FP_DIR}/${filename}`
      const ok = await api().netWriteRawFile(storedPath, read.data)
      if (!ok) return { ok: false, added, error: `Hochladen fehlgeschlagen: ${originalFilename}` }
      const size = Math.round(read.data.length * 0.75)
      // Anzeigename = Dateiname ohne Endung, .pdf abschneiden
      const displayName = originalFilename.replace(/\.pdf$/i, '').trim()
      store.floorplans.push({
        id,
        name: displayName,
        filename,
        originalFilename,
        pageCount: 1,                        // wird beim ersten Rendern aktualisiert
        size,
        uploadedBy,
        uploadedAt: new Date().toISOString(),
        order: store.floorplans.length + 1,
      })
      added++
    } catch {
      return { ok: false, added, error: 'Lesefehler beim Hochladen.' }
    }
  }
  onProgress?.(paths.length, paths.length)
  const ok = await savePlans(store)
  if (!ok) return { ok: false, added, error: ERR_NET }
  return { ok: true, added }
}

export async function renameFloorPlan(id: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const store = await loadPlans()
  const fp = store.floorplans.find(p => p.id === id)
  if (!fp) return { ok: false, error: 'Plan nicht gefunden' }
  fp.name = name.trim()
  const ok = await savePlans(store)
  if (!ok) return { ok: false, error: ERR_NET }
  return { ok: true }
}

export async function updateFloorPlanPageCount(id: string, pageCount: number): Promise<void> {
  const store = await loadPlans()
  const fp = store.floorplans.find(p => p.id === id)
  if (!fp || fp.pageCount === pageCount) return
  fp.pageCount = pageCount
  await savePlans(store)
}

export async function reorderFloorPlans(orderedIds: string[]): Promise<boolean> {
  const store = await loadPlans()
  orderedIds.forEach((id, idx) => {
    const fp = store.floorplans.find(p => p.id === id)
    if (fp) fp.order = idx + 1
  })
  return savePlans(store)
}

export async function deleteFloorPlan(id: string): Promise<{ ok: boolean; error?: string }> {
  const store = await loadPlans()
  const fp = store.floorplans.find(p => p.id === id)
  store.floorplans = store.floorplans.filter(p => p.id !== id)
  const ok = await savePlans(store)
  if (!ok) return { ok: false, error: ERR_NET }
  if (fp) api().netDeleteFile(`${FP_DIR}/${fp.filename}`).catch(() => {})
  // zugehörige Marker entfernen
  const mks = await loadMarkers()
  const removed = mks.markers.filter(m => m.floorplanId === id)
  mks.markers = mks.markers.filter(m => m.floorplanId !== id)
  await saveMarkers(mks)
  for (const m of removed) {
    for (const sc of m.screenshots) api().netDeleteFile(sc.storedPath).catch(() => {})
  }
  return { ok: true }
}

/** PDF-Bytes (base64) eines Plans lesen. */
export async function readFloorPlanBytes(fp: FloorPlan): Promise<string | null> {
  try { return await api().netReadRawFile(`${FP_DIR}/${fp.filename}`) }
  catch { return null }
}

// ── Markers ────────────────────────────────────────────────────────────────────

async function loadMarkers(): Promise<MarkersStore> {
  try {
    const d = await api().netReadJson<MarkersStore>(MK_INDEX)
    if (!d || !Array.isArray(d.markers)) return { version: 1, markers: [] }
    return { version: d.version ?? 1, markers: d.markers.map(normalizeMarker) }
  } catch { return { version: 1, markers: [] } }
}

function normalizeMarker(m: Partial<Marker>): Marker {
  return {
    id: m.id ?? newId('mk'),
    floorplanId: m.floorplanId ?? '',
    page: typeof m.page === 'number' ? m.page : 1,
    x: typeof m.x === 'number' ? m.x : 0.5,
    y: typeof m.y === 'number' ? m.y : 0.5,
    name: m.name ?? '',
    mac: m.mac ?? '',
    serial: m.serial ?? '',
    model: m.model ?? '',
    notes: m.notes ?? '',
    extra: m.extra ?? {},
    screenshots: Array.isArray(m.screenshots) ? m.screenshots : [],
    inventoryItemId: m.inventoryItemId,
    createdBy: m.createdBy ?? '',
    createdAt: m.createdAt ?? new Date().toISOString(),
    updatedAt: m.updatedAt ?? m.createdAt ?? new Date().toISOString(),
  }
}

async function saveMarkers(s: MarkersStore): Promise<boolean> {
  try { return await api().netWriteJson(MK_INDEX, s) } catch { return false }
}

export async function listMarkers(): Promise<Marker[]> {
  const s = await loadMarkers()
  return s.markers
}

export async function createMarker(data: Omit<Marker, 'id' | 'createdAt' | 'updatedAt' | 'screenshots'> & { screenshots?: MarkerScreenshot[] }): Promise<{ ok: boolean; marker?: Marker; error?: string }> {
  const s = await loadMarkers()
  const now = new Date().toISOString()
  const m: Marker = { ...data, id: newId('mk'), screenshots: data.screenshots ?? [], createdAt: now, updatedAt: now }
  s.markers.push(m)
  const ok = await saveMarkers(s)
  if (!ok) return { ok: false, error: ERR_NET }

  // Inventory verlinken (falls aus Inventar gezogen)
  if (m.inventoryItemId) {
    const inv = await loadInventory()
    if (inv) {
      const it = inv.items.find(i => i.id === m.inventoryItemId)
      if (it) { it.placedMarkerId = m.id; await saveInventory(inv) }
    }
  }
  return { ok: true, marker: m }
}

export async function updateMarker(id: string, patch: Partial<Marker>): Promise<{ ok: boolean; marker?: Marker; error?: string }> {
  const s = await loadMarkers()
  const idx = s.markers.findIndex(m => m.id === id)
  if (idx < 0) return { ok: false, error: 'Marker nicht gefunden' }
  const next: Marker = { ...s.markers[idx], ...patch, id: s.markers[idx].id, updatedAt: new Date().toISOString() }
  s.markers[idx] = next
  const ok = await saveMarkers(s)
  if (!ok) return { ok: false, error: ERR_NET }
  return { ok: true, marker: next }
}

export async function moveMarker(id: string, x: number, y: number, page?: number, floorplanId?: string): Promise<boolean> {
  const s = await loadMarkers()
  const m = s.markers.find(x => x.id === id)
  if (!m) return false
  m.x = Math.max(0, Math.min(1, x))
  m.y = Math.max(0, Math.min(1, y))
  if (page) m.page = page
  if (floorplanId) m.floorplanId = floorplanId
  m.updatedAt = new Date().toISOString()
  return saveMarkers(s)
}

export async function deleteMarker(id: string): Promise<{ ok: boolean; error?: string }> {
  const s = await loadMarkers()
  const m = s.markers.find(x => x.id === id)
  s.markers = s.markers.filter(x => x.id !== id)
  const ok = await saveMarkers(s)
  if (!ok) return { ok: false, error: ERR_NET }
  if (m) {
    for (const sc of m.screenshots) api().netDeleteFile(sc.storedPath).catch(() => {})
    // Inventar-Link lösen
    if (m.inventoryItemId) {
      const inv = await loadInventory()
      if (inv) {
        const it = inv.items.find(i => i.id === m.inventoryItemId)
        if (it && it.placedMarkerId === m.id) { it.placedMarkerId = undefined; await saveInventory(inv) }
      }
    }
  }
  return { ok: true }
}

/** Screenshot (z. B. aus Zwischenablage) als Anhang speichern. */
export async function addMarkerScreenshot(markerId: string, pngBase64: string, filename: string, by: string): Promise<{ ok: boolean; screenshot?: MarkerScreenshot; error?: string }> {
  const id = newId('sc')
  const safe = sanitizeFilename(filename || `screenshot_${id}.png`)
  const storedPath = `${SCREENSHOT_DIR}/${markerId}/${id}__${safe}`
  const ok = await api().netWriteRawFile(storedPath, pngBase64)
  if (!ok) return { ok: false, error: 'Screenshot konnte nicht hochgeladen werden.' }
  const sc: MarkerScreenshot = {
    id, filename: safe, storedPath,
    size: Math.round(pngBase64.length * 0.75),
    addedBy: by, addedAt: new Date().toISOString(),
  }
  const s = await loadMarkers()
  const m = s.markers.find(x => x.id === markerId)
  if (m) { m.screenshots.push(sc); m.updatedAt = new Date().toISOString(); await saveMarkers(s) }
  return { ok: true, screenshot: sc }
}

export async function deleteMarkerScreenshot(markerId: string, screenshotId: string): Promise<boolean> {
  const s = await loadMarkers()
  const m = s.markers.find(x => x.id === markerId)
  if (!m) return false
  const sc = m.screenshots.find(x => x.id === screenshotId)
  m.screenshots = m.screenshots.filter(x => x.id !== screenshotId)
  m.updatedAt = new Date().toISOString()
  const ok = await saveMarkers(s)
  if (sc) api().netDeleteFile(sc.storedPath).catch(() => {})
  return ok
}

export async function readScreenshotBase64(sc: MarkerScreenshot): Promise<string | null> {
  try { return await api().netReadRawFile(sc.storedPath) } catch { return null }
}

// ── Inventory ──────────────────────────────────────────────────────────────────

export async function loadInventory(): Promise<InventoryStore | null> {
  try { return await api().netReadJson<InventoryStore>(INV_INDEX) }
  catch { return null }
}

export async function saveInventory(inv: InventoryStore): Promise<boolean> {
  try { return await api().netWriteJson(INV_INDEX, inv) }
  catch { return false }
}

export async function clearInventory(): Promise<boolean> {
  try { return await api().netDeleteFile(INV_INDEX) }
  catch { return false }
}

/** Schreibt das Inventar (nach Import + Mapping) und vergibt IDs. */
export async function setInventory(data: Omit<InventoryStore, 'version' | 'items'> & { rows: Record<string, string>[] }): Promise<{ ok: boolean; error?: string }> {
  // Bestehende Markierungen (placedMarkerId) übernehmen, sofern Name + UID/Serial gleich ist
  const prev = await loadInventory()
  const prevByKey = new Map<string, InventoryItem>()
  if (prev) {
    for (const it of prev.items) {
      const k = `${it.fields[data.fieldMap.name] || ''}|${it.fields[data.fieldMap.serial] || ''}`.toLowerCase()
      if (k.trim() !== '|' && it.placedMarkerId) prevByKey.set(k, it)
    }
  }
  const items: InventoryItem[] = data.rows.map(fields => {
    const key = `${fields[data.fieldMap.name] || ''}|${fields[data.fieldMap.serial] || ''}`.toLowerCase()
    const old = prevByKey.get(key)
    return { id: newId('ai'), fields, placedMarkerId: old?.placedMarkerId }
  })
  const next: InventoryStore = {
    version: 1,
    uploadedFilename: data.uploadedFilename,
    uploadedBy: data.uploadedBy,
    uploadedAt: data.uploadedAt,
    columns: data.columns,
    fieldMap: data.fieldMap,
    items,
  }
  const ok = await saveInventory(next)
  if (!ok) return { ok: false, error: ERR_NET }
  return { ok: true }
}

/** Default-Mapping: erratet "name", "mac", "serial", "model", "location" aus Spaltennamen. */
export function autoDetectFieldMap(columns: InventoryColumn[]): InventoryFieldMap {
  const lower = (s: string) => s.toLowerCase()
  const find = (...needles: string[]): string => {
    for (const n of needles) {
      const c = columns.find(c => lower(c.label) === n || lower(c.key) === n)
      if (c) return c.key
    }
    for (const n of needles) {
      const c = columns.find(c => lower(c.label).includes(n) || lower(c.key).includes(n))
      if (c) return c.key
    }
    return ''
  }
  return {
    name: find('name', 'ap-name', 'bezeichnung'),
    mac: find('mac', 'macaddress', 'mac-adresse', 'mac adresse'),
    serial: find('seriennummer', 'serial', 'serien-nr', 'serien nr', 's/n', 'uid'),
    model: find('modell', 'model', 'definition', 'gerätetyp', 'typ'),
    location: find('standort', 'raum', 'ort', 'location', 'gebäude'),
  }
}

// ── Helpers für Anzeige ──────────────────────────────────────────────────────────

export function formatBytes(b: number): string {
  if (!b || b < 1024) return `${b || 0} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

/** Sucht in Markern UND Inventar nach Begriff (case-insensitive). Liefert IDs. */
export interface SearchHit { markerId?: string; inventoryItemId?: string; matchField: string }

export function searchMarkers(markers: Marker[], q: string): Marker[] {
  if (!q.trim()) return markers
  const t = q.toLowerCase().trim()
  return markers.filter(m =>
    m.name.toLowerCase().includes(t) ||
    m.mac.toLowerCase().includes(t) ||
    m.serial.toLowerCase().includes(t) ||
    m.model.toLowerCase().includes(t) ||
    m.notes.toLowerCase().includes(t) ||
    Object.values(m.extra).some(v => String(v).toLowerCase().includes(t)),
  )
}

export function searchInventory(items: InventoryItem[], q: string): InventoryItem[] {
  if (!q.trim()) return items
  const t = q.toLowerCase().trim()
  return items.filter(it => Object.values(it.fields).some(v => String(v).toLowerCase().includes(t)))
}
