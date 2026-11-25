// ── Einstellungen: Übersicht in zwei Gruppen ────────────────────────────────
//   · Persönlich – gilt nur für dich (ohne Passwort)
//   · Für alle – nur mit Passwort (Prüfung im Main-Prozess, siehe zugang.ts)
// Ein Klick auf eine Kachel öffnet die Detailansicht (← Übersicht). Die großen Detailansichten
// werden erst beim Öffnen geladen. Neu sortiert am 19.11.2026 (vorher eine lange Seite).
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Settings as SettingsIcon, Palette, Mail, FolderOutput, ListTree, Info, Users, Radar, Network, ScrollText, BookOpen,
  Lock, Unlock, ChevronRight, ArrowLeft, KeyRound, Loader, ShieldAlert,
} from 'lucide-react'
import './einstellungen.css'
import { api } from '../electronAPI'
import { useAppStore } from '../store/appStore'
import { useAuthStore } from '../store/authStore'
import { useMenuSichtbar } from '../store/menuSichtbarStore'
import { MENU_CATALOG } from '../utils/menuCatalog'
import { rolleReicht, type Rolle } from '../utils/sichtbarkeit'
import { useZugang, istOffen, pruefePasswort, FREIGABE_MS } from './zugang'
import { Darstellung, EMail, Export, MenueHinweise, Ueber, ladeEmail } from './Persoenlich'

const BenutzerRechte = lazy(() => import('./alle/benutzer/BenutzerRechte'))
const AutomatikScans = lazy(() => import('./alle/automatik/AutomatikScans'))
const NetzwerkPfade = lazy(() => import('./alle/NetzwerkPfade'))
const Werkzeuge = lazy(() => import('./alle/Werkzeuge'))
const WissenSicherung = lazy(() => import('./alle/WissenSicherung'))
const AppLockCard = lazy(() => import('../components/AppLockCard'))

export type KachelId = 'darstellung' | 'email' | 'export' | 'menue' | 'ueber' | 'benutzer' | 'automatik' | 'netzwerk' | 'werkzeuge' | 'wissen' | 'sperre'

interface KachelDef { id: KachelId; titel: string; text: string; icon: ReactNode; gruppe: 'ich' | 'alle'; nurGruender?: boolean }

const KACHELN: KachelDef[] = [
  { id: 'darstellung', gruppe: 'ich', titel: 'Darstellung', text: 'Hell oder dunkel', icon: <Palette size={20} /> },
  { id: 'email', gruppe: 'ich', titel: 'E-Mail', text: 'Absender und Versandart deiner Mails', icon: <Mail size={20} /> },
  { id: 'export', gruppe: 'ich', titel: 'Export', text: 'Standardordner für Berichte', icon: <FolderOutput size={20} /> },
  { id: 'menue', gruppe: 'ich', titel: 'Menü & Hinweise', text: 'Reihenfolge der Seitenleiste, Server-Mitteilungen', icon: <ListTree size={20} /> },
  { id: 'ueber', gruppe: 'ich', titel: 'Über das Programm', text: 'Version und Technik', icon: <Info size={20} /> },
  { id: 'benutzer', gruppe: 'alle', titel: 'Benutzer & Rechte', text: 'Rollen, Menüpunkte und Bereiche je Benutzer – auch vorab per Corp ID', icon: <Users size={20} /> },
  { id: 'automatik', gruppe: 'alle', titel: 'Automatik & Scans', text: 'Automatik-PC, Zeitpläne, Server-Prüfungen', icon: <Radar size={20} /> },
  { id: 'netzwerk', gruppe: 'alle', titel: 'Netzwerk & Pfade', text: 'Hauptordner, zentrale Pfade, Wissensdatenbank, PsExec', icon: <Network size={20} /> },
  { id: 'werkzeuge', gruppe: 'alle', titel: 'Protokolle & Werkzeuge', text: 'Aktivitätsprotokoll, Befehls-Test, Berechtigungs-Abzug', icon: <ScrollText size={20} /> },
  { id: 'wissen', gruppe: 'alle', titel: 'Wissen & Sicherung', text: 'Wissensdatenbank-Import, Backup-Snapshot', icon: <BookOpen size={20} /> },
  { id: 'sperre', gruppe: 'alle', titel: 'Programm-Sperre', text: 'Tool für alle anderen sperren', icon: <ShieldAlert size={20} />, nurGruender: true },
]

const Laden = () => <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader size={16} className="animate-spin" />Wird geladen …</div>

// ── Passwort-Leiste ──────────────────────────────────────────────────────────
function Freigabe({ wunschTitel, eingabeRef }: { wunschTitel?: string; eingabeRef: React.RefObject<HTMLInputElement> }) {
  const offenBis = useZugang(s => s.offenBis)
  const sperre = useZugang(s => s.sperre)
  const [pw, setPw] = useState('')
  const [pruefe, setPruefe] = useState(false)
  const [fehler, setFehler] = useState('')
  const [jetzt, setJetzt] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setJetzt(Date.now()), 15_000); return () => clearInterval(t) }, [])
  const offen = istOffen(offenBis, jetzt)

  async function senden() {
    if (!pw || pruefe) return
    setPruefe(true); setFehler('')
    const r = await pruefePasswort(pw)
    setPruefe(false); setPw('')
    if (!r.ok) setFehler(r.text)
  }

  if (offen) {
    const min = Math.max(1, Math.ceil((offenBis - jetzt) / 60_000))
    return (
      <div className="es-box-ok rounded-xl px-4 py-2.5 flex items-center gap-3 flex-wrap" data-freigabe="offen">
        <Unlock size={16} className="es-ok shrink-0" />
        <span className="text-sm text-foreground font-medium">Entsperrt</span>
        <span className="text-xs text-muted-foreground">Gilt noch {min} Minute{min === 1 ? '' : 'n'} oder bis du die Einstellungen verlässt.</span>
        <button onClick={sperre} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent" data-freigabe-sperren><Lock size={13} />Sperren</button>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2" data-freigabe="zu">
      <div className="flex items-center gap-3 flex-wrap">
        <Lock size={16} className="es-gold shrink-0" />
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm text-foreground font-medium">{wunschTitel ? `Für „${wunschTitel}“ bitte das Passwort eingeben` : 'Diese Einstellungen gelten für alle – nur mit Passwort'}</p>
          <p className="text-xs text-muted-foreground">Nach dem Entsperren bleibt der Bereich {FREIGABE_MS / 60_000} Minuten offen.</p>
        </div>
        <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); void senden() }}>
          <div className="relative">
            <KeyRound size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input ref={eingabeRef} type="password" value={pw} onChange={e => { setPw(e.target.value); setFehler('') }} placeholder="Passwort" autoComplete="off"
              aria-label="Passwort für die Einstellungen für alle" data-freigabe-passwort
              className={`w-52 pl-8 pr-3 py-1.5 text-sm rounded-md border bg-background text-foreground focus:outline-none ${fehler ? 'border-[var(--es-fehler)]' : 'border-border focus:border-primary'}`} />
          </div>
          <button type="submit" disabled={!pw || pruefe} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50" data-freigabe-los>
            {pruefe ? <Loader size={13} className="animate-spin" /> : <Unlock size={13} />}Entsperren
          </button>
        </form>
      </div>
      {fehler && <p className="text-xs es-fehler" role="alert" data-freigabe-fehler>{fehler}</p>}
    </div>
  )
}

// ── Kachel ───────────────────────────────────────────────────────────────────
function Kachel({ k, status, gesperrt, onOeffnen }: { k: KachelDef; status?: string; gesperrt: boolean; onOeffnen: () => void }) {
  return (
    <button className="es-kachel" onClick={onOeffnen} data-kachel={k.id} data-kachel-gesperrt={gesperrt ? '1' : undefined}
      title={gesperrt ? 'Erst oben das Passwort eingeben' : undefined}>
      <div className="flex items-start gap-3">
        <span className={`es-symbol ${k.gruppe === 'alle' ? 'es-symbol-alle' : ''}`}>{k.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{k.titel}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{k.text}</p>
        </div>
        {gesperrt ? <Lock size={14} className="text-muted-foreground shrink-0 mt-1" /> : <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-1" />}
      </div>
      <p className="mt-auto text-xs text-foreground/80 truncate min-h-[16px]" data-kachel-status>{gesperrt ? '' : status || ''}</p>
    </button>
  )
}

// ── Statuszeilen ─────────────────────────────────────────────────────────────
async function ladeStatusAlle(): Promise<Partial<Record<KachelId, string>>> {
  const [users, scans, laeufe, basis, sperre] = await Promise.all([
    api().authGetUsers().catch(() => [] as Awaited<ReturnType<ReturnType<typeof api>['authGetUsers']>>),
    import('../services/scanSchedules').then(m => m.loadScanSchedules()).catch(() => null),
    import('../services/serverLaeufe').then(m => m.ladeServerLaeufe(true)).catch(() => null),
    api().netGetBasePath().catch(() => ''),
    import('../services/appLock').then(m => m.loadAppLock()).catch(() => null),
  ])
  const vorgemerkt = users.filter(u => !u.lastLogin && u.windowsUsername).length
  const an = scans ? Object.values(scans).filter(s => s.enabled).length : 0
  const serverAus = laeufe ? [!laeufe.ping.an && 'Ping', !laeufe.neustart.an && 'Neustart', !laeufe.rundlauf.an && 'Rundlauf'].filter(Boolean) : []
  return {
    benutzer: users.length ? `${users.length} ${users.length === 1 ? 'Konto' : 'Konten'}${vorgemerkt ? ` · ${vorgemerkt} vorgemerkt` : ''}` : '',
    automatik: scans ? `${an} von ${Object.keys(scans).length} Scans an${serverAus.length ? ` · Server: ${serverAus.join(', ')} aus` : ' · Server-Prüfungen an'}` : '',
    netzwerk: basis ? `…\\${basis.split(/[\\/]/).filter(Boolean).slice(-2).join('\\')}` : '',
    werkzeuge: '3 Werkzeuge',
    wissen: 'Import und Snapshot',
    sperre: sperre ? (sperre.locked ? 'Gesperrt – nur du kommst hinein' : 'Nicht gesperrt') : '',
  }
}

// ── Seite ────────────────────────────────────────────────────────────────────
export default function Einstellungen({ startKachel }: { startKachel?: KachelId }) {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const gruender = !!user?.isFounder || ['davidxe', 'bq8069'].includes(username.toLowerCase())
  const settings = useAppStore(s => s.settings)
  const sichtbar = useMenuSichtbar(s => s.sichtbar)
  const offenBis = useZugang(s => s.offenBis)
  const [jetzt, setJetzt] = useState(Date.now())
  const entsperrt = istOffen(offenBis, jetzt)
  const [offen, setOffen] = useState<KachelId | null>(null)
  const [wunsch, setWunsch] = useState<KachelId | null>(startKachel ?? null)
  const [version, setVersion] = useState('')
  const [emailStatus, setEmailStatus] = useState('')
  const [statusAlle, setStatusAlle] = useState<Partial<Record<KachelId, string>>>({})
  const eingabeRef = useRef<HTMLInputElement>(null)

  // Ablauf der Freigabe mitbekommen; beim Verlassen der Einstellungen wieder sperren
  useEffect(() => { const t = setInterval(() => setJetzt(Date.now()), 15_000); return () => clearInterval(t) }, [])
  useEffect(() => { setJetzt(Date.now()) }, [offenBis])
  useEffect(() => () => useZugang.getState().sperre(), [])

  useEffect(() => {
    void api().getAppVersion().then(setVersion).catch(() => setVersion(''))
    void ladeEmail(username).then(c => setEmailStatus(c.email ? `${c.emailMethod === 'nodemailer' ? 'SMTP' : c.emailMethod === 'powershell' ? 'PowerShell' : 'Outlook'} · ${c.email}` : 'Noch keine Adresse eingetragen'))
  }, [username, offen])

  // Statuszeilen „Für alle“ erst nach dem Entsperren laden (vorher kein Netzlaufwerk-Zugriff)
  useEffect(() => {
    if (!entsperrt) { setStatusAlle({}); return }
    let weg = false
    void ladeStatusAlle().then(s => { if (!weg) setStatusAlle(s) })
    return () => { weg = true }
  }, [entsperrt, offen])

  // Gesperrt, während eine Kachel „für alle“ offen ist → zurück zur Übersicht
  const offenDef = KACHELN.find(k => k.id === offen)
  useEffect(() => { if (offenDef?.gruppe === 'alle' && !entsperrt) setOffen(null) }, [offenDef, entsperrt])
  // Gewünschte Kachel (z. B. alter Menüpunkt „Benutzerverwaltung“) nach dem Entsperren öffnen
  useEffect(() => {
    if (!wunsch) return
    const d = KACHELN.find(k => k.id === wunsch)
    if (!d) { setWunsch(null); return }
    if (d.gruppe === 'ich' || entsperrt) { setOffen(wunsch); setWunsch(null) }
  }, [wunsch, entsperrt])

  const rolle: Rolle = user?.role === 'master_admin' ? 'master_admin' : user?.role === 'admin' ? 'admin' : 'user'
  const ausgeblendet = useMemo(() => sichtbar ? MENU_CATALOG.filter(m => rolleReicht(m, rolle) && sichtbar[m.id] === false).length : 0, [sichtbar, rolle])
  const statusIch: Partial<Record<KachelId, string>> = {
    darstellung: settings.theme === 'light' ? 'Hell' : 'Dunkel',
    email: emailStatus,
    export: settings.exportPath ? settings.exportPath : 'Noch kein Ordner gewählt',
    menue: ausgeblendet ? `${ausgeblendet} Menüpunkt${ausgeblendet === 1 ? '' : 'e'} von der IT ausgeblendet` : 'Alles sichtbar, was deine Rolle erlaubt',
    ueber: version ? `Version ${version}` : '',
  }

  const oeffne = (k: KachelDef) => {
    if (k.gruppe === 'alle' && !entsperrt) { setWunsch(k.id); eingabeRef.current?.focus(); return }
    setOffen(k.id)
  }

  const kachelnAlle = KACHELN.filter(k => k.gruppe === 'alle' && (!k.nurGruender || gruender))

  // ── Detailansicht ──
  if (offenDef) {
    return (
      <div className="es-app flex flex-col h-full overflow-y-auto">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-6 py-3 flex items-center gap-3">
          <button onClick={() => setOffen(null)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent" data-zur-uebersicht>
            <ArrowLeft size={14} />Übersicht
          </button>
          <span className={`es-symbol ${offenDef.gruppe === 'alle' ? 'es-symbol-alle' : ''}`} style={{ width: 32, height: 32 }}>{offenDef.icon}</span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-foreground leading-tight">{offenDef.titel}</h1>
            <p className="text-[11px] text-muted-foreground">{offenDef.gruppe === 'alle' ? 'Für alle · mit Passwort' : 'Persönlich · gilt nur für dich'}</p>
          </div>
          {offenDef.gruppe === 'alle' && (
            <button onClick={() => useZugang.getState().sperre()} className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent"><Lock size={13} />Sperren</button>
          )}
        </div>
        <div className="p-6" data-kachel-offen={offenDef.id}>
          <Suspense fallback={<Laden />}>
            {offen === 'darstellung' && <Darstellung />}
            {offen === 'email' && <EMail />}
            {offen === 'export' && <Export />}
            {offen === 'menue' && <MenueHinweise />}
            {offen === 'ueber' && <Ueber version={version} />}
            {offen === 'benutzer' && <BenutzerRechte />}
            {offen === 'automatik' && <AutomatikScans />}
            {offen === 'netzwerk' && <NetzwerkPfade />}
            {offen === 'werkzeuge' && <Werkzeuge />}
            {offen === 'wissen' && <WissenSicherung />}
            {offen === 'sperre' && <AppLockCard />}
          </Suspense>
        </div>
      </div>
    )
  }

  // ── Übersicht ──
  const wunschDef = wunsch ? KACHELN.find(k => k.id === wunsch) : undefined
  return (
    <div className="es-app flex flex-col gap-6 h-full overflow-y-auto p-6" data-einstellungen>
      <div className="flex items-center gap-3">
        <span className="es-symbol"><SettingsIcon size={20} /></span>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Einstellungen</h1>
          <p className="text-sm text-muted-foreground">Oben, was nur dich betrifft – unten, was für alle gilt.</p>
        </div>
      </div>

      <section className="space-y-3" data-gruppe="ich">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Persönlich</h2>
          <p className="text-xs text-muted-foreground">Gilt nur für dich.</p>
        </div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
          {KACHELN.filter(k => k.gruppe === 'ich').map(k => <Kachel key={k.id} k={k} status={statusIch[k.id]} gesperrt={false} onOeffnen={() => oeffne(k)} />)}
        </div>
      </section>

      <section className="space-y-3" data-gruppe="alle">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Für alle</h2>
          <p className="text-xs text-muted-foreground">Gilt für jeden, der das Tool benutzt. Nur mit Passwort.</p>
        </div>
        <Freigabe wunschTitel={wunschDef?.gruppe === 'alle' ? wunschDef.titel : undefined} eingabeRef={eingabeRef} />
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
          {kachelnAlle.map(k => <Kachel key={k.id} k={k} status={statusAlle[k.id]} gesperrt={!entsperrt} onOeffnen={() => oeffne(k)} />)}
        </div>
      </section>
    </div>
  )
}
