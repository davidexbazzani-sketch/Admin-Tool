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
  email?: string            // EmailAddress (fuer Direktversand)
  reportsCount?: number     // Anzahl direkt unterstellter Mitarbeiter (Abteilungsleiter, wenn > 0)
  manager?: string          // Vorgesetzter (DisplayName)
  managerSam?: string       // Vorgesetzter (SamAccountName)
  error?: string
}

// Escape a string so it can be safely embedded as a PowerShell single-quoted
// literal. PowerShell single quotes only need '' to escape inner quotes.
function psQuote(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'"
}

// Build the PowerShell script for a single batch of identities.
// Each identity goes through these strategies (first match wins):
//   1) SamAccountName -eq      (exact SAM)
//   2) EmployeeID    -eq       (exact employee/corp ID)
//   3) DisplayName   -eq       (exact display name)
//   4) EmailAddress  -eq       (exact mail)
// Wildcard search is intentionally NOT used here — it's slow on large AD trees
// and the user explicitly corrects names manually when AD lookup fails.
//
// Output: one tab-separated line per identity, prefixed with "ADRES\t".
function buildScript(batch: string[]): string {
  const idsList = batch.map(psQuote).join(',')
  return [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `$props = @('SamAccountName','DisplayName','Title','Department','EmployeeID','EmailAddress','UserPrincipalName','Manager','DirectReports')`,
    `$tab = [char]9`,
    `foreach ($id in @(${idsList})) {`,
    `  $u = $null`,
    `  try {`,
    `    $idStr = ($id -as [string])`,
    `    $esc = $idStr -replace "'", "''"`,
    `    $u = Get-ADUser -Filter "SamAccountName -eq '$esc'" -Properties $props -EA SilentlyContinue | Select-Object -First 1`,
    `    if (-not $u) {`,
    `      $u = Get-ADUser -Filter "EmployeeID -eq '$esc'" -Properties $props -EA SilentlyContinue | Select-Object -First 1`,
    `    }`,
    `    if (-not $u) {`,
    `      $u = Get-ADUser -Filter "DisplayName -eq '$esc'" -Properties $props -EA SilentlyContinue | Select-Object -First 1`,
    `    }`,
    `    if (-not $u) {`,
    `      $u = Get-ADUser -Filter "EmailAddress -eq '$esc'" -Properties $props -EA SilentlyContinue | Select-Object -First 1`,
    `    }`,
    `  } catch { $u = $null }`,
    `  if ($u) {`,
    `    $dept = ([string]$u.Department) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `    $title = ([string]$u.Title) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `    $disp = ([string]$u.DisplayName) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `    $sam = [string]$u.SamAccountName`,
    `    $mail = ([string]$u.EmailAddress) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `    $upn = ([string]$u.UserPrincipalName) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `    $rc = 0; if ($u.DirectReports) { $rc = @($u.DirectReports).Count }`,
    `    $mgrName = ''; $mgrSam = ''`,
    `    if ($u.Manager) {`,
    `      try {`,
    `        $mgr = Get-ADUser -Identity $u.Manager -Properties DisplayName -EA SilentlyContinue`,
    `        if ($mgr) {`,
    `          $mgrName = ([string]$mgr.DisplayName) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `          $mgrSam = [string]$mgr.SamAccountName`,
    `        }`,
    `      } catch { $mgrName = ''; $mgrSam = '' }`,
    `    }`,
    `    Write-Output ("ADRES$tab" + $id + $tab + '1' + $tab + $dept + $tab + $title + $tab + $disp + $tab + $sam + $tab + $mgrName + $tab + $mgrSam + $tab + $mail + $tab + [string]$rc + $tab + $upn)`,
    `  } else {`,
    `    Write-Output ("ADRES$tab" + $id + $tab + '0' + $tab + '' + $tab + '' + $tab + '' + $tab + '' + $tab + '' + $tab + '' + $tab + '' + $tab + '' + $tab + '')`,
    `  }`,
    `}`,
  ].join('\n')
}

// Per-batch tuning.
//   - BATCH_SIZE: a single PowerShell process handles this many identities
//   - PARALLEL_BATCHES: how many PS processes run in parallel
//   - TIMEOUT_MS: hard cap per batch — keep generous so batches with many
//     not-found entries (each goes through all 4 resolution strategies) still
//     finish. With 25 identities and ~3s worst-case per lookup, 120s is safe.
const BATCH_SIZE = 25
const PARALLEL_BATCHES = 3
const TIMEOUT_MS = 120000

async function runBatch(batch: string[], results: Map<string, AdLookupResult>): Promise<void> {
  try {
    const res = await api().runPowerShell(buildScript(batch), TIMEOUT_MS)
    const raw = res.stdout ?? ''
    if (res.stderr) console.log('[batchAdLookup] batch stderr:', res.stderr.slice(0, 300))

    const lines = raw.split(/\r?\n/).filter(l => l.startsWith('ADRES\t'))
    for (const line of lines) {
      const parts = line.split('\t')
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
        manager: found && parts[7] ? parts[7] : undefined,
        managerSam: found && parts[8] ? parts[8] : undefined,
        // E-Mail: bevorzugt EmailAddress, sonst der UPN (oft = Mailadresse, falls
        // das mail-Attribut leer ist).
        email: (() => {
          const mail = found && parts[9] ? parts[9].trim() : ''
          if (mail) return mail
          const upn = found && parts[11] ? parts[11].trim() : ''
          return upn.includes('@') ? upn : undefined
        })(),
        reportsCount: found && parts[10] !== undefined && parts[10] !== '' ? Number(parts[10]) : undefined,
      })
    }
    // For identities in this batch that didn't come back in stdout (e.g. batch
    // hit the timeout before processing them), explicitly mark as "no answer"
    // so the UI can distinguish them from "found = false".
    for (const id of batch) {
      if (!results.has(id)) {
        results.set(id, {
          identity: id,
          found: false,
          error: res.timedOut ? 'Batch-Timeout (zu viele unaufloesbare Identitaeten?)' : 'Keine Antwort',
        })
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[batchAdLookup] batch exception:', msg)
    for (const id of batch) {
      if (!results.has(id)) results.set(id, { identity: id, found: false, error: msg })
    }
  }
}

export async function batchAdLookup(
  identities: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, AdLookupResult>> {
  const results = new Map<string, AdLookupResult>()
  const unique = [...new Set(identities.map(s => s.trim()).filter(Boolean))]
  if (unique.length === 0) return results

  // Split into batches of BATCH_SIZE
  const batches: string[][] = []
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    batches.push(unique.slice(i, i + BATCH_SIZE))
  }
  console.log(`[batchAdLookup] ${unique.length} identities -> ${batches.length} batches of up to ${BATCH_SIZE}`)

  let done = 0
  onProgress?.(0, unique.length)

  // Process with bounded parallelism. Each "wave" runs PARALLEL_BATCHES
  // batches concurrently, then we await the wave before starting the next.
  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    const wave = batches.slice(i, i + PARALLEL_BATCHES)
    await Promise.all(
      wave.map(async batch => {
        await runBatch(batch, results)
        done += batch.length
        onProgress?.(done, unique.length)
      }),
    )
  }

  // Safety net — fill in anything that somehow slipped through
  for (const id of unique) {
    if (!results.has(id)) results.set(id, { identity: id, found: false, error: 'Keine Antwort' })
  }
  console.log('[batchAdLookup] complete:', { total: unique.length, batches: batches.length })
  return results
}
