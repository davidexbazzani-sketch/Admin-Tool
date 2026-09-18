// ── Proaktives Radar – Service ────────────────────────────────────────────────
// Frühwarnung aus BEREITS vorhandenen Daten (kein neuer Massen-WinRM-Scan):
//   • Leasing/Ablauf der Endgeräte  (endpoint-devices/devices.json → retiredDate)
//   • AD-Hygiene: verwaiste Konten (kein Login seit X), Passwort läuft ab,
//     ausgetretene Mitarbeiter mit noch aktivem AD-Konto (departures × AD).
//
// Reiner Ansichts-/Filter-Screen — KEIN Popup und KEINE E-Mail-Benachrichtigung
// (nur per Menü-Klick erreichbar). Speicher (Netzlaufwerk, zentral):
//   radar/settings.json                 (Schwellen für die AD-Hygiene)
//   radar/ad_hygiene_cache.json         (AD-Hygiene-Daten inkl. Passwort-Ablauf)

import { api } from '../electronAPI'
import { loadDevices, modelCost, modelTypeDisplay, formatEuro } from './endpointDevices'
import { listDepartures, daysUntil, formatGermanDate, toIsoDate } from './employees'
import { readCentralAdUsers } from './adUserDirectory'

// ── Typen ─────────────────────────────────────────────────────────────────────

export type RadarTab = 'leasing' | 'hygiene'
export type RadarCategory = 'leasing' | 'staleLogin' | 'pwdExpiring' | 'departedActive' | 'acctExpiring'

/** Zeitlicher Bezug: 'future' = Ereignis liegt vorn (days = Rest­tage, negativ =
 *  überfällig); 'past' = Ereignis liegt zurück (days = Tage seither, immer ≥ 0). */
export type RadarKind = 'future' | 'past'

export interface RadarItem {
  id: string
  tab: RadarTab
  category: RadarCategory
  kind: RadarKind
  title: string                    // Hostname bzw. Benutzername
  subtitle: string                 // Modell / Abteilung
  refDateIso: string               // Bezugsdatum (ISO) oder ''
  days: number                     // future: Resttage · past: Tage seither · NaN: unbekannt
  fields: Record<string, string>   // Spalten für Tabelle + Filter
  device?: { hostname: string; serial: string }
  person?: { name: string; sam: string }
}

export const CATEGORY_LABEL: Record<RadarCategory, string> = {
  leasing: 'Leasing endet',
  staleLogin: 'Kein Login',
  pwdExpiring: 'Passwort läuft ab',
  departedActive: 'Ausgetreten – Konto aktiv',
  acctExpiring: 'Konto läuft ab',
}

// ── Einstellungen ─────────────────────────────────────────────────────────────

export interface RadarSettings {
  hygiene: {
    staleLoginDays: number      // „kein Login seit ≥ X Tagen" (Basis-Untergrenze)
    pwdExpiringDays: number     // „Passwort läuft in ≤ X Tagen ab"
    acctExpiringDays: number    // „Konto läuft in ≤ X Tagen ab"
  }
}

export const DEFAULT_RADAR_SETTINGS: RadarSettings = {
  hygiene: { staleLoginDays: 90, pwdExpiringDays: 14, acctExpiringDays: 30 },
}

const SETTINGS_FILE = 'radar/settings.json'
const HYGIENE_CACHE = 'radar/ad_hygiene_cache.json'

export async function loadRadarSettings(): Promise<RadarSettings> {
  try {
    const d = await api().netReadJson<Partial<RadarSettings>>(SETTINGS_FILE)
    if (!d) return DEFAULT_RADAR_SETTINGS
    return { hygiene: { ...DEFAULT_RADAR_SETTINGS.hygiene, ...(d.hygiene ?? {}) } }
  } catch { return DEFAULT_RADAR_SETTINGS }
}
export async function saveRadarSettings(s: RadarSettings): Promise<boolean> {
  try { return await api().netWriteJson(SETTINGS_FILE, s) } catch { return false }
}

// ── Datums-/Namens-Helfer ─────────────────────────────────────────────────────

/** Tage SEIT einem ISO-Datum (positiv = liegt zurück). NaN bei ungültig.
 *  Kürzt volle ISO-Zeitstempel (…T…) auf das Datum, da daysUntil nur YYYY-MM-DD parst. */
function daysSince(iso: string): number {
  const d = daysUntil((iso || '').slice(0, 10))
  return isNaN(d) ? NaN : -d
}

function normName(s: string): string {
  return (s || '').toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
}
/** Namensvergleich, robust gegen Reihenfolge/Teilmengen. */
function sameName(a: string, b: string): boolean {
  const na = normName(a), nb = normName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const pa = na.split(' '), pb = nb.split(' ')
  if (pa.length === 2 && pb.length === 2 && pa[0] === pb[1] && pa[1] === pb[0]) return true
  const sa = new Set(pa), sb = new Set(pb)
  return (pa.length >= 2 && pa.every(t => sb.has(t))) || (pb.length >= 2 && pb.every(t => sa.has(t)))
}

// ── Ampel-Farben ──────────────────────────────────────────────────────────────

export function urgencyFuture(days: number): { row: string; pill: string } {
  if (isNaN(days)) return { row: 'border-border', pill: 'bg-muted-foreground/15 text-muted-foreground' }
  if (days < 0) return { row: 'border-red-600/60', pill: 'bg-red-600/30 text-red-100' }
  if (days <= 14) return { row: 'border-red-500/60', pill: 'bg-red-500/25 text-red-100' }
  if (days <= 30) return { row: 'border-amber-500/50', pill: 'bg-amber-500/25 text-amber-100' }
  if (days <= 90) return { row: 'border-yellow-500/40', pill: 'bg-yellow-500/20 text-yellow-100' }
  return { row: 'border-emerald-500/30', pill: 'bg-emerald-500 text-black' }
}
export function urgencyPast(daysSinceVal: number): { row: string; pill: string } {
  if (isNaN(daysSinceVal)) return { row: 'border-border', pill: 'bg-muted-foreground/15 text-muted-foreground' }
  if (daysSinceVal >= 180) return { row: 'border-red-600/60', pill: 'bg-red-600/30 text-red-100' }
  if (daysSinceVal >= 90) return { row: 'border-red-500/60', pill: 'bg-red-500/25 text-red-100' }
  if (daysSinceVal >= 45) return { row: 'border-amber-500/50', pill: 'bg-amber-500/25 text-amber-100' }
  return { row: 'border-yellow-500/40', pill: 'bg-yellow-500/20 text-yellow-100' }
}

// ── Leasing-Radar ─────────────────────────────────────────────────────────────

export async function computeLeasingItems(): Promise<RadarItem[]> {
  const devices = await loadDevices()
  const items: RadarItem[] = []
  for (const d of devices) {
    if (!d.retiredDate) continue          // nur Geräte mit Leasingende
    const iso = toIsoDate(d.retiredDate)
    const days = daysUntil(iso)
    const cost = modelCost(d.model)
    items.push({
      id: `lease_${d.id}`,
      tab: 'leasing', category: 'leasing', kind: 'future',
      title: d.hostname || d.serial || '(ohne Name)',
      subtitle: [d.model, modelTypeDisplay(d.model)].filter(x => x && x !== '—').join(' · '),
      refDateIso: iso, days,
      fields: {
        Hostname: d.hostname, Seriennummer: d.serial, 'Zugewiesen an': d.assignedTo,
        Modell: d.model, 'Modell-Typ': modelTypeDisplay(d.model),
        Status: d.state, Verwendung: d.substate, Unternehmen: d.company,
        'Wer bezahlt?': d.assetOwnership,
        Leasingende: iso ? formatGermanDate(iso) : d.retiredDate,
        'Kosten/Monat': cost != null ? formatEuro(cost) : '',
      },
      device: { hostname: d.hostname, serial: d.serial },
      person: d.assignedTo ? { name: d.assignedTo, sam: '' } : undefined,
    })
  }
  return items
}

// ── AD-Hygiene: Datenquelle (dedizierter Cache mit Passwort-Ablauf) ───────────

export interface HygieneUser {
  sam: string
  name: string
  dept: string
  email: string
  enabled: boolean
  empId?: string
  lastLogon?: string          // ISO
  pwdNeverExpires?: boolean
  pwdDaysLeft?: number | null  // Tage bis Passwort-Ablauf
  pwdExpiry?: string           // ISO — exaktes Ablaufdatum (für die Erinnerungs-/Wochenend-Logik)
  acctExpiry?: string          // ISO
}
interface HygieneCache { users: HygieneUser[]; loadedAt: string }

function psSafe(cmd: string, t: number) {
  return api().runPowerShell(cmd, t).catch(() => ({ stdout: '', stderr: '', exitCode: -1, timedOut: true }))
}

/**
 * Frische, gezielte AD-Abfrage NUR für die Hygiene (Passwort-Ablauf via Domain-
 * Policy, lastLogon, Konto-Ablauf, EmployeeID). Berührt die zentrale AD-User-
 * Liste NICHT (kein Risiko für die Benutzer-Übersicht). Ergebnis wird zentral
 * gecacht. Läuft nur auf Knopfdruck / einmal täglich.
 */
export async function refreshAdHygiene(): Promise<{ ok: boolean; count: number; error?: string }> {
  const script = [
    `Import-Module ActiveDirectory -EA SilentlyContinue`,
    `try {`,
    `  $maxAge = 0`,
    `  try { $maxAge = (Get-ADDefaultDomainPasswordPolicy -EA Stop).MaxPasswordAge.TotalDays } catch {}`,
    `  $now = Get-Date`,
    `  $users = Get-ADUser -Filter "Company -eq 'SKF MARINE GMBH'" -Properties SamAccountName,DisplayName,Department,EmailAddress,UserPrincipalName,Enabled,LastLogonDate,PasswordLastSet,PasswordNeverExpires,AccountExpirationDate,EmployeeID -EA Stop | ForEach-Object {`,
    `    $ll = ''; if ($_.LastLogonDate) { $ll = $_.LastLogonDate.ToString('o') }`,
    `    $ae = ''; if ($_.AccountExpirationDate) { $ae = $_.AccountExpirationDate.ToString('o') }`,
    `    $pdl = $null; $pex = ''`,
    `    if (-not $_.PasswordNeverExpires -and $_.PasswordLastSet -and $maxAge -gt 0) { $exp = $_.PasswordLastSet.AddDays($maxAge); $pdl = [int](($exp.Date - $now.Date).TotalDays); $pex = $exp.ToString('o') }`,
    `    [pscustomobject]@{ sam=[string]$_.SamAccountName; name=[string]$_.DisplayName; dept=[string]$_.Department; email=[string]$_.EmailAddress; upn=[string]$_.UserPrincipalName; enabled=[bool]$_.Enabled; empId=[string]$_.EmployeeID; lastLogon=$ll; pwdNeverExpires=[bool]$_.PasswordNeverExpires; pwdDaysLeft=$pdl; pwdExpiry=$pex; acctExpiry=$ae }`,
    `  }`,
    `  $arr = @($users)`,
    `  Write-Output ('JSON:' + ($arr | ConvertTo-Json -Compress))`,
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
  ].join('\n')
  const res = await psSafe(script, 180000)
  const out = (res.stdout ?? '').trim()
  if (res.timedOut) return { ok: false, count: 0, error: 'AD-Zeitüberschreitung (180s).' }
  const line = out.split(/\r?\n/).map(l => l.trim()).find(l => l.startsWith('JSON:') || l.startsWith('ERR:')) || ''
  if (line.startsWith('ERR:')) return { ok: false, count: 0, error: line.slice(4) }
  if (!line.startsWith('JSON:')) return { ok: false, count: 0, error: res.stderr || 'Keine Antwort aus AD.' }
  try {
    const parsed = JSON.parse(line.slice(5))
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    const users: HygieneUser[] = arr.filter((u: { sam?: string }) => u && u.sam).map((u: HygieneUser & { upn?: string }) => {
      // E-Mail: EmailAddress bevorzugt, sonst UPN-Fallback (Muster adUsersList).
      const upn = String(u.upn || '')
      const email = String(u.email || '') || (upn.includes('@') ? upn : '')
      return {
        sam: String(u.sam), name: String(u.name || ''), dept: String(u.dept || ''), email,
        enabled: u.enabled === true, empId: u.empId ? String(u.empId) : undefined,
        lastLogon: u.lastLogon || undefined, pwdNeverExpires: u.pwdNeverExpires === true,
        pwdDaysLeft: (u.pwdDaysLeft === null || u.pwdDaysLeft === undefined) ? null : Number(u.pwdDaysLeft),
        pwdExpiry: u.pwdExpiry || undefined,
        acctExpiry: u.acctExpiry || undefined,
      }
    })
    await api().netWriteJson(HYGIENE_CACHE, { users, loadedAt: new Date().toISOString() } satisfies HygieneCache)
    return { ok: true, count: users.length }
  } catch { return { ok: false, count: 0, error: 'AD-Antwort nicht lesbar.' } }
}

/** Hygiene-Datenquelle: bevorzugt der dedizierte Cache (hat Passwort-Ablauf),
 *  sonst Rückfall auf das zentrale AD-Verzeichnis (nur enabled + lastLogon). */
export async function loadHygieneUsers(): Promise<{ users: HygieneUser[]; loadedAt?: string; hasPwd: boolean }> {
  try {
    const c = await api().netReadJson<HygieneCache>(HYGIENE_CACHE)
    if (c && Array.isArray(c.users) && c.users.length > 0) return { users: c.users, loadedAt: c.loadedAt, hasPwd: true }
  } catch { /* kein Cache */ }
  // Rückfall: zentrales AD-Verzeichnis (ohne Passwort-Ablauf)
  const dir = await readCentralAdUsers()
  if (dir) {
    const users: HygieneUser[] = dir.users.map(u => ({
      sam: u.sam, name: u.displayName, dept: u.department || '', email: u.email || '',
      enabled: u.enabled, lastLogon: u.lastLogon, pwdDaysLeft: null,
    }))
    return { users, loadedAt: dir.loadedAt, hasPwd: false }
  }
  return { users: [], hasPwd: false }
}

// ── AD-Hygiene: Items berechnen ───────────────────────────────────────────────

export async function computeHygieneItems(
  users: HygieneUser[], settings: RadarSettings,
): Promise<RadarItem[]> {
  const items: RadarItem[] = []

  // 1) Verwaiste Konten: aktiv + kein Login seit ≥ Schwelle
  const staleFloor = Math.max(1, settings.hygiene.staleLoginDays)
  for (const u of users) {
    if (!u.enabled || !u.lastLogon) continue
    const since = daysSince(u.lastLogon)
    if (isNaN(since) || since < staleFloor) continue
    items.push({
      id: `stale_${u.sam}`, tab: 'hygiene', category: 'staleLogin', kind: 'past',
      title: u.name || u.sam, subtitle: u.dept, refDateIso: u.lastLogon, days: since,
      fields: {
        Benutzer: u.name, 'Corp-ID': u.sam, Abteilung: u.dept, 'E-Mail': u.email,
        'Letzter Login': u.lastLogon ? formatGermanDate(u.lastLogon.slice(0, 10)) : '',
        'Tage inaktiv': String(since),
      },
      person: { name: u.name, sam: u.sam },
    })
  }

  // 2) Passwort läuft ab: aktiv, nicht „nie", pwdDaysLeft ≤ Schwelle
  const pwdCeil = Math.max(0, settings.hygiene.pwdExpiringDays)
  for (const u of users) {
    if (!u.enabled || u.pwdNeverExpires) continue
    if (u.pwdDaysLeft == null || isNaN(u.pwdDaysLeft)) continue
    if (u.pwdDaysLeft > pwdCeil) continue
    items.push({
      id: `pwd_${u.sam}`, tab: 'hygiene', category: 'pwdExpiring', kind: 'future',
      title: u.name || u.sam, subtitle: u.dept, refDateIso: u.pwdExpiry || '', days: u.pwdDaysLeft,
      fields: {
        Benutzer: u.name, 'Corp-ID': u.sam, Abteilung: u.dept, 'E-Mail': u.email,
        'Passwort in': u.pwdDaysLeft < 0 ? `${Math.abs(u.pwdDaysLeft)} T. abgelaufen` : `${u.pwdDaysLeft} Tagen`,
      },
      person: { name: u.name, sam: u.sam },
    })
  }

  // 3) Konto läuft ab: AccountExpirationDate ≤ Schwelle (und noch nicht lange vorbei)
  const acctCeil = Math.max(0, settings.hygiene.acctExpiringDays)
  for (const u of users) {
    if (!u.acctExpiry) continue
    const days = daysUntil(u.acctExpiry.slice(0, 10))
    if (isNaN(days) || days > acctCeil || days < -365) continue
    items.push({
      id: `acct_${u.sam}`, tab: 'hygiene', category: 'acctExpiring', kind: 'future',
      title: u.name || u.sam, subtitle: u.dept, refDateIso: u.acctExpiry, days,
      fields: {
        Benutzer: u.name, 'Corp-ID': u.sam, Abteilung: u.dept, 'E-Mail': u.email,
        'Konto-Ablauf': formatGermanDate(u.acctExpiry.slice(0, 10)),
      },
      person: { name: u.name, sam: u.sam },
    })
  }

  // 4) Ausgetreten, aber Konto noch aktiv (Sicherheit!)
  const deps = await listDepartures()
  for (const dep of deps) {
    const exitIso = toIsoDate(dep.exitDate)
    const dLeft = daysUntil(exitIso)
    if (isNaN(dLeft) || dLeft > 0) continue     // nur bereits ausgetreten
    const gid = (dep.globalId || '').toLowerCase()
    const match = users.find(u =>
      (gid && (u.sam.toLowerCase() === gid || (u.empId && u.empId.toLowerCase() === gid))) ||
      sameName(u.name, dep.name),
    )
    if (!match || !match.enabled) continue
    const since = -dLeft
    items.push({
      id: `dep_${dep.id}`, tab: 'hygiene', category: 'departedActive', kind: 'past',
      title: match.name || dep.name, subtitle: `ausgetreten ${formatGermanDate(exitIso)}`,
      refDateIso: exitIso, days: since,
      fields: {
        Benutzer: match.name || dep.name, 'Corp-ID': match.sam, Abteilung: match.dept,
        'E-Mail': match.email, Austritt: formatGermanDate(exitIso), 'Tage seit Austritt': String(since),
        'Gerät zurück?': dep.deviceReturned ? 'ja' : 'nein',
      },
      person: { name: match.name || dep.name, sam: match.sam },
    })
  }

  return items
}
