// Der Coach — Bereichsseite („wie eine eigene App“): Überblick, Wissen, Üben, Echtes Leben, Werkzeuge.
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, CheckCircle2, Circle, Dumbbell, Flag, LayoutDashboard, Wrench } from 'lucide-react'
import type { BereichId, Mission, WissensArt, WissensEintrag, WissensSeite } from '../kern/inhaltTypen'
import { PHASEN, kursId } from '../kern/inhaltTypen'
import type { InhaltsIndex } from '../kern/index'
import type { Block } from '../kern/typen'
import { useCoach } from '../kern/speicher'
import { fortschritt, kurseVonBereich, naechsterLerntag, pflegeStaffel } from '../kern/kurs'
import { form } from '../kern/gehirn/schaetzung'
import { zieheVorrat } from '../kern/gehirn/planer'
import { ladeMissionen, ladeWissen } from '../kern/inhalt'
import { heute, tagNummer } from '../kern/zeit'
import { rng } from '../kern/zufall'
import { BelegChip, Laedt, Quellen, mitName, useName } from '../ansicht/hilfen'
import { Symbol } from '../ansicht/Symbol'
import { MissionWahl } from '../ablauf/Mission'

type Reiter = 'ueberblick' | 'wissen' | 'ueben' | 'leben' | 'werkzeuge'
const REITER: { id: Reiter; name: string; S: typeof BookOpen }[] = [
  { id: 'ueberblick', name: 'Überblick', S: LayoutDashboard }, { id: 'wissen', name: 'Wissen', S: BookOpen }, { id: 'ueben', name: 'Üben', S: Dumbbell }, { id: 'leben', name: 'Echtes Leben', S: Flag }, { id: 'werkzeuge', name: 'Werkzeuge', S: Wrench },
]
const ABSCHNITTE: { art: WissensArt; titel: string; text: string }[] = [
  { art: 'hebel', titel: 'Was wirklich trägt', text: 'Die stärksten Hebel – sortiert nach Beleg.' },
  { art: 'taktik', titel: 'Techniken und Taktiken', text: 'Mit eigenen Beispielen. Unfaire Tricks stehen hier, damit du sie erkennst und abwehrst.' },
  { art: 'formulierung', titel: 'Formulierungen zum Mitnehmen', text: '' },
  { art: 'fehler', titel: 'Typische Fehler', text: 'Und was stattdessen hilft.' },
  { art: 'mythos', titel: 'Mythen-Check', text: 'Verbreitet – und was davon stimmt.' },
  { art: 'dahinter', titel: 'Was dahinter steckt', text: 'Psychologie und Tiefenpsychologie als Denkangebot, nie als Diagnose.' },
  { art: 'buch', titel: 'Was die großen Bücher sagen', text: 'Kernideen in eigenen Worten – und was davon heute hält.' },
  { art: 'umfeld', titel: 'Je nach Gegenüber', text: '' },
]
const BELEG_ORDNUNG = { A: 0, B: 1, P: 2, D: 3, U: 4 }
const EINFLUSS = { fair: 'fair', taktik: 'Taktik', rot: 'unfair – erkennen und abwehren' }

export function Eintrag({ e }: { e: WissensEintrag }) {
  const name = useName()
  return (
    <div className="dc-karte-flach dc-spalte" style={{ gap: 6, borderColor: e.einfluss === 'rot' ? 'var(--dc-schlecht)' : undefined }} data-dc-wissen={e.id}>
      <div className="dc-reihe" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <b>{e.titel}</b>
        <span className="dc-reihe" style={{ gap: 6, flexWrap: 'nowrap' }}>{e.einfluss && <span className={`dc-chip ${e.einfluss === 'rot' ? 'dc-chip-rot' : e.einfluss === 'taktik' ? 'dc-chip-gelb' : ''}`}>{EINFLUSS[e.einfluss]}</span>}{e.urteil && <span className="dc-chip">{e.urteil === 'falsch' ? 'Mythos' : e.urteil === 'teils' ? 'teils wahr' : 'stimmt'}</span>}<BelegChip b={e.beleg} hinweis={e.belegHinweis} /></span>
      </div>
      <span>{mitName(e.text, name)}</span>
      {e.beispiele?.map((b, i) => <span key={i} className="dc-zitat">{mitName(b, name)}</span>)}
      {e.punkte && <ul style={{ margin: 0, paddingLeft: 18 }}>{e.punkte.map((p, i) => <li key={i}>{p}</li>)}</ul>}
      {e.statt && <span className="dc-leise">{e.art === 'buch' ? 'Was davon hält: ' : 'Stattdessen: '}{e.statt}</span>}
      {e.preis && <span className="dc-klein dc-leise"><b>Preis:</b> {e.preis}</span>}
      {e.abwehr && <span className="dc-klein"><b>Abwehr:</b> {e.abwehr}</span>}
      {(e.belegHinweis || e.quellen.length > 0) && <details className="dc-klein dc-leise"><summary style={{ cursor: 'pointer' }}>Beleg</summary>{e.belegHinweis && <p style={{ margin: '4px 0' }}>{e.belegHinweis}</p>}<Quellen ids={e.quellen} /></details>}
    </div>
  )
}

export function Bereichsseite({ index, bereich, onZurueck, onUeben }: { index: InhaltsIndex; bereich: BereichId; onZurueck: () => void; onUeben: (bloecke: Block[]) => void }) {
  const info = index.bereiche.find(b => b.id === bereich)!
  const daten = useCoach(s => s.daten)
  const buch = useCoach(s => s.buch)
  const [reiter, setReiter] = useState<Reiter>('ueberblick')
  const [wissen, setWissen] = useState<WissensSeite | null | undefined>(undefined)
  const [missionen, setMissionen] = useState<Mission[] | null>(null)
  const [mission, setMission] = useState<string | null>(null)
  const tag = tagNummer(heute())
  useEffect(() => { void ladeWissen(bereich).then(setWissen) }, [bereich])
  useEffect(() => { if (reiter === 'leben') void ladeMissionen(bereich).then(setMissionen) }, [reiter, bereich])
  const gewaehlt = daten.profil.bereiche.includes(bereich)
  const kurse = kurseVonBereich(daten.profil, index, bereich)
  const kipp = () => useCoach.getState().aendere(d => {
    const bereiche = gewaehlt ? d.profil.bereiche.filter(b => b !== bereich) : [...d.profil.bereiche, bereich]
    const n = { ...d, profil: { ...d.profil, bereiche } }
    return { ...n, kurse: pflegeStaffel(n, index, tag) }
  })
  const einheiten = useMemo(() => Object.entries(index.einheiten).filter(([, e]) => e.kurs.split('/')[0] === bereich && (!e.kurs.includes('/') || daten.profil.schwerpunkte.includes(e.kurs.split('/')[1] as never))), [index, bereich, daten.profil.schwerpunkte])
  const lagen = useMemo(() => Object.entries(index.lagen).filter(([, l]) => l.b === bereich && (!l.sp || daten.profil.schwerpunkte.includes(l.sp))), [index, bereich, daten.profil.schwerpunkte])
  const uebe = (titel: string, ids: string[], art: Block['art'] = 'ueben') => onUeben([{ art, titel, ids, minuten: Math.max(1, ids.length), fertig: false, kurs: kursId(bereich) }])
  const aufgaben = (fs: string[] | undefined, n: number) => zieheVorrat(index, daten, { faehigkeiten: fs, bereiche: [bereich], band: [1, 10] }, n, rng(`${bereich}|${Date.now()}`), daten.profil.lautUeben, new Set()).map(id => `v:${id}`)
  const eigene = buch.eintraege.filter(e => (e.bezug ?? '').startsWith(`${bereich}-`) || (bereich === 'konter' && e.art === 'konter'))
  return (
    <div className="dc-breit dc-spalte" data-dc-bereichsseite={bereich}>
      <div className="dc-reihe" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="dc-knopf dc-knopf-nackt" onClick={onZurueck}><ArrowLeft size={15} />Halle</button>
        <button type="button" className={`dc-knopf ${gewaehlt ? 'dc-knopf-leise' : ''}`} onClick={kipp} data-dc-bereich-waehlen>{gewaehlt ? 'Aus meinem Training nehmen' : 'In mein Training aufnehmen'}</button>
      </div>
      <div className="dc-reihe" style={{ gap: 12 }}><Symbol name={info.zeichen} size={28} /><div><span className="dc-ober">Bereich</span><h1 className="dc-h1">{info.name}</h1></div></div>
      <div className="dc-reiter" role="tablist">{REITER.map(r => <button key={r.id} type="button" role="tab" aria-selected={reiter === r.id} onClick={() => setReiter(r.id)} data-dc-reiter={r.id}><r.S size={14} style={{ verticalAlign: -2, marginRight: 5 }} />{r.name}</button>)}</div>

      {reiter === 'ueberblick' && <div className="dc-spalte dc-ein">
        {wissen && <p className="dc-gross" style={{ margin: 0, fontWeight: 600 }}>{wissen.kern}</p>}
        {wissen && <p style={{ margin: 0 }} className="dc-leise">{wissen.einleitung}</p>}
        {wissen && <div className="dc-karte-flach dc-spalte" style={{ gap: 6 }}><b>Das kannst du am Ende</b>{wissen.ziel.map((z, i) => <div key={i} className="dc-reihe" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><span className="dc-chip" style={{ flex: 'none' }}>{PHASEN[(['g', 'k', 'm'] as const)[i]]}</span><span>{z}</span></div>)}</div>}
        {kurse.map(k => { const f = fortschritt(index, k, daten.kurse[k]); const n = naechsterLerntag(index, k, daten.kurse[k]); return f.gesamt ? (
          <div key={k} className="dc-karte-flach dc-spalte" style={{ gap: 6 }}>
            <div className="dc-reihe" style={{ justifyContent: 'space-between' }}><b>{k.includes('/') ? `Schwerpunkt ${index.schwerpunkte.find(s => s.id === k.split('/')[1])?.name}` : 'Kurs'}</b><span className="dc-klein dc-stumm dc-zahl">Lerntag {f.erledigt} von {f.gesamt}{f.phase ? ` · Phase ${PHASEN[f.phase]}` : ''}</span></div>
            <span className="dc-balken"><i style={{ width: `${(f.erledigt / f.gesamt) * 100}%` }} /></span>
            {n && <span className="dc-klein dc-leise">Als Nächstes: {n.art === 'E' ? index.einheiten[n.einheit]?.titel : n.art === 'L' || n.art === 'S' ? index.lagen[n.lage]?.titel : n.titel ?? 'Anwendung'}</span>}
          </div>) : null })}
        <div className="dc-spalte" style={{ gap: 6 }}>
          <b>Deine Form je Fähigkeit</b>
          {info.faehigkeiten.filter(f => !f.spur || daten.profil.schwerpunkte.includes(f.spur)).map(f => { const w = form(daten.f[f.id], tag); return (
            <div key={f.id} className="dc-reihe" style={{ flexWrap: 'nowrap' }}><span style={{ width: 210, flex: 'none' }}>{f.name}<span className="dc-klein dc-stumm" style={{ display: 'block' }}>{f.kurz}</span></span>
              {w === null ? <span className="dc-klein dc-stumm">noch wenig Daten</span> : <><span className="dc-balken" style={{ flex: 1 }}><i style={{ width: `${w * 100}%` }} /></span><span className="dc-klein dc-zahl" style={{ width: 36 }}>{Math.round(w * 100)}</span></>}</div>) })}
        </div>
      </div>}

      {reiter === 'wissen' && (wissen === undefined ? <Laedt /> : !wissen ? <p className="dc-leise">Das Wissen zu diesem Bereich ist in Vorbereitung.</p> : <div className="dc-spalte dc-ein">
        {ABSCHNITTE.map(a => { const liste = wissen.eintraege.filter(e => e.art === a.art && !e.entfallen).sort((x, y) => (a.art === 'hebel' ? BELEG_ORDNUNG[x.beleg] - BELEG_ORDNUNG[y.beleg] : 0)); if (!liste.length) return null
          const gruppen = [...new Set(liste.map(e => e.gruppe ?? ''))]
          return (
            <section key={a.art} className="dc-spalte" style={{ gap: 8 }}>
              <div><h2 className="dc-h2">{a.titel}</h2>{a.text && <span className="dc-klein dc-stumm">{a.text}</span>}</div>
              {gruppen.map(gr => <div key={gr} className="dc-spalte" style={{ gap: 8 }}>{gr && <b className="dc-klein">{gr}</b>}<div className="dc-raster" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>{liste.filter(e => (e.gruppe ?? '') === gr).map(e => <Eintrag key={e.id} e={e} />)}</div></div>)}
            </section>
          ) })}
      </div>)}

      {reiter === 'ueben' && <div className="dc-spalte dc-ein">
        <div className="dc-reihe"><button type="button" className="dc-knopf" onClick={() => uebe('Zufallsrunde', aufgaben(undefined, 5))} data-dc-zufall>Zufallsrunde (5 Aufgaben)</button>
          {index.tests[kursId(bereich)] && <><button type="button" className="dc-knopf dc-knopf-leise" onClick={() => uebe('Einstufung', [`k:${kursId(bereich)}`], 'einstufung')}>Einstufung</button><button type="button" className="dc-knopf dc-knopf-leise" onClick={() => uebe('Formcheck', [`k:${kursId(bereich)}`], 'formcheck')}>Formcheck</button></>}</div>
        <b>Fähigkeiten gezielt üben</b>
        <div className="dc-raster">{info.faehigkeiten.filter(f => !f.spur || daten.profil.schwerpunkte.includes(f.spur)).map(f => <button key={f.id} type="button" className="dc-wahl" onClick={() => uebe(f.name, aufgaben([f.id], 4))} data-dc-faehigkeit={f.id}><span><b>{f.name}</b><span className="dc-klein dc-stumm" style={{ display: 'block' }}>{f.kurz}</span></span></button>)}</div>
        {einheiten.length > 0 && <><b>Alle Einheiten</b>
          <div className="dc-spalte" style={{ gap: 6 }}>{einheiten.map(([id, e]) => { const erledigt = Object.values(daten.kurse).some(k => k.erledigt[id] !== undefined); return <button key={id} type="button" className="dc-wahl" onClick={() => uebe(e.titel, [`e:${id}`], 'neu')} data-dc-einheit-los={id}>{erledigt ? <CheckCircle2 size={16} style={{ color: 'var(--dc-gut)' }} /> : <Circle size={16} />}<span style={{ flex: 1 }}>{e.titel}</span><span className="dc-klein dc-stumm">{e.dauer} Min.</span></button> })}</div></>}
        {lagen.length > 0 && <><b>Lagen und Sparrings</b>
          <div className="dc-spalte" style={{ gap: 6 }}>{lagen.map(([id, l]) => <button key={id} type="button" className="dc-wahl" onClick={() => uebe(l.titel, [`l:${id}`])}>{l.sparring ? '🥊' : '💬'}<span style={{ flex: 1 }}>{l.titel}</span><span className="dc-klein dc-stumm">{PHASEN[l.phase]}</span></button>)}</div></>}
      </div>}

      {reiter === 'leben' && <div className="dc-spalte dc-ein">
        {mission ? <div className="dc-karte"><MissionWahl id={mission} onFertig={() => setMission(null)} /></div> : <>
          <p className="dc-leise" style={{ margin: 0 }}>Die Leiter: zehn Sprossen von sehr leicht bis mutig. Du wählst immer selbst – am meisten bringt die Sprosse, die ein wenig Herzklopfen macht.</p>
          {!missionen ? <Laedt /> : missionen.length === 0 ? <p className="dc-leise">Die Leiter dieses Bereichs ist in Vorbereitung.</p> :
            [...new Set(missionen.map(m => m.schwerpunkt ?? ''))].filter(sp => !sp || daten.profil.schwerpunkte.includes(sp as never)).map(sp => <div key={sp} className="dc-spalte" style={{ gap: 6 }}>
              {sp && <b>Schwerpunkt {index.schwerpunkte.find(x => x.id === sp)?.name}</b>}
              {missionen.filter(m => (m.schwerpunkt ?? '') === sp && (!m.mutprobe || daten.profil.mutproben)).sort((a, b) => a.stufe - b.stufe).map(m => { const erl = daten.missionen.erledigt[m.id]?.length ?? 0; const offen = daten.missionen.offen.some(x => x.id === m.id); return (
                <button key={m.id} type="button" className="dc-wahl" onClick={() => setMission(m.id)} data-dc-sprosse={m.stufe}>
                  <span className="dc-zeichen dc-zahl">{m.stufe}</span><span style={{ flex: 1 }}><b>{m.titel}</b><span className="dc-klein dc-leise" style={{ display: 'block' }}>{m.auftrag}</span></span>
                  <span className="dc-klein">{erl ? `✓ ${erl}×` : offen ? '● vorgenommen' : ''}</span>
                </button>) })}
            </div>)}
        </>}
      </div>}

      {reiter === 'werkzeuge' && <div className="dc-spalte dc-ein">
        {wissen?.eintraege.filter(e => e.art === 'spickzettel').map(e => <Eintrag key={e.id} e={e} />)}
        <b>Deine Sammlung</b>
        {eigene.length ? eigene.slice().reverse().map(e => <div key={e.id} className="dc-karte-flach"><span className="dc-chip" style={{ marginRight: 8 }}>{e.art === 'konter' ? 'Konter' : e.art === 'plan' ? 'Plan' : e.art === 'erfolg' ? 'Erfolg' : 'Notiz'}</span>{e.text}</div>)
          : <p className="dc-klein dc-stumm" style={{ margin: 0 }}>Was du in Übungen speicherst – Konter, Pläne, Erfolge –, sammelt sich hier.</p>}
      </div>}
    </div>
  )
}
