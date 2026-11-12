// ── Diagnose-Thema „Netzlaufwerke & Dateien“ ─────────────────────────────────
// lw    = gespeicherte Laufwerke des Benutzers (HKU\<SID>\Network – NIE Win32_MappedLogicalDisk über WinRM,
//         die ist dort immer leer), Server-Erreichbarkeit (TCP 445), GPO-Laufwerke, Ordnerumleitung, Zonen
// lwsys = Arbeitsstationsdienst, Netzwerkanbieter, SMB-Einstellungen, Offlinedateien, w3172 (SKF Marine)
// lwses = was in der SITZUNG des Benutzers wirklich verbunden ist (Status, freier Platz, gespeicherte
//         Anmeldedaten, versteckte Office-Prozesse, Explorer reagiert?)
// Alles NUR LESEND – auf den Servern wird nichts geändert, nur die Erreichbarkeit geprüft.
import { ja, liste, nein, num, txt, zahl } from '../motor'
import type { DgFakten, DgOber, DgRegel, DgSonde } from '../types'
import { AD_HELFER } from './gemeinsam'

/** PC hängt nicht im Firmennetz (SKF-Netze 10.x) oder ist gar nicht erreichbar → Homeoffice/unterwegs.
 *  Unbekannte IP bei erreichbarem PC ⇒ false. */
export const ausserhalbFirmennetz = (f: DgFakten): boolean => {
  if (f['pc.erreichbar'] === false) return true
  const ip = txt(f['net.ip']).split(/[,\s]+/)[0]
  return /^\d+\.\d+\.\d+\.\d+$/.test(ip) && !ip.startsWith('10.')
}

// ── Ordnerrechte (Sonde lwr) – in mehreren Unterthemen gleich ──
const ersteFehlen = (f: DgFakten, n = 2) => liste(f['lwr.fehlen']).slice(0, n).join(' · ')
const RECHTE_REGELN: DgRegel[] = [
  { id: 'rechte-keine', wenn: f => num(f['lwr.gruppenGesamt']) > 0 && num(f['lwr.freigaben']) === 0, befund: () => 'Der Benutzer hat auf W3172 keine einzige Ordnerberechtigung (keine Freigabegruppe im AD)', problem: 'laufwerk-rechte-antrag-vorbereiten', schwere: 3 },
  { id: 'rechte-kollegen-stark', wenn: f => num(f['lwr.fehlenStark']) > 0, befund: f => `Berechtigung fehlt, die die Kollegen haben: ${ersteFehlen(f)}`, problem: 'laufwerk-rechte-antrag-vorbereiten', schwere: 3 },
  { id: 'rechte-kollegen', wenn: f => num(f['lwr.fehlenAnzahl']) > num(f['lwr.nurAndereGruppe']), befund: f => `Im Vergleich mit den Kollegen fehlen Ordnerrechte: ${ersteFehlen(f)}`, problem: 'laufwerk-rechte-antrag-vorbereiten', schwere: 2 },
  { id: 'rechte-nur-andere', wenn: f => num(f['lwr.nurAndereGruppe']) > 0, befund: f => `Für einen Ordner hat der Benutzer eine andere (meist Lese-)Gruppe als die Kollegen: ${liste(f['lwr.nurAndereListe']).slice(0, 1).join('')}`, problem: 'laufwerk-nur-leserechte', schwere: 2 },
]

export const SONDEN_LAUFWERKE: DgSonde[] = [
  {
    id: 'lw', titel: 'Netzlaufwerke des Benutzers (Zuordnungen, Server, Anmeldeskript)', modus: 'profil', timeoutMs: 90000,
    ps: String.raw`
NeedHive
function TcpLw([string]$h, [int]$port) { try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($h, $port).Wait(3000) -and $t.Connected; $t.Close(); return [bool]$ok } catch { return $false } }
$lwListe = @()
foreach ($k in @(Get-ChildItem -LiteralPath ($uHive + '\Network') -EA SilentlyContinue)) {
  $e = Get-ItemProperty -LiteralPath $k.PSPath -EA SilentlyContinue
  $lwListe += [pscustomobject]@{ B = ([string]$k.PSChildName).ToUpper() + ':'; Pfad = [string]$e.RemotePath; Konto = [string]$e.UserName }
}
Fakt 'anzahl' $lwListe.Count
Fakt 'laufwerke' @($lwListe | ForEach-Object { $_.B + ' ' + $_.Pfad })
Punkt 'Gespeicherte Netzlaufwerke' $(if ($lwListe.Count) { 'ok' } else { 'info' }) $(if ($lwListe.Count) { (@($lwListe | ForEach-Object { $_.B + ' = ' + $_.Pfad }) -join ', ') } else { 'keine dauerhaft gespeicherten Laufwerke (evtl. nur per Anmeldeskript/Richtlinie)' })
$iEintrag = @($lwListe | Where-Object { $_.B -eq 'I:' })
$marine = @($lwListe | Where-Object { $_.Pfad -match '(?i)^\\\\w3172(\.[^\\]+)?\\skf marine' })
Fakt 'iVorhanden' ($iEintrag.Count -gt 0)
Fakt 'iZiel' $(if ($iEintrag.Count) { $iEintrag[0].Pfad } else { $null })
Fakt 'marineBuchstabe' $(if ($marine.Count) { $marine[0].B } else { $null })
$iFalsch = ($marine.Count -gt 0) -and (@($marine | Where-Object { $_.B -eq 'I:' }).Count -eq 0)
Fakt 'iFalscherBuchstabe' $iFalsch
Punkt 'Laufwerk I: (SKF Marine)' $(if ($iFalsch) { 'warn' } elseif ($iEintrag.Count) { 'ok' } else { 'info' }) $(if ($iFalsch) { 'SKF Marine liegt auf ' + $marine[0].B + ' statt I:' } elseif ($iEintrag.Count) { $iEintrag[0].Pfad } else { 'nicht dauerhaft gespeichert' })
$perIp = @($lwListe | Where-Object { $_.Pfad -match '^\\\\\d{1,3}(\.\d{1,3}){3}\\' } | ForEach-Object { $_.B + ' ' + $_.Pfad })
Fakt 'perIp' $perIp
if ($perIp.Count) { Punkt 'Per IP-Adresse verbunden' 'warn' ($perIp -join ', ') }
$fremd = @($lwListe | Where-Object { $_.Konto -and $uName -and ($_.Konto -notmatch ('(?i)(^|\\)' + [regex]::Escape($uName) + '($|@)')) } | ForEach-Object { $_.B + ' als ' + $_.Konto })
Fakt 'fremdesKonto' $fremd
Punkt 'Verbunden mit eigenem Konto' $(if ($fremd.Count) { 'warn' } else { 'ok' }) $(if ($fremd.Count) { 'anderes Konto: ' + ($fremd -join ', ') } else { 'ja' })
$doppelt = @($lwListe | Where-Object { $_.Pfad } | Group-Object { $_.Pfad.ToLower().TrimEnd('\') } | Where-Object { $_.Count -gt 1 } | ForEach-Object { (@($_.Group | ForEach-Object { $_.B }) -join '+') + ' ' + $_.Group[0].Pfad })
Fakt 'doppelt' $doppelt
if ($doppelt.Count) { Punkt 'Gleiche Freigabe mehrfach' 'warn' ($doppelt -join ', ') }
$lokal = @(Get-CimInstance Win32_LogicalDisk -EA SilentlyContinue | Where-Object { $_.DriveType -ne 4 } | ForEach-Object { ([string]$_.DeviceID).ToUpper() })
$belegt = @($lwListe | Where-Object { $lokal -contains $_.B } | ForEach-Object { $_.B })
$gpo = @()
$gh = Join-Path $env:ProgramData 'Microsoft\Group Policy\History'
foreach ($d in @(Get-ChildItem -LiteralPath $gh -Directory -EA SilentlyContinue)) {
  $x = Join-Path $d.FullName ($uSid + '\Preferences\Drives\Drives.xml')
  if (Test-Path -LiteralPath $x) {
    try { $xml = [xml](Get-Content -LiteralPath $x -Raw -EA Stop); foreach ($dn in @($xml.SelectNodes('//Drive'))) { $pr = $dn.Properties; if ($pr) { $gpo += ([string]$pr.letter).ToUpper() + ': ' + [string]$pr.path } } } catch {}
  }
}
Fakt 'gpoLaufwerke' $gpo
foreach ($g in $gpo) { $bu = ($g -split ' ')[0]; if ($lokal -contains $bu -and $belegt -notcontains $bu) { $belegt += $bu } }
Fakt 'buchstabeBelegt' $belegt
if ($belegt.Count) { Punkt 'Buchstabe von lokalem Datenträger belegt' 'fehler' ($belegt -join ', ') }
Punkt 'Laufwerke per Richtlinie (GPO)' 'info' $(if ($gpo.Count) { '' + $gpo.Count + ': ' + ($gpo -join ', ') } else { 'keine gefunden' })
$gpoEv = @()
try { $gpoEv = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Group Policy Drive Maps'; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 50 -EA Stop) } catch {}
$gpoFehler = @($gpoEv | Where-Object { $_.Level -ge 1 -and $_.Level -le 3 }).Count
Fakt 'gpoFehler7' $gpoFehler
Punkt 'Fehler beim Verbinden per Richtlinie (7 Tage)' $(if ($gpoFehler) { 'warn' } else { 'ok' }) ('' + $gpoFehler + ' Meldung(en)')
$server = @()
foreach ($l in $lwListe) { if ($l.Pfad -match '^\\\\([^\\]+)\\') { $sv = $Matches[1].ToLower(); if ($server -notcontains $sv) { $server += $sv } } }
$usf = Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') -EA SilentlyContinue
$umleit = @()
foreach ($nm in @('Desktop', 'Personal')) { $wert = [string]$usf.$nm; if ($wert -match '^\\\\') { $umleit += $nm + ' = ' + $wert; if ($wert -match '^\\\\([^\\]+)\\') { $sv = $Matches[1].ToLower(); if ($server -notcontains $sv) { $server += $sv } } } }
Fakt 'ordnerUmgeleitet' $umleit
if ($umleit.Count) { Punkt 'Ordnerumleitung auf Server' 'info' ($umleit -join ', ') }
$weg = @()
foreach ($sv in @($server | Select-Object -First 5)) { if (-not (TcpLw $sv 445)) { $weg += $sv } }
Fakt 'server' $server; Fakt 'serverNichtErreichbar' $weg
Punkt 'Dateiserver erreichbar (TCP 445)' $(if ($weg.Count) { 'fehler' } elseif ($server.Count) { 'ok' } else { 'info' }) $(if ($weg.Count) { 'NICHT erreichbar: ' + ($weg -join ', ') } elseif ($server.Count) { ($server -join ', ') + ' erreichbar' } else { 'keine Server in den Zuordnungen' })
$umleitWeg = @($umleit | Where-Object { $w2 = $_; @($weg | Where-Object { $w2 -match ('(?i)\\\\' + [regex]::Escape($_) + '\\') }).Count -gt 0 })
Fakt 'umleitungNichtErreichbar' ($umleitWeg.Count -gt 0)
$zm = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CurrentVersion\Internet Settings\ZoneMapKey' -EA SilentlyContinue
$zonen = @()
if ($zm) { $zonen = @($zm.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' -and [string]$_.Value -match '^[12]$' } | ForEach-Object { ([string]$_.Name -replace '^[a-z]+://', '' -replace '^\*\.', '').ToLower() }) }
$internet = @()
foreach ($l in $lwListe) {
  if ($l.Pfad -match '^\\\\([^\\]+)\\') {
    $hn = $Matches[1].ToLower()
    if ($hn -match '\.') {
      $drin = @($zonen | Where-Object { $hn -eq $_ -or $hn.EndsWith('.' + $_) }).Count -gt 0
      if (-not $drin) { $internet += $l.B + ' ' + $hn }
    }
  }
}
Fakt 'pfadeOhneIntranetzone' $internet
if ($internet.Count) { Punkt 'Server nicht in der Intranetzone' 'warn' ('Dateien gelten als „aus dem Internet“: ' + ($internet -join ', ')) }
$adv = Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced') -EA SilentlyContinue
Fakt 'versteckteAusgeblendet' ($adv -and $adv.Hidden -ne 1)
Punkt 'Versteckte Dateien' 'info' $(if ($adv -and $adv.Hidden -eq 1) { 'werden angezeigt' } else { 'werden ausgeblendet (Standard)' })
`,
  },
  {
    id: 'lwsys', titel: 'Netzlaufwerk-Grundlagen des PCs (Dienste, SMB, Offlinedateien, Server w3172)', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
function TcpMsLw([string]$h, [int]$port) { $sw = [System.Diagnostics.Stopwatch]::StartNew(); $ok = $false; try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($h, $port).Wait(3000) -and $t.Connected; $t.Close() } catch {}; $sw.Stop(); if ($ok) { return [int]$sw.ElapsedMilliseconds } else { return -1 } }
$wks = Get-Service -Name LanmanWorkstation -EA SilentlyContinue
Fakt 'wksDienst' $(if ($wks) { [string]$wks.Status } else { $null }); Fakt 'wksStart' $(if ($wks) { [string]$wks.StartType } else { $null })
Punkt 'Arbeitsstationsdienst' $(if ($wks -and $wks.Status -eq 'Running') { 'ok' } else { 'fehler' }) $(if ($wks) { [string]$wks.Status + ' (' + [string]$wks.StartType + ')' } else { 'fehlt' })
$nl = Get-Service -Name Netlogon -EA SilentlyContinue
$imAd = [bool](Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue).PartOfDomain
Fakt 'domaenenPc' $imAd
Fakt 'netlogon' $(if ($nl) { [string]$nl.Status } else { $null })
if ($imAd) { Punkt 'Netzwerkanmeldedienst (Netlogon)' $(if ($nl -and $nl.Status -eq 'Running') { 'ok' } else { 'fehler' }) $(if ($nl) { [string]$nl.Status } else { 'fehlt' }) }
$ord = [string](Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\NetworkProvider\Order' -Name ProviderOrder -EA SilentlyContinue).ProviderOrder
Fakt 'anbieterOk' ($ord -match '(?i)LanmanWorkstation')
Punkt 'Netzwerkanbieter „Microsoft Windows Network“' $(if ($ord -match '(?i)LanmanWorkstation') { 'ok' } else { 'fehler' }) $(if ($ord) { $ord } else { 'Reihenfolge nicht lesbar' })
$smb2 = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\mrxsmb20' -Name Start -EA SilentlyContinue).Start
Fakt 'smb2Aus' ($smb2 -eq 4)
if ($smb2 -eq 4) { Punkt 'SMB2/3-Client' 'fehler' 'Treiber deaktiviert' }
Fakt 'smb1Client' ([bool](Test-Path 'HKLM:\SYSTEM\CurrentControlSet\Services\mrxsmb10'))
$par = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters' -EA SilentlyContinue
$polW = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\LanmanWorkstation' -EA SilentlyContinue
Fakt 'signierungPflicht' ($par.RequireSecuritySignature -eq 1)
Fakt 'gastErlaubt' ($par.AllowInsecureGuestAuth -eq 1 -or $polW.AllowInsecureGuestAuth -eq 1)
Punkt 'SMB-Einstellungen' 'info' ('Signierung Pflicht: ' + $(if ($par.RequireSecuritySignature -eq 1) { 'ja' } else { 'nein' }) + ', Gastzugriff: ' + $(if ($par.AllowInsecureGuestAuth -eq 1 -or $polW.AllowInsecureGuestAuth -eq 1) { 'erlaubt' } else { 'gesperrt (Standard)' }))
$lc = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name EnableLinkedConnections -EA SilentlyContinue).EnableLinkedConnections
Fakt 'linkedConnections' ($lc -eq 1)
Punkt 'Laufwerke auch für Programme „als Administrator“' $(if ($lc -eq 1) { 'ok' } else { 'info' }) $(if ($lc -eq 1) { 'aktiv (EnableLinkedConnections)' } else { 'nicht aktiv – als Admin gestartete Programme sehen keine Laufwerke' })
$csc = Get-Service -Name CscService -EA SilentlyContinue
$oc = Get-CimInstance Win32_OfflineFilesCache -EA SilentlyContinue | Select-Object -First 1
$offAn = [bool]($oc -and $oc.Enabled)
Fakt 'offlineAktiv' $offAn; Fakt 'offlineDienst' $(if ($csc) { [string]$csc.Status } else { $null })
Punkt 'Offlinedateien' $(if ($offAn) { 'info' } else { 'ok' }) $(if ($offAn) { 'eingeschaltet' + $(if ($oc.Active) { ' und aktiv' } else { '' }) } else { 'aus' })
$pv = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\PreviousVersions' -EA SilentlyContinue
$pvAus = ($pv.DisableRemotePage -eq 1)
Fakt 'vorgaengerRichtlinieAus' $pvAus
Punkt 'Reiter „Vorgängerversionen“ (Netzlaufwerke)' $(if ($pvAus) { 'warn' } else { 'ok' }) $(if ($pvAus) { 'per Richtlinie ausgeblendet' } else { 'verfügbar' })
$dnsOk = $false; try { $dnsOk = [bool](Resolve-DnsName 'w3172' -EA Stop | Select-Object -First 1) } catch {}
$ms = TcpMsLw 'w3172' 445
Fakt 'w3172Dns' $dnsOk; Fakt 'w3172Erreichbar' ($ms -ge 0); Fakt 'w3172Ms' $(if ($ms -ge 0) { $ms } else { $null })
Punkt 'Server w3172 (SKF Marine, I:)' $(if ($ms -ge 0 -and $ms -lt 150) { 'ok' } elseif ($ms -ge 0) { 'warn' } else { 'fehler' }) $(if ($ms -ge 0) { 'TCP 445 erreichbar in ' + $ms + ' ms' } elseif ($dnsOk) { 'Name aufgelöst, aber TCP 445 nicht erreichbar' } else { 'Name w3172 nicht auflösbar / nicht erreichbar' })
$smbErr = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-SMBClient/Connectivity'; Level = 2, 3; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue).Count
$gast = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-SMBClient/Security'; Id = 31017; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 50 -EA SilentlyContinue).Count
Fakt 'smbFehler7' $smbErr; Fakt 'gastAbgelehnt7' $gast
Punkt 'Verbindungsabbrüche zu Dateiservern (7 Tage)' $(if ($smbErr -ge 20) { 'warn' } else { 'ok' }) ('' + $smbErr + ' Meldung(en) im SMB-Protokoll')
if ($gast) { Punkt 'Gastzugriff abgelehnt (7 Tage)' 'warn' ('' + $gast + ' Mal – Freigabe ohne Kennwort wird blockiert') }
`,
  },
  {
    id: 'lwses', titel: 'Laufwerke in der Sitzung des Benutzers (Status, Platz, Anmeldedaten, Sperren)', modus: 'benutzer', timeoutMs: 90000,
    ps: String.raw`
$sitzung = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
$nc = @(Get-CimInstance Win32_NetworkConnection -OperationTimeoutSec 20 -EA SilentlyContinue | Where-Object { $_.LocalName })
$bst = @($nc | ForEach-Object { ([string]$_.LocalName).ToUpper() })
Fakt 'buchstaben' $bst
$nv = @($nc | Where-Object { [string]$_.ConnectionState -ne 'Connected' -or ([string]$_.Status -and [string]$_.Status -ne 'OK') } | ForEach-Object { ([string]$_.LocalName).ToUpper() + ' ' + [string]$_.RemoteName })
Fakt 'nichtVerfuegbar' $nv
Punkt 'Verbundene Laufwerke (Sitzung)' $(if (-not $nc.Count) { 'info' } elseif ($nv.Count) { 'fehler' } else { 'ok' }) $(if (-not $nc.Count) { 'keine' } elseif ($nv.Count) { 'nicht verfügbar (rotes X): ' + ($nv -join ', ') } else { (@($nc | ForEach-Object { [string]$_.LocalName + ' ' + [string]$_.RemoteName }) -join ', ') })
Fakt 'iVerbunden' ($bst -contains 'I:')
$voll = @()
foreach ($ld in @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=4' -OperationTimeoutSec 15 -EA SilentlyContinue)) {
  if ($ld.Size -gt 0) { $fg = [double]$ld.FreeSpace / 1GB; $pz = 100 * [double]$ld.FreeSpace / [double]$ld.Size; if ($fg -lt 1 -or $pz -lt 2) { $voll += [string]$ld.DeviceID + ' ' + [math]::Round($fg, 1) + ' GB frei' } }
}
Fakt 'vollLaufwerke' $voll
Punkt 'Freier Platz auf den Netzlaufwerken' $(if ($voll.Count) { 'fehler' } else { 'ok' }) $(if ($voll.Count) { $voll -join ', ' } else { 'ausreichend' })
$ck = @(& (Join-Path $env:SystemRoot 'System32\cmdkey.exe') /list 2>$null | ForEach-Object { [string]$_ })
$ziele = @($ck | Where-Object { $_ -match '(?i)Domain:target=([^\s]+)' } | ForEach-Object { if ($_ -match '(?i)Domain:target=([^\s]+)') { $Matches[1] } } | Where-Object { $_ -notmatch '(?i)^(MicrosoftOffice|WindowsLive|virtualapp|git:|LegacyGeneric|TERMSRV)' })
Fakt 'gespeicherteAnmeldungen' $ziele
Punkt 'Gespeicherte Windows-Anmeldedaten für Server' $(if ($ziele.Count) { 'warn' } else { 'ok' }) $(if ($ziele.Count) { $ziele -join ', ' } else { 'keine (Anmeldung automatisch per Kerberos)' })
$off = @(Get-Process -Name EXCEL, WINWORD, POWERPNT, MSACCESS -EA SilentlyContinue | Where-Object { $_.SessionId -eq $sitzung })
$verst = @($off | Where-Object { $_.MainWindowHandle -eq 0 } | ForEach-Object { $_.ProcessName })
Fakt 'officeVersteckt' $verst
Punkt 'Office-Programme ohne Fenster (halten Dateien gesperrt)' $(if ($verst.Count) { 'warn' } else { 'ok' }) $(if ($verst.Count) { ($verst -join ', ') + ' läuft unsichtbar im Hintergrund' } else { 'keine' })
$ex = @(Get-Process -Name explorer -EA SilentlyContinue | Where-Object { $_.SessionId -eq $sitzung })
$exH = @($ex | Where-Object { -not $_.Responding }).Count -gt 0
Fakt 'explorerHaengt' $exH
Punkt 'Explorer reagiert' $(if ($exH) { 'fehler' } elseif ($ex.Count) { 'ok' } else { 'info' }) $(if ($exH) { 'Explorer reagiert NICHT' } elseif ($ex.Count) { 'ja' } else { 'Explorer läuft nicht' })
`,
  },
  {
    // Ordnerrechte auf W3172 im AD (am Admin-PC): Freigabegruppen erkennt man an der Beschreibung
    // („RW access to \\W3172\SKF Marine\…“). Mitgliedschaft über tokenGroups (transitiv, inkl.
    // domänenlokaler Gruppen). Vergleich mit den Kollegen derselben Abteilung (sonst gleicher
    // Vorgesetzter): was die meisten haben und dem Benutzer fehlt, ist der Kandidat. Nur lesend.
    id: 'lwr', titel: 'Ordner-Berechtigungen auf W3172 (AD, Vergleich mit den Kollegen)', modus: 'lokal', timeoutMs: 150000,
    ps: AD_HELFER + String.raw`
$ben = AdBenutzer $adSam
if (-not $ben) {
  Punkt 'Ordner-Berechtigungen (AD)' 'info' $(if ($adSam) { 'Konto ' + $adSam + ' im AD nicht gefunden (Admin-PC ohne Verbindung zum AD?)' } else { 'kein angemeldeter Benutzer – Rechte nicht prüfbar' })
} else {
  $wald = ''; try { $wald = [System.DirectoryServices.ActiveDirectory.Forest]::GetCurrentForest().Name } catch {}
  $felder = @('cn', 'description', 'objectSid')
  # Erst die Domäne des Benutzers (schnell), nur wenn dort nichts liegt das ganze Verzeichnis (GC, langsam)
  $treffer = @(AdSuche ('LDAP://' + $ben.dom) '(&(objectCategory=group)(description=*W3172*))' $felder)
  if (-not $treffer.Count -and $wald) { $treffer = @(AdSuche ('GC://' + $wald) '(&(objectCategory=group)(description=*W3172*))' $felder) }
  $fg = @{}
  foreach ($g in $treffer) {
    $roh = $g.Properties['objectsid']; if (-not $roh -or -not $roh.Count) { continue }
    $gsid = (New-Object System.Security.Principal.SecurityIdentifier([byte[]]$roh[0], 0)).Value
    $desc = AdWert $g 'description'
    $pfad = if ($desc -match '(\\\\[^,;()]+)') { $Matches[1].Trim().TrimEnd('.', '\') } else { $desc }
    $art = if ($desc -match '(?i)\bRW\b|write|modify|change|schreib') { 'RW' } elseif ($desc -match '(?i)\bRO\b|read|lesen') { 'RO' } else { '' }
    $fg[$gsid] = [pscustomobject]@{ cn = (AdWert $g 'cn'); pfad = $pfad; art = $art }
  }
  Fakt 'gelesen' $true
  Fakt 'gruppenGesamt' $fg.Count
  Fakt 'abteilung' $ben.abt
  if (-not $fg.Count) {
    Punkt 'Freigabegruppen W3172' 'info' 'keine Gruppen mit „W3172“ in der Beschreibung gefunden – Vergleich nicht möglich'
  } else {
    $eigen = AdTokenSids $ben.dn $ben.dom
    $meine = @($fg.Keys | Where-Object { $eigen.Contains($_) })
    $meinePfade = @($meine | ForEach-Object { $fg[$_].pfad } | Sort-Object -Unique)
    Fakt 'freigaben' $meine.Count
    Punkt 'Eigene Ordnerrechte auf W3172' $(if ($meine.Count) { 'ok' } else { 'fehler' }) $(if ($meine.Count) { '' + $meine.Count + ' Gruppe(n): ' + ((@($meine | ForEach-Object { $fg[$_].pfad + $(if ($fg[$_].art) { ' (' + $fg[$_].art + ')' } else { '' }) }) | Sort-Object -Unique | Select-Object -First 12) -join ' · ') } else { 'keine einzige Freigabegruppe' })
    $kol = @(); $basis = ''
    if ($ben.abt) { $kol = @(AdSuche ('LDAP://' + $ben.dom) ('(&(objectCategory=person)(objectClass=user)(department=' + (LdapEsc $ben.abt) + ')(!(userAccountControl:1.2.840.113556.1.4.803:=2)))') @('distinguishedName') 80); $basis = 'Abteilung „' + $ben.abt + '“' }
    if ($kol.Count -lt 4 -and $ben.mgr) { $kol = @(AdSuche ('LDAP://' + $ben.dom) ('(&(objectCategory=person)(objectClass=user)(manager=' + (LdapEsc $ben.mgr) + ')(!(userAccountControl:1.2.840.113556.1.4.803:=2)))') @('distinguishedName') 80); $basis = 'gleicher Vorgesetzter' }
    $kolDn = @($kol | ForEach-Object { AdWert $_ 'distinguishedName' } | Where-Object { $_ -and $_ -ne $ben.dn } | Select-Object -First 60)
    Fakt 'kollegen' $kolDn.Count
    $zaehl = @{}
    foreach ($kd in $kolDn) { $tok = AdTokenSids $kd $ben.dom; foreach ($gsid in @($fg.Keys)) { if ($tok.Contains($gsid)) { $zaehl[$gsid] = 1 + [int]$zaehl[$gsid] } } }
    # Wörter der Abteilung (ab 4 Buchstaben) — Ordner mit diesem Namen gehören sehr wahrscheinlich dazu
    $abtWorte = @(([string]$ben.abt -split '[^A-Za-zÄÖÜäöüß0-9]+') | Where-Object { $_.Length -ge 4 })
    $fehlen = @()
    foreach ($gsid in @($fg.Keys)) {
      if ($eigen.Contains($gsid)) { continue }
      $gr = $fg[$gsid]; $anz = [int]$zaehl[$gsid]
      $quote = if ($kolDn.Count) { $anz / $kolDn.Count } else { 0 }
      $blatt = ($gr.pfad -split '\\')[-1]
      $namePasst = @($abtWorte | Where-Object { $blatt -like ('*' + $_ + '*') }).Count -gt 0
      if (($kolDn.Count -ge 2 -and $anz -ge 2 -and $quote -ge 0.5) -or ($namePasst -and $anz -ge 1)) {
        $fehlen += [pscustomobject]@{ gr = $gr; anz = $anz; q = $quote; stark = ($quote -ge 0.75 -or $namePasst); nurLesen = ($meinePfade -contains $gr.pfad) }
      }
    }
    $fehlen = @($fehlen | Sort-Object -Property @{ Expression = 'stark'; Descending = $true }, @{ Expression = 'q'; Descending = $true } | Select-Object -First 8)
    $texte = @($fehlen | ForEach-Object { $_.gr.pfad + $(if ($_.gr.art) { ' (' + $_.gr.art + ')' } else { '' }) + ' – Gruppe ' + $_.gr.cn + ' – ' + $_.anz + ' von ' + $kolDn.Count + ' Kollegen' + $(if ($_.nurLesen) { ' – Benutzer hat für den Ordner nur eine andere Gruppe' } else { '' }) })
    Fakt 'fehlen' $texte
    Fakt 'fehlenAnzahl' $fehlen.Count
    Fakt 'fehlenStark' @($fehlen | Where-Object { $_.stark -and -not $_.nurLesen }).Count
    Fakt 'nurAndereGruppe' @($fehlen | Where-Object { $_.nurLesen }).Count
    Fakt 'nurAndereListe' @($texte | Where-Object { $_ -like '*nur eine andere Gruppe' })
    if ($kolDn.Count -lt 2) { Punkt 'Vergleich mit Kollegen' 'info' ('zu wenige Kollegen gefunden (' + $basis + ') – nur Abgleich über den Abteilungsnamen') }
    elseif (-not $fehlen.Count) { Punkt 'Vergleich mit Kollegen' 'ok' ('' + $kolDn.Count + ' Kollegen (' + $basis + '): dem Benutzer fehlt keine Ordnerberechtigung, die die meisten haben') }
    else { Punkt 'Vergleich mit Kollegen' 'warn' ('' + $kolDn.Count + ' Kollegen (' + $basis + '): ' + $fehlen.Count + ' Ordnerberechtigung(en) fehlen dem Benutzer') }
    foreach ($t in $texte) { Punkt 'Fehlt im Vergleich' 'warn' $t }
  }
}
`,
  },
]

export const THEMEN_LAUFWERKE: DgOber[] = [
  {
    id: 'laufwerke', titel: 'Netzlaufwerke & Dateien', symbol: 'HardDrive',
    beschreibung: 'Laufwerk fehlt oder hat ein rotes X, Zugriff verweigert, Datei gesperrt, Homeoffice, gelöschte Dateien, Explorer hängt',
    unter: [
      {
        id: 'lw-fehlt', titel: 'Netzlaufwerk fehlt oder hat ein rotes X', beschreibung: 'I: oder ein Abteilungslaufwerk ist unter „Dieser PC“ weg, zeigt ein rotes X oder „Netzwerkpfad nicht gefunden“',
        sonden: ['lw', 'lwses', 'lwsys', 'lwr'],
        fragen: [{ id: 'admin', text: 'Fehlt das Laufwerk nur in einem Programm, das „als Administrator“ läuft?' }],
        regeln: [
          { id: 'wks-aus', wenn: f => f['lwsys.wksDienst'] != null && txt(f['lwsys.wksDienst']) !== 'Running', befund: f => `Arbeitsstationsdienst läuft nicht (${txt(f['lwsys.wksDienst'])}, Start ${txt(f['lwsys.wksStart'])}) – ohne ihn geht kein Laufwerk`, problem: 'laufwerk-arbeitsstationsdienst', schwere: 3 },
          { id: 'anbieter', wenn: f => nein(f['lwsys.anbieterOk']), befund: () => 'Der Netzwerkanbieter „Microsoft Windows Network“ fehlt in der Anbieter-Reihenfolge', problem: 'laufwerk-fehler-1203', schwere: 3 },
          { id: 'server-weg', wenn: f => liste(f['lw.serverNichtErreichbar']).length > 0, befund: f => `Dateiserver nicht erreichbar (TCP 445): ${txt(f['lw.serverNichtErreichbar'])}`, problem: 'laufwerk-netzwerkpfad-nicht-gefunden', schwere: 3 },
          { id: 'rotes-x', wenn: f => liste(f['lwses.nichtVerfuegbar']).length > 0, befund: f => `Laufwerk(e) „nicht verfügbar“: ${txt(f['lwses.nichtVerfuegbar'])}`, problem: 'laufwerk-rotes-x', schwere: 3 },
          { id: 'i-falsch', wenn: f => ja(f['lw.iFalscherBuchstabe']), befund: f => `SKF Marine (\\\\w3172) ist unter ${txt(f['lw.marineBuchstabe'])} statt I: verbunden`, problem: 'laufwerk-i-falscher-buchstabe', schwere: 3 },
          { id: 'belegt', wenn: f => liste(f['lw.buchstabeBelegt']).length > 0, befund: f => `Laufwerksbuchstabe von USB-Stick/Kartenleser belegt: ${txt(f['lw.buchstabeBelegt'])}`, problem: 'laufwerk-buchstabe-belegt', schwere: 3 },
          { id: 'admin-prog', wenn: f => f['frage.admin'] === 'ja' && nein(f['lwsys.linkedConnections']), befund: () => 'Programme „als Administrator“ sehen die Laufwerke nicht (EnableLinkedConnections fehlt)', problem: 'laufwerk-fehlt-in-admin-programm', schwere: 3 },
          { id: 'i-fehlt', wenn: f => nein(f['lw.iVorhanden']) && nein(f['lwses.iVerbunden']), befund: () => 'Laufwerk I: (SKF Marine) ist weder gespeichert noch in der Sitzung verbunden', problem: 'laufwerk-i-fehlt', schwere: 2 },
          ...RECHTE_REGELN,
        ],
        ohneBefund: ['laufwerk-rotes-x', 'laufwerk-i-fehlt', 'laufwerk-nach-anmeldung-nicht-verbunden', 'laufwerk-abteilung-fehlt'],
      },
      {
        id: 'lw-anmeldung', titel: 'Laufwerke werden nach der Anmeldung nicht verbunden', beschreibung: '„Es konnten nicht alle Netzlaufwerke wiederhergestellt werden“, Abteilungslaufwerke fehlen, schwarzes Fenster beim Anmelden',
        sonden: ['lw', 'lwses', 'lwsys', 'aad', 'lwr'],
        regeln: [
          { id: 'gpo-fehler', wenn: f => num(f['lw.gpoFehler7']) > 0, befund: f => `Richtlinie konnte Laufwerke ${f['lw.gpoFehler7']}× nicht verbinden (7 Tage)`, problem: 'laufwerk-nach-anmeldung-nicht-verbunden', schwere: 3 },
          { id: 'kein-tgt', wenn: f => nein(f['aad.kerberosTgt']), befund: () => 'Kein Kerberos-Anmeldeticket – Anmeldeskript und Laufwerke scheitern an der Anmeldung', problem: 'laufwerk-anmeldeskript-fehler', schwere: 3 },
          { id: 'server-weg', wenn: f => liste(f['lw.serverNichtErreichbar']).length > 0, befund: f => `Server beim Anmelden nicht erreichbar: ${txt(f['lw.serverNichtErreichbar'])}`, problem: 'laufwerk-anmeldung-dauert-unerreichbar', schwere: 2 },
          { id: 'per-ip', wenn: f => liste(f['lw.perIp']).length > 0, befund: f => `Laufwerk per IP-Adresse statt Servername verbunden: ${txt(f['lw.perIp'])}`, problem: 'laufwerk-per-ip-verbunden', schwere: 2 },
          { id: 'rotes-x', wenn: f => liste(f['lwses.nichtVerfuegbar']).length > 0, befund: f => `Nach der Anmeldung nicht verbunden: ${txt(f['lwses.nichtVerfuegbar'])}`, problem: 'laufwerk-rotes-x', schwere: 2 },
          { id: 'netlogon', wenn: f => ja(f['lwsys.domaenenPc']) && f['lwsys.netlogon'] != null && txt(f['lwsys.netlogon']) !== 'Running', befund: f => `Netzwerkanmeldedienst (Netlogon) läuft nicht (${txt(f['lwsys.netlogon'])})`, problem: 'laufwerk-fehler-1792-netzwerkanmeldedienst', schwere: 2 },
          { id: 'doppelt', wenn: f => liste(f['lw.doppelt']).length > 0, befund: f => `Gleiche Freigabe unter mehreren Buchstaben: ${txt(f['lw.doppelt'])}`, problem: 'laufwerk-doppelt', schwere: 1 },
          // Abteilungslaufwerke verbindet das Anmeldeskript nach Gruppenmitgliedschaft — fehlt die Gruppe, fehlt das Laufwerk
          ...RECHTE_REGELN,
        ],
        ohneBefund: ['laufwerk-nach-anmeldung-nicht-verbunden', 'laufwerk-abteilung-fehlt', 'laufwerk-erscheinen-erst-spaeter', 'laufwerk-anmeldeskript-fehler'],
      },
      {
        id: 'lw-zugriff', titel: 'Zugriff verweigert oder Kennwortabfrage', beschreibung: 'Beim Öffnen eines Ordners kommt „Zugriff verweigert“ oder Windows fragt nach Benutzername und Kennwort',
        sonden: ['lwr', 'lw', 'lwses', 'lwsys', 'aad'],
        fragen: [
          { id: 'neueRechte', text: 'Haben Sie die Berechtigung für den Ordner gerade erst bekommen?' },
          { id: 'kennwort', text: 'Haben Sie kürzlich Ihr Kennwort geändert?' },
        ],
        regeln: [
          { id: 'kein-tgt', wenn: f => nein(f['aad.kerberosTgt']), befund: () => 'Kein Kerberos-Anmeldeticket – der Server kann Sie nicht automatisch erkennen', problem: 'laufwerk-kennwortabfrage', schwere: 3 },
          { id: 'fremdes-konto', wenn: f => liste(f['lw.fremdesKonto']).length > 0, befund: f => `Laufwerk mit fremdem Konto verbunden: ${txt(f['lw.fremdesKonto'])}`, problem: 'laufwerk-fremdes-konto', schwere: 3 },
          { id: 'gast', wenn: f => num(f['lwsys.gastAbgelehnt7']) > 0, befund: f => `Windows hat ${f['lwsys.gastAbgelehnt7']}× einen Gastzugriff ohne Kennwort blockiert`, problem: 'laufwerk-gastzugriff-blockiert', schwere: 3 },
          { id: 'alte-anmeldedaten', wenn: f => liste(f['lwses.gespeicherteAnmeldungen']).length > 0 && f['frage.kennwort'] === 'ja', befund: f => `Gespeicherte Anmeldedaten mit altem Kennwort: ${txt(f['lwses.gespeicherteAnmeldungen'])}`, problem: 'laufwerk-nach-kennwortaenderung', schwere: 3 },
          { id: 'gespeichert', wenn: f => liste(f['lwses.gespeicherteAnmeldungen']).length > 0, befund: f => `Für Server sind feste Anmeldedaten gespeichert: ${txt(f['lwses.gespeicherteAnmeldungen'])}`, problem: 'laufwerk-fehler-1219', schwere: 2 },
          { id: 'neue-rechte', wenn: f => f['frage.neueRechte'] === 'ja', befund: () => 'Neue Berechtigung greift erst mit neuem Anmeldeticket', problem: 'laufwerk-neue-berechtigung', schwere: 2 },
          { id: 'hello', wenn: f => ja(f['aad.hello']) && nein(f['aad.kerberosTgt']), befund: () => 'Anmeldung mit Windows-Hello-PIN ohne Kerberos-Ticket', problem: 'laufwerk-hello-pin-kennwortabfrage', schwere: 2 },
          ...RECHTE_REGELN,
        ],
        ohneBefund: ['laufwerk-rechte-antrag-vorbereiten', 'laufwerk-zugriff-verweigert', 'laufwerk-nur-leserechte', 'laufwerk-kennwortabfrage'],
      },
      {
        id: 'lw-abteilung', titel: 'Kein Zugriff auf den Abteilungsordner (oder er ist gar nicht zu sehen)', beschreibung: 'Der Ordner der eigenen Abteilung auf I: bzw. W3172 fehlt, ist leer oder meldet „Zugriff verweigert“ – auch im Büro',
        sonden: ['lwr', 'lw', 'lwses', 'aad'],
        fragen: [{ id: 'neueRechte', text: 'Wurde die Berechtigung gerade erst beantragt bzw. vergeben?' }],
        regeln: [
          ...RECHTE_REGELN,
          { id: 'neue-rechte', wenn: f => f['frage.neueRechte'] === 'ja', befund: () => 'Neue Berechtigung greift erst nach Ab- und Anmelden (neues Anmeldeticket)', problem: 'laufwerk-neue-berechtigung', schwere: 2 },
          { id: 'kein-tgt', wenn: f => nein(f['aad.kerberosTgt']), befund: () => 'Kein Kerberos-Anmeldeticket – der Server kann den Benutzer nicht automatisch erkennen', problem: 'laufwerk-kennwortabfrage', schwere: 2 },
          { id: 'i-fehlt', wenn: f => nein(f['lw.iVorhanden']) && nein(f['lwses.iVerbunden']), befund: () => 'Laufwerk I: (SKF Marine) ist gar nicht verbunden', problem: 'laufwerk-i-fehlt', schwere: 2 },
        ],
        ohneBefund: ['laufwerk-rechte-antrag-vorbereiten', 'laufwerk-zugriff-verweigert', 'laufwerk-neue-berechtigung', 'laufwerk-abteilung-fehlt'],
      },
      {
        id: 'lw-datei', titel: 'Datei gesperrt, schreibgeschützt oder lässt sich nicht speichern', beschreibung: '„Wird von einem anderen Benutzer verwendet“, Datei öffnet nur schreibgeschützt, Speichern scheitert, „Datenträger voll“',
        sonden: ['lwses', 'lw', 'lwsys', 'sys', 'lwr'],
        fragen: [
          { id: 'kollege', text: 'Nennt Office einen Kollegen, der die Datei geöffnet hat?' },
          { id: 'standby', text: 'Passiert es nach Zuklappen bzw. Standby des Laptops?' },
        ],
        regeln: [
          { id: 'office-versteckt', wenn: f => liste(f['lwses.officeVersteckt']).length > 0 && f['frage.kollege'] !== 'ja', befund: f => `Unsichtbares Office im Hintergrund hält Dateien gesperrt: ${txt(f['lwses.officeVersteckt'])}`, problem: 'laufwerk-von-mir-selbst-gesperrt', schwere: 3 },
          { id: 'c-voll', wenn: f => num(f['sys.cFreiGB']) < 2, befund: f => `Laufwerk C: hat nur ${zahl(f['sys.cFreiGB'])} GB frei – Office braucht dort Platz zum Speichern`, problem: 'laufwerk-speichern-c-voll', schwere: 3 },
          { id: 'lw-voll', wenn: f => liste(f['lwses.vollLaufwerke']).length > 0, befund: f => `Netzlaufwerk fast voll: ${txt(f['lwses.vollLaufwerke'])}`, problem: 'laufwerk-speicher-voll', schwere: 3 },
          { id: 'kollege', wenn: f => f['frage.kollege'] === 'ja', befund: () => 'Ein Kollege hat die Datei geöffnet', problem: 'laufwerk-datei-gesperrt', schwere: 2 },
          { id: 'standby', wenn: f => f['frage.standby'] === 'ja', befund: () => 'Verbindung zum Server ging beim Standby verloren', problem: 'laufwerk-fehler-0x800703ee-nach-standby', schwere: 2 },
          { id: 'zone', wenn: f => liste(f['lw.pfadeOhneIntranetzone']).length > 0, befund: f => `Server nicht in der Intranetzone (geschützte Ansicht/gesperrte Makros): ${txt(f['lw.pfadeOhneIntranetzone'])}`, problem: 'laufwerk-sicherheitswarnung', schwere: 2 },
          { id: 'offline', wenn: f => ja(f['lwsys.offlineAktiv']), befund: () => 'Offlinedateien sind eingeschaltet – es kann eine veraltete Kopie geöffnet sein', problem: 'laufwerk-offline-veraltet', schwere: 1 },
          RECHTE_REGELN[3],
        ],
        ohneBefund: ['laufwerk-datei-gesperrt', 'laufwerk-kollege-weg-datei-offen', 'laufwerk-nur-leserechte', 'laufwerk-schreibschutz-attribut'],
      },
      {
        id: 'lw-homeoffice', titel: 'Laufwerke im Homeoffice nicht erreichbar', beschreibung: 'Zu Hause oder unterwegs sind I: und die Abteilungslaufwerke weg, im Büro geht es',
        sonden: ['zpa', 'net', 'lwsys', 'lw'],
        regeln: [
          // Häufigste Ursache: die ZPA-Rolle „Marine Fileservers“ fehlt. Im Unterthema ist „Homeoffice“ schon gesagt
          // (der PC kann gerade im Büro stehen); in der Bereichs-Diagnose nur, wenn der PC nicht im Firmennetz (10.x) ist.
          { id: 'zpa-basis', wenn: f => nein(f['zpa.basis']), befund: () => 'Die Grundrolle für den Fernzugriff („Remote Access“, Azure_AD_SSO_Akamai_EAA_Client) fehlt – ohne sie gehen im Homeoffice keine Laufwerke, auch mit „Marine Fileservers“', problem: 'vpn-fernzugriff-beantragen', schwere: 3, imBereich: ausserhalbFirmennetz },
          { id: 'zpa-fileserver', wenn: f => nein(f['zpa.fileserver']), befund: () => 'Die Homeoffice-Berechtigung für die Marine-Fileserver fehlt (AD-Gruppe EAA_File_Servers_Marine_Prod) – ohne sie kein I: und keine Abteilungslaufwerke über Zscaler', problem: 'laufwerk-homeoffice-berechtigung-fehlt', schwere: 3, imBereich: ausserhalbFirmennetz },
          { id: 'kein-internet', wenn: f => nein(f['net.internet443']), befund: () => 'Der PC hat überhaupt kein Internet', problem: 'netz-kein-internet-verbunden', schwere: 3 },
          { id: 'zscaler-aus', wenn: f => ja(f['net.zscalerInstalliert']) && f['net.zscalerDienst'] != null && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])}) – ohne ihn kein Firmennetz von zu Hause`, problem: 'vpn-zscaler-symbol-fehlt', schwere: 3 },
          { id: 'zscaler-fehlt', wenn: f => nein(f['net.zscalerInstalliert']) && nein(f['net.domaeneErreichbar']), befund: () => 'Zscaler ist nicht installiert und das Firmennetz ist nicht erreichbar', problem: 'vpn-zscaler-nicht-installiert', schwere: 3 },
          { id: 'w3172-weg', wenn: f => nein(f['lwsys.w3172Erreichbar']) && ja(f['net.internet443']), befund: f => `Internet geht, aber w3172 (I:) ist nicht erreichbar${ja(f['lwsys.w3172Dns']) ? '' : ' – der Name wird nicht aufgelöst'}`, problem: 'laufwerk-homeoffice', schwere: 3 },
          { id: 'per-ip', wenn: f => liste(f['lw.perIp']).length > 0, befund: f => `Laufwerk per IP-Adresse verbunden (geht über Zscaler nur per Name): ${txt(f['lw.perIp'])}`, problem: 'laufwerk-per-ip-verbunden', schwere: 2 },
          { id: 'offline-langsam', wenn: f => ja(f['lwsys.offlineAktiv']) && nein(f['net.domaeneErreichbar']), befund: () => 'Offlinedateien aktiv und Firmennetz nicht direkt erreichbar – Windows schaltet auf „Offline“', problem: 'laufwerk-offline-langsame-verbindung', schwere: 1 },
        ],
        ohneBefund: ['laufwerk-homeoffice-berechtigung-fehlt', 'laufwerk-homeoffice', 'vpn-zscaler-verbindung-haengt', 'laufwerk-offline-langsame-verbindung'],
      },
      {
        id: 'lw-version', titel: 'Datei gelöscht, überschrieben oder alter Stand gebraucht', beschreibung: 'Datei oder Ordner ist weg, Datei ist leer/beschädigt, ein älterer Stand wird gebraucht',
        sonden: ['lwsys', 'lw'],
        fragen: [
          { id: 'ordner', text: 'Ist ein ganzer Ordner verschwunden?' },
          { id: 'leer', text: 'Ist die Datei noch da, aber leer (0 KB) oder beschädigt?' },
          { id: 'gezogen', text: 'Ist die Datei nach Ziehen mit der Maus verschwunden?' },
          { id: 'gleichzeitig', text: 'Hatte ein Kollege die Datei gleichzeitig offen?' },
        ],
        regeln: [
          { id: 'reiter-aus', wenn: f => ja(f['lwsys.vorgaengerRichtlinieAus']), befund: () => 'Der Reiter „Vorgängerversionen“ ist per Richtlinie ausgeblendet', problem: 'laufwerk-reiter-vorgaengerversionen-fehlt', schwere: 3 },
          { id: 'ordner', wenn: f => f['frage.ordner'] === 'ja', befund: () => 'Ganzer Ordner fehlt – über Vorgängerversionen des übergeordneten Ordners zurückholen', problem: 'laufwerk-ordner-geloescht-zurueckholen', schwere: 2 },
          { id: 'leer', wenn: f => f['frage.leer'] === 'ja', befund: () => 'Datei ist leer bzw. beschädigt – alten Stand zurückholen', problem: 'laufwerk-datei-leer-beschaedigt', schwere: 2 },
          { id: 'gezogen', wenn: f => f['frage.gezogen'] === 'ja', befund: () => 'Datei wurde vermutlich in einen Nachbarordner gezogen', problem: 'laufwerk-datei-weggezogen', schwere: 2 },
          { id: 'gleichzeitig', wenn: f => f['frage.gleichzeitig'] === 'ja', befund: () => 'Gleichzeitiges Bearbeiten – die zuletzt gespeicherte Fassung hat gewonnen', problem: 'laufwerk-aenderungen-ueberschrieben', schwere: 2 },
          { id: 'versteckt', wenn: f => ja(f['lw.versteckteAusgeblendet']) && f['frage.ordner'] === 'ja', befund: () => 'Versteckte Dateien werden ausgeblendet – der Ordner kann noch da, aber unsichtbar sein', problem: 'laufwerk-dateien-versteckt', schwere: 1 },
        ],
        ohneBefund: ['laufwerk-datei-geloescht', 'laufwerk-stand-von-datum', 'laufwerk-vorgaengerversionen-leer', 'laufwerk-wer-hat-geloescht'],
      },
      {
        id: 'lw-langsam', titel: 'Explorer langsam oder hängt bei Netzlaufwerken', beschreibung: '„Dieser PC“ hängt, Öffnen/Speichern auf dem Laufwerk dauert ewig, Kopieren bricht ab',
        sonden: ['lw', 'lwses', 'lwsys', 'net'],
        regeln: [
          { id: 'explorer', wenn: f => ja(f['lwses.explorerHaengt']), befund: () => 'Der Explorer reagiert gerade nicht', problem: 'laufwerk-explorer-haengt', schwere: 3 },
          { id: 'server-weg', wenn: f => liste(f['lw.serverNichtErreichbar']).length > 0, befund: f => `Verbundenes Laufwerk zeigt auf nicht erreichbaren Server: ${txt(f['lw.serverNichtErreichbar'])} – Explorer wartet darauf`, problem: 'laufwerk-explorer-haengt', schwere: 3 },
          { id: 'umleitung', wenn: f => ja(f['lw.umleitungNichtErreichbar']), befund: f => `Desktop/Dokumente liegen auf einem nicht erreichbaren Server (${txt(f['lw.ordnerUmgeleitet'])})`, problem: 'laufwerk-desktop-umleitung-nicht-verfuegbar', schwere: 3 },
          { id: 'latenz', wenn: f => num(f['lwsys.w3172Ms']) >= 150, befund: f => `Verbindungsaufbau zu w3172 dauert ${f['lwsys.w3172Ms']} ms (normal < 20 ms)`, problem: 'laufwerk-langsam', schwere: 2 },
          { id: 'smb-abbrueche', wenn: f => num(f['lwsys.smbFehler7']) >= 20, befund: f => `${f['lwsys.smbFehler7']} Verbindungsprobleme zu Dateiservern in 7 Tagen`, problem: 'laufwerk-langsam', schwere: 2 },
          { id: 'nur-wlan', wenn: f => ja(f['net.wlan']) && nein(f['net.lan']), befund: () => 'Der PC ist nur per WLAN verbunden – große Dateien über WLAN sind deutlich langsamer', problem: 'laufwerk-nur-kabel-nicht-wlan', schwere: 1 },
          { id: 'offline', wenn: f => ja(f['lwsys.offlineAktiv']), befund: () => 'Offlinedateien sind eingeschaltet (Abgleich bremst den Explorer)', problem: 'laufwerk-offline-modus', schwere: 1 },
        ],
        ohneBefund: ['laufwerk-langsam', 'laufwerk-explorer-haengt', 'laufwerk-ordner-oeffnet-langsam', 'laufwerk-erster-zugriff-langsam'],
      },
    ],
  },
]
