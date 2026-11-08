// ── Diagnose-Thema „Drucker & Scannen“ ───────────────────────────────────────
// dr      = Druckwarteschlange (Spooler), installierte Drucker (Win32_Printer per CIM – NICHT das
//           PrintManagement-Modul, das fehlt auf den Clients), Aufträge, Treiber, SEAL/PLOSSYS, Druckserver
// drusr   = Standarddrucker und Druckerverbindungen des angemeldeten Benutzers
// drgeraet= Scanner (WIA/TWAIN/WSD), USB- und Etikettendrucker
// SEAL-Drucker heißen PMD…, Port PLS_…; installiert über sealapw.exe (hier nur nachsehen, nie ausführen).
// Alles NUR LESEND.
import { ja, liste, nein, num, txt, zahl } from '../motor'
import type { DgOber, DgSonde } from '../types'

export const SONDEN_DRUCKER: DgSonde[] = [
  {
    id: 'dr', titel: 'Druckwarteschlange, Drucker, Aufträge, Treiber und SEAL', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
function TcpDr([string]$h, [int]$port) { try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($h, $port).Wait(3000) -and $t.Connected; $t.Close(); return [bool]$ok } catch { return $false } }
$sp = Get-Service -Name Spooler -EA SilentlyContinue
Fakt 'spooler' $(if ($sp) { [string]$sp.Status } else { $null }); Fakt 'spoolerStart' $(if ($sp) { [string]$sp.StartType } else { $null })
Punkt 'Druckwarteschlange (Spooler)' $(if ($sp -and $sp.Status -eq 'Running') { 'ok' } else { 'fehler' }) $(if ($sp) { [string]$sp.Status + ' (' + [string]$sp.StartType + ')' } else { 'Dienst fehlt' })
$alle = @(Get-CimInstance Win32_Printer -OperationTimeoutSec 30 -EA SilentlyContinue)
$virt = '(?i)PDF|XPS|OneNote|Fax|Snagit'
$echt = @($alle | Where-Object { ([string]$_.Name + ' ' + [string]$_.DriverName) -notmatch $virt })
Fakt 'anzahl' $echt.Count; Fakt 'namen' @($echt | Select-Object -First 30 | ForEach-Object { [string]$_.Name })
Fakt 'pdfDrucker' (@($alle | Where-Object { [string]$_.Name -match '(?i)Microsoft Print to PDF' }).Count -gt 0)
Punkt 'Installierte Drucker' $(if ($echt.Count) { 'ok' } else { 'fehler' }) $(if ($echt.Count) { '' + $echt.Count + ': ' + ((@($echt | Select-Object -First 8 | ForEach-Object { [string]$_.Name })) -join ', ') + $(if ($echt.Count -gt 8) { ' …' } else { '' }) } else { 'keine echten Drucker (nur PDF/XPS o. Ä.)' })
$pmd = @($echt | Where-Object { [string]$_.Name -match '(?i)^PMD' -or [string]$_.PortName -match '(?i)^PLS_' })
Fakt 'pmdAnzahl' $pmd.Count
$offl = @($echt | Where-Object { $_.WorkOffline -eq $true -or $_.PrinterStatus -eq 7 } | ForEach-Object { [string]$_.Name })
Fakt 'offline' $offl
Fakt 'pmdOffline' @($pmd | Where-Object { $_.WorkOffline -eq $true -or $_.PrinterStatus -eq 7 } | ForEach-Object { [string]$_.Name })
Punkt 'Drucker offline' $(if ($offl.Count) { 'warn' } else { 'ok' }) $(if ($offl.Count) { $offl -join ', ' } else { 'keiner' })
$ipD = @($echt | Where-Object { [string]$_.PortName -match '^(IP_)?\d{1,3}(\.\d{1,3}){3}' } | ForEach-Object { [string]$_.Name + ' (' + [string]$_.PortName + ')' })
Fakt 'ipDirekt' $ipD
if ($ipD.Count) { Punkt 'Direkt per IP eingerichtet (nicht über SEAL)' 'info' ($ipD -join ', ') }
$wsd = @($echt | Where-Object { [string]$_.PortName -match '(?i)^WSD' } | ForEach-Object { [string]$_.Name })
Fakt 'wsd' $wsd
if ($wsd.Count) { Punkt 'Automatisch eingerichtete Drucker (WSD)' 'warn' ($wsd -join ', ') }
$dop = @($echt | Where-Object { [string]$_.Name -match '(?i)\((Kopie|Copy) \d+\)' } | ForEach-Object { [string]$_.Name })
Fakt 'doppelt' $dop
if ($dop.Count) { Punkt 'Doppelte Drucker' 'warn' ($dop -join ', ') }
$trv = @(Get-CimInstance Win32_PrinterDriver -OperationTimeoutSec 30 -EA SilentlyContinue | ForEach-Object { ([string]$_.Name -split ',')[0] })
$ohneTr = @()
if ($trv.Count) { $ohneTr = @($alle | Where-Object { $_.DriverName -and $trv -notcontains [string]$_.DriverName } | ForEach-Object { [string]$_.Name + ' (' + [string]$_.DriverName + ')' }) }
Fakt 'treiberFehlt' $ohneTr
Punkt 'Druckertreiber' $(if ($ohneTr.Count) { 'fehler' } elseif ($trv.Count) { 'ok' } else { 'info' }) $(if ($ohneTr.Count) { 'Treiber fehlt: ' + ($ohneTr -join ', ') } elseif ($trv.Count) { '' + $trv.Count + ' Treiber installiert' } else { 'Treiberliste nicht lesbar' })
$jobs = @(Get-CimInstance Win32_PrintJob -OperationTimeoutSec 30 -EA SilentlyContinue)
$jetzt = Get-Date
$alt = @($jobs | Where-Object { $_.TimeSubmitted -and ($jetzt - $_.TimeSubmitted).TotalMinutes -gt 30 })
$fj = @($jobs | Where-Object { ([string]$_.Status + ' ' + [string]$_.JobStatus) -match '(?i)Error|Fehler|Offline|Paused|Angehalten|Blocked' })
Fakt 'auftraege' $jobs.Count; Fakt 'alteAuftraege' $alt.Count; Fakt 'fehlerAuftraege' $fj.Count
Fakt 'auftragDrucker' @($jobs | ForEach-Object { ([string]$_.Name -split ',')[0] } | Select-Object -Unique)
Punkt 'Druckaufträge in der Warteschlange' $(if ($fj.Count) { 'fehler' } elseif ($alt.Count) { 'warn' } else { 'ok' }) ('' + $jobs.Count + ' Auftrag/Aufträge, davon ' + $alt.Count + ' älter als 30 min, ' + $fj.Count + ' mit Fehler')
$sd = Join-Path $env:SystemRoot 'System32\spool\PRINTERS'
$sb = 0.0; foreach ($fi in @(Get-ChildItem -LiteralPath $sd -File -Force -EA SilentlyContinue)) { $sb += [double]$fi.Length }
$spMB = [math]::Round($sb / 1MB)
Fakt 'spoolMB' $spMB
Punkt 'Spool-Ordner' $(if ($spMB -ge 500) { 'warn' } else { 'ok' }) ('' + $spMB + ' MB')
$sa = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue | Where-Object { $_.Message -match '(?i)spoolsv\.exe' }).Count
$ia = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue | Where-Object { $_.Message -match '(?i)PrintIsolationHost' }).Count
Fakt 'spoolerAbstuerze7' $sa; Fakt 'isolationAbstuerze7' $ia
Punkt 'Abstürze Druckdienst (7 Tage)' $(if ($sa -or $ia) { 'warn' } else { 'ok' }) ('Spooler ' + $sa + '×, Treiberisolierung ' + $ia + '×')
$pse = @()
try { $pse = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-PrintService/Admin'; Level = 2; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 200 -EA Stop) } catch {}
$pls = @($pse | Where-Object { $_.Message -match '(?i)PLS_' }).Count
Fakt 'druckFehler7' $pse.Count; Fakt 'plsFehler7' $pls
Punkt 'Druckfehler im Ereignisprotokoll (7 Tage)' $(if ($pls) { 'fehler' } elseif ($pse.Count) { 'warn' } else { 'ok' }) ('' + $pse.Count + ' Fehler' + $(if ($pls) { ', davon ' + $pls + ' an SEAL-Anschlüssen (PLS_)' } else { '' }))
$x86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
$seal = @((Join-Path $env:ProgramFiles 'SEAL Systems\SEAL Add Printer Wizard\sealapw.exe'), $(if ($x86) { Join-Path $x86 'SEAL Systems\SEAL Add Printer Wizard\sealapw.exe' } else { '' })) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
Fakt 'sealInstalliert' ([bool]$seal)
Fakt 'sealVersion' $(if ($seal) { [string](Get-Item -LiteralPath $seal).VersionInfo.FileVersion } else { $null })
Punkt 'SEAL Add Printer Wizard' $(if ($seal) { 'ok' } elseif ($pmd.Count) { 'fehler' } else { 'info' }) $(if ($seal) { 'installiert' } else { 'nicht installiert (sealapw.exe fehlt)' })
Punkt 'SEAL-Drucker (PMD…)' 'info' ('' + $pmd.Count + ' installiert' + $(if ($pmd.Count) { ': ' + ((@($pmd | Select-Object -First 6 | ForEach-Object { [string]$_.Name })) -join ', ') } else { '' }))
$s1 = TcpDr 'w3149' 445; $s2 = TcpDr 'w3150' 445
Fakt 'w3149' $s1; Fakt 'w3150' $s2
Punkt 'Druckserver w3149 / w3150' $(if ($s1 -and $s2) { 'ok' } elseif ($s1 -or $s2) { 'warn' } else { 'fehler' }) ('w3149 ' + $(if ($s1) { 'erreichbar' } else { 'NICHT erreichbar' }) + ', w3150 ' + $(if ($s2) { 'erreichbar' } else { 'NICHT erreichbar' }))
`,
  },
  {
    id: 'drusr', titel: 'Standarddrucker und Druckerverbindungen des Benutzers', modus: 'profil', timeoutMs: 60000,
    ps: String.raw`
NeedHive
$wk = Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows NT\CurrentVersion\Windows') -EA SilentlyContinue
$dev = [string]$wk.Device
$std = $(if ($dev) { ($dev -split ',')[0] } else { '' })
Fakt 'standard' $std
Fakt 'windowsVerwaltet' ($wk.LegacyDefaultPrinterMode -ne 1)
Punkt 'Standarddrucker' $(if ($std) { 'ok' } else { 'fehler' }) $(if ($std) { $std } else { 'keiner festgelegt' })
Punkt '„Windows verwaltet Standarddrucker“' $(if ($wk.LegacyDefaultPrinterMode -ne 1) { 'warn' } else { 'ok' }) $(if ($wk.LegacyDefaultPrinterMode -ne 1) { 'EIN – Windows nimmt den zuletzt benutzten Drucker' } else { 'aus' })
$verb = @(Get-ChildItem -LiteralPath ($uHive + '\Printers\Connections') -EA SilentlyContinue | ForEach-Object { '\\' + (([string]$_.PSChildName).TrimStart(',') -replace ',', '\') })
Fakt 'verbindungen' $verb
Punkt 'Druckerverbindungen über Druckserver' 'info' $(if ($verb.Count) { $verb -join ', ' } else { 'keine (SEAL-Drucker sind lokal installiert)' })
$inst = @(Get-CimInstance Win32_Printer -OperationTimeoutSec 30 -EA SilentlyContinue | ForEach-Object { [string]$_.Name })
$fehlt = [bool]($std -and $inst.Count -and ($inst -notcontains $std) -and ($verb -notcontains $std))
Fakt 'standardFehlt' $fehlt
if ($fehlt) { Punkt 'Standarddrucker vorhanden' 'fehler' ($std + ' ist nicht mehr installiert') }
$virt = [bool]($std -match '(?i)PDF|XPS|OneNote|Fax')
Fakt 'standardVirtuell' $virt
if ($virt) { Punkt 'Standard ist ein Datei-Drucker' 'warn' ($std + ' – es erscheint „Speichern unter“ statt eines Ausdrucks') }
$dm = @((Get-Item -LiteralPath ($uHive + '\Printers\DevModePerUser') -EA SilentlyContinue).Property).Count
Fakt 'eigeneEinstellungen' $dm
Punkt 'Eigene Druckeinstellungen gespeichert' 'info' ('für ' + $dm + ' Drucker')
`,
  },
  {
    id: 'drgeraet', titel: 'Scanner, USB- und Etikettendrucker', modus: 'system', timeoutMs: 60000,
    ps: String.raw`
$wia = Get-Service -Name stisvc -EA SilentlyContinue
Fakt 'wiaDienst' $(if ($wia) { [string]$wia.Status } else { $null }); Fakt 'wiaStart' $(if ($wia) { [string]$wia.StartType } else { $null })
Punkt 'Scannerdienst (WIA)' $(if ($wia -and $wia.Status -eq 'Running') { 'ok' } elseif ($wia) { 'warn' } else { 'fehler' }) $(if ($wia) { [string]$wia.Status + ' (' + [string]$wia.StartType + ')' } else { 'fehlt' })
$fd = Get-Service -Name FDResPub -EA SilentlyContinue
Fakt 'fdDienst' $(if ($fd) { [string]$fd.Status } else { $null })
Punkt 'Funktionssuche-Ressourcenveröffentlichung (Scannen an PC)' $(if ($fd -and $fd.Status -eq 'Running') { 'ok' } else { 'warn' }) $(if ($fd) { [string]$fd.Status } else { 'fehlt' })
$pnp = @(Get-CimInstance Win32_PnPEntity -Filter "PNPClass='Image' OR PNPClass='Printer' OR PNPClass='PrintQueue'" -OperationTimeoutSec 30 -EA SilentlyContinue)
$scan = @($pnp | Where-Object { [string]$_.PNPClass -eq 'Image' -and [string]$_.Name -notmatch '(?i)Camera|Kamera|Webcam|IR ' })
$scanF = @($scan | Where-Object { $_.ConfigManagerErrorCode -ne 0 } | ForEach-Object { [string]$_.Name + ' (Code ' + $_.ConfigManagerErrorCode + ')' })
Fakt 'scanner' @($scan | ForEach-Object { [string]$_.Name }); Fakt 'scannerFehler' $scanF
Punkt 'Scanner (Geräte-Manager)' $(if ($scanF.Count) { 'fehler' } elseif ($scan.Count) { 'ok' } else { 'info' }) $(if ($scanF.Count) { 'Fehler: ' + ($scanF -join ', ') } elseif ($scan.Count) { (@($scan | ForEach-Object { [string]$_.Name }) -join ', ') } else { 'kein Scanner angeschlossen' })
$prF = @($pnp | Where-Object { [string]$_.PNPClass -eq 'Printer' -and $_.ConfigManagerErrorCode -ne 0 } | ForEach-Object { [string]$_.Name + ' (Code ' + $_.ConfigManagerErrorCode + ')' })
Fakt 'druckerGeraetFehler' $prF
if ($prF.Count) { Punkt 'Drucker im Geräte-Manager' 'fehler' ($prF -join ', ') }
$tw = 0; $twd = Join-Path $env:SystemRoot 'twain_32'
if (Test-Path -LiteralPath $twd) { $tw = @(Get-ChildItem -LiteralPath $twd -Recurse -Filter '*.ds' -File -EA SilentlyContinue).Count }
Fakt 'twainQuellen' $tw
Punkt 'TWAIN-Quellen' $(if ($tw) { 'ok' } else { 'info' }) ('' + $tw + ' Scannertreiber für TWAIN-Programme')
$pr = @(Get-CimInstance Win32_Printer -OperationTimeoutSec 30 -EA SilentlyContinue)
$usb = @($pr | Where-Object { [string]$_.PortName -match '(?i)^USB' })
$usbOff = @($usb | Where-Object { $_.WorkOffline -eq $true -or $_.PrinterStatus -eq 7 } | ForEach-Object { [string]$_.Name })
Fakt 'usbDrucker' @($usb | ForEach-Object { [string]$_.Name }); Fakt 'usbOffline' $usbOff
Punkt 'USB-Drucker' $(if ($usbOff.Count) { 'warn' } elseif ($usb.Count) { 'ok' } else { 'info' }) $(if ($usbOff.Count) { 'offline: ' + ($usbOff -join ', ') } elseif ($usb.Count) { (@($usb | ForEach-Object { [string]$_.Name }) -join ', ') } else { 'keiner' })
$et = @($pr | Where-Object { ([string]$_.DriverName + ' ' + [string]$_.Name) -match '(?i)ZDesigner|Zebra|Brother (QL|TD|PT)|DYMO|TSC|Godex|Intermec|Honeywell|SATO|Citizen|Epson TM' })
$etOff = @($et | Where-Object { $_.WorkOffline -eq $true -or $_.PrinterStatus -eq 7 } | ForEach-Object { [string]$_.Name })
Fakt 'etikettDrucker' @($et | ForEach-Object { [string]$_.Name }); Fakt 'etikettOffline' $etOff
Punkt 'Etiketten-/Bondrucker' $(if ($etOff.Count) { 'warn' } elseif ($et.Count) { 'ok' } else { 'info' }) $(if ($etOff.Count) { 'offline: ' + ($etOff -join ', ') } elseif ($et.Count) { (@($et | ForEach-Object { [string]$_.Name + ' (' + [string]$_.DriverName + ')' }) -join ', ') } else { 'keiner installiert' })
$gen = @($pr | Where-Object { [string]$_.DriverName -match '(?i)Generic / Text Only|Generisch / Nur Text' } | ForEach-Object { [string]$_.Name })
Fakt 'nurTextTreiber' $gen
$un = @()
foreach ($b in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) { $un += @(Get-ChildItem -LiteralPath $b -EA SilentlyContinue | ForEach-Object { [string](Get-ItemProperty -LiteralPath $_.PSPath -Name DisplayName -EA SilentlyContinue).DisplayName } | Where-Object { $_ }) }
$dymoSw = @($un | Where-Object { $_ -match '(?i)DYMO (Connect|Label)' }).Count -gt 0
$etSw = @($un | Where-Object { $_ -match '(?i)ZebraDesigner|BarTender|NiceLabel|DYMO Connect|DYMO Label|P-touch Editor' } | Select-Object -Unique)
Fakt 'dymoDrucker' (@($et | Where-Object { ([string]$_.DriverName + ' ' + [string]$_.Name) -match '(?i)DYMO' }).Count -gt 0); Fakt 'dymoSoftware' $dymoSw
Fakt 'etikettSoftware' $etSw
Punkt 'Etiketten-Software' 'info' $(if ($etSw.Count) { $etSw -join ', ' } else { 'keine gefunden' })
`,
  },
]

/** Spooler-Status bekannt und nicht „Running“ (fehlender Fakt ⇒ false). */
const spoolerSteht = (v: unknown) => v != null && v !== 'Running'

export const THEMEN_DRUCKER: DgOber[] = [
  {
    id: 'drucker', titel: 'Drucker & Scannen', symbol: 'Printer',
    beschreibung: 'Drucker druckt nicht, fehlt, falscher Standarddrucker, Scannen klappt nicht, Etiketten- und SEAL-Drucker (PMD…)',
    unter: [
      {
        id: 'dr-druckt-nicht', titel: 'Drucker druckt nicht – Aufträge hängen', beschreibung: 'Man klickt auf Drucken, aber es kommt nichts heraus; Aufträge bleiben in der Warteschlange stehen',
        sonden: ['dr'],
        regeln: [
          { id: 'spooler-aus', wenn: f => txt(f['dr.spoolerStart']) === 'Disabled', befund: () => 'Die Druckwarteschlange ist deaktiviert', problem: 'drucker-spooler-deaktiviert', schwere: 3 },
          { id: 'spooler-steht', wenn: f => spoolerSteht(f['dr.spooler']) && txt(f['dr.spoolerStart']) !== 'Disabled', befund: f => `Druckwarteschlange läuft nicht (${txt(f['dr.spooler'])})`, problem: 'drucker-spooler-absturz', schwere: 3 },
          { id: 'spooler-absturz', wenn: f => num(f['dr.spoolerAbstuerze7']) >= 2, befund: f => `Druckwarteschlange ist in 7 Tagen ${f['dr.spoolerAbstuerze7']}× abgestürzt`, problem: 'drucker-spooler-absturz', schwere: 3 },
          { id: 'offline', wenn: f => liste(f['dr.offline']).length > 0, befund: f => `Drucker steht auf „Offline“: ${txt(f['dr.offline'])}`, problem: 'drucker-offline-verwenden', schwere: 3 },
          { id: 'auftrag-fehler', wenn: f => num(f['dr.fehlerAuftraege']) > 0, befund: f => `${f['dr.fehlerAuftraege']} Druckauftrag/-aufträge im Fehlerzustand blockieren die Warteschlange`, problem: 'drucker-auftrag-status-fehler', schwere: 3 },
          { id: 'auftrag-alt', wenn: f => num(f['dr.alteAuftraege']) > 0, befund: f => `${f['dr.alteAuftraege']} Auftrag/Aufträge hängen seit über 30 Minuten (${txt(f['dr.auftragDrucker'])})`, problem: 'drucker-druckt-nicht', schwere: 2 },
          { id: 'pls', wenn: f => num(f['dr.plsFehler7']) > 0, befund: f => `${f['dr.plsFehler7']} Fehler beim Schreiben auf SEAL-Anschlüsse (PLS_) in 7 Tagen`, problem: 'drucker-pls-port-fehler', schwere: 2 },
          { id: 'isolation', wenn: f => num(f['dr.isolationAbstuerze7']) > 0, befund: f => `Druckertreiber-Host ist ${f['dr.isolationAbstuerze7']}× abgestürzt`, problem: 'druck-printisolationhost', schwere: 2 },
        ],
        ohneBefund: ['drucker-druckt-nicht', 'drucker-auftrag-nicht-loeschbar', 'drucker-offline', 'drucker-testseite'],
      },
      {
        id: 'dr-fehlt', titel: 'Drucker fehlt oder Verbinden scheitert', beschreibung: 'Der gewünschte Drucker ist nicht in der Liste, „Drucker nicht gefunden“, Fehlercode beim Verbinden',
        sonden: ['dr', 'drusr', 'net'],
        fragen: [{ id: 'umzug', text: 'Haben Sie vor Kurzem den Arbeitsplatz oder das Büro gewechselt?' }],
        regeln: [
          { id: 'liste-leer', wenn: f => num(f['dr.anzahl']) === 0, befund: () => 'Es ist kein einziger echter Drucker installiert', problem: 'drucker-liste-leer', schwere: 3 },
          { id: 'seal-fehlt', wenn: f => nein(f['dr.sealInstalliert']), befund: () => 'SEAL Add Printer Wizard (sealapw.exe) ist nicht installiert – PMD-Drucker lassen sich nicht verbinden', problem: 'drucker-seal-wizard-fehlt', schwere: 3 },
          { id: 'treiber', wenn: f => liste(f['dr.treiberFehlt']).length > 0, befund: f => `Druckertreiber fehlt: ${txt(f['dr.treiberFehlt'])}`, problem: 'drucker-treiber-nicht-verfuegbar', schwere: 3 },
          { id: 'spooler', wenn: f => spoolerSteht(f['dr.spooler']), befund: f => `Druckwarteschlange läuft nicht (${txt(f['dr.spooler'])}) – „RPC-Server nicht verfügbar“`, problem: 'drucker-fehler-0x6ba', schwere: 3 },
          { id: 'homeoffice', wenn: f => nein(f['dr.w3149']) && nein(f['dr.w3150']) && nein(f['net.domaeneErreichbar']), befund: () => 'Druckserver w3149/w3150 und Firmennetz nicht erreichbar (Homeoffice?)', problem: 'drucker-homeoffice', schwere: 2 },
          { id: 'server-weg', wenn: f => nein(f['dr.w3149']) && nein(f['dr.w3150']) && ja(f['net.domaeneErreichbar']), befund: () => 'Firmennetz erreichbar, aber beide Druckserver (w3149, w3150) nicht', problem: 'druck-niemand-kann-drucken', schwere: 2 },
          { id: 'doppelt', wenn: f => liste(f['dr.doppelt']).length > 0, befund: f => `Drucker doppelt vorhanden: ${txt(f['dr.doppelt'])}`, problem: 'drucker-doppelt', schwere: 2 },
          { id: 'umzug', wenn: f => f['frage.umzug'] === 'ja', befund: () => 'Neuer Arbeitsplatz – der dortige Drucker muss neu verbunden werden', problem: 'drucker-fehlt-nach-umzug', schwere: 2 },
        ],
        ohneBefund: ['drucker-verbinden', 'drucker-nicht-gefunden', 'drucker-fehlt-nach-umzug', 'drucker-welcher-drucker'],
      },
      {
        id: 'dr-standard', titel: 'Falscher Standarddrucker oder falsche Einstellungen', beschreibung: 'Ausdruck kommt am falschen Drucker, „Speichern unter“ statt Druck, Standarddrucker springt um, Einstellungen weg',
        sonden: ['drusr', 'dr'],
        fragen: [
          { id: 'nachAnmeldung', text: 'Sind Ihre Druckeinstellungen nach jeder Anmeldung wieder zurückgesetzt?' },
          { id: 'programm', text: 'Druckt nur ein bestimmtes Programm am falschen Drucker?' },
        ],
        regeln: [
          { id: 'virtuell', wenn: f => ja(f['drusr.standardVirtuell']), befund: f => `Standarddrucker ist „${txt(f['drusr.standard'])}“ – deshalb kommt „Speichern unter“`, problem: 'drucker-speichern-unter-statt-druck', schwere: 3 },
          { id: 'kein-standard', wenn: f => f['drusr.standard'] === '' || ja(f['drusr.standardFehlt']), befund: f => (txt(f['drusr.standard']) ? `Standarddrucker „${txt(f['drusr.standard'])}“ ist nicht mehr installiert` : 'Es ist kein Standarddrucker festgelegt'), problem: 'drucker-kein-standarddrucker', schwere: 3 },
          { id: 'windows-verwaltet', wenn: f => ja(f['drusr.windowsVerwaltet']), befund: () => '„Windows verwaltet Standarddrucker“ ist an – der zuletzt benutzte Drucker wird Standard', problem: 'drucker-standard-wechselt', schwere: 2 },
          { id: 'programm', wenn: f => f['frage.programm'] === 'ja', befund: () => 'Das Programm merkt sich einen eigenen (alten) Drucker', problem: 'drucker-falscher-drucker-programm', schwere: 2 },
          { id: 'einstellungen-weg', wenn: f => f['frage.nachAnmeldung'] === 'ja', befund: f => `Druckeinstellungen gehen bei der Anmeldung verloren (gespeichert für ${f['drusr.eigeneEinstellungen'] ?? 0} Drucker)`, problem: 'druck-einstellungen-nach-anmeldung-weg', schwere: 2 },
          { id: 'wsd', wenn: f => liste(f['dr.wsd']).length > 0, befund: f => `Automatisch eingerichtete Drucker (WSD) können Standard werden: ${txt(f['dr.wsd'])}`, problem: 'drucker-fremder-drucker-wsd', schwere: 1 },
        ],
        ohneBefund: ['drucker-einstellungen-verstellt', 'drucker-standard-nicht-gespeichert', 'drucker-fehler-0x709', 'drucker-standard-wechselt'],
      },
      {
        id: 'dr-scan', titel: 'Scannen klappt nicht oder Scan kommt nicht an', beschreibung: 'Scan landet nicht im Ordner/Postfach, Scan-Programm findet den Scanner nicht, „Scannen an PC“ geht nicht',
        sonden: ['drgeraet'],
        fragen: [
          { id: 'ordner', text: 'Scannen Sie am Kopierer in einen Netzordner (Scan to Folder)?' },
          { id: 'mail', text: 'Scannen Sie am Kopierer an Ihre E-Mail-Adresse?' },
          { id: 'usb', text: 'Ist der Scanner per USB direkt an diesem PC angeschlossen?' },
          { id: 'anPc', text: 'Wählen Sie am Kopierer „Scannen an PC“ bzw. „Scan to Computer“?' },
        ],
        regeln: [
          { id: 'wia', wenn: f => txt(f['drgeraet.wiaStart']) === 'Disabled' || (f['drgeraet.wiaDienst'] != null && txt(f['drgeraet.wiaDienst']) !== 'Running' && liste(f['drgeraet.scanner']).length > 0), befund: f => `Scannerdienst (WIA) läuft nicht (${txt(f['drgeraet.wiaDienst'])}, Start ${txt(f['drgeraet.wiaStart'])})`, problem: 'drucker-scan-programm-wia', schwere: 3 },
          { id: 'scanner-fehler', wenn: f => liste(f['drgeraet.scannerFehler']).length > 0, befund: f => `Scanner mit Gerätefehler: ${txt(f['drgeraet.scannerFehler'])}`, problem: 'drucker-scanner-usb', schwere: 3 },
          { id: 'kein-scanner', wenn: f => f['frage.usb'] === 'ja' && f['drgeraet.scanner'] != null && liste(f['drgeraet.scanner']).length === 0, befund: () => 'Am PC ist kein Scanner erkannt', problem: 'drucker-scanner-usb', schwere: 3 },
          { id: 'twain', wenn: f => f['frage.usb'] === 'ja' && f['drgeraet.twainQuellen'] != null && num(f['drgeraet.twainQuellen']) === 0, befund: () => 'Keine TWAIN-Quelle installiert – Scan-Programme finden den Scanner nicht', problem: 'drucker-twain-quelle-fehlt', schwere: 2 },
          { id: 'fd', wenn: f => f['frage.anPc'] === 'ja' && f['drgeraet.fdDienst'] != null && txt(f['drgeraet.fdDienst']) !== 'Running', befund: f => `Dienst „Funktionssuche-Ressourcenveröffentlichung“ läuft nicht (${txt(f['drgeraet.fdDienst'])}) – Kopierer findet den PC nicht`, problem: 'druck-scan-an-pc', schwere: 2 },
          { id: 'ordner', wenn: f => f['frage.ordner'] === 'ja', befund: () => 'Scan to Folder: Ziel-Ordner bzw. Scan-Konto am Kopierer prüfen', problem: 'drucker-scan-ordner', schwere: 2 },
          { id: 'mail', wenn: f => f['frage.mail'] === 'ja', befund: () => 'Scan to Mail: Zustellung bzw. Adressbuch am Kopierer prüfen', problem: 'drucker-scan-mail', schwere: 2 },
        ],
        ohneBefund: ['drucker-scan-ordner', 'drucker-scan-mail', 'drucker-scan-programm-wia', 'druck-scan-an-pc'],
      },
      {
        id: 'dr-etikett', titel: 'Etiketten-, Bon- oder USB-Drucker druckt nicht', beschreibung: 'Zebra, Brother, DYMO oder ein USB-Drucker am Arbeitsplatz reagiert nicht oder wird nicht erkannt',
        sonden: ['drgeraet', 'dr'],
        fragen: [{ id: 'etikett', text: 'Geht es um einen Etikettendrucker?' }],
        regeln: [
          { id: 'geraet-fehler', wenn: f => liste(f['drgeraet.druckerGeraetFehler']).length > 0, befund: f => `Drucker im Geräte-Manager mit Fehler: ${txt(f['drgeraet.druckerGeraetFehler'])}`, problem: 'drucker-usb-drucker-nicht-erkannt', schwere: 3 },
          { id: 'spooler', wenn: f => spoolerSteht(f['dr.spooler']), befund: f => `Druckwarteschlange läuft nicht (${txt(f['dr.spooler'])})`, problem: 'drucker-spooler-absturz', schwere: 3 },
          { id: 'kein-etikett', wenn: f => f['frage.etikett'] === 'ja' && f['drgeraet.etikettDrucker'] != null && liste(f['drgeraet.etikettDrucker']).length === 0, befund: () => 'Auf dem PC ist kein Etikettendrucker installiert', problem: 'drucker-etikettendrucker', schwere: 3 },
          { id: 'etikett-offline', wenn: f => liste(f['drgeraet.etikettOffline']).length > 0, befund: f => `Etikettendrucker steht auf „Offline“: ${txt(f['drgeraet.etikettOffline'])}`, problem: 'drucker-usb-drucker-offline-nach-standby', schwere: 3 },
          { id: 'usb-offline', wenn: f => liste(f['drgeraet.usbOffline']).length > 0, befund: f => `USB-Drucker steht auf „Offline“: ${txt(f['drgeraet.usbOffline'])}`, problem: 'drucker-usb-drucker-offline-nach-standby', schwere: 2 },
          { id: 'dymo', wenn: f => ja(f['drgeraet.dymoDrucker']) && nein(f['drgeraet.dymoSoftware']), befund: () => 'DYMO-Drucker ist installiert, aber DYMO Connect fehlt', problem: 'drucker-dymo', schwere: 2 },
          { id: 'nur-text', wenn: f => liste(f['drgeraet.nurTextTreiber']).length > 0, befund: f => `Drucker mit Treiber „Generic / Text Only“: ${txt(f['drgeraet.nurTextTreiber'])}`, problem: 'drucker-zpl-code-als-text', schwere: 1 },
          { id: 'auftrag-alt', wenn: f => num(f['dr.alteAuftraege']) > 0, befund: f => `${f['dr.alteAuftraege']} Auftrag/Aufträge hängen seit über 30 Minuten`, problem: 'drucker-druckt-nicht', schwere: 1 },
        ],
        ohneBefund: ['drucker-etikettendrucker', 'drucker-zebra-leere-etiketten', 'drucker-etiketten-verrutscht', 'drucker-usb-drucker-nicht-erkannt'],
      },
      {
        id: 'dr-seal', titel: 'SEAL-Drucker (PMD…) druckt nicht oder zeigt „Unbekannt“', beschreibung: 'Ein PMD-Drucker zeigt Status „Unbekannt“, „Fehler beim Schreiben auf PLS_…“ oder der SEAL-Assistent fehlt',
        sonden: ['dr', 'net'],
        regeln: [
          { id: 'seal-fehlt', wenn: f => nein(f['dr.sealInstalliert']), befund: () => 'SEAL Add Printer Wizard ist nicht installiert', problem: 'drucker-seal-wizard-fehlt', schwere: 3 },
          { id: 'pls', wenn: f => num(f['dr.plsFehler7']) > 0, befund: f => `${f['dr.plsFehler7']} Fehler an SEAL-Anschlüssen (PLS_) in 7 Tagen`, problem: 'drucker-pls-port-fehler', schwere: 3 },
          { id: 'pmd-offline', wenn: f => liste(f['dr.pmdOffline']).length > 0, befund: f => `SEAL-Drucker offline/unbekannt: ${txt(f['dr.pmdOffline'])}`, problem: 'drucker-status-unbekannt', schwere: 3 },
          { id: 'keine-pmd', wenn: f => ja(f['dr.sealInstalliert']) && f['dr.pmdAnzahl'] != null && num(f['dr.pmdAnzahl']) === 0, befund: () => 'SEAL ist installiert, aber kein PMD-Drucker eingerichtet', problem: 'drucker-verbinden', schwere: 2 },
          { id: 'homeoffice', wenn: f => nein(f['net.domaeneErreichbar']) && nein(f['dr.w3149']), befund: () => 'Firmennetz und Druckserver nicht erreichbar – SEAL-Drucker gehen nur im Firmennetz/mit Zscaler', problem: 'drucker-homeoffice', schwere: 2 },
          { id: 'server-weg', wenn: f => ja(f['net.domaeneErreichbar']) && nein(f['dr.w3149']) && nein(f['dr.w3150']), befund: () => 'Beide Druckserver (w3149, w3150) nicht erreichbar', problem: 'druck-niemand-kann-drucken', schwere: 2 },
          { id: 'ip-direkt', wenn: f => liste(f['dr.ipDirekt']).length > 0, befund: f => `Drucker direkt per IP statt über SEAL eingerichtet: ${txt(f['dr.ipDirekt'])}`, problem: 'drucker-ip-direktverbindung', schwere: 1 },
          { id: 'spool-voll', wenn: f => num(f['dr.spoolMB']) >= 500, befund: f => `Spool-Ordner belegt ${zahl(f['dr.spoolMB'])} MB`, problem: 'drucker-spool-ordner-voll', schwere: 1 },
        ],
        ohneBefund: ['drucker-pls-port-fehler', 'drucker-status-unbekannt', 'drucker-nach-geraetetausch', 'drucker-seal-wizard-fehlt'],
      },
    ],
  },
]
