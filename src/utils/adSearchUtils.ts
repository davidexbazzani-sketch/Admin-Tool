// ── Shared AD user-search utilities ──────────────────────────────────────────
// Used by UserInfo (main lookup) and GroupComparisonPanel (autocomplete/compare)

export interface CandidateUser {
  Sam: string
  Name: string
  EmpID: string
  Dept: string
  Title: string
}

// ── Session cache (Map persists for lifetime of renderer process) ─────────────
const searchCache = new Map<string, CandidateUser[]>()

export function getCached(term: string): CandidateUser[] | undefined {
  return searchCache.get(term.trim().toLowerCase())
}
export function setCached(term: string, results: CandidateUser[]): void {
  // Cap cache size to avoid unbounded growth
  if (searchCache.size > 200) searchCache.clear()
  searchCache.set(term.trim().toLowerCase(), results)
}

// ── LDAP filter builder ───────────────────────────────────────────────────────
// Pre-computed in JS so we can use a PS single-quoted literal (no PS expansion)
function buildLdapFilter(esc: string, officeFilter?: string): string {
  const officePart = officeFilter ? `(physicalDeliveryOfficeName=${officeFilter})` : ''
  const words = esc.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    const fn = words[0]
    const ln = words[words.length - 1]
    return (
      `(&(objectCategory=person)(objectClass=user)${officePart}` +
      `(|(displayName=*${esc}*)` +
      `(&(givenName=*${fn}*)(sn=*${ln}*))` +
      `(&(givenName=*${ln}*)(sn=*${fn}*))))`
    )
  }
  return (
    `(&(objectCategory=person)(objectClass=user)${officePart}` +
    `(|(displayName=*${esc}*)(sn=*${esc}*)(givenName=*${esc}*)` +
    `(sAMAccountName=*${esc}*)(employeeID=${esc})(mail=${esc}*)))`
  )
}

// ── PS query: lightweight search, returns CandidateUser[] or special tokens ──
// Result format (stdout):
//   Single exact match  → {"Sam":...}         (JSON object)
//   Multiple results    → [{"Sam":...}, ...]  (JSON array)
//   No results          → []
//   Too many (>20)      → "TOO_MANY"
export function buildLightSearchQuery(term: string, timeout = 10000, options?: { hamburgFirst?: boolean; allLocations?: boolean }): string {
  const esc = term.trim().replace(/'/g, "''")
  const hamburgOffice = 'Hamburg - Hermann Blohm Strasse'
  // timeout param unused in PS but kept for caller convenience
  void timeout

  // Determine office filter
  const searchHamburg = options?.hamburgFirst !== false // default true
  const searchAll = options?.allLocations ?? false
  const officeFilter = (searchHamburg && !searchAll) ? hamburgOffice : undefined
  const ldapFilter = buildLdapFilter(esc, officeFilter)

  const formatResult = `@($r | ForEach-Object { @{Sam=[string]$_.SamAccountName;Name=[string]$_.DisplayName;EmpID=[string]$_.EmployeeID;Dept=[string]$_.Department;Title=[string]$_.Title} }) | ConvertTo-Json -Compress`

  const lines = [
    `try {`,
    `  $lp = @('DisplayName','EmployeeID','Department','Title')`,
    `  $u = $null`,
    `  try { $u = Get-ADUser -Identity '${esc}' -Properties $lp -EA Stop } catch {}`,
    `  if (!$u) { try { $u = Get-ADUser -Filter "EmployeeID -eq '${esc}'" -Properties $lp -EA Stop | Select-Object -First 1 } catch {} }`,
    `  if ($u) {`,
    `    @{Sam=[string]$u.SamAccountName;Name=[string]$u.DisplayName;EmpID=[string]$u.EmployeeID;Dept=[string]$u.Department;Title=[string]$u.Title} | ConvertTo-Json -Compress`,
    `  } else {`,
    `    $r = @(Get-ADUser -LDAPFilter '${ldapFilter}' -Properties $lp -ResultSetSize 21 -EA SilentlyContinue)`,
  ]

  // If Hamburg-first + both checked: fallback to all locations if no results
  if (searchHamburg && searchAll) {
    const allFilter = buildLdapFilter(esc) // no office filter
    lines.push(`    if (!$r -or $r.Count -eq 0) { $r = @(Get-ADUser -LDAPFilter '${allFilter}' -Properties $lp -ResultSetSize 21 -EA SilentlyContinue) }`)
  }

  lines.push(
    `    if (!$r) { Write-Output '[]' }`,
    `    elseif ($r.Count -gt 20) { Write-Output '"TOO_MANY"' }`,
    `    else { ${formatResult} }`,
    `  }`,
    `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
  )
  return lines.join('\n')
}

// ── Parse result from buildLightSearchQuery ───────────────────────────────────
export function parseLightSearchResult(stdout: string): {
  candidates: CandidateUser[]
  tooMany: boolean
  error?: string
} {
  const out = stdout.trim()
  if (!out || out === '[]') return { candidates: [], tooMany: false }
  if (out === '"TOO_MANY"') return { candidates: [], tooMany: true }
  if (out.startsWith('ERR:')) return { candidates: [], tooMany: false, error: out.slice(4) }
  try {
    const parsed = JSON.parse(out)
    if (Array.isArray(parsed)) return { candidates: parsed as CandidateUser[], tooMany: false }
    return { candidates: [parsed as CandidateUser], tooMany: false }
  } catch {
    return { candidates: [], tooMany: false, error: `JSON-Fehler: ${out.slice(0, 150)}` }
  }
}
