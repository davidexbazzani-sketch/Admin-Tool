// ── Endgeraete: "Zuletzt online" ermitteln ────────────────────────────────────
// Bestimmt fuer eine Liste von PC-Namen (Hostname aus der Endgeraete-Uebersicht),
// wann das Geraet zuletzt online / angemeldet war. Es werden mehrere Quellen
// KOMBINIERT, um moeglichst genau zu sein:
//   1) Live-Ping  -> ist das Geraet GERADE JETZT erreichbar? (exakt "jetzt")
//   2) AD lastLogonTimestamp (repliziert, Basiswert)
//   3) AD lastLogon von ALLEN erreichbaren Domain-Controllern (nicht repliziert,
//      sekundengenau) -> der juengste Wert ueber alle DCs ist die praezise letzte
//      Anmeldung.
// Der spaeteste dieser Zeitpunkte gilt als "zuletzt online".
//
// Reine Lese-Abfragen gegen AD + ICMP-Ping. Kein WinRM. Laeuft on-demand auf der
// aktuell gefilterten Geraeteauswahl, in parallelen Batches (Performance-Regeln:
// max. ~6 gleichzeitige PS-Prozesse).

import { api } from '../electronAPI'

export type LastOnlineSource = 'online-now' | 'ad' | 'unknown'

export interface LastOnlineRow {
  hostname: string
  online: boolean            // aktuell per Ping erreichbar
  lastOnline?: string        // ISO — bester bekannter Zeitpunkt der letzten Anmeldung/Online
  source: LastOnlineSource
  inAd: boolean              // Computerkonto in AD gefunden
  enabled?: boolean          // Computerkonto aktiviert
  os?: string
  error?: string
}

export interface HostQuery {
  hostname: string
  serial?: string
}

function psQuote(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'"
}

const BATCH_SIZE = 15
const PARALLEL_BATCHES = 6
const TIMEOUT_MS = 150000

function buildScript(items: HostQuery[]): string {
  const hn = items.map(i => psQuote(i.hostname)).join(',')
  const sn = items.map(i => psQuote(i.serial ?? '')).join(',')
  return [
    `$ErrorActionPreference='SilentlyContinue'`,
    `Add-Type -AssemblyName System.DirectoryServices -EA SilentlyContinue`,
    `$tab=[char]9`,
    `$ping = New-Object System.Net.NetworkInformation.Ping`,
    // ── Alle Domaenen des Forests ermitteln (wie "Gesamtes Verzeichnis") ──────────
    //    Rein ueber LDAP aus dem Partitions-Container — keine ADWS-/AD-Modul-
    //    Abhaengigkeit. Eigene Domaene zuerst, damit lokale Geraete schnell da sind.
    `$domains = New-Object System.Collections.Generic.List[string]`,
    `$cur = ([string]$env:USERDNSDOMAIN).ToLower()`,
    `if ($cur) { $domains.Add($cur) }`,
    `try {`,
    `  $rootDSE = New-Object System.DirectoryServices.DirectoryEntry("LDAP://RootDSE")`,
    `  $cfg = [string]$rootDSE.Properties['configurationNamingContext'][0]`,
    `  if ($cfg) {`,
    `    $part = New-Object System.DirectoryServices.DirectoryEntry("LDAP://CN=Partitions,$cfg")`,
    `    $pds = New-Object System.DirectoryServices.DirectorySearcher($part)`,
    `    $pds.Filter='(&(objectCategory=crossRef)(systemFlags:1.2.840.113556.1.4.803:=2))'`,
    `    $pds.PageSize=100; $pds.ClientTimeout=[TimeSpan]::FromSeconds(10)`,
    `    [void]$pds.PropertiesToLoad.Add('dnsRoot')`,
    `    foreach ($res in $pds.FindAll()) { if ($res.Properties['dnsroot'].Count -gt 0) { $dr=([string]$res.Properties['dnsroot'][0]).ToLower(); if ($dr -and -not $domains.Contains($dr)) { $domains.Add($dr) } } }`,
    `  }`,
    `} catch {}`,
    `$badDoms = @{}`,
    `$hn = @(${hn})`,
    `$sn = @(${sn})`,
    `for ($i=0; $i -lt $hn.Count; $i++) {`,
    `  $nm = [string]$hn[$i]; $sr = [string]$sn[$i]`,
    `  $short = ($nm -split '\\.')[0]`,
    // Werte fuer den LDAP-Filter auf Alphanumerik+Bindestrich reduzieren (sicher
    // gegen LDAP-Sonderzeichen; Hostnamen/Serien enthalten nur solche Zeichen).
    `  $cnE = ($short -replace '[^A-Za-z0-9-]','')`,
    `  $srE = ($sr -replace '[^A-Za-z0-9-]','')`,
    // Match auf: exakter Name/CN, Name-Suffix (faengt Praefix-Unterschiede wie
    // de/deham/desch), SamAccountName, sowie Seriennummer als Name/DNS-Suffix.
    `  $flt2 = "(&(objectCategory=computer)(|(name=$cnE)(cn=$cnE)(name=*$cnE)"`,
    `  $flt2 = $flt2 + '(sAMAccountName=' + $cnE + '$)'`,
    `  if ($srE) { $flt2 = $flt2 + "(name=*$srE)(dNSHostName=*$srE*)" }`,
    `  $flt2 = $flt2 + '))'`,
    `  $foundFlag=$false; $dnsName=''; $osName=''; $enFlag=''; $best=[int64]0; $objDn=''; $objDom=''`,
    // Ueber alle Forest-Domaenen per LDAP suchen (erste Domaene mit Treffer gewinnt)
    `  foreach ($dom in $domains) {`,
    `    if ($badDoms.ContainsKey($dom)) { continue }`,
    `    try {`,
    `      $root = New-Object System.DirectoryServices.DirectoryEntry("LDAP://$dom")`,
    `      $s = New-Object System.DirectoryServices.DirectorySearcher($root)`,
    `      $s.PageSize=10; $s.SizeLimit=1; $s.Filter=$flt2; $s.ClientTimeout=[TimeSpan]::FromSeconds(8)`,
    `      [void]$s.PropertiesToLoad.Add('distinguishedName')`,
    `      [void]$s.PropertiesToLoad.Add('dNSHostName')`,
    `      [void]$s.PropertiesToLoad.Add('operatingSystem')`,
    `      [void]$s.PropertiesToLoad.Add('lastLogonTimestamp')`,
    `      [void]$s.PropertiesToLoad.Add('userAccountControl')`,
    `      $r = $s.FindOne()`,
    `      if ($r) {`,
    `        $foundFlag=$true`,
    `        $objDn = [string]$r.Properties['distinguishedname'][0]`,
    `        if ($r.Properties['dnshostname'].Count -gt 0) { $dnsName=[string]$r.Properties['dnshostname'][0] }`,
    `        if ($r.Properties['operatingsystem'].Count -gt 0) { $osName=([string]$r.Properties['operatingsystem'][0]) -replace "[$([char]9)$([char]10)$([char]13)]",' ' }`,
    `        if ($r.Properties['lastlogontimestamp'].Count -gt 0) { try { $best=[int64]$r.Properties['lastlogontimestamp'][0] } catch {} }`,
    `        $uac=0; if ($r.Properties['useraccountcontrol'].Count -gt 0) { $uac=[int]$r.Properties['useraccountcontrol'][0] }`,
    `        $enFlag = $(if (($uac -band 2) -eq 0) {'1'} else {'0'})`,
    `        $objDom = $dom`,
    `        break`,
    `      }`,
    `    } catch { $badDoms[$dom]=$true }`,
    `  }`,
    // Online-Status: echten AD-DNS-Namen bevorzugen, sonst importierten Namen
    `  $pt = $nm; if ($dnsName) { $pt = $dnsName }`,
    `  $online='0'; try { if ($pt) { if ($ping.Send($pt,700).Status -eq 'Success') { $online='1' } } } catch {}`,
    `  $iso=''; if ($best -gt 0) { try { $iso=([DateTime]::FromFileTimeUtc($best)).ToString('o') } catch {} }`,
    `  $foundStr = $(if ($foundFlag) {'1'} else {'0'})`,
    `  Write-Output ("LO$tab$nm$tab$online$tab$foundStr$tab$enFlag$tab$iso$tab$osName")`,
    `}`,
  ].join('\n')
}

async function runBatch(items: HostQuery[], out: Map<string, LastOnlineRow>): Promise<void> {
  const nowIso = new Date().toISOString()
  const hosts = items.map(i => i.hostname)
  try {
    const res = await api().runPowerShell(buildScript(items), TIMEOUT_MS)
    const lines = (res.stdout ?? '').split(/\r?\n/).filter(l => l.startsWith('LO\t'))
    for (const line of lines) {
      const p = line.split('\t')
      if (p.length < 6) continue
      const hostname = p[1]
      const online = p[2] === '1'
      const inAd = p[3] === '1'
      const enabled = p[4] === '' ? undefined : p[4] === '1'
      const iso = p[5] || ''
      const os = p[6] || undefined
      let lastOnline: string | undefined
      let source: LastOnlineSource
      if (online) { lastOnline = nowIso; source = 'online-now' }
      else if (iso) { lastOnline = iso; source = 'ad' }
      else { source = 'unknown' }
      out.set(hostname.toLowerCase(), { hostname, online, lastOnline, source, inAd, enabled, os })
    }
    // Fehlende (Timeout o. Ae.) als "unknown" markieren
    for (const h of hosts) {
      if (!out.has(h.toLowerCase())) {
        out.set(h.toLowerCase(), { hostname: h, online: false, source: 'unknown', inAd: false, error: res.timedOut ? 'Zeitueberschreitung' : 'Keine Antwort' })
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    for (const h of hosts) {
      if (!out.has(h.toLowerCase())) out.set(h.toLowerCase(), { hostname: h, online: false, source: 'unknown', inAd: false, error: msg })
    }
  }
}

export async function scanLastOnline(
  items: HostQuery[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, LastOnlineRow>> {
  const out = new Map<string, LastOnlineRow>()
  // pro Hostname nur einmal (erste Seriennummer gewinnt)
  const seen = new Set<string>()
  const unique: HostQuery[] = []
  for (const it of items) {
    const h = (it.hostname ?? '').trim()
    if (!h || seen.has(h.toLowerCase())) continue
    seen.add(h.toLowerCase())
    unique.push({ hostname: h, serial: (it.serial ?? '').trim() })
  }
  if (unique.length === 0) return out

  const batches: HostQuery[][] = []
  for (let i = 0; i < unique.length; i += BATCH_SIZE) batches.push(unique.slice(i, i + BATCH_SIZE))

  let done = 0
  onProgress?.(0, unique.length)
  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    const wave = batches.slice(i, i + PARALLEL_BATCHES)
    await Promise.all(wave.map(async batch => {
      await runBatch(batch, out)
      done += batch.length
      onProgress?.(done, unique.length)
    }))
  }
  return out
}

// ── Hilfsfunktionen fuer die Auswertung ───────────────────────────────────────

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * (365.25 / 12)

/** Anzahl Monate seit dem Zeitpunkt (oder null, wenn unbekannt). */
export function monthsSince(iso?: string): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (isNaN(t)) return null
  return (Date.now() - t) / MS_PER_MONTH
}
