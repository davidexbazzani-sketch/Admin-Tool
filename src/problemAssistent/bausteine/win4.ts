// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „win“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Bereich „Windows & Oberfläche“: Windows-11-Schalter (Taskleiste, Start, Suche, Andocken, Hinweise),
// weitere Explorer-Einstellungen, Darstellung/Bedienungshilfen/Uhrzeitformat in der Sitzung des Benutzers,
// Richtlinien der Oberfläche (nur lesend) und Dateizuordnungen.
//   • Einstellungen des Benutzers nur über $uHive (Art „profil“) bzw. in seiner Sitzung (Art „benutzer“).
//   • Jeder ändernde Baustein gibt den alten und den neuen Wert aus.
//   • Benutzerdaten (Sprunglisten, Verläufe, Zuordnungen) werden umbenannt (*.alt_…) — nie gelöscht.
//   • Richtlinien (GPO/Intune) werden nur gelesen und gemeldet, nie geändert.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Registry-Wert setzen (Schlüssel nur anlegen, wenn er fehlt) und alt → neu ausgeben. */
const SETZE = String.raw`
function SetzeWert([string]$k, [string]$n, $v, [string]$typ, [string]$label) {
  if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
  $alt = (Get-ItemProperty -Path $k -Name $n -EA SilentlyContinue).$n
  Set-ItemProperty -Path $k -Name $n -Value $v -Type $typ -EA Stop
  $a = if ($null -eq $alt) { 'nicht gesetzt' } elseif ([string]$alt -eq '') { '(leer)' } else { [string]$alt }
  $b = if ([string]$v -eq '') { '(leer)' } else { [string]$v }
  Zeile ($label + ': vorher ' + $a + ' → jetzt ' + $b)
}
`

/** Richtlinie (Computer und Benutzer) lesen und melden — nur lesend. */
const POL = String.raw`
function Pol([string]$rel, [string]$n, [string]$text) {
  $wo = @(('HKLM:\' + $rel))
  if ($uHive) { $wo += ($uHive + '\' + $rel) }
  foreach ($w in $wo) {
    $v = (Get-ItemProperty -Path $w -Name $n -EA SilentlyContinue).$n
    if ($null -ne $v) { Zeile ('Achtung: Richtlinie ' + $n + ' = ' + [string]$v + ' (' + $text + ') — sie hat Vorrang, zuständig ist DXC.'); return }
  }
}
`

const SHELL_OPTIONEN = [
  'Widgets ausblenden', 'Chat-Symbol (Teams kostenlos) ausblenden', 'Copilot-Knopf ausblenden', 'Aufgabenansicht-Knopf einblenden', 'Aufgabenansicht-Knopf ausblenden',
  'Sekunden in der Uhr anzeigen', 'Uhrzeit und Datum anzeigen', 'Zähler an Taskleistensymbolen anzeigen', 'Task beenden im Rechtsklick', 'Desktop über die Taskleistenecke aus',
  'Start: mehr angeheftete Apps', 'Start: Empfehlungen und Tipps aus', 'Start: zuletzt geöffnete Dateien anzeigen', 'Start: Kontohinweise aus',
  'Suche: Suchhervorhebungen aus', 'Suche: Suchverlauf aus',
  'Andocken: keine Vorschläge', 'Andocken: keine Layout-Leiste oben', 'Andocken: keine Layouts am Maximieren-Knopf',
  'Tipps und Vorschläge aus', 'Willkommensseite nach Updates aus', 'Sperrbildschirm: keine Tipps', 'Sperrbildschirm: keine Benachrichtigungen', 'Sperrbildschirm: Benachrichtigungen wieder anzeigen',
  'Dynamische Sperre aus', 'Spielleiste (Game Bar) aus', 'Anmeldebildschirm: deutsche Tastatur',
]

const EXPLORER_OPTIONEN = [
  'Auswahl-Kontrollkästchen aus', 'Navigationsbereich: alle Ordner anzeigen', 'Navigationsbereich wieder einblenden', 'Galerie ausblenden', 'Ordnertyp-Erkennung aus',
  'Downloads ohne Gruppierung', 'Kompaktansicht ein', 'Kopierdialog mit Details', 'Papierkorb: nicht sofort löschen', 'Papierkorb: 10 % je Laufwerk',
  'Statusleiste anzeigen', 'Popup-Beschreibungen aus', 'Hinweise von Synchronisierungsanbietern aus', 'Laufwerksbuchstaben vor dem Namen', 'Start: keine Dateien von Office.com',
  'Komprimierte Dateien nicht farbig', 'Desktopsymbole mittelgroß', 'Desktopsymbol-Abstand Standard', 'Blickpunkt-Symbol ausblenden', 'Hintergrundbild in voller Qualität',
  'F1-Hilfe im Explorer aus', 'Senden an: Standardeinträge wiederherstellen', 'Win+X-Menü wiederherstellen', 'Sprunglisten zurücksetzen', 'Adressleisten- und Ausführen-Verlauf leeren',
]

const SITZUNG_OPTIONEN = [
  'Heller Modus', 'Dunkler Modus', 'Transparenzeffekte aus', 'Animationen aus', 'Visuelle Effekte: Windows-Standard', 'Akzentfarbe nicht auf Taskleiste und Titelleisten',
  'Textgröße 100 %', 'Mauszeiger Standard', 'Bildlaufleisten immer anzeigen', 'Zeigerposition bei Strg aus', 'Fenster nicht durch Zeigen aktivieren',
  'Zeiger nicht auf Standardschaltfläche setzen', 'Zugriffstasten immer unterstreichen',
  'Bedienungshilfen nicht automatisch starten', '24-Stunden-Uhr', 'Woche beginnt am Montag', 'Feststelltaste mit Feststelltaste lösen',
  'Sprachleiste in der Taskleiste, eine Sprache für alle Fenster', 'Nur Deutsch als Sprache und Tastatur', 'Zwischenablage leeren',
]

const RICHTLINIEN_BEREICHE = ['Alles', 'Hintergrund und Sperrbildschirm', 'Bildschirmschoner und Sperre', 'Start, Taskleiste und Suche', 'Explorer und Dateien', 'Benachrichtigungen', 'Uhrzeit, Sprache, Region', 'Einstellungen und Systemsteuerung']

export const AKTIONEN_WIN4: PaAktion[] = [
  // ══ Windows-11-Schalter: Taskleiste, Start, Suche, Andocken, Hinweise ══════════
  A({ id: 'win4-shell-option', titel: 'Taskleiste, Start, Suche, Andocken und Windows-Hinweise des Benutzers einstellen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Setzt einen Windows-11-Schalter im Profil des angemeldeten Benutzers: Widgets, Chat-, Copilot- und Aufgabenansicht-Knopf, Sekunden/Datum in der Uhr, Zähler, „Task beenden“, Startmenü (mehr Apps, Empfehlungen, zuletzt geöffnet, Kontohinweise), Suchhervorhebungen/-verlauf, Andock-Vorschläge, Tipps, Willkommensseite, Sperrbildschirm, dynamische Sperre, Spielleiste sowie die Tastatur am Anmeldebildschirm. Zeigt alte und neue Werte und meldet Richtlinien, die Vorrang haben.',
    param: { label: 'Einstellung', platzhalter: 'Widgets ausblenden', pflicht: true, optionen: SHELL_OPTIONEN },
    ps: String.raw`
$w = $P.Trim()
if ($w -notmatch '^Anmeldebildschirm') { NeedHive }
` + SETZE + POL + String.raw`
$exp = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer'
$adv = $exp + '\Advanced'
$cdm = $uHive + '\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'
$noc = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings'
$such = $uHive + '\Software\Microsoft\Windows\CurrentVersion\SearchSettings'
$wann = 'nach „Explorer neu starten“'
$start = 'nach „Startmenü und Suche neu starten“'
switch -Regex ($w) {
  '^Widgets' {
    try { SetzeWert $adv 'TaskbarDa' 0 'DWord' 'Widgets in der Taskleiste (1 = an, 0 = aus)' }
    catch { Zeile ('Widgets: Windows schützt diesen Schalter gegen Änderungen von außen (' + $_.Exception.Message + '). Der Benutzer schaltet ihn selbst aus: Rechtsklick auf die Taskleiste → Taskleisteneinstellungen → Widgets.') }
    Pol 'SOFTWARE\Policies\Microsoft\Dsh' 'AllowNewsAndInterests' 'Widgets per Richtlinie'
    break }
  '^Chat' { SetzeWert $adv 'TaskbarMn' 0 'DWord' 'Chat-Symbol (Teams kostenlos) in der Taskleiste (1 = an)'; Pol 'SOFTWARE\Policies\Microsoft\Windows\Windows Chat' 'ChatIcon' 'Chat-Symbol per Richtlinie'; break }
  '^Copilot' {
    SetzeWert $adv 'ShowCopilotButton' 0 'DWord' 'Copilot-Knopf in der Taskleiste (1 = an)'
    Pol 'Software\Policies\Microsoft\Windows\WindowsCopilot' 'TurnOffWindowsCopilot' 'Copilot per Richtlinie'
    Zeile 'Ist Copilot auf neueren Windows-Versionen als App angeheftet, löst der Benutzer sie per Rechtsklick → „Von Taskleiste lösen“.'
    break }
  '^Aufgabenansicht-Knopf ein' { SetzeWert $adv 'ShowTaskViewButton' 1 'DWord' 'Knopf „Aufgabenansicht“ (1 = an)'; break }
  '^Aufgabenansicht-Knopf aus' { SetzeWert $adv 'ShowTaskViewButton' 0 'DWord' 'Knopf „Aufgabenansicht“ (1 = an)'; break }
  '^Sekunden' { SetzeWert $adv 'ShowSecondsInSystemClock' 1 'DWord' 'Sekunden in der Taskleistenuhr (1 = an)'; Zeile 'Braucht Windows 11 ab Version 22H2 (Stand Frühjahr 2023 oder neuer).'; break }
  '^Uhrzeit und Datum' {
    SetzeWert $adv 'ShowSystrayDateTimeValueName' 1 'DWord' 'Uhrzeit und Datum im Infobereich (1 = anzeigen, 0 = ausgeblendet)'
    SetzeWert $adv 'TaskbarSmallIcons' 0 'DWord' 'Kleine Taskleistenschaltflächen (Windows 10 blendet dabei das Datum aus; 0 = aus)'
    Pol 'Software\Microsoft\Windows\CurrentVersion\Policies\Explorer' 'HideClock' 'Uhr ausgeblendet'
    break }
  '^Z.hler' { SetzeWert $adv 'TaskbarBadges' 1 'DWord' 'Zähler (Badges) an Taskleistensymbolen (1 = an)'; break }
  '^Task beenden' { SetzeWert ($adv + '\TaskbarDeveloperSettings') 'TaskbarEndTask' 1 'DWord' '„Task beenden“ im Rechtsklick der Taskleiste (1 = an)'; Zeile 'Braucht Windows 11 23H2 oder neuer.'; break }
  '^Desktop .ber' { SetzeWert $adv 'TaskbarSd' 0 'DWord' 'Klick in die äußerste rechte Ecke der Taskleiste zeigt den Desktop (1 = an)'; break }
  '^Start: mehr' { SetzeWert $adv 'Start_Layout' 1 'DWord' 'Aufteilung des Startmenüs (0 = Standard, 1 = mehr angeheftete Apps, 2 = mehr Empfehlungen)'; $wann = $start; break }
  '^Start: Empfehlungen' {
    SetzeWert $adv 'Start_IrisRecommendations' 0 'DWord' 'Empfehlungen für Tipps, Verknüpfungen und neue Apps (1 = an)'
    SetzeWert $cdm 'SubscribedContent-338388Enabled' 0 'DWord' 'App-Vorschläge im Startmenü (1 = an)'
    $wann = $start; break }
  '^Start: zuletzt' {
    SetzeWert $adv 'Start_TrackDocs' 1 'DWord' 'Zuletzt geöffnete Elemente in Start, Sprunglisten und Explorer (1 = an)'
    SetzeWert $adv 'Start_TrackProgs' 1 'DWord' 'Häufig verwendete Apps merken (1 = an)'
    SetzeWert $exp 'ShowRecent' 1 'DWord' 'Zuletzt verwendete Dateien im Explorer (1 = an)'
    Pol 'Software\Microsoft\Windows\CurrentVersion\Policies\Explorer' 'NoRecentDocsHistory' 'kein Verlauf zuletzt geöffneter Dateien'
    Pol 'Software\Microsoft\Windows\CurrentVersion\Policies\Explorer' 'ClearRecentDocsOnExit' 'Verlauf beim Abmelden leeren'
    Pol 'Software\Policies\Microsoft\Windows\Explorer' 'HideRecommendedSection' 'Bereich „Empfohlen“ ausgeblendet'
    $wann = $start + ' bzw. Ab- und Anmelden'; break }
  '^Start: Konto' { SetzeWert $adv 'Start_AccountNotifications' 0 'DWord' 'Kontobezogene Hinweise am Profilbild im Startmenü (1 = an)'; $wann = $start; break }
  '^Suche: Suchhervorhebungen' { SetzeWert $such 'IsDynamicSearchBoxEnabled' 0 'DWord' 'Suchhervorhebungen (Bilder, Wissenswertes) in der Suche (1 = an)'; Pol 'SOFTWARE\Policies\Microsoft\Windows\Windows Search' 'EnableDynamicContentInWSB' 'Suchhervorhebungen per Richtlinie'; $wann = $start; break }
  '^Suche: Suchverlauf' { SetzeWert $such 'IsDeviceSearchHistoryEnabled' 0 'DWord' 'Suchverlauf auf diesem Gerät (1 = an)'; Zeile 'Gemerkte Suchbegriffe verschwinden mit dem Neustart der Suche; neue werden nicht mehr gespeichert.'; $wann = $start; break }
  '^Andocken: keine Vorschl' { SetzeWert $adv 'SnapAssist' 0 'DWord' 'Nach dem Andocken andere Fenster vorschlagen (1 = an)'; break }
  '^Andocken: keine Layout-Leiste' { SetzeWert $adv 'EnableSnapBar' 0 'DWord' 'Layout-Leiste beim Ziehen an den oberen Rand (1 = an)'; break }
  '^Andocken: keine Layouts am' { SetzeWert $adv 'EnableSnapAssistFlyout' 0 'DWord' 'Layouts beim Zeigen auf den Maximieren-Knopf (1 = an)'; break }
  '^Tipps' {
    SetzeWert $cdm 'SubscribedContent-338389Enabled' 0 'DWord' 'Tipps und Vorschläge bei der Verwendung von Windows (1 = an)'
    SetzeWert $cdm 'SoftLandingEnabled' 0 'DWord' 'Hinweise zu Windows-Funktionen (1 = an)'
    SetzeWert $cdm 'SystemPaneSuggestionsEnabled' 0 'DWord' 'Vorschläge in Start und Einstellungen (1 = an)'
    SetzeWert ($noc + '\Windows.SystemToast.Suggested') 'Enabled' 0 'DWord' 'Benachrichtigungen „Vorgeschlagen“ (1 = an)'
    $wann = 'sofort für neue Hinweise'; break }
  '^Willkommensseite' {
    SetzeWert ($uHive + '\Software\Microsoft\Windows\CurrentVersion\UserProfileEngagement') 'ScoobeSystemSettingEnabled' 0 'DWord' '„Einrichtung des Geräts abschließen“ nach Updates (1 = an)'
    SetzeWert $cdm 'SubscribedContent-310093Enabled' 0 'DWord' 'Willkommensseite „Neuerungen“ nach Updates (1 = an)'
    $wann = 'ab dem nächsten Update'; break }
  '^Sperrbildschirm: keine Tipps' {
    SetzeWert $cdm 'RotatingLockScreenOverlayEnabled' 0 'DWord' 'Wissenswertes, Tipps und Tricks auf dem Sperrbildschirm (1 = an)'
    SetzeWert $cdm 'SubscribedContent-338387Enabled' 0 'DWord' 'Hinweise und Werbung auf dem Sperrbildschirm (1 = an)'
    Pol 'Software\Policies\Microsoft\Windows\CloudContent' 'DisableWindowsSpotlightFeatures' 'Windows-Blickpunkt per Richtlinie'
    $wann = 'beim nächsten Sperren'; break }
  '^Sperrbildschirm: keine Benachrichtigungen' {
    SetzeWert $noc 'NOC_GLOBAL_SETTING_ALLOW_TOASTS_ABOVE_LOCK' 0 'DWord' 'Benachrichtigungen auf dem Sperrbildschirm (1 = an)'
    SetzeWert $noc 'NOC_GLOBAL_SETTING_ALLOW_CRITICAL_TOASTS_ABOVE_LOCK' 0 'DWord' 'Erinnerungen und eingehende Anrufe auf dem Sperrbildschirm (1 = an)'
    $wann = 'beim nächsten Sperren'; break }
  '^Sperrbildschirm: Benachrichtigungen wieder' {
    SetzeWert $noc 'NOC_GLOBAL_SETTING_ALLOW_TOASTS_ABOVE_LOCK' 1 'DWord' 'Benachrichtigungen auf dem Sperrbildschirm (1 = an)'
    SetzeWert $noc 'NOC_GLOBAL_SETTING_ALLOW_CRITICAL_TOASTS_ABOVE_LOCK' 1 'DWord' 'Erinnerungen und eingehende Anrufe auf dem Sperrbildschirm (1 = an)'
    Pol 'SOFTWARE\Policies\Microsoft\Windows\System' 'DisableLockScreenAppNotifications' 'App-Benachrichtigungen auf dem Sperrbildschirm gesperrt'
    Pol 'Software\Policies\Microsoft\Windows\CurrentVersion\PushNotifications' 'NoToastApplicationNotificationOnLockScreen' 'keine Benachrichtigungen auf dem Sperrbildschirm'
    $wann = 'beim nächsten Sperren'; break }
  '^Dynamische Sperre' {
    SetzeWert ($uHive + '\Software\Microsoft\Windows NT\CurrentVersion\Winlogon') 'EnableGoodbye' 0 'DWord' 'Dynamische Sperre – sperren, sobald das gekoppelte Handy außer Reichweite ist (1 = an)'
    Pol 'SOFTWARE\Policies\Microsoft\PassportForWork\DynamicLock' 'DynamicLock' 'dynamische Sperre per Richtlinie'
    $wann = 'sofort'; break }
  '^Spielleiste' {
    SetzeWert ($uHive + '\Software\Microsoft\Windows\CurrentVersion\GameDVR') 'AppCaptureEnabled' 0 'DWord' 'Aufnahmen von Spielen und Apps (1 = an)'
    SetzeWert ($uHive + '\System\GameConfigStore') 'GameDVR_Enabled' 0 'DWord' 'Game DVR / Spielleiste (1 = an)'
    SetzeWert ($uHive + '\Software\Microsoft\GameBar') 'UseNexusForGameBarEnabled' 0 'DWord' 'Spielleiste per Controller-/Xbox-Taste öffnen (1 = an)'
    SetzeWert ($uHive + '\Software\Microsoft\GameBar') 'ShowStartupPanel' 0 'DWord' 'Startfenster der Spielleiste (1 = an)'
    Pol 'SOFTWARE\Policies\Microsoft\Windows\GameDVR' 'AllowGameDVR' 'Spielaufzeichnung per Richtlinie'
    $wann = 'nach Ab- und Anmelden'; break }
  '^Anmeldebildschirm' {
    $k = 'Registry::HKEY_USERS\.DEFAULT\Keyboard Layout\Preload'
    if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
    $vorl = Get-ItemProperty $k -EA SilentlyContinue
    $alt = @($vorl.PSObject.Properties | Where-Object { $_.Name -match '^\d+$' } | Sort-Object { [int]$_.Name } | ForEach-Object { [string]$_.Value })
    if ($alt.Count -and $alt[0] -eq '00000407') { Zeile ('Anmeldebildschirm: Deutsch (00000407) ist bereits die erste Tastatur (' + ($alt -join ', ') + ') — nichts geändert.') }
    else {
      $neu = @('00000407') + @($alt | Where-Object { $_ -ne '00000407' })
      foreach ($e in @($vorl.PSObject.Properties | Where-Object { $_.Name -match '^\d+$' })) { Remove-ItemProperty -Path $k -Name $e.Name -EA SilentlyContinue }
      for ($i = 0; $i -lt $neu.Count; $i++) { Set-ItemProperty -Path $k -Name ([string]($i + 1)) -Value $neu[$i] -Type String -EA Stop }
      Zeile ('Tastaturen am Anmeldebildschirm: vorher ' + $(if ($alt.Count) { $alt -join ', ' } else { '—' }) + ' → jetzt ' + ($neu -join ', ') + ' (00000407 = Deutsch)')
    }
    $wann = 'am nächsten Anmeldebildschirm (nach Abmelden bzw. Neustart)'; break }
  default { throw ('Unbekannte Einstellung: ' + $P) }
}
Zeile ('Wirksam ' + $wann + '.')` }),

  // ══ Explorer, Desktop, Papierkorb, Senden an, Verläufe ═══════════════════════
  A({ id: 'win4-explorer-option', titel: 'Weitere Explorer- und Desktop-Einstellung des Benutzers setzen (Navigation, Papierkorb, Senden an, Verläufe)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Setzt im Profil des angemeldeten Benutzers eine Explorer-/Desktop-Einstellung, die „Explorer- und Desktop-Einstellung setzen“ nicht kennt: Auswahl-Kontrollkästchen, Navigationsbereich, Galerie, Ordnertyp, Downloads-Gruppierung, Kompaktansicht, Kopierdialog, Papierkorb, Statusleiste, Laufwerksbuchstaben, Office.com-Dateien, Desktopsymbole, Hintergrundqualität, F1-Hilfe — oder repariert „Senden an“, das Win+X-Menü, Sprunglisten bzw. leert Adressleisten-/Ausführen-Verlauf (alte Stände bleiben als *.alt_… erhalten). Zeigt alte und neue Werte.',
    param: { label: 'Einstellung', platzhalter: 'Kopierdialog mit Details', pflicht: true, optionen: EXPLORER_OPTIONEN },
    ps: String.raw`
NeedHive
` + SETZE + POL + String.raw`
$exp = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer'
$adv = $exp + '\Advanced'
$cls = $uHive + '_Classes'
if (-not (Test-Path $cls)) { $cls = $uHive + '\Software\Classes' }
$shell = $cls + '\Local Settings\Software\Microsoft\Windows\Shell'
$st = Get-Date -Format 'yyyyMMdd_HHmmss'
$wann = 'nach „Explorer neu starten“'
function ExplorerAus { foreach ($x in UserProcs @('explorer')) { Stop-Process -Id $x.Id -Force -EA SilentlyContinue }; Start-Sleep -Seconds 1 }
function ExplorerDa { Start-Sleep -Seconds 3; if (@(UserProcs @('explorer')).Count) { Zeile 'Explorer läuft wieder.' } else { Zeile 'Explorer startet nicht von selbst — bitte „Explorer neu starten“ ausführen.' } }
switch -Regex ($P.Trim()) {
  '^Auswahl-Kontrollk' { SetzeWert $adv 'AutoCheckSelect' 0 'DWord' 'Kontrollkästchen zur Auswahl von Elementen (1 = an)'; break }
  '^Navigationsbereich: alle' {
    SetzeWert $adv 'NavPaneShowAllFolders' 1 'DWord' 'Alle Ordner im Navigationsbereich (1 = an)'
    SetzeWert $adv 'NavPaneExpandToCurrentFolder' 1 'DWord' 'Navigationsbereich bis zum geöffneten Ordner aufklappen (1 = an)'
    break }
  '^Navigationsbereich wieder' {
    $k = $exp + '\Modules\GlobalSettings\Sizer'
    $b = (Get-ItemProperty -Path $k -Name PageSpaceControlSizer -EA SilentlyContinue).PageSpaceControlSizer
    if ($b -and $b.Length -ge 8) {
      $sicht = [int]$b[4]; $breite = [int]$b[0] + 256 * [int]$b[1]
      if ($sicht -eq 0 -or $breite -lt 100) {
        ExplorerAus
        $b[4] = [byte]1
        if ($breite -lt 100) { $b[0] = [byte]200; $b[1] = [byte]0 }
        Set-ItemProperty -Path $k -Name PageSpaceControlSizer -Value ([byte[]]$b) -Type Binary -EA Stop
        Zeile ('Navigationsbereich: vorher ' + $(if ($sicht -eq 0) { 'ausgeblendet' } else { 'eingeblendet' }) + ', Breite ' + $breite + ' Pixel → jetzt eingeblendet, Breite ' + ([int]$b[0] + 256 * [int]$b[1]) + ' Pixel')
        ExplorerDa; $wann = 'sofort'
      } else { Zeile ('Navigationsbereich: ist eingeblendet (Breite ' + $breite + ' Pixel) — nichts geändert.') }
    } else { Zeile 'Navigationsbereich: keine gespeicherte Einstellung — Windows zeigt ihn standardmäßig an.' }
    break }
  '^Galerie' { SetzeWert ($cls + '\CLSID\{e88865ea-0e1c-4e20-9aa6-edcd0212c87c}') 'System.IsPinnedToNameSpaceTree' 0 'DWord' '„Galerie“ im Navigationsbereich (1 = angezeigt)'; break }
  '^Ordnertyp' {
    SetzeWert ($shell + '\Bags\AllFolders\Shell') 'FolderType' 'NotSpecified' 'String' 'Ordnertyp für Ordner ohne gespeicherte Ansicht (nicht gesetzt = automatisch nach Inhalt)'
    Zeile 'Ordner mit bereits gespeicherter Ansicht behalten sie — dafür vorher „Ordneransichten des Explorers zurücksetzen“.'
    break }
  '^Downloads' {
    $k = $shell + '\Bags\AllFolders\Shell\{885A186E-A440-4ADA-812B-DB871B942259}'
    SetzeWert $k 'GroupView' 0 'DWord' 'Downloads: gruppiert anzeigen (0 = nein)'
    SetzeWert $k 'GroupByKey:FMTID' '{00000000-0000-0000-0000-000000000000}' 'String' 'Downloads: gruppieren nach (Null-GUID = ohne)'
    SetzeWert $k 'GroupByKey:PID' 0 'DWord' 'Downloads: Gruppierungsspalte (0 = keine)'
    SetzeWert $k 'GroupByDirection' 1 'DWord' 'Downloads: Gruppierungsrichtung'
    SetzeWert $k 'Mode' 4 'DWord' 'Downloads: Ansicht (4 = Details)'
    SetzeWert $k 'LogicalViewMode' 1 'DWord' 'Downloads: Ansicht (1 = Details)'
    Zeile 'Hat „Downloads“ schon eine eigene gespeicherte Ansicht, vorher „Ordneransichten des Explorers zurücksetzen“ — oder im Ordner Ansicht → Sortieren → Gruppieren nach → (Ohne).'
    break }
  '^Kompaktansicht' { SetzeWert $adv 'UseCompactMode' 1 'DWord' 'Kompaktansicht – weniger Abstand zwischen den Einträgen (1 = an)'; break }
  '^Kopierdialog' { SetzeWert ($exp + '\OperationStatusManager') 'EnthusiastMode' 1 'DWord' 'Kopier-/Verschiebefenster mit Details (1 = immer „Mehr Details“)'; $wann = 'beim nächsten Kopiervorgang'; break }
  '^Papierkorb: nicht' {
    $n = 0; $alle = 0
    foreach ($v in @(Get-ChildItem -Path ($exp + '\BitBucket\Volume') -EA SilentlyContinue)) {
      $alle++
      $alt = (Get-ItemProperty -LiteralPath $v.PSPath -Name NukeOnDelete -EA SilentlyContinue).NukeOnDelete
      if ($alt -eq 1) { Set-ItemProperty -LiteralPath $v.PSPath -Name NukeOnDelete -Value 0 -Type DWord -EA Stop; $n++; Zeile ('Papierkorb ' + $v.PSChildName + ': vorher „Dateien sofort löschen“ → jetzt in den Papierkorb') }
    }
    if (-not $alle) { Zeile 'Papierkorb: noch keine Einstellungen je Laufwerk gespeichert — Windows-Standard (in den Papierkorb).' }
    elseif (-not $n) { Zeile ('Papierkorb: auf allen ' + $alle + ' Laufwerken war „in den Papierkorb“ schon eingestellt — nichts geändert.') }
    Pol 'Software\Microsoft\Windows\CurrentVersion\Policies\Explorer' 'NoRecycleFiles' 'Dateien sofort löschen'
    Zeile 'Auf Netzlaufwerken gibt es keinen Papierkorb — dort helfen nur die Vorgängerversionen des Servers.'
    $wann = 'sofort'; break }
  '^Papierkorb: 10' {
    $vols = @{}
    foreach ($x in @(Get-CimInstance Win32_Volume -EA SilentlyContinue)) { $g = [regex]::Match([string]$x.DeviceID, '\{[0-9A-Fa-f\-]+\}').Value; if ($g) { $vols[$g.ToUpper()] = $x } }
    $n = 0
    foreach ($v in @(Get-ChildItem -Path ($exp + '\BitBucket\Volume') -EA SilentlyContinue)) {
      $x = $vols[([string]$v.PSChildName).ToUpper()]
      if (-not $x -or -not $x.Capacity) { continue }
      $name = if ($x.DriveLetter) { [string]$x.DriveLetter } else { [string]$x.Label }
      $soll = [int][math]::Floor([double]$x.Capacity / 1MB * 0.1)
      $alt = (Get-ItemProperty -LiteralPath $v.PSPath -Name MaxCapacity -EA SilentlyContinue).MaxCapacity
      if ($null -eq $alt -or [int64]$alt -lt $soll) {
        Set-ItemProperty -LiteralPath $v.PSPath -Name MaxCapacity -Value $soll -Type DWord -EA Stop; $n++
        Zeile ('Papierkorb ' + $name + ': vorher ' + $(if ($null -eq $alt) { 'Standard' } else { '' + $alt + ' MB' }) + ' → jetzt ' + $soll + ' MB (10 % von ' + (Groesse ([double]$x.Capacity)) + ')')
      } else { Zeile ('Papierkorb ' + $name + ': schon ' + $alt + ' MB — nichts geändert.') }
    }
    if (-not $n) { Zeile 'Papierkorb-Größe: nichts geändert (keine passenden Laufwerkseinträge oder schon groß genug).' }
    $wann = 'sofort'; break }
  '^Statusleiste' { SetzeWert $adv 'ShowStatusBar' 1 'DWord' 'Statusleiste unten im Explorer (1 = an)'; break }
  '^Popup' { SetzeWert $adv 'ShowInfoTip' 0 'DWord' 'Popup-Beschreibungen für Ordner und Desktopelemente (1 = an)'; break }
  '^Hinweise von Sync' { SetzeWert $adv 'ShowSyncProviderNotifications' 0 'DWord' 'Hinweise des Synchronisierungsanbieters im Explorer (1 = an)'; break }
  '^Laufwerksbuchstaben' { SetzeWert $exp 'ShowDriveLettersFirst' 4 'DWord' 'Laufwerksbuchstaben (0 = hinter dem Namen, 2 = ausgeblendet, 4 = vor dem Namen)'; break }
  '^Start: keine Dateien' { SetzeWert $exp 'ShowCloudFilesInQuickAccess' 0 'DWord' 'Dateien von Office.com unter „Start“ (1 = an)'; break }
  '^Komprimierte' { SetzeWert $adv 'ShowCompColor' 0 'DWord' 'Komprimierte bzw. verschlüsselte Dateien farbig (blau/grün) anzeigen (1 = an)'; break }
  '^Desktopsymbole mittel' {
    $k = $uHive + '\Software\Microsoft\Windows\Shell\Bags\1\Desktop'
    ExplorerAus
    SetzeWert $k 'IconSize' 48 'DWord' 'Größe der Desktopsymbole (32 = klein, 48 = mittel, 96 = groß)'
    SetzeWert $k 'Mode' 1 'DWord' 'Desktop-Ansicht (1 = Symbole)'
    SetzeWert $k 'LogicalViewMode' 3 'DWord' 'Desktop-Ansicht (3 = Symbole)'
    ExplorerDa; $wann = 'sofort'; break }
  '^Desktopsymbol-Abstand' {
    $k = $uHive + '\Control Panel\Desktop\WindowMetrics'
    SetzeWert $k 'IconSpacing' '-1125' 'String' 'Waagerechter Abstand der Desktopsymbole (Standard -1125)'
    SetzeWert $k 'IconVerticalSpacing' '-1125' 'String' 'Senkrechter Abstand der Desktopsymbole (Standard -1125)'
    $wann = 'nach Ab- und Anmelden'; break }
  '^Blickpunkt' { SetzeWert ($exp + '\HideDesktopIcons\NewStartPanel') '{2cc5ca98-6485-489a-920e-b3e88a6ccce3}' 1 'DWord' 'Desktopsymbol „Weitere Informationen zu diesem Bild“ ausblenden (1 = ja)'; break }
  '^Hintergrundbild' {
    SetzeWert ($uHive + '\Control Panel\Desktop') 'JPEGImportQuality' 100 'DWord' 'Qualität beim Übernehmen von JPEG-Hintergrundbildern in % (Windows-Standard 85)'
    Zeile 'Das Hintergrundbild muss danach einmal neu gesetzt werden (Firmenbild: Benutzer-Richtlinien neu anwenden; eigenes Bild: neu auswählen).'
    $wann = 'beim nächsten Setzen des Hintergrundbilds'; break }
  '^F1' {
    $k = $cls + '\Typelib\{8cec5860-07a1-11d9-b15e-000d56bfe6ee}\1.0\0'
    foreach ($a in 'win64', 'win32') {
      $u = $k + '\' + $a
      $war = Test-Path $u
      if (-not (Test-Path $u)) { New-Item -Path $u -Force | Out-Null }
      Set-ItemProperty -Path $u -Name '(default)' -Value '' -EA Stop
      Zeile ('F1-Hilfe im Explorer/Desktop (' + $a + '): vorher ' + $(if ($war) { 'schon umgeleitet' } else { 'öffnet „Hilfe in Windows“ in Edge' }) + ' → jetzt ohne Wirkung')
    }
    Zeile 'F1 in Programmen (SAP, Office) zeigt weiter deren eigene Hilfe.'
    break }
  '^Senden an' {
    $sd = Join-Path $uRoam 'Microsoft\Windows\SendTo'
    if (-not (Test-Path -LiteralPath $sd)) { New-Item -ItemType Directory -Path $sd -Force | Out-Null }
    foreach ($s in @(@('ZFSendToTarget', 'ZIP-komprimierter Ordner'), @('DeskLink', 'Desktop (Verknüpfung erstellen)'), @('MAPIMail', 'E-Mail-Empfänger'), @('mydocs', 'Dokumente'))) {
      $da = @(Get-ChildItem -LiteralPath $sd -Filter ('*.' + $s[0]) -Force -EA SilentlyContinue)
      if ($da.Count) { Zeile ('Senden an „' + $s[1] + '“: vorhanden (' + $da[0].Name + ')') }
      else { New-Item -ItemType File -Path (Join-Path $sd ($s[1] + '.' + $s[0])) -EA Stop | Out-Null; Zeile ('Senden an „' + $s[1] + '“: fehlte → jetzt angelegt') }
    }
    $wann = 'sofort (beim nächsten Rechtsklick)'; break }
  '^Win\+X' {
    $def = [string](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList' -EA SilentlyContinue).Default
    if (-not $def) { $def = 'C:\Users\Default' }
    $quelle = Join-Path $def 'AppData\Local\Microsoft\Windows\WinX'
    if (-not (Test-Path -LiteralPath (Join-Path $quelle 'Group2'))) { throw ('Vorlage des Win+X-Menüs fehlt im Standardprofil (' + $quelle + ') — dann „Systemdateien prüfen (SFC)“ ausführen.') }
    $ziel = Join-Path $uLocal 'Microsoft\Windows\WinX'
    $vor = @(Get-ChildItem -LiteralPath $ziel -Recurse -Filter '*.lnk' -Force -EA SilentlyContinue).Count
    ExplorerAus
    if (Test-Path -LiteralPath $ziel) { [void](RenameAlt $ziel 'Win+X-Menü des Benutzers') }
    Copy-Item -LiteralPath $quelle -Destination $ziel -Recurse -Force -EA Stop
    $nach = @(Get-ChildItem -LiteralPath $ziel -Recurse -Filter '*.lnk' -Force -EA SilentlyContinue).Count
    Zeile ('Win+X-Menü: vorher ' + $vor + ' Einträge → jetzt ' + $nach + ' Einträge aus dem Windows-Standardprofil')
    ExplorerDa; $wann = 'sofort'; break }
  '^Sprunglisten' {
    $rec = Join-Path $uRoam 'Microsoft\Windows\Recent'
    $qa = 'f01b4d95cf55d32a.automaticDestinations-ms'
    ExplorerAus
    foreach ($u in 'AutomaticDestinations', 'CustomDestinations') {
      $d = Join-Path $rec $u
      if (-not (Test-Path -LiteralPath $d)) { Zeile ('Sprunglisten (' + $u + '): nicht vorhanden'); continue }
      $n = @(Get-ChildItem -LiteralPath $d -File -Force -EA SilentlyContinue).Count
      $neu = $u + '.alt_' + $st
      try {
        Rename-Item -LiteralPath $d -NewName $neu -Force -EA Stop
        New-Item -ItemType Directory -Path $d -Force | Out-Null
        if ($u -eq 'AutomaticDestinations' -and (Test-Path -LiteralPath (Join-Path $rec ($neu + '\' + $qa)))) { Copy-Item -LiteralPath (Join-Path $rec ($neu + '\' + $qa)) -Destination $d -Force -EA SilentlyContinue; Zeile 'Schnellzugriff: angeheftete Ordner übernommen' }
        Zeile ('Sprunglisten (' + $u + '): vorher ' + $n + ' Dateien → jetzt leer (gesichert als ' + $neu + ')')
      } catch { Zeile ('Sprunglisten (' + $u + '): ' + $_.Exception.Message + ' — Datei noch in Benutzung, bitte erneut versuchen.') }
    }
    Zeile 'In Sprunglisten angeheftete Dateien muss der Benutzer neu anheften.'
    ExplorerDa; $wann = 'sofort'; break }
  '^Adressleisten' {
    ExplorerAus
    foreach ($z in @(@(($exp + '\TypedPaths'), 'Adressleisten-Verlauf des Explorers'), @(($exp + '\RunMRU'), 'Verlauf von „Ausführen“ (Windows+R)'), @(($exp + '\WordWheelQuery'), 'Suchverlauf im Explorer'))) {
      if (Test-Path $z[0]) {
        $n = @((Get-Item $z[0]).Property | Where-Object { $_ -ne 'MRUList' -and $_ -ne 'MRUListEx' }).Count
        Rename-Item -Path $z[0] -NewName ((Split-Path $z[0] -Leaf) + '.alt_' + $st) -EA Stop
        Zeile ($z[1] + ': vorher ' + $n + ' Einträge → jetzt leer (gesichert als *.alt_' + $st + ')')
      } else { Zeile ($z[1] + ': war schon leer') }
    }
    ExplorerDa; $wann = 'sofort'; break }
  default { throw ('Unbekannte Einstellung: ' + $P) }
}
Zeile ('Wirksam ' + $wann + '.')` }),

  // ══ In der Sitzung des Benutzers: Darstellung, Bedienungshilfen, Format, Tastatur ═══
  A({ id: 'win4-sitzung-option', titel: 'Darstellung, Bedienungshilfe, Uhrzeitformat oder Tastatur in der Sitzung des Benutzers einstellen', modus: 'benutzer', risiko: 'aendern', timeoutMs: 90000,
    beschreibung: 'Stellt in der Sitzung des angemeldeten Benutzers um und meldet die Änderung sofort an Windows: heller/dunkler Modus, Transparenz, Animationen, visuelle Effekte, Akzentfarbe, Textgröße, Mauszeiger, Bildlaufleisten, Zeigerposition bei Strg, Fensteraktivierung durch Zeigen, Zeigersprung auf die Standardschaltfläche, unterstrichene Zugriffstasten, Bedienungshilfen beim Anmelden, 24-Stunden-Uhr, Wochenbeginn Montag, Feststelltaste, Sprachleiste, nur deutsche Tastatur oder Zwischenablage leeren. Zeigt alte und neue Werte.',
    param: { label: 'Einstellung', platzhalter: 'Heller Modus', pflicht: true, optionen: SITZUNG_OPTIONEN },
    ps: SETZE + String.raw`
$w = $P.Trim()
$ok = @('Heller', 'Dunkler', 'Transparenz', 'Animationen', 'Visuelle', 'Akzentfarbe', 'Textgr', 'Mauszeiger', 'Bildlauf', 'Zeigerposition', 'Zeiger nicht', 'Zugriffstasten', 'Fenster nicht', 'Bedienungshilfen', '24-Stunden', 'Woche', 'Feststelltaste', 'Sprachleiste', 'Nur Deutsch', 'Zwischenablage')
if (-not @($ok | Where-Object { $w.StartsWith($_) }).Count) { throw ('Unbekannte Einstellung: ' + $P) }
$sig = '[DllImport("user32.dll", SetLastError = true)] public static extern bool SystemParametersInfo(uint a, uint u, IntPtr p, uint f); [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, UIntPtr wp, string lp, uint f, uint t, out UIntPtr r);'
$api = @(Add-Type -MemberDefinition $sig -Name ('Win4' + [guid]::NewGuid().ToString('N').Substring(0, 8)) -Namespace ITAdminToolPa -PassThru -EA Stop)[0]
function Melde([string]$was) { $r = [UIntPtr]::Zero; [void]$api::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, $was, 2, 3000, [ref]$r) }
function Spi([uint32]$a, [uint32]$u, [int]$wert) { [void]$api::SystemParametersInfo($a, $u, [IntPtr]$wert, 3) }
function MaskeBit([int]$byte, [int]$bit) { $m = (Get-ItemProperty 'HKCU:\Control Panel\Desktop' -Name UserPreferencesMask -EA SilentlyContinue).UserPreferencesMask; if ($m -and $m.Length -gt $byte) { if (([int]$m[$byte] -band $bit) -ne 0) { 'an' } else { 'aus' } } else { 'unbekannt' } }
$pers = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'
$adv = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'
$desk = 'HKCU:\Control Panel\Desktop'
$intl = 'HKCU:\Control Panel\International'
$wann = 'sofort'
switch -Regex ($w) {
  '^Heller' {
    SetzeWert $pers 'AppsUseLightTheme' 1 'DWord' 'Apps (1 = hell, 0 = dunkel)'
    SetzeWert $pers 'SystemUsesLightTheme' 1 'DWord' 'Windows: Taskleiste, Start, Infocenter (1 = hell, 0 = dunkel)'
    Melde 'ImmersiveColorSet'; $wann = 'sofort (einzelne Programme nach ihrem Neustart)'; break }
  '^Dunkler' {
    SetzeWert $pers 'AppsUseLightTheme' 0 'DWord' 'Apps (1 = hell, 0 = dunkel)'
    SetzeWert $pers 'SystemUsesLightTheme' 0 'DWord' 'Windows: Taskleiste, Start, Infocenter (1 = hell, 0 = dunkel)'
    Melde 'ImmersiveColorSet'; $wann = 'sofort (einzelne Programme nach ihrem Neustart)'; break }
  '^Transparenz' { SetzeWert $pers 'EnableTransparency' 0 'DWord' 'Transparenzeffekte (1 = an)'; Melde 'ImmersiveColorSet'; break }
  '^Animationen' {
    Zeile ('Animationseffekte: vorher ' + (MaskeBit 4 2) + ' → jetzt aus')
    Spi 0x1043 0 0
    SetzeWert ($desk + '\WindowMetrics') 'MinAnimate' '0' 'String' 'Animation beim Minimieren und Maximieren (1 = an)'
    SetzeWert $adv 'TaskbarAnimations' 0 'DWord' 'Animationen in der Taskleiste (1 = an)'
    $wann = 'sofort, vollständig nach Ab- und Anmelden'; break }
  '^Visuelle' {
    SetzeWert 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects' 'VisualFXSetting' 0 'DWord' 'Visuelle Effekte (0 = Windows entscheidet, 2 = optimale Leistung, 3 = benutzerdefiniert)'
    $alt = (Get-ItemProperty $desk -Name UserPreferencesMask -EA SilentlyContinue).UserPreferencesMask
    Set-ItemProperty -Path $desk -Name UserPreferencesMask -Value ([byte[]](0x9E, 0x1E, 0x07, 0x80, 0x12, 0x00, 0x00, 0x00)) -Type Binary -EA Stop
    Zeile ('Effekt-Maske: vorher ' + $(if ($alt) { (@($alt | ForEach-Object { '{0:X2}' -f $_ }) -join ' ') } else { 'nicht gesetzt' }) + ' → jetzt 9E 1E 07 80 12 00 00 00 (Windows-Standard)')
    SetzeWert $desk 'FontSmoothing' '2' 'String' 'Kanten der Bildschirmschriftarten glätten (2 = an)'
    SetzeWert $desk 'DragFullWindows' '1' 'String' 'Fensterinhalt beim Ziehen anzeigen (1 = an)'
    SetzeWert ($desk + '\WindowMetrics') 'MinAnimate' '1' 'String' 'Animation beim Minimieren und Maximieren (1 = an)'
    SetzeWert $adv 'ListviewAlphaSelect' 1 'DWord' 'Durchsichtiges Auswahlrechteck (1 = an)'
    SetzeWert $adv 'ListviewShadow' 1 'DWord' 'Schatten unter Symbolbeschriftungen auf dem Desktop (1 = an)'
    SetzeWert $adv 'TaskbarAnimations' 1 'DWord' 'Animationen in der Taskleiste (1 = an)'
    SetzeWert 'HKCU:\Software\Microsoft\Windows\DWM' 'EnableAeroPeek' 1 'DWord' 'Vorschau „Desktop anzeigen“ (Peek) (1 = an)'
    Spi 0x004B 1 0; Spi 0x0025 1 0; Spi 0x1043 0 1
    $wann = 'teilweise sofort, vollständig nach Ab- und Anmelden'; break }
  '^Akzentfarbe' {
    SetzeWert $pers 'ColorPrevalence' 0 'DWord' 'Akzentfarbe auf Start und Taskleiste (1 = an)'
    SetzeWert 'HKCU:\Software\Microsoft\Windows\DWM' 'ColorPrevalence' 0 'DWord' 'Akzentfarbe auf Titelleisten und Fensterrahmen (1 = an)'
    Melde 'ImmersiveColorSet'; $wann = 'sofort bzw. nach Ab- und Anmelden'; break }
  '^Textgr' { SetzeWert 'HKCU:\Software\Microsoft\Accessibility' 'TextScaleFactor' 100 'DWord' 'Textgröße der Bedienungshilfen in % (100 = Standard)'; $wann = 'nach Ab- und Anmelden'; break }
  '^Mauszeiger' {
    $c = 'HKCU:\Control Panel\Cursors'
    $r = '%SystemRoot%\cursors\'
    $std = [ordered]@{ AppStarting = ($r + 'aero_working.ani'); Arrow = ($r + 'aero_arrow.cur'); Crosshair = ''; Hand = ($r + 'aero_link.cur'); Help = ($r + 'aero_helpsel.cur'); IBeam = ''; No = ($r + 'aero_unavail.cur'); NWPen = ($r + 'aero_pen.cur'); SizeAll = ($r + 'aero_move.cur'); SizeNESW = ($r + 'aero_nesw.cur'); SizeNS = ($r + 'aero_ns.cur'); SizeNWSE = ($r + 'aero_nwse.cur'); SizeWE = ($r + 'aero_ew.cur'); UpArrow = ($r + 'aero_up.cur'); Wait = ($r + 'aero_busy.ani'); Pin = ($r + 'aero_pin.cur'); Person = ($r + 'aero_person.cur') }
    $vor = [string](Get-ItemProperty $c -EA SilentlyContinue).Arrow
    foreach ($n in @($std.Keys)) { Set-ItemProperty -Path $c -Name $n -Value $std[$n] -Type ExpandString -EA SilentlyContinue }
    Set-ItemProperty -Path $c -Name '(default)' -Value 'Windows Default' -EA SilentlyContinue
    SetzeWert $c 'Scheme Source' 2 'DWord' 'Zeigerschema (2 = Windows-Standard)'
    SetzeWert $c 'CursorBaseSize' 32 'DWord' 'Zeigergröße in Pixeln (32 = Standard)'
    SetzeWert 'HKCU:\Software\Microsoft\Accessibility' 'CursorSize' 1 'DWord' 'Zeigergröße in den Bedienungshilfen (1 = Standard)'
    SetzeWert 'HKCU:\Software\Microsoft\Accessibility' 'CursorType' 0 'DWord' 'Zeigerfarbe (0 = weiß/Standard, 1 = schwarz, 2 = invertiert, 6 = eigene Farbe)'
    Spi 0x0057 0 0
    Zeile ('Pfeil-Zeiger: vorher ' + $(if ($vor) { $vor } else { 'Standard' }) + ' → jetzt Windows-Standard (aero_arrow.cur)')
    break }
  '^Bildlauf' { SetzeWert 'HKCU:\Control Panel\Accessibility' 'DynamicScrollbars' 0 'DWord' 'Bildlaufleisten automatisch ausblenden (1 = ja, 0 = immer anzeigen)'; $wann = 'für neu geöffnete Fenster, vollständig nach Ab- und Anmelden'; break }
  '^Zeigerposition' { $vor = MaskeBit 1 0x40; Spi 0x101D 0 0; Zeile ('Zeigerposition bei Strg (Kreise um den Mauszeiger): vorher ' + $vor + ' → jetzt aus'); break }
  '^Fenster nicht' { $vor = MaskeBit 0 0x01; Spi 0x1001 0 0; Spi 0x100D 0 0; Zeile ('Fenster durch Zeigen mit der Maus aktivieren: vorher ' + $vor + ' → jetzt aus (Fenster werden erst per Klick aktiv)'); break }
  '^Zeiger nicht' {
    $alt = [string](Get-ItemProperty 'HKCU:\Control Panel\Mouse' -Name SnapToDefaultButton -EA SilentlyContinue).SnapToDefaultButton
    Spi 0x0060 0 0
    Zeile ('Mauszeiger in Dialogen automatisch auf die Standardschaltfläche setzen: vorher ' + $(if ($alt -eq '1') { 'an' } else { 'aus' }) + ' → jetzt aus')
    break }
  '^Zugriffstasten' { $vor = MaskeBit 0 0x20; Spi 0x100B 0 1; Zeile ('Zugriffstasten (unterstrichene Buchstaben) in Menüs und Dialogen: vorher ' + $(if ($vor -eq 'an') { 'immer' } else { 'erst nach Alt' }) + ' → jetzt immer unterstrichen'); $wann = 'sofort für neu geöffnete Fenster'; break }
  '^Bedienungshilfen' {
    $a = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Accessibility'
    $alt = [string](Get-ItemProperty $a -Name Configuration -EA SilentlyContinue).Configuration
    $teile = @($alt -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $raus = @('narrator', 'magnifierpane', 'livecaptions', 'voiceaccess')
    $neu = @($teile | Where-Object { $raus -notcontains $_.ToLower() })
    if ($teile.Count -ne $neu.Count) { Set-ItemProperty -Path $a -Name Configuration -Value ($neu -join ',') -Type String -EA Stop }
    Zeile ('Beim Anmelden gestartete Bedienungshilfen: vorher „' + $(if ($teile.Count) { $teile -join ',' } else { 'keine' }) + '“ → jetzt „' + $(if ($neu.Count) { $neu -join ',' } else { 'keine' }) + '“')
    SetzeWert 'HKCU:\Software\Microsoft\Narrator\NoRoam' 'WinEnterLaunchEnabled' 0 'DWord' 'Erzähler per Strg+Windows+Eingabe starten (1 = an)'
    $laeuft = @(Get-Process -Name Narrator, Magnify, LiveCaptions, VoiceAccess -EA SilentlyContinue | ForEach-Object { $_.ProcessName } | Select-Object -Unique)
    if ($laeuft.Count) { Zeile ('Läuft gerade noch: ' + ($laeuft -join ', ') + ' — mit „Programm des Benutzers beenden“ schließen.') }
    $wann = 'ab der nächsten Anmeldung'; break }
  '^24-Stunden' {
    SetzeWert $intl 'sShortTime' 'HH:mm' 'String' 'Kurzes Uhrzeitformat'
    SetzeWert $intl 'sTimeFormat' 'HH:mm:ss' 'String' 'Langes Uhrzeitformat'
    SetzeWert $intl 'iTime' '1' 'String' '24-Stunden-Uhr (1 = ja)'
    SetzeWert $intl 'iTLZero' '1' 'String' 'Führende Null bei Stunden (1 = ja)'
    SetzeWert $intl 's1159' '' 'String' 'Kennung vormittags (AM)'
    SetzeWert $intl 's2359' '' 'String' 'Kennung nachmittags (PM)'
    if ((Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Control Panel\International' -EA SilentlyContinue).PreventUserOverrides -eq 1) { Zeile 'Achtung: Eine Richtlinie verbietet eigene Formate — die Richtlinie hat Vorrang.' }
    Melde 'intl'; $wann = 'sofort (offene Programme nach ihrem Neustart)'; break }
  '^Woche' { SetzeWert $intl 'iFirstDayOfWeek' '0' 'String' 'Erster Wochentag (0 = Montag, 6 = Sonntag)'; Melde 'intl'; $wann = 'sofort (offene Programme nach ihrem Neustart)'; break }
  '^Feststelltaste' { SetzeWert 'HKCU:\Keyboard Layout' 'Attributes' 0 'DWord' 'Feststelltaste lösen (65536 = mit der Umschalttaste, 0 = mit der Feststelltaste)'; $wann = 'nach Ab- und Anmelden'; break }
  '^Sprachleiste' {
    $o = Get-WinLanguageBarOption -EA Stop
    Zeile ('Vorher: schwebende Desktop-Sprachleiste ' + $(if ($o.IsLegacyLanguageBar) { 'an' } else { 'aus' }) + ', eigene Eingabesprache je App-Fenster ' + $(if ($o.IsLegacySwitchingMode) { 'an' } else { 'aus' }))
    Set-WinLanguageBarOption -EA Stop
    Zeile 'Jetzt: Sprachanzeige in der Taskleiste, eine Eingabesprache für alle Fenster'
    $wann = 'sofort bzw. nach Ab- und Anmelden'; break }
  '^Nur Deutsch' {
    $l = Get-WinUserLanguageList
    $vor = (@($l | ForEach-Object { [string]$_.LanguageTag + ' [' + (@($_.InputMethodTips) -join ', ') + ']' }) -join '; ')
    $ui = [string](Get-UICulture).Name
    if ($ui -notlike 'de-*') { throw ('Windows läuft für diesen Benutzer auf ' + $ui + ' — „Nur Deutsch“ würde die Anzeigesprache umstellen. Bitte nur „Tastatur auf Deutsch stellen“ verwenden.') }
    $neu = New-WinUserLanguageList -Language 'de-DE'
    $neu[0].InputMethodTips.Clear()
    $neu[0].InputMethodTips.Add('0407:00000407')
    Set-WinUserLanguageList -LanguageList $neu -Force -EA Stop
    Zeile ('Sprachen und Tastaturen: vorher ' + $vor + ' → jetzt de-DE [0407:00000407]')
    $wann = 'sofort, vollständig nach Ab- und Anmelden'; break }
  '^Zwischenablage' {
    $null = [Windows.ApplicationModel.DataTransfer.Clipboard, Windows.ApplicationModel.DataTransfer, ContentType = WindowsRuntime]
    $h = [Windows.ApplicationModel.DataTransfer.Clipboard]::ClearHistory()
    [Windows.ApplicationModel.DataTransfer.Clipboard]::Clear()
    Zeile ('Zwischenablage-Verlauf (Windows+V): ' + $(if ($h) { 'vorher gefüllt → jetzt geleert; angeheftete Einträge bleiben, die löst der Benutzer selbst (Windows+V → … → Lösen)' } else { 'konnte nicht geleert werden (Verlauf aus oder per Richtlinie gesperrt)' }))
    Zeile 'Aktueller Inhalt der Zwischenablage: geleert'
    break }
}
Zeile ('Wirksam ' + $wann + '.')` }),

  // ══ Lesend: Richtlinien der Oberfläche, Dateizuordnungen ════════════════════
  A({ id: 'win4-oberflaeche-richtlinien', titel: 'Richtlinien der Windows-Oberfläche anzeigen (warum etwas ausgegraut ist)', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Zeigt, welche Gruppenrichtlinien bzw. Intune-Vorgaben für Computer und angemeldeten Benutzer die Oberfläche festlegen: Hintergrund und Sperrbildschirm, Bildschirmschoner und Sperre, Start/Taskleiste/Suche, Explorer und Papierkorb, Benachrichtigungen, Uhrzeit/Sprache/Region, Einstellungen/Systemsteuerung/Task-Manager — dazu wichtige Zustände (Bildschirmschoner, automatische Zeitzone). Ändert nichts.',
    param: { label: 'Bereich (optional, leer = alles)', platzhalter: 'Alles', optionen: RICHTLINIEN_BEREICHE },
    ps: String.raw`
$b = $P.Trim()
$pex = 'Software\Microsoft\Windows\CurrentVersion\Policies\Explorer'
$psy = 'Software\Microsoft\Windows\CurrentVersion\Policies\System'
$pwe = 'Software\Policies\Microsoft\Windows\Explorer'
$alle = [ordered]@{
  'Hintergrund und Sperrbildschirm' = @(
    ('B|' + $psy + '|Wallpaper|Vorgegebenes Hintergrundbild'), ('B|' + $psy + '|WallpaperStyle|Darstellung des Hintergrundbilds'), ('B|' + $psy + '|NoDispBackgroundPage|Seite „Hintergrund“ gesperrt'),
    'U|Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop|NoChangingWallPaper|Hintergrund ändern gesperrt',
    'M|SOFTWARE\Policies\Microsoft\Windows\Personalization|LockScreenImage|Vorgegebenes Sperrbildschirmbild', 'M|SOFTWARE\Policies\Microsoft\Windows\Personalization|NoChangingLockScreen|Sperrbildschirm ändern gesperrt', 'M|SOFTWARE\Policies\Microsoft\Windows\Personalization|NoLockScreen|Sperrbildschirm abgeschaltet',
    'M|SOFTWARE\Microsoft\Windows\CurrentVersion\PersonalizationCSP|DesktopImageUrl|Intune: Hintergrundbild', 'M|SOFTWARE\Microsoft\Windows\CurrentVersion\PersonalizationCSP|LockScreenImageUrl|Intune: Sperrbildschirmbild',
    'U|Software\Policies\Microsoft\Windows\CloudContent|DisableWindowsSpotlightFeatures|Windows-Blickpunkt abgeschaltet', ('B|' + $psy + '|NoColorChoice|Farben ändern gesperrt'), ('B|' + $psy + '|NoVisualStyleChoice|Design ändern gesperrt'))
  'Bildschirmschoner und Sperre' = @(
    'U|Software\Policies\Microsoft\Windows\Control Panel\Desktop|ScreenSaveActive|Bildschirmschoner erzwungen', 'U|Software\Policies\Microsoft\Windows\Control Panel\Desktop|ScreenSaveTimeOut|Bildschirmschoner nach (Sekunden)', 'U|Software\Policies\Microsoft\Windows\Control Panel\Desktop|ScreenSaverIsSecure|Kennwortschutz des Bildschirmschoners', 'U|Software\Policies\Microsoft\Windows\Control Panel\Desktop|SCRNSAVE.EXE|Vorgegebener Bildschirmschoner',
    ('M|' + $psy + '|InactivityTimeoutSecs|Computer-Inaktivitätsgrenze (Sekunden bis zur Sperre)'), ('B|' + $psy + '|DisableLockWorkstation|„Sperren“ abgeschaltet'), ('B|' + $psy + '|HideFastUserSwitching|„Benutzer wechseln“ ausgeblendet'),
    'M|SOFTWARE\Policies\Microsoft\PassportForWork\DynamicLock|DynamicLock|Dynamische Sperre', 'ZU|Control Panel\Desktop|ScreenSaveActive|Zustand: Bildschirmschoner an (1)', 'ZU|Control Panel\Desktop|ScreenSaveTimeOut|Zustand: Bildschirmschoner nach (Sekunden)', 'ZU|Software\Microsoft\Windows NT\CurrentVersion\Winlogon|EnableGoodbye|Zustand: dynamische Sperre (1 = an)')
  'Start, Taskleiste und Suche' = @(
    ('B|' + $pwe + '|LockedStartLayout|Startmenü-Layout gesperrt'), ('B|' + $pwe + '|StartLayoutFile|Vorgegebenes Start-Layout'), ('B|' + $pwe + '|HideRecommendedSection|Bereich „Empfohlen“ ausgeblendet'), ('B|' + $pwe + '|DisableSearchBoxSuggestions|Websuche im Suchfeld abgeschaltet'), ('B|' + $pwe + '|DisableNotificationCenter|Infocenter abgeschaltet'),
    ('B|' + $pex + '|NoChangeStartMenu|Startmenü anpassen gesperrt'), ('B|' + $pex + '|NoPinningToTaskbar|Anheften an die Taskleiste gesperrt'), ('B|' + $pex + '|TaskbarNoPinnedList|Angeheftete Taskleisten-Symbole entfernt'), ('B|' + $pex + '|TaskbarLockAll|Taskleisten-Einstellungen gesperrt'), ('B|' + $pex + '|NoTrayItemsDisplay|Infobereich ausgeblendet'), ('B|' + $pex + '|HideClock|Uhr ausgeblendet'),
    ('B|' + $pex + '|NoRecentDocsHistory|Kein Verlauf zuletzt geöffneter Dateien'), ('B|' + $pex + '|ClearRecentDocsOnExit|Verlauf beim Abmelden leeren'), ('B|' + $pex + '|NoClose|„Herunterfahren“ ausgeblendet'),
    'M|SOFTWARE\Policies\Microsoft\Windows\Windows Search|DisableWebSearch|Websuche abgeschaltet', 'M|SOFTWARE\Policies\Microsoft\Windows\Windows Search|EnableDynamicContentInWSB|Suchhervorhebungen', 'M|SOFTWARE\Policies\Microsoft\Dsh|AllowNewsAndInterests|Widgets erlaubt', 'M|SOFTWARE\Policies\Microsoft\Windows\Windows Chat|ChatIcon|Chat-Symbol', 'B|Software\Policies\Microsoft\Windows\WindowsCopilot|TurnOffWindowsCopilot|Copilot abgeschaltet')
  'Explorer und Dateien' = @(
    ('B|' + $pex + '|NoFolderOptions|Ordneroptionen gesperrt'), ('B|' + $pex + '|NoViewContextMenu|Rechtsklick-Menü gesperrt'), ('B|' + $pex + '|NoDrives|Laufwerke ausgeblendet (Bitmaske)'), ('B|' + $pex + '|NoViewOnDrive|Zugriff auf Laufwerke gesperrt (Bitmaske)'), ('B|' + $pex + '|NoRecycleFiles|Dateien sofort löschen (kein Papierkorb)'), ('B|' + $pex + '|ConfirmFileDelete|Löschen immer bestätigen'),
    ('B|' + $pex + '|NoPreviewPane|Vorschaufenster gesperrt'), ('B|' + $pex + '|DisableThumbnails|Miniaturansichten abgeschaltet'), ('B|' + $pex + '|NoStrCmpLogical|Zahlen in Dateinamen nicht numerisch sortieren'), ('B|' + $pex + '|RecycleBinSize|Papierkorb-Größe vorgegeben'), ('B|' + $pwe + '|NoNewAppAlert|Hinweis „Neue App installiert“ abgeschaltet'),
    'M|SOFTWARE\Policies\Microsoft\Windows\System|DefaultAssociationsConfiguration|Vorgegebene Standard-Apps (XML)', 'M|SOFTWARE\Policies\Microsoft\Windows\System|AllowClipboardHistory|Zwischenablage-Verlauf erlaubt', 'M|SOFTWARE\Policies\Microsoft\Windows\System|AllowCrossDeviceClipboard|Zwischenablage über Geräte', 'M|SOFTWARE\Policies\Microsoft\TabletPC|DisableSnippingTool|Snipping Tool abgeschaltet')
  'Benachrichtigungen' = @(
    'U|Software\Policies\Microsoft\Windows\CurrentVersion\PushNotifications|NoToastApplicationNotification|App-Benachrichtigungen abgeschaltet', 'U|Software\Policies\Microsoft\Windows\CurrentVersion\PushNotifications|NoToastApplicationNotificationOnLockScreen|Benachrichtigungen auf dem Sperrbildschirm abgeschaltet',
    'M|SOFTWARE\Policies\Microsoft\Windows\System|DisableLockScreenAppNotifications|App-Benachrichtigungen auf dem Sperrbildschirm gesperrt', ('B|' + $pwe + '|DisableNotificationCenter|Infocenter abgeschaltet'),
    'M|SOFTWARE\Policies\Microsoft\Windows\CloudContent|DisableWindowsConsumerFeatures|Microsoft-Verbraucherfunktionen abgeschaltet', 'U|Software\Policies\Microsoft\Windows\CloudContent|DisableTailoredExperiencesWithDiagnosticData|Maßgeschneiderte Tipps abgeschaltet',
    'ZU|Software\Microsoft\Windows\CurrentVersion\PushNotifications|ToastEnabled|Zustand: Benachrichtigungen (1 = an)', 'ZU|Software\Microsoft\Windows\CurrentVersion\Notifications\Settings|NOC_GLOBAL_SETTING_ALLOW_TOASTS_ABOVE_LOCK|Zustand: auf dem Sperrbildschirm (1 = an)')
  'Uhrzeit, Sprache, Region' = @(
    'B|Software\Policies\Microsoft\Control Panel\International|PreventUserOverrides|Eigene Formate verboten', 'B|Software\Policies\Microsoft\Control Panel\International|RestrictUserLocales|Erlaubte Formate eingeschränkt', 'B|Software\Policies\Microsoft\Control Panel\Desktop|PreferredUILanguages|Vorgegebene Anzeigesprache',
    'M|SOFTWARE\Policies\Microsoft\MUI\Settings|PreferredUILanguages|Vorgegebene Anzeigesprache (Computer)', 'M|SOFTWARE\Policies\Microsoft\W32Time\Parameters|Type|Zeitquelle (NT5DS = Domäne, NTP = Server)', 'M|SOFTWARE\Policies\Microsoft\W32Time\Parameters|NtpServer|Vorgegebener Zeitserver',
    'ZM|SYSTEM\CurrentControlSet\Services\tzautoupdate|Start|Zustand: Zeitzone automatisch festlegen (3 = an, 4 = aus)', 'ZM|SYSTEM\CurrentControlSet\Control\TimeZoneInformation|TimeZoneKeyName|Zustand: Zeitzone', 'ZM|SYSTEM\CurrentControlSet\Control\TimeZoneInformation|DynamicDaylightTimeDisabled|Zustand: Sommerzeit-Umstellung abgeschaltet (1)')
  'Einstellungen und Systemsteuerung' = @(
    ('B|' + $pex + '|NoControlPanel|Systemsteuerung und Einstellungen gesperrt'), ('B|' + $pex + '|SettingsPageVisibility|Sichtbare/ausgeblendete Einstellungsseiten'), ('B|' + $pex + '|NoRun|„Ausführen“ (Windows+R) gesperrt'), ('B|' + $pex + '|NoWinKeys|Windows-Tastenkürzel gesperrt'),
    ('B|' + $psy + '|DisableTaskMgr|Task-Manager gesperrt'), ('B|' + $psy + '|DisableChangePassword|„Kennwort ändern“ gesperrt'), ('B|' + $pex + '|NoLogoff|„Abmelden“ ausgeblendet'), 'B|Software\Policies\Microsoft\Windows\System|DisableCMD|Eingabeaufforderung gesperrt')
}
$intune = [ordered]@{ 'Hintergrund und Sperrbildschirm' = @('Personalization'); 'Bildschirmschoner und Sperre' = @('DeviceLock'); 'Start, Taskleiste und Suche' = @('Start', 'Search', 'NewsAndInterests', 'WindowsAI'); 'Explorer und Dateien' = @('FileExplorer'); 'Benachrichtigungen' = @('Notifications', 'AboveLock'); 'Uhrzeit, Sprache, Region' = @('TimeLanguageSettings'); 'Einstellungen und Systemsteuerung' = @('Settings', 'Experience') }
if ($b -and $b -ne 'Alles' -and -not $alle.Contains($b)) { throw ('Unbekannter Bereich: ' + $b + ' (möglich: ' + (@($alle.Keys) -join ', ') + ')') }
function Wert($v) { if ($v -is [byte[]]) { return (@($v | Select-Object -First 16 | ForEach-Object { '{0:X2}' -f $_ }) -join ' ') }; return (@($v | ForEach-Object { [string]$_ }) -join '; ') }
if (-not $uHive) { Zeile 'Kein Benutzer angemeldet — es werden nur Computer-Richtlinien gezeigt.' }
$gesamt = 0
foreach ($ber in @($alle.Keys)) {
  if ($b -and $b -ne 'Alles' -and $ber -ne $b) { continue }
  Zeile ('■ ' + $ber)
  $treffer = 0
  foreach ($e in $alle[$ber]) {
    $t = $e -split '\|'
    $ziele = @()
    if ($t[0] -eq 'M' -or $t[0] -eq 'B' -or $t[0] -eq 'ZM') { $ziele += ,@('Computer', ('HKLM:\' + $t[1])) }
    if (($t[0] -eq 'U' -or $t[0] -eq 'B' -or $t[0] -eq 'ZU') -and $uHive) { $ziele += ,@('Benutzer', ($uHive + '\' + $t[1])) }
    foreach ($z in $ziele) {
      $v = (Get-ItemProperty -Path $z[1] -Name $t[2] -EA SilentlyContinue).($t[2])
      if ($null -eq $v) { continue }
      if ($t[0].StartsWith('Z')) { Zeile ('  ' + $t[3] + ': ' + (Wert $v)) }
      else { $treffer++; Zeile ('  RICHTLINIE ' + $z[0] + ': ' + $t[3] + ' = ' + (Wert $v) + '  [' + $t[2] + ']') }
    }
  }
  foreach ($bereich in @($intune[$ber])) {
    $k = 'HKLM:\SOFTWARE\Microsoft\PolicyManager\current\device\' + $bereich
    $pm = Get-ItemProperty -Path $k -EA SilentlyContinue
    if (-not $pm) { continue }
    foreach ($e in @($pm.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' -and $_.Name -notmatch '_(ProviderSet|WinningProvider|LastWrite)$' })) { $treffer++; Zeile ('  INTUNE ' + $bereich + '/' + $e.Name + ' = ' + (Wert $e.Value)) }
  }
  if (-not $treffer) { Zeile '  keine Richtlinie gesetzt' }
  $gesamt += $treffer
}
Zeile ('Gesamt: ' + $gesamt + ' Vorgaben gefunden. Richtlinien kommen von DXC (Gruppenrichtlinie) bzw. Intune — das Tool ändert sie nicht; nach einer Änderung dort „Gruppenrichtlinien neu anwenden“.')` }),

  A({ id: 'win4-dateizuordnungen', titel: 'Dateizuordnungen des Benutzers anzeigen (welches Programm öffnet was)', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Zeigt für die üblichen Dateitypen (.pdf, .docx, .xlsx, .msg, .txt, .csv, .jpg, .zip, .lnk …) und Protokolle (http, https, mailto, tel/callto für Xelion) bzw. für die angegebenen Endungen: die Wahl des Benutzers, den Windows-Standard, das zugehörige Programm, fehlende oder verwaiste Zuordnungen (Programm deinstalliert) und eine Firmenvorgabe für Standard-Apps. Ändert nichts.',
    param: { label: 'Dateiendung(en) bzw. Protokolle (optional, leer = die üblichen)', platzhalter: 'z. B. .zip, .csv, mailto', vorlagen: ['.lnk', '.zip', '.txt', '.csv', '.jpg', '.png', '.eml', '.xml', 'mailto', 'tel'] },
    ps: String.raw`
NeedHive
$proto = @('http', 'https', 'mailto', 'tel', 'callto', 'ftp', 'sip', 'ms-teams', 'msteams')
$liste = @()
if ($P.Trim()) {
  foreach ($x in @($P -split '[,;\s]+' | Where-Object { $_ })) {
    $x = $x.Trim().ToLower()
    if ($x -notmatch '^\.?[a-z0-9][a-z0-9\-]{0,14}$') { throw ('Ungültige Dateiendung bzw. ungültiges Protokoll: ' + $x) }
    if (-not $x.StartsWith('.') -and $proto -notcontains $x) { $x = '.' + $x }
    $liste += $x
  }
} else { $liste = @('.pdf', '.docx', '.xlsx', '.pptx', '.msg', '.eml', '.txt', '.csv', '.jpg', '.png', '.zip', '.html', '.url', '.lnk', '.mp4', 'http', 'https', 'mailto', 'tel', 'callto') }
$cls = $uHive + '_Classes'
if (-not (Test-Path $cls)) { $cls = $uHive + '\Software\Classes' }
function ProgInfo([string]$id) {
  if (-not $id) { return '' }
  foreach ($w in @($cls, 'HKLM:\SOFTWARE\Classes')) {
    $k = $w + '\' + $id
    if (-not (Test-Path -LiteralPath $k)) { continue }
    $app = Get-ItemProperty -LiteralPath ($k + '\Application') -EA SilentlyContinue
    if ($app -and $app.ApplicationName) { $n = [string]$app.ApplicationName; if ($n.StartsWith('@')) { $n = [string]$app.AppUserModelID }; return ($n + ' (App)') }
    $cmd = [string](Get-ItemProperty -LiteralPath ($k + '\shell\open\command') -EA SilentlyContinue).'(default)'
    if ($cmd) { $exe = [regex]::Match($cmd, '^\s*"?([^"]+?\.exe)', 'IgnoreCase').Groups[1].Value; if ($exe) { return ($exe + $(if (Test-Path -LiteralPath ([Environment]::ExpandEnvironmentVariables($exe))) { '' } else { ' — PROGRAMM FEHLT' })) }; return $cmd.Substring(0, [int][math]::Min([double]80, [double]$cmd.Length)) }
    $fn = [string](Get-ItemProperty -LiteralPath $k -EA SilentlyContinue).'(default)'
    if ($fn) { return $fn }
    return '(ohne Öffnen-Befehl)'
  }
  return 'ProgID unbekannt — Programm vermutlich deinstalliert'
}
foreach ($x in $liste) {
  if ($x.StartsWith('.')) {
    $fe = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\' + $x
    $uc = [string](Get-ItemProperty -LiteralPath ($fe + '\UserChoice') -EA SilentlyContinue).ProgId
    $ucl = [string](Get-ItemProperty -LiteralPath ($fe + '\UserChoiceLatest') -EA SilentlyContinue).ProgId
    if (-not $ucl) { $ucl = [string](Get-ItemProperty -LiteralPath ($fe + '\UserChoiceLatest\ProgId') -EA SilentlyContinue).ProgId }
    $eigen = [string](Get-ItemProperty -LiteralPath ($cls + '\' + $x) -EA SilentlyContinue).'(default)'
    $sys = [string](Get-ItemProperty -LiteralPath ('HKLM:\SOFTWARE\Classes\' + $x) -EA SilentlyContinue).'(default)'
    $wahl = if ($ucl) { $ucl } elseif ($uc) { $uc } else { '' }
    if ($wahl) { Zeile ($x + ': Wahl des Benutzers ' + $wahl + ' → ' + (ProgInfo $wahl)) }
    elseif ($eigen) { Zeile ($x + ': Umleitung im Benutzerprofil ' + $eigen + ' → ' + (ProgInfo $eigen)) }
    elseif ($sys) { Zeile ($x + ': keine eigene Wahl — Windows-Standard ' + $sys + ' → ' + (ProgInfo $sys)) }
    else { Zeile ($x + ': KEINE Zuordnung — Windows fragt „Wie möchten Sie diese Datei öffnen?“') }
    if ($eigen -and $wahl -and ($x -eq '.lnk' -or $x -eq '.exe')) { Zeile ('  Achtung: zusätzliche Umleitung im Benutzerprofil (Classes\' + $x + ' = ' + $eigen + ') — bei .lnk/.exe ist das nie richtig.') }
  } else {
    $uc = [string](Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\' + $x + '\UserChoice') -EA SilentlyContinue).ProgId
    if ($uc) { Zeile ($x + ': Wahl des Benutzers ' + $uc + ' → ' + (ProgInfo $uc)) } else { Zeile ($x + ': keine Wahl des Benutzers (Windows fragt bzw. nimmt den Standard)') }
  }
}
$pol = [string](Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -EA SilentlyContinue).DefaultAssociationsConfiguration
if ($pol) { Zeile ('Firmenvorgabe für Standard-Apps (Richtlinie): ' + $pol + ' — gilt bei jeder Anmeldung für die dort genannten Typen.') } else { Zeile 'Keine Firmenvorgabe für Standard-Apps (Richtlinie) gesetzt.' }` }),

  A({ id: 'win4-zuordnung-zuruecksetzen', titel: 'Dateizuordnung des Benutzers zurücksetzen (z. B. .lnk, .zip, .txt)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Benennt die eigene Zuordnung des Benutzers für die angegebenen Dateiendungen um (UserChoice → *.alt_…), bei .lnk/.exe/.url/.bat/.cmd zusätzlich eine falsche Umleitung im Benutzerprofil. Danach gilt wieder der Windows-Standard bzw. Windows fragt einmal nach dem Programm — gegen „alle Verknüpfungen öffnen mit Editor“, ZIP ohne Reißverschluss-Symbol oder eine Wahl, die nicht gemerkt wird. .pdf/.htm und http/https schützt Windows; dort wählt der Benutzer selbst.',
    param: { label: 'Dateiendung(en)', platzhalter: 'z. B. .lnk oder .zip, .txt', pflicht: true, vorlagen: ['.lnk', '.exe', '.zip', '.txt', '.csv', '.jpg', '.png', '.xml', '.eml'] },
    ps: String.raw`
NeedHive
$liste = @($P -split '[,;\s]+' | Where-Object { $_ } | ForEach-Object { $x = $_.Trim().ToLower(); if (-not $x.StartsWith('.')) { $x = '.' + $x }; $x })
if (-not $liste.Count) { throw 'Dateiendung fehlt.' }
foreach ($x in $liste) { if ($x -notmatch '^\.[a-z0-9][a-z0-9\-]{0,14}$') { throw ('Ungültige Dateiendung: ' + $x) } }
$geschuetzt = @('.pdf', '.htm', '.html', '.http', '.https')
$cls = $uHive + '_Classes'
if (-not (Test-Path $cls)) { $cls = $uHive + '\Software\Classes' }
$st = Get-Date -Format 'yyyyMMdd_HHmmss'
foreach ($x in $liste) {
  if ($geschuetzt -contains $x) { Zeile ($x + ': von Windows geschützt — die Wahl trifft der Benutzer selbst unter Einstellungen → Apps → Standard-Apps.'); continue }
  $fe = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\' + $x
  $n = 0
  foreach ($u in 'UserChoice', 'UserChoiceLatest') {
    $k = $fe + '\' + $u
    if (-not (Test-Path -LiteralPath $k)) { continue }
    $alt = [string](Get-ItemProperty -LiteralPath $k -EA SilentlyContinue).ProgId
    try { Rename-Item -LiteralPath $k -NewName ($u + '.alt_' + $st) -EA Stop; $n++; Zeile ($x + ': Wahl des Benutzers vorher ' + $(if ($alt) { $alt } else { '(ohne ProgId)' }) + ' → jetzt zurückgesetzt (gesichert als ' + $u + '.alt_' + $st + ')') }
    catch { Zeile ($x + ': ' + $u + ' ließ sich nicht zurücksetzen — ' + $_.Exception.Message) }
  }
  if ($x -in '.lnk', '.exe', '.url', '.bat', '.cmd', '.com') {
    $k = $cls + '\' + $x
    if (Test-Path -LiteralPath $k) {
      $alt = [string](Get-ItemProperty -LiteralPath $k -EA SilentlyContinue).'(default)'
      Rename-Item -LiteralPath $k -NewName ($x + '.alt_' + $st) -EA Stop; $n++
      Zeile ($x + ': Umleitung im Benutzerprofil vorher „' + $alt + '“ → jetzt entfernt (gesichert als ' + $x + '.alt_' + $st + ')')
    }
  }
  if (-not $n) { Zeile ($x + ': keine eigene Zuordnung des Benutzers — es gilt bereits der Windows-Standard.') }
}
Zeile 'Danach „Explorer neu starten“. Beim nächsten Öffnen gilt der Windows-Standard bzw. Windows fragt einmal — Programm wählen und „Immer“ anklicken.'` }),
]
