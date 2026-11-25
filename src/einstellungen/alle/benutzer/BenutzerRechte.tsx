// ── Benutzer & Rechte (Einstellungen „Für alle“) ─────────────────────────────
// Links alle Konten (bestehende, vorgemerkte) + „Standard“ für alle ohne eigene Einstellung,
// rechts die Details. Ersetzt den früheren Menüpunkt „Benutzerverwaltung“ und die Karten
// „Menüpunkte ein-/ausblenden“ und „Menüpunkte pro Benutzer“ (19.11.2026).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, UserPlus, Crown, Shield, User, Globe, Loader, RefreshCw, AlertTriangle } from 'lucide-react'
import { api } from '../../../electronAPI'
import { useAuthStore } from '../../../store/authStore'
import { ladeRechteFuerVerwaltung, ladeGlobal } from '../../../services/benutzerRechte'
import { corpKey, istGruender, rechtLeer, type RechteDatei } from '../../../utils/sichtbarkeit'
import type { MenuVisibility } from '../../../utils/menuVisibility'
import type { AppUser } from '../../../types/auth'
import { Hinweis, knopf } from '../../teile'
import BenutzerDetail from './BenutzerDetail'
import StandardDetail from './StandardDetail'
import Vormerken from './Vormerken'

type Filter = 'alle' | 'master_admin' | 'admin' | 'user' | 'vorgemerkt' | 'eigene'
const FILTER: { id: Filter; label: string }[] = [
  { id: 'alle', label: 'Alle' }, { id: 'master_admin', label: 'Master' }, { id: 'admin', label: 'Admins' },
  { id: 'user', label: 'Benutzer' }, { id: 'vorgemerkt', label: 'Vorgemerkt' }, { id: 'eigene', label: 'Eigene Einstellung' },
]
const STANDARD = '__standard'

const RollenSymbol = ({ r }: { r: string }) => r === 'master_admin' ? <Crown size={13} className="es-gold" /> : r === 'admin' ? <Shield size={13} className="es-info" /> : <User size={13} className="text-muted-foreground" />

export default function BenutzerRechte() {
  const von = useAuthStore(s => s.session?.user?.displayName || s.session?.user?.username) || 'unbekannt'
  const [users, setUsers] = useState<AppUser[] | null>(null)
  const [datei, setDatei] = useState<RechteDatei | null>(null)
  const [global, setGlobal] = useState<MenuVisibility | null>(null)
  const [fehler, setFehler] = useState('')
  const [auswahl, setAuswahl] = useState<string>(STANDARD)
  const [suche, setSuche] = useState('')
  const [filter, setFilter] = useState<Filter>('alle')
  const [vormerken, setVormerken] = useState(false)

  const laden = useCallback(async (dateiNeu?: RechteDatei) => {
    setFehler('')
    try {
      const u = (await api().authGetUsers()).slice().sort((a, b) => (a.displayName || a.username).localeCompare(b.displayName || b.username, 'de'))
      const [d, g] = await Promise.all([dateiNeu ? Promise.resolve(dateiNeu) : ladeRechteFuerVerwaltung(u, von), ladeGlobal()])
      setUsers(u); setDatei(d); setGlobal(g)
    } catch (e) { setFehler(e instanceof Error ? e.message : String(e)) }
  }, [von])
  useEffect(() => { void laden() }, [laden])

  const eigene = (u: AppUser) => !!datei && !rechtLeer(datei.benutzer[corpKey(u)])
  const liste = useMemo(() => {
    if (!users) return []
    const q = suche.trim().toLowerCase()
    return users.filter(u => {
      if (q && !(`${u.displayName} ${u.username} ${u.windowsUsername || ''}`.toLowerCase().includes(q))) return false
      if (filter === 'vorgemerkt') return !u.lastLogin
      if (filter === 'eigene') return eigene(u)
      if (filter !== 'alle') return u.role === filter
      return true
    })
  }, [users, suche, filter, datei]) // eslint-disable-line react-hooks/exhaustive-deps

  if (fehler && !users) return <Hinweis ton="fehler">{fehler} <button onClick={() => void laden()} className="underline ml-1">Erneut versuchen</button></Hinweis>
  if (!users || !datei || !global) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader size={16} className="animate-spin" />Benutzer werden geladen …</div>

  const gewaehlt = users.find(u => u.id === auswahl)
  const ohneEigene = users.filter(u => !eigene(u) && !istGruender(u)).length
  const anzahl = (f: Filter) => users.filter(u => f === 'alle' ? true : f === 'vorgemerkt' ? !u.lastLogin : f === 'eigene' ? eigene(u) : u.role === f).length

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start" data-benutzer-rechte>
      {/* Liste */}
      <aside className="rounded-xl border border-border bg-card p-3 space-y-2.5 lg:sticky lg:top-16">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Name oder Corp ID" data-benutzer-suche
              className="w-full pl-8 pr-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
          </div>
          <button onClick={() => void laden()} className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent" title="Neu laden"><RefreshCw size={13} /></button>
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTER.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} data-benutzer-filter={f.id}
              className={`px-2 py-0.5 rounded-full text-[11px] border ${filter === f.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {f.label} <span className="opacity-70">{anzahl(f.id)}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setVormerken(true)} className={`${knopf} w-full justify-center`} data-vormerken-oeffnen><UserPlus size={13} />Benutzer vormerken (Corp ID)</button>

        <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1 space-y-1">
          <button onClick={() => setAuswahl(STANDARD)} aria-current={auswahl === STANDARD} data-benutzer-eintrag={STANDARD}
            className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left border ${auswahl === STANDARD ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-accent'}`}>
            <Globe size={14} className="es-gold shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-foreground">Standard</span>
              <span className="block text-[11px] text-muted-foreground">alle ohne eigene Einstellung · {ohneEigene}</span>
            </span>
          </button>
          {liste.map(u => {
            const gr = istGruender(u)
            return (
              <button key={u.id} onClick={() => setAuswahl(u.id)} aria-current={auswahl === u.id} data-benutzer-eintrag={corpKey(u)}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left border ${auswahl === u.id ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-accent'} ${u.status === 'disabled' ? 'opacity-60' : ''}`}>
                <RollenSymbol r={u.role} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-foreground truncate">{u.displayName || u.username}</span>
                  <span className="block text-[11px] text-muted-foreground truncate"><span className="font-mono">{u.windowsUsername || u.username}</span>{gr ? ' · geschützt' : ''}{!u.lastLogin ? ' · vorgemerkt' : ''}{u.status === 'disabled' ? ' · gesperrt' : ''}</span>
                </span>
                {eigene(u) && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground shrink-0" title="Eigene Menü-Einstellung">eigen</span>}
              </button>
            )
          })}
          {liste.length === 0 && <p className="text-xs text-muted-foreground px-2 py-3">Keine Treffer.</p>}
        </div>
      </aside>

      {/* Details */}
      <div className="min-w-0">
        {fehler && <Hinweis ton="fehler" className="mb-3"><AlertTriangle size={12} className="inline mr-1" />{fehler}</Hinweis>}
        {auswahl === STANDARD || !gewaehlt
          ? <StandardDetail datei={datei} global={global} ohneEigene={ohneEigene} onGespeichert={d => laden(d)} />
          : <BenutzerDetail key={gewaehlt.id} user={gewaehlt} users={users} datei={datei} global={global} onGespeichert={d => laden(d)} />}
      </div>

      {vormerken && <Vormerken users={users} datei={datei} onZu={() => setVormerken(false)}
        onFertig={async neu => { setVormerken(false); await laden(); setAuswahl(neu.id) }} />}
    </div>
  )
}
