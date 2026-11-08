// ── Problem-Assistent: Lösungsbausteine Gruppe „zugang“ (Runde 3) ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Bereiche: VPN & Zscaler · Netzlaufwerke & Dateien.
// Grundsätze dieser Datei: Auf Servern/Freigaben wird NIE geschrieben (nur gelesen), Rechte werden nie
// geändert, Zscaler-Richtlinien nie angefasst, Zscaler nie abgeschaltet oder deinstalliert.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Verknüpfungen des Benutzers finden (läuft in der Benutzersitzung). */
const VK_PS = String.raw`
function VkOrte([bool]$oeffentlich) {
  $o = @()
  $kand = @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:USERPROFILE 'Desktop'), [Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Favorites'), (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'), (Join-Path $env:USERPROFILE 'Links'))
  if ($oeffentlich) { $kand += [Environment]::GetFolderPath('CommonDesktopDirectory') }
  foreach ($x in $kand) { if ($x -and (Test-Path -LiteralPath $x) -and ($o -notcontains $x)) { $o += $x } }
  $o
}
function VkDateien([string[]]$orte) { $l = @(); foreach ($o in $orte) { $l += @(Get-ChildItem -LiteralPath $o -Recurse -Filter '*.lnk' -File -Force -EA SilentlyContinue | Select-Object -First 1500) }; $l }
$lwZiel = @{}
foreach ($m in @(Get-SmbMapping -EA SilentlyContinue)) { $lwZiel[([string]$m.LocalPath).ToUpper()] = [string]$m.RemotePath }
foreach ($f in @(Get-ChildItem 'HKCU:\Network' -EA SilentlyContinue)) { $bb = $f.PSChildName.ToUpper() + ':'; if (-not $lwZiel.ContainsKey($bb)) { $lwZiel[$bb] = [string](Get-ItemProperty $f.PSPath).RemotePath } }
function VkNetz([string]$z) {
  if ($z -match '^\\\\([^\\]+)\\') { return $matches[1].ToLower() }
  if ($z -match '^([A-Za-z]:)') { $d = $matches[1].ToUpper(); if ($lwZiel.ContainsKey($d)) { return $d }; if (-not (Test-Path ($d + '\'))) { return $d } }
  return $null
}
`

/** Vorgängerversionen (Schattenkopien) einer Netzfreigabe auflisten — rein lesend (FSCTL_SRV_ENUMERATE_SNAPSHOTS wie der Explorer-Reiter). */
const SNAP_PS = String.raw`
if (-not ('PaSnap' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class PaSnap {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool DeviceIoControl(SafeFileHandle h, uint code, IntPtr inBuf, uint inSize, IntPtr outBuf, uint outSize, out uint ret, IntPtr ov);
  static void Rufe(SafeFileHandle h, IntPtr buf, uint size) {
    uint ret;
    if (!DeviceIoControl(h, 0x00144064, IntPtr.Zero, 0, buf, size, out ret, IntPtr.Zero)) {
      int e = Marshal.GetLastWin32Error();
      if (e != 234) throw new System.ComponentModel.Win32Exception(e);
    }
  }
  public static string[] Liste(string ordner) {
    using (SafeFileHandle h = CreateFileW(ordner, 0x80000000, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero)) {
      if (h.IsInvalid) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
      IntPtr b = Marshal.AllocHGlobal(16);
      int anzahl, groesse;
      try { Rufe(h, b, 16); anzahl = Marshal.ReadInt32(b, 0); groesse = Marshal.ReadInt32(b, 8); } finally { Marshal.FreeHGlobal(b); }
      if (anzahl <= 0 || groesse <= 0) return new string[0];
      int voll = 12 + groesse + 16;
      b = Marshal.AllocHGlobal(voll);
      try {
        Rufe(h, b, (uint)voll);
        int g2 = Marshal.ReadInt32(b, 8);
        string s = Marshal.PtrToStringUni(new IntPtr(b.ToInt64() + 12), Math.Max(0, g2 / 2));
        return s.Split(new char[] { '\0' }, StringSplitOptions.RemoveEmptyEntries);
      } finally { Marshal.FreeHGlobal(b); }
    }
  }
}
'@
}
function SnapZiel([string]$p) {
  $p = $p.Trim().Trim('"').TrimEnd('\')
  if ($p -match '[*?<>|]' -or $p -match '@GMT-') { throw 'Der Pfad enthält ungültige Zeichen.' }
  if ($p -match '^(\\\\[^\\]+\\[^\\]+)(\\.*)?$') { return @($matches[1], [string]$matches[2]) }
  if ($p -match '^([A-Za-z]:)(\\.*)?$') { return @($matches[1].ToUpper(), [string]$matches[2]) }
  throw 'Bitte den vollständigen Pfad angeben, z. B. I:\Projekte\Angebot.xlsx oder \\server\freigabe\Ordner'
}
function SnapOrdner([string]$voll, [string]$root) {
  $d = $voll
  while ($d -and $d.Length -gt ($root.Length + 1)) { if (Test-Path -LiteralPath $d -PathType Container) { return $d }; $d = Split-Path $d -Parent }
  return ($root + '\')
}
function SnapListe([string]$ordner) {
  $tok = @()
  try { $tok = @([PaSnap]::Liste($ordner)) } catch { throw ('Vorgängerversionen nicht abrufbar (' + $_.Exception.Message + ') — das geht nur auf Netzlaufwerken, deren Server Schattenkopien anbietet.') }
  @($tok | Where-Object { $_ -match '^@GMT-\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}$' } | ForEach-Object { [pscustomobject]@{ Tok = $_; Zeit = [DateTime]::SpecifyKind([datetime]::ParseExact($_.Substring(5), 'yyyy.MM.dd-HH.mm.ss', [Globalization.CultureInfo]::InvariantCulture), 'Utc').ToLocalTime() } } | Sort-Object Zeit -Descending)
}
`

export const AKTIONEN_ZUGANG: PaAktion[] = [
  // ══ Zscaler ═════════════════════════════════════════════════════════════════
  A({ id: 'zg-zscaler-zertifikat-pruefen', titel: 'Zscaler-Zertifikat prüfen (Windows, Entwicklerwerkzeuge, Firefox)', modus: 'profil', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Liegt das Zscaler-Stammzertifikat im Computer-Speicher, stellt Zscaler die TLS-Zertifikate aus (SSL-Prüfung), und kennen Git, Python, Node.js, Java und Firefox des Benutzers das Zertifikat?',
    ps: String.raw`
$jetzt = Get-Date
$roots = @(Get-ChildItem Cert:\LocalMachine\Root -EA SilentlyContinue | Where-Object { $_.Subject -match 'Zscaler' })
if (-not $roots.Count) { Zeile 'Zscaler-Stammzertifikat im Computer-Speicher (Vertrauenswürdige Stammzertifizierungsstellen): FEHLT — Computer-Richtlinien neu anwenden bzw. DXC.' }
foreach ($c in $roots) {
  $t = [int]($c.NotAfter - $jetzt).TotalDays
  Zeile ('Zscaler-Stammzertifikat: ' + $c.Subject + ' · gültig bis ' + $c.NotAfter.ToString('dd.MM.yyyy') + ' · Fingerabdruck ' + $c.Thumbprint + $(if ($t -lt 0) { ' · ABGELAUFEN' } elseif ($t -lt 60) { ' · läuft in ' + $t + ' Tagen ab' } else { '' }))
}
foreach ($c in @(Get-ChildItem Cert:\LocalMachine\CA -EA SilentlyContinue | Where-Object { $_.Subject -match 'Zscaler' })) { Zeile ('Zscaler-Zwischenzertifikat: ' + $c.Subject + ' · gültig bis ' + $c.NotAfter.ToString('dd.MM.yyyy')) }
$s = Get-Service ZSAService -EA SilentlyContinue
Zeile ('Zscaler-Dienst: ' + $(if ($s) { [string]$s.Status } else { 'nicht installiert' }))
foreach ($ziel in 'pypi.org', 'registry.npmjs.org', 'github.com') {
  $aus = 'nicht erreichbar'
  try {
    $tc = New-Object System.Net.Sockets.TcpClient
    if ($tc.ConnectAsync($ziel, 443).Wait(4000)) {
      $cb = [System.Net.Security.RemoteCertificateValidationCallback] { param($a1, $a2, $a3, $a4) $true }
      $ssl = New-Object System.Net.Security.SslStream($tc.GetStream(), $false, $cb)
      $ssl.ReadTimeout = 6000; $ssl.WriteTimeout = 6000
      $ssl.AuthenticateAsClient($ziel)
      $iss = [string]$ssl.RemoteCertificate.Issuer
      $cn = $iss -replace '^.*?CN=([^,]+).*$', '$1'
      $aus = $(if ($iss -match 'Zscaler') { 'von Zscaler geprüft (Aussteller ' + $cn + ')' } else { 'ohne SSL-Prüfung (Aussteller ' + $cn + ')' })
      $ssl.Close()
    }
    $tc.Close()
  } catch { $aus = 'Fehler: ' + $_.Exception.Message }
  Zeile ('TLS-Verbindung ' + $ziel + ': ' + $aus)
}
if ($uHive) {
  $uv = Get-ItemProperty ($uHive + '\Environment') -EA SilentlyContinue
  $gesetzt = 0
  foreach ($n in 'NODE_EXTRA_CA_CERTS', 'REQUESTS_CA_BUNDLE', 'SSL_CERT_FILE', 'PIP_CERT', 'GIT_SSL_CAINFO', 'CURL_CA_BUNDLE', 'JAVA_TOOL_OPTIONS') {
    $v = [string]$uv.$n
    if ($v) { $gesetzt++; $vp = $v -replace '%USERPROFILE%', $uProf; Zeile ('Benutzer-Variable ' + $n + ' = ' + $v + $(if ($vp -match '^[A-Za-z]:\\' -and -not (Test-Path -LiteralPath $vp)) { ' · Datei FEHLT' } else { '' })) }
  }
  if (-not $gesetzt) { Zeile 'Benutzer-Variablen für Entwicklerwerkzeuge (NODE_EXTRA_CA_CERTS, REQUESTS_CA_BUNDLE, GIT_SSL_CAINFO …): keine gesetzt.' }
} else { Zeile 'Kein Benutzer angemeldet — nur der Computer-Speicher wurde geprüft.' }
if ($uProf) {
  $gc = Join-Path $uProf '.gitconfig'
  if (Test-Path -LiteralPath $gc) { $z = @(Get-Content -LiteralPath $gc -EA SilentlyContinue | Where-Object { $_ -match 'sslbackend|sslcainfo|sslverify' }); Zeile ('Git (.gitconfig): ' + $(if ($z.Count) { (@($z | ForEach-Object { $_.Trim() })) -join ' · ' } else { 'kein SSL-Eintrag (Standard)' })) }
  $np = Join-Path $uProf '.npmrc'
  if (Test-Path -LiteralPath $np) { $z = @(Get-Content -LiteralPath $np -EA SilentlyContinue | Where-Object { $_ -match 'cafile|strict-ssl' }); Zeile ('npm (.npmrc): ' + $(if ($z.Count) { (@($z | ForEach-Object { $_.Trim() })) -join ' · ' } else { 'kein Zertifikatseintrag' })) }
  $pi = Join-Path $uRoam 'pip\pip.ini'
  if (Test-Path -LiteralPath $pi) { $z = @(Get-Content -LiteralPath $pi -EA SilentlyContinue | Where-Object { $_ -match '^\s*(cert|trusted-host)' }); Zeile ('pip (pip.ini): ' + $(if ($z.Count) { (@($z | ForEach-Object { $_.Trim() })) -join ' · ' } else { 'kein Zertifikatseintrag' })) }
  $ffProf = Join-Path $uRoam 'Mozilla\Firefox\Profiles'
  if (Test-Path -LiteralPath $ffProf) {
    $ffPol = (Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Mozilla\Firefox\Certificates' -EA SilentlyContinue).ImportEnterpriseRoots
    $an = $false
    foreach ($pf in @(Get-ChildItem -LiteralPath $ffProf -Recurse -Filter 'prefs.js' -EA SilentlyContinue)) { if (Select-String -LiteralPath $pf.FullName -Pattern 'security.enterprise_roots.enabled", true' -SimpleMatch -Quiet) { $an = $true } }
    Zeile ('Firefox: Unternehmenszertifikate ' + $(if ($ffPol -eq 1 -or $an) { 'zugelassen' } else { 'NICHT zugelassen (security.enterprise_roots.enabled)' }))
  }
}
$java = @(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { [string]$_.DisplayName -match '^(Java |Java\(|Eclipse Temurin|Amazon Corretto|Microsoft Build of OpenJDK|Zulu|OpenJDK)' })
foreach ($j in $java | Select-Object -First 4) { Zeile ('Java: ' + $j.DisplayName + ' — eigener Zertifikatsspeicher (cacerts), kennt Zscaler nur nach Einbindung.') }` }),

  A({ id: 'zg-zscaler-zertifikat-bereitstellen', titel: 'Zscaler-Zertifikat für Entwicklerwerkzeuge bereitstellen (Node.js, Python, Git, Java)', modus: 'benutzer', risiko: 'aendern', timeoutMs: 90000,
    beschreibung: 'Exportiert das Zscaler-Stammzertifikat und die Windows-Stammzertifikate als PEM-Datei ins Profil des Benutzers (Ordner .zscaler) und setzt nur für diesen Benutzer die passende Umgebungsvariable. Nichts wird systemweit geändert.',
    param: { label: 'Für welche Werkzeuge', platzhalter: 'Node.js + Python + Git', pflicht: true, optionen: ['Node.js + Python + Git', 'Node.js', 'Python/pip', 'Git', 'Java (Windows-Zertifikatsspeicher)'] },
    ps: String.raw`
$w = $P.Trim()
$alle = @('Node.js + Python + Git', 'Node.js', 'Python/pip', 'Git', 'Java (Windows-Zertifikatsspeicher)')
if ($alle -notcontains $w) { throw ('Auswahl nicht erlaubt: ' + $w) }
$jetzt = Get-Date
$zs = @(Get-ChildItem Cert:\LocalMachine\Root -EA SilentlyContinue | Where-Object { $_.Subject -match 'Zscaler' -and $_.NotAfter -gt $jetzt })
if (-not $zs.Count) { throw 'Kein gültiges Zscaler-Stammzertifikat im Computer-Speicher — zuerst „Gruppenrichtlinien neu anwenden“ (Computer) bzw. DXC.' }
$nl = [string][char]13 + [char]10
function Pem($c) { $b = [Convert]::ToBase64String($c.RawData); $zl = @(); for ($i = 0; $i -lt $b.Length; $i += 64) { $zl += $b.Substring($i, [math]::Min(64, $b.Length - $i)) }; '-----BEGIN CERTIFICATE-----' + $nl + ($zl -join $nl) + $nl + '-----END CERTIFICATE-----' + $nl }
$ord = Join-Path $env:USERPROFILE '.zscaler'
if (-not (Test-Path -LiteralPath $ord)) { New-Item -Path $ord -ItemType Directory -Force | Out-Null }
$enc = New-Object System.Text.UTF8Encoding($false)
$fZs = Join-Path $ord 'zscaler-root.pem'
$fAll = Join-Path $ord 'ca-bundle.pem'
$warZs = Test-Path -LiteralPath $fZs; $warAll = Test-Path -LiteralPath $fAll
[IO.File]::WriteAllText($fZs, ((@($zs | ForEach-Object { Pem $_ })) -join ''), $enc)
$roots = @(Get-ChildItem Cert:\LocalMachine\Root -EA SilentlyContinue | Where-Object { $_.NotAfter -gt $jetzt })
[IO.File]::WriteAllText($fAll, ((@($roots | ForEach-Object { '# ' + ($_.Subject -replace '[\r\n]', ' ') + $nl + (Pem $_) })) -join ''), $enc)
Zeile ('Zscaler-Zertifikat: ' + $fZs + ' (' + $(if ($warZs) { 'erneuert' } else { 'neu angelegt' }) + ')')
Zeile ('Zertifikatsbündel (Windows-Stammzertifikate inkl. Zscaler, ' + $roots.Count + ' Stück): ' + $fAll + ' (' + $(if ($warAll) { 'erneuert' } else { 'neu angelegt' }) + ')')
$ziele = @()
if ($w -eq 'Node.js + Python + Git' -or $w -eq 'Node.js') { $ziele += ,@('NODE_EXTRA_CA_CERTS', $fZs) }
if ($w -eq 'Node.js + Python + Git' -or $w -eq 'Python/pip') { $ziele += ,@('REQUESTS_CA_BUNDLE', $fAll); $ziele += ,@('PIP_CERT', $fAll); $ziele += ,@('SSL_CERT_FILE', $fAll) }
if ($w -eq 'Node.js + Python + Git' -or $w -eq 'Git') { $ziele += ,@('GIT_SSL_CAINFO', $fAll) }
if ($w -like 'Java*') {
  $alt = [string][Environment]::GetEnvironmentVariable('JAVA_TOOL_OPTIONS', 'User')
  $teil = '-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT'
  if ($alt -match 'trustStoreType') { Zeile ('JAVA_TOOL_OPTIONS enthält schon einen Zertifikatsspeicher: ' + $alt + ' — nicht geändert.') }
  else { $ziele += ,@('JAVA_TOOL_OPTIONS', ((($alt + ' ' + $teil).Trim()))) }
}
foreach ($z in $ziele) {
  $alt = [string][Environment]::GetEnvironmentVariable($z[0], 'User')
  if ($alt -ieq $z[1]) { Zeile ('' + $z[0] + ': schon gesetzt (' + $alt + ')'); continue }
  [Environment]::SetEnvironmentVariable($z[0], $z[1], 'User')
  Zeile ('' + $z[0] + ': vorher ' + $(if ($alt) { $alt } else { '(leer)' }) + ' → jetzt ' + $z[1])
}
Zeile 'Gilt nur für diesen Benutzer. Terminal, IDE bzw. Programm bitte neu starten (oder einmal ab- und anmelden).'` }),

  A({ id: 'zg-zscaler-protokolle-sammeln', titel: 'Zscaler-Protokolle als ZIP auf den Desktop legen', modus: 'profil', risiko: 'lesen', timeoutMs: 180000,
    beschreibung: 'Packt die Zscaler-Protokolle der letzten Tage (Benutzer und System) und eine kurze Zustandsübersicht in eine ZIP-Datei auf dem Desktop des Benutzers — für die Weitergabe an DXC bzw. den Zscaler-Support. Ändert nichts an Zscaler.',
    param: { label: 'Wie viele Tage zurück (1–14)', platzhalter: '3', vorlagen: ['1', '3', '7'] },
    ps: String.raw`
NeedUser
$tage = 3; if ($P -match '^\s*(\d{1,2})\s*$') { $tage = [int]$matches[1] }; if ($tage -lt 1) { $tage = 1 }; if ($tage -gt 14) { $tage = 14 }
$seit = (Get-Date).AddDays(-$tage)
$orte = @((Join-Path $uLocal 'Zscaler'), 'C:\ProgramData\Zscaler')
$dateien = @()
foreach ($o in $orte) { if (Test-Path -LiteralPath $o) { $dateien += @(Get-ChildItem -LiteralPath $o -Recurse -File -Force -EA SilentlyContinue | Where-Object { $_.LastWriteTime -ge $seit -and $_.Extension -match '^\.(log|txt|ztxt|json|xml|ini|etl)$' -and $_.Length -lt 150MB }) } }
$dateien = @($dateien | Sort-Object LastWriteTime -Descending)
if (-not $dateien.Count) { Zeile ('Keine Zscaler-Protokolle der letzten ' + $tage + ' Tage gefunden (Zscaler installiert?).') } else {
  $ds = $null
  if ($uHive) { $ds = [string](Get-ItemProperty ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') -EA SilentlyContinue).Desktop }
  if ($ds) { $ds = $ds -replace '%USERPROFILE%', $uProf }
  if (-not $ds -or $ds -match '%' -or -not (Test-Path -LiteralPath $ds)) { $ds = Join-Path $uProf 'Desktop' }
  if (-not (Test-Path -LiteralPath $ds)) { $ds = $uProf }
  Add-Type -AssemblyName System.IO.Compression
  $zip = Join-Path $ds ('Zscaler-Protokolle_' + $env:COMPUTERNAME + '_' + (Get-Date -Format 'yyyyMMdd_HHmm') + '.zip')
  $fs = [IO.File]::Open($zip, [IO.FileMode]::Create, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  $za = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
  $n = 0; $fehl = 0; $summe = 0
  foreach ($d in $dateien) {
    if ($summe -gt 400MB) { break }
    try {
      $rel = $(if ($d.FullName.StartsWith($uLocal, [StringComparison]::OrdinalIgnoreCase)) { 'Benutzer' + $d.FullName.Substring($uLocal.Length) } else { 'System' + $d.FullName.Substring(2) })
      $e = $za.CreateEntry(($rel -replace '\\', '/'), [System.IO.Compression.CompressionLevel]::Optimal)
      $es = $e.Open(); $src = [IO.File]::Open($d.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
      try { $src.CopyTo($es) } finally { $src.Close(); $es.Close() }
      $n++; $summe += $d.Length
    } catch { $fehl++ }
  }
  $s = Get-Service ZSAService -EA SilentlyContinue
  $v = (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { $_.DisplayName -match 'Zscaler' } | Select-Object -First 1).DisplayVersion
  $tx = @('PC: ' + $env:COMPUTERNAME, 'Benutzer: ' + $uDomUser, 'Erstellt: ' + (Get-Date).ToString('dd.MM.yyyy HH:mm'), 'Zscaler-Version: ' + $v, 'Dienst ZSAService: ' + $(if ($s) { [string]$s.Status } else { 'fehlt' }), 'Zeitraum: letzte ' + $tage + ' Tage', 'Dateien: ' + $n)
  $e = $za.CreateEntry('_Uebersicht.txt'); $sw = New-Object System.IO.StreamWriter($e.Open(), (New-Object System.Text.UTF8Encoding($true)))
  try { foreach ($t in $tx) { $sw.WriteLine($t) } } finally { $sw.Close() }
  $za.Dispose(); $fs.Close()
  Zeile ('' + $n + ' Protokolldatei(en) (' + (Groesse $summe) + ') gepackt' + $(if ($fehl) { ', ' + $fehl + ' nicht lesbar' } else { '' }) + '.')
  Zeile ('ZIP-Datei: ' + $zip + ' (' + (Groesse (Get-Item -LiteralPath $zip).Length) + ')')
  Zeile 'Die Datei liegt auf dem Desktop des Benutzers und kann ans Ticket bei DXC angehängt werden.'
}` }),

  // ══ Offlinedateien ══════════════════════════════════════════════════════════
  A({ id: 'zg-offline-online-schalten', titel: 'Netzlaufwerke aus dem Offline-Modus holen (online schalten)', modus: 'profil', risiko: 'aendern', timeoutMs: 90000,
    beschreibung: 'Schaltet alle Freigaben der Netzlaufwerke des Benutzers, die Offlinedateien als „offline“ führen, wieder online — wie „Online arbeiten“ im Explorer. Zeigt den Zustand vorher und nachher.',
    ps: String.raw`
NeedHive
$c = $null; try { $c = Get-CimInstance -ClassName Win32_OfflineFilesCache -EA Stop } catch {}
if (-not $c) { throw 'Offlinedateien gibt es auf diesem PC nicht (Windows-Edition ohne Offlinedateien).' }
if (-not $c.Enabled) { Zeile 'Offlinedateien sind abgeschaltet — es gibt keinen Offline-Modus. Liegt das Problem woanders (Server/Netz)?' } else {
  $wurzeln = @()
  foreach ($f in @(Get-ChildItem ($uHive + '\Network') -EA SilentlyContinue)) { $u = [string](Get-ItemProperty $f.PSPath).RemotePath; if ($u -match '^(\\\\[^\\]+\\[^\\]+)') { $wurzeln += $matches[1] } }
  $hs = [string](Get-ItemProperty ($uHive + '\Volatile Environment') -EA SilentlyContinue).HOMESHARE
  if ($hs -match '^(\\\\[^\\]+\\[^\\]+)') { $wurzeln += $matches[1] }
  $wurzeln = @($wurzeln | Select-Object -Unique)
  if (-not $wurzeln.Count) { Zeile 'Der Benutzer hat keine Netzlaufwerke — nichts zu tun.' }
  function Zustand([string]$w) {
    try {
      $q = "ItemPath='" + ($w -replace '\\', '\\' -replace "'", "\'") + "'"
      $it = Get-CimInstance -ClassName Win32_OfflineFilesItem -Filter $q -EA Stop | Select-Object -First 1
      if (-not $it -or -not $it.ConnectionInfo) { return 'nicht im Offline-Speicher' }
      switch ([int]$it.ConnectionInfo.ConnectState) { 1 { 'OFFLINE' } 2 { 'online' } default { 'unbekannt' } }
    } catch { 'unbekannt' }
  }
  foreach ($w in $wurzeln) {
    $vor = Zustand $w
    if ($vor -eq 'online' -or $vor -eq 'nicht im Offline-Speicher') { Zeile ($w + ': ' + $vor + ' — nichts zu tun'); continue }
    try {
      $r = Invoke-CimMethod -ClassName Win32_OfflineFilesCache -MethodName TransitionOnline -Arguments @{ Path = $w; Flags = [uint32]0 } -EA Stop
      Start-Sleep -Milliseconds 500
      Zeile ($w + ': vorher ' + $vor + ' → jetzt ' + (Zustand $w) + $(if ($r.ReturnValue -ne 0) { ' (Rückgabe ' + $r.ReturnValue + ' — Server erreichbar?)' } else { '' }))
    } catch { Zeile ($w + ': vorher ' + $vor + ' — Online-Schalten fehlgeschlagen: ' + $_.Exception.Message) }
  }
  Zeile 'Im Explorer F5 drücken. Bleibt ein Laufwerk offline, ist der Server nicht erreichbar oder die Verbindung gilt als langsam.'
}` }),

  A({ id: 'zg-offline-zuruecksetzen', titel: 'Offlinedateien abschalten bzw. Offline-Zwischenspeicher zurücksetzen', modus: 'system', risiko: 'kritisch',
    beschreibung: 'Schaltet die Offlinedateien (CSC) ab und/oder merkt den lokalen Offline-Zwischenspeicher zum Zurücksetzen beim nächsten Neustart vor. NICHT synchronisierte Offline-Änderungen gehen dabei verloren — vorher im Synchronisierungscenter abgleichen. Wirkt erst nach einem Neustart.',
    param: { label: 'Was', platzhalter: 'Abschalten + Cache zurücksetzen', pflicht: true, optionen: ['Abschalten + Cache zurücksetzen', 'Abschalten', 'Cache zurücksetzen'] },
    ps: String.raw`
$w = $P.Trim()
$aus = $false; $leeren = $false
if ($w -match '^Abschalten \+ Cache') { $aus = $true; $leeren = $true } elseif ($w -match '^Abschalten$') { $aus = $true } elseif ($w -match '^Cache zur') { $leeren = $true } else { throw ('Auswahl nicht erlaubt: ' + $w) }
$c = $null; try { $c = Get-CimInstance -ClassName Win32_OfflineFilesCache -EA Stop } catch {}
if (-not $c) { throw 'Offlinedateien gibt es auf diesem PC nicht (Windows-Edition ohne Offlinedateien).' }
$vorher = $(if ($c.Enabled) { 'aktiv' } else { 'aus' }) + ', wirksam ' + (Ja ([bool]$c.Active))
$pol = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\NetCache' -EA SilentlyContinue
if ($pol -and $pol.Enabled -eq 1) { Zeile 'Hinweis: Eine Gruppenrichtlinie schaltet Offlinedateien ein — Abschalten hält nur bis zur nächsten Richtlinienanwendung (Richtlinie: DXC).' }
$gr = OrdnerGroesse 'C:\Windows\CSC'
if ($gr -gt 0) { Zeile ('Offline-Zwischenspeicher C:\Windows\CSC: ' + (Groesse $gr)) }
# Sperre: noch nicht hochgeladene Offline-Änderungen dürfen nie verloren gehen
if ($leeren) {
  $dirty = 0; $geprueft = $false
  try { foreach ($i in @(Get-CimInstance -ClassName Win32_OfflineFilesItem -EA Stop)) { $geprueft = $true; if ($i.DirtyInfo -and [double]$i.DirtyInfo.LocalDirtyByteCount -gt 0) { $dirty++ } } } catch {}
  if ($dirty -gt 0) { throw ('' + $dirty + ' Offline-Datei(en) haben noch NICHT hochgeladene Änderungen — der Zwischenspeicher wird NICHT zurückgesetzt. Erst im Synchronisierungscenter „Alle synchronisieren“ (Netzlaufwerk erreichbar), dann erneut.') }
  Zeile ('Nicht hochgeladene Offline-Änderungen: ' + $(if ($geprueft) { 'keine' } else { 'nicht prüfbar — vorher im Synchronisierungscenter abgleichen!' }))
}
if ($aus) {
  if ($c.Enabled) {
    $r = Invoke-CimMethod -ClassName Win32_OfflineFilesCache -MethodName Enable -Arguments @{ Enable = $false } -EA Stop
    if ($r.ReturnValue -ne 0) { throw ('Abschalten fehlgeschlagen (Rückgabe ' + $r.ReturnValue + ')') }
    Zeile ('Offlinedateien: vorher ' + $vorher + ' → jetzt abgeschaltet' + $(if ($r.RebootRequired) { ' (wirkt nach Neustart)' } else { '' }))
  } else { Zeile ('Offlinedateien: waren schon abgeschaltet (' + $vorher + ')') }
}
if ($leeren) {
  $k = 'HKLM:\SYSTEM\CurrentControlSet\Services\CSC\Parameters'
  if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
  $alt = (Get-ItemProperty $k -Name FormatDatabase -EA SilentlyContinue).FormatDatabase
  Set-ItemProperty -Path $k -Name FormatDatabase -Value 1 -Type DWord
  Zeile ('Offline-Zwischenspeicher: vorher ' + $(if ($alt -eq 1) { 'schon vorgemerkt' } else { 'normal' }) + ' → jetzt zum Zurücksetzen beim nächsten Neustart vorgemerkt (FormatDatabase=1).')
}
Zeile 'Wirksam erst nach einem Neustart. Nicht synchronisierte Offline-Änderungen gehen dabei verloren.'` }),

  // ══ SMB-Client / Sitzungen ══════════════════════════════════════════════════
  A({ id: 'zg-smb-client-ein', titel: 'Arbeitsstationsdienst und „Client für Microsoft-Netzwerke“ wieder einschalten', modus: 'system', risiko: 'aendern', trenntVerbindung: true,
    beschreibung: 'Kein Netzlaufwerk geht, Internet schon: Stellt den Arbeitsstationsdienst (SMB-Client) auf „Automatisch“ und startet ihn, setzt deaktivierte SMB-Client-Treiber auf den Windows-Standard und bindet „Client für Microsoft-Netzwerke“ wieder an die Adapter (Verbindung dabei kurz weg).',
    ps: String.raw`
$s = Get-Service LanmanWorkstation -EA SilentlyContinue
if (-not $s) { throw 'Arbeitsstationsdienst (LanmanWorkstation) nicht gefunden.' }
$altTyp = [string]$s.StartType; $altSt = [string]$s.Status
$neustart = $false
foreach ($d in @(@('Bowser', 3), @('MRxSmb', 3), @('MRxSmb20', 3), @('rdbss', 1))) {
  $k = 'HKLM:\SYSTEM\CurrentControlSet\Services\' + $d[0]
  $st = (Get-ItemProperty $k -Name Start -EA SilentlyContinue).Start
  if ($st -eq 4) { Set-ItemProperty -Path $k -Name Start -Value $d[1] -Type DWord; $neustart = $true; Zeile ('Treiber ' + $d[0] + ': vorher deaktiviert (Start=4) → jetzt Windows-Standard (Start=' + $d[1] + ')') }
}
if ($s.StartType -ne 'Automatic') { Set-Service -Name LanmanWorkstation -StartupType Automatic -EA Stop }
if ((Get-Service LanmanWorkstation).Status -ne 'Running') { try { Start-Service -Name LanmanWorkstation -EA Stop; Start-Sleep -Seconds 2 } catch { Zeile ('Start fehlgeschlagen: ' + $_.Exception.Message); $neustart = $true } }
$s = Get-Service LanmanWorkstation
Zeile ('Arbeitsstationsdienst: vorher ' + $altSt + ' (' + $altTyp + ') → jetzt ' + $s.Status + ' (' + $s.StartType + ')')
$aus = @()
foreach ($a in @(Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object { $_.Status -eq 'Up' })) { $b = Get-NetAdapterBinding -Name $a.Name -ComponentID ms_msclient -EA SilentlyContinue; if ($b -and -not $b.Enabled) { $aus += [string]$a.Name } }
if ($aus.Count) {
  $liste = (@($aus | ForEach-Object { "'" + ($_ -replace "'", "''") + "'" })) -join ','
  Spaeter ('foreach ($n in @(' + $liste + ')) { Enable-NetAdapterBinding -Name $n -ComponentID ms_msclient -EA SilentlyContinue }') 3
  Zeile ('„Client für Microsoft-Netzwerke“ war an ' + ($aus -join ', ') + ' abgeschaltet → wird in 3 Sekunden wieder eingeschaltet (Verbindung kurz weg).')
} else { Zeile '„Client für Microsoft-Netzwerke“: an allen aktiven Adaptern eingeschaltet.' }
if ($neustart) { Zeile 'Ein Neustart ist nötig, damit die SMB-Treiber wieder laden.' } else { Zeile 'Danach die Netzlaufwerke neu verbinden.' }` }),

  A({ id: 'zg-smb-sitzungen-trennen', titel: 'Alle Verbindungen zu einem Server trennen und Laufwerke mit eigenem Konto neu verbinden', modus: 'benutzer', risiko: 'kritisch', timeoutMs: 120000,
    beschreibung: 'Fehler 1219 / falsches Konto: Trennt in der Sitzung des Benutzers alle Verbindungen zu genau EINEM Server (auch versteckte ohne Laufwerksbuchstaben) und verbindet dessen Laufwerke danach dauerhaft mit dem Konto des Benutzers neu. Offene Dateien auf diesem Server werden dabei getrennt.',
    param: { label: 'Servername', platzhalter: 'z. B. w3172', pflicht: true, vorlagen: ['w3172', 'w3143'] },
    ps: String.raw`
$s = (($P.Trim().TrimStart('\')) -split '\\')[0]
if ($s -notmatch '^[A-Za-z0-9][A-Za-z0-9\-]{1,14}(\.[A-Za-z0-9\-]+)*$') { throw ('Ungültiger Servername: ' + $s) }
$kurz = ($s -split '\.')[0]
$net = Join-Path $env:SystemRoot 'System32\net.exe'
function SrvVon([string]$u) { ((($u -replace '^\\\\', '') -split '\\')[0] -split '\.')[0] }
$lw = @()
foreach ($m in @(Get-SmbMapping -EA SilentlyContinue)) { if ((SrvVon ([string]$m.RemotePath)) -ieq $kurz) { $lw += [pscustomobject]@{ B = ([string]$m.LocalPath).ToUpper(); Unc = [string]$m.RemotePath } } }
foreach ($f in @(Get-ChildItem 'HKCU:\Network' -EA SilentlyContinue)) {
  $b = $f.PSChildName.ToUpper() + ':'; $u = [string](Get-ItemProperty $f.PSPath).RemotePath
  if ((SrvVon $u) -ieq $kurz -and -not ($lw | Where-Object { $_.B -eq $b })) { $lw += [pscustomobject]@{ B = $b; Unc = $u } }
}
$ohne = @()
foreach ($z in @((& $net use 2>&1 | Out-String) -split '\r?\n')) { if ($z -notmatch '\s[A-Za-z]:\s' -and $z -match '(\\\\[^\\\s]+\\.+?)(\s{2,}|$)') { $u = $matches[1].Trim(); if ((SrvVon $u) -ieq $kurz) { $ohne += $u } } }
$ohne = @($ohne | Select-Object -Unique)
if (-not $lw.Count -and -not $ohne.Count) { Zeile ('Keine Verbindung zu ' + $s + ' gefunden — nichts getrennt.') } else {
  foreach ($x in $lw) { & $net use $x.B /delete /y 2>&1 | Out-Null; Zeile ('Getrennt: ' + $x.B + ' ' + $x.Unc) }
  foreach ($u in $ohne) { & $net use $u /delete /y 2>&1 | Out-Null; Zeile ('Getrennt (ohne Buchstaben): ' + $u) }
  Start-Sleep -Seconds 2
  foreach ($x in $lw) {
    $o = (& $net use $x.B $x.Unc /persistent:yes 2>&1 | Out-String).Trim()
    Zeile ('Neu verbunden mit eigenem Konto: ' + $x.B + ' ' + $x.Unc + ' → ' + $(if ($LASTEXITCODE -eq 0) { 'ok' } else { 'FEHLER — ' + ($o -replace '\s+', ' ') }))
  }
  Zeile 'Meldet Windows weiter Fehler 1219, hält ein Programm (z. B. Explorer-Fenster) noch eine alte Verbindung — dann einmal ab- und wieder anmelden.'
}` }),

  A({ id: 'zg-lw-sicherung', titel: 'Netzlaufwerke des Benutzers sichern bzw. aus der Sicherung wiederherstellen', modus: 'benutzer', risiko: 'aendern', timeoutMs: 120000,
    beschreibung: '„Sichern“ legt die Liste aller Laufwerke (Buchstabe + Pfad) im Profil des Benutzers ab (ITAdminTool\Netzlaufwerke.json, zusätzlich in seinem OneDrive). „Wiederherstellen“ verbindet daraus alle fehlenden Laufwerke dauerhaft — belegte Buchstaben werden nicht überschrieben.',
    param: { label: 'Was', platzhalter: 'Sichern', pflicht: true, optionen: ['Sichern', 'Wiederherstellen'] },
    ps: String.raw`
$w = $P.Trim()
if ($w -notin 'Sichern', 'Wiederherstellen') { throw ('Auswahl nicht erlaubt: ' + $w) }
$net = Join-Path $env:SystemRoot 'System32\net.exe'
$orte = @((Join-Path $env:USERPROFILE 'ITAdminTool'))
if ($env:OneDriveCommercial -and (Test-Path -LiteralPath $env:OneDriveCommercial)) { $orte += (Join-Path $env:OneDriveCommercial 'ITAdminTool') }
if ($w -eq 'Sichern') {
  $l = @()
  foreach ($m in @(Get-SmbMapping -EA SilentlyContinue)) { $l += [pscustomobject]@{ Buchstabe = ([string]$m.LocalPath).ToUpper(); Pfad = [string]$m.RemotePath } }
  foreach ($f in @(Get-ChildItem 'HKCU:\Network' -EA SilentlyContinue)) { $b = $f.PSChildName.ToUpper() + ':'; if (-not ($l | Where-Object { $_.Buchstabe -eq $b })) { $l += [pscustomobject]@{ Buchstabe = $b; Pfad = [string](Get-ItemProperty $f.PSPath).RemotePath } } }
  $l = @($l | Where-Object { $_.Pfad -match '^\\\\' })
  if (-not $l.Count) { throw 'Keine Netzlaufwerke vorhanden — nichts zu sichern (eine vorhandene Sicherung bleibt unverändert).' }
  $obj = [pscustomobject]@{ Computer = $env:COMPUTERNAME; Benutzer = $env:USERNAME; Zeit = (Get-Date).ToString('s'); Laufwerke = $l }
  $json = ConvertTo-Json -InputObject $obj -Depth 4
  foreach ($o in $orte) {
    try {
      if (-not (Test-Path -LiteralPath $o)) { New-Item -Path $o -ItemType Directory -Force | Out-Null }
      $d = Join-Path $o 'Netzlaufwerke.json'
      if (Test-Path -LiteralPath $d) { [void](RenameAlt $d 'Vorherige Sicherung') }
      $json | Out-File -LiteralPath $d -Encoding UTF8 -Force
      Zeile ('Gesichert: ' + $d)
    } catch { Zeile ('Nicht gesichert in ' + $o + ': ' + $_.Exception.Message) }
  }
  foreach ($x in $l) { Zeile ('  ' + $x.Buchstabe + ' → ' + $x.Pfad) }
} else {
  $best = $null; $quelle = ''
  foreach ($o in $orte) {
    $d = Join-Path $o 'Netzlaufwerke.json'
    if (Test-Path -LiteralPath $d) { try { $j = Get-Content -LiteralPath $d -Raw -Encoding UTF8 | ConvertFrom-Json; if (-not $best -or [datetime]$j.Zeit -gt [datetime]$best.Zeit) { $best = $j; $quelle = $d } } catch { Zeile ('Sicherung nicht lesbar: ' + $d) } }
  }
  if (-not $best) { throw 'Keine Sicherung gefunden — zuerst „Sichern“ (vor der Änderung bzw. auf dem alten PC mit demselben OneDrive).' }
  Zeile ('Sicherung vom ' + ([datetime]$best.Zeit).ToString('dd.MM.yyyy HH:mm') + ' (PC ' + $best.Computer + ') aus ' + $quelle)
  $neu = 0
  foreach ($x in @($best.Laufwerke)) {
    $b = ([string]$x.Buchstabe).ToUpper(); $unc = ([string]$x.Pfad).TrimEnd('\')
    if ($b -notmatch '^[A-Z]:$' -or $unc -notmatch '^\\\\[^\\]+\\[^\\]+') { Zeile ('Übersprungen (ungültig): ' + $b + ' ' + $unc); continue }
    $da = Get-SmbMapping -LocalPath $b -EA SilentlyContinue
    if ($da -and ([string]$da.RemotePath).TrimEnd('\') -ieq $unc) { Zeile ($b + ' ' + $unc + ': schon verbunden'); continue }
    if ($da) { Zeile ($b + ' ist mit ' + $da.RemotePath + ' belegt — NICHT überschrieben (Sicherung: ' + $unc + ')'); continue }
    if (Test-Path ($b + '\')) { Zeile ($b + ' ist durch ein lokales Laufwerk belegt — ' + $unc + ' nicht verbunden'); continue }
    $o = (& $net use $b $unc /persistent:yes 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -eq 0) { $neu++; Zeile ($b + ' → ' + $unc + ': verbunden') } else { Zeile ($b + ' → ' + $unc + ': FEHLER — ' + ($o -replace '\s+', ' ')) }
  }
  Zeile ('' + $neu + ' Laufwerk(e) neu verbunden.')
}` }),

  // ══ Verknüpfungen ═══════════════════════════════════════════════════════════
  A({ id: 'zg-verknuepfungen-pruefen', titel: 'Verknüpfungen mit Netzzielen prüfen (Desktop, Startmenü, Taskleiste)', modus: 'benutzer', risiko: 'lesen', timeoutMs: 120000,
    beschreibung: 'Listet die Verknüpfungen des Benutzers, die auf Netzlaufwerke oder Server zeigen, gruppiert nach Server — mit Namensauflösung, Erreichbarkeit und fehlenden Zielen. Zeigt, welcher alte Server noch verwendet wird.',
    ps: VK_PS + String.raw`
$sh = New-Object -ComObject WScript.Shell
$pub = [Environment]::GetFolderPath('CommonDesktopDirectory')
$treffer = @()
foreach ($f in VkDateien (VkOrte $true)) {
  try { $l = $sh.CreateShortcut($f.FullName) } catch { continue }
  $z = [string]$l.TargetPath; $a = [string]$l.Arguments
  $k = VkNetz $z; $wo = $z
  if (-not $k -and $a -match '\\\\([A-Za-z0-9][^\\"\s]*)\\') { $k = $matches[1].ToLower(); $wo = $a }
  if ($k) { $treffer += [pscustomobject]@{ Name = $f.BaseName + $(if ($pub -and $f.FullName.StartsWith($pub, [StringComparison]::OrdinalIgnoreCase)) { ' (öffentlicher Desktop)' } else { '' }); Ziel = $wo; Key = $k } }
}
if (-not $treffer.Count) { Zeile 'Keine Verknüpfungen mit Netzziel gefunden.' }
foreach ($g in @($treffer | Group-Object Key | Sort-Object Count -Descending)) {
  $key = [string]$g.Name; $srv = $key
  if ($key -match '^[A-Z]:$') { $u = $lwZiel[$key]; $srv = $(if ($u) { (($u -replace '^\\\\', '') -split '\\')[0] } else { $null }) }
  $dns = $false; $port = $false
  if ($srv) { try { [void][System.Net.Dns]::GetHostAddresses($srv); $dns = $true } catch {}; if ($dns) { try { $t = New-Object System.Net.Sockets.TcpClient; $port = $t.ConnectAsync($srv, 445).Wait(2500); $t.Close() } catch {} } }
  $fehlt = @()
  if ($port) { foreach ($x in $g.Group) { $pf = [string]$x.Ziel; if ($pf -match '"?(\\\\[^"]+?|[A-Za-z]:\\[^"]*?)("|\s/|$)') { $pf = $matches[1].Trim() }; if ($pf -and -not (Test-Path -LiteralPath $pf)) { $fehlt += $x.Name } } }
  $zust = $(if (-not $srv) { 'Laufwerk ' + $key + ' ist NICHT verbunden' } elseif (-not $dns) { 'Server ' + $srv + ' NICHT auflösbar (alter oder abgeschalteter Server?)' } elseif (-not $port) { 'Server ' + $srv + ' NICHT erreichbar (Port 445)' } elseif ($fehlt.Count) { 'erreichbar, aber ' + $fehlt.Count + ' Ziel(e) fehlen: ' + ((@($fehlt | Select-Object -First 6)) -join ', ') } else { 'erreichbar, alle Ziele vorhanden' })
  Zeile ($key + ' — ' + $g.Count + ' Verknüpfung(en) · ' + $zust)
  Zeile ('   ' + ((@($g.Group | Select-Object -First 8 | ForEach-Object { $_.Name })) -join ', ') + $(if ($g.Count -gt 8) { ' …' } else { '' }))
}
if ($treffer.Count) { Zeile 'Umbiegen: Baustein „Verknüpfungen auf neuen Server umbiegen“ mit „alt > neu“ (z. B. w1234 > w3172 oder Z: > I:).' }` }),

  A({ id: 'zg-verknuepfungen-umbiegen', titel: 'Verknüpfungen auf neuen Server bzw. Laufwerksbuchstaben umbiegen', modus: 'benutzer', risiko: 'aendern', timeoutMs: 180000,
    beschreibung: 'Schreibt die Verknüpfungen des Benutzers (Desktop, Startmenü, Taskleiste, Favoriten) von einem alten Server (Name oder IP), einer alten Freigabe bzw. einem alten Ordnerpfad oder Laufwerksbuchstaben auf den neuen um — nur exakte Treffer. Jede geänderte Verknüpfung wird vorher gesichert (ITAdminTool\Verknuepfungen.alt_…).',
    param: { label: 'alt > neu', platzhalter: 'w1234 > w3172', pflicht: true, vorlagen: ['w1234 > w3172', String.raw`\\w1234\daten > \\w3172\skf Marine`, 'Z: > I:', String.raw`I:\Projekte > I:\Projekte 2026`] },
    ps: VK_PS + String.raw`
if ($P -notmatch '^\s*(.+?)\s*(?:->|=>|>|→)\s*(.+?)\s*$') { throw 'Bitte so angeben: alt > neu — z. B. w1234 > w3172, \\w1234\daten > \\w3172\skf Marine oder Z: > I:' }
$alt = $matches[1].Trim().Trim('"').TrimEnd('\'); $neu = $matches[2].Trim().Trim('"').TrimEnd('\')
function VkArt([string]$x) { if ($x -match '^[A-Za-z]:(\\[^\\/:*?"<>|]+)*$') { 'lw' } elseif ($x -match '^\\\\[A-Za-z0-9][A-Za-z0-9.\-]{0,62}(\\[^\\/:*?"<>|]+)+$') { 'unc' } elseif ($x -match '^[A-Za-z0-9][A-Za-z0-9\-]{1,14}(\.[A-Za-z0-9\-]+)*$') { 'srv' } else { '' } }
$aa = VkArt $alt; $na = VkArt $neu
if (-not $aa -or -not $na) { throw ('Ungültige Angabe: „' + $alt + '“ bzw. „' + $neu + '“ — erlaubt sind Servername, \\server\freigabe oder Laufwerksbuchstabe.') }
if (($aa -eq 'srv') -ne ($na -eq 'srv')) { throw 'Servername nur gegen Servername tauschen (w1234 > w3172); Freigaben und Laufwerksbuchstaben untereinander (\\alt\daten > \\neu\daten, Z: > I:).' }
if ($alt -ieq $neu) { throw 'Alt und neu sind gleich.' }
if ($aa -eq 'srv') { $muster = '(?i)\\\\' + [regex]::Escape($alt) + '(?:\.[A-Za-z0-9\-]+)*(?=\\|"|\s|$)'; $ersatz = '\\' + $neu }
elseif ($aa -eq 'unc') { $muster = '(?i)' + [regex]::Escape($alt) + '(?=\\|"|$)'; $ersatz = $neu }
else { $muster = '(?i)(?<![A-Za-z0-9\\])' + [regex]::Escape($alt) + '(?=\\|"|$)'; $ersatz = $neu }
if ($na -eq 'lw') { $ersatz = $neu.Substring(0, 1).ToUpper() + $neu.Substring(1) }
$ersatzR = $ersatz.Replace('$', '$$')
$sh = New-Object -ComObject WScript.Shell
$sich = Join-Path $env:USERPROFILE ('ITAdminTool\Verknuepfungen.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
$n = 0; $fehl = 0
foreach ($f in VkDateien (VkOrte $false)) {
  try { $l = $sh.CreateShortcut($f.FullName) } catch { continue }
  $z0 = [string]$l.TargetPath; $a0 = [string]$l.Arguments; $w0 = [string]$l.WorkingDirectory
  $z1 = [regex]::Replace($z0, $muster, $ersatzR); $a1 = [regex]::Replace($a0, $muster, $ersatzR); $w1 = [regex]::Replace($w0, $muster, $ersatzR)
  if ($z1 -ceq $z0 -and $a1 -ceq $a0 -and $w1 -ceq $w0) { continue }
  try {
    if (-not (Test-Path -LiteralPath $sich)) { New-Item -Path $sich -ItemType Directory -Force | Out-Null }
    Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $sich ('' + $n + '_' + $f.Name)) -Force -EA Stop
    $l.TargetPath = $z1; $l.Arguments = $a1; $l.WorkingDirectory = $w1; $l.Save()
    $n++
    $ok = $(if ($z1 -and $z1 -match '^(\\\\|[A-Za-z]:\\)') { Test-Path -LiteralPath $z1 } else { $true })
    Zeile ($f.Name + ': ' + $z0 + ' → ' + $z1 + $(if ($a1 -cne $a0) { ' · Argumente angepasst' } else { '' }) + $(if ($ok) { '' } else { ' · neues Ziel (noch) nicht erreichbar' }))
  } catch { $fehl++; Zeile ($f.Name + ': FEHLER — ' + $_.Exception.Message) }
}
if ($n) { Zeile ('' + $n + ' Verknüpfung(en) umgebogen: „' + $alt + '“ → „' + $neu + '“. Sicherung: ' + $sich) } else { Zeile ('Keine Verknüpfung zeigte auf „' + $alt + '“ — nichts geändert.') }
if ($fehl) { Zeile ('' + $fehl + ' Verknüpfung(en) konnten nicht geändert werden (schreibgeschützt?).') }
$pub = [Environment]::GetFolderPath('CommonDesktopDirectory')
if ($pub -and (Test-Path -LiteralPath $pub)) { $pz = 0; foreach ($f in @(Get-ChildItem -LiteralPath $pub -Filter '*.lnk' -File -EA SilentlyContinue)) { try { $l = $sh.CreateShortcut($f.FullName); if ([regex]::IsMatch(([string]$l.TargetPath + ' ' + [string]$l.Arguments), $muster)) { $pz++ } } catch {} }; if ($pz) { Zeile ('Öffentlicher Desktop: ' + $pz + ' Verknüpfung(en) zeigen auch noch auf „' + $alt + '“ — die ändert nur ein Administrator (vor Ort bzw. Softwareverteilung).') } }` }),

  // ══ Dateien ═════════════════════════════════════════════════════════════════
  A({ id: 'zg-datei-gesperrt-wer', titel: 'Wer hat die Datei geöffnet? (Sperre prüfen)', modus: 'benutzer', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Prüft für eine Datei: Office-Sperrdatei (~$…) mit dem Namen dessen, der sie geöffnet hat, Programme auf DIESEM PC, die sie offen halten (Restart Manager, Fenstertitel), Schreibschutz-Attribut und Internet-Markierung. Ändert nichts, fragt nichts am Server ab.',
    param: { label: 'Pfad der Datei', platzhalter: String.raw`I:\Projekte\Angebot.xlsx`, pflicht: true },
    ps: String.raw`
$p = $P.Trim().Trim('"')
if ($p -notmatch '^([A-Za-z]:\\|\\\\[^\\]+\\[^\\]+\\).+' -or $p -match '[*?<>|]') { throw 'Bitte den vollständigen Pfad der Datei angeben, z. B. I:\Projekte\Angebot.xlsx' }
$ordner = Split-Path $p -Parent; $name = Split-Path $p -Leaf
$da = Test-Path -LiteralPath $p -PathType Leaf
Zeile ('Datei: ' + $p + ' · ' + $(if ($da) { 'vorhanden' } else { 'NICHT gefunden bzw. kein Zugriff' }))
if ($da) {
  $fi = Get-Item -LiteralPath $p -Force -EA SilentlyContinue
  if ($fi) { Zeile ('Größe ' + (Groesse $fi.Length) + ' · geändert ' + $fi.LastWriteTime.ToString('dd.MM.yyyy HH:mm') + ' · Schreibschutz-Attribut: ' + (Ja $fi.IsReadOnly)) }
  $zi = Get-Content -LiteralPath $p -Stream Zone.Identifier -EA SilentlyContinue
  if ($zi -match 'ZoneId=3') { Zeile 'Datei ist als „aus dem Internet“ markiert → Office öffnet sie geschützt/schreibgeschützt (Eigenschaften → „Zulassen“).' }
}
$kand = @('~$' + $name); if ($name.Length -gt 2) { $kand += '~$' + $name.Substring(2) }; if ($name.Length -gt 1) { $kand += '~$' + $name.Substring(1) }
$sperre = $false
foreach ($k in @($kand | Select-Object -Unique)) {
  $f = Join-Path $ordner $k
  if (Test-Path -LiteralPath $f) {
    $sperre = $true; $wer = '?'
    try { $fs = [IO.File]::Open($f, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite); $buf = New-Object byte[] 162; $n = $fs.Read($buf, 0, 162); $fs.Close(); $len = [int]$buf[0]; if ($len -gt 0 -and $len -lt 54 -and $n -gt $len) { $wer = [Text.Encoding]::Default.GetString($buf, 1, $len).Trim() } } catch {}
    $seit = ''; try { $seit = (Get-Item -LiteralPath $f -Force).LastWriteTime.ToString('dd.MM.yyyy HH:mm') } catch {}
    Zeile ('Office-Sperrdatei ' + $k + ': geöffnet von „' + $wer + '“ seit ' + $seit)
  }
}
if (-not $sperre) { Zeile 'Keine Office-Sperrdatei (~$…) im Ordner.' }
if (-not ('PaRm' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public static class PaRm {
  [StructLayout(LayoutKind.Sequential)] struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string strServiceShortName;
    public int ApplicationType; public uint AppStatus; public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
  }
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmStartSession(out uint h, int f, string key);
  [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint h);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmRegisterResources(uint h, uint nFiles, string[] files, uint nApps, RM_UNIQUE_PROCESS[] apps, uint nSvc, string[] svc);
  [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint h, out uint needed, ref uint n, [In, Out] RM_PROCESS_INFO[] info, ref uint reasons);
  public static List<string> Wer(string pfad) {
    List<string> l = new List<string>(); uint h;
    if (RmStartSession(out h, 0, Guid.NewGuid().ToString()) != 0) return l;
    try {
      if (RmRegisterResources(h, 1, new string[] { pfad }, 0, null, 0, null) != 0) return l;
      uint need = 0, n = 0, r = 0;
      int rc = RmGetList(h, out need, ref n, null, ref r);
      if (rc == 234 && need > 0) {
        RM_PROCESS_INFO[] info = new RM_PROCESS_INFO[need]; n = need;
        rc = RmGetList(h, out need, ref n, info, ref r);
        if (rc == 0) for (int i = 0; i < n; i++) l.Add(info[i].Process.dwProcessId + "|" + info[i].strAppName);
      }
    } finally { RmEndSession(h); }
    return l;
  }
}
'@
}
$hier = @()
if ($da) { try { $hier = @([PaRm]::Wer($p)) } catch {} }
$basis = [IO.Path]::GetFileNameWithoutExtension($name)
$fen = @(Get-Process -EA SilentlyContinue | Where-Object { $_.MainWindowTitle -and $basis.Length -ge 3 -and $_.MainWindowTitle.IndexOf($basis, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
foreach ($h in $hier) { $t = $h -split '\|', 2; Zeile ('Auf diesem PC offen in: ' + $t[1] + ' (Prozess ' + $t[0] + ')') }
foreach ($x in $fen) { if (-not ($hier | Where-Object { $_ -like ('' + $x.Id + '|*') })) { Zeile ('Fenster auf diesem PC: ' + $x.ProcessName + ' (Prozess ' + $x.Id + ') — „' + $x.MainWindowTitle + '“') } }
if (-not $hier.Count -and -not $fen.Count) { Zeile ('Auf diesem PC hält kein Programm die Datei offen.' + $(if ($sperre) { ' Die Sperre kommt von der Person in der Sperrdatei (anderer PC) — sie muss die Datei schließen.' } else { '' })) }
else { Zeile 'Das Programm auf diesem PC schließen (bzw. „Programm des Benutzers beenden“) — danach ist die Datei frei.' }` }),

  A({ id: 'zg-lw-vorgaengerversionen', titel: 'Vorgängerversionen einer Datei/eines Ordners im Netzlaufwerk anzeigen', modus: 'benutzer', risiko: 'lesen', timeoutMs: 120000,
    beschreibung: 'Listet die Schattenkopien des Servers für einen Pfad auf dem Netzlaufwerk (wie der Reiter „Vorgängerversionen“) und zeigt je Stand, ob die Datei bzw. der Ordner darin vorhanden ist, mit Größe und Änderungsdatum. Nur lesend.',
    param: { label: 'Pfad (Datei oder Ordner)', platzhalter: String.raw`I:\Projekte\Angebot.xlsx`, pflicht: true },
    ps: SNAP_PS + String.raw`
$t = SnapZiel (($P -split '\|')[0])
$root = $t[0]; $rest = $t[1]; $voll = $root + $rest; if (-not $rest) { $voll = $root + '\' }
$ord = SnapOrdner $voll $root
$liste = @(SnapListe $ord)
$jetzt = Get-Item -LiteralPath $voll -Force -EA SilentlyContinue
Zeile ('Pfad: ' + $voll + ' · aktuell ' + $(if ($jetzt) { 'vorhanden' + $(if (-not $jetzt.PSIsContainer) { ', ' + (Groesse $jetzt.Length) }) + ', geändert ' + $jetzt.LastWriteTime.ToString('dd.MM.yyyy HH:mm') } else { 'NICHT vorhanden (gelöscht/verschoben?)' }))
if (-not $liste.Count) { Zeile 'Der Server bietet für diesen Ordner keine Vorgängerversionen an — Wiederherstellung nur aus der Datensicherung (DXC).' } else {
  Zeile ('' + $liste.Count + ' Vorgängerversion(en) auf dem Server, neueste zuerst:')
  $treffer = 0
  foreach ($v in $liste | Select-Object -First 25) {
    $sp = $root + '\' + $v.Tok + $rest
    $it = Get-Item -LiteralPath $sp -Force -EA SilentlyContinue
    if ($it) {
      $treffer++
      $gleich = $jetzt -and (-not $it.PSIsContainer) -and ($it.LastWriteTime -eq $jetzt.LastWriteTime) -and ($it.Length -eq $jetzt.Length)
      Zeile ('  ' + $v.Zeit.ToString('dd.MM.yyyy HH:mm') + ' · vorhanden' + $(if (-not $it.PSIsContainer) { ' · ' + (Groesse $it.Length) }) + ' · geändert ' + $it.LastWriteTime.ToString('dd.MM.yyyy HH:mm') + $(if ($gleich) { ' · = aktueller Stand' } else { '' }))
    } else { Zeile ('  ' + $v.Zeit.ToString('dd.MM.yyyy HH:mm') + ' · nicht enthalten') }
  }
  if ($treffer) { Zeile 'Zurückholen: Baustein „Vorgängerversion auf den Desktop holen“ (Pfad | Datum) oder Rechtsklick → Eigenschaften → Vorgängerversionen.' } else { Zeile 'In keiner Vorgängerversion enthalten — Wiederherstellung aus der Datensicherung (DXC).' }
}` }),

  A({ id: 'zg-lw-version-holen', titel: 'Vorgängerversion vom Netzlaufwerk auf den Desktop holen', modus: 'benutzer', risiko: 'aendern', timeoutMs: 300000,
    beschreibung: 'Kopiert eine Datei bzw. einen Ordner aus einer Vorgängerversion (Schattenkopie) des Servers in den Ordner „Wiederhergestellt“ auf dem Desktop des Benutzers. Ohne Datum: der neueste Stand, der vom aktuellen abweicht; mit Datum: der letzte Stand bis zu diesem Tag. Auf dem Server wird nichts geändert.',
    param: { label: 'Pfad | Datum (optional)', platzhalter: String.raw`I:\Projekte\Angebot.xlsx | 05.11.2026`, pflicht: true },
    ps: SNAP_PS + String.raw`
if ($P -notmatch '^\s*"?(.+?)"?\s*(?:\|\s*(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?\s*)?$') { throw 'Bitte so angeben: Pfad | Datum, z. B. I:\Projekte\Angebot.xlsx | 05.11.2026 (Datum optional, auch mit Uhrzeit 05.11.2026 12:00)' }
$pfad = $matches[1]; $bis = $null
if ($matches[2]) { try { $bis = Get-Date -Year ([int]$matches[4]) -Month ([int]$matches[3]) -Day ([int]$matches[2]) -Hour 23 -Minute 59 -Second 59; if ($matches[5]) { $bis = $bis.Date.AddHours([int]$matches[5]).AddMinutes([int]$matches[6]) } } catch { throw 'Ungültiges Datum.' } }
$t = SnapZiel $pfad
$root = $t[0]; $rest = $t[1]
if (-not $rest) { throw 'Bitte eine Datei oder einen Ordner IM Laufwerk angeben, nicht das ganze Laufwerk.' }
$voll = $root + $rest
$ord = SnapOrdner $voll $root
$liste = @(SnapListe $ord)
if (-not $liste.Count) { throw 'Der Server bietet hier keine Vorgängerversionen an — Wiederherstellung nur aus der Datensicherung (DXC).' }
$jetzt = Get-Item -LiteralPath $voll -Force -EA SilentlyContinue
$wahl = $null; $wahlItem = $null
foreach ($v in $liste) {
  if ($bis -and $v.Zeit -gt $bis) { continue }
  $it = Get-Item -LiteralPath ($root + '\' + $v.Tok + $rest) -Force -EA SilentlyContinue
  if (-not $it) { continue }
  if (-not $bis -and $jetzt -and -not $it.PSIsContainer -and $it.LastWriteTime -eq $jetzt.LastWriteTime -and $it.Length -eq $jetzt.Length) { continue }
  $wahl = $v; $wahlItem = $it; break
}
if (-not $wahl) { throw ('Keine passende Vorgängerversion gefunden' + $(if ($bis) { ' bis ' + $bis.ToString('dd.MM.yyyy HH:mm') } else { ' (alle Stände gleich dem aktuellen oder Datei nie enthalten)' }) + '.') }
if ($wahlItem.PSIsContainer) { $gr = OrdnerGroesse $wahlItem.FullName; if ($gr -gt 5GB) { throw ('Der Ordner ist ' + (Groesse $gr) + ' groß — so große Wiederherstellungen bitte über DXC.') } } else { $gr = $wahlItem.Length }
$desk = [Environment]::GetFolderPath('Desktop')
if (-not $desk) { $desk = Join-Path $env:USERPROFILE 'Desktop' }
$zielOrd = Join-Path $desk 'Wiederhergestellt'
if (-not (Test-Path -LiteralPath $zielOrd)) { New-Item -Path $zielOrd -ItemType Directory -Force | Out-Null }
$nm = Split-Path $voll -Leaf
$basis = $(if ($wahlItem.PSIsContainer) { $nm } else { [IO.Path]::GetFileNameWithoutExtension($nm) }); $ext = $(if ($wahlItem.PSIsContainer) { '' } else { [IO.Path]::GetExtension($nm) })
$ziel = Join-Path $zielOrd ($basis + ' (Stand ' + $wahl.Zeit.ToString('dd.MM.yyyy HH.mm') + ')' + $ext)
$i = 2; while (Test-Path -LiteralPath $ziel) { $ziel = Join-Path $zielOrd ($basis + ' (Stand ' + $wahl.Zeit.ToString('dd.MM.yyyy HH.mm') + ') ' + $i + $ext); $i++ }
Copy-Item -LiteralPath $wahlItem.FullName -Destination $ziel -Recurse -Force -EA Stop
Zeile ('Stand vom ' + $wahl.Zeit.ToString('dd.MM.yyyy HH:mm') + ' (' + (Groesse $gr) + ', geändert ' + $wahlItem.LastWriteTime.ToString('dd.MM.yyyy HH:mm') + ') kopiert nach: ' + $ziel)
Zeile ('Aktueller Stand auf dem Laufwerk: ' + $(if ($jetzt) { 'vorhanden, geändert ' + $jetzt.LastWriteTime.ToString('dd.MM.yyyy HH:mm') + ' — unverändert' } else { 'nicht vorhanden' }) + '. Der Benutzer prüft die Kopie und legt sie selbst an den richtigen Ort.')` }),
]
