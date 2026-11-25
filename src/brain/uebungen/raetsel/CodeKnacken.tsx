// Code knacken (Rätsel): Ein geheimer Farbcode ist mit möglichst wenigen Tipps zu erschließen.
// Nach jedem Tipp gibt es zwei Zahlen: wie viele Farben am richtigen Platz stehen und wie viele
// zwar vorkommen, aber am falschen Platz. Trainiert schlussfolgerndes Denken: Hypothesen bilden,
// gezielt prüfen, aus Rückmeldungen Möglichkeiten ausschließen.
//
// Stufen: 4 Stellen (Stufe 1–6), 5 Stellen (7–10); 5 bis 8 Farben; doppelte Farben ab Stufe 4;
//         10 Versuche, ab Stufe 8 nur 9, auf Stufe 10 nur 8. Tabelle und Wertung stehen in CodeKnacken.logik.ts.
// Bedienung: Farbe anklicken oder Taste 1–8 (jeder Stift trägt seine Ziffer — es geht auch ohne
//            Farbensehen). Stelle anklicken oder ← →, Rück löscht, Enter prüft den Tipp.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, CornerDownLeft, Delete, Flag } from 'lucide-react'
import type { FreiProps, Rohergebnis } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { Balken, KopfZeile, Taste, useStoppuhr, useTasten } from '../../ablauf/kit'
import { codeBewerte, codeErzeuge, codeFehlLeistung, codeLeistung, codeStufe, type CodeBewertung } from './CodeKnacken.logik'
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

/** Ein Stift: Farbe 0…7 mit seiner Ziffer (Farbe + 1) */
function Stift({ farbe, gross }: { farbe: number; gross?: number }) {
  const g = gross ?? 32
  return <span className="bt-raetsel-stift" data-farbe={farbe} style={{ width: g, height: g, fontSize: Math.round(g * 0.42) }}>{farbe + 1}</span>
}

type Ende = null | 'geknackt' | 'verloren' | 'aufgegeben'

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const st = codeStufe(stufe)
  const geheim = useMemo(() => codeErzeuge(rng(start), stufe), [start, stufe])
  const [tipps, setTipps] = useState<{ tipp: number[]; urteil: CodeBewertung }[]>([])
  const [reihe, setReihe] = useState<(number | null)[]>(() => new Array(st.stellen).fill(null))
  const [stelle, setStelle] = useState(0)
  const [ende, setEnde] = useState<Ende>(null)
  const [ruettel, setRuettel] = useState(0)             // „Prüfen“ mit unvollständiger Reihe
  const beginn = useRef(performance.now())
  const fertig = useRef(false)
  const zeitgeber = useRef<ReturnType<typeof setTimeout>>()
  const melde = useRef(onFertig)
  melde.current = onFertig
  useEffect(() => () => clearTimeout(zeitgeber.current), [])
  useEffect(() => { if (!ruettel) return; const t = setTimeout(() => setRuettel(0), 340); return () => clearTimeout(t) }, [ruettel])

  const schliesse = (art: Exclude<Ende, null>, alle: { tipp: number[]; urteil: CodeBewertung }[]) => {
    if (fertig.current) return
    fertig.current = true
    const ms = performance.now() - beginn.current
    // bester Tipp: Volltreffer zählen doppelt
    let bestP = 0, bestF = 0
    for (const t of alle) if (2 * t.urteil.platz + t.urteil.farbe > 2 * bestP + bestF) { bestP = t.urteil.platz; bestF = t.urteil.farbe }
    const roh: Rohergebnis = art === 'geknackt'
      ? {
        leistung: codeLeistung(stufe, alle.length, ms), richtig: st.stellen, gesamt: st.stellen,
        text: `Code mit ${alle.length} ${alle.length === 1 ? 'Tipp' : 'Tipps'} geknackt · ${zeitText(ms / 1000)} min`,
      }
      : {
        leistung: codeFehlLeistung(stufe, bestP, bestF), richtig: bestP, gesamt: st.stellen,
        text: art === 'verloren' ? `nicht geknackt (${alle.length} Tipps)` : `aufgegeben nach ${alle.length} ${alle.length === 1 ? 'Tipp' : 'Tipps'}`,
      }
    setEnde(art)
    zeitgeber.current = setTimeout(() => melde.current(roh), art === 'geknackt' ? 1400 : 3500)
  }

  const setzeFarbe = (f: number) => {
    if (ende || f < 0 || f >= st.farben) return
    const neu = reihe.slice()
    neu[stelle] = f
    setReihe(neu)
    // weiter zur nächsten freien Stelle (rechts davon, sonst von vorn)
    for (let k = 1; k <= st.stellen; k++) {
      const i = (stelle + k) % st.stellen
      if (neu[i] === null) { setStelle(i); return }
    }
  }
  const loesche = () => {
    if (ende) return
    const neu = reihe.slice()
    if (neu[stelle] !== null) neu[stelle] = null
    else if (stelle > 0) { neu[stelle - 1] = null; setStelle(stelle - 1) }
    setReihe(neu)
  }
  const pruefe = () => {
    if (ende) return
    if (reihe.some(f => f === null)) { setRuettel(r => r + 1); return }
    const tipp = reihe as number[]
    const alle = [...tipps, { tipp, urteil: codeBewerte(geheim, tipp) }]
    setTipps(alle)
    setReihe(new Array(st.stellen).fill(null))
    setStelle(0)
    if (alle[alle.length - 1].urteil.platz === st.stellen) schliesse('geknackt', alle)
    else if (alle.length >= st.versuche) schliesse('verloren', alle)
  }

  const tasten: Record<string, () => void> = {
    Backspace: loesche, Delete: loesche, Enter: pruefe,
    ArrowLeft: () => setStelle(s => Math.max(0, s - 1)), ArrowRight: () => setStelle(s => Math.min(st.stellen - 1, s + 1)),
  }
  for (let f = 0; f < st.farben; f++) tasten[String(f + 1)] = () => setzeFarbe(f)
  useTasten(tasten, ende === null)

  const voll = reihe.every(f => f !== null)
  const stiftGross = st.versuche >= 10 ? 32 : 34

  return (
    <div className="bt-lauf" data-bt-frei="codeknacken" data-ende={ende ?? undefined}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">Tipp {Math.min(tipps.length + (ende ? 0 : 1), st.versuche)} / {st.versuche}</span>}
        mitte={<Balken anteil={tipps.length / st.versuche} warm />}
        rechts={<Uhr aktiv={ende === null} />}
      />
      <div className="bt-raetsel-buehne">
        <div className="bt-raetsel-reihen" data-bt-reihen>
          {Array.from({ length: st.versuche }, (_, k) => {
            const t = tipps[k]
            const aktiv = !ende && k === tipps.length
            return (
              <div key={k} className={`bt-raetsel-reihe ${aktiv && ruettel ? 'bt-ruettel' : ''}`} data-reihe={k}
                data-aktiv={aktiv ? '' : undefined} data-offen={!t && !aktiv ? '' : undefined}
                data-treffer={t && t.urteil.platz === st.stellen ? '' : undefined}
                data-platz={t ? t.urteil.platz : undefined} data-farbe-zahl={t ? t.urteil.farbe : undefined}>
                <span className="bt-raetsel-nr">{k + 1}</span>
                {Array.from({ length: st.stellen }, (_, i) => {
                  if (t) return <Stift key={i} farbe={t.tipp[i]} gross={stiftGross} />
                  if (!aktiv) return <span key={i} className="bt-raetsel-stift" data-leer style={{ width: stiftGross, height: stiftGross }} />
                  const f = reihe[i]
                  return (
                    <button key={i} type="button" className="bt-raetsel-stift" data-stelle={i} data-farbe={f ?? undefined} data-leer={f === null ? '' : undefined}
                      data-wahl={i === stelle ? '' : undefined} style={{ width: stiftGross, height: stiftGross, fontSize: Math.round(stiftGross * 0.42) }}
                      aria-label={`Stelle ${i + 1}: ${f === null ? 'leer' : `Farbe ${f + 1}`}`} onClick={() => setStelle(i)}>
                      {f === null ? '' : f + 1}
                    </button>
                  )
                })}
                <span className="bt-raetsel-urteil">
                  {t && <>
                    <span title="richtige Farbe am richtigen Platz"><i className="bt-raetsel-punkt" data-voll />{t.urteil.platz}</span>
                    <span title="richtige Farbe am falschen Platz"><i className="bt-raetsel-punkt" />{t.urteil.farbe}</span>
                  </>}
                </span>
              </div>
            )
          })}
        </div>

        <div className="bt-raetsel-seite" style={{ width: 300 }}>
          <div className="bt-raetsel-wert" style={{ alignItems: 'center' }}>
            <span>Geheimer Code</span>
            <span style={{ display: 'inline-flex', gap: 5 }} data-bt-geheim>
              {geheim.map((f, i) => (ende
                ? <Stift key={i} farbe={f} gross={26} />
                : <span key={i} className="bt-raetsel-stift" data-geheim style={{ width: 26, height: 26, fontSize: 12 }}>?</span>))}
            </span>
          </div>

          <div className="bt-raetsel-palette" data-bt-palette style={{ gridTemplateColumns: `repeat(${st.farben <= 6 ? st.farben : 4}, 1fr)` }}>
            {Array.from({ length: st.farben }, (_, f) => (
              <button key={f} type="button" className="bt-raetsel-stift" data-farbe={f} data-farbe-wahl={f} disabled={!!ende}
                style={{ width: 40, height: 40, fontSize: 17 }} aria-label={`Farbe ${f + 1}`} onClick={() => setzeFarbe(f)}>
                {f + 1}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <button type="button" className="bt-knopf" onClick={pruefe} disabled={!!ende || !voll} data-bt-pruefen>
              <CornerDownLeft size={15} />Tipp prüfen
            </button>
            <button type="button" className="bt-knopf bt-knopf-leise" onClick={loesche} disabled={!!ende} aria-label="Stelle löschen" title="Stelle löschen (Rück)" data-bt-loeschen>
              <Delete size={15} />
            </button>
          </div>

          {ende === 'geknackt' && <span className="bt-raetsel-meldung bt-ein" data-art="gut" data-bt-geloest style={{ justifyContent: 'center' }}><Check size={16} />Geknackt!</span>}
          {ende === 'verloren' && <span className="bt-raetsel-meldung bt-ein" data-art="schlecht" data-bt-verloren style={{ justifyContent: 'center' }}>Kein Versuch mehr — oben steht der Code.</span>}
          {ende === 'aufgegeben' && <span className="bt-raetsel-meldung bt-ein" data-art="leise" style={{ justifyContent: 'center' }}>Oben steht der Code.</span>}

          <div className="bt-raetsel-hinweis" style={{ textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><i className="bt-raetsel-punkt" data-voll style={{ flex: 'none' }} />richtige Farbe am richtigen Platz</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><i className="bt-raetsel-punkt" style={{ flex: 'none' }} />richtige Farbe am falschen Platz</div>
            <div style={{ marginTop: 4 }}>
              {st.stellen} Stellen, {st.farben} Farben — {st.doppelt ? 'eine Farbe kann mehrfach vorkommen.' : 'jede Farbe höchstens einmal.'}
            </div>
            <div style={{ marginTop: 4 }}>
              <Taste>1</Taste>–<Taste>{st.farben}</Taste> Farbe · <Taste>←</Taste><Taste>→</Taste> Stelle · <Taste>Rück</Taste> löschen · <Taste>Enter</Taste> prüfen
            </div>
          </div>
          <AufgebenKnopf onAufgeben={() => schliesse('aufgegeben', tipps)} gesperrt={!!ende} />
        </div>
      </div>
    </div>
  )
}
