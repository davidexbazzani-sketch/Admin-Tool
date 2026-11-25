// Parla Italiano — Fortschritt: was man gelernt hat, wie regelmäßig, und wo die Stärken liegen.
// Alles hier stammt aus dem lokalen, verschlüsselten Lernstand und ist nur für den Benutzer selbst sichtbar.
import { useMemo, useState } from 'react'
import { Award, BookOpen, Clock, Flame, Layers, Lock, Star, Trophy } from 'lucide-react'
import { LEVEL_ANZAHL } from '../kern/inhaltTypen'
import { FAEHIGKEITEN } from '../kern/typen'
import { useItaliano } from '../kern/speicher'
import { ABSTAND, FAECHER, kastenStand } from '../kern/kasten'
import { serie, LERNTAG_AB } from '../kern/serie'
import { erreichtesNiveau, kursFortschritt, LERNTAGE } from '../kern/stand'
import { datumText, heute, istWochenende, plusTage, tagNummer, wochentag, wochentagName } from '../kern/zeit'
import { station } from '../kern/lehrplan'
import { ABZEICHEN } from '../kern/abzeichen'
import type { Bereich } from '../ParlaItaliano'

const minuten = (sek: number): number => Math.round(sek / 60)
const dauer = (sek: number): string => { const m = minuten(sek); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min` }

/** Lernzeit je Tag, letzte 28 Tage */
function ZeitDiagramm({ tage, heuteDatum }: { tage: Record<string, [number, number, number, number]>; heuteDatum: string }) {
  const [an, setAn] = useState<number | null>(null)
  const reihe = useMemo(() => Array.from({ length: 28 }, (_, i) => { const d = plusTage(heuteDatum, i - 27); return { d, min: minuten(tage[d]?.[2] ?? 0), n: tage[d]?.[0] ?? 0 } }), [tage, heuteDatum])
  const max = Math.max(15, ...reihe.map(r => r.min))
  const oben = Math.ceil(max / 5) * 5
  const B = 480, H = 170, links = 30, unten = 22, breit = (B - links) / reihe.length
  // oben 22 px Luft: dort steht die Einheit, ohne die oberste Achsenzahl zu berühren
  const y = (m: number) => (H - unten) - (m / oben) * (H - unten - 22)
  return (
    <div className="pi-dia" data-pi-zeitdiagramm onMouseLeave={() => setAn(null)}>
      <svg viewBox={`0 0 ${B} ${H}`} role="img" aria-label="Lernzeit je Tag in den letzten vier Wochen">
        {[0, oben / 2, oben].map(v => (
          <g key={v}><line className="raster" x1={links} x2={B} y1={y(v)} y2={y(v)} /><text x={links - 5} y={y(v) + 3} textAnchor="end">{Math.round(v)}</text></g>
        ))}
        {reihe.map((r, i) => {
          const x = links + i * breit
          const h = r.min ? Math.max(3, (H - unten) - y(r.min)) : 0
          return (
            <g key={r.d}>
              {h > 0 && <path className="balken" data-an={an === i ? '1' : undefined} d={`M${x + 1},${H - unten} v${-(h - 4)} q0,-4 4,-4 h${breit - 10} q4,0 4,4 v${h - 4} z`} />}
              {wochentag(r.d) === 1 && <text x={x + breit / 2} y={H - 6} textAnchor="middle">{datumText(r.d).replace(/\.\d{4}$/, '.')}</text>}
              <rect className="treffer" x={x} y={0} width={breit} height={H - unten} onMouseEnter={() => setAn(i)} />
            </g>
          )
        })}
        <text x={links - 5} y={9} textAnchor="end">min</text>
      </svg>
      {an !== null && <div className="pi-tipp" style={{ left: `${((links + (an + 0.5) * breit) / B) * 100}%`, top: `${(Math.min(y(reihe[an].min), H - unten - 20) / H) * 100}%` }}>{wochentagName(reihe[an].d).slice(0, 2)}, {datumText(reihe[an].d)} · {reihe[an].min ? `${reihe[an].min} min, ${reihe[an].n} Aufgaben` : 'nicht gelernt'}</div>}
      <details className="pi-klein pi-leise" style={{ marginTop: 6 }}>
        <summary style={{ cursor: 'pointer' }}>Zahlen als Tabelle</summary>
        <table className="pi-tabelle" style={{ marginTop: 6 }}><thead><tr><th>Tag</th><th>Minuten</th><th>Aufgaben</th></tr></thead>
          <tbody>{reihe.filter(r => r.n > 0).map(r => <tr key={r.d}><td>{datumText(r.d)}</td><td>{r.min}</td><td>{r.n}</td></tr>)}</tbody></table>
      </details>
    </div>
  )
}

export default function Fortschritt({ onBereich }: { onBereich: (b: Bereich) => void }) {
  const daten = useItaliano(s => s.daten)
  const heuteDatum = heute()
  const s = useMemo(() => serie(daten, heuteDatum), [daten, heuteDatum])
  const kasten = useMemo(() => kastenStand(daten.kasten, tagNummer(heuteDatum)), [daten.kasten, heuteDatum])
  const lerntage = useMemo(() => Object.values(daten.tage).filter(t => t[0] >= LERNTAG_AB).length, [daten.tage])
  const zeit = useMemo(() => Object.values(daten.tage).reduce((a, t) => a + t[2], 0), [daten.tage])
  const bestanden = useMemo(() => daten.pruefungen.filter(p => p.ok), [daten.pruefungen])
  const sterne = Object.values(daten.sterne)
  const joker = new Set(daten.jokerTage)

  // Kalender: 12 Wochen, Spalten = Wochen (Montag oben)
  const kalender = useMemo(() => {
    const ende = plusTage(heuteDatum, (7 - wochentag(heuteDatum)) % 7)     // Sonntag dieser Woche
    return Array.from({ length: 84 }, (_, i) => plusTage(ende, i - 83))
  }, [heuteDatum])
  const stufe = (n: number): number => (n >= 80 ? 4 : n >= 40 ? 3 : n >= LERNTAG_AB ? 2 : n > 0 ? 1 : 0)
  const meistFach = Math.max(1, ...kasten.jeFach)

  if (!daten.lektionen && !Object.keys(daten.tage).length) {
    return <div className="pi-schmal pi-karte pi-spalte" data-pi-fortschritt><h1 className="pi-h1">Fortschritt</h1><p className="pi-leise">Hier siehst du, was du gelernt hast – sobald du die erste Lektion geschafft hast.</p><div><button type="button" className="pi-knopf" onClick={() => onBereich('heute')}>Zur ersten Lektion</button></div></div>
  }

  return (
    <div className="pi-breite pi-spalte" data-pi-fortschritt>
      <div className="pi-reihe" style={{ justifyContent: 'space-between' }}>
        <div><h1 className="pi-h1">Fortschritt</h1><p className="pi-leise">Seit {datumText(daten.begonnen)} dabei{erreichtesNiveau(daten.level) !== '–' ? ` · erreichtes Niveau: ${erreichtesNiveau(daten.level)}` : ''}</p></div>
        <span className="pi-chip" title="Liegt nur auf diesem PC, verschlüsselt mit deinem Windows-Konto"><Lock size={12} />nur für dich sichtbar</span>
      </div>

      {/* Kennzahlen */}
      <div className="pi-raster" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }} data-pi-kennzahlen>
        {([
          [Flame, 'pi-symbol-gold', `${s.aktuell} ${s.aktuell === 1 ? 'Tag' : 'Tage'}`, `in Folge · Bestwert ${s.laengste}`],
          [BookOpen, 'pi-symbol-gruen', `${kasten.gelernt} Wörter`, `${kasten.sicher} sitzen sicher`],
          [Award, '', `${daten.lektionen} von ${LERNTAGE}`, `Lerntagen · ${kursFortschritt(daten)} % der Reise`],
          [Clock, 'pi-symbol-blau', dauer(zeit), `Lernzeit an ${lerntage} ${lerntage === 1 ? 'Tag' : 'Tagen'}`],
          [Star, 'pi-symbol-gold', `${daten.punkte.toLocaleString('de-DE')}`, 'Punkte'],
        ] as [typeof Flame, string, string, string][]).map(([Symbol, farbe, wert, text], i) => (
          <div key={i} className="pi-karte pi-reihe" style={{ flexWrap: 'nowrap', padding: 14 }}>
            <span className={`pi-symbol ${farbe}`}><Symbol size={18} /></span>
            <div><div className="pi-h2 pi-zahl" style={{ fontSize: 18 }}>{wert}</div><div className="pi-leise pi-klein">{text}</div></div>
          </div>
        ))}
      </div>

      <div className="pi-raster pi-raster-2">
        <div className="pi-karte pi-spalte">
          <h2 className="pi-h3">Lernzeit je Tag · letzte vier Wochen</h2>
          <ZeitDiagramm tage={daten.tage} heuteDatum={heuteDatum} />
        </div>

        <div className="pi-karte pi-spalte">
          <h2 className="pi-h3">Regelmäßigkeit · letzte zwölf Wochen</h2>
          <div className="pi-reihe" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <div className="pi-klein pi-stumm" style={{ display: 'grid', gridTemplateRows: 'repeat(7, 14px)', gap: 3, lineHeight: '14px' }}>{['Mo', '', 'Mi', '', 'Fr', '', 'So'].map((t, i) => <span key={i}>{t}</span>)}</div>
            <div className="pi-heat" data-pi-kalender>
              {kalender.map(d => {
                const n = daten.tage[d]?.[0] ?? 0
                const zukunft = d > heuteDatum
                return <i key={d} data-s={zukunft ? undefined : stufe(n) || undefined} data-joker={!n && joker.has(d) ? '1' : undefined} data-heute={d === heuteDatum ? '1' : undefined} style={zukunft ? { opacity: 0.3 } : undefined}
                  title={`${wochentagName(d)}, ${datumText(d)}: ${zukunft ? '–' : n ? `${n} Aufgaben, ${dauer(daten.tage[d]![2])}` : joker.has(d) ? 'Joker eingesetzt' : istWochenende(d) ? 'Wochenende' : 'nicht gelernt'}`} />
              })}
            </div>
          </div>
          <div className="pi-reihe pi-klein pi-stumm" style={{ gap: 5 }}>
            <span>weniger</span>
            <span className="pi-heat" style={{ gridTemplateRows: '14px' }}><i /><i data-s="1" /><i data-s="2" /><i data-s="3" /><i data-s="4" /></span>
            <span>mehr</span>
            <span aria-hidden style={{ marginLeft: 10, width: 14, height: 14, borderRadius: 3, background: 'var(--pi-gold)', opacity: 0.55, display: 'inline-block' }} /><span>Joker</span>
          </div>
          <p className="pi-klein pi-stumm">Ein Tag zählt als Lerntag ab {LERNTAG_AB} beantworteten Aufgaben. Wochenenden unterbrechen die Serie nicht.</p>
        </div>

        <div className="pi-karte pi-spalte" data-pi-faehigkeiten>
          <h2 className="pi-h3">Trefferquote nach Fähigkeit</h2>
          {FAEHIGKEITEN.map(f => {
            const [r, n] = daten.faehig[f.id] ?? [0, 0]
            const genug = n >= 10
            const q = n ? Math.round((r / n) * 100) : 0
            return (
              <div key={f.id} className="pi-reihe" style={{ flexWrap: 'nowrap' }} title={`${r} von ${n} richtig`}>
                <span style={{ width: 92, fontWeight: 600 }}>{f.name}</span>
                <div className="pi-balken" style={{ flex: 1, height: 10 }}><i style={{ width: `${genug ? q : 0}%`, background: 'var(--pi-viz-1)' }} /></div>
                <span className="pi-zahl pi-klein" style={{ width: 86, textAlign: 'right', color: genug ? 'var(--pi-ink)' : 'var(--pi-stumm)' }}>{genug ? `${q} % von ${n}` : n ? 'noch zu wenig' : '–'}</span>
              </div>
            )
          })}
          <p className="pi-klein pi-stumm">Gezählt wird jede gewertete Aufgabe aus Lektionen, Tests und Training. Unter zehn Aufgaben sagt die Quote noch nichts.</p>
        </div>

        <div className="pi-karte pi-spalte" data-pi-kasten>
          <div className="pi-reihe" style={{ justifyContent: 'space-between' }}><h2 className="pi-h3">Dein Karteikasten</h2>{kasten.faellig > 0 && <button type="button" className="pi-chip pi-chip-blau" onClick={() => onBereich('training')}><Layers size={12} />{kasten.faellig} fällig – jetzt wiederholen</button>}</div>
          {Array.from({ length: FAECHER }, (_, i) => i + 1).map(f => (
            <div key={f} className="pi-reihe" style={{ flexWrap: 'nowrap' }}>
              <span style={{ width: 150 }}><b>Fach {f}</b> <span className="pi-leise pi-klein">· {f === 1 ? 'morgen wieder' : `nach ${ABSTAND[f]} Tagen`}</span></span>
              <div className="pi-balken" style={{ flex: 1, height: 10 }}><i style={{ width: `${(kasten.jeFach[f] / meistFach) * 100}%`, background: 'var(--pi-viz-1)' }} /></div>
              <span className="pi-zahl pi-klein" style={{ width: 36, textAlign: 'right' }}>{kasten.jeFach[f]}</span>
            </div>
          ))}
          <p className="pi-klein pi-stumm">Jede richtige Antwort schiebt ein Wort ein Fach weiter, jede falsche zurück in Fach 1. Ab Fach 4 gilt es als sicher.</p>
        </div>
      </div>

      <div className="pi-karte pi-spalte" data-pi-abzeichen-liste>
        <div className="pi-reihe" style={{ justifyContent: 'space-between' }}><h2 className="pi-h3">Abzeichen</h2><span className="pi-chip pi-chip-gold pi-zahl">{Object.keys(daten.abzeichen).length} von {ABZEICHEN.length}</span></div>
        <div className="pi-raster" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
          {ABZEICHEN.map(a => {
            const am = daten.abzeichen[a.id]
            return (
              <div key={a.id} className="pi-reihe" style={{ flexWrap: 'nowrap', gap: 10 }} title={am ? `verdient am ${datumText(am)}` : 'noch offen'} data-pi-abzeichen={a.id} data-pi-da={am ? '1' : undefined}>
                <span className="pi-abzeichen pi-abzeichen-klein" data-offen={am ? undefined : '1'} aria-hidden>{a.zeichen}</span>
                <span style={{ minWidth: 0 }}><b className="pi-it" lang="it" style={{ display: 'block', color: am ? undefined : 'var(--pi-stumm)' }}>{a.name}</b><span className="pi-leise pi-klein">{a.text}</span></span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="pi-raster pi-raster-2">
        <div className="pi-karte pi-spalte" style={{ gap: 8 }} data-pi-pruefungen>
          <div className="pi-reihe" style={{ justifyContent: 'space-between' }}><h2 className="pi-h3">Bestandene Prüfungen</h2><span className="pi-chip pi-zahl"><Trophy size={12} />{Math.min(LEVEL_ANZAHL, daten.level - 1)} von {LEVEL_ANZAHL}</span></div>
          {bestanden.length === 0 ? <p className="pi-leise">Noch keine – die erste wartet nach dem fünften Lerntag in Turin.</p> : [...bestanden].reverse().slice(0, 8).map((p, i) => (
            <div key={i} className="pi-zeile" style={{ padding: '6px 0' }}>
              <span className="pi-chip pi-chip-gruen" style={{ width: 70, justifyContent: 'center' }}>Level {p.level}</span>
              <span style={{ flex: 1 }}>{station(p.level).ort}</span>
              <span className="pi-leise pi-klein">{datumText(p.am.slice(0, 10))}</span>
              <span className="pi-zahl" style={{ width: 48, textAlign: 'right', fontWeight: 700 }}>{Math.round((p.r / p.n) * 100)} %</span>
            </div>
          ))}
          {daten.pruefungen.length > bestanden.length && <p className="pi-klein pi-stumm">{daten.pruefungen.length} Versuche insgesamt, {bestanden.length} bestanden.</p>}
        </div>
        <div className="pi-karte pi-spalte" style={{ gap: 8 }}>
          <h2 className="pi-h3">Tagestests und Urkunden</h2>
          <p className="pi-leise">{sterne.length ? <>{sterne.length} Tagestests · im Schnitt <b style={{ color: 'var(--pi-ink)' }}>{(sterne.reduce((a, b) => a + b, 0) / sterne.length).toFixed(1).replace('.', ',')} von 3 Sternen</b> · {sterne.filter(x => x === 3).length}-mal volle Punktzahl</> : 'Noch kein Tagestest.'}</p>
          <div className="pi-reihe">
            {(['A1', 'A2', 'B1'] as const).map(n => <span key={n} className={`pi-chip ${daten.urkunden[n] ? 'pi-chip-gold' : ''}`} title={daten.urkunden[n] ? `bestanden am ${datumText(daten.urkunden[n])}` : 'noch nicht abgelegt'}><Award size={12} />Urkunde {n}{daten.urkunden[n] ? '' : ' – offen'}</span>)}
          </div>
          <div><button type="button" className="pi-knopf pi-knopf-leise" onClick={() => onBereich('tests')}>Zu den Tests</button></div>
        </div>
      </div>
    </div>
  )
}
