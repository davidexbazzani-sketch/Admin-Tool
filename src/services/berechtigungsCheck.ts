// ── Berechtigungscheck („Gib dein Problem ein“) ──────────────────────────────
// Liest EINMAL alle AD-Gruppen einer Person (auch verschachtelte, forestweit, nur lesend) und
// wertet sie je Gebiet aus: Homeoffice · SolidWorks · Ordner auf Laufwerk I: · Grundausstattung ·
// Lizenzen & Programme. Fehlt etwas, steht der passende ServiceNow-Antrag dabei.
// Das Tool ändert KEINE Berechtigungen — es zeigt sie nur und verlinkt den Antrag.

import { HO_ROLLEN, APP_ANTRAG, APP_LINK } from './homeofficeFit'
import { BER_ARTEN } from '../problemAssistent/berechtigungen'
import { W3172_ORDNER, W3172_ANTRAG, W3172_BEREICHE, w3172Pfad } from '../problemAssistent/w3172Ordner'

const api = () => (window as unknown as { electronAPI: { runPowerShell(c: string, t?: number): Promise<{ stdout: string; stderr: string }> } }).electronAPI

export type BcGebiet = 'homeoffice' | 'solidworks' | 'ordner' | 'grund' | 'lizenzen'
export const BC_GEBIETE: { id: BcGebiet; titel: string; wozu: string }[] = [
  { id: 'homeoffice', titel: 'Homeoffice', wozu: 'Fernzugriff: Grundrolle, Laufwerke, SAP, enaio' },
  { id: 'solidworks', titel: 'SolidWorks', wozu: 'Ist die Person in einer SolidWorks-Gruppe (Daten, Lizenz, Homeoffice)?' },
  { id: 'ordner', titel: 'Ordner auf Laufwerk I:', wozu: 'Abteilungsordner: Lesen, Ändern oder kein Zugriff' },
  { id: 'grund', titel: 'Grundausstattung', wozu: 'Microsoft 365, Firmen-WLAN, Kennwort selbst zurücksetzen' },
  { id: 'lizenzen', titel: 'Lizenzen & Programme', wozu: 'Copilot, Power BI, Visio/Project, Teams-Telefonie, Citrix, lokale Adminrechte …' },
]
export { W3172_BEREICHE }

export interface BcZeile {
  titel: string
  /** ok = vorhanden · fehlt = sollte da sein · offen = nicht vorhanden, nur bei Bedarf nötig */
  status: 'ok' | 'fehlt' | 'offen'
  detail?: string
  /** Antrag in ServiceNow: Name des Katalogeintrags und (wenn bekannt) der direkte Link */
  antrag?: { name: string; link?: string }
}

export interface BcKonto { sam?: string; upn?: string; vorname?: string; name?: string }
export interface BcGruppen { ok: boolean; konto?: string; anzeige?: string; gruppen: string[]; fehler?: string; mehrdeutig?: boolean }

/** Eingabe „Kennung“, „Vorname Nachname“, „Nachname, Vorname“ oder E-Mail → Suchangaben. */
export function deuteEingabe(text: string): BcKonto {
  const t = text.trim()
  if (!t) return {}
  if (t.includes('@')) return { upn: t }
  const komma = t.match(/^([^,]+),\s*(.+)$/)
  if (komma) return { name: komma[1].trim(), vorname: komma[2].trim() }
  const w = t.split(/\s+/)
  if (w.length >= 2) return { vorname: w.slice(0, -1).join(' '), name: w[w.length - 1] }
  return { sam: t }
}

/** Gruppen, die namentlich bekannt sind und auch in anderen Domänen liegen können (Homeoffice-Rollen, Ordner auf I:). */
export function exakteGruppen(): string[] {
  return [...new Set([...HO_ROLLEN.flatMap(r => r.gruppen), ...W3172_ORDNER.flatMap(o => [...o.rw, ...o.ro])])]
}

/**
 * Präfixe aller namentlich bekannten Gruppen (z. B. „EAA_“, „DEHAM-W3172_“). Eine Suche nach dem Anfang
 * des Namens nutzt im AD den Index — so muss das Skript keine ~190 Namen mitschleppen.
 * Nur Buchstaben, Ziffern, „_“ und „-“: braucht kein Maskieren und steht lesbar im Skript.
 */
export function gruppenPraefixe(): string[] {
  const aus = new Set<string>()
  for (const g of exakteGruppen()) {
    const m = g.match(/^Azure_AD_SSO_Akamai_EAA_/) || g.match(/^[A-Za-z0-9-]+_/)
    if (m) aus.add(m[0])
  }
  return [...aus].filter(x => /^[A-Za-z0-9_-]{3,40}$/.test(x)).sort()
}

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/**
 * Schnelle Gruppenabfrage (nur lesend), drei Schritte statt „jede Gruppe im Forest einzeln prüfen“:
 *  1) Person über den Global Catalog finden — EINE Abfrage für alle Domänen.
 *  2) tokenGroups des Kontos lesen: das AD liefert alle Sicherheitsgruppen inkl. Verschachtelung
 *     (eigene Domäne + universelle Gruppen) in einem Rutsch — dasselbe, was Windows bei der Anmeldung nutzt.
 *     Die Namen dazu in EINEM Aufruf übersetzen.
 *  3) Domänenlokale Gruppen in den ANDEREN Domänen (die stehen nicht in tokenGroups) — nur solche, deren
 *     Name mit einem bekannten Präfix beginnt (Index auf cn → schnell).
 * Vorher (11.11.2026 mittags) lief eine Abfrage ohne Namenseinschränkung über alle Gruppen aller Domänen —
 * dauerte ewig. Danach trug das Skript alle ~190 Gruppennamen als 13-KB-Base64-Block in der Befehlszeile; den
 * Start hat die Sicherheitssoftware am Admin-PC verweigert (spawn EPERM). Jetzt: klein, Präfixe lesbar im Skript.
 */
export function bcSkript(k: BcKonto): string {
  const daten = b64(JSON.stringify({ gid: (k.sam || '').trim(), upn: (k.upn || '').trim(), vn: (k.vorname || '').trim(), nn: (k.name || '').trim() }))
  const praefixe = gruppenPraefixe().map(x => `(cn=${x}*)`).join('')
  return String.raw`
$ErrorActionPreference = 'Stop'
$uhr = [Diagnostics.Stopwatch]::StartNew()
try {
  $in = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${daten}')) | ConvertFrom-Json
  function Esc([string]$s) { $s.Replace('\', '\5c').Replace('*', '\2a').Replace('(', '\28').Replace(')', '\29').Replace([string][char]0, '\00') }
  $forest = $null; try { $forest = [System.DirectoryServices.ActiveDirectory.Forest]::GetCurrentForest() } catch {}
  if (-not $forest) { throw 'Kein Active Directory erreichbar (Admin-PC nicht im Firmennetz?).' }
  $teile = @()
  if ($in.gid) { $teile += '(sAMAccountName=' + (Esc $in.gid) + ')' }
  if ($in.upn) { $teile += '(userPrincipalName=' + (Esc $in.upn) + ')'; $teile += '(mail=' + (Esc $in.upn) + ')' }
  if ($in.vn -and $in.nn) {
    $teile += '(displayName=' + (Esc ($in.vn + ' ' + $in.nn)) + ')'
    $teile += '(displayName=' + (Esc ($in.nn + ', ' + $in.vn)) + ')'
    $teile += '(&(givenName=' + (Esc $in.vn) + ')(sn=' + (Esc $in.nn) + '))'
  }
  if (-not $teile.Count) { throw 'Keine Person angegeben.' }
  # 1) Person: eine Abfrage im Global Catalog (alle Domänen)
  $su = New-Object System.DirectoryServices.DirectorySearcher([ADSI]('GC://' + $forest.Name))
  $su.Filter = '(&(objectCategory=person)(objectClass=user)(|' + ($teile -join '') + '))'
  $su.SizeLimit = 10; $su.ServerTimeLimit = [TimeSpan]::FromSeconds(15)
  foreach ($a in 'distinguishedName', 'sAMAccountName', 'displayName', 'userAccountControl') { [void]$su.PropertiesToLoad.Add($a) }
  $tr = @($su.FindAll())
  if (-not $tr.Count) { '@@BC@@' + (@{ ok = $false; fehler = 'Kein AD-Konto gefunden – Kennung, Name oder E-Mail prüfen.' } | ConvertTo-Json -Compress); return }
  # aktive Konten zuerst (deaktivierte Altkonten gleichen Namens ignorieren)
  $aktiv = @($tr | Where-Object { -not ([int]$_.Properties['useraccountcontrol'][0] -band 2) })
  if (-not $aktiv.Count) { $aktiv = $tr }
  $w = $aktiv[0]
  $dn = [string]$w.Properties['distinguishedname'][0]; $sam = [string]$w.Properties['samaccountname'][0]; $anz = [string]$w.Properties['displayname'][0]
  $gef = New-Object System.Collections.Generic.HashSet[string]([StringComparer]::OrdinalIgnoreCase)
  # 2) tokenGroups: alle Sicherheitsgruppen inkl. Verschachtelung in einem Rutsch
  $o = [ADSI]('LDAP://' + ($dn -replace '/', '\/'))
  $o.RefreshCache(@('tokenGroups'))
  $ids = New-Object System.Security.Principal.IdentityReferenceCollection
  foreach ($b in @($o.Properties['tokenGroups'])) { try { $ids.Add((New-Object System.Security.Principal.SecurityIdentifier([byte[]]$b, 0))) } catch {} }
  $namen = @()
  if ($ids.Count) { try { $namen = @($ids.Translate([System.Security.Principal.NTAccount], $false)) } catch {} }
  foreach ($n in $namen) { $v = [string]$n.Value; if ($v -and $v -notmatch '^S-1-') { [void]$gef.Add(($v -split '\\')[-1]) } }
  $token = $gef.Count
  # 3) domänenlokale Gruppen in den anderen Domänen, nur mit bekanntem Namensanfang
  $udom = (@($dn -split ',' | Where-Object { $_ -match '^DC=' } | ForEach-Object { $_.Substring(3) }) -join '.')
  $cns = '${praefixe}'
  if ($cns) {
    $edn = Esc $dn
    foreach ($dm in @($forest.Domains | ForEach-Object { $_.Name })) {
      if ($dm -ieq $udom) { continue }
      try {
        $sg = New-Object System.DirectoryServices.DirectorySearcher([ADSI]('LDAP://' + $dm))
        $sg.Filter = '(&(objectCategory=group)(groupType:1.2.840.113556.1.4.803:=4)(|' + $cns + ')(member:1.2.840.113556.1.4.1941:=' + $edn + '))'
        $sg.PageSize = 200; $sg.ServerTimeLimit = [TimeSpan]::FromSeconds(10); [void]$sg.PropertiesToLoad.Add('cn')
        foreach ($g in $sg.FindAll()) { [void]$gef.Add([string]$g.Properties['cn'][0]) }
      } catch {}
    }
  }
  '@@BC@@' + (ConvertTo-Json -Compress -InputObject @{ ok = $true; konto = $sam; anzeige = $anz; mehrdeutig = ($aktiv.Count -gt 1); gruppen = @($gef); token = $token; ms = $uhr.ElapsedMilliseconds })
} catch { '@@BC@@' + (@{ ok = $false; fehler = [string]$_.Exception.Message } | ConvertTo-Json -Compress) }
`
}

/** Antwort lesen (robust gegen Zusatzausgaben). */
export function leseBcAntwort(stdout: string): (BcGruppen & { ms?: number }) | null {
  const i = (stdout || '').lastIndexOf('@@BC@@')
  if (i < 0) return null
  try {
    const j = JSON.parse(stdout.slice(i + 6).trim())
    const g = j.gruppen == null ? [] : Array.isArray(j.gruppen) ? j.gruppen : [j.gruppen]
    return { ok: !!j.ok, konto: j.konto, anzeige: j.anzeige, mehrdeutig: !!j.mehrdeutig, fehler: j.fehler, gruppen: g.map(String), ms: j.ms }
  } catch { return null }
}

// Ergebnis je Person 10 Minuten merken: Gebiete umschalten oder erneut öffnen fragt das AD nicht noch einmal
const merk = new Map<string, { am: number; erg: BcGruppen }>()
const MERK_MS = 10 * 60_000
const merkKey = (k: BcKonto) => [k.sam, k.upn, k.vorname, k.name].map(x => (x || '').trim().toLowerCase()).join('|')

/** Alle Gruppen des Kontos lesen (nur lesend). `frisch` = gemerktes Ergebnis ignorieren. */
export async function leseAlleGruppen(k: BcKonto, frisch = false): Promise<BcGruppen & { ms?: number; gemerkt?: boolean }> {
  const key = merkKey(k)
  const alt = merk.get(key)
  if (!frisch && alt && Date.now() - alt.am < MERK_MS) return { ...alt.erg, gemerkt: true }
  try {
    const r = await api().runPowerShell(bcSkript(k), 45000)
    const a = leseBcAntwort(r.stdout || '')
    if (!a) return { ok: false, gruppen: [], fehler: (r.stderr || '').trim().split(/\r?\n/)[0] || 'Keine Antwort vom AD.' }
    if (!a.ok) return { ok: false, gruppen: [], fehler: a.fehler || 'Prüfung fehlgeschlagen.' }
    merk.set(key, { am: Date.now(), erg: a })
    return a
  } catch (e) {
    const t = e instanceof Error ? e.message : String(e)
    // Windows hat den Start von PowerShell verweigert: Sicherheitssoftware am Admin-PC (vgl. INC2844463). Nicht umgehen, sondern melden.
    if (/EPERM|EACCES|access is denied|zugriff verweigert/i.test(t)) return { ok: false, gruppen: [], fehler: 'Die Sicherheitssoftware am Admin-PC hat den Start der AD-Abfrage (PowerShell) blockiert. Bitte an die IT-Security melden und das IT Admin Tool über den offiziellen Weg freigeben lassen (vgl. INC2844463). Technisch: ' + t }
    return { ok: false, gruppen: [], fehler: t }
  }
}

const SW_GRUPPE = /solid.?works|sldw|\bswx|w3143|edrawings|\bpdm\b/i
const GRUND = ['m365-sync', 'm365', 'wlan', 'sspr']
const LIZENZ = ['copilot', 'powerbi', 'visio-project', 'teams-telefonie', 'lokaladmin', 'citrix', 'sap-bo', 'mdesign', 'docuglobe', 'idprove']

/** Reine Auswertung eines Gebiets. `bereich` = nur diese Ordnergruppe von Laufwerk I: (leer = alle). */
export function pruefeGebiet(gebiet: BcGebiet, gruppen: string[], bereich = ''): BcZeile[] {
  const g = new Set(gruppen.map(x => x.toLowerCase()))
  const hat = (cn: string) => g.has(cn.toLowerCase())
  const art = (id: string) => BER_ARTEN.find(a => a.id === id)
  if (gebiet === 'homeoffice') {
    return HO_ROLLEN.map(r => {
      const da = r.gruppen.find(hat)
      return { titel: r.titel, status: da ? 'ok' : 'fehlt', detail: da ? `Gruppe ${da}` : `fehlende Gruppe: ${r.gruppen[0]}`, antrag: da ? undefined : { name: r.antrag, link: r.link } } as BcZeile
    })
  }
  if (gebiet === 'solidworks') {
    const sw = gruppen.filter(x => SW_GRUPPE.test(x) && !/^EAA_/i.test(x))
    const ho = gruppen.filter(x => /^EAA_Solid/i.test(x))
    return [
      { titel: 'SolidWorks-Gruppe (Daten/Lizenzserver)', status: sw.length ? 'ok' : 'fehlt', detail: sw.length ? sw.join(', ') : 'in keiner SolidWorks-Gruppe', antrag: sw.length ? undefined : { name: 'SolidWorks' } },
      { titel: 'SolidWorks im Homeoffice (Lizenzserver von zu Hause)', status: ho.length ? 'ok' : 'offen', detail: ho.length ? ho.join(', ') : 'keine Homeoffice-Rolle für SolidWorks – nur nötig, wenn von zu Hause konstruiert wird', antrag: ho.length ? undefined : { name: APP_ANTRAG, link: APP_LINK } },
    ]
  }
  if (gebiet === 'ordner') {
    return W3172_ORDNER.filter(o => !bereich || o.segmente[0] === bereich).map(o => {
      const rw = o.rw.find(hat), ro = o.ro.find(hat)
      const aendern = !!rw || !!o.jederSchreiben, lesen = aendern || !!ro || !!o.jederLesen
      const wunsch = o.rw[0] || o.ro[0]
      return {
        titel: o.segmente.join(' › '),
        // Kein Zugriff auf einen Abteilungsordner ist kein Mangel (niemand braucht alle) — deshalb „offen“, mit Antrag
        status: lesen ? 'ok' : 'offen',
        detail: aendern ? `Ändern${rw ? ` (${rw})` : ' (alle Mitarbeiter)'}` : lesen ? `nur Lesen${ro ? ` (${ro})` : ' (alle Mitarbeiter)'}${o.rw[0] ? ` · Ändern über ${o.rw[0]}` : ''}` : `kein Zugriff${wunsch ? ` · nötig: ${wunsch}` : ''} · ${w3172Pfad(o)}`,
        antrag: aendern ? undefined : { name: W3172_ANTRAG },
      } as BcZeile
    })
  }
  const ids = gebiet === 'grund' ? GRUND : LIZENZ
  return ids.map(id => art(id)).filter((a): a is NonNullable<typeof a> => !!a).map(a => {
    const da = gruppen.filter(x => a.name?.test(x))
    return {
      titel: a.titel, status: da.length ? 'ok' : gebiet === 'grund' ? 'fehlt' : 'offen',
      detail: da.length ? da.slice(0, 4).join(', ') + (da.length > 4 ? ` … (+${da.length - 4})` : '') : a.wofuer,
      antrag: da.length ? undefined : { name: a.antrag },
    } as BcZeile
  })
}
