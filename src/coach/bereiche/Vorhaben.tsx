// Der Coach — Vorhaben (Stufe 2): was man sich vornimmt (Sport, Sprache, Freunde, Schlaf …) mit Erinnerungen,
// die nicht nerven: Obergrenze je Tag, Ruhezeiten, drei Schärfen bis zum „Arschtritt“, „Heute nicht“ ohne Strafe.
// Die Erinnerungskarte selbst steckt in Erinnerung.tsx (nennt nie Bereiche, im Diskret-Modus nicht einmal den Titel).
import { useEffect, useState } from 'react'
import { Bell, BellOff, Check, Languages, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Leben, VorhabenIdee, VorhabenKategorie } from '../kern/inhaltTypen'
import type { Erinnerung, Schaerfe, Vorhaben as V } from '../kern/typen'
import { useCoach } from '../kern/speicher'
import { ladeLeben } from '../kern/inhalt'
import { vorhabenGemacht, wochenUebersicht } from '../kern/leben'
import { heute } from '../kern/zeit'
import { host } from '../host/aktiv'
import { Bruno, Laedt } from '../ansicht/hilfen'

const SCHAERFEN: { id: Schaerfe; name: string; text: string }[] = [
  { id: 'sanft', name: 'Sanft', text: 'freundlich, ohne Druck' },
  { id: 'normal', name: 'Klar', text: 'direkt, mit Plan' },
  { id: 'arschtritt', name: 'Arschtritt', text: 'deutlich – du hast es so gewollt' },
]
const FENSTER: { id: V['fenster'][number]; name: string }[] = [{ id: 'morgen', name: 'morgens' }, { id: 'mittag', name: 'mittags' }, { id: 'abend', name: 'abends' }]
const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

type Entwurf = Omit<V, 'weg' | 'gemacht' | 'reagiert'>
const leer = (kat: string, titel = '', idee?: VorhabenIdee): Entwurf => ({ id: `vh-${Date.now().toString(36)}`, kat, titel: idee?.titel ?? titel, proWoche: 3, fenster: [], kleinster: idee?.kleinster ?? '', wennDann: idee?.wennDann ?? '', hindernis: idee?.hindernis ?? '', schaerfe: 'normal', an: true })

export function Vorhaben() {
  const [leben, setLeben] = useState<Leben | null>(null)
  const [bearbeite, setBearbeite] = useState<Entwurf | null>(null)
  const [katalog, setKatalog] = useState(false)
  useEffect(() => { void ladeLeben().then(setLeben) }, [])
  if (!leben) return <Laedt />
  if (bearbeite) return <Bearbeiten leben={leben} e={bearbeite} onFertig={() => { setBearbeite(null); setKatalog(false); void useCoach.getState().sichere() }} />
  if (katalog) return <Katalog leben={leben} onWahl={(k, i) => setBearbeite(leer(k.kat, k.titel, i))} onZurueck={() => setKatalog(false)} />
  return <Uebersicht leben={leben} onNeu={() => setKatalog(true)} onBearbeite={v => setBearbeite(v)} />
}

function Uebersicht({ leben, onNeu, onBearbeite }: { leben: Leben; onNeu: () => void; onBearbeite: (v: V) => void }) {
  const d = useCoach(s => s.daten)
  const tag = heute()
  const woche = wochenUebersicht(d, tag)
  const heuteIndex = (new Date(`${tag}T12:00:00`).getDay() + 6) % 7
  const aus = d.vorhaben.filter(v => !v.an)
  return (
    <div className="dc-breit dc-spalte" data-dc-vorhaben>
      <div className="dc-reihe" style={{ justifyContent: 'space-between' }}>
        <div><span className="dc-ober">Was du dir vornimmst</span><h1 className="dc-h1">Vorhaben</h1></div>
        <button type="button" className="dc-knopf" onClick={onNeu} data-dc-vorhaben-neu><Plus size={14} />Vorhaben</button>
      </div>
      <Bruno haltung="zuhoerend" text={d.vorhaben.length ? 'Klein anfangen, oft wiederholen. Ein Haken zählt auch, wenn es nur der kleinste Schritt war.' : 'Was willst du öfter tun? Sport, Italienisch, Freunde treffen, früher schlafen – such dir eins aus. Ich erinnere dich, ohne zu nerven.'} />
      {woche.length > 0 && (
        <div className="dc-karte-flach dc-spalte" style={{ gap: 8 }}>
          <div className="dc-reihe" style={{ gap: 6, paddingLeft: 'calc(40% + 8px)' }}>{TAGE.map((t, i) => <span key={t} className="dc-klein dc-stumm" style={{ width: 26, textAlign: 'center', fontWeight: i === heuteIndex ? 700 : 400 }}>{t}</span>)}</div>
          {woche.map(w => {
            const kat = leben.vorhaben.find(k => k.kat === w.vorhaben.kat)
            return (
              <div key={w.vorhaben.id} className="dc-reihe" style={{ gap: 8 }} data-dc-vorhaben-zeile={w.vorhaben.id}>
                <button type="button" className="dc-knopf-nackt dc-klein" style={{ width: '40%', textAlign: 'left', border: 0, background: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }} onClick={() => onBearbeite(w.vorhaben)} title="Bearbeiten">
                  <b>{w.vorhaben.titel}</b> <span className="dc-stumm dc-zahl">{w.ist}/{w.soll}</span>
                </button>
                <div className="dc-reihe" style={{ gap: 6 }}>
                  {w.tage.map((an, i) => <span key={i} aria-label={`${TAGE[i]}: ${an ? 'gemacht' : 'offen'}`} style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: an ? 'var(--dc-gut)' : 'var(--dc-flaeche2)', color: an ? 'var(--dc-bg)' : 'var(--dc-stumm)', outline: i === heuteIndex ? '2px solid var(--dc-ink)' : undefined }}>{an ? <Check size={14} /> : null}</span>)}
                </div>
                <div className="dc-reihe" style={{ gap: 4, marginLeft: 'auto' }}>
                  {kat?.sprung === 'parla-italiano' && host().kannOeffnen('parla-italiano') && <button type="button" className="dc-knopf dc-knopf-leise" onClick={() => host().oeffne('parla-italiano')} title="Zu Parla Italiano" aria-label="Zu Parla Italiano"><Languages size={14} /></button>}
                  <button type="button" className={w.tage[heuteIndex] ? 'dc-knopf dc-knopf-leise' : 'dc-knopf'} onClick={() => useCoach.getState().aendere(x => vorhabenGemacht(x, w.vorhaben.id, tag))} data-dc-gemacht={w.vorhaben.id}>{w.tage[heuteIndex] ? 'heute erledigt' : 'heute gemacht'}</button>
                </div>
              </div>
            )
          })}
          <span className="dc-klein dc-stumm">Kein Haken heute? Kein Drama – zwei verpasste Tage hintereinander sind das Einzige, was zählt.</span>
        </div>
      )}
      {aus.length > 0 && <div className="dc-spalte" style={{ gap: 4 }}><span className="dc-ober">Pausiert</span>{aus.map(v => <button key={v.id} type="button" className="dc-wahl" onClick={() => onBearbeite(v)}><span className="dc-zeichen"><BellOff size={14} /></span>{v.titel}</button>)}</div>}
      <ErinnerungsRegeln />
    </div>
  )
}

function ErinnerungsRegeln() {
  const e = useCoach(s => s.daten.profil.erinnerung)
  const setze = (x: Partial<Erinnerung>) => useCoach.getState().aendere(d => ({ ...d, profil: { ...d.profil, erinnerung: { ...d.profil.erinnerung, ...x } } }))
  return (
    <div className="dc-karte-flach dc-spalte" style={{ gap: 8 }} data-dc-erinnerungsregeln>
      <span className="dc-ober"><Bell size={12} style={{ verticalAlign: -1 }} /> Erinnerungen an Vorhaben</span>
      <label className="dc-reihe dc-klein" style={{ gap: 8 }}>Höchstens
        <select className="dc-eingabe" style={{ width: 'auto' }} value={e.proTag} onChange={ev => setze({ proTag: Number(ev.target.value) as Erinnerung['proTag'] })}>{[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n === 0 ? 'keine' : n}</option>)}</select>
        am Tag, mindestens zwei Stunden auseinander.</label>
      <label className="dc-reihe dc-klein" style={{ gap: 8 }}>Ruhe von
        <input type="time" className="dc-eingabe" style={{ width: 'auto' }} value={e.ruheVon} onChange={ev => setze({ ruheVon: ev.target.value })} /> bis
        <input type="time" className="dc-eingabe" style={{ width: 'auto' }} value={e.ruheBis} onChange={ev => setze({ ruheBis: ev.target.value })} /></label>
      <span className="dc-klein dc-stumm">Die Karte erscheint nur, während das Tool offen ist – nie mitten in einer Übung und nie neben einer anderen Erinnerung. Sie nennt nie den Coach-Bereich.</span>
    </div>
  )
}

function Katalog({ leben, onWahl, onZurueck }: { leben: Leben; onWahl: (k: VorhabenKategorie, i?: VorhabenIdee) => void; onZurueck: () => void }) {
  const [offen, setOffen] = useState<string | null>(null)
  return (
    <div className="dc-breit dc-spalte" data-dc-katalog>
      <div className="dc-reihe" style={{ justifyContent: 'space-between' }}><div><span className="dc-ober">Vorhaben</span><h1 className="dc-h1">Was willst du öfter tun?</h1></div><button type="button" className="dc-knopf dc-knopf-nackt" onClick={onZurueck}>Zurück</button></div>
      <div className="dc-raster" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {leben.vorhaben.map(k => (
          <div key={k.kat} className="dc-karte-flach dc-spalte" style={{ gap: 6 }} data-dc-kat={k.kat}>
            <button type="button" className="dc-wahl" onClick={() => setOffen(offen === k.kat ? null : k.kat)} aria-expanded={offen === k.kat}><b>{k.titel}</b></button>
            {offen === k.kat && (
              <div className="dc-spalte" style={{ gap: 4 }}>
                {k.ideen.map(i => <button key={i.titel} type="button" className="dc-knopf dc-knopf-leise dc-klein" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => onWahl(k, i)} data-dc-idee>{i.titel}</button>)}
                <button type="button" className="dc-knopf dc-knopf-nackt dc-klein" onClick={() => onWahl(k)}>Eigenes in „{k.titel}“</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Bearbeiten({ leben, e: start, onFertig }: { leben: Leben; e: Entwurf; onFertig: () => void }) {
  const [e, setE] = useState<Entwurf>(start)
  const vorhanden = useCoach(s => s.daten.vorhaben.find(v => v.id === start.id))
  const kat = leben.vorhaben.find(k => k.kat === e.kat)
  const set = (x: Partial<Entwurf>) => setE(y => ({ ...y, ...x }))
  const speichere = () => {
    const sauber = { ...e, titel: e.titel.trim(), kleinster: e.kleinster.trim(), wennDann: e.wennDann.trim(), hindernis: e.hindernis.trim() }
    useCoach.getState().aendere(d => ({ ...d, vorhaben: vorhanden ? d.vorhaben.map(v => (v.id === e.id ? { ...v, ...sauber, weg: 0, gefragt: undefined } : v)) : [...d.vorhaben, { ...sauber, weg: 0, gemacht: [], reagiert: {} }].slice(-16) }))
    onFertig()
  }
  const loesche = () => { useCoach.getState().aendere(d => ({ ...d, vorhaben: d.vorhaben.filter(v => v.id !== e.id) })); onFertig() }
  return (
    <div className="dc-lauf dc-ein" data-dc-vorhaben-bearbeiten>
      <span className="dc-ober">{kat?.titel ?? 'Vorhaben'} · {vorhanden ? 'bearbeiten' : 'neu'}</span>
      <div className="dc-karte dc-spalte">
        <label className="dc-spalte" style={{ gap: 4 }}><b className="dc-klein">Was genau?</b><input className="dc-eingabe" value={e.titel} onChange={x => set({ titel: x.target.value })} placeholder="z. B. Joggen" data-dc-eingabe /></label>
        <label className="dc-reihe dc-klein" style={{ gap: 8 }}><b>Wie oft pro Woche?</b>
          <select className="dc-eingabe" style={{ width: 'auto' }} value={e.proWoche} onChange={x => set({ proWoche: Number(x.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}×</option>)}</select></label>
        <label className="dc-spalte" style={{ gap: 4 }}><span className="dc-klein"><b>Der kleinste Schritt</b> <span className="dc-stumm">– so klein, dass es auch an einem schlechten Tag geht</span></span><input className="dc-eingabe" value={e.kleinster} onChange={x => set({ kleinster: x.target.value })} placeholder="z. B. Laufschuhe anziehen und einmal um den Block" /></label>
        <label className="dc-spalte" style={{ gap: 4 }}><span className="dc-klein"><b>Wenn …, dann …</b> <span className="dc-stumm">– wann und wo genau</span></span><input className="dc-eingabe" value={e.wennDann} onChange={x => set({ wennDann: x.target.value })} placeholder="Wenn ich dienstags nach Hause komme, dann ziehe ich sofort die Laufschuhe an." /></label>
        <label className="dc-spalte" style={{ gap: 4 }}><span className="dc-klein"><b>Was kommt wahrscheinlich dazwischen?</b></span><input className="dc-eingabe" value={e.hindernis} onChange={x => set({ hindernis: x.target.value })} /></label>
        <div className="dc-spalte" style={{ gap: 4 }}><b className="dc-klein">Erinnern – wann passt es dir?</b>
          <div className="dc-reihe" style={{ gap: 6 }}>{FENSTER.map(f => <label key={f.id} className="dc-schalter dc-klein"><input type="checkbox" checked={e.fenster.includes(f.id)} onChange={() => set({ fenster: e.fenster.includes(f.id) ? e.fenster.filter(x => x !== f.id) : [...e.fenster, f.id] })} />{f.name}</label>)}<span className="dc-klein dc-stumm">(nichts gewählt = egal)</span></div></div>
        <div className="dc-spalte" style={{ gap: 4 }}><b className="dc-klein">Ton der Erinnerung</b>
          <div className="dc-reihe" style={{ gap: 6 }}>{SCHAERFEN.map(s => <button key={s.id} type="button" className="dc-wahl" data-an={e.schaerfe === s.id ? '1' : undefined} aria-pressed={e.schaerfe === s.id} onClick={() => set({ schaerfe: s.id })} style={{ flex: 1 }}><span><b>{s.name}</b><span className="dc-klein dc-leise" style={{ display: 'block' }}>{s.text}</span></span></button>)}</div></div>
        <label className="dc-schalter dc-klein"><input type="checkbox" checked={e.an} onChange={() => set({ an: !e.an })} />{e.an ? <><Bell size={12} /> aktiv – erinnert und zählt</> : <><BellOff size={12} /> pausiert</>}</label>
        <div className="dc-reihe" style={{ justifyContent: 'space-between' }}>
          <div className="dc-reihe" style={{ gap: 4 }}>
            <button type="button" className="dc-knopf dc-knopf-nackt" onClick={onFertig}>Abbrechen</button>
            {vorhanden && <button type="button" className="dc-knopf dc-knopf-nackt" onClick={loesche}><Trash2 size={14} />Streichen</button>}
          </div>
          <button type="button" className="dc-knopf" disabled={!e.titel.trim()} onClick={speichere} data-dc-weiter>{vorhanden ? <><Pencil size={14} />Speichern</> : <><Plus size={14} />Vornehmen</>}</button>
        </div>
      </div>
    </div>
  )
}
