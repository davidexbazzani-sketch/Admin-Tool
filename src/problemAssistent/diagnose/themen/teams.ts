// ── Diagnose-Thema „Teams“ ──────────────────────────────────────────────────
// tm  = Teams selbst (neues Teams/MSIX, klassisches Teams, WebView2, Cache, Prozesse, Abstürze, Autostart,
//       Benachrichtigungen, Chat-App, Outlook-Add-in, Fehlercodes aus dem Teams-Protokoll, Erreichbarkeit)
// tmg = Kamera, Mikrofon, Headset und Datenschutz-Freigaben (wer benutzt gerade die Kamera?)
// Alles NUR LESEND.
import { ja, liste, nein, num, txt, zahl } from '../motor'
import type { DgFakten, DgOber, DgRegel, DgSonde } from '../types'

export const SONDEN_TEAMS: DgSonde[] = [
  {
    id: 'tm', titel: 'Teams (Version, Cache, WebView2, Prozesse, Abstürze, Add-in, Fehlercodes)', modus: 'profil', timeoutMs: 120000,
    ps: String.raw`
NeedHive
function TcpTm([string]$h, [int]$port) { try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($h, $port).Wait(3000) -and $t.Connected; $t.Close(); return [bool]$ok } catch { return $false } }
$cls = $uHive + '_Classes'
$pkRoot = $cls + '\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\Repository\Packages'
$neuPk = @(Get-ChildItem -LiteralPath $pkRoot -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^MSTeams_' } | ForEach-Object { [string]$_.PSChildName } | Sort-Object)
$neuVer = $null
if ($neuPk.Count) { $neuVer = ($neuPk[-1] -split '_')[1] }
Fakt 'neuInstalliert' ([bool]$neuVer); Fakt 'neuVersion' $neuVer
$klExe = Join-Path $uLocal 'Microsoft\Teams\current\Teams.exe'
$klassisch = Test-Path -LiteralPath $klExe
$mwi = Test-Path -LiteralPath ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)') + '\Teams Installer\Teams.exe')
Fakt 'klassisch' $klassisch; Fakt 'klassischInstaller' $mwi
Punkt 'Neues Teams' $(if ($neuVer) { 'ok' } elseif ($klassisch) { 'warn' } else { 'fehler' }) $(if ($neuVer) { 'installiert (Version ' + $neuVer + ')' } else { 'für diesen Benutzer NICHT installiert' })
Punkt 'Klassisches Teams' $(if ($klassisch -or $mwi) { 'warn' } else { 'ok' }) $(if ($klassisch) { 'noch vorhanden (sollte entfernt sein)' } elseif ($mwi) { 'nur „Teams Machine-Wide Installer“ vorhanden' } else { 'nicht vorhanden' })
$tmDir = Join-Path $uLocal 'Packages\MSTeams_8wekyb3d8bbwe\LocalCache\Microsoft\MSTeams'
$cacheMB = [math]::Round([double](OrdnerGroesse $tmDir) / 1MB)
if ($klassisch) { $cacheMB += [math]::Round([double](OrdnerGroesse (Join-Path $uRoam 'Microsoft\Teams')) / 1MB) }
Fakt 'cacheMB' $cacheMB
Punkt 'Teams-Cache' $(if ($cacheMB -ge 1500) { 'warn' } else { 'ok' }) ('' + $cacheMB + ' MB')
$wv = $null
foreach ($k in @('HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', ($uHive + '\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'))) {
  if (-not $wv) { $v = [string](Get-ItemProperty -LiteralPath $k -Name pv -EA SilentlyContinue).pv; if ($v -and $v -ne '0.0.0.0') { $wv = $v } }
}
Fakt 'webview2' $wv; Fakt 'webview2Ok' ([bool]$wv)
Punkt 'Edge WebView2 (Grundlage des neuen Teams)' $(if ($wv) { 'ok' } else { 'fehler' }) $(if ($wv) { 'Version ' + $wv } else { 'NICHT installiert' })
$tp = $null
try { $tp = @(UserProcs @('ms-teams', 'Teams')) } catch { $tp = $null }
if ($null -ne $tp) {
  $neuP = @($tp | Where-Object { $_.ProcessName -eq 'ms-teams' })
  $klP = @($tp | Where-Object { $_.ProcessName -eq 'Teams' })
  $haengt = @($tp | Where-Object { $_.MainWindowHandle -ne 0 -and -not $_.Responding }).Count -gt 0
  $ramMB = 0.0; foreach ($x in $tp) { $ramMB += [double]$x.WorkingSet64 / 1MB }
  $ramMB = [math]::Round($ramMB)
  Fakt 'laeuft' ($tp.Count -gt 0); Fakt 'haengt' $haengt; Fakt 'ramMB' $ramMB; Fakt 'beideLaufen' ($neuP.Count -gt 0 -and $klP.Count -gt 0)
  Punkt 'Läuft gerade' $(if ($haengt) { 'fehler' } elseif ($tp.Count) { 'ok' } else { 'warn' }) $(if ($tp.Count) { 'Teams läuft (' + $ramMB + ' MB Arbeitsspeicher)' + $(if ($haengt) { ' – reagiert NICHT' } else { '' }) + $(if ($neuP.Count -and $klP.Count) { ' – neues UND klassisches Teams gleichzeitig' } else { '' }) } else { 'Teams läuft nicht' })
} else { Punkt 'Teams-Prozesse' 'info' 'nicht lesbar (Adminrechte nötig)' }
$ab = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue | Where-Object { $_.Message -match '(?i)teams\.exe' }).Count
$hg = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1002; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue | Where-Object { $_.Message -match '(?i)teams\.exe' }).Count
Fakt 'abstuerze7' $ab; Fakt 'haenger7' $hg
Punkt 'Abstürze / Hänger (7 Tage)' $(if ($ab -ge 2 -or $hg -ge 3) { 'fehler' } elseif ($ab -or $hg) { 'warn' } else { 'ok' }) ('' + $ab + ' Absturz/Abstürze, ' + $hg + ' Mal „reagiert nicht“')
$stState = (Get-ItemProperty -LiteralPath ($cls + '\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData\MSTeams_8wekyb3d8bbwe\TeamsTfwStartupTask') -Name State -EA SilentlyContinue).State
if ($null -ne $stState) {
  $auto = ([int]$stState -eq 2 -or [int]$stState -eq 4)
  Fakt 'autostart' $auto; Fakt 'autostartStatus' ([int]$stState)
  Punkt 'Autostart mit Windows' $(if ($auto) { 'ok' } else { 'warn' }) $(if ($auto) { 'an' } elseif ([int]$stState -eq 1) { 'vom Benutzer ausgeschaltet' } elseif ([int]$stState -eq 3) { 'per Richtlinie aus' } else { 'aus' })
}
$nk = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings'
$tmEn = (Get-ItemProperty -LiteralPath ($nk + '\MSTeams_8wekyb3d8bbwe!MSTeams') -Name Enabled -EA SilentlyContinue).Enabled
$toast = (Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\PushNotifications') -Name ToastEnabled -EA SilentlyContinue).ToastEnabled
$glob = (Get-ItemProperty -LiteralPath $nk -Name NOC_GLOBAL_SETTING_TOASTS_ENABLED -EA SilentlyContinue).NOC_GLOBAL_SETTING_TOASTS_ENABLED
Fakt 'benachrichtigungAus' ($tmEn -eq 0); Fakt 'toastsAus' ($toast -eq 0 -or $glob -eq 0)
Punkt 'Windows-Benachrichtigungen für Teams' $(if ($tmEn -eq 0 -or $toast -eq 0 -or $glob -eq 0) { 'fehler' } else { 'ok' }) $(if ($toast -eq 0 -or $glob -eq 0) { 'in Windows für ALLE Apps ausgeschaltet' } elseif ($tmEn -eq 0) { 'für Teams ausgeschaltet' } else { 'erlaubt' })
$im = [string](Get-ItemProperty -LiteralPath ($uHive + '\Software\IM Providers') -Name DefaultIMApp -EA SilentlyContinue).DefaultIMApp
Fakt 'chatApp' $(if ($im) { $im } else { $null })
Punkt 'Chat-App für Office (Präsenz in Outlook)' $(if ($im -match '(?i)teams') { 'ok' } elseif ($im) { 'warn' } else { 'info' }) $(if ($im) { $im } else { 'nicht eingetragen' })
$olExe = @('C:\Program Files\Microsoft Office\root\Office16\OUTLOOK.EXE', 'C:\Program Files (x86)\Microsoft Office\root\Office16\OUTLOOK.EXE') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
Fakt 'outlook' ([bool]$olExe)
$addLb = $null
foreach ($b in @(($uHive + '\Software\Microsoft\Office\Outlook\Addins\TeamsAddin.FastConnect'), 'HKLM:\SOFTWARE\Microsoft\Office\Outlook\Addins\TeamsAddin.FastConnect', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\Outlook\Addins\TeamsAddin.FastConnect')) {
  if ($null -eq $addLb) { $lb = (Get-ItemProperty -LiteralPath $b -Name LoadBehavior -EA SilentlyContinue).LoadBehavior; if ($null -ne $lb) { $addLb = [int]$lb } }
}
Fakt 'addinLoad' $addLb
$addDir = @((Join-Path $uLocal 'Microsoft\TeamsMeetingAdd-in'), (Join-Path $uLocal 'Microsoft\TeamsMeetingAddin'), ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)') + '\Microsoft\TeamsMeetingAdd-in'), 'C:\Program Files\Microsoft\TeamsMeetingAdd-in') | Where-Object { Test-Path -LiteralPath $_ }
Fakt 'addinDateien' (@($addDir).Count -gt 0)
$olDis = @((Get-Item -LiteralPath ($uHive + '\Software\Microsoft\Office\16.0\Outlook\Resiliency\DisabledItems') -EA SilentlyContinue).Property).Count
Fakt 'outlookDeaktiviert' $olDis
if ($olExe) {
  Punkt 'Teams-Besprechungs-Add-in (Outlook)' $(if ($addLb -eq 3) { 'ok' } elseif ($null -eq $addLb) { 'fehler' } else { 'fehler' }) $(if ($null -eq $addLb) { 'nicht registriert' + $(if (@($addDir).Count) { '' } else { ', Add-in-Dateien fehlen' }) } elseif ($addLb -eq 3) { 'aktiv' } else { 'DEAKTIVIERT (LoadBehavior ' + $addLb + ')' })
  if ($olDis) { Punkt 'Von Outlook deaktiviert' 'warn' ('' + $olDis + ' Element(e) wegen Absturz/Langsamkeit abgeschaltet') }
} else { Punkt 'Teams-Besprechungs-Add-in (Outlook)' 'info' 'klassisches Outlook nicht installiert' }
$codes = @()
$lg = @(Get-ChildItem -LiteralPath (Join-Path $tmDir 'Logs') -Filter 'MSTeams_*.log' -File -EA SilentlyContinue | Where-Object { $_.Length -gt 0 } | Sort-Object LastWriteTime -Descending | Select-Object -First 2)
foreach ($l in $lg) {
  $zl = @(Get-Content -LiteralPath $l.FullName -Tail 4000 -EA SilentlyContinue)
  foreach ($m in [regex]::Matches(($zl -join ' '), '(?i)\b(caa[0-9a-f]{5}|AADSTS\d{5,6})\b')) { $codes += $m.Value.ToLower() }
}
$codes = @($codes | Select-Object -Unique | Select-Object -First 6)
Fakt 'fehlercodes' @($codes); Fakt 'protokoll' ($lg.Count -gt 0)
Punkt 'Fehlercodes im Teams-Protokoll' $(if ($codes.Count) { 'warn' } elseif ($lg.Count) { 'ok' } else { 'info' }) $(if ($codes.Count) { $codes -join ', ' } elseif ($lg.Count) { 'keine Anmelde-/Verbindungsfehler gefunden' } else { 'kein Protokoll vorhanden' })
$erreich = (TcpTm 'teams.microsoft.com' 443) -or (TcpTm 'teams.cloud.microsoft' 443)
Fakt 'teamsErreichbar' $erreich
Punkt 'Teams-Dienst erreichbar' $(if ($erreich) { 'ok' } else { 'fehler' }) $(if ($erreich) { 'teams.microsoft.com:443' } else { 'teams.microsoft.com:443 NICHT erreichbar' })
`,
  },
  {
    id: 'tmg', titel: 'Kamera, Mikrofon, Headset und Datenschutz-Freigaben', modus: 'profil', timeoutMs: 90000,
    ps: String.raw`
NeedHive
$csM = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore'
$csU = $uHive + '\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore'
foreach ($cap in @('webcam', 'microphone')) {
  $nm = $(if ($cap -eq 'webcam') { 'kamera' } else { 'mikro' })
  $titel = $(if ($cap -eq 'webcam') { 'Kamera' } else { 'Mikrofon' })
  $vSys = [string](Get-ItemProperty -LiteralPath ($csM + '\' + $cap) -Name Value -EA SilentlyContinue).Value
  $vUsr = [string](Get-ItemProperty -LiteralPath ($csU + '\' + $cap) -Name Value -EA SilentlyContinue).Value
  $vTm = [string](Get-ItemProperty -LiteralPath ($csU + '\' + $cap + '\MSTeams_8wekyb3d8bbwe') -Name Value -EA SilentlyContinue).Value
  $vDesk = [string](Get-ItemProperty -LiteralPath ($csU + '\' + $cap + '\NonPackaged') -Name Value -EA SilentlyContinue).Value
  Fakt ($nm + 'SystemAus') ($vSys -eq 'Deny'); Fakt ($nm + 'BenutzerAus') ($vUsr -eq 'Deny'); Fakt ($nm + 'TeamsAus') ($vTm -eq 'Deny'); Fakt ($nm + 'DesktopAus') ($vDesk -eq 'Deny')
  $gesperrt = @()
  if ($vSys -eq 'Deny') { $gesperrt += 'für den ganzen PC' }
  if ($vUsr -eq 'Deny') { $gesperrt += 'für diesen Benutzer' }
  if ($vTm -eq 'Deny') { $gesperrt += 'für das neue Teams' }
  if ($vDesk -eq 'Deny') { $gesperrt += 'für Desktop-Apps' }
  Punkt ('Datenschutz: Zugriff auf ' + $titel) $(if ($gesperrt.Count) { 'fehler' } else { 'ok' }) $(if ($gesperrt.Count) { 'GESPERRT ' + ($gesperrt -join ', ') } else { 'erlaubt' })
  $nutzer = @()
  foreach ($k in @(Get-ChildItem -LiteralPath ($csU + '\' + $cap) -EA SilentlyContinue) + @(Get-ChildItem -LiteralPath ($csU + '\' + $cap + '\NonPackaged') -EA SilentlyContinue)) {
    $ip = Get-ItemProperty -LiteralPath $k.PSPath -EA SilentlyContinue
    if ($ip -and $null -ne $ip.LastUsedTimeStart -and [int64]$ip.LastUsedTimeStart -gt 0 -and $null -ne $ip.LastUsedTimeStop -and [int64]$ip.LastUsedTimeStop -eq 0) { $nutzer += (([string]$k.PSChildName -split '#')[-1] -replace '_[a-z0-9]{13}$', '') }
  }
  $fremd = @($nutzer | Where-Object { $_ -notmatch '(?i)teams' })
  Fakt ($nm + 'InBenutzung') @($nutzer); Fakt ($nm + 'Fremd') @($fremd)
  if ($nutzer.Count) { Punkt ($titel + ' wird gerade benutzt von') $(if ($fremd.Count) { 'warn' } else { 'info' }) ($nutzer -join ', ') }
}
$kam = @(Get-PnpDevice -PresentOnly -Class Camera -EA SilentlyContinue) + @(Get-PnpDevice -PresentOnly -Class Image -EA SilentlyContinue | Where-Object { $_.FriendlyName -match '(?i)cam|kamera' })
$kamOk = @($kam | Where-Object { $_.Status -eq 'OK' })
$kamFehler = @($kam | Where-Object { $_.Status -ne 'OK' })
Fakt 'kameras' $kamOk.Count; Fakt 'kameraFehler' $kamFehler.Count
Punkt 'Kameras' $(if ($kamFehler.Count) { 'fehler' } elseif ($kamOk.Count) { 'ok' } else { 'warn' }) $(if ($kam.Count) { (@($kam | ForEach-Object { [string]$_.FriendlyName + $(if ($_.Status -ne 'OK') { ' (' + $_.Status + ')' } else { '' }) }) -join ', ') } else { 'keine Kamera gefunden' })
$ep = @(Get-PnpDevice -PresentOnly -Class AudioEndpoint -EA SilentlyContinue)
$mics = @($ep | Where-Object { $_.Status -eq 'OK' -and $_.FriendlyName -match '(?i)mikro|micro|mic\b|headset|eingang|input' })
$spk = @($ep | Where-Object { $_.Status -eq 'OK' -and $_.FriendlyName -notmatch '(?i)mikro|micro|mic\b|eingang|input|stereomix|stereo mix' })
Fakt 'mikrofone' $mics.Count; Fakt 'ausgaben' $spk.Count
Punkt 'Mikrofone' $(if ($mics.Count) { 'ok' } else { 'fehler' }) $(if ($mics.Count) { (@($mics | ForEach-Object { [string]$_.FriendlyName }) -join ', ') } else { 'kein Mikrofon gefunden' })
Punkt 'Lautsprecher / Kopfhörer' $(if ($spk.Count) { 'ok' } else { 'fehler' }) $(if ($spk.Count) { (@($spk | ForEach-Object { [string]$_.FriendlyName }) -join ', ') } else { 'kein Ausgabegerät gefunden' })
$hs = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { $_.Class -match '^(MEDIA|AudioEndpoint|USB|HIDClass|Bluetooth)$' -and $_.FriendlyName -match '(?i)jabra|poly|plantronics|headset|epos|sennheiser' } | Select-Object -First 1)
Fakt 'headset' ($hs.Count -gt 0); Fakt 'headsetName' $(if ($hs.Count) { [string]$hs[0].FriendlyName } else { $null })
Punkt 'Headset' $(if ($hs.Count) { 'ok' } else { 'info' }) $(if ($hs.Count) { [string]$hs[0].FriendlyName } else { 'kein Headset erkannt' })
$af = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { $_.Class -match '^(MEDIA|AudioEndpoint)$' -and $_.Status -ne 'OK' -and $_.Status -ne 'Unknown' })
Fakt 'audioFehler' $af.Count
if ($af.Count) { Punkt 'Audiogeräte mit Fehler' 'fehler' (@($af | ForEach-Object { [string]$_.FriendlyName + ' (' + $_.Status + ')' }) -join ', ') }
$as = Get-Service -Name Audiosrv -EA SilentlyContinue
Fakt 'audiodienst' $(if ($as) { [string]$as.Status } else { $null })
Punkt 'Windows-Audiodienst' $(if ($as -and $as.Status -eq 'Running') { 'ok' } else { 'fehler' }) $(if ($as) { [string]$as.Status } else { 'fehlt' })
`,
  },
]

/** Fehlercode im Teams-Protokoll gefunden? */
const code = (f: DgFakten, ...c: string[]) => liste(f['tm.fehlercodes']).some(x => c.includes(x.toLowerCase()))
const codeRegel = (c: string[], problem: string): DgRegel => ({
  id: 'code-' + c[0], wenn: f => code(f, ...c), befund: () => `Teams-Protokoll enthält Fehlercode ${c.join(' / ')}`, problem, schwere: 3,
})

export const THEMEN_TEAMS: DgOber[] = [
  {
    id: 'teams', titel: 'Teams', symbol: 'Users', beschreibung: 'Teams startet nicht, weißes Fenster, Anmeldung, Ton/Kamera in Besprechungen, langsam, Benachrichtigungen, Besprechung aus Outlook',
    unter: [
      {
        id: 'tm-start', titel: 'Teams startet nicht oder zeigt nur ein weißes Fenster', beschreibung: 'Klick auf Teams passiert nichts, Fenster bleibt weiß/leer, Teams schließt sich gleich wieder',
        sonden: ['tm', 'sys'],
        regeln: [
          { id: 'fehlt', wenn: f => nein(f['tm.neuInstalliert']) && nein(f['tm.klassisch']), befund: () => 'Teams ist für diesen Benutzer gar nicht installiert', problem: 'teams-nicht-installiert', schwere: 3 },
          { id: 'webview2', wenn: f => nein(f['tm.webview2Ok']), befund: () => 'Edge WebView2 fehlt – ohne WebView2 bleibt das neue Teams weiß', problem: 'teams-webview2-fehlt', schwere: 3 },
          { id: 'platte', wenn: f => num(f['sys.cFreiGB']) < 3, befund: f => `Laufwerk C: hat nur noch ${zahl(f['sys.cFreiGB'])} GB frei`, problem: 'teams-speicher-voll', schwere: 3 },
          { id: 'abstuerze', wenn: f => num(f['tm.abstuerze7']) >= 2, befund: f => `Teams ist in 7 Tagen ${f['tm.abstuerze7']}× abgestürzt`, problem: 'teams-startet-nicht', schwere: 2 },
          { id: 'haengt', wenn: f => ja(f['tm.haengt']), befund: () => 'Teams läuft, reagiert aber nicht', problem: 'teams-friert-ein', schwere: 2 },
          { id: 'cache', wenn: f => num(f['tm.cacheMB']) >= 1500, befund: f => `Teams-Cache ist ${zahl(f['tm.cacheMB'])} MB groß`, problem: 'teams-weisses-fenster', schwere: 2 },
          { id: 'zwei', wenn: f => ja(f['tm.klassisch']) && ja(f['tm.neuInstalliert']), befund: () => 'Neues und klassisches Teams sind beide installiert', problem: 'teams-klassisch-und-neu', schwere: 2 },
          { id: 'neustart', wenn: f => ja(f['sys.neustartAusstehend']), befund: () => 'Ein Neustart nach Updates steht aus', problem: 'teams-update-haengt', schwere: 1 },
        ],
        ohneBefund: ['teams-startet-nicht', 'teams-weisses-fenster', 'teams-fehler-schleife-erneut-versuchen', 'teams-element-nicht-gefunden'],
      },
      {
        id: 'tm-anmeldung', titel: 'Teams-Anmeldung klappt nicht oder zeigt einen Fehlercode', beschreibung: 'Teams fragt immer wieder nach der Anmeldung, „Etwas ist schiefgelaufen“, Fehlercode wie caa20002',
        sonden: ['tm', 'aad', 'net'],
        regeln: [
          codeRegel(['caa20002'], 'teams-fehler-caa20002'),
          codeRegel(['caa7000a'], 'teams-fehler-caa7000a'),
          codeRegel(['caa70004', 'caa70007'], 'teams-fehler-caa70004'),
          codeRegel(['caa20003'], 'teams-fehler-caa20003'),
          { id: 'kein-prt', wenn: f => nein(f['aad.prt']), befund: () => 'Das Anmeldetoken (PRT) fehlt – Teams kann sich nicht automatisch anmelden', problem: 'teams-anmeldeschleife', schwere: 3 },
          { id: 'kein-internet', wenn: f => nein(f['net.internet443']), befund: () => 'Microsoft-Anmeldung (login.microsoftonline.com) ist nicht erreichbar', problem: 'netz-kein-internet-verbunden', schwere: 3 },
          { id: 'zscaler-aus', wenn: f => ja(f['net.zscalerInstalliert']) && f['net.zscalerDienst'] != null && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])})`, problem: 'teams-fehler-caa7000a', schwere: 2 },
          { id: 'teams-weg', wenn: f => nein(f['tm.teamsErreichbar']) && ja(f['net.internet443']), befund: () => 'Internet geht, aber teams.microsoft.com ist nicht erreichbar (Proxy/Filter?)', problem: 'teams-fehler-caa70004', schwere: 2 },
        ],
        ohneBefund: ['teams-anmeldeschleife', 'teams-fehler-caa20002', 'konto-wam-fehler-caa50021', 'teams-falsches-konto'],
      },
      {
        id: 'tm-besprechung', titel: 'Ton, Mikrofon oder Kamera in Besprechungen', beschreibung: 'Andere hören mich nicht, ich höre nichts, Kamera schwarz, Headset wird nicht erkannt',
        sonden: ['tmg', 'tm'],
        fragen: [{ id: 'kamera', text: 'Geht es (auch) um die Kamera – kein Bild?' }],
        regeln: [
          { id: 'mikro-gesperrt', wenn: f => ja(f['tmg.mikroSystemAus']) || ja(f['tmg.mikroBenutzerAus']) || ja(f['tmg.mikroTeamsAus']) || ja(f['tmg.mikroDesktopAus']), befund: () => 'Der Zugriff auf das Mikrofon ist in den Windows-Datenschutzeinstellungen gesperrt', problem: 'teams-mikrofon-geht-nicht', schwere: 3 },
          { id: 'kamera-gesperrt', wenn: f => ja(f['tmg.kameraSystemAus']) || ja(f['tmg.kameraBenutzerAus']) || ja(f['tmg.kameraTeamsAus']) || ja(f['tmg.kameraDesktopAus']), befund: () => 'Der Zugriff auf die Kamera ist in den Windows-Datenschutzeinstellungen gesperrt', problem: 'teams-kamera-geht-nicht', schwere: 3 },
          { id: 'kamera-belegt', wenn: f => liste(f['tmg.kameraFremd']).length > 0, befund: f => `Die Kamera wird gerade von einem anderen Programm benutzt: ${txt(f['tmg.kameraFremd'])}`, problem: 'teams-kamera-belegt', schwere: 3 },
          { id: 'keine-kamera', wenn: f => (num(f['tmg.kameras']) === 0 || num(f['tmg.kameraFehler']) > 0) && f['frage.kamera'] !== 'nein', befund: f => num(f['tmg.kameraFehler']) > 0 ? `Kamera meldet einen Gerätefehler (${f['tmg.kameraFehler']} Gerät/e)` : 'Windows findet keine funktionierende Kamera', problem: 'kamera-teams-schwarz', schwere: 2 },
          { id: 'kein-mikro', wenn: f => num(f['tmg.mikrofone']) === 0, befund: () => 'Windows findet kein Mikrofon (auch kein Headset-Mikrofon)', problem: 'teams-headset-nicht-erkannt', schwere: 3 },
          { id: 'audio-fehler', wenn: f => num(f['tmg.audioFehler']) > 0, befund: f => `${f['tmg.audioFehler']} Audiogerät(e) melden einen Gerätefehler`, problem: 'audio-headset-nicht-erkannt', schwere: 2 },
          { id: 'audiodienst', wenn: f => f['tmg.audiodienst'] != null && txt(f['tmg.audiodienst']) !== 'Running', befund: f => `Windows-Audiodienst läuft nicht (${txt(f['tmg.audiodienst'])})`, problem: 'audio-dienst-reagiert-nicht', schwere: 3 },
          { id: 'mikro-belegt', wenn: f => liste(f['tmg.mikroFremd']).length > 0, befund: f => `Das Mikrofon wird gerade auch von einem anderen Programm benutzt: ${txt(f['tmg.mikroFremd'])}`, problem: 'teams-mikrofon-geht-nicht', schwere: 1 },
        ],
        ohneBefund: ['teams-mikrofon-geht-nicht', 'teams-kamera-geht-nicht', 'teams-ton-aus-lautsprecher', 'audio-teams-kein-ton'],
      },
      {
        id: 'tm-langsam', titel: 'Teams ist langsam, hängt oder macht den PC träge', beschreibung: 'Klicks dauern lange, „Keine Rückmeldung“, Lüfter dreht in Besprechungen hoch',
        sonden: ['tm', 'sys'],
        regeln: [
          { id: 'haengt', wenn: f => ja(f['tm.haengt']), befund: () => 'Teams reagiert gerade nicht', problem: 'teams-friert-ein', schwere: 3 },
          { id: 'haenger', wenn: f => num(f['tm.haenger7']) >= 3, befund: f => `Teams hat in 7 Tagen ${f['tm.haenger7']}× nicht reagiert`, problem: 'teams-friert-ein', schwere: 2 },
          { id: 'ram-teams', wenn: f => num(f['tm.ramMB']) >= 2500, befund: f => `Teams belegt ${zahl(f['tm.ramMB'])} MB Arbeitsspeicher`, problem: 'teams-traege', schwere: 2 },
          { id: 'cache', wenn: f => num(f['tm.cacheMB']) >= 1500, befund: f => `Teams-Cache ist ${zahl(f['tm.cacheMB'])} MB groß`, problem: 'teams-traege', schwere: 2 },
          { id: 'beide', wenn: f => ja(f['tm.beideLaufen']), befund: () => 'Neues und klassisches Teams laufen gleichzeitig', problem: 'teams-klassisch-und-neu', schwere: 2 },
          { id: 'ram-pc', wenn: f => num(f['sys.ramFreiProzent']) < 10, befund: f => `Arbeitsspeicher fast voll (${f['sys.ramFreiProzent']} % frei, ${zahl(f['sys.ramGB'])} GB gesamt)`, problem: 'teams-pc-langsam-in-besprechung', schwere: 2 },
          { id: 'uptime', wenn: f => num(f['sys.uptimeTage']) > 14, befund: f => `PC wurde seit ${zahl(f['sys.uptimeTage'])} Tagen nicht neu gestartet`, problem: 'leistung-pc-sehr-langsam', schwere: 1 },
        ],
        ohneBefund: ['teams-traege', 'teams-friert-ein', 'teams-pc-langsam-in-besprechung'],
      },
      {
        id: 'tm-chat', titel: 'Chat, Nachrichten oder Benachrichtigungen kommen nicht', beschreibung: 'Keine Benachrichtigung bei neuen Nachrichten, Nachricht hängt mit rotem Ausrufezeichen, Anrufe klingeln nicht',
        sonden: ['tm', 'net'],
        regeln: [
          { id: 'toasts-aus', wenn: f => ja(f['tm.toastsAus']), befund: () => 'Windows-Benachrichtigungen sind für alle Apps ausgeschaltet', problem: 'windows-benachrichtigungen-fehlen', schwere: 3 },
          { id: 'teams-aus', wenn: f => ja(f['tm.benachrichtigungAus']), befund: () => 'Windows-Benachrichtigungen sind für Teams ausgeschaltet', problem: 'teams-benachrichtigungen-fehlen', schwere: 3 },
          { id: 'kein-internet', wenn: f => nein(f['net.internet443']), befund: () => 'Der PC kommt nicht ins Internet', problem: 'netz-kein-internet-verbunden', schwere: 3 },
          { id: 'teams-weg', wenn: f => nein(f['tm.teamsErreichbar']), befund: () => 'teams.microsoft.com ist vom PC aus nicht erreichbar', problem: 'teams-nachricht-nicht-gesendet', schwere: 3 },
          { id: 'zscaler-aus', wenn: f => ja(f['net.zscalerInstalliert']) && f['net.zscalerDienst'] != null && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])})`, problem: 'teams-nachrichten-verspaetet', schwere: 2 },
          { id: 'laeuft-nicht', wenn: f => nein(f['tm.laeuft']), befund: () => 'Teams läuft gerade nicht – Nachrichten und Anrufe kommen dann nicht an', problem: 'teams-anrufe-klingeln-nicht', schwere: 2 },
          { id: 'autostart', wenn: f => nein(f['tm.autostart']), befund: () => 'Teams startet nicht automatisch mit Windows', problem: 'teams-autostart', schwere: 2 },
        ],
        ohneBefund: ['teams-benachrichtigungen-fehlen', 'teams-chats-fehlen', 'teams-nachricht-nicht-gesendet', 'teams-nachrichten-verspaetet'],
      },
      {
        id: 'tm-outlook', titel: 'Teams-Besprechung aus Outlook (Add-in)', beschreibung: 'Knopf „Teams-Besprechung“ fehlt in Outlook, Besprechung lässt sich nicht planen, Status in Outlook fehlt',
        sonden: ['tm'],
        regeln: [
          { id: 'kein-outlook', wenn: f => nein(f['tm.outlook']), befund: () => 'Klassisches Outlook ist nicht installiert – das Add-in gibt es nur dort', problem: 'ol-klassisch-symbol-fehlt', schwere: 2 },
          { id: 'addin-aus', wenn: f => f['tm.addinLoad'] != null && num(f['tm.addinLoad']) !== 3, befund: f => `Teams-Besprechungs-Add-in ist deaktiviert (LoadBehavior ${f['tm.addinLoad']})`, problem: 'teams-addin-langsam-deaktiviert', schwere: 3 },
          { id: 'addin-fehlt', wenn: f => ja(f['tm.outlook']) && f['tm.addinLoad'] === null, befund: () => 'Teams-Besprechungs-Add-in ist in Outlook nicht registriert', problem: 'teams-besprechungsknopf-fehlt', schwere: 3 },
          { id: 'dateien-fehlen', wenn: f => ja(f['tm.outlook']) && nein(f['tm.addinDateien']), befund: () => 'Die Dateien des Teams-Besprechungs-Add-ins fehlen auf dem PC', problem: 'teams-besprechung-nicht-planbar', schwere: 2 },
          { id: 'resilienz', wenn: f => ja(f['tm.outlook']) && num(f['tm.outlookDeaktiviert']) > 0, befund: f => `Outlook hat ${f['tm.outlookDeaktiviert']} Add-in(s) wegen Langsamkeit/Absturz abgeschaltet`, problem: 'outlook-addin-deaktiviert', schwere: 2 },
          { id: 'nur-klassisch', wenn: f => nein(f['tm.neuInstalliert']) && ja(f['tm.klassisch']), befund: () => 'Nur das alte, klassische Teams ist installiert', problem: 'teams-klassisch-und-neu', schwere: 1 },
          { id: 'chat-app', wenn: f => f['tm.chatApp'] != null && !/teams/i.test(txt(f['tm.chatApp'])), befund: f => `Als Chat-App für Office ist „${txt(f['tm.chatApp'])}“ eingetragen statt Teams`, problem: 'teams-status-in-outlook-fehlt', schwere: 2 },
        ],
        ohneBefund: ['teams-besprechungsknopf-fehlt', 'teams-besprechung-nicht-planbar', 'teams-besprechungslink-fehlt', 'teams-addin-langsam-deaktiviert'],
      },
    ],
  },
]
