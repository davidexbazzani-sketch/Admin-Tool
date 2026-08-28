// ── Drucker-Dossier (zentrale Druckerakte) ───────────────────────────────────
// Analog zum Geräte-Dossier (deviceDossier.ts), nur mit dem DRUCKERNAMEN als
// Schlüssel. Zu JEDEM Drucker (überall per Info-Button hinter dem Namen
// erreichbar) gehören:
//   • Stammdaten (Basis aus dem SEAL-Wizard-Seed + frei editierbare Zusatzfelder
//     wie IP, Modell, Tonerart, Druckserver, SNMP-Community …)
//   • datierte, signierte Einträge (Notizen / protokollierte Aktionen) + Dateien
// Zentral auf dem Netzlaufwerk → für alle App-User sichtbar.
//
// Speicher:
//   printer-dossiers/data/<key>.json
//   printer-dossiers/files/<key>/<id>__<name>

import { api } from '../electronAPI'
import { type DossierFile, openDeviceFile, deleteDeviceFile, formatFileSize } from './deviceDossier'

// DossierFile/openFile/deleteFile/formatFileSize sind generisch (arbeiten nur auf
// relativen Pfaden) → aus deviceDossier wiederverwenden statt duplizieren.
export type { DossierFile } from './deviceDossier'
export { formatFileSize } from './deviceDossier'
export const openPrinterFile = openDeviceFile
export const deletePrinterFile = deleteDeviceFile

export interface PrinterDossierEntry {
  id: string
  text: string
  createdAt: string
  createdBy: string
  files: DossierFile[]
  kind?: 'note' | 'action'   // 'action' = automatisch protokollierter Eingriff
  source?: string            // Herkunft (z. B. "Warteschlange", "SNMP", "Spooler")
}

/** Frei editierbares Zusatzfeld (Label + Wert). */
export interface PrinterCustomField {
  id: string
  label: string
  value: string
}

/** Frei editierbare Stammdaten (überschreiben/ergänzen den Wizard-Seed). */
export interface PrinterMasterData {
  // Überschreibungen der Seed-Basis (leer = Seed-Wert gilt)
  duplex?: string
  color?: string
  paperFormats?: string
  location?: string
  // Netzwerk / Verwaltung
  ip?: string
  mac?: string               // ausgelesene MAC-Adresse (Geräte-Scan, ARP im eigenen Subnetz)
  model?: string
  serial?: string
  assetTag?: string
  printServer?: string       // Windows-Druckserver für Warteschlangen-Aktionen (leer = lokal)
  snmpCommunity?: string     // SNMP-Read-Community (Standard "public")
  snmpWriteCommunity?: string// SNMP-Write-Community (für Geräte-Neustart)
  tonerType?: string         // Tonerart / Verbrauchsmaterial
  info?: string              // freies Notizfeld (Stammdaten)
  custom?: PrinterCustomField[]
}

export interface PrinterDossier {
  key: string
  printerName: string
  master?: PrinterMasterData
  entries: PrinterDossierEntry[]
  updatedAt?: string
  updatedBy?: string
}

const DIR = 'printer-dossiers'
const DATA = `${DIR}/data`
const FILES = `${DIR}/files`

/** Zentraler Standard-Druckserver (Warteschlangen liegen auf \\w3149\<Name>).
 *  Gilt für ALLE Drucker, sofern in den Stammdaten kein eigener Server gesetzt ist. */
export const DEFAULT_PRINT_SERVER = 'w3149'

/** Bekannte Druckserver im Unternehmen (Reihenfolge = Auflösungs-Reihenfolge:
 *  Haupt → Backup → Management). Wird für die Freigabe-Auflösung beim Verbinden
 *  und für die „Druckserver prüfen"-Diagnose genutzt. */
export const PRINT_SERVERS = [
  { host: 'w3149', role: 'Haupt-Server' },
  { host: 'w3150', role: 'Backup-Server' },
  { host: 'w3166', role: 'Management-Server (Ocon & Easyprima)' },
] as const

/** Effektiver Druckserver: Stammdaten-Override, sonst der zentrale Standard. */
export function effectivePrintServer(master?: PrinterMasterData): string {
  return (master?.printServer || '').trim() || DEFAULT_PRINT_SERVER
}

/** Druckername kanonisieren: getrimmt, Großbuchstaben (Namen enthalten keine Domain-Suffixe). */
export function canonicalPrinter(name: string): string {
  return (name || '').trim().toUpperCase()
}

/** Stabiler, dateisicherer Schlüssel je Drucker (case-insensitiv, ohne Upper→Lower-Round-Trip). */
export function printerKey(name: string): string {
  const c = (name || '').trim().toLowerCase().replace(/[\\/:*?"<>|]/g, '_').slice(0, 120)
  return c || 'unbenannt'
}
function fileSafe(s: string): string { return (s || '').replace(/[\\/:*?"<>|]/g, '_') }

export function emptyPrinterDossier(name: string): PrinterDossier {
  return { key: printerKey(name), printerName: canonicalPrinter(name), entries: [] }
}

export async function loadPrinterDossier(name: string): Promise<PrinterDossier | null> {
  try {
    const r = await api().netReadJson<PrinterDossier>(`${DATA}/${fileSafe(printerKey(name))}.json`)
    if (r && r.key) return { ...r, entries: Array.isArray(r.entries) ? r.entries : [] }
  } catch { /* noch keins */ }
  return null
}

export async function savePrinterDossier(d: PrinterDossier, updatedBy: string): Promise<boolean> {
  const payload: PrinterDossier = { ...d, updatedBy, updatedAt: new Date().toISOString() }
  try { return await api().netWriteJson(`${DATA}/${fileSafe(d.key)}.json`, payload) } catch { return false }
}

/** IP → Druckername aus allen Dossiers (master.ip). Für die Zuordnung in der
 *  VLAN-Übersicht (Drucker per IP mit dem Standort-Namen beschriften). */
export async function loadAllPrinterIps(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  try {
    const files = await api().netListDir(DATA)
    for (const f of files || []) {
      if (!/\.json$/i.test(f)) continue
      try {
        const d = await api().netReadJson<PrinterDossier>(`${DATA}/${f}`)
        const ip = (d?.master?.ip || '').trim()
        if (ip && d?.printerName) out[ip] = d.printerName
      } catch { /* nächstes */ }
    }
  } catch { /* kein Ordner */ }
  return out
}

// ── Serialisierung je Drucker ────────────────────────────────────────────────
// Alle Schreibvorgänge (Notiz/Aktion/Stammdaten) laufen als load→modify→save.
// Ohne Serialisierung würden gleichzeitige Vorgänge einander überschreiben und
// Einträge verlieren. Deshalb pro Druckerschlüssel eine Promise-Kette (async
// Mutex); jeder Schritt liest den FRISCHEN Stand.
const locks = new Map<string, Promise<unknown>>()
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  locks.set(key, next.then(() => {}, () => {}))
  return next
}

export async function addPrinterEntry(
  name: string, entry: PrinterDossierEntry, by: string,
): Promise<PrinterDossier> {
  return withLock(printerKey(name), async () => {
    const d = (await loadPrinterDossier(name)) ?? emptyPrinterDossier(name)
    d.printerName = canonicalPrinter(name)
    d.entries = [entry, ...d.entries]   // neueste zuerst
    await savePrinterDossier(d, by)
    return d
  })
}

export async function deletePrinterEntry(name: string, entryId: string, by: string): Promise<PrinterDossier> {
  return withLock(printerKey(name), async () => {
    const d = (await loadPrinterDossier(name)) ?? emptyPrinterDossier(name)
    d.entries = d.entries.filter(e => e.id !== entryId)
    await savePrinterDossier(d, by)
    return d
  })
}

/** Speichert die frei editierbaren Stammdaten (frischer Read-Modify-Write + serialisiert). */
export async function savePrinterMaster(name: string, master: PrinterMasterData, by: string): Promise<PrinterDossier> {
  return withLock(printerKey(name), async () => {
    const d = (await loadPrinterDossier(name)) ?? emptyPrinterDossier(name)
    d.printerName = canonicalPrinter(name)
    d.master = master
    await savePrinterDossier(d, by)
    return d
  })
}

/**
 * Protokolliert automatisch eine AUSGEFÜHRTE Aktion (Warteschlange leeren,
 * Neustart, Spooler …) im Drucker-Dossier. NUR für real ausgeführte Aktionen.
 * Fehler werden verschluckt (darf den Ablauf nie stören).
 */
export async function logPrinterAction(name: string, text: string, by: string, source?: string): Promise<void> {
  if (!name || !name.trim() || !text || !text.trim()) return
  try {
    const entry: PrinterDossierEntry = {
      id: 'a_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      text: text.trim(),
      createdAt: new Date().toISOString(),
      createdBy: by,
      files: [],
      kind: 'action',
      source,
    }
    await addPrinterEntry(name, entry, by)
  } catch { /* Protokollierung darf den Ablauf nie stören */ }
}

/** Wählt Dateien (alle Endungen) aus und legt sie zentral im Drucker-Ordner ab. */
export async function pickAndStorePrinterFiles(key: string, addedBy: string): Promise<DossierFile[]> {
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
    } catch { /* nächste */ }
  }
  return out
}
