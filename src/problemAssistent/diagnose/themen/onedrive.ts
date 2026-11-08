// ── Diagnose-Thema „OneDrive & SharePoint“ ───────────────────────────────────
// od  = OneDrive-Client (Version, Konto, Bibliotheken, Ordnersicherung, Richtlinien, Clouddateien-Treiber,
//       Statussymbole, Autostart, Prozess/CPU, Abstürze, WebClient, SharePoint-Erreichbarkeit)
// odf = Inhalt des OneDrive-/Bibliotheks-Ordners (lokal belegt, nur online, Konflikt-Kopien, Sperrdateien,
//       zu lange Pfade, ungültige Namen) – begrenzt auf 25 000 Einträge
// Alles NUR LESEND (Platzhalter werden nur aufgelistet, nicht heruntergeladen).
import { ja, nein, num, txt, zahl } from '../motor'
import type { DgOber, DgSonde } from '../types'

export const SONDEN_ONEDRIVE: DgSonde[] = [
  {
    id: 'od', titel: 'OneDrive (Version, Konto, Bibliotheken, Ordnersicherung, Richtlinien, Clouddateien)', modus: 'profil', timeoutMs: 90000,
    ps: String.raw`
NeedHive
function TcpOd([string]$h, [int]$port) { try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($h, $port).Wait(3000) -and $t.Connected; $t.Close(); return [bool]$ok } catch { return $false } }
$odExe = @((Join-Path $uLocal 'Microsoft\OneDrive\OneDrive.exe'), 'C:\Program Files\Microsoft OneDrive\OneDrive.exe', ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)') + '\Microsoft OneDrive\OneDrive.exe')) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$ver = $null; $haupt = $null
if ($odExe) { $ver = [string](Get-Item -LiteralPath $odExe -EA SilentlyContinue).VersionInfo.ProductVersion; if ($ver -match '^(\d+)\.') { $haupt = [int]$Matches[1] } }
Fakt 'installiert' ([bool]$odExe); Fakt 'version' $ver; Fakt 'versionHaupt' $haupt
Punkt 'OneDrive-Programm' $(if (-not $odExe) { 'fehler' } elseif ($null -ne $haupt -and $haupt -lt 24) { 'warn' } else { 'ok' }) $(if ($odExe) { 'Version ' + $ver + $(if ($null -ne $haupt -and $haupt -lt 24) { ' – veraltet' } else { '' }) } else { 'nicht installiert' })
$acc = $uHive + '\Software\Microsoft\OneDrive\Accounts\Business1'
$a = Get-ItemProperty -LiteralPath $acc -EA SilentlyContinue
$mail = $(if ($a) { [string]$a.UserEmail } else { '' })
$ordner = $(if ($a) { [string]$a.UserFolder } else { '' })
Fakt 'eingerichtet' ([bool]$mail); Fakt 'konto' $(if ($mail) { $mail } else { $null }); Fakt 'ordner' $(if ($ordner) { $ordner } else { $null })
$ordnerDa = $(if ($ordner) { Test-Path -LiteralPath $ordner } else { $false })
Fakt 'ordnerDa' $ordnerDa
Fakt 'ordnerZweit' ($ordner -match '\(\d+\)\s*$' -or ($ordner -and $ordner -match ('(?i)' + [regex]::Escape($env:COMPUTERNAME) + '$')))
Punkt 'Geschäftskonto (OneDrive – Firma)' $(if ($mail -and $ordnerDa) { 'ok' } else { 'fehler' }) $(if (-not $mail) { 'NICHT eingerichtet' } elseif (-not $ordnerDa) { $mail + ' – Ordner ' + $ordner + ' FEHLT' } else { $mail + ' → ' + $ordner })
$pm = [string](Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\OneDrive\Accounts\Personal') -Name UserEmail -EA SilentlyContinue).UserEmail
Fakt 'privat' ([bool]$pm)
if ($pm) { Punkt 'Privates OneDrive' 'warn' ('zusätzlich verbunden: ' + $pm) }
$bib = @()
foreach ($tk in @(Get-ChildItem -LiteralPath ($acc + '\Tenants') -EA SilentlyContinue)) { foreach ($pn in @($tk.Property)) { if ($pn -match '^[A-Za-z]:\\' -and $pn -ne $ordner -and $bib -notcontains $pn) { $bib += $pn } } }
$fehlen = @($bib | Where-Object { -not (Test-Path -LiteralPath $_) })
Fakt 'bibliotheken' $bib.Count; Fakt 'bibliothekenFehlen' $fehlen.Count; Fakt 'bibliothekPfade' @($bib | Select-Object -First 15)
Punkt 'Synchronisierte Bibliotheken (Teams/SharePoint)' $(if ($fehlen.Count) { 'warn' } else { 'ok' }) ('' + $bib.Count + ' eingetragen' + $(if ($fehlen.Count) { ', davon ' + $fehlen.Count + ' Ordner FEHLEN: ' + ((@($fehlen | Select-Object -First 3)) -join ', ') } else { '' }))
$pol = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\OneDrive' -EA SilentlyContinue
$ngsc = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\OneDrive' -Name DisableFileSyncNGSC -EA SilentlyContinue).DisableFileSyncNGSC
$erlaubt = @((Get-Item -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\OneDrive\AllowTenantList' -EA SilentlyContinue).Property).Count
Fakt 'syncVerboten' ($ngsc -eq 1); Fakt 'stillAnmelden' ($pol -and $pol.SilentAccountConfig -eq 1); Fakt 'ordnerSicherungRichtlinie' ($pol -and [bool]$pol.KFMSilentOptIn); Fakt 'mandantenListe' $erlaubt
Punkt 'Richtlinien' $(if ($ngsc -eq 1) { 'fehler' } else { 'info' }) $(if ($ngsc -eq 1) { 'OneDrive-Synchronisierung per Richtlinie VERBOTEN' } else { 'Automatische Anmeldung: ' + $(if ($pol -and $pol.SilentAccountConfig -eq 1) { 'ja' } else { 'nein' }) + ', Ordnersicherung erzwungen: ' + $(if ($pol -and $pol.KFMSilentOptIn) { 'ja' } else { 'nein' }) + $(if ($erlaubt) { ', nur ' + $erlaubt + ' erlaubte(r) Mandant(en)' } else { '' }) })
$usf = Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') -EA SilentlyContinue
$desk = ''; $dok = ''
if ($usf) { $desk = ([string]$usf.Desktop) -replace '(?i)%USERPROFILE%', $uProf; $dok = ([string]$usf.Personal) -replace '(?i)%USERPROFILE%', $uProf }
$deskOd = ($ordner -and $desk -and $desk.StartsWith($ordner, [StringComparison]::OrdinalIgnoreCase))
$dokOd = ($ordner -and $dok -and $dok.StartsWith($ordner, [StringComparison]::OrdinalIgnoreCase))
Fakt 'desktopInOneDrive' ([bool]$deskOd); Fakt 'dokumenteInOneDrive' ([bool]$dokOd); Fakt 'dokumenteNetz' ($dok -match '^\\\\'); Fakt 'dokumentePfad' $(if ($dok) { $dok } else { $null })
$fremdOd = ($desk -match '(?i)\\OneDrive' -and -not $deskOd) -or ($dok -match '(?i)\\OneDrive' -and -not $dokOd)
Fakt 'ordnerSicherungAlt' ([bool]$fremdOd)
Punkt 'Ordnersicherung (Desktop/Dokumente)' $(if ($dok -match '^\\\\' -or $fremdOd) { 'warn' } else { 'info' }) ('Desktop: ' + $(if ($deskOd) { 'in OneDrive' } else { $desk }) + ' · Dokumente: ' + $(if ($dokOd) { 'in OneDrive' } else { $dok }))
$cf = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\CldFlt' -Name Start -EA SilentlyContinue
$cfStart = $(if ($cf) { [int]$cf.Start } else { $null })
$cfState = [string](Get-CimInstance Win32_SystemDriver -Filter "Name='CldFlt'" -EA SilentlyContinue).State
Fakt 'cldfltStart' $cfStart; Fakt 'cldflt' $(if ($cfState) { $cfState } else { $null })
Punkt 'Clouddateien-Treiber (Dateien bei Bedarf)' $(if ($cfStart -eq 4 -or ($cfState -and $cfState -ne 'Running')) { 'fehler' } elseif ($null -eq $cfStart) { 'warn' } else { 'ok' }) $(if ($null -eq $cfStart) { 'Treiber CldFlt fehlt' } elseif ($cfStart -eq 4) { 'DEAKTIVIERT' } else { $(if ($cfState) { $cfState } else { 'Startart ' + $cfStart }) })
$ov = @((Get-Item -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\ShellIconOverlayIdentifiers' -EA SilentlyContinue).GetSubKeyNames() | Sort-Object)
$pos = 0; for ($i = 0; $i -lt $ov.Count; $i++) { if ($ov[$i] -match '(?i)OneDrive') { $pos = $i + 1; break } }
Fakt 'overlayAnzahl' $ov.Count; Fakt 'overlayPosition' $pos
Punkt 'Statussymbole im Explorer' $(if ($pos -gt 15) { 'warn' } elseif ($pos) { 'ok' } else { 'info' }) $(if ($pos) { 'OneDrive an Stelle ' + $pos + ' von ' + $ov.Count + $(if ($pos -gt 15) { ' – Windows zeigt nur 15, Haken/Wolken fehlen' } else { '' }) } else { 'keine OneDrive-Symbole registriert' })
$run = (Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Run') -Name OneDrive -EA SilentlyContinue).OneDrive
$appr = (Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run') -Name OneDrive -EA SilentlyContinue).OneDrive
$deakt = ($appr -is [byte[]] -and $appr.Length -gt 0 -and ($appr[0] % 2) -eq 1)
Fakt 'autostart' ([bool]$run -and -not $deakt)
Punkt 'Autostart mit Windows' $(if ($run -and -not $deakt) { 'ok' } else { 'warn' }) $(if (-not $run) { 'kein Autostart-Eintrag' } elseif ($deakt) { 'im Task-Manager deaktiviert' } else { 'an' })
$op = $null
try { $op = @(UserProcs @('OneDrive')) } catch { $op = $null }
if ($null -ne $op) {
  $cpu = 0.0
  if ($op.Count) {
    $c1 = 0.0; foreach ($x in $op) { $c1 += [double]$x.TotalProcessorTime.TotalSeconds }
    Start-Sleep -Seconds 2
    $c2 = 0.0; foreach ($x in @(Get-Process -Id @($op | ForEach-Object { $_.Id }) -EA SilentlyContinue)) { $c2 += [double]$x.TotalProcessorTime.TotalSeconds }
    $cpu = [math]::Round(100 * ($c2 - $c1) / 2 / [Environment]::ProcessorCount, 1)
    if ($cpu -lt 0) { $cpu = 0 }
  }
  Fakt 'laeuft' ($op.Count -gt 0); Fakt 'prozesse' $op.Count; Fakt 'cpuProzent' $cpu
  Punkt 'Läuft gerade' $(if (-not $op.Count) { 'fehler' } elseif ($op.Count -gt 1 -or $cpu -ge 25) { 'warn' } else { 'ok' }) $(if ($op.Count) { '' + $op.Count + ' OneDrive-Prozess(e), CPU ' + $cpu + ' %' } else { 'OneDrive läuft NICHT' })
} else { Punkt 'OneDrive-Prozess' 'info' 'nicht lesbar (Adminrechte nötig)' }
$ab = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue | Where-Object { $_.Message -match '(?i)onedrive\.exe' }).Count
Fakt 'abstuerze7' $ab
Punkt 'Abstürze (7 Tage)' $(if ($ab -ge 2) { 'fehler' } elseif ($ab) { 'warn' } else { 'ok' }) ('' + $ab + ' Absturz/Abstürze von OneDrive')
$wc = Get-Service -Name WebClient -EA SilentlyContinue
Fakt 'webclientStart' $(if ($wc) { [string]$wc.StartType } else { $null })
Punkt 'WebClient-Dienst („Im Explorer öffnen“)' $(if ($wc -and [string]$wc.StartType -ne 'Disabled') { 'ok' } else { 'warn' }) $(if ($wc) { [string]$wc.Status + ' (' + [string]$wc.StartType + ')' } else { 'nicht vorhanden' })
$spHost = $null
if ($a -and [string]$a.SPOResourceId -match '^https://([^/]+)') { $spHost = $Matches[1] }
if (-not $spHost) { $spHost = 'login.microsoftonline.com' }
$spOk = TcpOd $spHost 443
Fakt 'spHost' $spHost; Fakt 'spErreichbar' $spOk
Punkt 'SharePoint/OneDrive-Dienst erreichbar' $(if ($spOk) { 'ok' } else { 'fehler' }) ($spHost + ':443' + $(if ($spOk) { '' } else { ' NICHT erreichbar' }))
`,
  },
  {
    id: 'odf', titel: 'Inhalt der OneDrive-Ordner (lokal belegt, Konflikte, Sperrdateien, Pfadlängen)', modus: 'profil', timeoutMs: 150000,
    ps: String.raw`
NeedHive
$acc = $uHive + '\Software\Microsoft\OneDrive\Accounts\Business1'
$ordner = [string](Get-ItemProperty -LiteralPath $acc -Name UserFolder -EA SilentlyContinue).UserFolder
$wurzeln = @()
if ($ordner -and (Test-Path -LiteralPath $ordner)) { $wurzeln += $ordner }
foreach ($tk in @(Get-ChildItem -LiteralPath ($acc + '\Tenants') -EA SilentlyContinue)) {
  foreach ($pn in @($tk.Property)) { if ($pn -match '^[A-Za-z]:\\' -and (Test-Path -LiteralPath $pn) -and $wurzeln -notcontains $pn -and -not ($ordner -and $pn.StartsWith($ordner, [StringComparison]::OrdinalIgnoreCase))) { $wurzeln += $pn } }
}
Fakt 'gescannt' ($wurzeln.Count -gt 0)
if (-not $wurzeln.Count) {
  Punkt 'OneDrive-Ordner' 'info' 'kein OneDrive- bzw. Bibliotheksordner vorhanden – nichts zu prüfen'
} else {
  $max = 25000; $n = 0; $dat = 0; $lokal = 0.0; $online = 0; $lang = 0; $konf = @(); $sperr = @(); $ungueltig = @(); $konfN = 0; $sperrN = 0
  $rx = '(?i)-' + [regex]::Escape($env:COMPUTERNAME) + '(-\d+)?(\.[^.\\]+)?$'
  foreach ($w in $wurzeln) {
    if ($n -ge $max) { break }
    foreach ($it in @(Get-ChildItem -LiteralPath $w -Recurse -Force -EA SilentlyContinue | Select-Object -First ($max - $n))) {
      $n++
      $nm = [string]$it.Name
      if ($it.FullName.Length -ge 250) { $lang++ }
      if ($nm -match '^\s|[\s.]$' -or $nm -match '(?i)_vti_' -or $nm -match '^(?i:CON|PRN|AUX|NUL|COM\d|LPT\d)(\..*)?$') { if ($ungueltig.Count -lt 5) { $ungueltig += $nm } }
      if ($it.PSIsContainer) { continue }
      $dat++
      $attr = [int64]$it.Attributes
      if (($attr -band 0x400000) -or ($attr -band 0x1000)) { $online++ } else { $lokal += [double]$it.Length }
      if ($nm.StartsWith('~$')) { $sperrN++; if ($sperr.Count -lt 5) { $sperr += $nm } }
      elseif ($it.BaseName -match $rx -or $nm -match $rx) { $konfN++; if ($konf.Count -lt 5) { $konf += $nm } }
    }
  }
  $lokalGB = [math]::Round($lokal / 1GB, 1)
  Fakt 'eintraege' $n; Fakt 'dateien' $dat; Fakt 'gekuerzt' ($n -ge $max); Fakt 'lokalGB' $lokalGB; Fakt 'nurOnline' $online
  Fakt 'langePfade' $lang; Fakt 'ungueltigeNamen' @($ungueltig).Count; Fakt 'konflikte' $konfN; Fakt 'konfliktBeispiele' @($konf); Fakt 'sperrdateien' $sperrN; Fakt 'sperrBeispiele' @($sperr)
  Punkt 'Geprüfte Ordner' 'info' ('' + $wurzeln.Count + ' Ordner, ' + $n + ' Einträge' + $(if ($n -ge $max) { ' (nach ' + $max + ' abgebrochen)' } else { '' }))
  Punkt 'Platz auf C: durch OneDrive' $(if ($lokalGB -ge 20) { 'warn' } else { 'ok' }) ('' + $lokalGB + ' GB lokal gespeichert, ' + $online + ' Datei(en) nur online')
  Punkt 'Konflikt-Kopien (Rechnername im Dateinamen)' $(if ($konfN) { 'warn' } else { 'ok' }) $(if ($konfN) { ($konf -join ', ') } else { 'keine' })
  Punkt 'Office-Sperrdateien (~$…)' $(if ($sperrN) { 'warn' } else { 'ok' }) $(if ($sperrN) { ($sperr -join ', ') } else { 'keine' })
  Punkt 'Pfade/Namen' $(if ($lang -or $ungueltig.Count) { 'warn' } else { 'ok' }) ('' + $lang + ' Pfad(e) ab 250 Zeichen' + $(if ($ungueltig.Count) { ', ungültige Namen: ' + ($ungueltig -join ', ') } else { '' }))
}
`,
  },
]

export const THEMEN_ONEDRIVE: DgOber[] = [
  {
    id: 'onedrive', titel: 'OneDrive & SharePoint', symbol: 'Cloud', beschreibung: 'OneDrive synchronisiert nicht, rotes X, nicht eingerichtet, Speicher voll, SharePoint-Zugriff, doppelte Dateien, Teams-Ordner im Explorer',
    unter: [
      {
        id: 'od-sync', titel: 'OneDrive synchronisiert nicht (rotes X, „ausstehend“)', beschreibung: 'Wolke zeigt rotes X oder Pause, Dateien bleiben bei „Synchronisierung ausstehend“, Kollegen sehen meine Änderungen nicht',
        sonden: ['od', 'odf', 'net', 'sys'],
        regeln: [
          { id: 'laeuft-nicht', wenn: f => ja(f['od.eingerichtet']) && nein(f['od.laeuft']), befund: () => 'OneDrive läuft gerade nicht', problem: 'onedrive-startet-nicht-absturz', schwere: 3 },
          { id: 'cldflt', wenn: f => num(f['od.cldfltStart']) === 4 || (f['od.cldflt'] != null && txt(f['od.cldflt']) !== 'Running'), befund: f => `Clouddateien-Treiber (CldFlt) läuft nicht (${txt(f['od.cldflt']) || 'deaktiviert'})`, problem: 'onedrive-clouddateianbieter-0x8007016a', schwere: 3 },
          { id: 'verboten', wenn: f => ja(f['od.syncVerboten']), befund: () => 'OneDrive-Synchronisierung ist auf diesem PC per Richtlinie verboten', problem: 'od-geraet-ohne-domaene-sync-verboten', schwere: 3 },
          { id: 'kein-internet', wenn: f => nein(f['net.internet443']), befund: () => 'Der PC kommt nicht ins Internet', problem: 'netz-kein-internet-verbunden', schwere: 3 },
          { id: 'sp-weg', wenn: f => nein(f['od.spErreichbar']) && ja(f['net.internet443']), befund: f => `Internet geht, aber ${txt(f['od.spHost'])} ist nicht erreichbar`, problem: 'onedrive-verbindung-fehler-0x8004de40', schwere: 2 },
          { id: 'namen', wenn: f => num(f['odf.langePfade']) > 0 || num(f['odf.ungueltigeNamen']) > 0, befund: f => `${f['odf.langePfade']} zu lange(r) Pfad(e), ${f['odf.ungueltigeNamen']} ungültige(r) Name(n) im OneDrive`, problem: 'onedrive-ungueltiger-name-pfad', schwere: 2 },
          { id: 'veraltet', wenn: f => num(f['od.versionHaupt']) < 24, befund: f => `OneDrive ist veraltet (Version ${txt(f['od.version'])})`, problem: 'onedrive-version-veraltet', schwere: 2 },
          { id: 'platte', wenn: f => num(f['sys.cFreiGB']) < 3, befund: f => `Laufwerk C: hat nur noch ${zahl(f['sys.cFreiGB'])} GB frei`, problem: 'onedrive-c-voll', schwere: 2 },
        ],
        ohneBefund: ['od-rotes-x-synchronisierungsprobleme', 'onedrive-sync-ausstehend', 'onedrive-sync-angehalten', 'od-aenderungen-werden-verarbeitet-haengt'],
      },
      {
        id: 'od-einrichtung', titel: 'OneDrive ist nicht eingerichtet oder fragt nach Anmeldung', beschreibung: 'Keine Wolke in der Taskleiste, „OneDrive einrichten“ erscheint, Anmeldung kommt immer wieder, OneDrive-Ordner fehlt',
        sonden: ['od', 'aad', 'net'],
        regeln: [
          { id: 'fehlt', wenn: f => nein(f['od.installiert']), befund: () => 'OneDrive ist auf diesem PC nicht installiert', problem: 'od-nicht-eingerichtet', schwere: 3 },
          { id: 'nicht-eingerichtet', wenn: f => ja(f['od.installiert']) && nein(f['od.eingerichtet']), befund: () => 'OneDrive ist installiert, aber das Firmenkonto ist nicht eingerichtet', problem: 'od-nicht-eingerichtet', schwere: 3 },
          { id: 'ordner-weg', wenn: f => ja(f['od.eingerichtet']) && nein(f['od.ordnerDa']), befund: f => `Der OneDrive-Ordner ${txt(f['od.ordner'])} existiert nicht mehr`, problem: 'od-ordner-entfernt-verschoben', schwere: 3 },
          { id: 'kein-prt', wenn: f => nein(f['aad.prt']), befund: () => 'Das Anmeldetoken (PRT) fehlt – OneDrive kann sich nicht automatisch anmelden', problem: 'onedrive-anmeldung-staendig', schwere: 3 },
          { id: 'abstuerze', wenn: f => num(f['od.abstuerze7']) >= 2, befund: f => `OneDrive ist in 7 Tagen ${f['od.abstuerze7']}× abgestürzt`, problem: 'onedrive-startet-nicht-absturz', schwere: 2 },
          { id: 'autostart', wenn: f => ja(f['od.eingerichtet']) && nein(f['od.autostart']), befund: () => 'OneDrive startet nicht automatisch mit Windows', problem: 'od-autostart-aus', schwere: 2 },
          { id: 'dokumente-netz', wenn: f => ja(f['od.dokumenteNetz']), befund: f => `„Dokumente“ zeigt auf ein Netzlaufwerk (${txt(f['od.dokumentePfad'])})`, problem: 'onedrive-dokumente-netzlaufwerk-umleitung', schwere: 2 },
          { id: 'alter-ordner', wenn: f => ja(f['od.ordnerSicherungAlt']), befund: () => 'Desktop/Dokumente zeigen in einen anderen (alten) OneDrive-Ordner', problem: 'od-desktop-alter-onedrive-ordner', schwere: 2 },
        ],
        ohneBefund: ['od-nicht-eingerichtet', 'onedrive-anmeldung-staendig', 'od-anmeldung-fehlercode', 'od-anmeldefenster-weiss'],
      },
      {
        id: 'od-speicher', titel: 'Speicher voll oder Dateien nur online', beschreibung: 'Laufwerk C: läuft voll, „OneDrive-Speicher voll“, Dateien öffnen sich unterwegs nicht',
        sonden: ['od', 'odf', 'sys'],
        fragen: [
          { id: 'kontingent', text: 'Meldet OneDrive „Speicher voll“ bzw. „Kontingent erreicht“?' },
          { id: 'unterwegs', text: 'Gehen Dateien ohne Internet (unterwegs) nicht auf?' },
        ],
        regeln: [
          { id: 'c-voll', wenn: f => num(f['sys.cFreiGB']) < 10 && num(f['odf.lokalGB']) >= 5, befund: f => `C: hat nur ${zahl(f['sys.cFreiGB'])} GB frei, OneDrive belegt davon ${zahl(f['odf.lokalGB'])} GB`, problem: 'onedrive-c-voll', schwere: 3 },
          { id: 'kontingent', wenn: f => f['frage.kontingent'] === 'ja', befund: () => 'Der OneDrive-Speicherplatz in der Cloud ist laut Meldung voll', problem: 'onedrive-cloudspeicher-voll', schwere: 3 },
          { id: 'cldflt', wenn: f => num(f['od.cldfltStart']) === 4 || (f['od.cldflt'] != null && txt(f['od.cldflt']) !== 'Running'), befund: f => `Clouddateien-Treiber (CldFlt) läuft nicht (${txt(f['od.cldflt']) || 'deaktiviert'}) – „Dateien bei Bedarf“ geht nicht`, problem: 'onedrive-clouddateianbieter-0x8007016a', schwere: 3 },
          { id: 'nur-online', wenn: f => f['frage.unterwegs'] === 'ja' && num(f['odf.nurOnline']) > 0, befund: f => `${f['odf.nurOnline']} Datei(en) liegen nur online (nicht auf dem PC)`, problem: 'onedrive-nur-online-offline', schwere: 3 },
          { id: 'viel-lokal', wenn: f => num(f['odf.lokalGB']) >= 20, befund: f => `OneDrive hält ${zahl(f['odf.lokalGB'])} GB lokal auf dem PC`, problem: 'od-speicher-freigeben-wirkt-nicht', schwere: 1 },
          { id: 'platte', wenn: f => num(f['sys.cFreiGB']) < 5, befund: f => `Laufwerk C: hat nur noch ${zahl(f['sys.cFreiGB'])} GB frei`, problem: 'leistung-festplatte-voll', schwere: 2 },
        ],
        ohneBefund: ['onedrive-c-voll', 'onedrive-cloudspeicher-voll', 'onedrive-nur-online-offline', 'od-speicher-freigeben-wirkt-nicht'],
      },
      {
        id: 'od-sharepoint', titel: 'SharePoint: Zugriff verweigert oder Seite lädt nicht', beschreibung: '„Sie benötigen Zugriff“, „Zugriff nur im Browser“, SharePoint-Seite bleibt weiß, „Im Explorer öffnen“ geht nicht',
        sonden: ['od', 'aad', 'net'],
        regeln: [
          { id: 'nicht-entra', wenn: f => nein(f['aad.entraJoined']), befund: () => 'Der PC ist nicht in Entra ID – SharePoint erlaubt dann oft nur den Browser', problem: 'od-nur-browser-nicht-verwaltetes-geraet', schwere: 3 },
          { id: 'kein-prt', wenn: f => nein(f['aad.prt']), befund: () => 'Das Anmeldetoken (PRT) fehlt – Office/SharePoint fragen nach Anmeldung', problem: 'od-office-fragt-kennwort-sharepoint', schwere: 2 },
          { id: 'kein-internet', wenn: f => nein(f['net.internet443']), befund: () => 'Der PC kommt nicht ins Internet', problem: 'netz-kein-internet-verbunden', schwere: 3 },
          { id: 'sp-weg', wenn: f => nein(f['od.spErreichbar']), befund: f => `${txt(f['od.spHost'])} ist vom PC aus nicht erreichbar`, problem: 'onedrive-sharepoint-seite-weiss', schwere: 3 },
          { id: 'zscaler-aus', wenn: f => ja(f['net.zscalerInstalliert']) && f['net.zscalerDienst'] != null && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])})`, problem: 'onedrive-sharepoint-seite-weiss', schwere: 2 },
          { id: 'webclient', wenn: f => txt(f['od.webclientStart']) === 'Disabled' || f['od.webclientStart'] === null, befund: f => f['od.webclientStart'] === null ? 'WebClient-Dienst fehlt – „Im Explorer öffnen“ geht nicht' : 'WebClient-Dienst ist deaktiviert – „Im Explorer öffnen“ geht nicht', problem: 'onedrive-im-explorer-oeffnen', schwere: 2 },
          { id: 'privat', wenn: f => ja(f['od.privat']), befund: () => 'Zusätzlich ist ein privates OneDrive-Konto angemeldet', problem: 'od-web-privates-konto', schwere: 1 },
        ],
        ohneBefund: ['onedrive-sharepoint-zugriff-verweigert', 'od-neu-im-team-kein-zugriff', 'od-zugriffsanfrage-keine-antwort', 'od-desktop-app-keine-berechtigung'],
      },
      {
        id: 'od-konflikte', titel: 'Konflikte, doppelte Dateien oder Datei gesperrt', beschreibung: 'Dateien doppelt mit Rechnername, „Upload fehlgeschlagen“, Datei „ist geöffnet“, gelöschte Dateien kommen zurück',
        sonden: ['od', 'odf'],
        fragen: [{ id: 'fremdpc', text: 'Zeigt der Desktop Dateien oder Symbole eines anderen PCs?' }],
        regeln: [
          { id: 'konflikte', wenn: f => num(f['odf.konflikte']) > 0, befund: f => `${f['odf.konflikte']} Konflikt-Kopie(n) mit Rechnername gefunden (z. B. ${txt(f['odf.konfliktBeispiele'])})`, problem: 'onedrive-dateien-doppelt-rechnername', schwere: 3 },
          { id: 'sperr', wenn: f => num(f['odf.sperrdateien']) > 0, befund: f => `${f['odf.sperrdateien']} Office-Sperrdatei(en) im OneDrive (z. B. ${txt(f['odf.sperrBeispiele'])})`, problem: 'onedrive-datei-wird-verwendet', schwere: 2 },
          { id: 'zweiter-ordner', wenn: f => ja(f['od.ordnerZweit']), befund: f => `OneDrive nutzt einen zweiten Ordner (${txt(f['od.ordner'])})`, problem: 'onedrive-zweiter-ordner', schwere: 3 },
          { id: 'zwei-prozesse', wenn: f => num(f['od.prozesse']) >= 2, befund: f => `OneDrive läuft ${f['od.prozesse']}× gleichzeitig`, problem: 'od-zwei-wolken', schwere: 2 },
          { id: 'fremd-desktop', wenn: f => f['frage.fremdpc'] === 'ja' && ja(f['od.desktopInOneDrive']), befund: () => 'Der Desktop liegt im OneDrive und wird mit einem anderen PC geteilt', problem: 'od-desktop-fremde-symbole', schwere: 3 },
          { id: 'cpu', wenn: f => num(f['od.cpuProzent']) >= 25, befund: f => `OneDrive belastet die CPU mit ${zahl(f['od.cpuProzent'])} %`, problem: 'onedrive-sync-langsam-cpu', schwere: 1 },
        ],
        ohneBefund: ['onedrive-dateien-doppelt-rechnername', 'od-office-upload-konflikt', 'onedrive-gemeinsam-bearbeiten-gesperrt', 'od-geloeschte-dateien-kommen-zurueck'],
      },
      {
        id: 'od-teamsordner', titel: 'Teams-/SharePoint-Ordner im Explorer (Synchronisieren, Verknüpfungen)', beschreibung: '„Synchronisieren“ tut nichts, Teams-Ordner fehlt im Explorer, Verknüpfung zeigt Fehler, keine grünen Haken',
        sonden: ['od', 'odf'],
        fragen: [
          { id: 'pctausch', text: 'Ist das ein neuer bzw. getauschter PC?' },
          { id: 'fremdfirma', text: 'Gehört die Bibliothek einer anderen Firma (Kunde, Lieferant)?' },
        ],
        regeln: [
          { id: 'nicht-eingerichtet', wenn: f => nein(f['od.eingerichtet']), befund: () => 'OneDrive ist nicht mit dem Firmenkonto eingerichtet – ohne das klappt „Synchronisieren“ nicht', problem: 'od-nicht-eingerichtet', schwere: 3 },
          { id: 'verboten', wenn: f => ja(f['od.syncVerboten']), befund: () => 'OneDrive-Synchronisierung ist per Richtlinie verboten', problem: 'od-geraet-ohne-domaene-sync-verboten', schwere: 3 },
          { id: 'laeuft-nicht', wenn: f => ja(f['od.eingerichtet']) && nein(f['od.laeuft']), befund: () => 'OneDrive läuft gerade nicht – „Synchronisieren“ kommt nicht an', problem: 'onedrive-sharepoint-sync-geht-nicht', schwere: 3 },
          { id: 'ordner-fehlen', wenn: f => num(f['od.bibliothekenFehlen']) > 0, befund: f => `${f['od.bibliothekenFehlen']} synchronisierte Bibliothek(en) eingetragen, deren Ordner fehlt`, problem: 'onedrive-verknuepfung-ordner-fehlt', schwere: 2 },
          { id: 'pc-tausch', wenn: f => f['frage.pctausch'] === 'ja' && num(f['od.bibliotheken']) === 0, befund: () => 'Auf diesem PC ist noch keine Teams-/SharePoint-Bibliothek synchronisiert', problem: 'od-bibliotheken-nach-pc-tausch', schwere: 3 },
          { id: 'symbole', wenn: f => num(f['od.overlayPosition']) > 15, befund: f => `OneDrive-Statussymbole stehen an Stelle ${f['od.overlayPosition']} – Windows zeigt nur 15`, problem: 'onedrive-statussymbole-fehlen', schwere: 2 },
          { id: 'mandant', wenn: f => f['frage.fremdfirma'] === 'ja' && num(f['od.mandantenListe']) > 0, befund: f => `Per Richtlinie sind nur ${f['od.mandantenListe']} Mandant(en) zum Synchronisieren erlaubt – Bibliotheken anderer Firmen sind gesperrt`, problem: 'od-andere-organisation-blockiert', schwere: 3 },
        ],
        ohneBefund: ['onedrive-sharepoint-sync-geht-nicht', 'teams-kanal-synchronisieren', 'onedrive-verknuepfung-ordner-fehlt', 'od-synchronisieren-knopf-fehlt'],
      },
    ],
  },
]
