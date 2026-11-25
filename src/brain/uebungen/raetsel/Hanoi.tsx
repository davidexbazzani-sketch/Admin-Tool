// Türme von Hanoi (Rätsel): Alle Scheiben auf den Zielstab bringen — immer nur die oberste Scheibe
// eines Stabs bewegen, nie eine größere auf eine kleinere legen. Trainiert Planen in Teilzielen
// (erst den kleineren Turm aus dem Weg räumen) und das Merken des eigenen Plans.
//
// Stufen: 3 Scheiben (Stufe 1) bis 8 Scheiben (Stufe 10). Stufe 1, 2, 4, 6, 8: klassischer Turm links
//         (2ⁿ − 1 Züge). Stufe 3, 5, 7, 9, 10: Die Scheiben liegen zu Beginn verteilt auf allen Stäben —
//         immer lösbar, die Mindestzahl der Züge wird angezeigt. Tabelle und Wertung stehen in Hanoi.logik.ts.
// Bedienung: Stab anklicken (hebt die oberste Scheibe an), dann den Stab, auf den sie soll. Oder die
//            Tasten 1, 2, 3 für links, Mitte, rechts. Ein unerlaubter Zug rüttelt und zählt nicht.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Flag, Target } from 'lucide-react'
import type { FreiProps, Rohergebnis } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { Balken, KopfZeile, Taste, useStoppuhr, useTasten } from '../../ablauf/kit'
import { hanoiAmZiel, hanoiAufgabeLeistung, hanoiErzeuge, hanoiGeloest, hanoiLeistung, hanoiZiehe } from './Hanoi.logik'
import './raetsel.css'

const zeitText = (sek: number): string => `${Math.floor(sek / 60)}:${String(Math.floor(sek % 60)).padStart(2, '0')}`
const STAB_NAME = ['links', 'Mitte', 'rechts']

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
  const raetsel = useMemo(() => hanoiErzeuge(rng(start), stufe), [start, stufe])
  const { n, ziel, minimum } = raetsel
  const [staebe, setStaebe] = useState<number[][]>(() => raetsel.start.map(s => s.slice()))
  const [wahl, setWahl] = useState<number | null>(null)
  const [zuege, setZuege] = useState(0)
  /** Stab, der gerade „nein“ sagt (mit Zähler, damit das Rütteln jedes Mal neu startet) */
  const [nein, setNein] = useState<{ stab: number; nr: number } | null>(null)
  const [ende, setEnde] = useState<null | 'geloest' | 'aufgegeben'>(null)
  const beginn = useRef(performance.now())
  const fertig = useRef(false)
  const zeitgeber = useRef<ReturnType<typeof setTimeout>>()
  const melde = useRef(onFertig)
  melde.current = onFertig
  useEffect(() => () => clearTimeout(zeitgeber.current), [])
  useEffect(() => { if (!nein) return; const t = setTimeout(() => setNein(null), 340); return () => clearTimeout(t) }, [nein])

  const schliesse = (art: 'geloest' | 'aufgegeben', lage: number[][], z: number) => {
    if (fertig.current) return
    fertig.current = true
    const ms = performance.now() - beginn.current
    const roh: Rohergebnis = art === 'geloest'
      ? {
        leistung: hanoiLeistung(z, minimum, ms), richtig: n, gesamt: n,
        text: `${n} Scheiben in ${z} Zügen (mindestens ${minimum}) · ${zeitText(ms / 1000)} min`,
      }
      : { leistung: hanoiAufgabeLeistung(hanoiAmZiel(lage, ziel), n), richtig: hanoiAmZiel(lage, ziel), gesamt: n, text: `aufgegeben nach ${z} Zügen` }
    setEnde(art)
    setWahl(null)
    zeitgeber.current = setTimeout(() => melde.current(roh), art === 'geloest' ? 1200 : 1500)
  }

  const ruettle = (stab: number) => setNein(alt => ({ stab, nr: (alt?.nr ?? 0) + 1 }))

  const waehle = (stab: number) => {
    if (ende) return
    if (wahl === null) {
      if (staebe[stab].length) setWahl(stab)
      else ruettle(stab)                                   // leerer Stab: nichts zum Anheben
      return
    }
    if (wahl === stab) { setWahl(null); return }           // wieder ablegen
    const neu = hanoiZiehe(staebe, wahl, stab)
    setWahl(null)
    if (!neu) { ruettle(stab); return }                    // größere auf kleinere: nicht erlaubt
    const z = zuege + 1
    setStaebe(neu)
    setZuege(z)
    if (hanoiGeloest(neu, ziel)) schliesse('geloest', neu, z)
  }

  useTasten({ 1: () => waehle(0), 2: () => waehle(1), 3: () => waehle(2), Escape: () => setWahl(null) }, ende === null)

  const hoehe = n <= 6 ? 32 : 28                       // Höhe einer Scheibe samt Abstand
  const amZiel = hanoiAmZiel(staebe, ziel)

  return (
    <div className="bt-lauf" data-bt-frei="hanoi" data-ende={ende ?? undefined}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">{n} Scheiben · {amZiel} am Ziel</span>}
        mitte={<Balken anteil={amZiel / n} />}
        rechts={<Uhr aktiv={ende === null} />}
      />
      <div className={`bt-raetsel-staebe ${ende === 'geloest' ? 'bt-blitz-gut' : ''}`} style={{ borderRadius: 16 }} data-bt-staebe>
        {staebe.map((stab, s) => (
          <button key={s} type="button" className={`bt-raetsel-stab ${nein?.stab === s ? 'bt-ruettel' : ''}`} data-stab={s}
            data-wahl={wahl === s ? '' : undefined} data-ziel={s === ziel ? '' : undefined} data-anzahl={stab.length}
            style={{ height: 8 * 28 + 116 }} disabled={!!ende}
            aria-label={`Stab ${STAB_NAME[s]}${s === ziel ? ' (Ziel)' : ''}: ${stab.length ? `Scheiben ${stab.join(', ')}` : 'leer'}`}
            onClick={() => waehle(s)}>
            <span className="bt-raetsel-stabkopf">
              <Taste>{s + 1}</Taste>
              {s === ziel && <span className="bt-chip bt-chip-gut"><Target size={12} />Ziel</span>}
            </span>
            {stab.map((k, i) => {
              const t = n > 1 ? (k - 1) / (n - 1) : 0
              return (
                <span key={k} className="bt-raetsel-scheibe" data-scheibe={k} data-gehoben={wahl === s && i === stab.length - 1 ? '' : undefined}
                  style={{
                    height: hoehe - 2, marginTop: 2, width: `${26 + 74 * (k / n)}%`,
                    background: `color-mix(in srgb, var(--bt-akzent2) ${Math.round(t * 100)}%, var(--bt-akzent))`,
                  }}>
                  {k}
                </span>
              )
            })}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 900 }}>
        <div className="bt-raetsel-wert" style={{ minWidth: 120 }}><span>Züge</span><b data-bt-zuege>{zuege}</b></div>
        <div className="bt-raetsel-wert" style={{ minWidth: 150 }} title="kleinste mögliche Zahl von Zügen"><span>Mindestens</span><b data-bt-minimum>{minimum}</b></div>
        <div style={{ flex: 1, minWidth: 260 }}>
          {ende === 'geloest' && <span className="bt-raetsel-meldung bt-ein" data-art="gut" data-bt-geloest><Check size={16} />Geschafft!</span>}
          {ende === 'aufgegeben' && <span className="bt-raetsel-meldung bt-ein" data-art="leise">Aufgegeben.</span>}
          {!ende && (
            <div className="bt-raetsel-hinweis" style={{ textAlign: 'left' }}>
              Bring alle Scheiben auf den Stab „Ziel“. Stab anklicken hebt die oberste Scheibe an, der zweite Klick legt sie ab —
              nie eine größere auf eine kleinere. Tasten <Taste>1</Taste><Taste>2</Taste><Taste>3</Taste>.
              {raetsel.verteilt && <> Die Scheiben liegen diesmal verteilt.</>}
            </div>
          )}
        </div>
        <AufgebenKnopf onAufgeben={() => schliesse('aufgegeben', staebe, zuege)} gesperrt={!!ende} />
      </div>
    </div>
  )
}
