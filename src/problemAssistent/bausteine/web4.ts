// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „web“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Browser-Einstellungen werden nur in den Dateien des angemeldeten Benutzers geändert (Preferences/Local State
// von Edge/Chrome, user.js von Firefox, Zonen in seinem Registry-Zweig) — jeweils mit Sicherung *.alt_… daneben.
// Firmenrichtlinien (Policies) werden nur gelesen und gemeldet, nie geschrieben.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Lesen von Preferences/Local State (Edge/Chrome) — ändert nichts. */
const WEB_JSON = String.raw`
Add-Type -AssemblyName System.Web.Extensions
$js = New-Object System.Web.Script.Serialization.JavaScriptSerializer; $js.MaxJsonLength = 104857600; $js.RecursionLimit = 256
function JLies([string]$f) { if (-not (Test-Path -LiteralPath $f)) { return $null }; try { $o = $js.DeserializeObject([IO.File]::ReadAllText($f, [Text.Encoding]::UTF8)); if ($o -is [System.Collections.IDictionary]) { return $o } } catch {}; return $null }
function JHol($o, [string]$pfad) { $k = $o; foreach ($t in $pfad.Split('.')) { if ($k -is [System.Collections.IDictionary] -and $k.ContainsKey($t)) { $k = $k[$t] } else { return '(Standard)' } }; if ($null -eq $k) { return '(leer)' }; if ($k -is [System.Collections.IDictionary] -or $k -is [array]) { return $js.Serialize($k) }; return [string]$k }
function WebProfile([string]$ud) { @(Get-ChildItem -LiteralPath $ud -Directory -EA SilentlyContinue | Where-Object { ($_.Name -eq 'Default' -or $_.Name -like 'Profile *') -and $_.Name -notlike '*.alt_*' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'Preferences')) }) }
function MusterHost([string]$m) { ((($m.Trim().ToLower() -replace '^[a-z-]+://', '') -replace '^\[\*\.\]', '') -replace '[:/].*$', '') }
function MusterPasst([string]$key, [string]$h) { foreach ($teil in $key.Split(',')) { if ((MusterHost $teil) -eq $h) { return $true } }; return $false }
function Stufe($v) { switch ([string]$v) { '1' { 'erlaubt' } '2' { 'blockiert' } '3' { 'fragen' } default { [string]$v } } }
`

/** Schreiben in Preferences/Local State — nur in Bausteinen, die etwas ändern. Sicherung *.alt_… vor jedem Schreiben. */
const WEB_JSON_SCHREIBEN = String.raw`
function JKnoten($o, [string]$pfad) { $k = $o; foreach ($t in $pfad.Split('.')) { if (-not ($k[$t] -is [System.Collections.IDictionary])) { $k[$t] = [System.Collections.Generic.Dictionary[string,object]]::new() }; $k = $k[$t] }; return $k }
function JSetz($o, [string]$pfad, $wert) { $t = $pfad.Split('.'); $k = $o; for ($i = 0; $i -lt $t.Count - 1; $i++) { if (-not ($k[$t[$i]] -is [System.Collections.IDictionary])) { $k[$t[$i]] = [System.Collections.Generic.Dictionary[string,object]]::new() }; $k = $k[$t[$i]] }; $k[$t[$t.Count - 1]] = $wert }
function JWeg($o, [string]$pfad) { $t = $pfad.Split('.'); $k = $o; for ($i = 0; $i -lt $t.Count - 1; $i++) { if ($k -is [System.Collections.IDictionary] -and $k.ContainsKey($t[$i])) { $k = $k[$t[$i]] } else { return $false } }; if ($k -is [System.Collections.IDictionary] -and $k.ContainsKey($t[$t.Count - 1])) { [void]$k.Remove($t[$t.Count - 1]); return $true }; return $false }
function JSpeichern([string]$f, $o) { Copy-Item -LiteralPath $f -Destination ($f + '.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss')) -Force -EA Stop; [IO.File]::WriteAllText($f, $js.Serialize($o), (New-Object System.Text.UTF8Encoding($false))) }
`

/** Browser-Richtlinien (Edge/Chrome/Firefox) aus HKLM und dem Zweig des Benutzers lesen — ändert nichts.
 *  $muster = Regex auf den Richtliniennamen, $wert = Text, der im Wert oder Namen vorkommen muss. */
const WEB_POLITIK = String.raw`
function WebRichtlinien([string]$muster, [string]$wert, [string[]]$browser) {
  $erg = New-Object System.Collections.Generic.List[string]
  $wurz = @(,@('Computer', 'HKLM:\SOFTWARE\Policies'))
  if ($uHive) { $wurz += ,@('Benutzer', ($uHive + '\Software\Policies')) }
  foreach ($w in $wurz) {
    foreach ($b in @(@('Edge', 'Microsoft\Edge'), @('Chrome', 'Google\Chrome'), @('Firefox', 'Mozilla\Firefox'))) {
      if ($browser -and ($browser -notcontains $b[0])) { continue }
      $k = $w[1] + '\' + $b[1]
      if (-not (Test-Path -LiteralPath $k)) { continue }
      $schl = @(Get-Item -LiteralPath $k -EA SilentlyContinue) + @(Get-ChildItem -LiteralPath $k -Recurse -EA SilentlyContinue)
      foreach ($s in $schl) {
        $ix = $s.Name.IndexOf($b[1], [StringComparison]::OrdinalIgnoreCase)
        $rel = $(if ($ix -ge 0) { $s.Name.Substring($ix + $b[1].Length).TrimStart('\') } else { '' })
        foreach ($n in @($s.Property)) {
          $v = [string]$s.GetValue($n)
          $name = $(if ($rel) { $rel + '\' + $n } else { [string]$n })
          if ($muster -and ($name -notmatch $muster)) { continue }
          if ($wert -and ($v -notlike ('*' + $wert + '*')) -and ($name -notlike ('*' + $wert + '*'))) { continue }
          $erg.Add($b[0] + ' (' + $w[0] + '): ' + $name + ' = ' + $(if ($v.Length -gt 160) { $v.Substring(0, 160) + ' …' } else { $v }))
        }
      }
    }
  }
  $erg.ToArray()
}
`

/** Sicherheitszonen (Internetoptionen) für einen Host lesen — Benutzer-Einträge und Zonenliste per Richtlinie. Ändert nichts. */
const WEB_ZONEN = String.raw`
function ZoneName($z) { switch ([string]$z) { '0' { 'Arbeitsplatz' } '1' { 'Lokales Intranet' } '2' { 'Vertrauenswürdige Sites' } '3' { 'Internet' } '4' { 'Eingeschränkte Sites' } default { [string]$z } } }
function ZonenSchluessel([string]$h) {
  $t = $h.Split('.')
  if ($t.Count -eq 1) { return $h }
  $dom = $t[$t.Count - 2] + '.' + $t[$t.Count - 1]
  $kand = @($dom)
  if ($t.Count -gt 2) {
    $pre = ($t[0..($t.Count - 3)] -join '.'); $kand += ($dom + '\' + $pre)
    $pt = $pre.Split('.'); for ($i = 1; $i -lt $pt.Count; $i++) { $kand += ($dom + '\*.' + ($pt[$i..($pt.Count - 1)] -join '.')) }
    $kand += ($dom + '\*')
  }
  $kand
}
function ZonenBenutzer([string]$h) {
  $erg = @()
  if (-not $uHive) { return }
  $zb = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Internet Settings\ZoneMap\Domains'
  foreach ($k in (ZonenSchluessel $h)) { $zp = $zb + '\' + $k; if (Test-Path -LiteralPath $zp) { $it = Get-Item -LiteralPath $zp; foreach ($n in @($it.Property)) { $erg += ($k + ' [' + $n + '] = ' + (ZoneName $it.GetValue($n))) } } }
  $erg
}
function ZonenRichtlinie([string]$h) {
  $erg = @()
  $orte = @(,@('Computer', 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CurrentVersion\Internet Settings'))
  if ($uHive) { $orte += ,@('Benutzer', ($uHive + '\Software\Policies\Microsoft\Windows\CurrentVersion\Internet Settings')) }
  foreach ($w in $orte) {
    $zk = $w[1] + '\ZoneMapKey'
    if (Test-Path -LiteralPath $zk) {
      $it = Get-Item -LiteralPath $zk; $alle = @($it.Property); $tr = @()
      foreach ($n in $alle) {
        $x = (([string]$n).ToLower() -replace '^[a-z]+://', '') -replace '[:/].*$', ''
        if (($x -eq $h) -or ($x.StartsWith('*.') -and $h.EndsWith($x.Substring(1))) -or ($x -eq ('*.' + $h))) { $tr += ([string]$n + ' = ' + (ZoneName $it.GetValue($n))) }
      }
      $erg += ('Zonenliste per Richtlinie (' + $w[0] + '): ' + $alle.Count + ' Einträge · ' + $(if ($tr.Count) { 'für diese Adresse: ' + ($tr -join ', ') } else { 'diese Adresse ist nicht enthalten' }))
    }
    $ip = Get-ItemProperty -LiteralPath $w[1] -EA SilentlyContinue
    if ($ip -and [string]$ip.Security_HKLM_only -eq '1') { $erg += ('Richtlinie Security_HKLM_only (' + $w[0] + '): Es gelten nur die Zonen des Computers — Einträge des Benutzers werden ignoriert.') }
  }
  $erg
}
`

/** Edge/Chrome des Benutzers: vorhandene Browser ermitteln und beenden (für Bausteine, die Preferences/Local State schreiben). */
const WEB_BEENDEN = String.raw`
$bro = @()
foreach ($b in @(@('Edge', 'Microsoft\Edge\User Data', 'msedge'), @('Chrome', 'Google\Chrome\User Data', 'chrome'))) { if (Test-Path -LiteralPath (Join-Path (Join-Path $uLocal $b[1]) 'Local State')) { $bro += ,$b } }
if (-not $bro.Count) { throw 'Weder Edge noch Chrome sind für diesen Benutzer eingerichtet — nichts geändert.' }
$procs = @($bro | ForEach-Object { [string]$_[2] })
StopUser $procs
if (@(UserProcs $procs).Count) { throw 'Der Browser lässt sich nicht beenden — nichts geändert.' }
`

export const AKTIONEN_WEB4: PaAktion[] = [
  // ══ Lesen: Zustand, Einstellungen, Richtlinien, Zonen ═══════════════════════
  A({ id: 'web-browser-zustand', titel: 'Browser-Zustand, Einstellungen und Firmenrichtlinien anzeigen (Edge/Chrome/Firefox)', modus: 'profil', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Versionen von Edge, Chrome, Firefox und WebView2, Standardbrowser und PDF-Zuordnung, laufende Browser mit Speicherverbrauch, wichtige Einstellungen je Profil (Download-Nachfrage und -Ordner, PDF, Übersetzen, Benachrichtigungen, Sprachen, Hardwarebeschleunigung, sicheres DNS, Experimente) und die Firmenrichtlinien. Mit Adresse: Seitenberechtigungen, Zoom und Sicherheitszone genau dieser Seite; mit Stichwort: nur passende Richtlinien. Ändert nichts.',
    param: { label: 'Adresse oder Richtlinien-Stichwort (optional)', platzhalter: 'z. B. skfprod.service-now.com oder Popup', vorlagen: ['skfprod.service-now.com', 'intranet.skf.net', 'InternetExplorer', 'Download', 'Popup', 'Sync', 'Copilot|Sidebar'] },
    ps: WEB_JSON + WEB_POLITIK + WEB_ZONEN + String.raw`
NeedUser
$roh = $P.Trim()
$adr = ''; $wort = ''
if ($roh) {
  if ($roh -notmatch '^[A-Za-z0-9:/.\-_*|]{1,200}$') { throw ('Ungültige Eingabe „' + $roh + '“ — erlaubt: eine Adresse (z. B. skfprod.service-now.com) oder Stichwörter, mit | getrennt (z. B. Popup, Download, Copilot|Sidebar).') }
  if ($roh -match '[./:]') { $adr = (MusterHost ($roh -replace '[?#].*$', '')) -replace '^\*\.', '' } else { $wort = $roh }
}
function DateiVersion([string[]]$pfade) { foreach ($dv in $pfade) { if ($dv -and (Test-Path -LiteralPath $dv)) { return [string](Get-Item -LiteralPath $dv).VersionInfo.ProductVersion } }; return 'nicht installiert' }
$ev = DateiVersion @('C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Microsoft\Edge\Application\msedge.exe')
$cv = DateiVersion @('C:\Program Files\Google\Chrome\Application\chrome.exe', 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe', (Join-Path $uLocal 'Google\Chrome\Application\chrome.exe'))
$fv = DateiVersion @('C:\Program Files\Mozilla Firefox\firefox.exe', 'C:\Program Files (x86)\Mozilla Firefox\firefox.exe', (Join-Path $uLocal 'Mozilla Firefox\firefox.exe'))
$wv = [string](Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -EA SilentlyContinue).pv
Zeile ('Versionen: Edge ' + $ev + ' · Chrome ' + $cv + ' · Firefox ' + $fv + ' · WebView2 ' + $(if ($wv) { $wv } else { 'nicht gefunden' }))
if ($uHive) {
  $hs = [string](Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice') -EA SilentlyContinue).ProgId
  $pd = [string](Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice') -EA SilentlyContinue).ProgId
  Zeile ('Standardbrowser (https): ' + $(if ($hs) { $hs } else { 'nicht festgelegt' }) + ' · .pdf öffnet mit: ' + $(if ($pd) { $pd } else { 'nicht festgelegt' }) + '  (MSEdgeHTM = Edge, ChromeHTML = Chrome, FirefoxURL = Firefox, MSEdgePDF = Edge, AcroExch = Acrobat)')
}
foreach ($n in 'msedge', 'chrome', 'firefox') {
  try { $px = @(UserProcs @($n)); if ($px.Count) { $ws = [double]0; foreach ($x in $px) { $ws = $ws + [double]$x.WorkingSet64 }; Zeile ('Läuft: ' + $n + ' · ' + $px.Count + ' Prozesse · ' + (Groesse $ws) + ' Arbeitsspeicher') } } catch { Zeile ('Prozesse von ' + $n + ' nicht lesbar: ' + $_.Exception.Message) }
}
foreach ($b in @(@('Edge', 'Microsoft\Edge\User Data'), @('Chrome', 'Google\Chrome\User Data'))) {
  $ud = Join-Path $uLocal $b[1]
  if (-not (Test-Path -LiteralPath $ud)) { Zeile ($b[0] + ': für diesen Benutzer nicht eingerichtet'); continue }
  $ls = JLies (Join-Path $ud 'Local State')
  if ($ls) { Zeile ($b[0] + ' allgemein: Hardwarebeschleunigung ' + (JHol $ls 'hardware_acceleration_mode.enabled') + ' · sicheres DNS ' + (JHol $ls 'dns_over_https.mode') + ' · im Hintergrund weiterlaufen ' + (JHol $ls 'background_mode.enabled') + ' · Experimente (flags) ' + (JHol $ls 'browser.enabled_labs_experiments')) }
  foreach ($pr in (WebProfile $ud)) {
    $o = JLies (Join-Path $pr.FullName 'Preferences')
    if (-not $o) { Zeile ('  ' + $pr.Name + ': Einstellungsdatei nicht lesbar (beschädigt?)'); continue }
    Zeile ('  ' + $pr.Name + ': Download nachfragen ' + (JHol $o 'download.prompt_for_download') + ' · Download-Ordner ' + (JHol $o 'download.default_directory') + ' · PDF immer herunterladen ' + (JHol $o 'plugins.always_open_pdf_externally') + ' · Übersetzen anbieten ' + (JHol $o 'translate.enabled') + ' · Benachrichtigungen ' + (Stufe (JHol $o 'profile.default_content_setting_values.notifications')) + ' · Sprachen ' + (JHol $o 'intl.selected_languages'))
    $ex = $null
    if ($o['profile'] -is [System.Collections.IDictionary] -and $o['profile']['content_settings'] -is [System.Collections.IDictionary]) { $ex = $o['profile']['content_settings']['exceptions'] }
    if (-not ($ex -is [System.Collections.IDictionary])) { continue }
    if ($adr) {
      $tr = @()
      foreach ($typ in @($ex.Keys)) { $d = $ex[$typ]; if (-not ($d -is [System.Collections.IDictionary])) { continue }; foreach ($m in @($d.Keys)) { if (MusterPasst ([string]$m) $adr) { $sv = $null; if ($d[$m] -is [System.Collections.IDictionary]) { $sv = $d[$m]['setting'] }; if ($null -eq $sv -or $sv -is [System.Collections.IDictionary]) { continue }; $tr += ([string]$typ + ' ' + (Stufe $sv)) } } }
      Zeile ('    Seitenberechtigungen für ' + $adr + ': ' + $(if ($tr.Count) { (@($tr | Select-Object -First 30)) -join ', ' } else { 'keine eigenen Einstellungen' }))
      $zl = $null; if ($o['partition'] -is [System.Collections.IDictionary]) { $zl = $o['partition']['per_host_zoom_levels'] }
      if ($zl -is [System.Collections.IDictionary]) { foreach ($pk in @($zl.Keys)) { $zd = $zl[$pk]; if ($zd -is [System.Collections.IDictionary] -and $zd.ContainsKey($adr) -and $zd[$adr] -is [System.Collections.IDictionary]) { Zeile ('    Zoom für ' + $adr + ': ' + [math]::Round(100 * [math]::Pow([double]1.2, [double]$zd[$adr]['zoom_level'])) + ' %') } } }
    } else {
      $bl = @()
      foreach ($typ in 'popups', 'notifications', 'media_stream_camera', 'media_stream_mic', 'automatic_downloads', 'clipboard', 'cookies', 'sound', 'local_network_access') { $d = $ex[$typ]; if ($d -is [System.Collections.IDictionary]) { $nb = 0; foreach ($m in @($d.Keys)) { if ($d[$m] -is [System.Collections.IDictionary] -and [string]$d[$m]['setting'] -eq '2') { $nb++ } }; if ($nb) { $bl += ($typ + ' ' + $nb) } } }
      if ($bl.Count) { Zeile ('    Für einzelne Seiten blockiert: ' + ($bl -join ', ') + ' (Adresse angeben für Details)') }
    }
  }
}
$ffd = Join-Path $uRoam 'Mozilla\Firefox\Profiles'
foreach ($fp in @(Get-ChildItem -LiteralPath $ffd -Directory -EA SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'prefs.js') })) {
  $t = [IO.File]::ReadAllText((Join-Path $fp.FullName 'prefs.js'))
  $w = @(); foreach ($n in 'network.proxy.type', 'network.trr.mode', 'security.enterprise_roots.enabled', 'network.http.windows-sso.enabled', 'layers.acceleration.disabled') { $m = [regex]::Match($t, 'user_pref\("' + [regex]::Escape($n) + '",\s*(.*?)\);'); $w += ($n + ' ' + $(if ($m.Success) { $m.Groups[1].Value } else { 'Standard' })) }
  Zeile ('Firefox ' + $fp.Name + ': ' + ($w -join ' · ') + ' · user.js ' + (Ja (Test-Path -LiteralPath (Join-Path $fp.FullName 'user.js'))))
}
if ($adr -and $adr -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
  $zb = @(ZonenBenutzer $adr)
  Zeile ('Sicherheitszone (Benutzer) für ' + $adr + ': ' + $(if ($zb.Count) { $zb -join ' · ' } else { 'kein eigener Eintrag (Name ohne Punkt = Intranet, mit Punkt = Internetzone → keine automatische Windows-Anmeldung)' }))
  foreach ($z in @(ZonenRichtlinie $adr)) { Zeile $z }
}
$muster = ''; if ($wort) { $muster = (@($wort.Split('|') | Where-Object { $_ } | ForEach-Object { [regex]::Escape([string]$_) }) -join '|') }
$pl = @(WebRichtlinien $muster $adr @())
if (-not $pl.Count) { Zeile $(if ($roh) { 'Keine passenden Browser-Richtlinien.' } else { 'Keine Browser-Richtlinien gesetzt.' }) }
else {
  Zeile ('Firmenrichtlinien' + $(if ($roh) { ' zu „' + $roh + '“' } else { '' }) + ': ' + $pl.Count + ' (haben Vorrang vor den Einstellungen des Benutzers)')
  foreach ($z in @($pl | Select-Object -First 60)) { Zeile ('  ' + $z) }
  if ($pl.Count -gt 60) { Zeile ('  … ' + ($pl.Count - 60) + ' weitere — mit Stichwort eingrenzen (z. B. Popup, Download, InternetExplorer, Sync).') }
}` }),

  // ══ Ändern: Seitenberechtigung, Browser-Einstellung, Firefox, Intranetzone ══
  A({ id: 'web-seitenberechtigung', titel: 'Berechtigung einer Webseite in Edge/Chrome setzen oder zurücksetzen (Pop-ups, Cookies, Kamera …)', modus: 'profil', risiko: 'aendern', timeoutMs: 90000,
    beschreibung: 'Wie Schloss-Symbol → „Berechtigungen für diese Website“: Beendet Edge und Chrome des Benutzers und setzt für genau eine Adresse in allen Profilen Pop-ups, Benachrichtigungen, Kamera/Mikrofon, mehrere Downloads, Zwischenablage, Standort, Ton oder Cookies (auch Drittanbieter-Cookies beim Besuch der Seite) — oder nimmt alle eigenen Einstellungen bzw. die Zoomstufe der Seite zurück. Zeigt vorher/nachher, meldet Firmenrichtlinien mit Vorrang; die Einstellungsdatei wird vorher gesichert.',
    param: { label: 'Adresse | Berechtigung', platzhalter: 'skfprod.service-now.com | Pop-ups erlauben', pflicht: true,
      vorlagen: ['skfprod.service-now.com | Pop-ups erlauben', 'https://intranet.skf.net | Zwischenablage erlauben', 'portal.lieferant.de | Cookies erlauben', 'teams.microsoft.com | Kamera und Mikrofon erlauben', 'outlook.office.com | Benachrichtigungen erlauben', 'beispiel.de | Benachrichtigungen blockieren', 'beispiel.de | Mehrere Downloads erlauben', 'beispiel.de | Ton erlauben', 'beispiel.de | Standort erlauben', 'beispiel.de | Zoom zurücksetzen', 'beispiel.de | Alles zurücksetzen'] },
    ps: WEB_JSON + WEB_JSON_SCHREIBEN + WEB_POLITIK + String.raw`
NeedUser
$teile = @($P -split '\|')
if ($teile.Count -ne 2) { throw 'Bitte „Adresse | Berechtigung“ angeben, z. B. „skfprod.service-now.com | Pop-ups erlauben“.' }
$arten = @('Pop-ups erlauben', 'Benachrichtigungen erlauben', 'Benachrichtigungen blockieren', 'Kamera und Mikrofon erlauben', 'Mehrere Downloads erlauben', 'Zwischenablage erlauben', 'Standort erlauben', 'Ton erlauben', 'Cookies erlauben', 'Zoom zurücksetzen', 'Alles zurücksetzen')
$was = [string](@($arten | Where-Object { $_ -ieq $teile[1].Trim() }) | Select-Object -First 1)
if (-not $was) { throw ('Unbekannte Berechtigung „' + $teile[1].Trim() + '“ — erlaubt: ' + ($arten -join ' | ')) }
$roh = $teile[0].Trim().ToLower()
$sm = [regex]::Match($roh, '^([a-z][a-z0-9+.-]*)://')
$schema = 'https'; if ($sm.Success) { $schema = $sm.Groups[1].Value }
if ($schema -notin 'http', 'https') { throw ('Nur http:// oder https:// — nicht erlaubt: ' + $roh) }
$h = ($roh -replace '^[a-z][a-z0-9+.-]*://', '') -replace '[/?#].*$', ''
$port = $(if ($schema -eq 'https') { '443' } else { '80' })
$pm = [regex]::Match($h, ':(\d{1,5})$'); if ($pm.Success) { $port = $pm.Groups[1].Value; $h = $h.Substring(0, $pm.Index) }
$h = $h.Trim('.')
if ($h -notmatch '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$' -or [int]$port -lt 1 -or [int]$port -gt 65535) { throw ('Ungültige Adresse: ' + $teile[0].Trim() + ' (z. B. skfprod.service-now.com oder https://intranet.skf.net)') }
$herkunft = $schema + '://' + $h + ':' + $port
$ip = $h -match '^\d{1,3}(\.\d{1,3}){3}$'
$setz = @()
switch ($was) {
  'Pop-ups erlauben' { $setz += ,@('popups', ($herkunft + ',*'), 1) }
  'Benachrichtigungen erlauben' { $setz += ,@('notifications', ($herkunft + ',*'), 1) }
  'Benachrichtigungen blockieren' { $setz += ,@('notifications', ($herkunft + ',*'), 2) }
  'Kamera und Mikrofon erlauben' { $setz += ,@('media_stream_camera', ($herkunft + ',*'), 1); $setz += ,@('media_stream_mic', ($herkunft + ',*'), 1) }
  'Mehrere Downloads erlauben' { $setz += ,@('automatic_downloads', ($herkunft + ',*'), 1) }
  'Zwischenablage erlauben' { $setz += ,@('clipboard', ($herkunft + ',*'), 1) }
  'Standort erlauben' { $setz += ,@('geolocation', ($herkunft + ',*'), 1) }
  'Ton erlauben' { $setz += ,@('sound', ($herkunft + ',*'), 1) }
  'Cookies erlauben' { if ($ip) { $setz += ,@('cookies', ($herkunft + ',*'), 1) } else { $setz += ,@('cookies', ('[*.]' + $h + ',*'), 1); $setz += ,@('cookies', ('*,[*.]' + $h), 1) } }
}
$polMuster = switch ($was) { 'Pop-ups erlauben' { 'Popups' } 'Benachrichtigungen erlauben' { 'Notifications' } 'Benachrichtigungen blockieren' { 'Notifications' } 'Kamera und Mikrofon erlauben' { 'VideoCapture|AudioCapture' } 'Mehrere Downloads erlauben' { 'AutomaticDownloads|DownloadRestrictions' } 'Zwischenablage erlauben' { 'Clipboard' } 'Standort erlauben' { 'Geolocation' } 'Cookies erlauben' { 'Cookies' } default { '' } }
if ($polMuster) { foreach ($z in @(WebRichtlinien $polMuster '' @('Edge', 'Chrome'))) { Zeile ('Richtlinie: ' + $z + ' — hat Vorrang vor der Einstellung der Seite') } }
` + WEB_BEENDEN + String.raw`
$ft = [decimal]([DateTime]::UtcNow.ToFileTimeUtc()); $ts = [string]([long][Math]::Truncate($ft / 10))
$geaendert = 0
foreach ($b in $bro) {
  foreach ($pr in (WebProfile (Join-Path $uLocal $b[1]))) {
    $f = Join-Path $pr.FullName 'Preferences'
    $o = JLies $f
    if (-not $o) { Zeile ($b[0] + ' ' + $pr.Name + ': Einstellungsdatei nicht lesbar — übersprungen'); continue }
    $ex = JKnoten $o 'profile.content_settings.exceptions'
    $txt = @()
    if ($was -eq 'Alles zurücksetzen') {
      foreach ($typ in @($ex.Keys)) { $d = $ex[$typ]; if (-not ($d -is [System.Collections.IDictionary])) { continue }; foreach ($m in @($d.Keys)) { if (MusterPasst ([string]$m) $h) { $sv = $null; if ($d[$m] -is [System.Collections.IDictionary]) { $sv = $d[$m]['setting'] }; if ($null -eq $sv -or $sv -is [System.Collections.IDictionary]) { continue }; [void]$d.Remove($m); $txt += ([string]$typ + ' (' + (Stufe $sv) + ') entfernt') } } }
    }
    if ($was -eq 'Alles zurücksetzen' -or $was -eq 'Zoom zurücksetzen') {
      $zl = $null; if ($o['partition'] -is [System.Collections.IDictionary]) { $zl = $o['partition']['per_host_zoom_levels'] }
      if ($zl -is [System.Collections.IDictionary]) { foreach ($pk in @($zl.Keys)) { $zd = $zl[$pk]; if ($zd -is [System.Collections.IDictionary] -and $zd.ContainsKey($h)) { $pz = '?'; if ($zd[$h] -is [System.Collections.IDictionary]) { $pz = [string][math]::Round(100 * [math]::Pow([double]1.2, [double]$zd[$h]['zoom_level'])) }; [void]$zd.Remove($h); $txt += ('Zoom ' + $pz + ' % → 100 %') } } }
    }
    foreach ($s in $setz) {
      $typ = [string]$s[0]; $mu = [string]$s[1]; $wert = [int]$s[2]
      if (-not ($ex[$typ] -is [System.Collections.IDictionary])) { $ex[$typ] = [System.Collections.Generic.Dictionary[string,object]]::new() }
      $d = $ex[$typ]
      $vor = 'keine eigene Einstellung'; if ($d[$mu] -is [System.Collections.IDictionary]) { $vor = Stufe $d[$mu]['setting'] }
      $e = [System.Collections.Generic.Dictionary[string,object]]::new(); $e['last_modified'] = [string]$ts; $e['setting'] = [int]$wert
      $d[$mu] = $e
      $txt += ($typ + ' ' + $mu + ': ' + $vor + ' → ' + (Stufe $wert))
    }
    if ($txt.Count) { JSpeichern $f $o; $geaendert++; Zeile ($b[0] + ' ' + $pr.Name + ': ' + ($txt -join ' · ')) }
    else { Zeile ($b[0] + ' ' + $pr.Name + ': für ' + $h + ' war nichts Eigenes eingestellt') }
  }
}
Zeile ('Fertig: ' + $geaendert + ' Profil(e) geändert' + $(if ($geaendert) { ' (Sicherung Preferences.alt_… daneben)' } else { '' }) + '. Browser neu öffnen und ' + $herkunft + ' neu laden.')
if ($was -eq 'Cookies erlauben') { Zeile 'Cookies der Seite sind erlaubt — auch Drittanbieter-Cookies (z. B. eingebettete Anmeldung), solange diese Seite oben in der Adressleiste steht.' }` }),

  A({ id: 'web-browser-option', titel: 'Browser-Einstellung des Benutzers setzen (Edge/Chrome: Hardwarebeschleunigung, Downloads, PDF, Sprache …)', modus: 'profil', risiko: 'aendern', timeoutMs: 90000,
    beschreibung: 'Beendet Edge und Chrome des Benutzers und setzt eine Einstellung in allen Profilen bzw. für den ganzen Browser: Hardwarebeschleunigung, Experimente (edge://flags) zurück, sicheres DNS aus, im Hintergrund weiterlaufen aus, Download-Nachfrage und -Ordner, PDF im Browser oder extern, Übersetzungsangebot, Benachrichtigungsanfragen aller Seiten, Druck- und Schrifteinstellungen zurück, Sprache und Rechtschreibung Deutsch, Favoritenleiste, Fensterposition. Zeigt alten und neuen Wert, meldet Firmenrichtlinien mit Vorrang und sichert die Datei vorher.',
    param: { label: 'Einstellung', platzhalter: 'Hardwarebeschleunigung aus', pflicht: true,
      optionen: ['Hardwarebeschleunigung aus', 'Hardwarebeschleunigung an', 'Experimente (flags) zurücksetzen', 'Sicheres DNS aus (Firmen-DNS verwenden)', 'Im Hintergrund weiterlaufen aus', 'Downloads: jedes Mal nach Speicherort fragen', 'Downloads: ohne Nachfrage speichern', 'Download-Ordner: Downloads des Benutzers', 'PDF: im Browser anzeigen', 'PDF: herunterladen und mit Standard-App öffnen', 'Übersetzungsangebot aus', 'Übersetzungsangebot an', 'Benachrichtigungsanfragen aller Seiten blockieren', 'Benachrichtigungsanfragen wieder zulassen', 'Druckeinstellungen zurücksetzen', 'Schrifteinstellungen zurücksetzen', 'Sprache für Webseiten: Deutsch zuerst', 'Rechtschreibprüfung: Deutsch', 'Favoritenleiste immer anzeigen', 'Fensterposition zurücksetzen'] },
    ps: WEB_JSON + WEB_JSON_SCHREIBEN + WEB_POLITIK + String.raw`
NeedUser
$alle = @('Hardwarebeschleunigung aus', 'Hardwarebeschleunigung an', 'Experimente (flags) zurücksetzen', 'Sicheres DNS aus (Firmen-DNS verwenden)', 'Im Hintergrund weiterlaufen aus', 'Downloads: jedes Mal nach Speicherort fragen', 'Downloads: ohne Nachfrage speichern', 'Download-Ordner: Downloads des Benutzers', 'PDF: im Browser anzeigen', 'PDF: herunterladen und mit Standard-App öffnen', 'Übersetzungsangebot aus', 'Übersetzungsangebot an', 'Benachrichtigungsanfragen aller Seiten blockieren', 'Benachrichtigungsanfragen wieder zulassen', 'Druckeinstellungen zurücksetzen', 'Schrifteinstellungen zurücksetzen', 'Sprache für Webseiten: Deutsch zuerst', 'Rechtschreibprüfung: Deutsch', 'Favoritenleiste immer anzeigen', 'Fensterposition zurücksetzen')
$opt = [string](@($alle | Where-Object { $_ -ieq $P.Trim() }) | Select-Object -First 1)
if (-not $opt) { throw ('Unbekannte Einstellung „' + $P.Trim() + '“ — erlaubt: ' + ($alle -join ' | ')) }
$lokal = $opt -match '^(Hardwarebeschleunigung|Experimente|Sicheres DNS|Im Hintergrund)'
$polMuster = switch -regex ($opt) { '^Hardware' { 'HardwareAccelerationModeEnabled' } '^Sicheres DNS' { 'DnsOverHttps|BuiltInDnsClientEnabled' } '^Im Hintergrund' { 'BackgroundModeEnabled|StartupBoostEnabled' } '^Download' { 'PromptForDownloadLocation|DownloadDirectory' } '^PDF' { 'AlwaysOpenPdfExternally' } '^Übersetzung' { 'TranslateEnabled' } '^Benachrichtigung' { 'DefaultNotificationsSetting' } '^Druck' { 'Print' } '^Schrift' { 'Font' } '^Sprache' { 'ForcedLanguages|ApplicationLocaleValue' } '^Rechtschreib' { 'Spellcheck' } '^Favoriten' { 'FavoritesBarEnabled|BookmarkBarEnabled' } default { '' } }
if ($polMuster) { foreach ($z in @(WebRichtlinien $polMuster '' @('Edge', 'Chrome'))) { Zeile ('Richtlinie: ' + $z + ' — hat Vorrang vor der Einstellung des Benutzers') } }
$dl = ''
if ($opt -like 'Download-Ordner*') {
  if ($uHive) { $dl = [string](Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') -EA SilentlyContinue).'{374DE290-123F-4565-9164-39C4925E467B}' }
  if ($dl) { $dl = $dl -ireplace '%USERPROFILE%', $uProf }
  if (-not $dl -or $dl -match '%') { $dl = Join-Path $uProf 'Downloads' }
  if (-not (Test-Path -LiteralPath $dl)) { New-Item -Path $dl -ItemType Directory -Force | Out-Null; Zeile ('Download-Ordner fehlte — angelegt: ' + $dl) }
}
function Setze($o, [string]$pfad, $wert) { $vor = JHol $o $pfad; if ($vor -eq [string]$wert) { return '' }; JSetz $o $pfad $wert; return ($pfad + ': ' + $vor + ' → ' + [string]$wert) }
function Weg($o, [string[]]$pfade) { $r = @(); foreach ($pf in $pfade) { $v = JHol $o $pf; if (JWeg $o $pf) { $r += ($pf + ' (' +$(if ($v.Length -gt 60) { $v.Substring(0, 60) + ' …' } else { $v }) + ') entfernt') } }; return ($r -join ' · ') }
function Beide([string]$x1, [string]$x2) { return ((@($x1, $x2) | Where-Object { $_ }) -join ' · ') }
function Aendere($o) {
  switch ($opt) {
    'Hardwarebeschleunigung aus' { return (Setze $o 'hardware_acceleration_mode.enabled' $false) }
    'Hardwarebeschleunigung an' { return (Setze $o 'hardware_acceleration_mode.enabled' $true) }
    'Experimente (flags) zurücksetzen' { return (Weg $o @('browser.enabled_labs_experiments')) }
    'Sicheres DNS aus (Firmen-DNS verwenden)' { return (Beide (Setze $o 'dns_over_https.mode' 'off') (Weg $o @('dns_over_https.templates'))) }
    'Im Hintergrund weiterlaufen aus' { return (Setze $o 'background_mode.enabled' $false) }
    'Downloads: jedes Mal nach Speicherort fragen' { return (Setze $o 'download.prompt_for_download' $true) }
    'Downloads: ohne Nachfrage speichern' { return (Setze $o 'download.prompt_for_download' $false) }
    'Download-Ordner: Downloads des Benutzers' { return (Beide (Setze $o 'download.default_directory' ([string]$dl)) (Setze $o 'savefile.default_directory' ([string]$dl))) }
    'PDF: im Browser anzeigen' { return (Setze $o 'plugins.always_open_pdf_externally' $false) }
    'PDF: herunterladen und mit Standard-App öffnen' { return (Setze $o 'plugins.always_open_pdf_externally' $true) }
    'Übersetzungsangebot aus' { return (Setze $o 'translate.enabled' $false) }
    'Übersetzungsangebot an' { return (Setze $o 'translate.enabled' $true) }
    'Benachrichtigungsanfragen aller Seiten blockieren' { return (Setze $o 'profile.default_content_setting_values.notifications' ([int]2)) }
    'Benachrichtigungsanfragen wieder zulassen' { return (Weg $o @('profile.default_content_setting_values.notifications')) }
    'Druckeinstellungen zurücksetzen' { return (Weg $o @('printing.print_preview_sticky_settings')) }
    'Schrifteinstellungen zurücksetzen' { return (Weg $o @('webkit.webprefs.fonts', 'webkit.webprefs.default_font_size', 'webkit.webprefs.default_fixed_font_size', 'webkit.webprefs.minimum_font_size', 'webkit.webprefs.minimum_logical_font_size')) }
    'Sprache für Webseiten: Deutsch zuerst' {
      $vor = JHol $o 'intl.selected_languages'; if ($vor -like '(*') { $vor = JHol $o 'intl.accept_languages' }
      $l = New-Object System.Collections.Generic.List[string]; $l.Add('de-DE'); $l.Add('de')
      if ($vor -notlike '(*') { foreach ($x in $vor.Split(',')) { $x = $x.Trim(); if ($x -and -not $l.Contains($x)) { $l.Add($x) } } }
      if (-not $l.Contains('en-US')) { $l.Add('en-US') }; if (-not $l.Contains('en')) { $l.Add('en') }
      $neu = [string]($l.ToArray() -join ',')
      $x2 = ''; if ((JHol $o 'intl.accept_languages') -ne '(Standard)') { $x2 = Setze $o 'intl.accept_languages' $neu }
      return (Beide (Setze $o 'intl.selected_languages' $neu) $x2)
    }
    'Rechtschreibprüfung: Deutsch' {
      $alt = @(); $k = $o['spellcheck']; if ($k -is [System.Collections.IDictionary] -and $k['dictionaries'] -is [array]) { foreach ($x in $k['dictionaries']) { $alt += [string]$x } }
      $x2 = Setze $o 'browser.enable_spellchecking' $true
      if ($alt.Count -and $alt[0] -like 'de*') { return $x2 }
      $neu = @('de-DE'); foreach ($x in $alt) { if ($x -notlike 'de*') { $neu += [string]$x } }
      JSetz $o 'spellcheck.dictionaries' ([object[]]$neu)
      return (Beide ('spellcheck.dictionaries: [' + ($alt -join ', ') + '] → [' + ($neu -join ', ') + ']') $x2)
    }
    'Favoritenleiste immer anzeigen' { $x2 = ''; if ((JHol $o 'bookmark_bar.show_only_on_ntp') -ne '(Standard)') { $x2 = Setze $o 'bookmark_bar.show_only_on_ntp' $false }; return (Beide (Setze $o 'bookmark_bar.show_on_all_tabs' $true) $x2) }
    'Fensterposition zurücksetzen' { return (Weg $o @('browser.window_placement', 'browser.window_placement_popup', 'browser.app_window_placement')) }
  }
  return ''
}
` + WEB_BEENDEN + String.raw`
$geaendert = 0
foreach ($b in $bro) {
  $ud = Join-Path $uLocal $b[1]
  $dateien = @()
  if ($lokal) { $dateien = @(,@('allgemein', (Join-Path $ud 'Local State'))) } else { foreach ($pr in (WebProfile $ud)) { $dateien += ,@($pr.Name, (Join-Path $pr.FullName 'Preferences')) } }
  foreach ($df in $dateien) {
    $o = JLies $df[1]
    if (-not $o) { Zeile ($b[0] + ' ' + $df[0] + ': Datei nicht lesbar — übersprungen'); continue }
    $txt = [string](Aendere $o)
    if ($txt) { JSpeichern $df[1] $o; $geaendert++; Zeile ($b[0] + ' ' + $df[0] + ': ' + $txt) }
    else { Zeile ($b[0] + ' ' + $df[0] + ': war bereits so eingestellt') }
  }
}
Zeile ('Fertig: ' + $geaendert + ' Datei(en) geändert' + $(if ($geaendert) { ' (Sicherung *.alt_… daneben)' } else { '' }) + '. „' + $opt + '“ gilt ab dem nächsten Start des Browsers.')` }),

  A({ id: 'web-firefox-option', titel: 'Firefox-Einstellung des Benutzers setzen (Zertifikate, Anmeldung, DNS, Proxy, Grafik)', modus: 'profil', risiko: 'aendern', timeoutMs: 90000,
    beschreibung: 'Beendet Firefox des Benutzers und trägt die Einstellung in jedem Firefox-Profil in die user.js ein (gilt ab dem nächsten Start): Windows-Zertifikaten vertrauen (Zscaler/Firmen-Zertifikate), Microsoft-Anmeldung mit dem Windows-Konto, Intranet-Anmeldung ohne Kennwortabfrage (*.skf.net), DNS über HTTPS aus, Proxy wie Windows, Hardwarebeschleunigung aus/an. Zeigt den bisherigen Wert, meldet Firefox-Richtlinien mit Vorrang und sichert eine vorhandene user.js.',
    param: { label: 'Einstellung', platzhalter: 'Windows-Zertifikaten vertrauen (Zscaler)', pflicht: true,
      optionen: ['Windows-Zertifikaten vertrauen (Zscaler)', 'Microsoft-Anmeldung mit dem Windows-Konto (SSO)', 'Intranet-Anmeldung ohne Kennwortabfrage', 'DNS über HTTPS aus', 'Proxy wie Windows (Systemeinstellung)', 'Hardwarebeschleunigung aus', 'Hardwarebeschleunigung an'] },
    ps: WEB_POLITIK + String.raw`
NeedUser
$karte = [ordered]@{
  'Windows-Zertifikaten vertrauen (Zscaler)' = @('security.enterprise_roots.enabled=true')
  'Microsoft-Anmeldung mit dem Windows-Konto (SSO)' = @('network.http.windows-sso.enabled=true')
  'Intranet-Anmeldung ohne Kennwortabfrage' = @('network.negotiate-auth.trusted-uris=".skf.net"', 'network.automatic-ntlm-auth.trusted-uris=".skf.net"', 'network.negotiate-auth.allow-non-fqdn=true', 'network.automatic-ntlm-auth.allow-non-fqdn=true')
  'DNS über HTTPS aus' = @('network.trr.mode=5')
  'Proxy wie Windows (Systemeinstellung)' = @('network.proxy.type=5')
  'Hardwarebeschleunigung aus' = @('layers.acceleration.disabled=true')
  'Hardwarebeschleunigung an' = @('layers.acceleration.disabled=false')
}
$opt = [string](@($karte.Keys | Where-Object { $_ -ieq $P.Trim() }) | Select-Object -First 1)
if (-not $opt) { throw ('Unbekannte Einstellung „' + $P.Trim() + '“ — erlaubt: ' + (@($karte.Keys) -join ' | ')) }
$eintr = @($karte[$opt] | ForEach-Object { [string]$_ })
$polMuster = switch -regex ($opt) { '^Windows-Zert' { 'Certificates|ImportEnterpriseRoots' } '^Microsoft' { 'WindowsSSO' } '^Intranet' { 'Authentication|SPNEGO|NTLM' } '^DNS' { 'DNSOverHTTPS' } '^Proxy' { 'Proxy' } '^Hardware' { 'HardwareAcceleration' } default { '' } }
foreach ($z in @(WebRichtlinien $polMuster '' @('Firefox'))) { Zeile ('Richtlinie: ' + $z + ' — hat Vorrang vor der user.js') }
foreach ($d in 'C:\Program Files\Mozilla Firefox\distribution\policies.json', 'C:\Program Files (x86)\Mozilla Firefox\distribution\policies.json') { if (Test-Path -LiteralPath $d) { Zeile ('Firefox-Richtliniendatei vorhanden: ' + $d + ' — sie kann Einstellungen sperren.') } }
$pd = Join-Path $uRoam 'Mozilla\Firefox\Profiles'
$profs = @(Get-ChildItem -LiteralPath $pd -Directory -EA SilentlyContinue | Where-Object { $_.Name -notlike '*.alt_*' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'prefs.js')) })
if (-not $profs.Count) { throw 'Firefox ist für diesen Benutzer nicht eingerichtet (kein Profil mit prefs.js) — nichts geändert.' }
StopUser @('firefox')
if (@(UserProcs @('firefox')).Count) { throw 'Firefox lässt sich nicht beenden — nichts geändert.' }
$stempel = Get-Date -Format 'yyyyMMdd_HHmmss'
$namen = @($eintr | ForEach-Object { [string](($_ -split '=', 2)[0]) })
foreach ($pr in $profs) {
  $uj = Join-Path $pr.FullName 'user.js'
  $alt = @()
  if (Test-Path -LiteralPath $uj) { Copy-Item -LiteralPath $uj -Destination ($uj + '.alt_' + $stempel) -Force -EA Stop; $alt = @([IO.File]::ReadAllLines($uj)) }
  $prefs = [IO.File]::ReadAllText((Join-Path $pr.FullName 'prefs.js'))
  $neu = New-Object System.Collections.Generic.List[string]
  foreach ($z in $alt) { $treffer = $false; foreach ($n in $namen) { if ($z -match ('^\s*user_pref\(\s*"' + [regex]::Escape($n) + '"')) { $treffer = $true } }; if (-not $treffer) { $neu.Add([string]$z) } }
  foreach ($e in $eintr) {
    $n, $v = $e -split '=', 2
    $m = [regex]::Match(($alt -join [string][char]10), 'user_pref\(\s*"' + [regex]::Escape($n) + '",\s*(.*?)\);')
    if (-not $m.Success) { $m = [regex]::Match($prefs, 'user_pref\("' + [regex]::Escape($n) + '",\s*(.*?)\);') }
    $vor = $(if ($m.Success) { $m.Groups[1].Value } else { 'Standard' })
    $neu.Add('user_pref("' + $n + '", ' + $v + '); // IT Admin Tool ' + $stempel)
    Zeile ('Firefox ' + $pr.Name + ': ' + $n + ' ' + $vor + ' → ' + $v)
  }
  [IO.File]::WriteAllLines($uj, $neu.ToArray(), (New-Object System.Text.UTF8Encoding($false)))
}
Zeile ('Gilt ab dem nächsten Firefox-Start (' + $profs.Count + ' Profil(e); die user.js wird bei jedem Start übernommen, Sicherung user.js.alt_… daneben).')` }),

  A({ id: 'web-intranetzone-webseite', titel: 'Interne Webseite zur Zone „Lokales Intranet“ hinzufügen (automatische Windows-Anmeldung)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Trägt eine Firmenadresse (…skf.net, …skf.com oder Servername ohne Punkt, auch „*.corp.skf.net“) für http und https in die Intranetzone des Benutzers ein. Edge, Chrome und der IE-Modus senden dort die Windows-Anmeldung automatisch (keine Kennwortabfrage, Kerberos) und erlauben die Intranet-Einstellungen (z. B. ActiveX im IE-Modus). Prüft vorher die Zonenliste und AuthServerAllowlist der Firmenrichtlinien; externe Seiten und IP-Adressen werden abgelehnt.',
    param: { label: 'Adresse (Firmenserver)', platzhalter: 'z. B. w3294.corp.skf.net oder *.corp.skf.net', pflicht: true, vorlagen: ['intranet.skf.net', '*.corp.skf.net', 'enaioprod.skf.net'] },
    ps: WEB_POLITIK + WEB_ZONEN + String.raw`
NeedHive
$roh = $P.Trim().ToLower()
if (-not $roh) { throw 'Bitte die Adresse angeben (z. B. intranet.skf.net oder *.corp.skf.net).' }
$h = (($roh -replace '^[a-z][a-z0-9+.-]*://', '') -replace '[/?#].*$', '') -replace ':\d{1,5}$', ''
$h = $h.Trim('.')
$wild = $h.StartsWith('*.'); if ($wild) { $h = $h.Substring(2) }
if ($h -match '^\d{1,3}(\.\d{1,3}){3}$') { throw 'IP-Adressen werden nicht eingetragen — bitte den Servernamen verwenden (die Windows-Anmeldung per Kerberos klappt nur mit Namen).' }
if ($h -notmatch '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$') { throw ('Ungültige Adresse: ' + $P) }
$t = $h.Split('.')
if ($wild -and $t.Count -lt 2) { throw ('„*.' + $h + '“ ist keine Domäne.') }
if ($t.Count -gt 1 -and $h -notmatch '(^|\.)skf\.(net|com)$') { throw ('Nur Firmenadressen (…skf.net, …skf.com) oder Servernamen ohne Punkt — externe Seiten gehören nicht in die Intranetzone (der Browser würde dorthin automatisch die Windows-Anmeldung senden): ' + $h) }
foreach ($z in @(ZonenRichtlinie $h)) { Zeile $z; if ($z -like '*Security_HKLM_only*') { throw 'Abgebrochen, nichts geändert: Per Richtlinie zählen nur die Zonen des Computers — DXC muss die Adresse in die Zonenliste aufnehmen.' } }
$vorher = @(ZonenBenutzer $h)
Zeile ('Vorher (Benutzer): ' + $(if ($vorher.Count) { $vorher -join ' · ' } else { 'kein Eintrag' }))
if ($t.Count -eq 1) { $rel = $h }
else {
  $dom = $t[$t.Count - 2] + '.' + $t[$t.Count - 1]
  $pre = ''; if ($t.Count -gt 2) { $pre = ($t[0..($t.Count - 3)] -join '.') }
  if ($wild) { $rel = $(if ($pre) { $dom + '\*.' + $pre } else { $dom }) } else { $rel = $(if ($pre) { $dom + '\' + $pre } else { $dom }) }
}
$rk = [Microsoft.Win32.Registry]::Users.CreateSubKey($uSid + '\Software\Microsoft\Windows\CurrentVersion\Internet Settings\ZoneMap\Domains\' + $rel)
if (-not $rk) { throw 'Zonen-Schlüssel des Benutzers konnte nicht geöffnet werden — nichts geändert.' }
$aH = $rk.GetValue('http'); $aS = $rk.GetValue('https')
$rk.SetValue('http', 1, [Microsoft.Win32.RegistryValueKind]::DWord); $rk.SetValue('https', 1, [Microsoft.Win32.RegistryValueKind]::DWord); $rk.Close()
Zeile ('Domains\' + $rel + ': http ' + $(if ($null -ne $aH) { ZoneName $aH } else { 'ohne Eintrag' }) + ' → Lokales Intranet · https ' + $(if ($null -ne $aS) { ZoneName $aS } else { 'ohne Eintrag' }) + ' → Lokales Intranet')
foreach ($q in @(WebRichtlinien 'AuthServerAllowlist|AuthServerWhitelist' '' @('Edge', 'Chrome'))) {
  $wl = ($q -split ' = ', 2)[1]; $ok = $false
  foreach ($m in @(([string]$wl) -split '[,;]')) { $m = $m.Trim(); if ($m -and (($h -like $m) -or ($h -like ('*' + $m.TrimStart('*'))))) { $ok = $true } }
  Zeile ('Richtlinie ' + $q + ' → ' + $(if ($ok) { 'Adresse ist enthalten' } else { 'Adresse fehlt dort: dieser Browser entscheidet die automatische Anmeldung nur nach dieser Liste (DXC)' }))
}
Zeile 'Seite im Browser neu laden (im IE-Modus: Tab schließen und neu öffnen). Eine Zonenliste per Richtlinie kann den Eintrag überstimmen.'` }),
]
