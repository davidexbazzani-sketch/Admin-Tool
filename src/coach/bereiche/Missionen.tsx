// Der Coach — Missionen (Stufe 2): alles fürs echte Leben an einem Ort.
// Offene Aufgaben berichten · Leitern aller gewählten Bereiche · Mutproben (eigener Schalter) · Beweisliste
// „befürchtet / passiert“ · eigene Leitern. Der Nutzer wählt immer selbst; Bruno schlägt die Sprosse knapp über dem Gewohnten vor.
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Flag, ListOrdered, Plus, Scale, Zap } from 'lucide-react'
import type { BereichId, Leben, Mission } from '../kern/inhaltTypen'
import type { InhaltsIndex } from '../kern/index'
import { useCoach } from '../kern/speicher'
import { ladeLeben, ladeMissionen } from '../kern/inhalt'
import { gewaehlt } from '../kern/kurs'
import { hoechsteSprosse } from '../kern/buchung'
import { beweisliste, beweisBilanz } from '../kern/leben'
import { heute, tagNummer, datumText, datumAus } from '../kern/zeit'
import { Bruno, Laedt, T } from '../ansicht/hilfen'
import { MissionBericht, MissionWahl } from '../ablauf/Mission'
import { LeiterBau } from '../uebungen/Werkzeuge'

type Reiter = 'offen' | 'leitern' | 'mutproben' | 'beweise'
const REITER: { id: Reiter; name: string; S: typeof Flag }[] = [
  { id: 'offen', name: 'Vorgenommen', S: Flag }, { id: 'leitern', name: 'Leitern', S: ListOrdered },
  { id: 'mutproben', name: 'Mutproben', S: Zap }, { id: 'beweise', name: 'Beweise', S: Scale },
]

export function Missionen({ index }: { index: InhaltsIndex }) {
  const daten = useCoach(s => s.daten)
  const [reiter, setReiter] = useState<Reiter>(daten.missionen.offen.length ? 'offen' : 'leitern')
  const [wahl, setWahl] = useState<string | null>(null)
  const [bericht, setBericht] = useState<string | null>(null)
  if (wahl) return <div className="dc-breit"><div className="dc-karte"><MissionWahl id={wahl} onFertig={() => setWahl(null)} /></div></div>
  if (bericht) return <div className="dc-breit"><div className="dc-karte"><MissionBericht id={bericht} onFertig={() => setBericht(null)} /></div></div>
  return (
    <div className="dc-breit dc-spalte" data-dc-missionen>
      <div><span className="dc-ober">Fürs echte Leben</span><h1 className="dc-h1">Missionen</h1></div>
      <div className="dc-reiter" role="tablist">{REITER.map(r => <button key={r.id} type="button" role="tab" aria-selected={reiter === r.id} onClick={() => setReiter(r.id)} data-dc-reiter={r.id}><r.S size={14} style={{ verticalAlign: -2, marginRight: 4 }} />{r.name}</button>)}</div>
      {reiter === 'offen' && <Offen index={index} onBericht={setBericht} onLeitern={() => setReiter('leitern')} />}
      {reiter === 'leitern' && <Leitern index={index} onWahl={setWahl} />}
      {reiter === 'mutproben' && <Mutproben onWahl={setWahl} />}
      {reiter === 'beweise' && <Beweise index={index} />}
    </div>
  )
}

function Offen({ index, onBericht, onLeitern }: { index: InhaltsIndex; onBericht: (id: string) => void; onLeitern: () => void }) {
  const offen = useCoach(s => s.daten.missionen.offen)
  const nr = tagNummer(heute())
  if (!offen.length) return <div className="dc-karte-flach dc-spalte"><Bruno text="Gerade nichts vorgenommen. Such dir auf einer Leiter die nächste Sprosse – klein anfangen ist erlaubt." /><button type="button" className="dc-knopf" style={{ alignSelf: 'flex-start' }} onClick={onLeitern}>Zu den Leitern</button></div>
  return (
    <div className="dc-spalte">
      {offen.map(m => (
        <div key={m.id} className="dc-karte-flach dc-reihe" style={{ justifyContent: 'space-between' }} data-dc-offen-mission={m.id}>
          <span className="dc-spalte" style={{ gap: 2 }}><b>{index.missionen[m.id]?.titel ?? (m.id.startsWith('mut-p-') ? 'Mutprobe' : m.id)}</b><span className="dc-klein dc-stumm">seit {nr - m.gewaehlt === 0 ? 'heute' : `${nr - m.gewaehlt} Tagen`}{m.plan ? ` · ${m.plan}` : ''}</span></span>
          <button type="button" className="dc-knopf" onClick={() => onBericht(m.id)} data-dc-berichten>Wie lief's?</button>
        </div>
      ))}
    </div>
  )
}

function Leitern({ index, onWahl }: { index: InhaltsIndex; onWahl: (id: string) => void }) {
  const daten = useCoach(s => s.daten)
  const bereiche = gewaehlt(daten.profil, index)
  const [b, setB] = useState<BereichId | null>(bereiche[0] ?? null)
  const [liste, setListe] = useState<Mission[] | null>(null)
  useEffect(() => { if (b) { setListe(null); void ladeMissionen(b).then(setListe) } }, [b])
  const [neu, setNeu] = useState(false)
  if (neu) return <div className="dc-karte"><LeiterBau auftrag="Bau dir eine Leiter für eine Angst, die nicht ins Raster passt: zehn Stufen von leicht bis schwer." beispiel={['jemanden nach der Uhrzeit fragen', 'beim Bäcker ein Brot empfehlen lassen', 'im Laden etwas zurückgeben']} onFertig={l => { if (l) useCoach.getState().aendere(d => ({ ...d, eigeneLeitern: [...d.eigeneLeitern, l].slice(-10) })); setNeu(false) }} /></div>
  const sp = b ? hoechsteSprosse(daten, index, b) : 0
  const sichtbar = (liste ?? []).filter(m => !m.schwerpunkt || daten.profil.schwerpunkte.includes(m.schwerpunkt)).filter(m => !m.mutprobe || daten.profil.mutproben).sort((x, y) => x.stufe - y.stufe)
  return (
    <div className="dc-spalte">
      <div className="dc-reihe" style={{ gap: 4 }}>{bereiche.map(x => <button key={x} type="button" className="dc-chip" style={{ cursor: 'pointer', borderColor: b === x ? 'var(--dc-rot)' : undefined, color: b === x ? 'var(--dc-ink)' : undefined }} aria-pressed={b === x} onClick={() => setB(x)} data-dc-leiter-bereich={x}>{index.bereiche.find(y => y.id === x)?.name ?? x}</button>)}</div>
      {!b ? <p className="dc-leise">Wähl zuerst Bereiche in den Einstellungen.</p> : !liste ? <Laedt /> : <>
        <span className="dc-klein dc-leise">{sp ? `Geschafft bis Sprosse ${sp}. Bruno schlägt Sprosse ${Math.min(10, sp + 1)} vor – oder eine darunter, wenn es gerade eng ist.` : 'Fang unten an – so leicht, dass du nicht ablehnen würdest.'}</span>
        {sichtbar.map(m => {
          const erledigt = (daten.missionen.erledigt[m.id] ?? []).length > 0
          const vorschlag = m.stufe === sp + 1
          return (
            <button key={m.id} type="button" className="dc-wahl" onClick={() => onWahl(m.id)} data-an={vorschlag ? '1' : undefined} data-dc-sprosse={m.stufe}>
              <span className="dc-zeichen dc-zahl">{erledigt ? <CheckCircle2 size={16} style={{ color: 'var(--dc-gut)' }} /> : m.stufe}</span>
              <span style={{ flex: 1 }}><b>{m.titel}</b>{vorschlag && <span className="dc-chip dc-chip-gelb" style={{ marginLeft: 8 }}>Vorschlag</span>}{m.mutprobe && <span className="dc-chip dc-chip-rot" style={{ marginLeft: 8 }}>Mutprobe</span>}<span className="dc-klein dc-leise" style={{ display: 'block' }}><T t={m.auftrag} /></span></span>
            </button>
          )
        })}
        {!daten.profil.mutproben && (liste ?? []).some(m => m.mutprobe) && <span className="dc-klein dc-stumm">Mutproben sind ausgeblendet – einschalten unter „Mutproben“.</span>}
      </>}
      <EigeneLeitern onNeu={() => setNeu(true)} />
    </div>
  )
}

function EigeneLeitern({ onNeu }: { onNeu: () => void }) {
  const leitern = useCoach(s => s.daten.eigeneLeitern)
  const nr = tagNummer(heute())
  const kipp = (lid: string, i: number) => useCoach.getState().aendere(d => ({ ...d, eigeneLeitern: d.eigeneLeitern.map(l => (l.id !== lid ? l : { ...l, stufen: l.stufen.map((s, j) => (j !== i ? s : { ...s, erledigt: s.erledigt ? undefined : nr })) })) }))
  return (
    <div className="dc-spalte" style={{ marginTop: 10 }}>
      <span className="dc-ober">Eigene Leitern</span>
      {leitern.map(l => (
        <div key={l.id} className="dc-karte-flach dc-spalte" style={{ gap: 6 }}>
          <b>{l.titel}</b>
          {l.stufen.map((s, i) => <label key={i} className="dc-schalter dc-klein"><input type="checkbox" checked={!!s.erledigt} onChange={() => kipp(l.id, i)} /><span className="dc-zahl dc-stumm" style={{ width: 40 }}>{s.anspannung} %</span>{s.text}</label>)}
        </div>
      ))}
      <button type="button" className="dc-knopf dc-knopf-leise" style={{ alignSelf: 'flex-start' }} onClick={onNeu} data-dc-leiter-neu><Plus size={14} />Eigene Leiter bauen</button>
    </div>
  )
}

function Mutproben({ onWahl }: { onWahl: (id: string) => void }) {
  const an = useCoach(s => s.daten.profil.mutproben)
  const erledigt = useCoach(s => s.daten.missionen.erledigt)
  const [leben, setLeben] = useState<Leben | null>(null)
  useEffect(() => { void ladeLeben().then(setLeben) }, [])
  const schalte = (x: boolean) => { useCoach.getState().aendere(d => ({ ...d, profil: { ...d.profil, mutproben: x } })); void useCoach.getState().sichere() }
  return (
    <div className="dc-spalte">
      <div className="dc-karte-flach dc-spalte" style={{ gap: 6 }}>
        <label className="dc-schalter"><input type="checkbox" checked={an} onChange={e => schalte(e.target.checked)} data-dc-mutproben />Mutproben zeigen</label>
        <span className="dc-klein dc-leise">Harte Aufgaben, freiwillig: bewusst ein Nein riskieren. Immer im Privatleben, immer harmlos – niemand wird festgehalten oder in Verlegenheit gebracht. Ein Nein ist hier ein voller Erfolg.</span>
      </div>
      {an && (!leben ? <Laedt /> : leben.mutproben.map(p => (
        <button key={p.id} type="button" className="dc-wahl" onClick={() => onWahl(p.id)} data-dc-mutprobe={p.id}>
          <span className="dc-zeichen">{(erledigt[p.id] ?? []).length ? <CheckCircle2 size={16} style={{ color: 'var(--dc-gut)' }} /> : <Zap size={14} />}</span>
          <span style={{ flex: 1 }}><b>{p.titel}</b><span className="dc-klein dc-leise" style={{ display: 'block' }}>{p.auftrag}</span><span className="dc-klein dc-stumm" style={{ display: 'block' }}>{p.warum}</span></span>
        </button>
      )))}
    </div>
  )
}

function Beweise({ index }: { index: InhaltsIndex }) {
  const daten = useCoach(s => s.daten)
  const liste = useMemo(() => beweisliste(daten), [daten])
  const b = beweisBilanz(liste)
  if (!liste.length) return <div className="dc-karte-flach"><Bruno text="Hier sammelt sich, was du befürchtet hast – und was wirklich passiert ist. Trag beim nächsten Vorhaben ein, was du befürchtest. Der Abgleich ist der wirksame Teil." /></div>
  return (
    <div className="dc-spalte" data-dc-beweise>
      <div className="dc-karte dc-spalte" style={{ gap: 6 }}>
        <span className="dc-ober">Deine Bilanz</span>
        <p className="dc-gross" style={{ margin: 0 }}>Befürchtet hast du in {b.n} Fällen etwas. Eingetreten ist es <b>{b.eingetreten}-mal</b>{b.erwartet ? <> – erwartet hattest du im Schnitt <b>{b.erwartet} %</b>.</> : '.'}</p>
        <span className="dc-klein dc-stumm">Eine Beobachtung über dich, kein Versprechen für morgen.</span>
      </div>
      {liste.map((x, i) => (
        <div key={i} className="dc-karte-flach dc-spalte" style={{ gap: 4 }}>
          <span className="dc-klein dc-stumm">{datumText(datumAus(x.tag))} · {index.missionen[x.mission]?.titel ?? 'Mutprobe'}</span>
          <span>Befürchtet: <i>{x.befuerchtung}</i>{x.wahrscheinlich !== undefined ? ` (${x.wahrscheinlich} %)` : ''}</span>
          <span>Eingetreten: <b>{x.eingetreten ? 'ja' : 'nein'}</b>{x.vorher !== undefined && x.nachher !== undefined ? ` · Anspannung ${x.vorher} → ${x.nachher}` : ''}</span>
          {x.mitnehmen && <span className="dc-klein dc-leise">Mitgenommen: {x.mitnehmen}</span>}
        </div>
      ))}
    </div>
  )
}
