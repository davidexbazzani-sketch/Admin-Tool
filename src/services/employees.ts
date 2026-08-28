// ── Mitarbeiterverwaltung – Service ───────────────────────────────────────────
// Zentrale Liste aller neu eintretenden Mitarbeiter (Onboarding) und Austritte.
// Quelle der Wahrheit ist eine zentrale JSON-Datenbank auf dem Netzlaufwerk
// (live fuer alle App-User). Die bestehende Excel kann einmal importiert und
// jederzeit wieder exportiert werden.
//
// Speicher:
//   employees/employees.json              → neue Mitarbeiter (Onboarding)
//   employees/departures.json             → Austritte
//   employees/reminder_dismissals/<user>.json → per-User weggeklickte Eintritts-Popups

import { api } from '../electronAPI'

// ── Datenmodell ───────────────────────────────────────────────────────────────

/** Neuer Mitarbeiter (Eintritt / Onboarding). */
export interface Employee {
  id: string
  startDate: string          // YYYY-MM-DD (Eintrittsdatum)
  name: string               // Nachname
  vorname: string            // Vorname
  globalId: string           // SKF Global ID (z. B. OO5775) – Matching-Schluessel
  manager: string
  jobTitle: string           // Stellenbezeichnung (aus PDF)
  department: string         // Abteilung (aus PDF)
  costCenter: string         // Kostenstelle (aus PDF)
  // ── Onboarding-Checkboxen (gruen wenn die ersten drei gesetzt) ─────────────
  managerContacted: boolean  // Manager kontaktiert
  laptopReady: boolean       // Hardware fertig (Gerät bereitgestellt)
  hardwareType: string       // Geräteart: '' | 'laptop' | 'zbook' | 'tower' | 'minipc' | 'none' | 'inprogress'
  hardwareLocation: string   // bei 'inprogress': Ort/Raum, wo das Gerät gerade ist
  hardwareBy: string         // Bearbeiter, der den Hardware-Status zuletzt gesetzt hat
  workplaceReady: boolean    // Arbeitsplatz steht
  allDone: boolean           // "Alles Vorbereitet" -> alle Vorbereitungsschritte + Checklisten-Eintrag
  deviceHandedOver: boolean  // "Gerät übergeben" -> verschiebt erst DANN zu "Bereits onboardet"
  handedOverAt?: string       // ISO — wann übergeben
  handedOverBy?: string       // wer die Übergabe bestätigt hat
  // ── Pflegefelder (entsprechen den Excel-Spalten) ───────────────────────────
  request: string            // SNOW Request (REQ...)
  ritmLaptop: string         // RITM Laptop
  deploymentTask: string     // Deployment-TASK (TASK-Nummer – wird als Checklisten-TASK übernommen)
  hardwareSerial: string     // Seriennummer der Hardware (wird als Checklisten-Seriennummer übernommen)
  laptopType: string         // Laptop Typ
  accessPass: string         // Einmal-Passwort / Temporary Access Pass
  accessPassUpn: string      // zugehoeriger UPN aus der Mail
  accessPassValid: string    // Gueltigkeitszeitraum aus der Mail
  extraSoftware: string
  groupMailbox: string       // Gruppenpostfach
  roomNumber: string         // Raumnummer / Arbeitsplatz
  standardEquipment: string  // Standard-Ausruestung
  extraEquipment: string     // Extra-Ausruestung
  handoverDate: string       // Geraete-Uebergabe-Termin
  phoneExtension: string     // Durchwahl beantragt
  notes: string              // Sonstiges / Bemerkungen
  createdBy: string
  createdAt: string
  updatedAt?: string
}

/** Austritt. */
export interface Departure {
  id: string
  exitDate: string           // YYYY-MM-DD (Vertragsende / letzter Arbeitstag)
  name: string               // Voller Name (Nachname Vorname)
  globalId: string
  manager: string
  deviceName: string         // Geraete-Name
  task: string               // SNOW Task
  deviceReturned: boolean    // Geraet wurde abgegeben
  notes: string
  createdBy: string
  createdAt: string
  updatedAt?: string
}

interface EmployeeStore { version: number; employees: Employee[] }
interface DepartureStore { version: number; departures: Departure[] }

const EMP_FILE = 'employees/employees.json'
const DEP_FILE = 'employees/departures.json'
const DISMISSAL_FILE = (u: string) => `employees/reminder_dismissals/${u}.json`

/** Erinnerungs-Schwellen (Tage vor Eintritt) fuer das blockierende Popup. */
export const REMINDER_THRESHOLDS = [5, 3, 1] as const

const ERR_NET = 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.'

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ── Datums-Helfer ───────────────────────────────────────────────────────────

/** Tage von heute bis zum Datum. 0 = heute, negativ = liegt zurueck. */
export function daysUntil(isoDate: string): number {
  if (!isoDate) return NaN
  const parts = isoDate.split('-')
  if (parts.length !== 3) return NaN
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function formatGermanDate(iso: string): string {
  if (!iso) return ''
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

/** Normalisiert beliebige Datumseingaben (TT.MM.JJJJ oder JJJJ-MM-TT) zu ISO. */
export function toIsoDate(input: string): string {
  if (!input) return ''
  const s = input.trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return s
}

// ── Onboarding-Status ─────────────────────────────────────────────────────────

/** Die 3 Vorbereitungs-Checkboxen gesetzt? (steuert gruen/rot) */
export function isFullyChecked(e: Employee): boolean {
  return e.managerContacted && e.laptopReady && e.workplaceReady
}

// ── Hardware-Auswahl ("Hardware fertig"-Dropdown) ─────────────────────────────
// Neue Mitarbeiter bekommen nicht immer einen Laptop — im Team gebräuchliche
// Bezeichnungen der jeweiligen Geräte. "Keine Hardware" = kein Gerät nötig
// (Schritt gilt damit ebenfalls als erledigt).
export type HardwareType = 'laptop' | 'zbook' | 'tower' | 'minipc' | 'none' | 'inprogress'

export const HARDWARE_OPTIONS: { key: HardwareType; label: string }[] = [
  { key: 'laptop', label: 'Laptop fertig' },
  { key: 'zbook',  label: 'Z-Book fertig' },
  { key: 'tower',  label: 'Tower fertig' },
  { key: 'minipc', label: 'Mini-PC fertig' },
  { key: 'none',   label: 'Keine Hardware' },
  { key: 'inprogress', label: 'In Bearbeitung' },
]

/** Anzeige-Label einer Geräteart. Fallback "Laptop fertig" für Alt-Datensätze
 *  (laptopReady=true, aber ohne gespeicherte Geräteart). */
export function hardwareLabel(key: string): string {
  return HARDWARE_OPTIONS.find(o => o.key === key)?.label ?? 'Laptop fertig'
}

/**
 * "Onboarded" = wird erst in den einklappbaren Bereich "Bereits onboardet"
 * verschoben, wenn der vierte Haken "Alles erledigt" manuell gesetzt wurde.
 */
export function isOnboarded(e: Employee): boolean {
  return e.deviceHandedOver === true
}

/**
 * Was fehlt noch, bevor "Alles Vorbereitet" gesetzt werden darf: die drei
 * Vorbereitungsschritte UND ein Checklisten-Eintrag mit gleicher Corp-/Global-ID.
 */
export function missingPreparationSteps(e: Employee, hasChecklist: boolean): string[] {
  const m: string[] = []
  if (!e.managerContacted) m.push('Manager kontaktieren')
  if (!e.laptopReady) m.push('Gerät auswählen ("Hardware fertig")')
  if (!e.workplaceReady) m.push('Arbeitsplatz steht')
  if (!(e.accessPass || '').trim()) m.push('Access Pass Code eintragen')
  if (!hasChecklist) m.push('Checklisten-Eintrag anlegen (unter „Checklisten")')
  return m
}

// ── Mitarbeiter (Eintritte) ─────────────────────────────────────────────────

function normalizeEmployee(e: Partial<Employee>): Employee {
  return {
    id: e.id ?? newId('emp'),
    startDate: e.startDate ?? '',
    name: e.name ?? '',
    vorname: e.vorname ?? '',
    globalId: (e.globalId ?? '').toUpperCase(),
    manager: e.manager ?? '',
    jobTitle: e.jobTitle ?? '',
    department: e.department ?? '',
    costCenter: e.costCenter ?? '',
    managerContacted: e.managerContacted === true,
    laptopReady: e.laptopReady === true,
    hardwareType: e.hardwareType ?? '',
    hardwareLocation: e.hardwareLocation ?? '',
    hardwareBy: e.hardwareBy ?? '',
    workplaceReady: e.workplaceReady === true,
    // Rueckwaerts-Kompatibilitaet: aeltere Datensaetze kannten das Feld "allDone"
    // (Umzug nach "Bereits onboardet") noch nicht. War dort bereits alles
    // vorbereitet (alle 3 Haken gesetzt), gelten sie weiterhin als onboardet —
    // sonst rutschten sie nach einem Update faelschlich zurueck zu "anstehend".
    // Neue Datensaetze haben allDone explizit (true/false) und werden respektiert.
    allDone: e.allDone === undefined
      ? (e.managerContacted === true && e.laptopReady === true && e.workplaceReady === true)
      : e.allDone === true,
    // Frueher galt allDone=true als "onboardet". Jetzt zaehlt erst die Geraete-
    // Uebergabe. Alt-Datensaetze mit allDone=true bleiben daher onboardet.
    deviceHandedOver: e.deviceHandedOver === undefined ? (e.allDone === true) : e.deviceHandedOver === true,
    handedOverAt: e.handedOverAt,
    handedOverBy: e.handedOverBy,
    request: e.request ?? '',
    ritmLaptop: e.ritmLaptop ?? '',
    deploymentTask: e.deploymentTask ?? '',
    hardwareSerial: e.hardwareSerial ?? '',
    laptopType: e.laptopType ?? '',
    accessPass: e.accessPass ?? '',
    accessPassUpn: e.accessPassUpn ?? '',
    accessPassValid: e.accessPassValid ?? '',
    extraSoftware: e.extraSoftware ?? '',
    groupMailbox: e.groupMailbox ?? '',
    roomNumber: e.roomNumber ?? '',
    standardEquipment: e.standardEquipment ?? '',
    extraEquipment: e.extraEquipment ?? '',
    handoverDate: e.handoverDate ?? '',
    phoneExtension: e.phoneExtension ?? '',
    notes: e.notes ?? '',
    createdBy: e.createdBy ?? '',
    createdAt: e.createdAt ?? new Date().toISOString(),
    updatedAt: e.updatedAt,
  }
}

async function loadEmployeeStore(): Promise<EmployeeStore> {
  try {
    const d = await api().netReadJson<EmployeeStore>(EMP_FILE)
    if (!d || !Array.isArray(d.employees)) return { version: 1, employees: [] }
    return { version: d.version ?? 1, employees: d.employees.map(normalizeEmployee) }
  } catch { return { version: 1, employees: [] } }
}

async function saveEmployeeStore(s: EmployeeStore): Promise<boolean> {
  try { return await api().netWriteJson(EMP_FILE, s) } catch { return false }
}

/** Sortiert: bald startende zuerst, abgelaufene danach. */
export async function listEmployees(): Promise<Employee[]> {
  const s = await loadEmployeeStore()
  return s.employees.sort((a, b) => {
    const da = daysUntil(a.startDate), db = daysUntil(b.startDate)
    if (isNaN(da)) return 1
    if (isNaN(db)) return -1
    return da - db
  })
}

export async function createEmployee(data: Partial<Employee> & { createdBy: string }): Promise<{ ok: boolean; employee?: Employee; error?: string }> {
  const s = await loadEmployeeStore()
  const emp = normalizeEmployee({ ...data, id: data.id || newId('emp'), createdAt: new Date().toISOString() })
  s.employees.push(emp)
  if (!await saveEmployeeStore(s)) return { ok: false, error: ERR_NET }
  return { ok: true, employee: emp }
}

export async function updateEmployee(id: string, patch: Partial<Employee>): Promise<{ ok: boolean; error?: string }> {
  const s = await loadEmployeeStore()
  const idx = s.employees.findIndex(e => e.id === id)
  if (idx < 0) return { ok: false, error: 'Mitarbeiter nicht gefunden' }
  s.employees[idx] = normalizeEmployee({ ...s.employees[idx], ...patch, id: s.employees[idx].id, updatedAt: new Date().toISOString() })
  if (!await saveEmployeeStore(s)) return { ok: false, error: ERR_NET }
  return { ok: true }
}

export async function deleteEmployee(id: string): Promise<{ ok: boolean; error?: string }> {
  const s = await loadEmployeeStore()
  s.employees = s.employees.filter(e => e.id !== id)
  if (!await saveEmployeeStore(s)) return { ok: false, error: ERR_NET }
  return { ok: true }
}

/**
 * Traegt das Einmal-Passwort (Temporary Access Pass) beim passenden Mitarbeiter
 * ein. Matching ueber die Global ID (case-insensitiv). Gibt den getroffenen
 * Mitarbeiter zurueck oder null, falls keiner gefunden wurde.
 */
export async function applyAccessPass(globalId: string, accessPass: string, upn: string, valid: string): Promise<{ ok: boolean; matched?: Employee; error?: string }> {
  const gid = (globalId || '').toUpperCase().trim()
  if (!gid) return { ok: false, error: 'Keine Global ID in der Mail gefunden.' }
  const s = await loadEmployeeStore()
  const idx = s.employees.findIndex(e => e.globalId.toUpperCase() === gid)
  if (idx < 0) return { ok: false, error: `Kein Mitarbeiter mit Global ID "${gid}" in der Liste.` }
  s.employees[idx] = {
    ...s.employees[idx],
    accessPass,
    accessPassUpn: upn || s.employees[idx].accessPassUpn,
    accessPassValid: valid || s.employees[idx].accessPassValid,
    updatedAt: new Date().toISOString(),
  }
  if (!await saveEmployeeStore(s)) return { ok: false, error: ERR_NET }
  return { ok: true, matched: s.employees[idx] }
}

// ── Austritte ─────────────────────────────────────────────────────────────────

function normalizeDeparture(d: Partial<Departure>): Departure {
  return {
    id: d.id ?? newId('dep'),
    exitDate: d.exitDate ?? '',
    name: d.name ?? '',
    globalId: (d.globalId ?? '').toUpperCase(),
    manager: d.manager ?? '',
    deviceName: d.deviceName ?? '',
    task: d.task ?? '',
    deviceReturned: d.deviceReturned === true,
    notes: d.notes ?? '',
    createdBy: d.createdBy ?? '',
    createdAt: d.createdAt ?? new Date().toISOString(),
    updatedAt: d.updatedAt,
  }
}

async function loadDepartureStore(): Promise<DepartureStore> {
  try {
    const d = await api().netReadJson<DepartureStore>(DEP_FILE)
    if (!d || !Array.isArray(d.departures)) return { version: 1, departures: [] }
    return { version: d.version ?? 1, departures: d.departures.map(normalizeDeparture) }
  } catch { return { version: 1, departures: [] } }
}

async function saveDepartureStore(s: DepartureStore): Promise<boolean> {
  try { return await api().netWriteJson(DEP_FILE, s) } catch { return false }
}

export async function listDepartures(): Promise<Departure[]> {
  const s = await loadDepartureStore()
  return s.departures.sort((a, b) => {
    const da = daysUntil(a.exitDate), db = daysUntil(b.exitDate)
    if (isNaN(da)) return 1
    if (isNaN(db)) return -1
    return da - db
  })
}

export async function createDeparture(data: Partial<Departure> & { createdBy: string }): Promise<{ ok: boolean; departure?: Departure; error?: string }> {
  const s = await loadDepartureStore()
  const dep = normalizeDeparture({ ...data, id: data.id || newId('dep'), createdAt: new Date().toISOString() })
  s.departures.push(dep)
  if (!await saveDepartureStore(s)) return { ok: false, error: ERR_NET }
  return { ok: true, departure: dep }
}

export async function updateDeparture(id: string, patch: Partial<Departure>): Promise<{ ok: boolean; error?: string }> {
  const s = await loadDepartureStore()
  const idx = s.departures.findIndex(d => d.id === id)
  if (idx < 0) return { ok: false, error: 'Austritt nicht gefunden' }
  s.departures[idx] = normalizeDeparture({ ...s.departures[idx], ...patch, id: s.departures[idx].id, updatedAt: new Date().toISOString() })
  if (!await saveDepartureStore(s)) return { ok: false, error: ERR_NET }
  return { ok: true }
}

export async function deleteDeparture(id: string): Promise<{ ok: boolean; error?: string }> {
  const s = await loadDepartureStore()
  s.departures = s.departures.filter(d => d.id !== id)
  if (!await saveDepartureStore(s)) return { ok: false, error: ERR_NET }
  return { ok: true }
}

// ── Bulk-Ersetzen (fuer einmaligen Excel-Import) ──────────────────────────────

export async function replaceAllEmployees(employees: Partial<Employee>[], by: string): Promise<{ ok: boolean; error?: string }> {
  const store: EmployeeStore = { version: 1, employees: employees.map(e => normalizeEmployee({ ...e, createdBy: e.createdBy || by })) }
  if (!await saveEmployeeStore(store)) return { ok: false, error: ERR_NET }
  return { ok: true }
}

export async function replaceAllDepartures(departures: Partial<Departure>[], by: string): Promise<{ ok: boolean; error?: string }> {
  const store: DepartureStore = { version: 1, departures: departures.map(d => normalizeDeparture({ ...d, createdBy: d.createdBy || by })) }
  if (!await saveDepartureStore(store)) return { ok: false, error: ERR_NET }
  return { ok: true }
}

// ── In-App-Popups (per-User-Dismissal) ────────────────────────────────────────

export interface ActiveReminder {
  employee: Employee
  threshold: number          // 5, 3 oder 1 – aktuell faelliger, nicht weggeklickter Schwellwert
  daysRemaining: number
}

interface UserReminderDismissals {
  username: string
  dismissals: Array<{
    employeeId: string
    threshold: number
    startDate: string        // damit bei Datumsaenderung neu erinnert wird
    dismissedAt: string
  }>
}

export async function loadReminderDismissals(username: string): Promise<UserReminderDismissals> {
  try {
    const d = await api().netReadJson<UserReminderDismissals>(DISMISSAL_FILE(username))
    if (!d || !Array.isArray(d.dismissals)) return { username, dismissals: [] }
    return d
  } catch { return { username, dismissals: [] } }
}

export async function dismissReminder(username: string, employeeId: string, threshold: number, startDate: string): Promise<boolean> {
  if (!username) return false
  const d = await loadReminderDismissals(username)
  const exists = d.dismissals.some(x => x.employeeId === employeeId && x.threshold === threshold && x.startDate === startDate)
  if (!exists) d.dismissals.push({ employeeId, threshold, startDate, dismissedAt: new Date().toISOString() })
  try { return await api().netWriteJson(DISMISSAL_FILE(username), d) } catch { return false }
}

/**
 * Pro Mitarbeiter wird der niedrigste erreichte und noch nicht weggeklickte
 * Schwellwert (5/3/1) ermittelt. Beispiel: noch 2 Tage → Schwellen 5 + 3
 * erreicht; wenn 5 weggeklickt, zeigt 3. Eintritt liegt in der Zukunft
 * (daysRemaining >= 0). Bereits gestartete erzeugen keine Erinnerung mehr.
 */
export function computeActiveReminders(employees: Employee[], dismissals: UserReminderDismissals): ActiveReminder[] {
  const result: ActiveReminder[] = []
  for (const emp of employees) {
    const remaining = daysUntil(emp.startDate)
    if (isNaN(remaining) || remaining < 0) continue
    let chosen: number | null = null
    for (const t of REMINDER_THRESHOLDS) {                 // 5, 3, 1
      if (remaining > t) continue
      const dismissed = dismissals.dismissals.some(d => d.employeeId === emp.id && d.threshold === t && d.startDate === emp.startDate)
      if (!dismissed) chosen = t                           // kleinerer (dringlicherer) Schwellwert ueberschreibt
    }
    if (chosen !== null) result.push({ employee: emp, threshold: chosen, daysRemaining: remaining })
  }
  result.sort((a, b) => a.daysRemaining - b.daysRemaining)
  return result
}
