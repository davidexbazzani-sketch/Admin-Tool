// ── Diagnose-Thema „VPN, Zscaler & Homeoffice“ ───────────────────────────────
// Sonden: zs = Zscaler Client Connector (Dienst, Tunnel, Version, Zertifikat, CPU, Protokolle)
//         vpn = Cisco Secure Client/AnyConnect, andere VPN-Programme, Windows-VPN, Remotedesktop.
// Mitbenutzt: net, aad (gemeinsam), dnsprx/dnsweb (Netz). Alles NUR LESEND.
import { ja, liste, nein, num, txt, zahl } from '../motor'
import type { DgFakten, DgOber, DgSonde } from '../types'
import { ausserhalbFirmennetz } from './laufwerke'

const da = (f: DgFakten, k: string): boolean => f[k] !== null && f[k] !== undefined && f[k] !== ''
/** Zscaler installiert, Dienst bekannt und läuft NICHT */
const zsSteht = (f: DgFakten): boolean => ja(f['zs.installiert']) && da(f, 'zs.dienst') && txt(f['zs.dienst']) !== 'Running'
/** Zscaler-Dienst läuft */
const zsLaeuft = (f: DgFakten): boolean => ja(f['zs.installiert']) && txt(f['zs.dienst']) === 'Running'

export const SONDEN_VPN: DgSonde[] = [
  {
    id: 'zs', titel: 'Zscaler (Dienst, Tunnel, Version, Zertifikat, Protokolle)', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
$sv = Get-Service -Name 'ZSAService' -EA SilentlyContinue
$uk = @(Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { [string]$_.DisplayName -match '(?i)Zscaler' })
$inst = [bool]$sv -or $uk.Count -gt 0
Fakt 'installiert' $inst
if (-not $inst) {
  Punkt 'Zscaler Client Connector' 'info' 'nicht installiert'
} else {
  $ver = $(if ($uk.Count) { [string]$uk[0].DisplayVersion } else { $null })
  $alter = $null
  if ($uk.Count -and [string]$uk[0].InstallDate -match '^\d{8}$') { try { $alter = [int]((Get-Date) - [datetime]::ParseExact([string]$uk[0].InstallDate, 'yyyyMMdd', $null)).TotalDays } catch {} }
  Fakt 'version' $ver; Fakt 'alterTage' $alter
  Punkt 'Zscaler Client Connector' $(if ($alter -gt 365) { 'warn' } else { 'ok' }) ('Version ' + $ver + $(if ($null -ne $alter) { ', installiert vor ' + $alter + ' Tagen' } else { '' }))
  Fakt 'dienst' $(if ($sv) { [string]$sv.Status } else { 'fehlt' }); Fakt 'dienstStart' $(if ($sv) { [string]$sv.StartType } else { $null })
  Punkt 'Dienst ZSAService' $(if (-not $sv) { 'fehler' } elseif ($sv.Status -ne 'Running') { 'fehler' } elseif ([string]$sv.StartType -ne 'Automatic') { 'warn' } else { 'ok' }) $(if ($sv) { [string]$sv.Status + ' (Start: ' + [string]$sv.StartType + ')' } else { 'Dienst fehlt – Installation beschädigt' })
  $tun = @(Get-Process -Name 'ZSATunnel' -EA SilentlyContinue).Count -gt 0
  $tray = @(Get-Process -Name 'ZSATray' -EA SilentlyContinue).Count -gt 0
  Fakt 'tunnel' $tun; Fakt 'tray' $tray
  Punkt 'Tunnel (ZSATunnel)' $(if ($tun) { 'ok' } else { 'fehler' }) $(if ($tun) { 'läuft' } else { 'läuft NICHT – kein Tunnel aufgebaut' })
  Punkt 'Zscaler-App (ZSATray)' $(if ($tray) { 'ok' } else { 'warn' }) $(if ($tray) { 'läuft' } else { 'läuft nicht (kein Symbol im Infobereich)' })
  $zad = @(Get-NetAdapter -IncludeHidden -EA SilentlyContinue | Where-Object { [string]$_.InterfaceDescription -match '(?i)Zscaler' })
  Fakt 'adapter' $(if ($zad.Count) { [string]$zad[0].Status } else { $null })
  if ($zad.Count) { Punkt 'Zscaler-Netzwerkadapter' 'info' ([string]$zad[0].Status) }
  $ca = @(Get-ChildItem -Path 'Cert:\LocalMachine\Root' -EA SilentlyContinue | Where-Object { [string]$_.Subject -match '(?i)Zscaler' })
  $caTage = $null; if ($ca.Count) { $caTage = [math]::Round((($ca | Sort-Object NotAfter -Descending | Select-Object -First 1).NotAfter - (Get-Date)).TotalDays) }
  Fakt 'rootCa' ($ca.Count -gt 0); Fakt 'rootCaTage' $caTage
  Punkt 'Zscaler-Stammzertifikat' $(if (-not $ca.Count) { 'fehler' } elseif ($caTage -lt 30) { 'warn' } else { 'ok' }) $(if ($ca.Count) { 'vorhanden, noch ' + $caTage + ' Tage gültig' } else { 'FEHLT im Zertifikatspeicher des Computers' })
  $cpu = $null
  $les = @(Get-Process -Name 'ZSA*' -EA SilentlyContinue | Where-Object { $null -ne $_.CPU })
  if ($les.Count) {
    $c1 = 0.0; foreach ($proc in $les) { $c1 += [double]$proc.CPU }
    Start-Sleep -Seconds 2
    $c2 = 0.0; foreach ($proc in @(Get-Process -Name 'ZSA*' -EA SilentlyContinue | Where-Object { $null -ne $_.CPU })) { $c2 += [double]$proc.CPU }
    $cpu = [math]::Round([math]::Max(0, ($c2 - $c1) / 2 / [Environment]::ProcessorCount * 100), 1)
  }
  Fakt 'cpuProzent' $cpu
  if ($null -ne $cpu) { Punkt 'CPU-Last von Zscaler' $(if ($cpu -ge 25) { 'warn' } else { 'ok' }) (([string]$cpu).Replace('.', ',') + ' %') }
  $ld = @(Get-ChildItem -LiteralPath 'C:\ProgramData\Zscaler' -Directory -EA SilentlyContinue | Where-Object { $_.Name -match '(?i)^log' } | ForEach-Object { $_.FullName })
  $dat = @(); foreach ($d in $ld) { $dat += @(Get-ChildItem -LiteralPath $d -File -EA SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-3) }) }
  $dat = @($dat | Sort-Object LastWriteTime -Descending | Select-Object -First 6)
  Fakt 'logDateien' $dat.Count
  if ($dat.Count) {
    $muster = [ordered]@{ captive = '(?i)captive'; intern = '(?i)internal.?error|interner fehler'; netz = '(?i)network.?error|netzwerkfehler'; anmeldung = '(?i)saml|token.{0,30}(expir|invalid|fail)|auth\w*.{0,20}fail|re-?auth' }
    $anz = @{ captive = 0; intern = 0; netz = 0; anmeldung = 0 }
    foreach ($ldat in $dat) { foreach ($z in @(Get-Content -LiteralPath $ldat.FullName -Tail 2000 -EA SilentlyContinue)) { foreach ($k in @($muster.Keys)) { if ([string]$z -match $muster[$k]) { $anz[$k]++ } } } }
    Fakt 'logCaptive' $anz['captive']; Fakt 'logIntern' $anz['intern']; Fakt 'logNetz' $anz['netz']; Fakt 'logAnmeldung' $anz['anmeldung']
    Punkt 'Zscaler-Protokolle (3 Tage)' $(if ($anz['intern'] -or $anz['captive'] -ge 3 -or $anz['anmeldung'] -ge 5) { 'warn' } else { 'ok' }) ('' + $dat.Count + ' Datei(en): Captive Portal ' + $anz['captive'] + '×, interner Fehler ' + $anz['intern'] + '×, Netzwerkfehler ' + $anz['netz'] + '×, Anmeldung ' + $anz['anmeldung'] + '×')
  } else { Punkt 'Zscaler-Protokolle (3 Tage)' 'info' 'keine lesbaren Protokolle gefunden' }
}
`,
  },
  {
    id: 'vpn', titel: 'Cisco-VPN, andere VPN-Programme und Remotedesktop', modus: 'system', timeoutMs: 60000,
    ps: String.raw`
$sw = @(Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object { [string]$_.DisplayName + '|' + [string]$_.DisplayVersion } | Select-Object -Unique)
$alt = @($sw | Where-Object { $_ -match '(?i)^Cisco AnyConnect Secure Mobility Client' })
$neu = @($sw | Where-Object { $_ -match '(?i)^Cisco Secure Client' })
$cInst = ($alt.Count + $neu.Count) -gt 0
Fakt 'ciscoInstalliert' $cInst; Fakt 'ciscoDoppelt' ($alt.Count -gt 0 -and $neu.Count -gt 0)
if ($cInst) {
  $haupt = @($neu + $alt)[0]
  Fakt 'ciscoName' (($haupt -split '\|')[0]); Fakt 'ciscoVersion' (($haupt -split '\|')[1])
  Punkt 'Cisco-VPN-Programm' $(if ($alt.Count -and $neu.Count) { 'fehler' } else { 'ok' }) $(if ($alt.Count -and $neu.Count) { 'ALTER AnyConnect UND neuer Secure Client installiert' } else { ($haupt -replace '\|', ' ') })
  $ag = @(Get-Service -Name 'csc_vpnagent', 'vpnagent' -EA SilentlyContinue | Select-Object -First 1)
  Fakt 'ciscoDienst' $(if ($ag.Count) { [string]$ag[0].Status } else { $null })
  Punkt 'Cisco-VPN-Dienst' $(if (-not $ag.Count) { 'fehler' } elseif ($ag[0].Status -eq 'Running') { 'ok' } else { 'fehler' }) $(if ($ag.Count) { [string]$ag[0].DisplayName + ': ' + [string]$ag[0].Status + ' (' + [string]$ag[0].StartType + ')' } else { 'Dienst fehlt' })
  $pf = @()
  foreach ($o in @('C:\ProgramData\Cisco\Cisco Secure Client\VPN\Profile', 'C:\ProgramData\Cisco\Cisco AnyConnect Secure Mobility Client\Profile')) { $pf += @(Get-ChildItem -LiteralPath $o -Filter '*.xml' -File -EA SilentlyContinue) }
  Fakt 'ciscoProfile' $pf.Count
  Punkt 'Cisco-VPN-Profile' $(if ($pf.Count) { 'ok' } else { 'warn' }) $(if ($pf.Count) { '' + $pf.Count + ' (' + ((@($pf | ForEach-Object { $_.BaseName }) | Select-Object -Unique) -join ', ') + ')' } else { 'keine – das Feld für das VPN-Ziel bleibt leer' })
  $cf = 0
  foreach ($lg in @(Get-WinEvent -ListLog '*Cisco*' -EA SilentlyContinue | Where-Object { $_.RecordCount })) { $cf += @(Get-WinEvent -FilterHashtable @{ LogName = $lg.LogName; Level = 2; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue).Count }
  Fakt 'ciscoFehler7' $cf
  Punkt 'Cisco-VPN-Fehlermeldungen (7 Tage)' $(if ($cf -ge 3) { 'warn' } else { 'ok' }) ('' + $cf)
} else { Punkt 'Cisco-VPN-Programm' 'info' 'nicht installiert' }
$adp = @(Get-NetAdapter -IncludeHidden -EA SilentlyContinue)
$cUp = @($adp | Where-Object { $_.Status -eq 'Up' -and [string]$_.InterfaceDescription -match '(?i)Cisco AnyConnect|Cisco Secure Client' })
Fakt 'ciscoVerbunden' ($cUp.Count -gt 0)
if ($cInst) { Punkt 'Cisco-VPN verbunden' 'info' $(if ($cUp.Count) { 'ja' } else { 'nein' }) }
$andere = @($sw | Where-Object { $_ -match '(?i)FortiClient|GlobalProtect|OpenVPN|WireGuard|NordVPN|Proton ?VPN|ExpressVPN|Surfshark|Windscribe|CyberGhost|Hotspot Shield|hide\.me|Psiphon|TunnelBear|Mullvad|Private Internet Access|SoftEther|ZeroTier|Tailscale|Hamachi|Check Point.*VPN|SonicWall|Shrew' } | ForEach-Object { ($_ -split '\|')[0] })
$privat = @($andere | Where-Object { $_ -match '(?i)NordVPN|Proton ?VPN|ExpressVPN|Surfshark|Windscribe|CyberGhost|Hotspot Shield|hide\.me|Psiphon|TunnelBear|Mullvad|Private Internet Access|Hamachi' })
Fakt 'andereVpn' @($andere); Fakt 'privatVpn' @($privat)
Punkt 'Weitere VPN-Programme' $(if ($privat.Count) { 'fehler' } elseif ($andere.Count) { 'info' } else { 'ok' }) $(if ($andere.Count) { ($andere -join ', ') + $(if ($privat.Count) { ' – PRIVATES VPN' } else { '' }) } else { 'keine' })
$fUp = @($adp | Where-Object { $_.Status -eq 'Up' -and [string]$_.InterfaceDescription -match '(?i)TAP-Windows|Wintun|WireGuard|Fortinet|PANGP|NordLynx|ProtonVPN|OpenVPN|ZeroTier|Tailscale|Hamachi|SoftEther|Check Point|SonicWall' } | ForEach-Object { [string]$_.InterfaceDescription })
$wv = @(); try { $wv = @(Get-VpnConnection -AllUserConnection -EA Stop) } catch {}
$wvUp = @($wv | Where-Object { [string]$_.ConnectionStatus -eq 'Connected' } | ForEach-Object { 'Windows-VPN ' + [string]$_.Name })
$fremdAktiv = @($fUp) + @($wvUp)
Fakt 'fremdVpnAktiv' @($fremdAktiv); Fakt 'windowsVpn' $wv.Count
Punkt 'Fremdes VPN gerade verbunden' $(if ($fremdAktiv.Count) { 'warn' } else { 'ok' }) $(if ($fremdAktiv.Count) { $fremdAktiv -join ', ' } else { 'nein' })
$ts = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' -Name fDenyTSConnections -EA SilentlyContinue
$rdpAn = $null; if ($ts) { $rdpAn = ($ts.fDenyTSConnections -eq 0) }
$tsv = Get-Service -Name 'TermService' -EA SilentlyContinue
Fakt 'rdpErlaubt' $rdpAn; Fakt 'rdpDienst' $(if ($tsv) { [string]$tsv.Status } else { $null })
Fakt 'mstsc' (Test-Path -LiteralPath (Join-Path $env:SystemRoot 'System32\mstsc.exe'))
Punkt 'Remotedesktop auf DIESEN PC' 'info' $(if ($rdpAn) { 'erlaubt (Dienst ' + $(if ($tsv) { [string]$tsv.Status } else { '?' }) + ')' } else { 'nicht erlaubt' })
`,
  },
]

export const THEMEN_VPN: DgOber[] = [
  {
    id: 'vpn', titel: 'VPN, Zscaler & Homeoffice', symbol: 'ShieldCheck', beschreibung: 'Zscaler nicht angemeldet, im Homeoffice keine Laufwerke/Intranet, Zscaler langsam oder blockiert, Cisco-VPN, Remotedesktop',
    unter: [
      {
        id: 'zs-anmeldung', titel: 'Zscaler ist nicht angemeldet oder nicht verbunden', beschreibung: 'Zscaler zeigt „Nicht angemeldet“, „Verbindung wird hergestellt“, „Interner Fehler“, das Symbol fehlt oder das Anmeldefenster kommt immer wieder',
        sonden: ['zs', 'aad', 'net'],
        regeln: [
          { id: 'fehlt', wenn: f => nein(f['zs.installiert']), befund: () => 'Zscaler ist auf diesem PC nicht installiert', problem: 'vpn-zscaler-nicht-installiert', schwere: 3 },
          { id: 'starttyp', wenn: f => ja(f['zs.installiert']) && da(f, 'zs.dienstStart') && txt(f['zs.dienstStart']) !== 'Automatic', befund: f => `Zscaler-Dienst startet nicht automatisch (Start: ${txt(f['zs.dienstStart'])})`, problem: 'vpn-zscaler-dienst-startet-nicht', schwere: 3 },
          { id: 'dienst', wenn: f => zsSteht(f), befund: f => `Zscaler-Dienst läuft nicht (${txt(f['zs.dienst'])})`, problem: 'vpn-zscaler-symbol-fehlt', schwere: 3 },
          { id: 'kein-internet', wenn: f => nein(f['net.internet443']) && nein(f['net.dnsOk']), befund: () => 'Der PC hat selbst kein Internet (Namen werden nicht aufgelöst) – Zscaler kann sich nicht verbinden', problem: 'netz-kein-internet-verbunden', schwere: 3 },
          { id: 'tunnel', wenn: f => zsLaeuft(f) && nein(f['zs.tunnel']), befund: () => 'Zscaler-Dienst läuft, aber der Tunnel (ZSATunnel) ist nicht aufgebaut', problem: 'vpn-zscaler-verbindung-haengt', schwere: 2 },
          { id: 'kein-prt', wenn: f => ja(f['zs.installiert']) && nein(f['aad.prt']), befund: () => 'Anmeldetoken (PRT) fehlt – Zscaler kann sich nicht automatisch anmelden', problem: 'vpn-zscaler-nicht-angemeldet', schwere: 2 },
          { id: 'intern', wenn: f => num(f['zs.logIntern']) >= 3, befund: f => `Zscaler-Protokoll: ${f['zs.logIntern']}× „Interner Fehler“ in 3 Tagen`, problem: 'vpn-zscaler-interner-fehler', schwere: 2 },
          { id: 'anmeldeschleife', wenn: f => num(f['zs.logAnmeldung']) >= 10, befund: f => `Zscaler-Protokoll: ${f['zs.logAnmeldung']} Anmelde-/Token-Fehler in 3 Tagen`, problem: 'vpn-zscaler-anmeldeschleife', schwere: 1 },
        ],
        ohneBefund: ['vpn-zscaler-nicht-angemeldet', 'vpn-zscaler-verbindung-haengt', 'vpn-zscaler-anmeldeschleife', 'vpn-zscaler-staendige-anmeldung'],
      },
      {
        id: 'zs-intern', titel: 'Im Homeoffice: Laufwerke, Intranet oder interne Programme gehen nicht', beschreibung: 'Internet geht, aber Netzlaufwerke, Intranet, SAP oder Fachprogramme sind zu Hause nicht erreichbar',
        sonden: ['zs', 'net', 'aad', 'vpn', 'zpa'],
        regeln: [
          { id: 'fehlt', wenn: f => nein(f['zs.installiert']), befund: () => 'Zscaler ist nicht installiert – ohne Zscaler gibt es von zu Hause keinen Zugang ins Firmennetz', problem: 'vpn-zscaler-nicht-installiert', schwere: 3 },
          { id: 'zpa-basis', wenn: f => nein(f['zpa.basis']), befund: () => 'Die Grundrolle für den Fernzugriff („Remote Access“, Azure_AD_SSO_Akamai_EAA_Client) fehlt – ohne sie geht im Homeoffice keine einzige interne Anwendung, auch wenn die Rollen für SAP, enaio oder Babtec da sind', problem: 'vpn-fernzugriff-beantragen', schwere: 3, imBereich: ausserhalbFirmennetz },
          { id: 'zpa-fileserver', wenn: f => nein(f['zpa.fileserver']), befund: () => 'Die Homeoffice-Berechtigung für die Marine-Fileserver fehlt (EAA_File_Servers_Marine_Prod) – Laufwerke gehen von zu Hause nicht', problem: 'laufwerk-homeoffice-berechtigung-fehlt', schwere: 2, imBereich: ausserhalbFirmennetz },
          { id: 'zpa-sap', wenn: f => nein(f['zpa.sapProd']) || nein(f['zpa.sapNonProd']), befund: f => `SAP-Rolle(n) für das Homeoffice fehlen: ${[nein(f['zpa.sapProd']) ? '„Marine Production“' : '', nein(f['zpa.sapNonProd']) ? '„Marine Non Production“' : ''].filter(Boolean).join(' und ')} – nur relevant, wenn SAP gebraucht wird`, problem: 'sap-homeoffice-geht-nicht', schwere: 1, imBereich: ausserhalbFirmennetz },
          { id: 'zpa-enaio', wenn: f => nein(f['zpa.enaio']), befund: () => 'Rolle „Marine enaio“ fehlt – enaio geht von zu Hause nicht (nur relevant, wenn enaio gebraucht wird)', problem: 'vpn-enaio-homeoffice', schwere: 1, imBereich: ausserhalbFirmennetz },
          { id: 'zpa-babtec', wenn: f => nein(f['zpa.babtec']), befund: () => 'Rolle „Marine Babtec“ fehlt – Babtec geht von zu Hause nicht (nur relevant, wenn Babtec gebraucht wird)', problem: 'vpn-babtec-homeoffice', schwere: 1, imBereich: ausserhalbFirmennetz },
          { id: 'dienst', wenn: f => zsSteht(f), befund: f => `Zscaler-Dienst läuft nicht (${txt(f['zs.dienst'])})`, problem: 'vpn-zscaler-symbol-fehlt', schwere: 3 },
          { id: 'cisco-konflikt', wenn: f => ja(f['vpn.ciscoVerbunden']) && zsLaeuft(f), befund: () => 'Cisco-VPN ist verbunden, während Zscaler läuft – beide kommen sich in die Quere', problem: 'vpn-cisco-zscaler-konflikt', schwere: 3 },
          { id: 'privat-vpn', wenn: f => liste(f['vpn.privatVpn']).length > 0, befund: f => `Privates VPN-Programm installiert: ${txt(f['vpn.privatVpn'])}`, problem: 'vpn-privates-vpn', schwere: 3 },
          { id: 'tunnel', wenn: f => zsLaeuft(f) && nein(f['zs.tunnel']), befund: () => 'Zscaler-Dienst läuft, aber kein Tunnel aufgebaut', problem: 'vpn-zscaler-verbindung-haengt', schwere: 2 },
          { id: 'fremd-vpn', wenn: f => liste(f['vpn.fremdVpnAktiv']).length > 0, befund: f => `Ein anderes VPN ist gerade verbunden: ${txt(f['vpn.fremdVpnAktiv'])}`, problem: 'vpn-kunden-vpn-full-tunnel', schwere: 2 },
          { id: 'domaene-weg', wenn: f => zsLaeuft(f) && ja(f['zs.tunnel']) && da(f, 'net.domaene') && nein(f['net.domaeneErreichbar']), befund: f => `Zscaler läuft, aber die Domäne ${txt(f['net.domaene'])} ist nicht erreichbar (Private Access/ZPA)`, problem: 'vpn-intranet-homeoffice', schwere: 2 },
          { id: 'kerberos', wenn: f => ja(f['net.domaeneErreichbar']) && nein(f['aad.kerberosTgt']), befund: () => 'Firmennetz ist erreichbar, aber es gibt kein Kerberos-Anmeldeticket (Kennwort geändert?)', problem: 'vpn-nach-kennwortaenderung-homeoffice', schwere: 2 },
        ],
        ohneBefund: ['vpn-fernzugriff-beantragen', 'laufwerk-homeoffice-berechtigung-fehlt', 'vpn-intranet-homeoffice', 'vpn-einzelne-anwendung-homeoffice', 'vpn-zscaler-neuer-mitarbeiter-zpa'],
      },
      {
        id: 'zs-langsam', titel: 'Internet mit Zscaler langsam oder Seite blockiert', beschreibung: 'Seiten laden zäh oder nur halb, Zscaler-Sperrseite, Download wird blockiert, Lüfter läuft wegen Zscaler',
        sonden: ['zs', 'dnsprx', 'net'],
        fragen: [{ id: 'sperrseite', text: 'Erscheint statt der Webseite eine Zscaler-Seite („blockiert“ bzw. „Zugriff verweigert“)?' }],
        regeln: [
          { id: 'sperrseite', wenn: f => f['frage.sperrseite'] === 'ja', befund: () => 'Der Anwender sieht eine Zscaler-Sperrseite – die Seite ist per Richtlinie gesperrt', problem: 'vpn-zscaler-sperrseite', schwere: 3 },
          { id: 'proxy-haengt', wenn: f => ja(f['dnsprx.proxyZscaler']) && (zsSteht(f) || (zsLaeuft(f) && nein(f['zs.tunnel']))), befund: () => 'Browser nutzt den Zscaler-Proxy 127.0.0.1:9000, aber Zscaler läuft nicht richtig', problem: 'vpn-zscaler-proxy-127001-haengt', schwere: 3 },
          { id: 'cpu', wenn: f => num(f['zs.cpuProzent']) >= 25, befund: f => `Zscaler belastet den Prozessor mit ${zahl(f['zs.cpuProzent'])} %`, problem: 'vpn-zscaler-hohe-cpu', schwere: 3 },
          { id: 'captive', wenn: f => num(f['zs.logCaptive']) >= 3, befund: f => `Zscaler meldet ${f['zs.logCaptive']}× „Captive Portal“ in 3 Tagen`, problem: 'vpn-zscaler-netzwerkfehler', schwere: 2 },
          { id: 'netzfehler', wenn: f => num(f['zs.logNetz']) >= 10, befund: f => `Zscaler-Protokoll: ${f['zs.logNetz']}× „Netzwerkfehler“ in 3 Tagen`, problem: 'vpn-zscaler-meldet-staendig-getrennt', schwere: 2 },
          { id: 'proxy-fremd', wenn: f => ja(f['dnsprx.proxyFremd']), befund: f => `Zusätzlich ist ein fremder Proxy eingetragen: ${txt(f['dnsprx.proxyServer'])}`, problem: 'netz-proxy-antwortet-nicht', schwere: 2 },
          { id: 'zertifikat', wenn: f => ja(f['zs.installiert']) && nein(f['zs.rootCa']), befund: () => 'Das Zscaler-Stammzertifikat fehlt – Seiten melden Zertifikatsfehler', problem: 'vpn-zscaler-zertifikat', schwere: 2 },
          { id: 'veraltet', wenn: f => num(f['zs.alterTage']) > 365, befund: f => `Zscaler wurde seit ${f['zs.alterTage']} Tagen nicht aktualisiert (Version ${txt(f['zs.version'])})`, problem: 'vpn-zscaler-veraltet', schwere: 1 },
        ],
        ohneBefund: ['vpn-zscaler-langsam', 'vpn-zscaler-sperrseite', 'vpn-zscaler-seite-laedt-halb', 'vpn-download-blockiert'],
      },
      {
        id: 'vpn-cisco', titel: 'Cisco-VPN bzw. Kunden-VPN verbindet nicht', beschreibung: 'Cisco Secure Client/AnyConnect verbindet nicht, Feld für das VPN-Ziel ist leer, „VPN-Dienst nicht verfügbar“, Verbindung bricht ab',
        sonden: ['vpn', 'zs', 'net'],
        regeln: [
          { id: 'kein-internet', wenn: f => nein(f['net.internet443']) && nein(f['net.dnsOk']), befund: () => 'Der PC hat selbst kein Internet – das VPN kann sich nicht verbinden', problem: 'netz-kein-internet-verbunden', schwere: 3 },
          { id: 'dienst', wenn: f => ja(f['vpn.ciscoInstalliert']) && txt(f['vpn.ciscoDienst']) !== 'Running', befund: f => `Cisco-VPN-Dienst läuft nicht (${txt(f['vpn.ciscoDienst']) || 'fehlt'})`, problem: 'vpn-cisco-dienst-nicht-verfuegbar', schwere: 3 },
          { id: 'doppelt', wenn: f => ja(f['vpn.ciscoDoppelt']), befund: () => 'Alter AnyConnect und neuer Cisco Secure Client sind gleichzeitig installiert', problem: 'vpn-cisco-anyconnect-doppelt', schwere: 3 },
          { id: 'keine-profile', wenn: f => ja(f['vpn.ciscoInstalliert']) && num(f['vpn.ciscoProfile']) === 0, befund: () => 'Cisco-VPN hat keine Verbindungsprofile – das Zielfeld bleibt leer', problem: 'vpn-cisco-keine-profile', schwere: 2 },
          { id: 'zscaler-konflikt', wenn: f => ja(f['vpn.ciscoVerbunden']) && zsLaeuft(f), befund: () => 'Cisco-VPN und Zscaler sind gleichzeitig aktiv', problem: 'vpn-cisco-zscaler-konflikt', schwere: 2 },
          { id: 'privat-vpn', wenn: f => liste(f['vpn.privatVpn']).length > 0, befund: f => `Privates VPN-Programm installiert: ${txt(f['vpn.privatVpn'])}`, problem: 'vpn-privates-vpn', schwere: 2 },
          { id: 'nicht-installiert', wenn: f => nein(f['vpn.ciscoInstalliert']) && liste(f['vpn.andereVpn']).length === 0, befund: () => 'Auf diesem PC ist kein Cisco-VPN und kein anderes VPN-Programm installiert', problem: 'vpn-kunden-vpn-installation', schwere: 2 },
          { id: 'fehler', wenn: f => num(f['vpn.ciscoFehler7']) >= 3, befund: f => `Cisco-VPN hat in 7 Tagen ${f['vpn.ciscoFehler7']} Fehler protokolliert`, problem: 'vpn-cisco-trennt-staendig', schwere: 1 },
        ],
        ohneBefund: ['vpn-cisco-verbindet-nicht', 'vpn-cisco-zertifikat', 'vpn-cisco-trennt-staendig', 'vpn-kunden-vpn-fernwartung'],
      },
      {
        id: 'vpn-rdp', titel: 'Remotedesktop von zu Hause auf den Büro-PC', beschreibung: 'Remotedesktopverbindung findet den Büro-PC nicht, „Remotecomputer nicht gefunden“ oder Anmeldung scheitert',
        sonden: ['zs', 'net', 'aad', 'vpn'],
        fragen: [{ id: 'buero', text: 'Ist der Büro-PC eingeschaltet und am Netz (nicht heruntergefahren oder im Standby)?' }],
        regeln: [
          { id: 'zs-dienst', wenn: f => zsSteht(f), befund: f => `Zscaler-Dienst läuft nicht (${txt(f['zs.dienst'])}) – ohne ihn ist der Büro-PC nicht erreichbar`, problem: 'vpn-zscaler-symbol-fehlt', schwere: 3 },
          { id: 'buero-aus', wenn: f => f['frage.buero'] === 'nein', befund: () => 'Der Büro-PC ist laut Anwender aus oder im Standby', problem: 'netz-standby-nicht-erreichbar', schwere: 3 },
          { id: 'tunnel', wenn: f => zsLaeuft(f) && nein(f['zs.tunnel']), befund: () => 'Zscaler-Dienst läuft, aber kein Tunnel aufgebaut', problem: 'vpn-zscaler-verbindung-haengt', schwere: 2 },
          { id: 'firmennetz', wenn: f => zsLaeuft(f) && da(f, 'net.domaene') && nein(f['net.domaeneErreichbar']), befund: f => `Domäne ${txt(f['net.domaene'])} ist über Zscaler nicht erreichbar – Büro-PCs damit auch nicht`, problem: 'vpn-remotedesktop-homeoffice', schwere: 2 },
          { id: 'dns', wenn: f => nein(f['net.dnsOk']) && da(f, 'net.ip'), befund: () => 'Namen werden nicht aufgelöst – der Büro-PC wird nicht gefunden', problem: 'netz-dns-fehler', schwere: 2 },
          { id: 'privat-vpn', wenn: f => liste(f['vpn.privatVpn']).length > 0, befund: f => `Privates VPN-Programm installiert: ${txt(f['vpn.privatVpn'])}`, problem: 'vpn-privates-vpn', schwere: 2 },
          { id: 'kerberos', wenn: f => nein(f['aad.kerberosTgt']) && ja(f['net.domaeneErreichbar']), befund: () => 'Kein Kerberos-Anmeldeticket – die Anmeldung am Büro-PC kann scheitern', problem: 'vpn-intranet-kennwortabfrage-homeoffice', schwere: 1 },
          { id: 'rdp-aus', wenn: f => nein(f['vpn.rdpErlaubt']), befund: () => 'Auf DIESEM PC ist Remotedesktop ausgeschaltet (wichtig, falls dies der Büro-PC ist)', problem: 'netz-rdp-zugang-einrichten', schwere: 1 },
        ],
        ohneBefund: ['vpn-remotedesktop-homeoffice', 'netz-rdp-zugang-einrichten', 'vpn-fernzugriff-beantragen'],
      },
    ],
  },
]
