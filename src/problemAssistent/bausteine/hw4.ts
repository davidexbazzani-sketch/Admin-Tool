// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „hw“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Geräte-Manager-Fehlerbilder (Code 10/19/31/39/43/45 …), COM-Ports serieller Geräte, Kühlung und defekte
// Eingabegeräte. BIOS, Firmware, Datenträger/Partitionen und Treiberpakete werden nie verändert;
// Drucker/Netzwerk/Grafik/Datenträger sind von „Gerät entfernen/abschalten“ ausgenommen.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Erlaubte Geräteklassen für „hw4-klassenfilter-reparieren“ (Klassen-GUID | Pflichtfilter). */
const KLASSEN_FILTER = ['Tastatur', 'Maus', 'USB', 'DVD/CD', 'Smartcard-Leser', 'Anschlüsse (COM)', 'Bluetooth', 'Biometrie', 'HID (Eingabegeräte)']
/** Einstellungen für „hw4-kuehlung“. */
const KUEHLUNG = ['Leise (Turbo aus, passive Kühlung)', 'Nur passive Kühlung', 'Standard (Turbo an, aktive Kühlung)']

export const AKTIONEN_HW4: PaAktion[] = [
  A({ id: 'hw4-geraet-details', titel: 'Geräte-Details: Fehlercode im Klartext, Treiber, Filter, Anschluss, Verlauf', modus: 'system', risiko: 'lesen',
    beschreibung: 'Zeigt für ein Gerät (Teil des Namens) bzw. – leer – für alle Geräte mit Fehler: Status und Fehlercode des Geräte-Managers im Klartext (Code 10, 19, 28, 31, 39, 43, 45, 48 …), Hardware-ID (VID/PID), Treiber mit Version und Datum, woran es hängt (Hub/Dock), Filtertreiber (verwaiste werden markiert), ob Windows es zum Energiesparen abschalten darf, den COM-Port, bei Datenträgern SMART-Vorhersage und Fehlerzähler, nicht angeschlossene „Geister“-Einträge und die Plug-and-Play-Ereignisse der letzten 7 Tage. Ändert nichts.',
    param: { label: 'Gerätename (Teil, optional – leer = alle Geräte mit Fehler)', platzhalter: 'z. B. USB Serial, Scanner, Touch, Fingerprint', vorlagen: ['USB', 'COM', 'Scanner', 'Smartcard', 'Touch', 'Fingerprint', 'Bluetooth', 'Tastatur', 'Hub'] },
    ps: String.raw`
$cm = @{ 1 = 'nicht richtig konfiguriert'; 3 = 'Treiber beschädigt oder zu wenig Arbeitsspeicher'; 10 = 'Gerät kann nicht gestartet werden'; 12 = 'nicht genügend freie Ressourcen'; 14 = 'funktioniert erst nach einem Neustart'; 18 = 'Treiber muss neu installiert werden'; 19 = 'Registrierungsdaten beschädigt (oft verwaister Filtertreiber)'; 21 = 'wird gerade entfernt'; 22 = 'deaktiviert'; 24 = 'nicht vorhanden oder nicht richtig erkannt'; 28 = 'kein Treiber installiert'; 29 = 'von der Firmware (BIOS) abgeschaltet'; 31 = 'Treiber kann nicht geladen werden'; 32 = 'Treiberdienst ist deaktiviert'; 37 = 'Treiber-Initialisierung fehlgeschlagen'; 38 = 'alte Treiberinstanz noch geladen (Neustart nötig)'; 39 = 'Treiber beschädigt oder fehlt (oft verwaister Filtertreiber)'; 41 = 'Treiber geladen, Hardware nicht gefunden'; 42 = 'doppeltes Gerät'; 43 = 'Gerät hat einen Fehler gemeldet (meist Hardware, Kabel oder USB-Anschluss)'; 45 = 'nicht angeschlossen'; 47 = 'zum sicheren Entfernen vorbereitet'; 48 = 'Treiber blockiert (bekannte Probleme / Speicherintegrität)'; 49 = 'Registrierung zu groß'; 52 = 'Treibersignatur ungültig'; 54 = 'Fehler, Gerät wird zurückgesetzt' }
$f = $P.Trim()
if ($f -and $f.Length -lt 2) { throw 'Bitte mindestens 2 Zeichen des Gerätenamens angeben (oder leer lassen).' }
$da = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue)
$hier = @{}; foreach ($x in $da) { $hier[[string]$x.InstanceId] = $true }
$geist = @()
if ($f) {
  $treffer = @(Get-PnpDevice -EA SilentlyContinue | Where-Object { [string]$_.FriendlyName -like ('*' + $f + '*') -or [string]$_.InstanceId -like ('*' + $f + '*') })
  $d = @($treffer | Where-Object { $hier.ContainsKey([string]$_.InstanceId) })
  $geist = @($treffer | Where-Object { -not $hier.ContainsKey([string]$_.InstanceId) })
} else {
  $d = @($da | Where-Object { [string]$_.Status -in 'Error', 'Degraded', 'Unknown' -and [string]$_.Class -ne 'SoftwareComponent' })
}
if (-not $d.Count) { Zeile $(if ($f) { 'Kein angeschlossenes Gerät zu „' + $f + '“ gefunden.' } else { 'Kein angeschlossenes Gerät mit Fehler — der Geräte-Manager ist sauber.' }) }
if ($d.Count -gt 8) { Zeile ('' + $d.Count + ' Treffer — die ersten 8 im Detail (bitte genauer angeben):') }
$pw = @(Get-CimInstance -Namespace root\wmi -ClassName MSPower_DeviceEnable -EA SilentlyContinue)
foreach ($x in @($d | Select-Object -First 8)) {
  $id = [string]$x.InstanceId
  $c = [int]$x.ConfigManagerErrorCode
  Zeile ('■ ' + $x.FriendlyName + ' · Klasse ' + $x.Class + ' · ' + $x.Status + $(if ($c) { ' · Code ' + $c + ' = ' + $(if ($cm.ContainsKey($c)) { $cm[$c] } else { 'siehe Geräte-Manager' }) } else { '' }))
  $hw = @($x.HardwareID | Where-Object { $_ }) | Select-Object -First 1
  if ($hw) { Zeile ('  Hardware-ID: ' + $hw) }
  $pr = @{}
  try { foreach ($e in @(Get-PnpDeviceProperty -InstanceId $id -KeyName 'DEVPKEY_Device_DriverProvider', 'DEVPKEY_Device_DriverVersion', 'DEVPKEY_Device_DriverDate', 'DEVPKEY_Device_DriverInfPath', 'DEVPKEY_Device_Parent', 'DEVPKEY_Device_ProblemStatus' -EA Stop)) { $pr[[string]$e.KeyName] = $e.Data } } catch {}
  $tv = [string]$pr['DEVPKEY_Device_DriverVersion']
  if ($tv) {
    $td = ''; try { if ($pr['DEVPKEY_Device_DriverDate']) { $td = ' vom ' + ([datetime]$pr['DEVPKEY_Device_DriverDate']).ToString('dd.MM.yyyy') } } catch {}
    Zeile ('  Treiber: ' + $pr['DEVPKEY_Device_DriverProvider'] + ' ' + $tv + $td + ' · ' + $pr['DEVPKEY_Device_DriverInfPath'])
  } else { Zeile '  Treiber: keiner installiert' }
  if ($pr['DEVPKEY_Device_ProblemStatus']) { try { Zeile ('  Problemstatus: 0x' + ('{0:X8}' -f ([int64]$pr['DEVPKEY_Device_ProblemStatus'] -band [int64]4294967295))) } catch {} }
  $par = [string]$pr['DEVPKEY_Device_Parent']
  if ($par) { $pn = [string](@($da | Where-Object { [string]$_.InstanceId -eq $par }) | Select-Object -First 1).FriendlyName; Zeile ('  Hängt an: ' + $(if ($pn) { $pn } else { $par })) }
  $ek = 'HKLM:\SYSTEM\CurrentControlSet\Enum\' + $id
  $flt = @()
  $gp = Get-ItemProperty -LiteralPath $ek -EA SilentlyContinue
  if ($gp) { $flt += @(@($gp.UpperFilters) + @($gp.LowerFilters) | Where-Object { $_ }) }
  $cg = [string]$x.ClassGuid
  if ($cg) { $kp = Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Control\Class\' + $cg) -EA SilentlyContinue; if ($kp) { $flt += @(@($kp.UpperFilters) + @($kp.LowerFilters) | Where-Object { $_ }) } }
  if ($flt.Count) {
    $fz = @(); foreach ($n in @($flt | Select-Object -Unique)) { $fz += ([string]$n + $(if (Test-Path -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Services\' + $n)) { '' } else { ' (FEHLT → verwaister Filter, Ursache für Code 19/39)' })) }
    Zeile ('  Filtertreiber: ' + ($fz -join ', '))
  }
  $pe = @($pw | Where-Object { [string]$_.InstanceName -like ($id + '*') }) | Select-Object -First 1
  if ($pe) { Zeile ('  Windows darf das Gerät zum Energiesparen abschalten: ' + (Ja ([bool]$pe.Enable))) }
  $cp = [string](Get-ItemProperty -LiteralPath ($ek + '\Device Parameters') -Name PortName -EA SilentlyContinue).PortName
  if ($cp) { Zeile ('  Anschluss: ' + $cp) }
  if ([string]$x.Class -eq 'DiskDrive') {
    $sm = @(Get-CimInstance -Namespace root\wmi -ClassName MSStorageDriver_FailurePredictStatus -EA SilentlyContinue | Where-Object { [string]$_.InstanceName -like ($id + '*') }) | Select-Object -First 1
    if ($sm) { Zeile ('  SMART-Vorhersage: ' + $(if ($sm.PredictFailure) { 'AUSFALL DROHT (Grund ' + $sm.Reason + ') — sofort sichern, Tausch' } else { 'kein Ausfall vorhergesagt' })) }
    $pd = @(Get-PhysicalDisk -EA SilentlyContinue | Where-Object { [string]$_.FriendlyName -eq [string]$x.FriendlyName }) | Select-Object -First 1
    if ($pd) { Zeile ('  Zustand laut Windows: ' + $pd.HealthStatus + ' · ' + (@($pd.OperationalStatus) -join ', ') + ' · ' + $pd.MediaType + ' · Bus ' + $pd.BusType) }
    if ($pd) { $r = $pd | Get-StorageReliabilityCounter -EA SilentlyContinue; if ($r) { Zeile ('  Betriebsstunden ' + $r.PowerOnHours + ' · Verschleiß ' + $r.Wear + ' % · ' + $r.Temperature + ' °C (max. ' + $r.TemperatureMax + ') · unkorrigierte Lese-/Schreibfehler ' + $r.ReadErrorsUncorrected + '/' + $r.WriteErrorsUncorrected) } }
  }
}
if ($geist.Count) {
  $gz = @()
  foreach ($g in @($geist | Select-Object -First 8)) { $q = [string](Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Enum\' + $g.InstanceId + '\Device Parameters') -Name PortName -EA SilentlyContinue).PortName; $gz += ([string]$g.FriendlyName + $(if ($q) { ' [' + $q + ']' } else { '' })) }
  Zeile ('Nicht angeschlossen (Code 45, „ausgeblendete Geräte“): ' + $geist.Count + ' · ' + ($gz -join '; '))
}
$ziel = @($d | Select-Object -First 8 | ForEach-Object { [string]$_.InstanceId })
$ev = @()
try { $ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Kernel-PnP/Configuration'; StartTime = (Get-Date).AddDays(-7); Id = 400, 410, 411, 420, 430 } -MaxEvents 5000 -EA Stop) } catch {}
$zahl = @{}; $prob = @()
foreach ($e in $ev) {
  $iid = [string]$e.Properties[0].Value
  $passt = $(if ($f) { ($ziel -contains $iid) -or ($iid -like ('*' + $f + '*')) } else { $e.Id -eq 411 })
  if (-not $passt) { continue }
  $zahl[[int]$e.Id] = 1 + [int]$zahl[[int]$e.Id]
  if ($e.Id -eq 411 -and $prob.Count -lt 4) { $prob += ($e.TimeCreated.ToString('dd.MM. HH:mm') + ' ' + $iid + ' · Problem ' + $e.Properties[6].Value + ' · Status ' + $e.Properties[7].Value) }
}
$nm = @{ 400 = 'eingerichtet'; 410 = 'gestartet'; 411 = 'Problem beim Start'; 420 = 'entfernt'; 430 = 'braucht weitere Installation' }
if ($zahl.Count) { Zeile ('Plug-and-Play 7 Tage' + $(if ($f) { ' („' + $f + '“)' } else { '' }) + ': ' + ((@($zahl.Keys | Sort-Object) | ForEach-Object { $nm[$_] + ' ' + $zahl[$_] + '×' }) -join ' · ')) } else { Zeile ('Plug-and-Play 7 Tage: keine passenden Ereignisse.') }
foreach ($z in $prob) { Zeile ('  Startproblem: ' + $z) }
try {
  foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-PnP'; Id = 219; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 30 -EA Stop | Where-Object { -not $f -or [string]$_.Properties[1].Value -like ('*' + $f + '*') -or ($ziel -contains [string]$_.Properties[1].Value) } | Select-Object -First 3)) { Zeile ('  Treiber nicht geladen: ' + $e.TimeCreated.ToString('dd.MM. HH:mm') + ' ' + $e.Properties[4].Value + ' für ' + $e.Properties[1].Value) }
} catch {}` }),

  A({ id: 'hw4-geraet-neu-erkennen', titel: 'Gerät deinstallieren und neu erkennen lassen (Treiber bleibt)', modus: 'system', risiko: 'kritisch',
    beschreibung: 'Wie im Geräte-Manager „Gerät deinstallieren“ (ohne das Treiberpaket zu löschen) und danach „Nach geänderter Hardware suchen“: Das Gerät wird frisch erkannt und neu eingerichtet — hilft bei Code 10, 18, 31, 43 und hängenden USB-, HID-, COM-, Smartcard- oder Fingerabdruck-Geräten. Netzwerk, Grafik, Drucker, interne Datenträger, USB-Controller/-Hubs und Systemgeräte sind ausgenommen. Das Gerät ist dabei einige Sekunden weg.',
    param: { label: 'Gerätename (Teil, wie im Geräte-Manager)', platzhalter: 'z. B. USB Serial Port, Smartcard Reader, Goodix', pflicht: true, vorlagen: ['USB Serial', 'Prolific', 'Smartcard', 'Fingerprint', 'HID-konforme', 'Massenspeicher', 'Wireless Bluetooth', 'Unbekanntes USB-Gerät'] },
    ps: String.raw`
$f = $P.Trim()
if ($f.Length -lt 3) { throw 'Bitte mindestens 3 Zeichen des Gerätenamens angeben (wie im Geräte-Manager).' }
$sperre = @('Net', 'NetService', 'NetTrans', 'NetClient', 'Display', 'System', 'Processor', 'Volume', 'VolumeSnapshot', 'SCSIAdapter', 'HDC', 'Computer', 'SecurityDevices', 'Firmware', 'Battery', 'SoftwareDevice', 'SoftwareComponent', 'Extension', 'Printer', 'PrintQueue', 'WSDPrintDevice', 'AudioEndpoint', 'MEDIA', 'Monitor')
$kand = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { [string]$_.FriendlyName -like ('*' + $f + '*') })
if (-not $kand.Count) { throw ('Kein angeschlossenes Gerät zu „' + $f + '“ — den Namen wie im Geräte-Manager angeben (siehe Geräte-Details).') }
$d = @($kand | Where-Object {
  $k = [string]$_.Class; $n = [string]$_.FriendlyName; $ok = $true
  if ($k -in $sperre) { $ok = $false }
  if ($k -eq 'USB' -and $n -match 'Host.?Controller|Hostcontroller|Root.?Hub|Stammhub|USB-Hub|USB Hub|SuperSpeed.*Hub|USB4|Router') { $ok = $false }
  if ($k -eq 'DiskDrive' -and [string]$_.InstanceId -notlike 'USBSTOR\*') { $ok = $false }
  if ($k -eq 'Bluetooth' -and $n -notmatch 'Adapter|Wireless Bluetooth|Radio|Funk') { $ok = $false }
  if ($n -match 'PS/2') { $ok = $false }
  $ok
})
if (-not $d.Count) { throw ('„' + $f + '“ trifft nur geschützte Geräte (' + ((@($kand | ForEach-Object { [string]$_.FriendlyName + ' [' + $_.Class + ']' }) | Select-Object -First 4) -join '; ') + ') — die werden nicht entfernt.') }
if ($d.Count -gt 3) { throw ('Zu viele Treffer (' + $d.Count + ') — bitte genauer angeben: ' + ((@($d | ForEach-Object { [string]$_.FriendlyName }) | Select-Object -First 6) -join '; ')) }
foreach ($x in $d) {
  $c = [int]$x.ConfigManagerErrorCode
  $o = @(& pnputil.exe /remove-device $x.InstanceId 2>&1)
  $rc = $LASTEXITCODE
  Zeile ('' + $x.FriendlyName + ' [' + $x.Class + $(if ($c) { ', vorher Code ' + $c } else { '' }) + ']: ' + $(if ($rc -eq 0) { 'aus dem Geräte-Manager entfernt (Treiberpaket bleibt)' } elseif ($rc -eq 3010) { 'entfernt — Windows verlangt einen Neustart' } else { 'nicht entfernt (pnputil ' + $rc + ': ' + [string]($o | Select-Object -Last 1) + ')' }))
}
Start-Sleep -Seconds 2
& pnputil.exe /scan-devices 2>&1 | Out-Null
Start-Sleep -Seconds 5
$jetzt = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue)
foreach ($x in $d) {
  $n = @($jetzt | Where-Object { [string]$_.InstanceId -eq [string]$x.InstanceId -or [string]$_.FriendlyName -eq [string]$x.FriendlyName }) | Select-Object -First 1
  if ($n) { $c2 = [int]$n.ConfigManagerErrorCode; Zeile ('Wieder erkannt: ' + $n.FriendlyName + ' · ' + $n.Status + $(if ($c2) { ' · Code ' + $c2 + ' — Fehler besteht weiter (Treiber über „Treiber-Installation (HP)“ erneuern bzw. Hardware/Kabel prüfen)' } else { ' · ohne Fehler' })) }
  else { Zeile ('' + $x.FriendlyName + ': noch nicht wieder da — Gerät ab- und wieder anstecken bzw. PC neu starten.') }
}` }),

  A({ id: 'hw4-klassenfilter-reparieren', titel: 'Verwaiste Filtertreiber einer Geräteklasse entfernen (Code 19/31/39)', modus: 'system', risiko: 'kritisch',
    beschreibung: 'Code 19, 31, 32 oder 39 nach dem Deinstallieren einer Software (Brennprogramm, Tastatur-/Maus-Tool, Fernwartung, Virtualisierung): Prüft die Upper-/LowerFilters der gewählten Geräteklasse und entfernt nur Einträge, deren Treiber/Dienst nicht mehr existiert. Fehlt bei Tastatur bzw. Maus der Windows-Pflichtfilter (kbdclass/mouclass), wird er ergänzt. Alte und neue Werte werden angezeigt; betroffene Geräte werden neu gestartet, oft ist zusätzlich ein Neustart nötig.',
    param: { label: 'Geräteklasse', platzhalter: 'Tastatur', pflicht: true, optionen: KLASSEN_FILTER },
    ps: String.raw`
$klassen = [ordered]@{ 'Tastatur' = '{4d36e96b-e325-11ce-bfc1-08002be10318}|kbdclass'; 'Maus' = '{4d36e96f-e325-11ce-bfc1-08002be10318}|mouclass'; 'USB' = '{36fc9e60-c465-11cf-8056-444553540000}|'; 'DVD/CD' = '{4d36e965-e325-11ce-bfc1-08002be10318}|'; 'Smartcard-Leser' = '{50dd5230-ba8a-11d1-bf5d-0000f805f530}|'; 'Anschlüsse (COM)' = '{4d36e978-e325-11ce-bfc1-08002be10318}|'; 'Bluetooth' = '{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}|'; 'Biometrie' = '{53d29ef7-377c-4d14-864b-eb3a85769359}|'; 'HID (Eingabegeräte)' = '{745a17a0-74d3-11d0-b6fe-00a0c90f57da}|' }
$w = $P.Trim()
$tr = @($klassen.Keys | Where-Object { $_ -eq $w })
if (-not $tr.Count) { throw ('Unbekannte Geräteklasse „' + $P + '“ — erlaubt: ' + (@($klassen.Keys) -join ', ')) }
$teile = ([string]$klassen[$tr[0]]) -split '\|', 2
$g = $teile[0]; $pflicht = $teile[1]
$k = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\' + $g
if (-not (Test-Path -LiteralPath $k)) { throw ('Die Geräteklasse ' + $tr[0] + ' gibt es auf diesem PC nicht.') }
$geaendert = $false
foreach ($wert in 'UpperFilters', 'LowerFilters') {
  $alt = @((Get-ItemProperty -LiteralPath $k -Name $wert -EA SilentlyContinue).$wert | Where-Object { $_ })
  $neu = New-Object System.Collections.Generic.List[string]
  $weg = @()
  foreach ($n in $alt) {
    $sk = 'HKLM:\SYSTEM\CurrentControlSet\Services\' + $n
    $vorhanden = Test-Path -LiteralPath $sk
    if ($vorhanden) {
      $ip = ([string](Get-ItemProperty -LiteralPath $sk -Name ImagePath -EA SilentlyContinue).ImagePath).Trim('"')
      if ($ip -match '^\\SystemRoot\\') { $ip = $env:SystemRoot + $ip.Substring(11) }
      elseif ($ip -match '^\\\?\?\\') { $ip = $ip.Substring(4) }
      elseif ($ip -match '^system32\\') { $ip = Join-Path $env:SystemRoot $ip }
      if ($ip -match '^[A-Za-z]:\\' -and -not (Test-Path -LiteralPath $ip)) { $vorhanden = $false }
    }
    if ($vorhanden) { if (-not $neu.Contains([string]$n)) { $neu.Add([string]$n) } } else { $weg += [string]$n }
  }
  $plus = $null
  if ($wert -eq 'UpperFilters' -and $pflicht -and -not $neu.Contains($pflicht)) { $neu.Add($pflicht); $plus = $pflicht }
  if (-not $weg.Count -and -not $plus) { Zeile ($wert + ': ' + $(if ($alt.Count) { ($alt -join ', ') + ' — alle Filter vorhanden, unverändert' } else { 'leer — unverändert' })); continue }
  if ($neu.Count) { Set-ItemProperty -LiteralPath $k -Name $wert -Value ([string[]]$neu.ToArray()) -Type MultiString -EA Stop } else { Remove-ItemProperty -LiteralPath $k -Name $wert -EA Stop }
  Zeile ($wert + ': ' + $(if ($alt.Count) { $alt -join ', ' } else { '(leer)' }) + ' → ' + $(if ($neu.Count) { $neu.ToArray() -join ', ' } else { '(leer)' }) + $(if ($weg.Count) { ' · entfernt, weil Treiber/Dienst fehlt: ' + ($weg -join ', ') } else { '' }) + $(if ($plus) { ' · fehlender Windows-Pflichtfilter ergänzt: ' + $plus } else { '' }))
  $geaendert = $true
}
if ($geaendert) {
  $dv = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { [string]$_.ClassGuid -eq $g -and [int]$_.ConfigManagerErrorCode -ne 0 -and [int]$_.ConfigManagerErrorCode -ne 22 })
  foreach ($x in $dv) { & pnputil.exe /restart-device $x.InstanceId 2>&1 | Out-Null; Zeile ('Neu gestartet: ' + $x.FriendlyName + ' (vorher Code ' + [int]$x.ConfigManagerErrorCode + ', pnputil ' + $LASTEXITCODE + ')') }
  Zeile 'Code 19/31/39 verschwindet oft erst nach einem Neustart des PCs (Filter werden beim Start geladen).'
} else { Zeile ('Keine verwaisten Filter in der Klasse ' + $tr[0] + ' — daran liegt der Fehler nicht.') }` }),

  A({ id: 'hw4-com-port-setzen', titel: 'COM-Port-Nummer eines seriellen Geräts ändern', modus: 'system', risiko: 'aendern',
    beschreibung: 'Wie im Geräte-Manager unter „Anschlusseinstellungen → Erweitert → COM-Anschlussnummer“: Gibt einem angeschlossenen USB-Seriell-Adapter, Scanner im COM-Modus oder Messgerät die gewünschte Nummer (z. B. COM12 → COM3, weil das Programm nur COM1–COM9 kennt). Prüft vorher, dass kein angeschlossenes Gerät die neue Nummer hat, passt die Port-Reservierung (ComDB) und den Anzeigenamen an und startet das Gerät neu. Zeigt alten und neuen Port.',
    param: { label: 'jetziger Port > gewünschter Port', platzhalter: 'COM7 > COM3', pflicht: true, vorlagen: ['COM7 > COM3', 'COM12 > COM4', 'COM5 > COM1', 'COM10 > COM2'] },
    ps: String.raw`
if ($P -notmatch '^\s*COM(\d{1,3})\s*>\s*COM(\d{1,3})\s*$') { throw 'Bitte so angeben: „COM7 > COM3“ (jetziger Port > gewünschter Port).' }
$alt = [int]$Matches[1]; $neu = [int]$Matches[2]
if ($neu -lt 1 -or $neu -gt 256 -or $alt -lt 1 -or $alt -gt 256 -or $alt -eq $neu) { throw 'Die Ports müssen zwischen COM1 und COM256 liegen und verschieden sein.' }
$an = 'COM' + $alt; $nn = 'COM' + $neu
$hier = @{}; foreach ($x in @(Get-PnpDevice -PresentOnly -EA SilentlyContinue)) { $hier[[string]$x.InstanceId] = $true }
$ports = @()
foreach ($x in @(Get-PnpDevice -EA SilentlyContinue | Where-Object { [string]$_.ClassGuid -eq '{4d36e978-e325-11ce-bfc1-08002be10318}' })) {
  $pn = [string](Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Enum\' + $x.InstanceId + '\Device Parameters') -Name PortName -EA SilentlyContinue).PortName
  if ($pn -match '^COM\d+$') { $ports += [pscustomobject]@{ Id = [string]$x.InstanceId; Name = [string]$x.FriendlyName; Port = $pn.ToUpper(); Da = $hier.ContainsKey([string]$x.InstanceId) } }
}
$angeschlossen = @($ports | Where-Object { $_.Da })
$q = @($angeschlossen | Where-Object { $_.Port -eq $an })
if (-not $q.Count) { throw ('Kein angeschlossenes Gerät hat ' + $an + '. Angeschlossene Ports: ' + $(if ($angeschlossen.Count) { (@($angeschlossen | ForEach-Object { $_.Port + ' = ' + $_.Name }) -join '; ') } else { 'keine' })) }
if ($q.Count -gt 1) { throw ($an + ' ist doppelt vergeben (' + (@($q | ForEach-Object { $_.Name }) -join '; ') + ') — bitte zuerst im Geräte-Manager klären.') }
$belegt = @($angeschlossen | Where-Object { $_.Port -eq $nn })
if ($belegt.Count) { throw ($nn + ' gehört dem angeschlossenen Gerät „' + $belegt[0].Name + '“ — bitte einen freien Port wählen.') }
$x = $q[0]
foreach ($gh in @($ports | Where-Object { $_.Port -eq $nn -and -not $_.Da })) { Zeile ($nn + ' war für ein nicht angeschlossenes Gerät reserviert („' + $gh.Name + '“) — wird übernommen; steckt dieses alte Gerät wieder, gibt es einen Konflikt.') }
$kp = 'HKLM:\SYSTEM\CurrentControlSet\Enum\' + $x.Id + '\Device Parameters'
Set-ItemProperty -LiteralPath $kp -Name PortName -Value $nn -EA Stop
Zeile ('' + $x.Name + ': ' + $an + ' → ' + $nn)
$ak = 'HKLM:\SYSTEM\CurrentControlSet\Control\COM Name Arbiter'
$db = $null
try { $db = [byte[]](Get-ItemProperty -LiteralPath $ak -Name ComDB -EA Stop).ComDB } catch {}
if ($db) {
  if ($db.Length -lt 32) { $nb = New-Object byte[] 32; [Array]::Copy($db, $nb, $db.Length); $db = $nb }
  $i = $neu - 1; $bi = [int][math]::Floor($i / 8); $db[$bi] = [byte]($db[$bi] -bor (1 -shl ($i % 8)))
  $frei = -not @($ports | Where-Object { $_.Port -eq $an -and $_.Id -ne $x.Id }).Count
  if ($frei) { $j = $alt - 1; $bj = [int][math]::Floor($j / 8); $db[$bj] = [byte]($db[$bj] -band (255 -bxor (1 -shl ($j % 8)))) }
  Set-ItemProperty -LiteralPath $ak -Name ComDB -Value ([byte[]]$db) -Type Binary -EA Stop
  Zeile ('Port-Reservierung (ComDB): ' + $nn + ' belegt' + $(if ($frei) { ', ' + $an + ' freigegeben' } else { ', ' + $an + ' bleibt für ein anderes Gerät reserviert' }))
}
if ($x.Name -match '\(COM\d+\)') {
  $fn = $x.Name -replace '\(COM\d+\)', ('(' + $nn + ')')
  $cs = @'
using System; using System.Runtime.InteropServices;
public static class HwComName {
  [StructLayout(LayoutKind.Sequential)] public struct SP_DEVINFO_DATA { public int cbSize; public Guid ClassGuid; public int DevInst; public IntPtr Reserved; }
  [DllImport("setupapi.dll", SetLastError = true)] static extern IntPtr SetupDiCreateDeviceInfoList(IntPtr g, IntPtr h);
  [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool SetupDiOpenDeviceInfo(IntPtr s, string id, IntPtr h, int f, ref SP_DEVINFO_DATA d);
  [DllImport("setupapi.dll", SetLastError = true)] static extern bool SetupDiSetDeviceRegistryProperty(IntPtr s, ref SP_DEVINFO_DATA d, int p, byte[] b, int n);
  [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr s);
  public static int Setze(string id, string name) {
    IntPtr s = SetupDiCreateDeviceInfoList(IntPtr.Zero, IntPtr.Zero);
    if (s == new IntPtr(-1)) return Marshal.GetLastWin32Error();
    try {
      SP_DEVINFO_DATA d = new SP_DEVINFO_DATA(); d.cbSize = Marshal.SizeOf(typeof(SP_DEVINFO_DATA));
      if (!SetupDiOpenDeviceInfo(s, id, IntPtr.Zero, 0, ref d)) return Marshal.GetLastWin32Error();
      byte[] b = System.Text.Encoding.Unicode.GetBytes(name + "\0");
      if (!SetupDiSetDeviceRegistryProperty(s, ref d, 12, b, b.Length)) return Marshal.GetLastWin32Error();
      return 0;
    } finally { SetupDiDestroyDeviceInfoList(s); }
  }
}
'@
  try { Add-Type -TypeDefinition $cs -EA Stop; $e = [HwComName]::Setze($x.Id, $fn); Zeile $(if ($e -eq 0) { 'Anzeigename: ' + $x.Name + ' → ' + $fn } else { 'Anzeigename nicht angepasst (Fehler ' + $e + ') — der Port gilt trotzdem.' }) } catch { Zeile 'Anzeigename nicht angepasst — der Port gilt trotzdem.' }
}
& pnputil.exe /restart-device $x.Id 2>&1 | Out-Null
$rc = $LASTEXITCODE
Start-Sleep -Seconds 2
$nach = [string](Get-ItemProperty -LiteralPath $kp -Name PortName -EA SilentlyContinue).PortName
Zeile ('Gerät neu gestartet (pnputil ' + $rc + ')' + $(if ($rc -ne 0) { ' — ist der Port in einem Programm geöffnet, Programm schließen bzw. PC neu starten' } else { '' }) + ' · eingetragen: ' + $nach)
Zeile ('Im Programm (Waage, Scanner, Messgerät) jetzt ' + $nn + ' einstellen bzw. das Programm neu starten.')` }),

  A({ id: 'hw4-kuehlung', titel: 'Kühlung leiser stellen (Turbo aus / passive Kühlung) oder Standard', modus: 'system', risiko: 'aendern',
    beschreibung: 'Gegen dauernd hochdrehende, pulsierende Lüfter und heiße Handballenauflagen: „Leise“ begrenzt den Prozessor auf 99 % (Turbo aus — kaum spürbar langsamer, deutlich kühler) und stellt die Systemkühlung auf „passiv“ (erst drosseln, dann Lüfter). „Standard“ stellt 100 % und aktive Kühlung am Netz wieder her. Gilt für den aktiven Energieplan; zeigt vorher/nachher, Temperaturzonen und Drosselungs-Ereignisse der letzten 7 Tage.',
    param: { label: 'Einstellung', platzhalter: KUEHLUNG[0], pflicht: true, optionen: KUEHLUNG },
    ps: String.raw`
$opt = @('Leise (Turbo aus, passive Kühlung)', 'Nur passive Kühlung', 'Standard (Turbo an, aktive Kühlung)')
$w = @($opt | Where-Object { $_ -eq $P.Trim() })
if (-not $w.Count) { throw ('Unbekannte Einstellung „' + $P + '“ — erlaubt: ' + ($opt -join ' | ')) }
$SUB = '54533251-82be-4824-96c1-47b60b740d00'; $MAX = 'bc5038f7-23e0-4960-96da-33abaf5935ec'; $KUE = '94d3a615-a899-4ac5-ae2b-e4d8f634367f'
function PcWert([string]$s) {
  $o = (& powercfg.exe /query SCHEME_CURRENT $SUB $s 2>&1) -join ' '
  $h = @([regex]::Matches($o, ':\s*0x([0-9a-fA-F]{8})') | ForEach-Object { [Convert]::ToInt32($_.Groups[1].Value, 16) })
  if ($h.Count -ge 2) { return ('Netz ' + $h[$h.Count - 2] + ' / Akku ' + $h[$h.Count - 1]) } else { return 'unbekannt' }
}
Zeile ('Vorher: max. Prozessorleistung (%) ' + (PcWert $MAX) + ' · Kühlung (0 = passiv, 1 = aktiv) ' + (PcWert $KUE))
if ($w[0] -eq $opt[0]) { $mx = 99; $ku = 0 } elseif ($w[0] -eq $opt[1]) { $mx = -1; $ku = 0 } else { $mx = 100; $ku = 1 }
if ($mx -ge 0) { & powercfg.exe /setacvalueindex SCHEME_CURRENT $SUB $MAX $mx 2>&1 | Out-Null; & powercfg.exe /setdcvalueindex SCHEME_CURRENT $SUB $MAX $mx 2>&1 | Out-Null }
& powercfg.exe /setacvalueindex SCHEME_CURRENT $SUB $KUE $ku 2>&1 | Out-Null
& powercfg.exe /setdcvalueindex SCHEME_CURRENT $SUB $KUE 0 2>&1 | Out-Null
& powercfg.exe /setactive SCHEME_CURRENT 2>&1 | Out-Null
Zeile ('Nachher: max. Prozessorleistung (%) ' + (PcWert $MAX) + ' · Kühlung ' + (PcWert $KUE))
foreach ($s in $MAX, $KUE) { if (Test-Path -LiteralPath ('HKLM:\SOFTWARE\Policies\Microsoft\Power\PowerSettings\' + $s)) { Zeile ('Achtung: Eine Richtlinie legt ' + $s + ' fest und überstimmt diese Einstellung.') } }
try { foreach ($t in @(Get-CimInstance -Namespace root\wmi -ClassName MSAcpi_ThermalZoneTemperature -EA Stop)) { Zeile ('Temperaturzone ' + (([string]$t.InstanceName -split '\\')[-1]) + ': ' + [math]::Round(([double]$t.CurrentTemperature / 10) - 273.15) + ' °C') } } catch { Zeile 'Temperaturzonen: vom Gerät nicht abrufbar.' }
try { $n = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Processor-Power'; Id = 37; StartTime = (Get-Date).AddDays(-7) } -EA Stop).Count; Zeile ('Prozessor von der Firmware gedrosselt (Ereignis 37) in 7 Tagen: ' + $n + '×') } catch { Zeile 'Prozessor-Drosselung durch die Firmware (Ereignis 37) in 7 Tagen: keine' }` }),

  A({ id: 'hw4-geraet-deaktivieren', titel: 'Defektes Eingabegerät abschalten (Geistertouch, klemmende Tastatur …)', modus: 'system', risiko: 'kritisch',
    beschreibung: 'Schaltet ein defektes Gerät im Geräte-Manager ab, bis es repariert ist: Touchscreen/Stift mit Geistereingaben (gebrochenes Display), interne Tastatur, die von selbst tippt (klemmende Taste, Flüssigkeit), Touchpad, Fingerabdruckleser, IR-Kamera, Smartcard-Leser oder Sensor. Die einzige funktionierende Tastatur bzw. Maus wird nie abgeschaltet. Rückgängig mit „Deaktiviertes Gerät aktivieren“.',
    param: { label: 'Gerätename (Teil, wie im Geräte-Manager)', platzhalter: 'z. B. HID-konformer Touchscreen', pflicht: true, vorlagen: ['Touchscreen', 'Stift', 'PS/2', 'Touchpad', 'Fingerprint', 'IR Camera', 'Smartcard'] },
    ps: String.raw`
$f = $P.Trim()
if ($f.Length -lt 3) { throw 'Bitte mindestens 3 Zeichen des Gerätenamens angeben (wie im Geräte-Manager).' }
$kand = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { [string]$_.FriendlyName -like ('*' + $f + '*') -and [int]$_.ConfigManagerErrorCode -ne 22 })
if (-not $kand.Count) { throw ('Kein aktives Gerät zu „' + $f + '“ (schon abgeschaltet oder Name anders).') }
$d = @($kand | Where-Object {
  $k = [string]$_.Class; $n = [string]$_.FriendlyName
  ($k -in 'Keyboard', 'Mouse', 'Biometric', 'SmartCardReader', 'Sensor') -or ($k -eq 'HIDClass' -and $n -match 'Touch|Stift|Pen|Digitizer|Wacom|Sensor|Präsenz|Presence') -or ($k -in 'Camera', 'Image' -and $n -match '\bIR\b|Infrarot|Hello')
})
if (-not $d.Count) { throw ('„' + $f + '“ ist kein abschaltbares Gerät (erlaubt: Touchscreen/Stift, Tastatur, Touchpad/Maus, Fingerabdruck, IR-Kamera, Smartcard-Leser, Sensor). Gefunden: ' + ((@($kand | ForEach-Object { [string]$_.FriendlyName + ' [' + $_.Class + ']' }) | Select-Object -First 4) -join '; ')) }
if ($d.Count -gt 2) { throw ('Zu viele Treffer (' + $d.Count + ') — bitte genauer angeben: ' + ((@($d | ForEach-Object { [string]$_.FriendlyName }) | Select-Object -First 6) -join '; ')) }
$alleDa = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue)
foreach ($x in $d) {
  $k = [string]$x.Class
  if ($k -in 'Keyboard', 'Mouse') {
    $rest = @($alleDa | Where-Object { [string]$_.Class -eq $k -and [string]$_.InstanceId -ne [string]$x.InstanceId -and [string]$_.Status -eq 'OK' })
    if (-not $rest.Count) { Zeile ('' + $x.FriendlyName + ': NICHT abgeschaltet — es ist das einzige funktionierende Gerät dieser Art. Erst eine externe ' + $(if ($k -eq 'Keyboard') { 'Tastatur' } else { 'Maus' }) + ' anschließen.'); continue }
  }
  & pnputil.exe /disable-device $x.InstanceId 2>&1 | Out-Null
  $rc = $LASTEXITCODE
  Zeile ('' + $x.FriendlyName + ' [' + $k + ']: ' + $(if ($rc -eq 0) { 'abgeschaltet' } elseif ($rc -eq 3010) { 'wird nach dem nächsten Neustart abgeschaltet' } else { 'nicht abgeschaltet (pnputil ' + $rc + ')' }) + ' — rückgängig mit „Deaktiviertes Gerät aktivieren“.')
}` }),
]
