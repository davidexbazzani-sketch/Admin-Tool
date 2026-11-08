// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „excel“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Excel-/Access-Einstellungen nur im Profil des ANGEMELDETEN Benutzers ($uHive/$uRoam) bzw. die lokale
// Einstellung des Access-Datenbankmoduls (HKLM) — nie Server, Richtlinien, Lizenzen oder VBA-Code.
// Excel schreibt seine Optionen beim Schließen zurück: Bausteine, die dort etwas ändern, verlangen ein
// geschlossenes Excel (statt es zu beenden und ungespeicherte Arbeit zu verlieren).

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Excel-Add-in-Einträge (OPEN, OPEN1 …) lesen und ihre Pfade aus Sicht des Benutzers bewerten. */
const XL_ADDIN = String.raw`
function AddinPfad([string]$w) { $x = ([string]$w).Trim(); while ($x -match '^/\w+\s+') { $x = ($x -replace '^/\w+\s+', '').Trim() }; return $x.Trim('"').Trim() }
function AddinDatei([string]$w) { return ((AddinPfad $w) -replace '^.*\\', '') }
function OpenEintraege([string]$k) {
  $it = Get-Item -LiteralPath $k -EA SilentlyContinue
  if (-not $it) { return @() }
  @($it.GetValueNames() | Where-Object { $_ -match '^OPEN\d*$' } | Sort-Object { [int]('0' + $_.Substring(4)) } | ForEach-Object { [pscustomobject]@{ N = [string]$_; W = [string]$it.GetValue($_) } })
}
function PfadZustand([string]$p) {
  if (-not $p) { return 'leer' }
  if ($p.StartsWith('\\')) { return 'Server-Pfad – von hier aus nicht prüfbar (der Benutzer muss den Ordner öffnen können)' }
  if ($p -notmatch '^[A-Za-z]:\\') {
    foreach ($s in @((Join-Path $uRoam 'Microsoft\AddIns'), 'C:\Program Files\Microsoft Office\root\Office16\Library', 'C:\Program Files (x86)\Microsoft Office\root\Office16\Library')) {
      $f = @(Get-ChildItem -LiteralPath $s -Recurse -Depth 3 -Force -File -Filter $p -EA SilentlyContinue | Select-Object -First 1)
      if ($f.Count) { return ('gefunden: ' + $f[0].FullName) }
    }
    return 'nur Dateiname – im Add-in- bzw. Library-Ordner NICHT gefunden'
  }
  $lw = $p.Substring(0, 1).ToUpper()
  $netz = [string](Get-ItemProperty -LiteralPath ($uHive + '\Network\' + $lw) -Name RemotePath -EA SilentlyContinue).RemotePath
  if ($netz) { return ('Netzlaufwerk ' + $lw + ': = ' + $netz + ' – von hier aus nicht prüfbar') }
  $lokal = @([IO.DriveInfo]::GetDrives() | Where-Object { $_.Name.Substring(0, 1) -ieq $lw -and ([string]$_.DriveType -in @('Fixed', 'Removable')) })
  if (-not $lokal.Count) { return ('Laufwerk ' + $lw + ': gibt es beim Benutzer nicht (altes Netzlaufwerk?) – DATEI NICHT ERREICHBAR') }
  if (Test-Path -LiteralPath $p) { return 'vorhanden' }
  return 'DATEI FEHLT'
}
`

/** Wert setzen und alt → neu ausgeben; Richtlinie melden. */
const XL_SETZE = String.raw`
function SetzeWert([string]$k, [string]$n, $v, [string]$typ, [string]$label) {
  if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
  $alt = (Get-ItemProperty -LiteralPath $k -Name $n -EA SilentlyContinue).$n
  Set-ItemProperty -LiteralPath $k -Name $n -Value $v -Type $typ -EA Stop
  Zeile ($label + ': vorher ' + $(if ($null -eq $alt) { 'nicht gesetzt (Standard)' } else { [string]$alt }) + ' → jetzt ' + [string]$v)
}
function Richtlinie([string]$teil, [string]$n) {
  $w = (Get-ItemProperty -LiteralPath ($uHive + '\Software\Policies\Microsoft\Office\16.0\' + $teil) -Name $n -EA SilentlyContinue).$n
  if ($null -ne $w) { Zeile ('Hinweis: Eine Richtlinie setzt ' + $n + ' = ' + $w + ' — sie hat Vorrang vor dieser Einstellung (zuständig: DXC).') }
}
`

const ODBC_LESEN = String.raw`
function Liste([string]$k) { $it = Get-Item -LiteralPath $k -EA SilentlyContinue; if ($it) { @($it.GetValueNames() | Where-Object { $_ } | Sort-Object) } else { @() } }
function Dsns([string]$basis, [string]$art, [string[]]$treiber) {
  $it = Get-Item -LiteralPath ($basis + '\ODBC Data Sources') -EA SilentlyContinue
  if (-not $it) { return 0 }
  $n = 0
  foreach ($name in @($it.GetValueNames() | Where-Object { $_ })) {
    $n++
    $tr = [string]$it.GetValue($name)
    $d = Get-ItemProperty -LiteralPath ($basis + '\' + $name) -EA SilentlyContinue
    $ziel = @()
    foreach ($f in 'Server', 'Database', 'DBQ', 'Encrypt', 'TrustServerCertificate', 'Trusted_Connection') { if ($d -and [string]$d.$f) { $ziel += ($f + '=' + [string]$d.$f) } }
    $fehlt = ''
    if ($treiber.Count -and ($treiber -notcontains $tr)) { $fehlt = ' · TREIBER FEHLT in dieser Bitversion' }
    Zeile ('  ' + $art + ': ' + $name + ' → ' + $tr + $(if ($ziel.Count) { ' (' + ($ziel -join ', ') + ')' } else { '' }) + $fehlt)
  }
  return $n
}
`

export const AKTIONEN_EXCEL4: PaAktion[] = [
  // ══ Excel: Einstellungen und Add-ins ═════════════════════════════════════════
  A({ id: 'excel-option', titel: 'Excel-Einstellung des Benutzers setzen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Setzt eine einzelne Excel-Einstellung in der Registry des angemeldeten Benutzers und zeigt alten und neuen Wert: Registerkarte „Entwicklertools“ einblenden, Startbildschirm aus (gleich leere Mappe), Office-Animationen aus (Zellcursor gleitet nicht mehr nach), zusätzlichen Startordner („Beim Start alle Dateien öffnen in“) entfernen, externe Datenverbindungen und Verknüpfungen wieder auf „nachfragen“ (Standard) oder neue Mappen wieder als .xlsx speichern. Excel muss dafür geschlossen sein; eine Richtlinie hat Vorrang und wird gemeldet.',
    param: { label: 'Einstellung', platzhalter: 'Entwicklertools anzeigen', pflicht: true, optionen: ['Entwicklertools anzeigen', 'Startbildschirm aus', 'Animationen aus', 'Zusätzlichen Startordner entfernen', 'Externe Daten und Verknüpfungen: nachfragen', 'Standardformat .xlsx'] },
    ps: XL_SETZE + String.raw`
NeedHive
$wahl = @('Entwicklertools anzeigen', 'Startbildschirm aus', 'Animationen aus', 'Zusätzlichen Startordner entfernen', 'Externe Daten und Verknüpfungen: nachfragen', 'Standardformat .xlsx') | Where-Object { $_ -ieq $P.Trim() } | Select-Object -First 1
if (-not $wahl) { throw 'Bitte eine der Auswahlen nehmen (z. B. „Entwicklertools anzeigen“).' }
$b = $uHive + '\Software\Microsoft\Office\16.0'
if ($wahl -ne 'Animationen aus' -and @(UserProcs @('EXCEL')).Count) { throw 'Excel ist beim Benutzer geöffnet und würde die Einstellung beim Schließen wieder überschreiben. Bitte Excel schließen lassen (oder vorher „Programm des Benutzers beenden“ mit EXCEL) und den Schritt wiederholen.' }
switch ($wahl) {
  'Entwicklertools anzeigen' { SetzeWert ($b + '\Excel\Options') 'DeveloperTools' 1 'DWord' 'Registerkarte „Entwicklertools“ (1 = sichtbar)'; Richtlinie 'Excel\Options' 'DeveloperTools' }
  'Startbildschirm aus' { SetzeWert ($b + '\Excel\Options') 'DisableBootToOfficeStart' 1 'DWord' 'Startbildschirm überspringen (1 = gleich leere Mappe)'; Richtlinie 'Excel\Options' 'DisableBootToOfficeStart' }
  'Animationen aus' { SetzeWert ($b + '\Common\Graphics') 'DisableAnimations' 1 'DWord' 'Office-Animationen (1 = aus, Zellcursor springt direkt)'; Richtlinie 'Common\Graphics' 'DisableAnimations' }
  'Zusätzlichen Startordner entfernen' {
    $k = $b + '\Excel\Options'
    $alt = [string](Get-ItemProperty -LiteralPath $k -Name AltStartup -EA SilentlyContinue).AltStartup
    if (-not $alt) { Zeile 'Vorher: kein zusätzlicher Startordner eingetragen — hier liegt die Ursache nicht.' }
    else {
      Remove-ItemProperty -LiteralPath $k -Name AltStartup -EA Stop
      Zeile ('Vorher: „Beim Start alle Dateien öffnen in“ = ' + $alt + ' → jetzt leer (Excel öffnet nur noch XLSTART). Zurück: Datei → Optionen → Erweitert → Allgemein.')
    }
    Richtlinie 'Excel\Options' 'AltStartup'
  }
  'Externe Daten und Verknüpfungen: nachfragen' {
    $k = $b + '\Excel\Security'
    SetzeWert $k 'DataConnectionWarnings' 2 'DWord' 'Externe Datenverbindungen (1 = immer, 2 = nachfragen, 3 = gesperrt)'
    SetzeWert $k 'WorkbookLinkWarnings' 2 'DWord' 'Verknüpfungen zu anderen Arbeitsmappen (1 = immer, 2 = nachfragen, 3 = gesperrt)'
    Richtlinie 'Excel\Security' 'DataConnectionWarnings'; Richtlinie 'Excel\Security' 'WorkbookLinkWarnings'
  }
  'Standardformat .xlsx' { SetzeWert ($b + '\Excel\Options') 'DefaultFormat' 51 'DWord' 'Standard-Dateiformat (51 = .xlsx, 52 = .xlsm, 50 = .xlsb, 56 = .xls, 6 = CSV)'; Richtlinie 'Excel\Options' 'DefaultFormat' }
}
Zeile $(if ($wahl -eq 'Animationen aus') { 'Wirkt nach dem Neustart von Excel, Word, PowerPoint und Outlook.' } else { 'Wirkt beim nächsten Start von Excel.' })` }),

  A({ id: 'excel-addins-uebersicht', titel: 'Excel-Add-ins und Startdateien anzeigen (.xlam/.xll, XLSTART, Startordner)', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Zeigt, was Excel beim Start des Benutzers lädt: eingetragene Excel-Add-ins (.xlam/.xla/.xll) mit Pfad und ob die Datei noch da ist (auch altes Netzlaufwerk/Server), nicht angehakte Add-ins, COM-Add-ins mit Ladeverhalten, von Excel nach Abstürzen abgeschaltete Elemente, den Startordner XLSTART samt PERSONAL.XLSB und einen zusätzlichen Startordner. Ändert nichts.',
    ps: XL_ADDIN + String.raw`
NeedHive
$o = $uHive + '\Software\Microsoft\Office\16.0\Excel\Options'
Zeile ('Excel läuft gerade: ' + (Ja (@(UserProcs @('EXCEL')).Count -gt 0)))
$eintr = @(OpenEintraege $o)
Zeile ('Eingetragene Excel-Add-ins (Optionen → Add-Ins → Excel-Add-Ins): ' + $eintr.Count)
foreach ($e in $eintr) { $p = AddinPfad $e.W; Zeile ('  ' + $e.N + ': ' + $p + ' · ' + (PfadZustand $p)) }
$mg = Get-Item -LiteralPath ($uHive + '\Software\Microsoft\Office\16.0\Excel\Add-in Manager') -EA SilentlyContinue
if ($mg) { $l = @($mg.GetValueNames() | Where-Object { $_ }); if ($l.Count) { Zeile ('Bekannt, aber nicht angehakt: ' + $l.Count + ' · ' + ((@($l | Select-Object -First 8 | ForEach-Object { $_ -replace '^.*\\', '' })) -join ', ')) } }
$com = @()
foreach ($q in @(@{ L = 'Benutzer'; K = ($uHive + '\Software\Microsoft\Office\Excel\Addins') }, @{ L = 'Computer'; K = 'HKLM:\SOFTWARE\Microsoft\Office\Excel\Addins' }, @{ L = 'Computer 32-Bit'; K = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\Excel\Addins' }, @{ L = 'Office-Paket'; K = 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\REGISTRY\MACHINE\Software\Microsoft\Office\Excel\Addins' })) {
  foreach ($a in @(Get-ChildItem -LiteralPath $q.K -EA SilentlyContinue)) {
    $pp = Get-ItemProperty -LiteralPath $a.PSPath -EA SilentlyContinue
    $lb = $pp.LoadBehavior
    $z = $(switch ($lb) { 3 { 'lädt beim Start' } 2 { 'AUS' } 0 { 'AUS' } 9 { 'bei Bedarf' } 16 { 'beim ersten Start' } default { 'Ladeverhalten ' + $lb } })
    $com += ('  ' + $(if ($pp.FriendlyName) { [string]$pp.FriendlyName } else { $a.PSChildName }) + ' · ' + $z + ' (' + $q.L + ')')
  }
}
Zeile ('COM-Add-ins für Excel: ' + $com.Count)
foreach ($c in @($com | Select-Object -First 20)) { Zeile $c }
$dis = Get-Item -LiteralPath ($uHive + '\Software\Microsoft\Office\16.0\Excel\Resiliency\DisabledItems') -EA SilentlyContinue
if ($dis -and $dis.ValueCount) { Zeile ('Von Excel nach Abstürzen abgeschaltete Elemente: ' + $dis.ValueCount + ' (Baustein „Deaktivierte Add-ins in Word/Excel/PowerPoint einschalten“)') }
$xs = Join-Path $uRoam 'Microsoft\Excel\XLSTART'
$d = @(Get-ChildItem -LiteralPath $xs -Force -File -EA SilentlyContinue)
Zeile ('Persönlicher Startordner XLSTART: ' + $(if ($d.Count) { (@($d | ForEach-Object { $_.Name + ' (' + (Groesse $_.Length) + ', ' + $_.LastWriteTime.ToString('dd.MM.yyyy') + ')' }) -join ', ') } else { 'leer' }))
foreach ($m in 'C:\Program Files\Microsoft Office\root\Office16\XLSTART', 'C:\Program Files (x86)\Microsoft Office\root\Office16\XLSTART') { $n = @(Get-ChildItem -LiteralPath $m -Force -File -EA SilentlyContinue); if ($n.Count) { Zeile ('Startordner für alle Benutzer: ' + (@($n | ForEach-Object { $_.Name }) -join ', ')) } }
$alt = [string](Get-ItemProperty -LiteralPath $o -Name AltStartup -EA SilentlyContinue).AltStartup
if ($alt) { Zeile ('Zusätzlicher Startordner („Beim Start alle Dateien öffnen in“): ' + $alt + ' · ' + (PfadZustand $alt)) } else { Zeile 'Zusätzlicher Startordner: keiner' }
$ad = Join-Path $uRoam 'Microsoft\AddIns'
$af = @(Get-ChildItem -LiteralPath $ad -Force -File -EA SilentlyContinue | Where-Object { $_.Extension -match '^\.(xlam|xla|xll)$' })
if ($af.Count) { Zeile ('Add-in-Dateien im persönlichen Add-in-Ordner: ' + (@($af | ForEach-Object { $_.Name }) -join ', ')) }` }),

  A({ id: 'excel-addin-austragen', titel: 'Excel-Add-in (.xlam/.xla/.xll) austragen – wie Haken im Add-in-Dialog entfernen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Trägt ein Excel-Add-in, das bei jedem Start geladen wird (Eintrag OPEN…), für den Benutzer aus — z. B. wenn die Datei auf einem alten Server/Laufwerk lag („… konnte nicht gefunden werden“) oder Excel beim Start abstürzt. Die übrigen Add-ins bleiben in ihrer Reihenfolge, alle alten Einträge werden vorher angezeigt; das Add-in bleibt im Add-in-Dialog als nicht angehakt stehen. Excel muss geschlossen sein. COM-Add-ins: Baustein „Office-Add-in abschalten“.',
    param: { label: 'Dateiname des Add-ins', platzhalter: 'Abteilung.xlam', pflicht: true },
    ps: XL_ADDIN + String.raw`
NeedHive
$n = ([string]$P).Trim().Trim('"')
if ($n -match '[\\/:*?"<>|]' -or $n -notmatch '^.{1,120}\.(xlam|xla|xll)$') { throw 'Bitte nur den Dateinamen des Add-ins angeben, z. B. „Abteilung.xlam“ oder „Tool.xll“ (steht im Baustein „Excel-Add-ins und Startdateien anzeigen“).' }
$o = $uHive + '\Software\Microsoft\Office\16.0\Excel\Options'
$eintr = @(OpenEintraege $o)
if (-not $eintr.Count) { throw 'Für diesen Benutzer ist kein Excel-Add-in eingetragen (keine OPEN-Einträge) — die Ursache liegt woanders (COM-Add-in, XLSTART).' }
foreach ($e in $eintr) { Zeile ('Vorher: ' + $e.N + ' = ' + $e.W) }
$treffer = @($eintr | Where-Object { (AddinDatei $_.W) -ieq $n })
if (-not $treffer.Count) { throw ('Kein eingetragenes Excel-Add-in heißt „' + $n + '“ — bitte den Dateinamen aus der Liste oben nehmen.') }
if (@(UserProcs @('EXCEL')).Count) { throw 'Excel ist beim Benutzer noch geöffnet und würde die Add-in-Liste beim Schließen zurückschreiben. Bitte Excel schließen lassen (oder vorher „Programm des Benutzers beenden“ mit EXCEL) und den Schritt wiederholen.' }
$rest = @($eintr | Where-Object { (AddinDatei $_.W) -ine $n })
$neu = @()
for ($i = 0; $i -lt $rest.Count; $i++) {
  $name = $(if ($i -eq 0) { 'OPEN' } else { 'OPEN' + $i })
  Set-ItemProperty -LiteralPath $o -Name $name -Value $rest[$i].W -Type String -EA Stop
  $neu += $name
}
foreach ($e in $eintr) { if ($neu -notcontains $e.N) { Remove-ItemProperty -LiteralPath $o -Name $e.N -EA Stop } }
$mg = $uHive + '\Software\Microsoft\Office\16.0\Excel\Add-in Manager'
foreach ($t in $treffer) {
  $p = AddinPfad $t.W
  if ($p -match '\\') { try { if (-not (Test-Path -LiteralPath $mg)) { New-Item -Path $mg -Force | Out-Null }; Set-ItemProperty -LiteralPath $mg -Name $p -Value '' -Type String -EA Stop } catch {} }
}
Zeile ('Jetzt: ' + $n + ' ausgetragen — Excel lädt es beim nächsten Start nicht mehr. Weiter aktiv: ' + $(if ($rest.Count) { (@($rest | ForEach-Object { AddinDatei $_.W }) -join ', ') } else { 'keine Excel-Add-ins' }))
Zeile 'Rückgängig: Excel → Datei → Optionen → Add-Ins → Verwalten „Excel-Add-Ins“ → Gehe zu … → wieder anhaken bzw. über „Durchsuchen“ vom neuen Ort einbinden.'` }),

  // ══ Datenbanken: ODBC, Access-Datenbankmodul ══════════════════════════════════
  A({ id: 'excel-odbc-uebersicht', titel: 'ODBC-Treiber, Datenquellen (DSN) und Access-Datenbankmodul anzeigen (32/64 Bit)', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Zeigt die Bitversion von Office, alle ODBC-Treiber getrennt nach 64 und 32 Bit (auch die nur für Office sichtbaren Treiber des Klick-und-Los-Pakets), System- und Benutzer-Datenquellen (DSN) mit Server/Datenbank und ob ihr Treiber in dieser Bitversion fehlt, den Access-OLE-DB-Provider (ACE 12.0/16.0) sowie installierte Treiberpakete (Access Database Engine/Runtime, ODBC Driver für SQL Server …). Ändert nichts.',
    ps: ODBC_LESEN + String.raw`
NeedHive
$c2r = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration' -EA SilentlyContinue
if ($c2r) { Zeile ('Office: Microsoft 365 ' + $(if ([string]$c2r.Platform -eq 'x86') { '32-Bit' } else { '64-Bit' }) + ' · Version ' + [string]$c2r.VersionToReport + ' — Treiber und Datenquellen müssen zu dieser Bitversion passen') }
else { Zeile 'Office: kein Microsoft 365 (Klick-und-Los) gefunden' }
$acc = @('C:\Program Files\Microsoft Office\root\Office16\MSACCESS.EXE', 'C:\Program Files (x86)\Microsoft Office\root\Office16\MSACCESS.EXE') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
Zeile ('Access (Vollversion oder Runtime) im Office-Paket: ' + $(if ($acc) { 'ja (' + $acc + ')' } else { 'nein' }))
$t64 = @(Liste 'HKLM:\SOFTWARE\ODBC\ODBCINST.INI\ODBC Drivers')
$t32 = @(Liste 'HKLM:\SOFTWARE\WOW6432Node\ODBC\ODBCINST.INI\ODBC Drivers')
$tc = @(@(Liste 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\REGISTRY\MACHINE\Software\ODBC\ODBCINST.INI\ODBC Drivers') + @(Liste 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\REGISTRY\MACHINE\Software\Wow6432Node\ODBC\ODBCINST.INI\ODBC Drivers') | Select-Object -Unique)
Zeile ('ODBC-Treiber 64-Bit (' + $t64.Count + '): ' + $(if ($t64.Count) { $t64 -join ' · ' } else { 'keine' }))
Zeile ('ODBC-Treiber 32-Bit (' + $t32.Count + '): ' + $(if ($t32.Count) { $t32 -join ' · ' } else { 'keine' }))
if ($tc.Count) { Zeile ('Nur für Office-Programme sichtbar (Klick-und-Los, nicht im ODBC-Administrator): ' + ($tc -join ' · ')) }
Zeile 'Datenquellen (DSN):'
$z = 0
$z += Dsns 'HKLM:\SOFTWARE\ODBC\ODBC.INI' 'System 64-Bit' (@($t64) + @($tc))
$z += Dsns 'HKLM:\SOFTWARE\WOW6432Node\ODBC\ODBC.INI' 'System 32-Bit' (@($t32) + @($tc))
$z += Dsns ($uHive + '\Software\ODBC\ODBC.INI') 'Benutzer' (@($t64) + @($t32) + @($tc))
if (-not $z) { Zeile '  keine eingerichtet' }
foreach ($prog in 'Microsoft.ACE.OLEDB.12.0', 'Microsoft.ACE.OLEDB.16.0') {
  $ck = Get-Item -LiteralPath ('HKLM:\SOFTWARE\Classes\' + $prog + '\CLSID') -EA SilentlyContinue
  $cc = Get-Item -LiteralPath ('HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\REGISTRY\MACHINE\Software\Classes\' + $prog + '\CLSID') -EA SilentlyContinue
  $clsid = $null
  if ($ck) { $clsid = [string]$ck.GetValue('') } elseif ($cc) { $clsid = [string]$cc.GetValue('') }
  if (-not $clsid) { Zeile ($prog + ': nicht registriert'); continue }
  $wo = @()
  if (Test-Path -LiteralPath ('HKLM:\SOFTWARE\Classes\CLSID\' + $clsid + '\InprocServer32')) { $wo += '64-Bit' }
  if (Test-Path -LiteralPath ('HKLM:\SOFTWARE\WOW6432Node\Classes\CLSID\' + $clsid + '\InprocServer32')) { $wo += '32-Bit' }
  if ((Test-Path -LiteralPath ('HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\REGISTRY\MACHINE\Software\Classes\CLSID\' + $clsid + '\InprocServer32')) -or (Test-Path -LiteralPath ('HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\REGISTRY\MACHINE\Software\Classes\Wow6432Node\CLSID\' + $clsid + '\InprocServer32'))) { $wo += 'im Office-Paket (nur für Office-Programme)' }
  Zeile ($prog + ': ' + $(if ($wo.Count) { $wo -join ', ' } else { 'registriert, aber ohne Programmdatei' }))
}
$uk = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
$sw = @(Get-ItemProperty -Path $uk -EA SilentlyContinue | Where-Object { [string]$_.DisplayName -match 'Access database engine|Access Runtime|ODBC Driver \d+ for SQL Server|OLE DB Driver|MySQL Connector/ODBC|psqlODBC|Oracle.*(Client|ODBC)' } | ForEach-Object { [string]$_.DisplayName + ' ' + [string]$_.DisplayVersion + $(if ([string]$_.PSPath -match 'WOW6432Node') { ' (32-Bit)' } else { '' }) } | Select-Object -Unique)
Zeile ('Installierte Datenbank-Treiberpakete: ' + $(if ($sw.Count) { $sw -join ' · ' } else { 'keine zusätzlichen (nur die in Windows bzw. Office enthaltenen)' }))` }),

  A({ id: 'excel-access-sperrgrenze', titel: 'Access: Höchstzahl der Datensatzsperren erhöhen (MaxLocksPerFile, Fehler 3052)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Erhöht im Access-Datenbankmodul (ACE) dieses PCs die Grenze „MaxLocksPerFile“ (Standard 9500) — gegen „Anzahl der Dateisperren überschritten“ (Fehler 3052) bei großen Aktualisierungs-, Lösch- oder Anfügeabfragen in Access sowie bei Excel-/Access-Datenverbindungen auf große Tabellen. Setzt den Wert in jedem vorhandenen ACE-Zweig (Office-Paket und Access Database Engine, 32 und 64 Bit) und zeigt alt → neu. Wirkt beim nächsten Start von Access.',
    param: { label: 'Höchstzahl Sperren', platzhalter: '500000', pflicht: true, optionen: ['100000', '500000', 'Standard (9500)'] },
    ps: String.raw`
$wahl = @('100000', '500000', 'Standard (9500)') | Where-Object { $_ -ieq $P.Trim() } | Select-Object -First 1
if (-not $wahl) { throw 'Bitte 100000, 500000 oder „Standard (9500)“ wählen.' }
$wert = $(if ($wahl -like 'Standard*') { 9500 } else { [int]$wahl })
$orte = @(
  'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\REGISTRY\MACHINE\Software\Microsoft\Office\16.0\Access Connectivity Engine\Engines\ACE',
  'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\REGISTRY\MACHINE\Software\Wow6432Node\Microsoft\Office\16.0\Access Connectivity Engine\Engines\ACE',
  'HKLM:\SOFTWARE\Microsoft\Office\16.0\Access Connectivity Engine\Engines\ACE',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\16.0\Access Connectivity Engine\Engines\ACE',
  'HKLM:\SOFTWARE\Microsoft\Office\14.0\Access Connectivity Engine\Engines\ACE',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\14.0\Access Connectivity Engine\Engines\ACE'
)
$n = 0
foreach ($k in $orte) {
  if (-not (Test-Path -LiteralPath $k)) { continue }
  $alt = (Get-ItemProperty -LiteralPath $k -Name MaxLocksPerFile -EA SilentlyContinue).MaxLocksPerFile
  Set-ItemProperty -LiteralPath $k -Name MaxLocksPerFile -Value $wert -Type DWord -EA Stop
  $kurz = ($k -replace '^HKLM:\\SOFTWARE\\', '') -replace '\\Access Connectivity Engine\\Engines\\ACE$', ''
  Zeile ('MaxLocksPerFile in ' + $kurz + ': vorher ' + $(if ($null -eq $alt) { 'nicht gesetzt' } else { [string]$alt }) + ' → jetzt ' + $wert)
  $n++
}
if (-not $n) { throw 'Kein Access-Datenbankmodul (ACE) gefunden — Access bzw. die Access Database Engine ist auf diesem PC nicht installiert.' }
$acc = @(Get-Process -Name MSACCESS -EA SilentlyContinue).Count
Zeile ('Access läuft gerade: ' + (Ja ($acc -gt 0)) + ' — der neue Wert gilt ab dem nächsten Start von Access bzw. der Datenverbindung.')
Zeile 'Hinweis: Für ein einzelnes Makro geht es auch ohne Registry per VBA: DBEngine.SetOption dbMaxLocksPerFile, 500000.'` }),
]
