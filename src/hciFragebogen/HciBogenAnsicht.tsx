// ── HCI-Fragebogen eines Servers: die zwölf Antworten ansehen, anpassen, exportieren ──
// Reiter „HCI-Fragebogen“ im Fenster „Dienste & Prüfungen“ (neben „Schnell-Health-Check“).
// Abgefragt wird NUR von Hand und nur dieser eine Server — es gibt bewusst keinen Sammel-Lauf (Nutzerwunsch).
// Die Abfrage liest nur. Antworten sind englisch (wie der Fragebogen); Hinweise für den Bearbeiter deutsch.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardList, Loader2, Play, FileSpreadsheet, RotateCcw, AlertTriangle, Info, PencilLine, CheckCircle2, Clock } from 'lucide-react'
import { hostKey } from '../services/serverMonitor'
import { istClusterKnoten, NUR_PING_TEXT } from '../services/serverSchonung'
import { HCI_FRAGEN } from './fragen'
import { antworten, endText, leiteAb, STANDARD_EINSTELLUNGEN, type Steckbrief } from './auswertung'
import { ladeBogen, ladeEinstellungen, ladeSteckbrief, setzeEigene, speichereEinstellungen } from './sammeln'
import { exportiere } from './excel'
import { useHciStore } from './store'
import type { HciAntwort, HciBogen, HciEinstellungen, Urteil } from './typen'

const zeit = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const URTEIL_FARBE: Record<Exclude<Urteil, ''>, string> = {
  Yes: 'border-amber-500/50 bg-amber-500/10 text-amber-500', No: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500', Unknown: 'border-border bg-muted/40 text-muted-foreground',
}
/** Urteil, wie es in der (evtl. von Hand geänderten) Antwort steht */
const urteilAus = (text: string): Urteil => (/^\s*yes\b/i.test(text) ? 'Yes' : /^\s*no\b/i.test(text) ? 'No' : /^\s*unknown\b/i.test(text) ? 'Unknown' : '')

export const WAS_GELESEN_WIRD = 'Gelesen werden: installierte Software, Dienste, Treiber (Dateiversion und Signatur), Dateisystem-Filter, geplante Aufgaben, Neustart-Historie und die Windows-Ereignisanzeige. Es wird nichts gestartet, gestoppt oder geändert. Aus Befehlszeilen und Skripten verlässt nur der Programmname bzw. das gefundene Neustart-Stichwort den Server.'

function Antwort({ a, text, geaendert, onText, onZurueck }: { a: HciAntwort; text: string; geaendert: boolean; onText: (t: string) => void; onZurueck: () => void }) {
  const f = HCI_FRAGEN[a.nr - 1]
  const [wert, setWert] = useState(text)
  useEffect(() => { setWert(text) }, [text])
  const u = urteilAus(wert)
  const leer = !wert.trim()
  const zeilen = Math.max(2, Math.min(22, wert.split('\n').reduce((n, z) => n + 1 + Math.floor(z.length / 105), 0)))
  return (
    <div className={`rounded-md border px-3 py-2 space-y-1.5 ${leer ? 'border-amber-500/50 bg-amber-500/5' : 'border-border bg-background/40'}`} data-hci-frage={a.nr}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-muted text-foreground text-[11px] font-bold inline-flex items-center justify-center">{a.nr}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">{f.kurz}</p>
          <p className="text-[11px] text-muted-foreground">{f.frage}</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5">
          {u && <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${URTEIL_FARBE[u]}`} data-hci-urteil={u}>{u}</span>}
          {geaendert
            ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-blue-500/40 bg-blue-500/10 text-blue-500 text-[10px]" title="Von Hand geändert – diese Fassung kommt in die Excel"><PencilLine size={10} />geändert</span>
            : a.manuell
              ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-500 text-[10px]" title="Lässt sich am Server nicht messen – bitte prüfen und ergänzen"><AlertTriangle size={10} />deine Angabe</span>
              : a.nr === 2
                ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border text-muted-foreground text-[10px]" title="Aus der SKFM-Serverliste übernommen"><CheckCircle2 size={10} />aus Serverliste</span>
                : <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border text-muted-foreground text-[10px]" title="Aus den gelesenen Daten formuliert"><CheckCircle2 size={10} />gemessen</span>}
        </span>
      </div>
      <textarea value={wert} rows={zeilen} spellCheck={false} data-hci-text={a.nr}
        onChange={e => setWert(e.target.value)} onBlur={() => { if (wert !== text) onText(wert) }}
        placeholder={a.manuell ? 'Hier die Antwort eintragen (englisch) …' : ''}
        className="w-full px-2 py-1.5 text-[12px] leading-snug rounded-md border border-border bg-background text-foreground font-sans resize-y focus:outline-none focus:border-primary select-text" />
      <div className="flex items-start gap-2">
        {a.hinweis && <p className="flex-1 text-[11px] text-muted-foreground flex gap-1.5"><Info size={12} className="mt-0.5 shrink-0" />{a.hinweis}</p>}
        {geaendert && <button onClick={onZurueck} data-hci-zurueck={a.nr} className="ml-auto shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent" title="Eigene Fassung verwerfen und den Vorschlag des Tools wieder einsetzen"><RotateCcw size={11} />Vorschlag wiederherstellen</button>}
      </div>
    </div>
  )
}

export default function HciBogenAnsicht({ host, by, bezeichnung }: { host: string; by: string; bezeichnung?: string }) {
  const k = hostKey(host)
  const live = useHciStore(s => s.hosts[k])
  const marke = useHciStore(s => s.marke)
  const [bogen, setBogen] = useState<HciBogen | null>(null)
  const [steckbrief, setSteckbrief] = useState<Steckbrief | null>(null)
  const [einst, setEinst] = useState<HciEinstellungen>(STANDARD_EINSTELLUNGEN)
  const [laden, setLaden] = useState(true)
  const [mitDaten, setMitDaten] = useState(true)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  const [jetzt, setJetzt] = useState(Date.now())
  const knoten = istClusterKnoten(host)
  const laeuft = live?.phase === 'laeuft'
  const wartet = live?.phase === 'wartet'
  const aktuell = useRef(k)
  aktuell.current = k

  useEffect(() => {
    let weg = false
    setLaden(true)
    void Promise.all([ladeBogen(host), ladeSteckbrief(host), ladeEinstellungen()]).then(([b, s, e]) => {
      if (weg) return
      setBogen(b); setSteckbrief(s); setEinst(e); setLaden(false)
    }).catch(() => { if (!weg) setLaden(false) })
    return () => { weg = true }
  }, [host, marke])
  useEffect(() => { if (!laeuft) return; const i = setInterval(() => setJetzt(Date.now()), 1000); return () => clearInterval(i) }, [laeuft])

  const vorschlaege = useMemo(() => (bogen?.roh ? antworten(bogen.roh, steckbrief, einst) : []), [bogen?.roh, steckbrief, einst])
  const zahlen = useMemo(() => (bogen?.roh ? leiteAb(bogen.roh) : null), [bogen?.roh])
  const offen = vorschlaege.filter(a => !endText(a, bogen?.eigene).trim()).length

  const aendere = useCallback(async (nr: number, text: string | undefined) => {
    const neu = await setzeEigene(host, nr, text, by)
    if (aktuell.current === hostKey(host)) setBogen(alt => (alt ? { ...alt, eigene: neu.eigene, geaendert: neu.geaendert } : neu))
  }, [host, by])

  // Einstellungen gelten für alle Server (liegen auf dem Netzlaufwerk)
  const aendereEinst = useCallback((patch: Partial<HciEinstellungen>) => {
    setEinst(alt => { const neu = { ...alt, ...patch }; void speichereEinstellungen(neu); return neu })
  }, [])

  async function excel() {
    if (!bogen?.roh) return
    setMeldung(null)
    const r = await exportiere([{ host: k, antworten: vorschlaege, eigene: bogen.eigene, roh: bogen.roh, steckbrief, von: bogen.erhoben?.von }], { daten: mitDaten })
    if (r.abgebrochen) return
    setMeldung(r.ok ? { ok: true, text: `Gespeichert: ${r.pfad}` } : { ok: false, text: `Export fehlgeschlagen: ${r.fehler}` })
  }

  if (knoten) return <p className="p-5 text-sm text-muted-foreground" data-hci-ansicht="knoten">{NUR_PING_TEXT} Der Fragebogen wird für Cluster-Knoten deshalb nicht erhoben.</p>

  const sek = live?.seit ? Math.max(0, Math.round((jetzt - live.seit) / 1000)) : 0
  const r = bogen?.roh
  return (
    <div className="p-5 space-y-3" data-hci-ansicht={k}>
      <div className="flex items-start gap-2 flex-wrap">
        <ClipboardList size={16} className="text-primary mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">HCI-Fragebogen <span className="font-normal text-muted-foreground">· Analysis applications HCI{bezeichnung ? ` · ${bezeichnung}` : ''}</span></p>
          <p className="text-[11px] text-muted-foreground">Die zwölf Fragen des Dienstleisters – soweit messbar aus dem Server gelesen und als Antwort formuliert. Nur lesend.</p>
        </div>
        <span className="inline-flex items-center gap-2 flex-wrap justify-end">
          <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer" title="Zusätzlich ein Blatt mit den gelesenen Belegen (Software, Treiber, Aufgaben, Neustarts, Ereignisse)">
            <input type="checkbox" checked={mitDaten} onChange={e => setMitDaten(e.target.checked)} className="accent-primary" />mit Datenblatt
          </label>
          <button onClick={() => void excel()} disabled={!r} data-hci-excel title="Als Excel-Blatt im Aufbau der Vorlage speichern (#, Question, Response) – das Blatt lässt sich in die gemeinsame Liste kopieren"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-500 font-medium hover:bg-emerald-500/20 disabled:opacity-40"><FileSpreadsheet size={12} />Excel-Blatt</button>
          <button onClick={() => useHciStore.getState().starte(host, by)} disabled={laeuft || wartet} data-hci-start title={`Server ${k} jetzt abfragen (nur lesend, dauert etwa 1 Minute).\n\n${WAS_GELESEN_WIRD}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-50">
            {laeuft ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}{laeuft ? 'liest …' : r ? 'Neu abfragen' : 'Jetzt abfragen'}
          </button>
        </span>
      </div>

      {/* Einstellungen: gelten für alle Server */}
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-muted-foreground" data-hci-einstellungen>
        <label className="inline-flex items-center gap-1.5" title="Bezugspunkt für Frage 8: Was wurde rund um den Beginn des Problems geändert? Vorbelegt ist der erste dokumentierte Ausfall im Cluster. Wirkt sofort auf die Antwort, ohne neue Abfrage.">
          Problem begann am
          <input type="date" value={einst.problemSeit} onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) aendereEinst({ problemSeit: e.target.value }) }} data-hci-problemseit
            className="px-1.5 py-1 text-[11px] rounded-md border border-border bg-background text-foreground" />
        </label>
        <label className="inline-flex items-center gap-1.5" title="So weit zurück werden die Ereignisprotokolle ausgewertet. Gilt ab der nächsten Abfrage.">
          Protokolle auswerten für
          <select value={einst.tage} onChange={e => aendereEinst({ tage: Number(e.target.value) })} data-hci-tage className="px-1.5 py-1 text-[11px] rounded-md border border-border bg-background text-foreground">
            {[90, 180, 365, 540, 730].map(t => <option key={t} value={t}>{t} Tage</option>)}
          </select>
        </label>
        <span>gilt für alle Server</span>
      </div>

      {laeuft && <div className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs text-foreground inline-flex items-center gap-2 w-full" data-hci-laeuft><Loader2 size={13} className="animate-spin text-blue-500" />Der Server wird seit {Math.floor(sek / 60)}:{String(sek % 60).padStart(2, '0')} gelesen (meist 30–90 Sekunden). Du kannst das Fenster schließen, die Abfrage läuft weiter.</div>}
      {wartet && <p className="text-xs text-muted-foreground" data-hci-wartet>Eingereiht – bei einem anderen Server läuft gerade eine Abfrage; es wird immer nur EIN Server zur Zeit gelesen.</p>}
      {live?.phase === 'fehler' && <p className="text-[11px] text-red-500 flex gap-1.5" data-hci-fehler><AlertTriangle size={12} className="mt-0.5 shrink-0" />Abfrage fehlgeschlagen: {live.fehler}</p>}
      {!live && bogen?.versuch && (!bogen.erhoben || bogen.versuch.am > bogen.erhoben.am) && <p className="text-[11px] text-amber-500 flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />Letzter Versuch {zeit(bogen.versuch.am)}: {bogen.versuch.fehler}{bogen.erhoben ? ' – angezeigt wird der letzte gelesene Stand.' : ''}</p>}
      {meldung && <p className={`text-[11px] ${meldung.ok ? 'text-emerald-500' : 'text-red-500'} break-all`} data-hci-meldung>{meldung.text}</p>}

      {laden ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />Lade …</div>
      ) : !r ? (
        <div className="py-6 text-center space-y-2" data-hci-leer>
          <p className="text-sm text-muted-foreground">Für diesen Server liegt noch kein Fragebogen vor. „Jetzt abfragen“ liest den Server (etwa 1 Minute) und formuliert die Antworten.</p>
          <p className="text-[11px] text-muted-foreground max-w-xl mx-auto">{WAS_GELESEN_WIRD}</p>
        </div>
      ) : (<>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 space-y-1" data-hci-stand>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Clock size={13} className="text-muted-foreground" />
            <span className="font-semibold text-foreground">Gelesen am {zeit(bogen?.erhoben?.am || r.am)}</span>
            <span className="text-[11px] text-muted-foreground">{bogen?.erhoben ? `von ${bogen.erhoben.von} · ${bogen.erhoben.dauerS} s` : ''} · Protokolle ab {r.protokollAb.system.slice(0, 10) || '?'} · Problembeginn {einst.problemSeit}</span>
            {offen > 0 && <span className="ml-auto px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-500 text-[11px] font-medium" data-hci-offen={offen}>{offen} Antwort{offen === 1 ? '' : 'en'} noch leer</span>}
          </div>
          {zahlen && (
            <p className="text-[11px] text-muted-foreground" data-hci-zahlen>
              {zahlen.anwendungen.length} Anwendungs-Pakete · {zahlen.anwDienste.length} Anwendungs-Dienste · {zahlen.treiber.length} nachinstallierte Treiber ({zahlen.treiber.filter(t => t.art === 'anwendung').length} der Anwendung) · {r.aufgaben.length} Aufgaben ({zahlen.aufgabenMitNeustart.length} mit Neustart-Befehl) · {r.neustarts.length} geplante Neustarts · {r.unerwartet.length} unerwartete Ausfälle
            </p>
          )}
          {r.luecken.length > 0 && <p className="text-[11px] text-amber-500 flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />Nicht lesbar: {r.luecken.join(' · ')}</p>}
        </div>
        <p className="text-[11px] text-muted-foreground flex gap-1.5"><Info size={12} className="mt-0.5 shrink-0" />Jede Antwort lässt sich ändern; gespeichert wird beim Verlassen des Feldes. In die Excel kommt genau der Text aus dem Feld. Felder mit „deine Angabe“ kann das Tool nicht messen (Ansprechpartner, Aussagen des Herstellers).</p>
        <div className="space-y-2">
          {vorschlaege.map(a => {
            const eigen = bogen?.eigene?.[String(a.nr)]
            return <Antwort key={`${k}-${a.nr}`} a={a} text={endText(a, bogen?.eigene)} geaendert={eigen !== undefined}
              onText={t => void aendere(a.nr, t === a.text ? undefined : t)} onZurueck={() => void aendere(a.nr, undefined)} />
          })}
        </div>
      </>)}
    </div>
  )
}
