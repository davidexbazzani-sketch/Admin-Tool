// ── Hardware-Inventur – Datenservice ──────────────────────────────────────────
// Verwaltet Inventur-Läufe (alle 14 Tage). Jeder Lauf wird zentral auf dem
// Netzlaufwerk gespeichert, damit alle Benutzer live sehen, was bereits
// gescannt wurde und ggf. parallel weiterarbeiten können.
//
// Layout:
//   hardware-inventory/runs.json              → Index (Kurzinfos)
//   hardware-inventory/runs/<id>.json         → Vollständige Lauf-Daten

import { api } from '../electronAPI'

export type RunStatus = 'open' | 'completed' | 'archived'

export interface InventoryDevice {
  serial: string                  // normalisiert UPPERCASE, ohne Whitespace
  deviceType: string              // Laptop, Mini PC, Tower, ZBook …
  comment: string
  company: string
  status: string                  // "In Stock" o. ä.
  substate: string
  // Scan-Resultat
  scanned: boolean
  scannedAt?: string
  scannedBy?: string
  // AD-Lookup-Resultate für fehlende Geräte
  prefixesUsed?: string[]         // welche Präfixe wurden probiert
  adHostname?: string             // erster auflösbarer Hostname
  adOnline?: boolean
  adLastOnline?: string
  adCurrentUser?: string
  adCheckedAt?: string
  adNote?: string
  // Nachträglich gefunden
  lateFound?: boolean
  lateFoundAt?: string
  lateFoundBy?: string
  lateNote?: string
}

export interface ScanLogEntry {
  scannedValue: string            // Roh-Eingabe
  matched: boolean                // hat einen erwarteten Eintrag getroffen?
  invalid: boolean                // Pattern-Validierung fehlgeschlagen?
  timestamp: string
  by: string
}

export interface InventoryFieldMap {
  serial: string
  deviceType: string
  comment: string
  company: string
  status: string
  substate: string
}

export interface InventoryColumn { key: string; label: string }

export interface InventoryHistoryEntry {
  timestamp: string
  by: string
  action: string
  details?: string
}

export interface InventoryRun {
  id: string
  title: string                   // z. B. "Inventur 04.06.2026"
  importedFilename: string
  importedAt: string
  importedBy: string
  fieldMap: InventoryFieldMap
  columns: InventoryColumn[]      // alle Spalten aus Excel (für Export)
  devices: InventoryDevice[]
  /** Zusätzlich gescannte Werte, die kein erwartetes Gerät getroffen haben. */
  extras: Array<{ serial: string; scannedAt: string; scannedBy: string; reason?: string }>
  scanLog: ScanLogEntry[]
  status: RunStatus
  completedAt?: string
  completedBy?: string
  notes: string
  history: InventoryHistoryEntry[]
  updatedAt: string
}

/** Kurzinfo im Index (damit die Listenseite schnell lädt). */
export interface InventoryRunSummary {
  id: string
  title: string
  status: RunStatus
  deviceCount: number
  scannedCount: number
  missingCount: number
  extrasCount: number
  importedAt: string
  importedBy: string
  completedAt?: string
  completedBy?: string
  updatedAt: string
}

interface IndexFile { version: number; runs: InventoryRunSummary[] }

const INDEX_FILE = 'hardware-inventory/runs.json'
const RUN_FILE = (id: string) => `hardware-inventory/runs/${id}.json`
const ERR_NET = 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.'

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeSerial(s: string): string {
  return (s || '').trim().toUpperCase().replace(/\s+/g, '')
}

/**
 * Plausibilitäts-Check für Seriennummern:
 * - 8–12 Zeichen (Toleranz ±2 zu den 10-stelligen Beispielen)
 * - nur A–Z + 0–9
 * - mindestens 1 Buchstabe UND 1 Ziffer (filtert Zahlen-Müll-Codes aus)
 */
export function isValidSerialPattern(s: string): boolean {
  const x = normalizeSerial(s)
  if (x.length < 8 || x.length > 12) return false
  if (!/^[A-Z0-9]+$/.test(x)) return false
  if (!/[A-Z]/.test(x)) return false
  if (!/[0-9]/.test(x)) return false
  return true
}

/**
 * Extrahiert die Seriennummer aus einer rohen Scan-Eingabe.
 *
 * Manche Geräte tragen einen QR-/Barcode, der mehrere Werte hintereinander
 * enthält (z. B. "4QY26EA#ABD,5CD9263RVV,3y3y0y"). Wir zerlegen den Roh-Wert
 * an allen Nicht-Alphanumerischen Zeichen in Tokens und liefern den ersten
 * Token, der das Seriennummer-Pattern erfüllt. Damit lassen sich Präfixe,
 * Trennzeichen oder weitere Codes auf dem Aufkleber automatisch ignorieren.
 *
 * Liefert leeren String zurück, wenn KEIN Token das Pattern erfüllt — der
 * Aufrufer behandelt das als Falsch-Scan.
 */
export function extractSerialFromScan(raw: string): string {
  const value = (raw || '').trim()
  if (!value) return ''
  // 1) Direkter Treffer (häufigster Fall: sauberer Einzel-Scan)
  const direct = normalizeSerial(value)
  if (isValidSerialPattern(direct)) return direct
  // 2) Multi-Wert-Scan: nach Alphanumerischen Tokens suchen
  const tokens = value.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)
  for (const t of tokens) {
    if (isValidSerialPattern(t)) return t
  }
  return ''
}

// ── Index ──────────────────────────────────────────────────────────────────────
async function loadIndex(): Promise<IndexFile> {
  try {
    const d = await api().netReadJson<IndexFile>(INDEX_FILE)
    if (!d || !Array.isArray(d.runs)) return { version: 1, runs: [] }
    return d
  } catch { return { version: 1, runs: [] } }
}
async function saveIndex(s: IndexFile): Promise<boolean> {
  try { return await api().netWriteJson(INDEX_FILE, s) } catch { return false }
}

export async function listRuns(): Promise<InventoryRunSummary[]> {
  const s = await loadIndex()
  return [...s.runs].sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || ''))
}

function summarize(r: InventoryRun): InventoryRunSummary {
  const scanned = r.devices.filter(d => d.scanned).length
  const missing = r.devices.filter(d => !d.scanned).length
  return {
    id: r.id, title: r.title, status: r.status,
    deviceCount: r.devices.length, scannedCount: scanned, missingCount: missing, extrasCount: r.extras.length,
    importedAt: r.importedAt, importedBy: r.importedBy,
    completedAt: r.completedAt, completedBy: r.completedBy,
    updatedAt: r.updatedAt,
  }
}

async function updateIndexFor(run: InventoryRun): Promise<void> {
  const idx = await loadIndex()
  const i = idx.runs.findIndex(r => r.id === run.id)
  const s = summarize(run)
  if (i < 0) idx.runs.push(s); else idx.runs[i] = s
  await saveIndex(idx)
}

async function removeFromIndex(id: string): Promise<void> {
  const idx = await loadIndex()
  idx.runs = idx.runs.filter(r => r.id !== id)
  await saveIndex(idx)
}

// ── Run lesen / schreiben ──────────────────────────────────────────────────────
export async function loadRun(id: string): Promise<InventoryRun | null> {
  try { return await api().netReadJson<InventoryRun>(RUN_FILE(id)) } catch { return null }
}

async function saveRun(run: InventoryRun): Promise<boolean> {
  run.updatedAt = new Date().toISOString()
  try {
    const ok = await api().netWriteJson(RUN_FILE(run.id), run)
    if (ok) await updateIndexFor(run)
    return ok
  } catch { return false }
}

// ── Run-Operationen ────────────────────────────────────────────────────────────

export interface CreateRunInput {
  title?: string
  importedFilename: string
  importedBy: string
  fieldMap: InventoryFieldMap
  columns: InventoryColumn[]
  rows: Record<string, string>[]
}

/** Erstellt einen neuen Inventur-Lauf aus den importierten Zeilen. */
export async function createRun(input: CreateRunInput): Promise<{ ok: boolean; run?: InventoryRun; error?: string }> {
  const now = new Date().toISOString()
  const devices: InventoryDevice[] = []
  const seen = new Set<string>()
  for (const row of input.rows) {
    const serial = normalizeSerial(row[input.fieldMap.serial] || '')
    if (!serial) continue
    if (seen.has(serial)) continue
    seen.add(serial)
    devices.push({
      serial,
      deviceType: (row[input.fieldMap.deviceType] || '').trim(),
      comment: (row[input.fieldMap.comment] || '').trim(),
      company: (row[input.fieldMap.company] || '').trim(),
      status: (row[input.fieldMap.status] || '').trim(),
      substate: (row[input.fieldMap.substate] || '').trim(),
      scanned: false,
    })
  }

  const run: InventoryRun = {
    id: newId('inv'),
    title: input.title || `Inventur ${new Date().toLocaleDateString('de-DE')}`,
    importedFilename: input.importedFilename,
    importedAt: now,
    importedBy: input.importedBy,
    fieldMap: input.fieldMap,
    columns: input.columns,
    devices, extras: [], scanLog: [],
    status: 'open',
    notes: '',
    history: [{ timestamp: now, by: input.importedBy, action: 'Inventur angelegt', details: `${devices.length} Geräte aus ${input.importedFilename} importiert` }],
    updatedAt: now,
  }
  const ok = await saveRun(run)
  if (!ok) return { ok: false, error: ERR_NET }
  return { ok: true, run }
}

export async function deleteRun(id: string): Promise<boolean> {
  try {
    await api().netDeleteFile(RUN_FILE(id)).catch(() => {})
    await removeFromIndex(id)
    return true
  } catch { return false }
}

/**
 * Scan-Eingabe verarbeiten. Reload-vor-Patch verhindert Verlust paralleler
 * Änderungen anderer Benutzer. Liefert Kontext für die UI zurück.
 */
export type ScanResultKind =
  | 'matched_new'          // erwarteter Eintrag, erstmalig gescannt
  | 'matched_again'        // erwarteter Eintrag, war schon gescannt
  | 'extra'                // valides Pattern, aber nicht erwartet
  | 'invalid'              // Pattern verworfen (Falsch-Scan!)

export interface ScanOutcome {
  kind: ScanResultKind
  normalizedSerial: string
  device?: InventoryDevice
}

export async function applyScan(runId: string, rawValue: string, by: string): Promise<{ ok: boolean; outcome?: ScanOutcome; run?: InventoryRun; error?: string }> {
  const run = await loadRun(runId)
  if (!run) return { ok: false, error: 'Inventur nicht gefunden' }
  if (run.status !== 'open') return { ok: false, error: 'Diese Inventur ist abgeschlossen.' }

  const value = (rawValue || '').trim()
  const norm = extractSerialFromScan(value)
  const ts = new Date().toISOString()

  if (!norm) {
    // Aus der Eingabe ließ sich kein gültiges Seriennummer-Pattern extrahieren
    // → Falsch-Scan (Hand-Scanner-Fehler oder unerwarteter Code)
    run.scanLog.push({ scannedValue: value, matched: false, invalid: true, timestamp: ts, by })
    await saveRun(run)
    return { ok: true, run, outcome: { kind: 'invalid', normalizedSerial: '' } }
  }

  const dev = run.devices.find(d => d.serial === norm)
  if (dev) {
    if (dev.scanned) {
      run.scanLog.push({ scannedValue: value, matched: true, invalid: false, timestamp: ts, by })
      await saveRun(run)
      return { ok: true, run, outcome: { kind: 'matched_again', normalizedSerial: norm, device: dev } }
    }
    dev.scanned = true
    dev.scannedAt = ts
    dev.scannedBy = by
    run.scanLog.push({ scannedValue: value, matched: true, invalid: false, timestamp: ts, by })
    await saveRun(run)
    return { ok: true, run, outcome: { kind: 'matched_new', normalizedSerial: norm, device: dev } }
  }

  // Valides Pattern, aber nicht erwartet → Extras
  if (!run.extras.find(e => e.serial === norm)) {
    run.extras.push({ serial: norm, scannedAt: ts, scannedBy: by })
  }
  run.scanLog.push({ scannedValue: value, matched: false, invalid: false, timestamp: ts, by })
  await saveRun(run)
  return { ok: true, run, outcome: { kind: 'extra', normalizedSerial: norm } }
}

/**
 * Inventur abschließen und dabei die Begründungen für unerwartete Scans (Extras)
 * speichern. `reasons` ist eine Map Seriennummer -> Begründung.
 */
export async function completeRunWithReasons(runId: string, by: string, reasons: Record<string, string>): Promise<{ ok: boolean; run?: InventoryRun; error?: string }> {
  const run = await loadRun(runId)
  if (!run) return { ok: false, error: 'Inventur nicht gefunden' }
  for (const ex of run.extras) {
    const r = reasons[ex.serial]
    if (r !== undefined) ex.reason = r.trim()
  }
  const now = new Date().toISOString()
  run.status = 'completed'
  run.completedAt = now
  run.completedBy = by
  run.history.push({ timestamp: now, by, action: 'Inventur abgeschlossen', details: `${run.devices.filter(d => d.scanned).length}/${run.devices.length} Geräte erfasst, ${run.devices.filter(d => !d.scanned).length} fehlen, ${run.extras.length} unerwartete Scans` })
  const ok = await saveRun(run)
  if (!ok) return { ok: false, error: ERR_NET }
  return { ok: true, run }
}

/** Inventur abschließen (nach Bestätigungsdialog). */
export async function completeRun(runId: string, by: string): Promise<{ ok: boolean; run?: InventoryRun; error?: string }> {
  const run = await loadRun(runId)
  if (!run) return { ok: false, error: 'Inventur nicht gefunden' }
  const now = new Date().toISOString()
  run.status = 'completed'
  run.completedAt = now
  run.completedBy = by
  run.history.push({ timestamp: now, by, action: 'Inventur abgeschlossen', details: `${run.devices.filter(d => d.scanned).length}/${run.devices.length} Geräte erfasst, ${run.devices.filter(d => !d.scanned).length} fehlen` })
  const ok = await saveRun(run)
  if (!ok) return { ok: false, error: ERR_NET }
  return { ok: true, run }
}

/** AD-Ergebnisse für ein fehlendes Gerät speichern (oder aktualisieren). */
export async function setDeviceAdResult(runId: string, serial: string, patch: Partial<Pick<InventoryDevice,
  'prefixesUsed' | 'adHostname' | 'adOnline' | 'adLastOnline' | 'adCurrentUser' | 'adNote'>>): Promise<{ ok: boolean }> {
  const run = await loadRun(runId)
  if (!run) return { ok: false }
  const dev = run.devices.find(d => d.serial === normalizeSerial(serial))
  if (!dev) return { ok: false }
  Object.assign(dev, patch, { adCheckedAt: new Date().toISOString() })
  return { ok: await saveRun(run) }
}

/** Nachträglich gefunden – mit Zeitstempel + History-Eintrag. */
export async function markDeviceLateFound(runId: string, serial: string, by: string, note?: string): Promise<{ ok: boolean }> {
  const run = await loadRun(runId)
  if (!run) return { ok: false }
  const dev = run.devices.find(d => d.serial === normalizeSerial(serial))
  if (!dev) return { ok: false }
  const ts = new Date().toISOString()
  dev.lateFound = true
  dev.lateFoundAt = ts
  dev.lateFoundBy = by
  dev.lateNote = note || ''
  // gilt jetzt als "gescannt" für die Bilanz
  dev.scanned = true
  if (!dev.scannedAt) dev.scannedAt = ts
  if (!dev.scannedBy) dev.scannedBy = by
  run.history.push({ timestamp: ts, by, action: `Nachträglich gefunden: ${dev.serial}`, details: note })
  return { ok: await saveRun(run) }
}

/** Nachträgliche Korrektur rückgängig machen. */
export async function undoLateFound(runId: string, serial: string, by: string): Promise<{ ok: boolean }> {
  const run = await loadRun(runId)
  if (!run) return { ok: false }
  const dev = run.devices.find(d => d.serial === normalizeSerial(serial))
  if (!dev) return { ok: false }
  if (dev.lateFound) {
    dev.lateFound = false; dev.lateFoundAt = undefined; dev.lateFoundBy = undefined; dev.lateNote = undefined
    dev.scanned = false; dev.scannedAt = undefined; dev.scannedBy = undefined
    run.history.push({ timestamp: new Date().toISOString(), by, action: `Korrektur zurückgenommen: ${dev.serial}` })
    return { ok: await saveRun(run) }
  }
  return { ok: false }
}

/**
 * Einen versehentlich gescannten erwarteten Eintrag wieder als "fehlend"
 * markieren (Scan zurücknehmen). Das Gerät bleibt in der Liste, gilt aber
 * wieder als nicht erfasst.
 */
export async function unscanDevice(runId: string, serial: string, by: string): Promise<{ ok: boolean; run?: InventoryRun; error?: string }> {
  const run = await loadRun(runId)
  if (!run) return { ok: false, error: 'Inventur nicht gefunden' }
  if (run.status !== 'open') return { ok: false, error: 'Diese Inventur ist abgeschlossen.' }
  const dev = run.devices.find(d => d.serial === normalizeSerial(serial))
  if (!dev) return { ok: false, error: 'Eintrag nicht gefunden' }
  dev.scanned = false
  dev.scannedAt = undefined
  dev.scannedBy = undefined
  dev.lateFound = false
  dev.lateFoundAt = undefined
  dev.lateFoundBy = undefined
  dev.lateNote = undefined
  run.history.push({ timestamp: new Date().toISOString(), by, action: `Scan zurückgenommen: ${dev.serial}` })
  const ok = await saveRun(run)
  if (!ok) return { ok: false, error: ERR_NET }
  return { ok: true, run }
}

/**
 * Einen unerwarteten Scan (Extra) wieder aus der Liste entfernen — z. B. wenn
 * versehentlich ein falsches/fremdes Gerät gescannt wurde.
 */
export async function removeExtra(runId: string, serial: string, by: string): Promise<{ ok: boolean; run?: InventoryRun; error?: string }> {
  const run = await loadRun(runId)
  if (!run) return { ok: false, error: 'Inventur nicht gefunden' }
  if (run.status !== 'open') return { ok: false, error: 'Diese Inventur ist abgeschlossen.' }
  const norm = normalizeSerial(serial)
  const before = run.extras.length
  run.extras = run.extras.filter(e => e.serial !== norm)
  if (run.extras.length === before) return { ok: false, error: 'Eintrag nicht gefunden' }
  run.history.push({ timestamp: new Date().toISOString(), by, action: `Unerwarteten Scan entfernt: ${norm}` })
  const ok = await saveRun(run)
  if (!ok) return { ok: false, error: ERR_NET }
  return { ok: true, run }
}

/** Notizen einer Inventur aktualisieren. */
export async function updateRunNotes(runId: string, notes: string): Promise<boolean> {
  const run = await loadRun(runId)
  if (!run) return false
  run.notes = notes
  return saveRun(run)
}

/** Titel ändern. */
export async function renameRun(runId: string, title: string): Promise<boolean> {
  const run = await loadRun(runId)
  if (!run) return false
  run.title = title.trim() || run.title
  return saveRun(run)
}
