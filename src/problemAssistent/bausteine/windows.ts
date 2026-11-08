// ── Problem-Assistent: Lösungsbausteine Gruppe „windows“ (Runde 3) ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Bereiche: Windows & Oberfläche · Leistung & Speicher · Updates & Software · Weitere Programme.
//   • Einstellungen des Benutzers nur über $uHive (Art „profil“) bzw. in seiner Sitzung (Art „benutzer“).
//   • Jeder ändernde Baustein gibt den alten und den neuen Wert aus.
//   • Benutzerdaten werden umbenannt (*.alt_…) bzw. vor dem Zurücksetzen gesichert — nie einfach gelöscht.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Registry-Wert setzen (Schlüssel nur anlegen, wenn er fehlt) und alt → neu ausgeben. */
const SETZE_WERT = String.raw`
function SetzeWert([string]$k, [string]$n, $v, [string]$typ, [string]$label) {
  if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
  $alt = (Get-ItemProperty -Path $k -Name $n -EA SilentlyContinue).$n
  Set-ItemProperty -Path $k -Name $n -Value $v -Type $typ -EA Stop
  Zeile ($label + ': vorher ' + $(if ($null -eq $alt) { 'nicht gesetzt' } else { [string]$alt }) + ' → jetzt ' + [string]$v)
}
`

/** Store-Apps, die neu registriert bzw. zurückgesetzt werden dürfen (Whitelist). */
const APP_LISTE = String.raw`
$pk = @(switch -Regex ($P.Trim()) {
  '^Start' { 'Microsoft.Windows.StartMenuExperienceHost'; 'MicrosoftWindows.Client.CBS'; 'Microsoft.Windows.Search'; break }
  '^Infobereich' { 'Microsoft.Windows.ShellExperienceHost'; 'MicrosoftWindows.Client.Core'; break }
  '^Einstellungen' { 'windows.immersivecontrolpanel'; break }
  '^Fotos' { 'Microsoft.Windows.Photos'; break }
  '^Rechner' { 'Microsoft.WindowsCalculator'; break }
  '^Snipping' { 'Microsoft.ScreenSketch'; break }
  '^Paint' { 'Microsoft.Paint'; break }
  '^Kamera' { 'Microsoft.WindowsCamera'; break }
  '^Medien' { 'Microsoft.ZuneMusic'; 'Microsoft.ZuneVideo'; break }
  '^Unternehmensportal' { 'Microsoft.CompanyPortal'; break }
  '^Microsoft Store' { 'Microsoft.WindowsStore'; break }
  '^Kurznotizen' { 'Microsoft.MicrosoftStickyNotes'; break }
  '^Remotehilfe' { 'MicrosoftCorporationII.QuickAssist'; break }
  default { throw ('Diese App ist nicht freigegeben: ' + $P) }
})
`

export const AKTIONEN_WINDOWS: PaAktion[] = [
  // ══ Explorer, Desktop, Taskleiste, Bedienung (Einstellungen des Benutzers) ═══
  A({ id: 'win-explorer-option', titel: 'Explorer- und Desktop-Einstellung des Benutzers setzen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Setzt eine Explorer-/Desktop-Einstellung im Profil des angemeldeten Benutzers (Dateiendungen, versteckte Dateien, Kontextmenü, Miniaturansichten, Desktopsymbole …). Wirksam nach „Explorer neu starten“.',
    param: { label: 'Einstellung', platzhalter: 'Dateiendungen anzeigen', pflicht: true, optionen: ['Dateiendungen anzeigen', 'Versteckte Dateien anzeigen', 'Versteckte Dateien ausblenden', 'Explorer öffnet Dieser PC', 'Miniaturansichten und Vorschaufenster ein', 'Nur Symbole statt Miniaturansichten', 'Klassisches Kontextmenü (Windows 11)', 'Neues Kontextmenü (Windows 11)', 'Desktopsymbole einblenden', 'Dieser PC und Papierkorb auf dem Desktop', 'Ordnerfenster und Apps nach Anmeldung nicht wieder öffnen', 'Zuletzt verwendete Dateien nicht anzeigen', 'Senden an: E-Mail-Empfänger wiederherstellen'] },
    ps: String.raw`
NeedHive
` + SETZE_WERT + String.raw`
$exp = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer'
$adv = $exp + '\Advanced'
$cls = $uHive + '_Classes'
if (-not (Test-Path $cls)) { $cls = $uHive + '\Software\Classes' }
$ctx = $cls + '\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}'
switch -Regex ($P.Trim()) {
  '^Dateiendungen' { SetzeWert $adv 'HideFileExt' 0 'DWord' 'Bekannte Dateiendungen ausblenden (1 = ja, 0 = nein)'; break }
  '^Versteckte Dateien anz' { SetzeWert $adv 'Hidden' 1 'DWord' 'Versteckte Dateien (1 = anzeigen, 2 = ausblenden)'; break }
  '^Versteckte Dateien aus' {
    SetzeWert $adv 'Hidden' 2 'DWord' 'Versteckte Dateien (1 = anzeigen, 2 = ausblenden)'
    SetzeWert $adv 'ShowSuperHidden' 0 'DWord' 'Geschützte Systemdateien wie desktop.ini anzeigen (1 = ja)'
    break }
  '^Zuletzt' {
    SetzeWert $exp 'ShowRecent' 0 'DWord' 'Zuletzt verwendete Dateien im Explorer (Start/Schnellzugriff) anzeigen (1 = ja)'
    SetzeWert $exp 'ShowFrequent' 0 'DWord' 'Häufig verwendete Ordner im Schnellzugriff anzeigen (1 = ja)'
    SetzeWert $adv 'Start_TrackDocs' 0 'DWord' 'Zuletzt geöffnete Elemente in Start und Sprunglisten (1 = ja)'
    Zeile 'Hinweis: Auch die Sprunglisten (Rechtsklick auf Taskleisten-Symbole) zeigen dann keine zuletzt geöffneten Dateien mehr.'
    break }
  '^Explorer' { SetzeWert $adv 'LaunchTo' 1 'DWord' 'Explorer öffnet (1 = Dieser PC, 2 = Start/Schnellzugriff)'; break }
  '^Miniatur' {
    SetzeWert $adv 'IconsOnly' 0 'DWord' 'Immer Symbole statt Miniaturansichten (1 = ja)'
    SetzeWert $adv 'ShowPreviewHandlers' 1 'DWord' 'Vorschau im Vorschaufenster (1 = an)'
    $pol = @((Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer' -EA SilentlyContinue), (Get-ItemProperty ($exp.Replace('\Explorer', '\Policies\Explorer')) -EA SilentlyContinue))
    if (@($pol | Where-Object { $_ -and ($_.DisableThumbnails -eq 1 -or $_.NoPreviewPane -eq 1 -or $_.NoReadingPane -eq 1) }).Count) { Zeile 'Achtung: Miniaturansichten bzw. Vorschaufenster sind per Richtlinie abgeschaltet — die Richtlinie hat Vorrang.' }
    break }
  '^Nur Symbole' { SetzeWert $adv 'IconsOnly' 1 'DWord' 'Immer Symbole statt Miniaturansichten (1 = ja)'; break }
  '^Klassisch' {
    $k = $ctx + '\InprocServer32'
    $war = Test-Path $k
    if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
    Set-ItemProperty -Path $k -Name '(default)' -Value '' -EA Stop
    Zeile ('Kontextmenü: vorher ' + $(if ($war) { 'schon klassisch' } else { 'neues Windows-11-Menü' }) + ' → jetzt klassisch (alle Einträge ohne „Weitere Optionen anzeigen“)')
    break }
  '^Neues Kontext' {
    if (Test-Path $ctx) { Remove-Item -Path $ctx -Recurse -Force -EA Stop; Zeile 'Kontextmenü: vorher klassisch → jetzt neues Windows-11-Menü' } else { Zeile 'Kontextmenü: ist bereits das neue Windows-11-Menü — nichts geändert.' }
    break }
  '^Desktopsymbole' { SetzeWert $adv 'HideIcons' 0 'DWord' 'Desktopsymbole ausblenden (1 = ja)'; break }
  '^Dieser PC' {
    $k = $exp + '\HideDesktopIcons\NewStartPanel'
    SetzeWert $k '{20D04FE0-3AEA-1069-A2D8-08002B30309D}' 0 'DWord' '„Dieser PC“ auf dem Desktop ausblenden (1 = ja)'
    SetzeWert $k '{645FF040-5081-101B-9F08-00AA002F954E}' 0 'DWord' 'Papierkorb auf dem Desktop ausblenden (1 = ja)'
    break }
  '^Ordnerfenster' {
    SetzeWert $adv 'PersistBrowsers' 0 'DWord' 'Ordnerfenster bei Anmeldung wiederherstellen (1 = ja)'
    SetzeWert ($uHive + '\Software\Microsoft\Windows NT\CurrentVersion\Winlogon') 'RestartApps' 0 'DWord' 'Apps nach Neustart automatisch wieder öffnen (1 = ja)'
    break }
  '^Senden an' {
    $st = Join-Path $uRoam 'Microsoft\Windows\SendTo'
    if (-not (Test-Path -LiteralPath $st)) { New-Item -ItemType Directory -Path $st -Force | Out-Null }
    $vorh = @(Get-ChildItem -LiteralPath $st -Filter '*.MAPIMail' -Force -EA SilentlyContinue)
    if ($vorh.Count) { Zeile ('Senden an: „' + $vorh[0].BaseName + '“ ist vorhanden — fehlt der Eintrag trotzdem, ist kein E-Mail-Programm zugeordnet (Outlook als Standard wählen).') }
    else { New-Item -ItemType File -Path (Join-Path $st 'E-Mail-Empfänger.MAPIMail') -EA Stop | Out-Null; Zeile 'Senden an: vorher kein E-Mail-Eintrag → jetzt „E-Mail-Empfänger“ angelegt.' }
    break }
  default { throw ('Unbekannte Einstellung: ' + $P) }
}
Zeile 'Wirksam nach „Explorer neu starten“ bzw. Ab- und Anmelden.'` }),

  A({ id: 'win-taskleiste-option', titel: 'Taskleisten-Einstellung des Benutzers setzen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Setzt eine Taskleisten-Einstellung im Profil des Benutzers: immer anzeigen, links/mittig, auf allen Bildschirmen, Suchfeld, alle Infobereich-Symbole, nie gruppieren, Fenster aller Desktops. Wirksam nach „Explorer neu starten“.',
    param: { label: 'Einstellung', platzhalter: 'Taskleiste immer anzeigen', pflicht: true, optionen: ['Taskleiste immer anzeigen', 'Taskleiste links ausrichten', 'Taskleiste mittig ausrichten', 'Taskleiste auf allen Bildschirmen', 'Suchfeld anzeigen', 'Alle Infobereich-Symbole anzeigen', 'Schaltflächen nie gruppieren', 'Fenster aller Desktops anzeigen'] },
    ps: String.raw`
NeedHive
` + SETZE_WERT + String.raw`
$exp = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer'
$adv = $exp + '\Advanced'
switch -Regex ($P.Trim()) {
  '^Taskleiste immer' {
    $k = $exp + '\StuckRects3'
    $s = (Get-ItemProperty -Path $k -Name Settings -EA SilentlyContinue).Settings
    if ($s -and $s.Length -gt 8) {
      $alt = [int]$s[8]; $s[8] = [byte]2
      Set-ItemProperty -Path $k -Name Settings -Value ([byte[]]$s) -Type Binary -EA Stop
      Zeile ('Automatisch ausblenden: vorher ' + $(if (($alt -band 1) -eq 1) { 'an' } else { 'aus' }) + ' → jetzt aus')
    } else { Zeile 'Taskleisten-Position (StuckRects3) noch nicht gespeichert — Standard ist „immer anzeigen“.' }
    SetzeWert $adv 'TaskbarAutoHideInTabletMode' 0 'DWord' 'Im Tablet-Modus ausblenden (1 = ja)'
    break }
  '^Taskleiste links' { SetzeWert $adv 'TaskbarAl' 0 'DWord' 'Ausrichtung (0 = links, 1 = Mitte)'; break }
  '^Taskleiste mittig' { SetzeWert $adv 'TaskbarAl' 1 'DWord' 'Ausrichtung (0 = links, 1 = Mitte)'; break }
  '^Taskleiste auf allen' {
    SetzeWert $adv 'MMTaskbarEnabled' 1 'DWord' 'Taskleiste auf allen Bildschirmen (1 = ja)'
    SetzeWert $adv 'MMTaskbarMode' 0 'DWord' 'Programme zeigen (0 = auf allen Taskleisten)'
    break }
  '^Suchfeld' { SetzeWert ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Search') 'SearchboxTaskbarMode' 2 'DWord' 'Suche in der Taskleiste (0 = aus, 1 = nur Lupe, 2 = Suchfeld)'; break }
  '^Alle Infobereich' {
    SetzeWert $exp 'EnableAutoTray' 0 'DWord' 'Symbole automatisch ausblenden (Windows 10; 0 = alle zeigen)'
    $neu = 0; $schon = 0
    foreach ($i in @(Get-ChildItem -Path ($uHive + '\Control Panel\NotifyIconSettings') -EA SilentlyContinue)) {
      $v = (Get-ItemProperty -LiteralPath $i.PSPath -Name IsPromoted -EA SilentlyContinue).IsPromoted
      if ($v -ne 1) { Set-ItemProperty -LiteralPath $i.PSPath -Name IsPromoted -Value 1 -Type DWord -EA SilentlyContinue; $neu++ } else { $schon++ }
    }
    Zeile ('Windows 11: ' + $neu + ' Symbole von „versteckt (^)“ → jetzt sichtbar, ' + $schon + ' waren schon sichtbar.')
    break }
  '^Schaltfl' {
    SetzeWert $adv 'TaskbarGlomLevel' 2 'DWord' 'Schaltflächen gruppieren (0 = immer, 1 = wenn voll, 2 = nie)'
    SetzeWert $adv 'MMTaskbarGlomLevel' 2 'DWord' 'Weitere Bildschirme gruppieren (2 = nie)'
    break }
  '^Fenster aller' {
    SetzeWert $adv 'VirtualDesktopTaskbarFilter' 0 'DWord' 'Taskleiste zeigt Fenster (0 = aller Desktops, 1 = nur aktueller)'
    SetzeWert $adv 'VirtualDesktopAltTabFilter' 0 'DWord' 'Alt+Tab zeigt Fenster (0 = aller Desktops, 1 = nur aktueller)'
    break }
  default { throw ('Unbekannte Einstellung: ' + $P) }
}
Zeile 'Wirksam nach „Explorer neu starten“.'` }),

  A({ id: 'win-bedienung-option', titel: 'Bedien-Einstellung des Benutzers setzen (Tastatur, Fenster, Zwischenablage)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Setzt eine Bedien-Einstellung im Profil des Benutzers: Zwischenablage-Verlauf, Bildschirmtastatur, Sprachumschaltung, Fenster andocken/schütteln, Alt+Tab, Druck-Taste, Farbfilter. Meist wirksam nach Ab- und Anmelden.',
    param: { label: 'Einstellung', platzhalter: 'Zwischenablage-Verlauf ein', pflicht: true, optionen: ['Zwischenablage-Verlauf ein', 'Bildschirmtastatur nie automatisch', 'Sprachumschaltung per Tastenkürzel aus', 'Fenster andocken (Snap) ein', 'Fenster andocken (Snap) aus', 'Fenster schütteln aus', 'Alt+Tab ohne Browser-Tabs', 'Druck-Taste ohne Snipping Tool', 'Druck-Taste öffnet Snipping Tool', 'Farbfilter (Graustufen) aus'] },
    ps: String.raw`
NeedHive
` + SETZE_WERT + String.raw`
$adv = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'
$wann = 'nach Ab- und Anmelden'
switch -Regex ($P.Trim()) {
  '^Zwischenablage' {
    SetzeWert ($uHive + '\Software\Microsoft\Clipboard') 'EnableClipboardHistory' 1 'DWord' 'Zwischenablage-Verlauf (1 = an)'
    $pol = (Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -EA SilentlyContinue).AllowClipboardHistory
    if ($pol -eq 0) { Zeile 'Achtung: Der Verlauf ist per Richtlinie gesperrt (AllowClipboardHistory = 0) — die Richtlinie hat Vorrang.' }
    $wann = 'sofort bzw. nach „Zwischenablage-Dienst neu starten“'
    break }
  '^Bildschirmtastatur' {
    $k = $uHive + '\Software\Microsoft\TabletTip\1.7'
    SetzeWert $k 'TouchKeyboardTapInvoke' 0 'DWord' 'Bildschirmtastatur zeigen (Windows 11: 0 = nie, 1 = ohne Tastatur, 2 = immer)'
    SetzeWert $k 'EnableDesktopModeAutoInvoke' 0 'DWord' 'Bildschirmtastatur automatisch (Windows 10: 0 = aus)'
    break }
  '^Sprachumschaltung' {
    $k = $uHive + '\Keyboard Layout\Toggle'
    SetzeWert $k 'Hotkey' '3' 'String' 'Tastenkürzel Sprache wechseln (1 = Alt+Umschalt, 2 = Strg+Umschalt, 3 = aus)'
    SetzeWert $k 'Language Hotkey' '3' 'String' 'Eingabesprache wechseln (3 = aus)'
    SetzeWert $k 'Layout Hotkey' '3' 'String' 'Tastaturlayout wechseln (3 = aus)'
    Zeile 'Windows+Leertaste wechselt weiterhin bewusst die Tastatur.'
    break }
  '^Fenster andocken \(Snap\) ein' { SetzeWert ($uHive + '\Control Panel\Desktop') 'WindowArrangementActive' '1' 'String' 'Fenster andocken/Snap (1 = an, 0 = aus)'; break }
  '^Fenster andocken \(Snap\) aus' { SetzeWert ($uHive + '\Control Panel\Desktop') 'WindowArrangementActive' '0' 'String' 'Fenster andocken/Snap (1 = an, 0 = aus)'; break }
  '^Fenster sch' { SetzeWert $adv 'DisallowShaking' 1 'DWord' 'Fenster schütteln minimiert andere (1 = abgeschaltet)'; $wann = 'nach „Explorer neu starten“'; break }
  '^Alt\+Tab' { SetzeWert $adv 'MultiTaskingAltTabFilter' 3 'DWord' 'Alt+Tab zeigt (3 = nur Fenster, 0 = Fenster und alle Browser-Tabs)'; $wann = 'nach „Explorer neu starten“'; break }
  '^Druck-Taste ohne' { SetzeWert ($uHive + '\Control Panel\Keyboard') 'PrintScreenKeyForSnippingEnabled' 0 'DWord' 'Druck-Taste öffnet Snipping Tool (0 = nein, Bild in die Zwischenablage)'; break }
  '^Druck-Taste .ffnet' { SetzeWert ($uHive + '\Control Panel\Keyboard') 'PrintScreenKeyForSnippingEnabled' 1 'DWord' 'Druck-Taste öffnet Snipping Tool (1 = ja)'; break }
  '^Farbfilter' {
    $k = $uHive + '\Software\Microsoft\ColorFiltering'
    SetzeWert $k 'Active' 0 'DWord' 'Farbfilter (1 = an)'
    SetzeWert $k 'HotkeyEnabled' 0 'DWord' 'Tastenkürzel Windows+Strg+C (1 = an)'
    Zeile 'Sofort wirksam: der Benutzer drückt einmal Windows+Strg+C (solange das Kürzel noch aktiv ist).'
    break }
  default { throw ('Unbekannte Einstellung: ' + $P) }
}
Zeile ('Wirksam ' + $wann + '.')` }),

  // ══ Sprache, Region, Store-Apps (in der Sitzung des Benutzers) ══════════════
  A({ id: 'win-sprache-region', titel: 'Anzeigesprache oder Regionalformat des Benutzers setzen', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Stellt die Windows-Anzeigesprache (nur installierte Sprachpakete) oder das Regionalformat (Datum, Dezimal-/Tausendertrennzeichen, Listentrenner für Excel) des Benutzers um. Anzeigesprache wirkt nach Ab- und Anmelden, das Format nach Neustart der Programme.',
    param: { label: 'Einstellung', platzhalter: 'Regionalformat Deutschland', pflicht: true, optionen: ['Anzeigesprache Deutsch', 'Anzeigesprache Englisch', 'Regionalformat Deutschland', 'Regionalformat Österreich', 'Regionalformat Schweiz', 'Regionalformat USA', 'Regionalformat Großbritannien'] },
    ps: String.raw`
$w = $P.Trim()
$ui = $null; $fmt = $null
switch -Regex ($w) {
  '^Anzeigesprache Deutsch' { $ui = 'de-DE'; break }
  '^Anzeigesprache Englisch' { $ui = 'en-US'; break }
  '^Regionalformat Deutschland' { $fmt = 'de-DE'; break }
  '^Regionalformat \S*sterreich' { $fmt = 'de-AT'; break }
  '^Regionalformat Schweiz' { $fmt = 'de-CH'; break }
  '^Regionalformat USA' { $fmt = 'en-US'; break }
  '^Regionalformat Gro' { $fmt = 'en-GB'; break }
  default { throw ('Unbekannte Einstellung: ' + $w) }
}
if ($ui) {
  $inst = @(Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\MUI\UILanguages' -EA SilentlyContinue | ForEach-Object { [string]$_.PSChildName })
  if ($ui -eq 'en-US' -and ($ui -notin $inst) -and ('en-GB' -in $inst)) { $ui = 'en-GB' }
  if ($ui -notin $inst) { throw ('Sprachpaket ' + $ui + ' ist auf diesem PC nicht installiert (installiert: ' + ($inst -join ', ') + '). Sprachpakete verteilt DXC bzw. das Unternehmensportal.') }
  $alt = $null; try { $o = Get-WinUILanguageOverride -EA Stop; if ($o) { $alt = [string]$o.Name } } catch {}
  $jetzt = [string](Get-UICulture).Name
  Set-WinUILanguageOverride -Language $ui -EA Stop
  Zeile ('Anzeigesprache: vorher ' + $(if ($alt) { $alt } else { 'automatisch (angezeigt: ' + $jetzt + ')' }) + ' → jetzt ' + $ui)
  $pol = (Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\MUI\Settings' -EA SilentlyContinue).PreferredUILanguages
  if ($pol) { Zeile ('Achtung: Eine Richtlinie gibt die Sprache ' + (@($pol) -join ', ') + ' vor — sie hat Vorrang.') }
  Zeile 'Wirksam nach Abmelden und erneutem Anmelden.'
} else {
  $k = 'HKCU:\Control Panel\International'
  function FormatText { $a = Get-ItemProperty $k -EA SilentlyContinue; '' + $a.LocaleName + ' (Dezimal „' + $a.sDecimal + '“, Tausender „' + $a.sThousand + '“, Liste „' + $a.sList + '“, Datum ' + $a.sShortDate + ')' }
  $vor = FormatText
  Set-Culture -CultureInfo $fmt -EA Stop
  $ci = New-Object System.Globalization.CultureInfo($fmt, $false)
  $soll = [ordered]@{ sDecimal = $ci.NumberFormat.NumberDecimalSeparator; sThousand = $ci.NumberFormat.NumberGroupSeparator; sList = $ci.TextInfo.ListSeparator; sShortDate = $ci.DateTimeFormat.ShortDatePattern; sMonDecimalSep = $ci.NumberFormat.CurrencyDecimalSeparator; sMonThousandSep = $ci.NumberFormat.CurrencyGroupSeparator }
  foreach ($n in @($soll.Keys)) {
    $ist = [string](Get-ItemProperty $k -Name $n -EA SilentlyContinue).$n
    if ($ist -cne [string]$soll[$n]) { Set-ItemProperty -Path $k -Name $n -Value ([string]$soll[$n]) -Type String; Zeile ('Eigene Anpassung ' + $n + ': „' + $ist + '“ → „' + $soll[$n] + '“') }
  }
  Zeile ('Regionalformat: vorher ' + $vor)
  Zeile ('jetzt ' + (FormatText))
  Zeile 'Offene Programme (Excel, SAP, Outlook) bitte neu starten.'
}` }),

  A({ id: 'win-app-neu-registrieren', titel: 'Windows-App neu registrieren (Startmenü, Fotos, Rechner …)', modus: 'benutzer', risiko: 'aendern', timeoutMs: 180000,
    beschreibung: 'Registriert eine eingebaute App für den Benutzer neu (Add-AppxPackage -Register) — behebt „Klasse nicht registriert“, Apps, die sofort zugehen, und ein defektes Startmenü. Daten und Einstellungen der App bleiben.',
    param: { label: 'App', platzhalter: 'Startmenü und Suche', pflicht: true, optionen: ['Startmenü und Suche', 'Infobereich und Schnelleinstellungen', 'Einstellungen-App', 'Fotos', 'Rechner', 'Snipping Tool', 'Paint', 'Kamera', 'Medienwiedergabe', 'Unternehmensportal', 'Microsoft Store', 'Kurznotizen', 'Remotehilfe'] },
    ps: APP_LISTE + String.raw`
$n = 0
foreach ($name in $pk) {
  $p = @(Get-AppxPackage -Name $name -EA SilentlyContinue)
  if (-not $p.Count) { Zeile ($name + ': für diesen Benutzer nicht installiert'); continue }
  foreach ($x in $p) {
    $man = Join-Path $x.InstallLocation 'AppxManifest.xml'
    if (-not (Test-Path -LiteralPath $man)) { Zeile ($x.Name + ': Manifest fehlt (' + $x.InstallLocation + ')'); continue }
    $vor = [string]$x.Status
    try {
      Add-AppxPackage -DisableDevelopmentMode -Register $man -ForceApplicationShutdown -EA Stop
      $nach = [string](@(Get-AppxPackage -Name $x.Name -EA SilentlyContinue) | Select-Object -First 1).Status
      Zeile ($x.Name + ' ' + $x.Version + ': neu registriert (Zustand vorher ' + $vor + ' → jetzt ' + $nach + ')'); $n++
    } catch { Zeile ($x.Name + ': ' + $_.Exception.Message) }
  }
}
if (-not $n) { Zeile 'Nichts neu registriert — die App ggf. über Microsoft Store bzw. Unternehmensportal neu installieren.' }` }),

  A({ id: 'win-app-zuruecksetzen', titel: 'Windows-App zurücksetzen (Fotos, Rechner, Snipping Tool …)', modus: 'benutzer', risiko: 'kritisch', timeoutMs: 180000,
    beschreibung: 'Setzt eine eingebaute App des Benutzers auf Werkszustand zurück (Reset-AppxPackage), wenn Neuregistrieren nicht hilft. Die App-Daten werden vorher unter %LOCALAPPDATA%\ITAdminTool-Sicherung gesichert. Nur freigegebene Apps.',
    param: { label: 'App', platzhalter: 'Fotos', pflicht: true, optionen: ['Fotos', 'Rechner', 'Snipping Tool', 'Paint', 'Kamera', 'Medienwiedergabe', 'Unternehmensportal', 'Microsoft Store', 'Remotehilfe'] },
    ps: String.raw`
if ($P.Trim() -match '^(Start|Infobereich|Einstellungen|Kurznotizen)') { throw ('„' + $P + '“ wird nicht zurückgesetzt (Anheftungen bzw. Notizen gingen verloren) — bitte „Windows-App neu registrieren“ verwenden.') }
` + APP_LISTE + String.raw`
if (-not (Get-Command Reset-AppxPackage -EA SilentlyContinue)) { throw 'Zurücksetzen von Apps braucht Windows 10 2004 oder neuer.' }
$st = Get-Date -Format 'yyyyMMdd_HHmmss'
$n = 0
foreach ($name in $pk) {
  $p = @(Get-AppxPackage -Name $name -EA SilentlyContinue)
  if (-not $p.Count) { Zeile ($name + ': für diesen Benutzer nicht installiert'); continue }
  foreach ($x in $p) {
    $d = Join-Path $env:LOCALAPPDATA ('Packages\' + $x.PackageFamilyName)
    if (Test-Path -LiteralPath $d) {
      $sich = Join-Path $env:LOCALAPPDATA ('ITAdminTool-Sicherung\' + $x.PackageFamilyName + '_' + $st)
      New-Item -ItemType Directory -Path $sich -Force | Out-Null
      foreach ($u in 'LocalState', 'Settings', 'RoamingState') { $q = Join-Path $d $u; if (Test-Path -LiteralPath $q) { Copy-Item -LiteralPath $q -Destination $sich -Recurse -Force -EA SilentlyContinue } }
      Zeile ('Sicherung der App-Daten: ' + $sich)
    }
    try { Reset-AppxPackage -Package $x.PackageFullName -EA Stop; Zeile ($x.Name + ' ' + $x.Version + ': vorher eingerichtet → jetzt auf Werkszustand zurückgesetzt'); $n++ }
    catch { Zeile ($x.Name + ': ' + $_.Exception.Message) }
  }
}
if (-not $n) { Zeile 'Nichts zurückgesetzt.' }` }),

  // ══ Explorer-Ansichten, Schriftarten-Cache, Speicherplatz ═══════════════════
  A({ id: 'win-explorer-ansicht-reset', titel: 'Ordneransichten des Explorers zurücksetzen', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Benennt die gespeicherten Ordneransichten des Benutzers um (Bags/BagMRU, Standardansicht je Ordnertyp) und startet den Explorer neu — gegen falsche/springende Ansichten, fehlende Spalten, „Wird bearbeitet …“ in einzelnen Ordnern. Alle Ordner zeigen danach wieder die Standardansicht.',
    ps: String.raw`
NeedHive
$st = Get-Date -Format 'yyyyMMdd_HHmmss'
$cls = $uHive + '_Classes'
$ziele = @(
  @(($cls + '\Local Settings\Software\Microsoft\Windows\Shell\Bags'), 'Ordneransichten (Bags)'),
  @(($cls + '\Local Settings\Software\Microsoft\Windows\Shell\BagMRU'), 'Ordneransichten (BagMRU)'),
  @(($uHive + '\Software\Microsoft\Windows\Shell\Bags'), 'Ansichten Desktop/Netzwerk (Bags)'),
  @(($uHive + '\Software\Microsoft\Windows\Shell\BagMRU'), 'Ansichten Desktop/Netzwerk (BagMRU)'),
  @(($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\Streams\Defaults'), 'Standardansicht je Ordnertyp')
)
$n = 0
foreach ($z in $ziele) {
  if (Test-Path $z[0]) { $neu = (Split-Path $z[0] -Leaf) + '.alt_' + $st; Rename-Item -Path $z[0] -NewName $neu -EA Stop; Zeile ($z[1] + ': umbenannt in ' + $neu); $n++ } else { Zeile ($z[1] + ': nicht vorhanden') }
}
foreach ($x in UserProcs @('explorer')) { Stop-Process -Id $x.Id -Force -EA SilentlyContinue }
Start-Sleep -Seconds 4
if (-not @(UserProcs @('explorer')).Count) { Zeile 'Explorer startet nicht von selbst — bitte „Explorer neu starten“ ausführen.' } else { Zeile 'Explorer läuft wieder.' }
Zeile ('Vorher ' + $n + ' gespeicherte Ansichtsbereiche → jetzt Standardansicht. Die alten Schlüssel bleiben als *.alt_' + $st + ' erhalten.')` }),

  A({ id: 'win-fontcache-leeren', titel: 'Schriftarten-Cache von Windows neu aufbauen', modus: 'system', risiko: 'kritisch', timeoutMs: 120000,
    beschreibung: 'Hält den Schriftarten-Cache-Dienst an, löscht die Cache-Dateien (FontCache*.dat, FNTCACHE.DAT) und startet den Dienst wieder — gegen Kästchen, Fragezeichen oder falsche Schriften in Menüs. Danach ist ein Neustart nötig.',
    ps: String.raw`
$lok = Join-Path $env:SystemRoot 'ServiceProfiles\LocalService\AppData\Local'
$dienste = @('FontCache', 'FontCache3.0.0.0' | Where-Object { Get-Service -Name $_ -EA SilentlyContinue })
foreach ($d in $dienste) { $s = Get-Service -Name $d; Zeile ('Dienst ' + $s.DisplayName + ': vorher ' + $s.Status + ' → wird angehalten'); Stop-Service -Name $d -Force -EA SilentlyContinue }
Start-Sleep -Seconds 2
$dat = @()
$dat += @(Get-ChildItem -LiteralPath (Join-Path $lok 'FontCache') -Filter '*.dat' -Force -File -EA SilentlyContinue)
$dat += @(Get-ChildItem -LiteralPath $lok -Filter 'FontCache*.dat' -Force -File -EA SilentlyContinue)
$weg = 0; $gr = 0; $rest = 0
foreach ($f in $dat) { try { $l = $f.Length; Remove-Item -LiteralPath $f.FullName -Force -EA Stop; $weg++; $gr += $l } catch { $rest++ } }
Zeile ('Cache-Dateien: ' + $weg + ' gelöscht (' + (Groesse $gr) + ')' + $(if ($rest) { ', ' + $rest + ' in Benutzung' } else { '' }) + $(if (-not $dat.Count) { ' — keine gefunden bzw. Ordner nicht lesbar' } else { '' }))
$fnt = Join-Path $env:SystemRoot 'System32\FNTCACHE.DAT'
if (Test-Path -LiteralPath $fnt) { try { Remove-Item -LiteralPath $fnt -Force -EA Stop; Zeile 'FNTCACHE.DAT gelöscht (wird beim Start neu erstellt).' } catch { Zeile 'FNTCACHE.DAT ist in Benutzung — Windows erneuert sie beim Neustart.' } }
if ($dienste -contains 'FontCache') { Start-Service -Name 'FontCache' -EA SilentlyContinue; Zeile ('Dienst Windows-Schriftarten-Cache: jetzt ' + (Get-Service -Name 'FontCache').Status) }
Zeile 'Bitte den PC neu starten, damit alle Programme die Schriften neu laden.'` }),

  A({ id: 'win-speicher-bereinigen', titel: 'Speicherplatz freigeben (Windows.old, Fehlerberichte, Übermittlungsoptimierung, Protokolle)', modus: 'system', risiko: 'kritisch', timeoutMs: 1800000,
    beschreibung: 'Entfernt gezielt große Windows-Reste über die Datenträgerbereinigung: vorherige Windows-Installation (Windows.old — danach kein Zurück zur alten Version!), Fehlerberichte und Speicherabbilder (MEMORY.DMP), den Cache der Übermittlungsoptimierung oder alte CBS-Protokolle. Benutzerdateien bleiben unberührt.',
    param: { label: 'Was', platzhalter: 'Windows.old und Setup-Reste', pflicht: true, optionen: ['Windows.old und Setup-Reste', 'Fehlerberichte und Speicherabbilder', 'Übermittlungsoptimierung', 'Alte Windows-Protokolle (CBS)', 'Alles'] },
    ps: String.raw`
$w = $P.Trim()
$alles = $w -match '^Alles'
if (-not ($alles -or $w -match '^(Windows\.old|Fehlerberichte|\S*bermittlung|Alte Windows-Protokolle)')) { throw ('Unbekannte Auswahl: ' + $w) }
function FreiC { [double](Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'").FreeSpace }
$vor = FreiC
$kat = @()
if ($alles -or $w -match '^Windows\.old') {
  Zeile ('Windows.old vorhanden: ' + (Ja (Test-Path -LiteralPath 'C:\Windows.old')))
  $kat += 'Previous Installations', 'Temporary Setup Files', 'Windows Upgrade Log Files', 'Windows ESD installation files', 'Setup Log Files', 'Upgrade Discarded Files', 'Windows Reset Log Files'
}
if ($alles -or $w -match '^Fehlerberichte') {
  $dmp = Join-Path $env:SystemRoot 'MEMORY.DMP'
  if (Test-Path -LiteralPath $dmp) { Zeile ('MEMORY.DMP: ' + (Groesse (Get-Item -LiteralPath $dmp -Force).Length)) }
  $kat += 'Windows Error Reporting Files', 'Windows Error Reporting Archive Files', 'Windows Error Reporting Queue Files', 'Windows Error Reporting System Archive Files', 'Windows Error Reporting System Queue Files', 'Windows Error Reporting Temp Files', 'System error memory dump files', 'System error minidump files', 'Feedback Hub Archive log files', 'Diagnostic Data Viewer database files'
}
if ($alles -or $w -match '^\S*bermittlung') {
  if (Get-Command Delete-DeliveryOptimizationCache -EA SilentlyContinue) {
    try { Delete-DeliveryOptimizationCache -Force -EA Stop; Zeile 'Cache der Übermittlungsoptimierung geleert (wird bei Bedarf neu geladen).' } catch { $kat += 'Delivery Optimization Files' }
  } else { $kat += 'Delivery Optimization Files' }
}
if ($alles -or $w -match '^Alte Windows-Protokolle') {
  $cbs = Join-Path $env:SystemRoot 'Logs\CBS'
  $alt = @(Get-ChildItem -LiteralPath $cbs -Force -File -EA SilentlyContinue | Where-Object { ($_.Extension -eq '.cab' -or $_.Name -like 'CbsPersist_*') -and $_.LastWriteTime -lt (Get-Date).AddDays(-2) })
  $g = 0; $nw = 0; foreach ($f in $alt) { try { $l = $f.Length; Remove-Item -LiteralPath $f.FullName -Force -EA Stop; $g += $l; $nw++ } catch {} }
  Zeile ('CBS-Protokolle: vorher ' + $alt.Count + ' alte Dateien → ' + $nw + ' entfernt (' + (Groesse $g) + '); das aktuelle CBS.log bleibt.')
  $kat += 'Setup Log Files'
}
$vc = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VolumeCaches'
$kat = @($kat | Select-Object -Unique | Where-Object { Test-Path (Join-Path $vc $_) })
if ($kat.Count) {
  foreach ($k in $kat) { Set-ItemProperty -Path (Join-Path $vc $k) -Name 'StateFlags0071' -Value 2 -Type DWord -EA SilentlyContinue }
  $cm = Join-Path $env:SystemRoot 'System32\cleanmgr.exe'
  if (-not (Test-Path -LiteralPath $cm)) { Zeile 'Datenträgerbereinigung (cleanmgr) fehlt auf diesem PC.' } else {
    $pr = Start-Process -FilePath $cm -ArgumentList '/sagerun:71' -WindowStyle Hidden -PassThru
    if (-not $pr.WaitForExit(1500000)) { Zeile 'Die Bereinigung läuft noch im Hintergrund weiter.' } else { Zeile ('Datenträgerbereinigung fertig: ' + ($kat -join ', ')) }
  }
  foreach ($k in $kat) { Remove-ItemProperty -Path (Join-Path $vc $k) -Name 'StateFlags0071' -EA SilentlyContinue }
}
$nach = FreiC
Zeile ('Freier Platz auf C: vorher ' + (Groesse $vor) + ' → jetzt ' + (Groesse $nach) + ' (gewonnen ' + (Groesse ([math]::Max([double]0, $nach - $vor))) + ')')` }),

  // ══ Weitere Programme: Cache leeren bzw. Benutzereinstellungen zurücksetzen ══
  A({ id: 'win-programm-cache', titel: 'Cache eines Programms leeren (Acrobat, Java, Remotedesktop, Power BI)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet das Programm des Benutzers und leert nur dessen Zwischenspeicher (Acrobat-CEF-Cache und UserCache, Java-Cache, Remotedesktop-Bildcache, Power-BI-Cache). Einstellungen und Dateien bleiben.',
    param: { label: 'Programm', platzhalter: 'Adobe Acrobat/Reader', pflicht: true, optionen: ['Adobe Acrobat/Reader', 'Java', 'Remotedesktop', 'Power BI Desktop'] },
    ps: String.raw`
NeedUser
$low = Join-Path $uProf 'AppData\LocalLow'
function CacheWeg([string[]]$pfade) {
  $n = 0
  foreach ($p in $pfade) { if (Test-Path -LiteralPath $p) { ClearDir $p ('Cache ' + $p.Substring($uProf.Length).TrimStart('\')); $n++ } }
  if (-not $n) { Zeile 'Kein Cache-Ordner gefunden (Programm für diesen Benutzer nicht eingerichtet?).' }
}
switch -Regex ($P.Trim()) {
  '^Adobe' {
    StopUser @('Acrobat', 'AcroRd32', 'AcroCEF', 'RdrCEF', 'AdobeCollabSync')
    CacheWeg @((Join-Path $uLocal 'Adobe\AcroCef\DC\Acrobat\Cache'), (Join-Path $uLocal 'Adobe\AcroCef\DC\Reader\Cache'), (Join-Path $uLocal 'Adobe\Acrobat\DC\Cache'))
    foreach ($f in @(Get-ChildItem -LiteralPath (Join-Path $uRoam 'Adobe\Acrobat\DC') -Filter 'UserCache*.bin' -Force -File -EA SilentlyContinue)) { Remove-Item -LiteralPath $f.FullName -Force -EA SilentlyContinue; Zeile ($f.Name + ' (' + (Groesse $f.Length) + ') gelöscht — wird beim Start neu aufgebaut.') }
    break }
  '^Java' { StopUser @('javaw', 'javaws', 'jp2launcher'); CacheWeg @((Join-Path $low 'Sun\Java\Deployment\cache'), (Join-Path $low 'Sun\Java\Deployment\tmp')); break }
  '^Remote' { StopUser @('mstsc'); CacheWeg @((Join-Path $uLocal 'Microsoft\Terminal Server Client\Cache')); break }
  '^Power' {
    StopUser @('PBIDesktop', 'msmdsrv')
    $l = @()
    foreach ($b in (Join-Path $uLocal 'Microsoft\Power BI Desktop'), (Join-Path $uProf 'Microsoft\Power BI Desktop Store App')) { foreach ($u in 'AnalysisServicesWorkspaces', 'Cache', 'CEF') { $l += (Join-Path $b $u) } }
    CacheWeg $l
    break }
  default { throw ('Unbekanntes Programm: ' + $P) }
}` }),

  A({ id: 'win-programm-zuruecksetzen', titel: 'Benutzereinstellungen eines Programms zurücksetzen (Acrobat, Citrix, Remotedesktop …)', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Beendet das Programm und benennt seine Einstellungen im Profil des Benutzers um (Registry + Ordner, *.alt_…) — es startet danach wie neu installiert. Acrobat: digitale IDs, Stempel und Skripte werden übernommen. Citrix: Konten ggf. neu hinzufügen. Remotedesktop: Verlauf, Benutzernamen, Default.rdp.',
    param: { label: 'Programm', platzhalter: 'Adobe Acrobat/Reader', pflicht: true, optionen: ['Adobe Acrobat/Reader', 'Citrix Workspace', 'Remotedesktop', 'Java', 'Notepad++', 'VLC', 'Power BI Desktop', 'Zoom'] },
    ps: String.raw`
NeedHive
$st = Get-Date -Format 'yyyyMMdd_HHmmss'
$low = Join-Path $uProf 'AppData\LocalLow'
function KeyAlt([string]$k, [string]$label) {
  if (-not (Test-Path $k)) { Zeile ($label + ': nicht vorhanden'); return }
  $neu = (Split-Path $k -Leaf) + '.alt_' + $st
  Rename-Item -Path $k -NewName $neu -EA Stop
  Zeile ($label + ': Registry-Schlüssel umbenannt in ' + $neu)
}
switch -Regex ($P.Trim()) {
  '^Adobe' {
    StopUser @('Acrobat', 'AcroRd32', 'AcroCEF', 'RdrCEF', 'AdobeCollabSync')
    foreach ($r in 'Adobe Acrobat\DC', 'Acrobat Reader\DC') { KeyAlt ($uHive + '\Software\Adobe\' + $r) ('Einstellungen ' + $r) }
    $dc = Join-Path $uRoam 'Adobe\Acrobat\DC'
    if (Test-Path -LiteralPath $dc) {
      $an = 'DC.alt_' + $st
      Rename-Item -LiteralPath $dc -NewName $an -Force -EA Stop
      Zeile ('Benutzerordner Adobe\Acrobat\DC umbenannt in ' + $an)
      $alt = Join-Path (Split-Path $dc -Parent) $an
      New-Item -ItemType Directory -Path $dc -Force | Out-Null
      foreach ($u in 'Security', 'Stamps', 'JavaScripts') { $q = Join-Path $alt $u; if (Test-Path -LiteralPath $q) { Copy-Item -LiteralPath $q -Destination $dc -Recurse -Force -EA SilentlyContinue; Zeile ('  übernommen: ' + $u) } }
    } else { Zeile 'Benutzerordner Adobe\Acrobat\DC: nicht vorhanden' }
    [void](RenameAlt (Join-Path $uLocal 'Adobe\Acrobat\DC') 'Lokaler Acrobat-Ordner')
    Zeile 'Acrobat/Reader startet mit Standardeinstellungen (Anmeldung in Acrobat ggf. neu).'
    break }
  '^Citrix' {
    StopUser @('SelfService', 'SelfServicePlugin', 'Receiver', 'redirector', 'concentr', 'wfcrun32', 'wfica32', 'AuthManSvr', 'CDViewer')
    foreach ($r in 'Dazzle', 'Receiver', 'AuthManager', 'ICA Client') { KeyAlt ($uHive + '\Software\Citrix\' + $r) ('Citrix ' + $r) }
    [void](RenameAlt (Join-Path $uRoam 'ICAClient') 'Citrix ICAClient')
    [void](RenameAlt (Join-Path $uLocal 'Citrix\SelfService') 'Citrix SelfService (lokal)')
    [void](RenameAlt (Join-Path $uRoam 'Citrix\SelfService') 'Citrix SelfService (servergespeichert)')
    Zeile 'Citrix Workspace neu starten — Konten, die nicht per Richtlinie kommen, neu hinzufügen.'
    break }
  '^Remote' {
    StopUser @('mstsc')
    KeyAlt ($uHive + '\Software\Microsoft\Terminal Server Client') 'Remotedesktop-Verlauf, Benutzernamen und Zertifikatsfreigaben'
    $doks = @((Join-Path $uProf 'Documents'))
    try { $roh = [string](Get-Item -Path ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') -EA Stop).GetValue('Personal', $null, 'DoNotExpandEnvironmentNames'); if ($roh) { $doks += ($roh -ireplace '%USERPROFILE%', $uProf) } } catch {}
    $n = 0
    foreach ($d in @($doks | Select-Object -Unique)) { $f = Join-Path $d 'Default.rdp'; if (Test-Path -LiteralPath $f) { [void](RenameAlt $f ('Default.rdp in ' + $d)); $n++ } }
    if (-not $n) { Zeile 'Default.rdp: nicht vorhanden' }
    ClearDir (Join-Path $uLocal 'Microsoft\Terminal Server Client\Cache') 'Remotedesktop-Bildcache'
    break }
  '^Java' { StopUser @('javaw', 'javaws', 'jp2launcher'); if (RenameAlt (Join-Path $low 'Sun\Java\Deployment') 'Java-Einstellungen, Ausnahmeliste und Cache') { Zeile 'Eigene Einträge der Ausnahmeliste (security\exception.sites) liegen im umbenannten Ordner.' }; break }
  '^Notepad' { StopUser @('notepad++'); if (RenameAlt (Join-Path $uRoam 'Notepad++') 'Notepad++-Einstellungen und Sitzung') { Zeile 'Ungespeicherte Tabs liegen im umbenannten Ordner unter „backup“.' }; break }
  '^VLC' { StopUser @('vlc'); [void](RenameAlt (Join-Path $uRoam 'vlc') 'VLC-Einstellungen'); break }
  '^Power' { StopUser @('PBIDesktop', 'msmdsrv'); $r1 = RenameAlt (Join-Path $uLocal 'Microsoft\Power BI Desktop') 'Power BI Desktop'; $r2 = RenameAlt (Join-Path $uProf 'Microsoft\Power BI Desktop Store App') 'Power BI Desktop (Store-Version)'; if ($r1 -or $r2) { Zeile 'Automatisch gesicherte Berichte (TempSaves) liegen im umbenannten Ordner.' }; break }
  '^Zoom' { StopUser @('Zoom'); if (RenameAlt (Join-Path $uRoam 'Zoom\data') 'Zoom-Daten und Anmeldung') { Zeile 'Zoom fragt beim nächsten Start nach der Anmeldung.' }; break }
  default { throw ('Unbekanntes Programm: ' + $P) }
}` }),

  // ══ Lesend: Shell-Erweiterungen (Kontextmenü, Vorschau, Symbol-Überlagerungen) ══
  A({ id: 'win-shell-erweiterungen', titel: 'Explorer-Erweiterungen anzeigen (Kontextmenü, Vorschau, Überlagerungen)', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Listet Kontextmenü-Erweiterungen und Vorschau-Handler von Drittanbietern (mit DLL und Hersteller, verwaiste markiert), gesperrte Erweiterungen und die Symbol-Überlagerungen (nur 15 werden angezeigt) — Ursache für langsamen Rechtsklick, Explorer-Abstürze, fehlende OneDrive-Haken.',
    ps: String.raw`
$quellen = @('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes')
if ($uHive -and (Test-Path ($uHive + '_Classes'))) { $quellen += ($uHive + '_Classes') }
function DllZu([string]$clsid) {
  foreach ($q in ($quellen + 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\WOW6432Node')) {
    $k = $q + '\CLSID\' + $clsid + '\InprocServer32'
    if (Test-Path -LiteralPath $k) {
      $d = [string](Get-ItemProperty -LiteralPath $k -EA SilentlyContinue).'(default)'
      if ($d) {
        $d = [Environment]::ExpandEnvironmentVariables($d.Trim().Trim('"'))
        if (-not [IO.Path]::IsPathRooted($d)) { $c = Join-Path $env:SystemRoot ('System32\' + $d); if (Test-Path -LiteralPath $c) { $d = $c } }
        return $d
      }
    }
  }
  return ''
}
function FirmaVon([string]$dll) { if ($dll -and (Test-Path -LiteralPath $dll)) { return [string](Get-Item -LiteralPath $dll -EA SilentlyContinue).VersionInfo.CompanyName }; return '' }
function IstMs([string]$dll, [string]$firma) { return ($firma -match 'Microsoft' -or $dll -match '\\Windows\\(System32|SysWOW64)\\') }
function DllText([string]$dll, [string]$firma) {
  if (-not $dll) { return 'DLL nicht eingetragen (verwaist)' }
  if ([IO.Path]::IsPathRooted($dll) -and -not (Test-Path -LiteralPath $dll)) { return ($dll + ' — DATEI FEHLT (verwaist, z. B. nach Update/Deinstallation)') }
  return ($dll + $(if ($firma) { ' · ' + $firma } else { '' }))
}
$orte = @(@('*', 'Dateien'), @('AllFilesystemObjects', 'Dateien und Ordner'), @('Directory', 'Ordner'), @('Directory\Background', 'Ordner-Hintergrund'), @('Folder', 'Ordner'), @('Drive', 'Laufwerke'))
$fremd = 0; $ms = 0; $gesehen = @{}
foreach ($o in $orte) {
  foreach ($q in $quellen) {
    foreach ($h in @(Get-ChildItem -LiteralPath ($q + '\' + $o[0] + '\shellex\ContextMenuHandlers') -EA SilentlyContinue)) {
      $clsid = [string]$h.GetValue('')
      if ($clsid -notmatch '^\{[0-9A-Fa-f-]{36}\}$') { $clsid = [string]$h.PSChildName }
      if ($clsid -notmatch '^\{[0-9A-Fa-f-]{36}\}$') { continue }
      $schl = $o[1] + '|' + $clsid.ToLower()
      if ($gesehen.ContainsKey($schl)) { continue }
      $gesehen[$schl] = 1
      $dll = DllZu $clsid; $firma = FirmaVon $dll
      if (IstMs $dll $firma) { $ms++; continue }
      $fremd++
      Zeile ('Kontextmenü ' + $o[1] + ': ' + $h.PSChildName + ' · ' + (DllText $dll $firma))
    }
  }
}
Zeile ('Kontextmenü: ' + $fremd + ' Erweiterungen von Drittanbietern, ' + $ms + ' von Microsoft/Windows.')
$pv = Get-ItemProperty -LiteralPath 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\PreviewHandlers' -EA SilentlyContinue
if ($pv) {
  foreach ($e in @($pv.PSObject.Properties | Where-Object { $_.Name -match '^\{' })) {
    $dll = DllZu $e.Name; $firma = FirmaVon $dll
    if (-not (IstMs $dll $firma)) { Zeile ('Vorschau-Handler: ' + $e.Value + ' · ' + (DllText $dll $firma)) }
  }
}
$bl = Get-ItemProperty -LiteralPath 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked' -EA SilentlyContinue
if ($bl) { $b = @($bl.PSObject.Properties | Where-Object { $_.Name -match '^\{' }); if ($b.Count) { Zeile ('Gesperrte Erweiterungen: ' + (($b | ForEach-Object { $_.Name }) -join ', ')) } }
$ov = [string[]]@(Get-ChildItem -LiteralPath 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\ShellIconOverlayIdentifiers' -EA SilentlyContinue | ForEach-Object { [string]$_.PSChildName })
if ($ov.Count) {
  [Array]::Sort($ov, [StringComparer]::OrdinalIgnoreCase)
  Zeile ('Symbol-Überlagerungen: ' + $ov.Count + ' (Windows zeigt nur die ersten 15)')
  if ($ov.Count -gt 15) { Zeile ('  Werden NICHT angezeigt: ' + (($ov | Select-Object -Skip 15 | ForEach-Object { $_.Trim() }) -join ', ')) }
}
Zeile 'Verdächtige Einträge (verwaist, alte Tools) über Support Tools → Deinstallation entfernen.'` }),
]
