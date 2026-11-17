// ── Server → „Dienste & Prüfungen“ → Reiter „Komplett-Diagnose“ ─────────────────
// Protokoll aller gespeicherten Komplett-Diagnosen dieses Servers (diagnose/voll/<HOST>/, höchstens
// 20 Läufe): Datum + Uhrzeit, wer, Ergebnis — aufklappbar mit Ursachenbild, Befunden nach Bereich,
// ausgeführten Maßnahmen und allen Prüfungen. Nur lesend: ausgeführt wird ausschließlich in der
// Komplett-Diagnose selbst (Maßnahmenplan mit Bestätigung).
// Die LÖSUNGSWEGE (und der PDF-Bericht, der sie enthält) erscheinen erst nach PIN 0506 (Nutzerwunsch 17.11.2026).
import { useEffect, useMemo, useState } from 'react'
import {
  Stethoscope, Loader2, ChevronDown, ChevronRight, AlertOctagon, AlertTriangle, Info, CheckCircle2, XCircle,
  Lock, Unlock, FileDown, Play, Clock, Wrench, RefreshCw, MinusCircle,
} from 'lucide-react'
import { ladeIndex, ladeLauf, type VdIndexEintrag } from '../../vollDiagnose/speicher'
import { BEREICH_TEXT, PHASE_TEXT, FACH_TEXT, SCHWERE_RANG, type VdLauf, type VdBefund, type VdLoesung, type VdSchwere, type VdBereich } from '../../vollDiagnose/typen'
import { speicherePdf } from '../../vollDiagnose/bericht'
import { usePinSperre } from '../netzwerkgeraete/zugang'
import { aktion as paAktion, WERKZEUGE } from '../../problemAssistent/aktionen'
import { PROBLEME } from '../../problemAssistent/katalog'
import { oeffneWerkzeug } from '../../screens/Startseite'

const d2 = (n: number) => String(n).padStart(2, '0')
const datumZeit = (t?: number | string) => { const d = t ? new Date(t) : null; return d && !isNaN(d.getTime()) ? `${d2(d.getDate())}.${d2(d.getMonth() + 1)}.${d.getFullYear()} ${d2(d.getHours())}:${d2(d.getMinutes())}` : '—' }
const dauer = (ms?: number) => { if (!ms || ms < 0) return ''; const m = Math.round(ms / 60000); return m < 1 ? `${Math.max(1, Math.round(ms / 1000))} s` : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min` }

const SCHWERE: Record<VdSchwere, { text: string; chip: string; icon: JSX.Element }> = {
  kritisch: { text: 'kritisch', chip: 'border-red-500/50 text-red-500 bg-red-500/10', icon: <AlertOctagon size={14} className="text-red-500 shrink-0 mt-0.5" /> },
  warnung: { text: 'Warnung', chip: 'border-amber-500/50 text-amber-600 bg-amber-500/10', icon: <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" /> },
  hinweis: { text: 'Hinweis', chip: 'border-border text-muted-foreground bg-muted/40', icon: <Info size={14} className="text-sky-500 shrink-0 mt-0.5" /> },
}
const ART_TEXT: Record<VdLoesung['art'], string> = { aktionen: 'Bausteine', problem: 'Lösung aus „Gib dein Problem ein“', werkzeug: 'Werkzeug', hinweis: 'Handarbeit / zuständig' }
const PRUEF_TEXT: Record<string, string> = { ok: 'in Ordnung', auffaellig: 'auffällig', fehler: 'Fehler', uebersprungen: 'übersprungen', wartet: 'nicht gelaufen', laeuft: 'abgebrochen' }
const MASS_TEXT: Record<string, string> = { ok: 'ausgeführt', fehler: 'fehlgeschlagen', uebersprungen: 'übersprungen', laeuft: 'abgebrochen', offen: 'nicht ausgeführt' }

/** Kurzzeile „2 kritisch · 1 Warnung · 3 Hinweise“ als Chips. */
function Zaehler({ kritisch, warnung, hinweis }: { kritisch: number; warnung: number; hinweis: number }) {
  if (!kritisch && !warnung && !hinweis) return <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-px rounded border border-emerald-500/50 text-emerald-600 bg-emerald-500/10"><CheckCircle2 size={11} />ohne Befund</span>
  return (
    <span className="inline-flex flex-wrap gap-1">
      {kritisch > 0 && <span className={`text-[11px] px-1.5 py-px rounded border ${SCHWERE.kritisch.chip}`}>{kritisch} kritisch</span>}
      {warnung > 0 && <span className={`text-[11px] px-1.5 py-px rounded border ${SCHWERE.warnung.chip}`}>{warnung} Warnung{warnung === 1 ? '' : 'en'}</span>}
      {hinweis > 0 && <span className={`text-[11px] px-1.5 py-px rounded border ${SCHWERE.hinweis.chip}`}>{hinweis} Hinweis{hinweis === 1 ? '' : 'e'}</span>}
    </span>
  )
}

/** Was hinter einem Lösungsweg steckt — in Klartext. */
function loesungsDetail(l: VdLoesung): string {
  if (l.art === 'aktionen') return (l.schritte || []).map(s => s.titel || paAktion(s.aktion)?.titel || s.aktion).join(' → ')
  if (l.art === 'problem') return PROBLEME.find(p => p.id === l.problem)?.titel || l.problem || ''
  if (l.art === 'werkzeug') { const id = (l.werkzeug || '').replace(/^werkzeug:/, ''); return WERKZEUGE[id]?.titel || FACH_TEXT[id as keyof typeof FACH_TEXT] || id }
  return l.hinweis || ''
}

function BefundKarte({ b, lauf, loesungenAn }: { b: VdBefund; lauf: VdLauf; loesungenAn: boolean }) {
  const [belegeAuf, setBelegeAuf] = useState(false)
  const s = SCHWERE[b.schwere]
  const folge = b.folgeVon ? lauf.ursachen.find(u => u.id === b.folgeVon)?.titel : ''
  const server = lauf.ziel?.geraet === 'server'
  const loesungen = b.loesungen.filter(l => !(server && l.nur === 'pc'))
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 space-y-1" data-diag-befund={b.schwere}>
      <div className="flex items-start gap-2">
        {s.icon}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">{b.titel}
            {b.neu && <span className="ml-1.5 text-[10px] px-1 py-px rounded border border-sky-500/50 text-sky-600 bg-sky-500/10 font-normal">neu</span>}
            {b.nach && <span className={`ml-1.5 text-[10px] px-1 py-px rounded border font-normal ${b.nach === 'behoben' ? 'border-emerald-500/50 text-emerald-600 bg-emerald-500/10' : 'border-border text-muted-foreground'}`}>Nachprüfung: {b.nach}</span>}
          </p>
          <p className="text-xs text-foreground/90 break-words">{b.text}</p>
          {folge && <p className="text-[11px] text-muted-foreground">Folge von „{folge}“</p>}
          {b.belege.length > 0 && (
            <button onClick={() => setBelegeAuf(v => !v)} className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              {belegeAuf ? <ChevronDown size={11} /> : <ChevronRight size={11} />}Belege ({b.belege.length})
            </button>
          )}
          {belegeAuf && <ul className="mt-0.5 space-y-0.5">{b.belege.slice(0, 20).map((x, i) => <li key={i} className="text-[11px] font-mono text-muted-foreground break-words">{x}</li>)}</ul>}
          {loesungenAn && (
            <div className="mt-1.5 rounded border border-primary/30 bg-primary/5 px-2 py-1.5 space-y-1" data-diag-loesungen>
              <p className="text-[11px] font-semibold text-foreground inline-flex items-center gap-1"><Wrench size={11} className="text-primary" />Lösungswege</p>
              {loesungen.length === 0 && <p className="text-[11px] text-muted-foreground">Kein Lösungsweg hinterlegt.</p>}
              {loesungen.map((l, i) => (
                <div key={l.id + i} className="text-[11px]">
                  <p className="text-foreground"><span className="tabular-nums text-muted-foreground">{i + 1}.</span> <b>{l.titel}</b> <span className="text-muted-foreground">· {ART_TEXT[l.art]} · {PHASE_TEXT[l.phase]}{l.neustart ? ' · danach Neustart' : ''}{l.dauer ? ` · ${l.dauer}` : ''}</span></p>
                  {loesungsDetail(l) && <p className="text-muted-foreground break-words pl-3">{loesungsDetail(l)}</p>}
                  {l.wirkung && <p className="text-muted-foreground break-words pl-3">{l.wirkung}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
        <span className={`shrink-0 text-[10px] px-1.5 py-px rounded-full border ${s.chip}`}>{s.text}</span>
      </div>
    </div>
  )
}

function LaufDetail({ lauf, loesungenAn, onPdf }: { lauf: VdLauf; loesungenAn: boolean; onPdf: () => void }) {
  const [pruefAuf, setPruefAuf] = useState(false)
  const z = lauf.ziel
  const befunde = useMemo(() => [...lauf.befunde].sort((a, b) => SCHWERE_RANG[a.schwere] - SCHWERE_RANG[b.schwere]), [lauf])
  const bereiche = useMemo(() => {
    const m = new Map<VdBereich, VdBefund[]>()
    for (const b of befunde) m.set(b.bereich, [...(m.get(b.bereich) || []), b])
    return [...m.entries()].sort((a, b) => SCHWERE_RANG[a[1][0].schwere] - SCHWERE_RANG[b[1][0].schwere])
  }, [befunde])
  const gelaufen = lauf.massnahmen.filter(m => m.status !== 'offen')
  const auffaellig = lauf.pruefungen.filter(p => p.status === 'auffaellig' || p.status === 'fehler').length
  return (
    <div className="px-3 pb-3 pt-1 space-y-3" data-diag-detail>
      <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
        {z?.os && <span>{z.os}{z.build ? ` (Build ${z.build})` : ''}</span>}
        {z?.modell && <span>{z.modell}</span>}
        {z?.boot && <span>letzter Start {datumZeit(z.boot)}</span>}
        {lauf.ende && <span>Dauer {dauer(lauf.ende - lauf.start)}</span>}
        <span>{lauf.pruefungen.length} Prüfungen, davon {auffaellig} auffällig</span>
        {lauf.tage ? <span>Ereignisse der letzten {lauf.tage} Tage</span> : null}
      </div>
      {lauf.fehler && <p className="text-xs text-red-500 flex gap-1.5"><XCircle size={13} className="mt-0.5 shrink-0" />{lauf.fehler}</p>}

      {lauf.ursachen.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Ursachenbild</p>
          {lauf.ursachen.map(u => (
            <div key={u.id} className="rounded-md border border-border bg-muted/20 px-3 py-1.5">
              <p className="text-xs font-semibold text-foreground">{u.titel}</p>
              <p className="text-[11px] text-muted-foreground break-words">{u.text}</p>
            </div>
          ))}
        </div>
      )}

      {bereiche.length === 0
        ? <p className="text-xs text-emerald-600 inline-flex items-center gap-1.5"><CheckCircle2 size={13} />Keine Befunde – der Server war bei dieser Diagnose unauffällig.</p>
        : bereiche.map(([bereich, liste]) => (
          <div key={bereich} className="space-y-1.5">
            <p className="text-xs font-semibold text-foreground">{BEREICH_TEXT[bereich] || bereich} <span className="font-normal text-muted-foreground">({liste.length})</span></p>
            {liste.map(b => <BefundKarte key={b.id} b={b} lauf={lauf} loesungenAn={loesungenAn} />)}
          </div>
        ))}

      {gelaufen.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Ausgeführte Maßnahmen</p>
          <ul className="rounded-md border border-border divide-y divide-border/60">
            {gelaufen.map(m => (
              <li key={m.id} className="px-2.5 py-1.5 text-[11px] flex items-start gap-2">
                {m.status === 'ok' ? <CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" /> : m.status === 'fehler' ? <XCircle size={12} className="text-red-500 mt-0.5 shrink-0" /> : <MinusCircle size={12} className="text-muted-foreground mt-0.5 shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="text-foreground">{m.loesung.titel}{m.eingabe ? ` (${m.eingabe})` : ''}</span>
                  <span className="text-muted-foreground"> · {MASS_TEXT[m.status] || m.status}{m.nachpruefung ? ` · Nachprüfung: ${m.nachpruefung}` : ''}{m.fehler ? ` · ${m.fehler}` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
          {lauf.ausfuehrung?.bestaetigtVon && <p className="text-[11px] text-muted-foreground">Bestätigt von {lauf.ausfuehrung.bestaetigtVon}{lauf.ausfuehrung.start ? ` am ${datumZeit(lauf.ausfuehrung.start)}` : ''}</p>}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setPruefAuf(v => !v)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          {pruefAuf ? <ChevronDown size={11} /> : <ChevronRight size={11} />}Alle Prüfungen ({lauf.pruefungen.length})
        </button>
        <button onClick={onPdf} data-diag-pdf title={loesungenAn ? 'Bericht als PDF speichern' : 'Bericht als PDF speichern (enthält die Lösungswege – PIN)'}
          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md border border-border text-foreground hover:bg-accent">
          {loesungenAn ? <FileDown size={12} /> : <Lock size={11} />}PDF-Bericht
        </button>
      </div>
      {pruefAuf && (
        <ul className="rounded-md border border-border divide-y divide-border/60 max-h-64 overflow-y-auto">
          {lauf.pruefungen.map(p => (
            <li key={p.id} className="px-2.5 py-1 text-[11px] flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.status === 'ok' ? 'bg-emerald-500' : p.status === 'auffaellig' ? 'bg-amber-500' : p.status === 'fehler' ? 'bg-red-500' : 'bg-muted-foreground/50'}`} />
              <span className="text-foreground min-w-0 truncate">{p.titel}</span>
              <span className="ml-auto shrink-0 text-muted-foreground">{PRUEF_TEXT[p.status] || p.status}{p.grund ? ` – ${p.grund.slice(0, 60)}` : p.befunde ? ` – ${p.befunde} Befund(e)` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function DiagnoseReiter({ host }: { host: string }) {
  const [liste, setListe] = useState<VdIndexEintrag[] | null>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [laeufe, setLaeufe] = useState<Record<string, VdLauf | null>>({})
  const [loesungenAn, setLoesungenAn] = useState(false)
  const [meldung, setMeldung] = useState('')
  const [lauf, setLauf] = useState(0)
  const { mitPin, pinDialog } = usePinSperre('Lösungswege der Komplett-Diagnose anzeigen – nur mit PIN.')

  useEffect(() => {
    let weg = false
    setListe(null)
    // Ablage je Hostname — falls einmal mit vollem Namen diagnostiziert wurde, beide Ordner lesen
    const namen = [...new Set([host.trim(), host.trim().split('.')[0]].filter(Boolean))]
    void Promise.all(namen.map(n => ladeIndex(n).catch(() => []))).then(l => {
      if (weg) return
      const alle = new Map<string, VdIndexEintrag>()
      for (const e of l.flat()) if (!alle.has(e.datei)) alle.set(e.datei, e)
      setListe([...alle.values()].sort((a, b) => b.am.localeCompare(a.am)))
    })
    return () => { weg = true }
  }, [host, lauf])

  function klappe(e: VdIndexEintrag) {
    setOffen(o => (o === e.datei ? null : e.datei))
    if (!(e.datei in laeufe)) void ladeLauf(e.datei).then(l => setLaeufe(x => ({ ...x, [e.datei]: l })))
  }
  async function pdf(l: VdLauf) {
    mitPin(() => {
      setMeldung('')
      void speicherePdf(l).then(p => { if (p) setMeldung(`PDF gespeichert: ${p}`) }).catch(err => setMeldung(`PDF fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`))
    })
  }

  return (
    <div className="p-5 space-y-3" data-diagnose-reiter>
      <div className="flex items-center gap-2 flex-wrap">
        <Stethoscope size={16} className="text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Komplett-Diagnosen dieses Servers</p>
          <p className="text-[11px] text-muted-foreground">Jeder Lauf mit Datum und Uhrzeit – die letzten 20 werden aufbewahrt. Nur Anzeige; eingegriffen wird nur in der Komplett-Diagnose selbst.</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-2">
          <button onClick={() => (loesungenAn ? setLoesungenAn(false) : mitPin(() => setLoesungenAn(true)))} data-diag-loesungen-knopf={loesungenAn ? 'an' : 'aus'}
            title={loesungenAn ? 'Lösungswege wieder ausblenden' : 'Lösungswege einblenden – nur mit PIN'}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border ${loesungenAn ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            {loesungenAn ? <Unlock size={12} /> : <Lock size={12} />}Lösungswege {loesungenAn ? 'ausblenden' : 'anzeigen'}
          </button>
          <button onClick={() => setLauf(n => n + 1)} title="Liste neu laden" className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"><RefreshCw size={12} /></button>
          <button onClick={() => oeffneWerkzeug('voll-diagnose', host)} data-diag-neu
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-primary text-primary-foreground font-semibold"><Play size={12} />Neue Komplett-Diagnose</button>
        </span>
      </div>
      {meldung && <p className="text-[11px] text-muted-foreground break-all" data-diag-meldung>{meldung}</p>}

      {liste === null ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />Lade Diagnosen …</div>
      ) : liste.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground" data-diag-leer>Für diesen Server liegt noch keine Komplett-Diagnose vor. Starte sie mit „Neue Komplett-Diagnose“ oder dem Stethoskop auf der Kachel.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border/60">
          {liste.map(e => {
            const auf = offen === e.datei
            const l = laeufe[e.datei]
            return (
              <div key={e.datei} data-diag-lauf={e.am}>
                <button onClick={() => klappe(e)} className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-accent/10">
                  {auf ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
                  <Clock size={12} className="text-muted-foreground shrink-0" />
                  <span className="text-xs font-semibold text-foreground tabular-nums whitespace-nowrap">{datumZeit(e.am)}</span>
                  <span className="text-[11px] text-muted-foreground truncate min-w-0">von {e.von}{e.richtung ? ` · Richtung: ${e.richtung}` : ''}</span>
                  <span className="ml-auto shrink-0"><Zaehler kritisch={e.kritisch} warnung={e.warnung} hinweis={e.hinweis} /></span>
                </button>
                {auf && (l === undefined
                  ? <p className="px-3 pb-3 text-[11px] text-muted-foreground inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" />Lade Ergebnis …</p>
                  : l === null ? <p className="px-3 pb-3 text-[11px] text-red-500">Die Datei dieses Laufs ließ sich nicht lesen.</p>
                    : <LaufDetail lauf={l} loesungenAn={loesungenAn} onPdf={() => void pdf(l)} />)}
              </div>
            )
          })}
        </div>
      )}
      {pinDialog}
    </div>
  )
}
