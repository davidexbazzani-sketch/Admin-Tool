// ── Central Remote Command Registry ─────────────────────────────────────────
// Single source of truth for all remote commands.
// Used by both RemoteDoc.tsx and ScheduledTasks.tsx

export type ActionType = 'read' | 'write' | 'critical'

export interface CmdDef {
  id: string
  func: string
  when: string
  buildCmd: (hostname: string, input?: string) => string
  action: ActionType
  input?: { type: 'text' | 'dropdown' | 'service' | 'drivemap' | 'envvar' | 'driveletter' | 'diskpart' | 'diskvol' | 'diskletter' | 'userpass' | 'usergroup' | 'useradd' | 'filepipe'; placeholder?: string; options?: string[]; labels?: string[]; examples?: string[] }
  templates?: { label: string; value: string }[]  // quick-fill buttons shown below input
  local?: boolean        // runs on admin PC, not remote
  longRunning?: boolean
  privacyConsent?: boolean  // show consent dialog before executing (screenshot)
  fileAction?: 'install' | 'transfer'  // open file dialog first, path passed as input
}

export interface Category {
  id: string
  label: string
  commands: CmdDef[]
}

// ── Local/Test Mode ───────────────────────────────────────────────────────────
// When enabled, ALL remote commands run LOCALLY (no Invoke-Command, no WinRM needed)
let _localMode = false
export function setLocalMode(enabled: boolean) { _localMode = enabled }
export function getLocalMode(): boolean { return _localMode }

// ── Execution Method ─────────────────────────────────────────────────────────
// Determines HOW remote commands are delivered to the target PC.
// Set during connection probe in RemoteDoc.tsx.
export type ExecMethod = 'winrm' | 'wmi' | 'psexec' | 'schtasks'
let _execMethod: ExecMethod = 'winrm'
let _psExecDir = '\\\\w3172\\skf marine\\700 Application\\711 IT Allgemein\\SW_INSTA\\Tool IT\\tools'
export function setExecMethod(m: ExecMethod) { _execMethod = m }
export function getExecMethod(): ExecMethod { return _execMethod }
export function setPsExecDir(dir: string) { _psExecDir = dir }
export function getPsExecDir(): string { return _psExecDir }

/** Resolve the best PsExec exe (prefer 64-bit) */
export function getPsExecCmd(): string {
  const dir = _psExecDir.replace(/\\+$/, '')
  return [
    `$p64 = '${dir}\\PsExec64.exe'`,
    `$p32 = '${dir}\\PsExec.exe'`,
    `$psExe = if (Test-Path $p64) { $p64 } elseif (Test-Path $p32) { $p32 } else { $null }`,
  ].join('; ')
}

// ── Helper: robust 3-method user detection on remote PC ──────────────────────
// Runs ALL detection methods LOCALLY on the target PC via a single Invoke-Command
// (avoids CIM/DCOM remoting issues — only needs WinRM).
// Returns PowerShell lines that set $user to DOMAIN\username or exit with error.
// Param varName: the PS variable name to store the result (default '$user')
export function getUserDetectionPS(hSafe: string, varName = '$user'): string[] {
  return [
    `$__detectResult = Invoke-Command -ComputerName '${hSafe}' -ScriptBlock {`,
    `  $dbg = @()`,
    `  # Methode 1: Win32_ComputerSystem`,
    `  try {`,
    `    $cs = Get-CimInstance Win32_ComputerSystem -EA Stop`,
    `    $u = $cs.UserName`,
    `    $dbg += "M1=$u"`,
    `    if ($u) { return @{user=$u; debug=($dbg -join '|')} }`,
    `  } catch { $dbg += "M1-ERR:$($_.Exception.Message)" }`,
    `  # Methode 2: quser`,
    `  try {`,
    `    $qRaw = quser 2>&1`,
    `    $dbg += "M2-raw=$($qRaw -join ' /// ')"`,
    `    $lines = @($qRaw | Where-Object { "$_" -and "$_" -notmatch '^\\s*USERNAME|^\\s*BENUTZERNAME' })`,
    `    $active = $lines | Where-Object { "$_" -match 'Active|Aktiv' } | Select-Object -First 1`,
    `    if (-not $active -and $lines.Count -gt 0) { $active = $lines[0] }`,
    `    if ($active) {`,
    `      $parts = ("$active" -replace '^[> ]+','') -split '\\s{2,}'`,
    `      $u = $parts[0]`,
    `      if ($u -and $u -notmatch '\\\\') { $u = "$env:USERDOMAIN\\$u" }`,
    `      $dbg += "M2-parsed=$u"`,
    `      if ($u) { return @{user=$u; debug=($dbg -join '|')} }`,
    `    } else { $dbg += "M2-noActive" }`,
    `  } catch { $dbg += "M2-ERR:$($_.Exception.Message)" }`,
    `  # Methode 3: explorer.exe Owner`,
    `  try {`,
    `    $procs = @(Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -EA Stop)`,
    `    $dbg += "M3-count=$($procs.Count)"`,
    `    if ($procs.Count -gt 0) {`,
    `      $ow = Invoke-CimMethod -InputObject $procs[0] -MethodName GetOwner -EA Stop`,
    `      $u = "$($ow.Domain)\\$($ow.User)"`,
    `      $dbg += "M3=$u"`,
    `      return @{user=$u; debug=($dbg -join '|')}`,
    `    }`,
    `  } catch { $dbg += "M3-ERR:$($_.Exception.Message)" }`,
    `  return @{user=$null; debug=($dbg -join '|')}`,
    `} -EA Stop`,
    `${varName} = $__detectResult.user`,
    `if (-not ${varName}) { Write-Output "ERR:Kein Benutzer angemeldet auf ${hSafe}. Debug: $($__detectResult.debug)"; exit }`,
  ]
}

// ── Helper to wrap a PS script block for remote execution ────────────────────
// Supports 4 execution methods: winrm, wmi, psexec, schtasks
// Method is determined by module-level _execMethod (set during connection probe)
export function remote(hostname: string, script: string): string {
  const h = hostname.replace(/'/g, "''")
  const alreadyJson = script.includes('ConvertTo-Json')

  // ── LOCAL MODE: Run script directly on this PC ──────────────────────────
  if (_localMode) {
    if (alreadyJson) {
      return [
        `try {`,
        `  ${script}`,
        `} catch { Write-Output """ERR:$($_.Exception.Message)""" }`,
      ].join('\n')
    }
    return [
      `try {`,
      `  $r = & { ${script} }`,
      `  if ($r -ne $null) { $r | ConvertTo-Json -Depth 4 -Compress } else { Write-Output '"OK"' }`,
      `} catch { Write-Output """ERR:$($_.Exception.Message)""" }`,
    ].join('\n')
  }

  // ── WINRM: Invoke-Command (default, fastest) ───────────────────────────
  if (_execMethod === 'winrm') {
    if (alreadyJson) {
      return [
        `try {`,
        `  $r = Invoke-Command -ComputerName '${h}' -ScriptBlock { ${script} } -EA Stop`,
        `  if ($r -ne $null) {`,
        `    if ($r -is [string]) { $r }`,
        `    elseif ($r -is [array]) { $r | ForEach-Object { if ($_ -is [string]) { $_ } else { $_ | ConvertTo-Json -Depth 4 -Compress } } }`,
        `    else { $r | ConvertTo-Json -Depth 4 -Compress }`,
        `  } else { Write-Output '"OK"' }`,
        `} catch { Write-Output """ERR:$($_.Exception.Message)""" }`,
      ].join('\n')
    }
    return [
      `try {`,
      `  $r = Invoke-Command -ComputerName '${h}' -ScriptBlock { ${script} } -EA Stop`,
      `  if ($r -ne $null) { $r | Select-Object * -ExcludeProperty PSComputerName,RunspaceId,PSShowComputerName | ConvertTo-Json -Depth 4 -Compress } else { Write-Output '"OK"' }`,
      `} catch { Write-Output """ERR:$($_.Exception.Message)""" }`,
    ].join('\n')
  }

  // ── For file-based methods (WMI, PsExec, schtasks): ────────────────────
  // Strategy: Write inner script to \\HOST\C$\Temp via UNC admin share,
  // execute it on the target, read result back from a temp file.
  // A unique GUID prevents collisions between parallel commands.

  // Helper: build UNC path (avoid C$ in template literals)
  const unc = '\\\\\\\\' + h + '\\\\C$\\\\Temp'
  const uncPS = `$unc = "${unc}"`

  // ── WMI Process Create ─────────────────────────────────────────────────
  if (_execMethod === 'wmi') {
    // WMI Process Create runs a command on the target; script file + result file approach
    const lines: string[] = [
      'try {',
      '  $guid = [guid]::NewGuid().ToString("N")',
      '  ' + uncPS,
      '  $sf = "$unc\\ittool_$guid.ps1"',
      '  $rf = "$unc\\ittool_$guid.txt"',
      '  if (-not (Test-Path $unc)) { New-Item -Path $unc -ItemType Directory -Force | Out-Null }',
    ]
    // Build wrapper script that runs the inner script and writes output to result file
    lines.push('  $inner = @"')
    lines.push('try {')
    lines.push('  $r = & {')
    lines.push('    ' + script)
    lines.push('  }')
    if (alreadyJson) {
      lines.push('  if ($r -ne $null) { $r | Out-File "C:\\Temp\\ittool_YOURG.txt" -Encoding UTF8 }')
    } else {
      lines.push('  if ($r -ne $null) { $r | ConvertTo-Json -Depth 4 -Compress | Out-File "C:\\Temp\\ittool_YOURG.txt" -Encoding UTF8 }')
    }
    lines.push('  else { \'"OK"\' | Out-File "C:\\Temp\\ittool_YOURG.txt" -Encoding UTF8 }')
    lines.push('} catch { "ERR:$($_.Exception.Message)" | Out-File "C:\\Temp\\ittool_YOURG.txt" -Encoding UTF8 }')
    lines.push('"@')
    lines.push('  $inner = $inner -replace "YOURG", $guid')
    lines.push('  Set-Content -Path $sf -Value $inner -Encoding UTF8 -Force')
    lines.push(`  Invoke-WmiMethod -ComputerName '${h}' -Class Win32_Process -Name Create -ArgumentList "powershell.exe -ExecutionPolicy Bypass -File C:\\Temp\\ittool_$($guid).ps1" -EA Stop | Out-Null`)
    lines.push('  $w = 0; while (!(Test-Path $rf) -and $w -lt 60) { Start-Sleep -Seconds 2; $w += 2 }')
    lines.push('  if (Test-Path $rf) { Get-Content $rf -Raw -Encoding UTF8 } else { Write-Output "ERR:Timeout" }')
    lines.push('  Remove-Item $sf -Force -EA SilentlyContinue')
    lines.push('  Remove-Item $rf -Force -EA SilentlyContinue')
    lines.push('} catch { Write-Output "ERR:$($_.Exception.Message)" }')
    return lines.join('\n')
  }

  // ── PsExec (stdout directly, no result file needed) ────────────────────
  if (_execMethod === 'psexec') {
    const dir = _psExecDir.replace(/\\+$/, '').replace(/'/g, "''")
    const lines: string[] = [
      'try {',
      '  $guid = [guid]::NewGuid().ToString("N")',
      '  ' + uncPS,
      '  $sf = "$unc\\ittool_$guid.ps1"',
      '  if (-not (Test-Path $unc)) { New-Item -Path $unc -ItemType Directory -Force | Out-Null }',
      '  $inner = @"',
      script,
      '"@',
      '  Set-Content -Path $sf -Value $inner -Encoding UTF8 -Force',
      `  $p64 = '${dir}\\PsExec64.exe'; $p32 = '${dir}\\PsExec.exe'`,
      '  $psExe = if (Test-Path $p64) { $p64 } elseif (Test-Path $p32) { $p32 } else { $null }',
      "  if (-not $psExe) { Write-Output 'ERR:PsExec nicht gefunden'; exit }",
      `  $r = & $psExe "\\\\${h}" -s -accepteula powershell.exe -ExecutionPolicy Bypass -File "C:\\Temp\\ittool_$($guid).ps1" 2>&1`,
      '  $lines = ($r | Out-String) -split "`n" | Where-Object { $_ -and $_ -notmatch "^PsExec|^Copyright|^Sysinternals|^Connecting|^Starting|^\\s*$" }',
      '  $lines -join "`n"',
      '  Remove-Item $sf -Force -EA SilentlyContinue',
      '} catch { Write-Output "ERR:$($_.Exception.Message)" }',
    ]
    return lines.join('\n')
  }

  // ── schtasks ───────────────────────────────────────────────────────────
  if (_execMethod === 'schtasks') {
    const lines: string[] = [
      'try {',
      '  $guid = [guid]::NewGuid().ToString("N")',
      '  ' + uncPS,
      '  $sf = "$unc\\ittool_$guid.ps1"',
      '  $rf = "$unc\\ittool_$guid.txt"',
      '  if (-not (Test-Path $unc)) { New-Item -Path $unc -ItemType Directory -Force | Out-Null }',
    ]
    lines.push('  $inner = @"')
    lines.push('try {')
    lines.push('  $r = & {')
    lines.push('    ' + script)
    lines.push('  }')
    if (alreadyJson) {
      lines.push('  if ($r -ne $null) { $r | Out-File "C:\\Temp\\ittool_YOURG.txt" -Encoding UTF8 }')
    } else {
      lines.push('  if ($r -ne $null) { $r | ConvertTo-Json -Depth 4 -Compress | Out-File "C:\\Temp\\ittool_YOURG.txt" -Encoding UTF8 }')
    }
    lines.push('  else { \'"OK"\' | Out-File "C:\\Temp\\ittool_YOURG.txt" -Encoding UTF8 }')
    lines.push('} catch { "ERR:$($_.Exception.Message)" | Out-File "C:\\Temp\\ittool_YOURG.txt" -Encoding UTF8 }')
    lines.push('"@')
    lines.push('  $inner = $inner -replace "YOURG", $guid')
    lines.push('  Set-Content -Path $sf -Value $inner -Encoding UTF8 -Force')
    lines.push(`  $tn = "ITTool_$guid"`)
    lines.push(`  schtasks /create /s ${h} /tn $tn /tr "powershell.exe -ExecutionPolicy Bypass -File C:\\Temp\\ittool_$($guid).ps1" /sc once /st 00:00 /ru SYSTEM /rl HIGHEST /f 2>&1 | Out-Null`)
    lines.push(`  schtasks /run /s ${h} /tn $tn 2>&1 | Out-Null`)
    lines.push('  $w = 0; while (!(Test-Path $rf) -and $w -lt 60) { Start-Sleep -Seconds 2; $w += 2 }')
    lines.push('  if (Test-Path $rf) { Get-Content $rf -Raw -Encoding UTF8 } else { Write-Output "ERR:Timeout" }')
    lines.push(`  schtasks /delete /s ${h} /tn $tn /f 2>&1 | Out-Null`)
    lines.push('  Remove-Item $sf -Force -EA SilentlyContinue')
    lines.push('  Remove-Item $rf -Force -EA SilentlyContinue')
    lines.push('} catch { Write-Output "ERR:$($_.Exception.Message)" }')
    return lines.join('\n')
  }

  // Fallback (should not reach here)
  return 'Write-Output "ERR:Unbekannte Ausfuehrungsmethode"'
}

// ── PS to run a cmd line locally (admin PC) ───────────────────────────────────
export function local(cmd: string): string {
  return `try { ${cmd} } catch { Write-Output "ERR:$($_.Exception.Message)" }`
}

// ── 25 Categories ─────────────────────────────────────────────────────────────
function buildCategories(): Category[] {
  return [
    // ── 1: Netzwerk & Konnektivität ──────────────────────────────────────────
    {
      id: 'net', label: 'Netzwerk & Konnektivität',
      commands: [
        { id: 'ping', func: 'Ping', when: 'Erste Diagnose ob PC an ist',
          buildCmd: (h) => `ping.exe -n 4 ${h}`, action: 'read' },
        { id: 'ping10', func: 'Erweiterter Ping (10x)', when: 'Paketverluste erkennen',
          buildCmd: (h) => local(`Test-Connection -ComputerName '${h}' -Count 10 | Select-Object @{N='Adresse';E={$_.Address}},@{N='Antwortzeit (ms)';E={$_.ResponseTime}},@{N='Status';E={if($_.StatusCode -eq 0){'OK'}else{'Fehler'}}} | ConvertTo-Json -Compress`),
          action: 'read' },
        { id: 'tracert', func: 'Netzwerkpfad verfolgen', when: 'Routing-Probleme',
          buildCmd: (h) => `tracert.exe ${h}`, action: 'read', longRunning: true },
        { id: 'ipconfig', func: 'Komplette Netzwerkkonfiguration', when: 'IP, Gateway, DNS, DHCP',
          buildCmd: (h) => remote(h, `Get-NetIPConfiguration -Detailed | Select-Object InterfaceAlias,InterfaceDescription,@{N='IPv4';E={$_.IPv4Address.IPAddress -join ', '}},@{N='IPv6';E={$_.IPv6Address.IPAddress -join ', '}},@{N='Gateway';E={$_.IPv4DefaultGateway.NextHop -join ', '}},@{N='DNS';E={$_.DNSServer.ServerAddresses -join ', '}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'flushdns', func: 'DNS-Cache leeren', when: 'Webseiten nicht erreichbar',
          buildCmd: (h) => remote(h, `ipconfig /flushdns; Write-Output "DNS-Cache geleert"`), action: 'write' },
        { id: 'ipreset', func: 'IP-Adresse erneuern (DHCP)', when: 'IP-Konflikt beheben',
          buildCmd: (h) => remote(h, `ipconfig /release; Start-Sleep 2; ipconfig /renew; ipconfig | Select-String 'IPv4'`), action: 'write' },
        { id: 'regdns', func: 'DNS-Registrierung erneuern', when: 'PC im DNS falsch aufgelöst',
          buildCmd: (h) => remote(h, `ipconfig /registerdns; Write-Output "DNS-Registrierung erneuert"`), action: 'write' },
        { id: 'winsock', func: 'Winsock zurücksetzen', when: 'Netzwerk nach Malware/Treibern',
          buildCmd: (h) => remote(h, `netsh winsock reset; Write-Output "Winsock zurückgesetzt – Neustart erforderlich"`), action: 'critical' },
        { id: 'tcpreset', func: 'TCP/IP-Stack zurücksetzen', when: 'Kein Internet trotz Verbindung',
          buildCmd: (h) => remote(h, `netsh int ip reset; Write-Output "TCP/IP zurückgesetzt – Neustart erforderlich"`), action: 'critical' },
        { id: 'nslookup', func: 'DNS-Auflösung testen', when: 'DNS funktioniert?',
          buildCmd: (h, i) => remote(h, `nslookup ${i || 'google.com'}`), action: 'read',
          input: { type: 'text', placeholder: 'Domain (z.B. google.com)' } },
        { id: 'arp', func: 'ARP-Tabelle anzeigen', when: 'Doppelte MACs finden',
          buildCmd: (h) => remote(h, `Get-NetNeighbor | Where-Object {$_.State -ne 'Unreachable'} | Select-Object @{N='Adapter';E={$_.InterfaceAlias}},@{N='IP-Adresse';E={$_.IPAddress}},@{N='MAC-Adresse';E={$_.LinkLayerAddress}},@{N='Status';E={$_.State}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'netstat', func: 'Aktive Verbindungen + Ports', when: 'Verdächtige Verbindungen',
          buildCmd: (h) => remote(h, `Get-NetTCPConnection | Where-Object {$_.State -ne 'TimeWait' -and $_.State -ne 'Bound'} | Select-Object @{N='Lokal';E={$_.LocalAddress+':'+$_.LocalPort}},@{N='Remote';E={$_.RemoteAddress+':'+$_.RemotePort}},@{N='Status';E={$_.State}},@{N='PID';E={$_.OwningProcess}} | Sort-Object Status | Select-Object -First 50 | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'route', func: 'Routing-Tabelle', when: 'Routing-Probleme',
          buildCmd: (h) => remote(h, `Get-NetRoute | Where-Object {$_.RouteMetric -lt 9999} | Select-Object @{N='Ziel';E={$_.DestinationPrefix}},@{N='Gateway';E={$_.NextHop}},@{N='Adapter';E={$_.InterfaceAlias}},@{N='Metrik';E={$_.RouteMetric}} | Sort-Object Ziel | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'getadapter', func: 'Netzwerkadapter anzeigen', when: 'Adapter aktiv/getrennt?',
          buildCmd: (h) => remote(h, `Get-NetAdapter | Select-Object @{N='Adapter';E={$_.Name}},@{N='Status';E={$_.Status}},@{N='Geschwindigkeit';E={$_.LinkSpeed}},@{N='MAC-Adresse';E={$_.MacAddress}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'adapter_toggle', func: 'Adapter aktivieren/deaktivieren', when: '„Kabel raus/rein" remote',
          buildCmd: (h, i) => {
            const parts = (i || '').split('|')
            const name = (parts[0] || '').trim()
            const act = (parts[1] || 'Enable').trim()
            return remote(h, `${act}-NetAdapter -Name '${name}' -Confirm:$false; Write-Output "${act} OK: ${name}"`)
          }, action: 'write', input: { type: 'text', placeholder: 'Adaptername|Enable oder Disable' } },
        { id: 'ipaddress', func: 'Alle IP-Adressen', when: 'Mehrere NICs / VPN',
          buildCmd: (h) => remote(h, `Get-NetIPAddress | Select-Object InterfaceAlias,IPAddress,PrefixLength,AddressFamily | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'testport', func: 'Port-Konnektivität testen', when: 'Dienst/Port erreichbar?',
          buildCmd: (_h, i) => {
            const parts = (i || '').split(':')
            const target = parts[0]?.trim() || ''
            const port = parseInt(parts[1] || '443', 10)
            return local(`Test-NetConnection -ComputerName '${target}' -Port ${port} | Select-Object ComputerName,RemotePort,TcpTestSucceeded | ConvertTo-Json -Compress`)
          }, action: 'read', input: { type: 'text', placeholder: 'Ziel:Port (z.B. 8.8.8.8:53)' } },
      ],
    },
    // ── 2: Gruppenrichtlinien & Updates ─────────────────────────────────────
    {
      id: 'gpo', label: 'Gruppenrichtlinien & Updates',
      commands: [
        { id: 'gpupdate', func: 'GPO neu anwenden', when: 'Nach GPO-Änderungen',
          buildCmd: (h) => remote(h, `gpupdate /force; Write-Output "GPO erfolgreich aktualisiert"`), action: 'write', longRunning: true },
        { id: 'gpresult', func: 'Angewendete GPOs anzeigen', when: 'Welche Richtlinien greifen?',
          buildCmd: (h) => remote(h, `gpresult /r 2>&1`), action: 'read' },
        { id: 'gphtml', func: 'GPO-Report als HTML', when: 'Detaillierte GPO-Analyse',
          buildCmd: (h) => remote(h, `gpresult /h C:\\temp\\gpreport.html /f; Write-Output "Report gespeichert: C:\\temp\\gpreport.html"`), action: 'write' },
        { id: 'usoscan', func: 'Update Scan starten', when: 'Update-Erkennung anstoßen',
          buildCmd: (h) => remote(h, `UsoClient StartScan; Write-Output "Scan gestartet"`), action: 'write' },
        { id: 'usodown', func: 'Updates herunterladen', when: 'Updates manuell laden',
          buildCmd: (h) => remote(h, `UsoClient StartDownload; Write-Output "Download gestartet"`), action: 'write' },
        { id: 'usoinst', func: 'Updates installieren', when: 'Updates remote installieren',
          buildCmd: (h) => remote(h, `UsoClient StartInstall; Write-Output "Installation gestartet"`), action: 'write' },
        { id: 'hotfix', func: 'Installierte Updates', when: 'Patch vorhanden?',
          buildCmd: (h) => remote(h, `Get-HotFix | Select-Object HotFixID,Description,InstalledOn | Sort-Object InstalledOn -Descending | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'hotfixid', func: 'Bestimmtes Update suchen', when: 'Gezielt KB prüfen',
          buildCmd: (h, i) => remote(h, `$hf = Get-HotFix -Id '${i || 'KB000000'}' -EA SilentlyContinue; if ($hf) { $hf | Select-Object HotFixID,Description,InstalledOn | ConvertTo-Json -Compress } else { Write-Output '"Nicht gefunden"' }`),
          action: 'read', input: { type: 'text', placeholder: 'KB-Nummer z.B. KB5034441' } },
        { id: 'winupdlog', func: 'Update-Log generieren', when: 'Update-Fehler diagnostizieren',
          buildCmd: (h) => remote(h, `Get-WindowsUpdateLog; Write-Output "Log generiert: C:\\Windows\\Logs\\WindowsUpdate.log"`), action: 'read', longRunning: true },
      ],
    },
    // ── 3: System-Reparatur & Diagnose ───────────────────────────────────────
    {
      id: 'repair', label: 'System-Reparatur & Diagnose',
      commands: [
        { id: 'sfc', func: 'Systemdateien prüfen/reparieren', when: 'Bluescreens, korrupte Dateien',
          buildCmd: (h) => remote(h, `sfc /scannow 2>&1`), action: 'write', longRunning: true },
        { id: 'dism', func: 'Windows-Image reparieren', when: 'sfc kann Fehler nicht fixen',
          buildCmd: (h) => remote(h, `DISM /Online /Cleanup-Image /RestoreHealth 2>&1`), action: 'write', longRunning: true },
        { id: 'dismcheck', func: 'Image-Schnellcheck', when: 'Schnelle Diagnose',
          buildCmd: (h) => remote(h, `DISM /Online /Cleanup-Image /CheckHealth 2>&1`), action: 'read', longRunning: true },
        { id: 'chkdsk', func: 'Festplatte prüfen', when: 'Festplattenfehler, Abstürze',
          buildCmd: (h) => remote(h, `chkdsk C: /f /r /x 2>&1`), action: 'critical', longRunning: true },
        { id: 'evtsys', func: 'Letzte System-Events', when: 'Systemfehler nachverfolgen',
          buildCmd: (h) => remote(h, `Get-EventLog -LogName System -Newest 50 | Select-Object @{N='Zeitpunkt';E={$_.TimeGenerated.ToString('dd.MM.yyyy HH:mm')}},@{N='Typ';E={$_.EntryType}},@{N='Quelle';E={$_.Source}},@{N='Nachricht';E={$_.Message.Split([char]10)[0].Substring(0,[math]::Min(120,$_.Message.Split([char]10)[0].Length))}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'evtapp', func: 'Letzte App-Fehler', when: 'App-Abstürze diagnostizieren',
          buildCmd: (h) => remote(h, `Get-EventLog -LogName Application -EntryType Error -Newest 20 | Select-Object @{N='Zeitpunkt';E={$_.TimeGenerated.ToString('dd.MM.yyyy HH:mm')}},@{N='Quelle';E={$_.Source}},@{N='Nachricht';E={$_.Message.Split([char]10)[0].Substring(0,[math]::Min(120,$_.Message.Split([char]10)[0].Length))}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'evtcrit', func: 'Kritische Fehler (24h)', when: 'Schneller Problemüberblick',
          buildCmd: (h) => remote(h, `$t=(Get-Date).AddHours(-24); Get-WinEvent -FilterHashtable @{LogName='System','Application';Level=2;StartTime=$t} -MaxEvents 30 -EA SilentlyContinue | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm')}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='Quelle';E={$_.ProviderName}},@{N='Nachricht';E={$_.Message.Split([char]10)[0].Substring(0,[math]::Min(120,$_.Message.Split([char]10)[0].Length))}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'evtclear', func: 'Event-Log leeren', when: 'Nach Fehlerbehebung',
          buildCmd: (h, i) => remote(h, `Clear-EventLog -LogName '${i || 'System'}'; Write-Output "Log '${i || 'System'}' geleert"`),
          action: 'critical', input: { type: 'dropdown', options: ['System', 'Application', 'Security'] } },
        { id: 'repairvol', func: 'Laufwerk scannen', when: 'Moderne chkdsk-Alternative',
          buildCmd: (h) => remote(h, `Repair-Volume -DriveLetter C -Scan; Write-Output "Scan abgeschlossen"`), action: 'write', longRunning: true },
        { id: 'physicaldisk', func: 'Physische Disks Zustand', when: 'SSD-Wear, Fehler',
          buildCmd: (h) => remote(h, `Get-PhysicalDisk | Select-Object @{N='Festplatte';E={$_.FriendlyName}},@{N='Typ';E={$_.MediaType}},@{N='Größe (GB)';E={[math]::Round($_.Size/1GB,0)}},@{N='Zustand';E={$_.HealthStatus}},@{N='Status';E={$_.OperationalStatus}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'getdisk', func: 'Alle Disks Status', when: 'Disk offline/fehlerhaft?',
          buildCmd: (h) => remote(h, `Get-Disk | Select-Object @{N='Nr';E={$_.Number}},@{N='Festplatte';E={$_.FriendlyName}},@{N='Status';E={$_.OperationalStatus}},@{N='Zustand';E={$_.HealthStatus}},@{N='Größe (GB)';E={[math]::Round($_.Size/1GB,0)}} | ConvertTo-Json -Compress`), action: 'read' },
      ],
    },
    // ── 4: Prozesse & Performance ────────────────────────────────────────────
    {
      id: 'procs', label: 'Prozesse & Performance',
      commands: [
        { id: 'topcpu', func: 'Top 20 CPU-Prozesse', when: 'Was belastet CPU?',
          buildCmd: (h) => remote(h, `Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 @{N='Prozess';E={$_.Name}},@{N='PID';E={$_.Id}},@{N='CPU (Sek)';E={[math]::Round($_.CPU,1)}},@{N='RAM (MB)';E={[math]::Round($_.WorkingSet64/1MB,0)}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'topram', func: 'Top 20 RAM-Prozesse', when: 'RAM zu hoch',
          buildCmd: (h) => remote(h, `Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 20 @{N='Prozess';E={$_.Name}},@{N='PID';E={$_.Id}},@{N='RAM (MB)';E={[math]::Round($_.WorkingSet64/1MB,0)}},@{N='CPU (Sek)';E={[math]::Round($_.CPU,1)}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'killname', func: 'Prozess beenden (Name)', when: 'App hängt',
          buildCmd: (h, i) => remote(h, `Stop-Process -Name '${i}' -Force -EA Stop; Write-Output "Prozess '${i}' beendet"`),
          action: 'write', input: { type: 'text', placeholder: 'Prozessname z.B. notepad' } },
        { id: 'killpid', func: 'Prozess beenden (PID)', when: 'Gezielt per PID',
          buildCmd: (h, i) => remote(h, `Stop-Process -Id ${i} -Force -EA Stop; Write-Output "PID ${i} beendet"`),
          action: 'write', input: { type: 'text', placeholder: 'PID-Nummer' } },
        { id: 'cpuload', func: 'CPU-Auslastung', when: 'Schnellcheck',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_Processor | Select-Object Name,LoadPercentage,NumberOfCores | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'ramload', func: 'RAM-Auslastung', when: 'Speicher prüfen',
          buildCmd: (h) => remote(h, `$os=Get-CimInstance Win32_OperatingSystem; @{TotalGB=[math]::Round($os.TotalVisibleMemorySize/1MB,1);FreeGB=[math]::Round($os.FreePhysicalMemory/1MB,1);UsedPercent=[math]::Round((($os.TotalVisibleMemorySize-$os.FreePhysicalMemory)/$os.TotalVisibleMemorySize)*100,0)} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'diskfree', func: 'Freier Speicherplatz', when: 'Festplatte voll?',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,@{N='SizeGB';E={[math]::Round($_.Size/1GB,1)}},@{N='FreeGB';E={[math]::Round($_.FreeSpace/1GB,1)}},@{N='UsedPct';E={[math]::Round((($_.Size-$_.FreeSpace)/$_.Size)*100,0)}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'procuser', func: 'Prozesse mit Username', when: 'Welcher User welche Prozesse',
          buildCmd: (h) => remote(h, `Get-Process -IncludeUserName -EA SilentlyContinue | Sort-Object CPU -Descending | Select-Object -First 30 @{N='Prozess';E={$_.Name}},@{N='PID';E={$_.Id}},@{N='CPU (Sek)';E={[math]::Round($_.CPU,1)}},@{N='RAM (MB)';E={[math]::Round($_.WorkingSet64/1MB,0)}},@{N='Benutzer';E={$_.UserName}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'autostart', func: 'Autostart-Programme', when: 'Langsames Hochfahren',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_StartupCommand | Select-Object @{N='Programm';E={$_.Name}},@{N='Befehl';E={$_.Command}},@{N='Ort';E={$_.Location}},@{N='Benutzer';E={$_.User}} | ConvertTo-Json -Compress`), action: 'read' },
      ],
    },
    // ── 5: Dienste / Services — rendered as ServicePanel, no command rows ────
    {
      id: 'svc', label: 'Dienste / Services',
      commands: [
        { id: 'svc-stop', func: 'Dienst stoppen', when: 'Dienst anhalten',
          buildCmd: (h, i) => {
            const names = (i || '').split(',').map(s => s.trim()).filter(Boolean)
            const script = names.length
              ? names.map(n => `Stop-Service -Name '${n}' -Force -EA Stop; Write-Output "Gestoppt: ${n}"`).join('; ')
              : `Write-Output "Keine Dienste angegeben"`
            return remote(h, script)
          }, action: 'write', input: { type: 'service', placeholder: 'Dienstname' } },
        { id: 'svc-start', func: 'Dienst starten', when: 'Dienst aktivieren',
          buildCmd: (h, i) => {
            const names = (i || '').split(',').map(s => s.trim()).filter(Boolean)
            const script = names.length
              ? names.map(n => `Start-Service -Name '${n}' -EA Stop; Write-Output "Gestartet: ${n}"`).join('; ')
              : `Write-Output "Keine Dienste angegeben"`
            return remote(h, script)
          }, action: 'write', input: { type: 'service', placeholder: 'Dienstname' } },
        { id: 'svc-restart', func: 'Dienst neustarten', when: 'Dienst neu laden',
          buildCmd: (h, i) => {
            const names = (i || '').split(',').map(s => s.trim()).filter(Boolean)
            const script = names.length
              ? names.map(n => `Restart-Service -Name '${n}' -Force -EA Stop; Write-Output "Neugestartet: ${n}"`).join('; ')
              : `Write-Output "Keine Dienste angegeben"`
            return remote(h, script)
          }, action: 'write', input: { type: 'service', placeholder: 'Dienstname' } },
      ],
    },
    // ── 6: Benutzer & Sitzungen ──────────────────────────────────────────────
    {
      id: 'sessions', label: 'Benutzer & Sitzungen',
      commands: [
        { id: 'queryuser', func: 'Angemeldete Benutzer', when: 'Wer ist am PC?',
          buildCmd: (h) => remote(h, `$cs=Get-CimInstance Win32_ComputerSystem; $procs=Get-Process -IncludeUserName -EA SilentlyContinue | Where-Object {$_.UserName} | Group-Object UserName | Select-Object @{N='Benutzer';E={$_.Name}},@{N='Prozesse';E={$_.Count}}; if (-not $procs) { @{Benutzer=$cs.UserName; Prozesse='N/A'; Modell=$cs.Model} | ConvertTo-Json -Compress } else { $procs | ConvertTo-Json -Compress }`), action: 'read' },
        { id: 'querysess', func: 'Alle Sessions', when: 'Getrennte RDP-Sessions',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_LogonSession | Select-Object @{N='LogonId';E={$_.LogonId}},@{N='LogonType';E={$_.LogonType}},@{N='StartTime';E={$_.StartTime}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'logoff', func: 'Benutzer abmelden', when: 'Session beenden',
          buildCmd: (h, i) => remote(h, `logoff ${i}; Write-Output "Session ${i} abgemeldet"`),
          action: 'critical', input: { type: 'text', placeholder: 'Session-ID' } },
        { id: 'msg', func: 'Nachricht senden', when: 'Warnung vor Aktion',
          buildCmd: (h, i) => remote(h, `msg * '${(i || '').replace(/'/g, "''")}'; Write-Output "Nachricht gesendet"`),
          action: 'write', input: { type: 'text', placeholder: 'Nachrichtentext' } },
        { id: 'localadmins', func: 'Lokale Admins', when: 'Wer hat Admin-Rechte?',
          buildCmd: (h) => remote(h, `Get-LocalGroupMember -Group Administrators | Select-Object Name,ObjectClass,PrincipalSource | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'localusers', func: 'Lokale Benutzerkonten', when: 'Accounts auflisten',
          buildCmd: (h) => remote(h, `Get-LocalUser | Select-Object Name,Enabled,LastLogon,PasswordLastSet | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'whoami', func: 'User mit allen Rechten', when: 'Berechtigungsprobleme',
          buildCmd: (h) => remote(h, `whoami /all 2>&1`), action: 'read' },
      ],
    },
    // ── 7: Software & Programme ──────────────────────────────────────────────
    {
      id: 'software', label: 'Software & Programme',
      commands: [
        { id: 'swlist', func: 'Installierte Software', when: 'Software-Inventar',
          buildCmd: (h) => remote(h, `$paths=@('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); Get-ItemProperty $paths -EA SilentlyContinue | Where-Object {$_.DisplayName} | Select-Object DisplayName,DisplayVersion,Publisher,PSChildName,UninstallString | Sort-Object DisplayName`), action: 'read' },
        { id: 'storeapps', func: 'Store Apps anzeigen', when: 'UWP-Apps',
          buildCmd: (h) => remote(h, `Get-AppxPackage | Select-Object Name,PackageFullName,Version | Sort-Object Name`), action: 'read' },
        { id: 'swuninstall', func: 'Software deinstallieren', when: 'Klassische Software (MSI/EXE) komplett entfernen',
          buildCmd: (h, i) => {
            const name = (i || '').replace(/'/g, "''")
            const hs = h.replace(/'/g, "''")
            // Build the PS1 file content — each line is clean, no JS escaping issues
            const ps1 = [
              "$paths = @('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')",
              "$apps = Get-ItemProperty $paths -EA SilentlyContinue | Where-Object { $_.DisplayName -like '*" + name + "*' }",
              "if (-not $apps) { 'ERR:Keine Software gefunden'; exit }",
              "if (@($apps).Count -gt 1) { 'Mehrere Treffer:'; @($apps) | ForEach-Object { '  - ' + $_.DisplayName + ' (' + $_.DisplayVersion + ')' }; 'Bitte genaueren Namen eingeben.'; exit }",
              "$app = @($apps)[0]",
              "$dn = $app.DisplayName",
              "'Deinstalliere: ' + $dn + ' (' + $app.DisplayVersion + ')'",
              "",
              "# MSI GUID?",
              "$guid = $null",
              "if ($app.PSChildName -match '^\\{') { $guid = $app.PSChildName }",
              "elseif ($app.UninstallString -match '(\\{[A-Fa-f0-9-]+\\})') { $guid = $Matches[1] }",
              "",
              "if ($guid) {",
              "  '[1] MSI: msiexec /x ' + $guid",
              "  $p = Start-Process msiexec.exe -ArgumentList ('/x ' + $guid + ' /quiet /norestart') -Wait -PassThru",
              "  '[1] Exit: ' + $p.ExitCode",
              "  Start-Sleep 3",
              "  if (-not (Get-ItemProperty $paths -EA SilentlyContinue | Where-Object { $_.DisplayName -eq $dn })) { 'ERFOLG: ' + $dn + ' deinstalliert'; exit }",
              "}",
              "",
              "if ($app.QuietUninstallString) {",
              "  '[2] Quiet: ' + $app.QuietUninstallString",
              "  cmd.exe /c ($app.QuietUninstallString) 2>&1 | Out-Null",
              "  Start-Sleep 5",
              "  if (-not (Get-ItemProperty $paths -EA SilentlyContinue | Where-Object { $_.DisplayName -eq $dn })) { 'ERFOLG: ' + $dn + ' deinstalliert'; exit }",
              "}",
              "",
              "if ($app.UninstallString) {",
              "  $u = $app.UninstallString",
              "  if ($u -match 'msiexec') { $cmd = $u + ' /quiet /norestart' }",
              "  elseif ($u -match 'chrome') { $cmd = $u + ' --force-uninstall' }",
              "  elseif ($u -match 'unins\\d') { $cmd = $u + ' /VERYSILENT /SUPPRESSMSGBOXES /NORESTART' }",
              "  else { $cmd = $u + ' /S /silent /quiet /norestart' }",
              "  '[3] EXE: ' + $cmd",
              "  cmd.exe /c ($cmd) 2>&1 | Out-Null",
              "  Start-Sleep 8",
              "  if (-not (Get-ItemProperty $paths -EA SilentlyContinue | Where-Object { $_.DisplayName -eq $dn })) { 'ERFOLG: ' + $dn + ' deinstalliert'; exit }",
              "}",
              "",
              "'WARNUNG: ' + $dn + ' scheint noch installiert. Evtl. Neustart noetig.'",
            ]
            // Write PS1 to admin share C$\Temp, run it via Invoke-Command, clean up
            const psContent = ps1.join('\r\n').replace(/'/g, "''")
            return [
              "try { New-Item -Path '\\\\" + hs + "\\C$\\Temp' -ItemType Directory -Force -EA SilentlyContinue | Out-Null } catch {}",
              "Set-Content -Path '\\\\" + hs + "\\C$\\Temp\\it_uninstall.ps1' -Value '" + psContent + "' -Force",
              "try {",
              "  Invoke-Command -ComputerName '" + hs + "' -ScriptBlock { powershell.exe -ExecutionPolicy Bypass -File C:\\Temp\\it_uninstall.ps1 } -EA Stop | ForEach-Object { \"$_\" }",
              "} catch { Write-Output \"ERR:$($_.Exception.Message)\" }",
              "Remove-Item '\\\\" + hs + "\\C$\\Temp\\it_uninstall.ps1' -Force -EA SilentlyContinue",
            ].join('\n')
          }, action: 'critical', longRunning: true,
          input: { type: 'text', placeholder: 'z.B. Google Chrome oder 7-Zip' } },
        { id: 'removeapp', func: 'Store App deinstallieren', when: 'UWP/Store-App entfernen (nicht klassische Software)',
          buildCmd: (h, i) => remote(h, `Get-AppxPackage -Name '*${i}*' | Remove-AppxPackage -EA Stop; Write-Output "App entfernt"`),
          action: 'critical', input: { type: 'text', placeholder: 'App-Name (Teilname)' } },
        { id: 'wingetlist', func: 'Winget: Programme listen', when: 'Alle über Winget verwalteten Programme anzeigen',
          buildCmd: (h) => remote(h, [
            '$wg = Get-ChildItem "C:\\Program Files\\WindowsApps\\Microsoft.DesktopAppInstaller_*\\winget.exe" -EA SilentlyContinue | Select-Object -First 1',
            'if (-not $wg) { Write-Output "ERR:winget nicht gefunden auf diesem PC"; exit }',
            '& $wg.FullName list --accept-source-agreements 2>&1 | ForEach-Object { "$_" }',
          ].join('\n')), action: 'read', longRunning: true },
        { id: 'wingetupglist', func: 'Winget: Verfügbare Updates', when: 'Prüfen welche Programme ein Update haben',
          buildCmd: (h) => remote(h, [
            '$wg = Get-ChildItem "C:\\Program Files\\WindowsApps\\Microsoft.DesktopAppInstaller_*\\winget.exe" -EA SilentlyContinue | Select-Object -First 1',
            'if (-not $wg) { Write-Output "ERR:winget nicht gefunden auf diesem PC"; exit }',
            '& $wg.FullName upgrade --accept-source-agreements 2>&1 | ForEach-Object { "$_" }',
          ].join('\n')), action: 'read', longRunning: true },
        { id: 'wingetupg', func: 'Winget: Alle updaten', when: 'Alle verfügbaren Updates installieren',
          buildCmd: (h) => remote(h, [
            '$wg = Get-ChildItem "C:\\Program Files\\WindowsApps\\Microsoft.DesktopAppInstaller_*\\winget.exe" -EA SilentlyContinue | Select-Object -First 1',
            'if (-not $wg) { Write-Output "ERR:winget nicht gefunden auf diesem PC"; exit }',
            '& $wg.FullName upgrade --all --silent --accept-package-agreements --accept-source-agreements 2>&1 | ForEach-Object { "$_" }',
          ].join('\n')), action: 'write', longRunning: true },
      ],
    },
    // ── 8: Drucker ───────────────────────────────────────────────────────────
    {
      id: 'printer', label: 'Drucker',
      commands: [
        { id: 'getprinter', func: 'Drucker anzeigen', when: 'Diagnostizieren',
          buildCmd: (h) => remote(h, `Get-Printer | Select-Object @{N='Drucker';E={$_.Name}},@{N='Treiber';E={$_.DriverName}},@{N='Port';E={$_.PortName}},@{N='Status';E={$_.PrinterStatus}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'printjobs', func: 'Druckaufträge anzeigen', when: 'Warteschlange',
          buildCmd: (h, i) => remote(h, `Get-PrintJob -PrinterName '${i || '*'}' -EA SilentlyContinue | Select-Object @{N='ID';E={$_.Id}},@{N='Dokument';E={$_.Document}},@{N='Benutzer';E={$_.UserName}},@{N='Status';E={$_.JobStatus}} | ConvertTo-Json -Compress`),
          action: 'read', input: { type: 'text', placeholder: 'Druckername (leer = alle)' } },
        { id: 'deljob', func: 'Druckauftrag löschen', when: 'Hängender Auftrag',
          buildCmd: (h, i) => {
            const p = (i || '').split('|')
            return remote(h, `Remove-PrintJob -PrinterName '${p[0]?.trim()}' -ID ${p[1]?.trim()} -EA Stop; Write-Output "Auftrag gelöscht"`)
          }, action: 'write', input: { type: 'text', placeholder: 'Druckername|Job-ID' } },
        { id: 'clearjobs', func: 'Alle Aufträge löschen', when: 'Warteschlange leeren',
          buildCmd: (h, i) => remote(h, `$jobs=@(Get-PrintJob -PrinterName '${i}' -EA SilentlyContinue); foreach($j in $jobs){Remove-PrintJob -PrinterName '${i}' -ID $j.Id -EA SilentlyContinue}; Write-Output "Alle Aufträge gelöscht"`),
          action: 'write', input: { type: 'text', placeholder: 'Druckername' } },
        { id: 'spooler', func: 'Spooler neustarten', when: 'Universal-Fix',
          buildCmd: (h) => remote(h, `Restart-Service Spooler -Force -EA Stop; Write-Output "Spooler neugestartet"`), action: 'write' },
        { id: 'spoolerclean', func: 'Spooler bereinigen', when: 'Hartnäckige Probleme',
          buildCmd: (h) => remote(h, `Stop-Service Spooler -Force -EA SilentlyContinue; Remove-Item "C:\\Windows\\System32\\spool\\PRINTERS\\*" -Force -EA SilentlyContinue; Start-Service Spooler -EA Stop; Write-Output "Spooler bereinigt und neugestartet"`), action: 'critical' },
        { id: 'addprinter', func: 'Drucker hinzufügen', when: 'Remote installieren',
          buildCmd: (h, i) => remote(h, `Add-Printer -ConnectionName '${i}' -EA Stop; Write-Output "Drucker hinzugefügt: ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'UNC-Pfad z.B. \\\\server\\drucker' } },
        { id: 'removeprinter', func: 'Drucker entfernen', when: 'Alten löschen',
          buildCmd: (h, i) => remote(h, `Remove-Printer -Name '${i}' -EA Stop; Write-Output "Drucker entfernt: ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'Druckername' } },
      ],
    },
    // ── 9: Festplatte & Speicher ─────────────────────────────────────────────
    {
      id: 'disk', label: 'Festplatte & Speicher',
      commands: [
        { id: 'diskspace', func: 'Laufwerke + Speicherplatz', when: 'Übersicht',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,@{N='SizeGB';E={[math]::Round($_.Size/1GB,1)}},@{N='FreeGB';E={[math]::Round($_.FreeSpace/1GB,1)}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'wintemp', func: 'Windows Temp leeren', when: 'Platz freigeben',
          buildCmd: (h) => remote(h, `Remove-Item "C:\\Windows\\Temp\\*" -Recurse -Force -EA SilentlyContinue; Write-Output "Windows Temp geleert"`), action: 'write' },
        { id: 'usertemp', func: 'Benutzer Temp leeren', when: 'Platz freigeben',
          buildCmd: (h) => remote(h, `Remove-Item "$env:TEMP\\*" -Recurse -Force -EA SilentlyContinue; Write-Output "User Temp geleert"`), action: 'write' },
        { id: 'recycle', func: 'Papierkorb leeren', when: 'Platz freigeben',
          buildCmd: (h) => remote(h, `Clear-RecycleBin -Force -EA SilentlyContinue; Write-Output "Papierkorb geleert"`), action: 'write' },
        { id: 'physdisk2', func: 'Physische Disks', when: 'SSD/HDD Gesundheit',
          buildCmd: (h) => remote(h, `Get-PhysicalDisk | Select-Object FriendlyName,MediaType,Size,HealthStatus,OperationalStatus | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'volumes', func: 'Volumes anzeigen', when: 'Partitionen',
          buildCmd: (h) => remote(h, `Get-Volume | Where-Object {$_.DriveLetter} | Select-Object DriveLetter,FileSystemLabel,FileSystem,@{N='SizeGB';E={[math]::Round($_.Size/1GB,1)}},@{N='FreeGB';E={[math]::Round($_.SizeRemaining/1GB,1)}},HealthStatus | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'defrag', func: 'HDD Defragmentieren', when: 'HDD langsam',
          buildCmd: (h) => remote(h, `Optimize-Volume -DriveLetter C -Defrag -Verbose 2>&1`), action: 'write', longRunning: true },
        { id: 'trim', func: 'SSD TRIM', when: 'SSD optimieren',
          buildCmd: (h) => remote(h, `Optimize-Volume -DriveLetter C -ReTrim -Verbose 2>&1`), action: 'write' },
      ],
    },
    // ── 10: Neustart & Herunterfahren ────────────────────────────────────────
    {
      id: 'reboot', label: 'Neustart & Herunterfahren',
      commands: [
        { id: 'rebootcount', func: 'Neustart mit Countdown', when: 'Geplanter Neustart',
          buildCmd: (h, i) => {
            const p = (i || '60|Neustart in Kürze').split('|')
            const sec = parseInt(p[0] || '60', 10)
            const msg = (p[1] || 'Neustart in Kürze').replace(/'/g, "''")
            return remote(h, `shutdown /r /t ${sec} /c '${msg}'; Write-Output "Neustart geplant in ${sec}s"`)
          }, action: 'critical', input: { type: 'text', placeholder: 'Sekunden|Nachricht z.B. 120|Bitte speichern' } },
        { id: 'rebootnow', func: 'Sofortiger Neustart', when: 'Dringend',
          buildCmd: (h) => remote(h, `shutdown /r /t 0; Write-Output "Neustart wird ausgeführt"`), action: 'critical' },
        { id: 'shutdown', func: 'Herunterfahren', when: 'Remote ausschalten',
          buildCmd: (h) => remote(h, `shutdown /s /t 0; Write-Output "Herunterfahren wird ausgeführt"`), action: 'critical' },
        { id: 'shutdownabort', func: 'Shutdown abbrechen', when: 'Versehentlichen stoppen',
          buildCmd: (h) => remote(h, `shutdown /a; Write-Output "Shutdown abgebrochen"`), action: 'write' },
        { id: 'rebootforce', func: 'Erzwungener Neustart', when: 'Apps blockieren',
          buildCmd: (h) => remote(h, `shutdown /r /f /t 60 /c "Erzwungener Neustart durch Admin"; Write-Output "Erzwungener Neustart in 60s"`), action: 'critical' },
      ],
    },
    // ── 11: Firewall & Sicherheit ────────────────────────────────────────────
    {
      id: 'security', label: 'Firewall & Sicherheit',
      commands: [
        { id: 'fwprofile', func: 'Firewall-Status', when: 'Aktiv?',
          buildCmd: (h) => remote(h, `Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultInboundAction,DefaultOutboundAction | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'fwrules', func: 'Aktive Regeln', when: 'Analysieren',
          buildCmd: (h) => remote(h, `$r=@(Get-NetFirewallRule | Where-Object {$_.Enabled -eq 'True'}); $r | Select-Object DisplayName,Direction,Action,Profile | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'defstatus', func: 'Defender Status', when: 'Virenschutz OK?',
          buildCmd: (h) => remote(h, `Get-MpComputerStatus | Select-Object AMRunningMode,AntivirusEnabled,RealTimeProtectionEnabled,AntispywareSignatureLastUpdated | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'defthreats', func: 'Erkannte Bedrohungen', when: 'Malware?',
          buildCmd: (h) => remote(h, `$t=@(Get-MpThreatDetection -EA SilentlyContinue); if ($t) { $t | Select-Object ThreatName,SeverityID,DetectionTime,ActionSuccess | ConvertTo-Json -Compress } else { Write-Output '"Keine Bedrohungen gefunden"' }`), action: 'read' },
        { id: 'defsigupd', func: 'Signaturen aktualisieren', when: 'Defender updaten',
          buildCmd: (h) => remote(h, `Update-MpSignature -EA Stop; Write-Output "Signaturen aktualisiert"`), action: 'write', longRunning: true },
        { id: 'defscan', func: 'Defender Scan', when: 'Virenprüfung',
          buildCmd: (h, i) => remote(h, `Start-MpScan -ScanType ${i || 'QuickScan'} -EA Stop; Write-Output "Scan gestartet: ${i || 'QuickScan'}"`),
          action: 'write', longRunning: true, input: { type: 'dropdown', options: ['QuickScan', 'FullScan', 'CustomScan'] } },
        { id: 'bitlocker', func: 'BitLocker-Status', when: 'Verschlüsselt?',
          buildCmd: (h) => remote(h, `Get-BitLockerVolume | Select-Object MountPoint,EncryptionMethod,VolumeStatus,ProtectionStatus | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'bitlockerkey', func: 'BitLocker Recovery Key', when: 'User ausgesperrt',
          buildCmd: (h) => remote(h, `(Get-BitLockerVolume -MountPoint C:).KeyProtector | Where-Object {$_.KeyProtectorType -eq 'RecoveryPassword'} | Select-Object KeyProtectorId,RecoveryPassword | ConvertTo-Json -Compress`), action: 'read' },
      ],
    },
    // ── 12: Hardware-Informationen ───────────────────────────────────────────
    {
      id: 'hw', label: 'Hardware-Informationen',
      commands: [
        { id: 'hwcs', func: 'PC-Modell, Hersteller, RAM', when: 'Hardware-Inventar',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_ComputerSystem | Select-Object @{N='Hersteller';E={$_.Manufacturer}},@{N='Modell';E={$_.Model}},@{N='RAM (GB)';E={[math]::Round($_.TotalPhysicalMemory/1GB,0)}},@{N='Prozessoren';E={$_.NumberOfProcessors}},@{N='Logische Kerne';E={$_.NumberOfLogicalProcessors}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'hwbios', func: 'BIOS + Seriennummer', when: 'Garantie/Support',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_BIOS | Select-Object @{N='Hersteller';E={$_.Manufacturer}},@{N='BIOS-Version';E={$_.SMBIOSBIOSVersion}},@{N='Seriennummer';E={$_.SerialNumber}},@{N='Datum';E={$_.ReleaseDate}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'hwcpu', func: 'CPU-Info', when: 'Prozessor, Kerne, Takt',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_Processor | Select-Object @{N='Prozessor';E={$_.Name}},@{N='Kerne';E={$_.NumberOfCores}},@{N='Logische Kerne';E={$_.NumberOfLogicalProcessors}},@{N='Max Takt (MHz)';E={$_.MaxClockSpeed}},@{N='Auslastung (%)';E={$_.LoadPercentage}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'hwram', func: 'RAM-Module Details', when: 'Slots, Module',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_PhysicalMemory | Select-Object @{N='Slot';E={$_.Tag}},@{N='Größe (GB)';E={[math]::Round($_.Capacity/1GB,0)}},@{N='Geschwindigkeit';E={$_.Speed}},@{N='Hersteller';E={$_.Manufacturer}},@{N='Teilenummer';E={$_.PartNumber}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'hwgpu', func: 'Grafikkarte', when: 'GPU, Treiber',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_VideoController | Select-Object @{N='Grafikkarte';E={$_.Name}},@{N='VRAM';E={if($_.AdapterRAM){[math]::Round($_.AdapterRAM/1GB,1).ToString()+' GB'}else{'N/A'}}},@{N='Treiberversion';E={$_.DriverVersion}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'hwnic', func: 'Netzwerkadapter (physisch)', when: 'NICs prüfen',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_NetworkAdapter | Where-Object {$_.PhysicalAdapter} | Select-Object @{N='Adapter';E={$_.Name}},@{N='MAC-Adresse';E={$_.MACAddress}},@{N='Typ';E={$_.AdapterType}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'hwbat', func: 'Akku-Status (Laptop)', when: 'Akku-Zustand',
          buildCmd: (h) => remote(h, `$b=@(Get-CimInstance Win32_Battery -EA SilentlyContinue); if ($b) { $b | Select-Object @{N='Akku';E={$_.Name}},@{N='Ladung (%)';E={$_.EstimatedChargeRemaining}},@{N='Status';E={$_.BatteryStatus}},@{N='Restlaufzeit (Min)';E={$_.EstimatedRunTime}} | ConvertTo-Json -Compress } else { Write-Output '"Kein Akku gefunden (Desktop-PC)"' }`), action: 'read' },
        { id: 'hwos', func: 'OS-Version + Build', when: 'Windows-Version',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_OperatingSystem | Select-Object @{N='Betriebssystem';E={$_.Caption}},@{N='Version';E={$_.Version}},@{N='Build';E={$_.BuildNumber}},@{N='Architektur';E={$_.OSArchitecture}},@{N='Letzter Start';E={$_.LastBootUpTime}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'sysinfo', func: 'Komplette Systeminfo', when: 'Alles auf einen Blick',
          buildCmd: (h) => remote(h, `$ci=Get-ComputerInfo -EA Stop; @{Computername=$ci.CsName; Hersteller=$ci.CsManufacturer; Modell=$ci.CsModel; OS=$ci.OsName; OSBuild=$ci.OsBuildNumber; OSArchitektur=$ci.OsArchitecture; RAM_GB=[math]::Round($ci.CsTotalPhysicalMemory/1GB,1); Prozessor=$ci.CsProcessors.Name; DomainMitglied=$ci.CsPartOfDomain; Domain=$ci.CsDomain; Letzter_Boot=$ci.OsLastBootUpTime; Zeitzone=$ci.TimeZone; Windows_Verzeichnis=$ci.WindowsDirectory } | ConvertTo-Json -Compress`), action: 'read', longRunning: true },
        { id: 'baddev', func: 'Fehlerhafte Geräte', when: 'Treiber-Probleme',
          buildCmd: (h) => remote(h, `$d=@(Get-CimInstance Win32_PnPEntity | Where-Object {$_.ConfigManagerErrorCode -ne 0}); if ($d) { $d | Select-Object @{N='Gerät';E={$_.Name}},@{N='Fehlercode';E={$_.ConfigManagerErrorCode}} | ConvertTo-Json -Compress } else { Write-Output '"Keine fehlerhaften Geräte gefunden — alles OK"' }`), action: 'read' },
      ],
    },
    // ── 13: Netzlaufwerke & Freigaben ────────────────────────────────────────
    {
      id: 'shares', label: 'Netzlaufwerke & Freigaben',
      commands: [
        { id: 'smbshares', func: 'Alle Freigaben', when: 'Welche Ordner?',
          buildCmd: (h) => remote(h, `Get-SmbShare | Select-Object @{N='Freigabe';E={$_.Name}},@{N='Pfad';E={$_.Path}},@{N='Beschreibung';E={$_.Description}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'smbsess', func: 'Aktive SMB-Verbindungen', when: 'Wer greift zu?',
          buildCmd: (h) => remote(h, `Get-SmbSession | Select-Object @{N='Computer';E={$_.ClientComputerName}},@{N='Benutzer';E={$_.ClientUserName}},@{N='Offene Dateien';E={$_.NumOpens}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'smbopenfiles', func: 'Offene Netzwerkdateien', when: 'Gesperrte finden',
          buildCmd: (h) => remote(h, `Get-SmbOpenFile | Select-Object @{N='ID';E={$_.FileId}},@{N='Computer';E={$_.ClientComputerName}},@{N='Benutzer';E={$_.ClientUserName}},@{N='Datei';E={$_.Path}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'closesmb', func: 'Netzwerkdatei schließen', when: 'Sperre freigeben',
          buildCmd: (h, i) => remote(h, `Close-SmbOpenFile -FileId ${i} -Force -EA Stop; Write-Output "Datei geschlossen: ID ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'File-ID (aus "Offene Dateien")' } },
        { id: 'netuse', func: 'Gemappte Laufwerke', when: 'Netzlaufwerke',
          buildCmd: (h) => remote(h, `$maps=@(Get-SmbMapping -EA SilentlyContinue); if ($maps) { $maps | Select-Object LocalPath,RemotePath,Status | ConvertTo-Json -Compress } else { Write-Output '"(Keine gemappten Laufwerke)"' }`), action: 'read' },
      ],
    },
    // ── 14: Geplante Aufgaben ────────────────────────────────────────────────
    {
      id: 'tasks', label: 'Geplante Aufgaben',
      commands: [
        { id: 'tasksall', func: 'Alle Tasks', when: 'Überblick',
          buildCmd: (h) => remote(h, `Get-ScheduledTask | Select-Object @{N='Aufgabe';E={$_.TaskName}},@{N='Pfad';E={$_.TaskPath}},@{N='Status';E={$_.State.ToString()}} | Sort-Object Aufgabe | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'tasksrun', func: 'Laufende Tasks', when: 'Was läuft gerade?',
          buildCmd: (h) => remote(h, `$t=@(Get-ScheduledTask | Where-Object {$_.State -eq 'Running'}); if($t){$t | Select-Object @{N='Aufgabe';E={$_.TaskName}},@{N='Pfad';E={$_.TaskPath}} | ConvertTo-Json -Compress}else{Write-Output '"Keine Tasks laufen gerade"'}`), action: 'read' },
        { id: 'taskstart', func: 'Task starten', when: 'Sofort ausführen',
          buildCmd: (h, i) => remote(h, `Start-ScheduledTask -TaskName '${i}' -EA Stop; Write-Output "Task gestartet: ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'Task-Name' } },
        { id: 'taskstop', func: 'Task stoppen', when: 'Hängenden beenden',
          buildCmd: (h, i) => remote(h, `Stop-ScheduledTask -TaskName '${i}' -EA Stop; Write-Output "Task gestoppt: ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'Task-Name' } },
        { id: 'taskdisable', func: 'Task deaktivieren', when: 'Ausschalten',
          buildCmd: (h, i) => remote(h, `Disable-ScheduledTask -TaskName '${i}' -EA Stop; Write-Output "Task deaktiviert: ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'Task-Name' } },
      ],
    },
    // ── 15: Remote Desktop & Fernzugriff ────────────────────────────────────
    {
      id: 'rdp', label: 'Remote Desktop & Fernzugriff',
      commands: [
        { id: 'rdpopen', func: 'RDP-Verbindung öffnen', when: 'Remote aufschalten',
          buildCmd: (h) => `Start-Process mstsc.exe -ArgumentList '/v:${h}'; Write-Output 'RDP-Verbindung zu ${h} wird geoeffnet...'`, action: 'read', local: true },
        { id: 'rdpenable', func: 'RDP aktivieren', when: 'Remote Desktop einschalten',
          buildCmd: (h) => remote(h, `Set-ItemProperty -Path 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server' -Name fDenyTSConnections -Value 0 -EA Stop; Enable-NetFirewallRule -DisplayGroup 'Remote Desktop' -EA SilentlyContinue; Write-Output "RDP aktiviert"`), action: 'write' },
        { id: 'rdpfw', func: 'RDP Firewall freigeben', when: 'RDP erlauben',
          buildCmd: (h) => remote(h, `Enable-NetFirewallRule -DisplayGroup 'Remote Desktop' -EA Stop; Write-Output "RDP-Firewall-Regeln aktiviert"`), action: 'write' },
        { id: 'msra', func: 'Remote-Unterstützung', when: 'Helfen ohne Abmeldung',
          buildCmd: (h) => `Start-Process msra.exe -ArgumentList '/offerRA','${h}'; Write-Output 'Remote-Unterstuetzung fuer ${h} wird geoeffnet...'`, action: 'read', local: true },
      ],
    },
    // ── 16: Zertifikate ──────────────────────────────────────────────────────
    {
      id: 'certs', label: 'Zertifikate',
      commands: [
        { id: 'compcerts', func: 'Computer-Zertifikate', when: 'VPN/WLAN-Probleme',
          buildCmd: (h) => remote(h, `Get-ChildItem Cert:\\LocalMachine\\My | Select-Object @{N='Betreff';E={$_.Subject}},@{N='Gültig bis';E={$_.NotAfter.ToString('dd.MM.yyyy')}},@{N='Aussteller';E={$_.Issuer.Split(',')[0]}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'usercerts', func: 'Benutzer-Zertifikate', when: 'Smartcard, E-Mail',
          buildCmd: (h) => remote(h, `Get-ChildItem Cert:\\CurrentUser\\My | Select-Object @{N='Betreff';E={$_.Subject}},@{N='Gültig bis';E={$_.NotAfter.ToString('dd.MM.yyyy')}},@{N='Aussteller';E={$_.Issuer.Split(',')[0]}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'certenroll', func: 'Auto-Enrollment triggern', when: 'Zertifikate abholen',
          buildCmd: (h) => remote(h, `certutil -pulse 2>&1; Write-Output "Enrollment ausgelöst"`), action: 'write' },
        { id: 'certexpiry', func: 'Bald ablaufende Zertifikate', when: 'Proaktiv erkennen',
          buildCmd: (h) => remote(h, `$d=(Get-Date).AddDays(30); Get-ChildItem Cert:\\LocalMachine\\My | Where-Object {$_.NotAfter -lt $d} | Select-Object Subject,NotAfter,Thumbprint | ConvertTo-Json -Compress`), action: 'read' },
      ],
    },
    // ── 17: DNS & Domäne ─────────────────────────────────────────────────────
    {
      id: 'domain', label: 'DNS & Domäne',
      commands: [
        { id: 'dclist', func: 'Domain Controller anzeigen', when: 'DC-Zuordnung',
          buildCmd: (h) => remote(h, `nltest /dsgetdc:$env:USERDNSDOMAIN 2>&1`), action: 'read' },
        { id: 'scquery', func: 'Secure Channel Status', when: 'Domain-Trust',
          buildCmd: (h) => remote(h, `nltest /sc_query:$env:USERDNSDOMAIN 2>&1`), action: 'read' },
        { id: 'testsc', func: 'Vertrauensstellung testen', when: 'Fehler beheben',
          buildCmd: (h) => remote(h, `$r=Test-ComputerSecureChannel -Verbose 2>&1; Write-Output $r`), action: 'read' },
        { id: 'resetpwd', func: 'Computer-Passwort reset', when: 'Trust reparieren',
          buildCmd: (h) => remote(h, `Reset-ComputerMachinePassword -EA Stop; Write-Output "Computer-Passwort zurückgesetzt"`), action: 'critical' },
        { id: 'aadstatus', func: 'Azure AD Status', when: 'AAD-Join prüfen',
          buildCmd: (h) => remote(h, `dsregcmd /status 2>&1`), action: 'read' },
        { id: 'aadleave', func: 'Azure AD / Hybrid Join trennen (dsregcmd /leave)', when: 'Registrierungsfehler beheben — PC aus Azure AD abmelden. WICHTIG: Danach Neustart erforderlich!',
          buildCmd: (h) => remote(h, [
            `$status = dsregcmd /status 2>&1`,
            `$joined = ($status | Select-String 'AzureAdJoined\\s*:\\s*YES') -ne $null`,
            `if (-not $joined) {`,
            `  @{Info='PC ist nicht Azure AD joined — kein /leave noetig';Hinweis='Falls weiterhin Registrierungsfehler: Computer-Passwort reset oder Domaene neu beitreten'} | ConvertTo-Json -Compress`,
            `} else {`,
            `  $r = dsregcmd /leave 2>&1`,
            `  @{Ergebnis='dsregcmd /leave ausgefuehrt';Ausgabe=($r -join ' | ');Wichtig='PC muss jetzt NEU GESTARTET werden damit die Aenderung wirksam wird!';Hinweis='Nach dem Neustart tritt der PC automatisch wieder dem Azure AD bei (Hybrid Join)'} | ConvertTo-Json -Compress`,
            `}`,
          ].join('\n')), action: 'critical' },
        { id: 'klist', func: 'Kerberos-Tickets anzeigen', when: 'Auth-Probleme',
          buildCmd: (h) => remote(h, `klist 2>&1`), action: 'read' },
        { id: 'kpurge', func: 'Kerberos-Tickets löschen', when: 'Nach Gruppenänderung',
          buildCmd: (h) => remote(h, `klist purge 2>&1; Write-Output "Kerberos-Tickets gelöscht"`), action: 'write' },
      ],
    },
    // ── 18: WLAN & Netzwerkprofile ───────────────────────────────────────────
    {
      id: 'wlan', label: 'WLAN & Netzwerkprofile',
      commands: [
        { id: 'wlanprofiles', func: 'WLAN-Profile anzeigen', when: 'Diagnostizieren',
          buildCmd: (h) => remote(h, `$out = netsh wlan show profiles 2>&1; $names = $out | Select-String 'Alle Benutzerprofile|All User Profile' | ForEach-Object { ($_ -split ':',2)[1].Trim() }; if ($names) { $names | ForEach-Object { [PSCustomObject]@{Profil=$_} } | ConvertTo-Json -Compress } else { Write-Output ($out -join '\n') }`), action: 'read' },
        { id: 'wlanstatus', func: 'WLAN-Status', when: 'Signal, Netzwerk',
          buildCmd: (h) => remote(h, `$wlan=@(Get-NetAdapter | Where-Object {$_.PhysicalMediaType -match '802.11'}); if ($wlan) { $wlan | Select-Object Name,Status,LinkSpeed,MacAddress | ConvertTo-Json -Compress } else { Write-Output '"Kein WLAN-Adapter gefunden"' }`), action: 'read' },
        { id: 'wlandardel', func: 'WLAN-Profil löschen', when: 'Falsches entfernen',
          buildCmd: (h, i) => remote(h, `netsh wlan delete profile name='${i}' 2>&1`),
          action: 'write', input: { type: 'text', placeholder: 'WLAN-Profilname' } },
        { id: 'wlanpwd', func: 'WLAN-Passwort anzeigen', when: 'Auslesen (Admin)',
          buildCmd: (h, i) => remote(h, `netsh wlan show profile name='${i}' key=clear 2>&1`),
          action: 'read', input: { type: 'text', placeholder: 'WLAN-Profilname' } },
      ],
    },
    // ── 19: Explorer & Shell ─────────────────────────────────────────────────
    {
      id: 'explorer', label: 'Explorer & Shell',
      commands: [
        { id: 'explorerrestart', func: 'Explorer neustarten', when: 'Taskleiste hängt',
          buildCmd: (h) => remote(h, `Stop-Process -Name explorer -Force -EA SilentlyContinue; Start-Sleep 1; Start-Process explorer; Write-Output "Explorer neugestartet"`), action: 'write' },
        { id: 'iconcache', func: 'Icon-Cache erneuern', when: 'Falsche Icons',
          buildCmd: (h) => remote(h, `ie4uinit -show; Write-Output "Icon-Cache erneuert"`), action: 'write' },
        { id: 'iconcachedel', func: 'Icon-Cache löschen', when: 'Beschädigte Icons',
          buildCmd: (h) => remote(h, `Stop-Process -Name explorer -Force -EA SilentlyContinue; Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\iconcache*" -Force -EA SilentlyContinue; Start-Process explorer; Write-Output "Icon-Cache gelöscht und Explorer neugestartet"`), action: 'write' },
      ],
    },
    // ── 21: Screenshot ───────────────────────────────────────────────────────
    {
      id: 'screenshot', label: 'Screenshot (Datenschutz)',
      commands: [
        { id: 'screencap', func: 'Remote-Screenshot aufnehmen', when: 'Bildschirm des Benutzers anzeigen',
          // Session-0 fix: WinRM runs in Session 0 (no desktop). Solution:
          // 1. Write PS script via UNC admin share (C$\Temp)
          // 2. Register Scheduled Task in logged-on user context via WinRM (LogonType Interactive)
          // 3. Wait, read PNG back via UNC, return as structured JSON {success,image,error}
          buildCmd: (h) => {
            const hSafe = h.replace(/'/g, "''")
            return [
              `$hostname = '${hSafe}'`,
              `$result = @{ success = $false; image = ''; error = '' }`,
              `try {`,
              `  $tempPath = "\\\\$hostname\\C$\\Temp"`,
              `  if (-not (Test-Path $tempPath)) { New-Item -Path $tempPath -ItemType Directory -Force | Out-Null }`,
              ...getUserDetectionPS(hSafe, '$loggedOnUser').map(l => `  ${l}`),
              `  $script = @'`,
              `Add-Type -AssemblyName System.Windows.Forms`,
              `Add-Type -AssemblyName System.Drawing`,
              `try {`,
              `    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds`,
              `    $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)`,
              `    $g = [System.Drawing.Graphics]::FromImage($bmp)`,
              `    $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)`,
              `    $g.Dispose()`,
              `    $bmp.Save('C:\\Temp\\itadmin_screenshot.png', [System.Drawing.Imaging.ImageFormat]::Png)`,
              `    $bmp.Dispose()`,
              `} catch { $_ | Out-File 'C:\\Temp\\itadmin_screenshot_error.txt' }`,
              `'@`,
              `  Set-Content -Path "$tempPath\\screenshot_task.ps1" -Value $script -Force -Encoding UTF8`,
              `  Invoke-Command -ComputerName $hostname -ScriptBlock {`,
              `    param($user)`,
              `    Unregister-ScheduledTask -TaskName 'ITAdminScreenshot' -Confirm:$false -EA SilentlyContinue`,
              `    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-WindowStyle Hidden -ExecutionPolicy Bypass -File C:\\Temp\\screenshot_task.ps1'`,
              `    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest`,
              `    Register-ScheduledTask -TaskName 'ITAdminScreenshot' -Action $action -Principal $principal -Force | Out-Null`,
              `    Start-ScheduledTask -TaskName 'ITAdminScreenshot'`,
              `  } -ArgumentList $loggedOnUser`,
              `  Start-Sleep -Seconds 5`,
              `  $imgPath = "$tempPath\\itadmin_screenshot.png"`,
              `  if (Test-Path $imgPath) {`,
              `    $bytes = [System.IO.File]::ReadAllBytes($imgPath)`,
              `    $result.success = $true`,
              `    $result.image = [Convert]::ToBase64String($bytes)`,
              `  } else {`,
              `    $errPath = "$tempPath\\itadmin_screenshot_error.txt"`,
              `    if (Test-Path $errPath) { $result.error = Get-Content $errPath -Raw }`,
              `    else { $result.error = 'Screenshot nicht erstellt – Task wurde moeglicherweise nicht ausgefuehrt' }`,
              `  }`,
              `  Remove-Item "$tempPath\\itadmin_screenshot.png" -Force -EA SilentlyContinue`,
              `  Remove-Item "$tempPath\\screenshot_task.ps1" -Force -EA SilentlyContinue`,
              `  Remove-Item "$tempPath\\itadmin_screenshot_error.txt" -Force -EA SilentlyContinue`,
              `  Invoke-Command -ComputerName $hostname -ScriptBlock { Unregister-ScheduledTask -TaskName 'ITAdminScreenshot' -Confirm:$false -EA SilentlyContinue }`,
              `} catch { $result.error = $_.Exception.Message }`,
              `$result | ConvertTo-Json -Compress`,
            ].join('\n')
          },
          action: 'read', local: true, privacyConsent: true, longRunning: true },
      ],
    },
    // ── 22: Software installieren ─────────────────────────────────────────────
    {
      id: 'swinstall', label: 'Software installieren',
      commands: [
        { id: 'wingetinstall', func: 'App per Winget installieren', when: 'Software remote installieren',
          buildCmd: (h, i) => remote(h, `winget install --id '${(i??'').replace(/'/g,"''")}' --silent --accept-package-agreements --accept-source-agreements 2>&1`),
          action: 'critical', input: { type: 'text', placeholder: 'Winget Package-ID z.B. Mozilla.Firefox' } },
        { id: 'wingsearch', func: 'Winget Pakete suchen', when: 'Verfügbare Apps finden',
          buildCmd: (h, i) => remote(h, `winget search '${(i??'').replace(/'/g,"''")}' 2>&1`),
          action: 'read', input: { type: 'text', placeholder: 'Suchbegriff z.B. Firefox' } },
        { id: 'fileinstall', func: 'Setup-Datei remote installieren', when: 'MSI/EXE von Datei',
          buildCmd: (h, i) => {
            if (!i) return `Write-Output "ERR:Keine Datei ausgewählt"`
            const src = i.replace(/'/g, "''")
            const fname = src.split('\\').pop() ?? 'setup'
            const ext   = fname.split('.').pop()?.toLowerCase() ?? ''
            const dst   = `C:\\Temp\\${fname}`.replace(/'/g, "''")
            const run   = ext === 'msi'
              ? `Start-Process msiexec -ArgumentList '/i','${dst}','/quiet','/norestart' -Wait`
              : `Start-Process '${dst}' -ArgumentList '/S','/silent','/quiet' -Wait`
            return local([
              `$src='${src}'; $h='${h.replace(/'/g,"''")}'; $dst="\\\\$h\\C$\\Temp"`,
              `New-Item -ItemType Directory -Path $dst -EA SilentlyContinue | Out-Null`,
              `Copy-Item $src "$dst\\${fname}"`,
              `Invoke-Command -ComputerName $h -ScriptBlock { ${run}; Write-Output 'Fertig' } -EA Stop`,
            ].join('; '))
          },
          action: 'critical', fileAction: 'install' },
      ],
    },
    // ── 23: Dateiübertragung ──────────────────────────────────────────────────
    {
      id: 'filetransfer', label: 'Dateiübertragung',
      commands: [
        { id: 'copyfiles', func: 'Dateien zum Remote-PC übertragen', when: 'Dateien remote kopieren',
          buildCmd: (h, i) => {
            if (!i) return `Write-Output "ERR:Keine Dateien ausgewählt"`
            const pairs = i.split('|').filter(Boolean)
            const copyLines = pairs.map(src => {
              const s = src.replace(/'/g, "''")
              const fname = s.split('\\').pop() ?? 'file'
              return `Copy-Item -Path '${s}' -Destination "\\\\${h}\\C$\\Temp\\${fname}" -Force`
            })
            return local([
              `New-Item -ItemType Directory -Path "\\\\${h}\\C$\\Temp" -EA SilentlyContinue | Out-Null`,
              ...copyLines,
              `Write-Output "${pairs.length} Datei(en) erfolgreich kopiert nach \\\\${h}\\C$\\Temp"`,
            ].join('; '))
          },
          action: 'write', fileAction: 'transfer' },
        { id: 'opentemp', func: 'Temp-Ordner auf Remote-PC öffnen', when: 'Übertragene Dateien prüfen',
          buildCmd: (h) => local(`Start-Process explorer "\\\\${h}\\C$\\Temp"; Write-Output "Explorer geöffnet: \\\\${h}\\C$\\Temp"`),
          action: 'read', local: true },
      ],
    },
    // ── 24: Laufwerk-Mapping ──────────────────────────────────────────────────
    {
      id: 'drivemap', label: 'Laufwerk-Mapping',
      commands: [
        { id: 'mapdriveadd', func: 'Netzlaufwerk verbinden', when: 'Laufwerk für angemeldeten Benutzer mappen',
          buildCmd: (h, i) => {
            const parts  = (i ?? '').split('|')
            const letter = (parts[0] ?? 'Z').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1) || 'Z'
            let unc = (parts[1] ?? '').trim()
            if (unc && !unc.startsWith('\\\\')) unc = '\\\\' + unc.replace(/^\\+/, '')
            const hSafe  = h.replace(/'/g, "''")
            // Use ScheduledTask trick to run in the logged-on user's session
            return [
              `try {`,
              ...getUserDetectionPS(hSafe).map(l => `  ${l}`),
              `  $cmd = "net use ${letter}: ""${unc}"" /persistent:yes"`,
              `  Invoke-Command -ComputerName '${hSafe}' -ScriptBlock {`,
              `    param($drv, $path, $usr)`,
              `    # Ergebnis-Datei für Verifizierung im User-Kontext`,
              `    $resultFile = "C:\\Temp\\it_map_result.txt"`,
              `    if (-not (Test-Path 'C:\\Temp')) { New-Item -Path 'C:\\Temp' -ItemType Directory -Force | Out-Null }`,
              `    Remove-Item $resultFile -Force -EA SilentlyContinue`,
              `    $script = "net use $($drv): ""$path"" /persistent:yes > C:\\Temp\\it_map_result.txt 2>&1"`,
              `    $action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c $script"`,
              `    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2)`,
              `    Register-ScheduledTask -TaskName 'IT_MapDrive' -Action $action -Trigger $trigger -User $usr -Force | Out-Null`,
              `    Start-ScheduledTask -TaskName 'IT_MapDrive'`,
              `    Start-Sleep -Seconds 4`,
              `    Unregister-ScheduledTask -TaskName 'IT_MapDrive' -Confirm:$false -EA SilentlyContinue`,
              `    # Ergebnis aus der Datei lesen (wurde im User-Kontext geschrieben)`,
              `    $output = if (Test-Path $resultFile) { (Get-Content $resultFile -Raw -EA SilentlyContinue).Trim() } else { '' }`,
              `    Remove-Item $resultFile -Force -EA SilentlyContinue`,
              `    if ($output -match 'erfolgreich|successfully|command completed') {`,
              `      @{Ergebnis='Erfolgreich';Laufwerk="$($drv):";Pfad=$path;Details=$output} | ConvertTo-Json -Compress`,
              `    } elseif ($output -match 'Systemfehler|error|Fehler') {`,
              `      Write-Output "ERR:Laufwerk $($drv): konnte nicht verbunden werden. $output"`,
              `    } else {`,
              `      @{Ergebnis='Befehl ausgefuehrt';Laufwerk="$($drv):";Pfad=$path;Details=if($output){$output}else{'Keine Rueckmeldung - bitte manuell pruefen'}} | ConvertTo-Json -Compress`,
              `    }`,
              `  } -ArgumentList '${letter}','${unc}',$user -EA Stop`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n')
          },
          action: 'write',
          input: { type: 'drivemap' },
        },
        { id: 'mapdriverem', func: 'Netzlaufwerk trennen', when: 'Laufwerk-Verbindung entfernen',
          buildCmd: (h, i) => {
            const letter = (i ?? 'Z').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1) || 'Z'
            const hSafe  = h.replace(/'/g, "''")
            return [
              `try {`,
              ...getUserDetectionPS(hSafe).map(l => `  ${l}`),
              `  Invoke-Command -ComputerName '${hSafe}' -ScriptBlock {`,
              `    param($drv, $usr)`,
              `    # Ergebnis-Datei für Verifizierung im User-Kontext`,
              `    $resultFile = "C:\\Temp\\it_unmap_result.txt"`,
              `    if (-not (Test-Path 'C:\\Temp')) { New-Item -Path 'C:\\Temp' -ItemType Directory -Force | Out-Null }`,
              `    Remove-Item $resultFile -Force -EA SilentlyContinue`,
              `    $script = "net use $($drv): /delete /yes > C:\\Temp\\it_unmap_result.txt 2>&1"`,
              `    $action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c $script"`,
              `    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2)`,
              `    Register-ScheduledTask -TaskName 'IT_UnmapDrive' -Action $action -Trigger $trigger -User $usr -Force | Out-Null`,
              `    Start-ScheduledTask -TaskName 'IT_UnmapDrive'`,
              `    Start-Sleep -Seconds 4`,
              `    Unregister-ScheduledTask -TaskName 'IT_UnmapDrive' -Confirm:$false -EA SilentlyContinue`,
              `    # Ergebnis aus der Datei lesen (wurde im User-Kontext geschrieben)`,
              `    $output = if (Test-Path $resultFile) { (Get-Content $resultFile -Raw -EA SilentlyContinue).Trim() } else { '' }`,
              `    Remove-Item $resultFile -Force -EA SilentlyContinue`,
              `    if ($output -match 'erfolgreich|successfully|command completed') {`,
              `      @{Ergebnis='Erfolgreich';Laufwerk="$($drv):";Aktion='Getrennt';Details=$output} | ConvertTo-Json -Compress`,
              `    } elseif ($output -match 'Netzwerkverbindung wurde nicht gefunden|not found|could not be found') {`,
              `      @{Ergebnis='Laufwerk war nicht verbunden';Laufwerk="$($drv):";Details=$output} | ConvertTo-Json -Compress`,
              `    } else {`,
              `      @{Ergebnis='Befehl ausgefuehrt';Laufwerk="$($drv):";Details=if($output){$output}else{'Keine Rueckmeldung - bitte manuell pruefen'}} | ConvertTo-Json -Compress`,
              `    }`,
              `  } -ArgumentList '${letter}',$user -EA Stop`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n')
          },
          action: 'write',
          input: { type: 'text', placeholder: 'Nur den Buchstaben eingeben, z.B. Z' },
          templates: [
            { label: 'H:', value: 'H' }, { label: 'I:', value: 'I' },
            { label: 'S:', value: 'S' }, { label: 'T:', value: 'T' },
            { label: 'U:', value: 'U' }, { label: 'Z:', value: 'Z' },
          ],
        },
        { id: 'mapdrivelist', func: 'Verbundene Laufwerke anzeigen', when: 'Welche Laufwerke sind gemappt?',
          buildCmd: (h) => {
            const hSafe = h.replace(/'/g, "''")
            return [
              `try {`,
              ...getUserDetectionPS(hSafe).map(l => `  ${l}`),
              `  Invoke-Command -ComputerName '${hSafe}' -ScriptBlock {`,
              `    param($usr)`,
              `    $resultFile = 'C:\\Temp\\it_drivelist.txt'`,
              `    if (-not (Test-Path 'C:\\Temp')) { New-Item -Path 'C:\\Temp' -ItemType Directory -Force | Out-Null }`,
              `    Remove-Item $resultFile -Force -EA SilentlyContinue`,
              `    $script = 'net use > C:\\Temp\\it_drivelist.txt 2>&1'`,
              `    $action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c $script"`,
              `    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2)`,
              `    Register-ScheduledTask -TaskName 'IT_DriveList' -Action $action -Trigger $trigger -User $usr -Force | Out-Null`,
              `    Start-ScheduledTask -TaskName 'IT_DriveList'`,
              `    Start-Sleep -Seconds 3`,
              `    Unregister-ScheduledTask -TaskName 'IT_DriveList' -Confirm:$false -EA SilentlyContinue`,
              `    if (-not (Test-Path $resultFile)) { Write-Output '"Keine Netzlaufwerke verbunden"'; return }`,
              `    $raw = Get-Content $resultFile -Encoding Default -EA SilentlyContinue`,
              `    Remove-Item $resultFile -Force -EA SilentlyContinue`,
              `    $results = @()`,
              `    foreach ($line in $raw) {`,
              `      if ($line -match '^\\s*(OK|Nicht\\s+verf|Unavailable|Disconnected|Getrennt)?\\s+([A-Z]:)\\s+(\\\\\\\\\\S+)') {`,
              `        $results += @{Laufwerk=$Matches[2];Netzwerkpfad=$Matches[3];Status=if($Matches[1]){"$($Matches[1])".Trim()}else{'OK'};Benutzer=$usr}`,
              `      }`,
              `    }`,
              `    if ($results.Count -eq 0) { Write-Output '"Keine Netzlaufwerke verbunden"'; return }`,
              `    $results | ConvertTo-Json -Compress`,
              `  } -ArgumentList $user -EA Stop`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n')
          },
          action: 'read' },
      ],
    },
    // ── 25: Treiber & Hardware ────────────────────────────────────────────────
    {
      id: 'drivers', label: 'Treiber & Hardware',
      commands: [
        { id: 'driverlist', func: 'Alle Treiber anzeigen', when: 'Treiberübersicht',
          buildCmd: (h) => remote(h, `Get-WindowsDriver -Online -EA SilentlyContinue | Select-Object ProviderName,Driver,Version,Date | Sort-Object ProviderName | ConvertTo-Json -Compress`),
          action: 'read' },
        { id: 'driverfail', func: 'Fehlerhafte Treiber', when: 'Probleme finden',
          buildCmd: (h) => remote(h, `Get-WmiObject Win32_PnPEntity | Where-Object {$_.ConfigManagerErrorCode -ne 0} | Select-Object Name,ConfigManagerErrorCode,DeviceID | ConvertTo-Json -Compress`),
          action: 'read' },
        { id: 'driverupdate', func: 'Treiber über Windows Update suchen', when: 'Treiber-Updates',
          buildCmd: (h) => remote(h, `$s=New-Object -ComObject Microsoft.Update.Session; $sc=$s.CreateUpdateSearcher(); $r=$sc.Search("IsInstalled=0 and Type='Driver'"); $r.Updates | ForEach-Object { "$($_.Title): $($_.Description)" } | ConvertTo-Json -Compress`),
          action: 'read', longRunning: true },
        { id: 'driverupdateall', func: 'Alle Treiber-Updates installieren', when: 'Verfügbare Treiber-Updates suchen und automatisch installieren',
          buildCmd: (h) => {
            const hSafe = h.replace(/'/g, "''")
            return [
              `try {`,
              `  Invoke-Command -ComputerName '${hSafe}' -ScriptBlock {`,
              `    $session = New-Object -ComObject Microsoft.Update.Session`,
              `    $searcher = $session.CreateUpdateSearcher()`,
              `    Write-Host 'Suche nach Treiber-Updates...'`,
              `    $result = $searcher.Search("IsInstalled=0 and Type='Driver'")`,
              `    if ($result.Updates.Count -eq 0) {`,
              `      @{Ergebnis='Keine Treiber-Updates verfuegbar';Info='Alle Treiber sind aktuell.'} | ConvertTo-Json -Compress`,
              `      return`,
              `    }`,
              `    $updates = New-Object -ComObject Microsoft.Update.UpdateColl`,
              `    $list = @()`,
              `    foreach ($u in $result.Updates) {`,
              `      $updates.Add($u) | Out-Null`,
              `      $list += @{Treiber=$u.Title;Groesse="$([math]::Round($u.MaxDownloadSize/1MB,1)) MB"}`,
              `    }`,
              `    # Download`,
              `    $dl = $session.CreateUpdateDownloader()`,
              `    $dl.Updates = $updates`,
              `    Write-Host "Lade $($updates.Count) Treiber-Update(s) herunter..."`,
              `    $dlResult = $dl.Download()`,
              `    # Install`,
              `    $inst = $session.CreateUpdateInstaller()`,
              `    $inst.Updates = $updates`,
              `    Write-Host "Installiere $($updates.Count) Treiber-Update(s)..."`,
              `    $instResult = $inst.Install()`,
              `    $details = @()`,
              `    for ($i = 0; $i -lt $updates.Count; $i++) {`,
              `      $code = $instResult.GetUpdateResult($i).ResultCode`,
              `      $status = switch($code) { 2{'Erfolgreich'} 3{'Erfolgreich (Neustart noetig)'} 4{'Fehlgeschlagen'} 5{'Abgebrochen'} default{"Code: $code"} }`,
              `      $details += @{Treiber=$updates.Item($i).Title;Status=$status}`,
              `    }`,
              `    $reboot = if($instResult.RebootRequired){'Ja - bitte PC neustarten'}else{'Nein'}`,
              `    @{Ergebnis='Treiber-Update abgeschlossen';'Anzahl Updates'=$updates.Count;'Neustart erforderlich'=$reboot;Details=$details} | ConvertTo-Json -Compress -Depth 3`,
              `  } -EA Stop`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n')
          },
          action: 'write', longRunning: true },
        { id: 'driverinf', func: 'Treiber-INF remote installieren', when: 'Manueller Treiber-Import',
          buildCmd: (h, i) => {
            if (!i) return `Write-Output "ERR:Keine INF-Datei ausgewählt"`
            const src = i.replace(/'/g, "''")
            const fname = src.split('\\').pop() ?? 'driver.inf'
            return local([
              `$h='${h.replace(/'/g,"''")}'; $dst="\\\\$h\\C$\\Temp"`,
              `New-Item -ItemType Directory -Path $dst -EA SilentlyContinue | Out-Null`,
              `Copy-Item '${src}' "$dst\\${fname}"`,
              `Invoke-Command -ComputerName $h -ScriptBlock { pnputil /add-driver "C:\\Temp\\${fname}" /install 2>&1 } -EA Stop`,
            ].join('; '))
          },
          action: 'critical', fileAction: 'install' },
      ],
    },
    // ── 20: Energie & Wake-on-LAN ────────────────────────────────────────────
    {
      id: 'power', label: 'Energie & Wake-on-LAN',
      commands: [
        { id: 'batreport', func: 'Akku-Bericht (Laptop)', when: 'Akku-Gesundheit',
          buildCmd: (h) => remote(h, `powercfg /batteryreport /output C:\\temp\\battery.html; Write-Output "Bericht: C:\\temp\\battery.html"`), action: 'read', longRunning: true },
        { id: 'powerenergy', func: 'Energie-Diagnose', when: 'Nicht in Standby',
          buildCmd: (h) => remote(h, `powercfg /energy /duration 10 /output C:\\temp\\energy.html 2>&1; Write-Output "Bericht: C:\\temp\\energy.html"`), action: 'read', longRunning: true },
        { id: 'sleepstudy', func: 'Standby-Analyse', when: 'Wacht ständig auf',
          buildCmd: (h) => remote(h, `powercfg /sleepstudy /output C:\\temp\\sleepstudy.html 2>&1; Write-Output "Bericht: C:\\temp\\sleepstudy.html"`), action: 'read' },
        { id: 'lastwake', func: 'Was hat PC aufgeweckt?', when: 'Ungewolltes Aufwachen',
          buildCmd: (h) => remote(h, `powercfg /lastwake 2>&1`), action: 'read' },
        { id: 'requests', func: 'Was verhindert Standby?', when: 'Schläft nicht ein',
          buildCmd: (h) => remote(h, `powercfg /requests 2>&1`), action: 'read' },
        { id: 'wol', func: 'Wake-on-LAN', when: 'PC remote einschalten',
          buildCmd: (_h, i) => {
            const mac = (i || '').replace(/[:-]/g, '').toUpperCase()
            if (mac.length !== 12) return `Write-Output "ERR:Ungültige MAC-Adresse"`
            const payload = 'FF'.repeat(6) + mac.repeat(16)
            const bytes = payload.match(/.{2}/g)!.map(b => `0x${b}`).join(',')
            return local(`$mac='${i}'; $bytes=[byte[]](${bytes}); $udp=New-Object System.Net.Sockets.UdpClient; $udp.Connect([System.Net.IPAddress]::Broadcast,9); $udp.Send($bytes,$bytes.Length) | Out-Null; $udp.Close(); Write-Output "Wake-on-LAN Magic Packet gesendet an $mac"`)
          }, action: 'write', input: { type: 'text', placeholder: 'MAC-Adresse z.B. AA:BB:CC:DD:EE:FF' } },
      ],
    },
    // ══════════════════════════════════════════════════════════════════════════
    // EREIGNISANZEIGE / EVENT-LOGS — Aufgebaut wie die Windows-Ereignisanzeige
    // ══════════════════════════════════════════════════════════════════════════
    {
      id: 'eventlogs', label: 'Ereignisanzeige / Event-Logs',
      commands: [
        // ── Windows-Protokolle > System ──────────────────────────────────────
        { id: 'log-sys-all', func: 'System — Alle Ereignisse (letzte 50)', when: 'Komplettes System-Protokoll',
          buildCmd: (h) => remote(h, `Get-WinEvent -LogName System -MaxEvents 50 -EA SilentlyContinue | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss')}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='Quelle';E={$_.ProviderName}},@{N='Ereignis-ID';E={$_.Id}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(150,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'log-sys-errors', func: 'System — Nur Fehler (letzte 30)', when: 'Systemfehler finden',
          buildCmd: (h) => remote(h, `Get-WinEvent -FilterHashtable @{LogName='System';Level=2} -MaxEvents 30 -EA SilentlyContinue | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss')}},@{N='Quelle';E={$_.ProviderName}},@{N='ID';E={$_.Id}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(150,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'log-sys-warnings', func: 'System — Nur Warnungen (letzte 30)', when: 'Systemwarnungen prüfen',
          buildCmd: (h) => remote(h, `Get-WinEvent -FilterHashtable @{LogName='System';Level=3} -MaxEvents 30 -EA SilentlyContinue | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss')}},@{N='Quelle';E={$_.ProviderName}},@{N='ID';E={$_.Id}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(150,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'log-sys-critical', func: 'System — Kritische Fehler', when: 'Bluescreens, Systemabstürze',
          buildCmd: (h) => remote(h, `Get-WinEvent -FilterHashtable @{LogName='System';Level=1} -MaxEvents 20 -EA SilentlyContinue | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss')}},@{N='Quelle';E={$_.ProviderName}},@{N='ID';E={$_.Id}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(200,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'log-sys-info', func: 'System — Informationen (letzte 30)', when: 'Dienststarts, Shutdowns, Boots',
          buildCmd: (h) => remote(h, `Get-WinEvent -FilterHashtable @{LogName='System';Level=4} -MaxEvents 30 -EA SilentlyContinue | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss')}},@{N='Quelle';E={$_.ProviderName}},@{N='ID';E={$_.Id}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(150,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress`), action: 'read' },

        // ── Windows-Protokolle > Anwendung ───────────────────────────────────
        { id: 'log-app-all', func: 'Anwendung — Alle Ereignisse (letzte 50)', when: 'App-Protokoll komplett',
          buildCmd: (h) => remote(h, `Get-WinEvent -LogName Application -MaxEvents 50 -EA SilentlyContinue | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss')}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='Quelle';E={$_.ProviderName}},@{N='ID';E={$_.Id}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(150,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'log-app-errors', func: 'Anwendung — Nur Fehler (letzte 30)', when: 'App-Abstürze finden',
          buildCmd: (h) => remote(h, `Get-WinEvent -FilterHashtable @{LogName='Application';Level=2} -MaxEvents 30 -EA SilentlyContinue | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss')}},@{N='Quelle';E={$_.ProviderName}},@{N='ID';E={$_.Id}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(150,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'log-app-warnings', func: 'Anwendung — Nur Warnungen (letzte 30)', when: 'App-Warnungen prüfen',
          buildCmd: (h) => remote(h, `Get-WinEvent -FilterHashtable @{LogName='Application';Level=3} -MaxEvents 30 -EA SilentlyContinue | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss')}},@{N='Quelle';E={$_.ProviderName}},@{N='ID';E={$_.Id}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(150,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress`), action: 'read' },

        // ── Windows-Protokolle > Sicherheit ──────────────────────────────────
        { id: 'log-sec-all', func: 'Sicherheit — Letzte 50 Ereignisse', when: 'Sicherheitsprotokoll',
          buildCmd: (h) => remote(h, `Get-WinEvent -LogName Security -MaxEvents 50 -EA SilentlyContinue | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss')}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='Aufgabe';E={$_.TaskDisplayName}},@{N='ID';E={$_.Id}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(120,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'log-sec-logins', func: 'Sicherheit — Erfolgreiche Anmeldungen', when: 'Wer hat sich angemeldet?',
          buildCmd: (h) => remote(h, `Get-WinEvent -FilterHashtable @{LogName='Security';Id=4624} -MaxEvents 30 -EA SilentlyContinue | ForEach-Object { $x=[xml]$_.ToXml(); @{Zeitpunkt=$_.TimeCreated.ToString('dd.MM.yyyy HH:mm');Benutzer=$x.Event.EventData.Data[5].'#text';Anmeldetyp=$x.Event.EventData.Data[8].'#text';Quelle=$x.Event.EventData.Data[11].'#text'} } | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'log-sec-failed', func: 'Sicherheit — Fehlgeschlagene Anmeldungen', when: 'Brute-Force erkennen',
          buildCmd: (h) => remote(h, `Get-WinEvent -FilterHashtable @{LogName='Security';Id=4625} -MaxEvents 30 -EA SilentlyContinue | ForEach-Object { $x=[xml]$_.ToXml(); @{Zeitpunkt=$_.TimeCreated.ToString('dd.MM.yyyy HH:mm');Benutzer=$x.Event.EventData.Data[5].'#text';Quelle=$x.Event.EventData.Data[13].'#text';Fehlercode=$x.Event.EventData.Data[7].'#text'} } | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'log-sec-lockout', func: 'Sicherheit — Kontosperrungen', when: 'Wer wurde gesperrt?',
          buildCmd: (h) => remote(h, `Get-WinEvent -FilterHashtable @{LogName='Security';Id=4740} -MaxEvents 20 -EA SilentlyContinue | ForEach-Object { $x=[xml]$_.ToXml(); @{Zeitpunkt=$_.TimeCreated.ToString('dd.MM.yyyy HH:mm');Benutzer=$x.Event.EventData.Data[0].'#text';Quelle=$x.Event.EventData.Data[1].'#text'} } | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'log-sec-priv', func: 'Sicherheit — Privilegierte Aktionen', when: 'Admin-Aktionen nachverfolgen',
          buildCmd: (h) => remote(h, `Get-WinEvent -FilterHashtable @{LogName='Security';Id=4672} -MaxEvents 20 -EA SilentlyContinue | ForEach-Object { $x=[xml]$_.ToXml(); @{Zeitpunkt=$_.TimeCreated.ToString('dd.MM.yyyy HH:mm');Benutzer=$x.Event.EventData.Data[1].'#text'} } | ConvertTo-Json -Compress`), action: 'read' },

        // ── Windows-Protokolle > Setup ────────────────────────────────────────
        { id: 'log-setup', func: 'Setup — Update/Installations-Log', when: 'Was wurde installiert?',
          buildCmd: (h) => remote(h, `Get-WinEvent -LogName Setup -MaxEvents 30 -EA SilentlyContinue | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm')}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='Quelle';E={$_.ProviderName}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(150,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress`), action: 'read' },

        // ── Anwendungs- und Dienstprotokolle ─────────────────────────────────
        { id: 'log-ps-operational', func: 'PowerShell — Operational Log', when: 'PowerShell-Aktivität prüfen',
          buildCmd: (h) => remote(h, `$evts = @(Get-WinEvent -LogName 'Microsoft-Windows-PowerShell/Operational' -MaxEvents 30 -EA SilentlyContinue); if($evts.Count -eq 0){@{Info='Kein PowerShell-Log vorhanden';Hinweis='PowerShell-Logging ist moeglicherweise nicht aktiviert.'} | ConvertTo-Json -Compress}else{$evts | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss')}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='ID';E={$_.Id}},@{N='Nachricht';E={$m=($_.Message -split '\\n')[0]; if($m.Length -gt 150){$m.Substring(0,150)+'...'}else{$m}}} | ConvertTo-Json -Compress}`), action: 'read' },
        { id: 'log-ts-operational', func: 'TerminalServices — RDP-Sitzungen', when: 'RDP-Anmeldungen prüfen',
          buildCmd: (h) => remote(h, `$evts = @(Get-WinEvent -LogName 'Microsoft-Windows-TerminalServices-LocalSessionManager/Operational' -MaxEvents 30 -EA SilentlyContinue); if($evts.Count -eq 0){@{Info='Keine RDP-Sitzungen gefunden';Hinweis='Es gab keine Remote-Desktop-Verbindungen in letzter Zeit.'} | ConvertTo-Json -Compress}else{$evts | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm')}},@{N='ID';E={$_.Id}},@{N='Nachricht';E={$m=($_.Message -split '\\n')[0]; if($m.Length -gt 150){$m.Substring(0,150)+'...'}else{$m}}} | ConvertTo-Json -Compress}`), action: 'read' },
        { id: 'log-wlan', func: 'WLAN — Verbindungs-Log', when: 'WLAN-Probleme nachverfolgen',
          buildCmd: (h) => remote(h, `$evts = @(Get-WinEvent -LogName 'Microsoft-Windows-WLAN-AutoConfig/Operational' -MaxEvents 30 -EA SilentlyContinue); if($evts.Count -eq 0){@{Info='Kein WLAN-Log vorhanden';Hinweis='Dieser PC hat moeglicherweise keinen WLAN-Adapter oder war nicht mit WLAN verbunden.'} | ConvertTo-Json -Compress}else{$evts | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm')}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='Nachricht';E={$m=($_.Message -split '\\n')[0]; if($m.Length -gt 150){$m.Substring(0,150)+'...'}else{$m}}} | ConvertTo-Json -Compress}`), action: 'read' },
        { id: 'log-defender', func: 'Windows Defender — Scan/Erkennungen', when: 'Defender-Aktivität',
          buildCmd: (h) => remote(h, `$evts = @(Get-WinEvent -LogName 'Microsoft-Windows-Windows Defender/Operational' -MaxEvents 30 -EA SilentlyContinue); if($evts.Count -eq 0){@{Info='Kein Defender-Log vorhanden';Hinweis='Windows Defender ist moeglicherweise nicht aktiv auf diesem PC.'} | ConvertTo-Json -Compress}else{$evts | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm')}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='ID';E={$_.Id}},@{N='Nachricht';E={$m=($_.Message -split '\\n')[0]; if($m.Length -gt 150){$m.Substring(0,150)+'...'}else{$m}}} | ConvertTo-Json -Compress}`), action: 'read' },
        { id: 'log-bits', func: 'BITS — Hintergrund-Downloads', when: 'Update-Downloads prüfen',
          buildCmd: (h) => remote(h, `$evts = @(Get-WinEvent -LogName 'Microsoft-Windows-Bits-Client/Operational' -MaxEvents 20 -EA SilentlyContinue); if($evts.Count -eq 0){@{Info='Kein BITS-Log vorhanden';Hinweis='Keine Hintergrund-Downloads in letzter Zeit.'} | ConvertTo-Json -Compress}else{$evts | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm')}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='Nachricht';E={$m=($_.Message -split '\\n')[0]; if($m.Length -gt 150){$m.Substring(0,150)+'...'}else{$m}}} | ConvertTo-Json -Compress}`), action: 'read' },
        { id: 'log-ntfs', func: 'NTFS — Dateisystem-Fehler', when: 'Festplattenfehler finden',
          buildCmd: (h) => remote(h, `$evts = @(Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Ntfs','ntfs','Microsoft-Windows-Ntfs'} -MaxEvents 20 -EA SilentlyContinue); if($evts.Count -eq 0){@{Info='Keine NTFS-Fehler gefunden';Hinweis='Dateisystem ist in Ordnung.'} | ConvertTo-Json -Compress}else{$evts | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm')}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(150,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress}`), action: 'read' },

        // ── Spezial-Abfragen ─────────────────────────────────────────────────
        { id: 'log-bsod', func: 'Bluescreen-Historie (BugCheck)', when: 'Alle Bluescreens der letzten Wochen',
          buildCmd: (h) => remote(h, `$evts = @(Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Microsoft-Windows-WER-SystemErrorReporting'} -MaxEvents 20 -EA SilentlyContinue); if($evts.Count -eq 0){$evts = @(Get-WinEvent -FilterHashtable @{LogName='System';Id=1001} -MaxEvents 20 -EA SilentlyContinue | Where-Object {$_.Message -match 'BugCheck|BlueScreen|bugcheck'})}; if($evts.Count -eq 0){@{Info='Keine Bluescreens gefunden';Hinweis='Das ist gut! Auf diesem PC gab es in letzter Zeit keine Abstuerze.'} | ConvertTo-Json -Compress}else{$evts | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm')}},@{N='ID';E={$_.Id}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(200,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress}`), action: 'read' },
        { id: 'log-shutdown', func: 'Shutdown/Neustart-Historie', when: 'Wann wurde der PC heruntergefahren?',
          buildCmd: (h) => remote(h, `$evts = @(Get-WinEvent -FilterHashtable @{LogName='System';Id=6005,6006,6008,6009,1074} -MaxEvents 30 -EA SilentlyContinue); if($evts.Count -eq 0){@{Info='Keine Shutdown-Ereignisse gefunden'} | ConvertTo-Json -Compress}else{$evts | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm')}},@{N='Ereignis-ID';E={$_.Id}},@{N='Bedeutung';E={switch($_.Id){6005{'PC wurde gestartet (Boot)'}6006{'PC wurde heruntergefahren'}6008{'ABSTURZ / Stromausfall (unsauberes Herunterfahren!)'}6009{'Systemstart — OS-Info'}1074{'Geplanter Neustart oder Shutdown durch Benutzer/Programm'}default{'Sonstiges'}}}} | ConvertTo-Json -Compress}`), action: 'read' },
        { id: 'log-driver', func: 'Treiber-Ereignisse', when: 'Treiber-Installationen/Fehler',
          buildCmd: (h) => remote(h, `$evts = @(Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Microsoft-Windows-Kernel-PnP','Microsoft-Windows-DriverFrameworks-UserMode'} -MaxEvents 20 -EA SilentlyContinue); if($evts.Count -eq 0){@{Info='Keine Treiber-Ereignisse gefunden';Hinweis='Kein Treiber wurde kuerzlich installiert oder hat Fehler gemeldet.'} | ConvertTo-Json -Compress}else{$evts | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm')}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(150,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress}`), action: 'read' },
        { id: 'log-disk', func: 'Festplatten-Ereignisse (SMART/Disk)', when: 'Festplattenprobleme erkennen',
          buildCmd: (h) => remote(h, `$evts = @(Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='disk','Ntfs','storahci','stornvme','Microsoft-Windows-StorPort'} -MaxEvents 20 -EA SilentlyContinue); if($evts.Count -eq 0){@{Info='Keine Festplatten-Fehler gefunden';Hinweis='Gut! Keine SMART-Warnungen oder Disk-Fehler in letzter Zeit.'} | ConvertTo-Json -Compress}else{$evts | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm')}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='Quelle';E={$_.ProviderName}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(150,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress}`), action: 'read' },
        { id: 'log-timerange', func: 'Ereignisse nach Zeitraum filtern', when: 'Bestimmten Zeitraum durchsuchen',
          buildCmd: (h, i) => { const hours = parseInt(i || '24') || 24; return remote(h, `$t=(Get-Date).AddHours(-${hours}); Get-WinEvent -FilterHashtable @{LogName='System','Application';Level=1,2,3;StartTime=$t} -MaxEvents 100 -EA SilentlyContinue | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss')}},@{N='Log';E={$_.LogName}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='Quelle';E={$_.ProviderName}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(120,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress`) },
          action: 'read', input: { type: 'text', placeholder: 'Stunden zurück (z.B. 24, 48, 168 für 1 Woche)' } },
        { id: 'log-source', func: 'Ereignisse nach Quelle filtern', when: 'Bestimmte Quelle/Provider durchsuchen',
          buildCmd: (h, i) => remote(h, `Get-WinEvent -FilterHashtable @{LogName='System','Application';ProviderName='${i}'} -MaxEvents 30 -EA SilentlyContinue | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss')}},@{N='Log';E={$_.LogName}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='ID';E={$_.Id}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(150,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress`),
          action: 'read', input: { type: 'text', placeholder: 'Provider z.B. Microsoft-Windows-WER-SystemErrorReporting' } },
        { id: 'log-id', func: 'Ereignisse nach ID filtern', when: 'Bestimmte Event-ID suchen',
          buildCmd: (h, i) => remote(h, `Get-WinEvent -FilterHashtable @{LogName='System','Application','Security';Id=${i || '1074'}} -MaxEvents 30 -EA SilentlyContinue | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss')}},@{N='Log';E={$_.LogName}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='Quelle';E={$_.ProviderName}},@{N='Nachricht';E={($_.Message -split '\\n')[0].Substring(0,[math]::Min(150,($_.Message -split '\\n')[0].Length))}} | ConvertTo-Json -Compress`),
          action: 'read', input: { type: 'text', placeholder: 'Event-ID (z.B. 6008, 4624, 1074)' } },

        // ── Verwaltung ───────────────────────────────────────────────────────
        { id: 'log-list', func: 'Verfügbare Logs auflisten', when: 'Welche Logs gibt es?',
          buildCmd: (h) => remote(h, `$logs = @(Get-WinEvent -ListLog * -EA SilentlyContinue | Where-Object {$_.RecordCount -gt 0} | Sort-Object RecordCount -Descending | Select-Object -First 30 @{N='Protokoll';E={$_.LogName}},@{N='Einträge';E={$_.RecordCount}},@{N='Groesse (KB)';E={[math]::Round($_.FileSize/1KB,0)}},@{N='Modus';E={$_.LogMode}}); if($logs.Count -eq 0){@{Info='Keine Logs gefunden'} | ConvertTo-Json -Compress}else{$logs | ConvertTo-Json -Compress}`), action: 'read' },
        { id: 'log-view', func: 'Event-Log anzeigen (komplett)', when: 'Log direkt im Programm lesen',
          buildCmd: (h, i) => remote(h, `$evts = @(Get-WinEvent -LogName '${i || 'System'}' -MaxEvents 200 -EA SilentlyContinue); if($evts.Count -eq 0){@{Info='Log ist leer oder nicht vorhanden'} | ConvertTo-Json -Compress}else{$evts | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss')}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='ID';E={$_.Id}},@{N='Quelle';E={$_.ProviderName}},@{N='Nachricht';E={$msg=$_.Message; if($msg.Length -gt 200){$msg.Substring(0,200)+'...'}else{$msg}}} | ConvertTo-Json -Compress}`),
          action: 'read', longRunning: true, input: { type: 'dropdown', options: ['System', 'Application', 'Security', 'Setup', 'Microsoft-Windows-PowerShell/Operational', 'Microsoft-Windows-Windows Defender/Operational', 'Microsoft-Windows-TerminalServices-LocalSessionManager/Operational'] } },
        { id: 'log-export', func: 'Event-Log als CSV exportieren (auf DEINEM PC)', when: 'Log als CSV auf deinem Desktop speichern',
          buildCmd: (h, i) => {
            const logName = i || 'System'
            // Runs LOCALLY — fetches events from remote host via Get-WinEvent -ComputerName, saves CSV on admin PC
            return local(`$desktop = [Environment]::GetFolderPath('Desktop'); $csvPath = "$desktop\\EventLog_${logName}_${h}_$(Get-Date -Format yyyyMMdd_HHmm).csv"; try { $events = Get-WinEvent -ComputerName '${h}' -LogName '${logName}' -MaxEvents 500 -EA Stop | Select-Object @{N='Zeitpunkt';E={$_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss')}},@{N='Stufe';E={$_.LevelDisplayName}},@{N='Ereignis-ID';E={$_.Id}},@{N='Quelle';E={$_.ProviderName}},@{N='Nachricht';E={$_.Message}}; $events | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8 -Delimiter ';'; Write-Output "CSV gespeichert: $csvPath ($($events.Count) Eintraege)" } catch { Write-Output "ERR:$($_.Exception.Message)" }`)
          },
          action: 'write', local: true, input: { type: 'dropdown', options: ['System', 'Application', 'Security', 'Setup'] } },
        { id: 'log-clear', func: 'Event-Log leeren', when: 'Log bereinigen nach Analyse',
          buildCmd: (h, i) => remote(h, `wevtutil cl '${i || 'System'}'; Write-Output "Log '${i || 'System'}' wurde geleert"`),
          action: 'critical', input: { type: 'dropdown', options: ['System', 'Application', 'Security', 'Setup'] } },
        { id: 'log-size', func: 'Log-Größen und Einstellungen', when: 'Speicherplatz der Logs',
          buildCmd: (h) => remote(h, `Get-WinEvent -ListLog System,Application,Security,Setup -EA SilentlyContinue | Select-Object @{N='Protokoll';E={$_.LogName}},@{N='Einträge';E={$_.RecordCount}},@{N='Groesse (MB)';E={[math]::Round($_.FileSize/1MB,1)}},@{N='Max (MB)';E={[math]::Round($_.MaximumSizeInBytes/1MB,0)}},@{N='Modus';E={$_.LogMode}} | ConvertTo-Json -Compress`), action: 'read' },
      ],
    },

    // ── 21: Anwendungs-Reparatur & Cache ──────────────────────────────────────
    {
      id: 'appcache', label: 'Anwendungs-Reparatur & Cache',
      commands: [
        { id: 'teamscache', func: 'Teams Cache löschen (MSIX + klassisch)', when: 'Teams langsam/fehlerhaft',
          buildCmd: (h) => remote(h, `Get-Process -Name ms-teams,Teams -EA SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 2; $classic = "$env:APPDATA\\Microsoft\\Teams"; if (Test-Path $classic) { Remove-Item "$classic\\*" -Recurse -Force }; $msix = Get-ChildItem "$env:LOCALAPPDATA\\Packages" -Filter 'MSTeams_*' -Directory -EA SilentlyContinue; if ($msix) { Remove-Item "$($msix.FullName)\\LocalCache\\*" -Recurse -Force }; Write-Output 'Teams Cache gelöscht'`), action: 'write' },
        { id: 'outlookcache', func: 'Outlook Cache/OST umbenennen', when: 'Outlook langsam/Sync-Probleme',
          buildCmd: (h) => remote(h, `$osts = Get-ChildItem "$env:LOCALAPPDATA\\Microsoft\\Outlook\\*.ost" -EA SilentlyContinue; if ($osts) { $osts | ForEach-Object { Rename-Item $_.FullName "$($_.FullName).bak" -Force; Write-Output "Umbenannt: $($_.Name) -> $($_.Name).bak" } } else { Write-Output 'Keine OST-Dateien gefunden' }`), action: 'write' },
        { id: 'outlookrepair', func: 'Outlook Profil reparieren', when: 'Outlook startet nicht/hängt',
          buildCmd: (h, i) => remote(h, `$flag = '${i || '/safe'}'; Start-Process outlook.exe -ArgumentList $flag; Write-Output "Outlook gestartet mit $flag"`),
          action: 'write', input: { type: 'dropdown', options: ['/safe', '/resetnavpane', '/cleanviews', '/cleanreminders', '/resetsearchcriteria'] } },
        { id: 'ondrivereset', func: 'OneDrive Reset', when: 'OneDrive sync-Probleme',
          buildCmd: (h) => remote(h, `Start-Process "$env:LOCALAPPDATA\\Microsoft\\OneDrive\\onedrive.exe" -ArgumentList "/reset"; Write-Output 'OneDrive Reset gestartet'`), action: 'write' },
        { id: 'chromecache', func: 'Chrome Cache löschen', when: 'Chrome langsam/fehlerhaft',
          buildCmd: (h) => remote(h, `Get-Process -Name chrome -EA SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 2; $p = "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Cache"; if (Test-Path $p) { Remove-Item "$p\\*" -Recurse -Force; Write-Output 'Chrome Cache gelöscht' } else { Write-Output 'Cache-Verzeichnis nicht gefunden' }`), action: 'write' },
        { id: 'edgecache', func: 'Edge Cache löschen', when: 'Edge langsam/fehlerhaft',
          buildCmd: (h) => remote(h, `Get-Process -Name msedge -EA SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 2; $p = "$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\Cache"; if (Test-Path $p) { Remove-Item "$p\\*" -Recurse -Force; Write-Output 'Edge Cache gelöscht' } else { Write-Output 'Cache-Verzeichnis nicht gefunden' }`), action: 'write' },
        { id: 'sapcache', func: 'SAP Cache löschen', when: 'SAP GUI Fehler/langsam',
          buildCmd: (h) => remote(h, `$c1 = "$env:APPDATA\\SAP\\Common"; $c2 = "$env:TEMP\\sapgui*"; if (Test-Path $c1) { Remove-Item "$c1\\*" -Recurse -Force }; Remove-Item $c2 -Recurse -Force -EA SilentlyContinue; Write-Output 'SAP Cache gelöscht'`), action: 'write' },
        { id: 'wincachefull', func: 'Windows Komplett-Cache', when: 'Generelle Systemprobleme/Platz',
          buildCmd: (h) => remote(h, `Remove-Item "$env:TEMP\\*" -Recurse -Force -EA SilentlyContinue; Remove-Item "C:\\Windows\\Temp\\*" -Recurse -Force -EA SilentlyContinue; ipconfig /flushdns | Out-Null; ie4uinit.exe -show 2>$null; Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\thumbcache_*.db" -Force -EA SilentlyContinue; Remove-Item "C:\\Windows\\Prefetch\\*" -Force -EA SilentlyContinue; Write-Output 'Windows Komplett-Cache bereinigt (Temp, DNS, Icons, Thumbnails, Prefetch)'`), action: 'write' },
        { id: 'officequick', func: 'Office Schnellreparatur', when: 'Office-Apps fehlerhaft',
          buildCmd: (h) => remote(h, `& "$env:CommonProgramFiles\\Microsoft Shared\\ClickToRun\\OfficeC2RClient.exe" scenario=Repair displaylevel=False; Write-Output 'Office Schnellreparatur gestartet'`), action: 'write', longRunning: true },
        { id: 'officefull', func: 'Office Online-Reparatur', when: 'Schnellreparatur hilft nicht',
          buildCmd: (h) => remote(h, `& "$env:CommonProgramFiles\\Microsoft Shared\\ClickToRun\\OfficeC2RClient.exe" scenario=Repair displaylevel=False forceappshutdown=True; Write-Output 'Office Online-Reparatur gestartet'`), action: 'critical', longRunning: true },
        { id: 'storereset', func: 'Windows Store Reset', when: 'Store-App hängt/Fehler',
          buildCmd: (h) => remote(h, `Start-Process wsreset.exe -Wait; Write-Output 'Windows Store zurückgesetzt'`), action: 'write' },
        { id: 'credclear', func: 'Credential Manager bereinigen', when: 'Auth-Probleme Office/Teams/VPN',
          buildCmd: (h, i) => remote(h, `$filter = '${i || 'Alles'}'; $creds = cmdkey /list 2>&1; if ($filter -eq 'Alles') { $targets = [regex]::Matches($creds, 'Target:\\s*(.+)') | ForEach-Object { $_.Groups[1].Value.Trim() } } else { $targets = [regex]::Matches($creds, 'Target:\\s*(.+)') | ForEach-Object { $_.Groups[1].Value.Trim() } | Where-Object { $_ -match $filter } }; $count = 0; foreach ($t in $targets) { cmdkey /delete:$t 2>&1 | Out-Null; $count++ }; Write-Output "$count Credentials gelöscht (Filter: $filter)"`),
          action: 'critical', input: { type: 'dropdown', options: ['Office', 'Teams', 'SharePoint', 'VPN', 'Alles'] } },
        { id: 'netreset', func: 'Netzwerk Komplett-Reset', when: 'Netzwerk-Totalausfall',
          buildCmd: (h) => remote(h, `ipconfig /flushdns | Out-Null; netsh winsock reset | Out-Null; netsh int ip reset | Out-Null; arp -d * 2>&1 | Out-Null; ipconfig /release | Out-Null; ipconfig /renew | Out-Null; Write-Output 'Netzwerk komplett zurückgesetzt (DNS, Winsock, TCP/IP, ARP, IP erneuert)'`), action: 'critical' },
        { id: 'searchreset', func: 'Windows-Suche Reset', when: 'Suche funktioniert nicht',
          buildCmd: (h) => remote(h, `Stop-Service WSearch -Force -EA SilentlyContinue; Remove-Item "C:\\ProgramData\\Microsoft\\Search\\Data\\Applications\\Windows\\Windows.edb" -Force -EA SilentlyContinue; Start-Service WSearch; Write-Output 'Windows-Suche zurückgesetzt und Dienst neu gestartet'`), action: 'write' },
        { id: 'sfcdism', func: 'SFC + DISM Kombi', when: 'Tiefgreifende System-Reparatur',
          buildCmd: (h) => remote(h, `Write-Output '=== DISM RestoreHealth ==='; DISM /Online /Cleanup-Image /RestoreHealth 2>&1; Write-Output '=== SFC scannow ==='; sfc /scannow 2>&1; Write-Output 'SFC + DISM abgeschlossen'`), action: 'write', longRunning: true },
        { id: 'tempprofilefix', func: 'Temp-Profil Fix', when: 'User bekommt temporäres Profil',
          buildCmd: (h) => remote(h, `$profiles = Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList' | Where-Object { $_.PSChildName -match '\\.bak$' }; if ($profiles) { foreach ($p in $profiles) { $orig = $p.PSChildName -replace '\\.bak$',''; $origPath = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$orig"; if (Test-Path $origPath) { Rename-Item $origPath "$origPath.old" }; Rename-Item $p.PSPath ($p.PSPath -replace '\\.bak$',''); Write-Output "Repariert: $($p.PSChildName)" } } else { Write-Output 'Keine .bak-Profile gefunden' }`), action: 'critical' },
        { id: 'authreset', func: 'Auth-Reset', when: 'SSO/Kerberos/Login-Probleme',
          buildCmd: (h) => remote(h, `klist purge 2>&1 | Out-Null; ipconfig /flushdns | Out-Null; $creds = cmdkey /list 2>&1; $targets = [regex]::Matches($creds, 'Target:\\s*(.+)') | ForEach-Object { $_.Groups[1].Value.Trim() }; foreach ($t in $targets) { cmdkey /delete:$t 2>&1 | Out-Null }; gpupdate /force 2>&1 | Out-Null; Write-Output 'Auth-Reset abgeschlossen (Kerberos, DNS, Credentials, GPO)'`), action: 'critical', longRunning: true },
        { id: 'apprestartuser', func: 'App im User-Kontext neustarten', when: 'App muss als User laufen',
          buildCmd: (h, i) => remote(h, `$proc = '${i || 'notepad'}'; $p = Get-Process -Name $proc -EA SilentlyContinue; if ($p) { $user = (Get-Process -Name $proc -IncludeUserName -EA SilentlyContinue)[0].UserName; Stop-Process -Name $proc -Force; Start-Sleep -Seconds 2; $action = New-ScheduledTaskAction -Execute (Get-Process -Name $proc -EA SilentlyContinue | Select-Object -First 1).Path; if (-not $action) { $action = New-ScheduledTaskAction -Execute $proc }; $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive; $task = New-ScheduledTask -Action $action -Principal $principal; Register-ScheduledTask -TaskName 'TempRestart' -InputObject $task -Force | Out-Null; Start-ScheduledTask -TaskName 'TempRestart'; Start-Sleep -Seconds 2; Unregister-ScheduledTask -TaskName 'TempRestart' -Confirm:$false; Write-Output "$proc neu gestartet als $user" } else { Write-Output "Prozess $proc nicht gefunden" }`),
          action: 'write', input: { type: 'text', placeholder: 'Prozessname z.B. outlook, teams' } },
        { id: 'wupdatereset', func: 'Windows Update Dienste Reset', when: 'Updates schlagen fehl',
          buildCmd: (h) => remote(h, `Stop-Service wuauserv,bits,cryptsvc -Force -EA SilentlyContinue; Remove-Item 'C:\\Windows\\SoftwareDistribution\\*' -Recurse -Force -EA SilentlyContinue; Remove-Item 'C:\\Windows\\System32\\catroot2\\*' -Recurse -Force -EA SilentlyContinue; Start-Service wuauserv,bits,cryptsvc; Write-Output 'Windows Update Dienste zurückgesetzt (SoftwareDistribution + catroot2 gelöscht)'`), action: 'critical' },
        { id: 'outlookaddincheck', func: 'Outlook Add-In Check', when: 'Outlook-Add-Ins deaktiviert?',
          buildCmd: (h) => remote(h, `$disabled = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Resiliency\\DisabledItems' -EA SilentlyContinue).PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | Measure-Object; $crashing = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Resiliency\\CrashingAddinList' -EA SilentlyContinue).PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | Measure-Object; Write-Output "Deaktivierte Add-Ins: $($disabled.Count)"; Write-Output "Crashing Add-Ins: $($crashing.Count)"; Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\Outlook\\Addins\\*' -EA SilentlyContinue | Select-Object PSChildName,FriendlyName,LoadBehavior | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'msirepair', func: 'Windows Installer reparieren', when: 'MSI-Installationen schlagen fehl',
          buildCmd: (h) => remote(h, `msiexec /unregister 2>&1 | Out-Null; Start-Sleep -Seconds 2; msiexec /regserver 2>&1 | Out-Null; Write-Output 'Windows Installer neu registriert'`), action: 'write' },
        { id: 'megacleanup', func: 'MEGA-Cleanup', when: 'Alles auf einmal bereinigen',
          buildCmd: (h) => remote(h, `$results = @(); Get-Process -Name ms-teams,Teams -EA SilentlyContinue | Stop-Process -Force; $classic = "$env:APPDATA\\Microsoft\\Teams"; if (Test-Path $classic) { Remove-Item "$classic\\*" -Recurse -Force -EA SilentlyContinue }; $msix = Get-ChildItem "$env:LOCALAPPDATA\\Packages" -Filter 'MSTeams_*' -Directory -EA SilentlyContinue; if ($msix) { Remove-Item "$($msix.FullName)\\LocalCache\\*" -Recurse -Force -EA SilentlyContinue }; $results += 'Teams Cache'; Get-Process -Name chrome -EA SilentlyContinue | Stop-Process -Force; Remove-Item "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Cache\\*" -Recurse -Force -EA SilentlyContinue; $results += 'Chrome Cache'; Get-Process -Name msedge -EA SilentlyContinue | Stop-Process -Force; Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\Cache\\*" -Recurse -Force -EA SilentlyContinue; $results += 'Edge Cache'; Remove-Item "$env:APPDATA\\SAP\\Common\\*" -Recurse -Force -EA SilentlyContinue; Remove-Item "$env:TEMP\\sapgui*" -Recurse -Force -EA SilentlyContinue; $results += 'SAP Cache'; Remove-Item "$env:TEMP\\*" -Recurse -Force -EA SilentlyContinue; Remove-Item "C:\\Windows\\Temp\\*" -Recurse -Force -EA SilentlyContinue; Remove-Item "C:\\Windows\\Prefetch\\*" -Force -EA SilentlyContinue; ipconfig /flushdns | Out-Null; $results += 'Windows Cache + DNS'; Write-Output "MEGA-Cleanup abgeschlossen: $($results -join ', ')"`), action: 'critical', longRunning: true },
      ],
    },
    // ── 22: Zscaler ───────────────────────────────────────────────────────────
    {
      id: 'zscaler', label: 'Zscaler',
      commands: [
        { id: 'zscstatus', func: 'Status prüfen', when: 'Zscaler funktioniert nicht',
          buildCmd: (h) => remote(h, `$svc = Get-Service ZscalerService -EA SilentlyContinue; $procs = @('ZSATunnel','ZSAService') | ForEach-Object { $p = Get-Process -Name $_ -EA SilentlyContinue; [PSCustomObject]@{Name=$_;Running=($null -ne $p)} }; $cert = Get-ChildItem Cert:\\LocalMachine\\Root | Where-Object { $_.Subject -match 'Zscaler' } | Select-Object Subject,NotAfter; $tunnel = Test-NetConnection -ComputerName 'gateway.zscaler.net' -Port 443 -EA SilentlyContinue; [PSCustomObject]@{Service=@{Name='ZscalerService';Status=$svc.Status};Processes=$procs;Certificate=$cert;TunnelConnectivity=$tunnel.TcpTestSucceeded} | ConvertTo-Json -Depth 4 -Compress`), action: 'read' },
        { id: 'zscsvcrestart', func: 'Dienst neustarten', when: 'Zscaler hängt',
          buildCmd: (h) => remote(h, `Restart-Service ZscalerService -Force; Write-Output 'ZscalerService neu gestartet'`), action: 'write' },
        { id: 'zsccacheclear', func: 'Cache löschen + neustarten', when: 'Zscaler Cache-Probleme',
          buildCmd: (h) => remote(h, `Stop-Service ZscalerService -Force -EA SilentlyContinue; Start-Sleep -Seconds 2; Remove-Item "$env:LOCALAPPDATA\\Zscaler\\*" -Recurse -Force -EA SilentlyContinue; Start-Service ZscalerService; Write-Output 'Zscaler Cache gelöscht und Dienst neu gestartet'`), action: 'write' },
        { id: 'zsccert', func: 'Root-Zertifikat prüfen', when: 'SSL-Fehler/Zertifikatprobleme',
          buildCmd: (h) => remote(h, `$certs = Get-ChildItem Cert:\\LocalMachine\\Root | Where-Object { $_.Subject -match 'Zscaler' }; if ($certs) { $certs | Select-Object Subject,Issuer,NotBefore,NotAfter,Thumbprint | ConvertTo-Json -Compress } else { Write-Output '"Kein Zscaler Root-Zertifikat gefunden"' }`), action: 'read' },
        { id: 'zscproxy', func: 'Proxy-Einstellungen anzeigen', when: 'Proxy-Konfigurations-Check',
          buildCmd: (h) => remote(h, `Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' | Select-Object ProxyEnable,ProxyServer,ProxyOverride,AutoConfigURL | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'zscnettest', func: 'Netzwerk-Test durch Zscaler', when: 'Verbindungsprobleme über Zscaler',
          buildCmd: (h) => remote(h, `$results = @{}; $results.Ping = (Test-Connection ip.zscaler.com -Count 2 -EA SilentlyContinue | Select-Object Address,ResponseTime); $results.DNS = (Resolve-DnsName ip.zscaler.com -EA SilentlyContinue | Select-Object Name,IPAddress); $results.HTTPS = (Test-NetConnection -ComputerName ip.zscaler.com -Port 443 -EA SilentlyContinue).TcpTestSucceeded; $results | ConvertTo-Json -Depth 3 -Compress`), action: 'read' },
        { id: 'zscversion', func: 'Version prüfen', when: 'Zscaler-Version veraltet?',
          buildCmd: (h) => remote(h, `$svc = Get-WmiObject Win32_Service -Filter "Name='ZscalerService'" -EA SilentlyContinue; if ($svc) { $ver = (Get-ItemProperty $svc.PathName.Trim('"')).VersionInfo; [PSCustomObject]@{Path=$svc.PathName;Version=$ver.FileVersion;Product=$ver.ProductName} | ConvertTo-Json -Compress } else { Write-Output '"ZscalerService nicht gefunden"' }`), action: 'read' },
        { id: 'zsclogs', func: 'Logs sammeln', when: 'Zscaler-Fehlerdiagnose',
          buildCmd: (h) => remote(h, `$logPath = "$env:LOCALAPPDATA\\Zscaler\\logs"; if (Test-Path $logPath) { $logs = Get-ChildItem $logPath -File | Sort-Object LastWriteTime -Descending | Select-Object -First 5; foreach ($log in $logs) { Write-Output "=== $($log.Name) ($('{0:N0}' -f ($log.Length/1KB)) KB) ==="; Get-Content $log.FullName -Tail 30 } } else { Write-Output 'Kein Zscaler Log-Verzeichnis gefunden' }`), action: 'read' },
      ],
    },
    // ── 23: enaio/DMS ─────────────────────────────────────────────────────────
    {
      id: 'enaio', label: 'enaio/DMS',
      commands: [
        { id: 'enaiostatus', func: 'Add-In Status prüfen', when: 'enaio-Add-In geladen?',
          buildCmd: (h) => remote(h, `$addins = Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\Outlook\\Addins\\*' -EA SilentlyContinue | Where-Object { $_.FriendlyName -match 'enaio|OS_' } | Select-Object PSChildName,FriendlyName,LoadBehavior; $disabled = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Resiliency\\DisabledItems' -EA SilentlyContinue).PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' }; $crashing = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Resiliency\\CrashingAddinList' -EA SilentlyContinue).PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' }; $dll = Get-ChildItem 'C:\\Program Files*\\enaio\\' -Filter '*.dll' -Recurse -EA SilentlyContinue | Select-Object -First 1; [PSCustomObject]@{AddIns=$addins;DisabledCount=@($disabled).Count;CrashingCount=@($crashing).Count;DLLFound=($null -ne $dll);DLLPath=$dll.FullName} | ConvertTo-Json -Depth 3 -Compress`), action: 'read' },
        { id: 'enaioreactivate', func: 'Add-In reaktivieren', when: 'enaio deaktiviert/crasht',
          buildCmd: (h) => remote(h, `Remove-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Resiliency\\DisabledItems' -Name * -EA SilentlyContinue; Remove-Item 'HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Resiliency\\CrashingAddinList' -EA SilentlyContinue; $addins = Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\Outlook\\Addins\\*' -EA SilentlyContinue | Where-Object { $_.FriendlyName -match 'enaio|OS_' }; foreach ($a in $addins) { $key = "HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Resiliency\\DoNotDisableAddinList"; if (-not (Test-Path $key)) { New-Item $key -Force | Out-Null }; Set-ItemProperty $key -Name $a.PSChildName -Value 1 }; Write-Output 'enaio Add-In reaktiviert (DisabledItems+CrashingAddinList gelöscht, DoNotDisable gesetzt)'`), action: 'write' },
        { id: 'enaiooutlookrestart', func: 'Cache löschen + Outlook neustarten', when: 'enaio Cache-Probleme',
          buildCmd: (h) => remote(h, `Get-Process -Name OUTLOOK -EA SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 3; Remove-Item "$env:LOCALAPPDATA\\enaio\\*" -Recurse -Force -EA SilentlyContinue; Remove-Item "$env:APPDATA\\enaio\\*" -Recurse -Force -EA SilentlyContinue; Start-Sleep -Seconds 1; Start-Process outlook; Write-Output 'enaio Cache gelöscht und Outlook neu gestartet'`), action: 'write' },
        { id: 'enaioversion', func: 'Version prüfen', when: 'enaio-Version veraltet?',
          buildCmd: (h) => remote(h, `$dll = Get-ChildItem 'C:\\Program Files*\\enaio\\' -Filter '*.dll' -Recurse -EA SilentlyContinue | Select-Object -First 1; if ($dll) { $ver = (Get-ItemProperty $dll.FullName).VersionInfo; [PSCustomObject]@{File=$dll.Name;Version=$ver.FileVersion;Product=$ver.ProductVersion;Path=$dll.FullName} | ConvertTo-Json -Compress } else { Write-Output '"enaio DLL nicht gefunden"' }`), action: 'read' },
        { id: 'enaioserver', func: 'Server-Verbindung testen', when: 'enaio-Verbindungsprobleme',
          buildCmd: (h, i) => remote(h, `$server = '${i || 'enaio-server'}'; $result = Test-NetConnection -ComputerName $server -Port 80 -EA SilentlyContinue; [PSCustomObject]@{Server=$server;Reachable=$result.TcpTestSucceeded;RemoteAddress=$result.RemoteAddress;RTT=$result.PingReplyDetails.RoundtripTime} | ConvertTo-Json -Compress`),
          action: 'read', input: { type: 'text', placeholder: 'enaio Server-Hostname' } },
        { id: 'enaiodisable', func: 'Add-In komplett deaktivieren', when: 'enaio temporär abschalten',
          buildCmd: (h) => remote(h, `$addins = Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\Outlook\\Addins\\*' -EA SilentlyContinue | Where-Object { $_.FriendlyName -match 'enaio|OS_' }; foreach ($a in $addins) { Set-ItemProperty $a.PSPath -Name LoadBehavior -Value 0 }; Write-Output "enaio Add-In deaktiviert ($(@($addins).Count) Einträge auf LoadBehavior=0 gesetzt)"`), action: 'write' },
        { id: 'enaiocleanreg', func: 'Registry bereinigen', when: 'enaio Registry-Reset',
          buildCmd: (h) => remote(h, `Remove-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Resiliency\\DisabledItems' -Name * -EA SilentlyContinue; Remove-Item 'HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Resiliency\\CrashingAddinList' -EA SilentlyContinue; Remove-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Resiliency\\DoNotDisableAddinList' -Name * -EA SilentlyContinue; Write-Output 'enaio Resiliency-Registry bereinigt (DisabledItems, CrashingAddinList, DoNotDisableAddinList)'`), action: 'write' },
      ],
    },
    // ── Standard-Apps / Dateizuordnungen ────────────────────────────────────────
    {
      id: 'fileassoc', label: 'Standard-Apps / Dateizuordnungen',
      commands: [
        // ── Anzeigen ─────────────────────────────────────────────────────────
        { id: 'assoc-show', func: 'Standard-App für Dateityp anzeigen', when: 'Welche App öffnet PDF, HTML, JPG etc.?',
          buildCmd: (h, i) => {
            const ext = (i || '.pdf').trim().replace(/^\.?/, '.')
            return remote(h, [
              `$ext='${ext}'`,
              `$uc = Get-ItemProperty "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\$ext\\UserChoice" -EA SilentlyContinue`,
              `$progId = if($uc){$uc.ProgId}else{'(nicht gesetzt)'}`,
              `$appName = '(unbekannt)'`,
              `if($progId -and $progId -ne '(nicht gesetzt)') {`,
              `  $shell = Get-ItemProperty "HKLM:\\SOFTWARE\\Classes\\$progId\\shell\\open\\command" -EA SilentlyContinue`,
              `  if(-not $shell){ $shell = Get-ItemProperty "HKCU:\\Software\\Classes\\$progId\\shell\\open\\command" -EA SilentlyContinue }`,
              `  if($shell) {`,
              `    $exe = $shell.'(default)' -replace '"',''; $exe = ($exe -split '\\s+/| -%| --')[0].Trim()`,
              `    if(Test-Path $exe -EA SilentlyContinue){ $appName = (Get-ItemProperty $exe).VersionInfo.ProductName }`,
              `    if(-not $appName -or $appName -eq '(unbekannt)'){ $appName = [System.IO.Path]::GetFileNameWithoutExtension($exe) }`,
              `  }`,
              `  $friendly = Get-ItemProperty "HKLM:\\SOFTWARE\\Classes\\$progId" -EA SilentlyContinue`,
              `  if($friendly -and $friendly.'(default)'){ $appName = $friendly.'(default)' }`,
              `}`,
              `@{Endung=$ext;'Aktuelle App'=$appName;ProgID=$progId} | ConvertTo-Json -Compress`,
            ].join('; '))
          },
          action: 'read',
          input: { type: 'dropdown', options: ['.pdf', '.html', '.htm', '.txt', '.jpg', '.png', '.docx', '.xlsx', '.pptx', '.mp4', '.mp3', '.zip', '.csv'] },
        },
        { id: 'assoc-overview', func: 'Übersicht: Alle wichtigen Dateitypen', when: 'Standard-Apps für alle gängigen Formate',
          buildCmd: (h) => remote(h, [
            `$results = @()`,
            `$exts = @('.pdf','.html','.txt','.jpg','.png','.docx','.xlsx','.pptx','.mp4','.zip','.csv','.xml')`,
            `foreach($ext in $exts) {`,
            `  $uc = Get-ItemProperty "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\$ext\\UserChoice" -EA SilentlyContinue`,
            `  $progId = if($uc){$uc.ProgId}else{'—'}`,
            `  $name = $progId`,
            `  $known = @{ChromeHTML='Google Chrome';MSEdgeHTM='Microsoft Edge';MSEdgePDF='Microsoft Edge';FirefoxHTML='Firefox';FirefoxURL='Firefox';'AcroExch.Document.DC'='Adobe Acrobat Reader';'Applications\\notepad.exe'='Notepad';'txtfile'='Notepad';'Notepad++_file'='Notepad++';'WMP11.AssocFile.MP4'='Windows Media Player';'AppXqj98qxeaynz6dv4459ayz6bnqxbyaqcs'='Fotos App';'AppX43xyktxkfjwvhkj508hkz7v6ne8jpmh0'='Fotos App';'CompressedFolder'='Windows Explorer';'Excel.Sheet.12'='Microsoft Excel';'Word.Document.12'='Microsoft Word';'PowerPoint.Show.12'='Microsoft PowerPoint';'VLC.mp4'='VLC Media Player'}`,
            `  if($known.ContainsKey($progId)){$name=$known[$progId]}`,
            `  $results += @{Endung=$ext;'Standard-App'=$name;ProgID=$progId}`,
            `}`,
            `$results | ConvertTo-Json -Compress`,
          ].join(' ')), action: 'read' },
        { id: 'assoc-browser', func: 'Standard-Browser anzeigen', when: 'Welcher Browser ist als Standard eingestellt?',
          buildCmd: (h) => remote(h, [
            `$http = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice' -EA SilentlyContinue).ProgId`,
            `$https = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice' -EA SilentlyContinue).ProgId`,
            `$known = @{ChromeHTML='Google Chrome';MSEdgeHTM='Microsoft Edge';FirefoxURL='Mozilla Firefox';BraveHTML='Brave Browser';OperaStable='Opera'}`,
            `$name = if($known.ContainsKey($http)){$known[$http]}else{$http}`,
            `@{'Standard-Browser'=$name;'HTTP ProgID'=$http;'HTTPS ProgID'=$https} | ConvertTo-Json -Compress`,
          ].join('; ')), action: 'read' },
        { id: 'assoc-mail', func: 'Standard-Mail-App anzeigen', when: 'Welche App öffnet E-Mail-Links?',
          buildCmd: (h) => remote(h, [
            `$mailto = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\mailto\\UserChoice' -EA SilentlyContinue).ProgId`,
            `$known = @{'Outlook.URL.mailto.15'='Microsoft Outlook';'ChromeHTML'='Gmail (Chrome)';'MSEdgeHTM'='Outlook Web (Edge)';'thunderbird.url.mailto'='Mozilla Thunderbird'}`,
            `$name = if($known.ContainsKey($mailto)){$known[$mailto]}else{$mailto}`,
            `@{'Standard-Mail-App'=$name;'Mailto ProgID'=$mailto} | ConvertTo-Json -Compress`,
          ].join('; ')), action: 'read' },

        // ── Verfügbare Apps auslesen ─────────────────────────────────────────
        { id: 'assoc-apps', func: 'Verfügbare Apps für einen Dateityp', when: 'Welche Programme sind auf dem PC installiert die diesen Typ öffnen können?',
          buildCmd: (h, i) => {
            const ext = (i || '.pdf').trim().replace(/^\.?/, '.')
            return remote(h, [
              `$ext='${ext}'; $apps = @()`,
              `$known = @{ChromeHTML='Google Chrome';MSEdgeHTM='Microsoft Edge';MSEdgePDF='Microsoft Edge (PDF)';FirefoxHTML='Mozilla Firefox';'AcroExch.Document.DC'='Adobe Acrobat Reader';'AcroExch.Document'='Adobe Acrobat';'FoxitPhantomPDF.Document'='Foxit PDF';'Applications\\notepad.exe'='Notepad';'txtfile'='Editor (Notepad)';'Notepad++_file'='Notepad++';'VSCode.txt'='Visual Studio Code';'Applications\\wordpad.exe'='WordPad';'Word.Document.12'='Microsoft Word';'Excel.Sheet.12'='Microsoft Excel';'CompressedFolder'='Windows Explorer (ZIP)';'WinRAR'='WinRAR';'7-Zip.zip'='7-Zip';'VLC.mp4'='VLC Media Player';'WMP11.AssocFile.MP4'='Windows Media Player'}`,
              `# OpenWithProgids`,
              `$k1="HKLM:\\SOFTWARE\\Classes\\$ext\\OpenWithProgids"`,
              `if(Test-Path $k1){(Get-ItemProperty $k1 -EA SilentlyContinue).PSObject.Properties | Where-Object {$_.Name -notmatch '^PS'} | ForEach-Object { $pid=$_.Name; $name=if($known.ContainsKey($pid)){$known[$pid]}else{$pid}; $apps += @{App=$name;ProgID=$pid;Quelle='System'} }}`,
              `# OpenWithList (user)`,
              `$k2="HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\$ext\\OpenWithList"`,
              `if(Test-Path $k2){$p=Get-ItemProperty $k2 -EA SilentlyContinue; $p.PSObject.Properties | Where-Object {$_.Name -match '^[a-z]$'} | ForEach-Object { $apps += @{App=$_.Value;ProgID='—';Quelle='Benutzer'} }}`,
              `if($apps.Count -eq 0){@{Info="Keine registrierten Apps fuer $ext gefunden"} | ConvertTo-Json -Compress}else{$apps | ConvertTo-Json -Compress}`,
            ].join('; '))
          },
          action: 'read',
          input: { type: 'dropdown', options: ['.pdf', '.html', '.txt', '.jpg', '.png', '.docx', '.xlsx', '.mp4', '.zip'] },
        },

        // ── Ändern per Klick ─────────────────────────────────────────────────
        { id: 'assoc-set-pdf-adobe', func: 'PDF → Adobe Acrobat Reader', when: 'PDF-Dateien mit Adobe öffnen',
          buildCmd: (h) => remote(h, `cmd /c "assoc .pdf=AcroExch.Document.DC" 2>&1; cmd /c "ftype AcroExch.Document.DC" 2>&1; @{Aktion='PDF-Zuordnung geaendert';Programm='Adobe Acrobat Reader';ProgID='AcroExch.Document.DC';Hinweis='Die Systemzuordnung wurde geaendert. Fuer die Benutzer-Auswahl muss der User einmalig bei Doppelklick auf eine PDF-Datei Adobe waehlen und Immer verwenden anklicken.'} | ConvertTo-Json -Compress`),
          action: 'write' },
        { id: 'assoc-set-pdf-edge', func: 'PDF → Microsoft Edge', when: 'PDF-Dateien mit Edge öffnen',
          buildCmd: (h) => remote(h, `cmd /c "assoc .pdf=MSEdgePDF" 2>&1; @{Aktion='PDF-Zuordnung geaendert';Programm='Microsoft Edge';ProgID='MSEdgePDF';Hinweis='Die Systemzuordnung wurde geaendert.'} | ConvertTo-Json -Compress`),
          action: 'write' },
        { id: 'assoc-set-html-chrome', func: 'HTML → Google Chrome', when: 'Webseiten-Dateien mit Chrome öffnen',
          buildCmd: (h) => remote(h, `cmd /c "assoc .html=ChromeHTML" 2>&1; cmd /c "assoc .htm=ChromeHTML" 2>&1; @{Aktion='HTML-Zuordnung geaendert';Programm='Google Chrome';ProgID='ChromeHTML'} | ConvertTo-Json -Compress`),
          action: 'write' },
        { id: 'assoc-set-html-edge', func: 'HTML → Microsoft Edge', when: 'Webseiten-Dateien mit Edge öffnen',
          buildCmd: (h) => remote(h, `cmd /c "assoc .html=MSEdgeHTM" 2>&1; cmd /c "assoc .htm=MSEdgeHTM" 2>&1; @{Aktion='HTML-Zuordnung geaendert';Programm='Microsoft Edge';ProgID='MSEdgeHTM'} | ConvertTo-Json -Compress`),
          action: 'write' },
        { id: 'assoc-set-html-firefox', func: 'HTML → Mozilla Firefox', when: 'Webseiten-Dateien mit Firefox öffnen',
          buildCmd: (h) => remote(h, `cmd /c "assoc .html=FirefoxHTML" 2>&1; cmd /c "assoc .htm=FirefoxHTML" 2>&1; @{Aktion='HTML-Zuordnung geaendert';Programm='Mozilla Firefox';ProgID='FirefoxHTML'} | ConvertTo-Json -Compress`),
          action: 'write' },
        { id: 'assoc-set-txt-notepadpp', func: 'TXT → Notepad++', when: 'Textdateien mit Notepad++ öffnen',
          buildCmd: (h) => remote(h, `cmd /c "assoc .txt=Notepad++_file" 2>&1; @{Aktion='TXT-Zuordnung geaendert';Programm='Notepad++';ProgID='Notepad++_file'} | ConvertTo-Json -Compress`),
          action: 'write' },
        { id: 'assoc-set-txt-notepad', func: 'TXT → Editor (Notepad)', when: 'Textdateien mit Windows-Editor öffnen',
          buildCmd: (h) => remote(h, `cmd /c "assoc .txt=txtfile" 2>&1; @{Aktion='TXT-Zuordnung geaendert';Programm='Windows Editor (Notepad)';ProgID='txtfile'} | ConvertTo-Json -Compress`),
          action: 'write' },

        // ── Einstellungen-App öffnen (Fallback) ──────────────────────────────
        { id: 'assoc-open-settings', func: 'Standard-Apps Einstellungen öffnen', when: 'Windows-Einstellungen für Standard-Apps auf dem Ziel-PC öffnen',
          buildCmd: (h) => remote(h, `Start-Process 'ms-settings:defaultapps'; @{Aktion='Einstellungen geoeffnet';Hinweis='Die Windows Standard-Apps Einstellungen wurden auf dem Ziel-PC geoeffnet. Der angemeldete Benutzer kann dort seine Standard-Apps aendern.'} | ConvertTo-Json -Compress`),
          action: 'write' },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // UMGEBUNGSVARIABLEN — System- und Benutzervariablen anzeigen/setzen
    // ══════════════════════════════════════════════════════════════════════════
    {
      id: 'envvars', label: 'Umgebungsvariablen',
      commands: [
        // ── Anzeigen ─────────────────────────────────────────────────────────
        { id: 'env-system', func: 'System-Umgebungsvariablen anzeigen', when: 'PATH, TEMP, ComSpec und andere Systemvariablen',
          buildCmd: (h) => remote(h, `[System.Environment]::GetEnvironmentVariables('Machine').GetEnumerator() | Sort-Object Name | ForEach-Object { @{Variable=$_.Name;Wert=$_.Value;Bereich='System'} } | ConvertTo-Json -Compress`),
          action: 'read' },
        { id: 'env-user', func: 'Benutzer-Umgebungsvariablen anzeigen', when: 'Variablen des angemeldeten Benutzers',
          buildCmd: (h) => {
            const hSafe = h.replace(/'/g, "''")
            return [
              `try {`,
              ...getUserDetectionPS(hSafe).map(l => `  ${l}`),
              `  Invoke-Command -ComputerName '${hSafe}' -ScriptBlock {`,
              `    param($targetUser)`,
              `    $sid = (New-Object System.Security.Principal.NTAccount($targetUser)).Translate([System.Security.Principal.SecurityIdentifier]).Value`,
              `    $regPath = "Registry::HKEY_USERS\\$sid\\Environment"`,
              `    if (-not (Test-Path $regPath)) { Write-Output '"Keine Benutzer-Variablen gefunden"'; return }`,
              `    $item = Get-Item $regPath`,
              `    $item.Property | Sort-Object | ForEach-Object {`,
              `      @{Variable=$_;Wert=(Get-ItemPropertyValue $regPath $_ -EA SilentlyContinue);Bereich='Benutzer';Benutzer=$targetUser}`,
              `    } | ConvertTo-Json -Compress`,
              `  } -ArgumentList $user -EA Stop`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n')
          },
          action: 'read' },
        { id: 'env-path', func: 'PATH-Variable anzeigen (übersichtlich)', when: 'Alle Einträge im System-PATH einzeln auflisten',
          buildCmd: (h) => {
            const hSafe = h.replace(/'/g, "''")
            return [
              `try {`,
              ...getUserDetectionPS(hSafe).map(l => `  ${l}`),
              `  Invoke-Command -ComputerName '${hSafe}' -ScriptBlock {`,
              `    param($targetUser)`,
              `    $sysPath = [System.Environment]::GetEnvironmentVariable('PATH','Machine') -split ';' | Where-Object {$_}`,
              `    $sid = (New-Object System.Security.Principal.NTAccount($targetUser)).Translate([System.Security.Principal.SecurityIdentifier]).Value`,
              `    $regPath = "Registry::HKEY_USERS\\$sid\\Environment"`,
              `    $usrPathStr = try { (Get-ItemPropertyValue $regPath 'PATH' -EA Stop) } catch { '' }`,
              `    $usrPath = $usrPathStr -split ';' | Where-Object {$_}`,
              `    $results = @()`,
              `    $i=1; foreach($p in $sysPath){ $results += @{Nr=$i;Pfad=$p;Bereich='System';Existiert=if(Test-Path $p -EA SilentlyContinue){'Ja'}else{'Nein'}}; $i++ }`,
              `    foreach($p in $usrPath){ $results += @{Nr=$i;Pfad=$p;Bereich='Benutzer';Existiert=if(Test-Path $p -EA SilentlyContinue){'Ja'}else{'Nein'}}; $i++ }`,
              `    $results | ConvertTo-Json -Compress`,
              `  } -ArgumentList $user -EA Stop`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n')
          },
          action: 'read' },
        { id: 'env-single', func: 'Einzelne Variable abfragen', when: 'Wert einer bestimmten Variable anzeigen',
          buildCmd: (h, i) => {
            const name = (i || 'PATH').trim()
            const hSafe = h.replace(/'/g, "''")
            return [
              `try {`,
              ...getUserDetectionPS(hSafe).map(l => `  ${l}`),
              `  Invoke-Command -ComputerName '${hSafe}' -ScriptBlock {`,
              `    param($targetUser, $varName)`,
              `    $sys = [System.Environment]::GetEnvironmentVariable($varName,'Machine')`,
              `    $sid = (New-Object System.Security.Principal.NTAccount($targetUser)).Translate([System.Security.Principal.SecurityIdentifier]).Value`,
              `    $regPath = "Registry::HKEY_USERS\\$sid\\Environment"`,
              `    $usr = try { (Get-ItemPropertyValue $regPath $varName -EA Stop) } catch { $null }`,
              `    $proc = [System.Environment]::GetEnvironmentVariable($varName,'Process')`,
              `    @{Variable=$varName;'System-Wert'=if($sys){$sys}else{'(nicht gesetzt)'}; 'Benutzer-Wert'=if($usr){$usr}else{'(nicht gesetzt)'}; 'Aktuell (Prozess)'=if($proc){$proc}else{'(nicht gesetzt)'}; Benutzer=$targetUser} | ConvertTo-Json -Compress`,
              `  } -ArgumentList $user,'${name.replace(/'/g, "''")}' -EA Stop`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n')
          },
          action: 'read',
          input: { type: 'text', placeholder: 'Variablenname z.B. JAVA_HOME' },
          templates: [
            { label: 'PATH', value: 'PATH' },
            { label: 'TEMP', value: 'TEMP' },
            { label: 'JAVA_HOME', value: 'JAVA_HOME' },
            { label: 'COMPUTERNAME', value: 'COMPUTERNAME' },
            { label: 'USERNAME', value: 'USERNAME' },
            { label: 'USERPROFILE', value: 'USERPROFILE' },
            { label: 'APPDATA', value: 'APPDATA' },
            { label: 'ProgramFiles', value: 'ProgramFiles' },
          ],
        },

        // ── Setzen / Ändern ──────────────────────────────────────────────────
        { id: 'env-set-system', func: 'System-Variable setzen/ändern', when: 'Neue Systemvariable erstellen oder vorhandene ändern',
          buildCmd: (h, i) => {
            const parts = (i || '').split('=')
            const name = (parts[0] || '').trim()
            const value = parts.slice(1).join('=').trim()
            if (!name) return remote(h, `@{Fehler='Bitte Variable eingeben'} | ConvertTo-Json -Compress`)
            return remote(h, [
              `$name='${name.replace(/'/g, "''")}'`,
              `$value='${value.replace(/'/g, "''")}'`,
              `$old = [System.Environment]::GetEnvironmentVariable($name,'Machine')`,
              `[System.Environment]::SetEnvironmentVariable($name,$value,'Machine')`,
              `$new = [System.Environment]::GetEnvironmentVariable($name,'Machine')`,
              `@{Variable=$name;'Alter Wert'=if($old){$old}else{'(neu erstellt)'}; 'Neuer Wert'=$new; Bereich='System'; Hinweis='Aenderung gilt nach Neustart der Programme oder Abmeldung/Anmeldung.'} | ConvertTo-Json -Compress`,
            ].join('; '))
          },
          action: 'write',
          input: { type: 'envvar', placeholder: 'VARIABLENNAME=Wert' },
          templates: [
            { label: 'JAVA_HOME', value: 'JAVA_HOME=C:\\Program Files\\Java\\jdk-17' },
            { label: 'NODE_ENV', value: 'NODE_ENV=production' },
            { label: 'PYTHONPATH', value: 'PYTHONPATH=C:\\Python312' },
          ],
        },
        { id: 'env-set-user', func: 'Benutzer-Variable setzen/ändern', when: 'Variable nur für den angemeldeten Benutzer setzen',
          buildCmd: (h, i) => {
            const parts = (i || '').split('=')
            const name = (parts[0] || '').trim()
            const value = parts.slice(1).join('=').trim()
            if (!name) return remote(h, `@{Fehler='Bitte Variable eingeben'} | ConvertTo-Json -Compress`)
            const hSafe = h.replace(/'/g, "''")
            const nameEsc = name.replace(/'/g, "''")
            const valueEsc = value.replace(/'/g, "''")
            return [
              `try {`,
              ...getUserDetectionPS(hSafe).map(l => `  ${l}`),
              `  Invoke-Command -ComputerName '${hSafe}' -ScriptBlock {`,
              `    param($targetUser, $n, $v)`,
              `    $sid = (New-Object System.Security.Principal.NTAccount($targetUser)).Translate([System.Security.Principal.SecurityIdentifier]).Value`,
              `    $regPath = "Registry::HKEY_USERS\\$sid\\Environment"`,
              `    if (-not (Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }`,
              `    $old = try { (Get-ItemPropertyValue $regPath $n -EA Stop) } catch { $null }`,
              `    Set-ItemProperty -Path $regPath -Name $n -Value $v -Type String -Force`,
              `    $new = (Get-ItemPropertyValue $regPath $n -EA SilentlyContinue)`,
              `    @{Variable=$n;'Alter Wert'=if($old){$old}else{'(neu erstellt)'}; 'Neuer Wert'=$new; Bereich='Benutzer'; Benutzer=$targetUser} | ConvertTo-Json -Compress`,
              `  } -ArgumentList $user,'${nameEsc}','${valueEsc}' -EA Stop`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n')
          },
          action: 'write',
          input: { type: 'envvar', placeholder: 'VARIABLENNAME=Wert' },
        },

        // ── PATH erweitern ───────────────────────────────────────────────────
        { id: 'env-path-add', func: 'Pfad zum System-PATH hinzufügen', when: 'Neuen Ordner zum PATH hinzufügen (z.B. für ein Tool)',
          buildCmd: (h, i) => {
            const newPath = (i || '').trim()
            if (!newPath) return remote(h, `@{Fehler='Bitte den Pfad eingeben der zum PATH hinzugefuegt werden soll'} | ConvertTo-Json -Compress`)
            return remote(h, [
              `$add='${newPath.replace(/'/g, "''")}'`,
              `$current = [System.Environment]::GetEnvironmentVariable('PATH','Machine')`,
              `if($current -split ';' -contains $add){ @{Info='Pfad ist bereits im PATH enthalten';Pfad=$add} | ConvertTo-Json -Compress }`,
              `else {`,
              `  $new = $current.TrimEnd(';') + ';' + $add`,
              `  [System.Environment]::SetEnvironmentVariable('PATH',$new,'Machine')`,
              `  @{Aktion='Pfad hinzugefuegt';Pfad=$add;Hinweis='Aenderung wird nach Neustart der Programme wirksam.'} | ConvertTo-Json -Compress`,
              `}`,
            ].join(' '))
          },
          action: 'write',
          input: { type: 'text', placeholder: 'z.B. C:\\Tools\\bin' },
          templates: [
            { label: 'Python', value: 'C:\\Python312' },
            { label: 'Python Scripts', value: 'C:\\Python312\\Scripts' },
            { label: 'Node.js', value: 'C:\\Program Files\\nodejs' },
            { label: 'Git', value: 'C:\\Program Files\\Git\\cmd' },
            { label: 'Java bin', value: 'C:\\Program Files\\Java\\jdk-17\\bin' },
          ],
        },
        { id: 'env-path-remove', func: 'Pfad aus System-PATH entfernen', when: 'Einen Ordner aus dem PATH löschen',
          buildCmd: (h, i) => {
            const rmPath = (i || '').trim()
            if (!rmPath) return remote(h, `@{Fehler='Bitte den Pfad eingeben der entfernt werden soll'} | ConvertTo-Json -Compress`)
            return remote(h, [
              `$rem='${rmPath.replace(/'/g, "''")}'`,
              `$current = [System.Environment]::GetEnvironmentVariable('PATH','Machine')`,
              `$parts = $current -split ';' | Where-Object {$_ -and $_.TrimEnd('\\') -ne $rem.TrimEnd('\\')}`,
              `$new = $parts -join ';'`,
              `[System.Environment]::SetEnvironmentVariable('PATH',$new,'Machine')`,
              `@{Aktion='Pfad entfernt';Pfad=$rem;'Eintraege vorher'=($current -split ';').Count; 'Eintraege nachher'=$parts.Count} | ConvertTo-Json -Compress`,
            ].join('; '))
          },
          action: 'critical',
          input: { type: 'text', placeholder: 'Exakter Pfad z.B. C:\\Tools\\bin' },
        },

        // ── Löschen ──────────────────────────────────────────────────────────
        { id: 'env-delete-system', func: 'System-Variable löschen', when: 'Eine Systemvariable komplett entfernen',
          buildCmd: (h, i) => {
            const name = (i || '').trim()
            if (!name) return remote(h, `@{Fehler='Bitte den Namen der Variable eingeben'} | ConvertTo-Json -Compress`)
            return remote(h, [
              `$name='${name.replace(/'/g, "''")}'`,
              `$old = [System.Environment]::GetEnvironmentVariable($name,'Machine')`,
              `if(-not $old){ @{Info="Variable '$name' existiert nicht im System-Bereich"} | ConvertTo-Json -Compress }`,
              `else {`,
              `  [System.Environment]::SetEnvironmentVariable($name,$null,'Machine')`,
              `  @{Aktion='Variable geloescht';Variable=$name;'Alter Wert'=$old;Bereich='System'} | ConvertTo-Json -Compress`,
              `}`,
            ].join(' '))
          },
          action: 'critical',
          input: { type: 'text', placeholder: 'VARIABLENNAME' },
        },
        { id: 'env-delete-user', func: 'Benutzer-Variable löschen', when: 'Eine Benutzervariable komplett entfernen',
          buildCmd: (h, i) => {
            const name = (i || '').trim()
            if (!name) return remote(h, `@{Fehler='Bitte den Namen der Variable eingeben'} | ConvertTo-Json -Compress`)
            const hSafe = h.replace(/'/g, "''")
            const nameEsc = name.replace(/'/g, "''")
            return [
              `try {`,
              ...getUserDetectionPS(hSafe).map(l => `  ${l}`),
              `  Invoke-Command -ComputerName '${hSafe}' -ScriptBlock {`,
              `    param($targetUser, $n)`,
              `    $sid = (New-Object System.Security.Principal.NTAccount($targetUser)).Translate([System.Security.Principal.SecurityIdentifier]).Value`,
              `    $regPath = "Registry::HKEY_USERS\\$sid\\Environment"`,
              `    $old = try { (Get-ItemPropertyValue $regPath $n -EA Stop) } catch { $null }`,
              `    if (-not $old) { @{Info="Variable '$n' existiert nicht im Benutzer-Bereich"} | ConvertTo-Json -Compress }`,
              `    else {`,
              `      Remove-ItemProperty -Path $regPath -Name $n -Force`,
              `      @{Aktion='Variable geloescht';Variable=$n;'Alter Wert'=$old;Bereich='Benutzer';Benutzer=$targetUser} | ConvertTo-Json -Compress`,
              `    }`,
              `  } -ArgumentList $user,'${nameEsc}' -EA Stop`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n')
          },
          action: 'critical',
          input: { type: 'text', placeholder: 'VARIABLENNAME' },
        },
      ],
    },

    // ── 24: Gerätemanager & Treiber ───────────────────────────────────────────
    {
      id: 'devmgr', label: 'Gerätemanager & Treiber',
      commands: [
        { id: 'devlist', func: 'Alle Geräte auflisten', when: 'Geräte-Überblick',
          buildCmd: (h) => remote(h, `Get-PnpDevice | Select-Object @{N='Status';E={$_.Status}},@{N='Klasse';E={$_.Class}},@{N='Gerät';E={$_.FriendlyName}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'deverror', func: 'Geräte mit Fehler', when: 'Treiberprobleme finden',
          buildCmd: (h) => remote(h, `$devs = Get-PnpDevice | Where-Object { $_.Status -ne 'OK' }; if (-not $devs) { Write-Output 'Keine Geräte mit Fehler' } else { $result = foreach ($d in $devs) { $prop = Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName 'DEVPKEY_Device_ProblemCode' -EA SilentlyContinue; [PSCustomObject]@{Status=$d.Status;Class=$d.Class;Name=$d.FriendlyName;InstanceId=$d.InstanceId;ErrorCode=$prop.Data} }; $result | ConvertTo-Json -Compress }`), action: 'read' },
        { id: 'devhidden', func: 'Versteckte Geräte', when: 'Ghost Devices finden',
          buildCmd: (h) => remote(h, `Get-PnpDevice -PresentOnly:$false | Where-Object { $_.Status -eq 'Unknown' } | Select-Object @{N='Status';E={$_.Status}},@{N='Klasse';E={$_.Class}},@{N='Gerät';E={$_.FriendlyName}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'devdisable', func: 'Gerät deaktivieren', when: 'Gerät temporär abschalten',
          buildCmd: (h, i) => remote(h, `Disable-PnpDevice -InstanceId '${i}' -Confirm:$false; Write-Output 'Gerät deaktiviert: ${i}'`),
          action: 'write', input: { type: 'text', placeholder: 'InstanceId des Geräts' } },
        { id: 'devenable', func: 'Gerät aktivieren', when: 'Gerät wieder einschalten',
          buildCmd: (h, i) => remote(h, `Enable-PnpDevice -InstanceId '${i}' -Confirm:$false; Write-Output 'Gerät aktiviert: ${i}'`),
          action: 'write', input: { type: 'text', placeholder: 'InstanceId des Geräts' } },
        { id: 'devrestart', func: 'Gerät neustarten', when: 'Gerät hängt/reagiert nicht',
          buildCmd: (h, i) => remote(h, `Disable-PnpDevice -InstanceId '${i}' -Confirm:$false; Start-Sleep -Seconds 2; Enable-PnpDevice -InstanceId '${i}' -Confirm:$false; Write-Output 'Gerät neu gestartet: ${i}'`),
          action: 'write', input: { type: 'text', placeholder: 'InstanceId des Geräts' } },
        { id: 'devuninstall', func: 'Gerät deinstallieren', when: 'Gerät komplett entfernen',
          buildCmd: (h, i) => remote(h, `pnputil /remove-device '${i}' 2>&1`),
          action: 'critical', input: { type: 'text', placeholder: 'InstanceId des Geräts' } },
        { id: 'drvlist', func: 'Treiber auflisten', when: 'Installierte OEM-Treiber',
          buildCmd: (h) => remote(h, `pnputil /enum-drivers 2>&1`), action: 'read' },
        { id: 'drvdelete', func: 'Treiber deinstallieren', when: 'Alten Treiber entfernen',
          buildCmd: (h, i) => remote(h, `pnputil /delete-driver '${i}' /uninstall /force 2>&1`),
          action: 'critical', input: { type: 'text', placeholder: 'OEM INF z.B. oem42.inf' } },
        { id: 'devscan', func: 'Hardware-Änderungen scannen', when: 'Neues Gerät erkennen',
          buildCmd: (h) => remote(h, `pnputil /scan-devices 2>&1`), action: 'write' },
        { id: 'devclass', func: 'Geräte nach Klasse', when: 'Bestimmte Geräteklasse anzeigen',
          buildCmd: (h, i) => remote(h, `Get-PnpDevice -Class '${i || 'Camera'}' | Select-Object Status,FriendlyName,InstanceId | ConvertTo-Json -Compress`),
          action: 'read', input: { type: 'dropdown', options: ['Camera', 'AudioEndpoint', 'USB', 'Bluetooth', 'Net', 'Display'] } },
        { id: 'audioreset', func: 'Audio-Gerät reset', when: 'Kein Ton/Audio-Probleme',
          buildCmd: (h) => remote(h, `$devs = Get-PnpDevice -Class AudioEndpoint -EA SilentlyContinue; foreach ($d in $devs) { Disable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -EA SilentlyContinue }; Start-Sleep -Seconds 2; foreach ($d in $devs) { Enable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -EA SilentlyContinue }; Write-Output "Audio-Geräte neu gestartet ($(@($devs).Count) Geräte)"`), action: 'write' },
        { id: 'usbpower', func: 'USB Power Management aus', when: 'USB-Geräte trennen sich',
          buildCmd: (h) => remote(h, `Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\USB' -Name DisableSelectiveSuspend -Value 1 -Type DWord -Force; Write-Output 'USB Selective Suspend deaktiviert (Neustart empfohlen)'`), action: 'write' },
        { id: 'btreset', func: 'Bluetooth-Adapter reset', when: 'Bluetooth-Probleme',
          buildCmd: (h) => remote(h, `$bt = Get-PnpDevice -Class Bluetooth -EA SilentlyContinue | Where-Object { $_.Status -eq 'OK' } | Select-Object -First 1; if ($bt) { Disable-PnpDevice -InstanceId $bt.InstanceId -Confirm:$false; Start-Sleep -Seconds 2; Enable-PnpDevice -InstanceId $bt.InstanceId -Confirm:$false; Write-Output "Bluetooth-Adapter neu gestartet: $($bt.FriendlyName)" } else { Write-Output 'Kein aktiver Bluetooth-Adapter gefunden' }`), action: 'write' },
        { id: 'devunknown', func: 'Unbekanntes Gerät identifizieren', when: 'Gelbes Ausrufezeichen',
          buildCmd: (h, i) => remote(h, `$dev = Get-PnpDevice -InstanceId '${i}' -EA SilentlyContinue; if ($dev) { $hwIds = Get-PnpDeviceProperty -InstanceId '${i}' -KeyName 'DEVPKEY_Device_HardwareIds' -EA SilentlyContinue; $compatIds = Get-PnpDeviceProperty -InstanceId '${i}' -KeyName 'DEVPKEY_Device_CompatibleIds' -EA SilentlyContinue; [PSCustomObject]@{Name=$dev.FriendlyName;Status=$dev.Status;Class=$dev.Class;HardwareIds=$hwIds.Data;CompatibleIds=$compatIds.Data} | ConvertTo-Json -Depth 3 -Compress } else { Write-Output '"Gerät nicht gefunden"' }`),
          action: 'read', input: { type: 'text', placeholder: 'InstanceId des unbekannten Geräts' } },
        { id: 'devtree', func: 'Geräte-Baum', when: 'Verbundene Geräte-Hierarchie',
          buildCmd: (h) => remote(h, `pnputil /enum-devices /connected 2>&1`), action: 'read' },
      ],
    },
    // ── 25: Systemeinstellungen ───────────────────────────────────────────────
    {
      id: 'sysconfig', label: 'Systemeinstellungen',
      commands: [
        { id: 'uacread', func: 'UAC-Level lesen', when: 'UAC-Konfiguration prüfen',
          buildCmd: (h) => remote(h, `$lua = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System').EnableLUA; $consent = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System').ConsentPromptBehaviorAdmin; [PSCustomObject]@{EnableLUA=$lua;ConsentPromptBehaviorAdmin=$consent;Description=switch($consent){0{'Keine Eingabeaufforderung'}1{'Zustimmung auf Secure Desktop'}2{'Anmeldeinformationen auf Secure Desktop'}3{'Zustimmung'}4{'Anmeldeinformationen'}5{'Secure Desktop Standard'}}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'uacset', func: 'UAC-Level ändern', when: 'UAC anpassen',
          buildCmd: (h, i) => remote(h, `$level = [int]'${i || '5'}'; Set-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name ConsentPromptBehaviorAdmin -Value $level -Type DWord; Write-Output "UAC ConsentPromptBehaviorAdmin auf $level gesetzt"`),
          action: 'critical', input: { type: 'dropdown', options: ['0 - Aus', '1 - Kein Prompt', '3 - Zustimmung', '5 - Secure Desktop'] } },
        { id: 'timeshow', func: 'Uhrzeit anzeigen', when: 'Zeitabweichung prüfen',
          buildCmd: (h) => remote(h, `$local = Get-Date; $dc = w32tm /stripchart /computer:$(([System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()).PdcRoleOwner.Name) /dataonly /samples:1 2>&1; [PSCustomObject]@{LocalTime=$local.ToString('yyyy-MM-dd HH:mm:ss');DCComparison=$dc} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'timeset', func: 'Uhrzeit ändern', when: 'Uhrzeit manuell korrigieren',
          buildCmd: (h, i) => remote(h, `Set-Date -Date '${i}'; Write-Output "Uhrzeit gesetzt auf: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"`),
          action: 'critical', input: { type: 'text', placeholder: 'Datum/Uhrzeit z.B. 2026-03-23 14:30:00' } },
        { id: 'tzset', func: 'Zeitzone setzen', when: 'Zeitzone falsch',
          buildCmd: (h, i) => remote(h, `Set-TimeZone -Id '${i || 'W. Europe Standard Time'}'; $tz = Get-TimeZone; Write-Output "Zeitzone gesetzt: $($tz.Id) ($($tz.DisplayName))"`),
          action: 'write', input: { type: 'text', placeholder: 'Zeitzonen-ID z.B. W. Europe Standard Time' } },
        { id: 'ntpshow', func: 'Zeitserver anzeigen', when: 'NTP-Konfiguration prüfen',
          buildCmd: (h) => remote(h, `$source = w32tm /query /source 2>&1; $status = w32tm /query /status 2>&1; Write-Output "=== Quelle ==="; Write-Output $source; Write-Output "=== Status ==="; Write-Output $status`), action: 'read' },
        { id: 'ntprestart', func: 'Zeitserver neustarten + Sync', when: 'Zeitsynchronisation fehlerhaft',
          buildCmd: (h) => remote(h, `Restart-Service w32time -Force; Start-Sleep -Seconds 2; w32tm /resync /force 2>&1; Write-Output 'Zeitdienst neu gestartet und Synchronisation erzwungen'`), action: 'write' },
        { id: 'ntpset', func: 'Zeitserver ändern', when: 'Anderen NTP-Server konfigurieren',
          buildCmd: (h, i) => remote(h, `w32tm /config /manualpeerlist:'${i}' /syncfromflags:manual /update 2>&1; Restart-Service w32time -Force; w32tm /resync /force 2>&1; Write-Output "Zeitserver geändert auf: ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'NTP-Server z.B. time.windows.com' } },
        { id: 'ietreset', func: 'Internetoptionen zurücksetzen', when: 'Browser/Proxy-Probleme',
          buildCmd: (h) => remote(h, `RunDll32 inetcpl.cpl,ResetIEtoDefaults; Write-Output 'Internetoptionen zurückgesetzt'`), action: 'write' },
        { id: 'proxyshow', func: 'Proxy anzeigen', when: 'Proxy-Konfiguration prüfen',
          buildCmd: (h) => remote(h, `Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' | Select-Object ProxyEnable,ProxyServer,ProxyOverride,AutoConfigURL | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'proxyclear', func: 'Proxy löschen', when: 'Proxy deaktivieren',
          buildCmd: (h) => remote(h, `Set-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyEnable -Value 0; Remove-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyServer -EA SilentlyContinue; Write-Output 'Proxy deaktiviert und Server-Eintrag entfernt'`), action: 'write' },
        { id: 'proxyset', func: 'Proxy setzen', when: 'Proxy konfigurieren',
          buildCmd: (h, i) => remote(h, `Set-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyEnable -Value 1; Set-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyServer -Value '${i}'; Write-Output "Proxy gesetzt: ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'Proxy:Port z.B. proxy.firma.de:8080' } },
        { id: 'powerplan', func: 'Energiesparplan anzeigen', when: 'Welcher Plan aktiv?',
          buildCmd: (h) => remote(h, `powercfg /getactivescheme 2>&1`), action: 'read' },
        { id: 'powerhigh', func: 'Hochleistung aktivieren', when: 'Maximale Performance',
          buildCmd: (h) => remote(h, `powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>&1; powercfg /getactivescheme 2>&1`), action: 'write' },
        { id: 'powerbal', func: 'Ausbalanciert aktivieren', when: 'Standard-Energiesparplan',
          buildCmd: (h) => remote(h, `powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e 2>&1; powercfg /getactivescheme 2>&1`), action: 'write' },
        { id: 'monitortime', func: 'Bildschirm-Timeout', when: 'Monitor-Abschaltzeit ändern',
          buildCmd: (h, i) => remote(h, `powercfg /change monitor-timeout-ac ${i || '15'}; Write-Output "Bildschirm-Timeout auf ${i || '15'} Minuten gesetzt"`),
          action: 'write', input: { type: 'text', placeholder: 'Minuten z.B. 15' } },
        { id: 'standbytime', func: 'Standby-Timeout', when: 'Standby-Zeit ändern',
          buildCmd: (h, i) => remote(h, `powercfg /change standby-timeout-ac ${i || '30'}; Write-Output "Standby-Timeout auf ${i || '30'} Minuten gesetzt"`),
          action: 'write', input: { type: 'text', placeholder: 'Minuten z.B. 30' } },
        { id: 'hibernate', func: 'Ruhezustand an/aus', when: 'Hibernation umschalten',
          buildCmd: (h, i) => remote(h, `powercfg /hibernate ${i || 'on'} 2>&1; Write-Output "Ruhezustand: ${i || 'on'}"`),
          action: 'write', input: { type: 'dropdown', options: ['on', 'off'] } },
        { id: 'locktime', func: 'Sperrbildschirm-Timeout', when: 'Auto-Sperrzeit ändern',
          buildCmd: (h, i) => remote(h, `$seconds = [int]'${i || '600'}' * 60; Set-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Control Panel\\Desktop' -Name ScreenSaverTimeout -Value $seconds -Force -EA SilentlyContinue; Set-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name ScreenSaverTimeout -Value $seconds -Force; Write-Output "Sperrbildschirm-Timeout auf ${i || '600'} Minuten gesetzt"`),
          action: 'write', input: { type: 'text', placeholder: 'Minuten z.B. 10' } },
        { id: 'rdpon', func: 'Remote-Desktop aktivieren', when: 'RDP einschalten',
          buildCmd: (h) => remote(h, `Set-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server' -Name fDenyTSConnections -Value 0 -Type DWord; Enable-NetFirewallRule -DisplayGroup 'Remote Desktop' -EA SilentlyContinue; Write-Output 'Remote-Desktop aktiviert + Firewall-Regel freigegeben'`), action: 'write' },
        { id: 'rdpoff', func: 'Remote-Desktop deaktivieren', when: 'RDP abschalten',
          buildCmd: (h) => remote(h, `Set-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server' -Name fDenyTSConnections -Value 1 -Type DWord; Write-Output 'Remote-Desktop deaktiviert'`), action: 'write' },
        { id: 'regioninfo', func: 'Region/Sprache anzeigen', when: 'Locale prüfen',
          buildCmd: (h) => remote(h, `$culture = Get-Culture; $sysLocale = Get-WinSystemLocale; [PSCustomObject]@{Culture=$culture.Name;DisplayName=$culture.DisplayName;SystemLocale=$sysLocale.Name;SystemLocaleName=$sysLocale.DisplayName} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'kblayout', func: 'Tastaturlayout anzeigen', when: 'Tastatur-Sprache prüfen',
          buildCmd: (h) => remote(h, `Get-WinUserLanguageList | Select-Object LanguageTag,InputMethodTips,Autonym | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'dpiscale', func: 'DPI-Skalierung anzeigen', when: 'Bildschirm-Skalierung prüfen',
          buildCmd: (h) => remote(h, `$dpi = (Get-ItemProperty 'HKCU:\\Control Panel\\Desktop\\WindowMetrics' -Name AppliedDPI -EA SilentlyContinue).AppliedDPI; $logPix = (Get-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name LogPixels -EA SilentlyContinue).LogPixels; [PSCustomObject]@{AppliedDPI=$dpi;LogPixels=$logPix;ScalePercent=[math]::Round(($dpi/96)*100)} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'defexcadd', func: 'Defender-Ausnahme hinzufügen', when: 'False-Positive vermeiden',
          buildCmd: (h, i) => remote(h, `Add-MpPreference -ExclusionPath '${i}'; Write-Output "Defender-Ausnahme hinzugefügt: ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'Pfad z.B. C:\\Program Files\\App' } },
        { id: 'defexcrem', func: 'Defender-Ausnahme entfernen', when: 'Ausnahme nicht mehr nötig',
          buildCmd: (h, i) => remote(h, `Remove-MpPreference -ExclusionPath '${i}'; Write-Output "Defender-Ausnahme entfernt: ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'Pfad z.B. C:\\Program Files\\App' } },
        { id: 'defquick', func: 'Defender Schnellscan', when: 'Schnelle Malware-Prüfung',
          buildCmd: (h) => remote(h, `Start-MpScan -ScanType QuickScan; Write-Output 'Defender Schnellscan gestartet'`), action: 'write', longRunning: true },
        { id: 'deffull', func: 'Defender Vollscan', when: 'Gründliche Malware-Prüfung',
          buildCmd: (h) => remote(h, `Start-MpScan -ScanType FullScan; Write-Output 'Defender Vollscan gestartet'`), action: 'write', longRunning: true },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // 🎵 SPASS & TOOLS
    // ══════════════════════════════════════════════════════════════════════════
    {
      id: 'fun', label: '🎵 Spaß & Tools',
      commands: [
        // ── Melodie: REMOTE (ScheduledTask + Script-Datei) ──────────────────
        { id: 'melodie-remote', func: '🎶 Melodie auf Ziel-PC abspielen', when: 'Eine lustige Melodie auf dem Remote-PC hoerbar abspielen',
          buildCmd: (h, i) => {
            const melodies: Record<string, string> = {
              tod: [
                '[Console]::Beep(440,1200); Start-Sleep -Milliseconds 100; [Console]::Beep(523,400); [Console]::Beep(587,1200)',
                'Start-Sleep -Milliseconds 300',
                '[Console]::Beep(440,1200); Start-Sleep -Milliseconds 100; [Console]::Beep(523,400); [Console]::Beep(587,800); [Console]::Beep(659,1000)',
                'Start-Sleep -Milliseconds 200',
                '[Console]::Beep(587,600); [Console]::Beep(523,600); [Console]::Beep(440,1400)',
                'Start-Sleep -Milliseconds 400',
                '[Console]::Beep(392,1200); Start-Sleep -Milliseconds 100; [Console]::Beep(440,400); [Console]::Beep(523,1200)',
                '[Console]::Beep(523,600); [Console]::Beep(440,600); [Console]::Beep(392,1800)',
              ].join('\r\n'),
              march: [
                '[Console]::Beep(440,500)', '[Console]::Beep(440,500)', '[Console]::Beep(440,500)',
                '[Console]::Beep(349,375)', '[Console]::Beep(523,125)',
                '[Console]::Beep(440,500)', '[Console]::Beep(349,375)', '[Console]::Beep(523,125)',
                '[Console]::Beep(440,1000)', 'Start-Sleep -Milliseconds 200',
                '[Console]::Beep(659,500)', '[Console]::Beep(659,500)', '[Console]::Beep(659,500)',
                '[Console]::Beep(698,375)', '[Console]::Beep(523,125)',
                '[Console]::Beep(415,500)', '[Console]::Beep(349,375)', '[Console]::Beep(523,125)',
                '[Console]::Beep(440,1000)',
              ].join('\r\n'),
              mario: [
                '[Console]::Beep(660,150)', 'Start-Sleep -Milliseconds 30',
                '[Console]::Beep(660,150)', 'Start-Sleep -Milliseconds 150',
                '[Console]::Beep(660,150)', 'Start-Sleep -Milliseconds 150',
                '[Console]::Beep(510,150)', 'Start-Sleep -Milliseconds 30',
                '[Console]::Beep(660,150)', 'Start-Sleep -Milliseconds 150',
                '[Console]::Beep(770,300)', 'Start-Sleep -Milliseconds 300',
                '[Console]::Beep(380,300)',
              ].join('\r\n'),
              nokia: [
                '[Console]::Beep(659,125)', '[Console]::Beep(587,125)', '[Console]::Beep(370,250)', '[Console]::Beep(415,250)',
                '[Console]::Beep(554,125)', '[Console]::Beep(494,125)', '[Console]::Beep(330,250)', '[Console]::Beep(370,250)',
                '[Console]::Beep(494,125)', '[Console]::Beep(440,125)', '[Console]::Beep(277,250)', '[Console]::Beep(330,250)',
                '[Console]::Beep(440,500)',
              ].join('\r\n'),
            }
            const choice = i || 'tod'
            const script = melodies[choice] ?? melodies.tod
            const hSafe = h.replace(/'/g, "''")
            // Escape single quotes for PS here-string embedding
            const scriptEscaped = script.replace(/'/g, "''")
            return [
              `try {`,
              ...getUserDetectionPS(hSafe).map(l => `  ${l}`),
              `  $scriptContent = @'`,
              `${script}`,
              `'@`,
              `  Invoke-Command -ComputerName '${hSafe}' -ScriptBlock {`,
              `    param($usr, $sc)`,
              `    $path = 'C:\\Temp\\it_melodie.ps1'`,
              `    if (-not (Test-Path 'C:\\Temp')) { New-Item -Path 'C:\\Temp' -ItemType Directory -Force | Out-Null }`,
              `    Set-Content -Path $path -Value $sc -Force -Encoding UTF8`,
              `    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-WindowStyle Hidden -ExecutionPolicy Bypass -File C:\\Temp\\it_melodie.ps1'`,
              `    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2)`,
              `    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries`,
              `    Register-ScheduledTask -TaskName 'IT_Melodie' -Action $action -Trigger $trigger -User $usr -Settings $settings -Force | Out-Null`,
              `    Start-ScheduledTask -TaskName 'IT_Melodie'`,
              `    Start-Sleep -Seconds 15`,
              `    Unregister-ScheduledTask -TaskName 'IT_Melodie' -Confirm:$false -EA SilentlyContinue`,
              `    Remove-Item $path -Force -EA SilentlyContinue`,
              `  } -ArgumentList $user,$scriptContent -EA Stop`,
              `  @{Ergebnis='Melodie abgespielt!';Melodie='${choice}';Ziel='${hSafe}'} | ConvertTo-Json -Compress`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n')
          },
          action: 'write', longRunning: true,
          input: { type: 'dropdown', options: ['tod', 'march', 'mario', 'nokia'] },
          templates: [
            { label: '🎶 Spiel mir das Lied vom Tod', value: 'tod' },
            { label: '⚔️ Imperial March', value: 'march' },
            { label: '🍄 Super Mario', value: 'mario' },
            { label: '📱 Nokia Klingelton', value: 'nokia' },
          ],
        },
        // ── Melodie: LOKAL (direkt, kein ScheduledTask noetig) ────────────
        { id: 'melodie-lokal', func: '🎶 Melodie abspielen (lokal)', when: 'Eine lustige Melodie auf DEINEM PC abspielen — zum Testen',
          buildCmd: (_h, i) => {
            const melodies: Record<string, string> = {
              tod: [
                '[Console]::Beep(440,1200); Start-Sleep -Milliseconds 100; [Console]::Beep(523,400); [Console]::Beep(587,1200)',
                'Start-Sleep -Milliseconds 300',
                '[Console]::Beep(440,1200); Start-Sleep -Milliseconds 100; [Console]::Beep(523,400); [Console]::Beep(587,800); [Console]::Beep(659,1000)',
                'Start-Sleep -Milliseconds 200',
                '[Console]::Beep(587,600); [Console]::Beep(523,600); [Console]::Beep(440,1400)',
                'Start-Sleep -Milliseconds 400',
                '[Console]::Beep(392,1200); Start-Sleep -Milliseconds 100; [Console]::Beep(440,400); [Console]::Beep(523,1200)',
                '[Console]::Beep(523,600); [Console]::Beep(440,600); [Console]::Beep(392,1800)',
              ].join('; '),
              march: [
                '[Console]::Beep(440,500)', '[Console]::Beep(440,500)', '[Console]::Beep(440,500)',
                '[Console]::Beep(349,375)', '[Console]::Beep(523,125)',
                '[Console]::Beep(440,500)', '[Console]::Beep(349,375)', '[Console]::Beep(523,125)',
                '[Console]::Beep(440,1000)', 'Start-Sleep -Milliseconds 200',
                '[Console]::Beep(659,500)', '[Console]::Beep(659,500)', '[Console]::Beep(659,500)',
                '[Console]::Beep(698,375)', '[Console]::Beep(523,125)',
                '[Console]::Beep(415,500)', '[Console]::Beep(349,375)', '[Console]::Beep(523,125)',
                '[Console]::Beep(440,1000)',
              ].join('; '),
              mario: [
                '[Console]::Beep(660,150)', 'Start-Sleep -Milliseconds 30',
                '[Console]::Beep(660,150)', 'Start-Sleep -Milliseconds 150',
                '[Console]::Beep(660,150)', 'Start-Sleep -Milliseconds 150',
                '[Console]::Beep(510,150)', 'Start-Sleep -Milliseconds 30',
                '[Console]::Beep(660,150)', 'Start-Sleep -Milliseconds 150',
                '[Console]::Beep(770,300)', 'Start-Sleep -Milliseconds 300',
                '[Console]::Beep(380,300)',
              ].join('; '),
              nokia: [
                '[Console]::Beep(659,125)', '[Console]::Beep(587,125)', '[Console]::Beep(370,250)', '[Console]::Beep(415,250)',
                '[Console]::Beep(554,125)', '[Console]::Beep(494,125)', '[Console]::Beep(330,250)', '[Console]::Beep(370,250)',
                '[Console]::Beep(494,125)', '[Console]::Beep(440,125)', '[Console]::Beep(277,250)', '[Console]::Beep(330,250)',
                '[Console]::Beep(440,500)',
              ].join('; '),
            }
            const choice = i || 'tod'
            const script = melodies[choice] ?? melodies.tod
            return `${script}; Write-Output "Melodie fertig!"`
          },
          action: 'read', local: true, longRunning: true,
          input: { type: 'dropdown', options: ['tod', 'march', 'mario', 'nokia'] },
          templates: [
            { label: '🎶 Spiel mir das Lied vom Tod', value: 'tod' },
            { label: '⚔️ Imperial March', value: 'march' },
            { label: '🍄 Super Mario', value: 'mario' },
            { label: '📱 Nokia Klingelton', value: 'nokia' },
          ],
        },
        // ── Beep: REMOTE (ScheduledTask + Script-Datei) ───────────────────
        { id: 'beep-remote', func: '🔔 Beep-Ton auf Ziel-PC abspielen', when: 'Einen einzelnen Ton auf dem Remote-PC hoerbar abspielen',
          buildCmd: (h, i) => {
            const parts = (i || '800|500').split('|')
            const freq = parseInt(parts[0]) || 800
            const dur = parseInt(parts[1]) || 500
            const hSafe = h.replace(/'/g, "''")
            return [
              `try {`,
              ...getUserDetectionPS(hSafe).map(l => `  ${l}`),
              `  Invoke-Command -ComputerName '${hSafe}' -ScriptBlock {`,
              `    param($usr, $f, $d)`,
              `    $path = 'C:\\Temp\\it_beep.ps1'`,
              `    if (-not (Test-Path 'C:\\Temp')) { New-Item -Path 'C:\\Temp' -ItemType Directory -Force | Out-Null }`,
              `    Set-Content -Path $path -Value "[Console]::Beep($f,$d)" -Force -Encoding UTF8`,
              `    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-WindowStyle Hidden -ExecutionPolicy Bypass -File C:\\Temp\\it_beep.ps1'`,
              `    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2)`,
              `    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries`,
              `    Register-ScheduledTask -TaskName 'IT_Beep' -Action $action -Trigger $trigger -User $usr -Settings $settings -Force | Out-Null`,
              `    Start-ScheduledTask -TaskName 'IT_Beep'`,
              `    Start-Sleep -Seconds 3`,
              `    Unregister-ScheduledTask -TaskName 'IT_Beep' -Confirm:$false -EA SilentlyContinue`,
              `    Remove-Item $path -Force -EA SilentlyContinue`,
              `  } -ArgumentList $user,${freq},${dur} -EA Stop`,
              `  @{Ergebnis='Ton abgespielt!';Frequenz='${freq} Hz';Dauer='${dur} ms';Ziel='${hSafe}'} | ConvertTo-Json -Compress`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n')
          },
          action: 'write',
          input: { type: 'text', placeholder: 'Frequenz|Dauer z.B. 800|500' },
          templates: [
            { label: 'Tief (300 Hz)', value: '300|400' },
            { label: 'Normal (800 Hz)', value: '800|500' },
            { label: 'Hoch (1500 Hz)', value: '1500|300' },
            { label: 'Alarm! (2000 Hz)', value: '2000|1000' },
          ],
        },
        // ── Beep: LOKAL (direkt, kein ScheduledTask noetig) ───────────────
        { id: 'beep-lokal', func: '🔔 Beep-Ton abspielen (lokal)', when: 'Einen einzelnen Ton auf DEINEM PC abspielen',
          buildCmd: (_h, i) => {
            const parts = (i || '800|500').split('|')
            const freq = parseInt(parts[0]) || 800
            const dur = parseInt(parts[1]) || 500
            return `[Console]::Beep(${freq},${dur}); Write-Output (@{Ergebnis='Ton abgespielt!';Frequenz='${freq} Hz';Dauer='${dur} ms'} | ConvertTo-Json -Compress)`
          },
          action: 'read', local: true,
          input: { type: 'text', placeholder: 'Frequenz|Dauer z.B. 800|500' },
          templates: [
            { label: 'Tief (300 Hz)', value: '300|400' },
            { label: 'Normal (800 Hz)', value: '800|500' },
            { label: 'Hoch (1500 Hz)', value: '1500|300' },
            { label: 'Alarm! (2000 Hz)', value: '2000|1000' },
          ],
        },
      ],
    },
  ]
}

import { buildExtraCategories } from './remoteCommandsExtra'

export const CATEGORIES = [...buildCategories(), ...buildExtraCategories()]
