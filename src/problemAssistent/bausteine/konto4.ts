// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „konto“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Bereiche: Anmeldung & Konto · Sicherheit.
// Nichts hier ändert Server, AD, GPO/Intune, Lizenzen, Defender-Einstellungen, BitLocker, Firewall oder Firmware.
// konto4-registry-pol-erneuern benennt nur die LOKALE Richtlinien-Zwischendatei um (Windows schreibt sie aus den
// Domänenrichtlinien neu); konto4-datei-entsperren entfernt nur die Internet-Markierung geprüfter Dokumente.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Dateien, deren Internet-Markierung (Mark of the Web) aufgehoben werden darf: Dokumente, Hilfen, Office-Add-ins, CAD — nie Programme/Skripte/Abbilder. */
// Nur Formate ohne ausführbaren Inhalt (keine Makros/Skripte): makrofähige Office-Dateien (.xlsm, .docm, .xlam …),
// alte Office-Formate (.doc/.xls/.ppt), CHM, Access, OneNote, Publisher, RTF und Mails bleiben IMMER gesperrt —
// das Tool hebt Makro-Sperren grundsätzlich nicht auf (Haltung wie in office.ts).
const MOTW_ERLAUBT = String.raw`\.(pdf|docx|dotx|xlsx|xltx|pptx|ppsx|potx|vsdx|txt|csv|jpe?g|png|gif|bmp|tiff?|dwg|dxf|stp|step|igs|iges|sldprt|sldasm|slddrw|edrw|eprt|easm)$`

/** Sucht eine Datei des Benutzers: vollständiger Pfad oder Name in Downloads/Desktop/Dokumente/OneDrive/Outlook-Anlagen/Temp. */
const DATEI_SUCHEN = String.raw`
function DateiOrte {
  $o = @((Join-Path $uProf 'Downloads'), (Join-Path $uProf 'Desktop'), (Join-Path $uProf 'Documents'))
  foreach ($od in @(Get-ChildItem -LiteralPath $uProf -Directory -Filter 'OneDrive*' -EA SilentlyContinue)) { foreach ($u in 'Desktop', 'Dokumente', 'Documents', 'Downloads') { $o += (Join-Path $od.FullName $u) } }
  if ($uLocal) { $o += (Join-Path $uLocal 'Microsoft\Windows\INetCache\Content.Outlook'); $o += (Join-Path $uLocal 'Temp') }
  @($o | Where-Object { Test-Path -LiteralPath $_ })
}
function DateiFinden([string]$w) {
  if ($w -match '^[A-Za-z]:\\') { if (Test-Path -LiteralPath $w) { return @(Get-Item -LiteralPath $w -Force) } else { return @() } }
  if ($w -match '\\') { $p = Join-Path $uProf $w.TrimStart('\'); if (Test-Path -LiteralPath $p) { return @(Get-Item -LiteralPath $p -Force) } }
  $leaf = Split-Path $w -Leaf
  $t = @()
  foreach ($r in DateiOrte) { $t += @(Get-ChildItem -LiteralPath $r -Filter $leaf -Recurse -Depth 3 -Force -EA SilentlyContinue) }
  @($t | Sort-Object LastWriteTime -Descending)
}
`

export const AKTIONEN_KONTO4: PaAktion[] = [
  // ══ Anmeldung & Konto ═══════════════════════════════════════════════════════
  A({ id: 'konto4-hello-tpm-status', titel: 'Windows Hello, TPM, Biometrie und Gerätesicherheit prüfen', modus: 'system', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'TPM-Zustand (bereit, nach Fehlversuchen gesperrt, Hersteller/Firmware), Credential Guard und Speicherintegrität, Entra-Gerätestatus (Join, Geräte-Authentifizierung, TPM-Schutz), Windows-Hello-Richtlinien (PIN-Regeln, Biometrie erlaubt, Sicherheitschip Pflicht), Erweiterte Anmeldesicherheit, Biometriedienst und Sensoren (Gesicht/Fingerabdruck), Benutzer mit eingerichteter PIN und Hello-Fehler der letzten 7 Tage. Ändert nichts.',
    ps: String.raw`
try {
  $t = Get-Tpm -EA Stop
  Zeile ('TPM: vorhanden ' + (Ja ([bool]$t.TpmPresent)) + ' · bereit ' + (Ja ([bool]$t.TpmReady)) + ' · aktiviert ' + (Ja ([bool]$t.TpmEnabled)) + ' · gesperrt nach Fehlversuchen ' + (Ja ([bool]$t.LockedOut)) + $(if ($t.LockedOut -and $t.LockoutHealTime) { ' (löst sich nach ' + [string]$t.LockoutHealTime + ')' } else { '' }) + ' · Hersteller ' + [string]$t.ManufacturerIdTxt + ' ' + [string]$t.ManufacturerVersion)
  if ($t.RestartPending) { Zeile 'TPM: Ein Neustart steht aus, damit TPM-Änderungen wirksam werden.' }
} catch { Zeile ('TPM: nicht lesbar (' + $_.Exception.Message + ')') }
try { $w = Get-CimInstance -Namespace 'root/cimv2/Security/MicrosoftTpm' -ClassName Win32_Tpm -EA Stop; if ($w) { Zeile ('TPM-Spezifikation: ' + ([string]$w.SpecVersion -split ',')[0]) } } catch {}
try {
  $dg = Get-CimInstance -Namespace 'root/Microsoft/Windows/DeviceGuard' -ClassName Win32_DeviceGuard -EA Stop
  $lauf = @($dg.SecurityServicesRunning | ForEach-Object { [int]$_ })
  Zeile ('Virtualisierungsbasierte Sicherheit: ' + $(switch ([int]$dg.VirtualizationBasedSecurityStatus) { 0 { 'aus' } 1 { 'eingerichtet, läuft nicht' } 2 { 'läuft' } default { [string]$dg.VirtualizationBasedSecurityStatus } }) + ' · Credential Guard ' + $(if ($lauf -contains 1) { 'AN (keine gespeicherten Kennwörter für Remotedesktop)' } else { 'aus' }) + ' · Speicherintegrität ' + $(if ($lauf -contains 2) { 'AN (alte Treiber werden blockiert)' } else { 'aus' }))
} catch { Zeile 'Virtualisierungsbasierte Sicherheit: nicht lesbar' }
$ds = @(& dsregcmd.exe /status 2>&1 | ForEach-Object { [string]$_ })
$dw = @($ds | Where-Object { $_ -match '^\s*(AzureAdJoined|DomainJoined|DeviceAuthStatus|TpmProtected|DeviceCertificateValidity|KeySignTest)\s*:' } | ForEach-Object { $_.Trim() })
if ($dw.Count) { Zeile ('Entra-Gerät: ' + ($dw -join ' · ')) } else { Zeile 'Entra-Gerät: dsregcmd lieferte keinen Gerätestatus.' }
$pol = @()
foreach ($k in @('HKLM:\SOFTWARE\Policies\Microsoft\PassportForWork') + @(Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Policies\PassportForWork' -EA SilentlyContinue | ForEach-Object { $_.PSPath + '\Device\Policies' })) {
  $p = Get-ItemProperty -LiteralPath $k -EA SilentlyContinue
  if ($p) { $pol += @($p.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $_.Name + '=' + [string]$_.Value }) }
  $c = Get-ItemProperty -LiteralPath ($k + '\PINComplexity') -EA SilentlyContinue
  if ($c) { $pol += @($c.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { 'PIN.' + $_.Name + '=' + [string]$_.Value }) }
}
if ($pol.Count) { Zeile ('Hello-Richtlinien: ' + (($pol | Select-Object -Unique) -join ', ')) } else { Zeile 'Hello-Richtlinien: keine Vorgaben gefunden (Windows-Standard).' }
$bio = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Biometrics' -EA SilentlyContinue
$sysp = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -EA SilentlyContinue
Zeile ('Biometrie per Richtlinie: ' + $(if ($bio -and $null -ne $bio.Enabled) { $(if ([int]$bio.Enabled -eq 0) { 'VERBOTEN (Biometrics Enabled=0)' } else { 'erlaubt' }) } else { 'keine Vorgabe' }) + ' · einfache PIN-Anmeldung (AllowDomainPINLogon): ' + $(if ($sysp -and $null -ne $sysp.AllowDomainPINLogon) { [string]$sysp.AllowDomainPINLogon } else { 'keine Vorgabe' }))
$ess = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\SecureBiometrics' -EA SilentlyContinue
Zeile ('Erweiterte Anmeldesicherheit (ESS): ' + $(if ($ess -and [int]$ess.Enabled -eq 1) { 'AN — externe Kameras/Fingerabdruckleser werden für Windows Hello nicht angenommen' } else { 'aus bzw. nicht vorhanden' }))
$sv = Get-Service -Name WbioSrvc -EA SilentlyContinue
if ($sv) { Zeile ('Biometriedienst (WbioSrvc): ' + $sv.Status + ' · Start ' + $sv.StartType) } else { Zeile 'Biometriedienst (WbioSrvc): fehlt' }
$sen = @(); try { $sen = @(Get-PnpDevice -Class Biometric -EA Stop) } catch {}
foreach ($d in $sen) { Zeile ('Fingerabdruck/Biometrie-Sensor: ' + $d.FriendlyName + ' · ' + $d.Status) }
$ir = @(); try { $ir = @(Get-PnpDevice -Class Camera, Image -EA Stop | Where-Object { $_.FriendlyName -match '(IR|Infrarot|Infrared|Hello)' }) } catch {}
foreach ($d in $ir) { Zeile ('Gesichtserkennungs-Kamera (IR): ' + $d.FriendlyName + ' · ' + $d.Status) }
if (-not $sen.Count -and -not $ir.Count) { Zeile 'Sensoren: weder Fingerabdruckleser noch IR-Kamera erkannt (bei zugeklapptem Laptop am Dock normal).' }
$ngc = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\LogonUI\NgcPin\Credentials'
$mitPin = @(Get-ChildItem -LiteralPath $ngc -EA SilentlyContinue | ForEach-Object { $s = $_.PSChildName; try { (New-Object System.Security.Principal.SecurityIdentifier($s)).Translate([System.Security.Principal.NTAccount]).Value } catch { $s } })
Zeile ('PIN eingerichtet für: ' + $(if ($mitPin.Count) { $mitPin -join ', ' } else { 'niemanden (laut Anmeldebildschirm)' }))
$seit = (Get-Date).AddDays(-7)
foreach ($log in 'Microsoft-Windows-HelloForBusiness/Operational', 'Microsoft-Windows-Biometrics/Operational') {
  $ev = @(); try { $ev = @(Get-WinEvent -FilterHashtable @{ LogName = $log; Level = 1, 2; StartTime = $seit } -MaxEvents 100 -EA Stop) } catch {}
  $kurz = ($log -split '-')[2] -replace '/Operational', ''
  if (-not $ev.Count) { Zeile ($kurz + '-Fehler (7 Tage): keine'); continue }
  foreach ($g in @($ev | Group-Object Id | Sort-Object Count -Descending | Select-Object -First 3)) {
    $m = ([string]$g.Group[0].Message -split '\r?\n')[0]; if ($m.Length -gt 160) { $m = $m.Substring(0, 160) + '…' }
    Zeile ($kurz + '-Fehler ' + $g.Name + ': ' + $g.Count + '× · zuletzt ' + $g.Group[0].TimeCreated.ToString('dd.MM. HH:mm') + ' · ' + $m)
  }
}` }),

  A({ id: 'konto4-wam-neu-registrieren', titel: 'Microsoft-Anmeldedienst (AAD.BrokerPlugin) für den Benutzer neu registrieren', modus: 'benutzer', risiko: 'aendern', timeoutMs: 180000,
    beschreibung: 'Registriert die Windows-Bausteine der Microsoft-365-Anmeldung (Microsoft.AAD.BrokerPlugin und CloudExperienceHost) in der Sitzung des Benutzers neu — die von Microsoft empfohlene Reparatur, wenn „Auf Arbeits- oder Schulkonto zugreifen“ leer bleibt, Anmeldefenster von Office/Teams/OneDrive sofort zugehen oder der Anmeldebroker abstürzt. Konten und gespeicherte Anmeldungen bleiben erhalten; Office und Teams danach neu starten.',
    ps: String.raw`
$pakete = @('Microsoft.AAD.BrokerPlugin', 'Microsoft.Windows.CloudExperienceHost')
foreach ($n in $pakete) {
  $p = @(Get-AppxPackage -Name $n -EA SilentlyContinue)
  $man = ''
  if ($p.Count) {
    $man = Join-Path ([string]$p[0].InstallLocation) 'AppxManifest.xml'
    Zeile ('vorher: ' + $n + ' ' + [string]$p[0].Version + ' · Status ' + [string]$p[0].Status)
  } else {
    $dir = @(Get-ChildItem -LiteralPath (Join-Path $env:windir 'SystemApps') -Directory -EA SilentlyContinue | Where-Object { $_.Name -like ($n + '_*') } | Select-Object -First 1)
    if (-not $dir.Count) { Zeile ($n + ': weder für den Benutzer registriert noch unter SystemApps vorhanden — Windows-Reparatur (SFC/DISM) nötig.'); continue }
    $man = Join-Path $dir[0].FullName 'AppxManifest.xml'
    Zeile ('vorher: ' + $n + ' · für diesen Benutzer NICHT registriert')
  }
  if (-not (Test-Path -LiteralPath $man)) { Zeile ($n + ': Manifest fehlt (' + $man + ') — nicht neu registriert.'); continue }
  try {
    Add-AppxPackage -Register $man -DisableDevelopmentMode -ForceApplicationShutdown -EA Stop
    $q = @(Get-AppxPackage -Name $n -EA SilentlyContinue)
    Zeile ('jetzt: ' + $n + ' ' + $(if ($q.Count) { [string]$q[0].Version + ' · Status ' + [string]$q[0].Status } else { 'nicht sichtbar' }) + ' — neu registriert')
  } catch { Zeile ($n + ': Neuregistrierung fehlgeschlagen — ' + $_.Exception.Message) }
}
Zeile 'Bitte Office, Teams und OneDrive einmal beenden und neu starten; die Konten unter Einstellungen → Konten → „Auf Arbeits- oder Schulkonto zugreifen“ prüfen.'` }),

  A({ id: 'konto4-registry-pol-erneuern', titel: 'Beschädigte lokale Richtliniendatei (Registry.pol) erneuern und Richtlinien neu anwenden', modus: 'system', risiko: 'aendern', timeoutMs: 240000,
    beschreibung: 'Gegen Gruppenrichtlinien-Fehler 1096 („Registry.pol konnte nicht gelesen werden“) und Richtlinien, die seitdem nicht mehr ankommen (auch Softwarecenter/Updates): Prüft die lokale Zwischendatei Registry.pol (Computer und Benutzer) auf die gültige Kennung „PReg“, benennt eine beschädigte Datei um (Sicherung *.alt_…) — auf Wunsch auch eine gültige — und wendet die Computerrichtlinien neu an. Windows schreibt die Datei aus den Domänenrichtlinien neu; an den Richtlinien selbst ändert sich nichts.',
    param: { label: 'Wann umbenennen', platzhalter: 'Nur wenn beschädigt', optionen: ['Nur wenn beschädigt', 'Auch wenn gültig'] },
    ps: String.raw`
$modus = ([string]$P).Trim()
if ($modus -and @('Nur wenn beschädigt', 'Auch wenn gültig') -notcontains $modus) { throw ('Unbekannte Auswahl „' + $modus + '“ — erlaubt: Nur wenn beschädigt | Auch wenn gültig.') }
$immer = ($modus -eq 'Auch wenn gültig')
$ev = @(); try { $ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-GroupPolicy'; Id = 1096; StartTime = (Get-Date).AddDays(-14) } -MaxEvents 20 -EA Stop) } catch {}
Zeile ('Ereignis 1096 (Registry.pol nicht lesbar) in 14 Tagen: ' + $ev.Count + $(if ($ev.Count) { ' · zuletzt ' + $ev[0].TimeCreated.ToString('dd.MM. HH:mm') } else { '' }))
$gp = Join-Path $env:windir 'System32\GroupPolicy'
$umbenannt = 0
foreach ($teil in 'Machine', 'User') {
  $f = Join-Path $gp ($teil + '\Registry.pol')
  if (-not (Test-Path -LiteralPath $f)) { Zeile ('vorher: ' + $teil + '\Registry.pol nicht vorhanden'); continue }
  $i = Get-Item -LiteralPath $f -Force
  $kopf = ''
  try { $fs = [System.IO.File]::Open($f, 'Open', 'Read', 'ReadWrite'); $b = New-Object byte[] 8; $n = $fs.Read($b, 0, 8); $fs.Close(); if ($n -ge 4) { $kopf = [Text.Encoding]::ASCII.GetString($b, 0, 4) } } catch { $kopf = '?' }
  $gut = ($kopf -eq 'PReg') -and ($i.Length -ge 8)
  Zeile ('vorher: ' + $teil + '\Registry.pol · ' + $i.Length + ' Byte · geändert ' + $i.LastWriteTime.ToString('dd.MM.yyyy HH:mm') + ' · ' + $(if ($gut) { 'gültig (PReg)' } else { 'BESCHÄDIGT (Kennung „' + ($kopf -replace '[^\x20-\x7E]', '?') + '“)' }))
  if ((-not $gut) -or ($immer -and $teil -eq 'Machine')) { if (RenameAlt $f ($teil + '\Registry.pol')) { $umbenannt++ } }
}
if (-not $umbenannt) { Zeile 'Keine Datei umbenannt — die Richtlinien werden trotzdem neu angewendet.' }
$o = @(& gpupdate.exe /target:computer /force /wait:150 2>&1 | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
foreach ($z in @($o | Select-Object -Last 3)) { Zeile ('gpupdate: ' + $z) }
$f = Join-Path $gp 'Machine\Registry.pol'
if (Test-Path -LiteralPath $f) { $i = Get-Item -LiteralPath $f -Force; Zeile ('jetzt: Machine\Registry.pol · ' + $i.Length + ' Byte · geschrieben ' + $i.LastWriteTime.ToString('dd.MM.yyyy HH:mm')) } else { Zeile 'jetzt: Machine\Registry.pol (noch) nicht neu geschrieben — enthalten die Computerrichtlinien keine Registry-Werte, ist das normal.' }` }),

  // ══ Sicherheit ══════════════════════════════════════════════════════════════
  A({ id: 'konto4-fremdzugriff-pruefen', titel: 'Fremdzugriff prüfen: Fernwartung, Cloud-Speicher, Konten, Freigaben, Autostarts', modus: 'system', risiko: 'lesen', timeoutMs: 240000,
    beschreibung: 'Sicherheits-Blick auf den PC: installierte, heruntergeladene und laufende Fernwartungsprogramme (AnyDesk, TeamViewer, ScreenConnect, RustDesk, Schnellhilfe …) mit aktiven Verbindungen, private Cloud-Speicher (Dropbox, Google Drive …), lokale Konten, Mitglieder von Administratoren/Remotedesktopbenutzer, Remotedesktop und Benutzerkontensteuerung, gekoppelte Bluetooth-Geräte, eigene Datei-Freigaben, Autostarts/Aufgaben/Dienste ohne gültige Signatur oder aus Benutzerordnern sowie Programme der letzten 14 Tage. Ändert nichts.',
    ps: String.raw`
$muster = 'AnyDesk|TeamViewer|ScreenConnect|ConnectWise Control|RustDesk|Splashtop|LogMeIn|GoTo ?Assist|GoToMyPC|Ammyy|UltraViewer|Supremo|NetSupport|Atera|Kaseya|NinjaRMM|N-able|DameWare|RealVNC|TightVNC|UltraVNC|VNC Server|Chrome Remote Desktop|AeroAdmin|Zoho Assist|RemotePC|Remote Utilities|SimpleHelp|Getscreen|HopToDesk|DWAgent|MeshAgent|Tactical RMM'
$cloud = 'Dropbox|Google Drive|iCloud|MEGAsync|MEGA Desktop|pCloud|Box Drive|Box Sync|Nextcloud|ownCloud|Tresorit|IDrive|Proton Drive|Koofr|MagentaCLOUD|HiDrive'
$uninst = @()
foreach ($w in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*') { $uninst += @(Get-ItemProperty $w -EA SilentlyContinue | Where-Object { $_.DisplayName }) }
$hives = @(Get-ChildItem 'Registry::HKEY_USERS' -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^S-1-(5-21|12-1)-[\d-]+$' })
foreach ($h in $hives) { $uninst += @(Get-ItemProperty ('Registry::HKEY_USERS\' + $h.PSChildName + '\Software\Microsoft\Windows\CurrentVersion\Uninstall\*') -EA SilentlyContinue | Where-Object { $_.DisplayName }) }
$proz = @(Get-CimInstance Win32_Process -EA SilentlyContinue)
$tcp = @(); try { $tcp = @(Get-NetTCPConnection -State Established -EA Stop) } catch {}
# Fernwartung
$fw = @($uninst | Where-Object { $_.DisplayName -match $muster } | Sort-Object DisplayName -Unique)
foreach ($p in $fw) { Zeile ('Fernwartung installiert: ' + $p.DisplayName + ' ' + [string]$p.DisplayVersion + $(if ($p.InstallDate) { ' · seit ' + $p.InstallDate } else { '' })) }
$fwp = @($proz | Where-Object { ($_.Name -match '^(QuickAssist|msra|AnyDesk|TeamViewer|TeamViewer_Service|tv_w32|tv_x64|rustdesk|ScreenConnect\.ClientService|ScreenConnect\.WindowsClient|SRService|SRManager|strwinclt|g2ax_\w*|ammyy\w*|UltraViewer\w*|Supremo\w*|client32|winvnc\w*|tvnserver|vncserver|remoting_host|AteraAgent|NinjaRMMAgent|dwagent|MeshAgent|HopToDesk|AeroAdmin)\.exe$') -or ([string]$_.ExecutablePath -match $muster) })
foreach ($x in $fwp) {
  $c = @($tcp | Where-Object { $_.OwningProcess -eq $x.ProcessId } | ForEach-Object { [string]$_.RemoteAddress + ':' + $_.RemotePort } | Select-Object -Unique -First 4)
  Zeile ('Fernwartung LÄUFT: ' + $x.Name + ' (PID ' + $x.ProcessId + ', Sitzung ' + $x.SessionId + ')' + $(if ($c.Count) { ' · VERBUNDEN mit ' + ($c -join ', ') } else { ' · keine aktive Verbindung' }) + $(if ($x.ExecutablePath) { ' · ' + $x.ExecutablePath } else { '' }))
}
$dl = @(Get-ChildItem -Path 'C:\Users\*\Downloads\*' -Include '*.exe', '*.msi' -File -Force -EA SilentlyContinue | Where-Object { $_.Name -match '(?i)anydesk|teamviewer|quicksupport|rustdesk|screenconnect|connectwise|supremo|ultraviewer|splashtop|ammyy|aeroadmin|getscreen|hoptodesk|zoho.?assist|remote.?utilities' })
foreach ($d in @($dl | Sort-Object LastWriteTime -Descending | Select-Object -First 8)) { Zeile ('Fernwartung heruntergeladen: ' + $d.FullName + ' · ' + $d.LastWriteTime.ToString('dd.MM.yyyy HH:mm')) }
if (-not ($fw.Count + $fwp.Count + $dl.Count)) { Zeile 'Fernwartung: keine bekannten Fernwartungsprogramme installiert, heruntergeladen oder laufend.' }
# Private Cloud-Speicher
$cl = @($uninst | Where-Object { $_.DisplayName -match $cloud } | Sort-Object DisplayName -Unique)
foreach ($p in $cl) { Zeile ('Privater Cloud-Speicher installiert: ' + $p.DisplayName + ' ' + [string]$p.DisplayVersion) }
$clp = @($proz | Where-Object { $_.Name -match '^(Dropbox|GoogleDriveFS|googledrivesync|iCloudDrive|iCloudServices|MEGAsync|pCloud|BoxSync|Box|nextcloud|owncloud|Tresorit|IDriveWindows)\.exe$' } | ForEach-Object { $_.Name } | Select-Object -Unique)
if ($clp.Count) { Zeile ('Privater Cloud-Speicher läuft: ' + ($clp -join ', ')) }
if (-not ($cl.Count + $clp.Count)) { Zeile 'Private Cloud-Speicher: keine gefunden.' }
# Konten und Gruppen
try { foreach ($u in @(Get-LocalUser -EA Stop)) { Zeile ('Lokales Konto: ' + $u.Name + ' · ' + $(if ($u.Enabled) { 'AKTIV' } else { 'deaktiviert' }) + ' · letzte Anmeldung ' + $(if ($u.LastLogon) { $u.LastLogon.ToString('dd.MM.yyyy') } else { 'nie' }) + ' · Kennwort gesetzt ' + $(if ($u.PasswordLastSet) { $u.PasswordLastSet.ToString('dd.MM.yyyy') } else { '—' })) } } catch { Zeile ('Lokale Konten: nicht lesbar (' + $_.Exception.Message + ')') }
function GruppeMitglieder([string]$sid) {
  $name = ''; try { $name = ((New-Object System.Security.Principal.SecurityIdentifier($sid)).Translate([System.Security.Principal.NTAccount]).Value -split '\\')[-1] } catch { return @('(Gruppe auf diesem PC nicht vorhanden)') }
  try {
    $g = [ADSI]('WinNT://./' + $name + ',group')
    return @($g.psbase.Invoke('Members') | ForEach-Object { (([string]$_.GetType().InvokeMember('ADsPath', 'GetProperty', $null, $_, $null)) -replace '^WinNT://', '') -replace '/', '\' })
  } catch { return @('(nicht lesbar: ' + $_.Exception.Message + ')') }
}
Zeile ('Administratoren: ' + ((GruppeMitglieder 'S-1-5-32-544') -join ', '))
$rdu = @(GruppeMitglieder 'S-1-5-32-555')
Zeile ('Remotedesktopbenutzer: ' + $(if ($rdu.Count) { $rdu -join ', ' } else { 'keine (nur Administratoren dürfen per Remotedesktop)' }))
# Remotedesktop und Benutzerkontensteuerung
$ts = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' -EA SilentlyContinue
$tsp = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services' -EA SilentlyContinue
$rdpAn = ($ts -and [int]$ts.fDenyTSConnections -eq 0); $perPol = ($tsp -and $null -ne $tsp.fDenyTSConnections); if ($perPol) { $rdpAn = ([int]$tsp.fDenyTSConnections -eq 0) }
$nla = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' -EA SilentlyContinue).UserAuthentication
$lausch = @(); try { $lausch = @(Get-NetTCPConnection -State Listen -LocalPort 3389 -EA Stop) } catch {}
Zeile ('Remotedesktop auf diesem PC: ' + $(if ($rdpAn) { 'EINGESCHALTET' } else { 'aus' }) + $(if ($perPol) { ' (per Richtlinie)' } else { '' }) + ' · Authentifizierung auf Netzwerkebene ' + $(if ([int]$nla -eq 1) { 'an' } else { 'AUS' }) + ' · Port 3389 ' + $(if ($lausch.Count) { 'lauscht' } else { 'geschlossen' }))
$sys = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -EA SilentlyContinue
if (-not $sys -or $null -eq $sys.ConsentPromptBehaviorAdmin) { $sys = [pscustomobject]@{ EnableLUA = 1; ConsentPromptBehaviorAdmin = 5; ConsentPromptBehaviorUser = 3; PromptOnSecureDesktop = 1 } }
$ua = switch ([int]$sys.ConsentPromptBehaviorAdmin) { 0 { 'ohne Nachfrage (UNSICHER)' } 1 { 'Anmeldedaten, sicherer Desktop' } 2 { 'immer nachfragen, sicherer Desktop' } 3 { 'Anmeldedaten' } 4 { 'Zustimmung' } 5 { 'Zustimmung für Nicht-Windows-Programme (Standard)' } default { [string]$sys.ConsentPromptBehaviorAdmin } }
$uu = switch ([int]$sys.ConsentPromptBehaviorUser) { 0 { 'Anfragen werden automatisch abgelehnt' } 1 { 'Admin-Anmeldedaten, sicherer Desktop' } 3 { 'Admin-Anmeldedaten' } default { [string]$sys.ConsentPromptBehaviorUser } }
Zeile ('Benutzerkontensteuerung: ' + $(if ($sys -and $null -ne $sys.EnableLUA -and [int]$sys.EnableLUA -eq 0) { 'AUS (EnableLUA=0)' } else { 'an' }) + ' · Administratoren: ' + $ua + ' · Standardbenutzer: ' + $uu + ' · sicherer Desktop ' + $(if ($sys -and $null -ne $sys.PromptOnSecureDesktop -and [int]$sys.PromptOnSecureDesktop -eq 0) { 'aus' } else { 'an' }))
# Gekoppelte Bluetooth-Geräte
$bt = @(); try { $bt = @(Get-PnpDevice -Class Bluetooth -EA Stop | Where-Object { [string]$_.InstanceId -match 'DEV_[0-9A-F]{12}' } | ForEach-Object { [string]$_.FriendlyName } | Where-Object { $_ } | Select-Object -Unique) } catch {}
Zeile ('Gekoppelte Bluetooth-Geräte: ' + $(if ($bt.Count) { $bt -join ', ' } else { 'keine' }))
# Eigene Datei-Freigaben
$sh = @(); try { $sh = @(Get-SmbShare -EA Stop | Where-Object { -not $_.Special -and [string]$_.ShareType -eq 'FileSystemDirectory' }) } catch { Zeile ('Freigaben: nicht lesbar (' + $_.Exception.Message + ')') }
foreach ($s in $sh) {
  $acc = @(); try { $acc = @(Get-SmbShareAccess -Name $s.Name -EA Stop | ForEach-Object { [string]$_.AccountName + ' ' + [string]$_.AccessRight }) } catch {}
  Zeile ('Freigabe: ' + $s.Name + ' → ' + $s.Path + ' · ' + ($acc -join ', ') + $(if (($acc -join ' ') -match '(Jeder|Everyone|Authenti)') { ' · FÜR ALLE ERREICHBAR' } else { '' }))
}
if (-not $sh.Count) { Zeile 'Eigene Datei-Freigaben: keine (nur Standardfreigaben).' }
# Autostarts, Aufgaben, Dienste
function ExePfad([string]$cmd) {
  if (-not $cmd) { return '' }
  $c = [Environment]::ExpandEnvironmentVariables($cmd.Trim())
  if ($c.StartsWith('"')) { $e = $c.IndexOf('"', 1); if ($e -gt 1) { return $c.Substring(1, $e - 1) } }
  $m = [regex]::Match($c, '^(.+?\.(exe|com|bat|cmd|vbs|vbe|js|jse|wsf|ps1|dll|scr|hta|lnk))(\s|,|$)', 'IgnoreCase')
  if ($m.Success) { return $m.Groups[1].Value }
  return ($c -split '\s')[0]
}
$sigCache = @{}
function SigOk([string]$p) {
  if (-not $p) { return 'ohne Pfad' }
  if ($sigCache.ContainsKey($p)) { return $sigCache[$p] }
  $r = ''
  if (-not (Test-Path -LiteralPath $p)) { $r = 'DATEI FEHLT' } else { try { $s = Get-AuthenticodeSignature -LiteralPath $p -EA Stop; if ([string]$s.Status -eq 'Valid') { $r = 'OK' } else { $r = 'NICHT gültig signiert (' + [string]$s.Status + ')' } } catch { $r = 'Signatur nicht prüfbar' } }
  $sigCache[$p] = $r; return $r
}
$eintraege = @()
$runs = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run')
foreach ($h in $hives) { $runs += ('Registry::HKEY_USERS\' + $h.PSChildName + '\Software\Microsoft\Windows\CurrentVersion\Run'); $runs += ('Registry::HKEY_USERS\' + $h.PSChildName + '\Software\Microsoft\Windows\CurrentVersion\RunOnce') }
foreach ($k in $runs) { $p = Get-ItemProperty -LiteralPath $k -EA SilentlyContinue; if ($p) { foreach ($v in @($p.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' })) { $eintraege += [pscustomobject]@{ Art = 'Autostart'; Name = $v.Name; Befehl = [string]$v.Value } } } }
$sh2 = $null; try { $sh2 = New-Object -ComObject WScript.Shell } catch {}
$ordner = @('C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp') + @(Get-ChildItem 'C:\Users' -Directory -EA SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup' })
foreach ($o in $ordner) { foreach ($f in @(Get-ChildItem -LiteralPath $o -File -Force -EA SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' })) { $ziel = $f.FullName; if ($f.Extension -eq '.lnk' -and $sh2) { try { $ziel = '"' + $sh2.CreateShortcut($f.FullName).TargetPath + '" ' + $sh2.CreateShortcut($f.FullName).Arguments } catch {} }; $eintraege += [pscustomobject]@{ Art = 'Autostart-Ordner'; Name = $f.Name; Befehl = $ziel } } }
foreach ($t in @(Get-ScheduledTask -EA SilentlyContinue | Where-Object { $_.TaskPath -notlike '\Microsoft\*' -and $_.State -ne 'Disabled' })) { foreach ($a in @($t.Actions | Where-Object { $_.Execute })) { $eintraege += [pscustomobject]@{ Art = 'Aufgabe'; Name = ($t.TaskPath + $t.TaskName); Befehl = ('"' + ([string]$a.Execute).Trim('"') + '" ' + [string]$a.Arguments) } } }
foreach ($s in @(Get-CimInstance Win32_Service -EA SilentlyContinue | Where-Object { $_.PathName -and $_.StartMode -ne 'Disabled' -and [string]$_.PathName -notmatch '(?i)^"?C:\\Windows\\' })) { $eintraege += [pscustomobject]@{ Art = 'Dienst'; Name = $s.Name; Befehl = [string]$s.PathName } }
$verd = @(); $verwaist = @()
foreach ($e in $eintraege) {
  $exe = ExePfad $e.Befehl
  $grund = @()
  if ($exe -match '(?i)\\AppData\\Local\\Microsoft\\WindowsApps\\') { continue }
  if ($exe -and $exe -match '^[A-Za-z]:\\' -and -not (Test-Path -LiteralPath $exe)) { $verwaist += ($e.Art + ' „' + $e.Name + '“ → ' + $exe); continue }
  if ($exe -match '(?i)\\(powershell|pwsh|wscript|cscript|mshta|cmd|rundll32|regsvr32)\.exe$' -or $exe -match '(?i)^(powershell|pwsh|wscript|cscript|mshta|cmd|rundll32|regsvr32)(\.exe)?$') { if ($e.Befehl -match '(?i)(-enc|-e\s|frombase64|downloadstring|iwr|invoke-webrequest|http|\\AppData\\|\\Temp\\|\\Users\\Public\\|hidden)') { $grund += 'Skript-Start mit auffälligen Argumenten' } }
  elseif ($exe -match '(?i)\\(AppData|Temp|Downloads|Users\\Public)\\') { $s = SigOk $exe; if ($s -ne 'OK') { $grund += ('aus Benutzerordner, ' + $s) } }
  else { $s = SigOk $exe; if ($s -ne 'OK' -and $s -ne 'ohne Pfad') { $grund += $s } }
  if ($grund.Count) { $b = $e.Befehl; if ($b.Length -gt 170) { $b = $b.Substring(0, 170) + '…' }; $verd += ($e.Art + ' „' + $e.Name + '“: ' + $b + ' · ' + ($grund -join ', ')) }
}
Zeile ('Autostarts/Aufgaben/Dienste geprüft: ' + $eintraege.Count + ' · auffällig: ' + $verd.Count + ' · verwaist (Ziel fehlt): ' + $verwaist.Count)
foreach ($v in @($verd | Select-Object -First 20)) { Zeile ('  AUFFÄLLIG: ' + $v) }
foreach ($v in @($verwaist | Select-Object -First 5)) { Zeile ('  verwaist: ' + $v) }
# Neu installiert
$grenze = (Get-Date).AddDays(-14).ToString('yyyyMMdd')
$neu = @($uninst | Where-Object { [string]$_.InstallDate -match '^\d{8}$' -and [string]$_.InstallDate -ge $grenze } | Sort-Object InstallDate -Descending | Select-Object -First 15)
foreach ($p in $neu) { Zeile ('Neu installiert ' + $p.InstallDate + ': ' + $p.DisplayName + ' ' + [string]$p.DisplayVersion + ' · ' + [string]$p.Publisher) }
if (-not $neu.Count) { Zeile 'In den letzten 14 Tagen keine neuen Programme installiert.' }` }),

  A({ id: 'konto4-datei-pruefen', titel: 'Datei prüfen: Herkunft, echter Dateityp, Signatur und Prüfsumme', modus: 'profil', risiko: 'lesen', timeoutMs: 120000,
    beschreibung: 'Für einen verdächtigen Anhang oder Download im Profil des Benutzers (Name genügt — gesucht wird in Downloads, Desktop, Dokumente, OneDrive, Outlook-Anlagen und Temp): Herkunft laut Internet-Markierung (Zone, Download-Adresse), echter Dateityp gegenüber der Endung (getarnte .exe, doppelte Endung), digitale Signatur mit Herausgeber, SHA256-Prüfsumme für die IT-Sicherheit und Defender-Funde zu dieser Datei. Ändert nichts.',
    param: { label: 'Datei (Name oder vollständiger Pfad)', platzhalter: 'z. B. Rechnung_4711.zip oder C:\\Users\\…\\Downloads\\setup.exe', pflicht: true },
    ps: DATEI_SUCHEN + String.raw`
NeedUser
$w = ([string]$P).Trim().Trim('"')
if (-not $w -or $w.Length -gt 400 -or $w -match '[\*\?<>|]') { throw 'Die Prüfung erfordert einen Dateinamen oder vollständigen Pfad ohne Platzhalter (* ?).' }
if ($w -match '^\\\\') { throw 'Die Prüfung erfordert eine Datei auf diesem PC — Server-Freigaben werden hier nicht gelesen.' }
$treffer = @()
foreach ($t in @(DateiFinden $w)) { if ($t.PSIsContainer) { Zeile ('Ordner: ' + $t.FullName + ' — geprüft werden die neuesten Dateien darin'); $treffer += @(Get-ChildItem -LiteralPath $t.FullName -File -Recurse -Depth 2 -Force -EA SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 3) } else { $treffer += $t } }
if (-not $treffer.Count) { throw ('Datei „' + $w + '“ nicht gefunden (gesucht in Downloads, Desktop, Dokumente, OneDrive, Outlook-Anlagen und Temp des Benutzers).') }
if ($treffer.Count -gt 1) { Zeile ('' + $treffer.Count + ' Treffer — geprüft werden die neuesten drei:'); foreach ($t in @($treffer | Select-Object -First 6)) { Zeile ('  ' + $t.FullName) } }
$typen = @{ 'MZ' = 'ausführbares Programm (EXE/DLL)'; 'PK' = 'ZIP-Archiv bzw. Office-Datei (docx/xlsx)'; '%PDF' = 'PDF'; 'Rar!' = 'RAR-Archiv'; '7z' = '7-Zip-Archiv'; 'D0CF11E0' = 'altes Office-Format (doc/xls/msg/msi)'; '{\rtf' = 'RTF-Dokument'; 'ITSF' = 'CHM-Hilfedatei'; '4C000000' = 'Windows-Verknüpfung (.lnk)' }
foreach ($f in @($treffer | Select-Object -First 3)) {
  Zeile ('Datei: ' + $f.FullName)
  Zeile ('  Größe ' + (Groesse $f.Length) + ' · erstellt ' + $f.CreationTime.ToString('dd.MM.yyyy HH:mm') + ' · geändert ' + $f.LastWriteTime.ToString('dd.MM.yyyy HH:mm'))
  if ($f.Name -match '(?i)\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|txt|zip)\s*\.(exe|scr|com|js|jse|vbs|vbe|wsf|hta|bat|cmd|lnk|iso|img|msi|ps1)$' -or $f.Name -match '\s{4,}\.\w+$') { Zeile '  ACHTUNG: doppelte bzw. versteckte Dateiendung — typische Tarnung von Schadsoftware.' }
  $zi = @(); try { $zi = @(Get-Content -LiteralPath $f.FullName -Stream Zone.Identifier -EA Stop) } catch {}
  if ($zi.Count) {
    $zone = ([string](@($zi | Where-Object { $_ -match '^ZoneId=' })[0]) -replace '^ZoneId=', '').Trim()
    $zt = switch ($zone) { '0' { 'Arbeitsplatz' } '1' { 'lokales Intranet' } '2' { 'vertrauenswürdige Sites' } '3' { 'INTERNET' } '4' { 'EINGESCHRÄNKTE Sites' } default { 'Zone ' + $zone } }
    $host1 = ([string](@($zi | Where-Object { $_ -match '^HostUrl=' })[0]) -replace '^HostUrl=', '').Trim()
    $ref = ([string](@($zi | Where-Object { $_ -match '^ReferrerUrl=' })[0]) -replace '^ReferrerUrl=', '').Trim()
    Zeile ('  Herkunft: ' + $zt + $(if ($host1) { ' · geladen von ' + $host1 } else { '' }) + $(if ($ref) { ' · über Seite ' + $ref } else { '' }))
  } else { Zeile '  Herkunft: keine Internet-Markierung (lokal erstellt, aus einem Archiv ohne Markierung entpackt oder bereits freigegeben).' }
  $kopf = ''
  try { $fs = [System.IO.File]::Open($f.FullName, 'Open', 'Read', 'ReadWrite'); $b = New-Object byte[] 8; $n = $fs.Read($b, 0, 8); $fs.Close(); if ($n -ge 2) { $asc = [Text.Encoding]::ASCII.GetString($b, 0, $n); $hex = (($b[0..([Math]::Min(3, $n - 1))] | ForEach-Object { $_.ToString('X2') }) -join ''); foreach ($k in $typen.Keys) { if ($asc.StartsWith($k) -or $hex -eq $k) { $kopf = $typen[$k] } } } } catch { $kopf = 'nicht lesbar (Datei geöffnet/gesperrt)' }
  Zeile ('  Tatsächlicher Inhalt: ' + $(if ($kopf) { $kopf } else { 'unbekannt/Text' }) + ' · Endung ' + $f.Extension)
  if ($kopf -like 'ausführbares*' -and $f.Extension -notmatch '(?i)^\.(exe|dll|scr|com|sys|msi|ocx|cpl)$') { Zeile '  ACHTUNG: Inhalt ist ein Programm, die Endung sagt etwas anderes — nicht öffnen!' }
  $sig = $null; try { $sig = Get-AuthenticodeSignature -LiteralPath $f.FullName -EA Stop } catch {}
  if ($sig -and [string]$sig.Status -eq 'UnknownError' -and -not $sig.SignerCertificate) { Zeile ('  Signatur: für diesen Dateityp nicht prüfbar' + $(if ($kopf -like 'ausführbares*') { ' — bei einem Programm ein schlechtes Zeichen (beschädigt oder manipuliert)' } else { ' (bei Dokumenten normal)' })) }
  elseif ($sig -and [string]$sig.Status -ne 'NotSigned') {
    $wer = ''; if ($sig.SignerCertificate) { $wer = (([string]$sig.SignerCertificate.Subject -split ',')[0] -replace '^CN=', '') + ' · Aussteller ' + (([string]$sig.SignerCertificate.Issuer -split ',')[0] -replace '^CN=', '') + ' · gültig bis ' + $sig.SignerCertificate.NotAfter.ToString('dd.MM.yyyy') }
    Zeile ('  Signatur: ' + [string]$sig.Status + $(if ($wer) { ' · ' + $wer } else { '' }) + $(if ($sig.TimeStamperCertificate) { ' · mit Zeitstempel' } else { '' }))
    if ([string]$sig.Status -ne 'Valid') { Zeile ('  ACHTUNG: Signatur NICHT gültig — ' + [string]$sig.StatusMessage) }
  } else { Zeile '  Signatur: keine (bei Programmen: Herausgeber nicht überprüfbar; bei Dokumenten normal)' }
  try { $h = Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256 -EA Stop; Zeile ('  SHA256: ' + $h.Hash) } catch { Zeile ('  SHA256: nicht lesbar (' + $_.Exception.Message + ')') }
  $th = @(); try { $th = @(Get-MpThreatDetection -EA Stop | Where-Object { (@($_.Resources) -join ' ') -like ('*' + $f.Name + '*') }) } catch {}
  if ($th.Count) { foreach ($x in @($th | Select-Object -First 3)) { $nm = ''; try { $nm = [string](Get-MpThreat -ThreatID $x.ThreatID -EA Stop).ThreatName } catch {}; Zeile ('  DEFENDER-FUND: ' + $nm + ' · ' + $x.InitialDetectionTime.ToString('dd.MM.yyyy HH:mm') + ' · Aktion ' + [string]$x.ThreatStatusID) } } else { Zeile '  Defender: kein Fund zu dieser Datei gespeichert.' }
}` }),

  A({ id: 'konto4-datei-entsperren', titel: 'Internet-Sperre (Mark of the Web) einer geprüften Datei bzw. eines Ordners aufheben', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Wie Eigenschaften → „Zulassen“: entfernt die Internet-Markierung (Zone.Identifier) einer Datei oder aller Dateien eines Ordners im Profil des Benutzers — für Dokumente aus entpackten ZIP-Archiven einer bekannten Quelle. Nur makrofreie Formate (PDF, .docx/.xlsx/.pptx, Text/CSV, Bilder, CAD): makrofähige Office-Dateien und Add-ins (.xlsm, .docm, .xlam …), alte Office-Formate, CHM-Hilfen, Programme, Skripte, Verknüpfungen, Archive sowie Dateien aus „eingeschränkten Sites“ bleiben immer gesperrt — Makro-Sperren hebt das Tool nie auf. Zeigt Zone und Quelle vorher.',
    param: { label: 'Datei oder Ordner im Benutzerprofil (Name oder Pfad)', platzhalter: 'z. B. Downloads\\Handbuch.chm oder Desktop\\Lieferant-Vorlagen', pflicht: true },
    ps: DATEI_SUCHEN + String.raw`
NeedUser
$w = ([string]$P).Trim().Trim('"')
if (-not $w -or $w.Length -gt 400 -or $w -match '[\*\?<>|]' -or $w -match '(^|\\)\.\.(\\|$)') { throw 'Bitte eine Datei bzw. einen Ordner ohne Platzhalter (* ?) und ohne „..“ angeben.' }
if ($w -match '^\\\\') { throw 'Dateien auf Server-Freigaben werden nie verändert — dafür ggf. „Server zur lokalen Intranetzone hinzufügen“.' }
$treffer = @(DateiFinden $w)
if (-not $treffer.Count) { throw ('„' + $w + '“ nicht gefunden (gesucht im Profil: Downloads, Desktop, Dokumente, OneDrive, Outlook-Anlagen, Temp).') }
if ($treffer.Count -gt 1) { throw ('Mehrere Treffer — bitte den Pfad angeben: ' + ((@($treffer | Select-Object -First 4) | ForEach-Object { $_.FullName }) -join ' | ')) }
$basis = ([IO.Path]::GetFullPath($uProf)).TrimEnd('\') + '\'
$ziel = $treffer[0]
if (-not ([IO.Path]::GetFullPath($ziel.FullName)).StartsWith($basis, [StringComparison]::OrdinalIgnoreCase)) { throw ('Nur Dateien im Profil des angemeldeten Benutzers (' + $uProf + ') werden freigegeben.') }
$erlaubt = '` + MOTW_ERLAUBT + String.raw`'
if ($ziel.PSIsContainer) { $dateien = @(Get-ChildItem -LiteralPath $ziel.FullName -File -Recurse -Force -EA SilentlyContinue | Select-Object -First 3000); Zeile ('Ordner: ' + $ziel.FullName + ' · ' + $dateien.Count + ' Dateien') } else { $dateien = @($ziel) }
$frei = 0; $ohne = 0; $gesperrt = @()
foreach ($f in $dateien) {
  $zi = @(); try { $zi = @(Get-Content -LiteralPath $f.FullName -Stream Zone.Identifier -EA Stop) } catch {}
  if (-not $zi.Count) { $ohne++; continue }
  $zone = ([string](@($zi | Where-Object { $_ -match '^ZoneId=' })[0]) -replace '^ZoneId=', '').Trim()
  $quelle = ([string](@($zi | Where-Object { $_ -match '^HostUrl=' })[0]) -replace '^HostUrl=', '').Trim()
  if ($f.Name -notmatch $erlaubt) { $gesperrt += ($f.Name + ' (Dateityp bleibt gesperrt)'); continue }
  if ($zone -eq '4') { $gesperrt += ($f.Name + ' (aus eingeschränkten Sites — bleibt gesperrt)'); continue }
  Unblock-File -LiteralPath $f.FullName -EA Stop
  $frei++
  if ($frei -le 15) { Zeile ('freigegeben: ' + $f.Name + ' · vorher Zone ' + $zone + $(if ($quelle) { ' · Quelle ' + $quelle } else { '' }) + ' → jetzt ohne Internet-Markierung') }
}
if ($frei -gt 15) { Zeile ('… insgesamt ' + $frei + ' Dateien freigegeben.') }
Zeile ('Ergebnis: ' + $frei + ' freigegeben · ' + $ohne + ' ohne Markierung · ' + $gesperrt.Count + ' bewusst gesperrt gelassen')
foreach ($g in @($gesperrt | Select-Object -First 10)) { Zeile ('  nicht freigegeben: ' + $g) }
if ($gesperrt.Count -and -not $frei) { Zeile 'Programme, Skripte und Archive gibt das Tool nie frei — sie prüft die IT-Sicherheit.' }` }),
]
