// IQ-Test — Einstieg, Test, Ergebnis.
// 10, 20 oder 30 Fragen auf Zeit. Aufgabenarten wie in gängigen Tests, adaptive Auswertung,
// Ergebnis als Schätzwert mit Bereich. Gespeichert/geteilt wird nur auf ausdrücklichen Wunsch.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrainCircuit, Clock, Info, Lock, Play, Trash2 } from 'lucide-react'
import type { IqEintrag, KatalogEintrag } from '../kern/typen'
import { neuerStart } from '../kern/zufall'
import { useBrain } from '../kern/speicher'
import { IqVerlauf } from '../fortschritt/diagramme'
import TeilenDialog from '../duell/TeilenDialog'
import { bereichText, iqText, rangText } from './irt'
import { DAUER_MIN, IQ_GEBIETE, alsEintrag, werteAus, type IqAuswertung, type TestLaenge } from './test'
import { ladeIqAufgaben, type IqGeneratoren } from './aufgaben'
import IqLauf, { type IqRohergebnis } from './IqLauf'
import IqErgebnis from './IqErgebnis'

/** mittlere Breite des 90-%-Bereichs je Testlänge (gemessen in der Simulation, .tmp-test/brain/iq_test.ts) */
const BEREICH: Record<TestLaenge, number> = { 10: 13, 20: 9, 30: 8 }
const LAENGEN: { n: TestLaenge; titel: string; text: string }[] = [
  { n: 10, titel: 'Kurz', text: 'Erster Eindruck' },
  { n: 20, titel: 'Mittel', text: 'Guter Kompromiss' },
  { n: 30, titel: 'Ausführlich', text: 'Am genauesten' },
]

type Phase = 'start' | 'laedt' | 'lauf' | 'ergebnis'

export default function IqBereich({ onSperre, onUebung }: { onSperre: (an: boolean) => void; onUebung: (u: KatalogEintrag) => void }) {
  const gespeicherte = useBrain(s => s.daten.iq)
  const zustimmung = useBrain(s => s.zustimmung)
  const speichereIq = useBrain(s => s.speichereIq)
  const loescheIq = useBrain(s => s.loescheIq)
  const [phase, setPhase] = useState<Phase>('start')
  const [laenge, setLaenge] = useState<TestLaenge>(20)
  const [generatoren, setGeneratoren] = useState<IqGeneratoren | null>(null)
  const [start, setStart] = useState(0)
  const [roh, setRoh] = useState<IqRohergebnis | null>(null)
  const [auswertung, setAuswertung] = useState<IqAuswertung | null>(null)
  const [eintrag, setEintrag] = useState<IqEintrag | null>(null)
  const [gespeichert, setGespeichert] = useState(false)
  const [teilen, setTeilen] = useState(false)
  const [fehler, setFehler] = useState('')

  // solange der Test läuft, die Navigation sperren (kein versehentliches Verlassen)
  useEffect(() => { onSperre(phase === 'lauf'); return () => onSperre(false) }, [phase, onSperre])

  const starte = useCallback(async (n: TestLaenge) => {
    setLaenge(n); setFehler(''); setPhase('laedt')
    try {
      const g = generatoren ?? await ladeIqAufgaben()
      setGeneratoren(g)
      setStart(neuerStart()); setRoh(null); setAuswertung(null); setEintrag(null); setGespeichert(false)
      setPhase('lauf')
    } catch (e) { setFehler((e as Error).message || 'Aufgaben konnten nicht geladen werden'); setPhase('start') }
  }, [generatoren])

  const fertig = useCallback((r: IqRohergebnis) => {
    const a = werteAus(r.antworten)
    setRoh(r); setAuswertung(a); setEintrag(alsEintrag(a, laenge, r.dauerSek)); setPhase('ergebnis')
  }, [laenge])

  const verlauf = useMemo(() => gespeicherte.slice(-12).map(e => ({ t: e.t, iq: e.iq, von: e.von, bis: e.bis, fragen: e.fragen })), [gespeicherte])

  // Aufgaben, die man gerade erst gesehen hat (im Training oder im letzten Test), sollen im Test nicht
  // wiederkommen — sonst misst er Erinnerung statt Denken. Gemerkt werden nur Prüfsummen, keine Antworten.
  const merkeGesehen = useBrain(s => s.merkeGesehen)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const vermeide = useMemo(() => new Set(Object.values(useBrain.getState().daten.gesehen).flat()), [start])
  const gezeigt = useCallback((hash: number) => merkeGesehen('iq', hash, 90), [merkeGesehen])

  if (phase === 'lauf' && generatoren) {
    return <div className="bt-breite"><IqLauf key={start} laenge={laenge} generatoren={generatoren} start={start} vermeide={vermeide} onGezeigt={gezeigt} onFertig={fertig} onAbbruch={() => setPhase('start')} /></div>
  }
  if (phase === 'ergebnis' && auswertung && roh && eintrag) {
    return (
      <>
        <IqErgebnis a={auswertung} laenge={laenge} dauerSek={roh.dauerSek} aufgaben={roh.aufgaben}
          speicherbar={zustimmung === true} gespeichert={gespeichert}
          onSpeichern={() => { speichereIq(eintrag); setGespeichert(true) }}
          onTeilen={() => setTeilen(true)} onUebung={onUebung} onNeu={() => setPhase('start')} />
        {teilen && <TeilenDialog eintrag={eintrag} onZu={() => setTeilen(false)} />}
      </>
    )
  }

  return (
    <div className="bt-breite" style={{ maxWidth: 940 }} data-bt-bereich="iq">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
        <span className="bt-symbol" style={{ width: 46, height: 46 }}><BrainCircuit size={22} /></span>
        <div>
          <h1 className="bt-h1">IQ-Test</h1>
          <p className="bt-leise" style={{ margin: '2px 0 0' }}>Sieben Gebiete, Aufgaben auf Zeit — am Ende ein Schätzwert mit Bereich und dein Profil.</p>
        </div>
      </div>

      <div className="bt-raster" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', margin: '18px 0' }}>
        {LAENGEN.map(l => (
          <button key={l.n} type="button" className="bt-karte bt-karte-klick" style={{ padding: 20 }} disabled={phase === 'laedt'} onClick={() => void starte(l.n)} data-bt-iq-start={l.n}>
            <div className="bt-label">{l.titel}</div>
            <div className="bt-held" style={{ fontSize: 44, margin: '6px 0 2px' }}>{l.n} <span style={{ fontSize: 16, fontWeight: 500, letterSpacing: 0 }} className="bt-leise">Fragen</span></div>
            <div className="bt-klein bt-leise" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={12} />etwa {DAUER_MIN[l.n]} Minuten</div>
            <div className="bt-klein bt-leise" style={{ marginTop: 4 }}>{l.text} · Bereich etwa ±{BEREICH[l.n]} Punkte</div>
            <div className="bt-knopf" style={{ marginTop: 14, width: '100%' }}><Play size={15} />{phase === 'laedt' && laenge === l.n ? 'Lädt …' : 'Starten'}</div>
          </button>
        ))}
      </div>
      {fehler && <div className="bt-hinweis" style={{ background: 'var(--bt-schlecht-weich)', marginBottom: 14 }}>{fehler}</div>}

      <div className="bt-raster" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <section className="bt-karte">
          <h2 className="bt-h3" style={{ marginBottom: 8 }}>So läuft der Test</h2>
          <ul className="bt-liste">
            <li>Jede Aufgabe hat ihre eigene Zeit (oben läuft ein Balken). Ist sie um, geht es weiter.</li>
            <li>Der Test passt sich an: Nach richtigen Antworten werden die Aufgaben schwerer, nach falschen leichter. So misst er mit wenigen Fragen möglichst genau.</li>
            <li>Rückmeldung gibt es erst am Ende — dann aber zu jeder Aufgabe mit Lösung.</li>
            <li>Such dir einen ruhigen Moment, ohne Zettel und Taschenrechner.</li>
          </ul>
          <div className="bt-klein bt-leise" style={{ marginTop: 12 }}><b style={{ color: 'var(--bt-ink)' }}>Die Gebiete:</b> {IQ_GEBIETE.map(g => g.name).join(' · ')}</div>
        </section>
        <section className="bt-karte">
          <h2 className="bt-h3" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}><Info size={15} />Was das Ergebnis bedeutet</h2>
          <p className="bt-klein bt-leise" style={{ margin: 0 }}>
            Der Test nutzt die Aufgabenarten gängiger Intelligenztests, die übliche Skala (Durchschnitt 100, Streuung 15) und ein anerkanntes Auswertungsverfahren. Er ist aber nicht — wie ein offizieller Test — an tausenden Personen geeicht. Du bekommst deshalb einen <b style={{ color: 'var(--bt-ink)' }}>Schätzwert mit Bereich</b> als Orientierung, kein amtliches Ergebnis.
          </p>
          <p className="bt-klein bt-leise" style={{ margin: '10px 0 0', display: 'flex', gap: 6 }}><Lock size={12} style={{ flex: 'none', marginTop: 3 }} /><span>Dein Ergebnis siehst nur du. Am Ende entscheidest du, ob es für dich gespeichert wird und ob du es teilen möchtest.</span></p>
        </section>
      </div>

      {gespeicherte.length > 0 && (
        <section className="bt-karte" style={{ marginTop: 14 }} data-bt-iq-gespeichert>
          <h2 className="bt-h3" style={{ marginBottom: 2 }}>Deine gespeicherten Tests</h2>
          <div className="bt-klein bt-leise" style={{ marginBottom: 8 }}>Punkt = Schätzwert, Strich = wahrscheinlicher Bereich. Nur für dich sichtbar.</div>
          <IqVerlauf eintraege={verlauf} />
          <table className="bt-tabelle" style={{ marginTop: 10 }}>
            <thead><tr><th>Datum</th><th>Fragen</th><th>Schätzwert</th><th>Bereich</th><th>Prozentrang</th><th /></tr></thead>
            <tbody>
              {gespeicherte.slice().reverse().map(e => (
                <tr key={e.t}>
                  <td>{new Date(e.t).toLocaleDateString('de-DE')}</td><td>{e.fragen}</td>
                  <td><b>{iqText(e.iq)}</b></td><td>{bereichText(e.von, e.bis)}</td><td>{rangText(e.iq, e.prozentrang)}</td>
                  <td style={{ textAlign: 'right' }}><button type="button" className="bt-knopf bt-knopf-nackt" style={{ padding: 4 }} onClick={() => loescheIq(e.t)} aria-label="Diesen Test löschen" title="Diesen Test löschen"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
