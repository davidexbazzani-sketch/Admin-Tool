// Der Coach — Werkzeuge fürs eigene Leben (Stufe 2): erzählen, planen, ordnen, schreiben.
// Ohne Wertung – das Ergebnis geht ins Buch, in den Kompass oder in den Notfallkoffer.
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { ErnstfallArt, Schritt } from '../kern/inhaltTypen'
import { heute, tagNummer, plusTage } from '../kern/zeit'
import { Bruno, T } from '../ansicht/hilfen'
import type { BausteinProps } from './typen'
import { Weiter } from './Lesen'

const neueId = (p: string) => `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`

/** Bruno erzählt einen kurzen Fall */
export function Geschichte({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'geschichte' }>>) {
  const [text, setText] = useState('')
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="geschichte">
      <span className="dc-ober">Bruno erzählt</span>
      <h3 className="dc-h2" style={{ margin: 0 }}>{s.titel}</h3>
      <div className="dc-karte-flach dc-gross" style={{ lineHeight: 1.6 }}><span className="dc-klein dc-stumm" style={{ display: 'block', marginBottom: 4 }}>{s.figur}</span><T t={s.text} /></div>
      {s.frage && <label className="dc-spalte" style={{ gap: 4 }}><b><T t={s.frage} /></b><textarea className="dc-eingabe" rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="Ein, zwei Sätze – nur für dich" data-dc-eingabe /></label>}
      <Weiter onClick={() => onFertig(text.trim() ? { buch: { art: 'reflexion', text: text.trim() } } : {})} />
    </div>
  )
}

/** eigenes Erlebnis als erzählfertige Mini-Geschichte – landet im Geschichten-Schatz */
export function Geschichtenbau({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'geschichtenbau' }>>) {
  const [werte, setWerte] = useState<string[]>(() => s.felder.map(() => ''))
  const [offen, setOffen] = useState(false)
  const gefuellt = werte.filter(w => w.trim()).length
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="geschichtenbau">
      <span className="dc-ober">Geschichten-Baukasten</span>
      <p style={{ margin: 0, fontWeight: 600 }}><T t={s.auftrag} /></p>
      {s.felder.map((f, i) => (
        <label key={i} className="dc-spalte" style={{ gap: 4 }}><span className="dc-klein"><b>{f.name}</b> <span className="dc-stumm">– {f.hilfe}</span></span>
          <textarea className="dc-eingabe" rows={2} value={werte[i]} disabled={offen} onChange={e => setWerte(w => w.map((x, j) => (j === i ? e.target.value : x)))} data-dc-eingabe={i === 0 ? '' : undefined} /></label>
      ))}
      {!offen ? <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}><button type="button" className="dc-knopf" onClick={() => setOffen(true)} data-dc-pruefen>Mit Beispiel vergleichen</button></div>
        : <>{s.muster.map((m, i) => <div key={i} className="dc-karte-flach"><T t={m} /></div>)}
          {gefuellt > 0 && <span className="dc-klein dc-stumm">Deine Geschichte kommt in den Geschichten-Schatz – erzählfertig für Smalltalk und Reden.</span>}
          <Weiter onClick={() => onFertig({ wert: gefuellt / s.felder.length, selbst: true, buch: gefuellt ? { art: 'geschichte', text: werte.filter(Boolean).join(' – ') } : undefined })} /></>}
    </div>
  )
}

/** Gespräch vorbereiten – als Karte zum Mitnehmen */
export function Gespraechskarte({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'gespraechskarte' }>>) {
  const felder = [
    { k: 'ziel', name: 'Mein Ziel', hilfe: 'in einem Satz' },
    { k: 'erster', name: 'Mein erster Satz', hilfe: 'wörtlich' },
    { k: 'wunsch', name: 'Worum ich bitte', hilfe: 'der nächste Schritt' },
    { k: 'planB', name: 'Plan B', hilfe: 'wenn es anders läuft' },
  ] as const
  const [w, setW] = useState<Record<string, string>>({})
  const voll = felder.filter(f => (w[f.k] ?? '').trim()).length
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="gespraechskarte">
      <span className="dc-ober">Gesprächskarte</span>
      <p style={{ margin: 0, fontWeight: 600 }}><T t={s.anlass} /></p>
      {felder.map(f => (
        <label key={f.k} className="dc-spalte" style={{ gap: 4 }}><span className="dc-klein"><b>{f.name}</b> <span className="dc-stumm">– {f.hilfe}</span></span>
          <input className="dc-eingabe" value={w[f.k] ?? ''} onChange={e => setW(x => ({ ...x, [f.k]: e.target.value }))} placeholder={s.beispiel ? `z. B. ${s.beispiel[f.k]}` : ''} data-dc-eingabe={f.k === 'ziel' ? '' : undefined} /></label>
      ))}
      <span className="dc-klein dc-stumm">Die Karte liegt danach in deinem Buch unter „Pläne“ – zum kurzen Durchlesen vor dem Gespräch.</span>
      <Weiter text={voll ? 'Karte speichern' : 'Überspringen'} onClick={() => onFertig(voll ? { buch: { art: 'plan', text: `Gesprächskarte: ${felder.map(f => `${f.name}: ${(w[f.k] ?? '').trim() || '–'}`).join(' · ')}` } } : {})} />
    </div>
  )
}

const ARTEN: { id: ErnstfallArt; name: string }[] = [
  { id: 'rede', name: 'Rede oder Vortrag' }, { id: 'gespraech', name: 'schwieriges Gespräch' }, { id: 'pruefung', name: 'Prüfung' },
  { id: 'vorstellung', name: 'Vorstellungsgespräch' }, { id: 'telefon', name: 'wichtiges Telefonat' }, { id: 'sonst', name: 'etwas anderes' },
]
/** Ernstfall eintragen – der Coach baut den Weg dorthin */
export function Fahrplan({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'fahrplan' }>>) {
  return <ErnstfallEingabe anlass={s.anlass} onFertig={e => onFertig(e ? { ernstfall: e } : {})} />
}
export function ErnstfallEingabe({ anlass, onFertig }: { anlass?: string; onFertig: (e: import('../kern/typen').Ernstfall | null) => void }) {
  const [titel, setTitel] = useState('')
  const [art, setArt] = useState<ErnstfallArt>('rede')
  const [datum, setDatum] = useState(plusTage(heute(), 7))
  const [erster, setErster] = useState('')
  const [zeit, setZeit] = useState('')
  const ok = titel.trim() && tagNummer(datum) >= tagNummer(heute())
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="fahrplan">
      <span className="dc-ober">Ernstfall-Fahrplan</span>
      {anlass && <p style={{ margin: 0, fontWeight: 600 }}><T t={anlass} /></p>}
      <p className="dc-klein dc-leise" style={{ margin: 0 }}>Trag einen echten Termin ein. Bruno legt den Weg dorthin an: in der Woche davor proben, am Vortag erster und letzter Satz, in der Stunde davor bewegen und den Raum ansehen, in den letzten Minuten runterfahren – und danach drei kurze Fragen. Erinnerungen nennen nie den Anlass.</p>
      <label className="dc-spalte" style={{ gap: 4 }}><b>Was steht an?</b><input className="dc-eingabe" value={titel} onChange={e => setTitel(e.target.value)} placeholder="z. B. Vortrag im Team" data-dc-eingabe /></label>
      <div className="dc-reihe">{ARTEN.map(a => <button key={a.id} type="button" className="dc-chip" style={{ cursor: 'pointer', borderColor: art === a.id ? 'var(--dc-rot)' : undefined, color: art === a.id ? 'var(--dc-ink)' : undefined }} aria-pressed={art === a.id} onClick={() => setArt(a.id)}>{a.name}</button>)}</div>
      <label className="dc-reihe"><b>Wann?</b><input type="date" className="dc-eingabe" style={{ width: 170 }} value={datum} min={heute()} onChange={e => setDatum(e.target.value)} data-dc-datum /><b>Uhrzeit</b><input type="time" className="dc-eingabe" style={{ width: 120 }} value={zeit} onChange={e => setZeit(e.target.value)} /><span className="dc-klein dc-stumm">(wenn bekannt)</span></label>
      <label className="dc-spalte" style={{ gap: 4 }}><span className="dc-klein"><b>Dein erster Satz</b> <span className="dc-stumm">– wenn du ihn schon weißt</span></span><input className="dc-eingabe" value={erster} onChange={e => setErster(e.target.value)} /></label>
      <div className="dc-reihe" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="dc-knopf dc-knopf-nackt" onClick={() => onFertig(null)}>Später</button>
        <button type="button" className="dc-knopf" disabled={!ok} onClick={() => onFertig({ id: neueId('ef'), titel: titel.trim(), art, datum, ...(zeit ? { zeit } : {}), ...(erster.trim() ? { erster: erster.trim() } : {}), erledigt: [] })} data-dc-weiter>Fahrplan anlegen</button>
      </div>
    </div>
  )
}

/** eigene Angst-Leiter: bis zu zehn Stufen mit Anspannung (0–100), sortiert von leicht nach schwer */
export function Leiter({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'leiter' }>>) {
  return <LeiterBau auftrag={s.auftrag} beispiel={s.beispiel} onFertig={l => onFertig(l ? { leiter: l } : {})} />
}
export function LeiterBau({ auftrag, beispiel, onFertig }: { auftrag: string; beispiel: string[]; onFertig: (l: import('../kern/typen').EigeneLeiter | null) => void }) {
  const [titel, setTitel] = useState('')
  const [stufen, setStufen] = useState<{ text: string; anspannung: number }[]>([{ text: '', anspannung: 20 }, { text: '', anspannung: 50 }, { text: '', anspannung: 80 }])
  const gueltig = stufen.filter(x => x.text.trim())
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="leiter">
      <span className="dc-ober">Deine eigene Leiter</span>
      <p style={{ margin: 0, fontWeight: 600 }}><T t={auftrag} /></p>
      <span className="dc-klein dc-stumm">Beispiel: {beispiel.join(' → ')}</span>
      <label className="dc-spalte" style={{ gap: 4 }}><b>Wovor?</b><input className="dc-eingabe" value={titel} onChange={e => setTitel(e.target.value)} placeholder="z. B. Telefonieren mit Fremden" data-dc-eingabe /></label>
      {stufen.map((x, i) => (
        <div key={i} className="dc-reihe" style={{ flexWrap: 'nowrap' }}>
          <span className="dc-chip dc-zahl">{i + 1}</span>
          <input className="dc-eingabe" value={x.text} onChange={e => setStufen(st => st.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))} placeholder="Stufe" />
          <label className="dc-klein dc-reihe" style={{ gap: 4, flex: 'none' }} title="Anspannung 0–100"><input type="number" min={0} max={100} className="dc-eingabe" style={{ width: 70 }} value={x.anspannung} onChange={e => setStufen(st => st.map((y, j) => (j === i ? { ...y, anspannung: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } : y)))} />%</label>
          <button type="button" className="dc-knopf dc-knopf-nackt" aria-label="Stufe entfernen" onClick={() => setStufen(st => st.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
        </div>
      ))}
      {stufen.length < 10 && <button type="button" className="dc-knopf dc-knopf-leise" style={{ alignSelf: 'flex-start' }} onClick={() => setStufen(st => [...st, { text: '', anspannung: 50 }])}><Plus size={14} />Stufe</button>}
      <span className="dc-klein dc-stumm">Bruno sortiert nach Anspannung. Angefangen wird unten – knapp über dem Gewohnten.</span>
      <div className="dc-reihe" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="dc-knopf dc-knopf-nackt" onClick={() => onFertig(null)}>Später</button>
        <button type="button" className="dc-knopf" disabled={!titel.trim() || gueltig.length < 3} onClick={() => onFertig({ id: neueId('lei'), titel: titel.trim(), stufen: [...gueltig].sort((a, b) => a.anspannung - b.anspannung).map(x => ({ text: x.text.trim(), anspannung: x.anspannung })) })} data-dc-weiter>Leiter speichern</button>
      </div>
    </div>
  )
}

/** Werte sortieren: die wichtigsten wählen und ordnen */
export function Werte({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'werte' }>>) {
  return <WerteWahl auftrag={s.auftrag} karten={s.karten} waehle={s.waehle} onFertig={w => onFertig(w.length ? { werte: w, buch: { art: 'kompass', text: `Meine Werte: ${w.join(', ')}` } } : {})} />
}
export function WerteWahl({ auftrag, karten, waehle, onFertig }: { auftrag: string; karten: string[]; waehle: number; onFertig: (w: string[]) => void }) {
  const [wahl, setWahl] = useState<string[]>([])
  const kipp = (k: string) => setWahl(w => (w.includes(k) ? w.filter(x => x !== k) : w.length < waehle ? [...w, k] : w))
  const schiebe = (i: number, d: number) => setWahl(w => { const n = [...w]; const j = i + d; if (j < 0 || j >= n.length) return w; [n[i], n[j]] = [n[j], n[i]]; return n })
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="werte">
      <span className="dc-ober">Werte</span>
      <p style={{ margin: 0, fontWeight: 600 }}><T t={auftrag} /></p>
      <div className="dc-reihe" style={{ gap: 6 }}>
        {karten.map(k => <button key={k} type="button" className="dc-chip" style={{ cursor: 'pointer', padding: '5px 12px', borderColor: wahl.includes(k) ? 'var(--dc-gelb)' : undefined, color: wahl.includes(k) ? 'var(--dc-ink)' : undefined }} aria-pressed={wahl.includes(k)} onClick={() => kipp(k)} data-dc-wert={k}>{wahl.includes(k) ? `${wahl.indexOf(k) + 1}. ` : ''}{k}</button>)}
      </div>
      <span className="dc-klein dc-stumm">{wahl.length} von {waehle} gewählt{wahl.length > 1 ? ' – mit den Pfeilen ordnen: oben das Wichtigste.' : ''}</span>
      {wahl.length > 1 && <div className="dc-spalte" style={{ gap: 4 }}>{wahl.map((w, i) => (
        <div key={w} className="dc-reihe dc-karte-flach" style={{ padding: '6px 10px', flexWrap: 'nowrap' }}><b className="dc-zahl">{i + 1}.</b><span style={{ flex: 1 }}>{w}</span>
          <button type="button" className="dc-knopf dc-knopf-nackt" disabled={i === 0} onClick={() => schiebe(i, -1)} aria-label="nach oben"><ArrowUp size={14} /></button>
          <button type="button" className="dc-knopf dc-knopf-nackt" disabled={i === wahl.length - 1} onClick={() => schiebe(i, 1)} aria-label="nach unten"><ArrowDown size={14} /></button></div>
      ))}</div>}
      <Weiter text={wahl.length ? 'Werte speichern' : 'Überspringen'} onClick={() => onFertig(wahl)} />
    </div>
  )
}

/** Lebensrad: acht Lebensbereiche 0–10 einschätzen, als Rad gezeichnet */
export function Lebensrad({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'lebensrad' }>>) {
  return <LebensradWahl bereiche={s.bereiche} onFertig={w => onFertig({ lebensrad: w, buch: { art: 'kompass', text: `Lebensrad: ${Object.entries(w).map(([k, v]) => `${k} ${v}`).join(', ')}` } })} />
}
export function LebensradWahl({ bereiche, start, onFertig }: { bereiche: string[]; start?: Record<string, number>; onFertig: (w: Record<string, number>) => void }) {
  const [w, setW] = useState<Record<string, number>>(() => Object.fromEntries(bereiche.map(b => [b, start?.[b] ?? 5])))
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="lebensrad">
      <span className="dc-ober">Lebensrad</span>
      <p style={{ margin: 0 }}>Wie zufrieden bist du gerade – 0 gar nicht, 10 rundum? Ehrlich, nicht ideal.</p>
      <div className="dc-reihe" style={{ alignItems: 'flex-start', gap: 20 }}>
        <Rad bereiche={bereiche} werte={w} />
        <div className="dc-spalte" style={{ gap: 6, flex: 1, minWidth: 240 }}>
          {bereiche.map(b => <label key={b} className="dc-reihe" style={{ flexWrap: 'nowrap' }}><span style={{ width: 150 }} className="dc-klein">{b}</span><input type="range" min={0} max={10} value={w[b]} onChange={e => setW(x => ({ ...x, [b]: Number(e.target.value) }))} style={{ flex: 1, accentColor: 'var(--dc-rot)' }} aria-label={b} /><b className="dc-zahl" style={{ width: 22, textAlign: 'right' }}>{w[b]}</b></label>)}
        </div>
      </div>
      <Weiter text="Rad speichern" onClick={() => onFertig(w)} />
    </div>
  )
}
export function Rad({ bereiche, werte, groesse = 190 }: { bereiche: string[]; werte: Record<string, number>; groesse?: number }) {
  const r = groesse / 2 - 8, m = groesse / 2
  const pkt = (i: number, v: number) => { const a = (Math.PI * 2 * i) / bereiche.length - Math.PI / 2; return [m + Math.cos(a) * r * (v / 10), m + Math.sin(a) * r * (v / 10)] }
  const poly = bereiche.map((b, i) => pkt(i, werte[b] ?? 0).join(',')).join(' ')
  return (
    <svg width={groesse} height={groesse} viewBox={`0 0 ${groesse} ${groesse}`} role="img" aria-label="Lebensrad" style={{ flex: 'none' }}>
      {[2.5, 5, 7.5, 10].map(v => <circle key={v} cx={m} cy={m} r={r * (v / 10)} fill="none" stroke="var(--dc-rand)" />)}
      {bereiche.map((b, i) => { const [x, y] = pkt(i, 10); return <line key={b} x1={m} y1={m} x2={x} y2={y} stroke="var(--dc-rand)" /> })}
      <polygon points={poly} fill="var(--dc-rot-weich)" stroke="var(--dc-rot)" strokeWidth={2} />
    </svg>
  )
}

/** geführtes Schreiben */
export function Schreibreise({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'schreibreise' }>>) {
  const [werte, setWerte] = useState<string[]>(() => s.fragen.map(() => ''))
  const text = useMemo(() => werte.map((w, i) => (w.trim() ? `${s.fragen[i]} ${w.trim()}` : '')).filter(Boolean).join('\n'), [werte, s.fragen])
  const art = s.insBuch === 'erfolg' ? 'erfolg' : s.insBuch === 'saetze' ? 'satz' : s.insBuch === 'geschichten' ? 'geschichte' : 'kompass'
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="schreibreise">
      <span className="dc-ober">Geführtes Schreiben · etwa {s.minuten} Minuten</span>
      <h3 className="dc-h2" style={{ margin: 0 }}>{s.titel}</h3>
      <p style={{ margin: 0 }}><T t={s.anleitung} /></p>
      {s.fragen.map((f, i) => (
        <label key={i} className="dc-spalte" style={{ gap: 4 }}><b className="dc-klein"><T t={f} /></b>
          <textarea className="dc-eingabe" rows={3} value={werte[i]} onChange={e => setWerte(w => w.map((x, j) => (j === i ? e.target.value : x)))} data-dc-eingabe={i === 0 ? '' : undefined} /></label>
      ))}
      <span className="dc-klein dc-stumm">Nur für dich – verschlüsselt auf diesem PC.</span>
      <Weiter text={text ? 'Speichern' : 'Überspringen'} onClick={() => onFertig(text ? { buch: { art, text: `${s.titel}: ${text}` } } : {})} />
    </div>
  )
}

/** Wunsch – Ergebnis – Hindernis – Plan */
export function Woop({ s, onFertig }: BausteinProps<Extract<Schritt, { art: 'woop' }>>) {
  const felder = [
    { k: 'wunsch', name: 'Wunsch', hilfe: 'was du dir vornimmst – kurz und machbar' },
    { k: 'ergebnis', name: 'Bestes Ergebnis', hilfe: 'stell es dir einen Moment lang vor' },
    { k: 'hindernis', name: 'Hindernis', hilfe: 'was in dir am ehesten dazwischenkommt' },
    { k: 'plan', name: 'Plan', hilfe: 'Wenn [Hindernis], dann [Handlung].' },
  ] as const
  const [w, setW] = useState<Record<string, string>>({})
  const voll = felder.filter(f => (w[f.k] ?? '').trim()).length
  return (
    <div className="dc-spalte dc-ein" data-dc-schritt="woop">
      <span className="dc-ober">Wunsch · Ergebnis · Hindernis · Plan</span>
      <p style={{ margin: 0, fontWeight: 600 }}><T t={s.anlass} /></p>
      {felder.map(f => (
        <label key={f.k} className="dc-spalte" style={{ gap: 4 }}><span className="dc-klein"><b>{f.name}</b> <span className="dc-stumm">– {f.hilfe}</span></span>
          <input className="dc-eingabe" value={w[f.k] ?? ''} onChange={e => setW(x => ({ ...x, [f.k]: e.target.value }))} placeholder={s.beispiel ? `z. B. ${s.beispiel[f.k]}` : ''} data-dc-eingabe={f.k === 'wunsch' ? '' : undefined} /></label>
      ))}
      <Weiter text={voll ? 'Plan speichern' : 'Überspringen'} onClick={() => onFertig(voll ? { buch: { art: 'plan', text: felder.map(f => `${f.name}: ${(w[f.k] ?? '').trim() || '–'}`).join(' · ') } } : {})} />
    </div>
  )
}

/** kleine Bruno-Zeile über einem Werkzeug (für Kompass und Notfallkoffer) */
export function WerkzeugKopf({ text }: { text: string }) { return <Bruno text={text} /> }
