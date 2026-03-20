import { useState } from 'react'
import {
  ChevronDown, ChevronRight, Copy, Check, Monitor, User, Phone,
  Shield, Users, Building2, FolderOpen, ExternalLink, AlertTriangle,
  CheckCircle2, XCircle, Search, ChevronsDownUp, ChevronsUpDown, Loader, GitCompare,
  KeyRound, Unlock,
} from 'lucide-react'
import type { UserProfileData } from '../types'
import GroupComparisonPanel from './GroupComparisonPanel'
import { api } from '../electronAPI'
import { useIsAdmin } from '../store/authStore'
import { createLogger } from '../utils/activityLogger'

const log = createLogger('user-info')

type SectionId = 'general' | 'contact' | 'account' | 'groups' | 'devices' | 'org' | 'other'

const SECTIONS: { id: SectionId; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'Allgemeine Informationen',  icon: <User size={14} />      },
  { id: 'contact', label: 'Kontaktdaten & Rufnummern', icon: <Phone size={14} />     },
  { id: 'account', label: 'Konto & Sicherheit',        icon: <Shield size={14} />    },
  { id: 'groups',  label: 'Gruppenmitgliedschaften',   icon: <Users size={14} />     },
  { id: 'devices', label: 'Geräte & Anmeldungen',      icon: <Monitor size={14} />   },
  { id: 'org',     label: 'Organisationsstruktur',      icon: <Building2 size={14} /> },
  { id: 'other',   label: 'Sonstige AD-Attribute',      icon: <FolderOpen size={14} />},
]

interface Props {
  data: UserProfileData
  deviceLoading?: boolean
  onQueryDevice: (hostname: string) => void
  onQueryUser: (sam: string) => void
}

export default function UserProfileAccordion({ data, deviceLoading, onQueryDevice, onQueryUser }: Props) {
  const isAdmin = useIsAdmin()

  const [open, setOpen] = useState<Set<SectionId>>(new Set(['general', 'devices']))
  const [searchQuery, setSearchQuery] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showComparison, setShowComparison] = useState(false)
  const [nestedGroups, setNestedGroups] = useState<string[]>([])
  const [nestedLoading, setNestedLoading] = useState(false)
  const [showNested, setShowNested] = useState(false)

  // Admin actions
  const [adminAction, setAdminAction] = useState<'reset-pw' | 'unlock' | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionResult, setActionResult] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handlePasswordReset() {
    if (!newPassword.trim()) return
    setActionLoading(true); setActionResult(null)
    try {
      const sam = data.Sam.replace(/'/g, "''")
      const pw  = newPassword.replace(/'/g, "''")
      const ps  = `Set-ADAccountPassword -Identity '${sam}' -Reset -NewPassword (ConvertTo-SecureString '${pw}' -AsPlainText -Force) -EA Stop; Write-Output 'OK'`
      const res = await api().runPowerShell(ps, 15000)
      if (res.stdout.trim() === 'OK') {
        setActionResult({ ok: true, msg: 'Passwort wurde erfolgreich zurückgesetzt.' })
        await log(`Passwort zurückgesetzt`, data.Sam)
      } else {
        setActionResult({ ok: false, msg: res.stderr || res.stdout || 'Unbekannter Fehler' })
      }
    } catch (e) {
      setActionResult({ ok: false, msg: String(e) })
    } finally {
      setActionLoading(false)
    }
  }

  async function handleUnlock() {
    setActionLoading(true); setActionResult(null)
    try {
      const sam = data.Sam.replace(/'/g, "''")
      const ps  = `Unlock-ADAccount -Identity '${sam}' -EA Stop; Write-Output 'OK'`
      const res = await api().runPowerShell(ps, 15000)
      if (res.stdout.trim() === 'OK') {
        setActionResult({ ok: true, msg: 'Konto wurde erfolgreich entsperrt.' })
        await log(`Konto entsperrt`, data.Sam)
      } else {
        setActionResult({ ok: false, msg: res.stderr || res.stdout || 'Unbekannter Fehler' })
      }
    } catch (e) {
      setActionResult({ ok: false, msg: String(e) })
    } finally {
      setActionLoading(false)
    }
  }

  function closeModal() { setAdminAction(null); setNewPassword(''); setShowPw(false); setActionResult(null) }

  function toggle(id: SectionId) {
    setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function expandAll() { setOpen(new Set(SECTIONS.map((s) => s.id))) }
  function collapseAll() { setOpen(new Set()) }

  async function loadNestedGroups() {
    if (nestedLoading) return
    setNestedLoading(true)
    try {
      const sam = data.Sam.replace(/'/g, "''")
      const ps = [
        `try {`,
        `  $dn=(Get-ADUser -Identity '${sam}' -EA Stop).DistinguishedName`,
        `  $lf="(member:1.2.840.113556.1.4.1941:=$dn)"`,
        `  $ng=(Get-ADGroup -LDAPFilter $lf -Properties Name -ResultSetSize 200 -EA SilentlyContinue | Sort-Object Name | ForEach-Object { $_.Name }) -join ';'`,
        `  Write-Output $ng`,
        `} catch { Write-Output '' }`,
      ].join('\n')
      const r = await api().runPowerShell(ps, 30000)
      const all = r.stdout.trim() ? r.stdout.trim().split(';').filter(Boolean) : []
      setNestedGroups(all)
      setShowNested(true)
    } catch { /* ignore */ }
    finally { setNestedLoading(false) }
  }

  function copy(key: string, value: string) {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopiedKey(key)
    setTimeout(() => setCopiedKey((p) => (p === key ? null : p)), 2000)
  }

  const sq = searchQuery.toLowerCase()

  // Groups
  const groups = data.Groups ? data.Groups.split(';').filter(Boolean) : []
  const filteredGroups = groupSearch
    ? groups.filter((g) => g.toLowerCase().includes(groupSearch.toLowerCase()))
    : groups

  // Reports: "Name~~Sam" joined by ";;;"
  const reports = data.Reports
    ? data.Reports.split(';;;').filter(Boolean).map((r) => {
        const idx = r.indexOf('~~')
        return { name: idx >= 0 ? r.slice(0, idx) : r, sam: idx >= 0 ? r.slice(idx + 2) : '' }
      })
    : []

  // Check if LastLogon is within last 30 days
  function isRecentLogon(dateStr: string): boolean {
    if (!dateStr) return false
    const m = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
    if (!m) return false
    const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]))
    return d >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  }

  // Extension attributes
  let extAttrs: Record<string, string> = {}
  try { extAttrs = JSON.parse(data.ExtAttrs || '{}') } catch { /* ignore */ }
  const extEntries = Object.entries(extAttrs).filter(([, v]) => v)

  // ── Sub-components ────────────────────────────────────────────────────────

  function Field({ label, value, mono = false, fieldKey }: {
    label: string; value?: string | null; mono?: boolean; fieldKey?: string
  }) {
    if (!value && sq && !(label.toLowerCase().includes(sq))) return null
    const hi = sq && value && value.toLowerCase().includes(sq)
    const fk = fieldKey ?? label
    return (
      <div className="flex flex-col gap-0.5 group">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className="flex items-center gap-1">
          <p
            className={`text-sm text-foreground truncate flex-1 ${mono ? 'font-mono text-xs' : ''} ${hi ? 'bg-primary/20 rounded px-0.5' : ''}`}
            title={value ?? undefined}
          >
            {value || <span className="text-muted-foreground italic text-xs">–</span>}
          </p>
          {value && (
            <button onClick={() => copy(fk, value)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary p-0.5 rounded shrink-0" title="Kopieren">
              {copiedKey === fk ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            </button>
          )}
        </div>
      </div>
    )
  }

  function SectionBtn({ id, badge }: { id: SectionId; badge?: number }) {
    const s = SECTIONS.find((x) => x.id === id)!
    const isOpen = open.has(id)
    return (
      <button onClick={() => toggle(id)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left border-t border-border first:border-t-0">
        <span className="text-primary shrink-0">{s.icon}</span>
        <span className="flex-1 text-sm font-medium text-foreground">{s.label}</span>
        {badge !== undefined && (
          <span className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full font-mono mr-1">{badge}</span>
        )}
        <span className="text-muted-foreground shrink-0">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20 border-b border-border">
        <div className="flex-1 relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Profil durchsuchen…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <button onClick={expandAll} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-accent transition-colors" title="Alle aufklappen">
          <ChevronsUpDown size={12} /> Alle auf
        </button>
        <button onClick={collapseAll} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-accent transition-colors" title="Alle zuklappen">
          <ChevronsDownUp size={12} /> Alle zu
        </button>
      </div>

      {/* 1. Allgemeine Informationen */}
      <SectionBtn id="general" />
      {open.has('general') && (
        <div className="px-4 pb-4 pt-2 grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="Anzeigename" value={data.Name} />
          <Field label="Vorname" value={data.GivenName} />
          <Field label="Nachname" value={data.Surname} />
          <Field label="SAMAccountName" value={data.Sam} mono fieldKey="Sam" />
          <Field label="User Principal Name" value={data.UPN} mono fieldKey="UPN" />
          <Field label="Corp ID / EmployeeID" value={data.EmpID} mono fieldKey="EmpID" />
          <Field label="E-Mail-Adresse" value={data.Mail} fieldKey="Mail" />
          <Field label="Beschreibung" value={data.Desc} />
          <Field label="Stellenbezeichnung" value={data.Title} />
          <Field label="Abteilung" value={data.Dept} />
          <Field label="Unternehmen" value={data.Company} />
          <Field label="Standort / Büro" value={data.Office} />
          <Field label="Straße" value={data.Street} />
          <Field label="PLZ" value={data.PostalCode} mono />
          <Field label="Stadt" value={data.City} />
          <Field label="Land" value={data.Country} />
        </div>
      )}

      {/* 2. Kontaktdaten */}
      <SectionBtn id="contact" />
      {open.has('contact') && (
        <div className="px-4 pb-4 pt-2 space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            <Field label="Telefon (Allgemein)" value={data.Phone} mono fieldKey="Phone" />
            <Field label="Mobilnummer / Diensthandy" value={data.Mobile} mono fieldKey="Mobile" />
            <Field label="Faxnummer" value={data.Fax} mono />
            <Field label="IP-Telefon / Xelion-Nummer" value={data.IPPhone} mono fieldKey="IPPhone" />
            <Field label="Weitere Telefonnummern" value={data.OtherPhone} />
            <Field label="Weitere Mobilnummern" value={data.OtherMobile} />
          </div>
          {data.Mobile && !data.IPPhone && (
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle size={13} className="text-amber-400 shrink-0" />
              <p className="text-[11px] text-amber-300">
                Diensthandy hinterlegt, aber keine Xelion-Nummer (IP-Phone) eingetragen.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 3. Konto & Sicherheit */}
      <SectionBtn id="account" />
      {open.has('account') && (
        <div className="px-4 pb-4 pt-2 space-y-3">
          <div className="flex items-center gap-4 flex-wrap">
            <span className={`flex items-center gap-1.5 text-sm font-medium ${data.Enabled ? 'text-emerald-400' : 'text-red-400'}`}>
              {data.Enabled ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {data.Enabled ? 'Konto aktiv' : 'Konto deaktiviert'}
            </span>
            {data.Locked && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-amber-400">
                <XCircle size={14} /> Konto gesperrt
              </span>
            )}
            {data.SmartCard && (
              <span className="flex items-center gap-1 text-[11px] text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">
                Smart Card erforderlich
              </span>
            )}
            {isAdmin && (
              <div className="ml-auto flex items-center gap-2">
                {data.Locked && (
                  <button onClick={() => { setAdminAction('unlock'); setActionResult(null) }}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors">
                    <Unlock size={11} /> Entsperren
                  </button>
                )}
                <button onClick={() => { setAdminAction('reset-pw'); setActionResult(null) }}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors">
                  <KeyRound size={11} /> Passwort zurücksetzen
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            <Field label="Konto erstellt am" value={data.Created} />
            <Field label="Letzter Passwort-Reset" value={data.PwdSet} />
            <div className="flex flex-col gap-0.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Passwort läuft ab</p>
              {data.PwdNeverExpires
                ? <p className="text-sm text-muted-foreground italic">Läuft nie ab</p>
                : data.PwdExpiry
                  ? <p className={`text-sm font-medium ${(data.PwdDaysLeft ?? 999) < 14 ? 'text-amber-400' : 'text-foreground'}`}>
                      {data.PwdExpiry}
                      {data.PwdDaysLeft !== null && (
                        <span className="text-xs text-muted-foreground ml-1.5">(noch {data.PwdDaysLeft} Tage)</span>
                      )}
                    </p>
                  : <p className="text-sm text-muted-foreground italic">–</p>
              }
            </div>
            <Field label="Letzter erfolgreicher Login (AD)" value={data.LastLogon} />
            <Field label="Letzter fehlgeschlagener Login" value={data.BadPwdTime} />
            <div className="flex flex-col gap-0.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Fehlgeschlagene Anmeldeversuche</p>
              <p className={`text-sm font-medium ${(data.BadLogonCount ?? 0) > 0 ? 'text-amber-400' : 'text-foreground'}`}>
                {data.BadLogonCount ?? 0}
              </p>
            </div>
            <Field label="Konto läuft ab am" value={data.AcctExpiry} />
          </div>
        </div>
      )}

      {/* 4. Gruppenmitgliedschaften */}
      {(() => {
        const totalCount = groups.length + (data.PrimaryGroup ? 1 : 0)
        return <SectionBtn id="groups" badge={totalCount} />
      })()}
      {open.has('groups') && (
        <div className="px-4 pb-4 pt-2 space-y-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={`${groups.length + (data.PrimaryGroup ? 1 : 0)} Gruppen filtern…`}
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto py-1">
            {/* Primary group first */}
            {data.PrimaryGroup && (!groupSearch || data.PrimaryGroup.toLowerCase().includes(groupSearch.toLowerCase())) && (
              <span className="group flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border font-mono bg-emerald-500/10 text-emerald-300 border-emerald-500/30" title={data.PrimaryGroup}>
                {data.PrimaryGroup}
                <span className="text-[9px] bg-emerald-500/30 px-1 rounded ml-0.5">Primär</span>
                <button onClick={() => copy('pg', data.PrimaryGroup)} className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5">
                  {copiedKey === 'pg' ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
                </button>
              </span>
            )}
            {filteredGroups.map((g, i) => {
              const isAdmin = /admin/i.test(g)
              const isVpn  = /vpn|cisco/i.test(g)
              const isApp  = /^(app_|sw_|software_|application)/i.test(g)
              const cls = isAdmin ? 'bg-red-500/15 text-red-300 border-red-500/30'
                        : isVpn   ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                        : isApp   ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                        : 'bg-muted text-muted-foreground border-border'
              const hi = groupSearch && g.toLowerCase().includes(groupSearch.toLowerCase())
              return (
                <span key={i} className={`group flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border font-mono ${cls} ${hi ? 'ring-1 ring-primary' : ''}`} title={g}>
                  {g}
                  <button onClick={() => copy(`grp-${i}`, g)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedKey === `grp-${i}` ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
                  </button>
                </span>
              )
            })}
            {filteredGroups.length === 0 && !data.PrimaryGroup && <p className="text-[11px] text-muted-foreground italic">Keine Gruppen gefunden.</p>}
          </div>
          {/* Nested groups section */}
          {showNested && nestedGroups.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Verschachtelte Mitgliedschaften ({nestedGroups.filter(g => !groups.includes(g) && g !== data.PrimaryGroup).length} zusätzliche)</p>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto py-1">
                {nestedGroups.filter(g => !groups.includes(g) && g !== data.PrimaryGroup).map((g, i) => (
                  <span key={i} className="group flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border font-mono bg-violet-500/10 text-violet-300 border-violet-500/30" title={g}>
                    {g}
                    <span className="text-[9px] bg-violet-500/20 px-1 rounded ml-0.5">Verschachtelt</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-0.5">
            <div className="flex flex-wrap gap-3">
              <span className="flex items-center gap-1 text-[10px] text-emerald-300"><span className="w-2 h-2 rounded-sm bg-emerald-500/30 inline-block" /> Primäre Gruppe</span>
              <span className="flex items-center gap-1 text-[10px] text-red-300"><span className="w-2 h-2 rounded-sm bg-red-500/30 inline-block" /> Admin</span>
              <span className="flex items-center gap-1 text-[10px] text-purple-300"><span className="w-2 h-2 rounded-sm bg-purple-500/30 inline-block" /> VPN</span>
              <span className="flex items-center gap-1 text-[10px] text-blue-300"><span className="w-2 h-2 rounded-sm bg-blue-500/30 inline-block" /> App</span>
              <span className="flex items-center gap-1 text-[10px] text-violet-300"><span className="w-2 h-2 rounded-sm bg-violet-500/30 inline-block" /> Verschachtelt</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { if (!showNested) { loadNestedGroups() } else { setShowNested(false) } }}
                disabled={nestedLoading}
                className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
              >
                {nestedLoading ? <Loader size={10} className="animate-spin" /> : <Users size={10} />}
                {showNested ? 'Verschachtelte ausblenden' : 'Alle Mitgliedschaften laden'}
              </button>
              <button
                onClick={() => setShowComparison((p) => !p)}
                className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <GitCompare size={11} />
                {showComparison ? 'Vergleich schließen' : 'Berechtigungen vergleichen…'}
              </button>
            </div>
          </div>
          {showComparison && (
            <GroupComparisonPanel userData={data} userGroups={groups} />
          )}
        </div>
      )}

      {/* 5. Geräte & Anmeldungen */}
      <SectionBtn id="devices" />
      {open.has('devices') && (
        <div className="px-4 pb-4 pt-2 space-y-3">
          <div className="rounded-lg border border-border p-3 bg-muted/10">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-foreground">
                {data.CurrentlyOn ? 'Aktuell angemeldetes Gerät' : 'Zuletzt angemeldetes Gerät'}
              </p>
              {data.CurrentlyOn && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium ml-auto">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Aktiv
                </span>
              )}
              {deviceLoading && !data.Device && (
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground ml-auto">
                  <Loader size={10} className="animate-spin" /> Wird ermittelt…
                </span>
              )}
            </div>
            {data.Device ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-medium text-foreground flex-1">{data.Device}</span>
                {data.LogonTime && <span className="text-[11px] text-muted-foreground">{data.LogonTime}</span>}
                {data.DevMethod && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">{data.DevMethod}</span>}
                <button onClick={() => copy('device', data.Device)} className="text-muted-foreground hover:text-primary transition-colors p-0.5" title="Kopieren">
                  {copiedKey === 'device' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                </button>
                <button onClick={() => onQueryDevice(data.Device)} className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                  <ExternalLink size={11} /> Gerät abfragen
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-[12px] text-amber-400/80 font-medium">
                  {deviceLoading ? 'Ermittlung läuft…' : '⚠ Kein aktives Gerät gefunden'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {isRecentLogon(data.LastLogon)
                    ? `Letzter Login laut AD: ${data.LastLogon}. Mögliche Gründe: Gerät ausgeschaltet, User per VPN verbunden, oder Gerät nicht am Standort.`
                    : 'Kein Login in den letzten 30 Tagen erkannt (WMI, AD-Computerobjekte, Event-Log).'}
                </p>
              </div>
            )}
          </div>
          {data.LastLogon && (
            <div className="flex flex-col gap-0.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Letzter Login laut AD (repliziert ~14 Tage)</p>
              <p className="text-sm text-foreground">{data.LastLogon}</p>
            </div>
          )}
        </div>
      )}

      {/* 6. Organisationsstruktur */}
      <SectionBtn id="org" />
      {open.has('org') && (
        <div className="px-4 pb-4 pt-2 space-y-4">
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Vorgesetzter (Manager)</p>
            {data.MgrName ? (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User size={13} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{data.MgrName}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">{data.MgrSam}</p>
                </div>
                <button onClick={() => onQueryUser(data.MgrSam)} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0">
                  <User size={11} /> Profil öffnen
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Kein Manager im AD hinterlegt</p>
            )}
          </div>
          {reports.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Direkte Untergebene ({reports.length})
              </p>
              <div className="space-y-1.5">
                {reports.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <User size={11} className="text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-foreground truncate">{r.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{r.sam}</p>
                    </div>
                    {r.sam && (
                      <button onClick={() => onQueryUser(r.sam)} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0">
                        <User size={10} /> Profil
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!data.MgrName && reports.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Keine Organisationsdaten hinterlegt.</p>
          )}
        </div>
      )}

      {/* 7. Sonstige AD-Attribute */}
      <SectionBtn id="other" />
      {open.has('other') && (
        <div className="px-4 pb-4 pt-2 grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="Home-Verzeichnis" value={data.HomeDir} mono />
          <Field label="Profilpfad" value={data.ProfilePath} mono />
          <Field label="Anmeldeskript" value={data.ScriptPath} mono />
          {extEntries.map(([k, v]) => (
            <Field key={k} label={k} value={String(v)} fieldKey={k} />
          ))}
          {!data.HomeDir && !data.ProfilePath && !data.ScriptPath && extEntries.length === 0 && (
            <p className="col-span-3 text-sm text-muted-foreground italic">Keine weiteren Attribute vorhanden.</p>
          )}
        </div>
      )}

      {/* Admin action modals */}
      {adminAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeModal}>
          <div className="bg-card border border-border rounded-xl p-6 w-96 shadow-xl" onClick={e => e.stopPropagation()}>
            {adminAction === 'reset-pw' ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <KeyRound size={16} className="text-primary" />
                  <h3 className="font-semibold text-foreground">Passwort zurücksetzen</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Neues Passwort für <span className="font-mono text-foreground">{data.Sam}</span> festlegen.
                  Der Benutzer muss sich danach mit dem neuen Passwort anmelden.
                </p>
                <div className="relative mb-4">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Neues Passwort eingeben"
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary pr-16"
                  />
                  <button onClick={() => setShowPw(p => !p)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground px-1">
                    {showPw ? 'Verstecken' : 'Anzeigen'}
                  </button>
                </div>
                {actionResult && (
                  <div className={`mb-3 p-2.5 rounded-md text-xs ${actionResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                    {actionResult.msg}
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button onClick={closeModal} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
                    Abbrechen
                  </button>
                  <button onClick={handlePasswordReset} disabled={!newPassword.trim() || actionLoading}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {actionLoading ? <Loader size={11} className="animate-spin" /> : <KeyRound size={11} />}
                    Passwort setzen
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Unlock size={16} className="text-amber-400" />
                  <h3 className="font-semibold text-foreground">Konto entsperren</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Das Konto <span className="font-mono text-foreground">{data.Sam}</span> ({data.Name}) wird entsperrt.
                  Der Benutzer kann sich danach wieder anmelden.
                </p>
                {actionResult && (
                  <div className={`mb-3 p-2.5 rounded-md text-xs ${actionResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                    {actionResult.msg}
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button onClick={closeModal} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
                    Abbrechen
                  </button>
                  <button onClick={handleUnlock} disabled={actionLoading}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
                    {actionLoading ? <Loader size={11} className="animate-spin" /> : <Unlock size={11} />}
                    Entsperren
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
