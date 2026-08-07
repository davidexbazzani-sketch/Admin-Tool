// ── AD Organization Chart Service ─────────────────────────────────────────────
// Builds a top-down org chart from a root user by walking DirectReports via
// breadth-first search in a single PowerShell process. Each person becomes a
// flat node; the renderer assembles the tree from sam/reports[].

import { api } from '../electronAPI'

export interface OrgNode {
  sam: string
  displayName: string
  title?: string
  department?: string
  email?: string
  reports: string[]     // SamAccountNames of direct reports
}

export interface OrgFetchResult {
  nodes: OrgNode[]
  rootSam: string
  durationMs: number
  ok: boolean
  error?: string
}

export const ORG_ROOT_SAM = 'XD9937' // Martin Johannsmann

function psQuote(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'"
}

export async function fetchOrgChart(
  rootSam: string,
  onProgress?: (visited: number) => void,
): Promise<OrgFetchResult> {
  const start = Date.now()

  // Single-shot PS script that walks DirectReports BFS. We collect into a
  // System.Collections.ArrayList of PSCustomObjects, then emit one tab-separated
  // line per person — same robust pattern we use for AD lookup.
  // Output format (one line per node):
  //   ORGNODE\tsam\tdisplayName\ttitle\tdepartment\temail\treport1,report2,...
  const script = [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `$tab = [char]9`,
    `$root = ${psQuote(rootSam)}`,
    `$visited = @{}`,
    `$queue = New-Object System.Collections.Queue`,
    `$queue.Enqueue($root)`,
    `$props = @('SamAccountName','DisplayName','Title','Department','EmailAddress','UserPrincipalName','DirectReports')`,
    `while ($queue.Count -gt 0) {`,
    `  $id = $queue.Dequeue()`,
    `  $key = ([string]$id).ToUpper()`,
    `  if ($visited.ContainsKey($key)) { continue }`,
    `  $visited[$key] = $true`,
    `  try {`,
    `    $u = Get-ADUser -Identity $id -Properties $props -EA SilentlyContinue`,
    `    if (-not $u) { continue }`,
    `    $reportsSams = @()`,
    `    if ($u.DirectReports) {`,
    `      foreach ($dn in $u.DirectReports) {`,
    `        try {`,
    `          $r = Get-ADUser -Identity $dn -EA SilentlyContinue`,
    `          if ($r) {`,
    `            $rsam = [string]$r.SamAccountName`,
    `            $reportsSams += $rsam`,
    `            if (-not $visited.ContainsKey($rsam.ToUpper())) { $queue.Enqueue($rsam) }`,
    `          }`,
    `        } catch {}`,
    `      }`,
    `    }`,
    `    $dn = ([string]$u.DisplayName) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `    $tt = ([string]$u.Title) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `    $dp = ([string]$u.Department) -replace "[$([char]9)$([char]10)$([char]13)]", ' '`,
    `    $em = [string]$u.EmailAddress; if (-not $em) { $up = [string]$u.UserPrincipalName; if ($up -like '*@*') { $em = $up } }`,
    `    $rs = ($reportsSams -join ',')`,
    `    Write-Output ("ORGNODE$tab" + $u.SamAccountName + $tab + $dn + $tab + $tt + $tab + $dp + $tab + $em + $tab + $rs)`,
    `  } catch {}`,
    `}`,
  ].join('\n')

  try {
    // Generous timeout. BFS on a few hundred people is dominated by AD
    // round-trips. 5 minutes covers typical org sizes comfortably.
    const res = await api().runPowerShell(script, 300000)
    const lines = (res.stdout ?? '').split(/\r?\n/).filter(l => l.startsWith('ORGNODE\t'))
    const nodes: OrgNode[] = []
    for (const line of lines) {
      const parts = line.split('\t')
      if (parts.length < 7) continue
      nodes.push({
        sam: parts[1],
        displayName: parts[2] || parts[1],
        title: parts[3] || undefined,
        department: parts[4] || undefined,
        email: parts[5] || undefined,
        reports: parts[6] ? parts[6].split(',').filter(Boolean) : [],
      })
      onProgress?.(nodes.length)
    }
    return {
      nodes,
      rootSam,
      durationMs: Date.now() - start,
      ok: nodes.length > 0,
      error: nodes.length === 0 ? 'Keine Daten zurueckgegeben. Pruefe ob die Root-CorpID korrekt ist und Active Directory erreichbar ist.' : undefined,
    }
  } catch (e) {
    return {
      nodes: [],
      rootSam,
      durationMs: Date.now() - start,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// Build a tree view from the flat node list.
export interface OrgTreeNode {
  node: OrgNode
  children: OrgTreeNode[]
  depth: number
}

export function buildTree(nodes: OrgNode[], rootSam: string): OrgTreeNode | null {
  const byUpperSam = new Map<string, OrgNode>()
  for (const n of nodes) byUpperSam.set(n.sam.toUpperCase(), n)
  const rootNode = byUpperSam.get(rootSam.toUpperCase())
  if (!rootNode) return null

  function build(n: OrgNode, depth: number, seen: Set<string>): OrgTreeNode {
    seen.add(n.sam.toUpperCase())
    const children: OrgTreeNode[] = []
    for (const childSam of n.reports) {
      const upper = childSam.toUpperCase()
      if (seen.has(upper)) continue // avoid cycles
      const child = byUpperSam.get(upper)
      if (child) children.push(build(child, depth + 1, seen))
    }
    // Stable alphabetical sort by display name
    children.sort((a, b) => a.node.displayName.localeCompare(b.node.displayName, 'de', { sensitivity: 'base' }))
    return { node: n, children, depth }
  }

  return build(rootNode, 0, new Set())
}
