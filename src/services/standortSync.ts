// ── Standort-Übersicht „Computer" aus der Endgeräte-Übersicht ─────────────────
// Der ServiceNow-Import der Endgeräte-Übersicht enthält alles, was die Kategorie
// „Computer" braucht (Hostname + Zugewiesen an). Nach jedem Endgeräte-Import wird die
// Computer-Liste daher automatisch abgeglichen — ein zweiter Import entfällt:
//   • neue Geräte → angelegt
//   • nicht mehr in der Liste oder State nicht „In use" (In stock, In transit, Retired …) → entfernt
//   • Zuweisung geändert → übernommen, AD-Daten des alten Benutzers verworfen
//   • alles andere (IP/MAC/Seriennummer aus dem Geräte-Scan, Beschreibung) bleibt
// Danach werden die AD-Daten für Geräte ohne vollständige AD-Daten nachgeholt.
//
// Speicher: inventory/inventory.json (gemeinsam mit Server/Drucker/Sonstige — die
// anderen Kategorien werden nie angefasst), Protokoll inventory/computer_sync.json

import { api } from '../electronAPI'
import type { InventoryItem } from '../types/auth'
import type { EndpointDevice } from './endpointDevices'
import { batchAdLookup } from './adUserLookup'

const INVENTORY_FILE = 'inventory/inventory.json'
export const SYNC_FILE = 'inventory/computer_sync.json'
const KATEGORIE = 'Computer'

/** Arbeitsplatz-PCs: Hostname = Präfix DE/DEHAM/DESCH + Seriennummer. Server (w3149 …), Switches
 *  (skfl-sw-…) u. a. stehen auch in der ServiceNow-Liste, gehören aber nicht zu „Computer". */
export const IST_COMPUTER = /^DE/i

/** Nur Geräte im State „In use" kommen in die Computer-Liste (In stock, In transit, Retired, Missing … nicht). */
export const IST_IN_USE = /^\s*(in[\s_-]*use|in gebrauch|in verwendung)\s*$/i

export interface SyncProtokoll {
  am: string
  von: string
  quelle: string            // Dateiname des Endgeräte-Imports
  neu: number
  zuweisungGeaendert: number
  unveraendert: number
  entfernt: number
  ausgeschlossen: Record<string, number>   // State → Anzahl (nicht übernommen)
  ohneHostname: number
  keinComputer?: number    // Hostname beginnt nicht mit DE (Server, Switches …)
  ad?: { am: string; aufgeloest: number; nichtGefunden: number; offen: number }
}

export function istAdVollstaendig(i: InventoryItem): boolean {
  return !!(i.corpId?.trim() && i.department?.trim() && i.jobTitle?.trim())
}

/** Inventar frisch lesen. null = vorhanden, aber nicht lesbar → NIE schreiben (sonst wäre alles weg). */
async function leseInventar(): Promise<InventoryItem[] | null> {
  const d = await api().netReadJson<InventoryItem[]>(INVENTORY_FILE).catch(() => null)
  if (Array.isArray(d)) return d
  const da = await api().netExists(INVENTORY_FILE).catch(() => true)
  return da ? null : []
}

export async function ladeSyncProtokoll(): Promise<SyncProtokoll | null> {
  return api().netReadJson<SyncProtokoll>(SYNC_FILE).catch(() => null)
}

export async function synchronisiereComputer(devices: EndpointDevice[], von: string, quelle: string): Promise<{ ok: boolean; protokoll?: SyncProtokoll; fehler?: string }> {
  if (!devices.length) return { ok: false, fehler: 'Endgeräte-Liste ist leer — nichts abgeglichen.' }
  const inventar = await leseInventar()
  if (!inventar) return { ok: false, fehler: 'Standort-Inventar nicht lesbar — Abgleich übersprungen (nichts überschrieben).' }
  // Ohne Status-Spalte wäre nichts „In use" → die ganze Liste würde geleert. Dann lieber gar nicht abgleichen.
  if (!devices.some(d => IST_IN_USE.test(d.state || ''))) {
    return { ok: false, fehler: 'Kein Gerät mit Status „In use" im Endgeräte-Import (fehlt die Spalte „State"?) — Abgleich übersprungen, nichts geändert.' }
  }

  // Ziel: alle Endgeräte mit Hostname, die noch am Standort sind
  const ausgeschlossen: Record<string, number> = {}
  let ohneHostname = 0, keinComputer = 0
  const ziel = new Map<string, EndpointDevice>()
  for (const d of devices) {
    const h = d.hostname.trim()
    if (!h) { ohneHostname++; continue }
    if (!IST_COMPUTER.test(h)) { keinComputer++; continue }
    if (!IST_IN_USE.test(d.state || '')) { const s = d.state?.trim() || '(ohne Status)'; ausgeschlossen[s] = (ausgeschlossen[s] || 0) + 1; continue }
    ziel.set(h.toLowerCase(), d)
  }

  const andere = inventar.filter(i => i.category !== KATEGORIE)
  const bisher = new Map(inventar.filter(i => i.category === KATEGORIE).map(i => [i.name.trim().toLowerCase(), i]))
  const jetzt = new Date().toISOString()
  let neu = 0, geaendert = 0, unveraendert = 0
  const computer: InventoryItem[] = []
  let n = 0
  for (const [key, d] of ziel) {
    const alt = bisher.get(key)
    const zuweisung = d.assignedTo.trim() || undefined
    if (!alt) {
      neu++
      computer.push({
        id: `${Date.now()}-${n++}-${Math.random().toString(36).slice(2, 8)}`,
        name: d.hostname.trim(), category: KATEGORIE, addedAt: jetzt, addedBy: von,
        assignedTo: zuweisung, model: d.model || undefined, serial: d.serial || undefined,
      })
    } else if ((alt.assignedTo || '').trim().toLowerCase() !== (zuweisung || '').toLowerCase()) {
      geaendert++
      // Neue Person → AD-Daten der alten Person verwerfen, werden gleich neu geholt
      computer.push({ ...alt, assignedTo: zuweisung, corpId: undefined, department: undefined, jobTitle: undefined, manager: undefined, managerSam: undefined, adLookupAt: undefined,
        model: alt.model || d.model || undefined, serial: alt.serial || d.serial || undefined })
    } else {
      unveraendert++
      computer.push({ ...alt, model: alt.model || d.model || undefined, serial: alt.serial || d.serial || undefined })
    }
  }
  const entfernt = [...bisher.keys()].filter(k => !ziel.has(k)).length

  if (!(await api().netWriteJson(INVENTORY_FILE, [...andere, ...computer]))) {
    return { ok: false, fehler: 'Standort-Inventar konnte nicht gespeichert werden (Netzlaufwerk?).' }
  }
  const protokoll: SyncProtokoll = { am: jetzt, von, quelle, neu, zuweisungGeaendert: geaendert, unveraendert, entfernt, ausgeschlossen, ohneHostname, keinComputer }
  await api().netWriteJson(SYNC_FILE, protokoll).catch(() => false)
  return { ok: true, protokoll }
}

/**
 * AD-Daten für alle Computer mit Zuweisung, aber unvollständigen AD-Daten nachholen.
 * Schreibt gegen einen FRISCH gelesenen Stand und ändert nur die abgefragten Geräte.
 */
export async function aktualisiereAdDaten(onFortschritt?: (fertig: number, gesamt: number) => void): Promise<{ ok: boolean; aufgeloest: number; nichtGefunden: number; offen: number; fehler?: string }> {
  const vorher = await leseInventar()
  if (!vorher) return { ok: false, aufgeloest: 0, nichtGefunden: 0, offen: 0, fehler: 'Inventar nicht lesbar.' }
  const offen = vorher.filter(i => i.category === KATEGORIE && i.assignedTo?.trim() && !istAdVollstaendig(i))
  if (!offen.length) return { ok: true, aufgeloest: 0, nichtGefunden: 0, offen: 0 }

  const ergebnis = await batchAdLookup(offen.map(i => i.assignedTo!.trim()), onFortschritt)
  const inventar = await leseInventar()   // während der AD-Abfrage könnte jemand geändert haben
  if (!inventar) return { ok: false, aufgeloest: 0, nichtGefunden: 0, offen: offen.length, fehler: 'Inventar nicht lesbar.' }
  const ids = new Set(offen.map(i => i.id))
  const jetzt = new Date().toISOString()
  let aufgeloest = 0, nichtGefunden = 0
  const neu = inventar.map(i => {
    if (!ids.has(i.id) || !i.assignedTo) return i
    const r = ergebnis.get(i.assignedTo.trim())
    if (!r || !r.found) { if (r) nichtGefunden++; return i }
    aufgeloest++
    return { ...i, corpId: r.sam || i.corpId || undefined, department: r.department || i.department || undefined, jobTitle: r.title || i.jobTitle || undefined,
      manager: r.manager || i.manager || undefined, managerSam: r.managerSam || i.managerSam || undefined, adLookupAt: jetzt }
  })
  if (aufgeloest && !(await api().netWriteJson(INVENTORY_FILE, neu))) {
    return { ok: false, aufgeloest: 0, nichtGefunden, offen: offen.length, fehler: 'Inventar konnte nicht gespeichert werden.' }
  }
  const p = await ladeSyncProtokoll()
  if (p) await api().netWriteJson(SYNC_FILE, { ...p, ad: { am: jetzt, aufgeloest, nichtGefunden, offen: offen.length - aufgeloest } }).catch(() => false)
  return { ok: true, aufgeloest, nichtGefunden, offen: offen.length - aufgeloest }
}

export function protokollText(p: SyncProtokoll): string {
  const aus = Object.entries(p.ausgeschlossen).map(([s, n]) => `${n}× ${s}`).join(', ')
  return `Standort-Übersicht (Computer): ${p.neu} neu, ${p.zuweisungGeaendert} mit geänderter Zuweisung, ${p.unveraendert} unverändert, ${p.entfernt} entfernt`
    + (aus ? ` · nicht übernommen (nicht „In use"): ${aus}` : '')
    + (p.keinComputer ? ` · ${p.keinComputer} ohne DE-Präfix (Server, Switches …) nicht übernommen` : '')
    + (p.ohneHostname ? ` · ${p.ohneHostname} ohne Hostname` : '')
}
