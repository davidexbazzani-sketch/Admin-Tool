// Parla Italiano — die Reise: Karte, Stationen mit Postkarten, Reisepass und das Rezeptbuch.
import { useEffect, useMemo, useState } from 'react'
import { Award, BookOpen, Check, Lock, MapPin, MessageCircle, ScrollText, X } from 'lucide-react'
import type { LevelInhalt, TagInhalt } from '../kern/inhaltTypen'
import { LEVEL_ANZAHL, TAGE_JE_LEVEL, ersterTag } from '../kern/inhaltTypen'
import { gibtEsLevel, ladeLevel } from '../kern/inhalt'
import { useItaliano } from '../kern/speicher'
import { ABSCHNITTE, KARTE, REZEPT_TITEL, STATIONEN, UMRISS, aufKarte, station, AM_ZIEL } from '../kern/lehrplan'
import { datumText } from '../kern/zeit'
import type { Programm } from '../ParlaItaliano'
import { Laedt, Sterne, Stationsbild } from '../ablauf/gemeinsam'
import { DialogInhalt, GrammatikInhalt } from '../uebungen/teile'

type Zustand = 'fertig' | 'hier' | 'zu'
const zustandVon = (level: number, mein: number): Zustand => (level < mein ? 'fertig' : level === mein ? 'hier' : 'zu')

function Karte({ mein, gewaehlt, onWahl }: { mein: number; gewaehlt: number; onWahl: (l: number) => void }) {
  const punkte = STATIONEN.map(s => ({ s, p: aufKarte(s.lon, s.lat) }))
  const linie = (bis: number) => punkte.slice(0, bis).map(({ p }, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')
  return (
    <svg className="pi-karte-it" viewBox={`0 0 ${KARTE.breite} ${KARTE.hoehe}`} role="img" aria-label="Italien mit der Reiseroute von Turin nach Cagliari" style={{ width: '100%', maxHeight: 470 }} data-pi-landkarte>
      {UMRISS.map((d, i) => <path key={i} className="land" d={d} />)}
      <path className="weg" d={linie(punkte.length)} />
      {mein > 1 && <path className="weg-fertig" d={linie(Math.min(mein, punkte.length))} />}
      {punkte.map(({ s, p }) => {
        const z = zustandVon(s.level, mein)
        const hier = z === 'hier' || s.level === gewaehlt
        return (
          <g key={s.level} onClick={() => onWahl(s.level)} style={{ cursor: 'pointer' }} data-pi-ort={s.level}>
            <title>{`${s.level} · ${s.ort}`}</title>
            <circle cx={p[0]} cy={p[1]} r={12} fill="transparent" />
            <circle className={z === 'fertig' ? 'ort-fertig' : z === 'hier' ? 'ort-hier' : 'ort'} cx={p[0]} cy={p[1]} r={z === 'hier' ? 6 : s.level === gewaehlt ? 5.5 : 4} />
            {hier && <text className={z === 'hier' ? 'hier' : undefined} x={p[0] + (p[0] > KARTE.breite * 0.7 ? -9 : 9)} y={p[1] + 3.5} textAnchor={p[0] > KARTE.breite * 0.7 ? 'end' : 'start'}>{s.ort}</text>}
          </g>
        )
      })}
    </svg>
  )
}

export default function Reise({ onProgramm }: { onProgramm: (p: Programm) => void }) {
  const daten = useItaliano(s => s.daten)
  const mein = daten.level
  const [gewaehlt, setGewaehlt] = useState(Math.min(mein, LEVEL_ANZAHL))
  const [inhalt, setInhalt] = useState<LevelInhalt | null>(null)
  const [nachlesen, setNachlesen] = useState<{ tag: TagInhalt; was: 'dialog' | 'grammatik' } | null>(null)
  const s = station(gewaehlt)
  const z = zustandVon(gewaehlt, mein)

  useEffect(() => {
    let lebt = true
    setInhalt(null)
    if (z !== 'zu') void ladeLevel(gewaehlt).then(l => { if (lebt) setInhalt(l) })
    return () => { lebt = false }
  }, [gewaehlt, z])

  const seiten = Math.min(LEVEL_ANZAHL, mein - 1)
  const pruefung = useMemo(() => [...daten.pruefungen].reverse().find(p => p.level === gewaehlt && p.ok), [daten.pruefungen, gewaehlt])

  return (
    <div className="pi-breite pi-spalte" data-pi-reise>
      <div><h1 className="pi-h1">Die Reise</h1><p className="pi-leise">24 Stationen von Turin bis Cagliari. Jede bestandene Prüfung bringt eine Postkarte und eine Seite aus Nonna Rosas Rezeptheft.</p></div>

      <div className="pi-raster" style={{ gridTemplateColumns: 'minmax(260px, 360px) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="pi-karte"><Karte mein={mein} gewaehlt={gewaehlt} onWahl={setGewaehlt} /></div>

        {/* gewählte Station */}
        <div className="pi-karte pi-spalte" data-pi-station={gewaehlt} data-pi-zustand={z}>
          <Stationsbild level={gewaehlt} zu={z === 'zu'} kinder={<span className={`pi-chip ${z === 'fertig' ? 'pi-chip-gruen' : z === 'hier' ? 'pi-chip-gold' : ''}`}>{z === 'fertig' ? <><Check size={12} />geschafft</> : z === 'hier' ? <><MapPin size={12} />du bist hier</> : <><Lock size={12} />noch nicht erreicht</>}</span>} />
          <div>
            <div className="pi-ober">Level {gewaehlt} · {ABSCHNITTE[s.abschnitt - 1].name} ({ABSCHNITTE[s.abschnitt - 1].cefr})</div>
            <h2 className="pi-h2">{s.ort} <span className="pi-leise" style={{ fontSize: 14, fontFamily: 'var(--pi-schrift)', fontWeight: 400 }}>· {s.region}</span></h2>
            <p className="pi-leise">{s.thema}</p>
          </div>
          {z === 'zu' ? <p className="pi-karte-flach pi-leise">{gibtEsLevel(gewaehlt) ? 'Diese Station öffnet sich, sobald du die Prüfungen davor bestanden hast.' : 'Diese Station wird noch vorbereitet.'}</p>
            : !inhalt ? <Laedt />
            : (
              <div className="pi-spalte" style={{ gap: 0 }}>
                {inhalt.tage.map((t, i) => {
                  const gemacht = !!daten.lektionAm[t.tag] || t.tag <= daten.lektionen
                  return (
                    <div key={t.tag} className="pi-zeile" style={i ? undefined : { borderTop: 0 }} data-pi-reisetag={t.tag}>
                      <span className="pi-stempel" data-da={gemacht ? '1' : undefined} style={{ width: 38, height: 38 }}><span style={{ fontSize: 13 }}>{t.tag}</span></span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ display: 'block' }}>{t.titel}</b>
                        <span className="pi-leise pi-klein">{t.grammatik.titel}{daten.lektionAm[t.tag] ? ` · ${datumText(daten.lektionAm[t.tag])}` : ''}</span>
                      </span>
                      {daten.sterne[t.tag] !== undefined && <Sterne n={daten.sterne[t.tag]} />}
                      {gemacht && (
                        <span className="pi-reihe" style={{ gap: 2 }}>
                          <button type="button" className="pi-knopf pi-knopf-nackt" style={{ padding: 6 }} title="Dialog noch einmal ansehen" aria-label="Dialog noch einmal ansehen" onClick={() => setNachlesen({ tag: t, was: 'dialog' })} data-pi-nachlesen="dialog"><MessageCircle size={16} /></button>
                          <button type="button" className="pi-knopf pi-knopf-nackt" style={{ padding: 6 }} title="Grammatik nachlesen" aria-label="Grammatik nachlesen" onClick={() => setNachlesen({ tag: t, was: 'grammatik' })} data-pi-nachlesen="grammatik"><BookOpen size={16} /></button>
                        </span>
                      )}
                    </div>
                  )
                })}
                <div className="pi-zeile">
                  <span className="pi-stempel" data-da={z === 'fertig' ? '1' : undefined} style={{ width: 38, height: 38, borderRadius: 11 }}><Award size={16} /></span>
                  <span style={{ flex: 1 }}><b style={{ display: 'block' }}>Die Prüfung</b><span className="pi-leise pi-klein">{pruefung ? `bestanden am ${datumText(pruefung.am.slice(0, 10))} mit ${pruefung.r} von ${pruefung.n}` : z === 'fertig' ? 'bestanden' : 'nach dem fünften Lerntag'}</span></span>
                  {z === 'hier' && daten.lektionen >= ersterTag(gewaehlt) + TAGE_JE_LEVEL - 1 && <button type="button" className="pi-knopf" onClick={() => onProgramm({ art: 'esame', level: gewaehlt })}>Zur Prüfung</button>}
                </div>
              </div>
            )}
        </div>
      </div>

      {/* Postkarten-Album */}
      <div className="pi-karte pi-spalte">
        <div className="pi-reihe" style={{ justifyContent: 'space-between' }}><h2 className="pi-h2">Postkarten-Album</h2><span className="pi-chip pi-zahl">{Math.min(LEVEL_ANZAHL, mein - 1)} von {LEVEL_ANZAHL}</span></div>
        <div className="pi-raster" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }} data-pi-album>
          {STATIONEN.map(st => {
            const zz = zustandVon(st.level, mein)
            return (
              <button key={st.level} type="button" onClick={() => setGewaehlt(st.level)} style={{ outline: st.level === gewaehlt ? '2px solid var(--pi-akzent)' : undefined, outlineOffset: 2, borderRadius: 14 }} aria-label={`Level ${st.level}, ${st.ort}`} data-pi-postkarte={st.level} data-pi-zustand={zz}>
                <Stationsbild level={st.level} zu={zz === 'zu'} klein kinder={<span style={{ fontSize: 11 }}>{st.level}</span>} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Rezeptbuch */}
      <div className="pi-karte pi-spalte" data-pi-rezeptbuch>
        <div className="pi-reihe" style={{ justifyContent: 'space-between' }}>
          <div className="pi-reihe"><span className="pi-symbol"><ScrollText size={18} /></span><div><div className="pi-ober" lang="it">Il quaderno di Nonna Rosa</div><h2 className="pi-h2 pi-it" lang="it">{REZEPT_TITEL.it}</h2></div></div>
          <span className="pi-chip pi-zahl">{seiten} von {LEVEL_ANZAHL} Seiten</span>
        </div>
        {seiten === 0 ? <p className="pi-leise">Noch fehlen alle Seiten. Die erste bekommst du mit der Prüfung in Turin.</p> : (
          <ol className="pi-liste" style={{ gap: 10 }}>
            {STATIONEN.slice(0, seiten).map(st => (
              <li key={st.level}><span className="pi-it" lang="it" style={{ fontWeight: 700 }}>{st.seite.it}</span><span className="pi-leise pi-klein" style={{ display: 'block' }}>{st.seite.de} · aus {st.ort}</span></li>
            ))}
          </ol>
        )}
        {seiten > 0 && seiten < LEVEL_ANZAHL && <p className="pi-klein pi-stumm">Die nächste Seite wartet in {station(Math.min(mein, LEVEL_ANZAHL)).ort}.</p>}
        {mein >= AM_ZIEL && <p className="pi-karte-flach">Das Heft ist vollständig. <span lang="it" className="pi-it">Buon appetito!</span></p>}
      </div>

      {nachlesen && (
        <div className="pi-schleier" role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) setNachlesen(null) }} data-pi-nachlesen-fenster>
          <div className="pi-karte pi-dialog pi-ein pi-spalte" style={{ width: 'min(680px, 100%)' }}>
            <div className="pi-reihe" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <div><div className="pi-ober">Lerntag {nachlesen.tag.tag} · {nachlesen.was === 'dialog' ? nachlesen.tag.dialog.ort : 'Grammatik'}</div><h2 className={`pi-h2 ${nachlesen.was === 'dialog' ? 'pi-it' : ''}`}>{nachlesen.was === 'dialog' ? nachlesen.tag.dialog.titel : nachlesen.tag.grammatik.titel}</h2></div>
              <button type="button" className="pi-knopf pi-knopf-nackt" style={{ padding: 6 }} onClick={() => setNachlesen(null)} aria-label="Schließen" autoFocus><X size={18} /></button>
            </div>
            {nachlesen.was === 'dialog'
              ? <DialogInhalt d={nachlesen.tag.dialog} tag={nachlesen.tag.tag} ton={daten.einstellungen.ton} langsam={daten.einstellungen.langsam} />
              : <GrammatikInhalt g={nachlesen.tag.grammatik} />}
          </div>
        </div>
      )}
    </div>
  )
}
