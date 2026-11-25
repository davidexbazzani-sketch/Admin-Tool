// ── Ein Benutzer: Rolle, Menüpunkte und Bereiche, einzelne Funktionen, Konto ──
import { useEffect, useMemo, useState } from 'react'
import { Crown, Shield, User, Save, Loader, RotateCcw, Lock, Unlock, Trash2, Key, Eye, AlertTriangle } from 'lucide-react'
import { api } from '../../../electronAPI'
import { useAuthStore } from '../../../store/authStore'
import { useMenuSichtbar } from '../../../store/menuSichtbarStore'
import { protokolliere } from '../../../services/aktivitaet'
import { speichereRecht, kontextFuer } from '../../../services/benutzerRechte'
import { wirksameVorgabe } from '../../../services/serverMelder'
import { corpKey, istGruender, rechtLeer, type BenutzerRecht, type RechteDatei, type RechteModus, type Rolle } from '../../../utils/sichtbarkeit'
import type { MenuVisibility } from '../../../utils/menuVisibility'
import type { AppUser } from '../../../types/auth'
import { PersonInfoButton } from '../../../components/person/PersonDossier'
import { Abschnitt, Hinweis, knopf, knopfLeise, datumZeit, eingabe } from '../../teile'
import { BenutzerMenueListe } from './MenueListe'
import { LEERES_RECHT, modusWechseln, allePunkte, zaehle, vorschau, ZEILEN } from './modell'

export const ROLLEN: { id: Rolle; label: string; icon: React.ReactNode; text: string }[] = [
  { id: 'user', label: 'Benutzer', icon: <User size={14} />, text: 'Normale Bereiche, keine Admin-Werkzeuge' },
  { id: 'admin', label: 'Admin', icon: <Shield size={14} />, text: 'Admin-Werkzeuge, nimmt an der Automatik teil' },
  { id: 'master_admin', label: 'Master Admin', icon: <Crown size={14} />, text: 'Zusätzlich Benutzer-Logs und Bug-Meldungen' },
]
export const rollenLabel = (r: string) => ROLLEN.find(x => x.id === r)?.label || 'Benutzer'

/** Einzelne Funktionen, die das Tool wirklich prüft (useCanAccess) — nur bei Admins wirksam. */
const FUNKTIONEN = [
  { id: 'infra-marine.send-email', label: 'Infrastruktur Marine › Incident Response: Mails versenden' },
  { id: 'infra-marine.permissions.check', label: 'Infrastruktur Marine › Berechtigungen: Prüfung starten' },
]

const MODI: { id: RechteModus; label: string; text: string }[] = [
  { id: 'standard', label: 'Wie Standard', text: 'Menüpunkte nach den Regeln für alle. Unterbereiche lassen sich trotzdem einzeln ausblenden.' },
  { id: 'ausser', label: 'Alle außer …', text: 'Alles, was die Rolle erlaubt – außer den abgewählten. Neue Menüpunkte erscheinen automatisch.' },
  { id: 'nur', label: 'Nur ausgewählte', text: 'Nur die angehakten Menüpunkte. Neue Menüpunkte bleiben verborgen, bis sie angehakt werden.' },
]

export default function BenutzerDetail({ user, users, datei, global, onGespeichert }: {
  user: AppUser; users: AppUser[]; datei: RechteDatei; global: MenuVisibility
  onGespeichert: (datei?: RechteDatei) => Promise<void> | void
}) {
  const ich = useAuthStore(s => s.session?.user)
  const von = ich?.displayName || ich?.username || 'unbekannt'
  const neuLaden = useMenuSichtbar(s => s.neuLaden)
  const key = corpKey(user)
  const gruender = istGruender(user)
  const binIch = !!ich && (ich.id === user.id || corpKey(ich) === key)
  const ausgangsRecht = datei.benutzer[key] || LEERES_RECHT

  const [rolle, setRolle] = useState<Rolle>(user.role as Rolle)
  const [recht, setRecht] = useState<BenutzerRecht>(ausgangsRecht)
  const [gesperrt, setGesperrt] = useState<string[]>(user.blockedFeatures || [])
  const [speichert, setSpeichert] = useState(false)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  const [vorschauAuf, setVorschauAuf] = useState(false)
  const [pwDialog, setPwDialog] = useState(false)
  const [loeschDialog, setLoeschDialog] = useState(false)

  // anderer Benutzer gewählt → Formular neu
  useEffect(() => {
    setRolle(user.role as Rolle); setRecht(datei.benutzer[key] || LEERES_RECHT); setGesperrt(user.blockedFeatures || []); setMeldung(null)
  }, [user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = useMemo(() => kontextFuer({ ...user, role: rolle }, recht, datei, global), [user, rolle, recht, datei, global])
  const zahl = zaehle(ctx)
  const geaendert = rolle !== user.role
    || JSON.stringify(recht) !== JSON.stringify(ausgangsRecht)
    || JSON.stringify([...gesperrt].sort()) !== JSON.stringify([...(user.blockedFeatures || [])].sort())
  const nurLeer = recht.modus === 'nur' && recht.menue.length === 0
  const automatikKonto = (wirksameVorgabe().konto || '').toLowerCase()   // leer = Gerät zählt, nicht das Konto
  const warnungen: string[] = []
  if (rolle === 'user' && user.role !== 'user' && !!automatikKonto && key === automatikKonto) warnungen.push(`Dieses Konto ist für den Automatik-PC eingetragen. Als „Benutzer“ nimmt es nicht mehr an den automatischen Scans teil.`)
  if (binIch && rolle !== user.role) warnungen.push('Du änderst deine eigene Rolle. Sie gilt ab deinem nächsten Start des Tools.')

  async function speichern() {
    if (nurLeer) return
    setSpeichert(true); setMeldung(null)
    try {
      let liste = users
      if (rolle !== user.role) {
        const ok = await api().authUpdateUser(user.id, { role: rolle })
        if (!ok) throw new Error('Rolle konnte nicht gespeichert werden.')
        protokolliere({ art: 'manuell', quelle: 'Benutzer & Rechte', aktion: `Rolle geändert: ${rollenLabel(user.role)} → ${rollenLabel(rolle)}`, ziel: user.displayName || user.username })
        liste = users.map(u => u.id === user.id ? { ...u, role: rolle } : u)
      }
      const gesperrtNeu = [...gesperrt].sort()
      if (JSON.stringify(gesperrtNeu) !== JSON.stringify([...(user.blockedFeatures || [])].sort())) {
        await api().authUpdateUser(user.id, { blockedFeatures: gesperrtNeu })
        protokolliere({ art: 'manuell', quelle: 'Benutzer & Rechte', aktion: 'Einzelne Funktionen geändert', ziel: user.displayName || user.username, ergebnis: gesperrtNeu.length ? `gesperrt: ${gesperrtNeu.join(', ')}` : 'alle erlaubt' })
      }
      let neueDatei: RechteDatei | undefined
      if (JSON.stringify(recht) !== JSON.stringify(ausgangsRecht)) {
        const r = await speichereRecht(key, rechtLeer(recht) ? null : recht, liste, von)
        if (!r.ok) throw new Error(r.error || 'Speichern fehlgeschlagen.')
        neueDatei = r.datei
        const z = zaehle(kontextFuer({ ...user, role: rolle }, recht, r.datei, global))
        protokolliere({ art: 'manuell', quelle: 'Benutzer & Rechte', aktion: `Menüpunkte geändert (${MODI.find(m => m.id === recht.modus)?.label})`, ziel: user.displayName || user.username, ergebnis: `sieht ${z.sichtbar} von ${z.erlaubt} Menüpunkten; Bereiche aus bei ${Object.keys(recht.bereiche).length} Menüpunkten` })
      } else if (rolle !== user.role) {
        // Rolle geändert: Momentaufnahme für ältere Tool-Versionen mit der neuen Rolle nachziehen
        if (!rechtLeer(recht)) await speichereRecht(key, recht, liste, von).catch(() => null)
      }
      if (binIch) neuLaden()
      setMeldung({ ok: true, text: rolle !== user.role ? 'Gespeichert. Die Rolle gilt ab dem nächsten Start des Tools; Menüpunkte spätestens nach 5 Minuten.' : 'Gespeichert. Wirkt beim Benutzer spätestens nach 5 Minuten (beim Wechsel ins Tool-Fenster).' })
      await onGespeichert(neueDatei)
    } catch (e) {
      setMeldung({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally { setSpeichert(false) }
  }

  async function statusUmschalten() {
    const neu = user.status === 'active' ? 'disabled' : 'active'
    if (neu === 'disabled' && !window.confirm(`${user.displayName || user.username} sperren? Die Anmeldung mit Passwort geht dann nicht mehr.`)) return
    await api().authUpdateUser(user.id, { status: neu })
    protokolliere({ art: 'manuell', quelle: 'Benutzer & Rechte', aktion: neu === 'disabled' ? 'Konto gesperrt' : 'Konto entsperrt', ziel: user.displayName || user.username })
    await onGespeichert()
  }

  if (gruender) {
    return (
      <div className="space-y-4" data-benutzer-detail={key}>
        <Kopf user={user} />
        <Hinweis ton="info">Das ist der geschützte Gründer-Master. Er sieht immer alles; Rolle und Menüpunkte lassen sich nicht ändern.</Hinweis>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-benutzer-detail={key}>
      <Kopf user={user} />

      <Abschnitt titel="Rolle" untertitel="Die Rolle legt fest, welche Menüpunkte überhaupt möglich sind. Admin-Werkzeuge gibt es nur ab „Admin“.">
        <div className="grid sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Rolle">
          {ROLLEN.map(r => (
            <button key={r.id} role="radio" aria-checked={rolle === r.id} onClick={() => setRolle(r.id)} data-rolle={r.id}
              className={`text-left rounded-lg border p-2.5 transition-colors ${rolle === r.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'}`}>
              <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${rolle === r.id ? 'text-primary' : 'text-foreground'}`}>{r.icon}{r.label}</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">{r.text}</span>
            </button>
          ))}
        </div>
        {warnungen.map(w => <Hinweis key={w} ton="warn">{w}</Hinweis>)}
      </Abschnitt>

      <Abschnitt titel="Menüpunkte und Bereiche" untertitel={`Sieht ${zahl.sichtbar} von ${zahl.erlaubt} Menüpunkten, die die Rolle erlaubt.`}
        rechts={<button onClick={() => setVorschauAuf(v => !v)} className={knopfLeise} data-vorschau-knopf><Eye size={13} />{vorschauAuf ? 'Vorschau aus' : 'Vorschau'}</button>}>
        <div className="grid sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Modus">
          {MODI.map(m => (
            <button key={m.id} role="radio" aria-checked={recht.modus === m.id} onClick={() => setRecht(modusWechseln(recht, m.id, ctx))} data-modus={m.id}
              className={`text-left rounded-lg border p-2.5 transition-colors ${recht.modus === m.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'}`}>
              <span className={`text-sm font-medium ${recht.modus === m.id ? 'text-primary' : 'text-foreground'}`}>{m.label}</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">{m.text}</span>
            </button>
          ))}
        </div>
        {recht.modus !== 'standard' && (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setRecht(allePunkte(recht, true, ctx))} className={knopfLeise} data-alle-an>Alle an</button>
            <button onClick={() => setRecht(allePunkte(recht, false, ctx, binIch ? ['settings'] : []))} className={knopfLeise} data-alle-aus>Alle aus</button>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">Nur einen:
              <select value="" onChange={e => { const id = e.target.value; if (id) setRecht({ ...recht, modus: 'nur', menue: binIch && id !== 'settings' ? [id, 'settings'] : [id] }) }} className="text-xs rounded-md border border-border bg-background px-2 py-1 text-foreground" data-nur-einen>
                <option value="">– wählen –</option>
                {ZEILEN.filter(m => ctx.rolle === 'master_admin' || !m.masterAdminOnly).filter(m => ctx.rolle !== 'user' || !m.adminOnly).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          </div>
        )}
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">Von Benutzer übernehmen:
          <select value="" onChange={e => { const u = users.find(x => x.id === e.target.value); if (u) setRecht(datei.benutzer[corpKey(u)] || LEERES_RECHT) }} className="text-xs rounded-md border border-border bg-background px-2 py-1 text-foreground" data-uebernehmen>
            <option value="">– wählen –</option>
            {users.filter(u => u.id !== user.id && datei.benutzer[corpKey(u)]).map(u => <option key={u.id} value={u.id}>{u.displayName || u.username}</option>)}
          </select>
        </label>
        {nurLeer && <Hinweis ton="fehler">Bei „Nur ausgewählte“ muss mindestens ein Menüpunkt angehakt sein.</Hinweis>}
        <div className={vorschauAuf ? 'grid lg:grid-cols-[1fr_240px] gap-4' : ''}>
          <BenutzerMenueListe ctx={ctx} recht={recht} onRecht={setRecht} festAn={binIch ? ['settings'] : []} />
          {vorschauAuf && <Vorschau ctx={ctx} name={user.displayName || user.username} />}
        </div>
      </Abschnitt>

      {rolle === 'admin' && (
        <Abschnitt titel="Einzelne Funktionen" untertitel="Nur bei Admins wirksam (Master dürfen immer alles).">
          {FUNKTIONEN.map(f => (
            <label key={f.id} className="flex items-center gap-2 text-xs text-foreground">
              <input type="checkbox" checked={!gesperrt.includes(f.id)} onChange={e => setGesperrt(g => e.target.checked ? g.filter(x => x !== f.id) : [...g, f.id])} className="w-4 h-4 accent-primary" data-funktion={f.id} />
              {f.label}
            </label>
          ))}
        </Abschnitt>
      )}

      {/* Speichern */}
      <div className="sticky bottom-0 z-10 -mx-1 px-1 py-2 bg-background/95 backdrop-blur border-t border-border flex items-center gap-2 flex-wrap">
        <button onClick={() => void speichern()} disabled={!geaendert || speichert || nurLeer} className={knopf} data-benutzer-speichern>
          {speichert ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}Speichern
        </button>
        <button onClick={() => { setRolle(user.role as Rolle); setRecht(ausgangsRecht); setGesperrt(user.blockedFeatures || []) }} disabled={!geaendert || speichert} className={knopfLeise}><RotateCcw size={13} />Verwerfen</button>
        {!rechtLeer(ausgangsRecht) && (
          <button onClick={() => setRecht(LEERES_RECHT)} disabled={speichert} className={knopfLeise} data-eigene-entfernen title="Danach gilt wieder der Standard (nach dem Speichern)">Eigene Einstellung entfernen</button>
        )}
        {geaendert && !speichert && <span className="text-xs es-warn">Nicht gespeichert</span>}
        {meldung && <span className={`text-xs ${meldung.ok ? 'es-ok' : 'es-fehler'}`} data-benutzer-meldung>{meldung.text}</span>}
      </div>

      <Abschnitt titel="Konto">
        <div className="flex items-center gap-2 flex-wrap">
          {user.passwordHash && <button onClick={() => setPwDialog(true)} className={knopfLeise}><Key size={13} />Passwort zurücksetzen</button>}
          {!binIch && <button onClick={() => void statusUmschalten()} className={knopfLeise} data-konto-status>{user.status === 'active' ? <><Lock size={13} />Sperren</> : <><Unlock size={13} />Entsperren</>}</button>}
          {!binIch && <button onClick={() => setLoeschDialog(true)} className={`${knopfLeise} es-fehler`} data-konto-loeschen><Trash2 size={13} />Löschen</button>}
        </div>
        {user.status === 'disabled' && <p className="text-xs es-warn">Gesperrt: Die Anmeldung mit Passwort ist nicht möglich.</p>}
      </Abschnitt>

      {pwDialog && <PasswortDialog user={user} onZu={() => setPwDialog(false)} />}
      {loeschDialog && <LoeschDialog user={user} users={users} von={von} onZu={() => setLoeschDialog(false)} onFertig={async () => { setLoeschDialog(false); await onGespeichert() }} />}
    </div>
  )
}

function Kopf({ user }: { user: AppUser }) {
  const r = ROLLEN.find(x => x.id === user.role)
  return (
    <div className="flex items-start gap-3">
      <span className="es-symbol">{r?.icon || <User size={14} />}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h2 className="text-lg font-semibold text-foreground truncate">{user.displayName || user.username}</h2>
          <PersonInfoButton name={user.displayName || user.username} sam={corpKey(user)} size={14} />
        </div>
        <p className="text-xs text-muted-foreground">
          Corp ID <span className="font-mono text-foreground">{user.windowsUsername || user.username}</span> · {rollenLabel(user.role)}
          {user.lastLogin ? ` · zuletzt angemeldet ${datumZeit(user.lastLogin)}` : ` · noch nie angemeldet${user.createdAt ? ` (angelegt ${datumZeit(user.createdAt)})` : ''}`}
        </p>
      </div>
    </div>
  )
}

function Vorschau({ ctx, name }: { ctx: Parameters<typeof vorschau>[0]; name: string }) {
  const v = vorschau(ctx)
  return (
    <aside className="rounded-lg border border-border bg-background p-3 text-xs space-y-2 self-start lg:sticky lg:top-16" data-vorschau>
      <p className="font-semibold text-foreground">So sieht {name} die Seitenleiste</p>
      {v.length === 0 && <p className="text-muted-foreground">Keine Menüpunkte.</p>}
      {v.map(g => (
        <div key={g.kategorie}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{g.kategorie}</p>
          <ul className="pl-2">{g.punkte.map(p => <li key={p} className="text-foreground">{p}</li>)}</ul>
        </div>
      ))}
    </aside>
  )
}

function PasswortDialog({ user, onZu }: { user: AppUser; onZu: () => void }) {
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [fehler, setFehler] = useState(''); const [laeuft, setLaeuft] = useState(false)
  async function los(e: React.FormEvent) {
    e.preventDefault()
    if (a.length < 6) { setFehler('Mindestens 6 Zeichen.'); return }
    if (a !== b) { setFehler('Die Passwörter stimmen nicht überein.'); return }
    setLaeuft(true)
    try {
      await api().authUpdatePassword(user.id, a)
      protokolliere({ art: 'manuell', quelle: 'Benutzer & Rechte', aktion: 'Passwort zurückgesetzt', ziel: user.displayName || user.username })
      onZu()
    } catch (err) { setFehler(String(err)) } finally { setLaeuft(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <form onSubmit={e => void los(e)} className="es-app bg-card border border-border rounded-xl p-5 w-[380px] space-y-3 shadow-2xl">
        <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2"><Key size={15} />Passwort zurücksetzen</h3>
        <p className="text-xs text-muted-foreground">Neues Passwort für {user.displayName || user.username}:</p>
        <input type="password" value={a} onChange={e => { setA(e.target.value); setFehler('') }} placeholder="Neues Passwort" className={eingabe} autoFocus />
        <input type="password" value={b} onChange={e => { setB(e.target.value); setFehler('') }} placeholder="Wiederholen" className={eingabe} />
        {fehler && <p className="text-xs es-fehler">{fehler}</p>}
        <div className="flex gap-2 justify-end"><button type="button" onClick={onZu} className={knopfLeise}>Abbrechen</button><button type="submit" disabled={laeuft} className={knopf}>{laeuft ? <Loader size={13} className="animate-spin" /> : null}Zurücksetzen</button></div>
      </form>
    </div>
  )
}

function LoeschDialog({ user, users, von, onZu, onFertig }: { user: AppUser; users: AppUser[]; von: string; onZu: () => void; onFertig: () => Promise<void> }) {
  const [laeuft, setLaeuft] = useState(false)
  async function loeschen() {
    setLaeuft(true)
    try {
      await api().authDeleteUser(user.id)
      await speichereRecht(corpKey(user), null, users, von).catch(() => null)
      protokolliere({ art: 'manuell', quelle: 'Benutzer & Rechte', aktion: 'Konto gelöscht', ziel: user.displayName || user.username })
      await onFertig()
    } finally { setLaeuft(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="es-app bg-card border border-border rounded-xl p-5 w-[400px] space-y-3 shadow-2xl">
        <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2"><AlertTriangle size={15} className="es-fehler" />Konto löschen</h3>
        <p className="text-xs text-muted-foreground">Das Konto <span className="text-foreground font-medium">{user.displayName || user.username}</span> und seine eigenen Menü-Einstellungen werden gelöscht. Meldet sich die Person später wieder mit Windows an, startet sie als „Benutzer“ mit dem Standard.</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onZu} className={knopfLeise}>Abbrechen</button>
          <button onClick={() => void loeschen()} disabled={laeuft} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50" data-loeschen-bestaetigen>
            {laeuft ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}Löschen
          </button>
        </div>
      </div>
    </div>
  )
}
