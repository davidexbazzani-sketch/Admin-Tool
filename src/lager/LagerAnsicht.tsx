// „Lager einsehen“ (Hardware-Inventur) — Lagerraum in 3D bzw. als Regalansicht.
// three wird erst hier nachgeladen (zweite Stufe: szene/Lager3D), und nur, wenn der PC 3D kann.

import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Box, ClipboardCheck, LayoutGrid, Loader2, RefreshCw, Search, ScanSearch, X } from 'lucide-react'
import './lager.css'
import { ZONEN, ortName } from './aufbau'
import { baueBestand, sucheGeraete, type LagerModell } from './bestand'
import Diagnose from './Diagnose'
import FachDetails, { GeraetKarte, TypPunkt, type InventurInfo } from './FachDetails'
import Lager2D from './Lager2D'
import MiniInventur from './MiniInventur'
import { ladeZeiger, type Zeiger } from './inventurSpeicher'
import { ladeStufe1, ladeStufe2, type Stufe1, type Stufe2 } from './quellen'
import { baueReservierungen } from './reservierung'
import type { Ansicht, Auswahl, Markierung, SzeneGruppe } from './szene/szene'
import { TYP_LABEL, TYP_REIHE, type LagerTyp, type OrtId } from './typen'
import { kann3D } from './webgl'

const Lager3D = lazy(() => import('./szene/Lager3D'))

const MODUS_KEY = 'lager.modus'
const lies = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const schreib = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* egal */ } }

function datum(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
const heuteIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

class Fang extends Component<{ onFehler: (g: string) => void; children: ReactNode }, { kaputt: boolean }> {
  state = { kaputt: false }
  static getDerivedStateFromError() { return { kaputt: true } }
  componentDidCatch(e: unknown) { this.props.onFehler(`3D-Ansicht konnte nicht geladen werden (${e instanceof Error ? e.message : String(e)}).`) }
  render() { return this.state.kaputt ? null : this.props.children }
}

const ANSICHTEN: [Ansicht, string][] = [['alles', 'Alles'], ['rueckwand', 'Rückwand'], ['links', 'Linkes Regal'], ['bereiche', 'Bereiche']]

export default function LagerAnsicht({ currentUser, onBack }: { currentUser: string; onBack: () => void }) {
  const [s1, setS1] = useState<Stufe1 | null>(null)
  const [s2, setS2] = useState<Stufe2 | null>(null)
  const [laedt, setLaedt] = useState(true)
  const [modus, setModus] = useState<'3d' | '2d'>(() => (lies(MODUS_KEY) === '2d' || !kann3D() ? '2d' : '3d'))
  const [fehler3d, setFehler3d] = useState(() => (kann3D() ? '' : 'Dieser PC kann keine 3D-Grafik anzeigen (Grafiktreiber). Die Regalansicht zeigt dieselben Daten.'))
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null)
  const [fahren, setFahren] = useState(false)
  const [suche, setSuche] = useState('')
  const [ansicht, setAnsicht] = useState<{ a: Ansicht; n: number } | null>(null)
  const [diagnose, setDiagnose] = useState(false)
  const [inventurOffen, setInventurOffen] = useState(false)
  const [inventur, setInventur] = useState<Map<OrtId, InventurInfo> | null>(null)
  const [zeiger, setZeiger] = useState<Zeiger | null>(null)

  // Abweichungen der letzten Mini-Inventur bleiben sichtbar, bis man sie ausblendet; laufende Inventur ankündigen
  useEffect(() => {
    if (inventurOffen) return
    let weg = false
    void ladeZeiger().then(z => {
      if (weg) return
      setZeiger(z)
      setInventur(z?.letzte?.abweichungen.length ? new Map(z.letzte.abweichungen.map(a => [a.ort, { zustand: 'abweichung' as const, text: a.text.replace(/^[^:]+:\s*/, '') }])) : null)
    })
    return () => { weg = true }
  }, [inventurOffen])

  const laden = useCallback(async () => {
    setLaedt(true)
    const a = await ladeStufe1()
    setS1(a)
    const b = await ladeStufe2()
    setS2(b)
    setLaedt(false)
  }, [])
  useEffect(() => { void laden() }, [laden])

  const modell: LagerModell | null = useMemo(() => {
    if (!s1) return null
    return baueBestand({
      endgeraete: s1.endgeraete, endgeraeteStand: s1.endgeraeteStand, lagerliste: s1.lagerliste,
      inventur: s2?.inventur ?? null, abholungen: s1.abholungen,
      reservierungen: s2 ? baueReservierungen(s2.checklisten, s2.mitarbeiter) : undefined,
      heute: heuteIso(),
    })
  }, [s1, s2])

  const { gruppen, namen } = useMemo(() => {
    const gruppen: SzeneGruppe[] = []
    const namen = new Map<string, string>()
    if (modell) for (const [ort, liste] of modell.proOrt) {
      if (!liste.length) continue
      gruppen.push({ ort, geraete: liste.map(g => ({ serial: g.serial, typ: g.typ, markiert: g.vorgesehen.length > 0 })) })
      for (const g of liste) if (g.vorgesehen.length) namen.set(g.serial, g.vorgesehen[0].name)
    }
    return { gruppen, namen }
  }, [modell])

  const treffer = useMemo(() => {
    if (!modell || suche.trim().length < 2) return null
    return sucheGeraete(modell, suche)
  }, [modell, suche])
  const trefferSet = useMemo(() => (treffer ? new Set(treffer.map(g => g.serial)) : null), [treffer])

  const markierungen: Markierung[] | null = useMemo(() => inventur ? [...inventur].map(([ort, i]) => ({ ort, zustand: i.zustand, text: i.text })) : null, [inventur])

  const waehle = useCallback((a: Auswahl | null, kameraFahren: boolean) => { setFahren(kameraFahren); setAuswahl(a) }, [])
  const ausRaum = useCallback((a: Auswahl | null) => waehle(a, false), [waehle])
  const zeigeOrt = useCallback((ort: OrtId, typ?: LagerTyp) => { setDiagnose(false); waehle({ ort, typ }, true) }, [waehle])

  function modusWechseln(m: '3d' | '2d') { setModus(m); schreib(MODUS_KEY, m); if (m === '3d') setFehler3d('') }

  const zahlOhne = modell?.proOrt.get('zone:ohne')?.length ?? 0
  const im3D = modus === '3d' && !fehler3d

  return (
    <div className="flex flex-col h-full bg-background" data-lager-ansicht>
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0 flex-wrap">
        <button onClick={onBack} className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/40" title="Zurück zur Hardware-Inventur"><ArrowLeft size={14} /></button>
        <Box className="text-primary" size={20} />
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-tight">Lager einsehen</h1>
          <p className="text-[11px] text-muted-foreground" data-lager-stand>
            {!modell ? 'Lädt …' : <>
              {modell.geraete.length} Geräte im Lager
              {zahlOhne > 0 && <> · <button onClick={() => zeigeOrt('zone:ohne')} className="text-amber-600 hover:underline">{zahlOhne} ohne Fach</button></>}
              {s1?.endgeraeteStand && <> · Endgeräte-Import vom {datum(s1.endgeraeteStand)}</>}
              {s1?.lagerliste && <> · Lagerliste vom {datum(s1.lagerliste.stand)}</>}
              {s2?.inventur && <> · letzte Inventur {datum(s2.inventur.am)}</>}
              {laedt && <> · <Loader2 size={10} className="inline animate-spin" /> Reservierungen …</>}
            </>}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Seriennummer, Hostname, Name …" data-lager-suche
              onKeyDown={e => { if (e.key === 'Enter' && treffer?.length) zeigeOrt(treffer[0].ort, treffer[0].typ) }}
              className="pl-7 pr-7 py-1.5 w-60 rounded-md border border-border bg-background text-xs" />
            {suche && <button onClick={() => setSuche('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
          </div>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button onClick={() => modusWechseln('3d')} data-lager-modus="3d" className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs ${im3D ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}><Box size={13} />3D</button>
            <button onClick={() => modusWechseln('2d')} data-lager-modus="2d" className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs ${!im3D ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}><LayoutGrid size={13} />Regale</button>
          </div>
          <button onClick={() => setDiagnose(true)} disabled={!modell} data-lager-diagnose-knopf className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-border text-muted-foreground hover:text-foreground hover:bg-accent/40" title="Alle Kommentare mit erkanntem Ort — prüfen, ob die Erkennung passt"><ScanSearch size={13} />Erkennung prüfen</button>
          <button onClick={() => setInventurOffen(true)} disabled={!modell} data-lager-inventur-knopf className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90"><ClipboardCheck size={13} />Mini-Inventur</button>
          <button onClick={() => void laden()} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-border" title="Neu laden"><RefreshCw size={13} className={laedt ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      {zeiger?.aktiv && !inventurOffen && (
        <div className="mx-5 mt-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-foreground flex items-center gap-2" data-lager-laeuft>
          Mini-Inventur läuft (gestartet von {zeiger.aktiv.gestartetVon}).
          <button onClick={() => setInventurOffen(true)} className="ml-auto text-primary font-medium hover:underline">Mitzählen</button>
        </div>
      )}
      {s1?.endgeraeteFehler && <div className="mx-5 mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700">{s1.endgeraeteFehler}</div>}
      {fehler3d && (modus === '3d' || !kann3D()) && (
        <div className="mx-5 mt-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
          {fehler3d}
          {kann3D() && <button onClick={() => setFehler3d('')} className="ml-auto text-primary hover:underline">3D erneut versuchen</button>}
        </div>
      )}

      <div className="flex-1 min-h-0 flex relative">
        <div className="flex-1 min-w-0 relative">
          {!modell ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2"><Loader2 size={16} className="animate-spin" />Lager wird geladen …</div>
          ) : im3D ? (
            <>
              <Fang onFehler={g => setFehler3d(g)}>
                <Suspense fallback={<div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2"><Loader2 size={16} className="animate-spin" />3D-Ansicht wird geladen …</div>}>
                  <Lager3D gruppen={gruppen} namen={namen} markierungen={markierungen} auswahl={auswahl} fahren={fahren} treffer={trefferSet}
                    ansicht={ansicht} onAuswahl={ausRaum} onFehler={g => setFehler3d(g)} />
                </Suspense>
              </Fang>
              <div className="absolute top-3 left-3 flex gap-1 flex-wrap">
                {ANSICHTEN.map(([a, l]) => (
                  <button key={a} onClick={() => setAnsicht(v => ({ a, n: (v?.n ?? 0) + 1 }))} data-lager-sicht={a}
                    className="px-2.5 py-1 rounded-md text-xs border border-border bg-card/90 text-foreground hover:bg-accent shadow-sm">{l}</button>
                ))}
              </div>
              <div className="absolute bottom-3 left-3 rounded-md border border-border bg-card/90 px-2.5 py-1.5 text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 max-w-[80%] shadow-sm">
                {TYP_REIHE.map(t => <span key={t} className="inline-flex items-center gap-1"><TypPunkt typ={t} />{TYP_LABEL[t]}</span>)}
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />vorgesehen</span>
                {trefferSet && <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />Suchtreffer</span>}
                <span className="opacity-80">· Ziehen = drehen, Rechtsklick ziehen = schieben, Rad = zoomen</span>
              </div>
            </>
          ) : (
            <Lager2D modell={modell} auswahl={auswahl?.ort ?? null} treffer={trefferSet} inventur={inventur} onAuswahl={ort => waehle({ ort }, false)} />
          )}
          {diagnose && modell && <Diagnose modell={modell} onSchliessen={() => setDiagnose(false)} onZeige={ort => zeigeOrt(ort)} />}
        </div>

        <aside className="w-[380px] shrink-0 border-l border-border bg-background min-h-0 flex flex-col" data-lager-seite>
          {inventurOffen && modell ? (
            <MiniInventur modell={modell} currentUser={currentUser} auswahl={auswahl?.ort ?? null}
              onZeige={ort => zeigeOrt(ort)} onMarkierungen={setInventur} onSchliessen={() => setInventurOffen(false)}
              onLagerlisteNeu={() => void laden()} />
          ) : modell && treffer ? (
            <div className="flex flex-col h-full">
              <div className="px-3 py-2.5 border-b border-border text-sm font-semibold text-foreground">{treffer.length} Treffer für „{suche.trim()}“</div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {treffer.slice(0, 200).map(g => (
                  <div key={g.serial} role="button" tabIndex={0} onClick={() => zeigeOrt(g.ort, g.typ)} onKeyDown={e => { if (e.key === 'Enter') zeigeOrt(g.ort, g.typ) }}
                    className="w-full text-left cursor-pointer rounded-md hover:ring-1 hover:ring-primary/50" data-lager-treffer={g.serial}><GeraetKarte g={g} zeigeOrt /></div>
                ))}
              </div>
            </div>
          ) : modell && auswahl ? (
            <FachDetails modell={modell} ort={auswahl.ort} typ={auswahl.typ} inventur={inventur?.get(auswahl.ort)}
              onTyp={t => waehle({ ort: auswahl.ort, typ: t }, false)} onSchliessen={() => waehle(null, false)} />
          ) : modell ? (
            <Uebersicht modell={modell} onZeige={zeigeOrt} />
          ) : null}
        </aside>
      </div>
    </div>
  )
}

function Uebersicht({ modell, onZeige }: { modell: LagerModell; onZeige: (ort: OrtId, typ?: LagerTyp) => void }) {
  const proTyp = TYP_REIHE.map(t => [t, modell.geraete.filter(g => g.typ === t).length] as const)
  const vorgesehen = modell.geraete.filter(g => g.vorgesehen.length)
  const orte = [...modell.proOrt].filter(([, l]) => l.length).sort((a, b) => b[1].length - a[1].length)
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-1.5">Im Lager</h2>
        <div className="grid grid-cols-2 gap-1.5">
          {proTyp.map(([t, n]) => (
            <div key={t} className="rounded-md border border-border px-2 py-1.5 flex items-center gap-1.5"><TypPunkt typ={t} gross /><span className="text-foreground">{TYP_LABEL[t]}</span><span className="ml-auto font-semibold text-foreground">{n}</span></div>
          ))}
        </div>
        <p className="text-muted-foreground mt-2">Klick auf einen Stapel, ein Fach oder einen Bereich zeigt die Seriennummern.</p>
      </div>
      {vorgesehen.length > 0 && (
        <div>
          <h3 className="font-semibold text-foreground mb-1">Schon vorgesehen ({vorgesehen.length})</h3>
          <div className="space-y-1">
            {vorgesehen.map(g => (
              <button key={g.serial} onClick={() => onZeige(g.ort, g.typ)} className="w-full text-left rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 hover:bg-amber-500/20">
                <span className="font-mono">{g.serial}</span> → <span className="font-semibold">{g.vorgesehen[0].name}</span> <span className="text-muted-foreground">· {ortName(g.ort)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <h3 className="font-semibold text-foreground mb-1">Belegte Plätze</h3>
        <div className="space-y-0.5">
          {orte.map(([ort, l]) => (
            <button key={ort} onClick={() => onZeige(ort)} className={`w-full text-left flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/40 ${ort === 'zone:ohne' ? 'text-amber-600' : 'text-foreground'}`}>
              <span className="truncate">{ortName(ort)}</span><span className="ml-auto font-semibold">{l.length}</span>
            </button>
          ))}
          {!orte.length && <p className="text-muted-foreground">Keine Geräte im Lager gefunden.</p>}
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground">
        Bereiche: {ZONEN.map(z => z.label).join(' · ')}
      </div>
    </div>
  )
}
