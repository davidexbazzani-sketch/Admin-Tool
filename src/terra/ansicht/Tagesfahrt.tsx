// Terra Incognita — die Tagesfahrt: eine Aufgabe am Tag, für alle Kollegen dieselbe. Der erste beendete Versuch zählt.
import { useEffect, useMemo, useState } from 'react'
import { feldNr, umkreis, type Feld } from '../kern/hex'
import { RAETSEL_TEXT } from '../kern/raetsel'
import { rangVon } from '../kern/schiff'
import { medaille, MEDAILLE_NAME, regattaSchritt, tagesAufgabe, tagesLohn, TAGES_NAME, zoneVon, type Regatta, type TagesAufgabe } from '../kern/tagesfahrt'
import { WIND_STAERKE, windAus } from '../kern/wind'
import { ladeTag, meldeTag, useGemeinsam, veroeffentliche, type TagesErgebnis } from '../netz/gemeinsam'
import { umwelt, useTerra } from '../speicher'
import { klang } from '../ton/klang'
import { tagText, wochentag } from '../zeit'
import { RiffBrett, SternBrett, TauBrett } from './Raetsel'
import { Raum, toast, Windpfeil, zahl } from './teile'

const G = 23, WURZEL3 = 1.7320508075688772
const px = (f: Feld): [number, number] => [G * WURZEL3 * (f.q + f.r / 2), G * 1.5 * f.r]
const sechseck = (f: Feld): string => { const [x, y] = px(f); return [0, 1, 2, 3, 4, 5].map(i => { const w = (Math.PI / 180) * (60 * i - 30); return `${(x + G * 0.96 * Math.cos(w)).toFixed(1)},${(y + G * 0.96 * Math.sin(w)).toFixed(1)}` }).join(' ') }

/** Regatta: Feld für Feld segeln, alle Bojen runden, zurück zum Start */
export function RegattaBrett({ reg, onFertig }: { reg: Regatta; onFertig: (stunden: number) => void }) {
  const [weg, setWeg] = useState<{ f: Feld; std: number }[]>([])
  const [fertig, setFertig] = useState(false)
  const pos = weg.length ? weg[weg.length - 1].f : reg.start
  const stunden = weg.reduce((a, s) => a + s.std, 0)
  const gerundet = reg.bojen.map(b => weg.some(s => s.f.q === b.q && s.f.r === b.r))
  const felder = useMemo(() => umkreis(0, 0, reg.radius), [reg.radius])
  const geh = (f: Feld): void => {
    if (fertig) return
    const std = regattaSchritt(reg, pos, f)
    if (std === null) return
    const neu = [...weg, { f, std }]
    klang('klick')
    setWeg(neu)
    const alle = reg.bojen.every(b => neu.some(s => s.f.q === b.q && s.f.r === b.r))
    if (alle && f.q === reg.start.q && f.r === reg.start.r) { setFertig(true); window.setTimeout(() => onFertig(stunden + std), 450) }
  }
  const b = G * WURZEL3 * (reg.radius * 2 + 1.4), h = G * 1.5 * (reg.radius * 2) + G * 2.4
  const ZONE = ['var(--ti-flaeche)', 'var(--ti-flaeche2)', 'var(--ti-flaeche)']
  return (
    <div data-ti-brett="regatta">
      <div className="ti-reihe" style={{ justifyContent: 'center', gap: 14, margin: '8px 0' }}>
        {reg.zonen.map((w, i) => <span key={i} className="ti-reihe" style={{ gap: 5 }}><Windpfeil richtung={w.richtung} staerke={w.staerke} groesse={26} /><span className="ti-stumm">{['Norden', 'Mitte', 'Süden'][i]}: {WIND_STAERKE[w.staerke]} aus {windAus(w)}</span></span>)}
      </div>
      <svg viewBox={`${-b / 2} ${-h / 2} ${b} ${h}`} width="100%" style={{ maxWidth: 470, display: 'block', margin: '0 auto' }}>
        {felder.map(f => {
          const land = reg.land.includes(feldNr(f.q, f.r)), std = land ? null : regattaSchritt(reg, pos, f)
          const [x, y] = px(f)
          return (
            <g key={feldNr(f.q, f.r)} onClick={() => geh(f)} style={{ cursor: std !== null ? 'pointer' : 'default' }} data-ti-rfeld={`${f.q},${f.r}`} data-ti-kosten={std ?? ''}>
              <polygon points={sechseck(f)} fill={land ? 'var(--ti-rand-stark)' : ZONE[zoneVon(reg, f)]} stroke={std !== null ? 'var(--ti-gold)' : 'var(--ti-rand)'} strokeWidth={std !== null ? 1.6 : 0.8} />
              {std !== null && <text x={x} y={y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ti-gold-stark)">{std}</text>}
            </g>
          )
        })}
        {weg.length > 0 && <polyline points={[reg.start, ...weg.map(s => s.f)].map(f => px(f).join(',')).join(' ')} fill="none" stroke="var(--ti-gold)" strokeWidth="2.2" strokeDasharray="4 3" opacity="0.8" style={{ pointerEvents: 'none' }} />}
        {reg.bojen.map((bo, i) => { const [x, y] = px(bo); return <g key={i} style={{ pointerEvents: 'none' }}><circle cx={x} cy={y - 9} r="6.5" fill={gerundet[i] ? 'var(--ti-gut)' : 'var(--ti-gefahr)'} stroke="var(--ti-ink)" strokeWidth="1" /><text x={x} y={y - 6} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff">{i + 1}</text></g> })}
        {(() => { const [x, y] = px(reg.start); return <path d={`M${x - 5} ${y - 4} v-12 l9 3.5 l-9 3.5`} fill="var(--ti-gold)" stroke="var(--ti-ink)" strokeWidth="1" strokeLinejoin="round" style={{ pointerEvents: 'none' }} /> })()}
        {(() => { const [x, y] = px(pos); return <g transform={`translate(${x - 9} ${y - 3})`} style={{ pointerEvents: 'none' }} data-ti-rboot><path d="M2 12 h14 l-2.5 4 h-9z" fill="var(--ti-gold)" stroke="var(--ti-ink)" strokeWidth="0.9" strokeLinejoin="round" /><path d="M9 12 V2 q6 4 0 9" fill="var(--ti-papier)" stroke="var(--ti-ink)" strokeWidth="0.9" strokeLinejoin="round" /></g> })()}
      </svg>
      <div className="ti-reihe" style={{ justifyContent: 'center', marginTop: 8 }}>
        <button type="button" className="ti-knopf ti-knopf-klein" disabled={!weg.length || fertig} onClick={() => setWeg(weg.slice(0, -1))}>Einen Schritt zurück</button>
        <button type="button" className="ti-knopf ti-knopf-leise ti-knopf-klein" disabled={!weg.length || fertig} onClick={() => setWeg([])}>Von vorn</button>
        <span className="ti-stumm" data-ti-rstunden>{stunden} Stunden · Bojen {gerundet.filter(Boolean).length}/{reg.bojen.length} · die Zahlen sind die Stunden je Schritt</span>
      </div>
    </div>
  )
}

export function AufgabenBrett({ aufgabe, onFertig }: { aufgabe: TagesAufgabe; onFertig: (punkte: number) => void }) {
  if (aufgabe.art === 'regatta') return <RegattaBrett reg={aufgabe.regatta} onFertig={onFertig} />
  if (aufgabe.art === 'riff') return <RiffBrett r={aufgabe.riff} onFertig={onFertig} />
  if (aufgabe.art === 'taue') return <TauBrett r={aufgabe.taue} onFertig={onFertig} />
  return <SternBrett r={aufgabe.stern} onFertig={onFertig} />
}
const AUFGABEN_TEXT: Record<string, string> = {
  regatta: 'Runde alle drei Bojen in beliebiger Reihenfolge und kehre zur Flagge zurück – in möglichst wenigen Stunden. Mit dem Wind ist es billig, dagegen teuer; in jedem Streifen weht er anders.',
  riff: RAETSEL_TEXT[0], taue: RAETSEL_TEXT[1], stern: RAETSEL_TEXT[3],
}
const EINHEIT = (a: TagesAufgabe, p: number): string => (a.art === 'regatta' ? `${p} Stunden` : a.art === 'riff' ? `${p} Züge` : a.art === 'taue' ? `${p} Drehungen` : `${p} Fehlgriffe`)
const BESTWERT = (a: TagesAufgabe): string => (a.art === 'regatta' ? `Bestmöglich: ${a.regatta.best} Stunden` : a.art === 'riff' ? `Bestmöglich: ${a.riff.par} Züge` : a.art === 'taue' ? `Bestmöglich: ${a.taue.par} Drehungen` : 'Bestmöglich: ohne Fehlgriff')

export default function Tagesfahrt({ onZu }: { onZu: () => void }) {
  const stand = useTerra(s => s.spiel?.stand)
  useTerra(s => s.rev)
  const tue = useTerra(s => s.tue)
  const tag = useMemo(() => umwelt().tag, [])
  const aufgabe = useMemo(() => tagesAufgabe(tag, wochentag(tag)), [tag])
  const [rang, setRang] = useState<TagesErgebnis[] | null>(null)
  const verbunden = useGemeinsam(s => s.verbunden)
  const [nochmal, setNochmal] = useState(0)
  const [zumSpass, setZumSpass] = useState<number | null>(null)
  const meins = stand?.tagesfahrt[String(tag)]
  useEffect(() => { let lebt = true; void ladeTag(tag).then(r => { if (lebt) setRang(r) }); return () => { lebt = false } }, [tag, meins?.p])
  if (!stand) return null
  const fertig = (punkte: number): void => {
    if (meins) { setZumSpass(punkte); return }
    const m = medaille(aufgabe, punkte), [gold, ruhm] = tagesLohn(m, rangVon(stand.ruhm))
    tue(sp => {
      sp.stand.tagesfahrt[String(tag)] = { p: punkte, m }
      const alt = Object.keys(sp.stand.tagesfahrt).sort()
      while (alt.length > 30) delete sp.stand.tagesfahrt[alt.shift() as string]
      sp.stand.medaillen[m - 1]++
      sp.stand.gold += gold; sp.stand.ruhm += ruhm; sp.stand.zug++
    })
    klang(m === 1 ? 'fanfare' : 'fund')
    toast(`${MEDAILLE_NAME[m]}! +${zahl(gold)} Gold, +${ruhm} Ruhm`)
    void meldeTag(tag, aufgabe.art, punkte, 0, m).then(() => { void veroeffentliche(true); void ladeTag(tag).then(setRang) })
  }
  return (
    <Raum kennung="tagesfahrt" titel={`Tagesfahrt: ${TAGES_NAME[aufgabe.art]}`} unter={`${tagText(tag)} · heute für alle Kapitäne dieselbe Aufgabe · der erste beendete Versuch zählt`} onZu={onZu}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(220px, 1fr)', gap: 16, alignItems: 'start' }}>
        <div className="ti-kasten">
          {meins && zumSpass === null && nochmal === 0 ? (
            <div data-ti-tag-fertig>
              <h3>Heute schon gefahren: {MEDAILLE_NAME[meins.m]}</h3>
              <p>Dein Ergebnis: <b>{EINHEIT(aufgabe, meins.p)}</b>. {BESTWERT(aufgabe)}. Morgen wartet eine neue Aufgabe.</p>
              <div className="ti-fuss" style={{ justifyContent: 'flex-start' }}><button type="button" className="ti-knopf ti-knopf-klein" onClick={() => setNochmal(1)}>Zum Spaß noch einmal</button></div>
            </div>
          ) : (
            <>
              <p>{AUFGABEN_TEXT[aufgabe.art]}</p>
              {meins && <p className="ti-stumm" style={{ marginTop: 4 }}>Nur zum Spaß – gewertet ist dein erster Versuch ({EINHEIT(aufgabe, meins.p)}).{zumSpass !== null ? ` Diesmal: ${EINHEIT(aufgabe, zumSpass)}.` : ''}</p>}
              <AufgabenBrett key={nochmal} aufgabe={aufgabe} onFertig={fertig} />
              {zumSpass !== null && <div className="ti-fuss"><button type="button" className="ti-knopf ti-knopf-klein" onClick={() => { setZumSpass(null); setNochmal(nochmal + 1) }}>Noch einmal</button></div>}
            </>
          )}
        </div>
        <div className="ti-kasten" data-ti-tagesrang>
          <h3>Heute</h3>
          {rang === null || (verbunden === false && !rang.length) ? <p>Die Tagesliste liegt auf dem Netzlaufwerk – gerade nicht erreichbar. Dein Ergebnis wird nachgereicht, sobald es wieder da ist.</p> : rang.length ? (
            <table className="ti-tabelle"><tbody>
              {rang.map((r, i) => <tr key={r.u} style={r.u === stand.benutzer.replace(/[^a-z0-9._-]/g, '_') ? { background: 'var(--ti-gold-weich)' } : undefined}><td className="ti-stumm" style={{ width: 22 }}>{i + 1}</td><td><b>{r.n}</b></td><td className="ti-zahl">{EINHEIT(aufgabe, r.p).replace(/ .*/, '')}</td><td className="ti-zahl"><span className={`ti-marke ${r.m === 1 ? 'ti-marke-gold' : 'ti-marke-grau'}`}>{MEDAILLE_NAME[r.m] ?? ''}</span></td></tr>)}
            </tbody></table>
          ) : <p>Heute ist noch niemand gefahren. Du könntest der Erste sein.</p>}
          <p className="ti-stumm" style={{ marginTop: 10 }}>Deine Medaillen: {stand.medaillen[0]} Gold · {stand.medaillen[1]} Silber · {stand.medaillen[2]} Bronze. Wer einen Tag auslässt, verliert nichts.</p>
        </div>
      </div>
    </Raum>
  )
}
