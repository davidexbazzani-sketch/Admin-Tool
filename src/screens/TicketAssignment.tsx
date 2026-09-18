// ── Menüpunkt „Zuweisung Tickets" ────────────────────────────────────────────
// Das Verteilerteam gibt die sichtbaren ServiceNow-Felder ein und erhält sofort
// (ohne KI) Haupt-/Vertretungsbearbeiter + Begründung. Die Assignment group wird
// NICHT eingegeben, sondern automatisch aus CI/Text bestimmt (überschreibbar).
// Ansichten: A Ticket eingeben, C Team-Übersicht, Abwesenheiten, D Hilfe.
// Engine + Regelwerk aus resources/Ticket Zuweisung (gebündelt), 303/303-Parität.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Ticket, RefreshCw, Loader2, FileUp, CalendarDays, AlertTriangle, ChevronDown, ChevronRight,
  ClipboardList, Users, CalendarRange, BookOpen, Pencil,
} from 'lucide-react'
import { loadZuwBundle, resolveDept, loadCallerNames, type ZuwBundle } from '../services/zuweisung/data'
import { createEngine } from '../services/zuweisung/engine'
import { parseTeamKalender } from '../services/zuweisung/kalenderImport'
import { openFileForImport } from '../utils/fileImport'
import type { Ergebnis, SignalArt, Abwesenheiten } from '../services/zuweisung/types'
import ResultCard from '../components/zuweisung/ResultCard'
import Autocomplete from '../components/zuweisung/Autocomplete'
import SchnellEingabe from '../components/zuweisung/SchnellEingabe'
import type { ParseErgebnis } from '../services/zuweisung/ticketParse'
import { applyVerteilerPolicy, applyClientOverride } from '../services/zuweisung/policy'
import TeamUebersicht from '../components/zuweisung/TeamUebersicht'
import KalenderUebersicht from '../components/zuweisung/KalenderUebersicht'
import MarkdownHilfe from '../components/zuweisung/MarkdownHilfe'

const inputCls = 'w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary'
const heuteISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// Signalstärke für die automatische Queue-Bestimmung (höher = verlässlicher).
const SIGNAL_RANK: Record<SignalArt, number> = {
  ci: 8, kw_bei_ci_short: 7, kw_bei_ci_text: 6, kw_short: 5, kw_desc: 4, subcat: 3, abteilung: 3, melder: 2, rest: 1, gruppen_reihenfolge: 0,
}
// „Alles"-Queues (kw='.'): nur korrekt, wenn man die Queue KENNT — bei der automatischen
// Bestimmung dürfen sie nicht als starkes Signal gewinnen (sonst landet ohne CI alles bei HR).
const CATCHALL_QUEUE_RULES = new Set(['HR-QUEUE', 'EXT-QUEUE'])

type Tab = 'a' | 'c' | 'kalender' | 'd'
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'a', label: 'Ticket eingeben', icon: <ClipboardList size={14} /> },
  { id: 'c', label: 'Team-Übersicht', icon: <Users size={14} /> },
  { id: 'kalender', label: 'Abwesenheiten', icon: <CalendarRange size={14} /> },
  { id: 'd', label: 'Hilfe', icon: <BookOpen size={14} /> },
]

interface AutoErgebnis { queue: string; pred: Ergebnis; rank: number; unsicher: boolean; manuell: boolean }

export default function TicketAssignment() {
  const [bundle, setBundle] = useState<ZuwBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const [tab, setTab] = useState<Tab>('a')
  const [callerNames, setCallerNames] = useState<string[]>([])
  const [msg, setMsg] = useState('')

  // Ansicht A – Eingabe (KEINE Assignment group; die wird automatisch bestimmt)
  const [ci, setCi] = useState('')
  const [sub, setSub] = useState('')
  const [caller, setCaller] = useState('')
  const [short, setShort] = useState('')
  const [desc, setDesc] = useState('')
  const [descOpen, setDescOpen] = useState(false)
  const [dept, setDept] = useState('')
  const [datum, setDatum] = useState(heuteISO())
  const [manualQueue, setManualQueue] = useState('')   // '' = automatisch
  const [queueEdit, setQueueEdit] = useState(false)

  useEffect(() => {
    let ab = false
    setLoading(true); setError('')
    loadZuwBundle().then(b => { if (!ab) setBundle(b) })
      .catch(e => { if (!ab) setError('Regelwerk konnte nicht geladen werden: ' + (e instanceof Error ? e.message : String(e))) })
      .finally(() => { if (!ab) setLoading(false) })
    loadCallerNames().then(n => { if (!ab) setCallerNames(n) }).catch(() => {})
    return () => { ab = true }
  }, [nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // Melder → Abteilung (für die Abteilungs-Regel)
  useEffect(() => {
    let ab = false
    if (!caller.trim()) { setDept(''); return }
    resolveDept(caller).then(d => { if (!ab) setDept(d) }).catch(() => {})
    return () => { ab = true }
  }, [caller])

  const hasInput = !!(ci.trim() || short.trim() || desc.trim() || sub.trim() || caller.trim())

  // Automatische Queue-Bestimmung: alle Queues durchrechnen, stärkstes Signal gewinnt.
  const auto: AutoErgebnis | null = useMemo(() => {
    if (!bundle || !hasInput) return null
    const eingabe = { ci, sub, caller, short, desc }
    if (manualQueue) {
      const e = { ...eingabe, group: manualQueue }
      const pred = applyVerteilerPolicy(applyClientOverride(bundle.engine.zuweisen(e, { dept }), e, bundle.engine, dept), e)
      return { queue: manualQueue, pred, rank: SIGNAL_RANK[pred.signal ?? 'gruppen_reihenfolge'] ?? 0, unsicher: false, manuell: true }
    }
    let best: AutoErgebnis | null = null
    for (const q of bundle.optionen.queues) {
      const pred = bundle.engine.zuweisen({ ...eingabe, group: q }, { dept })
      let rank = SIGNAL_RANK[pred.signal ?? 'gruppen_reihenfolge'] ?? 0
      if (CATCHALL_QUEUE_RULES.has(pred.regel)) rank = Math.min(rank, 1)   // HR/EXT nicht automatisch gewinnen lassen
      if (!best || rank > best.rank) best = { queue: q, pred, rank, unsicher: false, manuell: false }
    }
    if (best) { best.unsicher = best.rank < 2; const e = { ...eingabe, group: best.queue }; best.pred = applyVerteilerPolicy(applyClientOverride(best.pred, e, bundle.engine, dept), e) }
    return best
  }, [bundle, ci, sub, caller, short, desc, dept, manualQueue, hasInput])

  const pred = auto?.pred ?? null
  const determinedQueue = auto?.queue ?? ''
  const vert = useMemo(() => (bundle && pred ? bundle.engine.mitVertretung(pred, datum, bundle.abwesenheiten, determinedQueue) : null), [bundle, pred, datum, determinedQueue])

  const reload = useCallback(() => { setNonce(n => n + 1); setMsg('') }, [])

  async function ausDateiLaden() {
    setMsg(''); setError('')
    try {
      const f = await openFileForImport(); if (!f) return
      if (f.ext !== 'json') { setError('Bitte eine ZUWEISUNG_Regeln.json wählen.'); return }
      const rw = JSON.parse(new TextDecoder('utf-8').decode(f.bytes))
      if (!rw || !Array.isArray(rw.regeln)) { setError('Datei ist kein gültiges Regelwerk (regeln[] fehlt).'); return }
      setBundle(b => b ? { ...b, engine: createEngine(rw), regelwerk: rw, quelleRegeln: 'bundle' } : b)
      setMsg('Regelwerk aus Datei übernommen (nur diese Sitzung).')
    } catch (e) { setError('Regelwerk-Datei fehlerhaft: ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function kalenderLaden() {
    setMsg(''); setError('')
    if (!bundle) return
    try {
      const f = await openFileForImport(); if (!f) return
      let abw: Abwesenheiten
      if (f.ext === 'json') {
        abw = JSON.parse(new TextDecoder('utf-8').decode(f.bytes))
        if (!abw || !abw.personen) { setError('JSON ist keine Abwesenheiten-Datei (personen{} fehlt).'); return }
      } else if (f.ext === 'xlsx' || f.ext === 'xls') {
        const name = f.filePath.split(/[\\/]/).pop() || 'Kalender.xlsx'
        abw = parseTeamKalender(f.bytes, Object.keys(bundle.regelwerk.personen), name)
      } else { setError('Bitte JSON oder XLSX wählen.'); return }
      setBundle(b => b ? { ...b, abwesenheiten: abw, quelleAbwesenheiten: 'bundle' } : b)
      const unb = (abw.unbekannte_namen && abw.unbekannte_namen.length) ? ` · nicht im Regelwerk: ${abw.unbekannte_namen.join(', ')}` : ''
      setMsg(`Team-Kalender geladen: ${Object.keys(abw.personen).length} Personen${unb}`)
    } catch (e) { setError('Kalender-Import fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e))) }
  }

  const zuruecksetzen = () => { setCi(''); setSub(''); setCaller(''); setShort(''); setDesc(''); setManualQueue(''); setQueueEdit(false) }

  // Ergebnis aus „Ticket einfügen" (Text/Screenshot) in die Felder übernehmen.
  const applyParsed = (p: ParseErgebnis) => {
    if (p.ci !== undefined) setCi(p.ci)
    if (p.caller !== undefined) setCaller(p.caller)
    if (p.short !== undefined) setShort(p.short)
    if (p.desc !== undefined) { setDesc(p.desc); setDescOpen(true) }
    if (p.sub && bundle?.optionen.subcats.includes(p.sub)) setSub(p.sub)
    // Steht die Queue explizit im Ticket, diese verwenden — sonst automatisch bestimmen.
    if (p.group && bundle?.optionen.queues.includes(p.group)) setManualQueue(p.group)
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Kopf */}
      <div className="shrink-0 px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <Ticket size={20} className="text-primary" />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Zuweisung Tickets</h1>
          <p className="text-[11px] text-muted-foreground">
            {bundle ? <>Regelwerk v{bundle.regelwerk.meta.version} · Stand {bundle.regelwerk.meta.stand} · Quelle {bundle.quelleRegeln === 'net' ? 'Netzlaufwerk' : 'gebündelt'}{bundle.abwesenheiten ? ` · Kalender ${bundle.abwesenheiten.quelle || 'geladen'}` : ' · kein Kalender'}</> : 'Regelwerk wird geladen…'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={reload} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent/40" title="Regelwerk neu laden (Netzlaufwerk/Bündel)"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} />Neu laden</button>
          <button onClick={ausDateiLaden} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent/40" title="Regelwerk aus Datei übernehmen (nur diese Sitzung)"><FileUp size={13} />Aus Datei…</button>
          <button onClick={kalenderLaden} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent/40" title="Team-Kalender laden (JSON oder XLSX)"><CalendarDays size={13} />Team-Kalender laden</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex items-center gap-1 px-4 pt-2 border-b border-border">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-t-md border-b-2 ${tab === t.id ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {msg && <div className="mx-4 mt-3 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs shrink-0">{msg}</div>}
      {error && <div className="mx-4 mt-3 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0 flex items-center gap-2"><AlertTriangle size={13} />{error}</div>}
      {bundle && bundle.engine.regexErrors.length > 0 && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-foreground text-xs shrink-0">
          {bundle.engine.regexErrors.length} Regel-Muster nicht kompilierbar: {bundle.engine.regexErrors.map(e => e.wo).join(', ')}
        </div>
      )}

      {/* Inhalt */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && !bundle ? (
          <div className="flex items-center justify-center h-full text-muted-foreground gap-2"><Loader2 size={16} className="animate-spin" />Wird geladen…</div>
        ) : !bundle ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">Kein Regelwerk verfügbar.</div>
        ) : tab === 'a' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-[80rem] pb-8">
            {/* Eingabe */}
            <div className="space-y-3">
              <SchnellEingabe optionen={bundle.optionen} generics={bundle.regelwerk.meta.generische_cis || []} onParsed={applyParsed} />
              <div className="text-[11px] text-muted-foreground -mb-1">… oder Felder einzeln ausfüllen:</div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Configuration Item</label>
                <Autocomplete value={ci} onChange={setCi} options={bundle.optionen.cis} placeholder="z. B. SD - Vertrieb/Sales" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Subcategory</label>
                <select value={sub} onChange={e => setSub(e.target.value)} className={inputCls}>
                  <option value="">(leer)</option>
                  {bundle.optionen.subcats.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Caller (Melder){dept && <span className="text-muted-foreground/70"> · Abteilung: {dept}</span>}</label>
                <Autocomplete value={caller} onChange={setCaller} options={callerNames} placeholder="Anzeigename" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Short description</label>
                <textarea value={short} onChange={e => setShort(e.target.value)} rows={2} placeholder="Kurzbeschreibung einfügen (Strg+V)" className={inputCls + ' resize-y'} />
              </div>
              <div>
                <button onClick={() => setDescOpen(o => !o)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                  {descOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}Description (optional)
                </button>
                {descOpen && <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} placeholder="Beschreibung einfügen" className={inputCls + ' resize-y mt-1'} />}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-medium text-muted-foreground">Ticketdatum (für Vertretung)</label>
                  <input type="date" value={datum} onChange={e => setDatum(e.target.value)} className="px-2 py-1 text-xs rounded-md border border-border bg-background text-foreground" />
                </div>
                <button onClick={zuruecksetzen} className="text-[11px] text-muted-foreground hover:text-foreground underline">Eingaben leeren</button>
              </div>
            </div>

            {/* Ergebnis */}
            <div className="space-y-2">
              {!hasInput ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-card/40 p-6 text-center text-sm text-muted-foreground">
                  Configuration Item, Short description, Subcategory oder Caller eingeben — der Vorschlag erscheint dann automatisch.
                </div>
              ) : pred && auto ? (
                <>
                  {/* Automatisch bestimmte Queue (überschreibbar) */}
                  <div className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-2 flex-wrap ${auto.unsicher ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-background'}`}>
                    <span className="text-muted-foreground">Assignment group:</span>
                    <span className="font-medium text-foreground">{determinedQueue}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{auto.manuell ? 'manuell gewählt' : 'automatisch'}</span>
                    {auto.unsicher && !auto.manuell && <span className="inline-flex items-center gap-1 text-foreground"><AlertTriangle size={11} className="text-amber-500" />kein eindeutiges Signal — bitte prüfen</span>}
                    <button onClick={() => setQueueEdit(v => !v)} className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><Pencil size={11} />ändern</button>
                  </div>
                  {queueEdit && (
                    <select value={manualQueue} onChange={e => { setManualQueue(e.target.value); setQueueEdit(false) }} className={inputCls}>
                      <option value="">Automatisch bestimmen</option>
                      {bundle.optionen.queues.map(q => <option key={q} value={q}>{q}</option>)}
                    </select>
                  )}
                  <ResultCard pred={pred} vert={vert} regelwerk={bundle.regelwerk} />
                </>
              ) : null}
            </div>
          </div>
        ) : tab === 'c' ? (
          <TeamUebersicht regelwerk={bundle.regelwerk} abwesenheiten={bundle.abwesenheiten} datumISO={datum} />
        ) : tab === 'kalender' ? (
          <KalenderUebersicht regelwerk={bundle.regelwerk} abwesenheiten={bundle.abwesenheiten} />
        ) : (
          <MarkdownHilfe markdown={bundle.markdown} />
        )}
      </div>
    </div>
  )
}
