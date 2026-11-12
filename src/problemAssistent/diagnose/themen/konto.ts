// ── Diagnose-Thema „Anmeldung, Konto & Sicherheit“ ───────────────────────────
// Sonden: ko (Anmeldung am PC: Zeit, Domäne, fehlgeschlagene Anmeldungen, Hello/Biometrie)
//         koanm (Sitzung des Benutzers: AD-Kontostatus, gespeicherte Anmeldedaten – nur ANZAHL –, Benutzerzertifikate)
//         koaad (Entra-/Microsoft-Anmeldefehler aus dem AAD-Protokoll)
//         sec (Defender, Firewall, BitLocker – nie Schlüssel –, TPM, Secure Boot, Computerzertifikate)
// Alles NUR LESEND.
import { ja, liste, nein, num, txt, zahl } from '../motor'
import type { DgFakten, DgOber, DgRegel, DgSonde } from '../types'
import { berText, ordneGruppeZu } from '../../berechtigungen'
import { ausserhalbFirmennetz } from './laufwerke'

/** Je fehlende Gruppe (Sonde „rechte“: Vergleich mit den Kollegen) ein Befund mit Fehlerbild und Antrag. */
export const RECHTE_ALLE_REGEL: DgRegel = {
  id: 'gruppen-fehlen', wenn: f => num(f['rechte.fehlenAnzahl']) > 0, befund: () => '', problem: 'berechtigung-fehlt-kollegen-vergleich', schwere: 2,
  viele: f => liste(f['rechte.fehlen']).filter(z => { const [cn = '', desc = ''] = z.split('|'); return ordneGruppeZu(cn, desc).art.id !== 'ignorieren' }).map(z => {
    const [cn = '', desc = '', anz = '0', von = '0'] = z.split('|')
    const b = berText(cn, desc, Number(anz), Number(von))
    return { text: b.text, problem: b.problem, antrag: b.antrag, fehlerbild: b.fehlerbild }
  }),
}

/** Enthält die Liste (z. B. Statuscodes) einen der Werte? Fehlender Fakt ⇒ false. */
const hat = (f: DgFakten, k: string, ...werte: string[]): boolean => liste(f[k]).some(x => werte.includes(String(x).toLowerCase()))

export const SONDEN_KONTO: DgSonde[] = [
  {
    id: 'ko', titel: 'Anmeldung am PC (Uhrzeit, Domäne, Fehlversuche, Windows Hello)', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
function TcpKo([string]$h, [int]$port) { try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($h, $port).Wait(3000) -and $t.Connected; $t.Close(); return [bool]$ok } catch { return $false } }
# Unbekannter Ereignisanbieter wirft „Falscher Parameter“ trotz -EA SilentlyContinue → abfangen
function AnzKo([hashtable]$h, [int]$max) { try { return @(Get-WinEvent -FilterHashtable $h -MaxEvents $max -EA Stop).Count } catch { return 0 } }
$cs = Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue
$dm = [bool]($cs -and $cs.PartOfDomain)
$dom = $(if ($cs) { [string]$cs.Domain } else { '' })
Fakt 'domaenenMitglied' $dm
$dcOk = $false; if ($dm -and $dom) { $dcOk = TcpKo $dom 389 }
Fakt 'dcErreichbar' $dcOk
Punkt 'Domäne' $(if (-not $dm) { 'info' } elseif ($dcOk) { 'ok' } else { 'warn' }) $(if (-not $dm) { 'PC ist in keiner Domäne' } elseif ($dcOk) { $dom + ' erreichbar' } else { $dom + ' nicht erreichbar (Homeoffice ohne Tunnel?)' })
# Uhrzeit: Abweichung zum Domänencontroller, sonst zum Microsoft-Anmeldeserver
$tz = Get-TimeZone -EA SilentlyContinue
Fakt 'zeitzone' $(if ($tz) { [string]$tz.Id } else { $null })
$w32 = Get-Service -Name W32Time -EA SilentlyContinue
Fakt 'zeitdienst' $(if ($w32) { [string]$w32.Status } else { $null })
$quelle = $null
try { $quelle = ([string](& w32tm /query /source 2>$null | Select-Object -First 1)).Trim() } catch {}
if ($quelle -match '(?i)zugriff|access|0x8') { $quelle = $null }
Fakt 'zeitquelle' $quelle
$abw = $null; $abwVon = ''
if ($dcOk) {
  try {
    $sc = @(& w32tm /stripchart ('/computer:' + $dom) /samples:1 /dataonly 2>$null | ForEach-Object { [string]$_ })
    $z = $sc | Where-Object { $_ -match '([+-]\d+[\.,]\d+)s' } | Select-Object -First 1
    if ($z -and $z -match '([+-]\d+[\.,]\d+)s') { $abw = [math]::Round([double]($Matches[1].Replace(',', '.')), 0); $abwVon = 'Domänencontroller' }
  } catch {}
}
if ($null -eq $abw) {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
    $rq = [System.Net.HttpWebRequest]::Create('https://login.microsoftonline.com/')
    $rq.Method = 'HEAD'; $rq.Timeout = 5000; $rq.AllowAutoRedirect = $false
    $rs = $null
    try { $rs = $rq.GetResponse() } catch [System.Net.WebException] { $rs = $_.Exception.Response }
    if ($rs) {
      $dh = [string]$rs.Headers['Date']; $rs.Close()
      if ($dh) { $srv = [datetime]::ParseExact($dh, 'r', [Globalization.CultureInfo]::InvariantCulture); $abw = [math]::Round(((Get-Date).ToUniversalTime() - $srv).TotalSeconds, 0); $abwVon = 'Microsoft-Server' }
    }
  } catch {}
}
Fakt 'zeitAbweichungSek' $(if ($null -ne $abw) { [math]::Abs([double]$abw) } else { $null })
Punkt 'Uhrzeit' $(if ($null -eq $abw) { 'info' } elseif ([math]::Abs($abw) -ge 300) { 'fehler' } elseif ([math]::Abs($abw) -ge 60) { 'warn' } else { 'ok' }) $(if ($null -eq $abw) { 'Abweichung nicht messbar (keine Verbindung)' } else { 'weicht ' + [math]::Abs($abw) + ' s vom ' + $abwVon + ' ab' + $(if ($tz) { ', Zeitzone ' + $tz.Id } else { '' }) + $(if ($quelle) { ', Zeitquelle ' + $quelle } else { '' }) })
# Vertrauensstellung (nur aussagekräftig, wenn der DC erreichbar ist)
$kanal = $null
if ($dm -and $dcOk) { try { $kanal = [bool](Test-ComputerSecureChannel -EA Stop) } catch { $kanal = $null } }
Fakt 'sichererKanal' $kanal
$n5719 = AnzKo @{ LogName = 'System'; ProviderName = 'NETLOGON'; Id = 5719; StartTime = (Get-Date).AddDays(-7) } 100
$n3210 = AnzKo @{ LogName = 'System'; ProviderName = 'NETLOGON'; Id = 3210; StartTime = (Get-Date).AddDays(-7) } 100
$krb4 = AnzKo @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Security-Kerberos'; Id = 4; StartTime = (Get-Date).AddDays(-7) } 100
Fakt 'netlogonKeinDc7' $n5719; Fakt 'netlogonVertrauen7' $n3210; Fakt 'kerberosFehler7' $krb4
if ($dm) {
  Punkt 'Vertrauensstellung zur Domäne' $(if ($kanal -eq $false -or $n3210 -gt 0) { 'fehler' } elseif ($kanal) { 'ok' } else { 'info' }) $(if ($kanal -eq $false) { 'GESTÖRT (sicherer Kanal antwortet nicht)' } elseif ($n3210 -gt 0) { '' + $n3210 + '× Netlogon 3210 (Computerkonto abgelehnt) in 7 Tagen' } elseif ($kanal) { 'in Ordnung' } else { 'nicht prüfbar (Adminrechte oder DC nötig)' })
  Punkt 'Anmeldeserver (7 Tage)' $(if ($n5719 -ge 3) { 'warn' } else { 'ok' }) ('' + $n5719 + '× „kein Anmeldeserver“ (Netlogon 5719), ' + $krb4 + '× Kerberos-Fehler 4')
}
$gpo = AnzKo @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-GroupPolicy'; Level = 2; StartTime = (Get-Date).AddDays(-7) } 200
Fakt 'gpoFehler7' $gpo
if ($dm) { Punkt 'Gruppenrichtlinien (7 Tage)' $(if ($gpo -ge 3) { 'warn' } else { 'ok' }) ('' + $gpo + ' Fehler') }
# Fehlgeschlagene Anmeldungen (Sicherheitsprotokoll 4625, nur Statuscodes – keine Kennwörter)
$secLesbar = $true
try { $null = Get-WinEvent -LogName Security -MaxEvents 1 -EA Stop } catch { $secLesbar = $false }
Fakt 'sicherheitsprotokollLesbar' $secLesbar
if ($secLesbar) {
  $ev = @(); try { $ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4625; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA Stop) } catch {}
  $codes = @{}
  foreach ($x in $ev) {
    $c = ''
    try { $sub = $x.Properties[9].Value; $st = $x.Properties[7].Value; $c = $(if ($sub -and [string]$sub -ne '0') { '0x{0:X8}' -f $sub } else { '0x{0:X8}' -f $st }) } catch {}
    if ($c) { $c = $c.ToLower(); if ($codes.ContainsKey($c)) { $codes[$c]++ } else { $codes[$c] = 1 } }
  }
  $nm = @{ '0xc000006a' = 'Kennwort falsch'; '0xc0000234' = 'Konto gesperrt'; '0xc0000071' = 'Kennwort abgelaufen'; '0xc0000224' = 'Kennwort muss geändert werden'; '0xc0000072' = 'Konto deaktiviert'; '0xc000006f' = 'außerhalb der Anmeldezeiten'; '0xc0000070' = 'an diesem PC nicht erlaubt'; '0xc0000133' = 'Uhrzeit weicht ab'; '0xc000015b' = 'Anmeldeart nicht erlaubt'; '0xc0000064' = 'Benutzer unbekannt'; '0xc0000193' = 'Konto abgelaufen' }
  Fakt 'anmeldefehler7' $ev.Count
  Fakt 'statusCodes' @($codes.Keys | ForEach-Object { [string]$_ })
  Fakt 'falschesKennwort7' $(if ($codes.ContainsKey('0xc000006a')) { $codes['0xc000006a'] } else { 0 })
  Fakt 'gesperrt7' $(if ($codes.ContainsKey('0xc0000234')) { $codes['0xc0000234'] } else { 0 })
  $txtC = @($codes.Keys | Sort-Object { -$codes[$_] } | Select-Object -First 4 | ForEach-Object { '' + $codes[$_] + '× ' + $(if ($nm.ContainsKey($_)) { $nm[$_] } else { $_ }) }) -join ', '
  Punkt 'Fehlgeschlagene Anmeldungen (7 Tage)' $(if ($codes.ContainsKey('0xc0000234') -or $ev.Count -ge 10) { 'fehler' } elseif ($ev.Count) { 'warn' } else { 'ok' }) $(if ($ev.Count) { '' + $ev.Count + ': ' + $txtC } else { 'keine' })
} else {
  Fakt 'anmeldefehler7' $null
  Punkt 'Fehlgeschlagene Anmeldungen' 'info' 'Sicherheitsprotokoll nicht lesbar (Adminrechte nötig)'
}
# Windows Hello / Biometrie
$wbio = Get-Service -Name WbioSrvc -EA SilentlyContinue
Fakt 'biometrieDienst' $(if ($wbio) { [string]$wbio.Status } else { $null }); Fakt 'biometrieDienstStart' $(if ($wbio) { [string]$wbio.StartType } else { $null })
$bio = @(Get-PnpDevice -Class Biometric -EA SilentlyContinue)
$bioF = @($bio | Where-Object { $_.Status -eq 'Error' -or $_.Status -eq 'Degraded' })
Fakt 'biometrieGeraete' $bio.Count; Fakt 'biometrieFehler' $bioF.Count
$bpol = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Biometrics' -Name Enabled -EA SilentlyContinue).Enabled
Fakt 'biometrieRichtlinieAus' ($bpol -eq 0)
$hpol = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\PassportForWork' -Name Enabled -EA SilentlyContinue).Enabled
Fakt 'helloRichtlinieAus' ($hpol -eq 0)
$hf = AnzKo @{ LogName = 'Microsoft-Windows-HelloForBusiness/Operational'; Level = 2; StartTime = (Get-Date).AddDays(-7) } 100
Fakt 'helloFehler7' $hf
Punkt 'Gesicht / Fingerabdruck' $(if ($bpol -eq 0) { 'warn' } elseif ($bioF.Count -or ($bio.Count -and $wbio -and [string]$wbio.StartType -eq 'Disabled')) { 'fehler' } elseif ($bio.Count) { 'ok' } else { 'info' }) $(if ($bpol -eq 0) { 'per Richtlinie abgeschaltet' } elseif ($bio.Count) { '' + $bio.Count + ' Gerät(e)' + $(if ($bioF.Count) { ', ' + $bioF.Count + ' mit Fehler' } else { '' }) + ', Biometriedienst ' + $(if ($wbio) { [string]$wbio.Status + ' (' + [string]$wbio.StartType + ')' } else { 'fehlt' }) } else { 'keine Kamera/kein Leser für Windows Hello' })
Punkt 'Windows Hello (Ereignisse 7 Tage)' $(if ($hpol -eq 0) { 'warn' } elseif ($hf -ge 3) { 'warn' } else { 'ok' }) $(if ($hpol -eq 0) { 'Windows Hello for Business per Richtlinie AUS' } else { '' + $hf + ' Fehler im Hello-Protokoll' })
`,
  },
  {
    id: 'koanm', titel: 'Konto des Benutzers (Sperre, Kennwortablauf, gespeicherte Anmeldedaten, Zertifikate)', modus: 'benutzer', timeoutMs: 90000,
    ps: String.raw`
$sam = [string]$env:USERNAME
$adOk = $false
try {
  $ds = New-Object System.DirectoryServices.DirectorySearcher
  $ds.Filter = '(&(objectCategory=person)(objectClass=user)(sAMAccountName=' + $sam + '))'
  $ds.ClientTimeout = New-TimeSpan -Seconds 15
  foreach ($a in @('userAccountControl', 'msDS-User-Account-Control-Computed', 'msDS-UserPasswordExpiryTimeComputed', 'pwdLastSet', 'badPwdCount', 'lockoutTime')) { [void]$ds.PropertiesToLoad.Add($a) }
  $r = $ds.FindOne()
  if ($r) {
    $adOk = $true
    $kuac = 0; $kcomp = 0
    try { $kuac = [int64]$r.Properties['useraccountcontrol'][0] } catch {}
    try { $kcomp = [int64]$r.Properties['msds-user-account-control-computed'][0] } catch {}
    $gesp = ($kcomp -band 0x10) -ne 0
    $abgel = ($kcomp -band 0x800000) -ne 0
    $deakt = ($kuac -band 0x2) -ne 0
    $nieAb = ($kuac -band 0x10000) -ne 0
    $rest = $null
    try { $ex = [int64]$r.Properties['msds-userpasswordexpirytimecomputed'][0]; if ($ex -gt 0 -and $ex -lt [int64]::MaxValue) { $rest = [math]::Round(([datetime]::FromFileTimeUtc($ex) - (Get-Date).ToUniversalTime()).TotalDays, 1) } } catch {}
    $geaendert = $null
    try { $pls = [int64]$r.Properties['pwdlastset'][0]; if ($pls -gt 0) { $geaendert = [math]::Round(((Get-Date).ToUniversalTime() - [datetime]::FromFileTimeUtc($pls)).TotalDays, 1) } } catch {}
    $bad = $null; try { $bad = [int]$r.Properties['badpwdcount'][0] } catch {}
    Fakt 'gesperrt' $gesp; Fakt 'kennwortAbgelaufen' $abgel; Fakt 'deaktiviert' $deakt
    Fakt 'kennwortTageRest' $(if ($nieAb) { $null } else { $rest }); Fakt 'kennwortGeaendertVorTagen' $geaendert; Fakt 'falscheKennwoerter' $bad
    Punkt 'AD-Konto' $(if ($gesp -or $deakt -or $abgel) { 'fehler' } else { 'ok' }) $(if ($deakt) { 'DEAKTIVIERT' } elseif ($gesp) { 'GESPERRT (zu viele Fehlversuche)' } elseif ($abgel) { 'Kennwort ABGELAUFEN' } else { 'aktiv, nicht gesperrt' })
    Punkt 'Kennwort' $(if ($null -ne $rest -and $rest -lt 0) { 'fehler' } elseif ($null -ne $rest -and $rest -le 5) { 'warn' } else { 'ok' }) ($(if ($nieAb) { 'läuft nie ab' } elseif ($null -ne $rest) { 'läuft in ' + $rest + ' Tagen ab' } else { 'Ablauf unbekannt' }) + $(if ($null -ne $geaendert) { ', zuletzt geändert vor ' + $geaendert + ' Tagen' } else { '' }))
    if ($null -ne $bad) { Punkt 'Falsche Kennworteingaben (am DC gezählt)' $(if ($bad -ge 3) { 'warn' } else { 'ok' }) ('' + $bad) }
  }
} catch {}
Fakt 'adErreichbar' $adOk
if (-not $adOk) { Punkt 'AD-Konto' 'info' 'Domäne nicht erreichbar – Kontostatus nicht abfragbar' }
# Anmeldeinformationsverwaltung: NUR zählen, nie Ziele oder Kennwörter ausgeben
$ck = @(& (Join-Path $env:SystemRoot 'System32\cmdkey.exe') /list 2>$null | ForEach-Object { [string]$_ })
$ziele = @($ck | Where-Object { $_ -match '^\s*(Ziel|Target)\s*:' })
$office = @($ziele | Where-Object { $_ -match '(?i)MicrosoftOffice|msteams|OneDrive|SSO_POP|AzureAD|microsoftaccount' }).Count
$windows = @($ziele | Where-Object { $_ -match '(?i)Domain:target=|Domain:interactive=' }).Count
Fakt 'gespeichert' $ziele.Count; Fakt 'officeEintraege' $office; Fakt 'windowsEintraege' $windows
Punkt 'Gespeicherte Anmeldedaten' $(if ($windows -ge 3) { 'warn' } else { 'info' }) ('' + $ziele.Count + ' Einträge (' + $windows + ' Windows-/Server-Anmeldungen, ' + $office + ' Office/Microsoft) – Inhalte werden nicht ausgelesen')
# Benutzerzertifikate (Ablauf)
$jetzt = Get-Date
$bz = @(Get-ChildItem -Path 'Cert:\CurrentUser\My' -EA SilentlyContinue | Where-Object { $_.HasPrivateKey })
$bzg = @($bz | Where-Object { $_.NotAfter -gt $jetzt -and $_.NotBefore -lt $jetzt })
$bza = @($bz | Where-Object { $_.NotAfter -le $jetzt })
$bzRest = $null; if ($bzg.Count) { $bzRest = [math]::Round((($bzg | Sort-Object NotAfter -Descending | Select-Object -First 1).NotAfter - $jetzt).TotalDays, 0) }
Fakt 'benutzerZert' $bz.Count; Fakt 'benutzerZertGueltig' $bzg.Count; Fakt 'benutzerZertAbgelaufen' $bza.Count; Fakt 'benutzerZertRestTage' $bzRest
Punkt 'Persönliche Zertifikate' $(if ($bz.Count -and -not $bzg.Count) { 'fehler' } elseif ($bza.Count) { 'warn' } else { 'ok' }) $(if ($bz.Count) { '' + $bzg.Count + ' gültig, ' + $bza.Count + ' abgelaufen' + $(if ($null -ne $bzRest) { ', längstes noch ' + $bzRest + ' Tage' } else { '' }) } else { 'keine' })
`,
  },
  {
    id: 'koaad', titel: 'Microsoft-Anmeldefehler (Entra-Protokoll der letzten 7 Tage)', modus: 'system', timeoutMs: 60000,
    ps: String.raw`
$lg = 'Microsoft-Windows-AAD/Operational'
$da = [bool](Get-WinEvent -ListLog $lg -EA SilentlyContinue)
Fakt 'protokoll' $da
if ($da) {
  $ev = @(); try { $ev = @(Get-WinEvent -FilterHashtable @{ LogName = $lg; Level = 2; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 400 -EA Stop) } catch {}
  $sts = @{}; $hex = @{}
  foreach ($x in $ev) {
    $m = [string]$x.Message
    foreach ($t in [regex]::Matches($m, 'AADSTS(\d{5,7})')) { $k = $t.Groups[1].Value; if ($sts.ContainsKey($k)) { $sts[$k]++ } else { $sts[$k] = 1 } }
    foreach ($t in [regex]::Matches($m, '0x[cC][aA][aA][0-9A-Fa-f]{5}')) { $k = $t.Value.ToLower(); if ($hex.ContainsKey($k)) { $hex[$k]++ } else { $hex[$k] = 1 } }
  }
  $letzt = $null; if ($ev.Count) { $letzt = [math]::Round(((Get-Date) - ($ev | Sort-Object TimeCreated -Descending | Select-Object -First 1).TimeCreated).TotalHours, 1) }
  Fakt 'fehler7' $ev.Count; Fakt 'aadsts' @($sts.Keys | ForEach-Object { [string]$_ }); Fakt 'fehlerCodes' @($hex.Keys | ForEach-Object { [string]$_ }); Fakt 'letzterFehlerVorStunden' $letzt
  Punkt 'Anmeldefehler (Entra, 7 Tage)' $(if ($ev.Count -ge 20) { 'warn' } elseif ($ev.Count) { 'info' } else { 'ok' }) $(if ($ev.Count) { '' + $ev.Count + ' Fehler, zuletzt vor ' + $letzt + ' h' } else { 'keine' })
  if ($sts.Count) { Punkt 'Microsoft-Fehlercodes (AADSTS)' 'warn' ((@($sts.Keys | Sort-Object { -$sts[$_] } | Select-Object -First 6 | ForEach-Object { 'AADSTS' + $_ + ' (' + $sts[$_] + '×)' })) -join ', ') }
  if ($hex.Count) { Punkt 'Token-Fehlercodes' 'info' ((@($hex.Keys | Sort-Object { -$hex[$_] } | Select-Object -First 6 | ForEach-Object { $_ + ' (' + $hex[$_] + '×)' })) -join ', ') }
} else {
  Fakt 'fehler7' $null
  Punkt 'Entra-Protokoll' 'info' 'nicht vorhanden'
}
`,
  },
  {
    id: 'sec', titel: 'Sicherheit (Virenschutz, Firewall, BitLocker, TPM, Secure Boot, Computerzertifikate)', modus: 'system', timeoutMs: 120000,
    ps: String.raw`
function AnzSec([hashtable]$h, [int]$max) { try { return @(Get-WinEvent -FilterHashtable $h -MaxEvents $max -EA Stop).Count } catch { return 0 } }
# Virenschutz (Defender) – nur lesen
$mp = $null; try { $mp = Get-MpComputerStatus -EA Stop } catch {}
$fremd = @()
try { $fremd = @(Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName AntiVirusProduct -EA Stop | Where-Object { $_.displayName -notmatch '(?i)Defender' } | ForEach-Object { [string]$_.displayName }) } catch {}
Fakt 'fremdVirenscanner' @($fremd)
if ($mp) {
  Fakt 'echtzeitschutz' ([bool]$mp.RealTimeProtectionEnabled); Fakt 'defenderModus' ([string]$mp.AMRunningMode); Fakt 'signaturAlterTage' ([int]$mp.AntivirusSignatureAge)
  Punkt 'Echtzeitschutz (Defender)' $(if ($mp.RealTimeProtectionEnabled) { 'ok' } else { 'fehler' }) ($(if ($mp.RealTimeProtectionEnabled) { 'an' } else { 'AUS' + $(if ($fremd.Count) { ' – anderer Virenscanner: ' + ($fremd -join ', ') } else { '' }) }) + ' (Modus ' + [string]$mp.AMRunningMode + ')')
  Punkt 'Virensignaturen' $(if ($mp.AntivirusSignatureAge -ge 7) { 'fehler' } elseif ($mp.AntivirusSignatureAge -ge 3) { 'warn' } else { 'ok' }) ('' + $mp.AntivirusSignatureAge + ' Tage alt')
} else {
  Fakt 'echtzeitschutz' $null
  Punkt 'Defender' 'info' $(if ($fremd.Count) { 'nicht abfragbar – Virenscanner: ' + ($fremd -join ', ') } else { 'Status nicht abfragbar' })
}
$funde = @(); $namen = @{}
try { foreach ($t in @(Get-MpThreat -EA Stop)) { $namen[[string]$t.ThreatID] = [string]$t.ThreatName } } catch {}
try { $funde = @(Get-MpThreatDetection -EA Stop | Where-Object { $_.InitialDetectionTime -gt (Get-Date).AddDays(-30) }) } catch {}
$f7 = @($funde | Where-Object { $_.InitialDetectionTime -gt (Get-Date).AddDays(-7) })
$gruppen = @($funde | Group-Object ThreatID | Sort-Object Count -Descending)
$fundNamen = @($f7 | ForEach-Object { $k = [string]$_.ThreatID; if ($namen.ContainsKey($k)) { $namen[$k] } else { 'ID ' + $k } } | Select-Object -Unique)
Fakt 'funde7' $f7.Count; Fakt 'fundNamen' @($fundNamen)
Fakt 'gleicherFund30' $(if ($gruppen.Count) { [int]$gruppen[0].Count } else { 0 })
Punkt 'Funde (7 Tage)' $(if ($f7.Count) { 'fehler' } else { 'ok' }) $(if ($f7.Count) { '' + $f7.Count + ': ' + (($fundNamen | Select-Object -First 4) -join ', ') } else { 'keine' + $(if (-not $namen.Count -and -not $funde.Count) { ' (bzw. nicht abfragbar)' } else { '' }) })
$dlog = 'Microsoft-Windows-Windows Defender/Operational'
$asr = AnzSec @{ LogName = $dlog; Id = 1121; StartTime = (Get-Date).AddDays(-7) } 200
$cfa = AnzSec @{ LogName = $dlog; Id = 1123; StartTime = (Get-Date).AddDays(-7) } 200
$nps = AnzSec @{ LogName = $dlog; Id = 1126; StartTime = (Get-Date).AddDays(-7) } 200
Fakt 'asrBlock7' $asr; Fakt 'ordnerzugriffBlock7' $cfa; Fakt 'netzschutzBlock7' $nps
Punkt 'Blockiert (7 Tage)' $(if ($asr -or $cfa -or $nps) { 'warn' } else { 'ok' }) ('' + $asr + '× Angriffsflächen-Regel, ' + $cfa + '× überwachter Ordnerzugriff, ' + $nps + '× Netzwerkschutz')
# Firewall
$fwAus = @(Get-NetFirewallProfile -EA SilentlyContinue | Where-Object { [string]$_.Enabled -eq 'False' } | ForEach-Object { [string]$_.Name })
Fakt 'firewallAus' @($fwAus)
Punkt 'Firewall' $(if ($fwAus.Count) { 'fehler' } else { 'ok' }) $(if ($fwAus.Count) { 'AUS für: ' + ($fwAus -join ', ') } else { 'alle Profile an' })
# BitLocker (nur Status, NIE Schlüssel)
$bl = $null; try { $bl = Get-BitLockerVolume -MountPoint 'C:' -EA Stop } catch {}
$blStatus = 'unbekannt'; $blProz = $null; $blTpm = $null; $blRoh = $null
if ($bl) {
  $vs = [string]$bl.VolumeStatus; $ps2 = [string]$bl.ProtectionStatus; $blProz = [int]$bl.EncryptionPercentage
  $blTpm = [bool](@($bl.KeyProtector | Where-Object { [string]$_.KeyProtectorType -match '^Tpm' }).Count)
  $blStatus = $(if ($vs -eq 'FullyDecrypted') { 'aus' } elseif ($vs -match 'EncryptionInProgress|EncryptionPaused') { 'verschluesselt-gerade' } elseif ($vs -match 'Decryption') { 'entschluesselt-gerade' } elseif ($ps2 -eq 'Off') { 'angehalten' } elseif ($ps2 -eq 'On') { 'an' } else { 'unbekannt' })
} else {
  try { $blRoh = [int]((New-Object -ComObject Shell.Application).NameSpace('C:').Self.ExtendedProperty('System.Volume.BitLockerProtection')) } catch {}
  if ($blRoh -eq 1) { $blStatus = 'an' } elseif ($blRoh -eq 2) { $blStatus = 'aus' }
}
Fakt 'bitlocker' $blStatus; Fakt 'bitlockerProzent' $blProz; Fakt 'bitlockerTpm' $blTpm
$blTxt = @{ 'an' = 'verschlüsselt und geschützt'; 'aus' = 'NICHT verschlüsselt'; 'angehalten' = 'verschlüsselt, Schutz ANGEHALTEN'; 'verschluesselt-gerade' = 'Verschlüsselung läuft'; 'entschluesselt-gerade' = 'Entschlüsselung läuft'; 'unbekannt' = 'nicht abfragbar (Adminrechte nötig)' }
Punkt 'BitLocker (C:)' $(if ($blStatus -eq 'an') { 'ok' } elseif ($blStatus -eq 'unbekannt') { 'info' } elseif ($blStatus -eq 'verschluesselt-gerade') { 'warn' } else { 'fehler' }) ($blTxt[$blStatus] + $(if ($null -ne $blProz -and $blStatus -ne 'an' -and $blStatus -ne 'aus') { ' (' + $blProz + ' %)' } else { '' }) + $(if ($blTpm -eq $false -and $blStatus -ne 'aus') { ', ohne TPM-Schutzvorrichtung' } else { '' }))
# TPM und Secure Boot
$tpmDa = $null; $tpmBereit = $null
$tp = $null; try { $tp = Get-Tpm -EA Stop 2>$null } catch {}
if ($tp -and $null -ne $tp.TpmPresent) { $tpmDa = [bool]$tp.TpmPresent; $tpmBereit = [bool]$tp.TpmReady }
$tpmGer = @(Get-PnpDevice -Class SecurityDevices -EA SilentlyContinue | Where-Object { $_.FriendlyName -match '(?i)TPM|Trusted Platform' })
if ($null -eq $tpmDa) { $tpmDa = [bool]$tpmGer.Count }
$tpmFehler = @($tpmGer | Where-Object { $_.Status -eq 'Error' }).Count
Fakt 'tpmVorhanden' $tpmDa; Fakt 'tpmBereit' $tpmBereit; Fakt 'tpmGeraetFehler' $tpmFehler
Punkt 'TPM (Sicherheitschip)' $(if (-not $tpmDa -or $tpmFehler -or $tpmBereit -eq $false) { 'fehler' } elseif ($tpmBereit) { 'ok' } else { 'info' }) $(if (-not $tpmDa) { 'nicht gefunden' } elseif ($tpmFehler) { 'Gerät meldet Fehler' } elseif ($tpmBereit -eq $false) { 'vorhanden, aber NICHT bereit' } elseif ($tpmBereit) { 'bereit' } else { 'vorhanden (Bereitschaft nur mit Adminrechten prüfbar)' })
$sb = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State' -Name UEFISecureBootEnabled -EA SilentlyContinue).UEFISecureBootEnabled
Fakt 'secureBoot' $(if ($null -eq $sb) { $null } else { [bool]($sb -eq 1) })
$sb1801 = AnzSec @{ LogName = 'System'; Id = 1801; StartTime = (Get-Date).AddDays(-30) } 20
Fakt 'secureBootZertWarnung30' $sb1801
Punkt 'Secure Boot' $(if ($sb -eq 1 -and -not $sb1801) { 'ok' } elseif ($sb -eq 1) { 'warn' } elseif ($null -eq $sb) { 'info' } else { 'fehler' }) $(if ($sb -eq 1) { 'an' + $(if ($sb1801) { ' – Zertifikate müssen erneuert werden (Ereignis 1801)' } else { '' }) } elseif ($null -eq $sb) { 'nicht feststellbar (älteres BIOS?)' } else { 'AUS' })
# Computerzertifikate (Netz-/WLAN-Anmeldung)
$jetzt = Get-Date
$cz = @(Get-ChildItem -Path 'Cert:\LocalMachine\My' -EA SilentlyContinue | Where-Object { @($_.EnhancedKeyUsageList | Where-Object { $_.ObjectId -eq '1.3.6.1.5.5.7.3.2' }).Count })
$czg = @($cz | Where-Object { $_.NotAfter -gt $jetzt -and $_.NotBefore -lt $jetzt })
$cza = @($cz | Where-Object { $_.NotAfter -le $jetzt })
$czRest = $null; if ($czg.Count) { $czRest = [math]::Round((($czg | Sort-Object NotAfter -Descending | Select-Object -First 1).NotAfter - $jetzt).TotalDays, 0) }
Fakt 'computerZert' $cz.Count; Fakt 'computerZertGueltig' $czg.Count; Fakt 'computerZertAbgelaufen' $cza.Count; Fakt 'computerZertRestTage' $czRest
Punkt 'Computerzertifikat (Netzanmeldung)' $(if (-not $cz.Count) { 'warn' } elseif (-not $czg.Count) { 'fehler' } elseif ($czRest -lt 14) { 'warn' } else { 'ok' }) $(if (-not $cz.Count) { 'keins vorhanden' } else { '' + $czg.Count + ' gültig, ' + $cza.Count + ' abgelaufen' + $(if ($null -ne $czRest) { ', noch ' + $czRest + ' Tage' } else { '' }) })
$zr = [bool](@(Get-ChildItem -Path 'Cert:\LocalMachine\Root' -EA SilentlyContinue | Where-Object { $_.Subject -match '(?i)Zscaler' }).Count)
Fakt 'zscalerRoot' $zr
Punkt 'Zscaler-Stammzertifikat' $(if ($zr) { 'ok' } else { 'info' }) $(if ($zr) { 'vorhanden' } else { 'nicht vorhanden' })
`,
  },
]

export const THEMEN_KONTO: DgOber[] = [
  {
    id: 'konto', titel: 'Anmeldung, Konto & Sicherheit', symbol: 'KeyRound',
    beschreibung: 'Anmeldung klappt nicht, Konto gesperrt, ständige Kennwortabfragen, MFA, PIN, BitLocker, Zertifikate, Virenschutz',
    unter: [
      {
        id: 'ko-berechtigung', titel: 'Kollegen können etwas, was ich nicht kann – fehlt eine Berechtigung?',
        beschreibung: 'Programm, Ordner, Postfach, Lizenz oder Homeoffice-Zugang geht beim Benutzer nicht, bei den Kollegen schon; neue Mitarbeiter: wurden alle Berechtigungen bestellt?',
        sonden: ['rechte', 'zpa'],
        regeln: [
          RECHTE_ALLE_REGEL,
          { id: 'zpa-basis', wenn: f => nein(f['zpa.basis']) && ausserhalbFirmennetz(f), befund: () => 'PC ist nicht im Firmennetz und die Grundrolle für den Fernzugriff („Remote Access“, Azure_AD_SSO_Akamai_EAA_Client) fehlt', problem: 'vpn-fernzugriff-beantragen', schwere: 3 },
          { id: 'zpa-fileserver', wenn: f => nein(f['zpa.fileserver']) && ausserhalbFirmennetz(f), befund: () => 'PC ist nicht im Firmennetz und die Homeoffice-Rolle „Marine Fileservers“ fehlt', problem: 'laufwerk-homeoffice-berechtigung-fehlt', schwere: 2 },
          { id: 'kein-vergleich', wenn: f => ja(f['rechte.gelesen']) && num(f['rechte.kollegen']) < 2, befund: () => 'Kein Vergleich möglich: Im AD sind keine Kollegen mit gleicher Abteilung bzw. gleichem Vorgesetzten gepflegt', problem: 'berechtigung-fehlt-kollegen-vergleich', schwere: 1 },
        ],
        ohneBefund: ['berechtigung-fehlt-kollegen-vergleich', 'laufwerk-abteilungsordner-keine-berechtigung', 'vpn-fernzugriff-beantragen'],
      },
      {
        id: 'ko-anmeldung', titel: 'Windows-Anmeldung klappt nicht / Konto gesperrt / Kennwort abgelaufen',
        beschreibung: '„Kennwort falsch“, obwohl es stimmt, „Konto gesperrt“, „Kennwort abgelaufen“, „Vertrauensstellung gestört“, „Kein Anmeldeserver“',
        sonden: ['ko', 'koanm', 'net'],
        regeln: [
          { id: 'gesperrt', wenn: f => ja(f['koanm.gesperrt']) || num(f['ko.gesperrt7']) > 0, befund: f => ja(f['koanm.gesperrt']) ? 'Das AD-Konto ist gesperrt (zu viele falsche Kennwörter)' : `Anmeldung ${f['ko.gesperrt7']}× mit „Konto gesperrt“ abgewiesen (7 Tage)`, problem: 'konto-gesperrt', schwere: 3 },
          { id: 'abgelaufen', wenn: f => ja(f['koanm.kennwortAbgelaufen']) || hat(f, 'ko.statusCodes', '0xc0000071', '0xc0000224'), befund: () => 'Das Kennwort ist abgelaufen bzw. muss geändert werden', problem: 'konto-kennwort-abgelaufen', schwere: 3 },
          { id: 'deaktiviert', wenn: f => ja(f['koanm.deaktiviert']) || hat(f, 'ko.statusCodes', '0xc0000072'), befund: () => 'Das Benutzerkonto ist deaktiviert', problem: 'konto-deaktiviert', schwere: 3 },
          { id: 'zeit', wenn: f => num(f['ko.zeitAbweichungSek']) >= 300 || hat(f, 'ko.statusCodes', '0xc0000133'), befund: f => num(f['ko.zeitAbweichungSek']) >= 300 ? `Die Uhr des PCs weicht ${zahl(f['ko.zeitAbweichungSek'])} s ab (Kerberos erlaubt 5 Minuten)` : 'Anmeldungen scheiterten wegen Zeitabweichung', problem: 'konto-zeitabweichung-kerberos', schwere: 3 },
          { id: 'vertrauen', wenn: f => (nein(f['ko.sichererKanal']) && ja(f['ko.dcErreichbar'])) || num(f['ko.netlogonVertrauen7']) > 0, befund: f => nein(f['ko.sichererKanal']) ? 'Die Vertrauensstellung zur Domäne ist gestört (sicherer Kanal antwortet nicht)' : `Der DC hat das Computerkonto ${f['ko.netlogonVertrauen7']}× abgelehnt (Netlogon 3210)`, problem: 'konto-vertrauensstellung', schwere: 3 },
          { id: 'falsch', wenn: f => num(f['ko.falschesKennwort7']) >= 3 || num(f['koanm.falscheKennwoerter']) >= 3, befund: f => num(f['ko.falschesKennwort7']) >= 3 ? `${f['ko.falschesKennwort7']} Anmeldeversuche mit falschem Kennwort in 7 Tagen (oft alte gespeicherte Kennwörter)` : `Der DC zählt ${f['koanm.falscheKennwoerter']} falsche Kennworteingaben`, problem: 'konto-kennwort-falsch-obwohl-richtig', schwere: 2 },
          { id: 'kein-dc', wenn: f => ja(f['ko.domaenenMitglied']) && (nein(f['net.domaeneErreichbar']) || num(f['ko.netlogonKeinDc7']) >= 3), befund: f => nein(f['net.domaeneErreichbar']) ? 'Die Domäne ist vom PC aus nicht erreichbar – Anmeldung nur mit zwischengespeicherten Daten' : `${f['ko.netlogonKeinDc7']}× „kein Anmeldeserver verfügbar“ in 7 Tagen`, problem: 'konto-kein-anmeldeserver', schwere: 2 },
          { id: 'anmeldezeiten', wenn: f => hat(f, 'ko.statusCodes', '0xc000006f'), befund: () => 'Anmeldung außerhalb der erlaubten Anmeldezeiten abgewiesen', problem: 'konto-anmeldezeiten-eingeschraenkt', schwere: 3 },
          { id: 'nicht-erlaubt', wenn: f => hat(f, 'ko.statusCodes', '0xc0000070', '0xc000015b'), befund: f => hat(f, 'ko.statusCodes', '0xc0000070') ? 'Das Konto darf sich an diesem PC nicht anmelden (Arbeitsstationen eingeschränkt)' : 'Diese Anmeldeart ist für das Konto an diesem PC nicht erlaubt', problem: 'konto-anmeldemethode-nicht-zulaessig', schwere: 3 },
        ],
        ohneBefund: ['konto-gesperrt', 'konto-kennwort-falsch-obwohl-richtig', 'konto-kennwort-abgelaufen', 'konto-anmeldung-nur-an-einem-pc-scheitert'],
      },
      {
        id: 'ko-kennwortabfragen', titel: 'Ständige Kennwortabfragen (Office, Laufwerke, Intranet)',
        beschreibung: 'Office, Teams, Netzlaufwerke oder interne Seiten fragen immer wieder nach Benutzername und Kennwort',
        sonden: ['aad', 'koanm', 'ko', 'koaad'],
        regeln: [
          { id: 'kein-prt', wenn: f => nein(f['aad.prt']), befund: () => 'Das Microsoft-Anmeldetoken (PRT) fehlt – Office/Teams können sich nicht automatisch anmelden', problem: 'konto-m365-anmeldeaufforderung', schwere: 3 },
          { id: 'kein-tgt', wenn: f => ja(f['aad.domainJoined']) && nein(f['aad.kerberosTgt']), befund: () => 'Kein Kerberos-Anmeldeticket – Laufwerke und Intranet fragen deshalb nach dem Kennwort', problem: 'konto-sso-geht-nicht', schwere: 3 },
          { id: 'zeit', wenn: f => num(f['ko.zeitAbweichungSek']) >= 300, befund: f => `Die Uhr weicht ${zahl(f['ko.zeitAbweichungSek'])} s ab – Anmeldetickets werden abgelehnt`, problem: 'konto-zeitabweichung-kerberos', schwere: 3 },
          { id: 'pw-neu-pin', wenn: f => num(f['koanm.kennwortGeaendertVorTagen']) <= 3 && ja(f['aad.hello']), befund: f => `Kennwort vor ${zahl(f['koanm.kennwortGeaendertVorTagen'])} Tagen geändert, Anmeldung per PIN – Windows kennt das neue Kennwort noch nicht`, problem: 'konto-pin-anmeldung-alte-anmeldedaten', schwere: 2 },
          { id: 'pw-neu', wenn: f => num(f['koanm.kennwortGeaendertVorTagen']) <= 3, befund: f => `Kennwort vor ${zahl(f['koanm.kennwortGeaendertVorTagen'])} Tagen geändert – gespeicherte Anmeldungen sind veraltet`, problem: 'mfa-nach-kennwortaenderung-ueberall-neu', schwere: 2 },
          { id: 'gespeichert', wenn: f => num(f['koanm.windowsEintraege']) >= 1, befund: f => `${f['koanm.windowsEintraege']} gespeicherte Windows-Anmeldung(en) für Server – nach Kennwortänderung oft veraltet`, problem: 'konto-netzwerkanmeldeinformationen', schwere: 1 },
          { id: 'widerrufen', wenn: f => hat(f, 'koaad.aadsts', '50173', '50133', '700082', '70043', '70044'), befund: f => `Microsoft-Anmeldung abgelaufen bzw. widerrufen (AADSTS${liste(f['koaad.aadsts']).filter(x => ['50173', '50133', '700082', '70043', '70044'].includes(x)).join('/')})`, problem: 'konto-aadsts50173-sitzung-widerrufen', schwere: 2 },
          { id: 'proxy', wenn: f => hat(f, 'koaad.fehlerCodes', '0xcaa70004', '0xcaa70007', '0xcaa82ee2'), befund: () => 'Anmeldeserver bzw. Proxy nicht gefunden (Token-Fehler CAA70004/CAA70007)', problem: 'office-anmeldung-fehlercode', schwere: 2 },
        ],
        ohneBefund: ['konto-sso-geht-nicht', 'konto-m365-anmeldeaufforderung', 'konto-netzwerkanmeldeinformationen', 'office-anmeldung-wiederholt'],
      },
      {
        id: 'ko-mfa', titel: 'MFA / Authenticator und Microsoft-Anmeldefehler',
        beschreibung: 'Authenticator-Anfrage kommt nicht, Code wird abgelehnt, AADSTS-Fehlermeldung, „Ihr Gerät erfüllt die Anforderungen nicht“',
        sonden: ['koaad', 'aad', 'net'],
        regeln: [
          { id: 'mfa-pflicht', wenn: f => hat(f, 'koaad.aadsts', '50076', '50079'), befund: () => 'Microsoft verlangt MFA, die Anmeldung kann sie nicht durchführen (AADSTS50076)', problem: 'mfa-aadsts50076', schwere: 3 },
          { id: 'mfa-abbruch', wenn: f => hat(f, 'koaad.aadsts', '500121', '50074'), befund: () => 'Die MFA-Bestätigung ist gescheitert oder abgebrochen (AADSTS500121)', problem: 'mfa-aadsts500121', schwere: 3 },
          { id: 'ca-block', wenn: f => hat(f, 'koaad.aadsts', '53003'), befund: () => 'Bedingter Zugriff blockiert die Anmeldung (AADSTS53003)', problem: 'mfa-aadsts53003-blockiert', schwere: 3 },
          { id: 'nicht-konform', wenn: f => hat(f, 'koaad.aadsts', '53000', '53001'), befund: () => 'Der PC gilt als nicht konform bzw. nicht verwaltet (AADSTS53000)', problem: 'mfa-pc-nicht-konform-aadsts53000', schwere: 3 },
          { id: 'cloud-gesperrt', wenn: f => hat(f, 'koaad.aadsts', '50053'), befund: () => 'Microsoft hat das Konto gesperrt (AADSTS50053)', problem: 'sicherheit-entra-konto-gesperrt-verdacht', schwere: 3 },
          { id: 'geraet-weg', wenn: f => hat(f, 'koaad.aadsts', '700003', '135011'), befund: () => 'Das Geräteobjekt in Entra ID fehlt oder ist deaktiviert (AADSTS700003/135011)', problem: 'konto-aadsts700003-geraet-geloescht', schwere: 3 },
          { id: 'kein-prt', wenn: f => nein(f['aad.prt']), befund: () => 'Kein Anmeldetoken (PRT) – jede App verlangt eine neue Anmeldung mit MFA', problem: 'mfa-staendige-abfrage-am-pc', schwere: 2 },
          { id: 'kein-internet', wenn: f => nein(f['net.internet443']), befund: () => 'login.microsoftonline.com ist nicht erreichbar', problem: 'netz-kein-internet-verbunden', schwere: 3 },
        ],
        ohneBefund: ['konto-mfa-authenticator', 'mfa-code-falsch', 'mfa-zahl-wird-nicht-angezeigt', 'mfa-staendige-abfrage-am-pc'],
      },
      {
        id: 'ko-hello', titel: 'Windows Hello: PIN, Gesichtserkennung, Fingerabdruck',
        beschreibung: 'PIN wird nicht angenommen, „Etwas ist schiefgelaufen“, Gesicht oder Finger werden nicht erkannt, PIN lässt sich nicht einrichten',
        sonden: ['aad', 'ko', 'sec'],
        regeln: [
          { id: 'bio-richtlinie', wenn: f => ja(f['ko.biometrieRichtlinieAus']), befund: () => 'Gesichtserkennung/Fingerabdruck sind per Richtlinie abgeschaltet', problem: 'konto-hello-biometrie-ausgegraut-richtlinie', schwere: 3 },
          { id: 'bio-dienst', wenn: f => num(f['ko.biometrieGeraete']) > 0 && txt(f['ko.biometrieDienstStart']) === 'Disabled', befund: () => 'Der Windows-Biometriedienst ist deaktiviert', problem: 'konto-gesichtserkennung', schwere: 3 },
          { id: 'bio-geraet', wenn: f => num(f['ko.biometrieFehler']) > 0, befund: f => `${f['ko.biometrieFehler']} Hello-Kamera/Fingerabdruckleser mit Gerätefehler`, problem: 'kamera-windows-hello-gesicht', schwere: 2 },
          { id: 'tpm', wenn: f => nein(f['sec.tpmBereit']) || num(f['sec.tpmGeraetFehler']) > 0, befund: () => 'Der TPM-Sicherheitschip ist nicht bereit bzw. meldet einen Fehler – die PIN hängt am TPM', problem: 'konto-tpm-fehlfunktion-80090030', schwere: 3 },
          { id: 'hello-aus', wenn: f => ja(f['ko.helloRichtlinieAus']), befund: () => 'Windows Hello for Business ist per Richtlinie abgeschaltet', problem: 'konto-hello-einrichtung-scheitert', schwere: 2 },
          { id: 'hello-fehler', wenn: f => num(f['ko.helloFehler7']) >= 3, befund: f => `${f['ko.helloFehler7']} Fehler im Windows-Hello-Protokoll (7 Tage)`, problem: 'konto-pin-funktioniert-nicht', schwere: 2 },
          { id: 'nicht-eingerichtet', wenn: f => nein(f['aad.hello']), befund: () => 'Für diesen Benutzer ist keine Windows-Hello-PIN eingerichtet', problem: 'konto-hello-einrichtung-scheitert', schwere: 1 },
          { id: 'kein-prt', wenn: f => ja(f['aad.hello']) && nein(f['aad.prt']), befund: () => 'PIN ist eingerichtet, aber das Anmeldetoken (PRT) fehlt', problem: 'konto-anmeldeinformationen-nicht-ueberprueft', schwere: 1 },
        ],
        ohneBefund: ['konto-pin-funktioniert-nicht', 'konto-pin-vergessen', 'konto-gesichtserkennung', 'konto-hello-pin-zu-oft-falsch'],
      },
      {
        id: 'ko-bitlocker', titel: 'BitLocker fragt nach dem Wiederherstellungsschlüssel',
        beschreibung: 'Blauer Bildschirm „BitLocker-Wiederherstellung“ beim Start, Verschlüsselung angehalten oder nicht aktiv',
        sonden: ['sec'],
        regeln: [
          { id: 'tpm', wenn: f => nein(f['sec.tpmVorhanden']) || nein(f['sec.tpmBereit']) || num(f['sec.tpmGeraetFehler']) > 0, befund: () => 'TPM-Sicherheitschip fehlt, ist nicht bereit oder meldet einen Fehler – BitLocker fragt deshalb nach dem Schlüssel', problem: 'sicherheit-tpm-fehler', schwere: 3 },
          { id: 'ohne-tpm', wenn: f => nein(f['sec.bitlockerTpm']) && txt(f['sec.bitlocker']) !== 'aus', befund: () => 'BitLocker hat keine TPM-Schutzvorrichtung – ohne sie wird bei jedem Start der Schlüssel verlangt', problem: 'sicherheit-bitlocker-schluessel-jeder-start', schwere: 3 },
          { id: 'angehalten', wenn: f => txt(f['sec.bitlocker']) === 'angehalten', befund: () => 'BitLocker-Schutz ist angehalten (z. B. nach BIOS-Update nicht fortgesetzt)', problem: 'sicherheit-bitlocker-pausiert', schwere: 3 },
          { id: 'aus', wenn: f => txt(f['sec.bitlocker']) === 'aus', befund: () => 'Laufwerk C: ist nicht mit BitLocker verschlüsselt', problem: 'sicherheit-bitlocker-nicht-verschluesselt', schwere: 3 },
          { id: 'laeuft', wenn: f => txt(f['sec.bitlocker']) === 'verschluesselt-gerade', befund: f => `Verschlüsselung läuft noch (${zahl(f['sec.bitlockerProzent'])} %)`, problem: 'sicherheit-bitlocker-verschluesselung-haengt', schwere: 1 },
          { id: 'secure-boot', wenn: f => nein(f['sec.secureBoot']), befund: () => 'Secure Boot ist ausgeschaltet – BitLocker erkennt die Änderung beim Start', problem: 'sicherheit-secure-boot-deaktiviert', schwere: 2 },
          { id: 'sb-zert', wenn: f => num(f['sec.secureBootZertWarnung30']) > 0, befund: f => `${f['sec.secureBootZertWarnung30']}× Hinweis: Secure-Boot-Zertifikate müssen erneuert werden (Ereignis 1801)`, problem: 'sicherheit-secure-boot-zertifikate', schwere: 1 },
        ],
        ohneBefund: ['sicherheit-bitlocker-wiederherstellungsschluessel', 'sicherheit-bitlocker-schluessel-jeder-start', 'sicherheit-bitlocker-pin-vergessen'],
      },
      {
        id: 'ko-zertifikate', titel: 'Zertifikat abgelaufen oder fehlt (WLAN, LAN, VPN, Signatur)',
        beschreibung: 'Firmen-WLAN oder LAN-Anmeldung scheitert, „Zertifikat abgelaufen“, Signieren geht nicht, Zertifikatswarnungen',
        sonden: ['sec', 'koanm', 'ko', 'net'],
        regeln: [
          { id: 'computer-abgelaufen', wenn: f => num(f['sec.computerZert']) > 0 && num(f['sec.computerZertGueltig']) === 0, befund: f => `Alle ${f['sec.computerZert']} Computerzertifikate sind abgelaufen`, problem: 'sicherheit-zertifikat-abgelaufen', schwere: 3 },
          { id: 'computer-fehlt', wenn: f => num(f['sec.computerZert']) === 0 && ja(f['ko.domaenenMitglied']), befund: () => 'Der PC hat kein Computerzertifikat für die Netzanmeldung', problem: 'wlan-zertifikat-abgelaufen', schwere: 2 },
          { id: 'computer-bald', wenn: f => num(f['sec.computerZertRestTage']) < 14, befund: f => `Das Computerzertifikat läuft in ${f['sec.computerZertRestTage']} Tagen ab`, problem: 'sicherheit-zertifikat-abgelaufen', schwere: 1 },
          { id: 'uhrzeit', wenn: f => num(f['ko.zeitAbweichungSek']) >= 300, befund: f => `Die Uhr weicht ${zahl(f['ko.zeitAbweichungSek'])} s ab – Zertifikate gelten dann als ungültig`, problem: 'netz-zertifikatfehler-uhrzeit', schwere: 3 },
          { id: 'zscaler-root', wenn: f => ja(f['net.zscalerInstalliert']) && nein(f['sec.zscalerRoot']), befund: () => 'Zscaler ist installiert, aber sein Stammzertifikat fehlt', problem: 'sicherheit-zertifikatswarnung-browser', schwere: 2 },
          { id: 'benutzer-abgelaufen', wenn: f => num(f['koanm.benutzerZert']) > 0 && num(f['koanm.benutzerZertGueltig']) === 0, befund: f => `Alle ${f['koanm.benutzerZert']} persönlichen Zertifikate sind abgelaufen`, problem: 'konto-smartcard-zertifikat-fehlt-programme', schwere: 2 },
        ],
        ohneBefund: ['sicherheit-zertifikat-abgelaufen', 'wlan-zertifikat-abgelaufen', 'sicherheit-zertifikatswarnung-browser', 'web-zertifikat-auswaehlen'],
      },
      {
        id: 'ko-virenschutz', titel: 'Virenschutz meldet etwas oder blockiert eine Datei/ein Programm',
        beschreibung: '„Bedrohung gefunden“, Datei verschwunden, „Nicht autorisierte Änderungen blockiert“, Programm oder Webseite gesperrt, Virenschutz aus',
        sonden: ['sec'],
        regeln: [
          { id: 'fund', wenn: f => num(f['sec.funde7']) > 0, befund: f => `Defender hat in 7 Tagen ${f['sec.funde7']}× etwas gefunden: ${txt(f['sec.fundNamen'])}`, problem: 'sicherheit-defender-fund', schwere: 3 },
          { id: 'wiederholt', wenn: f => num(f['sec.gleicherFund30']) >= 3, befund: f => `Dieselbe Bedrohung wurde in 30 Tagen ${f['sec.gleicherFund30']}× erkannt`, problem: 'sicherheit-defender-findet-immer-wieder', schwere: 2 },
          { id: 'echtzeit-aus', wenn: f => nein(f['sec.echtzeitschutz']), befund: f => 'Echtzeitschutz ist aus' + (liste(f['sec.fremdVirenscanner']).length ? ` (anderer Virenscanner: ${txt(f['sec.fremdVirenscanner'])})` : ''), problem: 'sicherheit-echtzeitschutz-aus', schwere: 3 },
          { id: 'signaturen', wenn: f => num(f['sec.signaturAlterTage']) >= 3, befund: f => `Virensignaturen sind ${f['sec.signaturAlterTage']} Tage alt`, problem: 'sicherheit-signaturen-veraltet', schwere: 2 },
          { id: 'ordnerzugriff', wenn: f => num(f['sec.ordnerzugriffBlock7']) > 0, befund: f => `Überwachter Ordnerzugriff hat ${f['sec.ordnerzugriffBlock7']}× Speichern blockiert`, problem: 'sicherheit-ordnerzugriff-blockiert', schwere: 3 },
          { id: 'asr', wenn: f => num(f['sec.asrBlock7']) > 0, befund: f => `Angriffsflächen-Regeln haben ${f['sec.asrBlock7']}× etwas blockiert`, problem: 'sicherheit-asr-programm-blockiert', schwere: 2 },
          { id: 'netzschutz', wenn: f => num(f['sec.netzschutzBlock7']) > 0, befund: f => `Netzwerkschutz hat ${f['sec.netzschutzBlock7']}× eine Verbindung blockiert`, problem: 'sicherheit-netzwerkschutz-seite-blockiert', schwere: 2 },
          { id: 'firewall', wenn: f => liste(f['sec.firewallAus']).length > 0, befund: f => `Firewall ist aus für: ${txt(f['sec.firewallAus'])}`, problem: 'sicherheit-firewall-aus', schwere: 2 },
        ],
        ohneBefund: ['sicherheit-defender-fehlalarm', 'sicherheit-smartscreen-blockiert', 'sicherheit-defender-fund'],
      },
    ],
  },
]
