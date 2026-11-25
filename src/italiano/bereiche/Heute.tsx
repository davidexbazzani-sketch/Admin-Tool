// Parla Italiano — „Heute“: was jetzt dran ist, und wo man auf der Reise steht.
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Award, BookOpen, CalendarClock, CheckCircle2, Flame, Layers, MapPin, PartyPopper, Sparkles, Timer, Wrench } from 'lucide-react'
import type { TagInhalt } from '../kern/inhaltTypen'
import { LEVEL_ANZAHL, TAGE_JE_LEVEL, ersterTag } from '../kern/inhaltTypen'
import { gibtEsLevel, ladeTag } from '../kern/inhalt'
import { useItaliano } from '../kern/speicher'
import { kursFortschritt, type TagesStand } from '../kern/stand'
import { serie } from '../kern/serie'
import { kastenStand } from '../kern/kasten'
import { datumText, heute, plusTage, tagNummer, wochentag } from '../kern/zeit'
import { LERNTAG_AB } from '../kern/serie'
import { ABZEICHEN } from '../kern/abzeichen'
import { abschnittVon, station, AM_ZIEL } from '../kern/lehrplan'
import type { Bereich, Programm } from '../ParlaItaliano'
import { Sterne, Stationsbild } from '../ablauf/gemeinsam'

const gruss = (): string => { const h = new Date().getHours(); return h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera' }

export default function Heute({ name, stand, onProgramm, onBereich }: { name: string; stand: TagesStand; onProgramm: (p: Programm) => void; onBereich: (b: Bereich) => void }) {
  const daten = useItaliano(s => s.daten)
  const jokerEingesetzt = useItaliano(s => s.jokerEingesetzt)
  const s = useMemo(() => serie(daten, heute()), [daten])
  const kasten = useMemo(() => kastenStand(daten.kasten, tagNummer(heute())), [daten.kasten])
  const amZiel = stand.level >= AM_ZIEL
  const level = Math.min(stand.level, LEVEL_ANZAHL)
  const ort = station(level)
  const [dran, setDran] = useState<TagInhalt | null>(null)      // die Lektion, die als Nächste kommt
  const [zuletzt, setZuletzt] = useState<TagInhalt | null>(null) // die zuletzt abgeschlossene (für „Was bisher geschah“)
  const [heldFehlt, setHeldFehlt] = useState(false)

  useEffect(() => {
    let lebt = true
    void ladeTag(stand.naechsterTag ?? 0).then(t => { if (lebt) setDran(t) })
    void ladeTag(daten.lektionen).then(t => { if (lebt) setZuletzt(t) })
    return () => { lebt = false }
  }, [stand.naechsterTag, daten.lektionen])

  const inhaltFehlt = !amZiel && stand.lektion === 'frei' && !!stand.naechsterTag && !gibtEsLevel(Math.ceil(stand.naechsterTag / TAGE_JE_LEVEL))
  const vorname = name.split(/[\s,]+/).filter(Boolean)[0] ?? name
  const sterneHeute = stand.heutigerTag ? daten.sterne[stand.heutigerTag] : undefined
  // diese Woche (Montag bis heute)
  const woche = useMemo(() => {
    const h = heute(), montag = plusTage(h, -((wochentag(h) + 6) % 7))
    let tage = 0, sekunden = 0
    for (let i = 0; i < 7; i++) { const t = daten.tage[plusTage(montag, i)]; if (t && t[0] >= LERNTAG_AB) { tage++; sekunden += t[2] } }
    return { tage, minuten: Math.round(sekunden / 60) }
  }, [daten.tage])
  const abzeichen = Object.keys(daten.abzeichen).length
  const naechste = !amZiel && level < LEVEL_ANZAHL ? station(level + 1) : null
  const nochTage = TAGE_JE_LEVEL - stand.tagImLevel

  return (
    <div className="pi-breite pi-spalte" data-pi-heute data-pi-lektion={stand.lektion}>
      {/* Auftakt */}
      <div className="pi-held pi-ein">
        {!heldFehlt && <img src="./italiano/bilder/reise.webp" alt="" onError={() => setHeldFehlt(true)} />}
        <div className="pi-held-text">
          <div className="pi-ober" style={{ color: '#FFD9A8' }} lang="it">{gruss()}, {vorname}!</div>
          <h1 className="pi-h1" style={{ margin: '4px 0 6px' }}>{amZiel ? 'Du bist am Ziel der Reise' : `${ort.ort} · Level ${level}`}</h1>
          <p className="pi-leise">{amZiel ? 'Alle 24 Stationen geschafft. Halte dein Italienisch mit Training und Tests frisch.' : `${abschnittVon(level).name} (${abschnittVon(level).cefr}) · ${ort.thema}`}</p>
        </div>
      </div>

      {jokerEingesetzt.length > 0 && (
        <div className="pi-karte-flach pi-reihe pi-ein" data-pi-joker><Sparkles size={16} style={{ color: 'var(--pi-gold)' }} /><span>Ein Joker hat deine Serie gerettet ({jokerEingesetzt.map(datumText).join(', ')}).</span></div>
      )}

      <div className="pi-raster pi-raster-2">
        {/* Was heute dran ist */}
        <div className="pi-karte pi-spalte" data-pi-heute-karte>
          {stand.pruefungOffen ? (
            <>
              <div className="pi-reihe"><span className="pi-symbol pi-symbol-gold"><Award size={18} /></span><div><div className="pi-ober" lang="it">L'esame</div><h2 className="pi-h2">Die Prüfung in {station(stand.pruefungOffen).ort}</h2></div></div>
              <p className="pi-leise">Alle fünf Lerntage sind geschafft. Besteh die Prüfung, steig auf Level {stand.pruefungOffen + 1 > LEVEL_ANZAHL ? 'B1' : stand.pruefungOffen + 1} auf und hol dir die Rezeptseite.</p>
              {stand.testOffen && stand.heutigerTag && stand.testStoff && <button type="button" className="pi-knopf pi-knopf-leise" onClick={() => onProgramm({ art: 'test', tag: stand.heutigerTag!, stoff: stand.testStoff! })} data-pi-start-test><Timer size={16} />Erst der Tagestest (5 Min.)</button>}
              <button type="button" className="pi-knopf pi-knopf-gross" onClick={() => onProgramm({ art: 'esame', level: stand.pruefungOffen! })} data-pi-start-esame>Zur Prüfung<ArrowRight size={18} /></button>
            </>
          ) : stand.lektion === 'frei' && stand.naechsterTag ? (
            inhaltFehlt ? (
              <>
                <div className="pi-reihe"><span className="pi-symbol"><Wrench size={18} /></span><div><div className="pi-ober">Bald</div><h2 className="pi-h2">{ort.ort} wird noch vorbereitet</h2></div></div>
                <p className="pi-leise">Die Lektionen für diese Station kommen mit einer der nächsten Versionen. Bis dahin hält dich das freie Training fit.</p>
                <button type="button" className="pi-knopf" onClick={() => onBereich('training')}>Zum Training</button>
              </>
            ) : (
              <>
                <div className="pi-reihe"><span className="pi-symbol"><BookOpen size={18} /></span><div><div className="pi-ober">Heute · Lerntag {stand.naechsterTag}</div><h2 className="pi-h2">{dran?.titel ?? 'Die nächste Lektion'}</h2></div></div>
                <p className="pi-leise">{dran?.ziel ?? ' '}</p>
                <div className="pi-reihe pi-klein pi-stumm"><span className="pi-chip">Lektion · 10 Min.</span><span>+</span><span className="pi-chip">Tagestest · 5 Min.</span></div>
                <button type="button" className="pi-knopf pi-knopf-gross" onClick={() => onProgramm({ art: 'lektion', tag: stand.naechsterTag! })} data-pi-start-lektion>{daten.lektionen === 0 ? 'Los geht’s' : 'Lektion starten'}<ArrowRight size={18} /></button>
                {/* Vorgeschmack: ein paar der neuen Wörter, das Grammatik-Thema und der Dialog */}
                {dran && (
                  <div className="pi-spalte" style={{ gap: 8, marginTop: 'auto', paddingTop: 6 }} data-pi-vorschau>
                    <div className="pi-ober">Heute dabei</div>
                    <div className="pi-reihe" style={{ gap: 6 }}>
                      {dran.woerter.slice(0, 6).map(w => <span key={w.it} className="pi-chip" lang="it" title={w.de} style={{ fontFamily: 'var(--pi-zier)', fontSize: 13, color: 'var(--pi-text)' }}>{w.emoji ? `${w.emoji} ` : ''}{w.it}</span>)}
                      <span className="pi-klein pi-stumm">+ {dran.woerter.length - 6} weitere</span>
                    </div>
                    <div className="pi-klein pi-leise">Grammatik: {dran.grammatik.titel} · Dialog: <span lang="it">«{dran.dialog.titel}»</span></div>
                  </div>
                )}
              </>
            )
          ) : stand.testOffen && stand.heutigerTag && stand.testStoff ? (
            <>
              <div className="pi-reihe"><span className="pi-symbol pi-symbol-blau"><Timer size={18} /></span><div><div className="pi-ober">Noch offen</div><h2 className="pi-h2">Der Tagestest</h2></div></div>
              <p className="pi-leise">Die Lektion von heute ist geschafft. Fünf Minuten Test festigen, was du zuletzt gelernt hast.</p>
              <button type="button" className="pi-knopf pi-knopf-gross" onClick={() => onProgramm({ art: 'test', tag: stand.heutigerTag!, stoff: stand.testStoff! })} data-pi-start-test>Test starten<ArrowRight size={18} /></button>
            </>
          ) : amZiel ? (
            <>
              <div className="pi-reihe"><span className="pi-symbol pi-symbol-gold"><PartyPopper size={18} /></span><div><div className="pi-ober" lang="it">Complimenti!</div><h2 className="pi-h2">Die Reise ist geschafft</h2></div></div>
              <p className="pi-leise">Du hast alle Lektionen und Prüfungen bestanden. Im Training bleiben deine Wörter frisch – {kasten.faellig} warten gerade auf eine Wiederholung.</p>
              <button type="button" className="pi-knopf" onClick={() => onBereich('training')}>Zum Training</button>
            </>
          ) : (
            <>
              <div className="pi-reihe"><span className="pi-symbol pi-symbol-gruen"><CheckCircle2 size={18} /></span><div><div className="pi-ober">Für heute geschafft</div><h2 className="pi-h2">A domani – bis morgen!</h2></div></div>
              <div className="pi-reihe">{sterneHeute !== undefined && <><span className="pi-leise">Tagestest:</span><Sterne n={sterneHeute} /></>}</div>
              <div className="pi-karte-flach pi-reihe" style={{ flexWrap: 'nowrap' }}>
                <CalendarClock size={18} style={{ color: 'var(--pi-gold)', flexShrink: 0 }} />
                <div><div className="pi-h3">Morgen: {dran?.titel ?? 'die nächste Lektion'}</div><div className="pi-leise pi-klein">{dran?.ziel ?? ''}</div></div>
              </div>
              <p className="pi-klein pi-stumm">Pro Tag gibt es eine neue Lektion – so bleibt Zeit, dass sich das Gelernte setzt.</p>
              {/* Bonusrunde: wer noch Lust hat, übt frei weiter */}
              <div className="pi-spalte" style={{ gap: 8, marginTop: 'auto', paddingTop: 6 }} data-pi-bonus>
                <div className="pi-ober">Noch Lust? Bonusrunde</div>
                <p className="pi-leise pi-klein">{kasten.faellig > 0 ? `${kasten.faellig} ${kasten.faellig === 1 ? 'Karte wartet' : 'Karten warten'} auf eine Wiederholung. ` : ''}Karteikarten, Tempo-Runde oder Gespräch – jede Runde bringt Punkte und hält die Wörter frisch.</p>
                <div><button type="button" className="pi-knopf pi-knopf-leise" onClick={() => onBereich('training')} data-pi-zum-training>Zum Training<ArrowRight size={16} /></button></div>
              </div>
            </>
          )}
        </div>

        {/* Stand im Level */}
        <div className="pi-karte pi-spalte">
          <Stationsbild level={level} kinder={<span className="pi-chip pi-chip-gold"><MapPin size={11} />{ort.region}</span>} />
          <div>
            <div className="pi-reihe" style={{ justifyContent: 'space-between' }}>
              <h3 className="pi-h3">Reisepass · {ort.ort}</h3>
              <span className="pi-klein pi-stumm pi-zahl">{amZiel ? 'vollständig' : `${stand.tagImLevel} von ${TAGE_JE_LEVEL} Lerntagen`}</span>
            </div>
            <div className="pi-reihe" style={{ marginTop: 10, gap: 8 }} data-pi-stempel>
              {Array.from({ length: TAGE_JE_LEVEL }, (_, i) => {
                const tag = ersterTag(level) + i
                const da = !!daten.lektionAm[tag] || amZiel || tag <= daten.lektionen
                return <span key={tag} className="pi-stempel" data-da={da ? '1' : undefined} data-heute={!da && tag === stand.naechsterTag ? '1' : undefined} title={da ? `Lerntag ${tag} geschafft${daten.lektionAm[tag] ? ' am ' + datumText(daten.lektionAm[tag]) : ''}` : `Lerntag ${tag}`}><span>Tag</span><span style={{ fontSize: 14 }}>{tag}</span></span>
              })}
              <span className="pi-stempel" data-da={stand.level > level ? '1' : undefined} data-heute={stand.pruefungOffen === level ? '1' : undefined} title="Die Prüfung" style={{ borderRadius: 12 }}><Award size={18} /></span>
            </div>
          </div>
          <div>
            <div className="pi-reihe pi-klein" style={{ justifyContent: 'space-between', marginBottom: 4 }}><span className="pi-leise">Die ganze Reise</span><span className="pi-stumm pi-zahl">{kursFortschritt(daten)} %</span></div>
            <div className="pi-balken"><i style={{ width: `${kursFortschritt(daten)}%` }} /></div>
          </div>
        </div>
      </div>

      {/* Zahlen */}
      <div className="pi-raster pi-raster-3">
        <div className="pi-karte pi-reihe" style={{ flexWrap: 'nowrap' }}>
          <span className="pi-symbol pi-symbol-gold"><Flame size={18} /></span>
          <div><div className="pi-h2 pi-zahl">{s.aktuell} {s.aktuell === 1 ? 'Tag' : 'Tage'}</div><div className="pi-leise pi-klein">in Folge{s.laengste > s.aktuell ? ` · Bestwert ${s.laengste}` : ''}{daten.joker ? ` · ${daten.joker} Joker` : ''}{woche.tage ? ` · diese Woche ${woche.tage} ${woche.tage === 1 ? 'Lerntag' : 'Lerntage'}, ${woche.minuten} min` : ''}</div></div>
        </div>
        <div className="pi-karte pi-reihe" style={{ flexWrap: 'nowrap' }}>
          <span className="pi-symbol pi-symbol-gruen"><BookOpen size={18} /></span>
          <div><div className="pi-h2 pi-zahl">{kasten.gelernt} Wörter</div><div className="pi-leise pi-klein">gelernt · {kasten.sicher} sitzen sicher</div></div>
        </div>
        <button type="button" className="pi-karte pi-reihe" style={{ flexWrap: 'nowrap', textAlign: 'left' }} onClick={() => onBereich('training')} data-pi-faellig={kasten.faellig}>
          <span className="pi-symbol pi-symbol-blau"><Layers size={18} /></span>
          <div><div className="pi-h2 pi-zahl">{kasten.faellig} {kasten.faellig === 1 ? 'Karte' : 'Karten'}</div><div className="pi-leise pi-klein">zur Wiederholung fällig</div></div>
        </button>
      </div>

      <div className="pi-raster pi-raster-2">
        {/* Geschichte */}
        {zuletzt && (
          <div className="pi-karte pi-spalte" style={{ gap: 6 }} data-pi-geschichte>
            <div className="pi-ober">Il quaderno di Nonna Rosa · was bisher geschah</div>
            <p style={{ fontSize: 15 }}>{zuletzt.dialog.folge}</p>
            <p className="pi-klein pi-stumm">Folge {zuletzt.tag} von 120 · «{zuletzt.dialog.titel}»</p>
            <div style={{ marginTop: 'auto' }}><button type="button" className="pi-chip pi-chip-gold" onClick={() => onBereich('fortschritt')} data-pi-abzeichen-zahl={abzeichen}>🏅 {abzeichen} von {ABZEICHEN.length} Abzeichen</button></div>
          </div>
        )}
        {/* Vorfreude: die nächste Station */}
        {naechste && (
          <div className="pi-karte pi-reihe" style={{ flexWrap: 'nowrap', alignItems: 'stretch', gap: 14 }} data-pi-naechste-station={naechste.level}>
            <div style={{ width: 150, flexShrink: 0 }}><Stationsbild level={naechste.level} zu klein /></div>
            <div className="pi-spalte" style={{ gap: 4, justifyContent: 'center' }}>
              <div className="pi-ober">Als Nächstes</div>
              <div className="pi-h2">{naechste.ort}</div>
              <div className="pi-leise pi-klein">{naechste.thema}</div>
              <div className="pi-klein pi-stumm">{stand.pruefungOffen ? 'Nur noch die Prüfung – dann öffnet sich die Station.' : nochTage > 0 ? `Noch ${nochTage} ${nochTage === 1 ? 'Lerntag' : 'Lerntage'} und die Prüfung in ${ort.ort}.` : ''}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
