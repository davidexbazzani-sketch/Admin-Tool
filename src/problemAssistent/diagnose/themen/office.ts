// ── Diagnose-Thema „Office (Word, Excel, PowerPoint)“ ────────────────────────
// of  = Office-Installation (Click-to-Run, Dienst, Kanal, Sprachpakete, Abstürze, Office-Meldungen, Grafiktreiber)
// ofu = Office des angemeldeten Benutzers (Konten, Lizenzdateien, Add-ins, Makro-/Dateiblock-Einstellungen,
//       Vorlagen, Wiederherstellungsdateien, Sprache, laufende Programme)
// Alles NUR LESEND. Makro-Sperren werden nur FESTGESTELLT, nie gelockert.
import { ja, liste, nein, num, txt, zahl } from '../motor'
import type { DgOber, DgSonde, DgWert } from '../types'

export const SONDEN_OFFICE: DgSonde[] = [
  {
    id: 'of', titel: 'Office-Installation (Click-to-Run, Dienst, Sprachen, Abstürze, Office-Meldungen)', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
$c2r = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration' -EA SilentlyContinue
$root = @('C:\Program Files\Microsoft Office\root\Office16', 'C:\Program Files (x86)\Microsoft Office\root\Office16') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$progs = @()
if ($root) { foreach ($e in @('WINWORD', 'EXCEL', 'POWERPNT', 'OUTLOOK')) { if (Test-Path -LiteralPath (Join-Path $root ($e + '.EXE'))) { $progs += $e } } }
Fakt 'installiert' ($progs.Count -gt 0); Fakt 'programme' @($progs)
Fakt 'version' $(if ($c2r) { [string]$c2r.VersionToReport } else { $null })
Fakt 'plattform' $(if ($c2r) { [string]$c2r.Platform } else { $null })
Fakt 'produkte' $(if ($c2r) { [string]$c2r.ProductReleaseIds } else { $null })
Punkt 'Microsoft 365 Apps (Click-to-Run)' $(if ($progs.Count) { 'ok' } else { 'fehler' }) $(if ($progs.Count) { ($progs -join ', ') + $(if ($c2r) { ' – Version ' + $c2r.VersionToReport + ' (' + $c2r.Platform + ')' } else { '' }) } else { 'Word/Excel/PowerPoint nicht gefunden' })
$kanalUrl = ''
if ($c2r) { $kanalUrl = [string]$c2r.UpdateChannel; if (-not $kanalUrl) { $kanalUrl = [string]$c2r.CDNBaseUrl } }
$kanal = $null
if ($kanalUrl -match '492350f6') { $kanal = 'Aktueller Kanal' } elseif ($kanalUrl -match '55336b82') { $kanal = 'Monatlicher Enterprise-Kanal' } elseif ($kanalUrl -match '7ffbc6bf') { $kanal = 'Halbjährlicher Enterprise-Kanal' } elseif ($kanalUrl -match 'b8f9b850') { $kanal = 'Halbjährlich (Vorschau)' } elseif ($kanalUrl -match '64256afe') { $kanal = 'Aktueller Kanal (Vorschau)' } elseif ($kanalUrl -match '5440fd1f') { $kanal = 'Beta' }
Fakt 'kanal' $kanal
$updPol = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\office\16.0\common\officeupdate' -Name enableautomaticupdates -EA SilentlyContinue).enableautomaticupdates
$updAus = ($c2r -and [string]$c2r.UpdatesEnabled -eq 'False') -or ($updPol -eq 0)
Fakt 'updatesAus' $updAus
if ($c2r) { Punkt 'Update-Kanal' $(if ($updAus) { 'warn' } else { 'info' }) ($(if ($kanal) { $kanal } else { 'unbekannt' }) + $(if ($updAus) { ' – automatische Updates AUS' } else { '' })) }
$shared = ($c2r -and [string]$c2r.SharedComputerLicensing -eq '1')
Fakt 'sharedComputer' $shared
if ($shared) { Punkt 'Lizenzmodus' 'info' 'Aktivierung für gemeinsam genutzte Computer (Shared Computer Activation)' }
$svc = Get-Service -Name ClickToRunSvc -EA SilentlyContinue
Fakt 'c2rDienst' $(if ($svc) { [string]$svc.Status } else { $null }); Fakt 'c2rStart' $(if ($svc) { [string]$svc.StartType } else { $null })
if ($progs.Count -or $svc) { Punkt 'Office-Klick-und-Los-Dienst' $(if ($svc -and $svc.Status -eq 'Running') { 'ok' } elseif ($svc -and [string]$svc.StartType -eq 'Disabled') { 'fehler' } elseif ($svc) { 'warn' } else { 'fehler' }) $(if ($svc) { [string]$svc.Status + ' (' + [string]$svc.StartType + ')' } else { 'Dienst ClickToRunSvc fehlt' }) }
$upd = @(Get-Process -Name OfficeC2RClient -EA SilentlyContinue).Count -gt 0
Fakt 'updateLaeuft' $upd
if ($upd) { Punkt 'Office-Update' 'warn' 'läuft gerade (Office-Programme werden dabei geschlossen)' }
$alt = @()
foreach ($d in @('C:\Program Files\Microsoft Office\Office16', 'C:\Program Files (x86)\Microsoft Office\Office16', 'C:\Program Files\Microsoft Office\Office15', 'C:\Program Files (x86)\Microsoft Office\Office15', 'C:\Program Files (x86)\Microsoft Office\Office14')) {
  if ((Test-Path -LiteralPath (Join-Path $d 'WINWORD.EXE')) -or (Test-Path -LiteralPath (Join-Path $d 'EXCEL.EXE'))) { $alt += (Split-Path $d -Leaf) }
}
Fakt 'altesOffice' @($alt); Fakt 'zweiVersionen' ($alt.Count -gt 0 -and $progs.Count -gt 0)
if ($alt.Count) { Punkt 'Ältere Office-Version (MSI)' 'warn' ('zusätzlich vorhanden: ' + ($alt -join ', ')) }
$lcid = @()
if ($root) { $lcid = @(Get-ChildItem -LiteralPath $root -Directory -EA SilentlyContinue | Where-Object { $_.Name -match '^\d{4}$' } | ForEach-Object { [string]$_.Name }) }
Fakt 'sprachen' @($lcid); Fakt 'kultur' $(if ($c2r) { [string]$c2r.ClientCulture } else { $null })
if ($root) {
  $de = $lcid -contains '1031'
  Fakt 'deutschInstalliert' $de
  Punkt 'Deutsches Sprachpaket' $(if ($de) { 'ok' } else { 'warn' }) $(if ($de) { 'installiert' + $(if ($lcid.Count -gt 1) { ' (insgesamt ' + $lcid.Count + ' Sprachen)' } else { '' }) } else { 'fehlt (Sprachordner: ' + ($lcid -join ', ') + ')' })
}
$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue | Where-Object { $_.Message -match '(?i)(winword|excel|powerpnt)\.exe' })
$ab = $ev.Count
$abProg = @($ev | ForEach-Object { if ($_.Message -match '(?i)(winword|excel|powerpnt)\.exe') { $Matches[1].ToUpper() } } | Select-Object -Unique)
$abMod = @($ev | ForEach-Object { if ($_.Message -match '(?i)(Faulting module name|Name des fehlerhaften Moduls):\s*([^,\r\n]+)') { $Matches[2].Trim() } } | Select-Object -Unique | Select-Object -First 5)
$hg = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1002; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue | Where-Object { $_.Message -match '(?i)(winword|excel|powerpnt)\.exe' }).Count
Fakt 'abstuerze7' $ab; Fakt 'haenger7' $hg; Fakt 'absturzProgramme' @($abProg); Fakt 'absturzModule' @($abMod)
Punkt 'Abstürze / Hänger (7 Tage)' $(if ($ab -ge 2 -or $hg -ge 3) { 'fehler' } elseif ($ab -or $hg) { 'warn' } else { 'ok' }) ('' + $ab + ' Absturz/Abstürze' + $(if ($abProg.Count) { ' (' + ($abProg -join ', ') + ')' } else { '' }) + ', ' + $hg + ' Mal „reagiert nicht“' + $(if ($abMod.Count) { ' – fehlerhaftes Modul: ' + ($abMod -join ', ') } else { '' }))
$oa = @()
try { $oa = @(Get-WinEvent -FilterHashtable @{ LogName = 'OAlerts'; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 100 -EA Stop) } catch { $oa = @() }
$txtAlle = (@($oa | ForEach-Object { [string]$_.Message }) -join ' ')
Fakt 'meldungen7' $oa.Count
Fakt 'meldungLizenz' ($txtAlle -match '(?i)nicht lizenziert|unlicensed|Produktaktivierung fehlgeschlagen|product activation failed|Lizenzierung|licensing')
Fakt 'meldungGesperrt' ($txtAlle -match '(?i)gesperrt|locked for editing|wird bearbeitet von|is in use by|in Verwendung')
Fakt 'meldungBeschaedigt' ($txtAlle -match '(?i)beschädigt|corrupt|unlesbaren Inhalt|unreadable content')
Fakt 'meldungMakro' ($txtAlle -match '(?i)makro|macro')
$letzte = @($oa | Select-Object -First 3 | ForEach-Object { $m1 = ([string]$_.Message -replace '\s+', ' ').Trim(); if ($m1.Length -gt 140) { $m1.Substring(0, 140) + '…' } else { $m1 } })
Fakt 'letzteMeldungen' @($letzte)
Punkt 'Office-Fehlermeldungen (7 Tage)' $(if ($oa.Count) { 'info' } else { 'ok' }) $(if ($oa.Count) { '' + $oa.Count + ' Meldung(en), zuletzt: ' + ($letzte -join ' | ') } else { 'keine' })
$gpu = @(Get-CimInstance Win32_VideoController -EA SilentlyContinue | Where-Object { $_.DriverDate })
if ($gpu.Count) {
  $jahre = 99.0; $gName = ''
  foreach ($g in $gpu) { $j = [math]::Round(((Get-Date) - [datetime]$g.DriverDate).TotalDays / 365, 1); if ($j -lt $jahre) { $jahre = $j; $gName = [string]$g.Name } }
  Fakt 'grafikTreiberJahre' $jahre; Fakt 'grafik' $gName
  Punkt 'Grafiktreiber' $(if ($jahre -ge 3) { 'warn' } else { 'ok' }) ($gName + ', Treiber ' + $jahre + ' Jahre alt')
}
`,
  },
  {
    id: 'ofu', titel: 'Office des Benutzers (Konto, Lizenz, Add-ins, Makro-Einstellungen, Wiederherstellung, Sprache)', modus: 'profil', timeoutMs: 90000,
    ps: String.raw`
NeedHive
$o16 = $uHive + '\Software\Microsoft\Office\16.0'
$konten = @(); $privat = $false
foreach ($k in @(Get-ChildItem -LiteralPath ($o16 + '\Common\Identity\Identities') -EA SilentlyContinue)) {
  $ip = Get-ItemProperty -LiteralPath $k.PSPath -EA SilentlyContinue
  $mail = [string]$ip.EmailAddress
  if ($mail -and $konten -notcontains $mail) { $konten += $mail }
  if ([string]$ip.ProviderId -match '(?i)LiveId|MSA' -or $mail -match '(?i)@(gmail|googlemail|outlook|hotmail|live|gmx|web|t-online|icloud|yahoo)\.') { $privat = $true }
}
Fakt 'konten' @($konten); Fakt 'kontenAnzahl' $konten.Count; Fakt 'privatesKonto' $privat
Punkt 'In Office angemeldet' $(if ($privat) { 'warn' } elseif ($konten.Count) { 'ok' } else { 'fehler' }) $(if ($konten.Count) { ($konten -join ', ') + $(if ($privat) { ' – PRIVATES Konto dabei' } else { '' }) } else { 'kein Konto angemeldet' })
$licDir = Join-Path $uLocal 'Microsoft\Office\Licenses'
$lic = @(Get-ChildItem -LiteralPath $licDir -Recurse -File -EA SilentlyContinue).Count
Fakt 'lizenzDateien' $lic
Punkt 'Lizenzdateien (Microsoft 365)' $(if ($lic) { 'ok' } else { 'warn' }) $(if ($lic) { '' + $lic + ' vorhanden' } else { 'keine – Office ist für diesen Benutzer (noch) nicht aktiviert' })
$aktiv = 0; $aus = @(); $dis = 0
foreach ($app in @('Word', 'Excel', 'PowerPoint')) {
  $gesehen = @{}
  foreach ($b in @(($uHive + '\Software\Microsoft\Office\' + $app + '\Addins'), ('HKLM:\SOFTWARE\Microsoft\Office\' + $app + '\Addins'), ('HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\' + $app + '\Addins'))) {
    foreach ($k in @(Get-ChildItem -LiteralPath $b -EA SilentlyContinue)) {
      $lb = (Get-ItemProperty -LiteralPath $k.PSPath -Name LoadBehavior -EA SilentlyContinue).LoadBehavior
      if ($null -eq $lb -or $gesehen.ContainsKey($k.PSChildName)) { continue }
      $gesehen[$k.PSChildName] = $true
      if ([int]$lb -eq 3) { $aktiv++ } elseif ([int]$lb -eq 0 -or [int]$lb -eq 2) { $aus += ($app + ': ' + $k.PSChildName) }
    }
  }
  $dis += @((Get-Item -LiteralPath ($o16 + '\' + $app + '\Resiliency\DisabledItems') -EA SilentlyContinue).Property).Count
  $dis += @((Get-Item -LiteralPath ($o16 + '\' + $app + '\Resiliency\CrashingAddinList') -EA SilentlyContinue).Property).Count
}
Fakt 'addinsAktiv' $aktiv; Fakt 'addinsAus' @($aus); Fakt 'deaktivierteElemente' $dis
Punkt 'Add-ins (Word, Excel, PowerPoint)' $(if ($dis) { 'warn' } else { 'ok' }) ('' + $aktiv + ' aktiv' + $(if ($aus.Count) { ', ausgeschaltet: ' + ($aus -join ', ') } else { '' }))
if ($dis) { Punkt 'Von Office deaktiviert' 'warn' ('' + $dis + ' Element(e) nach Absturz/Langsamkeit abgeschaltet') }
$pol = $uHive + '\Software\Policies\Microsoft\Office\16.0'
$stufe = $null; $stufePol = $false; $netzSperre = $false; $block = 0; $orte = 0
foreach ($app in @('excel', 'word', 'powerpoint')) {
  $ps1 = Get-ItemProperty -LiteralPath ($pol + '\' + $app + '\security') -EA SilentlyContinue
  $us1 = Get-ItemProperty -LiteralPath ($o16 + '\' + $app + '\Security') -EA SilentlyContinue
  if ($ps1 -and [int]$ps1.blockcontentexecutionfrominternet -eq 1) { $netzSperre = $true }
  if ($app -eq 'excel') {
    if ($ps1 -and $null -ne $ps1.vbawarnings) { $stufe = [int]$ps1.vbawarnings; $stufePol = $true } elseif ($us1 -and $null -ne $us1.VBAWarnings) { $stufe = [int]$us1.VBAWarnings }
  }
  $block += @((Get-Item -LiteralPath ($pol + '\' + $app + '\security\fileblock') -EA SilentlyContinue).Property).Count
  $fb = Get-Item -LiteralPath ($o16 + '\' + $app + '\Security\FileBlock') -EA SilentlyContinue
  if ($fb) { foreach ($pn in @($fb.Property)) { if ([int]$fb.GetValue($pn) -ne 0) { $block++ } } }
  $orte += @(Get-ChildItem -LiteralPath ($pol + '\' + $app + '\security\trusted locations') -EA SilentlyContinue).Count
  $orte += @(Get-ChildItem -LiteralPath ($o16 + '\' + $app + '\Security\Trusted Locations') -EA SilentlyContinue).Count
}
Fakt 'makroStufe' $stufe; Fakt 'makroStufeRichtlinie' $stufePol; Fakt 'makroInternetGesperrt' $netzSperre; Fakt 'dateiblock' $block; Fakt 'vertrauensorte' $orte
$stufeTxt = $(if ($stufe -eq 1) { 'alle Makros erlaubt' } elseif ($stufe -eq 2) { 'Makros aus, mit Nachfrage (Standard)' } elseif ($stufe -eq 3) { 'nur signierte Makros' } elseif ($stufe -eq 4) { 'alle Makros AUS ohne Nachfrage' } else { 'Standard (Nachfrage)' })
Punkt 'Makro-Einstellung (nur festgestellt)' $(if ($stufe -eq 4) { 'warn' } else { 'info' }) ($stufeTxt + $(if ($stufePol) { ' – per Richtlinie' } else { '' }) + $(if ($netzSperre) { '; Makros aus dem Internet gesperrt (Richtlinie)' } else { '' }) + '; ' + $orte + ' vertrauenswürdige(r) Speicherort(e)')
Punkt 'Zugriffsschutz (Dateiblock)' $(if ($block) { 'warn' } else { 'ok' }) $(if ($block) { '' + $block + ' Dateityp(en) im Trust Center blockiert' } else { 'keine Dateitypen blockiert' })
$nd = Get-Item -LiteralPath (Join-Path $uRoam 'Microsoft\Templates\Normal.dotm') -EA SilentlyContinue
$ndKB = $(if ($nd) { [math]::Round([double]$nd.Length / 1KB) } else { $null })
Fakt 'normalDotmKB' $ndKB
$xs = @(Get-ChildItem -LiteralPath (Join-Path $uRoam 'Microsoft\Excel\XLSTART') -File -EA SilentlyContinue)
Fakt 'xlstartDateien' $xs.Count
Punkt 'Vorlagen' $(if ($ndKB -ge 1000) { 'warn' } else { 'ok' }) ($(if ($nd) { 'Normal.dotm ' + $ndKB + ' KB' } else { 'Normal.dotm noch nicht angelegt' }) + ', XLSTART: ' + $xs.Count + ' Datei(en)' + $(if ($xs.Count) { ' (' + ((@($xs | Select-Object -First 3 | ForEach-Object { $_.Name })) -join ', ') + ')' } else { '' }))
$gpuAus = (Get-ItemProperty -LiteralPath ($o16 + '\Common\Graphics') -Name DisableHardwareAcceleration -EA SilentlyContinue).DisableHardwareAcceleration -eq 1
Fakt 'gpuAus' $gpuAus
$fc = [math]::Round([double](OrdnerGroesse (Join-Path $uLocal 'Microsoft\Office\16.0\OfficeFileCache')) / 1MB)
Fakt 'dateiCacheMB' $fc
Punkt 'Office-Dokumentcache' $(if ($fc -ge 1000) { 'warn' } else { 'ok' }) ('' + $fc + ' MB' + $(if ($gpuAus) { ', Grafikbeschleunigung ist aus' } else { '' }))
$wh = @(Get-ChildItem -LiteralPath (Join-Path $uLocal 'Microsoft\Office\UnsavedFiles') -File -EA SilentlyContinue).Count
$wh += @(Get-ChildItem -LiteralPath (Join-Path $uRoam 'Microsoft\Word') -Filter '*.asd' -File -Recurse -EA SilentlyContinue).Count
$wh += @(Get-ChildItem -LiteralPath (Join-Path $uRoam 'Microsoft\Excel') -Filter '*.xlsb' -File -Recurse -EA SilentlyContinue | Where-Object { $_.DirectoryName -notmatch '(?i)XLSTART' }).Count
$wh += @(Get-ChildItem -LiteralPath (Join-Path $uRoam 'Microsoft\PowerPoint') -Filter '*.pptx' -File -Recurse -EA SilentlyContinue).Count
Fakt 'wiederherstellbar' $wh
Punkt 'Wiederherstellbare Dateien' $(if ($wh) { 'info' } else { 'ok' }) $(if ($wh) { '' + $wh + ' automatisch gesicherte/ungespeicherte Datei(en) vorhanden' } else { 'keine' })
$lr = Get-ItemProperty -LiteralPath ($o16 + '\Common\LanguageResources') -EA SilentlyContinue
$ui = $(if ($lr) { [string]$lr.UILanguageTag } else { '' }); $ed = $(if ($lr) { [string]$lr.PreferredEditingLanguage } else { '' })
Fakt 'uiSprache' $(if ($ui) { $ui } else { $null }); Fakt 'bearbeitungsSprache' $(if ($ed) { $ed } else { $null })
Punkt 'Sprache' $(if ($ui -match '(?i)^en' -or ($ed -and $ed -notmatch '(?i)^de')) { 'warn' } else { 'ok' }) ('Oberfläche: ' + $(if ($ui) { $ui } else { 'wie Windows' }) + ', Bearbeitungssprache: ' + $(if ($ed) { $ed } else { 'Standard' }))
$usf = Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') -EA SilentlyContinue
$dok = $(if ($usf) { ([string]$usf.Personal) -replace '(?i)%USERPROFILE%', $uProf } else { '' })
Fakt 'dokumentePfad' $(if ($dok) { $dok } else { $null }); Fakt 'dokumenteNetz' ($dok -match '^\\\\')
$cloud = (Get-ItemProperty -LiteralPath ($o16 + '\Common\General') -Name PreferCloudSaveLocations -EA SilentlyContinue).PreferCloudSaveLocations
Fakt 'cloudSpeichern' ($cloud -eq 1)
Punkt 'Speicherort „Dokumente“' $(if ($dok -match '^\\\\') { 'warn' } else { 'ok' }) $(if ($dok) { $dok } else { 'Standard' })
$op = $null
try { $op = @(UserProcs @('WINWORD', 'EXCEL', 'POWERPNT')) } catch { $op = $null }
if ($null -ne $op) {
  $hng = @($op | Where-Object { $_.MainWindowHandle -ne 0 -and -not $_.Responding } | ForEach-Object { [string]$_.ProcessName } | Select-Object -Unique)
  $bg = @($op | Where-Object { $_.ProcessName -eq 'EXCEL' -and $_.MainWindowHandle -eq 0 }).Count
  Fakt 'laufend' @($op | ForEach-Object { [string]$_.ProcessName } | Select-Object -Unique); Fakt 'haengt' @($hng); Fakt 'hintergrundExcel' $bg
  Punkt 'Läuft gerade' $(if ($hng.Count) { 'fehler' } elseif ($bg) { 'warn' } else { 'info' }) $(if ($op.Count) { (@($op | ForEach-Object { [string]$_.ProcessName } | Select-Object -Unique) -join ', ') + $(if ($hng.Count) { ' – reagiert NICHT: ' + ($hng -join ', ') } else { '' }) + $(if ($bg) { ' – ' + $bg + ' unsichtbare Excel-Instanz(en)' } else { '' }) } else { 'kein Office-Programm geöffnet' })
} else { Punkt 'Office-Prozesse' 'info' 'nicht lesbar (Adminrechte nötig)' }
`,
  },
]

const hatProg = (v: DgWert | undefined, p: string) => liste(v).includes(p)

export const THEMEN_OFFICE: DgOber[] = [
  {
    id: 'office', titel: 'Office (Word, Excel, PowerPoint)', symbol: 'FileText', beschreibung: 'Word/Excel/PowerPoint startet nicht oder stürzt ab, Lizenz/Anmeldung, Datei öffnet nicht, Makros gesperrt, langsam, Speichern, Sprache',
    unter: [
      {
        id: 'of-start', titel: 'Word, Excel oder PowerPoint startet nicht oder stürzt ab', beschreibung: 'Klick auf Word/Excel passiert nichts, Programm schließt sich sofort wieder, „funktioniert nicht mehr“',
        sonden: ['of', 'ofu', 'sys'],
        regeln: [
          { id: 'fehlt', wenn: f => nein(f['of.installiert']), befund: () => 'Word/Excel/PowerPoint sind auf diesem PC nicht installiert', problem: 'office-startet-gar-nicht', schwere: 3 },
          { id: 'dienst', wenn: f => ja(f['of.installiert']) && (f['of.c2rDienst'] === null || txt(f['of.c2rStart']) === 'Disabled'), befund: f => f['of.c2rDienst'] === null ? 'Office-Dienst „ClickToRunSvc“ fehlt' : 'Office-Dienst „ClickToRunSvc“ ist deaktiviert', problem: 'office-c2r-dienst-fehlt', schwere: 3 },
          { id: 'excel', wenn: f => num(f['of.abstuerze7']) >= 1 && hatProg(f['of.absturzProgramme'], 'EXCEL'), befund: f => `Excel ist in den letzten 7 Tagen abgestürzt${liste(f['of.absturzModule']).length ? ' (Modul: ' + txt(f['of.absturzModule']) + ')' : ''}`, problem: 'office-excel-absturz-oeffnen', schwere: 3 },
          { id: 'word', wenn: f => num(f['of.abstuerze7']) >= 1 && hatProg(f['of.absturzProgramme'], 'WINWORD'), befund: f => `Word ist in den letzten 7 Tagen abgestürzt${liste(f['of.absturzModule']).length ? ' (Modul: ' + txt(f['of.absturzModule']) + ')' : ''}`, problem: 'office-word-startet-nicht', schwere: 3 },
          { id: 'ppt', wenn: f => num(f['of.abstuerze7']) >= 1 && hatProg(f['of.absturzProgramme'], 'POWERPNT'), befund: () => 'PowerPoint ist in den letzten 7 Tagen abgestürzt', problem: 'office-powerpoint-absturz', schwere: 3 },
          { id: 'addin', wenn: f => num(f['ofu.deaktivierteElemente']) > 0, befund: f => `Office hat ${f['ofu.deaktivierteElemente']} Add-in(s)/Element(e) nach Absturz abgeschaltet`, problem: 'office-addin-abschalten', schwere: 2 },
          { id: 'zwei', wenn: f => ja(f['of.zweiVersionen']), befund: f => `Zusätzlich ist eine ältere Office-Version installiert (${txt(f['of.altesOffice'])})`, problem: 'office-zwei-versionen', schwere: 2 },
          { id: 'update', wenn: f => ja(f['of.updateLaeuft']), befund: () => 'Gerade läuft ein Office-Update – Programme werden dabei geschlossen', problem: 'office-schliesst-sich-fuer-update', schwere: 2 },
        ],
        ohneBefund: ['office-startet-gar-nicht', 'office-word-startet-nicht', 'office-excel-absturz-oeffnen', 'office-addin-abschalten'],
      },
      {
        id: 'of-lizenz', titel: 'Lizenz, Aktivierung oder Anmeldung', beschreibung: '„Nicht lizenziertes Produkt“, Bearbeiten gesperrt, gelbe Leiste „Kontofehler“, Office fragt ständig nach Anmeldung',
        sonden: ['of', 'ofu', 'aad', 'net'],
        regeln: [
          { id: 'meldung', wenn: f => ja(f['of.meldungLizenz']), befund: () => 'Office hat in den letzten 7 Tagen eine Lizenz-/Aktivierungsmeldung angezeigt', problem: 'office-nicht-lizenziert', schwere: 3 },
          { id: 'keine-lizenz', wenn: f => ja(f['of.installiert']) && num(f['ofu.lizenzDateien']) === 0, befund: () => 'Für diesen Benutzer liegt keine Microsoft-365-Lizenzdatei vor', problem: 'office-nicht-lizenziert', schwere: 2 },
          { id: 'kein-prt', wenn: f => nein(f['aad.prt']), befund: () => 'Das Anmeldetoken (PRT) fehlt – Office muss sich jedes Mal neu anmelden', problem: 'office-anmeldung-wiederholt', schwere: 3 },
          { id: 'kein-konto', wenn: f => num(f['ofu.kontenAnzahl']) === 0, befund: () => 'In Office ist kein Konto angemeldet', problem: 'office-anmeldung-wiederholt', schwere: 2 },
          { id: 'privat', wenn: f => ja(f['ofu.privatesKonto']), befund: f => `In Office ist ein privates Konto angemeldet (${txt(f['ofu.konten'])})`, problem: 'office-falsches-konto', schwere: 2 },
          { id: 'shared', wenn: f => ja(f['of.sharedComputer']), befund: () => 'Office ist für gemeinsam genutzte PCs aktiviert (jeder Benutzer braucht eigene Anmeldung)', problem: 'office-gemeinsam-genutzter-pc', schwere: 1 },
          { id: 'kein-internet', wenn: f => nein(f['net.internet443']), befund: () => 'Microsoft-Anmeldung (login.microsoftonline.com) ist nicht erreichbar', problem: 'netz-kein-internet-verbunden', schwere: 3 },
          { id: 'proxy', wenn: f => nein(f['net.winhttpDirekt']), befund: () => 'Im System ist ein Proxy eingetragen (WinHTTP) – Aktivierung kann daran scheitern', problem: 'office-anmeldung-fehlercode', schwere: 1 },
        ],
        ohneBefund: ['office-nicht-lizenziert', 'office-anmeldung-wiederholt', 'office-kontofehler-aufmerksamkeit', 'office-aktivierung-fehlercode'],
      },
      {
        id: 'of-datei', titel: 'Datei öffnet nicht, geschützte Ansicht oder Makros gesperrt', beschreibung: 'Datei bleibt leer/grau, „Geschützte Ansicht“, roter Balken „Makros blockiert“, „Datei ist gesperrt“, „Datei beschädigt“',
        sonden: ['ofu', 'of'],
        fragen: [{ id: 'makro', text: 'Erscheint ein roter Balken „Sicherheitsrisiko – Makros blockiert“?' }],
        regeln: [
          { id: 'makro-meldung', wenn: f => f['frage.makro'] === 'ja', befund: f => 'Makros in Dateien aus dem Internet/E-Mail sind gesperrt (Sicherheitsfunktion – wird nicht gelockert)' + (ja(f['ofu.makroInternetGesperrt']) ? ', zusätzlich per Richtlinie' : ''), problem: 'office-makros-blockiert', schwere: 3 },
          { id: 'makro-aus', wenn: f => num(f['ofu.makroStufe']) === 4, befund: f => `Makros sind komplett abgeschaltet (Stufe 4${ja(f['ofu.makroStufeRichtlinie']) ? ', per Richtlinie' : ''})`, problem: 'office-makros-blockiert', schwere: 2 },
          { id: 'dateiblock', wenn: f => num(f['ofu.dateiblock']) > 0, befund: f => `${f['ofu.dateiblock']} Dateityp(en) sind im Trust Center blockiert`, problem: 'office-dateiblock-trust-center', schwere: 3 },
          { id: 'gesperrt', wenn: f => ja(f['of.meldungGesperrt']), befund: () => 'Office meldete in den letzten 7 Tagen „Datei gesperrt/wird bearbeitet“', problem: 'office-datei-gesperrt-benutzer', schwere: 2 },
          { id: 'beschaedigt', wenn: f => ja(f['of.meldungBeschaedigt']), befund: () => 'Office meldete in den letzten 7 Tagen eine beschädigte bzw. unlesbare Datei', problem: 'office-datei-beschaedigt', schwere: 2 },
          { id: 'cache', wenn: f => num(f['ofu.dateiCacheMB']) >= 1000, befund: f => `Office-Dokumentcache ist ${zahl(f['ofu.dateiCacheMB'])} MB groß`, problem: 'teams-dateien-oeffnen-nicht', schwere: 1 },
        ],
        ohneBefund: ['office-geschuetzte-ansicht-leer', 'office-nur-schreibgeschuetzt', 'office-makros-blockiert', 'office-datei-beschaedigt'],
      },
      {
        id: 'of-langsam', titel: 'Office ist langsam oder hängt', beschreibung: '„Keine Rückmeldung“, Tippen ruckelt, Excel rechnet ewig, Fenster flackert',
        sonden: ['ofu', 'of', 'sys'],
        regeln: [
          { id: 'haengt', wenn: f => liste(f['ofu.haengt']).length > 0, befund: f => `Reagiert gerade nicht: ${txt(f['ofu.haengt'])}`, problem: 'office-programm-haengt', schwere: 3 },
          { id: 'haenger', wenn: f => num(f['of.haenger7']) >= 3, befund: f => `Office hat in 7 Tagen ${f['of.haenger7']}× nicht reagiert`, problem: 'office-programm-haengt', schwere: 2 },
          { id: 'resilienz', wenn: f => num(f['ofu.deaktivierteElemente']) > 0, befund: f => `Office hat ${f['ofu.deaktivierteElemente']} Add-in(s) als langsam/abstürzend markiert`, problem: 'office-addin-abschalten', schwere: 2 },
          { id: 'viele-addins', wenn: f => num(f['ofu.addinsAktiv']) >= 8, befund: f => `${f['ofu.addinsAktiv']} Add-ins werden beim Start geladen`, problem: 'excel-startet-langsam', schwere: 1 },
          { id: 'excel-unsichtbar', wenn: f => num(f['ofu.hintergrundExcel']) >= 1, befund: f => `${f['ofu.hintergrundExcel']} unsichtbare Excel-Instanz(en) laufen im Hintergrund`, problem: 'office-excel-doppelklick-leer', schwere: 2 },
          { id: 'grafik', wenn: f => num(f['of.grafikTreiberJahre']) >= 3 && nein(f['ofu.gpuAus']), befund: f => `Grafiktreiber ist ${zahl(f['of.grafikTreiberJahre'])} Jahre alt (Grafikbeschleunigung an)`, problem: 'office-flackern-schwarze-flaechen', schwere: 1 },
          { id: 'ram', wenn: f => num(f['sys.ramFreiProzent']) < 10, befund: f => `Arbeitsspeicher fast voll (${f['sys.ramFreiProzent']} % frei)`, problem: 'office-nicht-genug-arbeitsspeicher', schwere: 2 },
          { id: 'platte', wenn: f => num(f['sys.cFreiGB']) < 5, befund: f => `Laufwerk C: hat nur noch ${zahl(f['sys.cFreiGB'])} GB frei`, problem: 'leistung-festplatte-voll', schwere: 2 },
        ],
        ohneBefund: ['office-programm-haengt', 'office-excel-langsam', 'office-word-tippen-verzoegert', 'excel-startet-langsam'],
      },
      {
        id: 'of-speichern', titel: 'Speichern klappt nicht oder Datei ist weg', beschreibung: 'Speichern dauert ewig oder scheitert, Datei nach Absturz verloren, Office speichert immer in OneDrive',
        sonden: ['ofu', 'sys', 'net'],
        regeln: [
          { id: 'wiederherstellen', wenn: f => num(f['ofu.wiederherstellbar']) > 0, befund: f => `${f['ofu.wiederherstellbar']} automatisch gesicherte/ungespeicherte Datei(en) liegen zur Wiederherstellung bereit`, problem: 'office-ungespeichert-wiederherstellen', schwere: 2 },
          { id: 'platte', wenn: f => num(f['sys.cFreiGB']) < 2, befund: f => `Laufwerk C: hat nur noch ${zahl(f['sys.cFreiGB'])} GB frei`, problem: 'leistung-festplatte-voll', schwere: 3 },
          { id: 'netz-weg', wenn: f => ja(f['ofu.dokumenteNetz']) && nein(f['net.domaeneErreichbar']), befund: f => `„Dokumente“ liegt auf dem Netzlaufwerk (${txt(f['ofu.dokumentePfad'])}), das Firmennetz ist aber nicht erreichbar`, problem: 'office-speichern-netzlaufwerk-fehler', schwere: 3 },
          { id: 'netz', wenn: f => ja(f['ofu.dokumenteNetz']), befund: f => `„Dokumente“ liegt auf einem Netzlaufwerk (${txt(f['ofu.dokumentePfad'])})`, problem: 'office-speichern-netzlaufwerk-fehler', schwere: 1 },
          { id: 'cloud', wenn: f => ja(f['ofu.cloudSpeichern']), befund: () => 'Office schlägt beim Speichern standardmäßig OneDrive vor', problem: 'office-speichert-in-onedrive', schwere: 1 },
          { id: 'cache', wenn: f => num(f['ofu.dateiCacheMB']) >= 1000, befund: f => `Office-Dokumentcache (Upload-Zwischenspeicher) ist ${zahl(f['ofu.dateiCacheMB'])} MB groß`, problem: 'onedrive-hochladen-fehlgeschlagen', schwere: 1 },
        ],
        ohneBefund: ['office-ungespeichert-wiederherstellen', 'office-speichern-netzlaufwerk-fehler', 'office-speichern-dauert', 'onedrive-hochladen-fehlgeschlagen'],
      },
      {
        id: 'of-sprache', titel: 'Sprache, Rechtschreibung oder Oberfläche falsch', beschreibung: 'Office ist auf Englisch, Rechtschreibprüfung unterstreicht alles rot, falsche Sprache beim Tippen',
        sonden: ['ofu', 'of'],
        regeln: [
          { id: 'ui-englisch', wenn: f => /^en/i.test(txt(f['ofu.uiSprache'])), befund: f => `Office-Oberfläche ist auf ${txt(f['ofu.uiSprache'])} eingestellt`, problem: 'office-oberflaeche-englisch', schwere: 3 },
          { id: 'bearbeitung', wenn: f => txt(f['ofu.bearbeitungsSprache']) !== '' && !/^de/i.test(txt(f['ofu.bearbeitungsSprache'])), befund: f => `Bevorzugte Bearbeitungssprache ist ${txt(f['ofu.bearbeitungsSprache'])}`, problem: 'office-rechtschreibung-falsche-sprache', schwere: 2 },
          { id: 'kein-deutsch', wenn: f => nein(f['of.deutschInstalliert']), befund: f => `Deutsches Office-Sprachpaket fehlt (installiert: ${txt(f['of.sprachen']) || 'keine'})`, problem: 'office-korrekturhilfen-fehlen', schwere: 2 },
          { id: 'normal-dotm', wenn: f => num(f['ofu.normalDotmKB']) >= 1000, befund: f => `Word-Vorlage Normal.dotm ist ungewöhnlich groß (${zahl(f['ofu.normalDotmKB'])} KB)`, problem: 'office-word-formatierung-normal-dotm', schwere: 1 },
        ],
        ohneBefund: ['office-rechtschreibung-falsche-sprache', 'office-korrekturhilfen-fehlen', 'word-sprache-wechselt-beim-tippen', 'office-oberflaeche-englisch'],
      },
    ],
  },
]
