// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „druck“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Drucker sind SEAL/PLOSSYS-Warteschlangen „PMDxxx“ (lokal auf dem PC, Port PLS_…). Verbindungen \\Server\Drucker
// und die Druckserver (w3149/w3150/w3166) werden nie geändert; Drucker/Treiber entfernt nur dr-entfernen.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Erlaubte Werte für „druck-ticket-option“ (persönliche Druckeinstellungen, ergänzt dr-voreinstellung). */
const TICKET = ['Sortiert', 'Nicht sortiert', 'Heften aus', 'Seitenreihenfolge normal', 'Skalierung 100 %', 'Papierart Normalpapier', 'Papierart automatisch', 'Alles auf Druckerstandard']

/** Erlaubte Werte für „druck-eigenschaft“ (Eigenschaften einer LOKALEN Warteschlange). */
const EIGENSCHAFT = ['Erweiterte Druckfunktionen an', 'Erweiterte Druckfunktionen aus', 'Gedruckte Aufträge nicht behalten', 'Über Spooler drucken', 'Bidirektionale Unterstützung aus']

export const AKTIONEN_DRUCK4: PaAktion[] = [
  A({ id: 'druck-ereignisse', titel: 'Druck-Ereignisse der letzten Tage (Spooler, Treiber, Aufträge)', modus: 'system', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Liest, was Windows rund ums Drucken protokolliert hat: Abstürze und Startfehler der Druckwarteschlange, Abstürze von spoolsv/splwow64/PrintIsolationHost mit dem schuldigen Treibermodul, Fehler aus „PrintService/Admin“ und — falls eingeschaltet — gedruckte Dokumente (Ereignis 307 mit Drucker und Seitenzahl). Ändert nichts.',
    param: { label: 'Wie viele Tage zurück (1–30, leer = 7)', platzhalter: '7' },
    ps: String.raw`
$tage = 7
$roh = $P.Trim()
if ($roh) { if ($roh -notmatch '^\d{1,2}$' -or [int]$roh -lt 1 -or [int]$roh -gt 30) { throw ('Ungültige Tageszahl „' + $roh + '“ — erlaubt 1 bis 30.') }; $tage = [int]$roh }
$ab = (Get-Date).AddDays(-$tage)
Zeile ('Druck-Ereignisse seit ' + $ab.ToString('dd.MM.yyyy HH:mm') + ' (' + $tage + ' Tage)')
function ErsteZeile($m) { $z = ([string]$m -split '\r?\n')[0].Trim(); if ($z.Length -gt 170) { $z = $z.Substring(0, 170) + ' …' }; return $z }
# 1) Druckwarteschlange abgestürzt bzw. nicht gestartet (Dienststeuerung)
$sc = @()
try { $sc = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Service Control Manager'; Id = 7000, 7001, 7023, 7024, 7031, 7034; StartTime = $ab } -EA Stop | Where-Object { [string]$_.Message -match 'Druckwarteschlange|Print Spooler|Spooler' }) } catch {}
if ($sc.Count) {
  $sc | Group-Object Id | ForEach-Object { Zeile ('Druckwarteschlange: Ereignis ' + $_.Name + ' ' + $_.Count + '× (zuletzt ' + $_.Group[0].TimeCreated.ToString('dd.MM. HH:mm') + ') — ' + (ErsteZeile $_.Group[0].Message)) }
} else { Zeile 'Druckwarteschlange: keine Abstürze oder Startfehler.' }
# 2) Abstürze rund ums Drucken (Anwendungsprotokoll 1000) mit Modul
$ap = @()
try { $ap = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Error'; Id = 1000; StartTime = $ab } -EA Stop | Where-Object { $_.Properties.Count -gt 3 -and ([string]$_.Properties[0].Value -match '^(spoolsv|splwow64|PrintIsolationHost|PrintFilterPipelineSvc)\.exe$') }) } catch {}
if ($ap.Count) {
  $ap | Group-Object { [string]$_.Properties[0].Value + ' · Modul ' + [string]$_.Properties[3].Value } | Sort-Object Count -Descending | Select-Object -First 6 | ForEach-Object { Zeile ('Absturz: ' + $_.Name + ' — ' + $_.Count + '×, zuletzt ' + $_.Group[0].TimeCreated.ToString('dd.MM. HH:mm')) }
  Zeile 'Ein Treibermodul (z. B. ...drv.dll, PrintConfig.dll, Hersteller-DLL) als Absturzursache zeigt den schuldigen Druckertreiber.'
} else { Zeile 'Keine Abstürze von spoolsv, splwow64 oder PrintIsolationHost.' }
# 3) PrintService/Admin: Fehler und Warnungen
$adm = @()
try { $adm = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-PrintService/Admin'; StartTime = $ab } -MaxEvents 300 -EA Stop | Where-Object { $_.Level -ge 1 -and $_.Level -le 3 }) } catch {}
if ($adm.Count) {
  $adm | Group-Object Id | Sort-Object Count -Descending | Select-Object -First 8 | ForEach-Object { Zeile ('PrintService ' + $_.Name + ' (' + $_.Count + '×, zuletzt ' + $_.Group[0].TimeCreated.ToString('dd.MM. HH:mm') + '): ' + (ErsteZeile $_.Group[0].Message)) }
} else { Zeile 'PrintService/Admin: keine Fehler oder Warnungen.' }
# 4) PrintService/Operational: gedruckte Dokumente (307) und Fehler — nur wenn das Protokoll an ist
$opLog = $null
try { $opLog = Get-WinEvent -ListLog 'Microsoft-Windows-PrintService/Operational' -EA Stop } catch {}
if (-not $opLog -or -not $opLog.IsEnabled) {
  Zeile 'Druckprotokoll (PrintService/Operational) ist aus — welche Dokumente gedruckt wurden, protokolliert dieser PC nicht (dann zeigt es nur das PLOSSYS-Protokoll am Druckserver).'
} else {
  $op = @()
  try { $op = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-PrintService/Operational'; StartTime = $ab } -MaxEvents 500 -EA Stop) } catch {}
  $ged = @($op | Where-Object { $_.Id -eq 307 })
  $feh = @($op | Where-Object { $_.Level -ge 1 -and $_.Level -le 3 })
  Zeile ('Druckprotokoll: ' + $ged.Count + ' gedruckte Dokumente, ' + $feh.Count + ' Fehler/Warnungen')
  foreach ($e in @($ged | Select-Object -First 10)) {
    $pp = $e.Properties
    if ($pp.Count -ge 8) { Zeile ('  ' + $e.TimeCreated.ToString('dd.MM. HH:mm') + ' · „' + [string]$pp[1].Value + '“ von ' + [string]$pp[2].Value + ' → ' + [string]$pp[4].Value + ' · ' + [string]$pp[7].Value + ' Seite(n), ' + (Groesse ([double]$pp[6].Value))) }
  }
  $feh | Group-Object Id | Sort-Object Count -Descending | Select-Object -First 5 | ForEach-Object { Zeile ('  Fehler ' + $_.Name + ' (' + $_.Count + '×): ' + (ErsteZeile $_.Group[0].Message)) }
}` }),

  A({ id: 'druck-details', titel: 'Druckerdetails: Einstellungen, Fähigkeiten und Anschluss eines Druckers', modus: 'benutzer', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Zeigt für einen Drucker des Benutzers: Art (SEAL-Warteschlange, Verbindung, lokal/USB), Port, Treiber mit Version, Zustand und Fehlerzustand, Warteschlangen-Eigenschaften (erweiterte Druckfunktionen, direkt drucken, gedruckte Aufträge behalten, Druckzeiten, Trennseite), die persönlichen Druckeinstellungen (Duplex, Farbe, Format, Fach, Kopien, Sortieren, Heften, Skalierung, Papierart) und was der Treiber anbietet (Fächer, Formate, Heften, Duplex, bedruckbarer Rand). Ändert nichts.',
    param: { label: 'Druckername', platzhalter: 'z. B. PMD634', pflicht: true },
    ps: String.raw`
$n = ($P.Trim().TrimEnd('\') -replace '^.*\\', '').Trim()
if ($n -notmatch '^[A-Za-z0-9][\w .,()#&+-]{1,100}$') { throw ('Ungültiger Druckername: ' + $P) }
function Wert($x) { if ($null -eq $x -or [string]$x -eq '') { return '—' }; return [string]$x }
function Liste($l) { $a = @(@($l) | ForEach-Object { [string]$_ } | Where-Object { $_ } | Select-Object -Unique); if (-not $a.Count) { return '—' }; return ($a -join '/') }
function FormatText($m) { if ($null -eq $m) { return '—' }; if ($m.PageMediaSizeName) { return [string]$m.PageMediaSizeName }; if ($m.Width) { return ('{0:N0}×{1:N0} mm' -f ($m.Width * 25.4 / 96), ($m.Height * 25.4 / 96)) }; return [string]$m }
function Uhr($s) { $x = [regex]::Match([string]$s, '(\d{2})(\d{2})\d{2}\.'); if ($x.Success) { return ($x.Groups[1].Value + ':' + $x.Groups[2].Value) }; return [string]$s }
$wmi = @(Get-WmiObject Win32_Printer -EA SilentlyContinue)
$p = @($wmi | Where-Object { [string]$_.Name -ieq $n -or ([string]$_.Name -replace '^.*\\', '') -ieq $n })
if (-not $p.Count) { $p = @($wmi | Where-Object { [string]$_.Name -like ('*' + $n + '*') }) }
if (-not $p.Count) { throw ('Drucker „' + $n + '“ ist beim Benutzer nicht installiert. Vorhanden: ' + ((@($wmi | ForEach-Object { [string]$_.Name })) -join ', ')) }
if ($p.Count -gt 1) { Zeile ('Mehrere Treffer: ' + ((@($p | ForEach-Object { [string]$_.Name })) -join ', ') + ' — angezeigt wird der erste.') }
$w = $p[0]; $name = [string]$w.Name
$art = 'lokal'
if ($w.Network -or $name -like '\\*') { $art = 'Verbindung zum Druckserver' } elseif ([string]$w.PortName -like 'PLS_*') { $art = 'SEAL/PLOSSYS-Warteschlange' } elseif ([string]$w.PortName -like 'USB*' -or [string]$w.PortName -like 'DOT4*') { $art = 'USB-Drucker' } elseif ([string]$w.PortName -like 'WSD*') { $art = 'automatisch eingerichtet (WSD)' } elseif ([string]$w.PortName -match '^(IP_)?\d+\.\d+\.\d+\.\d+') { $art = 'direkt per IP' }
Zeile ($name + ' · ' + $art + ' · Port ' + $w.PortName + ' · Treiber ' + $w.DriverName + $(if ($w.Default) { ' · Standarddrucker' } else { '' }))
$zust = @{ 1 = 'sonstiges'; 2 = 'unbekannt'; 3 = 'bereit'; 4 = 'druckt'; 5 = 'wärmt auf'; 6 = 'angehalten'; 7 = 'offline' }
$err = @{ 3 = 'wenig Papier'; 4 = 'kein Papier'; 5 = 'wenig Toner'; 6 = 'kein Toner'; 7 = 'Klappe offen'; 8 = 'Papierstau'; 9 = 'offline'; 10 = 'Service angefordert'; 11 = 'Ausgabefach voll' }
$z = $zust[[int]$w.PrinterStatus]; if (-not $z) { $z = [string]$w.PrinterStatus }
$f = $err[[int]$w.DetectedErrorState]
Zeile ('Zustand: ' + $z + $(if ($f) { ' · meldet: ' + $f } else { '' }) + $(if ($w.WorkOffline) { ' · „Drucker offline verwenden“ ist AN' } else { '' }) + $(if ($w.Location) { ' · Standort ' + $w.Location } else { '' }))
$zeit = 'immer'
if ($w.StartTime -and $w.UntilTime -and [string]$w.StartTime -ne [string]$w.UntilTime) { $zeit = 'nur ' + (Uhr $w.StartTime) + '–' + (Uhr $w.UntilTime) + ' (UTC)' }
Zeile ('Warteschlange: erweiterte Druckfunktionen ' + (Ja (-not $w.RawOnly)) + ' · direkt zum Drucker ' + (Ja $w.Direct) + ' · gedruckte Aufträge behalten ' + (Ja $w.KeepPrintedJobs) + ' · bidirektional ' + (Ja $w.EnableBIDI) + ' · verfügbar ' + $zeit + ' · Trennseite ' + $(if ($w.SeparatorFile) { $w.SeparatorFile } else { 'keine' }))
$drv = @(Get-WmiObject Win32_PrinterDriver -EA SilentlyContinue | Where-Object { ([string]$_.Name -split ',')[0] -ieq [string]$w.DriverName }) | Select-Object -First 1
if ($drv) {
  $ver = ''; try { $ver = [string](Get-Item -LiteralPath $drv.DriverPath -EA Stop).VersionInfo.FileVersion } catch {}
  Zeile ('Treiberdatei: ' + (Split-Path ([string]$drv.DriverPath) -Leaf) + $(if ($ver) { ' · Version ' + $ver } else { '' }) + $(if ([string]$drv.ConfigFile -like '*PrintConfig.dll') { ' · Typ-4-/Klassentreiber' } else { '' }))
}
try {
  Add-Type -AssemblyName System.Printing -EA Stop
  $lps = New-Object System.Printing.LocalPrintServer
  $qs = @($lps.GetPrintQueues([System.Printing.EnumeratedPrintQueueTypes[]]@('Local', 'Connections')))
  $q = @($qs | Where-Object { $_.FullName -ieq $name }) | Select-Object -First 1
  if (-not $q) { $q = @($qs | Where-Object { $_.FullName -like ('*' + $n) }) | Select-Object -First 1 }
  if (-not $q) { throw 'Warteschlange über System.Printing nicht gefunden' }
  $t = $q.UserPrintTicket; $quelle = 'persönlich'
  if (-not $t) { $t = $q.DefaultPrintTicket; $quelle = 'Druckerstandard' }
  Zeile ('Druckeinstellungen (' + $quelle + '): Duplex ' + (Wert $t.Duplexing) + ' · Farbe ' + (Wert $t.OutputColor) + ' · Format ' + (FormatText $t.PageMediaSize) + ' · ' + (Wert $t.PageOrientation) + ' · Kopien ' + (Wert $t.CopyCount) + ' · Sortieren ' + (Wert $t.Collation) + ' · Fach ' + (Wert $t.InputBin))
  Zeile ('Weiter: Seiten pro Blatt ' + (Wert $t.PagesPerSheet) + ' · Heften ' + (Wert $t.Stapling) + ' · Papierart ' + (Wert $t.PageMediaType) + ' · Skalierung ' + (Wert $t.PageScalingFactor) + ' · Qualität ' + (Wert $t.OutputQuality) + ' · Reihenfolge ' + (Wert $t.PageOrder) + ' · Schriftersetzung ' + (Wert $t.DeviceFontSubstitution))
  $c = $null; try { $c = $q.GetPrintCapabilities($t) } catch {}
  if ($c) {
    Zeile ('Treiber bietet: Duplex ' + (Liste $c.DuplexingCapability) + ' · Farbe ' + (Liste $c.OutputColorCapability) + ' · Heften ' + (Liste $c.StaplingCapability) + ' · Sortieren ' + (Liste $c.CollationCapability) + ' · Seiten pro Blatt ' + (Liste $c.PagesPerSheetCapability))
    Zeile ('Fächer: ' + (Liste $c.InputBinCapability) + ' · Papierarten: ' + (Liste $c.PageMediaTypeCapability))
    $fm = @(@($c.PageMediaSizeCapability) | ForEach-Object { [string]$_.PageMediaSizeName } | Where-Object { $_ -and $_ -ne 'Unknown' } | Select-Object -Unique)
    Zeile ('Formate (' + $fm.Count + '): ' + ((@($fm | Select-Object -First 18)) -join ', ') + $(if ($fm.Count -gt 18) { ' …' } else { '' }))
    $ia = $c.PageImageableArea
    if ($ia) { Zeile ('Nicht bedruckbarer Rand: ' + ('{0:N1}' -f ($ia.OriginWidth * 25.4 / 96)) + ' mm links, ' + ('{0:N1}' -f ($ia.OriginHeight * 25.4 / 96)) + ' mm oben') }
  }
  Zeile ('Aufträge in der Warteschlange: ' + $q.NumberOfJobs + ' · Status ' + $q.QueueStatus)
} catch { Zeile ('Druckeinstellungen nicht lesbar (' + $_.Exception.Message + ').') }` }),

  A({ id: 'druck-ticket-option', titel: 'Weitere Druckeinstellung setzen (Sortieren, Heften, Reihenfolge, Skalierung, Papierart, Druckerstandard)', modus: 'benutzer', risiko: 'aendern', timeoutMs: 90000,
    beschreibung: 'Ergänzt „Druckeinstellung des Benutzers setzen“: Kopien sortiert/unsortiert, Heften aus, normale Seitenreihenfolge, Skalierung 100 %, Papierart Normalpapier bzw. automatisch — oder „Alles auf Druckerstandard“ (entfernt Wasserzeichen, Broschüre, Seiten pro Blatt usw. aus den persönlichen Einstellungen). Ohne „|Drucker“ gilt es für den Standarddrucker. Zeigt alten und neuen Wert; was der Treiber nicht anbietet, wird gemeldet.',
    param: { label: 'Einstellung (optional „|Druckername“, sonst Standarddrucker)', platzhalter: 'Sortiert', pflicht: true, optionen: TICKET },
    ps: String.raw`
$teile = @($P -split '\|', 2)
$e = $teile[0].Trim()
$erlaubt = @('Sortiert', 'Nicht sortiert', 'Heften aus', 'Seitenreihenfolge normal', 'Skalierung 100 %', 'Papierart Normalpapier', 'Papierart automatisch', 'Alles auf Druckerstandard')
$tr = @($erlaubt | Where-Object { $_ -ieq $e })
if (-not $tr.Count) { throw ('Einstellung nicht erlaubt: „' + $e + '“ — erlaubt: ' + ($erlaubt -join ', ')) }
$e = $tr[0]
$dn = ''; if ($teile.Count -gt 1) { $dn = $teile[1].Trim() }
if ($dn -and $dn -notmatch '^[\w .,()#&+\\-]{2,120}$') { throw ('Ungültiger Druckername: ' + $dn) }
$std = ''; try { $std = [string](Get-WmiObject Win32_Printer -Filter 'Default=TRUE' -EA Stop | Select-Object -First 1).Name } catch {}
if (-not $dn) { if (-not $std) { throw 'Kein Standarddrucker gesetzt — bitte „Einstellung|Druckername“ angeben (z. B. Sortiert|PMD634).' }; $dn = $std }
Add-Type -AssemblyName System.Printing -EA Stop
$lps = New-Object System.Printing.LocalPrintServer
$qs = @($lps.GetPrintQueues([System.Printing.EnumeratedPrintQueueTypes[]]@('Local', 'Connections')))
$q = @($qs | Where-Object { $_.FullName -ieq $dn -or $_.Name -ieq $dn -or $_.FullName -like ('*\' + $dn) }) | Select-Object -First 1
if (-not $q) { $q = @($qs | Where-Object { $_.FullName -like ('*' + $dn + '*') }) | Select-Object -First 1 }
if (-not $q) { throw ('Drucker „' + $dn + '“ ist beim Benutzer nicht installiert. Vorhanden: ' + ((@($qs | ForEach-Object { $_.FullName })) -join ', ')) }
$name = [string]$q.FullName
function W($x) { if ($null -eq $x -or [string]$x -eq '') { return '—' }; return [string]$x }
function Kurz($t) { if (-not $t) { return '—' }; $fm = '—'; if ($t.PageMediaSize -and $t.PageMediaSize.PageMediaSizeName) { $fm = [string]$t.PageMediaSize.PageMediaSizeName }; return ('Duplex ' + (W $t.Duplexing) + ', Farbe ' + (W $t.OutputColor) + ', ' + $fm + ', ' + (W $t.PageOrientation) + ', Kopien ' + (W $t.CopyCount) + ', Sortieren ' + (W $t.Collation) + ', Heften ' + (W $t.Stapling) + ', Seiten/Blatt ' + (W $t.PagesPerSheet) + ', Skalierung ' + (W $t.PageScalingFactor) + ', Papierart ' + (W $t.PageMediaType)) }
$vor = $q.UserPrintTicket
if ($e -eq 'Alles auf Druckerstandard') {
  $d = $q.DefaultPrintTicket
  if (-not $d) { throw ('Der Drucker ' + $name + ' liefert keine Standard-Druckeinstellungen.') }
  Zeile ($name + ' — vorher (persönlich): ' + (Kurz $vor))
  $q.UserPrintTicket = $d.Clone()
  $q.Commit()
  $q.Refresh()
  Zeile ($name + ' — jetzt (= Druckerstandard): ' + (Kurz $q.UserPrintTicket))
  Zeile 'Persönliche Abweichungen (Wasserzeichen, Broschüre, Heften, Seiten pro Blatt, Toner sparen …) sind zurückgesetzt.'
} else {
  $t = $vor; if (-not $t) { $t = $q.DefaultPrintTicket }; if (-not $t) { $t = New-Object System.Printing.PrintTicket }
  $t = $t.Clone()
  $feld = ''; $wert = $null; $cap = ''
  switch ($e) {
    'Sortiert' { $feld = 'Collation'; $wert = 'Collated'; $cap = 'CollationCapability' }
    'Nicht sortiert' { $feld = 'Collation'; $wert = 'Uncollated'; $cap = 'CollationCapability' }
    'Heften aus' { $feld = 'Stapling'; $wert = 'None'; $cap = 'StaplingCapability' }
    'Seitenreihenfolge normal' { $feld = 'PageOrder'; $wert = 'Standard'; $cap = 'PageOrderCapability' }
    'Skalierung 100 %' { $feld = 'PageScalingFactor'; $wert = 100 }
    'Papierart Normalpapier' { $feld = 'PageMediaType'; $wert = 'Plain'; $cap = 'PageMediaTypeCapability' }
    'Papierart automatisch' { $feld = 'PageMediaType'; $wert = 'AutoSelect'; $cap = 'PageMediaTypeCapability' }
  }
  $faehig = $null; try { $faehig = $q.GetPrintCapabilities($t) } catch {}
  if ($faehig -and $cap) {
    $txt = @(@($faehig.$cap) | ForEach-Object { [string]$_ })
    if ($txt.Count -and $txt -notcontains [string]$wert) { throw ('Der Treiber von ' + $name + ' bietet „' + $e + '“ nicht an (angeboten: ' + ($txt -join ', ') + ').') }
    if (-not $txt.Count -and $e -eq 'Heften aus') { Zeile ('Hinweis: Der Treiber von ' + $name + ' meldet keine Heft-Funktion — geheftet wird dann am Gerät bzw. in PLOSSYS.') }
  }
  if ($faehig -and $feld -eq 'PageScalingFactor' -and $faehig.PageScalingFactorRange) {
    $r = $faehig.PageScalingFactorRange
    if ($r.MaximumScale -and ([int]$r.MinimumScale -gt 100 -or [int]$r.MaximumScale -lt 100)) { throw ('Der Treiber von ' + $name + ' erlaubt keine Skalierung 100 %.') }
  }
  $alt = [string]$t.$feld; if (-not $alt) { $alt = 'nicht gesetzt' }
  $t.$feld = $wert
  $q.UserPrintTicket = $t
  $q.Commit()
  $q.Refresh()
  $neu = [string]$q.UserPrintTicket.$feld
  if ($neu -ne [string]$wert) { throw ('Der Treiber von ' + $name + ' hat „' + $e + '“ nicht übernommen (vorher ' + $alt + ', jetzt ' + $(if ($neu) { $neu } else { 'nicht gesetzt' }) + ') — er bietet es vermutlich nicht an.') }
  Zeile ($name + ': ' + $e + ' — vorher ' + $alt + ' → jetzt ' + $neu + ' (persönliche Druckeinstellung des Benutzers)')
}
Zeile 'Gilt für neue Ausdrucke; bereits geöffnete Programme übernehmen es teils erst nach ihrem Neustart.'` }),

  A({ id: 'druck-eigenschaft', titel: 'Eigenschaft einer Druckwarteschlange auf dem PC setzen (erweiterte Druckfunktionen, Spooler, gedruckte Aufträge, bidirektional)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Ändert eine Eigenschaft einer LOKALEN Warteschlange auf diesem PC (SEAL/PLOSSYS „PMD…“, USB- oder Etikettendrucker) wie im Reiter „Erweitert“/„Anschlüsse“: erweiterte Druckfunktionen an/aus (Seitenreihenfolge, Seiten pro Blatt, Broschüre), über den Spooler statt direkt drucken, gedruckte Aufträge nicht behalten, bidirektionale Abfrage aus. Verbindungen zu einem Druckserver werden nie geändert. Zeigt alten und neuen Wert.',
    param: { label: 'Einstellung|Druckername', platzhalter: 'Erweiterte Druckfunktionen an|PMD634', pflicht: true, optionen: EIGENSCHAFT },
    ps: String.raw`
$teile = @($P -split '\|', 2)
$e = $teile[0].Trim() -replace 'Auftraege', 'Aufträge' -replace '^Ueber', 'Über' -replace 'Unterstuetzung', 'Unterstützung'
$erlaubt = @('Erweiterte Druckfunktionen an', 'Erweiterte Druckfunktionen aus', 'Gedruckte Aufträge nicht behalten', 'Über Spooler drucken', 'Bidirektionale Unterstützung aus')
$tr = @($erlaubt | Where-Object { $_ -ieq $e })
if (-not $tr.Count) { throw ('Einstellung nicht erlaubt: „' + $e + '“ — erlaubt: ' + ($erlaubt -join ', ')) }
$e = $tr[0]
$dn = ''; if ($teile.Count -gt 1) { $dn = ($teile[1].Trim().TrimEnd('\') -replace '^.*\\', '').Trim() }
if (-not $dn) { throw 'Druckername fehlt — Format „Einstellung|Druckername“, z. B. „Erweiterte Druckfunktionen an|PMD634“.' }
if ($dn -notmatch '^[A-Za-z0-9][\w .,()#&+-]{1,100}$') { throw ('Ungültiger Druckername: ' + $dn) }
$alle = @(Get-WmiObject Win32_Printer -EA Stop)
$p = @($alle | Where-Object { [string]$_.Name -ieq $dn })
if (-not $p.Count) { $p = @($alle | Where-Object { ([string]$_.Name -replace '^.*\\', '') -ieq $dn }) }
if (-not $p.Count) { throw ('„' + $dn + '“ ist auf diesem PC nicht als lokale Warteschlange vorhanden (Verbindungen \\Server\Drucker gehören zum Druckserver und werden dort eingestellt). Lokal: ' + ((@($alle | Where-Object { -not $_.Network } | ForEach-Object { [string]$_.Name })) -join ', ')) }
$w = $p[0]; $name = [string]$w.Name
if ($w.Network -or $name -like '\\*') { throw ('„' + $name + '“ ist eine Verbindung zu einem Druckserver — diese Eigenschaft gilt dort für alle Benutzer und wird nur am Druckserver geändert (DXC). Das Tool ändert keine Druckserver.') }
$prop = ''; $soll = $false; $txt = ''
switch ($e) {
  'Erweiterte Druckfunktionen an' { $prop = 'RawOnly'; $soll = $false; $txt = 'Erweiterte Druckfunktionen' }
  'Erweiterte Druckfunktionen aus' { $prop = 'RawOnly'; $soll = $true; $txt = 'Erweiterte Druckfunktionen' }
  'Gedruckte Aufträge nicht behalten' { $prop = 'KeepPrintedJobs'; $soll = $false; $txt = 'Gedruckte Aufträge behalten' }
  'Über Spooler drucken' { $prop = 'Direct'; $soll = $false; $txt = 'Direkt zum Drucker drucken' }
  'Bidirektionale Unterstützung aus' { $prop = 'EnableBIDI'; $soll = $false; $txt = 'Bidirektionale Unterstützung' }
}
# Anzeige: bei RawOnly ist „an“ = erweiterte Funktionen AUS
function Anzeige([bool]$roh) { if ($prop -eq 'RawOnly') { return $(if ($roh) { 'aus' } else { 'an' }) }; return $(if ($roh) { 'an' } else { 'aus' }) }
$alt = [bool]$w.$prop
if ($alt -eq $soll) { Zeile ($name + ': ' + $txt + ' — schon ' + (Anzeige $alt) + ', nichts geändert.') } else {
  $grund = ''
  try { $w.$prop = $soll; [void]$w.Put() } catch { $grund = $_.Exception.Message }
  $n2 = @(Get-WmiObject Win32_Printer -EA SilentlyContinue | Where-Object { [string]$_.Name -eq $name }) | Select-Object -First 1
  $neu = $alt; if ($n2) { $neu = [bool]$n2.$prop }
  if ($neu -ne $soll -and $prop -eq 'KeepPrintedJobs' -and (Get-Command Set-Printer -EA SilentlyContinue)) {
    try { Set-Printer -Name $name -KeepPrintedJobs $false -EA Stop } catch { $grund = $_.Exception.Message }
    $n2 = @(Get-WmiObject Win32_Printer -EA SilentlyContinue | Where-Object { [string]$_.Name -eq $name }) | Select-Object -First 1
    if ($n2) { $neu = [bool]$n2.$prop }
  }
  if ($neu -ne $soll) { throw ($name + ': ' + $txt + ' ließ sich nicht umstellen' + $(if ($grund) { ' (' + $grund + ')' } else { '' }) + ' — bei SEAL-Warteschlangen ggf. von SEAL vorgegeben.') }
  Zeile ($name + ': ' + $txt + ' — vorher ' + (Anzeige $alt) + ' → jetzt ' + (Anzeige $neu))
}
if ($prop -eq 'KeepPrintedJobs') {
  $j = @(Get-WmiObject Win32_PrintJob -EA SilentlyContinue | Where-Object { ((([string]$_.Name) -split ',')[0] -replace '^.*\\', '').Trim() -ieq ($name -replace '^.*\\', '') })
  Zeile ('' + $j.Count + ' Aufträge stehen noch in der Warteschlange (fertige alte Einträge mit „Druckaufträge eines Druckers löschen“ entfernen).')
}
Zeile 'Gilt für neue Aufträge; bereits geöffnete Druckdialoge danach schließen und neu öffnen.'` }),

  A({ id: 'druck-auftraege-fortsetzen', titel: 'Angehaltene Druckaufträge fortsetzen', modus: 'system', risiko: 'aendern',
    beschreibung: 'Setzt angehaltene („Angehalten“/„Pausiert“) Druckaufträge auf diesem PC fort — für einen Drucker oder alle — und eine angehaltene lokale Warteschlange (SEAL „PMD…“) gleich mit. Aufträge mit Status „Fehler“ werden nur gemeldet (die lassen sich nur löschen). Nichts wird gelöscht.',
    param: { label: 'Druckername (leer = alle Drucker)', platzhalter: 'z. B. PMD634' },
    ps: String.raw`
$n = ($P.Trim().TrimEnd('\') -replace '^.*\\', '').Trim()
if ($n -and $n -notmatch '^[A-Za-z0-9][\w .,()#&+-]{1,100}$') { throw ('Ungültiger Druckername: ' + $P) }
$alle = @(); try { $alle = @(Get-WmiObject Win32_PrintJob -EA Stop) } catch { throw ('Druckaufträge nicht lesbar: ' + $_.Exception.Message) }
$j = @($alle | Where-Object { -not $n -or ((([string]$_.Name) -split ',')[0] -replace '^.*\\', '').Trim() -ieq $n })
$ang = @($j | Where-Object { ([int]$_.StatusMask -band 1) -ne 0 -or [string]$_.JobStatus -match 'Paused|Angehalten|Anhalten' })
Zeile ('' + $j.Count + ' Aufträge' + $(if ($n) { ' für ' + $n } else { ' auf dem PC' }) + ', davon ' + $ang.Count + ' angehalten')
foreach ($x in $ang) {
  $rc = -1; try { $r = $x.Resume(); if ($r) { $rc = [int]$r.ReturnValue } } catch {}
  Zeile ('„' + [string]$x.Document + '“ von ' + [string]$x.Owner + ' auf ' + (([string]$x.Name -split ',')[0]) + ': ' + $(if ($rc -eq 0) { 'fortgesetzt' } else { 'ließ sich nicht fortsetzen (Code ' + $rc + ')' }))
}
$feh = @($j | Where-Object { ([int]$_.StatusMask -band 2) -ne 0 })
if ($feh.Count) { Zeile ('' + $feh.Count + ' Auftrag/Aufträge stehen auf „Fehler“ — die lassen sich nicht fortsetzen, nur löschen („Druckaufträge eines Druckers löschen“).') }
$dr = @(Get-WmiObject Win32_Printer -EA SilentlyContinue | Where-Object { -not $_.Network -and (-not $n -or ([string]$_.Name -replace '^.*\\', '') -ieq $n) })
$pausiert = @($dr | Where-Object { [int]$_.ExtendedPrinterStatus -eq 8 -or [int]$_.PrinterStatus -eq 6 })
foreach ($d in $pausiert) {
  $rc = -1; try { $r = $d.Resume(); if ($r) { $rc = [int]$r.ReturnValue } } catch {}
  Zeile ('Warteschlange ' + [string]$d.Name + ' war angehalten → ' + $(if ($rc -eq 0) { 'fortgesetzt' } else { 'ließ sich nicht fortsetzen (Code ' + $rc + ')' }))
}
if (-not $ang.Count -and -not $pausiert.Count) { Zeile 'Nichts war angehalten — nichts geändert.' }` }),
]
