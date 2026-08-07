// ── AD users list service ─────────────────────────────────────────────────────
// Fetches all SKF Marine users from Active Directory (enabled + disabled).
// Result is cached in localStorage so re-entering the screen is instant;
// user explicitly refreshes when fresh data is needed.

import { api } from '../electronAPI'

export interface AdUserListItem {
  sam: string             // SamAccountName = Corp ID (e.g. "X35982")
  displayName: string
  title?: string
  department?: string
  email?: string
  enabled: boolean
  lastLogon?: string      // ISO timestamp (LastLogonDate)
  badPwdTime?: string     // ISO timestamp (badPasswordTime)
  reportsCount?: number   // Anzahl direkt unterstellter Mitarbeiter (Abteilungsleiter, wenn > 0)
  managerSam?: string     // SamAccountName des Vorgesetzten (aufgeloest aus Manager-DN)
  managerName?: string    // Anzeigename des Vorgesetzten
}

const COMPANY_FILTER = 'SKF MARINE GMBH'

export interface AdUserListFetchResult {
  users: AdUserListItem[]
  durationMs: number
  ok: boolean
  error?: string
}

export async function fetchAdUsers(): Promise<AdUserListFetchResult> {
  const start = Date.now()

  // One PS call that returns all users in the company. Tab-separated lines
  // (same robust pattern we use elsewhere).
  const script = [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `$tab = [char]9`,
    `$props = @('SamAccountName','DisplayName','Title','Department','EmailAddress','UserPrincipalName','Enabled','LastLogonDate','badPasswordTime','DirectReports','Manager','DistinguishedName')`,
    `$users = Get-ADUser -Filter "Company -eq '${COMPANY_FILTER.replace(/'/g, "''")}'" -Properties $props -EA SilentlyContinue`,
    `if (-not $users) { exit }`,
    `foreach ($u in $users) {`,
    `  $sam = [string]$u.SamAccountName`,
    `  $dn = ([string]$u.DisplayName) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `  $tt = ([string]$u.Title) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `  $dept = ([string]$u.Department) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `  $em = [string]$u.EmailAddress; if (-not $em) { $up = [string]$u.UserPrincipalName; if ($up -like '*@*') { $em = $up } }`,
    `  $en = if ($u.Enabled) { '1' } else { '0' }`,
    `  $ll = if ($u.LastLogonDate) { $u.LastLogonDate.ToString('o') } else { '' }`,
    `  $bp = ''`,
    `  if ($u.badPasswordTime -and $u.badPasswordTime -gt 0) {`,
    `    try { $bp = ([DateTime]::FromFileTime([int64]$u.badPasswordTime)).ToString('o') } catch {}`,
    `  }`,
    `  $rc = 0; if ($u.DirectReports) { $rc = @($u.DirectReports).Count }`,
    `  $own = ([string]$u.DistinguishedName) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `  $mdn = ([string]$u.Manager) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `  Write-Output ("ADU$tab" + $sam + $tab + $dn + $tab + $tt + $tab + $dept + $tab + $em + $tab + $en + $tab + $ll + $tab + $bp + $tab + [string]$rc + $tab + $own + $tab + $mdn)`,
    `}`,
  ].join('\n')

  try {
    const res = await api().runPowerShell(script, 180000) // 3 min for large orgs
    const lines = (res.stdout ?? '').split(/\r?\n/).filter(l => l.startsWith('ADU\t'))
    // Zwischenspeicher inkl. eigener DN + Manager-DN, um den Vorgesetzten danach
    // ueber die DN auf seinen SamAccountName aufzuloesen (eine einzige AD-Abfrage).
    type Raw = AdUserListItem & { _dn?: string; _mgrDn?: string }
    const raw: Raw[] = []
    for (const line of lines) {
      const parts = line.split('\t')
      if (parts.length < 8) continue
      raw.push({
        sam: parts[1],
        displayName: parts[2] || parts[1],
        title: parts[3] || undefined,
        department: parts[4] || undefined,
        email: parts[5] || undefined,
        enabled: parts[6] === '1',
        lastLogon: parts[7] || undefined,
        badPwdTime: parts[8] || undefined,
        reportsCount: parts.length > 9 && parts[9] !== '' ? Number(parts[9]) : undefined,
        _dn: parts.length > 10 ? (parts[10] || undefined) : undefined,
        _mgrDn: parts.length > 11 ? (parts[11] || undefined) : undefined,
      })
    }
    // DN → Benutzer, um Manager-DN auf Sam/Name aufzuloesen (case-insensitiv).
    const dnIndex = new Map<string, { sam: string; name: string }>()
    for (const u of raw) if (u._dn) dnIndex.set(u._dn.toLowerCase(), { sam: u.sam, name: u.displayName })
    const users: AdUserListItem[] = raw.map(u => {
      let managerSam: string | undefined
      let managerName: string | undefined
      if (u._mgrDn) {
        const m = dnIndex.get(u._mgrDn.toLowerCase())
        if (m) { managerSam = m.sam; managerName = m.name }
      }
      // interne Felder entfernen
      const { _dn, _mgrDn, ...rest } = u
      void _dn; void _mgrDn
      return { ...rest, managerSam, managerName }
    })
    return {
      users,
      durationMs: Date.now() - start,
      ok: users.length > 0,
      error: users.length === 0 ? 'Keine Benutzer zurueckgegeben. Pruefe AD-Erreichbarkeit und Company-Filter.' : undefined,
    }
  } catch (e) {
    return {
      users: [],
      durationMs: Date.now() - start,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
