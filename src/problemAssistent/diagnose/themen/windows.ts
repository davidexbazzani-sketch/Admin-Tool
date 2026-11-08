// ── Diagnose-Thema „Windows & Oberfläche“ ────────────────────────────────────
// Sonden: winpr (Maschine: Benutzerprofil des Angemeldeten, Profildienst-Fehler, Shell, Abstürze von Explorer/Start/Suche, Dienste)
//         win   (Profil: laufende Shell-Prozesse, Desktop-Pfad, ausgeblendete Symbole, Richtlinien, Benachrichtigungen)
//         winsp (Profil: Sprache, Tastatur, Region/Formate, Standard-Apps/Dateizuordnungen)
// Alles NUR LESEND.
import { ja, liste, nein, num, txt, zahl } from '../motor'
import type { DgOber, DgSonde } from '../types'

export const SONDEN_WINDOWS: DgSonde[] = [
  {
    id: 'winpr', titel: 'Benutzerprofil, Explorer/Start/Suche-Abstürze und Shell-Dienste', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
function EvWp([hashtable]$h, [int]$max) { try { return @(Get-WinEvent -FilterHashtable $h -MaxEvents $max -EA Stop) } catch { return @() } }
$angem = $null; try { $angem = [string](Get-CimInstance Win32_ComputerSystem -EA Stop).UserName } catch {}
$wsid = $null; if ($angem) { try { $wsid = (New-Object System.Security.Principal.NTAccount($angem)).Translate([System.Security.Principal.SecurityIdentifier]).Value } catch {} }
$plk = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList'
$bak = @(Get-ChildItem -LiteralPath $plk -EA SilentlyContinue | Where-Object { $_.PSChildName -like '*.bak' })
Fakt 'bakEintraege' $bak.Count
if ($wsid) {
  $pip = [string](Get-ItemProperty -LiteralPath ($plk + '\' + $wsid) -Name ProfileImagePath -EA SilentlyContinue).ProfileImagePath
  $eigBak = Test-Path -LiteralPath ($plk + '\' + $wsid + '.bak')
  $blatt = $(if ($pip) { Split-Path $pip -Leaf } else { '' })
  $kurz = ($angem -split '\\')[-1]
  $abwOrdner = [bool]($blatt -and $blatt -ine $kurz -and ($blatt -match ('(?i)^' + [regex]::Escape($kurz) + '\.')))
  $wup = Get-CimInstance Win32_UserProfile -Filter ("SID='" + $wsid + "'") -EA SilentlyContinue
  $stat = $(if ($wup) { [int]$wup.Status } else { 0 })
  $tmp = [bool](($pip -match '(?i)\\TEMP(\.[^\\]+)?$') -or ($stat -band 1))
  Fakt 'temporaer' $tmp; Fakt 'beschaedigt' ([bool]($stat -band 8)); Fakt 'roaming' ([bool](($stat -band 2) -or ($stat -band 4)))
  Fakt 'profilOrdner' $blatt; Fakt 'profilOrdnerAbweichend' $abwOrdner; Fakt 'bakEigener' $eigBak
  Punkt 'Benutzerprofil' $(if ($tmp -or $eigBak) { 'fehler' } elseif ($abwOrdner -or ($stat -band 8)) { 'warn' } else { 'ok' }) $(if ($tmp) { 'TEMPORÄRES Profil geladen (' + $pip + ')' } elseif ($eigBak) { 'Profil-Eintrag doppelt (.bak) – Windows lädt ggf. ein temporäres Profil' } elseif ($abwOrdner) { 'neuer Profilordner „' + $blatt + '“ statt „' + $kurz + '“ – alte Daten liegen im alten Ordner' } elseif ($stat -band 8) { 'als beschädigt markiert' } else { $pip + $(if (($stat -band 2) -or ($stat -band 4)) { ' (servergespeichert/verbindlich)' } else { '' }) })
} else {
  Fakt 'temporaer' $null
  Punkt 'Benutzerprofil' 'info' 'kein Benutzer angemeldet'
}
if ($bak.Count) { Punkt 'Profil-Sicherungseinträge (.bak)' 'warn' ('' + $bak.Count + ' Eintrag/Einträge in der ProfileList') }
$pe = EvWp @{ LogName = 'Application'; ProviderName = 'Microsoft-Windows-User Profiles Service'; Level = 2, 3; StartTime = (Get-Date).AddDays(-7) } 200
$pt = @($pe | Where-Object { $_.Id -eq 1511 -or $_.Id -eq 1515 }).Count
Fakt 'profilFehler7' $pe.Count; Fakt 'tempEreignisse7' $pt
Punkt 'Profildienst (7 Tage)' $(if ($pt) { 'fehler' } elseif ($pe.Count -ge 3) { 'warn' } else { 'ok' }) ('' + $pe.Count + ' Warnung(en)/Fehler' + $(if ($pt) { ', davon ' + $pt + '× „mit temporärem Profil angemeldet“' } else { '' }))
$wl = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -EA SilentlyContinue
$shellOk = [bool]($wl -and ([string]$wl.Shell).Trim() -match '(?i)^explorer(\.exe)?$')
Fakt 'shellOk' $shellOk
Punkt 'Windows-Shell' $(if ($shellOk) { 'ok' } else { 'fehler' }) $(if ($shellOk) { 'explorer.exe' } else { 'ungewöhnlich: „' + $(if ($wl) { [string]$wl.Shell } else { '' }) + '“' })
$ab = EvWp @{ LogName = 'Application'; ProviderName = 'Application Error'; Id = 1000; StartTime = (Get-Date).AddDays(-7) } 300
$exA = @($ab | Where-Object { $_.Properties.Count -gt 3 -and [string]$_.Properties[0].Value -ieq 'explorer.exe' })
$mod = @($exA | ForEach-Object { [string]$_.Properties[3].Value } | Group-Object | Sort-Object Count -Descending | Select-Object -First 1)
$stA = @($ab | Where-Object { $_.Properties.Count -gt 0 -and [string]$_.Properties[0].Value -match '(?i)^(StartMenuExperienceHost|ShellExperienceHost|SearchHost|SearchApp|SearchUI)\.exe$' })
$hg = @(EvWp @{ LogName = 'Application'; ProviderName = 'Application Hang'; Id = 1002; StartTime = (Get-Date).AddDays(-7) } 200 | Where-Object { $_.Properties.Count -gt 0 -and [string]$_.Properties[0].Value -ieq 'explorer.exe' }).Count
Fakt 'explorerAbstuerze7' $exA.Count; Fakt 'explorerModul' $(if ($mod.Count) { [string]$mod[0].Name } else { $null }); Fakt 'explorerHaenger7' $hg
Fakt 'startAbstuerze7' $stA.Count; Fakt 'startAbsturzApps' @($stA | ForEach-Object { [string]$_.Properties[0].Value } | Select-Object -Unique)
Punkt 'Explorer (7 Tage)' $(if ($exA.Count -ge 2) { 'fehler' } elseif ($exA.Count -or $hg) { 'warn' } else { 'ok' }) ('' + $exA.Count + ' Absturz/Abstürze' + $(if ($mod.Count) { ' (Modul ' + $mod[0].Name + ')' } else { '' }) + ', ' + $hg + '× „reagiert nicht“')
Punkt 'Startmenü / Suche (7 Tage)' $(if ($stA.Count) { 'fehler' } else { 'ok' }) $(if ($stA.Count) { '' + $stA.Count + ' Absturz/Abstürze: ' + ((@($stA | ForEach-Object { [string]$_.Properties[0].Value } | Select-Object -Unique)) -join ', ') } else { 'keine Abstürze' })
$ws = Get-Service -Name WSearch -EA SilentlyContinue
$sr = Get-Service -Name StateRepository -EA SilentlyContinue
$ax = Get-Service -Name AppXSvc -EA SilentlyContinue
$wp = Get-Service -Name WpnService -EA SilentlyContinue
$wpu = @(Get-Service -Name 'WpnUserService_*' -EA SilentlyContinue | Select-Object -First 1)
Fakt 'suchdienst' $(if ($ws) { [string]$ws.Status } else { $null }); Fakt 'suchdienstStart' $(if ($ws) { [string]$ws.StartType } else { $null })
Fakt 'stateRepository' $(if ($sr) { [string]$sr.Status } else { $null }); Fakt 'appxDienstStart' $(if ($ax) { [string]$ax.StartType } else { $null })
Fakt 'wpnDienst' $(if ($wp) { [string]$wp.Status } else { $null }); Fakt 'wpnUserDienst' $(if ($wpu.Count) { [string]$wpu[0].Status } else { $null })
Punkt 'Dienste für Start/Suche/Benachrichtigungen' $(if (($ws -and $ws.Status -ne 'Running') -or ($sr -and $sr.Status -ne 'Running') -or ($wp -and $wp.Status -ne 'Running') -or ($ax -and [string]$ax.StartType -eq 'Disabled')) { 'fehler' } else { 'ok' }) ('Windows-Suche ' + $(if ($ws) { [string]$ws.Status } else { 'fehlt' }) + ' · Statusrepository ' + $(if ($sr) { [string]$sr.Status } else { 'fehlt' }) + ' · App-Bereitstellung ' + $(if ($ax) { [string]$ax.StartType } else { 'fehlt' }) + ' · Pushbenachrichtigungen ' + $(if ($wp) { [string]$wp.Status } else { 'fehlt' }) + $(if ($wpu.Count) { '/' + [string]$wpu[0].Status } else { '' }))
$axF = @(EvWp @{ LogName = 'Microsoft-Windows-AppXDeploymentServer/Operational'; Level = 2; StartTime = (Get-Date).AddDays(-7) } 300).Count
Fakt 'appxFehler7' $axF
Punkt 'App-Bereitstellung (7 Tage)' $(if ($axF -ge 50) { 'warn' } else { 'ok' }) ('' + $axF + ' Fehler (Windows-Apps wie Start, Einstellungen, Rechner)')
`,
  },
  {
    id: 'win', titel: 'Oberfläche des Benutzers (Explorer, Start, Desktop, Benachrichtigungen)', modus: 'profil', timeoutMs: 90000,
    ps: String.raw`
NeedHive
$lesbar = $true; try { $null = Get-Process -Id $PID -IncludeUserName -EA Stop } catch { $lesbar = $false }
if ($lesbar) {
  $ex = @(); $sm = @(); $se = @(); $ct = @()
  try { $ex = @(UserProcs @('explorer')); $sm = @(UserProcs @('StartMenuExperienceHost')); $se = @(UserProcs @('SearchHost', 'SearchApp')); $ct = @(UserProcs @('ctfmon')) } catch {}
  $haengt = @($ex | Where-Object { -not $_.Responding }).Count -gt 0
  Fakt 'explorerLaeuft' ($ex.Count -gt 0); Fakt 'explorerHaengt' $haengt; Fakt 'startLaeuft' ($sm.Count -gt 0); Fakt 'sucheLaeuft' ($se.Count -gt 0); Fakt 'ctfmonLaeuft' ($ct.Count -gt 0)
  Punkt 'Explorer (Taskleiste/Desktop)' $(if (-not $ex.Count -or $haengt) { 'fehler' } else { 'ok' }) $(if (-not $ex.Count) { 'läuft NICHT' } elseif ($haengt) { 'läuft, reagiert aber NICHT' } else { 'läuft (' + $ex.Count + ' Prozess(e))' })
  Punkt 'Start / Suche / Texteingabe' $(if (-not $ct.Count) { 'warn' } else { 'ok' }) ('Startmenü ' + $(if ($sm.Count) { 'läuft' } else { 'nicht gestartet' }) + ' · Suche ' + $(if ($se.Count) { 'läuft' } else { 'nicht gestartet' }) + ' · Texteingabedienst (ctfmon) ' + $(if ($ct.Count) { 'läuft' } else { 'läuft NICHT – Tippen in Suche/Start geht dann nicht' }))
} else {
  Fakt 'explorerLaeuft' $null
  Punkt 'Prozesse des Benutzers' 'info' 'nicht lesbar (Adminrechte nötig)'
}
$usf = Get-Item -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') -EA SilentlyContinue
$dp = $null; if ($usf) { $dp = [string]$usf.GetValue('Desktop', $null, 'DoNotExpandEnvironmentNames') }
if ($dp) { $dp = [Environment]::ExpandEnvironmentVariables(($dp -ireplace '%USERPROFILE%', $uProf)) }
$dpOk = $null
if ($dp -and $dp -notmatch '^\\\\') { $dpOk = Test-Path -LiteralPath $dp }
Fakt 'desktopPfad' $dp; Fakt 'desktopErreichbar' $dpOk; Fakt 'desktopOneDrive' ([bool]($dp -match '(?i)OneDrive'))
$dn = $(if ($dpOk) { @(Get-ChildItem -LiteralPath $dp -Force -EA SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' }).Count } else { $null })
Fakt 'desktopElemente' $dn
Punkt 'Desktop-Ordner' $(if ($dpOk -eq $false) { 'fehler' } elseif ($null -eq $dpOk) { 'info' } else { 'ok' }) $(if (-not $dp) { 'nicht festgelegt' } elseif ($dpOk -eq $false) { 'NICHT erreichbar: ' + $dp } elseif ($null -eq $dpOk) { $dp + ' (Netzpfad, von hier nicht prüfbar)' } else { $dp + ' (' + $dn + ' Elemente)' })
$adv = Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced') -EA SilentlyContinue
$hide = [bool]($adv -and $adv.HideIcons -eq 1)
$nd = [bool](((Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer') -Name NoDesktop -EA SilentlyContinue).NoDesktop -eq 1) -or ((Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer' -Name NoDesktop -EA SilentlyContinue).NoDesktop -eq 1))
Fakt 'symboleAusgeblendet' $hide; Fakt 'desktopRichtlinie' $nd
Punkt 'Desktopsymbole' $(if ($hide -or $nd) { 'warn' } else { 'ok' }) $(if ($nd) { 'per Richtlinie ausgeblendet' } elseif ($hide) { 'ausgeblendet (Ansicht → Desktopsymbole anzeigen ist aus)' } else { 'sichtbar' })
$ls = $false
foreach ($k in @(($uHive + '\Software\Policies\Microsoft\Windows\Explorer'), 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Explorer')) { $v = Get-ItemProperty -LiteralPath $k -EA SilentlyContinue; if ($v -and ($v.LockedStartLayout -eq 1 -or $v.StartLayoutFile)) { $ls = $true } }
if ((Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer') -Name NoChangeStartMenu -EA SilentlyContinue).NoChangeStartMenu -eq 1) { $ls = $true }
Fakt 'startGesperrt' $ls
if ($ls) { Punkt 'Startmenü-Layout' 'info' 'per Richtlinie vorgegeben bzw. gesperrt' }
$ic = 0.0; Get-ChildItem -LiteralPath (Join-Path $uLocal 'Microsoft\Windows\Explorer') -Filter '*cache_*.db' -File -Force -EA SilentlyContinue | ForEach-Object { $ic += $_.Length }
Fakt 'iconCacheMB' ([math]::Round($ic / 1MB, 0))
Punkt 'Symbol-/Miniaturansichten-Cache' $(if ($ic -ge 1GB) { 'warn' } else { 'ok' }) ('' + [math]::Round($ic / 1MB, 0) + ' MB')
# Benachrichtigungen
$pn = (Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\PushNotifications') -Name ToastEnabled -EA SilentlyContinue).ToastEnabled
$ns = Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings') -EA SilentlyContinue
$aus = [bool]($pn -eq 0 -or ($ns -and $ns.NOC_GLOBAL_SETTING_TOASTS_ENABLED -eq 0))
$pol = [bool](((Get-ItemProperty -LiteralPath ($uHive + '\Software\Policies\Microsoft\Windows\CurrentVersion\PushNotifications') -Name NoToastApplicationNotification -EA SilentlyContinue).NoToastApplicationNotification -eq 1) -or ((Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CurrentVersion\PushNotifications' -Name NoToastApplicationNotification -EA SilentlyContinue).NoToastApplicationNotification -eq 1))
$lock = [bool]($ns -and $ns.NOC_GLOBAL_SETTING_ALLOW_TOASTS_ABOVE_LOCK -eq 0)
$appAus = @(Get-ChildItem -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings') -EA SilentlyContinue | Where-Object { (Get-ItemProperty -LiteralPath $_.PSPath -Name Enabled -EA SilentlyContinue).Enabled -eq 0 } | ForEach-Object { [string]$_.PSChildName })
$teamsAus = [bool](@($appAus | Where-Object { $_ -match '(?i)MSTeams|Teams' }).Count)
$olAus = [bool](@($appAus | Where-Object { $_ -match '(?i)OUTLOOK' }).Count)
$cdm = Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager') -EA SilentlyContinue
$tipps = $(if ($cdm -and $null -ne $cdm.'SubscribedContent-338389Enabled') { [bool]($cdm.'SubscribedContent-338389Enabled' -eq 1) } else { $null })
Fakt 'toastAus' $aus; Fakt 'toastRichtlinie' $pol; Fakt 'sperrbildschirmAus' $lock; Fakt 'appsAus' @($appAus | ForEach-Object { ($_ -split '[!_]')[0] } | Select-Object -First 8)
Fakt 'teamsAus' $teamsAus; Fakt 'outlookAus' $olAus; Fakt 'tippsAn' $tipps
Punkt 'Benachrichtigungen' $(if ($aus -or $pol) { 'fehler' } elseif ($teamsAus -or $olAus) { 'warn' } else { 'ok' }) $(if ($pol) { 'per Richtlinie abgeschaltet' } elseif ($aus) { 'vom Benutzer komplett AUSGESCHALTET' } else { 'an' + $(if ($appAus.Count) { ', aus für: ' + ((@($appAus | ForEach-Object { ($_ -split '[!_]')[0] } | Select-Object -First 6)) -join ', ') } else { '' }) })
Punkt 'Auf dem Sperrbildschirm' 'info' $(if ($lock) { 'Benachrichtigungen werden bei gesperrtem PC NICHT angezeigt' } else { 'werden angezeigt' })
`,
  },
  {
    id: 'winsp', titel: 'Sprache, Tastatur, Formate und Standard-Apps des Benutzers', modus: 'profil', timeoutMs: 60000,
    ps: String.raw`
NeedHive
$namen = @{ '00000407' = 'Deutsch'; '00000409' = 'Englisch (USA)'; '00020409' = 'US-International'; '00000807' = 'Deutsch (Schweiz)'; '00000809' = 'Englisch (UK)'; '0000040C' = 'Französisch'; '00000410' = 'Italienisch'; '00000415' = 'Polnisch (Programmierer)'; '00000405' = 'Tschechisch' }
$upk = $uHive + '\Control Panel\International\User Profile'
$upv = Get-ItemProperty -LiteralPath $upk -EA SilentlyContinue
$spr = @(); if ($upv -and $upv.Languages) { $spr = @($upv.Languages | ForEach-Object { [string]$_ }) }
$lay = @()
foreach ($sp in $spr) { $kk = Get-Item -LiteralPath ($upk + '\' + $sp) -EA SilentlyContinue; if ($kk) { $lay += @($kk.Property | Where-Object { $_ -match '^[0-9A-Fa-f]{4}:[0-9A-Fa-f]{8}$' } | ForEach-Object { ($_ -split ':')[1].ToUpper() }) } }
$pre = Get-ItemProperty -LiteralPath ($uHive + '\Keyboard Layout\Preload') -EA SilentlyContinue
$subst = Get-ItemProperty -LiteralPath ($uHive + '\Keyboard Layout\Substitutes') -EA SilentlyContinue
$pl = @()
if ($pre) { $pl = @($pre.PSObject.Properties | Where-Object { $_.Name -match '^\d+$' } | Sort-Object { [int]$_.Name } | ForEach-Object { $kv = [string]$_.Value; if ($subst -and $subst.PSObject.Properties[$kv]) { [string]$subst.PSObject.Properties[$kv].Value } else { $kv } }) }
if (-not $lay.Count) { $lay = $pl }
$lay = @($lay | ForEach-Object { ([string]$_).ToUpper() } | Select-Object -Unique)
Fakt 'sprachen' @($spr); Fakt 'layouts' @($lay); Fakt 'erstesLayout' $(if ($lay.Count) { [string]$lay[0] } else { $null })
$tg = (Get-ItemProperty -LiteralPath ($uHive + '\Keyboard Layout\Toggle') -Name 'Language Hotkey' -EA SilentlyContinue).'Language Hotkey'
Fakt 'wechselTaste' $(if ($null -ne $tg) { [string]$tg } else { $null })
Punkt 'Tastaturlayouts' $(if ($lay.Count -gt 1) { 'warn' } elseif ($lay.Count -and $lay[0] -ne '00000407') { 'warn' } else { 'ok' }) ($(if ($lay.Count) { (@($lay | ForEach-Object { $(if ($namen.ContainsKey($_)) { $namen[$_] } else { $_ }) }) -join ', ') } else { 'keine gefunden' }) + $(if ($lay.Count -gt 1) { ' – Wechsel mit ' + $(if ($tg -eq '3') { 'Win+Leertaste' } elseif ($tg -eq '2') { 'Strg+Umschalt' } else { 'Alt+Umschalt / Win+Leertaste' }) } else { '' }))
$dsk = Get-ItemProperty -LiteralPath ($uHive + '\Control Panel\Desktop') -EA SilentlyContinue
$ui = $null
if ($dsk -and $dsk.PreferredUILanguages) { $ui = [string]@($dsk.PreferredUILanguages)[0] }
if (-not $ui -and $dsk -and $dsk.MachinePreferredUILanguages) { $ui = [string]@($dsk.MachinePreferredUILanguages)[0] }
if (-not $ui) { $il = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Nls\Language' -Name InstallLanguage -EA SilentlyContinue).InstallLanguage; $ui = $(if ($il -eq '0407') { 'de-DE' } elseif ($il -eq '0409') { 'en-US' } elseif ($il) { 'LCID ' + $il } else { $null }) }
Fakt 'anzeigesprache' $ui
Punkt 'Anzeigesprache' $(if ($ui -and $ui -notmatch '^de') { 'warn' } else { 'ok' }) $(if ($ui) { $ui } else { 'unbekannt' })
$int = Get-ItemProperty -LiteralPath ($uHive + '\Control Panel\International') -EA SilentlyContinue
Fakt 'region' $(if ($int) { [string]$int.LocaleName } else { $null }); Fakt 'dezimal' $(if ($int) { [string]$int.sDecimal } else { $null })
Fakt 'zeitformat' $(if ($int) { [string]$int.sShortTime } else { $null }); Fakt 'ersterWochentag' $(if ($int -and $null -ne $int.iFirstDayOfWeek) { [int]$int.iFirstDayOfWeek } else { $null })
if ($int) { Punkt 'Region und Formate' $(if ($int.sDecimal -ne ',' -or ([string]$int.sShortTime -cmatch 'h|tt') -or ($null -ne $int.iFirstDayOfWeek -and [int]$int.iFirstDayOfWeek -ne 0)) { 'warn' } else { 'ok' }) ([string]$int.LocaleName + ' · Dezimalzeichen „' + [string]$int.sDecimal + '“ · Uhrzeit ' + [string]$int.sShortTime + ' · Datum ' + [string]$int.sShortDate + ' · Woche beginnt ' + $(if ($null -eq $int.iFirstDayOfWeek -or [int]$int.iFirstDayOfWeek -eq 0) { 'Montag' } elseif ([int]$int.iFirstDayOfWeek -eq 6) { 'SONNTAG' } else { 'Tag ' + $int.iFirstDayOfWeek })) }
$anm = (Get-ItemProperty -LiteralPath 'Registry::HKEY_USERS\.DEFAULT\Keyboard Layout\Preload' -Name '1' -EA SilentlyContinue).'1'
Fakt 'anmeldeLayout' $(if ($anm) { ([string]$anm).ToUpper() } else { $null })
Punkt 'Tastatur am Anmeldebildschirm' $(if ($anm -and ([string]$anm).ToUpper() -ne '00000407') { 'warn' } else { 'ok' }) $(if ($anm) { $(if ($namen.ContainsKey(([string]$anm).ToUpper())) { $namen[([string]$anm).ToUpper()] } else { [string]$anm }) } else { 'Standard' })
# Standard-Apps
function UcWs([string]$ext) {
  $b = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\' + $ext
  $id = (Get-ItemProperty -LiteralPath ($b + '\UserChoiceLatest\ProgId') -Name ProgId -EA SilentlyContinue).ProgId
  if (-not $id) { $id = (Get-ItemProperty -LiteralPath ($b + '\UserChoice') -Name ProgId -EA SilentlyContinue).ProgId }
  return [string]$id
}
function KlWs([string]$ext) {
  $kk = Get-Item -LiteralPath ('HKLM:\SOFTWARE\Classes\' + $ext) -EA SilentlyContinue
  $d = $(if ($kk) { [string]$kk.GetValue('') } else { '' })
  if (-not $d) { $kk = Get-Item -LiteralPath ('Registry::HKEY_USERS\' + $uSid + '_Classes\' + $ext) -EA SilentlyContinue; if ($kk) { $d = [string]$kk.GetValue('') } }
  return $d
}
$pdf = UcWs '.pdf'; $zip = UcWs '.zip'; $xml = UcWs '.xml'
$lnkUc = [bool]((Test-Path -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.lnk\UserChoice')) -or (Test-Path -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.lnk\UserChoiceLatest')))
$ohne = @(foreach ($e2 in @('.pdf', '.docx', '.xlsx', '.jpg', '.png', '.txt', '.zip')) { if (-not (UcWs $e2) -and -not (KlWs $e2)) { $e2 } })
$zipKl = KlWs '.zip'
$acro = [bool]((Test-Path 'HKLM:\SOFTWARE\Classes\AcroExch.Document.DC') -or (Test-Path 'HKLM:\SOFTWARE\Classes\Acrobat.Document.DC'))
Fakt 'pdfApp' $pdf; Fakt 'zipApp' $zip; Fakt 'xmlApp' $xml; Fakt 'lnkUserChoice' $lnkUc; Fakt 'ohneZuordnung' @($ohne); Fakt 'zipKlasse' $zipKl; Fakt 'acrobat' $acro
Punkt 'Standard-Apps' $(if ($lnkUc -or $ohne.Count) { 'fehler' } else { 'ok' }) ('PDF → ' + $(if ($pdf) { $pdf } else { 'Systemstandard' }) + ' · ZIP → ' + $(if ($zip) { $zip } elseif ($zipKl) { $zipKl } else { 'NICHTS' }) + ' · XML → ' + $(if ($xml) { $xml } else { 'Systemstandard' }) + $(if ($ohne.Count) { ' · ohne Programm: ' + ($ohne -join ', ') } else { '' }) + $(if ($lnkUc) { ' · Verknüpfungen (.lnk) sind einem Programm zugeordnet – KAPUTT' } else { '' }))
`,
  },
]

const istEdge = (v: unknown): boolean => /MSEdge|AppX[a-z0-9]{20,}/i.test(String(v ?? ''))
const istBrowser = (v: unknown): boolean => /MSEdge|Chrome|Firefox|IE\.|htmlfile/i.test(String(v ?? ''))

export const THEMEN_WINDOWS: DgOber[] = [
  {
    id: 'windows', titel: 'Windows & Oberfläche', symbol: 'Settings',
    beschreibung: 'Startmenü, Taskleiste oder Suche gehen nicht, Explorer hängt, Desktop leer, Sprache/Tastatur falsch, temporäres Profil, falsches Standardprogramm, Benachrichtigungen',
    unter: [
      {
        id: 'win-start', titel: 'Startmenü, Taskleiste oder Suche gehen nicht',
        beschreibung: 'Klick auf Start passiert nichts, Taskleiste eingefroren, Suche findet nichts oder man kann im Suchfeld nicht tippen',
        sonden: ['winpr', 'win', 'sys'],
        regeln: [
          { id: 'start-absturz', wenn: f => num(f['winpr.startAbstuerze7']) > 0, befund: f => `Startmenü/Suche ist in 7 Tagen ${f['winpr.startAbstuerze7']}× abgestürzt (${txt(f['winpr.startAbsturzApps'])})`, problem: 'windows-shellexperiencehost-0xc000027b', schwere: 3 },
          { id: 'statusrepo', wenn: f => f['winpr.stateRepository'] != null && txt(f['winpr.stateRepository']) !== 'Running', befund: f => `Der Dienst „Statusrepository“ läuft nicht (${txt(f['winpr.stateRepository'])}) – Start und Apps öffnen nicht`, problem: 'windows-startmenue-kritischer-fehler', schwere: 3 },
          { id: 'appx-dienst', wenn: f => txt(f['winpr.appxDienstStart']) === 'Disabled', befund: () => 'Der Dienst „App-Bereitstellung“ (AppXSvc) ist deaktiviert', problem: 'windows-startmenue-kritischer-fehler', schwere: 3 },
          { id: 'suchdienst', wenn: f => f['winpr.suchdienst'] != null && txt(f['winpr.suchdienst']) !== 'Running', befund: f => `Der Windows-Suchdienst läuft nicht (${txt(f['winpr.suchdienst'])}, Start ${txt(f['winpr.suchdienstStart'])})`, problem: 'windows-suche-findet-nichts', schwere: 3 },
          { id: 'ctfmon', wenn: f => nein(f['win.ctfmonLaeuft']), befund: () => 'Der Texteingabedienst (ctfmon) läuft nicht – im Suchfeld kann man nicht tippen', problem: 'windows-suchfeld-keine-eingabe', schwere: 3 },
          { id: 'explorer-haengt', wenn: f => ja(f['win.explorerHaengt']), befund: () => 'Der Explorer (Taskleiste) reagiert nicht', problem: 'windows-taskleiste-reagiert-nicht', schwere: 3 },
          { id: 'appx', wenn: f => num(f['winpr.appxFehler7']) >= 50, befund: f => `${f['winpr.appxFehler7']} Fehler bei der App-Bereitstellung in 7 Tagen`, problem: 'windows-einstellungen-oeffnen-nicht', schwere: 1 },
          { id: 'uptime', wenn: f => num(f['sys.uptimeTage']) >= 14, befund: f => `Der PC läuft seit ${zahl(f['sys.uptimeTage'])} Tagen ohne Neustart`, problem: 'windows-taskleiste-reagiert-nicht', schwere: 1 },
        ],
        ohneBefund: ['windows-startmenue-oeffnet-nicht', 'windows-taskleiste-reagiert-nicht', 'windows-suche-findet-nichts', 'windows-suchfeld-keine-eingabe'],
      },
      {
        id: 'win-explorer', titel: 'Explorer hängt oder stürzt ab, Desktop ist leer',
        beschreibung: 'Explorer schließt sich ständig, „Keine Rückmeldung“, schwarzer Bildschirm nur mit Mauszeiger, Desktopsymbole sind weg',
        sonden: ['winpr', 'win'],
        regeln: [
          { id: 'explorer-weg', wenn: f => nein(f['win.explorerLaeuft']), befund: () => 'Der Explorer läuft für den Benutzer nicht – deshalb kein Desktop und keine Taskleiste', problem: 'windows-schwarzer-bildschirm-nach-anmeldung', schwere: 3 },
          { id: 'shell', wenn: f => nein(f['winpr.shellOk']), befund: () => 'Als Windows-Shell ist nicht explorer.exe eingetragen', problem: 'windows-schwarzer-bildschirm-nach-anmeldung', schwere: 3 },
          { id: 'abstuerze', wenn: f => num(f['winpr.explorerAbstuerze7']) >= 2, befund: f => `Explorer ist in 7 Tagen ${f['winpr.explorerAbstuerze7']}× abgestürzt${f['winpr.explorerModul'] ? ' (fehlerhaftes Modul: ' + txt(f['winpr.explorerModul']) + ')' : ''}`, problem: 'windows-explorer-stuerzt-ab', schwere: 3 },
          { id: 'desktop-pfad', wenn: f => nein(f['win.desktopErreichbar']), befund: f => `Der Desktop-Ordner ist nicht erreichbar: ${txt(f['win.desktopPfad'])}`, problem: 'windows-desktop-speicherort-nicht-verfuegbar', schwere: 3 },
          { id: 'symbole-aus', wenn: f => ja(f['win.symboleAusgeblendet']) || ja(f['win.desktopRichtlinie']), befund: f => ja(f['win.desktopRichtlinie']) ? 'Desktopsymbole sind per Richtlinie ausgeblendet' : 'Desktopsymbole sind ausgeblendet (Ansicht → Desktopsymbole anzeigen)', problem: 'windows-desktop-symbole-weg', schwere: 3 },
          { id: 'haengt', wenn: f => ja(f['win.explorerHaengt']) || num(f['winpr.explorerHaenger7']) >= 3, befund: f => ja(f['win.explorerHaengt']) ? 'Explorer reagiert gerade nicht' : `Explorer hat in 7 Tagen ${f['winpr.explorerHaenger7']}× nicht reagiert`, problem: 'windows-explorer-langsam-netzlaufwerk', schwere: 2 },
          { id: 'desktop-onedrive-leer', wenn: f => ja(f['win.desktopOneDrive']) && num(f['win.desktopElemente']) === 0, befund: () => 'Desktop liegt in OneDrive und ist leer – Dateien evtl. noch nicht synchronisiert', problem: 'windows-desktop-symbole-weg', schwere: 1 },
          { id: 'cache', wenn: f => num(f['win.iconCacheMB']) >= 1024, befund: f => `Symbol-/Miniaturansichten-Cache ist ${f['win.iconCacheMB']} MB groß`, problem: 'windows-symbole-vorschau-falsch', schwere: 1 },
        ],
        ohneBefund: ['windows-explorer-stuerzt-ab', 'windows-explorer-langsam-netzlaufwerk', 'windows-desktop-symbole-weg'],
      },
      {
        id: 'win-sprache', titel: 'Sprache, Tastatur oder Region falsch',
        beschreibung: 'Y und Z vertauscht, Sonderzeichen falsch, Windows plötzlich Englisch, Punkt statt Komma, Uhr zeigt AM/PM',
        sonden: ['winsp'],
        regeln: [
          { id: 'layout-falsch', wenn: f => f['winsp.erstesLayout'] != null && !['00000407', '00000807'].includes(txt(f['winsp.erstesLayout'])), befund: f => `Erstes Tastaturlayout ist nicht Deutsch (${txt(f['winsp.erstesLayout'])})`, problem: 'windows-tastatur-falsches-layout', schwere: 3 },
          { id: 'us-intl', wenn: f => liste(f['winsp.layouts']).includes('00020409'), befund: () => 'Tastatur „US-International“ ist installiert (Anführungszeichen erscheinen verzögert)', problem: 'windows-tastatur-us-international', schwere: 3 },
          { id: 'mehrere', wenn: f => liste(f['winsp.layouts']).length > 1, befund: f => `${liste(f['winsp.layouts']).length} Tastaturlayouts installiert (${txt(f['winsp.layouts'])}) – Alt+Umschalt bzw. Win+Leertaste wechselt versehentlich`, problem: 'windows-sprache-wechselt-versehentlich', schwere: 2 },
          { id: 'anzeige', wenn: f => f['winsp.anzeigesprache'] != null && txt(f['winsp.anzeigesprache']) !== '' && !/^de/i.test(txt(f['winsp.anzeigesprache'])), befund: f => `Anzeigesprache ist ${txt(f['winsp.anzeigesprache'])}`, problem: 'windows-anzeigesprache-falsch', schwere: 3 },
          { id: 'dezimal', wenn: f => f['winsp.dezimal'] != null && txt(f['winsp.dezimal']) !== '' && txt(f['winsp.dezimal']) !== ',', befund: f => `Dezimalzeichen ist „${txt(f['winsp.dezimal'])}“ statt Komma`, problem: 'windows-zahlenformat-falsch', schwere: 3 },
          { id: 'ampm', wenn: f => /h|tt/.test(txt(f['winsp.zeitformat'])), befund: f => `Uhrzeit-Format ist „${txt(f['winsp.zeitformat'])}“ (12-Stunden)`, problem: 'windows-uhr-am-pm', schwere: 2 },
          { id: 'sonntag', wenn: f => num(f['winsp.ersterWochentag']) === 6, befund: () => 'Die Woche beginnt am Sonntag', problem: 'windows-kalender-beginnt-sonntag', schwere: 1 },
          { id: 'anmeldung', wenn: f => f['winsp.anmeldeLayout'] != null && !['00000407', '00000807'].includes(txt(f['winsp.anmeldeLayout'])), befund: f => `Am Anmeldebildschirm ist ein anderes Tastaturlayout eingestellt (${txt(f['winsp.anmeldeLayout'])})`, problem: 'windows-anmeldebildschirm-tastatur-englisch', schwere: 2 },
        ],
        ohneBefund: ['windows-tastatur-falsches-layout', 'windows-sprache-wechselt-versehentlich', 'windows-zahlenformat-falsch'],
      },
      {
        id: 'win-profil', titel: 'Temporäres Profil – Einstellungen und Dateien sind weg',
        beschreibung: '„Sie wurden mit einem temporären Profil angemeldet“, Desktop leer, Hintergrund und Einstellungen zurückgesetzt',
        sonden: ['winpr', 'sys'],
        regeln: [
          { id: 'temp', wenn: f => ja(f['winpr.temporaer']), befund: () => 'Der Benutzer ist mit einem TEMPORÄREN Profil angemeldet', problem: 'konto-temporaeres-profil', schwere: 3 },
          { id: 'temp-ereignis', wenn: f => num(f['winpr.tempEreignisse7']) > 0, befund: f => `${f['winpr.tempEreignisse7']}× „mit temporärem Profil angemeldet“ in 7 Tagen`, problem: 'konto-temporaeres-profil', schwere: 3 },
          { id: 'bak', wenn: f => ja(f['winpr.bakEigener']), befund: () => 'Der Profil-Eintrag des Benutzers ist doppelt vorhanden (.bak)', problem: 'konto-temporaeres-profil', schwere: 3 },
          { id: 'neuer-ordner', wenn: f => ja(f['winpr.profilOrdnerAbweichend']), befund: f => `Windows hat einen neuen Profilordner „${txt(f['winpr.profilOrdner'])}“ angelegt – die alten Daten liegen im alten Ordner`, problem: 'konto-neues-profil-ordner', schwere: 3 },
          { id: 'profildienst', wenn: f => num(f['winpr.profilFehler7']) >= 3 || ja(f['winpr.beschaedigt']), befund: f => ja(f['winpr.beschaedigt']) ? 'Das Benutzerprofil ist als beschädigt markiert' : `${f['winpr.profilFehler7']} Warnungen/Fehler des Profildienstes in 7 Tagen`, problem: 'konto-profildienst-anmeldung-fehlgeschlagen', schwere: 2 },
          { id: 'platz', wenn: f => num(f['sys.cFreiGB']) < 3, befund: f => `Laufwerk C: hat nur ${zahl(f['sys.cFreiGB'])} GB frei – das Profil kann nicht geladen werden`, problem: 'konto-profildienst-anmeldung-fehlgeschlagen', schwere: 2 },
          { id: 'roaming', wenn: f => ja(f['winpr.roaming']), befund: () => 'Servergespeichertes bzw. verbindliches Profil – Einstellungen werden bei jeder Anmeldung überschrieben', problem: 'windows-design-wird-zurueckgesetzt', schwere: 1 },
          { id: 'bak-andere', wenn: f => num(f['winpr.bakEintraege']) > 0 && nein(f['winpr.bakEigener']), befund: f => `${f['winpr.bakEintraege']} doppelte Profil-Einträge (.bak) anderer Benutzer`, problem: 'konto-temporaeres-profil', schwere: 1 },
        ],
        ohneBefund: ['konto-temporaeres-profil', 'konto-neues-profil-ordner', 'windows-design-wird-zurueckgesetzt'],
      },
      {
        id: 'win-standardapps', titel: 'Dateien öffnen mit dem falschen Programm',
        beschreibung: 'PDF öffnet im Browser, Doppelklick fragt „Wie möchten Sie die Datei öffnen?“, alle Verknüpfungen öffnen dasselbe Programm',
        sonden: ['winsp'],
        regeln: [
          { id: 'lnk', wenn: f => ja(f['winsp.lnkUserChoice']), befund: () => 'Verknüpfungen (.lnk) sind einem Programm zugeordnet – dadurch öffnen alle Verknüpfungen falsch', problem: 'windows-verknuepfungen-oeffnen-falsch', schwere: 3 },
          { id: 'pdf-browser', wenn: f => ja(f['winsp.acrobat']) && (istEdge(f['winsp.pdfApp']) || istBrowser(f['winsp.pdfApp'])), befund: f => `PDF ist dem Browser zugeordnet (${txt(f['winsp.pdfApp'])}), obwohl Acrobat installiert ist`, problem: 'windows-pdf-oeffnet-im-browser', schwere: 3 },
          { id: 'ohne', wenn: f => liste(f['winsp.ohneZuordnung']).length > 0, befund: f => `Kein Programm zugeordnet für: ${txt(f['winsp.ohneZuordnung'])}`, problem: 'windows-keine-app-zugeordnet', schwere: 3 },
          { id: 'zip', wenn: f => f['winsp.zipKlasse'] != null && txt(f['winsp.zipKlasse']) === '' && txt(f['winsp.zipApp']) === '', befund: () => 'ZIP-Dateien haben keine Zuordnung mehr (Windows-ZIP-Ordner fehlt)', problem: 'windows-zip-zuordnung-weg', schwere: 2 },
          { id: 'xml-browser', wenn: f => istBrowser(f['winsp.xmlApp']), befund: f => `XML-Dateien öffnen im Browser (${txt(f['winsp.xmlApp'])})`, problem: 'programm-xml-oeffnet-im-browser', schwere: 2 },
          { id: 'pdf-fremd', wenn: f => ja(f['winsp.acrobat']) && txt(f['winsp.pdfApp']) !== '' && !istEdge(f['winsp.pdfApp']) && !istBrowser(f['winsp.pdfApp']) && !/Acro/i.test(txt(f['winsp.pdfApp'])), befund: f => `PDF ist einem anderen Programm zugeordnet (${txt(f['winsp.pdfApp'])})`, problem: 'programm-pdf-fremdviewer-uebernimmt', schwere: 2 },
        ],
        ohneBefund: ['windows-falsches-standardprogramm', 'windows-oeffnen-mit-immer-fragen', 'windows-app-standard-zurueckgesetzt'],
      },
      {
        id: 'win-benachrichtigung', titel: 'Benachrichtigungen fehlen oder stören',
        beschreibung: 'Keine Hinweise mehr von Teams/Outlook unten rechts, nichts auf dem Sperrbildschirm, ständig Tipps und Vorschläge',
        sonden: ['win', 'winpr'],
        fragen: [{ id: 'mond', text: 'Ist neben der Uhr eine Glocke mit „Zzz“ bzw. ein Mond (Nicht stören) zu sehen?' }],
        regeln: [
          { id: 'aus', wenn: f => ja(f['win.toastAus']), befund: () => 'Benachrichtigungen sind für den Benutzer komplett ausgeschaltet', problem: 'windows-benachrichtigungen-fehlen', schwere: 3 },
          { id: 'richtlinie', wenn: f => ja(f['win.toastRichtlinie']), befund: () => 'Benachrichtigungen sind per Richtlinie abgeschaltet', problem: 'windows-benachrichtigungen-fehlen', schwere: 3 },
          { id: 'dienst', wenn: f => (f['winpr.wpnDienst'] != null && txt(f['winpr.wpnDienst']) !== 'Running') || (f['winpr.wpnUserDienst'] != null && txt(f['winpr.wpnUserDienst']) !== 'Running'), befund: f => `Der Pushbenachrichtigungsdienst läuft nicht (${txt(f['winpr.wpnDienst'])}/${txt(f['winpr.wpnUserDienst'])})`, problem: 'windows-benachrichtigungen-fehlen', schwere: 3 },
          { id: 'nicht-stoeren', wenn: f => f['frage.mond'] === 'ja', befund: () => '„Nicht stören“ ist eingeschaltet', problem: 'windows-benachrichtigungen-fehlen', schwere: 3 },
          { id: 'teams', wenn: f => ja(f['win.teamsAus']), befund: () => 'Benachrichtigungen für Teams sind in Windows ausgeschaltet', problem: 'teams-benachrichtigungen-fehlen', schwere: 3 },
          { id: 'outlook', wenn: f => ja(f['win.outlookAus']), befund: () => 'Benachrichtigungen für Outlook sind in Windows ausgeschaltet', problem: 'outlook-benachrichtigung', schwere: 3 },
          { id: 'sperrbildschirm', wenn: f => ja(f['win.sperrbildschirmAus']), befund: () => 'Auf dem Sperrbildschirm werden keine Benachrichtigungen angezeigt', problem: 'windows-anrufe-sperrbildschirm-unsichtbar', schwere: 2 },
          { id: 'tipps', wenn: f => ja(f['win.tippsAn']), befund: () => 'Windows-Tipps und -Vorschläge sind eingeschaltet', problem: 'windows-tipps-vorschlaege-benachrichtigung', schwere: 1 },
        ],
        ohneBefund: ['windows-benachrichtigungen-fehlen', 'windows-anrufe-sperrbildschirm-unsichtbar', 'windows-tipps-vorschlaege-benachrichtigung'],
      },
    ],
  },
]
