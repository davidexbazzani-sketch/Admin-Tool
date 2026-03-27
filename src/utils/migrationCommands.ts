// ── PC Migration PowerShell Command Builders ──────────────────────────────
// All functions return a string that is passed to api().runPowerShell(cmd, timeout)

// ── Helpers ────────────────────────────────────────────────────────────────

function esc(s: string) { return s.replace(/'/g, "''") }

/** Convert local Windows path to UNC admin share path */
export function localToUNC(hostname: string, localPath: string): string {
  // C:\Users\... → \\hostname\C$\Users\...
  return `\\\\${hostname}\\${localPath[0]}$${localPath.slice(2)}`
}

export function parseRobocopyResult(stdout: string): { filesCopied: number; bytesCopied: number; isError: boolean } {
  try {
    const parsed = JSON.parse(stdout)
    return {
      filesCopied: Number(parsed.filesCopied ?? 0),
      bytesCopied: Number(parsed.bytesCopied ?? 0),
      isError: Number(parsed.exitCode ?? 0) >= 8,
    }
  } catch {
    return { filesCopied: 0, bytesCopied: 0, isError: true }
  }
}

export function parseWingetExport(rawJson: string): Set<string> {
  const ids = new Set<string>()
  try {
    const data = JSON.parse(rawJson)
    for (const src of (data.Sources ?? [])) {
      for (const pkg of (src.Packages ?? [])) {
        if (pkg.PackageIdentifier) ids.add(pkg.PackageIdentifier as string)
      }
    }
  } catch { /* ignore */ }
  return ids
}

/** Simple heuristic: check if any segment of a winget ID appears in the display name */
export function matchWingetId(displayName: string, wingetIds: Set<string>): string | undefined {
  const nameLower = displayName.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const id of wingetIds) {
    const segments = id.split('.').map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ''))
    if (segments.some(s => s.length > 3 && nameLower.includes(s))) return id
    // Also try full name match
    const idFull = segments.join('').toLowerCase()
    if (idFull.length > 4 && nameLower.includes(idFull)) return id
  }
  return undefined
}

const SYSTEM_PATTERNS = [
  /Microsoft Visual C\+\+/i, /Microsoft \.NET/i, /Microsoft Edge/i,
  /Microsoft OneDrive/i, /Windows SDK/i, /Hotfix for/i,
  /Security Update/i, /Update for Windows/i, /Windows Malicious/i,
  /Microsoft Office/i, /Microsoft 365/i, /Microsoft Teams/i,
]
export function isSystemComponent(name: string): boolean {
  return SYSTEM_PATTERNS.some(p => p.test(name))
}

// ── Connectivity ───────────────────────────────────────────────────────────

export function psCheckOnline(hostname: string): string {
  return `(Test-Connection -ComputerName '${esc(hostname)}' -Count 2 -Quiet).ToString()`
}

export function psEnsureWinRM(hostname: string): string {
  const h = esc(hostname)
  return `
try {
  Test-WSMan -ComputerName '${h}' -EA Stop | Out-Null
  Write-Output 'WINRM_OK'
} catch {
  try {
    $svc = Get-WmiObject -Class Win32_Service -ComputerName '${h}' -Filter "Name='WinRM'" -EA Stop
    $svc.StartService() | Out-Null
    Start-Sleep -Seconds 4
    Invoke-WmiMethod -ComputerName '${h}' -Namespace root\\cimv2 -Class Win32_Process -Name Create -ArgumentList "netsh advfirewall firewall set rule name='Windows Remote Management (HTTP-In)' new enable=yes" -EA SilentlyContinue | Out-Null
    Start-Sleep -Seconds 3
    Test-WSMan -ComputerName '${h}' -EA Stop | Out-Null
    Write-Output 'WINRM_ENABLED'
  } catch {
    Write-Output "ERR:$($_.Exception.Message)"
  }
}`.trim()
}

export function psGetDeviceInfo(hostname: string): string {
  const h = esc(hostname)
  return `
try {
  $r = Invoke-Command -ComputerName '${h}' -ScriptBlock {
    $cs = Get-CimInstance Win32_ComputerSystem
    $os = Get-CimInstance Win32_OperatingSystem
    $ver = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion' -EA SilentlyContinue).DisplayVersion
    @{
      hostname  = $env:COMPUTERNAME
      model     = ("$($cs.Manufacturer) $($cs.Model)").Trim()
      os        = ("$($os.Caption) $ver").Trim()
      loggedUser = $cs.UserName
    }
  } -EA Stop
  $r | ConvertTo-Json -Compress
} catch {
  Write-Output "ERR:$($_.Exception.Message)"
}`.trim()
}

// ── Analysis ───────────────────────────────────────────────────────────────

export function psGetFolderSizes(hostname: string, username: string): string {
  const h = esc(hostname)
  const u = esc(username)
  return `
try {
  $r = Invoke-Command -ComputerName '${h}' -ScriptBlock {
    $u = '${u}'
    $base = "C:\\Users\\$u"
    $dirs = @(
      @{label='Desktop';    localPath="$base\\Desktop"},
      @{label='Dokumente';  localPath="$base\\Documents"},
      @{label='Downloads';  localPath="$base\\Downloads"},
      @{label='Bilder';     localPath="$base\\Pictures"},
      @{label='Videos';     localPath="$base\\Videos"},
      @{label='Musik';      localPath="$base\\Music"},
      @{label='Favoriten';  localPath="$base\\Favorites"}
    )
    $dirs | ForEach-Object {
      $ex = Test-Path $_.localPath
      $sz = 0; $fc = 0
      if ($ex) {
        $items = Get-ChildItem $_.localPath -Recurse -Force -EA SilentlyContinue | Where-Object {!$_.PSIsContainer}
        $sz = [math]::Round(($items | Measure-Object Length -Sum -EA SilentlyContinue).Sum / 1MB, 1)
        $fc = @($items).Count
      }
      [PSCustomObject]@{label=$_.label; localPath=$_.localPath; sizeMb=$sz; fileCount=$fc; exists=$ex}
    }
  } -EA Stop
  $r | ConvertTo-Json -Compress -Depth 3
} catch {
  Write-Output "ERR:$($_.Exception.Message)"
}`.trim()
}

export function psGetSoftwareList(hostname: string): string {
  const h = esc(hostname)
  return `
try {
  $r = Invoke-Command -ComputerName '${h}' -ScriptBlock {
    $paths = @(
      'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
    )
    Get-ItemProperty $paths -EA SilentlyContinue |
      Where-Object { $_.DisplayName -and $_.DisplayName.Trim() -ne '' } |
      Select-Object DisplayName, DisplayVersion, Publisher |
      Sort-Object DisplayName |
      Group-Object DisplayName | ForEach-Object { $_.Group | Select-Object -First 1 }
  } -EA Stop
  $r | ConvertTo-Json -Compress -Depth 2
} catch {
  Write-Output "ERR:$($_.Exception.Message)"
}`.trim()
}

export function psGetWingetPackages(hostname: string): string {
  const h = esc(hostname)
  return `
try {
  $r = Invoke-Command -ComputerName '${h}' -ScriptBlock {
    $tmp = "$env:TEMP\\mig_wg_$((Get-Random)).json"
    winget export -o $tmp --accept-source-agreements 2>&1 | Out-Null
    if (Test-Path $tmp) {
      $c = Get-Content $tmp -Raw
      Remove-Item $tmp -Force -EA SilentlyContinue
      $c
    } else { '{"Sources":[]}' }
  } -EA Stop
  Write-Output $r
} catch {
  Write-Output '{"Sources":[]}'
}`.trim()
}

export function psGetNetworkDrives(hostname: string): string {
  const h = esc(hostname)
  return `
try {
  $r = Invoke-Command -ComputerName '${h}' -ScriptBlock {
    Get-CimInstance Win32_MappedLogicalDisk -EA SilentlyContinue |
      Select-Object @{N='letter';E={$_.Name.TrimEnd(':')}}, @{N='uncPath';E={$_.ProviderName}}
  } -EA Stop
  $r | ConvertTo-Json -Compress
} catch {
  Write-Output '[]'
}`.trim()
}

export function psGetPrinters(hostname: string): string {
  const h = esc(hostname)
  return `
try {
  $r = Invoke-Command -ComputerName '${h}' -ScriptBlock {
    Get-Printer -EA SilentlyContinue |
      Select-Object Name, PortName, DriverName,
        @{N='isNetwork';E={$_.Type -eq 'Connection' -or $_.PortName -like 'IP_*' -or $_.PortName -like '\\\\*'}}
  } -EA Stop
  $r | ConvertTo-Json -Compress
} catch {
  Write-Output '[]'
}`.trim()
}

export function psCheckSettingsAvailability(hostname: string, username: string): string {
  const h = esc(hostname)
  const u = esc(username)
  return `
try {
  Invoke-Command -ComputerName '${h}' -ScriptBlock {
    $u = '${u}'
    $base = "C:\\Users\\$u"
    [PSCustomObject]@{
      outlookSignatures = (Test-Path "$base\\AppData\\Roaming\\Microsoft\\Signatures")
      edgeBookmarks     = (Test-Path "$base\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Bookmarks")
      chromeBookmarks   = (Test-Path "$base\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Bookmarks")
      wlanProfiles      = ((netsh wlan show profiles 2>$null) -match 'Profil' | Measure-Object).Count -gt 0
      quickAccess       = $true
      envVars           = $true
    }
  } -EA Stop | ConvertTo-Json -Compress
} catch {
  Write-Output "ERR:$($_.Exception.Message)"
}`.trim()
}

// ── Migration: File Copy ───────────────────────────────────────────────────

export function psRobocopyFolder(params: {
  srcPc: string; dstPc: string; localPath: string
  conflictMode: 'skip' | 'overwrite' | 'rename'
  excludeTemp: boolean
}): string {
  const srcUNC = esc(localToUNC(params.srcPc, params.localPath))
  const dstUNC = esc(localToUNC(params.dstPc, params.localPath))
  const xo = params.conflictMode === 'skip' ? '/XO ' : ''
  const xf = params.excludeTemp ? '/XF *.tmp *.log *.cache ~$* /XD Temp __pycache__ node_modules .git ' : ''
  return `
$src = '${srcUNC}'
$dst = '${dstUNC}'
if (!(Test-Path $src)) {
  [PSCustomObject]@{exitCode=0; filesCopied=0; bytesCopied=0} | ConvertTo-Json -Compress
} else {
  if (!(Test-Path $dst)) { New-Item -ItemType Directory -Path $dst -Force | Out-Null }
  $out = robocopy $src $dst /E /Z /R:3 /W:5 /MT:8 /NP /NDL /NFL /BYTES ${xo}${xf}2>&1
  $ec = $LASTEXITCODE
  $files = 0; $bytes = 0
  $out | ForEach-Object {
    if ($_ -match 'Files\\s*:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)') { $files = [int]$Matches[4] }
    if ($_ -match 'Bytes\\s*:\\s*([\\d.]+\\s*\\w*)\\s+([\\d.]+\\s*\\w*)\\s+([\\d.]+\\s*\\w*)\\s+([\\d.]+\\s*\\w*)') { }
  }
  $summary = ($out | Select-String 'Files :|Bytes :' | Select-Object -Last 4) -join ' ; '
  [PSCustomObject]@{exitCode=$ec; filesCopied=$files; bytesCopied=$bytes; summary=$summary} | ConvertTo-Json -Compress
}`.trim()
}

// ── Migration: Software ────────────────────────────────────────────────────

export function psInstallWinget(targetPc: string, wingetId: string, silent: boolean): string {
  const h = esc(targetPc)
  const id = esc(wingetId)
  const sFlag = silent ? '--silent ' : ''
  return `
try {
  $r = Invoke-Command -ComputerName '${h}' -ScriptBlock {
    $out = winget install --id '${id}' ${sFlag}--accept-package-agreements --accept-source-agreements 2>&1
    [PSCustomObject]@{exitCode=$LASTEXITCODE; output=($out -join ';') | Select-Object -First 20}
  } -EA Stop
  $r | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{exitCode=1; output=$_.Exception.Message} | ConvertTo-Json -Compress
}`.trim()
}

// ── Migration: Network Drives ──────────────────────────────────────────────

export function psMapDrive(targetPc: string, letter: string, uncPath: string): string {
  const h = esc(targetPc)
  const l = esc(letter)
  const p = esc(uncPath)
  return `
try {
  Invoke-Command -ComputerName '${h}' -ScriptBlock {
    param($ltr, $path)
    $r = net use "${ltr}:" "$path" /persistent:yes 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($r -join ' ') }
    Write-Output 'OK'
  } -ArgumentList '${l}','${p}' -EA Stop
} catch {
  Write-Output "ERR:$($_.Exception.Message)"
}`.trim()
}

// ── Migration: Printers ────────────────────────────────────────────────────

export function psAddNetworkPrinter(targetPc: string, printerName: string): string {
  const h = esc(targetPc)
  const n = esc(printerName)
  return `
try {
  Invoke-Command -ComputerName '${h}' -ScriptBlock {
    Add-Printer -ConnectionName '${n}' -EA Stop
    Write-Output 'OK'
  } -EA Stop
} catch {
  Write-Output "ERR:$($_.Exception.Message)"
}`.trim()
}

// ── Migration: Settings ────────────────────────────────────────────────────

export function psCopySettingFolder(srcPc: string, dstPc: string, localPath: string): string {
  const srcUNC = esc(localToUNC(srcPc, localPath))
  const dstUNC = esc(localToUNC(dstPc, localPath))
  return `
$src = '${srcUNC}'
$dst = '${dstUNC}'
if (Test-Path $src) {
  if (!(Test-Path $dst)) { New-Item -ItemType Directory -Path $dst -Force | Out-Null }
  $r = robocopy $src $dst /E /R:2 /W:3 /NP /NDL /NFL 2>&1
  $ec = $LASTEXITCODE
  if ($ec -ge 8) { Write-Output "ERR:Robocopy exit $ec" } else { Write-Output 'OK' }
} else {
  Write-Output 'SKIPPED:Nicht vorhanden'
}`.trim()
}

export function psCopySettingFile(srcPc: string, dstPc: string, localPath: string): string {
  const srcUNC = esc(localToUNC(srcPc, localPath))
  const dstUNC = esc(localToUNC(dstPc, localPath))
  return `
$src = '${srcUNC}'
$dst = '${dstUNC}'
if (Test-Path $src) {
  $dir = Split-Path $dst -Parent
  if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Copy-Item $src $dst -Force -EA Stop
  Write-Output 'OK'
} else {
  Write-Output 'SKIPPED:Nicht vorhanden'
}`.trim()
}

export function psTransferWlanProfiles(srcPc: string, dstPc: string): string {
  const sh = esc(srcPc)
  const dh = esc(dstPc)
  return `
try {
  # Export from source
  $profiles = Invoke-Command -ComputerName '${sh}' -ScriptBlock {
    $dir = "C:\\Temp\\mig_wlan_$(Get-Random)"
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    netsh wlan export profile key=clear folder=$dir 2>&1 | Out-Null
    $r = Get-ChildItem $dir -Filter '*.xml' | ForEach-Object {
      @{name=$_.BaseName; content=(Get-Content $_.FullName -Raw)}
    }
    Remove-Item $dir -Recurse -Force -EA SilentlyContinue
    $r
  } -EA Stop

  if (!$profiles) { Write-Output 'SKIPPED:Keine Profile'; return }

  # Import on target
  Invoke-Command -ComputerName '${dh}' -ScriptBlock {
    param($profs)
    $dir = "C:\\Temp\\mig_wlan_$(Get-Random)"
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    foreach ($p in $profs) {
      $f = "$dir\\$($p.name).xml"
      Set-Content -Path $f -Value $p.content -Encoding UTF8
      netsh wlan add profile filename=$f 2>&1 | Out-Null
    }
    Remove-Item $dir -Recurse -Force -EA SilentlyContinue
    Write-Output 'OK'
  } -ArgumentList (,$profiles) -EA Stop
} catch {
  Write-Output "ERR:$($_.Exception.Message)"
}`.trim()
}

export function psTransferEnvVars(srcPc: string, dstPc: string, username: string): string {
  const sh = esc(srcPc)
  const dh = esc(dstPc)
  const u = esc(username)
  return `
try {
  $vars = Invoke-Command -ComputerName '${sh}' -ScriptBlock {
    $u = '${u}'
    $sids = (Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList' -EA SilentlyContinue).PSChildName
    $sid = $sids | Where-Object {
      (Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$_" -EA SilentlyContinue).ProfileImagePath -like "*\\$u"
    } | Select-Object -First 1
    if ($sid) {
      Get-ItemProperty "registry::HKU\\$sid\\Environment" -EA SilentlyContinue |
        Select-Object * -ExcludeProperty PS*
    }
  } -EA Stop

  if (!$vars) { Write-Output 'SKIPPED:Keine Umgebungsvariablen'; return }

  Invoke-Command -ComputerName '${dh}' -ScriptBlock {
    param($envObj, $u2)
    $sids = (Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList' -EA SilentlyContinue).PSChildName
    $sid = $sids | Where-Object {
      (Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$_" -EA SilentlyContinue).ProfileImagePath -like "*\\$u2"
    } | Select-Object -First 1
    if ($sid) {
      $regPath = "registry::HKU\\$sid\\Environment"
      if (!(Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }
      $envObj.PSObject.Properties | Where-Object {$_.MemberType -eq 'NoteProperty'} | ForEach-Object {
        Set-ItemProperty -Path $regPath -Name $_.Name -Value $_.Value -EA SilentlyContinue
      }
    }
    Write-Output 'OK'
  } -ArgumentList $vars,'${u}' -EA Stop
} catch {
  Write-Output "ERR:$($_.Exception.Message)"
}`.trim()
}
