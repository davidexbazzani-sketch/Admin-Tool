// ── Problem-Assistent: Lösungsbausteine Gruppe „drucker“ (Runde 3) ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Drucker sind SEAL/PLOSSYS-Warteschlangen „PMDxxx“ (Port PLS_…); Get-Printer/StandardCimv2 fehlt auf vielen
// Clients → WMI Win32_Printer bzw. System.Printing. Druckserver (w3149/w3150/w3166) werden nie geändert,
// Drucker/Treiber entfernt nur der vorhandene Baustein dr-entfernen.

import type { PaAktion } from '../motor'
import { DRUCKER_PS } from './gemeinsam'

const A = (a: PaAktion): PaAktion => a

/** Erlaubte Werte für „dr-voreinstellung“ (Druckeinstellungen des Benutzers). */
const VOREINSTELLUNGEN = ['Beidseitig', 'Beidseitig kurze Kante', 'Einseitig', 'Farbe', 'Schwarzweiß', 'A4', 'A3', 'Papierfach automatisch', 'Eine Kopie', 'Eine Seite pro Blatt', 'Hochformat', 'Druckqualität normal', 'Schriftersetzung aus', 'Schriften als Bitmap']

const TOUCHPAD = ['Einschalten', 'Bei Maus ausschalten', 'Bei Maus anlassen', 'Empfindlichkeit niedrig', 'Empfindlichkeit mittel', 'Tippen zum Klicken aus', 'Tippen zum Klicken an']

const MAUS = ['Alles auf Standard', 'Tasten nicht vertauscht', 'Zeigergeschwindigkeit Standard', 'Doppelklick Standard', 'KlickEinrasten aus', 'Mausspur aus']

export const AKTIONEN_DRUCKER: PaAktion[] = [
  // ══ Drucker ═════════════════════════════════════════════════════════════════
  A({ id: 'dr-voreinstellung', titel: 'Druckeinstellung des Benutzers setzen (Duplex, Farbe, Format …)', modus: 'benutzer', risiko: 'aendern', timeoutMs: 90000,
    beschreibung: 'Setzt in den persönlichen Druckeinstellungen des Benutzers z. B. beidseitig/einseitig, Farbe/Schwarzweiß, A4/A3, Papierfach automatisch, eine Kopie, eine Seite pro Blatt oder Schriftersetzung aus. Ohne „|Drucker“ gilt es für den Standarddrucker. Zeigt alten und neuen Wert; was der Treiber nicht anbietet, wird gemeldet.',
    param: { label: 'Einstellung (optional „|Druckername“, sonst Standarddrucker)', platzhalter: 'Beidseitig', pflicht: true, optionen: VOREINSTELLUNGEN },
    ps: String.raw`
$teile = @($P -split '\|', 2)
$e = $teile[0].Trim()
if ($e -ieq 'Schwarzweiss') { $e = 'Schwarzweiß' }
if ($e -ieq 'Druckqualitaet normal') { $e = 'Druckqualität normal' }
$erlaubt = @('Beidseitig', 'Beidseitig kurze Kante', 'Einseitig', 'Farbe', 'Schwarzweiß', 'A4', 'A3', 'Papierfach automatisch', 'Eine Kopie', 'Eine Seite pro Blatt', 'Hochformat', 'Druckqualität normal', 'Schriftersetzung aus', 'Schriften als Bitmap')
if ($e -notin $erlaubt) { throw ('Einstellung nicht erlaubt: „' + $e + '“ — erlaubt: ' + ($erlaubt -join ', ')) }
$dn = ''; if ($teile.Count -gt 1) { $dn = $teile[1].Trim() }
if ($dn -and $dn -notmatch '^[\w .,()#&+\\-]{2,120}$') { throw ('Ungültiger Druckername: ' + $dn) }
$std = ''; try { $std = [string](Get-WmiObject Win32_Printer -Filter 'Default=TRUE' -EA Stop | Select-Object -First 1).Name } catch {}
if (-not $dn) { if (-not $std) { throw 'Kein Standarddrucker gesetzt — bitte „Einstellung|Druckername“ angeben (z. B. Beidseitig|PMD634).' }; $dn = $std }
# Feld im PrintTicket, Wert, Fähigkeitsliste des Treibers
$feld = ''; $wert = $null; $cap = ''
switch ($e) {
  'Beidseitig' { $feld = 'Duplexing'; $wert = 'TwoSidedLongEdge'; $cap = 'DuplexingCapability' }
  'Beidseitig kurze Kante' { $feld = 'Duplexing'; $wert = 'TwoSidedShortEdge'; $cap = 'DuplexingCapability' }
  'Einseitig' { $feld = 'Duplexing'; $wert = 'OneSided'; $cap = 'DuplexingCapability' }
  'Farbe' { $feld = 'OutputColor'; $wert = 'Color'; $cap = 'OutputColorCapability' }
  'Schwarzweiß' { $feld = 'OutputColor'; $wert = 'Monochrome'; $cap = 'OutputColorCapability' }
  'A4' { $feld = 'PageMediaSize'; $wert = 'ISOA4'; $cap = 'PageMediaSizeCapability' }
  'A3' { $feld = 'PageMediaSize'; $wert = 'ISOA3'; $cap = 'PageMediaSizeCapability' }
  'Papierfach automatisch' { $feld = 'InputBin'; $wert = 'AutoSelect'; $cap = 'InputBinCapability' }
  'Eine Kopie' { $feld = 'CopyCount'; $wert = 1 }
  'Eine Seite pro Blatt' { $feld = 'PagesPerSheet'; $wert = 1; $cap = 'PagesPerSheetCapability' }
  'Hochformat' { $feld = 'PageOrientation'; $wert = 'Portrait'; $cap = 'PageOrientationCapability' }
  'Druckqualität normal' { $feld = 'OutputQuality'; $wert = 'Normal'; $cap = 'OutputQualityCapability' }
  'Schriftersetzung aus' { $feld = 'DeviceFontSubstitution'; $wert = 'Off'; $cap = 'DeviceFontSubstitutionCapability' }
  'Schriften als Bitmap' { $feld = 'TrueTypeFontMode'; $wert = 'RenderAsBitmap'; $cap = 'TrueTypeFontModeCapability' }
}
function TicketText($x) { if ($null -eq $x) { return '—' }; if ($x.PSObject.Properties['PageMediaSizeName']) { return [string]$x.PageMediaSizeName }; return [string]$x }
$fertig = $false; $grund = ''; $name = $dn
try {
  Add-Type -AssemblyName System.Printing -EA Stop
  $lps = New-Object System.Printing.LocalPrintServer
  $qs = @($lps.GetPrintQueues([System.Printing.EnumeratedPrintQueueTypes[]]@('Local', 'Connections')))
  $q = @($qs | Where-Object { $_.FullName -ieq $dn -or $_.Name -ieq $dn -or $_.FullName -like ('*\' + $dn) }) | Select-Object -First 1
  if (-not $q) { $q = @($qs | Where-Object { $_.FullName -like ('*' + $dn + '*') }) | Select-Object -First 1 }
  if (-not $q) { throw ('Drucker „' + $dn + '“ ist beim Benutzer nicht installiert. Vorhanden: ' + (($qs | ForEach-Object { $_.FullName }) -join ', ')) }
  $name = [string]$q.FullName
  $t = $q.UserPrintTicket; if (-not $t) { $t = $q.DefaultPrintTicket }; if (-not $t) { $t = New-Object System.Printing.PrintTicket }
  $t = $t.Clone()
  $faehig = $null; try { $faehig = $q.GetPrintCapabilities($t) } catch {}
  if ($faehig -and $cap) {
    $liste = @($faehig.$cap)
    if ($feld -eq 'PageMediaSize') {
      $groesse = @($liste | Where-Object { [string]$_.PageMediaSizeName -eq $wert }) | Select-Object -First 1
      if ($liste.Count -and -not $groesse) { throw ('Der Treiber von ' + $name + ' bietet ' + $e + ' nicht an (Fach/Format in den Geräteeinstellungen der Warteschlange fehlt).') }
      if ($groesse) { $wert = $groesse }
    } elseif ($liste.Count) {
      $txt = @($liste | ForEach-Object { [string]$_ })
      if ($e -eq 'Schwarzweiß' -and $txt -notcontains 'Monochrome' -and $txt -contains 'Grayscale') { $wert = 'Grayscale' }
      if ($txt -notcontains [string]$wert) { throw ('Der Treiber von ' + $name + ' bietet „' + $e + '“ nicht an (angeboten: ' + ($txt -join ', ') + ') — Ausstattung in den Geräteeinstellungen der Warteschlange fehlt.') }
    }
  }
  if ($feld -eq 'PageMediaSize' -and $wert -is [string]) {
    $mm = @{ 'ISOA4' = @(793.7007874015748, 1122.5196850393702); 'ISOA3' = @(1122.5196850393702, 1587.4015748031497) }
    $wert = New-Object System.Printing.PageMediaSize -ArgumentList ([System.Printing.PageMediaSizeName]$wert), $mm[$wert][0], $mm[$wert][1]
  }
  $alt = TicketText $t.$feld
  $soll = TicketText $wert
  $t.$feld = $wert
  $q.UserPrintTicket = $t
  $q.Commit()
  $q.Refresh()
  $neu = TicketText $q.UserPrintTicket.$feld
  if ($neu -ne $soll) { throw ('Der Treiber von ' + $name + ' hat „' + $e + '“ nicht übernommen (vorher ' + $alt + ', jetzt ' + $neu + ') — er bietet es vermutlich nicht an (Ausstattung in den Geräteeinstellungen der Warteschlange).') }
  Zeile ($name + ': ' + $e + ' — vorher ' + $alt + ' → jetzt ' + $neu + ' (persönliche Druckeinstellung des Benutzers)')
  $fertig = $true
} catch { $grund = $_.Exception.Message }
if (-not $fertig -and $grund -match 'bietet|nicht installiert') { throw $grund }
if (-not $fertig) {
  # Rückfall: Druckverwaltungs-Cmdlets (fehlen auf vielen Clients)
  $h = @{}
  switch ($e) { 'Beidseitig' { $h.DuplexingMode = 'TwoSidedLongEdge' } 'Beidseitig kurze Kante' { $h.DuplexingMode = 'TwoSidedShortEdge' } 'Einseitig' { $h.DuplexingMode = 'OneSided' } 'Farbe' { $h.Color = $true } 'Schwarzweiß' { $h.Color = $false } 'A4' { $h.PaperSize = 'A4' } 'A3' { $h.PaperSize = 'A3' } }
  if (-not $h.Count -or -not (Get-Command Set-PrintConfiguration -EA SilentlyContinue)) { throw ('Einstellung ließ sich nicht setzen: ' + $grund) }
  $vor = $null; try { $vor = Get-PrintConfiguration -PrinterName $name -EA Stop } catch {}
  Set-PrintConfiguration -PrinterName $name @h -EA Stop
  $nach = Get-PrintConfiguration -PrinterName $name -EA SilentlyContinue
  Zeile ($name + ': ' + $e + ' gesetzt (Druckverwaltung) — vorher Duplex ' + $(if ($vor) { $vor.DuplexingMode } else { '?' }) + ', Farbe ' + $(if ($vor) { $vor.Color } else { '?' }) + ', Papier ' + $(if ($vor) { $vor.PaperSize } else { '?' }) + ' → jetzt Duplex ' + $nach.DuplexingMode + ', Farbe ' + $nach.Color + ', Papier ' + $nach.PaperSize)
}
Zeile 'Gilt für neue Ausdrucke; bereits geöffnete Programme übernehmen es teils erst nach dem Neustart des Programms.'` }),
  A({ id: 'dr-standard-rechte', titel: 'Standarddrucker-Einstellung im Benutzerprofil reparieren (0x00000709)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Repariert den Registry-Schlüssel, in dem Windows den Standarddrucker des Benutzers speichert: fehlende Schreibrechte bzw. Verweigern-Regeln (Fehler 0x00000709), veralteter Eintrag eines nicht mehr vorhandenen Druckers, „Windows verwaltet Standarddrucker“ aus. Mit Druckername wird er direkt als Standard eingetragen. Zeigt den alten Wert.',
    param: { label: 'Neuer Standarddrucker (optional)', platzhalter: 'z. B. PMD634' },
    ps: String.raw`
NeedHive
$k = $uHive + '\Software\Microsoft\Windows NT\CurrentVersion\Windows'
$ziel = $P.Trim()
if ($ziel -and $ziel -notmatch '^[\w .,()#&+\\-]{2,120}$') { throw ('Ungültiger Druckername: ' + $ziel) }
if (-not (Test-Path $k)) { throw 'Der Schlüssel „Windows NT\CurrentVersion\Windows“ fehlt im Profil des Benutzers.' }
$v = Get-ItemProperty $k -EA SilentlyContinue
$altDev = [string]$v.Device; $altLeg = $v.LegacyDefaultPrinterMode
Zeile ('Vorher: Standarddrucker-Eintrag „' + $(if ($altDev) { $altDev } else { 'leer' }) + '“ · Windows verwaltet Standarddrucker: ' + $(if ($altLeg -eq 1) { 'nein' } else { 'ja' }))
# 1) Rechte des Benutzers auf den Schlüssel (nur die Zugriffsliste wird geschrieben, Besitzer bleibt)
$rk = [Microsoft.Win32.Registry]::Users.OpenSubKey($uSid + '\Software\Microsoft\Windows NT\CurrentVersion\Windows', [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree, [System.Security.AccessControl.RegistryRights]'ReadPermissions, ChangePermissions')
if (-not $rk) { throw 'Schlüssel ließ sich zum Prüfen der Rechte nicht öffnen.' }
$acl = $rk.GetAccessControl()
$wer = @($uSid, 'S-1-1-0', 'S-1-5-11', 'S-1-5-4')
$regeln = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]) | Where-Object { $wer -contains $_.IdentityReference.Value })
$deny = @($regeln | Where-Object { [string]$_.AccessControlType -eq 'Deny' -and (([int]$_.RegistryRights -band 6) -ne 0) })
$darf = @($regeln | Where-Object { [string]$_.AccessControlType -eq 'Allow' -and (([int]$_.RegistryRights -band 2) -ne 0) })
$geaendert = $false
foreach ($r in $deny) { if ($r.IsInherited) { Zeile ('Geerbte Verweigern-Regel (' + $r.IdentityReference.Value + ') — lässt sich hier nicht entfernen.') } else { [void]$acl.RemoveAccessRuleSpecific($r); $geaendert = $true; Zeile ('Verweigern-Regel entfernt: ' + $r.IdentityReference.Value + ' · ' + $r.RegistryRights) } }
if (-not $darf.Count) {
  $sid = New-Object System.Security.Principal.SecurityIdentifier($uSid)
  $acl.AddAccessRule((New-Object System.Security.AccessControl.RegistryAccessRule($sid, [System.Security.AccessControl.RegistryRights]::FullControl, [System.Security.AccessControl.InheritanceFlags]::ContainerInherit, [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow)))
  $geaendert = $true
  Zeile 'Rechte: Der Benutzer hatte keine Schreibrechte → Vollzugriff für ihn eingetragen.'
}
if ($geaendert) { $rk.SetAccessControl($acl) } else { Zeile 'Rechte: in Ordnung (der Benutzer darf den Standarddrucker speichern).' }
$rk.Close()
# 2) Eintrag prüfen: gibt es den bisherigen Standarddrucker noch?
$dk = $uHive + '\Software\Microsoft\Windows NT\CurrentVersion\Devices'
$devs = Get-ItemProperty $dk -EA SilentlyContinue
$namen = @(); if ($devs) { $namen = @($devs.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS(Path|ParentPath|ChildName|Drive|Provider)$' } | ForEach-Object { $_.Name }) }
$altName = ($altDev -split ',')[0]
if ($altName -and $namen.Count -and $namen -notcontains $altName) { Zeile ('Achtung: Der eingetragene Standarddrucker „' + $altName + '“ ist beim Benutzer nicht mehr installiert (veralteter Eintrag).') }
# 3) Windows soll den Standarddrucker nicht mehr selbst wechseln
Set-ItemProperty -Path $k -Name LegacyDefaultPrinterMode -Value 1 -Type DWord
Zeile ('Windows verwaltet Standarddrucker: ' + $(if ($altLeg -eq 1) { 'war schon aus' } else { 'ja → jetzt aus' }))
# 4) Optional: neuen Standarddrucker direkt eintragen
if ($ziel) {
  # Kandidaten: Drucker im Profil des Benutzers + lokale Drucker des PCs (SEAL-Warteschlangen sind lokal)
  $lokal = @(Get-WmiObject Win32_Printer -EA SilentlyContinue | Where-Object { -not $_.Network } | ForEach-Object { [string]$_.Name })
  $kand = @($namen + $lokal | Select-Object -Unique)
  $t = @($kand | Where-Object { $_ -ieq $ziel -or $_ -like ('*\' + $ziel) })
  if (-not $t.Count) { $t = @($kand | Where-Object { $_ -like ('*' + $ziel + '*') }) }
  if ($t.Count -ne 1) { throw ('Drucker „' + $ziel + '“ ' + $(if ($t.Count) { 'nicht eindeutig: ' + ($t -join ', ') } else { 'ist beim Benutzer nicht installiert. Vorhanden: ' + ($kand -join ', ') })) }
  $port = ''; if ($devs -and $devs.PSObject.Properties[$t[0]]) { $port = [string]$devs.PSObject.Properties[$t[0]].Value }
  if (-not $port) { $port = 'winspool,Ne00:' }
  $neuDev = $t[0] + ',' + $port
  Set-ItemProperty -Path $k -Name Device -Value $neuDev -Type String
  Zeile ('Standarddrucker-Eintrag: „' + $(if ($altDev) { $altDev } else { 'leer' }) + '“ → „' + $neuDev + '“')
} else { Zeile 'Kein Druckername angegeben — jetzt „Standarddrucker festlegen“ ausführen.' }` }),
  A({ id: 'dr-auto-einrichtung-aus', titel: 'Automatische Einrichtung von Netzwerkgeräten abschalten (WSD)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Schaltet „Automatische Einrichtung von Geräten, die mit dem Netzwerk verbunden sind“ ab — Windows installiert dann im Home Office/Hotel keine fremden Drucker, Fernseher oder NAS mehr von selbst. Schon installierte fremde Drucker bleiben (dafür „Drucker entfernen“).',
    ps: String.raw`
$k = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\NcdAutoSetup\Private'
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
$alt = (Get-ItemProperty $k -Name AutoSetup -EA SilentlyContinue).AutoSetup
Set-ItemProperty -Path $k -Name AutoSetup -Value 0 -Type DWord
Zeile ('Automatische Geräteeinrichtung (private Netze): vorher ' + $(if ($null -eq $alt) { 'nicht gesetzt (= an)' } elseif ($alt -eq 0) { 'aus' } else { 'an' }) + ' → jetzt aus')
$s = Get-Service -Name NcdAutoSetup -EA SilentlyContinue
if ($s -and $s.Status -eq 'Running') { Stop-Service -Name NcdAutoSetup -Force -EA SilentlyContinue; Zeile 'Dienst „Automatische Einrichtung von Geräten“ angehalten.' }
$wsd = @(Get-WmiObject Win32_Printer -EA SilentlyContinue | Where-Object { [string]$_.PortName -like 'WSD-*' } | ForEach-Object { [string]$_.Name })
Zeile ('Per WSD automatisch eingerichtete Drucker: ' + $(if ($wsd.Count) { ($wsd -join ', ') + ' — bei Bedarf mit „Drucker entfernen“ löschen' } else { 'keine' }))` }),
  A({ id: 'dr-spooler-reparieren', titel: 'Druckwarteschlange reparieren (Starttyp + Neustart nach Absturz)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Stellt den Druckspooler auf „Automatisch“, richtet „nach Absturz automatisch neu starten“ ein und startet ihn. Behebt „Spooler wird nicht ausgeführt“, Fehler 1058/0x000006BA und Spooler, die nach einem Absturz aus bleiben. Aufträge bleiben erhalten.',
    ps: String.raw`
$s = Get-Service -Name Spooler -EA Stop
$altTyp = [string]$s.StartType; $altSt = [string]$s.Status
if ($altTyp -ne 'Automatic') { Set-Service -Name Spooler -StartupType Automatic -EA Stop }
if ($altTyp -eq 'Disabled') { Zeile 'Hinweis: Der Spooler war deaktiviert — kommt das wieder, setzt es eine Richtlinie (DXC).' }
$vorher = (& sc.exe qfailure Spooler 2>&1 | Out-String)
$hatte = $vorher -match 'RESTART|NEU STARTEN'
& sc.exe failure Spooler reset= 86400 actions= restart/5000/restart/10000/restart/30000 2>&1 | Out-Null
$code = $LASTEXITCODE
if ((Get-Service -Name Spooler).Status -ne 'Running') { Start-Service -Name Spooler -EA Stop; Start-Sleep -Seconds 2 }
$n = Get-Service -Name Spooler
Zeile ('Druckwarteschlange: Starttyp ' + $altTyp + ' → ' + $n.StartType + ' · Status ' + $altSt + ' → ' + $n.Status)
Zeile ('Nach Absturz neu starten: vorher ' + $(if ($hatte) { 'eingestellt' } else { 'nicht eingestellt' }) + ' → ' + $(if ($code -eq 0) { 'jetzt 3× (nach 5 s, 10 s, 30 s)' } else { 'konnte nicht gesetzt werden (Code ' + $code + ')' }))
$f = @(Get-ChildItem 'C:\Windows\System32\spool\PRINTERS' -File -EA SilentlyContinue)
if ($f.Count) { Zeile ('' + $f.Count + ' Auftragsdateien im Spool-Ordner (stürzt er wieder ab, „Druckwarteschlange leeren“).') }` }),
  A({ id: 'dr-auftraege-loeschen', titel: 'Druckaufträge eines Druckers löschen', modus: 'system', risiko: 'kritisch',
    beschreibung: 'Zeigt und löscht nur die Aufträge des angegebenen Druckers (auch Aufträge anderer Benutzer an einem gemeinsam genutzten PC). Die Aufträge der anderen Drucker und der Spooler bleiben unberührt.',
    param: { label: 'Druckername', platzhalter: 'z. B. PMD634', pflicht: true },
    ps: DRUCKER_PS + String.raw`
$n = ($P.Trim().TrimEnd('\') -replace '^.*\\', '').Trim()
if ($n -notmatch '^[A-Za-z0-9][\w .,()#&+-]{1,100}$') { throw ('Ungültiger Druckername: ' + $P) }
$dr = @(DruckerSuche $n)
Zeile ('Drucker auf dem PC: ' + $(if ($dr.Count) { (($dr | ForEach-Object { $_.Name + ' (' + $_.Status + ')' }) -join ', ') } else { $n + ' ist hier nicht als lokaler Drucker installiert (Verbindung des Benutzers?)' }))
$alle = @(); try { $alle = @(Get-WmiObject Win32_PrintJob -EA Stop) } catch { throw ('Druckaufträge nicht lesbar: ' + $_.Exception.Message) }
$j = @($alle | Where-Object { ((([string]$_.Name) -split ',')[0] -replace '^.*\\', '').Trim() -ieq $n })
Zeile ('' + $alle.Count + ' Aufträge auf dem PC, davon ' + $j.Count + ' für ' + $n)
if (-not $j.Count) { Zeile ('Für ' + $n + ' wartet nichts — nichts gelöscht.') } else {
  foreach ($x in $j) { $d = [string]$x.Document; $o = [string]$x.Owner; $st = [string]$x.JobStatus; try { [void]$x.Delete(); Zeile ('Gelöscht: „' + $d + '“ von ' + $o + $(if ($st) { ' (' + $st + ')' } else { '' })) } catch { Zeile ('Nicht löschbar: „' + $d + '“ — ' + $_.Exception.Message) } }
  Start-Sleep -Seconds 2
  $rest = @(Get-WmiObject Win32_PrintJob -EA SilentlyContinue | Where-Object { ((([string]$_.Name) -split ',')[0] -replace '^.*\\', '').Trim() -ieq $n })
  Zeile ('Jetzt noch ' + $rest.Count + ' Aufträge für ' + $n + $(if ($rest.Count) { ' — hängen fest: „Druckwarteschlange leeren + Spooler neu starten“' } else { '' }))
}` }),

  // ══ Scannen ═════════════════════════════════════════════════════════════════
  A({ id: 'scan-wia-neustart', titel: 'Scan-Dienst (WIA) reparieren und neu starten', modus: 'system', risiko: 'aendern',
    beschreibung: 'Schaltet einen deaktivierten Dienst „Windows-Bilderfassung“ (stisvc) wieder ein, startet ihn neu und listet die erkannten Scanner. Hilft bei „Kein Scanner gefunden“, „Scanner ist beschäftigt“ (0x80210006) und hängenden Scan-Programmen.',
    ps: String.raw`
$s = Get-Service -Name stisvc -EA SilentlyContinue
if (-not $s) { throw 'Der Dienst „Windows-Bilderfassung“ (stisvc) fehlt auf diesem PC.' }
$altTyp = [string]$s.StartType; $altSt = [string]$s.Status
if ($altTyp -eq 'Disabled') { Set-Service -Name stisvc -StartupType Automatic -EA Stop }
Restart-Service -Name stisvc -Force -EA Stop
Start-Sleep -Seconds 2
$n = Get-Service -Name stisvc
Zeile ('Windows-Bilderfassung (WIA): Status ' + $altSt + ' → ' + $n.Status + ' · Starttyp ' + $altTyp + ' → ' + $n.StartType)
$hw = Get-Service -Name ShellHWDetection -EA SilentlyContinue
if ($hw -and $hw.Status -ne 'Running') { try { Start-Service -Name ShellHWDetection -EA Stop; Zeile 'Shellhardwareerkennung war aus → gestartet.' } catch {} }
$g = @(Get-PnpDevice -PresentOnly -Class Image -EA SilentlyContinue)
if ($g.Count) { foreach ($x in $g) { Zeile ('Scanner/Bildgerät: ' + $x.FriendlyName + ' · ' + $x.Status) } } else { Zeile 'Kein Scanner erkannt — USB-Kabel, Strom bzw. Netzwerkverbindung des Geräts prüfen.' }` }),

  // ══ Hardware & Geräte ═══════════════════════════════════════════════════════
  A({ id: 'hw-numlock-an', titel: 'NumLock beim Start einschalten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Setzt InitialKeyboardIndicators im Profil des Benutzers und für den Anmeldebildschirm, damit der Ziffernblock nach dem Start und bei der PIN-Eingabe gleich funktioniert. Wirkt ab der nächsten Anmeldung bzw. dem nächsten Neustart.',
    ps: String.raw`
NeedHive
$ziele = @(@{ k = ($uHive + '\Control Panel\Keyboard'); n = 'Benutzer' }, @{ k = 'Registry::HKEY_USERS\.DEFAULT\Control Panel\Keyboard'; n = 'Anmeldebildschirm' })
foreach ($z in $ziele) {
  if (-not (Test-Path $z.k)) { New-Item -Path $z.k -Force | Out-Null }
  $alt = [string](Get-ItemProperty $z.k -Name InitialKeyboardIndicators -EA SilentlyContinue).InitialKeyboardIndicators
  $zahl = [int64]0; [void][int64]::TryParse($alt, [ref]$zahl)
  if ($zahl -band 2) { Zeile ($z.n + ': NumLock war schon an (' + $alt + ')') } else {
    $neu = [string]($zahl -bor 2)
    Set-ItemProperty -Path $z.k -Name InitialKeyboardIndicators -Value $neu -Type String
    Zeile ($z.n + ': InitialKeyboardIndicators ' + $(if ($alt) { $alt } else { 'leer' }) + ' → ' + $neu + ' (NumLock beim Start an)')
  }
}
Zeile 'Wirkt ab der nächsten Anmeldung; mit Schnellstart erst nach „Neu starten“ (nicht Herunterfahren).'` }),
  A({ id: 'hw-touchpad', titel: 'Touchpad-Einstellung des Benutzers setzen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Precision-Touchpad: einschalten, bei angeschlossener Maus aus- bzw. anlassen, Empfindlichkeit (gegen Klicks mit dem Handballen) oder „Tippen zum Klicken“. Zeigt alten und neuen Wert; wirkt spätestens nach Ab- und Anmeldung.',
    param: { label: 'Einstellung', platzhalter: 'Einschalten', pflicht: true, optionen: TOUCHPAD },
    ps: String.raw`
NeedHive
$e = $P.Trim()
$k = $uHive + '\Software\Microsoft\Windows\CurrentVersion\PrecisionTouchPad'
$ks = $k; $n = ''; $w = 0
switch ($e) {
  'Einschalten' { $ks = $k + '\Status'; $n = 'Enabled'; $w = 1 }
  'Bei Maus ausschalten' { $n = 'LeaveOnWithMouse'; $w = 0 }
  'Bei Maus anlassen' { $n = 'LeaveOnWithMouse'; $w = 1 }
  'Empfindlichkeit niedrig' { $n = 'AAPThreshold'; $w = 3 }
  'Empfindlichkeit mittel' { $n = 'AAPThreshold'; $w = 2 }
  'Tippen zum Klicken aus' { $n = 'TapsEnabled'; $w = 0 }
  'Tippen zum Klicken an' { $n = 'TapsEnabled'; $w = 1 }
  default { throw ('Einstellung nicht erlaubt: ' + $e) }
}
$tp = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { $_.FriendlyName -match 'touch ?pad|Touchpad' })
if (-not $tp.Count) { Zeile 'Hinweis: Kein Touchpad erkannt (Desktop-PC oder Treiber fehlt) — Einstellung wird trotzdem gespeichert.' }
if (-not (Test-Path $ks)) { New-Item -Path $ks -Force | Out-Null }
$alt = (Get-ItemProperty $ks -Name $n -EA SilentlyContinue).$n
if ($n -ne 'AAPThreshold' -and $w -eq 1 -and ($alt -eq -1 -or $alt -eq 4294967295)) { $w = -1 }
Set-ItemProperty -Path $ks -Name $n -Value $w -Type DWord
$wort = { param($x) if ($null -eq $x) { 'nicht gesetzt' } elseif ($n -eq 'AAPThreshold') { switch ([int]$x) { 0 { 'höchste' } 1 { 'hoch' } 2 { 'mittel' } 3 { 'niedrig' } default { [string]$x } } } elseif ([int64]$x -ne 0) { 'an' } else { 'aus' } }
Zeile ('Touchpad ' + $n + ': vorher ' + (& $wort $alt) + ' → jetzt ' + (& $wort $w) + ' (' + $e + ')')
Zeile 'Wirkt spätestens nach Ab- und Anmeldung. Ältere Synaptics-/ELAN-Treiber haben eigene Einstellungen.'` }),
  A({ id: 'hw-eingabehilfen-aus', titel: 'Filter-, Einrast-, Umschalt-Töne und Tastaturmaus abschalten', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Schaltet für den Benutzer sofort Anschlagverzögerung (Filtertasten), Einrastfunktion, Töne für Feststell-/NumLock-Taste und Tastaturmaus (Ziffernblock bewegt den Zeiger) samt deren Tastenkürzeln ab — Tasten werden nicht mehr verschluckt bzw. hängen nicht. Zeigt den vorherigen Zustand.',
    ps: String.raw`
$cs = @'
using System;
using System.Runtime.InteropServices;
public static class PaEingabe {
  [StructLayout(LayoutKind.Sequential)] public struct FK { public uint cbSize; public uint dwFlags; public uint iWaitMSec; public uint iDelayMSec; public uint iRepeatMSec; public uint iBounceMSec; }
  [StructLayout(LayoutKind.Sequential)] public struct SK { public uint cbSize; public uint dwFlags; }
  [StructLayout(LayoutKind.Sequential)] public struct MK { public uint cbSize; public uint dwFlags; public uint iMaxSpeed; public uint iTimeToMaxSpeed; public uint iCtrlSpeed; public uint dwReserved1; public uint dwReserved2; }
  [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW")] static extern bool SpiFk(uint a, uint b, ref FK c, uint d);
  [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW")] static extern bool SpiSk(uint a, uint b, ref SK c, uint d);
  [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW")] static extern bool SpiMk(uint a, uint b, ref MK c, uint d);
  public static long Filter(bool aus) { FK f = new FK(); f.cbSize = (uint)Marshal.SizeOf(typeof(FK)); if (!SpiFk(0x32, f.cbSize, ref f, 0)) return -1; uint alt = f.dwFlags; if (aus) { f.dwFlags &= ~(uint)5; if (!SpiFk(0x33, f.cbSize, ref f, 3)) return -2; } return alt; }
  public static long Einfach(uint lies, uint setz, bool aus) { SK s = new SK(); s.cbSize = (uint)Marshal.SizeOf(typeof(SK)); if (!SpiSk(lies, s.cbSize, ref s, 0)) return -1; uint alt = s.dwFlags; if (aus) { s.dwFlags &= ~(uint)5; if (!SpiSk(setz, s.cbSize, ref s, 3)) return -2; } return alt; }
  public static long Maus(bool aus) { MK m = new MK(); m.cbSize = (uint)Marshal.SizeOf(typeof(MK)); if (!SpiMk(0x36, m.cbSize, ref m, 0)) return -1; uint alt = m.dwFlags; if (aus) { m.dwFlags &= ~(uint)5; if (!SpiMk(0x37, m.cbSize, ref m, 3)) return -2; } return alt; }
}
'@
$sofort = $false
try { Add-Type -TypeDefinition $cs -EA Stop; $sofort = $true } catch { Zeile ('Sofort-Umschaltung nicht möglich (' + $_.Exception.Message + ') — stelle die Registry um, wirkt nach Ab-/Anmeldung.') }
if ($sofort) {
  $r = [ordered]@{}
  $r['Anschlagverzögerung (Filtertasten)'] = [PaEingabe]::Filter($true)
  $r['Einrastfunktion'] = [PaEingabe]::Einfach(0x3A, 0x3B, $true)
  $r['Töne für Feststell-/NumLock-Taste'] = [PaEingabe]::Einfach(0x34, 0x35, $true)
  $r['Tastaturmaus (Ziffernblock bewegt den Zeiger)'] = [PaEingabe]::Maus($true)
  foreach ($n in $r.Keys) { $a = [long]$r[$n]; if ($a -lt 0) { Zeile ($n + ': nicht änderbar (Code ' + $a + ')') } else { Zeile ($n + ': vorher ' + $(if ($a -band 1) { 'AN' } else { 'aus' }) + ', Tastenkürzel ' + $(if ($a -band 4) { 'an' } else { 'aus' }) + ' → jetzt aus, Tastenkürzel aus') } }
} else {
  foreach ($x in @(@('Keyboard Response', 'Anschlagverzögerung'), @('StickyKeys', 'Einrastfunktion'), @('ToggleKeys', 'Töne für Feststelltaste'), @('MouseKeys', 'Tastaturmaus'))) {
    $k = 'HKCU:\Control Panel\Accessibility\' + $x[0]
    if (-not (Test-Path $k)) { Zeile ($x[1] + ': kein Eintrag (Standard)'); continue }
    $alt = [string](Get-ItemProperty $k -Name Flags -EA SilentlyContinue).Flags
    $zahl = 0; [void][int]::TryParse($alt, [ref]$zahl)
    $neu = [string]($zahl -band (-bnot 5))
    Set-ItemProperty -Path $k -Name Flags -Value $neu -Type String
    Zeile ($x[1] + ': Flags ' + $alt + ' → ' + $neu + ' (wirkt nach Ab-/Anmeldung)')
  }
}` }),
  A({ id: 'hw-maus-zuruecksetzen', titel: 'Maus-Einstellung des Benutzers zurücksetzen', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Setzt sofort zurück: vertauschte Maustasten (Linkshänder-Einstellung), Zeigergeschwindigkeit, Doppelklick-Geschwindigkeit, KlickEinrasten (Maus „hält“ den Klick fest) oder Mausspur — einzeln oder alles auf Windows-Standard. Zeigt die alten Werte.',
    param: { label: 'Was zurücksetzen', platzhalter: 'Alles auf Standard', pflicht: true, optionen: MAUS },
    ps: String.raw`
$e = $P.Trim()
$erlaubt = @('Alles auf Standard', 'Tasten nicht vertauscht', 'Zeigergeschwindigkeit Standard', 'Doppelklick Standard', 'KlickEinrasten aus', 'Mausspur aus')
if ($e -notin $erlaubt) { throw ('Auswahl nicht erlaubt: ' + $e) }
$alles = $e -eq 'Alles auf Standard'
$cs = @'
using System;
using System.Runtime.InteropServices;
public static class PaMaus {
  [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW")] public static extern bool SpiInt(uint a, uint b, ref int c, uint d);
  [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW")] public static extern bool SpiPtr(uint a, uint b, IntPtr c, uint d);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern uint GetDoubleClickTime();
}
'@
$sofort = $false
try { Add-Type -TypeDefinition $cs -EA Stop; $sofort = $true } catch { Zeile ('Sofort-Umschaltung nicht möglich (' + $_.Exception.Message + ') — stelle die Registry um, wirkt nach Ab-/Anmeldung.') }
if ($sofort) {
  $sp = 0; [void][PaMaus]::SpiInt(0x70, 0, [ref]$sp, 0)
  $tr = 0; [void][PaMaus]::SpiInt(0x5E, 0, [ref]$tr, 0)
  $cl = 0; [void][PaMaus]::SpiInt(0x101E, 0, [ref]$cl, 0)
  $sw = [PaMaus]::GetSystemMetrics(23)
  $dc = [PaMaus]::GetDoubleClickTime()
  Zeile ('Vorher: Tasten vertauscht ' + (Ja ($sw -ne 0)) + ' · Doppelklick ' + $dc + ' ms · Zeigergeschwindigkeit ' + $sp + ' von 20 · Mausspur ' + $(if ($tr -gt 1) { 'an' } else { 'aus' }) + ' · KlickEinrasten ' + (Ja ($cl -ne 0)))
  $g = @()
  if ($alles -or $e -eq 'Tasten nicht vertauscht') { [void][PaMaus]::SpiPtr(0x21, 0, [IntPtr]::Zero, 3); $g += 'linke Taste = Klick' }
  if ($alles -or $e -eq 'Doppelklick Standard') { [void][PaMaus]::SpiPtr(0x20, 500, [IntPtr]::Zero, 3); $g += 'Doppelklick 500 ms' }
  if ($alles -or $e -eq 'Zeigergeschwindigkeit Standard') { [void][PaMaus]::SpiPtr(0x71, 0, [IntPtr]10, 3); $g += 'Zeigergeschwindigkeit 10' }
  if ($alles -or $e -eq 'Mausspur aus') { [void][PaMaus]::SpiPtr(0x5D, 0, [IntPtr]::Zero, 3); $g += 'Mausspur aus' }
  if ($alles -or $e -eq 'KlickEinrasten aus') { [void][PaMaus]::SpiPtr(0x101F, 0, [IntPtr]::Zero, 3); $g += 'KlickEinrasten aus' }
  $sp2 = 0; [void][PaMaus]::SpiInt(0x70, 0, [ref]$sp2, 0)
  Zeile ('Jetzt: ' + ($g -join ' · ') + ' (Tasten vertauscht ' + (Ja ([PaMaus]::GetSystemMetrics(23) -ne 0)) + ', Doppelklick ' + [PaMaus]::GetDoubleClickTime() + ' ms, Geschwindigkeit ' + $sp2 + ')')
} else {
  $k = 'HKCU:\Control Panel\Mouse'
  $v = Get-ItemProperty $k -EA SilentlyContinue
  Zeile ('Vorher: SwapMouseButtons ' + $v.SwapMouseButtons + ' · DoubleClickSpeed ' + $v.DoubleClickSpeed + ' · MouseSensitivity ' + $v.MouseSensitivity + ' · MouseTrails ' + $v.MouseTrails)
  if ($alles -or $e -eq 'Tasten nicht vertauscht') { Set-ItemProperty -Path $k -Name SwapMouseButtons -Value '0' -Type String }
  if ($alles -or $e -eq 'Doppelklick Standard') { Set-ItemProperty -Path $k -Name DoubleClickSpeed -Value '500' -Type String }
  if ($alles -or $e -eq 'Zeigergeschwindigkeit Standard') { Set-ItemProperty -Path $k -Name MouseSensitivity -Value '10' -Type String }
  if ($alles -or $e -eq 'Mausspur aus') { Set-ItemProperty -Path $k -Name MouseTrails -Value '0' -Type String }
  if ($e -eq 'KlickEinrasten aus') { Zeile 'KlickEinrasten lässt sich nur sofort umschalten — bitte unter Einstellungen → Bluetooth und Geräte → Maus → Weitere Mauseinstellungen abschalten.' }
  Zeile 'In der Registry gesetzt — wirkt nach Ab- und Anmeldung.'
}` }),
  A({ id: 'hw-bt-kopplung-entfernen', titel: 'Bluetooth-Kopplung eines Geräts entfernen', modus: 'system', risiko: 'kritisch',
    beschreibung: 'Hebt die Kopplung eines Bluetooth-Geräts (Maus, Tastatur, Headset, Presenter) auf, wenn „Entfernen“ in den Einstellungen scheitert oder ein Ersatzgerät gleichen Namens nicht koppelt. Danach muss das Gerät neu gekoppelt werden.',
    param: { label: 'Bluetooth-Gerät (Teil des Namens)', platzhalter: 'z. B. MX Keys, Jabra, Spotlight', pflicht: true },
    ps: String.raw`
$n = $P.Trim()
if ($n -notmatch '^[\w .,()&+-]{2,80}$') { throw ('Ungültiger Gerätename: ' + $P) }
$bt = @(Get-PnpDevice -EA SilentlyContinue | Where-Object { [string]$_.InstanceId -match '^(BTHENUM|BTHLE)\\DEV_[0-9A-F]{12}' })
$treffer = @($bt | Where-Object { [string]$_.FriendlyName -like ('*' + $n + '*') })
$macs = [ordered]@{}
foreach ($d in $treffer) { if ([string]$d.InstanceId -match 'DEV_([0-9A-F]{12})') { $macs[$Matches[1].ToUpper()] = [string]$d.FriendlyName } }
if (-not $macs.Count) { throw ('Kein gekoppeltes Bluetooth-Gerät zu „' + $n + '“. Gekoppelt: ' + $(if ($bt.Count) { (($bt | ForEach-Object { $_.FriendlyName } | Sort-Object -Unique) -join ', ') } else { 'keine' })) }
if ($macs.Count -gt 2) { throw ('Zu viele Treffer (' + $macs.Count + ') — bitte genauer angeben: ' + (@($macs.Values) -join ', ')) }
$cs = @'
using System;
using System.Runtime.InteropServices;
public static class PaBt { [DllImport("BluetoothApis.dll", SetLastError = true)] public static extern uint BluetoothRemoveDevice(ref ulong adresse); }
'@
Add-Type -TypeDefinition $cs -EA Stop
foreach ($m in @($macs.Keys)) {
  [uint64]$adr = [Convert]::ToUInt64($m, 16)
  $r = [PaBt]::BluetoothRemoveDevice([ref]$adr)
  if ($r -eq 0) { Zeile ($macs[$m] + ' (' + $m + '): Kopplung entfernt — das Gerät jetzt in den Kopplungsmodus bringen und neu koppeln.') }
  else {
    $ids = @($treffer | Where-Object { [string]$_.InstanceId -match $m } | ForEach-Object { [string]$_.InstanceId })
    foreach ($i in $ids) { & pnputil.exe /remove-device $i 2>&1 | Out-Null }
    Zeile ($macs[$m] + ' (' + $m + '): Bluetooth meldet Code ' + $r + ' — Geräteeintrag entfernt (' + $ids.Count + '), danach neu koppeln.')
  }
}` }),
  A({ id: 'hw-dock-details', titel: 'Dock-Details: Firmware, Treiber, Ladeleistung', modus: 'system', risiko: 'lesen',
    beschreibung: 'Zeigt Dock-, USB-C-/Thunderbolt- und DisplayLink-Geräte mit Treiberversion und -datum, die HP-Dock-Firmware (falls der HP-Dock-Treiber sie meldet), ob und mit welcher Leistung geladen wird, die Zahl der erkannten Bildschirme und den BIOS-Stand.',
    ps: String.raw`
$d = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { [string]$_.FriendlyName -match 'Dock|Thunderbolt|USB4|DisplayLink|Billboard|USB-C|Type-C|UCSI|USB GbE|USB 3\.\d* Hub' })
if (-not $d.Count) { Zeile 'Kein Dock-/USB-C-Gerät erkannt — ist das Dock angesteckt und eingeschaltet?' }
foreach ($x in @($d | Sort-Object FriendlyName -Unique | Select-Object -First 25)) {
  $v = ''; $dt = ''
  try { $v = [string](Get-PnpDeviceProperty -InstanceId $x.InstanceId -KeyName 'DEVPKEY_Device_DriverVersion' -EA Stop).Data } catch {}
  try { $dd = (Get-PnpDeviceProperty -InstanceId $x.InstanceId -KeyName 'DEVPKEY_Device_DriverDate' -EA Stop).Data; if ($dd) { $dt = ([datetime]$dd).ToString('dd.MM.yyyy') } } catch {}
  Zeile ('' + $x.FriendlyName + ' · ' + $x.Status + $(if ($v) { ' · Treiber ' + $v } else { '' }) + $(if ($dt) { ' vom ' + $dt } else { '' }))
}
try {
  $hp = @(Get-CimInstance -Namespace 'root\HP\InstrumentedServices\v1' -ClassName HP_DockAccessory -EA Stop)
  if (-not $hp.Count) { Zeile 'HP-Dock-Firmware: kein HP-Dock gemeldet.' }
  foreach ($h in $hp) { $w = @($h.PSObject.Properties | Where-Object { $_.Name -match 'Name|Firmware|Version|Serial' -and $_.Value } | ForEach-Object { $_.Name + ' ' + $_.Value }); Zeile ('HP-Dock: ' + ($w -join ' · ')) }
} catch { Zeile 'HP-Dock-Firmware: nicht abrufbar (HP-Dock-WMI-Treiber fehlt oder kein HP-Dock) — Stand über „Treiber-Installation (HP)“ prüfen.' }
try {
  $bs = Get-CimInstance -Namespace root\wmi -ClassName BatteryStatus -EA Stop | Select-Object -First 1
  if ($bs) { Zeile ('Strom vom Netzteil/Dock: ' + (Ja ([bool]$bs.PowerOnline)) + ' · lädt: ' + (Ja ([bool]$bs.Charging)) + $(if ([double]$bs.ChargeRate -gt 0) { ' · Ladeleistung ' + [math]::Round([double]$bs.ChargeRate / 1000, 1) + ' W' } else { '' })) } else { Zeile 'Kein Akku (Desktop-PC).' }
} catch { Zeile 'Kein Akku (Desktop-PC).' }
$m = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID -EA SilentlyContinue)
Zeile ('Erkannte Bildschirme: ' + $m.Count)
$b = Get-CimInstance Win32_BIOS -EA SilentlyContinue
if ($b) { Zeile ('BIOS: ' + $b.SMBIOSBIOSVersion + $(if ($b.ReleaseDate) { ' vom ' + $b.ReleaseDate.ToString('dd.MM.yyyy') } else { '' }) + ' · Seriennummer ' + $b.SerialNumber) }` }),
]
