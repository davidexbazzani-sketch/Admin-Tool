// Nonogramm (Rätsel): Die Zahlen an Zeilen und Spalten nennen die Längen der gefüllten Blöcke —
// daraus das Bild erschließen. Trainiert logisches Kombinieren von Bedingungen aus zwei Richtungen.
//
// Stufen: 5×5 (Stufe 1–3), 8×8 (4–6), 10×10 (7–10); mit jeder Stufe weniger gefüllte Felder (zerstückeltere
//         Blöcke). Jedes Bild ist eindeutig und ohne Raten lösbar. Tabelle, Erzeugung und Wertung stehen in
//         Nonogramm.logik.ts. Ein Rätsel je Durchgang; 8×8 und 10×10 dauern länger.
// Bedienung: Linksklick füllt ein Feld, Rechtsklick markiert es als leer (×); derselbe Klick nochmal
//            nimmt es zurück. Mit gedrückter Maustaste über mehrere Felder ziehen. Ohne rechte Maustaste:
//            Umschalter „Füllen / Leer“ oder Taste X. Erfüllte Zeilen und Spalten werden blasser.
//            Fehler werden nicht angezeigt — fertig ist das Rätsel, wenn das Bild stimmt.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Flag } from 'lucide-react'
import type { FreiProps, Rohergebnis } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { Balken, KopfZeile, Taste, useStoppuhr, useTasten } from '../../ablauf/kit'
import { nonoAufgabeLeistung, nonoErzeuge, nonoGleich, nonoHinweise, nonoLeistung } from './Nonogramm.logik'
import './raetsel.css'

const zeitText = (sek: number): string => `${Math.floor(sek / 60)}:${String(Math.floor(sek % 60)).padStart(2, '0')}`

/** Laufende Zeit — eigenes Bauteil, damit nicht das ganze Brett zehnmal je Sekunde neu gezeichnet wird. */
function Uhr({ aktiv }: { aktiv: boolean }) {
  const sek = useStoppuhr(aktiv)
  return <span className="bt-chip bt-chip-akzent bt-zahl" data-bt-zeit>{zeitText(sek)}</span>
}

/** „Aufgeben“ mit Rückfrage: erst der zweite Klick (innerhalb von 3 s) gilt. */
function AufgebenKnopf({ onAufgeben, gesperrt }: { onAufgeben: () => void; gesperrt?: boolean }) {
  const [sicher, setSicher] = useState(false)
  useEffect(() => { if (!sicher) return; const t = setTimeout(() => setSicher(false), 3000); return () => clearTimeout(t) }, [sicher])
  return (
    <button type="button" className="bt-knopf bt-knopf-leise bt-raetsel-klein" disabled={gesperrt} data-bt-aufgeben
      onClick={() => { if (sicher) { setSicher(false); onAufgeben() } else setSicher(true) }}>
      <Flag size={14} />{sicher ? 'Wirklich aufgeben?' : 'Aufgeben'}
    </button>
  )
}

/** Zustand eines Felds: 0 offen · 1 gefüllt · 2 als leer markiert */
type Zustand = 0 | 1 | 2

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const raetsel = useMemo(() => nonoErzeuge(rng(start), stufe), [start, stufe])
  const { n, bild, zeilen, spalten } = raetsel
  const sollGefuellt = useMemo(() => bild.reduce((a, b) => a + b, 0), [bild])

  const [zellen, setZellen] = useState<Zustand[]>(() => new Array(n * n).fill(0))
  const stand = useRef(zellen)                       // immer der neueste Stand (mehrere Felder je Ziehen)
  const [kreuzModus, setKreuzModus] = useState(false)
  const [schwebe, setSchwebe] = useState(-1)
  const [ende, setEnde] = useState<null | 'geloest' | 'aufgegeben'>(null)
  /** laufendes Ziehen: welche Art wird gemalt (1/2) und wird gesetzt oder gelöscht */
  const zug = useRef<{ art: 1 | 2; setzen: boolean } | null>(null)
  const fehler = useRef(0)
  const beginn = useRef(performance.now())
  const fertig = useRef(false)
  const zeitgeber = useRef<ReturnType<typeof setTimeout>>()
  const melde = useRef(onFertig)
  melde.current = onFertig

  useEffect(() => {
    const los = () => { zug.current = null }
    window.addEventListener('mouseup', los)
    window.addEventListener('blur', los)
    return () => { window.removeEventListener('mouseup', los); window.removeEventListener('blur', los); clearTimeout(zeitgeber.current) }
  }, [])

  const schliesse = (art: 'geloest' | 'aufgegeben', z: Zustand[]) => {
    if (fertig.current) return
    fertig.current = true
    zug.current = null
    const ms = performance.now() - beginn.current
    let richtig = 0, falsch = 0
    z.forEach((w, i) => { if (w === 1) { if (bild[i]) richtig++; else falsch++ } })
    const roh: Rohergebnis = art === 'geloest'
      ? {
        leistung: nonoLeistung(stufe, ms, fehler.current), richtig: sollGefuellt, gesamt: sollGefuellt,
        text: `${n}×${n} gelöst in ${zeitText(ms / 1000)} min${fehler.current ? ` · ${fehler.current}× falsch gefüllt` : ''}`,
      }
      : { leistung: nonoAufgabeLeistung(richtig, falsch, sollGefuellt), richtig, gesamt: sollGefuellt, text: `${n}×${n} aufgegeben nach ${zeitText(ms / 1000)} min` }
    setEnde(art)
    zeitgeber.current = setTimeout(() => melde.current(roh), art === 'geloest' ? 1500 : 3500)
  }

  /** Feld i auf `neu` setzen; prüft danach, ob das Bild stimmt */
  const aendere = (i: number, neu: Zustand) => {
    const alt = stand.current
    if (alt[i] === neu) return
    const z = alt.slice()
    z[i] = neu
    if (neu === 1 && !bild[i]) fehler.current++
    stand.current = z
    setZellen(z)
    if (z.every((w, k) => (w === 1) === (bild[k] === 1))) schliesse('geloest', z)
  }

  /** Beginn eines Klicks/Ziehens auf Feld i mit der Art 1 (füllen) oder 2 (leer markieren) */
  const beginne = (i: number, art: 1 | 2, ziehen: boolean) => {
    if (ende) return
    const setzen = stand.current[i] !== art           // derselbe Klick nochmal nimmt zurück
    zug.current = ziehen ? { art, setzen } : null
    aendere(i, setzen ? art : 0)
  }
  /** beim Ziehen: nur offene Felder bemalen bzw. nur Felder der gleichen Art löschen */
  const ziehe = (i: number) => {
    const z = zug.current
    if (!z || ende) return
    const w = stand.current[i]
    if (z.setzen ? w === 0 : w === z.art) aendere(i, z.setzen ? z.art : 0)
  }

  useTasten({ x: () => setKreuzModus(m => !m) }, ende === null)

  const kante = n === 10 ? 38 : n === 8 ? 46 : 60
  const block = n === 8 ? 4 : 5
  const maxZ = Math.max(1, ...zeilen.map(h => h.length)), maxS = Math.max(1, ...spalten.map(h => h.length))
  const links = maxZ * 19 + 12, oben = maxS * 17 + 10
  const ist = (z: Zustand[], i: number) => (z[i] === 1 ? 1 : 0)
  const zeileErfuellt = zeilen.map((h, z) => nonoGleich(nonoHinweise(Array.from({ length: n }, (_, s) => ist(zellen, z * n + s))), h))
  const spalteErfuellt = spalten.map((h, s) => nonoGleich(nonoHinweise(Array.from({ length: n }, (_, z) => ist(zellen, z * n + s))), h))
  const gefuellt = zellen.reduce<number>((a, w) => a + (w === 1 ? 1 : 0), 0)
  const linienFertig = zeileErfuellt.filter(Boolean).length + spalteErfuellt.filter(Boolean).length
  const sz = schwebe >= 0 ? Math.floor(schwebe / n) : -1, ss = schwebe >= 0 ? schwebe % n : -1

  return (
    <div className="bt-lauf" data-bt-frei="nonogramm" data-ende={ende ?? undefined}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">{n}×{n} · {linienFertig} / {2 * n} Linien</span>}
        mitte={<Balken anteil={linienFertig / (2 * n)} />}
        rechts={<Uhr aktiv={ende === null} />}
      />
      <div className="bt-raetsel-buehne" data-mittig>
        <div className="bt-raetsel-nono" style={{ gridTemplateColumns: `${links}px auto`, gridTemplateRows: `${oben}px auto` }}
          onMouseLeave={() => setSchwebe(-1)} onContextMenu={e => e.preventDefault()}>
          <div />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, ${kante}px)`, paddingLeft: 2 }}>
            {spalten.map((h, s) => (
              <div key={s} className="bt-raetsel-nh" data-oben data-spalte={s} data-erfuellt={spalteErfuellt[s] ? '' : undefined}
                style={!ende && s === ss && !spalteErfuellt[s] ? { color: 'var(--bt-akzent-stark)' } : undefined}>
                {(h.length ? h : [0]).map((w, k) => <span key={k}>{w}</span>)}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateRows: `repeat(${n}, ${kante}px)`, paddingTop: 2 }}>
            {zeilen.map((h, z) => (
              <div key={z} className="bt-raetsel-nh" data-links data-zeile={z} data-erfuellt={zeileErfuellt[z] ? '' : undefined}
                style={!ende && z === sz && !zeileErfuellt[z] ? { color: 'var(--bt-akzent-stark)' } : undefined}>
                {(h.length ? h : [0]).map((w, k) => <span key={k}>{w}</span>)}
              </div>
            ))}
          </div>
          <div className={`bt-raetsel-nfeld ${ende === 'geloest' ? 'bt-blitz-gut' : ''}`} data-bt-nono
            style={{ gridTemplateColumns: `repeat(${n}, ${kante}px)`, gridAutoRows: kante }}>
            {zellen.map((w, i) => {
              const z = Math.floor(i / n), s = i % n
              const zeigeLoesung = ende === 'aufgegeben'
              return (
                <button key={i} type="button" className="bt-raetsel-nz" data-i={i}
                  data-z={zeigeLoesung ? (bild[i] && w === 1 ? 1 : 0) : w}
                  data-falsch={zeigeLoesung && w === 1 && !bild[i] ? '' : undefined}
                  data-fehlt={zeigeLoesung && w !== 1 && bild[i] ? '' : undefined}
                  data-dr={(s + 1) % block === 0 && s < n - 1 ? '' : undefined} data-du={(z + 1) % block === 0 && z < n - 1 ? '' : undefined}
                  data-rr={s === n - 1 ? '' : undefined} data-ru={z === n - 1 ? '' : undefined}
                  aria-label={`Zeile ${z + 1}, Spalte ${s + 1}: ${w === 1 ? 'gefüllt' : w === 2 ? 'leer markiert' : 'offen'}`}
                  onMouseDown={e => {
                    if (e.button !== 0 && e.button !== 2) return
                    e.preventDefault()
                    beginne(i, (e.button === 2) !== kreuzModus ? 2 : 1, true)
                  }}
                  onMouseOver={() => { if (schwebe !== i) setSchwebe(i); ziehe(i) }}
                  // Tastatur (Enter/Leertaste auf dem Feld): wie ein einzelner Linksklick. Mausklicks kommen schon über onMouseDown.
                  onClick={e => { if (e.detail === 0) beginne(i, kreuzModus ? 2 : 1, false) }}
                />
              )
            })}
          </div>
        </div>

        <div className="bt-raetsel-seite">
          <div className="bt-raetsel-modus" role="group" aria-label="Was macht der Linksklick?">
            <button type="button" aria-pressed={!kreuzModus} onClick={() => setKreuzModus(false)} disabled={!!ende} data-bt-modus="fuellen">
              <span className="bt-raetsel-probe" data-voll />Füllen
            </button>
            <button type="button" aria-pressed={kreuzModus} onClick={() => setKreuzModus(true)} disabled={!!ende} data-bt-modus="kreuz">
              <span className="bt-raetsel-probe" />Leer ×
            </button>
          </div>
          <div className="bt-raetsel-wert"><span>gefüllt</span><b data-bt-gefuellt>{gefuellt}<span className="bt-stumm" style={{ fontSize: 13 }}> / {sollGefuellt}</span></b></div>
          {ende === 'geloest' && <span className="bt-raetsel-meldung bt-ein" data-art="gut" data-bt-geloest style={{ justifyContent: 'center' }}><Check size={16} />Gelöst!</span>}
          {ende === 'aufgegeben' && <span className="bt-raetsel-meldung bt-ein" data-art="leise" style={{ justifyContent: 'center', textAlign: 'center' }}>So sieht das Bild aus.</span>}
          {!ende && (
            <div className="bt-raetsel-hinweis" style={{ textAlign: 'left' }}>
              Die Zahlen nennen die Längen der gefüllten Blöcke in dieser Reihenfolge; dazwischen ist mindestens ein Feld leer.<br />
              Linksklick füllt, Rechtsklick markiert „leer“. Ziehen malt mehrere Felder. <Taste>X</Taste> tauscht die Maustasten.
            </div>
          )}
          <AufgebenKnopf onAufgeben={() => schliesse('aufgegeben', stand.current)} gesperrt={!!ende} />
        </div>
      </div>
    </div>
  )
}
