// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „sapcad“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// SAP GUI (Eingabehistorie, Traces, Darstellung), Kompatibilität/DPI von SAP GUI, SolidWorks, eDrawings und FreeCAD,
// SolidWorks-Zusatzanwendungen beim Start, SolidWorks-Wiederherstellungsdateien, SOLIDWORKS PDM (nur lesend)
// und der 3Dconnexion-Treiber. Alles wirkt nur im Profil bzw. in der Sitzung des ANGEMELDETEN Benutzers —
// nie auf SAP-Systeme, den PDM-Tresor/-Server, Lizenzen, Server-Freigaben oder die Installation selbst.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Was „sapcad4-sap-benutzerdaten-zuruecksetzen“ zurücksetzen kann. */
const SAP_TEILE = ['Eingabehistorie', 'Traces abschalten und löschen', 'Darstellung (Theme, Farben, Schrift)']

/** Programme × Einstellungen für „sapcad4-kompatibilitaet“. */
const KOMPAT_PROGRAMME = ['SAP GUI', 'SolidWorks', 'eDrawings', 'FreeCAD']
const KOMPAT_MODI = ['Skalierung durch Anwendung', 'Skalierung durch System (erweitert)', 'Standard (Kompatibilität zurücksetzen)']
const KOMPAT = KOMPAT_PROGRAMME.flatMap(p => KOMPAT_MODI.map(m => `${p}: ${m}`))

/** Desktop des Benutzers (umgeleitet z. B. nach OneDrive), ohne die Umgebung des Admin-Kontos. */
const SW_DESK = String.raw`
function SwDesktop {
  $d = $null
  try { $x = Get-Item -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') -EA Stop; $d = [string]$x.GetValue('Desktop', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } catch {}
  if ($d) { $d = $d -replace '(?i)%USERPROFILE%', $uProf.Replace('$', '$$') }
  if (-not $d -or $d.StartsWith('\\') -or $d.Contains('%') -or -not (Test-Path -LiteralPath $d)) { $d = Join-Path $uProf 'Desktop' }
  if (-not (Test-Path -LiteralPath $d)) { $d = $uProf }
  $d
}
`

export const AKTIONEN_SAPCAD4: PaAktion[] = [
  // ══ SAP ═════════════════════════════════════════════════════════════════════
  A({ id: 'sapcad4-sap-benutzerdaten-zuruecksetzen', titel: 'SAP GUI: Eingabehistorie, Traces oder Darstellung des Benutzers zurücksetzen', modus: 'profil', risiko: 'aendern', timeoutMs: 120000,
    beschreibung: 'Beendet SAP Logon des Benutzers und setzt einen Teil seiner lokalen SAP-GUI-Daten zurück: „Eingabehistorie“ benennt die Verlaufsdatenbank um (alte/falsche Vorschläge, träge Eingabe in Feldern, Fehler der History-Datenbank); „Traces“ stellt eingeschaltete Trace-Stufen auf 0 und löscht die Trace-Dateien (SAP langsam, Platte voll); „Darstellung“ benennt die eigenen Theme-, Farb- und Schrifteinstellungen um (dunkles, kontrastreiches oder verstelltes Design). Zeigt vorher/nachher; Verbindungsliste und Sicherheitsregeln bleiben unberührt.',
    param: { label: 'Was zurücksetzen', platzhalter: 'Eingabehistorie', pflicht: true, optionen: SAP_TEILE },
    ps: String.raw`
NeedHive
$w = $P.Trim()
$erlaubt = @('Eingabehistorie', 'Traces abschalten und löschen', 'Darstellung (Theme, Farben, Schrift)')
if ($w -notin $erlaubt) { throw ('Unbekannte Auswahl „' + $w + '“ — erlaubt: ' + ($erlaubt -join ' | ')) }
$lief = (UserProcs @('saplogon', 'sapgui', 'saplgpad', 'NWBC')).Count
if ($lief) { StopUser @('saplogon', 'sapgui', 'saplgpad', 'NWBC') }
if ($w -eq 'Eingabehistorie') {
  $n = 0
  foreach ($d in @((Join-Path $uRoam 'SAP\SAP GUI\History'), (Join-Path $uLocal 'SAP\SAP GUI\History'))) {
    if (-not (Test-Path -LiteralPath $d)) { continue }
    $f = @(Get-ChildItem -LiteralPath $d -File -Force -EA SilentlyContinue)
    $gr = 0; foreach ($x in $f) { $gr += $x.Length }
    $zl = ''; if ($f.Count) { $zl = ' · zuletzt geändert ' + (@($f | Sort-Object LastWriteTime -Descending)[0].LastWriteTime.ToString('dd.MM.yyyy HH:mm')) }
    Zeile ('vorher: ' + $d + ' · ' + $f.Count + ' Datei(en), ' + (Groesse $gr) + $zl)
    if (RenameAlt $d 'Eingabehistorie') { $n++ }
  }
  if ($n) { Zeile 'jetzt: SAP legt beim nächsten Start eine leere Eingabehistorie an — die Vorschläge bauen sich mit der Arbeit neu auf.' }
  else { Zeile 'Keine lokale Eingabehistorie im Profil gefunden — nichts geändert (ist die Historie in SAP abgeschaltet? Optionen → Lokale Daten → Historie).' }
} elseif ($w -like 'Traces*') {
  $k0 = $uHive + '\Software\SAP'
  $nk = 0
  if (Test-Path -LiteralPath $k0) {
    foreach ($key in @(@(Get-Item -LiteralPath $k0 -EA SilentlyContinue) + @(Get-ChildItem -LiteralPath $k0 -Recurse -Depth 5 -EA SilentlyContinue))) {
      foreach ($n in @($key.GetValueNames())) {
        if ($n -notmatch '(?i)trace.?level') { continue }
        $v = $key.GetValue($n, $null); $iv = 0
        if (-not [int]::TryParse([string]$v, [ref]$iv) -or $iv -le 0) { continue }
        $art = [string]$key.GetValueKind($n)
        if ($art -eq 'DWord') { Set-ItemProperty -LiteralPath $key.PSPath -Name $n -Value 0 -Type DWord }
        elseif ($art -eq 'String') { Set-ItemProperty -LiteralPath $key.PSPath -Name $n -Value '0' }
        else { continue }
        $nk++
        Zeile ('Trace-Stufe ' + ($key.Name -replace '^HKEY_USERS\\[^\\]+\\', '') + ' › ' + $n + ': vorher ' + $iv + ' → jetzt 0')
      }
    }
  }
  if (-not $nk) { Zeile 'Trace-Stufen: keine eingeschaltete Trace-Stufe im Profil gefunden.' }
  $sum = 0; $cnt = 0
  foreach ($d in @((Join-Path $uRoam 'SAP\Common'), (Join-Path $uRoam 'SAP\SAP GUI\Traces'), (Join-Path $uLocal 'SAP\SAP GUI\Traces'), (Join-Path $uLocal 'SAP\NWBC\Traces'), (Join-Path $uRoam 'SAP\NWBC\Traces'))) {
    if (-not (Test-Path -LiteralPath $d)) { continue }
    foreach ($f in @(Get-ChildItem -LiteralPath $d -File -Recurse -Force -EA SilentlyContinue | Where-Object { $_.Name -match '(?i)(\.trc$|^dev_|^sapguitrace|trace.*\.(txt|log)$)' })) {
      $l = $f.Length
      try { Remove-Item -LiteralPath $f.FullName -Force -EA Stop; $sum += $l; $cnt++ } catch {}
    }
  }
  Zeile ('Trace-Dateien: ' + $cnt + ' gelöscht (' + (Groesse $sum) + ' frei).')
  Zeile 'Nur Protokolldateien wurden gelöscht — Verbindungsliste, Historie und Einstellungen bleiben.'
} else {
  $k0 = $uHive + '\Software\SAP'
  $treffer = @()
  foreach ($key in @(Get-ChildItem -LiteralPath $k0 -Recurse -Depth 5 -EA SilentlyContinue)) {
    foreach ($n in @($key.GetValueNames())) { if ($n -match '(?i)theme|font|contrast|colou?r') { $treffer += (($key.Name -replace '^HKEY_USERS\\[^\\]+\\Software\\SAP\\', '') + ' › ' + $n + ' = ' + [string]$key.GetValue($n, '')) } }
  }
  foreach ($t in @($treffer | Select-Object -First 12)) { Zeile ('vorher: ' + $t) }
  $k = $uHive + '\Software\SAP\General\Appearance'
  if (Test-Path -LiteralPath $k) {
    [void](RenameAlt $k 'Eigene SAP-Darstellung (Software\SAP\General\Appearance)')
    Zeile 'jetzt: SAP startet mit dem Standard-Design der Firma (Theme, Farben je System, Schriftgröße 100 %).'
  } else { Zeile 'Keine eigenen Darstellungseinstellungen (Software\SAP\General\Appearance) gefunden — nichts geändert. Das Design wählt der Anwender in SAP Logon → Optionen → Visuelles Design → Theme-Einstellungen.' }
}
if ($lief) { Zeile 'SAP Logon wurde dafür beendet — bitte wieder starten (Baustein „SAP Logon starten“).' }` }),

  // ══ Kompatibilität / DPI (SAP GUI, SolidWorks, eDrawings, FreeCAD) ══════════
  A({ id: 'sapcad4-kompatibilitaet', titel: 'Kompatibilität von SAP GUI, SolidWorks, eDrawings oder FreeCAD setzen (DPI-Skalierung, „Als Administrator“ aus)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Wie Rechtsklick auf das Programm → Eigenschaften → Kompatibilität (nur für den angemeldeten Benutzer): „Skalierung durch Anwendung“ gegen verschwommene Schrift und versetzte Klicks auf 4K-/Dock-Monitoren, „Skalierung durch System (erweitert)“ gegen winzige Symbole bzw. abgeschnittene Dialoge, „Standard“ entfernt alle Kompatibilitätsschalter des Benutzers für das Programm — auch „Als Administrator ausführen“ und alte Windows-Kompatibilitätsmodi (fehlende Netzlaufwerke, kein Drag & Drop). Zeigt vorher/nachher und meldet Vorgaben für alle Benutzer. Wirkt nach dem Neustart des Programms.',
    param: { label: 'Programm: Einstellung', platzhalter: 'SAP GUI: Skalierung durch Anwendung', pflicht: true, optionen: KOMPAT },
    ps: String.raw`
NeedHive
$m = [regex]::Match($P.Trim(), '^(SAP GUI|SolidWorks|eDrawings|FreeCAD):\s*(.+)$')
if (-not $m.Success) { throw 'Bitte im Format „Programm: Einstellung“ angeben, z. B. „SAP GUI: Skalierung durch Anwendung“.' }
$prog = $m.Groups[1].Value; $modus = $m.Groups[2].Value.Trim()
if ($modus -notin 'Skalierung durch Anwendung', 'Skalierung durch System (erweitert)', 'Standard (Kompatibilität zurücksetzen)') { throw ('Unbekannte Einstellung „' + $modus + '“.') }
$roots = @(@([Environment]::GetFolderPath('ProgramFiles'), [Environment]::GetFolderPath('ProgramFilesX86')) | Where-Object { $_ } | Select-Object -Unique)
$exe = @()
foreach ($r in $roots) {
  if ($prog -eq 'SAP GUI') {
    foreach ($n in 'saplogon.exe', 'sapgui.exe') { $p = Join-Path $r ('SAP\FrontEnd\SAPgui\' + $n); if (Test-Path -LiteralPath $p) { $exe += $p } }
    $sd = Join-Path $r 'SAP'; if (Test-Path -LiteralPath $sd) { $exe += @(Get-ChildItem -LiteralPath $sd -Recurse -Depth 2 -Filter 'NWBC.exe' -EA SilentlyContinue | ForEach-Object { $_.FullName }) }
  } elseif ($prog -eq 'SolidWorks') {
    $p = Join-Path $r 'SOLIDWORKS Corp\SOLIDWORKS\SLDWORKS.exe'; if (Test-Path -LiteralPath $p) { $exe += $p }
  } elseif ($prog -eq 'eDrawings') {
    foreach ($sd in @((Join-Path $r 'SOLIDWORKS Corp'), (Join-Path $r 'Common Files'), (Join-Path $r 'eDrawings'))) { if (Test-Path -LiteralPath $sd) { $exe += @(Get-ChildItem -LiteralPath $sd -Recurse -Depth 2 -Filter 'EModelViewer.exe' -EA SilentlyContinue | ForEach-Object { $_.FullName }) } }
  } else {
    foreach ($sd in @(Get-ChildItem -LiteralPath $r -Directory -Filter 'FreeCAD*' -EA SilentlyContinue)) { $p = Join-Path $sd.FullName 'bin\FreeCAD.exe'; if (Test-Path -LiteralPath $p) { $exe += $p } }
  }
}
if ($prog -eq 'FreeCAD') { foreach ($sd in @(Get-ChildItem -LiteralPath (Join-Path $uLocal 'Programs') -Directory -Filter 'FreeCAD*' -EA SilentlyContinue)) { $p = Join-Path $sd.FullName 'bin\FreeCAD.exe'; if (Test-Path -LiteralPath $p) { $exe += $p } } }
$exe = @($exe | Select-Object -Unique)
if (-not $exe.Count) { throw ($prog + ' ist auf diesem PC nicht installiert (Programmdatei nicht gefunden).') }
$k = $uHive + '\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers'
$hk = Get-Item -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers' -EA SilentlyContinue
foreach ($e in $exe) {
  $alt = ''
  $lk = Get-Item -LiteralPath $k -EA SilentlyContinue
  if ($lk) { $alt = [string]$lk.GetValue($e, '') }
  $tok = @(($alt -replace '^~\s*', '') -split '\s+' | Where-Object { $_ })
  if ($modus -like 'Standard*') { $neuTok = @() }
  else {
    $neuTok = @($tok | Where-Object { $_ -notin 'HIGHDPIAWARE', 'DPIUNAWARE', 'GDIDPISCALING' })
    if ($modus -eq 'Skalierung durch Anwendung') { $neuTok += 'HIGHDPIAWARE' } else { $neuTok += 'GDIDPISCALING'; $neuTok += 'DPIUNAWARE' }
  }
  $neu = ''; if ($neuTok.Count) { $neu = '~ ' + ($neuTok -join ' ') }
  $altText = $alt; if (-not $altText) { $altText = '(keine)' }
  $neuText = $neu; if (-not $neuText) { $neuText = '(keine)' }
  if ($neu -eq $alt) { Zeile ((Split-Path $e -Leaf) + ': unverändert „' + $altText + '“') }
  elseif ($neu) {
    if (-not (Test-Path -LiteralPath $k)) { New-Item -Path $k -Force | Out-Null }
    Set-ItemProperty -LiteralPath $k -Name $e -Value $neu -Type String
    Zeile ((Split-Path $e -Leaf) + ': vorher „' + $altText + '“ → jetzt „' + $neuText + '“')
  } else {
    Remove-ItemProperty -LiteralPath $k -Name $e -EA SilentlyContinue
    Zeile ((Split-Path $e -Leaf) + ': vorher „' + $altText + '“ → jetzt „(keine)“ — Programm startet ohne Kompatibilitätsschalter')
  }
  if ($alt -match 'RUNASADMIN') { Zeile '  Hinweis: Vorher war „Als Administrator ausführen“ gesetzt — so gestartet sieht das Programm keine Netzlaufwerke und nimmt kein Drag & Drop an.' }
  if ($hk) { $hv = [string]$hk.GetValue($e, ''); if ($hv) { Zeile ('  Für alle Benutzer (HKLM) zusätzlich gesetzt: „' + $hv + '“ — wird hier nicht geändert.') } }
}
$pn = @{ 'SAP GUI' = @('saplogon', 'sapgui', 'NWBC'); 'SolidWorks' = @('SLDWORKS'); 'eDrawings' = @('EModelViewer'); 'FreeCAD' = @('FreeCAD') }
if ((UserProcs $pn[$prog]).Count) { Zeile ($prog + ' läuft gerade — die Einstellung wirkt nach dem Neustart des Programms.') }` }),

  // ══ SolidWorks ══════════════════════════════════════════════════════════════
  A({ id: 'sapcad4-sw-addin-start', titel: 'SolidWorks-Zusatzanwendung beim Start ein- oder ausschalten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Wie Extras → Zusatzanwendungen → Spalte „Start“: Listet alle registrierten SolidWorks-Add-ins mit ihrem Startzustand und schaltet das gewählte für den angemeldeten Benutzer beim Start ein („an“, z. B. PDM, Toolbox, 3Dconnexion) oder aus („aus“, z. B. ein Add-in, das beim Start abstürzt, eine Lizenz verlangt oder bremst). „alle = aus“ schaltet alle beim Start geladenen Add-ins ab (Fehlersuche) und listet sie zum späteren Wiedereinschalten. SolidWorks muss geschlossen sein.',
    param: { label: 'Add-in (Teil des Namens) = an | aus', platzhalter: 'Toolbox = an', pflicht: true, vorlagen: ['SOLIDWORKS PDM = an', 'Toolbox = an', '3DEXPERIENCE = aus', 'Simulation = aus', 'Visualize = aus', 'alle = aus'] },
    ps: String.raw`
NeedHive
if ($P -notmatch '^\s*(.+?)\s*=\s*(an|aus)\s*$') { throw 'Bitte im Format „Teil des Add-in-Namens = an“ bzw. „= aus“ angeben, z. B. „Toolbox = an“ oder „alle = aus“.' }
$such = $matches[1].Trim().Trim('"'); $soll = $matches[2].ToLower()
if ($such.Length -lt 2) { throw 'Bitte mindestens 2 Zeichen des Add-in-Namens angeben.' }
if ((UserProcs @('SLDWORKS')).Count) { throw 'SolidWorks läuft noch — es überschreibt die Einstellung beim Beenden. Bitte zuerst speichern lassen und „SolidWorks beenden“.' }
$liste = @()
foreach ($basis in @('HKLM:\SOFTWARE\SolidWorks\AddIns', ($uHive + '\Software\SolidWorks\AddIns'))) {
  foreach ($a in @(Get-ChildItem -LiteralPath $basis -EA SilentlyContinue)) {
    $g = [string]$a.PSChildName
    if ($g -notmatch '^\{[0-9A-Fa-f-]{36}\}$') { continue }
    if (@($liste | Where-Object { $_.Guid -eq $g }).Count) { continue }
    $t = [string]$a.GetValue('Title', ''); if (-not $t) { $t = $g }
    $liste += [pscustomobject]@{ Guid = $g; Titel = $t; Standard = [string]$a.GetValue('', '') }
  }
}
if (-not $liste.Count) { throw 'Keine SolidWorks-Zusatzanwendungen registriert (SolidWorks nicht installiert?).' }
$sk = $uHive + '\Software\SolidWorks\AddInsStartup'
function AddinStart($x) {
  $s = Get-Item -LiteralPath ($sk + '\' + $x.Guid) -EA SilentlyContinue
  if ($s) { $v = $s.GetValue('', $null); if ($null -ne $v) { return ([string]$v -eq '1') } }
  return ($x.Standard -eq '1')
}
foreach ($x in @($liste | Sort-Object Titel)) { Zeile ('vorher: ' + $x.Titel + ' · beim Start ' + $(if (AddinStart $x) { 'an' } else { 'aus' })) }
if ($such -ieq 'alle') {
  if ($soll -eq 'an') { throw '„alle = an“ ist nicht vorgesehen — bitte Add-ins einzeln einschalten.' }
  $ziel = @($liste | Where-Object { AddinStart $_ })
  if (-not $ziel.Count) { Zeile 'Kein Add-in wird beim Start geladen — nichts geändert.' }
} else {
  $ziel = @($liste | Where-Object { $_.Titel -like ('*' + $such + '*') })
  if (-not $ziel.Count) { throw ('Kein Add-in mit „' + $such + '“ im Namen gefunden — siehe Liste oben.') }
  if ($ziel.Count -gt 4) { throw ('„' + $such + '“ trifft ' + $ziel.Count + ' Add-ins — bitte genauer angeben.') }
}
$wert = 0; if ($soll -eq 'an') { $wert = 1 }
foreach ($x in $ziel) {
  $k = $sk + '\' + $x.Guid
  $vor = AddinStart $x
  if (-not (Test-Path -LiteralPath $k)) { New-Item -Path $k -Force | Out-Null }
  Set-ItemProperty -LiteralPath $k -Name '(default)' -Value $wert -Type DWord
  Zeile ($x.Titel + ': beim Start vorher ' + $(if ($vor) { 'an' } else { 'aus' }) + ' → jetzt ' + $soll)
}
Zeile 'Wirkt beim nächsten Start von SolidWorks (dort: Extras → Zusatzanwendungen, Spalte „Start“).'` }),
  A({ id: 'sapcad4-sw-wiederherstellung-sichern', titel: 'SolidWorks: Wiederherstellungs- und Sicherungsdateien auf den Desktop kopieren', modus: 'profil', risiko: 'aendern', timeoutMs: 240000,
    beschreibung: 'Sucht die automatisch gesicherten SolidWorks-Dateien der letzten Tage — AutoRecover-Ordner (*.swar), Sicherungskopien („Backup of …“), swxauto-Dateien im Temp-Ordner und eigene, in den SolidWorks-Optionen eingetragene Sicherungsordner — und kopiert sie in einen neuen Ordner „SolidWorks-Wiederherstellung …“ auf dem Desktop des Benutzers (höchstens 3 GB, neueste zuerst). Die Originale bleiben unverändert.',
    param: { label: 'Wie viele Tage zurück', platzhalter: '7', vorlagen: ['1', '3', '7', '30'] },
    ps: SW_DESK + String.raw`
NeedHive
$tage = 7
if ($P.Trim()) { $tt = 0; if (-not [int]::TryParse($P.Trim(), [ref]$tt) -or $tt -lt 1 -or $tt -gt 90) { throw 'Bitte eine Zahl von 1 bis 90 (Tage) angeben.' }; $tage = $tt }
$seit = (Get-Date).AddDays(-$tage)
$ordner = @((Join-Path $uLocal 'TempSWAutoRecover'), (Join-Path $uLocal 'TempSWBackupDirectory'))
foreach ($vk in @(Get-ChildItem -LiteralPath ($uHive + '\Software\SolidWorks') -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^SOLIDWORKS \d{4}$' })) {
  foreach ($key in @(Get-ChildItem -LiteralPath $vk.PSPath -Recurse -Depth 2 -EA SilentlyContinue)) {
    foreach ($n in @($key.GetValueNames())) {
      if ($n -notmatch '(?i)auto.?recover|backup') { continue }
      $v = [string]$key.GetValue($n, '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      $v = $v -replace '(?i)%LOCALAPPDATA%', $uLocal.Replace('$', '$$') -replace '(?i)%APPDATA%', $uRoam.Replace('$', '$$') -replace '(?i)%USERPROFILE%', $uProf.Replace('$', '$$')
      if ($v -match '^[A-Za-z]:\\' -and (Test-Path -LiteralPath $v -PathType Container)) { $ordner += $v.TrimEnd('\') }
    }
  }
}
$kand = @()
foreach ($o in @($ordner | Select-Object -Unique)) {
  if (-not (Test-Path -LiteralPath $o)) { Zeile ('Ordner nicht vorhanden: ' + $o); continue }
  $f = @(Get-ChildItem -LiteralPath $o -File -Recurse -Force -EA SilentlyContinue | Where-Object { $_.LastWriteTime -ge $seit })
  Zeile ('Ordner ' + $o + ': ' + $f.Count + ' Datei(en) der letzten ' + $tage + ' Tage')
  $kand += $f
}
$kand += @(Get-ChildItem -LiteralPath (Join-Path $uLocal 'Temp') -File -Force -EA SilentlyContinue | Where-Object { $_.LastWriteTime -ge $seit -and $_.Name -match '(?i)^swxauto|\.swar$' })
$kand = @($kand | Sort-Object FullName -Unique)
if (-not $kand.Count) { Zeile ('Keine automatisch gesicherten SolidWorks-Dateien der letzten ' + $tage + ' Tage gefunden — nichts kopiert. AutoRecover/Sicherungskopien in SolidWorks prüfen: Optionen → Systemoptionen → Sicherung/Wiederherstellung.') }
else {
  $ziel = Join-Path (SwDesktop) ('SolidWorks-Wiederherstellung ' + (Get-Date -Format 'yyyy-MM-dd HH-mm'))
  if (-not (Test-Path -LiteralPath $ziel)) { New-Item -Path $ziel -ItemType Directory -Force | Out-Null }
  $ok = 0; $fehl = 0; $summe = 0
  foreach ($x in @($kand | Sort-Object LastWriteTime -Descending)) {
    if (($summe + $x.Length) -gt 3GB) { Zeile 'Grenze 3 GB erreicht — ältere Dateien wurden nicht mehr kopiert.'; break }
    $dz = Join-Path $ziel ($x.LastWriteTime.ToString('yyyyMMdd-HHmm') + ' ' + $x.Name)
    try { Copy-Item -LiteralPath $x.FullName -Destination $dz -Force -EA Stop; $ok++; $summe += $x.Length } catch { $fehl++ }
  }
  Zeile ('Vorher: ' + $kand.Count + ' Datei(en) nur in versteckten Ordnern · jetzt: ' + $ok + ' kopiert (' + (Groesse $summe) + ') nach ' + $ziel + $(if ($fehl) { ' · ' + $fehl + ' gerade in Benutzung, nicht kopiert' } else { '' }))
  Zeile 'Die Originale bleiben unverändert. *.swar-Dateien vor dem Öffnen in die ursprüngliche Endung (.SLDPRT/.SLDASM/.SLDDRW) umbenennen; Sicherungskopien öffnen und unter neuem Namen speichern.'
}` }),

  // ══ SOLIDWORKS PDM (nur lesend) ═════════════════════════════════════════════
  A({ id: 'sapcad4-pdm-pruefen', titel: 'SOLIDWORKS PDM prüfen (Client, Tresoransichten, lokaler Cache, Server-Ports, Kontextmenü)', modus: 'profil', risiko: 'lesen', timeoutMs: 180000,
    beschreibung: 'Zeigt den installierten PDM-Client mit Version, alle Tresoransichten (für alle Benutzer bzw. nur diesen Benutzer) mit Ordner, Größe des lokalen Caches und den beschreibbaren Dateien (ausgecheckt oder nur lokal, nie eingecheckt), ob Archivserver (Port 3030) und Datenbankserver (1433) erreichbar sind, laufende PDM-Prozesse, ob das klassische Windows-11-Kontextmenü aktiv ist (PDM-Befehle) und ob PDM-Symbolüberlagerungen unter den ersten 15 sind. Ändert nichts.',
    ps: String.raw`
$cl = @(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { [string]$_.DisplayName -match '(?i)SOLIDWORKS PDM|PDMWorks|Conisio' } | Sort-Object DisplayName -Unique)
if (-not $cl.Count) { Zeile 'SOLIDWORKS PDM ist auf diesem PC nicht installiert.' }
foreach ($x in $cl) { Zeile ('Installiert: ' + $x.DisplayName + ' ' + $x.DisplayVersion) }
$basen = @(@{ K = 'HKLM:\SOFTWARE\SolidWorks\Applications\PDMWorks Enterprise\Databases'; Q = 'alle Benutzer' })
if ($uHive) { $basen += @{ K = ($uHive + '\Software\SolidWorks\Applications\PDMWorks Enterprise\Databases'); Q = 'nur dieser Benutzer' } }
$anz = 0
foreach ($b in $basen) {
  foreach ($t in @(Get-ChildItem -LiteralPath $b.K -EA SilentlyContinue)) {
    $anz++
    $loc = [string]$t.GetValue('Location', '')
    Zeile ('■ Tresor „' + $t.PSChildName + '“ (' + $b.Q + ') · Ansichtsordner: ' + $(if ($loc) { $loc } else { '(nicht eingetragen)' }))
    $werte = @(); $srv = @()
    foreach ($n in @($t.GetValueNames())) {
      if (-not $n -or $n -match '(?i)pass|pwd|secret') { continue }
      $v = [string]$t.GetValue($n, '')
      if ($v.Length -le 100) { $werte += ($n + '=' + $v) }
      if ($n -match '(?i)server' -and $v -match '^[A-Za-z0-9][A-Za-z0-9._-]{1,62}$') { $srv += $v }
    }
    if ($werte.Count) { Zeile ('  Einträge: ' + ((@($werte) | Select-Object -First 8) -join ' · ')) }
    foreach ($s in @($srv | Select-Object -Unique)) {
      foreach ($port in 3030, 1433) {
        $okp = $false
        try { $c = New-Object System.Net.Sockets.TcpClient; $ar = $c.BeginConnect($s, $port, $null, $null); $okp = ($ar.AsyncWaitHandle.WaitOne(2500) -and $c.Connected); $c.Close() } catch {}
        Zeile ('  ' + $s + ':' + $port + ' → ' + $(if ($okp) { 'erreichbar' } else { 'NICHT erreichbar' }))
      }
    }
    if ($loc -and (Test-Path -LiteralPath $loc)) {
      $f = @(Get-ChildItem -LiteralPath $loc -File -Recurse -Force -EA SilentlyContinue | Where-Object { -not ($_.Attributes -band [IO.FileAttributes]::Hidden) })
      $gr = 0; $rw = @(); foreach ($x in $f) { $gr += $x.Length; if (-not $x.IsReadOnly) { $rw += $x } }
      Zeile ('  Lokaler Cache: ' + $f.Count + ' Dateien, ' + (Groesse $gr) + ' · beschreibbar (ausgecheckt oder nur lokal, nicht eingecheckt): ' + $rw.Count)
      foreach ($x in @($rw | Sort-Object LastWriteTime -Descending | Select-Object -First 8)) { Zeile ('  beschreibbar: ' + $x.FullName.Substring($loc.TrimEnd('\').Length).TrimStart('\') + ' · ' + $x.LastWriteTime.ToString('dd.MM.yyyy HH:mm')) }
      try { $dl = New-Object System.IO.DriveInfo($loc.Substring(0, 1)); Zeile ('  Freier Platz auf ' + $dl.Name + ' ' + (Groesse $dl.AvailableFreeSpace)) } catch {}
    } elseif ($loc) { Zeile '  Ansichtsordner fehlt auf diesem PC — Tresoransicht muss neu eingerichtet werden.' }
  }
}
if (-not $anz) { Zeile 'Keine PDM-Tresoransicht auf diesem PC eingerichtet.' }
if ($uProf) {
  $pp = @(); try { $pp = @(UserProcs @('EdmServer', 'ConisioAdmin', 'ViewSetup', 'SLDWORKS')) } catch {}
  Zeile ('Laufende PDM-/SolidWorks-Prozesse des Benutzers: ' + $(if ($pp.Count) { (@($pp | ForEach-Object { $_.ProcessName }) | Select-Object -Unique) -join ', ' } else { 'keine' }))
}
if ($uHive) { Zeile ('Klassisches Kontextmenü (Windows 11, PDM-Befehle direkt sichtbar): ' + (Ja (Test-Path -LiteralPath ($uHive + '\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32')))) }
$ov = @(Get-ChildItem -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\ShellIconOverlayIdentifiers' -EA SilentlyContinue | ForEach-Object { $_.PSChildName } | Sort-Object)
$pdmOv = @(); for ($i = 0; $i -lt $ov.Count; $i++) { if ($ov[$i] -match '(?i)pdm|conisio|edm|solidworks') { $pdmOv += ('' + ($i + 1) + '. ' + $ov[$i].Trim()) } }
Zeile ('Symbolüberlagerungen: ' + $ov.Count + ' registriert (Windows zeigt nur die ersten 15)' + $(if ($pdmOv.Count) { ' · PDM: ' + ($pdmOv -join ', ') } else { '' }))` }),

  // ══ 3D-Maus ═════════════════════════════════════════════════════════════════
  A({ id: 'sapcad4-3dmaus-neustart', titel: '3Dconnexion-Treiber (3DxWare) in der Sitzung des Benutzers neu starten', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Beendet die hängenden 3Dconnexion-Prozesse (3DxService, 3DxSmartUi, Radialmenü …) in der Sitzung des Benutzers und startet den Treiber neu — gegen eine SpaceMouse, die nach Standby, Dock- oder Empfängerwechsel nicht mehr reagiert, Tasten ohne Funktion oder ein fehlendes Radialmenü. Das CAD-Programm danach neu starten. Findet sich kein Treiber, wird nichts geändert.',
    ps: String.raw`
$sid = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
$p = @(Get-Process -EA SilentlyContinue | Where-Object { $_.SessionId -eq $sid -and $_.ProcessName -match '^(3Dx|3dxsrv)' })
Zeile ('vorher: ' + $(if ($p.Count) { (@($p | ForEach-Object { $_.ProcessName }) | Select-Object -Unique) -join ', ' } else { 'kein 3Dconnexion-Prozess läuft in dieser Sitzung' }))
$pfad = $null
foreach ($x in $p) { try { if (-not $pfad -and $x.ProcessName -match '^(3DxService|3dxsrv)$' -and $x.Path) { $pfad = [string]$x.Path } } catch {} }
if (-not $pfad) {
  foreach ($r in @(@([Environment]::GetFolderPath('ProgramFiles'), [Environment]::GetFolderPath('ProgramFilesX86')) | Where-Object { $_ })) {
    $d = Join-Path $r '3Dconnexion'
    if (-not $pfad -and (Test-Path -LiteralPath $d)) { $t = @(Get-ChildItem -LiteralPath $d -Recurse -Depth 4 -Include '3DxService.exe', '3dxsrv.exe' -EA SilentlyContinue | Select-Object -First 1); if ($t.Count) { $pfad = $t[0].FullName } }
  }
}
$svc = @(Get-Service -EA SilentlyContinue | Where-Object { $_.Name -match '(?i)3dx|3dconnexion' })
foreach ($s in $svc) { Zeile ('Windows-Dienst ' + $s.DisplayName + ': ' + $s.Status) }
if (-not $pfad) { throw 'Kein 3Dconnexion-Treiber (3DxWare, 3DxService.exe) gefunden — Treiber über die Software-Installationen bzw. die IT installieren lassen.' }
foreach ($x in $p) { try { Stop-Process -Id $x.Id -Force -EA Stop } catch { Zeile ('Nicht beendet: ' + $x.ProcessName + ' (' + $_.Exception.Message + ')') } }
Start-Sleep -Seconds 2
Start-Process -FilePath $pfad
Start-Sleep -Seconds 6
$n = @(Get-Process -EA SilentlyContinue | Where-Object { $_.SessionId -eq $sid -and $_.ProcessName -match '^(3Dx|3dxsrv)' })
Zeile ('jetzt: ' + $(if ($n.Count) { ((@($n | ForEach-Object { $_.ProcessName }) | Select-Object -Unique) -join ', ') + ' laufen wieder' } else { 'Treiber gestartet, noch kein Prozess sichtbar — in einigen Sekunden erneut prüfen' }))
Zeile 'Bitte SolidWorks bzw. das CAD-Programm neu starten, damit es sich wieder mit dem Treiber verbindet.'` }),
]
