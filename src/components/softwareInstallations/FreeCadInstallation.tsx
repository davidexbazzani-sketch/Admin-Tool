// ── Kachel „3D-Viewer (FreeCAD)" (Software Installationen) ───────────────────
// Für alle, die kein SOLIDWORKS/eDrawings haben, aber STEP-/IGES-Modelle ansehen müssen.
// Ziel-PC wählen wie bei den anderen Kacheln, Ist-Stand prüfen (auch: wer öffnet .step
// heute?), FreeCAD still installieren und STEP/IGES verknüpfen. Die Arbeit läuft im
// freecadInstallStore, damit ein Menüwechsel sie nicht abbricht.

import { useEffect, useState } from 'react'
import { AlertTriangle, Box, CheckCircle2, Download, Info, Loader2, Monitor, PackageCheck, Search, UserSearch } from 'lucide-react'
import Card from '../Card'
import UserPcSearch from '../UserPcSearch'
import { DeviceInfoButton } from '../device/DeviceDossier'
import { isValidRemoteTarget } from '../../utils/remoteTarget'
import {
  ladeFreeCadEinstellung, setzeFreeCadEinstellung, findeFreeCadSetup, ladeFreeCadHerunter, pruefeFreeCadStand,
  neuestesFreeCad, oeffnetMit, FREECAD_ORDNER_STANDARD, type FreeCadQuelle, type FreeCadStand, type EndungStand,
} from '../../services/freecadInstall'
import { useFreeCadInstallStore } from '../../store/freecadInstallStore'
import InstallLogbuch from './InstallLogbuch'
import { AnmeldeStatus, useAnmeldeCheck } from './AnmeldeCheck'

function mmss(s: number): string {
  const m = Math.floor(s / 60), r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}
const dateiname = (p: string) => p.split('\\').pop() || p

export default function FreeCadInstallation() {
  const [host, setHost] = useState('')
  const [serial, setSerial] = useState<string | undefined>(undefined)
  const [eingabe, setEingabe] = useState('')

  function uebernehmen(h: string, s?: string) { setHost(h.trim()); setSerial(s) }
  const eingabeOk = isValidRemoteTarget(eingabe.trim())

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Box size={24} className="text-orange-400" />
        <div>
          <h2 className="text-lg font-bold text-foreground">3D-Viewer (FreeCAD)</h2>
          <p className="text-xs text-muted-foreground">
            Für alle ohne SOLIDWORKS/eDrawings: 3D-Modelle (STEP/IGES) ansehen, drehen und messen. FreeCAD ist kostenlos und quelloffen (LGPL) — auch für Firmen frei nutzbar.
          </p>
        </div>
      </div>

      <Card>
        <div className="p-4 space-y-3">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            <UserSearch size={12} />Ziel-PC wählen
          </p>
          <p className="text-[11px] text-muted-foreground">
            Nach Namen suchen — dann erscheinen alle zugewiesenen Geräte, eins per Kästchen ankreuzen. Oder direkt Hostname bzw. IP-Adresse eingeben.
          </p>
          <UserPcSearch onPick={uebernehmen} mitOnlineStatus mitCheckbox placeholder="Name, Kürzel oder E-Mail eintippen …" />
          <div className="flex items-center gap-2 pt-1 border-t border-border/50">
            <Monitor size={13} className="text-muted-foreground shrink-0" />
            <span className="text-[11px] text-muted-foreground shrink-0">oder direkt:</span>
            <input value={eingabe} onChange={e => setEingabe(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && eingabeOk) uebernehmen(eingabe) }}
              placeholder="Hostname (DE…) oder IP-Adresse"
              className="flex-1 min-w-0 px-2 py-1 text-xs font-mono rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            <button onClick={() => uebernehmen(eingabe)} disabled={!eingabeOk}
              className="shrink-0 px-2.5 py-1 text-[11px] rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              Übernehmen
            </button>
          </div>
        </div>
      </Card>

      {host && (
        <Card>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Ziel-PC:</span>
              <span className="text-sm font-mono text-foreground">{host}</span>
              <DeviceInfoButton hostname={host} serial={serial} />
              <button onClick={() => { setHost(''); setSerial(undefined) }} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">anderer PC</button>
            </div>
            <AnmeldeStatus host={host} />
            <FreeCadPanel host={host} />
          </div>
        </Card>
      )}

      <AnwenderHinweis />
      <InstallLogbuch software="FreeCAD" titel="Logbuch 3D-Viewer (FreeCAD)" />
      <Quelle />
    </div>
  )
}

/** Wer öffnet die Endung per Doppelklick — Computer-Standard + Wahl je angemeldetem Benutzer. */
function EndungZeile({ e }: { e: EndungStand }) {
  const c = oeffnetMit({ ...e, nutzer: [] })
  return (
    <div className="px-2 py-1 text-[11px] flex items-start gap-2">
      <span className="font-mono text-foreground w-12 shrink-0">{e.ext}</span>
      <span className="flex-1 min-w-0 break-words">
        {c.programm
          ? <span className={c.mitFreeCad ? 'text-emerald-500 font-semibold' : 'text-foreground'}>{c.mitFreeCad ? 'FreeCAD' : dateiname(c.programm)}</span>
          : <span className="text-amber-500 font-semibold">kein Programm{e.standard ? ` (eingetragen: ${e.standard}, fehlt)` : ''}</span>}
        {e.nutzer.map(n => (
          <span key={n.sid} className="block text-muted-foreground">
            {n.benutzer}: {n.exe ? <span className="text-foreground">{/freecad\.exe$/i.test(n.exe) ? 'FreeCAD' : dateiname(n.exe)}</span> : <span className="text-amber-500">gewähltes Programm fehlt ({n.progid})</span>}
          </span>
        ))}
      </span>
    </div>
  )
}

function FreeCadPanel({ host }: { host: string }) {
  const key = host.trim().toLowerCase()
  const lauf = useFreeCadInstallStore(s => s.laeufe[key])
  const starte = useFreeCadInstallStore(s => s.starte)
  const verwerfe = useFreeCadInstallStore(s => s.verwerfe)
  const laeuft = lauf?.phase === 'laeuft' || lauf?.phase === 'wartet'

  const [stand, setStand] = useState<FreeCadStand | null>(null)
  const [prueft, setPrueft] = useState(false)
  const [verknuepfen, setVerknuepfen] = useState(true)
  const [erzwingen, setErzwingen] = useState(false)
  const [desktop, setDesktop] = useState(true)
  const [beenden, setBeenden] = useState(true)
  const [dauer, setDauer] = useState(0)
  const { vorStart, anmeldeDialog } = useAnmeldeCheck()

  useEffect(() => { setStand(null); setDauer(0) }, [key])
  useEffect(() => {
    if (!laeuft) return
    const t = setInterval(() => setDauer(d => d + 1), 1000)
    return () => clearInterval(t)
  }, [laeuft])

  async function pruefen() {
    if (prueft) return
    setPrueft(true)
    setStand(await pruefeFreeCadStand(host))
    setPrueft(false)
  }
  useEffect(() => { if (lauf?.phase === 'fertig') void pruefen() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lauf?.phase])

  const fc = stand?.ok ? neuestesFreeCad(stand) : undefined
  const mitSw = (stand?.solidworks.length ?? 0) > 0

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        FreeCAD wird still für alle Benutzer installiert (beim Anwender erscheint kein Fenster) und STEP-/IGES-Dateien öffnen danach per Doppelklick in FreeCAD.
        Ist auf dem PC schon ein funktionierendes Programm für STEP zuständig (z. B. SOLIDWORKS), bleibt es dabei — FreeCAD steht dann unter „Öffnen mit".
      </p>

      {/* ── Ist-Stand ─────────────────────────────────────────────────────── */}
      <div className="rounded-md border border-border bg-background p-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">Stand auf diesem PC</span>
          <button onClick={() => void pruefen()} disabled={prueft || laeuft}
            className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
            {prueft ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
            {prueft ? 'wird geprüft …' : stand ? 'Erneut prüfen' : 'Ist-Stand prüfen'}
          </button>
        </div>
        {!stand && !prueft && <p className="text-[11px] text-muted-foreground italic">Noch nicht geprüft — zeigt, ob FreeCAD installiert ist und mit welchem Programm STEP-/IGES-Dateien heute aufgehen.</p>}
        {stand?.fehler && <p className="flex items-start gap-1.5 text-[11px] text-red-500"><AlertTriangle size={12} className="shrink-0 mt-px" />{stand.fehler}</p>}
        {stand?.ok && (
          <>
            <p className="text-[11px] text-muted-foreground">
              FreeCAD: {fc ? <span className="text-foreground font-semibold">{fc.version} <span className="font-normal text-muted-foreground font-mono">({fc.ordner})</span></span> : <span className="text-amber-500 font-semibold">nicht installiert</span>}
              {stand.freecad.length > 1 && <span> · weitere: {stand.freecad.filter(x => x !== fc).map(x => x.version).join(', ')}</span>}
            </p>
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">Doppelklick öffnet:</p>
              <div className="rounded border border-border divide-y divide-border/60">
                {stand.endungen.map(e => <EndungZeile key={e.ext} e={e} />)}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Angemeldet: <span className="text-foreground">{stand.angemeldet || 'niemand'}</span> ·
              FreeCAD: {stand.laeuft.length ? <span className="text-amber-500 font-semibold">geöffnet ({stand.laeuft.join(', ')})</span> : <span className="text-foreground">nicht geöffnet</span>}
              {mitSw && <> · vorhanden: <span className="text-foreground">{stand.solidworks.join(', ')}</span></>}
            </p>
          </>
        )}
      </div>

      {/* ── Optionen ─────────────────────────────────────────────────────── */}
      <div className="rounded-md border border-border bg-background p-2.5 space-y-2">
        <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
          <input type="checkbox" className="accent-primary mt-0.5" checked={verknuepfen} disabled={laeuft} onChange={e => setVerknuepfen(e.target.checked)} />
          <span>
            STEP-/IGES-Dateien per Doppelklick mit FreeCAD öffnen
            <span className="block text-[11px] text-muted-foreground">.step, .stp, .stpz, .iges, .igs — nur wo noch kein funktionierendes Programm zuständig ist. Eine defekte „Immer öffnen mit"-Wahl (z. B. auf ein nicht mehr vorhandenes eDrawings) wird entfernt.</span>
          </span>
        </label>
        <label className={`flex items-start gap-2 text-xs text-foreground cursor-pointer pl-5 ${verknuepfen ? '' : 'opacity-40'}`}>
          <input type="checkbox" className="accent-primary mt-0.5" checked={erzwingen} disabled={laeuft || !verknuepfen} onChange={e => setErzwingen(e.target.checked)} />
          <span>
            … auch wenn ein anderes Programm zuständig ist
            <span className="block text-[11px] text-muted-foreground">
              Ersetzt den Computer-Standard{mitSw ? <b className="text-amber-500"> — auf diesem PC ist {stand!.solidworks.join(', ')} installiert, das meist besser passt</b> : ''}. Eine bewusste Wahl eines Benutzers bleibt.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
          <input type="checkbox" className="accent-primary mt-0.5" checked={desktop} disabled={laeuft} onChange={e => setDesktop(e.target.checked)} />
          <span>Desktop-Verknüpfung „FreeCAD" für alle Benutzer <span className="block text-[11px] text-muted-foreground">Legt das Setup an; abgewählt wird sie danach wieder entfernt (Startmenü bleibt).</span></span>
        </label>
        <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
          <input type="checkbox" className="accent-primary mt-0.5" checked={beenden} disabled={laeuft} onChange={e => setBeenden(e.target.checked)} />
          <span>
            Geöffnetes FreeCAD vorher schließen
            <span className="block text-[11px] text-muted-foreground">Sonst bricht das Setup ab. {stand?.laeuft.length ? <b className="text-amber-500">FreeCAD ist gerade geöffnet.</b> : null}</span>
          </span>
        </label>
      </div>

      {/* ── Start ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => { const opt = { verknuepfen, erzwingen: verknuepfen && erzwingen, desktop, beenden }; void vorStart(host, () => starte(host, opt)) }} disabled={laeuft}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-40">
          {laeuft ? <Loader2 size={13} className="animate-spin" /> : <PackageCheck size={13} />}
          {laeuft ? 'läuft …' : fc ? 'Aktualisieren / Verknüpfung prüfen' : 'FreeCAD installieren'}
        </button>
        {lauf?.phase === 'wartet' && <span className="text-[11px] text-muted-foreground">wartet auf einen freien Platz …</span>}
        {laeuft && <span className="text-[11px] text-muted-foreground tabular-nums">läuft seit {mmss(dauer)}</span>}
        {(lauf?.phase === 'fertig' || lauf?.phase === 'fehler') && (
          <button onClick={() => verwerfe(host)} className="text-[11px] text-muted-foreground hover:text-foreground underline">Meldung schließen</button>
        )}
      </div>

      {lauf && (
        <div className="rounded-md border border-border divide-y divide-border/60">
          {lauf.schritte.map(s => (
            <div key={s.id} className="flex items-start gap-2 px-2.5 py-1.5">
              <span className="shrink-0 mt-px">
                {s.status === 'laeuft' ? <Loader2 size={12} className="animate-spin text-blue-400" />
                  : s.status === 'ok' ? <CheckCircle2 size={12} className="text-emerald-500" />
                  : s.status === 'fehler' ? <AlertTriangle size={12} className="text-red-500" />
                  : s.status === 'warnung' ? <AlertTriangle size={12} className="text-amber-500" />
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
        <div className={`flex items-start gap-2 px-2.5 py-2 rounded-md text-[11px] border text-foreground ${lauf.ergebnis.ok ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-red-500/40 bg-red-500/10'}`}>
          {lauf.ergebnis.ok ? <CheckCircle2 size={13} className="shrink-0 mt-px text-emerald-500" /> : <AlertTriangle size={13} className="shrink-0 mt-px text-red-500" />}
          <span className="whitespace-pre-wrap break-words">{lauf.ergebnis.text}</span>
        </div>
      )}
      {anmeldeDialog}
    </div>
  )
}

/** Kurzanleitung für den Anwender — zum Weitergeben. */
function AnwenderHinweis() {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 space-y-1.5">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"><Info size={12} />So schauen Anwender ein Modell an</p>
      <ol className="list-decimal pl-5 space-y-0.5 text-[11px] text-foreground">
        <li>Doppelklick auf die <span className="font-mono">.step</span>-/<span className="font-mono">.stp</span>-Datei (sonst Rechtsklick → „Öffnen mit" → FreeCAD). Der erste Start dauert etwas länger.</li>
        <li>Fragt FreeCAD beim Öffnen nach Import-Einstellungen, einfach mit <b>OK</b> bestätigen.</li>
        <li>Mit der Maus drehen und zoomen; der Würfel oben rechts springt auf Ansichten (vorne, oben …). Taste <b>V</b> → <b>F</b> zeigt das ganze Modell.</li>
        <li>Nur ansehen — Änderungen müssen nicht gespeichert werden (beim Schließen „Nicht speichern").</li>
      </ol>
    </div>
  )
}

/** Herkunft des Setups — zentral änderbar, gilt für alle Admin-PCs. Neueste Version per Knopf. */
function Quelle() {
  const [ordner, setOrdner] = useState('')
  const [geladen, setGeladen] = useState(false)
  const [prueft, setPrueft] = useState(false)
  const [laedt, setLaedt] = useState(false)
  const [befund, setBefund] = useState<FreeCadQuelle | null>(null)
  const [download, setDownload] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { void ladeFreeCadEinstellung().then(e => { setOrdner(e.ordner); setGeladen(true) }) }, [])

  async function pruefen() {
    setPrueft(true); setBefund(null)
    await setzeFreeCadEinstellung({ ordner })
    setBefund(await findeFreeCadSetup())
    setPrueft(false)
  }
  async function laden() {
    setLaedt(true); setDownload(null)
    await setzeFreeCadEinstellung({ ordner })
    const r = await ladeFreeCadHerunter()
    setDownload(r.ok
      ? { ok: true, text: r.neu ? `FreeCAD ${r.version} (${r.mb} MB) heruntergeladen, Prüfsumme stimmt — liegt jetzt im Ordner.` : `FreeCAD ${r.version} liegt schon geprüft im Ordner — nichts zu tun.` }
      : { ok: false, text: r.fehler || 'Herunterladen fehlgeschlagen.' })
    setBefund(await findeFreeCadSetup())
    setLaedt(false)
  }

  if (!geladen) return null
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Herkunft des Setups</p>
      <p className="text-[11px] text-muted-foreground">
        Gesucht wird <span className="font-mono">FreeCAD_x.y.z-Windows-x86_64-…-installer.exe</span> im Ordner (die höchste Version gewinnt) samt der danebenliegenden
        <span className="font-mono"> …-SHA256.txt</span> — damit wird die Datei auf dem Ziel-PC geprüft. „Neueste Version laden" holt beides von der offiziellen FreeCAD-Release-Seite.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground w-16 shrink-0">Ordner</span>
        <input value={ordner} onChange={e => setOrdner(e.target.value)}
          className="flex-1 min-w-[18rem] px-2 py-1 text-[11px] font-mono rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
        {ordner !== FREECAD_ORDNER_STANDARD && (
          <button onClick={() => setOrdner(FREECAD_ORDNER_STANDARD)} className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground underline">Standard</button>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => void pruefen()} disabled={prueft || laedt}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
          {prueft && <Loader2 size={11} className="animate-spin" />}Speichern & prüfen
        </button>
        <button onClick={() => void laden()} disabled={prueft || laedt}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
          {laedt ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}{laedt ? 'lädt … (rund 500 MB, einige Minuten)' : 'Neueste Version laden'}
        </button>
      </div>
      {download && (
        <p className={`flex items-start gap-1.5 text-[11px] ${download.ok ? 'text-emerald-500' : 'text-red-500'}`}>
          {download.ok ? <CheckCircle2 size={12} className="shrink-0 mt-px" /> : <AlertTriangle size={12} className="shrink-0 mt-px" />}{download.text}
        </p>
      )}
      {befund && (
        <div className="text-[11px] space-y-0.5">
          <p className={`flex items-start gap-1.5 ${befund.ok ? (befund.sha256 ? 'text-emerald-500' : 'text-amber-500') : 'text-red-500'}`}>
            {befund.ok ? <CheckCircle2 size={12} className="shrink-0 mt-px" /> : <AlertTriangle size={12} className="shrink-0 mt-px" />}
            {befund.ok ? `Gefunden: FreeCAD ${befund.version} · ${befund.groesseMB} MB · ${befund.sha256 ? 'Prüfsumme vorhanden' : 'KEINE Prüfsumme (…-SHA256.txt fehlt)'}` : befund.fehler}
          </p>
          {befund.ok && <p className="pl-5 text-muted-foreground font-mono break-all">{befund.pfad}</p>}
        </div>
      )}
    </div>
  )
}
