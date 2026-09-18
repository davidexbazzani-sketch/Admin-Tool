// ── Passwort-Ablauf-Erinnerungen (Proaktives Radar) ─────────────────────────
// Schickt Mitarbeitern, deren Windows-Passwort am nächsten Werktag abläuft, eine
// Erinnerungs-Mail. Wochenend-intelligent: läuft es am Sa/So/Mo ab, geht die Mail
// schon am Freitag (letzter Werktag vor Ablauf) raus. Versand über Outlook-COM
// (api().sendEmailRaw), wie die Server-Monitor-Alarme. Doppelversand-Schutz je Tag.

import { api } from '../electronAPI'
import type { HygieneUser } from './proactiveRadar'

const CONFIG_FILE = 'radar/pwd_reminder_config.json'
const STATE_FILE = 'radar/pwd_reminder_state.json'

export interface PwdReminderConfig { enabled: boolean; testRecipient?: string }
interface ReminderState { date: string; sentSams: string[] }

const WOCHENTAG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

// ── Datums-/Wochenend-Logik ──────────────────────────────────────────────────
function dateOnly(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function isWeekend(d: Date): boolean { const w = d.getDay(); return w === 0 || w === 6 }
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Letzter Werktag VOR dem Ablaufdatum (Sa/So werden übersprungen). */
function lastWorkingDayBefore(expiry: Date): Date {
  const d = dateOnly(expiry)
  d.setDate(d.getDate() - 1)
  while (isWeekend(d)) d.setDate(d.getDate() - 1)
  return d
}

/**
 * Ist HEUTE der Tag, an dem der Nutzer benachrichtigt werden soll?
 * Nur an Werktagen; nur wenn der letzte Werktag vor dem Ablauf = heute ist.
 * Dadurch: Di→Mi = „1 Tag"; Fr→Sa/So/Mo; bereits abgelaufene/heute ablaufende NIE.
 */
export function shouldNotify(expiryIso: string, now: Date): boolean {
  if (!expiryIso) return false
  const e = new Date(expiryIso)
  if (isNaN(e.getTime())) return false
  const today = dateOnly(now)
  if (isWeekend(today)) return false
  return lastWorkingDayBefore(e).getTime() === today.getTime()
}

// Schlankes Ziel-Objekt (aus HygieneUser ODER aus den Radar-Items ableitbar).
export interface ReminderTarget { sam: string; name: string; email: string; expiry?: string; daysLeft?: number | null }

/** Aktive, betroffene Nutzer → Ziele. Nur enabled & nicht „nie ablaufen". */
export function targetsFromUsers(users: HygieneUser[]): ReminderTarget[] {
  return (users || [])
    .filter(u => u.enabled && !u.pwdNeverExpires)
    .map(u => ({ sam: u.sam, name: u.name, email: u.email || '', expiry: u.pwdExpiry, daysLeft: u.pwdDaysLeft }))
}
/** Ziele aus den bereits berechneten „Passwort läuft ab"-Items (immer aktuell zur Anzeige). */
export function targetsFromItems(items: { category: string; title: string; days: number; refDateIso: string; fields: Record<string, string>; person?: { sam?: string } }[]): ReminderTarget[] {
  return (items || [])
    .filter(i => i.category === 'pwdExpiring')
    .map(i => ({
      sam: i.fields['Corp-ID'] || i.person?.sam || '',
      name: i.fields.Benutzer || i.title,
      email: i.fields['E-Mail'] || '',
      expiry: i.refDateIso || undefined,
      daysLeft: i.days,
    }))
}

/** Exaktes Ablaufdatum (bevorzugt), sonst grober Fallback aus „Tage bis Ablauf"
 *  (falls der AD-Cache noch von einer älteren Version ohne exaktes Datum stammt). */
function effectiveExpiryIso(t: ReminderTarget, now: Date): string {
  if (t.expiry) return t.expiry
  if (t.daysLeft != null && !isNaN(t.daysLeft)) {
    const d = dateOnly(now); d.setDate(d.getDate() + t.daysLeft); d.setHours(12, 0, 0, 0)
    return d.toISOString()
  }
  return ''
}

/** Ziele mit E-Mail, die heute erinnert werden sollen. */
export function recipientsToday(targets: ReminderTarget[], now: Date): ReminderTarget[] {
  return (targets || []).filter(t => (t.email || '').trim() && shouldNotify(effectiveExpiryIso(t, now), now))
}

export function previewCount(targets: ReminderTarget[], now: Date): number {
  return recipientsToday(targets, now).length
}

export interface ReminderPreview { name: string; email: string; expiry: string; subject: string; body: string }
/** Vorschau der heute fälligen Erinnerungen: pro Empfänger die fertige Mail. */
export function buildPreviews(targets: ReminderTarget[], now: Date): ReminderPreview[] {
  return recipientsToday(targets, now).map(t => {
    const expiry = effectiveExpiryIso(t, now)
    const { subject, body } = buildReminderMail({ name: t.name, pwdExpiry: expiry }, now)
    return { name: t.name, email: (t.email || '').trim(), expiry, subject, body }
  })
}

// ── Mail bauen ───────────────────────────────────────────────────────────────
function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function vornameOf(name: string): string {
  const n = (name || '').trim()
  if (!n) return ''
  if (n.includes(',')) return n.split(',')[1]?.trim().split(/\s+/)[0] || n   // „Nachname, Vorname"
  return n.split(/\s+/)[0]
}
/** Name aus einer E-Mail-Adresse ableiten: „davide.bazzani@firma.de" → „Davide Bazzani". */
function nameFromEmail(email: string): string {
  const local = (email.split('@')[0] || '').replace(/[._-]+/g, ' ').trim()
  return local.split(/\s+/).map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

export function buildReminderMail(user: { name: string; pwdExpiry?: string }, now: Date): { subject: string; body: string } {
  const e = user.pwdExpiry ? new Date(user.pwdExpiry) : new Date(dateOnly(now).getTime() + 86400000)
  const eDate = dateOnly(e)
  const tomorrow = dateOnly(now); tomorrow.setDate(tomorrow.getDate() + 1)
  const istMorgen = eDate.getTime() === tomorrow.getTime()
  const tag = WOCHENTAG[eDate.getDay()]                 // Wochentag des Ablaufs (z. B. „Montag")
  const heuteTag = WOCHENTAG[dateOnly(now).getDay()]    // Wochentag heute (z. B. „Freitag")
  const datum = eDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })   // „13.09.2026"
  const wann = istMorgen ? 'morgen' : `am ${tag}, ${datum}`
  const vorname = vornameOf(user.name)
  const subject = istMorgen
    ? 'Wichtig: Dein Windows-Passwort läuft morgen ab – bitte heute neu setzen'
    : `Wichtig: Dein Windows-Passwort läuft ${wann} ab – bitte heute neu setzen`   // ${wann} = „am <Wochentag>, <Datum>"
  // „morgen"-Fall = normaler Werktag; „nicht morgen" entsteht nur am Freitag für
  // Sa/So/Mo-Abläufe → Wochenend-Hinweis.
  const dringlichkeit = istMorgen
    ? `<p>Bitte setz es <b>noch heute selbst</b> neu — sonst hast du <b>ab morgen keinen Zugriff mehr</b> ` +
      `auf deine Systeme (Anmeldung, E-Mail, SAP, Netzlaufwerke usw.).</p>`
    : `<p>Da das <b>Wochenende dazwischenliegt</b>, setz es bitte <b>noch heute (${esc(heuteTag)}) selbst</b> neu — ` +
      `sonst hast du <b>am ${esc(tag)} keinen Zugriff mehr</b> auf deine Systeme (Anmeldung, E-Mail, SAP, Netzlaufwerke usw.).</p>`
  const body =
    `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:11pt;color:#111;">` +
    `<p>Hallo${vorname ? ' ' + esc(vorname) : ''},</p>` +
    `<p>dein Windows-Passwort läuft <b>${esc(wann)}</b> ab.</p>` +
    dringlichkeit +
    `<p><b>Am einfachsten änderst du dein Passwort direkt am PC über die Tastenkombination ` +
    `<span style="font-family:Consolas,monospace;background:#eee;padding:1px 5px;border-radius:3px;">Strg + Alt + Entf</span> ` +
    `→ „Kennwort ändern".</b></p>` +
    `<p>So geht's:</p>` +
    `<ol>` +
    `<li><b>Strg + Alt + Entf</b> drücken und <b>„Kennwort ändern"</b> wählen.</li>` +
    `<li>Aktuelles Passwort eingeben, dann zweimal das neue Passwort.</li>` +
    `</ol>` +
    `<p style="color:#666;font-size:10pt;">Diese Erinnerung wird automatisch von der IT versendet. ` +
    `Bei Problemen mit der Passwortänderung melde dich bitte bei der IT.</p>` +
    `<p>Viele Grüße<br>Deine IT</p>` +
    `</div>`
  return { subject, body }
}

// ── Konfiguration ────────────────────────────────────────────────────────────
export async function loadReminderConfig(): Promise<PwdReminderConfig> {
  try {
    const c = await api().netReadJson<PwdReminderConfig>(CONFIG_FILE)
    if (c) return { enabled: c.enabled === true, testRecipient: c.testRecipient || '' }
  } catch { /* Default */ }
  return { enabled: false, testRecipient: '' }
}
export async function saveReminderConfig(cfg: PwdReminderConfig): Promise<boolean> {
  try { return await api().netWriteJson(CONFIG_FILE, { enabled: cfg.enabled === true, testRecipient: (cfg.testRecipient || '').trim() }) }
  catch { return false }
}

// ── Versand ──────────────────────────────────────────────────────────────────
async function loadState(today: string): Promise<ReminderState> {
  try {
    const s = await api().netReadJson<ReminderState>(STATE_FILE)
    if (s && s.date === today && Array.isArray(s.sentSams)) return { date: today, sentSams: s.sentSams }
  } catch { /* neu */ }
  return { date: today, sentSams: [] }
}
async function saveState(state: ReminderState): Promise<void> {
  try { await api().netWriteJson(STATE_FILE, state) } catch { /* egal */ }
}

// ── Atomarer(-ischer) Doppelversand-Schutz je Empfänger ──────────────────────
// Jede Operation liest die zentrale State-Datei FRISCH und schreibt sofort zurück.
// Dadurch reserviert die versendende Instanz einen Empfänger, BEVOR die Mail rausgeht
// — das Doppelversand-Fenster über mehrere gleichzeitig offene Tools schrumpft auf die
// winzige Lese-→-Schreib-Lücke je Empfänger (statt einmal am Anfang / einmal am Ende).
/** Reserviert einen Empfänger für heute. true = neu reserviert, false = war bereits vermerkt. */
async function reserveSam(today: string, sam: string): Promise<boolean> {
  const st = await loadState(today)
  if (st.sentSams.includes(sam)) return false
  st.sentSams.push(sam)
  await saveState(st)
  return true
}
/** Nimmt eine Reservierung zurück (z. B. nach fehlgeschlagenem Versand → späterer Retry möglich). */
async function unreserveSam(today: string, sam: string): Promise<void> {
  const st = await loadState(today)
  const i = st.sentSams.indexOf(sam)
  if (i >= 0) { st.sentSams.splice(i, 1); await saveState(st) }
}
/** Stellt sicher, dass ein Empfänger als „heute benachrichtigt" vermerkt ist (force-Pfad). */
async function recordSam(today: string, sam: string): Promise<void> {
  const st = await loadState(today)
  if (!st.sentSams.includes(sam)) { st.sentSams.push(sam); await saveState(st) }
}

export interface SendResult { sent: number; skipped: number; failed: number; ohneMail: number; error?: string }

/**
 * Alle heute fälligen Erinnerungen versenden. Doppelversand-Schutz je Tag über
 * die zentrale State-Datei (sam + Datum), mit Reservieren-VOR-Senden je Empfänger,
 * damit auch bei mehreren offenen Tools jede Mail nur EINMAL rausgeht. `force`
 * ignoriert den Dedup-Status (für den „Jetzt senden"-Button erneut).
 */
export async function sendReminders(targets: ReminderTarget[], now: Date, opts?: { force?: boolean }): Promise<SendResult> {
  const today = dateKey(dateOnly(now))
  const ziele = recipientsToday(targets, now)
  const res: SendResult = { sent: 0, skipped: 0, failed: 0, ohneMail: 0 }
  for (const t of ziele) {
    const to = (t.email || '').trim()
    if (!to) { res.ohneMail++; continue }
    // Reservieren-vor-Senden (nur im Nicht-force-Fall): schon vermerkt → überspringen.
    if (!opts?.force && t.sam) {
      const neu = await reserveSam(today, t.sam)
      if (!neu) { res.skipped++; continue }
    }
    const { subject, body } = buildReminderMail({ name: t.name, pwdExpiry: effectiveExpiryIso(t, now) }, now)
    try {
      const r = await api().sendEmailRaw({ to, subject, body, html: true, smtp: '', port: 587 })
      if (r.success) {
        res.sent++
        if (opts?.force && t.sam) await recordSam(today, t.sam)          // force: State nachtragen
      } else {
        res.failed++
        if (!opts?.force && t.sam) await unreserveSam(today, t.sam)      // Reservierung zurücknehmen
      }
    } catch {
      res.failed++
      if (!opts?.force && t.sam) await unreserveSam(today, t.sam)
    }
  }
  return res
}

/** Wie viele der heute fälligen Empfänger wurden heute bereits benachrichtigt?
 *  Für die „wirklich noch einmal verschicken?"-Rückfrage im UI. */
export async function sentStatusToday(targets: ReminderTarget[], now: Date): Promise<{ recipients: number; alreadySent: number }> {
  const today = dateKey(dateOnly(now))
  const ziele = recipientsToday(targets, now)
  const st = await loadState(today)
  const set = new Set(st.sentSams)
  const alreadySent = ziele.filter(t => t.sam && set.has(t.sam)).length
  return { recipients: ziele.length, alreadySent }
}

/** Eine Beispiel-Mail an die Testadresse — nutzt einen echten heutigen Empfänger
 *  als Vorlage, sonst Musterdaten (Ablauf „morgen"). Kein Dedup, kein Versand an Mitarbeiter. */
export async function sendTestReminder(toEmail: string, targets: ReminderTarget[], now: Date): Promise<{ success: boolean; error?: string }> {
  const to = (toEmail || '').trim()
  if (!to) return { success: false, error: 'Keine Testadresse angegeben.' }
  const beispiel = recipientsToday(targets, now)[0]
  const musterExpiry = new Date(dateOnly(now).getTime() + 86400000).toISOString()
  // Anrede = Name aus der Test-Empfängeradresse (z. B. „davide.bazzani@…" → „Davide"),
  // Ablaufdatum von einem echten heutigen Empfänger (sonst Muster „morgen").
  const vorlage = {
    name: nameFromEmail(to),
    pwdExpiry: beispiel ? effectiveExpiryIso(beispiel, now) : musterExpiry,
  }
  const { subject, body } = buildReminderMail(vorlage, now)
  try {
    const r = await api().sendEmailRaw({ to, subject: '[TEST] ' + subject, body, html: true, smtp: '', port: 587 })
    return { success: r.success, error: r.error }
  } catch (e) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
}
