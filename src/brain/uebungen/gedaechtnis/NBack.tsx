// N-Back (Gedächtnis): In einem 3×3-Gitter leuchtet Schritt für Schritt ein Feld. Drücken, wenn es dasselbe
// Feld ist wie vor n Schritten. Trainiert das Arbeitsgedächtnis: behalten und dabei laufend erneuern.
//
// Stufen:   1–2 → 1-Back · 3–5 → 2-Back · 6–8 → 3-Back · 9–10 → 4-Back
// Abstand:  je n von 2,6 s auf 1,8 s (Stufe 1: 2,6 · 2: 1,8 · 3: 2,6 · 4: 2,2 · 5: 1,8 · 6: 2,6 · 7: 2,2 · 8: 1,8 · 9: 2,6 · 10: 1,8)
// Folge:    20 + n Schritte, davon 5–7 Treffer (≈ 30 %), höchstens 2 hintereinander; dazu Köder
//           (Feld von vor n−1 bzw. n+1 Schritten), damit „kam mir bekannt vor“ nicht reicht.
// Wertung:  (Treffer − Fehlalarme) / Zahl der Treffer-Stellen. Nie/immer drücken und Raten = 0, fehlerfrei = 1.
// Dauer:    etwa 40–65 Sekunden. Kein eigener Duell-Ablauf (im Duell läuft derselbe Durchgang).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import type { FreiProps } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { Balken, KopfZeile, Taste, median, useTasten } from '../../ablauf/kit'
import { nbackFolge, nbackStufe, nbackText, nbackWertung } from './NBack.logik'
import './gedaechtnis.css'

export * from './NBack.logik'

/** Pause, bevor das erste Feld leuchtet */
const VORLAUF_MS = 900
/** nach dem letzten Schritt bleibt die letzte Rückmeldung kurz stehen */
const NACHLAUF_MS = 800

type Art = 'treffer' | 'fehlalarm' | 'verpasst'
/** Rückmeldung; `bei` = Schritt, in dem sie zu sehen ist */
interface Meldung { art: Art; bei: number }

const FARBE: Record<Art, 'gut' | 'schlecht' | 'warn'> = { treffer: 'gut', fehlalarm: 'schlecht', verpasst: 'warn' }

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const cfg = useMemo(() => nbackStufe(stufe), [stufe])
  const folge = useMemo(() => nbackFolge(rng(start), cfg.n, cfg.schritte), [start, cfg])
  const anzahl = folge.pos.length
  const n = cfg.n

  /** −1 = Vorlauf · 0..anzahl−1 = laufender Schritt · anzahl = vorbei */
  const [schritt, setSchritt] = useState(-1)
  /** Schritt, dessen Feld schon wieder dunkel ist */
  const [dunkel, setDunkel] = useState(-1)
  const [meldung, setMeldung] = useState<Meldung | null>(null)
  const gedrueckt = useRef<boolean[]>([])
  const zeiten = useRef<number[]>([])
  const schrittBeginn = useRef(0)
  const fertig = useRef(false)
  const melde = useRef(onFertig)
  melde.current = onFertig

  const schliesseAb = useCallback(() => {
    if (fertig.current) return
    fertig.current = true
    const w = nbackWertung(folge.ziel, gedrueckt.current)
    melde.current({
      leistung: w.leistung, richtig: w.richtigeSchritte, gesamt: anzahl,
      rtMs: zeiten.current.length ? Math.round(median(zeiten.current)) : undefined,
      text: nbackText(n, w),
    })
  }, [folge, anzahl, n])

  // Takt: Feld an → Feld aus → nächster Schritt. Je Schritt genau ein Satz Zeitgeber, beim Aushängen entfernt.
  useEffect(() => {
    if (fertig.current) return
    if (schritt < 0) { const t = setTimeout(() => setSchritt(0), VORLAUF_MS); return () => clearTimeout(t) }
    if (schritt >= anzahl) { const t = setTimeout(schliesseAb, NACHLAUF_MS); return () => clearTimeout(t) }
    schrittBeginn.current = performance.now()
    const aus = setTimeout(() => setDunkel(schritt), cfg.anMs)
    const weiter = setTimeout(() => {
      if (folge.ziel[schritt] && !gedrueckt.current[schritt]) setMeldung({ art: 'verpasst', bei: schritt + 1 })
      setSchritt(schritt + 1)
    }, cfg.intervallMs)
    return () => { clearTimeout(aus); clearTimeout(weiter) }
  }, [schritt, anzahl, cfg, folge, schliesseAb])

  // Antwort: je Schritt zählt nur der erste Druck
  const druecke = useCallback(() => {
    if (fertig.current || schritt < 0 || schritt >= anzahl || gedrueckt.current[schritt]) return
    gedrueckt.current[schritt] = true
    if (folge.ziel[schritt]) {
      zeiten.current.push(performance.now() - schrittBeginn.current)
      setMeldung({ art: 'treffer', bei: schritt })
    } else setMeldung({ art: 'fehlalarm', bei: schritt })
  }, [schritt, anzahl, folge])

  useTasten({ ' ': druecke })

  const laeuft = schritt >= 0 && schritt < anzahl
  const leuchtet = laeuft && dunkel !== schritt ? folge.pos[schritt] : -1
  const aktuell = meldung && meldung.bei === schritt ? meldung : null
  const farbe = aktuell ? FARBE[aktuell.art] : undefined

  // laufender Stand (nur abgeschlossene Schritte zählen als „verpasst“)
  let treffer = 0, verpasst = 0, fehlalarme = 0
  for (let i = 0; i < anzahl && i <= schritt; i++) {
    const g = !!gedrueckt.current[i]
    if (folge.ziel[i]) { if (g) treffer++; else if (i < schritt) verpasst++ } else if (g) fehlalarme++
  }

  const vorSchritten = n === 1 ? 'vor 1 Schritt' : `vor ${n} Schritten`

  return (
    <div className="bt-lauf" data-bt-frei="nback" data-schritt={schritt} data-n={n} data-meldung={aktuell?.art}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">Schritt {Math.max(1, Math.min(schritt + 1, anzahl))} / {anzahl}</span>}
        mitte={<Balken anteil={Math.max(0, schritt) / anzahl} />}
        rechts={<span className="bt-chip bt-chip-akzent bt-zahl">{n}-Back</span>}
      />

      <div className="bt-ged-nb">
        <div className="bt-ged-nb-links">
          <div className="bt-ged-nb-raster" data-art={farbe} data-bt-raster role="img"
            aria-label={leuchtet >= 0 ? `Feld ${leuchtet + 1} von 9 leuchtet` : 'kein Feld leuchtet'}>
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="bt-ged-nb-zelle" data-feld={i}
                data-an={leuchtet === i ? '' : undefined}
                data-art={leuchtet === i && aktuell && aktuell.art !== 'verpasst' ? farbe : undefined} />
            ))}
          </div>
          <div className="bt-ged-meldung" data-art={farbe} data-bt-meldung aria-live="polite">
            {aktuell?.art === 'treffer' && <><Check size={16} />Treffer</>}
            {aktuell?.art === 'fehlalarm' && <><X size={16} />Fehlalarm – das war kein Treffer</>}
            {aktuell?.art === 'verpasst' && <><AlertTriangle size={16} />Verpasst – das eben war ein Treffer</>}
            {!aktuell && (schritt < n
              ? (n === 1 ? 'Das erste Feld nur merken' : `Die ersten ${n} Felder nur merken`)
              : schritt >= anzahl ? 'Geschafft' : ' ')}
          </div>
        </div>

        <div className="bt-karte bt-ged-nb-seite">
          <div>
            <div className="bt-label">Deine Aufgabe</div>
            <div className="bt-ged-nb-n" data-bt-n>{n}-Back</div>
          </div>
          <p className="bt-ged-nb-regel">
            Drücke, wenn das Feld <b>dasselbe ist wie {vorSchritten}</b>. Sonst nichts tun.
          </p>
          <div className="bt-ged-nb-kette" aria-hidden="true">
            {Array.from({ length: n + 1 }, (_, i) => (
              <div key={i} className="bt-ged-nb-glied" data-rolle={i === 0 ? 'damals' : i === n ? 'jetzt' : undefined}>
                <i />
                <span>{i === 0 ? `vor ${n}` : i === n ? 'jetzt' : `vor ${n - i}`}</span>
              </div>
            ))}
          </div>
          {/* Fokus bleibt nie auf dem Knopf, sonst würde die Leertaste doppelt zählen */}
          <button type="button" className="bt-knopf bt-knopf-gross bt-ged-nb-knopf" data-bt-treffer tabIndex={-1}
            onMouseDown={e => e.preventDefault()} onClick={druecke} disabled={!laeuft}>
            Treffer
          </button>
          <div className="bt-klein bt-leise" style={{ textAlign: 'center', marginTop: -6 }}>oder <Taste>Leertaste</Taste></div>
          <div className="bt-ged-nb-stand" data-bt-stand>
            <span className="bt-chip bt-chip-gut bt-zahl">{treffer} Treffer</span>
            <span className="bt-chip bt-zahl">{verpasst} verpasst</span>
            <span className="bt-chip bt-zahl">{fehlalarme} {fehlalarme === 1 ? 'Fehlalarm' : 'Fehlalarme'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
