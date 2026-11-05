// ── Hardware-Inventur – Pick-Ups (abgeholte Geräte) ───────────────────────────
// Jede Abholung durch einen Lieferanten wird dauerhaft festgehalten: Datum, Lieferant,
// Notiz, die abgeholten Geräte (Seriennummer/Hostname) und der hochgeladene Beleg
// (Foto/Excel/PDF des Abholscheins). Abholungen werden nie gelöscht; Änderungen werden
// mit Zeit/Benutzer protokolliert.
//
// Pflicht nach einer Abholung: jedes Gerät in ServiceNow auf State „In transit" setzen.
// Das Tool prüft das (ServiceNow live, sonst Endgeräte-Übersicht) und markiert Geräte /
// Abholungen rot, bei denen das noch fehlt. Das Tool selbst ändert in ServiceNow NICHTS.
//
// Speicher (Netzlaufwerk):
//   hardware-inventory/pickups.json          → { version, pickups[] }
//   hardware-inventory/pickups_status.json   → zuletzt geprüfter State je Seriennummer
//   hardware-inventory/pickups/<id>/<datei>  → Original-Beleg

import { api } from '../electronAPI'
import { normalizeSerial } from './hardwareInventory'
import { loadDevices, loadMeta, type EndpointDevice } from './endpointDevices'
import { authOf, loadConfig, loadIntegrationAccount } from './servicenow'

export type ErkanntUeber = 'endgeraete' | 'korrigiert' | 'unbekannt' | 'manuell'

export interface PickupGeraet {
  serial: string            // normalisiert (UPPERCASE, ohne Leerzeichen)
  hostname: string
  modell?: string
  zugewiesen?: string
  erkannt: ErkanntUeber
  roh?: string              // so stand es auf dem Beleg (bei Korrektur/Hostname)
}

export interface Pickup {
  id: string
  datum: string             // YYYY-MM-DD (Tag der Abholung)
  lieferant: string
  notiz: string
  geraete: PickupGeraet[]
  belege: { name: string; pfad: string }[]   // Original-Belege (Pflicht), pfad relativ zum Netzlaufwerk
  angelegtAm: string
  angelegtVon: string
  geaendert?: { am: string; von: string; was: string }[]
}

interface PickupDatei { version: number; pickups: Pickup[] }

const DATEI = 'hardware-inventory/pickups.json'
const STATUS_DATEI = 'hardware-inventory/pickups_status.json'
const ERR_NET = 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.'

// ── Laden / Speichern ─────────────────────────────────────────────────────────

/** Liest die Datei. null = Datei vorhanden, aber nicht lesbar (dann NIE schreiben). */
async function lese(): Promise<PickupDatei | null> {
  let d: PickupDatei | null = null
  try { d = await api().netReadJson<PickupDatei>(DATEI) } catch { return null }
  if (d && Array.isArray(d.pickups)) return d
  if (d) return null
  // netReadJson liefert auch bei Lesefehlern null → nur wenn die Datei wirklich fehlt, leer starten
  try { if (await api().netExists(DATEI)) return null } catch { return null }
  return { version: 1, pickups: [] }
}

export async function ladePickups(): Promise<Pickup[]> {
  const d = await lese()
  if (!d) throw new Error(ERR_NET)
  return [...d.pickups].sort((a, b) => (b.datum + b.angelegtAm).localeCompare(a.datum + a.angelegtAm))
}

export function neueId(): string {
  return `pu_${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`
}

/** Neue Abholung anlegen oder vorhandene ändern (gegen frisch gelesenen Stand). */
export async function speicherePickup(p: Pickup, von: string, was = ''): Promise<{ ok: boolean; error?: string }> {
  const d = await lese()
  if (!d) return { ok: false, error: ERR_NET }
  const i = d.pickups.findIndex(x => x.id === p.id)
  if (i >= 0) {
    const alt = d.pickups[i]
    d.pickups[i] = { ...p, angelegtAm: alt.angelegtAm, angelegtVon: alt.angelegtVon,
      geaendert: [...(alt.geaendert || []), { am: new Date().toISOString(), von, was: was || 'bearbeitet' }] }
  } else {
    d.pickups.push(p)
  }
  try { return (await api().netWriteJson(DATEI, d)) ? { ok: true } : { ok: false, error: ERR_NET } }
  catch { return { ok: false, error: ERR_NET } }
}

/** Original-Beleg zur Abholung ablegen; liefert den relativen Pfad. */
export async function speichereBeleg(id: string, dateiname: string, base64: string): Promise<string | null> {
  const name = dateiname.replace(/[\\/:*?"<>|]/g, '_').slice(-120) || 'beleg'
  const pfad = `hardware-inventory/pickups/${id}/${name}`
  try { return (await api().netWriteRawFile(pfad, base64)) ? pfad : null } catch { return null }
}

/** Beleg mit dem Standardprogramm öffnen. */
export async function oeffneBeleg(pfad: string): Promise<string> {
  try {
    const basis = (await api().netGetBasePath()).replace(/[\\/]+$/, '')
    const r = await api().openPath(`${basis}\\${pfad.replace(/\//g, '\\')}`)
    return r.success ? '' : (r.error || 'Datei konnte nicht geöffnet werden.')
  } catch (e) { return e instanceof Error ? e.message : String(e) }
}

// ── Geräte-Index (Endgeräte-Übersicht) ────────────────────────────────────────

export interface GeraeteIndex {
  geraete: EndpointDevice[]
  perSerial: Map<string, EndpointDevice>
  perHost: Map<string, EndpointDevice>
  importiertAm?: string
}

export async function ladeGeraeteIndex(): Promise<GeraeteIndex> {
  const [geraete, meta] = await Promise.all([loadDevices(), loadMeta().catch(() => ({} as { importedAt?: string }))])
  const perSerial = new Map<string, EndpointDevice>(), perHost = new Map<string, EndpointDevice>()
  for (const d of geraete) {
    const s = normalizeSerial(d.serial); if (s) perSerial.set(s, d)
    const h = d.hostname.trim().toUpperCase(); if (h) perHost.set(h, d)
  }
  return { geraete, perSerial, perHost, importiertAm: meta.importedAt }
}

/** Seriennummer oder Hostname (Präfix + Seriennummer) → Gerät aus der Endgeräte-Übersicht. */
export function findeGeraet(eingabe: string, idx: GeraeteIndex): EndpointDevice | null {
  const t = normalizeSerial(eingabe)
  if (!t) return null
  return idx.perHost.get(t) || idx.perSerial.get(t)
    || idx.perSerial.get(t.replace(/^(DEHAM|DESCH|DE)/, '')) || null
}

/** Eingabe (vom Beleg oder von Hand) → Gerätezeile. */
export function alsPickupGeraet(eingabe: string, idx: GeraeteIndex, erkannt: ErkanntUeber = 'manuell'): PickupGeraet {
  const roh = normalizeSerial(eingabe)
  const d = findeGeraet(roh, idx)
  if (d) {
    const serial = normalizeSerial(d.serial) || roh.replace(/^(DEHAM|DESCH|DE)/, '')
    return { serial, hostname: d.hostname.trim().toUpperCase(), modell: d.model || undefined, zugewiesen: d.assignedTo || undefined,
      erkannt: erkannt === 'manuell' ? 'manuell' : erkannt === 'korrigiert' ? 'korrigiert' : 'endgeraete', roh: roh !== serial ? roh : undefined }
  }
  // Unbekannt: Hostname-Präfix abtrennen, damit Seriennummer + Hostname trotzdem stimmen
  const m = roh.match(/^(DEHAM|DESCH|DE)([A-Z0-9]{7,})$/)
  const serial = m ? m[2] : roh
  return { serial, hostname: m ? roh : '', erkannt: erkannt === 'manuell' ? 'manuell' : 'unbekannt', roh: m ? roh : undefined }
}

// ── State-Prüfung („In transit") ──────────────────────────────────────────────

export interface GeraeteStatus { state: string; substate?: string; quelle: 'servicenow' | 'endgeraete'; am: string }
interface StatusDatei { version: number; geprueftAm?: string; quelle?: string; hinweis?: string; status: Record<string, GeraeteStatus> }

/** In transit = erledigt. Spätere Stände nach der Abholung (ausgemustert/entsorgt) zählen ebenfalls als erledigt. */
export function istErledigt(state: string | undefined): boolean {
  return /transit|retired|ausgemustert|disposed|entsorgt|consumed|verbraucht/i.test(state || '')
}

export async function ladeStatus(): Promise<StatusDatei> {
  try {
    const d = await api().netReadJson<StatusDatei>(STATUS_DATEI)
    if (d && d.status && typeof d.status === 'object') return d
  } catch { /* leer */ }
  return { version: 1, status: {} }
}

const snDv = (f: unknown): string => {
  if (f == null) return ''
  if (typeof f === 'string') return f
  const o = f as { display_value?: string; value?: string }
  return (o.display_value ?? o.value ?? '') || ''
}

/**
 * State aller Geräte prüfen: zuerst live in ServiceNow (alm_hardware, nur lesend),
 * für nicht gefundene Geräte bzw. ohne ServiceNow aus der Endgeräte-Übersicht.
 * Ergebnis wird zentral gespeichert (alle sehen denselben Stand).
 */
export async function pruefeStatus(serials: string[]): Promise<{ status: Record<string, GeraeteStatus>; quelle: string; hinweis: string }> {
  const liste = [...new Set(serials.map(normalizeSerial).filter(Boolean))]
  const jetzt = new Date().toISOString()
  const status: Record<string, GeraeteStatus> = {}
  let hinweis = ''
  let snOk = false

  try {
    const cfg = await loadConfig()
    if (cfg?.instanceUrl?.trim()) {
      const auth = authOf(await loadIntegrationAccount().catch(() => null))
      for (let i = 0; i < liste.length; i += 80) {
        const teil = liste.slice(i, i + 80)
        const res = await api().serviceNowRequest({
          instanceUrl: cfg.instanceUrl, method: 'GET', table: 'alm_hardware',
          query: `serial_numberIN${teil.join(',')}`, fields: 'serial_number,install_status,substatus,sys_updated_on', limit: 500, auth,
        })
        if (!res?.success) {
          hinweis = res?.needsLogin ? 'ServiceNow: Anmeldung nötig — State aus der Endgeräte-Übersicht.' : `ServiceNow nicht abfragbar (${res?.error || res?.status || 'keine Antwort'}) — State aus der Endgeräte-Übersicht.`
          break
        }
        snOk = true
        for (const row of ((res.data as { result?: Record<string, unknown>[] } | undefined)?.result || [])) {
          const s = normalizeSerial(snDv(row.serial_number))
          if (s) status[s] = { state: snDv(row.install_status), substate: snDv(row.substatus) || undefined, quelle: 'servicenow', am: jetzt }
        }
      }
    } else hinweis = 'ServiceNow nicht eingerichtet — State aus der Endgeräte-Übersicht.'
  } catch (e) {
    hinweis = `ServiceNow nicht abfragbar (${e instanceof Error ? e.message : String(e)}) — State aus der Endgeräte-Übersicht.`
  }

  // Rest aus der Endgeräte-Übersicht (Stand des letzten Excel-Imports)
  const idx = await ladeGeraeteIndex().catch(() => null)
  if (idx) {
    for (const s of liste) {
      if (status[s]) continue
      const d = idx.perSerial.get(s)
      if (d?.state) status[s] = { state: d.state, substate: d.substate || undefined, quelle: 'endgeraete', am: idx.importiertAm || jetzt }
    }
  }
  const ausSn = Object.values(status).filter(s => s.quelle === 'servicenow').length
  const ausEg = Object.values(status).filter(s => s.quelle === 'endgeraete').length
  const egText = `Endgeräte-Übersicht${idx?.importiertAm ? ` (Import vom ${new Date(idx.importiertAm).toLocaleDateString('de-DE')})` : ''}`
  const quelle = snOk && ausEg ? `ServiceNow live (${ausSn}) + ${egText} (${ausEg})` : snOk ? 'ServiceNow (live)' : egText

  // Zentral merken — frisch gelesen zusammenführen, damit andere Geräte erhalten bleiben
  const alt = await ladeStatus()
  const neu: StatusDatei = { version: 1, geprueftAm: jetzt, quelle, hinweis, status: { ...alt.status, ...status } }
  try { await api().netWriteJson(STATUS_DATEI, neu) } catch { /* Anzeige klappt trotzdem */ }
  return { status: neu.status, quelle, hinweis }
}

/** Wie viele Geräte einer Abholung sind noch NICHT in transit (bzw. ohne bekannten State)? */
export function offeneGeraete(p: Pickup, status: Record<string, GeraeteStatus>): { offen: number; unbekannt: number } {
  let offen = 0, unbekannt = 0
  for (const g of p.geraete) {
    const st = status[g.serial]
    if (!st?.state) unbekannt++
    else if (!istErledigt(st.state)) offen++
  }
  return { offen, unbekannt }
}
