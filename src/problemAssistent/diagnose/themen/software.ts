// ── Diagnose-Thema „Updates & Software“ ──────────────────────────────────────
// Sonden: upwu (Windows Update: Dienst, Richtlinie, Verlauf, Fehlercodes, ausstehender Neustart)
//         upsw (Installationen: Windows Installer, MSI-Fehler, Laufzeiten, Abstürze, Adminrechte/UAC)
//         upcm (Softwarecenter/ConfigMgr und Unternehmensportal/Intune)
//         uphp (Hersteller, BIOS-Alter, Geräte mit Treiberfehlern, Grafiktreiber)
// Alles NUR LESEND.
import { ja, liste, nein, num, txt, zahl } from '../motor'
import type { DgFakten, DgOber, DgSonde } from '../types'

/** Enthält die Liste einen der Werte (ohne Groß/Klein)? Fehlender Fakt ⇒ false. */
const hat = (f: DgFakten, k: string, ...werte: string[]): boolean => liste(f[k]).some(x => werte.includes(String(x).toLowerCase()))
const welche = (f: DgFakten, k: string, ...werte: string[]): string => liste(f[k]).filter(x => werte.includes(String(x).toLowerCase())).join(', ')

export const SONDEN_SOFTWARE: DgSonde[] = [
  {
    id: 'upwu', titel: 'Windows Update (Dienst, Richtlinie, Verlauf, Fehlercodes, Neustart)', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
function EvUp([hashtable]$h, [int]$max) { try { return @(Get-WinEvent -FilterHashtable $h -MaxEvents $max -EA Stop) } catch { return @() } }
$cv = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -EA SilentlyContinue
Fakt 'version' $(if ($cv) { ([string]$cv.DisplayVersion + ' (Build ' + [string]$cv.CurrentBuild + '.' + [string]$cv.UBR + ')').Trim() } else { $null })
$wu = Get-Service -Name wuauserv -EA SilentlyContinue
Fakt 'dienst' $(if ($wu) { [string]$wu.Status } else { $null }); Fakt 'dienstStart' $(if ($wu) { [string]$wu.StartType } else { $null })
$bits = Get-Service -Name BITS -EA SilentlyContinue
Fakt 'bitsStart' $(if ($bits) { [string]$bits.StartType } else { $null })
Punkt 'Dienst Windows Update' $(if (-not $wu -or [string]$wu.StartType -eq 'Disabled') { 'fehler' } else { 'ok' }) $(if (-not $wu) { 'fehlt' } else { [string]$wu.Status + ', Start ' + [string]$wu.StartType + $(if ($bits) { ' · BITS ' + [string]$bits.StartType } else { '' }) })
$pol = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' -EA SilentlyContinue
$gesperrt = [bool]($pol -and $pol.DisableWindowsUpdateAccess -eq 1)
Fakt 'richtlinieGesperrt' $gesperrt
Fakt 'wsus' $(if ($pol -and $pol.WUServer) { [string]$pol.WUServer } else { $null })
Fakt 'treiberAusgeschlossen' ([bool]($pol -and $pol.ExcludeWUDriversInQualityUpdate -eq 1))
Punkt 'Update-Richtlinie' $(if ($gesperrt) { 'warn' } else { 'ok' }) $(if ($gesperrt) { 'Zugriff auf Windows Update per Richtlinie gesperrt' } elseif ($pol -and $pol.WUServer) { 'Updates über ' + [string]$pol.WUServer } else { 'Microsoft Update direkt' })
# Verlauf aus dem Ereignisprotokoll (19 = erfolgreich, 20 = fehlgeschlagen)
$wl = EvUp @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WindowsUpdateClient'; Id = 19, 20; StartTime = (Get-Date).AddDays(-60) } 600
$echt = @($wl | Where-Object { $_.Id -eq 19 -and $_.Message -match 'KB\d{6,8}' -and $_.Message -notmatch 'KB2267602' })
$fe = @($wl | Where-Object { $_.Id -eq 20 -and $_.TimeCreated -gt (Get-Date).AddDays(-30) -and $_.Message -notmatch '\b9[A-Z0-9]{11}-|\b(Microsoft|MicrosoftWindows|Clipchamp)\.[A-Za-z]' })
$storeF = @($wl | Where-Object { $_.Id -eq 20 -and $_.TimeCreated -gt (Get-Date).AddDays(-30) }).Count - $fe.Count
$codes = @($fe | ForEach-Object { if ([string]$_.Message -match '0x[0-9A-Fa-f]{8}') { $Matches[0].ToLower() } } | Select-Object -Unique)
$letzt = $echt | Sort-Object TimeCreated -Descending | Select-Object -First 1
$tage = $(if ($letzt) { [math]::Round(((Get-Date) - $letzt.TimeCreated).TotalDays, 0) } else { 61 })
Fakt 'erfolg60' $echt.Count; Fakt 'fehler30' $fe.Count; Fakt 'fehlerCodes' @($codes); Fakt 'tageSeitErfolg' $tage
$kbF = @($fe | ForEach-Object { if ([string]$_.Message -match 'KB\d{6,8}') { $Matches[0] } } | Group-Object | Sort-Object Count -Descending | Select-Object -First 1)
$kbE = @($echt | Where-Object { $_.TimeCreated -gt (Get-Date).AddDays(-30) } | ForEach-Object { if ([string]$_.Message -match 'KB\d{6,8}') { $Matches[0] } } | Group-Object | Sort-Object Count -Descending | Select-Object -First 1)
Fakt 'kbFehlerMax' $(if ($kbF.Count) { [int]$kbF[0].Count } else { 0 }); Fakt 'kbFehler' $(if ($kbF.Count) { [string]$kbF[0].Name } else { $null })
Fakt 'kbErfolgMax' $(if ($kbE.Count) { [int]$kbE[0].Count } else { 0 }); Fakt 'kbErfolg' $(if ($kbE.Count) { [string]$kbE[0].Name } else { $null })
$trb = @($wl | Where-Object { $_.Id -eq 19 -and $_.TimeCreated -gt (Get-Date).AddDays(-30) -and $_.Message -match '(?i)driver|treiber|firmware' }).Count
Fakt 'treiberUpdates30' $trb
Punkt 'Letztes Windows-Update' $(if ($tage -ge 45) { 'fehler' } elseif ($tage -ge 30) { 'warn' } else { 'ok' }) $(if ($letzt) { 'vor ' + $tage + ' Tagen' } else { 'seit über 60 Tagen keins' })
Punkt 'Fehlgeschlagene Updates (30 Tage)' $(if ($fe.Count -ge 3) { 'fehler' } elseif ($fe.Count) { 'warn' } else { 'ok' }) ($(if ($fe.Count) { '' + $fe.Count + ' – Codes: ' + ($codes -join ', ') + $(if ($kbF.Count -and $kbF[0].Count -ge 2) { ' · ' + $kbF[0].Name + ' ' + $kbF[0].Count + '× gescheitert' } else { '' }) } else { 'keine' }) + $(if ($storeF -gt 0) { ' (dazu ' + $storeF + ' Store-App-Updates, nicht gewertet)' } else { '' }))
if ($kbE.Count -and $kbE[0].Count -ge 3) { Punkt 'Gleiches Update mehrfach' 'warn' ($kbE[0].Name + ' wurde ' + $kbE[0].Count + '× installiert (30 Tage)') }
# Ausstehender Neustart (mit Grund)
$gr = @()
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') { $gr += 'Windows-Komponenten' }
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') { $gr += 'Windows Update' }
$pfr = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -EA SilentlyContinue).PendingFileRenameOperations
if ($pfr) { $gr += 'Dateien ersetzen' }
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\SMS\Mobile Client\Reboot Management\RebootData') { $gr += 'Softwarecenter' }
Fakt 'neustartGruende' @($gr)
$hb = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' -Name HiberbootEnabled -EA SilentlyContinue).HiberbootEnabled
Fakt 'schnellstart' ($hb -eq 1)
$nst = @(EvUp @{ LogName = 'System'; ProviderName = 'User32'; Id = 1074; StartTime = (Get-Date).AddDays(-14) } 100 | Where-Object { $_.Message -match '(?i)NT-AUTORIT.T\\SYSTEM|NT AUTHORITY\\SYSTEM' }).Count
Fakt 'systemNeustarts14' $nst
Punkt 'Neustart ausstehend' $(if ($gr.Count) { 'warn' } else { 'ok' }) $(if ($gr.Count) { 'ja – ' + ($gr -join ', ') } else { 'nein' })
Punkt 'Schnellstart / automatische Neustarts' $(if ($nst -ge 3) { 'warn' } else { 'info' }) ('Schnellstart ' + $(if ($hb -eq 1) { 'AN (Herunterfahren ist kein echter Neustart)' } else { 'aus' }) + ', ' + $nst + ' Neustart(s) durch das System in 14 Tagen')
$ti = @(Get-Process -Name TiWorker, TrustedInstaller -EA SilentlyContinue).Count -gt 0
Fakt 'installiertGerade' $ti
if ($ti) { Punkt 'Update-Installation läuft' 'info' 'TiWorker/TrustedInstaller ist gerade aktiv' }
`,
  },
  {
    id: 'upsw', titel: 'Installationen und Programme (Windows Installer, MSI-Fehler, Laufzeiten, Abstürze, Adminrechte)', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
function EvSw([hashtable]$h, [int]$max) { try { return @(Get-WinEvent -FilterHashtable $h -MaxEvents $max -EA Stop) } catch { return @() } }
# Windows Installer
$inPr = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Installer\InProgress'
$msiN = @(Get-Process -Name msiexec -EA SilentlyContinue).Count
Fakt 'installerLaeuft' ([bool]($inPr -or $msiN -ge 2)); Fakt 'msiexecAnzahl' $msiN
$ms = Get-Service -Name msiserver -EA SilentlyContinue
Fakt 'msiDienstStart' $(if ($ms) { [string]$ms.StartType } else { $null })
$dm = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Installer' -Name DisableMSI -EA SilentlyContinue).DisableMSI
Fakt 'msiVerboten' ($dm -eq 2)
Punkt 'Windows Installer' $(if ($inPr -or $msiN -ge 2) { 'warn' } elseif (-not $ms -or [string]$ms.StartType -eq 'Disabled' -or $dm -eq 2) { 'fehler' } else { 'ok' }) $(if ($inPr -or $msiN -ge 2) { 'eine Installation läuft gerade (' + $msiN + '× msiexec)' } elseif (-not $ms) { 'Dienst fehlt' } elseif ([string]$ms.StartType -eq 'Disabled') { 'Dienst DEAKTIVIERT' } elseif ($dm -eq 2) { 'per Richtlinie verboten' } else { 'bereit' })
$mi = EvSw @{ LogName = 'Application'; ProviderName = 'MsiInstaller'; Id = 1033, 1034, 11708; StartTime = (Get-Date).AddDays(-14) } 300
$fehl = @()
foreach ($x in $mi) {
  $st = $null
  if ($x.Id -eq 11708) { $st = 1603 } else { try { $st = [int][string]$x.Properties[3].Value } catch {} }
  if ($st -and $st -ne 3010 -and $st -ne 1641) { $fehl += [pscustomobject]@{ c = [string]$st; n = $(try { [string]$x.Properties[0].Value } catch { '' }) } }
}
$mc = @($fehl | ForEach-Object { $_.c } | Select-Object -Unique)
$mn = @($fehl | ForEach-Object { $_.n } | Where-Object { $_ -and $_ -notmatch '^\(NULL\)$' } | Select-Object -Unique | Select-Object -First 4)
Fakt 'msiFehler14' $fehl.Count; Fakt 'msiCodes' @($mc); Fakt 'msiProdukte' @($mn)
Punkt 'Gescheiterte Installationen (14 Tage)' $(if ($fehl.Count) { 'warn' } else { 'ok' }) $(if ($fehl.Count) { '' + $fehl.Count + ' – Fehler ' + ($mc -join ', ') + $(if ($mn.Count) { ' (' + ($mn -join ', ') + ')' } else { '' }) } else { 'keine' })
# Laufzeiten
$n35 = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v3.5' -Name Install -EA SilentlyContinue).Install -eq 1
$vc64 = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64' -Name Installed -EA SilentlyContinue).Installed -eq 1
$vc86 = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x86' -Name Installed -EA SilentlyContinue).Installed -eq 1
$apps = @(foreach ($k in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')) { Get-ItemProperty -Path $k -EA SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object { [string]$_.DisplayName } })
$java = [bool](@($apps | Where-Object { $_ -match '(?i)^Java( \d|\(TM\))|OpenJDK|Temurin|Corretto|Zulu|\bJRE\b' }).Count)
$dnd = @($apps | Where-Object { $_ -match '(?i)Windows Desktop Runtime' } | ForEach-Object { if ($_ -match '(\d+)\.\d+\.\d+') { $Matches[1] } } | Select-Object -Unique)
Fakt 'dotnet35' $n35; Fakt 'vcx64' $vc64; Fakt 'vcx86' $vc86; Fakt 'java' $java; Fakt 'dotnetDesktop' @($dnd)
Punkt 'Laufzeitumgebungen' $(if (-not $vc64 -or -not $vc86) { 'warn' } else { 'ok' }) ('Visual C++ 2015–2022: x64 ' + $(if ($vc64) { 'ja' } else { 'FEHLT' }) + ', x86 ' + $(if ($vc86) { 'ja' } else { 'FEHLT' }) + ' · .NET 3.5 ' + $(if ($n35) { 'ja' } else { 'nein' }) + ' · .NET Desktop ' + $(if ($dnd.Count) { ($dnd -join '/') } else { 'keine' }) + ' · Java ' + $(if ($java) { 'ja' } else { 'nein' }))
# Abstürze und Startfehler
$ab = EvSw @{ LogName = 'Application'; ProviderName = 'Application Error'; Id = 1000; StartTime = (Get-Date).AddDays(-7) } 300
$abApps = @($ab | ForEach-Object { try { [string]$_.Properties[0].Value } catch { '' } } | Where-Object { $_ } | Group-Object | Sort-Object Count -Descending | Select-Object -First 3)
Fakt 'abstuerze7' $ab.Count; Fakt 'absturzApps' @($abApps | ForEach-Object { $_.Name + ' (' + $_.Count + '×)' })
$dn = @(EvSw @{ LogName = 'Application'; ProviderName = '.NET Runtime'; Id = 1026; StartTime = (Get-Date).AddDays(-7) } 100).Count
$sxs = @(EvSw @{ LogName = 'Application'; ProviderName = 'SideBySide'; StartTime = (Get-Date).AddDays(-7) } 100 | Where-Object { $_.LevelDisplayName -and $_.Level -le 2 }).Count
$c7b = @(EvSw @{ LogName = 'System'; ProviderName = 'Application Popup'; Id = 26; StartTime = (Get-Date).AddDays(-7) } 100 | Where-Object { $_.Message -match '(?i)c000007b|c0000142' }).Count
Fakt 'dotnetAbsturz7' $dn; Fakt 'sxsFehler7' $sxs; Fakt 'startFehler7' $c7b
Punkt 'Programmabstürze (7 Tage)' $(if ($ab.Count -ge 5) { 'fehler' } elseif ($ab.Count) { 'warn' } else { 'ok' }) $(if ($ab.Count) { '' + $ab.Count + ': ' + (@($abApps | ForEach-Object { $_.Name + ' ' + $_.Count + '×' }) -join ', ') } else { 'keine' })
if ($dn -or $sxs -or $c7b) { Punkt 'Startfehler' 'warn' ('' + $dn + '× .NET-Laufzeitfehler, ' + $sxs + '× Side-by-Side, ' + $c7b + '× 0xc000007b/0xc0000142') }
# Benutzerkontensteuerung und Adminrechte
$uk = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -EA SilentlyContinue
Fakt 'uacAus' ([bool]($uk -and $uk.EnableLUA -eq 0)); Fakt 'uacBenutzerVerweigert' ([bool]($uk -and $uk.ConsentPromptBehaviorUser -eq 0))
$angem = $null; try { $angem = [string](Get-CimInstance Win32_ComputerSystem -EA Stop).UserName } catch {}
$istAdmin = $null
if ($angem) {
  try {
    $gn = ((New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')).Translate([System.Security.Principal.NTAccount]).Value -split '\\')[-1]
    $grp = [ADSI]('WinNT://./' + $gn + ',group')
    $pfade = @($grp.Invoke('Members') | ForEach-Object { [string]$_.GetType().InvokeMember('ADsPath', 'GetProperty', $null, $_, $null) })
    $soll = ($angem -replace '\\', '/')
    $istAdmin = [bool](@($pfade | Where-Object { $_ -match ('(?i)/' + [regex]::Escape($soll) + '$') }).Count)
  } catch {}
}
Fakt 'benutzerIstAdmin' $istAdmin
Punkt 'Benutzerkontensteuerung' $(if ($uk -and $uk.EnableLUA -eq 0) { 'warn' } else { 'ok' }) ($(if ($uk -and $uk.EnableLUA -eq 0) { 'AUS' } else { 'an' }) + $(if ($uk -and $uk.ConsentPromptBehaviorUser -eq 0) { ', Admin-Anfragen von Benutzern werden automatisch ABGELEHNT' } else { '' }) + $(if ($null -ne $istAdmin) { ' · angemeldeter Benutzer ist ' + $(if ($istAdmin) { 'lokaler ADMINISTRATOR' } else { 'kein lokaler Administrator' }) } else { '' }))
$lay = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers' -EA SilentlyContinue
$ra = @(); if ($lay) { $ra = @($lay.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' -and [string]$_.Value -match 'RUNASADMIN' } | ForEach-Object { Split-Path $_.Name -Leaf }) }
Fakt 'kompatAdmin' @($ra)
if ($ra.Count) { Punkt 'Kompatibilität „Als Administrator ausführen“' 'info' ($ra -join ', ') }
$jus = @(Get-Process -Name jusched -EA SilentlyContinue).Count -gt 0
Fakt 'javaUpdater' $jus
if ($jus) { Punkt 'Java-Updater' 'info' 'jusched.exe läuft (fragt nach Adminrechten)' }
`,
  },
  {
    id: 'upcm', titel: 'Softwarecenter (ConfigMgr) und Unternehmensportal (Intune)', modus: 'system', timeoutMs: 120000,
    ps: String.raw`
function EvCm([hashtable]$h, [int]$max) { try { return @(Get-WinEvent -FilterHashtable $h -MaxEvents $max -EA Stop).Count } catch { return 0 } }
$cc = Get-Service -Name CcmExec -EA SilentlyContinue
Fakt 'ccmInstalliert' ([bool]$cc); Fakt 'ccmDienst' $(if ($cc) { [string]$cc.Status } else { $null })
$ver = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\SMS\Mobile Client' -Name ProductVersion -EA SilentlyContinue).ProductVersion
$scx = Test-Path 'C:\Windows\CCM\ClientUX\SCClient.exe'
Fakt 'softwarecenter' $scx
Punkt 'ConfigMgr-Client (Softwarecenter)' $(if (-not $cc) { 'info' } elseif ($cc.Status -ne 'Running') { 'fehler' } else { 'ok' }) $(if (-not $cc) { 'nicht installiert' } else { [string]$cc.Status + $(if ($ver) { ', Version ' + $ver } else { '' }) + $(if (-not $scx) { ', SCClient.exe fehlt' } else { '' }) })
$apF = @(); $apC = @(); $apW = 0; $apI = 0; $updF = 0; $cmOk = $false
if ($cc) {
  try {
    $ap = @(Get-CimInstance -Namespace 'root/ccm/ClientSDK' -ClassName CCM_Application -EA Stop -OperationTimeoutSec 30)
    $cmOk = $true
    $apF = @($ap | Where-Object { $_.EvaluationState -eq 13 -or ($_.ErrorCode -and [string]$_.InstallState -ne 'Installed') })
    $apC = @($apF | ForEach-Object { '0x{0:X8}' -f $_.ErrorCode } | Where-Object { $_ -ne '0x00000000' } | ForEach-Object { $_.ToLower() } | Select-Object -Unique)
    $apW = @($ap | Where-Object { $_.EvaluationState -eq 14 }).Count
    $apI = @($ap | Where-Object { $_.EvaluationState -in 5, 7 }).Count
  } catch {}
  try { $updF = @(Get-CimInstance -Namespace 'root/ccm/ClientSDK' -ClassName CCM_SoftwareUpdate -EA Stop -OperationTimeoutSec 30 | Where-Object { $_.EvaluationState -eq 13 }).Count } catch {}
}
Fakt 'appsFehler' @($apF | ForEach-Object { [string]$_.Name } | Select-Object -First 5); Fakt 'appFehlerCodes' @($apC)
Fakt 'appsWartenWartungsfenster' $apW; Fakt 'appsLaufen' $apI; Fakt 'updatesFehler' $updF
if ($cc) { Punkt 'Softwarecenter-Installationen' $(if ($apF.Count -or $updF) { 'fehler' } elseif (-not $cmOk) { 'info' } else { 'ok' }) $(if (-not $cmOk) { 'nicht abfragbar (Adminrechte nötig)' } else { '' + $apF.Count + ' Anwendung(en) fehlerhaft' + $(if ($apC.Count) { ' (' + ($apC -join ', ') + ')' } else { '' }) + ', ' + $updF + ' Update(s) fehlerhaft, ' + $apI + ' laufen, ' + $apW + ' warten auf das Wartungsfenster' }) }
$cgb = $null; $cmax = $null
if ($cc -and (Test-Path 'C:\Windows\ccmcache')) {
  $sum = 0.0; Get-ChildItem -LiteralPath 'C:\Windows\ccmcache' -Recurse -File -Force -EA SilentlyContinue | ForEach-Object { $sum += $_.Length }
  $cgb = [math]::Round($sum / 1GB, 1)
  try { $cmax = [math]::Round([double](Get-CimInstance -Namespace 'root/ccm/SoftMgmtAgent' -ClassName CacheConfig -EA Stop).Size / 1024, 1) } catch {}
}
Fakt 'cacheGB' $cgb; Fakt 'cacheMaxGB' $cmax
if ($null -ne $cgb) { Punkt 'Softwarecenter-Cache' $(if ($null -ne $cmax -and $cmax -gt 0 -and $cgb -ge 0.9 * $cmax) { 'warn' } else { 'ok' }) ('' + $cgb + ' GB belegt' + $(if ($cmax) { ' von ' + $cmax + ' GB' } else { '' })) }
# Intune / Unternehmensportal
$enr = @(Get-ChildItem -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Enrollments' -EA SilentlyContinue | ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath -EA SilentlyContinue } | Where-Object { $_.ProviderID -eq 'MS DM Server' })
$intune = $enr.Count -gt 0
$ime = Get-Service -Name IntuneManagementExtension -EA SilentlyContinue
$dmw = Get-Service -Name dmwappushservice -EA SilentlyContinue
$cp = $null; try { $cp = [bool](@(Get-AppxPackage -AllUsers -Name 'Microsoft.CompanyPortal' -EA Stop).Count) } catch {}
$mdm = EvCm @{ LogName = 'Microsoft-Windows-DeviceManagement-Enterprise-Diagnostics-Provider/Admin'; Level = 2; StartTime = (Get-Date).AddDays(-7) } 300
$store = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\WindowsStore' -Name RemoveWindowsStore -EA SilentlyContinue).RemoveWindowsStore -eq 1
Fakt 'intuneRegistriert' $intune; Fakt 'imeDienst' $(if ($ime) { [string]$ime.Status } else { $null }); Fakt 'dmwap' $(if ($dmw) { [string]$dmw.StartType } else { $null })
Fakt 'unternehmensportal' $cp; Fakt 'mdmFehler7' $mdm; Fakt 'storeGesperrt' $store
Punkt 'Intune-Registrierung' $(if ($intune) { 'ok' } else { 'info' }) $(if ($intune) { 'registriert' + $(if ($ime) { ', Intune-Erweiterung ' + [string]$ime.Status } else { ', Intune-Erweiterung nicht installiert' }) } else { 'nicht bei Intune registriert' })
if ($intune) {
  Punkt 'Unternehmensportal' $(if ($cp -eq $false) { 'warn' } else { 'ok' }) $(if ($null -eq $cp) { 'nicht prüfbar (Adminrechte nötig)' } elseif ($cp) { 'installiert' } else { 'NICHT installiert' })
  Punkt 'Geräteverwaltung (7 Tage)' $(if ($mdm -ge 20) { 'warn' } else { 'ok' }) ('' + $mdm + ' Fehler im MDM-Protokoll' + $(if ($dmw -and [string]$dmw.StartType -eq 'Disabled') { ', Push-Dienst dmwappushservice DEAKTIVIERT' } else { '' }))
}
`,
  },
  {
    id: 'uphp', titel: 'Treiber und BIOS (Hersteller, BIOS-Alter, Geräte mit Fehlern, Grafiktreiber)', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
$cs = Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue
$bios = Get-CimInstance Win32_BIOS -EA SilentlyContinue
$herst = $(if ($cs) { [string]$cs.Manufacturer } else { '' })
$hp = $herst -match '(?i)^HP|Hewlett'
Fakt 'hersteller' $herst; Fakt 'istHp' $hp; Fakt 'modell' $(if ($cs) { [string]$cs.Model } else { $null })
$bAlter = $null
if ($bios -and $bios.ReleaseDate) { $bAlter = [math]::Round(((Get-Date) - [datetime]$bios.ReleaseDate).TotalDays, 0) }
Fakt 'biosVersion' $(if ($bios) { [string]$bios.SMBIOSBIOSVersion } else { $null }); Fakt 'biosAlterTage' $bAlter
Punkt 'BIOS' $(if ($null -ne $bAlter -and $bAlter -ge 730) { 'warn' } else { 'ok' }) ($herst + ' ' + $(if ($cs) { [string]$cs.Model } else { '' }) + ', BIOS ' + $(if ($bios) { [string]$bios.SMBIOSBIOSVersion } else { '?' }) + $(if ($null -ne $bAlter) { ' vom ' + ([datetime]$bios.ReleaseDate).ToString('dd.MM.yyyy') + ' (' + $bAlter + ' Tage alt)' } else { '' }))
$ger = @(Get-CimInstance Win32_PnPEntity -Filter 'ConfigManagerErrorCode <> 0' -EA SilentlyContinue | Where-Object { $_.ConfigManagerErrorCode -ne 22 -and $_.ConfigManagerErrorCode -ne 45 })
Fakt 'geraeteFehler' $ger.Count; Fakt 'geraeteFehlerNamen' @($ger | Select-Object -First 5 | ForEach-Object { [string]$_.Name + ' (Code ' + $_.ConfigManagerErrorCode + ')' })
Punkt 'Geräte mit Treiberproblem' $(if ($ger.Count) { 'fehler' } else { 'ok' }) $(if ($ger.Count) { (@($ger | Select-Object -First 4 | ForEach-Object { [string]$_.Name + ' (Code ' + $_.ConfigManagerErrorCode + ')' }) -join ', ') } else { 'keine' })
$vc = @(Get-CimInstance Win32_VideoController -EA SilentlyContinue)
$basis = @($vc | Where-Object { $_.Name -match '(?i)Microsoft Basic Display|Microsoft-Standardanzeige|Standard VGA' }).Count -gt 0
$gAlter = $null
foreach ($v in @($vc | Where-Object { $_.DriverDate -and $_.Name -notmatch '(?i)Microsoft|Virtual|DisplayLink|Citrix|Remote' })) { $a2 = [math]::Round(((Get-Date) - [datetime]$v.DriverDate).TotalDays, 0); if ($null -eq $gAlter -or $a2 -gt $gAlter) { $gAlter = $a2 } }
Fakt 'grafikBasistreiber' $basis; Fakt 'grafikTreiberAlterTage' $gAlter
Punkt 'Grafiktreiber' $(if ($basis) { 'fehler' } elseif ($null -ne $gAlter -and $gAlter -ge 730) { 'warn' } else { 'ok' }) ((@($vc | ForEach-Object { [string]$_.Name + ' ' + [string]$_.DriverVersion }) -join ', ') + $(if ($basis) { ' – nur Standardtreiber!' } elseif ($null -ne $gAlter) { ' (Treiber ' + $gAlter + ' Tage alt)' } else { '' }))
$apps = @(foreach ($k in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')) { Get-ItemProperty -Path $k -EA SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object { [string]$_.DisplayName } })
$hpt = @($apps | Where-Object { $_ -match '(?i)HP Image Assistant|HP Support Assistant|HP Client Management Script' } | Select-Object -Unique)
$rtx = [bool](@($apps | Where-Object { $_ -match '(?i)RTX Desktop Manager' }).Count -or @(Get-Process -Name '*RtxDesktopManager*', '*RTXDesktopManager*' -EA SilentlyContinue).Count)
Fakt 'hpTools' @($hpt); Fakt 'rtxDesktopManager' $rtx
if ($hp) { Punkt 'HP-Werkzeuge' 'info' $(if ($hpt.Count) { $hpt -join ', ' } else { 'keine installiert (Treiber über das Admin-Tool „Treiber“ einspielen)' }) }
if ($rtx) { Punkt 'NVIDIA RTX Desktop Manager' 'fehler' 'installiert – bricht Edge/Chrome' }
`,
  },
]

export const THEMEN_SOFTWARE: DgOber[] = [
  {
    id: 'software', titel: 'Updates & Software', symbol: 'Package',
    beschreibung: 'Windows Update hängt, Programm lässt sich nicht installieren, Softwarecenter/Unternehmensportal, Treiber/BIOS, Neustart, Adminrechte',
    unter: [
      {
        id: 'up-wu', titel: 'Windows Update hängt oder schlägt fehl',
        beschreibung: 'Updates bleiben bei einem Prozentwert stehen, „Fehler beim Installieren“, PC bekommt seit Wochen keine Updates',
        sonden: ['upwu', 'sys', 'net'],
        regeln: [
          { id: 'dienst-aus', wenn: f => txt(f['upwu.dienstStart']) === 'Disabled', befund: () => 'Der Dienst „Windows Update“ ist deaktiviert', problem: 'update-fehler-0x80070422-dienst-aus', schwere: 3 },
          { id: 'richtlinie', wenn: f => ja(f['upwu.richtlinieGesperrt']), befund: () => 'Der Zugriff auf Windows Update ist per Richtlinie gesperrt', problem: 'update-fehler-0x8024002e-richtlinie', schwere: 3 },
          { id: 'platz', wenn: f => num(f['sys.cFreiGB']) < 10 || hat(f, 'upwu.fehlerCodes', '0x80070070'), befund: f => num(f['sys.cFreiGB']) < 10 ? `Laufwerk C: hat nur ${zahl(f['sys.cFreiGB'])} GB frei (Updates brauchen 10–20 GB)` : 'Update scheiterte wegen Speicherplatz (0x80070070)', problem: 'update-zu-wenig-speicher', schwere: 3 },
          { id: 'c643', wenn: f => hat(f, 'upwu.fehlerCodes', '0x80070643'), befund: () => 'Update scheitert mit 0x80070643', problem: 'update-fehler-0x80070643', schwere: 3 },
          { id: 'komponente', wenn: f => hat(f, 'upwu.fehlerCodes', '0x80073701', '0x800f0988', '0x80073712', '0x800f081f', '0x800f0831'), befund: f => `Update scheitert wegen beschädigter/fehlender Komponenten (${welche(f, 'upwu.fehlerCodes', '0x80073701', '0x800f0988', '0x80073712', '0x800f081f', '0x800f0831')})`, problem: 'update-fehler-0x80073701', schwere: 3 },
          { id: 'server', wenn: f => hat(f, 'upwu.fehlerCodes', '0x8024402c', '0x80072efd', '0x80072ee2', '0x8024401c', '0x80244022', '0x800f0922') || nein(f['net.internet443']), befund: f => nein(f['net.internet443']) ? 'Der PC erreicht das Internet nicht – Update-Server nicht erreichbar' : `Update-Server nicht erreichbar (${welche(f, 'upwu.fehlerCodes', '0x8024402c', '0x80072efd', '0x80072ee2', '0x8024401c', '0x80244022', '0x800f0922')})`, problem: 'update-server-nicht-erreichbar', schwere: 2 },
          { id: 'fehler', wenn: f => num(f['upwu.fehler30']) >= 3, befund: f => `${f['upwu.fehler30']} fehlgeschlagene Update-Installationen in 30 Tagen (${txt(f['upwu.fehlerCodes'])})`, problem: 'update-fehlercode', schwere: 2 },
          { id: 'veraltet', wenn: f => num(f['upwu.tageSeitErfolg']) >= 45, befund: f => num(f['upwu.tageSeitErfolg']) > 60 ? 'Seit über 60 Tagen wurde kein Windows-Update installiert' : `Letztes Windows-Update vor ${f['upwu.tageSeitErfolg']} Tagen`, problem: 'update-pc-nicht-aktuell', schwere: 2 },
        ],
        ohneBefund: ['update-haengt', 'update-fehlercode', 'update-pc-nicht-aktuell'],
      },
      {
        id: 'up-neustart', titel: 'Neustart wird ständig verlangt oder steht aus',
        beschreibung: '„Neustart erforderlich“ kommt immer wieder, PC startet nachts von selbst neu, gleiches Update jeden Tag',
        sonden: ['upwu', 'sys'],
        regeln: [
          { id: 'lange-an', wenn: f => liste(f['upwu.neustartGruende']).length > 0 && num(f['sys.uptimeTage']) >= 7, befund: f => `Neustart steht aus (${txt(f['upwu.neustartGruende'])}), der PC läuft aber seit ${zahl(f['sys.uptimeTage'])} Tagen ohne Neustart`, problem: 'update-neustart-staendig-verlangt', schwere: 3 },
          { id: 'schnellstart', wenn: f => ja(f['upwu.schnellstart']) && num(f['sys.uptimeTage']) >= 7, befund: f => `Schnellstart ist an – „Herunterfahren“ ist kein Neustart (letzter echter Start vor ${zahl(f['sys.uptimeTage'])} Tagen)`, problem: 'windows-fehler-trotz-herunterfahren', schwere: 2 },
          { id: 'gleiches', wenn: f => num(f['upwu.kbErfolgMax']) >= 3 || num(f['upwu.kbFehlerMax']) >= 3, befund: f => num(f['upwu.kbErfolgMax']) >= 3 ? `${txt(f['upwu.kbErfolg'])} wurde in 30 Tagen ${f['upwu.kbErfolgMax']}× installiert` : `${txt(f['upwu.kbFehler'])} ist in 30 Tagen ${f['upwu.kbFehlerMax']}× gescheitert`, problem: 'update-gleiches-update-jeden-tag', schwere: 3 },
          { id: 'nachts', wenn: f => num(f['upwu.systemNeustarts14']) >= 2, befund: f => `Das System hat in 14 Tagen ${f['upwu.systemNeustarts14']}× selbst neu gestartet (Updates)`, problem: 'update-nachts-automatisch-neugestartet', schwere: 2 },
          { id: 'bc9', wenn: f => hat(f, 'upwu.fehlerCodes', '0x80070bc9', '0x80070bc2'), befund: () => 'Update meldet „Neustart nötig“ (0x80070bc9) auch nach dem Neustart', problem: 'update-fehler-0x80070bc9-neustart-schleife', schwere: 3 },
          { id: 'dateien', wenn: f => liste(f['upwu.neustartGruende']).includes('Dateien ersetzen'), befund: () => 'Beim nächsten Neustart müssen noch Dateien ersetzt werden – Installationen brechen bis dahin ab', problem: 'update-installation-neustart-ausstehend', schwere: 1 },
        ],
        ohneBefund: ['update-neustart-staendig-verlangt', 'update-installation-neustart-ausstehend', 'update-softwarecenter-neustart-countdown'],
      },
      {
        id: 'up-install', titel: 'Programm lässt sich nicht installieren',
        beschreibung: 'Setup bricht ab, „Eine andere Installation wird bereits ausgeführt“, Fehler 1603/1618/1638, Installer-Dienst geht nicht',
        sonden: ['upsw', 'sys'],
        regeln: [
          { id: 'laeuft', wenn: f => ja(f['upsw.installerLaeuft']) || hat(f, 'upsw.msiCodes', '1618'), befund: f => ja(f['upsw.installerLaeuft']) ? `Gerade läuft schon eine Installation (${f['upsw.msiexecAnzahl']}× msiexec)` : 'Installation scheiterte mit 1618 – eine andere lief bereits', problem: 'update-andere-installation-laeuft', schwere: 3 },
          { id: 'dienst', wenn: f => txt(f['upsw.msiDienstStart']) === 'Disabled', befund: () => 'Der Dienst „Windows Installer“ ist deaktiviert', problem: 'update-installer-dienst-fehler', schwere: 3 },
          { id: 'verboten', wenn: f => ja(f['upsw.msiVerboten']) || hat(f, 'upsw.msiCodes', '1625'), befund: () => 'Installationen sind per Richtlinie verboten (1625)', problem: 'update-msi-1625-richtlinie-verbietet', schwere: 3 },
          { id: 'andere-version', wenn: f => hat(f, 'upsw.msiCodes', '1638'), befund: f => `Setup meldet 1638 – eine andere Version ist schon installiert (${txt(f['upsw.msiProdukte'])})`, problem: 'update-msi-1638-andere-version-installiert', schwere: 3 },
          { id: 'neustart', wenn: f => ja(f['sys.neustartAusstehend']), befund: () => 'Ein Neustart steht aus – viele Setups brechen deshalb ab', problem: 'update-installation-neustart-ausstehend', schwere: 2 },
          { id: 'platz', wenn: f => num(f['sys.cFreiGB']) < 5, befund: f => `Laufwerk C: hat nur ${zahl(f['sys.cFreiGB'])} GB frei`, problem: 'update-zu-wenig-speicher', schwere: 2 },
          { id: 'msi-fehler', wenn: f => num(f['upsw.msiFehler14']) > 0, befund: f => `${f['upsw.msiFehler14']} gescheiterte Installation(en) in 14 Tagen (Fehler ${txt(f['upsw.msiCodes'])}${liste(f['upsw.msiProdukte']).length ? ': ' + txt(f['upsw.msiProdukte']) : ''})`, problem: 'update-programm-installation-scheitert', schwere: 2 },
        ],
        ohneBefund: ['update-programm-installation-scheitert', 'update-installer-fehler-2503', 'update-programm-installieren'],
      },
      {
        id: 'up-softwarecenter', titel: 'Softwarecenter oder Unternehmensportal geht nicht',
        beschreibung: 'Softwarecenter öffnet nicht oder ist leer, Installation hängt bei „Wird heruntergeladen“, App aus dem Unternehmensportal installiert nicht',
        sonden: ['upcm', 'net'],
        regeln: [
          { id: 'ccm-dienst', wenn: f => ja(f['upcm.ccmInstalliert']) && txt(f['upcm.ccmDienst']) !== 'Running', befund: f => `Der ConfigMgr-Dienst (CcmExec) läuft nicht (${txt(f['upcm.ccmDienst'])})`, problem: 'update-softwarecenter-oeffnet-nicht', schwere: 3 },
          { id: 'kein-client', wenn: f => nein(f['upcm.ccmInstalliert']) && nein(f['upcm.intuneRegistriert']), befund: () => 'Weder ConfigMgr-Client (Softwarecenter) noch Intune-Registrierung vorhanden', problem: 'update-softwarecenter-oeffnet-nicht', schwere: 2 },
          { id: 'cache', wenn: f => hat(f, 'upcm.appFehlerCodes', '0x87d01201') || (num(f['upcm.cacheMaxGB']) > 0 && num(f['upcm.cacheGB']) >= 0.9 * num(f['upcm.cacheMaxGB'])), befund: f => `Softwarecenter-Cache ist voll (${zahl(f['upcm.cacheGB'])} von ${zahl(f['upcm.cacheMaxGB'])} GB)`, problem: 'update-softwarecenter-cache-voll', schwere: 3 },
          { id: 'download', wenn: f => hat(f, 'upcm.appFehlerCodes', '0x87d00607', '0x87d00215', '0x87d00669'), befund: f => `Inhalt nicht gefunden bzw. Download hängt (${welche(f, 'upcm.appFehlerCodes', '0x87d00607', '0x87d00215', '0x87d00669')})`, problem: 'update-softwarecenter-download-haengt', schwere: 3 },
          { id: 'erkennung', wenn: f => hat(f, 'upcm.appFehlerCodes', '0x87d00324', '0x87d00213'), befund: () => 'Installation lief, wird aber nicht erkannt (0x87D00324)', problem: 'update-softwarecenter-erkennung-0x87d00324', schwere: 3 },
          { id: 'app-fehler', wenn: f => liste(f['upcm.appsFehler']).length > 0, befund: f => `Softwarecenter meldet Fehler bei: ${txt(f['upcm.appsFehler'])}${liste(f['upcm.appFehlerCodes']).length ? ' (' + txt(f['upcm.appFehlerCodes']) + ')' : ''}`, problem: 'update-programm-installation-scheitert', schwere: 2 },
          { id: 'wartungsfenster', wenn: f => num(f['upcm.appsWartenWartungsfenster']) > 0, befund: f => `${f['upcm.appsWartenWartungsfenster']} Installation(en) warten auf das Wartungsfenster`, problem: 'update-softwarecenter-wartungsfenster', schwere: 2 },
          { id: 'intune', wenn: f => ja(f['upcm.intuneRegistriert']) && (nein(f['upcm.unternehmensportal']) || (f['upcm.imeDienst'] != null && txt(f['upcm.imeDienst']) !== 'Running')), befund: f => nein(f['upcm.unternehmensportal']) ? 'Das Unternehmensportal ist nicht installiert' : `Intune-Verwaltungserweiterung läuft nicht (${txt(f['upcm.imeDienst'])})`, problem: 'update-unternehmensportal-app', schwere: 2 },
        ],
        ohneBefund: ['update-softwarecenter-zeigt-programm-nicht', 'update-softwarecenter-oeffnet-nicht', 'update-unternehmensportal-app', 'update-unternehmensportal-fehlt'],
      },
      {
        id: 'up-treiber', titel: 'Treiber oder BIOS veraltet (HP)',
        beschreibung: 'Gerät im Geräte-Manager mit gelbem Ausrufezeichen, Hersteller-Tool meldet Updates, Probleme nach Treiber-Update',
        sonden: ['uphp', 'upwu'],
        regeln: [
          { id: 'geraete', wenn: f => num(f['uphp.geraeteFehler']) > 0, befund: f => `${f['uphp.geraeteFehler']} Gerät(e) mit Treiberproblem: ${txt(f['uphp.geraeteFehlerNamen'])}`, problem: 'update-treiber-bios-veraltet', schwere: 3 },
          { id: 'basis', wenn: f => ja(f['uphp.grafikBasistreiber']), befund: () => 'Grafik läuft nur mit dem Microsoft-Standardtreiber', problem: 'update-treiber-bios-veraltet', schwere: 3 },
          { id: 'rtx', wenn: f => ja(f['uphp.rtxDesktopManager']), befund: () => 'NVIDIA RTX Desktop Manager ist installiert (bricht Edge/Chrome)', problem: 'bildschirm-rtx-desktop-manager', schwere: 3 },
          { id: 'bios', wenn: f => num(f['uphp.biosAlterTage']) >= 730, befund: f => `Das BIOS (${txt(f['uphp.biosVersion'])}) ist ${f['uphp.biosAlterTage']} Tage alt`, problem: 'hardware-bios-firmware', schwere: 2 },
          { id: 'grafik-alt', wenn: f => num(f['uphp.grafikTreiberAlterTage']) >= 730, befund: f => `Der Grafiktreiber ist ${f['uphp.grafikTreiberAlterTage']} Tage alt`, problem: 'update-treiber-bios-veraltet', schwere: 1 },
          { id: 'wu-treiber', wenn: f => num(f['upwu.treiberUpdates30']) >= 3 && nein(f['upwu.treiberAusgeschlossen']), befund: f => `Windows Update hat in 30 Tagen ${f['upwu.treiberUpdates30']} Treiber eingespielt`, problem: 'update-treiber-ueber-windows-update', schwere: 1 },
        ],
        ohneBefund: ['update-treiber-bios-veraltet', 'hardware-bios-firmware', 'update-treiber-ueber-windows-update'],
      },
      {
        id: 'up-programm', titel: 'Programm startet nicht oder stürzt ab',
        beschreibung: 'Doppelklick tut nichts, Programm schließt sich sofort, Meldung „…dll fehlt“, „.NET“ oder „Java“ wird verlangt',
        sonden: ['upsw'],
        fragen: [{ id: 'laufzeit', text: 'Meldet das Programm, dass etwas fehlt (.NET, Java, VCRUNTIME/MSVCP-DLL)?' }],
        regeln: [
          { id: 'abstuerze', wenn: f => num(f['upsw.abstuerze7']) >= 3, befund: f => `${f['upsw.abstuerze7']} Programmabstürze in 7 Tagen: ${txt(f['upsw.absturzApps'])}`, problem: 'update-programm-stuerzt-ab', schwere: 3 },
          { id: 'dotnet-absturz', wenn: f => num(f['upsw.dotnetAbsturz7']) > 0, befund: f => `${f['upsw.dotnetAbsturz7']}× .NET-Laufzeitfehler (Ereignis 1026) in 7 Tagen`, problem: 'update-dotnet-programm-absturz', schwere: 3 },
          { id: 'sxs', wenn: f => num(f['upsw.sxsFehler7']) > 0, befund: f => `${f['upsw.sxsFehler7']}× Side-by-Side-Fehler in 7 Tagen`, problem: 'update-side-by-side-ungueltig', schwere: 3 },
          { id: 'c7b', wenn: f => num(f['upsw.startFehler7']) > 0, befund: f => `${f['upsw.startFehler7']}× „Anwendung konnte nicht korrekt gestartet werden“ (0xc000007b/0xc0000142)`, problem: 'update-start-fehler-0xc000007b', schwere: 3 },
          { id: 'vc', wenn: f => nein(f['upsw.vcx64']) || nein(f['upsw.vcx86']), befund: f => `Visual-C++-Laufzeit 2015–2022 fehlt (${nein(f['upsw.vcx64']) ? 'x64' : ''}${nein(f['upsw.vcx64']) && nein(f['upsw.vcx86']) ? ' und ' : ''}${nein(f['upsw.vcx86']) ? 'x86' : ''})`, problem: 'update-vcredist-fehlt', schwere: 2 },
          { id: 'dotnet35', wenn: f => f['frage.laufzeit'] === 'ja' && nein(f['upsw.dotnet35']), befund: () => '.NET Framework 3.5 ist nicht aktiviert', problem: 'update-dotnet-fehlt', schwere: 2 },
          { id: 'dotnet-desktop', wenn: f => f['frage.laufzeit'] === 'ja' && f['upsw.dotnetDesktop'] != null && liste(f['upsw.dotnetDesktop']).length === 0, befund: () => 'Keine .NET Desktop Runtime (6/8) installiert', problem: 'update-dotnet-runtime-fehlt', schwere: 2 },
          { id: 'java', wenn: f => f['frage.laufzeit'] === 'ja' && nein(f['upsw.java']), befund: () => 'Auf dem PC ist kein Java installiert', problem: 'update-java-fehlt', schwere: 2 },
        ],
        ohneBefund: ['update-programm-startet-nicht', 'update-programm-stuerzt-ab', 'update-programm-verschwunden'],
      },
      {
        id: 'up-admin', titel: 'Programm verlangt Administratorrechte',
        beschreibung: 'Beim Installieren oder Starten kommt „Benutzerkontensteuerung – Administratorkennwort eingeben“ bzw. „Zugriff verweigert“',
        sonden: ['upsw'],
        fragen: [{ id: 'installieren', text: 'Passiert das beim Installieren bzw. Aktualisieren (nicht beim normalen Start)?' }],
        regeln: [
          { id: 'verweigert', wenn: f => ja(f['upsw.uacBenutzerVerweigert']), befund: () => 'Admin-Anfragen von Standardbenutzern werden automatisch abgelehnt (Richtlinie)', problem: 'update-adminrechte-verlangt', schwere: 2 },
          { id: 'kompat', wenn: f => liste(f['upsw.kompatAdmin']).length > 0, befund: f => `„Als Administrator ausführen“ ist als Kompatibilität gesetzt für: ${txt(f['upsw.kompatAdmin'])}`, problem: 'programm-fachprogramm-kompatibilitaet-zuruecksetzen', schwere: 2 },
          { id: 'java-updater', wenn: f => ja(f['upsw.javaUpdater']), befund: () => 'Der Java-Updater (jusched) läuft und verlangt Adminrechte', problem: 'programm-java-update-fenster-jusched', schwere: 2 },
          { id: 'ist-admin', wenn: f => ja(f['upsw.benutzerIstAdmin']), befund: () => 'Der angemeldete Benutzer ist lokaler Administrator – Windows fragt dann nur „Ja/Nein“', problem: 'sicherheit-uac-nur-ja-nein-konto-ist-admin', schwere: 1 },
          { id: 'installation', wenn: f => f['frage.installieren'] === 'ja' && nein(f['upsw.benutzerIstAdmin']), befund: () => 'Installationen brauchen Adminrechte – Software über das Softwarecenter bzw. die IT installieren', problem: 'update-adminrechte-verlangt', schwere: 2 },
          { id: 'beim-start', wenn: f => f['frage.installieren'] === 'nein' && nein(f['upsw.benutzerIstAdmin']), befund: () => 'Das Programm verlangt bei jedem Start Adminrechte', problem: 'programm-fachprogramm-adminrechte-beim-start', schwere: 2 },
        ],
        ohneBefund: ['update-adminrechte-verlangt', 'sicherheit-programm-verlangt-adminrechte', 'programm-fachprogramm-adminrechte-beim-start'],
      },
    ],
  },
]
