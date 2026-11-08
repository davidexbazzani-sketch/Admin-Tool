// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „lw“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Bereich: Netzlaufwerke & Dateien. Grundsätze: Auf Server-Freigaben wird NIE geschrieben (dort nur gelesen),
// Rechte werden nie geändert (nur angezeigt — vergeben werden sie über den Freigabe-Besitzer/DXC).
// Ändernde Bausteine wirken nur lokal (Benutzerprofil, lokale Laufwerke, USB-Stick) bzw. auf den SMB-Client des PCs.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Pfad-Helfer für die Benutzersitzung: Netzlaufwerke des Benutzers, Pfad prüfen, lange Pfade (\\?\). */
const LW4_PFAD = String.raw`
function LwZiele {
  $z = @{}
  foreach ($m in @(Get-SmbMapping -EA SilentlyContinue)) { if ($m.LocalPath) { $z[([string]$m.LocalPath).ToUpper()] = [string]$m.RemotePath } }
  foreach ($f in @(Get-ChildItem 'HKCU:\Network' -EA SilentlyContinue)) { $b = $f.PSChildName.ToUpper() + ':'; if (-not $z.ContainsKey($b)) { $z[$b] = [string](Get-ItemProperty $f.PSPath).RemotePath } }
  return $z
}
function PfadNorm([string]$roh, [string]$was) {
  $px = ([string]$roh).Trim().Trim('"').Trim()
  if ($px -match '^[A-Za-z]:$') { $px = $px + '\' }
  if ($px -notmatch '^([A-Za-z]:\\|\\\\[^\\]+\\[^\\]+)' -or $px -match '[*?<>|"]') { throw ('Bitte ' + $was + ' als vollständigen Pfad angeben, z. B. I:\Projekte\Kunde A oder \\w3172\skf Marine\Projekte') }
  if ($px.Length -gt 3) { $px = $px.TrimEnd('\') }
  return $px
}
function LangPfad([string]$px) { if ($px.StartsWith('\\?\')) { return $px }; if ($px.StartsWith('\\')) { return '\\?\UNC\' + $px.Substring(2) }; return '\\?\' + $px }
function KurzPfad([string]$px) { if ($px.StartsWith('\\?\UNC\')) { return '\\' + $px.Substring(8) }; if ($px.StartsWith('\\?\')) { return $px.Substring(4) }; return $px }
$lw = LwZiele
`

export const AKTIONEN_LW4: PaAktion[] = [
  // ══ Berechtigungen: nur anzeigen ════════════════════════════════════════════
  A({ id: 'lw4-pfad-zugriff', titel: 'Pfad Ebene für Ebene prüfen: wo endet der Zugriff, wer ist Besitzer, welche Gruppen dürfen', modus: 'benutzer', risiko: 'lesen', timeoutMs: 120000,
    beschreibung: 'Prüft mit dem Konto des Benutzers jede Ebene eines Pfads (Freigabe → Unterordner → Datei): vorhanden, erreichbar oder „Zugriff verweigert“. Zeigt für den Ordner, an dem es endet, Besitzer und NTFS-Berechtigungen (Gruppen, geerbt/direkt), markiert die Gruppen, in denen der Benutzer ist, und berechnet seine Rechte (Lesen, Schreiben, Ordner anlegen, Löschen) — dazu Attribute wie verschlüsselt (EFS) oder schreibgeschützt. Ändert nichts; die Ausgabe passt direkt in einen Rechte-Antrag beim Freigabe-Besitzer.',
    param: { label: 'Pfad (Ordner oder Datei)', platzhalter: String.raw`I:\Einkauf\Lieferanten`, pflicht: true, vorlagen: ['I:\\', 'G:\\', 'H:\\'] },
    ps: LW4_PFAD + String.raw`
$pfad0 = PfadNorm $P 'den Ordner bzw. die Datei'
$unc = $pfad0
if ($pfad0 -match '^([A-Za-z]:)(.*)$') {
  $d = $matches[1].ToUpper(); $rest0 = $matches[2]
  if ($lw.ContainsKey($d)) { $unc = $lw[$d].TrimEnd('\') + $rest0; Zeile ('Laufwerk ' + $d + ' = ' + $lw[$d]) } else { Zeile ('Laufwerk ' + $d + ' ist für den Benutzer kein verbundenes Netzlaufwerk (lokal oder nicht verbunden).') }
}
if ($unc -match '^(\\\\[^\\]+\\[^\\]+)(.*)$') { $basis = $matches[1]; $rest = $matches[2] } elseif ($unc -match '^([A-Za-z]:\\)(.*)$') { $basis = $matches[1]; $rest = $matches[2] } else { throw ('Pfad nicht auswertbar: ' + $unc) }
if ($basis -match '^\\\\([^\\]+)\\') {
  $srv = $matches[1]; $ok = $false
  try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($srv, 445).Wait(3000); $t.Close() } catch {}
  Zeile ('Server ' + $srv + ': ' + $(if ($ok) { 'erreichbar (Port 445)' } else { 'NICHT erreichbar (Port 445) — Netz, Homeoffice-Zugang oder Server prüfen' }))
}
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$meine = @{}; $meine[$id.User.Value] = $true; foreach ($g in @($id.Groups)) { $meine[[string]$g.Value] = $true }
Zeile ('Geprüft als ' + $id.Name + ' (' + $meine.Count + ' Konto-/Gruppen-Kennungen aus der Anmeldung — neue Gruppen wirken erst nach Ab-/Anmelden bzw. Kerberos-Erneuerung)')
$stufen = New-Object System.Collections.Generic.List[string]
$stufen.Add($basis.TrimEnd('\') + $(if ($basis -match ':\\$') { '\' } else { '' }))
$akt = $basis.TrimEnd('\')
foreach ($t in @($rest -split '\\' | Where-Object { $_ })) { $akt = $akt + '\' + $t; $stufen.Add($akt) }
function ZugPfad([string]$s) { if ($s.Length -gt 240) { LangPfad $s } else { $s } }
$letzte = $null; $halt = $null; $grund = ''
Zeile 'Ebenen:'
foreach ($s in $stufen) {
  try {
    $it = Get-Item -LiteralPath (ZugPfad $s) -Force -EA Stop
    if ($it.PSIsContainer) { $null = @(Get-ChildItem -LiteralPath (ZugPfad $s) -Force -EA Stop | Select-Object -First 1) }
    Zeile ('  ok          ' + $s); $letzte = $s
  } catch {
    $msg = [string]$_.Exception.Message; $kat = [string]$_.CategoryInfo.Category
    if ($kat -eq 'PermissionDenied' -or $_.Exception -is [System.UnauthorizedAccessException] -or $msg -match 'verweigert|denied') { $grund = 'VERWEIGERT' }
    elseif ($kat -eq 'ObjectNotFound' -or $msg -match 'nicht gefunden|nicht vorhanden|not find|not exist') { $grund = 'FEHLT' } else { $grund = 'FEHLER' }
    Zeile ('  ' + $grund.PadRight(11) + ' ' + $s + $(if ($grund -eq 'FEHLER') { ' — ' + $msg } else { '' }))
    $halt = $s; break
  }
}
if (-not $halt) { Zeile 'Ergebnis: Alle Ebenen sind mit dem Konto des Benutzers erreichbar.' }
elseif ($grund -eq 'VERWEIGERT') { Zeile ('Ergebnis: Der Zugriff endet bei „' + $halt + '“ — dort fehlt dem Benutzer die Ordnerberechtigung.') }
elseif ($grund -eq 'FEHLT') { Zeile ('Ergebnis: „' + $halt + '“ gibt es nicht (Schreibweise? umbenannt, verschoben oder gelöscht? → Vorgängerversionen) — oder der Ordner ist ausgeblendet, weil das Recht fehlt.') }
function Generisch([int64]$m) {
  if ($m -band 268435456) { $m = $m -bor 2032127 }
  if ($m -band 2147483648) { $m = $m -bor 1179785 }
  if ($m -band 1073741824) { $m = $m -bor 1179926 }
  if ($m -band 536870912) { $m = $m -bor 1179808 }
  return ($m -band 2097151)
}
function RechtText([int64]$m) {
  if (($m -band 2032127) -eq 2032127) { return 'Vollzugriff' }
  if (($m -band 197055) -eq 197055) { return 'Ändern' }
  $t = @()
  if ($m -band 1) { $t += 'Lesen' }
  if ($m -band 2) { $t += 'Dateien anlegen/schreiben' }
  if ($m -band 4) { $t += 'Ordner anlegen' }
  if ($m -band 65536) { $t += 'Löschen' }
  if ($m -band 64) { $t += 'Inhalt löschen' }
  if (-not $t.Count) { if ($m -band 32) { $t += 'nur Durchqueren' } elseif ($m -band 131072) { $t += 'nur Berechtigungen lesen' } else { $t += ('Sonderrecht ' + $m) } }
  return ($t -join ', ')
}
function AclZeigen([string]$pf) {
  $acl = $null
  try { $acl = Get-Acl -LiteralPath (ZugPfad $pf) -EA Stop } catch { Zeile ('Berechtigungen von „' + $pf + '“: nicht lesbar (' + $_.Exception.Message + ')'); return $false }
  Zeile ('Berechtigungen (NTFS) von „' + $pf + '“:')
  Zeile ('  Besitzer: ' + [string]$acl.Owner + ' (oft der Ersteller — Rechte vergibt DXC auf Antrag des Freigabe-/Ordnerverantwortlichen)')
  if ($acl.AreAccessRulesProtected) { Zeile '  Vererbung ist hier unterbrochen — der Ordner hat eigene Rechte, abweichend vom übergeordneten.' }
  $allow = [int64]0; $deny = [int64]0; $n = 0
  foreach ($r in @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))) {
    $sid = [string]$r.IdentityReference.Value
    $name = $sid; try { $name = $r.IdentityReference.Translate([System.Security.Principal.NTAccount]).Value } catch {}
    $m = Generisch ([int64][int]$r.FileSystemRights)
    $nurErben = ([int]$r.PropagationFlags -band 2) -ne 0
    $verw = [string]$r.AccessControlType -eq 'Deny'
    $ich = $meine.ContainsKey($sid)
    if ($ich -and -not $nurErben) { if ($verw) { $deny = $deny -bor $m } else { $allow = $allow -bor $m } }
    $n++
    if ($n -le 20) { Zeile ('  ' + $(if ($ich) { '[Benutzer ist Mitglied] ' } else { '' }) + $name + ': ' + $(if ($verw) { 'VERWEIGERT ' } else { '' }) + (RechtText $m) + $(if ($r.IsInherited) { ' (geerbt)' } else { ' (direkt gesetzt)' }) + $(if ($nurErben) { ' – nur für Unterobjekte' } else { '' })) }
  }
  if ($n -gt 20) { Zeile ('  … und ' + ($n - 20) + ' weitere Einträge') }
  $eff = $allow -band (-bnot $deny)
  Zeile ('Rechte des Benutzers hier laut NTFS: Lesen ' + (Ja (($eff -band 1) -ne 0)) + ' · Dateien anlegen/ändern ' + (Ja (($eff -band 2) -ne 0)) + ' · Ordner anlegen ' + (Ja (($eff -band 4) -ne 0)) + ' · Löschen ' + (Ja ((($eff -band 65536) -ne 0) -or (($eff -band 64) -ne 0))) + ' (die Freigabe-Berechtigung kann zusätzlich einschränken)')
  return $true
}
if ($halt -and $grund -eq 'VERWEIGERT') { if (-not (AclZeigen $halt)) { if ($letzte) { [void](AclZeigen $letzte) } } }
elseif ($halt) { if ($letzte) { [void](AclZeigen $letzte) } }
else {
  [void](AclZeigen $stufen[$stufen.Count - 1])
  $ziel = Get-Item -LiteralPath (ZugPfad $stufen[$stufen.Count - 1]) -Force -EA SilentlyContinue
  if ($ziel) {
    $att = $ziel.Attributes
    Zeile ('Attribute: ' + [string]$att)
    if ($att -band [IO.FileAttributes]::Encrypted) { Zeile 'VERSCHLÜSSELT (EFS, grüner Name): Nur der Ersteller kann den Inhalt öffnen — er nimmt unter Eigenschaften → Erweitert den Haken „Inhalt verschlüsseln“ heraus.' }
    if (-not $ziel.PSIsContainer -and ($att -band [IO.FileAttributes]::ReadOnly)) { Zeile 'Schreibschutz-Attribut gesetzt — Programme dürfen die Datei nicht überschreiben (Eigenschaften → Haken „Schreibgeschützt“).' }
    if (-not $ziel.PSIsContainer) { $zi = Get-Content -LiteralPath $ziel.FullName -Stream Zone.Identifier -EA SilentlyContinue; if ($zi -match 'ZoneId=[34]') { Zeile 'Datei ist als „aus dem Internet“ markiert (Internet-Markierung) — Office/Explorer behandeln sie eingeschränkt.' } }
  }
}` }),

  // ══ Namen, Pfadlängen, Größe ════════════════════════════════════════════════
  A({ id: 'lw4-namen-pruefen', titel: 'Ordner prüfen: zu lange Pfade, ungültige Namen, Größe (auch für ein Kopierziel)', modus: 'benutzer', risiko: 'lesen', timeoutMs: 180000,
    beschreibung: 'Durchsucht einen Ordner (Netzlaufwerk, lokal oder USB) mit dem Konto des Benutzers: Pfade über 259 Zeichen, Namen mit Leerzeichen/Punkt am Ende, reservierte Namen (CON, NUL …), Ersatzzeichen von Mac/NAS, gekürzte 8.3-Namen, gleiche Namen in anderer Groß-/Kleinschreibung, ungewöhnliche Zeichen (Gedankenstrich, Emoji, # % &, Umlaute), Dateien über 4 GB, bei USB-Stick/CF-Karte als Ziel auch Namen mit Leerzeichen bzw. länger als 8.3, verschlüsselte Dateien, Sperr- und Mac-Hilfsdateien — dazu Anzahl, Gesamtgröße, größte Dateien und freier Platz. Mit „> Zielordner“ wird berechnet, welche Pfade am Ziel zu lang würden und ob der Platz reicht. Höchstens 40.000 Einträge bzw. 100 Sekunden; ändert nichts.',
    param: { label: 'Ordner (optional „> Zielordner“)', platzhalter: 'I:\\Projekte\\Kunde A > E:\\', pflicht: true, vorlagen: ['I:\\', 'H:\\', String.raw`I:\Projekte > I:\Archiv\2026\Projekte`] },
    ps: LW4_PFAD + String.raw`
if ($P -notmatch '^\s*"?([^">]+?)"?\s*(?:>\s*"?([^">]+?)"?\s*)?$') { throw 'Bitte so angeben: Ordner  bzw.  Ordner > Zielordner, z. B. I:\Projekte\Kunde A > E:\' }
$qRoh = $matches[1]; $zRoh = $matches[2]
$q = PfadNorm $qRoh 'den Ordner'
$ziel = $null; if ($zRoh) { $ziel = PfadNorm $zRoh 'den Zielordner' }
if (-not (Test-Path -LiteralPath (LangPfad $q))) { throw ('Nicht gefunden bzw. kein Zugriff: ' + $q) }
$eltern = Split-Path $q -Parent
$relStart = $(if ($eltern) { $eltern.TrimEnd('\').Length + 1 } else { $q.TrimEnd('\').Length + 1 })
if ($q.Length -le 3) { $relStart = 3 }
$start = Get-Date; $max = 40000; $sek = 100
$stapel = New-Object System.Collections.Generic.Stack[string]
$stapel.Push((LangPfad $q))
$n = 0; $nOrd = 0; $nDat = 0; $summe = [double]0; $abbruch = ''; $maxLen = 0; $maxPfad = ''
$befund = @{}
function Merke([string]$k, [string]$t) { if (-not $befund.ContainsKey($k)) { $befund[$k] = New-Object System.Collections.Generic.List[string] }; $befund[$k].Add($t) }
$gross = New-Object System.Collections.Generic.List[object]
$reserviert = '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.[^.]*)?$'
$ungew = '[\u2013\u2014\u00A0\u2018\u2019\u201A\u201C\u201D\u201E\u00B4\u2026]|[\uD800-\uDFFF]'
$zielWechsel = $false
if ($ziel -and $ziel -match '^([A-Za-z]:)') { try { $zd = New-Object System.IO.DriveInfo($matches[1]); $zielWechsel = $zd.IsReady -and ([string]$zd.DriveType -eq 'Removable' -or $zd.DriveFormat -match '^FAT') } catch {} }
while ($stapel.Count) {
  if ($n -ge $max) { $abbruch = 'nach ' + $max + ' Einträgen'; break }
  if (((Get-Date) - $start).TotalSeconds -gt $sek) { $abbruch = 'nach ' + $sek + ' Sekunden'; break }
  $dir = $stapel.Pop()
  $inhalt = @()
  try { $inhalt = @((New-Object System.IO.DirectoryInfo($dir)).GetFileSystemInfos()) } catch { Merke 'Kein Zugriff auf Unterordner' (KurzPfad $dir); continue }
  $namen = @{}
  foreach ($e in $inhalt) {
    $n++
    $voll = KurzPfad $e.FullName; $nm = $e.Name
    $istOrd = ($e.Attributes -band [IO.FileAttributes]::Directory) -ne 0
    if ($istOrd) { $nOrd++; if (($e.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) { $stapel.Push($e.FullName) } }
    else { $nDat++; $summe += [double]$e.Length; if ($e.Length -gt 52428800) { $gross.Add([pscustomobject]@{ L = [double]$e.Length; P = $voll }) }; if ($e.Length -gt 4294967295) { Merke 'Datei größer als 4 GB (passt nicht auf FAT32-USB-Sticks)' ($voll + ' (' + (Groesse $e.Length) + ')') } }
    $len = $voll.Length
    if ($len -gt $maxLen) { $maxLen = $len; $maxPfad = $voll }
    if ($len -ge 260) { Merke 'Pfad länger als 259 Zeichen (Explorer/Office scheitern)' ($voll + ' (' + $len + ')') } elseif ($len -gt 240) { Merke 'Pfad knapp an der Grenze (241–259 Zeichen)' ($voll + ' (' + $len + ')') }
    if ($ziel -and $voll.Length -gt $relStart) { $neuLen = $ziel.TrimEnd('\').Length + 1 + ($voll.Length - $relStart); if ($neuLen -ge 260 -and $len -lt 260) { Merke 'Würde am Ziel zu lang (≥ 260 Zeichen)' ($voll + ' → ' + $neuLen + ' Zeichen') } }
    if ($nm -match '[ .]$') { Merke 'Name endet mit Leerzeichen oder Punkt (Explorer kann ihn nicht öffnen/löschen)' $voll }
    if ($nm -match '^ ') { Merke 'Name beginnt mit Leerzeichen' $voll }
    if ($nm -match $reserviert) { Merke 'Reservierter Gerätename (CON, PRN, AUX, NUL, COM1 …)' $voll }
    if ($nm -match '[\x00-\x1F]') { Merke 'Steuerzeichen im Namen' $voll }
    if ($nm -match '[\uF000-\uF0FF]') { Merke 'Ersatzzeichen von Mac/NAS (ursprünglich : * ? " < > | im Namen)' $voll }
    if ($nm -cmatch '^[A-Z0-9_\-]{1,6}~[0-9A-Z]{1,4}(\.[A-Z0-9]{1,3})?$') { Merke 'Gekürzter 8.3-Ersatzname (Original hatte unzulässige Zeichen, z. B. von NAS/Maschine)' $voll }
    if ($nm -match $ungew) { Merke 'Ungewöhnliche Zeichen (Gedankenstrich, typogr. Anführungszeichen, geschütztes Leerzeichen, Emoji) – Ärger in SAP, CAD, Skripten, an Maschinen' $voll }
    if ($nm -match '[#%&{}]') { Merke 'Zeichen # % & { } im Namen – Links, Skripte und manche Programme scheitern' $voll }
    if ($nm -match '[äöüÄÖÜß]') { Merke 'Umlaute oder ß im Namen (ältere Programme, Maschinen, Fremdsysteme)' $voll }
    if ($zielWechsel -and -not $istOrd) { $bas = [IO.Path]::GetFileNameWithoutExtension($nm); $ext = [IO.Path]::GetExtension($nm); if ($nm -match ' ' -or $bas.Length -gt 8 -or $ext.Length -gt 4) { Merke 'Für Wechseldatenträger/Maschinen ungünstig: Leerzeichen oder länger als 8.3 (8 Zeichen + Endung)' $voll } }
    if ($nm -match '^\._|^\.DS_Store$') { Merke 'Mac-Hilfsdateien (._…, .DS_Store) – können weg' $voll }
    if ($nm -match '^~\$') { Merke 'Liegen gebliebene Office-Sperrdateien (~$…)' $voll }
    if (-not $istOrd -and ($e.Attributes -band [IO.FileAttributes]::Encrypted)) { Merke 'Mit EFS verschlüsselt (grüner Name) – nur der Ersteller kann sie öffnen' $voll }
    $k = $nm.ToLowerInvariant()
    if ($namen.ContainsKey($k)) { Merke 'Gleicher Name in anderer Groß-/Kleinschreibung (Windows sieht nur eine)' ($voll + '  ↔  ' + $namen[$k]) } else { $namen[$k] = $nm }
  }
}
Zeile ('Geprüft: ' + $q + ' · ' + $nDat + ' Dateien, ' + $nOrd + ' Ordner, ' + (Groesse $summe) + $(if ($abbruch) { ' · ABGEBROCHEN ' + $abbruch + ' (Teilergebnis)' } else { '' }))
if ($maxPfad) { Zeile ('Längster Pfad: ' + $maxLen + ' Zeichen — ' + $maxPfad) }
foreach ($lwb in @($q, $ziel)) {
  if (-not $lwb -or $lwb -notmatch '^([A-Za-z]:)') { continue }
  try { $di = New-Object System.IO.DriveInfo($matches[1]); if ($di.IsReady) { Zeile ('Laufwerk ' + $di.Name + ' (' + $di.DriveFormat + ', ' + [string]$di.DriveType + '): frei für den Benutzer ' + (Groesse $di.AvailableFreeSpace) + ' von ' + (Groesse $di.TotalSize) + $(if ($lwb -eq $ziel) { $(if ([double]$di.AvailableFreeSpace -lt $summe) { ' — REICHT NICHT für ' + (Groesse $summe) } else { ' — reicht für ' + (Groesse $summe) }) + $(if ($di.DriveFormat -eq 'FAT32') { ' · FAT32: keine Dateien über 4 GB möglich' } else { '' }) } else { '' })) } } catch {}
}
if ($ziel -and $ziel -match '^\\\\') { Zeile ('Ziel ' + $ziel + ': freier Platz auf Freigaben ohne Laufwerksbuchstaben nicht abfragbar.') }
if (-not $befund.Count) { Zeile 'Keine auffälligen Namen oder Pfade gefunden.' }
foreach ($k in @($befund.Keys | Sort-Object)) {
  $l = $befund[$k]
  Zeile ($k + ': ' + $l.Count)
  foreach ($x in @($l | Select-Object -First 8)) { Zeile ('    ' + $x) }
  if ($l.Count -gt 8) { Zeile ('    … und ' + ($l.Count - 8) + ' weitere') }
}
if ($gross.Count) { Zeile 'Größte Dateien:'; foreach ($g in @($gross | Sort-Object L -Descending | Select-Object -First 6)) { Zeile ('    ' + (Groesse $g.L) + ' · ' + $g.P) } }` }),

  // ══ Lokale Dateien entsperren (nie auf Servern) ════════════════════════════
  A({ id: 'lw4-dateien-freigeben', titel: 'Lokale Dateien freigeben: Internet-Markierung, Schreibschutz oder „Versteckt“ entfernen (auch USB-Stick)', modus: 'benutzer', risiko: 'aendern', timeoutMs: 180000,
    beschreibung: 'Für eine Datei oder einen Ordner auf dem PC bzw. USB-Stick (nie auf Netzlaufwerken/Servern, nie in Windows- oder Programmordnern, auf C: nur im Benutzerprofil und C:\\Temp): „Markierung“ entfernt die Internet-Markierung (wie Eigenschaften → „Zulassen“) — Programme, Skripte, Makro-Dateien und Hilfedateien (.chm) nie; „Schreibschutz“ nimmt das Attribut „Schreibgeschützt“ weg; „Versteckt“ macht versteckte Dateien und Ordner wieder sichtbar und entschärft verdächtige Verknüpfungen eines USB-Virus (umbenannt, nicht gelöscht); „Alles“ macht alles drei. Ohne Angabe: Markierung + Schreibschutz. Zeigt vorher/nachher; höchstens 20.000 Einträge.',
    param: { label: 'Pfad (lokal/USB) | Markierung, Schreibschutz, Versteckt oder Alles', platzhalter: String.raw`C:\Users\name\Downloads\Lieferantenpaket | Markierung`, pflicht: true, vorlagen: [String.raw`C:\Users\ | Markierung`, String.raw`E:\ | Versteckt`, String.raw`C:\Temp\ | Schreibschutz`] },
    ps: LW4_PFAD + String.raw`
if ($P -notmatch '^\s*"?([^"|]+?)"?\s*(?:\|\s*(Markierung|Schreibschutz|Versteckt|Alles)\s*)?$') { throw 'Bitte so angeben: Pfad | Markierung, Schreibschutz, Versteckt oder Alles — z. B. C:\Users\name\Downloads\Paket | Markierung' }
$pf = ([string]$matches[1]).Trim(); $was = [string]$matches[2]; if (-not $was) { $was = 'Markierung+Schreibschutz' }
if ($pf -match '^[A-Za-z]:$') { $pf = $pf + '\' }
if ($pf -notmatch '^[A-Za-z]:\\') { throw 'Nur lokale Pfade (C:, D:, USB-Stick) — auf Netzlaufwerken und Servern ändert das Tool nichts.' }
$d = $pf.Substring(0, 2).ToUpper()
$di = $null; try { $di = New-Object System.IO.DriveInfo($d) } catch {}
if ($lw.ContainsKey($d) -or ($di -and [string]$di.DriveType -eq 'Network')) { throw ($d + ' ist ein Netzlaufwerk — auf Server-Freigaben ändert das Tool nichts. Dort entsperrt der Benutzer selbst (Rechtsklick → Eigenschaften → „Zulassen“) oder kopiert die Datei vorher auf den PC.') }
if (-not $di -or -not $di.IsReady) { throw ('Laufwerk ' + $d + ' ist nicht bereit (Stick eingesteckt?).') }
$voll = [IO.Path]::GetFullPath($pf)
foreach ($s in @($env:windir, [Environment]::GetFolderPath('ProgramFiles'), [Environment]::GetFolderPath('ProgramFilesX86'), [Environment]::GetFolderPath('CommonApplicationData'))) {
  if (-not $s) { continue }
  $s2 = $s.TrimEnd('\')
  if ($voll.TrimEnd('\') -ieq $s2 -or $voll.StartsWith($s2 + '\', [StringComparison]::OrdinalIgnoreCase)) { throw ('Systemordner (' + $s2 + ') werden nicht verändert.') }
}
$sysLw = ([string]$env:SystemDrive).ToUpper()
if ($d -eq $sysLw) {
  $prof = ([string]$env:USERPROFILE).TrimEnd('\')
  if (-not ($voll.TrimEnd('\') -ieq $prof -or $voll.StartsWith($prof + '\', [StringComparison]::OrdinalIgnoreCase) -or $voll -match '^[A-Za-z]:\\Temp(\\|$)')) { throw ('Auf ' + $sysLw + ' nur im Benutzerprofil (' + $prof + ') oder in C:\Temp.') }
}
if (-not (Test-Path -LiteralPath $voll)) { throw ('Nicht gefunden: ' + $voll) }
$einzel = -not (Test-Path -LiteralPath $voll -PathType Container)
$wurzel = $voll.TrimEnd('\').Length -le 2
$dateien = @(); $ordner = @()
if ($einzel) { $dateien = @(Get-Item -LiteralPath $voll -Force) }
else {
  $alle = @(Get-ChildItem -LiteralPath $voll -Recurse -Force -EA SilentlyContinue | Select-Object -First 20001)
  if ($alle.Count -gt 20000) { throw 'Mehr als 20.000 Einträge — bitte einen kleineren Ordner angeben.' }
  $dateien = @($alle | Where-Object { -not $_.PSIsContainer }); $ordner = @($alle | Where-Object { $_.PSIsContainer })
  if (-not $wurzel) { $ordner += @(Get-Item -LiteralPath $voll -Force) }
}
Zeile ('Pfad: ' + $voll + ' · ' + $(if ($einzel) { 'eine Datei' } else { '' + $dateien.Count + ' Dateien, ' + $ordner.Count + ' Ordner' }) + ' · Laufwerk ' + $d + ' (' + [string]$di.DriveType + ', ' + $di.DriveFormat + ')')
$prog = '\.(exe|msi|msp|bat|cmd|com|scr|pif|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|jar|lnk|reg|cpl|msc|dll|sys|iso|img|vhd|vhdx|appx|msix|appref-ms|url|inf|application)$'
# Makrofähige Office-Dateien, alte Office-Formate, Access, CHM, OneNote, Publisher, RTF und Mails: Internet-Markierung
# wird NIE entfernt — das Tool hebt Makro-Sperren grundsätzlich nicht auf (auch nicht für eine einzelne Datei).
$makro = '\.(docm|dotm|xlsm|xltm|xlsb|xlam|xla|pptm|potm|ppam|ppsm|sldm|vsdm|accdb|accde|mdb|mde|chm|doc|dot|xls|xlt|ppt|pot|pps|rtf|one|pub|msg|eml|mpp)$'
if ($was -match 'Markierung|Alles') {
  $nGes = 0; $nOk = 0; $aus = New-Object System.Collections.Generic.List[string]
  foreach ($f in $dateien) {
    $zi = $null; try { $zi = Get-Content -LiteralPath $f.FullName -Stream Zone.Identifier -EA Stop } catch {}
    if (-not $zi) { continue }
    $nGes++
    $nm = $f.Name.ToLower()
    if ($nm -match $prog -or $nm -match $makro) { $aus.Add($f.FullName); continue }
    try { Unblock-File -LiteralPath $f.FullName -EA Stop; $nOk++ } catch { Zeile ('  nicht entsperrt: ' + $f.FullName + ' — ' + $_.Exception.Message) }
  }
  Zeile ('Internet-Markierung: vorher ' + $nGes + ' markierte Datei(en) → ' + $nOk + ' entsperrt' + $(if ($nGes -eq 0) { ' (keine Markierung vorhanden — Ursache liegt woanders)' } else { '' }))
  if ($aus.Count) { Zeile ('  Bewusst NICHT entsperrt (Programme, Skripte, Makro- und Hilfedateien): ' + $aus.Count); foreach ($x in @($aus | Select-Object -First 8)) { Zeile ('    ' + $x) }; Zeile '  Makro-Sperren hebt das Tool nie auf — darüber entscheidet die IT-Sicherheit (z. B. vertrauenswürdiger Speicherort).' }
}
if ($was -match 'Schreibschutz|Alles') {
  $nS = 0; $nSok = 0
  foreach ($f in $dateien) { if ($f.IsReadOnly) { $nS++; try { $f.IsReadOnly = $false; $nSok++ } catch { Zeile ('  Schreibschutz bleibt: ' + $f.FullName + ' — ' + $_.Exception.Message) } } }
  Zeile ('Schreibschutz-Attribut: vorher ' + $nS + ' Datei(en) schreibgeschützt → ' + $nSok + ' freigegeben' + $(if ([string]$di.DriveType -eq 'Removable' -and $nS -eq 0) { ' (Meldet der Stick trotzdem „schreibgeschützt“: Schalter am Stick bzw. Sperre per Richtlinie)' } else { '' }))
}
if ($was -match 'Versteckt|Alles') {
  $schutz = '^(desktop\.ini|thumbs\.db|autorun\.inf|system volume information|\$recycle\.bin|recycler|indexervolumeguid|wpsettings\.dat|~\$.*|\.ds_store|\._.*|\.trashes|\.spotlight-v100|\.fseventsd)$'
  $nV = 0; $nVok = 0; $verd = New-Object System.Collections.Generic.List[string]
  $hs = [int]([IO.FileAttributes]::Hidden -bor [IO.FileAttributes]::System)
  foreach ($x in @($dateien) + @($ordner)) {
    if (-not $x) { continue }
    if ($x.FullName.TrimEnd('\').Length -le 2) { continue }
    $att = $x.Attributes
    if (([int]$att -band $hs) -eq 0) { continue }
    $nml = $x.Name.ToLower()
    if ($nml -match $schutz) { continue }
    if ($nml -match $prog) { $verd.Add($x.FullName); continue }
    $nV++
    try { $x.Attributes = ([int]$att -band (-bnot $hs)); $nVok++ } catch { Zeile ('  bleibt versteckt: ' + $x.FullName + ' — ' + $_.Exception.Message) }
  }
  Zeile ('Versteckt/System: vorher ' + $nV + ' Datei(en)/Ordner versteckt → ' + $nVok + ' wieder sichtbar')
  if (-not $einzel) {
    $sh = New-Object -ComObject WScript.Shell
    foreach ($l in @(Get-ChildItem -LiteralPath $voll -Filter '*.lnk' -File -Force -EA SilentlyContinue)) {
      $z = ''; try { $k = $sh.CreateShortcut($l.FullName); $z = ([string]$k.TargetPath + ' ' + [string]$k.Arguments).Trim() } catch {}
      if ($z -match '(?i)(cmd\.exe|wscript|cscript|powershell|rundll32|mshta|regsvr32|\.vbs|\.vbe|\.js\b|\.jse|\.wsf)') {
        $neu = $l.Name + '.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
        try { Rename-Item -LiteralPath $l.FullName -NewName $neu -EA Stop; Zeile ('VERDÄCHTIGE Verknüpfung entschärft: ' + $l.Name + ' → ' + $neu + ' (startete „' + $z + '“)') } catch { Zeile ('VERDÄCHTIGE Verknüpfung: ' + $l.FullName + ' (startet „' + $z + '“) — nicht umbenennbar') }
      }
    }
  }
  if ($verd.Count) { Zeile ('VERDÄCHTIG: ' + $verd.Count + ' versteckte Programm-/Skriptdatei(en) blieben unverändert:'); foreach ($x in @($verd | Select-Object -First 8)) { Zeile ('    ' + $x) } }
  if ($verd.Count) { Zeile 'Bitte den Datenträger mit Microsoft Defender prüfen (Rechtsklick → „Mit Microsoft Defender überprüfen“) und die IT-Sicherheit informieren, bevor er an anderen PCs oder Maschinen steckt.' }
}` }),

  // ══ SMB-Client: Zwischenspeicher ════════════════════════════════════════════
  A({ id: 'lw4-smb-cache', titel: 'Zwischenspeicher des SMB-Clients einstellen (neue/gelöschte Dateien sofort sehen)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Der SMB-Client merkt sich Ordnerinhalte (10 s), Datei-Infos wie Größe/Datum (10 s) und „Datei nicht gefunden“ (5 s). Programme, die eine gerade erzeugte Datei sofort öffnen (Scan-, CAD/CAM-, Mess- oder Export-Programme), bekommen dann kurz „nicht gefunden“ bzw. veraltete Inhalte. „Sofort aktuell“ schaltet alle drei ab, „Nur Nicht-gefunden-Cache aus“ nur den letzten, „Standard“ stellt Windows-Werte her. Zeigt vorher/nachher; gilt für neue Verbindungen (Laufwerke neu verbinden bzw. ab-/anmelden), spätestens nach einem Neustart.',
    param: { label: 'Einstellung', platzhalter: 'Sofort aktuell (Cache aus)', pflicht: true, optionen: ['Sofort aktuell (Cache aus)', 'Nur Nicht-gefunden-Cache aus', 'Standard (10/10/5 Sekunden)'] },
    ps: String.raw`
$w = $P.Trim()
if ($w -match '^Sofort') { $neu = @(0, 0, 0) } elseif ($w -match '^Nur') { $neu = @(10, 10, 0) } elseif ($w -match '^Standard') { $neu = @(10, 10, 5) } else { throw ('Auswahl nicht erlaubt: ' + $w) }
$namen = @('DirectoryCacheLifetime', 'FileInfoCacheLifetime', 'FileNotFoundCacheLifetime')
$txt = @('Ordnerinhalte', 'Datei-Infos (Größe/Datum)', 'Nicht gefunden')
$k = 'HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters'
$c = $null; try { $c = Get-SmbClientConfiguration -EA Stop } catch {}
$alt = @()
foreach ($nm in $namen) { $v = $null; if ($c) { $v = $c.$nm }; if ($null -eq $v) { $v = (Get-ItemProperty $k -Name $nm -EA SilentlyContinue).$nm }; $alt += ,$v }
if ($c) {
  Set-SmbClientConfiguration -DirectoryCacheLifetime ([uint32]$neu[0]) -FileInfoCacheLifetime ([uint32]$neu[1]) -FileNotFoundCacheLifetime ([uint32]$neu[2]) -Force -Confirm:$false -EA Stop | Out-Null
} else {
  if (-not (Test-Path $k)) { throw 'Einstellungen des Arbeitsstationsdienstes (LanmanWorkstation) nicht gefunden.' }
  for ($i = 0; $i -lt 3; $i++) { Set-ItemProperty -Path $k -Name $namen[$i] -Value ([int]$neu[$i]) -Type DWord }
}
$c2 = $null; try { $c2 = Get-SmbClientConfiguration -EA Stop } catch {}
for ($i = 0; $i -lt 3; $i++) {
  $jetzt = $(if ($c2) { $c2.($namen[$i]) } else { $neu[$i] })
  Zeile ('Cache „' + $txt[$i] + '“ (' + $namen[$i] + '): vorher ' + $(if ($null -eq $alt[$i]) { 'Standard' } else { '' + $alt[$i] + ' s' }) + ' → jetzt ' + $jetzt + ' s')
}
Zeile 'Gilt für neue Verbindungen: Laufwerke neu verbinden bzw. einmal ab- und anmelden — spätestens nach einem Neustart wirksam.'
if ($neu[0] -eq 0) { Zeile 'Hinweis: Ohne Zwischenspeicher fragt der PC den Server öfter — bei sehr langsamer Verbindung kann das Blättern in großen Ordnern etwas träger werden.' }` }),

  // ══ Dateien finden ══════════════════════════════════════════════════════════
  A({ id: 'lw4-datei-finden', titel: 'Datei wiederfinden: zuletzt geöffnet, Office-Liste, Profilordner und ein Netzordner', modus: 'benutzer', risiko: 'lesen', timeoutMs: 200000,
    beschreibung: 'Sucht eine Datei nach Namen (Teil genügt, * und ? erlaubt) dort, wo Windows und Office sich Dateien merken: „Zuletzt verwendet“ des Benutzers, die Listen der zuletzt geöffneten Word-/Excel-/PowerPoint-Dateien, Desktop, Dokumente und Downloads — und, falls angegeben, rekursiv in einem Ordner auf dem Netzlaufwerk (höchstens 90 Sekunden). Zeigt Pfad, Zeitpunkt und ob die Datei dort noch liegt. Mit „* | Ordner“ bzw. „*.pdf | Ordner“ die neuesten Dateien eines Ordners (z. B. Scan-Ordner). Ändert nichts.',
    param: { label: 'Dateiname (Teil) | Ordner zum Durchsuchen (optional)', platzhalter: String.raw`Angebot Müller | I:\Vertrieb`, pflicht: true, vorlagen: [String.raw`*.pdf | I:\Scan`, 'Kalkulation | I:\\', 'Zeichnung | G:\\'] },
    ps: LW4_PFAD + String.raw`
$teile = $P -split '\|', 2
$such = ([string]$teile[0]).Trim().Trim('"').Trim()
$ord = $null; if ($teile.Count -gt 1 -and ([string]$teile[1]).Trim()) { $ord = PfadNorm $teile[1] 'den Ordner' }
if ($such -match '[\\/:<>|"]') { throw 'Bitte nur den Dateinamen (oder einen Teil) angeben — einen Ordner hinter „|“, z. B. Angebot | I:\Vertrieb' }
$alleNeu = ($such -eq '*' -or $such -match '^\*\.[A-Za-z0-9]{1,6}$')
if ($such.Length -lt 2 -and -not $alleNeu) { throw 'Bitte mindestens 2 Zeichen des Dateinamens angeben (oder „* | Ordner“ für die neuesten Dateien eines Ordners).' }
if ($alleNeu -and -not $ord) { throw 'Mit „*“ bitte einen Ordner angeben, z. B. *.pdf | I:\Scan' }
$muster = $(if ($such -match '[*?]') { $such } else { '*' + $such + '*' })
$liste = New-Object System.Collections.Generic.List[object]
$gesehen = @{}
function Treffer([string]$pfad, [datetime]$zeit, [string]$quelle) { $k = $pfad.ToLowerInvariant(); if ($gesehen.ContainsKey($k)) { return }; if ($liste.Count -ge 20000) { return }; $gesehen[$k] = $true; $liste.Add([pscustomobject]@{ P = $pfad; T = $zeit; Q = $quelle }) }
if (-not $alleNeu) {
  $rec = [Environment]::GetFolderPath('Recent')
  $sh = New-Object -ComObject WScript.Shell
  foreach ($l in @(Get-ChildItem -LiteralPath $rec -Filter '*.lnk' -File -EA SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 600)) {
    if ($l.BaseName -notlike $muster) { continue }
    $z = ''; try { $z = [string]$sh.CreateShortcut($l.FullName).TargetPath } catch {}
    if ($z) { Treffer $z $l.LastWriteTime 'zuletzt verwendet' }
  }
  foreach ($app in 'Word', 'Excel', 'PowerPoint') {
    foreach ($kk in @(Get-ChildItem ('HKCU:\Software\Microsoft\Office\16.0\' + $app + '\User MRU') -EA SilentlyContinue)) {
      $props = Get-ItemProperty -LiteralPath (Join-Path $kk.PSPath 'File MRU') -EA SilentlyContinue
      if (-not $props) { continue }
      foreach ($pp in $props.PSObject.Properties) {
        if ($pp.Name -notmatch '^Item \d+$') { continue }
        $v = [string]$pp.Value
        if ($v -match '\[T([0-9A-Fa-f]{16})\].*?\*(.+)$') {
          $pfad = $matches[2]; $zeit = [datetime]::MinValue
          try { $zeit = [datetime]::FromFileTime([Convert]::ToInt64($matches[1], 16)) } catch {}
          $leaf = ($pfad -split '[\\/]')[-1]
          if ($leaf -like $muster) { Treffer $pfad $zeit ($app + ': zuletzt geöffnet') }
        }
      }
    }
  }
}
function SucheIn([string]$wurzel, [int]$sek, [string]$quelle) {
  $bis = (Get-Date).AddSeconds($sek); $st = New-Object System.Collections.Generic.Stack[string]; $st.Push((LangPfad $wurzel)); $nOrd = 0
  while ($st.Count -and (Get-Date) -lt $bis) {
    $dinfo = New-Object System.IO.DirectoryInfo($st.Pop()); $nOrd++
    try { foreach ($f in $dinfo.GetFiles($muster)) { Treffer (KurzPfad $f.FullName) $f.LastWriteTime $quelle } } catch {}
    try { foreach ($u in $dinfo.GetDirectories()) { $a = $u.Attributes; if (-not (($a -band [IO.FileAttributes]::ReparsePoint) -and ($a -band ([IO.FileAttributes]::Hidden -bor [IO.FileAttributes]::System)))) { $st.Push($u.FullName) } } } catch {}
  }
  return ('' + $nOrd + ' Ordner durchsucht' + $(if ($st.Count) { ', Zeitlimit erreicht (' + $st.Count + ' Ordner nicht mehr durchsucht)' } else { ', vollständig' }))
}
if ($ord) {
  if (-not (Test-Path -LiteralPath (LangPfad $ord))) { Zeile ('Ordner nicht erreichbar bzw. kein Zugriff: ' + $ord) } else { Zeile ('Netz-/Ordnersuche in ' + $ord + ': ' + (SucheIn $ord 90 'Ordnersuche')) }
}
if (-not $alleNeu) {
  $lokal = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('MyDocuments'), (Join-Path $env:USERPROFILE 'Downloads')) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
  foreach ($o in $lokal) { $null = SucheIn $o 20 'Profil' }
}
$srvOk = @{}
function Da([string]$dp) {
  if ($dp -match '^https?:') { return ' [Cloud/SharePoint]' }
  $srv = $null
  if ($dp -match '^\\\\([^\\]+)\\') { $srv = $matches[1] } elseif ($dp -match '^([A-Za-z]:)') { $b = $matches[1].ToUpper(); if ($lw.ContainsKey($b) -and $lw[$b] -match '^\\\\([^\\]+)\\') { $srv = $matches[1] } }
  if ($srv) { if (-not $srvOk.ContainsKey($srv)) { $ok = $false; try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($srv, 445).Wait(1500); $t.Close() } catch {}; $srvOk[$srv] = $ok }; if (-not $srvOk[$srv]) { return ' [Server nicht erreichbar]' } }
  if (Test-Path -LiteralPath (LangPfad $dp)) { return '' } else { return ' [dort NICHT mehr vorhanden – verschoben, umbenannt oder gelöscht?]' }
}
Zeile ('Suche nach „' + $such + '“: ' + $liste.Count + ' Treffer' + $(if ($liste.Count -gt 25) { ' (die 25 neuesten)' } else { '' }))
foreach ($t in @($liste | Sort-Object T -Descending | Select-Object -First 25)) {
  Zeile ('  ' + $(if ($t.T -gt [datetime]'2000-01-01') { $t.T.ToString('dd.MM.yyyy HH:mm') } else { '—' }) + ' · ' + $t.P + ' (' + $t.Q + ')' + (Da $t.P))
}
if (-not $liste.Count) { Zeile 'Nichts gefunden — anderen Namensteil versuchen, einen Ordner angeben („Name | I:\Abteilung“) oder die Vorgängerversionen des Ordners prüfen.' }` }),

  // ══ Verknüpfung / Schnellzugriff anlegen ════════════════════════════════════
  A({ id: 'lw4-verknuepfung-anlegen', titel: 'Desktop-Verknüpfung, Schnellzugriff oder „Senden an“ für einen Netzordner anlegen', modus: 'benutzer', risiko: 'aendern', timeoutMs: 90000,
    beschreibung: 'Legt für den Benutzer eine Verknüpfung zu einem Ordner oder einer Datei auf seinem Desktop an, heftet einen Ordner an den Schnellzugriff des Explorers an („Beides“ = Desktop + Schnellzugriff) oder nimmt einen Ordner ins Rechtsklick-Menü „Senden an“ auf. Prüft vorher, ob das Ziel mit seinem Konto erreichbar ist und ob es schon eine Verknüpfung bzw. einen angehefteten Eintrag gibt (nichts doppelt, nichts überschrieben). Liegt der Desktop auf einem Server (Ordnerumleitung), wird dort nichts angelegt.',
    param: { label: 'Ziel (Ordner/Datei) | Desktop, Schnellzugriff, Beides oder Senden an', platzhalter: String.raw`I:\Einkauf\Lieferanten | Beides`, pflicht: true, vorlagen: [String.raw`I:\ | Desktop`, String.raw`G:\ | Desktop`, String.raw`I:\ | Schnellzugriff`, String.raw`I:\ | Senden an`] },
    ps: LW4_PFAD + String.raw`
if ($P -notmatch '^\s*"?([^"|]+?)"?\s*(?:\|\s*(Desktop|Schnellzugriff|Beides|Senden an)\s*)?$') { throw 'Bitte so angeben: Ziel | Desktop, Schnellzugriff, Beides oder Senden an — z. B. I:\Einkauf\Lieferanten | Beides' }
$roh = $matches[1]; $wo = [string]$matches[2]; if (-not $wo) { $wo = 'Desktop' }
$ziel = PfadNorm $roh 'das Ziel'
if (-not (Test-Path -LiteralPath $ziel)) { throw ('Ziel nicht vorhanden bzw. mit dem Konto des Benutzers nicht erreichbar: ' + $ziel + ' (Laufwerk verbunden? Berechtigung?)') }
$istOrdner = Test-Path -LiteralPath $ziel -PathType Container
if ($ziel.Length -le 3) { $name = 'Laufwerk ' + $ziel.Substring(0, 1).ToUpper() + $(if ($lw.ContainsKey($ziel.Substring(0, 2).ToUpper())) { ' (' + (($lw[$ziel.Substring(0, 2).ToUpper()] -split '\\')[-1]) + ')' } else { '' }) }
else { $name = ($ziel.TrimEnd('\') -split '\\')[-1] }
$name = ($name -replace '[\\/:*?"<>|]', '_').Trim()
if ($ziel -match '^[A-Za-z]:' -and -not $lw.ContainsKey($ziel.Substring(0, 2).ToUpper())) { Zeile ('Hinweis: ' + $ziel.Substring(0, 2) + ' ist kein Netzlaufwerk des Benutzers (lokal) — Verknüpfung wird trotzdem angelegt.') }
function LnkAnlegen([string]$ort, [string]$wasOrt) {
  if (-not $ort) { Zeile ($wasOrt + ': Ordner des Benutzers nicht gefunden — nichts angelegt.'); return }
  if ($ort -match '^\\\\' -or $lw.ContainsKey($ort.Substring(0, 2).ToUpper())) { Zeile ($wasOrt + ' liegt auf einem Server (' + $ort + ') — dort legt das Tool nichts an.'); return }
  if (-not (Test-Path -LiteralPath $ort)) { Zeile ($wasOrt + ': Ordner ' + $ort + ' fehlt — nichts angelegt.'); return }
  $sh = New-Object -ComObject WScript.Shell
  foreach ($l in @(Get-ChildItem -LiteralPath $ort -Filter '*.lnk' -File -EA SilentlyContinue)) { try { if (([string]$sh.CreateShortcut($l.FullName).TargetPath).TrimEnd('\') -ieq $ziel.TrimEnd('\')) { Zeile ($wasOrt + ': „' + $l.Name + '“ zeigt schon auf ' + $ziel + ' — nichts geändert.'); return } } catch {} }
  $lnk = Join-Path $ort ($name + '.lnk'); $i = 2
  while (Test-Path -LiteralPath $lnk) { $lnk = Join-Path $ort ($name + ' (' + $i + ').lnk'); $i++ }
  $k = $sh.CreateShortcut($lnk); $k.TargetPath = $ziel
  if (-not $istOrdner) { $k.WorkingDirectory = (Split-Path $ziel -Parent) }
  $k.Save()
  Zeile ($wasOrt + ': Verknüpfung angelegt — ' + (Split-Path $lnk -Leaf) + ' → ' + $ziel)
}
if ($wo -match 'Desktop|Beides') { LnkAnlegen ([Environment]::GetFolderPath('Desktop')) 'Desktop' }
if ($wo -match 'Senden') {
  if (-not $istOrdner) { Zeile '„Senden an“: Nur Ordner sind als Ziel sinnvoll — bitte einen Ordner angeben.' } else { LnkAnlegen ([Environment]::GetFolderPath('SendTo')) 'Menü „Senden an“'; Zeile 'Rechtsklick auf eine Datei → „Senden an“ → Ordnername kopiert die Datei dorthin.' }
}
if ($wo -match 'Schnellzugriff|Beides') {
  if (-not $istOrdner) { Zeile 'Schnellzugriff: Nur Ordner lassen sich anheften — für eine Datei die Desktop-Verknüpfung nehmen.' }
  else {
    $app = New-Object -ComObject Shell.Application
    function Angeheftet {
      $qa = $app.Namespace('shell:::{679f85cb-0220-4080-b29b-5540cc05aab6}')
      if (-not $qa) { return 'unbekannt' }
      foreach ($it in $qa.Items()) { if (([string]$it.Path).TrimEnd('\') -ieq $ziel.TrimEnd('\')) { $pin = $null; try { $pin = $it.ExtendedProperty('System.Home.IsPinned') } catch {}; if ($pin -eq $true) { return 'ja' }; return 'in der Liste' } }
      return 'nein'
    }
    $vor = Angeheftet
    if ($vor -eq 'ja') { Zeile ('Schnellzugriff: ' + $ziel + ' ist schon angeheftet — nichts geändert.') }
    else {
      $f = $app.Namespace($ziel)
      if (-not $f) { throw ('Der Explorer kann den Ordner nicht öffnen: ' + $ziel) }
      $f.Self.InvokeVerb('pintohome')
      Start-Sleep -Seconds 2
      $nach = Angeheftet
      Zeile ('Schnellzugriff (angeheftet): vorher ' + $vor + ' → jetzt ' + $nach + ' · ' + $ziel + $(if ($nach -eq 'ja') { ' — fertig.' } elseif ($nach -eq 'in der Liste') { ' — steht in der Liste, Anheften aber nicht bestätigt (im Explorer prüfen).' } else { ' — Anheften angestoßen, aber nicht bestätigt (Schnellzugriff-Liste beschädigt? → „Schnellzugriff zurücksetzen“).' }))
    }
  }
}` }),
]
