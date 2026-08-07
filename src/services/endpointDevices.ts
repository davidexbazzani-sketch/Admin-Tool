// ── Endgeräte-Übersicht – Service ─────────────────────────────────────────────
// Grosse Uebersicht aller Endarbeitsgeraete (PCs/Laptops) am Standort. Wird per
// Excel-Import befuellt (Spalten werden auf sprechende deutsche Felder gemappt)
// und zentral auf dem Netzlaufwerk gespeichert -> live fuer alle App-User.
//
// Die Excel liefert nur den rohen Geraetenamen in der Spalte "Model". Der
// Model-TYP (eine von 6 Kategorien inkl. Monatskosten) wird daraus per Regeln
// abgeleitet -> siehe classifyModel().
//
// Speicher: endpoint-devices/devices.json

import { api } from '../electronAPI'

export interface EndpointDevice {
  id: string
  serial: string          // Seriennummer
  hostname: string        // PC-Name
  assignedTo: string      // Zugewiesen an
  model: string           // Model (roher Geraetename aus der Excel)
  state: string           // Status
  substate: string        // Verwendung
  comments: string        // Kommentar zum Asset
  retiredDate: string     // Leasingende
  company: string         // Unternehmen
  assetOwnership: string  // Wer bezahlt?
}

interface DevicesFile {
  version: number
  devices: EndpointDevice[]
  importedAt?: string
  importedBy?: string
  importedFilename?: string
}

const STORE_FILE = 'endpoint-devices/devices.json'

// ── Model-Typen (Kategorien) inkl. monatlicher Kosten ─────────────────────────
export const MODEL_CATEGORIES = [
  'Laptop Standard', 'Laptop light', 'Laptop Workstation',
  'Desktop Mini', 'Desktop SFF', 'Desktop Workstation',
] as const

const CATEGORY_COST: Record<string, number> = {
  'Laptop Standard': 35.64,
  'Laptop Workstation': 74.75,
  'Desktop Mini': 28.65,
  'Desktop SFF': 29.50,
  'Laptop light': 35.08,
  'Desktop Workstation': 114.74,
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s_\-./]/g, '').trim()
}

/**
 * Leitet aus dem rohen Model-Namen den Model-Typ ab. Reihenfolge wichtig
 * (Ueberschneidungen werden ueber die Prioritaet aufgeloest):
 *   x360           -> Laptop light        (auch wenn EliteBook im Namen steht)
 *   SFF            -> Desktop SFF          (auch wenn EliteDesk im Namen steht)
 *   ZBook          -> Laptop Workstation
 *   Z4             -> Desktop Workstation
 *   EliteDesk      -> Desktop Mini
 *   Elite(Book)    -> Laptop Standard
 * Kein Treffer -> '' (unbekannt, keine Kosten).
 */
export function classifyModel(model: string): string {
  const m = norm(model)
  if (!m) return ''
  if (m.includes('x360')) return 'Laptop light'
  if (m.includes('sff')) return 'Desktop SFF'
  if (m.includes('zbook')) return 'Laptop Workstation'
  if (m.includes('z4')) return 'Desktop Workstation'
  if (m.includes('elitedesk')) return 'Desktop Mini'
  if (m.includes('elite')) return 'Laptop Standard'
  return ''
}

export function formatEuro(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

/** Monatliche Kosten eines Geraets anhand seines Model-Typs (oder null). */
export function modelCost(model: string): number | null {
  const cat = classifyModel(model)
  if (!cat) return null
  const c = CATEGORY_COST[cat]
  return c === undefined ? null : c
}

/** Anzeigetext des Model-Typs: "Laptop Standard" bzw. "—" wenn unbekannt. */
export function modelTypeDisplay(model: string): string {
  return classifyModel(model) || '—'
}

// ── Laden / Speichern ─────────────────────────────────────────────────────────

function normalizeDevice(raw: unknown, idx: number): EndpointDevice {
  const r = (raw ?? {}) as Partial<EndpointDevice>
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v)).trim()
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `dev_${idx}_${str(r.serial) || str(r.hostname) || Math.random().toString(36).slice(2, 8)}`,
    serial: str(r.serial),
    hostname: str(r.hostname),
    assignedTo: str(r.assignedTo),
    model: str(r.model),
    state: str(r.state),
    substate: str(r.substate),
    comments: str(r.comments),
    retiredDate: str(r.retiredDate),
    company: str(r.company),
    assetOwnership: str(r.assetOwnership),
  }
}

export async function loadDevices(): Promise<EndpointDevice[]> {
  try {
    const data = await api().netReadJson<DevicesFile>(STORE_FILE)
    if (data && Array.isArray(data.devices)) return data.devices.map(normalizeDevice)
  } catch { /* leer */ }
  return []
}

export async function loadMeta(): Promise<{ importedAt?: string; importedBy?: string; importedFilename?: string }> {
  try {
    const data = await api().netReadJson<DevicesFile>(STORE_FILE)
    if (data) return { importedAt: data.importedAt, importedBy: data.importedBy, importedFilename: data.importedFilename }
  } catch { /* leer */ }
  return {}
}

export async function saveDevices(devices: EndpointDevice[], meta: { importedBy?: string; importedFilename?: string } = {}): Promise<boolean> {
  const prev = await loadMeta()
  const payload: DevicesFile = {
    version: 1,
    devices: devices.map(normalizeDevice),
    importedAt: meta.importedFilename ? new Date().toISOString() : prev.importedAt,
    importedBy: meta.importedBy ?? prev.importedBy,
    importedFilename: meta.importedFilename ?? prev.importedFilename,
  }
  try { return await api().netWriteJson(STORE_FILE, payload) } catch { return false }
}

// ── Excel-Import: Zeilen (Header -> Wert) auf EndpointDevice mappen ────────────

// Akzeptierte Spaltennamen je Feld (normalisiert). Exakte Treffer, damit z. B.
// "Substate" nicht mit "State" kollidiert.
const FIELD_ALIASES: Record<keyof Omit<EndpointDevice, 'id'>, string[]> = {
  serial: ['seriennummer', 'serialnumber', 'serial', 'sn'],
  hostname: ['hostname', 'pcname', 'computername', 'host', 'geraetename', 'gerätename', 'configurationitem', 'configitem', 'ci'],
  assignedTo: ['assignedto', 'zugewiesenan', 'assigned', 'benutzer'],
  model: ['model', 'modell', 'modelname', 'geraetemodell', 'gerätemodell', 'modeltype', 'modelltyp'],
  state: ['state', 'status', 'zustand'],
  substate: ['substate', 'verwendung', 'substatus', 'unterstatus'],
  comments: ['comments', 'kommentar', 'comment', 'bemerkung', 'bemerkungen', 'notiz'],
  retiredDate: ['retireddate', 'retired', 'leasingende', 'leasing', 'ausmusterung', 'retirementdate'],
  company: ['company', 'unternehmen', 'firma'],
  assetOwnership: ['assetownership', 'ownership', 'werbezahlt', 'eigentuemer', 'eigentümer', 'besitzer'],
}

// Excel-Seriennummer (Tage seit 1899-12-30) -> "TT.MM.JJJJ"
function excelSerialToDate(n: number): string | null {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null
  const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000)
  if (isNaN(d.getTime())) return null
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`
}

function cellToString(v: unknown, isDate: boolean): string {
  if (v === undefined || v === null) return ''
  if (v instanceof Date) return `${String(v.getDate()).padStart(2, '0')}.${String(v.getMonth() + 1).padStart(2, '0')}.${v.getFullYear()}`
  if (isDate && typeof v === 'number') { const s = excelSerialToDate(v); if (s) return s }
  return String(v).trim()
}

/** Mappt die Roh-Zeilen eines Excel-Sheets (Header->Wert) auf EndpointDevices. */
export function mapRowsToDevices(rows: Record<string, unknown>[]): EndpointDevice[] {
  if (rows.length === 0) return []
  const headers = Object.keys(rows[0])
  const headerToField = new Map<string, keyof Omit<EndpointDevice, 'id'>>()
  for (const h of headers) {
    const nh = norm(h)
    for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [keyof Omit<EndpointDevice, 'id'>, string[]][]) {
      if (aliases.includes(nh)) { headerToField.set(h, field); break }
    }
  }

  const out: EndpointDevice[] = []
  let idx = 0
  for (const row of rows) {
    const dev: Partial<EndpointDevice> = {}
    for (const h of headers) {
      const field = headerToField.get(h)
      if (!field) continue
      dev[field] = cellToString(row[h], field === 'retiredDate')
    }
    if (!(dev.serial || dev.hostname)) continue
    out.push(normalizeDevice(dev, idx++))
  }
  return out
}
