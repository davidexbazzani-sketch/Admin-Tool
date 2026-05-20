import { useState, useEffect } from 'react'
import { KeyRound, Laptop, ExternalLink, Copy, Check, X, Search, Info, Loader, Edit3, Plus, Trash2, Save, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { useCanAccess, useIsMasterAdmin, useAuthStore } from '../../store/authStore'
import { api } from '../../electronAPI'
import { createLogger } from '../../utils/activityLogger'
import Card from '../Card'
import { PERMISSIONS, type PermissionEntry } from '../../data/infraMarineData'
import { loadCatalog, saveCatalog, type PermissionsCatalog, type PermCatalogEntry } from '../../services/editablePermissions'

const log = createLogger('infra-marine')

// Use editable catalog if available, fallback to hardcoded
function usePermissions() {
  const [catalog, setCatalog] = useState<PermissionsCatalog | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    loadCatalog().then(c => { setCatalog(c); setLoaded(true) })
  }, [])

  const entries = loaded && catalog ? catalog.entries.filter(e => e.active) : PERMISSIONS.map(p => ({ ...p, active: true }))
  const standardPerms = entries.filter(p => p.section === 'standard')
  const homeOfficePerms = entries.filter(p => p.section === 'homeoffice')

  return { catalog, setCatalog, standardPerms, homeOfficePerms, loaded }
}

const _standardPerms = PERMISSIONS.filter(p => p.section === 'standard')
const _homeOfficePerms = PERMISSIONS.filter(p => p.section === 'homeoffice')

function PermTable({ perms, userGroups }: { perms: PermissionEntry[]; userGroups: Set<string> | null }) {
  const [copied, setCopied] = useState<string | null>(null)

  async function copyGroup(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(null), 1500)
    } catch { /* ignore */ }
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/30 text-muted-foreground">
            <th className="text-left px-3 py-2 font-medium">Permission</th>
            <th className="text-left px-3 py-2 font-medium">AD Group Name</th>
            <th className="text-left px-3 py-2 font-medium">ServiceNow Request</th>
            <th className="text-left px-3 py-2 font-medium">Notes</th>
            {userGroups && <th className="text-left px-3 py-2 font-medium w-24">Status</th>}
          </tr>
        </thead>
        <tbody>
          {perms.map((p, i) => {
            let status: 'assigned' | 'missing' | 'na' | null = null
            if (userGroups) {
              if (!p.adGroupName) status = 'na'
              else status = userGroups.has(p.adGroupName) ? 'assigned' : 'missing'
            }
            return (
              <tr key={p.id} className={`${i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10'} hover:bg-muted/20 transition-colors`}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                    <span className="font-semibold text-foreground">{p.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {p.adGroupName ? (
                    <button
                      onClick={() => copyGroup(p.adGroupName!, p.id)}
                      className="inline-flex items-center gap-1.5 bg-muted px-2 py-0.5 rounded text-xs font-mono text-foreground hover:bg-muted/80 transition-colors cursor-pointer group"
                      title="Click to copy"
                    >
                      {p.adGroupName}
                      {copied === p.id
                        ? <Check size={10} className="text-green-400" />
                        : <Copy size={10} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      }
                    </button>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {p.snowUrl ? (
                    <button
                      onClick={() => api().openExternal(p.snowUrl!)}
                      className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 hover:underline text-xs"
                    >
                      {p.snowLabel} <ExternalLink size={10} />
                    </button>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {p.notes ? <span className="text-muted-foreground italic text-[11px]">{p.notes}</span> : null}
                </td>
                {userGroups && (
                  <td className="px-3 py-2.5">
                    {status === 'assigned' && (
                      <span className="inline-flex items-center gap-1 text-green-400 text-[11px] font-medium">
                        <Check size={12} /> Assigned
                      </span>
                    )}
                    {status === 'missing' && (
                      <span className="inline-flex items-center gap-1 text-red-400 text-[11px] font-medium">
                        <X size={12} /> Missing
                      </span>
                    )}
                    {status === 'na' && (
                      <span className="text-muted-foreground text-[11px]">&mdash;</span>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function PermissionsOverview() {
  const canCheck = useCanAccess('infra-marine.permissions.check')
  const isMaster = useIsMasterAdmin()
  const username = useAuthStore(s => s.session?.user.username ?? '')
  const { catalog, setCatalog, standardPerms, homeOfficePerms, loaded } = usePermissions()
  const [showEditor, setShowEditor] = useState(false)
  const [editEntry, setEditEntry] = useState<PermCatalogEntry | null>(null)
  const [savingCatalog, setSavingCatalog] = useState(false)
  const [catalogToast, setCatalogToast] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null)

  async function handleSaveCatalog() {
    if (!catalog) return
    setSavingCatalog(true)
    setCatalogToast(null)
    const res = await saveCatalog(catalog, username)
    if (res.success) {
      setCatalogToast({ type: 'ok', msg: 'Katalog gespeichert' })
      log('Berechtigungs-Katalog aktualisiert', `${catalog.entries.length} Eintraege`)
      setShowEditor(false)
    } else {
      setCatalogToast({ type: 'error', msg: res.error || 'Fehler' })
    }
    setSavingCatalog(false)
  }

  function addPermission() {
    setEditEntry({
      id: `perm_${Date.now()}`,
      name: '', adGroupName: null, snowLabel: null, snowUrl: null,
      section: 'standard', active: true,
    })
  }

  function saveEditEntry(entry: PermCatalogEntry) {
    if (!catalog) return
    const exists = catalog.entries.find(e => e.id === entry.id)
    const updated = exists
      ? catalog.entries.map(e => e.id === entry.id ? entry : e)
      : [...catalog.entries, entry]
    setCatalog({ ...catalog, entries: updated })
    setEditEntry(null)
  }

  function deletePermission(id: string) {
    if (!catalog) return
    setCatalog({ ...catalog, entries: catalog.entries.map(e => e.id === id ? { ...e, active: false } : e) })
  }

  const [checkUser, setCheckUser] = useState('')
  const [checking, setChecking] = useState(false)
  const [userGroups, setUserGroups] = useState<Set<string> | null>(null)
  const [checkError, setCheckError] = useState('')
  const [checkedUser, setCheckedUser] = useState('')

  async function handleCheck() {
    if (!checkUser.trim()) return
    setChecking(true)
    setCheckError('')
    setUserGroups(null)
    try {
      const ps = `Get-ADUser -Identity '${checkUser.trim().replace(/'/g, "''")}' -Properties MemberOf | Select-Object -ExpandProperty MemberOf | ForEach-Object { ($_ -split ',')[0] -replace 'CN=' }`
      const res = await api().runPowerShell(ps, 30000)
      if (res.exitCode !== 0 || res.stderr) {
        setCheckError(res.stderr || `Exit code: ${res.exitCode}`)
        return
      }
      const groups = new Set(
        res.stdout.split('\n').map(l => l.trim()).filter(Boolean)
      )
      setUserGroups(groups)
      setCheckedUser(checkUser.trim())
    } catch (e) {
      setCheckError(String(e))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Request Permissions — New Employee Checklist</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Overview of required permissions and AD groups for new employees at SKF Marine Hamburg. Click on a ServiceNow link to open the request form.
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px]">
            <Info size={11} /> All ServiceNow links open in the external browser
          </div>
          {catalog && <p className="text-[10px] text-muted-foreground mt-1">Letzte Aktualisierung: {new Date(catalog.lastModified).toLocaleString('de-DE')} von {catalog.modifiedBy}</p>}
        </div>
        {isMaster && (
          <button onClick={() => setShowEditor(!showEditor)} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-primary border border-primary/30 hover:bg-primary/10 shrink-0">
            <Edit3 size={12} />Katalog verwalten
          </button>
        )}
      </div>

      {/* Editor (Master Admin only) */}
      {showEditor && isMaster && catalog && (
        <Card title="Berechtigungs-Katalog verwalten" icon={<Edit3 size={15} />}>
          <div className="space-y-3">
            <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
              <AlertTriangle size={12} className="text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-yellow-300">Aenderungen sind sofort fuer alle Tool-Nutzer sichtbar.</p>
            </div>
            <div className="flex gap-2 mb-2">
              <button onClick={addPermission} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-primary border border-primary/30 hover:bg-primary/10"><Plus size={12} />Berechtigung hinzufuegen</button>
              <button onClick={handleSaveCatalog} disabled={savingCatalog} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Save size={12} />{savingCatalog ? 'Speichere...' : 'Speichern'}</button>
            </div>
            {catalogToast && <div className={`text-xs rounded px-2 py-1 ${catalogToast.type === 'ok' ? 'text-green-300 bg-green-500/10' : 'text-red-300 bg-red-500/10'}`}>{catalogToast.msg}</div>}
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/30 text-muted-foreground">
                  <th className="w-10 px-2 py-1.5 font-medium">Aktiv</th>
                  <th className="text-left px-2 py-1.5 font-medium">Name</th>
                  <th className="text-left px-2 py-1.5 font-medium">AD-Gruppe</th>
                  <th className="text-left px-2 py-1.5 font-medium">SNOW-Link</th>
                  <th className="text-left px-2 py-1.5 font-medium">Sektion</th>
                  <th className="w-16 px-2 py-1.5 font-medium">Aktion</th>
                </tr></thead>
                <tbody>
                  {catalog.entries.map((e, i) => (
                    <tr key={e.id} className={`${!e.active ? 'opacity-40' : ''} ${i % 2 ? 'bg-muted/10' : ''} hover:bg-muted/20`}>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={e.active} onChange={ev => setCatalog({ ...catalog, entries: catalog.entries.map(x => x.id === e.id ? { ...x, active: ev.target.checked } : x) })} className="rounded accent-primary" />
                      </td>
                      <td className="px-2 py-1.5 font-medium text-foreground">{e.name}</td>
                      <td className="px-2 py-1.5 text-muted-foreground font-mono text-[10px]">{e.adGroupName || '-'}</td>
                      <td className="px-2 py-1.5 text-muted-foreground text-[10px]">{e.snowLabel ? e.snowLabel.slice(0, 30) + '...' : '-'}</td>
                      <td className="px-2 py-1.5">{e.section}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex gap-1">
                          <button onClick={() => setEditEntry({ ...e })} className="text-blue-400 hover:text-blue-300"><Edit3 size={12} /></button>
                          <button onClick={() => deletePermission(e.id)} className="text-red-400 hover:text-red-300"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* Edit Permission Dialog */}
      {editEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditEntry(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-md w-full mx-4 space-y-3" onClick={e => e.stopPropagation()}>
            <h4 className="text-sm font-bold text-foreground">{editEntry.name ? 'Berechtigung bearbeiten' : 'Neue Berechtigung'}</h4>
            <div className="space-y-2">
              <div><label className="text-[10px] text-muted-foreground font-medium mb-0.5 block">Name *</label>
                <input value={editEntry.name} onChange={e => setEditEntry({ ...editEntry, name: e.target.value })} className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground" /></div>
              <div><label className="text-[10px] text-muted-foreground font-medium mb-0.5 block">AD-Gruppenname</label>
                <input value={editEntry.adGroupName || ''} onChange={e => setEditEntry({ ...editEntry, adGroupName: e.target.value || null })} className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground font-mono" /></div>
              <div><label className="text-[10px] text-muted-foreground font-medium mb-0.5 block">SNOW Label</label>
                <input value={editEntry.snowLabel || ''} onChange={e => setEditEntry({ ...editEntry, snowLabel: e.target.value || null })} className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground" /></div>
              <div><label className="text-[10px] text-muted-foreground font-medium mb-0.5 block">SNOW URL</label>
                <input value={editEntry.snowUrl || ''} onChange={e => setEditEntry({ ...editEntry, snowUrl: e.target.value || null })} className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground font-mono" /></div>
              <div><label className="text-[10px] text-muted-foreground font-medium mb-0.5 block">Sektion</label>
                <select value={editEntry.section} onChange={e => setEditEntry({ ...editEntry, section: e.target.value as 'standard' | 'homeoffice' })} className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground">
                  <option value="standard">Standard</option><option value="homeoffice">Home Office</option>
                </select></div>
              <div><label className="text-[10px] text-muted-foreground font-medium mb-0.5 block">Notiz</label>
                <input value={editEntry.notes || ''} onChange={e => setEditEntry({ ...editEntry, notes: e.target.value })} className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs text-foreground" /></div>
              <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={editEntry.active} onChange={e => setEditEntry({ ...editEntry, active: e.target.checked })} className="rounded accent-primary" />Aktiv</label>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button onClick={() => setEditEntry(null)} className="px-3 py-1.5 rounded text-xs text-muted-foreground border border-border">Abbrechen</button>
              <button onClick={() => editEntry.name.trim() && saveEditEntry(editEntry)} disabled={!editEntry.name.trim()} className="px-3 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-50">Uebernehmen</button>
            </div>
          </div>
        </div>
      )}

      {/* Standard Permissions */}
      <Card title="Standard Permissions" icon={<KeyRound size={15} />} subtitle="Required for all new employees at the Hamburg location">
        <PermTable perms={standardPerms} userGroups={userGroups} />
      </Card>

      {/* Divider */}
      <div className="relative flex items-center py-1">
        <div className="flex-1 h-px bg-border" />
        <span className="px-4 text-xs text-muted-foreground font-medium">Additional permissions for Home Office</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Home Office Permissions */}
      <Card title="Home Office — Additional Permissions" icon={<Laptop size={15} />} subtitle="Required only for employees who need remote/home office access">
        <PermTable perms={homeOfficePerms} userGroups={userGroups} />
      </Card>

      {/* Admin-only: Check User Permissions */}
      {canCheck && (
        <Card title="Check Employee Permissions" icon={<Search size={15} />} subtitle="Look up AD group membership for a specific user">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Enter Corp ID or Username</label>
              <input
                value={checkUser}
                onChange={e => setCheckUser(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCheck()}
                placeholder="e.g. BQ8069"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <button
              onClick={handleCheck}
              disabled={checking || !checkUser.trim()}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                checking || !checkUser.trim() ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              {checking ? <Loader size={14} className="animate-spin" /> : <Search size={14} />}
              Check
            </button>
          </div>

          {checkError && (
            <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 whitespace-pre-wrap break-all">
              {checkError}
            </div>
          )}

          {userGroups && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-2">
                Results for <span className="font-semibold text-foreground">{checkedUser}</span> — {userGroups.size} AD groups found
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
