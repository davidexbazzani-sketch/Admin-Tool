import { useState, useEffect, useCallback } from 'react'
import {
  Users, Plus, Trash2, Lock, Unlock, Shield, Crown, User,
  Key, Eye, EyeOff, AlertTriangle, CheckCircle, Loader, Search,
  ChevronDown, ChevronRight, Save, RefreshCw,
} from 'lucide-react'
import { api } from '../electronAPI'
import { useAuthStore, useIsFounder } from '../store/authStore'
import { FEATURES, getFeaturesByCategory } from '../utils/featureRegistry'
import { createLogger } from '../utils/activityLogger'
import type { AppUser } from '../types/auth'

const log = createLogger('user-management')

type TabId = 'users' | 'create' | 'permissions'

export default function UserManagement() {
  const session = useAuthStore(s => s.session)
  const isFounder = useIsFounder()
  const [tab, setTab] = useState<TabId>('users')
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Create user form
  const [newUsername, setNewUsername] = useState('')
  const [newDisplay, setNewDisplay] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [newRole, setNewRole] = useState<'user' | 'admin' | 'master_admin'>('admin')
  const [showNewPw, setShowNewPw] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')
  const [creating, setCreating] = useState(false)

  // Permissions editor
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [blockedFeatures, setBlockedFeatures] = useState<string[]>([])
  const [savingPerms, setSavingPerms] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  // Password reset modal
  const [resetModal, setResetModal] = useState<AppUser | null>(null)
  const [resetPw, setResetPw] = useState('')
  const [resetPw2, setResetPw2] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetting, setResetting] = useState(false)

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<AppUser | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const all = await api().authGetUsers()
      setUsers(all)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.displayName.toLowerCase().includes(search.toLowerCase())
  )

  const selectedUser = selectedUserId ? users.find(u => u.id === selectedUserId) : null

  // ── Create admin ────────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(''); setCreateSuccess('')
    if (newPw !== newPw2) { setCreateError('Passwörter stimmen nicht überein'); return }
    if (newPw.length < 6) { setCreateError('Passwort muss mind. 6 Zeichen haben'); return }
    if (users.some(u => u.username.toLowerCase() === newUsername.toLowerCase())) {
      setCreateError('Benutzername bereits vergeben'); return
    }
    setCreating(true)
    try {
      const u = await api().authCreateAdmin({
        username: newUsername.trim(),
        displayName: newDisplay.trim() || newUsername.trim(),
        password: newPw,
        createdBy: session?.user.id ?? '',
        role: newRole,
      })
      await log(`Konto erstellt (${newRole}): ${u.username}`, u.username)
      const roleLabel = newRole === 'master_admin' ? 'Master Admin' : newRole === 'admin' ? 'Admin' : 'Benutzer'
      setCreateSuccess(`${roleLabel} "${u.username}" erfolgreich erstellt`)
      setNewUsername(''); setNewDisplay(''); setNewPw(''); setNewPw2(''); setNewRole('admin')
      loadUsers()
    } catch (err) {
      setCreateError(String(err))
    } finally {
      setCreating(false)
    }
  }

  // ── Toggle status ────────────────────────────────────────────────────────────
  async function toggleStatus(user: AppUser) {
    const newStatus = user.status === 'active' ? 'disabled' : 'active'
    await api().authUpdateUser(user.id, { status: newStatus })
    await log(`Konto ${newStatus === 'active' ? 'entsperrt' : 'gesperrt'}: ${user.username}`, user.username)
    loadUsers()
  }

  // ── Promote / demote ──────────────────────────────────────────────────────────
  async function setRole(user: AppUser, role: 'master_admin' | 'admin' | 'user') {
    await api().authUpdateUser(user.id, { role })
    await log(`Rolle geändert auf "${role}": ${user.username}`, user.username)
    loadUsers()
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteConfirm) return
    setDeleting(true)
    await api().authDeleteUser(deleteConfirm.id)
    await log(`Konto gelöscht: ${deleteConfirm.username}`, deleteConfirm.username)
    setDeleteConfirm(null)
    setDeleting(false)
    loadUsers()
  }

  // ── Password reset ─────────────────────────────────────────────────────────────
  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setResetError('')
    if (resetPw !== resetPw2) { setResetError('Passwörter stimmen nicht überein'); return }
    if (resetPw.length < 6) { setResetError('Mind. 6 Zeichen'); return }
    setResetting(true)
    try {
      await api().authUpdatePassword(resetModal!.id, resetPw)
      await log(`Passwort zurückgesetzt für: ${resetModal!.username}`, resetModal!.username)
      setResetModal(null); setResetPw(''); setResetPw2('')
    } catch (err) { setResetError(String(err)) }
    finally { setResetting(false) }
  }

  // ── Permissions ───────────────────────────────────────────────────────────────
  function openPermissions(user: AppUser) {
    setSelectedUserId(user.id)
    setBlockedFeatures([...user.blockedFeatures])
    setTab('permissions')
    // Expand all categories by default
    const cats = new Set(FEATURES.filter(f => !f.masterAdminOnly).map(f => f.category))
    setExpandedCategories(cats)
  }

  function toggleFeature(featureId: string) {
    setBlockedFeatures(prev =>
      prev.includes(featureId) ? prev.filter(f => f !== featureId) : [...prev, featureId]
    )
  }

  async function savePermissions() {
    if (!selectedUserId) return
    setSavingPerms(true)
    await api().authUpdateUser(selectedUserId, { blockedFeatures })
    await log(`Berechtigungen aktualisiert für: ${selectedUser?.username}`, selectedUser?.username)
    setSavingPerms(false)
    loadUsers()
    setTab('users')
  }

  const featuresByCategory = getFeaturesByCategory()

  // ── Render ──────────────────────────────────────────────────────────────────
  const roleColor = (role: AppUser['role']) =>
    role === 'master_admin' ? 'text-amber-400' : role === 'admin' ? 'text-blue-400' : 'text-muted-foreground'
  const roleIcon = (role: AppUser['role']) =>
    role === 'master_admin' ? <Crown size={12} /> : role === 'admin' ? <Shield size={12} /> : <User size={12} />
  const roleLabel = (role: AppUser['role']) =>
    role === 'master_admin' ? 'Master Admin' : role === 'admin' ? 'Admin' : 'Benutzer'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <Users size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">Benutzerverwaltung</h1>
        <div className="ml-auto flex gap-2">
          {(['users', 'create'] as TabId[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${tab === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}>
              {t === 'users' ? 'Benutzer' : 'Neuer Benutzer'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">

        {/* ── Tab: User list ────────────────────────────────────────────────── */}
        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Benutzer suchen…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              </div>
              <button onClick={loadUsers} className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground">
                <RefreshCw size={13} />
              </button>
              <span className="text-xs text-muted-foreground">{users.length} Benutzer</span>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
                <Loader size={14} className="animate-spin" /> Wird geladen…
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map(u => (
                  <div key={u.id}
                    className={`bg-card border rounded-lg px-4 py-3 flex items-center gap-3 ${u.status === 'disabled' ? 'opacity-60' : ''}`}>
                    {/* Role icon */}
                    <div className={`shrink-0 ${roleColor(u.role)}`}>{roleIcon(u.role)}</div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{u.displayName}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                          u.role === 'master_admin' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
                          u.role === 'admin' ? 'text-blue-400 border-blue-500/30 bg-blue-500/10' :
                          'text-muted-foreground border-border bg-muted/20'}`}>
                          {roleLabel(u.role)}
                        </span>
                        {u.status === 'disabled' && <span className="text-[10px] text-red-400">Gesperrt</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        @{u.username}
                        {u.windowsUsername && ` · Windows: ${u.windowsUsername}`}
                        {u.lastLogin && ` · Letzter Login: ${new Date(u.lastLogin).toLocaleString('de-DE')}`}
                      </div>
                    </div>

                    {/* Actions */}
                    {u.id !== session?.user.id && (() => {
                      // master_admin targets: only the founder can manage them
                      if (u.role === 'master_admin') {
                        if (!isFounder) {
                          return (
                            <div className="shrink-0" title="Nur der Gründer-Admin kann andere Master Admins verwalten.">
                              <span className="text-[10px] text-muted-foreground/50 italic">Geschützt</span>
                            </div>
                          )
                        }
                        // founder sees full controls on other master admins
                        return (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => setRole(u, 'admin')} title="Zu Admin herabstufen"
                              className="p-1.5 rounded-md text-xs text-blue-400 hover:bg-blue-500/10 border border-blue-500/20 transition-colors">
                              <Shield size={12} />
                            </button>
                            <button onClick={() => { setResetModal(u); setResetPw(''); setResetPw2(''); setResetError('') }}
                              title="Passwort zurücksetzen"
                              className="p-1.5 rounded-md text-muted-foreground hover:bg-accent border border-border transition-colors">
                              <Key size={12} />
                            </button>
                            <button onClick={() => toggleStatus(u)}
                              title={u.status === 'active' ? 'Sperren' : 'Entsperren'}
                              className={`p-1.5 rounded-md border transition-colors ${u.status === 'active' ? 'text-amber-400 border-amber-500/20 hover:bg-amber-500/10' : 'text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10'}`}>
                              {u.status === 'active' ? <Lock size={12} /> : <Unlock size={12} />}
                            </button>
                            <button onClick={() => setDeleteConfirm(u)} title="Löschen"
                              className="p-1.5 rounded-md text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )
                      }
                      // admin or user targets
                      return (
                        <div className="flex items-center gap-1 shrink-0">
                          {u.role === 'user' && (
                            <button onClick={() => setRole(u, 'admin')} title="Zum Admin hochstufen"
                              className="p-1.5 rounded-md text-xs text-blue-400 hover:bg-blue-500/10 border border-blue-500/20 transition-colors">
                              <Shield size={12} />
                            </button>
                          )}
                          {u.role === 'admin' && (
                            <>
                              {isFounder && (
                                <button onClick={() => setRole(u, 'master_admin')} title="Zum Master Admin machen"
                                  className="p-1.5 rounded-md text-xs text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 transition-colors">
                                  <Crown size={12} />
                                </button>
                              )}
                              <button onClick={() => setRole(u, 'user')} title="Zum normalen Benutzer machen"
                                className="p-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent border border-border transition-colors">
                                <User size={12} />
                              </button>
                              <button onClick={() => openPermissions(u)} title="Berechtigungen bearbeiten"
                                className="px-2 py-1 rounded-md text-xs text-primary hover:bg-primary/10 border border-primary/30 transition-colors">
                                Rechte
                              </button>
                              <button onClick={() => { setResetModal(u); setResetPw(''); setResetPw2(''); setResetError('') }}
                                title="Passwort zurücksetzen"
                                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent border border-border transition-colors">
                                <Key size={12} />
                              </button>
                            </>
                          )}
                          <button onClick={() => toggleStatus(u)}
                            title={u.status === 'active' ? 'Sperren' : 'Entsperren'}
                            className={`p-1.5 rounded-md border transition-colors ${u.status === 'active' ? 'text-amber-400 border-amber-500/20 hover:bg-amber-500/10' : 'text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10'}`}>
                            {u.status === 'active' ? <Lock size={12} /> : <Unlock size={12} />}
                          </button>
                          <button onClick={() => setDeleteConfirm(u)} title="Löschen"
                            className="p-1.5 rounded-md text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Create admin ───────────────────────────────────────────────── */}
        {tab === 'create' && (
          <div className="max-w-md space-y-4">
            <p className="text-sm text-muted-foreground">Einen neuen Benutzer erstellen.</p>
            <form onSubmit={handleCreate} className="space-y-4 bg-card border border-border rounded-xl p-5">
              {/* Role selector */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Rolle *</label>
                <div className="flex gap-2">
                  {([
                    { id: 'user' as const, label: 'Normaler Benutzer', icon: <User size={12} /> },
                    { id: 'admin' as const, label: 'Admin', icon: <Shield size={12} /> },
                    ...(isFounder ? [{ id: 'master_admin' as const, label: 'Master Admin', icon: <Crown size={12} /> }] : []),
                  ]).map(r => (
                    <button key={r.id} type="button" onClick={() => setNewRole(r.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors flex-1 justify-center ${
                        newRole === r.id
                          ? r.id === 'master_admin' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : r.id === 'admin' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          : 'bg-primary/10 text-primary border-primary/30'
                          : 'border-border text-muted-foreground hover:bg-accent'
                      }`}>
                      {r.icon} {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Benutzername *</label>
                <input value={newUsername} onChange={e => setNewUsername(e.target.value)} required
                  placeholder="z.B. jschneider"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Anzeigename</label>
                <input value={newDisplay} onChange={e => setNewDisplay(e.target.value)}
                  placeholder="z.B. Julia Schneider"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              </div>
              {newRole !== 'user' && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Passwort *</label>
                    <div className="relative">
                      <input type={showNewPw ? 'text' : 'password'} value={newPw}
                        onChange={e => setNewPw(e.target.value)} required={newRole !== 'user'} minLength={6}
                        className="w-full pr-9 px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                      <button type="button" onClick={() => setShowNewPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Passwort bestätigen *</label>
                    <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)} required={newRole !== 'user'}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                  </div>
                </>
              )}
              {newRole === 'user' && (
                <p className="text-[11px] text-muted-foreground bg-muted/20 px-3 py-2 rounded-lg">
                  Normaler Benutzer meldet sich per Windows SSO an — kein Passwort erforderlich.
                </p>
              )}
              {createError && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
                  <AlertTriangle size={12} />{createError}
                </div>
              )}
              {createSuccess && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-lg">
                  <CheckCircle size={12} />{createSuccess}
                </div>
              )}
              <button type="submit" disabled={creating}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                {creating ? <Loader size={14} className="animate-spin" /> : <><Plus size={14} /> Benutzer erstellen</>}
              </button>
            </form>
          </div>
        )}

        {/* ── Tab: Permissions ────────────────────────────────────────────────── */}
        {tab === 'permissions' && selectedUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Berechtigungen: <span className="text-primary">{selectedUser.displayName}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Haken entfernen = Funktion gesperrt. Standardmäßig alles erlaubt.
                </p>
              </div>
              <div className="ml-auto flex gap-2">
                <button onClick={() => setBlockedFeatures([])}
                  className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">
                  Alle erlauben
                </button>
                <button onClick={savePermissions} disabled={savingPerms}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-50">
                  {savingPerms ? <Loader size={12} className="animate-spin" /> : <><Save size={12} /> Speichern</>}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {Array.from(featuresByCategory.entries()).map(([cat, features]) => {
                const adminFeatures = features.filter(f => !f.masterAdminOnly)
                if (!adminFeatures.length) return null
                const isOpen = expandedCategories.has(cat)
                const blocked = adminFeatures.filter(f => blockedFeatures.includes(f.id)).length
                return (
                  <div key={cat} className="bg-card border border-border rounded-lg overflow-hidden">
                    <button onClick={() => setExpandedCategories(prev => {
                      const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n
                    })} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/20 transition-colors">
                      {isOpen ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                      <span className="text-sm font-medium text-foreground flex-1 text-left">{cat}</span>
                      {blocked > 0 && <span className="text-[10px] text-amber-400">{blocked} gesperrt</span>}
                    </button>
                    {isOpen && (
                      <div className="border-t border-border divide-y divide-border">
                        {adminFeatures.map(f => {
                          const isBlocked = blockedFeatures.includes(f.id)
                          return (
                            <label key={f.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/10 cursor-pointer">
                              <input type="checkbox" checked={!isBlocked}
                                onChange={() => toggleFeature(f.id)}
                                className="w-3.5 h-3.5 accent-primary shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground">{f.label}</p>
                                {f.description && <p className="text-[10px] text-muted-foreground">{f.description}</p>}
                              </div>
                              {isBlocked && <span className="text-[10px] text-amber-400 shrink-0">Gesperrt</span>}
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Password reset modal ─────────────────────────────────────────────── */}
      {resetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-5 w-[380px] shadow-2xl space-y-4">
            <div className="flex items-center gap-2">
              <Key size={15} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Passwort zurücksetzen</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Neues Passwort für <span className="text-foreground font-medium">{resetModal.displayName}</span> ({resetModal.username}):
            </p>
            <form onSubmit={handleReset} className="space-y-3">
              <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)}
                placeholder="Neues Passwort" required minLength={6}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              <input type="password" value={resetPw2} onChange={e => setResetPw2(e.target.value)}
                placeholder="Passwort bestätigen" required
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              {resetError && <p className="text-xs text-red-400">{resetError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setResetModal(null)}
                  className="flex-1 py-2 text-sm rounded-lg border border-border hover:bg-accent text-muted-foreground">
                  Abbrechen
                </button>
                <button type="submit" disabled={resetting}
                  className="flex-1 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50">
                  {resetting ? <Loader size={13} className="animate-spin mx-auto" /> : 'Zurücksetzen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirm ────────────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-red-500/40 rounded-xl p-5 w-[380px] shadow-2xl space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-400" />
              <h3 className="text-sm font-semibold text-foreground">Konto löschen</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Soll das Konto <span className="text-foreground font-medium">{deleteConfirm.displayName}</span> ({deleteConfirm.username}) wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 text-sm rounded-lg border border-border hover:bg-accent text-muted-foreground">
                Abbrechen
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50">
                {deleting ? <Loader size={13} className="animate-spin mx-auto" /> : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
