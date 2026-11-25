// Rahmen um jede Übung: Vorstellung (was wird trainiert, Bedienung, Stufe) → 3-2-1 → Durchgang → Ergebnis.
// Bucht den Durchgang im Brain-Speicher (Punkte, Stufe, Abzeichen).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Award, Minus, Play, Plus, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react'
import type { KatalogEintrag, Rohergebnis, UebungModul } from '../kern/typen'
import { gebietName } from '../kern/typen'
import { neuerStart } from '../kern/zufall'
import { useBrain, type LaufQuittung } from '../kern/speicher'
import FragenLauf from './FragenLauf'
import { GebietSymbol } from '../Symbole'

interface Props {
  eintrag: KatalogEintrag
  quelle: 'training' | 'heute'
  onZurueck: () => void
  /** Tages-Training: weiter zur nächsten Übung (sonst kein Knopf) */
  onWeiter?: () => void
  /** Text am Weiter-Knopf */
  weiterText?: string
  /** oben anzeigen, z. B. „Übung 2 von 5“ */
  schritt?: string
}

type Phase = 'start' | 'zaehler' | 'lauf' | 'ergebnis'

/** so viele zuletzt gezeigte Aufgaben je Übung werden gemerkt (und beim nächsten Durchgang gemieden) */
const GEMERKT = 40

export default function UebungSpielen({ eintrag, quelle, onZurueck, onWeiter, weiterText, schritt }: Props) {
  const stufeGespeichert = useBrain(s => s.daten.stufen[eintrag.id] ?? 1)
  const bucheLauf = useBrain(s => s.bucheLauf)
  const setzeStufe = useBrain(s => s.setzeStufe)
  const [modul, setModul] = useState<UebungModul | null>(null)
  const [ladeFehler, setLadeFehler] = useState('')
  const [phase, setPhase] = useState<Phase>('start')
  const [stufe, setStufe] = useState(stufeGespeichert)
  const [start, setStart] = useState(neuerStart)
  const [zahl, setZahl] = useState(3)
  const [ergebnis, setErgebnis] = useState<{ roh: Rohergebnis; quittung: LaufQuittung } | null>(null)
  const beginn = useRef(0)

  useEffect(() => {
    let weg = false
    setModul(null); setLadeFehler('')
    eintrag.lade().then(m => { if (!weg) setModul(m) }).catch(e => { if (!weg) setLadeFehler((e as Error).message || 'Übung konnte nicht geladen werden') })
    return () => { weg = true }
  }, [eintrag])

  // 3-2-1
  useEffect(() => {
    if (phase !== 'zaehler') return
    if (zahl <= 0) { beginn.current = performance.now(); setPhase('lauf'); return }
    const t = setTimeout(() => setZahl(z => z - 1), 650)
    return () => clearTimeout(t)
  }, [phase, zahl])

  const starte = useCallback(() => { setStart(neuerStart()); setZahl(3); setErgebnis(null); setPhase('zaehler') }, [])

  // Aufgaben mit kleinem Vorrat (z. B. Wort-Aufgaben): zuletzt Gesehenes meiden. Stand vom Beginn des Durchgangs.
  const merkeGesehen = useBrain(s => s.merkeGesehen)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const vermeide = useMemo(() => new Set(useBrain.getState().daten.gesehen[eintrag.id] ?? []), [eintrag.id, start])
  const gezeigt = useCallback((hash: number) => merkeGesehen(eintrag.id, hash, GEMERKT), [merkeGesehen, eintrag.id])

  const fertig = useCallback((roh: Rohergebnis) => {
    const dauerSek = (performance.now() - beginn.current) / 1000
    const quittung = bucheLauf({ uebung: eintrag.id, gebiet: eintrag.gebiet, stufe, ergebnis: roh, dauerSek, quelle })
    setErgebnis({ roh, quittung })
    setStufe(quittung.stufeNeu)
    setPhase('ergebnis')
  }, [bucheLauf, eintrag, quelle, stufe])

  // Enter startet bzw. geht weiter
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return
      if (phase === 'start' && modul) { e.preventDefault(); starte() }
      else if (phase === 'ergebnis') { e.preventDefault(); if (onWeiter) onWeiter(); else starte() }
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [phase, modul, starte, onWeiter])

  const aendereStufe = (d: number) => {
    const s = Math.max(1, Math.min(10, stufe + d))
    setStufe(s); setzeStufe(eintrag.id, s)
  }

  const kopf = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <button type="button" className="bt-knopf bt-knopf-nackt" onClick={onZurueck} data-bt-zurueck><ArrowLeft size={16} />Zurück</button>
      <span className="bt-symbol" style={{ width: 32, height: 32 }}><GebietSymbol gebiet={eintrag.gebiet} size={16} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="bt-h3" style={{ lineHeight: 1.2 }}>{eintrag.name}</div>
        <div className="bt-klein bt-leise">{gebietName(eintrag.gebiet)}{schritt ? ` · ${schritt}` : ''}</div>
      </div>
      <span className="bt-chip bt-chip-akzent" style={{ marginLeft: 'auto' }}>Stufe {stufe}</span>
    </div>
  )

  if (ladeFehler) return <div className="bt-breite">{kopf}<div className="bt-karte">Diese Übung konnte nicht geladen werden: {ladeFehler}</div></div>

  return (
    <div className="bt-breite" data-bt-uebung={eintrag.id} data-bt-phase={phase}>
      {kopf}

      {phase === 'start' && (
        <div className="bt-karte bt-ein" style={{ maxWidth: 680, margin: '32px auto 0', padding: 28, textAlign: 'center' }}>
          <h2 className="bt-h1">{eintrag.name}</h2>
          <p className="bt-leise" style={{ margin: '8px 0 20px', fontSize: 15 }}>{eintrag.kurz}</p>
          <div style={{ display: 'grid', gap: 10, textAlign: 'left', marginBottom: 22 }}>
            <div className="bt-hinweis"><span><b>Was wird trainiert?</b> {eintrag.trainiert}</span></div>
            {eintrag.bedienung && <div className="bt-klein bt-leise" style={{ padding: '0 4px' }}><b style={{ color: 'var(--bt-ink)' }}>Bedienung:</b> {eintrag.bedienung}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 22 }}>
            <span className="bt-label">Stufe</span>
            <button type="button" className="bt-knopf bt-knopf-leise" onClick={() => aendereStufe(-1)} disabled={stufe <= 1} aria-label="Stufe leichter"><Minus size={15} /></button>
            <span className="bt-zahl" style={{ fontSize: 26, minWidth: 34 }} data-bt-stufe>{stufe}</span>
            <button type="button" className="bt-knopf bt-knopf-leise" onClick={() => aendereStufe(1)} disabled={stufe >= 10} aria-label="Stufe schwerer"><Plus size={15} /></button>
            <span className="bt-klein bt-stumm">passt sich selbst an</span>
          </div>
          <button type="button" className="bt-knopf bt-knopf-gross" onClick={starte} disabled={!modul} data-bt-start>
            <Play size={17} />{modul ? 'Los geht’s' : 'Lädt …'}
          </button>
          <div className="bt-klein bt-stumm" style={{ marginTop: 12 }}>{eintrag.dauer}</div>
        </div>
      )}

      {phase === 'zaehler' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 380 }}>
          <div key={zahl} className="bt-zahl bt-ein" style={{ fontSize: 120, color: 'var(--bt-akzent)' }}>{zahl > 0 ? zahl : 'Los'}</div>
        </div>
      )}

      {phase === 'lauf' && modul && (
        modul.erzeuge
          ? <FragenLauf key={start} erzeuge={modul.erzeuge} stufe={stufe} start={start} anzahl={eintrag.anzahl ?? 10} vermeide={vermeide} onGezeigt={gezeigt} onFertig={fertig} />
          : modul.Komponente
            ? <modul.Komponente key={start} stufe={stufe} start={start} modus="training" onFertig={fertig} />
            : null
      )}

      {phase === 'ergebnis' && ergebnis && (
        <div className="bt-karte bt-ein" style={{ maxWidth: 620, margin: '28px auto 0', padding: 28, textAlign: 'center' }} data-bt-ergebnis>
          <div className="bt-label">Brain-Punkte</div>
          <div className="bt-zahl" style={{ fontSize: 68, lineHeight: 1.05, color: 'var(--bt-akzent-stark)' }} data-bt-punkte>{ergebnis.quittung.punkte}</div>
          <div className="bt-leise" style={{ marginBottom: 16 }}>
            {ergebnis.roh.richtig} von {ergebnis.roh.gesamt} richtig{ergebnis.roh.text ? ` · ${ergebnis.roh.text}` : ''}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
            {ergebnis.quittung.stufeNeu > ergebnis.quittung.stufeVorher && <span className="bt-chip bt-chip-gut"><TrendingUp size={13} />Stufe {ergebnis.quittung.stufeVorher} → {ergebnis.quittung.stufeNeu}</span>}
            {ergebnis.quittung.stufeNeu < ergebnis.quittung.stufeVorher && <span className="bt-chip bt-chip-warm"><TrendingDown size={13} />Stufe {ergebnis.quittung.stufeVorher} → {ergebnis.quittung.stufeNeu} (zum Festigen)</span>}
            {ergebnis.quittung.stufeNeu === ergebnis.quittung.stufeVorher && <span className="bt-chip">Stufe {ergebnis.quittung.stufeNeu} bleibt</span>}
            {ergebnis.quittung.bestwert && <span className="bt-chip bt-chip-akzent"><Award size={13} />Neuer Bestwert</span>}
          </div>
          {ergebnis.quittung.neueAbzeichen.length > 0 && (
            <div className="bt-hinweis" style={{ justifyContent: 'center', marginBottom: 20 }}>
              <Award size={16} style={{ flex: 'none', marginTop: 2 }} />
              <span><b>Neues Abzeichen:</b> {ergebnis.quittung.neueAbzeichen.map(a => a.name).join(', ')}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className={`bt-knopf ${onWeiter ? 'bt-knopf-leise' : ''}`} onClick={starte} data-bt-nochmal><RotateCcw size={15} />Nochmal</button>
            {onWeiter
              ? <button type="button" className="bt-knopf" onClick={onWeiter} data-bt-weiter-uebung>{weiterText ?? 'Weiter'}<ArrowRight size={15} /></button>
              : <button type="button" className="bt-knopf bt-knopf-leise" onClick={onZurueck}>Zur Übersicht</button>}
          </div>
        </div>
      )}
    </div>
  )
}
