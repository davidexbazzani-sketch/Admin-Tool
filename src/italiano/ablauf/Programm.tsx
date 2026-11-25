// Parla Italiano — das Tagesprogramm: Lektion (rund 10 Minuten) → Tagestest (5 Minuten),
// und nach fünf Lerntagen die große Prüfung mit Level-Aufstieg.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Award, BookOpenCheck, CalendarClock, CheckCircle2, Flame, PartyPopper, RotateCcw, ScrollText, Timer, Trophy } from 'lucide-react'
import type { LevelInhalt, TagInhalt } from '../kern/inhaltTypen'
import { LEVEL_ANZAHL, levelVonTag } from '../kern/inhaltTypen'
import type { Aufgabe, Ergebnis, GewerteteAufgabe, PruefungsTeil } from '../kern/typen'
import { ladeLevel, ladeTag, ladeWoerter, woerterVon, type WortMitOrt } from '../kern/inhalt'
import { baueEsame, baueLezione, baueTagestest, BESTEHEN_AB, TAGESTEST_SEKUNDEN, TEIL_NAME, type PruefAufgabe } from '../kern/aufgaben'
import { faellige } from '../kern/kasten'
import { PUNKTE, useItaliano, type PruefungsQuittung } from '../kern/speicher'
import { PRUEFUNGEN_JE_TAG, tagesStand } from '../kern/stand'
import { serie } from '../kern/serie'
import { heute, tagNummer } from '../kern/zeit'
import { station, AM_ZIEL, REZEPT_TITEL } from '../kern/lehrplan'
import { wecke } from '../kern/ton'
import { hash32 } from '../../brain/kern/zufall'
import Lauf, { type LaufEnde } from './Lauf'
import { fehlgriffe, FehlgriffListe, holeWuensche, Konfetti, Laedt, Stationsbild, Sterne } from './gemeinsam'

/** Wörter des Levels (bis zu diesem Tag) und des Levels davor — Vorrat für falsche Antworten */
async function vorratFuer(tag: number): Promise<WortMitOrt[]> {
  const level = levelVonTag(tag)
  const [jetzt, davor] = await Promise.all([ladeLevel(level), level > 1 ? ladeLevel(level - 1) : Promise.resolve(null)])
  return [...(davor?.tage ?? []), ...(jetzt?.tage.filter(t => t.tag <= tag) ?? [])].flatMap(woerterVon)
}

const Fehler = ({ text, onZurueck }: { text: string; onZurueck: () => void }) => (
  <div className="pi-schmal pi-karte pi-spalte"><h2 className="pi-h2">Das hat nicht geklappt</h2><p className="pi-leise">{text}</p><div><button type="button" className="pi-knopf" onClick={onZurueck}>Zurück</button></div></div>
)

// ── Lektion ─────────────────────────────────────────────────────────────────────────────

export function LektionAblauf({ tag, onEnde, onTest }: { tag: number; onEnde: () => void; onTest: () => void }) {
  const benutzer = useItaliano(s => s.benutzer)
  const [aufgaben, setAufgaben] = useState<Aufgabe[] | null>(null)
  const [inhalt, setInhalt] = useState<TagInhalt | null>(null)
  const [fehler, setFehler] = useState('')
  const [ende, setEnde] = useState<{ richtig: number; gesamt: number; punkte: number } | null>(null)

  useEffect(() => {
    let lebt = true
    void (async () => {
      const [t, vortag, vorrat, w] = await Promise.all([ladeTag(tag), ladeTag(tag - 1), vorratFuer(tag), holeWuensche()])
      if (!lebt) return
      if (!t) { setFehler('Die Inhalte für diesen Lerntag sind nicht vorhanden.'); return }
      setInhalt(t)
      setAufgaben(baueLezione(t, vortag, vorrat, w, hash32(`${benutzer}/${tag}`)))
      useItaliano.getState().lerneWoerter(woerterVon(t).map(x => x.kennung))
      wecke(tag)
    })()
    return () => { lebt = false }
  }, [tag, benutzer])

  const fertig = useCallback((e: LaufEnde) => {
    const z = useItaliano.getState()
    const punkte = z.bucheErgebnisse(e.ergebnisse, e.sekunden)
    z.schliesseLektion(tag)
    void z.sichere()
    setEnde({ richtig: e.ergebnisse.filter(x => x.richtig).length, gesamt: e.ergebnisse.length, punkte: punkte + PUNKTE.lektion })
  }, [tag])
  const abbruch = useCallback((e: LaufEnde) => { useItaliano.getState().bucheErgebnisse(e.ergebnisse, e.sekunden); onEnde() }, [onEnde])

  if (fehler) return <Fehler text={fehler} onZurueck={onEnde} />
  if (!aufgaben || !inhalt) return <Laedt text="Die Lektion wird vorbereitet …" />
  if (ende) return <LektionGeschafft inhalt={inhalt} {...ende} onTest={onTest} onEnde={onEnde} />
  return <Lauf aufgaben={aufgaben} modus="lernen" titel={`Lerntag ${tag}`} onFertig={fertig} onAbbruch={abbruch} />
}

function LektionGeschafft({ inhalt, richtig, gesamt, punkte, onTest, onEnde }: { inhalt: TagInhalt; richtig: number; gesamt: number; punkte: number; onTest: () => void; onEnde: () => void }) {
  const daten = useItaliano(s => s.daten)
  const s = useMemo(() => serie(daten, heute()), [daten])
  const level = levelVonTag(inhalt.tag)
  const imLevel = ((inhalt.tag - 1) % 5) + 1
  return (
    <div className="pi-schmal pi-spalte pi-ein" data-pi-lektion-geschafft>
      <div className="pi-karte pi-spalte" style={{ alignItems: 'center', textAlign: 'center', padding: 28, position: 'relative' }}>
        <Konfetti />
        <span className="pi-stempel pi-stempeln" data-da="1" style={{ width: 86, height: 86, fontSize: 13 }}><span>Tag</span><span style={{ fontSize: 26 }}>{inhalt.tag}</span></span>
        <div className="pi-ober" lang="it">Complimenti!</div>
        <h2 className="pi-h1">Lerntag {inhalt.tag} geschafft</h2>
        <p className="pi-leise">{inhalt.ziel.replace(/^Danach kannst du/, 'Jetzt kannst du')}</p>
        <div className="pi-reihe" style={{ justifyContent: 'center' }}>
          <span className="pi-chip pi-chip-gruen"><CheckCircle2 size={12} />{richtig} von {gesamt} richtig</span>
          <span className="pi-chip pi-chip-akzent">+{punkte} Punkte</span>
          <span className="pi-chip">12 neue Wörter</span>
          {s.aktuell > 0 && <span className="pi-chip pi-chip-gold"><Flame size={12} />{s.aktuell} {s.aktuell === 1 ? 'Tag' : 'Tage'} in Folge</span>}
        </div>
        <div className="pi-reihe" style={{ justifyContent: 'center', gap: 8 }} aria-label={`Lerntag ${imLevel} von 5 in ${station(level).ort}`}>
          {[1, 2, 3, 4, 5].map(i => <span key={i} className="pi-stempel" data-da={i <= imLevel ? '1' : undefined} style={{ width: 34, height: 34 }}>{i}</span>)}
        </div>
      </div>
      <details className="pi-karte" data-pi-neue-woerter>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Deine 12 neuen Wörter zum Nachlesen</summary>
        <div className="pi-raster" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '6px 18px', marginTop: 12 }}>
          {inhalt.woerter.map((w, i) => <div key={i}><span className="pi-it" lang="it" style={{ fontWeight: 700 }}>{w.it}</span> <span className="pi-leise">– {w.de}</span></div>)}
        </div>
        <p className="pi-klein pi-stumm" style={{ marginTop: 10 }}>Sie liegen jetzt in deinem Karteikasten und kommen morgen im Tagestest wieder.</p>
      </details>
      <div className="pi-karte pi-spalte" style={{ gap: 8 }}>
        <div className="pi-ober">Fortsetzung folgt</div>
        <p style={{ fontSize: 16 }}>{inhalt.dialog.folge}</p>
        <p className="pi-klein pi-stumm">{imLevel === 5 ? `Die Antwort gibt es nach der Prüfung in ${station(level).ort}.` : 'Die Antwort gibt es in der nächsten Lektion – ab morgen.'}</p>
      </div>
      <div className="pi-karte pi-reihe" style={{ justifyContent: 'space-between' }}>
        <div className="pi-reihe" style={{ flexWrap: 'nowrap' }}>
          <span className="pi-symbol pi-symbol-blau"><Timer size={18} /></span>
          <div><div className="pi-h3">Jetzt noch der Tagestest</div><div className="pi-leise pi-klein">5 Minuten – er festigt, was du zuletzt gelernt hast.</div></div>
        </div>
        <div className="pi-reihe">
          <button type="button" className="pi-knopf pi-knopf-nackt" onClick={onEnde} data-pi-spaeter>Später</button>
          <button type="button" className="pi-knopf pi-knopf-gross" onClick={onTest} autoFocus data-pi-zum-test>Zum Test<ArrowRight size={18} /></button>
        </div>
      </div>
    </div>
  )
}

// ── Tagestest ───────────────────────────────────────────────────────────────────────────

export function TagestestAblauf({ tag, stoff, onEnde }: { tag: number; stoff: number; onEnde: () => void }) {
  const benutzer = useItaliano(s => s.benutzer)
  const [aufgaben, setAufgaben] = useState<GewerteteAufgabe[] | null>(null)
  const [fehler, setFehler] = useState('')
  const [ende, setEnde] = useState<{ richtig: number; gesamt: number; sterne: number; ergebnisse: Ergebnis[]; zeitUm: boolean } | null>(null)

  useEffect(() => {
    let lebt = true
    void (async () => {
      const d = useItaliano.getState().daten
      const heuteNr = tagNummer(heute())
      // fällig sind ältere Wörter — nicht die von heute und nicht die des Teststoffs
      const kennungen = faellige(d.kasten, heuteNr, k => Math.floor(k / 100) === tag || Math.floor(k / 100) === stoff).slice(0, 6)
      const [t, alt, vorrat, w] = await Promise.all([ladeTag(stoff), ladeWoerter(kennungen), vorratFuer(stoff), holeWuensche()])
      if (!lebt) return
      if (!t) { setFehler('Die Inhalte für diesen Test sind nicht vorhanden.'); return }
      setAufgaben(baueTagestest(t, alt, vorrat, w, hash32(`${benutzer}/test/${tag}/${d.tests.length}`)))
      wecke(stoff)
    })()
    return () => { lebt = false }
  }, [tag, stoff, benutzer])

  const fertig = useCallback((e: LaufEnde) => {
    if (!aufgaben) return
    const z = useItaliano.getState()
    z.bucheErgebnisse(e.ergebnisse, e.sekunden)
    const richtig = e.ergebnisse.filter(x => x.richtig).length
    // was in der Zeit nicht mehr drankam, zählt als nicht gelöst
    const sterne = z.bucheTagestest(tag, richtig, aufgaben.length)
    void z.sichere()
    setEnde({ richtig, gesamt: aufgaben.length, sterne, ergebnisse: e.ergebnisse, zeitUm: e.zeitUm })
  }, [aufgaben, tag])

  if (fehler) return <Fehler text={fehler} onZurueck={onEnde} />
  if (!aufgaben) return <Laedt text="Der Test wird vorbereitet …" />
  if (ende) return <TestErgebnis tag={tag} aufgaben={aufgaben} {...ende} onEnde={onEnde} />
  return <Lauf aufgaben={aufgaben} modus="test" titel="Tagestest" sekunden={TAGESTEST_SEKUNDEN} onFertig={fertig} onAbbruch={onEnde} />
}

function TestErgebnis({ tag, aufgaben, richtig, gesamt, sterne, ergebnisse, zeitUm, onEnde }: { tag: number; aufgaben: GewerteteAufgabe[]; richtig: number; gesamt: number; sterne: number; ergebnisse: Ergebnis[]; zeitUm: boolean; onEnde: () => void }) {
  const daten = useItaliano(s => s.daten)
  const stand = useMemo(() => tagesStand(daten, heute()), [daten])
  const [morgen, setMorgen] = useState<TagInhalt | null>(null)
  useEffect(() => { if (!stand.pruefungOffen && stand.naechsterTag) void ladeTag(stand.naechsterTag).then(setMorgen) }, [stand.pruefungOffen, stand.naechsterTag])
  const liste = useMemo(() => fehlgriffe(aufgaben, ergebnisse), [aufgaben, ergebnisse])
  const wort = sterne === 3 ? 'Eccellente!' : sterne === 2 ? 'Molto bene!' : sterne === 1 ? 'Bene!' : 'Coraggio!'
  return (
    <div className="pi-schmal pi-spalte pi-ein" data-pi-test-ergebnis>
      <div className="pi-karte pi-spalte" style={{ alignItems: 'center', textAlign: 'center', padding: 28 }}>
        <Sterne n={sterne} gross />
        <div className="pi-ober" lang="it">{wort}</div>
        <h2 className="pi-h1 pi-zahl">{richtig} von {gesamt} richtig</h2>
        <p className="pi-leise">{zeitUm ? 'Die Zeit war um – was nicht mehr drankam, zählt als offen. ' : ''}{sterne === 0 ? 'Kein Problem: Die Wörter kommen in den nächsten Tagen von selbst wieder.' : sterne === 3 ? 'Das sitzt.' : 'Was noch wackelt, kommt in den nächsten Tagen wieder.'}</p>
      </div>
      <FehlgriffListe liste={liste} />
      <div className="pi-karte pi-reihe" style={{ justifyContent: 'space-between' }}>
        <div className="pi-reihe" style={{ flexWrap: 'nowrap' }}>
          <span className="pi-symbol pi-symbol-gold">{stand.pruefungOffen ? <Award size={18} /> : <CalendarClock size={18} />}</span>
          {stand.pruefungOffen
            ? <div><div className="pi-h3">Als Nächstes: die Prüfung in {station(stand.pruefungOffen).ort}</div><div className="pi-leise pi-klein">Alle fünf Lerntage sind geschafft. Besteh die Prüfung und hol dir die Rezeptseite.</div></div>
            : <div><div className="pi-h3">Morgen: {morgen ? morgen.titel : 'die nächste Lektion'}</div><div className="pi-leise pi-klein">{morgen ? morgen.ziel : `Lerntag ${tag + 1} öffnet morgen.`}</div></div>}
        </div>
        <button type="button" className="pi-knopf pi-knopf-gross" onClick={onEnde} autoFocus data-pi-fertig>Fertig für heute</button>
      </div>
    </div>
  )
}

// ── Die große Prüfung ───────────────────────────────────────────────────────────────────

const PRUEFUNG_SEKUNDEN = 15 * 60

export function EsameAblauf({ level, onEnde, onUeben }: { level: number; onEnde: () => void; onUeben: () => void }) {
  const [inhalt, setInhalt] = useState<LevelInhalt | null>(null)
  const [aufgaben, setAufgaben] = useState<PruefAufgabe[] | null>(null)
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [ende, setEnde] = useState<{ q: PruefungsQuittung; teile: Partial<Record<PruefungsTeil, [number, number]>>; ergebnisse: Ergebnis[]; richtig: number; gesamt: number } | null>(null)
  const versuch = useRef(useItaliano.getState().daten.pruefungen.filter(p => p.level === level).length)
  const daten = useItaliano(s => s.daten)
  const stand = useMemo(() => tagesStand(daten, heute()), [daten])
  const s = station(level)

  useEffect(() => {
    let lebt = true
    void (async () => {
      const [l, davor, w] = await Promise.all([ladeLevel(level), level > 1 ? ladeLevel(level - 1) : Promise.resolve(null), holeWuensche()])
      if (!lebt) return
      if (!l) { setFehler('Die Inhalte für diese Prüfung sind nicht vorhanden.'); return }
      setInhalt(l)
      setAufgaben(baueEsame(l, (davor?.tage ?? []).flatMap(woerterVon), w, versuch.current))
    })()
    return () => { lebt = false }
  }, [level])

  const fertig = useCallback((e: LaufEnde) => {
    if (!aufgaben) return
    const teile: Partial<Record<PruefungsTeil, [number, number]>> = {}
    const nach = new Map(e.ergebnisse.map(x => [x.id, x.richtig]))
    for (const p of aufgaben) {
      const t = teile[p.teil] ?? [0, 0]
      teile[p.teil] = [t[0] + (nach.get(p.a.id) ? 1 : 0), t[1] + 1]
    }
    const richtig = e.ergebnisse.filter(x => x.richtig).length
    const z = useItaliano.getState()
    z.bucheErgebnisse(e.ergebnisse, e.sekunden)
    const q = z.buchePruefung(level, richtig, aufgaben.length, teile)
    setEnde({ q, teile, ergebnisse: e.ergebnisse, richtig, gesamt: aufgaben.length })
  }, [aufgaben, level])

  if (fehler) return <Fehler text={fehler} onZurueck={onEnde} />
  if (!aufgaben || !inhalt) return <Laedt text="Die Prüfung wird vorbereitet …" />

  if (ende) {
    return ende.q.ok
      ? <Bestanden level={level} richtig={ende.richtig} gesamt={ende.gesamt} aufstieg={ende.q.aufstieg} onEnde={onEnde} />
      : <NichtBestanden level={level} richtig={ende.richtig} gesamt={ende.gesamt} teile={ende.teile} liste={fehlgriffe(aufgaben.map(p => p.a), ende.ergebnisse)} nochEinVersuch={stand.versucheHeute < PRUEFUNGEN_JE_TAG} onEnde={onEnde} onUeben={onUeben} />
  }

  if (laeuft) {
    return <Lauf aufgaben={aufgaben.map(p => p.a)} modus="test" titel={`Prüfung · ${s.ort}`} sekunden={PRUEFUNG_SEKUNDEN} abschnitt={i => (aufgaben[i] ? TEIL_NAME[aufgaben[i].teil] : undefined)} onFertig={fertig} onAbbruch={onEnde} />
  }

  const gesperrt = stand.versucheHeute >= PRUEFUNGEN_JE_TAG
  return (
    <div className="pi-schmal pi-spalte pi-ein" data-pi-esame-start>
      <Stationsbild level={level} kinder={<span className="pi-chip pi-chip-gold">Level {level}</span>} />
      <div className="pi-karte pi-spalte">
        <div><div className="pi-ober" lang="it">L'esame</div><h2 className="pi-h1">Die Prüfung in {s.ort}</h2></div>
        <p>Alle fünf Lerntage in {s.ort} sind geschafft. Jetzt zeigst du, was hängen geblieben ist – wer besteht, steigt auf Level {level + 1 > LEVEL_ANZAHL ? 'B1' : level + 1} auf und bekommt die Rezeptseite dieser Station.</p>
        <ul className="pi-liste pi-leise">
          <li>{aufgaben.length} Aufgaben in fünf Teilen: {Object.values(TEIL_NAME).join(', ')}</li>
          <li>Höchstens 15 Minuten, bestanden ab {Math.round(BESTEHEN_AB * 100)} %</li>
          <li>Höchstens {PRUEFUNGEN_JE_TAG} Versuche am Tag – jeder Versuch hat andere Aufgaben</li>
        </ul>
        {gesperrt
          ? <p className="pi-karte-flach">Für heute sind beide Versuche verbraucht. Morgen geht es weiter – bis dahin hilft das freie Training.</p>
          : <div className="pi-reihe" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="pi-knopf pi-knopf-nackt" onClick={onEnde}>Später</button>
              <button type="button" className="pi-knopf pi-knopf-gross" onClick={() => setLaeuft(true)} autoFocus data-pi-esame-los>Prüfung beginnen<ArrowRight size={18} /></button>
            </div>}
        {gesperrt && <div className="pi-reihe" style={{ justifyContent: 'flex-end' }}><button type="button" className="pi-knopf pi-knopf-leise" onClick={onEnde}>Zurück</button><button type="button" className="pi-knopf" onClick={onUeben}>Zum Training</button></div>}
      </div>
    </div>
  )
}

function Bestanden({ level, richtig, gesamt, aufstieg, onEnde }: { level: number; richtig: number; gesamt: number; aufstieg: boolean; onEnde: () => void }) {
  const s = station(level)
  const amZiel = level + 1 >= AM_ZIEL
  const weiter = amZiel ? null : station(level + 1)
  return (
    <div className="pi-schmal pi-spalte pi-ein" data-pi-bestanden>
      <Stationsbild level={level} kinder={<span className="pi-chip pi-chip-gold"><Trophy size={12} />bestanden</span>} />
      <div className="pi-karte pi-spalte" style={{ textAlign: 'center', alignItems: 'center', position: 'relative' }}>
        <Konfetti />
        <span className="pi-symbol pi-symbol-gold pi-aufploppen" style={{ width: 56, height: 56, borderRadius: 18 }}><PartyPopper size={28} /></span>
        <div className="pi-ober" lang="it">{amZiel ? 'Ce l\'hai fatta!' : 'Promosso!'}</div>
        <h2 className="pi-h1">{amZiel ? 'Du bist am Ziel' : aufstieg ? `Aufstieg auf Level ${level + 1}` : 'Prüfung bestanden'}</h2>
        <p className="pi-leise pi-zahl">{richtig} von {gesamt} richtig ({Math.round((richtig / gesamt) * 100)} %){aufstieg ? ` · +${PUNKTE.pruefung} Punkte · ein Joker für die Serie` : ''}</p>
      </div>
      <div className="pi-karte pi-spalte" style={{ gap: 8 }} data-pi-rezeptseite>
        <div className="pi-reihe"><span className="pi-symbol"><ScrollText size={18} /></span><div><div className="pi-ober">Rezeptseite {level} von {LEVEL_ANZAHL}</div><div className="pi-h3 pi-it" lang="it">{REZEPT_TITEL.it}</div></div></div>
        <p className="pi-it" lang="it" style={{ fontSize: 19, fontWeight: 700 }}>{s.seite.it}</p>
        <p className="pi-leise">{s.seite.de}</p>
      </div>
      <div className="pi-karte pi-reihe" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="pi-h3">{amZiel ? 'Das Rezept ist vollständig – und du sprichst Italienisch.' : `Nächste Station: ${weiter!.ort}`}</div>
          <div className="pi-leise pi-klein">{amZiel ? 'Das freie Training und alle Tests bleiben offen.' : `${weiter!.thema} – die erste Lektion dort wartet schon.`}</div>
        </div>
        <button type="button" className="pi-knopf pi-knopf-gross" onClick={onEnde} autoFocus data-pi-fertig>Weiter<ArrowRight size={18} /></button>
      </div>
    </div>
  )
}

function NichtBestanden({ level, richtig, gesamt, teile, liste, nochEinVersuch, onEnde, onUeben }: { level: number; richtig: number; gesamt: number; teile: Partial<Record<PruefungsTeil, [number, number]>>; liste: ReturnType<typeof fehlgriffe>; nochEinVersuch: boolean; onEnde: () => void; onUeben: () => void }) {
  const fehlt = Math.ceil(gesamt * BESTEHEN_AB) - richtig
  return (
    <div className="pi-schmal pi-spalte pi-ein" data-pi-nicht-bestanden>
      <div className="pi-karte pi-spalte">
        <div><div className="pi-ober" lang="it">Quasi!</div><h2 className="pi-h1">Noch nicht ganz</h2></div>
        <p className="pi-zahl">{richtig} von {gesamt} richtig ({Math.round((richtig / gesamt) * 100)} %) – es {fehlt === 1 ? 'fehlt eine richtige Antwort' : `fehlen ${fehlt} richtige Antworten`} bis {Math.round(BESTEHEN_AB * 100)} %.</p>
        <div className="pi-spalte" style={{ gap: 8 }}>
          {(Object.keys(TEIL_NAME) as PruefungsTeil[]).filter(t => teile[t]).map(t => {
            const [r, n] = teile[t]!
            const q = n ? r / n : 0
            return (
              <div key={t} className="pi-reihe" style={{ flexWrap: 'nowrap' }}>
                <span style={{ width: 96, fontWeight: 700 }}>{TEIL_NAME[t]}</span>
                <div className={`pi-balken ${q >= BESTEHEN_AB ? 'pi-balken-gruen' : ''}`} style={{ flex: 1 }}><i style={{ width: `${Math.round(q * 100)}%` }} /></div>
                <span className="pi-zahl pi-leise" style={{ width: 52, textAlign: 'right' }}>{r}/{n}</span>
              </div>
            )
          })}
        </div>
        <p className="pi-leise">{nochEinVersuch ? 'Sieh dir an, was nicht geklappt hat, übe kurz – und versuch es noch einmal. Der zweite Versuch hat andere Aufgaben.' : 'Für heute sind beide Versuche verbraucht. Morgen klappt es – das Level bleibt dir erhalten.'}</p>
        <div className="pi-reihe" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="pi-knopf pi-knopf-leise" onClick={onEnde} data-pi-fertig>Zurück</button>
          <button type="button" className="pi-knopf" onClick={onUeben} data-pi-ueben><BookOpenCheck size={16} />Gezielt üben</button>
        </div>
      </div>
      <FehlgriffListe liste={liste} />
      <p className="pi-klein pi-stumm pi-reihe"><RotateCcw size={13} />Level {level}: Du kannst die Prüfung so oft wiederholen, wie du willst – höchstens {PRUEFUNGEN_JE_TAG} Versuche am Tag.</p>
    </div>
  )
}
