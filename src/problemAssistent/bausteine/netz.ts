// ── Problem-Assistent: Lösungsbausteine Gruppe „netz“ (Runde 3) ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Alles hier wirkt nur auf dem Ziel-PC (Adapter, Treiber-Eigenschaften, WLAN-Profile, Energie-Einstellungen).
// Switches, Access Points, Router, Zscaler-Richtlinien und Gruppenrichtlinien-Profile ändert nichts davon.
// Treiber-Eigenschaften werden mit -NoRestart gesetzt (keine Trennung) — sie wirken beim nächsten
// Neustart des Adapters; sofort geht es mit dem (kritischen, zeitversetzten) „Netzwerkadapter neu starten“.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** WLAN-Profile lesen (nie Kennwörter): Namen, Details eines Profils, aktuell verbundenes Profil, Namensprüfung. */
const WLAN_PS = String.raw`
function WlanProfile { @((& netsh.exe wlan show profiles 2>&1 | Out-String) -split '\r?\n' | Where-Object { $_ -match '^\s+[^:<]+:\s*\S' } | ForEach-Object { ($_ -replace '^[^:]*:\s*', '').Trim() } | Where-Object { $_ } | Select-Object -Unique) }
function WlanDetail([string]$n) {
  $o = @{ Art = ''; Modus = '?'; Mac = '?'; Kosten = '?'; Wechsel = '?'; Auth = '?' }
  $t = (& netsh.exe wlan show profile ('name=' + $n) 2>&1 | Out-String)
  foreach ($z in ($t -split '\r?\n')) {
    if ($z -match 'Schl.sselinhalt|Key Content') { continue }
    if ($z -match '^\s*(Angewendet|Applied)\s*:\s*(.+)$') { $o.Art = $matches[2].Trim() }
    elseif ($z -match '^\s*(Verbindungsmodus|Connection mode)\s*:\s*(.+)$') { $o.Modus = $matches[2].Trim() }
    elseif ($z -match '^\s*(MAC-Randomisierung|MAC Randomization)\s*:\s*(.+)$') { $o.Mac = $matches[2].Trim() }
    elseif ($z -match '^\s*(Kosten|Cost)\s*:\s*(.+)$') { $o.Kosten = $matches[2].Trim() }
    elseif ($z -match '^\s*(Automatisch wechseln|AutoSwitch)\s*:\s*(.+)$') { $o.Wechsel = $matches[2].Trim() }
    elseif ($o.Auth -eq '?' -and $z -match '^\s*(Authentifizierung|Authentication)\s*:\s*(.+)$') { $o.Auth = $matches[2].Trim() }
  }
  $o.Gp = [bool]($o.Art -match 'Gruppenrichtlinie|Group Policy')
  $o
}
function WlanAktuell { $i = (& netsh.exe wlan show interfaces 2>&1 | Out-String); if ($i -match '(?m)^\s*(Profil|Profile)\s*:\s*(.+?)\s*$') { return $matches[2] }; return '' }
function WlanName([string]$p) {
  $t = $p.Trim()
  if (-not $t) { throw 'Bitte den Namen des WLAN-Profils angeben (siehe „WLAN-Status und Profile“).' }
  if ($t -notmatch '^[^"\x00-\x1f]{1,64}$') { throw 'Ungültiger Profilname (keine Anführungszeichen, höchstens 64 Zeichen).' }
  if ($t.Contains('#')) { throw 'Profilnamen mit „#“ kann netsh nicht bearbeiten (alles ab # gilt als Kommentar) — bitte in den WLAN-Einstellungen von Hand ändern.' }
  $l = @(WlanProfile)
  $x = @($l | Where-Object { $_ -ieq $t })
  if (-not $x.Count) { throw ('WLAN-Profil „' + $t + '“ ist auf diesem PC nicht gespeichert. Vorhanden: ' + (($l | Select-Object -First 12) -join ', ')) }
  return [string]$x[0]
}
`

/** Physische LAN- und WLAN-Adapter (ohne Bluetooth-PAN). */
const ADAPTER_PS = String.raw`
function LanAdapter { @(Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object { $_.PhysicalMediaType -match '802\.3' -and $_.InterfaceDescription -notmatch 'Wi-?Fi|Wireless|WLAN|Bluetooth' }) }
function WlanAdapter { @(Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object { $_.PhysicalMediaType -match '802\.11' -or ($_.InterfaceDescription -match 'Wi-?Fi|Wireless|WLAN' -and $_.PhysicalMediaType -notmatch 'Bluetooth') }) }
`

export const AKTIONEN_NETZ: PaAktion[] = [
  // ══ LAN vor WLAN ════════════════════════════════════════════════════════════
  A({ id: 'netz-lan-vor-wlan', titel: 'LAN vor WLAN bevorzugen (Schnittstellenmetrik)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Gibt LAN-Adaptern (eingebaut, Dock, USB-LAN) festen Vorrang vor dem WLAN: Metrik LAN 10, WLAN 50 — Daten laufen dann übers Kabel, solange es steckt. „Automatisch (Standard)“ stellt den Windows-Standard wieder her. Zeigt alte und neue Werte.',
    param: { label: 'Einstellung', platzhalter: 'LAN vor WLAN', pflicht: true, optionen: ['LAN vor WLAN', 'Automatisch (Standard)'] },
    ps: String.raw`
${ADAPTER_PS}
if ($P -notmatch '^(LAN vor WLAN|Automatisch.*)$') { throw 'Bitte „LAN vor WLAN“ oder „Automatisch (Standard)“ wählen.' }
$auto = $P -match '^Automatisch'
$lan = @(LanAdapter); $wl = @(WlanAdapter)
if (-not ($lan.Count + $wl.Count)) { throw 'Keine LAN- oder WLAN-Adapter gefunden.' }
function MetrikSetzen($ad, [int]$wert, [string]$art) {
  foreach ($fam in 'IPv4', 'IPv6') {
    $i = Get-NetIPInterface -InterfaceIndex $ad.ifIndex -AddressFamily $fam -EA SilentlyContinue
    if (-not $i) { continue }
    $alt = $(if ([string]$i.AutomaticMetric -eq 'Enabled') { 'automatisch (' + $i.InterfaceMetric + ')' } else { 'fest ' + $i.InterfaceMetric })
    if ($wert -gt 0) { Set-NetIPInterface -InterfaceIndex $ad.ifIndex -AddressFamily $fam -AutomaticMetric Disabled -InterfaceMetric $wert -EA Stop }
    else { Set-NetIPInterface -InterfaceIndex $ad.ifIndex -AddressFamily $fam -AutomaticMetric Enabled -EA Stop }
    $n = Get-NetIPInterface -InterfaceIndex $ad.ifIndex -AddressFamily $fam -EA SilentlyContinue
    $neu = $(if ([string]$n.AutomaticMetric -eq 'Enabled') { 'automatisch (' + $n.InterfaceMetric + ')' } else { 'fest ' + $n.InterfaceMetric })
    Zeile ($art + ' „' + $ad.Name + '“ ' + $fam + ': vorher ' + $alt + ' → jetzt ' + $neu)
  }
}
$wLan = 10; $wWlan = 50; if ($auto) { $wLan = 0; $wWlan = 0 }
foreach ($a in $lan) { MetrikSetzen $a $wLan 'LAN' }
foreach ($a in $wl) { MetrikSetzen $a $wWlan 'WLAN' }
if ($auto) { Zeile 'Metriken wieder automatisch (Windows wählt nach Geschwindigkeit).' }
else { Zeile 'Kleinere Zahl = Vorrang. Später gesteckte Dock-/USB-LAN-Adapter haben die automatische Metrik (meist 25) und liegen damit ebenfalls vor dem WLAN.' }` }),

  // ══ Funk / Flugzeugmodus ════════════════════════════════════════════════════
  A({ id: 'netz-funk-ein', titel: 'WLAN-Funk einschalten (wie Schnelleinstellungen)', modus: 'benutzer', risiko: 'aendern', timeoutMs: 60000,
    beschreibung: 'Schaltet in der Sitzung des Benutzers das WLAN (wahlweise auch Bluetooth bzw. alle Funkmodule inkl. Mobilfunk) ein — wie der Schalter in den Schnelleinstellungen, auch bei eingeschaltetem Flugzeugmodus. Zeigt vorher/nachher. Per Funktaste oder Schalter gesperrte Module lassen sich nur am Gerät einschalten.',
    param: { label: 'Welche Funkmodule', platzhalter: 'WLAN', optionen: ['WLAN', 'WLAN und Bluetooth', 'Alle Funkmodule'] },
    ps: String.raw`
$w = $P.Trim(); if (-not $w) { $w = 'WLAN' }
if ($w -notin @('WLAN', 'WLAN und Bluetooth', 'Alle Funkmodule')) { throw 'Bitte „WLAN“, „WLAN und Bluetooth“ oder „Alle Funkmodule“ wählen.' }
$arten = @('WiFi'); if ($w -eq 'WLAN und Bluetooth') { $arten = @('WiFi', 'Bluetooth') } elseif ($w -eq 'Alle Funkmodule') { $arten = @('WiFi', 'Bluetooth', 'MobileBroadband') }
$flug = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\RadioManagement\SystemRadioState' -EA SilentlyContinue).'(default)'
Zeile ('Flugzeugmodus: ' + $(if ($flug -eq 1) { 'AN' } elseif ($flug -eq 0) { 'aus' } else { 'unbekannt' }))
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = @([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -match '^IAsyncOperation.1$' })[0]
if (-not $asTask) { throw 'Windows-Laufzeit (WinRT) nicht verfügbar.' }
function WarteRt($op, [Type]$typ) { $tk = $asTask.MakeGenericMethod($typ).Invoke($null, @($op)); if (-not $tk.Wait(15000)) { throw 'Die Funkverwaltung von Windows antwortet nicht.' }; $tk.Result }
function Zustand([string]$s) { switch ($s) { 'On' { 'an' } 'Off' { 'aus' } 'Disabled' { 'gesperrt (Funktaste/Schalter/Geräte-Manager)' } default { $s } } }
[void][Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime]
[void][Windows.Devices.Radios.RadioState, Windows.System.Devices, ContentType = WindowsRuntime]
$zug = WarteRt ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])
if ([string]$zug -ne 'Allowed') { throw ('Windows erlaubt das Umschalten der Funkmodule nicht (' + $zug + ').') }
$radios = @(WarteRt ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]]))
if (-not $radios.Count) { throw 'Keine Funkmodule gefunden — WLAN-Adapter fehlt oder ist im Geräte-Manager deaktiviert.' }
foreach ($ra in $radios) {
  $k = [string]$ra.Kind; $alt = [string]$ra.State
  if ($arten -notcontains $k) { Zeile ('' + $ra.Name + ' (' + $k + '): ' + (Zustand $alt) + ' — nicht angefasst'); continue }
  if ($alt -eq 'On') { Zeile ('' + $ra.Name + ': war schon an'); continue }
  if ($alt -eq 'Disabled') { Zeile ('' + $ra.Name + ': ' + (Zustand $alt) + ' — bitte die Funk-/Flugzeugtaste (z. B. Fn+F12) bzw. den Schalter am Gerät benutzen'); continue }
  $erg = WarteRt ($ra.SetStateAsync([Windows.Devices.Radios.RadioState]::On)) ([Windows.Devices.Radios.RadioAccessStatus])
  Start-Sleep -Milliseconds 800
  Zeile ('' + $ra.Name + ': vorher ' + (Zustand $alt) + ' → jetzt ' + (Zustand ([string]$ra.State)) + $(if ([string]$erg -ne 'Allowed') { ' (' + $erg + ')' } else { '' }))
}
if ($flug -eq 1) { Zeile 'Der Flugzeugmodus bleibt angezeigt, das WLAN funktioniert trotzdem. Ganz ausschalten: Schnelleinstellungen → Flugzeugmodus.' }` }),

  // ══ Adapter- und WLAN-Details (lesend) ══════════════════════════════════════
  A({ id: 'netz-adapter-details', titel: 'Netzwerkkarten im Detail (Treiber, MAC, Energiesparen, WLAN-Fähigkeiten, Profile)', modus: 'system', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Je LAN-/WLAN-Adapter: Treiber mit Datum, MAC-Adresse, ob Windows ihn abschalten darf, Geschwindigkeit/Duplex und Energiesparfunktionen bzw. bevorzugtes Band, Roaming und Sendeleistung. Dazu WLAN-Fähigkeiten (Bänder, WPA3), WLAN-Filter und alle gespeicherten WLAN-Profile mit Modus, Kosten und Zufalls-MAC — nie Kennwörter.',
    ps: String.raw`
${WLAN_PS}
$alle = @(Get-NetAdapter -Physical -EA SilentlyContinue | Sort-Object Name)
if (-not $alle.Count) { Zeile 'Keine physischen Netzwerkadapter gefunden.' }
foreach ($a in $alle) {
  $med = [string]$a.PhysicalMediaType
  if ($med -match '802\.11') { $med = 'WLAN' } elseif ($med -match 'Bluetooth') { $med = 'Bluetooth' } elseif ($med -match '802\.3') { $med = 'LAN' }
  Zeile ('' + $a.Name + ' (' + $med + ', ' + $a.InterfaceDescription + '): ' + $a.Status + $(if ($a.Status -eq 'Up') { ' · ' + $a.LinkSpeed } else { '' }) + ' · MAC ' + $a.MacAddress)
  Zeile ('  Treiber ' + $a.DriverProvider + ' ' + $a.DriverVersionString + ' vom ' + $a.DriverDate)
  if ($med -eq 'Bluetooth') { continue }
  $pm = $null; try { $pm = Get-NetAdapterPowerManagement -Name $a.Name -EA Stop } catch {}
  if ($pm) { $v = [string]$pm.AllowComputerToTurnOffDevice; Zeile ('  Windows darf den Adapter zum Energiesparen abschalten: ' + $(if ($v -eq 'Disabled') { 'nein' } elseif ($v -eq 'Enabled') { 'JA' } else { $v })) }
  if ($med -eq 'WLAN') { $muster = 'Band|Roam|Transmit|Sende|Wireless.?Mode|Funkmodus|WLAN-Modus|802\.11|Channel Width|Kanalbreite|MIMO|Energie|Power Sav|Throughput|Durchsatz|Fat Channel' }
  else { $muster = 'Speed|Duplex|Geschwindigkeit|Energy|Energie|Green|EEE|Gigabit|Power Sav|Spar|Jumbo|Network Address|Netzwerkadresse|Reduce|Idle|Ultra Low' }
  $ap = @(Get-NetAdapterAdvancedProperty -Name $a.Name -EA SilentlyContinue | Where-Object { $_.DisplayName -match $muster -and $_.DisplayName -notmatch 'Wake|WoWLAN|WOL|Aufweck|Reaktiv|Offload' })
  foreach ($e in $ap | Select-Object -First 16) {
    $wert = [string]$e.DisplayValue; if (-not $wert) { $wert = '(leer)' }
    Zeile ('  ' + $e.DisplayName + ': ' + $wert + $(if ($e.RegistryKeyword -eq 'NetworkAddress' -and [string]$e.DisplayValue) { '  ← von Hand gesetzte MAC-Adresse!' } else { '' }))
  }
}
if (@($alle | Where-Object { $_.PhysicalMediaType -match '802\.11' }).Count) {
  $dr = (& netsh.exe wlan show drivers 2>&1 | Out-String)
  if ($dr -match '(?m)^\s*(Unterst.tzte Funktypen|Radio types supported)\s*:\s*(.+?)\s*$') { Zeile ('WLAN-Funktypen: ' + ((@($matches[2] -split '\s+') | Select-Object -Unique) -join ' ')) }
  $bd = @(); if ($dr -match '2[,.]4 GHz') { $bd += '2,4 GHz' }; if ($dr -match '(?<![\d,.])5 GHz') { $bd += '5 GHz' }; if ($dr -match '6 GHz') { $bd += '6 GHz' }
  $pmf = '?'; if ($dr -match '802\.11w[^:\r\n]*:\s*(\S+)') { $pmf = $matches[1] }
  Zeile ('WLAN-Bänder laut Treiber: ' + $(if ($bd.Count) { $bd -join ', ' } else { 'keine Angabe' }) + ' · WPA3: ' + (Ja ($dr -match 'WPA3')) + ' · 802.11w (PMF): ' + $pmf)
  $fi = @((& netsh.exe wlan show filters 2>&1 | Out-String) -split '\r?\n' | Where-Object { $_ -match 'SSID|Berechtigung|Permission|denyall' })
  if ($fi.Count) { Zeile ('WLAN-Filter (Zulassen/Blockieren): ' + $fi.Count); $fi | Select-Object -First 6 | ForEach-Object { Zeile ('  ' + $_.Trim()) } } else { Zeile 'WLAN-Filter: keine' }
  $se = (& netsh.exe wlan show settings 2>&1 | Out-String)
  foreach ($z in @($se -split '\r?\n' | Where-Object { $_ -match 'Nur Gruppenrichtlinienprofile|Only use GP|Zuf.llige MAC|Random(ized)? MAC|MAC random' })) { Zeile ('' + $z.Trim()) }
  $l = @(WlanProfile)
  Zeile ('Gespeicherte WLAN-Profile: ' + $l.Count + ' (Reihenfolge = Vorrang)')
  $nr = 0
  foreach ($n in $l | Select-Object -First 20) {
    $nr++; $d = WlanDetail $n
    Zeile ('  ' + $nr + '. ' + $n + ' · ' + $(if ($d.Gp) { 'Richtlinie' } else { 'lokal' }) + ' · ' + $d.Modus + ' · ' + $d.Auth + ' · Kosten ' + $d.Kosten + ' · Zufalls-MAC ' + $d.Mac)
  }
  if ($l.Count -gt 20) { Zeile ('  … und ' + ($l.Count - 20) + ' weitere') }
}` }),

  // ══ WLAN-Treiber-Eigenschaften ══════════════════════════════════════════════
  A({ id: 'netz-wlan-treiber-einstellen', titel: 'WLAN-Treiber einstellen (bevorzugtes Band, Roaming, Sendeleistung)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Setzt eine Eigenschaft des WLAN-Treibers — nur, wenn der Treiber sie hat (Intel, Realtek, MediaTek, Qualcomm …): bevorzugtes Band, Roaming-Aggressivität oder Sendeleistung. Zeigt alten und neuen Wert. Wirkt ohne Trennung beim nächsten Neustart des WLAN-Adapters bzw. des PCs.',
    param: { label: 'Einstellung', platzhalter: 'Band: 5 GHz bevorzugen', pflicht: true, optionen: ['Band: 5 GHz bevorzugen', 'Band: keine Präferenz', 'Band: 2,4 GHz bevorzugen', 'Roaming: hoch', 'Roaming: mittel', 'Roaming: niedrig', 'Sendeleistung: höchste'] },
    ps: String.raw`
${ADAPTER_PS}
$opt = @('Band: 5 GHz bevorzugen', 'Band: keine Präferenz', 'Band: 2,4 GHz bevorzugen', 'Roaming: hoch', 'Roaming: mittel', 'Roaming: niedrig', 'Sendeleistung: höchste')
$wahl = @($opt | Where-Object { $_ -ieq $P.Trim() })[0]
if (-not $wahl) { throw ('Bitte eine dieser Einstellungen wählen: ' + ($opt -join ' · ')) }
$wl = @(WlanAdapter)
if (-not $wl.Count) { throw 'Kein WLAN-Adapter gefunden.' }
$a = $wl[0]
$ap = @(Get-NetAdapterAdvancedProperty -Name $a.Name -EA SilentlyContinue)
if ($wahl -like 'Band*') { $e = @($ap | Where-Object { $_.DisplayName -match 'Preferred Band|Band Preference|Bevorzugtes Band|Bandpr.ferenz|Bandauswahl' -or $_.RegistryKeyword -match 'PreferBand|PreferredBand|BandPreference|RoamingPreferredBandType' })[0] }
elseif ($wahl -like 'Roaming*') { $e = @($ap | Where-Object { ($_.DisplayName -match 'Roam' -and $_.DisplayName -match 'Aggress|Sensitiv|Empfindlich|Tendenz|Neigung') -or $_.RegistryKeyword -match 'RoamAggressiveness|RoamingSensitiv|ROAMSensitiv|RoamTendency' })[0] }
else { $e = @($ap | Where-Object { $_.DisplayName -match 'Transmit Power|Sendeleistung|TX Power|Tx-Leistung' -or $_.RegistryKeyword -match 'TxPwr|TransmitPower|TxPower' })[0] }
if (-not $e) { throw ('Der WLAN-Treiber (' + $a.InterfaceDescription + ') hat diese Einstellung nicht — nichts geändert. Vorhandene Eigenschaften: „Netzwerkkarten im Detail“.') }
$werte = @($e.ValidDisplayValues)
if (-not $werte.Count) { throw ('„' + $e.DisplayName + '“ hat keine festen Auswahlwerte — nichts geändert.') }
function Kern([string]$v) { ($v -replace '^\s*\d+\.\s*', '').Trim() }
$ziel = $null
switch ($wahl) {
  'Band: 5 GHz bevorzugen' { $ziel = @($werte | Where-Object { $_ -match '(^|[^\d.,])5\s*-?\s*G' })[0] }
  'Band: 2,4 GHz bevorzugen' { $ziel = @($werte | Where-Object { $_ -match '2[.,]4\s*-?\s*G' })[0] }
  'Band: keine Präferenz' { $ziel = @($werte | Where-Object { $_ -match 'No Pref|Keine|Kein|None|Auto|Ohne' })[0] }
  'Roaming: hoch' { $ziel = @($werte | Where-Object { (Kern $_) -match '^(Medium[- ]?High|Mittel[- ]?hoch|Mid[- ]?High)$' })[0]; if (-not $ziel) { $ziel = @($werte | Where-Object { (Kern $_) -match '^(High|Hoch)$' })[0] } }
  'Roaming: mittel' { $ziel = @($werte | Where-Object { (Kern $_) -match '^(Medium|Mittel|Middle|Mid|Default|Standard)$' })[0] }
  'Roaming: niedrig' { $ziel = @($werte | Where-Object { (Kern $_) -match '^(Medium[- ]?Low|Mittel[- ]?niedrig|Mid[- ]?Low)$' })[0]; if (-not $ziel) { $ziel = @($werte | Where-Object { (Kern $_) -match '^(Low|Niedrig)$' })[0] } }
  'Sendeleistung: höchste' { $ziel = @($werte | Where-Object { (Kern $_) -match '^(Highest|H.chste|H.chster Wert|Maximum|Max|100\s*%?)$' })[0] }
}
if (-not $ziel) { throw ('Passender Wert nicht gefunden — „' + $e.DisplayName + '“ kennt nur: ' + ($werte -join ' | ')) }
$alt = [string]$e.DisplayValue
if ($alt -eq $ziel) { Zeile ('' + $e.DisplayName + ': war schon „' + $alt + '“ — nichts geändert.') }
else {
  $e | Set-NetAdapterAdvancedProperty -DisplayValue $ziel -NoRestart -EA Stop
  $neu = [string](Get-NetAdapterAdvancedProperty -Name $a.Name -EA SilentlyContinue | Where-Object { $_.RegistryKeyword -eq $e.RegistryKeyword } | Select-Object -First 1).DisplayValue
  Zeile ('' + $e.DisplayName + ' (' + $a.InterfaceDescription + '): vorher „' + $alt + '“ → jetzt „' + $neu + '“')
  Zeile 'Wirkt beim nächsten Neustart des WLAN-Adapters bzw. des PCs (sofort: „Netzwerkadapter neu starten“ → WLAN).'
}` }),

  // ══ Erreichbarkeit eines Dienstes (lesend) ══════════════════════════════════
  A({ id: 'netz-port-test', titel: 'Erreichbarkeit von Server und Port testen (Name, Ping, Port, Weg)', modus: 'system', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Prüft vom Ziel-PC aus für jedes Ziel „Name:Port“: Namensauflösung (mit Dauer), Ping, ob der Port antwortet (offen / abgelehnt / gesperrt) und über welchen Adapter der Weg geht. Leer = Standardziele (Domäne, w3172, Microsoft-Anmeldung). Zeigt, ob ein Programm am PC oder an einer gesperrten Verbindung im Netz scheitert.',
    param: { label: 'Ziel(e) Name:Port', platzhalter: 'z. B. w3172:445 sqlserver:1433 (leer = Standardziele)', vorlagen: ['login.microsoftonline.com:443', 'w3172:445', 'smtp.office365.com:587', 'teams.microsoft.com:443'] },
    ps: String.raw`
$roh = $P.Trim()
if (-not $roh) {
  $l = @('w3172:445', 'login.microsoftonline.com:443')
  try { $cs = Get-CimInstance Win32_ComputerSystem -EA Stop; if ($cs.PartOfDomain) { $l = @(([string]$cs.Domain + ':389')) + $l } } catch {}
  $ziele = $l
} else { $ziele = @($roh -split '[\s,;]+' | Where-Object { $_ }) }
if ($ziele.Count -gt 6) { throw 'Höchstens 6 Ziele auf einmal.' }
foreach ($z in $ziele) {
  if ($z -notmatch '^([A-Za-z0-9][A-Za-z0-9.\-]{0,252})(:(\d{1,5}))?$') { throw ('Ungültiges Ziel „' + $z + '“ — Format Name:Port, z. B. w3172:445 (ohne Port nur Name und Ping)') }
  if ($matches[3]) { $port = [int]$matches[3]; if ($port -lt 1 -or $port -gt 65535) { throw ('Port ' + $port + ' ist ungültig (1–65535).') } }
}
foreach ($z in $ziele) {
  $null = $z -match '^([^:]+)(:(\d+))?$'; $h = $matches[1]; $port = 0; if ($matches[3]) { $port = [int]$matches[3] }
  $t0 = Get-Date; $ips = @()
  try { $ips = @([System.Net.Dns]::GetHostAddresses($h) | ForEach-Object { $_.IPAddressToString }) } catch {}
  $dnsMs = [int]((Get-Date) - $t0).TotalMilliseconds
  if (-not $ips.Count) { Zeile ('' + $z + ': Name NICHT auflösbar (nach ' + $dnsMs + ' ms)'); continue }
  $ip4 = @($ips | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' })
  $ip = $(if ($ip4.Count) { $ip4[0] } else { $ips[0] })
  $weg = ''
  try { $rt = @(Find-NetRoute -RemoteIPAddress $ip -EA Stop | Where-Object { $_.InterfaceAlias -and $_.IPAddress })[0]; if ($rt) { $weg = ' · Weg über ' + $rt.InterfaceAlias + ' (' + $rt.IPAddress + ')' } } catch {}
  $ping = $false; try { $ping = [bool](Test-Connection -ComputerName $ip -Count 1 -Quiet -EA SilentlyContinue) } catch {}
  $portTxt = ''
  if ($port) {
    $offen = $false; $grund = ''
    $c = New-Object System.Net.Sockets.TcpClient
    $t1 = Get-Date
    try { $tk = $c.ConnectAsync($ip, $port); if ($tk.Wait(4000)) { $offen = $c.Connected } else { $grund = 'keine Antwort in 4 s (gesperrt/gefiltert)' } }
    catch { $m = [string]$_.Exception.InnerException.InnerException.Message; if (-not $m) { $m = [string]$_.Exception.Message }; if ($m -match 'verweigert|refused|actively') { $grund = 'abgelehnt (Dienst läuft nicht oder Port zu)' } else { $grund = $m } }
    $ms = [int]((Get-Date) - $t1).TotalMilliseconds
    try { $c.Close() } catch {}
    $portTxt = ' · Port ' + $port + ': ' + $(if ($offen) { 'OFFEN (' + $ms + ' ms)' } else { 'ZU — ' + $grund })
  }
  Zeile ('' + $z + ' → ' + $ip + $(if ($ips.Count -gt 1) { ' (+' + ($ips.Count - 1) + ' weitere)' } else { '' }) + ' · DNS ' + $dnsMs + ' ms · Ping ' + $(if ($ping) { 'ja' } else { 'nein' }) + $portTxt + $weg)
}
Zeile 'Ping „nein“ allein ist kein Fehler (viele Server/Firewalls antworten nicht). Entscheidend ist der Port.'` }),

  // ══ WLAN-Profile ════════════════════════════════════════════════════════════
  A({ id: 'netz-wlan-profil-bevorzugen', titel: 'WLAN-Profil automatisch und zuerst verbinden', modus: 'system', risiko: 'aendern',
    beschreibung: 'Stellt ein gespeichertes WLAN-Profil auf „automatisch verbinden“ und setzt es in der Reihenfolge an die erste Stelle (vor Hotspot, Gast- oder Nachbarnetz). Zeigt Modus und Position vorher/nachher. Profile aus der Gruppenrichtlinie (SKF-Corp) sind schreibgeschützt und haben ohnehin Vorrang.',
    param: { label: 'WLAN-Profil', platzhalter: 'exakter Profilname, z. B. FRITZ!Box 7590 5G', pflicht: true, vorlagen: ['SKF-Corp'] },
    ps: String.raw`
${WLAN_PS}
${ADAPTER_PS}
$n = WlanName $P
$d = WlanDetail $n
$l = @(WlanProfile)
$pos = [array]::IndexOf([string[]]$l, $n) + 1
Zeile ('Profil „' + $n + '“ (' + $d.Art + '): Verbindungsmodus vorher ' + $d.Modus + ' · Position vorher ' + $pos + ' von ' + $l.Count)
if ($d.Gp) { Zeile 'Das Profil kommt per Gruppenrichtlinie (schreibgeschützt): Modus und Reihenfolge legt die Richtlinie fest, Richtlinien-Profile haben immer Vorrang. Ggf. „Gruppenrichtlinien neu anwenden“.' }
else {
  $o1 = (& netsh.exe wlan set profileparameter ('name=' + $n) 'connectionmode=auto' 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw ('netsh (automatisch verbinden): ' + $o1) }
  foreach ($ad in WlanAdapter) {
    $o2 = (& netsh.exe wlan set profileorder ('name=' + $n) ('interface=' + $ad.Name) 'priority=1' 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { Zeile ('Reihenfolge an „' + $ad.Name + '“ nicht geändert: ' + $o2) }
  }
  $d2 = WlanDetail $n
  $l2 = @(WlanProfile)
  $pos2 = [array]::IndexOf([string[]]$l2, $n) + 1
  Zeile ('Verbindungsmodus jetzt ' + $d2.Modus + ' · Position jetzt ' + $pos2 + ' (Richtlinien-Profile stehen immer davor)')
}` }),
  A({ id: 'netz-wlan-getaktet', titel: 'WLAN als getaktete Verbindung ein-/ausschalten', modus: 'system', risiko: 'aendern',
    beschreibung: '„aus“: Updates, OneDrive und Store laden wieder normal (z. B. Heim- oder Firmennetz versehentlich getaktet). „ein“: spart Datenvolumen bei Handy-Hotspot, Mobilfunk- oder Satelliten-Internet. Ohne Profilnamen gilt es für das gerade verbundene WLAN. Zeigt vorher/nachher.',
    param: { label: 'aus oder ein (optional „Profil: aus“)', platzhalter: 'aus', pflicht: true, vorlagen: ['aus', 'ein'] },
    ps: String.raw`
${WLAN_PS}
if ($P.Trim() -notmatch '^(?:(.+?)\s*[:=]\s*)?(ein|an|aus)$') { throw 'Bitte „aus“ oder „ein“ angeben — optional mit Profil davor, z. B. „FRITZ!Box 7590: aus“.' }
$prof = [string]$matches[1]; $modus = [string]$matches[2]
$soll = 'unrestricted'; if ($modus -ne 'aus') { $soll = 'fixed' }
if (-not $prof) { $prof = WlanAktuell; if (-not $prof) { throw 'Gerade ist kein WLAN verbunden (oder Windows gibt den Namen nicht heraus) — bitte das Profil angeben, z. B. „iPhone von Max: ein“.' } }
$n = WlanName $prof
$d = WlanDetail $n
if ($d.Gp) { throw ('„' + $n + '“ kommt per Gruppenrichtlinie (schreibgeschützt) — die Einstellung legt die IT zentral fest.') }
$o = (& netsh.exe wlan set profileparameter ('name=' + $n) ('cost=' + $soll) 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw ('netsh: ' + $o) }
$d2 = WlanDetail $n
Zeile ('Profil „' + $n + '“: Kosten vorher ' + $d.Kosten + ' → jetzt ' + $d2.Kosten + $(if ($soll -eq 'fixed') { ' (getaktet: Updates/OneDrive/Store halten sich zurück)' } else { ' (nicht getaktet)' }))` }),
  A({ id: 'netz-wlan-zufalls-mac-aus', titel: 'Zufällige Hardwareadresse für ein WLAN abschalten', modus: 'system', risiko: 'aendern',
    beschreibung: 'Schaltet „Zufällige Hardwareadressen“ für ein gespeichertes WLAN-Profil ab — der Laptop meldet sich dort wieder mit seiner festen MAC-Adresse (MAC-Filter am Heimrouter, Freischaltung beim Kunden, Hotel-Anmeldung, die jeden Tag neu verlangt wird). Zeigt vorher/nachher und die feste MAC-Adresse.',
    param: { label: 'WLAN-Profil', platzhalter: 'exakter Profilname', pflicht: true },
    ps: String.raw`
${WLAN_PS}
${ADAPTER_PS}
$n = WlanName $P
$d = WlanDetail $n
if ($d.Gp) { throw ('„' + $n + '“ kommt per Gruppenrichtlinie (schreibgeschützt) — die Einstellung legt die IT zentral fest.') }
$o = (& netsh.exe wlan set profileparameter ('name=' + $n) 'randomization=no' 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw ('netsh: ' + $o) }
$d2 = WlanDetail $n
Zeile ('Profil „' + $n + '“: zufällige Hardwareadresse vorher ' + $d.Mac + ' → jetzt ' + $d2.Mac)
$mac = [string](WlanAdapter | Select-Object -First 1).MacAddress
Zeile ('Feste MAC-Adresse des WLAN-Adapters (für Router-/Kundenfreigabe): ' + $mac + ' — gilt ab der nächsten Verbindung mit diesem Netz.')` }),

  // ══ IP-Ebene ════════════════════════════════════════════════════════════════
  A({ id: 'netz-ipv4-bevorzugen', titel: 'IPv4 vor IPv6 bevorzugen', modus: 'system', risiko: 'aendern',
    beschreibung: 'Setzt die von Microsoft vorgesehene Einstellung „IPv4 vor IPv6“ (DisabledComponents Bit 0x20) — IPv6 bleibt an, wird aber nachrangig benutzt. Hilft bei gestörtem IPv6 (Verzögerungen, alte Fachprogramme, fremder IPv6-Router). „Standard“ stellt es zurück. Wirkt nach einem Neustart.',
    param: { label: 'Einstellung', platzhalter: 'IPv4 bevorzugen', pflicht: true, optionen: ['IPv4 bevorzugen', 'Standard (IPv6 bevorzugt)'] },
    ps: String.raw`
if ($P -notin @('IPv4 bevorzugen', 'Standard (IPv6 bevorzugt)')) { throw 'Bitte „IPv4 bevorzugen“ oder „Standard (IPv6 bevorzugt)“ wählen.' }
$k = 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters'
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
$roh = (Get-ItemProperty $k -Name DisabledComponents -EA SilentlyContinue).DisabledComponents
$alt = [int64]0; if ($null -ne $roh) { $alt = [int64]$roh; if ($alt -lt 0) { $alt += 4294967296 } }
if (($alt -band 255) -eq 255) { Zeile 'Achtung: IPv6 ist auf diesem PC ganz abgeschaltet (0xFF) — von Microsoft nicht empfohlen.' }
if ($P -eq 'IPv4 bevorzugen') { $neu = $alt -bor 32 } else { $neu = $alt -band (-bnot [int64]32) }
$altTxt = $(if ($null -eq $roh) { 'nicht gesetzt' } else { '0x{0:X2}' -f $alt })
if ($neu -eq $alt) { Zeile ('War schon so eingestellt (DisabledComponents ' + $altTxt + ') — nichts geändert.') }
else {
  $schreib = $neu; if ($schreib -gt 2147483647) { $schreib -= 4294967296 }
  Set-ItemProperty -Path $k -Name DisabledComponents -Value ([int]$schreib) -Type DWord
  Zeile ('DisabledComponents: vorher ' + $altTxt + ' → jetzt ' + ('0x{0:X2}' -f $neu) + $(if ($P -eq 'IPv4 bevorzugen') { ' (IPv4 vor IPv6)' } else { ' (Windows-Standard: IPv6 vor IPv4)' }))
  Zeile 'Wirkt erst nach einem Neustart des PCs.'
}` }),
  A({ id: 'netz-mtu-setzen', titel: 'MTU (Paketgröße) eines Adapters setzen oder messen', modus: 'system', risiko: 'aendern', timeoutMs: 120000,
    beschreibung: 'Setzt die MTU des LAN- oder WLAN-Adapters auf einen Wert von 1280 bis 1500 (Standard 1500). „auto“ misst per Ping ohne Zerlegung, welche Paketgröße nach außen durchkommt, und setzt diesen Wert. Zeigt alten und neuen Wert; trennt die Verbindung nicht.',
    param: { label: 'Adapter und MTU', platzhalter: 'z. B. WLAN 1400, LAN 1500 oder WLAN auto', pflicht: true, vorlagen: ['WLAN auto', 'LAN auto', 'WLAN 1500', 'LAN 1500', 'WLAN 1400'] },
    ps: String.raw`
${ADAPTER_PS}
if ($P -notmatch '^\s*(WLAN|LAN)\s*[:=]?\s*(auto|\d{3,4})\s*$') { throw 'Bitte so angeben: „WLAN 1400“, „LAN 1500“ oder „WLAN auto“ (Werte 1280–1500).' }
$typ = $matches[1].ToUpper(); $wunsch = $matches[2].ToLower()
if ($wunsch -ne 'auto') { $mtu = [int]$wunsch; if ($mtu -lt 1280 -or $mtu -gt 1500) { throw 'Nur Werte von 1280 bis 1500 sind erlaubt.' } }
$ad = @($(if ($typ -eq 'WLAN') { WlanAdapter } else { LanAdapter }) | Sort-Object @{ Expression = { $_.Status -ne 'Up' } })
if (-not $ad.Count) { throw ('Kein ' + $typ + '-Adapter gefunden.') }
$a = $ad[0]
$i4 = Get-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -EA Stop
$i6 = Get-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv6 -EA SilentlyContinue
$alt4 = [int]$i4.NlMtu; $alt6 = 0; if ($i6) { $alt6 = [int]$i6.NlMtu }
function DfOk([string]$zi, [int]$gr) { $o = (& ping.exe -n 1 -w 1500 -f -l $gr $zi 2>&1 | Out-String); return ($o -match 'TTL=') }
$mz = $null; foreach ($z in '1.1.1.1', '8.8.8.8') { if (DfOk $z 64) { $mz = $z; break } }
if ($wunsch -eq 'auto') {
  if (-not $mz) { throw 'Messung nicht möglich (Ping nach außen wird nicht beantwortet, z. B. im Firmennetz) — bitte einen Wert angeben, z. B. „WLAN 1400“.' }
  if ($alt4 -lt 1500) { Set-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -NlMtuBytes 1500 -EA Stop }
  $lo = 1172; $hi = 1472
  if (DfOk $mz $hi) { $gem = 1500 } else { while (($hi - $lo) -gt 1) { $m = [int][math]::Floor(($lo + $hi) / 2); if (DfOk $mz $m) { $lo = $m } else { $hi = $m } }; $gem = $lo + 28 }
  Zeile ('Gemessen: größte Paketgröße ohne Zerlegung zu ' + $mz + ' = ' + $gem + ' Bytes')
  $mtu = [int][math]::Min([double]1500, [math]::Max([double]1280, [double]$gem))
}
Set-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -NlMtuBytes $mtu -EA Stop
if ($alt6 -gt $mtu) { try { Set-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv6 -NlMtuBytes $mtu -EA Stop } catch {} }
$neu4 = [int](Get-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -EA SilentlyContinue).NlMtu
$neu6 = 0; if ($i6) { $neu6 = [int](Get-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv6 -EA SilentlyContinue).NlMtu }
Zeile ($typ + ' „' + $a.Name + '“: MTU vorher ' + $alt4 + $(if ($alt6) { ' (IPv6 ' + $alt6 + ')' } else { '' }) + ' → jetzt ' + $neu4 + $(if ($neu6) { ' (IPv6 ' + $neu6 + ')' } else { '' }))
if ($mz) { Zeile ('Gegenprobe mit ' + $mtu + ' Bytes zu ' + $mz + ': ' + $(if (DfOk $mz ($mtu - 28)) { 'kommt durch' } else { 'kommt NICHT durch — kleineren Wert versuchen' })) }` }),

  // ══ Energie ═════════════════════════════════════════════════════════════════
  A({ id: 'netz-standby-verbunden', titel: 'Netzwerk im Standby verbunden lassen (Modern Standby)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Energieeinstellung „Netzwerkverbindung im Standbymodus“ auf Geräten mit Modern Standby (S0): „Verbunden lassen“ hält LAN/WLAN im Standby und bei gesperrtem/ausgeschaltetem Bildschirm am Netzteil und im Akkubetrieb aktiv (Downloads, Teams, Fernwartung, schnelles Wiederverbinden). „Standard“: am Netzteil verbunden, im Akku von Windows verwaltet. Zeigt vorher/nachher.',
    param: { label: 'Einstellung', platzhalter: 'Verbunden lassen', pflicht: true, optionen: ['Verbunden lassen', 'Standard (Windows verwaltet)'] },
    ps: String.raw`
if ($P -notin @('Verbunden lassen', 'Standard (Windows verwaltet)')) { throw 'Bitte „Verbunden lassen“ oder „Standard (Windows verwaltet)“ wählen.' }
$sub = 'fea3413e-7e05-4911-9a71-700331f1c294'; $set = 'f15576e8-98b7-4186-b944-eafa664402d9'
function WertLesen([string]$t, [string]$mu) { if ($t -match ('(?:' + $mu + ')\s*:\s*0x([0-9a-fA-F]+)')) { return [Convert]::ToInt32($matches[1], 16) }; return -1 }
function Txt([int]$v) { switch ($v) { 0 { 'getrennt' } 1 { 'verbunden' } 2 { 'von Windows verwaltet' } default { 'unbekannt' } } }
$q = (& powercfg.exe /qh SCHEME_CURRENT $sub $set 2>&1 | Out-String)
$ac = WertLesen $q 'Wechselstromeinstellung|AC Power Setting Index'
$dc = WertLesen $q 'Gleichstromeinstellung|DC Power Setting Index'
if ($ac -lt 0 -and $dc -lt 0) { throw 'Diese Energieeinstellung gibt es auf diesem PC nicht — kein Modern Standby (S0); im klassischen Standby (S3) ist das Netz immer getrennt.' }
if (Test-Path ('HKLM:\SOFTWARE\Policies\Microsoft\Power\PowerSettings\' + $set)) { Zeile 'Achtung: Eine Richtlinie legt diese Einstellung fest und kann die Änderung wieder überschreiben.' }
$nAc = 1; $nDc = 2; if ($P -eq 'Verbunden lassen') { $nDc = 1 }
& powercfg.exe /setacvalueindex SCHEME_CURRENT $sub $set $nAc 2>&1 | Out-Null
& powercfg.exe /setdcvalueindex SCHEME_CURRENT $sub $set $nDc 2>&1 | Out-Null
& powercfg.exe /setactive SCHEME_CURRENT 2>&1 | Out-Null
$q2 = (& powercfg.exe /qh SCHEME_CURRENT $sub $set 2>&1 | Out-String)
Zeile ('Netzwerk im Standby am Netzteil: vorher ' + (Txt $ac) + ' → jetzt ' + (Txt (WertLesen $q2 'Wechselstromeinstellung|AC Power Setting Index')))
Zeile ('Netzwerk im Standby im Akkubetrieb: vorher ' + (Txt $dc) + ' → jetzt ' + (Txt (WertLesen $q2 'Gleichstromeinstellung|DC Power Setting Index')))
if ((& powercfg.exe /a 2>&1 | Out-String) -notmatch 'S0') { Zeile 'Hinweis: powercfg meldet keinen Modern Standby (S0) — die Einstellung wirkt nur auf Geräten mit S0.' }` }),
  A({ id: 'netz-lan-volle-leistung', titel: 'LAN-Adapter auf volle Leistung (Energiesparen aus, Geschwindigkeit automatisch)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Für jeden LAN-Adapter (eingebaut, Dock, USB-LAN): Windows darf ihn nicht mehr abschalten; Energiesparfunktionen des Treibers aus (Energy-Efficient Ethernet, Green Ethernet, Gigabit im Akkubetrieb abschalten, Power Saving …); fest eingestellte Geschwindigkeit/Duplex zurück auf automatisch. Zeigt vorher/nachher; wirkt ohne Trennung beim nächsten Adapter-Neustart.',
    ps: String.raw`
${ADAPTER_PS}
$lan = @(LanAdapter)
if (-not $lan.Count) { throw 'Kein LAN-Adapter gefunden (Dock bzw. USB-LAN-Adapter eingesteckt?).' }
$kw = '^(\*EEE|EEELinkAdvertisement|AdvancedEEE|EnableGreenEthernet|GigaLite|PowerSavingMode|AutoDisableGigabit|ReduceSpeedOnPowerDown|SipsEnabled|ULPMode|AutoPowerSaveModeEnabled|EnablePowerManagement)$'
$dn = 'Energy.?Efficient|Energieeffizient|Green Ethernet|Gr.nes Ethernet|Power Saving|Energiespar|Gigabit Lite|Auto Disable Gigabit|Reduce Speed|Geschwindigkeit.*reduz|Ultra Low Power|Idle Power|Link Speed Battery'
foreach ($a in $lan) {
  $n = 0
  Zeile ('' + $a.Name + ' (' + $a.InterfaceDescription + '): ' + $a.Status + $(if ($a.Status -eq 'Up') { ' · ' + $a.LinkSpeed } else { '' }))
  try {
    $pm = Get-NetAdapterPowerManagement -Name $a.Name -EA Stop; $alt = [string]$pm.AllowComputerToTurnOffDevice
    if ($alt -eq 'Enabled') { Set-NetAdapterPowerManagement -Name $a.Name -AllowComputerToTurnOffDevice Disabled -NoRestart -EA Stop; Zeile '  Windows darf den Adapter abschalten: vorher ja → jetzt nein'; $n++ }
    else { Zeile ('  Windows darf den Adapter abschalten: ' + $(if ($alt -eq 'Disabled') { 'war schon nein' } else { $alt })) }
  } catch { Zeile ('  Energieverwaltung nicht änderbar (' + $_.Exception.Message + ')') }
  foreach ($e in @(Get-NetAdapterAdvancedProperty -Name $a.Name -EA SilentlyContinue | Where-Object { ($_.RegistryKeyword -match $kw -or $_.DisplayName -match $dn) -and $_.DisplayName -notmatch 'Wake|WOL|Aufweck|Reaktiv' })) {
    $aus = @($e.ValidDisplayValues | Where-Object { $_ -match '^(Disabled|Deaktiviert|Deaktivieren|Disable|Off|Aus)$' })[0]
    if (-not $aus) { Zeile ('  ' + $e.DisplayName + ': ' + $e.DisplayValue + ' (kein Aus-Wert — unverändert)'); continue }
    if ([string]$e.DisplayValue -eq $aus) { Zeile ('  ' + $e.DisplayName + ': war schon ' + $aus); continue }
    $vorher = [string]$e.DisplayValue
    $e | Set-NetAdapterAdvancedProperty -DisplayValue $aus -NoRestart -EA Stop
    Zeile ('  ' + $e.DisplayName + ': vorher ' + $vorher + ' → jetzt ' + $aus); $n++
  }
  $sd = @(Get-NetAdapterAdvancedProperty -Name $a.Name -EA SilentlyContinue | Where-Object { $_.RegistryKeyword -eq '*SpeedDuplex' })[0]
  if ($sd) {
    $autoW = @($sd.ValidDisplayValues | Where-Object { $_ -match 'Auto' })[0]
    if ($autoW -and [string]$sd.DisplayValue -ne $autoW) { $vorher = [string]$sd.DisplayValue; $sd | Set-NetAdapterAdvancedProperty -DisplayValue $autoW -NoRestart -EA Stop; Zeile ('  ' + $sd.DisplayName + ': vorher ' + $vorher + ' (fest eingestellt) → jetzt ' + $autoW); $n++ }
    else { Zeile ('  ' + $sd.DisplayName + ': ' + $sd.DisplayValue) }
  }
  if ($n) { Zeile ('  ' + $n + ' Änderung(en) — wirken beim nächsten Neustart des Adapters (PC-Neustart, Ab-/Andocken oder „Netzwerkadapter neu starten“ → LAN).') } else { Zeile '  Nichts zu ändern.' }
}` }),
]
