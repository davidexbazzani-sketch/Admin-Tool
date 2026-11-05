// ── Kachel „IT Admin Tool" (Software Installationen) ─────────────────────────
// Neue Version des Tools auf andere PCs bringen. Das Setup liegt auf diesem PC unter C:\
// (oder eine gewählte Datei). Ablauf je PC: Desktop-Nachricht → Vorwarnzeit → Tool beenden
// → still installieren → prüfen → Desktop-Nachricht „Installation ist durch".
// Die Kachel ist nur mit Passwort erreichbar (SoftwareInstallations.tsx); die Arbeit läuft im
// itAdminToolInstallStore, damit ein Menüwechsel sie nicht abbricht.

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, FolderOpen, Laptop, Loader2, Lock, MessageSquare, Monitor, MonitorUp,
  RefreshCw, Search, Timer, UserSearch, Users, X,
} from 'lucide-react'
import Card from '../Card'
import UserPcSearch from '../UserPcSearch'
import { DeviceInfoButton } from '../device/DeviceDossier'
import InstallLogbuch from './InstallLogbuch'
import { api } from '../../electronAPI'
import { isValidRemoteTarget } from '../../utils/remoteTarget'
import { ladeNutzer, type ChatNutzer } from '../../services/chat'
import {
  findeToolSetup, gewaehlteSetupDatei, setzeSetupDatei, eigenerRechner, standVergleich, zeitText,
  ankuendigungsText, FERTIG_TEXT, SETUP_ORDNER_STANDARD, type ToolSetup,
} from '../../services/itAdminToolInstall'
import { useItAdminToolStore, type ToolLauf, type StandEintrag } from '../../store/itAdminToolInstallStore'

const VORWARNUNG = [
  { s: 0, text: 'sofort' },
  { s: 30, text: '30 Sekunden' },
  { s: 60, text: '1 Minute' },
  { s: 120, text: '2 Minuten' },
  { s: 300, text: '5 Minuten' },
]

function mmss(s: number): string {
  const m = Math.floor(s / 60), r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}
function vorZeit(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 2) return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  const h = Math.round(min / 60)
  if (h < 36) return `vor ${h} Std.`
  return `vor ${Math.round(h / 24)} Tagen`
}

export default function ItAdminToolInstallation() {
  const [setup, setSetup] = useState<ToolSetup | null>(null)
  const [sucht, setSucht] = useState(false)

  async function suchen(datei = gewaehlteSetupDatei()) {
    setSucht(true)
    try { setSetup(await findeToolSetup(datei)) } finally { setSucht(false) }
  }
  useEffect(() => { void suchen() }, [])

  async function dateiWaehlen() {
    const p = await api().openFileDialog([{ name: 'Setup (IT Admin Tool Setup …exe)', extensions: ['exe'] }])
    if (!p) return
    setzeSetupDatei(p)
    await suchen(p)
  }
  async function standard() {
    setzeSetupDatei('')
    await suchen('')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <MonitorUp size={24} className="text-sky-500" />
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">IT Admin Tool <Lock size={13} className="text-muted-foreground" /></h2>
          <p className="text-xs text-muted-foreground">
            Neue Version des Tools auf andere PCs bringen: Desktop-Nachricht, Tool beenden, still installieren, Fertig-Nachricht.
          </p>
        </div>
      </div>

      <SetupKarte setup={setup} sucht={sucht} onSuchen={() => void suchen()} onWaehlen={() => void dateiWaehlen()} onStandard={() => void standard()} />
      <ZielKarte setup={setup} />
      <AblaufKarte setup={setup} />
      <Laeufe />
      <InstallLogbuch software="IT Admin Tool" titel="Logbuch IT Admin Tool" />
    </div>
  )
}

// ── Setup ────────────────────────────────────────────────────────────────────
function SetupKarte({ setup, sucht, onSuchen, onWaehlen, onStandard }: {
  setup: ToolSetup | null; sucht: boolean; onSuchen: () => void; onWaehlen: () => void; onStandard: () => void
}) {
  return (
    <Card title="Setup auf diesem PC" icon={<FolderOpen size={16} />}
      subtitle={`Standard: das neueste „IT Admin Tool Setup ….exe" direkt unter ${SETUP_ORDNER_STANDARD}`}
      actions={
        <div className="flex items-center gap-1.5">
          <button onClick={onSuchen} disabled={sucht}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
            {sucht ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}Neu suchen
          </button>
          <button onClick={onWaehlen} disabled={sucht}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
            <FolderOpen size={11} />Andere Datei wählen …
          </button>
        </div>
      }>
      {!setup && <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 size={12} className="animate-spin" />Setup wird gesucht …</p>}
      {setup && !setup.ok && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-500" data-setup="fehlt">
          <AlertTriangle size={13} className="shrink-0 mt-px" />
          <span className="flex-1">{setup.fehler}</span>
        </div>
      )}
      {setup?.ok && (
        <div className="space-y-1" data-setup="ok">
          <p className="flex items-center gap-1.5 text-xs text-foreground">
            <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
            <span className="font-semibold">{setup.name}</span>
            <span className="text-muted-foreground">· {setup.groesseMB} MB · erstellt {zeitText(setup.erstellt)}{setup.version ? ` · Version ${setup.version}` : ''}</span>
          </p>
          <p className="pl-5 text-[11px] font-mono text-muted-foreground break-all">{setup.pfad}</p>
          {setup.weitere.length > 0 && (
            <p className="pl-5 text-[11px] text-muted-foreground">Ältere Setups im Ordner (werden nicht genommen): {setup.weitere.join(', ')}</p>
          )}
        </div>
      )}
      {setup?.eigeneWahl && (
        <p className="text-[11px] text-muted-foreground">
          Von Hand gewählte Datei. <button onClick={onStandard} className="underline hover:text-foreground">Zurück zum Standard (neuestes unter {SETUP_ORDNER_STANDARD})</button>
        </p>
      )}
    </Card>
  )
}

// ── Ziel-PCs ─────────────────────────────────────────────────────────────────
function ZielKarte({ setup }: { setup: ToolSetup | null }) {
  const ziele = useItAdminToolStore(s => s.ziele)
  const staende = useItAdminToolStore(s => s.staende)
  const laeufe = useItAdminToolStore(s => s.laeufe)
  const fuegeHinzu = useItAdminToolStore(s => s.fuegeHinzu)
  const entferne = useItAdminToolStore(s => s.entferne)
  const pruefe = useItAdminToolStore(s => s.pruefe)
  const leereZiele = useItAdminToolStore(s => s.leereZiele)
  const [eingabe, setEingabe] = useState('')
  const eingabeOk = isValidRemoteTarget(eingabe.trim())

  function direkt() {
    if (!eingabeOk) return
    fuegeHinzu({ host: eingabe.trim().toUpperCase() })
    setEingabe('')
  }

  return (
    <Card title="Ziel-PCs" icon={<UserSearch size={16} />}
      subtitle="Einen oder mehrere PCs sammeln — installiert wird auf allen in der Liste (höchstens 2 gleichzeitig)."
      actions={ziele.length > 1 ? <button onClick={leereZiele} className="text-[11px] text-muted-foreground hover:text-foreground underline">Liste leeren</button> : undefined}>
      <div className="space-y-2">
        <UserPcSearch onPick={(h, serial) => fuegeHinzu({ host: h.trim(), serial })} mitOnlineStatus mitCheckbox placeholder="Name, Kürzel oder E-Mail eintippen …" />
        <div className="flex items-center gap-2 pt-1 border-t border-border/50">
          <Monitor size={13} className="text-muted-foreground shrink-0" />
          <span className="text-[11px] text-muted-foreground shrink-0">oder direkt:</span>
          <input value={eingabe} onChange={e => setEingabe(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') direkt() }}
            placeholder="Hostname (DE…) oder IP-Adresse" data-feld="direkt"
            className="flex-1 min-w-0 px-2 py-1 text-xs font-mono rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
          <button onClick={direkt} disabled={!eingabeOk}
            className="shrink-0 px-2.5 py-1 text-[11px] rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
            Hinzufügen
          </button>
        </div>
        <ToolPcs vorhanden={ziele.map(z => z.host)} onAdd={(h, von) => fuegeHinzu({ host: h, von })} />
      </div>

      {ziele.length === 0
        ? <p className="text-[11px] text-muted-foreground italic">Noch kein Ziel-PC gewählt.</p>
        : (
          <div className="rounded-md border border-border divide-y divide-border/60" data-zielliste>
            {ziele.map(z => {
              const key = z.host.toLowerCase()
              const l = laeufe[key]
              const aktiv = l?.phase === 'laeuft' || l?.phase === 'wartet'
              return (
                <div key={key} className="flex items-start gap-2 px-2.5 py-2" data-ziel={z.host}>
                  <Laptop size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-mono font-semibold text-foreground">{z.host}</span>
                      <DeviceInfoButton hostname={z.host} serial={z.serial} />
                      {z.von && <span className="text-[11px] text-muted-foreground">· {z.von}</span>}
                      {l && <LaufAbzeichen l={l} />}
                    </div>
                    <StandZeile e={staende[key]} setupErstellt={setup?.ok ? setup.erstellt : undefined} />
                  </div>
                  <button onClick={() => pruefe(z.host)} disabled={staende[key]?.laeuft || aktiv} title="Ist-Stand neu prüfen"
                    className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40">
                    <Search size={12} />
                  </button>
                  <button onClick={() => entferne(z.host)} disabled={aktiv} title="Aus der Liste nehmen"
                    className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-accent disabled:opacity-40">
                    <X size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
    </Card>
  )
}

function LaufAbzeichen({ l }: { l: ToolLauf }) {
  const cls = l.phase === 'fertig' ? 'border-emerald-500/40 text-emerald-500' : l.phase === 'fehler' ? 'border-red-500/40 text-red-500' : 'border-sky-500/40 text-sky-500'
  const text = l.phase === 'fertig' ? (l.ergebnis?.warnung ? 'installiert (mit Hinweis)' : 'installiert') : l.phase === 'fehler' ? 'fehlgeschlagen' : l.phase === 'wartet' ? 'wartet' : 'läuft …'
  return <span className={`text-[10px] px-1.5 py-px rounded border ${cls}`}>{text}</span>
}

function StandZeile({ e, setupErstellt }: { e?: StandEintrag; setupErstellt?: string }) {
  if (!e || (e.laeuft && !e.stand)) return <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 size={11} className="animate-spin" />Ist-Stand wird geprüft …</p>
  const s = e.stand
  if (!s) return null
  if (s.gesperrt) return <p className="flex items-start gap-1 text-[11px] text-red-500" data-stand="gesperrt"><Lock size={11} className="shrink-0 mt-0.5" />{s.fehler}</p>
  if (!s.ok) return <p className="flex items-start gap-1 text-[11px] text-amber-500" data-stand="fehler"><AlertTriangle size={11} className="shrink-0 mt-0.5" />{s.fehler}</p>
  const v = standVergleich(s, setupErstellt)
  return (
    <p className="text-[11px] text-muted-foreground" data-stand={v}>
      {e.laeuft && <Loader2 size={10} className="inline animate-spin mr-1" />}
      {v === 'fehlt'
        ? <span className="text-foreground">IT Admin Tool noch nicht installiert</span>
        : <>installiert am <span className="text-foreground">{zeitText(s.installiertAm) || '?'}</span>
          {v === 'aelter' && <span className="ml-1 text-amber-500 font-semibold">· älter als dieses Setup</span>}
          {v === 'vermutlich-aktuell' && <span className="ml-1 text-emerald-500">· nach dem Setup installiert — vermutlich schon dieser Stand</span>}</>}
      {' · '}{s.prozesse ? <span className="text-amber-500 font-semibold">läuft gerade{s.nutzer.length ? ` (${s.nutzer.join(', ')})` : ''}</span> : 'läuft nicht'}
      {' · '}angemeldet: <span className="text-foreground">{s.angemeldet || 'niemand'}</span>
    </p>
  )
}

/** PCs, auf denen das Tool zuletzt lief — aus der Chat-Anwesenheit (Rechnername seit dieser Version). */
function ToolPcs({ vorhanden, onAdd }: { vorhanden: string[]; onAdd: (host: string, von: string) => void }) {
  const [nutzer, setNutzer] = useState<ChatNutzer[] | null>(null)
  const [ich, setIch] = useState('')
  useEffect(() => {
    let weg = false
    void Promise.all([ladeNutzer(), eigenerRechner()]).then(([n, e]) => { if (!weg) { setNutzer(n); setIch(e.toUpperCase()) } })
    return () => { weg = true }
  }, [])
  const da = useMemo(() => new Set(vorhanden.map(h => h.toUpperCase())), [vorhanden])
  const liste = useMemo(() => {
    const je = new Map<string, ChatNutzer>()
    for (const n of nutzer ?? []) {
      const pc = (n.rechner || '').toUpperCase()
      if (!pc || pc === ich || !isValidRemoteTarget(pc)) continue
      const alt = je.get(pc)
      if (!alt || n.ageMs < alt.ageMs) je.set(pc, n)
    }
    return [...je.entries()].sort((a, b) => a[1].ageMs - b[1].ageMs)
  }, [nutzer, ich])
  if (!nutzer || liste.length === 0) return null
  const offen = liste.filter(([pc]) => !da.has(pc))
  return (
    <div className="pt-1 border-t border-border/50 space-y-1" data-toolpcs>
      <div className="flex items-center gap-2">
        <Users size={13} className="text-muted-foreground shrink-0" />
        <span className="text-[11px] text-muted-foreground">PCs, auf denen das Tool zuletzt lief:</span>
        {offen.length > 1 && (
          <button onClick={() => offen.forEach(([pc, n]) => onAdd(pc, n.displayName))} className="ml-auto text-[11px] text-primary hover:underline">alle hinzufügen</button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {liste.map(([pc, n]) => {
          const drin = da.has(pc)
          return (
            <button key={pc} onClick={() => onAdd(pc, n.displayName)} disabled={drin}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] rounded-md border border-border hover:bg-accent text-foreground disabled:opacity-40">
              <span className={`w-1.5 h-1.5 rounded-full ${n.online ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
              <span className="font-mono">{pc}</span>
              <span className="text-muted-foreground">{n.displayName} · {n.online ? 'jetzt im Tool' : vorZeit(n.ageMs)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Ablauf + Start ───────────────────────────────────────────────────────────
function AblaufKarte({ setup }: { setup: ToolSetup | null }) {
  const ziele = useItAdminToolStore(s => s.ziele)
  const staende = useItAdminToolStore(s => s.staende)
  const laeufe = useItAdminToolStore(s => s.laeufe)
  const starte = useItAdminToolStore(s => s.starte)
  const [vorwarn, setVorwarn] = useState(30)
  const [frage, setFrage] = useState(false)

  const bereit = ziele.filter(z => {
    const key = z.host.toLowerCase()
    const l = laeufe[key]
    return !staende[key]?.stand?.gesperrt && !(l && (l.phase === 'laeuft' || l.phase === 'wartet'))
  })
  const mitTool = bereit.filter(z => (staende[z.host.toLowerCase()]?.stand?.prozesse ?? 0) > 0)
  const kannStarten = !!setup?.ok && bereit.length > 0
  useEffect(() => { if (!kannStarten) setFrage(false) }, [kannStarten])

  function los() {
    if (!setup?.ok) return
    starte(bereit.map(z => z.host), setup, { vorwarnSekunden: vorwarn })
    setFrage(false)
  }

  return (
    <Card title="Ablauf je PC" icon={<Timer size={16} />}>
      <ol className="list-decimal pl-5 space-y-0.5 text-[11px] text-foreground">
        <li>Setup auf den PC kopieren (über C$, beim Anwender passiert noch nichts)</li>
        <li>Desktop-Nachricht an alle angemeldeten Benutzer</li>
        <li>
          Vorwarnzeit, wenn das Tool gerade läuft:{' '}
          <select value={vorwarn} onChange={e => setVorwarn(Number(e.target.value))} data-feld="vorwarn"
            className="px-1.5 py-0.5 text-[11px] rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary">
            {VORWARNUNG.map(v => <option key={v.s} value={v.s}>{v.text}</option>)}
          </select>
        </li>
        <li>IT Admin Tool beenden (alle Benutzer) und die neue Version still installieren — kein Fenster beim Anwender</li>
        <li>Prüfen, ob die Programmdateien wirklich neu sind, dann Desktop-Nachricht „Installation ist durch"</li>
      </ol>

      <div className="rounded-md border border-border bg-background p-2.5 space-y-1.5">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"><MessageSquare size={11} />Diese Nachrichten sieht der Anwender</p>
        <p className="text-[11px] text-foreground border-l-2 border-amber-500/60 pl-2" data-nachricht="vorher">{ankuendigungsText(vorwarn, true)}</p>
        <p className="text-[11px] text-foreground border-l-2 border-emerald-500/60 pl-2" data-nachricht="nachher">{FERTIG_TEXT}</p>
        <p className="text-[10px] text-muted-foreground">Klappt etwas nicht, kommt statt der zweiten Nachricht ein ehrlicher Hinweis (z. B. „kann wie bisher weiter benutzt werden").</p>
      </div>

      {!frage ? (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setFrage(true)} disabled={!kannStarten} data-knopf="installieren"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-40">
            <MonitorUp size={13} />{bereit.length > 1 ? `Auf ${bereit.length} PCs installieren` : 'Installieren'}
          </button>
          {!setup?.ok && <span className="text-[11px] text-muted-foreground">Erst ein Setup finden bzw. wählen.</span>}
          {setup?.ok && bereit.length === 0 && <span className="text-[11px] text-muted-foreground">Erst einen Ziel-PC hinzufügen.</span>}
        </div>
      ) : (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2" data-rueckfrage>
          <p className="text-xs text-foreground">
            <b>{setup?.name}</b> jetzt auf {bereit.length === 1 ? <span className="font-mono">{bereit[0].host}</span> : `${bereit.length} PCs`} installieren?
            {' '}Dort wird das IT Admin Tool beendet{mitTool.length ? <> — <b>läuft gerade auf {mitTool.map(z => z.host).join(', ')}</b></> : ''}.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={los} data-knopf="ja"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold text-white bg-sky-600 hover:bg-sky-500">
              <MonitorUp size={13} />Ja, jetzt installieren
            </button>
            <button onClick={() => setFrage(false)} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Abbrechen</button>
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Läufe ────────────────────────────────────────────────────────────────────
function Laeufe() {
  const laeufe = useItAdminToolStore(s => s.laeufe)
  const liste = Object.values(laeufe).sort((a, b) => b.startzeit - a.startzeit)
  if (!liste.length) return null
  return (
    <div className="space-y-3">
      {liste.map(l => <LaufKarte key={l.host.toLowerCase()} l={l} />)}
    </div>
  )
}

function LaufKarte({ l }: { l: ToolLauf }) {
  const verwerfe = useItAdminToolStore(s => s.verwerfe)
  const laeuft = l.phase === 'laeuft' || l.phase === 'wartet'
  const [jetzt, setJetzt] = useState(Date.now())
  useEffect(() => {
    if (!laeuft) return
    const t = setInterval(() => setJetzt(Date.now()), 1000)
    return () => clearInterval(t)
  }, [laeuft])
  const dauer = Math.max(0, Math.round(((laeuft ? jetzt : l.endzeit ?? jetzt) - l.startzeit) / 1000))

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2" data-lauf={l.host}>
      <div className="flex items-center gap-2 flex-wrap">
        <MonitorUp size={14} className="text-sky-500" />
        <span className="text-sm font-mono font-semibold text-foreground">{l.host}</span>
        <DeviceInfoButton hostname={l.host} />
        <LaufAbzeichen l={l} />
        <span className="text-[11px] text-muted-foreground">{l.setupName}</span>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{l.phase === 'wartet' ? 'wartet auf einen freien Platz …' : `${laeuft ? 'läuft seit' : 'Dauer'} ${mmss(dauer)}`}</span>
        {!laeuft && <button onClick={() => verwerfe(l.host)} className="text-[11px] text-muted-foreground hover:text-foreground underline">schließen</button>}
      </div>
      <div className="rounded-md border border-border divide-y divide-border/60">
        {l.schritte.map(s => (
          <div key={s.id} className="flex items-start gap-2 px-2.5 py-1.5" data-schritt={s.id} data-status={s.status}>
            <span className="shrink-0 mt-px">
              {s.status === 'laeuft' ? <Loader2 size={12} className="animate-spin text-blue-400" />
                : s.status === 'ok' ? <CheckCircle2 size={12} className="text-emerald-500" />
                : s.status === 'fehler' ? <AlertTriangle size={12} className="text-red-500" />
                : s.status === 'warnung' ? <AlertTriangle size={12} className="text-amber-500" />
                : <span className="block w-3 h-3 rounded-full border border-border" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className={`block text-[11px] ${s.status === 'offen' ? 'text-muted-foreground' : 'text-foreground'}`}>{s.label}</span>
              {s.info && <span className="block text-[10px] text-muted-foreground break-words">{s.info}</span>}
            </span>
          </div>
        ))}
      </div>
      {l.ergebnis && (
        <div className={`flex items-start gap-2 px-2.5 py-2 rounded-md text-[11px] border text-foreground ${l.ergebnis.ok ? (l.ergebnis.warnung ? 'border-amber-500/40 bg-amber-500/10' : 'border-emerald-500/40 bg-emerald-500/10') : 'border-red-500/40 bg-red-500/10'}`} data-ergebnis={l.ergebnis.ok ? 'ok' : 'fehler'}>
          {l.ergebnis.ok ? <CheckCircle2 size={13} className={`shrink-0 mt-px ${l.ergebnis.warnung ? 'text-amber-500' : 'text-emerald-500'}`} /> : <AlertTriangle size={13} className="shrink-0 mt-px text-red-500" />}
          <span className="whitespace-pre-wrap break-words">{l.ergebnis.text}{l.ergebnis.ok && l.ergebnis.warnung ? ' — Hinweise siehe Schritte oben.' : ''}</span>
        </div>
      )}
    </div>
  )
}
