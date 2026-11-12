// ── Problem-Assistent: Bausteine aus der Ticket-Auswertung (Okt 2025 – Nov 2026) ──
// Lücken, die in den echten Field-Service-Tickets auffielen: SAP-Kerberos (Kinit), Coscom/WibuKey,
// EuroPar (Ordner, .ini, Umgebungsvariablen), Gravur-Software NGrav/SignPro (Schreibrechte) und
// Remotedesktop-Zugang. Alles wirkt NUR auf dem Ziel-PC — nie auf SAP-Systeme, Lizenzserver oder Freigaben.

import type { PaAktion } from '../motor'
import { SONDEN_LAUFWERKE } from '../diagnose/themen/laufwerke'
import { SONDEN_GEMEINSAM } from '../diagnose/themen/gemeinsam'
import { berPsAusgemustert, berPsTabelle } from '../berechtigungen'

const A = (a: PaAktion): PaAktion => a

/** MIT Kerberos for Windows (kinit/klist) suchen — im Benutzerkontext. */
const KINIT_SUCHE = String.raw`
function KinitPfad {
  $orte = @()
  foreach ($b in @($env:ProgramFiles, [Environment]::GetEnvironmentVariable('ProgramFiles(x86)'))) { if ($b) { $orte += (Join-Path $b 'MIT\Kerberos\bin') } }
  foreach ($o in $orte) { $f = Join-Path $o 'kinit.exe'; if (Test-Path -LiteralPath $f) { return $f } }
  $c = Get-Command 'kinit.exe' -EA SilentlyContinue | Where-Object { $_.Source -notlike '*\System32\*' } | Select-Object -First 1
  if ($c) { return [string]$c.Source }
  return $null
}
`

export const AKTIONEN_TICKETS5: PaAktion[] = [
  // ══ SAP · Kerberos-Ticket (Kinit) ═══════════════════════════════════════════
  A({ id: 'sap-kinit-pruefen', titel: 'SAP-Anmeldung: Kerberos-Tickets und Kinit prüfen', modus: 'benutzer', risiko: 'lesen', timeoutMs: 60000,
    beschreibung: 'Zeigt in der Sitzung des Benutzers, ob MIT Kerberos (kinit/klist) installiert ist und welche Tickets dort liegen, welche Windows-Kerberos-Tickets für SAP vorhanden sind, ob die SNC-Bibliothek für SAP gesetzt ist und ob SAP Logon läuft. Ändert nichts.',
    ps: KINIT_SUCHE + String.raw`
$ki = KinitPfad
if ($ki) {
  Zeile ('MIT Kerberos: ' + $ki)
  $kl = Join-Path (Split-Path $ki) 'klist.exe'
  if (Test-Path -LiteralPath $kl) {
    $aus = @(& $kl 2>&1 | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() })
    if (-not $aus.Count -or ($aus -join ' ') -match 'No credentials cache|not found|keine') { Zeile 'MIT-Tickets: KEINE — Kinit wurde nicht (mehr) ausgeführt bzw. das Ticket ist abgelaufen.' }
    else { Zeile 'MIT-Tickets:'; foreach ($l in ($aus | Select-Object -First 12)) { Zeile ('  ' + $l.Trim()) } }
  }
} else { Zeile 'MIT Kerberos (kinit): nicht installiert — SAP nutzt dann die Windows-Anmeldung (SNC über gx64krb5/sapcrypto).' }
$wk = Join-Path $env:SystemRoot 'System32\klist.exe'
$t = @(& $wk 2>&1 | ForEach-Object { [string]$_ })
$server = @($t | Where-Object { $_ -match '^\s*Server:\s*(.+)$' } | ForEach-Object { ($_ -replace '^\s*Server:\s*', '').Trim() })
Zeile ('Windows-Kerberos: ' + $server.Count + ' Ticket(s)' + $(if (@($server | Where-Object { $_ -match '(?i)sap' }).Count) { ', davon für SAP: ' + ((@($server | Where-Object { $_ -match '(?i)sap' }) | Select-Object -First 4) -join ' | ') } else { ', keines mit „SAP“ im Namen' }))
foreach ($n in 'SNC_LIB', 'SNC_LIB_64') {
  $u = [Environment]::GetEnvironmentVariable($n, 'User'); $m = [Environment]::GetEnvironmentVariable($n, 'Machine')
  if ($u -or $m) { Zeile ($n + ': ' + $(if ($u) { $u + ' (Benutzer)' } else { $m + ' (System)' }) + $(if (Test-Path -LiteralPath ([string]$(if ($u) { $u } else { $m }))) { '' } else { ' — Datei FEHLT' })) }
}
$sl = @(Get-Process -Name 'saplogon', 'sapgui' -EA SilentlyContinue)
Zeile ('SAP Logon läuft: ' + (Ja ($sl.Count -gt 0)))
`,
  }),
  A({ id: 'sap-kinit-starten', titel: 'SAP-Anmeldung: Kinit (Kerberos-Ticket holen) in der Sitzung des Benutzers öffnen', modus: 'benutzer', risiko: 'aendern', timeoutMs: 60000,
    beschreibung: 'Öffnet beim Benutzer das Kinit-Fenster von MIT Kerberos (bzw. den „MIT Kerberos Ticket Manager“), damit er mit seinem Kennwort ein neues Ticket für die SAP-Anmeldung holt. Das Kennwort tippt nur der Benutzer selbst — das Tool sieht und speichert es nicht.',
    ps: KINIT_SUCHE + String.raw`
$ki = KinitPfad
if (-not $ki) { throw 'MIT Kerberos (kinit) ist auf diesem PC nicht installiert — SAP-SSO läuft hier über die Windows-Anmeldung; bitte „Kerberos-Tickets erneuern“ verwenden.' }
$gui = Join-Path (Split-Path $ki) 'MIT Kerberos.exe'
if (Test-Path -LiteralPath $gui) { Start-Process -FilePath $gui; Zeile 'MIT Kerberos Ticket Manager geöffnet — Benutzer klickt „Get Ticket“ und gibt sein Kennwort ein.' }
else { Start-Process -FilePath $ki; Zeile 'Kinit-Fenster geöffnet — Benutzer gibt dort sein Kennwort ein (Fenster schließt sich danach).' }
Zeile 'Danach SAP Logon neu starten und die Verbindung erneut öffnen.'
`,
  }),

  // ══ Coscom / WibuKey ════════════════════════════════════════════════════════
  A({ id: 'coscom-pruefen', titel: 'Coscom und Lizenz-Dongle (WibuKey/CodeMeter) prüfen', modus: 'system', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Zeigt installierte Coscom-, WibuKey- und CodeMeter-Software, den Zustand der Lizenzdienste, ob der Dongle am USB erkannt wird, laufende Coscom-Prozesse und Fehler der letzten 7 Tage aus dem Anwendungsprotokoll. Ändert nichts.',
    ps: String.raw`
$apps = @()
foreach ($b in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall') {
  foreach ($k in @(Get-ChildItem -LiteralPath $b -EA SilentlyContinue)) { $ip = Get-ItemProperty -LiteralPath $k.PSPath -EA SilentlyContinue; if ([string]$ip.DisplayName -match '(?i)coscom|wibu|codemeter') { $apps += $ip } }
}
if ($apps.Count) { foreach ($x in ($apps | Sort-Object DisplayName -Unique)) { Zeile ('Installiert: ' + $x.DisplayName + $(if ($x.DisplayVersion) { ' ' + $x.DisplayVersion } else { '' })) } }
else { Zeile 'Keine Coscom-, WibuKey- oder CodeMeter-Software in der Programmliste gefunden.' }
$sv = @(Get-Service -EA SilentlyContinue | Where-Object { $_.DisplayName -match '(?i)wibu|codemeter' -or $_.Name -match '(?i)wibu|codemeter|^wksvc' })
if ($sv.Count) { foreach ($s in $sv) { Zeile ('Lizenzdienst ' + $s.DisplayName + ': ' + $s.Status + ' (' + $s.StartType + ')' + $(if ($s.Status -ne 'Running') { ' ← läuft NICHT' } else { '' })) } }
else { Zeile 'Kein WibuKey-/CodeMeter-Dienst vorhanden.' }
$dg = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { $_.FriendlyName -match '(?i)wibu|codemeter|wibu-box' })
Zeile ('Dongle am USB erkannt: ' + $(if ($dg.Count) { (($dg | ForEach-Object { $_.FriendlyName + ' [' + $_.Status + ']' }) -join ', ') } else { 'NEIN — Dongle steckt nicht oder wird nicht erkannt' }))
$pr = @(Get-Process -EA SilentlyContinue | Where-Object { $_.Path -match '(?i)coscom' })
Zeile ('Coscom-Prozesse: ' + $(if ($pr.Count) { (($pr | ForEach-Object { $_.ProcessName }) | Select-Object -Unique) -join ', ' } else { 'keine' }))
$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Level = 1, 2; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 400 -EA SilentlyContinue | Where-Object { ($_.ProviderName + ' ' + $_.Message) -match '(?i)coscom|wibu|codemeter' } | Select-Object -First 5)
if ($ev.Count) { foreach ($e in $ev) { Zeile ('Fehler ' + $e.TimeCreated.ToString('dd.MM. HH:mm') + ': ' + (([string]$e.Message -split "\r?\n")[0]).Substring(0, [Math]::Min(160, (([string]$e.Message -split "\r?\n")[0]).Length))) } }
else { Zeile 'Keine Coscom-/Lizenzfehler im Anwendungsprotokoll (7 Tage).' }
`,
  }),
  A({ id: 'coscom-neustart', titel: 'Coscom beenden und Lizenzdienste (WibuKey/CodeMeter) neu starten', modus: 'profil', risiko: 'aendern', timeoutMs: 120000,
    beschreibung: 'Beendet die hängenden Coscom-Prozesse des angemeldeten Benutzers und startet die WibuKey- bzw. CodeMeter-Lizenzdienste neu (deaktivierte Dienste bleiben aus). Danach Coscom neu öffnen. Löscht nichts.',
    ps: String.raw`
NeedUser
$cp = @(Get-Process -IncludeUserName -EA SilentlyContinue | Where-Object { $_.Path -match '(?i)coscom' -and $_.UserName -and ((($_.UserName -split '\\')[-1]) -ieq $uName) })
if ($cp.Count) { foreach ($x in $cp) { try { Stop-Process -Id $x.Id -Force -EA Stop } catch {} }; Zeile ('Beendet: ' + ((($cp | ForEach-Object { $_.ProcessName }) | Select-Object -Unique) -join ', ')); Start-Sleep -Seconds 2 }
else { Zeile 'Kein Coscom-Prozess des Benutzers lief.' }
$sv = @(Get-Service -EA SilentlyContinue | Where-Object { $_.DisplayName -match '(?i)wibu|codemeter' -or $_.Name -match '(?i)wibu|codemeter|^wksvc' })
if (-not $sv.Count) { Zeile 'Kein WibuKey-/CodeMeter-Dienst vorhanden — Lizenz kommt evtl. vom Netz-Lizenzserver.' }
foreach ($s in $sv) { DienstNeu $s.Name }
Zeile 'Jetzt Coscom neu starten. Kommt weiter „keine Lizenz“: Dongle ab- und wieder anstecken bzw. „Coscom und Lizenz-Dongle prüfen“.'
`,
  }),

  // ══ EuroPar ═════════════════════════════════════════════════════════════════
  A({ id: 'europar-pruefen', titel: 'EuroPar prüfen (Ordner, .ini-Dateien, Laufwerk Q:, Umgebungsvariablen)', modus: 'profil', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Prüft die Voraussetzungen von EuroPar: Ordner C:\\EuroPAR, C:\\Local und C:\\SCHNITTDATEN, die .ini-Dateien in C:\\Local (leere oder auffällige Dateien), das Laufwerk Q: des Benutzers und die Umgebungsvariablen EURO_EURN, EURO_WRKN und den PATH-Eintrag Q:\\Eurnc\\cmdnc0. Ändert nichts.',
    ps: String.raw`
NeedHive
function W2([string]$pfad, [string]$name) { try { return (Get-ItemProperty -LiteralPath $pfad -Name $name -EA Stop).$name } catch { return $null } }
foreach ($o in 'C:\EuroPAR', 'C:\Local', 'C:\SCHNITTDATEN') {
  if (Test-Path -LiteralPath $o) { $n = @(Get-ChildItem -LiteralPath $o -Recurse -File -Force -EA SilentlyContinue).Count; Zeile ($o + ': vorhanden (' + $n + ' Dateien)') }
  else { Zeile ($o + ': FEHLT') }
}
$ini = @(Get-ChildItem -LiteralPath 'C:\Local' -Filter '*.ini' -File -EA SilentlyContinue | Sort-Object LastWriteTime -Descending)
if ($ini.Count) {
  foreach ($f in ($ini | Select-Object -First 12)) { Zeile ('  ' + $f.Name + ' · ' + $f.Length + ' Byte · ' + $f.LastWriteTime.ToString('dd.MM.yyyy HH:mm') + $(if ($f.Length -eq 0) { ' ← LEER' } else { '' })) }
} else { Zeile 'Keine .ini-Dateien in C:\Local.' }
$q = W2 ($uHive + '\Network\Q') 'RemotePath'
Zeile ('Laufwerk Q: des Benutzers: ' + $(if ($q) { $q } else { 'NICHT verbunden' }))
$ek = $uHive + '\Environment'
$eu = W2 $ek 'EURO_EURN'; $ew = W2 $ek 'EURO_WRKN'
$ph = ''; try { $ph = [string](Get-Item -LiteralPath $ek -EA Stop).GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } catch {}
$em = [Environment]::GetEnvironmentVariable('EURO_EURN', 'Machine')
Zeile ('EURO_EURN (Benutzer): ' + $(if ($eu) { $eu } else { 'FEHLT' }) + ' · (System): ' + $(if ($em) { $em } else { 'FEHLT' }))
Zeile ('EURO_WRKN (Benutzer): ' + $(if ($ew) { $ew } else { 'FEHLT' }))
Zeile ('PATH enthält Q:\Eurnc\cmdnc0: ' + (Ja ((@($ph -split ';' | Where-Object { $_.TrimEnd('\') -ieq 'Q:\Eurnc\cmdnc0' })).Count -gt 0)))
`,
  }),
  A({ id: 'europar-umgebung', titel: 'EuroPar-Umgebungsvariablen setzen (EURO_EURN, EURO_WRKN, PATH)', modus: 'profil', risiko: 'aendern', timeoutMs: 90000,
    beschreibung: 'Setzt für den angemeldeten Benutzer EURO_EURN=Q: und EURO_WRKN=C:\\local, ergänzt den PATH um Q:\\Eurnc\\cmdnc0 (der vorhandene PATH bleibt erhalten) und setzt systemweit EURO_EURN=Q:. Ändert nur, was fehlt oder abweicht; wirkt nach Ab- und Anmeldung bzw. Neustart von EuroPar.',
    ps: String.raw`
NeedHive
$ek = $uHive + '\Environment'
if (-not (Test-Path -LiteralPath $ek)) { New-Item -Path $ek | Out-Null }
$soll = [ordered]@{ EURO_EURN = 'Q:'; EURO_WRKN = 'C:\local' }
foreach ($n in $soll.Keys) {
  $ist = $null; try { $ist = (Get-ItemProperty -LiteralPath $ek -Name $n -EA Stop).$n } catch {}
  if ([string]$ist -ieq $soll[$n]) { Zeile ($n + ' (Benutzer): schon ' + $ist) }
  else { Set-ItemProperty -LiteralPath $ek -Name $n -Value $soll[$n] -Type String; Zeile ($n + ' (Benutzer): ' + $(if ($ist) { $ist } else { '(leer)' }) + ' → ' + $soll[$n]) }
}
$key = Get-Item -LiteralPath $ek
$roh = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
$art = 'ExpandString'; try { if ($null -ne $key.GetValue('Path', $null)) { $art = [string]$key.GetValueKind('Path') } } catch {}
if (@($roh -split ';' | Where-Object { $_.TrimEnd('\') -ieq 'Q:\Eurnc\cmdnc0' }).Count) { Zeile 'PATH (Benutzer): enthält Q:\Eurnc\cmdnc0 schon' }
else {
  $neu = $(if ($roh.Trim()) { $roh.TrimEnd(';') + ';Q:\Eurnc\cmdnc0' } else { 'Q:\Eurnc\cmdnc0' })
  Set-ItemProperty -LiteralPath $ek -Name 'Path' -Value $neu -Type $art
  Zeile 'PATH (Benutzer): Q:\Eurnc\cmdnc0 ergänzt (bisherige Einträge bleiben)'
}
$em = [Environment]::GetEnvironmentVariable('EURO_EURN', 'Machine')
if ([string]$em -ieq 'Q:') { Zeile 'EURO_EURN (System): schon Q:' } else { [Environment]::SetEnvironmentVariable('EURO_EURN', 'Q:', 'Machine'); Zeile ('EURO_EURN (System): ' + $(if ($em) { $em } else { '(leer)' }) + ' → Q:') }
Zeile 'Wirkt nach Ab- und Anmeldung des Benutzers (EuroPar danach neu starten).'
`,
  }),

  // ══ Gravur-Software NGrav / SignPro ════════════════════════════════════════
  A({ id: 'ngrav-schreibrechte', titel: 'Gravur-Software (NGrav/SignPro): Schreibrechte für alle Benutzer auf ihren Datenordner', modus: 'system', risiko: 'aendern', timeoutMs: 120000,
    beschreibung: 'Sucht unter „Öffentliche Dokumente“ (C:\\Users\\Public\\Documents) die Ordner von NGrav bzw. SignPro und gibt der Gruppe „Benutzer“ dort Ändern-Rechte (vererbt). Typisch, wenn die Gravur-Software nur beim Admin bzw. ersten Benutzer läuft und bei anderen „Zugriff verweigert“ meldet. Ändert nichts außerhalb dieser Ordner.',
    ps: String.raw`
$doku = Join-Path $env:PUBLIC 'Documents'
if (-not (Test-Path -LiteralPath $doku)) { $doku = 'C:\Users\Public\Documents' }
$ziele = @(Get-ChildItem -LiteralPath $doku -Directory -EA SilentlyContinue | Where-Object { $_.Name -match '(?i)ngrav|signpro' })
if (-not $ziele.Count) { throw ('Kein NGrav-/SignPro-Ordner unter ' + $doku + ' gefunden — ist die Gravur-Software installiert?') }
$sid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-545')
foreach ($z in $ziele) {
  $acl = Get-Acl -LiteralPath $z.FullName
  $hat = @($acl.Access | Where-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq 'S-1-5-32-545' -and $_.AccessControlType -eq 'Allow' -and (($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Modify) -eq [System.Security.AccessControl.FileSystemRights]::Modify) })
  if ($hat.Count) { Zeile ($z.FullName + ': Benutzer haben schon Ändern-Rechte'); continue }
  $regel = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.AddAccessRule($regel)
  Set-Acl -LiteralPath $z.FullName -AclObject $acl
  Zeile ($z.FullName + ': Benutzer → Ändern (vererbt) gesetzt')
}
Zeile 'Gravur-Software neu starten und beim betroffenen Benutzer testen.'
`,
  }),

  // ══ Fernzugriff (ZPA/Akamai EAA): AD-Gruppen je Anwendung ══════════════════
  // Gruppennamen am 07.11.2026 aus skfprod (sys_user_group, Typ „AD Security Group – Remote Connectivity“) gelesen.
  A({ id: 'zpa-rollen-pruefen', titel: 'Fernzugriff-Berechtigungen (ZPA) des Benutzers prüfen – welche Marine-Anwendungen gehen im Homeoffice?', modus: 'lokal', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Liest vom Admin-PC aus im AD, in welchen Fernzugriff-Gruppen (EAA_…) der angemeldete Benutzer ist – auch über verschachtelte Gruppen – und zeigt je Marine-Anwendung ✓/✗: SAP Production/Non Production, enaio, Babtec, Fileserver, Solidworks, Plossys, Docuglobe, Mdesign, Infor, Interflex u. a. Mit Programmangabe sagt der Baustein direkt, welche Gruppe fehlt. Nur lesend – Berechtigungen ändert das Tool nie.',
    param: { label: 'Programm (optional)', platzhalter: 'z. B. SAP, enaio, Babtec', vorlagen: ['SAP', 'enaio', 'Babtec', 'Fileserver', 'Solidworks', 'Plossys'] },
    ps: String.raw`
$sam = ([string]$S -split '\\')[-1] -replace '[^A-Za-z0-9._-]', ''
if (-not $sam) { throw 'Angemeldeter Benutzer des Ziel-PCs unbekannt.' }
$karte = [ordered]@{
  'SAP Production' = @('EAA_SAP_Marine_Prod'); 'SAP Non Production' = @('EAA_SAP_Marine_NonProd'); 'enaio' = @('EAA_Enaoi'); 'Babtec' = @('EAA_Babtec_Marine')
  'Fileserver Marine' = @('EAA_File_Servers_Marine_Prod'); 'Solidworks' = @('EAA_Solidworks_Marine'); 'SolidWorks-Lizenzserver' = @('EAA_SolidWorks_License_Manager')
  'Plossys (Drucken)' = @('EAA_Plossys'); 'Docuglobe' = @('EAA_Docuglobe'); 'Mdesign' = @('EAA_Mdesign_Marine'); 'Infor' = @('EAA_Infor'); 'Interflex' = @('EAA_Interflex')
  'Schiffsdatenbank' = @('EAA_SchiffDatenbank_Prod', 'EAA_SchiffDatenbank_NonProd'); 'AuftragsDB' = @('EAA_AuftragsDB_Marine'); 'Hicad Helios' = @('EAA_Hicad_Helios_Prod')
  'Cubeware' = @('EAA_Cubeware_C8_Cockpit'); 'Datawarehouse' = @('EAA_Datawarehouse_Marine'); 'eReports' = @('EAA_EREPORTS_MARINE'); 'IDProve' = @('EAA_IDProve_Marine')
  'DPF4P' = @('EAA_DPF4P_Prod'); 'Retain NAS' = @('EAA_RETAIN_NAS_MARINE'); 'Siemens-Lizenzserver' = @('EAA_Siemens_License_Manager_Marine'); 'Valantic RTS' = @('EAA_Valantic_Way_RTS_Marine')
}
$doms = @(); try { $doms = @([System.DirectoryServices.ActiveDirectory.Forest]::GetCurrentForest().Domains | ForEach-Object { $_.Name }) } catch {}
if (-not $doms.Count -and $env:USERDNSDOMAIN) { $doms = @($env:USERDNSDOMAIN) }
$dn = $null; $direkt = @()
foreach ($dm in $doms) {
  try {
    $su = New-Object System.DirectoryServices.DirectorySearcher([ADSI]('LDAP://' + $dm))
    $su.Filter = '(&(objectCategory=person)(sAMAccountName=' + $sam + '))'
    [void]$su.PropertiesToLoad.Add('distinguishedName'); [void]$su.PropertiesToLoad.Add('memberOf')
    $tr = $su.FindOne()
    if ($tr) { $dn = [string]$tr.Properties['distinguishedname'][0]; $direkt = @($tr.Properties['memberof'] | ForEach-Object { ([string]$_ -split ',')[0] -replace '^CN=', '' }); break }
  } catch {}
}
if (-not $dn) { throw ('Konto ' + $sam + ' im Verzeichnis nicht gefunden (Admin-PC ohne Verbindung zum AD?).') }
$gruppen = New-Object System.Collections.Generic.HashSet[string]([StringComparer]::OrdinalIgnoreCase)
foreach ($x in $direkt) { [void]$gruppen.Add($x) }
$esc = $dn.Replace('\', '\5c').Replace('(', '\28').Replace(')', '\29').Replace('*', '\2a')
foreach ($dm in $doms) {
  try {
    $sg = New-Object System.DirectoryServices.DirectorySearcher([ADSI]('LDAP://' + $dm))
    $sg.Filter = '(&(objectCategory=group)(|(cn=EAA_*)(cn=Azure_AD_SSO_Akamai_EAA_Client)(cn=Azure_AD_SSO_Akamai_EAA_3Pext))(member:1.2.840.113556.1.4.1941:=' + $esc + '))'
    $sg.PageSize = 500; [void]$sg.PropertiesToLoad.Add('cn')
    foreach ($g in $sg.FindAll()) { [void]$gruppen.Add([string]$g.Properties['cn'][0]) }
  } catch {}
}
Zeile ('Benutzer: ' + $sam + ' · ' + @($gruppen | Where-Object { $_ -like 'EAA_*' }).Count + ' Fernzugriff-Gruppe(n)')
# Grundrolle „Remote Access“ (ZPA Client Role) ist PFLICHT – ohne sie geht im Homeoffice keine einzige Anwendung, auch mit EAA_-Gruppen nicht
$basis = $gruppen.Contains('Azure_AD_SSO_Akamai_EAA_Client') -or $gruppen.Contains('Azure_AD_SSO_Akamai_EAA_3Pext')
$basisText = 'Grundrolle Fernzugriff „Remote Access“ (Azure_AD_SSO_Akamai_EAA_Client' + $(if ($gruppen.Contains('Azure_AD_SSO_Akamai_EAA_3Pext')) { ' bzw. _3Pext für Externe' } else { '' }) + ')'
Zeile ($(if ($basis) { '✓ ' } else { '✗ ' }) + $basisText + $(if ($basis) { '' } else { ' – FEHLT: ohne Grundrolle geht im Homeoffice KEINE Anwendung → „ZPA Client Role“ beantragen' }))
$fehlt = @()
foreach ($k in $karte.Keys) {
  $hat = @($karte[$k] | Where-Object { $gruppen.Contains($_) }).Count -gt 0
  Zeile ($(if ($hat) { '✓ ' } else { '✗ ' }) + $k + '  (' + ($karte[$k] -join ' / ') + ')')
  if (-not $hat) { $fehlt += $k }
}
$wunsch = ([string]$P).Trim().ToLower()
if ($wunsch) {
  $betroffen = @($karte.Keys | Where-Object { $_.ToLower().Contains($wunsch) -or (($karte[$_] -join ' ').ToLower().Contains($wunsch)) })
  if (-not $betroffen.Count) { Zeile ('Zum Programm „' + $P + '“ ist keine Marine-Fernzugriff-Gruppe bekannt.') }
  else {
    $los = @($betroffen | Where-Object { $fehlt -contains $_ } | ForEach-Object { $_ + ' (' + ($karte[$_] -join ' / ') + ')' })
    if (-not $basis) { $los = @($basisText) + $los }
    if ($los.Count) { Zeile ('FEHLT für ' + $P + ': ' + ($los -join ', ') + ' – im Antrag „ZPA Client Role“ bzw. „ZPA: Check which Applications …“ prüfen und beantragen.') }
    else { Zeile ('Für ' + $P + ' sind alle nötigen Fernzugriff-Gruppen vorhanden – am Recht liegt es nicht (Zscaler-Anmeldung prüfen).') }
  }
}
Zeile 'Neue Gruppen wirken erst nach Ab-/Anmeldung in Zscaler (bzw. nach einiger Zeit). Das Tool ändert keine Berechtigungen.'
`,
  }),

  // ══ Rechte-Check: liegt es an fehlenden Berechtigungen? ═════════════════════
  // Läuft in der Sitzung des Benutzers (sein Konto, seine Anmeldung). Freigabegruppen tragen bei SKF im AD
  // die Beschreibung „RW access to \\SERVER\Freigabe\Ordner“ — darüber findet der Baustein die nötige Gruppe.
  A({ id: 'rechte-pruefen', titel: 'Rechte-Check: Liegt es an fehlenden Berechtigungen? (Konto, Ordner-Gruppe, Anmeldung)', modus: 'benutzer', risiko: 'lesen', timeoutMs: 120000,
    beschreibung: 'Prüft mit dem Konto des Benutzers: Konto aktiv/gesperrt/Kennwort abgelaufen, ob der Pfad erreichbar ist bzw. „Zugriff verweigert“ kommt, welche AD-Gruppe für den Ordner zuständig ist (Beschreibung „RW/RO access to …“), ob der Benutzer im AD Mitglied ist – auch verschachtelt – und ob seine AKTUELLE Anmeldung die Gruppe schon kennt. Ergebnis: „an den Rechten liegt es nicht“, „Gruppe X fehlt – beantragen“ oder „Gruppe schon zugewiesen – ab- und anmelden“. Ändert nichts.',
    param: { label: 'Pfad (optional, z. B. I:\\Projekte oder \\\\w3172\\SKF Marine\\…)', platzhalter: 'z. B. I:\\500 Supply Chain Mgmt\\532 AWG' },
    ps: String.raw`
function LdapEsc([string]$t) { return $t.Replace('\', '\5c').Replace('*', '\2a').Replace('(', '\28').Replace(')', '\29') }
$ich = [string]$env:USERNAME
Zeile ('Benutzer: ' + $env:USERDOMAIN + '\' + $ich)
# 1) Gruppen der AKTUELLEN Anmeldung (Token)
$tok = New-Object System.Collections.Generic.HashSet[string]([StringComparer]::OrdinalIgnoreCase)
foreach ($z in @(whoami /groups /fo csv /nh 2>$null | ConvertFrom-Csv -Header 'N', 'T', 'S', 'A')) { $gn = ([string]$z.N -split '\\')[-1]; if ($gn) { [void]$tok.Add($gn) } }
Zeile ('Gruppen in der aktuellen Anmeldung: ' + $tok.Count)
# 2) Konto im AD
$doms = @(); try { $doms = @([System.DirectoryServices.ActiveDirectory.Forest]::GetCurrentForest().Domains | ForEach-Object { $_.Name }) } catch {}
if (-not $doms.Count -and $env:USERDNSDOMAIN) { $doms = @($env:USERDNSDOMAIN) }
$udn = $null
foreach ($dm in $doms) {
  try {
    $su = New-Object System.DirectoryServices.DirectorySearcher([ADSI]('LDAP://' + $dm))
    $su.Filter = '(&(objectCategory=person)(sAMAccountName=' + (LdapEsc $ich) + '))'
    foreach ($at in 'distinguishedName', 'userAccountControl', 'lockoutTime', 'msDS-UserPasswordExpiryTimeComputed') { [void]$su.PropertiesToLoad.Add($at) }
    $tr = $su.FindOne()
    if ($tr) {
      $udn = [string]$tr.Properties['distinguishedname'][0]
      $uac = [int]$tr.Properties['useraccountcontrol'][0]
      $lt = 0; if ($tr.Properties['lockouttime'].Count) { $lt = [int64]$tr.Properties['lockouttime'][0] }
      $abl = $null; if ($tr.Properties['msds-userpasswordexpirytimecomputed'].Count) { $x = [int64]$tr.Properties['msds-userpasswordexpirytimecomputed'][0]; if ($x -gt 0 -and $x -lt [int64]::MaxValue) { $abl = [DateTime]::FromFileTime($x) } }
      Zeile ('Konto: ' + $(if ($uac -band 2) { 'DEAKTIVIERT' } else { 'aktiv' }) + ' · ' + $(if ($lt -gt 0) { 'GESPERRT' } else { 'nicht gesperrt' }) + $(if ($abl) { ' · Kennwort ' + $(if ($abl -lt (Get-Date)) { 'ABGELAUFEN' } else { 'gültig bis ' + $abl.ToString('dd.MM.yyyy') }) } else { '' }))
      break
    }
  } catch {}
}
if (-not $udn) { Zeile 'AD nicht erreichbar bzw. Konto nicht gefunden – Gruppen können nicht mit dem AD verglichen werden (Homeoffice ohne Zscaler?).' }
# 3) Pfad: Laufwerksbuchstabe → UNC, Zugriff testen
$pfad = ([string]$P).Trim().Trim('"')
if (-not $pfad) { Zeile 'Kein Pfad angegeben – nur Konto und Anmeldung geprüft. Für eine Ordner-Prüfung den Pfad eintragen.' }
else {
  $unc = $pfad
  if ($pfad -match '^([A-Za-z]):(.*)$') { $dr = Get-PSDrive -Name $Matches[1] -EA SilentlyContinue; if ($dr -and $dr.DisplayRoot) { $unc = $dr.DisplayRoot.TrimEnd('\') + $Matches[2] } }
  Zeile ('Pfad: ' + $pfad + $(if ($unc -ne $pfad) { ' = ' + $unc } else { '' }))
  $zugriff = 'unbekannt'
  try { $null = Get-ChildItem -LiteralPath $pfad -Force -EA Stop | Select-Object -First 1; $zugriff = 'ok' }
  catch [System.UnauthorizedAccessException] { $zugriff = 'verweigert' }
  catch { if ([string]$_.Exception.Message -match '(?i)verweigert|denied') { $zugriff = 'verweigert' } elseif (-not (Test-Path -LiteralPath $pfad)) { $zugriff = 'fehlt' } else { $zugriff = 'fehler: ' + $_.Exception.Message } }
  Zeile ('Zugriff mit dem Konto des Benutzers: ' + $(switch -Wildcard ($zugriff) { 'ok' { 'OK – Lesen klappt' } 'verweigert' { 'ZUGRIFF VERWEIGERT' } 'fehlt' { 'Pfad nicht gefunden bzw. Server nicht erreichbar' } default { $zugriff } }))
  # 4) zuständige Gruppen über die AD-Beschreibung finden (vom Ordner bis zur Freigabe hoch)
  $gef = @()
  if ($udn -and $unc.StartsWith('\\')) {
    $teile = $unc.TrimStart('\').Split('\')
    for ($n = $teile.Count; $n -ge 2 -and -not $gef.Count; $n--) {
      $kand = '\\' + (($teile[0..($n - 1)]) -join '\')
      foreach ($dm in $doms) {
        try {
          $sg = New-Object System.DirectoryServices.DirectorySearcher([ADSI]('LDAP://' + $dm))
          $sg.Filter = '(&(objectCategory=group)(description=*access to ' + (LdapEsc $kand) + '))'
          $sg.PageSize = 200; [void]$sg.PropertiesToLoad.Add('cn'); [void]$sg.PropertiesToLoad.Add('description'); [void]$sg.PropertiesToLoad.Add('distinguishedName')
          foreach ($g in $sg.FindAll()) { $gef += [pscustomobject]@{ cn = [string]$g.Properties['cn'][0]; desc = [string]$g.Properties['description'][0]; dn = [string]$g.Properties['distinguishedname'][0]; dom = $dm } }
        } catch {}
      }
    }
    if (-not $gef.Count) { Zeile 'Keine Freigabegruppe mit passender Beschreibung im AD gefunden – Rechte am Ordner direkt prüfen („Pfad-Zugriff prüfen“).' }
    $imAd = @(); $imToken = @()
    foreach ($g in $gef) {
      $mitglied = $false
      try {
        $sm = New-Object System.DirectoryServices.DirectorySearcher([ADSI]('LDAP://' + $g.dom))
        $sm.Filter = '(&(objectCategory=person)(sAMAccountName=' + (LdapEsc $ich) + ')(memberOf:1.2.840.113556.1.4.1941:=' + (LdapEsc $g.dn) + '))'
        $mitglied = [bool]$sm.FindOne()
      } catch {}
      $aktiv = $tok.Contains($g.cn)
      Zeile ($(if ($mitglied -and $aktiv) { '✓ ' } elseif ($mitglied) { '⚠ ' } else { '✗ ' }) + $g.cn + ' (' + $g.desc + ')' + $(if ($mitglied -and -not $aktiv) { ' – im AD Mitglied, aber NOCH NICHT in der aktuellen Anmeldung' } elseif (-not $mitglied) { ' – kein Mitglied' } else { '' }))
      if ($mitglied) { $imAd += $g.cn }; if ($mitglied -and $aktiv) { $imToken += $g.cn }
    }
    if ($gef.Count) {
      if ($zugriff -eq 'ok') { Zeile 'ERGEBNIS: Zugriff klappt – an den Rechten liegt es nicht.' }
      elseif ($imToken.Count) { Zeile 'ERGEBNIS: Gruppe vorhanden und aktiv – trotzdem verweigert: Rechte am Unterordner/der Datei prüfen („Pfad-Zugriff prüfen“) oder Datei gesperrt.' }
      elseif ($imAd.Count) { Zeile ('ERGEBNIS: Gruppe ' + ($imAd -join ', ') + ' ist im AD schon zugewiesen, die Anmeldung kennt sie aber noch nicht → ab- und wieder anmelden (bzw. „Kerberos-Tickets erneuern“).') }
      else { Zeile ('ERGEBNIS: Berechtigung FEHLT – nötig ist eine dieser Gruppen: ' + (($gef | ForEach-Object { $_.cn }) -join ' oder ') + ' → beim Ordnerverantwortlichen beantragen (ServiceNow „Fileshare Access Request“).') }
    } elseif ($zugriff -eq 'ok') { Zeile 'ERGEBNIS: Zugriff klappt – an den Rechten liegt es nicht.' }
    elseif ($zugriff -eq 'verweigert') { Zeile 'ERGEBNIS: Zugriff verweigert – die zuständige Berechtigungsgruppe ließ sich nicht ermitteln → Ordnerverantwortlichen fragen bzw. ServiceNow „Fileshare Access Request“.' }
  } elseif ($zugriff -eq 'ok') { Zeile 'ERGEBNIS: Zugriff klappt – an den Rechten liegt es nicht.' }
  elseif ($zugriff -eq 'verweigert') { Zeile 'ERGEBNIS: Zugriff verweigert – die zuständige Berechtigungsgruppe ließ sich nicht ermitteln (AD nicht erreichbar?) → Ordnerverantwortlichen fragen bzw. ServiceNow „Fileshare Access Request“.' }
}
if (-not $env:USERDNSDOMAIN) { Zeile 'Hinweis: Sitzung ohne Domänenanmeldung (lokales Konto?).' }
`,
  }),

  // ══ PDF-Standardprogramm (Adobe) ═══════════════════════════════════════════
  // Windows schützt die .pdf-Zuordnung (UserChoice mit Prüfwert) — setzen darf sie nur der Benutzer selbst.
  // Deshalb: prüfen und beim Benutzer direkt den Windows-Dialog „Wie möchten Sie diese Datei öffnen?“ öffnen.
  A({ id: 'pdf-standard-adobe', titel: 'PDF-Standardprogramm prüfen und Adobe als Standard auswählen lassen', modus: 'benutzer', risiko: 'aendern', timeoutMs: 60000,
    beschreibung: 'Zeigt, womit PDFs beim Benutzer geöffnet werden und ob Adobe Acrobat bzw. Reader installiert ist. Ist Adobe nicht der Standard, öffnet das Tool beim Benutzer den Windows-Dialog „Wie möchten Sie diese Datei öffnen?“ für eine Beispiel-PDF – dort Adobe wählen und „Immer“ anhaken (Windows lässt nur den Benutzer selbst die PDF-Zuordnung festlegen).',
    ps: String.raw`
$fe = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf'
$wahl = $null
foreach ($u in 'UserChoiceLatest\ProgId', 'UserChoice') { $v = (Get-ItemProperty -LiteralPath ($fe + '\' + $u) -Name ProgId -EA SilentlyContinue).ProgId; if ($v) { $wahl = [string]$v; break } }
$pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
$acro = @((Join-Path $env:ProgramFiles 'Adobe\Acrobat DC\Acrobat\Acrobat.exe'), (Join-Path $pf86 'Adobe\Acrobat DC\Acrobat\Acrobat.exe'), (Join-Path $pf86 'Adobe\Acrobat Reader DC\Reader\AcroRd32.exe'), (Join-Path $env:ProgramFiles 'Adobe\Acrobat Reader DC\Reader\AcroRd32.exe')) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
Zeile ('Adobe: ' + $(if ($acro) { $acro } else { 'NICHT installiert' }))
Zeile ('PDF öffnet beim Benutzer mit: ' + $(if ($wahl) { $wahl } else { '(keine eigene Wahl – Windows-Standard bzw. Nachfrage)' }))
if (-not $acro) { throw 'Adobe Acrobat/Reader ist nicht installiert – zuerst über die Software-Kachel bzw. das Unternehmensportal (Intune) installieren.' }
if ($wahl -match '^(Acrobat|AcroExch)\.') { Zeile 'Adobe ist bereits Standard für PDF – an der Zuordnung liegt es nicht.' }
else {
  $f = Join-Path $env:TEMP 'IT-Admin-Tool-PDF-Standard.pdf'
  $inhalt = @('%PDF-1.4', '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj', '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj', '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj', 'trailer<</Root 1 0 R>>', '%%EOF') -join [string][char]10
  [IO.File]::WriteAllText($f, $inhalt, [Text.Encoding]::ASCII)
  Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\rundll32.exe') -ArgumentList ('shell32.dll,OpenAs_RunDLL "' + $f + '"')
  Zeile 'Beim Benutzer ist der Dialog „Wie möchten Sie diese Datei öffnen?“ offen: Adobe Acrobat bzw. Reader wählen und „Immer diese App verwenden“ anhaken.'
  Zeile 'Danach den PDF-Anhang in Outlook erneut öffnen.'
}
`,
  }),

  // ══ Remotedesktop-Zugang (nur prüfen — Freischalten über Remote Doc; Gruppen/Firewall ändern Bausteine nie) ══
  A({ id: 'rdp-zugang-pruefen', titel: 'Remotedesktop-Zugang prüfen (eingeschaltet, Richtlinie, Firewall, berechtigte Benutzer)', modus: 'system', risiko: 'lesen', timeoutMs: 60000,
    beschreibung: 'Zeigt, ob Remotedesktop auf diesem PC eingeschaltet ist, ob eine Gruppenrichtlinie es verbietet, ob die Firewall-Regeln dafür frei sind, ob der Dienst läuft und wer in der lokalen Gruppe „Remotedesktopbenutzer“ steht. Ändert nichts.',
    ps: String.raw`
$ts = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' -Name fDenyTSConnections -EA SilentlyContinue).fDenyTSConnections
Zeile ('Remotedesktop: ' + $(if ($ts -eq 0) { 'eingeschaltet' } else { 'AUS' }))
$pol = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services' -Name fDenyTSConnections -EA SilentlyContinue).fDenyTSConnections
if ($null -ne $pol) { Zeile ('Gruppenrichtlinie: Remotedesktop ' + $(if ($pol -eq 1) { 'VERBOTEN (überschreibt jede lokale Einstellung)' } else { 'erlaubt' })) }
$nla = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' -Name UserAuthentication -EA SilentlyContinue).UserAuthentication
Zeile ('Anmeldung auf Netzwerkebene (NLA): ' + $(if ($nla -eq 1) { 'an' } else { 'aus' }))
$rg = @(Get-NetFirewallRule -Group '@FirewallAPI.dll,-28752' -EA SilentlyContinue)
Zeile ('Firewall-Regeln Remotedesktop: ' + $(if ($rg.Count) { '' + @($rg | Where-Object { [string]$_.Enabled -eq 'True' }).Count + ' von ' + $rg.Count + ' frei' } else { 'keine gefunden' }))
$sv = Get-Service -Name TermService -EA SilentlyContinue
Zeile ('Dienst Remotedesktopdienste: ' + $(if ($sv) { [string]$sv.Status + ' (' + $sv.StartType + ')' } else { 'fehlt' }))
$mit = @(Get-LocalGroupMember -SID 'S-1-5-32-555' -EA SilentlyContinue | ForEach-Object { [string]$_.Name })
Zeile ('Remotedesktopbenutzer: ' + $(if ($mit.Count) { $mit -join ', ' } else { 'niemand (nur Administratoren dürfen)' }))
Zeile ('Verbinden mit: mstsc /v:' + $env:COMPUTERNAME)
`,
  }),

  // ══ Ordnerrechte mit den Kollegen vergleichen (gleiche Prüfung wie die Diagnose-Sonde „lwr“) ═══════
  A({ id: 'rechte-kollegen-vergleich', titel: 'Ordnerrechte auf W3172 mit den Abteilungskollegen vergleichen (AD)', modus: 'lokal', risiko: 'lesen', timeoutMs: 150000,
    beschreibung: 'Liest vom Admin-PC aus im AD alle Freigabegruppen von W3172 (Beschreibung „… access to \\\\W3172\\…“) und vergleicht die des angemeldeten Benutzers mit seinen Abteilungskollegen (sonst: gleicher Vorgesetzter). Zeigt, welche Ordnerberechtigung die meisten Kollegen haben und ihm fehlt – samt Gruppe für den Antrag. Braucht keinen Pfad, nur lesend – Berechtigungen ändert das Tool nie.',
    ps: String.raw`
$dgS = 'lwr'
function Fakt([string]$n, $v) { }
function Punkt([string]$t, [string]$st, [string]$x) { $z = switch ($st) { 'ok' { '✓ ' } 'fehler' { '✗ ' } 'warn' { '⚠ ' } default { '· ' } }; Zeile ($z + $t + $(if ($x) { ': ' + $x } else { '' })) }
` + (SONDEN_LAUFWERKE.find(s => s.id === 'lwr')?.ps ?? "throw 'Prüfung fehlt'") + String.raw`
Zeile 'Hinweis: Fehlende Rechte beantragt der Ordnerverantwortliche bzw. die Führungskraft in ServiceNow („Fileshare Access Request“) – Gruppe aus der Liste oben angeben.'
`,
  }),

  // ══ ALLE Berechtigungen mit den Kollegen vergleichen + Antrag/Fehlerbild je Gruppe ═══════════════
  A({ id: 'rechte-alle-vergleich', titel: 'Alle Berechtigungen (AD-Gruppen) mit den Abteilungskollegen vergleichen – mit Antrag und Fehlerbild', modus: 'lokal', risiko: 'lesen', timeoutMs: 150000,
    beschreibung: 'Liest vom Admin-PC aus im AD alle Sicherheitsgruppen des Benutzers und seiner Abteilungskollegen (sonst: gleicher Vorgesetzter). Zeigt jede Gruppe, die die meisten Kollegen haben und ihm fehlt – mit Art (Homeoffice-Rolle, Ordner, Postfach, Lizenz, Adminrechte, Software …), dem Fehlerbild ohne diese Berechtigung und dem passenden ServiceNow-Antrag. Ideal auch für neue Mitarbeiter („wurde alles bestellt?“). Nur lesend – das Tool vergibt keine Berechtigungen.',
    ps: String.raw`
$dgS = 'rechte'
function Fakt([string]$n, $v) { }
function Punkt([string]$t, [string]$st, [string]$x) { if ($t -like 'Fehlt: *') { return }; $z = switch ($st) { 'ok' { '✓ ' } 'fehler' { '✗ ' } 'warn' { '⚠ ' } default { '· ' } }; Zeile ($z + $t + $(if ($x) { ': ' + $x } else { '' })) }
` + (SONDEN_GEMEINSAM.find(s => s.id === 'rechte')?.ps ?? "throw 'Prüfung fehlt'") + String.raw`
$berTab = @((ConvertFrom-Json '` + berPsTabelle().replace(/'/g, "''") + String.raw`') | ForEach-Object { $_ })
function Einordnen([string]$cn, [string]$desc) { foreach ($t in $berTab) { if (($t.n -and $cn -match $t.n) -or ($t.b -and $desc -match $t.b)) { return $t } }; $null }
$berAlt = '` + berPsAusgemustert().replace(/'/g, "''") + String.raw`'
$alt = @($fehlen | Where-Object { ($_.cn + ' ' + $_.desc) -match $berAlt })
$fehlen = @($fehlen | Where-Object { ($_.cn + ' ' + $_.desc) -notmatch $berAlt })
if ($alt.Count) { Zeile ('(' + $alt.Count + ' ausgemusterte Verteil-/Deinstallationsgruppe(n) übersprungen – fehlen ist kein Problem)') }
foreach ($x in $fehlen) {
  $e = Einordnen $x.cn $x.desc
  Zeile ('⚠ ' + $(if ($e) { $e.t } else { 'AD-Berechtigung' }) + ': ' + $x.cn + ' fehlt (' + $x.anz + ' von ' + $n + ' Kollegen)' + $(if ($x.desc) { ' – ' + $x.desc } else { '' }))
  if ($e) { Zeile ('    Fehlerbild: ' + $e.f); Zeile ('    Antrag: ' + $e.a) }
  else { Zeile '    Antrag: über den Gruppenverantwortlichen („Manage My AD Security Groups“) bzw. passenden Zugriffsantrag in der ServiceNow Welt suchen' }
}
if ($fehlen.Count) { Zeile 'Hinweis: Berechtigungen bestellt die Führungskraft bzw. der Gruppen-/Ordnerverantwortliche in ServiceNow. Nach der Zuweisung ab- und wieder anmelden.' }
`,
  }),
]
