// ── Batched AD lookup for Title + Department ──────────────────────────────────
// Resolves a list of identities (SAM account names, Corp IDs, display names, or
// email addresses) against Active Directory and returns Title (Stellenbezeich-
// nung) and Department (Abteilung) for each.
//
// All identities are resolved in a single PowerShell call, so a list of 200
// devices is one round-trip — not 200. AD-Module is required on the admin PC
// (already the case for the rest of the tool).

import { api } from '../electronAPI'

export interface AdLookupResult {
  identity: string          // input identity as provided
  found: boolean
  department?: string
  title?: string
  displayName?: string
  sam?: string
  error?: string
}

// Escape a string so it can be safely embedded as a PowerShell single-quoted
// literal. PowerShell single quotes only need '' to escape inner quotes.
function psQuote(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'"
}

export async function batchAdLookup(identities: string[]): Promise<Map<string, AdLookupResult>> {
  const results = new Map<string, AdLookupResult>()
  const unique = [...new Set(identities.map(s => s.trim()).filter(Boolean))]
  if (unique.length === 0) return results

  // We emit one tab-separated line per identity. This is much more robust than
  // ConvertTo-Json which silently changes shape between 1-element and N-element
  // outputs and breaks on PowerShell pipeline unwrapping. The line format is:
  //   identity<TAB>found(0|1)<TAB>department<TAB>title<TAB>displayName<TAB>sam
  // Tabs in fields are not expected — we still escape them to be safe.
  const idsList = unique.map(psQuote).join(',')

  // Resolution strategies, applied in order until one returns exactly one user:
  //   1) SamAccountName -eq
  //   2) EmployeeID    -eq
  //   3) DisplayName   -eq
  //   4) DisplayName   -like '*input*'  (only accepted if it resolves to exactly one user)
  //   5) EmailAddress  -eq
  //
  // We deliberately avoid `Get-ADUser -Identity` (validation-heavy, throws on
  // non-SAM/DN/GUID inputs) and `-LDAPFilter` (escaping pitfalls). The native
  // `-Filter` syntax with -eq / -like is reliable across PowerShell versions.
  const script = [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `$props = @('SamAccountName','DisplayName','Title','Department','EmployeeID','EmailAddress')`,
    `$tab = [char]9`,
    `foreach ($id in @(${idsList})) {`,
    `  $u = $null`,
    `  try {`,
    `    $idStr = ($id -as [string])`,
    `    $esc = $idStr -replace "'", "''"`,
    // 1) SamAccountName exact
    `    $u = Get-ADUser -Filter "SamAccountName -eq '$esc'" -Properties $props -EA SilentlyContinue | Select-Object -First 1`,
    // 2) EmployeeID exact
    `    if (-not $u) {`,
    `      $u = Get-ADUser -Filter "EmployeeID -eq '$esc'" -Properties $props -EA SilentlyContinue | Select-Object -First 1`,
    `    }`,
    // 3) DisplayName exact
    `    if (-not $u) {`,
    `      $u = Get-ADUser -Filter "DisplayName -eq '$esc'" -Properties $props -EA SilentlyContinue | Select-Object -First 1`,
    `    }`,
    // 4) DisplayName wildcard (only accept if uniquely resolves)
    `    if (-not $u) {`,
    `      $cands = @(Get-ADUser -Filter "DisplayName -like '*$esc*'" -Properties $props -ResultSetSize 5 -EA SilentlyContinue)`,
    `      if ($cands.Count -eq 1) { $u = $cands[0] }`,
    `      elseif ($cands.Count -gt 1) {`,
    `        $exact = $cands | Where-Object { $_.DisplayName -eq $idStr } | Select-Object -First 1`,
    `        if ($exact) { $u = $exact }`,
    `      }`,
    `    }`,
    // 5) EmailAddress exact
    `    if (-not $u) {`,
    `      $u = Get-ADUser -Filter "EmailAddress -eq '$esc'" -Properties $props -EA SilentlyContinue | Select-Object -First 1`,
    `    }`,
    `  } catch { $u = $null }`,
    `  if ($u) {`,
    `    $dept = ([string]$u.Department) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `    $title = ([string]$u.Title) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `    $disp = ([string]$u.DisplayName) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `    $sam = [string]$u.SamAccountName`,
    `    Write-Output ("ADRES$tab" + $id + $tab + '1' + $tab + $dept + $tab + $title + $tab + $disp + $tab + $sam)`,
    `  } else {`,
    `    Write-Output ("ADRES$tab" + $id + $tab + '0' + $tab + '' + $tab + '' + $tab + '' + $tab + '')`,
    `  }`,
    `}`,
  ].join('\n')

  // 1.5 s per identity is generous; 30 s floor.
  const timeoutMs = Math.max(30000, unique.length * 1500)

  try {
    console.log('[batchAdLookup] identities:', unique)
    const res = await api().runPowerShell(script, timeoutMs)
    const raw = res.stdout ?? ''
    console.log('[batchAdLookup] PS stdout (first 500):', raw.slice(0, 500))
    if (res.stderr) console.log('[batchAdLookup] PS stderr:', res.stderr.slice(0, 500))

    const lines = raw.split(/\r?\n/).filter(l => l.startsWith('ADRES\t'))
    for (const line of lines) {
      const parts = line.split('\t')
      // parts[0] = 'ADRES'
      // parts[1] = identity
      // parts[2] = found (0|1)
      // parts[3] = department
      // parts[4] = title
      // parts[5] = displayName
      // parts[6] = sam
      if (parts.length < 3) continue
      const identity = parts[1]
      const found = parts[2] === '1'
      results.set(identity, {
        identity,
        found,
        department: found && parts[3] ? parts[3] : undefined,
        title: found && parts[4] ? parts[4] : undefined,
        displayName: found && parts[5] ? parts[5] : undefined,
        sam: found && parts[6] ? parts[6] : undefined,
      })
    }

    // Fill in any identity that didn't come back
    for (const id of unique) {
      if (!results.has(id)) results.set(id, { identity: id, found: false, error: 'Keine Antwort' })
    }
    console.log('[batchAdLookup] results:', results)
    return results
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[batchAdLookup] exception:', msg)
    for (const id of unique) results.set(id, { identity: id, found: false, error: msg })
    return results
  }
}
