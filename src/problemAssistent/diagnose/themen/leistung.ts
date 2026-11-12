// ── Diagnose-Thema „PC langsam & Speicher“ ──────────────────────────────────
// pf = Leistung jetzt (CPU/RAM/Datenträger/Top-Prozesse/Energieplan) · pfplatz = Platzfresser auf C:
// pfstart = Start & Anmeldung (Autostart, Startdauer, Gruppenrichtlinien) · pfdisk = Festplatte/SSD-Zustand
// Alles NUR LESEND.
import { ja, liste, nein, num, txt, zahl } from '../motor'
import type { DgOber, DgSonde } from '../types'

/** Ereignisse sicher lesen (unbekannter Anbieter/Protokoll wirft sonst „Falscher Parameter“ trotz -EA SilentlyContinue). */
const EV = String.raw`
function EvSt([hashtable]$fh, [int]$max) { try { return @(Get-WinEvent -FilterHashtable $fh -MaxEvents $max -EA Stop) } catch { return @() } }
`

export const SONDEN_LEISTUNG: DgSonde[] = [
  {
    id: 'pf', titel: 'Leistung jetzt (Prozessor, Arbeitsspeicher, Datenträger, Top-Prozesse, Energieplan)', modus: 'system', timeoutMs: 90000,
    ps: EV + String.raw`
$cs = Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue
$kerne = [int]$cs.NumberOfLogicalProcessors
if ($kerne -lt 1) { $kerne = 1 }
$pi1 = Get-CimInstance Win32_PerfRawData_Counters_ProcessorInformation -Filter "Name='_Total'" -EA SilentlyContinue
$dk1 = @(Get-CimInstance Win32_PerfRawData_PerfDisk_PhysicalDisk -EA SilentlyContinue | Where-Object { $_.Name -ne '_Total' })
$cpu1 = @{}
foreach ($x in @(Get-Process -EA SilentlyContinue)) { if ($null -ne $x.CPU) { $cpu1[$x.Id] = [double]$x.CPU } }
$uhr = [Diagnostics.Stopwatch]::StartNew()
Start-Sleep -Seconds 3
$sek = $uhr.Elapsed.TotalSeconds
$pi2 = Get-CimInstance Win32_PerfRawData_Counters_ProcessorInformation -Filter "Name='_Total'" -EA SilentlyContinue
$dk2 = @(Get-CimInstance Win32_PerfRawData_PerfDisk_PhysicalDisk -EA SilentlyContinue | Where-Object { $_.Name -ne '_Total' })
$alle = @(Get-Process -EA SilentlyContinue)
$jeName = @{}
foreach ($x in $alle) {
  if ($null -eq $x.CPU -or -not $cpu1.ContainsKey($x.Id)) { continue }
  $anteil = ([double]$x.CPU - $cpu1[$x.Id]) / $sek / $kerne * 100
  $nm = [string]$x.ProcessName
  if ($jeName.ContainsKey($nm)) { $jeName[$nm] += $anteil } else { $jeName[$nm] = $anteil }
}
function AnteilPf([string[]]$namen) { $summe = 0.0; foreach ($nx in $namen) { if ($jeName.ContainsKey($nx)) { $summe += $jeName[$nx] } }; return [math]::Round($summe, 1) }
# Prozessor gesamt und Takt (Rohzähler, zwei Messungen im Abstand von 3 s)
$cpuGes = $null; $leist = $null
if ($pi1 -and $pi2) {
  $dt = [double]$pi2.Timestamp_Sys100NS - [double]$pi1.Timestamp_Sys100NS
  if ($dt -gt 0) { $cpuGes = [math]::Round(100 - 100 * ([double]$pi2.PercentProcessorTime - [double]$pi1.PercentProcessorTime) / $dt) }
  $db = [double]$pi2.PercentProcessorPerformance_Base - [double]$pi1.PercentProcessorPerformance_Base
  if ($db -gt 0) { $leist = [math]::Round(([double]$pi2.PercentProcessorPerformance - [double]$pi1.PercentProcessorPerformance) / $db) }
}
if ($null -eq $cpuGes) { $cpuGes = [math]::Round([double](Get-CimInstance Win32_Processor -EA SilentlyContinue | Measure-Object LoadPercentage -Average).Average) }
if ($cpuGes -lt 0) { $cpuGes = 0 } elseif ($cpuGes -gt 100) { $cpuGes = 100 }
Fakt 'cpuProzent' $cpuGes; Fakt 'cpuLeistungProzent' $leist; Fakt 'kerne' $kerne
$top = @($jeName.GetEnumerator() | Where-Object { $_.Key -ne 'Idle' -and $_.Key -ne '_Total' } | Sort-Object Value -Descending | Select-Object -First 5)
Fakt 'topCpu' @($top | ForEach-Object { [string]$_.Key + ' ' + [math]::Round([double]$_.Value) + ' %' })
Fakt 'topCpuName' $(if ($top.Count) { [string]$top[0].Key } else { $null })
Fakt 'topCpuProzent' $(if ($top.Count) { [math]::Round([double]$top[0].Value, 1) } else { $null })
Punkt 'Prozessor-Auslastung (3 s gemessen)' $(if ($cpuGes -ge 85) { 'fehler' } elseif ($cpuGes -ge 60) { 'warn' } else { 'ok' }) ('' + $cpuGes + ' %' + $(if ($top.Count) { ' · größte Verbraucher: ' + (@($top | Select-Object -First 3 | ForEach-Object { [string]$_.Key + ' ' + [math]::Round([double]$_.Value) + ' %' }) -join ', ') } else { '' }))
if ($null -ne $leist) { Punkt 'Prozessortakt' $(if ($leist -lt 50 -and $cpuGes -ge 30) { 'warn' } else { 'ok' }) ('' + $leist + ' % der Nenngeschwindigkeit') }
# bekannte Lastverursacher
$def = AnteilPf @('MsMpEng', 'MpDefenderCoreService', 'NisSrv', 'MpCopyAccelerator')
$idx = AnteilPf @('SearchIndexer', 'SearchProtocolHost', 'SearchFilterHost')
$imeA = AnteilPf @('Microsoft.Management.Services.IntuneWindowsAgent', 'AgentExecutor')
$wmi = AnteilPf @('WmiPrvSE')
$tel = AnteilPf @('CompatTelRunner', 'DeviceCensus')
$exp = AnteilPf @('explorer')
$dwmA = AnteilPf @('dwm')
$hpA = 0.0; foreach ($k in @($jeName.Keys)) { if ($k -match '^HP') { $hpA += $jeName[$k] } }
Fakt 'defenderCpu' $def; Fakt 'indexerCpu' $idx; Fakt 'imeCpu' $imeA; Fakt 'wmiCpu' $wmi; Fakt 'telemetrieCpu' $tel; Fakt 'explorerCpu' $exp; Fakt 'dwmCpu' $dwmA; Fakt 'hpCpu' ([math]::Round($hpA, 1))
$auff = @()
foreach ($paar in @(@('Virenscanner (Defender)', $def), @('Suchindexer', $idx), @('Intune-Verwaltungserweiterung', $imeA), @('WMI-Anbieterhost', $wmi), @('Kompatibilitäts-Telemetrie', $tel), @('Explorer', $exp), @('Desktopfenster-Manager', $dwmA), @('HP-Hintergrundprogramme', $hpA))) { if ([double]$paar[1] -ge 10) { $auff += ($paar[0] + ' ' + [math]::Round([double]$paar[1]) + ' %') } }
Punkt 'Bekannte Lastverursacher' $(if ($auff.Count) { 'warn' } else { 'ok' }) $(if ($auff.Count) { $auff -join ', ' } else { 'keiner auffällig (Defender, Suchindexer, Intune-Verwaltungserweiterung, WMI, Telemetrie)' })
# läuft eine Installation im Hintergrund?
$msi = @($alle | Where-Object { $_.ProcessName -eq 'msiexec' }).Count
$inst = @($alle | Where-Object { $_.ProcessName -match '^(TiWorker|TrustedInstaller|setup|MoUsoCoreWorker|wuauclt|OfficeClickToRun)$' } | ForEach-Object { [string]$_.ProcessName } | Select-Object -Unique)
$instCpu = AnteilPf @('TiWorker', 'TrustedInstaller', 'msiexec', 'setup', 'MoUsoCoreWorker', 'wuauclt')
$instLaeuft = ($msi -ge 2) -or ($instCpu -ge 5) -or (@($inst | Where-Object { $_ -match '^setup$' }).Count -gt 0)
if ($msi -ge 2) { $inst = @($inst) + @('msiexec ×' + $msi) }
Fakt 'installLaeuft' $instLaeuft; Fakt 'installProzesse' @($inst); Fakt 'installCpu' $instCpu
Punkt 'Installation im Hintergrund' $(if ($instLaeuft) { 'warn' } else { 'ok' }) $(if ($instLaeuft) { 'läuft gerade: ' + (@($inst) -join ', ') + ' (' + $instCpu + ' % CPU)' } else { 'keine' })
# Arbeitsspeicher
$os = Get-CimInstance Win32_OperatingSystem -EA SilentlyContinue
if ($os) {
  $ramGB = [math]::Round([double]$os.TotalVisibleMemorySize / 1MB, 1)
  $ramFrei = [math]::Round(100 * [double]$os.FreePhysicalMemory / [double]$os.TotalVisibleMemorySize)
  $commit = $null; if ([double]$os.TotalVirtualMemorySize -gt 0) { $commit = [math]::Round(100 * ([double]$os.TotalVirtualMemorySize - [double]$os.FreeVirtualMemory) / [double]$os.TotalVirtualMemorySize) }
  Fakt 'ramGB' $ramGB; Fakt 'ramFreiProzent' $ramFrei; Fakt 'commitProzent' $commit
  $tage = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalDays, 1)
  Fakt 'uptimeTage' $tage
  Punkt 'Arbeitsspeicher' $(if ($ramFrei -lt 10) { 'fehler' } elseif ($ramFrei -lt 20) { 'warn' } else { 'ok' }) ('' + $ramGB + ' GB nutzbar, ' + $ramFrei + ' % frei')
  if ($null -ne $commit) { Punkt 'Zugesicherter Speicher (RAM + Auslagerung)' $(if ($commit -ge 90) { 'fehler' } elseif ($commit -ge 80) { 'warn' } else { 'ok' }) ('' + $commit + ' % belegt') }
  Punkt 'Laufzeit seit Neustart' $(if ($tage -gt 14) { 'warn' } else { 'ok' }) ('' + $tage + ' Tage')
}
$verbaut = [math]::Round([double](Get-CimInstance Win32_PhysicalMemory -EA SilentlyContinue | Measure-Object Capacity -Sum).Sum / 1GB, 1)
Fakt 'verbautGB' $(if ($verbaut -gt 0) { $verbaut } else { $null })
$ramJe = @{}
foreach ($x in $alle) { $nm = [string]$x.ProcessName; $v = [double]$x.WorkingSet64; if ($ramJe.ContainsKey($nm)) { $ramJe[$nm] += $v } else { $ramJe[$nm] = $v } }
$topR = @($ramJe.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 5)
$de = [Globalization.CultureInfo]::GetCultureInfo('de-DE')
Fakt 'topRam' @($topR | ForEach-Object { [string]$_.Key + ' ' + ([math]::Round([double]$_.Value / 1GB, 1)).ToString($de) + ' GB' })
Fakt 'topRamName' $(if ($topR.Count) { [string]$topR[0].Key } else { $null })
Fakt 'topRamGB' $(if ($topR.Count) { [math]::Round([double]$topR[0].Value / 1GB, 1) } else { $null })
function RamPf([string[]]$namen) { $summe = 0.0; foreach ($nx in $namen) { if ($ramJe.ContainsKey($nx)) { $summe += $ramJe[$nx] } }; return [math]::Round($summe / 1GB, 1) }
$ws2 = RamPf @('msedgewebview2'); $brw = RamPf @('msedge', 'chrome', 'firefox'); $tms = RamPf @('ms-teams', 'Teams'); $mc = RamPf @('Memory Compression')
$summeWs = 0.0; foreach ($k in @($ramJe.Keys)) { if ($k -ne 'Memory Compression') { $summeWs += $ramJe[$k] } }
Fakt 'webview2GB' $ws2; Fakt 'browserGB' $brw; Fakt 'teamsGB' $tms; Fakt 'memCompGB' $mc; Fakt 'prozesseSummeGB' ([math]::Round($summeWs / 1GB, 1))
Punkt 'Größte Speicherverbraucher' 'info' ((@($topR | ForEach-Object { [string]$_.Key + ' ' + ([math]::Round([double]$_.Value / 1GB, 1)).ToString($de) + ' GB' }) -join ', ') + ' · Browser ' + $brw + ' GB, Teams ' + $tms + ' GB, WebView2 ' + $ws2 + ' GB')
$mem = Get-CimInstance Win32_PerfRawData_PerfOS_Memory -EA SilentlyContinue
$npMB = $null; if ($mem) { $npMB = [math]::Round([double]$mem.PoolNonpagedBytes / 1MB) }
Fakt 'nonPagedMB' $npMB
if ($null -ne $npMB) { Punkt 'Nicht ausgelagerter Speicher (Treiber)' $(if ($npMB -ge 2048) { 'warn' } else { 'ok' }) ('' + $npMB + ' MB') }
$pfu = @(Get-CimInstance Win32_PageFileUsage -EA SilentlyContinue)
$pfGB = [math]::Round([double]($pfu | Measure-Object AllocatedBaseSize -Sum).Sum / 1024, 1)
$pfAus = ($null -ne $cs) -and (-not $cs.AutomaticManagedPagefile) -and ($pfu.Count -eq 0)
Fakt 'pagefileGB' $pfGB; Fakt 'pagefileAus' $pfAus; Fakt 'pagefileAuto' ([bool]$cs.AutomaticManagedPagefile)
Punkt 'Auslagerungsdatei' $(if ($pfAus) { 'fehler' } elseif ($pfGB -ge 30) { 'warn' } else { 'ok' }) $(if ($pfAus) { 'ABGESCHALTET' } else { '' + $pfGB + ' GB' + $(if ($cs.AutomaticManagedPagefile) { ' (automatisch verwaltet)' } else { ' (feste Größe)' }) })
# Datenträger (Rohzähler je Platte, höchste Auslastung zählt)
$dkMax = $null
foreach ($b2 in $dk2) {
  $b1 = @($dk1 | Where-Object { $_.Name -eq $b2.Name }) | Select-Object -First 1
  if (-not $b1) { continue }
  $dts = [double]$b2.Timestamp_Sys100NS - [double]$b1.Timestamp_Sys100NS
  if ($dts -le 0) { continue }
  $bel = 100 - 100 * ([double]$b2.PercentIdleTime - [double]$b1.PercentIdleTime) / $dts
  if ($bel -lt 0) { $bel = 0 } elseif ($bel -gt 100) { $bel = 100 }
  if ($null -eq $dkMax -or $bel -gt $dkMax) { $dkMax = $bel }
}
if ($null -ne $dkMax) { $dkMax = [math]::Round($dkMax) }
Fakt 'datentraegerAktiv' $dkMax
if ($null -ne $dkMax) { Punkt 'Datenträger-Auslastung' $(if ($dkMax -ge 90) { 'fehler' } elseif ($dkMax -ge 60) { 'warn' } else { 'ok' }) ('' + $dkMax + ' % aktiv') }
# Energieplan / Energiemodus / Drosselung
function PcWertPf([string]$sub, [string]$set) {
  $o = @(powercfg /q SCHEME_CURRENT $sub $set 2>$null | ForEach-Object { [string]$_ })
  $h = @($o | ForEach-Object { if ($_ -match ':\s*(0x[0-9a-fA-F]+)\s*$') { [Convert]::ToInt64($Matches[1], 16) } })
  if ($h.Count -ge 2) { return @($h[$h.Count - 2], $h[$h.Count - 1]) }
  return @(-1, -1)
}
$schema = [string](powercfg /getactivescheme 2>$null | Out-String)
$guid = ''; if ($schema -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') { $guid = $Matches[1].ToLower() }
$plan = switch ($guid) { '381b4222-f694-41f0-9685-ff5bb260df2e' { 'Ausbalanciert' } '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c' { 'Höchstleistung' } 'a1841308-3541-4fab-bc81-f71556f20b4a' { 'Energiesparmodus' } 'e9a42b02-d5df-448d-aa00-03f14749eb61' { 'Ultimative Leistung' } default { if ($schema -match '\(([^)]+)\)') { $Matches[1] } else { $guid } } }
$sparplan = ($guid -eq 'a1841308-3541-4fab-bc81-f71556f20b4a')
$pm = @(PcWertPf 'SUB_PROCESSOR' 'PROCTHROTTLEMAX')
$ovl = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes' -EA SilentlyContinue
$ovlAc = [string]$ovl.ActiveOverlayAcPowerScheme
$effizienz = ($ovlAc -eq '961cc777-2547-4f9d-8174-7d86181b8a7a')
Fakt 'energieplan' $plan; Fakt 'energiesparplan' $sparplan; Fakt 'overlayEffizienz' $effizienz
Fakt 'procMaxAc' $(if ($pm[0] -ge 0) { $pm[0] } else { $null }); Fakt 'procMaxDc' $(if ($pm[1] -ge 0) { $pm[1] } else { $null })
$bremst = $sparplan -or $effizienz -or ($pm[0] -ge 0 -and $pm[0] -lt 100)
Punkt 'Energieplan' $(if ($bremst) { 'warn' } else { 'ok' }) ($plan + $(if ($effizienz) { ', Energiemodus „Beste Energieeffizienz“' } else { '' }) + $(if ($pm[0] -ge 0) { ', Prozessor max. ' + $pm[0] + ' % am Netz' } else { '' }))
$bat = Get-CimInstance Win32_Battery -EA SilentlyContinue | Select-Object -First 1
Fakt 'aufAkku' $(if ($bat) { [int]$bat.BatteryStatus -eq 1 } else { $false })
$d37 = @(EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Processor-Power'; Id = 37; StartTime = (Get-Date).AddDays(-7) } 200).Count
Fakt 'drossel37' $d37
Punkt 'Drosselung durch Firmware (7 Tage)' $(if ($d37) { 'warn' } else { 'ok' }) $(if ($d37) { '' + $d37 + '× „Prozessorleistung durch Firmware eingeschränkt“' } else { 'keine' })
$temp = $null
try { $tz = @(Get-CimInstance -Namespace 'root\wmi' -ClassName MSAcpi_ThermalZoneTemperature -EA Stop); if ($tz.Count) { $temp = [math]::Round((([double]($tz | Measure-Object CurrentTemperature -Maximum).Maximum) / 10) - 273.15) } } catch {}
Fakt 'tempC' $temp
if ($null -ne $temp) { Punkt 'Temperatur (ACPI)' $(if ($temp -ge 85) { 'warn' } else { 'info' }) ('' + $temp + ' °C') }
`,
  },
  {
    id: 'pfplatz', titel: 'Platzfresser auf Laufwerk C: (grob gemessen)', modus: 'system', timeoutMs: 150000,
    ps: String.raw`
# Ordnergröße grob: höchstens $sekMax Sekunden je Ordner, keine Verknüpfungspunkte folgen
function GroesseGrob([string]$pfad, [int]$sekMax) {
  $erg = @{ gb = 0.0; voll = $true }
  if (-not $pfad -or -not (Test-Path -LiteralPath $pfad)) { return $erg }
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $stapel = New-Object System.Collections.Generic.Stack[string]
  $stapel.Push($pfad); $summe = 0.0
  while ($stapel.Count -gt 0) {
    if ($sw.Elapsed.TotalSeconds -gt $sekMax) { $erg.voll = $false; break }
    $ordner = $stapel.Pop()
    try {
      $di = New-Object System.IO.DirectoryInfo($ordner)
      foreach ($ei in $di.EnumerateFileSystemInfos()) {
        if ($ei -is [System.IO.DirectoryInfo]) { if (-not ($ei.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { $stapel.Push($ei.FullName) } }
        else { $summe += [double]$ei.Length }
      }
    } catch {}
  }
  $erg.gb = [math]::Round($summe / 1GB, 1)
  return $erg
}
function ZeigPl([string]$titel, $erg, [double]$warnAb) {
  $wert = $(if ($erg.voll) { '' } else { 'mind. ' }) + [string]$erg.gb + ' GB'
  Punkt $titel $(if ($erg.gb -ge $warnAb) { 'warn' } else { 'ok' }) $wert
}
$c = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -EA SilentlyContinue
if ($c) {
  $frei = [math]::Round([double]$c.FreeSpace / 1GB, 1); $ges = [math]::Round([double]$c.Size / 1GB, 1)
  Fakt 'cFreiGB' $frei; Fakt 'cGesamtGB' $ges
  Punkt 'Laufwerk C:' $(if ($frei -lt 5) { 'fehler' } elseif ($frei -lt 15) { 'warn' } else { 'ok' }) ('' + $frei + ' GB frei von ' + $ges + ' GB')
}
$wo = GroesseGrob 'C:\Windows.old' 6
Fakt 'windowsOldGB' $wo.gb; ZeigPl 'Windows.old (alte Windows-Version)' $wo 3
$sd = GroesseGrob 'C:\Windows\SoftwareDistribution\Download' 4
$doc = GroesseGrob 'C:\Windows\ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Cache' 3
$cbs = GroesseGrob 'C:\Windows\Logs\CBS' 2
Fakt 'swDownloadGB' $sd.gb; Fakt 'doCacheGB' $doc.gb; Fakt 'cbsGB' $cbs.gb
$upd = @{ gb = [math]::Round($sd.gb + $doc.gb + $cbs.gb, 1); voll = ($sd.voll -and $doc.voll -and $cbs.voll) }
Fakt 'updateResteGB' $upd.gb; ZeigPl 'Update-Reste (Download, Übermittlung, CBS-Protokolle)' $upd 5
$imc = GroesseGrob 'C:\Windows\IMECache' 4
Fakt 'imecacheGB' $imc.gb; ZeigPl 'Intune-Installationscache (IMECache)' $imc 8
$wt = GroesseGrob 'C:\Windows\Temp' 3
Fakt 'winTempGB' $wt.gb; ZeigPl 'Windows-Temp' $wt 3
$ins = GroesseGrob 'C:\Windows\Installer' 4
Fakt 'installerGB' $ins.gb; ZeigPl 'Windows\Installer (nicht löschen!)' $ins 30
$wer = GroesseGrob 'C:\ProgramData\Microsoft\Windows\WER' 3
$mini = GroesseGrob 'C:\Windows\Minidump' 1
$md = Get-Item -Force -LiteralPath 'C:\Windows\MEMORY.DMP' -EA SilentlyContinue
$mdGB = $(if ($md) { [math]::Round([double]$md.Length / 1GB, 1) } else { 0.0 })
$dumps = @{ gb = [math]::Round($wer.gb + $mini.gb + $mdGB, 1); voll = ($wer.voll -and $mini.voll) }
Fakt 'memoryDmpGB' $mdGB; Fakt 'werGB' $wer.gb; Fakt 'dumpsGB' $dumps.gb
ZeigPl 'Absturzabbilder und Fehlerberichte' $dumps 2
$pk = GroesseGrob 'C:\$Recycle.Bin' 4
Fakt 'papierkorbGB' $pk.gb; ZeigPl 'Papierkorb (alle Benutzer)' $pk 3
$hib = Get-Item -Force -LiteralPath 'C:\hiberfil.sys' -EA SilentlyContinue
$pgf = Get-Item -Force -LiteralPath 'C:\pagefile.sys' -EA SilentlyContinue
$hibGB = $(if ($hib) { [math]::Round([double]$hib.Length / 1GB, 1) } else { 0.0 }); $pgfGB = $(if ($pgf) { [math]::Round([double]$pgf.Length / 1GB, 1) } else { 0.0 })
Fakt 'hiberfilGB' $hibGB; Fakt 'pagefileGB' $pgfGB
Punkt 'Ruhezustands- und Auslagerungsdatei' $(if ($pgfGB -ge 30 -or $hibGB -ge 30) { 'warn' } else { 'info' }) ('hiberfil.sys ' + $hibGB + ' GB, pagefile.sys ' + $pgfGB + ' GB')
$sch = $null
try { $sch = [math]::Round([double](@(Get-CimInstance Win32_ShadowStorage -EA Stop) | Measure-Object UsedSpace -Sum).Sum / 1GB, 1) } catch {}
Fakt 'schattenGB' $sch
if ($null -ne $sch) { Punkt 'Wiederherstellungspunkte (Schattenkopien)' $(if ($sch -ge 10) { 'warn' } else { 'ok' }) ('' + $sch + ' GB') }
# Benutzerprofile: Anzahl, alte Profile, Temp und Downloads der zuletzt benutzten
$prof = @(Get-CimInstance Win32_UserProfile -EA SilentlyContinue | Where-Object { -not $_.Special -and $_.LocalPath -like 'C:\Users\*' })
$alt = @($prof | Where-Object { $_.LastUseTime -and $_.LastUseTime -lt (Get-Date).AddDays(-90) }).Count
Fakt 'profileAnzahl' $prof.Count; Fakt 'profileAlt' $alt
Punkt 'Benutzerprofile auf dem PC' $(if ($alt -ge 5) { 'warn' } else { 'ok' }) ('' + $prof.Count + ' Profil(e), davon ' + $alt + ' seit über 90 Tagen nicht benutzt')
$tmpMax = 0.0; $tmpWer = $null; $dlMax = 0.0; $dlWer = $null
foreach ($pr in @($prof | Sort-Object LastUseTime -Descending | Select-Object -First 5)) {
  $wer2 = Split-Path ([string]$pr.LocalPath) -Leaf
  $t1 = GroesseGrob (Join-Path ([string]$pr.LocalPath) 'AppData\Local\Temp') 2
  if ($t1.gb -gt $tmpMax) { $tmpMax = $t1.gb; $tmpWer = $wer2 }
  $d1 = GroesseGrob (Join-Path ([string]$pr.LocalPath) 'Downloads') 2
  if ($d1.gb -gt $dlMax) { $dlMax = $d1.gb; $dlWer = $wer2 }
}
Fakt 'userTempMaxGB' $tmpMax; Fakt 'userTempMaxWer' $tmpWer; Fakt 'downloadsMaxGB' $dlMax; Fakt 'downloadsMaxWer' $dlWer
Punkt 'Temp-Ordner der Benutzer (größter)' $(if ($tmpMax -ge 3) { 'warn' } else { 'ok' }) ('' + $tmpMax + ' GB' + $(if ($tmpWer) { ' (' + $tmpWer + ')' } else { '' }))
Punkt 'Downloads der Benutzer (größter)' $(if ($dlMax -ge 10) { 'warn' } else { 'ok' }) ('' + $dlMax + ' GB' + $(if ($dlWer) { ' (' + $dlWer + ')' } else { '' }))
`,
  },
  {
    id: 'pfstart', titel: 'Start und Anmeldung (Autostart, Startdauer, Gruppenrichtlinien, neue Programme)', modus: 'system', timeoutMs: 90000,
    ps: EV + String.raw`
function DatenFeldPf($ev, [string]$name) {
  try { $xml = [xml]$ev.ToXml(); $kn = @($xml.Event.EventData.Data | Where-Object { $_.Name -eq $name }); if ($kn.Count) { return [string]$kn[0].'#text' } } catch {}
  return $null
}
function RunNamenPf([string]$schl) { $it = Get-Item -LiteralPath $schl -EA SilentlyContinue; if ($it) { return @($it.Property | Where-Object { $_ -and $_ -ne '(default)' }) }; return @() }
function AusNamenPf([string]$schl) { $erg = @(); $it = Get-Item -LiteralPath $schl -EA SilentlyContinue; if ($it) { foreach ($nx in $it.Property) { $wb = $it.GetValue($nx); if ($wb -is [byte[]] -and $wb.Length -gt 0 -and ($wb[0] -band 1)) { $erg += $nx } } }; return $erg }
$auto = New-Object System.Collections.Generic.List[string]
$ausHk = @(AusNamenPf 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run') + @(AusNamenPf 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run32') + @(AusNamenPf 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder')
foreach ($schl in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run')) { foreach ($nx in @(RunNamenPf $schl)) { if ($ausHk -notcontains $nx) { $auto.Add([string]$nx) } } }
foreach ($fi in @(Get-ChildItem -LiteralPath 'C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp' -File -EA SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' })) { if ($ausHk -notcontains $fi.Name) { $auto.Add([string]$fi.BaseName) } }
$hives = @(Get-ChildItem -LiteralPath 'Registry::HKEY_USERS' -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^S-1-5-21-[\d-]+$' })
foreach ($hv in $hives) {
  $basis = 'Registry::HKEY_USERS\' + $hv.PSChildName
  $ausU = @(AusNamenPf ($basis + '\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run')) + @(AusNamenPf ($basis + '\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder'))
  foreach ($nx in @(RunNamenPf ($basis + '\Software\Microsoft\Windows\CurrentVersion\Run'))) { if ($ausU -notcontains $nx) { $auto.Add([string]$nx) } }
  $pp = [string](Get-ItemProperty -LiteralPath ('HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\' + $hv.PSChildName) -EA SilentlyContinue).ProfileImagePath
  if ($pp) { foreach ($fi in @(Get-ChildItem -LiteralPath (Join-Path $pp 'AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup') -File -EA SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' })) { if ($ausU -notcontains $fi.Name) { $auto.Add([string]$fi.BaseName) } } }
}
$autoU = @($auto | Select-Object -Unique)
$hpAuto = @($autoU | Where-Object { $_ -match '(?i)^HP|\bHP\b' })
Fakt 'autostartAnzahl' $autoU.Count; Fakt 'autostartListe' @($autoU | Select-Object -First 25); Fakt 'hpAutostart' $hpAuto.Count
Punkt 'Autostart-Programme' $(if ($autoU.Count -ge 15) { 'warn' } else { 'ok' }) ('' + $autoU.Count + ' aktiv' + $(if ($autoU.Count) { ': ' + ((@($autoU | Select-Object -First 12)) -join ', ') } else { '' }))
$aufg = @(Get-ScheduledTask -EA SilentlyContinue | Where-Object { $_.State -ne 'Disabled' -and $_.TaskPath -notlike '\Microsoft\*' -and @($_.Triggers | Where-Object { $_.CimClass.CimClassName -match 'Logon|Boot' }).Count -gt 0 })
Fakt 'anmeldeAufgaben' $aufg.Count
Punkt 'Geplante Aufgaben bei Start/Anmeldung' 'info' ('' + $aufg.Count + ' (ohne Microsoft)')
# Startdauer laut Windows (Diagnostics-Performance)
$bp = @(EvSt @{ LogName = 'Microsoft-Windows-Diagnostics-Performance/Operational'; Id = 100; StartTime = (Get-Date).AddDays(-30) } 5)
if ($bp.Count) {
  $zeiten = @($bp | ForEach-Object { [double](DatenFeldPf $_ 'BootTime') } | Where-Object { $_ -gt 0 })
  $letzt = [double](DatenFeldPf $bp[0] 'BootTime'); $post = [double](DatenFeldPf $bp[0] 'BootPostBootTime')
  $mittel = $(if ($zeiten.Count) { [math]::Round(($zeiten | Measure-Object -Average).Average / 1000) } else { $null })
  Fakt 'bootSek' ([math]::Round($letzt / 1000)); Fakt 'bootSekMittel' $mittel; Fakt 'postBootSek' ([math]::Round($post / 1000))
  Punkt 'Startdauer (laut Windows)' $(if ($letzt -ge 120000) { 'warn' } else { 'ok' }) ('zuletzt ' + [math]::Round($letzt / 1000) + ' s, Schnitt ' + $mittel + ' s, davon nach der Anmeldung ' + [math]::Round($post / 1000) + ' s')
} else { Punkt 'Startdauer (laut Windows)' 'info' 'keine Messung vorhanden (Protokoll leer oder nicht lesbar)' }
$br = @(EvSt @{ LogName = 'Microsoft-Windows-Diagnostics-Performance/Operational'; Id = 101, 102, 103, 109; StartTime = (Get-Date).AddDays(-30) } 40)
$brems = @($br | ForEach-Object { $fn = DatenFeldPf $_ 'FriendlyName'; if (-not $fn) { $fn = DatenFeldPf $_ 'Name' }; $fn } | Where-Object { $_ } | Group-Object | Sort-Object Count -Descending | Select-Object -First 5 | ForEach-Object { [string]$_.Name })
Fakt 'bremser' @($brems)
Punkt 'Was den Start bremst (laut Windows, 30 Tage)' $(if ($brems.Count) { 'warn' } else { 'ok' }) $(if ($brems.Count) { $brems -join ', ' } else { 'nichts gemeldet' })
# Gruppenrichtlinien bei Start/Anmeldung
$g1 = EvSt @{ LogName = 'Microsoft-Windows-GroupPolicy/Operational'; Id = 8001 } 1
$g0 = EvSt @{ LogName = 'Microsoft-Windows-GroupPolicy/Operational'; Id = 8000 } 1
$gU = $null; $gC = $null
if ($g1) { $gU = [int](DatenFeldPf $g1 'PolicyElaspedTimeInSeconds') }
if ($g0) { $gC = [int](DatenFeldPf $g0 'PolicyElaspedTimeInSeconds') }
Fakt 'gpoAnmeldungSek' $gU; Fakt 'gpoStartSek' $gC
Punkt 'Gruppenrichtlinien' $(if ($gU -ge 60 -or $gC -ge 60) { 'warn' } elseif ($null -eq $gU -and $null -eq $gC) { 'info' } else { 'ok' }) $(if ($null -eq $gU -and $null -eq $gC) { 'keine Angaben' } else { 'bei der Anmeldung ' + $gU + ' s, beim Start ' + $gC + ' s' })
# Neue Programme der letzten 7 Tage
$grenze = (Get-Date).AddDays(-7).ToString('yyyyMMdd')
$neu = @(foreach ($k in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')) { Get-ItemProperty -Path $k -EA SilentlyContinue | Where-Object { $_.DisplayName -and $_.InstallDate -and ([string]$_.InstallDate) -ge $grenze -and -not $_.SystemComponent } | ForEach-Object { [string]$_.DisplayName } }) | Select-Object -Unique
Fakt 'neueProgramme' @($neu | Select-Object -First 15)
Punkt 'Neu installierte Programme (7 Tage)' 'info' $(if (@($neu).Count) { (@($neu | Select-Object -First 8)) -join ', ' } else { 'keine' })
$hb = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' -Name HiberbootEnabled -EA SilentlyContinue).HiberbootEnabled
Fakt 'schnellstart' ($hb -eq 1)
$kb = EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Boot'; Id = 27 } 1
$art = $null; if ($kb) { $art = [int](DatenFeldPf $kb 'BootType') }
Fakt 'letzterStartArt' $(if ($null -eq $art) { $null } elseif ($art -eq 0) { 'kalt' } elseif ($art -eq 1) { 'schnellstart' } else { 'ruhezustand' })
Punkt 'Schnellstart' 'info' ($(if ($hb -eq 1) { 'an' } else { 'aus' }) + $(if ($null -ne $art) { ' · letzter Start: ' + $(if ($art -eq 0) { 'echter Kaltstart' } elseif ($art -eq 1) { 'Schnellstart (kein echter Neustart)' } else { 'aus dem Ruhezustand' }) } else { '' }))
$os = Get-CimInstance Win32_OperatingSystem -EA SilentlyContinue
if ($os) { Fakt 'uptimeTage' ([math]::Round(((Get-Date) - $os.LastBootUpTime).TotalDays, 1)) }
`,
  },
  {
    id: 'pfdisk', titel: 'Festplatte/SSD (Art, Zustand, Verschleiß, Fehler im Ereignisprotokoll)', modus: 'system', timeoutMs: 90000,
    ps: EV + String.raw`
$cNr = $null; try { $cNr = (Get-Partition -DriveLetter C -EA Stop | Select-Object -First 1).DiskNumber } catch {}
$pd = @(Get-PhysicalDisk -EA SilentlyContinue)
$cd = $null; if ($null -ne $cNr) { $cd = @($pd | Where-Object { [string]$_.DeviceId -eq [string]$cNr }) | Select-Object -First 1 }
if (-not $cd -and $pd.Count) { $cd = $pd[0] }
Fakt 'festplatten' $pd.Count
if ($cd) {
  $typ = [string]$cd.MediaType
  if ($typ -notmatch '^(SSD|HDD)$') { if ([string]$cd.FriendlyName -match '(?i)SSD|NVMe' -or [string]$cd.BusType -eq 'NVMe') { $typ = 'SSD' } elseif ([int64]$cd.SpindleSpeed -gt 0 -and [int64]$cd.SpindleSpeed -lt 100000) { $typ = 'HDD' } else { $typ = 'unbekannt' } }
  Fakt 'cTyp' $typ; Fakt 'cModell' ([string]$cd.FriendlyName); Fakt 'cBus' ([string]$cd.BusType); Fakt 'gesundheit' ([string]$cd.HealthStatus); Fakt 'betrieb' ([string]$cd.OperationalStatus)
  Fakt 'groesseGB' ([math]::Round([double]$cd.Size / 1GB))
  Punkt 'Systemplatte (C:)' $(if ($typ -eq 'HDD') { 'warn' } else { 'ok' }) ([string]$cd.FriendlyName + ' · ' + $typ + ' · ' + [string]$cd.BusType + ' · ' + [math]::Round([double]$cd.Size / 1GB) + ' GB')
  Punkt 'Zustand laut Windows' $(if ([string]$cd.HealthStatus -eq 'Healthy') { 'ok' } elseif ([string]$cd.HealthStatus -eq 'Warning') { 'warn' } else { 'fehler' }) ([string]$cd.HealthStatus + ' / ' + [string]$cd.OperationalStatus)
} else { Punkt 'Systemplatte (C:)' 'info' 'nicht lesbar' }
$krank = @($pd | Where-Object { [string]$_.HealthStatus -ne 'Healthy' } | ForEach-Object { [string]$_.FriendlyName + ' (' + [string]$_.HealthStatus + ')' })
Fakt 'problemPlatten' @($krank)
$wear = $null; $tmp = $null; $lese = $null; $std = $null
try {
  if ($cd) { $rc = $cd | Get-StorageReliabilityCounter -EA Stop; if ($rc) { $wear = $rc.Wear; $tmp = $rc.Temperature; $lese = $rc.ReadErrorsUncorrected; $std = $rc.PowerOnHours } }
} catch {}
Fakt 'verschleiss' $wear; Fakt 'tempC' $tmp; Fakt 'leseFehler' $lese; Fakt 'betriebsStunden' $std
if ($null -ne $wear -or $null -ne $tmp) { Punkt 'SSD-Verschleiß / Temperatur' $(if ($wear -ge 80 -or $tmp -ge 70) { 'warn' } else { 'ok' }) ('Verschleiß ' + $(if ($null -ne $wear) { '' + $wear + ' %' } else { 'unbekannt' }) + ', Temperatur ' + $(if ($null -ne $tmp) { '' + $tmp + ' °C' } else { 'unbekannt' }) + $(if ($std) { ', ' + $std + ' Betriebsstunden' } else { '' })) }
else { Punkt 'SSD-Verschleiß / Temperatur' 'info' 'nicht lesbar (Adminrechte nötig)' }
$smart = $null
try { $sm = @(Get-CimInstance -Namespace 'root\wmi' -ClassName MSStorageDriver_FailurePredictStatus -EA Stop); $smart = @($sm | Where-Object { $_.PredictFailure }).Count -gt 0 } catch {}
Fakt 'smartWarnung' $smart
if ($null -ne $smart) { Punkt 'SMART-Frühwarnung' $(if ($smart) { 'fehler' } else { 'ok' }) $(if ($smart) { 'Festplatte kündigt Ausfall an' } else { 'keine' }) }
$ev = @(EvSt @{ LogName = 'System'; Id = 7, 51, 129, 153, 55, 98; StartTime = (Get-Date).AddDays(-30) } 500)
$e7 = @($ev | Where-Object { $_.Id -eq 7 -and $_.ProviderName -eq 'disk' }).Count
$e51 = @($ev | Where-Object { $_.Id -eq 51 -and $_.ProviderName -eq 'disk' }).Count
$e153 = @($ev | Where-Object { ($_.Id -eq 153 -and $_.ProviderName -eq 'disk') -or ($_.Id -eq 129 -and $_.ProviderName -match '(?i)stor|nvme|iaStor') }).Count
$ntfs = @($ev | Where-Object { $_.ProviderName -match 'Ntfs' -and ($_.Id -eq 55 -or ($_.Id -eq 98 -and $_.Level -le 3)) }).Count
Fakt 'fehlerBloecke30' $e7; Fakt 'auslagerungsFehler30' $e51; Fakt 'ioWiederholt30' $e153; Fakt 'dateisystemFehler30' $ntfs
Punkt 'Fehlerhafte Blöcke (Ereignis 7, 30 Tage)' $(if ($e7) { 'fehler' } else { 'ok' }) ('' + $e7)
Punkt 'E/A-Wiederholungen/Resets (153/129, 30 Tage)' $(if ($e153 -ge 3) { 'warn' } else { 'ok' }) ('' + $e153)
Punkt 'Dateisystemfehler (NTFS 55/98, 30 Tage)' $(if ($ntfs) { 'warn' } else { 'ok' }) ('' + $ntfs + $(if ($e51) { ', dazu ' + $e51 + '× Auslagerungsfehler (51)' } else { '' }))
$vol = Get-Volume -DriveLetter C -EA SilentlyContinue
Fakt 'volumeZustand' $(if ($vol) { [string]$vol.HealthStatus } else { $null })
`,
  },
]

export const THEMEN_LEISTUNG: DgOber[] = [
  {
    id: 'leistung', titel: 'PC langsam & Speicher', symbol: 'Gauge', beschreibung: 'PC ist langsam, Lüfter laut, C: voll, Arbeitsspeicher knapp, Start dauert ewig, Festplatte macht Probleme',
    unter: [
      {
        id: 'pf-langsam', titel: 'PC ist allgemein langsam', beschreibung: 'Alles dauert, Programme öffnen zäh, Fenster ruckeln, „Keine Rückmeldung“ taucht öfter auf',
        sonden: ['pf', 'sys'],
        regeln: [
          { id: 'install', wenn: f => ja(f['pf.installLaeuft']), befund: f => `Im Hintergrund wird gerade installiert (${txt(f['pf.installProzesse']) || 'Windows Installer'})`, problem: 'leistung-softwareverteilung-im-hintergrund', schwere: 3 },
          { id: 'ram-voll', wenn: f => num(f['pf.ramFreiProzent']) < 10, befund: f => `Arbeitsspeicher fast voll: nur ${f['pf.ramFreiProzent']} % frei (größte: ${txt(f['pf.topRam'])})`, problem: 'leistung-arbeitsspeicher-voll', schwere: 3 },
          { id: 'cpu-voll', wenn: f => num(f['pf.cpuProzent']) >= 85, befund: f => `Prozessor ist zu ${f['pf.cpuProzent']} % ausgelastet (größte: ${txt(f['pf.topCpu'])})`, problem: 'leistung-cpu-100-luefter', schwere: 2 },
          { id: 'platte-voll', wenn: f => num(f['sys.cFreiGB']) < 5, befund: f => `Laufwerk C: hat nur noch ${zahl(f['sys.cFreiGB'])} GB frei`, problem: 'leistung-festplatte-voll', schwere: 2 },
          { id: 'disk-100', wenn: f => num(f['pf.datentraegerAktiv']) >= 90, befund: f => `Datenträger ist zu ${f['pf.datentraegerAktiv']} % beschäftigt`, problem: 'leistung-datentraeger-100', schwere: 2 },
          { id: 'defender', wenn: f => num(f['pf.defenderCpu']) >= 10, befund: f => `Virenscanner (Defender) belegt gerade ${zahl(f['pf.defenderCpu'])} % Prozessor`, problem: 'leistung-defender-scan-bremst', schwere: 2 },
          { id: 'energieplan', wenn: f => ja(f['pf.energiesparplan']) || ja(f['pf.overlayEffizienz']) || (num(f['pf.procMaxAc']) >= 0 && num(f['pf.procMaxAc']) < 100), befund: f => `Energieplan bremst: ${txt(f['pf.energieplan'])}${ja(f['pf.overlayEffizienz']) ? ', Energiemodus „Beste Energieeffizienz“' : ''}${num(f['pf.procMaxAc']) < 100 ? `, Prozessor max. ${f['pf.procMaxAc']} %` : ''}`, problem: 'leistung-gedrosselt-energieplan', schwere: 2 },
          { id: 'kein-neustart', wenn: f => num(f['sys.uptimeTage']) >= 14 || ja(f['sys.neustartAusstehend']), befund: f => (num(f['sys.uptimeTage']) >= 14 ? `PC läuft seit ${zahl(f['sys.uptimeTage'])} Tagen ohne Neustart` : 'Ein Neustart nach Updates steht aus') + (ja(f['sys.neustartAusstehend']) && num(f['sys.uptimeTage']) >= 14 ? ', Updates warten auf Neustart' : ''), problem: 'leistung-wochenlang-kein-neustart', schwere: 1 },
        ],
        ohneBefund: ['leistung-pc-sehr-langsam', 'leistung-nur-ein-benutzer-langsam', 'leistung-langsam-nach-update', 'leistung-hp-hintergrunddienste'],
      },
      {
        id: 'pf-cvoll', titel: 'Laufwerk C: ist voll', beschreibung: 'Meldung „Wenig Speicherplatz“, C: im Explorer rot, Updates oder Programme lassen sich nicht installieren',
        sonden: ['pfplatz', 'sys'],
        regeln: [
          { id: 'windows-old', wenn: f => num(f['pfplatz.windowsOldGB']) >= 3, befund: f => `Ordner „Windows.old“ belegt ${zahl(f['pfplatz.windowsOldGB'])} GB`, problem: 'leistung-windows-old-belegt-platz', schwere: 3 },
          { id: 'update-reste', wenn: f => num(f['pfplatz.updateResteGB']) >= 5, befund: f => `Update-Reste belegen ${zahl(f['pfplatz.updateResteGB'])} GB (Download ${zahl(f['pfplatz.swDownloadGB'])}, Übermittlungsoptimierung ${zahl(f['pfplatz.doCacheGB'])}, CBS-Protokolle ${zahl(f['pfplatz.cbsGB'])} GB)`, problem: 'leistung-windows-ordner-gross', schwere: 2 },
          { id: 'imecache', wenn: f => num(f['pfplatz.imecacheGB']) >= 8, befund: f => `Intune-Installationscache (C:\\Windows\\IMECache) belegt ${zahl(f['pfplatz.imecacheGB'])} GB`, problem: 'leistung-imecache-belegt-platz', schwere: 2 },
          { id: 'dumps', wenn: f => num(f['pfplatz.dumpsGB']) >= 2, befund: f => `Absturzabbilder und Fehlerberichte belegen ${zahl(f['pfplatz.dumpsGB'])} GB (MEMORY.DMP ${zahl(f['pfplatz.memoryDmpGB'])} GB)`, problem: 'leistung-speicherabbilder-belegen-platz', schwere: 2 },
          { id: 'user-temp', wenn: f => num(f['pfplatz.userTempMaxGB']) >= 3, befund: f => `Temp-Ordner von ${txt(f['pfplatz.userTempMaxWer'])} belegt ${zahl(f['pfplatz.userTempMaxGB'])} GB`, problem: 'leistung-benutzer-temp-viele-gb', schwere: 2 },
          { id: 'papierkorb', wenn: f => num(f['pfplatz.papierkorbGB']) >= 3, befund: f => `Papierkorb (alle Benutzer) belegt ${zahl(f['pfplatz.papierkorbGB'])} GB`, problem: 'leistung-papierkorb-viele-gb', schwere: 2 },
          { id: 'alte-profile', wenn: f => num(f['pfplatz.profileAlt']) >= 5, befund: f => `${f['pfplatz.profileAlt']} von ${f['pfplatz.profileAnzahl']} Benutzerprofilen wurden seit über 90 Tagen nicht benutzt`, problem: 'leistung-alte-profile-belegen-platz', schwere: 2 },
          { id: 'downloads', wenn: f => num(f['pfplatz.downloadsMaxGB']) >= 10, befund: f => `Downloads-Ordner von ${txt(f['pfplatz.downloadsMaxWer'])} belegt ${zahl(f['pfplatz.downloadsMaxGB'])} GB`, problem: 'leistung-downloads-ordner-voll', schwere: 1 },
        ],
        ohneBefund: ['leistung-festplatte-voll', 'leistung-c-voll-ordner-ergeben-weniger', 'leistung-system-und-reserviert-gross', 'leistung-c-laeuft-immer-wieder-voll', 'leistung-onedrive-belegt-platz'],
      },
      {
        id: 'pf-cpu', titel: 'Lüfter laut / Prozessor dauerhaft hoch', beschreibung: 'Lüfter dreht ständig hoch, Laptop wird warm, im Task-Manager steht die CPU lange bei 80–100 %',
        sonden: ['pf'],
        regeln: [
          { id: 'defender', wenn: f => num(f['pf.defenderCpu']) >= 10, befund: f => `Virenscanner (Defender) belegt ${zahl(f['pf.defenderCpu'])} % Prozessor`, problem: 'leistung-defender-scan-bremst', schwere: 3 },
          { id: 'indexer', wenn: f => num(f['pf.indexerCpu']) >= 10, befund: f => `Suchindexer belegt ${zahl(f['pf.indexerCpu'])} % Prozessor`, problem: 'leistung-suchindexer-last', schwere: 3 },
          { id: 'intune-agent', wenn: f => num(f['pf.imeCpu']) >= 10, befund: f => `Intune-Verwaltungserweiterung (IntuneWindowsAgent/AgentExecutor) belegt ${zahl(f['pf.imeCpu'])} % Prozessor`, problem: 'leistung-intune-agent-cpu', schwere: 3 },
          { id: 'wmi', wenn: f => num(f['pf.wmiCpu']) >= 10, befund: f => `WMI-Anbieterhost (WmiPrvSE) belegt ${zahl(f['pf.wmiCpu'])} % Prozessor`, problem: 'leistung-wmi-provider-host-last', schwere: 3 },
          { id: 'telemetrie', wenn: f => num(f['pf.telemetrieCpu']) >= 10, befund: f => `Kompatibilitäts-Telemetrie (CompatTelRunner) belegt ${zahl(f['pf.telemetrieCpu'])} % Prozessor`, problem: 'leistung-compatibility-telemetry-last', schwere: 2 },
          { id: 'install', wenn: f => ja(f['pf.installLaeuft']), befund: f => `Hintergrundinstallation läuft (${txt(f['pf.installProzesse'])}, ${zahl(f['pf.installCpu'])} % CPU)`, problem: 'leistung-softwareverteilung-im-hintergrund', schwere: 2 },
          { id: 'takt', wenn: f => num(f['pf.drossel37']) > 0 || (num(f['pf.cpuLeistungProzent']) < 50 && num(f['pf.cpuProzent']) >= 30), befund: f => (num(f['pf.drossel37']) > 0 ? `Firmware hat den Prozessor in 7 Tagen ${f['pf.drossel37']}× gedrosselt` : `Prozessor läuft unter Last nur mit ${f['pf.cpuLeistungProzent']} % seines Takts`), problem: 'leistung-prozessor-dauerhaft-niedriger-takt', schwere: 2 },
          { id: 'cpu-hoch', wenn: f => num(f['pf.cpuProzent']) >= 85, befund: f => `Prozessor zu ${f['pf.cpuProzent']} % ausgelastet – Hauptverursacher: ${txt(f['pf.topCpu'])}`, problem: 'leistung-cpu-100-luefter', schwere: 2 },
        ],
        ohneBefund: ['leistung-cpu-100-luefter', 'hardware-laptop-heiss-luefter', 'leistung-explorer-hohe-last', 'leistung-dienst-hohe-last'],
      },
      {
        id: 'pf-ram', titel: 'Arbeitsspeicher voll', beschreibung: 'Programme werden träge, Meldung „Arbeitsspeicher knapp“, Browser-Tabs laden neu, Programme schließen sich',
        sonden: ['pf'],
        regeln: [
          { id: 'ram-voll', wenn: f => num(f['pf.ramFreiProzent']) < 10, befund: f => `Nur ${f['pf.ramFreiProzent']} % Arbeitsspeicher frei – größte Verbraucher: ${txt(f['pf.topRam'])}`, problem: 'leistung-arbeitsspeicher-voll', schwere: 3 },
          { id: 'commit', wenn: f => num(f['pf.commitProzent']) >= 90, befund: f => `Zugesicherter Speicher (RAM + Auslagerung) zu ${f['pf.commitProzent']} % belegt`, problem: 'leistung-meldung-virtueller-speicher', schwere: 3 },
          { id: 'pagefile-aus', wenn: f => ja(f['pf.pagefileAus']), befund: () => 'Die Auslagerungsdatei ist abgeschaltet', problem: 'leistung-auslagerungsdatei-abgeschaltet', schwere: 3 },
          { id: 'wenig-ram', wenn: f => num(f['pf.verbautGB']) > 0 && num(f['pf.verbautGB']) <= 8, befund: f => `Nur ${zahl(f['pf.verbautGB'])} GB Arbeitsspeicher verbaut`, problem: 'leistung-zu-wenig-arbeitsspeicher-verbaut', schwere: 2 },
          { id: 'webview2', wenn: f => num(f['pf.webview2GB']) >= 2, befund: f => `WebView2-Prozesse belegen zusammen ${zahl(f['pf.webview2GB'])} GB`, problem: 'leistung-webview2-viele-prozesse', schwere: 2 },
          { id: 'treiber-leck', wenn: f => num(f['pf.nonPagedMB']) >= 2048, befund: f => `Nicht ausgelagerter Speicher (Treiber) ist ${f['pf.nonPagedMB']} MB groß – Hinweis auf ein Speicherleck`, problem: 'leistung-ram-belegt-ohne-programme', schwere: 2 },
          { id: 'ram-fehlt', wenn: f => num(f['pf.verbautGB']) - num(f['pf.ramGB']) >= 2.5, befund: f => `${zahl(f['pf.verbautGB'])} GB verbaut, aber nur ${zahl(f['pf.ramGB'])} GB nutzbar`, problem: 'leistung-ram-weniger-als-verbaut', schwere: 2 },
          { id: 'pagefile-riesig', wenn: f => num(f['pf.pagefileGB']) >= 30, befund: f => `Auslagerungsdatei ist ${zahl(f['pf.pagefileGB'])} GB groß`, problem: 'leistung-pagefile-sys-riesig', schwere: 1 },
        ],
        ohneBefund: ['leistung-arbeitsspeicher-voll', 'leistung-ram-belegt-ohne-programme', 'leistung-memory-compression', 'leistung-zu-wenig-arbeitsspeicher-verbaut'],
      },
      {
        id: 'pf-start', titel: 'Hochfahren oder Anmelden dauert lange', beschreibung: 'Nach dem Einschalten minutenlang „Bitte warten“ oder „Willkommen“, nach der Anmeldung ist alles zäh',
        sonden: ['pfstart', 'pfdisk', 'sys'],
        regeln: [
          { id: 'hdd', wenn: f => txt(f['pfdisk.cTyp']) === 'HDD', befund: f => `Windows liegt auf einer klassischen Festplatte (HDD: ${txt(f['pfdisk.cModell'])})`, problem: 'leistung-alte-festplatte-hdd', schwere: 3 },
          { id: 'gpo-lang', wenn: f => num(f['pfstart.gpoAnmeldungSek']) >= 60 || num(f['pfstart.gpoStartSek']) >= 60, befund: f => `Gruppenrichtlinien brauchen ${f['pfstart.gpoAnmeldungSek'] ?? '?'} s bei der Anmeldung bzw. ${f['pfstart.gpoStartSek'] ?? '?'} s beim Start`, problem: 'konto-anmeldung-dauert-lange', schwere: 3 },
          { id: 'boot-lang', wenn: f => num(f['pfstart.bootSek']) >= 120, befund: f => `Letzter Start dauerte laut Windows ${f['pfstart.bootSek']} s (Schnitt ${f['pfstart.bootSekMittel']} s)`, problem: 'leistung-hochfahren-langsam', schwere: 2 },
          { id: 'autostart', wenn: f => num(f['pfstart.autostartAnzahl']) >= 15, befund: f => `${f['pfstart.autostartAnzahl']} Programme starten automatisch mit`, problem: 'leistung-nach-anmeldung-minutenlang-zaeh', schwere: 2 },
          { id: 'neues-programm', wenn: f => liste(f['pfstart.neueProgramme']).length > 0 && (num(f['pfstart.bootSek']) >= 60 || liste(f['pfstart.bremser']).length > 0), befund: f => `Seit kurzem neu installiert: ${txt(f['pfstart.neueProgramme'])}`, problem: 'leistung-start-langsam-seit-neuem-programm', schwere: 2 },
          { id: 'bremser', wenn: f => liste(f['pfstart.bremser']).length > 0, befund: f => `Windows meldet als Startbremse: ${txt(f['pfstart.bremser'])}`, problem: 'leistung-hochfahren-langsam', schwere: 1 },
          { id: 'hp-tools', wenn: f => num(f['pfstart.hpAutostart']) >= 2, befund: f => `${f['pfstart.hpAutostart']} HP-Programme starten automatisch mit`, problem: 'leistung-hp-hintergrunddienste', schwere: 1 },
          { id: 'c-voll', wenn: f => num(f['sys.cFreiGB']) < 5, befund: f => `Laufwerk C: hat nur noch ${zahl(f['sys.cFreiGB'])} GB frei`, problem: 'leistung-festplatte-voll', schwere: 1 },
        ],
        ohneBefund: ['leistung-hochfahren-langsam', 'leistung-nach-anmeldung-minutenlang-zaeh', 'konto-anmeldung-dauert-lange'],
      },
      {
        id: 'pf-platte', titel: 'Festplatte macht Probleme oder ist dauernd bei 100 %', beschreibung: 'Datenträger im Task-Manager ständig bei 100 %, PC hängt kurz beim Speichern, Warnung „Festplattenproblem“',
        sonden: ['pfdisk', 'pf'],
        regeln: [
          { id: 'smart', wenn: f => ja(f['pfdisk.smartWarnung']), befund: () => 'Die Festplatte meldet per SMART einen bevorstehenden Ausfall', problem: 'hardware-smart-warnung-beim-start', schwere: 3 },
          { id: 'zustand', wenn: f => f['pfdisk.gesundheit'] != null && txt(f['pfdisk.gesundheit']) !== '' && txt(f['pfdisk.gesundheit']) !== 'Healthy', befund: f => `Windows meldet die Systemplatte als „${txt(f['pfdisk.gesundheit'])}“ (${txt(f['pfdisk.betrieb'])})`, problem: 'hardware-windows-warnung-laufwerk', schwere: 3 },
          { id: 'verschleiss', wenn: f => num(f['pfdisk.verschleiss']) >= 80, befund: f => `SSD-Verschleiß bei ${f['pfdisk.verschleiss']} %`, problem: 'hardware-ssd-verschleiss-hoch', schwere: 3 },
          { id: 'bloecke', wenn: f => num(f['pfdisk.fehlerBloecke30']) > 0, befund: f => `${f['pfdisk.fehlerBloecke30']}× „fehlerhafter Block“ (Ereignis 7) in 30 Tagen`, problem: 'hardware-disk-7-fehlerhafter-block', schwere: 3 },
          { id: 'io-reset', wenn: f => num(f['pfdisk.ioWiederholt30']) >= 3, befund: f => `${f['pfdisk.ioWiederholt30']}× E/A-Wiederholung bzw. Reset der Platte (153/129) in 30 Tagen`, problem: 'hardware-disk-153-129-reset', schwere: 2 },
          { id: 'ntfs', wenn: f => num(f['pfdisk.dateisystemFehler30']) > 0, befund: f => `${f['pfdisk.dateisystemFehler30']}× Dateisystemfehler (NTFS 55/98) in 30 Tagen`, problem: 'leistung-laufwerk-scannen-reparieren-ereignis-98', schwere: 2 },
          { id: 'hdd', wenn: f => txt(f['pfdisk.cTyp']) === 'HDD', befund: f => `Windows liegt auf einer klassischen Festplatte (HDD: ${txt(f['pfdisk.cModell'])})`, problem: 'leistung-alte-festplatte-hdd', schwere: 2 },
          { id: 'disk-100', wenn: f => num(f['pf.datentraegerAktiv']) >= 90, befund: f => `Datenträger ist gerade zu ${f['pf.datentraegerAktiv']} % beschäftigt`, problem: 'leistung-datentraeger-100', schwere: 2 },
        ],
        ohneBefund: ['leistung-datentraeger-100', 'leistung-ssd-fehler', 'hardware-ssd-fehler'],
      },
    ],
  },
]
