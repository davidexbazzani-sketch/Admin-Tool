// Der Coach — Sprechbild (Stufe 4): Startaufnahme eines festen Lesetexts und spätere Vergleiche damit.
// Gemessen werden Tempo, Pausen, Satzenden, Melodie und Lautstärke-Spannweite – nur gegen die eigene Startaufnahme.
// Töne werden nur mit dem Schalter „Vergleichsaufnahmen behalten“ abgelegt (verschlüsselt, höchstens acht).
import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import type { Lesetext } from '../kern/inhaltTypen'
import type { Aufnahme } from '../kern/typen'
import { useCoach } from '../kern/speicher'
import { ladeLesetext } from '../kern/inhalt'
import { vergleiche, type Messung } from '../kern/mikro/analyse'
import { datumAus } from '../kern/zeit'
import { Aufnahmeknopf } from '../uebungen/Sprechen'
import { legeAufnahmeAb, ladeTon, merkeMessung, miss } from '../ton/messen'
import { ausBase64, spieleAufnahme, type Aufgenommen } from '../ton/aufnahme'

const TEXT = 'lesetext-01'
const datum = (tag: number): string => { const [j, m, t] = datumAus(tag).split('-'); return `${Number(t)}.${Number(m)}.${j}` }

export function Sprechbild() {
  const mikrofon = useCoach(s => s.daten.profil.mikrofon)
  const behalten = useCoach(s => s.daten.profil.aufnahmenBehalten)
  const stottern = useCoach(s => s.daten.profil.schwerpunkte.includes('stottern'))
  const messungen = useCoach(s => s.daten.messungen)
  const start = messungen.find(x => x.art === 'start')
  const vergleiche_ = messungen.filter(x => x.art === 'vergleich')
  const [text, setText] = useState<Lesetext | null>(null)
  const [modus, setModus] = useState<'aus' | 'start' | 'vergleich'>('aus')
  const [jetzt, setJetzt] = useState<Messung | null>(null)
  const [fehler, setFehler] = useState(false)
  const [ton, setTon] = useState<Aufnahme[]>([])
  useEffect(() => { void ladeLesetext(TEXT).then(setText) }, [])
  useEffect(() => { if (behalten) void ladeTon().then(t => setTon(t.aufnahmen)) }, [behalten, messungen.length])
  if (!mikrofon) return <div className="dc-karte-flach dc-klein dc-leise" data-dc-sprechbild>Sprechbild: Das Mikrofon ist in den Einstellungen ausgeschaltet.</div>
  const fertig = async (a: Aufgenommen) => {
    setFehler(false)
    const m = await miss(a.daten, text?.silben)
    if (!m) { setFehler(true); return }
    const art = modus === 'start' ? 'start' : 'vergleich'
    merkeMessung(art, m, TEXT)
    await legeAufnahmeAb(a, art === 'start' ? 'start' : 'formcheck', art === 'start' ? 'Startaufnahme' : `Vergleich ${datum(useCoach.getState().daten.messungen.slice(-1)[0]?.tag ?? 0)}`)
    void useCoach.getState().sichere()
    setJetzt(m); setModus('aus')
  }
  const zeilen = start && (jetzt ?? vergleiche_[vergleiche_.length - 1]?.m) ? vergleiche(start.m, (jetzt ?? vergleiche_[vergleiche_.length - 1].m)).filter(z => !stottern || !/Tempo|Pausen/.test(z.was)) : []
  return (
    <div className="dc-karte dc-spalte" data-dc-sprechbild>
      <h2 className="dc-h2">Dein Sprechbild</h2>
      {!start && modus === 'aus' && <>
        <p style={{ margin: 0 }}>Lies einmal einen kurzen Text vor – so, wie du heute sprichst. Das ist deine Startaufnahme. In ein paar Wochen liest du denselben Text noch einmal, und Bruno zeigt dir, was sich verändert hat.</p>
        <span className="dc-klein dc-stumm">Gemessen wird nur auf diesem PC. {behalten ? 'Die Aufnahme wird verschlüsselt abgelegt (Einstellungen: „Vergleichsaufnahmen behalten“).' : 'Gespeichert werden nur die Messwerte, nicht der Ton.'}</span>
        <div><button type="button" className="dc-knopf" onClick={() => setModus('start')} data-dc-sprechbild-start>Startaufnahme machen</button></div>
      </>}
      {modus !== 'aus' && text && <div className="dc-spalte dc-ein" data-dc-sprechbild-lauf>
        <span className="dc-ober">{modus === 'start' ? 'Startaufnahme' : 'Vergleich'} · „{text.titel}“</span>
        <p className="dc-gross" style={{ margin: 0, lineHeight: 1.6 }}>{text.text}</p>
        <span className="dc-klein dc-stumm">Ruhig und wie immer lesen – nicht besonders schön. Etwa 20 Sekunden.</span>
        <div className="dc-reihe"><Aufnahmeknopf name="Text" silben={text.silben} ohneMessung onAufnahme={a => { void fertig(a) }} /><button type="button" className="dc-knopf dc-knopf-nackt" onClick={() => setModus('aus')}>Abbrechen</button></div>
        {fehler && <span className="dc-klein" style={{ color: 'var(--dc-rot)' }}>Das war zu leise oder zu kurz zum Messen. Noch einmal, etwas näher am Mikrofon?</span>}
      </div>}
      {start && modus === 'aus' && <>
        <span className="dc-klein dc-leise">Startaufnahme vom {datum(start.tag)}{vergleiche_.length ? ` · ${vergleiche_.length} ${vergleiche_.length === 1 ? 'Vergleich' : 'Vergleiche'}` : ''}</span>
        {zeilen.length > 0 && <table className="dc-klein" style={{ borderCollapse: 'collapse', width: '100%' }} data-dc-vergleich>
          <thead><tr style={{ textAlign: 'left', color: 'var(--dc-stumm)' }}><th style={{ fontWeight: 500, padding: '4px 0' }}>Messwert</th><th style={{ fontWeight: 500 }}>Start</th><th style={{ fontWeight: 500 }}>Zuletzt</th><th style={{ fontWeight: 500 }}>Was das heißt</th></tr></thead>
          <tbody>{zeilen.map(z => <tr key={z.was} style={{ borderTop: '1px solid var(--dc-rand)' }}><td style={{ padding: '5px 8px 5px 0' }}>{z.was}</td><td className="dc-zahl">{z.start}</td><td className="dc-zahl"><b>{z.jetzt}</b></td><td>{z.satz}</td></tr>)}</tbody>
        </table>}
        <span className="dc-klein dc-stumm">{stottern ? 'Tempo und Pausen zeigt Bruno hier bewusst nicht – es geht nicht ums Glätten.' : 'Weder schneller noch langsamer ist automatisch besser. Gut ist, was zum Inhalt passt: Pausen nach wichtigen Sätzen, tragende Satzenden.'} Raum, Mikrofon und Tagesform verändern die Werte – Unterschiede von wenigen Prozent sind Rauschen.</span>
        <div className="dc-reihe">
          <button type="button" className="dc-knopf" onClick={() => { setJetzt(null); setModus('vergleich') }} data-dc-sprechbild-vergleich>Vergleich aufnehmen</button>
          <button type="button" className="dc-knopf dc-knopf-nackt dc-klein" onClick={() => setModus('start')}>Neue Startaufnahme</button>
        </div>
        {behalten && ton.length > 0 && <div className="dc-reihe" style={{ gap: 6 }}>{ton.map(a => <button key={a.id} type="button" className="dc-knopf dc-knopf-leise dc-klein" onClick={() => void spieleAufnahme(ausBase64(a.daten))}><Play size={13} />{a.titel}</button>)}</div>}
      </>}
    </div>
  )
}
