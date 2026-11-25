// Der Coach — Ernstfall-Fahrplan (Stufe 2): echter Termin → Etappen (Woche davor, Vortag, Stunde, fünf Minuten,
// letzte Minute, danach) → kurze Auswertung. Erinnerungen außerhalb des Raums nennen nie den Anlass.
import { useEffect, useState } from 'react'
import { CalendarClock, Check, Plus, Trash2 } from 'lucide-react'
import type { Leben } from '../kern/inhaltTypen'
import type { Ernstfall } from '../kern/typen'
import { useCoach } from '../kern/speicher'
import { ladeLeben } from '../kern/inhalt'
import { auswertungOffen, etappeErledigt, etappenHeute, type EtappeHeute } from '../kern/leben'
import { heute, tagNummer, uhrzeit } from '../kern/zeit'
const jetztMinuten = (): number => { const [h, m] = uhrzeit().split(':').map(Number); return h * 60 + m }
import { Laedt } from '../ansicht/hilfen'
import { ErnstfallEingabe } from '../uebungen/Werkzeuge'
import { Anspannung } from '../uebungen/Gefuehrt'
import { Weiter } from '../uebungen/Lesen'

const datumText = (iso: string): string => { const [j, m, t] = iso.split('-'); return `${Number(t)}.${Number(m)}.${j}` }

/** eine fällige Etappe als Karte (auch auf „Heute“) */
export function EtappeKarte({ e, onErledigt }: { e: EtappeHeute; onErledigt?: () => void }) {
  return (
    <div className="dc-karte-flach dc-spalte" style={{ gap: 6 }} data-dc-etappe={e.etappe}>
      <span className="dc-ober"><CalendarClock size={12} style={{ verticalAlign: -1 }} /> {e.ernstfall.titel} · {e.titel}</span>
      <ol style={{ margin: 0, paddingLeft: 20 }}>{e.schritte.map((s, i) => <li key={i}>{s}</li>)}</ol>
      {(e.etappe === 'vortag') && (e.ernstfall.erster || e.ernstfall.letzter) && <span className="dc-klein">{e.ernstfall.erster && <>Erster Satz: <b>{e.ernstfall.erster}</b> </>}{e.ernstfall.letzter && <>Letzter Satz: <b>{e.ernstfall.letzter}</b></>}</span>}
      <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="dc-knopf dc-knopf-leise" onClick={() => { useCoach.getState().aendere(d => etappeErledigt(d, e.ernstfall.id, e.etappe)); onErledigt?.() }} data-dc-etappe-erledigt><Check size={14} />erledigt</button>
      </div>
    </div>
  )
}

function Auswertung({ e, leben, onFertig }: { e: Ernstfall; leben: Leben; onFertig: () => void }) {
  const a = leben.notfall.find(x => x.art === e.art) ?? leben.notfall.find(x => x.art === 'sonst')
  const fragen = a?.auswertung ?? ['Wie lief es?', 'Was hat geholfen?', 'Was nimmst du mit?']
  const [lief, setLief] = useState<number | null>(null)
  const [anspannung, setAnspannung] = useState<number | null>(null)
  const [antworten, setAntworten] = useState<string[]>(() => fragen.map(() => ''))
  const speichere = () => {
    const mitnehmen = antworten.map(x => x.trim()).filter(Boolean).join(' · ')
    useCoach.getState().aendere(d => ({ ...d, ernstfaelle: d.ernstfaelle.map(x => (x.id === e.id ? { ...x, auswertung: { lief: lief ?? 50, anspannung: anspannung ?? 50, mitnehmen } } : x)) }))
    if (mitnehmen) useCoach.getState().schreibeIns({ art: 'reflexion', text: `${e.titel}: ${mitnehmen}`, bezug: e.id })
    onFertig()
  }
  return (
    <div className="dc-karte dc-spalte dc-ein" data-dc-auswertung={e.id}>
      <span className="dc-ober">Nachbereitung · {e.titel}</span>
      <label className="dc-spalte" style={{ gap: 4 }}><span className="dc-klein">Wie lief es insgesamt? <b className="dc-zahl">{lief ?? '–'}</b> <span className="dc-stumm">(0 = schlecht, 100 = sehr gut)</span></span>
        <input type="range" min={0} max={100} step={5} value={lief ?? 50} onChange={x => setLief(Number(x.target.value))} /></label>
      <Anspannung titel="Wie angespannt warst du am schlimmsten Punkt?" wert={anspannung} setWert={setAnspannung} />
      {fragen.map((f, i) => <label key={i} className="dc-spalte" style={{ gap: 4 }}><b className="dc-klein">{f}</b><input className="dc-eingabe" value={antworten[i]} onChange={x => setAntworten(y => y.map((z, j) => (j === i ? x.target.value : z)))} /></label>)}
      <Weiter text="Speichern" onClick={speichere} />
    </div>
  )
}

/** Notfallkoffer-Reiter: Ernstfälle anlegen, Fahrplan sehen, auswerten */
export function ErnstfallBereich({ auswerten }: { auswerten?: string }) {
  const [leben, setLeben] = useState<Leben | null>(null)
  const [neu, setNeu] = useState(false)
  const [aus, setAus] = useState<string | null>(auswerten ?? null)
  const d = useCoach(s => s.daten)
  useEffect(() => { void ladeLeben().then(setLeben) }, [])
  if (!leben) return <Laedt />
  const tag = heute()
  const nr = tagNummer(tag)
  if (neu) return <div className="dc-karte"><ErnstfallEingabe onFertig={e => { if (e) useCoach.getState().aendere(x => ({ ...x, ernstfaelle: [...x.ernstfaelle, e].slice(-20) })); setNeu(false); void useCoach.getState().sichere() }} /></div>
  const fall = aus ? d.ernstfaelle.find(e => e.id === aus) : undefined
  if (fall) return <Auswertung e={fall} leben={leben} onFertig={() => { setAus(null); void useCoach.getState().sichere() }} />
  const faellig = etappenHeute(d, leben.notfall, tag, jetztMinuten())
  const offen = auswertungOffen(d, tag, jetztMinuten())
  const kommend = d.ernstfaelle.filter(e => !e.auswertung && tagNummer(e.datum) > nr).sort((a, b) => a.datum.localeCompare(b.datum))
  const vorbei = d.ernstfaelle.filter(e => e.auswertung).slice(-5).reverse()
  const loesche = (id: string) => useCoach.getState().aendere(x => ({ ...x, ernstfaelle: x.ernstfaelle.filter(e => e.id !== id) }))
  return (
    <div className="dc-spalte" data-dc-ernstfaelle>
      <div className="dc-reihe" style={{ justifyContent: 'space-between' }}><span className="dc-ober">Ernstfall-Fahrplan</span><button type="button" className="dc-knopf dc-knopf-leise" onClick={() => setNeu(true)} data-dc-ernstfall-neu><Plus size={14} />Termin eintragen</button></div>
      {!d.ernstfaelle.length && <span className="dc-klein dc-leise">Steht eine Rede, ein schwieriges Gespräch oder eine Prüfung an? Trag den Termin ein – Bruno legt dir den Weg dorthin in Etappen an und stellt dein Training darauf ein.</span>}
      {faellig.map(e => <EtappeKarte key={`${e.ernstfall.id}-${e.etappe}`} e={e} />)}
      {offen.map(e => <button key={e.id} type="button" className="dc-wahl" data-an="1" onClick={() => setAus(e.id)} data-dc-auswerten={e.id}><span><b>{e.titel}</b> ist vorbei – drei kurze Fragen zur Nachbereitung</span></button>)}
      {kommend.map(e => (
        <div key={e.id} className="dc-karte-flach dc-reihe" style={{ justifyContent: 'space-between' }}>
          <span><b>{e.titel}</b> <span className="dc-klein dc-stumm">· {datumText(e.datum)}{e.zeit ? `, ${e.zeit} Uhr` : ''} · in {tagNummer(e.datum) - nr} {tagNummer(e.datum) - nr === 1 ? 'Tag' : 'Tagen'}</span></span>
          <button type="button" className="dc-knopf dc-knopf-nackt" onClick={() => loesche(e.id)} aria-label="Termin streichen" title="Termin streichen"><Trash2 size={14} /></button>
        </div>
      ))}
      {vorbei.length > 0 && <details><summary className="dc-klein" style={{ cursor: 'pointer' }}>Frühere Ernstfälle</summary>
        <div className="dc-spalte" style={{ gap: 4, marginTop: 6 }}>{vorbei.map(e => <span key={e.id} className="dc-klein"><b>{e.titel}</b> ({datumText(e.datum)}) · lief {e.auswertung!.lief}/100{e.auswertung!.mitnehmen ? ` · ${e.auswertung!.mitnehmen}` : ''}</span>)}</div></details>}
    </div>
  )
}
