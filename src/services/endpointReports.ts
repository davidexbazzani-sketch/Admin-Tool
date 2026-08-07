// ── Endgeraete-Uebersicht: gespeicherte Berichte ──────────────────────────────
// Ein Bericht ist ein SCHNAPPSCHUSS der aktuellen Ansicht (gefilterte Geraete +
// Modus + ggf. "Zuletzt online"-Ergebnisse) mit Namen, Datum und Ersteller.
// Zentral auf dem Netzlaufwerk gespeichert -> fuer alle App-User sichtbar.
// In einem geoeffneten Bericht kann weitergearbeitet werden (Notiz, erneuter
// Scan, Mailversand) und die Aenderungen koennen wieder gespeichert werden.
//
// Speicher: endpoint-reports/<id>.json

import { api } from '../electronAPI'
import type { EndpointDevice } from './endpointDevices'
import type { LastOnlineRow } from './endpointLastOnline'

export type ReportMode = 'table' | 'multi' | 'offline'

export interface EndpointReport {
  id: string
  name: string
  createdAt: string
  createdBy: string
  updatedAt?: string
  updatedBy?: string
  mode: ReportMode
  devices: EndpointDevice[]
  note?: string
  // Kontext des Modus (zur Wiederherstellung der Ansicht)
  minDevices?: number
  onlyFlagged?: boolean
  offlineMonths?: number
  onlyOffline?: boolean
  lastOnline?: Record<string, LastOnlineRow>   // keyed by hostname (lowercase)
  scannedAt?: string
}

const DIR = 'endpoint-reports'

export function createReportId(): string {
  return 'rep_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

export async function listReports(): Promise<EndpointReport[]> {
  try {
    const files = await api().netListDir(DIR)
    const jsons = (files ?? []).filter(f => f.toLowerCase().endsWith('.json'))
    const out: EndpointReport[] = []
    for (const f of jsons) {
      try {
        const r = await api().netReadJson<EndpointReport>(`${DIR}/${f}`)
        if (r && r.id && Array.isArray(r.devices)) out.push(r)
      } catch { /* defekte Datei ueberspringen */ }
    }
    out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    return out
  } catch { return [] }
}

export async function saveReport(r: EndpointReport): Promise<boolean> {
  try { return await api().netWriteJson(`${DIR}/${r.id}.json`, r) } catch { return false }
}

export async function deleteReport(id: string): Promise<boolean> {
  try { return await api().netDeleteFile(`${DIR}/${id}.json`) } catch { return false }
}
