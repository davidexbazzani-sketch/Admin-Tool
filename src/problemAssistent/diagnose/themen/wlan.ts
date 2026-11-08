// ── Diagnose-Thema „WLAN“ ────────────────────────────────────────────────────
// Sonde wl = WLAN-Adapter, Verbindung (Signal, Band, Rate), Profile, Dienste, Treiber, Ereignisse,
// Energiesparen, Antwortzeiten zum Router, Computerzertifikat. Alles NUR LESEND.
import { ja, nein, num, txt, zahl } from '../motor'
import type { DgFakten, DgOber, DgSonde } from '../types'

const da = (f: DgFakten, k: string): boolean => f[k] !== null && f[k] !== undefined && f[k] !== ''

export const SONDEN_WLAN: DgSonde[] = [
  {
    id: 'wl', titel: 'WLAN (Adapter, Verbindung, Signal, Profile, Treiber, Abbrüche)', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
function ZahlWl([string]$t) { if ($t -match '(-?\d+(?:[\.,]\d+)?)') { return [double]::Parse(($Matches[1] -replace ',', '.'), [Globalization.CultureInfo]::InvariantCulture) } else { return $null } }
$cs = Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue
Fakt 'domaenePc' ([bool]($cs -and $cs.PartOfDomain))
$phys = @(Get-NetAdapter -Physical -EA SilentlyContinue)
$wa = @($phys | Where-Object { ([string]$_.PhysicalMediaType -match '802\.11|Wireless' -or [string]$_.InterfaceDescription -match '(?i)Wi-?Fi|Wireless|WLAN|802\.11') -and [string]$_.InterfaceDescription -notmatch '(?i)Bluetooth|Mobile Broadband|WWAN' })
$waUp = @($wa | Where-Object { $_.Status -eq 'Up' })
$haupt = $null; if ($waUp.Count) { $haupt = $waUp[0] } elseif ($wa.Count) { $haupt = $wa[0] }
Fakt 'adapterVorhanden' ($wa.Count -gt 0); Fakt 'adapterStatus' $(if ($haupt) { [string]$haupt.Status } else { $null })
Fakt 'adapterDeaktiviert' (@($wa | Where-Object { [string]$_.Status -eq 'Disabled' }).Count -gt 0 -and -not $waUp.Count)
Fakt 'mehrereAdapter' (@($wa | Where-Object { [string]$_.Status -ne 'Disabled' }).Count -gt 1)
$usb = $false; if ($haupt) { $usb = ([string]$haupt.PnPDeviceID -match '^USB') }
Fakt 'usbStick' $usb
$gf = @(Get-CimInstance Win32_PnPEntity -Filter "PNPClass='Net' AND ConfigManagerErrorCode<>0" -EA SilentlyContinue | Where-Object { $_.ConfigManagerErrorCode -ne 22 -and $_.ConfigManagerErrorCode -ne 45 -and [string]$_.Name -match '(?i)Wi-?Fi|Wireless|WLAN|802\.11' })
Fakt 'geraeteFehler' @($gf | ForEach-Object { [string]$_.Name + ' (Code ' + $_.ConfigManagerErrorCode + ')' })
if (-not $wa.Count) { Punkt 'WLAN-Adapter' 'fehler' $(if ($gf.Count) { 'nur mit Fehler im Geräte-Manager: ' + [string]$gf[0].Name + ' (Code ' + $gf[0].ConfigManagerErrorCode + ')' } else { 'kein WLAN-Adapter vorhanden' }) }
else { Punkt 'WLAN-Adapter' $(if ($waUp.Count) { 'ok' } elseif ([string]$haupt.Status -eq 'Disabled') { 'fehler' } else { 'warn' }) ([string]$haupt.InterfaceDescription + ': ' + [string]$haupt.Status + $(if ($usb) { ' (USB-Stick)' } else { '' })) }
$tAlter = $null
if ($haupt) {
  Fakt 'treiberVersion' ([string]$haupt.DriverVersion)
  try { $tAlter = [int]((Get-Date) - [datetime]::ParseExact([string]$haupt.DriverDate, 'yyyy-MM-dd', $null)).TotalDays } catch {}
  Punkt 'WLAN-Treiber' $(if ($tAlter -gt 1095) { 'warn' } else { 'ok' }) ('Version ' + [string]$haupt.DriverVersion + ' vom ' + [string]$haupt.DriverDate + $(if ($tAlter -gt 1095) { ' – älter als 3 Jahre' } else { '' }))
}
Fakt 'treiberAlterTage' $tAlter
$ws = Get-Service -Name 'WlanSvc' -EA SilentlyContinue
Fakt 'dienst' $(if ($ws) { [string]$ws.Status } else { $null }); Fakt 'dienstStart' $(if ($ws) { [string]$ws.StartType } else { $null })
Punkt 'Dienst „Automatische WLAN-Konfiguration“' $(if (-not $ws) { 'fehler' } elseif ($ws.Status -eq 'Running') { 'ok' } else { 'fehler' }) $(if ($ws) { [string]$ws.Status + ' (' + [string]$ws.StartType + ')' } else { 'nicht vorhanden' })
$eh = Get-Service -Name 'EapHost' -EA SilentlyContinue
Fakt 'eaphostStart' $(if ($eh) { [string]$eh.StartType } else { $null })
if ($eh -and [string]$eh.StartType -eq 'Disabled') { Punkt 'Dienst „Extensible Authentication Protocol“' 'fehler' 'deaktiviert – keine Anmeldung am Firmen-WLAN möglich' }
$rs = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\RadioManagement\SystemRadioState' -EA SilentlyContinue).'(default)'
Fakt 'flugmodus' ($rs -eq 1)
Punkt 'Flugzeugmodus' $(if ($rs -eq 1) { 'fehler' } else { 'ok' }) $(if ($rs -eq 1) { 'EIN' } else { 'aus' })
$nam = @(Get-Service -EA SilentlyContinue | Where-Object { [string]$_.DisplayName -match '(?i)Network Access Manager' -and $_.Status -eq 'Running' })
Fakt 'ciscoNam' ($nam.Count -gt 0)
if ($nam.Count) { Punkt 'Cisco Network Access Manager' 'warn' 'läuft – übernimmt die WLAN-Steuerung von Windows' }
$roh = @(& netsh.exe wlan show interfaces 2>&1 | ForEach-Object { [string]$_ })
$gesperrt = (($roh -join ' ') -match '(?i)Standortberechtigung|location permission')
Fakt 'standortGesperrt' $gesperrt
function WlFeld([string]$muster) { foreach ($z in $roh) { if ($z -match ('^\s*(' + $muster + ')\s*:\s*(.*)$')) { return ([string]$Matches[2]).Trim() } }; return $null }
$st = WlFeld 'Status|State'
$verb = [string]$st -match '(?i)^(verbunden|connected)$'
Fakt 'verbunden' $verb
$ssid = $null; $sig = $null; $kanal = $null; $bandTxt = $null; $rx = $null; $tx = $null; $typ = $null; $prof = $null; $rssi = $null
if ($verb) {
  $ssid = WlFeld 'SSID'; $typ = WlFeld 'Funktyp|Radio type'; $prof = WlFeld 'Profil|Profile'
  $sig = ZahlWl (WlFeld 'Signal'); $rssi = ZahlWl (WlFeld 'RSSI'); $kanal = ZahlWl (WlFeld 'Kanal|Channel')
  $rx = ZahlWl (WlFeld 'Empfangsrate[^:]*|Receive rate[^:]*'); $tx = ZahlWl (WlFeld '.bertragungsrate[^:]*|Transmit rate[^:]*')
  $bandTxt = WlFeld 'Bereich|Band'
  Fakt 'ssid' $ssid; Fakt 'bssid' (WlFeld 'AP BSSID|BSSID'); Fakt 'funktyp' $typ; Fakt 'authentifizierung' (WlFeld 'Authentifizierung|Authentication'); Fakt 'profil' $prof
  Fakt 'signal' $sig; Fakt 'rssi' $rssi; Fakt 'kanal' $kanal; Fakt 'empfangMbit' $rx; Fakt 'sendenMbit' $tx
}
$band = $null
if ($null -ne $kanal) { if ($kanal -le 14 -and [string]$bandTxt -notmatch '6') { $band = 2.4 } elseif ([string]$bandTxt -match '^\s*6') { $band = 6 } else { $band = 5 } }
Fakt 'bandGHz' $band
$firma = [string]$ssid -match '(?i)SKF'
Fakt 'firma' $(if ($verb) { $firma } else { $null })
if ($gesperrt) { Punkt 'WLAN-Verbindung' 'info' 'Windows gibt die WLAN-Daten nur mit Standortberechtigung heraus' }
elseif ($verb) {
  Punkt 'WLAN-Verbindung' 'ok' ('verbunden mit „' + $ssid + '“' + $(if ($firma) { ' (Firmen-WLAN)' } else { '' }))
  Punkt 'Signal' $(if ($sig -lt 40) { 'fehler' } elseif ($sig -lt 60) { 'warn' } else { 'ok' }) ('' + $sig + ' %' + $(if ($null -ne $rssi) { ' (' + $rssi + ' dBm)' } else { '' }))
  Punkt 'Funkband und Standard' $(if ($band -eq 2.4) { 'warn' } else { 'ok' }) ('' + $(if ($band -eq 2.4) { '2,4' } else { [string]$band }) + ' GHz, Kanal ' + $kanal + ', ' + $typ)
  Punkt 'Verbindungsrate' $(if ($rx -le 54) { 'warn' } else { 'ok' }) ('Empfang ' + ([string]$rx).Replace('.', ',') + ' / Senden ' + ([string]$tx).Replace('.', ',') + ' MBit/s')
} else { Punkt 'WLAN-Verbindung' $(if ($wa.Count) { 'warn' } else { 'info' }) $(if ($st) { 'nicht verbunden (' + $st + ')' } else { 'keine WLAN-Daten' }) }
$drv = [string](& netsh.exe wlan show drivers 2>&1 | Out-String)
$kann5 = $null; if ($drv -match '(?im)(Unterst.tzte Funktypen|Radio types supported)\s*:\s*([^\r\n]+)') { $kann5 = ([string]$Matches[2] -match '802\.11(a|ac|ax|be)\b') }
Fakt 'kann5GHz' $kann5
Fakt 'nur24' $(if ($verb -and $null -ne $kann5 -and $null -ne $band) { ($kann5 -and $band -eq 2.4) } else { $null })
$pl = @(& netsh.exe wlan show profiles 2>&1 | ForEach-Object { [string]$_ } | Where-Object { $_ -match ':\s*\S' -and $_ -match '(?i)(Profil f.r alle|All User Profile|Gruppenrichtlinienprofil|Group policy profile|Benutzerprofil|User profile)' })
$pnamen = @($pl | ForEach-Object { ($_ -split ':', 2)[1].Trim() })
$corp = @($pnamen | Where-Object { $_ -match '(?i)^SKF[-_ ]?Corp' })
Fakt 'profile' $pnamen.Count; Fakt 'firmenProfile' $corp.Count; Fakt 'firmenProfilNamen' @($corp)
Punkt 'Gespeicherte WLAN-Profile' $(if ($corp.Count -gt 1) { 'warn' } else { 'info' }) ('' + $pnamen.Count + ' Profil(e)' + $(if ($corp.Count) { ', Firmen-WLAN: ' + ($corp -join ', ') } else { ', kein SKF-Corp-Profil' }))
$getaktet = $null
if ($verb -and $prof) {
  $pd = [string](& netsh.exe wlan show profile ('name=' + $prof) 2>&1 | Out-String)
  if ($pd -match '(?im)^\s*(Kosten|Cost)\s*:\s*([^\r\n]+)') { $getaktet = ([string]$Matches[2] -match '(?i)Fest|Fixed|Variab') }
}
Fakt 'getaktet' $getaktet
if ($getaktet) { Punkt 'Getaktete Verbindung' 'warn' 'dieses WLAN ist als „getaktet“ markiert – Updates/Downloads werden zurückgehalten' }
$hs = $false; $gwW = $null
if ($haupt -and $haupt.Status -eq 'Up') { $gwW = [string](@(Get-NetRoute -InterfaceIndex $haupt.ifIndex -DestinationPrefix '0.0.0.0/0' -EA SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1).NextHop) }
if ($verb) { $hs = ([string]$ssid -match '(?i)iPhone|Galaxy|Android|Hotspot|Redmi|Pixel|Xiaomi|Huawei|OnePlus|Moto|Mate') -or ($gwW -eq '172.20.10.1') -or ($gwW -eq '192.168.43.1') }
Fakt 'hotspot' $(if ($verb) { $hs } else { $null })
if ($hs) { Punkt 'Handy-Hotspot' 'info' 'der Laptop hängt an einem Handy-Hotspot' }
$pz = @(); $verl = 0
if ($gwW -and $gwW -ne '0.0.0.0') {
  $pg = New-Object System.Net.NetworkInformation.Ping
  for ($i = 0; $i -lt 10; $i++) { try { $antw = $pg.Send($gwW, 1000); if ([string]$antw.Status -eq 'Success') { $pz += [int]$antw.RoundtripTime } else { $verl++ } } catch { $verl++ }; Start-Sleep -Milliseconds 150 }
}
$pMit = $null; $pMax = $null; $pVerl = $null
if ($gwW -and $gwW -ne '0.0.0.0') {
  $pVerl = [int](10 * $verl)
  if ($pz.Count) { $pMit = [math]::Round(($pz | Measure-Object -Average).Average); $pMax = [int](($pz | Measure-Object -Maximum).Maximum) }
  Punkt 'Antwortzeit zum WLAN-Router' $(if ($pVerl -ge 100) { 'info' } elseif ($pVerl -ge 20 -or $pMax -gt 200) { 'warn' } else { 'ok' }) $(if ($pVerl -ge 100) { $gwW + ' antwortet nicht auf Ping' } else { 'Mittel ' + $pMit + ' ms, Spitze ' + $pMax + ' ms, Verlust ' + $pVerl + ' %' })
}
Fakt 'pingMittel' $pMit; Fakt 'pingMax' $pMax; Fakt 'pingVerlust' $pVerl
$ab7 = (Get-Date).AddDays(-7)
$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-WLAN-AutoConfig/Operational'; Id = 8002, 8003, 12013; StartTime = $ab7 } -MaxEvents 1500 -EA SilentlyContinue)
$trenn = @($ev | Where-Object { $_.Id -eq 8003 }).Count; $vf = @($ev | Where-Object { $_.Id -eq 8002 }).Count; $eap = @($ev | Where-Object { $_.Id -eq 12013 }).Count
Fakt 'trennungen7' $trenn; Fakt 'verbindungsfehler7' $vf; Fakt 'eapFehler7' $eap
$grund = $null
$letzt = @($ev | Where-Object { $_.Id -eq 8002 -or $_.Id -eq 12013 } | Select-Object -First 1)
if ($letzt.Count) { $msg = [string]$letzt[0].Message; if ($msg -match '(?im)^\s*(Fehlerursache|Fehlergrund|Failure Reason|Reason)\s*:\s*([^\r\n]+)') { $grund = ([string]$Matches[2]).Trim() } }
Fakt 'letzterFehler' $grund
Punkt 'WLAN-Trennungen (7 Tage)' $(if ($trenn -ge 25) { 'warn' } else { 'ok' }) ('' + $trenn + ' Mal getrennt')
Punkt 'Fehlgeschlagene Verbindungen (7 Tage)' $(if ($eap) { 'fehler' } elseif ($vf -ge 3) { 'warn' } else { 'ok' }) ('' + $vf + ' Verbindungsfehler, ' + $eap + ' Anmeldefehler (802.1X)' + $(if ($grund) { ' – zuletzt: ' + $grund } else { '' }))
$tf = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Level = 1, 2, 3; StartTime = $ab7 } -MaxEvents 3000 -EA SilentlyContinue | Where-Object { [string]$_.ProviderName -match '(?i)Netwtw|Netwbw|NETwNs|rtwlan|RtlWlan|Qcamain|Qcwlan|athw|bcmwl|mtkwl' }).Count
Fakt 'treiberFehler7' $tf
Punkt 'Fehlermeldungen des WLAN-Treibers (7 Tage)' $(if ($tf -ge 3) { 'warn' } else { 'ok' }) ('' + $tf)
$pcfg = [string](& powercfg.exe /qh SCHEME_CURRENT 19cbb8fa-5279-450e-9fac-8a3d5fedd0c1 12bbebe6-58d6-4636-95bb-3217ef867c1a 2>&1 | Out-String)
$dcIdx = $null; if ($pcfg -cmatch '(Gleichstrom|DC )[^:\r\n]*:\s*0x([0-9a-fA-F]+)') { $dcIdx = [Convert]::ToInt32($Matches[2], 16) }
Fakt 'stromsparenAkku' $dcIdx
if ($null -ne $dcIdx) { Punkt 'WLAN-Energiesparen im Akkubetrieb' $(if ($dcIdx -ge 2) { 'warn' } else { 'ok' }) $(switch ($dcIdx) { 0 { 'Höchstleistung' } 1 { 'minimal' } 2 { 'mittel' } default { 'maximal' } }) }
$ausErl = $null
if ($haupt) { try { $pmg = Get-NetAdapterPowerManagement -Name $haupt.Name -EA Stop; $ausErl = ([string]$pmg.AllowComputerToTurnOffDevice -eq 'Enabled') } catch {} }
Fakt 'energieAus' $ausErl
if ($ausErl) { Punkt 'Windows darf den WLAN-Adapter abschalten' 'warn' 'ja (Energieverwaltung)' }
$cnRx = [regex]::Escape([string]$env:COMPUTERNAME)
$zert = @(Get-ChildItem -Path 'Cert:\LocalMachine\My' -EA SilentlyContinue | Where-Object { $_.HasPrivateKey -and (@($_.EnhancedKeyUsageList | ForEach-Object { [string]$_.ObjectId }) -contains '1.3.6.1.5.5.7.3.2') -and (([string]$_.Subject -match $cnRx) -or ((@($_.DnsNameList | ForEach-Object { [string]$_ }) -join ' ') -match $cnRx)) })
$zertGut = @($zert | Where-Object { $_.NotAfter -gt (Get-Date) })
$zertTage = $null; if ($zert.Count) { $zertTage = [math]::Round((($zert | Sort-Object NotAfter -Descending | Select-Object -First 1).NotAfter - (Get-Date)).TotalDays) }
Fakt 'computerZert' ($zertGut.Count -gt 0); Fakt 'computerZertTage' $zertTage
Punkt 'Computerzertifikat (Firmen-WLAN)' $(if ($zertGut.Count -and $zertTage -ge 14) { 'ok' } elseif ($zertGut.Count) { 'warn' } else { 'info' }) $(if ($zertGut.Count) { 'gültig, noch ' + $zertTage + ' Tage' } elseif ($zert.Count) { 'ABGELAUFEN (vor ' + (-$zertTage) + ' Tagen)' } else { 'keins vorhanden' })
`,
  },
]

export const THEMEN_WLAN: DgOber[] = [
  {
    id: 'wlan', titel: 'WLAN', symbol: 'Wifi', beschreibung: 'Firmen-WLAN verbindet nicht, WLAN bricht ab oder ist langsam, Adapter fehlt, Homeoffice-WLAN oder Handy-Hotspot',
    unter: [
      {
        id: 'wl-firma', titel: 'Verbindet nicht mit dem Firmen-WLAN', beschreibung: 'SKF-Corp fragt nach Kennwort, hängt bei „Identität wird überprüft“ oder „Keine Verbindung möglich“, Zertifikatsfenster',
        sonden: ['wl'],
        regeln: [
          { id: 'kein-zert', wenn: f => ja(f['wl.domaenePc']) && nein(f['wl.computerZert']), befund: f => da(f, 'wl.computerZertTage') ? `Computerzertifikat ist seit ${-num(f['wl.computerZertTage'])} Tagen abgelaufen` : 'Es gibt kein Computerzertifikat für die Anmeldung am Firmen-WLAN', problem: 'wlan-zertifikat-abgelaufen', schwere: 3 },
          { id: 'zert-bald', wenn: f => ja(f['wl.computerZert']) && num(f['wl.computerZertTage']) < 14, befund: f => `Computerzertifikat läuft in ${f['wl.computerZertTage']} Tagen ab`, problem: 'wlan-zertifikat-abgelaufen', schwere: 2 },
          { id: 'eaphost', wenn: f => txt(f['wl.eaphostStart']) === 'Disabled', befund: () => 'Dienst „Extensible Authentication Protocol“ ist deaktiviert', problem: 'wlan-eaphost-dienst-aus', schwere: 3 },
          { id: 'cisco-nam', wenn: f => ja(f['wl.ciscoNam']), befund: () => 'Cisco Network Access Manager läuft und steuert das WLAN statt Windows', problem: 'wlan-cisco-network-access-manager', schwere: 3 },
          { id: 'eap-fehler', wenn: f => num(f['wl.eapFehler7']) > 0, befund: f => `${f['wl.eapFehler7']} fehlgeschlagene WLAN-Anmeldung(en) (802.1X) in 7 Tagen${da(f, 'wl.letzterFehler') ? ' – ' + txt(f['wl.letzterFehler']) : ''}`, problem: 'wlan-ereignis-12013-auswerten', schwere: 2 },
          { id: 'corp-doppelt', wenn: f => num(f['wl.firmenProfile']) > 1, befund: f => `Firmen-WLAN ist ${f['wl.firmenProfile']}× gespeichert: ${txt(f['wl.firmenProfilNamen'])}`, problem: 'wlan-skf-corp-doppelt', schwere: 2 },
          { id: 'kein-profil', wenn: f => num(f['wl.firmenProfile']) === 0 && ja(f['wl.domaenePc']), befund: () => 'Auf dem Laptop ist kein SKF-Corp-Profil gespeichert (Richtlinie nicht angekommen)', problem: 'wlan-firmen-nicht-angezeigt', schwere: 2 },
          { id: 'verbindungsfehler', wenn: f => num(f['wl.verbindungsfehler7']) >= 3, befund: f => `${f['wl.verbindungsfehler7']} fehlgeschlagene Verbindungsversuche in 7 Tagen${da(f, 'wl.letzterFehler') ? ' – ' + txt(f['wl.letzterFehler']) : ''}`, problem: 'wlan-keine-verbindung-herstellen', schwere: 1 },
        ],
        ohneBefund: ['wlan-kennwort-abgefragt', 'wlan-identitaet-wird-ueberprueft', 'wlan-zertifikat-abgelaufen', 'wlan-berechtigung-fehlt'],
      },
      {
        id: 'wl-trennt', titel: 'WLAN bricht ständig ab', beschreibung: 'Verbindung ist immer wieder für ein paar Sekunden weg, Teams-Anrufe brechen ab, nach dem Aufklappen kein WLAN',
        sonden: ['wl', 'sys'],
        regeln: [
          { id: 'treiber-fehler', wenn: f => num(f['wl.treiberFehler7']) >= 3, befund: f => `Der WLAN-Treiber hat in 7 Tagen ${f['wl.treiberFehler7']} Fehler gemeldet`, problem: 'wlan-treiber-interner-fehler', schwere: 3 },
          { id: 'bluescreen', wenn: f => num(f['sys.bluescreens30']) > 0 && num(f['wl.treiberFehler7']) > 0, befund: f => `${f['sys.bluescreens30']} Bluescreen(s) in 30 Tagen und gleichzeitig Fehler des WLAN-Treibers`, problem: 'wlan-bluescreen-treiber', schwere: 2 },
          { id: 'viele-trennungen', wenn: f => num(f['wl.trennungen7']) >= 25, befund: f => `WLAN wurde in 7 Tagen ${f['wl.trennungen7']}× getrennt`, problem: 'wlan-trennt-staendig', schwere: 2 },
          { id: 'akku-sparen', wenn: f => ja(f['sys.akku']) && num(f['wl.stromsparenAkku']) >= 2, befund: f => `Im Akkubetrieb spart der WLAN-Adapter stark Energie (Stufe ${f['wl.stromsparenAkku']} von 3)`, problem: 'wlan-nur-akku', schwere: 2 },
          { id: 'signal', wenn: f => num(f['wl.signal']) < 50, befund: f => `Signal nur ${f['wl.signal']} %`, problem: 'wlan-signal-schwach', schwere: 2 },
          { id: 'usb-stick', wenn: f => ja(f['wl.usbStick']), befund: () => 'Das WLAN läuft über einen USB-WLAN-Stick', problem: 'wlan-usb-stick-desktop', schwere: 2 },
          { id: 'energie-aus', wenn: f => ja(f['wl.energieAus']), befund: () => 'Windows darf den WLAN-Adapter zum Energiesparen abschalten', problem: 'wlan-nach-standby', schwere: 1 },
          { id: 'treiber-alt', wenn: f => num(f['wl.treiberAlterTage']) > 1095, befund: f => `WLAN-Treiber ist ${Math.floor(num(f['wl.treiberAlterTage']) / 365)} Jahre alt (Version ${txt(f['wl.treiberVersion'])})`, problem: 'wlan-haengt-aus-ein', schwere: 1 },
        ],
        ohneBefund: ['wlan-trennt-staendig', 'wlan-roaming-halle', 'wlan-nach-standby', 'wlan-sporadisch-ueberwachen'],
      },
      {
        id: 'wl-langsam', titel: 'WLAN ist langsam', beschreibung: 'Seiten und Dateien laden zäh, Remote-Desktop ruckelt, Kollegen am selben Platz sind schneller',
        sonden: ['wl', 'sys'],
        regeln: [
          { id: 'nur-24', wenn: f => ja(f['wl.nur24']), befund: f => `Verbunden über 2,4 GHz (Kanal ${f['wl.kanal']}), obwohl der Adapter 5 GHz kann`, problem: 'wlan-nur-2-4-ghz', schwere: 3 },
          { id: 'nur-54', wenn: f => num(f['wl.empfangMbit']) > 0 && num(f['wl.empfangMbit']) <= 54, befund: f => `Verbindungsrate nur ${zahl(f['wl.empfangMbit'])} MBit/s (${txt(f['wl.funktyp'])})`, problem: 'wlan-nur-54-mbit', schwere: 3 },
          { id: 'signal-schwach', wenn: f => num(f['wl.signal']) < 40, befund: f => `Signal nur ${f['wl.signal']} %`, problem: 'wlan-signal-schwach', schwere: 3 },
          { id: 'signal-maessig', wenn: f => num(f['wl.signal']) >= 40 && num(f['wl.signal']) < 60, befund: f => `Signal mäßig (${f['wl.signal']} %)`, problem: 'wlan-reichweite-schlechter', schwere: 1 },
          { id: 'ping-schwankt', wenn: f => num(f['wl.pingVerlust']) < 100 && num(f['wl.pingMax']) > 200, befund: f => `Antwortzeit zum Router schwankt stark (Mittel ${f['wl.pingMittel']} ms, Spitze ${f['wl.pingMax']} ms)`, problem: 'wlan-ping-schwankt', schwere: 2 },
          { id: 'ping-verlust', wenn: f => num(f['wl.pingVerlust']) >= 20 && num(f['wl.pingVerlust']) < 100, befund: f => `${f['wl.pingVerlust']} % Paketverlust zum WLAN-Router`, problem: 'wlan-periodische-haenger', schwere: 2 },
          { id: 'getaktet', wenn: f => ja(f['wl.getaktet']), befund: () => 'Das WLAN ist als „getaktete Verbindung“ markiert', problem: 'wlan-getaktete-verbindung', schwere: 2 },
          { id: 'akku-sparen', wenn: f => ja(f['sys.akku']) && num(f['wl.stromsparenAkku']) >= 2, befund: f => `WLAN-Energiesparen im Akkubetrieb steht auf Stufe ${f['wl.stromsparenAkku']} von 3`, problem: 'wlan-langsam', schwere: 1 },
        ],
        ohneBefund: ['wlan-langsam', 'wlan-signal-schwach', 'wlan-viele-nutzer-langsam', 'wlan-heim-abends-langsam'],
      },
      {
        id: 'wl-adapter', titel: 'WLAN-Adapter fehlt oder ist ausgeschaltet', beschreibung: 'Kein WLAN-Symbol, keine Netze in der Liste, WLAN-Schalter fehlt oder ist ausgegraut, Flugzeugmodus',
        sonden: ['wl'],
        regeln: [
          { id: 'kein-adapter', wenn: f => nein(f['wl.adapterVorhanden']), befund: f => `Kein WLAN-Adapter vorhanden${txt(f['wl.geraeteFehler']) ? ' – Gerät mit Fehler: ' + txt(f['wl.geraeteFehler']) : ''}`, problem: 'wlan-symbol-fehlt', schwere: 3 },
          { id: 'deaktiviert', wenn: f => ja(f['wl.adapterDeaktiviert']), befund: () => 'Der WLAN-Adapter ist in Windows deaktiviert', problem: 'netz-adapter-deaktiviert', schwere: 3 },
          { id: 'geraetefehler', wenn: f => txt(f['wl.geraeteFehler']) !== '', befund: f => `WLAN-Gerät mit Fehler im Geräte-Manager: ${txt(f['wl.geraeteFehler'])}`, problem: 'netz-adapter-fehlt', schwere: 3 },
          { id: 'flugmodus', wenn: f => ja(f['wl.flugmodus']), befund: () => 'Der Flugzeugmodus ist eingeschaltet', problem: 'wlan-flugzeugmodus', schwere: 3 },
          { id: 'dienst', wenn: f => da(f, 'wl.dienst') && txt(f['wl.dienst']) !== 'Running', befund: f => `Dienst „Automatische WLAN-Konfiguration“ läuft nicht (${txt(f['wl.dienst'])}, Start: ${txt(f['wl.dienstStart'])})`, problem: 'wlan-dienst-deaktiviert', schwere: 3 },
          { id: 'cisco-nam', wenn: f => ja(f['wl.ciscoNam']), befund: () => 'Cisco Network Access Manager übernimmt das WLAN – Windows zeigt keine Netze', problem: 'wlan-cisco-network-access-manager', schwere: 2 },
          { id: 'funk-aus', wenn: f => txt(f['wl.adapterStatus']) === 'Disconnected' && nein(f['wl.flugmodus']) && nein(f['wl.verbunden']), befund: () => 'WLAN-Adapter ist da, aber mit keinem Netz verbunden (WLAN-Schalter aus?)', problem: 'wlan-ausgeschaltet', schwere: 1 },
          { id: 'standort', wenn: f => ja(f['wl.standortGesperrt']), befund: () => 'Windows gibt WLAN-Informationen nur mit Standortberechtigung heraus', problem: 'wlan-standortberechtigung-wlan-infos', schwere: 1 },
        ],
        ohneBefund: ['wlan-ausgeschaltet', 'wlan-flugzeugmodus', 'wlan-symbol-fehlt', 'wlan-und-bluetooth-weg'],
      },
      {
        id: 'wl-unterwegs', titel: 'Homeoffice-WLAN oder Handy-Hotspot', beschreibung: 'Zu Hause oder am Handy-Hotspot verbunden, aber kein Internet, ständige Abbrüche oder sehr langsam',
        sonden: ['wl', 'net'],
        fragen: [{ id: 'hotspot', text: 'Ist der Laptop gerade mit einem Handy-Hotspot verbunden?' }],
        regeln: [
          { id: 'keine-ip', wenn: f => ja(f['wl.verbunden']) && ja(f['net.apipa']) && !da(f, 'net.ip'), befund: () => 'Mit dem WLAN verbunden, aber nur eine 169.254.x.x-Adresse', problem: 'wlan-keine-ip', schwere: 3 },
          { id: 'hotspot-kein-internet', wenn: f => (ja(f['wl.hotspot']) || f['frage.hotspot'] === 'ja') && nein(f['net.internet443']), befund: f => `Am Handy-Hotspot „${txt(f['wl.ssid'])}“ verbunden, aber kein Internet`, problem: 'wlan-hotspot-handy', schwere: 3 },
          { id: 'heim-kein-internet', wenn: f => ja(f['wl.verbunden']) && nein(f['wl.firma']) && nein(f['net.internet443']), befund: f => `Mit „${txt(f['wl.ssid'])}“ verbunden, aber Microsoft 365 ist nicht erreichbar`, problem: 'wlan-homeoffice-kein-internet', schwere: 2 },
          { id: 'zscaler', wenn: f => ja(f['net.zscalerInstalliert']) && da(f, 'net.zscalerDienst') && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])})`, problem: 'vpn-zscaler-symbol-fehlt', schwere: 2 },
          { id: 'heim-trennt', wenn: f => nein(f['wl.firma']) && num(f['wl.trennungen7']) >= 25, befund: f => `WLAN wurde in 7 Tagen ${f['wl.trennungen7']}× getrennt`, problem: 'wlan-homeoffice-trennt', schwere: 2 },
          { id: 'hotspot-volumen', wenn: f => (ja(f['wl.hotspot']) || f['frage.hotspot'] === 'ja') && nein(f['wl.getaktet']), befund: () => 'Handy-Hotspot ist nicht als „getaktet“ markiert – Updates verbrauchen das Datenvolumen', problem: 'wlan-hotspot-datenvolumen', schwere: 1 },
          { id: 'heim-24', wenn: f => nein(f['wl.firma']) && ja(f['wl.nur24']), befund: f => `Zu Hause über 2,4 GHz (Kanal ${f['wl.kanal']}) verbunden, obwohl 5 GHz möglich wäre`, problem: 'wlan-heim-abends-langsam', schwere: 1 },
        ],
        ohneBefund: ['wlan-homeoffice-kein-internet', 'wlan-hotspot-handy', 'wlan-kennwort-zuhause-geaendert', 'wlan-hotel-anmeldeseite'],
      },
    ],
  },
]
