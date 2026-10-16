// ── „Sound Fix“ — die drei Schritte bei Ton-Problemen ────────────────────────
// Wird an zwei Stellen gerendert: eingebettet in Daylis (Benutzerübersicht und
// Geräte-Dossier) und als eigenständiges Fenster (#soundfix, SoundFixWindow).
// Die drei Teile sind voneinander unabhängig und in beliebiger Reihenfolge
// ausführbar — deshalb hat jeder seinen eigenen Zustand und seinen eigenen Knopf.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Headphones,
  Loader2, Mic, Play, RotateCw, Search, Speaker, Square, Volume2, VolumeX, Wrench, Zap,
} from 'lucide-react'
import { api } from '../../electronAPI'
import { scanOneHost, type DriverItem, type HpHostReport } from '../../services/hpDrivers'
import { useHpDeployStore } from '../../store/hpDeployStore'
import {
  istSoundTreiber, istVorausgewaehlt, merkeTreiberSuche, holeTreiberSuche,
  listeSoundDienste, steuereDienst, type SoundService, type DienstAktion,
  listeAudioGeraete, schalteAudioGeraet, setzeAudioPegel, setzeAudioStumm, type AudioGeraet,
} from '../../services/soundFix'
import JabraPanel from '../softwareInstallations/JabraPanel'
import { useJabraInstallStore } from '../../store/jabraInstallStore'

// ── Gemeinsame Bausteine ─────────────────────────────────────────────────────

function Abschnitt({ nr, titel, untertitel, icon, offen, onToggle, fertig, children }: {
  nr: number; titel: string; untertitel: string; icon: React.ReactNode
  offen: boolean; onToggle: () => void; fertig?: boolean; children: React.ReactNode
}) {
  return (
    <div className={`rounded-lg border ${offen ? 'border-border' : 'border-border/60'} bg-card overflow-hidden`}>
      <button onClick={onToggle} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent/20">
        <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
          fertig ? 'bg-emerald-500/20 text-emerald-300' : 'bg-muted text-muted-foreground'
        }`}>{fertig ? <Check size={13} /> : nr}</span>
        {icon}
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-foreground">{titel}</span>
          <span className="block text-[11px] text-muted-foreground truncate">{untertitel}</span>
        </span>
        {offen ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
      </button>
      {/* Immer gerendert, nur ausgeblendet: ein laufender Schritt (z. B. die
          Treiberinstallation) darf beim Zuklappen weder abbrechen noch seine
          Ergebnisliste verlieren. */}
      <div className={offen ? 'px-3 pb-3 pt-1 border-t border-border/50' : 'hidden'}>{children}</div>
    </div>
  )
}

function Meldung({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className={`flex items-start gap-2 px-2.5 py-2 rounded-md text-[11px] border ${
      ok ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-red-500/30 bg-red-500/5 text-red-300'
    }`}>
      {ok ? <CheckCircle2 size={13} className="shrink-0 mt-px" /> : <AlertTriangle size={13} className="shrink-0 mt-px" />}
      <span className="whitespace-pre-wrap break-words">{text}</span>
    </div>
  )
}

function mmss(s: number): string {
  const m = Math.floor(s / 60), r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

// ══ Teil 1: Sound-Treiber ════════════════════════════════════════════════════

function TreiberTeil({ host, onFertig }: { host: string; onFertig: (b: boolean) => void }) {
  const [sucht, setSucht] = useState(false)
  const [sekunden, setSekunden] = useState(0)
  // Ein vorheriges Suchergebnis dieser Sitzung wiederherstellen — die Suche dauert
  // bis zu fünf Minuten und darf durch ein geschlossenes Fenster nicht verfallen.
  const [bericht, setBericht] = useState<HpHostReport | null>(() => holeTreiberSuche(host)?.bericht ?? null)
  const [fehler, setFehler] = useState('')
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(() => new Set(holeTreiberSuche(host)?.gewaehlt ?? []))

  const hostKey = host.toLowerCase()
  // Eng gefasste Selektoren: so zeichnet der Abschnitt nur neu, wenn sich etwas an
  // DIESEM Host ändert — nicht bei jeder Statusmeldung irgendeines anderen PCs.
  const aktiv = useHpDeployStore(s => s.activeHosts.includes(hostKey))
  const wartet = useHpDeployStore(s => s.queuedHosts.includes(hostKey))
  const phase = useHpDeployStore(s => s.phaseByHost[hostKey])
  const ergebnis = useHpDeployStore(s => s.results[hostKey])
  const laeuft = aktiv || wartet

  // Laufzeitanzeige — der Bediener soll sehen, dass noch etwas passiert.
  useEffect(() => {
    if (!sucht && !laeuft) return
    const t = setInterval(() => setSekunden(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [sucht, laeuft])

  const soundItems = useMemo(() => (bericht?.items ?? []).filter(istSoundTreiber), [bericht])
  const offene = soundItems.filter(it => it.status === 'veraltet' || it.status === 'verfuegbar')

  async function suchen() {
    if (sucht || laeuft) return
    setSucht(true); setSekunden(0); setFehler(''); setBericht(null); setGewaehlt(new Set())
    try {
      const rep = await scanOneHost(host)
      setBericht(rep)
      if (rep.error) setFehler(rep.error)
      else if (!rep.online) setFehler(`${host} ist nicht erreichbar.`)
      const vor = new Set(rep.items.filter(it => istSoundTreiber(it) && istVorausgewaehlt(it)).map(it => it.softpaqId))
      setGewaehlt(vor)
      merkeTreiberSuche(host, rep, [...vor])
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    } finally { setSucht(false) }
  }

  async function aktualisieren() {
    const items = soundItems.filter(it => gewaehlt.has(it.softpaqId))
    if (!items.length || laeuft) return
    setSekunden(0)
    await useHpDeployStore.getState().run([{ host, items }], { rebootMode: 'notify', by: 'Sound Fix' })
  }

  // Nach erfolgreicher Installation gilt der Schritt als erledigt.
  useEffect(() => { onFertig(Boolean(ergebnis && ergebnis.status !== 'fehler')) }, [ergebnis, onFertig])

  return (
    <div className="space-y-2.5 pt-2">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Sucht wie der Menüpunkt „Treiber-Installation“ nach Treibern von HP — hier eingegrenzt auf alles, was mit Ton zu tun hat
        (Audio-Chip, Realtek/Conexant, Audio-Zusatzsoftware wie Waves oder DTS).
        <b className="text-amber-300"> Die Suche und erst recht die Installation können bis zu 5 Minuten dauern.</b>{' '}
        Bitte dieses Fenster so lange offen lassen — am Ende erscheint hier eine Bestätigung.
      </p>

      <div className="flex items-center gap-2">
        <button onClick={suchen} disabled={sucht || laeuft}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          {sucht ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          {sucht ? 'Suche läuft …' : bericht ? 'Erneut suchen' : 'Nach Sound-Treibern suchen'}
        </button>
        {(sucht || laeuft) && <span className="text-[11px] text-muted-foreground tabular-nums">läuft seit {mmss(sekunden)}</span>}
      </div>

      {fehler && <Meldung ok={false} text={fehler} />}

      {bericht && !fehler && (
        <>
          <p className="text-[11px] text-muted-foreground">
            {bericht.model || 'Modell unbekannt'} · {soundItems.length} sound-relevante{soundItems.length === 1 ? 'r' : ''} Treiber gefunden,
            davon <b className={offene.length ? 'text-red-300' : 'text-emerald-300'}>{offene.length} offen</b>.
          </p>
          {soundItems.length === 0 && (
            <Meldung ok text="HP führt für dieses Modell keine Sound-Treiber. Weiter mit Schritt 2 (Dienste) oder 3 (Geräte)." />
          )}
          {offene.length === 0 && soundItems.length > 0 && (
            <Meldung ok text="Alle Sound-Treiber sind auf dem aktuellen Stand — die Ursache liegt woanders. Weiter mit Schritt 2 oder 3." />
          )}
        </>
      )}

      {soundItems.length > 0 && (
        <div className="rounded-md border border-border divide-y divide-border/60 max-h-72 overflow-y-auto">
          {soundItems.map(it => (
            <TreiberZeile key={it.softpaqId} it={it}
              gewaehlt={gewaehlt.has(it.softpaqId)}
              disabled={laeuft}
              onToggle={() => setGewaehlt(g => {
                const n = new Set(g); if (n.has(it.softpaqId)) n.delete(it.softpaqId); else n.add(it.softpaqId)
                if (bericht) merkeTreiberSuche(host, bericht, [...n])
                return n
              })} />
          ))}
        </div>
      )}

      {soundItems.length > 0 && (
        <div className="flex items-center gap-2">
          <button onClick={aktualisieren} disabled={laeuft || gewaehlt.size === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-40">
            {laeuft ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            {laeuft ? 'Installation läuft …' : `Ausgewählte aktualisieren (${gewaehlt.size})`}
          </button>
          {wartet && <span className="text-[11px] text-muted-foreground">wartet auf einen freien Platz …</span>}
          {aktiv && phase && <span className="text-[11px] text-blue-300">{phase}</span>}
        </div>
      )}

      {ergebnis && (
        <div className="space-y-1.5">
          <Meldung ok={ergebnis.status !== 'fehler'} text={`${ergebnis.message}${ergebnis.needsReboot ? ' — Der PC muss noch neu gestartet werden, damit der Treiber greift.' : ''}`} />
          {ergebnis.ergebnisse?.length > 0 && (
            <div className="rounded-md border border-border divide-y divide-border/60 text-[11px]">
              {ergebnis.ergebnisse.map((e, i) => (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5">
                  {e.verifiziert ? <Check size={12} className="text-emerald-400 shrink-0" /> : <AlertTriangle size={12} className="text-amber-400 shrink-0" />}
                  <span className="flex-1 min-w-0 truncate text-foreground" title={e.name}>{e.name}</span>
                  <span className="font-mono text-muted-foreground shrink-0">{e.vorher || '—'} → {e.nachher || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TreiberZeile({ it, gewaehlt, disabled, onToggle }: { it: DriverItem; gewaehlt: boolean; disabled: boolean; onToggle: () => void }) {
  const stil =
    it.status === 'veraltet' ? 'bg-red-500/15 text-red-300 border-red-500/40'
    : it.status === 'verfuegbar' ? 'bg-blue-500/15 text-blue-300 border-blue-500/40'
    : it.status === 'aktuell' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
    : 'bg-muted/40 text-muted-foreground border-border'
  const label = it.status === 'verfuegbar' ? 'verfügbar' : it.status
  return (
    <label className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] ${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-accent/20'}`}>
      <input type="checkbox" checked={gewaehlt} disabled={disabled} onChange={onToggle} className="accent-primary shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-foreground truncate" title={it.name}>{it.name}</span>
        <span className="block text-muted-foreground truncate">
          {it.category}
          {it.matchUnsicher && <span className="text-amber-400"> · Zuordnung unsicher</span>}
          {!it.anwendbar && !it.ohneHardwareBezug && <span className="text-muted-foreground/70"> · passt evtl. nicht zu dieser Hardware</span>}
        </span>
      </span>
      <span className="font-mono text-muted-foreground shrink-0">{it.installedVersion || '—'} → {it.latestVersion}</span>
      <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] ${stil}`} title={it.matchGrund || undefined}>{label}</span>
    </label>
  )
}

// ══ Teil 2: Sound-Dienste ════════════════════════════════════════════════════

function DiensteTeil({ host, onFertig }: { host: string; onFertig: (b: boolean) => void }) {
  const [laedt, setLaedt] = useState(false)
  const [dienste, setDienste] = useState<SoundService[] | null>(null)
  const [fehler, setFehler] = useState('')
  const [busy, setBusy] = useState('')
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)

  async function laden() {
    if (laedt) return
    setLaedt(true); setFehler(''); setMeldung(null)
    const r = await listeSoundDienste(host)
    if (r.ok) { setDienste(r.dienste); onFertig(true) } else { setFehler(r.fehler || 'Dienste konnten nicht gelesen werden'); setDienste(null) }
    setLaedt(false)
  }

  async function aktion(name: string, a: DienstAktion) {
    if (busy) return
    setBusy(`${name}:${a}`); setMeldung(null)
    const r = await steuereDienst(host, name, a)
    setMeldung({ ok: r.ok, text: r.text })
    // Nur die eine Zeile auffrischen. Vorher wurde die ganze Dienstliste neu über
    // WinRM gelesen — das hat jeden Klick um einen weiteren Rundlauf verzögert.
    if (r.ok && r.state) {
      setDienste(ds => ds?.map(d => (d.name === name ? { ...d, state: r.state!, startMode: r.startMode || d.startMode } : d)) ?? ds)
    }
    setBusy('')
  }

  return (
    <div className="space-y-2.5 pt-2">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Zeigt alle Dienste des PCs, die mit Ton zu tun haben — den Audiodienst selbst, die Endpunkterkennung und die Zusatzdienste
        der Audio-Hersteller. Ein gestoppter oder auf „Deaktiviert“ gesetzter Audiodienst ist die häufigste Ursache, wenn gar kein Ton kommt.
      </p>

      <button onClick={laden} disabled={laedt}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
        {laedt ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
        {laedt ? 'Wird gelesen …' : dienste ? 'Aktualisieren' : 'Dienste anzeigen'}
      </button>

      {fehler && <Meldung ok={false} text={fehler} />}
      {meldung && <Meldung ok={meldung.ok} text={meldung.text} />}

      {dienste && dienste.length === 0 && <Meldung ok={false} text="Keine sound-bezogenen Dienste gefunden — das wäre sehr ungewöhnlich. Bitte WinRM/Rechte prüfen." />}

      {dienste && dienste.length > 0 && (
        <div className="rounded-md border border-border divide-y divide-border/60">
          {dienste.map(d => {
            const laeuftD = d.state.toLowerCase() === 'running'
            const deaktiviert = d.startMode.toLowerCase() === 'disabled'
            return (
              <div key={d.name} className="px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className={`shrink-0 w-2 h-2 rounded-full ${laeuftD ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[11px] truncate ${d.wichtig ? 'font-semibold text-foreground' : 'text-foreground'}`} title={d.displayName}>{d.displayName}</span>
                    <span className="block text-[10px] text-muted-foreground truncate font-mono">
                      {d.name} · {laeuftD ? 'läuft' : 'gestoppt'} · Starttyp: {deaktiviert ? <span className="text-red-300 font-sans font-semibold">Deaktiviert</span> : d.startMode}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    <DienstKnopf titel="Starten" icon={<Play size={11} />} disabled={!!busy || laeuftD} busy={busy === `${d.name}:start`} onClick={() => aktion(d.name, 'start')} />
                    <DienstKnopf titel="Stoppen" icon={<Square size={11} />} disabled={!!busy || !laeuftD} busy={busy === `${d.name}:stop`} onClick={() => aktion(d.name, 'stop')} />
                    <DienstKnopf titel="Neu starten" icon={<RotateCw size={11} />} disabled={!!busy} busy={busy === `${d.name}:restart`} onClick={() => aktion(d.name, 'restart')} />
                    {deaktiviert && (
                      <button onClick={() => aktion(d.name, 'auto')} disabled={!!busy}
                        title="Starttyp auf „Automatisch“ setzen — solange der Dienst deaktiviert ist, lässt er sich nicht starten"
                        className="px-1.5 py-1 text-[10px] rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-40">
                        {busy === `${d.name}:auto` ? <Loader2 size={11} className="animate-spin" /> : 'Automatisch'}
                      </button>
                    )}
                  </span>
                </div>
                {d.hinweis && <p className="mt-1 ml-4 text-[10px] text-muted-foreground leading-snug">{d.hinweis}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DienstKnopf({ titel, icon, disabled, busy, onClick }: { titel: string; icon: React.ReactNode; disabled: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} title={titel}
      className="p-1.5 rounded border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
      {busy ? <Loader2 size={11} className="animate-spin" /> : icon}
    </button>
  )
}

// ══ Teil 3: Audio-Geräte ═════════════════════════════════════════════════════

function GeraeteTeil({ host, onFertig }: { host: string; onFertig: (b: boolean) => void }) {
  const [laedt, setLaedt] = useState(false)
  const [geraete, setGeraete] = useState<AudioGeraet[] | null>(null)
  const [fehler, setFehler] = useState('')
  const [busy, setBusy] = useState('')
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)

  async function laden(still = false) {
    if (laedt) return
    setLaedt(true); if (!still) { setFehler(''); setMeldung(null) }
    const r = await listeAudioGeraete(host)
    if (r.ok) { setGeraete(r.geraete); onFertig(true) } else { setFehler(r.fehler || 'Audio-Geräte konnten nicht gelesen werden') }
    setLaedt(false)
  }

  /**
   * Eine Geräteaktion ausführen.
   *
   * `neuLaden` nur dort, wo sich die STRUKTUR ändert (aktivieren/deaktivieren — dabei
   * startet auch der Audiodienst neu). Für Pegel und Stummschaltung wird stattdessen
   * genau das eine Gerät im Zustand nachgezogen: das vollständige Neulesen enthält ein
   * `Add-Type` (C#-Übersetzung auf dem Ziel-PC) und kostete pro Klick mehrere Sekunden,
   * in denen die ganze Karte gesperrt war.
   */
  async function fuehreAus(
    schluessel: string,
    fn: () => Promise<{ ok: boolean; text: string }>,
    opts: { neuLaden?: boolean; uebernehmen?: (g: AudioGeraet) => AudioGeraet; guid?: string } = {},
  ) {
    if (busy) return
    setBusy(schluessel); setMeldung(null)
    const r = await fn()
    setMeldung(r)
    if (r.ok && opts.uebernehmen && opts.guid) {
      setGeraete(gs => gs?.map(g => (g.guid === opts.guid ? opts.uebernehmen!(g) : g)) ?? gs)
    }
    setBusy('')
    if (r.ok && opts.neuLaden) await laden(true)
  }

  // „Nicht vorhanden" sind Reste früherer Anschlüsse (gemessen: 22 Einträge, davon nur 4
  // aktiv). Windows blendet sie im Sound-Dialog standardmäßig aus — hier genauso, sonst
  // ist die Liste unbrauchbar.
  const [zeigeAlle, setZeigeAlle] = useState(false)
  const sichtbar = useMemo(
    () => (geraete ?? []).filter(g => zeigeAlle || g.zustand !== 'Nicht vorhanden'),
    [geraete, zeigeAlle])
  const versteckt = (geraete?.length ?? 0) - sichtbar.length

  const gruppen = useMemo(() => {
    const g: Record<string, AudioGeraet[]> = {}
    for (const d of sichtbar) (g[d.typ || 'Sonstige'] ||= []).push(d)
    return g
  }, [sichtbar])

  return (
    <div className="space-y-2.5 pt-2">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Alle Wiedergabe- und Aufnahmegeräte des PCs — auch die, die im Windows-Sound-Dialog deaktiviert sind und deshalb sonst nirgends auftauchen.
        Hier lassen sie sich aktivieren bzw. deaktivieren, der Pegel setzen und die Stummschaltung aufheben.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => laden()} disabled={laedt}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          {laedt ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
          {laedt ? 'Wird gelesen …' : geraete ? 'Aktualisieren' : 'Audio-Geräte anzeigen'}
        </button>
        {geraete && versteckt > 0 && !zeigeAlle && (
          <button onClick={() => setZeigeAlle(true)} className="text-[11px] text-muted-foreground hover:text-foreground underline">
            {versteckt} nicht angeschlossene Geräte einblenden
          </button>
        )}
        {geraete && zeigeAlle && (
          <button onClick={() => setZeigeAlle(false)} className="text-[11px] text-muted-foreground hover:text-foreground underline">
            nicht angeschlossene Geräte ausblenden
          </button>
        )}
      </div>

      {fehler && <Meldung ok={false} text={fehler} />}
      {meldung && <Meldung ok={meldung.ok} text={meldung.text} />}

      {geraete && Object.entries(gruppen).map(([typ, liste]) => (
        <div key={typ}>
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            {typ.toLowerCase().startsWith('aufn') ? <Mic size={11} /> : <Speaker size={11} />}{typ} ({liste.length})
          </p>
          <div className="rounded-md border border-border divide-y divide-border/60">
            {liste.map(g => (
              <GeraetZeile key={g.guid || `${typ}:${g.name}`} g={g} busy={busy}
                onSchalten={an => fuehreAus(`${g.guid}:sw`, () => schalteAudioGeraet(host, g, an), { neuLaden: true })}
                onPegel={p => fuehreAus(`${g.guid}:vol`, () => setzeAudioPegel(host, g, p), { guid: g.guid, uebernehmen: alt => ({ ...alt, pegel: p }) })}
                onStumm={s => fuehreAus(`${g.guid}:mute`, () => setzeAudioStumm(host, g, s), { guid: g.guid, uebernehmen: alt => ({ ...alt, stumm: s }) })} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function GeraetZeile({ g, busy, onSchalten, onPegel, onStumm }: {
  g: AudioGeraet; busy: string
  onSchalten: (an: boolean) => void; onPegel: (p: number) => void; onStumm: (s: boolean) => void
}) {
  const [pegel, setPegel] = useState(g.pegel ?? 0)
  // Nach dem Neuladen den tatsächlichen Pegel übernehmen (sonst springt der Regler zurück).
  const letzter = useRef(g.pegel)
  useEffect(() => { if (g.pegel !== letzter.current) { letzter.current = g.pegel; setPegel(g.pegel ?? 0) } }, [g.pegel])

  const aktiv = g.zustand === 'Aktiv'
  const zustandStil = aktiv ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
    : g.zustand === 'Deaktiviert' ? 'bg-red-500/15 text-red-300 border-red-500/40'
    : 'bg-muted/40 text-muted-foreground border-border'

  return (
    <div className="px-2.5 py-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] text-foreground truncate" title={g.name}>{g.name}</span>
          <span className="block text-[10px] text-muted-foreground">
            {g.schaltbar !== 'ja' && 'Schaltet nur über die Registry (Audiodienst startet dabei neu)'}
          </span>
        </span>
        {g.standard && <span className="shrink-0 px-1.5 py-0.5 rounded-full border border-blue-500/40 bg-blue-500/15 text-blue-300 text-[10px]">Standard</span>}
        <span className={`shrink-0 px-1.5 py-0.5 rounded-full border text-[10px] ${zustandStil}`}>{g.zustand}</span>
        <button onClick={() => onSchalten(!aktiv)} disabled={!!busy}
          title={aktiv ? 'Gerät deaktivieren' : 'Gerät aktivieren'}
          className={`shrink-0 px-2 py-1 text-[10px] rounded border font-semibold disabled:opacity-40 ${
            aktiv ? 'border-border text-muted-foreground hover:bg-accent' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
          }`}>
          {busy === `${g.guid}:sw` ? <Loader2 size={11} className="animate-spin" /> : aktiv ? 'Deaktivieren' : 'Aktivieren'}
        </button>
      </div>

      {aktiv && (
        <div className="flex items-center gap-2 pl-0.5">
          <button onClick={() => onStumm(!g.stumm)} disabled={!!busy}
            title={g.stumm ? 'Stummschaltung aufheben' : 'Stumm schalten'}
            className={`shrink-0 p-1.5 rounded border disabled:opacity-40 ${
              g.stumm ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-border text-muted-foreground hover:bg-accent'
            }`}>
            {busy === `${g.guid}:mute` ? <Loader2 size={11} className="animate-spin" /> : g.stumm ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
          <input type="range" min={0} max={100} value={pegel} disabled={!!busy}
            onChange={e => setPegel(Number(e.target.value))}
            className="flex-1 accent-primary h-1" />
          <span className="w-10 text-right text-[10px] text-muted-foreground tabular-nums">{pegel} %</span>
          <button onClick={() => onPegel(pegel)} disabled={!!busy || pegel === (g.pegel ?? -1)}
            className="shrink-0 px-2 py-1 text-[10px] rounded border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30">
            {busy === `${g.guid}:vol` ? <Loader2 size={11} className="animate-spin" /> : 'Pegel setzen'}
          </button>
        </div>
      )}
    </div>
  )
}

// ══ Teil 4: Jabra Software ═══════════════════════════════════════════════════
// Dieselbe Oberfläche wie die Kachel „Jabra Software" unter Software Installationen —
// der Ziel-PC steht hier schon fest, deshalb ohne Benutzersuche.

function JabraTeil({ host, onFertig }: { host: string; onFertig: (b: boolean) => void }) {
  const lauf = useJabraInstallStore(s => s.laeufe[host.trim().toLowerCase()])
  useEffect(() => { onFertig(lauf?.phase === 'fertig') }, [lauf?.phase, onFertig])
  return (
    <div className="pt-2">
      <JabraPanel host={host} />
    </div>
  )
}

// ══ Rahmen ═══════════════════════════════════════════════════════════════════

export function SoundFixPanel({ hostname, inWindow }: { hostname: string; inWindow?: boolean }) {
  // Mehrere Abschnitte dürfen gleichzeitig offen sein — die drei Schritte sind
  // unabhängig und werden oft parallel beobachtet (Treibersuche läuft, währenddessen
  // die Dienste prüfen).
  const [offen, setOffen] = useState<Set<number>>(() => new Set([1]))
  const [fertig, setFertig] = useState<Record<number, boolean>>({})
  const setzeFertig = (nr: number) => (b: boolean) => setFertig(f => (f[nr] === b ? f : { ...f, [nr]: b }))

  const toggle = (nr: number) => setOffen(o => {
    const n = new Set(o); if (n.has(nr)) n.delete(nr); else n.add(nr); return n
  })

  return (
    <div className="space-y-2.5">
      {!inWindow && (
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[11px] text-muted-foreground">
            Die drei Schritte sind unabhängig voneinander — du kannst sie nacheinander oder in beliebiger Reihenfolge ausführen.
          </p>
          <button onClick={() => void api().soundfixOpen({ host: hostname })}
            title="In einem eigenen Fenster öffnen — dann kannst du im Tool weiterarbeiten, während die Treibersuche im Hintergrund läuft"
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground">
            <ExternalLink size={12} />Als eigenes Fenster
          </button>
        </div>
      )}

      <Abschnitt nr={1} titel="Sound-Treiber suchen und aktualisieren"
        untertitel="HP-Treibersuche, eingegrenzt auf Audio — kann bis zu 5 Minuten dauern"
        icon={<Wrench size={15} className="text-amber-400" />}
        offen={offen.has(1)} onToggle={() => toggle(1)} fertig={fertig[1]}>
        <TreiberTeil host={hostname} onFertig={setzeFertig(1)} />
      </Abschnitt>

      <Abschnitt nr={2} titel="Sound-Dienste prüfen"
        untertitel="Windows-Audio & Co. — Status sehen, starten, stoppen, neu starten"
        icon={<Zap size={15} className="text-blue-400" />}
        offen={offen.has(2)} onToggle={() => toggle(2)} fertig={fertig[2]}>
        <DiensteTeil host={hostname} onFertig={setzeFertig(2)} />
      </Abschnitt>

      <Abschnitt nr={3} titel="Audio-Geräte (Wiedergabe/Aufnahme)"
        untertitel="Geräte aktivieren/deaktivieren, Pegel und Stummschaltung"
        icon={<Volume2 size={15} className="text-emerald-400" />}
        offen={offen.has(3)} onToggle={() => toggle(3)} fertig={fertig[3]}>
        <GeraeteTeil host={hostname} onFertig={setzeFertig(3)} />
      </Abschnitt>

      <Abschnitt nr={4} titel="Jabra Software"
        untertitel="Angeschlossenes Jabra-Gerät erkennen und Jabra Direct still installieren"
        icon={<Headphones size={15} className="text-teal-400" />}
        offen={offen.has(4)} onToggle={() => toggle(4)} fertig={fertig[4]}>
        <JabraTeil host={hostname} onFertig={setzeFertig(4)} />
      </Abschnitt>
    </div>
  )
}

export default SoundFixPanel
