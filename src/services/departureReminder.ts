// ── Austritts-Reminder: Terminierung + E-Mail-Erstellung ─────────────────────
// - Vor-Austritt-Reminder (automatisch): 7 Tage vor Austritt an den Manager, mit
//   kompletter zugewiesener Hardware (Modell/Seriennummer/Hostname). Später
//   hochgeladene Austritte (schon < 7 T.) → 1 Tag nach dem ersten „Sehen".
//   NUR neue Austritte ab Feature-Start; bestehende werden „geseedet" (preexisting).
// - Nachfass (manuell, Teil C): ab 1 T. nach Austritt, wenn noch Geräte offen.
// Halle-Mini-PCs (Gruppen-PCs) werden aus der Mail ausgeschlossen (nur Tool-Hinweis).

import { api } from '../electronAPI'
import { type Departure, formatGermanDate, daysUntil } from './employees'
import { loadDevices, classifyModel, type EndpointDevice } from './endpointDevices'
import { devicesForName } from './departureDevices'
import { findDeviceLocation } from './deviceMaps'
import { ensureDailyAdUsers, buildNameIndex, lookupUserByName } from './adUserDirectory'
import { fetchAdPersonInfo } from './personMasterData'
import type { AdUserListItem } from './adUsersList'
import { loadEverphone, findEverphoneForName, hasMobileDevice, type EverphoneEntry } from './everphone'

export const SUPPORT_CC = 'support.marine@skf.com'
export const FIELDSERVICE_ROOMS = 'Raum E10 oder E11'

const REMINDER_PATH = 'employees/departure_reminders.json'
export const DEPARTURE_REMINDER_STATUS = 'employees/departure_reminder_status.json' // Claim (Exklusiv-Versand)
const DAY = 24 * 60 * 60 * 1000

export interface ReminderState {
  firstSeenAt: string
  sendAt: string          // ISO; '' = nie automatisch (preexisting/vergangen)
  sentAt?: string
  sentBy?: string
  preexisting?: boolean
}
export interface ReminderStore { states: Record<string, ReminderState>; seeded?: boolean }

export async function loadReminderStore(): Promise<ReminderStore> {
  try {
    const s = await api().netReadJson<ReminderStore>(REMINDER_PATH)
    if (s && s.states && typeof s.states === 'object') return { states: s.states, seeded: !!s.seeded }
  } catch { /* noch keiner */ }
  return { states: {}, seeded: false }
}
export async function saveReminderStore(store: ReminderStore): Promise<boolean> {
  try { return await api().netWriteJson(REMINDER_PATH, store) } catch { return false }
}

function exitMs(dep: Departure): number {
  const t = Date.parse(`${dep.exitDate}T00:00:00`)
  return isNaN(t) ? NaN : t
}

/**
 * Abgleich: Beim ERSTEN Lauf alle bestehenden Austritte als `preexisting` seeden
 * (nie automatisch anmailen). Danach neue Austritte terminieren:
 * sendAt = max(Austritt − 7 T., jetzt + 1 T.); vergangene/ohne Datum → preexisting.
 */
export function reconcile(store: ReminderStore, departures: Departure[], nowIso: string): { store: ReminderStore; changed: boolean } {
  const now = Date.parse(nowIso)
  const states: Record<string, ReminderState> = { ...store.states }
  const firstRun = !store.seeded
  let changed = firstRun
  for (const d of departures) {
    if (states[d.id]) continue
    changed = true
    const ex = exitMs(d)
    if (firstRun || isNaN(ex) || ex < now) {
      states[d.id] = { firstSeenAt: nowIso, sendAt: '', preexisting: true }
      continue
    }
    const sendAtMs = Math.max(ex - 7 * DAY, now + 1 * DAY)
    states[d.id] = { firstSeenAt: nowIso, sendAt: new Date(sendAtMs).toISOString() }
  }
  return { store: { states, seeded: true }, changed }
}

/** Fällige, noch nicht gesendete Reminder (nicht preexisting). */
export function dueDepartures(store: ReminderStore, departures: Departure[], now = Date.now()): Departure[] {
  return departures.filter(d => {
    const s = store.states[d.id]
    return !!s && !s.preexisting && !s.sentAt && !!s.sendAt && Date.parse(s.sendAt) <= now
  })
}

export function markSent(store: ReminderStore, depId: string, by: string, atIso: string): ReminderStore {
  const s = store.states[depId]
  if (!s) return store
  return { ...store, states: { ...store.states, [depId]: { ...s, sentAt: atIso, sentBy: by } } }
}

/** Manuellen Versand persistent vermerken (unterbindet späteren Auto-Versand). */
export async function markReminderSent(depId: string, by: string): Promise<void> {
  const store = await loadReminderStore()
  const s = store.states[depId] ?? { firstSeenAt: new Date().toISOString(), sendAt: '' }
  store.states[depId] = { ...s, sentAt: new Date().toISOString(), sentBy: by }
  await saveReminderStore(store)
}

// ── E-Mail-Zusammenstellung ──────────────────────────────────────────────────
export interface ReminderContext { devices: EndpointDevice[]; adIndex: Map<string, AdUserListItem>; everphone: EverphoneEntry[] }

export async function loadReminderContext(): Promise<ReminderContext> {
  const [devices, adUsers, ep] = await Promise.all([
    loadDevices().catch(() => [] as EndpointDevice[]),
    ensureDailyAdUsers().then(r => r.dir?.users ?? []).catch(() => [] as AdUserListItem[]),
    loadEverphone().then(s => s.entries).catch(() => [] as EverphoneEntry[]),
  ])
  return { devices, adIndex: buildNameIndex(adUsers), everphone: ep }
}

export interface MailDevice { model: string; serial: string; hostname: string; isWorkstation: boolean }
export interface HallHint { hostname: string; model: string }
export interface BuiltMail {
  ok: boolean
  to?: string
  cc: string
  subject: string
  body: string
  managerName: string
  managerDisplay?: string
  mailDevices: MailDevice[]
  hallHints: HallHint[]
  hasPhone: boolean
  phone?: string
  error?: string
}

interface Assembled {
  to?: string; managerDisplay?: string
  mailDevices: MailDevice[]; hallHints: HallHint[]
  hasPhone: boolean; phone?: string; everphone?: EverphoneEntry
}

/**
 * Manager-E-Mail robust auflösen: zuerst zentraler AD-Cache, sonst LIVE-AD-Abfrage
 * (`fetchAdPersonInfo` – dieselbe Quelle wie das Personen-„i" unter Kontakt/Arbeitsplatz,
 * inkl. UPN-Fallback). So werden auch Manager gefunden, die nicht im Tages-Cache stehen.
 */
async function resolveManager(name: string, ctx: ReminderContext): Promise<{ email?: string; displayName?: string }> {
  const nm = (name || '').trim()
  if (!nm) return {}
  const cached = lookupUserByName(ctx.adIndex, nm)
  if (cached?.email) return { email: cached.email, displayName: cached.displayName }
  try {
    const info = await fetchAdPersonInfo(nm)
    if (info.found) return { email: info.email || cached?.email, displayName: info.displayName || cached?.displayName }
  } catch { /* AD nicht erreichbar → Cache-Wert (falls vorhanden) */ }
  return { email: cached?.email, displayName: cached?.displayName }
}

async function assemble(dep: Departure, ctx: ReminderContext): Promise<Assembled> {
  const mgr = await resolveManager(dep.manager, ctx)
  const matched = devicesForName(dep.name, dep.globalId, ctx.devices)
  const mailDevices: MailDevice[] = []
  const hallHints: HallHint[] = []
  for (const dv of matched) {
    const cat = classifyModel(dv.model)
    if (cat === 'Desktop Mini') {
      const loc = await findDeviceLocation(dv.hostname || '', dv.serial || '').catch(() => null)
      if (loc && (loc.mapId === 'ot-devices' || loc.mapId === 'pruffeld-zoll')) {
        hallHints.push({ hostname: dv.hostname || dv.serial || '—', model: dv.model || '—' })
        continue // Gruppen-PC in der Halle → NICHT in die Mail
      }
    }
    mailDevices.push({ model: dv.model || '—', serial: dv.serial || '—', hostname: dv.hostname || '—', isWorkstation: cat === 'Desktop Workstation' })
  }
  const ep = findEverphoneForName(dep.name, ctx.everphone)
  return { to: mgr.email, managerDisplay: mgr.displayName, mailDevices, hallHints, hasPhone: hasMobileDevice(ep), phone: ep?.phone, everphone: ep }
}

/** Vorname des Managers (AD-Anzeigename bevorzugt; „Nachname, Vorname" wird umgedreht). */
function firstNameOf(a: Assembled, dep: Departure): string {
  const src = (a.managerDisplay || dep.manager || '').trim()
  if (!src) return ''
  const comma = src.split(',')
  const base = comma.length === 2 ? comma[1].trim() : src
  return base.split(/\s+/)[0] || ''
}
function greet(a: Assembled, dep: Departure): string {
  const fn = firstNameOf(a, dep)
  return `Hallo ${fn || 'zusammen'},`
}
function deviceLines(devs: MailDevice[]): string {
  if (devs.length === 0) return '(derzeit sind in der Endgeräte-Übersicht keine Geräte auf den Mitarbeiter zugeordnet)'
  return devs.map(d => `• ${d.model} — Seriennummer: ${d.serial} — Hostname: ${d.hostname}`).join('\n')
}
/** Mobilgeräte-Text aus dem Everphone-Eintrag (echte Anzahl statt „ein Endgerät"). */
function mobileInfo(a: Assembled): { has: boolean; noun: string; detail: string; plural: boolean } {
  const ep = a.everphone
  if (!hasMobileDevice(ep)) return { has: false, noun: '', detail: '', plural: false }
  const count = ep!.deviceCount || ep!.deviceIds.length || 1
  const plural = count > 1
  const noun = plural ? `${count} mobile Endgeräte` : 'ein mobiles Endgerät'
  const detail = ep!.phone ? ` (Rufnummer ${ep!.phone})` : ''
  return { has: true, noun, detail, plural }
}

/** Vor-Austritt-Reminder (Ankündigung der Hardware-Rückgabe). */
export async function buildDepartureReminder(dep: Departure, ctx?: ReminderContext): Promise<BuiltMail> {
  const c = ctx ?? await loadReminderContext()
  const a = await assemble(dep, c)
  const lines: string[] = []
  const dLeft = daysUntil(dep.exitDate)
  const alreadyLeft = !isNaN(dLeft) && dLeft < 0
  lines.push(greet(a, dep), '')
  lines.push(alreadyLeft
    ? `${dep.name} hat SKF Marine zum ${formatGermanDate(dep.exitDate)} verlassen. Bitte sorge dafür, dass die folgende IT-Hardware beim Field Service in ${FIELDSERVICE_ROOMS} abgegeben wird:`
    : `${dep.name} verlässt SKF Marine zum ${formatGermanDate(dep.exitDate)}. Bitte sorge dafür, dass die folgende IT-Hardware nach dem letzten Arbeitstag beim Field Service in ${FIELDSERVICE_ROOMS} abgegeben wird:`, '')
  lines.push(deviceLines(a.mailDevices), '')
  if (a.mailDevices.some(d => d.isWorkstation)) {
    lines.push('Hinweis: Bei der Hardware ist eine Desktop-Workstation. Soll dieser PC für einen neuen Mitarbeiter übernommen werden? Gib uns dazu bitte kurz Bescheid.', '')
  }
  const miR = mobileInfo(a)
  if (miR.has) {
    lines.push(`${dep.name} hat außerdem ${miR.noun}${miR.detail}. Bitte gib ${miR.plural ? 'diese' : 'dieses'} ebenfalls mit ab.`, '')
  }
  lines.push('Vielen Dank für deine Unterstützung!', '', 'Viele Grüße', 'IT-Support · SKF Marine')
  return {
    ok: !!a.to, to: a.to, cc: SUPPORT_CC,
    subject: `Austritt ${dep.name} am ${formatGermanDate(dep.exitDate)} – Rückgabe der IT-Hardware`,
    body: lines.join('\n'),
    managerName: dep.manager, managerDisplay: a.managerDisplay,
    mailDevices: a.mailDevices, hallHints: a.hallHints, hasPhone: a.hasPhone, phone: a.phone,
    error: a.to ? undefined : 'Manager-E-Mail nicht gefunden',
  }
}

/** Nachfass-Mail nach Austritt (Geräte noch nicht abgegeben). */
export async function buildDepartureDunning(dep: Departure, ctx?: ReminderContext): Promise<BuiltMail> {
  const c = ctx ?? await loadReminderContext()
  const a = await assemble(dep, c)
  const lines: string[] = []
  lines.push(greet(a, dep), '')
  lines.push(`von ${dep.name} (Austritt am ${formatGermanDate(dep.exitDate)}) sind bei der IT bisher folgende Geräte nicht eingegangen:`, '')
  lines.push(deviceLines(a.mailDevices), '')
  const miD = mobileInfo(a)
  if (miD.has) {
    lines.push(`Außerdem ${miD.plural ? 'sind' : 'ist'} ${miD.noun}${miD.detail} noch offen — bitte gib ${miD.plural ? 'diese' : 'dieses'} auch im ${FIELDSERVICE_ROOMS} ab.`, '')
  }
  lines.push(`Kannst du uns bitte kurz mitteilen, bis wann wir mit der Rückgabe rechnen dürfen? Die Abgabe erfolgt beim Field Service in ${FIELDSERVICE_ROOMS}.`, '')
  lines.push('Vielen Dank und viele Grüße', 'IT-Support · SKF Marine')
  return {
    ok: !!a.to, to: a.to, cc: SUPPORT_CC,
    subject: `Erinnerung: Rückgabe IT-Hardware ${dep.name} (Austritt ${formatGermanDate(dep.exitDate)})`,
    body: lines.join('\n'),
    managerName: dep.manager, managerDisplay: a.managerDisplay,
    mailDevices: a.mailDevices, hallHints: a.hallHints, hasPhone: a.hasPhone, phone: a.phone,
    error: a.to ? undefined : 'Manager-E-Mail nicht gefunden',
  }
}
