// ── Zubehör Inventur → Reiter „Headset Vergabe" ──────────────────────────────
// Übersicht: wer hat wann ein Headset bekommen (und von wem). Quellen:
//   • Checkliste: neuer Mitarbeiter + „Headset übergeben" + Checkliste erledigt
//   • ServiceNow-Excel-Export der Headset-TASKs (Übergabedatum = Actual End date, übergeben von = Closed by)
//   • einmaliger Nachtrag erledigter Checklisten neuer Mitarbeiter
//   • von Hand
// Nur Erfassung — der Headset-Bestand der Zubehör Inventur wird NICHT abgebucht.
// Datei: accessory-inventory/headsets.json → { version: 1, eintraege, checklistenNachgetragen?, updatedAt, updatedBy }

import * as XLSX from 'xlsx'
import { api } from '../electronAPI'
import { foldName } from '../utils/nameMatch'
import { istNeuerMitarbeiter, type Employee } from './employees'
import type { Checklist } from './checklists'

export type HeadsetQuelle = 'checkliste' | 'servicenow' | 'nachtrag' | 'manuell'

/** Grund der Vergabe. Beim Excel-Import unbekannt (leer). */
export type HeadsetGrund = 'neuer-ma' | 'kaputt' | 'verloren' | 'neues-modell'
export const GRUENDE: { id: HeadsetGrund; text: string }[] = [
  { id: 'kaputt', text: 'Altes Headset kaputt' },
  { id: 'neuer-ma', text: 'Neuer Mitarbeiter' },
  { id: 'verloren', text: 'Headset verloren' },
  { id: 'neues-modell', text: 'Neues Modell angefordert' },
]
export const grundText = (g?: HeadsetGrund) => GRUENDE.find(x => x.id === g)?.text || 'unbekannt'
/** Austausch (alles außer Erstausstattung) → Begründung „was wurde vorher versucht" ist Pflicht. */
export const brauchtBegruendung = (g?: HeadsetGrund) => !!g && g !== 'neuer-ma'

export interface HeadsetVergabe {
  id: string
  name: string
  /** Corp-/User-ID, z. B. PR4346 */
  kennung?: string
  email?: string
  /** Übergabedatum JJJJ-MM-TT */
  datum: string
  uebergebenVon: string
  quelle: HeadsetQuelle
  /** ServiceNow-TASK (Import) bzw. TASK der Checkliste */
  ticket?: string
  checklisteId?: string
  /** leer = unbekannt (z. B. Excel-Import) */
  grund?: HeadsetGrund
  /** Bei Austausch Pflicht: was wurde gemacht, um den Tausch zu vermeiden (z. B. Treiber installiert, Sound-Dienst zurückgesetzt) */
  begruendung?: string
  sonstiges?: string
  erfasstAm: string
  erfasstVon: string
}

export interface HeadsetDatei {
  version: 1
  eintraege: HeadsetVergabe[]
  checklistenNachgetragen?: string
  updatedAt?: string
  updatedBy?: string
}

export const QUELLE_TEXT: Record<HeadsetQuelle, string> = {
  checkliste: 'Checkliste', servicenow: 'ServiceNow', nachtrag: 'Checkliste (nachgetragen)', manuell: 'von Hand',
}

const DIR = 'accessory-inventory'
const FILE = `${DIR}/headsets.json`

const neueId = () => `hs_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const heuteIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const isoTag = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ── Reine Helfer ─────────────────────────────────────────────────────────────

/** „Nachname, Vorname" → „Vorname Nachname", Leerzeichen normiert. */
export function anzeigeName(s: string): string {
  let n = (s || '').trim().replace(/\s+/g, ' ')
  if (n.includes(',')) { const p = n.split(','); if (p.length === 2 && p[0].trim() && p[1].trim()) n = `${p[1].trim()} ${p[0].trim()}` }
  return n
}
const nameKey = (s: string) => foldName(anzeigeName(s)).replace(/[^a-z0-9]+/g, ' ').trim()

/** Datum aus Export/Eingabe → JJJJ-MM-TT ('' wenn unlesbar). Versteht „2025-05-26 12:20:29", „26.05.2025", Excel-Zahl. */
export function datumIso(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) return isoTag(v)
  if (typeof v === 'number' && v > 20000 && v < 80000) {        // Excel-Seriennummer
    const d = XLSX.SSF.parse_date_code(v)
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : ''
  }
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)                 // US-Export M/T/JJJJ
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return ''
}

/** Feld aus der ServiceNow-Beschreibung („Name: …", „User ID: …", „Email: …"). */
function feld(beschreibung: string, label: string): string {
  const m = beschreibung.match(new RegExp(`^\\s*${label}\\s*:[ \\t]*(.*)$`, 'im'))
  return (m?.[1] || '').trim()
}

export interface ExportErgebnis {
  eintraege: HeadsetVergabe[]
  uebersprungen: { grund: string; anzahl: number }[]
  fehler?: string
}

/** ServiceNow-Excel-Export der Headset-TASKs lesen. Nur „Closed Complete" + Kurzbeschreibung mit „headset". */
export function parseHeadsetExport(bytes: Uint8Array | ArrayBuffer, von: string, jetzt = new Date().toISOString()): ExportErgebnis {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true })
  const blatt = wb.Sheets[wb.SheetNames[0]]
  if (!blatt) return { eintraege: [], uebersprungen: [], fehler: 'Die Datei enthält kein Tabellenblatt.' }
  const rows = XLSX.utils.sheet_to_json(blatt, { header: 1, defval: '', raw: true }) as unknown[][]
  const norm = (x: unknown) => String(x ?? '').trim().toLowerCase()
  const kopfIdx = rows.slice(0, 15).findIndex(r => r.map(norm).includes('number') && r.map(norm).some(c => c === 'closed by'))
  if (kopfIdx < 0) return { eintraege: [], uebersprungen: [], fehler: 'Kopfzeile nicht gefunden — erwartet werden u. a. die Spalten „Number“ und „Closed by“ (ServiceNow-Export der TASK-Liste).' }
  const kopf = rows[kopfIdx].map(norm)
  const sp = (...namen: string[]) => { for (const n of namen) { const i = kopf.indexOf(n); if (i >= 0) return i } return -1 }
  const iNr = sp('number', 'nummer'), iState = sp('state', 'status'), iKurz = sp('short description', 'kurzbeschreibung')
  const iBeschr = sp('description', 'beschreibung'), iVon = sp('closed by', 'geschlossen von')
  const iDatum = sp('actual end date', 'actual end', 'closed', 'geschlossen', 'closed at')
  const zaehl = new Map<string, number>()
  const skip = (g: string) => zaehl.set(g, (zaehl.get(g) || 0) + 1)
  const eintraege: HeadsetVergabe[] = []
  for (const r of rows.slice(kopfIdx + 1)) {
    const nr = String(r[iNr] ?? '').trim()
    if (!nr) continue
    if (iState >= 0 && !/closed complete|geschlossen.*(abgeschlossen|vollst)/i.test(String(r[iState] ?? ''))) { skip(`nicht abgeschlossen (${String(r[iState] || '—').trim()})`); continue }
    if (iKurz >= 0 && !/headset/i.test(String(r[iKurz] ?? ''))) { skip('kein Headset-Ticket'); continue }
    const beschr = String(r[iBeschr] ?? '')
    const name = anzeigeName(feld(beschr, 'Name'))
    const datum = datumIso(r[iDatum])
    if (!name) { skip('kein Name in der Beschreibung'); continue }
    if (!datum) { skip('kein Abschlussdatum'); continue }
    eintraege.push({
      id: neueId(), name, kennung: feld(beschr, 'User ID').toUpperCase() || undefined, email: feld(beschr, 'Email') || undefined,
      datum, uebergebenVon: String(r[iVon] ?? '').trim(), quelle: 'servicenow', ticket: nr.toUpperCase(),
      erfasstAm: jetzt, erfasstVon: von,
    })
  }
  return { eintraege, uebersprungen: [...zaehl].map(([grund, anzahl]) => ({ grund, anzahl })) }
}

/** Neue Einträge anfügen — Dubletten (gleiches Ticket bzw. gleiche Checkliste) werden übersprungen. */
export function mergeEintraege(alt: HeadsetVergabe[], neu: HeadsetVergabe[]): { liste: HeadsetVergabe[]; neu: number; vorhanden: number } {
  const tickets = new Set(alt.filter(e => e.quelle === 'servicenow' && e.ticket).map(e => e.ticket!.toUpperCase()))
  const listen = new Set(alt.filter(e => e.checklisteId).map(e => e.checklisteId!))
  const liste = [...alt]; let n = 0, v = 0
  for (const e of neu) {
    const dopTicket = e.quelle === 'servicenow' && e.ticket && tickets.has(e.ticket.toUpperCase())
    const dopListe = e.checklisteId && listen.has(e.checklisteId)
    if (dopTicket || dopListe) { v++; continue }
    if (e.quelle === 'servicenow' && e.ticket) tickets.add(e.ticket.toUpperCase())
    if (e.checklisteId) listen.add(e.checklisteId)
    liste.push(e); n++
  }
  return { liste, neu: n, vorhanden: v }
}

/** Personen-Schlüssel: Kennung, sonst Name — Name wird über Einträge MIT Kennung auf diese abgebildet. */
export function personSchluessel(eintraege: HeadsetVergabe[]): (e: HeadsetVergabe) => string {
  const nameZuKennung = new Map<string, string>()
  for (const e of eintraege) if (e.kennung?.trim()) nameZuKennung.set(nameKey(e.name), e.kennung.trim().toUpperCase())
  return e => e.kennung?.trim() ? `id:${e.kennung.trim().toUpperCase()}` : (nameZuKennung.has(nameKey(e.name)) ? `id:${nameZuKennung.get(nameKey(e.name))}` : `n:${nameKey(e.name)}`)
}

/** Anzahl Headsets je Person (Schlüssel siehe personSchluessel). */
export function anzahlJePerson(eintraege: HeadsetVergabe[]): { key: (e: HeadsetVergabe) => string; anzahl: Map<string, number> } {
  const key = personSchluessel(eintraege)
  const anzahl = new Map<string, number>()
  for (const e of eintraege) anzahl.set(key(e), (anzahl.get(key(e)) || 0) + 1)
  return { key, anzahl }
}

/** Erledigte Checklisten neuer Mitarbeiter (mit Headset) als Nachtrag. Mitarbeiter-Zuordnung wie in der Checklisten-Übersicht (Name). */
export function nachtragKandidaten(checklists: Checklist[], employees: Employee[], von: string, heute = new Date(), jetzt = new Date().toISOString()): HeadsetVergabe[] {
  const empByName = new Map<string, Employee>()
  for (const e of employees) {
    empByName.set(nameKey(`${e.vorname} ${e.name}`), e)
    empByName.set(nameKey(`${e.name} ${e.vorname}`), e)
  }
  const out: HeadsetVergabe[] = []
  for (const c of checklists) {
    if (!c.completed || c.headsetUebergeben === false) continue
    const emp = empByName.get(nameKey(c.name))
    if (!emp || !istNeuerMitarbeiter(emp, heute)) continue
    out.push(ausCheckliste(c, emp, 'nachtrag', c.completedBy || von, datumIso(c.completedAt) || isoTag(heute), von, jetzt))
  }
  return out
}

function ausCheckliste(c: Checklist, emp: Employee | undefined, quelle: HeadsetQuelle, uebergebenVon: string, datum: string, von: string, jetzt: string): HeadsetVergabe {
  return {
    id: neueId(), name: anzeigeName(c.name || `${emp?.vorname || ''} ${emp?.name || ''}`),
    kennung: (c.corpId || emp?.globalId || '').trim().toUpperCase() || undefined,
    datum, uebergebenVon, quelle, ticket: c.taskNumber || undefined, checklisteId: c.id, grund: 'neuer-ma', erfasstAm: jetzt, erfasstVon: von,
  }
}

// ── Netzlaufwerk ─────────────────────────────────────────────────────────────

/** Fehlt die Datei → leer; Netzlaufwerk nicht lesbar → Fehler (nie leer überschreiben). */
async function leseDatei(): Promise<HeadsetDatei> {
  const d = await api().netReadJsonAsync<Partial<HeadsetDatei>>(FILE)
  if (d) return { version: 1, eintraege: Array.isArray(d.eintraege) ? d.eintraege : [], checklistenNachgetragen: d.checklistenNachgetragen, updatedAt: d.updatedAt, updatedBy: d.updatedBy }
  const liste = await api().netListDirAsync(DIR).catch(() => [] as string[])
  if (liste.some(n => n.toLowerCase() === 'headsets.json')) throw new Error('Die Headset-Liste auf dem Netzlaufwerk konnte nicht gelesen werden — bitte gleich erneut versuchen.')
  return { version: 1, eintraege: [] }
}

async function aendere(fn: (d: HeadsetDatei) => HeadsetDatei, von: string): Promise<HeadsetDatei> {
  const neu = fn(await leseDatei())
  const gespeichert: HeadsetDatei = { ...neu, version: 1, updatedAt: new Date().toISOString(), updatedBy: von }
  const ok = await api().netWriteJsonAsync(FILE, gespeichert)
  if (!ok) throw new Error('Speichern fehlgeschlagen — Netzlaufwerk erreichbar?')
  return gespeichert
}

export async function ladeHeadsets(): Promise<HeadsetDatei> { return leseDatei() }

export async function importiereExport(bytes: Uint8Array, von: string): Promise<{ datei?: HeadsetDatei; neu: number; vorhanden: number; uebersprungen: ExportErgebnis['uebersprungen']; fehler?: string }> {
  const p = parseHeadsetExport(bytes, von)
  if (p.fehler) return { neu: 0, vorhanden: 0, uebersprungen: p.uebersprungen, fehler: p.fehler }
  let neu = 0, vorhanden = 0
  const datei = await aendere(d => { const m = mergeEintraege(d.eintraege, p.eintraege); neu = m.neu; vorhanden = m.vorhanden; return { ...d, eintraege: m.liste } }, von)
  return { datei, neu, vorhanden, uebersprungen: p.uebersprungen }
}

/** Checkliste erledigt (neuer Mitarbeiter, Headset = Ja) → Eintrag. Doppelt nie (gleiche Checkliste). */
export async function erfasseAusCheckliste(c: Checklist, emp: Employee | undefined, von: string): Promise<boolean> {
  let neu = 0
  await aendere(d => { const m = mergeEintraege(d.eintraege, [ausCheckliste(c, emp, 'checkliste', von, heuteIso(), von, new Date().toISOString())]); neu = m.neu; return { ...d, eintraege: m.liste } }, von)
  return neu > 0
}

export interface ManuellerEintrag { name: string; kennung?: string; datum: string; uebergebenVon: string; grund?: HeadsetGrund; begruendung?: string; sonstiges?: string }

/** Fehlende Pflichtangaben eines Hand-Eintrags (leer = ok). */
export function pruefeManuell(x: ManuellerEintrag): string[] {
  const f: string[] = []
  if (!x.name.trim()) f.push('Name')
  if (!datumIso(x.datum)) f.push('Übergabedatum')
  if (!x.grund) f.push('Grund')
  if (brauchtBegruendung(x.grund) && !(x.begruendung || '').trim()) f.push('Begründung (was wurde vorher versucht?)')
  return f
}

export async function fuegeManuellHinzu(x: ManuellerEintrag, von: string): Promise<HeadsetDatei> {
  const fehlt = pruefeManuell(x)
  if (fehlt.length) throw new Error('Bitte ausfüllen: ' + fehlt.join(', '))
  const e: HeadsetVergabe = {
    id: neueId(), name: anzeigeName(x.name), kennung: x.kennung?.trim().toUpperCase() || undefined,
    datum: datumIso(x.datum), uebergebenVon: x.uebergebenVon.trim() || von, quelle: 'manuell',
    grund: x.grund, begruendung: brauchtBegruendung(x.grund) ? x.begruendung!.trim() : (x.begruendung?.trim() || undefined),
    sonstiges: x.sonstiges?.trim() || undefined, erfasstAm: new Date().toISOString(), erfasstVon: von,
  }
  return aendere(d => ({ ...d, eintraege: [...d.eintraege, e] }), von)
}

export async function loescheEintrag(id: string, von: string): Promise<HeadsetDatei> {
  return aendere(d => ({ ...d, eintraege: d.eintraege.filter(e => e.id !== id) }), von)
}

/** Einmalig: erledigte Checklisten neuer Mitarbeiter übernehmen (danach Merker in der Datei). */
export async function nachtragEinmalig(checklists: Checklist[], employees: Employee[], von: string): Promise<{ datei: HeadsetDatei; neu: number } | null> {
  const vorher = await leseDatei()
  if (vorher.checklistenNachgetragen) return null
  let neu = 0
  const datei = await aendere(d => {
    if (d.checklistenNachgetragen) return d
    const m = mergeEintraege(d.eintraege, nachtragKandidaten(checklists, employees, von))
    neu = m.neu
    return { ...d, eintraege: m.liste, checklistenNachgetragen: new Date().toISOString() }
  }, von)
  return { datei, neu }
}

export { heuteIso }
