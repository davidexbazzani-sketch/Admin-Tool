// ── Daily commands service ───────────────────────────────────────────────────
// Defines the dropdown menus for "Daylis" in the user overview:
//   - "Abfragen": read-only queries against a host (or the AD user)
//   - "Eingriffe": active changes (require admin/master-admin rights)
//
// Each command exposes:
//   - id        stable identifier
//   - label     short button label
//   - info      short tooltip explanation (shown when user clicks the (i) icon)
//   - kind      'read' (Abfrage) | 'write' (Eingriff)
//   - run       async runner that takes context (hostname + optional sam + extra)
//               and returns a human-readable result string
//   - needsParams optional flag — UI shows extra input modal (e.g. password reset)

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'

export type DailyKind = 'read' | 'write'

export interface DailyContext {
  hostname: string         // target machine (may be empty for user-only commands)
  sam?: string             // target AD user (for unlock / reset password)
  extra?: Record<string, string>
}

export interface DailyResult {
  ok: boolean
  text: string
}

export interface DailyCommand {
  id: string
  label: string
  info: string
  kind: DailyKind
  requiresHost?: boolean   // true if a hostname is mandatory
  requiresUser?: boolean   // true if SAM is mandatory
  needsParams?: { name: string; label: string; type?: 'text' | 'password' }[]
  run: (ctx: DailyContext) => Promise<DailyResult>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ok(text: string): DailyResult { return { ok: true, text } }
function fail(text: string): DailyResult { return { ok: false, text } }

function escPs(s: string): string {
  return s.replace(/'/g, "''")
}

async function runPs(script: string, timeoutMs = 60000): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  return api().runPowerShell(script, timeoutMs)
}

// PowerShell snippet that runs INSIDE a remote ScriptBlock and detects the
// currently logged-on user via 4 fallback methods. After this snippet runs,
// the variable $user holds "DOMAIN\username" or stays $null when no one is
// logged on. Win32_ComputerSystem.UserName alone is unreliable on RDP /
// locked-screen / FastUserSwitching scenarios — the additional methods
// (quser, explorer.exe owner, registry LastLoggedOnUser) catch those cases.
const USER_DETECTION_PS = [
  `$user = $null`,
  // Method 1: WMI ComputerSystem
  `try {`,
  `  $cs = Get-CimInstance Win32_ComputerSystem -EA Stop`,
  `  if ($cs.UserName) { $user = $cs.UserName }`,
  `} catch {}`,
  // Method 2: quser (typically the most reliable on locked/RDP sessions)
  `if (-not $user) {`,
  `  try {`,
  `    $qr = @(quser 2>&1) | Where-Object { "$_" -and "$_" -notmatch '^\\s*USERNAME|^\\s*BENUTZERNAME' }`,
  `    $line = $qr | Where-Object { "$_" -match 'Active|Aktiv' } | Select-Object -First 1`,
  `    if (-not $line) { $line = $qr | Select-Object -First 1 }`,
  `    if ($line) {`,
  `      $parts = ("$line" -replace '^[> ]+','') -split '\\s{2,}'`,
  `      $cand = $parts[0]`,
  `      if ($cand -and $cand -notmatch '\\\\') { $cand = "$env:USERDOMAIN\\$cand" }`,
  `      if ($cand) { $user = $cand }`,
  `    }`,
  `  } catch {}`,
  `}`,
  // Method 3: explorer.exe process owner (works when an interactive shell is running)
  `if (-not $user) {`,
  `  try {`,
  `    $ep = @(Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -EA Stop) | Select-Object -First 1`,
  `    if ($ep) {`,
  `      $ow = Invoke-CimMethod -InputObject $ep -MethodName GetOwner -EA Stop`,
  `      if ($ow.User) { $user = "$($ow.Domain)\\$($ow.User)" }`,
  `    }`,
  `  } catch {}`,
  `}`,
  // Method 4: LastLoggedOnUser from registry (last resort — may show a stale user)
  `if (-not $user) {`,
  `  try {`,
  `    $lp = Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Authentication\\LogonUI' -Name LastLoggedOnUser -EA Stop`,
  `    if ($lp.LastLoggedOnUser) { $user = $lp.LastLoggedOnUser }`,
  `  } catch {}`,
  `}`,
].join('\n')

// Wrap any host-based command so WinRM is started first (cached per host).
// Same activation logic as Remote Doc. If WinRM cannot be started, the
// command short-circuits with a clear error message.
async function withWinRM(hostname: string, fn: () => Promise<DailyResult>): Promise<DailyResult> {
  try {
    const okRm = await ensureWinRM(hostname)
    if (!okRm) {
      return fail(`WinRM konnte auf ${hostname} nicht aktiviert werden — Service nicht erreichbar oder Berechtigungen fehlen.`)
    }
  } catch (e) {
    return fail(`WinRM-Aktivierung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
  }
  return fn()
}

// ── ABFRAGEN ─────────────────────────────────────────────────────────────────

const queryLastOnline: DailyCommand = {
  id: 'q.lastOnline',
  label: 'Zuletzt online',
  info: 'Pingt zuerst das Geraet des Benutzers — bei Erfolg wird "aktuell online" gemeldet. Sonst wird das aktuellere von LastLogonDate und badPasswordTime aus dem AD angezeigt.',
  kind: 'read',
  requiresUser: true,
  // hostname is opportunistic — when present, do a quick ping first
  async run({ sam, hostname }) {
    if (!sam) return fail('Kein AD-Benutzer angegeben')

    // 1) Opportunistic ping — if the chosen device is reachable right now,
    //    that's a stronger signal than any AD-cached timestamp.
    if (hostname && hostname.trim()) {
      try {
        const pingScript = `if (Test-Connection -ComputerName '${escPs(hostname)}' -Count 1 -Quiet -ErrorAction SilentlyContinue) { 'ONLINE' } else { 'OFFLINE' }`
        const pr = await runPs(pingScript, 6000)
        if ((pr.stdout ?? '').trim() === 'ONLINE') {
          return ok(`Aktuell online (Ping ${hostname})`)
        }
      } catch { /* ignore — fall through to AD lookup */ }
    }

    // 2) AD-Fallback: last logon / bad password timestamp
    const script = [
      `$u = Get-ADUser -Identity '${escPs(sam)}' -Properties LastLogonDate,badPasswordTime -EA SilentlyContinue`,
      `if (-not $u) { Write-Output 'NOTFOUND'; exit }`,
      `$ll = if ($u.LastLogonDate) { $u.LastLogonDate } else { $null }`,
      `$bp = $null`,
      `if ($u.badPasswordTime -and $u.badPasswordTime -gt 0) { try { $bp = [DateTime]::FromFileTime([int64]$u.badPasswordTime) } catch {} }`,
      `$latest = $null; $src = ''`,
      `if ($ll -and (-not $bp -or $ll -gt $bp)) { $latest = $ll; $src = 'LastLogon' }`,
      `elseif ($bp) { $latest = $bp; $src = 'badPwd' }`,
      `if ($latest) { Write-Output ("$src|" + $latest.ToString('dd.MM.yyyy HH:mm')) } else { Write-Output 'NONE' }`,
    ].join('\n')
    const r = await runPs(script, 20000)
    const out = (r.stdout ?? '').trim()
    if (out === 'NOTFOUND') return fail('Benutzer nicht in AD')
    if (out === 'NONE') return ok('Keine Anmelde-Aktivitaet im AD')
    const [src, dt] = out.split('|')
    return ok(`${dt}  (${src === 'LastLogon' ? 'letzte Anmeldung' : 'letzter Anmeldeversuch fehlgeschlagen'})`)
  },
}

const queryInstalledPrograms: DailyCommand = {
  id: 'q.installedPrograms',
  label: 'Installierte Programme',
  info: 'Liest die Liste der installierten Programme aus der Registry des Ziel-PCs (HKLM Uninstall). Benoetigt WinRM (wird automatisch aktiviert).',
  kind: 'read',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    return withWinRM(hostname, async () => {
      const script = [
        `try {`,
        `  $sb = { $p = @('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); Get-ItemProperty $p -EA SilentlyContinue | Where-Object {$_.DisplayName} | Select-Object -ExpandProperty DisplayName -Unique | Sort-Object }`,
        `  $r = Invoke-Command -ComputerName '${escPs(hostname)}' -ScriptBlock $sb -EA Stop`,
        `  Write-Output ($r -join "\`n")`,
        `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
      ].join('\n')
      const r = await runPs(script, 60000)
      const out = (r.stdout ?? '').trim()
      if (out.startsWith('ERR:')) return fail(out.slice(4))
      const lines = out.split(/\r?\n/).filter(Boolean)
      return ok(`${lines.length} Programme:\n${lines.join('\n')}`)
    })
  },
}

const queryLastReboot: DailyCommand = {
  id: 'q.lastReboot',
  label: 'Letzter Neustart',
  info: 'Liest den letzten Bootzeitpunkt des Ziel-PCs (Win32_OperatingSystem.LastBootUpTime).',
  kind: 'read',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    const script = [
      `try {`,
      `  $os = Get-CimInstance -ClassName Win32_OperatingSystem -ComputerName '${escPs(hostname)}' -EA Stop -OperationTimeoutSec 10`,
      `  $bt = $os.LastBootUpTime`,
      `  if ($bt) {`,
      `    $up = (Get-Date) - $bt`,
      `    Write-Output ("$($bt.ToString('dd.MM.yyyy HH:mm')) (Uptime: $([int]$up.TotalDays)d $($up.Hours)h)")`,
      `  } else { Write-Output 'NO_DATA' }`,
      `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
    ].join('\n')
    const r = await runPs(script, 20000)
    const out = (r.stdout ?? '').trim()
    if (out.startsWith('ERR:')) return fail(out.slice(4))
    if (out === 'NO_DATA') return fail('Kein Bootzeitpunkt ermittelbar')
    return ok(out)
  },
}

const queryIsOnline: DailyCommand = {
  id: 'q.isOnline',
  label: 'Ist online?',
  info: 'Pruefe per Ping (1 Versuch, 1.5 s Timeout) ob der Ziel-PC erreichbar ist.',
  kind: 'read',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    const script = `if (Test-Connection -ComputerName '${escPs(hostname)}' -Count 1 -Quiet -ErrorAction SilentlyContinue) { 'ONLINE' } else { 'OFFLINE' }`
    const r = await runPs(script, 8000)
    const out = (r.stdout ?? '').trim()
    if (out === 'ONLINE') return ok('Online (Ping erfolgreich)')
    return fail('Offline / keine Antwort')
  },
}

const queryLoggedInUser: DailyCommand = {
  id: 'q.loggedInUser',
  label: 'Wer ist angemeldet?',
  info: 'Liest den aktuell am Ziel-PC angemeldeten Benutzer. Nutzt 4 Fallback-Methoden (Win32_ComputerSystem, quser, explorer.exe Owner, LastLoggedOnUser). Benoetigt WinRM.',
  kind: 'read',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    return withWinRM(hostname, async () => {
      const sb = [
        USER_DETECTION_PS,
        `if ($user) { Write-Output ('USR:' + $user) } else { Write-Output 'NONE' }`,
      ].join('\n')
      const script = `try { Invoke-Command -ComputerName '${escPs(hostname)}' -ScriptBlock { ${sb} } -EA Stop } catch { Write-Output ('ERR:' + $_.Exception.Message) }`
      const r = await runPs(script, 25000)
      const lines = (r.stdout ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      const resLine = lines.find(l => l.startsWith('USR:') || l === 'NONE' || l.startsWith('ERR:'))
      if (!resLine) return fail(r.stderr || 'Keine Antwort')
      if (resLine.startsWith('ERR:')) return fail(resLine.slice(4))
      if (resLine === 'NONE') return ok('Niemand angemeldet')
      return ok(resLine.slice(4))
    })
  },
}

// ── EINGRIFFE ────────────────────────────────────────────────────────────────

const actionUnlockAccount: DailyCommand = {
  id: 'a.unlock',
  label: 'AD-Konto entsperren',
  info: 'Hebt eine Sperre des AD-Kontos auf (z.B. nach mehrfachen falschen Anmeldeversuchen).',
  kind: 'write',
  requiresUser: true,
  async run({ sam }) {
    if (!sam) return fail('Kein AD-Benutzer')
    const script = `Unlock-ADAccount -Identity '${escPs(sam)}' -EA Stop; Write-Output 'OK'`
    const r = await runPs(script, 15000)
    const out = (r.stdout ?? '').trim()
    if (out === 'OK') return ok('Konto entsperrt')
    return fail(r.stderr || out || 'Entsperren fehlgeschlagen')
  },
}

const actionResetPassword: DailyCommand = {
  id: 'a.resetPw',
  label: 'Passwort zuruecksetzen',
  info: 'Setzt das AD-Passwort auf den angegebenen Wert. Erzwingt Passwortwechsel bei naechster Anmeldung.',
  kind: 'write',
  requiresUser: true,
  needsParams: [{ name: 'newPassword', label: 'Neues Passwort', type: 'password' }],
  async run({ sam, extra }) {
    if (!sam) return fail('Kein AD-Benutzer')
    const pw = extra?.newPassword
    if (!pw) return fail('Kein Passwort angegeben')
    const script = [
      `try {`,
      `  $sec = ConvertTo-SecureString '${escPs(pw)}' -AsPlainText -Force`,
      `  Set-ADAccountPassword -Identity '${escPs(sam)}' -NewPassword $sec -Reset -EA Stop`,
      `  Set-ADUser -Identity '${escPs(sam)}' -ChangePasswordAtLogon $true -EA SilentlyContinue`,
      `  Write-Output 'OK'`,
      `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
    ].join('\n')
    const r = await runPs(script, 15000)
    const out = (r.stdout ?? '').trim()
    if (out === 'OK') return ok('Passwort gesetzt + Aenderung beim naechsten Login erzwungen')
    if (out.startsWith('ERR:')) return fail(out.slice(4))
    return fail(r.stderr || 'Fehler beim Zuruecksetzen')
  },
}

const actionEnableRdp: DailyCommand = {
  id: 'a.enableRdp',
  label: 'RDP-Zugriff aktivieren',
  info: 'Aktiviert Remote Desktop am Ziel-PC und oeffnet die Windows-Firewall fuer RDP. WinRM wird vorher automatisch aktiviert.',
  kind: 'write',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    return withWinRM(hostname, async () => {
      const sb = [
        `Set-ItemProperty -Path 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server' -Name 'fDenyTSConnections' -Value 0 -Force`,
        `Enable-NetFirewallRule -DisplayGroup 'Remotedesktop' -EA SilentlyContinue`,
        `Enable-NetFirewallRule -DisplayGroup 'Remote Desktop' -EA SilentlyContinue`,
        `'OK'`,
      ].join('; ')
      const script = `try { Invoke-Command -ComputerName '${escPs(hostname)}' -ScriptBlock { ${sb} } -EA Stop } catch { 'ERR:' + $_.Exception.Message }`
      const r = await runPs(script, 30000)
      const out = (r.stdout ?? '').trim()
      if (out === 'OK') return ok('RDP aktiviert + Firewall-Regel offen')
      if (out.startsWith('ERR:')) return fail(out.slice(4))
      return fail(out || 'RDP-Aktivierung fehlgeschlagen')
    })
  },
}

const actionConnectRdp: DailyCommand = {
  id: 'a.connectRdp',
  label: 'RDP-Verbindung starten',
  info: 'Oeffnet den Windows Remote-Desktop-Client (mstsc.exe) auf deinem Admin-PC und verbindet zum Ziel-PC. Voraussetzung: RDP muss auf dem Ziel-PC aktiviert sein (siehe "RDP-Zugriff aktivieren").',
  kind: 'write',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    const script = `Start-Process 'mstsc.exe' -ArgumentList '/v:${escPs(hostname)}'; 'OK'`
    const r = await runPs(script, 5000)
    const out = (r.stdout ?? '').trim()
    if (out === 'OK') return ok(`RDP-Verbindung gestartet zu ${hostname}`)
    return fail(r.stderr || out || 'Konnte mstsc.exe nicht starten')
  },
}

const actionSendMessage: DailyCommand = {
  id: 'a.message',
  label: 'Desktop-Nachricht senden',
  info: 'Zeigt eine Popup-Nachricht beim angemeldeten Benutzer. Versucht zuerst msg.exe lokal auf dem Ziel-PC; falls das auf modernen Windows-Versionen nicht erlaubt ist, wird automatisch ein einmaliger Scheduled Task mit MessageBox als Fallback verwendet.',
  kind: 'write',
  requiresHost: true,
  needsParams: [{ name: 'message', label: 'Nachricht', type: 'text' }],
  async run({ hostname, extra }) {
    if (!hostname) return fail('Kein Hostname')
    const msg = (extra?.message ?? '').trim()
    if (!msg) return fail('Keine Nachricht angegeben')

    // Encode the message as base64 (UTF-8) so it survives all the quoting
    // hops: JS template literal → PowerShell remote ScriptBlock → encoded
    // PowerShell command for the scheduled task.
    const msgB64 = btoa(unescape(encodeURIComponent(msg)))

    return withWinRM(hostname, async () => {

    // The remote script block: try msg.exe first, then fall back to a one-shot
    // ScheduledTask running PowerShell as the logged-in user that shows a
    // MessageBox via Windows.Forms.
    const sb = [
      `$m = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${msgB64}'))`,
      // ── Strategy 1: msg.exe on the local console of the target ────────────
      `$msgOk = $false`,
      `try {`,
      `  $null = & msg.exe * /TIME:60 $m 2>&1`,
      `  if ($LASTEXITCODE -eq 0) { $msgOk = $true }`,
      `} catch {}`,
      `if ($msgOk) { Write-Output 'OK:msg.exe'; return }`,
      // ── Strategy 2: ScheduledTask + MessageBox.Show ───────────────────────
      `$user = (Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue).UserName`,
      `if (-not $user) { Write-Output 'ERR:Kein Benutzer angemeldet (msg.exe nicht verfuegbar)'; return }`,
      `try {`,
      `  $taskName = 'ITAdminMsg_' + (Get-Date -Format 'yyyyMMddHHmmssfff')`,
      `  $cmd = "[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${msgB64}')), 'IT-Admin Nachricht', 'OK', 'Information') | Out-Null"`,
      `  $cmdB64 = [System.Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($cmd))`,
      `  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -EncodedCommand $cmdB64"`,
      `  $principal = New-ScheduledTaskPrincipal -UserId $user -RunLevel Highest -LogonType Interactive`,
      `  Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Force | Out-Null`,
      `  Start-ScheduledTask -TaskName $taskName`,
      `  Start-Sleep -Seconds 2`,
      `  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -EA SilentlyContinue`,
      `  Write-Output 'OK:ScheduledTask'`,
      `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
    ].join('; ')

    const script = `try { Invoke-Command -ComputerName '${escPs(hostname)}' -ScriptBlock { ${sb} } -EA Stop } catch { 'ERR:' + $_.Exception.Message }`
    const r = await runPs(script, 30000)
    const out = (r.stdout ?? '').trim()
    if (out.startsWith('ERR:')) return fail(out.slice(4))
    if (out.startsWith('OK:msg.exe')) return ok('Nachricht gesendet (msg.exe)')
    if (out.startsWith('OK:ScheduledTask')) return ok('Nachricht gesendet (MessageBox-Popup via ScheduledTask)')
    return fail(r.stderr || out || 'Nachricht konnte nicht gesendet werden')
    })
  },
}

const actionRestart: DailyCommand = {
  id: 'a.restart',
  label: 'Neustart',
  info: 'Startet den Ziel-PC nach 30 Sekunden neu (mit Hinweis-Popup fuer den angemeldeten User). Wird via WinRM lokal auf dem Ziel-PC ausgefuehrt — vermeidet RPC-Privilegienprobleme.',
  kind: 'write',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    return withWinRM(hostname, async () => {

    const sb = [
      `$result = 'ERR:Skript unvollstaendig'`,
      `try {`,
      // shutdown.exe runs locally on the target — no SeRemoteShutdownPrivilege needed
      `  $out = & shutdown.exe /r /t 30 /c 'IT-Admin Tool: Neustart in 30 Sekunden' /f 2>&1`,
      `  $code = $LASTEXITCODE`,
      `  if ($code -eq 0) {`,
      `    $result = 'OK'`,
      `  } else {`,
      `    $result = 'ERR:shutdown ExitCode ' + $code + ' — ' + (($out | ForEach-Object { [string]$_ }) -join ' | ')`,
      `  }`,
      `} catch {`,
      `  $result = 'ERR:' + $_.Exception.Message`,
      `}`,
      `Write-Output ('RES:' + $result)`,
    ].join('\n')

    const script = `try { Invoke-Command -ComputerName '${escPs(hostname)}' -ScriptBlock { ${sb} } -EA Stop } catch { Write-Output ('RES:ERR:' + $_.Exception.Message) }`
    const r = await runPs(script, 30000)
    const lines = (r.stdout ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const resLine = lines.find(l => l.startsWith('RES:'))
    if (!resLine) return fail(r.stderr || 'Keine Antwort vom Ziel-PC')
    const body = resLine.slice(4)
    if (body === 'OK') return ok(`Neustart in 30s angestossen — Hinweis-Popup wird auf ${hostname} angezeigt`)
    if (body.startsWith('ERR:')) return fail(body.slice(4))
    return fail(body || 'Neustart fehlgeschlagen')
    })
  },
}

const actionMapDriveI: DailyCommand = {
  id: 'a.mapI',
  label: 'Laufwerk I: mappen (\\\\w3172)',
  info: 'Mappt am Ziel-PC das Laufwerk I: auf \\\\w3172\\skf Marine fuer den eingeloggten User. Wird als Scheduled Task im User-Kontext ausgefuehrt, damit das Mapping im User-Profil sichtbar wird (net use als SYSTEM/Admin reicht nicht).',
  kind: 'write',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    const target = '\\\\w3172\\skf Marine'
    const letter = 'I'

    return withWinRM(hostname, async () => {

    // Run the actual mapping as a one-shot ScheduledTask in the logged-in
    // user's session. net use is per-session — running it via Invoke-Command
    // (= SYSTEM context) would not be visible to the user.
    const sb = [
      `$result = 'ERR:Skript unvollstaendig'`,
      `try {`,
      // ── Detect logged-in user (3 strategies) ────────────────────────────
      `  $user = $null`,
      `  try { $user = (Get-CimInstance Win32_ComputerSystem -EA Stop).UserName } catch {}`,
      `  if (-not $user) {`,
      `    try {`,
      `      $qr = quser 2>&1 | Where-Object { "$_" -and "$_" -notmatch '^\\s*USERNAME|^\\s*BENUTZERNAME' }`,
      `      $line = $qr | Where-Object { "$_" -match 'Active|Aktiv' } | Select-Object -First 1`,
      `      if (-not $line) { $line = $qr | Select-Object -First 1 }`,
      `      if ($line) {`,
      `        $parts = ("$line" -replace '^[> ]+','') -split '\\s{2,}'`,
      `        $u = $parts[0]`,
      `        if ($u -and $u -notmatch '\\\\') { $u = "$env:USERDOMAIN\\$u" }`,
      `        $user = $u`,
      `      }`,
      `    } catch {}`,
      `  }`,
      `  if (-not $user) {`,
      `    try {`,
      `      $ep = @(Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -EA Stop) | Select-Object -First 1`,
      `      if ($ep) {`,
      `        $ow = Invoke-CimMethod -InputObject $ep -MethodName GetOwner -EA Stop`,
      `        $user = "$($ow.Domain)\\$($ow.User)"`,
      `      }`,
      `    } catch {}`,
      `  }`,
      `  if (-not $user) {`,
      `    $result = 'NOUSER'`,
      `  } else {`,
      // ── Run net use in a ScheduledTask running as the detected user ──────
      `    if (-not (Test-Path 'C:\\Temp')) { New-Item -Path 'C:\\Temp' -ItemType Directory -Force | Out-Null }`,
      `    $resultFile = 'C:\\Temp\\it_admin_map.txt'`,
      `    Remove-Item $resultFile -Force -EA SilentlyContinue`,
      `    $cmdScript = 'net use ${letter}: /delete /y 2>nul & net use ${letter}: "${target}" /persistent:yes > ' + $resultFile + ' 2>&1'`,
      `    $taskName = 'ITAdminMap_' + (Get-Date -Format 'yyyyMMddHHmmssfff')`,
      `    try {`,
      `      $action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c ' + $cmdScript)`,
      `      $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2)`,
      `      Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -User $user -Force | Out-Null`,
      `      Start-ScheduledTask -TaskName $taskName`,
      `      Start-Sleep -Seconds 5`,
      `      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -EA SilentlyContinue`,
      `      $output = if (Test-Path $resultFile) { (Get-Content $resultFile -Raw -EA SilentlyContinue).Trim() } else { '' }`,
      `      Remove-Item $resultFile -Force -EA SilentlyContinue`,
      `      if ($output -match 'erfolgreich|successfully|command completed') {`,
      `        $result = 'OK:' + $user`,
      `      } elseif ($output -match 'Systemfehler|error|Fehler|ERROR') {`,
      `        $result = 'ERR:' + $output`,
      `      } elseif (-not $output) {`,
      `        $result = 'ERR:Keine Rueckmeldung vom Task (User: ' + $user + ')'`,
      `      } else {`,
      `        $result = 'OK:' + $user + ' (' + $output + ')'`,
      `      }`,
      `    } catch {`,
      `      $result = 'ERR:Task fehlgeschlagen: ' + $_.Exception.Message`,
      `    }`,
      `  }`,
      `} catch {`,
      `  $result = 'ERR:' + $_.Exception.Message`,
      `}`,
      `Write-Output ('RES:' + $result)`,
    ].join('\n')

    const script = `try { Invoke-Command -ComputerName '${escPs(hostname)}' -ScriptBlock { ${sb} } -EA Stop } catch { Write-Output ('RES:ERR:' + $_.Exception.Message) }`
    const r = await runPs(script, 45000)
    const lines = (r.stdout ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const resLine = lines.find(l => l.startsWith('RES:'))
    if (!resLine) return fail(r.stderr || 'Keine Antwort vom Ziel-PC')
    const body = resLine.slice(4)
    if (body === 'NOUSER') return fail('Kein Benutzer am Ziel-PC angemeldet — net use kann nur im User-Kontext gemappt werden')
    if (body.startsWith('ERR:')) return fail(body.slice(4))
    if (body.startsWith('OK:')) return ok(`Laufwerk ${letter}: → ${target} (User: ${body.slice(3)})`)
    return fail(body || 'Mapping fehlgeschlagen')
    })
  },
}

const actionGpupdate: DailyCommand = {
  id: 'a.gpupdate',
  label: 'gpupdate /force',
  info: 'Erzwingt die Aktualisierung der Gruppenrichtlinien am Ziel-PC.',
  kind: 'write',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    return withWinRM(hostname, async () => {
      const script = `try { Invoke-Command -ComputerName '${escPs(hostname)}' -ScriptBlock { gpupdate /force 2>&1 | Out-String } -EA Stop } catch { 'ERR:' + $_.Exception.Message }`
      const r = await runPs(script, 90000)
      const out = (r.stdout ?? '').trim()
      if (out.startsWith('ERR:')) return fail(out.slice(4))
      return ok(out || 'gpupdate ausgefuehrt')
    })
  },
}

const actionDsregcmdLeave: DailyCommand = {
  id: 'a.dsregcmd',
  label: 'dsregcmd /leave',
  info: 'Trennt das Geraet von Azure AD / Entra (workplace join). Erfordert anschliessend einen Neustart.',
  kind: 'write',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    return withWinRM(hostname, async () => {
      const script = `try { Invoke-Command -ComputerName '${escPs(hostname)}' -ScriptBlock { dsregcmd /leave 2>&1 | Out-String } -EA Stop } catch { 'ERR:' + $_.Exception.Message }`
      const r = await runPs(script, 60000)
      const out = (r.stdout ?? '').trim()
      if (out.startsWith('ERR:')) return fail(out.slice(4))
      return ok(out || 'dsregcmd /leave ausgefuehrt')
    })
  },
}

const queryDsregcmdStatus: DailyCommand = {
  id: 'q.dsregStatus',
  label: 'Azure AD Status (dsregcmd /status)',
  info: 'Zeigt den Azure AD / Entra Join Status des Ziel-PCs (AzureAdJoined, DomainJoined, WorkplaceJoined, Device Auth, etc.). WinRM wird automatisch aktiviert.',
  kind: 'read',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    return withWinRM(hostname, async () => {
      const script = `try { Invoke-Command -ComputerName '${escPs(hostname)}' -ScriptBlock { dsregcmd /status 2>&1 | Out-String } -EA Stop } catch { 'ERR:' + $_.Exception.Message }`
      const r = await runPs(script, 30000)
      const out = (r.stdout ?? '').trim()
      if (out.startsWith('ERR:')) return fail(out.slice(4))
      return ok(out || 'dsregcmd ohne Output')
    })
  },
}

const actionSfc: DailyCommand = {
  id: 'a.sfc',
  label: 'sfc /scannow',
  info: 'Prueft und repariert Windows-Systemdateien (kann mehrere Minuten dauern).',
  kind: 'write',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    return withWinRM(hostname, async () => {
      const script = `try { Invoke-Command -ComputerName '${escPs(hostname)}' -ScriptBlock { sfc /scannow 2>&1 | Out-String } -EA Stop } catch { 'ERR:' + $_.Exception.Message }`
      const r = await runPs(script, 600000) // 10 min
      const out = (r.stdout ?? '').trim()
      if (out.startsWith('ERR:')) return fail(out.slice(4))
      return ok(out || 'sfc /scannow durchgelaufen')
    })
  },
}

const actionDism: DailyCommand = {
  id: 'a.dism',
  label: 'DISM Cleanup & Restore Health',
  info: 'Repariert das Windows-Komponentenspeicher-Image: /CheckHealth + /RestoreHealth (kann lange dauern).',
  kind: 'write',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    return withWinRM(hostname, async () => {
      const sb = `DISM /Online /Cleanup-Image /RestoreHealth 2>&1 | Out-String`
      const script = `try { Invoke-Command -ComputerName '${escPs(hostname)}' -ScriptBlock { ${sb} } -EA Stop } catch { 'ERR:' + $_.Exception.Message }`
      const r = await runPs(script, 900000) // 15 min
      const out = (r.stdout ?? '').trim()
      if (out.startsWith('ERR:')) return fail(out.slice(4))
      return ok(out || 'DISM durchgelaufen')
    })
  },
}

const actionClearEdgeCache: DailyCommand = {
  id: 'a.edgeCache',
  label: 'Edge-Cache loeschen',
  info: 'Beendet alle Edge-Prozesse (msedge, WebView2, Update) und loescht anschliessend Cache + Code Cache + GPU Cache + Service Worker fuer den eingeloggten Benutzer.',
  kind: 'write',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    return withWinRM(hostname, async () => {

    // Robust pattern: every code path writes to $result; only one "RES:"-line
    // is emitted at the end. PS errors that leak to stdout (CIM warnings, etc.)
    // won't be confused with the actual result.
    const sb = [
      `$result = 'ERR:Skript unvollstaendig'`,
      `try {`,
      USER_DETECTION_PS,
      `  if (-not $user) {`,
      `    $result = 'NOUSER'`,
      `  } else {`,
      `    $short = ($user -split '\\\\')[-1]`,
      // Use $userHome instead of $profile (PowerShell built-in conflict)
      `    $userHome = "C:\\Users\\$short"`,
      `    if (-not (Test-Path $userHome)) {`,
      `      $result = 'NOPROFILE:' + $userHome`,
      `    } else {`,
      `      $killed = 0`,
      `      foreach ($n in @('msedge','msedgewebview2','MicrosoftEdgeUpdate','identity_helper')) {`,
      `        $procs = @(Get-Process -Name $n -EA SilentlyContinue)`,
      `        if ($procs.Count -gt 0) {`,
      `          $killed += $procs.Count`,
      `          $procs | Stop-Process -Force -EA SilentlyContinue 2>$null`,
      `        }`,
      `      }`,
      `      Start-Sleep -Milliseconds 1500`,
      `      $paths = @(`,
      `        "$userHome\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache",`,
      `        "$userHome\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Code Cache",`,
      `        "$userHome\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\GPUCache",`,
      `        "$userHome\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Service Worker\\CacheStorage",`,
      `        "$userHome\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Service Worker\\ScriptCache"`,
      `      )`,
      `      $cnt = 0`,
      `      $existed = 0`,
      `      foreach ($p in $paths) {`,
      `        if (Test-Path $p) {`,
      `          $existed++`,
      `          try {`,
      `            Get-ChildItem $p -Recurse -Force -EA SilentlyContinue | Remove-Item -Recurse -Force -EA SilentlyContinue 2>$null`,
      `            $cnt++`,
      `          } catch {}`,
      `        }`,
      `      }`,
      `      $result = 'OK:' + $killed + ':' + $cnt + ':' + $existed`,
      `    }`,
      `  }`,
      `} catch {`,
      `  $result = 'ERR:' + $_.Exception.Message`,
      `}`,
      `Write-Output ('RES:' + $result)`,
    ].join('\n')

    const script = `try { Invoke-Command -ComputerName '${escPs(hostname)}' -ScriptBlock { ${sb} } -EA Stop } catch { Write-Output ('RES:ERR:' + $_.Exception.Message) }`
    const r = await runPs(script, 90000)

    // Parse line-by-line: only the RES: line counts, ignore noise
    const lines = (r.stdout ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const resLine = lines.find(l => l.startsWith('RES:'))
    if (!resLine) return fail(r.stderr || 'Keine Antwort vom Ziel-PC')
    const body = resLine.slice(4)
    if (body === 'NOUSER') return fail('Kein angemeldeter Benutzer')
    if (body.startsWith('NOPROFILE')) return fail(`Profilpfad nicht gefunden: ${body.slice(10)}`)
    if (body.startsWith('ERR:')) return fail(body.slice(4))
    if (body.startsWith('OK:')) {
      const m = body.match(/OK:(\d+):(\d+):(\d+)/)
      const killed = m?.[1] ?? '0'
      const cnt = m?.[2] ?? '0'
      const existed = m?.[3] ?? '0'
      if (existed === '0') return ok(`Keine Edge-Cache-Verzeichnisse gefunden — ${killed} Prozess(e) beendet`)
      return ok(`Edge-Cache geleert (${cnt}/${existed} Pfade) — ${killed} Edge-Prozess(e) beendet`)
    }
    return fail(body || 'Unerwartete Antwort')
    })
  },
}

const actionClearTeamsCache: DailyCommand = {
  id: 'a.teamsCache',
  label: 'Teams-Cache loeschen',
  info: 'Beendet alle Teams-Prozesse (Classic + neue Teams + Update) und loescht anschliessend den Cache fuer den eingeloggten Benutzer.',
  kind: 'write',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    return withWinRM(hostname, async () => {

    const sb = [
      `$result = 'ERR:Skript unvollstaendig'`,
      `try {`,
      USER_DETECTION_PS,
      `  if (-not $user) {`,
      `    $result = 'NOUSER'`,
      `  } else {`,
      `    $short = ($user -split '\\\\')[-1]`,
      `    $userHome = "C:\\Users\\$short"`,
      `    if (-not (Test-Path $userHome)) {`,
      `      $result = 'NOPROFILE:' + $userHome`,
      `    } else {`,
      `      $killed = 0`,
      `      foreach ($n in @('ms-teams','Teams','Update','Squirrel')) {`,
      `        $procs = @(Get-Process -Name $n -EA SilentlyContinue)`,
      `        foreach ($pr in $procs) {`,
      `          try {`,
      `            $path = ''`,
      `            try { $path = [string]$pr.Path } catch {}`,
      `            if (-not $path -or $path -like '*\\Teams\\*' -or $path -like '*\\Microsoft\\Teams*' -or $n -eq 'ms-teams' -or $n -eq 'Teams') {`,
      `              $pr | Stop-Process -Force -EA SilentlyContinue 2>$null`,
      `              $killed++`,
      `            }`,
      `          } catch {}`,
      `        }`,
      `      }`,
      `      Start-Sleep -Milliseconds 2000`,
      `      $paths = @(`,
      `        "$userHome\\AppData\\Roaming\\Microsoft\\Teams\\Cache",`,
      `        "$userHome\\AppData\\Roaming\\Microsoft\\Teams\\blob_storage",`,
      `        "$userHome\\AppData\\Roaming\\Microsoft\\Teams\\databases",`,
      `        "$userHome\\AppData\\Roaming\\Microsoft\\Teams\\GPUCache",`,
      `        "$userHome\\AppData\\Roaming\\Microsoft\\Teams\\IndexedDB",`,
      `        "$userHome\\AppData\\Roaming\\Microsoft\\Teams\\Local Storage",`,
      `        "$userHome\\AppData\\Roaming\\Microsoft\\Teams\\Service Worker\\CacheStorage",`,
      `        "$userHome\\AppData\\Roaming\\Microsoft\\Teams\\Service Worker\\ScriptCache",`,
      `        "$userHome\\AppData\\Roaming\\Microsoft\\Teams\\tmp",`,
      `        "$userHome\\AppData\\Local\\Packages\\MSTeams_8wekyb3d8bbwe\\LocalCache",`,
      `        "$userHome\\AppData\\Local\\Packages\\MSTeams_8wekyb3d8bbwe\\LocalCache\\Microsoft\\MSTeams\\PerfLogs",`,
      `        "$userHome\\AppData\\Local\\Packages\\MSTeams_8wekyb3d8bbwe\\LocalCache\\Microsoft\\MSTeams\\EBWebView"`,
      `      )`,
      `      $cnt = 0`,
      `      $existed = 0`,
      `      foreach ($p in $paths) {`,
      `        if (Test-Path $p) {`,
      `          $existed++`,
      `          try {`,
      `            Get-ChildItem $p -Recurse -Force -EA SilentlyContinue | Remove-Item -Recurse -Force -EA SilentlyContinue 2>$null`,
      `            $cnt++`,
      `          } catch {}`,
      `        }`,
      `      }`,
      `      $result = 'OK:' + $killed + ':' + $cnt + ':' + $existed`,
      `    }`,
      `  }`,
      `} catch {`,
      `  $result = 'ERR:' + $_.Exception.Message`,
      `}`,
      `Write-Output ('RES:' + $result)`,
    ].join('\n')

    const script = `try { Invoke-Command -ComputerName '${escPs(hostname)}' -ScriptBlock { ${sb} } -EA Stop } catch { Write-Output ('RES:ERR:' + $_.Exception.Message) }`
    const r = await runPs(script, 90000)
    const lines = (r.stdout ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const resLine = lines.find(l => l.startsWith('RES:'))
    if (!resLine) return fail(r.stderr || 'Keine Antwort vom Ziel-PC')
    const body = resLine.slice(4)
    if (body === 'NOUSER') return fail('Kein angemeldeter Benutzer')
    if (body.startsWith('NOPROFILE')) return fail(`Profilpfad nicht gefunden: ${body.slice(10)}`)
    if (body.startsWith('ERR:')) return fail(body.slice(4))
    if (body.startsWith('OK:')) {
      const m = body.match(/OK:(\d+):(\d+):(\d+)/)
      const killed = m?.[1] ?? '0'
      const cnt = m?.[2] ?? '0'
      const existed = m?.[3] ?? '0'
      if (existed === '0') return ok(`Keine Teams-Cache-Verzeichnisse gefunden — ${killed} Prozess(e) beendet`)
      return ok(`Teams-Cache geleert (${cnt}/${existed} Pfade) — ${killed} Teams-Prozess(e) beendet`)
    }
    return fail(body || 'Unerwartete Antwort')
    })
  },
}

const actionOpenCDrive: DailyCommand = {
  id: 'a.openC',
  label: 'Dateiexplorer C: auf Ziel-PC oeffnen',
  info: 'Oeffnet bei dir lokal das Administrations-Share \\\\hostname\\C$ des Ziel-PCs im Datei-Explorer.',
  kind: 'write',
  requiresHost: true,
  async run({ hostname }) {
    if (!hostname) return fail('Kein Hostname')
    const path = `\\\\${hostname}\\C$`
    const script = `Start-Process explorer.exe '${escPs(path)}'; 'OK'`
    const r = await runPs(script, 5000)
    const out = (r.stdout ?? '').trim()
    if (out === 'OK') return ok(`Explorer geoeffnet: ${path}`)
    return fail(r.stderr || out || 'Konnte Explorer nicht oeffnen')
  },
}

// ── Catalog (used by the UI) ────────────────────────────────────────────────

export const DAILY_QUERIES: DailyCommand[] = [
  queryLastOnline,
  queryIsOnline,
  queryLoggedInUser,
  queryLastReboot,
  queryInstalledPrograms,
  queryDsregcmdStatus,
]

export const DAILY_ACTIONS: DailyCommand[] = [
  actionUnlockAccount,
  actionResetPassword,
  actionEnableRdp,
  actionConnectRdp,
  actionSendMessage,
  actionRestart,
  actionMapDriveI,
  actionGpupdate,
  actionDsregcmdLeave,
  actionSfc,
  actionDism,
  actionClearEdgeCache,
  actionClearTeamsCache,
  actionOpenCDrive,
]

export const ALL_DAILY_COMMANDS: DailyCommand[] = [...DAILY_QUERIES, ...DAILY_ACTIONS]
export function getCommandById(id: string): DailyCommand | undefined {
  return ALL_DAILY_COMMANDS.find(c => c.id === id)
}
