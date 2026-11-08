// ── Diagnose-Thema „Outlook & E-Mail“ (Referenz für alle Themen) ─────────────
import { ja, liste, nein, num, txt, zahl } from '../motor'
import type { DgOber, DgSonde } from '../types'

export const SONDEN_OUTLOOK: DgSonde[] = [
  {
    id: 'ol', titel: 'Outlook (Version, Profil, Datendateien, Add-ins, Abstürze, Suche)', modus: 'profil', timeoutMs: 120000,
    ps: String.raw`
NeedHive
$c2r = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration' -EA SilentlyContinue
$exe = @('C:\Program Files\Microsoft Office\root\Office16\OUTLOOK.EXE', 'C:\Program Files (x86)\Microsoft Office\root\Office16\OUTLOOK.EXE') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
Fakt 'installiert' ([bool]$exe); Fakt 'version' $(if ($c2r) { [string]$c2r.VersionToReport } else { $null })
Punkt 'Klassisches Outlook' $(if ($exe) { 'ok' } else { 'fehler' }) $(if ($exe) { 'installiert' + $(if ($c2r) { ' (Version ' + $c2r.VersionToReport + ')' } else { '' }) } else { 'OUTLOOK.EXE fehlt' })
$olp = @(); $neu = $false
try { $olp = @(UserProcs @('OUTLOOK')); $neu = @(UserProcs @('olk')).Count -gt 0 } catch { Punkt 'Prozesse des Benutzers' 'info' 'nicht lesbar (Adminrechte nötig)' }
$haengt = @($olp | Where-Object { -not $_.Responding }).Count -gt 0
Fakt 'laeuft' ($olp.Count -gt 0); Fakt 'haengt' $haengt
$neuSchalter = (Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Office\16.0\Outlook\Preferences') -Name UseNewOutlook -EA SilentlyContinue).UseNewOutlook
Fakt 'neuesOutlook' ($neu -or $neuSchalter -eq 1)
Punkt 'Läuft gerade' $(if ($haengt) { 'fehler' } else { 'info' }) $(if ($olp.Count) { 'Outlook läuft' + $(if ($haengt) { ' – reagiert NICHT' } else { '' }) } elseif ($neu) { 'nur das NEUE Outlook (olk) läuft' } else { 'Outlook läuft nicht' })
$pk = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Profiles'
$prof = @(Get-ChildItem -LiteralPath $pk -EA SilentlyContinue | ForEach-Object { $_.PSChildName })
$std = (Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Office\16.0\Outlook') -Name DefaultProfile -EA SilentlyContinue).DefaultProfile
Fakt 'profile' $prof.Count; Fakt 'standardProfil' $(if ($std) { [string]$std } else { $null })
Punkt 'Outlook-Profile' $(if ($prof.Count) { 'ok' } else { 'fehler' }) $(if ($prof.Count) { '' + $prof.Count + ' (' + ($prof -join ', ') + ')' + $(if ($std) { ', Standard: ' + $std } else { '' }) } else { 'kein Profil eingerichtet' })
$od = Join-Path $uLocal 'Microsoft\Outlook'
$ost = @(Get-ChildItem -LiteralPath $od -Filter '*.ost' -File -EA SilentlyContinue)
$ostMax = 0.0; $ostSum = 0.0; foreach ($o in $ost) { $g = [double]$o.Length / 1GB; $ostSum += $g; if ($g -gt $ostMax) { $ostMax = $g } }
Fakt 'ostAnzahl' $ost.Count; Fakt 'ostMaxGB' ([math]::Round($ostMax, 1)); Fakt 'ostSummeGB' ([math]::Round($ostSum, 1))
Punkt 'Postfach-Cache (OST)' $(if ($ostMax -ge 40) { 'fehler' } elseif ($ostMax -ge 25) { 'warn' } else { 'ok' }) ('' + $ost.Count + ' Datei(en), größte ' + [math]::Round($ostMax, 1) + ' GB')
$pst = @()
foreach ($d in @((Join-Path $uProf 'Documents\Outlook-Dateien'), (Join-Path $uProf 'Documents\Outlook Files'), $od)) { $pst += @(Get-ChildItem -LiteralPath $d -Filter '*.pst' -File -EA SilentlyContinue) }
$pstSum = 0.0; foreach ($x in $pst) { $pstSum += [double]$x.Length / 1GB }
Fakt 'pstAnzahl' $pst.Count; Fakt 'pstSummeGB' ([math]::Round($pstSum, 1))
Punkt 'PST-Archive (lokal)' $(if ($pst.Count -ge 3 -or $pstSum -ge 10) { 'warn' } else { 'ok' }) ('' + $pst.Count + ' Archiv(e), zusammen ' + [math]::Round($pstSum, 1) + ' GB')
$load = @{}
foreach ($b in @(($uHive + '\Software\Microsoft\Office\Outlook\Addins'), 'HKLM:\SOFTWARE\Microsoft\Office\Outlook\Addins', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\Outlook\Addins')) {
  foreach ($k in @(Get-ChildItem -LiteralPath $b -EA SilentlyContinue)) { $lb = (Get-ItemProperty -LiteralPath $k.PSPath -Name LoadBehavior -EA SilentlyContinue).LoadBehavior; if ($null -ne $lb -and -not $load.ContainsKey($k.PSChildName)) { $load[$k.PSChildName] = [int]$lb } }
}
$aus = @($load.Keys | Where-Object { $load[$_] -ne 3 })
Fakt 'addinsAus' @($aus)
$en = @($load.Keys | Where-Object { $_ -match '(?i)enaio|optimal' } | Select-Object -First 1)
$tm = @($load.Keys | Where-Object { $_ -match '(?i)TeamsAddin' } | Select-Object -First 1)
Fakt 'enaioLoad' $(if ($en.Count) { $load[$en[0]] } else { $null }); Fakt 'teamsLoad' $(if ($tm.Count) { $load[$tm[0]] } else { $null })
Punkt 'Add-ins' $(if ($aus.Count) { 'warn' } else { 'ok' }) $(if ($aus.Count) { 'nicht aktiv: ' + ($aus -join ', ') } else { 'alle ' + $load.Count + ' aktiv' })
Punkt 'enaio-Add-in' $(if (-not $en.Count) { 'info' } elseif ($load[$en[0]] -eq 3) { 'ok' } else { 'fehler' }) $(if (-not $en.Count) { 'nicht installiert' } elseif ($load[$en[0]] -eq 3) { 'aktiv' } else { 'DEAKTIVIERT (LoadBehavior ' + $load[$en[0]] + ')' })
Punkt 'Teams-Besprechungs-Add-in' $(if (-not $tm.Count) { 'warn' } elseif ($load[$tm[0]] -eq 3) { 'ok' } else { 'fehler' }) $(if (-not $tm.Count) { 'nicht vorhanden' } elseif ($load[$tm[0]] -eq 3) { 'aktiv' } else { 'DEAKTIVIERT (LoadBehavior ' + $load[$tm[0]] + ')' })
$dis = @((Get-Item -LiteralPath ($uHive + '\Software\Microsoft\Office\16.0\Outlook\Resiliency\DisabledItems') -EA SilentlyContinue).Property).Count
Fakt 'deaktivierteElemente' $dis
if ($dis) { Punkt 'Von Outlook deaktiviert' 'warn' ('' + $dis + ' Element(e) wegen Absturz/Langsamkeit abgeschaltet') }
$ab = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000; StartTime = (Get-Date).AddDays(-7) } -EA SilentlyContinue | Where-Object { $_.Message -match '(?i)outlook\.exe' }).Count
$hg = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1002; StartTime = (Get-Date).AddDays(-7) } -EA SilentlyContinue | Where-Object { $_.Message -match '(?i)outlook\.exe' }).Count
Fakt 'abstuerze7' $ab; Fakt 'haenger7' $hg
Punkt 'Abstürze / Hänger (7 Tage)' $(if ($ab -ge 2 -or $hg -ge 3) { 'fehler' } elseif ($ab -or $hg) { 'warn' } else { 'ok' }) ('' + $ab + ' Absturz/Abstürze, ' + $hg + ' Mal „reagiert nicht“')
$cache = (Get-ItemProperty -LiteralPath ($uHive + '\Software\Policies\Microsoft\Office\16.0\Outlook\Cached Mode') -Name Enable -EA SilentlyContinue).Enable
Fakt 'cacheAusRichtlinie' ($cache -eq 0)
if ($cache -eq 0) { Punkt 'Exchange-Cache' 'warn' 'per Richtlinie AUS (Online-Modus)' }
$ws = Get-Service -Name WSearch -EA SilentlyContinue
Fakt 'suchdienst' $(if ($ws) { [string]$ws.Status } else { $null })
$pol = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search' -Name PreventIndexingOutlook -EA SilentlyContinue).PreventIndexingOutlook
Fakt 'sucheVerboten' ($pol -eq 1)
Punkt 'Windows-Suche (für Outlook-Suche)' $(if ($ws -and $ws.Status -eq 'Running' -and $pol -ne 1) { 'ok' } else { 'fehler' }) $(if (-not $ws) { 'Dienst fehlt' } elseif ($pol -eq 1) { 'Outlook-Indizierung per Richtlinie verboten' } else { [string]$ws.Status })
$net = $false; try { $t = New-Object System.Net.Sockets.TcpClient; $net = $t.ConnectAsync('outlook.office365.com', 443).Wait(3000) -and $t.Connected; $t.Close() } catch {}
Fakt 'exchangeErreichbar' ([bool]$net)
Punkt 'Exchange Online erreichbar' $(if ($net) { 'ok' } else { 'fehler' }) $(if ($net) { 'outlook.office365.com:443' } else { 'outlook.office365.com:443 NICHT erreichbar' })
`,
  },
]

export const THEMEN_OUTLOOK: DgOber[] = [
  {
    id: 'outlook', titel: 'Outlook & E-Mail', symbol: 'Mail', beschreibung: 'Outlook startet nicht, ist langsam, Mails kommen nicht an, Knöpfe fehlen, Suche, Anmeldung',
    unter: [
      {
        id: 'ol-start', titel: 'Outlook startet nicht oder hängt beim Start', beschreibung: 'Klick auf Outlook passiert nichts, „Profil wird geladen“ bleibt stehen, Outlook stürzt sofort ab',
        sonden: ['ol', 'sys'],
        regeln: [
          { id: 'ol-fehlt', wenn: f => nein(f['ol.installiert']), befund: () => 'Klassisches Outlook ist nicht installiert', problem: 'ol-klassisch-symbol-fehlt', schwere: 3 },
          { id: 'ol-kein-profil', wenn: f => num(f['ol.profile']) === 0, befund: () => 'Es ist kein Outlook-Profil eingerichtet', problem: 'outlook-neues-profil-scheitert', schwere: 3 },
          { id: 'ol-abstuerze', wenn: f => num(f['ol.abstuerze7']) >= 2, befund: f => `Outlook ist in 7 Tagen ${f['ol.abstuerze7']}× abgestürzt`, problem: 'outlook-stuerzt-ab', schwere: 3 },
          { id: 'ol-haengt', wenn: f => ja(f['ol.haengt']), befund: () => 'Outlook läuft, reagiert aber nicht', problem: 'outlook-profil-wird-geladen', schwere: 2 },
          { id: 'ol-deaktiviert', wenn: f => num(f['ol.deaktivierteElemente']) > 0, befund: f => `Outlook hat ${f['ol.deaktivierteElemente']} Element(e) nach Absturz deaktiviert`, problem: 'outlook-nur-abgesichert', schwere: 2 },
          { id: 'ol-neu', wenn: f => ja(f['ol.neuesOutlook']), befund: () => 'Es läuft bzw. startet das NEUE Outlook statt des klassischen', problem: 'outlook-neues-outlook', schwere: 2 },
          { id: 'ol-platte', wenn: f => num(f['sys.cFreiGB']) < 5, befund: f => `Laufwerk C: hat nur noch ${zahl(f['sys.cFreiGB'])} GB frei`, problem: 'outlook-ost-zu-gross', schwere: 2 },
          { id: 'ol-neustart', wenn: f => ja(f['sys.neustartAusstehend']), befund: () => 'Ein Neustart nach Updates steht aus (Office kann halb aktualisiert sein)', problem: 'outlook-startet-nicht', schwere: 1 },
        ],
        ohneBefund: ['outlook-startet-nicht', 'outlook-profil-wird-geladen', 'outlook-stuerzt-ab'],
      },
      {
        id: 'ol-langsam', titel: 'Outlook ist langsam oder friert immer wieder ein', beschreibung: '„Keine Rückmeldung“, Tippen ruckelt, Wechsel zwischen Ordnern dauert',
        sonden: ['ol', 'sys'],
        regeln: [
          { id: 'ost-riesig', wenn: f => num(f['ol.ostMaxGB']) >= 40, befund: f => `Postfach-Cache (OST) ist ${zahl(f['ol.ostMaxGB'])} GB groß`, problem: 'outlook-ost-zu-gross', schwere: 3 },
          { id: 'ost-gross', wenn: f => num(f['ol.ostMaxGB']) >= 25 && num(f['ol.ostMaxGB']) < 40, befund: f => `Postfach-Cache (OST) ist ${zahl(f['ol.ostMaxGB'])} GB groß`, problem: 'outlook-ost-zu-gross', schwere: 2 },
          { id: 'online-modus', wenn: f => ja(f['ol.cacheAusRichtlinie']), befund: () => 'Exchange-Cache ist per Richtlinie aus – Outlook arbeitet online', problem: 'ol-online-modus-statt-cache', schwere: 3 },
          { id: 'viele-pst', wenn: f => num(f['ol.pstAnzahl']) >= 3 || num(f['ol.pstSummeGB']) >= 10, befund: f => `${f['ol.pstAnzahl']} PST-Archive mit zusammen ${zahl(f['ol.pstSummeGB'])} GB eingebunden`, problem: 'ol-viele-pst-langsam', schwere: 2 },
          { id: 'addin-aus', wenn: f => num(f['ol.deaktivierteElemente']) > 0 || liste(f['ol.addinsAus']).length > 0, befund: f => `Add-ins abgeschaltet bzw. als langsam markiert: ${txt(f['ol.addinsAus']) || f['ol.deaktivierteElemente'] + ' Element(e)'}`, problem: 'outlook-addin-deaktiviert', schwere: 2 },
          { id: 'haenger', wenn: f => num(f['ol.haenger7']) >= 3, befund: f => `Outlook hat in 7 Tagen ${f['ol.haenger7']}× nicht reagiert`, problem: 'outlook-addin-deaktiviert', schwere: 1 },
          { id: 'ram', wenn: f => num(f['sys.ramFreiProzent']) < 10, befund: f => `Arbeitsspeicher fast voll (${zahl(f['sys.ramFreiProzent'])} % frei)`, problem: 'leistung-pc-sehr-langsam', schwere: 1 },
        ],
        ohneBefund: ['outlook-ost-zu-gross', 'outlook-addin-deaktiviert', 'ol-gruppenpostfach-langsam'],
      },
      {
        id: 'ol-mailfluss', titel: 'Mails kommen nicht an oder bleiben im Postausgang', beschreibung: 'Posteingang bleibt leer, Mails hängen im Postausgang, „Getrennt“ unten in der Statusleiste',
        sonden: ['ol', 'net'],
        regeln: [
          { id: 'exch-weg', wenn: f => nein(f['ol.exchangeErreichbar']), befund: () => 'Exchange Online (outlook.office365.com) ist vom PC aus nicht erreichbar', problem: 'outlook-offline', schwere: 3 },
          { id: 'kein-internet', wenn: f => nein(f['net.internet443']), befund: () => 'Der PC kommt nicht ins Internet (Microsoft 365 nicht erreichbar)', problem: 'netz-kein-internet-verbunden', schwere: 3 },
          { id: 'zscaler-aus', wenn: f => ja(f['net.zscalerInstalliert']) && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])})`, problem: 'outlook-offline', schwere: 2 },
          { id: 'neu-statt-klassisch', wenn: f => ja(f['ol.neuesOutlook']), befund: () => 'Das neue Outlook ist aktiv – Gruppenpostfächer/Regeln verhalten sich dort anders', problem: 'outlook-neues-outlook', schwere: 1 },
        ],
        ohneBefund: ['outlook-postausgang', 'outlook-offline', 'ol-sendet-erst-nach-f9'],
      },
      {
        id: 'ol-addins', titel: 'Knöpfe fehlen (enaio-Ablage, Teams-Besprechung)', beschreibung: 'In Outlook fehlt die enaio-Leiste oder der Knopf „Teams-Besprechung“',
        sonden: ['ol'],
        fragen: [{ id: 'enaio', text: 'Fehlt die enaio-Ablage?' }, { id: 'teams', text: 'Fehlt der Knopf „Teams-Besprechung“?' }],
        regeln: [
          { id: 'enaio-aus', wenn: f => f['ol.enaioLoad'] !== null && f['ol.enaioLoad'] !== undefined && num(f['ol.enaioLoad']) !== 3, befund: f => `enaio-Add-in ist deaktiviert (LoadBehavior ${f['ol.enaioLoad']})`, problem: 'outlook-enaio-addin-fehlt', schwere: 3 },
          { id: 'enaio-fehlt', wenn: f => f['ol.enaioLoad'] === null && f['frage.enaio'] !== 'nein', befund: () => 'enaio-Add-in ist auf diesem PC nicht installiert', problem: 'outlook-enaio-addin-fehlt', schwere: 2 },
          { id: 'teams-aus', wenn: f => f['ol.teamsLoad'] !== null && f['ol.teamsLoad'] !== undefined && num(f['ol.teamsLoad']) !== 3, befund: f => `Teams-Besprechungs-Add-in ist deaktiviert (LoadBehavior ${f['ol.teamsLoad']})`, problem: 'teams-besprechungsknopf-fehlt', schwere: 3 },
          { id: 'teams-fehlt', wenn: f => f['ol.teamsLoad'] === null && f['frage.teams'] !== 'nein', befund: () => 'Teams-Besprechungs-Add-in ist nicht registriert', problem: 'teams-besprechungsknopf-fehlt', schwere: 2 },
          { id: 'resilienz', wenn: f => num(f['ol.deaktivierteElemente']) > 0, befund: f => `Outlook hat ${f['ol.deaktivierteElemente']} Add-in(s) wegen Langsamkeit abgeschaltet`, problem: 'outlook-addin-deaktiviert', schwere: 2 },
        ],
        ohneBefund: ['outlook-enaio-addin-fehlt', 'teams-besprechungsknopf-fehlt', 'outlook-addin-deaktiviert'],
      },
      {
        id: 'ol-suche', titel: 'Outlook-Suche findet nichts', beschreibung: 'Suche liefert keine oder nur alte Mails, Suchfeld ausgegraut',
        sonden: ['ol'],
        regeln: [
          { id: 'suchdienst', wenn: f => f['ol.suchdienst'] !== null && f['ol.suchdienst'] !== undefined && txt(f['ol.suchdienst']) !== 'Running', befund: f => `Windows-Suchdienst läuft nicht (${txt(f['ol.suchdienst'])})`, problem: 'outlook-suche-nicht-verfuegbar', schwere: 3 },
          { id: 'suche-verboten', wenn: f => ja(f['ol.sucheVerboten']), befund: () => 'Die Indizierung von Outlook ist per Richtlinie verboten', problem: 'outlook-suche-nicht-verfuegbar', schwere: 2 },
          { id: 'online', wenn: f => ja(f['ol.cacheAusRichtlinie']), befund: () => 'Outlook arbeitet ohne Cache (Online-Modus) – Suche läuft dann über den Server', problem: 'ol-online-modus-statt-cache', schwere: 2 },
        ],
        ohneBefund: ['outlook-suche-findet-nichts', 'ol-suche-noch-indiziert', 'ol-suche-nur-aktueller-ordner'],
      },
      {
        id: 'ol-anmeldung', titel: 'Outlook fragt ständig nach Kennwort oder Anmeldung', beschreibung: 'Anmeldefenster kommt immer wieder, „Kennwort erforderlich“, Fenster bleibt weiß',
        sonden: ['aad', 'net'],
        regeln: [
          { id: 'kein-prt', wenn: f => nein(f['aad.prt']), befund: () => 'Das Anmeldetoken (PRT) fehlt – Office muss sich deshalb jedes Mal neu anmelden', problem: 'outlook-kennwort-abfrage', schwere: 3 },
          { id: 'kein-internet', wenn: f => nein(f['net.internet443']), befund: () => 'Microsoft-Anmeldung (login.microsoftonline.com) ist nicht erreichbar', problem: 'netz-kein-internet-verbunden', schwere: 3 },
          { id: 'nicht-entra', wenn: f => nein(f['aad.entraJoined']), befund: () => 'Der PC ist nicht in Entra ID angemeldet', problem: 'outlook-kennwort-abfrage', schwere: 2 },
        ],
        ohneBefund: ['outlook-kennwort-abfrage', 'outlook-anmeldefenster-leer', 'ol-gruppenpostfach-kennwort'],
      },
    ],
  },
]
