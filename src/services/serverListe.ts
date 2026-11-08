// ── Serverliste (SKFM Server List): Anwendungen, Umgebung, Zuständige je Server ──
// Quelle ist die Excel-Liste „SKFM_Server_List_<Datum>.xlsx" (Spalten Alias, Titel, Server
// Name, Environment, Server Typ, Zuständig, Kommentare, Location, ID). Eine Zeile = eine
// ANWENDUNG; ein Server kommt mehrfach vor (W3143: Solidworks, SolidCAM, PortaX, AutoCAD).
// Hier wird je Server zusammengefasst.
//
// Ablage: config/servers/serverliste.json (zentral, für alle Admins). Zusätzlich ist der
// Stand vom 05.11.2026 im Programm eingebaut (resources/Serverliste/, NICHT in Git) — so
// stehen die Infos sofort hinter dem „i", auch bevor jemand importiert hat. Es gilt immer
// die NEUERE der beiden (Datum der Liste).
//
// Gelöschte/Offline-Einträge bleiben sichtbar (Steckbrief), werden aber nie als neue
// Server in Standort-Übersicht oder Server-Kacheln übernommen.

import * as XLSX from 'xlsx'
import { api } from '../electronAPI'
import type { InventoryItem } from '../types/auth'
import type { ServerTile } from './serverMonitor'

export const SERVERLISTE_PFAD = 'config/servers/serverliste.json'
const INVENTAR_PFAD = 'inventory/inventory.json'

export type ServerZustand = 'aktiv' | 'offline' | 'geloescht'

export interface ServerAnwendung {
  titel: string
  alias: string
  umgebung: string[]
  typ: string[]
  zustaendig: string[]
  kommentar: string
  /** Location-Spalte so, wie sie in der Liste steht (HCI, AZURE FRA, Offline, gelöscht …) */
  location: string
  zustand: ServerZustand
  listenId?: number
  /** Servername genau wie in der Liste (z. B. „w3164.corp.skf.net", „\\W3172") */
  nameInListe: string
}

export interface ServerEintrag {
  /** Schlüssel: Hostname groß, ohne Domäne/Backslashes (W3164) */
  host: string
  /** echter Hostname (für Standort/Kacheln verwendbar)? „W3367 CLONE" ist keiner */
  gueltigerHost: boolean
  zustand: ServerZustand
  /** Plattform: HCI, Azure FRA, Azure … (aus aktiven Zeilen) */
  plattform: string
  anwendungen: ServerAnwendung[]
  umgebungen: string[]
  typen: string[]
  zustaendig: string[]
  aliase: string[]
}

export interface ServerListe {
  version: 1
  /** Datum der Liste (aus dem Dateinamen), YYYY-MM-DD */
  stand: string
  quelle: string
  importiertAm?: string
  importiertVon?: string
  server: ServerEintrag[]
  zeilen: number
}

/** „2026-11-05" → „05.11.2026" (fest, unabhängig von der Spracheinstellung) */
export function standText(stand?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(stand || '')
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (stand || '')
}

// ── Normalisieren ────────────────────────────────────────────────────────────
const s = (v: unknown) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim()
const eindeutig = (a: string[]) => { const seen = new Set<string>(); return a.filter(x => { const k = x.toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true }) }

/** „\\W3172", „w3164.corp.skf.net", „vm0118" → W3172 / W3164 / VM0118 */
export function normHost(raw: string): string {
  return s(raw).replace(/^\\+/, '').replace(/\.(corp\.)?skf\.net$/i, '').replace(/\.bvi\.local$/i, '').toUpperCase()
}
/** NetBIOS-tauglich (W3172, X0366, VM0118) — „W3367 CLONE" oder „W3366_CLONE" nicht */
export const istHostname = (h: string) => /^[A-Z0-9][A-Z0-9-]{1,14}$/.test(h)

export function zustandAus(location: string): ServerZustand {
  const l = s(location).toLowerCase()
  if (/gel(ö|oe)scht|deleted/.test(l)) return 'geloescht'
  if (/offline/.test(l)) return 'offline'
  return 'aktiv'
}
/** Anzeige der Plattform: „AZURE FRA" → „Azure FRA", „Offline"/„gelöscht" → '' */
export function plattformAus(location: string): string {
  const l = s(location)
  if (!l || zustandAus(l) !== 'aktiv') return ''
  if (/^azure/i.test(l)) { const rest = l.slice(5).trim(); return rest ? `Azure ${rest.toUpperCase()}` : 'Azure' }
  return l.length <= 4 ? l.toUpperCase() : l
}

const UMGEBUNG_REIHENFOLGE = ['produktiv', 'prod & non-prod', 'test', 'entwicklung']
const sortUmgebung = (a: string[]) => [...a].sort((x, y) => {
  const i = UMGEBUNG_REIHENFOLGE.indexOf(x.toLowerCase()), j = UMGEBUNG_REIHENFOLGE.indexOf(y.toLowerCase())
  return (i < 0 ? 99 : i) - (j < 0 ? 99 : j)
})

// Spalten über die Kopfzeile finden (Reihenfolge egal)
const SPALTEN: Record<string, RegExp> = {
  alias: /^alias$/i,
  titel: /^(titel|title|anwendung|application)$/i,
  name: /^(server ?name|server|hostname|name)$/i,
  umgebung: /^(environment|umgebung)$/i,
  typ: /^(server ?typ|server ?type|typ)$/i,
  zustaendig: /^(zust(ä|ae)ndig|verantwortlich|owner|ansprechpartner)$/i,
  kommentar: /^(kommentare?|comments?|bemerkung(en)?|notiz)$/i,
  location: /^(location|standort|plattform)$/i,
  id: /^id$/i,
}

/**
 * Zeilen (erste Zeile mit „Server Name" = Kopf) → Serverliste. Rein, ohne Netzzugriff.
 * Wirft nichts — Probleme stehen in `fehler`.
 */
export function parseServerListe(zeilen: unknown[][], quelle: string, stand?: string): { liste?: ServerListe; fehler?: string } {
  const kopfIdx = zeilen.slice(0, 10).findIndex(r => Array.isArray(r) && r.some(c => SPALTEN.name.test(s(c))))
  if (kopfIdx < 0) return { fehler: 'Keine Kopfzeile mit „Server Name" gefunden — ist das die SKFM-Serverliste?' }
  const kopf = zeilen[kopfIdx].map(c => s(c))
  const col: Record<string, number> = {}
  for (const [k, re] of Object.entries(SPALTEN)) col[k] = kopf.findIndex(h => re.test(h))
  if (col.name < 0) return { fehler: 'Spalte „Server Name" fehlt.' }

  const je = new Map<string, ServerAnwendung[]>()
  let anzahl = 0
  for (const r of zeilen.slice(kopfIdx + 1)) {
    if (!Array.isArray(r)) continue
    const zelle = (k: string) => (col[k] >= 0 ? s(r[col[k]]) : '')
    const roh = zelle('name')
    const host = normHost(roh)
    if (!host) continue
    anzahl++
    const location = zelle('location')
    const idText = zelle('id')
    const a: ServerAnwendung = {
      titel: zelle('titel'),
      alias: /^n\.?\s*n\.?$/i.test(zelle('alias')) ? '' : zelle('alias'),
      umgebung: eindeutig(zelle('umgebung').split(/\s*,\s*/)),
      typ: eindeutig(zelle('typ').split(/\s*,\s*/)),
      zustaendig: eindeutig(zelle('zustaendig').split(/\s*;\s*/)),
      kommentar: zelle('kommentar'),
      location,
      zustand: zustandAus(location),
      listenId: idText && /^\d+$/.test(idText) ? Number(idText) : undefined,
      nameInListe: roh,
    }
    if (!je.has(host)) je.set(host, [])
    je.get(host)!.push(a)
  }

  const server: ServerEintrag[] = []
  for (const [host, apps] of je) {
    apps.sort((x, y) => (x.listenId ?? 1e9) - (y.listenId ?? 1e9))
    const aktiv = apps.filter(a => a.zustand === 'aktiv')
    const zustand: ServerZustand = aktiv.length ? 'aktiv' : apps.some(a => a.zustand === 'offline') ? 'offline' : 'geloescht'
    const basis = aktiv.length ? aktiv : apps
    // Plattform = häufigste Location der aktiven Zeilen
    const zaehl = new Map<string, number>()
    for (const a of basis) { const p = plattformAus(a.location); if (p) zaehl.set(p, (zaehl.get(p) || 0) + 1) }
    const plattform = [...zaehl.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || ''
    server.push({
      host, gueltigerHost: istHostname(host), zustand, plattform,
      anwendungen: apps,
      umgebungen: sortUmgebung(eindeutig(basis.flatMap(a => a.umgebung))),
      typen: eindeutig(basis.flatMap(a => a.typ)),
      zustaendig: eindeutig(basis.flatMap(a => a.zustaendig)),
      aliase: eindeutig(basis.map(a => a.alias)),
    })
  }
  server.sort((a, b) => a.host.localeCompare(b.host, 'de', { numeric: true }))
  const datum = stand || (/(\d{4}-\d{2}-\d{2})/.exec(quelle) || [])[1] || new Date().toISOString().slice(0, 10)
  return { liste: { version: 1, stand: datum, quelle, server, zeilen: anzahl } }
}

/** Excel-Datei (Base64 aus api().readFile) → Serverliste. */
export function parseServerListeExcel(base64: string, dateiname: string): { liste?: ServerListe; fehler?: string } {
  try {
    const wb = XLSX.read(base64, { type: 'base64' })
    // Blatt mit der Kopfzeile nehmen (meist das erste)
    for (const n of wb.SheetNames) {
      const zeilen = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: '', raw: true })
      const r = parseServerListe(zeilen, dateiname)
      if (r.liste) return r
    }
    return { fehler: 'In keinem Tabellenblatt eine Serverliste (Spalte „Server Name") gefunden.' }
  } catch (e) {
    return { fehler: 'Excel-Datei nicht lesbar: ' + (e instanceof Error ? e.message : String(e)) }
  }
}

// ── Eingebauter Stand (resources/Serverliste/*.json, beim Build eingebunden) ──
interface SeedDatei { quelle: string; stand: string; zeilen: unknown[][] }
const seeds = import.meta.glob('../../resources/Serverliste/*.json', { eager: true, import: 'default' }) as Record<string, SeedDatei>
let eingebautCache: ServerListe | null | undefined
export function eingebauteListe(): ServerListe | null {
  if (eingebautCache !== undefined) return eingebautCache
  const neueste = Object.values(seeds).filter(d => d && Array.isArray(d.zeilen)).sort((a, b) => (b.stand || '').localeCompare(a.stand || ''))[0]
  eingebautCache = neueste ? (parseServerListe(neueste.zeilen, neueste.quelle, neueste.stand).liste ?? null) : null
  return eingebautCache
}

/** Welche Liste gilt? Die mit dem neueren Stand (bei Gleichstand die zentrale). */
export function geltendeListe(zentral: ServerListe | null, eingebaut: ServerListe | null): { liste: ServerListe | null; herkunft: 'zentral' | 'eingebaut' | 'keine' } {
  if (zentral && (!eingebaut || zentral.stand >= eingebaut.stand)) return { liste: zentral, herkunft: 'zentral' }
  if (eingebaut) return { liste: eingebaut, herkunft: 'eingebaut' }
  return { liste: null, herkunft: 'keine' }
}

// ── Laden / Speichern (zentral) ──────────────────────────────────────────────
let cache: { bis: number; zentral: ServerListe | null } | null = null
function istListe(x: unknown): x is ServerListe {
  return !!x && typeof x === 'object' && Array.isArray((x as ServerListe).server) && typeof (x as ServerListe).stand === 'string'
}
export async function ladeZentraleListe(frisch = false): Promise<ServerListe | null> {
  if (!frisch && cache && cache.bis > Date.now()) return cache.zentral
  let zentral: ServerListe | null = null
  try { const d = await api().netReadJsonAsync<ServerListe>(SERVERLISTE_PFAD); zentral = istListe(d) ? d : null } catch { /* offline */ }
  cache = { bis: Date.now() + 60_000, zentral }
  return zentral
}
export async function ladeServerListe(frisch = false): Promise<{ liste: ServerListe | null; herkunft: 'zentral' | 'eingebaut' | 'keine'; zentral: ServerListe | null }> {
  const zentral = await ladeZentraleListe(frisch)
  return { ...geltendeListe(zentral, eingebauteListe()), zentral }
}
export async function speichereServerListe(l: ServerListe, von: string): Promise<boolean> {
  const daten: ServerListe = { ...l, importiertAm: new Date().toISOString(), importiertVon: von }
  let ok = false
  try { ok = await api().netWriteJsonAsync(SERVERLISTE_PFAD, daten) } catch { ok = false }
  if (ok) cache = { bis: Date.now() + 60_000, zentral: daten }
  return ok
}

// ── Nachschlagen ─────────────────────────────────────────────────────────────
/** Eintrag zu einem Hostnamen — auch über Alias/DNS-Namen (PSQL.SKF.NET → W3165). */
export function findeServer(liste: ServerListe | null, host: string): ServerEintrag | undefined {
  if (!liste || !host) return undefined
  const h = normHost(host)
  const direkt = liste.server.find(x => x.host === h)
  if (direkt) return direkt
  const voll = s(host).toLowerCase()
  return liste.server.find(x => x.aliase.some(a => a.toLowerCase() === voll || normHost(a) === h))
}

/** Für das „i": Eintrag + Stand der Liste (oder null, wenn der Host nicht in der Liste steht). */
export async function serverSteckbrief(host: string): Promise<{ eintrag: ServerEintrag; stand: string; quelle: string; herkunft: 'zentral' | 'eingebaut' } | null> {
  const { liste, herkunft } = await ladeServerListe()
  const e = findeServer(liste, host)
  if (!e || !liste || herkunft === 'keine') return null
  return { eintrag: e, stand: liste.stand, quelle: liste.quelle, herkunft }
}

/** Überschrift eines Servers: die Anwendungen (aktive zuerst), z. B. „Solidworks · AutoCAD". */
export function serverTitel(e: ServerEintrag, max = 3): string {
  const t = eindeutig((e.anwendungen.some(a => a.zustand === 'aktiv') ? e.anwendungen.filter(a => a.zustand === 'aktiv') : e.anwendungen).map(a => a.titel))
  return t.length > max ? `${t.slice(0, max).join(' · ')} +${t.length - max}` : t.join(' · ')
}

/** Kommentar in Text- und Link-Stücke zerlegen (http/https klickbar). */
export function kommentarTeile(t: string): { text: string; link?: string }[] {
  const out: { text: string; link?: string }[] = []
  const re = /https?:\/\/[^\s"<>]+/g
  let i = 0, m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    if (m.index > i) out.push({ text: t.slice(i, m.index) })
    const url = m[0].replace(/[),.;]+$/, '')
    out.push({ text: url, link: url })
    i = m.index + url.length
  }
  if (i < t.length) out.push({ text: t.slice(i) })
  return out
}

// ── Abgleich mit Standort-Übersicht und Server-Kacheln ───────────────────────
export interface AbgleichZeile {
  host: string
  titel: string
  plattform: string
  umgebungen: string[]
  fehltImInventar: boolean
  /** steht im Inventar, aber unter anderer Kategorie (wird dann NICHT doppelt angelegt) */
  andereKategorie?: string
  fehltAlsKachel: boolean
}
export interface Abgleich {
  zeilen: AbgleichZeile[]               // nur aktive Server mit echtem Hostnamen, bei denen etwas fehlt
  nichtUebernommen: { host: string; zustand: ServerZustand; grund: string }[]
}

/** Rein: was fehlt wo? */
export function gleicheAb(liste: ServerListe, inventar: InventoryItem[], kacheln: ServerTile[]): Abgleich {
  const inv = new Map<string, InventoryItem>()
  for (const i of inventar) { const k = normHost(i.name || ''); if (k && !inv.has(k)) inv.set(k, i) }
  const kach = new Set(kacheln.map(t => normHost(t.hostname)))
  const zeilen: AbgleichZeile[] = []
  const nichtUebernommen: Abgleich['nichtUebernommen'] = []
  for (const e of liste.server) {
    if (e.zustand !== 'aktiv') { nichtUebernommen.push({ host: e.host, zustand: e.zustand, grund: e.zustand === 'geloescht' ? 'in der Liste als gelöscht markiert' : 'in der Liste als offline markiert' }); continue }
    if (!e.gueltigerHost) { nichtUebernommen.push({ host: e.host, zustand: e.zustand, grund: 'kein gültiger Rechnername' }); continue }
    const i = inv.get(e.host)
    const fehltImInventar = !i
    const fehltAlsKachel = !kach.has(e.host)
    if (!fehltImInventar && !fehltAlsKachel && (!i || i.category === 'Server')) continue
    zeilen.push({
      host: e.host, titel: serverTitel(e, 4), plattform: e.plattform, umgebungen: e.umgebungen,
      fehltImInventar, andereKategorie: i && i.category !== 'Server' ? i.category : undefined, fehltAlsKachel,
    })
  }
  return { zeilen: zeilen.filter(z => z.fehltImInventar || z.fehltAlsKachel), nichtUebernommen }
}

/** Kurzbeschreibung für einen neuen Inventar-Eintrag (Standort-Übersicht). */
export function inventarBeschreibung(e: ServerEintrag): string {
  return [serverTitel(e, 3), e.plattform].filter(Boolean).join(' · ').slice(0, 160)
}

/**
 * Fehlende Server in die Standort-Übersicht (Kategorie „Server") eintragen — gegen den FRISCH
 * gelesenen Stand. Ist die Datei vorhanden, aber nicht lesbar, wird NICHT geschrieben (sonst
 * wäre das ganze Inventar weg). Vorhandene Einträge bleiben unangetastet.
 */
export async function inventarErgaenzen(liste: ServerListe, hosts: string[], von: string): Promise<{ ok: boolean; hinzu: string[]; fehler?: string }> {
  let aktuell: InventoryItem[] | null = null
  try { aktuell = await api().netReadJsonAsync<InventoryItem[]>(INVENTAR_PFAD) } catch { aktuell = null }
  if (aktuell === null) {
    let vorhanden = false
    try { vorhanden = (await api().netListDirAsync('inventory')).some(f => f.toLowerCase() === 'inventory.json') } catch { vorhanden = true }
    if (vorhanden) return { ok: false, hinzu: [], fehler: 'Die Standort-Übersicht (inventory.json) ist gerade nicht lesbar — nichts geändert, bitte gleich noch einmal.' }
  }
  const basis = Array.isArray(aktuell) ? aktuell : []
  const da = new Set(basis.map(i => normHost(i.name || '')))
  const jetzt = new Date().toISOString()
  const neu: InventoryItem[] = []
  for (const h of hosts) {
    const e = findeServer(liste, h)
    if (!e || e.zustand !== 'aktiv' || !e.gueltigerHost || da.has(e.host)) continue
    da.add(e.host)
    neu.push({ id: `srvl_${e.host}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: e.host, description: inventarBeschreibung(e) || undefined, category: 'Server', addedAt: jetzt, addedBy: von })
  }
  if (!neu.length) return { ok: true, hinzu: [] }
  let ok = false
  try { ok = await api().netWriteJsonAsync(INVENTAR_PFAD, [...basis, ...neu]) } catch { ok = false }
  return ok ? { ok: true, hinzu: neu.map(n => n.name) } : { ok: false, hinzu: [], fehler: 'Speichern der Standort-Übersicht fehlgeschlagen.' }
}

/**
 * Neue Server-Kacheln (rein). Mail-Meldungen nur für Server, die gerade auf Ping antworten —
 * sonst kämen sofort Offline-Mails für Server, die von hier gar nicht erreichbar sind (z. B. Azure).
 */
export function neueKacheln(vorhanden: ServerTile[], liste: ServerListe, hosts: string[], erreichbar: Set<string>,
  melde: Pick<ServerTile, 'notifyEnabled' | 'notifyReboot' | 'notifyPruefung' | 'notifyZertifikat' | 'notifyEmail'>): ServerTile[] {
  const da = new Set(vorhanden.map(t => normHost(t.hostname)))
  let pos = vorhanden.reduce((m, t) => Math.max(m, t.position), -1)
  const out: ServerTile[] = []
  for (const h of hosts) {
    const e = findeServer(liste, h)
    if (!e || e.zustand !== 'aktiv' || !e.gueltigerHost || da.has(e.host)) continue
    da.add(e.host)
    out.push({
      id: `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      hostname: e.host, description: serverTitel(e, 3) || undefined,
      ...(erreichbar.has(e.host) ? melde : { notifyEnabled: false, notifyReboot: false, notifyPruefung: false, notifyZertifikat: false }),
      position: ++pos,
    })
  }
  return out
}
