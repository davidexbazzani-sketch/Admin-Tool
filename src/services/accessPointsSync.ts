// ── Access Points: Seriennummer + IP aus Netzwerk-Inventar-Excel abgleichen ──
// Liest eine Excel/CSV (z. B. „DEHAM Network Inventory.xlsx") und trägt zu jedem
// bereits platzierten AP-Marker die Seriennummer und IP-Adresse ein — abgeglichen
// über den NAMEN (Hostname, case-insensitiv). Nicht zuordenbare Marker/Zeilen
// werden gemeldet, nichts Neues wird angelegt.

import * as XLSX from 'xlsx'
import { api } from '../electronAPI'
import { listMarkers, bulkUpdateMarkers } from './accessPoints'

const norm = (s: string): string => (s || '').trim().toLowerCase()

export interface ApSyncResult {
  ok: boolean
  cancelled?: boolean
  error?: string
  filename?: string
  totalRows?: number
  matched?: number
  updated?: number
  serialCol?: string
  ipCol?: string
  unmatchedMarkers?: string[]   // Marker-Namen ohne passende Excel-Zeile
}

function findKey(keys: string[], res: RegExp[]): string {
  for (const re of res) { const k = keys.find(k => re.test(k.trim())); if (k) return k }
  return ''
}

export async function syncSerialIpFromExcel(): Promise<ApSyncResult> {
  const path = await api().openFileDialog([{ name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] }])
  if (!path) return { ok: true, cancelled: true }
  try {
    const r = await api().readFile(path)
    if (!r.success || !r.data) throw new Error(r.error || 'Datei konnte nicht gelesen werden.')
    const bin = atob(r.data)
    const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
    const wb = XLSX.read(u8, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }) as Record<string, unknown>[]
    if (rows.length === 0) throw new Error('Datei enthält keine Zeilen.')

    const keys = Object.keys(rows[0])
    const nameKey = findKey(keys, [/^name$/i, /host\s*name/i, /system\s*name/i, /name/i])
    const serialKey = findKey(keys, [/serial\s*number/i, /seriennummer/i, /serial/i])
    const ipKey = findKey(keys, [/ip\s*address/i, /ip-?adresse/i, /^ip$/i])
    if (!nameKey) throw new Error('Keine „Name"-Spalte in der Tabelle gefunden.')
    if (!serialKey && !ipKey) throw new Error('Weder „Serial number" noch „IP Address" gefunden.')

    // Name → { serial, ip } (letzter Treffer gewinnt)
    const map = new Map<string, { serial: string; ip: string }>()
    for (const row of rows) {
      const nm = norm(String(row[nameKey] ?? ''))
      if (!nm) continue
      const serial = String((serialKey ? row[serialKey] : '') ?? '').trim()
      const ip = String((ipKey ? row[ipKey] : '') ?? '').trim()
      map.set(nm, { serial, ip })
    }

    const markers = await listMarkers()
    const patches: { id: string; serial?: string; ip?: string }[] = []
    const unmatched: string[] = []
    let matched = 0
    for (const m of markers) {
      const hit = map.get(norm(m.name))
      if (!hit) { unmatched.push(m.name || '(unbenannt)'); continue }
      matched++
      const patch: { id: string; serial?: string; ip?: string } = { id: m.id }
      if (hit.serial) patch.serial = hit.serial
      if (hit.ip) patch.ip = hit.ip
      if (patch.serial != null || patch.ip != null) patches.push(patch)
    }

    const res = await bulkUpdateMarkers(patches)
    if (!res.ok) return { ok: false, error: res.error }
    return {
      ok: true,
      filename: path.split(/[\\/]/).pop() || '',
      totalRows: rows.length,
      matched,
      updated: res.updated,
      serialCol: serialKey || undefined,
      ipCol: ipKey || undefined,
      unmatchedMarkers: unmatched,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
