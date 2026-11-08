// ── Problem-Assistent: Lösungsbausteine Gruppe „office“ (Runde 3) ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Alle Bausteine wirken nur auf Profil/Registry des ANGEMELDETEN Benutzers ($uProf/$uRoam/$uLocal/$uHive)
// — nie auf Server-Freigaben, Richtlinien, Lizenzen oder die Office-Installation anderer Benutzer.
// Benutzerdaten werden umbenannt/verschoben (*.alt_…), nie gelöscht; geleert werden nur echte Caches.

import type { PaAktion } from '../motor'
import { OFFICE_APPS } from './gemeinsam'

const A = (a: PaAktion): PaAktion => a

/** Registry-Werte des Benutzers OHNE Auflösen mit der Admin-Umgebung lesen und %APPDATA% & Co. auf SEIN Profil abbilden. */
const PFAD_USER = String.raw`
function RegRoh([string]$k, [string]$n) { try { $x = Get-Item -LiteralPath $k -EA Stop; return $x.GetValue($n, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } catch { return $null } }
function PfadUser([string]$p) {
  if (-not $p) { return $null }
  $p = $p -replace '(?i)%APPDATA%', $uRoam.Replace('$', '$$') -replace '(?i)%LOCALAPPDATA%', $uLocal.Replace('$', '$$') -replace '(?i)%USERPROFILE%', $uProf.Replace('$', '$$')
  return $p
}
function ShellOrdner([string]$n) { PfadUser ([string](RegRoh ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') $n)) }
`

/** Wo Office automatisch gesicherte bzw. nie gespeicherte Fassungen ablegt (nur lesen). */
const WIEDER_PS = String.raw`
function WiederKandidaten([int]$tage) {
  $seit = (Get-Date).AddDays(-$tage)
  $wo = @(
    @{ Q = 'Word (AutoWiederherstellen)'; P = (Join-Path $uRoam 'Microsoft\Word'); F = '\.(asd|wbk|docx?|docm|tmp)$'; R = $true },
    @{ Q = 'Excel (AutoWiederherstellen)'; P = (Join-Path $uRoam 'Microsoft\Excel'); F = '\.(xlsb|xar|xlsx|xlsm|xls)$'; R = $true },
    @{ Q = 'PowerPoint (AutoWiederherstellen)'; P = (Join-Path $uRoam 'Microsoft\PowerPoint'); F = '\.(pptx?|pptm)$'; R = $true },
    @{ Q = 'Nie gespeicherte Dateien'; P = (Join-Path $uLocal 'Microsoft\Office\UnsavedFiles'); F = '.'; R = $true },
    @{ Q = 'Bearbeitete Outlook-Anhänge'; P = (Join-Path $uLocal 'Microsoft\Windows\INetCache\Content.Outlook'); F = '\.(docx?|docm|xlsx?|xlsm|xlsb|pptx?|pdf|csv|txt|vsdx?)$'; R = $true },
    @{ Q = 'Temp (Word-Zwischenstände)'; P = (Join-Path $uLocal 'Temp'); F = '^(~wr[ld]\d+\.tmp|.+\.(asd|wbk))$'; R = $false }
  )
  $wp = PfadUser ([string](RegRoh ($uHive + '\Software\Microsoft\Office\16.0\Word\Options') 'AUTOSAVE-PATH'))
  if ($wp -and -not $wp.StartsWith('\\')) { $wo += @{ Q = 'Word (eigener AutoWiederherstellen-Ordner)'; P = $wp; F = '\.(asd|wbk|docx?)$'; R = $false } }
  $ep = PfadUser ([string](RegRoh ($uHive + '\Software\Microsoft\Office\16.0\Excel\Options') 'AutoRecoverPath'))
  if ($ep -and -not $ep.StartsWith('\\')) { $wo += @{ Q = 'Excel (eigener AutoWiederherstellen-Ordner)'; P = $ep; F = '\.(xlsb|xar|xlsx)$'; R = $true } }
  $q = @()
  foreach ($w in $wo) {
    if (-not $w.P -or -not (Test-Path -LiteralPath $w.P)) { continue }
    $gci = @{ LiteralPath = $w.P; Force = $true; File = $true; ErrorAction = 'SilentlyContinue' }
    if ($w.R) { $gci.Recurse = $true }
    foreach ($f in @(Get-ChildItem @gci)) {
      if ($f.LastWriteTime -lt $seit -or $f.Length -lt 1) { continue }
      if ($f.FullName -match '\\(XLSTART|STARTUP|Templates)\\') { continue }
      if ($f.Name -notmatch $w.F) { continue }
      $q += [pscustomobject]@{ Quelle = $w.Q; Datei = $f }
    }
  }
  @($q | Sort-Object { $_.Datei.LastWriteTime } -Descending)
}
function TageAusP {
  $t = 7
  if ($P -and $P.Trim()) {
    if ($P.Trim() -notmatch '^\d{1,2}$') { throw 'Bitte die Anzahl Tage als Zahl angeben (1–60).' }
    $t = [int]$P.Trim()
    if ($t -lt 1 -or $t -gt 60) { throw 'Bitte 1 bis 60 Tage angeben.' }
  }
  return $t
}
`

export const AKTIONEN_OFFICE: PaAktion[] = [
  // ══ Word / Excel / PowerPoint: Vorlagen, Startordner, Einstellungen ══════════
  A({ id: 'office-normal-dotm', titel: 'Word-Vorlage Normal.dotm zurücksetzen', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Beendet Word und benennt die persönliche Vorlage Normal.dotm um (Sicherung *.alt_…) — Word legt beim nächsten Start eine saubere an. Hilft bei Startabstürzen, „Normal.dotm kann nicht geöffnet werden“, falscher Standardschrift und der ständigen Frage nach dem Speichern von Normal.dotm. Eigene Formatvorlagen/Schnellbausteine stecken danach in der Sicherung.',
    ps: PFAD_USER + String.raw`
NeedHive
$ordner = $null
foreach ($k in @(($uHive + '\Software\Microsoft\Office\16.0\Word\Options'), ($uHive + '\Software\Microsoft\Office\16.0\Common\General'))) {
  if (-not $ordner) { $v = RegRoh $k 'UserTemplates'; if ($v) { $ordner = PfadUser ([string]$v) } }
}
if ($ordner -and $ordner.StartsWith('\\')) { throw ('Die persönlichen Vorlagen liegen auf einem Server (' + $ordner + ') — dort ändert das Tool nichts. Bitte DXC bzw. die Fachabteilung einbinden.') }
if (-not $ordner -or -not (Test-Path -LiteralPath $ordner)) { $ordner = Join-Path $uRoam 'Microsoft\Templates' }
$f = Join-Path $ordner 'Normal.dotm'
if (Test-Path -LiteralPath $f) {
  $fi = Get-Item -LiteralPath $f -Force
  Zeile ('Vorher: ' + $f + ' · ' + (Groesse $fi.Length) + ' · zuletzt geändert ' + $fi.LastWriteTime.ToString('dd.MM.yyyy HH:mm') + $(if ($fi.IsReadOnly) { ' · SCHREIBGESCHÜTZT (Word kann sie nicht speichern)' } else { '' }))
}
StopUser @('WINWORD')
if (RenameAlt $f 'Normal.dotm') { Zeile 'Jetzt: Word legt beim nächsten Start eine neue Normal.dotm an. Eigene Formatvorlagen lassen sich aus der Sicherung über Entwicklertools → Dokumentvorlage → Organisator zurückholen.' }
else { Zeile 'Jetzt: Es gab keine Normal.dotm — Word legt sie beim Start selbst an; die Ursache liegt woanders (Add-in, Installation).' }` }),
  A({ id: 'office-app-optionen-reset', titel: 'Einstellungen von Word, Excel oder PowerPoint zurücksetzen', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Beendet das Programm und sichert seine Optionen in der Registry (Options, bei Word zusätzlich Data → *.alt_…); beim nächsten Start gelten die Standardeinstellungen. Gegen verstellte Ansichten (Z1S1, fehlende Bearbeitungsleiste/Blattregister, Formatierungszeichen, Lesemodus, Überschreibmodus), Punkt statt Komma und unerklärliches Verhalten. Excel-Add-ins (.xlam) bleiben eingetragen.',
    param: { label: 'Programm', platzhalter: 'Excel', pflicht: true, optionen: ['Word', 'Excel', 'PowerPoint'] },
    ps: String.raw`
NeedHive
if ($P.Trim() -notin @('Word', 'Excel', 'PowerPoint')) { throw 'Bitte Word, Excel oder PowerPoint wählen.' }
$app = @{ word = 'Word'; excel = 'Excel'; powerpoint = 'PowerPoint' }[$P.Trim().ToLower()]
$proc = @{ Word = 'WINWORD'; Excel = 'EXCEL'; PowerPoint = 'POWERPNT' }[$app]
$basis = $uHive + '\Software\Microsoft\Office\16.0\' + $app
$teile = @('Options'); if ($app -eq 'Word') { $teile += 'Data' }
$addins = @()
if ($app -eq 'Excel') {
  $o = Get-Item -LiteralPath ($basis + '\Options') -EA SilentlyContinue
  if ($o) { foreach ($n in @($o.GetValueNames() | Where-Object { $_ -match '^OPEN\d*$' })) { $addins += [pscustomobject]@{ N = $n; W = [string]$o.GetValue($n) } } }
}
StopUser @($proc)
$st = Get-Date -Format 'yyyyMMdd_HHmmss'
foreach ($t in $teile) {
  $k = $basis + '\' + $t
  if (Test-Path $k) {
    $n = (Get-Item $k).ValueCount
    Rename-Item -Path $k -NewName ($t + '.alt_' + $st) -Force -EA Stop
    Zeile ('Vorher: ' + $app + '\' + $t + ' mit ' + $n + ' eigenen Einstellungen · jetzt gesichert als ' + $t + '.alt_' + $st + ' (Standard beim nächsten Start)')
  } else { Zeile ('' + $app + '\' + $t + ': keine eigenen Einstellungen (schon Standard)') }
}
if ($addins.Count) {
  $k = $basis + '\Options'
  if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
  foreach ($a in $addins) { Set-ItemProperty -Path $k -Name $a.N -Value $a.W -Type String }
  Zeile ('Excel-Add-ins wieder eingetragen: ' + ((@($addins | ForEach-Object { ($_.W -replace '^.*\\', '').Trim('"') })) -join ', '))
}
Zeile ('' + $app + ' jetzt neu starten. Rückgängig: Schlüssel *.alt_' + $st + ' wieder auf den alten Namen umbenennen.')` }),
  A({ id: 'office-xlstart-sichern', titel: 'Excel-Startordner (XLSTART) aufräumen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet Excel und verschiebt die Dateien aus dem persönlichen Excel-Startordner XLSTART in einen Sicherungsordner (XLSTART.alt_…) — gegen Fehlermeldungen, zusätzliche Mappen und langsamen Start. Die persönliche Makroarbeitsmappe PERSONAL.XLSB bleibt, außer „Alles“ wird gewählt.',
    param: { label: 'Was verschieben', platzhalter: 'Ohne PERSONAL.XLSB', optionen: ['Ohne PERSONAL.XLSB', 'Alles'] },
    ps: String.raw`
NeedHive
$alles = $false
if ($P -and $P.Trim()) { if ($P.Trim() -notin @('Ohne PERSONAL.XLSB', 'Alles')) { throw 'Bitte „Ohne PERSONAL.XLSB“ oder „Alles“ wählen.' }; $alles = ($P.Trim() -eq 'Alles') }
$xs = Join-Path $uRoam 'Microsoft\Excel\XLSTART'
$alt = (Get-ItemProperty -Path ($uHive + '\Software\Microsoft\Office\16.0\Excel\Options') -Name AltStartup -EA SilentlyContinue).AltStartup
if ($alt) { Zeile ('Zusätzlicher Startordner laut Excel-Optionen: ' + $alt + ' (wird nicht verändert)') }
foreach ($m in 'C:\Program Files\Microsoft Office\root\Office16\XLSTART', 'C:\Program Files (x86)\Microsoft Office\root\Office16\XLSTART') { $n = @(Get-ChildItem -LiteralPath $m -Force -File -EA SilentlyContinue).Count; if ($n) { Zeile ('Startordner für alle Benutzer ' + $m + ': ' + $n + ' Datei(en) (wird nicht verändert)') } }
$dat = @(Get-ChildItem -LiteralPath $xs -Force -File -EA SilentlyContinue)
if (-not $dat.Count) { Zeile 'Vorher: XLSTART des Benutzers ist leer bzw. nicht vorhanden — hier liegt die Ursache nicht.' }
else {
  foreach ($d in $dat) { Zeile ('Vorher: ' + $d.Name + ' · ' + (Groesse $d.Length) + ' · geändert ' + $d.LastWriteTime.ToString('dd.MM.yyyy')) }
  $weg = @($dat | Where-Object { $alles -or ($_.Name -ne 'PERSONAL.XLSB') })
  if ($weg.Count) {
    StopUser @('EXCEL')
    $ziel = Join-Path $uRoam ('Microsoft\Excel\XLSTART.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
    New-Item -Path $ziel -ItemType Directory -Force | Out-Null
    foreach ($d in $weg) { Move-Item -LiteralPath $d.FullName -Destination $ziel -Force -EA Stop }
    Zeile ('Jetzt: ' + $weg.Count + ' Datei(en) verschoben nach ' + $ziel + ' — Excel startet ohne sie. Zurück: Dateien wieder nach XLSTART schieben.')
  } else { Zeile 'Jetzt: Es liegt nur PERSONAL.XLSB im Startordner — sie bleibt (mit „Alles“ wird auch sie verschoben).' }
}` }),
  A({ id: 'office-grafikbeschleunigung-aus', titel: 'Hardware-Grafikbeschleunigung in Office abschalten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Schaltet die Hardware-Grafikbeschleunigung von Word, Excel, PowerPoint und Outlook für den Benutzer ab (Common\Graphics\DisableHardwareAcceleration) — gegen Flackern, schwarze Flächen, verzögertes Tippen/Scrollen und ruckelnde Animationen mit schwierigen Grafiktreibern/Docks. Mit „einschalten“ wieder Standard.',
    param: { label: 'Beschleunigung', platzhalter: 'abschalten', optionen: ['abschalten', 'einschalten'] },
    ps: String.raw`
NeedHive
$an = $false
if ($P -and $P.Trim()) { if ($P.Trim() -notin @('abschalten', 'einschalten')) { throw 'Bitte „abschalten“ oder „einschalten“ wählen.' }; $an = ($P.Trim() -eq 'einschalten') }
$k = $uHive + '\Software\Microsoft\Office\16.0\Common\Graphics'
$vor = (Get-ItemProperty -Path $k -Name DisableHardwareAcceleration -EA SilentlyContinue).DisableHardwareAcceleration
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
Set-ItemProperty -Path $k -Name DisableHardwareAcceleration -Value $(if ($an) { 0 } else { 1 }) -Type DWord
Zeile ('Vorher: Hardwarebeschleunigung ' + $(if ($vor -eq 1) { 'AUS' } else { 'an (Standard)' }) + ' · jetzt: ' + $(if ($an) { 'an (Standard)' } else { 'AUS' }))
$pol = (Get-ItemProperty -Path ($uHive + '\Software\Policies\Microsoft\Office\16.0\Common\Graphics') -Name DisableHardwareAcceleration -EA SilentlyContinue).DisableHardwareAcceleration
if ($null -ne $pol) { Zeile ('Hinweis: Eine Richtlinie setzt den Wert auf ' + $pol + ' und hat Vorrang.') }
Zeile 'Wirkt nach dem Neustart von Word, Excel, PowerPoint und Outlook.'` }),
  A({ id: 'office-anzeigesprache', titel: 'Office-Anzeige- oder Bearbeitungssprache setzen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Stellt für den Benutzer die Sprache der Office-Oberfläche (Menüs, Funktionsnamen in Excel) bzw. die Standard-Bearbeitungssprache (Rechtschreibung, Datum, Anführungszeichen) um. Prüft, ob das Sprachpaket installiert ist. Wirkt nach dem Neustart der Office-Programme.',
    param: { label: 'Sprache', platzhalter: 'Anzeige Deutsch', pflicht: true, optionen: ['Anzeige Deutsch', 'Anzeige Englisch', 'Anzeige wie Windows', 'Bearbeitung Deutsch', 'Bearbeitung Englisch'] },
    ps: String.raw`
NeedHive
$wahl = @('Anzeige Deutsch', 'Anzeige Englisch', 'Anzeige wie Windows', 'Bearbeitung Deutsch', 'Bearbeitung Englisch') | Where-Object { $_ -ieq $P.Trim() } | Select-Object -First 1
if (-not $wahl) { throw 'Bitte eine der Auswahlen nehmen (z. B. „Anzeige Deutsch“).' }
$k = $uHive + '\Software\Microsoft\Office\16.0\Common\LanguageResources'
$alt = Get-ItemProperty -Path $k -EA SilentlyContinue
Zeile ('Vorher: Anzeige ' + $(if ($alt.UILanguageTag) { $alt.UILanguageTag } else { 'wie Windows' }) + ' · Bearbeitung ' + $(if ($alt.PreferredEditingLanguage) { $alt.PreferredEditingLanguage } else { 'Standard der Installation' }))
$root = @('C:\Program Files\Microsoft Office\root\Office16', 'C:\Program Files (x86)\Microsoft Office\root\Office16') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
if ($wahl -like 'Anzeige *') {
  if ($wahl -eq 'Anzeige wie Windows') {
    foreach ($n in 'UILanguageTag', 'HelpLanguageTag') { Remove-ItemProperty -Path $k -Name $n -EA SilentlyContinue }
    Set-ItemProperty -Path $k -Name FollowSystemUI -Value 'On' -Type String
    Zeile 'Jetzt: Office-Oberfläche folgt der Windows-Anzeigesprache.'
  } else {
    $tag = $(if ($wahl -eq 'Anzeige Deutsch') { 'de-de' } else { 'en-us' }); $lcid = $(if ($wahl -eq 'Anzeige Deutsch') { '1031' } else { '1033' })
    if ($root) { Zeile ('Sprachpaket ' + $tag + ' installiert: ' + (Ja (Test-Path -LiteralPath (Join-Path $root $lcid)))) }
    Set-ItemProperty -Path $k -Name UILanguageTag -Value $tag -Type String
    Set-ItemProperty -Path $k -Name HelpLanguageTag -Value $tag -Type String
    Set-ItemProperty -Path $k -Name FollowSystemUI -Value 'Off' -Type String
    Zeile ('Jetzt: Office-Oberfläche ' + $tag + ' (fehlt das Sprachpaket, bleibt Office bei der vorhandenen Sprache — Paket über DXC/Softwarecenter).')
  }
} else {
  $tag = $(if ($wahl -eq 'Bearbeitung Deutsch') { 'de-DE' } else { 'en-US' })
  Set-ItemProperty -Path $k -Name PreferredEditingLanguage -Value $tag -Type String
  Zeile ('Jetzt: Standard-Bearbeitungssprache ' + $tag + ' (gilt für neue Dokumente; vorhandenen Text unter Überprüfen → Sprache umstellen).')
}
$pol = Get-ItemProperty -Path ($uHive + '\Software\Policies\Microsoft\Office\16.0\Common\LanguageResources') -EA SilentlyContinue
if ($pol) { Zeile 'Hinweis: Eine Richtlinie gibt Office-Sprachen vor und kann die Einstellung überstimmen.' }
Zeile 'Office-Programme neu starten, damit es wirkt.'` }),

  // ══ Dateien: Sperrdateien, Wiederherstellung ═════════════════════════════════
  A({ id: 'office-sperrdatei', titel: 'Liegen gebliebene Office-Sperrdateien (~$…) freigeben', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Sucht in einem Ordner im Profil des Benutzers (Desktop, Dokumente, OneDrive …) liegen gebliebene Sperrdateien von Word/Excel/PowerPoint (~$…) und Access (.laccdb/.ldb) und benennt sie um — aber nur, wenn die zugehörige Datei gerade nicht geöffnet ist. Gegen „wird bereits verwendet / gesperrt von <eigener Name>“. Server-Freigaben werden nie verändert.',
    param: { label: 'Ordner im Benutzerprofil', platzhalter: 'Desktop', pflicht: true, vorlagen: ['Desktop', 'Documents', 'Downloads', 'OneDrive - SKF'] },
    timeoutMs: 120000,
    ps: PFAD_USER + String.raw`
NeedHive
$rel = ([string]$P).Trim().Trim('"').TrimEnd('\')
if (-not $rel) { throw 'Bitte einen Ordner angeben (z. B. Desktop).' }
if ($rel.StartsWith('\\')) { throw 'Server-Freigaben ändert das Tool nicht — bitte einen Ordner im Profil angeben (z. B. Desktop, Documents, OneDrive - SKF\Projekt). Offene Dateisitzungen auf Servern schließt DXC.' }
if ($rel -match '\.\.' -or $rel -match '[<>"|?*]') { throw 'Ungültiger Ordnername.' }
$ordner = $null
if ($rel -in @('Desktop', 'Dokumente', 'Documents')) { $ordner = ShellOrdner $(if ($rel -eq 'Desktop') { 'Desktop' } else { 'Personal' }) }
if (-not $ordner) {
  if ($rel -match '^[A-Za-z]:\\') {
    if (-not $rel.StartsWith($uProf, [StringComparison]::OrdinalIgnoreCase)) { throw ('Nur Ordner im Profil des angemeldeten Benutzers (' + $uProf + ').') }
    $ordner = $rel
  } elseif ($rel -match '^[\w\s\.\-\(\)&,+#@\\]{1,200}$') { $ordner = Join-Path $uProf $rel.TrimStart('\') }
  else { throw 'Ungültiger Ordnername — bitte z. B. „Desktop“ oder „OneDrive - SKF\Projekt“ angeben.' }
}
if ($ordner.StartsWith('\\')) { throw ('Der Ordner liegt auf einem Server (' + $ordner + ') — dort ändert das Tool nichts.') }
if (-not (Test-Path -LiteralPath $ordner -PathType Container)) { throw ('Ordner nicht gefunden: ' + $ordner) }
function InBenutzung([string]$p) { try { $s = [IO.File]::Open($p, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None); $s.Close(); return $false } catch { return $true } }
function Besitzer([string]$p) { try { $b = [IO.File]::ReadAllBytes($p); $n = [int]$b[0]; if ($n -gt 0 -and $n -lt 60 -and $b.Length -gt $n) { return ([Text.Encoding]::Default.GetString($b, 1, $n)).Trim() } } catch {}; return '' }
$liste = @()
foreach ($m in '~$*', '*.laccdb', '*.ldb') { $liste += @(Get-ChildItem -LiteralPath $ordner -Recurse -Depth 8 -Force -File -Filter $m -EA SilentlyContinue | Where-Object { $_.Name -notmatch '\.alt_\d{8}' }) }
$liste = @($liste | Select-Object -First 200)
Zeile ('Ordner: ' + $ordner + ' · gefundene Sperrdateien: ' + $liste.Count)
$apps = @(UserProcs @('WINWORD', 'EXCEL', 'POWERPNT', 'MSACCESS', 'VISIO', 'WINPROJ'))
Zeile ('Office-Programme des Benutzers offen: ' + $(if ($apps.Count) { ((@($apps | ForEach-Object { $_.ProcessName }) | Select-Object -Unique) -join ', ') } else { 'keine' }))
$st = Get-Date -Format 'yyyyMMdd_HHmmss'; $frei = 0; $bleibt = 0
foreach ($f in $liste) {
  $wer = Besitzer $f.FullName
  $anz = $f.FullName; if ($anz.StartsWith($uProf, [StringComparison]::OrdinalIgnoreCase)) { $anz = $anz.Substring($uProf.Length).TrimStart('\') }
  if ($f.Name.StartsWith('~$')) { $rest = $f.Name.Substring(2); $kand = @(Get-ChildItem -LiteralPath $f.DirectoryName -Force -File -EA SilentlyContinue | Where-Object { -not $_.Name.StartsWith('~$') -and (($_.Name -ieq $rest) -or ($_.Name.Length -eq ($rest.Length + 2) -and $_.Name.Substring(2) -ieq $rest)) }) }
  else { $b = [IO.Path]::GetFileNameWithoutExtension($f.Name); $kand = @(Get-ChildItem -LiteralPath $f.DirectoryName -Force -File -EA SilentlyContinue | Where-Object { $_.Name -ieq ($b + '.accdb') -or $_.Name -ieq ($b + '.mdb') }) }
  $offen = InBenutzung $f.FullName
  if (-not $offen -and $apps.Count) { foreach ($d in $kand) { if ((([int]$d.Attributes) -band 0x441000) -eq 0 -and (InBenutzung $d.FullName)) { $offen = $true } } }
  if ($offen) { $bleibt++; Zeile ('Bleibt (Datei ist gerade geöffnet): ' + $anz + $(if ($wer) { ' · ' + $wer } else { '' })) }
  else {
    Rename-Item -LiteralPath $f.FullName -NewName ($f.Name + '.alt_' + $st) -Force -EA Stop
    $frei++
    Zeile ('Vorher gesperrt' + $(if ($wer) { ' von ' + $wer } else { '' }) + ': ' + $anz + ' · jetzt frei (umbenannt in *.alt_' + $st + ')')
  }
}
Zeile ('Ergebnis: ' + $frei + ' Sperrdatei(en) freigegeben, ' + $bleibt + ' bleiben, weil die Datei noch offen ist.')` }),
  A({ id: 'office-autorecover-auflisten', titel: 'Automatisch gesicherte Office-Fassungen suchen', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Listet AutoWiederherstellen-Dateien von Word/Excel/PowerPoint, nie gespeicherte Dokumente (UnsavedFiles), direkt bearbeitete Outlook-Anhänge (Content.Outlook) und Word-Zwischenstände der letzten Tage — nur lesend.',
    param: { label: 'Wie viele Tage zurück', platzhalter: '7', vorlagen: ['1', '7', '30'] },
    ps: PFAD_USER + WIEDER_PS + String.raw`
NeedHive
$tage = TageAusP
$k = @(WiederKandidaten $tage)
Zeile ('Gefunden (letzte ' + $tage + ' Tage): ' + $k.Count + ' Datei(en)')
foreach ($g in @($k | Group-Object Quelle)) { Zeile ('' + $g.Name + ': ' + $g.Count) }
foreach ($x in @($k | Select-Object -First 40)) { Zeile ('  ' + $x.Datei.LastWriteTime.ToString('dd.MM. HH:mm') + ' · ' + (Groesse $x.Datei.Length) + ' · ' + $x.Datei.Name + ' (' + $x.Quelle + ')') }
if (-not $k.Count) { Zeile 'Keine automatisch gesicherten Fassungen gefunden — bei Dateien in OneDrive/SharePoint den Versionsverlauf prüfen, auf Netzlaufwerken „Vorgängerversionen“.' }
else { Zeile 'Retten: Baustein „Wiederherstellbare Office-Fassungen auf den Desktop kopieren“.' }` }),
  A({ id: 'office-wiederherstellung-sichern', titel: 'Wiederherstellbare Office-Fassungen auf den Desktop kopieren', modus: 'profil', risiko: 'aendern', timeoutMs: 180000,
    beschreibung: 'Kopiert die automatisch gesicherten Fassungen (AutoWiederherstellen, nie gespeicherte Dokumente, bearbeitete Outlook-Anhänge, Word-Zwischenstände) der letzten Tage in einen neuen Ordner „Office-Wiederherstellung …“ auf dem Desktop des Benutzers. Die Originale bleiben unverändert.',
    param: { label: 'Wie viele Tage zurück', platzhalter: '7', vorlagen: ['1', '7', '30'] },
    ps: PFAD_USER + WIEDER_PS + String.raw`
NeedHive
$tage = TageAusP
$k = @(WiederKandidaten $tage)
if (-not $k.Count) { Zeile ('Keine automatisch gesicherten Fassungen der letzten ' + $tage + ' Tage gefunden — nichts kopiert.') }
else {
  $desk = ShellOrdner 'Desktop'
  if (-not $desk -or $desk.StartsWith('\\') -or -not (Test-Path -LiteralPath $desk)) { $desk = $uProf }
  $ziel = Join-Path $desk ('Office-Wiederherstellung ' + (Get-Date -Format 'yyyy-MM-dd HH-mm'))
  if (-not (Test-Path -LiteralPath $ziel)) { New-Item -Path $ziel -ItemType Directory -Force | Out-Null }
  $ok = 0; $fehl = 0; $summe = 0
  foreach ($x in $k) {
    if (($summe + $x.Datei.Length) -gt 1GB) { Zeile 'Grenze 1 GB erreicht — ältere Dateien wurden nicht mehr kopiert.'; break }
    $name = ($x.Quelle -replace '[^\w]+', '_').Trim('_') + ' - ' + $x.Datei.Name
    $dz = Join-Path $ziel $name
    if (Test-Path -LiteralPath $dz) { $dz = Join-Path $ziel ($x.Datei.LastWriteTime.ToString('HHmmss') + ' ' + $name) }
    try { Copy-Item -LiteralPath $x.Datei.FullName -Destination $dz -Force -EA Stop; $ok++; $summe += $x.Datei.Length } catch { $fehl++ }
  }
  Zeile ('Vorher: ' + $k.Count + ' Fassung(en) nur in versteckten Ordnern · jetzt: ' + $ok + ' kopiert (' + (Groesse $summe) + ') nach ' + $ziel + $(if ($fehl) { ' · ' + $fehl + ' gerade in Benutzung, nicht kopiert' } else { '' }))
  Zeile 'Die Originale bleiben unverändert. .asd/.xar/.wbk-Dateien im passenden Programm über Datei → Öffnen öffnen und unter neuem Namen speichern.'
}` }),

  // ══ OneNote ══════════════════════════════════════════════════════════════════
  A({ id: 'onenote-cache', titel: 'OneNote-Cache zurücksetzen', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Beendet OneNote und benennt den lokalen OneNote-Cache um (Sicherung *.alt_…) — OneNote lädt die Notizbücher neu aus SharePoint/OneDrive. Gegen hartnäckige Synchronisierungsfehler, „falsch abgelegte Abschnitte“, Start-/Ladeprobleme und einen riesigen Cache. Noch nicht synchronisierte Änderungen bleiben in der Sicherung erhalten.',
    ps: String.raw`
NeedUser
$c = Join-Path $uLocal 'Microsoft\OneNote\16.0\cache'
if (Test-Path -LiteralPath $c) { Zeile ('Vorher: OneNote-Cache ' + (Groesse (OrdnerGroesse $c)) + ' · zuletzt geändert ' + (Get-Item -LiteralPath $c -Force).LastWriteTime.ToString('dd.MM.yyyy HH:mm')) }
StopUser @('ONENOTE', 'ONENOTEM')
if (RenameAlt $c 'OneNote-Cache') { Zeile 'Jetzt: OneNote öffnen und warten, bis alle Notizbücher neu synchronisiert sind (Umschalt+F9). Bei großen Notizbüchern dauert das einige Minuten.' }
foreach ($s in 'Sicherung', 'Backup') { $b = Join-Path $uLocal ('Microsoft\OneNote\16.0\' + $s); if (Test-Path -LiteralPath $b) { Zeile ('Lokale OneNote-Sicherungen: ' + $b + ' · ' + (Groesse (OrdnerGroesse $b))) } }
if (Test-Path -LiteralPath (Join-Path $uLocal 'Packages\Microsoft.Office.OneNote_8wekyb3d8bbwe')) { Zeile 'Hinweis: Zusätzlich ist „OneNote für Windows 10“ installiert — es hat einen eigenen Cache und eine eigene Notizbuchliste.' }` }),

  // ══ Speichern, Add-ins, Konto ════════════════════════════════════════════════
  A({ id: 'office-standard-lokal', titel: 'Office standardmäßig auf dem Computer speichern lassen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Setzt „Standardmäßig auf Computer speichern“ (statt zuerst OneDrive/SharePoint vorzuschlagen) und — falls angegeben — den Standardordner für Word und Excel, z. B. statt eines alten, nicht mehr vorhandenen Server-Pfads. Wirkt nach dem Neustart der Programme.',
    param: { label: 'Standardordner (optional)', platzhalter: 'Documents', vorlagen: ['Documents', 'Desktop'] },
    ps: PFAD_USER + String.raw`
NeedHive
# Zuerst den (optionalen) Ordner prüfen — erst danach wird etwas geändert.
$ziel = $null
if ($P -and $P.Trim()) {
  $x = $P.Trim().Trim('"').TrimEnd('\')
  if ($x -match '[<>"|?*]' -or $x -match '\.\.' -or $x.Length -gt 220) { throw 'Ungültiger Ordner.' }
  if ($x -in @('Desktop', 'Documents', 'Dokumente')) { $ziel = ShellOrdner $(if ($x -eq 'Desktop') { 'Desktop' } else { 'Personal' }); if (-not $ziel) { $ziel = Join-Path $uProf $(if ($x -eq 'Desktop') { 'Desktop' } else { 'Documents' }) } }
  elseif ($x -match '^[A-Za-z]:\\' -or $x -match '^\\\\[\w\.\-]+\\[^\\]+') { $ziel = $x }
  elseif ($x -match '^[\w\s\.\-\(\)&,+#\\]{1,200}$') { $ziel = Join-Path $uProf $x.TrimStart('\') }
  if (-not $ziel) { throw 'Ungültiger Ordner — z. B. „Documents“, „H:\Eigene Dateien“ oder „OneDrive - SKF\Projekte“.' }
  if ($ziel -match '^[Cc]:\\' -and -not $ziel.StartsWith($uProf, [StringComparison]::OrdinalIgnoreCase)) { throw ('Lokale Ordner nur im Profil des Benutzers (' + $uProf + ').') }
  if ($ziel.StartsWith($uProf, [StringComparison]::OrdinalIgnoreCase) -and -not (Test-Path -LiteralPath $ziel -PathType Container)) { throw ('Ordner nicht gefunden: ' + $ziel) }
}
$g = $uHive + '\Software\Microsoft\Office\16.0\Common\General'
$vor = (Get-ItemProperty -Path $g -Name PreferCloudSaveLocations -EA SilentlyContinue).PreferCloudSaveLocations
if (-not (Test-Path $g)) { New-Item -Path $g -Force | Out-Null }
Set-ItemProperty -Path $g -Name PreferCloudSaveLocations -Value 0 -Type DWord
Zeile ('Standardmäßig auf Computer speichern: vorher ' + $(if ($vor -eq 0) { 'schon an' } else { 'aus (Cloud zuerst)' }) + ' · jetzt an')
$pol = (Get-ItemProperty -Path ($uHive + '\Software\Policies\Microsoft\Office\16.0\Common\General') -Name PreferCloudSaveLocations -EA SilentlyContinue).PreferCloudSaveLocations
if ($null -ne $pol) { Zeile ('Hinweis: Eine Richtlinie setzt den Wert auf ' + $pol + ' und hat Vorrang.') }
if ($ziel) {
  $w = $uHive + '\Software\Microsoft\Office\16.0\Word\Options'
  $e = $uHive + '\Software\Microsoft\Office\16.0\Excel\Options'
  $wv = RegRoh $w 'DOC-PATH'; $ev = RegRoh $e 'DefaultPath'
  foreach ($k in $w, $e) { if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null } }
  Set-ItemProperty -Path $w -Name 'DOC-PATH' -Value $ziel -Type ExpandString
  Set-ItemProperty -Path $e -Name 'DefaultPath' -Value $ziel -Type String
  Zeile ('Word-Standardordner: vorher ' + $(if ($wv) { $wv } else { 'Standard' }) + ' · jetzt ' + $ziel)
  Zeile ('Excel-Standardordner: vorher ' + $(if ($ev) { $ev } else { 'Standard' }) + ' · jetzt ' + $ziel)
  if (-not ($ziel -match '^[Cc]:\\')) { Zeile 'Hinweis: Netzlaufwerke/Server-Pfade sind von hier aus nicht prüfbar — der Benutzer sollte den Ordner einmal öffnen.' }
}
Zeile 'Word, Excel und PowerPoint neu starten, damit es wirkt.'` }),
  A({ id: 'office-webaddin-cache', titel: 'Cache der Office-Web-Add-ins leeren', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet die Office-Programme und leert den Zwischenspeicher der modernen Office-Add-ins (Wef, WebView-Host) — gegen „Add-In konnte nicht gestartet werden“, leere oder endlos ladende Add-in-Bereiche und veraltete Add-in-Versionen. Zentral verteilte und im Konto gespeicherte Add-ins kommen beim nächsten Start wieder.',
    ps: String.raw`
NeedUser
StopUser @(` + OFFICE_APPS + String.raw`)
ClearDir (Join-Path $uLocal 'Microsoft\Office\16.0\Wef') 'Add-in-Cache (Wef)'
$wv = Join-Path $uLocal 'Packages\Microsoft.Win32WebViewHost_cw5n1h2txyewy\AC'
foreach ($d in @(Get-ChildItem -LiteralPath $wv -Directory -Force -EA SilentlyContinue | Where-Object { $_.Name -like '#!*' })) { ClearDir (Join-Path $d.FullName 'INetCache') ('WebView-Host-Cache ' + $d.Name) }
Zeile 'Jetzt Word, Excel bzw. Outlook neu starten — die Add-ins laden sich frisch (der erste Start dauert etwas länger).'` }),
  A({ id: 'office-konto-lizenz', titel: 'Office-Konten und Lizenzstand des Benutzers anzeigen', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Welche Konten Office kennt (Firmenkonto oder privates Microsoft-Konto), ob Lizenz-Token im Profil liegen und wie alt sie sind, Lizenzmodus, gemeinsam genutzter Computer und zusätzlich installierte Office-Produkte mit Produktschlüssel — nur lesend.',
    ps: String.raw`
NeedHive
$id = $uHive + '\Software\Microsoft\Office\16.0\Common\Identity'
$n = 0
foreach ($i in @(Get-ChildItem -Path ($id + '\Identities') -EA SilentlyContinue)) {
  $p = Get-ItemProperty -Path $i.PSPath -EA SilentlyContinue
  $mail = [string]$p.EmailAddress; if (-not $mail) { $mail = [string]$p.SignInName }
  if (-not $mail) { continue }
  $n++
  $art = [string]$p.ProviderId
  $txt = $(if ($art -match 'AD|OrgId') { 'Firmen-/Schulkonto' } elseif ($art -match 'MSA|Live|Consumer') { 'PRIVATES Microsoft-Konto' } else { 'Art ' + $art })
  Zeile ('Office-Konto: ' + $mail + ' · ' + $txt + $(if ($mail -notmatch '@([\w\-]+\.)*skf\.com$') { ' · keine SKF-Adresse!' } else { '' }))
}
if (-not $n) { Zeile 'Office-Konto: keins gespeichert (Office ist nicht angemeldet).' }
$lf = @(Get-ChildItem -LiteralPath (Join-Path $uLocal 'Microsoft\Office\Licenses') -Recurse -Force -File -EA SilentlyContinue)
if ($lf.Count) {
  $neu = $lf | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  Zeile ('Lizenz-Token im Profil: ' + $lf.Count + ' · neuestes vom ' + $neu.LastWriteTime.ToString('dd.MM.yyyy HH:mm') + $(if ($neu.LastWriteTime -lt (Get-Date).AddDays(-30)) { ' (älter als 30 Tage — die Lizenz wird nicht mehr erneuert)' } else { '' }))
} else { Zeile 'Lizenz-Token im Profil: keins (Office hat für diesen Benutzer noch keine Lizenz geholt)' }
$sf = @(Get-ChildItem -LiteralPath (Join-Path $uLocal 'Microsoft\Office\16.0\Licensing') -Recurse -Force -File -EA SilentlyContinue)
if ($sf.Count) { Zeile ('Lizenz-Token für gemeinsam genutzte PCs: ' + $sf.Count + ' Datei(en)') }
$ln = Get-Item -Path ($uHive + '\Software\Microsoft\Office\16.0\Common\Licensing\LicensingNext') -EA SilentlyContinue
if ($ln) { $w = @($ln.GetValueNames() | Select-Object -First 6 | ForEach-Object { '' + $_ + '=' + $ln.GetValue($_) }); if ($w.Count) { Zeile ('Lizenzmodus: ' + ($w -join ', ')) } }
$c = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration' -EA SilentlyContinue
if ($c) {
  Zeile ('Installierte Produkte: ' + $c.ProductReleaseIds)
  $fremd = @(([string]$c.ProductReleaseIds -split ',') | Where-Object { $_ -and $_ -notmatch 'O365|M365|Microsoft365|LanguagePack|Proofing|Visio.*(Pro|Std).*Retail|Project.*(Pro|Std).*Retail|AccessRuntime' })
  if ($fremd.Count) { Zeile ('Zusätzlich installiert (eigener Produktschlüssel/Volumenlizenz): ' + ($fremd -join ', ')) }
  Zeile ('Gemeinsam genutzter Computer (Shared Activation): ' + $(if ([string]$c.SharedComputerLicensing -eq '1') { 'ja' } else { 'nein' }))
} else { Zeile 'Microsoft 365 (Klick-und-Los) ist nicht installiert.' }
$pol = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Office\16.0\Common\Licensing' -EA SilentlyContinue
if ($pol -and $null -ne $pol.SharedComputerLicensing) { Zeile ('Richtlinie Shared Activation: ' + $pol.SharedComputerLicensing) }` }),
]
