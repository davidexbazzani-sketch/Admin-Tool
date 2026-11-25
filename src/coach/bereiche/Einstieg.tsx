// Der Coach — Einstieg: kurze Einführung, Ton, Bereiche (mit Schwerpunkten), Situations-Check, Zeit.
// Danach startet die erste Runde: ein leichter Anfang mit sicherem Erfolg.
import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { BereichId, SchwerpunktId, Ton } from '../kern/inhaltTypen'
import type { InhaltsIndex } from '../kern/index'
import { useCoach } from '../kern/speicher'
import { pflegeStaffel } from '../kern/kurs'
import { heute, tagNummer, WT_KURZ } from '../kern/zeit'
import { host } from '../host/aktiv'
import { Bruno, Laedt, Raumbild, mitName, useGemeinsam } from '../ansicht/hilfen'
import { BereichWahl } from './BereichWahl'

const TOENE: { id: Ton; name: string; art: string }[] = [
  { id: 'ruhig', name: 'Ruhig', art: 'warm, geduldig, nimmt Druck raus' },
  { id: 'klar', name: 'Klar', art: 'sportlich, knapp, fordernd' },
  { id: 'trocken', name: 'Trocken', art: 'lakonisch, mit Augenzwinkern' },
]

export function Einstieg({ index, onFertig }: { index: InhaltsIndex; onFertig: () => void }) {
  const g = useGemeinsam()
  const alt = useCoach(s => s.daten.profil)
  const [schritt, setSchritt] = useState(0)
  const [ton, setTon] = useState<Ton>(alt.ton)
  const [bereiche, setBereiche] = useState<BereichId[]>(alt.bereiche)
  const [schwerpunkte, setSchwerpunkte] = useState<SchwerpunktId[]>(alt.schwerpunkte)
  const [situationen, setSituationen] = useState<string[]>(alt.situationen)
  const [wofuer, setWofuer] = useState(alt.wofuer)
  const [name, setName] = useState(alt.name || host().anzeigeName())
  const [dauer, setDauer] = useState(alt.dauer)
  const [tage, setTage] = useState(alt.tage)
  const [erinnerung, setErinnerung] = useState(alt.erinnerung.an)
  const [um, setUm] = useState(alt.erinnerung.um)
  const einf = g?.einfuehrung ?? []
  const SCHRITTE = einf.length + 4
  // Situations-Check schlägt die Reihenfolge der Staffel vor
  const vorschlag = useMemo(() => {
    const punkte = new Map<BereichId, number>()
    for (const s of g?.situationen ?? []) if (situationen.includes(s.id)) s.bereiche.forEach((b, i) => punkte.set(b, (punkte.get(b) ?? 0) + 3 - i))
    return punkte
  }, [g, situationen])
  const fertig = () => {
    const reihenfolge = [...bereiche].sort((a, b) => (vorschlag.get(b) ?? 0) - (vorschlag.get(a) ?? 0))
    useCoach.getState().aendere(d => {
      const profil = { ...d.profil, ton, bereiche: reihenfolge, schwerpunkte: bereiche.includes('aussprache') ? schwerpunkte : [], situationen, wofuer: wofuer.trim(), name: name.trim(), dauer, tage, ohneZeitdruck: d.profil.ohneZeitdruck || schwerpunkte.includes('stottern'), erinnerung: { ...d.profil.erinnerung, an: erinnerung, um } }
      const n = { ...d, profil, eingestiegen: true }
      return { ...n, kurse: pflegeStaffel(n, index, tagNummer(heute())) }
    })
    if (wofuer.trim()) useCoach.getState().schreibeIns({ id: 'wofuer', art: 'wofuer', text: wofuer.trim() })
    void useCoach.getState().sichere()
    onFertig()
  }
  const weiterOk = schritt === einf.length + 1 ? bereiche.length > 0 : true
  const zeigeName = mitName('{name}', name)
  if (!g) return <Laedt />
  return (
    <div className="dc-breit dc-spalte" style={{ maxWidth: 820 }} data-dc-einstieg={schritt}>
      <div className="dc-fortschritt"><i style={{ width: `${((schritt + 1) / SCHRITTE) * 100}%` }} /></div>
      {schritt < einf.length && (
        <div className="dc-karte dc-spalte dc-ein" key={schritt}>
          {schritt === 0 && <><div className="dc-band" /><Raumbild name="einstieg" hoehe={210} position="center 30%" /></>}
          <span className="dc-ober">Der Coach · {schritt + 1} von {einf.length}</span>
          <h1 className="dc-h1">{einf[schritt].titel}</h1>
          <p className="dc-gross" style={{ margin: 0 }}>{einf[schritt].text}</p>
          {schritt === 0 && <Bruno gross text={`Ich bin Bruno. Ich habe Boxer trainiert und später Leute, die vor anderen bestehen müssen. Der härteste Gegner steht nie gegenüber.`} />}
        </div>
      )}
      {schritt === einf.length && (
        <div className="dc-karte dc-spalte dc-ein">
          <span className="dc-ober">Wie soll Bruno mit dir reden?</span>
          {TOENE.map(t => (
            <button key={t.id} type="button" className="dc-wahl" aria-pressed={ton === t.id} data-an={ton === t.id ? '1' : undefined} onClick={() => setTon(t.id)} data-dc-ton={t.id}>
              <span className="dc-zeichen">{ton === t.id ? '✓' : ''}</span>
              <span><b>{t.name}</b> <span className="dc-leise">– {t.art}</span><span style={{ display: 'block', marginTop: 4 }}>„{g?.zeilen.falsch[t.id][0]}“</span></span>
            </button>
          ))}
          <span className="dc-klein dc-stumm">Jederzeit umstellbar. Die Lerninhalte selbst sind in allen drei Tönen gleich.</span>
        </div>
      )}
      {schritt === einf.length + 1 && (
        <div className="dc-karte dc-spalte dc-ein">
          <span className="dc-ober">Worin willst du besser werden?</span>
          <BereichWahl index={index} gewaehlt={bereiche} setGewaehlt={setBereiche} schwerpunkte={schwerpunkte} setSchwerpunkte={setSchwerpunkte} />
        </div>
      )}
      {schritt === einf.length + 2 && (
        <div className="dc-karte dc-spalte dc-ein">
          <span className="dc-ober">Was davon kennst du?</span>
          <span className="dc-klein dc-leise">Mehrfachwahl. Daraus setzt Bruno die ersten Schwerpunkte.</span>
          {(g?.situationen ?? []).map(s => {
            const an = situationen.includes(s.id)
            return <button key={s.id} type="button" className="dc-wahl" aria-pressed={an} data-an={an ? '1' : undefined} onClick={() => setSituationen(x => (an ? x.filter(y => y !== s.id) : [...x, s.id]))} data-dc-situation={s.id}><span className="dc-zeichen">{an ? '✓' : ''}</span>{s.text}</button>
          })}
          <label className="dc-spalte" style={{ gap: 4 }}><b>Wofür trainierst du?</b><span className="dc-klein dc-stumm">Ein Satz für dich. Bruno zeigt ihn dir, wenn es mal zäh wird.</span><input className="dc-eingabe" value={wofuer} onChange={e => setWofuer(e.target.value)} placeholder="z. B. Ich will in Besprechungen sagen, was ich denke." /></label>
          <label className="dc-spalte" style={{ gap: 4 }}><b>Wie soll Bruno dich nennen?</b><input className="dc-eingabe" value={name} onChange={e => setName(e.target.value)} placeholder="Vorname (oder leer lassen)" data-dc-name /></label>
          {name.trim() && <span className="dc-klein dc-stumm">Zum Beispiel: „{zeigeName}, du kennst dein Thema.“</span>}
        </div>
      )}
      {schritt === einf.length + 3 && (
        <div className="dc-karte dc-spalte dc-ein">
          <span className="dc-ober">Wie viel Zeit hast du?</span>
          <div className="dc-reihe">{([10, 15, 30] as const).map(m => <button key={m} type="button" className="dc-wahl" style={{ width: 'auto' }} aria-pressed={dauer === m} data-an={dauer === m ? '1' : undefined} onClick={() => setDauer(m)} data-dc-dauer={m}><b>{m} Minuten</b></button>)}</div>
          <span className="dc-klein dc-stumm">Jeden Tag änderbar. Für volle Tage gibt es das Kurztraining mit drei Minuten.</span>
          <b>An welchen Tagen trainierst du?</b>
          <div className="dc-reihe" style={{ gap: 4 }}>{[1, 2, 3, 4, 5, 6, 7].map(t => <button key={t} type="button" className="dc-chip" style={{ cursor: 'pointer', borderColor: tage.includes(t) ? 'var(--dc-gelb)' : undefined, color: tage.includes(t) ? 'var(--dc-ink)' : undefined }} aria-pressed={tage.includes(t)} onClick={() => setTage(x => (x.includes(t) ? x.filter(y => y !== t) : [...x, t].sort()))}>{WT_KURZ[t]}</button>)}</div>
          <span className="dc-klein dc-stumm">Tage, die du nicht wählst, unterbrechen deine Serie nicht.</span>
          <label className="dc-schalter"><input type="checkbox" checked={erinnerung} onChange={e => setErinnerung(e.target.checked)} />Erinnere mich ans Training, ab <input type="time" className="dc-eingabe" style={{ width: 110, padding: '4px 8px' }} value={um} onChange={e => setUm(e.target.value)} /></label>
          <span className="dc-klein dc-stumm">Die Erinnerung ist eine kleine Karte unten rechts im Tool – höchstens einmal am Tag, ohne persönlichen Inhalt.</span>
        </div>
      )}
      <div className="dc-reihe" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="dc-knopf dc-knopf-nackt" disabled={schritt === 0} onClick={() => setSchritt(s => s - 1)}><ArrowLeft size={15} />Zurück</button>
        {schritt < SCHRITTE - 1
          ? <button type="button" className="dc-knopf" disabled={!weiterOk || !g} onClick={() => setSchritt(s => s + 1)} data-dc-weiter>Weiter<ArrowRight size={16} /></button>
          : <button type="button" className="dc-knopf dc-knopf-gross" onClick={fertig} data-dc-los>In die Halle</button>}
      </div>
    </div>
  )
}
