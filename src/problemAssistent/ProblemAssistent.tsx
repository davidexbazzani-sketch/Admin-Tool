// ── PC-Diagnose → große Kachel „Gib dein Problem ein“ ────────────────────────
// 1) Ziel-PC (Hostname/IP/Name)  2) online? WinRM aktivieren, angemeldeten Benutzer lesen
// 3) Problem eintippen → Vorschläge  4) Lösung per Knopfdruck (Schritte abwählbar),
// optional Desktop-Nachricht an den Benutzer, danach Überwachung anbieten.
// Ausgeführte Eingriffe landen im Geräte- und Personen-Dossier.

import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  MessageSquareWarning, Loader2, CheckCircle2, XCircle, AlertTriangle, Wifi, User, Lock, Monitor, ChevronDown, Play, ShieldAlert,
  Send, Wrench, ExternalLink, Search, X, Info, Sparkles, MinusCircle, ListChecks, Lightbulb,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { ensureDailyAdUsers } from '../services/adUserDirectory'
import type { AdUserListItem } from '../services/adUsersList'
import { fuzzyNameMatch } from '../utils/nameMatch'
import type { DgErsatzBenutzer } from './diagnose/KeineAhnung'
import { logDeviceAction } from '../services/deviceDossier'
import { logDossierAction } from '../services/personDossier'
import PcSuche, { type PcWahl } from '../components/PcSuche'
import { PersonInfoButton } from '../components/person/PersonDossier'
import MonitorAngebot from '../monitoring/MonitorAngebot'
import { PROBLEME, KERNPROBLEME } from './katalog'
import { AKTIONEN, WERKZEUGE, aktion } from './aktionen'
import { useTestStand } from '../befehlsTest/stand'
import TreiberCheck, { treiberRelevant } from './TreiberCheck'
import RechteCheck, { rechteRelevant } from './RechteCheck'
import type { BtStand } from '../befehlsTest/types'
import { baueIndexAsync, erkenne, type PaIndex, type PaErkennung, type PaGelernt, type PaKontext, type PaSicherheit, type PaTreffer } from './suche'
import { ladeGelernt, lerne } from './gelernt'
import { fuehreAus, sendeDesktopNachricht, verbindeUndLies, type PaErgebnis, type PaModus, type PaVerbindung } from './motor'
import { PA_BEREICHE, type PaBereich, type PaProblem, type PaSchritt } from './types'
import { ladeDruckerListe, type DruckerZiel } from '../services/druckerFlotte'
import PcAenderungen from '../pcVerlauf/PcAenderungen'
import type { BezugKontext } from '../pcVerlauf/bezug'
import { usePaVorgabe } from './vorgabe'

const MODUS: Record<PaModus, string> = { system: 'als Admin', profil: 'Benutzerprofil', benutzer: 'Sitzung des Benutzers', lokal: 'vom Admin-PC' }
const RISIKO = {
  lesen: { text: 'liest nur', cls: 'text-muted-foreground border-border' },
  aendern: { text: 'ändert', cls: 'text-amber-600 dark:text-amber-400 border-amber-500/40' },
  kritisch: { text: 'kritisch', cls: 'text-red-600 dark:text-red-400 border-red-500/40' },
} as const

type SchrittLauf = { status: 'offen' | 'laeuft' | 'ok' | 'fehler' | 'uebersprungen'; erg?: PaErgebnis }

const vorname = (name: string) => { const n = name.trim(); if (!n) return ''; if (n.includes(',')) return n.split(',')[1].trim().split(/\s+/)[0] || ''; return n.split(/\s+/)[0] }

// Suchindex: einmal je Programmsitzung, schrittweise im Hintergrund (die Oberfläche bleibt bedienbar)
let indexFertig: PaIndex | null = null
let indexLaeuft: Promise<PaIndex> | null = null
export function ladeIndex(): Promise<PaIndex> {
  if (!indexLaeuft) indexLaeuft = baueIndexAsync(PROBLEME, id => aktion(id)?.titel || WERKZEUGE[id.replace(/^werkzeug:/, '')]?.titel || '').then(ix => (indexFertig = ix))
  return indexLaeuft
}
const ServiceNowWelt = lazy(() => import('../serviceNowWelt/ServiceNowWelt'))
const KeineAhnung = lazy(() => import('./diagnose/KeineAhnung'))
const BereichsDiagnose = lazy(() => import('./diagnose/BereichsDiagnose'))
const BerechtigungsCheck = lazy(() => import('./BerechtigungsCheck'))
const LEER: PaErkennung = { treffer: [], sicherheit: 'keine', gruende: [], erkannt: [], unbekannt: [], parameter: [] }

export default function ProblemAssistent({ onWerkzeug }: { onWerkzeug: (id: string, host: string) => void }) {
  const user = useAuthStore(s => s.session?.user)
  const by = user?.displayName || user?.username || 'unbekannt'
  const [pc, setPc] = useState<PcWahl | null>(null)
  const [verb, setVerb] = useState<PaVerbindung | null>(null)
  const [verbindet, setVerbindet] = useState(false)
  const [person, setPerson] = useState<AdUserListItem | null>(null)
  // Zugewiesene Person des PCs (für AD-Prüfungen, wenn niemand angemeldet bzw. der PC nicht erreichbar ist)
  const [ersatz, setErsatz] = useState<DgErsatzBenutzer | null>(null)
  const [q, setQ] = useState('')
  const [bereich, setBereich] = useState<PaBereich | null>(null)
  const [markiert, setMarkiert] = useState(0)
  const [problem, setProblem] = useState<PaProblem | null>(null)
  const [geoeffnetMit, setGeoeffnetMit] = useState('')
  const [vorbelegung, setVorbelegung] = useState('')
  const [gelernt, setGelernt] = useState<PaGelernt[]>([])
  const [erledigt, setErledigt] = useState<Set<string>>(new Set())
  const [bereicheOffen, setBereicheOffen] = useState(false)
  const [welt, setWelt] = useState<'probleme' | 'servicenow'>('probleme')
  const [ahnungslos, setAhnungslos] = useState(false)
  const [berCheck, setBerCheck] = useState(false)
  const eingabeRef = useRef<HTMLInputElement>(null)

  const [index, setIndex] = useState<PaIndex | null>(indexFertig)
  useEffect(() => { if (!index) { let weg = false; void ladeIndex().then(ix => { if (!weg) setIndex(ix) }); return () => { weg = true } } }, [index])
  const kontext = useMemo<PaKontext | null>(() => (verb?.ok ? { akku: verb.akku, wlan: verb.wlan } : null), [verb])
  // Suche läuft „hinter“ dem Tippen her — das Eingabefeld bleibt auch bei 2000 Problemen flüssig
  const qSuche = useDeferredValue(q)
  const erk = useMemo<PaErkennung>(() => (index ? erkenne(index, qSuche, { bereich, kontext, gelernt, kern: KERNPROBLEME }) : LEER), [index, qSuche, bereich, kontext, gelernt])
  const oben = useMemo<PaTreffer[]>(() => (erk.mehrere ? erk.mehrere.map(m => m.vorschlag) : erk.vorschlag ? [erk.vorschlag] : []), [erk])
  const rest = useMemo(() => erk.treffer.filter(t => !oben.some(o => o.p.id === t.p.id)).slice(0, 40), [erk, oben])
  const auswahl = useMemo(() => [...oben, ...rest], [oben, rest])
  const proBereich = useMemo(() => { const m = new Map<string, number>(); for (const p of PROBLEME) m.set(p.bereich, (m.get(p.bereich) || 0) + 1); return m }, [])
  // Wozu sollen die Änderungen am PC passen? Gewähltes Problem, sonst das, was die Eingabe erkennen lässt
  const aendKontext = useMemo<BezugKontext | null>(() => {
    if (problem) return { bereiche: [problem.bereich], text: `${geoeffnetMit} ${problem.titel}` }
    if (welt !== 'probleme' || ahnungslos) return null
    const b = bereich ? [bereich] : [...new Set(oben.map(t => t.p.bereich))]
    return b.length || qSuche.trim() ? { bereiche: b, text: qSuche } : null
  }, [problem, geoeffnetMit, welt, ahnungslos, bereich, oben, qSuche])

  useEffect(() => { void ladeGelernt().then(setGelernt) }, [])
  // PC gewählt → verbinden + Benutzer lesen
  useEffect(() => {
    setVerb(null); setPerson(null); setErsatz(null)
    if (!pc?.host) return
    let weg = false
    setVerbindet(true)
    void verbindeUndLies(pc.host).then(async v => {
      if (weg) return
      setVerb(v); setVerbindet(false)
      if (v.sam) {
        const dir = await ensureDailyAdUsers().catch(() => null)
        const u = dir?.dir?.users.find(x => x.sam.toLowerCase() === v.sam!.toLowerCase())
        if (!weg && u) setPerson(u)
      } else if (pc.person) {
        // Nur eindeutige Treffer übernehmen — lieber keine Prüfung als die falsche Person
        const dir = await ensureDailyAdUsers().catch(() => null)
        const alle = dir?.dir?.users || []
        const genau = alle.filter(x => x.displayName.trim().toLowerCase() === pc.person!.trim().toLowerCase())
        const kand = genau.length ? genau : alle.filter(x => x.enabled && fuzzyNameMatch(x.displayName, pc.person!))
        if (!weg && kand.length === 1) setErsatz({ sam: kand[0].sam, name: kand[0].displayName })
      }
      setTimeout(() => eingabeRef.current?.focus(), 50)
    })
    return () => { weg = true }
  }, [pc?.host])
  useEffect(() => { setMarkiert(0) }, [q, bereich])

  const [alternativen, setAlternativen] = useState<PaProblem[]>([])
  const [versucht, setVersucht] = useState<string[]>([])
  const oeffne = (p: PaProblem, ausLoesungsweg = false) => {
    // Weitere Möglichkeiten: zuerst die übrigen Treffer der Suche, sonst verwandte Probleme
    const schon = new Set([...(ausLoesungsweg ? versucht : []), p.id])
    let alt = auswahl.map(t => t.p).filter(x => !schon.has(x.id))
    if (alt.length < 3 && index) {
      const verwandt = erkenne(index, p.titel + ' ' + p.stichworte.slice(0, 4).join(' '), { kern: KERNPROBLEME }).treffer.map(t => t.p)
      for (const v of verwandt) if (!schon.has(v.id) && !alt.some(a => a.id === v.id)) alt.push(v)
    }
    if (ausLoesungsweg) alt = [...alternativen.filter(a => !schon.has(a.id)), ...alt.filter(a => !alternativen.some(b => b.id === a.id))]
    setAlternativen(alt.slice(0, 3))
    if (!ausLoesungsweg) setVersucht([])
    setProblem(p); if (!ausLoesungsweg) setGeoeffnetMit(q)
    // „drucker verbinden pmd634“ → Druckername gleich ins Feld übernehmen
    const pmd = erk.parameter.find(x => /^pmd\d/.test(x))
    setVorbelegung(p.frage?.art === 'drucker' && pmd ? pmd.toUpperCase() : '')
  }
  const ausgefuehrt = (id: string) => {
    setErledigt(s => new Set(s).add(id))
    setVersucht(v => (v.includes(id) ? v : [...v, id]))
  }
  // Gelernt wird erst, wenn der Anwender bestätigt, dass das Problem behoben ist
  const behoben = (id: string) => {
    if (geoeffnetMit.trim()) void lerne(geoeffnetMit, id, user?.username || by).then(ok => { if (ok) void ladeGelernt(true).then(setGelernt) })
  }
  // Sprung von außen (z. B. Proaktives Radar → PC-Fehler): PC und Problem übernehmen
  const vorgabe = usePaVorgabe(s => s.vorgabe)
  useEffect(() => {
    if (!vorgabe) return
    usePaVorgabe.getState().setze(null)
    setWelt('probleme'); setAhnungslos(false); setBereich(null)
    setPc({ host: vorgabe.host, serial: vorgabe.serial, person: vorgabe.person, quelle: 'Radar' })
    setQ(vorgabe.suche)
    const p = vorgabe.problemId ? PROBLEME.find(x => x.id === vorgabe.problemId) : null
    if (p) { oeffne(p); setGeoeffnetMit(vorgabe.suche) } else setProblem(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vorgabe])
  const zeigeListe = !problem && !ahnungslos && (q.trim() || bereich)
  const kurz = q.trim().split(/\s+/).filter(Boolean).length <= 2

  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-b from-primary/[0.06] to-card shadow-sm" data-problem-assistent>
      <div className="px-6 pt-5 pb-3 text-center space-y-1">
        <div className="inline-flex items-center gap-2 text-primary"><MessageSquareWarning size={22} /><h2 className="text-xl font-bold text-foreground">Gib dein Problem ein</h2></div>
        <p className="text-xs text-muted-foreground">Ziel-PC wählen, Problem in eigenen Worten beschreiben — der Assistent erkennt die passende Lösung und führt sie per Knopfdruck aus. {PROBLEME.length} Probleme in {proBereich.size} Bereichen, {AKTIONEN.length} Lösungsbausteine.</p>
      </div>

      <div className="px-6 pb-6 space-y-4 max-w-3xl mx-auto">
        {/* 1 · Ziel-PC */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">1 · Ziel-PC</p>
          <PcSuche wert={pc} onWahl={w => { setPc(w); setProblem(null) }} placeholder="Hostname, IP-Adresse, Seriennummer oder Name des Benutzers …" />
          {pc?.host && <VerbindungsKarte verb={verb} laeuft={verbindet} person={person} onNeu={() => { const p = pc; setPc(null); setTimeout(() => setPc(p), 0) }} />}
          {/* Was hat sich an diesem PC in den letzten 14 Tagen geändert — und was davon passt zum Problem? */}
          {pc?.host && <PcAenderungen host={pc.host} live={!!verb?.ok && verb.winrm} kontext={aendKontext} />}
        </div>

        {/* 2 · Problem */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">2 · {welt === 'servicenow' ? 'Was brauchst du aus ServiceNow?' : 'Schreibe dein Problem'}</p>
            {!problem && (
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30 text-xs" data-welt-umschalter>
                <button onClick={() => setWelt('probleme')} className={`px-3 py-1 rounded-md ${welt === 'probleme' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Probleme lösen</button>
                <button onClick={() => setWelt('servicenow')} data-welt-servicenow className={`px-3 py-1 rounded-md ${welt === 'servicenow' ? 'bg-sky-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>ServiceNow Welt</button>
              </div>
            )}
          </div>
          {!problem && welt === 'servicenow' ? (
            <Suspense fallback={<p className="text-xs text-muted-foreground inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" />ServiceNow Welt wird geladen …</p>}>
              <ServiceNowWelt q={q} setQ={setQ} />
            </Suspense>
          ) : problem ? (
            <ProblemDetail key={problem.id} problem={problem} pc={pc} verb={verb} person={person} ersatz={ersatz} by={by} onAusgefuehrt={ausgefuehrt} vorbelegung={vorbelegung}
              alternativen={alternativen} versucht={versucht} onBehoben={behoben} onNaechstes={p => oeffne(p, true)}
              onLoesungId={id => { const p = PROBLEME.find(x => x.id === id); if (p) oeffne(p, true) }}
              onZurueck={() => { setProblem(null); setTimeout(() => eingabeRef.current?.focus(), 0) }} onWerkzeug={onWerkzeug} />
          ) : (
            <>
              <div className="flex gap-2 items-stretch">
              <div className="relative flex-1">
                <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input ref={eingabeRef} value={q} onChange={e => { setQ(e.target.value); if (ahnungslos) setAhnungslos(false) }} spellCheck={false} data-problem-eingabe
                  onKeyDown={e => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setMarkiert(m => Math.min(m + 1, auswahl.length - 1)) }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setMarkiert(m => Math.max(m - 1, 0)) }
                    else if (e.key === 'Enter' && auswahl[markiert]) { e.preventDefault(); oeffne(auswahl[markiert].p) }
                    else if (e.key === 'Escape') setQ('')
                  }}
                  placeholder="In eigenen Worten, z. B. „Outlook verschickt keine Mails“, „laufw“, „kein Ton im Headset“, „0x80070005“ …"
                  className="w-full pl-11 pr-10 py-3.5 text-base rounded-xl border-2 border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary shadow-sm" />
                {q && <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent text-muted-foreground"><X size={15} /></button>}
              </div>
                <button onClick={() => setAhnungslos(x => !x)} data-keine-ahnung-knopf title="Geführte Diagnose: Thema wählen, das Tool prüft den PC und findet die Ursache"
                  className={`shrink-0 max-w-[11rem] px-3 rounded-xl border-2 text-xs font-semibold leading-tight text-left ${ahnungslos ? 'bg-violet-600 text-white border-violet-600' : 'border-violet-500/40 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10'}`}>
                  Keine Ahnung, was das Problem ist?
                </button>
              </div>
              {/* Berechtigungscheck: Homeoffice, SolidWorks, Ordner auf Laufwerk I:, Grundausstattung, Lizenzen */}
              <div className="flex justify-start">
                <button onClick={() => setBerCheck(x => !x)} data-berechtigungscheck-knopf title="Im AD prüfen, welche Berechtigungen eine Person hat und welche fehlen – mit Link zum Antrag"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 text-xs font-semibold ${berCheck ? 'bg-emerald-600 text-white border-emerald-600' : 'border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10'}`}>
                  <ShieldAlert size={14} />Berechtigungscheck machen
                </button>
              </div>
              {berCheck && (
                <Suspense fallback={<p className="text-xs text-muted-foreground inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" />Berechtigungscheck wird geladen …</p>}>
                  <BerechtigungsCheck sam={verb?.sam || ersatz?.sam} name={person?.displayName || ersatz?.name} onSchliessen={() => setBerCheck(false)} />
                </Suspense>
              )}
              {ahnungslos && (
                <Suspense fallback={<p className="text-xs text-muted-foreground inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" />Diagnose wird geladen …</p>}>
                  <KeineAhnung host={pc?.host || ''} verb={verb} ersatz={ersatz} onSchliessen={() => setAhnungslos(false)}
                    onLoesung={id => { const p = PROBLEME.find(x => x.id === id); if (p) { setAhnungslos(false); oeffne(p) } }} />
                </Suspense>
              )}

              {/* Verstandene Begriffe */}
              {!ahnungslos && q.trim() && (erk.erkannt.length > 0 || erk.unbekannt.length > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]" data-problem-erkannt>
                  <span className="text-muted-foreground">Verstanden:</span>
                  {erk.erkannt.map(x => (
                    <span key={x.wort} className={`px-2 py-0.5 rounded-full border ${x.als === 'Fehlercode' ? 'border-primary/50 text-primary bg-primary/10 font-mono' : 'border-border bg-muted/40 text-foreground'}`}>
                      {x.wort}{x.als && x.als !== 'Fehlercode' ? <span className="text-muted-foreground"> → {x.als}</span> : null}
                    </span>
                  ))}
                  {erk.unbekannt.length > 0 && <span className="text-muted-foreground/70" title="Diese Wörter kennt der Katalog nicht — sie stören die Suche nicht.">· ohne Bedeutung: {erk.unbekannt.join(', ')}</span>}
                </div>
              )}

              {ahnungslos ? null : q.trim() && !bereich && !bereicheOffen ? (
                <div className="flex justify-end -mt-1"><button onClick={() => setBereicheOffen(true)} data-bereiche-zeigen className="text-[11px] text-muted-foreground hover:text-foreground underline">nach Bereich filtern</button></div>
              ) : <div className="flex flex-wrap gap-1.5 justify-center" data-bereiche>
                {PA_BEREICHE.filter(b => proBereich.get(b)).map(b => (
                  <button key={b} onClick={() => setBereich(x => (x === b ? null : b))}
                    className={`text-[11px] px-2.5 py-1 rounded-full border ${bereich === b ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'}`}>
                    {b} <span className="opacity-60">{proBereich.get(b)}</span>
                  </button>
                ))}
              </div>}

              {zeigeListe && !index && <p className="text-xs text-muted-foreground inline-flex items-center gap-2" data-katalog-laedt><Loader2 size={13} className="animate-spin" />Katalog wird vorbereitet …</p>}
              {zeigeListe && erk.kontextHinweis && <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5"><Monitor size={11} />{erk.kontextHinweis}.</p>}

              {/* Erkannte Lösung(en) */}
              {zeigeListe && erk.mehrere && (
                <div className="space-y-2" data-problem-mehrere>
                  <p className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5"><ListChecks size={14} className="text-primary" />{erk.mehrere.length} Probleme erkannt — nacheinander lösen</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {erk.mehrere.map((m, i) => (
                      <VorschlagKarte key={m.vorschlag.p.id} t={m.vorschlag} sicherheit={m.sicherheit} teil={m.teil} kompakt aktiv={markiert === i}
                        erledigt={erledigt.has(m.vorschlag.p.id)} onOeffnen={() => oeffne(m.vorschlag.p)} onHover={() => setMarkiert(i)} />
                    ))}
                  </div>
                </div>
              )}
              {zeigeListe && !erk.mehrere && erk.vorschlag && (
                <VorschlagKarte t={erk.vorschlag} sicherheit={erk.sicherheit} gruende={erk.gruende} aktiv={markiert === 0}
                  erledigt={erledigt.has(erk.vorschlag.p.id)} onOeffnen={() => oeffne(erk.vorschlag!.p)} onHover={() => setMarkiert(0)} />
              )}

              {zeigeListe && (
                <div className="space-y-1">
                  {oben.length > 0 && rest.length > 0 && <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">Weitere passende Probleme</p>}
                  {(rest.length > 0 || !oben.length) && (
                    <div className="rounded-xl border border-border bg-card divide-y divide-border/60 max-h-[420px] overflow-y-auto shadow-sm" data-problem-vorschlaege>
                      {!oben.length && rest.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Kein passendes Problem gefunden — anders beschreiben (z. B. Programmname + was passiert) oder einen Bereich wählen.</p>}
                      {rest.map((t, j) => {
                        const i = j + oben.length
                        return (
                          <button key={t.p.id} onMouseEnter={() => setMarkiert(i)} onClick={() => oeffne(t.p)}
                            className={`w-full text-left px-4 py-2.5 flex items-start gap-3 ${i === markiert ? 'bg-primary/10' : 'hover:bg-accent/20'}`}>
                            <Sparkles size={14} className={`mt-1 shrink-0 ${i === markiert ? 'text-primary' : 'text-muted-foreground/50'}`} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-foreground">{t.p.titel}{erledigt.has(t.p.id) && <CheckCircle2 size={13} className="inline ml-1.5 -mt-0.5 text-emerald-500" />}</span>
                              <span className="block text-[11px] text-muted-foreground truncate">{t.p.ursache}</span>
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 border border-border text-muted-foreground shrink-0">{t.p.bereich}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {q.trim() && (
                    <div className="flex justify-end pt-1"><button onClick={() => setWelt('servicenow')} className="text-[11px] text-sky-700 dark:text-sky-300 hover:underline inline-flex items-center gap-1"><ExternalLink size={11} />„{q.trim()}“ in der ServiceNow Welt suchen (Bestellung, Antrag, Ticket)</button></div>
                  )}
                  {!oben.length && rest.length > 0 && kurz && !bereich && (
                    <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5 pt-1"><Lightbulb size={12} className="text-amber-500" />Tipp: Programm und was passiert eingeben (z. B. „teams startet nicht“) — dann erkennt der Assistent die Lösung direkt. Unklar? <button onClick={() => setAhnungslos(true)} className="underline text-violet-700 dark:text-violet-300">Geführte Diagnose starten</button></p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Erkannte Lösung — groß (eine) oder kompakt (mehrere Probleme in einer Eingabe). */
function VorschlagKarte({ t, sicherheit, gruende, teil, kompakt, aktiv, erledigt, onOeffnen, onHover }: {
  t: PaTreffer; sicherheit: PaSicherheit; gruende?: string[]; teil?: string; kompakt?: boolean; aktiv: boolean; erledigt: boolean
  onOeffnen: () => void; onHover: () => void
}) {
  const sicher = sicherheit === 'hoch'
  const schritte = t.p.schritte.filter(s => !s.optional)
  return (
    <div onMouseEnter={onHover} data-problem-vorschlag={t.p.id} data-sicherheit={sicherheit}
      className={`rounded-xl border-2 bg-card shadow-sm transition-colors ${aktiv ? 'border-primary ring-2 ring-primary/20' : sicher ? 'border-primary/50' : 'border-border'}`}>
      <div className="px-4 pt-3 pb-2 flex items-start gap-2">
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${sicher ? 'bg-primary text-primary-foreground' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40'}`}>
          <Sparkles size={11} />{sicher ? 'Lösung erkannt' : 'Wahrscheinlich'}
        </span>
        {erledigt && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={12} />ausgeführt</span>}
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-muted/50 border border-border text-muted-foreground shrink-0">{t.p.bereich}</span>
      </div>
      <div className="px-4 pb-3 space-y-2">
        {teil && <p className="text-[11px] text-muted-foreground italic truncate">„{teil}“</p>}
        <p className={`${kompakt ? 'text-sm' : 'text-base'} font-semibold text-foreground`}>{t.p.titel}</p>
        {!kompakt && <p className="text-[13px] text-muted-foreground"><span className="font-medium text-foreground">Ursache:</span> {t.p.ursache}</p>}
        <p className="text-[13px] text-foreground/90"><span className="font-medium text-foreground">Lösung:</span> {kompakt ? t.p.loesung.split(/(?<=[.!?])\s/)[0] : t.p.loesung}</p>
        {!kompakt && schritte.length > 0 && (
          <ol className="space-y-0.5" data-vorschlag-schritte>
            {schritte.map((s, i) => {
              const w = s.aktion.startsWith('werkzeug:') ? WERKZEUGE[s.aktion.slice(9)] : null
              const a = w ? null : aktion(s.aktion)
              return (
                <li key={i} className="flex items-center gap-2 text-[12px] text-foreground">
                  <span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] font-semibold inline-flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="truncate">{s.titel || w?.titel || a?.titel}</span>
                  {a && <span className={`text-[9px] px-1.5 py-px rounded-full border shrink-0 ${RISIKO[a.risiko].cls}`}>{RISIKO[a.risiko].text}</span>}
                  {w && <Wrench size={11} className="text-primary shrink-0" />}
                </li>
              )
            })}
          </ol>
        )}
        {!!gruende?.length && (
          <div className="flex flex-wrap gap-1">
            {gruende.map(g => <span key={g} className="text-[10px] px-1.5 py-px rounded border border-border text-muted-foreground">{g}</span>)}
          </div>
        )}
        <div className="flex items-center gap-2 pt-0.5">
          <button onClick={onOeffnen} data-vorschlag-oeffnen
            className={`inline-flex items-center gap-1.5 rounded-lg font-semibold shadow-sm ${kompakt ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} ${sicher ? 'bg-primary text-primary-foreground' : 'border border-primary/50 text-primary hover:bg-primary/10'}`}>
            <Play size={kompakt ? 13 : 15} />Lösung übernehmen
          </button>
          {aktiv && <span className="text-[10px] text-muted-foreground">Enter</span>}
        </div>
      </div>
    </div>
  )
}

function VerbindungsKarte({ verb, laeuft, person, onNeu }: { verb: PaVerbindung | null; laeuft: boolean; person: AdUserListItem | null; onNeu: () => void }) {
  if (laeuft || !verb) return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-2 w-full" data-verbindung>
      <Loader2 size={13} className="animate-spin" />Prüfe Erreichbarkeit, aktiviere WinRM (wie Remote Doc) und lese den angemeldeten Benutzer …
    </div>
  )
  const Z = ({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) => (
    <span className="inline-flex items-center gap-1.5">{ok ? (warn ? <AlertTriangle size={13} className="text-amber-500" /> : <CheckCircle2 size={13} className="text-emerald-500" />) : <XCircle size={13} className="text-red-500" />}{children}</span>
  )
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs space-y-1.5 ${verb.ok ? 'border-border bg-card' : 'border-red-500/40 bg-red-500/5'}`} data-verbindung>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Z ok={verb.online}><Wifi size={12} />{verb.online ? 'online' : 'nicht erreichbar'}</Z>
        <Z ok={verb.winrm}>WinRM {verb.winrm ? 'aktiv' : 'nicht verfügbar'}</Z>
        {verb.ok && <Z ok={!!verb.benutzer} warn={!verb.benutzer}><User size={12} />{verb.benutzer
          ? <>angemeldet: {person ? <span className="inline-flex items-center gap-1 font-semibold text-foreground">{person.displayName}<PersonInfoButton name={person.displayName} sam={person.sam} /></span> : null} <span className="font-mono">{verb.benutzer}</span>{person?.department ? ` · ${person.department}` : ''}</>
          : 'niemand angemeldet — Schritte im Benutzerkontext gehen dann nicht'}</Z>}
        {verb.gesperrt && <span className="inline-flex items-center gap-1 text-amber-600"><Lock size={12} />Bildschirm gesperrt</span>}
        {verb.sitzung === 'RDP' && <span className="text-muted-foreground">per Remotedesktop</span>}
        <button onClick={onNeu} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground underline">neu prüfen</button>
      </div>
      {verb.ok && (verb.modell || verb.os) && <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5"><Monitor size={11} />{[verb.modell, verb.os, verb.ip, verb.boot && `Neustart ${new Date(verb.boot).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`].filter(Boolean).join(' · ')}</p>}
      {verb.fehler && <p className="text-[11px] text-red-600 dark:text-red-400">{verb.fehler}</p>}
    </div>
  )
}

/** Ergebnis des letzten Befehls-Tests (Einstellungen → Befehls-Test) für diesen Baustein. */
function TestStempel({ t }: { t?: BtStand[string] }) {
  if (!t) return null
  const wann = `auf ${t.pc} am ${new Date(t.am).toLocaleDateString('de-DE')}`
  if (t.s === 'ok') return <span className="text-[9px] px-1.5 py-px rounded-full border border-emerald-500/40 text-emerald-600 dark:text-emerald-400" title={`Auf dem Test-PC erfolgreich getestet (${wann})`}>getestet ✓</span>
  if (t.s === 'na' || t.s === 'meldung') return <span className="text-[9px] px-1.5 py-px rounded-full border border-amber-500/40 text-amber-600 dark:text-amber-400" title={`Test ${wann}: ${t.t || ''}`}>getestet (Hinweis)</span>
  return <span className="text-[9px] px-1.5 py-px rounded-full border border-red-500/40 text-red-600 dark:text-red-400" title={`Test ${wann} fehlgeschlagen: ${t.t || ''}`}>Test fehlgeschlagen</span>
}

function ProblemDetail({ problem, pc, verb, person, ersatz, by, onZurueck, onWerkzeug, onAusgefuehrt, vorbelegung, alternativen = [], versucht = [], onBehoben, onNaechstes, onLoesungId }: {
  problem: PaProblem; pc: PcWahl | null; verb: PaVerbindung | null; person: AdUserListItem | null; ersatz?: DgErsatzBenutzer | null; by: string; vorbelegung?: string
  onZurueck: () => void; onWerkzeug: (id: string, host: string) => void; onAusgefuehrt?: (id: string) => void
  alternativen?: PaProblem[]; versucht?: string[]; onBehoben?: (id: string) => void; onNaechstes?: (p: PaProblem) => void; onLoesungId?: (id: string) => void
}) {
  const [behoben, setBehoben] = useState<null | 'ja' | 'nein'>(null)
  const [bereichsDg, setBereichsDg] = useState(false)
  const [an, setAn] = useState<Set<number>>(() => new Set(problem.schritte.map((s, i) => (!s.optional && !s.aktion.startsWith('werkzeug:') ? i : -1)).filter(i => i >= 0)))
  const [eingabe, setEingabe] = useState(vorbelegung || '')
  const [nachrichtAn, setNachrichtAn] = useState(false)
  const name = person?.displayName || ''
  const [nachricht, setNachricht] = useState(() => {
    const v = vorname(name)
    return `${v ? 'Hallo ' + v + ', ' : ''}${problem.nachricht || `die IT hat sich um „${problem.titel}“ gekümmert. Bei Fragen melden Sie sich gerne.`}`
  })
  const [lauf, setLauf] = useState<Record<number, SchrittLauf>>({})
  const [laeuft, setLaeuft] = useState(false)
  const [frage, setFrage] = useState(false)
  const [fertig, setFertig] = useState<{ ok: number; fehler: number; geaendert: number; msg?: { ok: boolean; info: string } } | null>(null)
  const [offen, setOffen] = useState<Set<number>>(new Set())
  const testStand = useTestStand()

  const host = pc?.host || ''
  const gewaehlt = problem.schritte.map((s, i) => ({ s, i, a: aktion(s.aktion) })).filter(x => x.a && an.has(x.i))
  // PC nicht erreichbar: AD-Prüfungen (Art „lokal“, laufen am Admin-PC) gehen trotzdem — für die zugewiesene Person
  const adSam = verb?.benutzer || (ersatz ? ersatz.sam : '')
  const offline = !!verb && !verb.ok
  const lokalGewaehlt = gewaehlt.filter(x => x.a!.modus === 'lokal')
  const laufen = offline ? lokalGewaehlt : gewaehlt
  const kritisch = laufen.some(x => x.a!.risiko === 'kritisch')
  const aendernd = laufen.some(x => x.a!.risiko !== 'lesen')
  const brauchtEingabe = !!problem.frage && laufen.some(x => x.s.param?.includes('{eingabe}'))
  const ohneBenutzer = !offline && !verb?.benutzer && gewaehlt.some(x => x.a!.modus === 'profil' || x.a!.modus === 'benutzer')
  const nurAd = offline && lokalGewaehlt.length > 0 && !!adSam
  const grund = !host ? 'Erst den Ziel-PC wählen.' : !verb ? 'Verbindung wird geprüft …' : offline && !nurAd ? (lokalGewaehlt.length ? 'Der PC ist nicht erreichbar und ihm ist keine Person zugeordnet.' : 'Der PC ist nicht erreichbar.') : !gewaehlt.length && !nachrichtAn ? 'Keinen Schritt ausgewählt.' : brauchtEingabe && !eingabe.trim() ? `Bitte „${problem.frage!.label}“ angeben.` : ''
  const param = (s: PaSchritt) => (s.param || '').replace(/\{eingabe\}/g, eingabe.trim())

  async function ausfuehren() {
    setFrage(false); setLaeuft(true); setFertig(null)
    const stand: Record<number, SchrittLauf> = {}
    for (const x of gewaehlt) stand[x.i] = { status: 'offen' }
    setLauf({ ...stand })
    let ok = 0, fehler = 0, geaendert = 0
    const erledigt: string[] = []
    for (const x of gewaehlt) {
      if (offline && x.a!.modus !== 'lokal') { stand[x.i] = { status: 'uebersprungen' }; setLauf({ ...stand }); continue }
      stand[x.i] = { status: 'laeuft' }; setLauf({ ...stand })
      const erg = await fuehreAus(host, x.a!, param(x.s), { sam: x.a!.modus === 'lokal' ? adSam : verb?.benutzer })
      stand[x.i] = { status: erg.ok ? 'ok' : 'fehler', erg }; setLauf({ ...stand })
      if (erg.ok) { ok++; if (x.a!.risiko !== 'lesen') { geaendert++; erledigt.push(x.s.titel || x.a!.titel) } } else fehler++
    }
    let msg: { ok: boolean; info: string } | undefined
    if (nachrichtAn && nachricht.trim() && !offline) msg = await sendeDesktopNachricht(host, nachricht.trim())
    if (erledigt.length) {
      const text = `Problem-Assistent: „${problem.titel}“ — ${erledigt.join(', ')}${fehler ? ` (${fehler} Schritt(e) mit Fehler)` : ''}`
      void logDeviceAction(host, pc?.serial, text, by, 'Problem-Assistent', { ohneProtokoll: true })
      void import('../services/aktivitaet').then(m => m.protokolliere({ art: 'manuell', quelle: 'Gib dein Problem ein', aktion: `Lösung ausgeführt: ${problem.titel}`, ziel: host.toUpperCase(), ergebnis: `${ok} ok · ${fehler} Fehler`, details: erledigt }))
      if (name) void logDossierAction(name, person?.sam, `${text} · auf ${host}`, by, 'Problem-Assistent')
    }
    setFertig({ ok, fehler, geaendert, msg }); setLaeuft(false)
    if (ok > 0) onAusgefuehrt?.(problem.id)
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm" data-problem-detail>
      <div className="px-4 py-3 border-b border-border flex items-start gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">{problem.titel}</p>
          <p className="text-[11px] text-muted-foreground">{problem.bereich}</p>
        </div>
        <button onClick={onZurueck} className="ml-auto text-xs text-muted-foreground hover:text-foreground underline shrink-0">anderes Problem</button>
      </div>
      <div className="p-4 space-y-3 text-sm">
        <div className="grid sm:grid-cols-2 gap-3">
          <div><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Typische Ursache</p><p className="text-foreground text-[13px]">{problem.ursache}</p></div>
          <div><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Lösung</p><p className="text-foreground text-[13px]">{problem.loesung}</p></div>
        </div>
        {problem.hinweis && <p className="text-xs text-sky-700 dark:text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded px-2.5 py-1.5 flex gap-1.5"><Info size={13} className="mt-0.5 shrink-0" />{problem.hinweis}</p>}
        {problem.servicenow && (
          <div className="flex items-center gap-2 flex-wrap text-xs rounded border border-sky-500/30 px-2.5 py-1.5" data-problem-servicenow>
            <span className="text-muted-foreground">In ServiceNow:</span>
            <span className="text-foreground">{problem.servicenow.wozu}</span>
            <button onClick={() => { void import('../serviceNowWelt/oeffnen').then(m => m.oeffneSnEintrag(problem.servicenow!.name)) }}
              className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-sky-500/40 text-sky-700 dark:text-sky-300 hover:bg-sky-500/10" title={problem.servicenow.name}>
              <ExternalLink size={12} />{problem.servicenow.name.length > 48 ? problem.servicenow.name.slice(0, 46) + ' …' : problem.servicenow.name}
            </button>
          </div>
        )}
        {problem.frage && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">{problem.frage.label}</label>
            <input value={eingabe} onChange={e => setEingabe(e.target.value)} placeholder={problem.frage.platzhalter} data-problem-frage
              list={problem.frage.art === 'drucker' ? 'pa-druckerliste' : undefined} spellCheck={false}
              className={`w-full px-3 py-2 text-sm rounded-md border bg-background ${problem.frage.art === 'drucker' ? 'font-mono' : ''} ${brauchtEingabe && !eingabe.trim() ? 'border-amber-500' : 'border-border'}`} />
            {problem.frage.art === 'drucker' && <DruckerVorschlaege eingabe={eingabe} onWahl={setEingabe} />}
            {problem.frage.vorlagen?.length ? <div className="flex flex-wrap gap-1">{problem.frage.vorlagen.map(v => <button key={v} onClick={() => setEingabe(v)} className="text-[11px] px-2 py-0.5 rounded border border-border hover:bg-accent/30 font-mono">{v}</button>)}</div> : null}
          </div>
        )}

        <div className="space-y-1.5" data-problem-schritte>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Schritte</p>
          {problem.schritte.map((s, i) => {
            if (s.aktion.startsWith('werkzeug:')) {
              const w = WERKZEUGE[s.aktion.slice(9)]
              return (
                <div key={i} className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2">
                  <Wrench size={14} className="text-primary shrink-0" />
                  <span className="min-w-0"><span className="block text-[13px] text-foreground">{s.titel || w?.titel}</span><span className="block text-[11px] text-muted-foreground">{w?.beschreibung}</span></span>
                  <button onClick={() => onWerkzeug(s.aktion.slice(9), host)} className="ml-auto shrink-0 inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/10"><ExternalLink size={12} />öffnen</button>
                </div>
              )
            }
            const a = aktion(s.aktion)
            if (!a) return null
            const l = lauf[i]
            const p = param(s)
            return (
              <div key={i} className={`rounded-md border px-3 py-2 ${an.has(i) ? 'border-primary/40 bg-primary/[0.03]' : 'border-border'}`}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={an.has(i)} disabled={laeuft} onChange={() => setAn(x => { const n = new Set(x); n.has(i) ? n.delete(i) : n.add(i); return n })} className="mt-1 accent-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[13px] text-foreground">{s.titel || a.titel}</span>
                      <span className={`text-[9px] px-1.5 py-px rounded-full border ${RISIKO[a.risiko].cls}`}>{RISIKO[a.risiko].text}</span>
                      <span className="text-[9px] px-1.5 py-px rounded-full border border-border text-muted-foreground">{MODUS[a.modus]}</span>
                      <TestStempel t={testStand['pa:' + a.id]} />
                      {s.optional && <span className="text-[9px] text-muted-foreground">optional</span>}
                      {p && <span className="text-[10px] font-mono px-1.5 rounded bg-muted/50 text-muted-foreground">{p}</span>}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">{a.beschreibung}</span>
                  </span>
                  {l && <span className="shrink-0 mt-0.5">{l.status === 'laeuft' ? <Loader2 size={15} className="animate-spin text-primary" /> : l.status === 'ok' ? <CheckCircle2 size={15} className="text-emerald-500" /> : l.status === 'fehler' ? <XCircle size={15} className="text-red-500" /> : <MinusCircle size={15} className="text-muted-foreground/50" />}</span>}
                </div>
                {l?.erg && (
                  <div className="mt-1.5 ml-6">
                    {l.erg.fehler && <p className="text-[11px] text-red-600 dark:text-red-400">{l.erg.fehler}</p>}
                    {l.erg.zeilen.length > 0 && (
                      <>
                        <pre className="text-[11px] whitespace-pre-wrap font-mono text-foreground/90 bg-muted/30 rounded px-2 py-1 max-h-48 overflow-auto">{(offen.has(i) ? l.erg.zeilen : l.erg.zeilen.slice(0, 8)).join('\n')}</pre>
                        {l.erg.zeilen.length > 8 && <button onClick={() => setOffen(o => { const n = new Set(o); n.has(i) ? n.delete(i) : n.add(i); return n })} className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"><ChevronDown size={11} className={offen.has(i) ? 'rotate-180' : ''} />{offen.has(i) ? 'weniger' : `alle ${l.erg.zeilen.length} Zeilen`}</button>}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Optional: Treiber prüfen (WLAN, Netzwerk, Audio/Kamera, Grafik/Dock, Hardware) */}
        {rechteRelevant(problem) && <RechteCheck host={host} verb={verb} ersatz={ersatz} />}
        {treiberRelevant(problem) && <TreiberCheck host={host} problem={problem} by={by} />}

        {/* Desktop-Nachricht */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input type="checkbox" checked={nachrichtAn} onChange={e => setNachrichtAn(e.target.checked)} className="accent-primary" data-nachricht-an />
            <Send size={13} className="text-primary" />Dem Benutzer zusätzlich eine Desktop-Nachricht schicken
          </label>
          {nachrichtAn && <textarea value={nachricht} onChange={e => setNachricht(e.target.value.slice(0, 900))} rows={3} data-nachricht-text
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background text-foreground" />}
        </div>

        {ohneBenutzer && <p className="text-xs text-amber-600 flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" />Niemand ist angemeldet — Schritte im Benutzerprofil/in der Sitzung des Benutzers werden fehlschlagen.</p>}

        {frage && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs space-y-2" data-problem-bestaetigung>
            <p className="flex gap-1.5 text-foreground"><ShieldAlert size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <span>{gewaehlt.length} Schritt(e) auf <b>{host}</b> ausführen{verb?.benutzer ? <> (Benutzer {name || verb.benutzer})</> : ''}?
                {kritisch && <> <b className="text-red-600 dark:text-red-400">Achtung, kritisch:</b> {gewaehlt.filter(x => x.a!.risiko === 'kritisch').map(x => x.s.titel || x.a!.titel).join(', ')}.</>}
                {gewaehlt.some(x => x.a!.trenntVerbindung) && ' Die Verbindung zum PC ist dabei kurz weg.'}
                {nachrichtAn && ' Danach geht die Desktop-Nachricht raus.'}</span></p>
            <div className="flex gap-2">
              <button onClick={() => void ausfuehren()} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-semibold">Ja, ausführen</button>
              <button onClick={() => setFrage(false)} className="px-3 py-1.5 rounded-md border border-border text-muted-foreground">Abbrechen</button>
            </div>
          </div>
        )}

        {fertig && (
          <div className={`rounded-md border px-3 py-2 text-xs space-y-1 ${fertig.fehler ? 'border-amber-500/40 bg-amber-500/5' : 'border-emerald-500/40 bg-emerald-500/5'}`} data-problem-ergebnis>
            <p className="font-semibold text-foreground">{fertig.fehler ? `${fertig.ok} von ${fertig.ok + fertig.fehler} Schritten erfolgreich` : `Alle ${fertig.ok} Schritte erfolgreich`}{fertig.geaendert ? ` · ${fertig.geaendert} Änderung(en) — im Geräte-${name ? ' und Personen-' : ''}Dossier vermerkt` : ''}</p>
            {fertig.msg && <p className={fertig.msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{fertig.msg.ok ? 'Desktop-Nachricht wurde angezeigt.' : `Desktop-Nachricht ging nicht raus: ${fertig.msg.info}`}</p>}
          </div>
        )}
        {fertig && fertig.geaendert > 0 && host && (
          <MonitorAngebot host={host} serial={pc?.serial} person={name || pc?.person} vorschlag={problem.ueberwachen?.length ? problem.ueberwachen : ['erreichbar']}
            anlass={`Nach „${problem.titel}“ (${new Date().toLocaleDateString('de-DE')}, Problem-Assistent)`} />
        )}

        {/* Nach der Lösung: behoben? Wenn nicht → nächste Möglichkeiten + komplette Bereichsdiagnose */}
        {fertig && !laeuft && behoben === null && (
          <div className="rounded-lg border-2 border-primary/40 bg-primary/5 px-3 py-2.5 flex items-center gap-2 flex-wrap" data-problem-behoben-frage>
            <span className="text-sm font-semibold text-foreground mr-auto">Ist das Problem jetzt behoben?</span>
            <button onClick={() => { setBehoben('ja'); onBehoben?.(problem.id) }} data-behoben-ja className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"><CheckCircle2 size={13} />Ja, behoben</button>
            <button onClick={() => setBehoben('nein')} data-behoben-nein className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-red-500/50 text-red-700 dark:text-red-300 text-xs font-semibold hover:bg-red-500/10"><XCircle size={13} />Nein, noch nicht</button>
          </div>
        )}
        {behoben === 'ja' && (
          <p className="text-xs text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5" data-problem-behoben><CheckCircle2 size={13} />Prima. Gemerkt: Bei ähnlicher Eingabe schlägt der Assistent diese Lösung künftig zuerst vor.</p>
        )}
        {behoben === 'nein' && (
          <div className="space-y-3 rounded-lg border border-border bg-card p-3" data-problem-weiter>
            <p className="text-sm font-semibold text-foreground">Dann suchen wir weiter.</p>
            {alternativen.length ? (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Weitere Möglichkeiten</p>
                {alternativen.map((a, i) => (
                  <button key={a.id} onClick={() => onNaechstes?.(a)} data-alternative className="w-full text-left rounded-md border border-border px-3 py-2 hover:border-primary/50 hover:bg-primary/5 flex items-start gap-2">
                    <span className="text-[11px] font-bold text-primary mt-0.5 shrink-0">{i + 2}.</span>
                    <span className="min-w-0">
                      <span className="block text-sm text-foreground">{a.titel}</span>
                      <span className="block text-[11px] text-muted-foreground line-clamp-2">{a.ursache}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">Im Katalog gibt es keine weitere passende Möglichkeit.</p>}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ursache gezielt suchen</p>
              {!bereichsDg ? (
                <button onClick={() => setBereichsDg(true)} disabled={!host || !verb} data-bereichs-diagnose-start
                  className="w-full text-left rounded-md border-2 border-violet-500/40 px-3 py-2 hover:bg-violet-500/5 disabled:opacity-50">
                  <span className="block text-sm font-medium text-violet-700 dark:text-violet-300">Komplette Diagnose „{problem.bereich}“ starten</span>
                  <span className="block text-[11px] text-muted-foreground">Liest alles zu diesem Bereich auf dem PC aus – Ereignisanzeige, Abstürze, Einstellungen, Dienste, Treiber, Netz – und zeigt zu jedem Befund die Lösung. Ändert nichts.</span>
                </button>
              ) : (
                <Suspense fallback={<p className="text-xs text-muted-foreground inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" />Diagnose wird geladen …</p>}>
                  <BereichsDiagnose bereich={problem.bereich} host={host} verb={verb} ersatz={ersatz} versucht={[...versucht, problem.id]} onLoesung={id => onLoesungId?.(id)} />
                </Suspense>
              )}
            </div>
            <button onClick={() => { void import('../serviceNowWelt/oeffnen').then(m => m.oeffneSnEintrag('Create Incident - Field Service')) }} className="text-[11px] text-muted-foreground hover:text-foreground underline">
              Immer noch nicht gelöst? Ticket in ServiceNow anlegen
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <span className="text-xs text-muted-foreground">{grund || (nurAd ? `PC nicht erreichbar – es laufen nur die ${lokalGewaehlt.length} AD-Prüfung(en) für ${verb?.benutzer || ersatz?.name}` : aendernd ? `${gewaehlt.length} Schritt(e) gewählt` : `${gewaehlt.length} prüfende(r) Schritt(e)`)}</span>
          <button onClick={() => { if (!aendernd && !nachrichtAn) void ausfuehren(); else setFrage(true) }} disabled={!!grund || laeuft} data-problem-ausfuehren
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 shadow-sm">
            {laeuft ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}{laeuft ? 'Läuft …' : fertig ? 'Erneut ausführen' : aendernd ? 'Lösung ausführen' : 'Prüfen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Druckername: Vorschläge aus dem Drucker-Bestand (Name · IP · Standort) ───
let druckerCache: Promise<DruckerZiel[]> | null = null
function DruckerVorschlaege({ eingabe, onWahl }: { eingabe: string; onWahl: (n: string) => void }) {
  const [liste, setListe] = useState<DruckerZiel[] | null>(null)
  useEffect(() => {
    if (!druckerCache) druckerCache = ladeDruckerListe().catch(() => [])
    let weg = false
    void druckerCache.then(l => { if (!weg) setListe(l) })
    return () => { weg = true }
  }, [])
  const t = eingabe.trim().toLowerCase().replace(/^.*\\/, '')
  const genau = liste?.find(d => d.name.toLowerCase() === t)
  const treffer = !t || !liste ? [] : liste.filter(d => d.name.toLowerCase() !== t && [d.name, d.ip, d.standort || ''].some(x => x.toLowerCase().includes(t))).slice(0, 8)
  return (
    <>
      <datalist id="pa-druckerliste">{(liste || []).map(d => <option key={d.name} value={d.name}>{[d.ip, d.standort].filter(Boolean).join(' · ')}</option>)}</datalist>
      {genau && <p className="text-[11px] text-emerald-600 dark:text-emerald-400" data-drucker-genau>Bekannter Drucker: <span className="font-mono">{genau.name}</span>{genau.ip ? ` · ${genau.ip}` : ''}{genau.standort ? ` · ${genau.standort}` : ''}</p>}
      {treffer.length > 0 && (
        <div className="flex flex-wrap gap-1" data-drucker-vorschlaege>
          {treffer.map(d => (
            <button key={d.name} onClick={() => onWahl(d.name)} title={[d.ip, d.standort].filter(Boolean).join(' · ')}
              className="text-[11px] px-2 py-0.5 rounded border border-border hover:bg-accent/30"><span className="font-mono">{d.name}</span>{d.standort ? <span className="text-muted-foreground"> · {d.standort}</span> : null}</button>
          ))}
        </div>
      )}
    </>
  )
}
