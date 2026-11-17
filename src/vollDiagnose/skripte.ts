// ── PC-Volldiagnose: PowerShell der Lesestufen (Stufe 0 + Rundumscan) ─────────
// ALLES HIER LIEST NUR. Kein Set-/New-/Remove-/Start-/Stop-, keine Dateien, keine Registry-
// Änderungen, keine Dienste. Der Nur-lesen-Wächter (.tmp-test/vd/nurlesen_test.ts) prüft das.
// Ausgeführt per Invoke-Command (serverZustand.fern: $P = Nutzlast). Letzte Ausgabezeile = JSON.

/**
 * Hinter jedes ConvertTo-Json: JSON nur aus druckbarem ASCII, alles andere als \uXXXX.
 * Grund: Ereignistexte enthalten „typografische“ Anführungszeichen und Umlaute. Läuft die Konsole
 * nicht in UTF-8 (das Umstellen kann ohne Konsole scheitern), wird aus “ ein " und das JSON bricht.
 */
export const NUR_ASCII = String.raw`| ForEach-Object { [regex]::Replace([string]$_, '[^\x20-\x7E]', { param($m) '\u{0:x4}' -f [int][char]$m.Value }) }`

/** Stufe 0: Betriebssystem, Server oder PC, Benutzer, Sitzung, Modell. */
export const ZIEL_PS = String.raw`
$o = [ordered]@{ ok = $true }
try { $os = Get-CimInstance Win32_OperatingSystem -EA Stop; $o.produktTyp = [int]$os.ProductType; $o.os = [string]$os.Caption; $o.build = [string]$os.BuildNumber; $o.boot = $os.LastBootUpTime.ToUniversalTime().ToString('o') } catch {}
try { $cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -EA Stop; if ($cv.UBR -ne $null) { $o.build = [string]$cv.CurrentBuild + '.' + [string]$cv.UBR } } catch {}
try { $cs = Get-CimInstance Win32_ComputerSystem -EA Stop; $o.benutzer = [string]$cs.UserName; $o.modell = ([string]$cs.Manufacturer + ' ' + [string]$cs.Model).Trim(); $o.domaene = [string]$cs.Domain } catch {}
if (-not $o.benutzer) { try { $ex = Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -EA Stop | Select-Object -First 1; if ($ex) { $ow = Invoke-CimMethod -InputObject $ex -MethodName GetOwner; if ($ow.User) { $o.benutzer = [string]$ow.Domain + '\' + [string]$ow.User } } } catch {} }
try { $o.seriennummer = [string](Get-CimInstance Win32_BIOS -EA Stop).SerialNumber } catch {}
$o.gesperrt = [bool](Get-Process -Name LogonUI -EA SilentlyContinue)
try { $q = @(quser 2>$null | Select-Object -Skip 1); $akt = $q | Where-Object { $_ -match '(Aktiv|Active)' } | Select-Object -First 1; if ($akt) { $o.sitzung = $(if ($akt -match 'rdp-') { 'RDP' } else { 'Konsole' }) } } catch {}
$o | ConvertTo-Json -Compress ${NUR_ASCII}
`

/**
 * Ereignisprotokolle der letzten $P.tage Tage, schon am Gerät zusammengezählt (wie die Proaktive
 * Fehlersuche): je Protokoll/Quelle/Kennung EINE Zeile. Dazu Absturz-Details (Event 1000),
 * WER-Berichte, Bluescreen-Codes und Kernel-Power-41-Details für die Vertiefungen.
 */
export const EREIGNIS_PS = String.raw`
$tage = [int]$P.tage; if ($tage -lt 1 -or $tage -gt 60) { $tage = 7 }
$ms = [int64]$tage * 86400000
$jetzt = Get-Date; $grenze = $jetzt.AddDays(-$tage)
$T = [char]9
function Iso($d) { try { $d.ToUniversalTime().ToString('o') } catch { '' } }
function Werte($e) { try { @($e.Properties | ForEach-Object { $_.Value }) } catch { @() } }
$g = @{}
function Merke($e, [string]$log, [string]$app, [string]$fest) {
  $k = $log + $T + [string]$e.ProviderName + $T + [string]$e.Id + $T + $app
  $x = $g[$k]
  if (-not $x) {
    $txt = $fest
    if (-not $txt) { try { $txt = [string]$e.Message } catch {} }
    $txt = (($txt -replace '\s+', ' ').Trim()); if ($txt.Length -gt 300) { $txt = $txt.Substring(0, 300) }
    $x = @{ n = 0; a = $e.TimeCreated; z = $e.TimeCreated; t = $txt; lv = [int]$e.Level }
    $g[$k] = $x
  }
  $x.n++
  if ($e.TimeCreated -gt $x.z) { $x.z = $e.TimeCreated }
  if ($e.TimeCreated -lt $x.a) { $x.a = $e.TimeCreated }
}
# Datenträger-Ereignisse je Gerät getrennt zählen (USB-Stick ≠ eingebaute Platte): Gerät als Zusatz „@…“
function Geraet($e) {
  if ([string]$e.ProviderName -notmatch '^(disk|Ntfs|Microsoft-Windows-Ntfs|volmgr|stornvme|storahci|partmgr)$') { return '' }
  $m = ''; try { $m = [string]$e.Message } catch {}
  $x = [regex]::Match($m, '\\Device\\Harddisk\d+\\DR\d+|\\Device\\Harddisk\d+|\\Device\\HarddiskVolume\d+|(?:Volume-?ID|\b[Vv]olume|Laufwerk)\s*:?\s*["„]?[A-Za-z]:')
  if ($x.Success) { return '@' + $x.Value }
  return ''
}
$crashes = New-Object System.Collections.Generic.List[object]
$xpF ='*[System[(Level=1 or Level=2) and TimeCreated[timediff(@SystemTime) <= ' + $ms + ']]]'
foreach ($lg in @(Get-WinEvent -ListLog * -EA SilentlyContinue | Where-Object { $_.RecordCount -gt 0 -and $_.LastWriteTime -ge $grenze -and $_.LogName -ne 'Security' })) {
  foreach ($e in @(Get-WinEvent -LogName $lg.LogName -FilterXPath $xpF -MaxEvents 400 -EA SilentlyContinue)) {
    $app = ''
    if ($e.ProviderName -eq 'Application Error' -or $e.ProviderName -eq 'Application Hang') {
      $p = Werte $e
      if ($p.Count) { $app = [string]$p[0]; if ($e.Id -eq 1000 -and $p.Count -gt 6) { $app = $app + '|' + [string]$p[3] + '|' + [string]$p[6] } }
      if ($e.Id -eq 1000 -and $crashes.Count -lt 300 -and $p.Count -gt 6) {
        $code = ''; try { $code = ('0x{0:x8}' -f [uint32]$p[6]) } catch { $code = [string]$p[6] }
        $crashes.Add([pscustomobject]@{ app = [string]$p[0]; appVer = [string]$p[1]; modul = [string]$p[3]; modVer = [string]$p[4]; code = $code; offset = $(if ($p.Count -gt 7) { [string]$p[7] } else { '' }); appPfad = $(if ($p.Count -gt 10) { [string]$p[10] } else { '' }); modPfad = $(if ($p.Count -gt 11) { [string]$p[11] } else { '' }); t = (Iso $e.TimeCreated) })
      }
    } elseif ($e.ProviderName -eq '.NET Runtime') {
      try { $m = [regex]::Match([string]$e.Message, '(?:Anwendung|Application):\s*(\S+\.exe)'); if ($m.Success) { $app = $m.Groups[1].Value } } catch {}
    } else { $app = Geraet $e }
    Merke $e ([string]$lg.LogName) $app ''
  }
}
# Warnungen, die auf Hardware, Treiber, Hitze, Zeit oder Platz hinweisen (sonst zählen nur Fehler)
$prov = @('Display','disk','Ntfs','Microsoft-Windows-Ntfs','volmgr','stornvme','storahci','volsnap','Microsoft-Windows-WHEA-Logger','Microsoft-Windows-Resource-Exhaustion-Detector','Microsoft-Windows-Kernel-Processor-Power','Microsoft-Windows-Time-Service','Microsoft-Windows-DNS-Client','Microsoft-Windows-TPM-WMI','Microsoft-Windows-Kernel-PnP','Tcpip','NETLOGON')
$xpW = '*[System[Provider[' + (($prov | ForEach-Object { "@Name='" + $_ + "'" }) -join ' or ') + '] and Level=3 and TimeCreated[timediff(@SystemTime) <= ' + $ms + ']]]'
foreach ($e in @(Get-WinEvent -LogName 'System' -FilterXPath $xpW -MaxEvents 400 -EA SilentlyContinue)) { Merke $e 'System' (Geraet $e) '' }
# Defender (Funde, Signaturen) — teils nur Warnung
$xpD = '*[System[(EventID=1116 or EventID=1117 or EventID=2001 or EventID=2003 or EventID=2004 or EventID=2006) and TimeCreated[timediff(@SystemTime) <= ' + $ms + ']]]'
foreach ($e in @(Get-WinEvent -LogName 'Microsoft-Windows-Windows Defender/Operational' -FilterXPath $xpD -MaxEvents 100 -EA SilentlyContinue)) { if ($e.Level -gt 2) { Merke $e 'Microsoft-Windows-Windows Defender/Operational' '' '' } }
# LiveKernelEvent (Treiber im Betrieb zurückgesetzt) und chkdsk-Ergebnisse sind „Information“.
# Je LiveKernel-Vorfall schreibt Windows ~10 Ereignisse in Sekunden → je Code nur 1 pro 2 Minuten zählen.
$xpI = '*[System[Provider[@Name=''Windows Error Reporting'' or @Name=''Wininit'' or @Name=''Chkdsk''] and (EventID=1001 or EventID=26212 or EventID=26213 or EventID=26214 or EventID=26226) and TimeCreated[timediff(@SystemTime) <= ' + $ms + ']]]'
$lkZuletzt = @{}
foreach ($e in @(Get-WinEvent -LogName 'Application' -FilterXPath $xpI -MaxEvents 300 -EA SilentlyContinue)) {
  $m = ''; try { $m = [string]$e.Message } catch {}
  if ($e.ProviderName -eq 'Windows Error Reporting') {
    if ($m -notmatch 'LiveKernelEvent') { continue }
    $c = [regex]::Match($m, 'P1:\s*([0-9A-Fa-f]+)').Groups[1].Value.ToLower()
    $vor = $lkZuletzt[$c]
    if ($vor -and [math]::Abs(($vor - $e.TimeCreated).TotalSeconds) -lt 120) { continue }
    $lkZuletzt[$c] = $e.TimeCreated
    Merke $e 'Application' ('@LiveKernel ' + $c) ''
    continue
  }
  Merke $e 'Application' '' ''
}
# Fehlermeldungen, die Office dem Benutzer gezeigt hat
$xpO = '*[System[TimeCreated[timediff(@SystemTime) <= ' + $ms + ']]]'
foreach ($e in @(Get-WinEvent -LogName 'OAlerts' -FilterXPath $xpO -MaxEvents 200 -EA SilentlyContinue)) {
  $p = Werte $e; $prog = ''; $meld = ''
  if ($p.Count) { $prog = [string]$p[0] }
  if ($p.Count -gt 1) { $meld = [string]$p[1] }
  if (-not $meld) { continue }
  $kurzM = (($meld -replace '\s+', ' ').Trim()); if ($kurzM.Length -gt 120) { $kurzM = $kurzM.Substring(0, 120) }
  Merke $e 'OAlerts' ($prog + '|' + $kurzM) $meld
}
$gruppen = @(foreach ($k in @($g.Keys | Sort-Object { -[int]$g[$_].n } | Select-Object -First 160)) {
  $x = $g[$k]; $s = $k -split $T
  $s[0] + $T + $s[1] + $T + $s[2] + $T + [string]$x.lv + $T + [string]$x.n + $T + (Iso $x.a) + $T + (Iso $x.z) + $T + $s[3] + $T + [string]$x.t
})
# Bluescreens: Code und Parameter (BugCheck/WER-SystemErrorReporting 1001)
$bugchecks = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 1001; StartTime = $grenze } -MaxEvents 40 -EA SilentlyContinue | Where-Object { $_.ProviderName -match 'BugCheck|WER-SystemErrorReporting' } | ForEach-Object {
  $m = ''; try { $m = (([string]$_.Message) -replace '\s+', ' ').Trim() } catch {}
  [pscustomobject]@{ t = (Iso $_.TimeCreated); text = $(if ($m.Length -gt 400) { $m.Substring(0, 400) } else { $m }) }
})
# Kernel-Power 41: Absturz, Ein/Aus-Taste oder Stromverlust?
$kp = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 41; StartTime = $grenze } -MaxEvents 40 -EA SilentlyContinue | ForEach-Object {
  $d = @{}; try { foreach ($n in ([xml]$_.ToXml()).Event.EventData.Data) { $d[[string]$n.Name] = [string]$n.'#text' } } catch {}
  [pscustomobject]@{ t = (Iso $_.TimeCreated); code = [string]$d['BugcheckCode']; taste = [string]$d['PowerButtonTimestamp']; schlaf = [string]$d['SleepInProgress']; standby = [string]$d['ConnectedStandbyInProgress'] }
})
# WER-Berichte (Faulting Module auch ohne Event 1000)
$wer = @(foreach ($wd in @((Join-Path $env:ProgramData 'Microsoft\Windows\WER\ReportArchive'), (Join-Path $env:ProgramData 'Microsoft\Windows\WER\ReportQueue'))) {
  if (Test-Path -LiteralPath $wd) {
    Get-ChildItem -LiteralPath $wd -Directory -EA SilentlyContinue | Where-Object { $_.LastWriteTime -ge $grenze } | Sort-Object LastWriteTime -Descending | Select-Object -First 30 | ForEach-Object {
      $wf = Join-Path $_.FullName 'Report.wer'
      if (Test-Path -LiteralPath $wf) {
        $wapp = ''; $wmod = ''; $wcode = ''; $wtyp = ''
        foreach ($wl in @(Get-Content -LiteralPath $wf -EA SilentlyContinue)) {
          if ($wl -match '^EventType=(.+)') { $wtyp = $Matches[1] } elseif ($wl -match '^Sig\[0\]\.Value=(.+)') { $wapp = $Matches[1] } elseif ($wl -match '^Sig\[3\]\.Value=(.+)') { $wmod = $Matches[1] } elseif ($wl -match '^Sig\[6\]\.Value=(.+)') { $wcode = $Matches[1] }
        }
        if ($wapp) { [pscustomobject]@{ typ = $wtyp; app = $wapp; modul = $wmod; code = $wcode; t = (Iso $_.LastWriteTime) } }
      }
    }
  }
})
# Welche Datenträger gibt es jetzt? (Zuordnung der Ereignisse: eingebaut / USB / nicht mehr angeschlossen)
$ger = [ordered]@{ disks = @(); festeLw = @(); wechselLw = @(); vols = @() }
try { $ger.sysDisk = [string](Get-Partition -DriveLetter (([string]$env:SystemDrive).TrimEnd(':')) -EA Stop).DiskNumber } catch {}
try { $ger.disks = @(Get-Disk -EA Stop | ForEach-Object { [pscustomobject]@{ nr = [string]$_.Number; bus = [string]$_.BusType } }) } catch {}
try { $vl = @(Get-Volume -EA Stop | Where-Object { $_.DriveLetter }); $ger.festeLw = @($vl | Where-Object { [string]$_.DriveType -eq 'Fixed' } | ForEach-Object { [string]$_.DriveLetter }); $ger.wechselLw = @($vl | Where-Object { [string]$_.DriveType -eq 'Removable' } | ForEach-Object { [string]$_.DriveLetter }) } catch {}
try { $ger.vols = @(& (Join-Path $env:SystemRoot 'System32\fltmc.exe') volumes 2>$null | ForEach-Object { if ([string]$_ -match '^\s*([A-Za-z]):\s+(\\Device\\\S+)') { [pscustomobject]@{ lw = $Matches[1].ToUpper(); dev = $Matches[2] } } }) } catch {}
@{ ok = $true; tage = $tage; gruppen = @($gruppen); crashes = $crashes.ToArray(); bugchecks = @($bugchecks); kp41 = @($kp); wer = @($wer); geraete = $ger } | ConvertTo-Json -Depth 4 -Compress ${NUR_ASCII}
`

/** Windows-Integrität (schnell): CheckHealth, ausstehende Wartung, CBS-Spuren, Update-Fehler, Wartungsdienste, Platz. */
export const INTEGRITAET_PS = String.raw`
$o = [ordered]@{ ok = $true }
function Iso($d) { try { $d.ToUniversalTime().ToString('o') } catch { '' } }
$exe = Join-Path $env:SystemRoot 'System32\dism.exe'
if (@(Get-Process -Name dism -EA SilentlyContinue).Count -gt 0) { $o.check = @('@@LAEUFT@@') }
else {
  $roh = @(& $exe /English /Online /Cleanup-Image /CheckHealth 2>&1 | ForEach-Object { [string]$_ })
  $o.checkCode = $LASTEXITCODE
  $o.check = @(@(foreach ($z in $roh) { $t = @(($z -split "\r") | Where-Object { $_.Trim() }); if ($t.Count) { $t[-1] } }) | Where-Object { $_ -notmatch '^\s*\[[=\s]*\d{1,3}([.,]\d)?\s*%[=\s]*\]\s*$' } | Select-Object -Last 20)
}
$cbs = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing'
$o.rebootPending = [bool](Test-Path ($cbs + '\RebootPending'))
$o.packagesPending = [bool](Test-Path ($cbs + '\PackagesPending'))
$o.wuReboot = [bool](Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired')
$o.pendingXml = [bool](Test-Path -LiteralPath (Join-Path $env:SystemRoot 'WinSxS\pending.xml'))
try { $o.boot = (Get-CimInstance Win32_OperatingSystem -EA Stop).LastBootUpTime.ToUniversalTime().ToString('o') } catch {}
# CBS.log: Korruptionsspuren der letzten 30 Tage (nur lesen, letzte 30 MB)
$o.cbsSpuren = 0; $o.cbsZeilen = @(); $o.cbsZusammenfassung = @()
try {
  $pf = Join-Path $env:SystemRoot 'Logs\CBS\CBS.log'
  if (Test-Path -LiteralPath $pf) {
    $fs = [IO.File]::Open($pf, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try {
      if ($fs.Length -gt 31457280) { [void]$fs.Seek($fs.Length - 31457280, [IO.SeekOrigin]::Begin) }
      $txt = (New-Object IO.StreamReader($fs)).ReadToEnd()
    } finally { $fs.Dispose() }
    $ab = (Get-Date).AddDays(-30).ToString('yyyy-MM-dd HH:mm:ss')
    $treffer = New-Object System.Collections.Generic.List[string]
    $zus = New-Object System.Collections.Generic.List[string]
    foreach ($z in ($txt -split "\r?\n")) {
      if ($z.Length -lt 19 -or [string]::CompareOrdinal($z.Substring(0, 19), $ab) -lt 0) { continue }
      if ($z -match '\(p\)\s+(CSI|CBS)|Corrupt|Corruption:\s*[1-9]') { if ($treffer.Count -lt 40) { $treffer.Add($z) }; $o.cbsSpuren++ }
      if ($z -match 'Total Detected Corruption|Total Repaired Corruption|Checking System Update Readiness') { $zus.Add($z); if ($zus.Count -gt 12) { $zus.RemoveAt(0) } }
    }
    $o.cbsZeilen = $treffer.ToArray(); $o.cbsZusammenfassung = $zus.ToArray()
  }
} catch { $o.cbsFehler = [string]$_.Exception.Message }
# Windows Update: fehlgeschlagene Installationen/Downloads (30 Tage). Titel, Update- und Dienst-Kennung
# aus den Ereignisdaten (sprachunabhängig): Store-Apps (eigener Dienst) und später doch installierte
# Updates sind kein Update-Problem — das sortiert die Auswertung aus.
function WuDaten($ev) { $d = @{}; try { foreach ($x in ([xml]$ev.ToXml()).Event.EventData.Data) { $d[[string]$x.Name] = [string]$x.'#text' } } catch {}; $d }
$o.wuFehler = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WindowsUpdateClient'; Id = 20, 25, 31; StartTime = (Get-Date).AddDays(-30) } -MaxEvents 80 -EA SilentlyContinue | ForEach-Object {
  $m = ''; try { $m = (([string]$_.Message) -replace '\s+', ' ').Trim() } catch {}
  $wd = WuDaten $_; $ti = [string]$wd['updateTitle']; if ($ti.Length -gt 140) { $ti = $ti.Substring(0, 140) }
  $code = [string]$wd['errorCode']; if ($code -notmatch '^0x[0-9a-fA-F]{8}$') { $code = [regex]::Match($m, '0x[0-9a-fA-F]{8}').Value }
  [pscustomobject]@{ t = (Iso $_.TimeCreated); id = $_.Id; code = $code.ToLower(); kb = [regex]::Match($ti + ' ' + $m, 'KB\d{6,8}').Value; titel = $ti; guid = ([string]$wd['updateGuid']).Trim('{}').ToLower(); dienst = ([string]$wd['serviceGuid']).Trim('{}').ToLower(); text = $(if ($m.Length -gt 220) { $m.Substring(0, 220) } else { $m }) }
})
# Spätere Erfolge derselben Updates (Ereignis 19) — nur die, die oben fehlgeschlagen sind
$fg = @{}; foreach ($f in $o.wuFehler) { if ($f.guid) { $fg[$f.guid] = 1 }; if ($f.titel) { $fg[$f.titel] = 1 } }
$o.wuOk = @(if ($fg.Count) { Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WindowsUpdateClient'; Id = 19; StartTime = (Get-Date).AddDays(-30) } -MaxEvents 300 -EA SilentlyContinue | ForEach-Object {
  $wd = WuDaten $_; $ti = [string]$wd['updateTitle']; if ($ti.Length -gt 140) { $ti = $ti.Substring(0, 140) }; $gu = ([string]$wd['updateGuid']).Trim('{}').ToLower()
  if (($gu -and $fg.ContainsKey($gu)) -or ($ti -and $fg.ContainsKey($ti))) { [pscustomobject]@{ t = (Iso $_.TimeCreated); titel = $ti; guid = $gu } }
} })
# Setup-Protokoll (Wartungsstapel/CBS) — Fehler 30 Tage
$o.setupFehler = @(Get-WinEvent -FilterHashtable @{ LogName = 'Setup'; Level = 1, 2; StartTime = (Get-Date).AddDays(-30) } -MaxEvents 40 -EA SilentlyContinue | ForEach-Object {
  $m = ''; try { $m = (([string]$_.Message) -replace '\s+', ' ').Trim() } catch {}
  [pscustomobject]@{ t = (Iso $_.TimeCreated); id = $_.Id; code = [regex]::Match($m, '0x[0-9a-fA-F]{8}').Value.ToLower(); kb = [regex]::Match($m, 'KB\d{6,8}').Value; text = $(if ($m.Length -gt 220) { $m.Substring(0, 220) } else { $m }) }
})
# Wartungsdienste
$o.dienste = @(foreach ($n in 'wuauserv', 'BITS', 'CryptSvc', 'TrustedInstaller', 'msiserver', 'UsoSvc') { $s = Get-Service -Name $n -EA SilentlyContinue; if ($s) { [pscustomobject]@{ n = $s.Name; d = $s.DisplayName; st = [string]$s.StartType; s = [string]$s.Status } } })
# Platz auf dem Systemlaufwerk + Update-Downloads
try { $lw = [string]$env:SystemDrive; $d = Get-CimInstance Win32_LogicalDisk -Filter ("DeviceID='" + $lw + "'") -EA Stop; $o.lw = $lw; $o.freiGB = [math]::Round($d.FreeSpace / 1GB, 1); $o.groesseGB = [math]::Round($d.Size / 1GB, 1) } catch {}
try { $sum = 0; Get-ChildItem -LiteralPath (Join-Path $env:SystemRoot 'SoftwareDistribution\Download') -Recurse -Force -File -EA SilentlyContinue | ForEach-Object { $sum += $_.Length }; $o.sdDownloadGB = [math]::Round($sum / 1GB, 2) } catch {}
$o | ConvertTo-Json -Depth 4 -Compress ${NUR_ASCII}
`

/** Zusatzprüfungen aus der alten Volldiagnose: gestoppte Auto-Dienste, fehlerhafte Aufgaben, fremde Shell-Erweiterungen. */
export const ZUSATZ_PS = String.raw`
$o = [ordered]@{ ok = $true }
$o.dienste = @(Get-CimInstance Win32_Service -Filter "StartMode='Auto' AND State<>'Running'" -EA SilentlyContinue | ForEach-Object {
  $verz = $false; try { $verz = [bool]((Get-ItemProperty ('HKLM:\SYSTEM\CurrentControlSet\Services\' + $_.Name) -Name DelayedAutostart -EA Stop).DelayedAutostart) } catch {}
  $trig = [bool](Test-Path ('HKLM:\SYSTEM\CurrentControlSet\Services\' + $_.Name + '\TriggerInfo'))
  [pscustomobject]@{ n = [string]$_.Name; d = [string]$_.DisplayName; exit = [int]$_.ExitCode; verz = $verz; trig = $trig; pfad = [string]$_.PathName }
})
$o.aufgaben = @(Get-ScheduledTask -EA SilentlyContinue | Where-Object { $_.TaskPath -notlike '\Microsoft\*' -and $_.State -ne 'Disabled' } | ForEach-Object {
  $ti = $_ | Get-ScheduledTaskInfo -EA SilentlyContinue
  if ($ti -and $ti.LastTaskResult -ne 0 -and $ti.LastTaskResult -ne 267009 -and $ti.LastTaskResult -ne 267011 -and $ti.LastTaskResult -ne 267014 -and $ti.LastTaskResult -ne 267008) {
    [pscustomobject]@{ n = [string]$_.TaskName; p = [string]$_.TaskPath; code = ('0x{0:x8}' -f [uint32]$ti.LastTaskResult); zuletzt = $(if ($ti.LastRunTime -and $ti.LastRunTime.Year -gt 2000) { $ti.LastRunTime.ToUniversalTime().ToString('o') } else { '' }) }
  }
} | Select-Object -First 30)
$ext = New-Object System.Collections.Generic.List[object]
$gesehen = @{}
try {
  foreach ($p in @((Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Approved' -EA Stop).PSObject.Properties | Where-Object { $_.Name -match '^\{' } | Select-Object -First 200)) {
    $c = [string]$p.Name; if ($gesehen.ContainsKey($c)) { continue }; $gesehen[$c] = $true
    $dll = ''
    foreach ($w in 'HKLM:\SOFTWARE\Classes\CLSID', 'HKLM:\SOFTWARE\WOW6432Node\Classes\CLSID') { $ip = Join-Path $w ($c + '\InprocServer32'); if (Test-Path $ip) { $dll = [string](Get-ItemProperty $ip -EA SilentlyContinue).'(default)'; if ($dll) { break } } }
    if (-not $dll) { continue }
    $voll = [Environment]::ExpandEnvironmentVariables(($dll -replace '^"|"$', ''))
    if ($voll -match '\\Windows\\(System32|SysWOW64)\\' ) { continue }
    $pub = ''; try { if (Test-Path -LiteralPath $voll) { $s = Get-AuthenticodeSignature -LiteralPath $voll -EA SilentlyContinue; if ($s.SignerCertificate) { $pub = [string]$s.SignerCertificate.Subject } } } catch {}
    if ($pub -match 'Microsoft Corporation|Microsoft Windows') { continue }
    $ext.Add([pscustomobject]@{ clsid = $c; name = [string]$p.Value; dll = $voll; hersteller = $pub })
    if ($ext.Count -ge 60) { break }
  }
} catch {}
$o.shellext = $ext.ToArray()
$o | ConvertTo-Json -Depth 4 -Compress ${NUR_ASCII}
`

/** Server-Zusatz: Rollen und VSS-Writer (vssadmin list writers liest nur). */
export const SERVER_PS = String.raw`
$o = [ordered]@{ ok = $true }
try { $o.rollen = @(Get-WindowsFeature -EA Stop | Where-Object { $_.Installed -and $_.FeatureType -eq 'Role' } | ForEach-Object { [string]$_.DisplayName }) } catch { $o.rollen = @() }
try {
  $vw = (& (Join-Path $env:SystemRoot 'System32\vssadmin.exe') list writers 2>&1 | Out-String)
  if ($vw.Length -gt 12000) { $vw = $vw.Substring(0, 12000) }
  $o.vss = $vw
} catch { $o.vss = '' }
$o | ConvertTo-Json -Depth 4 -Compress ${NUR_ASCII}
`
