// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „av“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Audio & Headset · Kamera & Mikrofon · Akku & Energie.
//
// Projektwissen (lokal geprüft):
//   • powercfg /qh SCHEME_CURRENT <sub> <set>: die beiden LETZTEN 0x…-Werte sind der aktuelle Netz- bzw. Akkuwert
//     (davor stehen Minimum/Maximum/Schrittweite). Einstellungen per GUID (Richtlinien-Prüfung braucht die GUID):
//     HKLM\SOFTWARE\Policies\Microsoft\Power\PowerSettings\<Einstellungs-GUID> überstimmt den Energieplan (DXC).
//   • Modern Standby (S0): Kernel-Power 506 (Eintritt, BatteryRemainingCapacityOnEnter) und 507 (Austritt,
//     DurationInUs, DripsResidencyInUs = Zeit im Tiefschlaf, BatteryRemainingCapacityOnExit, PowerStateAc) gehören
//     über ScenarioInstanceIdV2 zusammen. Klassischer Standby: Kernel-Power 42 (Grund in der Meldung) + Power-
//     Troubleshooter 1 (WakeSourceText). Kernel-Boot 27: BootType 0 = Kaltstart, 1 = Schnellstart, 2 = aus Ruhezustand.
//   • Klangschema: HKU\<SID>\AppEvents\Schemes (Standardwert = Schema-Name .Default/.None/.Current);
//     je Ereignis Apps\<App>\<Ereignis>\.Current (gespielt) und \.Default (Windows-Vorgabe). Set-ItemProperty
//     -Name '(default)' setzt den unbenannten Wert auch unter Registry::HKEY_USERS.
//   • Bluetooth: Freisprechprofil = BTHENUM\{0000111E-…} (Handsfree) bzw. {00001108-…} (Headset-Profil);
//     Abschalten wie „Dienste → Freisprechtelefonie“ abwählen. Absolute Lautstärke:
//     HKLM\SYSTEM\CurrentControlSet\Control\Bluetooth\Audio\AVRCP\CT → DisableAbsoluteVolume (DWORD).
// BIOS (HP Battery Health Manager, Adaptive Battery Optimizer) wird nur GELESEN, nie verändert.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Energieplan lesen: aktueller Netz-/Akkuwert einer Einstellung (oder $null). */
const AV_PWR = String.raw`
function AvPwr([string]$sub, [string]$set) {
  $o = (& powercfg.exe /qh SCHEME_CURRENT $sub $set 2>$null | Out-String)
  $h = @([regex]::Matches($o, '0x([0-9a-fA-F]{8})') | ForEach-Object { [Convert]::ToInt64($_.Groups[1].Value, 16) })
  if ($h.Count -ge 2) { @($h[$h.Count - 2], $h[$h.Count - 1]) } else { $null }
}
function AvZeit($s) { $s = [double]$s; if ($s -le 0 -or $s -ge 2592000) { 'nie' } elseif ($s -ge 3600 -and ($s % 3600) -eq 0) { '' + ($s / 3600) + ' Std.' } else { '' + [math]::Round($s / 60) + ' Min.' } }
`

/** Optionen für „av4-energie-einstellung“. */
const ENERGIE_OPTIONEN = [
  'Akku-Warnungen: Hinweis bei 15 %, Ruhezustand bei 5 %',
  'Energiesparmodus automatisch ab 20 % (Standard)',
  'Energiesparmodus nie automatisch',
  'Energiesparmodus: Bildschirm nicht abdunkeln',
  'Akku: Bildschirm aus nach 5, Standby nach 15 Minuten',
  'Akku: Bildschirm aus nach 15, Standby nach 30 Minuten',
  'Ruhezustand nach 3 Stunden Standby im Akku',
  'Ruhezustand nach Standby aus',
  'Gesperrt: Bildschirm erst nach 10 Minuten aus',
  'PCI-Express-Energiesparen aus',
]
/** Optionen für „av4-klangschema“. */
const KLANG_OPTIONEN = ['Windows-Standard (Systemklänge wieder an)', 'Keine Sounds (alle Systemklänge aus)', 'Nur USB-An-/Abstecktöne aus', 'Nur Benachrichtigungs- und Akkutöne wieder an']
/** Optionen für „av4-bt-audio“. */
const BT_OPTIONEN = ['Absolute Lautstärke aus (Windows regelt selbst)', 'Absolute Lautstärke an (Standard)', 'Freisprechprofil der Bluetooth-Kopfhörer aus (nur Stereo, kein BT-Mikrofon)', 'Freisprechprofil der Bluetooth-Kopfhörer an']

export const AKTIONEN_AV4: PaAktion[] = [
  // ══ Akku & Energie ══════════════════════════════════════════════════════════
  A({ id: 'av4-energie-verlauf', titel: 'Standby, Aufwachen und Herunterfahren der letzten 7 Tage (mit Gründen und Akkuverbrauch)', modus: 'system', risiko: 'lesen', timeoutMs: 120000,
    beschreibung: 'Zeigt Standby-Art (Modern Standby S0 oder klassisch S3), Ruhezustand/Schnellstart und die Zeiten bis Bildschirm aus, Standby und Ruhezustand. Dazu der Verlauf der letzten 7 Tage: wann der PC warum in den Standby ging, wodurch er aufgewacht ist, wer ihn heruntergefahren oder neu gestartet hat (Kernel-Power 42/107/41, Power-Troubleshooter 1, User32 1074, EventLog 6008, Kernel-Boot 27) und bei Modern Standby je längerer Standby-Phase Dauer, Akkuverbrauch und Anteil im Tiefschlaf. Ändert nichts.',
    ps: String.raw`
${AV_PWR}
$seit = (Get-Date).AddDays(-7)
$pwa = (& powercfg.exe /a 2>$null | Out-String)
$i = $pwa.IndexOf('nicht verf'); if ($i -lt 0) { $i = $pwa.IndexOf('not avail') }
$verf = $(if ($i -gt 0) { $pwa.Substring(0, $i) } else { $pwa })
$art = $(if ($verf -match 'S0') { 'Modern Standby (S0 – Netzwerk/Apps teils aktiv)' } elseif ($verf -match 'S3') { 'klassischer Standby (S3)' } else { 'KEIN Standby verfügbar (Grafiktreiber/Hypervisor?)' })
Zeile ('Standby-Art: ' + $art + ' · Ruhezustand: ' + $(if ($verf -match 'Ruhezustand|Hibernat') { 'verfügbar' } else { 'aus' }) + ' · Schnellstart: ' + $(if ($verf -match 'Schnellstart|Fast Startup') { 'an' } else { 'aus' }))
$v = AvPwr 'SUB_VIDEO' 'VIDEOIDLE'; $s = AvPwr 'SUB_SLEEP' 'STANDBYIDLE'; $h = AvPwr 'SUB_SLEEP' 'HIBERNATEIDLE'
if ($v -and $s) { Zeile ('Bildschirm aus: Netz ' + (AvZeit $v[0]) + ' / Akku ' + (AvZeit $v[1]) + ' · Standby: Netz ' + (AvZeit $s[0]) + ' / Akku ' + (AvZeit $s[1]) + $(if ($h) { ' · Ruhezustand nach Standby: Netz ' + (AvZeit $h[0]) + ' / Akku ' + (AvZeit $h[1]) } else { '' })) }
$q = @(
  @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 41, 42, 105, 107, 506, 507; StartTime = $seit },
  @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Power-Troubleshooter'; Id = 1; StartTime = $seit },
  @{ LogName = 'System'; ProviderName = 'User32'; Id = 1074; StartTime = $seit },
  @{ LogName = 'System'; ProviderName = 'EventLog'; Id = 6008; StartTime = $seit },
  @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Boot'; Id = 27; StartTime = $seit }
)
$ev = New-Object System.Collections.Generic.List[object]
foreach ($f in $q) { foreach ($e in @(Get-WinEvent -FilterHashtable $f -MaxEvents 600 -EA SilentlyContinue)) { $ev.Add($e) } }
function AvDaten($e) { $d = @{}; try { $x = [xml]$e.ToXml(); foreach ($n in $x.Event.EventData.Data) { $d[[string]$n.Name] = [string]$n.'#text' } } catch {}; $d }
$ueb = @{ 'Battery' = 'Akku fast leer'; 'Button or Lid' = 'Ein/Aus-Taste oder Deckel'; 'Lid' = 'Deckel'; 'Power Button' = 'Ein/Aus-Taste'; 'Application API' = 'Programm/Startmenü'; 'System Idle' = 'Standby-Zeit abgelaufen'; 'Idle Timeout' = 'Leerlauf-Zeit abgelaufen'; 'Hibernate from Sleep - Fixed Timeout' = 'Ruhezustand nach Standby-Zeit'; 'Thermal Zone' = 'ÜBERHITZUNG'; 'Sleep, Hibernate, or Shutdown' = 'Standby/Ruhezustand/Herunterfahren'; 'Resume from Hibernate' = 'Fortsetzen aus Ruhezustand'; 'Input Keyboard' = 'Tastatur'; 'Input Mouse' = 'Maus'; 'Input Touchpad' = 'Touchpad'; 'Kernel API' = 'Windows selbst' }
function AvText($e) { $m = ([string]$e.Message -replace '\s+', ' ').Trim(); $g = [regex]::Match($m, '(Ursache|Grund|Reason|Reaktivierungsquelle|Wake Source)\s*:\s*(.+?)(\.?\s*$|\s{2})'); $r = $(if ($g.Success) { $g.Groups[2].Value.Trim() } elseif ($m.Length -gt 90) { $m.Substring(0, 90) } else { $m }); if ($ueb.ContainsKey($r)) { $r + ' (' + $ueb[$r] + ')' } elseif ($r -match '^\d+$') { 'Code ' + $r } else { $r } }
$kp = @($ev | Where-Object { $_.ProviderName -eq 'Microsoft-Windows-Kernel-Power' })
$n42 = @($kp | Where-Object { $_.Id -eq 42 }).Count; $n506 = @($kp | Where-Object { $_.Id -eq 506 }).Count; $n41 = @($kp | Where-Object { $_.Id -eq 41 }).Count; $n105 = @($kp | Where-Object { $_.Id -eq 105 }).Count
$nWach = @($ev | Where-Object { $_.ProviderName -eq 'Microsoft-Windows-Power-Troubleshooter' }).Count
$n1074 = @($ev | Where-Object { $_.Id -eq 1074 }).Count; $n6008 = @($ev | Where-Object { $_.Id -eq 6008 }).Count
Zeile ('Letzte 7 Tage: ' + $n42 + '× Standby/Ruhezustand (S3/S4), ' + $nWach + '× aufgewacht, ' + $n506 + '× Modern-Standby-Phasen, ' + $n1074 + '× Herunterfahren/Neustart, ' + ($n41 + $n6008) + '× UNERWARTET aus, ' + $n105 + '× Netzteil an/ab')
# Modern Standby: Phasen ab 15 Minuten mit Verbrauch
$ein = @{}; foreach ($e in @($kp | Where-Object { $_.Id -eq 506 })) { $d = AvDaten $e; if ($d['ScenarioInstanceIdV2']) { $ein[$d['ScenarioInstanceIdV2']] = $d } }
$ms = @()
foreach ($e in @($kp | Where-Object { $_.Id -eq 507 })) {
  $d = AvDaten $e; $dauer = [double]$d['DurationInUs'] / 1e6
  if ($dauer -lt 900) { continue }
  $voll = [double]$d['BatteryFullChargeCapacityOnExit']; $rest = [double]$d['BatteryRemainingCapacityOnExit']
  $vorher = $null; if ($ein.ContainsKey($d['ScenarioInstanceIdV2'])) { $vorher = [double]$ein[$d['ScenarioInstanceIdV2']]['BatteryRemainingCapacityOnEnter'] }
  $tief = $(if ($dauer -gt 0) { [math]::Round(100 * ([double]$d['DripsResidencyInUs'] / 1e6) / $dauer) } else { 0 })
  $verbrauch = ''; $proStd = 0
  if ($voll -gt 0 -and $null -ne $vorher -and $vorher -ge $rest) { $pz = 100 * ($vorher - $rest) / $voll; $proStd = $pz / ([math]::Max([double]1, $dauer / 3600)); $verbrauch = ' · Akku −' + [math]::Round($pz, 1) + ' % (' + [math]::Round($proStd, 1) + ' %/Std.)' }
  $ms += [pscustomobject]@{ t = $e.TimeCreated; z = ('Modern Standby ' + [math]::Round($dauer / 3600, 1) + ' Std. · ' + $(if ($d['PowerStateAc'] -eq 'true') { 'am Netz' } else { 'im Akku' }) + $verbrauch + ' · Tiefschlaf ' + $tief + ' %' + $(if ($tief -lt 80 -and $dauer -ge 1800) { ' (zu wenig – etwas hält den PC wach)' } else { '' }) + ' · beendet durch ' + (AvText $e)); hoch = ($proStd -ge 3) }
}
# Wichtige Ereignisse (neueste zuerst)
$liste = @()
foreach ($e in $ev) {
  $d = AvDaten $e; $z = $null
  switch ($e.Id) {
    42 { if ($e.ProviderName -eq 'Microsoft-Windows-Kernel-Power') { $z = 'Standby/Ruhezustand eingeleitet · Grund: ' + (AvText $e) } }
    1 { $q2 = $d['WakeSourceText']; if (-not $q2) { $q2 = AvText $e }; $z = 'Aufgewacht · Quelle: ' + $q2 }
    41 { if ($e.ProviderName -eq 'Microsoft-Windows-Kernel-Power') { $z = 'UNERWARTET AUS (Kernel-Power 41)' + $(if ($d['BugcheckCode'] -and $d['BugcheckCode'] -ne '0') { ' · Bluescreen ' + $d['BugcheckCode'] } else { '' }) + $(if ($d['PowerButtonTimestamp'] -and $d['PowerButtonTimestamp'] -ne '0') { ' · Ein/Aus-Taste lange gedrückt' } else { '' }) + $(if ($d['SleepInProgress'] -and $d['SleepInProgress'] -ne '0' -and $d['SleepInProgress'] -ne 'false') { ' · während Standby' } else { '' }) } }
    6008 { $z = 'Vorheriges Herunterfahren war unerwartet (6008)' }
    1074 { $p0 = [string]$e.Properties[0].Value; $pn = $p0; try { $pn = [IO.Path]::GetFileName(($p0 -replace '\s*\(.*\)\s*$', '')) } catch {}; $z = [string]$e.Properties[4].Value + ' durch ' + $pn + ' · ' + [string]$e.Properties[6].Value + ' · ' + [string]$e.Properties[2].Value }
    27 { $bt = [string]$d['BootType']; $n = 0; try { $n = [Convert]::ToInt32(($bt -replace '^0x', ''), 16) } catch {}; $z = 'Windows gestartet · ' + $(switch ($n) { 0 { 'Kaltstart' } 1 { 'mit Schnellstart (kein echter Neustart)' } 2 { 'Fortsetzen aus dem Ruhezustand' } default { 'Art ' + $bt } }) }
  }
  if ($z) { $liste += [pscustomobject]@{ t = $e.TimeCreated; z = $z } }
}
$alle = @($liste + $ms | Sort-Object t -Descending | Select-Object -First 28)
if (-not $alle.Count) { Zeile 'Keine Standby-, Aufwach- oder Herunterfahr-Ereignisse in den letzten 7 Tagen.' }
foreach ($x in $alle) { Zeile ('  ' + $x.t.ToString('dd.MM. HH:mm') + ' · ' + $x.z) }
if ($n41 + $n6008) { Zeile 'Unerwartet aus: Strom weg (Akku leer, Netzteil/Dock), Ein/Aus-Taste lange gedrückt oder Absturz – Abstürze zeigt „Abstürze der letzten 14 Tage“.' }
if (@($ms | Where-Object { $_.hoch }).Count) { Zeile 'Standby-Verbrauch über 3 %/Std. – Weckquellen prüfen bzw. „Standby im Akkubetrieb ruhigstellen“ oder Ruhezustand nach Standby einstellen.' }` }),

  A({ id: 'av4-akku-details', titel: 'Akku und Laden im Detail (Ladeleistung, Netzteil, Ladegrenze im BIOS, Warnstufen)', modus: 'system', risiko: 'lesen',
    beschreibung: 'Je Akku: Hersteller, Chemie, Neukapazität gegen heutige Vollkapazität (Gesundheit), Ladezyklen, Ladestand, ob das Netzteil erkannt wird, ob gerade geladen wird und mit wie viel Watt (bzw. wie viel entnommen wird), Restlaufzeit. Dazu die Lade-Einstellungen im HP-BIOS (Battery Health Manager, Adaptive Battery Optimizer, USB-Laden – nur gelesen), wie oft das Netzteil in 24 Stunden an/ab ging (Wackelkontakt), Akku-Warnstufen und Energiesparmodus des Energieplans – mit Bewertung. Ändert nichts.',
    ps: String.raw`
${AV_PWR}
$b = @(Get-CimInstance Win32_Battery -EA SilentlyContinue)
$st = @(Get-CimInstance -Namespace root\wmi -ClassName BatteryStatus -EA SilentlyContinue)
$sdh = @{}; foreach ($x in @(Get-CimInstance -Namespace root\wmi -ClassName BatteryStaticData -EA SilentlyContinue)) { $sdh[[string]$x.InstanceName] = $x }
$fch = @{}; foreach ($x in @(Get-CimInstance -Namespace root\wmi -ClassName BatteryFullChargedCapacity -EA SilentlyContinue)) { $fch[[string]$x.InstanceName] = [double]$x.FullChargedCapacity }
$cch = @{}; foreach ($x in @(Get-CimInstance -Namespace root\wmi -ClassName BatteryCycleCount -EA SilentlyContinue)) { $cch[[string]$x.InstanceName] = $x.CycleCount }
if (-not $b.Count -and -not $st.Count) { Zeile 'Kein Akku erkannt – Desktop-PC, oder der Akku wird nicht erkannt (Akkusymbol mit Kreuz → Hardware/HP-Service).' }
$nr = 0
foreach ($s in $st) {
  $nr++; $in = [string]$s.InstanceName; $d = $sdh[$in]
  $chem = ''; try { if ($d -and $d.Chemistry) { $chem = ([Text.Encoding]::ASCII.GetString([BitConverter]::GetBytes([uint32]$d.Chemistry))).Trim([char[]]@([char]0, [char]32)) } } catch {}
  if ($d) { Zeile ('Akku ' + $nr + ': ' + ([string]$d.ManufactureName).Trim() + ' ' + ([string]$d.DeviceName).Trim() + $(if ($chem) { ' · ' + $chem } else { '' }) + $(if ($d.SerialNumber) { ' · Seriennr. ' + ([string]$d.SerialNumber).Trim() } else { '' })) }
  $neu = $(if ($d) { [double]$d.DesignedCapacity } else { 0 }); $voll = [double]$fch[$in]
  if ($neu -gt 0 -and $voll -gt 0) { $g = [math]::Round(100 * $voll / $neu); Zeile ('  Kapazität: neu ' + [math]::Round($neu / 1000, 1) + ' Wh · heute voll ' + [math]::Round($voll / 1000, 1) + ' Wh → Gesundheit ' + $g + ' %' + $(if ($g -lt 60) { ' · VERSCHLISSEN – Tausch über HP-Garantie bzw. Leasing' } elseif ($g -lt 80) { ' · deutlich gealtert' } else { '' }) + $(if ($cch[$in]) { ' · ' + $cch[$in] + ' Ladezyklen' } else { '' })) }
  elseif ($voll -gt 0) { Zeile ('  Kapazität: heute voll ' + [math]::Round($voll / 1000, 1) + ' Wh (Neukapazität nicht lesbar)' + $(if ($cch[$in]) { ' · ' + $cch[$in] + ' Ladezyklen' } else { '' })) }
  $rest = [double]$s.RemainingCapacity; $pz = $(if ($voll -gt 0) { [math]::Round(100 * $rest / $voll) } else { $null })
  $lw = [math]::Round([double]$s.ChargeRate / 1000, 1); $ew = [math]::Round([double]$s.DischargeRate / 1000, 1)
  Zeile ('  Ladestand ' + $(if ($null -ne $pz) { '' + $pz + ' %' } else { '?' }) + ' · Netzteil erkannt: ' + (Ja ([bool]$s.PowerOnline)) + ' · lädt: ' + (Ja ([bool]$s.Charging)) + $(if ($s.Charging -and $lw -gt 0) { ' mit ' + $lw + ' W' } elseif ($s.Discharging) { ' · Entnahme ' + $ew + ' W' } else { '' }) + $(if ($s.Voltage) { ' · ' + [math]::Round([double]$s.Voltage / 1000, 2) + ' V' } else { '' }) + $(if ($s.Critical) { ' · KRITISCH' } else { '' }))
  if ($s.PowerOnline -and -not $s.Charging -and $null -ne $pz -and $pz -lt 95) { Zeile ('  → Am Netzteil, lädt aber NICHT bei ' + $pz + ' %: Ladegrenze (HP Battery Health Manager/Adaptive Battery Optimizer), zu schwaches Netzteil/Dock, Temperatur oder Akku defekt.') }
  if ($s.Charging -and $lw -gt 0 -and $lw -lt 20 -and $null -ne $pz -and $pz -lt 80) { Zeile ('  → Lädt nur mit ' + $lw + ' W: langsames USB-C-Netzteil, Monitor-/Dock-Ladung oder Kabel (HP-Netzteile 65–100 W).') }
  if ($s.PowerOnline -and $s.Discharging) { Zeile '  → Am Netzteil und trotzdem Entnahme: Netzteil liefert zu wenig für die Last (Dock/Monitor-USB-C, falsches Netzteil).' }
}
foreach ($w in $b) { if ($w.EstimatedRunTime -and $w.EstimatedRunTime -lt 71582788) { Zeile ('Restlaufzeit laut Windows: ' + [math]::Floor($w.EstimatedRunTime / 60) + ' Std. ' + ($w.EstimatedRunTime % 60) + ' Min.') } }
$hp = @(Get-CimInstance -Namespace root\HP\InstrumentedBIOS -ClassName HP_BIOSEnumeration -EA SilentlyContinue | Where-Object { [string]$_.Name -match 'Battery|Charg|Adaptive|USB Charging|Power On|Wake|Lid' })
if ($hp.Count) {
  Zeile 'HP-BIOS (nur gelesen – Änderungen nur durch die IT am Gerät):'
  foreach ($x in @($hp | Sort-Object Name | Select-Object -First 14)) { $cv = [string]$x.CurrentValue; if (-not $cv) { $cv = (@(([string]$x.Value) -split ',') | Where-Object { $_ -like '[*]*' } | Select-Object -First 1) -replace '^\*', '' }; Zeile ('  ' + $x.Name + ' = ' + $cv) }
} else { Zeile 'HP-BIOS-Einstellungen: nicht lesbar (kein HP-Gerät oder HP-WMI fehlt).' }
$n105 = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 105; StartTime = (Get-Date).AddHours(-24) } -MaxEvents 500 -EA SilentlyContinue).Count
Zeile ('Netzteil an/ab in 24 Std.: ' + $n105 + '×' + $(if ($n105 -ge 10) { ' → Wackelkontakt, defektes Kabel/Netzteil oder Dock lädt nur zeitweise' } else { '' }))
$sub = 'e73a048d-bf27-4f12-9731-8b2076e8891f'
$lo = AvPwr $sub '8183ba9a-e910-48da-8769-14ae6dc1170a'; $lof = AvPwr $sub 'bcded951-187b-4d05-bccc-f7e51960c258'; $cr = AvPwr $sub '9a66d8d7-4ff7-4ef9-b5a2-5a326ca2a469'; $cra = AvPwr $sub '637ea02f-bbcb-4015-8e2c-a1c7b9c0b546'
$akt = @{ 0 = 'nichts tun'; 1 = 'Energie sparen'; 2 = 'Ruhezustand'; 3 = 'Herunterfahren' }
if ($lo -and $cr) { Zeile ('Warnstufen (Akku): niedrig ' + $lo[1] + ' % (Hinweis ' + $(if ($lof -and $lof[1] -eq 1) { 'an' } else { 'AUS' }) + ') · kritisch ' + $cr[1] + ' % → ' + $(if ($cra) { $akt[[int]$cra[1]] } else { '?' })) }
$es = AvPwr 'de830923-a562-41af-a086-e3a2c6bad2da' 'e69653ca-cf7f-4f05-aa73-cb833fa90ad4'
if ($es) { Zeile ('Energiesparmodus schaltet sich ein ab: ' + $(if ($es[1] -eq 0) { 'nie automatisch' } elseif ($es[1] -ge 100) { 'IMMER (100 %)' } else { '' + $es[1] + ' %' })) }` }),

  A({ id: 'av4-energie-einstellung', titel: 'Energieoption im aktiven Energieplan setzen (Akku-Warnungen, Energiesparmodus, Akku-Zeiten, Ruhezustand)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Setzt eine Energieeinstellung, die es in den Windows-Einstellungen nur versteckt gibt: Akku-Warnstufen (Hinweis bei 15 %, Ruhezustand statt Ausgehen bei 5 %), ab wann sich der Energiesparmodus selbst einschaltet bzw. dass er den Bildschirm nicht abdunkelt, Bildschirm-/Standby-Zeiten im Akkubetrieb, Ruhezustand nach 3 Stunden Standby im Akku (gegen leere Laptops nach dem Wochenende) oder kein Ruhezustand nach dem Standby, Bildschirm bei gesperrtem PC erst nach 10 statt nach 1 Minute aus, PCI-Express-Energiesparen aus (Dock/USB-C/WLAN nach dem Standby). Schaltet den Ruhezustand bei Bedarf ein, zeigt vorher/nachher und meldet Richtlinien, die Vorrang haben.',
    param: { label: 'Einstellung', platzhalter: ENERGIE_OPTIONEN[0], pflicht: true, optionen: ENERGIE_OPTIONEN },
    ps: String.raw`
${AV_PWR}
$opt = $P.Trim()
$SB = 'e73a048d-bf27-4f12-9731-8b2076e8891f'; $SE = 'de830923-a562-41af-a086-e3a2c6bad2da'; $SV = '7516b95f-f776-4464-8c53-06167f40cc99'; $SS = '238c9fa8-0aad-41ed-83f4-97be242c8f20'; $SP = '501a4d13-42af-4429-9fd1-a8218c268e20'
$hibNoetig = $false
# je Eintrag: Untergruppe, Einstellung, Netzwert ($null = unverändert), Akkuwert, Bezeichnung, Art (p = Prozent, s = Sekunden, a = Aktion, o = an/aus, l = Verbindungszustand)
$l = @(switch -Regex ($opt) {
  '^akku-warnungen' { ,@($SB, '8183ba9a-e910-48da-8769-14ae6dc1170a', 15, 15, 'Niedrige Akkukapazität', 'p'); ,@($SB, 'bcded951-187b-4d05-bccc-f7e51960c258', 1, 1, 'Hinweis bei niedrigem Akku', 'o'); ,@($SB, 'd8742dcb-3e6a-4b3c-b3fe-374623cdcf06', 0, 0, 'Aktion bei niedrigem Akku', 'a'); ,@($SB, 'f3c5027d-cd16-4930-aa6b-90db844a8f00', 8, 8, 'Reserve-Akkustand', 'p'); ,@($SB, '9a66d8d7-4ff7-4ef9-b5a2-5a326ca2a469', 5, 5, 'Kritische Akkukapazität', 'p'); ,@($SB, '5dbb7c9f-38e9-40d2-9749-4f8a0e9f640f', 1, 1, 'Hinweis bei kritischem Akku', 'o'); ,@($SB, '637ea02f-bbcb-4015-8e2c-a1c7b9c0b546', 2, 2, 'Aktion bei kritischem Akku', 'a'); $hibNoetig = $true; break }
  '^energiesparmodus automatisch' { ,@($SE, 'e69653ca-cf7f-4f05-aa73-cb833fa90ad4', $null, 20, 'Energiesparmodus automatisch ab', 'p'); break }
  '^energiesparmodus nie' { ,@($SE, 'e69653ca-cf7f-4f05-aa73-cb833fa90ad4', $null, 0, 'Energiesparmodus automatisch ab', 'p'); break }
  '^energiesparmodus: bildschirm' { ,@($SE, '13d09884-f74e-474a-a852-b6bde8ad03a8', 100, 100, 'Bildschirmhelligkeit im Energiesparmodus', 'p'); break }
  '^akku: bildschirm aus nach 5,' { ,@($SV, '3c0bc021-c8a8-4e07-a973-6b14cbcb2b7e', $null, 300, 'Bildschirm aus nach', 's'); ,@($SS, '29f6c1db-86da-48c5-9fdb-f2b67b1f44da', $null, 900, 'Standby nach', 's'); break }
  '^akku: bildschirm aus nach 15,' { ,@($SV, '3c0bc021-c8a8-4e07-a973-6b14cbcb2b7e', $null, 900, 'Bildschirm aus nach', 's'); ,@($SS, '29f6c1db-86da-48c5-9fdb-f2b67b1f44da', $null, 1800, 'Standby nach', 's'); break }
  '^ruhezustand nach 3' { ,@($SS, '9d7815a6-7ee4-497e-8888-515a05f02364', $null, 10800, 'Ruhezustand nach Standby', 's'); $hibNoetig = $true; break }
  '^ruhezustand nach standby aus' { ,@($SS, '9d7815a6-7ee4-497e-8888-515a05f02364', 0, 0, 'Ruhezustand nach Standby', 's'); break }
  '^gesperrt: bildschirm' { ,@($SV, '8ec4b3a5-6868-48c2-be75-4f3044be88a7', 600, 600, 'Bildschirm aus bei gesperrtem PC nach', 's'); break }
  '^pci-express' { ,@($SP, 'ee12f906-d277-404b-b6da-e5fa1a576df5', 0, 0, 'PCI-Express-Verbindungszustand (Energiesparen)', 'l'); break }
  default { throw ('Unbekannte Auswahl: ' + $opt) }
})
$txt = @{ a = @{ 0 = 'nichts tun'; 1 = 'Energie sparen'; 2 = 'Ruhezustand'; 3 = 'Herunterfahren' }; o = @{ 0 = 'aus'; 1 = 'an' }; l = @{ 0 = 'aus'; 1 = 'mäßig'; 2 = 'maximal' } }
function AvWert([string]$art, $v) { if ($null -eq $v) { return '?' }; switch ($art) { 'p' { if ($v -eq 0) { 'nie/0 %' } else { '' + $v + ' %' } } 's' { AvZeit $v } default { $t = $txt[$art][[int]$v]; if ($t) { $t } else { '' + $v } } } }
if (-not @(Get-CimInstance Win32_Battery -EA SilentlyContinue).Count -and $opt -notmatch '^(pci|ruhezustand nach standby aus|gesperrt)') { Zeile 'Hinweis: Kein Akku erkannt – Akku-Einstellungen wirken nur bei Laptops.' }
function AvHib { $x = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' -EA SilentlyContinue; $v = $x.HibernateEnabled; if ($null -eq $v) { $v = $x.HibernateEnabledDefault }; return ($v -eq 1) }
if ($hibNoetig) {
  $hp = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' -EA SilentlyContinue
  if (-not (AvHib)) { & powercfg.exe /hibernate on 2>&1 | Out-Null; $hc = $LASTEXITCODE; & powercfg.exe /hibernate /type full 2>&1 | Out-Null; Zeile ('Ruhezustand: vorher aus → jetzt eingeschaltet (powercfg Code ' + $hc + ')') }
  elseif ($hp.HiberFileType -eq 1) { & powercfg.exe /hibernate /type full 2>&1 | Out-Null; Zeile 'Ruhezustandsdatei: vorher reduziert (nur Schnellstart) → jetzt vollständig' }
  if (-not (AvHib)) { foreach ($e in $l) { if ($e[1] -eq '637ea02f-bbcb-4015-8e2c-a1c7b9c0b546') { $e[2] = 3; $e[3] = 3; Zeile 'Ruhezustand ist auf diesem Gerät nicht möglich – bei kritischem Akku wird stattdessen sauber heruntergefahren.' } } }
}
$alt = @{}; foreach ($e in $l) { $alt[$e[1]] = AvPwr $e[0] $e[1] }
foreach ($e in $l) {
  if (-not $alt[$e[1]]) { Zeile ($e[4] + ': gibt es auf diesem Gerät nicht – übersprungen'); continue }
  if ($null -ne $e[2]) { & powercfg.exe /setacvalueindex SCHEME_CURRENT $e[0] $e[1] $e[2] 2>&1 | Out-Null }
  if ($null -ne $e[3]) { & powercfg.exe /setdcvalueindex SCHEME_CURRENT $e[0] $e[1] $e[3] 2>&1 | Out-Null }
}
& powercfg.exe /setactive SCHEME_CURRENT 2>&1 | Out-Null
foreach ($e in $l) {
  $a = $alt[$e[1]]; if (-not $a) { continue }
  $n = AvPwr $e[0] $e[1]
  if ($null -ne $e[2]) { Zeile ($e[4] + ' (Netz): vorher ' + (AvWert $e[5] $a[0]) + ' → jetzt ' + (AvWert $e[5] $n[0])) }
  if ($null -ne $e[3]) { Zeile ($e[4] + ' (Akku): vorher ' + (AvWert $e[5] $a[1]) + ' → jetzt ' + (AvWert $e[5] $n[1])) }
  if (Test-Path ('HKLM:\SOFTWARE\Policies\Microsoft\Power\PowerSettings\' + $e[1])) { Zeile ('Achtung: Eine Richtlinie gibt „' + $e[4] + '“ vor und überstimmt diese Einstellung (DXC).') }
}
$plan = (& powercfg.exe /getactivescheme 2>$null | Out-String).Trim()
Zeile ('Gilt für den aktiven Energieplan: ' + ($plan -replace '^.*?\(', '(' ))` }),

  // ══ Audio & Headset ═════════════════════════════════════════════════════════
  A({ id: 'av4-klangschema', titel: 'Windows-Systemklänge des Benutzers einstellen (Standard, keine Sounds, USB-Töne aus)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Setzt das Klangschema des angemeldeten Benutzers wie Systemsteuerung → Sound → „Sounds“: „Windows-Standard“ stellt alle Systemklänge (Benachrichtigung, Mail, Erinnerung, Akku-Warnung, Fehlerton) wieder her, „Keine Sounds“ schaltet alle ab, „Nur USB-An-/Abstecktöne aus“ beendet das ständige Ding-Dong wackelnder USB-Geräte, „Nur Benachrichtigungs- und Akkutöne“ holt diese Töne zurück. Die bisherigen Klänge werden vorher als .reg im Profil gesichert; zeigt vorher/nachher.',
    param: { label: 'Einstellung', platzhalter: KLANG_OPTIONEN[0], pflicht: true, optionen: KLANG_OPTIONEN },
    ps: String.raw`
NeedHive
$w = $uHive + '\AppEvents\Schemes'
if (-not (Test-Path -LiteralPath $w)) { throw 'Klangeinstellungen des Benutzers nicht gefunden (AppEvents\Schemes fehlt).' }
$opt = $P.Trim()
$modus = switch -Regex ($opt) { '^windows-standard' { 'standard'; break } '^keine sounds' { 'keine'; break } '^nur usb' { 'usb'; break } '^nur benachrichtigung' { 'benach'; break } default { throw ('Unbekannte Auswahl: ' + $opt) } }
function AvStd([string]$k) { if (-not (Test-Path -LiteralPath $k)) { return $null }; try { return [string](Get-Item -LiteralPath $k -EA Stop).GetValue('') } catch { return $null } }
$sn = @{ '.Default' = 'Windows-Standard'; '.None' = 'Keine Sounds'; '.Current' = 'eigene Änderungen' }
$schemaAlt = AvStd $w
$sd = Join-Path $uLocal 'ITAdminTool-Sicherung'
if (-not (Test-Path -LiteralPath $sd)) { New-Item -ItemType Directory -Path $sd -Force | Out-Null }
$bf = Join-Path $sd ('Klangschema_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.reg')
& reg.exe export ('HKU\' + $uSid + '\AppEvents\Schemes') $bf /y 2>&1 | Out-Null
if (Test-Path -LiteralPath $bf) { Zeile ('Sicherung der bisherigen Klänge: ' + $bf) } else { throw 'Sicherung der Klangeinstellungen fehlgeschlagen – nichts geändert.' }
$apps = $w + '\Apps'
$ziele = @()
switch ($modus) {
  'usb' { $ziele = @('DeviceConnect', 'DeviceDisconnect', 'DeviceFail') | ForEach-Object { $apps + '\.Default\' + $_ } }
  'benach' { $ziele = @('Notification.Default', 'Notification.IM', 'Notification.Mail', 'Notification.Reminder', 'Notification.SMS', 'MailBeep', 'LowBatteryAlarm', 'CriticalBatteryAlarm') | ForEach-Object { $apps + '\.Default\' + $_ } }
  default { foreach ($a in @(Get-ChildItem -LiteralPath $apps -EA SilentlyContinue)) { foreach ($x in @(Get-ChildItem -LiteralPath $a.PSPath -EA SilentlyContinue)) { $ziele += $x.PSPath } } }
}
$n = 0; $bsp = @()
foreach ($z in $ziele) {
  if (-not (Test-Path -LiteralPath $z)) { continue }
  $cur = Join-Path $z '.Current'; $vor = AvStd $cur; $def = AvStd (Join-Path $z '.Default')
  $soll = $(if ($modus -in @('keine', 'usb')) { '' } else { $def })
  if ($null -eq $soll -or (($modus -in @('standard', 'benach')) -and -not $soll)) { continue }
  if ([string]$vor -eq [string]$soll) { continue }
  if (-not (Test-Path -LiteralPath $cur)) { New-Item -Path $cur -Force | Out-Null }
  Set-ItemProperty -LiteralPath $cur -Name '(default)' -Value $soll
  $n++
  if ($bsp.Count -lt 6) { $bsp += ((Split-Path $z -Leaf) + ': ' + $(if ($vor) { [IO.Path]::GetFileName($vor) } else { '(kein Ton)' }) + ' → ' + $(if ($soll) { [IO.Path]::GetFileName($soll) } else { '(kein Ton)' })) }
}
if ($modus -eq 'standard') { Set-ItemProperty -LiteralPath $w -Name '(default)' -Value '.Default' }
elseif ($modus -eq 'keine') { Set-ItemProperty -LiteralPath $w -Name '(default)' -Value '.None' }
elseif ($n) { Set-ItemProperty -LiteralPath $w -Name '(default)' -Value '.Current' }
$schemaNeu = AvStd $w
Zeile ('Klangschema: vorher ' + $(if ($sn[$schemaAlt]) { $sn[$schemaAlt] } else { [string]$schemaAlt }) + ' → jetzt ' + $(if ($sn[$schemaNeu]) { $sn[$schemaNeu] } else { [string]$schemaNeu }))
Zeile ('' + $n + ' Ereignisklänge geändert' + $(if ($n -eq 0) { ' (alles war schon so eingestellt)' } else { '' }))
foreach ($x in $bsp) { Zeile ('  ' + $x) }
Zeile 'Wirkt für neue Töne sofort; die Lautstärke der Systemklänge im Lautstärkemixer bleibt unverändert.'` }),

  A({ id: 'av4-bt-audio', titel: 'Bluetooth-Kopfhörer: absolute Lautstärke bzw. Freisprechprofil ab- oder einschalten', modus: 'system', risiko: 'aendern',
    beschreibung: '„Absolute Lautstärke aus“: Windows regelt die Lautstärke von Bluetooth-Kopfhörern selbst statt sie an den Kopfhörer weiterzugeben – gegen viel zu leise Bluetooth-Kopfhörer, Regler ohne Wirkung und springende Lautstärke (wirkt nach Neustart bzw. neuem Verbinden). „Freisprechprofil aus“: wie „Dienste → Freisprechtelefonie“ abwählen – der Kopfhörer bleibt immer in Stereo-Qualität, sobald Teams, Xelion oder der Browser das Mikrofon öffnen (kein blecherner Ton mehr), als Mikrofon dient dann das Laptop- bzw. Webcam-Mikrofon. „an“ macht es rückgängig. Zeigt vorher/nachher.',
    param: { label: 'Einstellung', platzhalter: BT_OPTIONEN[0], pflicht: true, optionen: BT_OPTIONEN },
    ps: String.raw`
$opt = $P.Trim()
$wahl = switch -Regex ($opt) { '^absolute lautst\S* aus' { 'abs-aus'; break } '^absolute lautst\S* an' { 'abs-an'; break } '^freisprechprofil.* aus' { 'hf-aus'; break } '^freisprechprofil.* an$' { 'hf-an'; break } default { throw ('Unbekannte Auswahl: ' + $opt) } }
if ($wahl -like 'abs-*') {
  $k = 'HKLM:\SYSTEM\CurrentControlSet\Control\Bluetooth\Audio\AVRCP\CT'
  $alt = (Get-ItemProperty -Path $k -Name DisableAbsoluteVolume -EA SilentlyContinue).DisableAbsoluteVolume
  $neu = $(if ($wahl -eq 'abs-aus') { 1 } else { 0 })
  if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
  Set-ItemProperty -Path $k -Name DisableAbsoluteVolume -Value $neu -Type DWord
  $ist = (Get-ItemProperty -Path $k -Name DisableAbsoluteVolume -EA SilentlyContinue).DisableAbsoluteVolume
  Zeile ('Absolute Bluetooth-Lautstärke: vorher ' + $(if ($alt -eq 1) { 'aus (Windows regelt)' } else { 'an (Standard)' }) + ' → jetzt ' + $(if ($ist -eq 1) { 'aus (Windows regelt)' } else { 'an (Standard)' }))
  Zeile 'Wirkt nach einem Neustart des PCs (oder Bluetooth neu starten und den Kopfhörer neu verbinden).'
} else {
  $hf = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { [string]$_.InstanceId -match '^BTHENUM\\\{0000(111E|1108)-0000-1000-8000-00805F9B34FB\}' })
  if (-not $hf.Count) { Zeile 'Kein gekoppelter Bluetooth-Kopfhörer mit Freisprechprofil gefunden (Kopfhörer verbunden? Jabra-Link-Stick zählt nicht – der läuft über USB).' }
  function AvZust($d) { if ([int]$d.ConfigManagerErrorCode -eq 22) { 'abgeschaltet' } elseif ([string]$d.Status -eq 'OK') { 'an' } elseif ([string]$d.Status -eq 'Unknown') { 'an (Kopfhörer gerade nicht verbunden)' } else { 'Fehler ' + [int]$d.ConfigManagerErrorCode } }
  foreach ($d in $hf) {
    $vor = AvZust $d
    try {
      if ($wahl -eq 'hf-aus' -and [int]$d.ConfigManagerErrorCode -ne 22) { Disable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -EA Stop }
      if ($wahl -eq 'hf-an' -and [int]$d.ConfigManagerErrorCode -eq 22) { Enable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -EA Stop }
    } catch { Zeile ('' + $d.FriendlyName + ': nicht möglich – ' + $_.Exception.Message); continue }
    $n = Get-PnpDevice -InstanceId $d.InstanceId -EA SilentlyContinue
    Zeile ('' + $d.FriendlyName + ' (Freisprechen): vorher ' + $vor + ' → jetzt ' + $(if ($n) { AvZust $n } else { '?' }))
  }
  if ($hf.Count -and $wahl -eq 'hf-aus') { Zeile 'Der Kopfhörer spielt jetzt nur noch in Stereo-Qualität. In Teams/Xelion als Mikrofon das Laptop- bzw. Webcam-Mikrofon wählen.' }
  if ($hf.Count -and $wahl -eq 'hf-an') { Zeile 'Das Headset-Mikrofon steht wieder zur Verfügung (in Gesprächen klingt Bluetooth dann in Telefonqualität).' }
}` }),

  // ══ Kamera & Mikrofon ═══════════════════════════════════════════════════════
  A({ id: 'av4-kamera-mikro-details', titel: 'Kamera und Mikrofon im Detail (Treiber, Datenschutz je Benutzer, Richtlinien, wer benutzt sie)', modus: 'system', risiko: 'lesen',
    beschreibung: 'Zeigt alle Kameras (auch IR/Windows-Hello-Kamera und MIPI-Kameras mit Intel-IPU) mit Zustand, Fehlercode, Treiber und Anschluss, Windows-Studio-Effekte/NPU, alle Mikrofone mit Zustand, ob Kamera bzw. Mikrofon im HP-BIOS abgeschaltet sind (nur gelesen), die Dienste Kamera-Frameserver, Windows-Audio und Biometrie, Kamera-/Mikrofon-Sperren per Gruppenrichtlinie oder Intune, die Datenschutz-Schalter des Geräts und jedes angemeldeten Benutzers (auch „Desktop-Apps“) sowie welche Programme Kamera und Mikrofon zuletzt bzw. gerade benutzen. Ändert nichts.',
    ps: String.raw`
function AvProp([string]$id, [string]$key) { try { (Get-PnpDeviceProperty -InstanceId $id -KeyName $key -EA Stop).Data } catch { $null } }
$kam = @(Get-PnpDevice -EA SilentlyContinue | Where-Object { $_.Class -in 'Camera', 'Image' -and [string]$_.FriendlyName -notmatch 'Scanner|Drucker|Printer|Fax|MFP' })
$da = @($kam | Where-Object { [string]$_.Status -ne 'Unknown' })
if (-not $da.Count) { Zeile 'Keine Kamera angeschlossen bzw. erkannt.' }
foreach ($d in $da) {
  $v = AvProp $d.InstanceId 'DEVPKEY_Device_DriverVersion'; $dt = AvProp $d.InstanceId 'DEVPKEY_Device_DriverDate'
  $an = $(if ([string]$d.InstanceId -like 'USB\*') { 'USB' } else { 'intern/MIPI' })
  $ir = $(if ([string]$d.FriendlyName -match '\bIR\b|Infrared|Infrarot') { ' · IR-Kamera (Windows Hello)' } else { '' })
  Zeile ('Kamera: ' + $d.FriendlyName + ' · ' + $(if ([int]$d.ConfigManagerErrorCode -eq 22) { 'DEAKTIVIERT' } elseif ([string]$d.Status -eq 'OK') { 'OK' } else { 'FEHLER Code ' + [int]$d.ConfigManagerErrorCode }) + ' · ' + $an + $ir + ' · Treiber ' + $v + $(if ($dt) { ' vom ' + ([datetime]$dt).ToString('dd.MM.yyyy') } else { '' }))
}
$nicht = @($kam | Where-Object { [string]$_.Status -eq 'Unknown' }).Count
if ($nicht) { Zeile ('' + $nicht + ' früher benutzte Kamera(s) gerade nicht angeschlossen.') }
foreach ($d in @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { [string]$_.FriendlyName -match 'IPU|AVStream|Control Logic|Camera Sensor|Kamerasensor' -and [string]$_.Status -ne 'OK' })) { Zeile ('Kamera-Baustein mit Fehler: ' + $d.FriendlyName + ' (Code ' + [int]$d.ConfigManagerErrorCode + ') → HP-Kameratreiber/Chipsatz installieren') }
$se = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { [string]$_.FriendlyName -match 'Studio Effects' })
$npu = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { $_.Class -eq 'ComputeAccelerator' -or [string]$_.FriendlyName -match '\bNPU\b|AI Boost' })
Zeile ('Windows-Studio-Effekte: ' + $(if ($se.Count) { 'vorhanden (automatischer Bildausschnitt, Blickkontakt, Hintergrund, Stimmfokus)' } else { 'nicht vorhanden' }) + ' · NPU: ' + $(if ($npu.Count) { $npu[0].FriendlyName } else { 'keine' }))
foreach ($m in @(Get-PnpDevice -Class AudioEndpoint -EA SilentlyContinue | Where-Object { [string]$_.InstanceId -like 'SWD\MMDEVAPI\{0.0.1.00000000}*' } | Sort-Object Status, FriendlyName)) { Zeile ('Mikrofon: ' + $m.FriendlyName + ' · ' + $(switch ([string]$m.Status) { 'OK' { 'aktiv' } 'Unknown' { 'nicht angeschlossen' } 'Error' { 'DEAKTIVIERT/FEHLER' } default { [string]$m.Status } })) }
foreach ($x in @(Get-CimInstance -Namespace root\HP\InstrumentedBIOS -ClassName HP_BIOSEnumeration -EA SilentlyContinue | Where-Object { [string]$_.Name -match 'Camera|Microphone|Integrated Audio|Audio Device' })) { $cv = [string]$x.CurrentValue; if (-not $cv) { $cv = (@(([string]$x.Value) -split ',') | Where-Object { $_ -like '[*]*' } | Select-Object -First 1) -replace '^\*', '' }; Zeile ('HP-BIOS (nur gelesen): ' + $x.Name + ' = ' + $cv + $(if ($cv -match 'Disable') { ' → IM BIOS ABGESCHALTET' } else { '' })) }
foreach ($n in 'FrameServer', 'FrameServerMonitor', 'Audiosrv', 'AudioEndpointBuilder', 'WbioSrvc') { $s = Get-Service -Name $n -EA SilentlyContinue; if ($s) { Zeile ('Dienst ' + $s.DisplayName + ': ' + $s.Status + ' (' + $s.StartType + ')') } }
$pol = @(
  @('HKLM:\SOFTWARE\Policies\Microsoft\Camera', 'AllowCamera', 'Kamera (Gruppenrichtlinie)'),
  @('HKLM:\SOFTWARE\Microsoft\PolicyManager\current\device\Camera', 'AllowCamera', 'Kamera (Intune)'),
  @('HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy', 'LetAppsAccessCamera', 'App-Zugriff Kamera (Gruppenrichtlinie)'),
  @('HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy', 'LetAppsAccessMicrophone', 'App-Zugriff Mikrofon (Gruppenrichtlinie)'),
  @('HKLM:\SOFTWARE\Microsoft\PolicyManager\current\device\Privacy', 'LetAppsAccessCamera', 'App-Zugriff Kamera (Intune)'),
  @('HKLM:\SOFTWARE\Microsoft\PolicyManager\current\device\Privacy', 'LetAppsAccessMicrophone', 'App-Zugriff Mikrofon (Intune)')
)
$gef = 0
foreach ($p in $pol) { $wv = (Get-ItemProperty -Path $p[0] -Name $p[1] -EA SilentlyContinue).($p[1]); if ($null -ne $wv) { $gef++; Zeile ('RICHTLINIE ' + $p[2] + ': ' + $(if ($p[1] -eq 'AllowCamera') { if ($wv -eq 0) { 'Kamera VERBOTEN' } else { 'erlaubt' } } else { switch ([int]$wv) { 0 { 'Benutzer entscheidet' } 1 { 'immer erlaubt' } 2 { 'VERBOTEN' } default { '' + $wv } } })) } }
if (-not $gef) { Zeile 'Keine Kamera-/Mikrofon-Richtlinie gesetzt.' }
$cs = 'SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore'
Zeile ('Gerät: Kamera ' + (Get-ItemProperty ('HKLM:\' + $cs + '\webcam') -EA SilentlyContinue).Value + ' · Mikrofon ' + (Get-ItemProperty ('HKLM:\' + $cs + '\microphone') -EA SilentlyContinue).Value)
foreach ($u in @(Get-ChildItem 'Registry::HKEY_USERS' -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^S-1-5-21-[\d-]+$' })) {
  $wer = $u.PSChildName; try { $wer = (New-Object System.Security.Principal.SecurityIdentifier($u.PSChildName)).Translate([System.Security.Principal.NTAccount]).Value } catch {}
  $b = $u.PSPath + '\' + $cs
  $kw = (Get-ItemProperty ($b + '\webcam') -EA SilentlyContinue).Value; $kd = (Get-ItemProperty ($b + '\webcam\NonPackaged') -EA SilentlyContinue).Value
  $mw = (Get-ItemProperty ($b + '\microphone') -EA SilentlyContinue).Value; $md = (Get-ItemProperty ($b + '\microphone\NonPackaged') -EA SilentlyContinue).Value
  Zeile ('Benutzer ' + $wer + ': Kamera ' + $kw + ' (Desktop-Apps ' + $kd + ') · Mikrofon ' + $mw + ' (Desktop-Apps ' + $md + ')' + $(if ('' + $kw + $kd + $mw + $md -match 'Deny') { ' → GESPERRT' } else { '' }))
  foreach ($art in 'webcam', 'microphone') {
    $nutz = @()
    foreach ($a in @(Get-ChildItem ($b + '\' + $art) -EA SilentlyContinue) + @(Get-ChildItem ($b + '\' + $art + '\NonPackaged') -EA SilentlyContinue)) {
      if ($a.PSChildName -eq 'NonPackaged') { continue }
      $p = Get-ItemProperty $a.PSPath -EA SilentlyContinue; if (-not $p.LastUsedTimeStart) { continue }
      $nutz += [pscustomobject]@{ n = ([string]$a.PSChildName -split '#')[-1] -replace '_8wekyb3d8bbwe$', ''; s = [long]$p.LastUsedTimeStart; e = [long]$p.LastUsedTimeStop }
    }
    foreach ($x in @($nutz | Sort-Object s -Descending | Select-Object -First 3)) { Zeile ('  ' + $(if ($art -eq 'webcam') { 'Kamera' } else { 'Mikrofon' }) + ' ' + $(if ($x.e -eq 0) { 'WIRD GERADE BENUTZT von ' } else { 'zuletzt: ' }) + $x.n + ' · ' + ([DateTime]::FromFileTime($x.s)).ToString('dd.MM.yy HH:mm')) }
  }
}` }),
]
