// Der Coach — Heute: Begrüßung, das heutige Lernpaket (Dauer und „laut“ umstellbar), Serie und Wochenziel,
// offene Aufgaben fürs echte Leben, „Gleich geht's los“. Gleicher Tag → gleicher Plan (im Lernstand festgehalten).
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Flag, Flame, Hash, HelpCircle, Minus, Play, Plus, Volume2, VolumeX, Zap } from 'lucide-react'
import type { InhaltsIndex } from '../kern/index'
import type { Block, TagesPlan } from '../kern/typen'
import { useCoach } from '../kern/speicher'
import { planeTag, minutenVon } from '../kern/gehirn/planer'
import { serie, antrieb } from '../kern/serie'
import { gewaehlt } from '../kern/kurs'
import { heute, datumText, tagNummer } from '../kern/zeit'
import { aktiveZaehler, zaehle } from '../kern/buchung'
import { Bruno, useGemeinsam, useZeile } from '../ansicht/hilfen'

export function Heute({ index, onStart, onNotfall }: { index: InhaltsIndex; onStart: (p: TagesPlan) => void; onNotfall: (id?: string) => void }) {
  const daten = useCoach(s => s.daten)
  const buch = useCoach(s => s.buch)
  const tag = heute()
  const [dauer, setDauer] = useState<10 | 15 | 30 | 3>(daten.heute?.tag === tag ? daten.heute.dauer : daten.profil.dauer)
  const [laut, setLaut] = useState(daten.heute?.tag === tag ? daten.heute.laut : daten.profil.lautUeben)
  const [warum, setWarum] = useState(false)
  const g = useGemeinsam()
  const zustand = antrieb(daten, tag)
  const gruss = useZeile(zustand === 'pause' ? 'rueckkehr' : zustand === 'neu' ? 'erster' : 'begruessung', tag)
  const kurzZeile = useZeile('kurztraining', tag)
  const s = serie(daten, tag)
  const plan = useMemo(() => planeTag(daten, index, tag, { dauer, laut }), [daten, index, tag, dauer, laut])
  // Plan festhalten, sobald er sich ändert (gleicher Tag → gleicher Plan)
  useEffect(() => {
    if (JSON.stringify(daten.heute) !== JSON.stringify(plan)) useCoach.getState().aendere(d => ({ ...d, heute: plan }))
  }, [plan, daten.heute])
  const fertig = plan.bloecke.length > 0 && plan.bloecke.every(b => b.fertig)
  const begonnen = plan.begonnen && !fertig
  const wofuer = buch.eintraege.find(e => e.art === 'wofuer')?.text
  const offen = daten.missionen.offen
  const bereiche = gewaehlt(daten.profil, index)
  const keineInhalte = bereiche.length === 0
  return (
    <div className="dc-breit dc-spalte" data-dc-heute>
      <div className="dc-reihe" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div><span className="dc-ober">{datumText(tag)}</span><h1 className="dc-h1">Heute</h1></div>
        <div className="dc-reihe">
          <span className="dc-chip dc-chip-gelb dc-zahl" title="Trainingstage in Folge – ein ausgelassener Tag ist rettbar" data-dc-serie={s.aktuell}><Flame size={13} />{s.aktuell} {s.aktuell === 1 ? 'Tag' : 'Tage'}</span>
          <span className="dc-chip dc-zahl" title="Wochenziel">Woche {s.woche.geschafft}/{s.woche.ziel}</span>
          <span className="dc-chip dc-zahl" title="Fünf Trainings sind eine Runde">Runde {daten.runde.nr} · {daten.runde.trainings}/5</span>
        </div>
      </div>
      <Bruno gross haltung={s.rettbar || zustand === 'wackelt' ? 'anfeuernd' : zustand === 'fluss' ? 'anerkennend' : 'gruss'} text={s.rettbar ? `${gruss} Gestern war Pause – heute rettest du die Serie, auch mit drei Minuten.` : gruss} />
      {zustand === 'pause' && wofuer && <div className="dc-karte-flach"><span className="dc-klein dc-leise">Du hast gesagt, wofür du trainierst:</span><div className="dc-gross" style={{ fontWeight: 600 }}>„{wofuer}“</div></div>}

      <div className="dc-karte dc-spalte" data-dc-plan>
        <div className="dc-reihe" style={{ justifyContent: 'space-between' }}>
          <h2 className="dc-h2">{fertig ? 'Für heute geschafft' : begonnen ? 'Weiter, wo du warst' : 'Dein Training'}</h2>
          {!plan.begonnen && <div className="dc-reihe" style={{ gap: 4 }}>
            {([10, 15, 30] as const).map(m => <button key={m} type="button" className="dc-chip" style={{ cursor: 'pointer', borderColor: dauer === m ? 'var(--dc-rot)' : undefined, color: dauer === m ? 'var(--dc-ink)' : undefined }} aria-pressed={dauer === m} onClick={() => setDauer(m)} data-dc-dauer={m}>{m} Min.</button>)}
            <button type="button" className="dc-chip" style={{ cursor: 'pointer', borderColor: dauer === 3 ? 'var(--dc-rot)' : undefined }} aria-pressed={dauer === 3} onClick={() => setDauer(3)} title={kurzZeile} data-dc-dauer={3}><Zap size={12} />Kurz</button>
          </div>}
        </div>
        {keineInhalte ? <p className="dc-leise" style={{ margin: 0 }}>Für deine gewählten Bereiche sind die Inhalte noch in Vorbereitung. Bis dahin: Notfallkoffer und Halle stehen offen.</p> : <>
          <ol className="dc-spalte" style={{ margin: 0, paddingLeft: 0, listStyle: 'none', gap: 6 }}>
            {plan.bloecke.map((b: Block, i) => (
              <li key={i} className="dc-reihe" style={{ flexWrap: 'nowrap', opacity: b.fertig ? 0.6 : 1 }}>
                {b.fertig ? <CheckCircle2 size={16} style={{ color: 'var(--dc-gut)' }} /> : <span className="dc-chip dc-zahl" style={{ padding: '0 7px' }}>{b.minuten}′</span>}
                <span><b>{b.titel}</b>{b.kurs && <span className="dc-klein dc-stumm"> · {index.bereiche.find(x => x.id === b.kurs!.split('/')[0])?.name}{b.kurs.includes('/') ? ` · ${index.schwerpunkte.find(x => x.id === b.kurs!.split('/')[1])?.name}` : ''}</span>}</span>
              </li>
            ))}
          </ol>
          <div className="dc-reihe" style={{ justifyContent: 'space-between' }}>
            <label className="dc-schalter dc-klein" title="Aus: Bruno plant stille Übungen; laute kommen später dran.">
              <input type="checkbox" checked={laut} disabled={plan.begonnen} onChange={e => { setLaut(e.target.checked); useCoach.getState().aendere(d => ({ ...d, profil: { ...d.profil, lautUeben: e.target.checked } })) }} data-dc-laut />
              {laut ? <Volume2 size={14} /> : <VolumeX size={14} />}Ich kann gerade laut sprechen
            </label>
            {!fertig && <button type="button" className="dc-knopf dc-knopf-gross" onClick={() => onStart(plan)} autoFocus data-dc-start><Play size={18} />{begonnen ? 'Weiter' : `Los · ${minutenVon(plan)} Min.`}</button>}
          </div>
          {plan.grund && <div><button type="button" className="dc-knopf dc-knopf-nackt" onClick={() => setWarum(x => !x)}><HelpCircle size={14} />Warum heute das?</button>{warum && <p className="dc-klein dc-leise dc-ein" style={{ margin: '4px 0 0' }}>{plan.grund}</p>}</div>}
        </>}
      </div>

      <Zaehlerkarte />

      {offen.length > 0 && (
        <div className="dc-karte-flach dc-spalte" style={{ gap: 6 }}>
          <span className="dc-ober" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Flag size={12} />Vorgenommen</span>
          {offen.map(m => <div key={m.id} className="dc-reihe" style={{ justifyContent: 'space-between' }}><span>{index.missionen[m.id]?.titel ?? m.id}</span><span className="dc-klein dc-stumm">{m.plan}</span></div>)}
          <span className="dc-klein dc-stumm">Bruno fragt im nächsten Training nach, wie es lief.</span>
        </div>
      )}

      <div className="dc-spalte" style={{ gap: 8 }}>
        <span className="dc-ober">Gleich geht's los</span>
        <div className="dc-raster">
          {(g?.gleich ?? []).filter(x => !x.bereich || daten.profil.bereiche.includes(x.bereich)).map(x => (
            <button key={x.id} type="button" className="dc-wahl" onClick={() => onNotfall(x.id)} data-dc-gleich={x.id}><span className="dc-zeichen">⏱</span><span>{x.titel}</span></button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Selbstbeobachtung: eingerichtete Zähler (z. B. „Wie bitte?“) – heute zählen, die letzten Tage sehen.
 *  Sich selbst beobachten verändert schon; die Zahlen sieht nur der Nutzer. */
function Zaehlerkarte() {
  const daten = useCoach(s => s.daten)
  const tag = heute()
  const namen = aktiveZaehler(daten, tag)
  if (!namen.length) return null
  const nr = tagNummer(tag)
  const zaehleJetzt = (name: string, schritt: number) => { useCoach.getState().aendere(d => zaehle(d, name, schritt, tag)); void useCoach.getState().sichere() }
  return (
    <div className="dc-karte-flach dc-spalte" style={{ gap: 8 }} data-dc-zaehler>
      <span className="dc-ober" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Hash size={12} />Deine Zähler</span>
      {namen.map(name => {
        const verlauf = daten.zaehler[name] ?? []
        const jetzt = verlauf.find(x => x[0] === nr)?.[1] ?? 0
        const woche = Array.from({ length: 7 }, (_, i) => nr - 6 + i).map(t => verlauf.find(x => x[0] === t)?.[1])
        const rest = (daten.zaehlerBis[name] ?? nr) - nr
        return (
          <div key={name} className="dc-reihe" style={{ justifyContent: 'space-between' }} data-dc-zaehler-name={name}>
            <span><b>{name}</b> <span className="dc-klein dc-stumm">· {rest === 0 ? 'letzter Tag' : `noch ${rest + 1} Tage`} · letzte 7 Tage: {woche.map(x => (x === undefined ? '–' : x)).join(' ')}</span></span>
            <span className="dc-reihe" style={{ gap: 4 }}>
              <button type="button" className="dc-knopf dc-knopf-leise" style={{ padding: '4px 10px' }} disabled={jetzt === 0} onClick={() => zaehleJetzt(name, -1)} aria-label={`${name}: eins weniger`}><Minus size={14} /></button>
              <span className="dc-h2 dc-zahl" style={{ minWidth: 28, textAlign: 'center' }} data-dc-zaehler-wert>{jetzt}</span>
              <button type="button" className="dc-knopf dc-knopf-leise" style={{ padding: '4px 10px' }} onClick={() => zaehleJetzt(name, 1)} aria-label={`${name}: eins mehr`} data-dc-zaehler-plus><Plus size={14} /></button>
            </span>
          </div>
        )
      })}
    </div>
  )
}
