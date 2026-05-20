import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { userInfo } from 'os'

// VOLLE PFADE — damit es auch im elevated Kontext funktioniert
const SCHTASKS = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'schtasks.exe')
const CSCRIPT = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cscript.exe')
const WORK_DIR = 'C:\\Temp\\ITAdminMail'

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

function getDesktopUser(): string {
  // Methode 1: query user
  try {
    const quser = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'query.exe')
    const out = execSync(`"${quser}" user`, { encoding: 'utf-8', windowsHide: true, timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
    const lines = out.split('\n').filter(l => l.includes('Active') || l.includes('Aktiv'))
    if (lines.length > 0) {
      const u = lines[0].trim().split(/\s+/)[0].replace(/^>/, '')
      if (u) return u
    }
  } catch { /* next */ }

  // Methode 2: WMI
  try {
    const wmic = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'Wbem', 'WMIC.exe')
    const out = execSync(`"${wmic}" ComputerSystem Get UserName /Format:Value`, { encoding: 'utf-8', windowsHide: true, timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
    const match = out.match(/UserName=(.+)/i)
    if (match) {
      const parts = match[1].trim().split('\\')
      return parts[parts.length - 1]
    }
  } catch { /* next */ }

  return userInfo().username
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function ensureWorkDir(): void {
  try {
    if (!existsSync(WORK_DIR)) mkdirSync(WORK_DIR, { recursive: true })
  } catch { /* ok */ }
}

export async function sendViaOutlookScheduledTask(opts: MailOpts): Promise<MailResult> {
  const id = uid()
  ensureWorkDir()

  const bodyPath   = join(WORK_DIR, `body_${id}.txt`)
  const vbsPath    = join(WORK_DIR, `send_${id}.vbs`)
  const resultPath = join(WORK_DIR, `result_${id}.txt`)
  const taskName   = `ITMailSend_${id}`

  try {
    // Body als UTF-8 Datei schreiben (vermeidet VBS-Encoding-Probleme)
    writeFileSync(bodyPath, opts.body, 'utf-8')

    // VBScript zusammenbauen
    const vbs = [
      'On Error Resume Next',
      'Dim objStream',
      'Set objStream = CreateObject("ADODB.Stream")',
      'objStream.Type = 2',
      'objStream.Charset = "UTF-8"',
      'objStream.Open',
      'objStream.LoadFromFile "' + bodyPath.replace(/\\/g, '\\\\') + '"',
      'Dim bodyText',
      'bodyText = objStream.ReadText',
      'objStream.Close',
      'Set objStream = Nothing',
      '',
      'If Err.Number <> 0 Then',
      '  Call WriteResult("ERR:Body-Datei nicht lesbar - " & Err.Description)',
      '  WScript.Quit 1',
      'End If',
      '',
      'Dim objOutlook',
      'Set objOutlook = CreateObject("Outlook.Application")',
      'If Err.Number <> 0 Then',
      '  Call WriteResult("ERR:Outlook nicht erreichbar - " & Err.Description)',
      '  WScript.Quit 1',
      'End If',
      '',
      'Dim objMail',
      'Set objMail = objOutlook.CreateItem(0)',
      'objMail.To = "' + (opts.to || '').replace(/"/g, '') + '"',
      opts.cc ? 'objMail.CC = "' + opts.cc.replace(/"/g, '') + '"' : '',
      opts.bcc ? 'objMail.BCC = "' + opts.bcc.replace(/"/g, '') + '"' : '',
      'objMail.Subject = "' + (opts.subject || '').replace(/"/g, "'") + '"',
      opts.html ? 'objMail.HTMLBody = bodyText' : 'objMail.Body = bodyText',
      opts.attachmentPath ? 'objMail.Attachments.Add "' + opts.attachmentPath.replace(/"/g, '') + '"' : '',
      '',
      'objMail.Send',
      '',
      'If Err.Number <> 0 Then',
      '  Call WriteResult("ERR:" & Err.Description)',
      'Else',
      '  Call WriteResult("OK")',
      'End If',
      '',
      'Set objMail = Nothing',
      'Set objOutlook = Nothing',
      '',
      'Sub WriteResult(msg)',
      '  Dim fso : Set fso = CreateObject("Scripting.FileSystemObject")',
      '  Dim f : Set f = fso.CreateTextFile("' + resultPath.replace(/\\/g, '\\\\') + '", True)',
      '  f.Write msg',
      '  f.Close',
      '  Set f = Nothing : Set fso = Nothing',
      'End Sub',
    ].filter(l => l !== '').join('\r\n')

    writeFileSync(vbsPath, vbs, 'utf-8')

    const desktopUser = getDesktopUser()
    console.log('[outlookMailer] send: to=' + opts.to + ' user=' + desktopUser + ' task=' + taskName)

    // Task erstellen — /rl LIMITED damit es in der normalen User-Session laeuft
    const createCmd = '"' + SCHTASKS + '" /create /tn "' + taskName + '" /tr "\\"' + CSCRIPT + '\\" //nologo //B \\"' + vbsPath + '\\"" /sc once /st 00:00 /ru "' + desktopUser + '" /rl LIMITED /f'
    console.log('[outlookMailer] create:', createCmd)
    execSync(createCmd, { encoding: 'utf-8', windowsHide: true, timeout: 15000 })

    // Task starten
    const runCmd = '"' + SCHTASKS + '" /run /tn "' + taskName + '"'
    console.log('[outlookMailer] run:', runCmd)
    execSync(runCmd, { encoding: 'utf-8', windowsHide: true, timeout: 15000 })

    // Auf Ergebnis warten (max 30 Sekunden)
    const start = Date.now()
    while (Date.now() - start < 30000) {
      if (existsSync(resultPath)) {
        const res = readFileSync(resultPath, 'utf-8').trim()
        console.log('[outlookMailer] result:', res)
        if (res === 'OK') return { success: true, method: 'outlook-schtask' }
        return { success: false, error: res.replace(/^ERR:/, ''), method: 'outlook-schtask' }
      }
      await new Promise(r => setTimeout(r, 500))
    }

    return { success: false, error: 'Timeout (30s) — keine Antwort von Outlook', method: 'outlook-schtask' }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[outlookMailer] error:', msg)
    return { success: false, error: msg, method: 'outlook-schtask' }
  } finally {
    // Task loeschen
    try { execSync('"' + SCHTASKS + '" /delete /tn "' + taskName + '" /f', { windowsHide: true, timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }) } catch { /* ok */ }
    // Dateien nach 5 Sekunden loeschen (Task braucht Zeit zum Lesen)
    setTimeout(() => {
      try { if (existsSync(vbsPath)) unlinkSync(vbsPath) } catch { /* ok */ }
      try { if (existsSync(bodyPath)) unlinkSync(bodyPath) } catch { /* ok */ }
      try { if (existsSync(resultPath)) unlinkSync(resultPath) } catch { /* ok */ }
    }, 5000)
  }
}

export async function composeViaOutlookScheduledTask(opts: MailOpts): Promise<MailResult> {
  const id = uid()
  ensureWorkDir()

  const bodyPath   = join(WORK_DIR, `body_${id}.txt`)
  const vbsPath    = join(WORK_DIR, `compose_${id}.vbs`)
  const resultPath = join(WORK_DIR, `result_${id}.txt`)
  const taskName   = `ITMailCompose_${id}`

  try {
    writeFileSync(bodyPath, opts.body, 'utf-8')

    const vbs = [
      'On Error Resume Next',
      'Dim objStream',
      'Set objStream = CreateObject("ADODB.Stream")',
      'objStream.Type = 2',
      'objStream.Charset = "UTF-8"',
      'objStream.Open',
      'objStream.LoadFromFile "' + bodyPath.replace(/\\/g, '\\\\') + '"',
      'Dim bodyText',
      'bodyText = objStream.ReadText',
      'objStream.Close',
      'Set objStream = Nothing',
      '',
      'Dim objOutlook',
      'Set objOutlook = CreateObject("Outlook.Application")',
      'If Err.Number <> 0 Then',
      '  Call WriteResult("ERR:Outlook nicht erreichbar - " & Err.Description)',
      '  WScript.Quit 1',
      'End If',
      '',
      'Dim objMail',
      'Set objMail = objOutlook.CreateItem(0)',
      'objMail.To = "' + (opts.to || '').replace(/"/g, '') + '"',
      opts.cc ? 'objMail.CC = "' + opts.cc.replace(/"/g, '') + '"' : '',
      'objMail.Subject = "' + (opts.subject || '').replace(/"/g, "'") + '"',
      opts.html ? 'objMail.HTMLBody = bodyText' : 'objMail.Body = bodyText',
      opts.attachmentPath ? 'objMail.Attachments.Add "' + opts.attachmentPath.replace(/"/g, '') + '"' : '',
      '',
      'objMail.Display 0',
      '',
      'If Err.Number <> 0 Then',
      '  Call WriteResult("ERR:" & Err.Description)',
      'Else',
      '  Call WriteResult("OK")',
      'End If',
      '',
      'Sub WriteResult(msg)',
      '  Dim fso : Set fso = CreateObject("Scripting.FileSystemObject")',
      '  Dim f : Set f = fso.CreateTextFile("' + resultPath.replace(/\\/g, '\\\\') + '", True)',
      '  f.Write msg',
      '  f.Close',
      '  Set f = Nothing : Set fso = Nothing',
      'End Sub',
    ].filter(l => l !== '').join('\r\n')

    writeFileSync(vbsPath, vbs, 'utf-8')
    const desktopUser = getDesktopUser()

    const createCmd = '"' + SCHTASKS + '" /create /tn "' + taskName + '" /tr "\\"' + CSCRIPT + '\\" //nologo //B \\"' + vbsPath + '\\"" /sc once /st 00:00 /ru "' + desktopUser + '" /rl LIMITED /f'
    execSync(createCmd, { encoding: 'utf-8', windowsHide: true, timeout: 15000 })

    const runCmd = '"' + SCHTASKS + '" /run /tn "' + taskName + '"'
    execSync(runCmd, { encoding: 'utf-8', windowsHide: true, timeout: 15000 })

    const start = Date.now()
    while (Date.now() - start < 15000) {
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
    try { execSync('"' + SCHTASKS + '" /delete /tn "' + taskName + '" /f', { windowsHide: true, timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }) } catch { /* ok */ }
    setTimeout(() => {
      try { if (existsSync(vbsPath)) unlinkSync(vbsPath) } catch { /* ok */ }
      try { if (existsSync(bodyPath)) unlinkSync(bodyPath) } catch { /* ok */ }
      try { if (existsSync(resultPath)) unlinkSync(resultPath) } catch { /* ok */ }
    }, 5000)
  }
}
