// ── Geplante Aufgaben: Ausführung im Hintergrund (nur auf dem Automatik-PC) ───
// Bis 17.11.2026 lief der Planer im Bildschirm „Geplante Aufgaben“: Aufgaben liefen nur, solange
// jemand diesen Bildschirm offen hatte — und doppelt, wenn zwei Admins ihn offen hatten.
// Jetzt: Hintergrund-Takt alle 30 s (GeplanteAufgabenController), nur auf dem EINEN Automatik-PC
// (BQ8069 bevorzugt, siehe automatikLeiter.ts). Jede Ausführung (Aufgabe bzw. Befehl je Minute) wird
// vorher in scheduled_tasks/ausgefuehrt.json vermerkt — auch bei einem Wechsel des Automatik-PCs
// innerhalb derselben Minute läuft nichts doppelt.
import { api } from '../electronAPI'
import { CATEGORIES } from '../utils/remoteCommands'
import { ensureWinRM } from '../utils/winrmUtils'
import type { ScheduledTask, UserEmailConfig } from '../types/auth'

export const AUFGABEN_PFAD = 'scheduled_tasks/tasks.json'
export const AUSGEFUEHRT_PFAD = 'scheduled_tasks/ausgefuehrt.json'
const EMAIL_CONFIG_PATH = (u: string) => `email_config/${u}.json`
/** Vermerke älter als 2 Tage werden beim Schreiben entfernt. */
const VERMERK_HALTEN_MS = 2 * 86400_000

export async function loadEmailCfg(username: string): Promise<UserEmailConfig | null> {
  try { return await api().netReadJson<UserEmailConfig>(EMAIL_CONFIG_PATH(username)) } catch { return null }
}

async function sendMail(cfg: UserEmailConfig, to: string, subject: string, body: string) {
  if (!cfg.email || !cfg.smtp) return
  await api().sendEmailRaw({ to, subject, body, smtp: cfg.smtp, port: cfg.port, useTls: cfg.useTls, from: cfg.email, method: cfg.emailMethod, protokoll: { art: 'automatisch', quelle: 'Geplante Aufgaben' } })
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** Passt der Gesamt-Zeitplan einer Aufgabe auf diese Minute? */
export function shouldRunNow(task: ScheduledTask, now: Date): boolean {
  if (task.status !== 'active') return false
  const s = task.schedule
  if (s.time !== hhmm(now)) return false
  const today = now.toISOString().slice(0, 10)
  const dow = now.getDay()
  if (s.type === 'once') return (s.dates ?? []).includes(today)
  if (!(s.days ?? []).includes(dow)) return false
  if (s.repeat === 'biweekly') return Math.floor(now.getTime() / (7 * 86400_000)) % 2 === 0
  if (s.repeat === 'monthly') {
    let d = new Date(now.getFullYear(), now.getMonth(), 1)
    while (d.getDay() !== dow) d = new Date(d.getTime() + 86400000)
    return d.getDate() === now.getDate()
  }
  return true
}

/** Passt der Zeitplan eines einzelnen Befehls auf diese Minute? */
export function scheduleMatchesNow(s: { type: 'once' | 'recurring'; time: string; date?: string; days?: number[]; repeat?: string }, now: Date): boolean {
  if (s.time !== hhmm(now)) return false
  const today = now.toISOString().slice(0, 10)
  const dow = now.getDay()
  if (s.type === 'once') return s.date === today
  if (!(s.days ?? []).includes(dow)) return false
  if (s.repeat === 'biweekly') return Math.floor(now.getTime() / (7 * 86400_000)) % 2 === 0
  if (s.repeat === 'monthly') {
    let d = new Date(now.getFullYear(), now.getMonth(), 1)
    while (d.getDay() !== dow) d = new Date(d.getTime() + 86400000)
    return d.getDate() === now.getDate()
  }
  return true
}

const minutenSchluessel = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${hhmm(d)}`

export type Faellig =
  | { art: 'befehl'; key: string; task: ScheduledTask; cmd: ScheduledTask['commands'][0] }
  | { art: 'aufgabe'; key: string; task: ScheduledTask }

/** Was ist in dieser Minute fällig? (rein, testbar) — mit eindeutigem Schlüssel je Aufgabe/Befehl und Minute. */
export function faellig(tasks: ScheduledTask[], now: Date): Faellig[] {
  const m = minutenSchluessel(now)
  const aus: Faellig[] = []
  for (const task of tasks) {
    if (task.status !== 'active') continue
    if (task.commands.some(c => c.schedule)) {
      for (const cmd of task.commands) {
        if (cmd.schedule && scheduleMatchesNow(cmd.schedule, now)) aus.push({ art: 'befehl', key: `${task.id}-${cmd.cmdId}-${m}`, task, cmd })
      }
    } else if (shouldRunNow(task, now)) {
      aus.push({ art: 'aufgabe', key: `${task.id}-${m}`, task })
    }
  }
  return aus
}

/** Geräte, für die in 60 s etwas fällig ist (WinRM vorher sicherstellen). */
export function baldFaellig(tasks: ScheduledTask[], now: Date): { key: string; devices: string[] }[] {
  const in60 = new Date(now.getTime() + 60000)
  return faellig(tasks, in60).map(f => ({ key: `pre-${f.key}`, devices: f.task.devices }))
}

async function ladeAufgaben(): Promise<ScheduledTask[]> {
  try { const d = await api().netReadJson<ScheduledTask[]>(AUFGABEN_PFAD); return Array.isArray(d) ? d : [] } catch { return [] }
}

/**
 * Ausführung vermerken, BEVOR sie startet. `false` = schon vermerkt (lief bereits, z. B. vom
 * vorherigen Automatik-PC in derselben Minute) → nicht noch einmal.
 */
export async function vermerke(key: string, jetzt = Date.now()): Promise<boolean> {
  let v: Record<string, string> = {}
  try { v = (await api().netReadJsonAsync<Record<string, string>>(AUSGEFUEHRT_PFAD)) || {} } catch { v = {} }
  if (v[key]) return false
  const neu: Record<string, string> = {}
  for (const [k, t] of Object.entries(v)) { const ms = Date.parse(t); if (!isNaN(ms) && jetzt - ms < VERMERK_HALTEN_MS) neu[k] = t }
  neu[key] = new Date(jetzt).toISOString()
  try { await api().netWriteJsonAsync(AUSGEFUEHRT_PFAD, neu) } catch { /* trotzdem ausführen — nur dieser PC prüft */ }
  return true
}

async function fuehreBefehlAus(cmd: { buildCmd: (device: string, input?: string) => string }, device: string, input: string | undefined, taskName: string): Promise<{ ok: boolean; output: string }> {
  try {
    const res = await api().runPowerShell(cmd.buildCmd(device, input), 120000, { quelle: `Geplante Aufgabe: ${taskName}`.slice(0, 80) })
    return { ok: res.exitCode === 0, output: res.stdout || res.stderr || '' }
  } catch (e) { return { ok: false, output: String(e) } }
}

const ersetze = (text: string, o: Record<string, string>) => Object.entries(o).reduce((t, [k, v]) => t.replace(new RegExp(`\\{${k}\\}`, 'g'), v), text)

/** Einen einzeln geplanten Befehl auf allen Geräten der Aufgabe ausführen. */
export async function runSingleCommand(task: ScheduledTask, cmdDef: ScheduledTask['commands'][0], username: string): Promise<void> {
  const emailCfg = await loadEmailCfg(username)
  const cmd = CATEGORIES.find(c => c.id === cmdDef.catId)?.commands.find(c => c.id === cmdDef.cmdId)
  if (!cmd) return
  for (const device of task.devices) {
    const { ok, output } = await fuehreBefehlAus(cmd, device, cmdDef.input, task.name)
    if (cmdDef.notifyEmail && emailCfg) {
      const subject = cmdDef.notifySubject || `IT Admin Tool – ${task.name}: ${cmd.func}`
      const body = ersetze(cmdDef.notifyBody || `Aufgabe: ${task.name}\nBefehl: ${cmd.func}\nGerät: {device}\nErgebnis: {status}\nZeit: {time}`,
        { device, status: ok ? 'Erfolgreich' : 'Fehler', time: new Date().toLocaleString('de-DE'), output: output.slice(0, 500) })
      try { await sendMail(emailCfg, cmdDef.notifyEmail, subject, body) } catch { /* nächste Mail */ }
    }
  }
}

async function pollUntilOnline(device: string, services: string[], cfg: UserEmailConfig, recip: string, taskName: string, customSubject?: string, customBody?: string) {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 60000))
    try {
      const hd = device.replace(/'/g, "''")
      const pollScript = `$o=$false; try{if(Test-Connection '${hd}' -Count 1 -Quiet -EA SilentlyContinue){$o=$true}}catch{}; if(-not $o){try{$t=New-Object System.Net.Sockets.TcpClient;if($t.ConnectAsync('${hd}',445).Wait(2000)){$o=$true};$t.Close()}catch{}}; if($o){"True"}else{"False"}`
      const pingResult = await api().runPowerShell(pollScript, 10000, { quelle: `Geplante Aufgabe: ${taskName} (wieder online?)`.slice(0, 80), art: 'ping' })
      if (pingResult.stdout.trim().toLowerCase() !== 'true') continue
      let svcStatus = ''
      if (services.length > 0) {
        const svcScript = `Get-Service -ComputerName '${hd}' -Name ${services.map(s => `'${s.replace(/'/g, "''")}'`).join(',')} -EA SilentlyContinue | Select-Object Name,Status | ConvertTo-Json -Compress`
        const svcRes = await api().runPowerShell(svcScript, 15000, { quelle: `Geplante Aufgabe: ${taskName} (Dienste)`.slice(0, 80), art: 'lesen' })
        try {
          const svcArr = JSON.parse(svcRes.stdout.trim())
          const arr = Array.isArray(svcArr) ? svcArr : [svcArr]
          if (arr.some((s: Record<string, unknown>) => String(s.Status ?? '') !== 'Running')) continue
          svcStatus = arr.map((s: Record<string, unknown>) => `${s.Name}: ${s.Status}`).join(', ')
        } catch { continue }
      }
      const subject = customSubject || `IT Admin Tool – ${device} wieder online`
      const body = ersetze(customBody || `Aufgabe: {task}\nGerät: {device}\nStatus: Online und bereit\nZeit: {time}\n{services}`,
        { task: taskName, device, time: new Date().toLocaleString('de-DE'), services: svcStatus ? `Dienste: ${svcStatus}` : '' })
      await sendMail(cfg, recip, subject, body)
      return
    } catch { /* nächster Versuch */ }
  }
}

/** Eine Aufgabe (alle Befehle, alle Geräte) ausführen; Ergebnis in tasks.json am FRISCHEN Stand vermerken. */
export async function runTask(task: ScheduledTask, username: string): Promise<void> {
  const emailCfg = await loadEmailCfg(username)
  const hasReboot = task.commands.some(c => c.catId === 'reboot')
  if (hasReboot && task.rebootOptions?.preRebootEmail?.enabled && emailCfg) {
    const mins = task.rebootOptions.preRebootEmail.minutesBefore
    const recip = task.rebootOptions.preRebootEmail.recipients || emailCfg.notifyEmail
    if (recip && mins > 0) {
      try {
        const subject = task.rebootOptions.preRebootEmail.subject || `IT Admin Tool – Reboot geplant: ${task.name}`
        const body = task.rebootOptions.preRebootEmail.body || `Geräte: ${task.devices.join(', ')}\nReboot startet in ${mins} Minuten.`
        await sendMail(emailCfg, recip, subject, body)
      } catch { /* weiter */ }
    }
  }

  const results: Record<string, 'success' | 'error'> = {}
  for (const device of task.devices) {
    for (const sc of task.commands) {
      const cmd = CATEGORIES.find(c => c.id === sc.catId)?.commands.find(c => c.id === sc.cmdId)
      if (!cmd) continue
      const { ok, output } = await fuehreBefehlAus(cmd, device, sc.input, task.name)
      results[`${device}/${sc.cmdId}`] = ok ? 'success' : 'error'
      if (sc.notifyEmail && emailCfg) {
        const subject = sc.notifySubject || `IT Admin Tool – ${task.name}: ${cmd.func}`
        const body = ersetze(sc.notifyBody || `Aufgabe: ${task.name}\nBefehl: ${cmd.func}\nGerät: {device}\nErgebnis: {status}\nZeit: {time}`,
          { device, status: ok ? 'Erfolgreich' : 'Fehler', time: new Date().toLocaleString('de-DE'), output: output.slice(0, 500) })
        try { await sendMail(emailCfg, sc.notifyEmail, subject, body) } catch { /* nächste Mail */ }
      }
    }
  }

  const allOk = Object.values(results).every(r => r === 'success')
  const frisch = await ladeAufgaben()
  if (frisch.some(t => t.id === task.id)) {
    await api().netWriteJson(AUFGABEN_PFAD, frisch.map(t => t.id === task.id ? { ...t, lastRun: new Date().toISOString(), lastResult: allOk ? 'success' as const : 'error' as const } : t)).catch(() => false)
  }

  if (hasReboot && task.rebootOptions?.onlineNotification?.enabled && emailCfg) {
    const recip = task.rebootOptions.onlineNotification.recipients || emailCfg.notifyEmail
    if (recip) {
      const services = task.rebootOptions.onlineNotification.checkServices ?? []
      for (const device of task.devices) {
        void pollUntilOnline(device, services, emailCfg, recip, task.name, task.rebootOptions.onlineNotification.subject, task.rebootOptions.onlineNotification.body)
      }
    }
  }
}

/** Bereits in diesem Fenster angestoßen (Vor-Prüfung / Ausführung) — gegen Mehrfachstart im selben Takt. */
const angestossen = new Set<string>()

/**
 * Ein Takt des Planers (alle 30 s): 60 s vor einer Ausführung WinRM auf den Geräten sicherstellen,
 * fällige Aufgaben/Befehle ausführen. Nur auf dem Automatik-PC aufrufen (Controller prüft).
 */
export async function planerTakt(username: string, now = new Date()): Promise<{ gestartet: string[] }> {
  const tasks = await ladeAufgaben()
  for (const v of baldFaellig(tasks, now)) {
    if (angestossen.has(v.key)) continue
    angestossen.add(v.key)
    for (const d of v.devices) void ensureWinRM(d).catch(() => false)
  }
  const gestartet: string[] = []
  for (const f of faellig(tasks, now)) {
    if (angestossen.has(f.key)) continue
    angestossen.add(f.key)
    if (!(await vermerke(f.key))) continue          // lief schon (z. B. vom vorherigen Automatik-PC)
    gestartet.push(f.key)
    if (f.art === 'befehl') void runSingleCommand(f.task, f.cmd, username).catch(() => undefined)
    else void runTask(f.task, username).catch(() => undefined)
  }
  if (angestossen.size > 500) angestossen.clear()
  return { gestartet }
}
