// ── Checklisten-Übergabe → ServiceNow-Automatik ──────────────────────────────
// Läuft (voll automatisch, im Hintergrund per REST-API) beim Bestätigen der
// Geräteübergabe: A) Deployment-Task schließen + Checkliste als PDF anhängen,
// B) Primary-User-Incident anlegen. Kein Browser, keine Maus — reine API-Aufrufe.

import type { Checklist } from './checklists'
import { buildChecklistPdf } from './checklistPdf'
import { readCentralAdUsers, buildNameIndex, lookupUserByName } from './adUserDirectory'
import {
  loadConfig, isConfigured, loadHandoverConfig,
  resolveSysUserSysId, findTaskByNumber, closeCatalogTask, createIncidentFromTemplate, attachFile,
} from './servicenow'

export interface StepResult { ok: boolean; skipped?: boolean; info?: string; error?: string }
export interface HandoverResult {
  skipped?: false
  hostname: string
  email: string
  task: StepResult
  attach: StepResult
  incident: StepResult & { number?: string }
}
export interface HandoverSkipped { skipped: true; reason: string }

/** Hostname aus der Seriennummer des neuen Geräts (Konvention „DE" + Serial). */
export function hostnameForSerial(serial: string): string {
  return 'DE' + (serial || '').trim().toUpperCase().replace(/\s+/g, '')
}

/** E-Mail des Empfängers: bevorzugt aus dem AD-Cache, sonst Vorname.Nachname@skf.com. */
export async function emailForName(name: string): Promise<string> {
  try {
    const dir = await readCentralAdUsers()
    if (dir) { const hit = lookupUserByName(buildNameIndex(dir.users), name); if (hit?.email) return hit.email.trim() }
  } catch { /* Fallback unten */ }
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]}.${parts[parts.length - 1]}@skf.com`.replace(/\s+/g, '')
  return ''
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(bin)
}

/**
 * Führt die ServiceNow-Schritte für eine übergebene Checkliste aus.
 * `callerName` = angemeldeter Tool-Nutzer (wird Caller des Incidents).
 * Jeder Schritt ist unabhängig; Fehler werden gemeldet, nicht geworfen.
 */
export async function runHandoverAutomation(c: Checklist, callerName: string): Promise<HandoverResult | HandoverSkipped> {
  const cfg = await loadConfig()
  if (!isConfigured(cfg)) return { skipped: true, reason: 'ServiceNow nicht konfiguriert' }
  const hc = await loadHandoverConfig()
  if (!hc.enabled) return { skipped: true, reason: 'Automatik deaktiviert' }

  const hostname = hostnameForSerial(c.newDeviceSerial)
  const email = await emailForName(c.name)
  const result: HandoverResult = { hostname, email, task: { ok: false }, attach: { ok: false }, incident: { ok: false } }

  // ── Teil A: Task schließen + Checkliste anhängen ──────────────────────────
  if ((c.taskNumber || '').trim()) {
    const t = await findTaskByNumber(cfg, c.taskNumber)
    if (t.ok && t.sysId) {
      try {
        const { doc, filename } = await buildChecklistPdf(c)
        const bytes = new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)
        const a = await attachFile(cfg, 'sc_task', t.sysId, filename, bytesToBase64(bytes))
        result.attach = a.ok ? { ok: true, info: filename } : { ok: false, error: a.error }
      } catch (e) { result.attach = { ok: false, error: 'PDF/Anhang: ' + (e instanceof Error ? e.message : String(e)) } }
      const cl = await closeCatalogTask(cfg, t.sysId, hc.closeState, 'Gerät übergeben — automatisch geschlossen (Admin Tool).')
      result.task = cl.ok ? { ok: true, info: `Task ${c.taskNumber} geschlossen` } : { ok: false, error: cl.error }
    } else {
      result.task = { ok: false, error: t.error }
      result.attach = { ok: false, skipped: true, error: 'Task nicht gefunden' }
    }
  } else {
    result.task = { ok: false, skipped: true, error: 'Keine Task-Nummer' }
    result.attach = { ok: false, skipped: true }
  }

  // ── Teil B: Primary-User-Incident ─────────────────────────────────────────
  if (email) {
    const caller = await resolveSysUserSysId(cfg, callerName)
    const short = `Please delete as the primary user from ${hostname} and input new primary: ${email}`
    const inc = await createIncidentFromTemplate(cfg, hc.templateSysId, { callerSysId: caller.sysId, shortDescription: short })
    result.incident = inc.ok ? { ok: true, number: inc.number, info: `Incident ${inc.number || ''} erstellt` } : { ok: false, error: inc.error }
  } else {
    result.incident = { ok: false, error: `Keine E-Mail für „${c.name}" gefunden` }
  }
  return result
}

/** Kurze Ergebniszeile für einen Toast. */
export function handoverSummary(r: HandoverResult): { allOk: boolean; text: string } {
  const mark = (s: StepResult) => (s.skipped ? '–' : s.ok ? '✓' : '✗')
  const parts = [`${mark(r.task)} Task`, `${mark(r.attach)} Anhang`, `${mark(r.incident)} Incident${r.incident.number ? ' ' + r.incident.number : ''}`]
  const errs = [r.task.error, r.attach.error, r.incident.error].filter((e): e is string => !!e && !/skipped/i.test(e))
  const allOk = r.task.ok && r.attach.ok && r.incident.ok
  return { allOk, text: `ServiceNow: ${parts.join(' · ')}` + (errs.length && !allOk ? ` — ${errs[0]}` : '') }
}
