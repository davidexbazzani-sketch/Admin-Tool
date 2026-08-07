// ── AD Gruppen-Suche ──────────────────────────────────────────────────────────
// Sucht Benutzer ODER Computer im Active Directory anhand ihrer Gruppen-
// Mitgliedschaften ("Mitglied von"). Logik:
//   - Der Suchbegriff wird an Leerzeichen in Tokens zerlegt.
//   - Es zaehlen nur Gruppen, deren NAME ALLE Tokens als Teilstring enthaelt
//     (Gross-/Kleinschreibung egal) — alle Tokens in EIN UND DERSELBEN Gruppe.
//   - Ein Treffer ist jede(r) Benutzer/Computer, der Mitglied mindestens einer
//     solchen Gruppe ist.
//   - Optional: verschachtelte (transitive) Mitgliedschaften einbeziehen.
//
// Die eigentliche Arbeit macht der Domain Controller serverseitig (LDAP-Filter).
// Es handelt sich um reine Lese-Abfragen — der DC kann dadurch nicht abstuerzen.

import { api } from '../electronAPI'

export type SearchMode = 'user' | 'computer'

export interface GroupSearchResult {
  type: SearchMode
  sam: string                 // SamAccountName (Computer: ohne $)
  name: string                // DisplayName (User) bzw. Computername
  col1: string                // User: Titel | Computer: DNS-Hostname
  col2: string                // User: Abteilung | Computer: Betriebssystem
  col3: string                // User: E-Mail | Computer: Beschreibung
  enabled: boolean
  lastLogon: string           // ISO oder ''
  matchedGroups: string[]     // Gruppen, die den Treffer ausgeloest haben
  allGroups: string[]         // alle direkten "Mitglied von"-Gruppen
}

export interface GroupSearchResponse {
  ok: boolean
  error?: string
  mode: SearchMode
  query: string
  tokens: string[]
  recursive: boolean
  matchingGroups: string[]
  results: GroupSearchResult[]
  capped: boolean
  durationMs: number
}

const RESULT_CAP = 3000
const TIMEOUT_MS = 180000

/** Tokens: an Leerzeichen splitten, leere entfernen, kleinschreiben. */
export function tokenize(query: string): string[] {
  return query.trim().split(/\s+/).map(t => t.trim()).filter(Boolean)
}

/** LDAP-Sonderzeichen in einem Token maskieren (RFC 4515). */
function ldapEscape(token: string): string {
  return token
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
}

/** PowerShell-Single-Quote-String maskieren. */
function psEscape(s: string): string {
  return s.replace(/'/g, "''")
}

function buildScript(mode: SearchMode, tokens: string[], recursive: boolean): string {
  // Gruppen-Filter: alle Tokens muessen im Gruppennamen als Teilstring vorkommen.
  const tokenFilters = tokens.map(t => `(name=*${ldapEscape(t)}*)`).join('')
  const groupFilter = `(&(objectCategory=group)${tokenFilters})`
  const wantClass = mode === 'user' ? 'user' : 'computer'

  // CN aus einem DN extrahieren (erste RDN, fuehrendes "CN=" entfernen)
  const cnExpr = `[regex]::Match([string]$_,'^CN=([^,]+)').Groups[1].Value`

  const lines: string[] = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `Import-Module ActiveDirectory -EA SilentlyContinue`,
    `$cap = ${RESULT_CAP}`,
    `$groups = @(Get-ADGroup -LDAPFilter '${psEscape(groupFilter)}' -EA SilentlyContinue)`,
    `if (-not $groups -or $groups.Count -eq 0) {`,
    `  Write-Output ('@STAT@' + ([pscustomobject]@{groupCount=0;resultCount=0;capped=$false} | ConvertTo-Json -Compress))`,
    `  return`,
    `}`,
    `foreach ($g in $groups) { Write-Output ('@GRP@' + [string]$g.Name) }`,
    `$map = @{}`,
    `foreach ($g in $groups) {`,
    `  $members = @()`,
    `  try {`,
    recursive
      ? `    $members = @(Get-ADGroupMember -Identity $g.DistinguishedName -Recursive -EA SilentlyContinue)`
      : `    $members = @(Get-ADGroupMember -Identity $g.DistinguishedName -EA SilentlyContinue)`,
    `  } catch { $members = @() }`,
    `  foreach ($m in $members) {`,
    `    if ([string]$m.objectClass -ne '${wantClass}') { continue }`,
    `    $dn = [string]$m.distinguishedName`,
    `    if (-not $map.ContainsKey($dn)) { $map[$dn] = New-Object System.Collections.Generic.List[string] }`,
    `    if (-not $map[$dn].Contains([string]$g.Name)) { $map[$dn].Add([string]$g.Name) }`,
    `  }`,
    `}`,
    `$dns = @($map.Keys)`,
    `$total = $dns.Count`,
    `$capped = $false`,
    `if ($total -gt $cap) { $dns = @($dns)[0..($cap-1)]; $capped = $true }`,
    `foreach ($dn in $dns) {`,
    `  $matched = ($map[$dn] -join '||')`,
    `  try {`,
  ]

  if (mode === 'user') {
    lines.push(
      `    $u = Get-ADUser -Identity $dn -Properties DisplayName,Title,Department,EmailAddress,UserPrincipalName,Enabled,LastLogonDate,memberOf -EA Stop`,
      `    $all = (@($u.memberOf | ForEach-Object { ${cnExpr} }) -join '||')`,
      `    $ll = if ($u.LastLogonDate) { $u.LastLogonDate.ToString('o') } else { '' }`,
      `    $em = [string]$u.EmailAddress; if (-not $em) { $up = [string]$u.UserPrincipalName; if ($up -like '*@*') { $em = $up } }`,
      `    $obj = [pscustomobject]@{ type='user'; sam=[string]$u.SamAccountName; name=[string]$u.DisplayName; col1=[string]$u.Title; col2=[string]$u.Department; col3=$em; enabled=[bool]$u.Enabled; lastLogon=$ll; matched=$matched; groups=$all }`,
    )
  } else {
    lines.push(
      `    $c = Get-ADComputer -Identity $dn -Properties DNSHostName,OperatingSystem,Description,Enabled,LastLogonDate,memberOf -EA Stop`,
      `    $all = (@($c.memberOf | ForEach-Object { ${cnExpr} }) -join '||')`,
      `    $ll = if ($c.LastLogonDate) { $c.LastLogonDate.ToString('o') } else { '' }`,
      `    $nm = ([string]$c.SamAccountName).TrimEnd('$')`,
      `    $obj = [pscustomobject]@{ type='computer'; sam=$nm; name=[string]$c.Name; col1=[string]$c.DNSHostName; col2=[string]$c.OperatingSystem; col3=[string]$c.Description; enabled=[bool]$c.Enabled; lastLogon=$ll; matched=$matched; groups=$all }`,
    )
  }

  lines.push(
    `    Write-Output ('@RES@' + ($obj | ConvertTo-Json -Compress -Depth 3))`,
    `  } catch {}`,
    `}`,
    `Write-Output ('@STAT@' + ([pscustomobject]@{groupCount=$groups.Count;resultCount=$dns.Count;capped=$capped} | ConvertTo-Json -Compress))`,
  )

  return lines.join('\n')
}

interface RawResult {
  type: string
  sam: string
  name: string
  col1: string
  col2: string
  col3: string
  enabled: boolean
  lastLogon: string
  matched: string
  groups: string
}

function splitGroups(joined: string): string[] {
  if (!joined) return []
  return joined.split('||').map(s => s.trim()).filter(Boolean)
}

export async function searchByGroup(mode: SearchMode, query: string, recursive: boolean): Promise<GroupSearchResponse> {
  const start = Date.now()
  const tokens = tokenize(query)
  const base: GroupSearchResponse = {
    ok: false, mode, query, tokens, recursive,
    matchingGroups: [], results: [], capped: false, durationMs: 0,
  }
  if (tokens.length === 0) {
    return { ...base, error: 'Bitte einen Suchbegriff eingeben.' }
  }

  try {
    const script = buildScript(mode, tokens, recursive)
    const res = await api().runPowerShell(script, TIMEOUT_MS)
    const lines = (res.stdout ?? '').split(/\r?\n/)

    const matchingGroups: string[] = []
    const results: GroupSearchResult[] = []
    let capped = false

    for (const raw of lines) {
      const line = raw.trim()
      if (line.startsWith('@GRP@')) {
        const g = line.slice(5).trim()
        if (g) matchingGroups.push(g)
      } else if (line.startsWith('@RES@')) {
        try {
          const o = JSON.parse(line.slice(5)) as RawResult
          results.push({
            type: o.type === 'computer' ? 'computer' : 'user',
            sam: o.sam ?? '',
            name: o.name || o.sam || '',
            col1: o.col1 ?? '',
            col2: o.col2 ?? '',
            col3: o.col3 ?? '',
            enabled: !!o.enabled,
            lastLogon: o.lastLogon ?? '',
            matchedGroups: splitGroups(o.matched),
            allGroups: splitGroups(o.groups),
          })
        } catch { /* defekte Zeile ueberspringen */ }
      } else if (line.startsWith('@STAT@')) {
        try {
          const s = JSON.parse(line.slice(6)) as { groupCount: number; resultCount: number; capped: boolean }
          capped = !!s.capped
        } catch { /* ignore */ }
      }
    }

    // Sortierung: aktive zuerst, dann alphabetisch nach Name
    results.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      return a.name.localeCompare(b.name, 'de')
    })

    const stderr = (res.stderr ?? '').trim()
    if (matchingGroups.length === 0 && results.length === 0 && stderr) {
      return { ...base, durationMs: Date.now() - start, error: `AD-Abfrage fehlgeschlagen: ${stderr.slice(0, 200)}` }
    }

    return {
      ok: true,
      mode, query, tokens, recursive,
      matchingGroups,
      results,
      capped,
      durationMs: Date.now() - start,
    }
  } catch (e) {
    return { ...base, durationMs: Date.now() - start, error: e instanceof Error ? e.message : String(e) }
  }
}
