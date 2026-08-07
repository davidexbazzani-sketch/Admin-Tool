// ── Zubehoer-Inventur – Datenservice ─────────────────────────────────────────
// Verwaltet eine Liste von Kleinteilen (Zubehoer) mit IST-/SOLL-Bestand und
// hinterlegtem Amazon-Bestelllink. Zentral auf dem Netzlaufwerk gespeichert,
// damit alle Admin-PCs dieselbe Liste sehen.
//
// Layout:
//   accessory-inventory/items.json   → komplette Liste (klein, < 50 KB)

import { api } from '../electronAPI'

export interface AccessoryItem {
  id: string
  name: string
  current: number      // IST-Zustand (nie durch SOLL begrenzt)
  target: number       // SOLL-Zustand
  amazonLink: string   // Bestelllink (optional)
  order: number        // Sortierreihenfolge
}

interface ItemsFile {
  version: number
  items: AccessoryItem[]
  updatedAt: string
}

const ITEMS_FILE = 'accessory-inventory/items.json'
const HISTORY_FILE = 'accessory-inventory/history.json'

function newId(): string {
  return `acc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// Startbestand: 20 Standard-Artikel mit Platzhalter-Werten (IST/SOLL = 0).
const DEFAULT_NAMES: string[] = [
  'Headset',
  'Bildschirm 27 Zoll',
  'Bildschirm 24 Zoll',
  'Kabel USB A zu USB A Verlängerung',
  'Kabel USB A zu USB C',
  'Kabel USB C zu USB C',
  'Kabel USB C zu Lightning',
  'USB A HUB',
  'Laptoptaschen Groß',
  'Laptoptaschen Klein',
  'Maus',
  'Tastatur',
  'Maus + Tastatur',
  'Kameras',
  'Netzteile 65W',
  'Netzteile 150W',
  'Netzteil 230W',
  'Rucksack',
  'Display Port Adapter',
  'Dockingstation',
]

export function makeDefaultItems(): AccessoryItem[] {
  return DEFAULT_NAMES.map((name, i) => ({
    id: `acc_default_${i + 1}`,
    name,
    current: 0,
    target: 0,
    amazonLink: '',
    order: i + 1,
  }))
}

function normalizeItem(raw: unknown, idx: number): AccessoryItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<AccessoryItem>
  if (typeof r.name !== 'string') return null
  return {
    id: typeof r.id === 'string' && r.id ? r.id : newId(),
    name: r.name,
    current: Math.max(0, Math.round(Number(r.current) || 0)),
    target: Math.max(0, Math.round(Number(r.target) || 0)),
    amazonLink: typeof r.amazonLink === 'string' ? r.amazonLink : '',
    order: Number.isFinite(Number(r.order)) ? Number(r.order) : idx + 1,
  }
}

/**
 * Liste laden. Existiert die Datei noch nicht, wird sie mit den 20 Standard-
 * Artikeln initial angelegt und zurueckgegeben.
 */
export async function loadItems(): Promise<AccessoryItem[]> {
  try {
    const data = await api().netReadJson<ItemsFile>(ITEMS_FILE)
    if (data && Array.isArray(data.items) && data.items.length > 0) {
      const items = data.items
        .map((it, i) => normalizeItem(it, i))
        .filter((it): it is AccessoryItem => it !== null)
      return sortItems(items)
    }
  } catch { /* faellt auf Default zurueck */ }
  // Erststart oder leere/kaputte Datei → Defaults anlegen
  const defaults = makeDefaultItems()
  await saveItems(defaults).catch(() => {})
  return defaults
}

export function sortItems(items: AccessoryItem[]): AccessoryItem[] {
  return [...items].sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, 'de'))
}

/** Komplette Liste zentral speichern. */
export async function saveItems(items: AccessoryItem[]): Promise<boolean> {
  const payload: ItemsFile = {
    version: 1,
    items: sortItems(items),
    updatedAt: new Date().toISOString(),
  }
  try {
    return await api().netWriteJson(ITEMS_FILE, payload)
  } catch {
    return false
  }
}

export function createItem(name: string, current: number, target: number, amazonLink: string, order: number): AccessoryItem {
  return {
    id: newId(),
    name: name.trim(),
    current: Math.max(0, Math.round(current) || 0),
    target: Math.max(0, Math.round(target) || 0),
    amazonLink: amazonLink.trim(),
    order,
  }
}

/** Bestelll-Position: nur Teile, bei denen IST < SOLL. Menge = SOLL - IST. */
export interface OrderLine {
  item: AccessoryItem
  quantity: number
}

export function computeOrderList(items: AccessoryItem[]): OrderLine[] {
  return sortItems(items)
    .filter(it => it.current < it.target)
    .map(it => ({ item: it, quantity: it.target - it.current }))
}

/** Bestellliste als strukturierten Klartext (fuer E-Mail-Body). */
export function formatOrderText(lines: OrderLine[]): string {
  if (lines.length === 0) return 'Alle Kleinteile sind ausreichend vorhanden – es muss nichts nachbestellt werden.'
  return lines
    .map(({ item, quantity }) => {
      const link = item.amazonLink.trim() || '(kein Amazon-Link hinterlegt)'
      return `${item.name} (${quantity})\n${link}`
    })
    .join('\n\n')
}

// ── Inventur-Historie ─────────────────────────────────────────────────────────

export interface AccessoryHistoryLine {
  name: string
  quantity: number
  amazonLink: string
  arrived: boolean           // manueller Haken "Angekommen" (persistent)
}

export interface AccessoryHistoryEntry {
  id: string
  timestamp: string          // ISO
  by: string                 // wer die Inventur durchgefuehrt hat
  reorderCount: number       // Anzahl nachzubestellender Positionen
  totalUnits: number         // Summe der zu bestellenden Stueck
  sentToSascha: boolean      // manueller Haken "An Sascha geschickt"
  sentToSaschaAt?: string    // ISO-Zeitstempel, wann der Haken gesetzt wurde
  lines: AccessoryHistoryLine[]
}

function normalizeHistoryEntry(raw: unknown): AccessoryHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Partial<AccessoryHistoryEntry> & { lines?: unknown }
  if (typeof e.id !== 'string') return null
  const lines = Array.isArray(e.lines)
    ? e.lines.map((l): AccessoryHistoryLine => {
        const r = (l || {}) as Partial<AccessoryHistoryLine>
        return {
          name: typeof r.name === 'string' ? r.name : '',
          quantity: Math.max(0, Math.round(Number(r.quantity) || 0)),
          amazonLink: typeof r.amazonLink === 'string' ? r.amazonLink : '',
          arrived: r.arrived === true,
        }
      })
    : []
  return {
    id: e.id,
    timestamp: typeof e.timestamp === 'string' ? e.timestamp : '',
    by: typeof e.by === 'string' && e.by ? e.by : 'unbekannt',
    reorderCount: Number.isFinite(Number(e.reorderCount)) ? Number(e.reorderCount) : lines.length,
    totalUnits: Number.isFinite(Number(e.totalUnits)) ? Number(e.totalUnits) : lines.reduce((s, l) => s + l.quantity, 0),
    sentToSascha: e.sentToSascha === true,
    sentToSaschaAt: typeof e.sentToSaschaAt === 'string' ? e.sentToSaschaAt : undefined,
    lines,
  }
}

interface HistoryFile {
  version: number
  entries: AccessoryHistoryEntry[]
}

export async function loadHistory(): Promise<AccessoryHistoryEntry[]> {
  try {
    const data = await api().netReadJson<HistoryFile>(HISTORY_FILE)
    if (data && Array.isArray(data.entries)) {
      return data.entries
        .map(normalizeHistoryEntry)
        .filter((e): e is AccessoryHistoryEntry => e !== null)
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    }
  } catch { /* leer */ }
  return []
}

async function saveHistory(entries: AccessoryHistoryEntry[]): Promise<boolean> {
  try {
    return await api().netWriteJson(HISTORY_FILE, { version: 1, entries })
  } catch {
    return false
  }
}

/** Neuen Historien-Eintrag fuer eine abgeschlossene Inventur anlegen. */
export async function addHistoryEntry(lines: OrderLine[], by: string): Promise<AccessoryHistoryEntry> {
  const entry: AccessoryHistoryEntry = {
    id: newId(),
    timestamp: new Date().toISOString(),
    by: by || 'unbekannt',
    reorderCount: lines.length,
    totalUnits: lines.reduce((sum, l) => sum + l.quantity, 0),
    sentToSascha: false,
    lines: lines.map(({ item, quantity }) => ({ name: item.name, quantity, amazonLink: item.amazonLink, arrived: false })),
  }
  const existing = await loadHistory()
  await saveHistory([entry, ...existing])
  return entry
}

/**
 * "An Sascha geschickt"-Haken eines Historien-Eintrags aktualisieren. Beim
 * Setzen wird automatisch der aktuelle Zeitstempel erfasst, beim Entfernen
 * geloescht. Gibt den aktualisierten Zeitstempel (oder undefined) zurueck.
 */
export async function setHistorySentToSascha(id: string, value: boolean): Promise<{ ok: boolean; sentToSaschaAt?: string }> {
  const at = value ? new Date().toISOString() : undefined
  const existing = await loadHistory()
  const next = existing.map(e => e.id === id ? { ...e, sentToSascha: value, sentToSaschaAt: at } : e)
  const ok = await saveHistory(next)
  return { ok, sentToSaschaAt: at }
}

/** "Angekommen"-Status eines einzelnen bestellten Artikels (Zeilenindex) setzen. */
export async function setHistoryLineArrived(id: string, lineIndex: number, value: boolean): Promise<boolean> {
  const existing = await loadHistory()
  const next = existing.map(e => {
    if (e.id !== id) return e
    const lines = e.lines.map((l, i) => i === lineIndex ? { ...l, arrived: value } : l)
    return { ...e, lines }
  })
  return saveHistory(next)
}

export async function deleteHistoryEntry(id: string): Promise<boolean> {
  const existing = await loadHistory()
  return saveHistory(existing.filter(e => e.id !== id))
}
