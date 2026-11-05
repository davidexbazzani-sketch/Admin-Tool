// ── Endgeräte-Übersicht – „Chart anzeigen" ────────────────────────────────────
// Wöchentlicher Kostenverlauf (Monats- bzw. Jahreskosten) als Liniendiagramm:
// ein Punkt je Kalenderwoche, verbunden mit dem vorherigen. Oben: aktuell vs. Vorwoche.

import { useEffect, useMemo, useState } from 'react'
import { X, Loader2, TrendingUp, TrendingDown, Minus, LineChart } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { formatEuro } from '../../services/endpointDevices'
import { aktualisiereKostenPunkt, ladeKostenVerlauf, type KostenPunkt } from '../../services/endpointCostHistory'

type Art = 'monatlich' | 'jaehrlich'

const kw = (p: KostenPunkt) => `KW ${Number(p.woche.slice(6))}`
const datumKurz = (iso: string) => { const [j, m, t] = iso.split('-'); return `${t}.${m}.${j.slice(2)}` }

/** Veränderung als farbiges Kästchen — mehr Kosten = rot, weniger = grün. */
function Delta({ jetzt, vorher }: { jetzt: number; vorher: number | null }) {
  if (vorher === null) return <span className="text-muted-foreground">—</span>
  const d = Math.round((jetzt - vorher) * 100) / 100
  const pz = vorher ? (d / vorher) * 100 : 0
  if (d === 0) return <span className="inline-flex items-center gap-1 text-muted-foreground"><Minus size={12} />unverändert</span>
  const hoch = d > 0
  return (
    <span className={`inline-flex items-center gap-1 ${hoch ? 'text-red-400' : 'text-emerald-400'}`}>
      {hoch ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {hoch ? '+' : '−'}{formatEuro(Math.abs(d))} ({hoch ? '+' : '−'}{Math.abs(pz).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %)
    </span>
  )
}

/** Gut lesbare Achsenschritte (1/2/2,5/5 × 10^n). */
function achse(min: number, max: number, n = 5) {
  if (min === max) { const p = Math.max(Math.abs(min) * 0.05, 1); min -= p; max += p }
  const roh = (max - min) / n
  const p10 = Math.pow(10, Math.floor(Math.log10(roh)))
  const schritt = [1, 2, 2.5, 5, 10].map(f => f * p10).find(s => s >= roh) || roh
  const von = Math.floor(min / schritt) * schritt, bis = Math.ceil(max / schritt) * schritt
  const ticks: number[] = []
  for (let v = von; v <= bis + schritt / 2; v += schritt) ticks.push(Math.round(v * 100) / 100)
  return { von, bis, ticks }
}

function Chart({ punkte, art }: { punkte: KostenPunkt[]; art: Art }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 760, H = 300, L = 92, R = 20, O = 16, U = 40
  const werte = punkte.map(p => p[art])
  const { von, bis, ticks } = achse(Math.min(...werte), Math.max(...werte))
  const x = (i: number) => punkte.length === 1 ? L + (W - L - R) / 2 : L + (i / (punkte.length - 1)) * (W - L - R)
  const y = (v: number) => O + (1 - (v - von) / (bis - von || 1)) * (H - O - U)
  const linie = punkte.map((p, i) => `${x(i)},${y(p[art])}`).join(' ')
  const jedes = Math.max(1, Math.ceil(punkte.length / 12))   // höchstens ~12 Wochen-Beschriftungen
  const h = hover !== null ? punkte[hover] : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" onMouseLeave={() => setHover(null)}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray="3 4" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{formatEuro(t)}</text>
          </g>
        ))}
        {punkte.map((p, i) => (i % jedes === 0 || i === punkte.length - 1) && (
          <text key={p.woche} x={x(i)} y={H - U + 18} textAnchor="middle" className="fill-muted-foreground text-[11px]">{kw(p)}</text>
        ))}
        {punkte.length > 1 && <polyline points={linie} fill="none" className="stroke-primary" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
        {punkte.map((p, i) => (
          <g key={p.woche}>
            <circle cx={x(i)} cy={y(p[art])} r={hover === i ? 6 : 4} className="fill-primary stroke-card" strokeWidth={2} />
            {/* große unsichtbare Trefferfläche je Woche */}
            <rect x={x(i) - (W - L - R) / Math.max(punkte.length - 1, 1) / 2} y={O} width={(W - L - R) / Math.max(punkte.length - 1, 1)} height={H - O - U}
              fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        ))}
        {h && hover !== null && <line x1={x(hover)} x2={x(hover)} y1={O} y2={H - U} className="stroke-primary/40" strokeDasharray="2 3" />}
      </svg>
      {h && hover !== null && (
        <div className="absolute top-2 right-2 rounded-md border border-border bg-card/95 px-2.5 py-1.5 text-[11px] shadow-lg pointer-events-none">
          <p className="font-semibold text-foreground">{kw(h)} · ab {datumKurz(h.montag)}</p>
          <p className="text-foreground">{formatEuro(h.monatlich)}/Monat · {formatEuro(h.jaehrlich)}/Jahr</p>
          <p className="text-muted-foreground">{h.geraete} Geräte mit Kosten (von {h.geraeteGesamt})</p>
          <p><Delta jetzt={h[art]} vorher={hover > 0 ? punkte[hover - 1][art] : null} /> <span className="text-muted-foreground">zur Woche davor</span></p>
        </div>
      )}
    </div>
  )
}

export default function KostenChartDialog({ onClose }: { onClose: () => void }) {
  const user = useAuthStore(s => s.session?.user)
  const [punkte, setPunkte] = useState<KostenPunkt[] | null>(null)
  const [art, setArt] = useState<Art>('monatlich')

  useEffect(() => {
    let weg = false
    void (async () => {
      // Erst den Punkt dieser Woche auf den aktuellen Stand bringen, dann anzeigen
      try { await aktualisiereKostenPunkt(user?.displayName || user?.username || '') } catch { /* nur anzeigen */ }
      const p = await ladeKostenVerlauf()
      if (!weg) setPunkte(p)
    })()
    return () => { weg = true }
  }, [user?.displayName, user?.username])

  const jetzt = punkte?.length ? punkte[punkte.length - 1] : null
  const vorher = punkte && punkte.length > 1 ? punkte[punkte.length - 2] : null
  const typen = useMemo(() => {
    if (!jetzt) return []
    return Object.entries(jetzt.jeTyp).sort((a, b) => b[1].monatlich - a[1].monatlich)
  }, [jetzt])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-[900px] max-w-full max-h-[92vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <LineChart size={16} className="text-primary" />
          <h2 className="text-base font-semibold text-foreground">Kostenverlauf Endgeräte</h2>
          <div className="ml-4 flex rounded-md border border-border overflow-hidden text-[11px]">
            {([['monatlich', 'Monatlich'], ['jaehrlich', 'Jährlich']] as [Art, string][]).map(([k, t]) => (
              <button key={k} onClick={() => setArt(k)}
                className={`px-2.5 py-1 ${art === k ? 'bg-primary/15 text-foreground font-semibold' : 'text-muted-foreground hover:bg-accent/30'}`}>{t}</button>
            ))}
          </div>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!punkte ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" />Lade Verlauf …</p>
          ) : !jetzt ? (
            <p className="text-sm text-muted-foreground">Noch kein Messpunkt vorhanden — die Geräteliste ist leer oder das Netzlaufwerk nicht erreichbar.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] text-muted-foreground">Aktuell ({kw(jetzt)})</p>
                  <p className="text-lg font-semibold text-foreground">{formatEuro(jetzt[art])}<span className="text-xs font-normal text-muted-foreground">{art === 'monatlich' ? '/Monat' : '/Jahr'}</span></p>
                  <p className="text-[11px] text-muted-foreground">{art === 'monatlich' ? `${formatEuro(jetzt.jaehrlich)}/Jahr` : `${formatEuro(jetzt.monatlich)}/Monat`} · {jetzt.geraete} Geräte</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] text-muted-foreground">Vorwoche{vorher ? ` (${kw(vorher)})` : ''}</p>
                  <p className="text-lg font-semibold text-foreground">{vorher ? <>{formatEuro(vorher[art])}<span className="text-xs font-normal text-muted-foreground">{art === 'monatlich' ? '/Monat' : '/Jahr'}</span></> : '—'}</p>
                  <p className="text-[11px] text-muted-foreground">{vorher ? `${vorher.geraete} Geräte` : 'noch kein Wert'}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] text-muted-foreground">Veränderung zur Vorwoche</p>
                  <p className="text-sm font-semibold mt-1"><Delta jetzt={jetzt[art]} vorher={vorher ? vorher[art] : null} /></p>
                  {vorher && <p className="text-[11px] text-muted-foreground mt-0.5">Geräte: {jetzt.geraete - vorher.geraete >= 0 ? '+' : ''}{jetzt.geraete - vorher.geraete}</p>}
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <Chart punkte={punkte} art={art} />
                {punkte.length === 1 && (
                  <p className="text-[11px] text-muted-foreground mt-1">Erster Messpunkt — ab nächster Woche setzt das Tool automatisch einen neuen Punkt und verbindet ihn mit diesem.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] font-semibold text-foreground mb-1.5">Aktuell je Model-Typ</p>
                  {typen.map(([t, v]) => (
                    <p key={t} className="flex justify-between text-[11px]">
                      <span className="text-foreground">{t} <span className="text-muted-foreground">({v.anzahl})</span></span>
                      <span className="text-muted-foreground">{formatEuro(art === 'monatlich' ? v.monatlich : v.monatlich * 12)}</span>
                    </p>
                  ))}
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] font-semibold text-foreground mb-1.5">Wochenwerte</p>
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {[...punkte].reverse().map((p, i, arr) => (
                      <p key={p.woche} className="flex justify-between gap-2 text-[11px]">
                        <span className="text-foreground shrink-0">{kw(p)} <span className="text-muted-foreground">{p.woche.slice(0, 4)}</span></span>
                        <span className="text-muted-foreground">{formatEuro(p[art])}</span>
                        <span className="w-40 text-right"><Delta jetzt={p[art]} vorher={i < arr.length - 1 ? arr[i + 1][art] : null} /></span>
                      </p>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Gezählt werden alle Geräte der Übersicht mit bekanntem Model-Typ — unabhängig von gesetzten Filtern. Der Punkt der laufenden Woche
                wird bis Sonntag auf den aktuellen Stand gezogen (z. B. nach einem Excel-Import), vergangene Wochen bleiben unverändert.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
