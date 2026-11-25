// „Heute“: Startseite des Brain Trainers — Tages-Training (5 Übungen aus 5 Gebieten),
// Serie, Wochenziel, Brain-Index und die wichtigste Einsicht. Soll Lust machen, täglich kurz zu üben.
import { useMemo, useState } from 'react'
import { ArrowRight, BarChart3, BrainCircuit, Check, Flame, Play, Sparkles, Swords, Target } from 'lucide-react'
import type { KatalogEintrag } from '../kern/typen'
import { gebietName, tagVon } from '../kern/typen'
import type { Bereich } from '../BrainTrainer'
import { KATALOG, uebung } from '../kern/katalog'
import { useBrain } from '../kern/speicher'
import { einsichten, serie, tagesPlan, woche } from '../kern/fortschritt'
import { brainIndex, profil } from '../kern/wertung'
import { GebietSymbol } from '../Symbole'
import UebungSpielen from '../ablauf/UebungSpielen'

const gruss = (): string => { const h = new Date().getHours(); return h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend' }
const vorname = (name: string): string => {
  // „Nachname, Vorname“ (aus dem Verzeichnis) oder „Vorname Nachname“
  const n = name.includes(',') ? name.split(',')[1].trim() : name.trim()
  return n.split(/\s+/)[0] || name
}

export default function Heute({ name, onBereich, onUebung }: { name: string; onBereich: (b: Bereich) => void; onUebung: (u: KatalogEintrag) => void }) {
  const daten = useBrain(s => s.daten)
  const markiere = useBrain(s => s.markiereTagesTraining)
  const [laeuft, setLaeuft] = useState<number | null>(null)
  const [geradeFertig, setGeradeFertig] = useState(false)

  const heute = tagVon()
  // Plan nur aus den Läufen VOR heute bilden → er bleibt den ganzen Tag gleich, auch während man ihn abarbeitet
  const plan = useMemo(() => {
    const bisGestern = { benutzer: daten.benutzer, laeufe: daten.laeufe.filter(l => tagVon(new Date(l.t)) < heute) }
    return tagesPlan(bisGestern, KATALOG).map(p => ({ ...p, eintrag: uebung(p.id) as KatalogEintrag })).filter(p => p.eintrag)
  }, [daten.benutzer, daten.laeufe, heute])
  const erledigt = useMemo(() => {
    const heuteGemacht = new Set(daten.laeufe.filter(l => l.q === 'heute' && tagVon(new Date(l.t)) === heute).map(l => l.u))
    return plan.map(p => heuteGemacht.has(p.id))
  }, [daten.laeufe, plan, heute])
  const anzahlErledigt = erledigt.filter(Boolean).length
  const alleErledigt = plan.length > 0 && anzahlErledigt === plan.length
  const naechste = erledigt.findIndex(e => !e)

  const s = useMemo(() => serie(daten.tage), [daten.tage])
  const w = useMemo(() => woche(daten), [daten])
  const stand = useMemo(() => profil(daten), [daten])
  const index = brainIndex(stand), indexVorher = brainIndex(stand, 'vorher')
  const tipps = useMemo(() => einsichten(daten), [daten])
  const heutePunkte = daten.tage[heute]?.p ?? 0

  // ── gerade im Tages-Training ──
  if (laeuft !== null && plan[laeuft]) {
    const letzte = erledigt.every((e, i) => e || i === laeuft)
    const weiter = () => {
      const offen = plan.findIndex((_, i) => i !== laeuft && !erledigt[i])
      if (offen < 0) { markiere(); setGeradeFertig(true); setLaeuft(null) } else setLaeuft(offen)
    }
    return (
      <UebungSpielen key={plan[laeuft].id} eintrag={plan[laeuft].eintrag} quelle="heute"
        schritt={`Tages-Training · Übung ${Math.min(anzahlErledigt + 1, plan.length)} von ${plan.length}`}
        onZurueck={() => setLaeuft(null)} onWeiter={weiter} weiterText={letzte ? 'Tages-Training abschließen' : 'Nächste Übung'} />
    )
  }

  return (
    <div className="bt-breite" data-bt-bereich="heute">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="bt-h1">{gruss()}, {vorname(name)}</h1>
          <p className="bt-leise" style={{ margin: '4px 0 0' }}>
            {alleErledigt ? 'Tages-Training geschafft — stark. Morgen wartet ein neues.' : s.heuteGeuebt ? 'Schön, dass du da bist. Dein Tages-Training wartet noch.' : s.aktuell > 0 ? `Du bist seit ${s.aktuell} ${s.aktuell === 1 ? 'Tag' : 'Tagen'} dabei — halte die Serie.` : 'Acht Minuten für deinen Kopf: fünf kurze Übungen aus fünf Gebieten.'}
          </p>
        </div>
      </div>

      <div className="bt-raster bt-heute-raster">
        {/* ── Tages-Training ── */}
        <section className="bt-karte" style={{ padding: 22 }} data-bt-tagestraining>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <span className="bt-symbol"><Target size={18} /></span>
            <div style={{ flex: 1 }}>
              <h2 className="bt-h2">Tages-Training</h2>
              <div className="bt-klein bt-leise">{plan.length} Übungen · etwa 8 Minuten · jeden Tag neu zusammengestellt</div>
            </div>
            <span className={`bt-chip bt-zahl ${alleErledigt ? 'bt-chip-gut' : ''}`}>{anzahlErledigt} / {plan.length}</span>
          </div>
          <div className="bt-balken" style={{ margin: '12px 0 14px' }}><i style={{ width: `${plan.length ? (anzahlErledigt / plan.length) * 100 : 0}%`, background: alleErledigt ? 'var(--bt-gut)' : undefined }} /></div>

          <ol className="bt-plan">
            {plan.map((p, i) => (
              <li key={p.id} data-erledigt={erledigt[i] ? '' : undefined} data-naechste={i === naechste ? '' : undefined}>
                <span className="bt-plan-nr">{erledigt[i] ? <Check size={14} /> : i + 1}</span>
                <span className="bt-symbol" style={{ width: 32, height: 32 }}><GebietSymbol gebiet={p.gebiet} size={15} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="bt-h3" style={{ display: 'block' }}>{p.eintrag.name}</span>
                  <span className="bt-klein bt-leise">{gebietName(p.gebiet)} · {p.grund}</span>
                </span>
                {!erledigt[i] && <button type="button" className={`bt-knopf ${i === naechste ? '' : 'bt-knopf-leise'}`} style={{ padding: '6px 12px' }} onClick={() => setLaeuft(i)} data-bt-plan-start={i}>{i === naechste ? <><Play size={14} />Los</> : 'Starten'}</button>}
              </li>
            ))}
          </ol>

          {alleErledigt ? (
            <div className="bt-hinweis" style={{ marginTop: 14, background: 'var(--bt-gut-weich)' }} data-bt-tag-geschafft>
              <Sparkles size={16} style={{ flex: 'none', marginTop: 2, color: 'var(--bt-gut)' }} />
              <span><b>{geradeFertig ? 'Geschafft!' : 'Für heute erledigt.'}</b> {heutePunkte} Brain-Punkte heute{s.aktuell > 1 ? ` · Serie: ${s.aktuell} Tage` : ''}. Lust auf mehr? Unter „Training“ findest du alle Übungen.</span>
            </div>
          ) : naechste >= 0 && (
            <button type="button" className="bt-knopf bt-knopf-gross" style={{ marginTop: 16, width: '100%' }} onClick={() => setLaeuft(naechste)} data-bt-heute-start>
              <Play size={17} />{anzahlErledigt === 0 ? 'Tages-Training starten' : 'Weitermachen'}
            </button>
          )}
        </section>

        {/* ── rechte Spalte ── */}
        <div className="bt-raster">
          <section className="bt-karte" data-bt-serie-karte>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="bt-symbol" style={{ background: s.aktuell > 0 ? 'var(--bt-akzent2-weich)' : undefined, color: s.aktuell > 0 ? 'var(--bt-akzent2)' : undefined }}><Flame size={18} /></span>
              <div style={{ flex: 1 }}>
                <div className="bt-label">Serie</div>
                <div className="bt-zahl" style={{ fontSize: 30, lineHeight: 1.1 }}>{s.aktuell} <span className="bt-leise" style={{ fontSize: 14, fontWeight: 500 }}>{s.aktuell === 1 ? 'Tag' : 'Tage'} in Folge</span></div>
              </div>
              {s.laengste > s.aktuell && <span className="bt-klein bt-stumm">längste: {s.laengste}</span>}
            </div>
            <div className="bt-woche" aria-label={`Diese Woche an ${w.geuebt} von ${w.ziel} Zieltagen geübt`}>
              {w.tage.map(t => (
                <div key={t.tag} data-geuebt={t.geuebt ? '' : undefined} data-heute={t.heute ? '' : undefined} data-zukunft={t.zukunft ? '' : undefined}>
                  <i>{t.geuebt && <Check size={13} />}</i><span>{t.kurz}</span>
                </div>
              ))}
            </div>
            <div className="bt-klein bt-leise" style={{ marginTop: 10 }}>
              Wochenziel: {w.geuebt} von {w.ziel} Tagen{w.erreicht ? ' — erreicht' : ''}
            </div>
          </section>

          <section className="bt-karte">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="bt-symbol"><BarChart3 size={18} /></span>
              <div style={{ flex: 1 }}>
                <div className="bt-label">Brain-Index</div>
                <div className="bt-zahl" style={{ fontSize: 30, lineHeight: 1.1 }}>
                  {index ?? '–'} <span className="bt-leise" style={{ fontSize: 14, fontWeight: 500 }}>von 1000</span>
                </div>
              </div>
              {index !== null && indexVorher !== null && index !== indexVorher && (
                <span className={`bt-chip bt-zahl ${index > indexVorher ? 'bt-chip-gut' : ''}`}>{index > indexVorher ? '+' : '−'}{Math.abs(index - indexVorher)} in 30 Tagen</span>
              )}
            </div>
            {tipps.slice(0, 2).map((t, i) => (
              <div key={i} className="bt-klein" style={{ marginTop: 10 }}>
                <b>{t.titel}.</b> <span className="bt-leise">{t.text}</span>
              </div>
            ))}
            <button type="button" className="bt-knopf bt-knopf-nackt" style={{ marginTop: 8, marginLeft: -10 }} onClick={() => onBereich('fortschritt')}>Zum Fortschritt<ArrowRight size={14} /></button>
          </section>

          <section className="bt-raster" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" className="bt-karte bt-karte-klick" onClick={() => onBereich('iq')} data-bt-zu-iq>
              <BrainCircuit size={20} style={{ color: 'var(--bt-akzent-stark)' }} />
              <div className="bt-h3" style={{ marginTop: 8 }}>IQ-Test</div>
              <div className="bt-klein bt-leise">10, 20 oder 30 Fragen auf Zeit</div>
            </button>
            <button type="button" className="bt-karte bt-karte-klick" onClick={() => onBereich('duelle')} data-bt-zu-duell>
              <Swords size={20} style={{ color: 'var(--bt-akzent2)' }} />
              <div className="bt-h3" style={{ marginTop: 8 }}>Duell</div>
              <div className="bt-klein bt-leise">Kollegen herausfordern</div>
            </button>
          </section>
        </div>
      </div>

      {/* schneller Einstieg: eine Übung aus dem Gebiet mit dem größten Potenzial */}
      {tipps.find(t => t.art === 'tipp' && t.gebiet) && (() => {
        const t = tipps.find(x => x.art === 'tipp' && x.gebiet) as { gebiet: NonNullable<KatalogEintrag['gebiet']>; titel: string }
        const vorschlag = KATALOG.filter(u => u.gebiet === t.gebiet && !u.lang)[0]
        if (!vorschlag) return null
        return (
          <button type="button" className="bt-karte bt-karte-klick" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 14 }} onClick={() => onUebung(vorschlag)} data-bt-vorschlag>
            <span className="bt-symbol"><GebietSymbol gebiet={t.gebiet} /></span>
            <span style={{ flex: 1 }}><span className="bt-h3" style={{ display: 'block' }}>Tipp: {vorschlag.name}</span><span className="bt-klein bt-leise">{t.titel}</span></span>
            <ArrowRight size={16} className="bt-leise" />
          </button>
        )
      })()}
    </div>
  )
}
