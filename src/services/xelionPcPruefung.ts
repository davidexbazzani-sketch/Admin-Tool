// ── Xelion am PC: installiert und wann zuletzt benutzt? ─────────────────────
//
// Läuft NUR auf Knopfdruck für eine Auswahl von Personen. Xelion ist ein MSIX-Paket
// („XelionWindowsDesktop"), taucht also im normalen Software-Inventar (Uninstall-Schlüssel)
// nicht auf. Gelesen wird deshalb direkt am PC, nur lesend:
//   · Get-AppxPackage -AllUsers → Version und je Benutzer-SID, ob das Paket registriert ist
//   · Profil des Benutzers (SID → ProfileList, sonst Ordnername) → neueste Datei im
//     Paket-Datenordner …\AppData\Local\Packages\XelionWindowsDesktop_*\ = „zuletzt genutzt"
//   · läuft Xelion gerade (Prozess aus …\WindowsApps\XelionWindowsDesktop_*)?
//
// Leistungsregeln: Online-Check vorab, dann Blöcke zu 10 PCs mit EINEM Invoke-Command
// (ThrottleLimit 10). Jeder PC bekommt alle Corp IDs des Blocks — wer dort ein Profil hat,
// wird mit erfasst, auch wenn der PC ihm nicht zugeordnet ist.

import { api } from '../electronAPI'
import { buildParallelOnlineCheck, parseOnlineCheckLine } from '../utils/connectivityCheck'
import { ensureWinRM } from '../utils/winrmUtils'
import { ladeHardwareIndex } from './personMasterData'
import { speicherePcBefunde, type HostBefund, type PcPersonBefund, type PcPruefungDatei } from './xelionLizenzen'

/** Höchstens so viele PCs je Person. */
const MAX_PCS_JE_PERSON = 3
const BLOCK = 10
const ONLINE_BLOCK = 40
/** Grobe Dauer je Block (für die Zeitschätzung). */
export const SEKUNDEN_JE_BLOCK = 35

export interface PcPruefPerson {
  key: string
  name: string
  sam: string
}

export interface PcPruefFortschritt {
  text: string
  fertig: number
  gesamt: number
}

const MARKE = '@@XLP@@'
const FEHLER_MARKE = '@@XLE@@'

/** Läuft auf dem entfernten PC. Nur lesend. Ausgabe: genau ein JSON-Text. */
export const REMOTE_SKRIPT = String.raw`
param([string[]]$sams)
$ErrorActionPreference = 'SilentlyContinue'
$pkg = @(Get-AppxPackage -AllUsers -Name 'XelionWindowsDesktop')
$ver = ''
if ($pkg.Count -gt 0) { $ver = [string]$pkg[0].Version }
$inst = @{}
foreach ($p in $pkg) {
  foreach ($ui in @($p.PackageUserInformation)) {
    $sid = [string]$ui.UserSecurityId.Sid
    if (-not $sid) { $sid = [string]$ui.UserSecurityId }
    if ($sid) { $inst[$sid] = [string]$ui.InstallState }
  }
}
$procs = @(Get-Process -IncludeUserName | Where-Object { $_.Path -like '*\WindowsApps\XelionWindowsDesktop_*' })
$pl = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList'
$profs = @(Get-ChildItem -LiteralPath $pl | ForEach-Object {
  $pp = Get-ItemProperty -LiteralPath $_.PSPath
  [pscustomobject]@{ Sid = [string]$_.PSChildName; Pfad = [string]$pp.ProfileImagePath; Hi = $pp.LocalProfileLoadTimeHigh; Lo = $pp.LocalProfileLoadTimeLow }
})
$out = New-Object System.Collections.ArrayList
foreach ($s in $sams) {
  $sid = ''
  try { $sid = (New-Object System.Security.Principal.NTAccount($s)).Translate([System.Security.Principal.SecurityIdentifier]).Value } catch {}
  $pr = $null
  if ($sid) { $pr = $profs | Where-Object { $_.Sid -eq $sid } | Select-Object -First 1 }
  if (-not $pr) {
    $muster = '^' + [regex]::Escape($s) + '(\.|$)'
    $pr = $profs | Where-Object { $_.Pfad -and ((Split-Path $_.Pfad -Leaf) -match $muster) } | Select-Object -First 1
    if ($pr) { $sid = $pr.Sid }
  }
  $st = ''
  if ($sid -and $inst.ContainsKey($sid)) { $st = $inst[$sid] }
  if (-not $pr) { [void]$out.Add([pscustomobject]@{ S = $s; P = $false; I = $st }); continue }
  $pfad = [Environment]::ExpandEnvironmentVariables($pr.Pfad)
  $zuletzt = ''
  if ($pr.Hi -ne $null -and $pr.Lo -ne $null) {
    $hi = [int64]$pr.Hi; if ($hi -lt 0) { $hi += 4294967296 }
    $lo = [int64]$pr.Lo; if ($lo -lt 0) { $lo += 4294967296 }
    $ft = $hi * 4294967296 + $lo
    if ($ft -gt 0) { try { $zuletzt = [DateTime]::FromFileTime($ft).ToString('o') } catch {} }
  }
  $neu = $null; $quelle = ''
  $dirs = @(Get-ChildItem -LiteralPath (Join-Path $pfad 'AppData\Local\Packages') -Directory -Filter 'XelionWindowsDesktop_*' -Force)
  foreach ($d in $dirs) {
    foreach ($sub in @('LocalState', 'LocalCache', 'Settings', 'RoamingState')) {
      $sp = Join-Path $d.FullName $sub
      if (-not (Test-Path -LiteralPath $sp)) { continue }
      $f = Get-ChildItem -LiteralPath $sp -Recurse -File -Force | Select-Object -First 3000 | Sort-Object LastWriteTime -Descending | Select-Object -First 1
      if ($f -and ((-not $neu) -or $f.LastWriteTime -gt $neu)) { $neu = $f.LastWriteTime; $quelle = $sub + $f.FullName.Substring($sp.Length) }
    }
  }
  $lauf = @($procs | Where-Object { $_.UserName -and (($_.UserName -split '\\')[-1] -ieq $s) }).Count -gt 0
  $n = ''
  if ($neu) { $n = $neu.ToString('o') }
  [void]$out.Add([pscustomobject]@{ S = $s; P = $true; I = $st; D = ($dirs.Count -gt 0); N = $n; Q = $quelle; L = $lauf; A = $zuletzt })
}
ConvertTo-Json -InputObject @{ V = $ver; Pk = ($pkg.Count -gt 0); U = @($out) } -Depth 4 -Compress
`

function psListe(werte: string[]): string {
  return '@(' + werte.map(w => `'${w.replace(/'/g, "''")}'`).join(',') + ')'
}

/** Ein Block: alle PCs gleichzeitig per Invoke-Command, Ergebnis je PC mit Marke. */
export function blockSkript(hosts: string[], sams: string[]): string {
  return [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$hosts=${psListe(hosts)}`,
    `$sams=[string[]]${psListe(sams)}`,
    `$sb=[scriptblock]::Create(@'`,
    REMOTE_SKRIPT,
    `'@)`,
    `$so=New-PSSessionOption -OpenTimeout 15000 -OperationTimeout 90000`,
    `$ev=$null`,
    `$res=@(Invoke-Command -ComputerName $hosts -ScriptBlock $sb -ArgumentList (,$sams) -ThrottleLimit ${BLOCK} -SessionOption $so -ErrorAction SilentlyContinue -ErrorVariable ev)`,
    `foreach ($r in $res) { Write-Output ('${MARKE}' + [string]$r.PSComputerName + '|' + [string]$r) }`,
    `foreach ($e in @($ev)) { Write-Output ('${FEHLER_MARKE}' + ([string]$e).Replace([char]10,' ').Replace([char]13,' ')) }`,
  ].join('\n')
}

interface RemoteUser { S: string; P: boolean; I?: string; D?: boolean; N?: string; Q?: string; L?: boolean; A?: string }
interface RemoteAntwort { V?: string; Pk?: boolean; U?: RemoteUser[] | RemoteUser }

/** Wertet die Ausgabe eines Blocks aus. */
export function leseBlock(stdout: string): { je: Map<string, RemoteAntwort>; fehler: string[] } {
  const je = new Map<string, RemoteAntwort>()
  const fehler: string[] = []
  for (const zeile of (stdout || '').split(/\r?\n/)) {
    if (zeile.startsWith(MARKE)) {
      const rest = zeile.slice(MARKE.length)
      const i = rest.indexOf('|')
      if (i < 0) continue
      try { je.set(rest.slice(0, i).trim().toUpperCase(), JSON.parse(rest.slice(i + 1)) as RemoteAntwort) } catch { /* unlesbar → gilt als Fehler */ }
    } else if (zeile.startsWith(FEHLER_MARKE)) fehler.push(zeile.slice(FEHLER_MARKE.length).trim())
  }
  return { je, fehler }
}

function befundAus(a: RemoteAntwort, u: RemoteUser | undefined, jetzt: string, von: string): HostBefund {
  const registriert = !!u?.I
  return {
    geprueftAm: jetzt, geprueftVon: von, erreichbar: true,
    version: a.V || undefined,
    profil: !!u?.P,
    // Kein Paket auf dem PC → sicher nicht installiert. Paket da, aber nicht für diesen
    // Benutzer → ebenfalls nicht installiert (MSIX ist je Benutzer registriert).
    installiert: a.Pk ? registriert : false,
    installState: u?.I || undefined,
    zuletztGenutzt: u?.N || undefined,
    quelle: u?.Q || undefined,
    reste: !!u?.D && !registriert,
    laeuft: !!u?.L,
    profilZuletzt: u?.A || undefined,
  }
}

function nichtErreichbar(jetzt: string, von: string, fehler: string): HostBefund {
  return { geprueftAm: jetzt, geprueftVon: von, erreichbar: false, fehler, profil: false, installiert: null }
}

/**
 * Prüft die Personen an ihren PCs und speichert die Befunde. `abbrechen()` wird zwischen
 * den Blöcken gefragt. Liefert die gespeicherte Datei (für die neue Einstufung).
 */
export async function pruefeXelionAmPc(
  personen: PcPruefPerson[], von: string,
  onFortschritt: (f: PcPruefFortschritt) => void,
  abbrechen: () => boolean,
): Promise<{ datei: PcPruefungDatei | null; hinweis: string }> {
  const jetzt = () => new Date().toISOString()
  const mitSam = personen.filter(p => p.sam)
  onFortschritt({ text: 'Zugeordnete PCs werden gesucht …', fertig: 0, gesamt: 0 })
  const finde = await ladeHardwareIndex()

  const hostsJe = new Map<string, string[]>()   // sam(lc) → Hosts
  const ergebnis: Record<string, PcPersonBefund> = {}
  for (const p of mitSam) {
    const hosts = finde(p.name, p.sam).slice(0, MAX_PCS_JE_PERSON)
    const k = p.sam.toLowerCase()
    hostsJe.set(k, hosts)
    if (!hosts.length) ergebnis[k] = { hosts: {}, keinPcAm: jetzt() }
  }
  const alleHosts = [...new Set([...hostsJe.values()].flat())]

  // ── Online-Check ──
  const online = new Set<string>()
  for (let i = 0; i < alleHosts.length; i += ONLINE_BLOCK) {
    if (abbrechen()) break
    onFortschritt({ text: `Online-Check ${Math.min(i + ONLINE_BLOCK, alleHosts.length)} / ${alleHosts.length} PCs …`, fertig: 0, gesamt: alleHosts.length })
    const r = await api().runPowerShell(buildParallelOnlineCheck(alleHosts.slice(i, i + ONLINE_BLOCK)), 60000)
    for (const z of (r.stdout || '').split(/\r?\n/)) {
      if (!z.trim()) continue
      const o = parseOnlineCheckLine(z)
      if (o.online) online.add(o.hostname.toUpperCase())
    }
  }
  const offline = alleHosts.filter(h => !online.has(h))

  // ── Blöcke ──
  const roh = new Map<string, RemoteAntwort>()
  const fehlerJeHost = new Map<string, string>()
  const lauf = async (hosts: string[], sams: string[]) => {
    const r = await api().runPowerShell(blockSkript(hosts, sams), 150000)
    const { je, fehler } = leseBlock(r.stdout || '')
    for (const [h, a] of je) roh.set(h, a)
    for (const h of hosts) {
      if (roh.has(h)) continue
      const f = fehler.find(x => x.toUpperCase().includes(h)) || (r.timedOut ? 'Zeitüberschreitung' : 'keine Antwort per WinRM')
      fehlerJeHost.set(h, f)
    }
  }
  const samsFuer = (hosts: string[]) => {
    const set = new Set(hosts)
    return [...new Set(mitSam.filter(p => (hostsJe.get(p.sam.toLowerCase()) ?? []).some(h => set.has(h))).map(p => p.sam))]
  }
  const onlineListe = [...online]
  let abgebrochen = false
  for (let i = 0; i < onlineListe.length; i += BLOCK) {
    if (abbrechen()) { abgebrochen = true; break }
    const hosts = onlineListe.slice(i, i + BLOCK)
    onFortschritt({ text: `Xelion wird an ${hosts.length} PCs geprüft …`, fertig: i, gesamt: onlineListe.length })
    await lauf(hosts, samsFuer(hosts))
  }
  // WinRM-Fehler: einmal WinRM einschalten (max. 5 gleichzeitig), dann nochmal
  const nochmal = onlineListe.filter(h => !roh.has(h) && fehlerJeHost.has(h))
  if (nochmal.length && !abgebrochen && !abbrechen()) {
    onFortschritt({ text: `WinRM wird an ${nochmal.length} PC(s) aktiviert …`, fertig: onlineListe.length - nochmal.length, gesamt: onlineListe.length })
    const bereit: string[] = []
    for (let i = 0; i < nochmal.length; i += 5) {
      const teil = nochmal.slice(i, i + 5)
      const ok = await Promise.all(teil.map(h => ensureWinRM(h).catch(() => false)))
      teil.forEach((h, j) => { if (ok[j]) bereit.push(h) })
    }
    for (let i = 0; i < bereit.length; i += BLOCK) {
      if (abbrechen()) break
      await lauf(bereit.slice(i, i + BLOCK), samsFuer(bereit.slice(i, i + BLOCK)))
    }
  }

  // ── Befunde je Person ──
  for (const p of mitSam) {
    const k = p.sam.toLowerCase()
    const zugeordnet = hostsJe.get(k) ?? []
    if (!zugeordnet.length) continue
    const b: PcPersonBefund = { hosts: {} }
    for (const h of zugeordnet) {
      const a = roh.get(h)
      if (a) {
        const us = Array.isArray(a.U) ? a.U : a.U ? [a.U] : []
        b.hosts[h] = befundAus(a, us.find(u => u.S.toLowerCase() === k), jetzt(), von)
      } else if (offline.includes(h)) b.hosts[h] = nichtErreichbar(jetzt(), von, 'offline')
      else if (fehlerJeHost.has(h)) b.hosts[h] = nichtErreichbar(jetzt(), von, fehlerJeHost.get(h)!)
      // abgebrochen → Host gar nicht anfassen
    }
    // Profile auf fremden PCs des Blocks mitnehmen (Person sitzt woanders)
    for (const [h, a] of roh) {
      if (zugeordnet.includes(h)) continue
      const us = Array.isArray(a.U) ? a.U : a.U ? [a.U] : []
      const u = us.find(x => x.S.toLowerCase() === k)
      if (u?.P && (u.I || u.D)) b.hosts[h] = befundAus(a, u, jetzt(), von)
    }
    if (Object.keys(b.hosts).length) ergebnis[k] = b
  }

  if (!Object.keys(ergebnis).length) {
    return { datei: null, hinweis: abgebrochen ? 'Abgebrochen — nichts gespeichert.' : 'Keine Befunde.' }
  }
  const datei = await speicherePcBefunde(ergebnis)
  const ohnePc = mitSam.filter(p => !(hostsJe.get(p.sam.toLowerCase()) ?? []).length).length
  const teile = [
    `${roh.size} von ${alleHosts.length} PCs geprüft`,
    offline.length ? `${offline.length} offline` : '',
    fehlerJeHost.size ? `${[...fehlerJeHost.keys()].filter(h => !roh.has(h)).length} ohne WinRM-Antwort` : '',
    ohnePc ? `${ohnePc} Person(en) ohne bekannten PC` : '',
    personen.length - mitSam.length ? `${personen.length - mitSam.length} ohne Corp ID übersprungen` : '',
    abgebrochen ? 'abgebrochen' : '',
  ].filter(Boolean)
  return { datei, hinweis: teile.join(' · ') }
}
