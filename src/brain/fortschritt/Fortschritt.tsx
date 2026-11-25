// Fortschritt: der motivierende Überblick — Serie, Wochenziel, Kalender, Brain-Profil, Verläufe je
// Gebiet, Bestwerte je Übung, IQ-Tests, Abzeichen, Duell-Bilanz. Alles nur für den eigenen Benutzer.
import { useMemo, useState } from 'react'
import { ArrowRight, Award, CalendarCheck, Clock, Dumbbell, Flame, Lock, Play, Swords, TrendingUp } from 'lucide-react'
import type { Gebiet, KatalogEintrag } from '../kern/typen'
import { GEBIETE, gebietName } from '../kern/typen'
import type { Bereich } from '../BrainTrainer'
import { KATALOG } from '../kern/katalog'
import { useBrain } from '../kern/speicher'
import { ABZEICHEN, bestwerte, einsichten, kalender, serie, verlaufGebiet, woche } from '../kern/fortschritt'
import { brainIndex, profil } from '../kern/wertung'
import { AbzeichenSymbol, GebietSymbol } from '../Symbole'
import { IqVerlauf, Kalender, StandBalken, Verlauf } from './diagramme'

const dauerText = (sek: number): string => (sek >= 3600 ? `${Math.floor(sek / 3600)} h ${Math.round((sek % 3600) / 60)} min` : `${Math.max(1, Math.round(sek / 60))} min`)
const tagText = (iso: string): string => new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' })

function Kachel({ titel, wert, unter, symbol, warm }: { titel: string; wert: string; unter?: string; symbol: React.ReactNode; warm?: boolean }) {
  return (
    <div className="bt-karte" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="bt-symbol" style={warm ? { background: 'var(--bt-akzent2-weich)', color: 'var(--bt-akzent2)' } : undefined}>{symbol}</span>
        <div className="bt-label">{titel}</div>
      </div>
      <div className="bt-held" style={{ fontSize: 34, marginTop: 12 }}>{wert}</div>
      {unter && <div className="bt-klein bt-leise" style={{ marginTop: 4 }}>{unter}</div>}
    </div>
  )
}

export default function Fortschritt({ onBereich, onUebung }: { onBereich: (b: Bereich) => void; onUebung: (u: KatalogEintrag) => void }) {
  const daten = useBrain(s => s.daten)
  const zustimmung = useBrain(s => s.zustimmung)
  const [gewaehlt, setGewaehlt] = useState<Gebiet | null>(null)

  const s = useMemo(() => serie(daten.tage), [daten.tage])
  const w = useMemo(() => woche(daten), [daten])
  const stand = useMemo(() => profil(daten), [daten])
  const index = brainIndex(stand), indexVorher = brainIndex(stand, 'vorher')
  const tipps = useMemo(() => einsichten(daten), [daten])
  const kal = useMemo(() => kalender(daten.tage, 16), [daten.tage])
  const beste = useMemo(() => bestwerte(daten), [daten])
  const trainingstage = Object.values(daten.tage).filter(t => t.n > 0).length
  const gesamtSek = Object.values(daten.tage).reduce((a, t) => a + (t.d || 0), 0)
  const wocheSek = w.tage.reduce((a, t) => a + (daten.tage[t.tag]?.d ?? 0), 0)
  const geuebteGebiete = stand.filter(x => x.jetzt !== null)
  const aktiv = gewaehlt ?? geuebteGebiete.slice().sort((a, b) => (b.zuletzt ?? '').localeCompare(a.zuletzt ?? ''))[0]?.gebiet ?? null
  const siege = daten.duelle.filter(d => d.ausgang === 1).length, niederlagen = daten.duelle.filter(d => d.ausgang === -1).length

  if (!daten.laeufe.length && !daten.iq.length) {
    return (
      <div className="bt-breite" data-bt-bereich="fortschritt">
        <h1 className="bt-h1" style={{ marginBottom: 18 }}>Fortschritt</h1>
        <div className="bt-karte" style={{ textAlign: 'center', padding: 44 }} data-bt-fortschritt-leer>
          <span className="bt-symbol" style={{ width: 54, height: 54, margin: '0 auto 14px' }}><TrendingUp size={24} /></span>
          <h2 className="bt-h2">Hier wächst dein Verlauf</h2>
          <p className="bt-leise" style={{ maxWidth: 460, margin: '8px auto 18px' }}>Nach deinem ersten Durchgang siehst du hier Serie, Stärken und Schwächen je Gebiet und wie du dich über die Wochen entwickelst.</p>
          <button type="button" className="bt-knopf bt-knopf-gross" onClick={() => onBereich('heute')}><Play size={17} />Zum Tages-Training</button>
        </div>
      </div>
    )
  }

  return (
    <div className="bt-breite" data-bt-bereich="fortschritt">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1 className="bt-h1" style={{ flex: 1 }}>Fortschritt</h1>
        <span className="bt-chip" title={zustimmung === true ? 'Verschlüsselt auf diesem PC gespeichert' : 'Wird nicht gespeichert — nach dem Schließen weg'}><Lock size={12} />{zustimmung === true ? 'nur für dich sichtbar' : 'nur diese Sitzung'}</span>
      </div>

      {/* Kennzahlen */}
      <div className="bt-raster" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', marginBottom: 14 }}>
        <Kachel titel="Serie" wert={`${s.aktuell} ${s.aktuell === 1 ? 'Tag' : 'Tage'}`} unter={s.laengste > s.aktuell ? `längste Serie: ${s.laengste} Tage` : s.heuteGeuebt ? 'heute schon geübt' : s.aktuell > 0 ? 'heute noch offen' : 'heute starten'} symbol={<Flame size={18} />} warm={s.aktuell > 0} />
        <Kachel titel="Brain-Index" wert={index === null ? '–' : String(index)} unter={index !== null && indexVorher !== null ? `${index >= indexVorher ? '+' : '−'}${Math.abs(index - indexVorher)} in 30 Tagen · Skala bis 1000` : 'Mittel deiner Gebiete · Skala bis 1000'} symbol={<TrendingUp size={18} />} />
        <Kachel titel="Diese Woche" wert={`${w.geuebt} / ${w.ziel}`} unter={`${w.erreicht ? 'Wochenziel erreicht' : `Übungstage, Ziel ${w.ziel}`} · ${dauerText(wocheSek)} geübt`} symbol={<CalendarCheck size={18} />} />
        <Kachel titel="Insgesamt" wert={String(daten.laeufe.length)} unter={`Durchgänge an ${trainingstage} ${trainingstage === 1 ? 'Tag' : 'Tagen'} · ${dauerText(gesamtSek)}`} symbol={<Dumbbell size={18} />} />
      </div>

      <div className="bt-raster bt-heute-raster" style={{ marginBottom: 14 }}>
        {/* Brain-Profil */}
        <section className="bt-karte" data-bt-profil>
          <h2 className="bt-h2" style={{ marginBottom: 2 }}>Brain-Profil</h2>
          <div className="bt-klein bt-leise" style={{ marginBottom: 12 }}>Dein Stand je Gebiet (0–1000). Der Strich zeigt, wo du vor 30 Tagen warst. Klick auf ein Gebiet für die Einzelheiten.</div>
          <StandBalken onZeile={id => setGewaehlt(id as Gebiet)}
            zeilen={stand.map(x => ({ id: x.gebiet, name: gebietName(x.gebiet), symbol: <GebietSymbol gebiet={x.gebiet} size={15} />, jetzt: x.jetzt, vorher: x.vorher }))} />
        </section>

        <div className="bt-raster">
          <section className="bt-karte" data-bt-kalender>
            <h2 className="bt-h2" style={{ marginBottom: 2 }}>Deine Übungstage</h2>
            <div className="bt-klein bt-leise" style={{ marginBottom: 12 }}>Die letzten 16 Wochen. Kräftiger = mehr Durchgänge an dem Tag.</div>
            <Kalender spalten={kal} />
          </section>
          <section className="bt-karte" data-bt-einsichten>
            <h2 className="bt-h2" style={{ marginBottom: 8 }}>Was auffällt</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {tipps.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  {t.gebiet ? <span className="bt-symbol" style={{ width: 28, height: 28 }}><GebietSymbol gebiet={t.gebiet} size={14} /></span> : <span className="bt-symbol" style={{ width: 28, height: 28 }}><TrendingUp size={14} /></span>}
                  <div className="bt-klein"><b>{t.titel}</b><div className="bt-leise">{t.text}</div></div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Verläufe je Gebiet */}
      {geuebteGebiete.length > 0 && (
        <section className="bt-karte" style={{ marginBottom: 14 }} data-bt-verlaeufe>
          <h2 className="bt-h2" style={{ marginBottom: 2 }}>Entwicklung je Gebiet</h2>
          <div className="bt-klein bt-leise" style={{ marginBottom: 12 }}>Dein Stand am Ende jedes Übungstags. Jedes Gebiet hat seine eigene Skala am linken Rand.</div>
          <div className="bt-raster" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))' }}>
            {geuebteGebiete.map(x => (
              <button key={x.gebiet} type="button" onClick={() => setGewaehlt(x.gebiet)} className="bt-verlauf-kachel" data-an={aktiv === x.gebiet ? '' : undefined} data-bt-verlauf={x.gebiet}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <GebietSymbol gebiet={x.gebiet} size={15} /><span className="bt-h3" style={{ flex: 1, textAlign: 'left' }}>{gebietName(x.gebiet)}</span>
                  <span className="bt-klein bt-stumm">{x.laeufe} {x.laeufe === 1 ? 'Durchgang' : 'Durchgänge'}</span>
                </span>
                <Verlauf punkte={verlaufGebiet(daten, x.gebiet, 40)} hoehe={110} breite={300} />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Übungen des gewählten Gebiets */}
      {aktiv && (
        <section className="bt-karte" style={{ marginBottom: 14 }} data-bt-gebiet-detail={aktiv}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span className="bt-symbol"><GebietSymbol gebiet={aktiv} /></span>
            <div style={{ flex: 1 }}>
              <h2 className="bt-h2">{gebietName(aktiv)}: deine Übungen</h2>
              <div className="bt-klein bt-leise">{GEBIETE.find(g => g.id === aktiv)?.satz}</div>
            </div>
          </div>
          <table className="bt-tabelle">
            <thead><tr><th>Übung</th><th>Stufe</th><th>Bestwert</th><th>Durchgänge</th><th>Zuletzt</th><th /></tr></thead>
            <tbody>
              {KATALOG.filter(u => u.gebiet === aktiv).map(u => {
                const b = beste[u.id]
                return (
                  <tr key={u.id}>
                    <td><b>{u.name}</b></td>
                    <td>{daten.stufen[u.id] ?? 1}{(daten.hoechst[u.id] ?? 1) > (daten.stufen[u.id] ?? 1) ? <span className="bt-stumm"> (höchste: {daten.hoechst[u.id]})</span> : null}</td>
                    <td>{b ? b.best : '–'}</td><td>{b ? b.n : 0}</td><td>{b ? tagText(b.zuletzt) : 'noch nie'}</td>
                    <td style={{ textAlign: 'right' }}><button type="button" className="bt-knopf bt-knopf-leise" style={{ padding: '5px 11px', fontSize: 13 }} onClick={() => onUebung(u)} data-bt-ueben={u.id}>Üben<ArrowRight size={13} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      <div className="bt-raster bt-heute-raster">
        {/* Abzeichen */}
        <section className="bt-karte" data-bt-abzeichen>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h2 className="bt-h2" style={{ flex: 1 }}>Abzeichen</h2>
            <span className="bt-chip bt-zahl"><Award size={12} />{Object.keys(daten.abzeichen).length} / {ABZEICHEN.length}</span>
          </div>
          <div className="bt-abzeichen">
            {ABZEICHEN.map(a => {
              const am = daten.abzeichen[a.id]
              return (
                <div key={a.id} data-verdient={am ? '' : undefined} title={am ? `${a.text} — verdient am ${tagText(am)}` : a.text}>
                  <i><AbzeichenSymbol symbol={a.symbol} size={18} /></i>
                  <b>{a.name}</b>
                  <span>{am ? tagText(am) : a.text}</span>
                </div>
              )
            })}
          </div>
        </section>

        <div className="bt-raster">
          <section className="bt-karte" data-bt-iq-karte>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <h2 className="bt-h2" style={{ flex: 1 }}>IQ-Tests</h2>
              <button type="button" className="bt-knopf bt-knopf-nackt" onClick={() => onBereich('iq')}>Zum Test<ArrowRight size={14} /></button>
            </div>
            {daten.iq.length ? (
              <>
                <div className="bt-klein bt-leise" style={{ marginBottom: 6 }}>Punkt = Schätzwert, Strich = wahrscheinlicher Bereich.</div>
                <IqVerlauf breite={400} eintraege={daten.iq.slice(-8).map(e => ({ t: e.t, iq: e.iq, von: e.von, bis: e.bis, fragen: e.fragen }))} />
              </>
            ) : <div className="bt-klein bt-leise">Noch kein Test gespeichert. Ein Test dauert 8 bis 25 Minuten.</div>}
          </section>
          <section className="bt-karte" data-bt-duell-karte>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="bt-symbol" style={{ background: 'var(--bt-akzent2-weich)', color: 'var(--bt-akzent2)' }}><Swords size={18} /></span>
              <div style={{ flex: 1 }}>
                <h2 className="bt-h3">Duelle</h2>
                <div className="bt-klein bt-leise">{daten.duelle.length ? `${siege} ${siege === 1 ? 'Sieg' : 'Siege'} · ${niederlagen} ${niederlagen === 1 ? 'Niederlage' : 'Niederlagen'} · ${daten.duelle.length - siege - niederlagen} unentschieden` : 'Noch kein Duell gespielt.'}</div>
              </div>
              <button type="button" className="bt-knopf bt-knopf-leise" onClick={() => onBereich('duelle')}>Herausfordern</button>
            </div>
          </section>
          <div className="bt-klein bt-stumm" style={{ display: 'flex', gap: 6, padding: '0 4px' }}><Clock size={12} style={{ flex: 'none', marginTop: 3 }} /><span>Brain-Punkte: jede Stufe ist 100 Punkte wert, die Güte deines Durchgangs füllt die Stufe. Der Stand eines Gebiets ist das Mittel deiner Übungen darin, jüngere Durchgänge zählen stärker.</span></div>
        </div>
      </div>
    </div>
  )
}
