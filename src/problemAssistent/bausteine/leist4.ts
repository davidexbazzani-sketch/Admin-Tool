// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „leist“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Leistung & Speicher / Updates & Software: Start-/Anmelde-/Herunterfahr-Analyse, Installationsprotokoll mit Klartext
// zu Fehlercodes, versteckte Speicherfresser, Ruhezustands-/Auslagerungs-/Absturzabbild-Einstellung, Intune-Installationscache
// (IMECache) und Speicheroptimierung. Datenträger/Partitionen, Schattenkopien (vssadmin), BCD und Benutzerdateien werden nie verändert.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Auswahl für „leist4-systemdateien“ (nur ASCII — wird im Skript wörtlich verglichen). */
const SYSTEMDATEIEN = ['Ruhezustandsdatei verkleinern', 'Ruhezustand abschalten', 'Ruhezustand einschalten', 'Auslagerungsdatei automatisch', 'Speicherabbild automatisch', 'Speicherabbild nur Minidump']
/** Auswahl für „leist4-speicheroptimierung“ (nur ASCII). */
const SPEICHEROPT = ['Einschalten (Temp + Papierkorb nach 30 Tagen)', 'Einschalten + Downloads nach 60 Tagen', 'Downloads nie automatisch entfernen', 'Ausschalten']

export const AKTIONEN_LEIST4: PaAktion[] = [
  A({ id: 'leist4-start-analyse', titel: 'Start, Anmeldung und Herunterfahren: Dauer, Bremser und Startprüfungen', modus: 'system', risiko: 'lesen', timeoutMs: 120000,
    beschreibung: 'Wertet die Startleistungs-Protokolle der letzten 30 Tage aus: Dauer der letzten Starts (bis zum Desktop und Nachlauf nach der Anmeldung), Programme, Treiber und Dienste, die Start, Herunterfahren oder Standby verzögert haben, Dauer der Gruppenrichtlinien bei Start und Anmeldung, wartende Winlogon-Teilnehmer, Schnellstart und Art des letzten Starts, geplante bzw. gelaufene Datenträgerprüfungen (chkdsk, Dirty-Bit, NTFS 55/98) und Ergebnisse der Windows-Speicherdiagnose. Ändert nichts.',
    ps: String.raw`
function Daten($e) { $h = @{}; try { $x = [xml]$e.ToXml(); foreach ($d in @($x.Event.EventData.Data)) { if ($d -and $d.Name) { $h[[string]$d.Name] = [string]$d.InnerText } } } catch {}; return $h }
function Zahl($s) { $t = ([string]$s).Trim(); $v = 0.0; if ($t -match '^0x[0-9a-fA-F]+$') { return [double][Convert]::ToInt64($t.Substring(2), 16) }; [void][double]::TryParse($t, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$v); return $v }
function Sek($ms) { return ('{0:N0} s' -f ((Zahl $ms) / 1000)) }
function Erste($e) { return [string]((([string]$e.Message -split '\r?\n') | Where-Object { $_.Trim() } | Select-Object -First 1)) }
function Ev($f, [int]$n) { try { return @(Get-WinEvent -FilterHashtable $f -MaxEvents $n -EA Stop) } catch { return @() } }
$os = Get-CimInstance Win32_OperatingSystem
$up = (Get-Date) - $os.LastBootUpTime
Zeile ('Letzter Start: ' + $os.LastBootUpTime.ToString('dd.MM.yyyy HH:mm') + ' · läuft seit ' + [int][math]::Floor($up.TotalDays) + ' Tagen ' + $up.Hours + ' Std.')
$hb = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' -Name HiberbootEnabled -EA SilentlyContinue).HiberbootEnabled
Zeile ('Schnellstart: ' + $(if ($hb -eq 1) { 'AN — „Herunterfahren“ setzt Windows nicht zurück, nur „Neu starten“' } else { 'aus' }))
$kb = @(Ev @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Boot'; Id = 27 } 1)
if ($kb.Count) {
  $bd = Daten $kb[0]
  if ($bd.ContainsKey('BootType')) { $bt = [int](Zahl $bd['BootType']); Zeile ('Art des letzten Starts: ' + $(switch ($bt) { 0 { 'Kaltstart (vollständig)' } 1 { 'Schnellstart (Kernel aus dem Ruhezustand)' } 2 { 'Fortsetzen aus dem Ruhezustand' } default { 'Typ ' + $bt } })) }
}
$dp = @()
try { $dp = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Diagnostics-Performance/Operational'; StartTime = (Get-Date).AddDays(-30) } -MaxEvents 500 -EA Stop) } catch { Zeile 'Startleistungs-Protokoll (Diagnostics-Performance): keine Einträge der letzten 30 Tage bzw. nicht lesbar.' }
$st = @($dp | Where-Object { $_.Id -eq 100 } | Select-Object -First 6)
if ($st.Count) {
  Zeile 'Letzte Starts: Gesamt · bis zum Desktop · Nachlauf nach der Anmeldung · Profil laden · Autostart-Programme'
  foreach ($e in $st) { $d = Daten $e; Zeile ('  ' + $e.TimeCreated.ToString('dd.MM. HH:mm') + ' · ' + (Sek $d['BootTime']) + ' · ' + (Sek $d['MainPathBootTime']) + ' · ' + (Sek $d['BootPostBootTime']) + ' · ' + (Sek $d['BootUserProfileProcessingTime']) + ' · ' + $d['BootNumStartupApps']) }
  $mit = [double](@($st | ForEach-Object { Zahl ((Daten $_)['BootTime']) }) | Measure-Object -Average).Average
  if ($mit -gt 120000) { Zeile ('→ Der Start dauert im Schnitt ' + (Sek $mit) + ' — deutlich zu lang (gut: unter 60 s).') }
}
$br = @($dp | Where-Object { ($_.Id -ge 101 -and $_.Id -le 110) -or ($_.Id -ge 201 -and $_.Id -le 210) -or ($_.Id -ge 301 -and $_.Id -le 310) })
if ($br.Count) {
  Zeile ('Bremser laut Windows (30 Tage, ' + $br.Count + ' Meldungen):')
  $zl = foreach ($e in $br) {
    $d = Daten $e
    $n = $(if ($d['FriendlyName']) { $d['FriendlyName'] } elseif ($d['Name']) { $d['Name'] } else { Erste $e })
    $art = $(if ($e.Id -lt 200) { 'Start' } elseif ($e.Id -lt 300) { 'Herunterfahren' } else { 'Standby/Fortsetzen' })
    [pscustomobject]@{ k = $art + ': ' + $n + $(if ($d['Name'] -and $d['FriendlyName'] -and $d['Name'] -ne $d['FriendlyName']) { ' (' + $d['Name'] + ')' } else { '' }); g = (Zahl $d['DegradationTime']) }
  }
  @($zl) | Group-Object k | Sort-Object Count -Descending | Select-Object -First 10 | ForEach-Object { Zeile ('  ' + $_.Name + ' · ' + $_.Count + '× · bis ' + (Sek (($_.Group | Measure-Object g -Maximum).Maximum)) + ' länger als üblich') }
} elseif ($dp.Count) { Zeile 'Keine Programme, Treiber oder Dienste als Bremser gemeldet.' }
foreach ($e in @($dp | Where-Object { $_.Id -eq 200 } | Select-Object -First 3)) { $d = Daten $e; Zeile ('Herunterfahren ' + $e.TimeCreated.ToString('dd.MM. HH:mm') + ': ' + (Sek $d['ShutdownTime'])) }
$gp = @()
try { $gp = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-GroupPolicy/Operational'; Id = 8000, 8001; StartTime = (Get-Date).AddDays(-14) } -MaxEvents 6 -EA Stop) } catch {}
foreach ($e in $gp) {
  $d = Daten $e; $s = $d['PolicyElaspedTimeInSeconds']
  Zeile ('Gruppenrichtlinien ' + $(if ($e.Id -eq 8000) { 'beim Start (Computer)' } else { 'bei der Anmeldung' + $(if ($d['PrincipalSamName']) { ' (' + $d['PrincipalSamName'] + ')' } else { '' }) }) + ' ' + $e.TimeCreated.ToString('dd.MM. HH:mm') + ': ' + $(if ($s) { $s + ' s' } else { Erste $e }))
}
$wl = @(Ev @{ LogName = 'Application'; Id = 6005, 6006; StartTime = (Get-Date).AddDays(-14) } 40 | Where-Object { [string]$_.ProviderName -match 'Winlogon|Wlclntfy' })
if ($wl.Count) { Zeile ('Anmeldung wartete auf Winlogon-Teilnehmer (14 Tage, ' + $wl.Count + '×):'); foreach ($e in @($wl | Select-Object -First 4)) { Zeile ('  ' + $e.TimeCreated.ToString('dd.MM. HH:mm') + ' ' + (Erste $e)) } }
$be = @((Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name BootExecute -EA SilentlyContinue).BootExecute | Where-Object { $_ -and ([string]$_).Trim() -ne 'autocheck autochk *' })
Zeile ('Datenträgerprüfung beim nächsten Start: ' + $(if ($be.Count) { 'GEPLANT (' + ($be -join '; ') + ')' } else { 'nicht geplant' }))
$vol = @(Get-CimInstance Win32_Volume -Filter "DriveLetter='C:'" -EA SilentlyContinue) | Select-Object -First 1
if ($vol) { Zeile ('Laufwerk C: als fehlerhaft markiert (Dirty-Bit): ' + $(if ($vol.DirtyBitSet) { 'JA — Windows prüft C: beim nächsten Start' } else { 'nein' })) }
foreach ($e in @(Ev @{ LogName = 'Application'; Id = 1001; StartTime = (Get-Date).AddDays(-60) } 300 | Where-Object { [string]$_.ProviderName -match 'Wininit' } | Select-Object -First 3)) {
  $m = [string]$e.Message
  Zeile ('  Prüfung beim Start ' + $e.TimeCreated.ToString('dd.MM.yyyy HH:mm') + ': ' + $(if ($m -match '(?i)keine Probleme|found no problems|no problems') { 'ohne Befund' } elseif ($m -match '(?i)korrigiert|behoben|repariert|corrected|fixed|made corrections') { 'Fehler gefunden und korrigiert' } else { 'Ergebnis siehe Ereignis Wininit 1001' }))
}
$nt = @(Ev @{ LogName = 'System'; Id = 55, 98; StartTime = (Get-Date).AddDays(-30) } 30 | Where-Object { [string]$_.ProviderName -match 'Ntfs' })
if ($nt.Count) { Zeile ('Dateisystem-Meldungen (NTFS 55/98, 30 Tage): ' + $nt.Count + '× · zuletzt ' + $nt[0].TimeCreated.ToString('dd.MM. HH:mm') + ' ' + (Erste $nt[0])) } else { Zeile 'Dateisystem-Meldungen (NTFS 55/98, 30 Tage): keine' }
$md = @(Ev @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-MemoryDiagnostics-Results' } 3)
if ($md.Count) { foreach ($e in $md) { Zeile ('Speicherdiagnose ' + $e.TimeCreated.ToString('dd.MM.yyyy HH:mm') + ': ' + (Erste $e)) } } else { Zeile 'Speicherdiagnose: kein Ergebnis im Protokoll (lief noch nie bzw. wurde abgebrochen).' }` }),

  A({ id: 'leist4-installationsprotokoll', titel: 'Installationsprotokoll: letzte Installationen und Updates mit Fehlercode im Klartext', modus: 'system', risiko: 'lesen', timeoutMs: 180000,
    beschreibung: 'Zeigt die Installationen der letzten 30 Tage mit Ergebnis und Klartext zu bekannten Codes (1603, 1618, 1619, 1638, 0x8024…, 0x800f…, 0x87D…): Windows Installer (MsiInstaller 1033/1034/1035), Windows-Update-Verlauf mit Fehlercode, Intune-Apps aus dem Unternehmensportal (Status und Fehlercode je App aus der Registry der Intune-Verwaltungserweiterung) und Exit-/Fehlercodes aus dem IME-Log (IntuneManagementExtension.log, AppWorkload.log). Optional nur Einträge zu einem Programm oder Code. Ändert nichts.',
    param: { label: 'Programm oder Code (optional – leer = alles)', platzhalter: 'z. B. SAP, Java, 0x80070643, 1603', vorlagen: ['SAP', 'Java', 'Adobe', 'Office', 'Visual C++', '.NET', 'Kumulatives Update', 'Defender'] },
    ps: String.raw`
$f = $P.Trim()
if ($f.Length -gt 60) { throw 'Suchbegriff zu lang (höchstens 60 Zeichen).' }
$rx = $(if ($f) { [regex]::Escape($f) } else { '' })
$tx = @{
  '0' = 'erfolgreich'; '3010' = 'erfolgreich – Neustart nötig'; '1641' = 'erfolgreich – Neustart eingeleitet'; '1602' = 'vom Benutzer abgebrochen'
  '1603' = 'schwerwiegender Fehler (Ursache im MSI-Protokoll: ausstehender Neustart, alte Version, Rechte, laufendes Programm)'
  '1605' = 'Produkt ist nicht installiert'; '1612' = 'Installationsquelle der alten Version fehlt'; '1618' = 'eine andere Installation läuft gerade'
  '1619' = 'Installationspaket konnte nicht geöffnet werden (Pfad, Rechte, Download beschädigt)'; '1620' = 'Installationspaket ungültig'
  '1625' = 'durch Systemrichtlinie verboten'; '1633' = 'Paket passt nicht zu dieser Plattform (32/64 Bit, ARM)'; '1638' = 'eine andere Version ist bereits installiert'
  '1714' = 'ältere Version kann nicht entfernt werden'; '1722' = 'Fehler in einer benutzerdefinierten Aktion des Pakets'; '1935' = 'Fehler beim Installieren einer Assemblykomponente'
  '2738' = 'VBScript-Laufzeit für das Setup nicht verfügbar'
  '0x80070643' = 'schwerwiegender Installationsfehler (= MSI 1603)'; '0x80070652' = 'eine andere Installation läuft (= MSI 1618)'; '0x80070666' = 'andere Version bereits installiert (= MSI 1638)'
  '0x80070bc2' = 'Neustart nötig, um abzuschließen'; '0x80070bc9' = 'vorheriger Neustart steht noch aus'; '0x80070005' = 'Zugriff verweigert'; '0x80070070' = 'zu wenig Speicherplatz'
  '0x80070002' = 'Datei nicht gefunden (Installationsbefehl bzw. Update-Zwischenspeicher)'; '0x80070020' = 'Datei wird von einem anderen Prozess verwendet'; '0x80070570' = 'Datei oder Verzeichnis beschädigt'
  '0x800705b4' = 'Zeitüberschreitung'; '0x8007000d' = 'Daten ungültig (beschädigter Download)'; '0x80092004' = 'Signatur/Katalog nicht gefunden (catroot2)'
  '0x8024a105' = 'Update-Agent: Installation abgebrochen (Neustart bzw. Zwischenspeicher)'; '0x8024401c' = 'Zeitüberschreitung zum Update-Server'; '0x80244022' = 'Update-Server überlastet (HTTP 503)'
  '0x8024402c' = 'Update-Server nicht auflösbar (Proxy/DNS)'; '0x80240438' = 'Update-Dienst nicht erreichbar'; '0x80246007' = 'Update nicht vollständig heruntergeladen'; '0x80200056' = 'Download durch Neustart/Abmeldung unterbrochen'
  '0x80d02002' = 'Übermittlungsoptimierung: Download-Zeitüberschreitung'; '0x800f0922' = 'Verbindung zum Update-Server bzw. Wiederherstellungspartition zu klein'
  '0x800f0831' = 'Vorgänger-Paket fehlt im Komponentenspeicher'; '0x800f0982' = 'Komponente passt nicht (Sprachpaket/Feature)'; '0x800f081f' = 'Quelldateien nicht gefunden'; '0x800f0954' = 'Quelle Windows Update per Richtlinie gesperrt'
  '0x80073701' = 'Komponente fehlt'; '0x80073712' = 'Komponentenspeicher beschädigt'; '0xc1900208' = 'inkompatible App blockiert das Funktionsupdate'; '0xc1900101' = 'Treiberproblem – Funktionsupdate zurückgesetzt'
  '0x87d1041c' = 'Intune: App nach der Installation nicht erkannt (Erkennungsregel)'; '0x87d1313c' = 'Intune: Verbindung beim Download abgebrochen'
  '0x87d30065' = 'Intune: App-Inhalt konnte nicht abgerufen werden (Download)'; '0x87d300c9' = 'Intune: App-Inhalt konnte nicht heruntergeladen bzw. entpackt werden'
  '0x87d13b9f' = 'Intune: Installation bzw. Ablösung der App gescheitert (Details im IME-Log)'; '0x80091007' = 'Hashwert stimmt nicht (beschädigter Download)'
}
function Hex($n) { try { return ('0x{0:x8}' -f ([int64]$n -band [int64]4294967295)) } catch { return [string]$n } }
function Klar([string]$c) { $k = $c.Trim().ToLower(); if ($k -match '^-\d+$') { $k = Hex $k }; if ($tx.ContainsKey($k)) { return ' = ' + $tx[$k] }; return '' }
$msi = @()
try { $msi = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'MsiInstaller'; Id = 1033, 1034, 1035; StartTime = (Get-Date).AddDays(-30) } -MaxEvents 400 -EA Stop | Where-Object { -not $rx -or [string]$_.Message -match $rx }) } catch {}
$ml = foreach ($e in $msi) {
  $m = ([string]$e.Message).Trim(); $sm = [regex]::Match($m, '(-?\d+)\.?\s*$')
  $pr = @($e.Properties | ForEach-Object { [string]$_.Value })
  [pscustomobject]@{ z = $e.TimeCreated; a = $(switch ($e.Id) { 1033 { 'Installation' } 1034 { 'Deinstallation' } default { 'Änderung/Reparatur' } }); n = $(if ($pr.Count) { $pr[0] + $(if ($pr.Count -gt 1 -and $pr[1]) { ' ' + $pr[1] } else { '' }) } else { '?' }); c = $(if ($sm.Success) { $sm.Groups[1].Value } else { '?' }) }
}
$ml = @($ml)
$mf = @($ml | Where-Object { $_.c -notin '0', '3010', '1641' })
Zeile ('Windows Installer (30 Tage' + $(if ($f) { ', „' + $f + '“' } else { '' }) + '): ' + $ml.Count + ' Vorgänge, davon fehlgeschlagen: ' + $mf.Count)
foreach ($x in @($mf | Select-Object -First 8)) { Zeile ('  FEHLER ' + $x.z.ToString('dd.MM. HH:mm') + ' ' + $x.a + ' ' + $x.n + ' · Code ' + $x.c + (Klar $x.c)) }
foreach ($x in @($ml | Where-Object { $_.c -in '0', '3010', '1641' } | Select-Object -First 4)) { Zeile ('  ok ' + $x.z.ToString('dd.MM. HH:mm') + ' ' + $x.a + ' ' + $x.n + $(if ($x.c -ne '0') { ' · Code ' + $x.c + (Klar $x.c) } else { '' })) }
try {
  $se = New-Object -ComObject Microsoft.Update.Session
  $sr = $se.CreateUpdateSearcher()
  $an = [int]$sr.GetTotalHistoryCount()
  $hi = @(); if ($an -gt 0) { $hi = @($sr.QueryHistory(0, [math]::Min(60, $an)) | Where-Object { $_.Date -gt (Get-Date).AddDays(-30) -and [string]$_.Title -and (-not $rx -or [string]$_.Title -match $rx) }) }
  $hf = @($hi | Where-Object { [int]$_.ResultCode -in 3, 4, 5 })
  Zeile ('Windows-Update-Verlauf (30 Tage): ' + $hi.Count + ' Einträge, davon fehlgeschlagen/abgebrochen: ' + $hf.Count)
  foreach ($u in @($hf | Select-Object -First 8)) { $h = Hex $u.HResult; Zeile ('  FEHLER ' + ([datetime]$u.Date).ToLocalTime().ToString('dd.MM. HH:mm') + ' ' + ([string]$u.Title).Substring(0, [math]::Min(110, ([string]$u.Title).Length)) + ' · ' + $h + (Klar $h)) }
} catch { Zeile 'Windows-Update-Verlauf: nicht lesbar.' }
function IntSt([int]$v) { if ($v -ge 5000 -and $v -lt 6000) { 'Fehler' } elseif ($v -ge 3000 -and $v -lt 4000) { 'Anforderungen nicht erfüllt' } elseif ($v -ge 2000 -and $v -lt 3000) { 'läuft bzw. wartet (z. B. auf Neustart)' } elseif ($v -ge 1000 -and $v -lt 2000) { 'installiert' } else { 'nicht versucht bzw. unbekannt' } }
$w32 = 'HKLM:\SOFTWARE\Microsoft\IntuneManagementExtension\Win32Apps'
if (Test-Path -LiteralPath $w32) {
  $nm = @{}
  foreach ($lf in @(Get-ChildItem -LiteralPath 'C:\ProgramData\Microsoft\IntuneManagementExtension\Logs' -Filter '*.log' -EA SilentlyContinue | Where-Object { $_.Name -match '^(IntuneManagementExtension|AppWorkload)' } | Sort-Object LastWriteTime -Descending | Select-Object -First 3)) {
    foreach ($mm in [regex]::Matches((@(Get-Content -LiteralPath $lf.FullName -Tail 6000 -EA SilentlyContinue) -join ' '), '"Id":"([0-9a-fA-F-]{36})","Name":"([^"]{1,90})"')) { $nm[$mm.Groups[1].Value.ToLower()] = $mm.Groups[2].Value }
  }
  $wa = New-Object System.Collections.Generic.List[object]
  foreach ($u in @(Get-ChildItem -LiteralPath $w32 -EA SilentlyContinue)) {
    foreach ($k in @(Get-ChildItem -LiteralPath $u.PSPath -EA SilentlyContinue)) {
      if ($k.PSChildName -notmatch '^([0-9a-fA-F-]{36})_\d+$') { continue }
      $id = $Matches[1].ToLower()
      $es = (Get-ItemProperty -LiteralPath $k.PSPath -Name EnforcementStateMessage -EA SilentlyContinue).EnforcementStateMessage
      if (-not $es) { continue }
      $j = $null; try { $j = [string]$es | ConvertFrom-Json -EA Stop } catch {}
      if (-not $j) { continue }
      $nam = $(if ($nm.ContainsKey($id)) { $nm[$id] } else { 'App ' + $id.Substring(0, 8) })
      $ec = Hex $j.ErrorCode
      if ($rx -and $nam -notmatch $rx -and $ec -notmatch $rx) { continue }
      $wa.Add([pscustomobject]@{ n = $nam; st = [int]$j.EnforcementState; c = $ec })
    }
  }
  $waF = @($wa | Where-Object { $_.st -ge 5000 -and $_.st -lt 6000 })
  $waA = @($wa | Where-Object { $_.st -ge 3000 -and $_.st -lt 4000 })
  $waL = @($wa | Where-Object { $_.st -ge 2000 -and $_.st -lt 3000 })
  Zeile ('Intune-Apps aus dem Unternehmensportal (Win32): ' + $wa.Count + ' ausgewertet · Fehler: ' + $waF.Count + ' · Anforderungen nicht erfüllt: ' + $waA.Count + ' · laufen/warten: ' + $waL.Count)
  foreach ($x in @(@($waF) + @($waA) + @($waL) | Select-Object -First 10)) { Zeile ('  ' + $x.n + ' · ' + (IntSt $x.st) + ' (' + $x.st + ')' + $(if ($x.c -ne '0x00000000') { ' · ' + $x.c + (Klar $x.c) } else { '' })) }
} else { Zeile 'Intune-Apps (Win32): keine Einträge — über die Intune-Verwaltungserweiterung wurde auf diesem PC noch keine App installiert.' }
$il = 'C:\ProgramData\Microsoft\IntuneManagementExtension\Logs'
if (Test-Path -LiteralPath $il) {
  $ie = New-Object System.Collections.Generic.List[string]
  foreach ($lf in @(Get-ChildItem -LiteralPath $il -Filter '*.log' -EA SilentlyContinue | Where-Object { $_.Name -match '^(IntuneManagementExtension|AppWorkload)' } | Sort-Object LastWriteTime -Descending | Select-Object -First 2)) {
    foreach ($l in @(Get-Content -LiteralPath $lf.FullName -Tail 4000 -EA SilentlyContinue)) {
      $t = ($l -replace '^<!\[LOG\[', '' -replace '\]LOG\]!>.*$', '').Trim()
      $cm = [regex]::Match($t, '(?i)(lpExitCode|exi[t] ?code|error ?code)\D{0,4}?(0x[0-9a-f]{8}|-?\d{3,10})')
      if ($cm.Success -and $cm.Groups[2].Value -notin '0', '0x00000000' -and (-not $rx -or $t -match $rx)) { $ie.Add($t.Substring(0, [math]::Min(150, $t.Length)) + (Klar $cm.Groups[2].Value)) }
    }
  }
  Zeile ('Intune-Verwaltungserweiterung (IME-Log): ' + $ie.Count + ' Einträge mit Fehler-/Exitcode')
  foreach ($z in @($ie | Select-Object -Unique | Select-Object -Last 6)) { Zeile ('  ' + $z) }
}` }),

  A({ id: 'leist4-speicher-systembereiche', titel: 'Versteckte Speicherfresser: Ruhezustand, Auslagerung, Wiederherstellungspunkte, Caches, Papierkörbe, Profile', modus: 'profil', risiko: 'lesen', timeoutMs: 420000,
    beschreibung: 'Zeigt, was auf C: belegt ist und im Explorer meist nicht auffällt: Ruhezustands-, Auslagerungs- und Swapdatei, Speicherabbilder, Wiederherstellungspunkte (Schattenkopie-Speicher), reservierter Speicher, Windows.old, Installer-Cache, Intune-Installationscache (IMECache), Update-Downloads, Übermittlungsoptimierung, Fehlerberichte, Papierkörbe aller Benutzer, die Größe aller Benutzerprofile (mit letzter Nutzung) und die größten Dateien im Profil des angemeldeten Benutzers. Nur online gehaltene OneDrive-Dateien zählen nicht. Ändert nichts.',
    ps: String.raw`
$c = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
Zeile ('Laufwerk C: ' + (Groesse $c.FreeSpace) + ' frei von ' + (Groesse $c.Size) + ' · belegt ' + (Groesse ([double]$c.Size - [double]$c.FreeSpace)))
$cs = Get-CimInstance Win32_ComputerSystem
$pw = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' -EA SilentlyContinue
$he = $pw.HibernateEnabled; if ($null -eq $he) { $he = $pw.HibernateEnabledDefault }
Zeile ('Arbeitsspeicher ' + (Groesse ([double]$cs.TotalPhysicalMemory)) + ' · Ruhezustand ' + $(if ($he -eq 1) { 'an' } else { 'aus' }) + ' · Auslagerungsdatei von Windows verwaltet: ' + (Ja ([bool]$cs.AutomaticManagedPagefile)))
foreach ($pf in @(Get-CimInstance Win32_PageFileUsage -EA SilentlyContinue)) { Zeile ('Auslagerungsdatei ' + $pf.Name + ': ' + $pf.AllocatedBaseSize + ' MB zugeteilt · genutzt ' + $pf.CurrentUsage + ' MB · Spitze ' + $pf.PeakUsage + ' MB') }
$sys = New-Object System.Collections.Generic.List[object]
$dat = @{ 'hiberfil.sys' = 'Ruhezustandsdatei hiberfil.sys'; 'pagefile.sys' = 'Auslagerungsdatei pagefile.sys'; 'swapfile.sys' = 'Swapdatei swapfile.sys' }
foreach ($i in @(Get-ChildItem -LiteralPath 'C:\' -Force -File -EA SilentlyContinue | Where-Object { $dat.ContainsKey($_.Name.ToLower()) })) { $sys.Add([pscustomobject]@{ n = $dat[$i.Name.ToLower()]; g = [double]$i.Length }) }
foreach ($i in @(Get-ChildItem -LiteralPath 'C:\Windows' -Force -File -Filter 'MEMORY.DMP' -EA SilentlyContinue)) { $sys.Add([pscustomobject]@{ n = 'Speicherabbild MEMORY.DMP vom ' + $i.LastWriteTime.ToString('dd.MM.yyyy'); g = [double]$i.Length }) }
$ord = [ordered]@{
  'C:\Windows.old' = 'Windows.old (vorherige Windows-Version)'; 'C:\$WINDOWS.~BT' = 'Setup-Reste $WINDOWS.~BT'; 'C:\Windows\Installer' = 'Installer-Cache C:\Windows\Installer (nie von Hand löschen)'
  'C:\Windows\IMECache' = 'Intune-Installationscache C:\Windows\IMECache'; 'C:\Windows\SoftwareDistribution\Download' = 'Update-Downloads'
  'C:\Windows\ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Cache' = 'Übermittlungsoptimierung'; 'C:\Windows\Minidump' = 'Minidumps'
  'C:\Windows\LiveKernelReports' = 'LiveKernelReports'; 'C:\ProgramData\Microsoft\Windows\WER' = 'Fehlerberichte (WER)'; 'C:\Windows\Logs' = 'Windows-Protokolle'; 'C:\Windows\Temp' = 'Windows-Temp'
  'C:\ProgramData\Package Cache' = 'Package Cache (Setup-Quellen)'; 'C:\Windows\System32\DriverStore\FileRepository' = 'Treiberspeicher'; 'C:\Temp' = 'C:\Temp'; 'C:\Install' = 'C:\Install'
}
foreach ($k in $ord.Keys) { if (Test-Path -LiteralPath $k -EA SilentlyContinue) { $sys.Add([pscustomobject]@{ n = $ord[$k]; g = [double](OrdnerGroesse $k) }) } }
$rb = 0.0; $rbz = @()
foreach ($s in @(Get-ChildItem -LiteralPath 'C:\$Recycle.Bin' -Directory -Force -EA SilentlyContinue)) {
  $g = [double](OrdnerGroesse $s.FullName); $rb += $g
  if ($g -ge 100MB) { $wer = $s.Name; try { $wer = (New-Object System.Security.Principal.SecurityIdentifier($s.Name)).Translate([System.Security.Principal.NTAccount]).Value } catch {}; $rbz += ($wer + ' ' + (Groesse $g)) }
}
if ($rb -gt 0) { $sys.Add([pscustomobject]@{ n = 'Papierkörbe aller Benutzer' + $(if ($rbz.Count) { ' (' + ($rbz -join ', ') + ')' } else { '' }); g = $rb }) }
foreach ($s in @(Get-CimInstance Win32_ShadowStorage -EA SilentlyContinue)) { $mx = [double]$s.MaxSpace; $sys.Add([pscustomobject]@{ n = 'Wiederherstellungspunkte/Schattenkopien (Grenze ' + $(if ($mx -gt 1e15) { 'unbegrenzt' } else { Groesse $mx }) + ')'; g = [double]$s.UsedSpace }) }
Zeile 'Systembereiche ab 50 MB (größte zuerst):'
foreach ($x in @($sys | Where-Object { $_.g -ge 50MB } | Sort-Object g -Descending)) { Zeile ('  ' + (Groesse $x.g) + '  ' + $x.n) }
$rp = @(Get-CimInstance -Namespace root\default -ClassName SystemRestore -EA SilentlyContinue)
if ($rp.Count) { $neu = ''; try { $neu = ([Management.ManagementDateTimeConverter]::ToDateTime([string]($rp | Select-Object -Last 1).CreationTime)).ToString('dd.MM.yyyy') } catch {}; Zeile ('Wiederherstellungspunkte: ' + $rp.Count + $(if ($neu) { ' · neuester vom ' + $neu } else { '' })) }
try { $rs = Get-WindowsReservedStorageState -EA Stop; Zeile ('Reservierter Speicher für Updates: ' + $rs.ReservedStorageState) } catch {}
$uhr = [Diagnostics.Stopwatch]::StartNew(); $budget = 90
$ich = $(if ($uProf) { ([string]$uProf).TrimEnd('\') } else { '' })
$pz = New-Object System.Collections.Generic.List[object]; $gross = New-Object System.Collections.Generic.List[object]; $offen = @()
foreach ($pd in @(Get-ChildItem -LiteralPath 'C:\Users' -Directory -Force -EA SilentlyContinue | Where-Object { $_.Name -notin 'Public', 'Default', 'Default User', 'All Users' })) {
  if ($uhr.Elapsed.TotalSeconds -gt $budget) { $offen += $pd.Name; continue }
  $meins = [bool]($ich -and ($pd.FullName -ieq $ich))
  $sum = 0.0; $teil = $false
  $stapel = New-Object System.Collections.Generic.Stack[System.IO.DirectoryInfo]
  $stapel.Push((New-Object System.IO.DirectoryInfo($pd.FullName)))
  while ($stapel.Count -gt 0) {
    if ($uhr.Elapsed.TotalSeconds -gt $budget) { $teil = $true; break }
    $dir = $stapel.Pop(); $inh = $null
    try { $inh = $dir.GetFileSystemInfos() } catch { continue }
    foreach ($x in $inh) {
      if ($x -is [System.IO.DirectoryInfo]) { $stapel.Push($x); continue }
      if ((([int64]$x.Attributes) -band 4198400) -ne 0) { continue }
      $sum += [double]$x.Length
      if ($meins -and $x.Length -ge 200MB) { $gross.Add([pscustomobject]@{ n = $x.FullName.Substring($ich.Length + 1); g = [double]$x.Length; d = $x.LastWriteTime }) }
    }
  }
  $nu = Get-Item -LiteralPath (Join-Path $pd.FullName 'NTUSER.DAT') -Force -EA SilentlyContinue
  $pz.Add([pscustomobject]@{ n = $pd.Name + $(if ($meins) { ' (angemeldet)' } else { '' }) + $(if ($teil) { ' (nur teilweise gezählt)' } else { '' }); g = $sum; d = $(if ($nu) { $nu.LastWriteTime } else { $pd.LastWriteTime }) })
}
Zeile ('Benutzerprofile auf C: (' + ($pz.Count + $offen.Count) + '):')
foreach ($x in @($pz | Sort-Object g -Descending | Select-Object -First 15)) { Zeile ('  ' + (Groesse $x.g) + '  ' + $x.n + ' · zuletzt benutzt ' + $x.d.ToString('dd.MM.yyyy')) }
if ($offen.Count) { Zeile ('  Nicht gezählt (Zeitlimit): ' + ($offen -join ', ')) }
if ($ich) {
  Zeile ('Größte Dateien im Profil des angemeldeten Benutzers (ab 200 MB): ' + $gross.Count)
  foreach ($x in @($gross | Sort-Object g -Descending | Select-Object -First 15)) { Zeile ('  ' + (Groesse $x.g) + '  ' + $x.n + ' · ' + $x.d.ToString('dd.MM.yyyy')) }
} else { Zeile 'Kein Benutzer angemeldet — große Dateien werden nur für den angemeldeten Benutzer aufgelistet.' }` }),

  A({ id: 'leist4-systemdateien', titel: 'Ruhezustands-, Auslagerungs- und Absturzabbild-Einstellung setzen (hiberfil.sys, pagefile.sys, MEMORY.DMP)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Zeigt vorher/nachher und setzt genau eine Einstellung: Ruhezustandsdatei auf „reduziert“ verkleinern (Schnellstart bleibt, ca. 70 % kleiner), Ruhezustand ganz abschalten (hiberfil.sys verschwindet, Schnellstart und „Ruhezustand“ entfallen) bzw. wieder einschalten; die Auslagerungsdatei wieder von Windows verwalten lassen (nach fester, zu kleiner oder abgeschalteter Auslagerungsdatei); das Speicherabbild bei Bluescreens auf „automatisch“ (Ursache bleibt analysierbar) oder „nur Minidump“ (spart Platz) stellen. Auslagerung und Speicherabbild wirken nach dem nächsten Neustart.',
    param: { label: 'Einstellung', platzhalter: 'Ruhezustandsdatei verkleinern', pflicht: true, optionen: SYSTEMDATEIEN },
    ps: String.raw`
$w = $P.Trim()
$opt = @('Ruhezustandsdatei verkleinern', 'Ruhezustand abschalten', 'Ruhezustand einschalten', 'Auslagerungsdatei automatisch', 'Speicherabbild automatisch', 'Speicherabbild nur Minidump')
if ($opt -notcontains $w) { throw ('Unbekannte Auswahl: ' + $w) }
$pk = 'HKLM:\SYSTEM\CurrentControlSet\Control\Power'
$ck = 'HKLM:\SYSTEM\CurrentControlSet\Control\CrashControl'
$mm = 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management'
function HibAn { $x = Get-ItemProperty $pk -EA SilentlyContinue; $v = $x.HibernateEnabled; if ($null -eq $v) { $v = $x.HibernateEnabledDefault }; return ($v -eq 1) }
function Hib { $i = @(Get-ChildItem -LiteralPath 'C:\' -Force -File -Filter 'hiberfil.sys' -EA SilentlyContinue) | Select-Object -First 1; return ($(if (HibAn) { 'Ruhezustand an' } else { 'Ruhezustand aus' }) + ' · hiberfil.sys ' + $(if ($i) { Groesse ([double]$i.Length) } else { 'nicht vorhanden' })) }
function Pf {
  $x = Get-CimInstance Win32_ComputerSystem
  $ps = @(Get-CimInstance Win32_PageFileSetting -EA SilentlyContinue | ForEach-Object { [string]$_.Name + ' ' + $(if ($_.InitialSize -or $_.MaximumSize) { '' + $_.InitialSize + '–' + $_.MaximumSize + ' MB' } else { 'systemverwaltet' }) })
  $pu = @(Get-CimInstance Win32_PageFileUsage -EA SilentlyContinue | ForEach-Object { [string]$_.Name + ' ' + $_.AllocatedBaseSize + ' MB' })
  return ('automatisch verwaltet: ' + (Ja ([bool]$x.AutomaticManagedPagefile)) + $(if ($ps.Count) { ' · Einstellung: ' + ($ps -join ', ') } else { '' }) + ' · aktuell: ' + $(if ($pu.Count) { $pu -join ', ' } else { 'KEINE Auslagerungsdatei' }))
}
function Cd { $v = (Get-ItemProperty $ck -Name CrashDumpEnabled -EA SilentlyContinue).CrashDumpEnabled; if ($null -eq $v) { return 'nicht gesetzt' }; $t = @{ 0 = 'keines'; 1 = 'vollständig'; 2 = 'Kernel'; 3 = 'klein (Minidump)'; 7 = 'automatisch' }[[int]$v]; return ('' + $v + ' = ' + $(if ($t) { $t } else { '?' })) }
$pc = Join-Path $env:SystemRoot 'System32\powercfg.exe'
if ($w -like 'Ruhezustand*') {
  Zeile ('Vorher: ' + (Hib))
  if ($w -eq 'Ruhezustandsdatei verkleinern') {
    if (-not (HibAn)) { Zeile 'Der Ruhezustand ist aus — es gibt keine hiberfil.sys zum Verkleinern. Nichts geändert.' }
    else { $o = @(& $pc /hibernate /type reduced 2>&1); Zeile ('powercfg /hibernate /type reduced: Code ' + $LASTEXITCODE + $(if ($o.Count) { ' · ' + (($o | ForEach-Object { [string]$_ }) -join ' ') } else { '' })); Zeile 'Schnellstart bleibt; der Menüpunkt „Ruhezustand“ und „Ruhezustand nach Standby“ entfallen.' }
  } elseif ($w -eq 'Ruhezustand abschalten') {
    $o = @(& $pc /hibernate off 2>&1); Zeile ('powercfg /hibernate off: Code ' + $LASTEXITCODE + $(if ($o.Count) { ' · ' + (($o | ForEach-Object { [string]$_ }) -join ' ') } else { '' }))
    Zeile 'Damit entfallen auch Schnellstart und der Menüpunkt „Ruhezustand“; bei leerem Akku fährt der Laptop herunter statt in den Ruhezustand zu gehen.'
  } else {
    $o = @(& $pc /hibernate on 2>&1) + @(& $pc /hibernate /type full 2>&1); Zeile ('powercfg /hibernate on + /type full: Code ' + $LASTEXITCODE + $(if ($o.Count) { ' · ' + (($o | ForEach-Object { [string]$_ }) -join ' ') } else { '' }))
  }
  Zeile ('Nachher: ' + (Hib))
} elseif ($w -eq 'Auslagerungsdatei automatisch') {
  Zeile ('Vorher: ' + (Pf))
  $x = Get-CimInstance Win32_ComputerSystem
  if ($x.AutomaticManagedPagefile) { Zeile 'Die Auslagerungsdatei wird bereits von Windows verwaltet — nichts geändert.' }
  else {
    $alt = @((Get-ItemProperty $mm -Name PagingFiles -EA SilentlyContinue).PagingFiles)
    try { Set-CimInstance -InputObject $x -Property @{ AutomaticManagedPagefile = $true } -EA Stop } catch { Set-ItemProperty -Path $mm -Name PagingFiles -Value @('?:\pagefile.sys') -Type MultiString -EA Stop }
    Zeile ('PagingFiles: ' + $(if ($alt.Count -and ($alt -join '')) { $alt -join ' | ' } else { '(leer = keine Auslagerungsdatei)' }) + ' → ' + (@((Get-ItemProperty $mm -Name PagingFiles -EA SilentlyContinue).PagingFiles) -join ' | '))
    Zeile ('Nachher: ' + (Pf))
    Zeile 'Wirkt nach dem nächsten Neustart.'
  }
} else {
  $alt = Cd
  if (-not (Test-Path $ck)) { New-Item -Path $ck -Force | Out-Null }
  $neu = $(if ($w -eq 'Speicherabbild automatisch') { 7 } else { 3 })
  Set-ItemProperty -Path $ck -Name CrashDumpEnabled -Value $neu -Type DWord
  Zeile ('Speicherabbild bei Bluescreen: ' + $alt + ' → ' + (Cd))
  if ($neu -eq 7) {
    $pu = @(Get-CimInstance Win32_PageFileUsage -EA SilentlyContinue | Where-Object { [string]$_.Name -like 'C:*' })
    if (-not $pu.Count) { Zeile 'ACHTUNG: Auf C: gibt es keine Auslagerungsdatei — ohne sie schreibt Windows kein Abbild. Zusätzlich „Auslagerungsdatei automatisch“ wählen.' }
    Zeile 'Nach dem nächsten Bluescreen liegt das Abbild unter C:\Windows\MEMORY.DMP bzw. C:\Windows\Minidump.'
  } else { Zeile 'Künftig nur noch kleine Abbilder unter C:\Windows\Minidump — vorhandene MEMORY.DMP bleibt, bis sie bereinigt wird.' }
  Zeile 'Wirkt nach dem nächsten Neustart.'
}` }),

  A({ id: 'leist4-imecache-leeren', titel: 'Intune-Installationscache (C:\\Windows\\IMECache) aufräumen', modus: 'system', risiko: 'aendern', timeoutMs: 300000,
    beschreibung: 'Entfernt in C:\\Windows\\IMECache nur alte Reste früherer Intune-Installationen: Unterordner, in denen seit mindestens 7 Tagen nichts mehr geändert wurde und die nicht gesperrt sind. Läuft gerade eine Installation (msiexec, Setup aus dem IMECache, Intune-Skript), wird nichts gelöscht. Die Intune-Verwaltungserweiterung lädt benötigte Inhalte bei der nächsten Installation selbst neu herunter. Zeigt Ordnergröße vorher/nachher. Hilft bei C: voll durch IMECache-Reste und bei beschädigten Downloads (0x80091007 „Hashwert ist nicht korrekt“, 0x87D300C9).',
    ps: String.raw`
$ort = 'C:\Windows\IMECache'
if (-not (Test-Path -LiteralPath $ort)) { Zeile 'C:\Windows\IMECache ist nicht vorhanden — über Intune wurden hier noch keine Win32-Apps installiert, es gibt nichts aufzuräumen.'; return }
$lauf = @(Get-CimInstance Win32_Process -EA SilentlyContinue | Where-Object { ($_.Name -match '^(msiexec|setup|install|AgentExecutor)' -and [string]$_.CommandLine -notmatch '/V$') -or [string]$_.ExecutablePath -match '(?i)\\IMECache\\' -or [string]$_.CommandLine -match '(?i)\\IMECache\\' })
if ($lauf.Count) { Zeile ('Gerade läuft eine Installation (' + ((@($lauf | ForEach-Object { [string]$_.Name } | Select-Object -Unique)) -join ', ') + ') — es wurde nichts gelöscht. Bitte nach Abschluss der Installation erneut ausführen.'); return }
$vor = [double](OrdnerGroesse $ort)
$grenze = (Get-Date).AddDays(-7)
$alle = @(Get-ChildItem -LiteralPath $ort -Directory -Force -EA SilentlyContinue)
$weg = 0; $frei = 0.0; $jung = 0; $gesperrt = 0
foreach ($d in $alle) {
  $neuste = Get-ChildItem -LiteralPath $d.FullName -Recurse -Force -EA SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($d.LastWriteTime -ge $grenze -or ($neuste -and $neuste.LastWriteTime -ge $grenze)) { $jung++; continue }
  $gr = [double](OrdnerGroesse $d.FullName)
  $ziel = $d.Name + '.alt-' + (Get-Date -Format 'yyyyMMddHHmmss')
  # Umbenennen klappt nur, wenn keine Datei darin geöffnet ist — sonst gilt der Ordner als gesperrt und bleibt.
  try { Rename-Item -LiteralPath $d.FullName -NewName $ziel -EA Stop } catch { $gesperrt++; continue }
  try { Remove-Item -LiteralPath (Join-Path $ort $ziel) -Recurse -Force -EA Stop; $weg++; $frei += $gr } catch { $gesperrt++; Zeile ('Nicht vollständig entfernt: ' + $d.Name + ' (' + $_.Exception.Message + ')') }
}
Zeile ('IMECache: ' + $alle.Count + ' Unterordner · entfernt: ' + $weg + ' (' + (Groesse $frei) + ') · jünger als 7 Tage: ' + $jung + ' · gesperrt/übersprungen: ' + $gesperrt)
Zeile ('Ordner ' + $ort + ': ' + (Groesse $vor) + ' → ' + (Groesse ([double](OrdnerGroesse $ort))))
Zeile ('Freier Platz auf C: jetzt ' + (Groesse ([double](Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'").FreeSpace)) + ' — benötigte Inhalte lädt die Intune-Verwaltungserweiterung bei der nächsten Installation neu.')` }),

  A({ id: 'leist4-speicheroptimierung', titel: 'Speicheroptimierung (Storage Sense) des Benutzers einstellen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Stellt für den angemeldeten Benutzer die Windows-Speicheroptimierung ein (Einstellungen → System → Speicher): einschalten mit wöchentlichem Lauf, temporären Dateien und Papierkorb-Inhalten älter als 30 Tage — wahlweise zusätzlich Downloads älter als 60 Tage —, nur das automatische Leeren des Downloads-Ordners abschalten oder die Speicheroptimierung ganz ausschalten. OneDrive-Einstellungen bleiben unberührt. Zeigt alte und neue Werte; eine Richtlinie hat Vorrang und wird gemeldet.',
    param: { label: 'Einstellung', platzhalter: 'Einschalten (Temp + Papierkorb nach 30 Tagen)', pflicht: true, optionen: SPEICHEROPT },
    ps: String.raw`
NeedHive
$w = $P.Trim()
$opt = @('Einschalten (Temp + Papierkorb nach 30 Tagen)', 'Einschalten + Downloads nach 60 Tagen', 'Downloads nie automatisch entfernen', 'Ausschalten')
if ($opt -notcontains $w) { throw ('Unbekannte Auswahl: ' + $w) }
$pol = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\StorageSense' -EA SilentlyContinue
if ($pol) { $pz = @($pol.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { $_.Name + '=' + $_.Value }); if ($pz.Count) { Zeile ('Richtlinie für die Speicheroptimierung (hat Vorrang): ' + ($pz -join ', ')) } }
$k = $uHive + '\Software\Microsoft\Windows\CurrentVersion\StorageSense\Parameters\StoragePolicy'
$nm = @{ '01' = 'Speicheroptimierung an'; '2048' = 'Ausführen alle … Tage (0 = bei wenig Speicher)'; '04' = 'Temporäre Dateien entfernen'; '08' = 'Papierkorb leeren'; '256' = 'Papierkorb: Dateien älter als … Tage'; '32' = 'Downloads leeren'; '512' = 'Downloads: Dateien älter als … Tage' }
$soll = [ordered]@{}
if ($w -like 'Einschalten*') { $soll['01'] = 1; $soll['2048'] = 7; $soll['04'] = 1; $soll['08'] = 1; $soll['256'] = 30 }
if ($w -eq 'Einschalten + Downloads nach 60 Tagen') { $soll['32'] = 1; $soll['512'] = 60 }
elseif ($w -like 'Einschalten*' -or $w -like 'Downloads nie*') { $soll['32'] = 0; $soll['512'] = 0 }
if ($w -eq 'Ausschalten') { $soll['01'] = 0 }
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
$alt = Get-ItemProperty -Path $k -EA SilentlyContinue
foreach ($n in $soll.Keys) {
  $a = $(if ($alt) { $alt.$n } else { $null })
  Set-ItemProperty -Path $k -Name $n -Value ([int]$soll[$n]) -Type DWord
  Zeile ($nm[$n] + ': ' + $(if ($null -eq $a) { 'nicht gesetzt' } else { '' + $a }) + ' → ' + $soll[$n])
}
Zeile ('Benutzer ' + $uDomUser + ': wirkt beim nächsten Lauf der Speicheroptimierung (Einstellungen → System → Speicher → Speicheroptimierung).')` }),
]
