// ── Netzwerk-Diagnose: Benutzer → zugewiesene PCs ────────────────────────────
// Erlaubt in der Diagnose die Suche nach einem BENUTZER (Name/SAM/E-Mail) und
// listet die IHM zugewiesenen PCs auf, damit man sie direkt scannen kann.
//
// Zwei Quellen kombiniert (wie Personen-Dossier + UserInfo):
//   1. Zwischenspeicher (offline, sofort): Endgeräte-Übersicht (Leasing-PCs) +
//      Standort-Inventar (assignedTo) über findAssignedHardware().
//   2. Active Directory (autoritativ): Computerobjekte, deren `Description` die
//      Corp-ID enthält bzw. deren `ManagedBy` auf den Benutzer zeigt.
// Die Benutzer-Auflösung selbst nutzt die leichte AD-Suche (Disambiguierung bei
// mehreren Treffern), damit es auch für Personen ohne Inventar-Eintrag klappt.

import { api } from '../electronAPI'
import { buildLightSearchQuery, parseLightSearchResult, type CandidateUser } from '../utils/adSearchUtils'
import { findAssignedHardware } from '../services/personMasterData'

export interface UserPc {
  hostname: string
  quelle: 'AD' | 'Endgerät' | 'Inventar'
  model?: string
  os?: string
  status?: string
  lastLogon?: string      // AD LastLogonDate (yyyy-MM-dd)
  assignedTo?: string
  serial?: string
}

export interface UserTreffer {
  sam: string
  name: string
  dept?: string
  title?: string
}

export interface UserSuche {
  candidates: UserTreffer[]   // >1 → Auswahl nötig; 1 → direkt; 0 → nichts gefunden
  tooMany: boolean
  error?: string
}

function toTreffer(c: CandidateUser): UserTreffer {
  return { sam: c.Sam, name: c.Name || c.Sam, dept: c.Dept || undefined, title: c.Title || undefined }
}

/** Benutzer per Name/SAM/E-Mail in AD suchen (Hamburg zuerst, dann alle Standorte). */
export async function sucheBenutzer(term: string): Promise<UserSuche> {
  const t = (term || '').trim()
  if (!t) return { candidates: [], tooMany: false }
  try {
    const r = await api().runPowerShell(buildLightSearchQuery(t, 12000, { hamburgFirst: true, allLocations: true }), 30000)
    const parsed = parseLightSearchResult(r.stdout || '')
    return { candidates: parsed.candidates.map(toTreffer), tooMany: parsed.tooMany, error: parsed.error }
  } catch (e) {
    return { candidates: [], tooMany: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function extractJson(stdout: string): string {
  const s = stdout || ''
  const i = s.indexOf('@@NETUSR@@')
  const body = i >= 0 ? s.slice(i + '@@NETUSR@@'.length) : s
  const a = body.indexOf('{'); const b = body.lastIndexOf('}')
  if (a < 0 || b < 0 || b < a) throw new Error('keine JSON-Antwort')
  return body.slice(a, b + 1)
}

const PC_KAT = /pc|laptop|notebook|workstation|desktop|client|rechner/i

/** Zugewiesene AD-Computer (Description enthält Corp-ID bzw. ManagedBy = Benutzer). */
async function adComputer(sam: string): Promise<UserPc[]> {
  const s = (sam || '').trim().replace(/'/g, "''")
  if (!s) return []
  const script = [
    `$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'`,
    `$sam='${s}'`,
    `$out=[ordered]@{ ok=$true; computers=@(); error=$null }`,
    `try {`,
    `  $dn=''`,
    `  try { $u=Get-ADUser -Identity $sam -Properties DistinguishedName -ErrorAction Stop; if ($u) { $dn=[string]$u.DistinguishedName } } catch {}`,
    `  $comps=@()`,
    `  try { $comps += @(Get-ADComputer -Filter "Description -like '*$sam*'" -Properties Description,LastLogonDate,OperatingSystem -ErrorAction SilentlyContinue) } catch {}`,
    `  if ($dn) { $dq=$dn -replace \"'\",\"''\"; try { $comps += @(Get-ADComputer -Filter \"ManagedBy -eq '$dq'\" -Properties Description,LastLogonDate,OperatingSystem -ErrorAction SilentlyContinue) } catch {} }`,
    `  $seen=@{}`,
    `  foreach ($c in ($comps | Sort-Object LastLogonDate -Descending)) {`,
    `    $n=[string]$c.Name; if (-not $n) { continue }; $k=$n.ToUpper(); if ($seen.ContainsKey($k)) { continue }; $seen[$k]=$true`,
    `    $ll=''; if ($c.LastLogonDate) { $ll=$c.LastLogonDate.ToString('yyyy-MM-dd') }`,
    `    $out.computers += ,([ordered]@{ host=$n; lastLogon=$ll; os=[string]$c.OperatingSystem; description=[string]$c.Description })`,
    `    if ($out.computers.Count -ge 12) { break }`,
    `  }`,
    `} catch { $out.ok=$false; $out.error=\"$_\" }`,
    `'@@NETUSR@@' + ($out | ConvertTo-Json -Depth 4 -Compress)`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 45000)
    const j = JSON.parse(extractJson(r.stdout || '')) as { ok: boolean; computers?: unknown }
    const list = Array.isArray(j.computers) ? j.computers : (j.computers ? [j.computers] : [])
    return (list as { host?: string; lastLogon?: string; os?: string }[])
      .filter(c => c && c.host)
      .map(c => ({ hostname: String(c.host).toUpperCase(), quelle: 'AD' as const, os: c.os || undefined, lastLogon: c.lastLogon || undefined }))
  } catch { return [] }
}

/**
 * Alle einem Benutzer zugewiesenen PCs ermitteln (Zwischenspeicher + AD),
 * dedupliziert per Hostname. `name` = Anzeigename für den Cache-Namensabgleich.
 */
export async function ladeBenutzerPCs(sam: string, name: string): Promise<UserPc[]> {
  const map = new Map<string, UserPc>()
  const add = (pc: UserPc) => {
    const key = (pc.hostname || '').trim().toUpperCase()
    if (!key) return
    const prev = map.get(key)
    if (prev) { // vorhandenen Eintrag mit fehlenden Feldern anreichern
      map.set(key, {
        ...prev,
        model: prev.model || pc.model, os: prev.os || pc.os, status: prev.status || pc.status,
        lastLogon: prev.lastLogon || pc.lastLogon, assignedTo: prev.assignedTo || pc.assignedTo, serial: prev.serial || pc.serial,
      })
    } else map.set(key, { ...pc, hostname: key })
  }

  // 1) Zwischenspeicher (sofort, offline)
  try {
    const hw = await findAssignedHardware(name || sam, sam)
    for (const d of hw.endpoint) if (d.hostname) add({ hostname: d.hostname, quelle: 'Endgerät', model: d.model || undefined, status: d.state || undefined, assignedTo: d.assignedTo || undefined, serial: d.serial || undefined })
    for (const it of hw.inventory) if (it.name && (PC_KAT.test(it.category || '') || /^de/i.test(it.name))) add({ hostname: it.name, quelle: 'Inventar', model: it.model || undefined, status: it.category || undefined, assignedTo: it.assignedTo || undefined, serial: it.serial || undefined })
  } catch { /* Quelle optional */ }

  // 2) AD-Computer (autoritativ) — nur wenn Corp-ID bekannt
  if (sam) for (const c of await adComputer(sam)) add(c)

  // AD-Treffer zuerst (aktuellster LastLogon), dann Endgerät, dann Inventar
  const rank = { AD: 0, 'Endgerät': 1, Inventar: 2 } as const
  return [...map.values()].sort((a, b) => rank[a.quelle] - rank[b.quelle] || a.hostname.localeCompare(b.hostname))
}
