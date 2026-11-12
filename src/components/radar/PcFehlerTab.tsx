// ── Proaktives Radar → PC-Fehler ─────────────────────────────────────────────
// Alle PCs, bei denen die Proaktive Fehlersuche (eigener Hintergrund-Scan) ein bekanntes
// Fehlerbild gefunden hat — jeweils mit Lösungsweg aus „Gib dein Problem ein“.
//   „Lösung öffnen“  springt mit PC und Problem in den Assistenten (volle Kontrolle).
//   „Beheben“        führt nur die Schritte aus, die der Benutzer NICHT bemerkt (kein Fenster,
//                    nichts wird geschlossen oder neu gestartet) — einzeln oder für alle
//                    auf einmal, immer hinter PIN 0506 und mit Vorschau.
// Ist ein PC nicht erreichbar, wird die Behebung vorgemerkt und alle 2 Stunden nachgeholt.

import { Fragment, useEffect, useMemo, useState } from 'react'
import { Loader2, Search, ChevronRight, ChevronDown, Play, AlertTriangle, AlertOctagon, Info, RefreshCw, X, Wrench, Clock, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react'
import { DeviceInfoButton } from '../device/DeviceDossier'
import { PersonInfoButton } from '../person/PersonDossier'
import { usePinSperre } from '../netzwerkgeraete/zugang'
import { useAppStore } from '../../store/appStore'
import { useAuthStore } from '../../store/authStore'
import { loadDevices } from '../../services/endpointDevices'
import { ladeUebersicht, ladePcFehler, markiereBehoben, type PcFehlerUebersicht, type PcFehlerDatei } from '../../pcFehler/speicher'
import { schwerste, SCHWERE_RANG, type Befund } from '../../pcFehler/auswertung'
import type { Schwere } from '../../pcFehler/katalog'
import { planeFix, fuehreFixAus, sindOnline, type FixPlan } from '../../pcFehler/beheben'
import { ladeWarteliste, merkeVor, streiche, type Warteliste } from '../../pcFehler/warteliste'
import { PC_FEHLER_ID } from '../../pcFehler/lauf'
import { usePaVorgabe } from '../../problemAssistent/vorgabe'
import { ladeIndex } from '../../problemAssistent/ProblemAssistent'
import { erkenne, type PaIndex } from '../../problemAssistent/suche'
import { KERNPROBLEME } from '../../problemAssistent/katalog'
import type { PaProblem } from '../../problemAssistent/types'
import { ladeTestStand } from '../../befehlsTest/stand'
import type { BtStand } from '../../befehlsTest/types'
import { getScanSchedule, describeSchedule } from '../../services/scanSchedules'

const SCHWERE: Record<Schwere, { text: string; cls: string; punkt: string }> = {
  hoch: { text: 'hoch', cls: 'border-red-500/50 text-red-500 bg-red-500/10', punkt: 'bg-red-500' },
  mittel: { text: 'mittel', cls: 'border-amber-500/50 text-amber-600 bg-amber-500/10', punkt: 'bg-amber-500' },
  niedrig: { text: 'niedrig', cls: 'border-border text-muted-foreground bg-muted/40', punkt: 'bg-muted-foreground/60' },
}
const d2 = (n: number) => String(n).padStart(2, '0')
const zeit = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '—' : `${d2(d.getDate())}.${d2(d.getMonth() + 1)}. ${d2(d.getHours())}:${d2(d.getMinutes())}` }

interface Zeile { host: string; am: string; befunde: Befund[]; unbekannt: number; person: string; serial: string; schwere: Schwere }
type Lauf = { status: 'laeuft' | 'erledigt' | 'fehler' | 'vorgemerkt'; zeilen: string[] }
const lk = (host: string, key: string) => `${host}|${key}`

export default function PcFehlerTab({ onCount }: { onCount?: (n: number | null) => void }) {
  const setScreen = useAppStore(s => s.setScreen)
  const user = useAuthStore(s => s.session?.user)
  const by = user?.displayName || user?.username || 'unbekannt'
  const { mitPin, pinDialog } = usePinSperre('Fehler aus dem Proaktiven Radar beheben – nur mit PIN.')
  const [daten, setDaten] = useState<PcFehlerUebersicht | null>(null)
  const [geraete, setGeraete] = useState<Map<string, { person: string; serial: string }>>(new Map())
  const [laedt, setLaedt] = useState(true)
  const [fehler, setFehler] = useState('')
  const [index, setIndex] = useState<PaIndex | null>(null)
  const [test, setTest] = useState<BtStand>({})
  const [warte, setWarte] = useState<Warteliste | null>(null)
  const [q, setQ] = useState('')
  const [stufe, setStufe] = useState<Schwere | 'alle'>('alle')
  const [nurBefund, setNurBefund] = useState('')
  const [offen, setOffen] = useState<Set<string>>(new Set())
  const [details, setDetails] = useState<Record<string, PcFehlerDatei | null>>({})
  const [zeitplan, setZeitplan] = useState('')
  const [lauf, setLauf] = useState<Record<string, Lauf>>({})
  const [sammel, setSammel] = useState(false)

  const laden = () => {
    setLaedt(true); setFehler('')
    void Promise.all([ladeUebersicht(), loadDevices().catch(() => []), ladeWarteliste()]).then(([u, dev, w]) => {
      if (!u) setFehler('Das Netzlaufwerk ist nicht erreichbar – die Fehlerliste konnte nicht geladen werden.')
      setDaten(u); setWarte(w)
      const m = new Map<string, { person: string; serial: string }>()
      for (const d of dev) { const h = (d.hostname || '').trim().split('.')[0].toUpperCase(); if (h && !m.has(h)) m.set(h, { person: d.assignedTo || '', serial: d.serial || '' }) }
      setGeraete(m)
    }).finally(() => setLaedt(false))
  }
  useEffect(() => {
    laden()
    void getScanSchedule(PC_FEHLER_ID).then(c => setZeitplan(describeSchedule(c))).catch(() => {})
    void ladeTestStand().then(setTest)
  }, [])
  // Lösungswege kommen aus dem Problem-Katalog (wird im Hintergrund vorbereitet)
  useEffect(() => { let weg = false; void ladeIndex().then(ix => { if (!weg) setIndex(ix) }); return () => { weg = true } }, [])

  const zeilen = useMemo<Zeile[]>(() => {
    const aus: Zeile[] = []
    for (const [host, e] of Object.entries(daten?.pcs || {})) {
      if (!e?.befunde?.length) continue
      const g = geraete.get(host)
      aus.push({ host, am: e.am, befunde: e.befunde, unbekannt: e.unbekannt || 0, person: g?.person || '', serial: g?.serial || '', schwere: schwerste(e.befunde) || 'niedrig' })
    }
    return aus.sort((a, b) => SCHWERE_RANG[a.schwere] - SCHWERE_RANG[b.schwere] || b.befunde.length - a.befunde.length || a.host.localeCompare(b.host))
  }, [daten, geraete])
  useEffect(() => { onCount?.(daten ? zeilen.length : null) }, [daten, zeilen.length, onCount])

  // Lösungsweg je Suchtext — einmal ermittelt
  const loesungen = useMemo(() => {
    const m = new Map<string, PaProblem | null>()
    if (!index) return m
    for (const z of zeilen) for (const b of z.befunde) {
      if (m.has(b.suche)) continue
      const e = erkenne(index, b.suche, { kern: KERNPROBLEME })
      m.set(b.suche, e.vorschlag?.p || e.treffer[0]?.p || null)
    }
    return m
  }, [index, zeilen])

  // Was lässt sich je Befund unbemerkt beheben?
  const plaene = useMemo(() => {
    const m = new Map<string, FixPlan>()
    for (const z of zeilen) for (const b of z.befunde) {
      if (b.regel !== 'laufwerk-i' && !index) continue
      m.set(lk(z.host, b.key), planeFix(z.host, z.serial || undefined, b, loesungen.get(b.suche), test))
    }
    return m
  }, [zeilen, loesungen, test, index])
  const wartet = useMemo(() => new Map((warte?.wartend || []).map(e => [lk(e.plan.host.split('.')[0].toUpperCase(), e.plan.befundKey), e])), [warte])

  // Häufung: derselbe Befund auf mehreren PCs
  const haeufung = useMemo(() => {
    const m = new Map<string, { titel: string; schwere: Schwere; pcs: number }>()
    for (const z of zeilen) for (const b of z.befunde) {
      const x = m.get(b.titel) || { titel: b.titel, schwere: b.schwere, pcs: 0 }
      x.pcs++; if (SCHWERE_RANG[b.schwere] < SCHWERE_RANG[x.schwere]) x.schwere = b.schwere
      m.set(b.titel, x)
    }
    return [...m.values()].sort((a, b) => b.pcs - a.pcs || SCHWERE_RANG[a.schwere] - SCHWERE_RANG[b.schwere])
  }, [zeilen])

  const sicht = useMemo(() => {
    const t = q.trim().toLowerCase()
    return zeilen.filter(z =>
      (stufe === 'alle' || z.befunde.some(b => b.schwere === stufe)) &&
      (!nurBefund || z.befunde.some(b => b.titel === nurBefund)) &&
      (!t || [z.host, z.person, z.serial, ...z.befunde.map(b => b.titel)].some(x => x.toLowerCase().includes(t))))
  }, [zeilen, q, stufe, nurBefund])

  // Für das Sammel-Auslösen: alles, was in der aktuellen Ansicht unbemerkt behebbar ist und nicht schon wartet
  const behebbar = useMemo(() => {
    const aus: FixPlan[] = []
    for (const z of sicht) for (const b of z.befunde) {
      if (nurBefund && b.titel !== nurBefund) continue
      const p = plaene.get(lk(z.host, b.key))
      if (p?.schritte.length && !wartet.has(lk(z.host, b.key)) && lauf[lk(z.host, b.key)]?.status !== 'erledigt') aus.push(p)
    }
    return aus
  }, [sicht, plaene, wartet, lauf, nurBefund])

  const klappe = (host: string) => {
    setOffen(o => { const n = new Set(o); n.has(host) ? n.delete(host) : n.add(host); return n })
    if (!(host in details)) void ladePcFehler(host).then(d => setDetails(x => ({ ...x, [host]: d })))
  }
  const loese = (z: Zeile, b: Befund) => {
    usePaVorgabe.getState().setze({ host: z.host, serial: z.serial || undefined, person: z.person || undefined, suche: b.suche, problemId: loesungen.get(b.suche)?.id })
    setScreen('home')
  }

  /** Einen Plan ausführen; nicht erreichbar → Warteliste. `online` = schon geprüft (Sammellauf). */
  async function behebe(p: FixPlan, online?: boolean): Promise<Lauf['status']> {
    const k = lk(p.host, p.befundKey)
    setLauf(l => ({ ...l, [k]: { status: 'laeuft', zeilen: [] } }))
    const r = await fuehreFixAus(p, by, online)
    let status: Lauf['status'] = r.status === 'erledigt' ? 'erledigt' : 'fehler'
    let zeilenAus = r.zeilen
    if (r.status === 'offline') {
      const ok = await merkeVor(p, by)
      status = ok ? 'vorgemerkt' : 'fehler'
      zeilenAus = ok ? ['PC nicht erreichbar – vorgemerkt. Alle 2 Stunden wird geprüft, ob er online ist; dann läuft die Behebung von selbst.'] : ['PC nicht erreichbar und die Vormerkung ließ sich nicht speichern.']
    } else if (r.status === 'erledigt') await markiereBehoben(p.host, p.befundKey)
    setLauf(l => ({ ...l, [k]: { status, zeilen: zeilenAus } }))
    return status
  }

  if (laedt && !daten) return <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />Lade Fehlerliste …</div>
  const anzahl = (s: Schwere) => zeilen.filter(z => z.befunde.some(b => b.schwere === s)).length

  return (
    <div className="space-y-3" data-pc-fehler>
      <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground flex gap-2">
        <Info size={14} className="mt-0.5 shrink-0 text-primary" />
        <span>
          Die <b className="text-foreground">Proaktive Fehlersuche</b> ({zeitplan || 'werktags'}) liest von jedem genutzten PC die Fehler der letzten 7 Tage aus allen Windows-Ereignisprotokollen und prüft, ob Laufwerk I: verbunden ist – nur lesend und für den Benutzer unsichtbar.
          Hier stehen nur PCs mit einem <b className="text-foreground">bekannten Fehlerbild</b>; das übliche Rauschen der Protokolle ist ausgeblendet.
          {daten?.stand ? <> Stand: <b className="text-foreground">{zeit(daten.stand)}</b>{daten.gelesen != null ? <> · {daten.gelesen} PCs gelesen, {zeilen.length} mit Befund</> : null}.</> : ' Es liegt noch kein Lauf vor.'}
        </span>
      </div>
      {fehler && <p className="text-xs text-red-500 flex gap-1.5"><AlertTriangle size={13} className="mt-0.5" />{fehler}</p>}

      {/* Warteliste: Behebungen für PCs, die nicht erreichbar waren */}
      {!!warte?.wartend.length && (
        <div className="rounded-md border border-sky-500/40 bg-sky-500/5 px-3 py-2 text-xs space-y-1" data-fehler-warteliste>
          <p className="font-semibold text-foreground inline-flex items-center gap-1.5"><Clock size={13} className="text-sky-500" />{warte.wartend.length} Behebung(en) warten auf einen PC, der gerade nicht erreichbar ist – alle 2 Stunden wird nachgesehen</p>
          <ul className="space-y-0.5">
            {warte.wartend.map(e => (
              <li key={e.id} className="flex items-center gap-2 text-muted-foreground">
                <span className="font-mono text-foreground">{e.plan.host}</span><span>{e.plan.befundTitel}</span>
                <span>· seit {zeit(e.angelegtAm)} · {e.versuche} Versuch(e) · von {e.von}</span>
                <button onClick={() => void streiche(e.id).then(laden)} className="ml-auto text-[11px] underline hover:text-foreground">streichen</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Häufung: derselbe Fehler auf mehreren PCs */}
      {haeufung.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-fehler-haeufung>
          <span className="text-[11px] text-muted-foreground">Häufigste Befunde:</span>
          {haeufung.slice(0, 8).map(h => (
            <button key={h.titel} onClick={() => setNurBefund(x => (x === h.titel ? '' : h.titel))} title="Nur PCs mit diesem Befund zeigen"
              className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border ${nurBefund === h.titel ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:bg-accent/30'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${SCHWERE[h.schwere].punkt}`} />{h.titel}<span className="opacity-70 tabular-nums">{h.pcs} PC{h.pcs === 1 ? '' : 's'}</span>
            </button>
          ))}
          {nurBefund && <button onClick={() => setNurBefund('')} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"><X size={11} />Filter aufheben</button>}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="PC, Person oder Fehler suchen …" spellCheck={false} data-fehler-suche
            className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground w-64 focus:outline-none focus:border-primary" />
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/30 text-xs">
          {(['alle', 'hoch', 'mittel', 'niedrig'] as const).map(s => (
            <button key={s} onClick={() => setStufe(s)} data-fehler-stufe={s}
              className={`px-2.5 py-1 rounded ${stufe === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {s === 'alle' ? `Alle (${zeilen.length})` : `${SCHWERE[s].text} (${anzahl(s)})`}
            </button>
          ))}
        </div>
        <button onClick={() => mitPin(() => setSammel(true))} disabled={!behebbar.length} data-fehler-sammel
          title={behebbar.length ? 'Alle angezeigten Fehler beheben, soweit das unbemerkt geht – mit Vorschau' : 'In dieser Ansicht lässt sich nichts unbemerkt beheben'}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-40">
          <ShieldCheck size={13} />Alle beheben ({behebbar.length}) …
        </button>
        <button onClick={laden} disabled={laedt} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
          {laedt ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Neu laden
        </button>
      </div>

      {zeilen.length === 0 ? (
        <p className="py-14 text-center text-sm text-muted-foreground" data-fehler-leer>
          {daten?.stand ? 'Bei keinem gelesenen PC wurde ein bekanntes Fehlerbild gefunden.' : 'Noch keine Daten – der erste Lauf steht noch aus (Einstellungen → Automatische Scans → „Proaktive Fehlersuche“).'}
        </p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 w-8" />
                <th className="px-3 py-2 font-semibold">PC</th>
                <th className="px-3 py-2 font-semibold">Zugewiesen an</th>
                <th className="px-3 py-2 font-semibold">Fehler (letzte 7 Tage)</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Zuletzt</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Gelesen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sicht.map(z => {
                const auf = offen.has(z.host)
                const det = details[z.host]
                const zuletzt = z.befunde.reduce((m, b) => (b.zuletzt > m ? b.zuletzt : m), '')
                return (
                  <Fragment key={z.host}>
                    <tr className="hover:bg-accent/10 cursor-pointer align-top" onClick={() => klappe(z.host)} data-fehler-pc={z.host}>
                      <td className="px-3 py-2 text-muted-foreground">{auf ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td className="px-3 py-2 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <span className="inline-flex items-center gap-1.5 font-mono text-foreground"><span className={`w-2 h-2 rounded-full ${SCHWERE[z.schwere].punkt}`} title={`Schwerster Befund: ${SCHWERE[z.schwere].text}`} />{z.host}<DeviceInfoButton hostname={z.host} serial={z.serial} /></span>
                      </td>
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        {z.person ? <span className="inline-flex items-center gap-1 text-foreground">{z.person}<PersonInfoButton name={z.person} /></span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-1">
                          {z.befunde.map(b => (
                            <span key={b.key} className={`inline-flex items-center gap-1 px-1.5 py-px rounded border ${SCHWERE[b.schwere].cls}`}>{b.titel}<span className="opacity-70 tabular-nums">{b.anzahl}×</span></span>
                          ))}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">{zeit(zuletzt)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">{zeit(z.am)}</td>
                    </tr>
                    {auf && (
                      <tr className="bg-muted/10" data-fehler-detail={z.host}>
                        <td />
                        <td colSpan={5} className="px-3 py-3 space-y-2">
                          {z.befunde.map(b => {
                            const p = loesungen.get(b.suche)
                            const plan = plaene.get(lk(z.host, b.key))
                            const l = lauf[lk(z.host, b.key)]
                            const w = wartet.get(lk(z.host, b.key))
                            return (
                              <div key={b.key} className="rounded-md border border-border bg-card px-3 py-2 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {b.schwere === 'hoch' ? <AlertOctagon size={14} className="text-red-500 shrink-0" /> : <AlertTriangle size={14} className={`${b.schwere === 'mittel' ? 'text-amber-500' : 'text-muted-foreground'} shrink-0`} />}
                                  <span className="font-semibold text-foreground">{b.titel}</span>
                                  <span className={`text-[10px] px-1.5 py-px rounded-full border ${SCHWERE[b.schwere].cls}`}>{SCHWERE[b.schwere].text}</span>
                                  <span className="text-muted-foreground tabular-nums">{b.regel === 'laufwerk-i' ? `festgestellt ${zeit(b.zuletzt)}` : `${b.anzahl}× · zuerst ${zeit(b.zuerst)} · zuletzt ${zeit(b.zuletzt)}`}</span>
                                </div>
                                <p className="text-foreground/90">{b.bedeutung}</p>
                                {b.beispiel && b.regel !== 'laufwerk-i' && <p className="text-[11px] text-muted-foreground font-mono break-words" title={`Quelle: ${b.quelle}`}>{b.quelle}: {b.beispiel}</p>}
                                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                                  <span className="text-muted-foreground">Lösungsweg:</span>
                                  {b.regel === 'laufwerk-i' ? <span className="text-foreground"><b>Laufwerk I: dauerhaft verbinden</b> <span className="text-muted-foreground">— wird in die Registry des Benutzers eingetragen und verbindet sich bei seiner nächsten Anmeldung.</span></span>
                                    : !index ? <span className="text-muted-foreground inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" />wird ermittelt …</span>
                                      : p ? <span className="text-foreground"><b>{p.titel}</b> <span className="text-muted-foreground">— {p.loesung.split(/(?<=[.!?])\s/)[0]}</span></span>
                                        : <span className="text-muted-foreground">im Katalog nichts Passendes gefunden – Suche öffnet sich mit „{b.suche}“</span>}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {plan?.schritte.length
                                    ? <span className="text-[11px] text-muted-foreground" title={plan.schritte.map(s => s.titel).join('\n')}>Unbemerkt behebbar: {plan.schritte.filter(s => !s.liest).map(s => s.titel).join(' · ')}</span>
                                    : plan?.grund ? <span className="text-[11px] text-muted-foreground">Nicht unbemerkt behebbar: {plan.grund}</span> : null}
                                  <span className="ml-auto inline-flex items-center gap-2">
                                    {w && !l && <span className="text-[11px] text-sky-600 inline-flex items-center gap-1"><Clock size={11} />vorgemerkt seit {zeit(w.angelegtAm)}</span>}
                                    {plan?.schritte.length && !w && l?.status !== 'erledigt' ? (
                                      <button onClick={() => mitPin(() => void behebe(plan).then(s => { if (s !== 'fehler') laden() }))} disabled={l?.status === 'laeuft'} data-fehler-beheben
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-500/50 text-emerald-600 font-semibold hover:bg-emerald-500/10 disabled:opacity-50">
                                        {l?.status === 'laeuft' ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}Beheben
                                      </button>
                                    ) : null}
                                    {b.regel !== 'laufwerk-i' && (
                                      <button onClick={() => loese(z, b)} data-fehler-loesen
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-semibold shadow-sm"><Play size={12} />Lösung öffnen</button>
                                    )}
                                  </span>
                                </div>
                                {l && l.status !== 'laeuft' && (
                                  <div className={`rounded border px-2 py-1 text-[11px] ${l.status === 'erledigt' ? 'border-emerald-500/40 bg-emerald-500/5' : l.status === 'vorgemerkt' ? 'border-sky-500/40 bg-sky-500/5' : 'border-red-500/40 bg-red-500/5'}`} data-fehler-ergebnis={l.status}>
                                    <p className="font-semibold text-foreground inline-flex items-center gap-1">{l.status === 'erledigt' ? <CheckCircle2 size={12} className="text-emerald-500" /> : l.status === 'vorgemerkt' ? <Clock size={12} className="text-sky-500" /> : <XCircle size={12} className="text-red-500" />}{l.status === 'erledigt' ? 'Behoben – im Geräte-Dossier vermerkt' : l.status === 'vorgemerkt' ? 'Vorgemerkt' : 'Nicht behoben'}</p>
                                    {l.zeilen.slice(0, 8).map((x, i) => <p key={i} className="text-muted-foreground font-mono break-words">{x}</p>)}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                          {det === undefined ? <p className="text-muted-foreground inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" />Details werden geladen …</p>
                            : det ? (
                              <div className="text-[11px] text-muted-foreground space-y-1">
                                <p>Außerdem im Protokoll: {det.unbekannt.length} nicht zugeordnete Fehlerart(en), {det.rauschen} bekannte harmlose, {det.unterSchwelle} unter der Meldeschwelle.</p>
                                {det.unbekannt.length > 0 && (
                                  <ul className="rounded border border-border/60 divide-y divide-border/40 max-h-40 overflow-y-auto" data-fehler-unbekannt>
                                    {det.unbekannt.map((g, i) => <li key={i} className="px-2 py-1 font-mono break-words"><span className="tabular-nums text-foreground">{g.anzahl}×</span> {g.quelle} {g.id}: {g.text.slice(0, 160)}</li>)}
                                  </ul>
                                )}
                              </div>
                            ) : null}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {sicht.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Kein PC passt zu diesem Filter.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {sammel && <SammelDialog plaene={behebbar} behebe={behebe} onClose={() => { setSammel(false); laden() }} />}
      {pinDialog}
    </div>
  )
}

/** Alle auf einmal: Vorschau, Auswahl, dann in Gruppen (3 PCs gleichzeitig). Nicht erreichbare PCs kommen auf die Warteliste. */
function SammelDialog({ plaene, behebe, onClose }: { plaene: FixPlan[]; behebe: (p: FixPlan, online?: boolean) => Promise<Lauf['status']>; onClose: () => void }) {
  const [fest] = useState(plaene)   // Liste bleibt stehen, auch wenn sich die Ansicht dahinter ändert
  const [an, setAn] = useState<Set<number>>(() => new Set(fest.map((_, i) => i)))
  const [laeuft, setLaeuft] = useState(false)
  const [stand, setStand] = useState<Record<number, Lauf['status'] | 'laeuft'>>({})
  const fertig = Object.values(stand).length > 0 && !laeuft
  const zahl = (s: string) => Object.values(stand).filter(x => x === s).length

  async function start() {
    setLaeuft(true)
    const wahl = fest.map((p, i) => ({ p, i })).filter(x => an.has(x.i))
    const online = await sindOnline([...new Set(wahl.map(x => x.p.host))])
    let n = 0
    const arbeiter = async () => {
      while (n < wahl.length) {
        const { p, i } = wahl[n++]
        setStand(s => ({ ...s, [i]: 'laeuft' }))
        const r = await behebe(p, online.has(p.host.split('.')[0].toUpperCase()))
        setStand(s => ({ ...s, [i]: r }))
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, wahl.length) }, arbeiter))
    setLaeuft(false)
  }

  return (
    <div className="fixed inset-0 z-[55] bg-black/60 flex items-center justify-center p-6" onClick={() => !laeuft && onClose()} data-fehler-sammeldialog>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2"><ShieldCheck size={16} className="text-primary" />Fehler auf {new Set(fest.map(p => p.host)).size} PC(s) beheben</h3>
          <p className="text-xs text-muted-foreground mt-1">Es laufen nur Schritte, die der Benutzer nicht bemerkt: kein Fenster, es wird nichts geschlossen oder neu gestartet. Höchstens 3 PCs gleichzeitig. Ist ein PC nicht erreichbar, wird er vorgemerkt und alle 2 Stunden erneut geprüft.</p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/60">
          {fest.map((p, i) => (
            <label key={i} className="flex items-start gap-2 px-5 py-2 text-xs cursor-pointer hover:bg-accent/10">
              <input type="checkbox" className="mt-0.5 accent-primary" checked={an.has(i)} disabled={laeuft || fertig} onChange={() => setAn(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })} />
              <span className="min-w-0 flex-1">
                <span className="font-mono text-foreground">{p.host}</span> <span className="text-foreground">· {p.befundTitel}</span>
                <span className="block text-[11px] text-muted-foreground">{p.schritte.filter(s => !s.liest).map(s => s.titel).join(' · ')}</span>
              </span>
              <span className="shrink-0 w-24 text-right">
                {stand[i] === 'laeuft' ? <Loader2 size={13} className="animate-spin inline text-primary" />
                  : stand[i] === 'erledigt' ? <span className="text-emerald-600">behoben</span>
                    : stand[i] === 'vorgemerkt' ? <span className="text-sky-600">vorgemerkt</span>
                      : stand[i] === 'fehler' ? <span className="text-red-500">Fehler</span> : null}
              </span>
            </label>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">{fertig ? `${zahl('erledigt')} behoben · ${zahl('vorgemerkt')} vorgemerkt · ${zahl('fehler')} mit Fehler` : `${an.size} von ${fest.length} ausgewählt`}</span>
          <button onClick={onClose} disabled={laeuft} className="ml-auto px-3 py-1.5 rounded-md border border-border text-muted-foreground disabled:opacity-40">{fertig ? 'Schließen' : 'Abbrechen'}</button>
          {!fertig && <button onClick={() => void start()} disabled={laeuft || !an.size} data-sammel-start className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-40 inline-flex items-center gap-1.5">{laeuft ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />}{laeuft ? 'Läuft …' : `${an.size} jetzt beheben`}</button>}
        </div>
      </div>
    </div>
  )
}
