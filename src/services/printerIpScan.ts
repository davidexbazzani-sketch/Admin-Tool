// ── Drucker-IP-Scan (täglich 15:00, Hintergrund) ─────────────────────────────
// Hinterlegt für alle Drucker aus dem Inventar (Kategorie „Drucker") die IP-Adresse
// im Drucker-Dossier (master.ip) — dort, wo sie im „i"-Fenster der Standort-Übersicht
// angezeigt wird. Läuft einmal am Tag um 15:00 Uhr über den PrinterIpScanController.
//
// WICHTIG: Die IP aus dem Drucker-Import der ERP-Liste gilt als richtig. Sie wird
// deshalb NUR ersetzt, wenn der Drucker unter dieser Adresse nicht mehr antwortet —
// dann (und nur dann) wird per DNS eine neue gesucht. Ein erreichbarer Drucker behält
// seine eingetragene Adresse, auch wenn DNS etwas anderes sagt. Alle übrigen
// Druckerdaten (MAC, Seriennummer, Modell) rührt kein Scan mehr an, siehe deviceScan.ts.

import { api } from '../electronAPI'
import type { InventoryItem } from '../types/auth'
import { resolvePrinterIp } from './printerActions'
import { loadPrinterDossier, savePrinterMaster } from './printerDossier'
import { pingBatch } from './userPresenceScan'

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

  // Zuerst in einem Rutsch prüfen, welche der eingetragenen Adressen antworten.
  // Nur die stummen werden danach überhaupt neu aufgelöst — das spart die DNS-Abfrage
  // für den Normalfall und sorgt dafür, dass eine gültige importierte IP stehen bleibt.
  const PING_BATCH = 10
  const bekannt = [...new Set(printers.map(p => (p.ip || '').trim()).filter(Boolean))]
  const erreichbar = new Set<string>()
  for (let i = 0; i < bekannt.length; i += PING_BATCH) {
    try {
      const r = await pingBatch(bekannt.slice(i, i + PING_BATCH), 700)
      for (const ip of r.up) erreichbar.add(ip)
    } catch { /* ohne Ping-Ergebnis gilt die Adresse als unbestätigt */ }
  }

  let updated = 0, done = 0
  const BATCH = 6   // WinRM/DNS im Rahmen der Performance-Regeln
  for (let i = 0; i < printers.length; i += BATCH) {
    const batch = printers.slice(i, i + BATCH)
    await Promise.all(batch.map(async p => {
      try {
        const eingetragen = (p.ip || '').trim()
        // Antwortet der Drucker unter seiner eingetragenen Adresse, bleibt sie — auch
        // wenn DNS etwas anderes meldet. Sonst wäre die importierte IP nach einem Tag weg.
        let ip = eingetragen && erreichbar.has(eingetragen) ? eingetragen : ''
        if (!ip) ip = (await resolvePrinterIp(p.name)) || eingetragen
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
