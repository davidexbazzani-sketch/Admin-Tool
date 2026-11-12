// ── Vor jeder Software-Installation: angemeldet ↔ zugewiesen ─────────────────
// • <AnmeldeStatus host> — Zeile im Ziel-PC-Bereich: prüft beim Wählen des PCs, wer
//   angemeldet ist und wem das Gerät zugewiesen ist.
// • useAnmeldeCheck() — `vorStart(host(s), aktion)` vor jedem Installationsstart: prüft
//   (bzw. nimmt ein höchstens 2 Minuten altes Ergebnis) und zeigt einen Hinweis, wenn nicht
//   die zugewiesene Person angemeldet ist. „Trotzdem installieren" startet wie gewohnt.
// Nur lesend; die Logik steckt in services/anmeldeAbgleich.ts.

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, UserCheck, UserX } from 'lucide-react'
import {
  useAnmeldeStore, frischesErgebnis, merkeBestaetigung, istBestaetigt, benutzerText, zuweisungText, kanonHost,
  STUFE_TITEL, FRISCH_FUER_START_MS, type AnmeldeAbgleich, type AbgleichStufe,
} from '../../services/anmeldeAbgleich'
import { isValidRemoteTarget } from '../../utils/remoteTarget'

const FARBE: Record<AbgleichStufe, string> = {
  passt: 'border-emerald-500/30 bg-emerald-500/5',
  fremd: 'border-amber-500/50 bg-amber-500/10',
  niemand: 'border-border bg-background',
  'ohne-zuweisung': 'border-border bg-background',
  unbekannt: 'border-border bg-background',
}

function StufeIcon({ stufe, size = 13 }: { stufe: AbgleichStufe; size?: number }) {
  if (stufe === 'passt') return <UserCheck size={size} className="text-emerald-500 shrink-0" />
  if (stufe === 'fremd') return <AlertTriangle size={size} className="text-amber-500 shrink-0" />
  if (stufe === 'unbekannt') return <UserX size={size} className="text-muted-foreground shrink-0" />
  return <Info size={size} className="text-muted-foreground shrink-0" />
}

function angemeldetText(e: AnmeldeAbgleich): string {
  if (e.angemeldet.length) return e.angemeldet.map(b => benutzerText(b)).join(', ')
  return e.stufe === 'unbekannt' ? 'nicht ermittelbar' : 'niemand'
}

/** Statuszeile „Angemeldet / zugewiesen" für den gewählten Ziel-PC. */
export function AnmeldeStatus({ host, kompakt }: { host: string; kompakt?: boolean }) {
  const h = host.trim()
  const key = kanonHost(h).toLowerCase()
  const eintrag = useAnmeldeStore(s => s.eintraege[key])
  const pruefe = useAnmeldeStore(s => s.pruefe)
  const gueltig = !!h && isValidRemoteTarget(h)

  useEffect(() => { if (gueltig) void pruefe(h, FRISCH_FUER_START_MS) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key, gueltig])

  if (!gueltig) return null
  const e = eintrag?.ergebnis
  const laeuft = !!eintrag?.laeuft

  if (!e) {
    return (
      <p className={`flex items-center gap-1.5 text-[11px] text-muted-foreground ${kompakt ? '' : 'px-2.5 py-1.5 rounded-md border border-border'}`} data-anmelde-status="prueft">
        <Loader2 size={11} className="animate-spin shrink-0" />Prüfe, wer auf {h} angemeldet ist …
      </p>
    )
  }

  const neu = (
    <button onClick={() => void pruefe(h)} disabled={laeuft} title="Erneut prüfen, wer angemeldet ist"
      className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-40">
      {laeuft ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
    </button>
  )

  if (kompakt) {
    return (
      <p className={`flex items-start gap-1 text-[11px] ${e.stufe === 'fremd' ? 'text-amber-500' : 'text-muted-foreground'}`} data-anmelde-status={e.stufe}>
        <StufeIcon stufe={e.stufe} size={11} />
        <span className="min-w-0">
          angemeldet: <span className={e.stufe === 'fremd' ? 'font-semibold' : 'text-foreground'}>{angemeldetText(e)}</span>
          {' · '}zugewiesen: <span className={e.stufe === 'fremd' ? 'font-semibold' : 'text-foreground'}>{zuweisungText(e.zuweisung)}</span>
          {e.stufe === 'fremd' && ' — nicht dieselbe Person'}
        </span>
        {neu}
      </p>
    )
  }

  return (
    <div className={`rounded-md border px-2.5 py-2 space-y-0.5 ${FARBE[e.stufe]}`} data-anmelde-status={e.stufe}>
      <div className="flex items-center gap-1.5">
        <StufeIcon stufe={e.stufe} />
        <span className={`text-xs font-semibold ${e.stufe === 'fremd' ? 'text-amber-500' : e.stufe === 'passt' ? 'text-emerald-500' : 'text-foreground'}`}>
          {STUFE_TITEL[e.stufe]}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          geprüft {new Date(e.geprueftAm).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}{neu}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground pl-[19px]">
        Angemeldet: <span className="text-foreground">{angemeldetText(e)}</span>
      </p>
      <p className="text-[11px] text-muted-foreground pl-[19px]">
        Zugewiesen: <span className="text-foreground">{zuweisungText(e.zuweisung)}</span>
        {e.zuweisung && <span> · laut {e.zuweisung.quelle}</span>}
      </p>
      {e.stufe === 'fremd' && (
        <p className="text-[11px] text-amber-500 pl-[19px]">Bitte prüfen, ob das der richtige PC ist — vor dem Start kommt noch einmal ein Hinweis.</p>
      )}
      {e.stufe === 'unbekannt' && e.fehler && <p className="text-[10px] text-muted-foreground pl-[19px] break-words">{e.fehler}</p>}
    </div>
  )
}

interface Offen { phase: 'prueft' | 'warnung'; hosts: string[]; fremd: AnmeldeAbgleich[]; aktion: () => void }

/**
 * Vor jedem Installationsstart: `vorStart(host oder hosts, aktion)`. Ist bei einem PC nicht
 * die zugewiesene Person angemeldet, kommt erst der Hinweis — sonst startet die Aktion sofort.
 * `anmeldeDialog` muss die Kachel rendern.
 */
export function useAnmeldeCheck() {
  const [offen, setOffen] = useState<Offen | null>(null)
  const lauf = useRef(0)
  const da = useRef(true)
  const pruefe = useAnmeldeStore(s => s.pruefe)
  useEffect(() => { da.current = true; return () => { da.current = false } }, [])

  async function vorStart(ziel: string | string[], aktion: () => void) {
    const alle = [...new Set((Array.isArray(ziel) ? ziel : [ziel]).map(h => h.trim()).filter(h => h && isValidRemoteTarget(h)))]
    const zuPruefen = alle.filter(h => !istBestaetigt(h))
    if (!zuPruefen.length) { aktion(); return }
    const nr = ++lauf.current
    let ergebnisse = zuPruefen.map(h => frischesErgebnis(h, FRISCH_FUER_START_MS))
    if (ergebnisse.some(e => !e)) {
      setOffen({ phase: 'prueft', hosts: zuPruefen, fremd: [], aktion })
      ergebnisse = await Promise.all(zuPruefen.map(h => pruefe(h, FRISCH_FUER_START_MS)))
    }
    if (nr !== lauf.current || !da.current) return   // abgebrochen oder Kachel verlassen
    const fremd = ergebnisse.filter((e): e is AnmeldeAbgleich => e?.stufe === 'fremd')
    if (!fremd.length) { setOffen(null); aktion(); return }
    setOffen({ phase: 'warnung', hosts: zuPruefen, fremd, aktion })
  }

  function abbrechen() { lauf.current++; setOffen(null) }
  function trotzdem() {
    const o = offen
    if (!o) return
    lauf.current++
    o.fremd.forEach(e => merkeBestaetigung(e.host))
    setOffen(null)
    o.aktion()
  }
  function ohnePruefung() {
    const o = offen
    if (!o) return
    lauf.current++
    setOffen(null)
    o.aktion()
  }

  const anmeldeDialog = offen && (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-6" onClick={e => { e.stopPropagation(); abbrechen() }}>
      <div className="bg-card border border-border rounded-xl shadow-2xl p-5 w-full max-w-lg space-y-3" onClick={e => e.stopPropagation()} data-anmelde-dialog={offen.phase}>
        {offen.phase === 'prueft' ? (
          <>
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-blue-400" />
              <h3 className="text-sm font-semibold text-foreground">Vor der Installation: Wer ist angemeldet?</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Prüfe auf {offen.hosts.length === 1 ? <span className="font-mono text-foreground">{offen.hosts[0]}</span> : `${offen.hosts.length} PCs`}, ob die Person angemeldet ist, der das Gerät zugewiesen ist …
            </p>
            <div className="flex gap-2 pt-1">
              <button onClick={abbrechen} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Abbrechen</button>
              <button onClick={ohnePruefung} className="ml-auto px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent" data-knopf="ohne-pruefung">
                Nicht abwarten, gleich starten
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500" />
              <h3 className="text-sm font-semibold text-foreground">Achtung: Nicht die zugewiesene Person ist angemeldet</h3>
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {offen.fremd.map(e => (
                <div key={e.host} className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs space-y-0.5" data-fremd={e.host}>
                  <p className="font-mono font-semibold text-foreground">{e.host}</p>
                  <p className="text-muted-foreground">Angemeldet: <span className="text-foreground font-semibold">{angemeldetText(e)}</span></p>
                  <p className="text-muted-foreground">Zugewiesen: <span className="text-foreground font-semibold">{zuweisungText(e.zuweisung)}</span>{e.zuweisung && <span> · laut {e.zuweisung.quelle}</span>}</p>
                </div>
              ))}
            </div>
            {offen.hosts.length > offen.fremd.length && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CheckCircle2 size={12} className="text-emerald-500" />Bei den übrigen {offen.hosts.length - offen.fremd.length} PC(s) gibt es keinen Hinweis.
              </p>
            )}
            <p className="text-xs text-foreground">
              Bitte prüfen, ob das wirklich der richtige PC ist. Wird trotzdem installiert, läuft alles wie gewohnt — der Hinweis wird im Logbuch vermerkt.
            </p>
            <div className="flex gap-2 pt-1">
              <button onClick={abbrechen} autoFocus className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent" data-knopf="abbrechen">Abbrechen</button>
              <button onClick={trotzdem} className="ml-auto px-4 py-1.5 text-xs rounded-md font-semibold bg-amber-600 hover:bg-amber-500 text-white" data-knopf="trotzdem">
                Trotzdem installieren
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  return { vorStart, anmeldeDialog }
}
