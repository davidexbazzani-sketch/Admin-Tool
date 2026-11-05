// ── Zubehör-Inventur (Kleinteile-Lager) – Datenservice ───────────────────────
// Lagerbestand mit IST/SOLL je Artikel, sortiert nach Kategorien (zubehoerKatalog.ts),
// Bestellliste aus allen Artikeln unter SOLL und eine Bestell-Historie.
// Zentral auf dem Netzlaufwerk, damit alle Admin-PCs dieselbe Liste sehen:
//   accessory-inventory/items.json    → { version: 2, items, katalogAufgenommen, updatedAt }
//   accessory-inventory/history.json  → { version: 1, entries }   (Bestellungen)
//
// Schreiben IMMER als „lesen → Änderung anwenden → schreiben" (aendereLager), damit zwei
// Admins, die gleichzeitig zählen, sich nicht gegenseitig die Werte überschreiben.
// Netzlaufwerk über die asynchronen IPC-Wege (blockieren das Fenster nicht).

import { api } from '../electronAPI'
import { KATALOG, findeKatalog, rateKategorie, kategorieIndex, katalogPosition, normName } from './zubehoerKatalog'

export interface AccessoryItem {
  id: string
  name: string
  kategorie: string
  katalogId?: string
  current: number          // IST (nie durch SOLL begrenzt)
  target: number           // SOLL
  amazonLink: string       // Bestelllink (optional)
  notiz?: string           // z. B. Modell, Lagerort
  gezaehltAm?: string      // ISO — wann der IST zuletzt erfasst wurde; fehlt = noch nie gezählt
  gezaehltVon?: string
  order: number            // nur noch Altbestand; sortiert wird nach Kategorie/Katalog/Name
}

interface LagerDatei {
  version: number
  items: AccessoryItem[]
  katalogAufgenommen?: string[]   // Katalog-Artikel, die schon einmal angelegt wurden (gelöscht = bleibt weg)
  updatedAt: string
  updatedBy?: string
}

const ITEMS_DIR = 'accessory-inventory'
const ITEMS_FILE = `${ITEMS_DIR}/items.json`
const HISTORY_FILE = `${ITEMS_DIR}/history.json`

function newId(): string {
  return `acc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
const ganz = (v: unknown) => Math.max(0, Math.round(Number(v) || 0))

function normalizeItem(raw: unknown, idx: number, gezaehltFallback?: string): AccessoryItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<AccessoryItem>
  if (typeof r.name !== 'string' || !r.name.trim()) return null
  const kat = typeof r.katalogId === 'string' && KATALOG.some(k => k.id === r.katalogId) ? KATALOG.find(k => k.id === r.katalogId) : findeKatalog(r.name)
  return {
    id: typeof r.id === 'string' && r.id ? r.id : newId(),
    name: r.name.trim(),
    kategorie: typeof r.kategorie === 'string' && r.kategorie ? r.kategorie : (kat?.kategorie ?? rateKategorie(r.name)),
    katalogId: kat?.id,
    current: ganz(r.current),
    target: ganz(r.target),
    amazonLink: typeof r.amazonLink === 'string' ? r.amazonLink.trim() : '',
    notiz: typeof r.notiz === 'string' && r.notiz.trim() ? r.notiz.trim() : undefined,
    gezaehltAm: typeof r.gezaehltAm === 'string' ? r.gezaehltAm : gezaehltFallback,
    gezaehltVon: typeof r.gezaehltVon === 'string' ? r.gezaehltVon : undefined,
    order: Number.isFinite(Number(r.order)) ? Number(r.order) : idx + 1,
  }
}

/** Kategorie → Katalog-Reihenfolge → Name (Zahlen natürlich: 24 vor 27). */
export function sortItems(items: AccessoryItem[]): AccessoryItem[] {
  return [...items].sort((a, b) =>
    (kategorieIndex(a.kategorie) - kategorieIndex(b.kategorie))
    || (katalogPosition(a.katalogId) - katalogPosition(b.katalogId))
    || a.name.localeCompare(b.name, 'de', { numeric: true, sensitivity: 'base' }))
}

/**
 * Altbestand übernehmen und fehlende Katalog-Artikel ergänzen. Rein rechnend.
 * Altbestand (Version 1) gilt als gezählt (Stand der Datei); neue Katalog-Artikel
 * kommen mit IST 0 und „nicht gezählt" — so landen sie erst in einer Bestellung,
 * wenn jemand wirklich nachgesehen hat.
 */
export function bereiteLagerAuf(datei: Partial<LagerDatei> | null, jetzt = new Date().toISOString()): { datei: LagerDatei; geaendert: boolean; neuAufgenommen: string[] } {
  const alt = !!datei && !(Number(datei.version) >= 2)
  const fallback = alt ? (datei?.updatedAt || jetzt) : undefined
  const items = (Array.isArray(datei?.items) ? datei!.items : [])
    .map((it, i) => normalizeItem(it, i, fallback))
    .filter((it): it is AccessoryItem => it !== null)
  const aufgenommen = new Set(Array.isArray(datei?.katalogAufgenommen) ? datei!.katalogAufgenommen : [])
  // Was schon da ist, zählt als aufgenommen (auch wenn es anders heißt)
  for (const it of items) if (it.katalogId) aufgenommen.add(it.katalogId)
  const neu: string[] = []
  for (const k of KATALOG) {
    if (aufgenommen.has(k.id)) continue
    aufgenommen.add(k.id)
    if (items.some(it => normName(it.name) === normName(k.name))) continue
    items.push({ id: newId(), name: k.name, kategorie: k.kategorie, katalogId: k.id, current: 0, target: k.soll, amazonLink: '', order: 0 })
    neu.push(k.name)
  }
  const geaendert = alt || neu.length > 0 || !Array.isArray(datei?.katalogAufgenommen)
  return {
    datei: { version: 2, items: sortItems(items), katalogAufgenommen: [...aufgenommen], updatedAt: datei?.updatedAt || jetzt, updatedBy: datei?.updatedBy },
    geaendert, neuAufgenommen: neu,
  }
}

/** Datei lesen. Fehlt sie wirklich → null; Netzlaufwerk nicht lesbar → Fehler (nie mit Vorlage überschreiben). */
async function leseDatei(): Promise<Partial<LagerDatei> | null> {
  const d = await api().netReadJsonAsync<Partial<LagerDatei>>(ITEMS_FILE)
  if (d) return d
  const liste = await api().netListDirAsync(ITEMS_DIR).catch(() => [] as string[])
  if (liste.some(n => n.toLowerCase() === 'items.json')) throw new Error('Die Lagerliste auf dem Netzlaufwerk konnte nicht gelesen werden — bitte gleich erneut versuchen.')
  return null
}

async function schreibeDatei(d: LagerDatei, von?: string): Promise<void> {
  const ok = await api().netWriteJsonAsync(ITEMS_FILE, { ...d, items: sortItems(d.items), updatedAt: new Date().toISOString(), updatedBy: von || d.updatedBy })
  if (!ok) throw new Error('Speichern fehlgeschlagen — Netzlaufwerk erreichbar?')
}

export interface Lager { items: AccessoryItem[]; neuAufgenommen: string[]; updatedAt?: string; updatedBy?: string }

/** Lager laden (legt beim ersten Mal den Katalog an, übernimmt die alte Liste). */
export async function ladeLager(von?: string): Promise<Lager> {
  const roh = await leseDatei()
  const { datei, geaendert, neuAufgenommen } = bereiteLagerAuf(roh)
  if (geaendert) await schreibeDatei(datei, von)
  return { items: datei.items, neuAufgenommen, updatedAt: datei.updatedAt, updatedBy: datei.updatedBy }
}

/** Für die Wissens-Sicherung (Anzahl der Artikel) — liest nur, schreibt nie. */
export async function loadItems(): Promise<AccessoryItem[]> {
  return bereiteLagerAuf(await leseDatei()).datei.items
}

/** Lesen → ändern → schreiben. Liefert die gespeicherte, sortierte Liste. */
export async function aendereLager(fn: (items: AccessoryItem[]) => AccessoryItem[], von?: string): Promise<AccessoryItem[]> {
  const { datei } = bereiteLagerAuf(await leseDatei())
  const neu = fn(datei.items.map(it => ({ ...it })))
  const gespeichert = { ...datei, items: sortItems(neu) }
  await schreibeDatei(gespeichert, von)
  return gespeichert.items
}

export type ArtikelPatch = Partial<Pick<AccessoryItem, 'name' | 'kategorie' | 'current' | 'target' | 'amazonLink' | 'notiz' | 'gezaehltAm' | 'gezaehltVon'>>

/** Mehrere Artikel auf einmal ändern (nur die übergebenen Felder — andere Werte anderer Admins bleiben). */
export function patchesAnwenden(items: AccessoryItem[], patches: Map<string, ArtikelPatch>): AccessoryItem[] {
  return items.map(it => {
    const p = patches.get(it.id)
    if (!p) return it
    const n: AccessoryItem = { ...it, ...p }
    if (p.name !== undefined) { const k = findeKatalog(n.name); n.katalogId = it.katalogId ?? k?.id }
    n.current = ganz(n.current); n.target = ganz(n.target)
    n.amazonLink = (n.amazonLink || '').trim()
    n.notiz = n.notiz?.trim() || undefined
    return n
  })
}

export function neuerArtikel(x: { name: string; kategorie?: string; current?: number | null; target?: number; amazonLink?: string; notiz?: string; von?: string }): AccessoryItem {
  const k = findeKatalog(x.name)
  const gezaehlt = x.current != null
  return {
    id: newId(), name: x.name.trim(), kategorie: x.kategorie || k?.kategorie || rateKategorie(x.name), katalogId: k?.id,
    current: ganz(x.current ?? 0), target: ganz(x.target ?? 0), amazonLink: (x.amazonLink || '').trim(), notiz: x.notiz?.trim() || undefined,
    gezaehltAm: gezaehlt ? new Date().toISOString() : undefined, gezaehltVon: gezaehlt ? x.von : undefined, order: 0,
  }
}

// ── Bestellung ────────────────────────────────────────────────────────────────

export interface BestellPosition {
  key: string
  itemId?: string          // Artikel aus dem Lager (für „Angekommen → einbuchen")
  name: string
  menge: number
  link: string
  kategorie?: string
  manuell?: boolean        // von Hand ergänzt
  aufnehmen?: boolean      // manuell: auch dauerhaft ins Lager übernehmen
}

/** Unterwegs = gesendete Bestellungen, deren Position noch nicht angekommen ist (je Artikel). */
export function unterwegsJeArtikel(history: AccessoryHistoryEntry[]): Map<string, { menge: number; seit: string }> {
  const m = new Map<string, { menge: number; seit: string }>()
  for (const e of history) {
    if (!e.sentToSascha) continue
    for (const l of e.lines) {
      if (!l.itemId || l.arrived) continue
      const v = m.get(l.itemId)
      m.set(l.itemId, { menge: (v?.menge ?? 0) + l.quantity, seit: v && v.seit < e.timestamp ? v.seit : e.timestamp })
    }
  }
  return m
}

export interface BestellVorschlag {
  positionen: BestellPosition[]                                  // Menge = SOLL − IST − unterwegs
  nichtGezaehlt: AccessoryItem[]                                 // unter SOLL, aber nie gezählt → nicht automatisch
  unterwegsGedeckt: { item: AccessoryItem; unterwegs: number }[] // Fehlmenge ist schon bestellt
}

export function bestellVorschlag(items: AccessoryItem[], history: AccessoryHistoryEntry[] = []): BestellVorschlag {
  const unterwegs = unterwegsJeArtikel(history)
  const v: BestellVorschlag = { positionen: [], nichtGezaehlt: [], unterwegsGedeckt: [] }
  for (const it of sortItems(items)) {
    if (it.current >= it.target) continue
    if (!it.gezaehltAm) { v.nichtGezaehlt.push(it); continue }
    const u = unterwegs.get(it.id)?.menge ?? 0
    const menge = it.target - it.current - u
    if (menge <= 0) { v.unterwegsGedeckt.push({ item: it, unterwegs: u }); continue }
    v.positionen.push({ key: it.id, itemId: it.id, name: it.name, menge, link: it.amazonLink, kategorie: it.kategorie })
  }
  return v
}

// ── Bestell-Historie ──────────────────────────────────────────────────────────

export interface AccessoryHistoryLine {
  name: string
  quantity: number
  amazonLink: string
  arrived: boolean           // „Angekommen"
  itemId?: string            // Lager-Artikel (fehlt bei alten Einträgen und freien Positionen)
  gebucht?: number           // beim Angekommen-Haken in den Bestand gebuchte Menge
  arrivedAt?: string
}

export interface AccessoryHistoryEntry {
  id: string
  timestamp: string          // ISO
  by: string
  reorderCount: number
  totalUnits: number
  sentToSascha: boolean      // gesendet (direkt) bzw. nach dem Öffnen in Outlook abgehakt
  sentToSaschaAt?: string
  art?: 'gesendet' | 'outlook' | 'inventur'   // fehlt = alter Inventur-Eintrag
  an?: string
  cc?: string
  anmerkung?: string
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
          quantity: ganz(r.quantity),
          amazonLink: typeof r.amazonLink === 'string' ? r.amazonLink : '',
          arrived: r.arrived === true,
          itemId: typeof r.itemId === 'string' ? r.itemId : undefined,
          gebucht: Number(r.gebucht) > 0 ? ganz(r.gebucht) : undefined,
          arrivedAt: typeof r.arrivedAt === 'string' ? r.arrivedAt : undefined,
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
    art: e.art === 'gesendet' || e.art === 'outlook' ? e.art : 'inventur',
    an: typeof e.an === 'string' ? e.an : undefined,
    cc: typeof e.cc === 'string' ? e.cc : undefined,
    anmerkung: typeof e.anmerkung === 'string' && e.anmerkung ? e.anmerkung : undefined,
    lines,
  }
}

interface HistoryFile { version: number; entries: AccessoryHistoryEntry[] }

export async function loadHistory(): Promise<AccessoryHistoryEntry[]> {
  const data = await api().netReadJsonAsync<HistoryFile>(HISTORY_FILE).catch(() => null)
  if (!data || !Array.isArray(data.entries)) return []
  return data.entries
    .map(normalizeHistoryEntry)
    .filter((e): e is AccessoryHistoryEntry => e !== null)
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
}

async function aendereHistorie(fn: (e: AccessoryHistoryEntry[]) => AccessoryHistoryEntry[]): Promise<AccessoryHistoryEntry[]> {
  const neu = fn(await loadHistory())
  const ok = await api().netWriteJsonAsync(HISTORY_FILE, { version: 1, entries: neu })
  if (!ok) throw new Error('Bestell-Historie konnte nicht gespeichert werden.')
  return neu
}

/** Bestellung festhalten (nach „Senden" bzw. „In Outlook öffnen"). */
export async function bestellungFesthalten(x: { positionen: BestellPosition[]; by: string; art: 'gesendet' | 'outlook'; an: string; cc: string; anmerkung?: string }): Promise<AccessoryHistoryEntry> {
  const jetzt = new Date().toISOString()
  const entry: AccessoryHistoryEntry = {
    id: newId(), timestamp: jetzt, by: x.by || 'unbekannt',
    reorderCount: x.positionen.length, totalUnits: x.positionen.reduce((s, p) => s + p.menge, 0),
    sentToSascha: x.art === 'gesendet', sentToSaschaAt: x.art === 'gesendet' ? jetzt : undefined,
    art: x.art, an: x.an, cc: x.cc, anmerkung: x.anmerkung?.trim() || undefined,
    lines: x.positionen.map(p => ({ name: p.name, quantity: p.menge, amazonLink: p.link, arrived: false, itemId: p.itemId })),
  }
  await aendereHistorie(list => [entry, ...list])
  return entry
}

/** Haken „gesendet" (für in Outlook geöffnete Bestellungen). */
export async function setHistorySentToSascha(id: string, value: boolean): Promise<AccessoryHistoryEntry[]> {
  const at = value ? new Date().toISOString() : undefined
  return aendereHistorie(list => list.map(e => e.id === id ? { ...e, sentToSascha: value, sentToSaschaAt: at } : e))
}

/**
 * „Angekommen" setzen/entfernen. Bei Lager-Artikeln wird die Menge dabei in den
 * Bestand gebucht (bzw. wieder ausgebucht) — beim Entfernen genau die gebuchte Menge.
 */
export async function setHistoryLineArrived(id: string, lineIndex: number, value: boolean, von: string): Promise<{ history: AccessoryHistoryEntry[]; items?: AccessoryItem[]; gebucht: number }> {
  const vorher = (await loadHistory()).find(e => e.id === id)?.lines[lineIndex]
  if (!vorher || vorher.arrived === value) return { history: await loadHistory(), gebucht: 0 }
  let items: AccessoryItem[] | undefined
  let gebucht = 0
  if (vorher.itemId) {
    const delta = value ? vorher.quantity : -(vorher.gebucht ?? 0)
    if (delta !== 0) {
      const treffer = { ja: false }
      items = await aendereLager(list => list.map(it => {
        if (it.id !== vorher.itemId) return it
        treffer.ja = true
        return { ...it, current: Math.max(0, it.current + delta), gezaehltAm: new Date().toISOString(), gezaehltVon: von }
      }), von)
      if (treffer.ja) gebucht = delta
    }
  }
  const history = await aendereHistorie(list => list.map(e => e.id !== id ? e : {
    ...e,
    lines: e.lines.map((l, i) => i !== lineIndex ? l : {
      ...l, arrived: value,
      gebucht: value ? (gebucht > 0 ? gebucht : undefined) : undefined,
      arrivedAt: value ? new Date().toISOString() : undefined,
    }),
  }))
  return { history, items, gebucht }
}

export async function deleteHistoryEntry(id: string): Promise<AccessoryHistoryEntry[]> {
  return aendereHistorie(list => list.filter(e => e.id !== id))
}
