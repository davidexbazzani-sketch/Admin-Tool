// Sudoku (Rätsel): Jede Ziffer genau einmal je Zeile, Spalte und Kästchen.
// Trainiert schlussfolgerndes Ausschließen und das Halten mehrerer Bedingungen zugleich.
//
// Stufen: 4×4 (Stufe 1–2), 6×6 mit Kästchen 2×3 (3–5), 9×9 (6–10); mit jeder Stufe weniger Vorgaben.
//         Bis Stufe 8 genügen Einzelschritte, ab 9 können Notizen nötig sein. Die genaue Tabelle,
//         Erzeugung und Wertung stehen in Sudoku.logik.ts. Ein Rätsel je Durchgang; 9×9 dauert länger.
// Bedienung: Feld anklicken, dann Ziffer (Ziffernfeld rechts oder Tasten 1–9). Pfeiltasten wandern,
//            Entf/Rück löscht, Z nimmt den letzten Schritt zurück, N schaltet Notizen (kleine Merkziffern,
//            ab 6×6). Doppelte Ziffern in Zeile, Spalte oder Kästchen werden rot markiert.
//            „Aufgeben“ zeigt kurz die Lösung.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Eraser, Flag, Pencil, Undo2 } from 'lucide-react'
import type { FreiProps, Rohergebnis } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { Balken, KopfZeile, Taste, useStoppuhr, useTasten } from '../../ablauf/kit'
import { sudokuAufgabeLeistung, sudokuErzeuge, sudokuKasten, sudokuKonflikte, sudokuLeistung } from './Sudoku.logik'
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

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const raetsel = useMemo(() => sudokuErzeuge(rng(start), stufe), [start, stufe])
  const { n, kb, vorgabe, loesung } = raetsel
  const N = n * n
  const offenGesamt = N - raetsel.vorgaben
  const mitNotizen = n >= 6

  const [feld, setFeld] = useState<number[]>(() => vorgabe.slice())
  /** je Feld eine Bitmaske der notierten Ziffern */
  const [notizen, setNotizen] = useState<number[]>(() => new Array(N).fill(0))
  const [wahl, setWahl] = useState<number>(() => vorgabe.findIndex(w => w === 0))
  const [notizModus, setNotizModus] = useState(false)
  const [ende, setEnde] = useState<null | 'geloest' | 'aufgegeben'>(null)
  const fehler = useRef(0)
  /** frühere Stände für „Rückgängig“ (höchstens 300) */
  const verlauf = useRef<{ feld: number[]; notizen: number[] }[]>([])
  const beginn = useRef(performance.now())
  const fertig = useRef(false)
  const zeitgeber = useRef<ReturnType<typeof setTimeout>>()
  const melde = useRef(onFertig)
  melde.current = onFertig
  useEffect(() => () => clearTimeout(zeitgeber.current), [])

  const schliesse = (art: 'geloest' | 'aufgegeben', stand: number[]) => {
    if (fertig.current) return
    fertig.current = true
    const ms = performance.now() - beginn.current
    const richtig = stand.reduce((a, w, i) => a + (!vorgabe[i] && w === loesung[i] ? 1 : 0), 0)
    const roh: Rohergebnis = art === 'geloest'
      ? {
        leistung: sudokuLeistung(stufe, ms, fehler.current), richtig: offenGesamt, gesamt: offenGesamt,
        text: `${n}×${n} gelöst in ${zeitText(ms / 1000)} min${fehler.current ? ` · ${fehler.current} ${fehler.current === 1 ? 'Fehleintrag' : 'Fehleinträge'}` : ''}`,
      }
      : { leistung: sudokuAufgabeLeistung(richtig, offenGesamt), richtig, gesamt: offenGesamt, text: `${n}×${n} aufgegeben nach ${zeitText(ms / 1000)} min` }
    setEnde(art)
    zeitgeber.current = setTimeout(() => melde.current(roh), art === 'geloest' ? 1200 : 3500)
  }

  const frei = (i: number): boolean => i >= 0 && !vorgabe[i]
  const merke = () => { verlauf.current.push({ feld, notizen }); if (verlauf.current.length > 300) verlauf.current.shift() }
  const zurueck = () => {
    if (ende) return
    const v = verlauf.current.pop()
    if (v) { setFeld(v.feld); setNotizen(v.notizen) }
  }

  const setze = (w: number) => {
    if (ende || !frei(wahl)) return
    if (notizModus && mitNotizen) {
      if (feld[wahl]) return
      merke()
      setNotizen(alt => { const k = alt.slice(); k[wahl] ^= 1 << (w - 1); return k })
      return
    }
    merke()
    const neu = feld.slice()
    neu[wahl] = feld[wahl] === w ? 0 : w                 // dieselbe Ziffer nochmal = wieder leeren
    if (neu[wahl] && neu[wahl] !== loesung[wahl]) fehler.current++
    setFeld(neu)
    if (neu[wahl]) {
      // Notizen im Feld löschen und die gesetzte Ziffer in Zeile, Spalte und Kästchen aus den Notizen streichen
      const z = Math.floor(wahl / n), s = wahl % n, k = sudokuKasten(raetsel, z, s), bit = 1 << (w - 1)
      setNotizen(alt => alt.map((m, i) => {
        if (i === wahl) return 0
        const z2 = Math.floor(i / n), s2 = i % n
        return z2 === z || s2 === s || sudokuKasten(raetsel, z2, s2) === k ? m & ~bit : m
      }))
    }
    if (neu.every((x, i) => x === loesung[i])) schliesse('geloest', neu)
  }

  const loesche = () => {
    if (ende || !frei(wahl)) return
    if (feld[wahl]) { merke(); const neu = feld.slice(); neu[wahl] = 0; setFeld(neu) }
    else if (notizen[wahl]) { merke(); setNotizen(alt => { const k = alt.slice(); k[wahl] = 0; return k }) }
  }

  const bewege = (dz: number, ds: number) => {
    if (ende) return
    const i = wahl < 0 ? 0 : wahl
    const z = Math.max(0, Math.min(n - 1, Math.floor(i / n) + dz)), s = Math.max(0, Math.min(n - 1, (i % n) + ds))
    setWahl(z * n + s)
  }

  const tasten: Record<string, () => void> = {
    Backspace: loesche, Delete: loesche, 0: loesche, z: zurueck,
    ArrowUp: () => bewege(-1, 0), ArrowDown: () => bewege(1, 0), ArrowLeft: () => bewege(0, -1), ArrowRight: () => bewege(0, 1),
  }
  for (let w = 1; w <= n; w++) tasten[String(w)] = () => setze(w)
  if (mitNotizen) tasten.n = () => setNotizModus(m => !m)
  useTasten(tasten, ende === null)

  const konflikte = useMemo(() => sudokuKonflikte(feld, raetsel), [feld, raetsel])
  const gefuellt = feld.reduce((a, w, i) => a + (!vorgabe[i] && w ? 1 : 0), 0)
  const voll = gefuellt === offenGesamt
  const kante = n === 9 ? 50 : n === 6 ? 66 : 92
  const wz = wahl >= 0 ? Math.floor(wahl / n) : -1, ws = wahl >= 0 ? wahl % n : -1
  const wk = wahl >= 0 ? sudokuKasten(raetsel, wz, ws) : -1
  const wWert = wahl >= 0 ? feld[wahl] : 0

  return (
    <div className="bt-lauf" data-bt-frei="sudoku" data-ende={ende ?? undefined}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">{n}×{n} · {gefuellt} / {offenGesamt}</span>}
        mitte={<Balken anteil={gefuellt / Math.max(1, offenGesamt)} />}
        rechts={<Uhr aktiv={ende === null} />}
      />
      <div className="bt-raetsel-buehne" data-mittig>
        <div className={`bt-raetsel-sudoku ${ende === 'geloest' ? 'bt-blitz-gut' : ''}`} data-bt-sudoku
          style={{ gridTemplateColumns: `repeat(${n}, ${kante}px)`, gridAutoRows: kante }}>
          {feld.map((w, i) => {
            const z = Math.floor(i / n), s = i % n
            const fest = !!vorgabe[i]
            const zeige = ende === 'aufgegeben' ? loesung[i] : w
            const ton = ende ? undefined
              : i === wahl ? 'wahl'
                : wWert && w === wWert ? 'gleich'
                  : wahl >= 0 && (z === wz || s === ws || sudokuKasten(raetsel, z, s) === wk) ? 'nachbar' : undefined
            return (
              <button key={i} type="button" className="bt-raetsel-sz" data-i={i} data-wert={w}
                style={{ width: kante, height: kante, fontSize: Math.round(kante * 0.5) }}
                data-fest={fest ? '' : undefined} data-ton={ton}
                data-konflikt={(ende === 'aufgegeben' ? !fest && w !== 0 && w !== loesung[i] : konflikte[i]) ? '' : undefined}
                data-gezeigt={ende === 'aufgegeben' && !fest && !w ? '' : undefined}
                data-kr={(s + 1) % kb === 0 && s < n - 1 ? '' : undefined} data-ku={(z + 1) % raetsel.kh === 0 && z < n - 1 ? '' : undefined}
                data-rr={s === n - 1 ? '' : undefined} data-ru={z === n - 1 ? '' : undefined}
                aria-label={`Zeile ${z + 1}, Spalte ${s + 1}${w ? `: ${w}` : ': leer'}`}
                onClick={() => { if (!ende) setWahl(i) }}>
                {zeige ? zeige : (mitNotizen && notizen[i] !== 0 && (
                  <span className="bt-raetsel-notizen" style={{ gridTemplateColumns: `repeat(${kb}, 1fr)`, fontSize: n === 9 ? 10 : 12 }}>
                    {Array.from({ length: n }, (_, k) => <span key={k}>{notizen[i] & (1 << k) ? k + 1 : ''}</span>)}
                  </span>
                ))}
              </button>
            )
          })}
        </div>

        <div className="bt-raetsel-seite">
          <div className="bt-raetsel-ziffern" data-bt-ziffern style={n === 4 ? { gridTemplateColumns: 'repeat(2, 1fr)' } : undefined}>
            {Array.from({ length: n }, (_, k) => {
              const w = k + 1
              const rest = n - feld.reduce((a, x) => a + (x === w ? 1 : 0), 0)
              return (
                <button key={w} type="button" className="bt-feld bt-raetsel-ziffer" data-ziffer={w} disabled={!!ende}
                  data-matt={rest <= 0 && !(notizModus && mitNotizen) ? '' : undefined} title={`noch ${Math.max(0, rest)}× zu setzen`}
                  onClick={() => setze(w)}>
                  {w}<small>{Math.max(0, rest)}</small>
                </button>
              )
            })}
          </div>
          <button type="button" className="bt-knopf bt-knopf-leise bt-raetsel-klein" onClick={loesche} disabled={!!ende} data-bt-loeschen>
            <Eraser size={14} />Löschen
          </button>
          <button type="button" className="bt-knopf bt-knopf-leise bt-raetsel-klein" onClick={zurueck} disabled={!!ende || verlauf.current.length === 0} data-bt-rueck>
            <Undo2 size={14} />Rückgängig
          </button>
          {mitNotizen && (
            <button type="button" className={`bt-knopf bt-raetsel-klein ${notizModus ? '' : 'bt-knopf-leise'}`} onClick={() => setNotizModus(m => !m)}
              disabled={!!ende} aria-pressed={notizModus} data-bt-notizen>
              <Pencil size={14} />Notizen {notizModus ? 'an' : 'aus'}
            </button>
          )}
          <AufgebenKnopf onAufgeben={() => schliesse('aufgegeben', feld)} gesperrt={!!ende} />
        </div>
      </div>

      <div className="bt-raetsel-fuss">
        {ende === 'geloest' && <span className="bt-raetsel-meldung bt-ein" data-art="gut" data-bt-geloest><Check size={16} />Gelöst!</span>}
        {ende === 'aufgegeben' && <span className="bt-raetsel-meldung bt-ein" data-art="leise">Das wäre die Lösung gewesen.</span>}
        {!ende && voll && <span className="bt-raetsel-meldung" data-art="schlecht" data-bt-voll-falsch>Noch nicht richtig — rot markierte Ziffern stehen doppelt.</span>}
        {!ende && !voll && (
          <div className="bt-raetsel-hinweis">
            Jede Ziffer 1–{n} genau einmal je Zeile, Spalte und Kästchen. Feld anklicken, dann Ziffer wählen.<br />
            <Taste>1</Taste>–<Taste>{n}</Taste> setzen · <Taste>←</Taste><Taste>↑</Taste><Taste>↓</Taste><Taste>→</Taste> wandern · <Taste>Entf</Taste> löschen · <Taste>Z</Taste> zurück{mitNotizen && <> · <Taste>N</Taste> Notizen</>}
          </div>
        )}
      </div>
    </div>
  )
}
