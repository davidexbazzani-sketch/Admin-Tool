// ── Problem-Assistent: Lösungsbausteine Gruppe „cloud“ (Runde 3) ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// OneDrive: Pfade nur innerhalb der OneDrive-/SharePoint-Ordner des Benutzers (aus seiner Registry).
// Browser: Benutzerdaten werden umbenannt (*.alt_…), nie gelöscht — nur echte Caches werden geleert.
// Nichts hier schreibt Richtlinien (Policies) — die werden nur gelesen und gemeldet.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** OneDrive-/SharePoint-Wurzelordner des Benutzers (Geschäftskonten + synchronisierte Bibliotheken).
 *  $basis = Accounts-Schlüssel (profil: $uHive…, benutzer: HKCU:…). Liefert nur vorhandene, nicht verschachtelte Ordner. */
const OD_WURZELN = String.raw`
function OdWurzeln([string]$basis) {
  $w = New-Object System.Collections.Generic.List[string]
  foreach ($a in @(Get-ChildItem -Path $basis -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^Business\d+$' })) {
    $uf = [string](Get-ItemProperty -Path $a.PSPath -EA SilentlyContinue).UserFolder
    if ($uf) { $w.Add($uf.TrimEnd('\')) }
    foreach ($t in @(Get-ChildItem -Path (Join-Path $a.PSPath 'Tenants') -EA SilentlyContinue)) { foreach ($n in @($t.Property)) { if ([string]$n -match '^[A-Za-z]:\\') { $w.Add(([string]$n).TrimEnd('\')) } } }
  }
  $e = @($w | Where-Object { Test-Path -LiteralPath $_ -PathType Container } | Sort-Object -Unique)
  @($e | Where-Object { $x = $_; -not @($e | Where-Object { $_ -ne $x -and $x.StartsWith($_ + '\', [StringComparison]::OrdinalIgnoreCase) }).Count })
}
`

/** Zählt Dateien in einem Ordner: lokal vorhanden (L/LB) bzw. nur online (O/OB) — mit Zeitlimit. Ändert nichts. */
const OD_BESTAND = String.raw`
function OdBestand([string]$d, [datetime]$bis) {
  $r = @{ L = 0; LB = [double]0; O = 0; OB = [double]0; Voll = $true }
  $st = New-Object System.Collections.Generic.Stack[string]; $st.Push($d)
  while ($st.Count -gt 0) {
    if ((Get-Date) -gt $bis) { $r.Voll = $false; break }
    $x = $st.Pop(); $ein = $null
    try { $ein = (New-Object System.IO.DirectoryInfo($x)).GetFileSystemInfos() } catch { continue }
    foreach ($e in $ein) {
      $at = [int64]$e.Attributes
      if ($at -band 16) { $st.Push($e.FullName); continue }
      if (($at -band 0x400000) -or ($at -band 0x1000)) { $r.O = $r.O + 1; $r.OB = $r.OB + $e.Length } else { $r.L = $r.L + 1; $r.LB = $r.LB + $e.Length }
    }
  }
  $r
}
`

/** Benutzersitzung: Zielordner aus $P bestimmen — nur innerhalb von OneDrive/SharePoint (sonst throw). Ergebnis: $wz, $ziele, $lw. */
const OD_ZIEL = OD_WURZELN + OD_BESTAND + String.raw`
$wz = @(OdWurzeln 'HKCU:\Software\Microsoft\OneDrive\Accounts')
if (-not $wz.Count) { throw 'Kein OneDrive-/SharePoint-Ordner gefunden (OneDrive ist für diesen Benutzer nicht eingerichtet).' }
$roh = $P.Trim().Trim('"').TrimEnd('\')
if (-not $roh) { throw 'Bitte einen Ordner angeben (z. B. „Dokumente\Projekte“ oder „Alles“).' }
if ($roh -match '[*?<>|"]' -or $roh -match '(^|[\\/])\.\.?([\\/]|$)') { throw ('Ungültiger Pfad: ' + $roh) }
$ziele = @()
if ($roh -match '^(?i)(alles|alle)$') { $ziele = $wz }
elseif ($roh -match '^[A-Za-z]:\\') { $ziele = @($roh) }
else { foreach ($w in $wz) { $c = Join-Path $w $roh; if (Test-Path -LiteralPath $c -PathType Container) { $ziele = @($c); break } } }
if (-not $ziele.Count) { throw ('Ordner „' + $roh + '“ in keinem OneDrive-/SharePoint-Ordner gefunden. Vorhanden: ' + ($wz -join ' · ')) }
foreach ($z in $ziele) {
  if (-not (Test-Path -LiteralPath $z -PathType Container)) { throw ('Kein Ordner: ' + $z) }
  $voll = [IO.Path]::GetFullPath($z).TrimEnd('\')
  $ok = $false; foreach ($w in $wz) { if ($voll -ieq $w -or $voll.StartsWith($w + '\', [StringComparison]::OrdinalIgnoreCase)) { $ok = $true } }
  if (-not $ok) { throw ('Nur Ordner innerhalb von OneDrive/SharePoint sind erlaubt — abgelehnt: ' + $voll) }
}
$lw = Split-Path -Path $ziele[0] -Qualifier
if (-not (Get-Process OneDrive -EA SilentlyContinue)) {
  $exe = @((Join-Path $env:LOCALAPPDATA 'Microsoft\OneDrive\OneDrive.exe'), 'C:\Program Files\Microsoft OneDrive\OneDrive.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($exe) { Start-Process -FilePath $exe -ArgumentList '/background'; Start-Sleep -Seconds 8; Zeile 'OneDrive lief nicht — gestartet (ohne OneDrive passiert nichts).' }
}
`

/** Browser + Profilordner aus $P („Edge“, „Chrome“, „Edge Profile 1“ …). Ergebnis: $nm, $proc, $ud, $prof, $d. */
const BROWSER_PROFIL = String.raw`
NeedUser
$roh = $P.Trim()
if ($roh -notmatch '^(?i)(edge|chrome)(\s+(default|profile \d{1,2}))?$') { throw ('Bitte „Edge“ oder „Chrome“ angeben, optional mit Profilordner (z. B. „Edge Profile 1“) — nicht erlaubt: ' + $roh) }
$prof = 'Default'
$pm = [regex]::Match($roh, '(?i)profile (\d{1,2})$'); if ($pm.Success) { $prof = 'Profile ' + $pm.Groups[1].Value }
if ($roh -match '^(?i)edge') { $nm = 'Edge'; $proc = 'msedge'; $ud = Join-Path $uLocal 'Microsoft\Edge\User Data' } else { $nm = 'Chrome'; $proc = 'chrome'; $ud = Join-Path $uLocal 'Google\Chrome\User Data' }
$d = Join-Path $ud $prof
if (-not (Test-Path -LiteralPath $d -PathType Container)) { $da = @(Get-ChildItem -LiteralPath $ud -Directory -EA SilentlyContinue | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' } | ForEach-Object { $_.Name }); throw ($nm + '-Profil „' + $prof + '“ nicht gefunden. Vorhanden: ' + $(if ($da.Count) { $da -join ', ' } else { 'keine' })) }
StopUser @($proc)
if (@(UserProcs @($proc)).Count) { throw ($nm + ' lässt sich nicht beenden — nichts geändert.') }
`

export const AKTIONEN_CLOUD: PaAktion[] = [
  // ══ OneDrive ═══════════════════════════════════════════════════════════════
  A({ id: 'od-konto-trennen', titel: 'OneDrive-Konto vom PC trennen', modus: 'benutzer', risiko: 'kritisch', timeoutMs: 90000,
    beschreibung: 'Wie „Verknüpfung dieses PCs aufheben“: Beendet OneDrive, sichert und entfernt das gewählte Konto (falsches/privates/altes Konto) und benennt dessen Einstellungen und Ordner um (*.alt_…, nichts wird gelöscht). Bricht ab, solange die Ordnersicherung Desktop/Dokumente in dieses Konto umleitet.',
    param: { label: 'Konto', platzhalter: 'Business1', pflicht: true, optionen: ['Business1', 'Business2', 'Personal'] },
    ps: String.raw`
$k = $P.Trim()
if ($k -notin 'Business1', 'Business2', 'Personal') { throw ('Konto nicht erlaubt: ' + $k) }
$basis = 'HKCU:\Software\Microsoft\OneDrive\Accounts'
$rk = $basis + '\' + $k
if (-not (Test-Path $rk)) { $da = @(Get-ChildItem $basis -EA SilentlyContinue | Where-Object { (Get-ItemProperty $_.PSPath -EA SilentlyContinue).UserEmail } | ForEach-Object { $_.PSChildName }); throw ('Konto ' + $k + ' ist auf diesem PC nicht eingerichtet. Eingerichtet: ' + $(if ($da.Count) { $da -join ', ' } else { 'keines' })) }
$p = Get-ItemProperty $rk -EA SilentlyContinue
$mail = [string]$p.UserEmail; $ordner = ([string]$p.UserFolder).TrimEnd('\')
if (-not $mail -and -not $ordner) { throw ('Konto ' + $k + ' ist nicht angemeldet — nichts zu trennen.') }
Zeile ('Vorher: ' + $k + ' = ' + $mail + ' · Ordner ' + $ordner)
$sf = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders' -EA SilentlyContinue
if ($ordner) { foreach ($n in 'Desktop', 'Personal', 'My Pictures') { $v = [Environment]::ExpandEnvironmentVariables([string]$sf.$n); if ($v -and $v.StartsWith($ordner, [StringComparison]::OrdinalIgnoreCase)) { throw ('Abgebrochen, nichts geändert: Die Ordnersicherung leitet „' + $n + '“ nach ' + $v + ' um. Erst in OneDrive unter Einstellungen → Synchronisierung und Sicherung → „Sicherung verwalten“ die Sicherung beenden.') } } }
$exe = @((Join-Path $env:LOCALAPPDATA 'Microsoft\OneDrive\OneDrive.exe'), 'C:\Program Files\Microsoft OneDrive\OneDrive.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($exe) { Start-Process -FilePath $exe -ArgumentList '/shutdown' -EA SilentlyContinue; Start-Sleep -Seconds 4 }
Get-Process OneDrive -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue; Start-Sleep -Seconds 2
$set = Join-Path $env:LOCALAPPDATA 'Microsoft\OneDrive\settings'
if (-not (Test-Path -LiteralPath $set)) { New-Item -Path $set -ItemType Directory -Force | Out-Null }
$sich = Join-Path $set ('Konto_' + $k + '.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.reg')
& reg.exe export ('HKCU\Software\Microsoft\OneDrive\Accounts\' + $k) $sich /y 2>&1 | Out-Null
if (-not (Test-Path -LiteralPath $sich)) { throw 'Sicherung des Konto-Eintrags fehlgeschlagen — nichts geändert.' }
[void](RenameAlt (Join-Path $set $k) ('OneDrive-Einstellungen ' + $k))
Remove-Item -Path $rk -Recurse -Force -EA Stop
Zeile ('Konto-Eintrag gesichert (' + $sich + ') und entfernt.')
if ($ordner -and (Test-Path -LiteralPath $ordner)) {
  try { [void](RenameAlt $ordner 'OneDrive-Ordner') } catch { Zeile ('OneDrive-Ordner nicht umbenannt (' + $_.Exception.Message + ') — beim Neueinrichten „Neuen Speicherort wählen“, damit sich nichts vermischt.') }
}
if ($exe) { Start-Process -FilePath $exe -ArgumentList '/background'; Zeile 'OneDrive neu gestartet — ohne dieses Konto.' }
Zeile ('Nachher: ' + $k + ' (' + $mail + ') ist getrennt. Lokal vorhandene Dateien liegen im umbenannten Altordner, nur-online-Dateien bleiben in der Cloud.')
if ($k -like 'Business*') { Zeile 'Geschäftskonto: OneDrive meldet sich meist von selbst mit dem Windows-Konto an — sonst auf die Wolke klicken und mit der Firmenadresse anmelden.' }` }),

  A({ id: 'od-sync-probleme', titel: 'OneDrive-Synchronisierungsprobleme finden', modus: 'profil', risiko: 'lesen', timeoutMs: 150000,
    beschreibung: 'Durchsucht die OneDrive- und SharePoint-Ordner des Benutzers nach Konfliktkopien („Datei-<PC>.xlsx“), ungültigen Namen, zu langen Pfaden (≥ 260 Zeichen), PST-Dateien und liegen gebliebenen ~$-Sperrdateien. Ändert nichts.',
    ps: OD_WURZELN + String.raw`
NeedHive
$wz = @(OdWurzeln ($uHive + '\Software\Microsoft\OneDrive\Accounts'))
if (-not $wz.Count) { throw 'Kein OneDrive-/SharePoint-Ordner des Benutzers gefunden (OneDrive nicht eingerichtet).' }
$pc = [string]$env:COMPUTERNAME
$kon = New-Object System.Collections.Generic.List[string]; $ung = New-Object System.Collections.Generic.List[string]; $lang = New-Object System.Collections.Generic.List[string]
$pst = New-Object System.Collections.Generic.List[string]; $sperr = New-Object System.Collections.Generic.List[string]
$res = '^(?i)(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\.|$)'
$bis = (Get-Date).AddSeconds(75); $anz = 0; $voll = $true
foreach ($w in $wz) {
  Zeile ('Ordner: ' + $w)
  $st = New-Object System.Collections.Generic.Stack[string]; $st.Push($w)
  while ($st.Count -gt 0) {
    if ((Get-Date) -gt $bis) { $voll = $false; break }
    $d = $st.Pop(); $ein = $null
    try { $ein = (New-Object System.IO.DirectoryInfo($d)).GetFileSystemInfos() } catch { continue }
    $namen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($e in $ein) { [void]$namen.Add($e.Name) }
    foreach ($e in $ein) {
      $anz++
      $rel = $e.FullName.Substring($w.Length).TrimStart('\')
      $istDir = ([int64]$e.Attributes -band 16) -ne 0
      if ($istDir) { $st.Push($e.FullName) }
      $nm = $e.Name
      if ($nm -match '^\s|\s$|\.$' -or $nm -match $res -or $nm -match '(?i)_vti_' -or $nm -ieq '.lock') { $ung.Add($rel) }
      elseif ($nm.StartsWith('~$')) { $sperr.Add($rel) }
      if ($e.FullName.Length -ge 260) { $lang.Add($rel + ' (' + $e.FullName.Length + ' Zeichen)') }
      if ($istDir) { continue }
      if ($nm -like '*.pst') { $pst.Add($rel + ' (' + (Groesse $e.Length) + ')') }
      foreach ($rx in '^(?<b>.+)-(?<pc>[A-Za-z0-9]{3,20})(-\d{1,3})?(?<x>\.[^.]+)$', '^(?<b>.+?)-(?<pc>[A-Za-z]+-[A-Za-z0-9]{3,20})(-\d{1,3})?(?<x>\.[^.]+)$') {
        $m = [regex]::Match($nm, $rx)
        if (-not $m.Success) { continue }
        $pcn = $m.Groups['pc'].Value
        $sieht = ($pcn -ieq $pc) -or (($pcn -cmatch '^[A-Z0-9-]+$') -and ($pcn -match '\d') -and ($pcn -match '[A-Z]'))
        if ($sieht -and $namen.Contains($m.Groups['b'].Value + $m.Groups['x'].Value)) { $kon.Add($rel + '  ↔  ' + $m.Groups['b'].Value + $m.Groups['x'].Value); break }
      }
    }
  }
  if (-not $voll) { break }
}
Zeile ('Geprüft: ' + $anz + ' Dateien und Ordner' + $(if (-not $voll) { ' (Zeitlimit erreicht — nicht alles geprüft)' } else { '' }))
foreach ($g in @(@('Konfliktkopien (Datei-<PC> neben dem Original)', $kon), @('Ungültige Namen (Leerzeichen/Punkt am Ende, reservierte Namen, _vti_)', $ung), @('Pfad zu lang (≥ 260 Zeichen, Office/Explorer scheitern)', $lang), @('Outlook-PST im OneDrive (blockiert, solange Outlook sie offen hat)', $pst), @('Office-Sperrdateien ~$ (Datei offen oder Reste nach Absturz)', $sperr))) {
  $l = $g[1]
  Zeile ('' + $g[0] + ': ' + $l.Count)
  foreach ($x in @($l | Select-Object -First 12)) { Zeile ('  ' + $x) }
  if ($l.Count -gt 12) { Zeile ('  … und ' + ($l.Count - 12) + ' weitere') }
}
if (-not ($kon.Count + $ung.Count + $lang.Count + $pst.Count)) { Zeile 'Keine typischen Ursachen gefunden — Details zeigt die Wolke → „Synchronisierungsprobleme anzeigen“.' }` }),

  A({ id: 'od-speicher-freigeben', titel: 'OneDrive: Ordner auf „nur online“ setzen (Speicherplatz freigeben)', modus: 'benutzer', risiko: 'aendern', timeoutMs: 300000,
    beschreibung: 'Wie Rechtsklick → „Speicherplatz freigeben“: Der Ordner (samt Unterordnern) wird nur noch online gehalten, die Dateien bleiben in der Cloud und laden beim Öffnen. Nur innerhalb von OneDrive/SharePoint des Benutzers; „Alles“ = alle OneDrive-/SharePoint-Ordner.',
    param: { label: 'Ordner im OneDrive (relativ oder vollständig) bzw. „Alles“', platzhalter: 'Dokumente\\Projekte', pflicht: true, vorlagen: ['Alles', 'Desktop', 'Dokumente', 'Bilder'] },
    ps: OD_ZIEL + String.raw`
$frei0 = (New-Object System.IO.DriveInfo($lw)).AvailableFreeSpace
foreach ($z in $ziele) {
  $v = OdBestand $z ((Get-Date).AddSeconds(40))
  & attrib.exe '-P' '+U' $z 2>&1 | Out-Null
  & attrib.exe '-P' '+U' (Join-Path $z '*') '/S' '/D' 2>&1 | Out-Null
  Zeile ('' + $z + ': vorher ' + $v.L + ' Dateien lokal (' + (Groesse $v.LB) + '), ' + $v.O + ' nur online' + $(if (-not $v.Voll) { ' (gezählt bis Zeitlimit)' } else { '' }) + ' → jetzt „nur online verfügbar“')
}
Start-Sleep -Seconds 15
$frei1 = (New-Object System.IO.DriveInfo($lw)).AvailableFreeSpace
Zeile ('Freier Platz ' + $lw + ': vorher ' + (Groesse $frei0) + ' → nach 15 s ' + (Groesse $frei1) + '. OneDrive gibt den Rest im Hintergrund frei; geöffnete Dateien bleiben lokal, bis sie geschlossen sind.')` }),

  A({ id: 'od-immer-behalten', titel: 'OneDrive: Ordner „immer auf diesem Gerät behalten“', modus: 'benutzer', risiko: 'aendern', timeoutMs: 300000,
    beschreibung: 'Wie Rechtsklick → „Immer auf diesem Gerät behalten“: Der Ordner wird vollständig heruntergeladen und ist auch ohne Internet bzw. für ältere Programme verfügbar. Prüft vorher, ob der Platz reicht (5 GB Reserve). Nur innerhalb von OneDrive/SharePoint des Benutzers.',
    param: { label: 'Ordner im OneDrive (relativ oder vollständig)', platzhalter: 'Dokumente\\Projekte', pflicht: true, vorlagen: ['Desktop', 'Dokumente'] },
    ps: OD_ZIEL + String.raw`
$frei = (New-Object System.IO.DriveInfo($lw)).AvailableFreeSpace
$best = @(); $summe = [double]0
foreach ($z in $ziele) { $v = OdBestand $z ((Get-Date).AddSeconds(40)); $best += ,@($z, $v); $summe = $summe + $v.OB }
if ($summe -gt ([double]$frei - 5GB)) { throw ('Zu wenig Platz, nichts geändert: ' + (Groesse $summe) + ' müssten heruntergeladen werden, frei sind ' + (Groesse $frei) + ' auf ' + $lw + ' (5 GB Reserve). Bitte einen kleineren Ordner wählen.') }
foreach ($b in $best) {
  $z = $b[0]; $v = $b[1]
  & attrib.exe '+P' '-U' $z 2>&1 | Out-Null
  & attrib.exe '+P' '-U' (Join-Path $z '*') '/S' '/D' 2>&1 | Out-Null
  Zeile ('' + $z + ': vorher ' + $v.O + ' Dateien nur online (' + (Groesse $v.OB) + '), ' + $v.L + ' lokal → jetzt „immer behalten“' + $(if (-not $v.Voll) { ' (gezählt bis Zeitlimit)' } else { '' }))
}
Zeile ('Freier Platz ' + $lw + ' vorher: ' + (Groesse $frei) + '. OneDrive lädt die Dateien jetzt im Hintergrund herunter (grüner Haken = fertig).')` }),

  A({ id: 'od-ordnersicherung-pruefen', titel: 'OneDrive-Ordnersicherung prüfen (Desktop/Dokumente/Bilder)', modus: 'profil', risiko: 'lesen', timeoutMs: 120000,
    beschreibung: 'Wohin Desktop, Dokumente, Bilder und Downloads zeigen (OneDrive, lokal, Netzlaufwerk), welche OneDrive-Richtlinien gelten und was die Sicherung blockiert (PST-Dateien, OneNote-Notizbücher, zu lange Pfade). Ändert nichts.',
    ps: String.raw`
NeedHive
$kt = @(Get-ChildItem ($uHive + '\Software\Microsoft\OneDrive\Accounts') -EA SilentlyContinue | ForEach-Object { $p = Get-ItemProperty $_.PSPath -EA SilentlyContinue; if ($p.UserFolder) { [pscustomobject]@{ K = $_.PSChildName; Mail = [string]$p.UserEmail; Ordner = ([string]$p.UserFolder).TrimEnd('\') } } })
foreach ($x in $kt) { Zeile ('Konto ' + $x.K + ': ' + $x.Mail + ' · ' + $x.Ordner) }
if (-not $kt.Count) { Zeile 'OneDrive ist für diesen Benutzer nicht eingerichtet — die Ordnersicherung braucht ein angemeldetes Geschäftskonto.' }
$usf = Get-Item ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') -EA SilentlyContinue
$lokal = @()
foreach ($o in @(@('Desktop', 'Desktop'), @('Dokumente', 'Personal'), @('Bilder', 'My Pictures'), @('Downloads', '{374DE290-123F-4565-9164-39C4925E467B}'), @('Musik', 'My Music'), @('Videos', 'My Video'))) {
  $roh = ''; if ($usf) { $roh = [string]$usf.GetValue($o[1], $null, 'DoNotExpandEnvironmentNames') }
  if (-not $roh) { Zeile ($o[0] + ': Standard'); continue }
  $pf = $roh -replace '(?i)%USERPROFILE%', $uProf
  $art = 'lokal (nicht gesichert)'
  foreach ($x in $kt) { if ($pf -ieq $x.Ordner -or $pf.StartsWith($x.Ordner + '\', [StringComparison]::OrdinalIgnoreCase)) { $art = 'in OneDrive gesichert (' + $x.K + ')' } }
  if ($pf -match '^\\\\') { $art = 'Netzlaufwerk (Ordnerumleitung per Richtlinie — blockiert die OneDrive-Sicherung)' }
  elseif ($pf -match '^%') { $art = 'Umleitung über Variable ' + ($pf -split '\\')[0] }
  elseif ($pf -match '^[A-Za-z]:' -and $pf -notmatch '^[Cc]:') { $art = 'anderes Laufwerk ' + $pf.Substring(0, 2) }
  elseif ($art -like 'lokal*' -and $pf -match '(?i)\\OneDrive( - [^\\]+)?(\\|$)') { $art = 'alter/anderer OneDrive-Ordner, NICHT im aktuellen Konto (wird nicht gesichert!)' }
  Zeile ($o[0] + ': ' + $pf + ' → ' + $art)
  if ($art -like 'lokal*' -and $o[0] -in 'Desktop', 'Dokumente', 'Bilder') { $lokal += ,@($o[0], $pf) }
}
$pol = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\OneDrive' -EA SilentlyContinue
$gs = @(); foreach ($n in 'KFMSilentOptIn', 'KFMSilentOptInDesktop', 'KFMSilentOptInDocuments', 'KFMSilentOptInPictures', 'KFMOptInWithWizard', 'KFMBlockOptIn', 'KFMBlockOptOut', 'FilesOnDemandEnabled', 'SilentAccountConfig', 'DisableFileSyncNGSC') { if ($null -ne $pol.$n) { $gs += ($n + '=' + $pol.$n) } }
Zeile ('Richtlinien: ' + $(if ($gs.Count) { $gs -join ' · ' } else { 'keine OneDrive-Richtlinien gesetzt' }))
if ($pol.KFMBlockOptOut -eq 1) { Zeile '  KFMBlockOptOut=1 → Die Sicherung kann der Benutzer nicht beenden (Firmenvorgabe).' }
if ($pol.KFMBlockOptIn -eq 1) { Zeile '  KFMBlockOptIn=1 → Die Ordnersicherung ist per Richtlinie verboten.' }
if ($pol.DisableFileSyncNGSC -eq 1) { Zeile '  DisableFileSyncNGSC=1 → OneDrive ist per Richtlinie abgeschaltet.' }
$bis = (Get-Date).AddSeconds(45)
foreach ($o in $lokal) {
  if (-not (Test-Path -LiteralPath $o[1])) { continue }
  $n = 0; $s = [double]0; $pstl = @(); $one = 0; $lg = 0; $voll = $true
  $st = New-Object System.Collections.Generic.Stack[string]; $st.Push($o[1])
  while ($st.Count -gt 0) {
    if ((Get-Date) -gt $bis) { $voll = $false; break }
    $dd = $st.Pop(); $ein = $null
    try { $ein = (New-Object System.IO.DirectoryInfo($dd)).GetFileSystemInfos() } catch { continue }
    foreach ($e in $ein) {
      if ([int64]$e.Attributes -band 16) { $st.Push($e.FullName); continue }
      $n++; $s = $s + $e.Length
      if ($e.Name -like '*.pst') { $pstl += ($e.Name + ' (' + (Groesse $e.Length) + ')') }
      if ($e.Name -like '*.one') { $one++ }
      if ($e.FullName.Length -ge 250) { $lg++ }
    }
  }
  Zeile ('Hindernisse in ' + $o[0] + ': ' + $n + ' Dateien, ' + (Groesse $s) + $(if (-not $voll) { ' (Zeitlimit — nicht alles gezählt)' } else { '' }))
  if ($pstl.Count) { Zeile ('  PST-Dateien (vor der Sicherung aus dem Ordner verschieben): ' + (($pstl | Select-Object -First 5) -join ', ')) }
  if ($one) { Zeile ('  OneNote-Dateien: ' + $one + ' (Notizbücher vorher in OneDrive verschieben bzw. schließen)') }
  if ($lg) { Zeile ('  Sehr lange Pfade (≥ 250 Zeichen): ' + $lg) }
}` }),

  A({ id: 'od-update', titel: 'OneDrive aktualisieren (Updater anstoßen)', modus: 'profil', risiko: 'aendern', timeoutMs: 240000,
    beschreibung: 'Startet die OneDrive-Update-Aufgabe des Benutzers bzw. des Computers (OneDriveStandaloneUpdater) und zeigt die Version vorher und nachher — gegen „Diese Version wird nicht mehr unterstützt“ und alte Fehler.',
    ps: String.raw`
NeedUser
if (-not $uSid) { throw 'SID des Benutzers unbekannt.' }
function OdVer { @(@(@((Join-Path $uLocal 'Microsoft\OneDrive\OneDrive.exe'), 'pro Benutzer'), @('C:\Program Files\Microsoft OneDrive\OneDrive.exe', 'pro Computer'), @('C:\Program Files (x86)\Microsoft OneDrive\OneDrive.exe', 'pro Computer x86')) | Where-Object { Test-Path -LiteralPath $_[0] } | ForEach-Object { [string](Get-Item -LiteralPath $_[0]).VersionInfo.ProductVersion + ' (' + $_[1] + ')' }) }
$vor = (OdVer) -join ', '
if (-not $vor) { throw 'OneDrive ist auf diesem PC nicht installiert.' }
Zeile ('Version vorher: ' + $vor)
$t = @(Get-ScheduledTask -EA SilentlyContinue | Where-Object { $_.TaskName -like 'OneDrive*Standalone Update Task*' -and ($_.TaskName -like ('*' + $uSid) -or $_.TaskName -like '*Per-Machine*') })
if (-not $t.Count) {
  $pmu = @('C:\Program Files\Microsoft OneDrive\OneDriveStandaloneUpdater.exe', 'C:\Program Files (x86)\Microsoft OneDrive\OneDriveStandaloneUpdater.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $pmu) { throw 'Keine OneDrive-Update-Aufgabe für diesen Benutzer gefunden — OneDrive bitte über das Softwarecenter neu installieren.' }
  $pr = Start-Process -FilePath $pmu -PassThru; [void]$pr.WaitForExit(150000); Zeile 'Updater (pro Computer) direkt ausgeführt.'
} else {
  foreach ($x in $t) { Start-ScheduledTask -TaskPath $x.TaskPath -TaskName $x.TaskName -EA Stop; Zeile ('Update-Aufgabe gestartet: ' + $x.TaskName) }
  $bis = (Get-Date).AddSeconds(150)
  do { Start-Sleep -Seconds 5; $lauf = @($t | ForEach-Object { Get-ScheduledTask -TaskPath $_.TaskPath -TaskName $_.TaskName -EA SilentlyContinue } | Where-Object { [string]$_.State -eq 'Running' }) } while ($lauf.Count -and (Get-Date) -lt $bis)
  if ($lauf.Count) { Zeile 'Das Update läuft noch im Hintergrund weiter.' }
}
$nach = (OdVer) -join ', '
Zeile ('Version jetzt: ' + $nach + $(if ($nach -eq $vor) { ' (unverändert — war schon aktuell oder die neue Version greift beim nächsten OneDrive-Start)' } else { '' }))` }),

  A({ id: 'od-autostart', titel: 'OneDrive-Autostart wieder einschalten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'OneDrive startet nach der Anmeldung nicht mehr von selbst: trägt den Autostart des Benutzers wieder ein und hebt eine Deaktivierung im Task-Manager auf (Reiter „Autostart“). Eine Richtlinie, die OneDrive abschaltet, wird nicht übergangen.',
    ps: String.raw`
NeedHive
$pol = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\OneDrive' -EA SilentlyContinue
if ($pol.DisableFileSyncNGSC -eq 1) { throw 'OneDrive ist per Richtlinie abgeschaltet (DisableFileSyncNGSC=1) — nichts geändert.' }
$exe = @((Join-Path $uLocal 'Microsoft\OneDrive\OneDrive.exe'), 'C:\Program Files\Microsoft OneDrive\OneDrive.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $exe) { throw 'OneDrive.exe nicht gefunden (OneDrive ist nicht installiert).' }
$run = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Run'
$alt = [string](Get-ItemProperty -Path $run -Name OneDrive -EA SilentlyContinue).OneDrive
$soll = '"' + $exe + '" /background'
$altExe = $alt -replace '^\s*"([^"]+)".*$', '$1'
if ($alt -and $altExe -match '(?i)OneDrive\.exe$' -and (Test-Path -LiteralPath $altExe)) { Zeile ('Autostart-Eintrag: vorhanden und gültig (' + $alt + ')') }
else {
  if (-not (Test-Path $run)) { New-Item -Path $run -Force | Out-Null }
  Set-ItemProperty -Path $run -Name OneDrive -Value $soll -Type String
  Zeile ('Autostart-Eintrag: vorher ' + $(if ($alt) { $alt } else { 'fehlte' }) + ' → jetzt ' + $soll)
}
$sa = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
$b = (Get-ItemProperty -Path $sa -Name OneDrive -EA SilentlyContinue).OneDrive
if ($b -and $b.Length -ge 1 -and ($b[0] -band 1)) {
  Set-ItemProperty -Path $sa -Name OneDrive -Value ([byte[]](2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)) -Type Binary
  Zeile ('Task-Manager-Autostart: vorher deaktiviert (0x' + ('{0:X2}' -f $b[0]) + ') → jetzt aktiviert')
} else { Zeile 'Task-Manager-Autostart: nicht deaktiviert' }
foreach ($x in @(Get-ScheduledTask -EA SilentlyContinue | Where-Object { $_.TaskName -like ('OneDrive Startup Task*' + $uSid) })) { Zeile ('Aufgabe ' + $x.TaskName + ': ' + $x.State) }
Zeile 'Wirkt ab der nächsten Anmeldung; jetzt sofort starten: „OneDrive neu starten“.'` }),

  // ══ Browser ═════════════════════════════════════════════════════════════════
  A({ id: 'browser-cache-alle', titel: 'Cache aller Browser leeren (Edge, Chrome, Firefox)', modus: 'profil', risiko: 'aendern', timeoutMs: 120000,
    beschreibung: 'Beendet Edge, Chrome und Firefox des Benutzers und leert deren Zwischenspeicher in allen Profilen (Seiten-, Skript-, Grafik- und Service-Worker-Cache). Anmeldungen, Favoriten, Kennwörter und Verlauf bleiben.',
    ps: String.raw`
NeedUser
StopUser @('msedge', 'chrome', 'firefox')
function LeereBereich([string]$label, [string[]]$pfade) {
  $vor = [double]0; $nach = [double]0; $n = 0
  foreach ($p in $pfade) {
    if (-not (Test-Path -LiteralPath $p)) { continue }
    $n++; $vor = $vor + (OrdnerGroesse $p)
    Get-ChildItem -LiteralPath $p -Force -EA SilentlyContinue | Remove-Item -Recurse -Force -EA SilentlyContinue
    $nach = $nach + (OrdnerGroesse $p)
  }
  if ($n) { Zeile ($label + ': ' + (Groesse ($vor - $nach)) + ' entfernt (' + $n + ' Cache-Ordner)' + $(if ($nach -gt 0) { ', ' + (Groesse $nach) + ' in Benutzung' } else { '' })) } else { Zeile ($label + ': nicht vorhanden') }
}
$teile = 'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Service Worker\CacheStorage', 'Service Worker\ScriptCache'
foreach ($b in @(@('Edge', 'Microsoft\Edge\User Data'), @('Chrome', 'Google\Chrome\User Data'))) {
  $ud = Join-Path $uLocal $b[1]; $l = @()
  foreach ($pr in @(Get-ChildItem -LiteralPath $ud -Directory -EA SilentlyContinue | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' })) { foreach ($c in $teile) { $l += (Join-Path $pr.FullName $c) } }
  foreach ($c in 'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache') { $l += (Join-Path $ud $c) }
  LeereBereich $b[0] $l
}
$ff = @(); foreach ($pr in @(Get-ChildItem -LiteralPath (Join-Path $uLocal 'Mozilla\Firefox\Profiles') -Directory -EA SilentlyContinue)) { foreach ($c in 'cache2', 'startupCache', 'thumbnails', 'jumpListCache') { $ff += (Join-Path $pr.FullName $c) } }
LeereBereich 'Firefox' $ff
Zeile 'Anmeldungen, Favoriten/Lesezeichen, Kennwörter und Verlauf bleiben erhalten.'` }),

  A({ id: 'edge-hsts-loeschen', titel: 'HSTS-Eintrag eines Servers in Edge/Chrome löschen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Der Browser erzwingt für einen internen Server https („…verwendet HSTS“, http wird zu https): Beendet Edge und Chrome und löscht den gemerkten HSTS-Eintrag dieses Servers (und übergeordneter Domänen mit Unterdomänen-Pflicht) in allen Profilen. Die Datei wird vorher gesichert.',
    param: { label: 'Servername (ohne http://)', platzhalter: 'intranet.skf.net', pflicht: true },
    ps: String.raw`
NeedUser
$roh = $P.Trim().ToLower()
$h = (($roh -replace '^[a-z][a-z0-9+.-]*://', '') -replace '[/:?#].*$', '').TrimEnd('.')
if ($h -notmatch '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$') { throw ('Ungültiger Servername: ' + $P + ' (z. B. intranet.skf.net)') }
function HstsHash([string]$n) { $by = New-Object System.Collections.Generic.List[byte]; foreach ($l in $n.Split('.')) { $lb = [Text.Encoding]::ASCII.GetBytes($l); $by.Add([byte]$lb.Length); $by.AddRange([byte[]]$lb) }; $by.Add([byte]0); $sha = [Security.Cryptography.SHA256]::Create(); [Convert]::ToBase64String($sha.ComputeHash($by.ToArray())) }
$kand = @(); $tl = $h.Split('.')
for ($i = 0; $i -lt [math]::Max(1, $tl.Count - 1); $i++) { $n = ($tl[$i..($tl.Count - 1)] -join '.'); $kand += [pscustomobject]@{ Name = $n; Hash = (HstsHash $n); Exakt = ($i -eq 0) } }
StopUser @('msedge', 'chrome')
$gef = 0
foreach ($b in @(@('Edge', 'Microsoft\Edge\User Data'), @('Chrome', 'Google\Chrome\User Data'))) {
  foreach ($pr in @(Get-ChildItem -LiteralPath (Join-Path $uLocal $b[1]) -Directory -EA SilentlyContinue | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' })) {
    foreach ($f in @((Join-Path $pr.FullName 'Network\TransportSecurity'), (Join-Path $pr.FullName 'TransportSecurity'))) {
      if (-not (Test-Path -LiteralPath $f)) { continue }
      $t = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8); $neu = $t; $weg = @()
      foreach ($k in $kand) {
        $m = [regex]::Match($neu, ('\{[^{}]*"host":"' + [regex]::Escape($k.Hash) + '"[^{}]*\}'))
        if (-not $m.Success) { continue }
        if (-not $k.Exakt -and $m.Value -notmatch '"sts_include_subdomains":true') { continue }
        $neu = $neu.Remove($m.Index, $m.Length); $weg += $k.Name
      }
      if (-not $weg.Count) { continue }
      $neu = (($neu -replace ',\s*,', ',') -replace '\[\s*,', '[') -replace ',\s*\]', ']'
      Copy-Item -LiteralPath $f -Destination ($f + '.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss')) -Force
      [IO.File]::WriteAllText($f, $neu, (New-Object System.Text.UTF8Encoding($false)))
      $gef += $weg.Count
      Zeile ('' + $b[0] + ' ' + $pr.Name + ': HSTS-Eintrag gelöscht für ' + ($weg -join ', ') + ' (vorher gemerkt → jetzt entfernt, Sicherung .alt_ daneben)')
    }
  }
}
if (-not $gef) { Zeile ('Kein gemerkter HSTS-Eintrag für ' + $h + ' gefunden. Bleibt die Umleitung, ist die Adresse fest im Browser hinterlegt (z. B. .dev/.app), Edge nutzt „Automatisch zu sichereren Verbindungen wechseln“ oder der Server leitet selbst auf https um.') }
else { Zeile 'Browser neu öffnen und die Adresse vollständig mit „http://“ eingeben. Ruft man danach die https-Seite des Servers auf, merkt sich der Browser die Pflicht ggf. erneut.' }` }),

  A({ id: 'browser-profile-anzeigen', titel: 'Browser-Profile anzeigen (Edge/Chrome: Konto, Favoriten, Synchronisierung)', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Alle Edge- und Chrome-Profile des Benutzers mit Anzeigename, angemeldetem Konto, Anzahl Favoriten, Kennwort-Datei, „Synchronisierung angehalten“ und gesicherten Altprofilen; dazu Firefox-Profile. Ändert nichts.',
    ps: String.raw`
NeedUser
Add-Type -AssemblyName System.Web.Extensions
$js = New-Object System.Web.Script.Serialization.JavaScriptSerializer; $js.MaxJsonLength = 104857600; $js.RecursionLimit = 256
function JsonLies([string]$f) { if (-not (Test-Path -LiteralPath $f)) { return $null }; try { return ,($js.DeserializeObject([IO.File]::ReadAllText($f, [Text.Encoding]::UTF8))) } catch { return $null } }
$gef = $false
foreach ($b in @(@('Edge', 'Microsoft\Edge\User Data'), @('Chrome', 'Google\Chrome\User Data'))) {
  $ud = Join-Path $uLocal $b[1]
  if (-not (Test-Path -LiteralPath $ud)) { Zeile ($b[0] + ': für diesen Benutzer nicht eingerichtet'); continue }
  $gef = $true
  $ls = JsonLies (Join-Path $ud 'Local State')
  $ic = $null; $zuletzt = ''
  if ($ls -is [System.Collections.IDictionary] -and $ls.ContainsKey('profile') -and $ls['profile'] -is [System.Collections.IDictionary]) { $ic = $ls['profile']['info_cache']; $zuletzt = [string]$ls['profile']['last_used'] }
  $dirs = @(Get-ChildItem -LiteralPath $ud -Directory -EA SilentlyContinue | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' -or $_.Name -like 'Default.alt_*' -or $_.Name -like 'Profile *.alt_*' })
  Zeile ($b[0] + ': ' + $dirs.Count + ' Profilordner' + $(if ($zuletzt) { ' · zuletzt benutzt: ' + $zuletzt } else { '' }))
  foreach ($d in $dirs) {
    $name = ''; $konto = ''
    if ($ic -is [System.Collections.IDictionary] -and $ic.ContainsKey($d.Name)) { $name = [string]$ic[$d.Name]['name']; $konto = [string]$ic[$d.Name]['user_name'] }
    $bm = 0; $bf = Join-Path $d.FullName 'Bookmarks'
    if (Test-Path -LiteralPath $bf) { $bm = ([regex]::Matches([IO.File]::ReadAllText($bf, [Text.Encoding]::UTF8), '"type":\s*"url"')).Count }
    $pw = Test-Path -LiteralPath (Join-Path $d.FullName 'Login Data')
    $sync = ''
    $pref = JsonLies (Join-Path $d.FullName 'Preferences')
    if ($pref -is [System.Collections.IDictionary] -and $pref.ContainsKey('sync') -and $pref['sync'] -is [System.Collections.IDictionary] -and $pref['sync'].ContainsKey('cached_persistent_auth_error') -and $pref['sync']['cached_persistent_auth_error']) { $sync = ' · SYNCHRONISIERUNG ANGEHALTEN (Anmeldung abgelaufen)' }
    $alt = $d.Name -like '*.alt_*'
    Zeile ('  ' + $d.Name + $(if ($alt) { ' (gesichertes Altprofil)' } else { '' }) + $(if ($name) { ' „' + $name + '“' } else { '' }) + ' · Konto: ' + $(if ($konto) { $konto } elseif ($alt) { '–' } else { 'NICHT angemeldet (keine Synchronisierung)' }) + ' · ' + $bm + ' Favoriten · Kennwort-Datei ' + (Ja $pw) + ' · zuletzt geändert ' + $d.LastWriteTime.ToString('dd.MM.yyyy') + $sync)
  }
}
$ffp = @(Get-ChildItem -LiteralPath (Join-Path $uRoam 'Mozilla\Firefox\Profiles') -Directory -EA SilentlyContinue)
if ($ffp.Count) { $gef = $true; Zeile ('Firefox: ' + $ffp.Count + ' Profil(e): ' + (($ffp | ForEach-Object { $_.Name + ' (Lesezeichen ' + (Ja (Test-Path -LiteralPath (Join-Path $_.FullName 'places.sqlite'))) + ')' }) -join ', ')) }
if (-not $gef) { Zeile 'Weder Edge-, Chrome- noch Firefox-Profile gefunden.' }` }),

  A({ id: 'browser-profil-neu', titel: 'Browser-Profil neu anlegen (altes bleibt gesichert)', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Bei Profilfehlern und dauerhaft kaputtem Edge/Chrome: Beendet den Browser, benennt den Profilordner um (*.alt_…, bleibt erhalten) und legt ein leeres Profil an; die Favoriten werden übernommen. Kennwörter, Verlauf und Erweiterungen kommen über die Synchronisierung des Firmenkontos zurück.',
    param: { label: 'Browser [Profilordner]', platzhalter: 'Edge', pflicht: true, vorlagen: ['Edge', 'Chrome', 'Edge Profile 1', 'Chrome Profile 1'] },
    ps: BROWSER_PROFIL + String.raw`
$bm = Join-Path $d 'Bookmarks'; $nb = 0
if (Test-Path -LiteralPath $bm) { $nb = ([regex]::Matches([IO.File]::ReadAllText($bm, [Text.Encoding]::UTF8), '"type":\s*"url"')).Count }
$neu = $prof + '.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Rename-Item -LiteralPath $d -NewName $neu -Force -EA Stop
$altd = Join-Path $ud $neu
Zeile ('Vorher: ' + $nm + '-Profil „' + $prof + '“ mit ' + $nb + ' Favoriten → umbenannt in ' + $neu)
New-Item -Path $d -ItemType Directory -Force | Out-Null
$kop = 0; foreach ($f in 'Bookmarks', 'Bookmarks.bak') { $q = Join-Path $altd $f; if (Test-Path -LiteralPath $q) { Copy-Item -LiteralPath $q -Destination (Join-Path $d $f) -Force; $kop++ } }
Zeile ('Jetzt: neues, leeres Profil „' + $prof + '“' + $(if ($kop) { ' — Favoriten übernommen' } else { ' (es gab keine Favoriten-Datei)' }) + '.')
Zeile ('Kennwörter, Verlauf und Erweiterungen kommen nach der Anmeldung mit dem Firmenkonto über die Synchronisierung zurück; ohne Synchronisierung liegen sie weiter im Altordner ' + $altd + '.')` }),

  A({ id: 'browser-einstellungen-reset', titel: 'Browser-Einstellungen auf Standard zurücksetzen (Edge/Chrome)', modus: 'profil', risiko: 'kritisch',
    beschreibung: 'Wie „Einstellungen zurücksetzen“: Beendet den Browser und benennt die Einstellungsdateien des Profils um (*.alt_…). Startseite, Suchmaschine, Seitenberechtigungen (Benachrichtigungen, Pop-ups, Kamera), Zoom, Druckeinstellungen und Erweiterungen werden zurückgesetzt; Favoriten, Kennwörter, Verlauf und Cookies bleiben. Firmenrichtlinien gelten weiter.',
    param: { label: 'Browser [Profilordner]', platzhalter: 'Edge', pflicht: true, vorlagen: ['Edge', 'Chrome', 'Edge Profile 1', 'Chrome Profile 1'] },
    ps: BROWSER_PROFIL + String.raw`
$n = 0
foreach ($f in 'Preferences', 'Secure Preferences') { if (RenameAlt (Join-Path $d $f) ($nm + ' ' + $prof + ': ' + $f)) { $n++ } }
if (-not $n) { throw 'Keine Einstellungsdateien gefunden — nichts geändert.' }
Zeile 'Zurückgesetzt: Startseite, neuer Tab, Suchmaschine, Seitenberechtigungen (Benachrichtigungen, Pop-ups, Kamera/Mikrofon), Zoom, Druckeinstellungen, „Beim Schließen löschen“ und Erweiterungen.'
Zeile 'Erhalten: Favoriten, gespeicherte Kennwörter, Verlauf und Cookies. Firmenvorgaben und Firmen-Erweiterungen kommen automatisch zurück; ggf. im Browser oben rechts einmal mit dem Firmenkonto anmelden.'` }),
]
