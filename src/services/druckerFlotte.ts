// ── Drucker-Flotte: Zustand aller Drucker, schonend per SNMP gelesen ───────────
// EIN Durchlauf liefert alles für den Menüpunkt „Drucker" und die Toner-Warnung:
// Erreichbarkeit, Gerätestatus, Fehlerbits, Alarme vom Drucker, Füllstände (Toner,
// Resttoner, Verschleißteile) und den Seitenzähler.
//
// Netzlast (Nutzerwunsch 30.10.2026): das Netz darf durch das Tracking nicht belastet werden.
//   • automatisch NUR vor 07:00 und ab 16:00 Uhr, höchstens alle 3 Stunden
//   • höchstens EIN Rechner prüft (Lock-Datei), alle anderen lesen nur das Ergebnis
//   • nur 2 Drucker gleichzeitig, je Drucker die Abfragen NACHEINANDER, Pause dazwischen
//   • nicht erreichbarer Drucker: nach der ersten Abfrage Schluss (keine weiteren Versuche)
//   • die Seite „Drucker" fragt beim Öffnen NICHTS ab — sie zeigt den gespeicherten Stand
// Von Hand („Jetzt alle prüfen", Einzel-Scan im Dossier) geht es jederzeit, gleich gedrosselt.
//
// Ablage (Tool-Netzordner, printer-dossiers/toner/):
//   status.json   letzter Stand je Drucker
//   seiten.json   Seitenzähler je Drucker und Tag (für die Charts)
//   lager.json    Toner-Lager: Bestand, Mindestbestand, offene Bestellungen, Bewegungen
//   scan_lock.json wer prüft gerade

import { api } from '../electronAPI'
import type { InventoryItem } from '../types/auth'
import type { PrinterDossier } from './printerDossier'
import { logPrinterAction } from './printerDossier'
import { CONN_DATA_PATH, type ConnScanData } from './printerConnections'
import {
  TONER_ORDNER, sauber, istToner, istResttoner, ladeStand, speichereStand, arbeiteEin, melde,
  WARN_UNTER_PROZENT, type Messung, type TonerWarnung,
} from './tonerWarnung'

const STATUS = `${TONER_ORDNER}/status.json`
const SEITEN = `${TONER_ORDNER}/seiten.json`
const LAGER = `${TONER_ORDNER}/lager.json`
const LOCK = `${TONER_ORDNER}/scan_lock.json`

export const PARALLEL = 2
const PAUSE_MS = 400
const AUTO_ABSTAND_MS = 3 * 60 * 60_000
const LOCK_GUELTIG_MS = 20 * 60_000
const SEITEN_TAGE = 400

/** Automatisch nur außerhalb der Arbeitszeit — vor 07:00 und ab 16:00 Uhr. */
export function imScanFenster(d = new Date()): boolean { const h = d.getHours(); return h < 7 || h >= 16 }

export const druckerKey = (name: string) => sauber(name).toUpperCase()

// ── Datenmodell ──────────────────────────────────────────────────────────────

export type SupplyKlasse = 'verbrauch' | 'behaelter' | 'sonst'
export interface SupplyStand { name: string; klasse: SupplyKlasse; prozent: number | null; level: number; max: number }
export interface DruckerAlarm { schwere: 'kritisch' | 'warnung'; text: string }

export interface DruckerStatus {
  name: string
  ip: string
  standort?: string
  erreichbar: boolean
  geprueftAm: string
  modell?: string
  status?: string             // Bereit / Druckt / Aufwärmen / Sonstiger …
  fehler: DruckerAlarm[]      // aus den Fehlerbits (Papierstau, Klappe offen …)
  alarme: DruckerAlarm[]      // Klartext-Meldungen aus der Alarmtabelle des Druckers
  supplies: SupplyStand[]
  seiten?: number
}

export interface FlottenStand {
  version: 1
  letzterScan?: { am: string; von: string; drucker: number; erreicht: number; dauerS: number; manuell: boolean }
  drucker: Record<string, DruckerStatus>
}

// ── SNMP ─────────────────────────────────────────────────────────────────────

const OID = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  hrDeviceDescr: '1.3.6.1.2.1.25.3.2.1.3.1',
  hrPrinterStatus: '1.3.6.1.2.1.25.3.5.1.1',
  hrPrinterDetectedError: '1.3.6.1.2.1.25.3.5.1.2',
  prtMarkerLifeCount: '1.3.6.1.2.1.43.10.2.1.4',
  supClass: '1.3.6.1.2.1.43.11.1.1.4',       // 3 = wird verbraucht, 4 = Behälter, der sich füllt
  supDesc: '1.3.6.1.2.1.43.11.1.1.6',
  supMax: '1.3.6.1.2.1.43.11.1.1.8',
  supLevel: '1.3.6.1.2.1.43.11.1.1.9',       // bei Behältern: FREIER Platz (RFC 3805)
  alertSeverity: '1.3.6.1.2.1.43.18.1.1.2',  // 3 = kritisch, 4 = Warnung
  alertGroup: '1.3.6.1.2.1.43.18.1.1.4',     // 11/12 = Verbrauchsmaterial (über Füllstände abgedeckt)
  alertDesc: '1.3.6.1.2.1.43.18.1.1.8',
} as const

const STATUS_TEXT: Record<number, string> = { 1: 'Sonstiger', 2: 'Unbekannt', 3: 'Bereit', 4: 'Druckt', 5: 'Aufwärmen' }

/** hrPrinterDetectedError — Bitmaske (RFC 2790). „Toner niedrig" / „Papier niedrig" / „ein Fach
 *  leer" fehlen bewusst: Toner wird über die Prozentwerte geprüft, die anderen melden fast alle
 *  Drucker dauernd (z. B. das leere Einzelblatt-Fach). */
const FEHLER_BITS: { byte: number; maske: number; text: string; schwere: DruckerAlarm['schwere'] }[] = [
  { byte: 0, maske: 0x40, text: 'Kein Papier', schwere: 'kritisch' },
  { byte: 0, maske: 0x10, text: 'Kein Toner', schwere: 'kritisch' },
  { byte: 0, maske: 0x08, text: 'Klappe / Abdeckung offen', schwere: 'kritisch' },
  { byte: 0, maske: 0x04, text: 'Papierstau', schwere: 'kritisch' },
  { byte: 0, maske: 0x02, text: 'Drucker offline', schwere: 'kritisch' },
  { byte: 0, maske: 0x01, text: 'Service angefordert', schwere: 'warnung' },
  { byte: 1, maske: 0x80, text: 'Papierfach fehlt', schwere: 'kritisch' },
  { byte: 1, maske: 0x40, text: 'Ausgabefach fehlt', schwere: 'warnung' },
  { byte: 1, maske: 0x20, text: 'Verbrauchsmaterial fehlt', schwere: 'kritisch' },
  { byte: 1, maske: 0x10, text: 'Ausgabefach fast voll', schwere: 'warnung' },
  { byte: 1, maske: 0x08, text: 'Ausgabefach voll', schwere: 'kritisch' },
  { byte: 1, maske: 0x02, text: 'Wartung überfällig', schwere: 'warnung' },
]

export function fehlerAusBits(hex: string): DruckerAlarm[] {
  const b = (hex || '').match(/../g)?.map(x => parseInt(x, 16)) || []
  return FEHLER_BITS.filter(f => ((b[f.byte] || 0) & f.maske) !== 0).map(f => ({ schwere: f.schwere, text: f.text }))
}

const suffix = (oid: string, basis: string) => (oid.startsWith(basis + '.') ? oid.slice(basis.length + 1) : oid)

type Snmp = (op: 'get' | 'walk', oidOderOids: string | string[]) => Promise<{ success: boolean; varbinds?: { oid: string; type: string; value: string | number; hex?: string }[] } | null>

/** Alle Werte EINES Druckers — Abfragen streng nacheinander. null = nicht erreichbar. */
export async function leseDruckerStatus(ip: string, community = 'public'): Promise<Omit<DruckerStatus, 'name' | 'ip' | 'standort' | 'geprueftAm'> | null> {
  const q: Snmp = (op, o) => api().snmpQuery(op === 'get'
    ? { host: ip, op, oids: o as string[], version: 'v1', community, timeoutMs: 2500, retries: 1 }
    : { host: ip, op, oid: o as string, version: 'v1', community, timeoutMs: 3000, retries: 0 }).catch(() => null)

  const kopf = await q('get', [OID.sysDescr, OID.hrDeviceDescr])
  if (!kopf?.success) return null
  const wert = (oid: string) => kopf.varbinds?.find(v => v.oid === oid && v.type !== 'error' && !/NoSuch/i.test(v.type))?.value
  const modell = sauber(String(wert(OID.hrDeviceDescr) || '')) || sauber(String(wert(OID.sysDescr) || '')) || undefined

  const st = await q('walk', OID.hrPrinterStatus)
  const stNr = Number(st?.varbinds?.[0]?.value)
  const err = await q('walk', OID.hrPrinterDetectedError)
  const fehler = fehlerAusBits(err?.varbinds?.[0]?.hex || '')
  const lc = await q('walk', OID.prtMarkerLifeCount)
  const seitenNr = Number(lc?.varbinds?.[0]?.value)

  const desc = await q('walk', OID.supDesc)
  const klasse = await q('walk', OID.supClass)
  const max = await q('walk', OID.supMax)
  const level = await q('walk', OID.supLevel)
  const kl = new Map((klasse?.varbinds || []).map(v => [suffix(v.oid, OID.supClass), Number(v.value)]))
  const mx = new Map((max?.varbinds || []).map(v => [suffix(v.oid, OID.supMax), Number(v.value)]))
  const lv = new Map((level?.varbinds || []).map(v => [suffix(v.oid, OID.supLevel), Number(v.value)]))
  const supplies: SupplyStand[] = (desc?.varbinds || []).map(v => {
    const idx = suffix(v.oid, OID.supDesc)
    const name = sauber(String(v.value || '')) || `Material ${idx}`
    const l = lv.get(idx) ?? -1, m = mx.get(idx) ?? -1
    const k = kl.get(idx)
    // Negative Werte sind Sonderwerte (-2 unbekannt, -3 „noch etwas da") → keine Prozentangabe
    const prozent = l >= 0 && m > 0 ? Math.max(0, Math.min(100, Math.round((l / m) * 100))) : null
    return { name, level: l, max: m, prozent, klasse: k === 4 || istResttoner(name) ? 'behaelter' : k === 3 || istToner(name) ? 'verbrauch' : 'sonst' }
  })

  const sev = await q('walk', OID.alertSeverity)
  const alarme: DruckerAlarm[] = []
  if (sev?.varbinds?.length) {
    const grp = await q('walk', OID.alertGroup)
    const ds = await q('walk', OID.alertDesc)
    const gruppe = new Map((grp?.varbinds || []).map(v => [suffix(v.oid, OID.alertGroup), Number(v.value)]))
    const text = new Map((ds?.varbinds || []).map(v => [suffix(v.oid, OID.alertDesc), sauber(String(v.value || ''))]))
    for (const v of sev.varbinds) {
      const idx = suffix(v.oid, OID.alertSeverity), s = Number(v.value), g = gruppe.get(idx)
      if (s !== 3 && s !== 4) continue
      if (g === 11 || g === 12) continue
      const t = text.get(idx)
      if (!t || /toner|patrone|cartridge|kartusche|tinte|\bink\b|trommel|drum|beh[aä]lter|waste/i.test(t)) continue
      if (!alarme.some(a => a.text === t)) alarme.push({ schwere: s === 3 ? 'kritisch' : 'warnung', text: t })
    }
  }
  return {
    erreichbar: true, modell, status: STATUS_TEXT[stNr], fehler, alarme, supplies,
    seiten: Number.isFinite(seitenNr) && seitenNr > 0 ? seitenNr : undefined,
  }
}

// ── Warnungen je Drucker (für die Liste) ─────────────────────────────────────

export type WarnArt = 'offline' | 'toner' | 'resttoner' | 'verschleiss' | 'fehler' | 'alarm'
export interface DruckerWarnung { art: WarnArt; schwere: 'kritisch' | 'warnung'; text: string; detail: string; material?: string }

export function warnungenVon(s: DruckerStatus | undefined): DruckerWarnung[] {
  if (!s) return []
  if (!s.erreichbar) return [{ art: 'offline', schwere: 'warnung', text: 'Nicht erreichbar', detail: 'Bei der letzten Prüfung kam keine SNMP-Antwort — ausgeschaltet, vom Netz getrennt oder SNMP deaktiviert.' }]
  const out: DruckerWarnung[] = []
  for (const f of s.fehler) out.push({ art: 'fehler', schwere: f.schwere, text: f.text, detail: `${f.text} — vom Drucker gemeldet (Gerätestatus). Details zeigt die Web-Oberfläche des Druckers.` })
  for (const a of s.alarme) if (!out.some(o => o.text === a.text)) out.push({ art: 'alarm', schwere: a.schwere, text: a.text, detail: `${a.text} — Meldung aus der Alarmliste des Druckers.` })
  for (const m of s.supplies) {
    if (m.prozent === null) continue
    if (m.klasse === 'behaelter') {
      // Behälter melden den FREIEN Platz: < 4 % frei = über 96 % voll
      if (m.prozent < WARN_UNTER_PROZENT) out.push({ art: 'resttoner', schwere: 'kritisch', material: m.name, text: `Resttoner fast voll (${100 - m.prozent} %)`, detail: `${m.name}: nur noch ${m.prozent} % frei — Behälter tauschen.` })
    } else if (istToner(m.name)) {
      if (m.prozent < WARN_UNTER_PROZENT) out.push({ art: 'toner', schwere: 'kritisch', material: m.name, text: `Toner ${m.prozent} %`, detail: `${m.name}: noch ${m.prozent} %` })
    } else if (m.prozent < WARN_UNTER_PROZENT) {
      out.push({ art: 'verschleiss', schwere: 'warnung', material: m.name, text: `${m.name.split(' ')[0]} ${m.prozent} %`, detail: `${m.name}: fast verbraucht (${m.prozent} %) — Wartungsteil bestellen.` })
    }
  }
  return out.sort((a, b) => Number(a.schwere !== 'kritisch') - Number(b.schwere !== 'kritisch'))
}

// ── Gespeicherter Stand ──────────────────────────────────────────────────────

export async function ladeFlotte(): Promise<FlottenStand> {
  const d = await api().netReadJsonAsync<FlottenStand>(STATUS).catch(() => null)
  return d && d.drucker && typeof d.drucker === 'object' ? d : { version: 1, drucker: {} }
}

export type SeitenVerlauf = Record<string, Record<string, number>>   // DRUCKER → JJJJ-MM-TT → Zähler
export async function ladeSeiten(): Promise<SeitenVerlauf> {
  const d = await api().netReadJsonAsync<{ drucker?: SeitenVerlauf }>(SEITEN).catch(() => null)
  return d?.drucker && typeof d.drucker === 'object' ? d.drucker : {}
}
const tag = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function trageSeitenEin(v: SeitenVerlauf, drucker: string, seiten: number | undefined) {
  if (!seiten) return
  const k = druckerKey(drucker)
  const reihe = (v[k] ||= {})
  reihe[tag()] = seiten
  const grenze = tag(new Date(Date.now() - SEITEN_TAGE * 86400_000))
  for (const t of Object.keys(reihe)) if (t < grenze) delete reihe[t]
}

/** Gedruckte Seiten im Zeitraum (letzter Zähler minus Zähler am/vor Beginn). null = noch kein Verlauf. */
export function seitenSeit(reihe: Record<string, number> | undefined, tage: number): { seiten: number; abTag: string } | null {
  if (!reihe) return null
  const tageSort = Object.keys(reihe).sort()
  if (tageSort.length < 2) return null
  const grenze = tag(new Date(Date.now() - tage * 86400_000))
  const start = [...tageSort].reverse().find(t => t <= grenze) || tageSort[0]
  const ende = tageSort[tageSort.length - 1]
  if (start === ende) return null
  return { seiten: Math.max(0, reihe[ende] - reihe[start]), abTag: start }
}

// ── Toner-Lager ──────────────────────────────────────────────────────────────

export interface LagerArtikel {
  key: string
  name: string
  bestand: number
  mindest?: number
  bestellNr?: string
  bestellt?: { menge: number; am: string; von: string }[]
  geaendertAm?: string
  geaendertVon?: string
}
export interface LagerBewegung { am: string; key: string; name: string; delta: number; bestandNach: number; grund: 'tausch' | 'manuell' | 'lieferung' | 'bestellung'; drucker?: string; von?: string; text?: string }
export interface Lager { version: 1; artikel: Record<string, LagerArtikel>; bewegungen: LagerBewegung[] }

export const lagerKey = (name: string) => sauber(name).toLowerCase()

/** Bestellnummer aus der Bezeichnung: „Patrone Gelb 508A HP CF362A" → „CF362A". */
export function bestellNummer(name: string): string {
  const t = sauber(name).split(/[\s,;/()]+/).filter(x => /[A-Za-z]/.test(x) && /\d/.test(x) && x.length >= 4)
  return t.length ? t[t.length - 1] : sauber(name)
}

/** null = vorhanden, aber nicht lesbar → NIE schreiben. */
export async function ladeLager(): Promise<Lager | null> {
  const d = await api().netReadJsonAsync<Lager>(LAGER).catch(() => null)
  if (d && d.artikel && Array.isArray(d.bewegungen)) return d
  const da = await api().netListDirAsync(TONER_ORDNER).then(l => l.some(f => f.toLowerCase() === 'lager.json')).catch(() => true)
  return da ? null : { version: 1, artikel: {}, bewegungen: [] }
}

/** Lager frisch lesen, ändern, speichern. Liefert den neuen Stand oder null (nicht lesbar/speicherbar). */
export async function aendereLager(f: (l: Lager) => void): Promise<Lager | null> {
  const l = await ladeLager()
  if (!l) return null
  f(l)
  l.bewegungen = l.bewegungen.slice(-1000)
  return (await api().netWriteJsonAsync(LAGER, l).catch(() => false)) ? l : null
}

export function bucheBestand(l: Lager, name: string, delta: number, grund: LagerBewegung['grund'], von?: string, drucker?: string, text?: string): LagerArtikel {
  const key = lagerKey(name)
  const a = (l.artikel[key] ||= { key, name: sauber(name), bestand: 0 })
  a.bestand = Math.max(0, (a.bestand || 0) + delta)
  a.geaendertAm = new Date().toISOString(); a.geaendertVon = von || a.geaendertVon
  l.bewegungen.push({ am: a.geaendertAm, key, name: a.name, delta, bestandNach: a.bestand, grund, drucker, von, text })
  return a
}

/** Neue Patrone erkannt? Vorher ≤ 40 %, jetzt ≥ 70 % und mindestens 30 Punkte mehr. */
export function istTausch(vorher: number | null | undefined, jetzt: number | null | undefined): boolean {
  return typeof vorher === 'number' && typeof jetzt === 'number' && vorher <= 40 && jetzt >= 70 && jetzt - vorher >= 30
}

/** Tausch-Erkennung je Drucker: vorheriger gegen neuen Stand. */
function tauscheVon(alt: DruckerStatus | undefined, neu: SupplyStand[]): { name: string; vorher: number; jetzt: number }[] {
  if (!alt) return []
  const out: { name: string; vorher: number; jetzt: number }[] = []
  for (const s of neu) {
    if (!istToner(s.name)) continue
    const v = alt.supplies.find(x => lagerKey(x.name) === lagerKey(s.name))
    if (v && istTausch(v.prozent, s.prozent)) out.push({ name: s.name, vorher: v.prozent as number, jetzt: s.prozent as number })
  }
  return out
}

async function bucheTausche(t: { drucker: string; name: string; vorher: number; jetzt: number }[]): Promise<void> {
  if (!t.length) return
  await aendereLager(l => {
    for (const x of t) {
      const gepflegt = !!l.artikel[lagerKey(x.name)]
      const a = bucheBestand(l, x.name, -1, 'tausch', 'Toner-Check', x.drucker, `Tausch erkannt: ${x.vorher} % → ${x.jetzt} %`)
      void logPrinterAction(x.drucker, `Patronentausch erkannt: ${x.name} (${x.vorher} % → ${x.jetzt} %)${gepflegt ? ` — Toner-Lager: noch ${a.bestand}` : ''}`, 'Toner-Check', 'SNMP')
    }
  })
}

// ── Welche Drucker? ──────────────────────────────────────────────────────────

export interface DruckerZiel { name: string; ip: string; community: string; standort?: string }

/** Drucker aus der Standort-Übersicht + IP/Community/Standort aus den Drucker-Dossiers. */
export async function ladeDruckerListe(): Promise<DruckerZiel[]> {
  const inv = await api().netReadJsonAsync<InventoryItem[]>('inventory/inventory.json').catch(() => null)
  const drucker = (Array.isArray(inv) ? inv : []).filter(i => i.category === 'Drucker' && (i.name || '').trim())
  const dateien = (await api().netListDirAsync('printer-dossiers/data').catch(() => [] as string[])).filter(f => /\.json$/i.test(f))
  const dossiers = new Map<string, PrinterDossier>()
  for (let i = 0; i < dateien.length; i += 10) {
    const teil = await Promise.all(dateien.slice(i, i + 10).map(f => api().netReadJsonAsync<PrinterDossier>(`printer-dossiers/data/${f}`).catch(() => null)))
    for (const d of teil) if (d?.printerName) dossiers.set(druckerKey(d.printerName), d)
  }
  const out: DruckerZiel[] = []
  const gesehen = new Set<string>()
  for (const i of drucker) {
    const k = druckerKey(i.name)
    if (gesehen.has(k)) continue
    gesehen.add(k)
    const d = dossiers.get(k)
    out.push({
      name: i.name.trim(), ip: (d?.master?.ip || i.ip || '').trim(),
      community: (d?.master?.snmpCommunity || 'public').trim() || 'public',
      standort: (d?.master?.location || i.description || '').trim() || undefined,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
}

/** Fehlende IPs in EINEM PowerShell-Aufruf per DNS auflösen. */
async function loeseIpsAuf(namen: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  if (!namen.length) return m
  const liste = namen.map(n => `'${n.replace(/'/g, "''")}'`).join(',')
  const r = await api().runPowerShell(
    `$ErrorActionPreference='SilentlyContinue'; foreach ($n in @(${liste})) { try { $a = [System.Net.Dns]::GetHostAddresses($n) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1; if ($a) { $n + '=' + $a.IPAddressToString } } catch {} }`,
    Math.min(120000, 15000 + namen.length * 1500),
  ).catch(() => null)
  for (const z of (r?.stdout || '').split(/\r?\n/)) {
    const i = z.indexOf('=')
    if (i > 0) m.set(z.slice(0, i).trim().toUpperCase(), z.slice(i + 1).trim())
  }
  return m
}

// ── Lock (nur ein Rechner prüft) ─────────────────────────────────────────────

async function holeLock(ich: string): Promise<string | null> {
  const l = await api().netReadJsonAsync<{ von?: string; am?: string }>(LOCK).catch(() => null)
  if (l?.von && l.am && l.von !== ich && Date.now() - new Date(l.am).getTime() < LOCK_GUELTIG_MS) return null
  const zufall = Math.random().toString(36).slice(2)
  if (!(await api().netWriteJsonAsync(LOCK, { von: ich, am: new Date().toISOString(), zufall }).catch(() => false))) return null
  await new Promise(r => setTimeout(r, 2500))
  const nach = await api().netReadJsonAsync<{ zufall?: string }>(LOCK).catch(() => null)
  return nach?.zufall === zufall ? zufall : null
}
const erneuereLock = (ich: string, zufall: string) => api().netWriteJsonAsync(LOCK, { von: ich, am: new Date().toISOString(), zufall }).catch(() => false)
async function gibLockFrei(zufall: string): Promise<void> {
  const l = await api().netReadJsonAsync<{ zufall?: string }>(LOCK).catch(() => null)
  if (l?.zufall === zufall) await api().netDeleteFileAsync(LOCK).catch(() => false)
}

// ── Gesamt-Prüfung ───────────────────────────────────────────────────────────

export interface ScanErgebnis { gelaufen: boolean; grund?: string; drucker?: number; erreicht?: number; neu?: TonerWarnung[]; tausche?: number }

/**
 * Alle Drucker prüfen. Automatisch (manuell = false) nur im Scan-Fenster (vor 07:00 / ab 16:00)
 * und höchstens alle 3 Stunden; von Hand jederzeit. In beiden Fällen nur, wenn gerade kein
 * anderer Rechner prüft, und immer gedrosselt (2 Drucker gleichzeitig, Abfragen nacheinander).
 */
export async function pruefeAlleDrucker(ich: string, opt: { manuell?: boolean; onFortschritt?: (fertig: number, gesamt: number) => void } = {}): Promise<ScanErgebnis> {
  const vorher = await ladeFlotte()
  if (!opt.manuell) {
    if (!imScanFenster()) return { gelaufen: false, grund: 'außerhalb des Scan-Fensters (vor 07:00 / ab 16:00)' }
    if (vorher.letzterScan && Date.now() - new Date(vorher.letzterScan.am).getTime() < AUTO_ABSTAND_MS) return { gelaufen: false, grund: 'kürzlich geprüft' }
  }
  const lock = await holeLock(ich)
  if (!lock) return { gelaufen: false, grund: 'prüft gerade ein anderer Rechner' }
  const start = Date.now()
  try {
    const drucker = await ladeDruckerListe()
    const dns = await loeseIpsAuf(drucker.filter(d => !d.ip).map(d => d.name))
    for (const d of drucker) if (!d.ip) d.ip = dns.get(d.name.toUpperCase()) || ''

    const jetzt = new Date().toISOString()
    const neuStatus: Record<string, DruckerStatus> = {}
    let fertig = 0, i = 0
    opt.onFortschritt?.(0, drucker.length)
    await Promise.all(Array.from({ length: Math.min(PARALLEL, drucker.length) }, async () => {
      while (i < drucker.length) {
        const d = drucker[i++]
        const s = d.ip ? await leseDruckerStatus(d.ip, d.community) : null
        neuStatus[druckerKey(d.name)] = {
          name: d.name, ip: d.ip, standort: d.standort, geprueftAm: new Date().toISOString(),
          ...(s || { erreichbar: false, fehler: [], alarme: [], supplies: [] }),
          // Nicht erreichbar → letzte bekannte Füllstände behalten (für die Anzeige)
          ...(s ? {} : { supplies: vorher.drucker[druckerKey(d.name)]?.supplies || [], modell: vorher.drucker[druckerKey(d.name)]?.modell }),
        }
        fertig++
        opt.onFortschritt?.(fertig, drucker.length)
        if (fertig % 20 === 0) void erneuereLock(ich, lock)
        await new Promise(r => setTimeout(r, PAUSE_MS))
      }
    }))

    // Tausch-Erkennung + Seiten-Verlauf
    const tausche: { drucker: string; name: string; vorher: number; jetzt: number }[] = []
    const seiten = await ladeSeiten()
    for (const [k, s] of Object.entries(neuStatus)) {
      if (!s.erreichbar) continue
      tausche.push(...tauscheVon(vorher.drucker[k], s.supplies).map(t => ({ ...t, drucker: s.name })))
      trageSeitenEin(seiten, s.name, s.seiten)
    }
    await bucheTausche(tausche)
    await api().netWriteJsonAsync(SEITEN, { version: 1, drucker: seiten }).catch(() => false)

    // Toner-Warnungen (Popup + Chat)
    let neu: TonerWarnung[] = []
    const stand = await ladeStand()
    if (stand) {
      for (const s of Object.values(neuStatus)) {
        if (!s.erreichbar) continue
        const mess: Messung[] = s.supplies.filter(x => typeof x.prozent === 'number').map(x => ({ drucker: s.name, ip: s.ip, standort: s.standort, material: x.name, prozent: x.prozent as number }))
        neu.push(...arbeiteEin(stand, s.name, mess, jetzt))
      }
      await melde(neu)
      await speichereStand(stand)
    } else neu = []

    const erreicht = Object.values(neuStatus).filter(s => s.erreichbar).length
    const flotte: FlottenStand = {
      version: 1, drucker: neuStatus,
      letzterScan: { am: jetzt, von: ich, drucker: drucker.length, erreicht, dauerS: Math.round((Date.now() - start) / 1000), manuell: !!opt.manuell },
    }
    await api().netWriteJsonAsync(STATUS, flotte).catch(() => false)
    return { gelaufen: true, drucker: drucker.length, erreicht, neu, tausche: tausche.length }
  } finally {
    await gibLockFrei(lock)
  }
}

/**
 * Ergebnis eines EINZELNEN Drucker-Scans (z. B. „Jetzt scannen" im Drucker-Dossier) einarbeiten:
 * Toner-Warnung, Tausch-Erkennung (Lager), Seiten-Verlauf und gespeicherter Stand.
 */
export async function meldeEinzelScan(drucker: string, ip: string, s: { supplies: { name: string; percent: number | null; level?: number; max?: number }[]; pageCount?: number; printerStatus?: string; sysDescr?: string }, standort?: string): Promise<void> {
  const k = druckerKey(drucker)
  const flotte = await ladeFlotte()
  const alt = flotte.drucker[k]
  const supplies: SupplyStand[] = s.supplies.map(x => {
    const name = sauber(x.name)
    const vorher = alt?.supplies.find(a => lagerKey(a.name) === lagerKey(name))
    return { name, prozent: x.percent, level: x.level ?? -1, max: x.max ?? -1, klasse: vorher?.klasse || (istResttoner(name) ? 'behaelter' : istToner(name) ? 'verbrauch' : 'sonst') }
  })
  await bucheTausche(tauscheVon(alt, supplies).map(t => ({ ...t, drucker })))
  if (s.pageCount) {
    const seiten = await ladeSeiten()
    trageSeitenEin(seiten, drucker, s.pageCount)
    await api().netWriteJsonAsync(SEITEN, { version: 1, drucker: seiten }).catch(() => false)
  }
  flotte.drucker[k] = {
    name: alt?.name || drucker, ip: ip || alt?.ip || '', standort: standort || alt?.standort, erreichbar: true, geprueftAm: new Date().toISOString(),
    modell: alt?.modell || sauber(s.sysDescr || '') || undefined, status: s.printerStatus || alt?.status,
    fehler: alt?.fehler || [], alarme: alt?.alarme || [], supplies, seiten: s.pageCount || alt?.seiten,
  }
  await api().netWriteJsonAsync(STATUS, flotte).catch(() => false)

  const mess: Messung[] = supplies.filter(x => typeof x.prozent === 'number').map(x => ({ drucker, ip, standort, material: x.name, prozent: x.prozent as number }))
  if (!mess.length) return
  const stand = await ladeStand()
  if (!stand) return
  const vorherW = JSON.stringify(stand.warnungen)
  const neu = arbeiteEin(stand, drucker, mess)
  if (JSON.stringify(stand.warnungen) === vorherW) return
  await melde(neu)
  await speichereStand(stand)
}

// ── Verbindungen (aus dem Verbindungs-Scan, ohne eigene Abfragen) ────────────

export interface VerbindungsZahl { personen: number; pcs: number; standard: number }

/** Wie viele Personen/PCs haben welchen Drucker eingerichtet? Aus dem vorhandenen Verbindungs-Scan. */
export async function ladeVerbindungsZahlen(): Promise<{ stand?: string; je: Map<string, VerbindungsZahl> }> {
  const d = await api().netReadJsonAsync<ConnScanData>(CONN_DATA_PATH).catch(() => null)
  const je = new Map<string, { p: Set<string>; pc: Set<string>; std: number }>()
  for (const c of Array.isArray(d?.computers) ? d!.computers : []) {
    for (const p of Array.isArray(c.printers) ? c.printers : []) {
      const name = p.name || (p.connection || '').split('\\').pop() || ''
      if (!name) continue
      const k = druckerKey(name)
      const e = je.get(k) || { p: new Set<string>(), pc: new Set<string>(), std: 0 }
      const user = (p.user || c.loggedIn || '').split('\\').pop()?.toLowerCase()
      e.pc.add(c.hostname.toUpperCase())
      e.p.add(user || c.hostname.toUpperCase())
      if (p.isDefault) e.std++
      je.set(k, e)
    }
  }
  return { stand: d?.scanDate, je: new Map([...je].map(([k, v]) => [k, { personen: v.p.size, pcs: v.pc.size, standard: v.std }])) }
}
