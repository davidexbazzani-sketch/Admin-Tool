// ── Automatik & Scans (Einstellungen „Für alle“) ─────────────────────────────
// Ordnung (Nutzerwunsch 19.11.2026): Kopf mit Automatik-PC und Dienst-Prüfung, Wochenplan,
// dann alle Scans nach Themen — ganz oben die Prüfungen aus dem Menüpunkt „Server“, auch die
// dauernd laufenden (Ping, Neustart-Erkennung, Rundlauf), die vorher fest im Code standen.
// Alles läuft weiter NUR auf dem EINEN Automatik-PC (darfAutomatik). Bewusst NICHT
// automatisierbar: Health Check (DISM + SFC), HCI-Fragebogen, Komplett-Diagnose.
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Loader, RefreshCw, CheckCircle, XCircle, Cpu, ChevronDown, ChevronRight, Hand, ExternalLink, Server, CalendarDays, Activity, Power, Repeat } from 'lucide-react'
import { useAuthStore } from '../../../store/authStore'
import { useAppStore } from '../../../store/appStore'
import { useScanStore } from '../../../store/scanStore'
import { SCAN_REGISTRY, SCAN_GRUPPEN, type ScanStatus, type ScanDef } from '../../../services/scanRegistry'
import {
  loadScanSchedules, saveScanSchedules, describeSchedule, isConfiguredDue, naechsterSlot,
  WEEKDAY_LABELS, SCAN_SCHEDULE_DEFAULTS, type ScanScheduleConfig,
} from '../../../services/scanSchedules'
import { ladeServerLaeufe, speichereServerLaeufe, PING_TAKTE, RUNDLAUF_PAUSEN, SERVER_LAEUFE_STANDARD, type ServerLaeufe } from '../../../services/serverLaeufe'
import { ladeLeiter, leiterText, type Leiter } from '../../../services/automatikLeiter'
import { ladeRundlauf, rundlaufText, type RundlaufStand } from '../../../services/serverRundlauf'
import { WEEKEND_CHECK_ID } from '../../../services/weekendCheck'
import { protokolliere } from '../../../services/aktivitaet'
import type { Screen } from '../../../types'
import { Abschnitt, Hinweis, Schalter, datumZeit } from '../../teile'

const AutomatikPcKarte = lazy(() => import('../../../components/settings/AutomatikPcKarte'))
const MailPcKarte = lazy(() => import('../../../components/settings/MailPcKarte'))

const TAGE = [1, 2, 3, 4, 5, 6, 0]                // Mo … So (Index = Date.getDay())
const KURZ: Record<string, string> = {
  'pc-fehler': 'PC-Fehler', 'pc-verlauf': 'Änderungsverlauf', 'software-inventory': 'Software', 'printer-connections': 'Drucker-Verbindungen',
  'printer-ip': 'Drucker-IP', 'device-scan': 'Geräte-Scan', 'proactive-radar': 'AD-Hygiene', 'vlan-scan': 'VLAN', 'server-metrics': 'Server-Auslastung',
  'server-certs': 'Zertifikate', 'lost-devices': 'Verlorene Geräte', 'nis2-access': 'NIS2-Zugänge', 'network-drives': 'Netzlaufwerke',
  'europar-scan': 'EuroPAR', 'weekend-check': 'Wochenend-Check',
}
const wochentagZeit = (d: Date) => {
  const heute = new Date(); const morgen = new Date(); morgen.setDate(heute.getDate() + 1)
  const tag = d.toDateString() === heute.toDateString() ? 'heute' : d.toDateString() === morgen.toDateString() ? 'morgen' : WEEKDAY_LABELS[d.getDay()]
  return `${tag} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Hintergrund-Abläufe mit eigenem Zeitplan im jeweiligen Bereich (nur Info). */
const WEITERE: { titel: string; wann: string; screen?: Screen }[] = [
  { titel: 'Back-Ups', wann: 'Zeitplan je Sicherungsauftrag, Ergebnisse stündlich einsammeln', screen: 'backups' },
  { titel: 'Geplante Aufgaben', wann: 'Zeitplan je Aufgabe', screen: 'scheduled-tasks' },
  { titel: 'Treiber-Rollout', wann: 'Zeitplan je Rollout', screen: 'treiber-installation' },
  { titel: 'PC-Überwachung über Zeit', wann: 'Takt je Überwachung (2–60 min)', screen: 'pc-diagnosis' },
  { titel: 'Komplett-Einrichtung neuer PCs', wann: 'stündlich nachsehen', screen: 'device-setup' },
  { titel: 'Windows-Updates (PCs in Einrichtung)', wann: 'alle 30 min, je PC höchstens alle 8 h', screen: 'device-setup' },
  { titel: 'Netzlaufwerk-Umzug und EuroPAR-Kopie', wann: 'alle 5 min, nur bei offener Geräte-Einrichtung', screen: 'device-setup' },
  { titel: 'Toner-Prüfung', wann: 'vor 07:00 und ab 16:00, höchstens alle 3 h', screen: 'drucker' },
  { titel: 'Lizenz-Erinnerungen (Mails)', wann: 'alle 5 min nachsehen', screen: 'licenses' },
  { titel: 'Austritts-Erinnerungen (Mails)', wann: 'alle 20 min nachsehen', screen: 'employee-management' },
  { titel: 'PC-Fehler-Warteliste (ausgeschaltete PCs)', wann: 'höchstens alle 2 h', screen: 'proactive-radar' },
  { titel: 'Kostenverlauf der Endgeräte', wann: 'ein Messpunkt je Kalenderwoche', screen: 'endpoint-devices' },
  { titel: 'AD-Benutzerverzeichnis', wann: 'einmal täglich', screen: 'user-overview' },
]

// ── Zeile eines Scans mit Zeitplan ───────────────────────────────────────────
function ScanZeile({ def, cfg, st, onPatch, markiert }: { def: ScanDef; cfg: ScanScheduleConfig; st: ScanStatus | null | undefined; onPatch: (p: Partial<ScanScheduleConfig>) => void; markiert: boolean }) {
  const username = useAuthStore(s => s.session?.user?.username) || ''
  const laeuft = useScanStore(s => !!s.running[def.id])
  const res = useScanStore(s => s.results[def.id])
  const start = useScanStore(s => s.start)
  const [mehr, setMehr] = useState(false)
  const jetzt = new Date()
  const faellig = cfg.enabled && def.id !== WEEKEND_CHECK_ID && isConfiguredDue(cfg, st?.lastRunAt)
  const naechst = cfg.enabled ? naechsterSlot(jetzt, cfg.days, cfg.time) : null
  const tagUm = (d: number) => onPatch({ days: cfg.days.includes(d) ? cfg.days.filter(x => x !== d) : [...cfg.days, d].sort((a, b) => a - b) })

  return (
    <div id={`scan-${def.id}`} data-scan-zeile={def.id}
      className={`rounded-lg border bg-background p-3 transition-colors ${markiert ? 'border-primary' : 'border-border'} ${cfg.enabled ? '' : 'opacity-75'}`}>
      <div className="flex items-start gap-3">
        <div className="pt-0.5"><Schalter an={cfg.enabled} onChange={v => onPatch({ enabled: v })} label={cfg.enabled ? `${def.label}: an – klicken zum Ausschalten` : `${def.label}: aus – klicken zum Einschalten`} data={`scan:${def.id}`} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{def.label}</p>
          <p className={`text-xs text-muted-foreground mt-0.5 ${mehr ? '' : 'line-clamp-2'}`}>{def.description}</p>
          {def.description.length > 160 && <button onClick={() => setMehr(v => !v)} className="text-[11px] text-primary hover:underline">{mehr ? 'weniger' : 'mehr'}</button>}
        </div>
        <div className="shrink-0 text-right space-y-1 min-w-[170px]">
          <p className="text-[11px] text-muted-foreground">Nächster Lauf: <span className="text-foreground font-medium" data-scan-naechst>{!cfg.enabled ? 'aus' : faellig ? 'fällig – beim nächsten Durchgang' : naechst ? wochentagZeit(naechst) : 'kein Tag gewählt'}</span></p>
          <p className="text-[11px] text-muted-foreground">Zuletzt: <span className="text-foreground">{datumZeit(st?.lastRunAt)}</span>
            {st?.lastResult && <span className={st.lastResult === 'success' ? 'es-ok' : 'es-fehler'}> · {st.lastResult === 'success' ? 'OK' : 'Fehler'}</span>}</p>
          <button onClick={() => start(def, username)} disabled={laeuft} data-scan-jetzt={def.id}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50">
            {laeuft ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}Jetzt ausführen
          </button>
        </div>
      </div>
      {(st?.lastSummary || st?.runningElsewhere || laeuft || res) && (
        <div className="mt-2 text-[11px] space-y-0.5 pl-[46px]">
          {st?.lastSummary && <p className="text-muted-foreground truncate" title={st.lastSummary}>Ergebnis: {st.lastSummary}</p>}
          {st?.runningElsewhere && !laeuft && <p className="es-warn inline-flex items-center gap-1"><Loader size={10} className="animate-spin" />Läuft gerade im Hintergrund (Automatik-PC oder ein anderes Fenster) …</p>}
          {laeuft && <p className="es-info inline-flex items-center gap-1"><Loader size={10} className="animate-spin" />Läuft im Hintergrund – du kannst weiterarbeiten.</p>}
          {!laeuft && res && <p className={`inline-flex items-center gap-1 ${res.ok ? 'es-ok' : 'es-fehler'}`}>{res.ok ? <CheckCircle size={10} /> : <XCircle size={10} />}{res.ok ? 'Fertig' : 'Fehler'}: {res.summary}</p>}
        </div>
      )}
      <div className={`flex items-center gap-1.5 flex-wrap mt-2.5 pt-2.5 border-t border-border pl-[46px] ${cfg.enabled ? '' : 'opacity-50'}`}>
        {TAGE.map(d => (
          <button key={d} onClick={() => tagUm(d)} disabled={!cfg.enabled} data-scan-tag={`${def.id}:${d}`} aria-pressed={cfg.days.includes(d)}
            className={`w-8 h-7 text-[11px] rounded-md border transition-colors disabled:cursor-not-allowed ${cfg.days.includes(d) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            {WEEKDAY_LABELS[d]}
          </button>
        ))}
        <span className="text-[11px] text-muted-foreground ml-1">um</span>
        <input type="time" value={cfg.time} disabled={!cfg.enabled} data-scan-zeit={def.id} onChange={e => e.target.value && onPatch({ time: e.target.value })}
          className="px-2 py-1 text-xs rounded-md border border-border bg-background text-foreground focus:border-primary" />
        <span className="text-[11px] text-muted-foreground ml-auto">{describeSchedule(cfg)}</span>
      </div>
    </div>
  )
}

// ── Dauernd laufende Server-Prüfungen ────────────────────────────────────────
function ServerLaeufeZeilen({ laeufe, onAendern }: { laeufe: ServerLaeufe; onAendern: (v: ServerLaeufe, was: string) => void }) {
  const zeile = (icon: React.ReactNode, titel: string, text: string, an: boolean, schalten: (v: boolean) => void, data: string, extra?: React.ReactNode, warnung?: string) => (
    <div className={`rounded-lg border border-border bg-background p-3 ${an ? '' : 'opacity-80'}`} data-server-lauf={data}>
      <div className="flex items-start gap-3">
        <div className="pt-0.5"><Schalter an={an} onChange={schalten} label={`${titel}: ${an ? 'an' : 'aus'}`} data={`server:${data}`} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">{icon}{titel}<span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">dauernd</span></p>
          <p className="text-xs text-muted-foreground mt-0.5">{text}</p>
          {!an && warnung && <p className="text-[11px] es-warn mt-1">{warnung}</p>}
        </div>
        {extra && <div className="shrink-0">{extra}</div>}
      </div>
    </div>
  )
  const auswahl = (wert: number, werte: readonly number[], einheit: string, setze: (n: number) => void, an: boolean, data: string) => (
    <label className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">{einheit === 'min' ? 'alle' : 'Pause'}
      <select value={wert} disabled={!an} onChange={e => setze(Number(e.target.value))} data-server-takt={data}
        className="px-2 py-1 text-xs rounded-md border border-border bg-background text-foreground disabled:opacity-50">
        {werte.map(w => <option key={w} value={w}>{w} {einheit}{w === werte[0] ? ' (Standard)' : ''}</option>)}
      </select>
    </label>
  )
  return (
    <div className="space-y-2.5">
      {zeile(<Activity size={14} className="text-muted-foreground" />, 'Erreichbarkeit (Ping)',
        'Pingt alle Server-Kacheln je 3× an, auch die Cluster-Knoten (diese NUR per Ping). Grundlage für „Server offline“, „wieder da“ und die Mails dazu.',
        laeufe.ping.an, v => onAendern({ ...laeufe, ping: { ...laeufe.ping, an: v } }, `Ping ${v ? 'eingeschaltet' : 'ausgeschaltet'}`), 'ping',
        auswahl(laeufe.ping.minuten, PING_TAKTE, 'min', n => onAendern({ ...laeufe, ping: { ...laeufe.ping, minuten: n } }, `Ping-Takt ${n} min`), laeufe.ping.an, 'ping'),
        'Aus: keine Offline-Meldungen und keine Mails mehr. Die Kacheln zeigen den letzten Stand.')}
      {zeile(<Power size={14} className="text-muted-foreground" />, 'Neustart-Erkennung',
        'Liest nach jedem Ping-Lauf die Startzeit eines Servers (immer nur einen) und meldet Neustarts und Herunterfahren – Popup, Windows-Hinweis, Mail laut Kachel.',
        laeufe.neustart.an, v => onAendern({ ...laeufe, neustart: { an: v } }, `Neustart-Erkennung ${v ? 'eingeschaltet' : 'ausgeschaltet'}`), 'neustart', undefined,
        'Aus: Neustarts werden nicht mehr gemeldet.')}
      {zeile(<Repeat size={14} className="text-muted-foreground" />, 'Dienste & Prüfungen (Rundlauf)',
        'Prüft Dienste und Einstellungen laut Soll („Einrichten“ im Server-Fenster): immer nur EIN Server, Reihenfolge wie die Kacheln, nur lesend. Cluster-Knoten sind ausgenommen.',
        laeufe.rundlauf.an, v => onAendern({ ...laeufe, rundlauf: { ...laeufe.rundlauf, an: v } }, `Rundlauf ${v ? 'eingeschaltet' : 'ausgeschaltet'}`), 'rundlauf',
        auswahl(laeufe.rundlauf.pauseSek, RUNDLAUF_PAUSEN, 's', n => onAendern({ ...laeufe, rundlauf: { ...laeufe.rundlauf, pauseSek: n } }, `Rundlauf-Pause ${n} s`), laeufe.rundlauf.an, 'rundlauf'),
        'Aus: keine Prüfungen von Diensten und Einstellungen und keine Meldungen dazu.')}
    </div>
  )
}

// ── Wochenplan ───────────────────────────────────────────────────────────────
function Wochenplan({ schedules, laeufe, onSprung }: { schedules: Record<string, ScanScheduleConfig>; laeufe: ServerLaeufe; onSprung: (id: string) => void }) {
  const aktiv = SCAN_REGISTRY.map(d => ({ d, c: schedules[d.id] })).filter(x => x.c?.enabled && x.c.days.length)
  const taeglich = aktiv.filter(x => x.c.days.length === 7).sort((a, b) => a.c.time.localeCompare(b.c.time))
  const rest = aktiv.filter(x => x.c.days.length < 7)
  const heute = new Date().getDay()
  const chip = (x: { d: ScanDef; c: ScanScheduleConfig }) => (
    <button key={x.d.id} className="es-chip" onClick={() => onSprung(x.d.id)} title={x.d.label} data-plan-chip={x.d.id}>
      <span className="tabular-nums text-muted-foreground shrink-0">{x.c.time}</span><span className="es-chip-text">{KURZ[x.d.id] || x.d.label}</span>
    </button>
  )
  const dauernd = [laeufe.ping.an && `Ping alle ${laeufe.ping.minuten} min`, laeufe.neustart.an && 'Neustart-Erkennung', laeufe.rundlauf.an && `Dienste-Rundlauf (${laeufe.rundlauf.pauseSek} s Pause)`].filter(Boolean)
  return (
    <Abschnitt titel="Wochenplan" untertitel="Wann welcher Scan läuft. Ein Klick springt zur Einstellung.">
      <div className="space-y-2 text-xs">
        <div className="flex items-start gap-2 flex-wrap"><span className="w-20 shrink-0 text-muted-foreground pt-0.5">Dauernd</span>
          <div className="flex flex-wrap gap-1.5">{dauernd.length ? dauernd.map(t => <span key={String(t)} className="es-chip">{t}</span>) : <span className="text-muted-foreground">nichts – alle Server-Prüfungen aus</span>}</div></div>
        <div className="flex items-start gap-2 flex-wrap"><span className="w-20 shrink-0 text-muted-foreground pt-0.5">Täglich</span>
          <div className="flex flex-wrap gap-1.5">{taeglich.length ? taeglich.map(chip) : <span className="text-muted-foreground">–</span>}</div></div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-xs">
        {TAGE.map(t => {
          const anTag = rest.filter(x => x.c.days.includes(t)).sort((a, b) => a.c.time.localeCompare(b.c.time))
          return (
            <div key={t} className={`rounded-lg border p-1.5 min-h-[72px] min-w-0 space-y-1 ${t === heute ? 'border-primary/60 bg-primary/5' : 'border-border'}`} data-plan-tag={t}>
              <p className={`text-[11px] font-semibold ${t === heute ? 'text-primary' : 'text-muted-foreground'}`}>{WEEKDAY_LABELS[t]}{t === heute ? ' · heute' : ''}</p>
              <div className="flex flex-col items-start gap-1">{anTag.map(chip)}</div>
            </div>
          )
        })}
      </div>
    </Abschnitt>
  )
}

// ── Ansicht ──────────────────────────────────────────────────────────────────
export default function AutomatikScans() {
  const von = useAuthStore(s => s.session?.user?.displayName || s.session?.user?.username) || 'unbekannt'
  const setScreen = useAppStore(s => s.setScreen)
  const results = useScanStore(s => s.results)
  const [schedules, setSchedules] = useState<Record<string, ScanScheduleConfig> | null>(null)
  const [statuses, setStatuses] = useState<Record<string, ScanStatus | null>>({})
  const [laeufe, setLaeufe] = useState<ServerLaeufe>(SERVER_LAEUFE_STANDARD)
  const [leiter, setLeiter] = useState<Leiter | null>(null)
  const [rundlauf, setRundlauf] = useState<RundlaufStand | null>(null)
  const [pcOffen, setPcOffen] = useState(false)
  const [mailOffen, setMailOffen] = useState(false)
  const [filter, setFilter] = useState<'alle' | 'an' | 'aus'>('alle')
  const [markiert, setMarkiert] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let weg = false
    void loadScanSchedules().then(s => { if (!weg) setSchedules(s) })
    void ladeServerLaeufe(true).then(l => { if (!weg) setLaeufe(l) })
    const kopf = () => { void Promise.all([ladeLeiter(), ladeRundlauf()]).then(([l, r]) => { if (!weg) { setLeiter(l); setRundlauf(r) } }).catch(() => {}) }
    kopf()
    const t = setInterval(kopf, 60_000)
    return () => { weg = true; clearInterval(t) }
  }, [])

  // letzter Lauf je Scan — nacheinander laden (Netzlaufwerk schonen), nach jedem Lauf neu
  useEffect(() => {
    let weg = false
    void (async () => { for (const def of SCAN_REGISTRY) { const st = await def.loadStatus().catch(() => null); if (!weg) setStatuses(p => ({ ...p, [def.id]: st })) } })()
    return () => { weg = true }
  }, [results])

  const zeigeMeldung = (ok: boolean, text: string) => { setMeldung({ ok, text }); setTimeout(() => setMeldung(null), 2500) }

  const patch = useCallback((id: string, p: Partial<ScanScheduleConfig>) => {
    setSchedules(prev => {
      if (!prev) return prev
      const base = prev[id] ?? SCAN_SCHEDULE_DEFAULTS[id]
      const neu = { ...prev, [id]: { ...base, ...p } }
      void saveScanSchedules(neu).then(ok => zeigeMeldung(ok, ok ? 'Gespeichert' : 'Speichern fehlgeschlagen'))
      if (p.enabled !== undefined) {
        const def = SCAN_REGISTRY.find(d => d.id === id)
        protokolliere({ art: 'manuell', quelle: 'Einstellungen', aktion: `Scan ${p.enabled ? 'eingeschaltet' : 'ausgeschaltet'}: ${def?.label || id}` })
      }
      return neu
    })
  }, [])

  async function laeufeAendern(v: ServerLaeufe, was: string) {
    setLaeufe(v)
    const ok = await speichereServerLaeufe(v)
    zeigeMeldung(ok, ok ? 'Gespeichert – wirkt auf dem Automatik-PC innerhalb einer Minute' : 'Speichern fehlgeschlagen')
    if (ok) protokolliere({ art: 'manuell', quelle: 'Einstellungen', aktion: `Server-Prüfung: ${was}` })
  }

  const springe = (id: string) => {
    setFilter('alle'); setMarkiert(id)
    requestAnimationFrame(() => document.getElementById(`scan-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    setTimeout(() => setMarkiert(m => (m === id ? null : m)), 2500)
  }

  const lt = leiterText(leiter)
  const rt = rundlaufText(rundlauf, Date.now(), laeufe)
  const anzahlAn = schedules ? SCAN_REGISTRY.filter(d => schedules[d.id]?.enabled).length : 0
  const passt = (d: ScanDef) => filter === 'alle' || (filter === 'an') === !!schedules?.[d.id]?.enabled
  const gruppen = useMemo(() => SCAN_GRUPPEN.map(g => ({ ...g, defs: SCAN_REGISTRY.filter(d => d.gruppe === g.id) })), [])

  if (!schedules) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader size={16} className="animate-spin" />Zeitpläne werden geladen …</div>

  return (
    <div className="space-y-4" data-automatik-scans>
      {/* Kopf */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span title={lt.titel} data-kopf-leiter className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${lt.aktiv && lt.bevorzugt ? 'es-box-ok' : lt.aktiv ? 'es-box-warn' : 'es-box-fehler'}`}>
            <Cpu size={13} />{lt.text}
          </span>
          <span title={rt.titel} data-kopf-rundlauf className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${rt.aktiv ? 'border-border bg-muted/40 text-foreground' : 'border-dashed border-border text-muted-foreground'}`}>
            <Server size={13} />{rt.text}
          </span>
          {meldung && <span className={`text-xs inline-flex items-center gap-1 ${meldung.ok ? 'es-ok' : 'es-fehler'}`} data-automatik-meldung>{meldung.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}{meldung.text}</span>}
        </div>
        <p className="text-xs text-muted-foreground">Alle Scans und Server-Prüfungen laufen nur auf diesem EINEN Automatik-PC – nie auf mehreren gleichzeitig. Änderungen gelten für alle.</p>
        <button onClick={() => setPcOffen(v => !v)} className="inline-flex items-center gap-1.5 text-xs text-foreground hover:text-primary" data-automatik-pc-oeffnen>
          {pcOffen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}Automatik-PC festlegen oder ändern
        </button>
        {pcOffen && <Suspense fallback={<Loader size={14} className="animate-spin" />}><AutomatikPcKarte entsperrt mitPin={a => a()} von={von} /></Suspense>}
        <button onClick={() => setMailOffen(v => !v)} className="flex items-center gap-1.5 text-xs text-foreground hover:text-primary" data-mailpc-oeffnen>
          {mailOffen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}Mail-PCs: über welche PCs automatische Mails rausgehen
        </button>
        {mailOffen && <Suspense fallback={<Loader size={14} className="animate-spin" />}><MailPcKarte entsperrt von={von} /></Suspense>}
      </section>

      <Wochenplan schedules={schedules} laeufe={laeufe} onSprung={springe} />

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <CalendarDays size={14} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{anzahlAn} von {SCAN_REGISTRY.length} Scans an</span>
        <div className="ml-auto inline-flex rounded-md border border-border overflow-hidden">
          {(['alle', 'an', 'aus'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} data-scan-filter={f}
              className={`px-3 py-1 text-xs ${filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>{f === 'alle' ? 'Alle' : f === 'an' ? 'Nur an' : 'Nur aus'}</button>
          ))}
        </div>
      </div>

      {gruppen.map(g => {
        const defs = g.defs.filter(passt)
        if (g.id !== 'server' && !defs.length) return null
        return (
          <Abschnitt key={g.id} titel={g.titel} untertitel={g.text} id={`gruppe-${g.id}`}>
            {g.id === 'server' && <ServerLaeufeZeilen laeufe={laeufe} onAendern={(v, was) => void laeufeAendern(v, was)} />}
            <div className="space-y-2.5">
              {defs.map(d => <ScanZeile key={d.id} def={d} cfg={schedules[d.id] ?? SCAN_SCHEDULE_DEFAULTS[d.id]} st={statuses[d.id]} onPatch={p => patch(d.id, p)} markiert={markiert === d.id} />)}
            </div>
            {g.id === 'server' && (
              <div className="rounded-lg border border-dashed border-border p-3 space-y-1.5" data-nur-von-hand>
                <p className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5"><Hand size={13} className="text-muted-foreground" />Nur von Hand – bewusst ohne Zeitplan</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-5">
                  <li><span className="text-foreground">Health Check</span> (DISM ScanHealth + sfc /verifyonly): immer nur ein Server zur Zeit, nur Prüfung</li>
                  <li><span className="text-foreground">HCI-Fragebogen</span>: je Server einzeln, nie als Sammel-Lauf</li>
                  <li><span className="text-foreground">Komplett-Diagnose</span>: liest nur, Eingriffe erst nach Bestätigung</li>
                </ul>
                <p className="text-[11px] text-muted-foreground">Die Cluster-Knoten (W3135–W3138, W3153) werden nur angepingt – keine anderen Abfragen.</p>
                <button onClick={() => setScreen('server')} className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink size={12} />Zum Server-Bildschirm</button>
              </div>
            )}
          </Abschnitt>
        )
      })}

      <Abschnitt titel="Weitere Hintergrund-Abläufe" untertitel="Laufen ebenfalls nur auf dem Automatik-PC. Ihr Zeitplan wird im jeweiligen Bereich eingestellt.">
        <div className="divide-y divide-border">
          {WEITERE.map(w => (
            <div key={w.titel} className="flex items-center gap-3 py-2 text-xs">
              <span className="flex-1 text-foreground">{w.titel}</span>
              <span className="text-muted-foreground">{w.wann}</span>
              {w.screen && <button onClick={() => setScreen(w.screen!)} className="inline-flex items-center gap-1 text-primary hover:underline shrink-0"><ExternalLink size={12} />Öffnen</button>}
            </div>
          ))}
        </div>
      </Abschnitt>

      <Hinweis>„Jetzt ausführen“ startet einen Scan sofort auf DIESEM PC und läuft im Hintergrund weiter. Die Zeitpläne laufen trotzdem nur auf dem Automatik-PC.</Hinweis>
    </div>
  )
}
