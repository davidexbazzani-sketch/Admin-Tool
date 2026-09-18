// ── ServiceNow Table-API (Client, Renderer-Seite) ────────────────────────────
// Duenner Client um den Main-Prozess-Handler `servicenow:request`.
//
// Anmeldung — zwei Wege, in dieser Reihenfolge:
//   1. INTEGRATIONSKONTO (Basic Auth): dediziertes ServiceNow-Service-Konto
//      (z. B. automated_user), das der HCL-Support bereitgestellt hat. Wird
//      ZENTRAL auf dem IT-Netzlaufwerk gespeichert (config/servicenow/
//      integration.json) -> alle App-User nutzen es automatisch, niemand muss
//      sich anmelden. Einmal im Zugang-Panel eintragen.
//   2. SSO-Sitzung (Fallback, wie bisher): das persoenliche SKF-Konto ist
//      SSO-basiert und hat kein lokales Passwort; Sitzung liegt in der
//      persistenten Partition 'persist:servicenow'.
// Phase 1: nur lesen (GET).

import { api } from '../electronAPI'

// ── Integrationskonto (zentral fuer alle App-User) ────────────────────────────

export interface SnIntegrationAccount {
  user: string
  pass: string
  instanceUrl?: string        // zentral: alle App-Nutzer arbeiten auf DERSELBEN Instanz
  assignmentGroups?: string[] // zentral: nur Tickets dieser Gruppen laden (leer = alle)
  updatedBy?: string
  updatedAt?: string
}

/** Standard-Assignment-Groups (Hamburg) — nur diese Tickets werden geladen (serverseitig). */
export const DEFAULT_ASSIGNMENT_GROUPS = ['FS DE Hamburg', 'Marine infrastructure support']

const INTEGRATION_FILE = 'config/servicenow/integration.json'
let integrationCache: SnIntegrationAccount | null | undefined   // undefined = noch nicht geladen

export async function loadIntegrationAccount(force = false): Promise<SnIntegrationAccount | null> {
  if (!force && integrationCache !== undefined) return integrationCache
  try {
    const a = await api().netReadJson<SnIntegrationAccount>(INTEGRATION_FILE)
    integrationCache = a && a.user && a.pass ? a : null
  } catch { integrationCache = null }
  return integrationCache
}

export async function saveIntegrationAccount(user: string, pass: string, by: string, instanceUrl?: string, assignmentGroups?: string[]): Promise<boolean> {
  const u = user.trim()
  // Copy&Paste-Artefakte (Zeilenumbrüche/Tabs) entfernen — normale Leerzeichen bleiben.
  pass = (pass || '').replace(/[\r\n\t]/g, '')
  const groups = (assignmentGroups ?? []).map(g => g.trim()).filter(Boolean)
  try {
    if (!u || !pass) {
      // Leeren = Konto entfernen -> zurueck zum SSO-Fallback (Gruppen ebenfalls entfernt)
      await api().netWriteJson(INTEGRATION_FILE, {})
      integrationCache = null
      return true
    }
    // Array IMMER speichern (auch leer) — leeres Array = bewusst „alle Gruppen".
    const payload: SnIntegrationAccount = { user: u, pass, instanceUrl: instanceUrl?.trim() || undefined, assignmentGroups: groups, updatedBy: by, updatedAt: new Date().toISOString() }
    const ok = await api().netWriteJson(INTEGRATION_FILE, payload)
    if (ok) integrationCache = payload
    return ok
  } catch { return false }
}

function authOf(acc: SnIntegrationAccount | null): { user: string; pass: string } | undefined {
  return acc ? { user: acc.user, pass: acc.pass } : undefined
}

export interface ServiceNowConfig {
  instanceUrl: string
  assignmentGroups?: string[]   // nur Tickets dieser Gruppen laden (leer = alle)
}

export const DEFAULT_INSTANCE = 'https://skfdev.service-now.com'
const STORE_KEY = 'servicenowConfig'

export async function loadConfig(): Promise<ServiceNowConfig> {
  // Zentral gespeicherte Instanz + Gruppen (beim Integrationskonto) haben Vorrang —
  // sonst arbeiten Nutzer versehentlich auf unterschiedlichen Instanzen/Filtern.
  let assignmentGroups: string[] | undefined
  try {
    const acc = await loadIntegrationAccount()
    // Feld vorhanden (auch leeres Array) = explizit gesetzt; leer bedeutet „alle Gruppen".
    if (acc && Array.isArray(acc.assignmentGroups)) assignmentGroups = acc.assignmentGroups
    if (acc?.instanceUrl?.trim()) return { instanceUrl: acc.instanceUrl.trim(), assignmentGroups: assignmentGroups ?? [] }
  } catch { /* weiter mit lokaler Config */ }
  try {
    const s = await api().getSettings()
    const c = (s?.[STORE_KEY] ?? {}) as Partial<ServiceNowConfig>
    return {
      // Standard: KEIN Gruppenfilter (alle Tickets) — der Filter ist opt-in, weil
      // die richtigen Gruppennamen je Instanz (dev/prod) unterschiedlich sein können.
      instanceUrl: c.instanceUrl || DEFAULT_INSTANCE,
      assignmentGroups: assignmentGroups ?? (Array.isArray(c.assignmentGroups) ? c.assignmentGroups : []),
    }
  } catch { return { instanceUrl: DEFAULT_INSTANCE, assignmentGroups: assignmentGroups ?? [] } }
}

/** Hostname der Instanz fuer die Anzeige ("skfdev.service-now.com"). */
export function instanceHost(cfg: ServiceNowConfig | null | undefined): string {
  try { return cfg ? new URL(cfg.instanceUrl).host : '' } catch { return cfg?.instanceUrl ?? '' }
}

/** Heuristik: Ist das die Dev-/Test-Instanz? (Warnhinweis in der UI) */
export function isDevInstance(cfg: ServiceNowConfig | null | undefined): boolean {
  return /dev|test|sandbox/i.test(instanceHost(cfg))
}
export async function saveConfig(c: ServiceNowConfig): Promise<void> {
  // Nur Instanz-URL + Gruppenfilter lokal speichern — kein Passwort (SSO).
  try { await api().setSetting(STORE_KEY, { instanceUrl: c.instanceUrl, assignmentGroups: c.assignmentGroups }) } catch { /* best effort */ }
}
export function isConfigured(c: ServiceNowConfig | null | undefined): boolean {
  return !!(c && c.instanceUrl.trim())
}

// ── SSO-Anmeldung ─────────────────────────────────────────────────────────────
/** Öffnet das ServiceNow-Anmeldefenster (SSO) und wartet auf erfolgreiche Anmeldung. */
export async function login(cfg: ServiceNowConfig): Promise<{ ok: boolean; user?: string; error?: string }> {
  const res = await api().serviceNowLogin(cfg.instanceUrl)
  return res.success ? { ok: true, user: res.user } : { ok: false, error: res.error }
}
/** Meldet ab: löscht die gespeicherte ServiceNow-Sitzung (Cookies). */
export async function logout(): Promise<void> {
  try { await api().serviceNowLogout() } catch { /* best effort */ }
}

export type SnTable = 'incident' | 'task'

export interface SnTicket {
  sysId: string
  number: string
  shortDescription: string
  state: string          // Anzeigewert
  priority: string
  assignedTo: string
  assignmentGroup: string
  caller: string
  openedAt: string
  updatedAt: string
  table: SnTable
}

// Bei sysparm_display_value=all ist jedes Feld { display_value, value }.
function dv(field: unknown): string {
  if (field == null) return ''
  if (typeof field === 'string') return field
  const f = field as { display_value?: string; value?: string }
  return (f.display_value ?? f.value ?? '') || ''
}
function rawVal(field: unknown): string {
  if (field == null) return ''
  if (typeof field === 'string') return field
  const f = field as { value?: string }
  return (f.value ?? '') || ''
}

function mapTicket(row: Record<string, unknown>, table: SnTable): SnTicket {
  return {
    sysId: rawVal(row.sys_id),
    number: dv(row.number),
    shortDescription: dv(row.short_description),
    state: dv(row.state),
    priority: dv(row.priority),
    assignedTo: dv(row.assigned_to),
    assignmentGroup: dv(row.assignment_group),
    caller: dv(row.caller_id) || dv(row.opened_by),
    openedAt: dv(row.opened_at) || dv(row.sys_created_on),
    updatedAt: dv(row.sys_updated_on),
    table,
  }
}

const TICKET_FIELDS = 'sys_id,number,short_description,state,priority,assigned_to,assignment_group,caller_id,opened_by,opened_at,sys_created_on,sys_updated_on'

export interface ListOptions { limit?: number; onlyActive?: boolean; query?: string }

export async function listTickets(
  table: SnTable, cfg: ServiceNowConfig, opts: ListOptions = {},
): Promise<{ ok: boolean; tickets: SnTicket[]; error?: string; needsLogin?: boolean }> {
  const parts: string[] = []
  // Serverseitiger Filter auf die konfigurierten Assignment Groups (leer = alle).
  // Dot-Walk auf den Referenz-Anzeigenamen, IN kommasepariert (Namen dürfen Leerzeichen enthalten).
  const groups = (cfg.assignmentGroups ?? []).map(g => g.trim()).filter(Boolean)
  if (groups.length) parts.push('assignment_group.nameIN' + groups.join(','))
  if (opts.onlyActive !== false) parts.push('active=true')
  if (opts.query && opts.query.trim()) parts.push(opts.query.trim())
  parts.push('ORDERBYDESCsys_updated_on')
  const auth = authOf(await loadIntegrationAccount())
  const res = await api().serviceNowRequest({
    instanceUrl: cfg.instanceUrl,
    method: 'GET', table, query: parts.join('^'), fields: TICKET_FIELDS, limit: opts.limit ?? 100,
    auth,
  })
  if (!res.success) return { ok: false, tickets: [], error: res.error, needsLogin: res.needsLogin }
  const result = (res.data as { result?: Record<string, unknown>[] } | undefined)?.result ?? []
  return { ok: true, tickets: result.map(r => mapTicket(r, table)) }
}

export async function testConnection(
  cfg: ServiceNowConfig,
  authOverride?: { user: string; pass: string },
): Promise<{ ok: boolean; error?: string; needsLogin?: boolean }> {
  const auth = authOverride ?? authOf(await loadIntegrationAccount())
  const res = await api().serviceNowRequest({
    instanceUrl: cfg.instanceUrl,
    method: 'GET', table: 'sys_user', fields: 'sys_id', limit: 1,
    auth,
  })
  return res.success ? { ok: true } : { ok: false, error: res.error, needsLogin: res.needsLogin }
}

// ── Phase 2: Schreiben (Ticket erstellen / schließen / zuweisen) ──────────────
// Standard-Table-API-Writes über den Main-Handler (POST/PATCH, Basic Auth).
// Referenzfelder (caller_id, assignment_group, assigned_to) werden als sys_id
// gesendet → zuerst per resolve* auflösen.

export const CLOSE_CODES = [
  'Solved (Permanently)',
  'Solved (Work Around)',
  'Solved (Knowledge Article)',
  'Not Solved (Not Reproducible)',
  'Not Solved (Too Costly)',
  'Closed/Resolved by Caller',
] as const

export type CloseState = 'Resolved' | 'Closed'
const STATE_VALUE: Record<CloseState, string> = { Resolved: '6', Closed: '7' }

/** Erstes Ergebnis aus einer Table-API-Antwort — POST liefert ein Objekt, GET ein Array. */
function firstResult(data: unknown): Record<string, unknown> | undefined {
  const r = (data as { result?: unknown } | undefined)?.result
  if (Array.isArray(r)) return r[0] as Record<string, unknown> | undefined
  return r && typeof r === 'object' ? (r as Record<string, unknown>) : undefined
}

/** sys_id eines Benutzers auf der Instanz auflösen (E-Mail bevorzugt, sonst Name/User-Name). */
export async function resolveSysUserSysId(cfg: ServiceNowConfig, q: string): Promise<{ sysId?: string; error?: string }> {
  const term = (q || '').trim()
  if (!term) return {}
  const auth = authOf(await loadIntegrationAccount())
  const query = term.includes('@') ? `email=${term}` : `name=${term}^ORuser_name=${term}`
  const res = await api().serviceNowRequest({ instanceUrl: cfg.instanceUrl, method: 'GET', table: 'sys_user', query, fields: 'sys_id', limit: 1, auth })
  if (!res.success) return { error: res.error }
  const sysId = rawVal(firstResult(res.data)?.sys_id)
  return sysId ? { sysId } : { error: `Benutzer „${term}" nicht auf der Instanz gefunden.` }
}

/** sys_id einer Assignment Group auf der Instanz auflösen. */
export async function resolveGroupSysId(cfg: ServiceNowConfig, name: string): Promise<{ sysId?: string; error?: string }> {
  const n = (name || '').trim()
  if (!n) return {}
  const auth = authOf(await loadIntegrationAccount())
  const res = await api().serviceNowRequest({ instanceUrl: cfg.instanceUrl, method: 'GET', table: 'sys_user_group', query: `name=${n}`, fields: 'sys_id', limit: 1, auth })
  if (!res.success) return { error: res.error }
  const sysId = rawVal(firstResult(res.data)?.sys_id)
  return sysId ? { sysId } : { error: `Gruppe „${n}" nicht auf der Instanz gefunden.` }
}

export interface NewIncident {
  shortDescription: string
  description?: string
  callerSysId?: string
  assignmentGroupSysId?: string
  assignedToSysId?: string
}

/** Incident anlegen (POST). Rückgabe inkl. sys_id + Nummer. */
export async function createIncident(
  cfg: ServiceNowConfig, f: NewIncident,
): Promise<{ ok: boolean; sysId?: string; number?: string; error?: string; needsLogin?: boolean }> {
  if (!f.shortDescription.trim()) return { ok: false, error: 'Kurzbeschreibung fehlt.' }
  const body: Record<string, string> = { short_description: f.shortDescription.trim() }
  if (f.description?.trim()) body.description = f.description.trim()
  if (f.callerSysId) body.caller_id = f.callerSysId
  if (f.assignmentGroupSysId) body.assignment_group = f.assignmentGroupSysId
  if (f.assignedToSysId) body.assigned_to = f.assignedToSysId
  const auth = authOf(await loadIntegrationAccount())
  const res = await api().serviceNowRequest({ instanceUrl: cfg.instanceUrl, method: 'POST', table: 'incident', body, fields: 'sys_id,number', auth })
  if (!res.success) return { ok: false, error: res.error, needsLogin: res.needsLogin }
  const r = firstResult(res.data)
  return { ok: true, sysId: rawVal(r?.sys_id) || undefined, number: dv(r?.number) || undefined }
}

/** Incident schließen (PATCH): state + close_code + close_notes. */
export async function closeIncident(
  cfg: ServiceNowConfig, sysId: string, opts: { state?: CloseState; closeCode: string; closeNotes: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!sysId) return { ok: false, error: 'Kein sys_id.' }
  const body = { state: STATE_VALUE[opts.state ?? 'Resolved'], close_code: opts.closeCode, close_notes: opts.closeNotes || opts.closeCode }
  const auth = authOf(await loadIntegrationAccount())
  const res = await api().serviceNowRequest({ instanceUrl: cfg.instanceUrl, method: 'PATCH', table: 'incident', sysId, body, fields: 'sys_id,state', auth })
  return res.success ? { ok: true } : { ok: false, error: res.error }
}

/** Bestehendes Incident (um-)zuweisen (PATCH). */
export async function updateAssignment(
  cfg: ServiceNowConfig, sysId: string, a: { groupSysId?: string; assignedToSysId?: string },
): Promise<{ ok: boolean; error?: string }> {
  const body: Record<string, string> = {}
  if (a.groupSysId) body.assignment_group = a.groupSysId
  if (a.assignedToSysId) body.assigned_to = a.assignedToSysId
  if (Object.keys(body).length === 0) return { ok: true }
  const auth = authOf(await loadIntegrationAccount())
  const res = await api().serviceNowRequest({ instanceUrl: cfg.instanceUrl, method: 'PATCH', table: 'incident', sysId, body, fields: 'sys_id', auth })
  return res.success ? { ok: true } : { ok: false, error: res.error }
}

// ── Checklisten-Übergabe-Automatik: sc_task schließen + Anhang + Incident ─────
export interface HandoverConfig {
  enabled: boolean
  templateSysId: string   // Vorlage-Incident („copy incident") — instanz-spezifisch
  closeState: string      // sc_task Schließ-Status (Closed Complete = 3)
}
const HANDOVER_FILE = 'config/servicenow/handover.json'
export const DEFAULT_TEMPLATE_SYS_ID = 'dbb606b12b03cf948742fd03fc91bf27'

export async function loadHandoverConfig(): Promise<HandoverConfig> {
  try {
    const h = await api().netReadJson<Partial<HandoverConfig>>(HANDOVER_FILE)
    if (h && typeof h === 'object') return {
      enabled: h.enabled === true,   // Standard AUS — bewusst in den Einstellungen aktivieren
      templateSysId: (h.templateSysId || '').trim() || DEFAULT_TEMPLATE_SYS_ID,
      closeState: (h.closeState || '').trim() || '3',
    }
  } catch { /* Default */ }
  return { enabled: false, templateSysId: DEFAULT_TEMPLATE_SYS_ID, closeState: '3' }
}
export async function saveHandoverConfig(c: HandoverConfig, by: string): Promise<boolean> {
  try { return await api().netWriteJson(HANDOVER_FILE, { ...c, updatedBy: by, updatedAt: new Date().toISOString() }) } catch { return false }
}

/** sc_task per Nummer finden → sys_id + Status. */
export async function findTaskByNumber(cfg: ServiceNowConfig, number: string): Promise<{ ok: boolean; sysId?: string; state?: string; error?: string; needsLogin?: boolean }> {
  const num = (number || '').trim()
  if (!num) return { ok: false, error: 'Keine Task-Nummer.' }
  const auth = authOf(await loadIntegrationAccount())
  const res = await api().serviceNowRequest({ instanceUrl: cfg.instanceUrl, method: 'GET', table: 'sc_task', query: 'number=' + num, fields: 'sys_id,state,short_description', limit: 1, auth })
  if (!res.success) return { ok: false, error: res.error, needsLogin: res.needsLogin }
  const r = firstResult(res.data)
  const sysId = rawVal(r?.sys_id)
  return sysId ? { ok: true, sysId, state: dv(r?.state) } : { ok: false, error: `Task „${num}" nicht auf der Instanz gefunden.` }
}

/** sc_task schließen (PATCH state; Standard Closed Complete = 3). */
export async function closeCatalogTask(cfg: ServiceNowConfig, sysId: string, closeState = '3', notes?: string): Promise<{ ok: boolean; error?: string }> {
  if (!sysId) return { ok: false, error: 'Kein sys_id.' }
  const body: Record<string, string> = { state: closeState || '3' }
  if (notes) body.work_notes = notes
  const auth = authOf(await loadIntegrationAccount())
  const res = await api().serviceNowRequest({ instanceUrl: cfg.instanceUrl, method: 'PATCH', table: 'sc_task', sysId, body, fields: 'sys_id,state', auth })
  return res.success ? { ok: true } : { ok: false, error: res.error }
}

/** Incident als „Kopie" einer Vorlage anlegen: relevante Vorlage-Felder als Rohwerte übernehmen + Short description/Caller setzen. */
export async function createIncidentFromTemplate(
  cfg: ServiceNowConfig, templateSysId: string, f: { callerSysId?: string; shortDescription: string },
): Promise<{ ok: boolean; sysId?: string; number?: string; error?: string; needsLogin?: boolean }> {
  if (!f.shortDescription.trim()) return { ok: false, error: 'Kurzbeschreibung fehlt.' }
  const auth = authOf(await loadIntegrationAccount())
  const body: Record<string, string> = { short_description: f.shortDescription.trim() }
  if (templateSysId?.trim()) {
    const tplFields = 'category,subcategory,cmdb_ci,contact_type,impact,urgency,company,location'
    const tpl = await api().serviceNowRequest({ instanceUrl: cfg.instanceUrl, method: 'GET', table: 'incident', sysId: templateSysId.trim(), fields: tplFields, auth })
    if (tpl.success) {
      const t = firstResult(tpl.data)
      for (const k of tplFields.split(',')) { const v = rawVal(t?.[k]); if (v) body[k] = v }
    }
  }
  if (f.callerSysId) body.caller_id = f.callerSysId
  const res = await api().serviceNowRequest({ instanceUrl: cfg.instanceUrl, method: 'POST', table: 'incident', body, fields: 'sys_id,number', auth })
  if (!res.success) return { ok: false, error: res.error, needsLogin: res.needsLogin }
  const r = firstResult(res.data)
  return { ok: true, sysId: rawVal(r?.sys_id) || undefined, number: dv(r?.number) || undefined }
}

/** Datei (Base64) als Anhang an einen Datensatz hängen. */
export async function attachFile(cfg: ServiceNowConfig, table: string, sysId: string, filename: string, dataBase64: string, contentType = 'application/pdf'): Promise<{ ok: boolean; error?: string; needsLogin?: boolean }> {
  const auth = authOf(await loadIntegrationAccount())
  const res = await api().serviceNowAttach({ instanceUrl: cfg.instanceUrl, table, sysId, fileName: filename, contentType, dataBase64, auth })
  return res.success ? { ok: true } : { ok: false, error: res.error, needsLogin: res.needsLogin }
}

/** Direktlink auf den Datensatz in ServiceNow (Standardbrowser). */
export function recordUrl(cfg: ServiceNowConfig, table: SnTable, sysId: string): string {
  const base = cfg.instanceUrl.trim().replace(/\/+$/, '')
  return `${base}/nav_to.do?uri=${table}.do?sys_id=${encodeURIComponent(sysId)}`
}

export interface CertDiag {
  at: string
  url: string
  count: number
  certs: { subjectName: string; issuerName: string; validExpiry: number }[]
}
/** Diagnose: welche Client-Zertifikate hat Electron zuletzt beim Handshake gesehen? */
export async function certDiag(): Promise<CertDiag | null> {
  try { return await api().serviceNowCertDiag() } catch { return null }
}
