// ── Server → „Dienste & Prüfungen" (Lasche je Server) ─────────────────────────
// Status:     jeder Prüfpunkt des Soll-Zustands mit aktuellem Stand + Beheben-Knopf
// Einrichten: Server analysieren → Vorschlag → Auswahl als Soll-Zustand speichern
// Software:   installierte Programme, Rollen, Betriebssystem (aus der Analyse)
// Beheben nur nach Rückfrage; jede Aktion landet in Server-Historie + Geräte-Dossier.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  X, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, ScanSearch, Save, Search,
  ListChecks, Package, Play, RotateCcw, Plus, Info,
} from 'lucide-react'
import {
  ladeSoll, ladeIst, ladeInventar, speichereSoll, analysiere, pruefe, baueVorschlag, behebe, moeglicheAktionen,
  aufgabenErgebnis, fasseZusammen, istDcaDienst, DCA_AUSFALL, type SollZustand, type IstStand, type Inventar, type Pruefpunkt, type Aktion, type PruefErgebnis,
} from '../../services/serverZustand'
import { SEAL_ABFRAGE, sealBefehlFehler, istSealSonderpunkt } from '../../services/sealStatus'
import { setzePruefZusammenfassung } from '../../services/serverMonitor'
import ZertifikateReiter from './ZertifikateReiter'
import { addHistoryEntry } from '../../services/serverHistory'
import { logDeviceAction } from '../../services/deviceDossier'

interface Props {
  host: string
  bezeichnung?: string
  by: string
  onClose: () => void
  onGeaendert: () => void
  /** z. B. „zertifikate" aus der Zertifikats-Meldung bzw. dem Kachel-Chip */
  startReiter?: Reiter
}

export type Reiter = 'status' | 'einrichten' | 'zertifikate' | 'software'

const GRUPPEN: { titel: string; typen: Pruefpunkt['typ'][] }[] = [
  { titel: 'Dienste', typen: ['dienst'] },
  { titel: 'IIS', typen: ['apppool', 'website'] },
  { titel: 'Ports', typen: ['port'] },
  { titel: 'Freigaben', typen: ['freigabe'] },
  { titel: 'Geplante Aufgaben', typen: ['aufgabe'] },
  { titel: 'Einstellungen', typen: ['festplatte', 'neustart', 'prozess'] },
  { titel: 'SEAL / PLOSSYS (sysstatus)', typen: ['seal'] },
]
const SEAL_GRUPPE = 'SEAL / PLOSSYS (sysstatus)'

const zeit = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'))
  return isNaN(d.getTime()) ? iso : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ServerZustandPanel({ host, bezeichnung, by, onClose, onGeaendert, startReiter }: Props) {
  const [reiter, setReiter] = useState<Reiter>(startReiter || 'status')
  const [soll, setSoll] = useState<SollZustand | null>(null)
  const [ist, setIst] = useState<IstStand | null>(null)
  const [inv, setInv] = useState<Inventar | null>(null)
  const [laden, setLaden] = useState(true)
  const [pruefend, setPruefend] = useState(false)
  const [analysierend, setAnalysierend] = useState(false)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  const [frage, setFrage] = useState<{ punkt: Pruefpunkt; aktion: Aktion; text: string } | null>(null)
  const [aktionLaeuft, setAktionLaeuft] = useState(false)

  useEffect(() => {
    let weg = false
    void Promise.all([ladeSoll(host), ladeIst(host), ladeInventar(host)]).then(([s, i, v]) => {
      if (weg) return
      setSoll(s); setIst(i); setInv(v); setLaden(false)
      if (!s && !startReiter) setReiter('einrichten')
    })
    return () => { weg = true }
  }, [host])

  // Escape schließt (nicht während einer Rückfrage)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !frage) onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose, frage])

  const jetztPruefen = useCallback(async (s?: SollZustand | null) => {
    const sz = s ?? soll
    if (!sz) return
    setPruefend(true)
    try {
      const i = await pruefe(host, sz)
      setIst(i)
      await setzePruefZusammenfassung(host, fasseZusammen(sz, i))
      onGeaendert()
    } finally { setPruefend(false) }
  }, [host, soll, onGeaendert])

  async function fuehreAus() {
    if (!frage) return
    const { punkt, aktion, text } = frage
    setAktionLaeuft(true)
    try {
      const r = await behebe(host, punkt, aktion)
      const protokoll = `${text}: ${punkt.anzeige}${punkt.typ === 'dienst' ? ` (${punkt.name})` : ''} — ${r.ok ? `Ergebnis: ${r.neu || 'OK'}` : `fehlgeschlagen: ${r.fehler}`}`
      await addHistoryEntry(host, protokoll, by).catch(() => undefined)
      await logDeviceAction(host, undefined, `Server-Monitor: ${protokoll}`, by, 'Server-Monitor')
      setMeldung({ ok: r.ok, text: protokoll })
      setFrage(null)
      await jetztPruefen()
    } finally { setAktionLaeuft(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onMouseDown={e => { if (e.target === e.currentTarget && !frage) onClose() }}>
      <div className="w-full max-w-3xl h-full bg-card border-l border-border shadow-2xl flex flex-col">
        {/* Kopf */}
        <div className="shrink-0 px-5 py-3 border-b border-border flex items-center gap-3">
          <ListChecks size={18} className="text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground truncate"><span className="font-mono">{host}</span>{bezeichnung && <span className="font-normal text-muted-foreground"> · {bezeichnung}</span>}</h2>
            <p className="text-[11px] text-muted-foreground">Dienste &amp; Prüfungen — was auf dem Server laufen muss und ob es läuft</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent" title="Schließen (Esc)"><X size={16} /></button>
        </div>
        <div className="shrink-0 px-5 pt-2 border-b border-border flex gap-1">
          {([['status', 'Status'], ['einrichten', 'Einrichten'], ['zertifikate', 'Zertifikate'], ['software', 'Software']] as [Reiter, string][]).map(([r, t]) => (
            <button key={r} onClick={() => setReiter(r)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 -mb-px ${reiter === r ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t}</button>
          ))}
        </div>

        {meldung && (
          <div className={`mx-5 mt-3 shrink-0 flex items-start gap-2 px-3 py-2 rounded-md text-xs border ${meldung.ok ? 'border-emerald-500/50 bg-emerald-500/10 text-foreground' : 'border-red-500/50 bg-red-500/10 text-foreground'}`}>
            {meldung.ok ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" /> : <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />}
            <span className="flex-1 break-words">{meldung.text}</span>
            <button onClick={() => setMeldung(null)} className="text-muted-foreground hover:text-foreground"><X size={12} /></button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {laden ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />Lade…</div>
          ) : reiter === 'status' ? (
            <StatusReiter soll={soll} ist={ist} pruefend={pruefend} onPruefen={() => void jetztPruefen()}
              onEinrichten={() => setReiter('einrichten')}
              onAktion={(punkt, aktion, text) => setFrage({ punkt, aktion, text })} />
          ) : reiter === 'einrichten' ? (
            <EinrichtenReiter host={host} by={by} soll={soll} inv={inv} analysierend={analysierend}
              onAnalysieren={async (sealBefehl?: string) => {
                setAnalysierend(true); setMeldung(null)
                try {
                  const r = await analysiere(host, sealBefehl)
                  if (r.ok && r.inventar) setInv(r.inventar)
                  else setMeldung({ ok: false, text: `Analyse fehlgeschlagen: ${r.fehler}` })
                } finally { setAnalysierend(false) }
              }}
              onGespeichert={async (s) => { setSoll(s); setReiter('status'); await jetztPruefen(s) }} />
          ) : reiter === 'zertifikate' ? (
            <ZertifikateReiter host={host} by={by} onGeaendert={onGeaendert} />
          ) : (
            <SoftwareReiter inv={inv} onAnalysieren={() => setReiter('einrichten')} />
          )}
        </div>
      </div>

      {/* Rückfrage vor jeder Behebung */}
      {frage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-amber-500 bg-card shadow-2xl overflow-hidden">
            <div className="px-5 py-3 bg-amber-400 text-black flex items-center gap-2">
              <AlertTriangle size={16} /><h3 className="text-sm font-bold">Wirklich ausführen?</h3>
            </div>
            <div className="px-5 py-4 space-y-2 text-sm text-foreground">
              <p><b>{frage.text}</b>: {frage.punkt.anzeige}{frage.punkt.typ === 'dienst' && <span className="font-mono text-xs text-muted-foreground"> ({frage.punkt.name})</span>}</p>
              <p>auf Server <b className="font-mono">{host}</b>{bezeichnung ? ` (${bezeichnung})` : ''}.</p>
              {frage.aktion === 'restart' && (frage.punkt.typ === 'dienst' || frage.punkt.typ === 'port') && (
                <p className="text-xs text-muted-foreground">Abhängige Dienste, die gerade laufen, werden kurz mit gestoppt und danach wieder gestartet. Während des Neustarts ist der Dienst für Benutzer nicht erreichbar.</p>
              )}
              <p className="text-xs text-muted-foreground">Wird mit deinem Namen in der Server-Historie und im Geräte-Dossier vermerkt.</p>
            </div>
            <div className="flex items-center gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setFrage(null)} disabled={aktionLaeuft} className="px-3 py-1.5 rounded-md text-xs text-foreground border border-border hover:bg-accent disabled:opacity-50">Abbrechen</button>
              <button onClick={() => void fuehreAus()} disabled={aktionLaeuft}
                className="ml-auto inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {aktionLaeuft ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}{aktionLaeuft ? 'Wird ausgeführt…' : 'Ausführen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Status ───────────────────────────────────────────────────────────────────
function StatusReiter({ soll, ist, pruefend, onPruefen, onEinrichten, onAktion }: {
  soll: SollZustand | null; ist: IstStand | null; pruefend: boolean
  onPruefen: () => void; onEinrichten: () => void; onAktion: (p: Pruefpunkt, a: Aktion, text: string) => void
}) {
  if (!soll || !soll.punkte.length) return (
    <div className="px-5 py-10 text-center space-y-3">
      <ListChecks size={36} className="mx-auto text-muted-foreground/50" />
      <p className="text-sm text-foreground">Für diesen Server ist noch nicht festgelegt, was laufen muss.</p>
      <p className="text-xs text-muted-foreground max-w-md mx-auto">Im Reiter „Einrichten" den Server analysieren lassen — das Tool schlägt die relevanten Dienste, Ports und Einstellungen vor, du bestätigst die Auswahl.</p>
      <button onClick={onEinrichten} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90"><ScanSearch size={13} />Einrichten</button>
    </div>
  )
  const erg = new Map<string, PruefErgebnis>((ist?.ergebnisse || []).map(e => [e.id, e]))
  const z = ist ? fasseZusammen(soll, ist) : null
  const ok = z ? z.gesamt - z.probleme - z.hinweise : 0
  return (
    <div className="px-5 py-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {z && ist?.erreichbar && <>
          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-600 text-white">{ok} OK</span>
          {z.probleme > 0 && <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-600 text-white">{z.probleme} Problem{z.probleme === 1 ? '' : 'e'}</span>}
          {z.hinweise > 0 && <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-400 text-black">{z.hinweise} Hinweis{z.hinweise === 1 ? '' : 'e'}</span>}
        </>}
        <span className="text-[11px] text-muted-foreground">
          {ist ? `geprüft ${zeit(ist.am)}` : 'noch nicht geprüft'}{ist?.boot ? ` · Server läuft seit ${zeit(ist.boot)}` : ''}
        </span>
        <button onClick={onPruefen} disabled={pruefend}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {pruefend ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Jetzt prüfen
        </button>
      </div>
      {ist && !ist.erreichbar && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-red-500/50 bg-red-500/10 text-xs text-foreground">
          <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" /><span>Server per WinRM nicht prüfbar: {ist.fehler}</span>
        </div>
      )}
      {ist?.startetNoch && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-amber-500/50 bg-amber-500/10 text-xs text-foreground">
          <Clock size={14} className="text-amber-500 shrink-0 mt-0.5" /><span>Der Server läuft erst seit wenigen Minuten — Dienste können noch starten. Es wird erst bei der nächsten Prüfung gemeldet.</span>
        </div>
      )}
      {GRUPPEN.map(g => {
        const punkte = soll.punkte.filter(p => g.typen.includes(p.typ))
        if (!punkte.length) return null
        const seal = g.titel === SEAL_GRUPPE
        // Abfrage selbst gescheitert → Systeme ohne Urteil (nicht „noch nicht geprüft")
        const sealOhne = seal && ist?.erreichbar && erg.get(SEAL_ABFRAGE)?.ok === false ? 'unbekannt — Abfrage fehlgeschlagen' : undefined
        return (
          <section key={g.titel}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{g.titel} ({punkte.length})</h3>
            {seal && ist?.seal?.gesamt && (
              <p className="text-[11px] text-foreground mb-1.5">sysstatus: <span className="font-mono">{ist.seal.gesamt}</span></p>
            )}
            {seal && !!ist?.seal?.neu.length && (
              <div className="mb-1.5 flex items-start gap-2 px-3 py-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 text-[11px] text-foreground">
                <Info size={13} className="text-amber-500 shrink-0 mt-0.5" />
                <span>Neu in sysstatus, noch nicht überwacht: <b>{ist.seal.neu.join(', ')}</b> — im Reiter „Einrichten" neu analysieren, anhaken und speichern.</span>
              </div>
            )}
            <div className="rounded-lg border border-border divide-y divide-border">
              {punkte.map(p => <StatusZeile key={p.id} p={p} e={erg.get(p.id)} ohneErgebnis={p.id !== SEAL_ABFRAGE ? sealOhne : undefined} onAktion={onAktion} />)}
            </div>
          </section>
        )
      })}
      <p className="text-[10px] text-muted-foreground">
        Automatische Prüfung alle 5 Minuten (gestaffelt, max. 2 Server gleichzeitig), nach jedem Neustart und wenn der Server wieder erreichbar ist. Rot = kritisch (Popup + Mail), gelb = Hinweis.
        {soll.punkte.some(p => p.typ === 'seal') && ' SEAL wird nur gelesen (sysstatus) — sysstart/sysstop ruft das Tool nie auf.'}
      </p>
    </div>
  )
}

function StatusZeile({ p, e, ohneErgebnis, onAktion }: { p: Pruefpunkt; e?: PruefErgebnis; ohneErgebnis?: string; onAktion: (p: Pruefpunkt, a: Aktion, text: string) => void }) {
  const [offen, setOffen] = useState(false)
  const zustand = !e ? 'offen' : e.ok ? (e.warnung ? 'hinweis' : 'ok') : p.stufe === 'kritisch' ? 'fehler' : 'hinweis'
  const aktionen = moeglicheAktionen(p, e)
  const ergebnis = p.typ === 'aufgabe' && e && !e.ok ? aufgabenErgebnis(e.detail) : undefined
  // Steckt der Fehler in der Aufgabe selbst, hilft „Jetzt ausführen" nicht → Knopf nicht hervorheben.
  const hervorheben = (zustand === 'fehler' || zustand === 'hinweis') && !ergebnis?.konfig
  const zeilen = e?.zeilen || []
  const chip = zustand === 'ok' ? 'bg-emerald-600 text-white' : zustand === 'fehler' ? 'bg-red-600 text-white' : zustand === 'hinweis' ? 'bg-amber-400 text-black' : 'bg-muted text-foreground'
  return (
    <div className="px-3 py-2 flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0">
        {zustand === 'ok' ? <CheckCircle2 size={15} className="text-emerald-500" /> : zustand === 'fehler' ? <XCircle size={15} className="text-red-500" /> : zustand === 'hinweis' ? <AlertTriangle size={15} className="text-amber-500" /> : <Clock size={15} className="text-muted-foreground" />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground break-words">{p.anzeige}</div>
        <div className="text-[10px] text-muted-foreground break-words">
          {p.typ === 'dienst' && <span className="font-mono">{p.name}</span>}
          {p.typ === 'aufgabe' && <span className="font-mono">{p.pfad}{p.name}</span>}
          {/* bei Aufgaben ist der Hinweis „zuletzt …" ein alter Stand vom Einrichten — die Prüfung liefert den aktuellen */}
          {/* SEAL ebenso: der Hinweis vom Einrichten („läuft · 17 Detailzeilen") würde dem aktuellen Stand widersprechen */}
          {p.hinweis && !(p.typ === 'aufgabe' && e?.detail) && !(p.typ === 'seal' && e) && <span>{p.typ === 'dienst' || p.typ === 'aufgabe' ? ' · ' : ''}{p.hinweis}</span>}
          {e?.detail && <span> · {e.detail}</span>}
        </div>
        {ergebnis && (
          <div className="text-[10px] mt-0.5 text-foreground break-words">
            <span className="font-semibold">Bedeutung {ergebnis.code}:</span> {ergebnis.text}
            {ergebnis.konfig && <span className="text-muted-foreground"> · „Jetzt ausführen" hilft hier nicht, die Aufgabe selbst muss korrigiert werden.</span>}
          </div>
        )}
        {e && !e.ok && istDcaDienst(p) && (
          <div className="text-[10px] mt-0.5 text-foreground break-words">
            <span className="font-semibold">Folge:</span> {DCA_AUSFALL}. Nicht deinstallieren oder zurücksetzen (Vorgabe Hilker &amp; Pahl).
          </div>
        )}
        {zeilen.length > 0 && (
          <div className="mt-1">
            <button onClick={() => setOffen(v => !v)} className="text-[10px] text-primary hover:underline">
              {offen ? 'Details ausblenden' : `Details (${zeilen.length} Zeile${zeilen.length === 1 ? '' : 'n'})`}
            </button>
            {offen && (
              <div className="mt-1 rounded border border-border bg-background px-2 py-1 space-y-px">
                {zeilen.map((z, i) => <SealZeile key={i} z={z} />)}
              </div>
            )}
          </div>
        )}
      </div>
      <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold ${chip}`}>{e ? e.status || (e.ok ? 'OK' : 'nicht OK') : ohneErgebnis || 'noch nicht geprüft'}</span>
      {aktionen.length > 0 && (
        <div className="shrink-0 flex gap-1">
          {aktionen.map(a => (
            <button key={a.aktion} onClick={() => onAktion(p, a.aktion, a.text)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${hervorheben ? 'border-primary bg-primary text-primary-foreground hover:opacity-90' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
              {a.aktion === 'restart' ? <RotateCcw size={10} /> : <Play size={10} />}{a.text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Eine Zeile aus sysstatus — Fehler/Warnungen farbig markiert. */
function SealZeile({ z }: { z: string }) {
  const marke = /^\[([A-Z])\]/.exec(z.trim())?.[1]
  const art = marke === 'E' || marke === 'F' || marke === 'C' ? 'fehler'
    : marke === 'W' || /\b(not running|not working|not alive|not all|stopped|failed|dead|invalid|expired|unreachable)\b/i.test(z) ? 'warnung' : ''
  return (
    <div className="text-[10px] font-mono text-foreground whitespace-pre-wrap break-all">
      {art && <span className={`mr-1 px-1 rounded font-sans font-semibold ${art === 'fehler' ? 'bg-red-600 text-white' : 'bg-amber-400 text-black'}`}>{art === 'fehler' ? 'Fehler' : 'Warnung'}</span>}
      {z}
    </div>
  )
}

// ── Einrichten ───────────────────────────────────────────────────────────────
function EinrichtenReiter({ host, by, soll, inv, analysierend, onAnalysieren, onGespeichert }: {
  host: string; by: string; soll: SollZustand | null; inv: Inventar | null; analysierend: boolean
  onAnalysieren: (sealBefehl?: string) => void; onGespeichert: (s: SollZustand) => void
}) {
  // Alle möglichen Punkte = Vorschlag aus der Analyse + bereits gespeicherte (auch wenn sie fehlen)
  const vorschlag = useMemo(() => inv ? baueVorschlag(inv) : [], [inv])
  const punkte = useMemo(() => {
    const m = new Map<string, { punkt: Pruefpunkt; vorgeschlagen: boolean }>()
    for (const v of vorschlag) m.set(v.punkt.id, { punkt: v.punkt, vorgeschlagen: v.vorgeschlagen })
    for (const p of soll?.punkte || []) m.set(p.id, { punkt: { ...(m.get(p.id)?.punkt || {}), ...p }, vorgeschlagen: m.get(p.id)?.vorgeschlagen ?? false })
    return [...m.values()]
  }, [vorschlag, soll])

  const [auswahl, setAuswahl] = useState<Map<string, Pruefpunkt>>(new Map())
  const [initial, setInitial] = useState(false)
  useEffect(() => {
    if (initial || (!soll && !inv)) return
    const m = new Map<string, Pruefpunkt>()
    if (soll) for (const p of soll.punkte) m.set(p.id, p)
    else for (const v of vorschlag) if (v.vorgeschlagen) m.set(v.punkt.id, v.punkt)
    setAuswahl(m); setInitial(true)
  }, [soll, inv, vorschlag, initial])

  // Wichtiges, das eine Analyse neu findet, gleich mit anhaken (gespeichert wird erst per Knopf):
  //  - SEAL-Punkte, wenn das Soll noch keine SEAL-Punkte hat
  //  - ECI-DCA-Dienste (Zählerstände an Hilker & Pahl), die noch nicht im Soll stehen
  const ergaenzt = useRef('')
  const [ergaenztInfo, setErgaenztInfo] = useState('')
  useEffect(() => {
    if (!initial || !inv || ergaenzt.current === inv.am) return
    ergaenzt.current = inv.am
    // nur echte SEAL-Systeme zählen — ist bisher nur „Statusabfrage" gespeichert (Ausgabe war nicht
    // erkannt), werden die jetzt gefundenen Systeme trotzdem angehakt
    const sollHatSeal = !!soll?.punkte.some(p => p.typ === 'seal' && !istSealSonderpunkt(p.id))
    const imSoll = new Set((soll?.punkte || []).map(p => p.id))
    const neu = vorschlag.filter(v => v.vorgeschlagen && !imSoll.has(v.punkt.id)
      && ((v.punkt.typ === 'seal' && !sollHatSeal) || istDcaDienst(v.punkt)))
    if (!neu.length) return
    setAuswahl(prev => {
      const n = new Map(prev)
      for (const v of neu) if (!n.has(v.punkt.id)) n.set(v.punkt.id, v.punkt)
      return n
    })
    const dca = neu.filter(v => istDcaDienst(v.punkt)).map(v => v.punkt.anzeige)
    const seal = neu.filter(v => v.punkt.typ === 'seal').length
    if (soll) setErgaenztInfo([
      dca.length ? `ECI DCA erkannt und angehakt (${dca.join(', ')})` : '',
      seal ? `${seal} SEAL-Prüfpunkte angehakt` : '',
    ].filter(Boolean).join(' · ') + ' — zum Übernehmen „Als Soll-Zustand speichern".')
  }, [initial, inv, soll, vorschlag])

  const [alleDienste, setAlleDienste] = useState(false)
  const [suche, setSuche] = useState('')
  const [prozess, setProzess] = useState('')
  const [speichernd, setSpeichernd] = useState(false)
  const [sealBefehl, setSealBefehl] = useState(() => soll?.punkte.find(p => p.typ === 'seal' && p.befehl)?.befehl || '')
  const [sealRoh, setSealRoh] = useState(false)
  const sealFehler = sealBefehlFehler(sealBefehl)

  const umschalten = (p: Pruefpunkt) => setAuswahl(prev => { const n = new Map(prev); if (n.has(p.id)) n.delete(p.id); else n.set(p.id, p); return n })
  const aendere = (id: string, patch: Partial<Pruefpunkt>) => setAuswahl(prev => { const n = new Map(prev); const p = n.get(id); if (p) n.set(id, { ...p, ...patch }); return n })

  async function speichern() {
    if (sealFehler) return
    setSpeichernd(true)
    try {
      const b = sealBefehl.trim() || undefined
      const s: SollZustand = { host: host.toUpperCase(), punkte: [...auswahl.values()].map(p => p.typ === 'seal' ? { ...p, befehl: b } : p), geaendertAm: new Date().toISOString(), geaendertVon: by }
      if (await speichereSoll(s)) {
        await addHistoryEntry(host, `Soll-Zustand festgelegt: ${s.punkte.length} Prüfpunkte`, by).catch(() => undefined)
        onGespeichert(s)
      }
    } finally { setSpeichernd(false) }
  }

  const q = suche.trim().toLowerCase()
  return (
    <div className="flex flex-col min-h-full">
      <div className="px-5 py-4 space-y-4 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => onAnalysieren(sealFehler ? undefined : sealBefehl)} disabled={analysierend}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {analysierend ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />}{analysierend ? 'Analysiere… (bis 2 Min.)' : inv ? 'Neu analysieren' : 'Server analysieren'}
          </button>
          <span className="text-[11px] text-muted-foreground">{inv ? `Analyse vom ${zeit(inv.am)} · ${inv.os || ''}` : 'Liest Dienste, Software, IIS, Aufgaben, Ports, Freigaben, Festplatten und ggf. SEAL-sysstatus — nur lesend.'}</span>
        </div>
        {!inv && !soll && <p className="text-xs text-muted-foreground">Nach der Analyse sind die vorgeschlagenen Punkte schon angehakt — du musst nur noch prüfen und speichern.</p>}
        {ergaenztInfo && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-primary/50 bg-primary/10 text-xs text-foreground">
            <Info size={14} className="text-primary shrink-0 mt-0.5" /><span>{ergaenztInfo}</span>
          </div>
        )}
        {inv && (
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Suchen (Name, Dienst, Port …)"
              className="w-full pl-6 pr-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground" />
          </div>
        )}
        {GRUPPEN.map(g => {
          let liste = punkte.filter(x => g.typen.includes(x.punkt.typ))
          if (g.titel === 'Dienste' && !alleDienste && !q) liste = liste.filter(x => x.vorgeschlagen || auswahl.has(x.punkt.id))
          if (q) liste = liste.filter(x => `${x.punkt.anzeige} ${x.punkt.name} ${x.punkt.hinweis || ''}`.toLowerCase().includes(q))
          const gesamt = punkte.filter(x => g.typen.includes(x.punkt.typ)).length
          if (!gesamt && g.titel !== 'Einstellungen') return null
          const gewaehlt = punkte.filter(x => g.typen.includes(x.punkt.typ) && auswahl.has(x.punkt.id)).length
          return (
            <section key={g.titel}>
              <div className="flex items-center gap-2 mb-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.titel}</h3>
                <span className="text-[10px] text-muted-foreground">{gewaehlt} von {gesamt} ausgewählt</span>
                {g.titel === 'Dienste' && !q && (
                  <button onClick={() => setAlleDienste(v => !v)} className="ml-auto text-[10px] text-primary hover:underline">{alleDienste ? 'nur vorgeschlagene zeigen' : `alle ${gesamt} Dienste zeigen`}</button>
                )}
              </div>
              <div className="rounded-lg border border-border divide-y divide-border">
                {liste.map(({ punkt, vorgeschlagen }) => {
                  const sel = auswahl.get(punkt.id)
                  return (
                    <div key={punkt.id} className="px-3 py-1.5 flex items-center gap-2.5">
                      <input type="checkbox" checked={!!sel} onChange={() => umschalten(punkt)} className="rounded accent-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-foreground break-words">{punkt.anzeige}
                          {vorgeschlagen && <span className="ml-1.5 px-1 rounded text-[9px] font-semibold bg-primary/15 text-primary">vorgeschlagen</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground break-words">
                          {(punkt.typ === 'dienst' || punkt.typ === 'aufgabe') && <span className="font-mono">{punkt.typ === 'aufgabe' ? punkt.pfad : ''}{punkt.name}</span>}
                          {punkt.hinweis && <span>{punkt.typ === 'dienst' || punkt.typ === 'aufgabe' ? ' · ' : ''}{punkt.hinweis}</span>}
                        </div>
                      </div>
                      {sel && punkt.typ === 'festplatte' && (
                        <label className="shrink-0 text-[10px] text-muted-foreground flex items-center gap-1">mind.
                          <input type="number" min={1} max={90} value={sel.wert ?? 10}
                            onChange={e => { const w = Math.max(1, Math.min(90, Number(e.target.value) || 10)); aendere(punkt.id, { wert: w, anzeige: `Laufwerk ${punkt.name} mind. ${w} % frei` }) }}
                            className="w-12 px-1 py-0.5 rounded border border-border bg-background text-foreground text-[11px]" />% frei</label>
                      )}
                      {sel && (
                        <button onClick={() => aendere(punkt.id, { stufe: sel.stufe === 'kritisch' ? 'hinweis' : 'kritisch' })}
                          title="Kritisch = Popup + Mail bei Fehler · Hinweis = nur gelb anzeigen"
                          className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${sel.stufe === 'kritisch' ? 'bg-red-600 text-white' : 'bg-amber-400 text-black'}`}>
                          {sel.stufe === 'kritisch' ? 'kritisch' : 'Hinweis'}
                        </button>
                      )}
                    </div>
                  )
                })}
                {!liste.length && <div className="px-3 py-2 text-[11px] text-muted-foreground">{q ? 'Keine Treffer.' : 'Nichts gefunden.'}</div>}
              </div>
              {g.titel === SEAL_GRUPPE && (
                <div className="mt-2 rounded-lg border border-border px-3 py-2 space-y-1.5 text-[11px] text-foreground">
                  {inv?.seal ? <>
                    <div><span className="text-muted-foreground">SEAL-Installation:</span> <span className="font-mono break-all">{inv.seal.root}</span></div>
                    <div><span className="text-muted-foreground">sysstatus:</span> <span className="font-mono break-all">{inv.seal.sysstatus || '— nicht gefunden'}</span></div>
                    <div><span className="text-muted-foreground">SEAL-Umgebung:</span> <span className="font-mono break-all">{inv.seal.sitwelcome || '— nicht gefunden (PLSROOT/PLSDATA werden selbst gesetzt)'}</span>
                      {inv.seal.umgebungQuelle && <span className="text-muted-foreground"> · aus {inv.seal.umgebungQuelle}</span>}</div>
                    {/\.pl$/i.test(inv.seal.sysstatus || '') && (
                      <div><span className="text-muted-foreground">Perl:</span> <span className="font-mono break-all">{inv.seal.perl || '— nicht gefunden (es wird „perl" aus dem PATH versucht)'}</span></div>
                    )}
                    {inv.seal.befehl && <div><span className="text-muted-foreground">Aufruf:</span> <span className="font-mono break-all text-[10px]">{inv.seal.befehl}</span></div>}
                    {inv.seal.fehler && (
                      <div className="flex items-start gap-1.5"><span className="shrink-0 px-1 rounded font-semibold bg-red-600 text-white">Fehler</span><span className="break-words">{inv.seal.fehler}</span></div>
                    )}
                    {!!inv.seal.roh && (
                      <div>
                        <button onClick={() => setSealRoh(v => !v)} className="text-[10px] text-primary hover:underline">{sealRoh ? 'Ausgabe ausblenden' : 'Ausgabe des Probelaufs anzeigen'}</button>
                        {sealRoh && <pre className="mt-1 max-h-64 overflow-auto rounded border border-border bg-background px-2 py-1 text-[10px] font-mono text-foreground whitespace-pre-wrap break-all">{inv.seal.roh}</pre>}
                      </div>
                    )}
                  </> : <div className="text-muted-foreground">Für die gefundenen Systeme und Pfade bitte „Neu analysieren".</div>}
                  <label className="block pt-1">
                    <span className="text-muted-foreground">Befehl von Hand (nur nötig, wenn die automatische Suche nicht klappt):</span>
                    <input value={sealBefehl} onChange={e => setSealBefehl(e.target.value)} placeholder="leer = automatisch, z. B. D:\Seal\applications\bin\sysstatus.bat"
                      className="mt-0.5 w-full px-2 py-1 rounded-md bg-background border border-border text-[11px] font-mono text-foreground" />
                  </label>
                  {sealFehler && <div className="flex items-start gap-1.5"><span className="shrink-0 px-1 rounded font-semibold bg-red-600 text-white">Abgelehnt</span><span>{sealFehler}</span></div>}
                  <p className="text-[10px] text-muted-foreground">Das Tool ruft nur sysstatus auf (lesend). sysstart/sysstop oder andere Befehle werden abgelehnt.</p>
                </div>
              )}
            </section>
          )
        })}
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Eigener Prüfpunkt</h3>
          <div className="flex items-center gap-2">
            <input value={prozess} onChange={e => setProzess(e.target.value)} placeholder="Prozessname, der laufen muss (z. B. lmgrd)"
              className="flex-1 px-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground" />
            <button onClick={() => {
              const n = prozess.trim().replace(/\.exe$/i, '')
              if (!n) return
              const p: Pruefpunkt = { id: `prozess:${n}`, typ: 'prozess', name: n, anzeige: `Prozess ${n}.exe läuft`, stufe: 'kritisch' }
              setAuswahl(prev => new Map(prev).set(p.id, p)); setProzess('')
            }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs border border-border text-foreground hover:bg-accent"><Plus size={12} />Hinzufügen</button>
          </div>
          {[...auswahl.values()].filter(p => p.typ === 'prozess').map(p => (
            <div key={p.id} className="mt-1 flex items-center gap-2 text-xs text-foreground">
              <input type="checkbox" checked onChange={() => umschalten(p)} className="rounded accent-primary" />{p.anzeige}
            </div>
          ))}
        </section>
      </div>
      <div className="sticky bottom-0 px-5 py-3 border-t border-border bg-card flex items-center gap-2">
        <Info size={13} className="text-muted-foreground shrink-0" />
        <span className="text-[11px] text-muted-foreground flex-1">{auswahl.size} Prüfpunkte ausgewählt{soll ? ` · zuletzt geändert ${zeit(soll.geaendertAm)} von ${soll.geaendertVon}` : ''}</span>
        <button onClick={() => void speichern()} disabled={speichernd || !auswahl.size || !!sealFehler}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {speichernd ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Als Soll-Zustand speichern
        </button>
      </div>
    </div>
  )
}

// ── Software ─────────────────────────────────────────────────────────────────
function SoftwareReiter({ inv, onAnalysieren }: { inv: Inventar | null; onAnalysieren: () => void }) {
  const [suche, setSuche] = useState('')
  if (!inv) return (
    <div className="px-5 py-10 text-center space-y-3">
      <Package size={36} className="mx-auto text-muted-foreground/50" />
      <p className="text-sm text-foreground">Noch keine Analyse vorhanden.</p>
      <button onClick={onAnalysieren} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90"><ScanSearch size={13} />Zur Analyse</button>
    </div>
  )
  const q = suche.trim().toLowerCase()
  const sw = inv.software.filter(s => !q || `${s.n} ${s.v || ''} ${s.h || ''}`.toLowerCase().includes(q))
  return (
    <div className="px-5 py-4 space-y-4">
      <div className="text-xs text-foreground space-y-1">
        <div><span className="text-muted-foreground">Betriebssystem:</span> {inv.os || '—'}</div>
        <div><span className="text-muted-foreground">Analyse:</span> {zeit(inv.am)} · {inv.dienste.length} Dienste · {inv.software.length} Programme</div>
        {inv.rollen.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap"><span className="text-muted-foreground">Rollen:</span>
            {inv.rollen.map(r => <span key={r} className="px-1.5 py-0.5 rounded bg-muted text-foreground text-[10px]">{r}</span>)}
          </div>
        )}
      </div>
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Software suchen…"
          className="w-full pl-6 pr-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground" />
      </div>
      <table className="w-full text-xs">
        <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
          <th className="py-1 pr-2 font-semibold">Programm</th><th className="py-1 pr-2 font-semibold">Version</th><th className="py-1 font-semibold">Hersteller</th>
        </tr></thead>
        <tbody className="divide-y divide-border">
          {sw.map(s => (
            <tr key={`${s.n}|${s.v}`}><td className="py-1 pr-2 text-foreground">{s.n}</td><td className="py-1 pr-2 text-muted-foreground font-mono text-[11px]">{s.v || '—'}</td><td className="py-1 text-muted-foreground">{s.h || '—'}</td></tr>
          ))}
        </tbody>
      </table>
      {!sw.length && <p className="text-[11px] text-muted-foreground">Keine Treffer.</p>}
    </div>
  )
}
