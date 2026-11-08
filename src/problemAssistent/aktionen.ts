// ── Problem-Assistent: Lösungsbausteine ──────────────────────────────────────
// Jeder Baustein ist ein kleines, in sich geschlossenes PowerShell-Stück (siehe motor.ts
// für die Ausführungsarten und Helfer). Regeln:
//   • Parameter nur über $P (kommt als Base64) — nie in den Text einsetzen.
//   • Kein `exit` — Fehler per throw. Ergebniszeilen per Zeile '…'.
//   • Benutzerdaten nur über $uProf/$uLocal/$uRoam/$uHive (Art „profil“) bzw. in der
//     Benutzersitzung (Art „benutzer“) — nie $env:APPDATA in einer Admin-Sitzung.
//   • Daten des Benutzers werden umbenannt (*.alt_…), nicht gelöscht — außer echte Caches.
//   • Nichts hier ändert Server, AD oder Netzwerkgeräte.

import type { PaAktion } from './motor'
import { BENUTZER_AKTIONEN } from './aktionenBenutzer'
import { OFFICE_C2R, DRUCKER_PS, OFFICE_APPS } from './bausteine/gemeinsam'
import { AKTIONEN_TEAMS } from './bausteine/teams'
import { AKTIONEN_OUTLOOK } from './bausteine/outlook'
import { AKTIONEN_OFFICE } from './bausteine/office'
import { AKTIONEN_CLOUD } from './bausteine/cloud'
import { AKTIONEN_NETZ } from './bausteine/netz'
import { AKTIONEN_ZUGANG } from './bausteine/zugang'
import { AKTIONEN_DRUCKER } from './bausteine/drucker'
import { AKTIONEN_PERIPHERIE } from './bausteine/peripherie'
import { AKTIONEN_WINDOWS } from './bausteine/windows'
import { AKTIONEN_KONTO } from './bausteine/konto'
import { AKTIONEN_TMEET4 } from './bausteine/tmeet4'
import { AKTIONEN_TCHAT4 } from './bausteine/tchat4'
import { AKTIONEN_OLMAIL4 } from './bausteine/olmail4'
import { AKTIONEN_OLORG4 } from './bausteine/olorg4'
import { AKTIONEN_EXCEL4 } from './bausteine/excel4'
import { AKTIONEN_WORD4 } from './bausteine/word4'
import { AKTIONEN_CLOUD4 } from './bausteine/cloud4'
import { AKTIONEN_WEB4 } from './bausteine/web4'
import { AKTIONEN_NETZ4 } from './bausteine/netz4'
import { AKTIONEN_WLAN4 } from './bausteine/wlan4'
import { AKTIONEN_LW4 } from './bausteine/lw4'
import { AKTIONEN_DRUCK4 } from './bausteine/druck4'
import { AKTIONEN_HW4 } from './bausteine/hw4'
import { AKTIONEN_AV4 } from './bausteine/av4'
import { AKTIONEN_BILD4 } from './bausteine/bild4'
import { AKTIONEN_WIN4 } from './bausteine/win4'
import { AKTIONEN_LEIST4 } from './bausteine/leist4'
import { AKTIONEN_PROG4 } from './bausteine/prog4'
import { AKTIONEN_KONTO4 } from './bausteine/konto4'
import { AKTIONEN_SAPCAD4 } from './bausteine/sapcad4'
import { AKTIONEN_TICKETS5 } from './bausteine/tickets5'

const A = (a: PaAktion): PaAktion => a


export const AKTIONEN: PaAktion[] = [
  // ══ Allgemein / Überblick ═══════════════════════════════════════════════════
  A({ id: 'info-ueberblick', titel: 'PC-Überblick', modus: 'system', risiko: 'lesen',
    beschreibung: 'Modell, Windows-Version, letzter Neustart, freier Speicher, Arbeitsspeicher, angemeldeter Benutzer.',
    ps: String.raw`
$cs = Get-CimInstance Win32_ComputerSystem; $os = Get-CimInstance Win32_OperatingSystem; $bios = Get-CimInstance Win32_BIOS
Zeile ('Modell: ' + $cs.Manufacturer + ' ' + $cs.Model + ' · Seriennummer ' + $bios.SerialNumber)
Zeile ('Windows: ' + $os.Caption + ' · Build ' + $os.BuildNumber + ' · ' + $os.OSArchitecture)
$up = (Get-Date) - $os.LastBootUpTime
Zeile ('Letzter Neustart: ' + $os.LastBootUpTime.ToString('dd.MM.yyyy HH:mm') + ' (vor ' + [int]$up.TotalDays + ' Tagen ' + $up.Hours + ' Std.)')
Zeile ('Arbeitsspeicher: ' + [math]::Round($cs.TotalPhysicalMemory / 1GB, 1) + ' GB, frei ' + [math]::Round($os.FreePhysicalMemory / 1MB, 1) + ' GB')
foreach ($d in Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3') { Zeile ('Laufwerk ' + $d.DeviceID + ' ' + (Groesse $d.FreeSpace) + ' frei von ' + (Groesse $d.Size) + ' (' + [math]::Round(100 * [double]$d.FreeSpace / [math]::Max([double]1, [double]$d.Size)) + ' %)') }
Zeile ('Angemeldet: ' + $(if ($cs.UserName) { $cs.UserName } else { 'niemand' }))
if ($up.TotalDays -ge 7) { Zeile 'Hinweis: Der PC läuft seit über einer Woche ohne Neustart — viele Probleme verschwinden nach einem Neustart.' }` }),
  A({ id: 'info-neustart-ausstehend', titel: 'Ausstehenden Neustart prüfen', modus: 'system', risiko: 'lesen',
    beschreibung: 'Wartet Windows nach Updates/Installationen auf einen Neustart?',
    ps: String.raw`
$g = @()
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') { $g += 'Windows-Komponenten' }
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') { $g += 'Windows Update' }
$pfro = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -EA SilentlyContinue).PendingFileRenameOperations
if ($pfro) { $g += 'Dateien warten auf Ersetzen' }
try { $ccm = Invoke-CimMethod -Namespace root\ccm\ClientSDK -ClassName CCM_ClientUtilities -MethodName DetermineIfRebootPending -EA Stop; if ($ccm.RebootPending -or $ccm.IsHardRebootPending) { $g += 'Softwareverteilung (SCCM)' } } catch {}
if ($g.Count) { Zeile ('Neustart ausstehend: ja — ' + ($g -join ', ')) } else { Zeile 'Neustart ausstehend: nein' }` }),
  A({ id: 'info-ereignisse', titel: 'Fehler der letzten 24 Stunden', modus: 'system', risiko: 'lesen',
    beschreibung: 'Kritische Fehler und Fehler aus System- und Anwendungsprotokoll, zusammengefasst nach Quelle.',
    ps: String.raw`
$seit = (Get-Date).AddHours(-24)
foreach ($log in 'System', 'Application') {
  $ev = @(Get-WinEvent -FilterHashtable @{ LogName = $log; Level = 1, 2; StartTime = $seit } -MaxEvents 300 -EA SilentlyContinue)
  Zeile ('' + $log + ': ' + $ev.Count + ' Fehler')
  $ev | Group-Object ProviderName, Id | Sort-Object Count -Descending | Select-Object -First 8 | ForEach-Object {
    $e = $_.Group[0]; $m = ([string]$e.Message -split '\r?\n')[0]; if ($m.Length -gt 140) { $m = $m.Substring(0, 140) + '…' }
    Zeile ('  ' + $_.Count + '× ' + $e.ProviderName + ' ' + $e.Id + ' (zuletzt ' + $e.TimeCreated.ToString('dd.MM. HH:mm') + '): ' + $m)
  }
}` }),
  A({ id: 'info-zuverlaessigkeit', titel: 'Abstürze der letzten 14 Tage (Zuverlässigkeit)', modus: 'system', risiko: 'lesen',
    beschreibung: 'Programmabstürze, Hänger und Bluescreens laut Zuverlässigkeitsverlauf.',
    ps: String.raw`
$seit = (Get-Date).AddDays(-14)
$ev = @()
$ev += @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Error'; Id = 1000; StartTime = $seit } -MaxEvents 200 -EA SilentlyContinue)
$ev += @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Hang'; Id = 1002; StartTime = $seit } -MaxEvents 200 -EA SilentlyContinue)
if (-not $ev.Count) { Zeile 'Keine Programmabstürze oder Hänger in 14 Tagen.' }
$ev | Group-Object { ([string]$_.Properties[0].Value) + ' (' + $(if ($_.Id -eq 1002) { 'hängt' } else { 'Absturz' }) + ')' } | Sort-Object Count -Descending | Select-Object -First 10 | ForEach-Object {
  $mod = ''; $e = $_.Group[0]; if ($e.Id -eq 1000) { $mod = ' · Modul ' + [string]$e.Properties[3].Value + ' · Code ' + [string]$e.Properties[6].Value }
  Zeile ('' + $_.Count + '× ' + $_.Name + $mod + ' · zuletzt ' + $e.TimeCreated.ToString('dd.MM. HH:mm'))
}
$bs = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WER-SystemErrorReporting'; Id = 1001; StartTime = $seit } -EA SilentlyContinue)
$kp = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 41; StartTime = $seit } -EA SilentlyContinue)
Zeile ('Bluescreens: ' + $bs.Count + ' · unerwartet ausgeschaltet: ' + $kp.Count)
foreach ($b in $bs | Select-Object -First 3) { $c = [regex]::Match([string]$b.Message, '0x[0-9a-fA-F]{8}').Value; Zeile ('  Bluescreen ' + $b.TimeCreated.ToString('dd.MM. HH:mm') + ' Code ' + $c) }` }),
  A({ id: 'neustart-countdown', titel: 'Neustart mit Vorwarnung', modus: 'system', risiko: 'kritisch',
    beschreibung: 'Startet den PC nach der angegebenen Zeit neu; der Benutzer sieht eine Ankündigung und kann speichern.',
    param: { label: 'Minuten bis zum Neustart', platzhalter: '5', vorlagen: ['2', '5', '15', '30'] },
    ps: String.raw`
$min = 5; if ($P -match '^\d+$') { $min = [int]$P }; if ($min -lt 1) { $min = 1 }; if ($min -gt 600) { $min = 600 }
& shutdown.exe /r /t ($min * 60) /c ('Die IT startet diesen PC in ' + $min + ' Minuten neu. Bitte jetzt speichern.') /d p:4:1 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1190) { throw ('shutdown.exe meldet Code ' + $LASTEXITCODE) }
Zeile ('Neustart in ' + $min + ' Minuten angekündigt (' + (Get-Date).AddMinutes($min).ToString('HH:mm') + ' Uhr). Abbrechen: „Neustart abbrechen“.')` }),
  A({ id: 'neustart-abbrechen', titel: 'Geplanten Neustart abbrechen', modus: 'system', risiko: 'aendern',
    beschreibung: 'Bricht einen angekündigten Neustart/Herunterfahren ab.',
    ps: String.raw`
& shutdown.exe /a 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { Zeile 'Geplanter Neustart abgebrochen.' } elseif ($LASTEXITCODE -eq 1116) { Zeile 'Es war kein Neustart geplant.' } else { throw ('shutdown.exe meldet Code ' + $LASTEXITCODE) }` }),
  A({ id: 'schnellstart-aus', titel: 'Schnellstart abschalten', modus: 'system', risiko: 'aendern',
    beschreibung: 'Mit Schnellstart ist „Herunterfahren“ kein echter Neustart — Treiber und Fehlerzustände bleiben. Danach setzt jedes Herunterfahren alles zurück.',
    ps: String.raw`
$k = 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power'
$alt = (Get-ItemProperty $k -Name HiberbootEnabled -EA SilentlyContinue).HiberbootEnabled
Set-ItemProperty -Path $k -Name HiberbootEnabled -Value 0 -Type DWord
Zeile ('Schnellstart: vorher ' + $(if ($alt -eq 0) { 'aus' } else { 'an' }) + ', jetzt aus.')` }),
  A({ id: 'wiederherstellungspunkt', titel: 'Wiederherstellungspunkt anlegen', modus: 'system', risiko: 'aendern', timeoutMs: 180000,
    beschreibung: 'Sicherungspunkt vor größeren Änderungen (nur wenn der Computerschutz auf C: an ist).',
    ps: String.raw`
try { Enable-ComputerRestore -Drive 'C:\' -EA Stop } catch {}
Checkpoint-Computer -Description ('IT Admin Tool ' + (Get-Date -Format 'dd.MM.yyyy HH:mm')) -RestorePointType MODIFY_SETTINGS -EA Stop
Zeile 'Wiederherstellungspunkt angelegt (Windows erlaubt höchstens einen je 24 Stunden).'` }),

  // ══ Netzwerk ════════════════════════════════════════════════════════════════
  A({ id: 'net-status', titel: 'Netzwerkstatus', modus: 'system', risiko: 'lesen',
    beschreibung: 'Adapter, Verbindungsart, Geschwindigkeit, IP, Gateway, DNS und Netzwerkprofil.',
    ps: String.raw`
foreach ($a in Get-NetAdapter -Physical -EA SilentlyContinue | Sort-Object Status) {
  Zeile ('' + $a.Name + ' (' + $a.InterfaceDescription + '): ' + $a.Status + $(if ($a.Status -eq 'Up') { ' · ' + $a.LinkSpeed } else { '' }) + ' · Treiber ' + $a.DriverVersionString)
}
foreach ($c in Get-NetIPConfiguration -EA SilentlyContinue | Where-Object { $_.IPv4Address }) {
  Zeile ('  ' + $c.InterfaceAlias + ': IP ' + (($c.IPv4Address | ForEach-Object { $_.IPAddress }) -join ', ') + ' · Gateway ' + (($c.IPv4DefaultGateway | ForEach-Object { $_.NextHop }) -join ', ') + ' · DNS ' + (($c.DNSServer | Where-Object { $_.AddressFamily -eq 2 } | ForEach-Object { $_.ServerAddresses }) -join ', '))
  if ((($c.IPv4Address | ForEach-Object { $_.IPAddress }) -join ' ') -match '169\.254\.') { Zeile '  Achtung: 169.254.x.x = keine Adresse vom DHCP bekommen.' }
}
foreach ($p in Get-NetConnectionProfile -EA SilentlyContinue) { Zeile ('Netzwerkprofil ' + $p.InterfaceAlias + ': ' + $p.Name + ' · ' + $p.NetworkCategory + ' · IPv4 ' + $p.IPv4Connectivity) }
$px = (& netsh.exe winhttp show proxy 2>$null | Out-String).Trim() -replace '\s+', ' '
Zeile ('WinHTTP-Proxy: ' + $px)` }),
  A({ id: 'net-test', titel: 'Verbindungstest (Gateway, DNS, Domäne, Microsoft 365)', modus: 'system', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Prüft Schritt für Schritt, wo die Verbindung abbricht.',
    ps: String.raw`
$gw = (Get-NetIPConfiguration -EA SilentlyContinue | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1).IPv4DefaultGateway.NextHop
if ($gw) { Zeile ('Gateway ' + $gw + ': ' + $(if (Test-Connection $gw -Count 2 -Quiet) { 'erreichbar' } else { 'NICHT erreichbar' })) } else { Zeile 'Kein Standard-Gateway — keine Netzwerkverbindung.' }
$dom = (Get-CimInstance Win32_ComputerSystem).Domain
try { $dc = Resolve-DnsName ('_ldap._tcp.dc._msdcs.' + $dom) -Type SRV -EA Stop | Select-Object -First 1; Zeile ('DNS/Domäne ' + $dom + ': Domänencontroller ' + $dc.NameTarget + ' gefunden') } catch { Zeile ('DNS/Domäne ' + $dom + ': Domänencontroller NICHT auflösbar') }
foreach ($z in 'login.microsoftonline.com', 'outlook.office365.com', 'teams.microsoft.com') {
  $ok = $false; try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($z, 443).Wait(4000); $t.Close() } catch {}
  Zeile ('' + $z + ' (443): ' + $(if ($ok) { 'erreichbar' } else { 'NICHT erreichbar' }))
}
try { $sc = Test-ComputerSecureChannel -EA Stop; Zeile ('Vertrauensstellung zur Domäne: ' + $(if ($sc) { 'in Ordnung' } else { 'GESTÖRT' })) } catch { Zeile ('Vertrauensstellung: nicht prüfbar (' + $_.Exception.Message + ')') }` }),
  A({ id: 'dns-leeren', titel: 'DNS-Cache leeren + neu registrieren', modus: 'system', risiko: 'aendern',
    beschreibung: 'Vergisst veraltete Namensauflösungen und meldet den PC neu im DNS an.',
    ps: String.raw`
Clear-DnsClientCache; Zeile 'DNS-Cache geleert.'
& ipconfig.exe /registerdns 2>&1 | Out-Null; Zeile 'DNS-Registrierung angestoßen.'` }),
  A({ id: 'ip-erneuern', titel: 'IP-Adresse erneuern (DHCP)', modus: 'system', risiko: 'aendern', trenntVerbindung: true,
    beschreibung: 'Holt eine neue IP-Adresse — die Verbindung kann dabei kurz weg sein.',
    ps: String.raw`
Spaeter 'ipconfig.exe /release; Start-Sleep -Seconds 2; ipconfig.exe /renew; ipconfig.exe /registerdns' 3
Zeile 'IP-Erneuerung in 3 Sekunden gestartet — die Verbindung ist dabei für einige Sekunden weg.'` }),
  A({ id: 'winsock-reset', titel: 'Netzwerk-Stack zurücksetzen (Winsock/TCP-IP)', modus: 'system', risiko: 'kritisch',
    beschreibung: 'Setzt Winsock, TCP/IP und WinHTTP-Proxy zurück. Wirkt erst nach einem Neustart.',
    ps: String.raw`
& netsh.exe winsock reset 2>&1 | Out-Null; Zeile 'Winsock zurückgesetzt.'
& netsh.exe int ip reset 2>&1 | Out-Null; Zeile 'TCP/IP zurückgesetzt.'
& netsh.exe winhttp reset proxy 2>&1 | Out-Null; Zeile 'WinHTTP-Proxy zurückgesetzt.'
Zeile 'Bitte den PC neu starten, damit es wirkt.'` }),
  A({ id: 'adapter-neustart', titel: 'Netzwerkadapter neu starten', modus: 'system', risiko: 'kritisch', trenntVerbindung: true,
    beschreibung: 'Schaltet den Adapter kurz aus und wieder ein — die Verbindung ist dabei weg.',
    param: { label: 'Welcher Adapter', platzhalter: 'WLAN oder LAN', optionen: ['WLAN', 'LAN'], pflicht: true },
    ps: String.raw`
$typ = $(if ($P -match 'lan|eth' -and $P -notmatch 'wlan') { 'LAN' } else { 'WLAN' })
$ad = @(Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object { if ($typ -eq 'WLAN') { $_.PhysicalMediaType -match '802\.11' -or $_.InterfaceDescription -match 'Wi-?Fi|Wireless|WLAN' } else { $_.PhysicalMediaType -match '802\.3' -and $_.InterfaceDescription -notmatch 'Wi-?Fi|Wireless|WLAN' } })
if (-not $ad.Count) { throw ('Kein ' + $typ + '-Adapter gefunden.') }
$n = $ad[0].Name
Spaeter ("Restart-NetAdapter -Name '" + ($n -replace "'", "''") + "' -Confirm:" + '$false') 3
Zeile ('' + $typ + '-Adapter „' + $n + '“ wird in 3 Sekunden neu gestartet (ca. 10 Sekunden ohne Verbindung).')` }),
  A({ id: 'netzprofil-neu', titel: 'Netzwerkerkennung neu starten (Domäne/Öffentlich)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Startet die Netzwerkerkennung neu, wenn das Netz fälschlich als „Öffentlich“ statt „Domäne“ erkannt wird.',
    ps: String.raw`
Restart-Service NlaSvc -Force -EA Stop
Start-Sleep -Seconds 6
foreach ($p in Get-NetConnectionProfile -EA SilentlyContinue) { Zeile ('' + $p.InterfaceAlias + ': ' + $p.NetworkCategory + ' (' + $p.Name + ')') }` }),
  A({ id: 'proxy-anzeigen', titel: 'Proxy-Einstellungen anzeigen', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Proxy des Benutzers (Internetoptionen), automatische Konfiguration und WinHTTP-Proxy.',
    ps: String.raw`
NeedHive
$is = Get-ItemProperty ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Internet Settings') -EA SilentlyContinue
Zeile ('Manueller Proxy: ' + $(if ($is.ProxyEnable -eq 1) { 'AN → ' + $is.ProxyServer } else { 'aus' }))
Zeile ('Automatisches Konfigurationsskript: ' + $(if ($is.AutoConfigURL) { $is.AutoConfigURL } else { 'keins' }))
Zeile ('Ausnahmen: ' + $(if ($is.ProxyOverride) { $is.ProxyOverride } else { '—' }))
Zeile ('WinHTTP: ' + ((& netsh.exe winhttp show proxy 2>$null | Out-String).Trim() -replace '\s+', ' '))` }),
  A({ id: 'proxy-aus', titel: 'Manuellen Proxy des Benutzers abschalten', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Schaltet einen von Hand eingetragenen Proxy ab (z. B. aus dem Hotel/Homeoffice). Ein Konfigurationsskript der Firma bleibt.',
    ps: String.raw`
NeedHive
$k = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$is = Get-ItemProperty $k -EA SilentlyContinue
if ($is.ProxyEnable -ne 1) { Zeile 'Es war kein manueller Proxy eingeschaltet — nichts geändert.' } else {
  Set-ItemProperty -Path $k -Name ProxyEnable -Value 0 -Type DWord
  Zeile ('Manueller Proxy abgeschaltet (war: ' + $is.ProxyServer + '). Browser neu starten.')
}` }),
  A({ id: 'winhttp-proxy-reset', titel: 'WinHTTP-Proxy zurücksetzen', modus: 'system', risiko: 'aendern',
    beschreibung: 'Entfernt einen systemweiten Proxy (betrifft Dienste wie Windows Update, Office-Aktivierung).',
    ps: String.raw`
$alt = ((& netsh.exe winhttp show proxy 2>$null | Out-String).Trim() -replace '\s+', ' ')
& netsh.exe winhttp reset proxy 2>&1 | Out-Null
Zeile ('WinHTTP-Proxy zurückgesetzt (vorher: ' + $alt + ').')` }),
  A({ id: 'hosts-pruefen', titel: 'hosts-Datei prüfen', modus: 'system', risiko: 'lesen',
    beschreibung: 'Zeigt Einträge in der hosts-Datei — falsche Einträge leiten Namen auf falsche Adressen um.',
    ps: String.raw`
$f = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$z = @(Get-Content -LiteralPath $f -EA SilentlyContinue | Where-Object { $_ -match '\S' -and $_ -notmatch '^\s*#' })
if ($z.Count) { Zeile ('' + $z.Count + ' Einträge:'); $z | Select-Object -First 25 | ForEach-Object { Zeile ('  ' + $_.Trim()) } } else { Zeile 'Keine Einträge (Standard).' }` }),
  A({ id: 'firewall-status', titel: 'Firewall-Status', modus: 'system', risiko: 'lesen',
    beschreibung: 'Zustand der Windows-Firewall je Profil.',
    ps: String.raw`foreach ($p in Get-NetFirewallProfile) { Zeile ('' + $p.Name + ': ' + $(if ($p.Enabled) { 'an' } else { 'AUS' }) + ' · eingehend ' + $p.DefaultInboundAction) }` }),
  A({ id: 'zeit-sync', titel: 'Uhrzeit mit der Domäne abgleichen', modus: 'system', risiko: 'aendern',
    beschreibung: 'Stellt die Uhr nach dem Domänencontroller (falsche Uhrzeit bricht Anmeldung/Kerberos).',
    ps: String.raw`
$s = Get-Service W32Time -EA SilentlyContinue
if ($s.Status -ne 'Running') { Start-Service W32Time -EA SilentlyContinue }
& w32tm.exe /resync /force 2>&1 | ForEach-Object { Zeile ([string]$_) }
Zeile ('Uhrzeit jetzt: ' + (Get-Date).ToString('dd.MM.yyyy HH:mm:ss') + ' · Zeitzone ' + (Get-TimeZone).Id)` }),
  A({ id: 'zeitzone-de', titel: 'Zeitzone auf Mitteleuropa stellen', modus: 'system', risiko: 'aendern',
    beschreibung: 'Setzt die Zeitzone auf (UTC+01:00) Amsterdam, Berlin …',
    ps: String.raw`$alt = (Get-TimeZone).Id; Set-TimeZone -Id 'W. Europe Standard Time'; Zeile ('Zeitzone: vorher ' + $alt + ', jetzt W. Europe Standard Time.')` }),

  // ══ WLAN ════════════════════════════════════════════════════════════════════
  A({ id: 'wlan-status', titel: 'WLAN-Status und Profile', modus: 'system', risiko: 'lesen',
    beschreibung: 'Verbundenes WLAN, Signal, Band und gespeicherte Profile.',
    ps: String.raw`
$i = (& netsh.exe wlan show interfaces 2>&1 | Out-String)
if ($i -match 'Standort|location') { Zeile 'Live-Daten gesperrt: Windows verlangt die Standortberechtigung (Windows 11 24H2).' }
else { foreach ($z in ($i -split '\r?\n')) { if ($z -match '^\s*(Name|SSID|BSSID|Status|State|Signal|Funktyp|Radio type|Band|Kanal|Channel|Empfangsrate|Receive rate|Profil|Profile)\s*:') { Zeile $z.Trim() } } }
$pr = (& netsh.exe wlan show profiles 2>&1 | Out-String) -split '\r?\n' | Where-Object { $_ -match ':\s*\S' -and $_ -match '(Profil für alle|All User Profile|Gruppenrichtlinienprofil|Group policy profile|Benutzerprofil|User profile)' }
Zeile ('Gespeicherte Profile: ' + $pr.Count); $pr | Select-Object -First 15 | ForEach-Object { Zeile ('  ' + $_.Trim()) }` }),
  A({ id: 'wlan-verbinden', titel: 'WLAN neu verbinden', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Verbindet das WLAN-Profil neu — in der Sitzung des Benutzers (wichtig bei Anmeldung mit Benutzerkonto).',
    param: { label: 'WLAN-Profil', platzhalter: 'z. B. SKF-Corp (leer = zuletzt genutztes)' },
    ps: String.raw`
$p = $P.Trim()
if (-not $p) { $p = ((& netsh.exe wlan show profiles 2>&1 | Out-String) -split '\r?\n' | Where-Object { $_ -match ':\s*\S' -and $_ -match '(Gruppenrichtlinienprofil|Group policy profile|Profil für alle|All User Profile)' } | Select-Object -First 1) -replace '^[^:]*:\s*', '' }
if (-not $p) { throw 'Kein WLAN-Profil gefunden.' }
$o = (& netsh.exe wlan connect ('name=' + $p.Trim()) 2>&1 | Out-String).Trim()
Zeile ('Profil ' + $p.Trim() + ': ' + $o)` }),
  A({ id: 'wlan-profil-loeschen', titel: 'WLAN-Profil löschen', modus: 'system', risiko: 'kritisch',
    beschreibung: 'Entfernt ein gespeichertes WLAN-Profil (z. B. falsches Kennwort gespeichert). Firmenprofile kommen per Richtlinie wieder.',
    param: { label: 'WLAN-Profil', platzhalter: 'exakter Profilname', pflicht: true },
    ps: String.raw`
$o = (& netsh.exe wlan delete profile ('name=' + $P.Trim()) 2>&1 | Out-String).Trim()
Zeile $o
if ($o -match 'Gruppenrichtlinie|group policy') { Zeile 'Dieses Profil kommt per Gruppenrichtlinie — es wird beim nächsten gpupdate wieder angelegt.' }` }),
  A({ id: 'wlan-energiesparen-aus', titel: 'WLAN-Energiesparen abschalten', modus: 'system', risiko: 'aendern',
    beschreibung: 'Stellt den WLAN-Energiesparmodus auf „Höchstleistung“ (Netz und Akku) und erlaubt Windows nicht mehr, den Adapter abzuschalten.',
    ps: String.raw`
& powercfg.exe /setacvalueindex SCHEME_CURRENT 19cbb8fa-5279-450e-9fac-8a3d5fedd0c1 12bbebe6-58d6-4636-95bb-3217ef867c1a 0 2>&1 | Out-Null
& powercfg.exe /setdcvalueindex SCHEME_CURRENT 19cbb8fa-5279-450e-9fac-8a3d5fedd0c1 12bbebe6-58d6-4636-95bb-3217ef867c1a 0 2>&1 | Out-Null
& powercfg.exe /setactive SCHEME_CURRENT 2>&1 | Out-Null
Zeile 'WLAN-Energiesparmodus: Höchstleistung (Netz + Akku).'
foreach ($a in Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object { $_.PhysicalMediaType -match '802\.11' }) {
  try { $pm = Get-NetAdapterPowerManagement -Name $a.Name -EA Stop; if ($pm.AllowComputerToTurnOffDevice -ne 'Disabled') { Set-NetAdapterPowerManagement -Name $a.Name -AllowComputerToTurnOffDevice Disabled -NoRestart -EA Stop; Zeile ('' + $a.Name + ': darf nicht mehr abgeschaltet werden.') } else { Zeile ('' + $a.Name + ': war schon nicht abschaltbar.') } } catch { Zeile ('' + $a.Name + ': Energieverwaltung nicht änderbar (' + $_.Exception.Message + ')') }
}` }),
  A({ id: 'wlan-dienst-neustart', titel: 'WLAN-Dienst neu starten', modus: 'system', risiko: 'kritisch', trenntVerbindung: true,
    beschreibung: 'Startet die WLAN-Autokonfiguration neu — die WLAN-Verbindung ist dabei kurz weg.',
    ps: String.raw`
Spaeter 'Restart-Service WlanSvc -Force' 3
Zeile 'WLAN-Dienst wird in 3 Sekunden neu gestartet (WLAN ca. 15 Sekunden weg).'` }),
  A({ id: 'wlan-bericht', titel: 'WLAN-Trennungen der letzten 7 Tage', modus: 'system', risiko: 'lesen',
    beschreibung: 'Wann und warum das WLAN getrennt wurde (laut Windows).',
    ps: String.raw`
$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-WLAN-AutoConfig/Operational'; Id = 8003; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 60 -EA SilentlyContinue)
Zeile ('' + $ev.Count + ' Trennungen in 7 Tagen')
foreach ($e in $ev | Select-Object -First 20) {
  $x = [xml]$e.ToXml(); $d = @{}; foreach ($n in $x.Event.EventData.Data) { $d[[string]$n.Name] = [string]$n.'#text' }
  Zeile ('  ' + $e.TimeCreated.ToString('dd.MM. HH:mm') + ' · ' + $d['ProfileName'] + ' · ' + $d['Reason'])
}
Zeile 'Tiefe Ursachen-Analyse: Kachel „Netzwerk Probleme“.'` }),

  // ══ VPN / Zscaler / Cisco ═══════════════════════════════════════════════════
  A({ id: 'zscaler-status', titel: 'Zscaler-Status', modus: 'system', risiko: 'lesen',
    beschreibung: 'Dienst, Tray-App und Version von Zscaler Client Connector.',
    ps: String.raw`
$s = Get-Service ZSAService -EA SilentlyContinue
if (-not $s) { Zeile 'Zscaler ist nicht installiert.' } else {
  Zeile ('Dienst ZSAService: ' + $s.Status + ' (' + $s.StartType + ')')
  $t = @(Get-Process ZSATray -IncludeUserName -EA SilentlyContinue); Zeile ('Tray-App: ' + $(if ($t.Count) { 'läuft für ' + (($t | ForEach-Object { $_.UserName }) -join ', ') } else { 'läuft NICHT' }))
  $v = (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { $_.DisplayName -match 'Zscaler' } | Select-Object -First 1).DisplayVersion
  Zeile ('Version: ' + $v)
}` }),
  A({ id: 'zscaler-neustart', titel: 'Zscaler-Dienst neu starten', modus: 'system', risiko: 'aendern',
    beschreibung: 'Startet den Zscaler-Dienst neu (Internet/Intranet kurz weg).',
    ps: String.raw`DienstNeu 'ZSAService'` }),
  A({ id: 'zscaler-tray', titel: 'Zscaler-App starten', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Startet die Zscaler-App in der Sitzung des Benutzers (Symbol im Infobereich, Anmeldung).',
    ps: String.raw`
$exe = @('C:\Program Files\Zscaler\ZSATray\ZSATray.exe', 'C:\Program Files (x86)\Zscaler\ZSATray\ZSATray.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $exe) { throw 'ZSATray.exe nicht gefunden.' }
if (Get-Process ZSATray -EA SilentlyContinue) { Zeile 'Zscaler-App läuft bereits.' } else { Start-Process -FilePath $exe; Zeile 'Zscaler-App gestartet.' }` }),
  A({ id: 'vpn-status', titel: 'VPN-/Netzzugangs-Clients anzeigen', modus: 'system', risiko: 'lesen',
    beschreibung: 'Installierte VPN-/NAC-Software (Cisco, FortiClient, GlobalProtect …) und deren Dienste.',
    ps: String.raw`
$sw = Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { $_.DisplayName -match 'Cisco|AnyConnect|Secure Client|Forti|GlobalProtect|Zscaler|Pulse|Ivanti|OpenVPN|WireGuard|Check Point' }
if (-not $sw) { Zeile 'Keine VPN-Software gefunden.' }
foreach ($s in $sw) { Zeile ('' + $s.DisplayName + ' ' + $s.DisplayVersion) }
foreach ($d in Get-Service -EA SilentlyContinue | Where-Object { $_.DisplayName -match 'Cisco|AnyConnect|Secure Client|Forti|GlobalProtect|Zscaler' }) { Zeile ('  Dienst ' + $d.DisplayName + ': ' + $d.Status) }` }),

  // ══ Netzlaufwerke ═══════════════════════════════════════════════════════════
  A({ id: 'lw-anzeigen', titel: 'Netzlaufwerke anzeigen', modus: 'benutzer', risiko: 'lesen',
    beschreibung: 'Alle Laufwerke des Benutzers mit Ziel und Zustand (verbunden / nicht verfügbar).',
    ps: String.raw`
$m = @(Get-SmbMapping -EA SilentlyContinue)
foreach ($x in $m) { Zeile ('' + $x.LocalPath + ' → ' + $x.RemotePath + ' · ' + $x.Status) }
$fest = @(Get-ChildItem 'HKCU:\Network' -EA SilentlyContinue)
foreach ($f in $fest) { $b = $f.PSChildName.ToUpper() + ':'; if (-not ($m | Where-Object { $_.LocalPath -ieq $b })) { Zeile ('' + $b + ' → ' + (Get-ItemProperty $f.PSPath).RemotePath + ' · gespeichert, aber NICHT verbunden') } }
if (-not $m.Count -and -not $fest.Count) { Zeile 'Keine Netzlaufwerke verbunden.' }` }),
  A({ id: 'lw-verbinden', titel: 'Netzlaufwerk verbinden', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Verbindet ein Laufwerk dauerhaft für den angemeldeten Benutzer.',
    param: { label: 'Buchstabe und Pfad', platzhalter: String.raw`I: \\w3172\skf Marine`, pflicht: true, vorlagen: [String.raw`I: \\w3172\skf Marine`] },
    ps: String.raw`
if ($P -notmatch '^\s*([A-Za-z])\s*:?[\s|;,]*(\\\\.+?)\s*$') { throw 'Bitte so angeben: Buchstabe und Pfad, z. B. I: \\server\freigabe' }
$b = $matches[1].ToUpper() + ':'; $unc = $matches[2].TrimEnd('\')
$da = Get-SmbMapping -LocalPath $b -EA SilentlyContinue
if ($da -and $da.RemotePath -ieq $unc -and $da.Status -eq 'OK') { Zeile ('' + $b + ' ist bereits mit ' + $unc + ' verbunden.') } else {
  if ($da) { & net.exe use $b /delete /y 2>&1 | Out-Null; Zeile ('' + $b + ' war mit ' + $da.RemotePath + ' verbunden — getrennt.') }
  $o = (& net.exe use $b $unc /persistent:yes 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw ('net use: ' + $o) }
  Zeile ('' + $b + ' → ' + $unc + ' verbunden.')
}` }),
  A({ id: 'lw-trennen', titel: 'Netzlaufwerk trennen', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Trennt ein Laufwerk und entfernt die gespeicherte Verbindung.',
    param: { label: 'Laufwerksbuchstabe', platzhalter: 'z. B. S', pflicht: true },
    ps: String.raw`
if ($P -notmatch '([A-Za-z])') { throw 'Bitte einen Laufwerksbuchstaben angeben.' }
$b = $matches[1].ToUpper() + ':'
$o = (& net.exe use $b /delete /y 2>&1 | Out-String).Trim()
Remove-Item ('HKCU:\Network\' + $b.Substring(0, 1)) -Recurse -Force -EA SilentlyContinue
Zeile ('' + $b + ': ' + $(if ($o) { $o } else { 'getrennt' }))` }),
  A({ id: 'lw-neu-verbinden', titel: 'Alle Netzlaufwerke neu verbinden', modus: 'benutzer', risiko: 'aendern', timeoutMs: 120000,
    beschreibung: 'Verbindet alle gespeicherten Laufwerke neu (rotes X nach Homeoffice/VPN/Standby).',
    ps: String.raw`
$fest = @(Get-ChildItem 'HKCU:\Network' -EA SilentlyContinue)
if (-not $fest.Count) { Zeile 'Keine gespeicherten Laufwerke.' }
foreach ($f in $fest) {
  $b = $f.PSChildName.ToUpper() + ':'; $unc = [string](Get-ItemProperty $f.PSPath).RemotePath
  $m = Get-SmbMapping -LocalPath $b -EA SilentlyContinue
  if ($m -and $m.Status -eq 'OK') { Zeile ('' + $b + ' ' + $unc + ': in Ordnung'); continue }
  & net.exe use $b /delete /y 2>&1 | Out-Null
  $o = (& net.exe use $b $unc /persistent:yes 2>&1 | Out-String).Trim()
  Zeile ('' + $b + ' ' + $unc + ': ' + $(if ($LASTEXITCODE -eq 0) { 'neu verbunden' } else { 'FEHLER — ' + $o }))
}` }),
  A({ id: 'lw-pruefen', titel: 'Erreichbarkeit der Netzlaufwerke prüfen', modus: 'benutzer', risiko: 'lesen', timeoutMs: 120000,
    beschreibung: 'Prüft für jedes Laufwerk: Name auflösbar, Server erreichbar (445), Zugriff mit dem Konto des Benutzers.',
    ps: String.raw`
$ziele = @{}
foreach ($m in Get-SmbMapping -EA SilentlyContinue) { $ziele[$m.LocalPath] = $m.RemotePath }
foreach ($f in Get-ChildItem 'HKCU:\Network' -EA SilentlyContinue) { $b = $f.PSChildName.ToUpper() + ':'; if (-not $ziele.ContainsKey($b)) { $ziele[$b] = [string](Get-ItemProperty $f.PSPath).RemotePath } }
if (-not $ziele.Count) { Zeile 'Keine Netzlaufwerke.' }
foreach ($b in $ziele.Keys) {
  $unc = $ziele[$b]; $srv = ($unc -replace '^\\\\', '' -split '\\')[0]
  $dns = $true; try { Resolve-DnsName $srv -EA Stop | Out-Null } catch { $dns = $false }
  $port = $false; try { $t = New-Object System.Net.Sockets.TcpClient; $port = $t.ConnectAsync($srv, 445).Wait(3000); $t.Close() } catch {}
  $zug = Test-Path -LiteralPath $unc
  Zeile ('' + $b + ' ' + $unc + ' · Name ' + $(if ($dns) { 'ok' } else { 'NICHT auflösbar' }) + ' · Server ' + $(if ($port) { 'erreichbar' } else { 'NICHT erreichbar' }) + ' · Zugriff ' + $(if ($zug) { 'ok' } else { 'VERWEIGERT/fehlt' }))
}` }),
  A({ id: 'lw-anmeldedaten-loeschen', titel: 'Gespeicherte Anmeldung für einen Server löschen', modus: 'benutzer', risiko: 'kritisch',
    beschreibung: 'Löscht gespeicherte Zugangsdaten für einen Server (falsches/altes Kennwort gespeichert).',
    param: { label: 'Servername', platzhalter: 'z. B. w3172', pflicht: true },
    ps: String.raw`
$s = $P.Trim().TrimStart('\'); if (-not $s) { throw 'Servername fehlt.' }
$ziele = @(((& cmdkey.exe /list 2>&1 | Out-String) -split '\r?\n') | Where-Object { $_ -match '(Ziel|Target):\s*(.+)$' } | ForEach-Object { ($_ -replace '^.*?(Ziel|Target):\s*', '').Trim() } | Where-Object { $_ -match [regex]::Escape($s) })
if (-not $ziele.Count) { Zeile ('Keine gespeicherte Anmeldung für ' + $s + '.') }
foreach ($z in $ziele) { & cmdkey.exe ('/delete:' + $z) 2>&1 | Out-Null; Zeile ('Gelöscht: ' + $z) }` }),
  A({ id: 'offline-dateien', titel: 'Offlinedateien-Status', modus: 'system', risiko: 'lesen',
    beschreibung: 'Ist die Offlinedateien-Synchronisierung (CSC) aktiv? Häufige Ursache für veraltete Ordnerinhalte.',
    ps: String.raw`
try { $c = Get-CimInstance -ClassName Win32_OfflineFilesCache -EA Stop; Zeile ('Offlinedateien: ' + $(if ($c.Enabled) { 'AKTIV' } else { 'aus' }) + ' · gerade wirksam: ' + (Ja $c.Active)) } catch { Zeile 'Offlinedateien: nicht verfügbar.' }` }),

  // ══ Drucker ═════════════════════════════════════════════════════════════════
  A({ id: 'dr-anzeigen', titel: 'Drucker des Benutzers anzeigen', modus: 'benutzer', risiko: 'lesen',
    beschreibung: 'Installierte Drucker (auch SEAL/PLOSSYS), Port, Treiber, Standarddrucker und Status.',
    ps: DRUCKER_PS + String.raw`
$std = $null; try { $std = (Get-WmiObject Win32_Printer -Filter 'Default=TRUE' -EA Stop).Name } catch {}
$l = DruckerListe
if (-not $l.Count) { Zeile 'Keine Drucker installiert.' }
foreach ($p in $l | Sort-Object Name) { Zeile ($(if ($p.Name -eq $std) { '★ ' } else { '  ' }) + $p.Name + ' · ' + $p.Status + ' · Port ' + $p.Port + ' · ' + $p.Treiber + $(if ($p.Port -like 'PLS_*') { ' (SEAL)' } else { '' })) }
Zeile ('Standarddrucker: ' + $(if ($std) { $std } else { 'keiner' }))
$leg = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows' -EA SilentlyContinue).LegacyDefaultPrinterMode
Zeile ('Windows verwaltet Standarddrucker: ' + $(if ($leg -eq 1) { 'nein' } else { 'ja (wechselt automatisch!)' }))
if (-not (SealApw)) { Zeile 'Hinweis: SEAL Add Printer Wizard ist auf diesem PC nicht installiert.' }` }),
  A({ id: 'dr-verbinden', titel: 'Drucker verbinden', modus: 'benutzer', risiko: 'aendern', timeoutMs: 180000,
    beschreibung: 'Verbindet einen Drucker für den Benutzer — der Druckername (z. B. PMD634) genügt. Über den SEAL Add Printer Wizard; ist der nicht installiert, über die Freigabe auf w3149 bzw. w3150.',
    param: { label: 'Druckername', platzhalter: 'z. B. PMD634', pflicht: true },
    ps: DRUCKER_PS + String.raw`
# Nur der Druckername zählt — „\\w3149\PMD634“ oder „PMD634“ ergibt beides PMD634
$n = ($P.Trim().TrimEnd('\') -replace '^.*\\', '').Trim()
if (-not $n) { throw 'Druckername fehlt (z. B. PMD634).' }
if ($n -notmatch '^[A-Za-z0-9][A-Za-z0-9 ._-]{1,63}$') { throw ('Ungültiger Druckername: ' + $n) }
$vorher = @(DruckerSuche $n | Where-Object { $_.Name -ieq $n -or $_.Name -like ('*\' + $n) })
if ($vorher.Count) { Zeile ($n + ' ist bereits installiert (' + (($vorher | ForEach-Object { $_.Name }) -join ', ') + ').') } else {
  $apw = SealApw
  if ($apw) {
    $pr = Start-Process -FilePath $apw -ArgumentList @('-queue', $n, '-retry', '2') -PassThru -Wait -WindowStyle Hidden
    Start-Sleep -Seconds 2
    $da = @(DruckerSuche $n)
    if ($da.Count) { Zeile ('Über den SEAL Add Printer Wizard verbunden: ' + (($da | ForEach-Object { $_.Name }) -join ', ')) } else { throw ('SEAL hat „' + $n + '“ nicht installiert (Code ' + $pr.ExitCode + ') — Druckernamen prüfen.') }
  } else {
    $ok = $false; $letzter = ''
    foreach ($srv in 'w3149', 'w3150') {
      $unc = '\\' + $srv + '\' + $n
      try { Add-Printer -ConnectionName $unc -EA Stop; $ok = $true } catch { try { (New-Object -ComObject WScript.Network).AddWindowsPrinterConnection($unc); $ok = $true } catch { $letzter = $_.Exception.Message } }
      if ($ok) { Zeile ($n + ' über ' + $unc + ' verbunden (SEAL Add Printer Wizard ist auf diesem PC nicht installiert).'); break }
    }
    if (-not $ok) { throw ('SEAL Add Printer Wizard ist nicht installiert und ' + $n + ' war auf w3149/w3150 nicht verbindbar: ' + $letzter) }
  }
}` }),
  A({ id: 'dr-standard', titel: 'Standarddrucker festlegen', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Setzt den Standarddrucker (WMI, sonst WScript, sonst SEAL) und verhindert, dass Windows ihn automatisch wechselt.',
    param: { label: 'Druckername', platzhalter: 'Name wie in „Drucker anzeigen“', pflicht: true },
    ps: DRUCKER_PS + String.raw`
$dru = DruckerSuche $P | Select-Object -First 1
if (-not $dru) { throw ('Drucker „' + $P + '“ ist beim Benutzer nicht installiert.') }
Set-ItemProperty 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows' -Name LegacyDefaultPrinterMode -Value 1 -Type DWord
$ok = $false
try { $w = @(Get-WmiObject Win32_Printer -Filter ("Name='" + ($dru.Name -replace '\\', '\\' -replace "'", "\'") + "'") -EA Stop) | Select-Object -First 1; if ($w -and $w.SetDefaultPrinter().ReturnValue -eq 0) { $ok = $true } } catch {}
if (-not $ok) { try { (New-Object -ComObject WScript.Network).SetDefaultPrinter($dru.Name); $ok = $true } catch {} }
if (-not $ok) { $apw = SealApw; if ($apw) { Start-Process -FilePath $apw -ArgumentList @('-default', '-queue', $dru.Name) -Wait -WindowStyle Hidden; $ok = $true } }
if (-not $ok) { throw 'Standarddrucker ließ sich nicht setzen.' }
Zeile ('Standarddrucker: ' + $dru.Name + ' (Windows wechselt ihn nicht mehr automatisch).')` }),
  A({ id: 'dr-entfernen', titel: 'Drucker entfernen', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Entfernt einen Drucker beim Benutzer (SEAL-Drucker über den SEAL Add Printer Wizard).',
    param: { label: 'Druckername', platzhalter: 'Name wie in „Drucker anzeigen“', pflicht: true },
    ps: DRUCKER_PS + String.raw`
$dru = @(DruckerSuche $P | Where-Object { $_.Name -ieq $P.Trim() -or $_.Name -like ('*\' + $P.Trim()) }) | Select-Object -First 1
if (-not $dru) { throw ('Drucker „' + $P + '“ nicht gefunden (bitte den genauen Namen aus „Drucker anzeigen“).') }
$apw = SealApw
if ($dru.Port -like 'PLS_*' -and $apw) { Start-Process -FilePath $apw -ArgumentList @('-delete', '-queue', $dru.Name) -Wait -WindowStyle Hidden }
elseif ($dru.Name -like '\\*') { try { Remove-Printer -Name $dru.Name -EA Stop } catch { (New-Object -ComObject WScript.Network).RemovePrinterConnection($dru.Name, $true, $true) } }
else { try { Remove-Printer -Name $dru.Name -EA Stop } catch { $w = Get-WmiObject Win32_Printer -EA SilentlyContinue | Where-Object { $_.Name -eq $dru.Name }; if ($w) { $w.Delete() } } }
Start-Sleep -Seconds 1
if ((DruckerSuche $dru.Name | Where-Object { $_.Name -eq $dru.Name }).Count) { throw ($dru.Name + ' ist noch vorhanden (evtl. per Richtlinie/SEAL zugewiesen).') }
Zeile ($dru.Name + ' entfernt.')` }),
  A({ id: 'dr-offline-fortsetzen', titel: 'Drucker „offline“ / „angehalten“ zurücksetzen', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Schaltet „Drucker offline verwenden“ aus und setzt einen angehaltenen Drucker fort.',
    param: { label: 'Druckername', platzhalter: 'Name wie in „Drucker anzeigen“', pflicht: true },
    ps: DRUCKER_PS + String.raw`
$w = @(Get-WmiObject Win32_Printer -EA SilentlyContinue | Where-Object { $_.Name -ieq $P.Trim() -or $_.Name -like ('*' + $P.Trim() + '*') }) | Select-Object -First 1
if (-not $w) { throw ('Drucker „' + $P + '“ nicht gefunden.') }
if ($w.WorkOffline) { $w.WorkOffline = $false; [void]$w.Put(); Zeile ($w.Name + ': „Drucker offline verwenden“ ausgeschaltet.') } else { Zeile ($w.Name + ': war nicht offline geschaltet.') }
try { $r = $w.Resume(); if ($r.ReturnValue -eq 0) { Zeile ($w.Name + ': fortgesetzt.') } } catch {}` }),
  A({ id: 'dr-testseite', titel: 'Testseite drucken', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Druckt eine Windows-Testseite auf dem angegebenen Drucker.',
    param: { label: 'Druckername', platzhalter: 'Name wie in „Drucker anzeigen“', pflicht: true },
    ps: String.raw`
$w = @(Get-WmiObject Win32_Printer -EA SilentlyContinue | Where-Object { $_.Name -ieq $P.Trim() -or $_.Name -like ('*' + $P.Trim() + '*') }) | Select-Object -First 1
if (-not $w) { throw ('Drucker „' + $P + '“ nicht gefunden.') }
$r = $w.PrintTestPage()
Zeile ('Testseite an ' + $w.Name + ' gesendet (Code ' + $r.ReturnValue + ').')` }),
  A({ id: 'dr-warteschlange', titel: 'Druckaufträge anzeigen', modus: 'system', risiko: 'lesen',
    beschreibung: 'Hängende/wartende Druckaufträge aller Drucker auf diesem PC.',
    ps: String.raw`
$j = @(); try { $j = @(Get-WmiObject Win32_PrintJob -EA Stop) } catch {}
foreach ($x in $j) { Zeile (($x.Name -split ',')[0] + ': „' + $x.Document + '“ von ' + $x.Owner + ' · ' + $x.JobStatus + ' · ' + $x.Status) }
$f = @(Get-ChildItem 'C:\Windows\System32\spool\PRINTERS' -File -EA SilentlyContinue)
Zeile ('' + $j.Count + ' Aufträge sichtbar · ' + $f.Count + ' Dateien im Spool-Ordner')` }),
  A({ id: 'dr-warteschlange-leeren', titel: 'Druckwarteschlange leeren + Spooler neu starten', modus: 'system', risiko: 'kritisch',
    beschreibung: 'Löscht ALLE hängenden Druckaufträge auf diesem PC und startet die Druckwarteschlange neu.',
    ps: String.raw`
Stop-Service Spooler -Force -EA Stop
$f = @(Get-ChildItem 'C:\Windows\System32\spool\PRINTERS' -File -EA SilentlyContinue)
$f | Remove-Item -Force -EA SilentlyContinue
Start-Service Spooler -EA Stop
Zeile ('Spooler neu gestartet, ' + $f.Count + ' hängende Auftragsdateien entfernt.')` }),
  A({ id: 'dr-spooler-neustart', titel: 'Druckwarteschlange neu starten', modus: 'system', risiko: 'aendern',
    beschreibung: 'Startet den Druckspooler neu (Aufträge bleiben erhalten).',
    ps: String.raw`DienstNeu 'Spooler'` }),
  A({ id: 'dr-treiber', titel: 'Druckertreiber anzeigen', modus: 'system', risiko: 'lesen',
    beschreibung: 'Installierte Druckertreiber.',
    ps: String.raw`
$t = @(); try { $t = @(Get-PrinterDriver -EA Stop | ForEach-Object { $_.Name + ' · ' + $_.Manufacturer }) } catch { $t = @(Get-WmiObject Win32_PrinterDriver -EA SilentlyContinue | ForEach-Object { ($_.Name -split ',')[0] }) }
if (-not $t.Count) { Zeile 'Keine Druckertreiber gefunden.' }
$t | Sort-Object -Unique | ForEach-Object { Zeile $_ }` }),

  // ══ Teams ═══════════════════════════════════════════════════════════════════
  A({ id: 'teams-status', titel: 'Teams-Version und Zustand', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Neues/klassisches Teams installiert? Läuft es? Größe des Caches.',
    ps: String.raw`
NeedUser
$neu = Get-AppxPackage -AllUsers -Name MSTeams -EA SilentlyContinue | Select-Object -First 1
Zeile ('Neues Teams: ' + $(if ($neu) { $neu.Version } else { 'nicht installiert' }))
$alt = Join-Path $uLocal 'Microsoft\Teams\current\Teams.exe'
Zeile ('Klassisches Teams: ' + $(if (Test-Path -LiteralPath $alt) { 'installiert (veraltet — sollte entfernt werden)' } else { 'nicht vorhanden' }))
$p = @(UserProcs @('ms-teams', 'Teams')); Zeile ('Läuft: ' + (Ja ($p.Count -gt 0)))
$c = Join-Path $uLocal 'Packages\MSTeams_8wekyb3d8bbwe\LocalCache'; Zeile ('Cache neues Teams: ' + (Groesse (OrdnerGroesse $c)))` }),
  A({ id: 'teams-beenden', titel: 'Teams beenden', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet Teams des angemeldeten Benutzers (alle Teams-Prozesse).',
    ps: String.raw`NeedUser; StopUser @('ms-teams', 'Teams', 'msteamsupdate')` }),
  A({ id: 'teams-starten', titel: 'Teams starten', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Startet Teams in der Sitzung des Benutzers.',
    ps: String.raw`
if (Get-Process ms-teams -EA SilentlyContinue) { Zeile 'Teams läuft bereits.' } else {
  $alias = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\ms-teams.exe'
  if (Test-Path -LiteralPath $alias) { Start-Process -FilePath $alias } else { Start-Process -FilePath 'explorer.exe' -ArgumentList 'shell:AppsFolder\MSTeams_8wekyb3d8bbwe!MSTeams' }
  Zeile 'Teams gestartet.'
}` }),
  A({ id: 'teams-outlook-addin', titel: 'Teams-Besprechungs-Add-in in Outlook aktivieren', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Schaltet das Teams-Add-in (Knopf „Teams-Besprechung“) in Outlook wieder ein. Outlook danach neu starten.',
    ps: String.raw`
NeedHive
$n = 0
foreach ($id in 'TeamsAddin.FastConnect', 'TeamsAddin.Connect') {
  $k = $uHive + '\Software\Microsoft\Office\Outlook\Addins\' + $id
  if (Test-Path $k) { Set-ItemProperty -Path $k -Name LoadBehavior -Value 3 -Type DWord; $n++; Zeile ('' + $id + ': LoadBehavior = 3 (beim Start laden)') }
}
$dis = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Resiliency\DisabledItems'
if (Test-Path $dis) { Remove-Item $dis -Recurse -Force; Zeile 'Liste der von Outlook deaktivierten Add-ins geleert.' }
$dn = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Resiliency\DoNotDisableAddinList'
if (-not (Test-Path $dn)) { New-Item -Path $dn -Force | Out-Null }
Set-ItemProperty -Path $dn -Name 'TeamsAddin.FastConnect' -Value 1 -Type DWord
if (-not $n) { Zeile 'Teams-Add-in ist nicht registriert — Teams einmal starten bzw. neu installieren.' }` }),

  // ══ Outlook ═════════════════════════════════════════════════════════════════
  A({ id: 'ol-status', titel: 'Outlook-Zustand', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Läuft Outlook? Profile, OST-Dateien (Größe), Add-ins und von Outlook deaktivierte Add-ins.',
    ps: String.raw`
NeedHive
Zeile ('Outlook läuft: ' + (Ja ((UserProcs @('OUTLOOK')).Count -gt 0)))
$pk = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Profiles'
Zeile ('Profile: ' + ((@(Get-ChildItem $pk -EA SilentlyContinue | ForEach-Object { $_.PSChildName })) -join ', ') + ' · Standard: ' + (Get-ItemProperty ($uHive + '\Software\Microsoft\Office\16.0\Outlook') -EA SilentlyContinue).DefaultProfile)
foreach ($f in Get-ChildItem (Join-Path $uLocal 'Microsoft\Outlook') -Filter *.ost -EA SilentlyContinue) { Zeile ('OST ' + $f.Name + ': ' + (Groesse $f.Length) + ' · geändert ' + $f.LastWriteTime.ToString('dd.MM. HH:mm')) }
foreach ($a in Get-ChildItem ($uHive + '\Software\Microsoft\Office\Outlook\Addins') -EA SilentlyContinue) { $p = Get-ItemProperty $a.PSPath; Zeile ('Add-in ' + $a.PSChildName + ': LoadBehavior ' + $p.LoadBehavior + $(if ($p.LoadBehavior -eq 2) { ' (AUS)' } else { '' })) }
$d = Get-Item ($uHive + '\Software\Microsoft\Office\16.0\Outlook\Resiliency\DisabledItems') -EA SilentlyContinue
Zeile ('Von Outlook deaktivierte Add-ins: ' + $(if ($d) { $d.ValueCount } else { 0 }))` }),
  A({ id: 'ol-beenden', titel: 'Outlook beenden', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet Outlook des angemeldeten Benutzers (hängt / lässt sich nicht schließen).',
    ps: String.raw`NeedUser; StopUser @('OUTLOOK')` }),
  A({ id: 'ol-addins-reaktivieren', titel: 'Von Outlook deaktivierte Add-ins wieder einschalten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Leert die Liste der von Outlook abgeschalteten Add-ins (z. B. Teams, enaio) und stellt sie auf „beim Start laden“.',
    ps: String.raw`
NeedHive
$res = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Resiliency'
foreach ($u in 'DisabledItems', 'CrashingAddinList') { if (Test-Path ($res + '\' + $u)) { Remove-Item ($res + '\' + $u) -Recurse -Force; Zeile ('' + $u + ' geleert') } }
foreach ($a in Get-ChildItem ($uHive + '\Software\Microsoft\Office\Outlook\Addins') -EA SilentlyContinue) { $p = Get-ItemProperty $a.PSPath; if ($p.LoadBehavior -eq 2) { Set-ItemProperty -Path $a.PSPath -Name LoadBehavior -Value 3 -Type DWord; Zeile ('' + $a.PSChildName + ': wieder eingeschaltet') } }
Zeile 'Outlook neu starten, damit es wirkt.'` }),
  A({ id: 'ol-profilauswahl', titel: 'Outlook beim Start nach dem Profil fragen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Outlook fragt beim nächsten Start nach dem Profil — dort kann ein neues Profil angelegt werden.',
    ps: String.raw`
NeedHive
$k = $uHive + '\Software\Microsoft\Exchange\Client\Options'
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
Set-ItemProperty -Path $k -Name PickLogonProfile -Value '1' -Type String
Zeile 'Outlook fragt beim nächsten Start nach dem Profil („Neu…“ legt ein frisches Profil an).'` }),
  A({ id: 'ol-autoermittlung', titel: 'Outlook-Verbindung testen (AutoErmittlung)', modus: 'system', risiko: 'lesen',
    beschreibung: 'Prüft, ob Exchange Online und die AutoErmittlung erreichbar sind.',
    ps: String.raw`
foreach ($z in 'autodiscover-s.outlook.com', 'outlook.office365.com', 'login.microsoftonline.com') {
  $ok = $false; try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($z, 443).Wait(4000); $t.Close() } catch {}
  Zeile ('' + $z + ': ' + $(if ($ok) { 'erreichbar' } else { 'NICHT erreichbar' }))
}` }),

  // ══ Office ══════════════════════════════════════════════════════════════════
  A({ id: 'office-status', titel: 'Office-Version und Update-Kanal', modus: 'system', risiko: 'lesen',
    beschreibung: 'Installierte Microsoft-365-Version, Kanal, Architektur, letzter Update-Stand.',
    ps: String.raw`
$c = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration' -EA SilentlyContinue
if (-not $c) { Zeile 'Microsoft 365 (Klick-und-Los) nicht gefunden.' } else {
  Zeile ('Version: ' + $c.VersionToReport + ' · ' + $c.Platform + ' · Sprache ' + $c.ClientCulture)
  Zeile ('Produkte: ' + $c.ProductReleaseIds)
  $k = $c.UpdateChannel; if (-not $k) { $k = $c.CDNBaseUrl }
  Zeile ('Kanal: ' + $(switch -Regex ($k) { '492350f6' { 'Aktueller Kanal' } '55336b82' { 'Monatlicher Enterprise-Kanal' } '7ffbc6bf' { 'Halbjährlicher Enterprise-Kanal' } default { $k } }))
  Zeile ('Updates aktiviert: ' + $c.UpdatesEnabled)
}` }),
  A({ id: 'office-schnellreparatur', titel: 'Office-Schnellreparatur', modus: 'system', risiko: 'aendern', timeoutMs: 900000,
    beschreibung: 'Repariert Office lokal ohne Internet (ca. 5–10 Minuten). Office-Programme werden dabei geschlossen.',
    ps: OFFICE_C2R + String.raw`
$pr = Start-Process -FilePath $exe -ArgumentList @('scenario=Repair', ('platform=' + $plat), ('culture=' + $kult), 'RepairType=QuickRepair', 'forceappshutdown=True', 'DisplayLevel=False') -PassThru -Wait
Zeile ('Schnellreparatur beendet (Code ' + $pr.ExitCode + ').')` }),
  A({ id: 'office-onlinereparatur', titel: 'Office-Onlinereparatur', modus: 'system', risiko: 'kritisch', timeoutMs: 1800000,
    beschreibung: 'Installiert Office neu aus dem Internet (30–60 Minuten, viel Datenvolumen). Nur wenn die Schnellreparatur nicht hilft.',
    ps: OFFICE_C2R + String.raw`
Start-Process -FilePath $exe -ArgumentList @('scenario=Repair', ('platform=' + $plat), ('culture=' + $kult), 'RepairType=FullRepair', 'forceappshutdown=True', 'DisplayLevel=False')
Zeile 'Onlinereparatur gestartet — läuft im Hintergrund weiter (30–60 Minuten).'` }),
  A({ id: 'office-update', titel: 'Office-Updates jetzt installieren', modus: 'system', risiko: 'aendern', timeoutMs: 120000,
    beschreibung: 'Stößt das Office-Update an. Offene Office-Programme werden nicht zwangsweise geschlossen.',
    ps: String.raw`
$exe = Join-Path $env:CommonProgramFiles 'Microsoft Shared\ClickToRun\OfficeC2RClient.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'OfficeC2RClient.exe nicht gefunden.' }
Start-Process -FilePath $exe -ArgumentList '/update user updatepromptuser=false forceappshutdown=false displaylevel=false'
Zeile 'Office-Update angestoßen — es lädt im Hintergrund und wird beim nächsten Schließen der Programme fertig.'` }),
  A({ id: 'office-beenden', titel: 'Alle Office-Programme beenden', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet Outlook, Word, Excel, PowerPoint, OneNote, Access des Benutzers (ungespeicherte Änderungen gehen verloren!).',
    ps: 'NeedUser; StopUser @(' + OFFICE_APPS + ')' }),
  A({ id: 'office-cache', titel: 'Office-Dokumentcache leeren', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Leert den Office-Dateicache (Upload-Probleme, „Datei gesperrt“, alte Versionen aus SharePoint/OneDrive).',
    ps: String.raw`
NeedUser
StopUser @(` + OFFICE_APPS + String.raw`)
ClearDir (Join-Path $uLocal 'Microsoft\Office\16.0\OfficeFileCache') 'Office-Dateicache'
ClearDir (Join-Path $uLocal 'Microsoft\Office\OTele') 'Office-Telemetriecache'` }),
  A({ id: 'office-anmeldung-reset', titel: 'Office-Anmeldung zurücksetzen', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Setzt die Microsoft-365-Anmeldung zurück (falsches Konto, Anmeldeschleife, „Lizenz nicht gefunden“). Benutzer muss sich in Office neu anmelden.',
    ps: String.raw`
NeedHive
StopUser @(` + OFFICE_APPS + String.raw`, 'ms-teams', 'Teams', 'OneDrive')
$id = $uHive + '\Software\Microsoft\Office\16.0\Common\Identity'
if (Test-Path $id) { $neu = 'Identity.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss'); Rename-Item -Path $id -NewName $neu -Force; Zeile ('Office-Identität zurückgesetzt (Sicherung: ' + $neu + ')') } else { Zeile 'Keine gespeicherte Office-Identität.' }
ClearDir (Join-Path $uLocal 'Microsoft\Office\16.0\Licensing') 'Office-Lizenzcache'
Zeile 'Nächster Schritt: „Gespeicherte Office-Anmeldedaten löschen“ und Office neu öffnen — der Benutzer meldet sich mit seiner Firmenadresse an.'` }),
  A({ id: 'office-abgesichert', titel: 'Office-Programm im abgesicherten Modus starten', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Startet Word/Excel/PowerPoint ohne Add-ins — zeigt, ob ein Add-in schuld ist.',
    param: { label: 'Programm', platzhalter: 'Excel', pflicht: true, optionen: ['Word', 'Excel', 'PowerPoint', 'Outlook'] },
    ps: String.raw`
$exe = switch -Regex ($P) { 'word' { 'winword.exe'; break } 'excel' { 'excel.exe'; break } 'power' { 'powerpnt.exe'; break } 'outlook' { 'outlook.exe'; break } default { throw 'Bitte Word, Excel, PowerPoint oder Outlook wählen.' } }
Start-Process -FilePath $exe -ArgumentList '/safe'
Zeile ('' + $exe + ' im abgesicherten Modus gestartet.')` }),
  A({ id: 'office-addins', titel: 'Office-Add-ins anzeigen', modus: 'profil', risiko: 'lesen',
    beschreibung: 'COM-Add-ins von Word, Excel, PowerPoint und Outlook mit Zustand.',
    ps: String.raw`
NeedHive
foreach ($app in 'Word', 'Excel', 'PowerPoint', 'Outlook') {
  foreach ($w in @(($uHive + '\Software\Microsoft\Office\' + $app + '\Addins'), ('HKLM:\SOFTWARE\Microsoft\Office\' + $app + '\Addins'), ('HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\' + $app + '\Addins'))) {
    foreach ($a in Get-ChildItem $w -EA SilentlyContinue) { $p = Get-ItemProperty $a.PSPath; Zeile ('' + $app + ': ' + $a.PSChildName + ' · ' + $(if ($p.LoadBehavior -eq 3) { 'an' } elseif ($p.LoadBehavior -eq 2) { 'AUS' } else { 'LoadBehavior ' + $p.LoadBehavior })) }
  }
}` }),
  A({ id: 'office-addin-aus', titel: 'Office-Add-in abschalten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Schaltet ein bestimmtes Add-in für den Benutzer ab (Absturzursache).',
    param: { label: 'Programm und Add-in', platzhalter: 'Excel: Name.Des.Addins', pflicht: true },
    ps: String.raw`
NeedHive
if ($P -notmatch '^\s*(Word|Excel|PowerPoint|Outlook)\s*[:|]\s*(.+?)\s*$') { throw 'Bitte so angeben: Excel: Name.Des.Addins' }
$k = $uHive + '\Software\Microsoft\Office\' + $matches[1] + '\Addins\' + $matches[2]
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
Set-ItemProperty -Path $k -Name LoadBehavior -Value 2 -Type DWord
Zeile ('' + $matches[1] + ': ' + $matches[2] + ' abgeschaltet (LoadBehavior 2). Rückgängig: wieder auf 3 setzen.')` }),

  // ══ OneDrive / SharePoint ═══════════════════════════════════════════════════
  A({ id: 'od-status', titel: 'OneDrive-Zustand', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Läuft OneDrive? Angemeldetes Konto, Ordner, gesicherte Ordner (Desktop/Dokumente).',
    ps: String.raw`
NeedHive
Zeile ('OneDrive läuft: ' + (Ja ((UserProcs @('OneDrive')).Count -gt 0)))
foreach ($a in Get-ChildItem ($uHive + '\Software\Microsoft\OneDrive\Accounts') -EA SilentlyContinue | Where-Object { $_.PSChildName -match 'Business' }) { $p = Get-ItemProperty $a.PSPath; Zeile ('' + $a.PSChildName + ': ' + $p.UserEmail + ' · Ordner ' + $p.UserFolder) }
$sf = Get-ItemProperty ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') -EA SilentlyContinue
Zeile ('Desktop: ' + $sf.Desktop); Zeile ('Dokumente: ' + $sf.Personal)
$exe = @((Join-Path $uLocal 'Microsoft\OneDrive\OneDrive.exe'), 'C:\Program Files\Microsoft OneDrive\OneDrive.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($exe) { Zeile ('Version: ' + (Get-Item -LiteralPath $exe).VersionInfo.ProductVersion) } else { Zeile 'OneDrive.exe nicht gefunden.' }` }),
  A({ id: 'od-neustart', titel: 'OneDrive neu starten', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Beendet OneDrive und startet es neu (Symbol fehlt, Synchronisierung hängt).',
    ps: String.raw`
$exe = @((Join-Path $env:LOCALAPPDATA 'Microsoft\OneDrive\OneDrive.exe'), 'C:\Program Files\Microsoft OneDrive\OneDrive.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $exe) { throw 'OneDrive.exe nicht gefunden.' }
Get-Process OneDrive -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue; Start-Sleep -Seconds 3
Start-Process -FilePath $exe -ArgumentList '/background'; Zeile 'OneDrive neu gestartet.'` }),

  // ══ Browser ═════════════════════════════════════════════════════════════════
  A({ id: 'browser-beenden', titel: 'Browser beenden', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet Edge, Chrome und Firefox des Benutzers (hängt / Neustart nötig).',
    ps: String.raw`NeedUser; StopUser @('msedge', 'chrome', 'firefox')` }),
  A({ id: 'browser-erweiterungen', titel: 'Browser-Erweiterungen anzeigen', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Installierte Erweiterungen in Edge und Chrome (Ursache für Fehler, Werbung, Umleitungen).',
    ps: String.raw`
NeedUser
foreach ($b in @(@('Edge', 'Microsoft\Edge\User Data\Default\Extensions'), @('Chrome', 'Google\Chrome\User Data\Default\Extensions'))) {
  foreach ($e in Get-ChildItem -LiteralPath (Join-Path $uLocal $b[1]) -Directory -EA SilentlyContinue) {
    $m = Get-ChildItem -LiteralPath $e.FullName -Recurse -Filter manifest.json -EA SilentlyContinue | Select-Object -First 1
    $n = $e.Name; try { $j = Get-Content -LiteralPath $m.FullName -Raw | ConvertFrom-Json; if ($j.name -and $j.name -notmatch '^__MSG_') { $n = $j.name + ' (' + $e.Name + ')' } } catch {}
    Zeile ('' + $b[0] + ': ' + $n)
  }
}` }),
  A({ id: 'edge-reparieren', titel: 'Edge reparieren (Update/Neuinstallation)', modus: 'system', risiko: 'aendern', timeoutMs: 300000,
    beschreibung: 'Stößt das Edge-Update an, das Edge auch repariert.',
    ps: String.raw`
$u = @('C:\Program Files (x86)\Microsoft\EdgeUpdate\MicrosoftEdgeUpdate.exe', 'C:\Program Files\Microsoft\EdgeUpdate\MicrosoftEdgeUpdate.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $u) { throw 'Edge-Update nicht gefunden.' }
Start-Process -FilePath $u -ArgumentList '/ua /installsource scheduler' -Wait
$v = (Get-Item 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -EA SilentlyContinue).VersionInfo.ProductVersion
Zeile ('Edge-Update ausgeführt · Version ' + $v)` }),

  // ══ Windows / Explorer / Oberfläche ═════════════════════════════════════════
  A({ id: 'startmenue-neustart', titel: 'Startmenü und Suche neu starten', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Startet Startmenü, Suchfeld und Infobereich neu (öffnen sich nicht / reagieren nicht).',
    ps: String.raw`
foreach ($n in 'StartMenuExperienceHost', 'SearchHost', 'SearchApp', 'ShellExperienceHost', 'TextInputHost') { $p = Get-Process $n -EA SilentlyContinue; if ($p) { $p | Stop-Process -Force -EA SilentlyContinue; Zeile ('' + $n + ' neu gestartet') } }
Start-Sleep -Seconds 2` }),
  A({ id: 'suche-index-neu', titel: 'Windows-Suche neu aufbauen', modus: 'system', risiko: 'kritisch', timeoutMs: 120000,
    beschreibung: 'Löscht den Suchindex und baut ihn neu auf (Outlook-/Startmenü-Suche findet nichts). Dauert danach einige Stunden.',
    ps: String.raw`
Stop-Service WSearch -Force -EA Stop
foreach ($f in 'C:\ProgramData\Microsoft\Search\Data\Applications\Windows\Windows.edb', 'C:\ProgramData\Microsoft\Search\Data\Applications\Windows\Windows.db', 'C:\ProgramData\Microsoft\Search\Data\Applications\Windows\Windows-gather.db') { if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force -EA SilentlyContinue; Zeile ('Gelöscht: ' + (Split-Path $f -Leaf)) } }
Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows Search' -Name SetupCompletedSuccessfully -Value 0 -Type DWord -EA SilentlyContinue
Start-Service WSearch -EA Stop
Zeile 'Windows-Suche neu gestartet — der Index wird im Hintergrund neu aufgebaut.'` }),
  A({ id: 'suche-dienst-neustart', titel: 'Suchdienst neu starten', modus: 'system', risiko: 'aendern',
    beschreibung: 'Startet den Windows-Suchdienst neu (ohne Index zu löschen).',
    ps: String.raw`DienstNeu 'WSearch'` }),
  A({ id: 'schnellzugriff-reset', titel: 'Schnellzugriff zurücksetzen', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Explorer hängt beim Öffnen oder „Schnellzugriff“ ist kaputt: angeheftete Ordner werden zurückgesetzt (gesichert als .alt).',
    ps: String.raw`
NeedUser
$d = Join-Path $uRoam 'Microsoft\Windows\Recent\AutomaticDestinations'
$f = Join-Path $d 'f01b4d95cf55d32a.automaticDestinations-ms'
foreach ($x in UserProcs @('explorer')) { Stop-Process -Id $x.Id -Force -EA SilentlyContinue }
if (Test-Path -LiteralPath $f) { Rename-Item -LiteralPath $f -NewName ('f01b4d95cf55d32a.automaticDestinations-ms.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss')) -Force; Zeile 'Schnellzugriff zurückgesetzt (Sicherung angelegt).' } else { Zeile 'Keine Schnellzugriff-Datei gefunden.' }` }),
  A({ id: 'temp-leeren', titel: 'Temporäre Dateien löschen', modus: 'profil', risiko: 'aendern', timeoutMs: 300000,
    beschreibung: 'Löscht temporäre Dateien des Benutzers und von Windows (in Benutzung befindliche bleiben).',
    ps: String.raw`
NeedUser
ClearDir (Join-Path $uLocal 'Temp') 'Temp des Benutzers'
ClearDir 'C:\Windows\Temp' 'Windows-Temp'
ClearDir (Join-Path $uLocal 'Microsoft\Windows\INetCache') 'Internet-Cache'
ClearDir (Join-Path $uLocal 'CrashDumps') 'Absturzabbilder'` }),
  A({ id: 'speicher-analyse', titel: 'Was belegt den Speicherplatz?', modus: 'profil', risiko: 'lesen', timeoutMs: 240000,
    beschreibung: 'Freier Platz je Laufwerk und die größten Ordner im Profil des Benutzers und von Windows.',
    ps: String.raw`
foreach ($d in Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3') { Zeile ('Laufwerk ' + $d.DeviceID + ' ' + (Groesse $d.FreeSpace) + ' frei von ' + (Groesse $d.Size)) }
$liste = @()
if ($uProf) { foreach ($o in 'Downloads', 'Desktop', 'Documents', 'Pictures', 'Videos', 'AppData\Local\Temp', 'AppData\Local\Microsoft\Outlook', 'AppData\Local\Microsoft\Teams', 'AppData\Local\Packages\MSTeams_8wekyb3d8bbwe', 'AppData\Local\Microsoft\Edge', 'AppData\Local\Google', 'OneDrive - SKF') { $p = Join-Path $uProf $o; if (Test-Path -LiteralPath $p) { $liste += [pscustomobject]@{ n = ('Profil\' + $o); g = (OrdnerGroesse $p) } } } }
foreach ($o in 'C:\Windows\SoftwareDistribution\Download', 'C:\Windows\Temp', 'C:\Windows\Installer', 'C:\ProgramData\Package Cache', 'C:\Temp') { if (Test-Path -LiteralPath $o) { $liste += [pscustomobject]@{ n = $o; g = (OrdnerGroesse $o) } } }
$liste | Sort-Object g -Descending | Select-Object -First 14 | ForEach-Object { Zeile ('  ' + (Groesse $_.g) + '  ' + $_.n) }` }),
  A({ id: 'datentraeger-bereinigen', titel: 'Windows-Speicher bereinigen', modus: 'system', risiko: 'aendern', timeoutMs: 1800000,
    beschreibung: 'Entfernt alte Update-Dateien und Komponentenreste (DISM StartComponentCleanup) und den Update-Download-Ordner.',
    ps: String.raw`
$vor = (Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'").FreeSpace
Stop-Service wuauserv -Force -EA SilentlyContinue
ClearDir 'C:\Windows\SoftwareDistribution\Download' 'Update-Downloads'
Start-Service wuauserv -EA SilentlyContinue
& dism.exe /Online /Cleanup-Image /StartComponentCleanup /Quiet 2>&1 | Out-Null
Zeile ('Komponentenbereinigung: Code ' + $LASTEXITCODE)
$nach = (Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'").FreeSpace
Zeile ('Gewonnen auf C: ' + (Groesse ($nach - $vor)) + ' · jetzt frei: ' + (Groesse $nach))` }),

  // ══ Leistung / Prozesse / Dienste ═══════════════════════════════════════════
  A({ id: 'top-prozesse', titel: 'Was bremst gerade? (CPU/Arbeitsspeicher)', modus: 'system', risiko: 'lesen',
    beschreibung: 'Die Prozesse mit der höchsten CPU-Last und dem größten Speicherverbrauch, mit Benutzer.',
    ps: String.raw`
$kerne = [double](Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors; if ($kerne -lt 1) { $kerne = 1 }
$last = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
Zeile ('CPU gesamt: ' + $last + ' %')
Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -EA SilentlyContinue | Where-Object { $_.Name -notin '_Total', 'Idle' } |
  Group-Object { $_.Name -replace '#\d+$', '' } | ForEach-Object { [pscustomobject]@{ n = $_.Name; c = ($_.Group | Measure-Object PercentProcessorTime -Sum).Sum; k = $_.Count } } |
  Sort-Object c -Descending | Select-Object -First 8 | ForEach-Object { Zeile ('  CPU ' + [math]::Round($_.c / $kerne) + ' %  ' + $_.n + $(if ($_.k -gt 1) { ' (' + $_.k + ' Prozesse)' } else { '' })) }
$os = Get-CimInstance Win32_OperatingSystem
Zeile ('Arbeitsspeicher belegt: ' + [math]::Round(100 - 100 * [double]$os.FreePhysicalMemory / [double]$os.TotalVisibleMemorySize) + ' %')
$pp = $null; try { $pp = @(Get-Process -IncludeUserName -EA Stop) } catch { $pp = @(Get-Process) }
$pp | Group-Object ProcessName | ForEach-Object { [pscustomobject]@{ n = $_.Name; m = ($_.Group | Measure-Object WorkingSet64 -Sum).Sum; u = (@($_.Group | ForEach-Object { $_.UserName } | Where-Object { $_ } | Select-Object -Unique) -join ', ') } } |
  Sort-Object m -Descending | Select-Object -First 8 | ForEach-Object { Zeile ('  RAM ' + (Groesse $_.m) + '  ' + $_.n + $(if ($_.u) { ' (' + $_.u + ')' } else { '' })) }` }),
  A({ id: 'prozess-beenden', titel: 'Programm des Benutzers beenden', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet ein hängendes Programm des angemeldeten Benutzers (nur seine Prozesse).',
    param: { label: 'Programm (Prozessname)', platzhalter: 'z. B. EXCEL, SLDWORKS, saplogon', pflicht: true },
    ps: String.raw`
NeedUser
$n = @($P -split '[,;\s]+' | Where-Object { $_ } | ForEach-Object { $_ -replace '\.exe$', '' })
if (-not $n.Count) { throw 'Programmname fehlt.' }
if ($n | Where-Object { $_ -match '^(csrss|winlogon|lsass|services|smss|wininit|svchost|system)$' }) { throw 'Systemprozesse werden nicht beendet.' }
StopUser $n` }),
  A({ id: 'dienst-neustart', titel: 'Dienst neu starten', modus: 'system', risiko: 'aendern',
    beschreibung: 'Startet einen Windows-Dienst neu.',
    param: { label: 'Dienstname', platzhalter: 'z. B. Spooler, Audiosrv, WSearch', pflicht: true },
    ps: String.raw`
$s = Get-Service -Name $P.Trim() -EA SilentlyContinue
if (-not $s) { $s = Get-Service -EA SilentlyContinue | Where-Object { $_.DisplayName -like ('*' + $P.Trim() + '*') } | Select-Object -First 1 }
if (-not $s) { throw ('Dienst „' + $P + '“ nicht gefunden.') }
if ($s.Name -match '^(WinRM|RpcSs|LanmanServer|Netlogon|Dhcp|Dnscache|EventLog|lsass|SamSs)$') { throw ('Dienst ' + $s.Name + ' wird aus der Ferne nicht neu gestartet (würde die Verbindung/Anmeldung stören).') }
DienstNeu $s.Name` }),
  A({ id: 'dienste-gestoppt', titel: 'Automatische Dienste, die nicht laufen', modus: 'system', risiko: 'lesen',
    beschreibung: 'Dienste mit Starttyp „Automatisch“, die gerade nicht laufen.',
    ps: String.raw`
$d = @(Get-CimInstance Win32_Service -Filter "StartMode='Auto' AND State<>'Running'" | Where-Object { $_.Name -notmatch '^(gupdate|edgeupdate|MapsBroker|sppsvc|RemoteRegistry|tiledatamodelsvc|WbioSrvc|CDPSvc|wuauserv|BITS|ShellHWDetection|DoSvc|GoogleUpdater)' })
if (-not $d.Count) { Zeile 'Alle automatischen Dienste laufen.' }
foreach ($s in $d) { Zeile ('' + $s.DisplayName + ' (' + $s.Name + '): ' + $s.State) }` }),
  A({ id: 'autostart', titel: 'Autostart-Programme anzeigen', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Programme, die mit Windows bzw. mit der Anmeldung starten.',
    ps: String.raw`
foreach ($w in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run') { $p = Get-ItemProperty $w -EA SilentlyContinue; if ($p) { $p.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { Zeile ('Alle: ' + $_.Name + ' → ' + $_.Value) } } }
if ($uHive) { $p = Get-ItemProperty ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Run') -EA SilentlyContinue; if ($p) { $p.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { Zeile ('Benutzer: ' + $_.Name + ' → ' + $_.Value) } } }
if ($uRoam) { Get-ChildItem (Join-Path $uRoam 'Microsoft\Windows\Start Menu\Programs\Startup') -EA SilentlyContinue | ForEach-Object { Zeile ('Autostart-Ordner: ' + $_.Name) } }` }),
  A({ id: 'energie-hoechstleistung', titel: 'Energieplan auf Höchstleistung', modus: 'system', risiko: 'aendern',
    beschreibung: 'Aktiviert „Höchstleistung“ (falls vorhanden) — gegen Ruckeln/gedrosselte CPU am Netzteil.',
    ps: String.raw`
$alt = ((& powercfg.exe /getactivescheme) -join ' ')
& powercfg.exe /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Zeile 'Höchstleistung ist auf diesem Gerät nicht verfügbar (Modern Standby) — Plan bleibt.' } else { Zeile ('Höchstleistung aktiv (vorher: ' + $alt + ')') }` }),
  A({ id: 'bildschirm-timeout', titel: 'Bildschirm-/Standby-Zeiten setzen', modus: 'system', risiko: 'aendern',
    beschreibung: 'Wann der Bildschirm ausgeht und der PC in den Standby geht (am Netzteil).',
    param: { label: 'Minuten Bildschirm / Standby', platzhalter: '15 / 60 (0 = nie)', pflicht: true, vorlagen: ['15 / 60', '30 / 0', '10 / 30'] },
    ps: String.raw`
if ($P -notmatch '^\s*(\d+)\s*[/;,|\s]\s*(\d+)\s*$') { throw 'Bitte z. B. „15 / 60“ angeben.' }
& powercfg.exe /change monitor-timeout-ac ([int]$matches[1]) 2>&1 | Out-Null
& powercfg.exe /change standby-timeout-ac ([int]$matches[2]) 2>&1 | Out-Null
Zeile ('Am Netzteil: Bildschirm aus nach ' + $matches[1] + ' min, Standby nach ' + $(if ($matches[2] -eq '0') { 'nie' } else { $matches[2] + ' min' }) + '.')` }),

  // ══ Windows Update / Software ═══════════════════════════════════════════════
  A({ id: 'wu-status', titel: 'Windows-Update-Stand', modus: 'system', risiko: 'lesen',
    beschreibung: 'Letzte installierte Updates, Fehler, ausstehender Neustart.',
    ps: String.raw`
Get-HotFix -EA SilentlyContinue | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 6 | ForEach-Object { Zeile ($_.InstalledOn.ToString('dd.MM.yyyy') + ' ' + $_.HotFixID + ' ' + $_.Description) }
$f = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WindowsUpdateClient'; Id = 20; StartTime = (Get-Date).AddDays(-30) } -MaxEvents 10 -EA SilentlyContinue)
Zeile ('Fehlgeschlagene Updates (30 Tage): ' + $f.Count); $f | Select-Object -First 5 | ForEach-Object { Zeile ('  ' + $_.TimeCreated.ToString('dd.MM.') + ' ' + (([string]$_.Message -split '\r?\n')[0])) }
$rb = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'); Zeile ('Neustart für Updates nötig: ' + (Ja $rb))` }),
  A({ id: 'wu-suchen', titel: 'Windows-Updates suchen und installieren', modus: 'system', risiko: 'aendern',
    beschreibung: 'Stößt Suche, Download und Installation über den Windows-Update-Dienst an (läuft im Hintergrund).',
    ps: String.raw`
foreach ($s in 'StartScan', 'StartDownload', 'StartInstall') { & "$env:SystemRoot\System32\UsoClient.exe" $s 2>&1 | Out-Null; Zeile ('UsoClient ' + $s) ; Start-Sleep -Seconds 2 }
Zeile 'Windows Update läuft im Hintergrund — Fortschritt unter Einstellungen → Windows Update.'` }),
  A({ id: 'wu-reset', titel: 'Windows Update zurücksetzen', modus: 'system', risiko: 'kritisch', timeoutMs: 180000,
    beschreibung: 'Stoppt die Update-Dienste, benennt den Update-Zwischenspeicher um (SoftwareDistribution, catroot2) und startet neu — bei hängenden/fehlschlagenden Updates.',
    ps: String.raw`
$d = 'wuauserv', 'bits', 'cryptsvc', 'msiserver'
foreach ($s in $d) { Stop-Service $s -Force -EA SilentlyContinue }
Start-Sleep -Seconds 2
[void](RenameAlt 'C:\Windows\SoftwareDistribution' 'SoftwareDistribution')
[void](RenameAlt 'C:\Windows\System32\catroot2' 'catroot2')
foreach ($s in $d) { Start-Service $s -EA SilentlyContinue }
Zeile 'Update-Dienste neu gestartet — danach „Windows-Updates suchen“.'` }),
  A({ id: 'sfc', titel: 'Systemdateien prüfen und reparieren (SFC)', modus: 'system', risiko: 'aendern', timeoutMs: 2400000,
    beschreibung: 'Prüft alle Windows-Systemdateien und ersetzt beschädigte (15–30 Minuten).',
    ps: String.raw`
$o = (& sfc.exe /scannow 2>&1 | Out-String) -replace [char]0, ''
$z = ($o -split '\r?\n' | Where-Object { $_ -match 'Ressourcenschutz|Resource Protection|Reparatur|repair|keine Integritätsverletzungen|did not find' } | Select-Object -Last 3) -join ' '
Zeile ('SFC: ' + $(if ($z) { $z.Trim() } else { 'fertig' }))` }),
  A({ id: 'dism', titel: 'Windows-Abbild reparieren (DISM)', modus: 'system', risiko: 'aendern', timeoutMs: 2400000,
    beschreibung: 'Repariert den Windows-Komponentenspeicher (Voraussetzung, wenn SFC nicht reparieren kann; 10–30 Minuten).',
    ps: String.raw`
$o = (& dism.exe /Online /Cleanup-Image /RestoreHealth 2>&1 | Out-String)
$z = ($o -split '\r?\n' | Where-Object { $_ -match 'erfolgreich|successfully|Fehler|Error|beschädigt|corrupt' } | Select-Object -Last 3) -join ' '
Zeile ('DISM (Code ' + $LASTEXITCODE + '): ' + $z.Trim())` }),
  A({ id: 'msi-reparieren', titel: 'Windows Installer neu registrieren', modus: 'system', risiko: 'aendern',
    beschreibung: 'Behebt „Der Windows Installer-Dienst konnte nicht aufgerufen werden“.',
    ps: String.raw`& msiexec.exe /unregister 2>&1 | Out-Null; Start-Sleep -Seconds 2; & msiexec.exe /regserver 2>&1 | Out-Null; DienstNeu 'msiserver'` }),
  A({ id: 'installation-laeuft', titel: 'Hängende Installation finden', modus: 'system', risiko: 'lesen',
    beschreibung: 'Läuft gerade eine Installation (msiexec/Setup), die andere blockiert?',
    ps: String.raw`
$p = @(Get-CimInstance Win32_Process -EA SilentlyContinue | Where-Object { $_.Name -match '^(msiexec|setup|install|TrustedInstaller|OfficeClickToRun|ccmsetup|winget)' -and $_.CommandLine -notmatch '/V$' })
if (-not $p.Count) { Zeile 'Keine laufende Installation.' }
foreach ($x in $p) { Zeile ('' + $x.Name + ' seit ' + $x.CreationDate.ToString('dd.MM. HH:mm') + ' · ' + ([string]$x.CommandLine).Substring(0, [math]::Min(160, ([string]$x.CommandLine).Length))) }` }),
  A({ id: 'software-suchen', titel: 'Installierte Software suchen', modus: 'system', risiko: 'lesen',
    beschreibung: 'Ist ein Programm installiert, welche Version?',
    param: { label: 'Programm', platzhalter: 'z. B. Adobe, SAP, Java', pflicht: true },
    ps: String.raw`
$t = $P.Trim()
$sw = Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { $_.DisplayName -like ('*' + $t + '*') } | Sort-Object DisplayName
if (-not $sw) { Zeile ('Nichts zu „' + $t + '“ gefunden.') }
foreach ($s in $sw | Select-Object -First 25) { Zeile ('' + $s.DisplayName + ' · ' + $s.DisplayVersion + ' · ' + $s.Publisher + $(if ($s.InstallDate) { ' · installiert ' + $s.InstallDate } else { '' })) }` }),
  A({ id: 'intune-sync', titel: 'Intune/Geräteverwaltung synchronisieren', modus: 'system', risiko: 'aendern',
    beschreibung: 'Stößt die Synchronisierung mit Intune (MDM) an — neue Richtlinien/Apps kommen schneller.',
    ps: String.raw`
$t = @(Get-ScheduledTask -TaskPath '\Microsoft\Windows\EnterpriseMgmt\*' -EA SilentlyContinue | Where-Object { $_.TaskName -match 'PushLaunch|Schedule #3' })
if (-not $t.Count) { Zeile 'Gerät ist nicht in Intune registriert.' }
foreach ($x in $t) { Start-ScheduledTask -TaskPath $x.TaskPath -TaskName $x.TaskName -EA SilentlyContinue; Zeile ('Gestartet: ' + $x.TaskName) }` }),
  A({ id: 'sccm-richtlinie', titel: 'Softwarecenter (SCCM) aktualisieren', modus: 'system', risiko: 'aendern',
    beschreibung: 'Holt die Computerrichtlinie und die Anwendungsauswertung neu — Softwarecenter zeigt danach neue Programme.',
    ps: String.raw`
if (-not (Get-CimClass -Namespace root\ccm -ClassName SMS_Client -EA SilentlyContinue)) { Zeile 'Kein SCCM-Client installiert.' } else {
  foreach ($g in '{00000000-0000-0000-0000-000000000021}', '{00000000-0000-0000-0000-000000000022}', '{00000000-0000-0000-0000-000000000121}', '{00000000-0000-0000-0000-000000000113}') { try { Invoke-CimMethod -Namespace root\ccm -ClassName SMS_Client -MethodName TriggerSchedule -Arguments @{ sScheduleID = $g } -EA Stop | Out-Null; Zeile ('Zyklus ' + $g + ' angestoßen') } catch { Zeile ('Zyklus ' + $g + ': ' + $_.Exception.Message) } }
}` }),

  // ══ Anmeldung / Konto / Domäne ══════════════════════════════════════════════
  A({ id: 'kerberos-computer', titel: 'Kerberos-Tickets des Computers erneuern', modus: 'system', risiko: 'aendern',
    beschreibung: 'Erneuert die Tickets des Computerkontos (nach Aufnahme in eine AD-Gruppe ohne Neustart).',
    ps: String.raw`& klist.exe -li 0x3e7 purge 2>&1 | Out-Null; Zeile 'Computer-Tickets gelöscht.'; & gpupdate.exe /target:computer /force 2>&1 | Out-Null; Zeile 'Computerrichtlinie neu angewendet.'` }),
  A({ id: 'gpupdate', titel: 'Gruppenrichtlinien neu anwenden', modus: 'system', risiko: 'aendern', timeoutMs: 180000,
    beschreibung: 'Wendet Computer-Richtlinien sofort neu an (Laufwerke, Drucker, WLAN-Profil, Einstellungen).',
    ps: String.raw`$o = (& gpupdate.exe /target:computer /force 2>&1 | Out-String) -replace '\s+', ' '; Zeile $o.Trim()` }),
  A({ id: 'gpupdate-benutzer', titel: 'Benutzer-Richtlinien neu anwenden', modus: 'benutzer', risiko: 'aendern', timeoutMs: 180000,
    beschreibung: 'Wendet die Richtlinien des Benutzers neu an (Laufwerkszuordnungen, Ordnerumleitung, Office-Einstellungen).',
    ps: String.raw`$o = (& gpupdate.exe /target:user /force 2>&1 | Out-String) -replace '\s+', ' '; Zeile $o.Trim()` }),
  A({ id: 'gpresult', titel: 'Angewendete Gruppenrichtlinien (Computer)', modus: 'system', risiko: 'lesen', timeoutMs: 120000,
    beschreibung: 'Welche Gruppenrichtlinien auf den Computer wirken und wann zuletzt angewendet.',
    ps: String.raw`(& gpresult.exe /r /scope:computer 2>&1 | Out-String) -split '\r?\n' | Where-Object { $_ -match '\S' } | Select-Object -First 45 | ForEach-Object { Zeile $_.TrimEnd() }` }),
  A({ id: 'vertrauensstellung', titel: 'Vertrauensstellung zur Domäne prüfen', modus: 'system', risiko: 'lesen',
    beschreibung: '„Die Vertrauensstellung zwischen dieser Arbeitsstation und der primären Domäne konnte nicht hergestellt werden“?',
    ps: String.raw`
$dom = (Get-CimInstance Win32_ComputerSystem).Domain
try { Zeile ('Sicherer Kanal zu ' + $dom + ': ' + $(if (Test-ComputerSecureChannel -EA Stop) { 'in Ordnung' } else { 'GESTÖRT' })) } catch { Zeile ('Prüfung fehlgeschlagen: ' + $_.Exception.Message) }
$o = (& nltest.exe ('/sc_query:' + $dom) 2>&1 | Out-String) -replace '\s+', ' '; Zeile $o.Trim()` }),
  A({ id: 'sicherer-kanal-reset', titel: 'Sicheren Kanal zur Domäne zurücksetzen', modus: 'system', risiko: 'aendern',
    beschreibung: 'Baut die Verbindung des Computerkontos zum Domänencontroller neu auf (ohne Neuaufnahme in die Domäne).',
    ps: String.raw`$dom = (Get-CimInstance Win32_ComputerSystem).Domain; $o = (& nltest.exe ('/sc_reset:' + $dom) 2>&1 | Out-String) -replace '\s+', ' '; Zeile $o.Trim()` }),
  A({ id: 'anmeldedaten-anzeigen', titel: 'Gespeicherte Anmeldedaten anzeigen', modus: 'benutzer', risiko: 'lesen',
    beschreibung: 'Ziele in der Anmeldeinformationsverwaltung des Benutzers (keine Kennwörter).',
    ps: String.raw`$z = @(((& cmdkey.exe /list 2>&1 | Out-String) -split '\r?\n') | Where-Object { $_ -match '(Ziel|Target):' } | ForEach-Object { ($_ -replace '^.*?(Ziel|Target):\s*', '').Trim() }); Zeile ('' + $z.Count + ' gespeicherte Anmeldungen'); $z | ForEach-Object { Zeile ('  ' + $_) }` }),
  A({ id: 'anmeldedaten-loeschen', titel: 'Gespeicherte Anmeldedaten löschen', modus: 'benutzer', risiko: 'kritisch',
    beschreibung: 'Löscht gespeicherte Anmeldungen einer Gruppe (z. B. alte Office-/Teams-Kennwörter). Der Benutzer meldet sich danach neu an.',
    param: { label: 'Welche', platzhalter: 'Office', pflicht: true, optionen: ['Office', 'Teams', 'SharePoint/OneDrive', 'Server/Freigaben', 'Outlook'] },
    ps: String.raw`
$muster = switch -Regex ($P) { 'office' { 'MicrosoftOffice|microsoftoffice1[56]|OneAuth'; break } 'teams' { 'msteams|teams|MicrosoftOffice16_Data:SSPI'; break } 'share|onedrive' { 'sharepoint|onedrive|microsoftonline'; break } 'server|freigabe' { '^Domain:target=(?!TERMSRV)'; break } 'outlook' { 'outlook|exchange|autodiscover|MicrosoftOffice16_Data'; break } default { throw 'Unbekannte Gruppe.' } }
$z = @(((& cmdkey.exe /list 2>&1 | Out-String) -split '\r?\n') | Where-Object { $_ -match '(Ziel|Target):' } | ForEach-Object { ($_ -replace '^.*?(Ziel|Target):\s*', '').Trim() } | Where-Object { $_ -match $muster })
if (-not $z.Count) { Zeile 'Keine passenden Anmeldungen gespeichert.' }
foreach ($t in $z) { & cmdkey.exe ('/delete:' + $t) 2>&1 | Out-Null; Zeile ('Gelöscht: ' + ($t -replace '^.*?target=', '')) }` }),
  A({ id: 'aad-status', titel: 'Azure-AD-/Entra-Anmeldung (SSO) prüfen', modus: 'benutzer', risiko: 'lesen',
    beschreibung: 'Ist der PC in Entra ID registriert und hat der Benutzer ein gültiges SSO-Ticket (PRT)?',
    ps: String.raw`(& dsregcmd.exe /status 2>&1 | Out-String) -split '\r?\n' | Where-Object { $_ -match '(AzureAdJoined|DomainJoined|AzureAdPrt |AzureAdPrtUpdateTime|TenantName|WorkplaceJoined|DeviceAuthStatus|NgcSet)\s*:' } | ForEach-Object { Zeile $_.Trim() }` }),
  A({ id: 'aad-prt-erneuern', titel: 'SSO-Ticket (PRT) erneuern', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Holt ein neues Microsoft-365-Anmeldeticket für den Benutzer (Anmeldeaufforderungen in Office/Teams).',
    ps: String.raw`& dsregcmd.exe /refreshprt 2>&1 | Out-Null; Start-Sleep -Seconds 5; (& dsregcmd.exe /status 2>&1 | Out-String) -split '\r?\n' | Where-Object { $_ -match '(AzureAdPrt |AzureAdPrtUpdateTime)\s*:' } | ForEach-Object { Zeile $_.Trim() }` }),
  A({ id: 'profil-status', titel: 'Benutzerprofil prüfen (temporäres Profil?)', modus: 'system', risiko: 'lesen',
    beschreibung: 'Ist der Benutzer mit einem temporären Profil angemeldet? Gibt es kaputte Profileinträge (.bak)?',
    ps: String.raw`
$pl = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList'
foreach ($k in Get-ChildItem $pl -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^S-1-5-21' }) {
  $p = Get-ItemProperty $k.PSPath
  $txt = $k.PSChildName + ' → ' + $p.ProfileImagePath + ' · State ' + $p.State
  if ($k.PSChildName -match '\.bak$') { $txt += ' · KAPUTTER EINTRAG (.bak)' }
  if ($p.ProfileImagePath -match '\\TEMP') { $txt += ' · TEMPORÄRES PROFIL' }
  Zeile $txt
}
$u = (Get-CimInstance Win32_ComputerSystem).UserName; Zeile ('Angemeldet: ' + $u)` }),
  A({ id: 'hello-pin-reset', titel: 'Windows-Hello-PIN zurücksetzen (alle Benutzer)', modus: 'system', risiko: 'kritisch',
    beschreibung: 'PIN-Anmeldung kaputt („Ihre PIN ist nicht mehr verfügbar“): Die PIN-Daten aller Benutzer werden umbenannt — jeder richtet seine PIN neu ein.',
    ps: String.raw`
$ngc = 'C:\Windows\ServiceProfiles\LocalService\AppData\Local\Microsoft\Ngc'
if (-not (Test-Path -LiteralPath $ngc)) { Zeile 'Keine PIN-Daten vorhanden.' } else {
  & takeown.exe /f $ngc /r /d y 2>&1 | Out-Null
  & icacls.exe $ngc /grant '*S-1-5-32-544:F' /t /c 2>&1 | Out-Null
  [void](RenameAlt $ngc 'PIN-Daten (Ngc)')
  Zeile 'Beim nächsten Anmelden mit Kennwort fordert Windows zum Einrichten einer neuen PIN auf.'
}` }),
  A({ id: 'zertifikate-computer', titel: 'Computer-Zertifikate prüfen', modus: 'system', risiko: 'lesen',
    beschreibung: 'Zertifikate des Computers (WLAN 802.1X, VPN) mit Ablaufdatum.',
    ps: String.raw`foreach ($c in Get-ChildItem Cert:\LocalMachine\My -EA SilentlyContinue | Sort-Object NotAfter) { $t = ($c.NotAfter - (Get-Date)).Days; Zeile ('' + $c.Subject + ' · Aussteller ' + $c.Issuer.Split(',')[0] + ' · bis ' + $c.NotAfter.ToString('dd.MM.yyyy') + $(if ($t -lt 0) { ' · ABGELAUFEN' } elseif ($t -lt 30) { ' · läuft in ' + $t + ' Tagen ab' } else { '' })) }` }),
  A({ id: 'zertifikate-erneuern', titel: 'Zertifikate automatisch erneuern', modus: 'system', risiko: 'aendern',
    beschreibung: 'Stößt die automatische Zertifikatsregistrierung für Computer an (WLAN-/VPN-Zertifikat).',
    ps: String.raw`& certutil.exe -pulse 2>&1 | Out-Null; Zeile ('Automatische Registrierung (Computer) angestoßen · Code ' + $LASTEXITCODE)` }),
  A({ id: 'konto-ad', titel: 'AD-Konto des Benutzers prüfen (gesperrt/abgelaufen)', modus: 'lokal', risiko: 'lesen',
    beschreibung: 'Gesperrt? Kennwort abgelaufen? Konto aktiv? Nur lesend — läuft vom Admin-PC aus gegen das Verzeichnis.',
    ps: String.raw`
$sam = ([string]$S -split '\\')[-1] -replace '[^A-Za-z0-9._-]', ''
if (-not $sam) { throw 'Angemeldeter Benutzer des Ziel-PCs unbekannt.' }
$doms = @(); try { $doms = @([System.DirectoryServices.ActiveDirectory.Forest]::GetCurrentForest().Domains | ForEach-Object { $_.Name }) } catch {}
if (-not $doms.Count -and $env:USERDNSDOMAIN) { $doms = @($env:USERDNSDOMAIN) }
$r = $null
foreach ($dm in $doms) {
  try {
    $s = New-Object System.DirectoryServices.DirectorySearcher([ADSI]('LDAP://' + $dm))
    $s.Filter = '(&(objectCategory=person)(sAMAccountName=' + $sam + '))'
    foreach ($a in 'displayName', 'lockoutTime', 'pwdLastSet', 'userAccountControl', 'msDS-UserPasswordExpiryTimeComputed') { [void]$s.PropertiesToLoad.Add($a) }
    $r = $s.FindOne(); if ($r) { break }
  } catch {}
}
if (-not $r) { throw ('Konto ' + $sam + ' im Verzeichnis nicht gefunden.') }
$p = $r.Properties
Zeile ('Konto: ' + $p['displayname'][0] + ' (' + $sam + ')')
$uac = [int]$p['useraccountcontrol'][0]; Zeile ('Aktiv: ' + (Ja (-not ($uac -band 2))))
$lt = 0; if ($p['lockouttime'].Count) { $lt = [int64]$p['lockouttime'][0] }; Zeile ('Gesperrt: ' + $(if ($lt -gt 0) { 'JA seit ' + [DateTime]::FromFileTime($lt).ToString('dd.MM. HH:mm') } else { 'nein' }))
if ($p['msds-userpasswordexpirytimecomputed'].Count) { $x = [int64]$p['msds-userpasswordexpirytimecomputed'][0]; if ($x -gt 0 -and $x -lt [int64]::MaxValue) { $d = [DateTime]::FromFileTime($x); Zeile ('Kennwort läuft ab: ' + $d.ToString('dd.MM.yyyy') + $(if ($d -lt (Get-Date)) { ' · ABGELAUFEN' } else { ' (in ' + ($d - (Get-Date)).Days + ' Tagen)' })) } }
if ($p['pwdlastset'].Count) { Zeile ('Kennwort zuletzt geändert: ' + [DateTime]::FromFileTime([int64]$p['pwdlastset'][0]).ToString('dd.MM.yyyy')) }
Zeile 'Entsperren/Kennwort zurücksetzen: in der AD-Benutzerverwaltung (das Tool ändert nichts im AD).'` }),

  // ══ Hardware / Geräte ═══════════════════════════════════════════════════════
  A({ id: 'geraete-fehler', titel: 'Geräte mit Fehlern (Geräte-Manager)', modus: 'system', risiko: 'lesen',
    beschreibung: 'Geräte mit gelbem Ausrufezeichen, fehlendem Treiber oder Fehlercode.',
    ps: String.raw`
$d = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { $_.Status -in 'Error', 'Degraded', 'Unknown' -and $_.Class -notin 'SoftwareComponent' })
if (-not $d.Count) { Zeile 'Alle Geräte in Ordnung.' }
foreach ($x in $d) { $c = (Get-CimInstance Win32_PnPEntity -Filter ("DeviceID='" + ($x.InstanceId -replace '\\', '\\') + "'") -EA SilentlyContinue).ConfigManagerErrorCode; Zeile ('' + $x.Class + ': ' + $x.FriendlyName + ' · ' + $x.Status + $(if ($c) { ' · Code ' + $c } else { '' })) }` }),
  A({ id: 'hardware-scan', titel: 'Nach geänderter Hardware suchen', modus: 'system', risiko: 'aendern',
    beschreibung: 'Wie „Nach geänderter Hardware suchen“ im Geräte-Manager — erkennt neu angesteckte Geräte.',
    ps: String.raw`& pnputil.exe /scan-devices 2>&1 | Out-Null; Zeile ('Hardware-Suche ausgeführt (Code ' + $LASTEXITCODE + ').')` }),
  A({ id: 'geraet-neustart', titel: 'Gerät neu starten (deaktivieren/aktivieren)', modus: 'system', risiko: 'kritisch',
    beschreibung: 'Startet ein Gerät neu (Kamera, Headset, Dock, Touchpad …). Nicht für Netzwerkadapter — dafür „Netzwerkadapter neu starten“.',
    param: { label: 'Gerätename (Teil)', platzhalter: 'z. B. Kamera, Jabra, Touchpad', pflicht: true },
    ps: String.raw`
$d = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { $_.FriendlyName -like ('*' + $P.Trim() + '*') -and $_.Class -notin 'Net', 'System', 'Processor', 'DiskDrive', 'Volume', 'SCSIAdapter', 'HDC', 'Computer' })
if (-not $d.Count) { throw ('Kein passendes Gerät zu „' + $P + '“.') }
if ($d.Count -gt 3) { throw ('Zu viele Treffer (' + $d.Count + ') — bitte genauer angeben: ' + (($d | Select-Object -First 6 | ForEach-Object { $_.FriendlyName }) -join '; ')) }
foreach ($x in $d) { & pnputil.exe /restart-device $x.InstanceId 2>&1 | Out-Null; Zeile ('' + $x.FriendlyName + ': neu gestartet (Code ' + $LASTEXITCODE + ')') }` }),
  A({ id: 'geraet-aktivieren', titel: 'Deaktiviertes Gerät aktivieren', modus: 'system', risiko: 'aendern',
    beschreibung: 'Aktiviert ein im Geräte-Manager deaktiviertes Gerät (Kamera, Mikrofon, Touchpad, Bluetooth …).',
    param: { label: 'Gerätename (Teil)', platzhalter: 'z. B. Kamera, Bluetooth', pflicht: true },
    ps: String.raw`
$d = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { $_.FriendlyName -like ('*' + $P.Trim() + '*') -and $_.ConfigManagerErrorCode -eq 22 })
if (-not $d.Count) { Zeile ('Kein deaktiviertes Gerät zu „' + $P + '“.') }
foreach ($x in $d) { Enable-PnpDevice -InstanceId $x.InstanceId -Confirm:$false -EA Stop; Zeile ('' + $x.FriendlyName + ': aktiviert') }` }),
  A({ id: 'usb-energiesparen-aus', titel: 'USB-Energiesparen abschalten', modus: 'system', risiko: 'aendern',
    beschreibung: 'Verhindert, dass Windows USB-Anschlüsse abschaltet (Maus/Headset/Dock fallen kurz aus).',
    ps: String.raw`
& powercfg.exe /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 2>&1 | Out-Null
& powercfg.exe /setdcvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 2>&1 | Out-Null
& powercfg.exe /setactive SCHEME_CURRENT 2>&1 | Out-Null
Zeile 'Selektives USB-Energiesparen: aus.'
$n = 0
foreach ($p in Get-CimInstance -Namespace root\wmi -ClassName MSPower_DeviceEnable -EA SilentlyContinue | Where-Object { $_.InstanceName -match '^USB\\' -and $_.Enable }) { try { Set-CimInstance -InputObject $p -Property @{ Enable = $false } -EA Stop; $n++ } catch {} }
Zeile ('USB-Geräte, die Windows nicht mehr abschalten darf: ' + $n)` }),
  A({ id: 'akku', titel: 'Akku-Zustand', modus: 'system', risiko: 'lesen',
    beschreibung: 'Ladezustand, Verschleiß (Kapazität neu vs. jetzt) und Ladezyklen.',
    ps: String.raw`
$b = Get-CimInstance Win32_Battery -EA SilentlyContinue
if (-not $b) { Zeile 'Kein Akku (Desktop-PC).' } else {
  Zeile ('Ladung: ' + $b.EstimatedChargeRemaining + ' % · Status ' + $b.BatteryStatus)
  $f = (Get-CimInstance -Namespace root\wmi -ClassName BatteryFullChargedCapacity -EA SilentlyContinue | Select-Object -First 1).FullChargedCapacity
  $s = (Get-CimInstance -Namespace root\wmi -ClassName BatteryStaticData -EA SilentlyContinue | Select-Object -First 1).DesignedCapacity
  if ($f -and $s) { Zeile ('Kapazität: ' + [math]::Round(100 * $f / $s) + ' % der Neukapazität' + $(if ($f / $s -lt 0.6) { ' · AKKU VERSCHLISSEN — Tausch empfohlen' } else { '' })) }
  $z = (Get-CimInstance -Namespace root\wmi -ClassName BatteryCycleCount -EA SilentlyContinue | Select-Object -First 1).CycleCount; if ($z) { Zeile ('Ladezyklen: ' + $z) }
}` }),
  A({ id: 'monitore', titel: 'Bildschirme und Grafik', modus: 'system', risiko: 'lesen',
    beschreibung: 'Angeschlossene Bildschirme (Modell, Anschluss) und Grafiktreiber.',
    ps: String.raw`
foreach ($m in Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID -EA SilentlyContinue) { $n = -join ($m.UserFriendlyName | Where-Object { $_ } | ForEach-Object { [char]$_ }); Zeile ('Bildschirm: ' + $(if ($n) { $n } else { 'unbekannt' }) + $(if ($m.Active) { '' } else { ' (inaktiv)' })) }
foreach ($g in Get-CimInstance Win32_VideoController) { Zeile ('Grafik: ' + $g.Name + ' · Treiber ' + $g.DriverVersion + ' vom ' + $(if ($g.DriverDate) { $g.DriverDate.ToString('dd.MM.yyyy') } else { '?' }) + ' · ' + $g.CurrentHorizontalResolution + '×' + $g.CurrentVerticalResolution) }` }),
  A({ id: 'dock', titel: 'Dockingstation / USB-C / Thunderbolt prüfen', modus: 'system', risiko: 'lesen',
    beschreibung: 'Erkannte Dock-, Thunderbolt- und DisplayLink-Geräte mit Zustand.',
    ps: String.raw`
$d = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { $_.FriendlyName -match 'Dock|Thunderbolt|USB4|DisplayLink|USB-C|Type-C|Hub' })
if (-not $d.Count) { Zeile 'Kein Dock/Thunderbolt-Gerät erkannt (Dock nicht angeschlossen oder ohne eigene Treiber).' }
foreach ($x in $d | Sort-Object FriendlyName -Unique) { Zeile ('' + $x.FriendlyName + ' · ' + $x.Status) }` }),
  A({ id: 'bluetooth-neustart', titel: 'Bluetooth neu starten', modus: 'system', risiko: 'aendern',
    beschreibung: 'Startet den Bluetooth-Dienst und den Bluetooth-Adapter neu (Maus/Headset koppelt nicht).',
    ps: String.raw`
DienstNeu 'bthserv'
$a = @(Get-PnpDevice -Class Bluetooth -PresentOnly -EA SilentlyContinue | Where-Object { $_.FriendlyName -match 'Adapter|Wireless Bluetooth|Intel|Realtek|Qualcomm|MediaTek' } | Select-Object -First 1)
foreach ($x in $a) { & pnputil.exe /restart-device $x.InstanceId 2>&1 | Out-Null; Zeile ('' + $x.FriendlyName + ': neu gestartet') }` }),
  A({ id: 'datentraeger-zustand', titel: 'Festplatte/SSD-Zustand', modus: 'system', risiko: 'lesen',
    beschreibung: 'Zustand, Verschleiß, Temperatur und Fehlerzähler der Datenträger.',
    ps: String.raw`
foreach ($d in Get-PhysicalDisk -EA SilentlyContinue) {
  $r = $d | Get-StorageReliabilityCounter -EA SilentlyContinue
  Zeile ('' + $d.FriendlyName + ' · ' + $d.MediaType + ' · ' + (Groesse $d.Size) + ' · Zustand ' + $d.HealthStatus + $(if ($r) { ' · Verschleiß ' + $r.Wear + ' % · ' + $r.Temperature + ' °C · Lesefehler ' + $r.ReadErrorsTotal } else { '' }))
}` }),
  A({ id: 'laufwerk-pruefen', titel: 'Laufwerk C: online prüfen', modus: 'system', risiko: 'aendern', timeoutMs: 1800000,
    beschreibung: 'Prüft das Dateisystem auf C: im laufenden Betrieb (kein Neustart).',
    ps: String.raw`$r = Repair-Volume -DriveLetter C -Scan -EA Stop; Zeile ('Ergebnis: ' + $r)` }),

  // ══ Audio / Kamera / Mikrofon ═══════════════════════════════════════════════
  A({ id: 'audio-geraete', titel: 'Audio-Geräte anzeigen', modus: 'system', risiko: 'lesen',
    beschreibung: 'Lautsprecher, Headsets und Mikrofone mit Zustand.',
    ps: String.raw`
foreach ($d in Get-PnpDevice -Class AudioEndpoint -EA SilentlyContinue | Sort-Object Status, FriendlyName) { Zeile ('' + $d.FriendlyName + ' · ' + $(switch ($d.Status) { 'OK' { 'aktiv' } 'Unknown' { 'nicht angeschlossen' } 'Error' { 'DEAKTIVIERT/FEHLER' } default { $d.Status } })) }
foreach ($s in 'Audiosrv', 'AudioEndpointBuilder') { Zeile ('Dienst ' + $s + ': ' + (Get-Service $s -EA SilentlyContinue).Status) }` }),
  A({ id: 'audio-neustart', titel: 'Audio-Dienste neu starten', modus: 'system', risiko: 'aendern',
    beschreibung: 'Startet Windows-Audio neu (kein Ton, Headset wird nicht erkannt, Knistern).',
    ps: String.raw`DienstNeu 'AudioEndpointBuilder'; DienstNeu 'Audiosrv'` }),
  A({ id: 'audio-treiber-neustart', titel: 'Soundkarte neu starten', modus: 'system', risiko: 'kritisch',
    beschreibung: 'Startet den Audio-Controller (Realtek/Intel) neu — Ton ist dabei kurz weg.',
    ps: String.raw`
$d = @(Get-PnpDevice -Class MEDIA -PresentOnly -EA SilentlyContinue | Where-Object { $_.FriendlyName -match 'Audio|Sound|Realtek|Intel' })
if (-not $d.Count) { throw 'Keine Soundkarte gefunden.' }
foreach ($x in $d) { & pnputil.exe /restart-device $x.InstanceId 2>&1 | Out-Null; Zeile ('' + $x.FriendlyName + ': neu gestartet') }` }),
  A({ id: 'datenschutz-kamera-mikro', titel: 'Kamera und Mikrofon freigeben (Datenschutz)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Erlaubt Apps und Desktop-Programmen (Teams, Browser) den Zugriff auf Kamera und Mikrofon.',
    ps: String.raw`
NeedHive
foreach ($typ in 'webcam', 'microphone') {
  $hk = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\' + $typ
  $m = (Get-ItemProperty $hk -EA SilentlyContinue).Value
  if ($m -eq 'Deny') { Set-ItemProperty $hk -Name Value -Value 'Allow'; Zeile ('' + $typ + ': für das Gerät freigegeben (war gesperrt)') }
  foreach ($k in @(($uHive + '\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\' + $typ), ($uHive + '\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\' + $typ + '\NonPackaged'))) {
    if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
    $v = (Get-ItemProperty $k -EA SilentlyContinue).Value
    Set-ItemProperty -Path $k -Name Value -Value 'Allow' -Type String
    Zeile ('' + $typ + ' ' + $(if ($k -match 'NonPackaged') { '(Desktop-Programme)' } else { '(Apps)' }) + ': ' + $(if ($v -eq 'Deny') { 'war gesperrt → freigegeben' } else { 'freigegeben' }))
  }
}
$pol = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy' -EA SilentlyContinue
if ($pol.LetAppsAccessCamera -eq 2 -or $pol.LetAppsAccessMicrophone -eq 2) { Zeile 'Achtung: Eine Gruppenrichtlinie sperrt Kamera/Mikrofon — das muss in der Richtlinie geändert werden.' }` }),
  A({ id: 'kamera-status', titel: 'Kamera prüfen', modus: 'system', risiko: 'lesen',
    beschreibung: 'Erkannte Kameras, Zustand und welches Programm sie gerade benutzt.',
    ps: String.raw`
foreach ($d in Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { $_.Class -in 'Camera', 'Image' }) { Zeile ('' + $d.FriendlyName + ' · ' + $d.Status) }
$k = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam'
Zeile ('Kamerazugriff für das Gerät: ' + (Get-ItemProperty $k -EA SilentlyContinue).Value)
foreach ($u in Get-ChildItem 'Registry::HKEY_USERS' -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^S-1-5-21-[\d-]+$' }) {
  foreach ($a in Get-ChildItem ($u.PSPath + '\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam\NonPackaged') -EA SilentlyContinue) { $p = Get-ItemProperty $a.PSPath; if ($p.LastUsedTimeStop -eq 0) { Zeile ('Kamera gerade benutzt von: ' + ($a.PSChildName -replace '#', '\')) } }
}` }),

  // ══ SAP ═════════════════════════════════════════════════════════════════════
  A({ id: 'sap-status', titel: 'SAP-GUI-Zustand', modus: 'profil', risiko: 'lesen',
    beschreibung: 'SAP-GUI-Version, läuft SAP Logon, Verbindungsliste (Landscape) vorhanden.',
    ps: String.raw`
$v = Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { $_.DisplayName -match '^SAP GUI|SAP Logon|SAP Business Client' } | Select-Object -First 3
foreach ($x in $v) { Zeile ('' + $x.DisplayName + ' ' + $x.DisplayVersion) }
if (-not $v) { Zeile 'SAP GUI ist nicht installiert.' }
if ($uProf) {
  Zeile ('SAP Logon läuft: ' + (Ja ((UserProcs @('saplogon', 'sapgui', 'NWBC')).Count -gt 0)))
  $ls = Join-Path $uRoam 'SAP\Common\SAPUILandscape.xml'; Zeile ('Verbindungsliste des Benutzers: ' + $(if (Test-Path -LiteralPath $ls) { 'vorhanden (' + (Get-Item -LiteralPath $ls).LastWriteTime.ToString('dd.MM.yyyy') + ')' } else { 'FEHLT' }))
}` }),
  A({ id: 'sap-beenden', titel: 'SAP GUI beenden', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet SAP Logon und alle SAP-Fenster des Benutzers (ungespeicherte Eingaben gehen verloren).',
    ps: String.raw`NeedUser; StopUser @('saplogon', 'sapgui', 'saplgpad', 'NWBC', 'sapfront')` }),
  A({ id: 'sap-starten', titel: 'SAP Logon starten', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Startet SAP Logon in der Sitzung des Benutzers.',
    ps: String.raw`
$exe = @('C:\Program Files (x86)\SAP\FrontEnd\SAPgui\saplogon.exe', 'C:\Program Files\SAP\FrontEnd\SAPgui\saplogon.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $exe) { throw 'saplogon.exe nicht gefunden.' }
Start-Process -FilePath $exe; Zeile 'SAP Logon gestartet.'` }),

  // ══ SolidWorks / CAD ════════════════════════════════════════════════════════
  A({ id: 'solidworks-beenden', titel: 'SolidWorks beenden', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet SolidWorks und seine Hilfsprozesse des Benutzers (hängt / startet nicht neu). Ungespeichertes geht verloren.',
    ps: String.raw`NeedUser; StopUser @('SLDWORKS', 'sldworks_fs', 'swShellFileLauncher', 'SLDPROCMON', 'sldProcMon', 'SolidWorksLicensing', 'swvbaserver', 'EXPLORER_SW')` }),
  A({ id: 'solidworks-temp', titel: 'SolidWorks-Temporärdateien löschen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Löscht temporäre SolidWorks-Dateien des Benutzers (SolidWorks muss geschlossen sein).',
    ps: String.raw`
NeedUser
if ((UserProcs @('SLDWORKS')).Count) { throw 'SolidWorks läuft noch — bitte zuerst schließen oder „SolidWorks beenden“.' }
$t = Join-Path $uLocal 'Temp'
$f = @(Get-ChildItem -LiteralPath $t -Force -EA SilentlyContinue | Where-Object { $_.Name -match '^(swx|sw\d|~\$|SOLIDWORKS|sldworks)' })
$f | Remove-Item -Recurse -Force -EA SilentlyContinue
Zeile ('' + $f.Count + ' SolidWorks-Temporärdateien/-ordner entfernt.')` }),
  A({ id: 'grafik-treiber-info', titel: 'Grafiktreiber prüfen', modus: 'system', risiko: 'lesen',
    beschreibung: 'Grafikkarte, Treiberversion und -datum, Treiber-Resets der letzten 14 Tage.',
    ps: String.raw`
foreach ($g in Get-CimInstance Win32_VideoController) { Zeile ('' + $g.Name + ' · Treiber ' + $g.DriverVersion + ' vom ' + $(if ($g.DriverDate) { $g.DriverDate.ToString('dd.MM.yyyy') } else { '?' })) }
$r = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Display'; Id = 4101; StartTime = (Get-Date).AddDays(-14) } -EA SilentlyContinue)
Zeile ('Grafiktreiber-Resets (14 Tage): ' + $r.Count)` }),

  // ══ Sicherheit ══════════════════════════════════════════════════════════════
  A({ id: 'defender-status', titel: 'Virenschutz-Status', modus: 'system', risiko: 'lesen',
    beschreibung: 'Echtzeitschutz, Signaturstand, letzte Scans und Funde.',
    ps: String.raw`
try { $s = Get-MpComputerStatus -EA Stop
  Zeile ('Echtzeitschutz: ' + $(if ($s.RealTimeProtectionEnabled) { 'an' } else { 'AUS' }) + ' · Antivirus ' + $(if ($s.AntivirusEnabled) { 'an' } else { 'AUS' }))
  Zeile ('Signaturen vom ' + $s.AntivirusSignatureLastUpdated.ToString('dd.MM.yyyy HH:mm') + ' (' + $s.AntivirusSignatureAge + ' Tage alt)')
  Zeile ('Letzter Schnellscan: ' + $s.QuickScanEndTime)
} catch { Zeile ('Defender-Status nicht lesbar: ' + $_.Exception.Message + ' (anderer Virenschutz?)') }
try { foreach ($t in Get-MpThreatDetection -EA Stop | Sort-Object InitialDetectionTime -Descending | Select-Object -First 5) { Zeile ('Fund ' + $t.InitialDetectionTime.ToString('dd.MM. HH:mm') + ': ' + ($t.Resources -join ', ')) } } catch {}` }),
  A({ id: 'defender-signaturen', titel: 'Virensignaturen aktualisieren', modus: 'system', risiko: 'aendern', timeoutMs: 300000,
    beschreibung: 'Lädt die neuesten Defender-Signaturen.',
    ps: String.raw`Update-MpSignature -EA Stop; Zeile ('Signaturen aktualisiert: ' + (Get-MpComputerStatus).AntivirusSignatureLastUpdated.ToString('dd.MM.yyyy HH:mm'))` }),
  A({ id: 'defender-scan', titel: 'Virenschnellscan starten', modus: 'system', risiko: 'aendern',
    beschreibung: 'Startet einen Schnellscan im Hintergrund (einige Minuten).',
    ps: String.raw`Spaeter 'Start-MpScan -ScanType QuickScan' 2; Zeile 'Schnellscan gestartet — Ergebnis danach unter „Virenschutz-Status“.'` }),
  A({ id: 'bitlocker-status', titel: 'BitLocker-Status', modus: 'system', risiko: 'lesen',
    beschreibung: 'Ist das Laufwerk verschlüsselt, ist der Schutz aktiv oder pausiert?',
    ps: String.raw`foreach ($v in Get-BitLockerVolume -EA SilentlyContinue) { Zeile ('' + $v.MountPoint + ' · ' + $v.VolumeStatus + ' · Schutz ' + $v.ProtectionStatus + ' · ' + $v.EncryptionPercentage + ' % · Schlüssel: ' + (($v.KeyProtector | ForEach-Object { $_.KeyProtectorType }) -join ', ')) }` }),
  A({ id: 'bitlocker-fortsetzen', titel: 'BitLocker-Schutz fortsetzen', modus: 'system', risiko: 'aendern',
    beschreibung: 'Setzt einen pausierten BitLocker-Schutz fort (nach BIOS-Update/Reparatur).',
    ps: String.raw`$v = Get-BitLockerVolume -MountPoint 'C:' -EA Stop; if ($v.ProtectionStatus -eq 'On') { Zeile 'Schutz ist bereits aktiv.' } else { Resume-BitLocker -MountPoint 'C:' -EA Stop | Out-Null; Zeile 'BitLocker-Schutz fortgesetzt.' }` }),
  // ══ Erweiterung 06.11.2026 (Lücken aus den Katalogen) ═══════════════════════
  A({ id: 'teams-klassisch-entfernen', titel: 'Klassisches Teams entfernen', modus: 'benutzer', risiko: 'kritisch', timeoutMs: 180000,
    beschreibung: 'Deinstalliert das veraltete klassische Teams des Benutzers (das neue Teams bleibt). Behebt doppelte Teams, falsche Links und Anmeldeschleifen.',
    ps: String.raw`
$u = Join-Path $env:LOCALAPPDATA 'Microsoft\Teams\Update.exe'
if (-not (Test-Path -LiteralPath $u)) { Zeile 'Klassisches Teams ist für diesen Benutzer nicht installiert.' } else {
  Get-Process Teams -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue; Start-Sleep -Seconds 2
  $p = Start-Process -FilePath $u -ArgumentList @('--uninstall', '-s') -PassThru -Wait
  Zeile ('Klassisches Teams deinstalliert (Code ' + $p.ExitCode + ').')
}` }),
  A({ id: 'office-addins-ein', titel: 'Deaktivierte Add-ins in Word/Excel/PowerPoint einschalten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Leert die Listen der von Word, Excel und PowerPoint abgeschalteten Add-ins und stellt abgeschaltete Benutzer-Add-ins wieder auf „beim Start laden“.',
    ps: String.raw`
NeedHive
foreach ($app in 'Word', 'Excel', 'PowerPoint') {
  $res = $uHive + '\Software\Microsoft\Office\16.0\' + $app + '\Resiliency'
  foreach ($u in 'DisabledItems', 'CrashingAddinList') { if (Test-Path ($res + '\' + $u)) { Remove-Item ($res + '\' + $u) -Recurse -Force; Zeile ($app + ': ' + $u + ' geleert') } }
  foreach ($a in Get-ChildItem ($uHive + '\Software\Microsoft\Office\' + $app + '\Addins') -EA SilentlyContinue) { $p = Get-ItemProperty $a.PSPath; if ($p.LoadBehavior -eq 2) { Set-ItemProperty -Path $a.PSPath -Name LoadBehavior -Value 3 -Type DWord; Zeile ($app + ': ' + $a.PSChildName + ' wieder eingeschaltet') } }
}
Zeile 'Programme neu starten, damit es wirkt.'` }),
  A({ id: 'aad-broker-reset', titel: 'Microsoft-365-Anmeldecache zurücksetzen (TokenBroker)', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Benennt die zwischengespeicherten Konten des Windows-Anmeldedienstes um (Office/Teams-Anmeldeschleife, caa70004, „Konto braucht Aufmerksamkeit“). Office-Programme werden beendet; danach neu anmelden.',
    ps: String.raw`
NeedUser
StopUser @('OUTLOOK', 'WINWORD', 'EXCEL', 'POWERPNT', 'ONENOTE', 'ms-teams', 'Teams', 'OneDrive')
$acc = Join-Path $uLocal 'Packages\Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy\AC\TokenBroker\Accounts'
[void](RenameAlt $acc 'Zwischengespeicherte Konten (TokenBroker)')
Zeile 'Danach Office bzw. Teams öffnen und mit der Firmenadresse anmelden.'` }),
  A({ id: 'benachrichtigungen-an', titel: 'Windows-Benachrichtigungen einschalten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Schaltet die Benachrichtigungen (Teams, Outlook, Kalender) für den Benutzer wieder ein.',
    ps: String.raw`
NeedHive
$k1 = $uHive + '\Software\Microsoft\Windows\CurrentVersion\PushNotifications'
if (-not (Test-Path $k1)) { New-Item -Path $k1 -Force | Out-Null }
$alt = (Get-ItemProperty $k1 -EA SilentlyContinue).ToastEnabled
Set-ItemProperty -Path $k1 -Name ToastEnabled -Value 1 -Type DWord
$k2 = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings'
if (-not (Test-Path $k2)) { New-Item -Path $k2 -Force | Out-Null }
Set-ItemProperty -Path $k2 -Name NOC_GLOBAL_SETTING_TOASTS_ENABLED -Value 1 -Type DWord
Zeile ('Benachrichtigungen: ' + $(if ($alt -eq 0) { 'waren AUS → jetzt an' } else { 'an' }) + '. „Nicht stören“ schaltet der Benutzer im Infobereich ab.')` }),
  A({ id: 'dns-automatisch', titel: 'DNS-Server wieder automatisch beziehen', modus: 'system', risiko: 'kritisch',
    beschreibung: 'Entfernt von Hand eingetragene DNS-Server (z. B. 8.8.8.8 aus dem Homeoffice) — der PC nimmt wieder die DNS-Server der Firma per DHCP.',
    ps: String.raw`
$n = 0
foreach ($a in Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object { $_.Status -eq 'Up' }) {
  $alt = (Get-DnsClientServerAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -EA SilentlyContinue).ServerAddresses -join ', '
  $dhcp = (Get-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -EA SilentlyContinue).Dhcp
  Set-DnsClientServerAddress -InterfaceIndex $a.ifIndex -ResetServerAddresses -EA Stop
  $neu = (Get-DnsClientServerAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -EA SilentlyContinue).ServerAddresses -join ', '
  Zeile ($a.Name + ': vorher ' + $(if ($alt) { $alt } else { '—' }) + ' → jetzt ' + $(if ($neu) { $neu } else { 'per DHCP' }) + $(if ($dhcp -ne 'Enabled') { ' (Achtung: feste IP-Adresse — DNS kommt dann nicht per DHCP)' } else { '' }))
  $n++
}
if (-not $n) { Zeile 'Kein aktiver Netzwerkadapter.' }
Clear-DnsClientCache` }),
  A({ id: 'ip-dhcp', titel: 'Feste IP-Adresse entfernen (wieder DHCP)', modus: 'system', risiko: 'kritisch', trenntVerbindung: true,
    beschreibung: 'Stellt einen Adapter mit von Hand eingetragener IP wieder auf automatisch (DHCP) — die Verbindung ist dabei kurz weg.',
    param: { label: 'Welcher Adapter', platzhalter: 'LAN', optionen: ['WLAN', 'LAN'], pflicht: true },
    ps: String.raw`
$typ = $(if ($P -match 'lan|eth' -and $P -notmatch 'wlan') { 'LAN' } else { 'WLAN' })
$ad = @(Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object { if ($typ -eq 'WLAN') { $_.PhysicalMediaType -match '802\.11' -or $_.InterfaceDescription -match 'Wi-?Fi|Wireless|WLAN' } else { $_.PhysicalMediaType -match '802\.3' -and $_.InterfaceDescription -notmatch 'Wi-?Fi|Wireless|WLAN' } })
if (-not $ad.Count) { throw ('Kein ' + $typ + '-Adapter gefunden.') }
$i = Get-NetIPInterface -InterfaceIndex $ad[0].ifIndex -AddressFamily IPv4 -EA Stop
if ($i.Dhcp -eq 'Enabled') { Zeile ($ad[0].Name + ' bezieht die Adresse bereits automatisch (DHCP).') } else {
  $ip = (Get-NetIPAddress -InterfaceIndex $ad[0].ifIndex -AddressFamily IPv4 -EA SilentlyContinue | Select-Object -First 1).IPAddress
  $idx = $ad[0].ifIndex
  Spaeter ('Get-NetIPAddress -InterfaceIndex ' + $idx + ' -AddressFamily IPv4 -EA SilentlyContinue | Remove-NetIPAddress -Confirm:$false -EA SilentlyContinue; Remove-NetRoute -InterfaceIndex ' + $idx + ' -DestinationPrefix 0.0.0.0/0 -Confirm:$false -EA SilentlyContinue; Set-NetIPInterface -InterfaceIndex ' + $idx + ' -Dhcp Enabled; Set-DnsClientServerAddress -InterfaceIndex ' + $idx + ' -ResetServerAddresses; ipconfig /renew') 3
  Zeile ($ad[0].Name + ': feste Adresse ' + $ip + ' wird in 3 Sekunden auf DHCP umgestellt (Verbindung kurz weg).')
}` }),
  A({ id: 'hosts-bereinigen', titel: 'hosts-Datei auf Standard zurücksetzen', modus: 'system', risiko: 'kritisch',
    beschreibung: 'Sichert die hosts-Datei und setzt sie auf den Windows-Standard zurück (falsche Umleitungen von Webseiten/Servern).',
    ps: String.raw`
$f = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$z = @(Get-Content -LiteralPath $f -EA SilentlyContinue | Where-Object { $_ -match '\S' -and $_ -notmatch '^\s*#' })
if (-not $z.Count) { Zeile 'Die hosts-Datei enthält keine Einträge — nichts zu tun.' } else {
  $sich = $f + '.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
  Copy-Item -LiteralPath $f -Destination $sich -Force
  Set-Content -LiteralPath $f -Value @('# Copyright (c) Microsoft Corp.', '#', '# Standard-hosts-Datei (zurückgesetzt durch das IT Admin Tool).', '#', '# localhost name resolution is handled within DNS itself.', '#	127.0.0.1       localhost', '#	::1             localhost') -Encoding ASCII
  Clear-DnsClientCache
  Zeile ('' + $z.Count + ' Einträge entfernt, Sicherung: ' + $sich)
}` }),
  A({ id: 'firewall-ein', titel: 'Windows-Firewall einschalten', modus: 'system', risiko: 'aendern',
    beschreibung: 'Schaltet die Windows-Firewall für alle Profile wieder ein (eine Gruppenrichtlinie kann das überstimmen).',
    ps: String.raw`
foreach ($p in Get-NetFirewallProfile) { $v = $p.Enabled; Set-NetFirewallProfile -Name $p.Name -Enabled True -EA Stop; Zeile ($p.Name + ': ' + $(if ($v) { 'war an' } else { 'war AUS → jetzt an' })) }` }),
  A({ id: 'longpaths-ein', titel: 'Lange Dateipfade erlauben', modus: 'system', risiko: 'aendern',
    beschreibung: 'Erlaubt Pfade über 260 Zeichen (tiefe Ordner auf Netzlaufwerken/OneDrive). Programme müssen das unterstützen; danach neu starten.',
    ps: String.raw`
$k = 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem'
$alt = (Get-ItemProperty $k -Name LongPathsEnabled -EA SilentlyContinue).LongPathsEnabled
Set-ItemProperty -Path $k -Name LongPathsEnabled -Value 1 -Type DWord
Zeile ('Lange Pfade: ' + $(if ($alt -eq 1) { 'waren schon erlaubt' } else { 'jetzt erlaubt (nach Neustart wirksam)' }))` }),
  A({ id: 'linked-connections', titel: 'Netzlaufwerke auch in Admin-Programmen sichtbar', modus: 'system', risiko: 'aendern',
    beschreibung: 'Setzt EnableLinkedConnections — als Administrator gestartete Programme (Setups, „Als Admin ausführen“) sehen dann die Netzlaufwerke. Wirkt nach Neustart.',
    ps: String.raw`
$k = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
$alt = (Get-ItemProperty $k -Name EnableLinkedConnections -EA SilentlyContinue).EnableLinkedConnections
Set-ItemProperty -Path $k -Name EnableLinkedConnections -Value 1 -Type DWord
Zeile ('EnableLinkedConnections: ' + $(if ($alt -eq 1) { 'war schon gesetzt' } else { 'gesetzt — nach Neustart wirksam' }))` }),
  A({ id: 'intranetzone-server', titel: 'Server zur lokalen Intranetzone hinzufügen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Trägt einen Server in die Intranetzone des Benutzers ein — keine Sicherheitswarnung mehr beim Öffnen von Dateien/Programmen vom Netzlaufwerk.',
    param: { label: 'Servername', platzhalter: 'z. B. w3172', pflicht: true },
    ps: String.raw`
NeedHive
$s = $P.Trim().TrimStart('\').Split('\')[0]
if ($s -notmatch '^[A-Za-z0-9][A-Za-z0-9.-]{0,62}$') { throw ('Ungültiger Servername: ' + $P) }
$k = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Internet Settings\ZoneMap\Domains\' + $s
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
Set-ItemProperty -Path $k -Name 'file' -Value 1 -Type DWord
Zeile ($s + ' gehört jetzt für den Benutzer zur lokalen Intranetzone (Explorer neu öffnen). Eine Richtlinien-Zonenliste kann das überstimmen.')` }),
  A({ id: 'pdf-drucker-an', titel: '„Microsoft Print to PDF“ wieder einschalten', modus: 'system', risiko: 'aendern', timeoutMs: 600000,
    beschreibung: 'Aktiviert die Windows-Funktion „Microsoft Print to PDF“ (PDF-Drucker fehlt).',
    ps: String.raw`
$f = Get-WindowsOptionalFeature -Online -FeatureName 'Printing-PrintToPDFServices-Features' -EA Stop
if ($f.State -eq 'Enabled') { Zeile 'Die Funktion ist bereits aktiv.'; if (-not (Get-WmiObject Win32_Printer -Filter "Name='Microsoft Print to PDF'" -EA SilentlyContinue)) { Disable-WindowsOptionalFeature -Online -FeatureName 'Printing-PrintToPDFServices-Features' -NoRestart -EA SilentlyContinue | Out-Null; Enable-WindowsOptionalFeature -Online -FeatureName 'Printing-PrintToPDFServices-Features' -NoRestart -EA Stop | Out-Null; Zeile 'Drucker fehlte → Funktion neu eingerichtet.' } }
else { Enable-WindowsOptionalFeature -Online -FeatureName 'Printing-PrintToPDFServices-Features' -NoRestart -EA Stop | Out-Null; Zeile '„Microsoft Print to PDF“ aktiviert.' }` }),
  A({ id: 'tastatur-de', titel: 'Tastatur auf Deutsch stellen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Setzt Deutsch (QWERTZ) als erste Tastatur des Benutzers (Y und Z vertauscht, Umlaute fehlen). Wirkt nach Ab-/Anmeldung bzw. Windows+Leertaste.',
    ps: String.raw`
NeedHive
$k = $uHive + '\Keyboard Layout\Preload'
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
$p = Get-ItemProperty $k -EA SilentlyContinue
$alt = @($p.PSObject.Properties | Where-Object { $_.Name -match '^\d+$' } | Sort-Object { [int]$_.Name } | ForEach-Object { [string]$_.Value })
$neu = @('00000407') + @($alt | Where-Object { $_ -ne '00000407' })
foreach ($e in $p.PSObject.Properties | Where-Object { $_.Name -match '^\d+$' }) { Remove-ItemProperty -Path $k -Name $e.Name -EA SilentlyContinue }
for ($i = 0; $i -lt $neu.Count; $i++) { Set-ItemProperty -Path $k -Name ([string]($i + 1)) -Value $neu[$i] -Type String }
Zeile ('Tastaturen: vorher ' + $(if ($alt.Count) { $alt -join ', ' } else { '—' }) + ' → jetzt ' + ($neu -join ', ') + ' (00000407 = Deutsch).')` }),
  A({ id: 'zwischenablage-neustart', titel: 'Zwischenablage-Dienst neu starten', modus: 'system', risiko: 'aendern',
    beschreibung: 'Startet den Zwischenablage-Dienst neu (Kopieren/Einfügen geht nicht, Windows+V leer).',
    ps: String.raw`
$s = @(Get-Service -Name 'cbdhsvc_*' -EA SilentlyContinue)
if (-not $s.Count) { throw 'Zwischenablage-Dienst nicht gefunden.' }
foreach ($x in $s) { try { Restart-Service -Name $x.Name -Force -EA Stop; Zeile ($x.Name + ': neu gestartet') } catch { Zeile ($x.Name + ': ' + $_.Exception.Message) } }` }),
  A({ id: 'dotnet35-an', titel: '.NET Framework 3.5 aktivieren', modus: 'system', risiko: 'aendern', timeoutMs: 1800000,
    beschreibung: 'Aktiviert .NET 3.5 (ältere Programme verlangen es). Braucht Zugriff auf Windows Update bzw. den Update-Server.',
    ps: String.raw`
$f = Get-WindowsOptionalFeature -Online -FeatureName NetFx3 -EA Stop
if ($f.State -eq 'Enabled') { Zeile '.NET 3.5 ist bereits aktiv.' } else { $r = Enable-WindowsOptionalFeature -Online -FeatureName NetFx3 -All -NoRestart -EA Stop; Zeile ('.NET 3.5 aktiviert' + $(if ($r.RestartNeeded) { ' — Neustart nötig' } else { '' }) + '.') }` }),
  A({ id: 'update-deinstallieren', titel: 'Windows-Update deinstallieren', modus: 'system', risiko: 'kritisch', timeoutMs: 900000,
    beschreibung: 'Entfernt ein bestimmtes Update (KB-Nummer), wenn es nachweislich Probleme macht. Danach ist ein Neustart nötig.',
    param: { label: 'KB-Nummer', platzhalter: 'z. B. KB5034441', pflicht: true },
    ps: String.raw`
if ($P -notmatch '^\s*(KB)?(\d{6,8})\s*$') { throw 'Bitte die KB-Nummer angeben, z. B. KB5034441.' }
$kb = $matches[2]
if (-not (Get-HotFix -Id ('KB' + $kb) -EA SilentlyContinue)) { Zeile ('KB' + $kb + ' ist auf diesem PC nicht installiert.') } else {
  $p = Start-Process -FilePath "$env:SystemRoot\System32\wusa.exe" -ArgumentList @('/uninstall', ('/kb:' + $kb), '/quiet', '/norestart') -PassThru -Wait
  Zeile ('KB' + $kb + ': wusa Code ' + $p.ExitCode + $(switch ($p.ExitCode) { 0 { ' (entfernt)' } 3010 { ' (entfernt — Neustart nötig)' } 2359303 { ' (nicht installiert)' } 87 { ' (lässt sich so nicht entfernen, z. B. Sicherheits-/Servicing-Stack-Update)' } default { '' } }))
}` }),
  A({ id: 'autostart-entfernen', titel: 'Autostart-Eintrag des Benutzers entfernen', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Entfernt einen Eintrag aus dem Autostart des Benutzers (Registry „Run“), z. B. ein Programm, das bei jeder Anmeldung Fehler bringt.',
    param: { label: 'Name des Eintrags', platzhalter: 'wie in „Autostart-Programme anzeigen“', pflicht: true },
    ps: String.raw`
NeedHive
$k = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Run'
$runw = Get-ItemProperty $k -EA SilentlyContinue
$namen = @($runw.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $_.Name })
$t = @($namen | Where-Object { $_ -ieq $P.Trim() })
if (-not $t.Count) { throw ('Kein Autostart-Eintrag „' + $P + '“. Vorhanden: ' + ($namen -join ', ')) }
$wert = $runw.($t[0])
$sich = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Run-ITAdminTool-Sicherung'
if (-not (Test-Path $sich)) { New-Item -Path $sich -Force | Out-Null }
Set-ItemProperty -Path $sich -Name $t[0] -Value $wert
Remove-ItemProperty -Path $k -Name $t[0] -EA Stop
Zeile ('Autostart „' + $t[0] + '“ entfernt (war: ' + $wert + '). Sicherung unter Run-ITAdminTool-Sicherung.')` }),
  A({ id: 'energie-weckquellen', titel: 'Was weckt den PC auf?', modus: 'system', risiko: 'lesen',
    beschreibung: 'Letzte Weckquelle, geplante Weck-Timer und Geräte, die den PC aufwecken dürfen.',
    ps: String.raw`
Zeile '— Letzte Weckquelle —'; (& powercfg.exe /lastwake 2>&1 | Out-String) -split '\r?\n' | Where-Object { $_ -match '\S' } | Select-Object -First 8 | ForEach-Object { Zeile $_.Trim() }
Zeile '— Weck-Timer —'; (& powercfg.exe /waketimers 2>&1 | Out-String) -split '\r?\n' | Where-Object { $_ -match '\S' } | Select-Object -First 8 | ForEach-Object { Zeile $_.Trim() }
Zeile '— Geräte, die wecken dürfen —'; (& powercfg.exe /devicequery wake_armed 2>&1 | Out-String) -split '\r?\n' | Where-Object { $_ -match '\S' } | ForEach-Object { Zeile $_.Trim() }` }),
  A({ id: 'energie-anforderungen', titel: 'Was verhindert Standby/Bildschirm aus?', modus: 'system', risiko: 'lesen',
    beschreibung: 'Programme und Treiber, die gerade den Standby oder das Abschalten des Bildschirms verhindern.',
    ps: String.raw`(& powercfg.exe /requests 2>&1 | Out-String) -split '\r?\n' | Where-Object { $_ -match '\S' } | ForEach-Object { Zeile $_.Trim() }` }),
  A({ id: 'anzeige-modus', titel: 'Bildschirm-Modus umschalten (Erweitern/Duplizieren)', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Wie Windows+P: erweitern, duplizieren, nur PC-Bildschirm oder nur zweiter Bildschirm.',
    param: { label: 'Modus', platzhalter: 'Erweitern', pflicht: true, optionen: ['Erweitern', 'Duplizieren', 'Nur PC-Bildschirm', 'Nur zweiter Bildschirm'] },
    ps: String.raw`
$a = switch -Regex ($P) { '^erweit' { '/extend'; break } '^dupli' { '/clone'; break } '^nur pc' { '/internal'; break } '^nur zweit' { '/external'; break } default { throw ('Unbekannter Modus: ' + $P) } }
Start-Process -FilePath "$env:SystemRoot\System32\DisplaySwitch.exe" -ArgumentList $a
Zeile ('Anzeige-Modus: ' + $P + ' (' + $a + ').')` }),
  A({ id: 'windows-aktivierung', titel: 'Windows-Aktivierung prüfen und erneuern', modus: 'system', risiko: 'aendern', timeoutMs: 120000,
    beschreibung: 'Zeigt den Aktivierungsstatus und versucht die Aktivierung über den Firmen-Aktivierungsserver (KMS) bzw. digital.',
    ps: String.raw`
$p = Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f' AND PartialProductKey IS NOT NULL" -EA SilentlyContinue | Select-Object -First 1
$st = @{ 0 = 'nicht lizenziert'; 1 = 'aktiviert'; 2 = 'Kulanzzeit (OOB)'; 3 = 'Kulanzzeit (OOT)'; 4 = 'nicht echt'; 5 = 'Benachrichtigung'; 6 = 'erweiterte Kulanzzeit' }
if ($p) { Zeile ('Vorher: ' + $p.Name + ' · ' + $st[[int]$p.LicenseStatus]) }
& cscript.exe //nologo "$env:SystemRoot\System32\slmgr.vbs" /ato 2>&1 | Out-Null
$p = Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f' AND PartialProductKey IS NOT NULL" -EA SilentlyContinue | Select-Object -First 1
if ($p) { Zeile ('Jetzt: ' + $st[[int]$p.LicenseStatus] + $(if ($p.KeyManagementServiceMachine) { ' · KMS ' + $p.KeyManagementServiceMachine } else { '' })) } else { Zeile 'Kein Windows-Produktschlüssel gefunden.' }` }),
  A({ id: 'ol-klassisch', titel: 'Klassisches Outlook statt „neues Outlook“', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Schaltet den Benutzer auf das klassische Outlook zurück und blendet den Schalter „Neues Outlook“ aus (Add-ins wie enaio laufen nur im klassischen).',
    ps: String.raw`
NeedHive
$k1 = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Preferences'
if (-not (Test-Path $k1)) { New-Item -Path $k1 -Force | Out-Null }
Set-ItemProperty -Path $k1 -Name UseNewOutlook -Value 0 -Type DWord
$k2 = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Options\General'
if (-not (Test-Path $k2)) { New-Item -Path $k2 -Force | Out-Null }
Set-ItemProperty -Path $k2 -Name HideNewOutlookToggle -Value 1 -Type DWord
Zeile 'Klassisches Outlook eingestellt, Schalter „Neues Outlook“ ausgeblendet. Outlook neu starten.'` }),
  A({ id: 'ol-gruppenpostfach-online', titel: 'Gruppenpostfächer online statt im Cache', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Freigegebene Postfächer werden nicht mehr im Outlook-Cache gehalten (behebt hängende/fehlende Mails in Gruppenpostfächern, verkleinert die OST). Outlook neu starten.',
    ps: String.raw`
NeedHive
$k = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Cached Mode'
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
$alt = (Get-ItemProperty $k -Name CacheOthersMail -EA SilentlyContinue).CacheOthersMail
Set-ItemProperty -Path $k -Name CacheOthersMail -Value 0 -Type DWord
Zeile ('Gruppenpostfächer im Cache: ' + $(if ($alt -eq 0) { 'waren schon aus' } else { 'jetzt aus (online)' }) + '. Outlook neu starten.')` }),

  // Gemeinsam mit Remote Doc genutzte Benutzer-Bausteine (aktionenBenutzer.ts)
  ...BENUTZER_AKTIONEN,
  // Runde 3 (je Gruppe eine Datei in bausteine/)
  ...AKTIONEN_TEAMS, ...AKTIONEN_OUTLOOK, ...AKTIONEN_OFFICE, ...AKTIONEN_CLOUD, ...AKTIONEN_NETZ, ...AKTIONEN_ZUGANG, ...AKTIONEN_DRUCKER, ...AKTIONEN_PERIPHERIE, ...AKTIONEN_WINDOWS, ...AKTIONEN_KONTO,
  // Runde 4
  ...AKTIONEN_TMEET4, ...AKTIONEN_TCHAT4, ...AKTIONEN_OLMAIL4, ...AKTIONEN_OLORG4, ...AKTIONEN_EXCEL4, ...AKTIONEN_WORD4, ...AKTIONEN_CLOUD4, ...AKTIONEN_WEB4, ...AKTIONEN_NETZ4, ...AKTIONEN_WLAN4, ...AKTIONEN_LW4, ...AKTIONEN_DRUCK4, ...AKTIONEN_HW4, ...AKTIONEN_AV4, ...AKTIONEN_BILD4, ...AKTIONEN_WIN4, ...AKTIONEN_LEIST4, ...AKTIONEN_PROG4, ...AKTIONEN_KONTO4, ...AKTIONEN_SAPCAD4, ...AKTIONEN_TICKETS5,
]

const NACH_ID = new Map(AKTIONEN.map(a => [a.id, a]))
export const aktion = (id: string): PaAktion | undefined => NACH_ID.get(id)

/** Werkzeuge im Tool, auf die ein Problem verweisen kann („werkzeug:…“). */
export const WERKZEUGE: Record<string, { titel: string; beschreibung: string }> = {
  'netzdiagnose': { titel: 'WLAN-/Netzwerk-Diagnose öffnen', beschreibung: 'Tiefe Ursachen-Analyse mit Behebung (Kachel „Netzwerk Probleme“).' },
  'sap-fehlersuche': { titel: 'SAP Fehlersuche öffnen', beschreibung: 'Installation, Konfiguration, Kerberos/SNC, Landscape im Vergleich.' },
  'solidworks-diagnose': { titel: 'SolidWorks Diagnose öffnen', beschreibung: 'Bestandsaufnahme, Lizenzserver, empfohlene Einstellungen.' },
  'voll-diagnose': { titel: 'Voll-Diagnose starten', beschreibung: 'Alle Bereiche und Ereignisprotokolle prüfen.' },
  'ueberwachung': { titel: 'Überwachung über Zeit einrichten', beschreibung: 'Meldet, wenn der Fehler wiederkommt.' },
  'remote-doc': { titel: 'In Remote Doc öffnen', beschreibung: 'Alle Einzelbefehle für diesen PC.' },
  'treiber': { titel: 'Treiber-Installation (HP) öffnen', beschreibung: 'HP-Treiber/BIOS-Pakete prüfen und installieren.' },
  'software': { titel: 'Software-Installationen öffnen', beschreibung: 'Programme fern installieren (Enaio, FreeCAD, Jabra …).' },
  'deinstallation': { titel: 'Support Tools → Deinstallation öffnen', beschreibung: 'Programme sauber fern deinstallieren (mit Vorschau), z. B. NVIDIA RTX Desktop Manager.' },
  'drucker': { titel: 'Menü „Drucker“ öffnen', beschreibung: 'Drucker-Liste, Toner, Warnungen und Verbinden.' },
  'drucker-uebersicht': { titel: 'Drucker Übersicht (Lageplan) öffnen', beschreibung: 'Wo steht welcher Drucker?' },
}
