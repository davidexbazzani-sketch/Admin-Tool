// Diagramme des Brain Trainers (eigenes SVG, keine Bibliothek).
// Regeln (Dataviz-Leitfaden): Form vor Farbe · eine Achse · dünne Marken (Balken ≤ 24 px, Linie 2 px,
// Punkte r ≥ 4 mit Ring in Flächenfarbe) · Raster als durchgezogene Haarlinie · Schrift nie in der
// Datenfarbe · bei zwei Reihen immer eine Legende · Tooltip ergänzt nur (die Werte stehen auch im Text).
// Farben: --bt-viz-1/-2 (geprüfte Stufen für hell und dunkel), --bt-viz-grau (Kontext), --bt-viz-s1…4 (Folge).
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { bereichText, iqText, phi } from '../iq/irt'
import type { KalenderTag, VerlaufPunkt } from '../kern/fortschritt'

// ── Tooltip ───────────────────────────────────────────────────────────────────
interface Tipp { x: number; y: number; inhalt: ReactNode }
/** Tooltip relativ zum umgebenden Kasten (der `position: relative` haben muss → Klasse bt-dia). */
export function useTipp() {
  const [tipp, setTipp] = useState<Tipp | null>(null)
  const kasten = useRef<HTMLDivElement>(null)
  const zeige = useCallback((e: { clientX: number; clientY: number }, inhalt: ReactNode) => {
    const r = kasten.current?.getBoundingClientRect()
    if (!r) return
    setTipp({ x: e.clientX - r.left, y: e.clientY - r.top, inhalt })
  }, [])
  const weg = useCallback(() => setTipp(null), [])
  const element = tipp && (
    <div className="bt-tipp" style={{ left: Math.max(70, Math.min((kasten.current?.clientWidth ?? 400) - 70, tipp.x)), top: tipp.y }} role="status">{tipp.inhalt}</div>
  )
  return { kasten, zeige, weg, element }
}
const datum = (tag: string): string => { const [j, m, t] = tag.split('-'); return `${t}.${m}.${j}` }
const kurzDatum = (tag: string): string => { const [, m, t] = tag.split('-'); return `${Number(t)}.${Number(m)}.` }

// ── Glockenkurve mit eigener Position ─────────────────────────────────────────
export function Glocke({ iq, von, bis }: { iq: number; von: number; bis: number }) {
  const { kasten, zeige, weg, element } = useTipp()
  const B = 560, H = 190, links = 16, rechts = 16, oben = 34, unten = 30
  const xMin = 55, xMax = 145
  const x = (v: number) => links + ((Math.max(xMin, Math.min(xMax, v)) - xMin) / (xMax - xMin)) * (B - links - rechts)
  const dichte = (v: number) => Math.exp(-0.5 * ((v - 100) / 15) ** 2)
  const y = (v: number) => H - unten - dichte(v) * (H - oben - unten)
  const punkte = Array.from({ length: 91 }, (_, i) => xMin + i)
  const linie = punkte.map((v, i) => `${i ? 'L' : 'M'}${x(v).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const flaeche = (a: number, b: number) => {
    const p = punkte.filter(v => v >= a && v <= b)
    if (p.length < 2) return ''
    return `M${x(p[0]).toFixed(1)},${H - unten}` + p.map(v => `L${x(v).toFixed(1)},${y(v).toFixed(1)}`).join('') + `L${x(p[p.length - 1]).toFixed(1)},${H - unten}Z`
  }
  const iqX = x(iq)
  const beschriftungLinks = iqX > B - 120
  return (
    <div className="bt-dia" ref={kasten}>
      <svg viewBox={`0 0 ${B} ${H}`} role="img" aria-label={`Verteilung der IQ-Werte in der Bevölkerung. Dein Schätzwert ${iq}, wahrscheinlicher Bereich ${von} bis ${bis}.`}
        onMouseMove={e => {
          const r = e.currentTarget.getBoundingClientRect()
          const v = Math.round(xMin + ((e.clientX - r.left) / r.width * B - links) / (B - links - rechts) * (xMax - xMin))
          if (v < xMin || v > xMax) { weg(); return }
          zeige(e, <><b>IQ {v}</b><br />etwa {Math.round(phi((v - 100) / 15) * 100)} % liegen darunter</>)
        }} onMouseLeave={weg}>
        {/* Verteilung = Kontext (grau), eigener Bereich = Hervorhebung */}
        <path d={flaeche(xMin, xMax)} fill="var(--bt-viz-grau)" opacity={0.14} />
        <path d={flaeche(Math.max(xMin, von), Math.min(xMax, bis))} fill="var(--bt-viz-1)" opacity={0.3} />
        <path d={linie} fill="none" stroke="var(--bt-viz-grau)" strokeWidth={2} strokeLinejoin="round" />
        <line x1={links} y1={H - unten} x2={B - rechts} y2={H - unten} stroke="var(--bt-viz-raster)" strokeWidth={1} />
        {[70, 85, 100, 115, 130].map(v => (
          <g key={v}>
            <line x1={x(v)} y1={H - unten} x2={x(v)} y2={H - unten + 4} stroke="var(--bt-viz-raster)" strokeWidth={1} />
            <text x={x(v)} y={H - unten + 17} textAnchor="middle" className="bt-dia-achse">{v}</text>
          </g>
        ))}
        <text x={x(100)} y={H - 1} textAnchor="middle" className="bt-dia-achse">Durchschnitt</text>
        {/* eigene Position */}
        <line x1={iqX} y1={oben - 8} x2={iqX} y2={H - unten} stroke="var(--bt-viz-1)" strokeWidth={2} />
        <circle cx={iqX} cy={y(iq)} r={6} fill="var(--bt-viz-1)" stroke="var(--bt-flaeche)" strokeWidth={2} />
        <text x={iqX + (beschriftungLinks ? -8 : 8)} y={oben - 12} textAnchor={beschriftungLinks ? 'end' : 'start'} className="bt-dia-wert">Du: {iqText(iq)}</text>
        <text x={iqX + (beschriftungLinks ? -8 : 8)} y={oben + 2} textAnchor={beschriftungLinks ? 'end' : 'start'} className="bt-dia-achse">Bereich {bereichText(von, bis)}</text>
      </svg>
      {element}
    </div>
  )
}

// ── Profil gegen das eigene Niveau (zweiseitige Balken) ───────────────────────
export interface TendenzZeile { id: string; name: string; unter: string; tendenz: number; tipp: string }
export function TendenzBalken({ zeilen, hinweis }: { zeilen: TendenzZeile[]; hinweis?: string }) {
  const { kasten, zeige, weg, element } = useTipp()
  return (
    <div className="bt-dia" ref={kasten}>
      <div className="bt-dia-legende">
        <span><i style={{ background: 'var(--bt-viz-2)' }} />schwächer als dein Gesamtniveau</span>
        <span><i style={{ background: 'var(--bt-viz-1)' }} />stärker als dein Gesamtniveau</span>
      </div>
      <div className="bt-tendenz">
        {zeilen.map(z => (
          <div key={z.id} className="bt-tendenz-zeile" onMouseMove={e => zeige(e, <><b>{z.name}</b><br />{z.tipp}</>)} onMouseLeave={weg} tabIndex={0} aria-label={`${z.name}: ${z.tipp}`}>
            <div><div className="bt-h3">{z.name}</div><div className="bt-klein bt-leise">{z.unter}</div></div>
            <div className="bt-tendenz-spur" aria-hidden="true">
              <i className="bt-tendenz-mitte" />
              {Math.abs(z.tendenz) >= 0.04 && (
                <i className="bt-tendenz-balken" data-seite={z.tendenz < 0 ? 'minus' : 'plus'}
                  style={{ width: `${Math.abs(z.tendenz) * 50}%`, [z.tendenz < 0 ? 'right' : 'left']: '50%' }} />
              )}
            </div>
          </div>
        ))}
      </div>
      {hinweis && <div className="bt-klein bt-stumm" style={{ marginTop: 8 }}>{hinweis}</div>}
      {element}
    </div>
  )
}

// ── Stand je Gebiet: heute (Balken) gegen früher (Marke) ──────────────────────
export interface StandZeile { id: string; name: string; symbol?: ReactNode; jetzt: number | null; vorher: number | null; unter?: string }
export function StandBalken({ zeilen, max = 1000, vorherText = 'vor 30 Tagen', onZeile }: { zeilen: StandZeile[]; max?: number; vorherText?: string; onZeile?: (id: string) => void }) {
  const { kasten, zeige, weg, element } = useTipp()
  return (
    <div className="bt-dia" ref={kasten}>
      <div className="bt-dia-legende">
        <span><i style={{ background: 'var(--bt-viz-1)' }} />heute</span>
        <span><i className="bt-dia-marke" />{vorherText}</span>
      </div>
      <div className="bt-stand">
        {zeilen.map(z => {
          const plus = z.jetzt !== null && z.vorher !== null ? z.jetzt - z.vorher : null
          const tipp = z.jetzt === null ? 'noch nicht geübt' : `Stand ${z.jetzt} von ${max}${plus !== null ? ` · ${plus >= 0 ? '+' : '−'}${Math.abs(plus)} gegenüber ${vorherText}` : ''}`
          return (
            <button key={z.id} type="button" className="bt-stand-zeile" onClick={() => onZeile?.(z.id)} onMouseMove={e => zeige(e, <><b>{z.name}</b><br />{tipp}</>)} onMouseLeave={weg} aria-label={`${z.name}: ${tipp}`} data-bt-stand={z.id}>
              <span className="bt-stand-name">{z.symbol}<span>{z.name}</span></span>
              <span className="bt-stand-spur" aria-hidden="true">
                {z.jetzt !== null && <i className="bt-stand-balken" style={{ width: `${Math.max(1.5, (z.jetzt / max) * 100)}%` }} />}
                {z.vorher !== null && <i className="bt-stand-marke" style={{ left: `${(z.vorher / max) * 100}%` }} />}
              </span>
              <span className="bt-stand-wert bt-zahl">{z.jetzt ?? '–'}</span>
            </button>
          )
        })}
      </div>
      {element}
    </div>
  )
}

// ── Verlauf (eine Reihe): Linie mit zarter Fläche, Endpunkt beschriftet ───────
/** `breite` = Zeichenbreite in Einheiten: kleiner wählen, wenn das Diagramm schmal dargestellt wird (sonst wird die Schrift zu klein). */
export function Verlauf({ punkte, hoehe = 120, einheit = 'Punkte', breite = 420 }: { punkte: VerlaufPunkt[]; hoehe?: number; einheit?: string; breite?: number }) {
  const { kasten, zeige, weg, element } = useTipp()
  const [nah, setNah] = useState<number | null>(null)
  if (punkte.length === 0) return <div className="bt-klein bt-stumm" style={{ height: hoehe, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Noch keine Daten</div>
  const B = breite, links = 34, rechts = 44, oben = 12, unten = 22
  const werte = punkte.map(p => p.wert)
  // Achse auf „schöne“ Hunderter um die Daten
  const lo = Math.max(0, Math.floor((Math.min(...werte) - 20) / 100) * 100), hi = Math.min(1000, Math.max(lo + 100, Math.ceil((Math.max(...werte) + 20) / 100) * 100))
  const x = (i: number) => links + (punkte.length === 1 ? (B - links - rechts) / 2 : (i / (punkte.length - 1)) * (B - links - rechts))
  const y = (v: number) => oben + (1 - (v - lo) / (hi - lo)) * (hoehe - oben - unten)
  const linie = punkte.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.wert).toFixed(1)}`).join('')
  const letzter = punkte.length - 1
  const ticks = hi - lo <= 200 ? [lo, (lo + hi) / 2, hi] : [lo, lo + Math.round((hi - lo) / 200) * 100, hi]
  return (
    <div className="bt-dia" ref={kasten}>
      <svg viewBox={`0 0 ${B} ${hoehe}`} role="img" aria-label={`Verlauf: ${punkte.length} Werte von ${datum(punkte[0].tag)} bis ${datum(punkte[letzter].tag)}, zuletzt ${punkte[letzter].wert} ${einheit}`}
        onMouseMove={e => {
          const r = e.currentTarget.getBoundingClientRect()
          const px = (e.clientX - r.left) / r.width * B
          let i = 0
          for (let k = 1; k < punkte.length; k++) if (Math.abs(x(k) - px) < Math.abs(x(i) - px)) i = k
          setNah(i)
          zeige(e, <><b>{punkte[i].wert} {einheit}</b><br />{datum(punkte[i].tag)}</>)
        }} onMouseLeave={() => { setNah(null); weg() }}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={links} y1={y(t)} x2={B - rechts} y2={y(t)} stroke="var(--bt-viz-raster)" strokeWidth={1} />
            <text x={links - 6} y={y(t) + 3.5} textAnchor="end" className="bt-dia-achse">{t}</text>
          </g>
        ))}
        {punkte.length > 1 && <path d={`${linie}L${x(letzter).toFixed(1)},${y(lo)}L${x(0).toFixed(1)},${y(lo)}Z`} fill="var(--bt-viz-1)" opacity={0.1} />}
        {punkte.length > 1 && <path d={linie} fill="none" stroke="var(--bt-viz-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {nah !== null && <line x1={x(nah)} y1={oben} x2={x(nah)} y2={hoehe - unten} stroke="var(--bt-viz-grau)" strokeWidth={1} />}
        {nah !== null && nah !== letzter && <circle cx={x(nah)} cy={y(punkte[nah].wert)} r={4} fill="var(--bt-viz-1)" stroke="var(--bt-flaeche)" strokeWidth={2} />}
        <circle cx={x(letzter)} cy={y(punkte[letzter].wert)} r={4.5} fill="var(--bt-viz-1)" stroke="var(--bt-flaeche)" strokeWidth={2} />
        <text x={x(letzter) + 8} y={y(punkte[letzter].wert) + 4} className="bt-dia-wert">{punkte[letzter].wert}</text>
        <text x={links} y={hoehe - 5} className="bt-dia-achse">{kurzDatum(punkte[0].tag)}</text>
        {punkte.length > 1 && <text x={B - rechts} y={hoehe - 5} textAnchor="end" className="bt-dia-achse">{kurzDatum(punkte[letzter].tag)}</text>}
      </svg>
      {element}
    </div>
  )
}

// ── Kalender der letzten Wochen (eine Farbe, mehr = kräftiger) ────────────────
export function Kalender({ spalten }: { spalten: KalenderTag[][] }) {
  const { kasten, zeige, weg, element } = useTipp()
  const tage = ['Mo', '', 'Mi', '', 'Fr', '', 'So']
  return (
    <div className="bt-dia" ref={kasten}>
      <div className="bt-kalender" role="img" aria-label={`Übungstage der letzten ${spalten.length} Wochen: an ${spalten.flat().filter(t => t.n > 0).length} Tagen geübt`}>
        <div className="bt-kalender-tage">{tage.map((t, i) => <span key={i}>{t}</span>)}</div>
        {spalten.map((spalte, i) => (
          <div key={i} className="bt-kalender-spalte">
            {spalte.map(t => (
              <i key={t.tag} data-stufe={t.zukunft ? 'z' : t.stufe}
                onMouseMove={e => { if (!t.zukunft) zeige(e, <><b>{datum(t.tag)}</b><br />{t.n === 0 ? 'nicht geübt' : `${t.n} ${t.n === 1 ? 'Durchgang' : 'Durchgänge'}`}</>) }} onMouseLeave={weg} />
            ))}
          </div>
        ))}
      </div>
      <div className="bt-dia-legende" style={{ justifyContent: 'flex-end', marginTop: 8, marginBottom: 0 }}>
        <span>weniger</span>
        <span className="bt-kalender-skala">{[0, 1, 2, 3, 4].map(s => <i key={s} data-stufe={s} />)}</span>
        <span>mehr</span>
      </div>
      {element}
    </div>
  )
}

// ── IQ-Tests über die Zeit: Schätzwert als Punkt, Bereich als Strich ──────────
export interface IqPunkt { t: string; iq: number; von: number; bis: number; fragen: number }
export function IqVerlauf({ eintraege, breite = 560 }: { eintraege: IqPunkt[]; breite?: number }) {
  const { kasten, zeige, weg, element } = useTipp()
  const B = breite, H = 190, links = 34, rechts = 20, oben = 18, unten = 24
  const lo = 70, hi = 145
  const y = (v: number) => oben + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - oben - unten)
  const x = (i: number) => links + 24 + (eintraege.length === 1 ? (B - links - rechts - 48) / 2 : (i / (eintraege.length - 1)) * (B - links - rechts - 48))
  const tag = (t: string) => new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: '2-digit' })
  return (
    <div className="bt-dia" ref={kasten}>
      <svg viewBox={`0 0 ${B} ${H}`} role="img" aria-label={`Gespeicherte IQ-Tests: ${eintraege.map(e => `${tag(e.t)} Schätzwert ${e.iq}, Bereich ${e.von} bis ${e.bis}`).join('; ')}`} onMouseLeave={weg}>
        {[85, 100, 115, 130].map(v => (
          <g key={v}>
            <line x1={links} y1={y(v)} x2={B - rechts} y2={y(v)} stroke="var(--bt-viz-raster)" strokeWidth={1} />
            <text x={links - 6} y={y(v) + 3.5} textAnchor="end" className="bt-dia-achse">{v}</text>
          </g>
        ))}
        {eintraege.map((e, i) => (
          <g key={e.t} onMouseMove={ev => zeige(ev, <><b>IQ {iqText(e.iq)}</b> (Bereich {bereichText(e.von, e.bis)})<br />{tag(e.t)} · {e.fragen} Fragen</>)}>
            {/* großzügige unsichtbare Trefferfläche */}
            <rect x={x(i) - 14} y={oben} width={28} height={H - oben - unten} fill="transparent" />
            <line x1={x(i)} y1={y(e.von)} x2={x(i)} y2={y(e.bis)} stroke="var(--bt-viz-1)" strokeWidth={2} strokeLinecap="round" opacity={0.45} />
            <circle cx={x(i)} cy={y(e.iq)} r={5} fill="var(--bt-viz-1)" stroke="var(--bt-flaeche)" strokeWidth={2} />
            {(i === eintraege.length - 1 || eintraege.length <= 6) && <text x={x(i)} y={y(e.bis) - 6} textAnchor="middle" className="bt-dia-wert">{e.iq}</text>}
            {(eintraege.length <= 8 || i === 0 || i === eintraege.length - 1) && <text x={x(i)} y={H - 6} textAnchor="middle" className="bt-dia-achse">{tag(e.t)}</text>}
          </g>
        ))}
      </svg>
      {element}
    </div>
  )
}
