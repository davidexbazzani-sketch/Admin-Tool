// Zielzahl (Zahlen): Aus den gegebenen Zahlen mit + − · : die Zielzahl bilden.
// Zwei Zahlen und ein Rechenzeichen wählen → sie verschmelzen zum Ergebnis. Nicht alle Zahlen
// müssen benutzt werden. Trainiert flexibles Kombinieren und Vorausplanen mit Zahlen.
//
// Stufe 1–3: drei Zahlen, Ziel bis 40 · 4–7: vier Zahlen, Ziel bis 120 · 8–10: fünf Zahlen
// (darunter eine große), Ziel bis 400. Vier Aufgaben je Durchgang, Zeit je Aufgabe 75–120 s.
// Jede Aufgabe ist lösbar: das Ziel entsteht beim Erzeugen aus einer echten Rechnung.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, SkipForward, Undo2 } from 'lucide-react'
import type { FreiProps } from '../../kern/typen'
import { rng, type Rng } from '../../kern/zufall'
import { guete, tempoAus } from '../../kern/wertung'
import { Balken, KopfZeile, useUhr } from '../../ablauf/kit'

export type Zeichen = '+' | '−' | '·' | ':'
export interface ZielAufgabe { zahlen: number[]; ziel: number; loesung: string[] }
export const AUFGABEN_JE_DURCHGANG = 4

const s10 = (stufe: number) => Math.max(1, Math.min(10, Math.round(stufe)))
export const zeitJeAufgabe = (stufe: number): number => (s10(stufe) <= 3 ? 75 : s10(stufe) <= 7 ? 100 : 120)

/** Rechnen nach den Spielregeln: nur ganze Ergebnisse ≥ 0; teilen nur ohne Rest und nicht durch 0. */
export function verknuepfe(a: number, z: Zeichen, b: number): number | null {
  if (z === '+') return a + b
  if (z === '−') return a - b >= 0 ? a - b : null
  if (z === '·') return a * b
  return b !== 0 && a % b === 0 ? a / b : null
}

export function erzeugeZiel(r: Rng, stufe: number): ZielAufgabe {
  const s = s10(stufe)
  const n = s <= 3 ? 3 : s <= 7 ? 4 : 5
  const zielMax = s <= 3 ? 40 : s <= 7 ? 120 : 400
  const zielMin = s <= 3 ? 8 : s <= 7 ? 15 : 40
  for (let versuch = 0; versuch < 300; versuch++) {
    const zahlen = Array.from({ length: n }, () => r.int(1, s <= 3 ? 9 : 10))
    if (s >= 8) zahlen[0] = r.aus([15, 20, 25, 50])
    // echte Rechnung: Zahlen der Reihe nach zufällig verknüpfen (mindestens n−1 Zahlen benutzen)
    const stapel = r.misch(zahlen)
    const benutze = s <= 3 ? n : r.int(n - 1, n)
    let stand = stapel[0]
    const weg: string[] = []
    let ok = true
    for (let i = 1; i < benutze; i++) {
      const b = stapel[i]
      const zeichen = r.misch(['+', '−', '·', ':', '·', '+'] as Zeichen[])
      let gefunden = false
      for (const z of zeichen) {
        // größere Zahl zuerst, damit minus/geteilt möglich sind
        const [x, y] = z === '−' || z === ':' ? [Math.max(stand, b), Math.min(stand, b)] : [stand, b]
        const e = verknuepfe(x, z, y)
        if (e === null || e > zielMax * 2 || (z === ':' && y === 1) || (z === '·' && (x === 1 || y === 1))) continue
        weg.push(`${x} ${z} ${y} = ${e}`); stand = e; gefunden = true
        break
      }
      if (!gefunden) { ok = false; break }
    }
    // Ziel darf keine der gegebenen Zahlen sein und soll mindestens eine Mal- oder Geteilt-Rechnung brauchen (ab Stufe 4)
    if (!ok || stand < zielMin || stand > zielMax || zahlen.includes(stand)) continue
    if (s >= 4 && !weg.some(w => w.includes('·') || w.includes(':'))) continue
    return { zahlen, ziel: stand, loesung: weg }
  }
  return { zahlen: [2, 3, 4], ziel: 14, loesung: ['3 · 4 = 12', '12 + 2 = 14'] }
}

interface Kachel { id: number; wert: number }
interface Zustand { kacheln: Kachel[]; verlauf: string[] }

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const [nr, setNr] = useState(0)
  const aufgabe = useMemo(() => erzeugeZiel(rng(start).zweig(nr), stufe), [start, nr, stufe])
  const anfang = useMemo<Zustand>(() => ({ kacheln: aufgabe.zahlen.map((wert, id) => ({ id, wert })), verlauf: [] }), [aufgabe])
  const [stapel, setStapel] = useState<Zustand[]>([anfang])
  const [erste, setErste] = useState<number | null>(null)
  const [zeichen, setZeichen] = useState<Zeichen | null>(null)
  const [meldung, setMeldung] = useState('')
  const [aufgeloest, setAufgeloest] = useState<null | 'geschafft' | 'zeit'>(null)
  const geloest = useRef(0)
  const zeiten = useRef<number[]>([])
  const beginn = useRef(performance.now())
  const fertig = useRef(false)
  const naechsteId = useRef(100)
  const limit = zeitJeAufgabe(stufe)

  useEffect(() => { setStapel([anfang]); setErste(null); setZeichen(null); setMeldung(''); setAufgeloest(null); beginn.current = performance.now() }, [anfang])

  const stand = stapel[stapel.length - 1]

  const weiter = useCallback(() => {
    if (fertig.current) return
    if (nr + 1 >= AUFGABEN_JE_DURCHGANG) {
      fertig.current = true
      const mittel = zeiten.current.length ? zeiten.current.reduce((a, b) => a + b, 0) / zeiten.current.length : limit * 1000
      onFertig({
        leistung: guete(geloest.current / AUFGABEN_JE_DURCHGANG, tempoAus(mittel, 15000, limit * 1000)),
        richtig: geloest.current, gesamt: AUFGABEN_JE_DURCHGANG,
        text: zeiten.current.length ? `Ø ${Math.round(mittel / 1000)} s je gelöster Aufgabe` : undefined,
      })
      return
    }
    setNr(n => n + 1)
  }, [nr, onFertig, limit])

  const zeitUm = useCallback(() => { if (!aufgeloest) setAufgeloest('zeit') }, [aufgeloest])
  const rest = useUhr(limit, zeitUm, !aufgeloest)
  // useUhr läuft je Aufgabe neu an, weil sich `aktiv` beim Wechsel ändert (aufgeloest → null)

  useEffect(() => {
    if (!aufgeloest) return
    const t = setTimeout(weiter, aufgeloest === 'geschafft' ? 1100 : 4200)
    return () => clearTimeout(t)
  }, [aufgeloest, weiter])

  const waehleKachel = (k: Kachel) => {
    if (aufgeloest) return
    setMeldung('')
    if (erste === null || zeichen === null) { setErste(erste === k.id ? null : k.id); return }
    if (k.id === erste) { setErste(null); setZeichen(null); return }
    const a = stand.kacheln.find(x => x.id === erste) as Kachel
    const e = verknuepfe(a.wert, zeichen, k.wert)
    if (e === null) {
      setMeldung(zeichen === ':' ? 'Geht nicht ohne Rest.' : 'Das Ergebnis wäre kleiner als 0.')
      setZeichen(null)
      return
    }
    const neu: Zustand = {
      kacheln: [...stand.kacheln.filter(x => x.id !== a.id && x.id !== k.id), { id: naechsteId.current++, wert: e }],
      verlauf: [...stand.verlauf, `${a.wert} ${zeichen} ${k.wert} = ${e}`],
    }
    setStapel(s => [...s, neu]); setErste(null); setZeichen(null)
    if (e === aufgabe.ziel) {
      geloest.current++
      zeiten.current.push(performance.now() - beginn.current)
      setAufgeloest('geschafft')
    }
  }

  return (
    <div className="bt-lauf" data-bt-frei="zielzahl" data-nr={nr} data-zustand={aufgeloest ?? 'offen'}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">Aufgabe {nr + 1} / {AUFGABEN_JE_DURCHGANG}</span>}
        mitte={<Balken anteil={rest / limit} warm />}
        rechts={<span className="bt-chip bt-chip-warm bt-zahl">{rest} s</span>}
      />
      <div className="bt-aufgabe">Bilde die Zielzahl <span className="bt-zahl" style={{ color: 'var(--bt-akzent-stark)', fontSize: 34, marginLeft: 8 }} data-bt-ziel>{aufgabe.ziel}</span></div>

      <div className="bt-antwortleiste" style={{ minHeight: 78 }} data-bt-kacheln>
        {stand.kacheln.map(k => (
          <button key={k.id} type="button" className="bt-feld" style={{ width: 84, height: 72, fontSize: 28 }}
            data-an={erste === k.id ? '' : undefined} data-gut={aufgeloest === 'geschafft' && k.wert === aufgabe.ziel ? '' : undefined}
            data-wert={k.wert} disabled={!!aufgeloest} onClick={() => waehleKachel(k)}>{k.wert}</button>
        ))}
      </div>
      <div className="bt-antwortleiste" data-bt-zeichen>
        {(['+', '−', '·', ':'] as Zeichen[]).map(z => (
          <button key={z} type="button" className="bt-feld" style={{ width: 62, height: 54, fontSize: 24 }}
            data-an={zeichen === z ? '' : undefined} data-zeichen={z} disabled={erste === null || !!aufgeloest}
            onClick={() => { setMeldung(''); setZeichen(zeichen === z ? null : z) }}>{z}</button>
        ))}
      </div>

      <div className="bt-leise bt-klein" style={{ minHeight: 20, textAlign: 'center' }} data-bt-hinweis>
        {aufgeloest === 'geschafft' ? <b style={{ color: 'var(--bt-gut)' }}>Geschafft!</b>
          : aufgeloest === 'zeit' ? <span><b style={{ color: 'var(--bt-schlecht)' }}>Eine Lösung:</b> {aufgabe.loesung.join(' · dann ')}</span>
            : meldung ? <span style={{ color: 'var(--bt-schlecht)' }}>{meldung}</span>
              : erste === null ? 'Wähle eine Zahl' : zeichen === null ? 'Wähle ein Rechenzeichen' : 'Wähle die zweite Zahl'}
      </div>
      {stand.verlauf.length > 0 && <div className="bt-klein bt-stumm bt-zahl" data-bt-verlauf>{stand.verlauf.join('   ·   ')}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="bt-knopf bt-knopf-leise" disabled={stapel.length <= 1 || !!aufgeloest} onClick={() => { setStapel(s => s.slice(0, -1)); setErste(null); setZeichen(null); setMeldung('') }} data-bt-zurueck-schritt><Undo2 size={15} />Schritt zurück</button>
        <button type="button" className="bt-knopf bt-knopf-leise" disabled={stapel.length <= 1 || !!aufgeloest} onClick={() => { setStapel([anfang]); setErste(null); setZeichen(null); setMeldung('') }}><RotateCcw size={15} />Von vorn</button>
        <button type="button" className="bt-knopf bt-knopf-nackt" disabled={!!aufgeloest} onClick={() => setAufgeloest('zeit')} data-bt-ueberspringen><SkipForward size={15} />Überspringen</button>
      </div>
    </div>
  )
}
