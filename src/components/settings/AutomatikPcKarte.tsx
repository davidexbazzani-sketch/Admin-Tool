// ── Einstellungen → „Automatik & Scans“ → Automatik-PC ───────────────────────────
// Legt fest, WELCHER PC — mit welchem Windows-Konto — alle automatischen Scans ausführt.
// Die Vorgabe liegt auf dem Netzlaufwerk und gilt für alle (services/serverMelder.ts); jeder
// Admin-PC liest sie jede Minute neu. Seit 19.11.2026 hinter dem Passwort des Bereichs „Für alle“
// (vorher PIN 0506) — die Einstellungen übergeben entsperrt=true.
// Auswahl: PCs, auf denen das Tool mit Admin-Anmeldung lief (automatik/rechner/*.json), dazu der
// aktuelle Automatik-PC und dieser PC. Beide Felder nehmen auch eine frei eingegebene Kennung.
// „Dieses Gerät verwenden“ (Nutzerwunsch): legt das Gerät fest, an dem man sitzt — das Konto bleibt
// leer, es zählt nur das Gerät (später kann das ein Server sein, auf dem das Tool läuft).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Cpu, Lock, CheckCircle, AlertTriangle, Loader, RotateCcw, MonitorCheck, Info } from 'lucide-react'
import Card from '../Card'
import { DeviceInfoButton } from '../device/DeviceDossier'
import {
  ladeVorgabe, speichereVorgabe, wirksameVorgabe, eigenerRechner, eigenesKonto, rechnerKurz, kontoOhneDomaene,
  BEVORZUGTER_MELDER, BEVORZUGTER_RECHNER, type AutomatikVorgabe,
} from '../../services/serverMelder'
import { ladeLeiter, ladeTeilnehmer, leiterText, leiterAktiv, pruefeLeiter, type Leiter, type Teilnehmer } from '../../services/automatikLeiter'
import { protokolliere } from '../../services/aktivitaet'

const zeit = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const vor = (iso: string, jetzt: number) => {
  const min = Math.max(0, Math.round((jetzt - Date.parse(iso)) / 60_000))
  if (min < 2) return 'gerade eben'
  if (min < 90) return `vor ${min} min`
  if (min < 48 * 60) return `vor ${Math.round(min / 60)} h`
  return `vor ${Math.round(min / 1440)} Tagen`
}
export const PC_NAME_OK = /^[A-Z0-9][A-Z0-9-]{1,14}$/
export const KONTO_OK = /^[A-Z0-9][A-Z0-9._-]{1,39}$/

interface Zeile { rechner: string; konto: string; benutzer?: string; at?: string; marken: string[] }

export default function AutomatikPcKarte({ entsperrt, mitPin, von }: { entsperrt: boolean; mitPin: (a: () => void) => void; von: string }) {
  const [vorgabe, setVorgabe] = useState<AutomatikVorgabe | null>(null)
  const [leiter, setLeiter] = useState<Leiter | null>(null)
  const [teilnehmer, setTeilnehmer] = useState<Teilnehmer[]>([])
  const [ich, setIch] = useState<{ rechner: string; konto: string }>({ rechner: '', konto: '' })
  const [rechner, setRechner] = useState('')
  const [konto, setKonto] = useState('')
  const [laedt, setLaedt] = useState(true)
  const [speichert, setSpeichert] = useState(false)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  const [jetzt, setJetzt] = useState(Date.now())

  const lade = useCallback(async (felder: boolean) => {
    const [v, l, t, r, k] = await Promise.all([ladeVorgabe(), ladeLeiter(), ladeTeilnehmer(), eigenerRechner(), eigenesKonto()])
    setVorgabe(v); setLeiter(l); setTeilnehmer(t); setIch({ rechner: rechnerKurz(r), konto: kontoOhneDomaene(k) }); setJetzt(Date.now())
    if (felder) { const w = wirksameVorgabe(); setRechner(w.rechner); setKonto(w.konto) }
    setLaedt(false)
  }, [])
  useEffect(() => { void lade(true) }, [lade])
  // Anzeige „führt gerade aus“ frisch halten
  useEffect(() => { const i = setInterval(() => { void lade(false) }, 60_000); return () => clearInterval(i) }, [lade])

  const wirksam = useMemo(() => wirksameVorgabe(), [vorgabe])   // eslint-disable-line react-hooks/exhaustive-deps
  const lt = leiterText(leiter, jetzt)

  // Auswahl: bekannte Admin-PCs + aktueller Automatik-PC + dieser PC + was gerade gilt
  const zeilen = useMemo(() => {
    const m = new Map<string, Zeile>()
    const merke = (r: string, k: string, o: Partial<Zeile>, marke?: string) => {
      const rk = rechnerKurz(r); if (!rk) return
      const kk = kontoOhneDomaene(k)
      const schluessel = `${rk}|${kk}`
      const alt = m.get(schluessel) || { rechner: rk, konto: kk, marken: [] }
      m.set(schluessel, { ...alt, benutzer: alt.benutzer || o.benutzer, at: [alt.at, o.at].filter(Boolean).sort().pop(), marken: marke && !alt.marken.includes(marke) ? [...alt.marken, marke] : alt.marken })
    }
    for (const t of teilnehmer) merke(t.rechner, t.konto || '', { benutzer: t.benutzer, at: t.at })
    if (leiter && leiterAktiv(leiter, jetzt)) merke(leiter.rechner, leiter.konto || '', { benutzer: leiter.benutzer, at: leiter.at }, 'führt gerade aus')
    if (ich.rechner) merke(ich.rechner, ich.konto, { at: new Date(jetzt).toISOString() }, 'dieser PC')
    // „gilt gerade“: ist nur das Gerät festgelegt (Konto egal), gilt das für JEDE Zeile dieses Geräts
    const zumGeraet = [...m.values()].filter(z => z.rechner === wirksam.rechner)
    if (!wirksam.konto && zumGeraet.length) for (const z of zumGeraet) merke(z.rechner, z.konto, {}, 'gilt gerade')
    else merke(wirksam.rechner, wirksam.konto, {}, 'gilt gerade')
    return [...m.values()].sort((a, b) => (b.marken.length - a.marken.length) || (b.at || '').localeCompare(a.at || ''))
  }, [teilnehmer, leiter, ich, wirksam, jetzt])
  const pcs = useMemo(() => [...new Set(zeilen.map(z => z.rechner))], [zeilen])
  const konten = useMemo(() => [...new Set(zeilen.map(z => z.konto).filter(Boolean))], [zeilen])

  const r = rechnerKurz(rechner), k = kontoOhneDomaene(konto)
  const pcFehler = !r ? 'PC-Name fehlt' : !PC_NAME_OK.test(r) ? 'kein gültiger PC-Name' : ''
  const kontoFehler = k && !KONTO_OK.test(k) ? 'keine gültige Kennung' : ''
  const geaendert = r !== wirksam.rechner || k !== wirksam.konto
  const bekannt = zeilen.some(z => z.rechner === r && (!k || z.konto === k) && z.at)

  /** Vorgabe speichern (immer hinter der PIN). `k` leer = egal, wer auf dem Gerät angemeldet ist. */
  function lege(rNeu: string, kNeu: string) {
    mitPin(() => { void (async () => {
      setSpeichert(true); setMeldung(null)
      const ok = await speichereVorgabe({ rechner: rNeu, konto: kNeu }, von)
      if (ok) {
        protokolliere({ art: 'manuell', quelle: 'Einstellungen', aktion: 'Automatik-PC festgelegt', ziel: rNeu, ergebnis: `Gerät ${rNeu}${kNeu ? `, Konto ${kNeu}` : ', jedes Konto'} (vorher ${wirksam.rechner}${wirksam.konto ? `, Konto ${wirksam.konto}` : ''})` })
        await pruefeLeiter().catch(() => false)   // dieser PC richtet sich sofort danach
        await lade(true)
        setMeldung({ ok: true, text: `Gespeichert: Automatik-PC ist ${rNeu}${kNeu ? ` mit Konto ${kNeu}` : ' – egal, wer dort angemeldet ist'}. Gilt für alle und wirkt ohne Neustart innerhalb etwa einer Minute.` })
      } else setMeldung({ ok: false, text: 'Speichern fehlgeschlagen – Netzlaufwerk nicht erreichbar?' })
      setSpeichert(false)
    })() })
  }
  function speichern() {
    if (pcFehler || kontoFehler) return
    lege(r, k)
  }
  /** „Dieses Gerät verwenden“: das Gerät, an dem man gerade sitzt — unabhängig vom angemeldeten Konto. */
  const istDiesesGeraet = !wirksam.standard && !!ich.rechner && wirksam.rechner === ich.rechner && !wirksam.konto
  function diesesGeraet() {
    if (!ich.rechner || !PC_NAME_OK.test(ich.rechner)) return
    lege(ich.rechner, '')
  }
  function standard() {
    mitPin(() => { void (async () => {
      setSpeichert(true); setMeldung(null)
      const ok = await speichereVorgabe(null, von)
      if (ok) {
        protokolliere({ art: 'manuell', quelle: 'Einstellungen', aktion: 'Automatik-PC auf Standard zurückgesetzt', ziel: BEVORZUGTER_RECHNER, ergebnis: `Standard: PC ${BEVORZUGTER_RECHNER} oder Konto ${BEVORZUGTER_MELDER}` })
        await pruefeLeiter().catch(() => false)
        await lade(true)
        setMeldung({ ok: true, text: `Zurück auf den Standard (${BEVORZUGTER_RECHNER} / ${BEVORZUGTER_MELDER}).` })
      } else setMeldung({ ok: false, text: 'Zurücksetzen fehlgeschlagen – Netzlaufwerk nicht erreichbar?' })
      setSpeichert(false)
    })() })
  }

  const feld = 'px-2.5 py-1.5 text-xs rounded-md border bg-background text-foreground font-mono focus:outline-none focus:border-primary read-only:opacity-70 read-only:cursor-pointer'
  return (
    <Card title="Automatik-PC" icon={<Cpu size={15} />}
      subtitle="Genau EIN PC führt alle automatischen Scans aus. Hier festlegen, welcher – und welches Windows-Konto dort angemeldet sein muss. Die Einstellung gilt für alle."
      actions={entsperrt
        ? undefined
        : <button onClick={() => mitPin(() => {})} data-automatik-sperre="zu" title="Automatik-PC und Zeitpläne lassen sich erst nach dem Entsperren ändern"
          className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"><Lock size={12} />Bearbeiten</button>}>
      {laedt ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader size={13} className="animate-spin" />Lade …</div>
      ) : (
        <div className="space-y-3" data-automatik-karte>
          {/* Was gilt + wer führt gerade aus */}
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-background p-3" data-automatik-gilt>
              <p className="text-[11px] text-muted-foreground">Festgelegt ist</p>
              <p className="text-sm text-foreground inline-flex items-center gap-1.5 flex-wrap">
                <span className="font-mono font-semibold">{wirksam.rechner}</span><DeviceInfoButton hostname={wirksam.rechner} />
                <span className="text-muted-foreground">·</span>
                <span>{wirksam.konto ? <>Konto <span className="font-mono font-semibold">{wirksam.konto}</span></> : 'jedes Konto'}</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {wirksam.standard ? 'Standard – bisher wurde hier nichts festgelegt.' : `festgelegt am ${zeit(vorgabe?.geaendertAm)}${vorgabe?.geaendertVon ? ` von ${vorgabe.geaendertVon}` : ''}`}
              </p>
            </div>
            <div className={`rounded-lg border p-3 ${lt.aktiv ? (lt.bevorzugt ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/40 bg-amber-500/5') : 'border-border bg-background'}`} data-automatik-aktuell title={lt.titel}>
              <p className="text-[11px] text-muted-foreground">Führt die Scans gerade aus</p>
              <p className="text-sm text-foreground inline-flex items-center gap-1.5"><MonitorCheck size={14} className={lt.aktiv ? (lt.bevorzugt ? 'text-emerald-500' : 'text-amber-500') : 'text-muted-foreground'} />{lt.text.replace(/^Automatik-PC: /, '')}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{lt.aktiv ? (lt.bevorzugt ? 'Das ist der festgelegte PC.' : 'Der festgelegte PC ist aus oder dort ist ein anderes Konto angemeldet – ein anderer Admin-PC vertritt.') : 'Kein Admin-PC hat das Tool offen – es läuft gerade kein automatischer Scan.'}</p>
            </div>
          </div>

          {/* Dieses Gerät verwenden: nur das Gerät zählt, nicht das angemeldete Konto */}
          <div className="rounded-lg border border-border bg-background p-3 flex items-center gap-3 flex-wrap" data-automatik-dieses-zeile>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground">Du sitzt an <span className="font-mono font-semibold">{ich.rechner || 'unbekannt'}</span>{ich.konto && <span className="text-muted-foreground"> · angemeldet als <span className="font-mono">{ich.konto}</span></span>}</p>
              <p className="text-[11px] text-muted-foreground">„Dieses Gerät verwenden“ legt genau dieses Gerät fest – egal, wer hier angemeldet ist. Läuft das Tool später auf einem Server, kann so der Server der Automatik-PC werden.</p>
            </div>
            {istDiesesGeraet
              ? <span className="text-[11px] text-emerald-500 inline-flex items-center gap-1" data-automatik-dieses="aktiv"><CheckCircle size={12} />Dieses Gerät ist festgelegt</span>
              : <button onClick={diesesGeraet} disabled={speichert || !ich.rechner || !PC_NAME_OK.test(ich.rechner)} data-automatik-dieses="knopf"
                title={`${ich.rechner || 'Dieses Gerät'} als Automatik-PC festlegen – unabhängig vom angemeldeten Konto${entsperrt ? '' : ' (PIN nötig)'}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold border border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40">
                {speichert ? <Loader size={13} className="animate-spin" /> : <MonitorCheck size={13} />}Dieses Gerät verwenden
              </button>}
          </div>

          {/* Festlegen */}
          <div className="rounded-lg border border-border bg-background p-3 space-y-2">
            <div className="flex items-end gap-3 flex-wrap">
              <label className="text-[11px] text-muted-foreground flex flex-col gap-1">
                Automatik-PC (Computername – PC oder Server)
                <input list="automatik-pcs" value={rechner} readOnly={!entsperrt} spellCheck={false} data-automatik-pc
                  onChange={e => { setRechner(e.target.value.toUpperCase()); setMeldung(null) }} onClick={() => { if (!entsperrt) mitPin(() => {}) }}
                  placeholder="z. B. DE5CG4453Q1N" className={`${feld} w-52 ${pcFehler && entsperrt ? 'border-red-500/60' : 'border-border'}`} />
              </label>
              <label className="text-[11px] text-muted-foreground flex flex-col gap-1">
                Dazugehöriges Windows-Konto (Kennung, leer = egal)
                <input list="automatik-konten" value={konto} readOnly={!entsperrt} spellCheck={false} data-automatik-konto
                  onChange={e => { setKonto(e.target.value); setMeldung(null) }} onClick={() => { if (!entsperrt) mitPin(() => {}) }}
                  placeholder="z. B. BQ8069 – leer = jedes Konto" className={`${feld} w-56 ${kontoFehler && entsperrt ? 'border-red-500/60' : 'border-border'}`} />
              </label>
              <datalist id="automatik-pcs">{pcs.map(p => <option key={p} value={p} />)}</datalist>
              <datalist id="automatik-konten">{konten.map(p => <option key={p} value={p} />)}</datalist>
              <button onClick={speichern} disabled={speichert || !!pcFehler || !!kontoFehler || !geaendert} data-automatik-speichern
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                {speichert ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />}Festlegen
              </button>
              {!wirksam.standard && (
                <button onClick={standard} disabled={speichert} data-automatik-standard title={`Eigene Festlegung entfernen – es gilt wieder der Standard (${BEVORZUGTER_RECHNER} / ${BEVORZUGTER_MELDER})`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40"><RotateCcw size={12} />Standard</button>
              )}
            </div>
            {entsperrt && (pcFehler || kontoFehler) && <p className="text-[11px] text-red-500" data-automatik-fehler>{[pcFehler, kontoFehler].filter(Boolean).join(' · ')}</p>}
            {entsperrt && !pcFehler && !kontoFehler && geaendert && !bekannt && (
              <p className="text-[11px] text-amber-500 flex gap-1.5" data-automatik-unbekannt><AlertTriangle size={12} className="mt-0.5 shrink-0" />Diese Kombination steht nicht in der Liste unten. Sie gilt trotzdem – Automatik-PC wird der PC aber erst, wenn das Tool dort mit Admin-Anmeldung (und diesem Konto) läuft. Bis dahin vertritt ein anderer Admin-PC.</p>
            )}
            {meldung && <p className={`text-[11px] flex gap-1.5 ${meldung.ok ? 'text-emerald-500' : 'text-red-500'}`} data-automatik-meldung>{meldung.ok ? <CheckCircle size={12} className="mt-0.5 shrink-0" /> : <AlertTriangle size={12} className="mt-0.5 shrink-0" />}{meldung.text}</p>}
          </div>

          {/* Auswahl */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">Bekannte Admin-PCs – anklicken, um PC und Konto zu übernehmen (oder oben eine andere Kennung eintippen)</p>
            <div className="rounded-lg border border-border overflow-hidden">
              {zeilen.map(z => {
                // nur Gerät eingetragen (Konto leer) → alle Zeilen dieses Geräts sind gemeint
                const gewaehlt = z.rechner === r && (!k || z.konto === k)
                return (
                  <div key={`${z.rechner}|${z.konto}`} data-automatik-zeile={`${z.rechner}|${z.konto}`}
                    onClick={() => mitPin(() => { setRechner(z.rechner); setKonto(z.konto); setMeldung(null) })}
                    className={`px-3 py-1.5 flex items-center gap-2 flex-wrap text-xs border-b border-border/60 last:border-b-0 cursor-pointer hover:bg-accent/40 ${gewaehlt ? 'bg-primary/10' : 'bg-background'}`}>
                    <span className="inline-flex items-center gap-1 w-44"><span className="font-mono font-semibold text-foreground">{z.rechner}</span><span onClick={e => e.stopPropagation()}><DeviceInfoButton hostname={z.rechner} /></span></span>
                    <span className="w-28 font-mono text-foreground">{z.konto || <span className="text-muted-foreground font-sans">{z.marken.includes('gilt gerade') ? 'jedes Konto' : 'Konto unbekannt'}</span>}</span>
                    <span className="flex-1 min-w-0 truncate text-muted-foreground">{z.benutzer || ''}</span>
                    {z.marken.map(m => <span key={m} className={`px-1.5 py-0.5 rounded border text-[10px] ${m === 'gilt gerade' ? 'border-primary/50 bg-primary/10 text-primary' : m === 'führt gerade aus' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500' : 'border-border text-muted-foreground'}`}>{m}</span>)}
                    <span className="w-24 text-right text-[11px] text-muted-foreground">{z.at ? vor(z.at, jetzt) : 'nie gesehen'}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground flex gap-1.5"><Info size={12} className="mt-0.5 shrink-0" />
            Es bleibt dabei: nie mehr als EIN PC führt automatische Scans aus. Ist der festgelegte PC aus, übernimmt genau ein anderer Admin-PC und gibt wieder ab, sobald der festgelegte PC zurück ist. In der Liste erscheinen PCs, auf denen das Tool ab dieser Version mit Admin-Anmeldung lief; PCs mit älterer Version kennen die Einstellung noch nicht.
          </p>
        </div>
      )}
    </Card>
  )
}
