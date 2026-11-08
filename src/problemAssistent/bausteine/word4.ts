// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „word“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Alle Bausteine wirken nur auf Profil/Registry des ANGEMELDETEN Benutzers ($uProf/$uRoam/$uLocal/$uHive)
// — nie auf Server-Freigaben, Richtlinien, Lizenzen oder die Office-Installation.
// Benutzerdaten werden verschoben/umbenannt (*.alt_…), nie gelöscht.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Registry-Werte des Benutzers OHNE Auflösen mit der Admin-Umgebung lesen und %APPDATA% & Co. auf SEIN Profil abbilden. */
const W_PFAD = String.raw`
function RegRoh([string]$k, [string]$n) { try { $x = Get-Item -LiteralPath $k -EA Stop; return $x.GetValue($n, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } catch { return $null } }
function PfadUser([string]$p) {
  if (-not $p) { return $null }
  $p = $p -replace '(?i)%APPDATA%', $uRoam.Replace('$', '$$') -replace '(?i)%LOCALAPPDATA%', $uLocal.Replace('$', '$$') -replace '(?i)%USERPROFILE%', $uProf.Replace('$', '$$')
  return $p
}
function ShellOrdner([string]$n) { PfadUser ([string](RegRoh ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') $n)) }
`

export const AKTIONEN_WORD4: PaAktion[] = [
  A({ id: 'word-startordner-sichern', titel: 'Word-Startordner (STARTUP) aufräumen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet Word und verschiebt die Add-in-Vorlagen und Makrodateien (.dotm, .dot, .wll …) aus dem persönlichen Word-Startordner in eine Sicherung (STARTUP.alt_…) — gegen „Kompilierungsfehler im ausgeblendeten Modul“, Makro-Meldungen beim Start, unbekannte Registerkarten und langsamen Start. Startordner für alle Benutzer und eigene Startordner-Pfade werden nur angezeigt, nicht verändert.',
    ps: W_PFAD + String.raw`
NeedHive
$std = Join-Path $uRoam 'Microsoft\Word\STARTUP'
$eigen = PfadUser ([string](RegRoh ($uHive + '\Software\Microsoft\Office\16.0\Word\Options') 'STARTUP-PATH'))
if ($eigen) { Zeile ('Startordner laut Word-Optionen: ' + $eigen + $(if ($eigen.TrimEnd('\') -ieq $std) { '' } else { ' (eigener Pfad — wird nicht verändert)' })) }
foreach ($m in 'C:\Program Files\Microsoft Office\root\Office16\STARTUP', 'C:\Program Files (x86)\Microsoft Office\root\Office16\STARTUP') {
  $g = @(Get-ChildItem -LiteralPath $m -Force -File -EA SilentlyContinue)
  if ($g.Count) { Zeile ('Startordner für alle Benutzer ' + $m + ': ' + ((@($g | ForEach-Object { $_.Name })) -join ', ') + ' (wird nicht verändert)') }
}
$dat = @(Get-ChildItem -LiteralPath $std -Force -File -EA SilentlyContinue)
if (-not $dat.Count) { Zeile 'Vorher: Der persönliche Word-Startordner ist leer bzw. nicht vorhanden — hier liegt die Ursache nicht (Add-ins prüfen).' }
else {
  foreach ($d in $dat) { Zeile ('Vorher: ' + $d.Name + ' · ' + (Groesse $d.Length) + ' · geändert ' + $d.LastWriteTime.ToString('dd.MM.yyyy')) }
  StopUser @('WINWORD')
  $ziel = Join-Path $uRoam ('Microsoft\Word\STARTUP.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
  New-Item -Path $ziel -ItemType Directory -Force | Out-Null
  foreach ($d in $dat) { Move-Item -LiteralPath $d.FullName -Destination $ziel -Force -EA Stop }
  Zeile ('Jetzt: ' + $dat.Count + ' Datei(en) verschoben nach ' + $ziel + ' — Word startet ohne sie. Fehlt danach eine benötigte Firmen-Registerkarte, nur diese Datei zurück nach STARTUP schieben.')
}` }),

  A({ id: 'word-wiederherstellung-zuruecksetzen', titel: 'Dokumentwiederherstellung und Absturzmerker von Word/Excel/PowerPoint zurücksetzen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Sichert die Liste der Dokumentwiederherstellung und den Absturzmerker beim Start (Registry „Resiliency“ → *.alt_…) — gegen die bei jedem Start wiederkehrende Dokumentwiederherstellung mit alten Dateien und die ständige Frage „… im abgesicherten Modus starten?“. Das gewählte Programm wird dafür beendet (vorher speichern!). AutoWiederherstellen-Dateien bleiben unverändert im Profil.',
    param: { label: 'Programm', platzhalter: 'Word', optionen: ['Word', 'Excel', 'PowerPoint', 'Alle'] },
    ps: String.raw`
NeedHive
$wahl = 'Alle'
if ($P -and $P.Trim()) {
  $wahl = @{ word = 'Word'; excel = 'Excel'; powerpoint = 'PowerPoint'; alle = 'Alle' }[$P.Trim().ToLower()]
  if (-not $wahl) { throw 'Bitte Word, Excel, PowerPoint oder Alle wählen.' }
}
$apps = @('Word', 'Excel', 'PowerPoint'); if ($wahl -ne 'Alle') { $apps = @($wahl) }
$proc = @{ Word = 'WINWORD'; Excel = 'EXCEL'; PowerPoint = 'POWERPNT' }
$plan = @()
foreach ($app in $apps) {
  foreach ($t in 'DocumentRecovery', 'StartupItems') {
    $k = $uHive + '\Software\Microsoft\Office\16.0\' + $app + '\Resiliency\' + $t
    if (Test-Path -LiteralPath $k) { $it = Get-Item -LiteralPath $k; $plan += [pscustomobject]@{ App = $app; Teil = $t; K = $k; N = ($it.ValueCount + $it.SubKeyCount) } }
    else { Zeile ('' + $app + ': ' + $(if ($t -eq 'DocumentRecovery') { 'keine Einträge in der Dokumentwiederherstellung' } else { 'kein Absturzmerker beim Start' })) }
  }
}
if (-not $plan.Count) { Zeile 'Nichts zurückzusetzen — weder Wiederherstellungsliste noch Absturzmerker vorhanden. Die Ursache liegt woanders (Add-ins, Installation).' }
else {
  StopUser @($plan | ForEach-Object { $proc[$_.App] } | Select-Object -Unique)
  $st = Get-Date -Format 'yyyyMMdd_HHmmss'
  foreach ($x in $plan) {
    Rename-Item -LiteralPath $x.K -NewName ($x.Teil + '.alt_' + $st) -Force -EA Stop
    Zeile ('Vorher: ' + $x.App + ' · ' + $(if ($x.Teil -eq 'DocumentRecovery') { 'Dokumentwiederherstellung' } else { 'Absturzmerker (Frage nach abgesichertem Modus)' }) + ' mit ' + $x.N + ' Einträgen · jetzt gesichert als ' + $x.Teil + '.alt_' + $st)
  }
  Zeile 'Jetzt: Beim nächsten Start erscheinen weder die alte Wiederherstellungsliste noch die Frage nach dem abgesicherten Modus. Die AutoWiederherstellen-Dateien selbst liegen unverändert im Profil.'
}` }),

  A({ id: 'word-pfade-reparieren', titel: 'Datei-Pfade von Word/Office reparieren (Arbeitsdatei, AutoWiederherstellen, Vorlagen, Temp)', modus: 'profil', risiko: 'aendern', timeoutMs: 90000,
    beschreibung: 'Prüft die Ordner, die Word zum Arbeiten braucht: AutoWiederherstellen-, Benutzervorlagen-, Autostart-, Dokument- und Bilderordner, persönliche Vorlagen (Word/PowerPoint/Excel), Internet-Zwischenspeicher und TEMP des Benutzers. Zeigt auf einen nicht mehr vorhandenen Ordner oder einen abgeschalteten Server, wird der Wert auf Standard gesetzt (alter Wert wird angezeigt bzw. als *.alt_… gesichert) bzw. ein fehlender Ordner im Profil neu angelegt. Gegen „Word konnte die Arbeitsdatei nicht erstellen“, fehlende AutoWiederherstellen-Kopien, fehlenden Reiter „Persönlich“ und langsamen Start durch alte Server-Pfade. Erreichbare Server und Laufwerke, die nur der Benutzer sieht, bleiben unverändert.',
    ps: W_PFAD + String.raw`
NeedHive
$st = Get-Date -Format 'yyyyMMdd_HHmmss'
$geaendert = 0
$lokal = @(Get-CimInstance Win32_LogicalDisk -EA SilentlyContinue | Where-Object { $_.DriveType -in 2, 3 } | ForEach-Object { ([string]$_.DeviceID).Substring(0, 1).ToUpper() })
# Ist das Firmennetz erreichbar? (Domänencontroller über den Domänennamen, LDAP 389)
$domOk = $false
try { $dn = [string](Get-CimInstance Win32_ComputerSystem -EA Stop).Domain; if ($dn -match '\.') { $t2 = New-Object System.Net.Sockets.TcpClient; $domOk = $t2.ConnectAsync($dn, 389).Wait(2000); $t2.Close() } } catch { $domOk = $false }
if (-not $domOk) { Zeile 'Firmennetz/Domäne von diesem PC aus gerade nicht erreichbar — Server-Pfade werden nicht verändert.' }
function PfadStatus([string]$p) {
  if (-not $p) { return 'fehlt' }
  if ($p -match '%') { return 'unklar' }
  $u = [regex]::Match($p, '^\\\\([^\\]+)\\')
  if ($u.Success) {
    # Nur „tot“, wenn das Firmennetz erreichbar ist UND der Servername nicht mehr existiert (abgebauter Server).
    # Server nur kurz weg oder Homeoffice ohne Tunnel → nichts ändern.
    if (-not $domOk) { return 'unklar' }
    $aufl = $false
    try { $aufl = @([System.Net.Dns]::GetHostAddresses($u.Groups[1].Value)).Count -gt 0 } catch { $aufl = $false }
    if ($aufl) { return 'unklar' } else { return 'tot' }
  }
  $lw = [regex]::Match($p, '^([A-Za-z]):')
  if ($lw.Success) {
    $b = $lw.Groups[1].Value.ToUpper()
    if ($lokal -notcontains $b) {
      $rp = [string](RegRoh ($uHive + '\Network\' + $b) 'RemotePath')
      if ($rp) { return (PfadStatus ($rp + $p.Substring(2))) }
      return 'unklar'
    }
    if (Test-Path -LiteralPath $p) { return 'ok' } else { return 'fehlt' }
  }
  return 'unklar'
}
function ImProfil([string]$p) { return ($p -and $p.StartsWith($uProf, [StringComparison]::OrdinalIgnoreCase)) }

# 1) Ordner aus den Word-/Office-Optionen
$wo = $uHive + '\Software\Microsoft\Office\16.0\Word\Options'
$cg = $uHive + '\Software\Microsoft\Office\16.0\Common\General'
$liste = @(
  @{ K = $wo; N = 'AUTOSAVE-PATH'; L = 'AutoWiederherstellen-Ordner (Word)' },
  @{ K = $wo; N = 'USER-DOT-PATH'; L = 'Benutzervorlagen (Word)' },
  @{ K = $wo; N = 'UserTemplates'; L = 'Benutzervorlagen (Word)' },
  @{ K = $cg; N = 'UserTemplates'; L = 'Benutzervorlagen (Office)' },
  @{ K = $wo; N = 'STARTUP-PATH'; L = 'Autostart-Ordner (Word)' },
  @{ K = $wo; N = 'DOC-PATH'; L = 'Standard-Dokumentordner (Word)' },
  @{ K = $wo; N = 'PICTURE-PATH'; L = 'Bilderordner (Word)' }
)
foreach ($e in $liste) {
  $alt = [string](RegRoh $e.K $e.N)
  if (-not $alt) { continue }
  $p = PfadUser $alt
  $s = PfadStatus $p
  if ($s -eq 'ok') { Zeile ($e.L + ': ' + $alt + ' — in Ordnung'); continue }
  if ($s -eq 'unklar') { Zeile ($e.L + ': ' + $alt + ' — von hier nicht prüfbar (Server erreichbar bzw. Laufwerk nur beim Benutzer) — bleibt'); continue }
  if ($s -eq 'fehlt' -and (ImProfil $p)) {
    New-Item -Path $p -ItemType Directory -Force | Out-Null
    Zeile ($e.L + ': Ordner ' + $p + ' fehlte — neu angelegt (Wert bleibt)'); $geaendert++; continue
  }
  Set-ItemProperty -Path $e.K -Name ($e.N + '.alt_' + $st) -Value $alt -Type String
  Remove-ItemProperty -Path $e.K -Name $e.N -EA Stop
  Zeile ($e.L + ': ' + $alt + ' → Standard (' + $(if ($s -eq 'tot') { 'Server nicht mehr erreichbar' } else { 'Ordner existiert nicht' }) + '; alter Wert gesichert als ' + $e.N + '.alt_' + $st + ')')
  $geaendert++
}

# 2) Persönliche Vorlagen (Reiter „Persönlich“ bei Datei → Neu)
$doks = ShellOrdner 'Personal'
if (-not $doks) { $doks = Join-Path $uProf 'Documents' }
$pt = $null
if ($doks.StartsWith('\\') -or $doks -match '%') { Zeile ('Dokumente liegen nicht lokal (' + $doks + ') — Ordner für persönliche Vorlagen wird nicht angelegt.') }
else {
  $pt = Join-Path $doks 'Benutzerdefinierte Office-Vorlagen'
  $en = Join-Path $doks 'Custom Office Templates'
  if (-not (Test-Path -LiteralPath $pt) -and (Test-Path -LiteralPath $en)) { $pt = $en }
}
foreach ($app in 'Word', 'PowerPoint', 'Excel') {
  $k = $uHive + '\Software\Microsoft\Office\16.0\' + $app + '\Options'
  $alt = [string](RegRoh $k 'PersonalTemplates')
  $s = 'fehlt'; if ($alt) { $s = PfadStatus (PfadUser $alt) }
  if ($alt -and ($s -eq 'ok' -or $s -eq 'unklar')) { Zeile ('Persönliche Vorlagen (' + $app + '): ' + $alt + ' — ' + $(if ($s -eq 'ok') { 'in Ordnung' } else { 'von hier nicht prüfbar — bleibt' })); continue }
  if (-not $pt) { continue }
  if (-not (Test-Path -LiteralPath $pt)) { New-Item -Path $pt -ItemType Directory -Force | Out-Null; Zeile ('Ordner angelegt: ' + $pt) }
  if (-not (Test-Path -Path $k)) { New-Item -Path $k -Force | Out-Null }
  if ($alt) { Set-ItemProperty -Path $k -Name ('PersonalTemplates.alt_' + $st) -Value $alt -Type String }
  Set-ItemProperty -Path $k -Name 'PersonalTemplates' -Value $pt -Type String
  Zeile ('Persönliche Vorlagen (' + $app + '): ' + $(if ($alt) { $alt } else { '(nicht festgelegt)' }) + ' → ' + $pt)
  $geaendert++
}

# 3) Internet-Zwischenspeicher (Word legt dort Arbeitsdateien an)
$usf = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders'
$cstd = '%USERPROFILE%\AppData\Local\Microsoft\Windows\INetCache'
$alt = [string](RegRoh $usf 'Cache')
$cp = PfadUser $alt
$cok = $false
if ($cp -and -not $cp.StartsWith('\\') -and $cp -notmatch '%') {
  if (Test-Path -LiteralPath $cp) { $cok = $true }
  elseif (ImProfil $cp) { New-Item -Path $cp -ItemType Directory -Force | Out-Null; Zeile ('Internet-Zwischenspeicher: Ordner ' + $cp + ' fehlte — neu angelegt'); $geaendert++; $cok = $true }
}
if ($cok) { Zeile ('Internet-Zwischenspeicher (Cache): ' + $alt + ' — in Ordnung') }
elseif ($alt -match '%' -and $alt -notmatch '(?i)%(USERPROFILE|LOCALAPPDATA|APPDATA)%') { Zeile ('Internet-Zwischenspeicher (Cache): ' + $alt + ' — von hier nicht prüfbar — bleibt') }
elseif (Test-Path -Path $usf) {
  Set-ItemProperty -Path $usf -Name 'Cache' -Value $cstd -Type ExpandString
  $neu = Join-Path $uLocal 'Microsoft\Windows\INetCache'
  if (-not (Test-Path -LiteralPath $neu)) { New-Item -Path $neu -ItemType Directory -Force | Out-Null }
  Zeile ('Internet-Zwischenspeicher (Cache): ' + $(if ($alt) { $alt } else { '(leer)' }) + ' → ' + $cstd + ' (wirkt nach Ab- und Anmelden)')
  $geaendert++
}

# 4) TEMP/TMP des Benutzers
$ek = $uHive + '\Environment'
if (Test-Path -Path $ek) {
  foreach ($n in 'TEMP', 'TMP') {
    $alt = [string](RegRoh $ek $n)
    $p = PfadUser $alt
    if ($p -and $p -match '%') { Zeile ('Umgebungsvariable ' + $n + ': ' + $alt + ' — von hier nicht prüfbar — bleibt'); continue }
    if ($p -and -not $p.StartsWith('\\') -and (Test-Path -LiteralPath $p)) { Zeile ('Umgebungsvariable ' + $n + ': ' + $alt + ' — in Ordnung'); continue }
    if ($p -and -not $p.StartsWith('\\') -and (ImProfil $p)) { New-Item -Path $p -ItemType Directory -Force | Out-Null; Zeile ('Umgebungsvariable ' + $n + ': Ordner ' + $p + ' fehlte — neu angelegt'); $geaendert++; continue }
    Set-ItemProperty -Path $ek -Name $n -Value '%USERPROFILE%\AppData\Local\Temp' -Type ExpandString
    Zeile ('Umgebungsvariable ' + $n + ': ' + $(if ($alt) { $alt } else { '(fehlte)' }) + ' → %USERPROFILE%\AppData\Local\Temp (wirkt nach Ab- und Anmelden)')
    $geaendert++
  }
}
$tmp = Join-Path $uLocal 'Temp'
$anz = @(Get-ChildItem -LiteralPath $tmp -Force -File -EA SilentlyContinue).Count
Zeile ('Temp-Ordner des Benutzers: ' + $anz + ' Dateien' + $(if ($anz -gt 20000) { ' — sehr viele, zusätzlich „Temporäre Dateien löschen“ ausführen' } else { '' }))
Zeile ('Ergebnis: ' + $geaendert + ' Einstellung(en) repariert. Word danach neu starten' + $(if ($geaendert) { '; Änderungen an Cache/TEMP wirken erst nach Ab- und Anmelden.' } else { ' — die Pfade waren in Ordnung.' }))` }),

  A({ id: 'word-onenote-sicherung', titel: 'OneNote-Sicherungen auf den Desktop kopieren', modus: 'profil', risiko: 'aendern', timeoutMs: 180000,
    beschreibung: 'Sucht die automatischen Sicherungen von OneNote (Ordner „Sicherung“/„Backup“ im Profil bzw. eigener Sicherungsordner) der letzten Tage, zeigt je Notizbuch die neueste Sicherung und kopiert die Sicherungsdateien (.one) in einen neuen Ordner „OneNote-Sicherungen …“ auf dem Desktop des Benutzers. Per Doppelklick öffnen sie sich in OneNote; verlorene Seiten lassen sich von dort zurückkopieren. Die Originale bleiben unverändert.',
    param: { label: 'Wie viele Tage zurück', platzhalter: '14', vorlagen: ['7', '14', '30', '60'] },
    ps: W_PFAD + String.raw`
NeedHive
$tage = 14
if ($P -and $P.Trim()) {
  if ($P.Trim() -notmatch '^\d{1,3}$') { throw 'Bitte die Anzahl Tage als Zahl angeben (1–365).' }
  $tage = [int]$P.Trim()
  if ($tage -lt 1 -or $tage -gt 365) { throw 'Bitte 1 bis 365 Tage angeben.' }
}
$orte = @()
$bp = PfadUser ([string](RegRoh ($uHive + '\Software\Microsoft\Office\16.0\OneNote\Options\Paths') 'BackupFolderPath'))
if ($bp) { if ($bp.StartsWith('\\')) { Zeile ('Eigener Sicherungsordner auf einem Server: ' + $bp + ' — dort liest das Tool nicht; bitte im Explorer öffnen.') } else { $orte += $bp } }
foreach ($n in 'Sicherung', 'Backup') { $orte += (Join-Path $uLocal ('Microsoft\OneNote\16.0\' + $n)) }
$orte = @($orte | Select-Object -Unique)
$seit = (Get-Date).AddDays(-$tage)
$funde = @()
foreach ($o in $orte) {
  if (-not (Test-Path -LiteralPath $o)) { continue }
  foreach ($f in @(Get-ChildItem -LiteralPath $o -Recurse -Force -File -EA SilentlyContinue)) {
    if ($f.Extension -notin '.one', '.onetoc2') { continue }
    if ($f.LastWriteTime -lt $seit) { continue }
    $funde += [pscustomobject]@{ Basis = $o.TrimEnd('\'); Datei = $f; Buch = (($f.FullName.Substring($o.TrimEnd('\').Length).TrimStart('\')) -split '\\')[0] }
  }
}
if (-not $funde.Count) { Zeile ('Keine OneNote-Sicherungen der letzten ' + $tage + ' Tage gefunden (gesucht in: ' + ($orte -join '; ') + '). Ältere Stände: mehr Tage angeben; Notizbücher in SharePoint/OneDrive haben zusätzlich den Versionsverlauf.') }
else {
  $summe = [double]0
  foreach ($x in $funde) { $summe += $x.Datei.Length }
  foreach ($g in @($funde | Group-Object Buch)) {
    $neu = @($g.Group | Sort-Object { $_.Datei.LastWriteTime } -Descending)[0].Datei.LastWriteTime
    Zeile ('Notizbuch „' + $g.Name + '“: ' + $g.Count + ' Sicherungsdatei(en), neueste vom ' + $neu.ToString('dd.MM.yyyy HH:mm'))
  }
  if ($summe -gt 4GB) { throw ('Die Sicherungen sind zusammen ' + (Groesse $summe) + ' groß — bitte weniger Tage angeben.') }
  $desk = ShellOrdner 'Desktop'
  if (-not $desk -or $desk -match '%') { $desk = Join-Path $uProf 'Desktop' }
  if ($desk.StartsWith('\\')) { throw ('Der Desktop des Benutzers liegt auf einem Server (' + $desk + ') — dorthin schreibt das Tool nicht.') }
  $ziel = Join-Path $desk ('OneNote-Sicherungen ' + (Get-Date -Format 'yyyy-MM-dd HHmm'))
  foreach ($x in $funde) {
    $z = Join-Path $ziel ($x.Datei.FullName.Substring($x.Basis.Length).TrimStart('\'))
    [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($z))
    Copy-Item -LiteralPath $x.Datei.FullName -Destination $z -Force -EA Stop
  }
  Zeile ('Jetzt: ' + $funde.Count + ' Sicherungsdatei(en) (' + (Groesse $summe) + ') kopiert nach ' + $ziel + ' — Doppelklick auf eine .one-Datei öffnet den Abschnitt in OneNote unter „Geöffnete Abschnitte“; Seiten per Rechtsklick → „Verschieben/Kopieren“ ins Notizbuch zurückholen.')
}` }),

  A({ id: 'word-cloudschriften-neu', titel: 'Cloud-Schriften von Office neu laden (z. B. Aptos)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Zeigt den Zwischenspeicher der Office-Cloud-Schriften (Aptos, Grandview, Seaford …) und prüft, ob der Download-Server erreichbar ist. Danach werden Word, PowerPoint, Excel, OneNote, Visio und Project des Benutzers beendet und der Zwischenspeicher umbenannt (*.alt_…) — Office lädt die Schriften beim nächsten Öffnen neu. Gegen Ersatzschriften, Kästchen und „Schriftart wird heruntergeladen“, das nie fertig wird.',
    ps: String.raw`
NeedUser
$cf = Join-Path $uLocal 'Microsoft\FontCache\4\CloudFonts'
$da = Test-Path -LiteralPath $cf
if ($da) {
  $fam = @(Get-ChildItem -LiteralPath $cf -Directory -Force -EA SilentlyContinue)
  Zeile ('Vorher: ' + $fam.Count + ' Cloud-Schriftfamilien im Zwischenspeicher (' + (Groesse (OrdnerGroesse $cf)) + ')' + $(if ($fam.Count) { ': ' + ((@($fam | Select-Object -First 12 | ForEach-Object { $_.Name })) -join ', ') } else { '' }))
} else { Zeile 'Vorher: Kein Zwischenspeicher für Cloud-Schriften vorhanden — Office hat bisher keine Schrift nachgeladen.' }
$ok = $false
try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync('fs.microsoft.com', 443).Wait(4000); $t.Close() } catch { $ok = $false }
Zeile ('Download-Server der Office-Schriften (fs.microsoft.com:443) direkt erreichbar: ' + (Ja $ok) + $(if ($ok) { '' } else { ' (läuft der PC nur über Proxy/Zscaler, kann Office trotzdem laden — sonst Freigabe prüfen lassen)' }))
if ($da) {
  StopUser @('WINWORD', 'POWERPNT', 'EXCEL', 'ONENOTE', 'VISIO', 'WINPROJ', 'MSPUB')
  try { [void](RenameAlt $cf 'Cloud-Schriften-Zwischenspeicher') }
  catch { throw ('Der Zwischenspeicher ist noch in Benutzung (meist durch Outlook) — bitte Outlook schließen und den Schritt wiederholen. ' + $_.Exception.Message) }
}
Zeile 'Jetzt: Office lädt die benötigten Cloud-Schriften beim nächsten Öffnen eines Dokuments neu herunter (Internet nötig).'` }),

  A({ id: 'word-menueband-zuruecksetzen', titel: 'Menüband- und Schnellzugriffs-Anpassungen zurücksetzen (Word, Excel, PowerPoint, Outlook)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet das gewählte Programm und verschiebt dessen Anpassungsdatei für Menüband und Symbolleiste für den Schnellzugriff (*.officeUI im Profil) in eine Sicherung (officeUI.alt_…). Beim nächsten Start gilt das Standard-Menüband — gegen doppelte oder leere eigene Registerkarten, verschwundene bzw. kaputte Schnellzugriffsleiste und „Anpassungen konnten nicht geladen werden“. Firmen-Add-ins bleiben.',
    param: { label: 'Programm', platzhalter: 'Word', pflicht: true, optionen: ['Word', 'Excel', 'PowerPoint', 'Outlook', 'Alle'] },
    ps: String.raw`
NeedUser
$wahl = @{ word = 'Word'; excel = 'Excel'; powerpoint = 'PowerPoint'; outlook = 'Outlook'; alle = 'Alle' }[$P.Trim().ToLower()]
if (-not $wahl) { throw 'Bitte Word, Excel, PowerPoint, Outlook oder Alle wählen.' }
$muster = @{ Word = 'Word.officeUI'; Excel = 'Excel.officeUI'; PowerPoint = 'PowerPoint.officeUI'; Outlook = 'olk*.officeUI' }
$proc = @{ Word = 'WINWORD'; Excel = 'EXCEL'; PowerPoint = 'POWERPNT'; Outlook = 'OUTLOOK' }
$apps = @('Word', 'Excel', 'PowerPoint', 'Outlook'); if ($wahl -ne 'Alle') { $apps = @($wahl) }
$od = Join-Path $uLocal 'Microsoft\Office'
$dat = @()
foreach ($a in $apps) { $dat += @(Get-ChildItem -LiteralPath $od -Filter $muster[$a] -Force -File -EA SilentlyContinue | ForEach-Object { [pscustomobject]@{ App = $a; F = $_ } }) }
if (-not $dat.Count) { Zeile ('Vorher: Für ' + ($apps -join ', ') + ' gibt es keine eigenen Menüband-Anpassungen (Standard) — hier liegt die Ursache nicht (Add-ins prüfen).') }
else {
  foreach ($x in $dat) { Zeile ('Vorher: ' + $x.F.Name + ' · ' + (Groesse $x.F.Length) + ' · geändert ' + $x.F.LastWriteTime.ToString('dd.MM.yyyy HH:mm')) }
  StopUser @($dat | ForEach-Object { $proc[$_.App] } | Select-Object -Unique)
  $ziel = Join-Path $od ('officeUI.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
  New-Item -Path $ziel -ItemType Directory -Force | Out-Null
  foreach ($x in $dat) { Move-Item -LiteralPath $x.F.FullName -Destination $ziel -Force -EA Stop }
  Zeile ('Jetzt: Menüband und Symbolleiste für den Schnellzugriff starten mit dem Standard. Die alten Anpassungen liegen in ' + $ziel + ' — zurück: Datei wieder nach ' + $od + ' kopieren.')
}` }),
]
