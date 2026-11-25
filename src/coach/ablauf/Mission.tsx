// Der Coach — Missionen fürs echte Leben: wählen (mit Wenn-Dann-Plan und Befürchtung) und berichten (befürchtet – passiert).
// Der Abgleich von Befürchtung und Ergebnis ist der wirksame Teil; er landet in der Beweisliste (Erfolgsbuch).
import { useEffect, useState } from 'react'
import { Flag } from 'lucide-react'
import type { Mission } from '../kern/inhaltTypen'
import { ladeAufgabe } from '../kern/inhalt'
import { useCoach } from '../kern/speicher'
import { berichteMission, streicheMission, verschiebeMission, waehleMission } from '../kern/buchung'
import { heute, tagNummer } from '../kern/zeit'
import { indexJetzt } from '../kern/inhalt'
import { Laedt, T, useZeile } from '../ansicht/hilfen'
import { Anspannung } from '../uebungen/Gefuehrt'
import { Weiter } from '../uebungen/Lesen'

const ORT = { privat: 'im Privatleben', beruf: 'im Beruf', beides: 'privat oder im Beruf' }

export function MissionWahl({ id, onFertig }: { id: string; onFertig: () => void }) {
  const [m, setM] = useState<Mission | null>(null)
  const [klein, setKlein] = useState(false)
  const [plan, setPlan] = useState('')
  const [befuerchtung, setBefuerchtung] = useState('')
  const [wahrscheinlich, setWahrscheinlich] = useState<number | null>(null)
  const [vorher, setVorher] = useState<number | null>(null)
  const offen = useCoach(s => s.daten.missionen.offen.some(x => x.id === id))
  const stottern = id.startsWith('aussprache-s-')
  useEffect(() => { void ladeAufgabe(id).then(x => { setM(x); setPlan(x?.planVorlage ?? '') }) }, [id])
  const mutprobenAn = useCoach(x => x.daten.profil.mutproben)
  if (!m) return <Laedt />
  // Mutproben nur, wenn der Nutzer sie eingeschaltet hat (Einheiten, die mit einer Mutprobe enden, zeigen sonst nur einen Hinweis)
  if (m.mutprobe && !mutprobenAn) return (
    <div className="dc-spalte dc-ein" data-dc-mutprobe-aus>
      <span className="dc-klein dc-leise">Hier würde jetzt eine Mutprobe kommen – eine freiwillige Aufgabe, bei der du bewusst ein Nein riskierst. Mutproben sind bei dir ausgeschaltet; einschalten kannst du sie unter Missionen → Mutproben.</span>
      <Weiter onClick={onFertig} />
    </div>
  )
  const nimm = () => {
    useCoach.getState().aendere(d => waehleMission(d, { id, gewaehlt: tagNummer(heute()), plan: plan.trim(), befuerchtung: befuerchtung.trim() || undefined, wahrscheinlich: wahrscheinlich ?? undefined, anspannung: vorher ?? undefined }))
    if (plan.trim()) useCoach.getState().schreibeIns({ art: 'plan', text: plan.trim(), bezug: id })
    onFertig()
  }
  return (
    <div className="dc-spalte dc-ein" data-dc-mission={id}>
      <div className="dc-reihe"><span className="dc-ober"><Flag size={12} style={{ verticalAlign: -1 }} /> Fürs echte Leben · Sprosse {m.stufe} von 10</span>{m.mutprobe && <span className="dc-chip dc-chip-rot">Mutprobe</span>}</div>
      <h3 className="dc-h2">{m.titel}</h3>
      <p className="dc-gross" style={{ margin: 0 }}><T t={klein && m.halb ? m.halb : m.auftrag} /></p>
      <span className="dc-klein dc-stumm">Passt {ORT[m.ort]}. Du entscheidest – nichts passiert ohne dich.</span>
      {offen ? <p className="dc-rueck" style={{ margin: 0 }}>Diese Aufgabe hast du dir schon vorgenommen. Bruno fragt nach, wie es lief.</p> : <>
        <label className="dc-spalte" style={{ gap: 4 }}><b>Dein Plan</b><input className="dc-eingabe" value={plan} onChange={e => setPlan(e.target.value)} data-dc-plan /></label>
        {!stottern && <details><summary className="dc-klein dc-leise" style={{ cursor: 'pointer' }}>Was befürchtest du? (freiwillig – lohnt sich)</summary>
          <div className="dc-spalte" style={{ marginTop: 8 }}>
            <input className="dc-eingabe" value={befuerchtung} onChange={e => setBefuerchtung(e.target.value)} placeholder="Ich befürchte, dass …" />
            <Anspannung titel="Wie wahrscheinlich ist das (in Prozent)?" wert={wahrscheinlich} setWert={setWahrscheinlich} />
            <Anspannung titel="Wie angespannt bist du jetzt beim Gedanken daran?" wert={vorher} setWert={setVorher} />
          </div>
        </details>}
      </>}
      <div className="dc-reihe" style={{ justifyContent: 'flex-end' }}>
        {!offen && m.halb && !klein && <button type="button" className="dc-knopf dc-knopf-nackt" onClick={() => setKlein(true)}>Kleiner, bitte</button>}
        <button type="button" className="dc-knopf dc-knopf-nackt" onClick={() => { useCoach.getState().aendere(d => verschiebeMission(d, id)); onFertig() }} data-dc-mission-spaeter>Diesmal nicht</button>
        {!offen ? <button type="button" className="dc-knopf" onClick={nimm} autoFocus data-dc-mission-nehmen>Nehme ich mir vor</button> : <button type="button" className="dc-knopf" onClick={onFertig}>Weiter</button>}
      </div>
    </div>
  )
}

export function MissionBericht({ id, onFertig }: { id: string; onFertig: () => void }) {
  const [m, setM] = useState<Mission | null>(null)
  const offen = useCoach(s => s.daten.missionen.offen.find(x => x.id === id))
  const [getan, setGetan] = useState<boolean | null>(null)
  const [eingetreten, setEingetreten] = useState<boolean | null>(null)
  const [anspannung, setAnspannung] = useState<number | null>(null)
  const [mitnehmen, setMitnehmen] = useState('')
  const stottern = id.startsWith('aussprache-s-')
  const zeile = useZeile(stottern ? 'stottern-mission' : 'mission', id)
  useEffect(() => { void ladeAufgabe(id).then(setM) }, [id])
  if (!m) return <Laedt />
  const fertig = () => {
    const st = useCoach.getState()
    if (getan) {
      st.aendere(d => berichteMission(d, indexJetzt(), id, { eingetreten: eingetreten ?? undefined, anspannung: anspannung ?? undefined, mitnehmen: mitnehmen.trim() || undefined }, heute()))
      const abgleich = offen?.befuerchtung ? ` Befürchtet: ${offen.befuerchtung} – eingetreten: ${eingetreten ? 'ja' : 'nein'}.` : ''
      st.schreibeIns({ art: 'erfolg', text: `${m.titel}.${abgleich}${mitnehmen.trim() ? ` Mitgenommen: ${mitnehmen.trim()}` : ''}`, bezug: id })
    } else st.aendere(d => verschiebeMission(d, id))
    onFertig()
  }
  return (
    <div className="dc-spalte dc-ein" data-dc-bericht={id}>
      <span className="dc-ober">Wie lief es?</span>
      <h3 className="dc-h2">{m.titel}</h3>
      {offen?.plan && <p className="dc-leise" style={{ margin: 0 }}>Dein Plan: {offen.plan}</p>}
      <div className="dc-reihe">
        <button type="button" className="dc-wahl" style={{ width: 'auto' }} data-an={getan === true ? '1' : undefined} onClick={() => setGetan(true)} data-dc-getan>{stottern ? 'Ja, gesagt' : 'Gemacht'}</button>
        <button type="button" className="dc-wahl" style={{ width: 'auto' }} data-an={getan === false ? '1' : undefined} onClick={() => setGetan(false)} data-dc-nicht>Noch nicht</button>
      </div>
      {getan && <>
        {offen?.befuerchtung && <div className="dc-spalte" style={{ gap: 6 }}><span>Du hattest befürchtet: <i>{offen.befuerchtung}</i>{offen.wahrscheinlich !== undefined && ` (${offen.wahrscheinlich} %)`}. Ist es eingetreten?</span>
          <div className="dc-reihe"><button type="button" className="dc-wahl" style={{ width: 'auto' }} data-an={eingetreten === true ? '1' : undefined} onClick={() => setEingetreten(true)}>Ja</button><button type="button" className="dc-wahl" style={{ width: 'auto' }} data-an={eingetreten === false ? '1' : undefined} onClick={() => setEingetreten(false)}>Nein</button></div></div>}
        {!stottern && <Anspannung titel="Wie angespannt warst du dabei?" wert={anspannung} setWert={setAnspannung} />}
        <label className="dc-spalte" style={{ gap: 4 }}><b>{stottern ? 'Hast du gesagt, was du sagen wolltest? Ein Satz für dich:' : 'Was nimmst du mit? Ein Satz:'}</b><input className="dc-eingabe" value={mitnehmen} onChange={e => setMitnehmen(e.target.value)} /></label>
        <div className="dc-rueck" data-gut="1">{zeile}</div>
      </>}
      {getan === false && <p className="dc-leise" style={{ margin: 0 }}>Kein Problem. Sie bleibt offen – oder nimm dir beim nächsten Mal eine kleinere vor.</p>}
      {getan === false && <div className="dc-reihe"><button type="button" className="dc-knopf dc-knopf-nackt" onClick={() => { useCoach.getState().aendere(d => streicheMission(d, id)); onFertig() }}>Aufgabe streichen</button></div>}
      {getan !== null && <Weiter onClick={fertig} />}
    </div>
  )
}
