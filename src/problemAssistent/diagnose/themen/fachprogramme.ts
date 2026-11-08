// ── Diagnose-Themen „SAP“ und „Fachprogramme (Coscom, EuroPar, SolidWorks, enaio, Gravur)“ ──
// Alles NUR LESEND: Sonden sammeln Fakten (<sonde>.<name>) und Prüfpunkte, Regeln verweisen auf den Katalog.
import { ja, liste, nein, num, txt, zahl } from '../motor'
import type { DgOber, DgSonde } from '../types'

/** Uninstall-Zweige der Maschine (64 + 32 Bit). */
const WEGE_HKLM = String.raw`$wege = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')`

/** Hat eine der Gruppen Benutzer / Authentifizierte Benutzer / Jeder / INTERAKTIV Ändern-Rechte (Schreiben + Löschen)? */
const SCHREIB_OK = String.raw`
function SchreibOk([string]$pfad) {
  try {
    $acl = Get-Acl -LiteralPath $pfad -EA Stop
    foreach ($re in @($acl.Access)) {
      if ([string]$re.AccessControlType -ne 'Allow') { continue }
      $sid = $null; try { $sid = $re.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } catch {}
      if ($sid -notin @('S-1-5-32-545', 'S-1-5-11', 'S-1-1-0', 'S-1-5-4')) { continue }
      $rw = [int64]$re.FileSystemRights
      if ((($rw -band 0x10116) -eq 0x10116) -or ($rw -band 0x10000000)) { return $true }
    }
    return $false
  } catch { return $null }
}
`

export const SONDEN_FACHPROGRAMME: DgSonde[] = [
  // ══ SAP GUI (Installation, Verbindungsliste, Erreichbarkeit, Abstürze, Trace) ══
  {
    id: 'sap', titel: 'SAP GUI (Version, Verbindungsliste, SAP-Server, Abstürze, Trace)', modus: 'profil', timeoutMs: 120000,
    ps: WEGE_HKLM + String.raw`
NeedHive
function TcpSap([string]$ziel, [int]$port) { try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($ziel, $port).Wait(3000) -and $t.Connected; $t.Close(); return [bool]$ok } catch { return $false } }
$gui = @(Get-ItemProperty $wege -EA SilentlyContinue | Where-Object { [string]$_.DisplayName -match '(?i)^SAP GUI|^SAPGUI|^SAP Logon' } | Sort-Object DisplayName -Unique)
$exe = @(@('C:\Program Files\SAP\FrontEnd\SAPgui\saplogon.exe', 'C:\Program Files (x86)\SAP\FrontEnd\SAPgui\saplogon.exe') | Where-Object { Test-Path -LiteralPath $_ })
$ver = $null
if ($exe.Count) { try { $ver = [string](Get-Item -LiteralPath $exe[0]).VersionInfo.ProductVersion } catch {} }
if (-not $ver -and $gui.Count) { $ver = [string]$gui[0].DisplayVersion }
$hv = 0
$nameTxt = ''; if ($gui.Count) { $nameTxt = [string]$gui[0].DisplayName }
if ([string]$ver -match '^(\d{3})0\.') { $hv = [int]$Matches[1] } elseif ($nameTxt -match '\b(\d)\.(\d)0\b') { $hv = [int]($Matches[1] + $Matches[2] + '0') }
$inst = ($exe.Count -gt 0) -or ($gui.Count -gt 0)
Fakt 'installiert' $inst; Fakt 'exeVorhanden' ($exe.Count -gt 0); Fakt 'version' $ver; Fakt 'hauptversion' $hv; Fakt 'zweiInstallationen' ($exe.Count -gt 1)
$st = 'ok'; if (-not $inst) { $st = 'fehler' } elseif ($exe.Count -ne 1) { $st = 'warn' }
Punkt 'SAP GUI' $st $(if (-not $inst) { 'nicht installiert' } else { 'installiert' + $(if ($ver) { ' (Version ' + $ver + ')' } else { '' }) + $(if ($exe.Count -gt 1) { ' – ZWEI Installationen (32 und 64 Bit)' } elseif (-not $exe.Count) { ' – saplogon.exe FEHLT (Installation beschädigt?)' } else { '' }) })
$wv = @(Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -EA SilentlyContinue | Where-Object { $_.pv })
Fakt 'webview2' ($wv.Count -gt 0)
Punkt 'Edge WebView2 (SAP-Startbild, HTML-Bereiche)' $(if ($wv.Count) { 'ok' } else { 'warn' }) $(if ($wv.Count) { 'installiert (' + [string]$wv[0].pv + ')' } else { 'nicht gefunden' })
$lsDatei = Join-Path $uRoam 'SAP\Common\SAPUILandscape.xml'
$lsDa = Test-Path -LiteralPath $lsDatei
$lsKB = $null; $lsOk = $null; $dienste = 0; $sncAnz = 0; $server = @(); $inkl = @()
if ($lsDa) {
  $lsKB = [math]::Round([double](Get-Item -LiteralPath $lsDatei).Length / 1KB, 1)
  try {
    [xml]$lx = [IO.File]::ReadAllText($lsDatei)
    $lsOk = $true
    if ($lx -and $lx.DocumentElement) {
      $dn = @($lx.SelectNodes('//Service'))
      $dienste = $dn.Count
      $sncAnz = @($dn | Where-Object { [string]$_.GetAttribute('sncname') }).Count
      $server = @($dn | ForEach-Object { [string]$_.GetAttribute('server') } | Where-Object { $_ } | Select-Object -Unique)
      $inkl = @($lx.SelectNodes('//Include') | ForEach-Object { [string]$_.GetAttribute('url') } | Where-Object { $_ })
    }
  } catch { $lsOk = $false }
}
$zentral = $null
foreach ($ow in @(($uHive + '\Software\SAP\SAPLogon\Options'), 'HKLM:\SOFTWARE\SAP\SAPLogon\Options', 'HKLM:\SOFTWARE\WOW6432Node\SAP\SAPLogon\Options')) {
  $ok2 = Get-Item -LiteralPath $ow -EA SilentlyContinue
  if (-not $ok2) { continue }
  foreach ($n in @($ok2.GetValueNames())) { $v = [string]$ok2.GetValue($n, ''); if (-not $zentral -and $v -match '(?i)^(\\\\|https?://).+\.xml$') { $zentral = $v } }
}
if (-not $zentral -and $inkl.Count) { $zentral = [string]$inkl[0] }
Fakt 'lsVorhanden' $lsDa; Fakt 'lsLesbar' $lsOk; Fakt 'lsKB' $lsKB; Fakt 'dienste' $dienste; Fakt 'sncEintraege' $sncAnz; Fakt 'zentral' ([bool]$zentral); Fakt 'zentralPfad' $zentral
$lst = 'ok'; if ($lsOk -eq $false -or ($lsDa -and $lsKB -eq 0)) { $lst = 'fehler' } elseif (-not $lsDa -and -not $zentral) { $lst = 'fehler' } elseif ($lsDa -and $dienste -eq 0 -and -not $zentral) { $lst = 'warn' }
Punkt 'Verbindungsliste (SAPUILandscape.xml)' $lst $(if (-not $lsDa) { 'FEHLT im Profil' } elseif ($lsOk -eq $false) { 'BESCHÄDIGT – nicht lesbar (' + $lsKB + ' KB)' } elseif ($lsKB -eq 0) { 'LEER (0 Byte)' } else { '' + $dienste + ' eigene Einträge, ' + $sncAnz + ' mit Single Sign-on (SNC)' })
Punkt 'Zentrale Verbindungsliste' $(if ($zentral) { 'ok' } else { 'info' }) $(if ($zentral) { [string]$zentral } else { 'keine eingebunden' })
$nAufl = @(); $nErr = @(); $gepr = 0
foreach ($sv in @($server | Select-Object -First 4)) {
  $teile = @([string]$sv -split ':'); $ziel = [string]$teile[0]
  if (-not $ziel) { continue }
  $pn = 0; if ($teile.Count -ge 2) { [void][int]::TryParse([string]$teile[1], [ref]$pn) }
  $gepr++
  $adr = @(); try { $adr = @([System.Net.Dns]::GetHostAddresses($ziel)) } catch {}
  if (-not $adr.Count) { $nAufl += $ziel; continue }
  if ($pn -gt 0 -and -not (TcpSap $ziel $pn)) { $nErr += [string]$sv }
}
Fakt 'zieleGeprueft' $gepr; Fakt 'nichtAufloesbar' @($nAufl); Fakt 'nichtErreichbar' @($nErr)
if ($gepr) { Punkt 'SAP-Server aus der Verbindungsliste' $(if ($nAufl.Count) { 'fehler' } elseif ($nErr.Count) { 'fehler' } else { 'ok' }) $(if ($nAufl.Count) { 'Name nicht auflösbar: ' + ($nAufl -join ', ') } elseif ($nErr.Count) { 'nicht erreichbar: ' + ($nErr -join ', ') } else { '' + $gepr + ' Server erreichbar' }) }
else { Punkt 'SAP-Server aus der Verbindungsliste' 'info' 'keine Server in der lokalen Liste (kommen ggf. aus der zentralen Liste)' }
$lp = @(); $procOk = $true
try { $lp = @(UserProcs @('saplogon', 'sapgui')) } catch { $procOk = $false; Punkt 'SAP-Prozesse des Benutzers' 'info' 'nicht lesbar (Adminrechte nötig)' }
if ($procOk) {
  $haengt = @($lp | Where-Object { -not $_.Responding }).Count -gt 0
  $ram = 0.0; foreach ($x in $lp) { $ram += [double]$x.WorkingSet64 / 1MB }
  Fakt 'laeuft' ($lp.Count -gt 0); Fakt 'haengt' $haengt; Fakt 'ramMB' ([math]::Round($ram))
  Punkt 'SAP Logon läuft' $(if ($haengt) { 'fehler' } else { 'info' }) $(if ($lp.Count) { 'ja, ' + [math]::Round($ram) + ' MB Arbeitsspeicher' + $(if ($haengt) { ' – reagiert NICHT' } else { '' }) } else { 'nein' })
}
$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000, 1002; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue | Where-Object { $_.Message -match '(?i)saplogon\.exe|sapgui\.exe' })
$ab = @($ev | Where-Object { $_.Id -eq 1000 }).Count; $hg = @($ev | Where-Object { $_.Id -eq 1002 }).Count
Fakt 'abstuerze7' $ab; Fakt 'haenger7' $hg
Punkt 'Abstürze / Hänger von SAP (7 Tage)' $(if ($ab -ge 2 -or $hg -ge 3) { 'fehler' } elseif ($ab -or $hg) { 'warn' } else { 'ok' }) ('' + $ab + ' Absturz/Abstürze, ' + $hg + ' Mal „reagiert nicht“')
$trc = $null
foreach ($tw in @(($uHive + '\Software\SAP\SAPGUI Front\SAP Frontend Server\Customize'), ($uHive + '\Software\SAP\SAPGUI Front\SAP Frontend Server\Administration'))) {
  $tv = (Get-ItemProperty -LiteralPath $tw -Name TraceLevel -EA SilentlyContinue).TraceLevel
  if ($null -ne $tv -and $null -eq $trc) { try { $trc = [int]$tv } catch {} }
}
$trMB = 0.0; foreach ($f in @(Get-ChildItem -LiteralPath (Join-Path $uRoam 'SAP\SAP GUI\Traces') -File -Recurse -EA SilentlyContinue)) { $trMB += [double]$f.Length / 1MB }
Fakt 'traceStufe' $trc; Fakt 'traceAn' ($null -ne $trc -and $trc -gt 0); Fakt 'traceMB' ([math]::Round($trMB, 1))
Punkt 'SAP-GUI-Trace' $(if ($trc -gt 0 -or $trMB -ge 100) { 'warn' } else { 'ok' }) $(if ($trc -gt 0) { 'EINGESCHALTET (Stufe ' + $trc + '), Trace-Dateien ' + [math]::Round($trMB, 1) + ' MB' } else { 'aus, Trace-Dateien ' + [math]::Round($trMB, 1) + ' MB' })
$skr = $null
foreach ($sw in @(($uHive + '\Software\SAP\SAPGUI Front\SAP Frontend Server\Security'), 'HKLM:\SOFTWARE\SAP\SAPGUI Front\SAP Frontend Server\Security', 'HKLM:\SOFTWARE\WOW6432Node\SAP\SAPGUI Front\SAP Frontend Server\Security')) {
  $v = (Get-ItemProperty -LiteralPath $sw -Name UserScripting -EA SilentlyContinue).UserScripting
  if ($null -ne $v -and $null -eq $skr) { try { $skr = [int]$v } catch {} }
}
Fakt 'skriptingAus' ($skr -eq 0)
if ($skr -eq 0) { Punkt 'SAP-Scripting' 'warn' 'ausgeschaltet (Excel-Makros/SAP-Skripte gehen nicht)' }
`,
  },
  // ══ SAP-Anmeldung: Kerberos (Windows + MIT Kinit), SNC-Bibliothek, Uhrzeit, Browser-Richtlinien ══
  {
    id: 'sapsso', titel: 'SAP-Anmeldung (Kerberos, Kinit, SNC-Bibliothek, Uhrzeit, Browser)', modus: 'benutzer', timeoutMs: 90000,
    ps: String.raw`
function KinitPfad {
  $orte = @()
  foreach ($b in @($env:ProgramFiles, [Environment]::GetEnvironmentVariable('ProgramFiles(x86)'))) { if ($b) { $orte += (Join-Path $b 'MIT\Kerberos\bin') } }
  foreach ($o in $orte) { $f = Join-Path $o 'kinit.exe'; if (Test-Path -LiteralPath $f) { return $f } }
  $c = Get-Command 'kinit.exe' -EA SilentlyContinue | Where-Object { $_.Source -notlike '*\System32\*' } | Select-Object -First 1
  if ($c) { return [string]$c.Source }
  return $null
}
$dom = [string]$env:USERDNSDOMAIN
Fakt 'domaenenKonto' ([bool]$dom)
$ki = KinitPfad
Fakt 'mitKerberos' ([bool]$ki)
$mitT = $null
if ($ki) {
  $kl = Join-Path (Split-Path $ki) 'klist.exe'
  if (Test-Path -LiteralPath $kl) {
    $aus = @(& $kl 2>&1 | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() })
    $mitT = ($aus.Count -gt 0) -and -not (($aus -join ' ') -match '(?i)No credentials cache|not found|keine Anmeldeinformationen')
  }
}
Fakt 'mitTickets' $mitT
Punkt 'MIT Kerberos (Kinit)' $(if (-not $ki) { 'info' } elseif ($mitT) { 'ok' } else { 'fehler' }) $(if (-not $ki) { 'nicht installiert – SAP nutzt die Windows-Anmeldung' } elseif ($mitT) { 'installiert, Ticket vorhanden' } else { 'installiert, aber KEIN Ticket – Kinit nicht ausgeführt oder abgelaufen' })
$wk = Join-Path $env:SystemRoot 'System32\klist.exe'
$kt = @(& $wk 2>$null | ForEach-Object { [string]$_ })
$srv = @($kt | Where-Object { $_ -match '^\s*Server:\s*' } | ForEach-Object { ($_ -replace '^\s*Server:\s*', '').Trim() })
$tgt = @($srv | Where-Object { $_ -match '(?i)^krbtgt/' }).Count -gt 0
$sapT = @($srv | Where-Object { $_ -match '(?i)sap' })
Fakt 'tgt' $tgt; Fakt 'tickets' $srv.Count; Fakt 'sapTickets' $sapT.Count
Punkt 'Windows-Kerberos (Anmeldeticket)' $(if ($tgt) { 'ok' } elseif ($dom) { 'fehler' } else { 'info' }) $(if ($tgt) { '' + $srv.Count + ' Ticket(s), davon ' + $sapT.Count + ' für SAP' } elseif ($dom) { 'KEIN Anmeldeticket (TGT) – SAP-Single-Sign-on scheitert' } else { 'kein Domänenkonto angemeldet' })
$snc = $null
foreach ($n in @('SNC_LIB_64', 'SNC_LIB')) { foreach ($ebene in @('User', 'Machine')) { $v = [Environment]::GetEnvironmentVariable($n, $ebene); if ($v -and -not $snc) { $snc = [string]$v } } }
$sncFehlt = $false
if ($snc -and -not (Test-Path -LiteralPath ([Environment]::ExpandEnvironmentVariables($snc)))) { $sncFehlt = $true }
Fakt 'sncLib' $snc; Fakt 'sncLibFehlt' $sncFehlt
Punkt 'SNC-Bibliothek (SNC_LIB)' $(if ($sncFehlt) { 'fehler' } elseif ($snc) { 'ok' } else { 'info' }) $(if ($sncFehlt) { $snc + ' – Datei FEHLT' } elseif ($snc) { $snc } else { 'nicht gesetzt (SAP GUI nimmt die eingebaute Bibliothek)' })
$abw = $null
if ($dom) {
  $sc = @(& (Join-Path $env:SystemRoot 'System32\w32tm.exe') /stripchart ('/computer:' + $dom) /samples:1 /dataonly 2>$null | ForEach-Object { [string]$_ })
  foreach ($z in $sc) { if ($z -match '([-+]\d+[.,]\d+)s\s*$') { try { $abw = [math]::Round([math]::Abs([double]::Parse(($Matches[1] -replace ',', '.'), [Globalization.CultureInfo]::InvariantCulture)), 1) } catch {} } }
}
Fakt 'zeitAbweichungSek' $abw
Punkt 'Uhrzeit gegenüber der Domäne' $(if ($null -eq $abw) { 'info' } elseif ($abw -ge 300) { 'fehler' } elseif ($abw -ge 60) { 'warn' } else { 'ok' }) $(if ($null -eq $abw) { 'nicht messbar' } else { 'Abweichung ' + $abw + ' s' + $(if ($abw -ge 300) { ' – zu groß für Kerberos (max. 5 Min.)' } else { '' }) })
$ke = @()
try { $ke = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Level = 1, 2, 3; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 400 -EA SilentlyContinue | Where-Object { [string]$_.ProviderName -match '(?i)Kerberos' }) } catch {}
$skew = @($ke | Where-Object { $_.Message -match '(?i)SKEW|Zeitabweichung|clock' }).Count
Fakt 'kerberosFehler7' $ke.Count; Fakt 'kerberosSkew7' $skew
Punkt 'Kerberos-Fehler (7 Tage)' $(if ($skew) { 'fehler' } elseif ($ke.Count -ge 3) { 'warn' } else { 'ok' }) ('' + $ke.Count + ' Fehler' + $(if ($skew) { ', davon ' + $skew + '× Zeitabweichung' } else { '' }))
$auth = $null; $pop = @()
foreach ($wurzel in @('HKLM:\SOFTWARE\Policies\Microsoft\Edge', 'HKCU:\SOFTWARE\Policies\Microsoft\Edge')) {
  $a = (Get-ItemProperty -LiteralPath $wurzel -Name AuthServerAllowlist -EA SilentlyContinue).AuthServerAllowlist
  if ($a -and -not $auth) { $auth = [string]$a }
  $pk = Get-Item -LiteralPath ($wurzel + '\PopupsAllowedForUrls') -EA SilentlyContinue
  if ($pk) { foreach ($n in @($pk.GetValueNames())) { $pop += [string]$pk.GetValue($n, '') } }
}
$popSap = @($pop | Where-Object { $_ -match '(?i)sap|skf' }).Count -gt 0
Fakt 'edgeAuthListe' ([bool]$auth); Fakt 'popupsSap' $popSap
Punkt 'Edge: automatische Anmeldung (Kerberos) für' $(if ($auth) { 'ok' } else { 'info' }) $(if ($auth) { $auth } else { 'keine Richtlinie – Anmeldung nur über die Intranetzone' })
Punkt 'Edge: Pop-ups für SAP erlaubt' $(if ($popSap) { 'ok' } else { 'info' }) $(if ($popSap) { 'ja' } else { 'keine Freigabe per Richtlinie' })
`,
  },
  // ══ SAP-Druck: Warteschlange, Drucker des Benutzers, PDF-Programm, Druckabstürze ══
  {
    id: 'sapdruck', titel: 'Drucken und PDF aus SAP (Warteschlange, Drucker, PDF-Programm)', modus: 'benutzer', timeoutMs: 90000,
    ps: WEGE_HKLM + String.raw`
$sp = Get-Service -Name Spooler -EA SilentlyContinue
Fakt 'spooler' $(if ($sp) { [string]$sp.Status } else { $null }); Fakt 'spoolerStartart' $(if ($sp) { [string]$sp.StartType } else { $null })
Punkt 'Druckwarteschlange (Spooler)' $(if ($sp -and $sp.Status -eq 'Running') { 'ok' } else { 'fehler' }) $(if ($sp) { [string]$sp.Status + ' (' + [string]$sp.StartType + ')' } else { 'Dienst fehlt' })
$dr = @(Get-CimInstance Win32_Printer -EA SilentlyContinue)
$std = @($dr | Where-Object { $_.Default } | Select-Object -First 1)
$off = @($dr | Where-Object { $_.WorkOffline -or $_.PrinterStatus -eq 7 } | ForEach-Object { [string]$_.Name })
$stdOff = $false; if ($std.Count) { $stdOff = [bool]($std[0].WorkOffline -or $std[0].PrinterStatus -eq 7) }
Fakt 'drucker' $dr.Count; Fakt 'standard' $(if ($std.Count) { [string]$std[0].Name } else { $null }); Fakt 'standardOffline' $stdOff; Fakt 'offline' @($off)
Punkt 'Drucker des Benutzers' $(if (-not $dr.Count) { 'fehler' } elseif ($off.Count) { 'warn' } else { 'ok' }) $(if (-not $dr.Count) { 'KEINE Drucker – SAP-Frontenddruck hat keine Auswahl' } else { '' + $dr.Count + ' Drucker' + $(if ($off.Count) { ', offline: ' + ($off -join ', ') } else { '' }) })
Punkt 'Standarddrucker' $(if (-not $std.Count) { 'warn' } elseif ($stdOff) { 'fehler' } else { 'ok' }) $(if (-not $std.Count) { 'keiner gesetzt' } else { [string]$std[0].Name + $(if ($stdOff) { ' – OFFLINE' } else { '' }) })
$pdfP = @(Get-ItemProperty ($wege + @('HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*')) -EA SilentlyContinue | Where-Object { [string]$_.DisplayName -match '(?i)Adobe Acrobat|Acrobat Reader|PDF-XChange|Foxit' } | ForEach-Object { [string]$_.DisplayName } | Sort-Object -Unique)
$uc = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice' -Name ProgId -EA SilentlyContinue).ProgId
Fakt 'pdfViewer' ($pdfP.Count -gt 0); Fakt 'pdfProgramme' @($pdfP); Fakt 'pdfStandard' $(if ($uc) { [string]$uc } else { $null })
Punkt 'PDF-Programm' $(if ($pdfP.Count) { 'ok' } else { 'warn' }) $(if ($pdfP.Count) { ($pdfP -join ', ') + $(if ($uc) { ' · Standard: ' + $uc } else { '' }) } else { 'kein PDF-Programm installiert' + $(if ($uc) { ' · Standard: ' + $uc } else { '' }) })
$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 200 -EA SilentlyContinue)
$sapDr = @($ev | Where-Object { $_.Message -match '(?i)sapfront|sapfprint|saplpd' }).Count
$spAb = @($ev | Where-Object { $_.Message -match '(?i)spoolsv\.exe' }).Count
$scm = 0
try { $scm = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Service Control Manager'; Id = 7031, 7034; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 100 -EA SilentlyContinue | Where-Object { $_.Message -match '(?i)Spooler|Druckwarteschlange' }).Count } catch {}
Fakt 'sapDruckAbstuerze7' $sapDr; Fakt 'spoolerAbstuerze7' ($spAb + $scm)
Punkt 'Druck-Abstürze (7 Tage)' $(if ($sapDr -or ($spAb + $scm) -ge 2) { 'fehler' } elseif ($spAb + $scm) { 'warn' } else { 'ok' }) ('SAP-Frontenddruck: ' + $sapDr + ', Druckwarteschlange: ' + ($spAb + $scm))
`,
  },
  // ══ SolidWorks (Installation, Grafik, Abstürze, Lizenz, PDM, Toolbox) ══
  {
    id: 'cadsw', titel: 'SolidWorks (Version, Grafik, Abstürze, Lizenzserver, PDM, Toolbox)', modus: 'profil', timeoutMs: 120000,
    ps: WEGE_HKLM + String.raw`
NeedHive
function TcpSw([string]$ziel, [int]$port) { try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($ziel, $port).Wait(3000) -and $t.Connected; $t.Close(); return [bool]$ok } catch { return $false } }
$alle = @(Get-ItemProperty ($wege + @($uHive + '\Software\Microsoft\Windows\CurrentVersion\Uninstall\*')) -EA SilentlyContinue | Where-Object { $_.DisplayName })
$sw = @($alle | Where-Object { [string]$_.DisplayName -match '(?i)^SOLIDWORKS 20\d\d' -and [string]$_.DisplayName -notmatch '(?i)PDM|eDrawings|Explorer|Composer|Visualize|Electrical|Plastics|Inspection|Document Manager' } | ForEach-Object { [string]$_.DisplayName } | Sort-Object -Unique)
$jahre = @($sw | ForEach-Object { if ($_ -match '20\d\d') { $Matches[0] } } | Sort-Object -Unique)
$exe = Test-Path -LiteralPath 'C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\SLDWORKS.exe'
$inst = ($sw.Count -gt 0) -or $exe
$edrw = @($alle | Where-Object { [string]$_.DisplayName -match '(?i)eDrawings' }).Count -gt 0
$pdm = @($alle | Where-Object { [string]$_.DisplayName -match '(?i)SOLIDWORKS PDM|PDMWorks|Conisio' }).Count -gt 0
$rtx = @($alle | Where-Object { [string]$_.DisplayName -match '(?i)RTX Desktop Manager' }).Count -gt 0
Fakt 'installiert' $inst; Fakt 'versionen' @($sw); Fakt 'anzahlVersionen' $jahre.Count; Fakt 'edrawings' $edrw; Fakt 'pdmInstalliert' $pdm; Fakt 'rtxDesktopManager' $rtx
Punkt 'SolidWorks' $(if (-not $inst) { 'fehler' } elseif ($jahre.Count -gt 1) { 'warn' } else { 'ok' }) $(if (-not $inst) { 'nicht installiert' } elseif ($sw.Count) { ($sw -join ', ') } else { 'SLDWORKS.exe vorhanden' })
Punkt 'eDrawings' $(if ($edrw) { 'ok' } else { 'info' }) $(if ($edrw) { 'installiert' } else { 'nicht installiert' })
if ($rtx) { Punkt 'NVIDIA RTX Desktop Manager' 'warn' 'installiert – bricht bekanntlich Edge/Chrome' }
$vc = @(Get-CimInstance Win32_VideoController -EA SilentlyContinue | Where-Object { [string]$_.Name -notmatch '(?i)Remote|Basic Display|Virtual|DisplayLink|Mirage|Meta' })
$nv = @($vc | Where-Object { [string]$_.Name -match '(?i)NVIDIA|Quadro|RTX|Radeon Pro|FirePro' })
$haupt = $null; if ($nv.Count) { $haupt = $nv[0] } elseif ($vc.Count) { $haupt = $vc[0] }
$alter = $null; if ($haupt -and $haupt.DriverDate) { try { $alter = [int]((Get-Date) - [datetime]$haupt.DriverDate).TotalDays } catch {} }
Fakt 'grafik' @($vc | ForEach-Object { [string]$_.Name }); Fakt 'cadGrafik' ($nv.Count -gt 0); Fakt 'treiberAlterTage' $alter; Fakt 'treiberVersion' $(if ($haupt) { [string]$haupt.DriverVersion } else { $null })
Punkt 'Grafikkarte' $(if ($nv.Count) { 'ok' } elseif ($vc.Count) { 'warn' } else { 'info' }) $(if ($haupt) { [string]$haupt.Name + ' · Treiber ' + [string]$haupt.DriverVersion + $(if ($null -ne $alter) { ' (' + $alter + ' Tage alt)' } else { '' }) + $(if (-not $nv.Count) { ' – keine CAD-Grafikkarte' } else { '' }) } else { 'nicht ermittelbar' })
$sogl = $false
foreach ($kv in @(Get-ChildItem -LiteralPath ($uHive + '\Software\SolidWorks') -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^SOLIDWORKS \d{4}$' })) {
  $x = (Get-ItemProperty -LiteralPath ($uHive + '\Software\SolidWorks\' + $kv.PSChildName + '\Performance\Graphics\Hardware') -Name 'Use Software OpenGL' -EA SilentlyContinue).'Use Software OpenGL'
  if ($x -eq 1) { $sogl = $true }
}
Fakt 'softwareOpenGL' $sogl
Punkt 'Software-OpenGL' $(if ($sogl) { 'fehler' } else { 'ok' }) $(if ($sogl) { 'EIN – 3D läuft ohne Grafikkarte' } else { 'aus (Grafikkarte wird genutzt)' })
$swp = @(); $prOk = $true
try { $swp = @(UserProcs @('SLDWORKS')) } catch { $prOk = $false; Punkt 'SolidWorks-Prozess' 'info' 'nicht lesbar (Adminrechte nötig)' }
if ($prOk) {
  $hgt = @($swp | Where-Object { -not $_.Responding }).Count -gt 0
  Fakt 'laeuft' ($swp.Count -gt 0); Fakt 'haengt' $hgt
  Punkt 'SolidWorks läuft' $(if ($hgt) { 'fehler' } else { 'info' }) $(if ($swp.Count) { 'ja' + $(if ($hgt) { ' – reagiert NICHT' } else { '' }) } else { 'nein' })
}
$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000, 1002; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue | Where-Object { $_.Message -match '(?i)SLDWORKS\.exe' })
$ab = @($ev | Where-Object { $_.Id -eq 1000 }).Count; $hg = @($ev | Where-Object { $_.Id -eq 1002 }).Count
$gab = @($ev | Where-Object { $_.Id -eq 1000 -and $_.Message -match '(?i)nvoglv|atio6axx|atig6pxx|ig\w*icd64|igxelpicd' }).Count
$tdr = 0
try { $tdr = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Display'; Id = 4101; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 50 -EA SilentlyContinue).Count } catch {}
Fakt 'abstuerze7' $ab; Fakt 'haenger7' $hg; Fakt 'grafikAbstuerze7' $gab; Fakt 'tdr7' $tdr
Punkt 'Abstürze / Hänger (7 Tage)' $(if ($ab -ge 2 -or $hg -ge 3) { 'fehler' } elseif ($ab -or $hg) { 'warn' } else { 'ok' }) ('' + $ab + ' Absturz/Abstürze (' + $gab + ' im Grafiktreiber), ' + $hg + ' Mal „reagiert nicht“')
Punkt 'Grafiktreiber-Neustarts (7 Tage)' $(if ($tdr) { 'fehler' } else { 'ok' }) ('' + $tdr + ' Mal „Anzeigetreiber reagiert nicht mehr“')
$lic = [string][Environment]::GetEnvironmentVariable('SW_D_LICENSE_FILE', 'Machine')
if (-not $lic) { foreach ($fk in @('HKLM:\SOFTWARE\FLEXlm License Manager', 'HKLM:\SOFTWARE\WOW6432Node\FLEXlm License Manager')) { $v = (Get-ItemProperty -LiteralPath $fk -Name SW_D_LICENSE_FILE -EA SilentlyContinue).SW_D_LICENSE_FILE; if ($v -and -not $lic) { $lic = [string]$v } } }
$licOk = $null
$erster = @($lic -split ';' | Where-Object { $_ -match '^\s*\d+@[A-Za-z0-9._-]+\s*$' } | Select-Object -First 1)
if ($erster.Count -and ([string]$erster[0]).Trim() -match '^(\d+)@([A-Za-z0-9._-]+)$') { $licOk = TcpSw $Matches[2] ([int]$Matches[1]) }
Fakt 'lizenzServer' $(if ($lic) { $lic } else { $null }); Fakt 'lizenzErreichbar' $licOk
Punkt 'SolidNetWork-Lizenzserver' $(if ($null -eq $licOk) { 'info' } elseif ($licOk) { 'ok' } else { 'fehler' }) $(if (-not $lic) { 'nicht eingetragen (Einzelplatz oder nicht installiert)' } elseif ($null -eq $licOk) { $lic } elseif ($licOk) { $lic + ' erreichbar' } else { $lic + ' NICHT erreichbar' })
$tres = 0; $pdmSrv = @()
foreach ($b in @('HKLM:\SOFTWARE\SolidWorks\Applications\PDMWorks Enterprise\Databases', ($uHive + '\Software\SolidWorks\Applications\PDMWorks Enterprise\Databases'))) {
  foreach ($tk in @(Get-ChildItem -LiteralPath $b -EA SilentlyContinue)) {
    $tres++
    foreach ($n in @($tk.GetValueNames())) { $v = [string]$tk.GetValue($n, ''); if ($n -match '(?i)server' -and $n -notmatch '(?i)pass|pwd' -and $v -match '^[A-Za-z0-9][A-Za-z0-9._-]{1,62}$') { $pdmSrv += $v } }
  }
}
$pdmSrv = @($pdmSrv | Select-Object -Unique | Select-Object -First 2)
$pdmOk = $null
if ($pdmSrv.Count) { $pdmOk = $true; foreach ($ps1 in $pdmSrv) { if (-not (TcpSw $ps1 3030)) { $pdmOk = $false } } }
Fakt 'pdmTresore' $tres; Fakt 'pdmServerErreichbar' $pdmOk
Punkt 'SolidWorks PDM' $(if (-not $pdm) { 'info' } elseif ($tres -eq 0 -or $pdmOk -eq $false) { 'fehler' } else { 'ok' }) $(if (-not $pdm) { 'nicht installiert' } elseif ($tres -eq 0) { 'Client installiert, aber KEINE Tresoransicht eingerichtet' } else { '' + $tres + ' Tresor(e)' + $(if ($pdmOk -eq $false) { ', Archivserver (3030) NICHT erreichbar' } elseif ($pdmOk) { ', Archivserver erreichbar' } else { '' }) })
$gl = (Get-ItemProperty -LiteralPath ($uHive + '\Network\G') -Name RemotePath -EA SilentlyContinue).RemotePath
Fakt 'laufwerkG' $(if ($gl) { [string]$gl } else { $null })
Punkt 'Laufwerk G: (Toolbox/PortaX)' $(if ($gl) { 'ok' } else { 'info' }) $(if ($gl) { [string]$gl } else { 'nicht als Netzlaufwerk eingetragen' })
`,
  },
  // ══ Coscom + Lizenz-Dongle (WibuKey/CodeMeter) ══
  {
    id: 'fpcos', titel: 'Coscom und Lizenz-Dongle (WibuKey/CodeMeter)', modus: 'system', timeoutMs: 90000,
    ps: WEGE_HKLM + String.raw`
$apps = @(Get-ItemProperty $wege -EA SilentlyContinue | Where-Object { [string]$_.DisplayName -match '(?i)coscom|wibu|codemeter' } | ForEach-Object { ([string]$_.DisplayName + ' ' + [string]$_.DisplayVersion).Trim() } | Sort-Object -Unique)
$cosInst = (@($apps | Where-Object { $_ -match '(?i)coscom' }).Count -gt 0) -or (Test-Path -LiteralPath 'C:\Program Files\COSCOM') -or (Test-Path -LiteralPath 'C:\Program Files (x86)\COSCOM') -or (Test-Path -LiteralPath 'C:\COSCOM')
$wibu = @($apps | Where-Object { $_ -match '(?i)wibu|codemeter' }).Count -gt 0
Fakt 'coscomInstalliert' $cosInst; Fakt 'wibuInstalliert' $wibu; Fakt 'programme' @($apps)
Punkt 'Coscom' $(if ($cosInst) { 'ok' } else { 'info' }) $(if ($cosInst) { 'installiert' } else { 'nicht gefunden' })
Punkt 'Lizenzsoftware (WibuKey/CodeMeter)' $(if ($wibu) { 'ok' } else { 'info' }) $(if ($wibu) { (@($apps | Where-Object { $_ -match '(?i)wibu|codemeter' }) -join ', ') } else { 'nicht installiert' })
$dienste = @(Get-Service -EA SilentlyContinue | Where-Object { [string]$_.Name -match '(?i)wibu|codemeter|^wksv' -or [string]$_.DisplayName -match '(?i)wibu|codemeter' })
$gest = @($dienste | Where-Object { $_.Status -ne 'Running' -and [string]$_.StartType -ne 'Disabled' } | ForEach-Object { [string]$_.DisplayName })
$deakt = @($dienste | Where-Object { [string]$_.StartType -eq 'Disabled' } | ForEach-Object { [string]$_.DisplayName })
Fakt 'lizenzDienste' $dienste.Count; Fakt 'diensteGestoppt' @($gest); Fakt 'diensteDeaktiviert' @($deakt)
Punkt 'Lizenzdienste' $(if (-not $dienste.Count) { 'info' } elseif ($gest.Count -or $deakt.Count) { 'fehler' } else { 'ok' }) $(if (-not $dienste.Count) { 'keine vorhanden' } elseif ($gest.Count -or $deakt.Count) { 'läuft NICHT: ' + (@($gest + $deakt) -join ', ') + $(if ($deakt.Count) { ' (deaktiviert)' } else { '' }) } else { '' + $dienste.Count + ' Dienst(e) laufen' })
$dgMuster = '(?i)wibu|codemeter|cm.?stick'
$dgJetzt = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { [string]$_.FriendlyName -match $dgMuster })
$dgAlle = @(Get-PnpDevice -EA SilentlyContinue | Where-Object { [string]$_.FriendlyName -match $dgMuster })
$dgFehler = @($dgJetzt | Where-Object { [string]$_.Status -ne 'OK' })
Fakt 'dongle' ($dgJetzt.Count -gt 0); Fakt 'dongleFrueher' ($dgAlle.Count -gt $dgJetzt.Count); Fakt 'dongleFehler' ($dgFehler.Count -gt 0)
Punkt 'Lizenz-Dongle am USB' $(if ($dgFehler.Count) { 'fehler' } elseif ($dgJetzt.Count) { 'ok' } elseif ($dgAlle.Count) { 'fehler' } else { 'info' }) $(if ($dgFehler.Count) { 'erkannt, aber mit Fehler: ' + (@($dgFehler | ForEach-Object { [string]$_.FriendlyName + ' [' + [string]$_.Status + ']' }) -join ', ') } elseif ($dgJetzt.Count) { (@($dgJetzt | ForEach-Object { [string]$_.FriendlyName }) -join ', ') } elseif ($dgAlle.Count) { 'steckte früher, ist JETZT NICHT da' } else { 'keiner erkannt (nie gesteckt bzw. Netzwerk-Lizenz)' })
$cp = @(Get-Process -EA SilentlyContinue | Where-Object { [string]$_.Path -match '(?i)coscom' })
$cpH = @($cp | Where-Object { -not $_.Responding }).Count -gt 0
Fakt 'coscomLaeuft' ($cp.Count -gt 0); Fakt 'coscomHaengt' $cpH
Punkt 'Coscom-Prozesse' $(if ($cpH) { 'fehler' } else { 'info' }) $(if ($cp.Count) { (@($cp | ForEach-Object { $_.ProcessName } | Select-Object -Unique) -join ', ') + $(if ($cpH) { ' – reagiert NICHT' } else { '' }) } else { 'keine' })
$fe = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Level = 1, 2; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 400 -EA SilentlyContinue | Where-Object { ([string]$_.ProviderName + ' ' + [string]$_.Message) -match '(?i)coscom|wibu|codemeter' })
Fakt 'fehler7' $fe.Count
Punkt 'Coscom-/Lizenzfehler (7 Tage)' $(if ($fe.Count -ge 3) { 'fehler' } elseif ($fe.Count) { 'warn' } else { 'ok' }) ('' + $fe.Count + ' Fehler im Anwendungsprotokoll')
`,
  },
  // ══ Netzwerk-Lizenzserver (FlexLM, CodeMeter, Sentinel, USB-Server) ══
  {
    id: 'fplic', titel: 'Netzwerk-Lizenzserver (FlexLM, CodeMeter, Sentinel, USB-Server)', modus: 'system', timeoutMs: 90000,
    ps: WEGE_HKLM + String.raw`
function TcpLz([string]$ziel, [int]$port) { try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($ziel, $port).Wait(3000) -and $t.Connected; $t.Close(); return [bool]$ok } catch { return $false } }
$werte = @()
foreach ($fk in @('HKLM:\SOFTWARE\FLEXlm License Manager', 'HKLM:\SOFTWARE\WOW6432Node\FLEXlm License Manager')) {
  $rk = Get-Item -LiteralPath $fk -EA SilentlyContinue
  if ($rk) { foreach ($n in @($rk.GetValueNames())) { if ($n -match '(?i)_LICENSE_FILE$') { $werte += [string]$rk.GetValue($n, '') } } }
}
$envM = [Environment]::GetEnvironmentVariables('Machine')
foreach ($n in @($envM.Keys)) { if ([string]$n -match '(?i)_LICENSE_FILE$') { $werte += [string]$envM[$n] } }
$ziele = @()
foreach ($w in $werte) { foreach ($teil in @($w -split ';')) { if ($teil.Trim() -match '^(\d+)@([A-Za-z0-9._-]+)$') { $ziele += ($Matches[2] + ':' + $Matches[1]) } } }
foreach ($cm in @('HKLM:\SOFTWARE\WIBU-SYSTEMS\CodeMeter\Server\CurrentVersion\ServerSearchList', 'HKLM:\SOFTWARE\WOW6432Node\WIBU-SYSTEMS\CodeMeter\Server\CurrentVersion\ServerSearchList')) {
  foreach ($sk in @(Get-ChildItem -LiteralPath $cm -EA SilentlyContinue)) { $ad = [string]$sk.GetValue('Address', ''); if ($ad -and $ad -notmatch '^(127\.|localhost|255\.255\.255\.255)') { $ziele += ($ad + ':22350') } }
}
$ziele = @($ziele | Select-Object -Unique)
$nAufl = @(); $nErr = @(); $okZ = @()
foreach ($zl in @($ziele | Select-Object -First 5)) {
  $zt = @($zl -split ':'); $hn = [string]$zt[0]; $pt = 0; [void][int]::TryParse([string]$zt[1], [ref]$pt)
  $adr = @(); try { $adr = @([System.Net.Dns]::GetHostAddresses($hn)) } catch {}
  if (-not $adr.Count) { $nAufl += $zl; continue }
  if ($pt -gt 0 -and (TcpLz $hn $pt)) { $okZ += $zl } else { $nErr += $zl }
}
Fakt 'anzahl' $ziele.Count; Fakt 'server' @($ziele); Fakt 'erreichbar' $okZ.Count; Fakt 'nichtAufloesbar' @($nAufl); Fakt 'nichtErreichbar' @($nErr)
if ($ziele.Count) { Punkt 'Lizenzserver' $(if ($nAufl.Count -or $nErr.Count) { 'fehler' } else { 'ok' }) $(if ($nAufl.Count -or $nErr.Count) { $(if ($nAufl.Count) { 'Name nicht auflösbar: ' + ($nAufl -join ', ') + ' ' } else { '' }) + $(if ($nErr.Count) { 'NICHT erreichbar: ' + ($nErr -join ', ') } else { '' }) } else { 'erreichbar: ' + ($okZ -join ', ') }) }
else { Punkt 'Lizenzserver' 'info' 'keine Netzwerk-Lizenzserver eingetragen (FlexLM/CodeMeter)' }
$hs = Get-Service -Name 'hasplms' -EA SilentlyContinue
Fakt 'sentinelDienst' $(if ($hs) { [string]$hs.Status } else { $null })
if ($hs) { Punkt 'Sentinel/HASP-Lizenzdienst' $(if ($hs.Status -eq 'Running') { 'ok' } else { 'fehler' }) ([string]$hs.Status) }
$us = @(Get-Service -EA SilentlyContinue | Where-Object { [string]$_.DisplayName -match '(?i)UTN|AnywhereUSB|USB.?Device.?Server|VirtualHere|FlexiHub' })
$usAus = @($us | Where-Object { $_.Status -ne 'Running' } | ForEach-Object { [string]$_.DisplayName })
Fakt 'usbServer' ($us.Count -gt 0); Fakt 'usbServerAus' @($usAus)
if ($us.Count) { Punkt 'USB-Deviceserver-Software' $(if ($usAus.Count) { 'fehler' } else { 'ok' }) $(if ($usAus.Count) { 'läuft NICHT: ' + ($usAus -join ', ') } else { 'läuft' }) }
`,
  },
  // ══ EuroPar (Ordner, .ini, Laufwerk Q:, Umgebungsvariablen) ══
  {
    id: 'fpeuro', titel: 'EuroPar (Ordner, .ini-Dateien, Laufwerk Q:, Umgebungsvariablen)', modus: 'profil', timeoutMs: 90000,
    ps: WEGE_HKLM + SCHREIB_OK + String.raw`
NeedHive
function TcpEu([string]$ziel, [int]$port) { try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($ziel, $port).Wait(3000) -and $t.Connected; $t.Close(); return [bool]$ok } catch { return $false } }
function W2([string]$pfad, [string]$name) { try { return (Get-ItemProperty -LiteralPath $pfad -Name $name -EA Stop).$name } catch { return $null } }
$fehlen = @(); foreach ($o in @('C:\EuroPAR', 'C:\Local', 'C:\SCHNITTDATEN')) { if (-not (Test-Path -LiteralPath $o)) { $fehlen += $o } }
$inst = @(Get-ItemProperty $wege -EA SilentlyContinue | Where-Object { [string]$_.DisplayName -match '(?i)euro.?par|eurnc' }).Count -gt 0
$da = $inst -or (Test-Path -LiteralPath 'C:\EuroPAR')
Fakt 'vorhanden' $da; Fakt 'ordnerFehlen' @($fehlen)
Punkt 'EuroPar-Ordner' $(if ($fehlen.Count) { 'fehler' } else { 'ok' }) $(if ($fehlen.Count) { 'FEHLEN: ' + ($fehlen -join ', ') } else { 'C:\EuroPAR, C:\Local, C:\SCHNITTDATEN vorhanden' })
$ini = @(Get-ChildItem -LiteralPath 'C:\Local' -Filter '*.ini' -File -EA SilentlyContinue)
$leer = @($ini | Where-Object { $_.Length -eq 0 } | ForEach-Object { $_.Name })
Fakt 'iniAnzahl' $ini.Count; Fakt 'iniLeer' @($leer)
Punkt '.ini-Dateien in C:\Local' $(if ($leer.Count) { 'fehler' } elseif ($ini.Count) { 'ok' } else { 'info' }) $(if ($leer.Count) { 'LEER: ' + ($leer -join ', ') } else { '' + $ini.Count + ' Datei(en)' })
$lw = $null; if (Test-Path -LiteralPath 'C:\Local') { $lw = SchreibOk 'C:\Local' }
Fakt 'localSchreibrecht' $lw
if ($null -ne $lw) { Punkt 'Schreibrecht für Benutzer auf C:\Local' $(if ($lw) { 'ok' } else { 'warn' }) $(if ($lw) { 'ja' } else { 'NEIN – EuroPar kann seine .ini-Dateien nicht schreiben' }) }
$q = W2 ($uHive + '\Network\Q') 'RemotePath'
$qOk = $null
if ($q -and ([string]$q) -match '^\\\\([^\\]+)\\') { $qOk = TcpEu $Matches[1] 445 }
Fakt 'laufwerkQ' $(if ($q) { [string]$q } else { $null }); Fakt 'qServerErreichbar' $qOk
Punkt 'Laufwerk Q:' $(if (-not $q) { 'fehler' } elseif ($qOk -eq $false) { 'fehler' } else { 'ok' }) $(if (-not $q) { 'NICHT verbunden' } else { [string]$q + $(if ($qOk -eq $false) { ' – Server NICHT erreichbar' } elseif ($qOk) { ' – Server erreichbar' } else { '' }) })
$ek = $uHive + '\Environment'
$eu = W2 $ek 'EURO_EURN'; $em = [Environment]::GetEnvironmentVariable('EURO_EURN', 'Machine'); $ew = W2 $ek 'EURO_WRKN'
$ph = ''; try { $ph = [string](Get-Item -LiteralPath $ek -EA Stop).GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } catch {}
$phM = [string][Environment]::GetEnvironmentVariable('Path', 'Machine')
$pathOk = @(($ph + ';' + $phM) -split ';' | Where-Object { $_.TrimEnd('\') -ieq 'Q:\Eurnc\cmdnc0' }).Count -gt 0
$eurn = [string]$eu; if (-not $eurn) { $eurn = [string]$em }
$wrkn = [string]$ew
Fakt 'euroEurn' $(if ($eurn) { $eurn } else { $null }); Fakt 'euroEurnOk' ($eurn.TrimEnd('\') -ieq 'Q:'); Fakt 'euroWrkn' $(if ($wrkn) { $wrkn } else { $null }); Fakt 'euroWrknOk' ($wrkn.TrimEnd('\') -ieq 'C:\local'); Fakt 'pathOk' $pathOk
$alleOk = ($eurn.TrimEnd('\') -ieq 'Q:') -and ($wrkn.TrimEnd('\') -ieq 'C:\local') -and $pathOk
Punkt 'Umgebungsvariablen' $(if ($alleOk) { 'ok' } else { 'fehler' }) ('EURO_EURN=' + $(if ($eurn) { $eurn } else { 'FEHLT' }) + ' · EURO_WRKN=' + $(if ($wrkn) { $wrkn } else { 'FEHLT' }) + ' · PATH mit Q:\Eurnc\cmdnc0: ' + $(if ($pathOk) { 'ja' } else { 'NEIN' }))
$el = @(Get-Process -EA SilentlyContinue | Where-Object { [string]$_.Path -match '(?i)\\EuroPAR\\|\\Eurnc\\' })
Fakt 'laeuft' ($el.Count -gt 0)
Punkt 'EuroPar läuft' 'info' $(if ($el.Count) { (@($el | ForEach-Object { $_.ProcessName } | Select-Object -Unique) -join ', ') } else { 'nein' })
`,
  },
  // ══ enaio (Client, Server, Outlook-Add-in, Cache) ══
  {
    id: 'fpenaio', titel: 'enaio (Client, Server, Outlook-Add-in, Cache, Abstürze)', modus: 'profil', timeoutMs: 120000,
    ps: WEGE_HKLM + String.raw`
NeedUser
function TcpEn([string]$ziel, [int]$port) { try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($ziel, $port).Wait(3000) -and $t.Connected; $t.Close(); return [bool]$ok } catch { return $false } }
$wg = @($wege); if ($uHive) { $wg += ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Uninstall\*') }
$prog = @(Get-ItemProperty $wg -EA SilentlyContinue | Where-Object { [string]$_.DisplayName -match '(?i)enaio|optimal\s*systems' -or [string]$_.Publisher -match '(?i)optimal\s*systems' } | ForEach-Object { ([string]$_.DisplayName + ' ' + [string]$_.DisplayVersion).Trim() } | Sort-Object -Unique)
$cfg = $null
foreach ($lp in @('C:\Program Files (x86)\OPTIMAL SYSTEMS\OSECM\clients\client32\asinit.cfg', 'C:\Program Files\OPTIMAL SYSTEMS\OSECM\clients\client32\asinit.cfg')) { if (-not $cfg -and (Test-Path -LiteralPath $lp)) { $cfg = $lp } }
$inst = ($prog.Count -gt 0) -or [bool]$cfg
Fakt 'installiert' $inst; Fakt 'programme' @($prog)
Punkt 'enaio-Programme' $(if ($inst) { 'ok' } else { 'fehler' }) $(if ($prog.Count) { $prog -join ', ' } elseif ($cfg) { 'Client vorhanden' } else { 'nicht installiert' })
$srvName = 'enaioprod.skf.net'; $srvPort = 4000
if ($cfg) {
  $ct = ''; try { $ct = [IO.File]::ReadAllText($cfg) } catch {}
  $m = [regex]::Match($ct, '(?im)^\s*Comstring\s*=\s*([^\r\n;]+)')
  if ($m.Success) { $tt = @($m.Groups[1].Value.Trim() -split '#'); if ($tt[0] -match '^[A-Za-z0-9][A-Za-z0-9._-]*$') { $srvName = $tt[0] }; if ($tt.Count -gt 1 -and $tt[1] -match '^\d+$') { $srvPort = [int]$tt[1] } }
}
$aufl = $false; try { $aufl = @([System.Net.Dns]::GetHostAddresses($srvName)).Count -gt 0 } catch {}
$srvOk = $false; if ($aufl) { $srvOk = TcpEn $srvName $srvPort }
Fakt 'server' ($srvName + ':' + $srvPort); Fakt 'serverAufloesbar' $aufl; Fakt 'serverErreichbar' $srvOk
Punkt 'enaio-Server' $(if ($srvOk) { 'ok' } else { 'fehler' }) ($srvName + ':' + $srvPort + $(if (-not $aufl) { ' – Name NICHT auflösbar' } elseif ($srvOk) { ' erreichbar' } else { ' NICHT erreichbar' }))
$ld = $null
foreach ($b in @('HKLM:\SOFTWARE\Microsoft\Office\Outlook\Addins', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\Outlook\Addins', ($uHive + '\Software\Microsoft\Office\Outlook\Addins'))) {
  if (-not $b -or $b -match '^\\') { continue }
  foreach ($k in @(Get-ChildItem -LiteralPath $b -EA SilentlyContinue)) {
    $q = Get-ItemProperty -LiteralPath $k.PSPath -EA SilentlyContinue
    if (($k.PSChildName + ' ' + [string]$q.FriendlyName) -match '(?i)enaio|optimal' -and $null -ne $q.LoadBehavior -and $null -eq $ld) { $ld = [int]$q.LoadBehavior }
  }
}
Fakt 'addinLoad' $ld
Punkt 'enaio-Add-in in Outlook' $(if ($null -eq $ld) { 'info' } elseif ($ld -eq 3) { 'ok' } else { 'fehler' }) $(if ($null -eq $ld) { 'nicht installiert' } elseif ($ld -eq 3) { 'aktiv' } else { 'DEAKTIVIERT (LoadBehavior ' + $ld + ')' })
$lauf = @(); $prOk = $true
try { $lauf = @(Get-Process -IncludeUserName -EA Stop | Where-Object { [string]$_.Path -match '(?i)OPTIMAL SYSTEMS|enaio' -and $_.UserName -and ((([string]$_.UserName) -split '\\')[-1] -ieq $uName) }) } catch { $prOk = $false }
if ($prOk) {
  $hgt = @($lauf | Where-Object { -not $_.Responding }).Count -gt 0
  Fakt 'laeuft' ($lauf.Count -gt 0); Fakt 'haengt' $hgt
  Punkt 'enaio läuft' $(if ($hgt) { 'fehler' } else { 'info' }) $(if ($lauf.Count) { (@($lauf | ForEach-Object { $_.ProcessName } | Select-Object -Unique) -join ', ') + $(if ($hgt) { ' – reagiert NICHT' } else { '' }) } else { 'nein' })
} else { Punkt 'enaio-Prozesse des Benutzers' 'info' 'nicht lesbar (Adminrechte nötig)' }
$cache = 0.0
foreach ($c in @((Join-Path $uLocal 'enaio'), (Join-Path $uRoam 'enaio'), (Join-Path $uLocal 'OPTIMAL SYSTEMS'), (Join-Path $uRoam 'OPTIMAL SYSTEMS'))) { if (Test-Path -LiteralPath $c) { $cache += [double](OrdnerGroesse $c) / 1GB } }
Fakt 'cacheGB' ([math]::Round($cache, 1))
Punkt 'enaio-Cache im Profil' $(if ($cache -ge 2) { 'warn' } else { 'ok' }) ('' + [math]::Round($cache, 1) + ' GB')
$ab = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 200 -EA SilentlyContinue | Where-Object { $_.Message -match '(?i)OPTIMAL SYSTEMS|enaio|axvw|axclient' }).Count
Fakt 'abstuerze7' $ab
Punkt 'enaio-Abstürze (7 Tage)' $(if ($ab -ge 2) { 'fehler' } elseif ($ab) { 'warn' } else { 'ok' }) ('' + $ab)
`,
  },
  // ══ Gravur-Software NGrav / SignPro ══
  {
    id: 'fpgrav', titel: 'Gravur-Software NGrav/SignPro (Datenordner, Schreibrechte)', modus: 'system', timeoutMs: 60000,
    ps: WEGE_HKLM + SCHREIB_OK + String.raw`
$doku = 'C:\Users\Public\Documents'
if ($env:PUBLIC) { $pd = Join-Path $env:PUBLIC 'Documents'; if (Test-Path -LiteralPath $pd) { $doku = $pd } }
$inst = @(Get-ItemProperty $wege -EA SilentlyContinue | Where-Object { [string]$_.DisplayName -match '(?i)ngrav|signpro|gravostyle' }).Count -gt 0
$ziele = @(Get-ChildItem -LiteralPath $doku -Directory -EA SilentlyContinue | Where-Object { $_.Name -match '(?i)ngrav|signpro' })
$ohne = @(); foreach ($z in $ziele) { if ((SchreibOk $z.FullName) -eq $false) { $ohne += $z.Name } }
Fakt 'installiert' $inst; Fakt 'ordner' $ziele.Count; Fakt 'ohneSchreibrecht' @($ohne)
Punkt 'Gravur-Software' $(if ($inst) { 'ok' } else { 'info' }) $(if ($inst) { 'installiert' } else { 'nicht in der Programmliste' })
Punkt 'Datenordner unter Öffentliche Dokumente' $(if (-not $ziele.Count) { 'info' } elseif ($ohne.Count) { 'fehler' } else { 'ok' }) $(if (-not $ziele.Count) { 'kein NGrav-/SignPro-Ordner' } elseif ($ohne.Count) { 'Benutzer dürfen NICHT schreiben: ' + ($ohne -join ', ') } else { '' + $ziele.Count + ' Ordner, Benutzer dürfen schreiben' })
$ab = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 200 -EA SilentlyContinue | Where-Object { $_.Message -match '(?i)ngrav|signpro' }).Count
Fakt 'abstuerze7' $ab
Punkt 'Abstürze (7 Tage)' $(if ($ab) { 'warn' } else { 'ok' }) ('' + $ab)
`,
  },
]

export const THEMEN_FACHPROGRAMME: DgOber[] = [
  // ════════════════════════════════════ SAP ════════════════════════════════════
  {
    id: 'sap', titel: 'SAP', symbol: 'Factory', beschreibung: 'SAP Logon startet nicht, Anmeldung/Single Sign-on (Kinit), SAP langsam, Drucken aus SAP, Fiori im Browser',
    unter: [
      {
        id: 'sap-start', titel: 'SAP Logon startet nicht oder stürzt ab', beschreibung: 'Klick auf SAP Logon passiert nichts, Fehlermeldung beim Start oder SAP schließt sich sofort wieder',
        sonden: ['sap', 'sys'],
        regeln: [
          { id: 'sap-fehlt', wenn: f => nein(f['sap.installiert']), befund: () => 'SAP GUI ist auf diesem PC nicht installiert', problem: 'sap-gui-fehlt-veraltet', schwere: 3 },
          { id: 'exe-fehlt', wenn: f => ja(f['sap.installiert']) && nein(f['sap.exeVorhanden']), befund: () => 'SAP GUI ist eingetragen, aber saplogon.exe fehlt (Installation beschädigt)', problem: 'sap-komponente-nicht-registriert', schwere: 3 },
          { id: 'abstuerze', wenn: f => num(f['sap.abstuerze7']) >= 2, befund: f => `SAP ist in 7 Tagen ${f['sap.abstuerze7']}× abgestürzt`, problem: 'sap-stuerzt-ab', schwere: 3 },
          { id: 'liste-kaputt', wenn: f => nein(f['sap.lsLesbar']) || (ja(f['sap.lsVorhanden']) && num(f['sap.lsKB']) === 0), befund: f => `Verbindungsliste SAPUILandscape.xml ist beschädigt bzw. leer (${zahl(f['sap.lsKB'])} KB)`, problem: 'sap-landscape-datei-beschaedigt', schwere: 3 },
          { id: 'haengt', wenn: f => ja(f['sap.haengt']), befund: () => 'SAP Logon läuft, reagiert aber nicht', problem: 'sap-haengt', schwere: 2 },
          { id: 'zwei', wenn: f => ja(f['sap.zweiInstallationen']), befund: () => 'SAP GUI ist zweimal installiert (32 und 64 Bit)', problem: 'sap-zwei-gui-versionen', schwere: 2 },
          { id: 'platte', wenn: f => num(f['sys.cFreiGB']) < 2, befund: f => `Laufwerk C: hat nur noch ${zahl(f['sys.cFreiGB'])} GB frei`, problem: 'leistung-festplatte-voll', schwere: 2 },
          { id: 'alt', wenn: f => num(f['sap.hauptversion']) > 0 && num(f['sap.hauptversion']) < 800, befund: f => `Veraltete SAP-GUI-Version (${txt(f['sap.version'])})`, problem: 'sap-gui-fehlt-veraltet', schwere: 1 },
          { id: 'neustart', wenn: f => ja(f['sys.neustartAusstehend']), befund: () => 'Ein Neustart nach Updates steht aus (SAP-GUI-Update evtl. halb fertig)', problem: 'sap-gui-installation-fehlgeschlagen', schwere: 1 },
        ],
        ohneBefund: ['sap-startet-nicht', 'sap-stuerzt-ab', 'sap-control-framework-fatal-error'],
      },
      {
        id: 'sap-liste', titel: 'Verbindungsliste leer, Systeme fehlen oder Verbindung scheitert', beschreibung: 'In SAP Logon fehlen Systeme, die Liste ist leer, „Partner nicht erreicht“, „hostname unknown“ oder „Logon balancing error“',
        sonden: ['sap', 'net'],
        regeln: [
          { id: 'liste-fehlt', wenn: f => ja(f['sap.installiert']) && nein(f['sap.lsVorhanden']) && nein(f['sap.zentral']), befund: () => 'Weder eine eigene noch eine zentrale Verbindungsliste ist vorhanden', problem: 'sap-verbindungsliste-leer', schwere: 3 },
          { id: 'liste-kaputt', wenn: f => nein(f['sap.lsLesbar']) || (ja(f['sap.lsVorhanden']) && num(f['sap.lsKB']) === 0), befund: () => 'SAPUILandscape.xml ist beschädigt bzw. leer', problem: 'sap-landscape-datei-beschaedigt', schwere: 3 },
          { id: 'liste-leer', wenn: f => ja(f['sap.lsLesbar']) && num(f['sap.dienste']) === 0 && nein(f['sap.zentral']), befund: () => 'Die Verbindungsliste enthält keinen einzigen Eintrag und keine zentrale Liste', problem: 'sap-verbindungsliste-leer', schwere: 2 },
          { id: 'name-unbekannt', wenn: f => liste(f['sap.nichtAufloesbar']).length > 0, befund: f => `SAP-Server-Name nicht auflösbar: ${txt(f['sap.nichtAufloesbar'])}`, problem: 'sap-hostname-unbekannt', schwere: 3 },
          { id: 'server-weg', wenn: f => liste(f['sap.nichtErreichbar']).length > 0, befund: f => `SAP-Server nicht erreichbar: ${txt(f['sap.nichtErreichbar'])}`, problem: 'sap-message-server-nicht-erreichbar', schwere: 2 },
          { id: 'zscaler-aus', wenn: f => ja(f['net.zscalerInstalliert']) && f['net.zscalerDienst'] != null && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])}) – SAP ist von außen nur über den Tunnel erreichbar`, problem: 'sap-homeoffice-geht-nicht', schwere: 2 },
          { id: 'kein-firmennetz', wenn: f => nein(f['net.domaeneErreichbar']), befund: f => `Firmennetz (${txt(f['net.domaene'])}) ist nicht erreichbar`, problem: 'sap-homeoffice-geht-nicht', schwere: 1 },
          { id: 'dns', wenn: f => nein(f['net.dnsOk']), befund: () => 'Die Namensauflösung (DNS) funktioniert nicht', problem: 'sap-hostname-unbekannt', schwere: 2 },
        ],
        ohneBefund: ['sap-verbindungsliste-leer', 'sap-verbindungsliste-veraltet', 'sap-message-server-nicht-erreichbar'],
      },
      {
        id: 'sap-anmeldung', titel: 'SAP-Anmeldung klappt nicht (Single Sign-on, SNC, Kinit)', beschreibung: 'SAP fragt nach Kennwort, „SNCERR_GSSAPI“, „No credentials were supplied“, „Clock skew too great“ oder Kinit-Fenster',
        sonden: ['sapsso', 'sap', 'net'],
        fragen: [{ id: 'nurEins', text: 'Fragt nur EIN SAP-System nach dem Kennwort, die anderen melden automatisch an?' }],
        regeln: [
          { id: 'kinit', wenn: f => ja(f['sapsso.mitKerberos']) && nein(f['sapsso.mitTickets']), befund: () => 'MIT Kerberos ist installiert, hat aber kein Ticket – Kinit muss neu ausgeführt werden', problem: 'sap-kinit-ticket', schwere: 3 },
          { id: 'kein-tgt', wenn: f => ja(f['sapsso.domaenenKonto']) && nein(f['sapsso.tgt']), befund: () => 'Der Benutzer hat kein Kerberos-Anmeldeticket (TGT)', problem: 'sap-snc-keine-anmeldedaten', schwere: 3 },
          { id: 'uhr', wenn: f => num(f['sapsso.zeitAbweichungSek']) >= 300 || num(f['sapsso.kerberosSkew7']) > 0, befund: f => (num(f['sapsso.zeitAbweichungSek']) >= 300 ? `PC-Uhr weicht ${zahl(f['sapsso.zeitAbweichungSek'])} s von der Domäne ab` : `Kerberos meldete ${f['sapsso.kerberosSkew7']}× Zeitabweichung`), problem: 'sap-snc-uhrzeit-abweichung', schwere: 3 },
          { id: 'snc-lib', wenn: f => ja(f['sapsso.sncLibFehlt']), befund: f => `SNC-Bibliothek fehlt: ${txt(f['sapsso.sncLib'])}`, problem: 'sap-snc-bibliothek-fehlt', schwere: 3 },
          { id: 'nur-eins', wenn: f => f['frage.nurEins'] === 'ja', befund: () => 'Nur ein System fragt nach dem Kennwort – dessen Eintrag (SNC-Name) passt nicht', problem: 'sap-ein-system-fragt-kennwort', schwere: 2 },
          { id: 'zscaler-aus', wenn: f => ja(f['net.zscalerInstalliert']) && f['net.zscalerDienst'] != null && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])}) – der Domänencontroller ist nicht erreichbar`, problem: 'sap-homeoffice-geht-nicht', schwere: 2 },
          { id: 'kein-snc', wenn: f => num(f['sap.dienste']) > 0 && num(f['sap.sncEintraege']) === 0 && nein(f['sap.zentral']), befund: f => `Keiner der ${f['sap.dienste']} SAP-Einträge hat Single Sign-on (SNC) eingetragen`, problem: 'sap-snc-name-eigener-eintrag', schwere: 1 },
          { id: 'kerberos-fehler', wenn: f => num(f['sapsso.kerberosFehler7']) >= 3, befund: f => `${f['sapsso.kerberosFehler7']} Kerberos-Fehler in 7 Tagen`, problem: 'sap-snc-fehler', schwere: 1 },
        ],
        ohneBefund: ['sap-snc-fehler', 'sap-kinit-ticket', 'sap-kennwort-abfrage', 'sap-benutzer-gesperrt'],
      },
      {
        id: 'sap-langsam', titel: 'SAP ist langsam oder hängt', beschreibung: '„Keine Rückmeldung“, Tippen in Feldern ist träge, Listen und Transaktionen brauchen ewig',
        sonden: ['sap', 'sys', 'net'],
        regeln: [
          { id: 'haengt', wenn: f => ja(f['sap.haengt']), befund: () => 'SAP Logon reagiert gerade nicht', problem: 'sap-haengt', schwere: 3 },
          { id: 'trace', wenn: f => ja(f['sap.traceAn']) || num(f['sap.traceMB']) >= 100, befund: f => `SAP-GUI-Trace ist eingeschaltet bzw. Trace-Dateien belegen ${zahl(f['sap.traceMB'])} MB`, problem: 'sap-trace-eingeschaltet', schwere: 3 },
          { id: 'haenger', wenn: f => num(f['sap.haenger7']) >= 3, befund: f => `SAP hat in 7 Tagen ${f['sap.haenger7']}× nicht reagiert`, problem: 'sap-haengt', schwere: 2 },
          { id: 'ram', wenn: f => num(f['sys.ramFreiProzent']) < 10, befund: f => `Arbeitsspeicher fast voll (${f['sys.ramFreiProzent']} % frei)`, problem: 'leistung-arbeitsspeicher-voll', schwere: 2 },
          { id: 'sap-ram', wenn: f => num(f['sap.ramMB']) >= 1500, befund: f => `SAP belegt ${zahl(f['sap.ramMB'])} MB Arbeitsspeicher`, problem: 'sap-nicht-genug-speicher', schwere: 1 },
          { id: 'nur-wlan', wenn: f => ja(f['net.wlan']) && nein(f['net.lan']), befund: () => 'Der PC ist nur über WLAN verbunden', problem: 'sap-langsam', schwere: 1 },
          { id: 'uptime', wenn: f => num(f['sys.uptimeTage']) > 14, befund: f => `PC läuft seit ${zahl(f['sys.uptimeTage'])} Tagen ohne Neustart`, problem: 'leistung-pc-sehr-langsam', schwere: 1 },
        ],
        ohneBefund: ['sap-langsam', 'sap-haengt', 'sap-logon-startet-langsam', 'sap-eingabe-traege-historie'],
      },
      {
        id: 'sap-druck', titel: 'Drucken oder PDF aus SAP geht nicht', beschreibung: 'Ausdruck kommt nicht an, Druckerauswahl ist leer, SAP stürzt beim Drucken ab oder PDF-Belege öffnen nicht',
        sonden: ['sapdruck', 'sap'],
        regeln: [
          { id: 'spooler-aus', wenn: f => txt(f['sapdruck.spoolerStartart']) === 'Disabled', befund: () => 'Die Druckwarteschlange ist deaktiviert', problem: 'drucker-spooler-deaktiviert', schwere: 3 },
          { id: 'spooler-steht', wenn: f => f['sapdruck.spooler'] != null && txt(f['sapdruck.spooler']) !== 'Running', befund: f => `Druckwarteschlange läuft nicht (${txt(f['sapdruck.spooler'])})`, problem: 'sap-frontenddruck-keine-drucker', schwere: 3 },
          { id: 'keine-drucker', wenn: f => num(f['sapdruck.drucker']) === 0, befund: () => 'Der Benutzer hat keinen einzigen Drucker', problem: 'sap-frontenddruck-keine-drucker', schwere: 3 },
          { id: 'druck-absturz', wenn: f => num(f['sapdruck.sapDruckAbstuerze7']) > 0, befund: f => `SAP ist in 7 Tagen ${f['sapdruck.sapDruckAbstuerze7']}× beim Frontenddruck abgestürzt`, problem: 'sap-absturz-beim-frontenddruck', schwere: 3 },
          { id: 'spooler-absturz', wenn: f => num(f['sapdruck.spoolerAbstuerze7']) >= 2, befund: f => `Druckwarteschlange ist in 7 Tagen ${f['sapdruck.spoolerAbstuerze7']}× abgestürzt`, problem: 'drucker-spooler-absturz', schwere: 2 },
          { id: 'std-offline', wenn: f => ja(f['sapdruck.standardOffline']), befund: f => `Standarddrucker ${txt(f['sapdruck.standard'])} ist offline`, problem: 'drucker-sap-druck', schwere: 2 },
          { id: 'kein-std', wenn: f => num(f['sapdruck.drucker']) > 0 && f['sapdruck.standard'] === null, befund: () => 'Es ist kein Standarddrucker gesetzt', problem: 'drucker-sap-druck', schwere: 2 },
          { id: 'kein-pdf', wenn: f => nein(f['sapdruck.pdfViewer']), befund: () => 'Kein PDF-Programm installiert – SAP-Formulare/Belege können nicht angezeigt werden', problem: 'sap-pdf-anzeige', schwere: 2 },
        ],
        ohneBefund: ['drucker-sap-druck', 'sap-druck-nur-im-spool', 'sap-druck-geht-nicht', 'sap-pdf-anzeige'],
      },
      {
        id: 'sap-web', titel: 'SAP Fiori oder WebGUI im Browser geht nicht', beschreibung: 'Fiori-Launchpad lädt nicht, fragt nach Kennwort, Kacheln bleiben leer oder Wertehilfe/Dialoge öffnen nicht',
        sonden: ['sapsso', 'net', 'aad'],
        fragen: [{ id: 'popup', text: 'Öffnen sich in Fiori/WebGUI Wertehilfe, Dialoge oder Druckvorschau nicht (die Seite selbst lädt)?' }],
        regeln: [
          { id: 'kein-tgt', wenn: f => ja(f['sapsso.domaenenKonto']) && nein(f['sapsso.tgt']), befund: () => 'Kein Kerberos-Anmeldeticket – der Browser kann sich nicht automatisch an SAP anmelden', problem: 'browser-sap-fiori', schwere: 3 },
          { id: 'popups', wenn: f => f['frage.popup'] === 'ja', befund: f => (nein(f['sapsso.popupsSap']) ? 'Pop-ups für SAP sind im Browser nicht freigegeben' : 'Dialoge/Pop-ups aus SAP werden blockiert'), problem: 'sap-webgui-popups-blockiert', schwere: 3 },
          { id: 'zscaler-aus', wenn: f => ja(f['net.zscalerInstalliert']) && f['net.zscalerDienst'] != null && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])})`, problem: 'sap-fiori-browser', schwere: 2 },
          { id: 'dns', wenn: f => nein(f['net.dnsOk']), befund: () => 'Die Namensauflösung (DNS) funktioniert nicht', problem: 'sap-fiori-browser', schwere: 2 },
          { id: 'uhr', wenn: f => num(f['sapsso.zeitAbweichungSek']) >= 300, befund: f => `PC-Uhr weicht ${zahl(f['sapsso.zeitAbweichungSek'])} s von der Domäne ab`, problem: 'sap-snc-uhrzeit-abweichung', schwere: 2 },
          { id: 'kein-prt', wenn: f => nein(f['aad.prt']), befund: () => 'Das Microsoft-Anmeldetoken (PRT) fehlt', problem: 'sap-fiori-app-nicht-geoeffnet', schwere: 1 },
          { id: 'edge-auth', wenn: f => nein(f['sapsso.edgeAuthListe']) && ja(f['sapsso.domaenenKonto']), befund: () => 'Edge hat keine Richtlinie für die automatische Kerberos-Anmeldung', problem: 'browser-sap-fiori', schwere: 1 },
        ],
        ohneBefund: ['sap-fiori-browser', 'browser-sap-fiori', 'sap-fiori-app-nicht-geoeffnet', 'sap-webgui-popups-blockiert'],
      },
    ],
  },
  // ═══════════════════════════════ Fachprogramme ═══════════════════════════════
  {
    id: 'fachprogramme', titel: 'Fachprogramme (Coscom, EuroPar, SolidWorks, enaio)', symbol: 'Laptop', beschreibung: 'Coscom ohne Lizenz, EuroPar-Fehler, SolidWorks startet nicht/ruckelt, Lizenzserver, enaio, Gravur-Software',
    unter: [
      {
        id: 'fp-coscom', titel: 'Coscom startet nicht oder meldet „keine Lizenz“', beschreibung: 'Coscom geht nicht auf, meldet „keine Lizenz“, „WibuKey nicht gefunden“ oder hängt',
        sonden: ['fpcos', 'fplic'],
        regeln: [
          { id: 'dienst-steht', wenn: f => liste(f['fpcos.diensteGestoppt']).length > 0, befund: f => `Lizenzdienst läuft nicht: ${txt(f['fpcos.diensteGestoppt'])}`, problem: 'programm-coscom-startet-nicht', schwere: 3 },
          { id: 'dongle-weg', wenn: f => nein(f['fpcos.dongle']) && ja(f['fpcos.dongleFrueher']), befund: () => 'Der Lizenz-Dongle steckte früher, wird JETZT aber nicht erkannt', problem: 'hardware-lizenzdongle', schwere: 3 },
          { id: 'dongle-fehler', wenn: f => ja(f['fpcos.dongleFehler']), befund: () => 'Der Lizenz-Dongle wird mit Gerätefehler erkannt', problem: 'hardware-lizenzdongle', schwere: 3 },
          { id: 'dienst-aus', wenn: f => liste(f['fpcos.diensteDeaktiviert']).length > 0, befund: f => `Lizenzdienst ist deaktiviert: ${txt(f['fpcos.diensteDeaktiviert'])}`, problem: 'hardware-lizenzdongle', schwere: 2 },
          { id: 'lizenzserver', wenn: f => liste(f['fplic.nichtErreichbar']).length > 0 || liste(f['fplic.nichtAufloesbar']).length > 0, befund: f => `Lizenzserver nicht erreichbar: ${[txt(f['fplic.nichtErreichbar']), txt(f['fplic.nichtAufloesbar'])].filter(Boolean).join(', ')}`, problem: 'netz-lizenzserver-nicht-erreichbar', schwere: 3 },
          { id: 'haengt', wenn: f => ja(f['fpcos.coscomHaengt']), befund: () => 'Coscom läuft, reagiert aber nicht', problem: 'programm-coscom-startet-nicht', schwere: 2 },
          { id: 'nicht-da', wenn: f => nein(f['fpcos.coscomInstalliert']) && nein(f['fpcos.wibuInstalliert']), befund: () => 'Weder Coscom noch die Lizenzsoftware (WibuKey/CodeMeter) ist installiert', problem: 'programm-coscom-einrichten', schwere: 2 },
          { id: 'fehler', wenn: f => num(f['fpcos.fehler7']) >= 3, befund: f => `${f['fpcos.fehler7']} Coscom-/Lizenzfehler in 7 Tagen`, problem: 'programm-coscom-startet-nicht', schwere: 1 },
        ],
        ohneBefund: ['programm-coscom-startet-nicht', 'hardware-lizenzdongle', 'programm-coscom-einrichten'],
      },
      {
        id: 'fp-europar', titel: 'EuroPar startet nicht oder meldet Fehler', beschreibung: '„Datenübertragung gestört“, Fehler zur .ini-Datei, Editor geht nicht oder EuroPar auf neuem PC einrichten',
        sonden: ['fpeuro'],
        regeln: [
          { id: 'ordner', wenn: f => liste(f['fpeuro.ordnerFehlen']).length > 0, befund: f => `EuroPar-Ordner fehlen: ${txt(f['fpeuro.ordnerFehlen'])}`, problem: 'programm-europar-einrichten', schwere: 3 },
          { id: 'q-fehlt', wenn: f => f['fpeuro.laufwerkQ'] === null, befund: () => 'Laufwerk Q: ist beim Benutzer nicht verbunden', problem: 'programm-europar-einrichten', schwere: 3 },
          { id: 'ini-leer', wenn: f => liste(f['fpeuro.iniLeer']).length > 0, befund: f => `Leere .ini-Datei(en) in C:\\Local: ${txt(f['fpeuro.iniLeer'])}`, problem: 'programm-europar-fehler', schwere: 3 },
          { id: 'variablen', wenn: f => ja(f['fpeuro.vorhanden']) && (nein(f['fpeuro.euroEurnOk']) || nein(f['fpeuro.euroWrknOk']) || nein(f['fpeuro.pathOk'])), befund: f => `Umgebungsvariablen stimmen nicht (EURO_EURN=${txt(f['fpeuro.euroEurn']) || 'fehlt'}, EURO_WRKN=${txt(f['fpeuro.euroWrkn']) || 'fehlt'}, PATH ${ja(f['fpeuro.pathOk']) ? 'ok' : 'ohne Q:\\Eurnc\\cmdnc0'})`, problem: 'programm-europar-fehler', schwere: 3 },
          { id: 'q-server', wenn: f => nein(f['fpeuro.qServerErreichbar']), befund: f => `Server von Laufwerk Q: (${txt(f['fpeuro.laufwerkQ'])}) ist nicht erreichbar`, problem: 'laufwerk-netzwerkpfad-nicht-gefunden', schwere: 2 },
          { id: 'local-rechte', wenn: f => nein(f['fpeuro.localSchreibrecht']), befund: () => 'Benutzer dürfen in C:\\Local nicht schreiben', problem: 'programm-europar-fehler', schwere: 2 },
        ],
        ohneBefund: ['programm-europar-fehler', 'programm-europar-einrichten', 'laufwerk-netzwerkpfad-nicht-gefunden'],
      },
      {
        id: 'fp-sw-start', titel: 'SolidWorks startet nicht oder stürzt ab', beschreibung: 'SolidWorks bleibt beim Startbild hängen, schließt sich sofort oder stürzt beim Arbeiten ab',
        sonden: ['cadsw', 'sys'],
        regeln: [
          { id: 'fehlt', wenn: f => nein(f['cadsw.installiert']), befund: () => 'SolidWorks ist auf diesem PC nicht installiert', problem: 'cad-solidworks-installation-update', schwere: 3 },
          { id: 'lizenz', wenn: f => nein(f['cadsw.lizenzErreichbar']), befund: f => `SolidNetWork-Lizenzserver ${txt(f['cadsw.lizenzServer'])} ist nicht erreichbar`, problem: 'cad-solidworks-lizenz-nicht-verfuegbar', schwere: 3 },
          { id: 'grafik-absturz', wenn: f => num(f['cadsw.grafikAbstuerze7']) > 0, befund: f => `SolidWorks ist ${f['cadsw.grafikAbstuerze7']}× im Grafiktreiber abgestürzt`, problem: 'cad-grafiktreiber-nicht-zertifiziert', schwere: 3 },
          { id: 'abstuerze', wenn: f => num(f['cadsw.abstuerze7']) >= 2, befund: f => `SolidWorks ist in 7 Tagen ${f['cadsw.abstuerze7']}× abgestürzt`, problem: 'cad-solidworks-stuerzt-ab', schwere: 3 },
          { id: 'haengt', wenn: f => ja(f['cadsw.haengt']), befund: () => 'SolidWorks läuft, reagiert aber nicht', problem: 'cad-solidworks-haengt', schwere: 2 },
          { id: 'platte', wenn: f => num(f['sys.cFreiGB']) < 5, befund: f => `Laufwerk C: hat nur noch ${zahl(f['sys.cFreiGB'])} GB frei`, problem: 'cad-laufwerk-c-voll-sicherungen', schwere: 2 },
          { id: 'mehrere', wenn: f => num(f['cadsw.anzahlVersionen']) >= 2, befund: f => `Mehrere SolidWorks-Versionen installiert (${txt(f['cadsw.versionen'])})`, problem: 'cad-doppelklick-falsche-version', schwere: 1 },
          { id: 'neustart', wenn: f => ja(f['sys.neustartAusstehend']), befund: () => 'Ein Neustart nach Updates steht aus', problem: 'cad-installation-service-pack-fehler', schwere: 1 },
        ],
        ohneBefund: ['cad-solidworks-startet-nicht', 'cad-solidworks-stuerzt-ab', 'cad-absturz-beim-start-nach-update'],
      },
      {
        id: 'fp-sw-grafik', titel: 'SolidWorks ist langsam, Grafik ruckelt oder flackert', beschreibung: 'Drehen ruckelt, RealView ausgegraut, Bild kurz schwarz, Kanten fehlen oder große Baugruppen sind zäh',
        sonden: ['cadsw', 'sys'],
        regeln: [
          { id: 'software-ogl', wenn: f => ja(f['cadsw.softwareOpenGL']), befund: () => '„Software-OpenGL verwenden“ ist eingeschaltet – 3D läuft ohne Grafikkarte', problem: 'cad-software-opengl-aktiv', schwere: 3 },
          { id: 'tdr', wenn: f => num(f['cadsw.tdr7']) > 0, befund: f => `Der Grafiktreiber hat sich in 7 Tagen ${f['cadsw.tdr7']}× neu gestartet`, problem: 'cad-grafiktreiber-reset', schwere: 3 },
          { id: 'keine-cad-karte', wenn: f => ja(f['cadsw.installiert']) && nein(f['cadsw.cadGrafik']), befund: f => `Keine CAD-Grafikkarte erkannt (${txt(f['cadsw.grafik']) || 'unbekannt'})`, problem: 'cad-grafiktreiber-nicht-zertifiziert', schwere: 2 },
          { id: 'ram', wenn: f => num(f['sys.ramFreiProzent']) < 10, befund: f => `Arbeitsspeicher fast voll (${f['sys.ramFreiProzent']} % frei)`, problem: 'cad-speicher-grosse-baugruppe', schwere: 2 },
          { id: 'haenger', wenn: f => num(f['cadsw.haenger7']) >= 3, befund: f => `SolidWorks hat in 7 Tagen ${f['cadsw.haenger7']}× nicht reagiert`, problem: 'cad-solidworks-haengt', schwere: 2 },
          { id: 'treiber-alt', wenn: f => ja(f['cadsw.installiert']) && num(f['cadsw.treiberAlterTage']) > 540, befund: f => `Grafiktreiber ist ${f['cadsw.treiberAlterTage']} Tage alt (${txt(f['cadsw.treiberVersion'])})`, problem: 'cad-grafiktreiber-nicht-zertifiziert', schwere: 1 },
          { id: 'wenig-ram', wenn: f => num(f['sys.ramGB']) > 0 && num(f['sys.ramGB']) < 15, befund: f => `Nur ${zahl(f['sys.ramGB'])} GB Arbeitsspeicher eingebaut`, problem: 'cad-speicher-grosse-baugruppe', schwere: 1 },
          { id: 'rtx', wenn: f => ja(f['cadsw.rtxDesktopManager']), befund: () => 'NVIDIA RTX Desktop Manager ist installiert (stört Edge/Chrome)', problem: 'cad-browser-nach-nvidia-treiber', schwere: 1 },
        ],
        ohneBefund: ['cad-solidworks-langsam-grafik', 'cad-grafik-artefakte', 'cad-oeffnen-speichern-langsam'],
      },
      {
        id: 'fp-sw-daten', titel: 'SolidWorks: Toolbox, Vorlagen, PDM-Tresor oder eDrawings fehlen', beschreibung: 'Toolbox/Normteile nicht verfügbar, Firmenvorlagen fehlen, PDM-Tresor nicht erreichbar oder eDrawings-Dateien öffnen nicht',
        sonden: ['cadsw', 'net'],
        fragen: [{ id: 'edrw', text: 'Geht es um eDrawings-Dateien (.easm, .eprt, .edrw), die sich nicht öffnen?' }],
        regeln: [
          { id: 'pdm-server', wenn: f => nein(f['cadsw.pdmServerErreichbar']), befund: () => 'Der PDM-Archivserver (Port 3030) ist nicht erreichbar', problem: 'cad-pdm-tresor', schwere: 3 },
          { id: 'pdm-ansicht', wenn: f => ja(f['cadsw.pdmInstalliert']) && num(f['cadsw.pdmTresore']) === 0, befund: () => 'PDM-Client ist installiert, aber keine Tresoransicht eingerichtet', problem: 'cad-pdm-tresoransicht-fehlt', schwere: 3 },
          { id: 'edrawings', wenn: f => f['frage.edrw'] === 'ja' && nein(f['cadsw.edrawings']), befund: () => 'eDrawings ist nicht installiert', problem: 'cad-edrawings-oeffnet-nicht', schwere: 3 },
          { id: 'laufwerk-g', wenn: f => ja(f['cadsw.installiert']) && f['cadsw.laufwerkG'] === null, befund: () => 'Laufwerk G: (Toolbox/PortaX) ist nicht als Netzlaufwerk eingetragen', problem: 'laufwerk-g-portax', schwere: 2 },
          { id: 'zscaler-aus', wenn: f => ja(f['net.zscalerInstalliert']) && f['net.zscalerDienst'] != null && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])}) – Netzlaufwerke/PDM nicht erreichbar`, problem: 'cad-toolbox-nicht-erreichbar', schwere: 2 },
          { id: 'kein-firmennetz', wenn: f => nein(f['net.domaeneErreichbar']), befund: f => `Firmennetz (${txt(f['net.domaene'])}) ist nicht erreichbar`, problem: 'cad-toolbox-nicht-erreichbar', schwere: 1 },
        ],
        ohneBefund: ['cad-toolbox-nicht-erreichbar', 'cad-vorlagen-fehlen', 'cad-pdm-tresor', 'cad-referenzen-nicht-gefunden'],
      },
      {
        id: 'fp-lizenz', titel: 'Lizenzserver nicht erreichbar / Lizenz nicht verfügbar', beschreibung: '„Lizenzserver nicht erreichbar“, SolidNetWork-Fehler -96/-15, CodeMeter/FlexLM ohne Lizenz, Netzwerk-Dongle fehlt',
        sonden: ['fplic', 'cadsw', 'net'],
        regeln: [
          { id: 'snl', wenn: f => nein(f['cadsw.lizenzErreichbar']), befund: f => `SolidNetWork-Lizenzserver ${txt(f['cadsw.lizenzServer'])} ist nicht erreichbar`, problem: 'cad-solidnetwork-fehler-96-15', schwere: 3 },
          { id: 'server-weg', wenn: f => liste(f['fplic.nichtErreichbar']).length > 0 || liste(f['fplic.nichtAufloesbar']).length > 0, befund: f => `Lizenzserver nicht erreichbar: ${[txt(f['fplic.nichtErreichbar']), txt(f['fplic.nichtAufloesbar'])].filter(Boolean).join(', ')}`, problem: 'netz-lizenzserver-nicht-erreichbar', schwere: 3 },
          { id: 'sentinel', wenn: f => f['fplic.sentinelDienst'] != null && txt(f['fplic.sentinelDienst']) !== 'Running', befund: f => `Sentinel/HASP-Lizenzdienst läuft nicht (${txt(f['fplic.sentinelDienst'])})`, problem: 'hardware-lizenzdongle', schwere: 2 },
          { id: 'usb-server', wenn: f => liste(f['fplic.usbServerAus']).length > 0, befund: f => `USB-Deviceserver-Software läuft nicht: ${txt(f['fplic.usbServerAus'])}`, problem: 'netz-usb-server-dongle', schwere: 2 },
          { id: 'zscaler-aus', wenn: f => ja(f['net.zscalerInstalliert']) && f['net.zscalerDienst'] != null && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])}) – interne Lizenzserver nur über den Tunnel`, problem: 'vpn-einzelne-anwendung-homeoffice', schwere: 2 },
          { id: 'kein-firmennetz', wenn: f => nein(f['net.domaeneErreichbar']), befund: f => `Firmennetz (${txt(f['net.domaene'])}) ist nicht erreichbar`, problem: 'vpn-einzelne-anwendung-homeoffice', schwere: 1 },
          { id: 'dns', wenn: f => nein(f['net.dnsOk']), befund: () => 'Die Namensauflösung (DNS) funktioniert nicht', problem: 'netz-lizenzserver-nicht-erreichbar', schwere: 2 },
        ],
        ohneBefund: ['netz-lizenzserver-nicht-erreichbar', 'cad-solidworks-lizenz-nicht-verfuegbar', 'hardware-lizenzdongle', 'netz-lizenz-mac-hostid'],
      },
      {
        id: 'fp-enaio', titel: 'enaio startet nicht, ist langsam oder die Ablage fehlt', beschreibung: 'enaio-Client geht nicht auf, „keine Verbindung zum Server“, fragt nach Kennwort, ist sehr langsam oder die enaio-Leiste in Outlook fehlt',
        sonden: ['fpenaio', 'net', 'aad'],
        regeln: [
          { id: 'fehlt', wenn: f => nein(f['fpenaio.installiert']), befund: () => 'enaio ist auf diesem PC nicht installiert', problem: 'sonstiges-enaio-startet-nicht', schwere: 3 },
          { id: 'server', wenn: f => nein(f['fpenaio.serverErreichbar']), befund: f => `enaio-Server ${txt(f['fpenaio.server'])} ist ${nein(f['fpenaio.serverAufloesbar']) ? 'nicht auflösbar' : 'nicht erreichbar'}`, problem: 'sonstiges-enaio-startet-nicht', schwere: 3 },
          { id: 'addin', wenn: f => f['fpenaio.addinLoad'] != null && num(f['fpenaio.addinLoad']) !== 3, befund: f => `enaio-Add-in in Outlook ist deaktiviert (LoadBehavior ${f['fpenaio.addinLoad']})`, problem: 'outlook-enaio-addin-fehlt', schwere: 3 },
          { id: 'haengt', wenn: f => ja(f['fpenaio.haengt']), befund: () => 'enaio läuft, reagiert aber nicht', problem: 'sonstiges-enaio-langsam', schwere: 2 },
          { id: 'cache', wenn: f => num(f['fpenaio.cacheGB']) >= 2, befund: f => `enaio-Cache belegt ${zahl(f['fpenaio.cacheGB'])} GB im Profil`, problem: 'sonstiges-enaio-cache-gross', schwere: 2 },
          { id: 'abstuerze', wenn: f => num(f['fpenaio.abstuerze7']) >= 2, befund: f => `enaio ist in 7 Tagen ${f['fpenaio.abstuerze7']}× abgestürzt`, problem: 'sonstiges-enaio-absturz-grosse-dokumente', schwere: 2 },
          { id: 'kein-tgt', wenn: f => nein(f['aad.kerberosTgt']), befund: () => 'Kein Kerberos-Anmeldeticket – enaio kann nicht automatisch anmelden', problem: 'sonstiges-enaio-kennwort-abfrage', schwere: 2 },
          { id: 'zscaler-aus', wenn: f => ja(f['net.zscalerInstalliert']) && f['net.zscalerDienst'] != null && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])})`, problem: 'vpn-einzelne-anwendung-homeoffice', schwere: 1 },
        ],
        ohneBefund: ['sonstiges-enaio-startet-nicht', 'sonstiges-enaio-langsam', 'sonstiges-enaio-dokument-oeffnet-nicht', 'outlook-enaio-addin-fehlt'],
      },
      {
        id: 'fp-gravur', titel: 'Gravur-Software (NGrav/SignPro) geht nur beim Admin', beschreibung: 'NGrav bzw. SignPro läuft beim Administrator, andere Benutzer bekommen „Zugriff verweigert“ oder Einstellungen gehen verloren',
        sonden: ['fpgrav'],
        regeln: [
          { id: 'rechte', wenn: f => liste(f['fpgrav.ohneSchreibrecht']).length > 0, befund: f => `Benutzer dürfen im Datenordner nicht schreiben: ${txt(f['fpgrav.ohneSchreibrecht'])}`, problem: 'programm-gravur-ngrav-zugriff', schwere: 3 },
          { id: 'kein-ordner', wenn: f => ja(f['fpgrav.installiert']) && num(f['fpgrav.ordner']) === 0, befund: () => 'Gravur-Software ist installiert, aber kein Datenordner unter „Öffentliche Dokumente“', problem: 'programm-gravur-ngrav-zugriff', schwere: 2 },
          { id: 'fehlt', wenn: f => nein(f['fpgrav.installiert']) && num(f['fpgrav.ordner']) === 0, befund: () => 'NGrav/SignPro ist auf diesem PC nicht installiert', problem: 'update-programm-installieren', schwere: 2 },
          { id: 'abstuerze', wenn: f => num(f['fpgrav.abstuerze7']) >= 2, befund: f => `Gravur-Software ist in 7 Tagen ${f['fpgrav.abstuerze7']}× abgestürzt`, problem: 'programm-gravur-ngrav-zugriff', schwere: 1 },
        ],
        ohneBefund: ['programm-gravur-ngrav-zugriff', 'update-programm-installieren'],
      },
    ],
  },
]
