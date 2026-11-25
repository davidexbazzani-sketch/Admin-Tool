// Anagramme (Sprache): Die Buchstaben eines deutschen Substantivs sind durcheinandergeraten — welches Wort ist es?
// Trainiert den Zugriff auf den Wortschatz und das flexible Umordnen von Buchstaben im Kopf.
//
// Bedienung: Kacheln der Reihe nach anklicken oder die Buchstaben tippen. Ein gelegter Buchstabe geht per Klick
// zurück (oder ⌫ für den letzten, Entf für alle). Sind alle Buchstaben gelegt, wird sofort geprüft.
// Jedes Wort der Liste mit denselben Buchstaben gilt (LAMPE, PALME, AMPEL).
//
// Stufen: Wortlänge 5 (Stufe 1) · 5–6 (2) · 6 (3) · 6–7 (4) · 7 (5) · 7–8 (6) · 8 (7) · 8–9 (8) · 9 (9) · 9–10 (10).
// Training: 8 Wörter, je Wort 25 s (5 Buchstaben) bis 60 s (10 Buchstaben); „Überspringen“ und Zeitablauf zählen
//           als nicht gelöst. Wertung: Anteil gelöster Wörter und Tempo.
// Duell:    genau `dauerSek` Sekunden, endlose Wortfolge aus rng(start) mit 5–6 Buchstaben (für beide Spieler
//           gleich, unabhängig von der Stufe); +10 je gelöstes Wort, −5 je übersprungenes, nie unter 0.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, SkipForward } from 'lucide-react'
import type { FreiProps } from '../../kern/typen'
import { Balken, KopfZeile, Taste, useTasten, useUhr } from '../../ablauf/kit'
import { ANZAHL_TRAINING, duellPunkte, istLoesung, wertung, wortFolge, type Versuch } from './Anagramme.logik'
import './sprache.css'

// Die Logik ist auch von hier aus erreichbar (Tests, Szenen)
export * from './Anagramme.logik'

/** offen = es wird gelegt · falsch = alle Plätze belegt, aber kein Wort · gut = gelöst · zeigen = Lösung wird gezeigt */
type Phase = 'offen' | 'falsch' | 'gut' | 'zeigen'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzäöü'

export function Komponente({ stufe, start, modus, dauerSek, onPunkte, onFertig }: FreiProps) {
  const duell = modus === 'duell'
  const dauer = duell ? dauerSek ?? 60 : undefined
  const folge = useMemo(() => wortFolge(start, stufe, duell), [start, stufe, duell])
  const [nr, setNr] = useState(0)
  const aufgabe = useMemo(() => folge(nr), [folge, nr])
  const n = aufgabe.kacheln.length
  const zeitMs = aufgabe.zeitSek * 1000

  // Der Stand liegt in Refs: Tasten können schneller kommen, als neu gezeichnet wird.
  const gelegt = useRef<number[]>([])
  const phase = useRef<Phase>('offen')
  const versuche = useRef<Versuch[]>([])
  const fertig = useRef(false)
  const wortStart = useRef(performance.now())
  const warte = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, setBild] = useState(0)
  const zeichne = useCallback(() => setBild(x => x + 1), [])
  const punkteNachAussen = useRef(onPunkte)
  punkteNachAussen.current = onPunkte

  const schliesseAb = useCallback(() => {
    if (fertig.current) return
    fertig.current = true
    if (warte.current) clearTimeout(warte.current)
    onFertig(wertung(versuche.current, ANZAHL_TRAINING, dauer))
  }, [dauer, onFertig])

  const rest = useUhr(dauer, schliesseAb)

  const weiter = useCallback(() => {
    warte.current = null
    if (fertig.current) return
    if (!duell && versuche.current.length >= ANZAHL_TRAINING) { schliesseAb(); return }
    gelegt.current = []
    phase.current = 'offen'
    wortStart.current = performance.now()
    setNr(k => k + 1)
  }, [duell, schliesseAb])

  /** Wort abschließen: gelöst, übersprungen oder Zeit abgelaufen */
  const beende = useCallback((geloest: boolean) => {
    if (fertig.current || phase.current === 'gut' || phase.current === 'zeigen') return
    versuche.current.push({ geloest, ms: performance.now() - wortStart.current, zeitMs })
    phase.current = geloest ? 'gut' : 'zeigen'
    punkteNachAussen.current?.(duellPunkte(versuche.current))
    zeichne()
    warte.current = setTimeout(weiter, geloest ? 450 : duell ? 700 : 1500)
  }, [duell, weiter, zeichne, zeitMs])
  const beendeJetzt = useRef(beende)
  beendeJetzt.current = beende

  const darfLegen = () => !fertig.current && (phase.current === 'offen' || phase.current === 'falsch')

  /** Kachel i auf den nächsten freien Platz legen; ist das Wort voll, wird geprüft */
  const lege = (i: number) => {
    if (!darfLegen() || gelegt.current.includes(i) || gelegt.current.length >= n) return
    gelegt.current = [...gelegt.current, i]
    phase.current = 'offen'
    if (gelegt.current.length === n) {
      if (istLoesung(gelegt.current.map(k => aufgabe.kacheln[k]).join(''), aufgabe.wort)) { beende(true); return }
      phase.current = 'falsch'
    }
    zeichne()
  }
  /** getippter Buchstabe: die erste noch freie Kachel mit diesem Buchstaben */
  const tippe = (buchstabe: string) => {
    const i = aufgabe.kacheln.findIndex((b, k) => b === buchstabe && !gelegt.current.includes(k))
    if (i >= 0) lege(i)
  }
  /** gelegten Buchstaben an Platz `platz` zurücknehmen (ohne Angabe: den letzten) */
  const nimm = (platz = gelegt.current.length - 1) => {
    if (!darfLegen() || platz < 0 || platz >= gelegt.current.length) return
    gelegt.current = gelegt.current.filter((_, k) => k !== platz)
    phase.current = 'offen'
    zeichne()
  }
  const leere = () => {
    if (!darfLegen() || !gelegt.current.length) return
    gelegt.current = []
    phase.current = 'offen'
    zeichne()
  }

  // Zeit je Wort (nur Training): abgelaufen = nicht gelöst
  useEffect(() => {
    if (duell) return
    const t = setTimeout(() => beendeJetzt.current(false), zeitMs)
    return () => clearTimeout(t)
  }, [nr, duell, zeitMs])

  // Aufräumen beim Aushängen
  useEffect(() => () => { if (warte.current) clearTimeout(warte.current) }, [])

  const tasten: Record<string, () => void> = { Backspace: () => nimm(), Delete: leere }
  for (const b of ALPHABET) tasten[b] = () => tippe(b.toUpperCase())
  useTasten(tasten)

  const ph = phase.current
  const gesperrt = ph === 'gut' || ph === 'zeigen'
  const kante = n <= 7 ? 60 : n === 8 ? 56 : 50
  const mass = { width: kante, height: kante, fontSize: Math.round(kante * 0.46) }
  const buchstaben = ph === 'zeigen' ? [...aufgabe.wort] : gelegt.current.map(i => aufgabe.kacheln[i])
  const geloest = versuche.current.filter(v => v.geloest).length
  const meldung = ph === 'gut' ? 'Richtig!'
    : ph === 'zeigen' ? `Die Lösung: ${aufgabe.wort}`
      : ph === 'falsch' ? 'Das ergibt kein Wort – nimm Buchstaben zurück und leg sie anders.'
        : ''

  return (
    <div className="bt-lauf" data-bt-frei="anagramme" data-nr={nr} data-phase={ph}>
      <KopfZeile
        links={duell
          ? <span className="bt-chip bt-chip-warm bt-zahl">{rest} s</span>
          : <span className="bt-chip bt-zahl">Wort {Math.min(nr + 1, ANZAHL_TRAINING)} / {ANZAHL_TRAINING}</span>}
        mitte={duell ? <Balken anteil={rest / (dauer || 1)} warm /> : <Balken anteil={versuche.current.length / ANZAHL_TRAINING} />}
        rechts={duell
          ? <span className="bt-chip bt-chip-akzent bt-zahl" data-bt-punkte-lauf>{duellPunkte(versuche.current)} Punkte</span>
          : <span className="bt-chip bt-chip-gut bt-zahl">{geloest} gelöst</span>}
      />
      {duell
        ? <div className="bt-uhr" style={{ visibility: 'hidden' }} />
        : <div className="bt-uhr" aria-hidden="true"><i key={nr} style={{ animation: `bt-uhr-lauf ${zeitMs}ms linear forwards`, animationPlayState: gesperrt ? 'paused' : 'running' }} /></div>}

      <div className="bt-aufgabe">Welches Wort steckt in diesen Buchstaben?</div>

      {/* das Lösungswort */}
      <div key={`p${nr}`} className="bt-ein">
        {/* Rütteln auf einem eigenen Element — sonst liefe beim Zurücknehmen die Einblendung noch einmal */}
        <div className={`bt-sprache-reihe ${ph === 'falsch' ? 'bt-ruettel' : ''}`} data-bt-plaetze aria-label="Dein Wort">
          {Array.from({ length: n }, (_, i) => {
            const b = buchstaben[i]
            return (
              <button key={i} type="button" className="bt-sprache-platz" style={mass} data-bt-platz={i}
                data-voll={b ? '' : undefined} data-naechster={!b && i === buchstaben.length ? '' : undefined}
                data-art={b && ph !== 'offen' ? ph : undefined}
                disabled={!b || gesperrt} onClick={() => nimm(i)}
                aria-label={b ? `${b} zurücknehmen` : `Platz ${i + 1}, leer`}>
                {b ?? ''}
              </button>
            )
          })}
        </div>
      </div>

      <div className="bt-sprache-meldung" data-art={ph === 'offen' ? undefined : ph} data-bt-meldung aria-live="polite">{meldung}</div>

      {/* die gemischten Buchstaben */}
      <div key={`k${nr}`} className="bt-sprache-reihe bt-ein" data-bt-kacheln aria-label="Buchstaben">
        {aufgabe.kacheln.map((b, i) => {
          const weg = ph === 'zeigen' || gelegt.current.includes(i)
          return (
            <button key={i} type="button" className="bt-feld bt-sprache-kachel" style={mass} data-bt-kachel={i} data-buchstabe={b}
              data-matt={weg ? '' : undefined} disabled={weg || gesperrt} onClick={() => lege(i)}
              aria-label={`Buchstabe ${b}`}>
              {b}
            </button>
          )
        })}
      </div>

      <div className="bt-antwortleiste">
        <button type="button" className="bt-knopf bt-knopf-leise" data-bt-leeren disabled={gesperrt || !gelegt.current.length} onClick={leere}>
          <RotateCcw size={15} />Alle zurück
        </button>
        <button type="button" className="bt-knopf bt-knopf-leise" data-bt-ueberspringen disabled={gesperrt} onClick={() => beende(false)}>
          <SkipForward size={15} />Überspringen
        </button>
      </div>

      <div className="bt-sprache-hinweis">
        <span>Kacheln anklicken oder <Taste>A</Taste>–<Taste>Z</Taste> tippen</span>
        <span><Taste>⌫</Taste> letzten Buchstaben zurück</span>
        <span><Taste>Entf</Taste> alle zurück</span>
        <span>{duell ? 'Überspringen kostet 5 Punkte' : 'Überspringen zählt als nicht gelöst'}</span>
      </div>
    </div>
  )
}
