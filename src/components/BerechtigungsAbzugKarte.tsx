// ── Einstellungen → „Berechtigungs-Abzug“ (Admin) ─────────────────────────────
// Liest am Admin-PC NUR LESEND aus dem AD und von \\W3172\SKF Marine, wie Ordnerrechte bei SKF Marine
// aufgebaut sind, und speichert alles als JSON-Datei — Grundlage, um die Rechte-Prüfungen in
// „Gib dein Problem ein“ (Sonde „lwr“, Baustein „rechte-kollegen-vergleich“) zu verfeinern.
// Keine Personennamen: Mitglieder nur als Anzahl je Abteilung; managedBy nur „Gruppe …“ bzw. „Person“.
// Nichts wird geändert (kein Set-/Add-/Remove-, keine Server-Verbindung per WinRM).
//
// Tempo (v2): KEINE „memberOf:…1941“-Suche über alle Benutzer je Gruppe (im SKF-Wald Minuten pro Gruppe).
// Stattdessen Mitgliederliste der Gruppe direkt lesen (Bereichsabruf ab 1500), verschachtelte Gruppen selbst
// auflösen, Konten gebündelt (40 je Abfrage) nachschlagen, alles zwischengespeichert. Fortschritt in einer
// Statusdatei, Abbruch über eine Stopp-Datei, Zeitlimit 12 min → dann wird das Gelesene geliefert.
import { useEffect, useRef, useState } from 'react'
import { FileSearch, Loader2, CheckCircle2, XCircle, Download, Square } from 'lucide-react'
import Card from './Card'
import { api } from '../electronAPI'

const TAG = '@@ABZUG@@'
export const ABZUG_STATUS = 'C:\\ProgramData\\ITAdminTool\\abzug_status.txt'
export const ABZUG_STOPP = 'C:\\ProgramData\\ITAdminTool\\abzug_stop.txt'

export const SKRIPT_ABZUG = String.raw`
$ErrorActionPreference = 'Continue'; $ProgressPreference = 'SilentlyContinue'
$t0 = Get-Date
$budgetMin = 12
$toolOrdner = 'C:\ProgramData\ITAdminTool'
$statusDatei = Join-Path $toolOrdner 'abzug_status.txt'; $stoppDatei = Join-Path $toolOrdner 'abzug_stop.txt'
try { if (-not (Test-Path -LiteralPath $toolOrdner)) { [void](New-Item -ItemType Directory -Path $toolOrdner -Force) } } catch {}
try { if (Test-Path -LiteralPath $stoppDatei) { Remove-Item -LiteralPath $stoppDatei -Force -EA Stop } } catch {}
function Status([string]$t) { try { [IO.File]::WriteAllText($statusDatei, ([string][int]((Get-Date) - $t0).TotalSeconds) + '|' + $t, [Text.Encoding]::UTF8) } catch {} }
$script:abgebrochen = ''
function Genug {
  if ($script:abgebrochen) { return $true }
  if (Test-Path -LiteralPath $stoppDatei) { $script:abgebrochen = 'abgebrochen'; return $true }
  if (((Get-Date) - $t0).TotalMinutes -gt $budgetMin) { $script:abgebrochen = 'Zeitlimit ' + $budgetMin + ' min'; return $true }
  $false
}
$hinweise = New-Object System.Collections.ArrayList
Status 'Verzeichnis wird gelesen …'
$doms = @(); $wald = ''
try { $fo = [System.DirectoryServices.ActiveDirectory.Forest]::GetCurrentForest(); $wald = $fo.Name; $doms = @($fo.Domains | ForEach-Object { $_.Name }) } catch { [void]$hinweise.Add('Wald nicht lesbar: ' + $_.Exception.Message) }
if (-not $doms.Count -and $env:USERDNSDOMAIN) { $doms = @($env:USERDNSDOMAIN) }
$eigeneDom = if ($env:USERDNSDOMAIN) { $env:USERDNSDOMAIN.ToLower() } elseif ($doms.Count) { $doms[0] } else { '' }
function LdapEsc([string]$v) { $v.Replace('\', '\5c').Replace('*', '\2a').Replace('(', '\28').Replace(')', '\29') }
function Suche([string]$wurzel, [string]$filter, [string[]]$felder) {
  try { $such = New-Object System.DirectoryServices.DirectorySearcher([ADSI]$wurzel); $such.Filter = $filter; $such.PageSize = 500
    foreach ($fe in $felder) { [void]$such.PropertiesToLoad.Add($fe) }; @($such.FindAll()) } catch { [void]$hinweise.Add('Suche fehlgeschlagen (' + $wurzel + '): ' + $_.Exception.Message); @() }
}
function Wert($tr, [string]$feld) { $w = $tr.Properties[$feld.ToLower()]; if ($w -and $w.Count) { [string]$w[0] } else { '' } }
function DomVonDn([string]$dn) { (@($dn -split '(?<!\\),' | Where-Object { $_ -like 'DC=*' } | ForEach-Object { $_.Substring(3) })) -join '.' }
function CnVonDn([string]$dn) { (($dn -split '(?<!\\),')[0] -replace '^CN=', '') -replace '\\,', ',' }
function Gruppenbereich([string]$gt) { $n = 0L; [void][int64]::TryParse($gt, [ref]$n); if ($n -band 4) { 'domänenlokal' } elseif ($n -band 8) { 'universell' } elseif ($n -band 2) { 'global' } else { '' } }

# Mitgliederliste einer Gruppe (Bereichsabruf, auch > 1500 Mitglieder), zwischengespeichert
$mitgliedCache = @{}
function Mitglieder([string]$dn) {
  if ($mitgliedCache.ContainsKey($dn)) { return $mitgliedCache[$dn] }
  $alle = New-Object System.Collections.ArrayList
  $von = 0
  for ($runde = 0; $runde -lt 100; $runde++) {
    $attr = 'member;range=' + $von + '-*'
    $r = $null
    try {
      $such = New-Object System.DirectoryServices.DirectorySearcher([ADSI]('LDAP://' + (DomVonDn $dn) + '/' + $dn.Replace('/', '\/')))
      $such.SearchScope = 'Base'; $such.Filter = '(objectClass=*)'; [void]$such.PropertiesToLoad.Add($attr)
      $r = $such.FindOne()
    } catch { break }
    if (-not $r) { break }
    $key = @($r.Properties.PropertyNames | Where-Object { $_ -like 'member;range=*' }) | Select-Object -First 1
    if (-not $key) { break }
    $werte = @($r.Properties[$key])
    foreach ($m in $werte) { [void]$alle.Add([string]$m) }
    if ($key.EndsWith('*') -or -not $werte.Count) { break }
    $von += $werte.Count
  }
  $mitgliedCache[$dn] = $alle.ToArray()
  $mitgliedCache[$dn]
}
# Konten/Gruppen gebündelt nachschlagen (40 je Abfrage), zwischengespeichert
$objCache = @{}
function Aufloesen([string[]]$dns) {
  $offen = @($dns | Where-Object { $_ -and -not $objCache.ContainsKey($_) } | Select-Object -Unique)
  if (-not $offen.Count) { return }
  foreach ($gr in @($offen | Group-Object -Property { DomVonDn $_ })) {
    $liste = @($gr.Group)
    for ($i = 0; $i -lt $liste.Count; $i += 40) {
      $teil = @($liste[$i..([Math]::Min($i + 39, $liste.Count - 1))])
      $flt = '(|' + (($teil | ForEach-Object { '(distinguishedName=' + (LdapEsc $_) + ')' }) -join '') + ')'
      foreach ($r in (Suche ('LDAP://' + $gr.Name) $flt @('distinguishedName', 'objectClass', 'department', 'userAccountControl'))) {
        $oc = @($r.Properties['objectclass'] | ForEach-Object { [string]$_ })
        $uac = 0; [void][int]::TryParse((Wert $r 'userAccountControl'), [ref]$uac)
        $objCache[(Wert $r 'distinguishedName')] = [pscustomobject]@{ art = $(if ($oc -contains 'group') { 'group' } elseif ($oc -contains 'user') { 'user' } else { 'andere' }); abt = (Wert $r 'department'); aktiv = -not ($uac -band 2) }
      }
      foreach ($x in $teil) { if (-not $objCache.ContainsKey($x)) { $objCache[$x] = [pscustomobject]@{ art = 'andere'; abt = ''; aktiv = $false } } }
    }
  }
}
# Aktive Mitglieder je Abteilung (verschachtelte Gruppen werden aufgelöst, max. Tiefe 6, max. 5000 Konten)
function Verteilung([string]$gdn) {
  $z = @{}; $akt = 0; $aus = 0; $andere = 0
  $gesehen = New-Object System.Collections.Generic.HashSet[string]([StringComparer]::OrdinalIgnoreCase)
  $konten = New-Object System.Collections.Generic.HashSet[string]([StringComparer]::OrdinalIgnoreCase)
  $warte = New-Object System.Collections.Queue
  $warte.Enqueue([pscustomobject]@{ dn = $gdn; tiefe = 0 })
  while ($warte.Count) {
    $e = $warte.Dequeue()
    if ($e.tiefe -gt 6 -or -not $gesehen.Add($e.dn)) { continue }
    $mit = @(Mitglieder $e.dn)
    Aufloesen $mit
    foreach ($x in $mit) {
      $o = $objCache[$x]; if (-not $o) { continue }
      if ($o.art -eq 'group') { $warte.Enqueue([pscustomobject]@{ dn = $x; tiefe = $e.tiefe + 1 }) }
      elseif ($o.art -eq 'user') {
        if ($konten.Add($x)) { if ($o.aktiv) { $akt++; $ab = if ($o.abt) { $o.abt } else { '(leer)' }; $z[$ab] = 1 + [int]$z[$ab] } else { $aus++ } }
      } else { $andere++ }
    }
    if ($konten.Count -gt 5000) { [void]$hinweise.Add('Gruppe ' + (CnVonDn $gdn) + ': mehr als 5000 Konten – Zählung abgeschnitten'); break }
  }
  [pscustomobject]@{ aktiv = $akt; deaktiviert = $aus; andereMitglieder = $andere; verschachtelteGruppen = [Math]::Max(0, $gesehen.Count - 1); abteilungen = $z }
}
function GruppeLesen($g, [int]$nr, [int]$von, [string]$art) {
  $dn = Wert $g 'distinguishedName'; $dom = DomVonDn $dn; $cn = Wert $g 'cn'
  $mb = Wert $g 'managedBy'; $mbArt = ''
  if ($mb) { Aufloesen @($mb); $mo = $objCache[$mb]; $mbArt = if ($mo -and $mo.art -eq 'group') { 'Gruppe ' + (CnVonDn $mb) } else { 'Person' } }
  $innen = @(); $mitglieder = $null
  if (-not (Genug)) {
    Status ($art + ' ' + $nr + ' von ' + $von + ': ' + $cn)
    $direkt = @(Mitglieder $dn); Aufloesen $direkt
    $innen = @($direkt | Where-Object { $objCache[$_] -and $objCache[$_].art -eq 'group' } | ForEach-Object { CnVonDn $_ })
    $mitglieder = Verteilung $dn
  }
  [pscustomobject]@{
    cn = $cn; domaene = $dom; ou = (($dn -split '(?<!\\),' | Where-Object { $_ -like 'OU=*' }) -join ',')
    beschreibung = Wert $g 'description'; info = Wert $g 'info'; bereich = Gruppenbereich (Wert $g 'groupType')
    verwaltetVon = $mbArt; enthaeltGruppen = $innen; mitglieder = $mitglieder
  }
}
$felder = @('cn', 'description', 'distinguishedName', 'groupType', 'managedBy', 'info')
function GruppenSuchen([string]$filter, [string]$was) {
  $tr = @()
  if ($eigeneDom) { Status ($was + ' werden gesucht (Domäne ' + $eigeneDom + ') …'); $tr = @(Suche ('LDAP://' + $eigeneDom) $filter $felder) }
  if (-not $tr.Count -and $wald) { Status ($was + ' werden im ganzen Verzeichnis gesucht (kann dauern) …'); $tr = @(Suche ('GC://' + $wald) $filter $felder) }
  $tr
}
# 1) Freigabegruppen (W3172 / SKF Marine in Beschreibung oder Name)
$fg = @(GruppenSuchen '(&(objectCategory=group)(|(description=*W3172*)(description=*SKF Marine*)(cn=*W3172*)))' 'Freigabegruppen' | Select-Object -First 1500)
$freigabe = New-Object System.Collections.ArrayList
for ($i = 0; $i -lt $fg.Count; $i++) { [void]$freigabe.Add((GruppeLesen $fg[$i] ($i + 1) $fg.Count 'Freigabegruppe')) }
# 2) Fernzugriff-Rollen (ZPA/Akamai EAA)
$zg = @(GruppenSuchen '(&(objectCategory=group)(|(cn=EAA_*)(cn=Azure_AD_SSO_Akamai_EAA_Client)))' 'ZPA-Rollen' | Select-Object -First 300)
$zpa = New-Object System.Collections.ArrayList
for ($i = 0; $i -lt $zg.Count; $i++) { [void]$zpa.Add((GruppeLesen $zg[$i] ($i + 1) $zg.Count 'ZPA-Rolle')) }
# 2b) ALLE Gruppen, in denen die oben gefundenen Marine-Mitarbeiter direkt Mitglied sind – mit Häufigkeit
#     (Grundlage, um jede Berechtigung dem richtigen ServiceNow-Antrag und Fehlerbild zuzuordnen)
$alleGr = New-Object System.Collections.ArrayList
$basisMitarbeiter = 0
if (-not (Genug)) {
  $leute = @($objCache.Keys | Where-Object { $objCache[$_].art -eq 'user' -and $objCache[$_].aktiv })
  $basisMitarbeiter = $leute.Count
  Status ('Gruppen von ' + $leute.Count + ' Mitarbeitern werden gelesen …')
  $haeufig = @{}
  foreach ($gr in @($leute | Group-Object -Property { DomVonDn $_ })) {
    $liste = @($gr.Group)
    for ($i = 0; $i -lt $liste.Count; $i += 40) {
      if (Genug) { break }
      $teil = @($liste[$i..([Math]::Min($i + 39, $liste.Count - 1))])
      $flt = '(|' + (($teil | ForEach-Object { '(distinguishedName=' + (LdapEsc $_) + ')' }) -join '') + ')'
      foreach ($r in (Suche ('LDAP://' + $gr.Name) $flt @('memberOf'))) { foreach ($m in @($r.Properties['memberof'])) { $haeufig[[string]$m] = 1 + [int]$haeufig[[string]$m] } }
    }
  }
  $top = @($haeufig.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 2000)
  Status ('Details zu ' + $top.Count + ' Gruppen werden gelesen …')
  $det = @{}
  foreach ($gr in @($top | ForEach-Object { [string]$_.Key } | Group-Object -Property { DomVonDn $_ })) {
    $liste = @($gr.Group)
    for ($i = 0; $i -lt $liste.Count; $i += 40) {
      if (Genug) { break }
      $teil = @($liste[$i..([Math]::Min($i + 39, $liste.Count - 1))])
      $flt = '(|' + (($teil | ForEach-Object { '(distinguishedName=' + (LdapEsc $_) + ')' }) -join '') + ')'
      foreach ($r in (Suche ('LDAP://' + $gr.Name) $flt @('distinguishedName', 'cn', 'description', 'groupType', 'info', 'mail'))) { $det[(Wert $r 'distinguishedName')] = $r }
    }
  }
  foreach ($e in $top) {
    $dn = [string]$e.Key; $r = $det[$dn]
    $gt = 0L; if ($r) { [void][int64]::TryParse((Wert $r 'groupType'), [ref]$gt) }
    [void]$alleGr.Add([pscustomobject]@{
      cn = $(if ($r) { Wert $r 'cn' } else { CnVonDn $dn }); mitarbeiter = [int]$e.Value
      beschreibung = $(if ($r) { Wert $r 'description' } else { '' }); info = $(if ($r) { Wert $r 'info' } else { '' })
      sicherheitsgruppe = ($gt -lt 0); verteiler = $(if ($r) { [bool](Wert $r 'mail') } else { $false }); bereich = Gruppenbereich ([string]$gt)
      domaene = (DomVonDn $dn); ou = (($dn -split '(?<!\\),' | Where-Object { $_ -like 'OU=*' }) -join ',')
    })
  }
}
# 3) Ordner-Berechtigungen \\W3172\SKF Marine (Ebene 0–2, nur direkt gesetzte Einträge, max. 600 Ordner)
$acls = New-Object System.Collections.ArrayList
$wurzel = '\\W3172\SKF Marine'
if (Genug) { [void]$hinweise.Add('Ordnerrechte nicht gelesen (' + $script:abgebrochen + ')') }
elseif (Test-Path -LiteralPath $wurzel) {
  Status 'Ordnerliste von W3172 wird gelesen …'
  $liste = New-Object System.Collections.ArrayList
  [void]$liste.Add([pscustomobject]@{ pfad = $wurzel; ebene = 0 })
  foreach ($e1 in @(Get-ChildItem -LiteralPath $wurzel -Directory -Force -EA SilentlyContinue)) {
    [void]$liste.Add([pscustomobject]@{ pfad = $e1.FullName; ebene = 1 })
    foreach ($e2 in @(Get-ChildItem -LiteralPath $e1.FullName -Directory -Force -EA SilentlyContinue | Select-Object -First 40)) { [void]$liste.Add([pscustomobject]@{ pfad = $e2.FullName; ebene = 2 }) }
    if ($liste.Count -ge 600) { [void]$hinweise.Add('Ordnerliste bei 600 abgeschnitten'); break }
    if (Genug) { break }
  }
  $n = 0
  foreach ($o in $liste) {
    $n++; if ($n % 20 -eq 1) { Status ('Ordnerrechte ' + $n + ' von ' + $liste.Count) }
    if (Genug) { [void]$hinweise.Add('Ordnerrechte nach ' + ($n - 1) + ' Ordnern beendet (' + $script:abgebrochen + ')'); break }
    try {
      $acl = Get-Acl -LiteralPath $o.pfad -EA Stop
      $direkt = @($acl.Access | Where-Object { -not $_.IsInherited } | ForEach-Object { [pscustomobject]@{ wer = [string]$_.IdentityReference; rechte = [string]$_.FileSystemRights; typ = [string]$_.AccessControlType; gilt = ([string]$_.InheritanceFlags + '/' + [string]$_.PropagationFlags) } })
      [void]$acls.Add([pscustomobject]@{ pfad = $o.pfad; ebene = $o.ebene; vererbungAus = $acl.AreAccessRulesProtected; geerbt = @($acl.Access | Where-Object { $_.IsInherited }).Count; direkt = $direkt })
    } catch { [void]$acls.Add([pscustomobject]@{ pfad = $o.pfad; ebene = $o.ebene; fehler = $_.Exception.Message }) }
  }
} else { [void]$hinweise.Add($wurzel + ' nicht erreichbar') }
# 4) Freigaben des Servers (nur Anzeige)
$freigaben = @(); if (-not (Genug)) { try { $freigaben = @(net view \\W3172 /all 2>$null | Where-Object { $_ -match '\S' }) } catch {} }
if ($script:abgebrochen) { [void]$hinweise.Add('Unvollständig: ' + $script:abgebrochen + ' – Gruppen ohne „mitglieder“ wurden nicht mehr gezählt') }
Status 'Datei wird zusammengestellt …'
$erg = [ordered]@{
  art = 'IT-Admin-Tool Berechtigungs-Abzug'; version = 3; alleGruppen = $alleGr.ToArray(); basisMitarbeiter = $basisMitarbeiter; erstellt = (Get-Date).ToString('s'); rechner = $env:COMPUTERNAME
  domaenen = $doms; wald = $wald; dauerSek = [int]((Get-Date) - $t0).TotalSeconds; vollstaendig = (-not $script:abgebrochen)
  freigabegruppen = $freigabe.ToArray(); zpaRollen = $zpa.ToArray(); ordnerRechte = $acls.ToArray(); serverFreigaben = $freigaben; hinweise = $hinweise.ToArray()
}
$json = $erg | ConvertTo-Json -Depth 8 -Compress
try { Remove-Item -LiteralPath $statusDatei -Force -EA Stop } catch {}
try { if (Test-Path -LiteralPath $stoppDatei) { Remove-Item -LiteralPath $stoppDatei -Force -EA Stop } } catch {}
'${TAG}' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
`

interface Stand { laeuft: boolean; text: string; ok?: boolean }
const utf8 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))
const b64utf8 = (t: string) => btoa(unescape(encodeURIComponent(t)))

export default function BerechtigungsAbzugKarte() {
  const [stand, setStand] = useState<Stand | null>(null)
  const [fortschritt, setFortschritt] = useState('')
  const [daten, setDaten] = useState<{ b64: string; name: string } | null>(null)
  const [stoppt, setStoppt] = useState(false)
  const t0 = useRef(0)
  const [sek, setSek] = useState(0)

  // Fortschritt aus der Statusdatei lesen, solange der Abzug läuft
  useEffect(() => {
    if (!stand?.laeuft) return
    const i = setInterval(() => {
      setSek(Math.round((Date.now() - t0.current) / 1000))
      void api().readFile(ABZUG_STATUS).then(r => {
        if (!r.success || !r.data) return
        const t = utf8(r.data).replace(/^\uFEFF/, '')
        const j = t.indexOf('|')
        if (j > 0) setFortschritt(t.slice(j + 1))
      }).catch(() => {})
    }, 2000)
    return () => clearInterval(i)
  }, [stand?.laeuft])

  async function starte() {
    setDaten(null); setFortschritt(''); setStoppt(false); setSek(0); t0.current = Date.now()
    setStand({ laeuft: true, text: 'Liest AD und Ordnerrechte von W3172 (höchstens ca. 12 Minuten) …' })
    try {
      const r = await api().runPowerShell(SKRIPT_ABZUG, 25 * 60_000)
      const zeile = r.stdout.split(/\r?\n/).reverse().find(l => l.startsWith(TAG))
      if (!zeile) { setStand({ laeuft: false, ok: false, text: r.timedOut ? 'Abbruch nach 25 Minuten ohne Ergebnis.' : 'Keine Antwort: ' + (r.stderr || r.stdout).slice(-300) }); return }
      const b64 = zeile.slice(TAG.length).trim()
      const j = JSON.parse(utf8(b64)) as { alleGruppen?: unknown[]; freigabegruppen?: unknown[]; zpaRollen?: unknown[]; ordnerRechte?: unknown[]; hinweise?: string[]; dauerSek?: number; erstellt?: string; vollstaendig?: boolean }
      const n = (x?: unknown[]) => (Array.isArray(x) ? x.length : x ? 1 : 0)
      const name = `Berechtigungs-Abzug_${(j.erstellt || new Date().toISOString()).slice(0, 10)}.json`
      setDaten({ b64, name })
      setStand({ laeuft: false, ok: true, text: `${j.vollstaendig === false ? "Teilweise fertig" : "Fertig"}: ${n(j.alleGruppen)} Gruppen insgesamt · ${n(j.freigabegruppen)} Freigabegruppen · ${n(j.zpaRollen)} ZPA-Rollen · ${n(j.ordnerRechte)} Ordner in ${j.dauerSek ?? '?'} s${j.hinweise?.length ? ' · Hinweise: ' + j.hinweise.slice(0, 3).join(' | ') : ''}` })
    } catch (e) { setStand({ laeuft: false, ok: false, text: e instanceof Error ? e.message : String(e) }) }
  }

  async function stoppe() {
    setStoppt(true)
    // Das Skript prüft die Stopp-Datei zwischen den Gruppen und liefert dann das bisher Gelesene
    const r = await api().writeFile(ABZUG_STOPP, b64utf8('stop'))
    if (!r.success) { setStoppt(false); setFortschritt('Abbrechen nicht möglich: ' + (r.error || '')) }
  }

  async function speichere() {
    if (!daten) return
    const pfad = await api().saveFileDialog(daten.name, [{ name: 'JSON', extensions: ['json'] }])
    if (!pfad) return
    const r = await api().writeFile(pfad, daten.b64)
    setStand({ laeuft: false, ok: r.success, text: r.success ? `Gespeichert: ${pfad} – diese Datei bitte an Claude geben.` : `Speichern fehlgeschlagen: ${r.error || ''}` })
  }

  const mmss = `${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, '0')}`
  return (
    <Card title="Berechtigungs-Abzug (Ordnerrechte & ZPA-Rollen)" icon={<FileSearch size={15} />} subtitle="Liest nur: Freigabegruppen von W3172, ZPA-Rollen und die Ordnerrechte von \\W3172\SKF Marine – als Datei zur Auswertung der Rechte-Prüfungen">
      <p className="text-xs text-muted-foreground">Ändert nichts im AD und nichts am Server. Enthält Gruppennamen und -beschreibungen, die Zahl der aktiven Mitglieder je Abteilung (keine Namen) und die direkt gesetzten Ordner-Berechtigungen der ersten zwei Ebenen. Dauert höchstens ca. 12 Minuten; „Abbrechen“ speichert, was bis dahin gelesen ist.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { void starte() }} disabled={stand?.laeuft} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
          {stand?.laeuft ? <Loader2 size={13} className="animate-spin" /> : <FileSearch size={13} />}Abzug erstellen
        </button>
        {stand?.laeuft && (
          <button onClick={() => { void stoppe() }} disabled={stoppt} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50">
            <Square size={12} />{stoppt ? 'Wird beendet …' : 'Abbrechen (Bisheriges behalten)'}
          </button>
        )}
        {daten && (
          <button onClick={() => { void speichere() }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/10">
            <Download size={13} />Als Datei speichern
          </button>
        )}
      </div>
      {stand && (
        <p className={`text-xs inline-flex items-start gap-1.5 ${stand.laeuft ? 'text-muted-foreground' : stand.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {stand.laeuft ? <Loader2 size={13} className="animate-spin mt-0.5 shrink-0" /> : stand.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <XCircle size={13} className="mt-0.5 shrink-0" />}
          <span className="break-all">{stand.laeuft ? `${mmss} · ${fortschritt || stand.text}` : stand.text}</span>
        </p>
      )}
    </Card>
  )
}
