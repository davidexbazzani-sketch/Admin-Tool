// Der Coach — ein Lernpaket durchspielen: Block für Block, Verweis für Verweis. Der Stand wird nach jedem Block
// festgehalten; wer abbricht, macht morgen nicht von vorn, sondern heute an derselben Stelle weiter.
import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Lage, VorratsEintrag } from '../kern/inhaltTypen'
import type { Block } from '../kern/typen'
import { indexJetzt, ladeFuer, ladeLage, ladeVorrat } from '../kern/inhalt'
import { useCoach } from '../kern/speicher'
import { merkeVerlauf, schliesseLerntag, schliessePaket } from '../kern/buchung'
import { naechsterLerntag } from '../kern/kurs'
import { serie } from '../kern/serie'
import { heute } from '../kern/zeit'
import { Bruno, Laedt, Raumbild, useZeile } from '../ansicht/hilfen'
import { Schritt } from '../uebungen/Schritt'
import { GespraechSpieler } from '../uebungen/Gespraech'
import { EinheitLauf } from './Einheit'
import { Merkkarte } from './Merkkarte'
import { TestAblauf } from './Test'
import { Anwendungstag, Vorschlag } from './Anwendung'
import { MissionBericht } from './Mission'
import { verbucheErgebnis } from './verbuchen'
import { Weiter } from '../uebungen/Lesen'

function VorratSchritt({ id, ohneUhr, onFertig }: { id: string; ohneUhr: boolean; onFertig: () => void }) {
  const [v, setV] = useState<VorratsEintrag | null | undefined>(undefined)
  useEffect(() => { void ladeVorrat(id).then(setV) }, [id])
  useEffect(() => { if (v === null) onFertig() }, [v, onFertig])
  if (!v) return <Laedt />
  return <Schritt s={v} ohneUhr={ohneUhr} onFertig={r => { verbucheErgebnis(v.kopf, r); onFertig() }} />
}

function LageSchritt({ id, onFertig }: { id: string; onFertig: () => void }) {
  const [l, setL] = useState<Lage | null | undefined>(undefined)
  useEffect(() => { void ladeLage(id).then(setL) }, [id])
  useEffect(() => { if (l === null) onFertig() }, [l, onFertig])
  if (!l) return <Laedt />
  const kopf = { id: l.id, faehigkeit: l.faehigkeiten[0], stufe: l.stufe, kanal: 'koennen' as const }
  return <GespraechSpieler g={l} lage={l} onFertig={r => { verbucheErgebnis(kopf, r); for (const f of l.faehigkeiten.slice(1)) verbucheErgebnis({ ...kopf, faehigkeit: f }, { wert: r.wert }); onFertig() }} />
}

/** ein einzelner Verweis */
export function Verweis({ ref_, block, laut, ohneUhr, onFertig }: { ref_: string; block: Block; laut: boolean; ohneUhr: boolean; onFertig: () => void }) {
  const [art, ...rest] = ref_.split(':')
  const id = rest.join(':')
  const kurz = useCoach(s => (block.kurs ? s.daten.kurse[block.kurs]?.kurz.includes(id) : false))
  if (art === 'e') return <EinheitLauf id={id} laut={laut} ohneUhr={ohneUhr} kurz={kurz} onFertig={onFertig} />
  const inhalt = (() => {
    switch (art) {
      case 'v': return <VorratSchritt id={id} ohneUhr={ohneUhr} onFertig={onFertig} />
      case 'l': return <LageSchritt id={id} onFertig={onFertig} />
      case 'm': case 'b': return <Merkkarte ref_={ref_} onFertig={onFertig} />
      case 'k': return <TestAblauf kurs={id} art={block.art === 'formcheck' ? 'formcheck' : 'einstufung'} onFertig={onFertig} />
      case 'a': {
        const [modus, ...k] = rest
        const ziel = k.join(':')
        if (modus === 'bericht') return <MissionBericht id={ziel} onFertig={onFertig} />
        if (modus === 'vorschlag') return <Vorschlag kurs={ziel} onFertig={onFertig} />
        return <Anwendungstag modus={modus} kurs={ziel} onFertig={onFertig} />
      }
      default: return <Weiter onClick={onFertig} />
    }
  })()
  return <div className="dc-lauf"><div className="dc-karte">{inhalt}</div></div>
}

/** Paket: Blöcke nacheinander; `imPlan` = das heutige Training (Fortschritt, Serie, Runde) */
export function Paket({ bloecke, laut, ohneUhr, imPlan, onEnde }: { bloecke: Block[]; laut: boolean; ohneUhr: boolean; imPlan: boolean; onEnde: () => void }) {
  const offen = bloecke.findIndex(b => !b.fertig)
  const [bi, setBi] = useState(offen < 0 ? bloecke.length : offen)
  const [ri, setRi] = useState(0)
  const [geladen, setGeladen] = useState(false)
  const [regel, setRegel] = useState('')
  useEffect(() => { void ladeFuer(bloecke.flatMap(b => b.ids)).then(() => setGeladen(true)) }, [bloecke])
  useEffect(() => { if (imPlan) useCoach.getState().aendere(d => (d.heute && !d.heute.begonnen ? { ...d, heute: { ...d.heute, begonnen: true } } : d)) }, [imPlan])
  const block = bloecke[bi]
  const weiter = useCallback(() => {
    if (!block) return
    if (ri + 1 < block.ids.length) { setRi(r => r + 1); return }
    // Block fertig: Lerntag verbuchen, Stand festhalten
    const st = useCoach.getState()
    const tag = heute()
    st.aendere(d => {
      let n = d
      if (block.kurs && block.lerntag) n = schliesseLerntag(n, indexJetzt(), block.kurs, block.lerntag, tag)
      else if (block.kurs && (block.art === 'neu' || block.art === 'tief')) n = merkeVerlauf(n, block.kurs, tag)
      if (imPlan && n.heute && n.heute.tag === tag) n = { ...n, heute: { ...n.heute, bloecke: n.heute.bloecke.map((b, k) => (k === bi ? { ...b, fertig: true } : b)) } }
      return n
    })
    if (block.ids[0]?.startsWith('e:')) setRegel(indexJetzt().einheiten[block.ids[0].slice(2)]?.titel ?? '')
    void st.sichere()
    setBi(b => b + 1); setRi(0)
  }, [block, ri, bi, imPlan])
  const abbrechen = () => { void useCoach.getState().sichere(); onEnde() }
  if (!geladen) return <Laedt />
  if (!block) return <Abschluss imPlan={imPlan} minuten={bloecke.reduce((s, b) => s + b.minuten, 0)} regel={regel} onEnde={onEnde} />
  return (
    <div className="dc-spalte" data-dc-paket>
      <div className="dc-reihe" style={{ justifyContent: 'space-between', maxWidth: 760, margin: '0 auto', width: '100%' }}>
        <span className="dc-reihe dc-klein" style={{ gap: 6 }}>{bloecke.map((b, k) => <span key={k} className={`dc-chip ${k === bi ? 'dc-chip-rot' : k < bi ? 'dc-chip-gut' : ''}`}>{k < bi ? '✓ ' : ''}{b.titel}</span>)}</span>
        <button type="button" className="dc-knopf dc-knopf-nackt" onClick={abbrechen} title="Pause – später an derselben Stelle weiter" data-dc-pause><X size={15} />Pause</button>
      </div>
      <Verweis key={`${bi}-${ri}`} ref_={block.ids[ri]} block={block} laut={laut} ohneUhr={ohneUhr} onFertig={weiter} />
    </div>
  )
}

function Abschluss({ imPlan, minuten, regel, onEnde }: { imPlan: boolean; minuten: number; regel: string; onEnde: () => void }) {
  const zeile = useZeile('abschluss', 'ende')
  const daten = useCoach(s => s.daten)
  const [gebucht, setGebucht] = useState(false)
  useEffect(() => {
    if (!imPlan || gebucht) return
    setGebucht(true)
    useCoach.getState().aendere(d => schliessePaket(d, heute(), minuten))
    void useCoach.getState().sichere()
  }, [imPlan, gebucht, minuten])
  const s = serie(daten, heute())
  const idx = indexJetzt()
  const naechste = Object.entries(daten.kurse).filter(([, k]) => k.aktiv).map(([k, st]) => naechsterLerntag(idx, k, st)).find(Boolean)
  const titel = naechste ? (naechste.art === 'E' ? idx.einheiten[naechste.einheit]?.titel : naechste.art === 'L' || naechste.art === 'S' ? idx.lagen[naechste.lage]?.titel : naechste.titel) : null
  return (
    <div className="dc-lauf dc-ein" data-dc-abschluss>
      <div className="dc-karte dc-spalte" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Raumbild name="abschluss" hoehe={190} position="center 30%" />
        <span className="dc-glocke" style={{ fontSize: 40 }} aria-hidden>🔔</span>
        <h2 className="dc-h1">Glocke. {imPlan ? 'Training geschafft.' : 'Runde geschafft.'}</h2>
        <Bruno text={zeile} />
        {regel && <p className="dc-leise" style={{ margin: 0 }}>Heute dabei: <b>{regel}</b></p>}
        {imPlan && <div className="dc-reihe" style={{ justifyContent: 'center' }}><span className="dc-chip dc-chip-gelb">Serie: {s.aktuell} {s.aktuell === 1 ? 'Trainingstag' : 'Trainingstage'}</span><span className="dc-chip">Woche: {s.woche.geschafft} von {s.woche.ziel}</span></div>}
        {titel && <p className="dc-klein dc-stumm" style={{ margin: 0 }}>Als Nächstes: {titel}</p>}
        <Weiter text="Zurück in die Halle" onClick={onEnde} />
      </div>
    </div>
  )
}
