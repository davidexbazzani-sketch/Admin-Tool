// ── Problem-Assistent: Lösungsbausteine Gruppe „outlook“ (Runde 3) ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Alle Outlook-Optionen liegen im Benutzer-Hive ($uHive, Art „profil“); Richtlinien (Software\Policies)
// werden nur gelesen und gemeldet, nie geschrieben. Outlook-COM nur in der Benutzersitzung (Art „benutzer“).

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

export const AKTIONEN_OUTLOOK: PaAktion[] = [
  // ── Gruppenpostfächer / Stellvertretung ──────────────────────────────────────
  A({ id: 'ol-geloeschte-delegat', titel: 'Gelöschtes aus fremden Postfächern dort ablegen (Gruppenpostfach, Chef)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Legt fest, wohin Outlook Elemente legt, die man in einem fremden Postfach löscht (Gruppenpostfach, Kalender/Postfach des Chefs): in dessen „Gelöschte Elemente“ (DelegateWastebasketStyle = 4) oder wie bisher in die eigenen. Outlook danach neu starten.',
    param: { label: 'Ablage gelöschter Elemente', platzhalter: 'Im fremden Postfach', pflicht: true, optionen: ['Im fremden Postfach', 'Im eigenen Postfach'] },
    ps: String.raw`
NeedHive
$ziel = switch -Regex ($P.Trim()) { '^im fremden' { 4; break } '^im eigenen' { 8; break } default { throw ('Unbekannte Auswahl: ' + $P) } }
function OrtTxt($v) { if ($null -eq $v) { 'nicht gesetzt = im eigenen Postfach (Standard)' } elseif ([int]$v -eq 4) { 'im fremden Postfach (4)' } else { 'im eigenen Postfach (' + $v + ')' } }
$pv = (Get-ItemProperty -Path ($uHive + '\Software\Policies\Microsoft\Office\16.0\Outlook\Options\General') -Name DelegateWastebasketStyle -EA SilentlyContinue).DelegateWastebasketStyle
if ($null -ne $pv) { Zeile ('Achtung: per Richtlinie festgelegt (' + (OrtTxt $pv) + ') — die Richtlinie hat Vorrang (zuständig DXC).') }
$k = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Options\General'
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
$alt = (Get-ItemProperty -Path $k -Name DelegateWastebasketStyle -EA SilentlyContinue).DelegateWastebasketStyle
Set-ItemProperty -Path $k -Name DelegateWastebasketStyle -Value $ziel -Type DWord
Zeile ('Gelöschte Elemente aus fremden Postfächern: vorher ' + (OrtTxt $alt) + ', jetzt ' + (OrtTxt $ziel) + '.')
Zeile 'Gilt für Postfächer, die über eine Berechtigung eingebunden sind (nicht als eigenes Konto). Outlook neu starten.'` }),
  A({ id: 'ol-gesendete-delegat', titel: 'Gesendetes aus fremden Postfächern dort ablegen (Gruppenpostfach, Chef)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Legt fest, ob Outlook eine Mail, die „als“ oder „im Auftrag von“ einem Gruppenpostfach bzw. dem Chef gesendet wird, in dessen „Gesendete Elemente“ ablegt (DelegateSentItemsStyle = 1) oder nur in die eigenen. „Im eigenen Postfach“ behebt doppelte Kopien, wenn Exchange die Kopie schon selbst ablegt.',
    param: { label: 'Ablage gesendeter Elemente', platzhalter: 'Im fremden Postfach', pflicht: true, optionen: ['Im fremden Postfach', 'Im eigenen Postfach'] },
    ps: String.raw`
NeedHive
$ziel = switch -Regex ($P.Trim()) { '^im fremden' { 1; break } '^im eigenen' { 0; break } default { throw ('Unbekannte Auswahl: ' + $P) } }
function OrtTxt($v) { if ($null -eq $v) { 'nicht gesetzt = nur im eigenen Postfach (Standard)' } elseif ([int]$v -eq 1) { 'im fremden Postfach (1)' } else { 'nur im eigenen Postfach (' + $v + ')' } }
$pv = (Get-ItemProperty -Path ($uHive + '\Software\Policies\Microsoft\Office\16.0\Outlook\Preferences') -Name DelegateSentItemsStyle -EA SilentlyContinue).DelegateSentItemsStyle
if ($null -ne $pv) { Zeile ('Achtung: per Richtlinie festgelegt (' + (OrtTxt $pv) + ') — die Richtlinie hat Vorrang (zuständig DXC).') }
$k = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Preferences'
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
$alt = (Get-ItemProperty -Path $k -Name DelegateSentItemsStyle -EA SilentlyContinue).DelegateSentItemsStyle
Set-ItemProperty -Path $k -Name DelegateSentItemsStyle -Value $ziel -Type DWord
Zeile ('Gesendete Elemente beim Senden aus fremden Postfächern: vorher ' + (OrtTxt $alt) + ', jetzt ' + (OrtTxt $ziel) + '.')
Zeile 'Wirkt für neu gesendete Mails nach einem Outlook-Neustart; schon gesendete Mails bleiben, wo sie sind.'` }),

  // ── Einzelne Outlook-Optionen ────────────────────────────────────────────────
  A({ id: 'ol-option', titel: 'Outlook-Einstellung setzen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Setzt eine einzelne Outlook-Einstellung des angemeldeten Benutzers direkt in seiner Registry (alter und neuer Wert werden angezeigt; eine Richtlinie hat Vorrang und wird gemeldet). Outlook danach neu starten.',
    param: { label: 'Einstellung', platzhalter: 'Sofort senden: ein', pflicht: true, optionen: [
      'Sofort senden: ein', 'AutoVervollständigen: ein', 'Desktopbenachrichtigung: ein', 'Ton bei neuer Mail: ein',
      'Nachrichtenformat: HTML', 'Nur-Text-Anzeige: aus', 'Zeilenumbrüche entfernen: aus', 'Codierung: UTF-8',
      'AutoArchivierung: aus', 'Anlagenvorschau: ein', 'Papierkorb beim Beenden leeren: aus', 'Gruppenpostfächer: wieder im Cache',
      'Profilauswahl beim Start: aus', 'Datendatei-Grenze: 100 GB'] },
    ps: String.raw`
NeedHive
$o = $P.Trim()
$base = $uHive + '\Software\Microsoft\Office\16.0\Outlook'
$pol = $uHive + '\Software\Policies\Microsoft\Office\16.0\Outlook'
if (-not (Test-Path $base)) { throw 'Outlook wurde für diesen Benutzer noch nie gestartet (kein Outlook-Eintrag).' }
function WertTxt($v) { if ($null -eq $v) { 'nicht gesetzt (Standard)' } else { [string]$v } }
function Setze([string]$unter, [string]$name, [int]$wert, [string]$label) {
  $pv = (Get-ItemProperty -Path ($pol + '\' + $unter) -Name $name -EA SilentlyContinue).$name
  if ($null -ne $pv) { Zeile ($label + ': per Richtlinie auf ' + $pv + ' festgelegt — die Richtlinie hat Vorrang (zuständig DXC).') }
  $k = $base + '\' + $unter
  if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
  $alt = (Get-ItemProperty -Path $k -Name $name -EA SilentlyContinue).$name
  Set-ItemProperty -Path $k -Name $name -Value $wert -Type DWord
  Zeile ($label + ': vorher ' + (WertTxt $alt) + ', jetzt ' + $wert)
}
switch -Regex ($o) {
  '^sofort senden' { Setze 'Options\Mail' 'Send Mail Immediately' 1 '„Sofort senden, wenn verbunden“ (1 = ein)'; break }
  '^autovervollst' { Setze 'Preferences' 'ShowAutoSug' 1 '„AutoVervollständigen-Liste beim Eingeben verwenden“ (1 = ein)'; break }
  '^desktopbenachr' {
    Setze 'Preferences' 'NewmailDesktopAlerts' 1 'Desktopbenachrichtigung bei neuer Mail (1 = ein)'
    $n = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\Microsoft.Office.OUTLOOK.EXE.15'
    $e = (Get-ItemProperty -Path $n -Name Enabled -EA SilentlyContinue).Enabled
    if ($null -ne $e -and [int]$e -eq 0) { Set-ItemProperty -Path $n -Name Enabled -Value 1 -Type DWord; Zeile 'Windows-Benachrichtigungen für Outlook: vorher aus, jetzt ein' } else { Zeile 'Windows-Benachrichtigungen für Outlook: nicht abgeschaltet' }
    break }
  '^ton bei' {
    Setze 'Preferences' 'PlaySound' 1 'Ton bei neuer Mail (1 = ein)'
    $mb = [string](Get-ItemProperty -Path ($uHive + '\AppEvents\Schemes\Apps\.Default\MailBeep\.Current') -EA SilentlyContinue).'(default)'
    Zeile ('Windows-Klang „Neue E-Mail-Benachrichtigung“: ' + $(if ($mb) { $mb } else { 'KEINER eingestellt — Systemsteuerung → Sound → Sounds → „Neue E-Mail-Benachrichtigung“ wählen' }))
    break }
  '^nachrichtenformat' { Setze 'Options\Mail' 'EditorPreference' 131072 'Nachrichtenformat beim Verfassen (131072 = HTML, 65536 = Nur-Text, 196610 = Rich-Text)'; break }
  '^nur-text' {
    Setze 'Options\Mail' 'ReadAsPlain' 0 '„Standardnachrichten im Nur-Text-Format lesen“ (0 = aus)'
    Setze 'Options\Mail' 'ReadSignedAsPlain' 0 '„Digital signierte Nachrichten im Nur-Text-Format lesen“ (0 = aus)'
    break }
  '^zeilenumbr' { Setze 'Options\Mail' 'AutoFormatPlainText' 0 '„Zusätzliche Zeilenumbrüche in Nur-Text-Nachrichten entfernen“ (0 = aus)'; break }
  '^codierung' { Setze 'Options\MSHTML\International' 'Default_CodePageOut' 65001 'Codierung ausgehender Nachrichten (65001 = Unicode UTF-8)'; break }
  '^autoarchiv' { Setze 'Preferences' 'DoAging' 0 'AutoArchivierung (0 = aus)'; break }
  '^anlagenvorschau' {
    $namen = @('DisableAttachmentPreviewing', 'DisableAttachmentPreview')
    foreach ($u in 'Preferences', 'Security') { foreach ($nm in $namen) { $x = (Get-ItemProperty -Path ($pol + '\' + $u) -Name $nm -EA SilentlyContinue).$nm; if ($null -ne $x -and [int]$x -eq 1) { Zeile ('Anlagenvorschau ist per Richtlinie abgeschaltet (' + $u + '\' + $nm + ') — zuständig DXC.') } } }
    $n = 0
    foreach ($u in 'Preferences', 'Security') { foreach ($nm in $namen) { $k = $base + '\' + $u; $x = (Get-ItemProperty -Path $k -Name $nm -EA SilentlyContinue).$nm; if ($null -ne $x -and [int]$x -eq 1) { Set-ItemProperty -Path $k -Name $nm -Value 0 -Type DWord; $n++; Zeile ('Anlagenvorschau (' + $u + '\' + $nm + '): vorher 1 = aus, jetzt 0 = ein') } } }
    if (-not $n) { Zeile 'Anlagenvorschau war in Outlook nicht abgeschaltet.' }
    foreach ($ext in '.pdf', '.docx', '.xlsx', '.pptx') {
      $h = ''
      foreach ($w in ($uHive + '\Software\Classes'), 'HKLM:\SOFTWARE\Classes') {
        if ($h) { break }
        $h = [string](Get-ItemProperty -Path ($w + '\' + $ext + '\ShellEx\{8895b1c6-b41f-4c1c-a562-0d564250836f}') -EA SilentlyContinue).'(default)'
        if (-not $h) { $pg = [string](Get-ItemProperty -Path ($w + '\' + $ext) -EA SilentlyContinue).'(default)'; if ($pg) { $h = [string](Get-ItemProperty -Path ($w + '\' + $pg + '\ShellEx\{8895b1c6-b41f-4c1c-a562-0d564250836f}') -EA SilentlyContinue).'(default)' } }
      }
      $hn = ''; if ($h) { $hn = [string](Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\PreviewHandlers' -Name $h -EA SilentlyContinue).$h }
      Zeile ('Vorschauprogramm ' + $ext + ': ' + $(if ($hn) { $hn } elseif ($h) { $h + ' (nicht in der Liste der Vorschauprogramme)' } else { 'KEINES registriert — Programm mit Vorschaufunktion installieren bzw. reparieren' }))
    }
    break }
  '^papierkorb' { Setze 'Preferences' 'EmptyTrash' 0 '„Ordner Gelöschte Elemente beim Beenden leeren“ (0 = aus)'; break }
  '^gruppenpostf' { Setze 'Cached Mode' 'CacheOthersMail' 1 'Gruppenpostfächer im Cache (1 = ja, auch offline verfügbar)'; break }
  '^profilauswahl' {
    $k = $uHive + '\Software\Microsoft\Exchange\Client\Options'
    $alt = (Get-ItemProperty -Path $k -Name PickLogonProfile -EA SilentlyContinue).PickLogonProfile
    $std = [string](Get-ItemProperty -Path $base -EA SilentlyContinue).DefaultProfile
    if ($null -eq $alt -or [string]$alt -eq '0') { Zeile ('Profilauswahl beim Start: war nicht eingeschaltet (' + (WertTxt $alt) + ').') } else { Set-ItemProperty -Path $k -Name PickLogonProfile -Value '0' -Type String; Zeile ('Profilauswahl beim Start: vorher ' + $alt + ', jetzt 0 — Outlook startet direkt mit dem Standardprofil „' + $std + '“.') }
    break }
  '^datendatei' {
    Setze 'PST' 'MaxLargeFileSize' 102400 'Höchstgröße einer PST/OST-Datei in MB'
    Setze 'PST' 'WarnLargeFileSize' 97280 'Warngrenze einer PST/OST-Datei in MB'
    $c = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -EA SilentlyContinue
    if ($c) { Zeile ('Freier Platz auf C: ' + (Groesse ([double]$c.FreeSpace)) + ' — die Datei darf jetzt bis 100 GB wachsen.') }
    break }
  default { throw ('Unbekannte Einstellung: ' + $o) }
}
Zeile 'Outlook neu starten, damit die Einstellung wirkt.'` }),

  // ── Standardprogramm, Profil, Zwischenspeicher ───────────────────────────────
  A({ id: 'ol-standard-mailprogramm', titel: 'Klassisches Outlook als E-Mail-Programm eintragen (MAPI/mailto)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Trägt das klassische Outlook als Standard-E-Mail-Programm für „Senden an → E-Mail-Empfänger“, „Als Anhang senden“ und „Per E-Mail senden“ aus Acrobat/Excel ein (MAPI) und entfernt eine falsche mailto-Zuordnung (neues Outlook, Mail-App). Die von Windows geschützte Auswahl trifft danach beim ersten Klick der Benutzer selbst.',
    ps: String.raw`
NeedHive
if (-not (Test-Path 'HKLM:\SOFTWARE\Clients\Mail\Microsoft Outlook')) { throw 'Das klassische Outlook ist auf diesem PC nicht als E-Mail-Programm registriert — erst eine Office-Schnellreparatur.' }
foreach ($m in 'HKLM:\SOFTWARE\Clients\Mail', 'HKLM:\SOFTWARE\WOW6432Node\Clients\Mail') {
  if (-not (Test-Path $m)) { continue }
  $art = $(if ($m -match 'WOW6432') { '32-Bit' } else { '64-Bit' })
  $alt = [string](Get-ItemProperty -Path $m -EA SilentlyContinue).'(default)'
  if ($alt -eq 'Microsoft Outlook') { Zeile ('MAPI-Standard des PCs (' + $art + '): bereits „Microsoft Outlook“') } else { Set-ItemProperty -Path $m -Name '(default)' -Value 'Microsoft Outlook'; Zeile ('MAPI-Standard des PCs (' + $art + '): vorher „' + $alt + '“, jetzt „Microsoft Outlook“') }
}
$um = $uHive + '\Software\Clients\Mail'
$ualt = [string](Get-ItemProperty -Path $um -EA SilentlyContinue).'(default)'
if ($ualt -and $ualt -ne 'Microsoft Outlook') { Set-ItemProperty -Path $um -Name '(default)' -Value 'Microsoft Outlook'; Zeile ('MAPI-Standard des Benutzers: vorher „' + $ualt + '“, jetzt „Microsoft Outlook“') } else { Zeile ('MAPI-Standard des Benutzers: ' + $(if ($ualt) { 'bereits Microsoft Outlook' } else { 'nicht gesetzt — es gilt der PC-Standard' })) }
$ua = $uHive + '\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\mailto'
$prog = [string](Get-ItemProperty -Path ($ua + '\UserChoice') -Name ProgId -EA SilentlyContinue).ProgId
if (-not $prog) {
  Zeile 'mailto: keine Auswahl des Benutzers gespeichert (Windows fragt beim ersten Klick bzw. nimmt den Standard).'
} elseif ($prog -match '^Outlook\.URL\.mailto') {
  Zeile ('mailto: bereits klassisches Outlook (' + $prog + ')')
} else {
  $weg = 0
  foreach ($u in 'UserChoice', 'UserChoiceLatest') { $p = $ua + '\' + $u; if (Test-Path $p) { try { Remove-Item -Path $p -Recurse -Force -EA Stop; $weg++ } catch { Zeile ('mailto: ' + $u + ' lässt sich nicht entfernen (' + $_.Exception.Message + ')') } } }
  Zeile ('mailto: vorher „' + $prog + '“' + $(if ($weg) { ' — Zuordnung entfernt. Beim nächsten Klick auf einen E-Mail-Link fragt Windows einmal: „Outlook“ wählen.' } else { ' — bitte über „Standard-Apps“ auf Outlook stellen.' }))
}
Zeile 'Danach das sendende Programm (Excel, Explorer, Acrobat …) neu öffnen.'` }),
  A({ id: 'ol-profil-neu', titel: 'Neues Outlook-Profil anlegen (altes bleibt erhalten)', modus: 'profil', risiko: 'kritisch', timeoutMs: 60000,
    beschreibung: 'Beendet Outlook, legt ein neues, leeres Outlook-Profil an und setzt es als Standard. Beim nächsten Start richtet Outlook das Postfach automatisch neu ein und lädt es neu herunter. Das alte Profil bleibt erhalten (über die Profilauswahl wieder wählbar); PST-Archive müssen neu eingebunden werden.',
    param: { label: 'Name des neuen Profils', platzhalter: 'leer = Outlook_JJJJMMTT', vorlagen: ['Outlook_neu'] },
    ps: String.raw`
NeedHive
$name = $P.Trim()
if (-not $name) { $name = 'Outlook_' + (Get-Date -Format 'yyyyMMdd') }
if ($name -notmatch '^[A-Za-z0-9][A-Za-z0-9 _.-]{0,39}$') { throw 'Profilname: nur Buchstaben, Ziffern, Leerzeichen, _ . - (höchstens 40 Zeichen).' }
$ok = $uHive + '\Software\Microsoft\Office\16.0\Outlook'
if (-not (Test-Path $ok)) { throw 'Outlook wurde für diesen Benutzer noch nie gestartet (kein Outlook-Eintrag) — einfach Outlook starten.' }
$pk = $ok + '\Profiles'
$vorh = @(Get-ChildItem -Path $pk -EA SilentlyContinue | ForEach-Object { $_.PSChildName })
if ($vorh -contains $name) { $name = $name + '_' + (Get-Date -Format 'HHmmss') }
$alt = [string](Get-ItemProperty -Path $ok -EA SilentlyContinue).DefaultProfile
Zeile ('Vorhandene Profile: ' + $(if ($vorh.Count) { $vorh -join ', ' } else { 'keine' }) + ' · Standard bisher: ' + $(if ($alt) { $alt } else { '—' }))
StopUser @('OUTLOOK')
if (-not (Test-Path $pk)) { New-Item -Path $pk -Force | Out-Null }
$neu = $pk + '\' + $name
if (-not (Test-Path $neu)) { New-Item -Path $neu -Force | Out-Null }
Set-ItemProperty -Path $ok -Name DefaultProfile -Value $name -Type String
Zeile ('Standardprofil: vorher „' + $alt + '“, jetzt „' + $name + '“ (neu, leer). Das alte Profil bleibt erhalten.')
$ex = $uHive + '\Software\Microsoft\Exchange\Client\Options'
$pick = [string](Get-ItemProperty -Path $ex -Name PickLogonProfile -EA SilentlyContinue).PickLogonProfile
if ($pick -eq '1') { Set-ItemProperty -Path $ex -Name PickLogonProfile -Value '0' -Type String; Zeile 'Profilauswahl beim Start: vorher an, jetzt aus (Outlook startet direkt mit dem neuen Profil).' }
$ad = $ok + '\AutoDiscover'
$zc = (Get-ItemProperty -Path $ad -Name ZeroConfigExchange -EA SilentlyContinue).ZeroConfigExchange
if ($null -eq $zc) { if (-not (Test-Path $ad)) { New-Item -Path $ad -Force | Out-Null }; Set-ItemProperty -Path $ad -Name ZeroConfigExchange -Value 1 -Type DWord; Zeile 'Automatische Konteneinrichtung (ZeroConfigExchange): vorher nicht gesetzt, jetzt 1 — Outlook richtet das Postfach mit der Windows-Anmeldung ein.' } else { Zeile ('Automatische Konteneinrichtung (ZeroConfigExchange): ' + $zc) }
$ost = @(Get-ChildItem -LiteralPath (Join-Path $uLocal 'Microsoft\Outlook') -Filter *.ost -EA SilentlyContinue)
if ($ost.Count) { $s = 0; foreach ($f in $ost) { $s += $f.Length }; Zeile ('Die alten OST-Dateien (' + (Groesse $s) + ') bleiben liegen, bis das alte Profil gelöscht wird; das neue Profil lädt das Postfach neu.') }
Zeile 'Jetzt Outlook starten: Das Postfach wird eingerichtet und neu geladen (je nach Größe Minuten bis Stunden). PST-Archive danach über Datei → Öffnen und Exportieren neu einbinden.'` }),
  A({ id: 'ol-neu-aufbauen', titel: 'Outlook-Datei neu aufbauen (Adressbuch, Druckformate, E-Mail-Vorlage, RoamCache)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet Outlook und benennt die gewählte Datei um (*.alt_…), Outlook baut sie beim nächsten Start neu auf: Offline-Adressbuch (veraltete/fehlende Einträge), Druckformate „OutlPrnt“ (Druck stürzt ab, winzig, „erst ein Element auswählen“), E-Mail-Vorlage „NormalEmail.dotm“ (Editor spinnt, Absturz beim Antworten) oder RoamCache (Kategorien und Einstellungen springen zurück).',
    param: { label: 'Was neu aufbauen', platzhalter: 'Offline-Adressbuch', pflicht: true, optionen: ['Offline-Adressbuch', 'Druckformate', 'E-Mail-Vorlage', 'RoamCache'] },
    ps: String.raw`
NeedUser
$w = $P.Trim()
$ziel = switch -Regex ($w) { '^offline' { Join-Path $uLocal 'Microsoft\Outlook\Offline Address Books'; break } '^druck' { Join-Path $uRoam 'Microsoft\Outlook\OutlPrnt'; break } '^e-mail-vorlage' { Join-Path $uRoam 'Microsoft\Templates\NormalEmail.dotm'; break } '^roamcache' { Join-Path $uLocal 'Microsoft\Outlook\RoamCache'; break } default { throw ('Unbekannte Auswahl: ' + $w) } }
if (Test-Path -LiteralPath $ziel) {
  $it = Get-Item -LiteralPath $ziel -Force
  $gr = $(if ($it.PSIsContainer) { OrdnerGroesse $ziel } else { [double]$it.Length })
  Zeile ('Vorher: ' + $ziel + ' · ' + (Groesse $gr) + ' · Stand ' + $it.LastWriteTime.ToString('dd.MM.yyyy HH:mm'))
}
StopUser @('OUTLOOK')
$ok = RenameAlt $ziel $w
$hin = switch -Regex ($w) {
  '^offline' { 'Outlook lädt das Offline-Adressbuch nach dem Start neu (einige Minuten; sofort: Senden/Empfangen → Adressbuch herunterladen).' + $(if (-not $ok) { ' Ohne lokales Adressbuch arbeitet Outlook vermutlich im Online-Modus.' } else { '' }); break }
  '^druck' { 'Druckformate stehen beim nächsten Start wieder auf Standard (der Kalender druckt dann in Graustufen — Farbe in den Druckoptionen neu wählen).'; break }
  '^e-mail' { 'Outlook legt die E-Mail-Vorlage neu an. Eigene Schnellbausteine stecken in der umbenannten Datei und lassen sich bei Bedarf zurückholen.'; break }
  default { 'Outlook lädt Kategorien, AutoVervollständigen und weitere servergespeicherte Einstellungen beim nächsten Start neu aus dem Postfach.' }
}
Zeile $hin` }),
  A({ id: 'ol-anhaenge-temp', titel: 'Anlagen-Zwischenspeicher von Outlook leeren (mit Sicherung)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet Outlook und verschiebt den Inhalt des sicheren Anlagen-Ordners (OutlookSecureTempFolder, „Content.Outlook“) in einen Sicherungsordner. Behebt „Die Anlage kann nicht erstellt werden“, Anhänge mit „(1)…(99)“ im Namen und belegten Speicher. Dort geänderte, nicht gespeicherte Anhänge bleiben in der Sicherung erhalten.',
    ps: String.raw`
NeedHive
$sk = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Security'
$reg = [string](Get-ItemProperty -Path $sk -Name OutlookSecureTempFolder -EA SilentlyContinue).OutlookSecureTempFolder
$ordner = @()
if ($reg) { $reg = $reg.TrimEnd('\'); if ($reg.StartsWith($uProf, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $reg)) { $ordner += $reg } else { Zeile ('Eingetragener Anlagen-Ordner liegt nicht im Profil oder fehlt: ' + $reg) } }
foreach ($b in (Join-Path $uLocal 'Microsoft\Windows\INetCache\Content.Outlook'), (Join-Path $uLocal 'Microsoft\Windows\Temporary Internet Files\Content.Outlook')) { foreach ($d in Get-ChildItem -LiteralPath $b -Directory -Force -EA SilentlyContinue) { if ($ordner -notcontains $d.FullName) { $ordner += $d.FullName } } }
if (-not $ordner.Count) { throw 'Kein Anlagen-Zwischenspeicher von Outlook gefunden.' }
StopUser @('OUTLOOK')
$sich = Join-Path $uLocal ('Microsoft\Outlook\Anlagen-Sicherung_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
$gesamt = 0
foreach ($ord in $ordner) {
  $f = @(Get-ChildItem -LiteralPath $ord -Recurse -File -Force -EA SilentlyContinue)
  $gr = 0; foreach ($x in $f) { $gr += $x.Length }
  $bearb = @($f | Where-Object { $_.LastWriteTime -gt $_.CreationTime.AddMinutes(2) })
  Zeile ('' + $ord + ': ' + $f.Count + ' Dateien, ' + (Groesse $gr) + $(if ($bearb.Count) { ' · davon ' + $bearb.Count + ' nach dem Öffnen geändert: ' + ((@($bearb | Select-Object -First 5 | ForEach-Object { $_.Name })) -join ', ') } else { '' }))
  if (-not $f.Count) { continue }
  $z = Join-Path $sich (Split-Path $ord -Leaf)
  New-Item -Path $z -ItemType Directory -Force | Out-Null
  foreach ($x in Get-ChildItem -LiteralPath $ord -Force -EA SilentlyContinue) { try { Move-Item -LiteralPath $x.FullName -Destination $z -Force -EA Stop; $gesamt++ } catch {} }
  $rest = @(Get-ChildItem -LiteralPath $ord -Recurse -File -Force -EA SilentlyContinue).Count
  if ($rest) { Zeile ('  ' + $rest + ' Dateien sind noch geöffnet und bleiben liegen.') }
}
Zeile ('Verschoben: ' + $gesamt + ' Einträge nach ' + $sich + ' (nach ein paar Tagen löschbar). Outlook kann wieder gestartet werden.')` }),
  A({ id: 'ol-signaturen', titel: 'Outlook-Signaturen sichern/zurückspielen, Cloud-Signaturen schalten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Listet die Signaturen des Benutzers, sichert den Signaturordner (Kopie, nichts wird gelöscht), spielt fehlende Signaturen aus der letzten Sicherung zurück (ohne zu überschreiben) oder schaltet die Cloud-Signaturen (Abgleich über das Postfach, Ursache für doppelte/überschriebene Signaturen) aus bzw. wieder an.',
    param: { label: 'Aktion', platzhalter: 'Sichern', pflicht: true, optionen: ['Sichern', 'Letzte Sicherung zurückspielen', 'Sichern + Cloud-Signaturen aus', 'Cloud-Signaturen wieder an'] },
    ps: String.raw`
NeedHive
$a = $P.Trim()
$nm = [string](Get-ItemProperty -Path ($uHive + '\Software\Microsoft\Office\16.0\Common\General') -Name Signatures -EA SilentlyContinue).Signatures
$ms = Join-Path $uRoam 'Microsoft'
$sig = $null
foreach ($n in @($nm, 'Signatures', 'Signaturen')) { if ($n -and -not $sig -and (Test-Path -LiteralPath (Join-Path $ms $n))) { $sig = Join-Path $ms $n } }
if (-not $sig) { $sig = Join-Path $ms $(if ($nm) { $nm } else { 'Signatures' }) }
function SigListe { @(Get-ChildItem -LiteralPath $sig -Filter '*.htm' -File -EA SilentlyContinue | ForEach-Object { $_.BaseName }) }
$vor = @(SigListe)
Zeile ('Signaturordner: ' + $sig + ' · ' + $vor.Count + ' Signatur(en)' + $(if ($vor.Count) { ': ' + ($vor -join ', ') } else { '' }))
$sich = Join-Path $ms 'Signaturen-Sicherung'
$setup = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Setup'
$cloud = (Get-ItemProperty -Path $setup -Name DisableRoamingSignaturesTemporaryToggle -EA SilentlyContinue).DisableRoamingSignaturesTemporaryToggle
function Sichern {
  if (-not $vor.Count) { Zeile 'Keine Signaturen vorhanden — nichts zu sichern.'; return }
  $z = Join-Path $sich (Get-Date -Format 'yyyyMMdd_HHmmss')
  New-Item -Path $z -ItemType Directory -Force | Out-Null
  Get-ChildItem -LiteralPath $sig -Force -EA SilentlyContinue | Copy-Item -Destination $z -Recurse -Force -EA Stop
  Zeile ('Gesichert nach ' + $z + ' (' + (Groesse (OrdnerGroesse $z)) + ').')
}
function Cloud([int]$wert) {
  if (-not (Test-Path $setup)) { New-Item -Path $setup -Force | Out-Null }
  Set-ItemProperty -Path $setup -Name DisableRoamingSignaturesTemporaryToggle -Value $wert -Type DWord
  Zeile ('Cloud-Signaturen: vorher ' + $(if ($null -ne $cloud -and [int]$cloud -eq 1) { 'aus' } else { 'an' }) + ', jetzt ' + $(if ($wert -eq 1) { 'aus — Outlook nutzt nur noch die Signaturen dieses PCs' } else { 'an — Signaturen werden über das Postfach abgeglichen (Outlook im Web, andere PCs)' }) + '. Outlook neu starten.')
}
switch -Regex ($a) {
  '^sichern \+ cloud' { Sichern; Cloud 1; break }
  '^sichern$' { Sichern; break }
  '^letzte sicherung' {
    $l = Get-ChildItem -LiteralPath $sich -Directory -EA SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $l) { throw ('Keine Sicherung gefunden (' + $sich + ') — vorher „Sichern“ nutzen.') }
    if (-not (Test-Path -LiteralPath $sig)) { New-Item -Path $sig -ItemType Directory -Force | Out-Null }
    $n = 0
    foreach ($x in Get-ChildItem -LiteralPath $l.FullName -Force) { $ziel = Join-Path $sig $x.Name; if (-not (Test-Path -LiteralPath $ziel)) { Copy-Item -LiteralPath $x.FullName -Destination $ziel -Recurse -Force; $n++ } }
    Zeile ('Aus der Sicherung ' + $l.Name + ': ' + $n + ' fehlende Dateien/Ordner zurückgespielt (vorhandene wurden nicht überschrieben).')
    Zeile ('Signaturen jetzt: ' + ((@(SigListe)) -join ', '))
    if ($null -eq $cloud -or [int]$cloud -ne 1) { Zeile 'Hinweis: Cloud-Signaturen sind an — überschreibt Outlook die Signaturen wieder, „Sichern + Cloud-Signaturen aus“ wählen.' }
    break }
  '^cloud-signaturen wieder an' { Cloud 0; break }
  default { throw ('Unbekannte Auswahl: ' + $a) }
}` }),

  // ── Regeln, QuickSteps (Outlook-COM in der Benutzersitzung) ──────────────────
  A({ id: 'ol-regeln-anzeigen', titel: 'Outlook-Regeln anzeigen (auch Weiterleitungen)', modus: 'benutzer', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Listet alle Regeln des Postfachs aus dem laufenden Outlook: aktiv/aus, beim Empfang/Senden, „nur auf diesem PC“ und was sie tun (verschieben, löschen, WEITERLEITEN). Outlook muss beim Benutzer geöffnet sein.',
    ps: String.raw`
$ol = $null
try { $ol = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') } catch {}
if (-not $ol) { throw 'Outlook läuft nicht in der Sitzung des Benutzers — bitte zuerst „Outlook starten“ und den Schritt danach wiederholen.' }
$st = $null; $rs = $null
try { $st = $ol.Session.DefaultStore; $rs = $st.GetRules() } catch { throw ('Regeln nicht lesbar (Outlook offline oder beschäftigt?): ' + $_.Exception.Message) }
Zeile ('Postfach ' + $st.DisplayName + ': ' + $rs.Count + ' Regel(n)')
$verd = 0
for ($j = 1; $j -le $rs.Count; $j++) {
  $r = $rs.Item($j); $ac = $r.Actions; $t = @()
  if ($ac.MoveToFolder.Enabled) { $f = ''; try { $f = [string]$ac.MoveToFolder.Folder.FolderPath } catch {}; $t += ('verschieben nach ' + $f) }
  if ($ac.CopyToFolder.Enabled) { $f = ''; try { $f = [string]$ac.CopyToFolder.Folder.FolderPath } catch {}; $t += ('kopieren nach ' + $f) }
  if ($ac.Delete.Enabled) { $t += 'löschen' }
  if ($ac.DeletePermanently.Enabled) { $t += 'ENDGÜLTIG löschen' }
  if ($ac.Forward.Enabled -or $ac.ForwardAsAttachment.Enabled -or $ac.Redirect.Enabled) { $t += 'WEITERLEITEN (Ziel in Outlook prüfen)'; $verd++ }
  if ($ac.Stop.Enabled) { $t += 'keine weiteren Regeln' }
  Zeile (('' + $j) + '. „' + $r.Name + '“ · ' + $(if ($r.Enabled) { 'aktiv' } else { 'aus' }) + ' · ' + $(if ($r.RuleType -eq 1) { 'beim Senden' } else { 'beim Empfang' }) + $(if ($r.IsLocalRule) { ' · nur auf diesem PC' } else { '' }) + $(if ($t.Count) { ' · ' + ($t -join ', ') } else { '' }))
}
if (-not $rs.Count) { Zeile 'Keine Regeln vorhanden.' }
if ($verd) { Zeile ('Achtung: ' + $verd + ' Regel(n) leiten Mails weiter — unbekannte Weiterleitungen sofort der IT-Sicherheit melden.') }
Zeile 'Nicht sichtbar sind hier ausgeblendete Regeln und die Weiterleitung aus Outlook im Web (Einstellungen → E-Mail → Weiterleitung).'` }),
  A({ id: 'ol-regeln-zuruecksetzen', titel: 'Outlook-Regeln oder QuickSteps zurücksetzen', modus: 'benutzer', risiko: 'kritisch', timeoutMs: 90000,
    beschreibung: 'ACHTUNG, nicht umkehrbar: Startet Outlook mit /cleanclientrules (nur Regeln „auf diesem Computer“), /cleanrules (ALLE Regeln, auch auf dem Server) oder /resetquicksteps (QuickSteps auf Standard). Hilft bei „Regeln konnten nicht gespeichert werden“, beschädigten Regeln oder kaputten QuickSteps. Vorher werden die Regelnamen aufgelistet; die nötigen Regeln danach neu anlegen.',
    param: { label: 'Was zurücksetzen', platzhalter: 'Nur PC-Regeln', pflicht: true, optionen: ['Nur PC-Regeln', 'Alle Regeln', 'QuickSteps'] },
    ps: String.raw`
$s = switch -Regex ($P.Trim()) { '^nur pc' { '/cleanclientrules'; break } '^alle regeln' { '/cleanrules'; break } '^quicksteps' { '/resetquicksteps'; break } default { throw ('Unbekannte Auswahl: ' + $P) } }
$ol = $null
try { $ol = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') } catch {}
if ($ol -and $s -ne '/resetquicksteps') {
  try { $rs = $ol.Session.DefaultStore.GetRules(); $nm = @(); for ($j = 1; $j -le $rs.Count; $j++) { $x = $rs.Item($j); $nm += ([string]$x.Name + $(if ($x.IsLocalRule) { ' (nur PC)' } else { '' })) }; Zeile ('Vorher ' + $rs.Count + ' Regel(n): ' + $(if ($nm.Count) { $nm -join ', ' } else { 'keine' })) } catch { Zeile 'Regeln vorher nicht lesbar.' }
} elseif (-not $ol) { Zeile 'Outlook lief nicht — der Vorher-Stand konnte nicht aufgelistet werden.' }
if ($ol) { try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ol) } catch {} }
$ol = $null
Get-Process OUTLOOK -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue; Start-Sleep -Seconds 3
Start-Process -FilePath 'outlook.exe' -ArgumentList $s
$was = switch ($s) { '/cleanrules' { 'ALLE Regeln (auch die auf dem Server) werden gelöscht' } '/cleanclientrules' { 'die Regeln „nur auf diesem Computer“ werden gelöscht, Server-Regeln bleiben' } default { 'die QuickSteps werden auf den Auslieferungszustand gesetzt' } }
Zeile ('Outlook mit ' + $s + ' gestartet — ' + $was + '. Danach die benötigten Regeln/QuickSteps neu anlegen.')` }),

  // ── Cache-Zeitraum, AutoErmittlung ───────────────────────────────────────────
  A({ id: 'ol-offline-zeitraum', titel: 'Outlook-Cache: Zeitraum „Offline halten“ setzen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Setzt, wie viele Monate Outlook im Cache-Modus lokal hält (SyncWindowSetting): weniger = kleinere OST, „Alles“ = auch alte Mails offline und in der Suche. Gilt für neu angelegte Profile sofort, im bestehenden Profil zusätzlich über den Regler bzw. „Neues Outlook-Profil anlegen“. Eine Richtlinie hat Vorrang und wird gemeldet.',
    param: { label: 'Offline halten', platzhalter: '12 Monate', pflicht: true, optionen: ['1 Monat', '3 Monate', '6 Monate', '12 Monate', '24 Monate', 'Alles'] },
    ps: String.raw`
NeedHive
$m = switch -Regex ($P.Trim()) { '^1 monat$' { 1; break } '^3 monate$' { 3; break } '^6 monate$' { 6; break } '^12 monate$' { 12; break } '^24 monate$' { 24; break } '^alles$' { 0; break } default { throw ('Unbekannter Zeitraum: ' + $P) } }
function MonTxt($v) { if ($null -eq $v) { 'nicht gesetzt (Outlook-Standard, meist 12 Monate)' } elseif ([int]$v -eq 0) { 'alles' } elseif ([int]$v -eq 1) { '1 Monat' } else { '' + $v + ' Monate' } }
$pv = (Get-ItemProperty -Path ($uHive + '\Software\Policies\Microsoft\Office\16.0\Outlook\Cached Mode') -Name SyncWindowSetting -EA SilentlyContinue).SyncWindowSetting
if ($null -ne $pv) { Zeile ('Achtung: per Richtlinie vorgegeben: ' + (MonTxt $pv) + ' — die Richtlinie hat Vorrang (zuständig DXC).') }
$k = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Cached Mode'
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
$alt = (Get-ItemProperty -Path $k -Name SyncWindowSetting -EA SilentlyContinue).SyncWindowSetting
Set-ItemProperty -Path $k -Name SyncWindowSetting -Value $m -Type DWord
Zeile ('Offline halten: vorher ' + (MonTxt $alt) + ', jetzt ' + (MonTxt $m))
$tage = (Get-ItemProperty -Path $k -Name SyncWindowSettingDays -EA SilentlyContinue).SyncWindowSettingDays
if ($null -ne $tage) { Remove-ItemProperty -Path $k -Name SyncWindowSettingDays -EA SilentlyContinue; Zeile ('SyncWindowSettingDays (' + $tage + ' Tage) entfernt — es gilt jetzt der Monatswert.') }
foreach ($f in Get-ChildItem -LiteralPath (Join-Path $uLocal 'Microsoft\Outlook') -Filter *.ost -EA SilentlyContinue) { Zeile ('OST ' + $f.Name + ': ' + (Groesse $f.Length)) }
Zeile 'Im bestehenden Profil wirkt der Wert erst nach dem Regler unter Datei → Kontoeinstellungen → Ändern bzw. mit einem neuen Outlook-Profil.'` }),
  A({ id: 'ol-autoermittlung-cloud', titel: 'Outlook-AutoErmittlung direkt zu Microsoft 365', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Lässt die AutoErmittlung alte Wege überspringen (Active-Directory-Eintrag eines alten Exchange-Servers, Firmen-Webseite, SRV-Eintrag) und immer die moderne Microsoft-365-Anmeldung nutzen. Behebt Fenster „Zulassen, dass diese Website die Servereinstellungen konfiguriert“, Zertifikats- und Kennwortfenster alter Server und langsames Verbinden. „Standard“ nimmt die Werte wieder heraus.',
    param: { label: 'Einstellung', platzhalter: 'Direkt zu Microsoft 365', pflicht: true, optionen: ['Direkt zu Microsoft 365', 'Standard (zurücksetzen)'] },
    ps: String.raw`
NeedHive
$ad = $uHive + '\Software\Microsoft\Office\16.0\Outlook\AutoDiscover'
$ex = $uHive + '\Software\Microsoft\Exchange'
$pp = Get-ItemProperty -Path ($uHive + '\Software\Policies\Microsoft\Office\16.0\Outlook\AutoDiscover') -EA SilentlyContinue
if ($pp) { $pn = @($pp.PSObject.Properties | Where-Object { $_.Name -match '^(Exclude|Prefer)' } | ForEach-Object { $_.Name + '=' + $_.Value }); if ($pn.Count) { Zeile ('Per Richtlinie gesetzt (hat Vorrang): ' + ($pn -join ', ')) } }
$liste = @(@($ad, 'ExcludeScpLookup'), @($ad, 'ExcludeHttpsRootDomain'), @($ad, 'ExcludeSrvRecord'), @($ex, 'AlwaysUseMSOAuthForAutoDiscover'))
switch -Regex ($P.Trim()) {
  '^direkt' {
    foreach ($e in $liste) {
      if (-not (Test-Path $e[0])) { New-Item -Path $e[0] -Force | Out-Null }
      $alt = (Get-ItemProperty -Path $e[0] -Name $e[1] -EA SilentlyContinue).($e[1])
      Set-ItemProperty -Path $e[0] -Name $e[1] -Value 1 -Type DWord
      Zeile ($e[1] + ': vorher ' + $(if ($null -eq $alt) { 'nicht gesetzt' } else { [string]$alt }) + ', jetzt 1')
    }
    $x = (Get-ItemProperty -Path $ad -Name ExcludeExplicitO365Endpoint -EA SilentlyContinue).ExcludeExplicitO365Endpoint
    if ($null -ne $x -and [int]$x -eq 1) { Set-ItemProperty -Path $ad -Name ExcludeExplicitO365Endpoint -Value 0 -Type DWord; Zeile 'ExcludeExplicitO365Endpoint: vorher 1 (Microsoft 365 wurde übersprungen!), jetzt 0' }
    $lx = (Get-ItemProperty -Path $ad -Name PreferLocalXML -EA SilentlyContinue).PreferLocalXML
    if ($null -ne $lx -and [int]$lx -eq 1) { Zeile 'Achtung: PreferLocalXML = 1 — Outlook nimmt eine lokale XML-Datei für die AutoErmittlung (prüfen, ob gewollt).' }
    break }
  '^standard' {
    $n = 0
    foreach ($e in $liste) { $alt = (Get-ItemProperty -Path $e[0] -Name $e[1] -EA SilentlyContinue).($e[1]); if ($null -ne $alt) { Remove-ItemProperty -Path $e[0] -Name $e[1] -EA SilentlyContinue; $n++; Zeile ($e[1] + ': vorher ' + $alt + ', jetzt entfernt (Standard)') } }
    if (-not $n) { Zeile 'Es waren keine eigenen AutoErmittlungs-Werte gesetzt.' }
    break }
  default { throw ('Unbekannte Auswahl: ' + $P) }
}
Zeile ('Outlook neu starten — ' + $(if ($P -match '^direkt') { 'die AutoErmittlung fragt dann direkt Microsoft 365.' } else { 'die AutoErmittlung nutzt wieder alle Standardwege.' }))` }),
]
