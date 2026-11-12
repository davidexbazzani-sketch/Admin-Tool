// Abschnitt „Netzwerk-Treiber" im Analyse-Fenster der Netzwerk-Diagnose: prüft automatisch beim Öffnen,
// zeigt installiert ↔ aktuell (HP) und aktualisiert die gewählten Treiber abgesichert.
import { useEffect, useMemo, useState } from 'react'
import { Cpu, Loader2, RefreshCw, Check, AlertTriangle, ShieldAlert, Download } from 'lucide-react'
import { useNetzTreiber, vorausgewaehlt } from './netzTreiber'
import { installierbar as darfInstalliert, type DriverItem } from '../services/hpDrivers'

const STATUS: Record<string, { text: string; cls: string }> = {
  veraltet: { text: 'Update verfügbar', cls: 'border-amber-500/50 text-amber-500' },
  unbekannt: { text: 'Version nicht vergleichbar', cls: 'border-border text-muted-foreground' },
  aktuell: { text: 'aktuell', cls: 'border-emerald-500/50 text-emerald-500' },
  verfuegbar: { text: 'verfügbar', cls: 'border-border text-muted-foreground' },
}

/** Nur anbieten, wenn es wirklich etwas Neueres gibt — dieselbe Version noch einmal zu installieren ergibt keinen Sinn. */
export const installierbar = (i: DriverItem) => darfInstalliert(i).ok

export default function NetzTreiberBox({ host, by }: { host: string; by: string }) {
  const st = useNetzTreiber(s => s.byHost[host.trim().toUpperCase()])
  const pruefe = useNetzTreiber(s => s.pruefe)
  const installiere = useNetzTreiber(s => s.installiere)
  const [wahl, setWahl] = useState<Set<string>>(new Set())
  const [frage, setFrage] = useState(false)
  const [informieren, setInformieren] = useState(true)

  // Beim ersten Öffnen für diesen PC automatisch prüfen (läuft im Hintergrund, blockiert nichts)
  useEffect(() => { if (!st) void pruefe(host) }, [host, st, pruefe])
  // Vorauswahl nach jeder Prüfung
  const items = st?.items || []
  useEffect(() => { setWahl(new Set(items.filter(i => installierbar(i) && vorausgewaehlt(i)).map(i => i.softpaqId))) }, [st?.at, items.length])   // eslint-disable-line react-hooks/exhaustive-deps

  const veraltet = items.filter(i => i.status === 'veraltet').length
  const gewaehlt = useMemo(() => items.filter(i => installierbar(i) && wahl.has(i.softpaqId)), [items, wahl])
  const moeglich = items.filter(installierbar).length
  const laeuft = st?.phase === 'pruefen' || st?.phase === 'installieren'
  const toggle = (i: DriverItem) => setWahl(w => { const n = new Set(w); n.has(i.softpaqId) ? n.delete(i.softpaqId) : n.add(i.softpaqId); return n })

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2" data-netz-treiber>
      <div className="flex items-center gap-1.5">
        <Cpu size={14} className="text-primary" />
        <span className="text-xs font-semibold text-foreground">Netzwerk-Treiber (WLAN / LAN)</span>
        {st?.phase === 'bereit' && (veraltet
          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/50 text-amber-500" data-netz-treiber-veraltet>{veraltet} Update{veraltet === 1 ? '' : 's'} verfügbar</span>
          : items.length ? <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-500/50 text-emerald-500">alle aktuell</span> : null)}
        <span className="ml-auto text-[10px] text-muted-foreground">{st?.report?.catalogAt ? `HP-Katalog ${new Date(st.report.catalogAt).toLocaleDateString('de-DE')}${st.report.catalogStale ? ' (veraltet)' : ''}` : ''}</span>
        <button onClick={() => void pruefe(host, true)} disabled={laeuft} title="Neu prüfen (HP-Katalog frisch laden)"
          className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-40"><RefreshCw size={12} /></button>
      </div>

      {(!st || laeuft) && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />
          {st?.phase === 'installieren' ? `Installiere … ${st.schritt || ''}` : st?.schritt || 'Prüfe Netzwerk-Treiber …'}
        </p>
      )}
      {st?.phase === 'installieren' && <p className="text-[10px] text-muted-foreground">Das WLAN des PCs kann dabei 1–2 Minuten weg sein. Die Installation läuft am PC selbstständig zu Ende; das Fenster darf geschlossen werden.</p>}

      {st?.fehler && <p className="text-[11px] text-amber-500 flex items-start gap-1"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{st.fehler}</p>}

      {st && !laeuft && items.length > 0 && (
        <table className="w-full text-[11px]">
          <thead><tr className="text-muted-foreground text-left"><th className="w-5" /><th className="font-normal">Treiber</th><th className="font-normal">installiert</th><th className="font-normal">aktuell (HP)</th><th className="font-normal">Status</th></tr></thead>
          <tbody>
            {items.map(i => {
              const s = STATUS[i.status] || STATUS.unbekannt
              return (
                <tr key={i.softpaqId} className="border-t border-border/40" data-treiber={i.softpaqId}>
                  <td className="py-1">{installierbar(i) ? <input type="checkbox" checked={wahl.has(i.softpaqId)} onChange={() => toggle(i)} className="accent-primary" /> : null}</td>
                  <td className="py-1 pr-2 text-foreground">{i.name}{i.matchUnsicher && <span className="text-amber-500" title="Nur über den Hersteller zugeordnet, nicht über das Gerät selbst – gehört vermutlich zu anderer Hardware."> · gehört nicht sicher zu diesem PC – wird nicht angeboten</span>}</td>
                  <td className="py-1 pr-2 font-mono text-muted-foreground">{i.installedVersion || '—'}</td>
                  <td className="py-1 pr-2 font-mono text-foreground">{i.latestVersion}{i.releaseDate ? <span className="text-muted-foreground"> ({i.releaseDate})</span> : null}</td>
                  <td className="py-1"><span className={`px-1.5 py-0.5 rounded border text-[10px] ${s.cls}`}>{s.text}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {st?.phase === 'bereit' && !items.length && !st.fehler && <p className="text-[11px] text-muted-foreground">Für diesen PC hat HP keine passenden Netzwerk-Treiber im Katalog.</p>}
      {st && !laeuft && st.nichtPassend > 0 && <p className="text-[10px] text-muted-foreground">{st.nichtPassend} weitere Netzwerk-Treiber im HP-Katalog gehören zu anderer Hardware und werden ausgeblendet.</p>}

      {st && !laeuft && items.length > 0 && moeglich === 0 && <p className="text-[11px] text-muted-foreground" data-netz-treiber-aktuell>Es gibt keinen neueren Treiber – hier ist nichts zu installieren.</p>}
      {st && !laeuft && moeglich > 0 && !frage && (
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setFrage(true)} disabled={!gewaehlt.length}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
            <Download size={13} />{gewaehlt.length ? `${gewaehlt.length} Treiber aktualisieren` : 'Treiber auswählen'}
          </button>
          <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><input type="checkbox" checked={informieren} onChange={e => setInformieren(e.target.checked)} className="accent-primary" />Benutzer per Nachricht informieren</label>
        </div>
      )}
      {frage && (
        <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 space-y-2" data-netz-treiber-frage>
          <div className="flex items-start gap-1.5 text-foreground"><ShieldAlert size={14} className="shrink-0 mt-0.5 text-amber-500" />
            <span>{gewaehlt.length} Netzwerk-Treiber auf <b>{host}</b> installieren? Das WLAN/LAN ist dabei kurz weg (meist 1–2 Min). Die Installation läuft als Aufgabe am PC und bricht nicht ab, wenn die Verbindung kurz reißt. Danach ggf. Neustart nötig.</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setFrage(false); void installiere(host, gewaehlt, by, informieren) }} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90">Ja, installieren</button>
            <button onClick={() => setFrage(false)} className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground">Abbrechen</button>
          </div>
        </div>
      )}

      {st?.phase === 'fertig' && st.ergebnis && (
        <div className="rounded border border-border p-2 space-y-0.5" data-netz-treiber-ergebnis>
          <div className="text-[11px] font-semibold text-foreground">{st.ergebnis.message}</div>
          {st.ergebnis.ergebnisse.map(e => (
            <div key={e.softpaqId} className="text-[11px]">
              {e.verifiziert ? <Check size={11} className="inline text-emerald-500" /> : <AlertTriangle size={11} className="inline text-red-400" />}{' '}
              <span className="text-foreground">{e.name}</span> <span className="text-muted-foreground">– {e.info}</span>
            </div>
          ))}
          <button onClick={() => void pruefe(host)} className="mt-1 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-border hover:bg-accent"><RefreshCw size={11} />Erneut prüfen</button>
        </div>
      )}
    </div>
  )
}
