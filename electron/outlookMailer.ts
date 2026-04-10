// ── Outlook COM via Scheduled Task ─────────────────────────────────────────
// Solves the UIPI problem: when the app runs as admin (elevated), direct COM
// calls to Outlook (which runs in the normal user session) are blocked.
// By running the VBScript as a Scheduled Task under the logged-in user,
// the script executes in the non-elevated session and can access Outlook.

import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'
import { userInfo } from 'os'

interface MailOpts {
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  html?: boolean
  attachmentPath?: string
}

interface MailResult {
  success: boolean
  error?: string
  method?: string
}

/** Detect the interactive desktop user (may differ from process owner when elevated) */
function getDesktopUser(): string {
  try {
    const out = execSync('query user 2>nul || quser 2>nul', { encoding: 'utf-8', windowsHide: true, timeout: 5000 })
    const lines = out.split('\n').filter(l => l.includes('Active') || l.includes('Aktiv'))
    if (lines.length > 0) {
      const u = lines[0].trim().split(/\s+/)[0].replace(/^>/, '')
      if (u) return u
    }
  } catch { /* fallback below */ }
  return userInfo().username
}

/** Generate a unique task/file name to avoid collisions */
function uid(): string {
  return `itmail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Send an email via Outlook COM, executed as a Scheduled Task in the user's session.
 * Works even when the app is running elevated (as admin).
 */
export async function sendViaOutlookScheduledTask(opts: MailOpts): Promise<MailResult> {
  const id = uid()
  const bodyPath = join(tmpdir(), `${id}_body.txt`)
  const vbsPath = join(tmpdir(), `${id}.vbs`)
  const resultPath = join(tmpdir(), `${id}_result.txt`)
  const taskName = `ITAdminMail_${id}`

  try {
    // Write body as UTF-8 file (avoids all VBS escaping issues with umlauts, quotes, newlines)
    writeFileSync(bodyPath, opts.body, 'utf-8')

    // Build VBScript
    const vbs = [
      'On Error Resume Next',
      '',
      '\'  Read body from UTF-8 file via ADODB.Stream',
      'Dim stream : Set stream = CreateObject("ADODB.Stream")',
      'stream.Type = 2', // adTypeText
      'stream.Charset = "UTF-8"',
      `stream.Open`,
      `stream.LoadFromFile "${bodyPath.replace(/\\/g, '\\\\')}"`,
      'Dim bodyText : bodyText = stream.ReadText',
      'stream.Close',
      '',
      'Dim objOutlook : Set objOutlook = CreateObject("Outlook.Application")',
      'If Err.Number <> 0 Then',
      `  WriteResult "ERR:Outlook nicht verfuegbar - " & Err.Description`,
      '  WScript.Quit 1',
      'End If',
      '',
      'Dim objMail : Set objMail = objOutlook.CreateItem(0)',
      `objMail.To = "${(opts.to || '').replace(/"/g, '')}"`,
      opts.cc ? `objMail.CC = "${opts.cc.replace(/"/g, '')}"` : '',
      opts.bcc ? `objMail.BCC = "${opts.bcc.replace(/"/g, '')}"` : '',
      `objMail.Subject = "${(opts.subject || '').replace(/"/g, "'")}"`,
      opts.html ? 'objMail.HTMLBody = bodyText' : 'objMail.Body = bodyText',
      opts.attachmentPath ? `objMail.Attachments.Add "${opts.attachmentPath.replace(/"/g, '')}"` : '',
      '',
      'objMail.Send',
      '',
      'If Err.Number <> 0 Then',
      `  WriteResult "ERR:" & Err.Description`,
      'Else',
      '  WriteResult "OK"',
      'End If',
      '',
      'Sub WriteResult(msg)',
      '  Dim fso : Set fso = CreateObject("Scripting.FileSystemObject")',
      `  Dim f : Set f = fso.CreateTextFile("${resultPath.replace(/\\/g, '\\\\')}", True)`,
      '  f.Write msg',
      '  f.Close',
      'End Sub',
    ].filter(l => l !== '').join('\r\n')

    writeFileSync(vbsPath, vbs, 'utf-8')

    const desktopUser = getDesktopUser()
    console.log(`[outlookMailer] send: to=${opts.to}, user=${desktopUser}, task=${taskName}`)

    // Create and run scheduled task as the desktop user
    execSync(
      `schtasks /create /tn "${taskName}" /tr "cscript //nologo \\"${vbsPath}\\"" /sc once /st 00:00 /ru "${desktopUser}" /rl HIGHEST /f`,
      { encoding: 'utf-8', windowsHide: true, timeout: 10000 }
    )
    execSync(
      `schtasks /run /tn "${taskName}"`,
      { encoding: 'utf-8', windowsHide: true, timeout: 10000 }
    )

    // Poll for result (max 30 seconds)
    const start = Date.now()
    while (Date.now() - start < 30000) {
      if (existsSync(resultPath)) {
        const res = readFileSync(resultPath, 'utf-8').trim()
        console.log(`[outlookMailer] result: ${res}`)
        if (res === 'OK') return { success: true, method: 'outlook-schtask' }
        return { success: false, error: res.replace(/^ERR:/, ''), method: 'outlook-schtask' }
      }
      await new Promise(r => setTimeout(r, 500))
    }
    return { success: false, error: 'Timeout — Outlook hat nicht geantwortet (30s)', method: 'outlook-schtask' }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[outlookMailer] error:', msg)
    return { success: false, error: msg, method: 'outlook-schtask' }
  } finally {
    // Cleanup
    try { execSync(`schtasks /delete /tn "${taskName}" /f`, { windowsHide: true, timeout: 5000 }) } catch { /* ok */ }
    try { unlinkSync(vbsPath) } catch { /* ok */ }
    try { unlinkSync(bodyPath) } catch { /* ok */ }
    try { unlinkSync(resultPath) } catch { /* ok */ }
  }
}

/**
 * Open Outlook compose window with pre-filled fields.
 * Same Scheduled Task approach for UIPI bypass.
 */
export async function composeViaOutlookScheduledTask(opts: MailOpts): Promise<MailResult> {
  const id = uid()
  const bodyPath = join(tmpdir(), `${id}_body.txt`)
  const vbsPath = join(tmpdir(), `${id}.vbs`)
  const resultPath = join(tmpdir(), `${id}_result.txt`)
  const taskName = `ITAdminCompose_${id}`

  try {
    writeFileSync(bodyPath, opts.body, 'utf-8')

    const vbs = [
      'On Error Resume Next',
      '',
      'Dim stream : Set stream = CreateObject("ADODB.Stream")',
      'stream.Type = 2',
      'stream.Charset = "UTF-8"',
      'stream.Open',
      `stream.LoadFromFile "${bodyPath.replace(/\\/g, '\\\\')}"`,
      'Dim bodyText : bodyText = stream.ReadText',
      'stream.Close',
      '',
      'Dim objOutlook : Set objOutlook = CreateObject("Outlook.Application")',
      'If Err.Number <> 0 Then',
      `  WriteResult "ERR:Outlook nicht verfuegbar - " & Err.Description`,
      '  WScript.Quit 1',
      'End If',
      '',
      'Dim objMail : Set objMail = objOutlook.CreateItem(0)',
      `objMail.To = "${(opts.to || '').replace(/"/g, '')}"`,
      opts.cc ? `objMail.CC = "${opts.cc.replace(/"/g, '')}"` : '',
      `objMail.Subject = "${(opts.subject || '').replace(/"/g, "'")}"`,
      opts.html ? 'objMail.HTMLBody = bodyText' : 'objMail.Body = bodyText',
      opts.attachmentPath ? `objMail.Attachments.Add "${opts.attachmentPath.replace(/"/g, '')}"` : '',
      '',
      'objMail.Display 0',
      'WriteResult "OK"',
      '',
      'Sub WriteResult(msg)',
      '  Dim fso : Set fso = CreateObject("Scripting.FileSystemObject")',
      `  Dim f : Set f = fso.CreateTextFile("${resultPath.replace(/\\/g, '\\\\')}", True)`,
      '  f.Write msg',
      '  f.Close',
      'End Sub',
    ].filter(l => l !== '').join('\r\n')

    writeFileSync(vbsPath, vbs, 'utf-8')
    const desktopUser = getDesktopUser()

    execSync(
      `schtasks /create /tn "${taskName}" /tr "cscript //nologo \\"${vbsPath}\\"" /sc once /st 00:00 /ru "${desktopUser}" /rl HIGHEST /f`,
      { encoding: 'utf-8', windowsHide: true, timeout: 10000 }
    )
    execSync(
      `schtasks /run /tn "${taskName}"`,
      { encoding: 'utf-8', windowsHide: true, timeout: 10000 }
    )

    // Shorter timeout for compose (just needs to open the window)
    const start = Date.now()
    while (Date.now() - start < 10000) {
      if (existsSync(resultPath)) {
        const res = readFileSync(resultPath, 'utf-8').trim()
        if (res === 'OK') return { success: true, method: 'outlook-compose' }
        return { success: false, error: res.replace(/^ERR:/, ''), method: 'outlook-compose' }
      }
      await new Promise(r => setTimeout(r, 500))
    }
    return { success: false, error: 'Timeout', method: 'outlook-compose' }

  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err), method: 'outlook-compose' }
  } finally {
    try { execSync(`schtasks /delete /tn "${taskName}" /f`, { windowsHide: true, timeout: 5000 }) } catch { /* ok */ }
    try { unlinkSync(vbsPath) } catch { /* ok */ }
    try { unlinkSync(bodyPath) } catch { /* ok */ }
    try { unlinkSync(resultPath) } catch { /* ok */ }
  }
}
