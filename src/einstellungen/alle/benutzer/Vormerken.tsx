// ── Benutzer vormerken: Corp ID + Rolle (+ Einstellungen eines anderen übernehmen) ──
// Für Personen, die das Tool noch nie geöffnet haben. Bei der ersten Windows-Anmeldung
// greift der vorbereitete Eintrag (authManager.createOrGetSsoUser findet ihn über die Corp ID).
// Die Namenssuche liest nur den AD-Tagescache (keine AD-Abfrage).
import { useEffect, useMemo, useState } from 'react'
import { UserPlus, Loader, Search, X } from 'lucide-react'
import { api } from '../../../electronAPI'
import { useAuthStore } from '../../../store/authStore'
import { readCentralAdUsersAsync } from '../../../services/adUserDirectory'
import type { AdUserListItem } from '../../../services/adUsersList'
import { protokolliere } from '../../../services/aktivitaet'
import { speichereRecht } from '../../../services/benutzerRechte'
import { corpKey, type RechteDatei, type Rolle } from '../../../utils/sichtbarkeit'
import type { AppUser } from '../../../types/auth'
import { eingabe, knopf, knopfLeise } from '../../teile'
import { ROLLEN, rollenLabel } from './BenutzerDetail'

export default function Vormerken({ users, datei, onZu, onFertig }: {
  users: AppUser[]; datei: RechteDatei; onZu: () => void; onFertig: (neu: AppUser) => Promise<void>
}) {
  const von = useAuthStore(s => s.session?.user?.displayName || s.session?.user?.username) || 'unbekannt'
  const [ad, setAd] = useState<AdUserListItem[]>([])
  const [suche, setSuche] = useState('')
  const [corp, setCorp] = useState('')
  const [name, setName] = useState('')
  const [rolle, setRolle] = useState<Rolle>('user')
  const [vorlage, setVorlage] = useState('')
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)

  useEffect(() => { void readCentralAdUsersAsync().then(d => setAd(d?.users || [])).catch(() => setAd([])) }, [])
  const vorhanden = useMemo(() => new Set(users.map(u => corpKey(u))), [users])
  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase()
    if (q.length < 2) return []
    return ad.filter(u => u.displayName.toLowerCase().includes(q) || u.sam.toLowerCase().includes(q) || (u.department || '').toLowerCase().includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de')).slice(0, 30)
  }, [suche, ad])
  const vorlagen = users.filter(u => datei.benutzer[corpKey(u)])
  const schonDa = !!corp.trim() && vorhanden.has(corp.trim().toLowerCase())

  async function los() {
    const id = corp.trim()
    if (!id) { setFehler('Bitte eine Corp ID eingeben oder oben eine Person wählen.'); return }
    setLaeuft(true); setFehler('')
    try {
      const r = await api().authVormerken({ corpId: id, displayName: name.trim() || undefined, role: rolle, createdBy: von })
      if (!r.ok) { setFehler(r.error); return }
      const quelle = vorlagen.find(u => u.id === vorlage)
      if (quelle) {
        const recht = datei.benutzer[corpKey(quelle)]
        if (recht) {
          const s = await speichereRecht(id, recht, [...users, r.user], von)
          if (!s.ok) setFehler(`Vorgemerkt, aber die Menü-Einstellungen konnten nicht übernommen werden: ${s.error || ''}`)
        }
      }
      protokolliere({ art: 'manuell', quelle: 'Benutzer & Rechte', aktion: `Benutzer vorgemerkt als ${rollenLabel(rolle)}${quelle ? ` (Einstellungen wie ${quelle.displayName || quelle.username})` : ''}`, ziel: `${r.user.displayName} (${id})` })
      await onFertig(r.user)
    } catch (e) { setFehler(e instanceof Error ? e.message : String(e)) } finally { setLaeuft(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Benutzer vormerken">
      <div className="es-app bg-card border border-border rounded-xl w-full max-w-lg shadow-2xl" data-vormerken>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <UserPlus size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground flex-1">Benutzer vormerken</h3>
          <button onClick={onZu} className="p-1 rounded hover:bg-accent text-muted-foreground" aria-label="Schließen"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground">Für jemanden, der das Tool noch nie geöffnet hat. Bei der ersten Anmeldung mit Windows gelten Rolle und Menüpunkte sofort.</p>
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Person suchen (Name, Corp ID, Abteilung)</span>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={suche} onChange={e => setSuche(e.target.value)} placeholder={ad.length ? `${ad.length} Personen im Verzeichnis` : 'Verzeichnis nicht verfügbar – Corp ID unten direkt eingeben'}
                className={`${eingabe} pl-8`} data-vormerken-suche autoFocus />
            </div>
            {treffer.length > 0 && (
              <div className="rounded-md border border-border divide-y divide-border max-h-48 overflow-y-auto">
                {treffer.map(u => {
                  const da = vorhanden.has(u.sam.toLowerCase())
                  return (
                    <button key={u.sam} disabled={da} onClick={() => { setCorp(u.sam); setName(u.displayName); setSuche('') }} data-vormerken-treffer={u.sam}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed">
                      <span className="text-sm text-foreground">{u.displayName}</span>
                      <span className="text-[11px] font-mono text-muted-foreground">{u.sam}</span>
                      <span className="text-[11px] text-muted-foreground ml-auto truncate">{da ? 'schon in der Liste' : u.department || ''}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1"><span className="text-xs text-muted-foreground">Corp ID *</span>
              <input value={corp} onChange={e => { setCorp(e.target.value.trim()); setFehler('') }} placeholder="z. B. AB1234" spellCheck={false} className={`${eingabe} font-mono`} data-vormerken-corp /></label>
            <label className="space-y-1"><span className="text-xs text-muted-foreground">Anzeigename</span>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Vorname Nachname" className={eingabe} data-vormerken-name /></label>
          </div>
          {schonDa && <p className="text-xs es-warn">Für diese Corp ID gibt es schon einen Eintrag – bitte in der Liste auswählen.</p>}
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Rolle</span>
            <div className="grid grid-cols-3 gap-2">
              {ROLLEN.map(r => (
                <button key={r.id} onClick={() => setRolle(r.id)} aria-pressed={rolle === r.id} data-vormerken-rolle={r.id}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${rolle === r.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:bg-accent'}`}>{r.icon}{r.label}</button>
              ))}
            </div>
          </div>
          <label className="space-y-1 block"><span className="text-xs text-muted-foreground">Menüpunkte</span>
            <select value={vorlage} onChange={e => setVorlage(e.target.value)} className={eingabe} data-vormerken-vorlage>
              <option value="">Wie Standard (später einzeln anpassbar)</option>
              {vorlagen.map(u => <option key={u.id} value={u.id}>Wie {u.displayName || u.username}</option>)}
            </select></label>
          {fehler && <p className="text-xs es-fehler" role="alert" data-vormerken-fehler>{fehler}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onZu} className={knopfLeise}>Abbrechen</button>
          <button onClick={() => void los()} disabled={laeuft || !corp.trim() || schonDa} className={knopf} data-vormerken-los>{laeuft ? <Loader size={13} className="animate-spin" /> : <UserPlus size={13} />}Vormerken</button>
        </div>
      </div>
    </div>
  )
}
