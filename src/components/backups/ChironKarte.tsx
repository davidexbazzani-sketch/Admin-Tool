// ── Kachel „Chiron Backup" (AMCube-Sync auf w3294) ────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Factory, Play, Pencil, Pause, RefreshCw, Loader2, X, Trash2, Clock, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronRight, FileText, History, Scale, ShieldAlert, HardDrive, Upload, Eye, KeyRound, Plus, WifiOff,
} from 'lucide-react'
import type { BackupJob } from '../../services/backups'
import { updateJob, deleteJob } from '../../services/backups'
import {
  liesServerStand, liesStandCache, schreibeStandCache, richteEin, starteAuftrag, warteAufAuftrag, setzeZielstamm,
  setzeAufgabeAktiv, entferneVomServer, liesVerlauf, liesToolAktionen, setzePasswort, speichereKonfigAufServer, protokolliere,
  pruefeKonfig, normalisiereKonfig, quellPfad, zielPfad, fehlerAnzeige, serverPfadUnc, chironAmpel, ueberfaellig, umlaute,
  CHIRON_SKRIPT_VERSION, ROOT_PROD, ROOT_TEST,
  type ChironServerStand, type ChironKonfig, type ChironAnlage, type ChironAnlageStatus, type ChironVerlauf, type ChironAktion, type ChironFehler,
} from '../../services/chironBackup'
import { fmtBytes, fmtDauer } from '../../services/backupBericht'
import { beschreibeChiron, naechsterChironSlot } from '../../services/backupBeschreibung'
import BackupInfoBox from './BackupInfoBox'
import { api } from '../../electronAPI'

const fmt = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

async function oeffne(host: string, p?: string): Promise<string> {
  const pfad = serverPfadUnc(host, p)
  if (!pfad) return ''
  const r = await api().openPath(pfad)
  return r.success ? '' : `Log nicht erreichbar: ${pfad}${r.error ? ` (${r.error})` : ''}`
}

function ModeBadge({ root }: { root?: string }) {
  return root === ROOT_PROD
    ? <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-md bg-emerald-600 text-white" title="Schreibt in 02_Serienproduktion">PRODUKTIV</span>
    : <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-md bg-orange-500 text-white" title="Schreibt nur in 02_Serienproduktion_Test">TEST</span>
}

// ── Eine Anlage ───────────────────────────────────────────────────────────────
function AnlageZeile({ a, s, k, host, laeuftHier, busy, onJetzt }: {
  a: ChironAnlage; s?: ChironAnlageStatus; k: ChironKonfig; host: string; laeuftHier: boolean; busy: boolean; onJetzt: () => void
}) {
  const [auf, setAuf] = useState(false)
  const [logFehler, setLogFehler] = useState('')
  const fehler = s?.fehler
  const ueber = a.aktiv && ueberfaellig(s, k)
  const punkt = !a.aktiv ? 'bg-muted-foreground/30' : fehler ? 'bg-red-500' : s?.ergebnis === 'nicht_erreichbar' || ueber ? 'bg-amber-500' : s?.ergebnis === 'ok' ? 'bg-emerald-500' : 'bg-muted-foreground/40'
  const ergebnis = !a.aktiv ? <span className="text-muted-foreground">deaktiviert</span>
    : laeuftHier ? <span className="text-blue-500 flex items-center gap-1"><Loader2 size={11} className="animate-spin" />läuft</span>
    : fehler ? <span className="text-red-500 font-medium">Fehler</span>
    : s?.ergebnis === 'nicht_erreichbar' ? <span className="text-amber-500">nicht erreichbar (wird nachgeholt)</span>
    : s?.ergebnis === 'ok' ? <span className="text-emerald-500 font-medium">OK</span>
    : <span className="text-muted-foreground">noch kein Lauf</span>
  const fa = fehler ? fehlerAnzeige(fehler) : null
  return (
    <div className="px-2 py-1.5">
      <div className="grid grid-cols-[auto_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_auto] items-center gap-2 text-[11px]">
        <span className={`w-2 h-2 rounded-full ${punkt}`} />
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{a.name || a.id}</p>
          <p className="text-muted-foreground truncate" title={quellPfad(a)}>{a.hostname} · {a.ip || 'keine IP'}</p>
        </div>
        <div className="min-w-0">
          {!a.aktiv ? <span className="text-muted-foreground">—</span>
            : s?.erreichbar == null ? <span className="text-muted-foreground">nicht geprüft</span>
            : s.erreichbar ? <span className="text-emerald-500">erreichbar</span> : <span className="text-amber-500 flex items-center gap-1"><WifiOff size={11} />aus / nicht erreichbar</span>}
          {s?.geprueftAm && a.aktiv && <p className="text-[10px] text-muted-foreground">{fmt(s.geprueftAm)}</p>}
        </div>
        <div className="min-w-0">
          {!a.aktiv && !s?.letzterErfolg ? <span className="text-muted-foreground">—</span> : (<>
          <p className={ueber ? 'text-amber-500 font-medium' : 'text-foreground'}>{fmt(s?.letzterErfolg)}</p>
          <p className="text-[10px] text-muted-foreground">letzter Erfolg{s?.letzterErfolgZiel && s.letzterErfolgZiel !== k.targetRoot ? ' (noch im Test)' : ''}</p></>)}
        </div>
        <div className="min-w-0">{ergebnis}{s?.letzterVersuch && a.aktiv && <p className="text-[10px] text-muted-foreground">Versuch {fmt(s.letzterVersuch)}</p>}</div>
        <div className="min-w-0 text-muted-foreground">
          {s?.ergebnis === 'ok' || s?.kopiert ? <>{(s?.kopiert ?? 0).toLocaleString('de-DE')} Dateien<br /><span className="text-[10px]">{fmtBytes(s?.bytes ?? 0)}{s?.dauerSek != null ? ` · ${fmtDauer(s.dauerSek)}` : ''}</span></> : '—'}
        </div>
        <button onClick={onJetzt} disabled={!a.aktiv || busy} title={`Nur ${a.id} jetzt synchronisieren`} className="p-1 rounded-md border border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-30"><Play size={11} /></button>
      </div>
      {ueber && !fehler && (
        <p className="ml-4 mt-1 text-[11px] text-amber-500 flex items-center gap-1"><AlertTriangle size={11} />Seit über {k.warnStunden} Stunden kein erfolgreicher Sync.</p>
      )}
      {fehler && fa && (
        <div className="ml-4 mt-1 rounded-md border border-red-500/40 bg-red-500/5 px-2 py-1.5">
          <button onClick={async () => { if (fehler.log) setLogFehler(await oeffne(host, fehler.log)) }} title={fehler.log ? 'Log dieses Laufs öffnen' : undefined}
            className={`text-left text-[11px] text-red-500 font-medium ${fehler.log ? 'hover:underline' : 'cursor-default'}`}>
            {a.id} · {fmt(fehler.am)}: {fa.text}
          </button>
          {fa.hilfe && <p className="text-[11px] text-muted-foreground mt-0.5">{fa.hilfe}</p>}
          <button onClick={() => setAuf(v => !v)} className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground">{auf ? <ChevronDown size={10} /> : <ChevronRight size={10} />}Original-Meldung</button>
          {auf && (
            <div className="text-[10px] text-muted-foreground font-mono mt-0.5 space-y-0.5 break-all">
              {fehler.original && <p>{fehler.original}</p>}
              <p>Art: {fehler.art}{fehler.code ? ` · Windows-Code ${fehler.code}` : ''}{fehler.rc != null ? ` · robocopy-Exitcode ${fehler.rc}` : ''}{fehler.anzahl ? ` · ${fehler.anzahl} Fehler` : ''}</p>
              {fehler.log && <p>{serverPfadUnc(host, fehler.log)}</p>}
            </div>
          )}
          {logFehler && <p className="text-[10px] text-amber-500 mt-0.5 break-all">{logFehler}</p>}
        </div>
      )}
      {s?.probelauf && !fehler && s.probelauf.am && Date.now() - new Date(s.probelauf.am).getTime() < 24 * 3600_000 && (
        <p className="ml-4 mt-0.5 text-[10px] text-muted-foreground">Probelauf {fmt(s.probelauf.am)}: {s.probelauf.ergebnis === 'ok' ? `würde ${s.probelauf.wuerdeKopieren.toLocaleString('de-DE')} Dateien (${fmtBytes(s.probelauf.bytes)}) kopieren` : s.probelauf.ergebnis === 'nicht_erreichbar' ? 'Anlage nicht erreichbar' : umlaute(s.probelauf.fehler?.text || 'Fehler')}</p>
      )}
    </div>
  )
}

// ── Kachel ────────────────────────────────────────────────────────────────────
type Dialog = null | 'bearbeiten' | 'vergleich' | 'log' | 'produktiv' | 'groesse' | 'loeschen'

export default function ChironKarte({ job, username, ich, onGeaendert }: {
  job: BackupJob; username: string; ich: string; onGeaendert: () => void
}) {
  const daten = job.chiron!
  const host = daten.server
  const [stand, setStand] = useState<ChironServerStand | null>(null)
  const [cache, setCache] = useState<ChironServerStand | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [busy, setBusy] = useState('')
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler' | 'info'; text: string } | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const geschriebenFuer = useRef('')
  const x = { von: username, rechner: ich }

  const laden = useCallback(async () => {
    setLaedt(true)
    try {
      const s = await liesServerStand(host)
      setStand(s)
      const key = s.status?.aktualisiert || ''
      if (s.erreichbar && key !== geschriebenFuer.current) { geschriebenFuer.current = key; void schreibeStandCache(job.id, s); setCache(s) }
    } finally { setLaedt(false) }
  }, [host, job.id])

  useEffect(() => {
    void liesStandCache(job.id).then(c => { if (c) setCache(c) })
    void laden()
    const t = setInterval(() => { void laden() }, 5 * 60_000)
    return () => clearInterval(t)
  }, [laden, job.id])

  // Läuft gerade ein Sync auf dem Server? Dann öfter nachsehen.
  const laeuft = stand?.status?.laeuft && stand.status.laeuft.aktualisiert && Date.now() - new Date(stand.status.laeuft.aktualisiert).getTime() < 10 * 60_000 ? stand.status.laeuft : null
  useEffect(() => {
    if (!laeuft) return
    const t = setTimeout(() => { void laden() }, 15_000)
    return () => clearTimeout(t)
  }, [laeuft, laden, stand])

  const anzeige = stand?.erreichbar ? stand : (cache ?? stand)
  const veraltet = !!stand && !stand.erreichbar
  const konfig = anzeige?.konfig ?? daten.konfig
  const st = anzeige?.status ?? null
  const ampel = chironAmpel(anzeige ?? null, konfig)
  const pausiert = job.status === 'paused' || anzeige?.aufgabe?.aktiv === false
  const aktive = konfig.anlagen.filter(a => a.aktiv)
  const beschreibung = useMemo(() => beschreibeChiron(konfig, { server: host, pausiert, targetRoot: st?.targetRoot }), [konfig, host, pausiert, st?.targetRoot])
  const naechsterSlot = naechsterChironSlot(konfig.slots)
  const letzterVersuch = aktive.map(a => st?.anlagen?.[a.id]?.letzterVersuch).filter(Boolean).sort().pop()
  const letzterText = !letzterVersuch ? '' : aktive.some(a => st?.anlagen?.[a.id]?.fehler) ? 'Fehler' : aktive.some(a => st?.anlagen?.[a.id]?.ergebnis === 'nicht_erreichbar') ? 'teilweise' : 'ok'
  const updateNoetig = !!anzeige?.eingerichtet && !!anzeige.skriptVersion && anzeige.skriptVersion !== CHIRON_SKRIPT_VERSION
  const farbe = { gruen: 'bg-emerald-500', gelb: 'bg-amber-500', rot: 'bg-red-500', grau: 'bg-muted-foreground/40' }[ampel.farbe]

  async function aktion(label: string, fn: () => Promise<void>) {
    setBusy(label); setMeldung(null)
    try { await fn() } catch (e) { setMeldung({ art: 'fehler', text: e instanceof Error ? e.message : String(e) }) } finally { setBusy('') }
  }

  const jetzt = (anlagen?: string[], dryRun = false) => aktion(dryRun ? 'probe' : 'jetzt', async () => {
    const r = await starteAuftrag(host, 'sync', { ...x, anlagen, dryRun })
    void protokolliere(host, username, dryRun ? 'probelauf' : 'jetzt-ausfuehren', { anlagen: anlagen ?? 'alle' })
    if (!r.ok) { setMeldung({ art: 'fehler', text: r.fehler || 'Start fehlgeschlagen' }); return }
    setMeldung({ art: 'info', text: `${dryRun ? 'Probelauf' : 'Sync'} ${anlagen?.length ? `für ${anlagen.join(', ')} ` : ''}auf ${host} gestartet — läuft als Aufgabe auf dem Server. Der Stand aktualisiert sich hier automatisch.` })
    setTimeout(() => { void laden() }, 8000)
  })

  const einrichten = (pw?: string) => aktion('einrichten', async () => {
    const r = await richteEin(host, konfig, { ...x, aktiv: job.status !== 'paused' })
    void protokolliere(host, username, 'auf-server-einrichten', { ok: r.ok, zugriff: r.zugriff, version: CHIRON_SKRIPT_VERSION, fehler: r.fehler })
    if (!r.ok) { setMeldung({ art: 'fehler', text: r.fehler || 'Einrichten fehlgeschlagen' }); return }
    await updateJob(job.id, { chiron: { ...daten, konfig, eingerichtetAm: new Date().toISOString(), eingerichtetVon: username, skriptVersion: CHIRON_SKRIPT_VERSION } })
    let text = `Auf ${host} eingerichtet (${r.zugriff === 'winrm' ? 'über WinRM' : 'über die Admin-Freigabe + schtasks'}). Aufgabe ${CHIRON_SKRIPT_VERSION} angelegt, Modus ${r.daten?.targetRoot === ROOT_PROD ? 'PRODUKTIV' : 'TEST'}.`
    if (pw) {
      setMeldung({ art: 'info', text: `${text} Warte auf den Schlüssel des Servers für das Passwort…` })
      let s: ChironServerStand | null = null
      for (let i = 0; i < 18 && !s?.schluessel; i++) { await new Promise(res => setTimeout(res, 5000)); s = await liesServerStand(host) }
      if (!s?.schluessel) text += ' Das Passwort konnte noch nicht übermittelt werden (Schlüssel fehlt) — bitte gleich unter „Bearbeiten" erneut setzen.'
      else {
        const p = await setzePasswort(host, pw, s.schluessel, x)
        void protokolliere(host, username, 'passwort-setzen', { ok: p.ok })
        text += p.ok ? ' Passwort verschlüsselt übermittelt, Anmeldung an den Anlagen wird geprüft.' : ` Passwort: ${p.fehler}`
      }
    }
    setMeldung({ art: 'ok', text })
    onGeaendert()
    await laden()
  })

  const pausieren = () => aktion('pause', async () => {
    const aktiv = pausiert
    if (anzeige?.eingerichtet) {
      const r = await setzeAufgabeAktiv(host, aktiv, x)
      if (!r.ok) { setMeldung({ art: 'fehler', text: `${aktiv ? 'Fortsetzen' : 'Pausieren'} auf ${host} fehlgeschlagen: ${r.fehler}` }); return }
    }
    await updateJob(job.id, { status: aktiv ? 'active' : 'paused' })
    void protokolliere(host, username, aktiv ? 'fortsetzen' : 'pausieren')
    onGeaendert(); await laden()
  })

  const eingerichtet = !!anzeige?.eingerichtet
  const istProd = (st?.targetRoot || konfig.targetRoot) === ROOT_PROD

  return (
    <div className="rounded-lg border border-border bg-card p-3 xl:col-span-2">
      {/* Kopf */}
      <div className="flex items-start gap-2">
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${farbe} ${laeuft ? 'animate-pulse' : ''}`} title={ampel.grund} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Factory size={15} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-foreground truncate">{job.name}</h3>
            <ModeBadge root={st?.targetRoot || konfig.targetRoot} />
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500" title="Läuft als geplante Aufgabe auf dem Server">Server-Aufgabe</span>
            {pausiert && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">pausiert</span>}
            <span className="text-[10px] text-muted-foreground">{ampel.grund}</span>
          </div>
          <BackupInfoBox b={beschreibung} />
          <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1 flex-wrap">
            <Clock size={11} className="shrink-0" />
            {naechsterSlot && !pausiert ? <>nächster Termin: <span className="text-foreground">{fmt(naechsterSlot.toISOString())}</span> · </> : null}
            letzter Lauf: {fmt(letzterVersuch)}{letzterText ? ` (${letzterText})` : ''}
          </p>
          {/* Server-Zustand */}
          {veraltet && (
            <p className="text-[11px] text-amber-500 mt-1 flex items-start gap-1"><WifiOff size={12} className="mt-0.5 shrink-0" />
              Server {host} nicht erreichbar{cache ? `, Status vom ${fmt(cache.gelesenAm)}` : ''}. {stand?.fehler ? <span className="text-muted-foreground">({stand.fehler})</span> : null}</p>
          )}
          {stand?.erreichbar && !eingerichtet && (
            <p className="text-[11px] text-amber-500 mt-1 flex items-center gap-1"><AlertTriangle size={12} />Noch nicht auf {host} eingerichtet — „Auf Server einrichten" klicken (Testmodus).</p>
          )}
          {anzeige?.erreichbar && eingerichtet && anzeige.aufgabe && !anzeige.aufgabe.vorhanden && !anzeige.aufgabe.fehler && (
            <p className="text-[11px] text-amber-500 mt-1 flex items-center gap-1"><AlertTriangle size={12} />Geplante Aufgabe {`\\SKF\\AMCubeSync`} fehlt auf {host} — „Auf Server aktualisieren".</p>
          )}
          {updateNoetig && <p className="text-[11px] text-blue-500 mt-1">Neuere Skriptversion im Tool ({anzeige?.skriptVersion} → {CHIRON_SKRIPT_VERSION}) — „Auf Server aktualisieren".</p>}
          {st?.server?.freigabeOk === false && <p className="text-[11px] text-red-500 mt-1 flex items-start gap-1"><ShieldAlert size={12} className="mt-0.5 shrink-0" />{umlaute(st.server.freigabeFehler || '')}</p>}
          {st?.fehler && <p className="text-[11px] text-red-500 mt-1 flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{umlaute(st.fehler.text)}</p>}
          {eingerichtet && !st?.passwort && !st?.passwortFehler && (
            <p className="text-[11px] text-amber-500 mt-1 flex items-center gap-1"><KeyRound size={12} />Noch kein Passwort für {konfig.benutzer} hinterlegt — unter „Bearbeiten" setzen.</p>
          )}
          {st?.passwortFehler && <p className="text-[11px] text-red-500 mt-1">{umlaute(st.passwortFehler.text)}</p>}
          {laeuft && <p className="text-[11px] text-blue-500 mt-1 flex items-center gap-1"><Loader2 size={12} className="animate-spin" />Sync läuft auf {host}{laeuft.anlage ? ` — ${laeuft.anlage}` : ''}{laeuft.kopiert ? ` · ${laeuft.kopiert.toLocaleString('de-DE')} Dateien kopiert` : ''} (seit {fmt(laeuft.seit)})</p>}
          {st?.server?.freiBytes != null && <p className="text-[10px] text-muted-foreground mt-0.5">Frei auf {host} {konfig.basePath.slice(0, 2)} {fmtBytes(st.server.freiBytes)} (Minimum {konfig.minFreeGB} GB){st.passwort ? ` · Passwort hinterlegt am ${fmt(st.passwort.gesetztAm)} von ${st.passwort.von}` : ''}{anzeige?.zugriff ? ` · Zugriff ${anzeige.zugriff === 'winrm' ? 'WinRM' : 'Admin-Freigabe'}` : ''} · gelesen {fmt(anzeige?.gelesenAm)}</p>}
        </div>
      </div>

      {/* Anlagen */}
      <div className="mt-2 rounded-md border border-border divide-y divide-border">
        <div className="hidden md:grid grid-cols-[auto_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_auto] gap-2 px-2 py-1 text-[10px] text-muted-foreground">
          <span className="w-2" /><span>Anlage</span><span>vom Server aus</span><span>Sync</span><span>Ergebnis letzter Lauf</span><span>Kopiert (letzter Erfolg)</span><span className="w-6" />
        </div>
        {konfig.anlagen.map(a => (
          <AnlageZeile key={a.id} a={a} s={st?.anlagen?.[a.id]} k={konfig} host={host} laeuftHier={!!laeuft && laeuft.anlage === a.id} busy={!!busy || !eingerichtet || pausiert} onJetzt={() => jetzt([a.id])} />
        ))}
      </div>

      {meldung && (
        <p className={`text-[11px] mt-2 flex items-start gap-1 ${meldung.art === 'fehler' ? 'text-red-500' : meldung.art === 'ok' ? 'text-emerald-500' : 'text-blue-500'}`}>
          {meldung.art === 'fehler' ? <AlertTriangle size={12} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={12} className="mt-0.5 shrink-0" />}<span className="flex-1">{meldung.text}</span>
          <button onClick={() => setMeldung(null)} className="text-muted-foreground hover:text-foreground"><X size={11} /></button>
        </p>
      )}

      {/* Knöpfe */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <Knopf gruen onClick={() => jetzt()} disabled={!!busy || !eingerichtet || pausiert} laedt={busy === 'jetzt'} icon={Play} title={pausiert ? 'Pausiert' : undefined}>Jetzt ausführen</Knopf>
        <Knopf onClick={() => jetzt(undefined, true)} disabled={!!busy || !eingerichtet} laedt={busy === 'probe'} icon={Eye} title="robocopy /L — listet nur, was kopiert würde">Probelauf</Knopf>
        <Knopf onClick={() => setDialog('bearbeiten')} disabled={!!busy} icon={Pencil}>Bearbeiten</Knopf>
        <Knopf onClick={pausieren} disabled={!!busy} laedt={busy === 'pause'} icon={pausiert ? Play : Pause}>{pausiert ? 'Fortsetzen' : 'Pausieren'}</Knopf>
        <Knopf onClick={() => setDialog('log')} disabled={!eingerichtet} icon={History}>Log anzeigen</Knopf>
        <Knopf onClick={() => { void laden() }} disabled={laedt} laedt={laedt} icon={RefreshCw}>Aktualisieren</Knopf>
        <span className="w-px h-5 bg-border mx-0.5" />
        <Knopf onClick={() => einrichten()} disabled={!!busy} laedt={busy === 'einrichten'} icon={Upload} title="Skript + Konfiguration nach C:\ProgramData\AMCubeSync, geplante Aufgabe anlegen/aktualisieren">{eingerichtet ? 'Auf Server aktualisieren' : 'Auf Server einrichten'}</Knopf>
        <Knopf onClick={() => setDialog('groesse')} disabled={!!busy || !eingerichtet} icon={HardDrive} title="Größe der Quellordner gegen den freien Platz auf dem Server">Speicherplatz prüfen</Knopf>
        <Knopf onClick={() => setDialog('vergleich')} disabled={!!busy || !eingerichtet} icon={Scale}>Vergleich Test ↔ Produktiv</Knopf>
        <Knopf onClick={() => setDialog('produktiv')} disabled={!!busy || !eingerichtet} icon={ShieldAlert} warn={!istProd}>{istProd ? 'Zurück auf TEST' : 'Produktiv schalten'}</Knopf>
        <button onClick={() => setDialog('loeschen')} disabled={!!busy} className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-red-500/40 text-red-500 hover:bg-red-500/10 disabled:opacity-40"><Trash2 size={12} />Löschen</button>
      </div>

      {dialog === 'bearbeiten' && (
        <ChironEditor job={job} konfig={konfig} stand={anzeige ?? null} onClose={() => setDialog(null)}
          onSpeichern={async (name, k, pw) => {
            const eing = !!stand?.erreichbar && !!stand.eingerichtet
            if (eing) {
              const r = await speichereKonfigAufServer(host, k, { ...x, aenderung: konfigAenderung(konfig, k) })
              if (!r.ok) return `Auf ${host} nicht gespeichert: ${r.fehler}`
            }
            const u = await updateJob(job.id, { name: name.trim() || 'Chiron Backup', chiron: { ...daten, konfig: k } })
            if (!u.ok) return u.error || 'Speichern fehlgeschlagen'
            void protokolliere(host, username, 'bearbeiten', { name, aenderung: konfigAenderung(konfig, k), aufServer: eing })
            let hinweis = eing ? '' : 'Gespeichert im Tool. Auf den Server kommt die Konfiguration mit „Auf Server einrichten".'
            if (pw) {
              if (!stand?.schluessel) {
                if (!eing) { setDialog(null); onGeaendert(); void einrichten(pw); return null }
                return 'Der Server hat noch keinen Schlüssel veröffentlicht — „Auf Server aktualisieren" und dann erneut versuchen.'
              }
              const p = await setzePasswort(host, pw, stand.schluessel, x)
              void protokolliere(host, username, 'passwort-setzen', { ok: p.ok })
              if (!p.ok) return `Passwort nicht übermittelt: ${p.fehler}`
              hinweis = 'Passwort verschlüsselt übermittelt — der Server prüft jetzt die Anmeldung an allen Anlagen.'
              void (async () => {
                const e = await warteAufAuftrag<{ id: string; aktiv: boolean; erreichbar: boolean; anmeldung: string; fehler?: ChironFehler }[]>(host, p.daten!.id, 5 * 60_000)
                if (e.ok && Array.isArray(e.daten)) {
                  const schlecht = e.daten.filter(z => z.erreichbar && z.anmeldung !== 'ok')
                  setMeldung(schlecht.length
                    ? { art: 'fehler', text: `Anmeldung fehlgeschlagen: ${schlecht.map(z => `${z.id}: ${umlaute(z.fehler?.text || z.anmeldung)}`).join(' · ')}` }
                    : { art: 'ok', text: `Passwort hinterlegt. Anmeldung ok: ${e.daten.filter(z => z.anmeldung === 'ok').map(z => z.id).join(', ') || '—'}${e.daten.some(z => !z.erreichbar && z.aktiv) ? ` · nicht erreichbar: ${e.daten.filter(z => !z.erreichbar && z.aktiv).map(z => z.id).join(', ')}` : ''}` })
                }
                void laden()
              })()
            }
            setDialog(null)
            if (hinweis) setMeldung({ art: 'info', text: hinweis })
            onGeaendert(); void laden()
            return null
          }} />
      )}
      {dialog === 'vergleich' && <VergleichDialog host={host} x={x} onClose={() => setDialog(null)} onProduktiv={!istProd ? () => setDialog('produktiv') : undefined} />}
      {dialog === 'groesse' && <GroesseDialog host={host} x={x} onClose={() => setDialog(null)} />}
      {dialog === 'log' && <LogDialog host={host} konfig={konfig} onClose={() => setDialog(null)} />}
      {dialog === 'produktiv' && (
        <ProduktivDialog istProd={istProd} host={host} konfig={konfig} onClose={() => setDialog(null)} onVergleich={() => setDialog('vergleich')}
          onBestaetigt={async () => {
            const root = istProd ? ROOT_TEST : ROOT_PROD
            const r = await setzeZielstamm(host, root, x)
            void protokolliere(host, username, istProd ? 'zurueck-auf-test' : 'produktiv-schalten', { ok: r.ok, fehler: r.fehler })
            if (!r.ok) return r.fehler || 'Umschalten fehlgeschlagen'
            await updateJob(job.id, { chiron: { ...daten, konfig: { ...konfig, targetRoot: root } } })
            setDialog(null)
            setMeldung({ art: 'ok', text: root === ROOT_PROD ? `PRODUKTIV: ab dem nächsten Lauf schreibt ${host} nach ${konfig.basePath}\\${ROOT_PROD}.` : `Zurück auf TEST: ${konfig.basePath}\\${ROOT_PROD} wird nicht mehr beschrieben.` })
            onGeaendert(); void laden()
            return null
          }} />
      )}
      {dialog === 'loeschen' && (
        <LoeschenDialog name={job.name} host={host} eingerichtet={eingerichtet} onClose={() => setDialog(null)}
          onLoeschen={async (vomServer) => {
            if (vomServer) {
              const r = await entferneVomServer(host)
              void protokolliere(host, username, 'vom-server-entfernt', { ok: r.ok, fehler: r.fehler })
              if (!r.ok) return `Auf ${host} nicht entfernt: ${r.fehler}`
            }
            const d = await deleteJob(job.id)
            void protokolliere(host, username, 'kachel-geloescht', { vomServer })
            if (!d.ok) return d.error || 'Löschen fehlgeschlagen'
            setDialog(null); onGeaendert()
            return null
          }} />
      )}
    </div>
  )
}

function konfigAenderung(a: ChironKonfig, b: ChironKonfig): string {
  const t: string[] = []
  if (a.slots.join(',') !== b.slots.join(',')) t.push(`Zeiten ${a.slots.join('/')} → ${b.slots.join('/')}`)
  if (a.minFreeGB !== b.minFreeGB) t.push(`Mindestplatz ${a.minFreeGB} → ${b.minFreeGB} GB`)
  if (a.basePath !== b.basePath || a.shareName !== b.shareName) t.push('Basis/Freigabe')
  for (const x of b.anlagen) {
    const y = a.anlagen.find(z => z.id === x.id)
    if (!y) { t.push(`+${x.id}`); continue }
    if (JSON.stringify(x) !== JSON.stringify(y)) t.push(`${x.id} geändert`)
  }
  for (const y of a.anlagen) if (!b.anlagen.some(z => z.id === y.id)) t.push(`−${y.id}`)
  return t.join(', ') || 'keine'
}

function Knopf({ children, onClick, disabled, laedt, icon: Icon, gruen, warn, title }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; laedt?: boolean; icon: typeof Play; gruen?: boolean; warn?: boolean; title?: string
}) {
  const stil = gruen ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
    : warn ? 'border-orange-500/50 text-orange-500 hover:bg-orange-500/10'
    : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border disabled:opacity-40 ${stil}`}>
      {laedt ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}{children}
    </button>
  )
}

function Rahmen({ titel, icon: Icon, onClose, children, breit = false, fuss }: { titel: string; icon: typeof Play; onClose: () => void; children: React.ReactNode; breit?: boolean; fuss?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-card border border-border rounded-xl shadow-2xl w-full ${breit ? 'max-w-5xl' : 'max-w-xl'} max-h-[92vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <Icon size={17} className="text-blue-500" /><h3 className="text-base font-semibold text-foreground">{titel}</h3>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground"><X size={16} /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {fuss && <div className="flex items-center gap-2 px-5 py-3 border-t border-border">{fuss}</div>}
      </div>
    </div>
  )
}

// ── Bearbeiten ────────────────────────────────────────────────────────────────
function ChironEditor({ job, konfig, stand, onClose, onSpeichern }: {
  job: BackupJob; konfig: ChironKonfig; stand: ChironServerStand | null; onClose: () => void
  onSpeichern: (name: string, k: ChironKonfig, pw?: string) => Promise<string | null>
}) {
  const [name, setName] = useState(job.name)
  const [k, setK] = useState<ChironKonfig>(() => JSON.parse(JSON.stringify(konfig)))
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [neueZeit, setNeueZeit] = useState('12:00')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const fehler = useMemo(() => pruefeKonfig(normalisiereKonfig(k)), [k])
  const pwFehler = pw && pw !== pw2 ? 'Die beiden Passwörter stimmen nicht überein.' : ''
  const setA = (i: number, p: Partial<ChironAnlage>) => setK(v => ({ ...v, anlagen: v.anlagen.map((a, j) => j === i ? { ...a, ...p } : a) }))
  const inp = 'w-full px-2 py-1 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary'

  async function speichern() {
    setSaving(true); setErr('')
    const e = await onSpeichern(name, normalisiereKonfig(k), pw || undefined)
    setSaving(false)
    if (e) setErr(e)
  }

  return (
    <Rahmen titel="Chiron Backup bearbeiten" icon={Pencil} onClose={onClose} breit
      fuss={<>
        {fehler.length > 0 && <p className="text-[11px] text-red-500 flex-1">{fehler[0]}{fehler.length > 1 ? ` (+${fehler.length - 1} weitere)` : ''}</p>}
        {err && <p className="text-[11px] text-red-500 flex-1">{err}</p>}
        <button onClick={onClose} className="ml-auto px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Abbrechen</button>
        <button onClick={speichern} disabled={saving || fehler.length > 0 || !!pwFehler} className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          {saving && <Loader2 size={13} className="animate-spin" />}Speichern
        </button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-[11px] text-muted-foreground">Name der Kachel<input value={name} onChange={e => setName(e.target.value)} className={`${inp} mt-0.5`} /></label>
          <label className="text-[11px] text-muted-foreground">Basispfad auf dem Server (Freigabe)<input value={k.basePath} onChange={e => setK({ ...k, basePath: e.target.value })} className={`${inp} mt-0.5 font-mono`} /></label>
          <label className="text-[11px] text-muted-foreground">Name der Freigabe (wird geprüft)<input value={k.shareName} onChange={e => setK({ ...k, shareName: e.target.value })} className={`${inp} mt-0.5`} /></label>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-[11px] text-muted-foreground mb-0.5">Zeitslots (täglich)</p>
            <div className="flex items-center gap-1 flex-wrap">
              {k.slots.map(s => (
                <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-xs font-mono">{s}
                  <button onClick={() => setK({ ...k, slots: k.slots.filter(z => z !== s) })} className="text-muted-foreground hover:text-foreground"><X size={10} /></button></span>
              ))}
              <input type="time" value={neueZeit} onChange={e => setNeueZeit(e.target.value)} className="px-1.5 py-0.5 text-xs rounded-md bg-background border border-border text-foreground" />
              <button onClick={() => { if (neueZeit && !k.slots.includes(neueZeit)) setK({ ...k, slots: [...k.slots, neueZeit].sort() }) }} className="p-1 rounded-md border border-border text-muted-foreground hover:bg-accent"><Plus size={11} /></button>
            </div>
          </div>
          <label className="text-[11px] text-muted-foreground w-36">Mindest-Speicher (GB)<input type="number" min={1} value={k.minFreeGB} onChange={e => setK({ ...k, minFreeGB: Number(e.target.value) })} className={`${inp} mt-0.5`} /></label>
          <label className="text-[11px] text-muted-foreground w-36">Warnung nach (Stunden)<input type="number" min={1} value={k.warnStunden} onChange={e => setK({ ...k, warnStunden: Number(e.target.value) })} className={`${inp} mt-0.5`} /></label>
          <label className="text-[11px] text-muted-foreground w-36">Benutzer auf den Anlagen<input value={k.benutzer} onChange={e => setK({ ...k, benutzer: e.target.value })} className={`${inp} mt-0.5`} /></label>
        </div>

        <div>
          <p className="text-xs font-semibold text-foreground mb-1">Anlagen</p>
          <div className="rounded-md border border-border overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground"><tr className="text-left">
                <th className="px-2 py-1">aktiv</th><th className="px-2 py-1">Anlage</th><th className="px-2 py-1">Hostname</th><th className="px-2 py-1">IP</th><th className="px-2 py-1">Freigabe</th><th className="px-2 py-1">Quellordner</th><th className="px-2 py-1">Zielordner</th><th className="px-2 py-1">Zusatzordner</th><th />
              </tr></thead>
              <tbody>
                {k.anlagen.map((a, i) => (
                  <tr key={i} className="border-t border-border align-top">
                    <td className="px-2 py-1"><input type="checkbox" checked={a.aktiv} onChange={e => setA(i, { aktiv: e.target.checked })} className="accent-primary mt-1" /></td>
                    <td className="px-1 py-1 w-20"><input value={a.id} onChange={e => setA(i, { id: e.target.value, name: e.target.value })} className={inp} /></td>
                    <td className="px-1 py-1 w-28"><input value={a.hostname} onChange={e => setA(i, { hostname: e.target.value })} className={inp} /></td>
                    <td className="px-1 py-1 w-32"><input value={a.ip} onChange={e => setA(i, { ip: e.target.value })} placeholder="10.170.x.x" className={`${inp} font-mono`} /></td>
                    <td className="px-1 py-1 w-20"><input value={a.freigabe} onChange={e => setA(i, { freigabe: e.target.value })} className={inp} /></td>
                    <td className="px-1 py-1 w-28"><input value={a.quellordner} onChange={e => setA(i, { quellordner: e.target.value })} className={inp} /></td>
                    <td className="px-1 py-1 w-28"><input value={a.zielordner} onChange={e => setA(i, { zielordner: e.target.value })} className={`${inp} font-mono`} /></td>
                    <td className="px-1 py-1">
                      <div className="flex flex-wrap gap-1">
                        {a.zusatzordner.map((z, j) => (
                          <label key={j} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${z.aktiv ? 'border-primary/50 text-foreground' : 'border-border text-muted-foreground'}`}>
                            <input type="checkbox" checked={z.aktiv} onChange={e => setA(i, { zusatzordner: a.zusatzordner.map((y, n) => n === j ? { ...y, aktiv: e.target.checked } : y) })} className="accent-primary" />{z.quellordner}
                          </label>
                        ))}
                        <button onClick={() => { const n = window.prompt('Weiterer Ordner auf der Freigabe (z. B. Videos):'); if (n && n.trim()) setA(i, { zusatzordner: [...a.zusatzordner, { quellordner: n.trim(), aktiv: false }] }) }} className="px-1 rounded border border-border text-muted-foreground hover:bg-accent"><Plus size={10} /></button>
                      </div>
                    </td>
                    <td className="px-1 py-1"><button onClick={() => setK({ ...k, anlagen: k.anlagen.filter((_, j) => j !== i) })} title="Anlage entfernen (kopierte Daten bleiben)" className="p-1 text-muted-foreground hover:text-red-500"><Trash2 size={11} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => setK({ ...k, anlagen: [...k.anlagen, { id: '', name: '', hostname: '', ip: '', freigabe: 'Daten', quellordner: 'dataline_am', zielordner: '', aktiv: false, zusatzordner: [] }] })} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md border border-border text-muted-foreground hover:bg-accent"><Plus size={11} />Anlage</button>
            <p className="text-[10px] text-muted-foreground">Quelle = \\IP\Freigabe\Quellordner → {k.basePath}\{k.targetRoot}\Zielordner · Zusatzordner landen in Zielordner\&lt;Name&gt;. Es wird nie gelöscht.</p>
          </div>
        </div>

        <div className="rounded-md border border-border p-3">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><KeyRound size={13} className="text-amber-500" />Passwort für {k.benutzer}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Wird hier verschlüsselt (Schlüssel des Servers) und auf {job.chiron?.server} per DPAPI abgelegt — nie im Klartext gespeichert oder protokolliert. Leer lassen = unverändert.
            {stand?.status?.passwort ? ` Zurzeit hinterlegt seit ${fmt(stand.status.passwort.gesetztAm)} (${stand.status.passwort.von}).` : ' Zurzeit keins hinterlegt.'}</p>
          <div className="flex gap-2 mt-1.5">
            <input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} placeholder="neues Passwort" className={`${inp} max-w-56`} />
            <input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="wiederholen" className={`${inp} max-w-56`} />
          </div>
          {pwFehler && <p className="text-[10px] text-red-500 mt-1">{pwFehler}</p>}
          {pw && !stand?.schluessel && <p className="text-[10px] text-amber-500 mt-1">Der Server ist noch nicht eingerichtet — beim Speichern wird eingerichtet und das Passwort danach übermittelt.</p>}
        </div>
      </div>
    </Rahmen>
  )
}

// ── Vergleich Test ↔ Produktiv ────────────────────────────────────────────────
interface VergleichZeile { id: string; aktiv: boolean; testPfad: string; prodPfad: string; testDa: boolean; prodDa: boolean; nurTest: number; nurProd: number; unterschiedlich: number; gleich: number; listeNurTest: string[] | string; listeNurProd: string[] | string; listeUnterschied: { p: string; testGroesse: number; prodGroesse: number; testZeit: string; prodZeit: string }[] | { p: string; testGroesse: number; prodGroesse: number; testZeit: string; prodZeit: string }; fehler?: string }
const arr = <T,>(v: T[] | T | undefined | null): T[] => Array.isArray(v) ? v : v == null ? [] : [v]

function useAuftrag<T>(host: string, art: 'vergleich' | 'groesse', x: { von: string; rechner: string }) {
  const [daten, setDaten] = useState<T | null>(null)
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(true)
  const [seit] = useState(Date.now())
  useEffect(() => {
    let alive = true
    ;(async () => {
      const r = await starteAuftrag(host, art, x)
      void protokolliere(host, x.von, art === 'vergleich' ? 'vergleich' : 'speicherplatz-pruefen')
      if (!r.ok || !r.daten) { if (alive) { setFehler(r.fehler || 'Auftrag fehlgeschlagen'); setLaeuft(false) }; return }
      const e = await warteAufAuftrag<T>(host, r.daten.id, art === 'vergleich' ? 30 * 60_000 : 20 * 60_000)
      if (!alive) return
      setLaeuft(false)
      if (e.ok && e.daten) setDaten(e.daten); else setFehler(e.fehler || 'Kein Ergebnis')
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { daten, fehler, laeuft, seit }
}

function Warten({ text, seit }: { text: string; seit: number }) {
  const [, setT] = useState(0)
  useEffect(() => { const i = setInterval(() => setT(v => v + 1), 1000); return () => clearInterval(i) }, [])
  return <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{text} ({Math.round((Date.now() - seit) / 1000)} s) — läuft als Aufgabe auf dem Server.</p>
}

function VergleichDialog({ host, x, onClose, onProduktiv }: { host: string; x: { von: string; rechner: string }; onClose: () => void; onProduktiv?: () => void }) {
  const { daten, fehler, laeuft, seit } = useAuftrag<VergleichZeile[] | VergleichZeile>(host, 'vergleich', x)
  const zeilen = arr(daten)
  return (
    <Rahmen titel="Vergleich Test ↔ Produktiv (nur lesend)" icon={Scale} onClose={onClose} breit
      fuss={<><p className="text-[10px] text-muted-foreground flex-1">Es wird nichts verändert. „Nur im Test" kommt nach dem Umschalten beim ersten produktiven Lauf ohnehin in den Produktivordner (sofern noch auf der Anlage vorhanden); „nur Produktiv" bleibt unberührt.</p>
        {onProduktiv && <button onClick={onProduktiv} disabled={laeuft} className="px-3 py-1.5 text-xs rounded-md border border-orange-500/50 text-orange-500 hover:bg-orange-500/10 disabled:opacity-40">Produktiv schalten…</button>}
        <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Schließen</button></>}>
      {laeuft && <Warten text={`Vergleiche die Ordner auf ${host}`} seit={seit} />}
      {fehler && <p className="text-xs text-red-500">{fehler}</p>}
      <div className="space-y-3">
        {zeilen.map(z => <VergleichBlock key={z.id} z={z} />)}
      </div>
    </Rahmen>
  )
}

function VergleichBlock({ z }: { z: VergleichZeile }) {
  const [auf, setAuf] = useState<'' | 'test' | 'prod' | 'diff'>('')
  const lt = arr(z.listeNurTest), lp = arr(z.listeNurProd), lu = arr(z.listeUnterschied)
  const zahl = (n: number, k: 'test' | 'prod' | 'diff', farbe: string, text: string) => (
    <button onClick={() => setAuf(auf === k ? '' : k)} disabled={!n} className={`px-2 py-1 rounded-md border border-border text-left disabled:opacity-60 ${auf === k ? 'bg-accent' : 'hover:bg-accent/50'}`}>
      <span className={`text-sm font-semibold ${farbe}`}>{n.toLocaleString('de-DE')}</span> <span className="text-[11px] text-muted-foreground">{text}</span>
    </button>
  )
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-xs font-semibold text-foreground">{z.id}{!z.aktiv && <span className="text-muted-foreground font-normal"> (deaktiviert)</span>}</p>
      {z.fehler ? <p className="text-[11px] text-red-500">{umlaute(z.fehler)}</p> : (<>
        <p className="text-[10px] text-muted-foreground font-mono break-all">{z.testPfad}{!z.testDa && ' (fehlt)'} ↔ {z.prodPfad}{!z.prodDa && ' (fehlt)'}</p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {zahl(z.nurTest, 'test', 'text-blue-500', 'nur im Test')}
          {zahl(z.nurProd, 'prod', 'text-emerald-500', 'nur im Produktivordner')}
          {zahl(z.unterschiedlich, 'diff', 'text-amber-500', 'gleicher Name, andere Größe/Datum')}
          <span className="px-2 py-1 text-[11px] text-muted-foreground">{z.gleich.toLocaleString('de-DE')} gleich</span>
        </div>
        {auf && (
          <div className="mt-1 max-h-56 overflow-y-auto rounded border border-border bg-background/60 p-1 text-[10px] font-mono">
            {auf === 'test' && lt.map(p => <p key={p} className="break-all">{p}</p>)}
            {auf === 'prod' && lp.map(p => <p key={p} className="break-all">{p}</p>)}
            {auf === 'diff' && lu.map(d => <p key={d.p} className="break-all">{d.p} <span className="text-muted-foreground">Test {fmtBytes(d.testGroesse)} / {fmt(d.testZeit)} · Produktiv {fmtBytes(d.prodGroesse)} / {fmt(d.prodZeit)}</span></p>)}
            {((auf === 'test' && z.nurTest > lt.length) || (auf === 'prod' && z.nurProd > lp.length) || (auf === 'diff' && z.unterschiedlich > lu.length)) && <p className="text-muted-foreground">… gekürzt (erste 200)</p>}
          </div>
        )}
      </>)}
    </div>
  )
}

// ── Speicherplatz ─────────────────────────────────────────────────────────────
interface GroesseErgebnis { anlagen: { id: string; erreichbar: boolean; gesamtBytes: number; zuKopierenBytes: number; dateien: number; zuKopierenDateien: number; fehler?: ChironFehler | null }[] | { id: string; erreichbar: boolean; gesamtBytes: number; zuKopierenBytes: number; dateien: number; zuKopierenDateien: number; fehler?: ChironFehler | null }; freiBytes: number; minFreeBytes: number; zuKopierenBytes: number; reicht: boolean }
function GroesseDialog({ host, x, onClose }: { host: string; x: { von: string; rechner: string }; onClose: () => void }) {
  const { daten, fehler, laeuft, seit } = useAuftrag<GroesseErgebnis>(host, 'groesse', x)
  return (
    <Rahmen titel="Speicherplatz prüfen" icon={HardDrive} onClose={onClose}
      fuss={<button onClick={onClose} className="ml-auto px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Schließen</button>}>
      {laeuft && <Warten text="Ermittle die Größe der Quellordner (robocopy /L)" seit={seit} />}
      {fehler && <p className="text-xs text-red-500">{fehler}</p>}
      {daten && (
        <div className="space-y-2 text-xs">
          {arr(daten.anlagen).map(a => (
            <div key={a.id} className="flex items-start gap-2">
              <span className="font-semibold w-16">{a.id}</span>
              {a.fehler ? <span className="text-amber-500">{umlaute(a.fehler.text)}</span>
                : <span className="text-foreground">{fmtBytes(a.gesamtBytes)} auf der Anlage ({a.dateien.toLocaleString('de-DE')} Dateien) · davon neu zu kopieren <strong>{fmtBytes(a.zuKopierenBytes)}</strong> ({a.zuKopierenDateien.toLocaleString('de-DE')})</span>}
            </div>
          ))}
          <div className={`mt-2 rounded-md border px-2 py-1.5 ${daten.reicht ? 'border-emerald-500/40 text-emerald-500' : 'border-red-500/40 text-red-500'}`}>
            {daten.reicht ? <CheckCircle2 size={13} className="inline mr-1" /> : <AlertTriangle size={13} className="inline mr-1" />}
            Zu kopieren {fmtBytes(daten.zuKopierenBytes)} · frei {fmtBytes(daten.freiBytes)} · Minimum {fmtBytes(daten.minFreeBytes)} — {daten.reicht ? 'der Platz reicht.' : 'der Platz reicht NICHT. Der Sync startet in diesem Zustand nicht.'}
          </div>
        </div>
      )}
    </Rahmen>
  )
}

// ── Produktiv schalten ────────────────────────────────────────────────────────
function ProduktivDialog({ istProd, host, konfig, onClose, onVergleich, onBestaetigt }: {
  istProd: boolean; host: string; konfig: ChironKonfig; onClose: () => void; onVergleich: () => void; onBestaetigt: () => Promise<string | null>
}) {
  const [ok, setOk] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [err, setErr] = useState('')
  const ziel = `${konfig.basePath}\\${istProd ? ROOT_TEST : ROOT_PROD}`
  return (
    <Rahmen titel={istProd ? 'Zurück auf TEST schalten' : 'Produktiv schalten'} icon={ShieldAlert} onClose={onClose}
      fuss={<>
        {err && <p className="text-[11px] text-red-500 flex-1">{err}</p>}
        <button onClick={onClose} className="ml-auto px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Abbrechen</button>
        <button onClick={async () => { setLaeuft(true); setErr(''); const e = await onBestaetigt(); setLaeuft(false); if (e) setErr(e) }} disabled={!ok || laeuft}
          className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold text-white disabled:opacity-40 ${istProd ? 'bg-orange-500 hover:bg-orange-600' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
          {laeuft && <Loader2 size={13} className="animate-spin" />}{istProd ? 'Auf TEST schalten' : 'PRODUKTIV schalten'}
        </button>
      </>}>
      <div className="space-y-2 text-xs text-foreground">
        {istProd ? (
          <p>Ab dem nächsten Lauf schreibt {host} wieder nur nach <span className="font-mono">{ziel}</span>. Der Produktivordner wird dann weder gelesen noch beschrieben.</p>
        ) : (<>
          <p>Ab dem nächsten Lauf schreibt {host} nach <span className="font-mono font-semibold">{ziel}\&lt;Zielordner&gt;</span>.</p>
          <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
            <li>Es wird nur kopiert — im Produktivordner wird <strong>nie</strong> etwas gelöscht.</li>
            <li>Dateien, die dort <strong>neuer</strong> sind als auf der Anlage, bleiben unverändert (/XO).</li>
            <li>Vor dem ersten produktiven Lauf je Anlage wird der Speicherbedarf geprüft; reicht der Platz nicht, startet er nicht.</li>
            <li>Der Testordner bleibt erhalten.</li>
          </ul>
          <button onClick={onVergleich} className="text-primary hover:underline text-[11px]">Vorher den Vergleich Test ↔ Produktiv ansehen</button>
        </>)}
        <label className="flex items-center gap-2 mt-2 cursor-pointer"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} className="accent-primary" />
          {istProd ? 'Ja, zurück auf TEST.' : 'Ich habe den Vergleich geprüft und will produktiv schalten.'}</label>
      </div>
    </Rahmen>
  )
}

// ── Log ───────────────────────────────────────────────────────────────────────
function LogDialog({ host, konfig, onClose }: { host: string; konfig: ChironKonfig; onClose: () => void }) {
  const [daten, setDaten] = useState<{ verlauf: ChironVerlauf[]; aktionen: ChironAktion[]; tool: ChironAktion[] } | null>(null)
  const [fehler, setFehler] = useState('')
  const [anlage, setAnlage] = useState('')
  const [nurFehler, setNurFehler] = useState(false)
  const [reiter, setReiter] = useState<'laeufe' | 'aktionen'>('laeufe')
  const [logFehler, setLogFehler] = useState('')
  useEffect(() => {
    void Promise.all([liesVerlauf(host, 500), liesToolAktionen(host)]).then(([v, t]) => {
      if (!v.ok) setFehler(v.fehler || 'Log nicht lesbar')
      setDaten({ verlauf: v.verlauf, aktionen: v.aktionen, tool: t })
    })
  }, [host])
  const liste = (daten?.verlauf ?? []).filter(v => (!anlage || v.anlage === anlage) && (!nurFehler || v.ergebnis !== 'ok'))
  const aktionen = [...(daten?.aktionen ?? []), ...(daten?.tool ?? [])].sort((a, b) => b.am.localeCompare(a.am))
  return (
    <Rahmen titel={`Log — ${host}`} icon={History} onClose={onClose} breit
      fuss={<>{logFehler && <p className="text-[10px] text-amber-500 flex-1 break-all">{logFehler}</p>}<button onClick={onClose} className="ml-auto px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Schließen</button></>}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button onClick={() => setReiter('laeufe')} className={`px-2 py-1 text-[11px] rounded-md border ${reiter === 'laeufe' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}`}>Läufe</button>
        <button onClick={() => setReiter('aktionen')} className={`px-2 py-1 text-[11px] rounded-md border ${reiter === 'aktionen' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}`}>Aktionen (wer hat was gemacht)</button>
        {reiter === 'laeufe' && (<>
          <select value={anlage} onChange={e => setAnlage(e.target.value)} className="ml-2 text-[11px] rounded-md bg-background border border-border px-1.5 py-1 text-foreground">
            <option value="">alle Anlagen</option>{konfig.anlagen.map(a => <option key={a.id} value={a.id}>{a.id}</option>)}
          </select>
          <label className="text-[11px] text-muted-foreground flex items-center gap-1"><input type="checkbox" checked={nurFehler} onChange={e => setNurFehler(e.target.checked)} className="accent-primary" />nur Fehler/nicht erreichbar</label>
        </>)}
      </div>
      {!daten && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 size={12} className="animate-spin" />Lade…</p>}
      {fehler && <p className="text-xs text-red-500">{fehler}</p>}
      {daten && reiter === 'laeufe' && (
        <table className="w-full text-[11px]">
          <thead className="text-muted-foreground text-left"><tr><th className="py-1">Start</th><th>Anlage</th><th>Ergebnis</th><th>Kopiert</th><th>Dauer</th><th>rc</th><th>Auslöser</th><th /></tr></thead>
          <tbody>
            {liste.map((v, i) => (
              <tr key={i} className="border-t border-border align-top">
                <td className="py-1 pr-2 whitespace-nowrap">{fmt(v.start)}</td>
                <td className="pr-2">{v.anlage}</td>
                <td className="pr-2">
                  <span className={v.ergebnis === 'ok' ? 'text-emerald-500' : v.ergebnis === 'nicht_erreichbar' ? 'text-amber-500' : 'text-red-500'}>
                    {v.ergebnis === 'ok' ? 'OK' : v.ergebnis === 'nicht_erreichbar' ? 'nicht erreichbar' : 'Fehler'}{v.dryRun ? ' (Probelauf)' : ''}{v.ziel === ROOT_TEST ? ' · Test' : ''}
                  </span>
                  {v.fehler && <p className="text-muted-foreground">{umlaute(v.fehler)}</p>}
                </td>
                <td className="pr-2 whitespace-nowrap">{(v.kopiert ?? 0).toLocaleString('de-DE')} · {fmtBytes(v.bytes ?? 0)}</td>
                <td className="pr-2">{fmtDauer(v.dauerSek)}</td>
                <td className="pr-2">{v.rc ?? '—'}</td>
                <td className="pr-2 text-muted-foreground">{v.ausloeser?.replace('manuell:', '') || ''}</td>
                <td>{v.log && <button onClick={async () => setLogFehler(await oeffne(host, v.log))} className="text-primary hover:underline inline-flex items-center gap-0.5"><FileText size={10} />Log</button>}</td>
              </tr>
            ))}
            {!liste.length && <tr><td colSpan={8} className="py-3 text-muted-foreground">Keine Einträge.</td></tr>}
          </tbody>
        </table>
      )}
      {daten && reiter === 'aktionen' && (
        <div className="divide-y divide-border">
          {aktionen.map((a, i) => (
            <div key={i} className="py-1 text-[11px] flex gap-2">
              <span className="text-muted-foreground w-28 shrink-0">{fmt(a.am)}</span>
              <span className="w-28 shrink-0">{a.von || '—'}</span>
              <span className="font-medium">{a.aktion}</span>
              <span className="text-muted-foreground truncate" title={a.details ? JSON.stringify(a.details) : ''}>{a.details ? JSON.stringify(a.details) : ''}</span>
              <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{a.quelle === 'Skript' ? 'Server' : 'Tool'}{a.rechner ? ` · ${a.rechner}` : ''}</span>
            </div>
          ))}
          {!aktionen.length && <p className="py-3 text-muted-foreground text-[11px]">Keine Einträge.</p>}
        </div>
      )}
    </Rahmen>
  )
}

// ── Löschen ───────────────────────────────────────────────────────────────────
function LoeschenDialog({ name, host, eingerichtet, onClose, onLoeschen }: { name: string; host: string; eingerichtet: boolean; onClose: () => void; onLoeschen: (vomServer: boolean) => Promise<string | null> }) {
  const [vomServer, setVomServer] = useState(eingerichtet)
  const [laeuft, setLaeuft] = useState(false)
  const [err, setErr] = useState('')
  return (
    <Rahmen titel={`„${name}" löschen?`} icon={Trash2} onClose={onClose}
      fuss={<>
        {err && <p className="text-[11px] text-red-500 flex-1">{err}</p>}
        <button onClick={onClose} className="ml-auto px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Abbrechen</button>
        <button onClick={async () => { setLaeuft(true); setErr(''); const e = await onLoeschen(vomServer); setLaeuft(false); if (e) setErr(e) }} disabled={laeuft} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-50">
          {laeuft && <Loader2 size={12} className="animate-spin" />}Löschen
        </button>
      </>}>
      <div className="space-y-2 text-xs text-foreground">
        <p>Die Kachel wird aus dem Tool entfernt.</p>
        <p className="text-emerald-500 flex items-start gap-1"><CheckCircle2 size={13} className="mt-0.5 shrink-0" />Die kopierten Daten auf {host} (D:\Chiron\…) bleiben in jedem Fall erhalten.</p>
        {eingerichtet && (
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={vomServer} onChange={e => setVomServer(e.target.checked)} className="accent-primary mt-0.5" />
            <span>Auch die geplante Aufgabe <span className="font-mono">\SKF\AMCubeSync</span> und das Skript samt Konfiguration, Status, Logs und hinterlegtem Passwort auf {host} entfernen (C:\ProgramData\AMCubeSync).
              {!vomServer && <span className="block text-amber-500 mt-0.5">Ohne Haken läuft der Sync auf dem Server weiter.</span>}</span>
          </label>
        )}
      </div>
    </Rahmen>
  )
}
