// Brain-Duell — das laufende Duell: 3-2-1, dieselben Aufgaben für beide, Punktestand des Gegners live,
// am Ende der Vergleich. Abgefragt wird nur hier, alle 2 Sekunden, solange das Duell läuft.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Handshake, Trophy, X } from 'lucide-react'
import type { KatalogEintrag, Rohergebnis, UebungModul } from '../kern/typen'
import { uebung } from '../kern/katalog'
import { useBrain } from '../kern/speicher'
import FragenLauf from '../ablauf/FragenLauf'
import { DUELL_STUFE, ausgang, gleicherBenutzer, ladeStand, raeumeAuf, schreibeStand, type DuellMeta, type Spieler } from './duell'

type Phase = 'laedt' | 'zaehler' | 'lauf' | 'warten' | 'ergebnis'
const TAKT_MS = 2000
/** so lange wird nach dem eigenen Ende höchstens auf den Gegner gewartet */
const WARTEN_MAX_MS = 45_000

export default function DuellSpiel({ meta, ich, onEnde }: { meta: DuellMeta; ich: Spieler; onEnde: () => void }) {
  const gegner = gleicherBenutzer(meta.von.username, ich.username) ? meta.an : meta.von
  const eintrag = uebung(meta.disziplin) as KatalogEintrag | undefined
  const bucheLauf = useBrain(s => s.bucheLauf)
  const bucheDuell = useBrain(s => s.bucheDuell)
  const [modul, setModul] = useState<UebungModul | null>(null)
  const [phase, setPhase] = useState<Phase>('laedt')
  const [zahl, setZahl] = useState(3)
  const [meine, setMeine] = useState(0)
  const [seine, setSeine] = useState<number | null>(null)
  const [gegnerFertig, setGegnerFertig] = useState(false)
  const [gegnerWeg, setGegnerWeg] = useState(false)
  const meinePunkte = useRef(0)
  const binFertig = useRef(false)
  const beginn = useRef(0)
  const gebucht = useRef(false)

  useEffect(() => {
    let weg = false
    if (!eintrag) return
    eintrag.lade().then(m => { if (!weg) { setModul(m); setPhase('zaehler') } }).catch(() => { if (!weg) onEnde() })
    return () => { weg = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eintrag])

  useEffect(() => {
    if (phase !== 'zaehler') return
    if (zahl <= 0) { beginn.current = performance.now(); setPhase('lauf'); void schreibeStand(meta.id, ich.username, 0, false); return }
    const t = setTimeout(() => setZahl(z => z - 1), 650)
    return () => clearTimeout(t)
  }, [phase, zahl, meta.id, ich.username])

  // Takt: eigenen Stand schreiben (nur während des Laufs), Stand des Gegners lesen
  useEffect(() => {
    if (phase !== 'lauf' && phase !== 'warten') return
    const lies = async () => {
      const s = await ladeStand(meta.id, gegner.username)
      if (s) { setSeine(s.punkte); if (s.fertig) setGegnerFertig(true) }
    }
    const t = setInterval(() => {
      // Den Stand in JEDEM Takt schreiben, mit dem aktuellen „fertig“-Merker: so kann ein später
      // Zwischenstand den Endstand nie überschreiben, und ein verlorener Endstand wird nachgeholt.
      void schreibeStand(meta.id, ich.username, meinePunkte.current, binFertig.current)
      void lies()
    }, TAKT_MS)
    void lies()
    return () => clearInterval(t)
  }, [phase, meta.id, ich.username, gegner.username])

  const punkte = useCallback((p: number) => { meinePunkte.current = p; setMeine(p) }, [])

  const fertig = useCallback((roh: Rohergebnis) => {
    const p = Math.max(0, Math.round(roh.duellPunkte ?? roh.richtig - (roh.gesamt - roh.richtig)))
    meinePunkte.current = p; setMeine(p)
    binFertig.current = true
    void schreibeStand(meta.id, ich.username, p, true)
    if (eintrag) bucheLauf({ uebung: eintrag.id, gebiet: eintrag.gebiet, stufe: DUELL_STUFE, ergebnis: roh, dauerSek: (performance.now() - beginn.current) / 1000, quelle: 'duell' })
    setPhase('warten')
  }, [meta.id, ich.username, eintrag, bucheLauf])

  // nach dem eigenen Ende: auf den Gegner warten (höchstens 45 s), dann Ergebnis
  useEffect(() => {
    if (phase !== 'warten') return
    if (gegnerFertig) { setPhase('ergebnis'); return }
    const t = setTimeout(() => { setGegnerWeg(true); setPhase('ergebnis') }, WARTEN_MAX_MS)
    return () => clearTimeout(t)
  }, [phase, gegnerFertig])

  // Ergebnis einmal buchen (nur lokal, nur für mich) und später aufräumen
  useEffect(() => {
    if (phase !== 'ergebnis' || gebucht.current) return
    gebucht.current = true
    const er = seine ?? 0
    bucheDuell({ t: new Date().toISOString(), gegner: gegner.displayName, disziplin: meta.disziplin, ich: meinePunkte.current, er, ausgang: gegnerWeg ? 1 : ausgang(meinePunkte.current, er) })
    // Aufräumen bewusst NICHT an die Ansicht gebunden: auch wer sofort zurückgeht, räumt nach 45 s auf
    // (so lange kann der Gegner den Endstand noch lesen).
    setTimeout(() => { void raeumeAuf(meta, ich.username) }, 45_000)
  }, [phase, seine, gegnerWeg, bucheDuell, gegner.displayName, meta, ich.username])

  if (!eintrag) return <div className="bt-karte">Diese Disziplin gibt es in dieser Version nicht. <button type="button" className="bt-knopf bt-knopf-leise" onClick={onEnde}>Zurück</button></div>

  const max = Math.max(40, meine, seine ?? 0)
  const stand = (
    <div className="bt-duell-stand" data-bt-duell-stand>
      <div><span className="bt-h3">Du</span><span className="bt-zahl" data-bt-duell-ich>{meine}</span></div>
      <div className="bt-duell-balken" aria-hidden="true">
        <i style={{ width: `${(meine / max) * 100}%`, background: 'var(--bt-viz-1)' }} />
        <i style={{ width: `${((seine ?? 0) / max) * 100}%`, background: 'var(--bt-viz-2)' }} />
      </div>
      <div><span className="bt-h3">{gegner.displayName}</span><span className="bt-zahl" data-bt-duell-er>{seine ?? '–'}</span></div>
    </div>
  )
  const er = seine ?? 0
  const sieg = gegnerWeg ? 1 : ausgang(meine, er)

  return (
    <div className="bt-breite" data-bt-duell-spiel data-phase={phase}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span className="bt-chip bt-chip-warm">Duell</span>
        <span className="bt-h3" style={{ flex: 1 }}>{meta.disziplinName} gegen {gegner.displayName}</span>
        {phase !== 'ergebnis' && <button type="button" className="bt-knopf bt-knopf-nackt" onClick={onEnde} aria-label="Duell verlassen" title="Duell verlassen (zählt als nicht beendet)"><X size={16} /></button>}
      </div>
      {(phase === 'lauf' || phase === 'warten') && stand}

      {(phase === 'laedt' || phase === 'zaehler') && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 380, gap: 10 }}>
          <div className="bt-leise">Beide bekommen dieselben Aufgaben — wer in der Zeit mehr Punkte holt, gewinnt.</div>
          <div key={zahl} className="bt-held bt-ein" style={{ fontSize: 120, color: 'var(--bt-akzent2)' }}>{phase === 'laedt' ? '…' : zahl > 0 ? zahl : 'Los'}</div>
        </div>
      )}

      {phase === 'lauf' && modul && (
        modul.erzeuge
          ? <FragenLauf erzeuge={modul.erzeuge} stufe={DUELL_STUFE} start={meta.start} dauerSek={meta.dauerSek} mitErklaerung={false} onPunkte={punkte} onFertig={fertig} />
          : modul.Komponente
            ? <modul.Komponente stufe={DUELL_STUFE} start={meta.start} modus="duell" dauerSek={meta.dauerSek} onPunkte={punkte} onFertig={fertig} />
            : null
      )}

      {phase === 'warten' && (
        <div className="bt-karte bt-ein" style={{ maxWidth: 520, margin: '40px auto 0', textAlign: 'center' }} data-bt-duell-warten>
          <h2 className="bt-h2">Geschafft — {meine} Punkte</h2>
          <p className="bt-leise" style={{ margin: '8px 0 0' }}>{gegner.displayName} ist noch dran …</p>
        </div>
      )}

      {phase === 'ergebnis' && (
        <div className="bt-karte bt-ein" style={{ maxWidth: 560, margin: '28px auto 0', padding: 28, textAlign: 'center' }} data-bt-duell-ergebnis data-ausgang={sieg}>
          <span className="bt-symbol" style={{ width: 54, height: 54, margin: '0 auto 12px', background: sieg === 1 ? 'var(--bt-gut-weich)' : undefined, color: sieg === 1 ? 'var(--bt-gut)' : undefined }}>
            {sieg === 0 ? <Handshake size={24} /> : <Trophy size={24} />}
          </span>
          <h2 className="bt-h1">{sieg === 1 ? 'Gewonnen!' : sieg === 0 ? 'Unentschieden' : `${gegner.displayName} gewinnt`}</h2>
          <div className="bt-held" style={{ fontSize: 56, margin: '14px 0 6px' }}>{meine} <span className="bt-stumm" style={{ fontSize: 30 }}>:</span> {gegnerWeg ? '–' : er}</div>
          <div className="bt-leise">{gegnerWeg ? `${gegner.displayName} hat das Duell nicht beendet.` : `Du : ${gegner.displayName} · ${meta.disziplinName}`}</div>
          <div className="bt-klein bt-stumm" style={{ marginTop: 10 }}>Das Ergebnis steht nur in deiner eigenen Duell-Bilanz.</div>
          <button type="button" className="bt-knopf" style={{ marginTop: 18 }} onClick={onEnde} data-bt-duell-fertig>Zurück zu den Duellen</button>
        </div>
      )}
    </div>
  )
}
