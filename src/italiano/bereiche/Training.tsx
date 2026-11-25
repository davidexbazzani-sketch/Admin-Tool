// Parla Italiano — freies Training („Palestra“): üben, was man schon gelernt hat — so oft man will.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, Check, Ear, Layers, MessageCircle, PenLine, Puzzle, RefreshCw, Repeat, Shuffle, Timer, Volume2, X, Zap } from 'lucide-react'
import type { LevelInhalt, TagInhalt } from '../kern/inhaltTypen'
import { levelVonTag } from '../kern/inhaltTypen'
import type { Aufgabe, Ergebnis } from '../kern/typen'
import { ladeLevelBis, ladeWoerter, woerterVon, type WortMitOrt } from '../kern/inhalt'
import { baueGespraech, baueGrammatik, baueHoeren, baueLesen, baueSatzbau, baueTempo, baueVokabeln, TEMPO_SEKUNDEN, type Wuensche } from '../kern/aufgaben'
import { baueVerben, zeitenBis, type Zeit } from '../kern/verben'
import { faellige, stolpersteine } from '../kern/kasten'
import { useItaliano } from '../kern/speicher'
import { heute, tagNummer } from '../kern/zeit'
import { neuerStart } from '../../brain/kern/zufall'
import Lauf, { type LaufEnde } from '../ablauf/Lauf'
import { fehlgriffe, FehlgriffListe, holeWuensche, Laedt } from '../ablauf/gemeinsam'
import { Laut } from '../uebungen/teile'

type Art = 'karten' | 'vokabeln' | 'hoeren' | 'grammatik' | 'satzbau' | 'gespraech' | 'lesen' | 'tempo' | 'verben'
type Umfang = 'alles' | 'station' | 'stolpersteine'

interface Stoff { level: LevelInhalt[]; tage: TagInhalt[]; woerter: WortMitOrt[] }

const KACHELN: { art: Art; name: string; text: string; Symbol: typeof Zap; farbe?: string }[] = [
  { art: 'karten', name: 'Karteikarten', text: 'Fällige Wörter wiederholen – du entscheidest, ob du es wusstest.', Symbol: Layers, farbe: 'pi-symbol-blau' },
  { art: 'vokabeln', name: 'Vokabel-Mix', text: '15 Aufgaben: erkennen, übersetzen, schreiben, zuordnen.', Symbol: Shuffle },
  { art: 'hoeren', name: 'Hören', text: 'Wörter und Sätze nur über das Ohr verstehen.', Symbol: Ear, farbe: 'pi-symbol-blau' },
  { art: 'grammatik', name: 'Grammatik', text: '12 Lücken quer durch alle Themen, die du schon hattest.', Symbol: BookOpen },
  { art: 'satzbau', name: 'Sätze bauen', text: 'Aus Wortkacheln ganze Sätze legen.', Symbol: Puzzle, farbe: 'pi-symbol-gruen' },
  { art: 'gespraech', name: 'Gespräch', text: 'Alltagslagen: Was sagst du?', Symbol: MessageCircle, farbe: 'pi-symbol-gruen' },
  { art: 'lesen', name: 'Lesen', text: 'Ein kurzer Text und vier Fragen dazu.', Symbol: PenLine },
  { art: 'tempo', name: 'Tempo-Runde', text: '60 Sekunden – so viele Wörter wie möglich.', Symbol: Timer, farbe: 'pi-symbol-gold' },
  { art: 'verben', name: 'Verb-Trainer', text: 'Verben beugen: von «io sono» bis «che io sia».', Symbol: Repeat, farbe: 'pi-symbol-gold' },
]

export default function Training({ onSperre }: { onSperre: (an: boolean) => void }) {
  const daten = useItaliano(s => s.daten)
  const [stoff, setStoff] = useState<Stoff | null>(null)
  const [wuensche, setWuensche] = useState<Wuensche | null>(null)
  const [umfang, setUmfang] = useState<Umfang>('alles')
  const [zeit, setZeit] = useState<Zeit>('presente')
  const [runde, setRunde] = useState<{ art: Art; titel: string; aufgaben: Aufgabe[]; karten?: WortMitOrt[] } | null>(null)
  const [ende, setEnde] = useState<{ art: Art; titel: string; richtig: number; gesamt: number; punkte: number; aufgaben: Aufgabe[]; ergebnisse: Ergebnis[] } | null>(null)
  const [meldung, setMeldung] = useState('')
  const gelernt = daten.lektionen

  useEffect(() => {
    let lebt = true
    void (async () => {
      const [level, w] = await Promise.all([ladeLevelBis(gelernt ? levelVonTag(gelernt) : 0), holeWuensche()])
      if (!lebt) return
      const tage = level.flatMap(l => l.tage).filter(t => t.tag <= gelernt)
      setStoff({ level, tage, woerter: tage.flatMap(woerterVon) })
      setWuensche(w)
    })()
    return () => { lebt = false }
  }, [gelernt, daten.einstellungen.ton, daten.einstellungen.tippen])
  useEffect(() => { onSperre(!!runde); return () => onSperre(false) }, [runde, onSperre])

  const heuteNr = tagNummer(heute())
  const faellig = useMemo(() => faellige(daten.kasten, heuteNr), [daten.kasten, heuteNr])
  const stolper = useMemo(() => stolpersteine(daten.kasten, 30), [daten.kasten])
  const zeiten = useMemo(() => zeitenBis(daten.level), [daten.level])
  const tonDa = !!stoff && !!wuensche && stoff.tage.some(t => wuensche.ton(t.tag))

  const starte = useCallback(async (art: Art) => {
    if (!stoff || !wuensche) return
    setMeldung('')
    const start = neuerStart()
    const aktuell = levelVonTag(Math.max(1, gelernt))
    const tage = umfang === 'station' ? stoff.tage.filter(t => levelVonTag(t.tag) === aktuell) : stoff.tage
    let ws = umfang === 'station' ? tage.flatMap(woerterVon) : stoff.woerter
    if (umfang === 'stolpersteine') { const k = new Set(stolper); ws = stoff.woerter.filter(w => k.has(w.kennung)) }
    const titel = KACHELN.find(k => k.art === art)!.name
    let aufgaben: Aufgabe[] = []
    if (art === 'karten') {
      const kennungen = faellig.length ? faellig.slice(0, 20) : []
      const karten = kennungen.length ? await ladeWoerter(kennungen) : [...ws].sort(() => Math.random() - 0.5).slice(0, 15)
      if (!karten.length) { setMeldung('Noch keine Wörter gelernt – starte zuerst die Lektion unter „Heute“.'); return }
      setRunde({ art, titel, aufgaben: [], karten }); return
    }
    if (art === 'vokabeln') aufgaben = baueVokabeln(ws, stoff.woerter, wuensche, start, 15)
    else if (art === 'hoeren') aufgaben = baueHoeren(ws, tage, stoff.woerter, wuensche, start, 12)
    else if (art === 'grammatik') aufgaben = baueGrammatik(tage, start, 12)
    else if (art === 'satzbau') aufgaben = baueSatzbau(tage, wuensche, start, 8)
    else if (art === 'gespraech') aufgaben = baueGespraech(tage, start, 10)
    else if (art === 'lesen') aufgaben = baueLesen(stoff.level.filter(l => l.tage.every(t => t.tag <= gelernt)), start)
    else if (art === 'tempo') aufgaben = baueTempo(ws, start)
    else if (art === 'verben') aufgaben = baueVerben(zeit, daten.level, start, 10)
    if (aufgaben.length < (art === 'lesen' ? 1 : 4)) {
      setMeldung(art === 'lesen' ? 'Lesetexte gibt es, sobald du alle fünf Lerntage einer Station geschafft hast.' : art === 'hoeren' ? 'Dafür ist noch kein Ton vorhanden oder der Ton ist ausgeschaltet.' : umfang === 'stolpersteine' ? 'Du hast im Moment keine Stolpersteine. Bravo!' : 'Dafür hast du noch zu wenig gelernt – nach ein, zwei Lektionen geht es los.')
      return
    }
    setRunde({ art, titel: art === 'verben' ? `${titel} · ${zeit}` : titel, aufgaben })
  }, [stoff, wuensche, umfang, gelernt, faellig, stolper, zeit, daten.level])

  const fertig = useCallback((e: LaufEnde) => {
    if (!runde) return
    const z = useItaliano.getState()
    const punkte = z.bucheErgebnisse(e.ergebnisse, e.sekunden)
    const richtig = e.ergebnisse.filter(x => x.richtig).length
    const gesamt = runde.art === 'tempo' ? e.ergebnisse.length : Math.max(e.ergebnisse.length, runde.aufgaben.filter(a => a.typ !== 'karte').length)
    if (e.ergebnisse.length) z.bucheTest({ art: runde.art === 'tempo' ? 'tempo' : 'training', r: richtig, n: gesamt, titel: runde.titel })
    void z.sichere()
    setEnde({ art: runde.art, titel: runde.titel, richtig, gesamt, punkte, aufgaben: runde.aufgaben, ergebnisse: e.ergebnisse })
    setRunde(null)
  }, [runde])
  const abbruch = useCallback((e: LaufEnde) => { useItaliano.getState().bucheErgebnisse(e.ergebnisse, e.sekunden); setRunde(null) }, [])

  if (!stoff || !wuensche) return <Laedt />
  if (runde?.karten) return <Karteikarten karten={runde.karten} onFertig={fertig} onAbbruch={abbruch} />
  if (runde) return <Lauf key={runde.aufgaben[0]?.id} aufgaben={runde.aufgaben} modus={runde.art === 'tempo' ? 'test' : 'lernen'} titel={runde.titel} sekunden={runde.art === 'tempo' ? TEMPO_SEKUNDEN : undefined} onFertig={fertig} onAbbruch={abbruch} />

  if (ende) {
    const quote = ende.gesamt ? Math.round((ende.richtig / ende.gesamt) * 100) : 0
    return (
      <div className="pi-schmal pi-spalte pi-ein" data-pi-training-ende>
        <div className="pi-karte pi-spalte" style={{ alignItems: 'center', textAlign: 'center', padding: 28 }}>
          <div className="pi-ober">{ende.titel}</div>
          <h2 className="pi-h1 pi-zahl">{ende.art === 'tempo' ? `${ende.richtig} Wörter in 60 Sekunden` : `${ende.richtig} von ${ende.gesamt} richtig`}</h2>
          <div className="pi-reihe" style={{ justifyContent: 'center' }}>
            {ende.art !== 'tempo' && <span className={`pi-chip ${quote >= 80 ? 'pi-chip-gruen' : ''}`}>{quote} %</span>}
            <span className="pi-chip pi-chip-akzent">+{ende.punkte} Punkte</span>
          </div>
        </div>
        <FehlgriffListe liste={fehlgriffe(ende.aufgaben, ende.ergebnisse)} />
        <div className="pi-reihe" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="pi-knopf pi-knopf-leise" onClick={() => setEnde(null)} data-pi-fertig><ArrowLeft size={16} />Zum Training</button>
          <button type="button" className="pi-knopf" onClick={() => { const a = ende.art; setEnde(null); void starte(a) }} autoFocus data-pi-nochmal><RefreshCw size={16} />Noch eine Runde</button>
        </div>
      </div>
    )
  }

  return (
    <div className="pi-breite pi-spalte" data-pi-training>
      <div><h1 className="pi-h1">Training</h1><p className="pi-leise">Üben, was du schon gelernt hast – so oft du willst. Alles hier zählt für deinen Karteikasten und deine Serie.</p></div>

      {gelernt === 0 ? <div className="pi-karte"><p>Hier geht es los, sobald du die erste Lektion geschafft hast. Die findest du unter „Heute“.</p></div> : (
        <>
          <div className="pi-reihe" role="group" aria-label="Was soll geübt werden?">
            <span className="pi-leise pi-klein">Stoff:</span>
            {([['alles', `Alles Gelernte (${stoff.woerter.length} Wörter)`], ['station', 'Nur die aktuelle Station'], ['stolpersteine', `Meine Stolpersteine (${stolper.length})`]] as [Umfang, string][]).map(([id, name]) => (
              <button key={id} type="button" className={`pi-chip ${umfang === id ? 'pi-chip-akzent' : ''}`} aria-pressed={umfang === id} onClick={() => setUmfang(id)} data-pi-umfang={id}>{name}</button>
            ))}
          </div>
          {meldung && <div className="pi-karte-flach pi-ein" role="status" data-pi-training-meldung>{meldung}</div>}
          <div className="pi-raster pi-raster-3">
            {KACHELN.map(k => {
              const aus = (k.art === 'hoeren' && !tonDa) || (umfang === 'stolpersteine' && !['vokabeln', 'tempo', 'karten'].includes(k.art))
              return (
                <div key={k.art} className="pi-karte pi-spalte" style={{ gap: 10, opacity: aus ? 0.55 : 1 }}>
                  <div className="pi-reihe" style={{ flexWrap: 'nowrap' }}>
                    <span className={`pi-symbol ${k.farbe ?? ''}`}><k.Symbol size={18} /></span>
                    <h3 className="pi-h3" style={{ flex: 1 }}>{k.name}</h3>
                    {k.art === 'karten' && faellig.length > 0 && <span className="pi-chip pi-chip-blau pi-zahl">{faellig.length} fällig</span>}
                  </div>
                  <p className="pi-leise pi-klein" style={{ flex: 1 }}>{k.art === 'hoeren' && !tonDa ? (daten.einstellungen.ton ? 'Für deine Lerntage ist noch kein Ton vorhanden.' : 'Der Ton ist ausgeschaltet (Einstellungen).') : k.text}</p>
                  {k.art === 'verben' && (
                    <select className="pi-eingabe" style={{ fontSize: 13, padding: '7px 10px', fontFamily: 'var(--pi-schrift)' }} value={zeit} onChange={e => setZeit(e.target.value as Zeit)} aria-label="Zeitform" data-pi-zeit>
                      {zeiten.map(z => <option key={z.id} value={z.id}>{z.name} – {z.deutsch}</option>)}
                    </select>
                  )}
                  <button type="button" className="pi-knopf pi-knopf-leise" disabled={aus} onClick={() => void starte(k.art)} data-pi-training-start={k.art}>Starten</button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Karteikarten ────────────────────────────────────────────────────────────────────────
/** Vorderseite Deutsch → überlegen → umdrehen → selbst einschätzen. Jede Einschätzung bewegt das Wort im Karteikasten. */
function Karteikarten({ karten, onFertig, onAbbruch }: { karten: WortMitOrt[]; onFertig: (e: LaufEnde) => void; onAbbruch: (e: LaufEnde) => void }) {
  const ton = useItaliano(s => s.daten.einstellungen.ton)
  const langsam = useItaliano(s => s.daten.einstellungen.langsam)
  const [i, setI] = useState(0)
  const [offen, setOffen] = useState(false)
  const ergebnisse = useRef<Ergebnis[]>([])
  const beginn = useRef(Date.now())
  const karte = karten[i]
  const ende = (zeitUm = false): LaufEnde => ({ ergebnisse: ergebnisse.current, sekunden: Math.round((Date.now() - beginn.current) / 1000), zeitUm })

  const werte = useCallback((richtig: boolean) => {
    if (!karte || !offen) return
    ergebnisse.current.push({ id: `kk-${karte.kennung}`, f: 'wortschatz', richtig, woerter: [{ kennung: karte.kennung, richtig }], ms: 0 })
    if (i + 1 >= karten.length) onFertig({ ergebnisse: ergebnisse.current, sekunden: Math.round((Date.now() - beginn.current) / 1000), zeitUm: false })
    else { setI(i + 1); setOffen(false) }
  }, [karte, offen, i, karten.length, onFertig])
  const stand = useRef({ werte, offen })
  stand.current = { werte, offen }
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!stand.current.offen) setOffen(true) }
      else if (e.key === '1') stand.current.werte(false)
      else if (e.key === '2') stand.current.werte(true)
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [])

  if (!karte) return null
  return (
    <div className="pi-lauf" data-pi-karteikarten data-pi-index={i}>
      <div className="pi-lauf-kopf">
        <button type="button" className="pi-knopf pi-knopf-nackt" style={{ padding: 6 }} onClick={() => onAbbruch(ende())} aria-label="Beenden" title="Beenden" data-pi-abbruch><X size={18} /></button>
        <div style={{ flex: 1 }}>
          <div className="pi-reihe pi-klein" style={{ justifyContent: 'space-between', marginBottom: 4 }}><span className="pi-leise" style={{ fontWeight: 700 }}>Karteikarten</span><span className="pi-stumm pi-zahl">{i + 1} von {karten.length}</span></div>
          <div className="pi-balken"><i style={{ width: `${(i / karten.length) * 100}%` }} /></div>
        </div>
      </div>
      <div className="pi-karte pi-wortkarte pi-ein" key={karte.kennung} style={{ minHeight: 300, justifyContent: 'center' }}>
        <span className="pi-ober">Wie heißt das auf Italienisch?</span>
        {karte.w.emoji && <span className="pi-emoji" aria-hidden>{karte.w.emoji}</span>}
        <span className="pi-de" style={{ fontSize: 26, color: 'var(--pi-ink)', fontWeight: 700 }}>{karte.w.de}</span>
        {offen ? (
          <>
            <div className="pi-reihe pi-ein" style={{ justifyContent: 'center' }}>
              <span className="pi-wort" lang="it">{karte.w.it}</span>
              <Laut stelle={{ tag: karte.tag, art: 'w', nr: karte.platz - 1 }} an={ton} langsam={langsam} auto />
            </div>
            <span className="pi-aus">{karte.w.aus}</span>
            <div className="pi-beispiel"><div className="pi-it" lang="it">{karte.w.bsp.it}</div><div className="pi-leise pi-klein">{karte.w.bsp.de}</div></div>
          </>
        ) : <p className="pi-stumm pi-klein">Sprich es dir vor – dann dreh die Karte um.</p>}
      </div>
      {offen ? (
        <div className="pi-reihe" style={{ justifyContent: 'center' }}>
          <button type="button" className="pi-knopf pi-knopf-leise pi-knopf-gross" onClick={() => werte(false)} data-pi-karte-nein><X size={18} />Noch nicht <kbd className="pi-stumm pi-klein">1</kbd></button>
          <button type="button" className="pi-knopf pi-knopf-gruen pi-knopf-gross" onClick={() => werte(true)} data-pi-karte-ja><Check size={18} />Wusste ich <kbd className="pi-klein">2</kbd></button>
        </div>
      ) : (
        <div className="pi-reihe" style={{ justifyContent: 'center' }}>
          <button type="button" className="pi-knopf pi-knopf-gross" onClick={() => setOffen(true)} autoFocus data-pi-karte-drehen><Volume2 size={18} />Umdrehen</button>
        </div>
      )}
    </div>
  )
}
