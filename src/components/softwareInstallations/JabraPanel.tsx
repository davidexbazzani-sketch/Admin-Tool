// ── Jabra Software: Erkennung + stille Installation für EINEN PC ────────────
// Bewusst ohne Zielauswahl, damit dieselbe Oberfläche an beiden Stellen passt:
//   · Kachel „Jabra Software" (Software Installationen) — davor die Benutzersuche
//   · Daylis → „Sound Fix", 4. Schritt — der PC steht dort schon fest

import { useEffect, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Headphones, Loader2, PackageCheck, Search,
} from 'lucide-react'
import { erkenneJabra, type JabraErkennung } from '../../services/jabraInstall'
import { useJabraInstallStore } from '../../store/jabraInstallStore'

function mmss(s: number): string {
  const m = Math.floor(s / 60), r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export default function JabraPanel({ host, kompakt }: { host: string; kompakt?: boolean }) {
  const [prueft, setPrueft] = useState(false)
  const [erkennung, setErkennung] = useState<JabraErkennung | null>(null)
  const [dauer, setDauer] = useState(0)

  const key = host.trim().toLowerCase()
  // Eng gefasst: nur dieser Host, nicht jede Änderung an irgendeinem Lauf.
  const lauf = useJabraInstallStore(s => s.laeufe[key])
  const starte = useJabraInstallStore(s => s.starte)
  const verwerfe = useJabraInstallStore(s => s.verwerfe)
  const laeuft = lauf?.phase === 'laeuft' || lauf?.phase === 'wartet'

  // Beim Wechsel des Ziel-PCs die alte Erkennung verwerfen — sonst steht die
  // Geräteliste des vorigen Rechners unter dem neuen Namen.
  useEffect(() => { setErkennung(null); setDauer(0) }, [key])

  useEffect(() => {
    if (!laeuft) return
    const t = setInterval(() => setDauer(d => d + 1), 1000)
    return () => clearInterval(t)
  }, [laeuft])

  async function pruefen() {
    if (prueft || !host) return
    setPrueft(true)
    setErkennung(await erkenneJabra(host))
    setPrueft(false)
  }

  // Nach erfolgreicher Installation den Stand einmal nachziehen, damit „installiert"
  // und die Version stimmen, ohne dass der Bediener nochmal klicken muss.
  useEffect(() => {
    if (lauf?.phase === 'fertig') void pruefen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lauf?.phase])

  if (!host) return <p className="text-xs text-muted-foreground italic">Kein Ziel-PC gewählt.</p>

  const geraeteGefunden = (erkennung?.geraete.length ?? 0) > 0

  return (
    <div className="space-y-3">
      {!kompakt && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Installiert <b>Jabra Direct</b> still auf <span className="font-mono text-foreground">{host}</span> — ohne Fenster und ohne Zutun des Anwenders.
          Das Setup wird vom Netzlaufwerk über diesen Admin-PC auf den Ziel-PC übertragen und dort im Hintergrund ausgeführt.
          Die Geräteprüfung ist unabhängig davon: installieren lässt sich auch, wenn gerade kein Jabra-Gerät angeschlossen ist.
        </p>
      )}

      {/* ── Geräteprüfung ───────────────────────────────────────────────────── */}
      <div className="rounded-md border border-border bg-background p-2.5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Headphones size={14} className="text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold text-foreground">Angeschlossenes Jabra-Gerät</span>
          <button onClick={pruefen} disabled={prueft}
            className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
            {prueft ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
            {prueft ? 'wird geprüft …' : erkennung ? 'Erneut prüfen' : 'Jetzt prüfen'}
          </button>
        </div>

        {!erkennung && !prueft && <p className="text-[11px] text-muted-foreground italic">Noch nicht geprüft.</p>}

        {erkennung?.fehler && (
          <p className="flex items-start gap-1.5 text-[11px] text-red-300">
            <AlertTriangle size={12} className="shrink-0 mt-px" />{erkennung.fehler}
          </p>
        )}

        {erkennung?.ok && (
          <>
            <p className={`flex items-center gap-1.5 text-xs font-semibold ${geraeteGefunden ? 'text-emerald-300' : 'text-muted-foreground'}`}>
              {geraeteGefunden ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} className="text-muted-foreground" />}
              {geraeteGefunden ? 'Jabra Gerät erkannt' : 'Kein Jabra-Gerät angeschlossen'}
            </p>
            {geraeteGefunden && (
              <div className="rounded border border-border divide-y divide-border/60">
                {erkennung.geraete.map(g => (
                  <div key={g.name} className="px-2 py-1.5">
                    <span className="block text-[11px] text-foreground">{g.name}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {g.quellen}{g.klassen ? ` · ${g.klassen}` : ''}{g.status && g.status !== 'OK' ? ` · Status: ${g.status}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {!geraeteGefunden && (
              <p className="text-[10px] text-muted-foreground">
                Die Installation ist trotzdem möglich — Jabra Direct wird dann für das nächste angesteckte Gerät vorbereitet.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground border-t border-border/50 pt-1.5">
              Jabra Direct auf diesem PC:{' '}
              {erkennung.installiert
                ? <span className="text-emerald-300 font-semibold">installiert{erkennung.version ? ` (Version ${erkennung.version})` : ''}</span>
                : <span className="text-amber-300 font-semibold">nicht installiert</span>}
            </p>
          </>
        )}
      </div>

      {/* ── Installation ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => starte(host)} disabled={laeuft}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-40">
          {laeuft ? <Loader2 size={13} className="animate-spin" /> : <PackageCheck size={13} />}
          {laeuft ? 'Installation läuft …' : erkennung?.installiert ? 'Erneut installieren' : 'Jabra Direct installieren'}
        </button>
        {lauf?.phase === 'wartet' && <span className="text-[11px] text-muted-foreground">wartet auf einen freien Platz …</span>}
        {laeuft && <span className="text-[11px] text-muted-foreground tabular-nums">läuft seit {mmss(dauer)}</span>}
        {(lauf?.phase === 'fertig' || lauf?.phase === 'fehler') && (
          <button onClick={() => verwerfe(host)} className="text-[11px] text-muted-foreground hover:text-foreground underline">Meldung schließen</button>
        )}
      </div>

      {laeuft && (
        <p className="text-[11px] text-amber-300">
          Das Übertragen und Installieren dauert zusammen meist 3–10 Minuten. Bitte das Fenster so lange offen lassen —
          am Ende erscheint hier eine Bestätigung. Der Anwender am PC bemerkt davon nichts.
        </p>
      )}

      {lauf && (
        <div className="rounded-md border border-border divide-y divide-border/60">
          {lauf.schritte.map(s => (
            <div key={s.id} className="flex items-start gap-2 px-2.5 py-1.5">
              <span className="shrink-0 mt-px">
                {s.status === 'laeuft' ? <Loader2 size={12} className="animate-spin text-blue-400" />
                  : s.status === 'ok' ? <CheckCircle2 size={12} className="text-emerald-400" />
                  : s.status === 'fehler' ? <AlertTriangle size={12} className="text-red-400" />
                  : s.status === 'warnung' ? <AlertTriangle size={12} className="text-amber-400" />
                  : <span className="block w-3 h-3 rounded-full border border-border" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className={`block text-[11px] ${s.status === 'offen' ? 'text-muted-foreground' : 'text-foreground'}`}>{s.label}</span>
                {s.info && <span className="block text-[10px] text-muted-foreground break-words">{s.info}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {lauf?.ergebnis && (
        <div className={`flex items-start gap-2 px-2.5 py-2 rounded-md text-[11px] border ${
          lauf.ergebnis.ok ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-red-500/30 bg-red-500/5 text-red-300'
        }`}>
          {lauf.ergebnis.ok ? <CheckCircle2 size={13} className="shrink-0 mt-px" /> : <AlertTriangle size={13} className="shrink-0 mt-px" />}
          <span className="whitespace-pre-wrap break-words">
            {lauf.ergebnis.text}
            {lauf.ergebnis.neustartNoetig && ' Ein Neustart steht noch aus.'}
          </span>
        </div>
      )}
    </div>
  )
}
