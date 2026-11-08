// ── Problem-Assistent: Lösungsbausteine Gruppe „konto“ (Runde 3) ──
// Bereiche: Anmeldung & Konto · Sicherheit · SAP · SolidWorks & CAD.
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Nichts hier ändert Server, AD, GPO/Intune, Lizenzen, Defender-Einstellungen, BitLocker oder Firmware.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Windows-Sitzungen des PCs (quser), mit Sperr-Erkennung (LogonUI je Sitzung). Fallback ohne quser: Besitzer von explorer.exe. */
const SITZUNGEN = String.raw`
function SitzungenLesen {
  $l = @()
  $roh = @()
  try { $roh = @(& quser.exe 2>&1 | ForEach-Object { [string]$_ }) } catch {}
  foreach ($z in $roh) {
    $m = [regex]::Match($z, '^\s*(>?)(\S+)\s+(?:(\S+)\s+)?(\d+)\s+(\S+)\s+(\S+)\s+(.+?)\s*$')
    if ($m.Success) { $l += [pscustomobject]@{ Benutzer = $m.Groups[2].Value; Sitzung = $m.Groups[3].Value; Id = [int]$m.Groups[4].Value; Status = $m.Groups[5].Value; Leerlauf = $m.Groups[6].Value; Anmeldung = $m.Groups[7].Value } }
  }
  if (-not $l.Count) {
    foreach ($ex in @(Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -EA SilentlyContinue)) {
      $ow = $null; try { $ow = Invoke-CimMethod -InputObject $ex -MethodName GetOwner -EA Stop } catch {}
      if ($ow -and $ow.User) { $l += [pscustomobject]@{ Benutzer = [string]$ow.User; Sitzung = ''; Id = [int]$ex.SessionId; Status = '?'; Leerlauf = '?'; Anmeldung = '?' } }
    }
  }
  $l
}
function SitzungGesperrt([int]$id) { @(Get-Process -Name LogonUI -EA SilentlyContinue | Where-Object { $_.SessionId -eq $id }).Count -gt 0 }
function SitzungText($s) {
  if ($s.Status -eq '?') { return ('Sitzung ' + $s.Id + ' · ' + $s.Benutzer + ' · angemeldet (Details nicht lesbar — quser fehlt)' + $(if (SitzungGesperrt $s.Id) { ' · GESPERRT' } else { '' })) }
  $art = 'Konsole'; if ($s.Sitzung -match '^rdp') { $art = 'Remotedesktop' } elseif (-not $s.Sitzung) { $art = 'ohne Bildschirm' }
  $st = [string]$s.Status; if ($st -match '^(Aktiv|Active)') { if (SitzungGesperrt $s.Id) { $st = 'aktiv, GESPERRT' } else { $st = 'aktiv' } } elseif ($st -match '^(Getr|Disc)') { $st = 'GETRENNT (läuft im Hintergrund weiter)' }
  'Sitzung ' + $s.Id + ' · ' + $s.Benutzer + ' · ' + $art + ' · ' + $st + ' · angemeldet ' + $s.Anmeldung + ' · Leerlauf ' + $s.Leerlauf
}
`

/** Abweichung der Uhr zum Domänencontroller (w32tm /stripchart). */
const ZEITABW = String.raw`
function ZeitDc { $t = (& nltest.exe /dsgetdc: 2>&1 | Out-String); $m = [regex]::Match($t, 'DC:\s*\\\\([A-Za-z0-9._-]+)'); if ($m.Success) { $m.Groups[1].Value } else { '' } }
function ZeitAbw([string]$dc) {
  if (-not $dc) { return 'Domänencontroller nicht gefunden' }
  $o = (& w32tm.exe /stripchart ('/computer:' + $dc) /samples:1 /dataonly 2>&1 | Out-String)
  $m = [regex]::Match($o, '([+-]\d+[\.,]\d+)s')
  if ($m.Success) { return ($m.Groups[1].Value + ' s zu ' + $dc) } else { return ('nicht messbar (' + $dc + ')') }
}
`

/** SolidWorks-Versionsschlüssel des Benutzers (HKU\<SID>\Software\SolidWorks\SOLIDWORKS 20xx). */
const SW_KEYS = String.raw`
function SwVersionen { @(Get-ChildItem -LiteralPath ($uHive + '\Software\SolidWorks') -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^SOLIDWORKS \d{4}$' } | Sort-Object PSChildName) }
`

export const AKTIONEN_KONTO: PaAktion[] = [
  // ══ Anmeldung & Konto ═══════════════════════════════════════════════════════
  A({ id: 'konto-sitzungen', titel: 'Angemeldete Benutzer und Sitzungen anzeigen', modus: 'system', risiko: 'lesen',
    beschreibung: 'Wer ist an diesem PC angemeldet (auch gesperrt oder getrennt im Hintergrund)? Je Sitzung: Status, Anmeldezeit, Leerlauf und offene Programme wie SolidWorks, SAP oder Outlook.',
    ps: SITZUNGEN + String.raw`
$alle = @(SitzungenLesen)
if (-not $alle.Count) { Zeile 'Kein Benutzer angemeldet.' }
$prozesse = @(Get-Process -EA SilentlyContinue)
foreach ($s in $alle) {
  Zeile (SitzungText $s)
  $p = @($prozesse | Where-Object { $_.SessionId -eq $s.Id })
  $wichtig = @($p | Where-Object { $_.ProcessName -match '^(SLDWORKS|saplogon|sapgui|OUTLOOK|EXCEL|WINWORD|ms-teams|Teams|msedge|chrome|NWBC|AcroRd32|Acrobat|FreeCAD)$' } | ForEach-Object { $_.ProcessName } | Select-Object -Unique)
  Zeile ('  ' + $p.Count + ' Prozesse' + $(if ($wichtig.Count) { ' · offen: ' + ($wichtig -join ', ') } else { '' }))
}
$getr = @($alle | Where-Object { $_.Status -match '^(Getr|Disc)' })
if ($getr.Count) { Zeile ('Hinweis: ' + $getr.Count + ' getrennte Sitzung(en) belegen weiter Arbeitsspeicher, Lizenzen (SolidWorks/SAP) und Geräte — „Sitzung abmelden“ beendet sie gezielt.') }
if ($alle.Count -gt 1) { Zeile 'Hinweis: Mehrere Benutzer sind gleichzeitig angemeldet.' }` }),
  A({ id: 'konto-sitzung-abmelden', titel: 'Sitzung eines anderen Benutzers abmelden (statt Neustart)', modus: 'system', risiko: 'kritisch',
    beschreibung: 'Meldet gezielt EINE gesperrte oder getrennte Sitzung ab (z. B. Kollege hat nur gesperrt) — der PC muss dafür nicht neu starten. Ungespeicherte Arbeit in dieser Sitzung geht verloren. Eine aktive, nicht gesperrte Sitzung wird nie abgemeldet.',
    param: { label: 'Benutzername oder Sitzungs-ID', platzhalter: 'z. B. mueller oder 2 (aus „Sitzungen anzeigen“)', pflicht: true },
    ps: SITZUNGEN + String.raw`
$w = $P.Trim()
if ($w -notmatch '^[A-Za-z0-9._-]{1,40}$') { throw ('Ungültige Angabe „' + $w + '“ — bitte den Benutzernamen (ohne Domäne) oder die Sitzungs-ID angeben.') }
$alle = @(SitzungenLesen | Where-Object { $_.Status -ne '?' })
if (-not $alle.Count) { throw 'Keine Sitzungen lesbar (quser fehlt oder niemand angemeldet).' }
foreach ($s in $alle) { Zeile ('vorher: ' + (SitzungText $s)) }
if ($w -match '^\d{1,4}$') { $ziel = @($alle | Where-Object { $_.Id -eq [int]$w }) } else { $ziel = @($alle | Where-Object { $_.Benutzer -ieq $w }) }
if (-not $ziel.Count) { throw ('Keine Sitzung zu „' + $w + '“ gefunden.') }
if ($ziel.Count -gt 1) { throw ('Mehrere Sitzungen passen zu „' + $w + '“ — bitte die Sitzungs-ID angeben.') }
$z = $ziel[0]
if ($z.Id -lt 1) { throw 'Sitzung 0 (Dienste) wird nie abgemeldet.' }
if (($z.Status -match '^(Aktiv|Active)') -and -not (SitzungGesperrt $z.Id)) { throw ('Sitzung ' + $z.Id + ' von ' + $z.Benutzer + ' ist aktiv und NICHT gesperrt — dort arbeitet gerade jemand. Bitte selbst abmelden lassen.') }
$aus = @(& logoff.exe $z.Id 2>&1 | ForEach-Object { [string]$_ })
foreach ($x in $aus) { if ($x.Trim()) { Zeile ('logoff: ' + $x.Trim()) } }
Start-Sleep -Seconds 5
$rest = @(SitzungenLesen | Where-Object { $_.Id -eq $z.Id -and $_.Benutzer -ieq $z.Benutzer })
if ($rest.Count) { Zeile ('jetzt: Sitzung ' + $z.Id + ' von ' + $z.Benutzer + ' meldet sich noch ab (' + $rest[0].Status + ') — in einer Minute erneut „Sitzungen anzeigen“.') } else { Zeile ('jetzt: ' + $z.Benutzer + ' ist abgemeldet (Sitzung ' + $z.Id + ' beendet).') }
foreach ($s in @(SitzungenLesen | Where-Object { $_.Status -ne '?' })) { Zeile ('verbleibend: ' + (SitzungText $s)) }` }),
  A({ id: 'konto-anmeldefehler', titel: 'Fehlgeschlagene Anmeldungen an diesem PC (mit Grund)', modus: 'system', risiko: 'lesen',
    beschreibung: 'Fehlgeschlagene Anmeldungen der letzten 7 Tage aus dem Sicherheitsprotokoll (4625) mit Klartext-Grund (falsches Kennwort, gesperrt, Uhrzeit, nicht erlaubt …), Anmeldeart und auslösendem Programm — zeigt auch, ob ein Programm mit altem Kennwort das Konto sperrt.',
    ps: String.raw`
$seit = (Get-Date).AddDays(-7)
$grund = @{ '0xc000006a' = 'falsches Kennwort'; '0xc0000064' = 'Benutzername unbekannt (Tippfehler/falsche Domäne)'; '0xc0000234' = 'Konto GESPERRT'; '0xc0000072' = 'Konto deaktiviert'; '0xc0000193' = 'Konto abgelaufen'; '0xc0000071' = 'Kennwort abgelaufen'; '0xc0000224' = 'Kennwort muss geändert werden'; '0xc0000133' = 'Uhrzeit weicht vom Domänencontroller ab'; '0xc000015b' = 'Anmeldeart an diesem PC nicht erlaubt (Benutzerrecht)'; '0xc000006f' = 'außerhalb der erlaubten Anmeldezeiten'; '0xc0000070' = 'Konto darf sich an diesem PC nicht anmelden (Arbeitsstationen)'; '0xc000005e' = 'kein Anmeldeserver erreichbar'; '0xc0000192' = 'Anmeldedienst (Netlogon) läuft nicht'; '0xc000018d' = 'Vertrauensstellung zur Domäne gestört'; '0xc0000413' = 'Anmeldung durch Richtlinie (Authentifizierungsfirewall) verweigert'; '0xc000006d' = 'Benutzername oder Kennwort falsch' }
$art = @{ '2' = 'am PC'; '3' = 'Netzwerk/Freigabe'; '4' = 'geplante Aufgabe'; '5' = 'Dienst'; '7' = 'Entsperren'; '8' = 'Netzwerk (Klartext)'; '9' = 'andere Anmeldeinformationen'; '10' = 'Remotedesktop'; '11' = 'zwischengespeichert' }
$ev = @()
try { $ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4625; StartTime = $seit } -MaxEvents 400 -EA Stop) } catch { if ([string]$_.FullyQualifiedErrorId -notmatch 'NoMatchingEventsFound') { Zeile ('Sicherheitsprotokoll nicht lesbar: ' + $_.Exception.Message) } }
Zeile ('Fehlgeschlagene Anmeldungen (7 Tage): ' + $ev.Count)
$liste = foreach ($e in $ev) {
  $d = @{}; try { foreach ($n in ([xml]$e.ToXml()).Event.EventData.Data) { $d[[string]$n.Name] = [string]$n.'#text' } } catch {}
  $c = ([string]$d['SubStatus']).ToLower(); if (-not $c -or $c -eq '0x0') { $c = ([string]$d['Status']).ToLower() }
  $g = $grund[$c]; if (-not $g) { $g = 'Code ' + $c }
  $a = $art[[string]$d['LogonType']]; if (-not $a) { $a = 'Typ ' + $d['LogonType'] }
  $pn = [string]$d['ProcessName']; $pr = ''; if ($pn -and $pn -ne '-') { $pr = ($pn -split '\\')[-1] }
  [pscustomobject]@{ Schluessel = ([string]$d['TargetDomainName'] + '\' + [string]$d['TargetUserName'] + ' · ' + $g + ' · ' + $a + $(if ($pr) { ' · Programm ' + $pr } else { '' })); Zeit = $e.TimeCreated }
}
foreach ($gr in @($liste | Group-Object Schluessel | Sort-Object Count -Descending | Select-Object -First 12)) {
  $letzt = ($gr.Group | Sort-Object Zeit -Descending | Select-Object -First 1).Zeit
  Zeile ('  ' + $gr.Count + '× ' + $gr.Name + ' · zuletzt ' + $letzt.ToString('dd.MM. HH:mm'))
}
$nl = @(); try { $nl = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'NETLOGON'; Id = 5719, 3210, 5805; StartTime = $seit } -MaxEvents 50 -EA Stop) } catch {}
Zeile ('Domänenverbindung (7 Tage): ' + @($nl | Where-Object { $_.Id -eq 5719 }).Count + '× kein Domänencontroller erreichbar · ' + @($nl | Where-Object { $_.Id -ne 5719 }).Count + '× Computerkonto/Vertrauensstellung abgelehnt')
$kb = @(); try { $kb = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Security-Kerberos'; StartTime = $seit } -MaxEvents 50 -EA Stop) } catch {}
foreach ($k in @($kb | Group-Object Id | Sort-Object Count -Descending | Select-Object -First 3)) { $m = ([string]$k.Group[0].Message -split '\r?\n')[0]; if ($m.Length -gt 150) { $m = $m.Substring(0, 150) + '…' }; Zeile ('Kerberos ' + $k.Name + ': ' + $k.Count + '× · ' + $m) }` }),
  A({ id: 'konto-zeitquelle-domaene', titel: 'Zeitquelle auf die Domäne zurückstellen (Uhr driftet immer wieder)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Wenn die Uhr nach „Uhrzeit abgleichen“ wieder wegläuft: Stellt den Windows-Zeitdienst wieder auf die Domänenhierarchie (statt time.windows.com oder „Local CMOS Clock“), startet ihn neu und gleicht ab. Zeigt Quelle und Abweichung zum Domänencontroller vorher und nachher.',
    ps: ZEITABW + String.raw`
$dom = $false; try { $dom = [bool](Get-CimInstance Win32_ComputerSystem -EA Stop).PartOfDomain } catch {}
if (-not $dom) { throw 'Der PC ist nicht Mitglied einer Domäne — die Zeitquelle „Domäne“ ist hier nicht möglich.' }
$par = 'HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\Parameters'
$vor = Get-ItemProperty -LiteralPath $par -EA SilentlyContinue
$dc = ZeitDc
Zeile ('vorher: Quelle ' + ((& w32tm.exe /query /source 2>&1 | Out-String).Trim()) + ' · Typ ' + [string]$vor.Type + ' · NtpServer ' + [string]$vor.NtpServer)
Zeile ('vorher: Abweichung ' + (ZeitAbw $dc))
$pol = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\W32Time\Parameters' -EA SilentlyContinue
if ($pol -and $pol.Type) { Zeile ('Hinweis: Eine Richtlinie gibt die Zeitquelle vor (Typ ' + $pol.Type + ') — sie hat Vorrang vor dieser Einstellung.') }
$s = Get-Service W32Time -EA SilentlyContinue
if (-not $s) { throw 'Der Windows-Zeitdienst (W32Time) fehlt.' }
if ($s.StartType -eq 'Disabled') { Set-Service -Name W32Time -StartupType Automatic; Zeile 'Zeitdienst: vorher deaktiviert → jetzt automatisch.' }
& w32tm.exe /config /syncfromflags:domhier /update 2>&1 | Out-Null
if ((Get-Service W32Time).Status -eq 'Running') { Restart-Service W32Time -Force -EA Stop } else { Start-Service W32Time -EA Stop }
Start-Sleep -Seconds 2
& w32tm.exe /resync /rediscover 2>&1 | ForEach-Object { if ([string]$_ -match '\S') { Zeile ('Abgleich: ' + ([string]$_).Trim()) } }
Start-Sleep -Seconds 2
$nach = Get-ItemProperty -LiteralPath $par -EA SilentlyContinue
Zeile ('jetzt: Quelle ' + ((& w32tm.exe /query /source 2>&1 | Out-String).Trim()) + ' · Typ ' + [string]$nach.Type)
Zeile ('jetzt: Abweichung ' + (ZeitAbw $dc) + ' · Uhrzeit ' + (Get-Date).ToString('dd.MM.yyyy HH:mm:ss'))` }),
  A({ id: 'konto-smartcard-status', titel: 'Smartcard: Leser, Karte und Anmeldezertifikat prüfen', modus: 'benutzer', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'In der Sitzung des Benutzers: Smartcard-Dienste, erkannte Kartenleser, was certutil auf der Karte findet, und ob das Anmeldezertifikat der Karte im Zertifikatspeicher angekommen ist (mit Ablaufdatum).',
    ps: String.raw`
foreach ($n in 'SCardSvr', 'CertPropSvc', 'ScDeviceEnum') { $s = Get-Service -Name $n -EA SilentlyContinue; if ($s) { Zeile ('Dienst ' + $s.DisplayName + ': ' + $s.Status + ' (' + $s.StartType + ')') } else { Zeile ('Dienst ' + $n + ': nicht vorhanden') } }
$leser = @(); try { $leser = @(Get-PnpDevice -Class SmartCardReader -EA Stop) } catch {}
foreach ($d in $leser) { Zeile ('Kartenleser: ' + $d.FriendlyName + ' · ' + $d.Status) }
if (-not $leser.Count) { Zeile 'Kartenleser: keiner im Geräte-Manager (abgesteckt, Treiber fehlt oder im Notebook deaktiviert).' }
$o = @(& certutil.exe -scinfo -silent 2>&1 | ForEach-Object { [string]$_ })
$w = @($o | Where-Object { $_ -match '(Leser|Reader|Karte|Card|Status|Antragsteller|Subject|NotAfter|Fehler|Error|0x8)' } | Select-Object -First 24)
foreach ($z in $w) { Zeile ('certutil: ' + $z.Trim()) }
$sc = @(Get-ChildItem Cert:\CurrentUser\My -EA SilentlyContinue | Where-Object { @($_.EnhancedKeyUsageList | Where-Object { $_.ObjectId -eq '1.3.6.1.4.1.311.20.2.2' }).Count -gt 0 } | Sort-Object NotAfter)
foreach ($c in $sc) { $t = ($c.NotAfter - (Get-Date)).Days; Zeile ('Anmeldezertifikat: ' + $c.Subject + ' · gültig bis ' + $c.NotAfter.ToString('dd.MM.yyyy') + $(if ($t -lt 0) { ' · ABGELAUFEN' } elseif ($t -lt 30) { ' · läuft in ' + $t + ' Tagen ab' } else { '' }) + ' · privater Schlüssel ' + (Ja $c.HasPrivateKey)) }
if (-not $sc.Count) { Zeile 'Kein Smartcard-Anmeldezertifikat im Speicher des Benutzers (Karte steckt nicht, ist leer oder die Zertifikatverteilung „CertPropSvc“ hängt).' }` }),

  // ══ Sicherheit ══════════════════════════════════════════════════════════════
  A({ id: 'sicherheit-defender-blockierungen', titel: 'Was hat Defender blockiert? (ASR, Ordnerzugriff, Netzwerkschutz, Funde)', modus: 'system', risiko: 'lesen',
    beschreibung: 'Liest die Defender-Ereignisse der letzten 7 Tage: Funde (1116/1117), Angriffsflächenreduzierung (1121/1122), überwachter Ordnerzugriff (1123/1124) und Netzwerkschutz (1125/1126) — mit Regelname, Programm und Pfad. Die Ausgabe passt direkt in ein Ticket für eine Freigabe; das Tool ändert nichts an Defender.',
    ps: String.raw`
$seit = (Get-Date).AddDays(-7)
try {
  $mp = Get-MpPreference -EA Stop
  $cfa = switch ([int]$mp.EnableControlledFolderAccess) { 0 { 'aus' } 1 { 'an (blockiert)' } 2 { 'nur Prüfmodus' } default { [string]$mp.EnableControlledFolderAccess } }
  $akt = @($mp.AttackSurfaceReductionRules_Actions)
  Zeile ('Überwachter Ordnerzugriff: ' + $cfa + ' · ASR-Regeln: ' + @($akt | Where-Object { [int]$_ -eq 1 }).Count + ' blockierend, ' + @($akt | Where-Object { [int]$_ -eq 2 -or [int]$_ -eq 6 }).Count + ' Prüfmodus/Warnen')
} catch { Zeile ('Defender-Einstellungen nicht lesbar: ' + $_.Exception.Message) }
$asr = @{ 'd4f940ab-401b-4efc-aadc-ad5f3c50688a' = 'Office darf keine Unterprozesse starten'; '3b576869-a4ec-4529-8536-b80a7769e899' = 'Office darf keine ausführbaren Inhalte erstellen'; '75668c1f-73b5-4cf0-bb93-3ecf5cb7cc84' = 'Office darf keinen Code in andere Prozesse einschleusen'; '92e97fa1-2edf-4476-bdd6-9dd0b4dddc7b' = 'Win32-API-Aufrufe aus Office-Makros'; 'd3e037e1-3eb8-44c8-a917-57927947596d' = 'JavaScript/VBScript startet heruntergeladene Programme'; '5beb7efe-fd9a-4556-801d-275e5ffc04cc' = 'verschleierte Skripte'; 'be9ba2d9-53ea-4cdc-84e5-9b1eeee46550' = 'ausführbare Inhalte aus E-Mail/Webmail'; '01443614-cd74-433a-b99e-2ecdc07bfc25' = 'unbekanntes/seltenes Programm (Verbreitung, Alter)'; '9e6c4e1f-7d60-472f-ba1a-a39ef669e4b2' = 'Kennwortdiebstahl aus LSASS'; 'd1e49aac-8f56-4280-b9ba-993a6d77406c' = 'Prozessstart über PsExec/WMI'; 'b2b3f03d-6a65-4f7b-a9c7-1c7ef74a9ba4' = 'unsignierte Programme vom USB-Stick'; '26190899-1602-49e8-8b27-eb1d0a1ce869' = 'Outlook darf keine Unterprozesse starten'; '7674ba52-37eb-4a4f-a9a1-f0f9a1619a2c' = 'Adobe Reader darf keine Unterprozesse starten'; 'e6db77e5-3df2-4cf1-b95a-636979351e5b' = 'Dauerhaftigkeit über WMI'; 'c1db55ab-c21a-4637-bb3f-a12568109d35' = 'erweiterter Ransomware-Schutz'; '56a863a9-875e-4185-98a7-b882c64b5ce5' = 'missbrauchte signierte Treiber' }
$was = @{ 1116 = 'Fund'; 1117 = 'Fund behandelt'; 1121 = 'ASR BLOCKIERT'; 1122 = 'ASR Prüfmodus'; 1123 = 'Ordnerzugriff BLOCKIERT'; 1124 = 'Ordnerzugriff Prüfmodus'; 1125 = 'Netzwerkschutz Prüfmodus'; 1126 = 'Netzwerkschutz BLOCKIERT' }
$ev = @()
try { $ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Windows Defender/Operational'; Id = 1116, 1117, 1121, 1122, 1123, 1124, 1125, 1126; StartTime = $seit } -MaxEvents 400 -EA Stop) } catch { if ([string]$_.FullyQualifiedErrorId -notmatch 'NoMatchingEventsFound') { Zeile ('Defender-Protokoll nicht lesbar: ' + $_.Exception.Message) } }
Zeile ('Defender-Ereignisse (7 Tage): ' + $ev.Count)
$liste = foreach ($e in $ev) {
  $d = @{}; try { foreach ($n in ([xml]$e.ToXml()).Event.EventData.Data) { $d[[string]$n.Name] = [string]$n.'#text' } } catch {}
  $msg = [string]$e.Message
  $pfad = [string]$d['Path']; if (-not $pfad) { $pfad = [regex]::Match($msg, '(?m)^\s*(Pfad|Path)\s*:\s*(.+)$').Groups[2].Value }
  $proz = [string]$d['Process Name']; if (-not $proz) { $proz = [regex]::Match($msg, '(?m)^\s*(Prozessname|Process Name)\s*:\s*(.+)$').Groups[2].Value }
  $id = ([string]$d['ID']).Trim('{', '}').ToLower(); if (-not $id) { $id = [regex]::Match($msg, '(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}').Value.ToLower() }
  $regel = ''; if ($e.Id -in 1121, 1122) { $regel = $asr[$id]; if (-not $regel) { $regel = 'Regel ' + $id } }
  $bed = [string]$d['Threat Name']
  $t = $was[[int]$e.Id] + $(if ($regel) { ' · ' + $regel } else { '' }) + $(if ($bed) { ' · ' + $bed } else { '' }) + $(if ($proz) { ' · Programm ' + $proz.Trim() } else { '' }) + $(if ($pfad) { ' · Ziel ' + $pfad.Trim() } else { '' })
  if ($t.Length -gt 300) { $t = $t.Substring(0, 300) + '…' }
  [pscustomobject]@{ Text = $t; Zeit = $e.TimeCreated }
}
foreach ($g in @($liste | Group-Object Text | Sort-Object Count -Descending | Select-Object -First 12)) { Zeile ('  ' + $g.Count + '× ' + $g.Name + ' · zuletzt ' + ($g.Group | Sort-Object Zeit -Descending | Select-Object -First 1).Zeit.ToString('dd.MM. HH:mm')) }
if ($ev.Count) { Zeile 'Freigaben/Ausnahmen setzt das Tool nicht — Ticket an DXC mit Regel, Programm und Pfad von oben.' }` }),
  A({ id: 'sicherheit-secureboot-status', titel: 'Secure Boot und neue Secure-Boot-Zertifikate (2023) prüfen', modus: 'system', risiko: 'lesen',
    beschreibung: 'Ist Secure Boot an? Sind die neuen Microsoft-Zertifikate „Windows UEFI CA 2023“ (db) und „KEK 2K CA 2023“ schon in der Firmware? Stand der Umstellung laut Windows (Servicing) und Ereignisse 1795/1796/1799/1801/1808 der letzten 60 Tage. Ändert nichts an Firmware oder BIOS.',
    ps: String.raw`
$sb = $null
try { $sb = Confirm-SecureBootUEFI -EA Stop; Zeile ('Secure Boot: ' + $(if ($sb) { 'an' } else { 'AUS (im BIOS deaktiviert)' })) } catch { Zeile ('Secure Boot: nicht feststellbar (' + $_.Exception.Message + ')') }
function SbHat([string]$var, [string]$txt) { try { $b = (Get-SecureBootUEFI -Name $var -EA Stop).Bytes; return ([System.Text.Encoding]::ASCII.GetString($b) -match [regex]::Escape($txt)) } catch { return $null } }
$db23 = SbHat 'db' 'Windows UEFI CA 2023'
$kek23 = SbHat 'KEK' 'Microsoft Corporation KEK 2K CA 2023'
$alt = SbHat 'db' 'Microsoft Windows Production PCA 2011'
function JaNeinUnb($v) { if ($null -eq $v) { 'nicht lesbar' } elseif ($v) { 'ja' } else { 'NEIN' } }
Zeile ('db enthält „Windows UEFI CA 2023“: ' + (JaNeinUnb $db23) + ' · KEK enthält „KEK 2K CA 2023“: ' + (JaNeinUnb $kek23) + ' · altes Zertifikat 2011 in db: ' + (JaNeinUnb $alt))
$k = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot' -EA SilentlyContinue
if ($k -and ($k.PSObject.Properties.Name -contains 'AvailableUpdates')) { Zeile ('Ausstehende Secure-Boot-Updates (AvailableUpdates): 0x' + ('{0:X}' -f [int]$k.AvailableUpdates)) }
$sv = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\Servicing' -EA SilentlyContinue
if ($sv) { foreach ($p in $sv.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' }) { Zeile ('Umstellung: ' + $p.Name + ' = ' + [string]$p.Value) } } else { Zeile 'Umstellung: keine Statuswerte (Windows-Update für die Umstellung fehlt noch oder wurde nie gestartet).' }
$text = @{ 1795 = 'Firmware hat das Zertifikats-Update abgelehnt'; 1796 = 'Secure-Boot-Update fehlgeschlagen'; 1799 = 'neuer Start-Manager (CA 2023) installiert'; 1801 = 'Zertifikate müssen noch aktualisiert werden'; 1808 = 'Zertifikate erfolgreich aktualisiert' }
$ev = @(); try { $ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-TPM-WMI'; Id = 1795, 1796, 1799, 1801, 1808; StartTime = (Get-Date).AddDays(-60) } -MaxEvents 200 -EA Stop) } catch {}
if (-not $ev.Count) { Zeile 'Ereignisse 1795/1796/1799/1801/1808 (60 Tage): keine' }
foreach ($g in @($ev | Group-Object Id | Sort-Object Name)) { $l = $g.Group | Sort-Object TimeCreated -Descending | Select-Object -First 1; Zeile ('Ereignis ' + $g.Name + ' (' + $text[[int]$g.Name] + '): ' + $g.Count + '× · zuletzt ' + $l.TimeCreated.ToString('dd.MM.yyyy HH:mm')) }
if ($sb -eq $false) { Zeile 'Fazit: Secure Boot ist AUS — der PC gilt als unsicher/nicht konform. Einschalten nur vor Ort im BIOS (vorher BitLocker-Schlüssel bereithalten).' } elseif ($db23 -eq $true -and $kek23 -eq $true) { Zeile 'Fazit: Die neuen Zertifikate sind in der Firmware — hier ist nichts mehr zu tun.' } elseif ($db23 -eq $false -or $kek23 -eq $false) { Zeile 'Fazit: Neue Zertifikate fehlen noch — Windows-Updates installieren, HP-BIOS aktualisieren; die Umstellung selbst steuert DXC zentral.' }` }),

  // ══ SAP ═════════════════════════════════════════════════════════════════════
  A({ id: 'sap-landscape-lokal-zuruecksetzen', titel: 'Lokale SAP-Verbindungsliste zurücksetzen (zentrale Liste greift wieder)', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Beendet SAP Logon und benennt die lokale Verbindungsliste des Benutzers um (SAPUILandscape.xml, alte saplogon.ini) — danach gilt wieder nur die zentrale Firmenliste. Nur wenn eine zentrale Liste hinterlegt ist; eigene Einträge bleiben in der .alt-Datei erhalten.',
    ps: String.raw`
NeedHive
$c = Join-Path $uRoam 'SAP\Common'
if (-not (Test-Path -LiteralPath $c)) { throw 'Kein SAP-Ordner im Profil des Benutzers (SAP Logon hier noch nie gestartet?).' }
$zentral = @()
foreach ($k in ($uHive + '\Software\SAP\SAPLogon\Options'), 'HKLM:\SOFTWARE\WOW6432Node\SAP\SAPLogon\Options', 'HKLM:\SOFTWARE\SAP\SAPLogon\Options') {
  $v = Get-ItemProperty -LiteralPath $k -EA SilentlyContinue
  if ($v) { foreach ($n in 'LandscapeFileOnServer', 'CoreLandscapeFileOnServer') { if (($v.PSObject.Properties.Name -contains $n) -and [string]$v.$n) { $zentral += [string]$v.$n } } }
}
$xml = Join-Path $c 'SAPUILandscape.xml'
$inc = @()
if (Test-Path -LiteralPath $xml) {
  $t = [string](Get-Content -LiteralPath $xml -Raw -EA SilentlyContinue)
  $inc = @([regex]::Matches($t, '<Include\s[^>]*url="([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
  Zeile ('vorher: lokale Liste vom ' + (Get-Item -LiteralPath $xml).LastWriteTime.ToString('dd.MM.yyyy HH:mm') + ' · ' + ([regex]::Matches($t, '<Service\s')).Count + ' eigene Einträge · ' + $inc.Count + ' Verweis(e) auf zentrale Listen')
} else { Zeile 'vorher: keine lokale SAPUILandscape.xml' }
foreach ($z in @($zentral | Select-Object -Unique)) { Zeile ('Zentrale Liste (Registry): ' + $z) }
foreach ($i in $inc) { Zeile ('Zentrale Liste (Verweis): ' + $i) }
if (-not $zentral.Count -and -not $inc.Count) { throw 'Keine zentrale Verbindungsliste gefunden (weder Registry noch Verweis) — Zurücksetzen würde die Liste leeren. Nichts geändert; bitte SAP Fehlersuche nutzen.' }
StopUser @('saplogon', 'sapgui', 'saplgpad', 'NWBC')
foreach ($f in 'SAPUILandscape.xml', 'SAPUILandscapeGlobal.xml', 'saplogon.ini', 'SapLogonTree.xml') { $p = Join-Path $c $f; if (Test-Path -LiteralPath $p) { [void](RenameAlt $p ('Lokale Datei ' + $f)) } }
if (-not $zentral.Count) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
  [void]$sb.AppendLine('<Landscape updated="' + (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') + '" version="1" generator="IT Admin Tool">')
  [void]$sb.AppendLine('  <Includes>')
  $n = 0; foreach ($u in $inc) { [void]$sb.AppendLine('    <Include url="' + $u + '" index="' + $n + '"/>'); $n++ }
  [void]$sb.AppendLine('  </Includes>')
  [void]$sb.AppendLine('</Landscape>')
  [System.IO.File]::WriteAllText($xml, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
  Zeile ('jetzt: neue lokale Liste angelegt, die nur die ' + $inc.Count + ' zentrale(n) Liste(n) einbindet.')
} else { Zeile 'jetzt: SAP Logon legt die lokale Liste beim nächsten Start neu aus der zentralen Liste an.' }
Zeile 'Eigene Einträge stehen weiter in der umbenannten Datei (*.alt_…) im Ordner AppData\Roaming\SAP\Common.'` }),
  A({ id: 'sap-skripting-ein', titel: 'SAP-GUI-Skripting für den Benutzer einschalten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Setzt in der SAP GUI des Benutzers „Skripting aktivieren“ (UserScripting=1), auf Wunsch ohne die Hinweise beim Verbinden eines Skripts. Zeigt alte und neue Werte und warnt, wenn eine Maschinenvorgabe Skripting sperrt. Im SAP-System muss Skripting zusätzlich erlaubt sein.',
    param: { label: 'Hinweise beim Verbinden eines Skripts', platzhalter: 'Hinweise behalten', pflicht: true, optionen: ['Hinweise behalten', 'Hinweise abschalten'] },
    ps: String.raw`
NeedHive
$w = $P.Trim()
if ($w -notin 'Hinweise behalten', 'Hinweise abschalten') { throw ('Unbekannte Auswahl: ' + $w) }
foreach ($hk in 'HKLM:\SOFTWARE\WOW6432Node\SAP\SAPGUI Front\SAP Frontend Server\Security', 'HKLM:\SOFTWARE\SAP\SAPGUI Front\SAP Frontend Server\Security') {
  $v = Get-ItemProperty -LiteralPath $hk -EA SilentlyContinue
  if ($v -and ($v.PSObject.Properties.Name -contains 'UserScripting') -and ([int]$v.UserScripting -eq 0)) { Zeile ('Achtung: Maschinenvorgabe ' + $hk + ' sperrt Skripting (UserScripting=0) — die Benutzereinstellung wirkt dann nicht (DXC).') }
}
$k = $uHive + '\Software\SAP\SAPGUI Front\SAP Frontend Server\Security'
function SapWert($obj, [string]$n) { if ($obj -and ($obj.PSObject.Properties.Name -contains $n)) { [string]$obj.$n } else { '(leer)' } }
$alt = Get-ItemProperty -LiteralPath $k -EA SilentlyContinue
Zeile ('vorher: UserScripting=' + (SapWert $alt 'UserScripting') + ' · WarnOnAttach=' + (SapWert $alt 'WarnOnAttach') + ' · WarnOnConnection=' + (SapWert $alt 'WarnOnConnection'))
if (-not (Test-Path -LiteralPath $k)) { New-Item -Path $k -Force | Out-Null }
Set-ItemProperty -LiteralPath $k -Name 'UserScripting' -Value 1 -Type DWord
if ($w -eq 'Hinweise abschalten') { Set-ItemProperty -LiteralPath $k -Name 'WarnOnAttach' -Value 0 -Type DWord; Set-ItemProperty -LiteralPath $k -Name 'WarnOnConnection' -Value 0 -Type DWord }
$neu = Get-ItemProperty -LiteralPath $k -EA SilentlyContinue
Zeile ('jetzt: UserScripting=' + (SapWert $neu 'UserScripting') + ' · WarnOnAttach=' + (SapWert $neu 'WarnOnAttach') + ' · WarnOnConnection=' + (SapWert $neu 'WarnOnConnection'))
if ((UserProcs @('saplogon', 'sapgui')).Count) { Zeile 'SAP läuft gerade — die Einstellung wirkt nach einem Neustart von SAP Logon.' }
Zeile 'Im SAP-System selbst muss Skripting ebenfalls erlaubt sein (Profilparameter sapgui/user_scripting, SAP-Basis).'` }),
  A({ id: 'sap-sicherheitsregeln-zuruecksetzen', titel: 'Gespeicherte SAP-GUI-Sicherheitsregeln zurücksetzen (Datei-Zugriffe)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Wurde in der Abfrage „SAP GUI Sicherheit“ einmal „Verweigern“ mit „Entscheidung merken“ gewählt, blockiert SAP Downloads/Uploads danach still. Beendet SAP und benennt die eigenen Regeln (saprules.xml) um — SAP fragt beim nächsten Zugriff wieder nach.',
    ps: String.raw`
NeedUser
$f = Join-Path $uRoam 'SAP\Common\saprules.xml'
if (-not (Test-Path -LiteralPath $f)) { Zeile 'vorher: keine eigenen Sicherheitsregeln gespeichert (saprules.xml fehlt) — es gilt die Standardregel. Nichts geändert.' } else {
  $i = Get-Item -LiteralPath $f
  $t = [string](Get-Content -LiteralPath $f -Raw -EA SilentlyContinue)
  Zeile ('vorher: saprules.xml vom ' + $i.LastWriteTime.ToString('dd.MM.yyyy HH:mm') + ' · ' + (Groesse $i.Length) + ' · ' + ([regex]::Matches($t, '(?i)deny')).Count + '× „Verweigern“ · ' + ([regex]::Matches($t, '(?i)allow')).Count + '× „Zulassen“')
  StopUser @('saplogon', 'sapgui', 'saplgpad', 'NWBC')
  [void](RenameAlt $f 'SAP-Sicherheitsregeln')
  Zeile 'jetzt: keine eigenen Regeln mehr — beim nächsten Download/Upload fragt SAP wieder; dann „Zulassen“ (und ggf. „Entscheidung merken“) wählen.'
}` }),

  // ══ SolidWorks & CAD ════════════════════════════════════════════════════════
  A({ id: 'sw-einstellungen-zuruecksetzen', titel: 'SolidWorks-Einstellungen des Benutzers zurücksetzen', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Benennt den Registry-Zweig „SOLIDWORKS 20xx“ des Benutzers um (nicht löschen) — SolidWorks startet danach mit Standard-Oberfläche und -Optionen (behebt Abstürze beim Start, verschwundene Menüs/Symbolleisten). SolidWorks muss geschlossen sein; Firmen-Dateipfade danach mit der SolidWorks Diagnose setzen.',
    param: { label: 'SolidWorks-Version (Jahr, leer = neueste)', platzhalter: 'z. B. 2024' },
    ps: SW_KEYS + String.raw`
NeedHive
$v = $P.Trim()
if ($v -and ($v -notmatch '^20\d{2}$')) { throw ('Ungültige Version „' + $v + '“ — bitte das Jahr angeben, z. B. 2024.') }
if ((UserProcs @('SLDWORKS')).Count) { throw 'SolidWorks läuft noch — bitte zuerst speichern lassen und „SolidWorks beenden“.' }
$ks = SwVersionen
if (-not $ks.Count) { throw 'Keine SolidWorks-Einstellungen im Profil des Benutzers gefunden.' }
Zeile ('vorher: Einstellungen vorhanden für ' + (($ks | ForEach-Object { $_.PSChildName }) -join ', '))
if ($v) { $ziel = @($ks | Where-Object { $_.PSChildName -eq ('SOLIDWORKS ' + $v) }) } else { $ziel = @($ks | Select-Object -Last 1) }
if (-not $ziel.Count) { throw ('Keine Einstellungen für SOLIDWORKS ' + $v + ' gefunden.') }
$name = $ziel[0].PSChildName
[void](RenameAlt ($uHive + '\Software\SolidWorks\' + $name) ('Einstellungen ' + $name))
Zeile ('jetzt: ' + $name + ' startet mit Standardeinstellungen (Oberfläche, Optionen, zuletzt geöffnete Dateien).')
Zeile 'Danach: Dateipfade (Vorlagen, Blattformate, Toolbox) mit der SolidWorks Diagnose setzen. Zurück: den Schlüssel *.alt_… unter Software\SolidWorks wieder umbenennen.'` }),
  A({ id: 'sw-softwaremodus-grafik', titel: 'SolidWorks: Software-OpenGL ein- oder ausschalten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Schaltet für alle SolidWorks-Versionen des Benutzers „Software-OpenGL verwenden“ um: AUS = Grafikkarte nutzen (normal, schnell, RealView); AN = Notbetrieb ohne Grafikkarte (bei Abstürzen/schwarzem Bild durch den Treiber, Remotedesktop). SolidWorks muss geschlossen sein.',
    param: { label: 'Software-OpenGL', platzhalter: 'Aus (Grafikkarte nutzen)', pflicht: true, optionen: ['Aus (Grafikkarte nutzen)', 'An (Notbetrieb ohne Grafikkarte)'] },
    ps: SW_KEYS + String.raw`
NeedHive
$w = $P.Trim()
if ($w -notin 'Aus (Grafikkarte nutzen)', 'An (Notbetrieb ohne Grafikkarte)') { throw ('Unbekannte Auswahl: ' + $w) }
$soll = 0; if ($w -like 'An*') { $soll = 1 }
if ((UserProcs @('SLDWORKS')).Count) { throw 'SolidWorks läuft noch — es würde die Einstellung beim Beenden überschreiben. Bitte zuerst „SolidWorks beenden“.' }
foreach ($g in @(Get-CimInstance Win32_VideoController -EA SilentlyContinue)) { Zeile ('Grafik: ' + $g.Name + ' · Treiber ' + $g.DriverVersion) }
$ks = SwVersionen
if (-not $ks.Count) { throw 'Keine SolidWorks-Einstellungen im Profil gefunden (SolidWorks einmal starten und schließen).' }
foreach ($kv in $ks) {
  $k = $uHive + '\Software\SolidWorks\' + $kv.PSChildName + '\Performance\Graphics\Hardware'
  $alt = '(leer = aus)'; $x = Get-ItemProperty -LiteralPath $k -EA SilentlyContinue
  if ($x -and ($x.PSObject.Properties.Name -contains 'Use Software OpenGL')) { $alt = [string]$x.'Use Software OpenGL' }
  if (-not (Test-Path -LiteralPath $k)) { New-Item -Path $k -Force | Out-Null }
  Set-ItemProperty -LiteralPath $k -Name 'Use Software OpenGL' -Value $soll -Type DWord
  Zeile ($kv.PSChildName + ': Software-OpenGL vorher ' + $alt + ' → jetzt ' + $soll + $(if ($soll) { ' (Notbetrieb — langsamer, ohne RealView)' } else { ' (Grafikkarte)' }))
}
Zeile 'Wirkt beim nächsten Start von SolidWorks.'` }),
]
