// ── Wiederverwendbare Benutzer-Sofortsuche ──────────────────────────────────
// Überall dort einsetzen, wo ein Benutzername eingegeben wird: lädt die AD-Nutzer-
// liste EINMAL aus dem Tages-Cache (`ensureDailyAdUsers`, wie die Benutzer-Übersicht)
// und filtert SOFORT im Client — schon ab 1 Zeichen, ohne Live-AD-Roundtrip.
// `onPick` liefert den gewählten `AdUserListItem`.

import { useEffect, useMemo, useState } from 'react'
import { Search, Loader2, UserSearch, ChevronRight, X } from 'lucide-react'
import { ensureDailyAdUsers } from '../services/adUserDirectory'
import type { AdUserListItem } from '../services/adUsersList'

const MAX_RESULTS = 60

export default function UserPicker({ onPick, placeholder, autoFocus }: {
  onPick: (u: AdUserListItem) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [term, setTerm] = useState('')
  const [users, setUsers] = useState<AdUserListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancel = false
    ensureDailyAdUsers()
      .then(({ dir, error }) => { if (cancel) return; setUsers(dir?.users ?? []); setErr(dir?.users?.length ? '' : (error || '')); setLoading(false) })
      .catch(e => { if (!cancel) { setErr(e instanceof Error ? e.message : String(e)); setLoading(false) } })
    return () => { cancel = true }
  }, [])

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase()
    if (!q) return []
    return users.filter(u =>
      u.displayName.toLowerCase().includes(q) ||
      u.sam.toLowerCase().includes(q) ||
      (u.department ?? '').toLowerCase().includes(q) ||
      (u.title ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'))
  }, [term, users])

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        {loading && <Loader2 size={14} className="absolute right-9 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
        <input value={term} onChange={e => setTerm(e.target.value)} spellCheck={false} autoFocus={autoFocus}
          placeholder={loading ? 'Verzeichnis wird geladen…' : (placeholder || 'Benutzer suchen (Name, Corp-ID, Abteilung)…')}
          className="w-full pl-9 pr-9 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
        {term && <button onClick={() => setTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent text-muted-foreground" title="Leeren"><X size={14} /></button>}
      </div>
      {err && !users.length && <p className="text-xs text-muted-foreground">Benutzerverzeichnis nicht verfügbar ({err || 'kein Cache'}). Bitte einmal die Benutzer-Übersicht öffnen.</p>}
      {term.trim() && (
        matches.length > 0 ? (
          <div className="rounded-md border border-border divide-y divide-border/60 max-h-60 overflow-y-auto">
            {matches.slice(0, MAX_RESULTS).map(u => (
              <button key={u.sam} onClick={() => { onPick(u); setTerm('') }}
                className="w-full flex items-center gap-2 text-left px-3 py-2 hover:bg-accent/20">
                <UserSearch size={14} className="text-primary shrink-0" />
                <span className="text-sm text-foreground">{u.displayName}</span>
                <span className="text-[11px] font-mono text-muted-foreground">{u.sam}</span>
                {(u.title || u.department) && <span className="text-[11px] text-muted-foreground truncate ml-auto">{[u.title, u.department].filter(Boolean).join(' · ')}</span>}
                <ChevronRight size={13} className="text-muted-foreground shrink-0" />
              </button>
            ))}
            {matches.length > MAX_RESULTS && <div className="px-3 py-1.5 text-[11px] text-muted-foreground">… und {matches.length - MAX_RESULTS} weitere — bitte genauer eingeben.</div>}
          </div>
        ) : !loading ? <p className="text-xs text-muted-foreground">Kein Benutzer zu „{term.trim()}".</p> : null
      )}
    </div>
  )
}
