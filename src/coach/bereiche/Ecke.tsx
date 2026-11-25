// Der Coach — „In deiner Ecke“: was Bruno über dich denkt, in Klartext und durchschaubar. Formkurve, Kalibrierung,
// Muster und das Buch (Konter-Schatz, Erfolgsbuch, Sätze, Pläne). Alles liegt nur auf diesem PC.
import { useMemo, useState } from 'react'
import { MessageCircleWarning } from 'lucide-react'
import type { InhaltsIndex } from '../kern/index'
import { kursId } from '../kern/inhaltTypen'
import { useCoach } from '../kern/speicher'
import { gewaehlt } from '../kern/kurs'
import { form, luecke } from '../kern/gehirn/schaetzung'
import { kastenStand } from '../kern/gehirn/wiederholung'
import { heute, tagNummer } from '../kern/zeit'
import { Bruno, Raumbild, useGemeinsam } from '../ansicht/hilfen'
import { antrieb } from '../kern/serie'
import { beweisBilanz, beweisliste } from '../kern/leben'
import { rangliste } from './Notfallkoffer'
import { Sprechbild } from './Sprechbild'

const TENDENZ: Record<string, string> = {
  rechtfertigen: 'rechtfertigt sich bei Sprüchen', angreifen: 'schießt eher zurück', uebertrumpfen: 'will Witze übertrumpfen', verstummen: 'verstummt leicht',
  kleinreden: 'macht sich klein', ausweichen: 'weicht aus', ausfragen: 'fragt aus, statt aufzugreifen', gedankenlesen: 'deutet, statt zu fragen',
  einzelzeichen: 'liest aus Einzelzeichen', unterdruecken: 'drückt Aufregung weg', katastrophe: 'denkt in Katastrophen',
}
const ART = { konter: 'Konter-Schatz', erfolg: 'Erfolgsbuch', satz: 'Sätze für die Ecke', plan: 'Pläne', geschichte: 'Geschichten', reflexion: 'Gedanken', antwort: 'Antworten', routine: 'Startroutine', wortliste: 'Wortliste', wofuer: 'Wofür ich trainiere', kompass: 'Kompass' }

export function Ecke({ index }: { index: InhaltsIndex }) {
  const daten = useCoach(s => s.daten)
  const buch = useCoach(s => s.buch)
  const tag = tagNummer(heute())
  const bereiche = gewaehlt(daten.profil, index)
  const faehig = useMemo(() => bereiche.flatMap(b => index.bereiche.find(x => x.id === b)!.faehigkeiten.filter(f => !f.spur || daten.profil.schwerpunkte.includes(f.spur)).map(f => ({ ...f, form: form(daten.f[f.id], tag), luecke: luecke(daten.f[f.id], tag) }))), [bereiche, index, daten, tag])
  const bewertet = faehig.filter(f => f.form !== null).sort((a, b) => (b.form ?? 0) - (a.form ?? 0))
  const stark = bewertet.slice(0, 2), schwach = bewertet.slice(-2).reverse().filter(f => !stark.includes(f))
  const lueckeF = faehig.find(f => f.luecke)
  const kalib = daten.kalib.length >= 15 ? daten.kalib.reduce((s, k) => s + k[0], 0) / daten.kalib.length - daten.kalib.reduce((s, k) => s + k[1], 0) / daten.kalib.length : null
  const muster = Object.entries(daten.muster).map(([t, l]) => { const neu = l.filter(x => x[0] > tag - 14); const treffer = neu.filter(x => x[1]).length; return { t, treffer, quote: neu.length ? treffer / neu.length : 0 } }).filter(m => m.treffer >= 4 && m.quote > 0.4)
  const k = kastenStand(daten.kasten, tag)
  const g = useGemeinsam()
  const [widerspreche, setWiderspreche] = useState(false)
  const wirkt = g ? rangliste(g.werkzeuge, daten.wirkung).filter(x => x.mittel !== null).slice(0, 3) : []
  const bilanz = beweisBilanz(beweisliste(daten))
  const zustand = antrieb(daten, heute())
  const schaetze = [['konter', 'Konter'], ['erfolg', 'Erfolge'], ['satz', 'Sätze'], ['geschichte', 'Geschichten']].map(([a, n]) => ({ n, zahl: buch.eintraege.filter(e => e.art === a).length }))
  const widersprochen = Object.entries(daten.widerspruch).filter(([, t]) => tag - t <= 7).map(([f]) => f)
  const urteil = bewertet.length < 2 ? 'Ich lerne dich noch kennen. Nach ein paar Trainings sage ich dir hier, wo du stark bist und wo es hakt.'
    : `Stark: ${stark.map(f => f.name).join(' und ')}.${schwach.length ? ` Hier hakt es noch: ${schwach.map(f => f.name).join(' und ')} – das trainieren wir gezielt.` : ''}${lueckeF ? ` Bei „${lueckeF.name}“ weißt du viel – jetzt kommt es aufs Tun an.` : ''}`
  return (
    <div className="dc-breit dc-spalte" data-dc-ecke>
      <div><span className="dc-ober">Deine Trainerakte</span><h1 className="dc-h1">In deiner Ecke</h1></div>
      <Raumbild name="ecke" hoehe={170} position="center 30%" />
      <Bruno gross text={urteil} />
      <div className="dc-raster" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <div className="dc-karte-flach"><div className="dc-klein dc-stumm">Merkkarten</div><div className="dc-h2 dc-zahl">{k.karten}</div><div className="dc-klein dc-leise">{k.sicher} sitzen sicher · {k.faellig} fällig</div></div>
        <div className="dc-karte-flach"><div className="dc-klein dc-stumm">Aufgaben fürs echte Leben</div><div className="dc-h2 dc-zahl">{Object.values(daten.missionen.erledigt).reduce((s, x) => s + x.length, 0)}</div><div className="dc-klein dc-leise">erledigt · {daten.missionen.offen.length} vorgenommen</div></div>
        <div className="dc-karte-flach"><div className="dc-klein dc-stumm">Selbsteinschätzung</div><div className="dc-h2">{kalib === null ? '–' : Math.abs(kalib) <= 0.15 ? 'treffsicher' : kalib > 0 ? 'eher zu sicher' : 'unterschätzt'}</div><div className="dc-klein dc-leise">{kalib === null ? 'ab 15 Antworten mit Sicherheitsangabe' : kalib < -0.15 ? 'Du lagst öfter richtig, als du dachtest.' : kalib > 0.15 ? 'Du warst öfter sicherer als richtig.' : 'Gefühl und Treffer passen zusammen.'}</div></div>
      </div>
      <div className="dc-raster" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }} data-dc-schaetze>
        {schaetze.map(x => <div key={x.n} className="dc-karte-flach"><div className="dc-klein dc-stumm">{x.n}</div><div className="dc-h2 dc-zahl">{x.zahl}</div></div>)}
      </div>
      {bilanz.n >= 3 && <div className="dc-karte-flach" data-dc-bilanz><b>Befürchtet vs. passiert:</b> In {bilanz.n} Aufgaben trat das Befürchtete {bilanz.eingetreten}-mal ein{bilanz.erwartet ? ` – erwartet hattest du im Schnitt ${bilanz.erwartet} %` : ''}. Dein Kopf übertreibt – das ist normal, und jetzt hast du es schwarz auf weiß.</div>}
      {wirkt.length > 0 && <div className="dc-karte-flach dc-spalte" style={{ gap: 4 }} data-dc-wirkt><b>Was bei dir wirkt</b>{wirkt.map(x => <span key={x.w.id}>{x.w.titel} <span className="dc-stumm dc-zahl">– senkt im Schnitt um {Math.round(x.mittel ?? 0)}</span></span>)}<span className="dc-klein dc-stumm">Eine Beobachtung aus deinen eigenen Angaben, kein Versprechen.</span></div>}
      {(zustand === 'wackelt' || zustand === 'pause') && <div className="dc-karte-flach">{zustand === 'pause' ? 'Du warst eine Weile weg. Kein Problem – der Kurs wartet. Fang mit dem Kurztraining an; drei Minuten zählen.' : 'Die letzten Trainingstage sind ausgefallen. Zwei verpasste Tage sind kein Drama – der dritte ist der, den wir verhindern.'}</div>}
      {muster.length > 0 && <div className="dc-karte-flach dc-spalte" style={{ gap: 4 }}><b>Was mir auffällt</b>{muster.map(m => <span key={m.t}>Du {TENDENZ[m.t] ?? m.t} – in {m.treffer} Lagen der letzten zwei Wochen. Kein Vorwurf, nur ein Muster. Bruno plant passende Übungen ein.</span>)}</div>}
      <div className="dc-karte dc-spalte">
        <div className="dc-reihe" style={{ justifyContent: 'space-between' }}><h2 className="dc-h2">Form je Fähigkeit</h2><button type="button" className="dc-knopf dc-knopf-nackt dc-klein" onClick={() => setWiderspreche(x => !x)} aria-pressed={widerspreche} data-dc-widerspruch><MessageCircleWarning size={14} />Das stimmt so nicht</button></div>
        {widerspreche && <span className="dc-klein dc-leise">Tipp die Fähigkeit an, bei der Bruno falsch liegt. Er prüft sie dann eine Woche lang gezielt nach – mit echten Aufgaben, nicht mit deinem Gefühl.</span>}
        {bereiche.map(b => { const fs = faehig.filter(f => f.id.startsWith(`${b}.`)); const fc = daten.formcheck[kursId(b)] ?? []; return (
          <div key={b} className="dc-spalte" style={{ gap: 4 }}>
            <b className="dc-klein">{index.bereiche.find(x => x.id === b)?.name}{fc.length > 0 && <span className="dc-stumm"> · Formcheck: {fc.map(x => Math.round(x.wert * 100)).join(' → ')}</span>}</b>
            {fs.map(f => <div key={f.id} className="dc-reihe" style={{ flexWrap: 'nowrap' }}>{widerspreche ? <button type="button" className="dc-knopf dc-knopf-leise dc-klein" style={{ width: 200, flex: 'none', justifyContent: 'flex-start' }} onClick={() => { useCoach.getState().aendere(d => ({ ...d, widerspruch: { ...d.widerspruch, [f.id]: tag } })); setWiderspreche(false) }}>{f.name}</button> : <span className="dc-klein" style={{ width: 200, flex: 'none' }}>{f.name}{widersprochen.includes(f.id) && <span className="dc-stumm" title="wird nachgeprüft"> ·?</span>}</span>}{f.form === null ? <span className="dc-klein dc-stumm">noch wenig Daten</span> : <span className="dc-balken" style={{ flex: 1 }}><i style={{ width: `${f.form * 100}%` }} /></span>}</div>)}
          </div>) })}
      </div>
      <Sprechbild />
      <div className="dc-karte dc-spalte">
        <h2 className="dc-h2">Dein Buch</h2>
        {Object.entries(ART).map(([art, titel]) => { const liste = buch.eintraege.filter(e => e.art === art); if (!liste.length) return null; return (
          <details key={art}><summary style={{ cursor: 'pointer' }}><b>{titel}</b> <span className="dc-stumm">({liste.length})</span></summary>
            <ul style={{ margin: '6px 0', paddingLeft: 18 }}>{liste.slice().reverse().slice(0, 50).map(e => <li key={e.id}>{e.bezug && art === 'konter' ? <><span className="dc-stumm">{e.bezug} → </span>{e.text}</> : e.text}</li>)}</ul></details>) })}
        {!buch.eintraege.length && <span className="dc-klein dc-stumm">Noch leer. Konter, Pläne und Erfolge aus deinen Trainings landen hier – nur für dich.</span>}
      </div>
    </div>
  )
}
