// ── Server → „Dienste & Prüfungen“ → Reiter „Schnell-Health-Check“ ─────────────
// Letzter Health Check dieses Servers (DISM ScanHealth + sfc /verifyonly): Datum und Uhrzeit,
// Ergebnis beider Teile mit Bedeutung und „Was tun?“, Server-Angaben, Erklärung der Befehle
// (was sie machen, bewirken, erkennen, welche Fehler auftreten können), Rohausgaben und Verlauf.
// Nur Prüfung — repariert wird nie im Tool (Reparatur-Befehle stehen nur als Hinweis da).
import { useEffect, useState } from 'react'
import { ScanSearch, Loader2, Play, AlertTriangle, ChevronDown, ChevronRight, FileText, Info, CheckCircle2, Clock } from 'lucide-react'
import { useDismScanStore } from '../../store/dismScanStore'
import {
  ladeDism, healthGesamt, zustandText, sfcKurz, zeitText, dauerText, berichtMarkdown, berichtJson,
  HEALTH_ERKLAERUNG, HEALTH_ZUSATZ, HEALTH_TOOLTIP, DISM_WAS_TUN, SFC_WAS_TUN, DISM_BEFEHL, SFC_BEFEHL,
  type DismDatei, type DismErgebnis, type HealthStufe, type DismKurz,
} from '../../services/serverDism'
import { hostKey } from '../../services/serverMonitor'
import { istClusterKnoten, NUR_PING_TEXT } from '../../services/serverSchonung'
import { DismBerichtDialog, STUFE_FARBE, WarteHinweis } from './DismScan'

const RAHMEN: Record<HealthStufe, string> = {
  gruen: 'border-emerald-500/50 bg-emerald-500/5', gelb: 'border-amber-500/50 bg-amber-500/5', rot: 'border-red-500/50 bg-red-500/5', grau: 'border-border bg-muted/20',
}
const dismStufe = (z: DismErgebnis['zustand']): HealthStufe => healthGesamt({ zustand: z, sfc: 'ok' }).stufe
const sfcStufe = (s: NonNullable<DismErgebnis['sfc']>['zustand']): HealthStufe => healthGesamt({ zustand: 'gesund', sfc: s }).stufe

function Liste({ titel, zeilen, max = 12 }: { titel: string; zeilen: string[]; max?: number }) {
  if (!zeilen.length) return null
  return (
    <div className="text-[11px]">
      <p className="text-muted-foreground">{titel} ({zeilen.length})</p>
      <ul className="mt-0.5 space-y-px">{zeilen.slice(0, max).map((z, i) => <li key={i} className="font-mono text-foreground break-all">{z}</li>)}</ul>
      {zeilen.length > max && <p className="text-muted-foreground">… und {zeilen.length - max} weitere (siehe Bericht)</p>}
    </div>
  )
}

function Roh({ titel, zeilen }: { titel: string; zeilen: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-foreground">{titel}</p>
      <pre className="mt-0.5 max-h-48 overflow-auto rounded border border-border bg-background px-2 py-1 text-[10px] leading-snug font-mono text-foreground whitespace-pre-wrap break-all select-text">{zeilen.length ? zeilen.join('\n') : '(keine)'}</pre>
    </div>
  )
}

export default function HealthReiter({ host, bezeichnung, by }: { host: string; bezeichnung?: string; by: string }) {
  const k = hostKey(host)
  const live = useDismScanStore(s => s.hosts[k])
  const wartetAuf = useDismScanStore(s => s.wartetAuf)
  const [datei, setDatei] = useState<DismDatei | null>(null)
  const [laden, setLaden] = useState(true)
  const [erklaerung, setErklaerung] = useState(true)
  const [rohAuf, setRohAuf] = useState(false)
  const [bericht, setBericht] = useState<{ md: string; json: unknown; vorschlag: string; titel: string } | null>(null)
  const [jetzt, setJetzt] = useState(Date.now())
  const laeuft = live?.phase === 'laeuft'
  const knoten = istClusterKnoten(host)

  // nach jedem Lauf (Einzel oder Sammel) neu laden
  const fertigMarke = live?.phase === 'fertig' ? live.ergebnis?.am : ''
  useEffect(() => {
    let weg = false
    setLaden(true)
    void ladeDism(host).then(d => { if (!weg) { setDatei(d); setLaden(false) } }).catch(() => { if (!weg) setLaden(false) })
    return () => { weg = true }
  }, [host, fertigMarke])
  useEffect(() => { if (!laeuft) return; const i = setInterval(() => setJetzt(Date.now()), 1000); return () => clearInterval(i) }, [laeuft])

  const e = datei?.letzter || null
  const versuch = datei?.letzterVersuch && (!e || datei.letzterVersuch.am > e.am) ? datei.letzterVersuch : null
  const g = e ? healthGesamt({ zustand: e.zustand, sfc: e.sfc?.zustand }) : null

  function starten() { if (!knoten) useDismScanStore.getState().starteEinzel(host, { bezeichnung }, by) }
  function zeigeBericht() {
    if (!e) return
    const meta = { [k]: { bezeichnung } }
    const o = { erstellt: new Date(), von: by }
    setBericht({ md: berichtMarkdown([e], meta, o), json: berichtJson([e], meta, o), vorschlag: `HealthCheck_${k}.md`, titel: `Health-Check-Bericht · ${k}` })
  }

  if (knoten) return <p className="p-5 text-sm text-muted-foreground" data-health-reiter="knoten">{NUR_PING_TEXT} Ein Health Check (DISM/SFC) läuft hier deshalb nicht.</p>

  const sek = live?.seit ? Math.max(0, Math.round((jetzt - live.seit) / 1000)) : 0
  return (
    <div className="p-5 space-y-3" data-health-reiter>
      {/* Kopf */}
      <div className="flex items-start gap-2 flex-wrap">
        <ScanSearch size={16} className="text-primary mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Schnell-Health-Check</p>
          <p className="text-[11px] text-muted-foreground">Prüft den Windows-Komponentenspeicher (DISM) und alle geschützten Systemdateien (SFC) – nur Prüfung, es wird nichts repariert oder geändert.</p>
        </div>
        <span className="inline-flex items-center gap-2">
          {e && <button onClick={zeigeBericht} title="Bericht als Markdown (zum Kopieren für eine KI oder Speichern)" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground"><FileText size={12} />Bericht</button>}
          <button onClick={starten} disabled={laeuft || live?.phase === 'wartet'} data-health-start title={`Health Check für ${k} jetzt starten.\n\n${HEALTH_TOOLTIP}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-50">
            {laeuft ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}{laeuft ? 'läuft …' : 'Jetzt prüfen'}
          </button>
        </span>
      </div>

      {laeuft && (
        <div className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs text-foreground inline-flex items-center gap-2 w-full" data-health-laeuft>
          <Loader2 size={13} className="animate-spin text-blue-500" />
          Health Check läuft seit {Math.floor(sek / 60)}:{String(sek % 60).padStart(2, '0')} – erst <code className="text-[11px]">{DISM_BEFEHL}</code>, danach <code className="text-[11px]">{SFC_BEFEHL}</code>. Du kannst das Fenster schließen, der Lauf geht weiter.
        </div>
      )}
      {!laeuft && live?.phase === 'wartet' && (
        <div className="space-y-1" data-health-wartet>
          <p className="text-xs text-muted-foreground">Eingereiht – es läuft immer nur EIN Health Check zur Zeit (auch über alle Admins hinweg). Startet, sobald der laufende fertig ist.</p>
          {wartetAuf && <WarteHinweis w={wartetAuf} />}
        </div>
      )}

      {laden ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />Lade …</div>
      ) : !e ? (
        <p className="py-6 text-center text-sm text-muted-foreground" data-health-leer>Für diesen Server liegt noch kein Health Check vor. „Jetzt prüfen“ startet ihn (meist 10–30 min).</p>
      ) : (<>
        {/* Letzter Lauf */}
        <div className={`rounded-md border px-3 py-2 ${RAHMEN[g!.stufe]}`} data-health-letzter>
          <div className="flex items-center gap-2 flex-wrap">
            <Clock size={13} className="text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">Letzter Health Check: {e.start ? `${zeitText(e.start)} – ${zeitText(e.am).slice(11)}` : zeitText(e.am)}</span>
            <span className="text-[11px] text-muted-foreground">Dauer {dauerText(e.dauerS)} · von {e.von}</span>
            <span className={`ml-auto px-2 py-0.5 rounded text-[11px] font-semibold ${STUFE_FARBE[g!.stufe]}`} data-health-gesamt={g!.stufe}>{g!.text}</span>
          </div>
        </div>
        {versuch && (
          <p className="text-[11px] text-amber-500 flex gap-1.5" data-health-versuch><AlertTriangle size={12} className="mt-0.5 shrink-0" />Letzter Versuch {zeitText(versuch.am)}: {versuch.text} – angezeigt wird das letzte echte Ergebnis.</p>
        )}

        {/* DISM + SFC */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className={`rounded-md border px-3 py-2 space-y-1.5 ${RAHMEN[dismStufe(e.zustand)]}`} data-health-karte="dism">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-foreground">Komponentenspeicher (DISM)</p>
              <span className={`ml-auto px-1.5 py-px rounded text-[10px] font-semibold ${STUFE_FARBE[dismStufe(e.zustand)]}`}>{zustandText[e.zustand]}</span>
            </div>
            <p className="text-xs text-foreground">{e.text}</p>
            {e.meldung && <p className="text-[11px] font-mono text-muted-foreground break-words">„{e.meldung}“</p>}
            {e.fehlerCode && <p className="text-[11px] text-foreground">Fehlercode <b>{e.fehlerCode}</b>{e.fehlerText ? ` – ${e.fehlerText}` : ''}{e.hinweis ? <span className="text-muted-foreground"> · {e.hinweis}</span> : null}</p>}
            {e.gefunden !== undefined && <p className="text-[11px] text-muted-foreground">Laut CBS.log: {e.gefunden} Beschädigung(en) gefunden, {e.repariert ?? 0} repariert</p>}
            <Liste titel="Beschädigte Komponenten" zeilen={e.beschaedigt.map(b => `${b.art}: ${b.datei}`)} />
            {DISM_WAS_TUN[e.zustand] && <p className="text-[11px] text-foreground"><b>Was tun:</b> <span className="text-muted-foreground">{DISM_WAS_TUN[e.zustand]}</span></p>}
          </div>
          <div className={`rounded-md border px-3 py-2 space-y-1.5 ${e.sfc ? RAHMEN[sfcStufe(e.sfc.zustand)] : RAHMEN.grau}`} data-health-karte="sfc">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-foreground">Systemdateien (SFC)</p>
              {e.sfc && <span className={`ml-auto px-1.5 py-px rounded text-[10px] font-semibold ${STUFE_FARBE[sfcStufe(e.sfc.zustand)]}`}>{sfcKurz[e.sfc.zustand]}</span>}
            </div>
            {e.sfc ? (<>
              <p className="text-xs text-foreground">{e.sfc.text}</p>
              {e.sfc.meldung && <p className="text-[11px] font-mono text-muted-foreground break-words">„{e.sfc.meldung}“</p>}
              {e.sfc.dauerS !== undefined && <p className="text-[11px] text-muted-foreground">Dauer {dauerText(e.sfc.dauerS)}</p>}
              <Liste titel="Beanstandete Systemdateien" zeilen={e.sfc.dateien} />
              {SFC_WAS_TUN[e.sfc.zustand] && <p className="text-[11px] text-foreground"><b>Was tun:</b> <span className="text-muted-foreground">{SFC_WAS_TUN[e.sfc.zustand]}</span></p>}
            </>) : <p className="text-xs text-muted-foreground">Bei diesem Lauf noch nicht dabei (Health Check vor dem 17.11.2026 war nur DISM). „Jetzt prüfen“ macht beides.</p>}
          </div>
        </div>

        {/* Server-Angaben */}
        {e.info && (
          <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5" data-health-info>
            {e.info.os && <span>{e.info.os}{e.info.version ? ` · ${e.info.version}${e.info.ubr !== undefined ? '.' + e.info.ubr : ''}` : ''}</span>}
            {e.info.boot && <span>letzter Neustart {e.info.boot}</span>}
            {e.info.freiGB !== undefined && <span>frei auf {e.info.systemLw || 'C:'} {e.info.freiGB} GB von {e.info.groesseGB ?? '?'} GB</span>}
            {e.info.neustartAusstehend !== undefined && <span className={e.info.neustartAusstehend ? 'text-amber-500' : ''}>Neustart ausstehend: {e.info.neustartAusstehend ? 'ja' : 'nein'}</span>}
            {e.info.tiWorker && <span className="text-amber-500">Windows-Update-Installer lief gerade</span>}
            {e.logHinweis && <span className="text-amber-500">{e.logHinweis}</span>}
          </div>
        )}
      </>)}

      {/* Was wurde ausgeführt – und was bewirkt das? */}
      <div className="rounded-md border border-border" data-health-erklaerung>
        <button onClick={() => setErklaerung(v => !v)} className="w-full px-3 py-2 flex items-center gap-2 text-left">
          {erklaerung ? <ChevronDown size={13} className="text-muted-foreground" /> : <ChevronRight size={13} className="text-muted-foreground" />}
          <Info size={13} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">Was wird ausgeführt – und was bewirkt das?</span>
        </button>
        {erklaerung && (
          <div className="px-3 pb-3 space-y-3">
            {HEALTH_ERKLAERUNG.map(b => (
              <div key={b.befehl} className="space-y-1">
                <p className="text-xs font-semibold text-foreground">{b.titel}</p>
                <code className="block text-[11px] px-2 py-1 rounded bg-muted/40 text-foreground">{b.befehl}</code>
                <p className="text-[11px] text-foreground"><b>Was es macht:</b> <span className="text-muted-foreground">{b.macht}</span></p>
                <p className="text-[11px] text-foreground"><b>Was es bewirkt:</b> <span className="text-muted-foreground">{b.bewirkt}</span></p>
                <p className="text-[11px] text-foreground"><b>Was dabei herauskommt:</b> <span className="text-muted-foreground">{b.ergebnis}</span></p>
                <div className="text-[11px]"><b className="text-foreground">Welche Fehler es erkennt:</b>
                  <ul className="list-disc ml-5 text-muted-foreground">{b.erkennt.map(x => <li key={x}>{x}</li>)}</ul>
                </div>
                <div className="text-[11px]"><b className="text-foreground">Mögliche Meldungen beim Prüfen:</b>
                  <ul className="list-disc ml-5 text-muted-foreground">{b.fehler.map(x => <li key={x}>{x}</li>)}</ul>
                </div>
                <p className="text-[11px] text-foreground"><b>Dauer und Last:</b> <span className="text-muted-foreground">{b.dauer}</span></p>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">{HEALTH_ZUSATZ}</p>
            <p className="text-[11px] text-muted-foreground inline-flex items-start gap-1.5"><CheckCircle2 size={12} className="mt-0.5 text-emerald-500 shrink-0" />Reparaturen (DISM /RestoreHealth, sfc /scannow) führt das Tool nie aus – sie stehen oben nur als Hinweis „Was tun“.</p>
          </div>
        )}
      </div>

      {e && (
        <div className="rounded-md border border-border">
          <button onClick={() => setRohAuf(v => !v)} className="w-full px-3 py-2 flex items-center gap-2 text-left" data-health-roh-knopf>
            {rohAuf ? <ChevronDown size={13} className="text-muted-foreground" /> : <ChevronRight size={13} className="text-muted-foreground" />}
            <span className="text-xs font-semibold text-foreground">Rohausgaben und Protokollzeilen</span>
          </button>
          {rohAuf && (
            <div className="px-3 pb-3 space-y-2">
              <Roh titel="DISM-Ausgabe" zeilen={e.ausgabe} />
              <Roh titel="CBS.log – Prüfblock (Checking System Update Readiness)" zeilen={e.cbsBlock} />
              <Roh titel="CBS.log – weitere auffällige Zeilen seit Scanbeginn" zeilen={e.cbsZeilen} />
              <Roh titel="dism.log – Fehler und Warnungen seit Scanbeginn" zeilen={e.dismLog} />
              {e.sfc && <Roh titel="SFC-Ausgabe" zeilen={e.sfc.ausgabe} />}
              {e.sfc && <Roh titel="CBS.log – SFC-Zeilen [SR] seit SFC-Start" zeilen={e.sfc.srZeilen} />}
            </div>
          )}
        </div>
      )}

      {/* Verlauf */}
      {!!datei?.verlauf.length && (
        <div className="space-y-1" data-health-verlauf>
          <p className="text-xs font-semibold text-foreground">Verlauf (letzte {datei.verlauf.length})</p>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40 text-muted-foreground"><tr className="text-left"><th className="px-2 py-1 font-semibold">Datum + Uhrzeit</th><th className="px-2 py-1 font-semibold">Ergebnis</th><th className="px-2 py-1 font-semibold">DISM</th><th className="px-2 py-1 font-semibold">SFC</th><th className="px-2 py-1 font-semibold">Dauer</th><th className="px-2 py-1 font-semibold">von</th></tr></thead>
              <tbody className="divide-y divide-border/60">
                {datei.verlauf.map((v, i) => {
                  const gv = healthGesamt({ zustand: v.zustand, sfc: v.sfc } as DismKurz)
                  return (
                    <tr key={i}>
                      <td className="px-2 py-1 tabular-nums text-foreground whitespace-nowrap">{zeitText(v.am)}</td>
                      <td className="px-2 py-1"><span className={`px-1.5 py-px rounded text-[10px] font-semibold ${STUFE_FARBE[gv.stufe]}`}>{gv.text}</span></td>
                      <td className="px-2 py-1 text-muted-foreground">{zustandText[v.zustand]}</td>
                      <td className="px-2 py-1 text-muted-foreground">{v.sfc ? sfcKurz[v.sfc] : '—'}</td>
                      <td className="px-2 py-1 text-muted-foreground tabular-nums">{dauerText(v.dauerS)}</td>
                      <td className="px-2 py-1 text-muted-foreground truncate max-w-[10rem]">{v.von}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {bericht && <DismBerichtDialog bericht={bericht} onClose={() => setBericht(null)} />}
    </div>
  )
}
