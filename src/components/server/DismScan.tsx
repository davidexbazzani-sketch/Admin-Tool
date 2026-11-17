// ── Server: Health Check (DISM ScanHealth + sfc /verifyonly) — Kachel-Chip, Sammel-Panel, Bericht-Dialog ──
import { useEffect, useState } from 'react'
import { ScanSearch, Loader, Play, Pause, Square, X, Copy, Check, FileDown, FolderOpen, FileText, AlertTriangle, Info, ChevronRight } from 'lucide-react'
import { useDismScanStore, DISM_STANDARD_PARALLEL, type DismBericht, type DismWartet } from '../../store/dismScanStore'
import {
  kurzVon, istEchtesErgebnis, laeuftNoch, zustandText, dauerText, zeitText, zaehle, ladeLetzte, speichereBericht,
  speichereBerichtUnter, oeffneBerichtOrdner, healthGesamt, sfcKurz, DISM_BEFEHL, SFC_BEFEHL, DISM_DAUER_ANNAHME_S, HEALTH_TOOLTIP,
  type DismKurz, type DismMeta, type HealthStufe, type DismErgebnis,
} from '../../services/serverDism'
import { hostKey, type ServerTile, type ServerMonitorStatus } from '../../services/serverMonitor'
import { istClusterKnoten, NUR_PING_TEXT } from '../../services/serverSchonung'

type St = ServerMonitorStatus['servers'][string] | undefined

/** Sekundentakt nur solange etwas läuft. */
function useTakt(an: boolean): number {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    if (!an) return
    setT(Date.now())
    const i = setInterval(() => setT(Date.now()), 1000)
    return () => clearInterval(i)
  }, [an])
  return t
}
/** „15.11. 20:49“ */
const kurz = (iso: string) => { const z = zeitText(iso); return z.length >= 16 ? `${z.slice(0, 6)} ${z.slice(11)}` : z }

export const STUFE_FARBE: Record<HealthStufe, string> = {
  gruen: 'bg-emerald-600 text-white',
  gelb: 'bg-amber-400 text-black',
  rot: 'bg-red-600 text-white',
  grau: 'bg-muted text-foreground',
}

/** Kachel: letztes Health-Check-Ergebnis (öffnet den Reiter „Schnell-Health-Check“) + „prüfen“ (nur dieser Server). */
export function DismChip({ host, st, onOeffnen, onScan }: { host: string; st: St; onOeffnen: () => void; onScan: () => void }) {
  const live = useDismScanStore(s => s.hosts[hostKey(host)])
  const laeuft = live?.phase === 'laeuft'
  const jetzt = useTakt(laeuft)
  const liveEcht = live?.ergebnis && istEchtesErgebnis(live.ergebnis.zustand) ? kurzVon(live.ergebnis) : undefined
  const k: DismKurz | undefined = liveEcht || st?.dism
  const versuch = live?.ergebnis && !liveEcht ? { am: live.ergebnis.am, zustand: live.ergebnis.zustand, text: live.ergebnis.text } : (!liveEcht ? k?.versuch : undefined)
  const woanders = !live && laeuftNoch(st?.dism) ? st?.dism?.laeuft : undefined

  // Cluster-Knoten (HCI): nur Ping — kein DISM, kein „scannen“
  if (istClusterKnoten(host)) {
    return (
      <div className="mt-1">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-dashed border-border text-[10px] text-muted-foreground" data-dism-chip="knoten" title={NUR_PING_TEXT}>
          <ScanSearch size={11} />Health Check: nicht bei Cluster-Knoten
        </span>
      </div>
    )
  }

  const knopf = (
    <button onClick={e => { e.stopPropagation(); onScan() }} disabled={laeuft || live?.phase === 'wartet' || !!woanders} data-dism-scan={host}
      title={`Health Check nur für diesen Server jetzt starten.\n\n${HEALTH_TOOLTIP}`}
      className="ml-1 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50">
      <ScanSearch size={10} />prüfen
    </button>
  )

  let chip: React.ReactNode
  if (laeuft) {
    const s = live?.seit ? Math.max(0, Math.round((jetzt - live.seit) / 1000)) : 0
    chip = <button onClick={onOeffnen} title={`Läuft: erst ${DISM_BEFEHL}, danach ${SFC_BEFEHL} – nur Prüfung`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-600 text-white" data-dism-chip="laeuft">
      <Loader size={11} className="animate-spin" />Health Check läuft · {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </button>
  } else if (live?.phase === 'wartet') {
    chip = <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] border border-dashed border-border text-muted-foreground" data-dism-chip="wartet"
      title="Eingereiht – es läuft immer nur EIN Health Check zur Zeit (auch über alle Admins). Startet, sobald der laufende fertig ist.">
      <ScanSearch size={11} />Health Check wartet …
    </span>
  } else if (woanders) {
    chip = <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-blue-600/80 text-white" title={`gestartet ${zeitText(woanders.seit)}`} data-dism-chip="woanders">
      <Loader size={11} className="animate-spin" />Health Check läuft (von {woanders.von})
    </span>
  } else if (!k || !k.am) {
    chip = <button onClick={onOeffnen} title={`Schnell-Health-Check öffnen – hier stehen Ergebnisse und Erklärungen.\n\n${HEALTH_TOOLTIP}`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-dashed border-border text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent" data-dism-chip="nie">
      <ScanSearch size={11} />Health Check noch nicht gelaufen
    </button>
  } else {
    const g = healthGesamt(k)
    chip = <button onClick={onOeffnen} data-dism-chip={k.zustand} data-health-stufe={g.stufe}
      title={`Schnell-Health-Check öffnen · geprüft ${zeitText(k.am)}${k.dauerS ? ` (${dauerText(k.dauerS)})` : ''}\nDISM (Komponentenspeicher): ${k.text}\nSFC (Systemdateien): ${k.sfcText || 'bei diesem Lauf noch nicht dabei'}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold hover:opacity-90 ${STUFE_FARBE[g.stufe]}`}>
      <ScanSearch size={11} />Health Check: {g.text} · {zeitText(k.am).slice(0, 6)}
    </button>
  }
  return (
    <div className="mt-1">
      <div className="flex items-center flex-wrap">{chip}{knopf}</div>
      {versuch && !laeuft && (!k?.am || versuch.am > k.am) && (
        <button onClick={onOeffnen} className="mt-0.5 w-full min-w-0 flex items-center gap-1 text-[10px] text-amber-500 hover:underline text-left" title={versuch.text}>
          <AlertTriangle size={10} className="shrink-0" /><span className="truncate min-w-0">Health-Check-Versuch {kurz(versuch.am)}: {versuch.text}</span>
        </button>
      )}
    </div>
  )
}

/** „wartet – Health Check läuft gerade auf …“ (Sperre: immer nur einer, über alle Admins). */
export function WarteHinweis({ w }: { w: DismWartet }) {
  const wo = w.host ? `auf ${w.host}` : 'auf einem anderen Server'
  const wer = [w.von, w.rechner].filter(Boolean).join(', ')
  return (
    <p className="text-[11px] text-amber-500 flex items-center gap-1" data-dism-wartet title="Es läuft immer nur EIN Health Check zur Zeit – auch über alle Admins hinweg. Alle 60 s wird erneut nachgesehen.">
      <Loader size={11} className="animate-spin shrink-0" />
      wartet – {w.art === 'komplett-diagnose' ? 'Tiefenprüfung (Komplett-Diagnose)' : 'Health Check'} läuft gerade {wo}{wer ? ` (${wer})` : ''}{w.seit ? ` seit ${zeitText(w.seit).slice(-5)}` : ''}
    </p>
  )
}

/** Ergebnis-Zeile im Sammel-Panel: DISM + SFC direkt sichtbar, Klick öffnet den Reiter des Servers. */
function ErgebnisZeile({ e, onOeffnen }: { e: DismErgebnis; onOeffnen: (host: string) => void }) {
  const g = healthGesamt({ zustand: e.zustand, sfc: e.sfc?.zustand })
  return (
    <tr className="hover:bg-accent/10" data-health-ergebnis={e.host}>
      <td className="px-2 py-1 font-mono text-foreground">{e.host}</td>
      <td className="px-2 py-1"><span className={`px-1.5 py-px rounded text-[10px] font-semibold ${STUFE_FARBE[g.stufe]}`}>{g.text}</span></td>
      <td className="px-2 py-1 text-muted-foreground" title={e.text}>{zustandText[e.zustand]}</td>
      <td className="px-2 py-1 text-muted-foreground" title={e.sfc?.text}>{e.sfc ? sfcKurz[e.sfc.zustand] : '—'}{e.sfc?.dateien.length ? ` (${e.sfc.dateien.length})` : ''}</td>
      <td className="px-2 py-1 text-muted-foreground tabular-nums">{dauerText(e.dauerS)}</td>
      <td className="px-2 py-1 text-right">
        <button onClick={() => onOeffnen(e.host)} title="Ergebnis mit Erklärung im Reiter „Schnell-Health-Check“ dieses Servers"
          className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline">Details<ChevronRight size={10} /></button>
      </td>
    </tr>
  )
}

/** Panel oben: alle Server scannen (Start, Fortschritt, Bericht). */
export function DismPanel({ tiles, status, metaVon, by, onBericht, onSchliessen, onOeffnen }: {
  tiles: ServerTile[]
  status: ServerMonitorStatus
  metaVon: (t: ServerTile) => DismMeta
  by: string
  onBericht: (b: DismBericht) => void
  onSchliessen: () => void
  /** Reiter „Schnell-Health-Check“ dieses Servers öffnen */
  onOeffnen: (host: string) => void
}) {
  const lauf = useDismScanStore(s => s.lauf)
  const hosts = useDismScanStore(s => s.hosts)
  const wartetAuf = useDismScanStore(s => s.wartetAuf)
  const { starteAlle, pause, fortsetzen, abbrechen, schliesseLauf } = useDismScanStore.getState()
  // immer nur EIN Health Check zur Zeit — über alle Admins (dismScanStore.ts)
  const parallel = DISM_STANDARD_PARALLEL
  const [ausLetzten, setAusLetzten] = useState<'' | 'laeuft' | string>('')
  const laeuft = !!lauf && !lauf.fertigAm
  const jetzt = useTakt(laeuft)

  const mitHost = tiles.filter(t => t.hostname.trim())
  const st = (t: ServerTile) => status.servers[hostKey(t.hostname)]
  // Cluster-Knoten (HCI) nie per DISM — nur Ping (serverSchonung.ts)
  const knoten = mitHost.filter(t => istClusterKnoten(t.hostname))
  const offline = mitHost.filter(t => !knoten.includes(t) && st(t)?.online === false)
  const woanders = mitHost.filter(t => !knoten.includes(t) && st(t)?.online !== false && laeuftNoch(st(t)?.dism) && st(t)?.dism?.laeuft?.von !== by && !hosts[hostKey(t.hostname)])
  const ziel = mitHost.filter(t => !knoten.includes(t) && !offline.includes(t) && !woanders.includes(t))
  const schaetzungS = ziel.reduce((s, t) => s + (st(t)?.dism?.dauerS || DISM_DAUER_ANNAHME_S), 0) / Math.max(1, parallel)

  function starten() {
    const meta: Record<string, DismMeta> = {}
    for (const t of mitHost) meta[hostKey(t.hostname)] = metaVon(t)
    const ueber = [
      ...knoten.map(t => ({ host: t.hostname.trim(), grund: 'Cluster-Knoten – das Tool pingt hier nur (kein Health Check)' })),
      ...offline.map(t => ({ host: t.hostname.trim(), grund: 'laut Ping offline – übersprungen' })),
      ...woanders.map(t => ({ host: t.hostname.trim(), grund: `Health Check läuft gerade (gestartet von ${st(t)?.dism?.laeuft?.von}) – übersprungen` })),
    ]
    starteAlle(ziel.map(t => t.hostname.trim()), ueber, meta, by)
  }

  async function berichtAusLetzten() {
    setAusLetzten('laeuft')
    try {
      const meta: Record<string, DismMeta> = {}
      for (const t of mitHost) meta[hostKey(t.hostname)] = metaVon(t)
      const liste = await ladeLetzte(mitHost.map(t => t.hostname.trim()))
      if (!liste.length) { setAusLetzten('Noch kein Server mit dem Health Check geprüft.'); return }
      const b = await speichereBericht(liste, meta, by, `letzte-Ergebnisse-${liste.length}-Server`)
      setAusLetzten('')
      onBericht({ ...b, vorschlag: b.rel.split('/').pop() || 'HealthCheck-Bericht.md', titel: `Health-Check-Bericht · letzte Ergebnisse von ${liste.length} Servern` })
    } catch (e) { setAusLetzten('Fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e))) }
  }

  // ── Fortschritt ──
  const eigene = lauf ? lauf.hosts.map(h => hosts[hostKey(h)]).filter(Boolean) : []
  const fertig = eigene.filter(h => h!.phase === 'fertig')
  const aktiv = eigene.filter(h => h!.phase === 'laeuft')
  const wartend = eigene.filter(h => h!.phase === 'wartet')
  const gesamt = lauf ? lauf.hosts.length : 0
  const ergebnisse = fertig.map(h => h!.ergebnis!).filter(Boolean)
  const n = zaehle(ergebnisse)
  const sfcProbleme = ergebnisse.filter(e => e.sfc?.zustand === 'verletzungen').length

  return (
    <div className="shrink-0 mx-4 mt-2 px-3 py-2.5 rounded-md bg-card border border-border space-y-2" data-dism-panel>
      <div className="flex items-center gap-2 flex-wrap">
        <ScanSearch size={13} className="text-primary shrink-0" />
        <span className="text-xs font-semibold text-foreground">Health Check – Komponentenspeicher (DISM) + Systemdateien (SFC)</span>
        <code className="text-[10px] text-muted-foreground">{DISM_BEFEHL} · {SFC_BEFEHL}</code>
        <span title={HEALTH_TOOLTIP} className="text-muted-foreground cursor-help"><Info size={12} /></span>
        <button onClick={onSchliessen} title={laeuft ? 'Ausblenden – der Lauf geht im Hintergrund weiter' : 'Schließen'} className="ml-auto p-0.5 rounded text-muted-foreground hover:text-foreground"><X size={13} /></button>
      </div>
      {wartetAuf && <WarteHinweis w={wartetAuf} />}

      {!lauf && (<>
        <p className="text-[11px] text-muted-foreground">
          Prüft auf jedem erreichbaren Server zuerst den Windows-Komponentenspeicher (DISM ScanHealth), danach alle geschützten Systemdateien (SFC verifyonly).
          {' '}<b className="text-foreground">Nur Prüfung – es wird nichts repariert oder geändert.</b> Dauer je Server meist 10–30 min.
          {' '}<b className="text-foreground">Es läuft immer nur EIN Server zur Zeit – auch über alle Admins hinweg</b> (schont den gemeinsamen Cluster-Speicher);
          läuft gerade woanders ein Health Check, wartet der Lauf. Die Ergebnisse stehen sofort hier und auf den Kacheln; je Server mit Erklärung im Reiter „Schnell-Health-Check“.
          Am Ende entsteht zusätzlich ein Bericht als Markdown + JSON.
        </p>
        <div className="flex items-center gap-3 flex-wrap text-[11px]">
          <span className="text-foreground"><b>{ziel.length}</b> Server werden geprüft</span>
          {offline.length > 0 && <span className="text-muted-foreground">{offline.length} laut Ping offline (übersprungen)</span>}
          {woanders.length > 0 && <span className="text-amber-500">{woanders.length} laufen gerade bei einem anderen Admin (übersprungen)</span>}
          <span className="text-muted-foreground" data-dism-einzeln title="Höchstens ein Health Check gleichzeitig, egal von welchem PC – zwischen zwei Servern 15 s Pause">nacheinander · 1 Server zur Zeit</span>
          <span className="text-muted-foreground" title="Schätzung aus der letzten Dauer je Server (sonst 10 min)">Dauer ca. {(() => { const m = Math.max(1, Math.round(schaetzungS / 60)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` })()}</span>
          <button onClick={() => void berichtAusLetzten()} disabled={ausLetzten === 'laeuft'} data-knopf="dism-letzte"
            title="Ohne neuen Scan: Bericht aus den zuletzt gespeicherten Ergebnissen aller Server"
            className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50">
            {ausLetzten === 'laeuft' ? <Loader size={11} className="animate-spin" /> : <FileText size={11} />}Bericht aus letzten Ergebnissen
          </button>
          <button onClick={starten} disabled={ziel.length === 0} data-knopf="dism-start"
            title={`Health Check auf allen ${ziel.length} erreichbaren Servern starten.\n\n${HEALTH_TOOLTIP}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40">
            <Play size={12} />Alle {ziel.length} Server prüfen
          </button>
        </div>
        {ausLetzten && ausLetzten !== 'laeuft' && <p className="text-[11px] text-amber-500">{ausLetzten}</p>}
      </>)}

      {lauf && (<>
        <div className="flex items-center gap-2 text-[11px] flex-wrap">
          <span className="text-foreground font-semibold" data-dism-fortschritt>{fertig.length} von {gesamt} fertig</span>
          {n.gesund > 0 && <span className="px-1.5 rounded bg-emerald-600 text-white">{n.gesund} DISM gesund</span>}
          {n.reparierbar > 0 && <span className="px-1.5 rounded bg-amber-400 text-black">{n.reparierbar} DISM reparierbar</span>}
          {n.nicht_reparierbar > 0 && <span className="px-1.5 rounded bg-red-600 text-white">{n.nicht_reparierbar} DISM nicht reparierbar</span>}
          {n.fehler + n.unklar > 0 && <span className="px-1.5 rounded bg-red-600 text-white">{n.fehler + n.unklar} DISM-Fehler</span>}
          {sfcProbleme > 0 && <span className="px-1.5 rounded bg-red-600 text-white">{sfcProbleme} SFC mit Verletzungen</span>}
          {n.nicht_erreichbar + n.laeuft_schon > 0 && <span className="px-1.5 rounded bg-muted text-foreground">{n.nicht_erreichbar + n.laeuft_schon} nicht geprüft</span>}
          <span className="text-muted-foreground">· gestartet {zeitText(new Date(lauf.start).toISOString())} · {dauerText(Math.max(0, Math.round(((lauf.fertigAm || jetzt) - lauf.start) / 1000)))}</span>
          {laeuft && (
            <div className="ml-auto flex items-center gap-1.5">
              {lauf.abgebrochen ? <span className="text-amber-500">abgebrochen – laufende Server werden noch fertig</span>
                : lauf.pausiert ? <button onClick={fortsetzen} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border hover:bg-accent text-foreground"><Play size={11} />Fortsetzen</button>
                : <button onClick={pause} title="Keine weiteren Server starten (laufende werden fertig)" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border hover:bg-accent text-foreground"><Pause size={11} />Pause</button>}
              {!lauf.abgebrochen && <button onClick={abbrechen} title="Wartende Server nicht mehr prüfen; laufende werden fertig, danach Bericht" data-knopf="dism-abbrechen"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-red-500/40 text-red-500 hover:bg-red-500/10"><Square size={11} />Abbrechen</button>}
            </div>
          )}
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${gesamt ? Math.round(fertig.length / gesamt * 100) : 0}%` }} />
        </div>
        {laeuft && (
          <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
            {aktiv.length > 0 ? <>läuft: {aktiv.map(h => (
              <span key={h!.host} className="inline-flex items-center gap-1 px-1.5 rounded bg-blue-600/15 text-foreground font-mono">
                <Loader size={10} className="animate-spin" />{h!.host} {h!.seit ? dauerText(Math.max(0, Math.round((jetzt - h!.seit) / 1000))) : ''}
              </span>))}</> : <span>{lauf.pausiert ? 'pausiert' : wartetAuf ? 'wartet' : 'startet …'}</span>}
            {wartend.length > 0 && <span>· {wartend.length} warten{lauf.pausiert ? ' (pausiert)' : ''}</span>}
          </div>
        )}
        {(ergebnisse.length > 0 || (lauf.fertigAm && lauf.uebersprungen.length > 0)) && (
          <div className="max-h-64 overflow-y-auto rounded border border-border">
            <table className="w-full text-[11px]" data-health-tabelle>
              <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                <tr className="text-left"><th className="px-2 py-1 font-semibold">Server</th><th className="px-2 py-1 font-semibold">Ergebnis</th><th className="px-2 py-1 font-semibold">DISM</th><th className="px-2 py-1 font-semibold">SFC</th><th className="px-2 py-1 font-semibold">Dauer</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {[...ergebnisse].sort((a, b) => ({ rot: 0, gelb: 1, grau: 2, gruen: 3 }[healthGesamt({ zustand: a.zustand, sfc: a.sfc?.zustand }).stufe] - { rot: 0, gelb: 1, grau: 2, gruen: 3 }[healthGesamt({ zustand: b.zustand, sfc: b.sfc?.zustand }).stufe]) || a.host.localeCompare(b.host))
                  .map(e => <ErgebnisZeile key={e.host} e={e} onOeffnen={onOeffnen} />)}
                {lauf.fertigAm && lauf.uebersprungen.map(u => (
                  <tr key={'u' + u.host} className="text-muted-foreground"><td className="px-2 py-1 font-mono">{u.host}</td><td className="px-2 py-1" colSpan={5}>{u.grund}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lauf.fertigAm && (
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            {lauf.bericht ? (<>
              <span className="text-foreground">Bericht erstellt{lauf.bericht.ok ? ' und auf dem Netzlaufwerk abgelegt' : ' (Ablage auf dem Netzlaufwerk fehlgeschlagen)'}.</span>
              <button onClick={() => onBericht(lauf.bericht!)} data-knopf="dism-bericht"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90"><FileText size={12} />Bericht anzeigen</button>
              <button onClick={() => void oeffneBerichtOrdner()} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent"><FolderOpen size={11} />Berichte-Ordner</button>
            </>) : lauf.berichtFehler ? <span className="text-red-500">Bericht konnte nicht erstellt werden: {lauf.berichtFehler}</span>
              : <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader size={11} className="animate-spin" />Bericht wird erstellt …</span>}
            <button onClick={schliesseLauf} className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent">Neuer Lauf</button>
          </div>
        )}
      </>)}
    </div>
  )
}

/** Bericht ansehen, kopieren (für KI), speichern. */
export function DismBerichtDialog({ bericht, onClose }: { bericht: Pick<DismBericht, 'md' | 'json' | 'vorschlag' | 'titel'>; onClose: () => void }) {
  const [kopiert, setKopiert] = useState(false)
  const [meldung, setMeldung] = useState('')
  async function kopieren() {
    try { await navigator.clipboard.writeText(bericht.md); setKopiert(true); setTimeout(() => setKopiert(false), 2000) }
    catch { setMeldung('Kopieren nicht möglich.') }
  }
  async function speichern() {
    try {
      const p = await speichereBerichtUnter(bericht.md, bericht.json, bericht.vorschlag)
      if (p) setMeldung(`Gespeichert: ${p} (+ .json daneben)`)
    } catch (e) { setMeldung('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e))) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()} data-dism-bericht>
        <div className="shrink-0 px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
          <FileText size={16} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">{bericht.titel}</h3>
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={() => void kopieren()} title="Ganzen Bericht kopieren – z. B. zum Einfügen in eine KI"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground">
              {kopiert ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}{kopiert ? 'Kopiert' : 'Kopieren'}
            </button>
            <button onClick={() => void speichern()} title="Als .md speichern (dazu eine .json mit denselben Daten)"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground"><FileDown size={12} />Speichern unter …</button>
            <button onClick={() => void oeffneBerichtOrdner()} title="Ordner mit allen Health-Check-Berichten auf dem Netzlaufwerk"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-foreground"><FolderOpen size={12} />Berichte-Ordner</button>
            <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"><X size={16} /></button>
          </div>
        </div>
        {meldung && <div className="shrink-0 px-4 py-1.5 text-[11px] text-muted-foreground border-b border-border">{meldung}</div>}
        <pre className="flex-1 overflow-auto px-4 py-3 text-[11px] leading-relaxed font-mono text-foreground whitespace-pre-wrap break-words select-text">{bericht.md}</pre>
      </div>
    </div>
  )
}
