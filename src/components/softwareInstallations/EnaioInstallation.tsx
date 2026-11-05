// ── Kachel „Enaio" (Software Installationen) ─────────────────────────────────
// Ziel-PC wählen (Person → zugewiesene Geräte per Kästchen, oder Hostname/IP), Ist-Stand
// prüfen, optional alles von enaio vorher vollständig entfernen und dann nach der
// Anleitung „Neu Installation Client" installieren. Die Arbeit läuft im enaioInstallStore,
// damit ein Menüwechsel sie nicht abbricht.

import { useEffect, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileText, Loader2, Monitor, PackageCheck, Search, Trash2, UserSearch,
} from 'lucide-react'
import Card from '../Card'
import UserPcSearch from '../UserPcSearch'
import { DeviceInfoButton } from '../device/DeviceDossier'
import { isValidRemoteTarget } from '../../utils/remoteTarget'
import {
  ladeEnaioQuellordner, setzeEnaioQuellordner, findeEnaioQuelle, pruefeEnaioStand,
  ENAIO_ORDNER_STANDARD, ZIEL_TEMP, type EnaioQuelle, type EnaioStand,
} from '../../services/enaioInstall'
import { useEnaioInstallStore } from '../../store/enaioInstallStore'
import InstallLogbuch from './InstallLogbuch'
import { EnaioCaptureKnopf } from './EnaioCaptureDialog'

function mmss(s: number): string {
  const m = Math.floor(s / 60), r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export default function EnaioInstallation() {
  const [host, setHost] = useState('')
  const [serial, setSerial] = useState<string | undefined>(undefined)
  const [eingabe, setEingabe] = useState('')

  function uebernehmen(h: string, s?: string) { setHost(h.trim()); setSerial(s) }
  const eingabeOk = isValidRemoteTarget(eingabe.trim())

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FileText size={24} className="text-indigo-400" />
        <div>
          <h2 className="text-lg font-bold text-foreground">Enaio</h2>
          <p className="text-xs text-muted-foreground">
            enaio Client und die beiden Outlook-Add-Ins übers Netzwerk auf einem Ziel-PC installieren — auf Wunsch nach einem vollständigen Entfernen der alten Installation.
          </p>
        </div>
        <div className="ml-auto self-start">
          <EnaioCaptureKnopf host={host} />
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
            <input
              value={eingabe}
              onChange={e => setEingabe(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && eingabeOk) uebernehmen(eingabe) }}
              placeholder="Hostname (DE…) oder IP-Adresse"
              className="flex-1 min-w-0 px-2 py-1 text-xs font-mono rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary"
            />
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
              <button onClick={() => { setHost(''); setSerial(undefined) }}
                className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">anderer PC</button>
            </div>
            <EnaioPanel host={host} />
          </div>
        </Card>
      )}

      <InstallLogbuch software="Enaio" titel="Logbuch Enaio" />

      <Quelle />
    </div>
  )
}

function EnaioPanel({ host }: { host: string }) {
  const key = host.trim().toLowerCase()
  const lauf = useEnaioInstallStore(s => s.laeufe[key])
  const starte = useEnaioInstallStore(s => s.starte)
  const verwerfe = useEnaioInstallStore(s => s.verwerfe)
  const laeuft = lauf?.phase === 'laeuft' || lauf?.phase === 'wartet'

  const [stand, setStand] = useState<EnaioStand | null>(null)
  const [prueft, setPrueft] = useState(false)
  const [entfernen, setEntfernen] = useState(false)
  const [outlookBeenden, setOutlookBeenden] = useState(false)
  const [bestaetigen, setBestaetigen] = useState(false)
  const [dauer, setDauer] = useState(0)
  const [protokollAuf, setProtokollAuf] = useState(false)

  useEffect(() => { setStand(null); setBestaetigen(false); setDauer(0) }, [key])
  useEffect(() => {
    if (!laeuft) return
    const t = setInterval(() => setDauer(d => d + 1), 1000)
    return () => clearInterval(t)
  }, [laeuft])

  async function pruefen() {
    if (prueft) return
    setPrueft(true)
    setStand(await pruefeEnaioStand(host))
    setPrueft(false)
  }
  useEffect(() => { if (lauf?.phase === 'fertig') void pruefen() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lauf?.phase])

  function los() {
    if (entfernen && !bestaetigen) { setBestaetigen(true); return }
    setBestaetigen(false)
    starte(host, { entfernen, outlookBeenden })
  }

  const outlookLaeuft = (stand?.outlook.length ?? 0) > 0

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Ablauf wie in der Anleitung: Client-Ordner nach <span className="font-mono">{ZIEL_TEMP}</span> kopieren und dort <span className="font-mono">install.bat</span> ausführen,
        danach die Outlook-Add-Ins „Drag and Drop" und „NG" installieren. Alles läuft im Hintergrund über diesen Admin-PC.
      </p>

      {/* ── Ist-Stand ─────────────────────────────────────────────────────── */}
      <div className="rounded-md border border-border bg-background p-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">Enaio auf diesem PC</span>
          <button onClick={() => void pruefen()} disabled={prueft || laeuft}
            className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
            {prueft ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
            {prueft ? 'wird geprüft …' : stand ? 'Erneut prüfen' : 'Ist-Stand prüfen'}
          </button>
        </div>
        {!stand && !prueft && <p className="text-[11px] text-muted-foreground italic">Noch nicht geprüft — zeigt, welche enaio-Programme installiert sind und ob Outlook läuft.</p>}
        {stand?.fehler && <p className="flex items-start gap-1.5 text-[11px] text-red-300"><AlertTriangle size={12} className="shrink-0 mt-px" />{stand.fehler}</p>}
        {stand?.ok && (
          <>
            {stand.programme.length ? (
              <div className="rounded border border-border divide-y divide-border/60">
                {stand.programme.map((p, i) => (
                  <div key={i} className="px-2 py-1 flex items-center gap-2 text-[11px]">
                    <span className="text-foreground flex-1 min-w-0 truncate" title={p.publisher}>{p.name}</span>
                    <span className="font-mono text-muted-foreground">{p.version || '—'}</span>
                    <span className="text-[10px] text-muted-foreground">{p.wo}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-[11px] text-amber-300">Kein enaio-Programm installiert.</p>}
            <p className="text-[11px] text-muted-foreground">
              Angemeldet: <span className="text-foreground">{stand.angemeldet || 'niemand'}</span> ·
              Outlook: {outlookLaeuft ? <span className="text-amber-300 font-semibold">läuft ({stand.outlook.join(', ')})</span> : <span className="text-foreground">nicht geöffnet</span>}
            </p>
          </>
        )}
      </div>

      {/* ── Optionen ─────────────────────────────────────────────────────── */}
      <div className="rounded-md border border-border bg-background p-2.5 space-y-2">
        <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
          <input type="checkbox" className="accent-primary mt-0.5" checked={entfernen} disabled={laeuft}
            onChange={e => { setEntfernen(e.target.checked); setBestaetigen(false) }} />
          <span>
            <b>Vorher alles von enaio vollständig entfernen</b>
            <span className="block text-[11px] text-muted-foreground">
              Schritt 1: alle enaio-Programme aus „Programme und Features" deinstallieren (Client, Outlook-Add-Ins — auch pro Benutzer installierte),
              danach Reste löschen: Ordner in Programme/ProgramData/AppData, Registry (Herstellerschlüssel, Outlook-Add-In- und Windows-Installer-Einträge),
              Verknüpfungen, Dienste, Aufgaben. Systemordner und Sammelschlüssel sind fest geschützt.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
          <input type="checkbox" className="accent-primary mt-0.5" checked={outlookBeenden} disabled={laeuft || !entfernen}
            onChange={e => setOutlookBeenden(e.target.checked)} />
          <span className={entfernen ? '' : 'opacity-50'}>
            Outlook auf dem PC vorher beenden
            <span className="block text-[11px] text-muted-foreground">
              Sonst sind die Add-In-Dateien gesperrt und lassen sich nicht löschen. Achtung: ungespeicherte Entwürfe des Anwenders gehen verloren.
              {outlookLaeuft && <b className="text-amber-300"> Outlook läuft gerade.</b>}
            </span>
          </span>
        </label>
      </div>

      {/* ── Start ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={los} disabled={laeuft}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold text-white disabled:opacity-40 ${
            bestaetigen ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'}`}>
          {laeuft ? <Loader2 size={13} className="animate-spin" /> : entfernen ? <Trash2 size={13} /> : <PackageCheck size={13} />}
          {laeuft ? 'läuft …' : bestaetigen ? 'Ja, entfernen und neu installieren' : entfernen ? 'Enaio entfernen und neu installieren' : 'Enaio installieren'}
        </button>
        {bestaetigen && !laeuft && (
          <>
            <span className="text-[11px] text-amber-300">Alle enaio-Programme und ihre Reste auf {host} werden gelöscht.</span>
            <button onClick={() => setBestaetigen(false)} className="text-[11px] text-muted-foreground hover:text-foreground underline">abbrechen</button>
          </>
        )}
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
          lauf.ergebnis.ok ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-red-500/30 bg-red-500/5 text-red-300'}`}>
          {lauf.ergebnis.ok ? <CheckCircle2 size={13} className="shrink-0 mt-px" /> : <AlertTriangle size={13} className="shrink-0 mt-px" />}
          <span className="whitespace-pre-wrap break-words">
            {lauf.ergebnis.text}{lauf.ergebnis.neustartNoetig && ' Ein Neustart des PCs steht noch aus.'}
          </span>
        </div>
      )}

      {lauf?.ergebnis?.entfernt && lauf.ergebnis.entfernt.length > 0 && (
        <div className="rounded-md border border-border">
          <button onClick={() => setProtokollAuf(x => !x)} className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-foreground hover:bg-accent/30">
            {protokollAuf ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Protokoll „Entfernen" ({lauf.ergebnis.entfernt.filter(e => e.ok).length} ok, {lauf.ergebnis.entfernt.filter(e => !e.ok).length} nicht entfernt)
          </button>
          {protokollAuf && (
            <div className="max-h-72 overflow-y-auto divide-y divide-border/60 border-t border-border">
              {lauf.ergebnis.entfernt.map((e, i) => (
                <div key={i} className="flex items-start gap-2 px-2.5 py-1">
                  {e.ok ? <CheckCircle2 size={11} className="text-emerald-400 shrink-0 mt-px" /> : <AlertTriangle size={11} className="text-amber-400 shrink-0 mt-px" />}
                  <span className="min-w-0">
                    <span className="block text-[11px] text-foreground">{e.was}</span>
                    {e.info && <span className="block text-[10px] text-muted-foreground break-all">{e.info}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Herkunft der Installationsdateien — zentral änderbar, gilt für alle Admin-PCs. */
function Quelle() {
  const [ordner, setOrdner] = useState('')
  const [geladen, setGeladen] = useState(false)
  const [prueft, setPrueft] = useState(false)
  const [befund, setBefund] = useState<EnaioQuelle | null>(null)
  const [batAuf, setBatAuf] = useState(false)

  useEffect(() => { void ladeEnaioQuellordner().then(o => { setOrdner(o); setGeladen(true) }) }, [])

  async function pruefen() {
    setPrueft(true); setBefund(null)
    await setzeEnaioQuellordner(ordner)
    setBefund(await findeEnaioQuelle())
    setPrueft(false)
  }

  if (!geladen) return null
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Herkunft der Installationsdateien</p>
      <p className="text-[11px] text-muted-foreground">
        Erwartet werden darin: der neueste Ordner <span className="font-mono">Client-Ansi_*</span> mit <span className="font-mono">install.bat</span>,
        <span className="font-mono"> Outlook Add-In for drag and drop\*.msi</span> und <span className="font-mono">enaio_outlook_addin_ng*.msi</span>.
        Eine neue Version muss nur dort abgelegt werden.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <input value={ordner} onChange={e => setOrdner(e.target.value)}
          className="flex-1 min-w-[18rem] px-2 py-1 text-[11px] font-mono rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
        <button onClick={() => void pruefen()} disabled={prueft}
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
          {prueft && <Loader2 size={11} className="animate-spin" />}Speichern & prüfen
        </button>
        {ordner !== ENAIO_ORDNER_STANDARD && (
          <button onClick={() => setOrdner(ENAIO_ORDNER_STANDARD)} className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground underline">Standard</button>
        )}
      </div>
      {befund && (
        <div className={`text-[11px] space-y-0.5 ${befund.ok ? 'text-emerald-300' : 'text-red-300'}`}>
          <p className="flex items-start gap-1.5">
            {befund.ok ? <CheckCircle2 size={12} className="shrink-0 mt-px" /> : <AlertTriangle size={12} className="shrink-0 mt-px" />}
            {befund.ok ? 'Alle drei Teile gefunden.' : befund.fehler}
          </p>
          {befund.clientName && <p className="pl-5 text-muted-foreground">Client: <span className="font-mono">{befund.clientName}</span> · {befund.clientDateien} Dateien · {befund.clientMB} MB</p>}
          {befund.ddMsi && <p className="pl-5 text-muted-foreground font-mono break-all">{befund.ddMsi}</p>}
          {befund.ngMsi && <p className="pl-5 text-muted-foreground font-mono break-all">{befund.ngMsi}</p>}
          {befund.installBatKopf && (
            <div className="pl-5">
              <button onClick={() => setBatAuf(x => !x)} className="text-muted-foreground hover:text-foreground underline">
                {batAuf ? 'install.bat ausblenden' : 'Inhalt der install.bat anzeigen'}
              </button>
              {batAuf && <pre className="mt-1 p-2 rounded bg-background border border-border text-[10px] text-foreground whitespace-pre-wrap max-h-56 overflow-y-auto">{befund.installBatKopf}</pre>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
