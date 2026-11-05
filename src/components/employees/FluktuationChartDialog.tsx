// ── Mitarbeiterverwaltung – „Ein- & Austritte" ────────────────────────────────
// Chart 1: gespiegelte Monatsbalken — Eintritte nach oben, Austritte nach unten (eine Achse,
//          gleiche Einheit). Zukunft: eingetragene Termine gestreift, Prognose gestrichelt.
// Chart 2: Saldo (Eintritte − Austritte) — je Monat / gleitend 12 Monate / kumuliert.
// Farben: validierte Kategorie-Palette (--viz-1 blau = Eintritte, --viz-2 orange = Austritte).

import { useMemo, useState } from 'react'
import { X, BarChart3, TrendingUp, TrendingDown, Minus, Table2 } from 'lucide-react'
import type { Employee, Departure } from '../../services/employees'
import { werteAus, MONATSNAMEN, type MonatsWert } from '../../services/fluktuation'

type Zeitraum = 12 | 24 | 36 | 0
type SaldoArt = 'monat' | 'gleitend' | 'kumuliert'

const EIN = 'var(--viz-1)', AUS = 'var(--viz-2)'
const monatKurz = (ym: string) => MONATSNAMEN[Number(ym.slice(5)) - 1]
const monatLang = (ym: string) => `${monatKurz(ym)} ${ym.slice(0, 4)}`
const vz = (n: number) => (n > 0 ? `+${n}` : String(n))
const zahl = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 })

/** Gut lesbare Achsenschritte für Personenzahlen (ganzzahlig). */
function schritte(max: number, n = 4): number[] {
  if (max <= 0) return [0]
  const roh = max / n
  const p = Math.pow(10, Math.floor(Math.log10(roh)))
  const s = Math.max(1, [1, 2, 5, 10].map(f => f * p).find(x => x >= roh) || roh)
  const out: number[] = []
  // bis einschließlich des ersten Schritts ≥ Maximum — sonst ragt der größte Wert über die Achse
  for (let v = 0; ; v += s) { out.push(Math.round(v)); if (v >= max) break }
  return out
}

/** Balken mit 4-px-Rundung nur am Datenende (Basis bleibt gerade). */
function balken(x: number, w: number, y0: number, y1: number): string {
  const r = Math.min(4, w / 2, Math.abs(y1 - y0))
  if (Math.abs(y1 - y0) < 0.5) return ''
  if (y1 < y0) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`
}

export default function FluktuationChartDialog({ employees, departures, onClose }: { employees: Employee[]; departures: Departure[]; onClose: () => void }) {
  const [zeitraum, setZeitraum] = useState<Zeitraum>(24)
  const [saldoArt, setSaldoArt] = useState<SaldoArt>('gleitend')
  const [tabelle, setTabelle] = useState(false)
  const a = useMemo(() => werteAus(employees, departures), [employees, departures])
  const sicht = useMemo(() => {
    if (!zeitraum) return a.monate
    const jetzt = a.monate.findIndex(m => m.zukunft)
    const bisHeute = jetzt < 0 ? a.monate.length : jetzt
    return a.monate.slice(Math.max(0, bisHeute - zeitraum))
  }, [a, zeitraum])

  const t = a.trend
  const aenderung = (jetzt: number, vorher: number) => vorher ? Math.round(((jetzt - vorher) / vorher) * 100) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-[1020px] max-w-full max-h-[94vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <BarChart3 size={16} className="text-primary" />
          <h2 className="text-base font-semibold text-foreground">Ein- &amp; Austritte</h2>
          {/* Filter in einer Zeile über den Charts */}
          <div className="ml-4 flex rounded-md border border-border overflow-hidden text-[11px]">
            {([[12, '12 Monate'], [24, '24 Monate'], [36, '36 Monate'], [0, 'Alles']] as [Zeitraum, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setZeitraum(k)} className={`px-2.5 py-1 ${zeitraum === k ? 'bg-primary/15 text-foreground font-semibold' : 'text-muted-foreground hover:bg-accent/30'}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => setTabelle(x => !x)} className={`ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] ${tabelle ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            <Table2 size={12} />Tabelle
          </button>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Kennzahlen */}
          <div className="grid grid-cols-4 gap-3">
            <Kachel titel="Eintritte (letzte 12 Mon.)" wert={String(a.letzte12.ein)} farbe={EIN}
              unter={`Ø ${zahl(a.schnitt12.ein)}/Monat${aenderung(a.letzte12.ein, a.vorige12.ein) !== null ? ` · ${vz(aenderung(a.letzte12.ein, a.vorige12.ein)!)} % ggü. Vorjahr` : ''}`} />
            <Kachel titel="Austritte (letzte 12 Mon.)" wert={String(a.letzte12.aus)} farbe={AUS}
              unter={`Ø ${zahl(a.schnitt12.aus)}/Monat${aenderung(a.letzte12.aus, a.vorige12.aus) !== null ? ` · ${vz(aenderung(a.letzte12.aus, a.vorige12.aus)!)} % ggü. Vorjahr` : ''}`} />
            <div className="rounded-lg border border-border p-3">
              <p className="text-[11px] text-muted-foreground">Saldo (letzte 12 Mon.)</p>
              <p className="text-xl font-semibold text-foreground">{vz(t.saldo12)}</p>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {t.richtung === 'steigend' ? <TrendingUp size={12} /> : t.richtung === 'fallend' ? <TrendingDown size={12} /> : <Minus size={12} />}
                {t.richtung === 'unklar' ? 'Tendenz: noch zu wenig Verlauf' : `Tendenz ${t.richtung === 'gleich' ? 'stabil' : t.richtung}${t.saldo12VorHalbjahr !== null ? ` (vor 6 Mon.: ${vz(t.saldo12VorHalbjahr)})` : ''}`}
              </p>
            </div>
            <Kachel titel="Schon eingetragen (nächste 90 Tage)" wert={`${a.naechste90.ein} / ${a.naechste90.aus}`} unter="Eintritte / Austritte" />
          </div>

          <p className="text-[12px] text-foreground rounded-md border border-border bg-background/50 px-3 py-2">
            {t.saldo12 > 0 ? <>In den letzten 12 Monaten wurde <b>mehr eingestellt als ausgetreten</b> ({a.letzte12.ein} Eintritte, {a.letzte12.aus} Austritte → {vz(t.saldo12)}).</>
              : t.saldo12 < 0 ? <>In den letzten 12 Monaten sind <b>mehr ausgetreten als eingestellt</b> wurden ({a.letzte12.aus} Austritte, {a.letzte12.ein} Eintritte → {vz(t.saldo12)}).</>
              : <>In den letzten 12 Monaten halten sich Ein- und Austritte <b>die Waage</b> ({a.letzte12.ein} : {a.letzte12.aus}).</>}
            {t.richtung === 'steigend' && (t.saldo12 > 0 ? ' Tendenz: Der Überschuss an Eintritten wächst.' : ' Tendenz: Die Lücke wird kleiner — Eintritte holen gegenüber den Austritten auf.')}
            {t.richtung === 'fallend' && (t.saldo12 > 0 ? ' Tendenz: Der Überschuss an Eintritten schrumpft — Austritte holen auf.' : ' Tendenz: Die Lücke wächst — es gehen zunehmend mehr als dazukommen.')}
            {t.richtung === 'gleich' && ' Gegenüber vor einem halben Jahr ist das Verhältnis etwa gleich geblieben.'}
          </p>

          {tabelle ? <Tabelle monate={sicht} /> : (
            <>
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-4 mb-1 text-[11px] text-muted-foreground flex-wrap">
                  <span className="font-semibold text-foreground">Eintritte und Austritte je Monat</span>
                  <Legende farbe={EIN} text="Eintritte (oben)" />
                  <Legende farbe={AUS} text="Austritte (unten)" />
                  <span className="inline-flex items-center gap-1.5"><svg width="12" height="12"><rect width="12" height="12" rx="2" fill="url(#leg-schraffur)" stroke="currentColor" strokeOpacity={0.5} /><defs><pattern id="leg-schraffur" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" fill="currentColor" opacity={0.6} /></pattern></defs></svg>schon eingetragen</span>
                  <span className="inline-flex items-center gap-1.5"><svg width="12" height="12"><rect x="1" y="1" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeDasharray="2 2" /></svg>Prognose</span>
                </div>
                <BalkenChart monate={sicht} />
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-3 mb-1 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Saldo: Eintritte − Austritte</span>
                  <div className="flex rounded-md border border-border overflow-hidden">
                    {([['monat', 'je Monat'], ['gleitend', 'gleitend 12 Monate'], ['kumuliert', 'kumuliert']] as [SaldoArt, string][]).map(([k, l]) => (
                      <button key={k} onClick={() => setSaldoArt(k)} className={`px-2 py-0.5 ${saldoArt === k ? 'bg-primary/15 text-foreground font-semibold' : 'hover:bg-accent/30'}`}>{l}</button>
                    ))}
                  </div>
                  <span>über null = mehr eingestellt als ausgetreten · unter null = umgekehrt</span>
                </div>
                <SaldoChart monate={sicht.filter(m => !m.zukunft || saldoArt === 'monat')} art={saldoArt} />
              </div>
            </>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Liste titel="Starke Eintrittsmonate (Ø)" leer="ab 12 Monaten Verlauf" werte={a.saisonEin.map(s => [MONATSNAMEN[s.monat - 1], zahl(s.schnitt)])} />
            <Liste titel="Starke Austrittsmonate (Ø)" leer="ab 12 Monaten Verlauf" werte={a.saisonAus.map(s => [MONATSNAMEN[s.monat - 1], zahl(s.schnitt)])} />
            <Liste titel="Eintritte nach Abteilung (12 Mon.)" leer="keine" werte={a.abteilungen.map(x => [x.name, String(x.anzahl)])} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Grundlage: Eintrittsdatum der neuen Mitarbeiter und Austrittsdatum der Austritte in der Mitarbeiterverwaltung (Daten ab {monatLang(a.ersterMonat)};
            gelöschte Einträge fehlen{a.ohneDatum ? `; ${a.ohneDatum} ohne Datum nicht gezählt` : ''}). Prognose je Monat = Mittel aus dem Durchschnitt der letzten 12 Monate
            und demselben Monat der Vorjahre — mindestens die schon eingetragenen Termine. Eine Orientierung, keine Planung.
          </p>
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
const Legende = ({ farbe, text }: { farbe: string; text: string }) => <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: farbe }} />{text}</span>
function Liste({ titel, werte, leer }: { titel: string; werte: [string, string][]; leer: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] font-semibold text-foreground mb-1">{titel}</p>
      {werte.length ? werte.map(([k, v]) => <p key={k} className="flex justify-between text-[11px]"><span className="text-foreground truncate">{k}</span><span className="text-muted-foreground">{v}</span></p>)
        : <p className="text-[11px] text-muted-foreground">{leer}</p>}
    </div>
  )
}

// ── Chart 1: gespiegelte Balken ───────────────────────────────────────────────
function BalkenChart({ monate }: { monate: MonatsWert[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 960, H = 300, L = 40, R = 10, O = 10, U = 30
  const maxEin = Math.max(1, ...monate.map(m => Math.max(m.ein, m.prognoseEin ?? 0)))
  const maxAus = Math.max(1, ...monate.map(m => Math.max(m.aus, m.prognoseAus ?? 0)))
  const max = Math.max(maxEin, maxAus)
  const tk = schritte(max)
  const oben = tk[tk.length - 1]
  const mitte = O + (H - O - U) / 2
  const halb = (H - O - U) / 2
  const y = (v: number) => mitte - (v / oben) * halb
  const slot = (W - L - R) / Math.max(monate.length, 1)
  const bw = Math.max(2, Math.min(28, slot * 0.62))
  const xm = (i: number) => L + slot * i + slot / 2
  const jedes = Math.max(1, Math.ceil(monate.length / 18))
  const h = hover !== null ? monate[hover] : null
  const ersteZukunft = monate.findIndex(m => m.zukunft)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" onMouseLeave={() => setHover(null)}>
        <defs>
          <pattern id="schraffur-ein" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill={EIN} opacity={0.25} /><rect width="2.5" height="5" fill={EIN} /></pattern>
          <pattern id="schraffur-aus" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="5" height="5" fill={AUS} opacity={0.25} /><rect width="2.5" height="5" fill={AUS} /></pattern>
        </defs>
        {/* Zukunft leicht hinterlegt */}
        {ersteZukunft >= 0 && <rect x={L + slot * ersteZukunft} y={O} width={W - R - L - slot * ersteZukunft} height={H - O - U} className="fill-accent" opacity={0.25} />}
        {ersteZukunft >= 0 && <text x={L + slot * ersteZukunft + 4} y={O + 10} className="fill-muted-foreground text-[10px]">Zukunft</text>}
        {tk.map(v => (
          <g key={v}>
            {v > 0 && <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray="2 4" />}
            {v > 0 && <line x1={L} x2={W - R} y1={y(-v)} y2={y(-v)} className="stroke-border" strokeDasharray="2 4" />}
            <text x={L - 6} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">{v}</text>
            {v > 0 && <text x={L - 6} y={y(-v) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">{v}</text>}
          </g>
        ))}
        {monate.map((m, i) => {
          const x = xm(i) - bw / 2
          return (
            <g key={m.monat} opacity={hover === null || hover === i ? 1 : 0.55}>
              {m.prognoseEin !== undefined && <rect x={x - 1} y={y(m.prognoseEin)} width={bw + 2} height={mitte - 1 - y(m.prognoseEin)} fill="none" stroke={EIN} strokeWidth={1.2} strokeDasharray="3 2" rx={3} />}
              {m.prognoseAus !== undefined && <rect x={x - 1} y={mitte + 1} width={bw + 2} height={y(-m.prognoseAus) - mitte - 1} fill="none" stroke={AUS} strokeWidth={1.2} strokeDasharray="3 2" rx={3} />}
              <path d={balken(x, bw, mitte - 1, y(m.ein))} fill={m.zukunft ? 'url(#schraffur-ein)' : EIN} />
              <path d={balken(x, bw, mitte + 1, y(-m.aus))} fill={m.zukunft ? 'url(#schraffur-aus)' : AUS} />
            </g>
          )
        })}
        <line x1={L} x2={W - R} y1={mitte} y2={mitte} className="stroke-muted-foreground" strokeOpacity={0.6} />
        {monate.map((m, i) => (i % jedes === 0 || m.monat.endsWith('-01')) && (
          <text key={m.monat} x={xm(i)} y={H - U + 14} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {monatKurz(m.monat)}{(m.monat.endsWith('-01') || i === 0) ? ` ${m.monat.slice(2, 4)}` : ''}
          </text>
        ))}
        {/* Trefferflächen breiter als die Balken */}
        {monate.map((m, i) => <rect key={m.monat} x={L + slot * i} y={O} width={slot} height={H - O - U} fill="transparent" onMouseEnter={() => setHover(i)} />)}
      </svg>
      {h && hover !== null && <Tooltip m={h} links={hover > monate.length / 2} />}
    </div>
  )
}

function Tooltip({ m, links }: { m: MonatsWert; links: boolean }) {
  const namen = (l: string[]) => l.length ? l.slice(0, 5).join(', ') + (l.length > 5 ? ` … (+${l.length - 5})` : '') : ''
  return (
    <div className={`absolute top-2 ${links ? 'left-12' : 'right-2'} max-w-[340px] rounded-md border border-border bg-card/95 px-2.5 py-1.5 text-[11px] shadow-lg pointer-events-none`}>
      <p className="font-semibold text-foreground">{monatLang(m.monat)}{m.zukunft ? ' (Zukunft)' : ''}</p>
      <p className="flex items-center gap-1.5 text-foreground"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: EIN }} />Eintritte: <b>{m.ein}</b>{m.zukunft ? ' eingetragen' : ''}{m.prognoseEin !== undefined ? ` · Prognose ${zahl(m.prognoseEin)}` : ''}</p>
      {m.namenEin.length > 0 && <p className="pl-4 text-muted-foreground">{namen(m.namenEin)}</p>}
      <p className="flex items-center gap-1.5 text-foreground"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: AUS }} />Austritte: <b>{m.aus}</b>{m.zukunft ? ' eingetragen' : ''}{m.prognoseAus !== undefined ? ` · Prognose ${zahl(m.prognoseAus)}` : ''}</p>
      {m.namenAus.length > 0 && <p className="pl-4 text-muted-foreground">{namen(m.namenAus)}</p>}
      <p className="text-muted-foreground mt-0.5">Saldo {vz(m.saldo)}{!m.zukunft ? ` · gleitend 12 Mon. ${vz(m.saldo12)}` : ''}</p>
    </div>
  )
}

// ── Chart 2: Saldo ────────────────────────────────────────────────────────────
function SaldoChart({ monate, art }: { monate: MonatsWert[]; art: SaldoArt }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 960, H = 190, L = 40, R = 10, O = 10, U = 24
  const wert = (m: MonatsWert) => art === 'monat' ? m.saldo : art === 'gleitend' ? m.saldo12 : m.saldoKum
  const werte = monate.map(wert)
  const max = Math.max(1, ...werte.map(Math.abs))
  const tk = schritte(max, 2)
  const oben = tk[tk.length - 1]
  const mitte = O + (H - O - U) / 2, halb = (H - O - U) / 2
  const y = (v: number) => mitte - (v / oben) * halb
  const slot = (W - L - R) / Math.max(monate.length, 1)
  const xm = (i: number) => L + slot * i + slot / 2
  const bw = Math.max(2, Math.min(24, slot * 0.6))
  const jedes = Math.max(1, Math.ceil(monate.length / 18))
  const h = hover !== null ? monate[hover] : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" onMouseLeave={() => setHover(null)}>
        <defs>
          <pattern id="schraffur-saldo-p" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill={EIN} opacity={0.25} /><rect width="2.5" height="5" fill={EIN} /></pattern>
          <pattern id="schraffur-saldo-n" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="5" height="5" fill={AUS} opacity={0.25} /><rect width="2.5" height="5" fill={AUS} /></pattern>
        </defs>
        {tk.map(v => (
          <g key={v}>
            {v > 0 && <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray="2 4" />}
            {v > 0 && <line x1={L} x2={W - R} y1={y(-v)} y2={y(-v)} className="stroke-border" strokeDasharray="2 4" />}
            <text x={L - 6} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">{v ? `+${v}` : 0}</text>
            {v > 0 && <text x={L - 6} y={y(-v) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">−{v}</text>}
          </g>
        ))}
        {art === 'monat'
          ? monate.map((m, i) => {
            const v = wert(m), pos = v >= 0
            return <path key={m.monat} opacity={hover === null || hover === i ? 1 : 0.55}
              d={balken(xm(i) - bw / 2, bw, pos ? mitte - 1 : mitte + 1, y(v))}
              fill={m.zukunft ? `url(#schraffur-saldo-${pos ? 'p' : 'n'})` : pos ? EIN : AUS} />
          })
          : <>
            {/* Fläche über/unter null in der jeweiligen Farbe, Linie in neutraler Schrift-Farbe */}
            {monate.length > 1 && (() => {
              // Punkte inkl. exakter Nulldurchgänge → Flächen über/unter null ohne Schnittmasken
              const p: [number, number][] = []
              monate.forEach((m, i) => {
                const v = wert(m)
                if (i > 0) {
                  const v0 = wert(monate[i - 1])
                  if ((v0 > 0 && v < 0) || (v0 < 0 && v > 0)) p.push([xm(i - 1) + (xm(i) - xm(i - 1)) * (v0 / (v0 - v)), 0])
                }
                p.push([xm(i), v])
              })
              const flaeche = (f: (v: number) => number) =>
                `M${p[0][0]},${mitte} ${p.map(([x, v]) => `L${x},${y(f(v))}`).join(' ')} L${p[p.length - 1][0]},${mitte} Z`
              return <>
                <path d={flaeche(v => Math.max(v, 0))} fill={EIN} opacity={0.22} />
                <path d={flaeche(v => Math.min(v, 0))} fill={AUS} opacity={0.22} />
                <polyline points={monate.map((m, i) => `${xm(i)},${y(wert(m))}`).join(' ')} fill="none" className="stroke-foreground" strokeWidth={2} strokeLinejoin="round" />
              </>
            })()}
            {hover !== null && <circle cx={xm(hover)} cy={y(wert(monate[hover]))} r={4.5} className="fill-foreground stroke-card" strokeWidth={2} />}
          </>}
        <line x1={L} x2={W - R} y1={mitte} y2={mitte} className="stroke-muted-foreground" strokeOpacity={0.6} />
        {hover !== null && art !== 'monat' && <line x1={xm(hover)} x2={xm(hover)} y1={O} y2={H - U} className="stroke-muted-foreground" strokeOpacity={0.4} strokeDasharray="2 3" />}
        {monate.map((m, i) => (i % jedes === 0 || m.monat.endsWith('-01')) && (
          <text key={m.monat} x={xm(i)} y={H - U + 14} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {monatKurz(m.monat)}{(m.monat.endsWith('-01') || i === 0) ? ` ${m.monat.slice(2, 4)}` : ''}
          </text>
        ))}
        {monate.map((m, i) => <rect key={m.monat} x={L + slot * i} y={O} width={slot} height={H - O - U} fill="transparent" onMouseEnter={() => setHover(i)} />)}
      </svg>
      {h && (
        <div className={`absolute top-1 ${hover! > monate.length / 2 ? 'left-12' : 'right-2'} rounded-md border border-border bg-card/95 px-2.5 py-1.5 text-[11px] shadow-lg pointer-events-none`}>
          <p className="font-semibold text-foreground">{monatLang(h.monat)}</p>
          <p className="text-foreground">{art === 'monat' ? 'Saldo im Monat' : art === 'gleitend' ? 'Saldo letzte 12 Monate' : 'Saldo seit Beginn'}: <b>{vz(wert(h))}</b></p>
          <p className="text-muted-foreground">{h.ein} Eintritte · {h.aus} Austritte im Monat</p>
        </div>
      )}
    </div>
  )
}

// ── Tabellenansicht (barrierearm, zum Nachprüfen) ─────────────────────────────
function Tabelle({ monate }: { monate: MonatsWert[] }) {
  return (
    <div className="rounded-lg border border-border overflow-auto max-h-[420px]">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-card"><tr className="text-left text-muted-foreground border-b border-border">
          <th className="px-2 py-1.5 font-medium">Monat</th><th className="px-2 py-1.5 font-medium text-right">Eintritte</th><th className="px-2 py-1.5 font-medium text-right">Austritte</th>
          <th className="px-2 py-1.5 font-medium text-right">Saldo</th><th className="px-2 py-1.5 font-medium text-right">gleitend 12 M.</th><th className="px-2 py-1.5 font-medium text-right">kumuliert</th>
          <th className="px-2 py-1.5 font-medium text-right">Prognose Ein / Aus</th>
        </tr></thead>
        <tbody>
          {[...monate].reverse().map(m => (
            <tr key={m.monat} className="border-b border-border/50">
              <td className="px-2 py-1 text-foreground">{monatLang(m.monat)}{m.zukunft ? ' · Zukunft' : ''}</td>
              <td className="px-2 py-1 text-right text-foreground">{m.ein}</td><td className="px-2 py-1 text-right text-foreground">{m.aus}</td>
              <td className="px-2 py-1 text-right text-foreground">{vz(m.saldo)}</td><td className="px-2 py-1 text-right text-muted-foreground">{m.zukunft ? '—' : vz(m.saldo12)}</td>
              <td className="px-2 py-1 text-right text-muted-foreground">{m.zukunft ? '—' : vz(m.saldoKum)}</td>
              <td className="px-2 py-1 text-right text-muted-foreground">{m.prognoseEin !== undefined ? `${zahl(m.prognoseEin)} / ${zahl(m.prognoseAus!)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
