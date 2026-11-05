// ── Zusatzbaustein „Enaio Capture" (Scan-Arbeitsplatz) ───────────────────────
// Bewusst NICHT im normalen Enaio-Ablauf: eigener kleiner Knopf oben rechts in der Kachel,
// Kästchen standardmäßig aus, beim Anhaken ein deutlicher Hinweis, dass das nur für den
// Spezial-PC am Scanner gedacht ist.

import { useEffect, useState, type ChangeEvent } from 'react'
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, FolderOpen, Hand, Loader2, Play, ScanLine, X,
} from 'lucide-react'
import { api } from '../../electronAPI'
import {
  ladeCaptureQuellen, setzeCaptureQuellen, findeCaptureQuellen, ermittleEnaioServer, pruefeCaptureZiel, SCANCLIENT_STANDARD, ANTWORT_DATEI,
  type CaptureFund, type CaptureOptionen, type CaptureQuellen, type ServerWahl, type CaptureZiel,
} from '../../services/enaioCapture'
import { useEnaioCaptureStore } from '../../store/enaioCaptureStore'
import InstallLogbuch from './InstallLogbuch'

export function EnaioCaptureKnopf({ host }: { host: string }) {
  const [auf, setAuf] = useState(false)
  const laeuft = useEnaioCaptureStore(s => s.lauf?.phase === 'laeuft')
  return (
    <>
      <button onClick={() => setAuf(true)}
        title="Zusatz für den Scan-Arbeitsplatz — für die normale Enaio-Installation nicht nötig"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30">
        {laeuft ? <Loader2 size={12} className="animate-spin" /> : <ScanLine size={12} />}Enaio Capture
      </button>
      {auf && <EnaioCaptureDialog host={host} onClose={() => setAuf(false)} />}
    </>
  )
}

const VORGABE: CaptureOptionen = { kofax: true, twain: true, isis: false, data2sap: false, starten: true, neuInstallieren: false }
const haupt = (v: string) => Number((v || '').split('.')[0]) || 0
/** Version, die tatsächlich installiert würde — das MSI geht vor, wenn es mindestens so neu ist (wie in installiereCapture). */
const quellVersion = (f: CaptureFund) => f.msiPfad && (!f.setupExe || haupt(f.msiVersion) >= haupt(f.setupVersion)) ? f.msiVersion : f.setupVersion

function EnaioCaptureDialog({ host, onClose }: { host: string; onClose: () => void }) {
  const lauf = useEnaioCaptureStore(s => s.lauf)
  const starte = useEnaioCaptureStore(s => s.starte)
  const verwerfe = useEnaioCaptureStore(s => s.verwerfe)
  const laeuft = lauf?.phase === 'laeuft'

  const [gewollt, setGewollt] = useState(false)
  const [fragt, setFragt] = useState(false)
  const [opt, setOpt] = useState<CaptureOptionen>(VORGABE)
  const [quellenAuf, setQuellenAuf] = useState(false)
  const [fund, setFund] = useState<CaptureFund | null>(null)
  const [sucht, setSucht] = useState(false)

  // Sobald Capture gewollt ist: Quellen gleich prüfen — so sieht man VOR dem Start, was
  // gefunden wurde und was übersprungen wird.
  const [serverWahl, setServerWahl] = useState<ServerWahl | null>(null)
  const [zielInfo, setZielInfo] = useState<CaptureZiel | null>(null)
  const [serverSucht, setServerSucht] = useState(false)
  useEffect(() => {
    if (!gewollt || fund || sucht) return
    setSucht(true)
    void findeCaptureQuellen().then(f => {
      setFund(f); setSucht(false)
      setServerSucht(true)
      void ermittleEnaioServer(host, f.server, f.comstring, f.serverKandidaten).then(w => { setServerWahl(w); setServerSucht(false) })
      void pruefeCaptureZiel(host).then(setZielInfo)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gewollt])
  // Neuere Version gefunden als auf dem PC → „neu installieren" gleich vorwählen (einmal, abwählbar)
  const [vorgewaehlt, setVorgewaehlt] = useState(false)
  useEffect(() => {
    if (vorgewaehlt || !fund || !zielInfo?.capturePfad) return
    if (haupt(quellVersion(fund)) > haupt(zielInfo.captureVersion) && haupt(zielInfo.captureVersion) > 0) { setOpt(o => ({ ...o, neuInstallieren: true })); setVorgewaehlt(true) }
  }, [fund, zielInfo, vorgewaehlt])

  const setze =(k: keyof CaptureOptionen) => (e: ChangeEvent<HTMLInputElement>) => setOpt(o => ({ ...o, [k]: e.target.checked }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-[820px] max-w-full max-h-[92vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <ScanLine size={16} className="text-indigo-400" />
          <h2 className="text-base font-semibold text-foreground">Enaio Capture (Scan-Arbeitsplatz)</h2>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-[12px] text-amber-200">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              <b>Für die normale Enaio-Installation NICHT nötig.</b> Dieser Zusatz ist nur für den Spezial-PC am Scanner
              (Fujitsu fi-7160) gedacht, an dem Belege eingescannt und an enaio übergeben werden.
            </span>
          </div>

          {/* ── Laufender / letzter Lauf ───────────────────────────────── */}
          {lauf && <LaufAnzeige />}

          {!laeuft && (
            !host ? (
              <p className="text-xs text-muted-foreground">Bitte zuerst in der Kachel einen Ziel-PC wählen.</p>
            ) : (
              <div className="rounded-md border border-border bg-background p-3 space-y-2.5">
                <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" className="accent-primary mt-1" checked={gewollt}
                    onChange={e => { if (e.target.checked) setFragt(true); else { setGewollt(false); setFragt(false) } }} />
                  <span>Enaio Capture auf <span className="font-mono">{host}</span> einrichten</span>
                </label>

                {fragt && !gewollt && (
                  <div className="ml-6 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 space-y-2 text-[12px] text-foreground">
                    <p>
                      Hinweis: Für eine <b>standardmäßige</b> Enaio-Installation ist das <b>nicht notwendig</b>. Nur weitermachen,
                      wenn <span className="font-mono">{host}</span> wirklich der Scan-Arbeitsplatz ist.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => { setGewollt(true); setFragt(false) }}
                        className="px-2.5 py-1 text-[11px] rounded-md font-semibold bg-amber-600 hover:bg-amber-500 text-white">Ja, das ist der Scan-PC</button>
                      <button onClick={() => setFragt(false)}
                        className="px-2.5 py-1 text-[11px] rounded-md border border-border text-foreground hover:bg-accent">Abbrechen</button>
                    </div>
                  </div>
                )}

                {gewollt && (
                  <div className="ml-6 space-y-2">
                    <p className="text-[11px] text-muted-foreground">Was dazu gehört (Vorgabe = Scanner fi-7160):</p>
                    {([
                      ['kofax', 'Kofax Retrieval Engine 3.1', 'für den fi-7160 nötig'],
                      ['twain', 'Scanner-Treiber fi-7160 (PaperStream IP TWAIN, 32 Bit)', 'für den fi-7160 nötig'],
                      ['isis', 'Scanner-Treiber fi-6140 (ISIS)', 'nur für den alten fi-6140'],
                      ['data2sap', 'DATA2SAP („Spätes Ablegen im Versand")', 'nur für den Versand · braucht den normalen enaio Client'],
                      ['starten', 'Capture am Ende beim Anwender starten', 'trägt den Arbeitsplatz in die Lizenzdatenbank ein'],
                      ['neuInstallieren', 'Capture neu installieren (vorhandenes vorher entfernen)', 'nur bei Versionswechsel, z. B. 9.0 → 11 — der alte asindex-Ordner wird als asindex.alt_… gesichert'],
                    ] as [keyof CaptureOptionen, string, string][]).map(([k, t, h]) => (
                      <label key={k} className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
                        <input type="checkbox" className="accent-primary mt-0.5" checked={opt[k]} onChange={setze(k)} />
                        <span>{t}<span className="block text-[10px] text-muted-foreground">{h}</span></span>
                      </label>
                    ))}
                    <div className="text-[11px] text-muted-foreground rounded border border-border/60 p-2 space-y-1">
                      <p>Das Tool erledigt selbst: Kopieren, Installationsordner (D: nur wenn lokal vorhanden, sonst C:), Scan-Konfiguration samt Pfadanpassung, ODBC „OSCAPTURE", Prüfung.</p>
                      <p className="flex items-start gap-1"><Hand size={11} className="shrink-0 mt-0.5" />Einige Setups öffnen ein Fenster <b>am PC</b> — dort muss jemand angemeldet sein und klicken. Was zu klicken ist, steht dann hier.</p>
                    </div>
                    <div className="rounded border border-border/60 p-2">
                      <p className="text-[11px] font-semibold text-foreground mb-1">Gefunden</p>
                      {sucht && <p className="text-[11px] text-muted-foreground"><Loader2 size={11} className="inline animate-spin mr-1" />Quellen werden gesucht — inkl. der enaio-Server nach dem Capture-MSI (bis zu 5 Minuten) …</p>}
                      {fund && <FundAnzeige fund={fund} />}
                    </div>
                    <div className="rounded border border-border/60 p-2">
                      <p className="text-[11px] font-semibold text-foreground mb-1">Auf dem PC {host}</p>
                      {!zielInfo && <p className="text-[11px] text-muted-foreground"><Loader2 size={11} className="inline animate-spin mr-1" />wird geprüft …</p>}
                      {zielInfo && !zielInfo.ok && <p className="text-[11px] text-amber-300">{zielInfo.fehler}</p>}
                      {zielInfo?.ok && (
                        <div className="text-[11px] space-y-0.5 mb-2">
                          <p className="text-foreground">
                            {zielInfo.capturePfad ? <>Capture <b>{zielInfo.captureVersion || '?'}</b> installiert unter <span className="font-mono">{zielInfo.capturePfad}</span></> : 'Capture ist nicht installiert.'}
                            {' · '}normaler enaio Client: {zielInfo.clientVorhanden ? 'vorhanden' : 'nicht installiert'}
                          </p>
                          {zielInfo.capturePfad && fund && haupt(quellVersion(fund)) > haupt(zielInfo.captureVersion) && haupt(zielInfo.captureVersion) > 0 && (
                            <p className="text-amber-300">Gefunden wurde Capture {quellVersion(fund)} — „Capture neu installieren" ist deshalb angehakt (alte Version wird vorher entfernt).</p>
                          )}
                          {zielInfo.capturePfad && fund && haupt(fund.clientVersion) > haupt(zielInfo.captureVersion) && haupt(quellVersion(fund)) <= haupt(zielInfo.captureVersion) && haupt(zielInfo.captureVersion) > 0 && (
                            <p className="text-red-300">
                              Capture {zielInfo.captureVersion} passt nicht zu enaio {fund.clientVersion}, und Capture {haupt(fund.clientVersion)}.x („enaio_capture_ansi.msi") wurde nirgends gefunden
                              (auch nicht auf den enaio-Servern). Neu installieren mit derselben alten Version hilft nicht — das MSI liegt auf dem Installationsmedium enaio {fund.clientVersion} unter Frontend\Capture: bei der enaio-Betreuung anfordern.
                            </p>
                          )}
                        </div>
                      )}
                      <p className="text-[11px] font-semibold text-foreground mb-1">enaio-Server (vom Ziel-PC aus geprüft)</p>
                      {serverSucht && <p className="text-[11px] text-muted-foreground"><Loader2 size={11} className="inline animate-spin mr-1" />prüfe vom Ziel-PC aus, welcher Server antwortet …</p>}
                      {!serverSucht && !serverWahl && <p className="text-[11px] text-muted-foreground">wird nach der Quellensuche geprüft …</p>}
                      {serverWahl && <ServerAnzeige wahl={serverWahl} />}
                    </div>
                    <button onClick={() => starte(host, opt)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-amber-600 hover:bg-amber-500 text-white">
                      <Play size={12} />Enaio Capture einrichten
                    </button>
                  </div>
                )}
              </div>
            )
          )}

          {lauf && !laeuft && (
            <button onClick={verwerfe} className="text-[11px] text-muted-foreground hover:text-foreground underline">Meldung schließen</button>
          )}

          <div className="rounded-md border border-border">
            <button onClick={() => setQuellenAuf(x => !x)} className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] text-foreground hover:bg-accent/30">
              {quellenAuf ? <ChevronDown size={12} /> : <ChevronRight size={12} />}Herkunft der Installationsdateien
            </button>
            {quellenAuf && <Quellen onFund={setFund} />}
          </div>

          <InstallLogbuch software="Enaio Capture" titel="Logbuch Enaio Capture" />
        </div>
      </div>
    </div>
  )
}

function LaufAnzeige() {
  const lauf = useEnaioCaptureStore(s => s.lauf)!
  const laeuft = lauf.phase === 'laeuft'
  return (
    <div className="space-y-2">
      <p className="text-xs text-foreground">
        {laeuft ? <Loader2 size={12} className="inline animate-spin mr-1" /> : null}
        Lauf auf <span className="font-mono">{lauf.host}</span>{laeuft ? ' läuft …' : ''}
      </p>

      {lauf.hinweis && (
        <div className="rounded-md border-2 border-blue-500/60 bg-blue-500/10 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-blue-200"><Hand size={14} />Jetzt am PC {lauf.host}: {lauf.hinweis.titel}</p>
          <ol className="mt-1.5 list-decimal pl-5 space-y-0.5 text-[12px] text-foreground">
            {lauf.hinweis.punkte.map((p, i) => <li key={i}>{p}</li>)}
          </ol>
        </div>
      )}

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

      {lauf.ergebnis && (
        <div className={`flex items-start gap-2 px-2.5 py-2 rounded-md text-[11px] border ${
          lauf.ergebnis.ok ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-red-500/30 bg-red-500/5 text-red-300'}`}>
          {lauf.ergebnis.ok ? <CheckCircle2 size={13} className="shrink-0 mt-px" /> : <AlertTriangle size={13} className="shrink-0 mt-px" />}
          <span>{lauf.ergebnis.text}</span>
        </div>
      )}
      {lauf.ergebnis && lauf.ergebnis.nacharbeit.length > 0 && (
        <div className="rounded-md border border-border p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground"><ClipboardList size={12} />Noch von Hand zu erledigen</p>
          <ul className="mt-1 list-disc pl-5 space-y-0.5 text-[11px] text-foreground">
            {lauf.ergebnis.nacharbeit.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Welche enaio-Server antworten (vom Ziel-PC aus geprüft) und was im Setup einzutragen ist. */
function ServerAnzeige({ wahl }: { wahl: ServerWahl }) {
  return (
    <div className="space-y-0.5">
      {wahl.gewaehlt ? (
        <p className="text-[12px] text-foreground">
          Im Setup eintragen: <b className="font-mono">Server = {wahl.gewaehlt}</b> · <b className="font-mono">Port = {wahl.port}</b>
          <span className="block text-[10px] text-muted-foreground">{wahl.grund}. Das Tool trägt ihn nach dem Setup zusätzlich selbst in die asinit.cfg von Capture ein (Comstring={wahl.gewaehlt}#{wahl.port}).</span>
        </p>
      ) : <p className="text-[11px] text-amber-300">{wahl.grund}</p>}
      {wahl.server.map(s => (
        <p key={s.name} className="flex items-center gap-1.5 text-[11px] flex-wrap">
          {s.offen ? <CheckCircle2 size={11} className="text-emerald-400" /> : <X size={11} className="text-muted-foreground" />}
          <span className={`font-mono ${s.name === wahl.gewaehlt ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>{s.name}</span>
          <span className="text-muted-foreground">{s.beschreibung}</span>
          <span className="text-[10px] text-muted-foreground">· Port {s.port} {s.offen === null ? 'nicht geprüft' : s.offen ? 'offen' : 'antwortet nicht'}{s.rolle === 'sql' ? ' · Datenbank, nicht für Capture' : s.rolle === 'test' ? ' · Testsystem' : ''}</span>
        </p>
      ))}
    </div>
  )
}

/** Was gefunden wurde — kompakt, mit aufklappbarer Diagnose („wo gesucht, warum nicht"). */
function FundAnzeige({ fund }: { fund: CaptureFund }) {
  const [diagAuf, setDiagAuf] = useState(false)
  const zeile = (titel: string, wert: string, pflicht = false) => (
    <p className="flex items-start gap-1.5 text-[11px]">
      {wert ? <CheckCircle2 size={11} className="text-emerald-400 shrink-0 mt-0.5" /> : <AlertTriangle size={11} className={`${pflicht ? 'text-red-400' : 'text-amber-400'} shrink-0 mt-0.5`} />}
      <span className="text-foreground shrink-0">{titel}:</span>
      <span className="font-mono text-muted-foreground break-all">{wert || (pflicht ? 'nicht gefunden' : 'nicht gefunden — wird übersprungen')}</span>
    </p>
  )
  return (
    <div className="space-y-0.5">
      {zeile('Capture-MSI (enaio 10/11)', fund.msiPfad ? `${fund.msiName} · Version ${fund.msiVersion || '?'} · ${fund.msiQuelle} (${fund.msiMB} MB)` : '')}
      {zeile('Capture-Setup', fund.setupExe ? `${fund.setupVersion ? `Version ${fund.setupVersion} · ` : ''}${fund.setupQuelle} (${fund.setupMB} MB)` : '', true)}
      {fund.msiPfad && quellVersion(fund) === fund.msiVersion && (
        <p className="text-[11px] text-emerald-300 pl-4">Installiert wird das MSI — still, ohne Fenster am PC.</p>
      )}
      {(fund.setupExe || fund.msiPfad) && fund.clientVersion && haupt(quellVersion(fund)) < haupt(fund.clientVersion) && (
        <p className="text-[11px] text-amber-300 pl-4">
          Achtung: Capture {quellVersion(fund)} ist älter als euer enaio Client {fund.clientVersion}. Das passende Capture ist „enaio_capture_ansi.msi" vom Installationsmedium enaio {fund.clientVersion}
          (FrontendCapture) — liegt es irgendwo, unter „Herkunft der Installationsdateien" → „Capture-Setup" dessen Ordner wählen.
        </p>
      )}
      {zeile('Kofax', fund.kofaxExe)}
      {zeile('TWAIN fi-7160', fund.twainExe)}
      {zeile('ISIS fi-6140', fund.isisExe)}
      {zeile('Scan-Konfiguration', fund.konfigOrdner ? `${fund.konfigOrdner} (${fund.konfigDateien} Dateien${fund.konfigVonPc ? ', vom Vorlage-PC' : ''})` : '')}
      {zeile('DATA2SAP', fund.data2sapOrdner)}
      {zeile('enaio-Server (asinit.cfg Client)', fund.comstring ? `${fund.comstring} — aus ${fund.asinitPfad}` : '')}
      <p className="text-[11px] text-muted-foreground">
        Setup-Antworten: {fund.antwortDatei ? 'vorhanden — Setup läuft still' : 'noch keine — erste Installation mit Fenster, wird dabei aufgezeichnet'}
      </p>
      {!fund.setupExe && !fund.msiPfad && (
        <p className="text-[11px] text-amber-300">
          Ohne Setup geht es nur, wenn Capture auf dem PC schon installiert ist oder dort eine Kopie aus einem früheren Versuch liegt.
          Sonst unter „Herkunft der Installationsdateien" den Ordner mit dem Capture-Setup wählen oder einen vorhandenen Scan-Arbeitsplatz als Vorlage-PC eintragen.
        </p>
      )}
      {fund.diagnose.length > 0 && (
        <div>
          <button onClick={() => setDiagAuf(x => !x)} className="text-[10px] text-muted-foreground hover:text-foreground underline">
            {diagAuf ? 'Suchweg ausblenden' : `Suchweg anzeigen (${fund.diagnose.length} Stellen geprüft)`}
          </button>
          {diagAuf && (
            <div className="mt-1 max-h-48 overflow-y-auto rounded border border-border divide-y divide-border/60">
              {fund.diagnose.map((d, i) => (
                <p key={i} className="px-2 py-0.5 text-[10px]">
                  <span className="text-foreground">{d.was}</span> · <span className="font-mono text-muted-foreground break-all">{d.pfad || '—'}</span>
                  <span className={`block ${d.ergebnis.startsWith('gefunden') ? 'text-emerald-300' : 'text-muted-foreground'}`}>{d.ergebnis}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Quellen({ onFund }: { onFund?: (f: CaptureFund) => void }) {
  const [q, setQ] = useState<CaptureQuellen | null>(null)
  const [prueft, setPrueft] = useState(false)
  const [fund, setFund] = useState<CaptureFund | null>(null)
  useEffect(() => { void ladeCaptureQuellen().then(setQ) }, [])
  if (!q) return <p className="px-3 pb-3 text-[11px] text-muted-foreground"><Loader2 size={11} className="inline animate-spin mr-1" />lädt …</p>

  async function pruefen() {
    if (!q) return
    setPrueft(true); setFund(null)
    await setzeCaptureQuellen(q)
    const f = await findeCaptureQuellen()
    setFund(f); onFund?.(f)
    setPrueft(false)
  }
  async function waehle(k: keyof CaptureQuellen) {
    const p = await api().selectDirectory()
    if (p && q) setQ({ ...q, [k]: p })
  }
  const feld = (k: keyof CaptureQuellen, titel: string, hilfe: string, opt: { standard?: string; ordner?: boolean; platzhalter?: string } = {}) => (
    <label className="block">
      <span className="text-[10px] text-muted-foreground">{titel} — {hilfe}</span>
      <div className="flex items-center gap-2">
        <input value={q[k]} onChange={e => setQ({ ...q, [k]: e.target.value })} placeholder={opt.platzhalter}
          className="flex-1 min-w-0 px-2 py-1 text-[11px] font-mono rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
        {opt.ordner && <button onClick={() => void waehle(k)} className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-border text-muted-foreground hover:text-foreground"><FolderOpen size={10} />Ordner wählen…</button>}
        {opt.standard && q[k] !== opt.standard && <button onClick={() => setQ({ ...q, [k]: opt.standard! })} className="text-[10px] text-muted-foreground underline">Standard</button>}
      </div>
    </label>
  )
  return (
    <div className="px-3 pb-3 space-y-2">
      <p className="text-[10px] text-muted-foreground">
        Gesucht wird der Reihe nach: eigener Ordner → enaio-Ordner (I:\Public\Public\Enaio, inkl. Client-Paket) → SW_INSTA\ENAIO → Vorlage-PC.
        Was an einer Stelle fehlt, wird an der nächsten gesucht. (Den Server VM0127 aus der alten Anleitung gibt es nicht mehr.)
      </p>
      {feld('setup', 'Capture-Setup', 'optional — Ordner, in dem das enaio-Setup mit Capture liegt', { ordner: true, platzhalter: 'automatisch suchen' })}
      {feld('vorlagePc', 'Vorlage-PC', 'optional — ein vorhandener Scan-Arbeitsplatz: Konfiguration (und ggf. Setup) kommen von dort', { platzhalter: 'z. B. DEHAM5CG1234567' })}
      {feld('scanclient', 'Scanclient', 'früher „S:\\SW_INSTA\\ENAIO\\Scanclient" (Kofax, Treiber, Scan_Konfig)', { standard: SCANCLIENT_STANDARD, ordner: true })}
      {feld('konfig', 'Scan-Konfiguration', 'optional — eigener Ordner', { ordner: true, platzhalter: 'automatisch (Scan_Konfig bzw. Vorlage-PC)' })}
      {feld('server', 'enaio-Server', 'nur falls die automatische Wahl falsch ist — sonst leer lassen (Standard: Comstring aus der asinit.cfg des enaio Clients)', { platzhalter: 'automatisch, z. B. W3168' })}
      <button onClick={() => void pruefen()} disabled={prueft}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
        {prueft && <Loader2 size={11} className="animate-spin" />}{prueft ? 'sucht … (bis zu 3 Minuten)' : 'Speichern & suchen'}
      </button>
      {fund && <FundAnzeige fund={fund} />}
      <p className="text-[10px] text-muted-foreground">Setup-Antworten liegen unter <span className="font-mono">{ANTWORT_DATEI}</span>.</p>
    </div>
  )
}
