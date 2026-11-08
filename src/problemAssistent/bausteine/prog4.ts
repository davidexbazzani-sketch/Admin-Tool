// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „prog“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Bereich: Weitere Programme — Acrobat/Reader, Java, Remotedesktop-Client, Dateizuordnungen, Fachanwendungen.
// Benutzereinstellungen werden nur im Profil bzw. Registry-Zweig des angemeldeten Benutzers geändert
// ($uProf/$uLocal/$uHive), jeweils mit Sicherung (*.alt_… bzw. Software\ITAdminTool\Sicherung).
// Firmenvorgaben (Adobe FeatureLockDown, Java *.locked, Standardzuordnungs-Richtlinie) werden nur gelesen und gemeldet.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

export const AKTIONEN_PROG4: PaAktion[] = [
  // ══ Adobe Acrobat / Reader ═══════════════════════════════════════════════════
  A({ id: 'prog4-acrobat-option', titel: 'Acrobat-/Reader-Einstellung des Benutzers setzen (JavaScript, Speichern-Dialog, Fenster, Adobe-Anmeldung)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet Acrobat/Reader des Benutzers (sonst überschreibt es die Einstellung beim Schließen) und setzt in seinem Registry-Zweig: JavaScript einschalten (Formulare rechnen, Knöpfe reagieren), Onlinespeicher beim Öffnen/Speichern aus (normaler Windows-Dialog statt Adobe-Cloud), jede PDF in eigenem Fenster bzw. wieder Registerkarten. „Adobe-Anmeldung zurücksetzen (OOBE)“ benennt den Anmelde- und Lizenzspeicher von Adobe um (*.alt_…) – danach meldet sich der Benutzer neu mit dem Firmenkonto an. Zeigt alt → neu und meldet Firmenvorgaben (FeatureLockDown).',
    param: { label: 'Einstellung', platzhalter: 'JavaScript einschalten', pflicht: true, optionen: ['JavaScript einschalten', 'Onlinespeicher beim Öffnen/Speichern aus', 'Jede PDF in eigenem Fenster', 'PDFs in Registerkarten (Standard)', 'Adobe-Anmeldung zurücksetzen (OOBE)'] },
    ps: String.raw`
NeedHive
$opt = @('JavaScript einschalten', 'Onlinespeicher beim Öffnen/Speichern aus', 'Jede PDF in eigenem Fenster', 'PDFs in Registerkarten (Standard)', 'Adobe-Anmeldung zurücksetzen (OOBE)')
$wahl = @($opt | Where-Object { $_ -ieq $P.Trim() }) | Select-Object -First 1
if (-not $wahl) { throw ('Einstellung nicht erlaubt: ' + $P) }
$prod = @()
foreach ($pr in 'Adobe Acrobat', 'Acrobat Reader') {
  if ((Test-Path ($uHive + '\Software\Adobe\' + $pr + '\DC')) -or (Test-Path ('HKLM:\SOFTWARE\Adobe\' + $pr + '\DC')) -or (Test-Path ('HKLM:\SOFTWARE\WOW6432Node\Adobe\' + $pr + '\DC'))) { $prod += $pr }
}
if (-not $prod.Count) { throw 'Adobe Acrobat bzw. Acrobat Reader (DC) ist nicht installiert.' }
Zeile ('Gefunden: ' + ($prod -join ', ') + ' — Einstellung: ' + $wahl)
$namen = @('Acrobat', 'AcroRd32', 'AcroCEF', 'RdrCEF', 'AdobeCollabSync')
if ($wahl -like 'Adobe-Anmeldung*') { $namen += @('AdobeIPCBroker', 'Adobe Desktop Service', 'Creative Cloud', 'CCXProcess', 'CCLibrary', 'CoreSync', 'AdobeNotificationClient') }
StopUser $namen
function AcroSetz([string]$pr, [string]$sub, [string]$name, [int]$wert) {
  $k = $uHive + '\Software\Adobe\' + $pr + '\DC\' + $sub
  if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
  $alt = (Get-ItemProperty -Path $k -Name $name -EA SilentlyContinue).$name
  Set-ItemProperty -Path $k -Name $name -Value $wert -Type DWord
  Zeile ($pr + ' › ' + $sub + '\' + $name + ': ' + $(if ($null -eq $alt) { '(nicht gesetzt)' } else { [string]$alt }) + ' → ' + $wert)
}
switch ($wahl) {
  'JavaScript einschalten' { foreach ($pr in $prod) { AcroSetz $pr 'JSPrefs' 'bEnableJS' 1 } }
  'Onlinespeicher beim Öffnen/Speichern aus' { foreach ($pr in $prod) { AcroSetz $pr 'AVGeneral' 'bToggleCustomOpenExperience' 1; AcroSetz $pr 'AVGeneral' 'bToggleCustomSaveExperience' 1 }; Zeile 'Zeigt Acrobat trotzdem noch den Adobe-Cloud-Dialog: Bearbeiten → Voreinstellungen → Allgemein → Haken „Beim Speichern/Öffnen von Dateien Onlinespeicher anzeigen“ entfernen.' }
  'Jede PDF in eigenem Fenster' { foreach ($pr in $prod) { AcroSetz $pr 'AVGeneral' 'bSDIMode' 1 }; Zeile 'Jede PDF öffnet jetzt in einem eigenen Fenster (nebeneinander auf zwei Bildschirmen möglich).' }
  'PDFs in Registerkarten (Standard)' { foreach ($pr in $prod) { AcroSetz $pr 'AVGeneral' 'bSDIMode' 0 } }
  default {
    $oobe = Join-Path $uLocal 'Adobe\OOBE'
    if (RenameAlt $oobe 'Adobe-Anmelde- und Lizenzspeicher (OOBE)') { Zeile 'Beim nächsten Start von Acrobat mit dem Firmenkonto (eigene E-Mail-Adresse, „Unternehmens- oder Schulkonto“) anmelden — nicht mit einer privaten Adobe-ID.' }
  }
}
foreach ($pr in $prod) {
  foreach ($b in 'HKLM:\SOFTWARE\Policies\Adobe\', 'HKLM:\SOFTWARE\WOW6432Node\Policies\Adobe\') {
    $fl = Get-ItemProperty ($b + $pr + '\DC\FeatureLockDown') -EA SilentlyContinue
    if (-not $fl) { continue }
    if ($wahl -eq 'JavaScript einschalten' -and [int]$fl.bDisableJavaScript -eq 1) { Zeile ('Achtung: JavaScript ist für ' + $pr + ' per Firmenvorgabe gesperrt (FeatureLockDown\bDisableJavaScript = 1) — die Einstellung wirkt dann nicht, Freigabe über die IT.') }
    if ($wahl -like 'Adobe-Anmeldung*' -and [int]$fl.bIsSCReducedModeEnforcedEx -eq 1) { Zeile ('Hinweis: ' + $pr + ' ist per Firmenvorgabe auf den Reader-Modus festgelegt (bIsSCReducedModeEnforcedEx).') }
  }
}
Zeile 'Acrobat/Reader jetzt wieder öffnen.'` }),

  // ══ Java (Oracle) ════════════════════════════════════════════════════════════
  A({ id: 'prog4-java-einstellung', titel: 'Java-Einstellung des Benutzers setzen (Ablaufwarnung, Konsole, Sicherheitsstufe, Proxy, Ausnahmeliste)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Ändert die Einstellungen der Systemsteuerung „Java“ (Oracle Java) des angemeldeten Benutzers in seiner deployment.properties bzw. trägt eine interne Adresse in seine Ausnahmeliste (exception.sites) ein: Ablaufwarnung „Java-Version ist veraltet“ aus, Java-Konsole und Protokolle ein/aus (für den Hersteller), Sicherheitsstufe zurück auf „Hoch“ (Standard), Proxy wie Browser. „Ausnahme: https://adresse:port“ nimmt nur interne Adressen (Servername, *.skf.net/*.skf.com, private IP) – genau mit Protokoll und Port wie im Browser. Die Datei wird vorher gesichert; Firmenvorgaben (*.locked) werden gemeldet. Wirkt beim nächsten Start der Java-Anwendung.',
    param: { label: 'Einstellung bzw. „Ausnahme: Adresse“', platzhalter: 'Ablaufwarnung aus', pflicht: true, vorlagen: ['Ablaufwarnung aus', 'Konsole und Protokolle ein', 'Konsole und Protokolle aus', 'Sicherheitsstufe hoch (Standard)', 'Proxy wie Browser', 'Ausnahme: https://maschine01.corp.skf.net:8443'] },
    ps: String.raw`
NeedUser
$jw = $P.Trim()
$set = $null; $url = $null
$mA = [regex]::Match($jw, '^(?i)ausnahme\s*:\s*(\S+)$')
if ($mA.Success) { $url = $mA.Groups[1].Value.TrimEnd('/') }
elseif ($jw -ieq 'Ablaufwarnung aus') { $set = [ordered]@{ 'deployment.expiration.check.enabled' = 'false' } }
elseif ($jw -ieq 'Konsole und Protokolle ein') { $set = [ordered]@{ 'deployment.console.startup.mode' = 'SHOW'; 'deployment.trace' = 'true'; 'deployment.log' = 'true' } }
elseif ($jw -ieq 'Konsole und Protokolle aus') { $set = [ordered]@{ 'deployment.console.startup.mode' = 'HIDE'; 'deployment.trace' = 'false'; 'deployment.log' = 'false' } }
elseif ($jw -ieq 'Sicherheitsstufe hoch (Standard)') { $set = [ordered]@{ 'deployment.security.level' = 'HIGH' } }
elseif ($jw -ieq 'Proxy wie Browser') { $set = [ordered]@{ 'deployment.proxy.type' = '3' } }
else { throw ('Unbekannte Einstellung „' + $P + '“ — erlaubt: Ablaufwarnung aus, Konsole und Protokolle ein, Konsole und Protokolle aus, Sicherheitsstufe hoch (Standard), Proxy wie Browser, Ausnahme: https://adresse:port') }
$jv = @(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { [string]$_.DisplayName -match '^Java' -and [string]$_.Publisher -match 'Oracle' } | ForEach-Object { ([string]$_.DisplayName + ' ' + [string]$_.DisplayVersion).Trim() } | Sort-Object -Unique)
$dep = Join-Path $uProf 'AppData\LocalLow\Sun\Java\Deployment'
if (-not $jv.Count -and -not (Test-Path -LiteralPath $dep)) { throw 'Oracle Java ist auf diesem PC nicht installiert (OpenWebStart hat eigene Einstellungen: Startmenü → „OpenWebStart Settings“).' }
Zeile ('Java: ' + $(if ($jv.Count) { $jv -join ' · ' } else { 'kein Oracle-Java in der Softwareliste, nur Benutzereinstellungen vorhanden' }))
if (-not (Test-Path -LiteralPath $dep)) { New-Item -ItemType Directory -Path $dep -Force | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$lauf = @(UserProcs @('javaw', 'javaws', 'jp2launcher', 'java'))
if ($lauf.Count) { Zeile ('Java läuft gerade (' + ((@($lauf | ForEach-Object { $_.ProcessName }) | Select-Object -Unique) -join ', ') + ') — die Änderung wirkt beim nächsten Start der Java-Anwendung.') }
$sysText = ''
$cfg = 'C:\Windows\Sun\Java\Deployment\deployment.config'
$sysDateien = @('C:\Windows\Sun\Java\Deployment\deployment.properties')
if (Test-Path -LiteralPath $cfg) {
  $mc = [regex]::Match([IO.File]::ReadAllText($cfg), '(?im)^\s*deployment\.system\.config\s*=\s*file:/*([^\r\n]+)')
  if ($mc.Success) { $sysDateien += (($mc.Groups[1].Value -replace '\\:', ':') -replace '/', '\').Trim() }
}
foreach ($sd in $sysDateien) { if (Test-Path -LiteralPath $sd) { try { $sysText += [IO.File]::ReadAllText($sd) + [Environment]::NewLine; Zeile ('Firmenvorgabe gelesen: ' + $sd) } catch {} } }
if ($set) {
  $f = Join-Path $dep 'deployment.properties'
  $enc = [Text.Encoding]::GetEncoding(28591)
  $zeilen = New-Object System.Collections.Generic.List[string]
  if (Test-Path -LiteralPath $f) { foreach ($l in [IO.File]::ReadAllLines($f, $enc)) { [void]$zeilen.Add($l) }; Copy-Item -LiteralPath $f -Destination ($f + '.alt_' + $stamp) -Force }
  foreach ($key in @($set.Keys)) {
    $neu = [string]$set[$key]
    $rx = '^\s*' + [regex]::Escape($key) + '\s*[=:]'
    $alt = $null; $idx = -1
    for ($i = 0; $i -lt $zeilen.Count; $i++) { if ($zeilen[$i] -match $rx) { $idx = $i; $alt = ($zeilen[$i] -replace ($rx + '\s*'), '') } }
    if ($idx -ge 0) { $zeilen[$idx] = $key + '=' + $neu } else { [void]$zeilen.Add($key + '=' + $neu) }
    Zeile ($key + ': ' + $(if ($null -ne $alt) { $alt } else { '(Standard)' }) + ' → ' + $neu)
    if ($sysText -match ('(?im)^\s*' + [regex]::Escape($key) + '\.locked')) { Zeile ('Achtung: ' + $key + ' ist per Firmenvorgabe gesperrt (.locked) — der Wert der Firma gilt weiter.') }
  }
  [IO.File]::WriteAllLines($f, $zeilen.ToArray(), $enc)
  Zeile ('Gespeichert in ' + $f + ' (Sicherung: deployment.properties.alt_' + $stamp + ')')
  if ($jw -ieq 'Konsole und Protokolle ein') { Zeile ('Protokolle entstehen beim nächsten Start unter ' + (Join-Path $dep 'log') + ' — danach für den Hersteller einsammeln und die Konsole wieder ausschalten.') }
} else {
  $m = [regex]::Match($url, '^(?i)(https?)://([a-z0-9][a-z0-9.-]*)(:\d{1,5})?(/\S*)?$')
  if (-not $m.Success) { throw ('Adresse bitte vollständig mit http:// oder https:// angeben, z. B. https://maschine01:8443 — erhalten: ' + $url) }
  $h = $m.Groups[2].Value.ToLower()
  $intern = ($h -notmatch '\.') -or ($h -match '\.skf\.(net|com)$') -or ($h -match '^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$') -or ($h -match '^192\.168\.\d{1,3}\.\d{1,3}$') -or ($h -match '^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$')
  if (-not $intern) { throw ('Nur interne Adressen (Servername, *.skf.net, *.skf.com oder private IP) — „' + $h + '“ muss die IT-Sicherheit freigeben.') }
  $sdir = Join-Path $dep 'security'
  if (-not (Test-Path -LiteralPath $sdir)) { New-Item -ItemType Directory -Path $sdir -Force | Out-Null }
  $f = Join-Path $sdir 'exception.sites'
  $liste = @()
  if (Test-Path -LiteralPath $f) { $liste = @([IO.File]::ReadAllLines($f) | Where-Object { $_.Trim() }); Copy-Item -LiteralPath $f -Destination ($f + '.alt_' + $stamp) -Force }
  Zeile ('Ausnahmeliste vorher (' + $liste.Count + '): ' + $(if ($liste.Count) { (@($liste | Select-Object -First 12)) -join ' · ' } else { 'leer' }))
  if (@($liste | Where-Object { $_.Trim().TrimEnd('/') -ieq $url }).Count) { Zeile ($url + ' steht bereits genau so in der Ausnahmeliste — Protokoll (http/https) und Port mit der Adresszeile des Browsers vergleichen.') }
  else {
    $liste += $url
    [IO.File]::WriteAllLines($f, [string[]]$liste, (New-Object System.Text.UTF8Encoding($false)))
    Zeile ('Eingetragen: ' + $url + ' — jetzt ' + $liste.Count + ' Einträge.')
  }
  if ($sysText -match '(?im)^\s*deployment\.user\.security\.exception\.sites') { Zeile 'Achtung: Die Firma gibt einen eigenen Ort für die Ausnahmeliste vor — dort muss die Adresse zusätzlich eingetragen werden (IT).' }
}
Zeile 'Java-Anwendung bzw. Browserseite jetzt neu starten.'` }),

  // ══ Remotedesktop-Client (mstsc) ═════════════════════════════════════════════
  A({ id: 'prog4-rdp-standard', titel: 'Remotedesktop-Standardeinstellung setzen (Laufwerke, Tastenkombinationen, Verbindungsleiste, Bildschirme)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Ändert die versteckte Datei Default.rdp im Dokumente-Ordner des Benutzers – daraus übernimmt „Remotedesktopverbindung“ (mstsc) beim Start alle Einstellungen: lokale Laufwerke in die Sitzung mitnehmen (auch zum Kopieren von Dateien), Windows-Tastenkombinationen (Alt+Tab, Windows-Taste) in der Sitzung, Verbindungsleiste im Vollbild anzeigen, nur einen bzw. alle Bildschirme verwenden, Zwischenablage ein. Die Datei wird vorher gesichert; eigene gespeicherte .rdp-Dateien bleiben unverändert. Wirkt beim nächsten Öffnen von Remotedesktop.',
    param: { label: 'Einstellung', platzhalter: 'Laufwerke verbinden', pflicht: true, optionen: ['Laufwerke verbinden', 'Windows-Tastenkombinationen in der Sitzung', 'Verbindungsleiste anzeigen', 'Nur ein Bildschirm', 'Alle Bildschirme verwenden', 'Zwischenablage ein'] },
    ps: String.raw`
NeedHive
$karte = [ordered]@{
  'Laufwerke verbinden' = @('drivestoredirect:s:*', 'redirectdrives:i:1')
  'Windows-Tastenkombinationen in der Sitzung' = @('keyboardhook:i:1')
  'Verbindungsleiste anzeigen' = @('displayconnectionbar:i:1', 'pinconnectionbar:i:1')
  'Nur ein Bildschirm' = @('use multimon:i:0')
  'Alle Bildschirme verwenden' = @('use multimon:i:1', 'screen mode id:i:2')
  'Zwischenablage ein' = @('redirectclipboard:i:1')
}
$wahl = @($karte.Keys | Where-Object { $_ -ieq $P.Trim() }) | Select-Object -First 1
if (-not $wahl) { throw ('Einstellung nicht erlaubt: ' + $P) }
$usf = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders'
$roh = $null
try { $roh = [string](Get-Item -Path $usf -EA Stop).GetValue('Personal', $null, 'DoNotExpandEnvironmentNames') } catch {}
if (-not $roh) { $roh = '%USERPROFILE%\Documents' }
$doc = [regex]::Replace($roh, '%USERPROFILE%', $uProf.Replace('$', '$$'), 'IgnoreCase')
if ($doc -match '%' -or -not (Test-Path -LiteralPath $doc)) { Zeile ('Dokumente-Ordner laut Registry „' + $roh + '“ nicht auffindbar — nehme ' + (Join-Path $uProf 'Documents')); $doc = Join-Path $uProf 'Documents' }
if (-not (Test-Path -LiteralPath $doc)) { throw ('Dokumente-Ordner nicht gefunden: ' + $doc) }
$f = Join-Path $doc 'Default.rdp'
$zeilen = New-Object System.Collections.Generic.List[string]
$attr = [IO.FileAttributes]::Hidden
if (Test-Path -LiteralPath $f) {
  foreach ($l in ([IO.File]::ReadAllText($f) -split '\r?\n')) { if ($l.Trim()) { [void]$zeilen.Add($l) } }
  Copy-Item -LiteralPath $f -Destination ($f + '.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss')) -Force
  $fi = Get-Item -LiteralPath $f -Force; $attr = $fi.Attributes; $fi.Attributes = [IO.FileAttributes]::Normal
  Zeile ('Default.rdp: ' + $f + ' (' + $zeilen.Count + ' Einstellungen, gesichert als *.alt_…)')
} else { Zeile ('Default.rdp fehlt in ' + $doc + ' — wird mit dieser Einstellung neu angelegt.') }
foreach ($neu in $karte[$wahl]) {
  $key = ($neu -split ':')[0]
  $rx = '^\s*' + [regex]::Escape($key) + ':'
  $idx = -1
  for ($i = 0; $i -lt $zeilen.Count; $i++) { if ($zeilen[$i] -match $rx) { $idx = $i } }
  $alt = $(if ($idx -ge 0) { $zeilen[$idx] } else { '(nicht gesetzt)' })
  if ($idx -ge 0) { $zeilen[$idx] = $neu } else { [void]$zeilen.Add($neu) }
  Zeile ($key + ': ' + $alt + ' → ' + $neu)
}
[IO.File]::WriteAllText($f, (($zeilen.ToArray()) -join [Environment]::NewLine) + [Environment]::NewLine, [Text.Encoding]::Unicode)
(Get-Item -LiteralPath $f -Force).Attributes = $attr
if (@(UserProcs @('mstsc')).Count) { Zeile 'Remotedesktop ist gerade offen — die Einstellung gilt ab dem nächsten Öffnen von „Remotedesktopverbindung“ (laufende Sitzung erst trennen und neu verbinden).' }
switch ($wahl) {
  'Laufwerke verbinden' { Zeile 'In der Sitzung erscheinen die Laufwerke unter „Dieser PC“ als „C auf <PC-Name>“; Dateien lassen sich dann auch per Kopieren/Einfügen übertragen. Der Server kann die Laufwerksumleitung per Richtlinie verbieten.' }
  'Windows-Tastenkombinationen in der Sitzung' { Zeile 'Alt+Tab und Windows-Taste wirken jetzt auch im Fenstermodus in der Sitzung; Strg+Alt+Ende ersetzt dort Strg+Alt+Entf.' }
  'Verbindungsleiste anzeigen' { Zeile 'Im Vollbild erscheint oben mittig die Leiste mit Minimieren/Schließen; Strg+Alt+Untbr wechselt zwischen Vollbild und Fenster.' }
  default { }
}
Zeile 'Gespeicherte eigene .rdp-Dateien (z. B. auf dem Desktop) haben eigene Einstellungen: Rechtsklick → Bearbeiten → Reiter „Lokale Ressourcen“/„Anzeige“.'` }),

  // ══ Kompatibilität alter Programme ═══════════════════════════════════════════
  A({ id: 'prog4-kompatibilitaet', titel: 'Kompatibilität für ein altes Programm einstellen (Windows-Version, DPI, Vollbild, TLS 1.2 für .NET)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Wie Rechtsklick → Eigenschaften → Kompatibilität → „Einstellungen für alle Benutzer ändern“: setzt für eine .exe den Kompatibilitätsmodus (Windows 7, Windows 8, Windows XP SP3), die Überschreibung der hohen DPI-Skalierung (Anwendung, System, System (erweitert) – gegen winzige oder unscharfe Masken) oder „Vollbildoptimierung aus“; „Zurücksetzen“ entfernt den Eintrag für alle Benutzer und den eigenen des angemeldeten Benutzers (auch „Als Administrator ausführen“). Andere Kennzeichen bleiben, alt → neu wird angezeigt. Sondereinstellungen ohne Pfad: „TLS 1.2 für alte .NET-Programme“ (gegen „Es konnte kein geschützter SSL/TLS-Kanal erstellt werden“) (Hilfedateien vom Netzlaufwerk zeigen sonst „Navigation abgebrochen“). Wirkt beim nächsten Programmstart.',
    param: { label: 'Programmdatei = Modus (oder Sondereinstellung)', platzhalter: String.raw`C:\Program Files (x86)\Hersteller\programm.exe = Windows 7`, pflicht: true, vorlagen: ['TLS 1.2 für alte .NET-Programme', String.raw`C:\Program Files (x86)\Hersteller\programm.exe = Windows 7`, String.raw`C:\Program Files (x86)\Hersteller\programm.exe = DPI: System (erweitert)`, String.raw`C:\Program Files (x86)\Hersteller\programm.exe = Vollbildoptimierung aus`, String.raw`C:\Program Files (x86)\Hersteller\programm.exe = Zurücksetzen`] },
    ps: String.raw`
$p = $P.Trim()
function DW([string]$k, [string]$n, [int]$w) {
  if (-not (Test-Path $k)) { Zeile ($k + ': nicht vorhanden – übersprungen'); return }
  $alt = (Get-ItemProperty -Path $k -Name $n -EA SilentlyContinue).$n
  if ($null -ne $alt -and [int]$alt -eq $w) { Zeile (($k -replace '^HKLM:\\SOFTWARE\\', '') + '\' + $n + ': ist bereits ' + $w); return }
  Set-ItemProperty -Path $k -Name $n -Value $w -Type DWord
  Zeile (($k -replace '^HKLM:\\SOFTWARE\\', '') + '\' + $n + ': ' + $(if ($null -eq $alt) { '(nicht gesetzt)' } else { [string]$alt }) + ' → ' + $w)
}
if ($p -ieq 'TLS 1.2 für alte .NET-Programme') {
  foreach ($k in 'HKLM:\SOFTWARE\Microsoft\.NETFramework\v4.0.30319', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\.NETFramework\v4.0.30319', 'HKLM:\SOFTWARE\Microsoft\.NETFramework\v2.0.50727', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\.NETFramework\v2.0.50727') { DW $k 'SchUseStrongCrypto' 1; DW $k 'SystemDefaultTlsVersions' 1 }
  Zeile '.NET-Programme handeln TLS jetzt nach Windows-Vorgabe aus (TLS 1.2/1.3) — betroffene Programme neu starten, Dienste des Programms neu starten.'
}
else {
  $m = [regex]::Match($p, '^"?(?<exe>[A-Za-z]:\\[^<>"|?*=]+?\.exe)"?\s*=\s*(?<modus>.+)$', 'IgnoreCase')
  if (-not $m.Success) { throw 'Format: „C:\…\programm.exe = Windows 7“ – Modi: Windows 7, Windows 8, Windows XP SP3, DPI: Anwendung, DPI: System, DPI: System (erweitert), Vollbildoptimierung aus, Zurücksetzen; oder „TLS 1.2 für alte .NET-Programme“.' }
  $exe = $m.Groups['exe'].Value.Trim(); $modus = $m.Groups['modus'].Value.Trim().ToLower()
  if ($exe -match '^(?i)[A-Za-z]:\\Windows\\') { throw 'Programme im Windows-Ordner werden nicht verändert.' }
  if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw ('Datei nicht gefunden: ' + $exe) }
  $flags = @{ 'windows 7' = 'WIN7RTM'; 'windows 8' = 'WIN8RTM'; 'windows xp sp3' = 'WINXPSP3'; 'dpi: anwendung' = 'HIGHDPIAWARE'; 'dpi: system' = 'DPIUNAWARE'; 'dpi: system (erweitert)' = 'GDIDPISCALING DPIUNAWARE'; 'vollbildoptimierung aus' = 'DISABLEDXMAXIMIZEDWINDOWEDMODE' }
  $zurueck = $modus -in 'zurücksetzen', 'zuruecksetzen'
  if (-not $zurueck -and -not $flags.ContainsKey($modus)) { throw ('Unbekannter Modus „' + $modus + '“ – erlaubt: ' + ((@($flags.Keys) | Sort-Object) -join ', ') + ', zurücksetzen') }
  $rk = [Microsoft.Win32.Registry]::LocalMachine.CreateSubKey('SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers')
  try {
    $alt = [string]$rk.GetValue($exe, '')
    $teile = @(($alt -replace '^~\s*', '').Split(' ', [StringSplitOptions]::RemoveEmptyEntries))
    if ($zurueck) {
      if ($alt) { $rk.DeleteValue($exe, $false); Zeile ($exe + ': „' + $alt + '“ → entfernt (keine Kompatibilitätseinstellung mehr für alle Benutzer)') }
      else { Zeile ($exe + ': für alle Benutzer war nichts eingestellt') }
    } else {
      $os = @('WIN95', 'WIN98', 'NT4SP5', 'WIN2000', 'WINXPSP2', 'WINXPSP3', 'VISTARTM', 'VISTASP1', 'VISTASP2', 'WIN7RTM', 'WIN8RTM', 'WINSRV03SP1', 'WINSRV08SP1')
      $dpi = @('HIGHDPIAWARE', 'DPIUNAWARE', 'GDIDPISCALING')
      $neu = @($flags[$modus].Split(' '))
      if ($os -contains $neu[0]) { $teile = @($teile | Where-Object { $os -notcontains $_ }) }
      if ($dpi -contains $neu[-1]) { $teile = @($teile | Where-Object { $dpi -notcontains $_ }) }
      $teile = @(@($teile) + $neu | Select-Object -Unique)
      $wert = '~ ' + ($teile -join ' ')
      $rk.SetValue($exe, $wert, [Microsoft.Win32.RegistryValueKind]::String)
      Zeile ($exe + ': ' + $(if ($alt) { '„' + $alt + '“' } else { '(nicht gesetzt)' }) + ' → „' + $wert + '“')
    }
  } finally { $rk.Close() }
  if ($uSid -and $uHive) {
    $uk = [Microsoft.Win32.Registry]::Users.OpenSubKey($uSid + '\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers', $zurueck)
    if ($uk) {
      try {
        $uv = [string]$uk.GetValue($exe, '')
        if ($uv -and $zurueck) { $uk.DeleteValue($exe, $false); Zeile ('Beim Benutzer: „' + $uv + '“ → entfernt') }
        elseif ($uv) { Zeile ('Zusätzlich beim Benutzer eingetragen: „' + $uv + '“ (Reiter Kompatibilität ohne „für alle Benutzer“) — beide Einträge wirken zusammen; „Zurücksetzen“ entfernt beide.') }
      } finally { $uk.Close() }
    }
  }
  Zeile 'Das Programm schließen und neu starten.'
}` }),

  // ══ Dateizuordnungen ═════════════════════════════════════════════════════════
  A({ id: 'prog4-dateizuordnung-zuruecksetzen', titel: 'Gespeicherte Programmauswahl für eine Dateiendung entfernen (z. B. .xml, .rdp, .mp4 – Windows fragt neu)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Zeigt, womit der Benutzer eine Dateiendung öffnet (gespeicherte Auswahl, angebotene Programme, Standard des PCs), und entfernt die gespeicherte Auswahl (UserChoice) – z. B. wenn .xml im Browser, .rdp/.ica/.jnlp im Editor oder Videos im falschen Player landen bzw. die Auswahl auf ein deinstalliertes Programm zeigt. Der alte Wert wird gesichert. Danach öffnet Windows mit dem Standard des PCs bzw. fragt „Wie möchten Sie diese Datei öffnen?“ – gewünschtes Programm wählen, „Immer“. Programmdateien (.exe, .bat …) werden nie angefasst; .pdf/.htm schützt Windows (dann Standard-Apps).',
    param: { label: 'Dateiendung', platzhalter: '.xml', pflicht: true, vorlagen: ['.xml', '.json', '.log', '.txt', '.csv', '.rdp', '.ica', '.jnlp', '.mp4', '.mkv', '.zip', '.7z'] },
    ps: String.raw`
NeedHive
$e = $P.Trim().ToLower()
if (-not $e.StartsWith('.')) { $e = '.' + $e }
if ($e -notmatch '^\.[a-z0-9_-]{1,12}$') { throw ('Ungültige Dateiendung: ' + $P) }
$nie = @('.exe', '.com', '.bat', '.cmd', '.lnk', '.msi', '.msc', '.ps1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.reg', '.scr', '.cpl', '.dll', '.sys', '.url', '.hta', '.pif')
if ($nie -contains $e) { throw ('Die Zuordnung von ' + $e + ' wird aus Sicherheitsgründen nicht verändert.') }
function ProgZiel([string]$id) {
  if (-not $id) { return '' }
  $orte = @(('HKLM:\SOFTWARE\Classes\' + $id))
  if ($uSid) { $orte = @(('Registry::HKEY_USERS\' + $uSid + '_Classes\' + $id)) + $orte }
  foreach ($b in $orte) {
    $an = [string](Get-ItemProperty -LiteralPath ($b + '\Application') -EA SilentlyContinue).ApplicationName
    if ($an -and $an -notmatch '^@') { return ($id + ' = ' + $an) }
    $ck = Get-Item -LiteralPath ($b + '\shell\open\command') -EA SilentlyContinue
    if ($ck) { $c = [string]$ck.GetValue(''); if ($c) { if ($c.Length -gt 110) { $c = $c.Substring(0, 110) + '…' }; return ($id + ' = ' + $c) } }
    if ($an) { return ($id + ' (App)') }
  }
  return ($id + ' (kein Öffnen-Befehl gefunden – Programm deinstalliert?)')
}
$k = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\' + $e
$std = ''
$sk0 = Get-Item -LiteralPath ('HKLM:\SOFTWARE\Classes\' + $e) -EA SilentlyContinue
if ($sk0) { $std = [string]$sk0.GetValue('') }
Zeile ('Standard des PCs für ' + $e + ': ' + $(if ($std) { ProgZiel $std } else { '(keiner eingetragen)' }))
$ang = @()
foreach ($ow in @((Get-Item -LiteralPath ($k + '\OpenWithProgids') -EA SilentlyContinue), (Get-Item -LiteralPath ('HKLM:\SOFTWARE\Classes\' + $e + '\OpenWithProgids') -EA SilentlyContinue))) { if ($ow) { $ang += @($ow.GetValueNames() | Where-Object { $_ }) } }
$ol = Get-Item -LiteralPath ($k + '\OpenWithList') -EA SilentlyContinue
if ($ol) { $ang += @($ol.GetValueNames() | Where-Object { $_ -match '^[a-z]$' } | ForEach-Object { [string]$ol.GetValue($_) }) }
Zeile ('Angebotene Programme: ' + $(if ($ang.Count) { (@($ang | Select-Object -Unique | Select-Object -First 10)) -join ' · ' } else { 'keine' }))
if ($e -in '.pdf', '.htm', '.html', '.shtml', '.xht', '.xhtml') {
  $uc = [string](Get-ItemProperty -LiteralPath ($k + '\UserChoice') -EA SilentlyContinue).ProgId
  Zeile ('Gespeicherte Auswahl: ' + $(if ($uc) { ProgZiel $uc } else { 'keine' }))
  Zeile ('Die Auswahl für ' + $e + ' schützt Windows (UserChoice-Schutz) — bitte beim Benutzer unter Einstellungen → Apps → Standard-Apps setzen (Schritt „Standard-Apps öffnen“).')
} else {
  $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
  $n = 0
  foreach ($sub in 'UserChoice', 'UserChoiceLatest') {
    $u = $k + '\' + $sub
    if (-not (Test-Path -LiteralPath $u)) { continue }
    $alt = [string](Get-ItemProperty -LiteralPath $u -EA SilentlyContinue).ProgId
    if (-not $alt) { $alt = [string](Get-ItemProperty -LiteralPath ($u + '\ProgId') -EA SilentlyContinue).ProgId }
    $sk = $uHive + '\Software\ITAdminTool\Sicherung\FileExts'
    if (-not (Test-Path -LiteralPath $sk)) { New-Item -Path $sk -Force | Out-Null }
    Set-ItemProperty -LiteralPath $sk -Name ($e + '_' + $sub + '_' + $stamp) -Value $alt -Type String
    try { Remove-Item -LiteralPath $u -Recurse -Force -EA Stop; $n++; Zeile ($e + ': gespeicherte Auswahl (' + $sub + ') vorher ' + $(if ($alt) { ProgZiel $alt } else { '?' }) + ' → entfernt (alter Wert gesichert unter Software\ITAdminTool\Sicherung\FileExts)') }
    catch { Zeile ($e + ': ' + $sub + ' ließ sich nicht entfernen (' + $_.Exception.Message + ') — der Benutzer wählt selbst: Rechtsklick → Öffnen mit → Andere App auswählen → „Immer“.') }
  }
  if (-not $n) { Zeile ($e + ': keine gespeicherte Auswahl — es gilt der Standard des PCs. Anderes Programm: Rechtsklick → Öffnen mit → Andere App auswählen → Haken/„Immer“.') }
  else { Zeile ('Beim nächsten Doppelklick auf eine ' + $e + '-Datei öffnet Windows mit dem Standard des PCs bzw. fragt nach — gewünschtes Programm wählen und „Immer“ anklicken.') }
}
$gp = [string](Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -EA SilentlyContinue).DefaultAssociationsConfiguration
if ($gp) { Zeile ('Achtung: Die Richtlinie „Standardzuordnungen“ (' + $gp + ') setzt Zuordnungen bei der Anmeldung wieder — gilt sie für ' + $e + ', muss die Vorgabe dort geändert werden (IT).') }` }),

  // ══ Fachanwendungen: Bestandsaufnahme ════════════════════════════════════════
  A({ id: 'prog4-fachprogramm-pruefen', titel: 'Fachprogramm gründlich prüfen (Installation, Programmdatei, 32/64/16 Bit, Abstürze, Kompatibilität, VirtualStore, Laufzeiten)', modus: 'system', risiko: 'lesen', timeoutMs: 150000,
    beschreibung: 'Für ein Fach- oder Lieferantenprogramm (Teil des Namens oder Pfad der .exe): passende Einträge der Softwareliste (Version, Hersteller, 32-Bit-Setup, Ort), die Programmdateien mit Version, 32/64/16 Bit und Signatur, Kompatibilitätseinstellungen (alle Benutzer und je Benutzer), laufende Prozesse mit Benutzer, Abstürze/Hänger/.NET-Fehler der letzten 14 Tage mit fehlerhaftem Modul und Ausnahme, umgeleitete Schreibzugriffe im VirtualStore je Benutzer – dazu Visual C++, .NET 3.5/4.x/Desktop Runtime, Java und Lizenzdienste (CodeMeter, Sentinel, FlexNet). Leer = Übersicht der häufigsten Programmabstürze. Ändert nichts.',
    param: { label: 'Programm (Teil des Namens) oder Pfad der .exe – leer = Übersicht', platzhalter: String.raw`z. B. Prüfmittel oder C:\Program Files (x86)\Hersteller\programm.exe` },
    ps: String.raw`
$p = $P.Trim().Trim('"')
if ($p -and ($p.Length -lt 3 -or $p.Length -gt 240 -or $p -match '[*?<>|]')) { throw 'Bitte mindestens 3 Zeichen des Programmnamens oder den vollständigen Pfad der .exe angeben (ohne * ? < > |).' }
$seit = (Get-Date).AddDays(-14)
function Bits([string]$f) {
  $fs = $null
  try {
    $fs = [IO.File]::Open($f, 'Open', 'Read', 'ReadWrite')
    $br = New-Object IO.BinaryReader($fs)
    if ($br.ReadUInt16() -ne 0x5A4D) { return 'kein Windows-Programm' }
    $fs.Position = 0x3C; $pe = $br.ReadInt32()
    if ($pe -le 0 -or $pe -gt ($fs.Length - 6)) { return 'MS-DOS-Programm (läuft nicht)' }
    $fs.Position = $pe; $sig = $br.ReadUInt16()
    if ($sig -eq 0x454E) { return '16 Bit (läuft unter 64-Bit-Windows NICHT)' }
    if ($sig -ne 0x4550) { return 'unbekanntes Format' }
    $fs.Position = $pe + 4; $mt = $br.ReadUInt16()
    if ($mt -eq 0x14c) { return '32 Bit' } elseif ($mt -eq 0x8664) { return '64 Bit' } elseif ($mt -eq 0xAA64) { return 'ARM64' } else { return ('Maschine 0x' + $mt.ToString('X')) }
  } catch { return 'Bitbreite ?' } finally { if ($fs) { $fs.Close() } }
}
function EvApp($ev) {
  if ($ev.ProviderName -eq '.NET Runtime') { $mm = [regex]::Match([string]$ev.Message, '(?im)^\s*(Application|Anwendung):\s*(\S+)'); if ($mm.Success) { return $mm.Groups[2].Value } else { return '(.NET-Programm)' } }
  $a = ([string]$ev.Properties[0].Value -split '\r?\n')[0].Trim()
  if ($a.Length -gt 60) { $a = $a.Substring(0, 60) }
  return $a
}
$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Error', 'Application Hang', '.NET Runtime'; Id = 1000, 1002, 1026; StartTime = $seit } -MaxEvents 3000 -EA SilentlyContinue | Where-Object { ($_.ProviderName -eq 'Application Error' -and $_.Id -eq 1000) -or ($_.ProviderName -eq 'Application Hang' -and $_.Id -eq 1002) -or ($_.ProviderName -eq '.NET Runtime' -and $_.Id -eq 1026) })
$un = @(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { $_.DisplayName })
if (-not $p) {
  Zeile ('Programmabstürze, Hänger und .NET-Fehler der letzten 14 Tage: ' + $ev.Count)
  foreach ($g in @($ev | Group-Object { EvApp $_ } | Sort-Object Count -Descending | Select-Object -First 8)) { Zeile ('  ' + $g.Name + ': ' + $g.Count + '×, zuletzt ' + $g.Group[0].TimeCreated.ToString('dd.MM. HH:mm')) }
} else {
  $istPfad = $p -match '^[A-Za-z]:\\.+\.exe$'
  $such = $(if ($istPfad) { [IO.Path]::GetFileNameWithoutExtension($p) } else { $p -replace '\.exe$', '' })
  $rx = [regex]::Escape($such)
  $inst = @($un | Where-Object { ([string]$_.DisplayName -match $rx) -or ([string]$_.Publisher -match $rx) -or ([string]$_.InstallLocation -match $rx) -or ($istPfad -and ([string]$_.InstallLocation).Length -gt 3 -and $p.StartsWith(([string]$_.InstallLocation).Trim('"').TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) })
  if ($inst.Count) { foreach ($x in @($inst | Select-Object -First 6)) { Zeile ('Installiert: ' + $x.DisplayName + ' ' + $x.DisplayVersion + ' · ' + $x.Publisher + $(if ([string]$x.PSPath -match 'WOW6432Node') { ' · 32-Bit-Setup' } else { '' }) + $(if ($x.InstallDate) { ' · installiert ' + $x.InstallDate } else { '' }) + $(if ($x.InstallLocation) { ' · ' + $x.InstallLocation } else { '' })) } }
  else { Zeile ('Kein Eintrag in der Softwareliste passt zu „' + $such + '“ (evtl. nur kopiert statt installiert).') }
  $exes = @(); $orte = @()
  if ($istPfad) { if (Test-Path -LiteralPath $p -PathType Leaf) { $exes = @(Get-Item -LiteralPath $p) } else { Zeile ('Datei nicht gefunden: ' + $p) } }
  else {
    $orte = @($inst | ForEach-Object { ([string]$_.InstallLocation).Trim('"').TrimEnd('\') } | Where-Object { $_.Length -gt 3 -and (Test-Path -LiteralPath $_) })
    foreach ($w in 'C:\Program Files', 'C:\Program Files (x86)') {
      foreach ($d in @(Get-ChildItem -LiteralPath $w -Directory -EA SilentlyContinue)) {
        if ($d.Name -match $rx) { $orte += $d.FullName }
        else { $orte += @(Get-ChildItem -LiteralPath $d.FullName -Directory -EA SilentlyContinue | Where-Object { $_.Name -match $rx } | ForEach-Object { $_.FullName }) }
      }
    }
    $orte = @($orte | Sort-Object -Unique | Select-Object -First 6)
    foreach ($o in $orte) { $exes += @(Get-ChildItem -LiteralPath $o -Filter '*.exe' -File -Recurse -Depth 2 -EA SilentlyContinue | Where-Object { $_.Name -notmatch '(?i)unins|setup|install|update|crash|report|vcredist' } | Select-Object -First 5) }
    $exes = @($exes | Sort-Object FullName -Unique | Select-Object -First 8)
    Zeile ('Programmordner: ' + $(if ($orte.Count) { $orte -join ' · ' } else { 'keiner gefunden — für genaue Angaben den Pfad der .exe angeben' }))
  }
  $hives = @(Get-ChildItem 'Registry::HKEY_USERS' -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^S-1-5-21-[\d-]+$' })
  $hl = Get-Item -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers' -EA SilentlyContinue
  $procs = @(); try { $procs = @(Get-Process -IncludeUserName -EA Stop) } catch { $procs = @(Get-Process -EA SilentlyContinue) }
  foreach ($x in $exes) {
    $vi = $x.VersionInfo
    $sg = '?'
    try { $as = Get-AuthenticodeSignature -LiteralPath $x.FullName -EA Stop; $sg = [string]$as.Status; if ($as.SignerCertificate) { $sg += ' (' + ((($as.SignerCertificate.Subject -split ',')[0]) -replace '^CN=', '') + ')' } } catch {}
    Zeile ($x.FullName + ' · ' + (Bits $x.FullName) + ' · Version ' + $(if ($vi.FileVersion) { $vi.FileVersion } else { '?' }) + ' · Datei vom ' + $x.LastWriteTime.ToString('dd.MM.yyyy') + ' · Signatur ' + $sg)
    $lay = @()
    if ($hl) { $v = [string]$hl.GetValue($x.FullName, ''); if ($v) { $lay += ('alle Benutzer „' + $v + '“') } }
    foreach ($h in $hives) {
      $uk = Get-Item -LiteralPath ($h.PSPath + '\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers') -EA SilentlyContinue
      if ($uk) { $v = [string]$uk.GetValue($x.FullName, ''); if ($v) { $wer = $h.PSChildName; try { $wer = (New-Object System.Security.Principal.SecurityIdentifier($h.PSChildName)).Translate([System.Security.Principal.NTAccount]).Value } catch {}; $lay += ($wer + ' „' + $v + '“') } }
    }
    if ($lay.Count) { Zeile ('   Kompatibilität: ' + ($lay -join ' · ')) }
    $lp = @($procs | Where-Object { $_.Path -and $_.Path -ieq $x.FullName })
    if ($lp.Count) { Zeile ('   läuft: ' + ((@($lp | ForEach-Object { 'PID ' + $_.Id + $(if ($_.UserName) { ' (' + $_.UserName + ')' } else { '' }) + ', ' + [math]::Round([double]$_.WorkingSet64 / 1MB) + ' MB' })) -join ' · ')) }
  }
  $namen = @($exes | ForEach-Object { $_.Name })
  if (-not $namen.Count) { $namen = @($such + '.exe') }
  $evp = @($ev | Where-Object { $namen -contains (EvApp $_) })
  Zeile ('Abstürze/Hänger/.NET-Fehler (14 Tage) von ' + ($namen -join ', ') + ': ' + $evp.Count)
  foreach ($x in @($evp | Select-Object -First 5)) {
    $t = $x.TimeCreated.ToString('dd.MM. HH:mm')
    if ($x.Id -eq 1000) { Zeile ('   ' + $t + ' Absturz ' + $x.Properties[0].Value + ' ' + $x.Properties[1].Value + ' – fehlerhaftes Modul ' + $x.Properties[3].Value + ' ' + $x.Properties[4].Value + ', Ausnahmecode ' + $x.Properties[6].Value) }
    elseif ($x.Id -eq 1002) { Zeile ('   ' + $t + ' reagiert nicht mehr (Hänger) ' + $x.Properties[0].Value + ' ' + $x.Properties[1].Value) }
    else { $mx = [regex]::Match([string]$x.Message, '(?im)^\s*(Ausnahmeinformationen|Exception Info):\s*(.+)$'); Zeile ('   ' + $t + ' .NET-Fehler: ' + $(if ($mx.Success) { $mx.Groups[2].Value.Trim() } else { 'unbehandelte Ausnahme' })) }
  }
  $dirs = @($exes | ForEach-Object { $_.DirectoryName }) + @($orte) | Sort-Object -Unique
  $vs = @()
  foreach ($pr in @(Get-ChildItem 'C:\Users' -Directory -EA SilentlyContinue | Where-Object { $_.Name -notin 'Public', 'Default', 'Default User', 'All Users' })) {
    foreach ($d in $dirs) {
      if (-not $d -or $d.Length -lt 4) { continue }
      $v = Join-Path $pr.FullName ('AppData\Local\VirtualStore\' + $d.Substring(3))
      if (Test-Path -LiteralPath $v) { $fl = @(Get-ChildItem -LiteralPath $v -File -Recurse -EA SilentlyContinue); if ($fl.Count) { $vs += ($pr.Name + ': ' + $fl.Count + ' Dateien, zuletzt ' + (($fl | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime.ToString('dd.MM.yyyy'))) } }
    }
  }
  Zeile ('VirtualStore (umgeleitete Schreibzugriffe in den Programmordner): ' + $(if ($vs.Count) { ($vs | Select-Object -Unique) -join ' · ' } else { 'nichts' }))
}
$vc = @($un | Where-Object { [string]$_.DisplayName -match 'Visual C\+\+ (2015|2017|2019|2022|2015-20\d\d|v14).*Redistributable' } | ForEach-Object { (([string]$_.DisplayName -replace 'Microsoft Visual C\+\+ ', 'VC++ ') -replace ' Redistributable', '') + ' ' + $_.DisplayVersion } | Sort-Object -Unique)
Zeile ('Visual C++ 2015–2022: ' + $(if ($vc.Count) { $vc -join ' · ' } else { 'NICHT installiert' }))
$vcalt = @($un | Where-Object { [string]$_.DisplayName -match 'Visual C\+\+ 20(05|08|10|12|13)' } | ForEach-Object { [regex]::Match([string]$_.DisplayName, '20\d\d').Value + $(if ([string]$_.DisplayName -match 'x64') { ' x64' } else { ' x86' }) } | Sort-Object -Unique)
if ($vcalt.Count) { Zeile ('Ältere Visual C++: ' + ($vcalt -join ', ')) }
$n35 = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v3.5' -EA SilentlyContinue).Install
$rel = [int](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -EA SilentlyContinue).Release
$n4 = $(if ($rel -ge 533320) { '4.8.1' } elseif ($rel -ge 528040) { '4.8' } elseif ($rel -ge 461808) { '4.7.2' } elseif ($rel -gt 0) { '4.x (' + $rel + ')' } else { 'nicht gefunden' })
$core = @()
foreach ($d in 'C:\Program Files\dotnet\shared\Microsoft.WindowsDesktop.App', 'C:\Program Files (x86)\dotnet\shared\Microsoft.WindowsDesktop.App') { if (Test-Path -LiteralPath $d) { $b = $(if ($d -match 'x86') { ' (32 Bit)' } else { '' }); $core += @(Get-ChildItem -LiteralPath $d -Directory -EA SilentlyContinue | ForEach-Object { $_.Name + $b }) } }
Zeile ('.NET Framework 3.5: ' + $(if ($n35 -eq 1) { 'aktiv' } else { 'NICHT aktiv' }) + ' · .NET Framework ' + $n4 + ' · .NET Desktop Runtime: ' + $(if ($core.Count) { $core -join ', ' } else { 'keine' }))
$jv = @($un | Where-Object { [string]$_.DisplayName -match '^Java|OpenJDK|OpenWebStart|Temurin|Zulu|Corretto' } | ForEach-Object { ([string]$_.DisplayName + ' ' + [string]$_.DisplayVersion).Trim() } | Sort-Object -Unique)
if ($jv.Count) { Zeile ('Java: ' + ($jv -join ' · ')) }
$lz = @()
foreach ($s in 'CodeMeter.exe', 'hasplms', 'SentinelKeysServer', 'FlexNet Licensing Service', 'FlexNet Licensing Service 64') { $sv = Get-Service -Name $s -EA SilentlyContinue; if ($sv) { $lz += ($sv.DisplayName + ': ' + $sv.Status + ', ' + $sv.StartType) } }
if ($lz.Count) { Zeile ('Lizenzdienste: ' + ($lz -join ' · ')) }` }),
]
