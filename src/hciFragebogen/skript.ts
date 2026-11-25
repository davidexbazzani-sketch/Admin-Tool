// HCI-Fragebogen: das Abfrage-Skript für EINEN Server — ausschließlich lesend.
//
// Gelesen werden: Registry, WMI/CIM, Dateiversionen von Treibern, die Liste der geplanten Aufgaben,
// Ereignisprotokolle (System/Anwendung) und `fltmc filters`. Nichts wird gestartet, gestoppt,
// geschrieben oder installiert. Kein vssadmin, kein DISM, kein Win32_Product.
// Aus Befehlszeilen (Dienste, Aufgaben, Skripte) verlässt nur der Programmname bzw. das gefundene
// Neustart-Stichwort den Server — nie Argumente oder Skript-Inhalt (dort könnten Kennwörter stehen).
//
// Diese Datei hat bewusst keine Abhängigkeit zum Tool (testbar ohne Oberfläche); der Fernaufruf
// steht in sammeln.ts.
import { NUR_ASCII } from '../vollDiagnose/skripte'
import type { HciRoh } from './typen'

/** Der Block läuft in einer Fernsitzung; `$P` sind die Vorgaben ({ tage, vorMin }). */
export const HCI_INNER = String.raw`
    $uhr = [Diagnostics.Stopwatch]::StartNew()
    $tage = 365; if ($P -and $P.tage) { $tage = [int]$P.tage }
    $vorMin = 30; if ($P -and $P.vorMin) { $vorMin = [int]$P.vorMin }
    $start = (Get-Date).AddDays(-$tage)
    $luecken = New-Object System.Collections.ArrayList
    $iso = { param($d) if ($d) { ([datetime]$d).ToString('yyyy-MM-ddTHH:mm:ss') } else { '' } }
    $kurz = { param($s, $n) $t = ([string]$s -replace '\s+', ' ').Trim(); if ($t.Length -gt $n) { $t.Substring(0, $n) } else { $t } }
    # nur die Programmdatei einer Befehlszeile (ohne Argumente)
    $exe = { param($p)
      $t = ([string]$p).Trim()
      if ($t.StartsWith('"')) { $i = $t.IndexOf('"', 1); if ($i -gt 0) { return $t.Substring(1, $i - 1) } }
      $m = [regex]::Match($t, '^(.*?\.(exe|sys|dll|bat|cmd|com))(\s|$)', 'IgnoreCase')
      if ($m.Success) { return $m.Groups[1].Value }
      return ($t -split ' ')[0]
    }
    $ev = { param($h, $max) try { @(Get-WinEvent -FilterHashtable $h -MaxEvents $max -ErrorAction Stop) } catch { @() } }
    # Befehle, die Windows neu starten oder herunterfahren (nur das Stichwort wird gemeldet)
    $neuMuster = '(?i)\bshutdown(\.exe)?["'']?\s+[/-][rsgp]\b|Restart-Computer|Stop-Computer|\bpsshutdown\w*|Win32Shutdown\w*|ExitWindowsEx|InitiateSystemShutdown\w*|\bwmic\b[^\r\n]{0,30}\b(reboot|shutdown)\b'

    # ── System ──
    $os = Get-CimInstance Win32_OperatingSystem
    $cs = Get-CimInstance Win32_ComputerSystem
    $cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $anz = [string]$cv.DisplayVersion; if (-not $anz) { $anz = [string]$cv.ReleaseId }
    $gast = @{}
    $gp = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Virtual Machine\Guest\Parameters'
    if ($gp) { foreach ($n in 'PhysicalHostName', 'PhysicalHostNameFullyQualified', 'HostName', 'VirtualMachineName', 'HostingSystemOsMajor', 'HostingSystemOsMinor', 'HostingSystemEditionId') { if ($null -ne $gp.$n) { $gast[$n] = [string]$gp.$n } } }
    $ic = [string](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Virtual Machine\Auto').IntegrationServicesVersion
    $pend = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired')
    $cc = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CrashControl'
    $voll = Get-Item (Join-Path $env:SystemRoot 'MEMORY.DMP')
    $klein = @(Get-ChildItem (Join-Path $env:SystemRoot 'Minidump') -Filter *.dmp | Sort-Object LastWriteTime -Descending | Select-Object -First 15 | ForEach-Object { & $iso $_.LastWriteTime })
    $live = @(Get-ChildItem (Join-Path $env:SystemRoot 'LiveKernelReports') -Recurse -Filter *.dmp | Sort-Object LastWriteTime -Descending | Select-Object -First 15 | ForEach-Object { (& $iso $_.LastWriteTime) + ' ' + $_.Directory.Name })
    $system = [ordered]@{
      name = [string]$env:COMPUTERNAME; os = [string]$os.Caption; version = [string]$os.Version; build = [string]$os.BuildNumber; ubr = [int]$cv.UBR; anzeige = $anz
      installiert = (& $iso $os.InstallDate); boot = (& $iso $os.LastBootUpTime)
      hersteller = [string]$cs.Manufacturer; modell = [string]$cs.Model; kerne = [int]$cs.NumberOfLogicalProcessors; sockel = [int]$cs.NumberOfProcessors
      ramGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1); ramFreiGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
      commitGB = [math]::Round($os.TotalVirtualMemorySize / 1MB, 1); commitFreiGB = [math]::Round($os.FreeVirtualMemory / 1MB, 1)
      hypervisor = [bool]$cs.HypervisorPresent; domaene = [string]$cs.Domain; gast = $gast; integration = $ic
      neustartAusstehend = [bool]$pend; autoReboot = [int]$cc.AutoReboot; dumpArt = [int]$cc.CrashDumpEnabled
      platten = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { [pscustomobject]@{ n = [string]$_.DeviceID; g = [math]::Round($_.Size / 1GB, 1); f = [math]::Round($_.FreeSpace / 1GB, 1) } })
      auslagerung = @(Get-CimInstance Win32_PageFileUsage | ForEach-Object { [pscustomobject]@{ n = [string]$_.Name; mb = [int]$_.AllocatedBaseSize; spitze = [int]$_.PeakUsage; jetzt = [int]$_.CurrentUsage } })
      abbild = [ordered]@{ voll = $(if ($voll) { & $iso $voll.LastWriteTime } else { '' }); vollMB = $(if ($voll) { [int]($voll.Length / 1MB) } else { 0 }); klein = $klein; live = $live }
    }

    # ── Software, Laufzeiten, Rollen, Updates ──
    $software = @(@(foreach ($k in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*') {
      Get-ItemProperty $k | Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ParentKeyName } | ForEach-Object {
        [pscustomobject]@{ n = [string]$_.DisplayName; v = [string]$_.DisplayVersion; h = [string]$_.Publisher; d = [string]$_.InstallDate; o = [string]$_.InstallLocation } }
    }) | Sort-Object n, v -Unique | Select-Object -First 500)
    $ndp = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full'
    $core = @()
    foreach ($basis in @((Join-Path $env:ProgramFiles 'dotnet\shared'), (Join-Path ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) 'dotnet\shared'))) {
      if ($basis -and (Test-Path $basis)) { Get-ChildItem $basis -Directory | ForEach-Object { $fam = $_.Name; Get-ChildItem $_.FullName -Directory | ForEach-Object { $core += ($fam + ' ' + $_.Name) } } }
    }
    $java = @()
    foreach ($k in 'HKLM:\SOFTWARE\JavaSoft\Java Runtime Environment', 'HKLM:\SOFTWARE\JavaSoft\JRE', 'HKLM:\SOFTWARE\JavaSoft\Java Development Kit', 'HKLM:\SOFTWARE\JavaSoft\JDK', 'HKLM:\SOFTWARE\WOW6432Node\JavaSoft\Java Runtime Environment') {
      if (Test-Path $k) { Get-ChildItem $k | ForEach-Object { $jh = [string](Get-ItemProperty $_.PSPath).JavaHome; $java += [pscustomobject]@{ q = 'registry'; v = [string]$_.PSChildName; o = $jh; h = '' } } }
    }
    Get-Process java, javaw | Where-Object { $_.Path } | Sort-Object Path -Unique | ForEach-Object { $vi = (Get-Item -LiteralPath $_.Path).VersionInfo; $java += [pscustomobject]@{ q = 'prozess'; v = [string]$vi.ProductVersion; o = [string]$_.Path; h = [string]$vi.CompanyName } }
    $sql = @()
    $inst = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
    if ($inst) { $inst.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { $s = Get-ItemProperty ('HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\' + $_.Value + '\Setup'); $sql += [pscustomobject]@{ n = [string]$_.Name; v = [string]$s.Version; pl = [string]$s.PatchLevel; e = [string]$s.Edition } } }
    $rollen = @(); $merkmale = @()
    if (Get-Command Get-WindowsFeature) {
      $wf = @(Get-WindowsFeature | Where-Object { $_.Installed })
      $rollen = @($wf | Where-Object { $_.FeatureType -eq 'Role' } | ForEach-Object { [string]$_.DisplayName })
      $merkmale = @($wf | Where-Object { $_.Name -match '^(Failover-Clustering|Hyper-V|Multipath-IO|Windows-Server-Backup|FS-iSCSITarget-Server|Containers|NLB|Data-Center-Bridging)$' } | ForEach-Object { [string]$_.Name })
    } else { [void]$luecken.Add('Rollen (Get-WindowsFeature fehlt)') }
    $hotfix = @(Get-CimInstance Win32_QuickFixEngineering | ForEach-Object {
      $d = ''; try { if ($_.InstalledOn) { $d = ([datetime]$_.InstalledOn).ToString('yyyy-MM-dd') } } catch {}
      [pscustomobject]@{ id = [string]$_.HotFixID; a = [string]$_.Description; d = $d } } | Sort-Object d -Descending | Select-Object -First 80)

    # ── Dienste ──
    $dienste = @(Get-CimInstance Win32_Service | ForEach-Object { [pscustomobject]@{ n = [string]$_.Name; d = [string]$_.DisplayName; s = [string]$_.State; m = [string]$_.StartMode; p = [string](& $exe $_.PathName); u = [string]$_.StartName } })
    # Wiederherstellung „Computer neu starten“ (Aktion 2 in FailureActions)
    $dienstNeustart = @()
    Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services' | ForEach-Object {
      $fa = $_.GetValue('FailureActions')
      if ($fa -is [byte[]] -and $fa.Length -ge 28) {
        $anzahl = [BitConverter]::ToInt32($fa, 12); $hat = $false
        for ($i = 0; $i -lt $anzahl -and (24 + $i * 8) -le $fa.Length; $i++) { if ([BitConverter]::ToInt32($fa, 20 + $i * 8) -eq 2) { $hat = $true } }
        if ($hat) { $dienstNeustart += [string]$_.PSChildName }
      }
    }

    # ── Geplante Aufgaben (ohne \Microsoft\) ──
    $aufgaben = @(Get-ScheduledTask | Where-Object { $_.TaskPath -notlike '\Microsoft\*' } | Select-Object -First 300 | ForEach-Object {
      $t = $_; $i = $t | Get-ScheduledTaskInfo
      $prog = @(); $skripte = @(); $tok = @()
      foreach ($a in @($t.Actions)) {
        $ex = [string]$a.Execute; $ar = [string]$a.Arguments
        if ($ex) { try { $prog += [IO.Path]::GetFileName($ex.Trim('"')) } catch { $prog += (& $kurz $ex 40) } }
        $alles = $ex + ' ' + $ar
        foreach ($m in [regex]::Matches($alles, $neuMuster)) { $tok += (& $kurz $m.Value 40) }
        foreach ($m in [regex]::Matches($alles, '(?i)[A-Z]:\\[^"<>|*?\r\n]+?\.(bat|cmd|ps1|vbs|js|wsf|py|pl)\b')) { $skripte += $m.Value }
      }
      $sk = @()
      foreach ($s in @($skripte | Select-Object -Unique | Select-Object -First 4)) {
        $lesbar = $false; $st = @()
        try { $f = Get-Item -LiteralPath $s -ErrorAction Stop; if ($f.Length -le 524288) { $txt = [IO.File]::ReadAllText($f.FullName); $lesbar = $true; $st = @([regex]::Matches($txt, $neuMuster) | ForEach-Object { & $kurz $_.Value 40 } | Select-Object -Unique | Select-Object -First 5) } } catch {}
        $sk += [pscustomobject]@{ p = [string]$s; lesbar = $lesbar; tok = $st }
      }
      $l = ''; if ($i.LastRunTime -and $i.LastRunTime.Year -gt 2000) { $l = & $iso $i.LastRunTime }
      [pscustomobject]@{ n = [string]$t.TaskName; pf = [string]$t.TaskPath; s = [string]$t.State; u = [string]$t.Principal.UserId; au = (& $kurz $t.Author 60); prog = @($prog | Select-Object -Unique); tok = @($tok | Select-Object -Unique); sk = $sk; l = $l; r = [int64]$i.LastTaskResult }
    })
    $au = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
    $wuP = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
    $wu = [ordered]@{ richtlinie = [bool]$au; auOptions = [int]$au.AUOptions; keinAuto = [int]$au.NoAutoUpdate; keinNeustartAngemeldet = [int]$au.NoAutoRebootWithLoggedOnUsers; wsus = [bool]$wuP.WUServer }

    # ── Treiber: alles, was nicht von Microsoft stammt ──
    $pfad = { param($p)
      $t = ([string]$p).Trim().Trim('"')
      if ($t -match '^\\\?\?\\') { $t = $t.Substring(4) }
      if ($t -match '^\\SystemRoot\\') { $t = Join-Path $env:SystemRoot $t.Substring(12) }
      elseif ($t -match '^(system32|syswow64)\\') { $t = Join-Path $env:SystemRoot $t }
      $t
    }
    $alleTreiber = @(Get-CimInstance Win32_SystemDriver)
    $treiber = @(); $msTreiber = 0
    foreach ($d in $alleTreiber) {
      $p = & $pfad $d.PathName; $firma = ''; $ver = ''; $besch = ''; $datum = ''; $da = $false
      if ($p) { try { $f = Get-Item -LiteralPath $p -ErrorAction Stop; $da = $true; $vi = $f.VersionInfo; $firma = [string]$vi.CompanyName; $ver = [string]$vi.FileVersion; $besch = [string]$vi.FileDescription; $datum = $f.LastWriteTime.ToString('yyyy-MM-dd') } catch {} }
      if ($firma -match 'Microsoft') { $msTreiber++; continue }
      $sig = ''
      # Signatur nur für Nicht-Microsoft-Treiber: „Microsoft Windows“ = liegt Windows bei, alles andere ist nachinstalliert
      if ($da -and $treiber.Count -lt 250) { try { $s = Get-AuthenticodeSignature -LiteralPath $p; if ($s.SignerCertificate) { $sig = [string]$s.SignerCertificate.GetNameInfo('SimpleName', $false) } } catch {} }
      if (-not $firma -and $sig -match 'Microsoft') { $msTreiber++; continue }
      $treiber += [pscustomobject]@{ n = [string]$d.Name; d = [string]$d.DisplayName; s = [string]$d.State; m = [string]$d.StartMode; a = [string]$d.ServiceType; p = [string]$p; h = $firma; v = $ver; b = $besch; dt = $datum; sig = $sig }
    }
    $filter = @(); $filterFehlt = $false
    try {
      $fl = & fltmc.exe filters 2>$null
      if ($LASTEXITCODE -ne 0) { $filterFehlt = $true }
      foreach ($z in @($fl)) { if ([string]$z -match '^(\S+)\s+(\d+)\s+([\d\.]+)\s+(\d+)\s*$') { $filter += [pscustomobject]@{ n = $Matches[1]; i = [int]$Matches[2]; h = $Matches[3]; f = [int]$Matches[4] } } }
    } catch { $filterFehlt = $true }
    if ($filterFehlt) { [void]$luecken.Add('Dateisystem-Filter (fltmc verlangt Administratorrechte)') }
    $netz = @(Get-NetAdapter | ForEach-Object { [pscustomobject]@{ n = [string]$_.Name; b = [string]$_.InterfaceDescription; s = [string]$_.Status; h = [string]$_.DriverProvider; v = [string]$_.DriverVersion; dt = [string]$_.DriverDate; g = [string]$_.LinkSpeed } })
    $bindungen = @(Get-NetAdapterBinding -AllBindings | Where-Object { $_.Enabled -and $_.ComponentID -notlike 'ms_*' } | Select-Object -First 40 | ForEach-Object { [pscustomobject]@{ a = [string]$_.Name; k = [string]$_.ComponentID; d = [string]$_.DisplayName } })
    $defender = $null
    if (Get-Command Get-MpComputerStatus) { try { $m = Get-MpComputerStatus -ErrorAction Stop; $defender = [ordered]@{ modus = [string]$m.AMRunningMode; av = [bool]$m.AntivirusEnabled; echtzeit = [bool]$m.RealTimeProtectionEnabled; version = [string]$m.AMProductVersion } } catch {} }
    $vss = @(Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services\VSS\Providers' | ForEach-Object { [string](Get-ItemProperty $_.PSPath).'(default)' } | Where-Object { $_ })
    $geraete = @()
    if (Get-Command Get-PnpDevice) { $geraete = @(Get-PnpDevice -PresentOnly | Where-Object { @('Ports', 'USB', 'SmartCardReader', 'SmartCard', 'Modem', 'Image', 'SecurityDevices', 'Printer') -contains $_.Class -and $_.Manufacturer -notmatch 'Microsoft|^\(Standard' -and $_.FriendlyName -notmatch 'Hub|Host.?Controller|Root|Composite|Verbundger' } | Select-Object -First 40 | ForEach-Object { [pscustomobject]@{ k = [string]$_.Class; n = [string]$_.FriendlyName; h = [string]$_.Manufacturer } }) }
    $iscsi = 0; if (Get-Command Get-IscsiSession) { $iscsi = @(Get-IscsiSession).Count }
    $ports = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalAddress -ne '127.0.0.1' -and $_.LocalAddress -ne '::1' } | Group-Object LocalPort | Select-Object -First 120 | ForEach-Object { $c = $_.Group[0]; $pp = Get-Process -Id $c.OwningProcess; [pscustomobject]@{ port = [int]$_.Name; proc = [string]$pp.ProcessName } })
    $alleProz = @(Get-Process)
    $prozesse = @($alleProz | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 | ForEach-Object { [pscustomobject]@{ n = [string]$_.ProcessName; mb = [int]($_.WorkingSet64 / 1MB); hd = [int]$_.HandleCount; th = [int]$_.Threads.Count } })
    $griffe = @($alleProz | Where-Object { $_.HandleCount -gt 20000 } | Sort-Object HandleCount -Descending | Select-Object -First 10 | ForEach-Object { [pscustomobject]@{ n = [string]$_.ProcessName; mb = [int]($_.WorkingSet64 / 1MB); hd = [int]$_.HandleCount; th = [int]$_.Threads.Count } })

    # ── Ereignisprotokolle ──
    $abSys = (Get-WinEvent -LogName System -Oldest -MaxEvents 1).TimeCreated
    $abApp = (Get-WinEvent -LogName Application -Oldest -MaxEvents 1).TimeCreated
    $neustarts = @((& $ev @{ LogName = 'System'; ProviderName = 'User32'; Id = 1074; StartTime = $start } 300) | ForEach-Object {
      $p = @($_.Properties | ForEach-Object { [string]$_.Value })
      [pscustomobject]@{ t = (& $iso $_.TimeCreated); proz = (& $kurz $p[0] 140); grund = (& $kurz $p[2] 120); art = (& $kurz $p[4] 40); kommentar = (& $kurz $p[5] 160); wer = (& $kurz $p[6] 80) } })

    # Unerwartete Ausfälle: Kernel-Power 41 und EventLog 6008, je Start zusammengefasst
    $rohU = @((& $ev @{ LogName = 'System'; Id = 41, 6008; StartTime = $start } 300) | Where-Object { ($_.Id -eq 6008 -and $_.ProviderName -eq 'EventLog') -or ($_.Id -eq 41 -and $_.ProviderName -eq 'Microsoft-Windows-Kernel-Power') } | Sort-Object TimeCreated)
    $gruppen = New-Object System.Collections.ArrayList
    foreach ($e in $rohU) {
      $g = $null; if ($gruppen.Count) { $g = $gruppen[$gruppen.Count - 1] }
      if (-not $g -or ($e.TimeCreated - $g.t).TotalMinutes -gt 15) { $g = [pscustomobject]@{ t = $e.TimeCreated; ids = @(); bug = ''; text = '' }; [void]$gruppen.Add($g) }
      $g.ids += [int]$e.Id
      if ($e.Id -eq 41) { $bc = [string]$e.Properties[0].Value; if ($bc -and $bc -ne '0') { $g.bug = $bc } }
      if ($e.Id -eq 6008) { $g.text = ((([string]$e.Properties[1].Value) + ' ' + ([string]$e.Properties[0].Value)) -replace '[^\x20-\x7E]', '') }
    }
    $unerwartet = @()
    foreach ($g in @($gruppen | Select-Object -Last 12)) {
      $k12 = @((& $ev @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-General'; Id = 12; StartTime = $g.t.AddMinutes(-20); EndTime = $g.t.AddSeconds(10) } 5) | Sort-Object TimeCreated | Select-Object -Last 1)
      $sz = $g.t; if ($k12.Count) { $sz = $k12[0].TimeCreated }
      $aus = $null; $quelle = ''
      if ($g.text) { foreach ($cu in 'en-US', 'de-DE', 'en-GB', 'sv-SE') { try { $d = [datetime]::Parse($g.text, [Globalization.CultureInfo]::GetCultureInfo($cu)); if ($d -le $sz -and $d -gt $sz.AddHours(-72)) { $aus = $d; $quelle = '6008'; break } } catch {} } }
      if (-not $aus) { $le = @(& $ev @{ LogName = 'System'; StartTime = $sz.AddHours(-48); EndTime = $sz.AddSeconds(-2) } 1); if ($le.Count) { $aus = $le[0].TimeCreated; $quelle = 'letzter Eintrag' } }
      $davor = @()
      if ($aus) { foreach ($log in 'System', 'Application') {
        $davor += @((& $ev @{ LogName = $log; Level = 1, 2, 3; StartTime = $aus.AddMinutes(-$vorMin); EndTime = $sz.AddSeconds(-1) } 40) | ForEach-Object { [pscustomobject]@{ t = (& $iso $_.TimeCreated); l = $log; q = [string]$_.ProviderName; id = [int]$_.Id; st = [int]$_.Level; m = (& $kurz $_.Message 220) } })
      } }
      $unerwartet += [pscustomobject]@{ start = (& $iso $sz); aus = (& $iso $aus); ausQuelle = $quelle; ids = @($g.ids | Select-Object -Unique); bug = [string]$g.bug; davor = $davor }
    }
    $bugcheck = @((& $ev @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WER-SystemErrorReporting'; Id = 1001; StartTime = $start } 30) | ForEach-Object { [pscustomobject]@{ t = (& $iso $_.TimeCreated); m = (& $kurz $_.Message 200) } })

    $gruppiere = { param($liste, $max)
      @($liste | Group-Object { $_.ProviderName + '|' + $_.Id } | Sort-Object Count -Descending | Select-Object -First $max | ForEach-Object {
        $l = $_.Group | Sort-Object TimeCreated | Select-Object -Last 1
        [pscustomobject]@{ q = [string]$l.ProviderName; id = [int]$l.Id; n = [int]$_.Count; l = (& $iso $l.TimeCreated); m = (& $kurz $l.Message 180) } })
    }
    $sysRoh = @(& $ev @{ LogName = 'System'; Level = 1, 2; StartTime = $start } 4000)
    $sysFehler = & $gruppiere $sysRoh 30
    $speicherRoh = @()
    foreach ($q in 'disk', 'storvsc', 'Ntfs', 'volmgr', 'stornvme', 'iScsiPrt', 'vhdmp', 'Microsoft-Windows-Ntfs', 'volsnap') { $speicherRoh += @(& $ev @{ LogName = 'System'; ProviderName = $q; Level = 1, 2, 3; StartTime = $start } 300) }
    $speicherEreignisse = & $gruppiere $speicherRoh 15
    $ressourcen = @((& $ev @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Resource-Exhaustion-Detector'; StartTime = $start } 40) | ForEach-Object { [pscustomobject]@{ t = (& $iso $_.TimeCreated); m = (& $kurz $_.Message 220) } })
    $whea = @((& $ev @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WHEA-Logger'; StartTime = $start } 40) | ForEach-Object { [pscustomobject]@{ t = (& $iso $_.TimeCreated); id = [int]$_.Id; m = (& $kurz $_.Message 200) } })

    $abstuerze = @()
    foreach ($pr in @(@('Application Error', 1000), @('Application Hang', 1002), @('.NET Runtime', 1026))) {
      $evs = @(& $ev @{ LogName = 'Application'; ProviderName = $pr[0]; Id = $pr[1]; StartTime = $start } 500)
      $abstuerze += @($evs | Group-Object { [string]$_.Properties[0].Value } | Sort-Object Count -Descending | Select-Object -First 15 | ForEach-Object {
        $l = $_.Group | Sort-Object TimeCreated | Select-Object -Last 1
        $modul = ''; if ($pr[1] -eq 1000 -and $l.Properties.Count -gt 3) { $modul = [string]$l.Properties[3].Value }
        [pscustomobject]@{ art = [string]$pr[0]; app = (& $kurz $_.Name 80); modul = (& $kurz $modul 60); n = [int]$_.Count; l = (& $iso $l.TimeCreated) } })
    }
    $msi = @((& $ev @{ LogName = 'Application'; ProviderName = 'MsiInstaller'; Id = 1033, 1034, 1036; StartTime = $start } 400) | ForEach-Object {
      $p = @($_.Properties | ForEach-Object { [string]$_.Value })
      [pscustomobject]@{ t = (& $iso $_.TimeCreated); id = [int]$_.Id; n = (& $kurz $p[0] 120); v = (& $kurz $p[1] 40) } })
    # Windows-Update-Installationen; die täglichen Defender-Signaturen sind kein „Patch“ und bleiben draußen
    $updates = @((& $ev @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WindowsUpdateClient'; Id = 19; StartTime = $start } 2000) | Where-Object { [string]$_.Properties[0].Value -notmatch 'Security Intelligence|Definition|KB2267602|Antimalware' } | Select-Object -First 150 | ForEach-Object { [pscustomobject]@{ t = (& $iso $_.TimeCreated); n = (& $kurz $_.Properties[0].Value 140) } })
    $neueDienste = @((& $ev @{ LogName = 'System'; ProviderName = 'Service Control Manager'; Id = 7045; StartTime = $start } 200) | ForEach-Object {
      $p = @($_.Properties | ForEach-Object { [string]$_.Value }); $datei = ''
      try { $datei = [IO.Path]::GetFileName((& $exe $p[1])) } catch { $datei = '' }
      [pscustomobject]@{ t = (& $iso $_.TimeCreated); n = (& $kurz $p[0] 80); datei = $datei; art = (& $kurz $p[2] 40) } })

    $o = [ordered]@{
      ok = $true; v = 1; am = (& $iso (Get-Date)); zone = [string][TimeZoneInfo]::Local.Id; tage = $tage; vorMin = $vorMin; dauerS = [int]$uhr.Elapsed.TotalSeconds
      system = $system; software = $software
      dotnet = [ordered]@{ release = [int]$ndp.Release; version = [string]$ndp.Version; core = @($core | Sort-Object -Unique) }
      java = @($java); sql = @($sql); rollen = $rollen; merkmale = $merkmale; hotfix = $hotfix
      dienste = $dienste; dienstNeustart = @($dienstNeustart); aufgaben = $aufgaben; wu = $wu
      treiber = @($treiber); treiberGesamt = [int]$alleTreiber.Count; treiberMicrosoft = [int]$msTreiber
      filter = @($filter); filterFehlt = [bool]$filterFehlt; netz = $netz; bindungen = $bindungen; defender = $defender; vss = $vss; geraete = $geraete; iscsi = [int]$iscsi
      ports = $ports; prozesse = $prozesse; griffe = $griffe
      protokollAb = [ordered]@{ system = (& $iso $abSys); anwendung = (& $iso $abApp) }
      neustarts = $neustarts; unerwartet = @($unerwartet); bugcheck = $bugcheck
      sysFehler = $sysFehler; sysFehlerGekappt = [bool]($sysRoh.Count -ge 4000); speicherEreignisse = $speicherEreignisse; ressourcen = $ressourcen; whea = $whea
      abstuerze = @($abstuerze); msi = $msi; updates = $updates; neueDienste = $neueDienste
      luecken = @($luecken)
    }
    $o | ConvertTo-Json -Depth 7 -Compress ${NUR_ASCII}
`

/**
 * Dasselbe Skript ohne Einrückung, Leerzeilen und Kommentarzeilen. Das Tool übergibt Skripte auf der
 * Befehlszeile (Grenze 32.767 Zeichen) — so bleibt Reserve. Der Test ps_befehl.ts misst die echte Länge.
 */
export const HCI_KOMPAKT = HCI_INNER.split('\n').map(z => z.trim()).filter(z => z && !z.startsWith('#')).join('\n')

const feld = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : v == null || v === '' ? [] : [v as T])

/** Rohdaten aufräumen: PowerShell macht aus einem einzelnen Eintrag ein Objekt statt einer Liste. */
export function normalisiere(d: Record<string, unknown>): HciRoh {
  const r = { ...d } as unknown as HciRoh
  const listen = ['software', 'java', 'sql', 'rollen', 'merkmale', 'hotfix', 'dienste', 'dienstNeustart', 'aufgaben', 'treiber', 'filter', 'netz', 'bindungen', 'vss', 'geraete',
    'ports', 'prozesse', 'griffe', 'neustarts', 'unerwartet', 'bugcheck', 'sysFehler', 'speicherEreignisse', 'ressourcen', 'whea', 'abstuerze', 'msi', 'updates', 'neueDienste', 'luecken'] as const
  const ziel = r as unknown as Record<string, unknown>
  for (const k of listen) ziel[k] = feld(d[k])
  r.aufgaben = r.aufgaben.map(a => ({ ...a, prog: feld<string>(a.prog), tok: feld<string>(a.tok), sk: feld<HciRoh['aufgaben'][number]['sk'][number]>(a.sk).map(s => ({ ...s, tok: feld<string>(s.tok) })) }))
  r.unerwartet = r.unerwartet.map(u => ({ ...u, ids: feld<number>(u.ids), davor: feld<HciRoh['unerwartet'][number]['davor'][number]>(u.davor) }))
  const sys = { ...((d.system as object) || {}) } as HciRoh['system']
  sys.platten = feld(sys.platten); sys.auslagerung = feld(sys.auslagerung)
  sys.gast = sys.gast && typeof sys.gast === 'object' ? sys.gast : {}
  const ab = (sys.abbild || {}) as HciRoh['system']['abbild']
  sys.abbild = { voll: ab.voll || '', vollMB: Number(ab.vollMB) || 0, klein: feld<string>(ab.klein), live: feld<string>(ab.live) }
  r.system = sys
  const dn = (d.dotnet || {}) as HciRoh['dotnet']
  r.dotnet = { release: Number(dn.release) || 0, version: dn.version || '', core: feld<string>(dn.core) }
  r.protokollAb = { system: (d.protokollAb as HciRoh['protokollAb'])?.system || '', anwendung: (d.protokollAb as HciRoh['protokollAb'])?.anwendung || '' }
  r.wu = (d.wu as HciRoh['wu']) || { richtlinie: false, auOptions: 0, keinAuto: 0, keinNeustartAngemeldet: 0, wsus: false }
  r.defender = (d.defender as HciRoh['defender']) || null
  return r
}
