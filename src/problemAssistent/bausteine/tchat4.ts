// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „tchat“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Bereiche: Teams (Chat, Kanäle, Client) · Telefonie & Sonstiges (Xelion, Click-to-dial, enaio).
// Xelion ist ein MSIX-Paket („XelionWindowsDesktop“, Windows App SDK) — je Benutzer registriert.
// Protokoll-Zuordnungen (tel:, callto:, sip:, msteams:) liegen im Profil des Benutzers unter
// UrlAssociations\<linktyp>\UserChoice (mit Hash geschützt) — setzen geht nicht, aber die Auswahl
// lässt sich entfernen; dann fragt Windows beim nächsten Klick neu.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** ProgId → lesbarer Name (AppUserModelID bei Store-Apps, sonst Anwendungsname/Standardwert). Nur lesend. */
const PROTO_PS = String.raw`
function ProgName([string]$id) {
  if (-not $id) { return '' }
  $orte = @(('HKLM:\SOFTWARE\Classes\' + $id))
  if ($uSid) { $orte = @(('Registry::HKEY_USERS\' + $uSid + '_Classes\' + $id)) + $orte }
  foreach ($b in $orte) {
    $a = Get-ItemProperty ($b + '\Application') -EA SilentlyContinue
    if ($a -and $a.ApplicationName -and ([string]$a.ApplicationName -notmatch '^@')) { return [string]$a.ApplicationName }
    if ($a -and $a.AppUserModelID) { return [string]$a.AppUserModelID }
    $d = (Get-ItemProperty $b -EA SilentlyContinue).'(default)'
    if ($d -and ([string]$d -notmatch '^@')) { return [string]$d }
  }
  return $id
}
function AlleAppx([string]$name) {
  $r = @(); try { $r = @(Get-AppxPackage -AllUsers -Name $name -EA Stop) } catch { $r = @(Get-AppxPackage -Name $name -EA SilentlyContinue) }
  return @($r | Sort-Object { [version]$_.Version } -Descending)
}
function GewaehltFuer([string]$pr) {
  if (-not $uHive) { return '' }
  $k = $uHive + '\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\' + $pr
  $v = [string](Get-ItemProperty ($k + '\UserChoice') -EA SilentlyContinue).ProgId
  if (-not $v) { $v = [string](Get-ItemProperty ($k + '\UserChoiceLatest') -EA SilentlyContinue).ProgId }
  if (-not $v) { $v = [string](Get-ItemProperty ($k + '\UserChoiceLatest\ProgId') -EA SilentlyContinue).ProgId }
  return $v
}
`

export const AKTIONEN_TCHAT4: PaAktion[] = [
  // ══ Xelion: Diagnose ════════════════════════════════════════════════════════
  A({ id: 'tchat-xelion-pruefen', titel: 'Xelion gründlich prüfen (Paket, Abhängigkeiten, Autostart, Mikrofon, Server)', modus: 'profil', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Alles rund um die Xelion-App des angemeldeten Benutzers auf einen Blick: Version und Paketzustand, für den Benutzer registriert, nötige Laufzeiten (Windows App Runtime, VCLibs), läuft Xelion, Autostart, Windows-Benachrichtigungen, Mikrofon-Freigabe, wohin tel:/callto:-Links gehen, App-Daten, Server laut App-Daten und deren Erreichbarkeit, Abstürze der letzten 7 Tage. Ändert nichts.',
    ps: PROTO_PS + String.raw`
NeedUser
$pk = @(AlleAppx 'XelionWindowsDesktop') | Select-Object -First 1
$txt = ''
if (-not $pk) { Zeile 'Xelion (XelionWindowsDesktop) ist auf diesem PC NICHT installiert (→ Software-Installationen → Xelion)' }
else {
  $st = ''
  foreach ($ui in @($pk.PackageUserInformation)) { $s = [string]$ui.UserSecurityId.Sid; if (-not $s) { $s = [string]$ui.UserSecurityId }; if ($uSid -and $s -match [regex]::Escape([string]$uSid)) { $st = [string]$ui.InstallState } }
  Zeile ('Xelion ' + $pk.Version + ' · Paketzustand ' + [string]$pk.Status + ' · für ' + $uDomUser + ': ' + $(if ($st) { $st } else { 'NICHT registriert (→ „App-Paket neu registrieren“ Xelion)' }))
  try { $txt = [IO.File]::ReadAllText((Join-Path $pk.InstallLocation 'AppxManifest.xml')) } catch {}
  foreach ($m in [regex]::Matches($txt, '<PackageDependency\b[^>]*>')) {
    $dn = [regex]::Match($m.Value, '\bName="([^"]+)"').Groups[1].Value
    $mv = [regex]::Match($m.Value, '\bMinVersion="([^"]+)"').Groups[1].Value
    if (-not $dn) { continue }
    $best = @(AlleAppx $dn) | Select-Object -First 1
    $gut = $false; try { $gut = $best -and (-not $mv -or ([version][string]$best.Version -ge [version]$mv)) } catch {}
    Zeile ('Laufzeit ' + $dn + $(if ($mv) { ' (mind. ' + $mv + ')' } else { '' }) + ': ' + $(if ($gut) { [string]$best.Version + ' ok' } elseif ($best) { 'nur ' + [string]$best.Version + ' — ZU ALT, Xelion startet ggf. nicht' } else { 'FEHLT — Xelion startet dann nicht (→ Xelion neu installieren)' }))
  }
}
$lauf = @()
try { $lauf = @(Get-Process -IncludeUserName -EA Stop | Where-Object { $_.Path -like '*\WindowsApps\XelionWindowsDesktop_*' }) } catch { $lauf = @(Get-Process -EA SilentlyContinue | Where-Object { $_.Path -like '*\WindowsApps\XelionWindowsDesktop_*' }) }
$meine = @($lauf | Where-Object { -not $_.UserName -or ((([string]$_.UserName) -split '\\')[-1] -ieq $uName) })
$seit = ''; try { $seit = ' seit ' + (@($meine | Sort-Object StartTime) | Select-Object -First 1).StartTime.ToString('dd.MM. HH:mm') } catch {}
Zeile ('Läuft beim Benutzer: ' + $(if ($meine.Count) { 'ja (' + $meine.Count + ' Prozess(e)' + $seit + ')' } else { 'nein' }) + $(if ($lauf.Count -gt $meine.Count) { ' · läuft zusätzlich bei einem anderen angemeldeten Benutzer' } else { '' }))
if ($pk -and $uSid -and $uHive) {
  $task = [regex]::Match($txt, 'StartupTask\b[^>]*\bTaskId="([^"]+)"').Groups[1].Value
  if ($task) {
    $w = 'Registry::HKEY_USERS\' + $uSid + '_Classes'; if (-not (Test-Path $w)) { $w = $uHive + '\Software\Classes' }
    $k = $w + '\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData\' + $pk.PackageFamilyName + '\' + $task
    $sv = $null; if (Test-Path $k) { $sv = (Get-ItemProperty $k -EA SilentlyContinue).State }
    $svt = switch ([string]$sv) { '' { 'nicht gesetzt (Voreinstellung des Pakets)' } '0' { 'aus' } '1' { 'vom Benutzer abgeschaltet' } '2' { 'an' } '3' { 'per Richtlinie aus' } '4' { 'per Richtlinie an' } default { 'Wert ' + $sv } }
    Zeile ('Autostart (' + $task + '): ' + $svt)
  }
}
$lnk = @(Get-ChildItem -LiteralPath (Join-Path $uRoam 'Microsoft\Windows\Start Menu\Programs\Startup') -Filter '*xelion*' -File -EA SilentlyContinue)
if ($lnk.Count) { Zeile ('Autostart-Verknüpfung: ' + ((@($lnk | ForEach-Object { $_.Name })) -join ', ')) }
if ($uHive) {
  $g = Get-ItemProperty ($uHive + '\Software\Microsoft\Windows\CurrentVersion\PushNotifications') -EA SilentlyContinue
  if ($g -and $g.ToastEnabled -eq 0) { Zeile 'Windows-Benachrichtigungen allgemein: AUS (→ „Benachrichtigungen zulassen“)' }
  foreach ($k in @(Get-ChildItem ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings') -EA SilentlyContinue | Where-Object { $_.PSChildName -match 'Xelion' })) {
    $q = Get-ItemProperty $k.PSPath -EA SilentlyContinue
    Zeile ('Windows-Benachrichtigungen für Xelion: ' + $(if ($q.Enabled -eq 0) { 'AUS — Anruffenster/Banner fehlen (→ „Benachrichtigungen zulassen“ Xelion)' } else { 'erlaubt' }))
  }
  $cs = $uHive + '\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone'
  $hv = [string](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone' -EA SilentlyContinue).Value
  $gv = [string](Get-ItemProperty $cs -EA SilentlyContinue).Value
  $av = ''; if ($pk) { $av = [string](Get-ItemProperty ($cs + '\' + $pk.PackageFamilyName) -EA SilentlyContinue).Value }
  Zeile ('Mikrofon-Freigabe: PC ' + $(if ($hv) { $hv } else { 'Standard' }) + ' · Benutzer ' + $(if ($gv) { $gv } else { 'Standard' }) + ' · Xelion ' + $(if ($av) { $av } else { 'noch nicht gefragt' }) + $(if ('Deny' -in @($hv, $gv, $av)) { ' — GESPERRT (→ „Kamera und Mikrofon freigeben“)' } else { '' }))
  foreach ($pr in 'tel', 'callto') { $v = GewaehltFuer $pr; Zeile ('Klick auf „' + $pr + ':“-Link öffnet: ' + $(if ($v) { (ProgName $v) + ' [' + $v + ']' } else { 'keine eigene Auswahl (Windows fragt bzw. nimmt das Standardprogramm)' })) }
}
$hosts = New-Object System.Collections.Generic.List[string]
$df = @(Get-ChildItem -LiteralPath (Join-Path $uLocal 'Packages') -Directory -Filter 'XelionWindowsDesktop_*' -EA SilentlyContinue) | Select-Object -First 1
if ($df) {
  $last = Get-ChildItem -LiteralPath $df.FullName -Recurse -File -Force -EA SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  Zeile ('App-Daten: ' + (Groesse (OrdnerGroesse $df.FullName)) + $(if ($last) { ' · zuletzt geschrieben ' + $last.LastWriteTime.ToString('dd.MM.yyyy HH:mm') } else { '' }))
  foreach ($f in @(Get-ChildItem -LiteralPath $df.FullName -Recurse -File -Force -EA SilentlyContinue | Where-Object { $_.Length -lt 2MB -and $_.Extension -match '^\.(json|xml|dat|ini|config|txt|settings)$' } | Select-Object -First 200)) {
    $roh = ''; $fs = $null
    try { $fs = [IO.File]::Open($f.FullName, 'Open', 'Read', 'ReadWrite, Delete'); $buf = New-Object byte[] ([int]$fs.Length); [void]$fs.Read($buf, 0, $buf.Length); $roh = [Text.Encoding]::UTF8.GetString($buf) + ' ' + [Text.Encoding]::Unicode.GetString($buf) } catch {} finally { if ($fs) { $fs.Close() } }
    if (-not $roh) { continue }
    foreach ($m in [regex]::Matches($roh, '(?i)\b(?:https?|wss?)://([a-z0-9][a-z0-9.-]*\.[a-z]{2,})')) { $h = $m.Groups[1].Value.ToLower(); if ($h -notmatch 'microsoft|windows|msftauth|live\.com|office|w3\.org|xmlsoap|schemas|digicert|verisign|globalsign' -and -not $hosts.Contains($h)) { $hosts.Add($h) } }
  }
  Zeile ('Server laut App-Daten: ' + $(if ($hosts.Count) { (@($hosts | Select-Object -First 5)) -join ', ' } else { 'nicht lesbar' }))
} else { Zeile 'App-Daten: kein Datenordner im Profil (Xelion in diesem Profil nie gestartet?)' }
foreach ($h in (@('appinstaller.xelion.com') + @($hosts | Select-Object -First 3) | Select-Object -Unique)) {
  $ok = $false; $t = New-Object System.Net.Sockets.TcpClient
  try { $ok = $t.ConnectAsync($h, 443).Wait(3000) -and $t.Connected } catch {} finally { $t.Close() }
  Zeile ('TCP 443 ' + $h + ': ' + $(if ($ok) { 'erreichbar' } else { 'NICHT erreichbar (Zscaler/Netz)' }))
}
$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Error', 'Application Hang'; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue | Where-Object { ((@($_.Properties | ForEach-Object { [string]$_.Value })) -join ' ') -match 'Xelion' })
Zeile ('Abstürze/Hänger in 7 Tagen: ' + $ev.Count + $(if ($ev.Count) { ' · zuletzt ' + $ev[0].TimeCreated.ToString('dd.MM. HH:mm') + ' (' + [string]$ev[0].Properties[0].Value + ')' } else { '' }))
$z = Get-Service -Name 'ZSAService' -EA SilentlyContinue; if ($z) { Zeile ('Zscaler-Dienst: ' + $z.Status) }
Zeile 'Audiogeräte: „Audio-Übersicht“. Klingeldauer, Umleitungen, Gruppen und Mailbox stellt der Telefonie-Dienstleister am Xelion-Server ein.'` }),

  // ══ Xelion / Teams: zurücksetzen ════════════════════════════════════════════
  A({ id: 'tchat-app-zuruecksetzen', titel: 'Xelion oder neues Teams zurücksetzen (wie Einstellungen → Apps → Zurücksetzen)', modus: 'benutzer', risiko: 'kritisch', timeoutMs: 180000,
    beschreibung: 'Beendet die App in der Sitzung des Benutzers, sichert ihre App-Daten (LocalState, Settings, RoamingState; bei Teams auch die eigenen Hintergrundbilder) nach %LOCALAPPDATA%\ITAdminTool-Sicherung und setzt sie auf Werkszustand zurück (Reset-AppxPackage) — gegen kaputte Einstellungen, falsche gespeicherte Server-/Kontodaten, Hänger beim Start, wenn Neustart und Cache leeren nicht helfen. Danach startet die App neu; der Benutzer meldet sich einmal neu an.',
    param: { label: 'Welche App', platzhalter: 'Xelion', pflicht: true, optionen: ['Xelion', 'Neues Teams'] },
    ps: String.raw`
$wahl = $P.Trim()
if ($wahl -notin 'Xelion', 'Neues Teams') { throw ('Unbekannte App: ' + $wahl) }
if (-not (Get-Command Reset-AppxPackage -EA SilentlyContinue)) { throw 'Zurücksetzen von Apps braucht Windows 10 2004 oder neuer.' }
$name = $(if ($wahl -eq 'Xelion') { 'XelionWindowsDesktop' } else { 'MSTeams' })
$pk = @(Get-AppxPackage -Name $name -EA SilentlyContinue) | Sort-Object { [version]$_.Version } -Descending | Select-Object -First 1
if (-not $pk) { throw ($wahl + ' ist für diesen Benutzer nicht installiert — zuerst installieren bzw. „App-Paket neu registrieren“.') }
$txt = ''; try { $txt = [IO.File]::ReadAllText((Join-Path $pk.InstallLocation 'AppxManifest.xml')) } catch {}
$alle = @([regex]::Matches($txt, '(?s)<Application\b[^>]*\bId="([^"]+)"(.*?)</Application>'))
$gutA = @($alle | Where-Object { $_.Groups[2].Value -notmatch 'AppListEntry="none"' })
$app = ''; if ($gutA.Count) { $app = $gutA[0].Groups[1].Value } elseif ($alle.Count) { $app = $alle[0].Groups[1].Value }
$lauf = @(Get-Process -EA SilentlyContinue | Where-Object { $_.Path -and $_.Path -like ($pk.InstallLocation + '\*') })
foreach ($x in $lauf) { try { Stop-Process -Id $x.Id -Force -EA Stop } catch {} }
Zeile ($wahl + ' ' + $pk.Version + ': ' + $(if ($lauf.Count) { 'beendet (' + $lauf.Count + ' Prozess(e))' } else { 'lief nicht' }))
if ($lauf.Count) { Start-Sleep -Seconds 3 }
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$d = Join-Path $env:LOCALAPPDATA ('Packages\' + $pk.PackageFamilyName)
$sich = Join-Path $env:LOCALAPPDATA ('ITAdminTool-Sicherung\' + $pk.PackageFamilyName + '_' + $stamp)
$gesichert = $false
if (Test-Path -LiteralPath $d) {
  New-Item -ItemType Directory -Path $sich -Force | Out-Null
  foreach ($u in 'LocalState', 'Settings', 'RoamingState') { $q = Join-Path $d $u; if (Test-Path -LiteralPath $q) { Copy-Item -LiteralPath $q -Destination $sich -Recurse -Force -EA SilentlyContinue } }
  $bg = Join-Path $d 'LocalCache\Microsoft\MSTeams\Backgrounds'
  if (Test-Path -LiteralPath $bg) { Copy-Item -LiteralPath $bg -Destination $sich -Recurse -Force -EA SilentlyContinue }
  $gesichert = $true
  Zeile ('Sicherung der App-Daten: ' + $sich + ' (' + (Groesse (OrdnerGroesse $sich)) + ')')
}
Reset-AppxPackage -Package $pk.PackageFullName -EA Stop
Zeile ($wahl + ': vorher eingerichtet → jetzt auf Werkszustand zurückgesetzt')
$bgs = Join-Path $sich 'Backgrounds'
if ($wahl -eq 'Neues Teams' -and (Test-Path -LiteralPath $bgs)) {
  $zielBg = Join-Path $d 'LocalCache\Microsoft\MSTeams'
  if (-not (Test-Path -LiteralPath $zielBg)) { New-Item -ItemType Directory -Path $zielBg -Force | Out-Null }
  Copy-Item -LiteralPath $bgs -Destination $zielBg -Recurse -Force -EA SilentlyContinue
  Zeile 'Eigene Hintergrundbilder für Besprechungen: zurückgespielt'
}
if ($app) {
  Start-Sleep -Seconds 2
  Start-Process -FilePath 'explorer.exe' -ArgumentList ('shell:AppsFolder\' + $pk.PackageFamilyName + '!' + $app)
  Zeile ($wahl + ' neu gestartet — der Benutzer meldet sich einmal neu an' + $(if ($wahl -eq 'Xelion') { ' (wie bei der Ersteinrichtung; danach Audiogerät prüfen).' } else { ' (meist automatisch per SSO).' }))
}
if ($gesichert) { Zeile ('Die alten App-Daten bleiben in ' + $sich + ' — nach ein paar Tagen löschbar.') }` }),

  // ══ Click-to-dial: Protokoll-Zuordnungen ════════════════════════════════════
  A({ id: 'tchat-protokolle-anzeigen', titel: 'Telefonie-Links anzeigen: wohin führen tel:, callto:, sip:, msteams:?', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Zeigt für den angemeldeten Benutzer, welches Programm Klicks auf tel:-, callto:-, sip:-, msteams:- und im:-Links öffnet (gespeicherte Auswahl), welche Programme sich dafür angeboten haben (Xelion, Teams, Smartphone-Link …), welche Chat-/Anruf-App Outlook für die Kontaktkarte nutzt und ob eine Richtlinie die Standardzuordnungen bei jeder Anmeldung vorgibt. Ändert nichts.',
    ps: PROTO_PS + String.raw`
NeedHive
function Faehige([string]$pr) {
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($q in @(@('HKLM:\SOFTWARE\RegisteredApplications', 'HKLM:\'), @(($uHive + '\Software\RegisteredApplications'), ($uHive + '\')))) {
    $ra = Get-Item $q[0] -EA SilentlyContinue
    if (-not $ra) { continue }
    foreach ($n in @($ra.GetValueNames())) {
      $rel = [string]$ra.GetValue($n)
      if (-not $rel) { continue }
      $ua = Get-ItemProperty ($q[1] + $rel.TrimStart('\') + '\URLAssociations') -EA SilentlyContinue
      if ($ua -and $ua.$pr) { $nm = $n; if ($nm -match '^@|^AppX') { $nm = ProgName ([string]$ua.$pr) }; if (-not $out.Contains($nm)) { $out.Add($nm) } }
    }
  }
  return @($out)
}
$cls = 'Registry::HKEY_USERS\' + $uSid + '_Classes'
foreach ($pr in 'tel', 'callto', 'sip', 'msteams', 'im') {
  $v = GewaehltFuer $pr
  $fa = @(Faehige $pr)
  $cmd = [string](Get-ItemProperty ('HKLM:\SOFTWARE\Classes\' + $pr + '\shell\open\command') -EA SilentlyContinue).'(default)'
  $ucmd = ''; if ($uSid) { $ucmd = [string](Get-ItemProperty ($cls + '\' + $pr + '\shell\open\command') -EA SilentlyContinue).'(default)' }
  Zeile ($pr + ': ' + $(if ($v) { 'gewählt → ' + (ProgName $v) + ' [' + $v + ']' } else { 'keine eigene Auswahl' }) + $(if ($fa.Count) { ' · angeboten von: ' + ($fa -join ', ') } else { ' · kein Programm hat sich dafür angemeldet' }) + $(if ($ucmd) { ' · Benutzer-Handler: ' + $ucmd } elseif ($cmd) { ' · Computer-Handler: ' + $cmd } else { '' }))
}
$im = Get-ItemProperty ($uHive + '\Software\IM Providers') -EA SilentlyContinue
Zeile ('Chat/Anrufen aus der Outlook-Kontaktkarte (DefaultIMApp): ' + $(if ($im -and $im.DefaultIMApp) { [string]$im.DefaultIMApp } else { 'nicht gesetzt' }))
$x = @(AlleAppx 'XelionWindowsDesktop') | Select-Object -First 1
Zeile ('Xelion installiert: ' + $(if ($x) { [string]$x.Version } else { 'nein' }))
$gp = [string](Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -EA SilentlyContinue).DefaultAssociationsConfiguration
if ($gp) {
  Zeile ('Richtlinie „Standardzuordnungen“: ' + $gp + ' — setzt die Zuordnungen bei jeder Anmeldung neu')
  try { if (Test-Path -LiteralPath $gp) { $xml = [IO.File]::ReadAllText($gp); foreach ($m in [regex]::Matches($xml, '<Association\b[^>]*>')) { $idf = [regex]::Match($m.Value, 'Identifier="([^"]+)"').Groups[1].Value; if ($idf -match '^(tel|callto|sip|msteams|im)$') { Zeile ('  Vorgabe ' + $idf + ' → ' + [regex]::Match($m.Value, 'ApplicationName="([^"]*)"').Groups[1].Value + ' (' + [regex]::Match($m.Value, 'ProgId="([^"]*)"').Groups[1].Value + ')') } } } } catch {}
} else { Zeile 'Keine Richtlinie für Standardzuordnungen — die Auswahl des Benutzers gilt.' }` }),
  A({ id: 'tchat-protokoll-auswahl-zuruecksetzen', titel: 'Gespeicherte Auswahl für tel:/callto:/sip:/msteams:-Links entfernen (Windows fragt neu)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Entfernt die gespeicherte Programmauswahl des Benutzers für einen Linktyp (UserChoice) — z. B. wenn Telefonnummern in Smartphone-Link, Skype oder dem falschen Teams landen. Der alte Wert wird im Profil gesichert. Beim nächsten Klick fragt Windows „Wie möchten Sie das öffnen?“: Xelion (bzw. das gewünschte Programm) wählen und „Immer“ anklicken. Eine Richtlinie für Standardzuordnungen wird gemeldet.',
    param: { label: 'Linktyp', platzhalter: 'tel', pflicht: true, optionen: ['tel', 'callto', 'sip', 'msteams'] },
    ps: String.raw`
NeedHive
$pr = $P.Trim().ToLower()
if ($pr -notin 'tel', 'callto', 'sip', 'msteams') { throw ('Linktyp nicht erlaubt: ' + $P) }
$k = $uHive + '\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\' + $pr
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$n = 0
foreach ($sub in 'UserChoice', 'UserChoiceLatest') {
  $u = $k + '\' + $sub
  if (-not (Test-Path $u)) { continue }
  $alt = [string](Get-ItemProperty $u -EA SilentlyContinue).ProgId
  if (-not $alt) { $alt = [string](Get-ItemProperty ($u + '\ProgId') -EA SilentlyContinue).ProgId }
  $sk = $uHive + '\Software\ITAdminTool\Sicherung\UrlAssociations'
  if (-not (Test-Path $sk)) { New-Item -Path $sk -Force | Out-Null }
  Set-ItemProperty -Path $sk -Name ($pr + '_' + $sub + '_' + $stamp) -Value $alt -Type String
  try { Remove-Item -Path $u -Recurse -Force -EA Stop; $n++; Zeile ($pr + ': ' + $sub + ' vorher „' + $(if ($alt) { $alt } else { '?' }) + '“ → jetzt entfernt (alter Wert gesichert unter Software\ITAdminTool\Sicherung)') }
  catch { Zeile ($pr + ': ' + $sub + ' ließ sich nicht entfernen (' + $_.Exception.Message + ') — der Benutzer wählt selbst unter Einstellungen → Apps → Standard-Apps → Linktyp „' + $pr.ToUpper() + '“.') }
}
if (-not $n) { Zeile ($pr + ': keine gespeicherte Auswahl — Windows fragt bereits bzw. nimmt das registrierte Standardprogramm. Der Benutzer wählt unter Einstellungen → Apps → Standard-Apps → Linktyp „' + $pr.ToUpper() + '“.') }
else { Zeile ('Beim nächsten Klick auf einen ' + $pr + ':-Link fragt Windows „Wie möchten Sie das öffnen?“ → gewünschtes Programm (z. B. Xelion) wählen und „Immer“ anklicken.') }
$gp = [string](Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -EA SilentlyContinue).DefaultAssociationsConfiguration
if ($gp) { Zeile ('Achtung: Die Richtlinie „Standardzuordnungen“ (' + $gp + ') setzt die Zuordnung bei der nächsten Anmeldung wieder — dann muss die Vorgabe in der Richtlinie geändert werden.') }` }),

  // ══ enaio (DMS): Diagnose ═══════════════════════════════════════════════════
  A({ id: 'tchat-enaio-pruefen', titel: 'enaio gründlich prüfen (Programme, Server, Outlook-Add-in, Cache)', modus: 'profil', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Installierte enaio-Programme mit Version (Client, Outlook-/Office-Add-ins), Server laut asinit.cfg des Clients und ob er erreichbar ist (Name, Port), laufende enaio-Prozesse des Benutzers, enaio-Add-ins in Outlook mit Ladeverhalten, von Outlook abgeschaltete Add-ins und die Größe der enaio-Caches im Profil. Ändert nichts.',
    ps: String.raw`
NeedUser
$muster = 'enaio|optimal\s*systems'
$wege = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
if ($uHive) { $wege += ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Uninstall\*') }
$prog = @(Get-ItemProperty $wege -EA SilentlyContinue | Where-Object { ([string]$_.DisplayName -match $muster) -or ([string]$_.Publisher -match $muster) -or ([string]$_.DisplayName -match '^os[ _-].*outlook') } | ForEach-Object { ([string]$_.DisplayName + ' ' + [string]$_.DisplayVersion).Trim() } | Sort-Object -Unique)
Zeile ('Installiert: ' + $(if ($prog.Count) { $prog -join ' · ' } else { 'kein enaio-Programm gefunden (→ Software-Installationen → Enaio)' }))
$cfg = $null
foreach ($lp in 'C:\Program Files (x86)\OPTIMAL SYSTEMS\OSECM\clients\client32\asinit.cfg', 'C:\Program Files\OPTIMAL SYSTEMS\OSECM\clients\client32\asinit.cfg') { if (-not $cfg -and (Test-Path -LiteralPath $lp)) { $cfg = $lp } }
$srvName = 'enaioprod.skf.net'; $srvPort = 4000
if ($cfg) {
  $t = ''; try { $t = [IO.File]::ReadAllText($cfg) } catch {}
  $m = [regex]::Match($t, '(?im)^\s*Comstring\s*=\s*([^\r\n;]+)')
  if ($m.Success) {
    $v = $m.Groups[1].Value.Trim(); Zeile ('Server laut asinit.cfg: ' + $v)
    $tt = @($v -split '#')
    if ($tt[0] -match '^[A-Za-z0-9][A-Za-z0-9._-]*$') { $srvName = $tt[0] }
    if ($tt.Count -gt 1 -and $tt[1] -match '^\d+$') { $srvPort = [int]$tt[1] }
  } else { Zeile ('asinit.cfg ohne „Comstring“: ' + $cfg) }
} else { Zeile 'asinit.cfg des enaio Clients nicht gefunden — geprüft wird der Standard enaioprod.skf.net#4000' }
$ip = ''; try { $ip = (@([System.Net.Dns]::GetHostAddresses($srvName) | Where-Object { $_.AddressFamily -eq 'InterNetwork' }) | Select-Object -First 1).IPAddressToString } catch {}
$ok = $false; $tc = New-Object System.Net.Sockets.TcpClient
try { $ok = $tc.ConnectAsync($srvName, $srvPort).Wait(3000) -and $tc.Connected } catch {} finally { $tc.Close() }
Zeile ('enaio-Server ' + $srvName + ' (' + $(if ($ip) { $ip } else { 'Name NICHT auflösbar' }) + ') Port ' + $srvPort + ': ' + $(if ($ok) { 'erreichbar' } else { 'NICHT erreichbar (Netz/Zscaler/Server)' }))
$lauf = @()
try { $lauf = @(Get-Process -IncludeUserName -EA Stop | Where-Object { $_.Path -match 'OPTIMAL SYSTEMS|enaio' -and $_.UserName -and ((([string]$_.UserName) -split '\\')[-1] -ieq $uName) }) } catch { $lauf = @(Get-Process -EA SilentlyContinue | Where-Object { $_.Path -match 'OPTIMAL SYSTEMS|enaio' }) }
Zeile ('enaio-Prozesse des Benutzers: ' + $(if ($lauf.Count) { (@($lauf | ForEach-Object { $_.ProcessName }) | Select-Object -Unique) -join ', ' } else { 'keine' }))
$ai = @()
foreach ($b in @('HKLM:\SOFTWARE\Microsoft\Office\Outlook\Addins', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\Outlook\Addins', ($uHive + '\Software\Microsoft\Office\Outlook\Addins'))) {
  if (-not $b -or $b -match '^\\') { continue }
  foreach ($k in @(Get-ChildItem $b -EA SilentlyContinue)) {
    $q = Get-ItemProperty $k.PSPath -EA SilentlyContinue
    $kt = $k.PSChildName + ' ' + [string]$q.FriendlyName + ' ' + [string]$q.Description
    if ($kt -match '(?i)enaio|optimal') { $lb = $q.LoadBehavior; $ai += ($k.PSChildName + ': LoadBehavior ' + [string]$lb + $(if ($null -ne $lb -and [int]$lb -ne 3) { ' (wird NICHT beim Start geladen)' } else { '' })) }
  }
}
Zeile ('enaio-Add-ins in Outlook: ' + $(if ($ai.Count) { $ai -join ' · ' } else { 'keine gefunden' }))
if ($uHive) {
  $dis = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Resiliency\DisabledItems'
  if (Test-Path $dis) { $nd = @((Get-Item $dis).GetValueNames()).Count; if ($nd) { Zeile ('Von Outlook abgeschaltete Add-ins: ' + $nd + ' Eintrag/Einträge (→ „Add-ins wieder einschalten“)') } }
}
foreach ($c in @(@('enaio-Cache (lokal)', (Join-Path $uLocal 'enaio')), @('enaio-Cache (servergespeichert)', (Join-Path $uRoam 'enaio')), @('OPTIMAL SYSTEMS (lokal)', (Join-Path $uLocal 'OPTIMAL SYSTEMS')), @('OPTIMAL SYSTEMS (servergespeichert)', (Join-Path $uRoam 'OPTIMAL SYSTEMS')))) { if (Test-Path -LiteralPath $c[1]) { Zeile ($c[0] + ': ' + (Groesse (OrdnerGroesse $c[1]))) } }
$z = Get-Service -Name 'ZSAService' -EA SilentlyContinue; if ($z) { Zeile ('Zscaler-Dienst: ' + $z.Status) }
Zeile 'Rechte, Schränke und Server betreut die enaio-Administration; Neuinstallation über die Kachel „Enaio“.'` }),
]
