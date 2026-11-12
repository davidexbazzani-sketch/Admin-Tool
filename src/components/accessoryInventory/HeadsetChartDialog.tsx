// ── Headset Vergabe – „Chart anzeigen": Verlauf & Tendenz ─────────────────────
// Balken = ausgegebene Headsets je Monat/Quartal (eine Achse, eine Einheit), Linie = gleitender Ø,
// gestrichelt = Trendgerade über die abgeschlossenen Zeiträume, in die Zukunft verlängert.
// Farben: validierte Kategorie-Palette (--viz-1 blau = Ausgaben, --viz-2 orange = Trend),
// Ø-Linie in neutraler Schriftfarbe. Rechenlogik: services/headsetTrend.ts.

import { useMemo, useState } from 'react'
import { X, BarChart3, TrendingUp, TrendingDown, Minus, Table2 } from 'lucide-react'
import type { HeadsetVergabe } from '../../services/headsetVergabe'
import { werteHeadsetsAus, type Periode, type Raster } from '../../services/headsetTrend'

type Zeitraum = 12 | 24 | 36 | 0
const BAR = 'var(--viz-1)', TREND = 'var(--viz-2)'
const zahl = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 })

/** Gut lesbare, ganzzahlige Achsenschritte bis einschließlich ≥ Maximum. */
function schritte(max: number, n = 4): number[] {
  if (max <= 0) return [0, 1]
  const roh = max / n
  const p = Math.pow(10, Math.floor(Math.log10(roh)))
  const s = Math.max(1, [1, 2, 5, 10].map(f => f * p).find(x => x >= roh) || roh)
  const out: number[] = []
  for (let v = 0; ; v += s) { out.push(Math.round(v)); if (v >= max) break }
  return out
}
/** Balken mit 4-px-Rundung nur am Datenende. */
function balken(x: number, w: number, y0: number, y1: number): string {
  if (Math.abs(y1 - y0) < 0.5) return ''
  const r = Math.min(4, w / 2, Math.abs(y1 - y0))
  return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`
}

export default function HeadsetChartDialog({ eintraege, gesamt, gefiltert, onClose }: {
  eintraege: HeadsetVergabe[]; gesamt: number; gefiltert: boolean; onClose: () => void
}) {
  const [zeitraum, setZeitraum] = useState<Zeitraum>(24)
  const [raster, setRaster] = useState<Raster>('monat')
  const [tabelle, setTabelle] = useState(false)
  const a = useMemo(() => werteHeadsetsAus(eintraege, raster, zeitraum), [eintraege, raster, zeitraum])
  const einheit = raster === 'monat' ? 'Monat' : 'Quartal'
  const aenderung = a.vorige12 ? Math.round(((a.letzte12 - a.vorige12) / a.vorige12) * 100) : null
  const erwartetText = raster === 'monat' ? `nächste ${a.erwartetPerioden} Monate` : a.erwartetPerioden === 1 ? 'nächstes Quartal' : `nächste ${a.erwartetPerioden} Quartale`
  const erwartetSatz = raster === 'monat' ? `die nächsten ${a.erwartetPerioden} Monate` : a.erwartetPerioden === 1 ? 'das nächste Quartal' : `die nächsten ${a.erwartetPerioden} Quartale`
  const laufendText = raster === 'monat' ? 'der laufende Monat zählt' : 'das laufende Quartal zählt'
  const zeitraumText = zeitraum ? `letzte ${zeitraum} Monate` : 'gesamter Verlauf'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-[1020px] max-w-full max-h-[94vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()} data-headset-chart>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border flex-wrap">
          <BarChart3 size={16} className="text-primary" />
          <h2 className="text-base font-semibold text-foreground">Headset-Vergabe — Verlauf</h2>
          <div className="ml-4 flex rounded-md border border-border overflow-hidden text-[11px]">
            {([[12, '12 Monate'], [24, '24 Monate'], [36, '36 Monate'], [0, 'Alles']] as [Zeitraum, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setZeitraum(k)} className={`px-2.5 py-1 ${zeitraum === k ? 'bg-primary/15 text-foreground font-semibold' : 'text-muted-foreground hover:bg-accent/30'}`}>{l}</button>
            ))}
          </div>
          <div className="flex rounded-md border border-border overflow-hidden text-[11px]">
            {([['monat', 'je Monat'], ['quartal', 'je Quartal']] as [Raster, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setRaster(k)} data-raster={k} className={`px-2.5 py-1 ${raster === k ? 'bg-primary/15 text-foreground font-semibold' : 'text-muted-foreground hover:bg-accent/30'}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => setTabelle(x => !x)} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] ${tabelle ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            <Table2 size={12} />Tabelle
          </button>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {gefiltert && (
            <p className="text-[11px] text-amber-500">Es gilt die aktuelle Auswahl der Liste: {eintraege.length} von {gesamt} Einträgen (Suche/Filter gesetzt).</p>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Kachel titel="Ausgegeben (letzte 12 Mon.)" wert={String(a.letzte12)} farbe={BAR}
              unter={`Ø ${zahl(a.letzte12 / 12)}/Monat${aenderung !== null ? ` · ${aenderung > 0 ? '+' : aenderung < 0 ? '−' : '±'}${Math.abs(aenderung)} % ggü. den 12 Monaten davor (${a.vorige12})` : ''}`} />
            <div className="rounded-lg border border-border p-3" data-tendenz={a.richtung}>
              <p className="text-[11px] text-muted-foreground">Tendenz ({zeitraumText})</p>
              <p className="flex items-center gap-1.5 text-xl font-semibold text-foreground">
                {a.richtung === 'steigend' ? <TrendingUp size={18} /> : a.richtung === 'fallend' ? <TrendingDown size={18} /> : <Minus size={18} />}
                {a.richtung === 'unklar' ? 'noch offen' : a.richtung}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {a.trendVon !== null && a.trendBis !== null ? `Trendlinie: ca. ${zahl(a.trendVon)} → ${zahl(a.trendBis)} pro ${einheit}` : 'zu wenig abgeschlossene Zeiträume'}
              </p>
            </div>
            <Kachel titel={`Erwartet (${erwartetText})`} wert={a.erwartet !== null ? `ca. ${a.erwartet}` : '—'} farbe={TREND}
              unter={a.erwartet !== null ? 'nach der Trendlinie — eine Orientierung, keine Planung' : 'erst ab genug Verlauf'} />
          </div>

          <p className="text-[12px] text-foreground rounded-md border border-border bg-background/50 px-3 py-2" data-headset-satz>
            In den letzten 12 Monaten wurden <b>{a.letzte12} Headsets</b> ausgegeben (Ø {zahl(a.letzte12 / 12)} pro Monat)
            {aenderung !== null && aenderung !== 0 && <> — <b>{Math.abs(aenderung)} % {aenderung > 0 ? 'mehr' : 'weniger'}</b> als in den 12 Monaten davor ({a.vorige12})</>}
            {aenderung === 0 && <> — genauso viele wie in den 12 Monaten davor</>}.
            {a.richtung === 'steigend' && <> Tendenz im gewählten Zeitraum: <b>steigend</b> — die Trendlinie geht von ca. {zahl(a.trendVon!)} auf ca. {zahl(a.trendBis!)} pro {einheit}.</>}
            {a.richtung === 'fallend' && <> Tendenz im gewählten Zeitraum: <b>fallend</b> — die Trendlinie sinkt von ca. {zahl(a.trendVon!)} auf ca. {zahl(a.trendBis!)} pro {einheit}.</>}
            {a.richtung === 'stabil' && <> Tendenz im gewählten Zeitraum: <b>etwa gleichbleibend</b> (ca. {zahl(a.trendBis!)} pro {einheit}).</>}
            {a.erwartet !== null && <> Erwartet für {erwartetSatz}: ca. {a.erwartet}.</>}
          </p>

          {tabelle ? <Tabelle perioden={a.perioden} /> : (
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-4 mb-1 text-[11px] text-muted-foreground flex-wrap">
                <span className="font-semibold text-foreground">Ausgegebene Headsets je {einheit}</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: BAR }} />ausgegeben</span>
                <span className="inline-flex items-center gap-1.5"><svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" className="stroke-foreground" strokeWidth={2} /></svg>Ø {raster === 'monat' ? '3 Monate' : '2 Quartale'}</span>
                <span className="inline-flex items-center gap-1.5"><svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={TREND} strokeWidth={2} strokeDasharray="4 3" /></svg>Trend</span>
                <span className="inline-flex items-center gap-1.5"><svg width="12" height="12"><defs><pattern id="hs-leg" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" fill={BAR} /></pattern></defs><rect width="12" height="12" rx="2" fill="url(#hs-leg)" /></svg>läuft noch</span>
              </div>
              <VerlaufChart perioden={a.perioden} raster={raster} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Liste titel="Nach Grund (letzte 12 Monate)" leer="keine Ausgaben" werte={a.gruende12.map(([k, v]) => [k, String(v)])} />
            <div className="rounded-lg border border-border p-3 text-[11px] text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">So wird gerechnet</p>
              <p>Gezählt wird jede erfasste Headset-Übergabe am Übergabedatum (ServiceNow-Import, Checklisten, von Hand). Daten ab {a.ersteMonat.slice(5, 7)}/{a.ersteMonat.slice(0, 4)}{a.ohneDatum ? `; ${a.ohneDatum} ohne Datum nicht gezählt` : ''}.</p>
              <p>Die Trendlinie ist eine Ausgleichsgerade über die abgeschlossenen {raster === 'monat' ? 'Monate' : 'Quartale'} des gewählten Zeitraums; {laufendText} nicht mit, weil {raster === 'monat' ? 'er' : 'es'} noch nicht vollständig ist.</p>
              <p>Importierte Tickets haben keinen Grund („unbekannt“).</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Kachel({ titel, wert, unter, farbe }: { titel: string; wert: string; unter: string; farbe?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{farbe && <span className="w-2.5 h-2.5 rounded-sm" style={{ background: farbe }} />}{titel}</p>
      <p className="text-xl font-semibold text-foreground">{wert}</p>
      <p className="text-[11px] text-muted-foreground">{unter}</p>
    </div>
  )
}
function Liste({ titel, werte, leer }: { titel: string; werte: [string, string][]; leer: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] font-semibold text-foreground mb-1">{titel}</p>
      {werte.length ? werte.map(([k, v]) => <p key={k} className="flex justify-between text-[11px]"><span className="text-foreground truncate">{k}</span><span className="text-muted-foreground">{v}</span></p>)
        : <p className="text-[11px] text-muted-foreground">{leer}</p>}
    </div>
  )
}

function VerlaufChart({ perioden, raster }: { perioden: Periode[]; raster: Raster }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 960, H = 300, L = 36, R = 10, O = 12, U = 30
  const max = Math.max(1, ...perioden.map(p => Math.max(p.anzahl, p.schnitt ?? 0, p.trend ?? 0)))
  const tk = schritte(max)
  const oben = tk[tk.length - 1]
  const basis = H - U
  const y = (v: number) => basis - (v / oben) * (basis - O)
  const slot = (W - L - R) / Math.max(perioden.length, 1)
  const bw = Math.max(2, Math.min(30, slot * 0.62))
  const xm = (i: number) => L + slot * i + slot / 2
  const jedes = Math.max(1, Math.ceil(perioden.length / 18))
  const ersteZukunft = perioden.findIndex(p => p.zukunft)
  const h = hover !== null ? perioden[hover] : null
  const jahrAnfang = (p: Periode) => raster === 'monat' ? p.key.endsWith('-01') : p.key.endsWith('Q1')

  const schnittPunkte = perioden.map((p, i) => p.schnitt !== undefined ? `${xm(i)},${y(p.schnitt)}` : null)
  // Ø-Linie in zusammenhängenden Stücken (am Anfang fehlen Werte)
  const stuecke: string[][] = []
  schnittPunkte.forEach(pt => { if (!pt) { stuecke.push([]); return } if (!stuecke.length) stuecke.push([]); stuecke[stuecke.length - 1].push(pt) })
  const trendPunkte = perioden.map((p, i) => p.trend !== undefined ? `${xm(i)},${y(p.trend)}` : '').filter(Boolean)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" onMouseLeave={() => setHover(null)} data-headset-verlauf>
        <defs>
          <pattern id="hs-laufend" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill={BAR} opacity={0.25} /><rect width="2.5" height="5" fill={BAR} /></pattern>
        </defs>
        {ersteZukunft >= 0 && <rect x={L + slot * ersteZukunft} y={O} width={W - R - L - slot * ersteZukunft} height={basis - O} className="fill-accent" opacity={0.25} />}
        {ersteZukunft >= 0 && <text x={L + slot * ersteZukunft + 4} y={O + 10} className="fill-muted-foreground text-[10px]">Erwartung</text>}
        {tk.map(v => (
          <g key={v}>
            {v > 0 && <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray="2 4" />}
            <text x={L - 6} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">{v}</text>
          </g>
        ))}
        {hover !== null && <rect x={L + slot * hover} y={O} width={slot} height={basis - O} className="fill-accent" opacity={0.35} />}
        {perioden.map((p, i) => (
          <path key={p.key} d={balken(xm(i) - bw / 2, bw, basis, y(p.anzahl))} fill={p.laufend ? 'url(#hs-laufend)' : BAR}
            opacity={hover === null || hover === i ? 1 : 0.6} />
        ))}
        <line x1={L} x2={W - R} y1={basis} y2={basis} className="stroke-muted-foreground" strokeOpacity={0.6} />
        {stuecke.filter(s => s.length > 1).map((s, k) => (
          <polyline key={k} points={s.join(' ')} fill="none" className="stroke-foreground" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {trendPunkte.length > 1 && <polyline points={trendPunkte.join(' ')} fill="none" stroke={TREND} strokeWidth={2} strokeDasharray="6 4" />}
        {hover !== null && h?.schnitt !== undefined && <circle cx={xm(hover)} cy={y(h.schnitt)} r={4} className="fill-foreground stroke-card" strokeWidth={2} />}
        {hover !== null && h?.trend !== undefined && <circle cx={xm(hover)} cy={y(h.trend)} r={4} fill={TREND} className="stroke-card" strokeWidth={2} />}
        {perioden.map((p, i) => (i % jedes === 0 || jahrAnfang(p)) && (
          <text key={p.key} x={xm(i)} y={basis + 14} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {p.kurz}{(jahrAnfang(p) || i === 0) ? ` ${p.jahr.slice(2)}` : ''}
          </text>
        ))}
        {perioden.map((p, i) => <rect key={p.key} x={L + slot * i} y={O} width={slot} height={basis - O} fill="transparent" onMouseEnter={() => setHover(i)} data-periode={p.key} />)}
      </svg>
      {h && hover !== null && <Tooltip p={h} raster={raster} links={hover > perioden.length / 2} />}
    </div>
  )
}

function Tooltip({ p, raster, links }: { p: Periode; raster: Raster; links: boolean }) {
  const gruende = Object.entries(p.gruende).sort((a, b) => b[1] - a[1])
  const namen = p.namen.length ? p.namen.slice(0, 5).join(', ') + (p.namen.length > 5 ? ` … (+${p.namen.length - 5})` : '') : ''
  return (
    <div className={`absolute top-2 ${links ? 'left-12' : 'right-2'} max-w-[340px] rounded-md border border-border bg-card/95 px-2.5 py-1.5 text-[11px] shadow-lg pointer-events-none`} data-headset-tooltip>
      <p className="font-semibold text-foreground">{p.lang}{p.laufend ? ' (läuft noch)' : p.zukunft ? ' (Erwartung)' : ''}</p>
      {!p.zukunft && <p className="flex items-center gap-1.5 text-foreground"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: BAR }} />Ausgegeben: <b>{p.anzahl}</b>{p.laufend ? ' bisher' : ''}</p>}
      {p.schnitt !== undefined && <p className="text-foreground">Ø {raster === 'monat' ? '3 Monate' : '2 Quartale'}: {zahl(p.schnitt)}</p>}
      {p.trend !== undefined && <p className="flex items-center gap-1.5 text-foreground"><span className="w-2.5 h-0.5" style={{ background: TREND }} />Trend: {zahl(p.trend)}</p>}
      {gruende.length > 0 && <p className="text-muted-foreground">{gruende.map(([g, n]) => `${g}: ${n}`).join(' · ')}</p>}
      {namen && <p className="text-muted-foreground">{namen}</p>}
    </div>
  )
}

function Tabelle({ perioden }: { perioden: Periode[] }) {
  return (
    <div className="rounded-lg border border-border overflow-auto max-h-[420px]">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-card"><tr className="text-left text-muted-foreground border-b border-border">
          <th className="px-2 py-1.5 font-medium">Zeitraum</th><th className="px-2 py-1.5 font-medium text-right">Ausgegeben</th>
          <th className="px-2 py-1.5 font-medium text-right">Ø gleitend</th><th className="px-2 py-1.5 font-medium text-right">Trend</th>
          <th className="px-2 py-1.5 font-medium">Gründe</th>
        </tr></thead>
        <tbody>
          {[...perioden].reverse().map(p => (
            <tr key={p.key} className="border-b border-border/50">
              <td className="px-2 py-1 text-foreground">{p.lang}{p.laufend ? ' · läuft noch' : p.zukunft ? ' · Erwartung' : ''}</td>
              <td className="px-2 py-1 text-right text-foreground">{p.zukunft ? '—' : p.anzahl}</td>
              <td className="px-2 py-1 text-right text-muted-foreground">{p.schnitt !== undefined ? zahl(p.schnitt) : '—'}</td>
              <td className="px-2 py-1 text-right text-muted-foreground">{p.trend !== undefined ? zahl(p.trend) : '—'}</td>
              <td className="px-2 py-1 text-muted-foreground">{Object.entries(p.gruende).map(([g, n]) => `${g}: ${n}`).join(' · ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
