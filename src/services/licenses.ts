// ── Lizenzen-Kalender – Service ───────────────────────────────────────────────
// Zentrale Liste aller Lizenzen (Anwendungen / Dienstleistungen) mit Ablauf-
// Datum. Sendet E-Mail-Benachrichtigungen vor Ablauf und triggert In-App-
// Popups (30/20/10 Tage vorher). Alles auf Netzlaufwerk → live für alle.
//
// Speicher:
//   licenses/licenses.json                → die Lizenzen
//   licenses/notifications_log.json        → schon versendete Mails (Dedup über alle App-Instanzen)
//   licenses/dismissals/<username>.json    → per-User weggeklickte Popups

import { api } from '../electronAPI'
import type { UserEmailConfig } from '../types/auth'

export interface LicenseAttachment {
  id: string
  filename: string
  size: number                  // Bytes
  mime?: string
  storedPath: string            // relativer Netzlaufwerk-Pfad
  addedBy: string
  addedAt: string
}

export interface License {
  id: string
  name: string                  // Anwendung / Dienstleistung
  expiryDate: string            // YYYY-MM-DD
  comment1: string              // optional: "Wie wird neue Lizenz beantragt?"
  comment2: string              // optional: zweites Notizfeld
  notifyEmail: string           // Komma-/Semikolon-getrennte Adressen
  notifyDays: number[]          // zusätzliche Erinnerungs-Tage vor Ablauf
  autoEmail30Days: boolean      // Auto-Mail 30 Tage vorher (Standard: true)
  attachments: LicenseAttachment[]  // PDFs, Bilder, .lic-Dateien u. a.
  createdBy: string
  createdAt: string
  updatedAt?: string
}

interface LicenseStore { version: number; licenses: License[] }

interface NotificationLog {
  version: number
  sent: Array<{
    licenseId: string
    threshold: number
    expiryDate: string          // damit bei verlängerter Lizenz wieder gemailt wird
    sentAt: string
    sentTo: string
  }>
}

interface UserDismissals {
  username: string
  dismissals: Array<{
    licenseId: string
    threshold: number           // 30, 20 oder 10
    expiryDate: string          // damit nach Verlängerung neu blinkt
    dismissedAt: string
  }>
}

const LIC_FILE = 'licenses/licenses.json'
const LOG_FILE = 'licenses/notifications_log.json'
const DISMISSAL_FILE = (u: string) => `licenses/dismissals/${u}.json`
const EMAIL_CFG_PATH = (u: string) => `email_config/${u}.json`
const ATT_DIR = 'licenses/attachments'

export const POPUP_THRESHOLDS = [30, 20, 10] as const
export const NOTIFY_DAY_OPTIONS = [90, 60, 45, 30, 21, 14, 10, 7, 3, 1] as const

const ERR_NET = 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.'

function newId(): string {
  return `lic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ── Tagesdifferenz (heute → Ablauf), 0 = heute, negativ = abgelaufen ──────────
export function daysUntil(expiryDate: string): number {
  if (!expiryDate) return NaN
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const parts = expiryDate.split('-')
  if (parts.length !== 3) return NaN
  const exp = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  exp.setHours(0, 0, 0, 0)
  return Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function formatGermanDate(iso: string): string {
  if (!iso) return ''
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

// ── Stammdaten ────────────────────────────────────────────────────────────────
async function loadStore(): Promise<LicenseStore> {
  try {
    const d = await api().netReadJson<LicenseStore>(LIC_FILE)
    if (!d || !Array.isArray(d.licenses)) return { version: 1, licenses: [] }
    return { version: d.version ?? 1, licenses: d.licenses.map(normalize) }
  } catch { return { version: 1, licenses: [] } }
}

function normalize(l: Partial<License>): License {
  return {
    id: l.id ?? newId(),
    name: l.name ?? '',
    expiryDate: l.expiryDate ?? '',
    comment1: l.comment1 ?? '',
    comment2: l.comment2 ?? '',
    notifyEmail: l.notifyEmail ?? '',
    notifyDays: Array.isArray(l.notifyDays) ? l.notifyDays.filter(n => Number.isInteger(n) && n > 0) : [],
    autoEmail30Days: l.autoEmail30Days !== false,
    attachments: Array.isArray(l.attachments) ? l.attachments : [],
    createdBy: l.createdBy ?? '',
    createdAt: l.createdAt ?? new Date().toISOString(),
    updatedAt: l.updatedAt,
  }
}

async function saveStore(s: LicenseStore): Promise<boolean> {
  try { return await api().netWriteJson(LIC_FILE, s) } catch { return false }
}

export async function listLicenses(): Promise<License[]> {
  const s = await loadStore()
  return s.licenses.sort((a, b) => {
    const da = daysUntil(a.expiryDate), db = daysUntil(b.expiryDate)
    if (isNaN(da)) return 1
    if (isNaN(db)) return -1
    return da - db
  })
}

/** ID kann vom Aufrufer vorgegeben werden (für Vor-Upload von Anhängen). */
export function generateLicenseId(): string { return newId() }

export async function createLicense(data: Omit<License, 'createdAt' | 'updatedAt'> & { id?: string }): Promise<{ ok: boolean; license?: License; error?: string }> {
  const s = await loadStore()
  const lic: License = {
    ...data,
    id: data.id || newId(),
    attachments: data.attachments || [],
    createdAt: new Date().toISOString(),
  }
  s.licenses.push(lic)
  const ok = await saveStore(s)
  if (!ok) return { ok: false, error: ERR_NET }
  return { ok: true, license: lic }
}

export async function updateLicense(id: string, patch: Partial<License>): Promise<{ ok: boolean; error?: string }> {
  const s = await loadStore()
  const idx = s.licenses.findIndex(l => l.id === id)
  if (idx < 0) return { ok: false, error: 'Lizenz nicht gefunden' }
  s.licenses[idx] = { ...s.licenses[idx], ...patch, id: s.licenses[idx].id, updatedAt: new Date().toISOString() }
  const ok = await saveStore(s)
  if (!ok) return { ok: false, error: ERR_NET }
  return { ok: true }
}

export async function deleteLicense(id: string): Promise<{ ok: boolean; error?: string }> {
  const s = await loadStore()
  s.licenses = s.licenses.filter(l => l.id !== id)
  const ok = await saveStore(s)
  if (!ok) return { ok: false, error: ERR_NET }
  return { ok: true }
}

// ── E-Mail-Versand mit Dedup ───────────────────────────────────────────────────
async function loadLog(): Promise<NotificationLog> {
  try {
    const d = await api().netReadJson<NotificationLog>(LOG_FILE)
    if (!d || !Array.isArray(d.sent)) return { version: 1, sent: [] }
    return d
  } catch { return { version: 1, sent: [] } }
}
async function saveLog(s: NotificationLog): Promise<boolean> {
  try { return await api().netWriteJson(LOG_FILE, s) } catch { return false }
}

/** Schwellwerte einer Lizenz: notifyDays + (autoEmail30Days ? 30 : []). */
function emailThresholds(l: License): number[] {
  const set = new Set<number>()
  for (const d of l.notifyDays) if (Number.isInteger(d) && d > 0) set.add(d)
  if (l.autoEmail30Days) set.add(30)
  return [...set].sort((a, b) => b - a)
}

function splitEmails(s: string): string[] {
  return (s || '').split(/[,;]/).map(x => x.trim()).filter(Boolean)
}

/**
 * Prüft alle Lizenzen und versendet ausstehende Benachrichtigungen über die
 * E-Mail-Config des aktuell angemeldeten Benutzers. Dedup-Eintrag wird VOR dem
 * Versand geschrieben, damit parallele App-Instanzen nicht doppelt mailen.
 */
export async function sendPendingEmails(currentUser: string): Promise<{ sent: number; skipped: number }> {
  if (!currentUser) return { sent: 0, skipped: 0 }
  let cfg: UserEmailConfig | null = null
  try { cfg = await api().netReadJson<UserEmailConfig>(EMAIL_CFG_PATH(currentUser)) } catch { /* keine Config */ }
  if (!cfg || !cfg.email || !cfg.smtp) return { sent: 0, skipped: 0 }

  const licenses = (await loadStore()).licenses
  const log = await loadLog()

  // Sicherheitsnetz gegen "Spam alter Daten": Lizenzen, die mehr als
  // CATCHUP_CAP_DAYS abgelaufen sind, werden NICHT nachträglich vermailt.
  // Bis zu dieser Schwelle gilt: jede Mail, die in der Funkstille fällig
  // gewesen wäre (auch wenn die Lizenz inzwischen abgelaufen ist), wird beim
  // nächsten Start des Tools nachgereicht — pro Schwelle genau einmal.
  const CATCHUP_CAP_DAYS = 60

  let sent = 0, skipped = 0
  for (const lic of licenses) {
    const remaining = daysUntil(lic.expiryDate)
    if (isNaN(remaining)) continue
    if (remaining < -CATCHUP_CAP_DAYS) continue              // zu lange her
    const recipients = splitEmails(lic.notifyEmail)
    if (recipients.length === 0) { skipped++; continue }
    const thresholds = emailThresholds(lic)
    for (const t of thresholds) {
      if (remaining > t) continue                            // Schwelle noch nicht erreicht
      const already = log.sent.find(s => s.licenseId === lic.id && s.threshold === t && s.expiryDate === lic.expiryDate)
      if (already) continue
      // Vor-Speichern, damit Race-Condition mit anderen Instanzen abgefangen wird
      log.sent.push({ licenseId: lic.id, threshold: t, expiryDate: lic.expiryDate, sentAt: new Date().toISOString(), sentTo: recipients.join(', ') })
      await saveLog(log)
      try {
        const expired = remaining < 0
        // Threshold wäre rechnerisch an diesem Datum fällig gewesen
        const dueDate = new Date()
        dueDate.setHours(0, 0, 0, 0)
        dueDate.setDate(dueDate.getDate() + (remaining - t))
        const isLate = dueDate.getTime() < new Date().setHours(0, 0, 0, 0) - 24 * 60 * 60 * 1000
        const subjectPrefix = isLate ? '[Nachgereicht] ' : ''
        const subject = expired
          ? `${subjectPrefix}Lizenz abgelaufen: ${lic.name}`
          : `${subjectPrefix}Lizenz läuft in ${remaining} Tagen aus: ${lic.name}`
        const statusLine = expired
          ? `Die Lizenz für "${lic.name}" ist am ${formatGermanDate(lic.expiryDate)} abgelaufen (vor ${Math.abs(remaining)} Tagen).`
          : `Die Lizenz für "${lic.name}" läuft am ${formatGermanDate(lic.expiryDate)} aus (noch ${remaining} Tage).`
        const trailer = isLate
          ? `Hinweis: Diese ${t}-Tage-Erinnerung wäre am ${dueDate.toLocaleDateString('de-DE')} fällig gewesen, konnte aber erst jetzt verschickt werden (Tool war zwischenzeitlich nicht geöffnet).`
          : `Diese Erinnerung wurde ${t === 30 && lic.autoEmail30Days && !lic.notifyDays.includes(30) ? 'automatisch ' : ''}beim Erreichen von ${t} Tagen vor Ablauf verschickt.`
        await api().sendEmailRaw({
          to: recipients.join(', '),
          subject,
          body:
`Hallo,

${statusLine}

${lic.comment1 ? 'Hinweis 1:\n' + lic.comment1 + '\n' : ''}${lic.comment2 ? 'Hinweis 2:\n' + lic.comment2 + '\n' : ''}
${trailer}

— IT Admin Tool · Lizenzen-Kalender`,
          smtp: cfg.smtp, port: cfg.port || 587, useTls: cfg.useTls,
          user: cfg.smtpUser, pass: cfg.smtpPass, from: cfg.email,
          method: cfg.emailMethod,
        })
        sent++
      } catch {
        // Versand fehlgeschlagen: Log-Eintrag wieder entfernen, damit nächste Instanz erneut probiert
        log.sent = log.sent.filter(s => !(s.licenseId === lic.id && s.threshold === t && s.expiryDate === lic.expiryDate))
        await saveLog(log)
      }
    }
  }
  return { sent, skipped }
}

// ── In-App-Popups (per-User-Dismissal) ────────────────────────────────────────

export interface ActiveAlarm {
  license: License
  threshold: number       // 30, 20 oder 10 – aktueller noch nicht dismisster Schwellwert
  daysRemaining: number
}

export async function loadDismissals(username: string): Promise<UserDismissals> {
  try {
    const d = await api().netReadJson<UserDismissals>(DISMISSAL_FILE(username))
    if (!d || !Array.isArray(d.dismissals)) return { username, dismissals: [] }
    return d
  } catch { return { username, dismissals: [] } }
}

export async function dismissAlarm(username: string, licenseId: string, threshold: number, expiryDate: string): Promise<boolean> {
  if (!username) return false
  const d = await loadDismissals(username)
  // Doppelte Einträge vermeiden
  const exists = d.dismissals.some(x => x.licenseId === licenseId && x.threshold === threshold && x.expiryDate === expiryDate)
  if (!exists) {
    d.dismissals.push({ licenseId, threshold, expiryDate, dismissedAt: new Date().toISOString() })
  }
  try { return await api().netWriteJson(DISMISSAL_FILE(username), d) } catch { return false }
}

/**
 * Pro Lizenz wird der NIEDRIGSTE Schwellwert ermittelt, der schon erreicht
 * wurde und vom Benutzer noch NICHT weggeklickt wurde. Beispiel: noch 12 Tage
 * → Schwellwerte 30 + 20 + 10 erreicht. Wenn 30 + 20 weggeklickt: zeigt nur
 * noch 10. Wenn alle weggeklickt: kein Alarm.
 */
export function computeActiveAlarms(licenses: License[], dismissals: UserDismissals): ActiveAlarm[] {
  const result: ActiveAlarm[] = []
  for (const lic of licenses) {
    const remaining = daysUntil(lic.expiryDate)
    if (isNaN(remaining) || remaining < 0) continue
    let chosen: number | null = null
    // niedrigster Schwellwert wirkt am dringlichsten → wir nehmen den
    // niedrigsten, der erreicht UND nicht dismisst ist
    for (const t of POPUP_THRESHOLDS) {                   // 30, 20, 10
      if (remaining > t) continue
      const dismissed = dismissals.dismissals.some(d => d.licenseId === lic.id && d.threshold === t && d.expiryDate === lic.expiryDate)
      if (!dismissed) chosen = t                          // späterer (kleinerer) Schwellwert überschreibt
    }
    if (chosen !== null) result.push({ license: lic, threshold: chosen, daysRemaining: remaining })
  }
  // dringlichste zuerst
  result.sort((a, b) => a.daysRemaining - b.daysRemaining)
  return result
}

// ── Anhänge ──────────────────────────────────────────────────────────────────

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  txt: 'text/plain', csv: 'text/csv',
  zip: 'application/zip',
}

function extOf(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : ''
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 160)
}

export function isImageAttachment(att: LicenseAttachment): boolean {
  return (att.mime || '').startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(extOf(att.filename))
}

export function formatBytes(b: number): string {
  if (!b || b < 1024) return `${b || 0} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

/** Lädt eine lokale Datei aufs Netzlaufwerk hoch und gibt das Attachment-Objekt zurück. */
export async function uploadAttachmentFile(licenseId: string, filePath: string, by: string): Promise<{ ok: boolean; attachment?: LicenseAttachment; error?: string }> {
  try {
    const r = await api().readFile(filePath)
    if (!r.success || !r.data) return { ok: false, error: r.error || 'Datei konnte nicht gelesen werden.' }
    const filename = filePath.split(/[\\/]/).pop() || 'datei'
    return uploadAttachmentBase64(licenseId, r.data, filename, by)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Schreibt Roh-Daten (Base64) als Anhang aufs Netzlaufwerk und gibt Metadaten zurück. */
export async function uploadAttachmentBase64(licenseId: string, base64: string, filename: string, by: string): Promise<{ ok: boolean; attachment?: LicenseAttachment; error?: string }> {
  const attId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const safe = sanitizeFilename(filename || `datei_${attId}`)
  const storedPath = `${ATT_DIR}/${licenseId}/${attId}__${safe}`
  const ok = await api().netWriteRawFile(storedPath, base64)
  if (!ok) return { ok: false, error: 'Anhang konnte nicht aufs Netzlaufwerk geschrieben werden.' }
  const att: LicenseAttachment = {
    id: attId,
    filename: safe,
    size: Math.round(base64.length * 0.75),
    mime: MIME_BY_EXT[extOf(safe)],
    storedPath,
    addedBy: by,
    addedAt: new Date().toISOString(),
  }
  return { ok: true, attachment: att }
}

/** Anhang lesen (Base64) – z. B. für Bild-Vorschau. */
export async function readLicenseAttachmentBase64(att: LicenseAttachment): Promise<string | null> {
  try { return await api().netReadRawFile(att.storedPath) } catch { return null }
}

/** Anhang vom Netzlaufwerk löschen. */
export async function deleteAttachmentFile(att: LicenseAttachment): Promise<boolean> {
  try { return await api().netDeleteFile(att.storedPath) } catch { return false }
}

/** Anhang lokal speichern (Save-As) und öffnen. */
export async function downloadLicenseAttachment(att: LicenseAttachment): Promise<{ ok: boolean; error?: string }> {
  try {
    const b64 = await api().netReadRawFile(att.storedPath)
    if (!b64) return { ok: false, error: 'Anhang nicht gefunden.' }
    const ext = extOf(att.filename) || '*'
    const path = await api().saveFileDialog(att.filename, [
      { name: ext.toUpperCase(), extensions: [ext] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ])
    if (!path) return { ok: true }
    const r = await api().writeFile(path, b64)
    if (!r.success) return { ok: false, error: r.error || 'Speichern fehlgeschlagen.' }
    api().openPath(path).catch(() => {})
    return { ok: true }
  } catch {
    return { ok: false, error: 'Anhang konnte nicht geladen werden.' }
  }
}
