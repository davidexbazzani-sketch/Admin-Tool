// ── Problem-Assistent + Remote Doc: Bausteine im Kontext des ANGEMELDETEN Benutzers ──
// Von beiden genutzt (eigene kleine Datei, damit Remote Doc — schon beim Start geladen —
// nicht den ganzen Baustein-Katalog mitlädt). Regeln wie in aktionen.ts: Benutzerdaten nur
// über $uProf/$uLocal/$uRoam/$uHive (Art „profil“) bzw. in der Benutzersitzung (Art „benutzer“).

import type { PaAktion } from './motor'

const A = (a: PaAktion): PaAktion => a

export const BENUTZER_AKTIONEN: PaAktion[] = [
  A({ id: 'teams-cache', titel: 'Teams-Cache leeren', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet Teams und leert den Cache (neues + klassisches Teams). Chats/Dateien bleiben — sie liegen in der Cloud.',
    ps: String.raw`
NeedUser
StopUser @('ms-teams', 'Teams', 'msteamsupdate')
ClearDir (Join-Path $uLocal 'Packages\MSTeams_8wekyb3d8bbwe\LocalCache\Microsoft\MSTeams') 'Cache neues Teams'
$alt = Join-Path $uRoam 'Microsoft\Teams'
if (Test-Path -LiteralPath $alt) { foreach ($u in 'application cache', 'blob_storage', 'Cache', 'Code Cache', 'databases', 'GPUCache', 'IndexedDB', 'Local Storage', 'tmp') { ClearDir (Join-Path $alt $u) ('Klassisches Teams: ' + $u) } }` }),
  A({ id: 'ol-ost-neu', titel: 'Outlook-Postfachcache neu aufbauen (OST)', modus: 'profil', risiko: 'kritisch', timeoutMs: 90000,
    beschreibung: 'Beendet Outlook und benennt die OST-Dateien um — Outlook lädt das Postfach neu aus Exchange (dauert je nach Größe). Nicht bei PST-Archiven!',
    ps: String.raw`
NeedUser
StopUser @('OUTLOOK')
$d = Join-Path $uLocal 'Microsoft\Outlook'
$ost = @(Get-ChildItem -LiteralPath $d -Filter *.ost -EA SilentlyContinue)
if (-not $ost.Count) { Zeile 'Keine OST-Dateien gefunden.' }
foreach ($f in $ost) { $neu = $f.Name + '.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss'); Rename-Item -LiteralPath $f.FullName -NewName $neu -Force -EA Stop; Zeile ('' + $f.Name + ' (' + (Groesse $f.Length) + ') → ' + $neu) }
Zeile 'Beim nächsten Start lädt Outlook das Postfach neu. Alte Dateien nach ein paar Tagen löschbar.'` }),
  A({ id: 'ol-schalter', titel: 'Outlook mit Reparatur-Schalter starten', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Startet Outlook mit einem Reparaturschalter (Outlook muss vorher beendet sein).',
    param: { label: 'Schalter', platzhalter: '/resetnavpane', pflicht: true, optionen: ['/safe', '/resetnavpane', '/cleanviews', '/cleanreminders', '/resetsearchcriteria', '/cleanautocompletecache', '/resetfolders', '/resetfoldernames'] },
    ps: String.raw`
$s = $P.Trim().ToLower()
if ($s -notin '/safe', '/resetnavpane', '/cleanviews', '/cleanreminders', '/resetsearchcriteria', '/cleanautocompletecache', '/resetfolders', '/resetfoldernames') { throw ('Schalter nicht erlaubt: ' + $s) }
Get-Process OUTLOOK -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue; Start-Sleep -Seconds 2
Start-Process -FilePath 'outlook.exe' -ArgumentList $s
Zeile ('Outlook mit ' + $s + ' gestartet.')` }),
  A({ id: 'ol-starten', titel: 'Outlook starten', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Startet Outlook normal in der Sitzung des Benutzers.',
    ps: String.raw`if (Get-Process OUTLOOK -EA SilentlyContinue) { Zeile 'Outlook läuft bereits.' } else { Start-Process -FilePath 'outlook.exe'; Zeile 'Outlook gestartet.' }` }),
  A({ id: 'od-reset', titel: 'OneDrive zurücksetzen', modus: 'benutzer', risiko: 'kritisch', timeoutMs: 120000,
    beschreibung: 'Setzt die OneDrive-Synchronisierung zurück (alle Bibliotheken werden neu abgeglichen, Dateien bleiben). Dauert bei vielen Dateien lange.',
    ps: String.raw`
$exe = @((Join-Path $env:LOCALAPPDATA 'Microsoft\OneDrive\OneDrive.exe'), 'C:\Program Files\Microsoft OneDrive\OneDrive.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $exe) { throw 'OneDrive.exe nicht gefunden.' }
Start-Process -FilePath $exe -ArgumentList '/reset'; Zeile 'OneDrive wird zurückgesetzt …'
Start-Sleep -Seconds 25
if (-not (Get-Process OneDrive -EA SilentlyContinue)) { Start-Process -FilePath $exe; Zeile 'OneDrive neu gestartet.' } else { Zeile 'OneDrive läuft wieder.' }` }),
  A({ id: 'edge-cache', titel: 'Edge-Cache leeren', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet Edge und leert den Zwischenspeicher aller Edge-Profile. Anmeldungen, Favoriten und Kennwörter bleiben.',
    ps: String.raw`
NeedUser
StopUser @('msedge')
$ud = Join-Path $uLocal 'Microsoft\Edge\User Data'
foreach ($p in Get-ChildItem -LiteralPath $ud -Directory -EA SilentlyContinue | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' }) { foreach ($c in 'Cache', 'Code Cache', 'GPUCache', 'Service Worker\CacheStorage') { ClearDir (Join-Path $p.FullName $c) ('Edge ' + $p.Name + ' ' + $c) } }
ClearDir (Join-Path $ud 'ShaderCache') 'Edge ShaderCache'` }),
  A({ id: 'chrome-cache', titel: 'Chrome-Cache leeren', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet Chrome und leert den Zwischenspeicher aller Profile. Anmeldungen, Lesezeichen und Kennwörter bleiben.',
    ps: String.raw`
NeedUser
StopUser @('chrome')
$ud = Join-Path $uLocal 'Google\Chrome\User Data'
if (-not (Test-Path -LiteralPath $ud)) { Zeile 'Chrome ist für diesen Benutzer nicht eingerichtet.' }
foreach ($p in Get-ChildItem -LiteralPath $ud -Directory -EA SilentlyContinue | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' }) { foreach ($c in 'Cache', 'Code Cache', 'GPUCache', 'Service Worker\CacheStorage') { ClearDir (Join-Path $p.FullName $c) ('Chrome ' + $p.Name + ' ' + $c) } }` }),
  A({ id: 'sap-cache', titel: 'SAP-GUI-Cache zurücksetzen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Benennt den Cache der SAP GUI um (Darstellungsfehler, veraltete Bilder). Die Verbindungsliste bleibt unberührt.',
    ps: String.raw`
NeedUser
StopUser @('saplogon', 'sapgui', 'saplgpad', 'NWBC')
foreach ($p in (Join-Path $uRoam 'SAP\SAP GUI\Cache'), (Join-Path $uLocal 'SAP\SAP GUI\Cache'), (Join-Path $uLocal 'SAP\NWBC\Cache')) { [void](RenameAlt $p ('Cache ' + (Split-Path (Split-Path $p -Parent) -Leaf))) }
Zeile 'Die Verbindungsliste (SAPUILandscape.xml) wurde nicht angefasst.'` }),
  A({ id: 'papierkorb-leeren', titel: 'Papierkorb des Benutzers leeren', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Leert den Papierkorb des angemeldeten Benutzers (endgültig!).',
    ps: String.raw`
NeedUser
if (-not $uSid) { throw 'SID des Benutzers unbekannt.' }
foreach ($lw in Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3') { ClearDir ($lw.DeviceID + '\$Recycle.Bin\' + $uSid) ('Papierkorb ' + $lw.DeviceID) }` }),
  A({ id: 'explorer-neustart', titel: 'Explorer neu starten (Taskleiste/Desktop)', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Startet Taskleiste, Desktop und Explorer-Fenster neu. Offene Ordnerfenster schließen sich.',
    ps: String.raw`
Get-Process explorer -EA SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 3
if (-not (Get-Process explorer -EA SilentlyContinue)) { Start-Process explorer.exe }
Zeile 'Explorer neu gestartet.'` }),
  A({ id: 'symbolcache', titel: 'Symbol- und Miniaturansichten-Cache erneuern', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Falsche/leere Symbole und Vorschaubilder: Cache wird gelöscht und der Explorer neu gestartet.',
    ps: String.raw`
NeedUser
$d = Join-Path $uLocal 'Microsoft\Windows\Explorer'
foreach ($x in UserProcs @('explorer')) { Stop-Process -Id $x.Id -Force -EA SilentlyContinue }
$f = @(Get-ChildItem -LiteralPath $d -Filter '*cache_*.db' -Force -EA SilentlyContinue)
$f | Remove-Item -Force -EA SilentlyContinue
Start-Sleep -Seconds 3
if (-not (UserProcs @('explorer')).Count) { Zeile 'Explorer startet nicht von selbst — bitte „Explorer neu starten“.' }
Remove-Item -LiteralPath (Join-Path $uLocal 'IconCache.db') -Force -EA SilentlyContinue
Zeile ('' + $f.Count + ' Cache-Dateien gelöscht. Explorer startet automatisch neu.')` }),
  A({ id: 'kerberos-anzeigen', titel: 'Kerberos-Tickets des Benutzers anzeigen', modus: 'benutzer', risiko: 'lesen',
    beschreibung: 'Welche Anmeldetickets der Benutzer hat (SSO, SAP-SNC, Freigaben).',
    ps: String.raw`$o = (& klist.exe 2>&1 | Out-String); $n = ([regex]::Matches($o, '#\d+>')).Count; Zeile ('' + $n + ' Tickets'); ($o -split '\r?\n' | Where-Object { $_ -match 'Server:|Endzeit|End Time' } | Select-Object -First 24) | ForEach-Object { Zeile $_.Trim() }` }),
  A({ id: 'kerberos-erneuern', titel: 'Kerberos-Tickets des Benutzers erneuern', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Löscht die Anmeldetickets des Benutzers — Windows holt sofort neue (nach Gruppenänderung, SSO-/SAP-Fehlern).',
    ps: String.raw`& klist.exe purge 2>&1 | Out-Null; Zeile 'Kerberos-Tickets gelöscht — neue werden beim nächsten Zugriff automatisch geholt.'; & gpupdate.exe /target:user /force 2>&1 | Out-Null; Zeile 'Benutzerrichtlinie neu angewendet.'` }),
  A({ id: 'zertifikate', titel: 'Zertifikate prüfen (abgelaufen/bald fällig)', modus: 'benutzer', risiko: 'lesen',
    beschreibung: 'Persönliche Zertifikate des Benutzers (WLAN/VPN/Signatur) mit Ablaufdatum.',
    ps: String.raw`
foreach ($c in Get-ChildItem Cert:\CurrentUser\My -EA SilentlyContinue | Sort-Object NotAfter) { $t = ($c.NotAfter - (Get-Date)).Days; Zeile ('' + $c.Subject + ' · gültig bis ' + $c.NotAfter.ToString('dd.MM.yyyy') + $(if ($t -lt 0) { ' · ABGELAUFEN' } elseif ($t -lt 30) { ' · läuft in ' + $t + ' Tagen ab' } else { '' })) }` }),
  // ── Varianten für Remote Doc (gleiche Regeln: Benutzerprofil/-sitzung statt Admin-Profil) ──
  A({ id: 'rd-usertemp', titel: 'Temp-Ordner des Benutzers leeren', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Leert den Temp-Ordner des angemeldeten Benutzers (in Benutzung befindliche Dateien bleiben).',
    ps: String.raw`NeedUser; ClearDir (Join-Path $uLocal 'Temp') 'Temp des Benutzers'` }),
  A({ id: 'rd-credclear', titel: 'Anmeldeinformationsverwaltung bereinigen', modus: 'benutzer', risiko: 'kritisch',
    beschreibung: 'Löscht gespeicherte Anmeldungen des Benutzers (Office, Teams, SharePoint, VPN oder alle). Der Benutzer meldet sich danach neu an.',
    param: { label: 'Welche', platzhalter: 'Alles', pflicht: true, optionen: ['Office', 'Teams', 'SharePoint', 'VPN', 'Alles'] },
    ps: String.raw`
$muster = switch -Regex ($P) { '^office' { 'MicrosoftOffice|microsoftoffice1[56]|OneAuth'; break } '^teams' { 'msteams|teams'; break } '^sharepoint' { 'sharepoint|onedrive|microsoftonline'; break } '^vpn' { 'vpn|anyconnect|cisco|forti|globalprotect|zscaler'; break } '^alles' { '.'; break } default { throw ('Unbekannte Auswahl: ' + $P) } }
$z = @(((& cmdkey.exe /list 2>&1 | Out-String) -split '\r?\n') | Where-Object { $_ -match '(Ziel|Target):' } | ForEach-Object { ($_ -replace '^.*?(Ziel|Target):\s*', '').Trim() } | Where-Object { $_ -match $muster })
if (-not $z.Count) { Zeile 'Keine passenden Anmeldungen gespeichert.' }
foreach ($t in $z) { & cmdkey.exe ('/delete:' + $t) 2>&1 | Out-Null; Zeile ('Gelöscht: ' + ($t -replace '^.*?target=', '')) }
Zeile ('' + $z.Count + ' Anmeldung(en) gelöscht (Auswahl: ' + $P + ').')` }),
  A({ id: 'rd-auth-system', titel: 'Auth-Reset (Computer)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Computer-Kerberos-Tickets erneuern, DNS-Cache leeren, Computerrichtlinie neu anwenden.',
    ps: String.raw`
& klist.exe -li 0x3e7 purge 2>&1 | Out-Null; Zeile 'Kerberos-Tickets des Computers gelöscht.'
Clear-DnsClientCache; Zeile 'DNS-Cache geleert.'
& gpupdate.exe /target:computer /force 2>&1 | Out-Null; Zeile 'Computerrichtlinie neu angewendet.'` }),
  A({ id: 'rd-auth-benutzer', titel: 'Auth-Reset (Benutzer)', modus: 'benutzer', risiko: 'kritisch',
    beschreibung: 'In der Sitzung des Benutzers: Kerberos-Tickets erneuern, ALLE gespeicherten Anmeldungen löschen, Benutzerrichtlinie neu anwenden.',
    ps: String.raw`
& klist.exe purge 2>&1 | Out-Null; Zeile 'Kerberos-Tickets des Benutzers gelöscht.'
$z = @(((& cmdkey.exe /list 2>&1 | Out-String) -split '\r?\n') | Where-Object { $_ -match '(Ziel|Target):' } | ForEach-Object { ($_ -replace '^.*?(Ziel|Target):\s*', '').Trim() })
foreach ($t in $z) { & cmdkey.exe ('/delete:' + $t) 2>&1 | Out-Null }
Zeile ('' + $z.Count + ' gespeicherte Anmeldung(en) gelöscht.')
& gpupdate.exe /target:user /force 2>&1 | Out-Null; Zeile 'Benutzerrichtlinie neu angewendet.'` }),
  A({ id: 'rd-wincache', titel: 'Windows-Komplett-Cache leeren', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Temp des Benutzers und von Windows, Miniaturansichten-Cache, Prefetch und DNS-Cache leeren.',
    ps: String.raw`
NeedUser
ClearDir (Join-Path $uLocal 'Temp') 'Temp des Benutzers'
ClearDir 'C:\Windows\Temp' 'Windows-Temp'
$f = @(Get-ChildItem -LiteralPath (Join-Path $uLocal 'Microsoft\Windows\Explorer') -Filter 'thumbcache_*.db' -Force -EA SilentlyContinue)
$weg = 0; foreach ($x in $f) { try { Remove-Item -LiteralPath $x.FullName -Force -EA Stop; $weg++ } catch {} }
Zeile ('Miniaturansichten-Cache: ' + $weg + ' von ' + $f.Count + ' Dateien entfernt (der Rest ist vom Explorer in Benutzung).')
$p = @(Get-ChildItem 'C:\Windows\Prefetch' -File -EA SilentlyContinue); $p | Remove-Item -Force -EA SilentlyContinue; Zeile ('Prefetch: ' + $p.Count + ' Dateien entfernt.')
Clear-DnsClientCache; Zeile 'DNS-Cache geleert.'` }),
  A({ id: 'rd-megacleanup', titel: 'MEGA-Cleanup (Benutzer)', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Beendet Teams, Chrome und Edge des Benutzers und leert deren Caches, den SAP-GUI-Cache (Verbindungsliste bleibt!), Temp, Windows-Temp, Prefetch und DNS.',
    ps: String.raw`
NeedUser
StopUser @('ms-teams', 'Teams', 'chrome', 'msedge')
ClearDir (Join-Path $uLocal 'Packages\MSTeams_8wekyb3d8bbwe\LocalCache\Microsoft\MSTeams') 'Cache neues Teams'
$alt = Join-Path $uRoam 'Microsoft\Teams'
if (Test-Path -LiteralPath $alt) { foreach ($u in 'Cache', 'Code Cache', 'GPUCache', 'blob_storage', 'IndexedDB', 'Local Storage', 'tmp') { ClearDir (Join-Path $alt $u) ('Klassisches Teams: ' + $u) } }
foreach ($b in @(@('Chrome', 'Google\Chrome\User Data'), @('Edge', 'Microsoft\Edge\User Data'))) {
  foreach ($pr in Get-ChildItem -LiteralPath (Join-Path $uLocal $b[1]) -Directory -EA SilentlyContinue | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' }) { foreach ($c in 'Cache', 'Code Cache', 'GPUCache') { ClearDir (Join-Path $pr.FullName $c) ($b[0] + ' ' + $pr.Name + ' ' + $c) } }
}
foreach ($sc in (Join-Path $uRoam 'SAP\SAP GUI\Cache'), (Join-Path $uLocal 'SAP\SAP GUI\Cache')) { [void](RenameAlt $sc 'SAP-GUI-Cache') }
ClearDir (Join-Path $uLocal 'Temp') 'Temp des Benutzers'
ClearDir 'C:\Windows\Temp' 'Windows-Temp'
$p = @(Get-ChildItem 'C:\Windows\Prefetch' -File -EA SilentlyContinue); $p | Remove-Item -Force -EA SilentlyContinue; Zeile ('Prefetch: ' + $p.Count + ' Dateien entfernt.')
Clear-DnsClientCache; Zeile 'DNS-Cache geleert. Die SAP-Verbindungsliste (SAPUILandscape.xml) wurde nicht angefasst.'` }),
  A({ id: 'rd-zsc-cache', titel: 'Zscaler-Cache leeren + Dienst neu starten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Stoppt den Zscaler-Dienst, leert den Zscaler-Ordner des Benutzers und startet den Dienst wieder.',
    ps: String.raw`
NeedUser
$sv = @('ZSAService', 'ZscalerService') | Where-Object { Get-Service -Name $_ -EA SilentlyContinue } | Select-Object -First 1
if (-not $sv) { throw 'Zscaler ist nicht installiert.' }
Stop-Service -Name $sv -Force -EA SilentlyContinue; Start-Sleep -Seconds 2
ClearDir (Join-Path $uLocal 'Zscaler') 'Zscaler-Cache des Benutzers'
Start-Service -Name $sv -EA Stop
Zeile ('Dienst ' + $sv + ': ' + (Get-Service -Name $sv).Status)` }),
  A({ id: 'rd-zsc-logs', titel: 'Zscaler-Protokolle anzeigen', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Die letzten Zeilen der neuesten Zscaler-Protokolle (Benutzer und System).',
    ps: String.raw`
$orte = @(); if ($uProf) { $orte += (Join-Path $uLocal 'Zscaler\logs') }; $orte += 'C:\ProgramData\Zscaler\log', 'C:\ProgramData\Zscaler\logs'
$gefunden = $false
foreach ($o in $orte) {
  if (-not (Test-Path -LiteralPath $o)) { continue }
  foreach ($l in Get-ChildItem -LiteralPath $o -File -EA SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 3) {
    $gefunden = $true
    Zeile ('=== ' + $l.FullName + ' (' + $l.LastWriteTime.ToString('dd.MM. HH:mm') + ') ===')
    Get-Content -LiteralPath $l.FullName -Tail 25 -EA SilentlyContinue | ForEach-Object { Zeile ([string]$_) }
  }
}
if (-not $gefunden) { Zeile 'Kein Zscaler-Protokoll gefunden.' }` }),
  A({ id: 'rd-enaio-cache', titel: 'enaio-Cache leeren (Outlook wird beendet)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet Outlook des Benutzers und leert die enaio-Caches in seinem Profil.',
    ps: String.raw`
NeedUser
StopUser @('OUTLOOK')
ClearDir (Join-Path $uLocal 'enaio') 'enaio (lokal)'
ClearDir (Join-Path $uRoam 'enaio') 'enaio (servergespeichert)'` }),
  A({ id: 'rd-storereset', titel: 'Microsoft Store zurücksetzen', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Setzt den Store-Cache des Benutzers zurück (wsreset); danach öffnet sich der Store.',
    ps: String.raw`Start-Process -FilePath 'wsreset.exe'; Zeile 'Store-Reset gestartet — der Store öffnet sich danach von selbst.'` }),
  A({ id: 'rd-standardapps', titel: 'Einstellungen „Standard-Apps“ öffnen', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Öffnet beim Benutzer die Windows-Einstellungen für Standard-Apps.',
    ps: String.raw`Start-Process 'ms-settings:defaultapps'; Zeile 'Standard-Apps-Einstellungen beim Benutzer geöffnet.'` }),
]

const NACH_ID = new Map(BENUTZER_AKTIONEN.map(a => [a.id, a]))
export const benutzerAktion = (id: string): PaAktion | undefined => NACH_ID.get(id)
