// ── Drucker-IP-Scan (täglich 15:00, Hintergrund) ─────────────────────────────
// Ermittelt für alle Drucker aus dem Inventar (Kategorie „Drucker") die IP-Adresse
// (Inventar-IP, sonst DNS-Auflösung des Druckernamens) und hinterlegt sie im
// Drucker-Dossier (master.ip) — dort, wo sie im „i"-Fenster der Standort-Übersicht
// angezeigt wird. Läuft einmal am Tag um 15:00 Uhr über den PrinterIpScanController.

import { api } from '../electronAPI'
import type { InventoryItem } from '../types/auth'
import { resolvePrinterIp } from './printerActions'
import { loadPrinterDossier, savePrinterMaster } from './printerDossier'

const IP_SCAN_SCHEDULE = 'printer_ip_scan/schedule.json'
const INVENTORY_FILE = 'inventory/inventory.json'

export interface IpScanSchedule {
  lastRunAt: string | null
  lastResult?: 'ok' | 'error' | 'running'
  lastSummary?: string
}

export async function loadIpScanSchedule(): Promise<IpScanSchedule> {
  try { const s = await api().netReadJson<IpScanSchedule>(IP_SCAN_SCHEDULE); if (s && typeof s === 'object') return s } catch { /* keins */ }
  return { lastRunAt: null }
}
export async function saveIpScanSchedule(s: IpScanSchedule): Promise<void> {
  try { await api().netWriteJson(IP_SCAN_SCHEDULE, s) } catch { /* offline — egal */ }
}

/** Letzter fälliger Tages-Slot (heute HH:MM wenn ≤ jetzt, sonst gestern HH:MM). */
export function latestDailySlot(now: Date, hour = 15, minute = 0): Date {
  const slot = new Date(now)
  slot.setHours(hour, minute, 0, 0)
  if (slot.getTime() > now.getTime()) slot.setDate(slot.getDate() - 1)
  return slot
}
export function isIpScanDue(s: IpScanSchedule, now: Date): boolean {
  const slot = latestDailySlot(now)
  if (!s.lastRunAt) return true
  return new Date(s.lastRunAt).getTime() < slot.getTime()
}

/**
 * Ermittelt die IPs aller Inventar-Drucker und schreibt sie ins Dossier (master.ip),
 * wenn dort leer oder abweichend. DNS-Auflösung nur, wenn keine Inventar-IP vorhanden.
 */
export async function runPrinterIpScan(by: string, onProgress?: (done: number, total: number) => void): Promise<{ scanned: number; updated: number }> {
  const inv = (await api().netReadJson<InventoryItem[]>(INVENTORY_FILE)) ?? []
  const printers = (Array.isArray(inv) ? inv : []).filter(i => (i.category || '').toLowerCase() === 'drucker' && i.name && i.name.trim())
  let updated = 0, done = 0
  const BATCH = 6   // WinRM/DNS im Rahmen der Performance-Regeln
  for (let i = 0; i < printers.length; i += BATCH) {
    const batch = printers.slice(i, i + BATCH)
    await Promise.all(batch.map(async p => {
      try {
        let ip = (p.ip || '').trim()
        if (!ip) ip = await resolvePrinterIp(p.name)
        if (ip) {
          const dossier = await loadPrinterDossier(p.name)
          const curIp = (dossier?.master?.ip || '').trim()
          if (ip !== curIp) {
            await savePrinterMaster(p.name, { ...(dossier?.master || {}), ip }, by)
            updated++
          }
        }
      } catch { /* nächster Drucker */ }
      done++; onProgress?.(done, printers.length)
    }))
  }
  return { scanned: printers.length, updated }
}
