// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „cloud“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// OneDrive/SharePoint: Richtlinien werden nur gelesen, nie geschrieben; SharePoint, Server und Berechtigungen bleiben unberührt.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

export const AKTIONEN_CLOUD4: PaAktion[] = [
  // ══ OneDrive: Abgleich im Detail (lesend) ══════════════════════════════════
  A({ id: 'cloud-od-abgleich-details', titel: 'OneDrive im Detail: Konten, Bibliotheken, Verknüpfungen, offener Abgleich', modus: 'profil', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Je OneDrive-Konto: Adresse, Ordner, Ergebnis der letzten Anmeldung (Fehlercode 0x8004…), „Dateien bei Bedarf“; alle synchronisierten SharePoint-/Teams-Bibliotheken und Verknüpfungen in „Meine Dateien“ mit Adresse und lokalem Ordner (fehlende Ordner und abgeschaltete Office-Integration markiert); aus OneDrives eigener Diagnose: Anzahl Dateien, ausstehende Up-/Downloads, fehlgeschlagene Dateien, hängender Abgleich; dazu OneDrive-Richtlinien (z. B. erlaubte Organisationen), Clouddatei-Filter und freier Platz. Ändert nichts.',
    ps: String.raw`
NeedHive
function Zahl($x) { $v = [double]0; if ([double]::TryParse([string]$x, [ref]$v)) { return $v }; return [double]0 }
$exe = @((Join-Path $uLocal 'Microsoft\OneDrive\OneDrive.exe'), 'C:\Program Files\Microsoft OneDrive\OneDrive.exe', 'C:\Program Files (x86)\Microsoft OneDrive\OneDrive.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
Zeile ('OneDrive läuft: ' + (Ja ((UserProcs @('OneDrive')).Count -gt 0)) + ' · Version: ' + $(if ($exe) { [string](Get-Item -LiteralPath $exe).VersionInfo.ProductVersion } else { 'nicht installiert' }))
$acc = $uHive + '\Software\Microsoft\OneDrive\Accounts'
$kt = @(Get-ChildItem -Path $acc -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^(Business\d+|Personal)$' })
$ordner = New-Object System.Collections.Generic.List[string]
foreach ($a in $kt) {
  $p = Get-ItemProperty -Path $a.PSPath -EA SilentlyContinue
  if (-not $p.UserEmail -and -not $p.UserFolder) { continue }
  if ($p.UserFolder) { $ordner.Add(([string]$p.UserFolder).TrimEnd('\')) }
  Zeile ('Konto ' + $a.PSChildName + ': ' + $p.UserEmail + ' · Ordner ' + $p.UserFolder + $(if ($p.DisplayName) { ' · ' + $p.DisplayName } else { '' }) + $(if ($p.UserFolder -and -not (Test-Path -LiteralPath ([string]$p.UserFolder))) { ' (ORDNER FEHLT!)' } else { '' }))
  if ($null -ne $p.LastSignInResult) {
    $sr = [int64](Zahl $p.LastSignInResult)
    if ($sr -ne 0) { Zeile ('  Letzte Anmeldung: Fehler 0x' + ('{0:X8}' -f ($sr -band [int64]4294967295))) } else { Zeile '  Letzte Anmeldung: erfolgreich' }
  }
  if ($null -ne $p.LastKnownCloudFilesEnabled -and (Zahl $p.LastKnownCloudFilesEnabled) -eq 0) { Zeile '  „Dateien bei Bedarf“: laut OneDrive AUS (alles wird vollständig heruntergeladen)' }
}
if (-not $ordner.Count) { Zeile 'Kein OneDrive-Konto eingerichtet bzw. angemeldet.' }
$se = $uHive + '\Software\SyncEngines\Providers\OneDrive'
$bib = @(Get-ChildItem -Path $se -EA SilentlyContinue | ForEach-Object { Get-ItemProperty -Path $_.PSPath -EA SilentlyContinue } | Where-Object { $_.MountPoint } | Sort-Object { [string]$_.MountPoint } -Unique)
Zeile ('Eingebundene Bibliotheken/Ordner: ' + $bib.Count)
foreach ($b in @($bib | Select-Object -First 30)) {
  $mp = ([string]$b.MountPoint).TrimEnd('\')
  $art = 'synchronisierte Bibliothek'
  if ([string]$b.LibraryType -match '^(?i)(mysite|personal)$') { $art = 'eigenes OneDrive' }
  else { foreach ($o in $ordner) { if ($mp.StartsWith($o + '\', [StringComparison]::OrdinalIgnoreCase)) { $art = 'Verknüpfung in „Meine Dateien“' } } }
  Zeile ('  ' + $art + ': ' + $mp + ' ← ' + [string]$b.UrlNamespace + $(if (-not (Test-Path -LiteralPath $mp)) { ' (lokaler Ordner fehlt!)' } else { '' }) + $(if ($null -ne $b.IsOfficeSyncIntegrationEnabled -and (Zahl $b.IsOfficeSyncIntegrationEnabled) -eq 0) { ' · Office-Integration AUS (kein gemeinsames Bearbeiten in der Desktop-App)' } else { '' }))
}
if ($bib.Count -gt 30) { Zeile ('  … und ' + ($bib.Count - 30) + ' weitere') }
foreach ($a in $kt) {
  $f = Join-Path $uLocal ('Microsoft\OneDrive\logs\' + $a.PSChildName + '\SyncDiagnostics.log')
  if (-not (Test-Path -LiteralPath $f)) { continue }
  $d = @{}
  foreach ($l in @(Get-Content -LiteralPath $f -EA SilentlyContinue)) { $m = [regex]::Match([string]$l, '^\s*([A-Za-z_]+)\s*[=:]\s*(.*?)\s*$'); if ($m.Success -and -not $d.ContainsKey($m.Groups[1].Value)) { $d[$m.Groups[1].Value] = $m.Groups[2].Value } }
  $alter = [math]::Round(((Get-Date) - (Get-Item -LiteralPath $f).LastWriteTime).TotalMinutes)
  Zeile ('Abgleich ' + $a.PSChildName + ' (Diagnose von vor ' + $alter + ' min): ' + (Zahl $d['files']) + ' Dateien, ' + (Zahl $d['folders']) + ' Ordner in ' + (Zahl $d['numDrives']) + ' Bibliothek(en)')
  Zeile ('  Ausstehend: hochladen ' + (Zahl $d['FilesToUpload']) + ' Dateien (' + (Groesse (Zahl $d['BytesToUpload'])) + '), herunterladen ' + (Zahl $d['FilesToDownload']) + ' Dateien (' + (Groesse (Zahl $d['BytesToDownload'])) + '), Änderungen in Arbeit ' + (Zahl $d['ChangesToProcess']))
  $fu = Zahl $d['numFileFailedUploads']; $fd = Zahl $d['numFileFailedDownloads']; $fw = Zahl $d['numFileInWarning']
  if ($fu + $fd + $fw -gt 0) { Zeile ('  Fehlgeschlagen: ' + $fu + ' Uploads, ' + $fd + ' Downloads, ' + $fw + ' Dateien mit Warnung → „Synchronisierungsprobleme finden“') }
  if ((Zahl $d['syncStallDetected']) -gt 0 -or (Zahl $d['scanStateStallDetected']) -gt 0) { Zeile '  OneDrive meldet selbst einen HÄNGENDEN Abgleich (Stall) → OneDrive neu starten, sonst zurücksetzen.' }
  if ((Zahl $d['drivesWaitingForInitialSync']) -gt 0) { Zeile ('  ' + (Zahl $d['drivesWaitingForInitialSync']) + ' Bibliothek(en) warten noch auf den ersten Abgleich.') }
  if ((Zahl $d['files']) -gt 300000) { Zeile '  Mehr als 300.000 Dateien synchronisiert — darüber wird OneDrive träge (Microsoft-Empfehlung). Alte Bibliotheken beenden oder nur Unterordner einbinden.' }
  if ($d.ContainsKey('placeholdersEnabled') -and (Zahl $d['placeholdersEnabled']) -eq 0) { Zeile '  Platzhalter („Dateien bei Bedarf“) sind AUS.' }
  if ((Zahl $d['UploadSpeedBytesPerSec']) -gt 0) { Zeile ('  Aktuelle Upload-Rate: ' + (Groesse (Zahl $d['UploadSpeedBytesPerSec'])) + '/s') }
}
foreach ($pk in @('HKLM:\SOFTWARE\Policies\Microsoft\OneDrive', ($uHive + '\Software\Policies\Microsoft\OneDrive'))) {
  $pol = Get-Item -Path $pk -EA SilentlyContinue
  if (-not $pol) { continue }
  $w = @($pol.GetValueNames() | Where-Object { $_ } | Select-Object -First 25 | ForEach-Object { $_ + '=' + [string]$pol.GetValue($_) })
  $sub = @(Get-ChildItem -Path $pk -EA SilentlyContinue | ForEach-Object { $_.PSChildName + ' (' + $_.ValueCount + ' Einträge)' })
  Zeile ('Richtlinien ' + $(if ($pk -like 'HKLM*') { 'Computer' } else { 'Benutzer' }) + ': ' + $(if ($w.Count) { $w -join ' · ' } else { '—' }) + $(if ($sub.Count) { ' · Listen: ' + ($sub -join ', ') } else { '' }))
  if ($sub -match '^AllowTenantList') { Zeile '  AllowTenantList: Nur Bibliotheken aus freigegebenen Organisationen (Mandanten) dürfen synchronisiert werden.' }
}
$cf = Get-CimInstance Win32_SystemDriver -Filter "Name='CldFlt'" -EA SilentlyContinue
Zeile ('Clouddatei-Filter (cldflt, für „Dateien bei Bedarf“): ' + $(if ($cf) { [string]$cf.State + ', Start ' + [string]$cf.StartMode } else { 'nicht vorhanden!' }))
if ($ordner.Count) {
  $q = Split-Path -Path $ordner[0] -Qualifier
  try { $di = New-Object System.IO.DriveInfo($q); Zeile ('Freier Platz ' + $q + ' ' + (Groesse $di.AvailableFreeSpace) + ' von ' + (Groesse $di.TotalSize) + ' · Dateisystem ' + $di.DriveFormat + $(if ($di.DriveFormat -ne 'NTFS') { ' — OneDrive braucht NTFS!' } else { '' })) } catch {}
}` }),

  // ══ Explorer-Ansicht / WebDAV ═════════════════════════════════════════════
  A({ id: 'cloud-webdav-reparieren', titel: 'WebClient-Dienst für „Im Explorer öffnen“ reparieren (WebDAV, Dateigrenze 4 GB)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Für die SharePoint-Explorer-Ansicht und als Laufwerk verbundene SharePoint-Bibliotheken: Ein deaktivierter Dienst „WebClient“ wird wieder auf „Manuell“ gestellt und (neu) gestartet; das WebDAV-Größenlimit (Standard 50 MB, Fehler 0x800700DF „Die Dateigröße überschreitet die zulässige Grenze“) wird auf 4 GB angehoben. Zeigt alte und neue Werte; prüft, ob WebClient in der Netzwerkanbieter-Reihenfolge steht.',
    ps: String.raw`
$s = Get-Service -Name WebClient -EA SilentlyContinue
if (-not $s) { throw 'Der Dienst „WebClient“ ist auf diesem PC nicht vorhanden (Windows-Funktion fehlt) — nichts geändert.' }
Zeile ('WebClient vorher: ' + $s.Status + ', Starttyp ' + $s.StartType)
if ([string]$s.StartType -eq 'Disabled') { Set-Service -Name WebClient -StartupType Manual -EA Stop; Zeile 'Starttyp: Deaktiviert → Manuell' }
$k = 'HKLM:\SYSTEM\CurrentControlSet\Services\WebClient\Parameters'
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
$roh = (Get-ItemProperty -Path $k -Name FileSizeLimitInBytes -EA SilentlyContinue).FileSizeLimitInBytes
$alt = [int64]50000000
if ($null -ne $roh) { $alt = [int64]$roh -band [int64]4294967295 }
if ($alt -lt [int64]4294967295) {
  Set-ItemProperty -Path $k -Name FileSizeLimitInBytes -Value ([int32]-1) -Type DWord
  Zeile ('Größenlimit je Datei (FileSizeLimitInBytes): ' + (Groesse ([double]$alt)) + $(if ($null -eq $roh) { ' (Windows-Standard)' } else { '' }) + ' → 4 GB')
} else { Zeile 'Größenlimit je Datei: war schon 4 GB' }
$po = [string](Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\NetworkProvider\Order' -EA SilentlyContinue).ProviderOrder
if ($po -and $po -notmatch '(?i)webclient') { Zeile ('ACHTUNG: WebClient fehlt in der Netzwerkanbieter-Reihenfolge (' + $po + ') — „Im Explorer öffnen“ geht dann nicht; Fall für DXC.') }
$s = Get-Service -Name WebClient
if ([string]$s.Status -eq 'Running') { Restart-Service -Name WebClient -Force -EA Stop } else { Start-Service -Name WebClient -EA Stop }
Start-Sleep -Seconds 1
Zeile ('WebClient jetzt: ' + (Get-Service -Name WebClient).Status + ' — offene Explorer-Ansichten von SharePoint schließen und neu öffnen.')` }),

  // ══ Dateien bei Bedarf: Clouddatei-Filter ══════════════════════════════════
  A({ id: 'cloud-clouddateifilter', titel: 'Clouddatei-Filter (cldflt) für „Dateien bei Bedarf“ wieder einschalten', modus: 'system', risiko: 'aendern',
    beschreibung: 'OneDrive meldet „OneDrive kann keine Verbindung mit Windows herstellen – Dateien bei Bedarf …“ oder Platzhalter funktionieren nicht: Der Windows-Treiber „Cloud Files Mini Filter“ (cldflt) wurde abgeschaltet (Tuning-Programm, Image, Reparatur). Stellt seinen Start wieder auf „Automatisch“, lädt den Filter sofort und zeigt den Zustand vorher/nachher. Fehlt der Treiber ganz, wird nichts geändert (dann SFC/DISM).',
    ps: String.raw`
$k = 'HKLM:\SYSTEM\CurrentControlSet\Services\CldFlt'
if (-not (Test-Path $k)) { throw 'Der Clouddatei-Filtertreiber (cldflt) ist nicht registriert — Windows-Komponente beschädigt: „Systemdateien prüfen (SFC)“ bzw. „Windows-Abbild reparieren (DISM)“. Nichts geändert.' }
$namen = @{ 0 = 'Boot'; 1 = 'System'; 2 = 'Automatisch'; 3 = 'Manuell'; 4 = 'Deaktiviert' }
$alt = (Get-ItemProperty -Path $k -EA SilentlyContinue).Start
$altT = if ($null -eq $alt) { 'fehlt' } else { [string]$namen[[int]$alt] + ' (' + $alt + ')' }
if ($alt -ne 2) { Set-ItemProperty -Path $k -Name Start -Value 2 -Type DWord; Zeile ('Start von cldflt: ' + $altT + ' → Automatisch (2)') } else { Zeile 'Start von cldflt: Automatisch (2) — war schon richtig' }
$inst = [string](Get-ItemProperty ($k + '\Instances') -EA SilentlyContinue).DefaultInstance
if (-not $inst) { Zeile 'Instanz-Eintrag des Filters fehlt — dann hilft nur „Windows-Abbild reparieren (DISM)“ bzw. ein Windows-Update.' }
$cf = Get-CimInstance Win32_SystemDriver -Filter "Name='CldFlt'" -EA SilentlyContinue
Zeile ('Filter vorher: ' + $(if ($cf) { [string]$cf.State } else { 'unbekannt' }))
if (-not $cf -or [string]$cf.State -ne 'Running') {
  $o = (& fltmc.exe load CldFlt 2>&1 | Out-String).Trim()
  Start-Sleep -Seconds 2
  $cf = Get-CimInstance Win32_SystemDriver -Filter "Name='CldFlt'" -EA SilentlyContinue
  if ($cf -and [string]$cf.State -eq 'Running') { Zeile 'Filter jetzt: läuft — OneDrive neu starten.' } else { Zeile ('Filter ließ sich nicht sofort laden (' + $o + ') — wirkt nach dem nächsten Neustart des PCs.') }
} else { Zeile 'Filter läuft — OneDrive neu starten, damit es sich wieder mit Windows verbindet.' }` }),

  // ══ Windows-Einstellungen beim Benutzer öffnen ═══════════════════════════
  A({ id: 'cloud-einstellungen-oeffnen', titel: 'Windows-Einstellung zu OneDrive beim Benutzer öffnen (Automatische Dateidownloads, Speicheroptimierung …)', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Öffnet in der Sitzung des Benutzers die passende Seite der Windows-Einstellungen, auf der nur er selbst entscheiden kann: „Automatische Dateidownloads“ (dort ein gesperrtes Programm wieder zulassen), „Speicheroptimierung“ (wann OneDrive-Dateien automatisch wieder nur online werden), „Speicher“-Übersicht oder „Auf Arbeits- oder Schulkonto zugreifen“. Ändert selbst keine Einstellung.',
    param: { label: 'Welche Einstellung', platzhalter: 'Automatische Dateidownloads', pflicht: true, optionen: ['Automatische Dateidownloads', 'Speicheroptimierung', 'Speicher-Übersicht', 'Arbeits- oder Schulkonto'] },
    ps: String.raw`
$ziel = @{ 'Automatische Dateidownloads' = 'ms-settings:privacy-automaticfiledownloads'; 'Speicheroptimierung' = 'ms-settings:storagepolicies'; 'Speicher-Übersicht' = 'ms-settings:storagesense'; 'Arbeits- oder Schulkonto' = 'ms-settings:workplace' }
$w = $P.Trim()
$t = @($ziel.Keys | Where-Object { $_ -ieq $w })
if (-not $t.Count) { throw ('Einstellung nicht erlaubt: ' + $w) }
Start-Process $ziel[$t[0]]
Zeile ('Beim Benutzer geöffnet: Einstellungen → ' + $t[0] + ' (' + $ziel[$t[0]] + ')')` }),

  // ══ OneDrive-Protokolle für DXC/Microsoft ═════════════════════════════════
  A({ id: 'cloud-od-protokolle-sammeln', titel: 'OneDrive-Protokolle für den Support sammeln (ZIP auf den Desktop)', modus: 'profil', risiko: 'aendern', timeoutMs: 180000,
    beschreibung: 'Packt die OneDrive-Protokolle des Benutzers der letzten Tage (Ordner „logs“ inkl. SyncDiagnostics, höchstens 300 MB), eine Zustandsübersicht (Version, Konten, letzte Anmeldeergebnisse) und die OneDrive-Abstürze aus der Ereignisanzeige in eine ZIP-Datei auf den Desktop des Benutzers — für ein Ticket bei DXC/Microsoft. Nichts wird gelöscht oder auf einen Server geschrieben.',
    param: { label: 'Wie viele Tage zurück (1–14)', platzhalter: '7', pflicht: false },
    ps: String.raw`
NeedHive
$tage = 7
$roh = ([string]$P).Trim()
if ($roh) {
  if ($roh -notmatch '^\d{1,2}$') { throw ('Bitte eine Zahl von 1 bis 14 angeben — nicht erlaubt: ' + $roh) }
  $tage = [int]$roh
  if ($tage -lt 1 -or $tage -gt 14) { throw 'Bitte 1 bis 14 Tage angeben.' }
}
$quelle = Join-Path $uLocal 'Microsoft\OneDrive\logs'
if (-not (Test-Path -LiteralPath $quelle)) { throw 'Kein OneDrive-Protokollordner gefunden (OneDrive wurde für diesen Benutzer nie gestartet) — nichts erstellt.' }
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
$desk = Join-Path $uProf 'Desktop'
$rd = $null; try { $rd = [string](Get-Item ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') -EA Stop).GetValue('Desktop', $null, 'DoNotExpandEnvironmentNames') } catch {}
if ($rd) { $rd = $rd -replace '(?i)%USERPROFILE%', $uProf; if ($rd -notmatch '%' -and (Test-Path -LiteralPath $rd)) { $desk = $rd } }
$tmp = Join-Path $uLocal ('Temp\ITAdminTool_OneDriveLogs_' + $stamp)
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
function Kopie([string]$q, [string]$z) {
  $in = $null; $out = $null
  try { $in = [IO.File]::Open($q, 'Open', 'Read', 'ReadWrite, Delete'); $out = [IO.File]::Create($z); $in.CopyTo($out); return $true } catch { return $false } finally { if ($out) { $out.Close() }; if ($in) { $in.Close() } }
}
$seit = (Get-Date).AddDays(-$tage); $n = 0; $summe = [double]0; $voll = $false
foreach ($f in @(Get-ChildItem -LiteralPath $quelle -Recurse -File -Force -EA SilentlyContinue | Where-Object { $_.LastWriteTime -ge $seit } | Sort-Object LastWriteTime -Descending)) {
  if ($summe + $f.Length -gt 300MB) { $voll = $true; break }
  $z = Join-Path (Join-Path $tmp 'logs') $f.FullName.Substring($quelle.Length).TrimStart('\')
  $zd = Split-Path $z -Parent
  if (-not (Test-Path -LiteralPath $zd)) { New-Item -ItemType Directory -Path $zd -Force | Out-Null }
  if (Kopie $f.FullName $z) { $n++; $summe = $summe + $f.Length }
}
$info = New-Object System.Collections.Generic.List[string]
$info.Add('PC: ' + $env:COMPUTERNAME + ' · Benutzer: ' + $uDomUser + ' · erstellt ' + (Get-Date).ToString('dd.MM.yyyy HH:mm') + ' · Zeitraum ' + $tage + ' Tage')
$exe = @((Join-Path $uLocal 'Microsoft\OneDrive\OneDrive.exe'), 'C:\Program Files\Microsoft OneDrive\OneDrive.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$info.Add('OneDrive: ' + $(if ($exe) { $exe + ' · ' + [string](Get-Item -LiteralPath $exe).VersionInfo.ProductVersion } else { 'nicht gefunden' }))
foreach ($a in @(Get-ChildItem ($uHive + '\Software\Microsoft\OneDrive\Accounts') -EA SilentlyContinue)) { $p = Get-ItemProperty $a.PSPath -EA SilentlyContinue; if ($p.UserEmail) { $info.Add('Konto ' + $a.PSChildName + ': ' + $p.UserEmail + ' · ' + $p.UserFolder + ' · LastSignInResult ' + $p.LastSignInResult + ' · LastShutdownReason ' + $p.LastShutdownReason) } }
$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Error', 'Application Hang'; StartTime = $seit } -MaxEvents 400 -EA SilentlyContinue | Where-Object { [string]$_.Properties[0].Value -match '^(?i)(OneDrive|FileCoAuth|OneDriveStandaloneUpdater|FileSyncHelper)\.exe$' })
foreach ($e in $ev) { $info.Add($e.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss') + ' · ' + $e.ProviderName + ' · ' + ((([string]$e.Message -split '\r?\n') | Select-Object -First 3) -join ' ')) }
$info | Out-File -LiteralPath (Join-Path $tmp 'Zustand.txt') -Encoding UTF8
$zip = Join-Path $desk ('OneDrive-Protokolle_' + $env:COMPUTERNAME + '_' + $stamp + '.zip')
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($tmp, $zip)
Remove-Item -LiteralPath $tmp -Recurse -Force -EA SilentlyContinue
Zeile ('ZIP auf dem Desktop: ' + $zip)
Zeile ('Inhalt: ' + $n + ' Protokolldateien (' + (Groesse $summe) + ')' + $(if ($voll) { ', Grenze 300 MB erreicht — ältere weggelassen' } else { '' }) + ' · ' + $ev.Count + ' OneDrive-Abstürze/Hänger · Zustand.txt')` }),
]
