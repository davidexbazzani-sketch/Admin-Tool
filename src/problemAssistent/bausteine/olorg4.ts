// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „olorg“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Outlook-Organisation: Kalender, Freigaben, Aufgaben, Datendateien, Add-ins, neues Outlook.
// Outlook-COM nur in der Benutzersitzung (Art „benutzer“); Benutzer-Registry nur über $uHive (Art „profil“).
// Richtlinien (Software\Policies) werden nur gelesen und gemeldet, nie geschrieben.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

export const AKTIONEN_OLORG4: PaAktion[] = [
  // ── Outlook mit Schaltern für Kalender, Freigaben, Aufgaben starten ─────────
  A({ id: 'olorg-schalter', titel: 'Outlook mit Kalender-/Freigabe-/Aufgaben-Schalter starten', modus: 'benutzer', risiko: 'aendern', timeoutMs: 60000,
    beschreibung: 'Schließt Outlook in der Sitzung des Benutzers (erst sauber, nach 15 s hart) und startet es mit einem Schalter: /resetsharedfolders (freigegebene Kalender/Ordner aus dem Navigationsbereich entfernen), /cleansniff (Sperre der Besprechungsverarbeitung aufheben), /sniff (neue Einladungen sofort in den Kalender eintragen), /cleanroamedprefs (im Postfach gespeicherte Einstellungen wie Arbeitszeit, Erinnerungen, Frei/Gebucht-Raster neu von diesem PC schreiben), /cleansharing (Internetkalender-, RSS- und SharePoint-Abos entfernen, Inhalte bleiben), /resettodobar (Aufgabenliste der To-Do-Leiste neu aufbauen), /cleanmailtipcache (zwischengespeicherte E-Mail-Infos wie „abwesend“ verwerfen), /resetformregions (Formularbereiche von Add-ins neu laden), /remigratecategories (verwendete Kategorien in die Hauptliste übernehmen).',
    param: { label: 'Schalter', platzhalter: '/cleansniff', pflicht: true, optionen: ['/resetsharedfolders', '/cleansniff', '/sniff', '/cleanroamedprefs', '/cleansharing', '/resettodobar', '/cleanmailtipcache', '/resetformregions', '/remigratecategories'] },
    ps: String.raw`
$s = $P.Trim().ToLower()
$erlaubt = @('/resetsharedfolders', '/cleansniff', '/sniff', '/cleanroamedprefs', '/cleansharing', '/resettodobar', '/cleanmailtipcache', '/resetformregions', '/remigratecategories')
if ($erlaubt -notcontains $s) { throw ('Schalter nicht erlaubt: ' + $s) }
$lief = @(Get-Process OUTLOOK -EA SilentlyContinue)
if ($lief.Count) {
  foreach ($x in $lief) { try { [void]$x.CloseMainWindow() } catch {} }
  $bis = (Get-Date).AddSeconds(15)
  while ((Get-Process OUTLOOK -EA SilentlyContinue) -and ((Get-Date) -lt $bis)) { Start-Sleep -Milliseconds 500 }
  $rest = @(Get-Process OUTLOOK -EA SilentlyContinue)
  if ($rest.Count) { $rest | Stop-Process -Force -EA SilentlyContinue; Zeile 'Outlook reagierte nicht auf Schließen und wurde beendet.' } else { Zeile 'Outlook wurde geschlossen.' }
  Start-Sleep -Seconds 2
} else { Zeile 'Outlook lief nicht.' }
Start-Process -FilePath 'outlook.exe' -ArgumentList $s
$was = switch ($s) {
  '/resetsharedfolders' { 'Alle freigegebenen Kalender und Ordner anderer Personen wurden aus dem Navigationsbereich entfernt — benötigte Kalender über „Kalender hinzufügen → Aus Adressbuch“ neu öffnen.' }
  '/cleansniff' { 'Die Sperre der Besprechungsverarbeitung auf diesem PC ist aufgehoben — neue Einladungen werden wieder automatisch (vorläufig) eingetragen und Antworten in der Teilnehmerliste verbucht.' }
  '/sniff' { 'Outlook durchsucht den Posteingang nach neuen Besprechungsanfragen und trägt sie in den Kalender ein.' }
  '/cleanroamedprefs' { 'Die im Postfach gespeicherten Einstellungen (Arbeitszeit, Erinnerungen, Frei/Gebucht-Raster, Kalenderveröffentlichung) wurden verworfen und von diesem PC neu geschrieben — Datei → Optionen → Kalender danach kontrollieren.' }
  '/cleansharing' { 'Alle Abos von Internetkalendern, RSS-Feeds und SharePoint-Listen wurden aus den Kontoeinstellungen entfernt (geladene Inhalte bleiben) — benötigte Abos neu hinzufügen.' }
  '/resettodobar' { 'Die Aufgabenliste der To-Do-Leiste wird neu aufgebaut (Suchordner neu erstellt).' }
  '/cleanmailtipcache' { 'Die zwischengespeicherten E-Mail-Infos (MailTips wie „abwesend“, „Postfach voll“) wurden verworfen und werden neu vom Server geholt.' }
  '/resetformregions' { 'Die Formularbereiche (z. B. von Add-ins in Termin- oder Mailfenstern) werden neu geladen.' }
  default { 'Alle in Elementen verwendeten Kategorien werden in die Hauptkategorienliste übernommen.' }
}
Zeile ('Outlook mit ' + $s + ' gestartet. ' + $was)` }),

  // ── Datendateien (PST/OST): wo liegen sie, wie groß, Richtlinien ────────────
  A({ id: 'olorg-datendateien', titel: 'Outlook-Datendateien finden (PST/OST, Ort, Größe, Richtlinien)', modus: 'profil', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Listet alle in den Outlook-Profilen eingetragenen PST- und OST-Dateien mit Ort (lokal, OneDrive, Netzlaufwerk), Größe, Schreibschutz und Abstand zur Größengrenze, meldet fehlende Dateien, sucht nicht eingebundene PST/OST in Dokumente, Desktop, OneDrive und im Outlook-Ordner und zeigt die PST-Richtlinien (DisablePST, PSTDisableGrow …). Ändert nichts.',
    ps: String.raw`
NeedHive
$ok = $uHive + '\Software\Microsoft\Office\16.0\Outlook'
function PfadText($v) {
  if ($null -eq $v) { return '' }
  if ($v -is [byte[]]) { return ([Text.Encoding]::Unicode.GetString($v)).Trim([char]0).Trim() }
  return ([string]$v).Trim([char]0).Trim()
}
function Ort([string]$p) {
  if ($p -match '^\\\\') { return 'NETZWERKPFAD (nicht unterstützt: langsam, Abbrüche, Beschädigung)' }
  if ($p -match '(?i)\\OneDrive') { return 'im ONEDRIVE-Ordner (Synchronisierung sperrt die Datei)' }
  $m = [regex]::Match($p, '^([A-Za-z]):')
  if ($m.Success) {
    $lw = $m.Groups[1].Value.ToUpper()
    $netz = [string](Get-ItemProperty -Path ($uHive + '\Network\' + $lw) -Name RemotePath -EA SilentlyContinue).RemotePath
    if ($netz) { return ('auf NETZLAUFWERK ' + $lw + ': = ' + $netz + ' (nicht unterstützt)') }
    if ($lw -ne 'C') { return ('auf Laufwerk ' + $lw + ':') }
  }
  return 'lokal'
}
$maxMb = 51200
foreach ($q in ($uHive + '\Software\Policies\Microsoft\Office\16.0\Outlook\PST'), ($ok + '\PST')) {
  $mx = (Get-ItemProperty -Path $q -Name MaxLargeFileSize -EA SilentlyContinue).MaxLargeFileSize
  if ($null -ne $mx) { $maxMb = [int]$mx; break }
}
$std = [string](Get-ItemProperty -Path $ok -EA SilentlyContinue).DefaultProfile
$profs = @(Get-ChildItem -Path ($ok + '\Profiles') -EA SilentlyContinue)
Zeile ('Outlook-Profile: ' + $(if ($profs.Count) { (@($profs | ForEach-Object { $_.PSChildName + $(if ($_.PSChildName -eq $std) { ' (Standard)' } else { '' }) })) -join ', ' } else { 'keine (Outlook für diesen Benutzer nicht eingerichtet)' }))
$eingetragen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$anzahl = 0
foreach ($pr in $profs) {
  foreach ($sek in Get-ChildItem -Path $pr.PSPath -EA SilentlyContinue) {
    $p = Get-ItemProperty -Path $sek.PSPath -EA SilentlyContinue
    if (-not $p) { continue }
    foreach ($e in @(@('001f6700', 'PST'), @('001f6610', 'OST'))) {
      $pp = $p.PSObject.Properties[$e[0]]
      if (-not $pp) { continue }
      $pfad = PfadText $pp.Value
      if (-not $pfad) { continue }
      if (-not $eingetragen.Add($pr.PSChildName + '|' + $pfad)) { continue }
      [void]$eingetragen.Add($pfad)
      $anzahl++
      $ort = Ort $pfad
      $info = ''
      if ($ort -match 'NETZ') { $info = 'Existenz vom Admin-Zugang aus nicht prüfbar' }
      elseif (Test-Path -LiteralPath $pfad) {
        $f = Get-Item -LiteralPath $pfad -Force -EA SilentlyContinue
        $info = (Groesse ([double]$f.Length)) + ' · geändert ' + $f.LastWriteTime.ToString('dd.MM.yyyy HH:mm')
        if ($f.IsReadOnly) { $info += ' · SCHREIBGESCHÜTZT' }
        if (([double]$f.Length / 1MB) -ge ($maxMb * 0.9)) { $info += ' · FAST AN DER GRÖSSENGRENZE' }
      } else { $info = 'FEHLT — Datei nicht gefunden' }
      Zeile ($e[1] + ' [Profil ' + $pr.PSChildName + ']: ' + $pfad + ' · ' + $info + ' · ' + $ort)
    }
  }
}
if (-not $anzahl -and $profs.Count) { Zeile 'In den Profilen ist keine PST/OST-Datei eingetragen (Online-Modus oder Profil noch nie geöffnet).' }
$wurzeln = @((Join-Path $uLocal 'Microsoft\Outlook'), (Join-Path $uProf 'Documents'), (Join-Path $uProf 'Desktop'))
$wurzeln += @(Get-ChildItem -LiteralPath $uProf -Directory -Filter 'OneDrive*' -Force -EA SilentlyContinue | ForEach-Object { $_.FullName })
$gefunden = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$lose = 0
foreach ($w in $wurzeln) {
  if (-not (Test-Path -LiteralPath $w)) { continue }
  foreach ($f in Get-ChildItem -LiteralPath $w -Filter '*.?st' -File -Recurse -Depth 4 -Force -EA SilentlyContinue) {
    if ($f.Extension -notmatch '^\.(pst|ost)$') { continue }
    if (-not $gefunden.Add($f.FullName)) { continue }
    if ($eingetragen.Contains($f.FullName)) { continue }
    $lose++
    if ($lose -le 15) { Zeile ('Nicht eingebunden: ' + $f.FullName + ' · ' + (Groesse ([double]$f.Length)) + ' · geändert ' + $f.LastWriteTime.ToString('dd.MM.yyyy') + $(if ($f.Extension -ieq '.ost') { ' (alte OST eines früheren Profils)' } else { '' })) }
  }
}
if ($lose -gt 15) { Zeile ('… und ' + ($lose - 15) + ' weitere nicht eingebundene Datendateien.') }
if (-not $lose) { Zeile 'Keine weiteren (nicht eingebundenen) PST/OST-Dateien in Dokumente, Desktop, OneDrive und im Outlook-Ordner gefunden.' }
$alt = @(Get-ChildItem -LiteralPath (Join-Path $uLocal 'Microsoft\Outlook') -Filter '*.alt_*' -Force -EA SilentlyContinue)
if ($alt.Count) { $s = 0; foreach ($x in $alt) { if (-not $x.PSIsContainer) { $s += $x.Length } }; Zeile ('Sicherungen früherer Neuaufbauten (*.alt_…): ' + $alt.Count + ' · ' + (Groesse ([double]$s))) }
$pol = $uHive + '\Software\Policies\Microsoft\Office\16.0\Outlook'
$dp = (Get-ItemProperty -Path $pol -Name DisablePST -EA SilentlyContinue).DisablePST
if ($null -ne $dp) { Zeile ('Richtlinie DisablePST = ' + $dp + $(if ([int]$dp -eq 1) { ' — weitere PST-Dateien dürfen nicht hinzugefügt werden' } else { '' })) }
foreach ($q in ($pol + '\PST'), 'HKLM:\SOFTWARE\Policies\Microsoft\Office\16.0\Outlook\PST') {
  $pp = Get-ItemProperty -Path $q -EA SilentlyContinue
  if (-not $pp) { continue }
  $werte = @($pp.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $_.Name + '=' + $_.Value })
  if (-not $werte.Count) { continue }
  $grow = $pp.PSObject.Properties['PSTDisableGrow']
  Zeile ('Richtlinie PST (' + $(if ($q -like 'HKLM*') { 'Computer' } else { 'Benutzer' }) + '): ' + ($werte -join ', ') + $(if ($grow -and [int]$grow.Value -ne 0) { ' — PST-Dateien dürfen nicht weiter wachsen (nur lesen/löschen)' } else { '' }))
}
Zeile ('Größengrenze je PST/OST: ' + [math]::Round([double]$maxMb / 1024) + ' GB')
$c = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -EA SilentlyContinue
if ($c) { Zeile ('Freier Platz auf C: ' + (Groesse ([double]$c.FreeSpace))) }` }),

  // ── Postfach-Übersicht aus dem laufenden Outlook (Konten, Cache, Größen) ────
  A({ id: 'olorg-postfach-uebersicht', titel: 'Postfach-Übersicht aus Outlook (Konten, Cache-Modus, Postfächer, größte Ordner)', modus: 'benutzer', risiko: 'lesen', timeoutMs: 120000,
    beschreibung: 'Liest aus dem laufenden Outlook des Benutzers: Verbindungsart (Cache- oder Online-Modus, offline), alle Konten mit Übermittlungsort (Postfach oder PST), alle eingebundenen Postfächer, Archive und Datendateien mit Größe, Cache-Zustand und Kontingent sowie die größten Ordner des eigenen Postfachs mit „Gelöschte Elemente“. Outlook muss beim Benutzer geöffnet sein. Ändert nichts.',
    ps: String.raw`
$ol = $null
try { $ol = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') } catch {}
if (-not $ol) { throw 'Outlook läuft nicht in der Sitzung des Benutzers — bitte zuerst „Outlook starten“ und den Schritt danach wiederholen.' }
$ns = $ol.Session
$tagBasis = 'http://schemas.microsoft.com/mapi/proptag/'
function Wert($obj, [string]$tag) { try { return [double]$obj.PropertyAccessor.GetProperty($tagBasis + $tag) } catch { return -1 } }
$cm = -1; try { $cm = [int]$ns.ExchangeConnectionMode } catch {}
$mt = switch ($cm) { 0 { 'keine Exchange-Verbindung' } 100 { 'Online-Modus, OFFLINE' } 200 { 'Cache-Modus, offline' } 300 { 'Online-Modus, GETRENNT' } 400 { 'Cache-Modus, GETRENNT' } 500 { 'Cache-Modus, nur Kopfzeilen' } 600 { 'Cache-Modus, erst Kopfzeilen' } 700 { 'Cache-Modus, verbunden' } 800 { 'ONLINE-MODUS (kein lokaler Cache)' } default { 'unbekannt (' + $cm + ')' } }
$off = $false; try { $off = [bool]$ns.Offline } catch {}
Zeile ('Outlook ' + [string]$ol.Version + ' · Verbindung: ' + $mt + $(if ($off) { ' · „Offline arbeiten“ ist eingeschaltet' } else { '' }))
$i = 0
foreach ($a in $ns.Accounts) {
  $i++
  $typ = switch ([int]$a.AccountType) { 0 { 'Exchange' } 1 { 'IMAP' } 2 { 'POP3' } 3 { 'HTTP' } 4 { 'Exchange ActiveSync' } default { 'anderes' } }
  $lief = ''; try { $lief = [string]$a.DeliveryStore.DisplayName } catch {}
  Zeile ('Konto ' + $i + ': ' + [string]$a.SmtpAddress + ' (' + $typ + ')' + $(if ($lief) { ' · neue Mails landen in „' + $lief + '“' } else { '' }))
}
$stdId = ''; try { $stdId = [string]$ns.DefaultStore.StoreID } catch {}
foreach ($st in $ns.Stores) {
  $et = -1; try { $et = [int]$st.ExchangeStoreType } catch {}
  $typ = switch ($et) { 0 { 'eigenes Postfach' } 1 { 'Postfach mit Berechtigung (Chef/Gruppenpostfach)' } 2 { 'Öffentliche Ordner' } 3 { 'Datendatei' } 4 { 'zusätzliches Postfach (Gruppenpostfach/Online-Archiv)' } default { 'Typ ' + $et } }
  $z = [string]$st.DisplayName + ' · ' + $typ
  $gr = Wert $st '0x0E080014'
  if ($gr -ge 0) { $z += ' · ' + (Groesse $gr) }
  if ($et -eq 3) { try { $z += ' · Datei ' + [string]$st.FilePath } catch {} }
  elseif ($et -ne 2) { try { $z += $(if ($st.IsCachedExchange) { ' · im Cache' } else { ' · online (nicht im Cache)' }) } catch {} }
  $q = Wert $st '0x666E0003'
  if ($q -gt 0) { $z += ' · Senden gesperrt ab ' + (Groesse ($q * 1KB)) + $(if ($gr -ge 0) { ' (' + [math]::Round(100 * $gr / ($q * 1KB)) + ' % belegt)' } else { '' }) }
  try { if ($stdId -and [string]$st.StoreID -eq $stdId) { $z += ' · STANDARD-Speicherort' } } catch {}
  Zeile $z
}
$liste = New-Object System.Collections.Generic.List[object]
$lauf = @{ n = 0; bis = (Get-Date).AddSeconds(45) }
function Ordner($f, [int]$tiefe) {
  if ($lauf.n -ge 600 -or (Get-Date) -gt $lauf.bis) { return }
  $lauf.n++
  $g = Wert $f '0x0E080014'
  $c = 0; try { $c = [int]$f.Items.Count } catch {}
  $liste.Add([pscustomobject]@{ Pfad = [string]$f.FolderPath; Groesse = $g; Anzahl = $c })
  if ($tiefe -lt 6) { try { foreach ($u in $f.Folders) { Ordner $u ($tiefe + 1) } } catch {} }
}
try { foreach ($f in $ns.DefaultStore.GetRootFolder().Folders) { Ordner $f 1 } } catch { Zeile ('Ordner nicht lesbar: ' + $_.Exception.Message) }
if ($liste.Count) {
  $summe = 0; foreach ($x in $liste) { if ($x.Groesse -gt 0) { $summe += $x.Groesse } }
  Zeile ('Eigenes Postfach: ' + $liste.Count + ' Ordner geprüft, zusammen ' + (Groesse $summe) + $(if ($lauf.n -ge 600 -or (Get-Date) -gt $lauf.bis) { ' (nicht alle Ordner — Zeitlimit)' } else { '' }))
  foreach ($x in @($liste | Sort-Object Groesse -Descending | Select-Object -First 8)) { Zeile ('  ' + $x.Pfad + ': ' + (Groesse ([math]::Max([double]0, [double]$x.Groesse))) + ' · ' + $x.Anzahl + ' Elemente') }
}
try { $del = $ns.GetDefaultFolder(3); Zeile ('Gelöschte Elemente: ' + (Groesse ([math]::Max([double]0, (Wert $del '0x0E080014')))) + ' · ' + $del.Items.Count + ' Elemente — zählt voll zur Postfachgröße, bis der Ordner geleert ist.') } catch {}` }),

  // ── Kalender prüfen (Doppelte, Abgesagte, Serien, Erinnerungen, Freigaben) ──
  A({ id: 'olorg-kalender-pruefen', titel: 'Kalender prüfen (Doppelte, Abgesagte, Serien, Erinnerungen, Zeitzone, Kalenderliste)', modus: 'benutzer', risiko: 'lesen', timeoutMs: 120000,
    beschreibung: 'Prüft im laufenden Outlook des Benutzers den eigenen Kalender: Zeitzone in Outlook und Windows, Anzahl Einträge, doppelte Termine (−30 bis +90 Tage), abgesagte Besprechungen, die noch im Kalender stehen, Serien ohne Ende oder mit sehr vielen Ausnahmen, offene Besprechungsanfragen im Posteingang, aktive und alte Erinnerungen sowie die eingeblendeten Kalender anderer (erreichbar oder nicht). Outlook muss geöffnet sein. Ändert nichts.',
    ps: String.raw`
$ol = $null
try { $ol = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') } catch {}
if (-not $ol) { throw 'Outlook läuft nicht in der Sitzung des Benutzers — bitte zuerst „Outlook starten“ und den Schritt danach wiederholen.' }
$ns = $ol.Session
$tzOl = ''; try { $tzOl = [string]$ol.TimeZones.CurrentTimeZone.Name } catch {}
$tzWin = ''; try { $tzWin = [string](Get-TimeZone).DisplayName } catch {}
Zeile ('Zeitzone Outlook: ' + $(if ($tzOl) { $tzOl } else { '?' }) + ' · Windows: ' + $(if ($tzWin) { $tzWin } else { '?' }))
$cal = $ns.GetDefaultFolder(9)
$items = $cal.Items
$ges = 0; try { $ges = [int]$items.Count } catch {}
$cache = ''; try { $cache = $(if ($cal.Store.IsCachedExchange) { 'im Cache' } else { 'online' }) } catch {}
Zeile ('Kalender ' + [string]$cal.FolderPath + ': ' + $ges + ' Einträge (eine Serie zählt einmal) · ' + $cache)
$jetzt = Get-Date
$von = $jetzt.AddDays(-30); $bisDat = $jetzt.AddDays(90)
$st = @{ n = 0; serien = 0; offen = 0; ausn = 0; abg = 0 }
$abgListe = New-Object System.Collections.Generic.List[string]
$dop = @{}
$ende = (Get-Date).AddSeconds(60)
$abbruch = $false
foreach ($it in $items) {
  if ($st.n -ge 6000 -or (Get-Date) -gt $ende) { $abbruch = $true; break }
  $st.n++
  try {
    if ([string]$it.MessageClass -notlike 'IPM.Appointment*') { continue }
    $ms = [int]$it.MeetingStatus
    if ($ms -eq 5 -or $ms -eq 7) { $st.abg++; if ($abgListe.Count -lt 5) { $abgListe.Add(([datetime]$it.Start).ToString('dd.MM.yyyy HH:mm') + ' ' + [string]$it.Subject) } }
    if ($it.IsRecurring) {
      $st.serien++
      try { $rp = $it.GetRecurrencePattern(); if ($rp.NoEndDate) { $st.offen++ }; if ([int]$rp.Exceptions.Count -ge 50) { $st.ausn++ } } catch {}
    } else {
      $sd = [datetime]$it.Start
      if ($sd -ge $von -and $sd -le $bisDat) {
        $k = ([string]$it.Subject).Trim().ToLower() + '|' + $sd.ToString('dd.MM.yyyy HH:mm') + '|' + [int]$it.Duration
        if ($dop.ContainsKey($k)) { $dop[$k]++ } else { $dop[$k] = 1 }
      }
    }
  } catch {}
}
if ($abbruch) { Zeile ('Nur die ersten ' + $st.n + ' Einträge geprüft (Zeitlimit).') }
$d = @($dop.GetEnumerator() | Where-Object { $_.Value -gt 1 })
Zeile ('Doppelte Termine (gleicher Betreff, Beginn, Dauer; −30 bis +90 Tage): ' + $d.Count + $(if ($d.Count) { ' — z. B. ' + ((@($d | Select-Object -First 4 | ForEach-Object { $t = $_.Key -split '\|'; $t[1] + ' „' + $t[0] + '“ ' + $_.Value + '×' })) -join '; ') } else { '' }))
Zeile ('Abgesagte Besprechungen, die noch im Kalender stehen: ' + $st.abg + $(if ($abgListe.Count) { ' — z. B. ' + ($abgListe -join '; ') } else { '' }))
Zeile ('Serien: ' + $st.serien + ' · ohne Enddatum: ' + $st.offen + ' · mit sehr vielen Ausnahmen (≥ 50): ' + $st.ausn)
try {
  $req = $ns.GetDefaultFolder(6).Items.Restrict("[MessageClass] = 'IPM.Schedule.Meeting.Request'")
  Zeile ('Besprechungsanfragen im Posteingang: ' + $req.Count + $(if ($req.Count -gt 0) { ' (noch nicht beantwortet bzw. nicht verarbeitet)' } else { '' }))
} catch {}
try {
  $alt = 0; $sicht = 0; $rn = 0
  foreach ($r in $ol.Reminders) { $rn++; try { if ($r.IsVisible) { $sicht++ }; if ([datetime]$r.OriginalReminderDate -lt $jetzt.AddDays(-14)) { $alt++ } } catch {} }
  Zeile ('Erinnerungen: ' + $rn + ' aktiv · ' + $sicht + ' gerade fällig' + $(if ($alt) { ' · ' + $alt + ' älter als 14 Tage (Fall für „Erinnerungen bereinigen“)' } else { '' }))
} catch {}
try {
  $ex = $ol.ActiveExplorer()
  if (-not $ex -and $ol.Explorers.Count) { $ex = $ol.Explorers.Item(1) }
  if ($ex) {
    $modul = $ex.NavigationPane.Modules.GetNavigationModule(1)
    $nf = 0; $kaputt = New-Object System.Collections.Generic.List[string]
    foreach ($g in $modul.NavigationGroups) {
      foreach ($f in $g.NavigationFolders) {
        $nf++
        if ($nf -gt 60) { break }
        try { $null = $f.Folder.Name } catch { $kaputt.Add([string]$f.DisplayName) }
      }
    }
    Zeile ('Kalender in der Kalenderliste: ' + $nf + $(if ($kaputt.Count) { ' · NICHT erreichbar: ' + ($kaputt -join ', ') } else { ' · alle erreichbar' }))
  } else { Zeile 'Kalenderliste nicht lesbar (kein Outlook-Fenster geöffnet).' }
} catch { Zeile 'Kalenderliste nicht lesbar.' }` }),

  // ── Add-in vor dem automatischen Abschalten schützen ────────────────────────
  A({ id: 'olorg-addin-schutz', titel: 'Outlook-Add-in „immer aktivieren“ (nicht mehr automatisch abschalten)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Wie „Dieses Add-In immer aktivieren“: Trägt das gewählte Outlook-Add-in (Teams, enaio, Zoom, Webex, OneNote oder alle eingeschalteten) in die Liste DoNotDisableAddinList ein, stellt ein beim Benutzer abgeschaltetes Add-in wieder auf „beim Start laden“ und entfernt nur dessen Einträge aus der Liste der von Outlook deaktivierten Elemente. Outlook schaltet es danach nicht mehr wegen Ladezeit ab. Eine Richtlinie (AddinList) hat Vorrang und wird gemeldet.',
    param: { label: 'Add-in', platzhalter: 'enaio', pflicht: true, optionen: ['Teams', 'enaio', 'Zoom', 'Webex', 'OneNote', 'Alle eingeschalteten Add-ins'] },
    ps: String.raw`
NeedHive
$wahl = $P.Trim()
$muster = switch -Regex ($wahl) { '^teams$' { 'TeamsAddin|Teams Meeting'; break } '^enaio$' { 'enaio|OS_|optimal'; break } '^zoom$' { 'zoom'; break } '^webex$' { 'webex'; break } '^onenote$' { 'onenote'; break } '^alle eingeschalteten' { '.'; break } default { throw ('Unbekannte Auswahl: ' + $wahl) } }
$alle = ($muster -eq '.')
$quellen = @(($uHive + '\Software\Microsoft\Office\Outlook\Addins'), 'HKLM:\SOFTWARE\Microsoft\Office\Outlook\Addins', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\Outlook\Addins', 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\REGISTRY\MACHINE\Software\Microsoft\Office\Outlook\Addins', 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\REGISTRY\MACHINE\Software\Wow6432Node\Microsoft\Office\Outlook\Addins')
$treffer = [ordered]@{}
foreach ($q in $quellen) {
  foreach ($a in Get-ChildItem -Path $q -EA SilentlyContinue) {
    $p = Get-ItemProperty -Path $a.PSPath -EA SilentlyContinue
    $txt = $a.PSChildName + ' ' + [string]$p.FriendlyName + ' ' + [string]$p.Description
    if ($txt -notmatch $muster) { continue }
    $lb = $null; if ($p) { $lb = $p.LoadBehavior }
    if ($alle -and ($null -eq $lb -or [int]$lb -ne 3)) { continue }
    if (-not $treffer.Contains($a.PSChildName)) { $treffer[$a.PSChildName] = $(if ($p.FriendlyName) { [string]$p.FriendlyName } else { $a.PSChildName }) }
  }
}
if (-not $treffer.Count) { throw ('Kein passendes Outlook-Add-in gefunden („' + $wahl + '“) — es ist nicht installiert; über „Software-Installationen“ neu installieren.') }
$pl = Get-ItemProperty -Path ($uHive + '\Software\Policies\Microsoft\Office\16.0\Outlook\Resiliency\AddinList') -EA SilentlyContinue
$dn = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Resiliency\DoNotDisableAddinList'
if (-not (Test-Path $dn)) { New-Item -Path $dn -Force | Out-Null }
foreach ($id in @($treffer.Keys)) {
  $alt = (Get-ItemProperty -Path $dn -Name $id -EA SilentlyContinue).$id
  Set-ItemProperty -Path $dn -Name $id -Value 1 -Type DWord
  Zeile ($treffer[$id] + ' (' + $id + '): „immer aktivieren“ vorher ' + $(if ($null -eq $alt) { 'nicht gesetzt' } else { [string]$alt }) + ', jetzt 1')
  if ($pl -and $pl.PSObject.Properties[$id]) { Zeile ('  Achtung: per Richtlinie geregelt (AddinList = ' + $pl.PSObject.Properties[$id].Value + ') — die Richtlinie hat Vorrang (zuständig DXC).') }
  $uk = $uHive + '\Software\Microsoft\Office\Outlook\Addins\' + $id
  $lb = (Get-ItemProperty -Path $uk -Name LoadBehavior -EA SilentlyContinue).LoadBehavior
  if ($null -ne $lb -and [int]$lb -eq 2) { Set-ItemProperty -Path $uk -Name LoadBehavior -Value 3 -Type DWord; Zeile '  War beim Benutzer abgeschaltet (LoadBehavior 2) — jetzt 3 (beim Start laden).' }
}
$dis = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Resiliency\DisabledItems'
$dk = Get-Item -Path $dis -EA SilentlyContinue
$weg = 0
if ($dk) {
  foreach ($vn in @($dk.GetValueNames())) {
    $b = $dk.GetValue($vn)
    $t = $(if ($b -is [byte[]]) { [Text.Encoding]::Unicode.GetString($b) } else { [string]$b })
    $passt = $alle
    if (-not $passt -and $t -match $muster) { $passt = $true }
    if (-not $passt) { foreach ($id in @($treffer.Keys)) { if ($t -match [regex]::Escape($id)) { $passt = $true } } }
    if ($passt) { Remove-ItemProperty -Path $dis -Name $vn -EA SilentlyContinue; $weg++ }
  }
}
Zeile ('Von Outlook gesperrte Einträge dazu entfernt: ' + $weg)
Zeile 'Outlook neu starten. Bleibt das Add-in langsam oder stürzt es ab, das Add-in aktualisieren bzw. neu installieren (Software-Kachel).'` }),

  // ── Neues Outlook (olk.exe) zurücksetzen ────────────────────────────────────
  A({ id: 'olorg-neues-outlook-reset', titel: 'Neues Outlook zurücksetzen (Datenordner neu aufbauen)', modus: 'profil', risiko: 'aendern', timeoutMs: 90000,
    beschreibung: 'Beendet das neue Outlook (olk.exe) des Benutzers und benennt seinen lokalen Datenordner (AppData\Local\Microsoft\Olk) um (*.alt_…, nichts wird gelöscht). Beim nächsten Start richtet sich das neue Outlook neu ein und lädt Postfach, Einstellungen und Add-ins aus Microsoft 365 — gegen weißes Fenster, endloses Laden, „Etwas ist schiefgelaufen“ und hängende Konten. Das klassische Outlook bleibt unberührt.',
    ps: String.raw`
NeedUser
$pk = $null
try { $pk = Get-AppxPackage -AllUsers -Name 'Microsoft.OutlookForWindows' -EA Stop | Select-Object -First 1 } catch {}
Zeile ('Neues Outlook (Microsoft.OutlookForWindows): ' + $(if ($pk) { 'installiert, Version ' + $pk.Version } else { 'Paket nicht gefunden' }))
if ($uHive) {
  $un = (Get-ItemProperty -Path ($uHive + '\Software\Microsoft\Office\16.0\Outlook\Preferences') -Name UseNewOutlook -EA SilentlyContinue).UseNewOutlook
  Zeile ('Umschalter „Neues Outlook“: ' + $(if ($null -eq $un) { 'nie benutzt' } elseif ([int]$un -eq 1) { 'AN (Outlook startet als neues Outlook)' } else { 'aus (klassisches Outlook)' }))
}
$olk = Join-Path $uLocal 'Microsoft\Olk'
if (-not (Test-Path -LiteralPath $olk)) {
  if (-not $pk) { throw 'Das neue Outlook ist auf diesem PC nicht installiert und wurde von diesem Benutzer nie gestartet.' }
  Zeile ('Kein Datenordner ' + $olk + ' — das neue Outlook wurde von diesem Benutzer noch nicht eingerichtet; nichts zurückzusetzen.')
} else {
  Zeile ('Datenordner: ' + $olk + ' · ' + (Groesse ([double](OrdnerGroesse $olk))))
  StopUser @('olk')
  $ok = $false
  for ($v = 1; $v -le 4 -and -not $ok; $v++) { try { $ok = RenameAlt $olk 'Datenordner des neuen Outlook' } catch { Start-Sleep -Seconds 3 } }
  if (-not $ok) { throw 'Der Datenordner ist noch in Benutzung (Hilfsprozesse des neuen Outlook laufen noch) — in einer Minute erneut versuchen oder den Benutzer ab- und anmelden lassen.' }
  Zeile 'Beim nächsten Start richtet sich das neue Outlook neu ein (ggf. einmal anmelden); Postfach und Einstellungen kommen aus Microsoft 365. Der alte Ordner kann nach ein paar Tagen gelöscht werden.'
}` }),
]
