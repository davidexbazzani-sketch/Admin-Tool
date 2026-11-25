// Zeichnet Szenen (kleine SVG-Figuren im Raum 0..100) und alles, was eine Aufgabe zeigen kann.
// Farben kommen nur aus den Brain-Trainer-Variablen (--bt-…), hell und dunkel getrennt gepflegt.
import { useId } from 'react'
import type { Darstellung, Form, Szene } from '../kern/typen'

const TON = ['var(--bt-ink)', 'var(--bt-akzent)', 'var(--bt-akzent2)', 'var(--bt-leise)'] as const

/** Ab dieser Länge gilt ein Aufgabentext als Fließtext (kleiner, im Kasten). Kürzeres — auch eine
 *  Wort-Gleichung wie „Meteorologe : Wetter = Seismologe : ?“ — steht groß und frei. */
const LANG_AB = 46

const eck = (n: number, r: number, start = -90): string =>
  Array.from({ length: n }, (_, i) => {
    const w = (start + (360 / n) * i) * Math.PI / 180
    return `${(r * Math.cos(w)).toFixed(2)},${(r * Math.sin(w)).toFixed(2)}`
  }).join(' ')

const stern = (ra: number, ri: number): string =>
  Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? ra : ri
    const w = (-90 + 36 * i) * Math.PI / 180
    return `${(r * Math.cos(w)).toFixed(2)},${(r * Math.sin(w)).toFixed(2)}`
  }).join(' ')

function FormBild({ f, muster }: { f: Form; muster: string }) {
  const farbe = TON[f.ton ?? 0]
  const dick = f.dick ?? 3
  const g = f.g ?? 30
  const r = g / 2
  const fuell = f.fuell ?? 'leer'
  const fill = fuell === 'voll' ? farbe : fuell === 'halb' ? farbe : fuell === 'schraffur' ? `url(#${muster}-${f.ton ?? 0})` : 'none'
  const stil = {
    fill, fillOpacity: fuell === 'halb' ? 0.32 : 1,
    stroke: farbe, strokeWidth: dick, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const,
    strokeDasharray: f.strich ? `${dick * 1.6} ${dick * 1.8}` : undefined,
  }

  if (f.typ === 'linie') {
    return <line x1={f.x} y1={f.y} x2={f.x2 ?? f.x} y2={f.y2 ?? f.y} {...stil} fill="none"
      transform={f.dreh ? `rotate(${f.dreh} ${(f.x + (f.x2 ?? f.x)) / 2} ${(f.y + (f.y2 ?? f.y)) / 2})` : undefined} />
  }
  if (f.typ === 'pfad') {
    const t = `${f.dreh ? `rotate(${f.dreh} ${f.x} ${f.y}) ` : ''}${f.spiegel ? `translate(${2 * f.x} 0) scale(-1 1)` : ''}`.trim()
    return <path d={f.d ?? ''} {...stil} transform={t || undefined} />
  }
  const t = `translate(${f.x} ${f.y})${f.dreh ? ` rotate(${f.dreh})` : ''}${f.spiegel ? ' scale(-1 1)' : ''}`
  switch (f.typ) {
    case 'kreis': return <circle r={r} {...stil} transform={t} />
    case 'ring': return <g transform={t}><circle r={r} {...stil} /><circle r={r * 0.45} {...stil} /></g>
    case 'punkt': return <circle r={(f.g ?? 9) / 2} fill={farbe} transform={t} />
    case 'quadrat': return <rect x={-r} y={-r} width={g} height={g} rx={f.eckig ? 0 : g * 0.06} {...stil} strokeLinejoin={f.eckig ? 'miter' : 'round'} transform={t} />
    case 'rechteck': return <rect x={-(f.b ?? g) / 2} y={-(f.h ?? g) / 2} width={f.b ?? g} height={f.h ?? g} rx={f.eckig ? 0 : 1.5} {...stil} strokeLinejoin={f.eckig ? 'miter' : 'round'} transform={t} />
    case 'dreieck': return <polygon points={eck(3, r * 1.12)} {...stil} transform={`${t} translate(0 ${r * 0.14})`} />
    case 'raute': return <polygon points={`0,${-r} ${r * 0.72},0 0,${r} ${-r * 0.72},0`} {...stil} transform={t} />
    case 'sechseck': return <polygon points={eck(6, r)} {...stil} transform={t} />
    case 'fuenfeck': return <polygon points={eck(5, r * 1.04)} {...stil} transform={t} />
    case 'stern': return <polygon points={stern(r * 1.08, r * 0.46)} {...stil} transform={t} />
    case 'kreuz': {
      const a = r, b = r / 3
      return <polygon points={`${-b},${-a} ${b},${-a} ${b},${-b} ${a},${-b} ${a},${b} ${b},${b} ${b},${a} ${-b},${a} ${-b},${b} ${-a},${b} ${-a},${-b} ${-b},${-b}`} {...stil} transform={t} />
    }
    case 'pfeil': {
      // zeigt nach oben; Schaft + Spitze — eindeutig gerichtet, damit Drehungen erkennbar sind
      const k = r, s = r * 0.26
      return <polygon points={`0,${-k} ${k * 0.72},${-k * 0.1} ${s},${-k * 0.1} ${s},${k} ${-s},${k} ${-s},${-k * 0.1} ${-k * 0.72},${-k * 0.1}`} {...stil} transform={t} />
    }
    case 'text':
      return <text x={0} y={0} transform={t} fontSize={f.g ?? 28} fontWeight={600} textAnchor="middle" dominantBaseline="central"
        fill={farbe} style={{ fontFamily: 'var(--bt-schrift)' }}>{f.text}</text>
    default: return null
  }
}

export function SzeneBild({ szene, className, titel }: { szene: Szene; className?: string; titel?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const vb = szene.vb ?? 100
  const brauchtMuster = szene.elemente.some(e => e.fuell === 'schraffur')
  return (
    <svg viewBox={`0 0 ${vb} ${vb}`} className={className} role="img" aria-label={titel ?? 'Figur'} preserveAspectRatio="xMidYMid meet">
      {brauchtMuster && (
        <defs>
          {TON.map((farbe, i) => (
            <pattern key={i} id={`${id}-${i}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="7" stroke={farbe} strokeWidth="2.6" />
            </pattern>
          ))}
        </defs>
      )}
      {szene.elemente.map((f, i) => <FormBild key={i} f={f} muster={id} />)}
    </svg>
  )
}

/** Alles, was eine Aufgabe oder eine Auswahl zeigen kann. `rolle`: Aufgabe (groß) oder Auswahl (klein). */
export function Zeige({ d, rolle = 'aufgabe' }: { d: Darstellung; rolle?: 'aufgabe' | 'auswahl' }) {
  switch (d.art) {
    case 'text':
      return <span className={`bt-z-text ${d.klein ? 'bt-z-klein' : ''} ${rolle === 'aufgabe' ? 'bt-z-gross' : ''} ${rolle === 'aufgabe' && (d.text.length > LANG_AB || d.text.includes('\n')) ? 'bt-z-lang' : ''}`}>{d.text}</span>
    case 'szene':
      return <SzeneBild szene={d.szene} className={rolle === 'aufgabe' ? 'bt-z-szene-gross' : 'bt-z-szene'} />
    case 'matrix':
      return (
        <div className="bt-z-matrix" role="img" aria-label="3 mal 3 Matrix, ein Feld fehlt">
          {d.zellen.map((z, i) => (
            <div key={i} className={`bt-z-zelle ${z ? '' : 'bt-z-luecke'}`}>
              {z ? <SzeneBild szene={z} className="bt-z-voll" /> : <span>?</span>}
            </div>
          ))}
        </div>
      )
    case 'folge':
      return (
        <div className="bt-z-folge">
          {d.teile.map((t, i) => (
            <div key={i} className={`bt-z-glied ${t === null ? 'bt-z-luecke' : ''} ${typeof t === 'string' ? 'bt-z-zahl' : ''}`}>
              {t === null ? <span>?</span> : typeof t === 'string' ? <span>{t}</span> : <SzeneBild szene={t} className="bt-z-voll" />}
            </div>
          ))}
        </div>
      )
    case 'schritte':
      return (
        <div className="bt-z-schritte">
          {d.teile.map((t, i) => (
            <div key={i} className="bt-z-schritt">
              {i > 0 && <span className="bt-z-pfeil" aria-hidden="true">→</span>}
              <div className="bt-z-schrittbild">
                <SzeneBild szene={t} className="bt-z-voll" />
                {d.texte?.[i] && <span className="bt-z-schritttext">{d.texte[i]}</span>}
              </div>
            </div>
          ))}
        </div>
      )
  }
}
