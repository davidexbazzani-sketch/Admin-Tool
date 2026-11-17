// ── Dialog „Tool-Zugriffe“: Was hat das IT Admin Tool wann mit einem Server gemacht? ──
// Liest das Zugriffsprotokoll aller Admin-PCs (electron/zugriffsProtokoll.ts) für einen
// Server und Zeitraum — z. B. um einen Ausfallzeitpunkt (± 2 h). Export als Markdown
// (Beleg für Dienstleister/Hersteller). Befehlstexte werden nie gespeichert.
import { useEffect, useMemo, useState } from 'react'
import { Footprints, Loader, X, Copy, Check, FileDown, RefreshCw, AlertTriangle, Info } from 'lucide-react'
import { api, type ZugriffEintrag } from '../../electronAPI'
import { ladeZugriffe, fasseZugriffeZusammen, zugriffeText, zugriffeMarkdown, sek } from '../../services/zugriffe'
import { istClusterKnoten, NUR_PING_KURZ, NUR_PING_TEXT } from '../../services/serverSchonung'

type Zeitraum = '2h' | '24h' | '7t' | 'um'

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)))
const zweistellig = (n: number) => String(n).padStart(2, '0')
/** Date → Wert für <input type="datetime-local"> (lokale Zeit) */
const alsLokal = (d: Date) => `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}T${zweistellig(d.getHours())}:${zweistellig(d.getMinutes())}`

function fenster(z: Zeitraum, um: string): { von: Date; bis: Date } {
  const jetzt = new Date()
  if (z === 'um') {
    const m = new Date(um)
    const mitte = isNaN(m.getTime()) ? jetzt : m
    return { von: new Date(mitte.getTime() - 2 * 3_600_000), bis: new Date(mitte.getTime() + 2 * 3_600_000) }
  }
  const h = z === '2h' ? 2 : z === '24h' ? 24 : 24 * 7
  return { von: new Date(jetzt.getTime() - h * 3_600_000), bis: jetzt }
}

const ART: Record<string, { text: string; farbe: string }> = {
  ping: { text: 'Ping', farbe: 'border-border text-muted-foreground' },
  lesen: { text: 'lesend', farbe: 'border-sky-500/40 bg-sky-500/10 text-sky-500' },
  aendern: { text: 'ändernd', farbe: 'border-amber-500/40 bg-amber-500/10 text-amber-500' },
  gesperrt: { text: 'gesperrt', farbe: 'border-violet-500/40 bg-violet-500/10 text-violet-500' },
}

export default function ZugriffeDialog({ host: startHost, onClose }: { host?: string; onClose: () => void }) {
  const [host, setHost] = useState((startHost || '').trim())
  const [eingabe, setEingabe] = useState((startHost || '').trim())
  const [zeitraum, setZeitraum] = useState<Zeitraum>('24h')
  const [um, setUm] = useState(alsLokal(new Date()))
  const [laedt, setLaedt] = useState(false)
  const [liste, setListe] = useState<ZugriffEintrag[]>([])
  const [gekappt, setGekappt] = useState(false)
  const [fehler, setFehler] = useState('')
  const [nurFern, setNurFern] = useState(false)
  const [kopiert, setKopiert] = useState(false)
  const [meldung, setMeldung] = useState('')
  const [lauf, setLauf] = useState(0)

  const { von, bis } = useMemo(() => fenster(zeitraum, um), [zeitraum, um, lauf])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let weg = false
    setLaedt(true); setFehler('')
    void ladeZugriffe({ host: host || undefined, von, bis, max: 5000 }).then(r => {
      if (weg) return
      setListe(r.eintraege); setGekappt(r.gekappt); setFehler(r.fehler || ''); setLaedt(false)
    })
    return () => { weg = true }
  }, [host, von, bis])

  const z = useMemo(() => fasseZugriffeZusammen(liste), [liste])
  const knoten = !!host && istClusterKnoten(host)
  const sichtbar = useMemo(() => [...(nurFern ? liste.filter(e => e.a !== 'ping') : liste)].sort((a, b) => b.t.localeCompare(a.t)), [liste, nurFern])

  async function kopieren() {
    try { await navigator.clipboard.writeText(zugriffeMarkdown(host, von, bis, liste)); setKopiert(true); setTimeout(() => setKopiert(false), 2000) }
    catch { setMeldung('Kopieren nicht möglich.') }
  }
  async function speichern() {
    try {
      const stempel = `${von.getFullYear()}-${zweistellig(von.getMonth() + 1)}-${zweistellig(von.getDate())}_${zweistellig(von.getHours())}${zweistellig(von.getMinutes())}`
      const ziel = await api().saveFileDialog(`Tool-Zugriffe_${host || 'alle'}_${stempel}.md`, [{ name: 'Markdown', extensions: ['md'] }])
      if (!ziel) return
      const pfad = /\.md$/i.test(ziel) ? ziel : `${ziel}.md`
      const r = await api().writeFile(pfad, b64(zugriffeMarkdown(host, von, bis, liste)))
      setMeldung(r.success ? `Gespeichert: ${pfad}` : `Speichern fehlgeschlagen: ${r.error || ''}`)
    } catch (e) { setMeldung('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e))) }
  }

  const chip = (aktiv: boolean) => `px-2 py-1 text-[11px] rounded-md border ${aktiv ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'}`
  const zahl = (n: number, text: string, farbe: string, data: string) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${farbe}`} data-zahl={data}><b className="tabular-nums">{n}</b>{text}</span>
  )

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-5xl h-[86vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} data-zugriffe-dialog={host || 'alle'}>
        {/* Kopf */}
        <div className="shrink-0 px-5 py-3 border-b border-border flex items-center gap-2 flex-wrap">
          <Footprints size={16} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">Tool-Zugriffe{host ? ` auf ${host}` : ' auf alle Server'}</h3>
          {knoten && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-500 text-[10px] font-medium" title={NUR_PING_TEXT}>{NUR_PING_KURZ}</span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={() => void kopieren()} disabled={!liste.length} title="Als Text (Markdown) kopieren – z. B. als Beleg für den Dienstleister"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground disabled:opacity-40">
              {kopiert ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}{kopiert ? 'Kopiert' : 'Als Text kopieren'}
            </button>
            <button onClick={() => void speichern()} disabled={!liste.length}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground disabled:opacity-40"><FileDown size={12} />Speichern unter …</button>
            <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"><X size={16} /></button>
          </div>
        </div>

        {/* Auswahl: Server + Zeitraum */}
        <div className="shrink-0 px-5 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
          <form onSubmit={e => { e.preventDefault(); setHost(eingabe.trim()) }} className="flex items-center gap-1.5">
            <input value={eingabe} onChange={e => setEingabe(e.target.value)} placeholder="Server (leer = alle)" data-host-eingabe
              className="w-40 px-2 py-1 text-xs rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:border-primary" />
            <button type="submit" className="px-2 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent">anzeigen</button>
          </form>
          <span className="text-[11px] text-muted-foreground ml-2">Zeitraum</span>
          <button className={chip(zeitraum === '2h')} onClick={() => setZeitraum('2h')} data-zeitraum="2h">letzte 2 h</button>
          <button className={chip(zeitraum === '24h')} onClick={() => setZeitraum('24h')} data-zeitraum="24h">letzte 24 h</button>
          <button className={chip(zeitraum === '7t')} onClick={() => setZeitraum('7t')} data-zeitraum="7t">letzte 7 Tage</button>
          <button className={chip(zeitraum === 'um')} onClick={() => setZeitraum('um')} data-zeitraum="um" title="z. B. Ausfallzeit aus der Meldung des Dienstleisters">um Zeitpunkt ± 2 h</button>
          {zeitraum === 'um' && (
            <input type="datetime-local" value={um} onChange={e => setUm(e.target.value)} data-zeitpunkt
              className="px-2 py-1 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
          )}
          <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <input type="checkbox" className="accent-primary" checked={nurFern} onChange={e => setNurFern(e.target.checked)} />Pings ausblenden
          </label>
          <button onClick={() => setLauf(n => n + 1)} title="Neu laden" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"><RefreshCw size={13} /></button>
        </div>

        {/* Zusammenfassung */}
        <div className="shrink-0 px-5 py-2.5 border-b border-border space-y-1.5" data-zugriffe-zusammenfassung>
          <div className="flex items-center gap-1.5 flex-wrap">
            {zahl(z.ping, 'Ping', 'border-border text-muted-foreground', 'ping')}
            {zahl(z.lesend, 'lesend', 'border-sky-500/40 bg-sky-500/10 text-sky-500', 'lesend')}
            {zahl(z.aendernd, 'ändernd', z.aendernd ? 'border-amber-500/40 bg-amber-500/10 text-amber-500' : 'border-border text-muted-foreground', 'aendernd')}
            {z.gesperrt > 0 && zahl(z.gesperrt, 'gesperrt', 'border-violet-500/40 bg-violet-500/10 text-violet-500', 'gesperrt')}
            {z.fehler > 0 && zahl(z.fehler, 'Fehler', 'border-red-500/40 bg-red-500/10 text-red-500', 'fehler')}
            {z.zeitlimit > 0 && zahl(z.zeitlimit, 'Zeitlimit', 'border-red-500/40 bg-red-500/10 text-red-500', 'zeitlimit')}
            {z.dauerMittelMs > 0 && <span className="text-[11px] text-muted-foreground ml-1">Dauer Ø {sek(z.dauerMittelMs)} · max {sek(z.dauerMaxMs)}</span>}
            {z.pcs.length > 0 && <span className="text-[11px] text-muted-foreground ml-1">von {z.pcs.join(', ')}</span>}
          </div>
          <p className="text-xs text-foreground" data-zugriffe-satz>{laedt ? 'wird geladen …' : zugriffeText(z, { knoten })}</p>
          <p className="text-[10px] text-muted-foreground flex items-start gap-1">
            <Info size={10} className="mt-0.5 shrink-0" />
            <span>Protokolliert wird jeder Befehl des Tools, der einen bekannten Server per Fern-Syntax anspricht (Ping, WinRM, DCOM, Freigaben) – erst ab dieser Version; ältere Tool-Versionen auf anderen PCs schreiben nichts mit. Befehlstexte werden nie gespeichert. Das Netzlaufwerk des Tools liegt auf W3172 (laufend kleine Dateizugriffe, nicht einzeln protokolliert).</span>
          </p>
        </div>

        {(fehler || meldung || gekappt) && (
          <div className="shrink-0 px-5 py-1.5 border-b border-border text-[11px] flex items-center gap-1.5 text-amber-500">
            <AlertTriangle size={11} className="shrink-0" />
            <span>{[fehler, gekappt ? 'Nur die neuesten 5000 Einträge – Zeitraum verkleinern.' : '', meldung].filter(Boolean).join(' · ')}</span>
          </div>
        )}

        {/* Tabelle */}
        <div className="flex-1 overflow-auto">
          {laedt ? (
            <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm"><Loader size={14} className="animate-spin" />Zugriffe werden geladen …</div>
          ) : !sichtbar.length ? (
            <div className="flex flex-col items-center justify-center h-full gap-1 text-muted-foreground text-sm" data-zugriffe-leer>
              <Footprints size={28} className="opacity-30" />
              Keine Zugriffe in diesem Zeitraum protokolliert.
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-card border-b border-border text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-1.5 font-medium">Zeit</th>
                  <th className="px-3 py-1.5 font-medium">Art</th>
                  <th className="px-3 py-1.5 font-medium">Funktion</th>
                  {!host && <th className="px-3 py-1.5 font-medium">Server</th>}
                  <th className="px-3 py-1.5 font-medium text-right">Dauer</th>
                  <th className="px-3 py-1.5 font-medium">Ergebnis</th>
                  <th className="px-3 py-1.5 font-medium">PC</th>
                  <th className="px-3 py-1.5 font-medium">Benutzer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sichtbar.map((e, i) => {
                  const art = ART[e.e === 'gesperrt' ? 'gesperrt' : e.a] || ART.lesen
                  return (
                    <tr key={`${e.t}_${i}`} className="align-top" data-zugriff-zeile={e.e === 'gesperrt' ? 'gesperrt' : e.a}>
                      <td className="px-3 py-1 tabular-nums whitespace-nowrap text-foreground">{new Date(e.t).toLocaleString('de-DE')}</td>
                      <td className="px-3 py-1"><span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium ${art.farbe}`}>{art.text}</span></td>
                      <td className="px-3 py-1 text-foreground">{e.q}</td>
                      {!host && <td className="px-3 py-1 font-mono text-foreground" title={e.h.join(', ')}>{e.h.length > 3 ? `${e.h.slice(0, 3).join(', ')} … (+${e.h.length - 3})` : e.h.join(', ')}</td>}
                      <td className="px-3 py-1 text-right tabular-nums text-muted-foreground">{e.a === 'ping' || e.e === 'gesperrt' ? '—' : sek(e.ms)}</td>
                      <td className={`px-3 py-1 ${e.e === 'ok' ? 'text-emerald-500' : e.e === 'gesperrt' ? 'text-violet-500' : 'text-red-500'}`} title={e.x || ''}>
                        {e.e === 'ok' ? 'ok' : e.e === 'zeitlimit' ? 'Zeitlimit' : e.e === 'gesperrt' ? 'nicht ausgeführt' : `Fehler${e.x ? `: ${e.x}` : ''}`}
                      </td>
                      <td className="px-3 py-1 font-mono text-muted-foreground">{e.pc}</td>
                      <td className="px-3 py-1 text-muted-foreground">{e.u}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
