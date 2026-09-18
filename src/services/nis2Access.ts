// ── NIS2 · Zugänge-Check: lokale Adminrechte auf allen PCs ───────────────────
// Scannt (per WinRM, wie Remote Doc) alle Computer aus dem Inventar und ermittelt,
// welche DOMÄNEN-BENUTZER Mitglied der lokalen Administratoren-Gruppe sind. Ergebnis:
// eine Liste aller Nutzer mit lokalen Adminrechten + auf welchen PCs. Über eine
// importierte Excel („genehmigte Admins", Namensspalte) wird markiert, wer weiterhin
// darf (genehmigt) und wer nicht (nicht genehmigt → muss entfernt werden).

import { api } from '../electronAPI'
import type { InventoryItem } from '../types/auth'
import { readCentralAdUsers } from './adUserDirectory'
import { samePerson } from './personMasterData'

export const NIS2_ACCESS_RESULT = 'nis2/access-check.json'
export const NIS2_APPROVED = 'nis2/approved-admins.json'
export const NIS2_ACCESS_STATUS = 'nis2/access_scan_status.json'

/** Ein konkreter lokaler-Admin-Zugang: auf welchem PC, direkt oder über welche Gruppe. */
export interface AdminAccess {
  pc: string
  via: string              // 'direkt' oder Gruppenname (z. B. 'EDS_WorkstationAdmins_EMEA')
}
export interface AdminUser {
  sam: string
  displayName: string
  department?: string
  pcs: string[]            // Hostnamen, auf denen der Nutzer lokaler Admin ist (eindeutig)
  access: AdminAccess[]    // Details: je PC direkt bzw. über welche Gruppe
}
/** Breite IT-Standard-Admin-Gruppe (Domain Admins etc.): einmal aufgelöst, nicht je PC ausgerollt. */
export interface StandardAdminGroup {
  group: string
  members: { sam: string; displayName: string; department?: string }[]
  pcCount: number          // auf wie vielen gescannten PCs diese Gruppe lokaler Admin ist
}
export interface AccessCheckResult {
  scannedAt: string
  scannedBy: string
  totalPCs: number
  scannedPCs: number       // in DIESEM Lauf erreichte (online) PCs
  users: AdminUser[]
  standardGroups: StandardAdminGroup[]
  /** canonHost → rohe Domänen-Admin-Mitglieder (User+Gruppen-Leafs) je PC. Basis für den
   *  Merge über Scans: nicht erreichte PCs behalten ihren letzten bekannten Stand. */
  hostMembers?: Record<string, string[]>
}
/** Ein Eintrag aus der importierten „genehmigte Admins"-Liste (SC-Req-Item-Export). */
export interface ApprovedEntry {
  name: string
  status?: string   // ServiceNow „Stage" (Completed / Waiting for Approval / Fulfillment / Request Cancelled)
  ritm?: string     // RITM-Nummer (Requested Item, Spalte „Number")
  req?: string      // REQ-Nummer (Spalte „Request")
}
export interface ApprovedList {
  entries: ApprovedEntry[]
  names?: string[]           // Legacy (nur Namen) — bleibt lesbar
  updatedAt?: string
  updatedBy?: string
  importedFilename?: string
}
export type ApprovalState = 'genehmigt' | 'beantragt' | 'nicht'

const canon = (h: string): string => (h || '').trim().toUpperCase().split('.')[0]

// ── Ergebnis / genehmigte Liste laden+speichern ──────────────────────────────
export async function loadAccessResult(): Promise<AccessCheckResult | null> {
  try {
    const r = await api().netReadJson<AccessCheckResult>(NIS2_ACCESS_RESULT)
    if (r && Array.isArray(r.users)) {
      // Toleranz gegenüber älteren Ergebnis-Dateien ohne access/standardGroups.
      return {
        ...r,
        users: r.users.map(u => ({
          ...u,
          pcs: Array.isArray(u.pcs) ? u.pcs : [],
          access: Array.isArray(u.access) ? u.access : (Array.isArray(u.pcs) ? u.pcs.map(pc => ({ pc, via: 'direkt' })) : []),
        })),
        // Gruppen werden nicht mehr angezeigt (nur direkt eingetragene Einzelbenutzer
        // des eigenen Standorts) — auch alte Ergebnis-Dateien nicht mehr mit Gruppen zeigen.
        standardGroups: [],
        hostMembers: (r.hostMembers && typeof r.hostMembers === 'object') ? r.hostMembers : {},
      }
    }
  } catch { /* noch keiner */ }
  return null
}
async function saveAccessResult(r: AccessCheckResult): Promise<boolean> {
  try { return await api().netWriteJson(NIS2_ACCESS_RESULT, r) } catch { return false }
}

export async function loadApprovedList(): Promise<ApprovedList> {
  try {
    const a = await api().netReadJson<ApprovedList>(NIS2_APPROVED)
    if (a && Array.isArray(a.entries)) return { ...a, entries: a.entries }
    if (a && Array.isArray(a.names)) return { ...a, entries: a.names.map(n => ({ name: n, status: 'Completed' })) } // Legacy = genehmigt
  } catch { /* noch keine */ }
  return { entries: [] }
}
export async function saveApprovedEntries(entries: ApprovedEntry[], by: string, importedFilename?: string): Promise<boolean> {
  const clean = entries
    .map(e => ({ name: (e.name || '').trim(), status: (e.status || '').trim() || undefined, ritm: (e.ritm || '').trim() || undefined, req: (e.req || '').trim() || undefined }))
    .filter(e => e.name)
  try { return await api().netWriteJson(NIS2_APPROVED, { entries: clean, updatedAt: new Date().toISOString(), updatedBy: by, importedFilename }) }
  catch { return false }
}

/** „Complete" (aber nicht „incomplete") ⇒ genehmigt. */
export function statusApproved(status?: string): boolean {
  const s = (status || '').toLowerCase()
  return /complete/.test(s) && !/incomplete/.test(s)
}
function matchesEntry(entryName: string, u: { displayName: string; sam: string }): boolean {
  const nn = (entryName || '').trim(); if (!nn) return false
  return samePerson(nn, (u.displayName || '').trim()) || nn.toLowerCase() === (u.sam || '').trim().toLowerCase()
}
/**
 * Genehmigungs-Status eines Admin-Nutzers gegen die importierte Antrags-Liste:
 *  - 'genehmigt'  = Antrag vorhanden UND Stage = Completed (mit RITM/REQ)
 *  - 'beantragt'  = Antrag vorhanden, aber noch nicht abgeschlossen (Status anzeigen)
 *  - 'nicht'      = kein Antrag → darf keinen lokalen Admin haben
 */
export function approvalFor(u: { displayName: string; sam: string }, entries: ApprovedEntry[]): { state: ApprovalState; entry?: ApprovedEntry } {
  const e = entries.find(x => matchesEntry(x.name, u))
  if (!e) return { state: 'nicht' }
  return { state: statusApproved(e.status) ? 'genehmigt' : 'beantragt', entry: e }
}

// ── PC-Liste (Computer aus dem Inventar) ─────────────────────────────────────
async function loadComputerHostnames(): Promise<string[]> {
  try {
    const items = (await api().netReadJson<InventoryItem[]>('inventory/inventory.json')) ?? []
    const seen = new Set<string>()
    const out: string[] = []
    for (const i of Array.isArray(items) ? items : []) {
      if ((i.category || '').toLowerCase() !== 'computer') continue
      const name = (i.name || '').trim()
      if (!name) continue
      const key = canon(name)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(name)
    }
    return out
  } catch { return [] }
}

// ── WinRM: lokale Administratoren je PC ──────────────────────────────────────
interface RawMember { PSComputerName?: string; Name?: string; Class?: string; Source?: string }

// Breite IT-Standard-Admin-Gruppen: praktisch überall lokaler Admin → separat als
// „IT-Standardzugang" zeigen, nicht je PC ausrollen. (lowercased, EN + DE)
const STANDARD_ADMIN_GROUPS = new Set<string>([
  'domain admins', 'domänen-admins', 'domaenen-admins',
  'enterprise admins', 'organisations-admins',
  'schema admins', 'schema-admins',
])
export function isStandardAdminGroup(name: string): boolean {
  return STANDARD_ADMIN_GROUPS.has((name || '').trim().toLowerCase())
}

/**
 * Liefert den Domänen-Mitgliedsnamen (leaf von DOMÄNE\leaf) eines Admins-Gruppen-Eintrags,
 * oder null für lokale/BUILTIN-/Dienstkonten/Administrator. Ob User oder Gruppe entscheidet
 * danach AUTORITATIV das AD (resolveMembers) — die von Windows gelieferte Klasse ist auf
 * manchen PCs leer/unzuverlässig und wird hier daher NICHT mehr verwendet.
 */
function domainMemberLeaf(m: RawMember, host: string): string | null {
  const name = (m.Name || '').trim()
  const parts = name.split('\\')
  if (parts.length !== 2) return null               // nur DOMÄNE\name
  const domain = parts[0].toUpperCase(), leaf = parts[1].trim()
  if (!leaf) return null
  if (['BUILTIN', 'NT AUTHORITY', 'NT SERVICE', 'IIS APPPOOL'].includes(domain)) return null
  if (domain === canon(host)) return null           // lokales Konto/Gruppe (Computername = Domäne)
  if ((m.Source || '').toLowerCase() === 'local') return null
  if (leaf.toUpperCase() === 'ADMINISTRATOR') return null
  return leaf
}

// ── Mitglieder autoritativ über AD klären (Admin-PC, RSAT/AD-Modul) ───────────
// Für jeden Mitgliedsnamen: ist es ein Benutzer (→ sam/Anzeigename) oder eine Gruppe
// (→ rekursiv aufgelöste Benutzer-Mitglieder)? Ersetzt das unzuverlässige Windows-
// Klassenfeld. Namen, die das AD nicht kennt, kommen als 'unknown' zurück.
export interface ResolvedMember {
  kind: 'user' | 'group' | 'unknown'
  sam?: string
  displayName?: string
  members?: { sam: string; name: string }[]
}
async function resolveMembers(names: string[]): Promise<Map<string, ResolvedMember>> {
  const out = new Map<string, ResolvedMember>()
  const uniq = [...new Set(names.map(n => (n || '').trim()).filter(Boolean))]
  if (uniq.length === 0) return out
  const list = uniq.map(n => `'${n.replace(/'/g, "''")}'`).join(',')
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `Import-Module ActiveDirectory -ErrorAction SilentlyContinue | Out-Null`,
    `$names=@(${list})`,
    "  function Esc($s){ ($s -replace '\\(','\\28') -replace '\\)','\\29' -replace '\\*','\\2a' }",
    `$out=@()`,
    `foreach ($n in $names) {`,
    `  $e=Esc $n`,
    `  $o=Get-ADObject -LDAPFilter ("(|(sAMAccountName={0})(name={0})(cn={0}))" -f $e) -Properties objectClass -ErrorAction SilentlyContinue | Select-Object -First 1`,
    `  if (-not $o) { $out += [pscustomobject]@{ n="$n"; k='unknown' }; continue }`,
    // Gruppen werden NUR als 'group' markiert (zum Ausschließen) — NICHT mehr rekursiv
    // aufgelöst: es sollen ausschließlich direkt eingetragene Einzelbenutzer zählen.
    `  if ($o.objectClass -eq 'group') {`,
    `    $out += [pscustomobject]@{ n="$n"; k='group' }`,
    `  } elseif ($o.objectClass -eq 'user') {`,
    `    $u=Get-ADUser -Identity $o.DistinguishedName -Properties DisplayName -ErrorAction SilentlyContinue`,
    `    $out += [pscustomobject]@{ n="$n"; k='user'; sam="$($u.SamAccountName)"; dn="$($u.DisplayName)" }`,
    `  } else { $out += [pscustomobject]@{ n="$n"; k='other' } }`,
    `}`,
    `$out | ConvertTo-Json -Compress -Depth 5`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 240000)
    const txt = (res.stdout ?? '').trim()
    if (txt && !txt.startsWith('ERR:')) {
      const parsed = JSON.parse(txt)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      for (const r of arr) {
        const key = String(r?.n || '').trim().toLowerCase()
        if (!key) continue
        if (r.k === 'group') {
          out.set(key, { kind: 'group' })
        } else if (r.k === 'user') {
          out.set(key, { kind: 'user', sam: String(r.sam || '').trim(), displayName: String(r.dn || '').trim() })
        } else {
          out.set(key, { kind: 'unknown' })
        }
      }
    }
  } catch { /* AD nicht verfügbar → alles unknown (als direkte Nutzer behandelt) */ }
  return out
}

export async function runAccessCheckScanOnce(by: string, onTick?: () => void): Promise<{ ok: boolean; summary: string }> {
  const hosts = await loadComputerHostnames()
  if (hosts.length === 0) return { ok: true, summary: 'Keine Computer im Inventar gefunden.' }

  // samLower → Set von "pcvia" (via = 'direkt' oder Gruppenname)
  const accessByUser = new Map<string, Map<string, Set<string>>>()  // samLower → (Host → Set<via>)
  const samCase = new Map<string, string>()        // samLower → Originalschreibweise
  const samName = new Map<string, string>()        // samLower → AD-Anzeigename
  const memberHosts = new Map<string, { name: string; hosts: Set<string> }>() // alle Domänen-Mitglieder (User/Gruppe) + Hosts
  const addAccess = (samLower: string, pc: string, via: string) => {
    if (!accessByUser.has(samLower)) accessByUser.set(samLower, new Map())
    const byPc = accessByUser.get(samLower)!
    if (!byPc.has(pc)) byPc.set(pc, new Set())
    byPc.get(pc)!.add(via)
  }
  // Rohdaten dieses Laufs: erreichte Hosts + Domaenen-Mitglieder (User+Gruppen) je Host.
  const reachedHosts = new Set<string>()                 // canon
  const newHostMembers = new Map<string, Set<string>>()  // canonHost -> Set<leaf>
  const windowsGroupLeaves = new Set<string>()           // Leafs, die Windows als GRUPPE meldet (ObjectClass) → sicher raus
  const CHUNK = 40
  for (let i = 0; i < hosts.length; i += CHUNK) {
    const chunk = hosts.slice(i, i + CHUNK)
    const list = chunk.map(h => `'${h.replace(/'/g, "''")}'`).join(',')
    const script = [
      `$ErrorActionPreference='SilentlyContinue'`,
      `$h=@(${list})`,
      `$r = Invoke-Command -ComputerName $h -ThrottleLimit 10 -ErrorAction SilentlyContinue -ScriptBlock {`,
      `  $res=@()`,
      `  try {`,
      `    Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction Stop | ForEach-Object {`,
      `      $res += [pscustomobject]@{ Name="$($_.Name)"; Class="$($_.ObjectClass)"; Source="$($_.PrincipalSource)" }`,
      `    }`,
      `  } catch {`,
      `    try {`,
      `      $grp=[ADSI]('WinNT://./Administrators,group')`,
      `      foreach ($m in @($grp.psbase.Invoke('Members'))) {`,
      `        $p=$m.GetType().InvokeMember('AdsPath','GetProperty',$null,$m,$null)`,
      `        $c=$m.GetType().InvokeMember('Class','GetProperty',$null,$m,$null)`,
      `        $nm=($p -replace '^WinNT://','') -replace '/','\\'`,
      `        $res += [pscustomobject]@{ Name="$nm"; Class="$c"; Source='ADSI' }`,
      `      }`,
      `    } catch {}`,
      `  }`,
      `  $res`,
      `}`,
      `$r | Select-Object PSComputerName, Name, Class, Source | ConvertTo-Json -Compress -Depth 3`,
    ].join('\n')
    try {
      const res = await api().runPowerShell(script, 240000)
      const txt = (res.stdout ?? '').trim()
      if (txt && !txt.startsWith('ERR:')) {
        const parsed = JSON.parse(txt)
        const arr: RawMember[] = Array.isArray(parsed) ? parsed : [parsed]
        for (const m of arr) {
          const host = String(m?.PSComputerName ?? '').trim()
          if (!host) continue
          const ch = canon(host)
          reachedHosts.add(ch)
          if (!newHostMembers.has(ch)) newHostMembers.set(ch, new Set())
          const leaf = domainMemberLeaf(m, host)
          if (leaf) {
            newHostMembers.get(ch)!.add(leaf)
            if ((m.Class || '').trim().toLowerCase() === 'group') windowsGroupLeaves.add(leaf.toLowerCase())
          }
        }
      }
    } catch { /* Block fehlgeschlagen – nächster Chunk */ }
    onTick?.()
  }

  // Anzeigenamen aus dem AD-Cache auflösen
  // ── Merge mit vorigem Stand: PCs, die DIESMAL nicht erreicht wurden, behalten ihren
  //    letzten bekannten Admin-Stand; nur erreichte PCs werden aktualisiert. ──
  const scannedPCs = reachedHosts.size
  const prev = await loadAccessResult()
  const prevHostMembers = (prev?.hostMembers && typeof prev.hostMembers === 'object') ? prev.hostMembers : {}
  const mergedHostMembers = new Map<string, string[]>()
  for (const [h, mem] of Object.entries(prevHostMembers)) { if (!reachedHosts.has(h) && Array.isArray(mem)) mergedHostMembers.set(h, mem) }
  for (const h of reachedHosts) mergedHostMembers.set(h, [...(newHostMembers.get(h) || new Set<string>())])

  // Host->Mitglieder invertieren -> Mitglied->Hosts (Basis fuer Aufloesung + Anzeige).
  for (const [h, leaves] of mergedHostMembers) for (const leaf of leaves) {
    const lk = leaf.toLowerCase()
    if (!memberHosts.has(lk)) memberHosts.set(lk, { name: leaf, hosts: new Set() })
    memberHosts.get(lk)!.hosts.add(h)
  }

  const dir = await readCentralAdUsers()
  const bySam = new Map((dir?.users ?? []).map(u => [u.sam.toLowerCase(), u]))

  // Es kommen AUSSCHLIESSLICH die DIREKT in der lokalen Administratoren-Gruppe des PCs
  // eingetragenen EINZELBENUTZER (Corp-IDs, z. B. CORP\BQ8069) in die Liste — KEINE
  // Gruppen (weder „Domain Admins" noch „*_WorkstationAdmins_*" o. Ä.). Gruppen werden
  // über die WINDOWS-Objektklasse (Get-LocalGroupMember) erkannt und zusätzlich (Fallback)
  // über die AD-Klasse. Ein Benutzer wird NICHT weggefiltert, wenn AD ihn gerade nicht
  // auflösen kann oder er nicht im Verzeichnis steht → dann wird die Corp-ID direkt
  // angezeigt; das AD-Verzeichnis dient nur der Anreicherung (Anzeigename/Abteilung).
  const resolved = await resolveMembers([...memberHosts.values()].map(v => v.name))
  onTick?.()
  const standardGroups: StandardAdminGroup[] = []   // bewusst leer: Gruppen werden nicht mehr angezeigt
  for (const [lk, info] of memberHosts) {
    const r = resolved.get(lk)
    if ((r && r.kind === 'group') || windowsGroupLeaves.has(lk)) continue   // Gruppen raus (Windows- ODER AD-Klasse)
    // Alles Übrige = direkt eingetragener Einzelbenutzer (Corp-ID). Unbekannte NICHT verwerfen.
    const sam = (r && r.kind === 'user' && r.sam) ? r.sam : info.name
    const key = sam.toLowerCase()
    if (!samCase.has(key)) samCase.set(key, sam)
    if (r?.displayName && !samName.has(key)) samName.set(key, r.displayName)
    for (const h of info.hosts) addAccess(key, h, 'direkt')
  }

  // Nutzer-Liste: nur direkt eingetragene Einzelbenutzer.
  const users: AdminUser[] = [...accessByUser.entries()].map(([key, byPc]) => {
    const ad = bySam.get(key)
    const access: AdminAccess[] = []
    for (const [pc, vias] of byPc.entries()) for (const via of vias) access.push({ pc, via })
    access.sort((a, b) => a.pc.localeCompare(b.pc) || a.via.localeCompare(b.via))
    const pcs = [...byPc.keys()].sort()
    return {
      sam: ad?.sam || samCase.get(key) || key,
      displayName: ad?.displayName || samName.get(key) || samCase.get(key) || key,
      department: ad?.department || undefined,
      pcs,
      access,
    }
  }).sort((a, b) => (b.pcs.length - a.pcs.length) || a.displayName.localeCompare(b.displayName, 'de'))

  const hostMembers: Record<string, string[]> = {}
  for (const [h, leaves] of mergedHostMembers) hostMembers[h] = leaves

  await saveAccessResult({ scannedAt: new Date().toISOString(), scannedBy: by, totalPCs: hosts.length, scannedPCs, users, standardGroups, hostMembers })
  const summary = `${users.length} Benutzer mit direktem lokalem Admin (nur Einzel-Corp-IDs, keine Gruppen) - ${scannedPCs}/${hosts.length} PCs erreicht`
  return { ok: true, summary }
}
