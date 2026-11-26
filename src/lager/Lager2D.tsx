// „Lager einsehen“ — Regalansicht ohne 3D (Umschalter und Rückfall, wenn die Grafikkarte kein 3D kann).

import { FACH_BY_ORT, R5_FAECHER, REGALE, ZONEN, ortKurz } from './aufbau'
import type { LagerModell } from './bestand'
import { TypPunkt, type InventurInfo } from './FachDetails'
import { TYP_LABEL, TYP_REIHE, type OrtId } from './typen'

interface Props {
  modell: LagerModell
  auswahl: OrtId | null
  treffer: Set<string> | null
  inventur: Map<OrtId, InventurInfo> | null
  onAuswahl: (ort: OrtId) => void
}

const ZONEN_RAND = { blau: 'border-blue-600', rot: 'border-red-600', gelb: 'border-yellow-500', grau: 'border-gray-400' } as const

function Zelle({ ort, titel, modell, auswahl, treffer, inventur, onAuswahl, klein }: Props & { ort: OrtId; titel: string; klein?: boolean }) {
  const liste = modell.proOrt.get(ort) || []
  const inv = inventur?.get(ort)
  const trifft = !!treffer && liste.some(g => treffer.has(g.serial))
  const vorgesehen = liste.filter(g => g.vorgesehen.length)
  const rand = inv?.zustand === 'abweichung' ? 'border-red-600 bg-red-600/10' : inv?.zustand === 'stimmt' ? 'border-green-600 bg-green-600/10'
    : auswahl === ort ? 'border-primary bg-primary/10' : trifft ? 'border-cyan-500 bg-cyan-500/10' : 'border-border bg-card/60 hover:bg-accent/30'
  return (
    <button onClick={() => onAuswahl(ort)} data-lager-zelle={ort}
      className={`text-left rounded-md border-2 px-2 py-1.5 min-h-[58px] flex flex-col gap-0.5 transition-colors ${rand}`}>
      <div className="flex items-center gap-1.5">
        <span className={`font-semibold text-foreground ${klein ? 'text-[11px]' : 'text-sm'}`}>{titel}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{liste.length || ''}</span>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {TYP_REIHE.map(t => {
          const n = liste.filter(g => g.typ === t).length
          return n ? <span key={t} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={TYP_LABEL[t]}><TypPunkt typ={t} />{n} {TYP_LABEL[t]}</span> : null
        })}
      </div>
      {vorgesehen.length > 0 && <div className="text-[10.5px] text-amber-600 truncate" title={vorgesehen.map(g => `${g.serial} → ${g.vorgesehen[0].name}`).join('\n')}>→ {vorgesehen.map(g => g.vorgesehen[0].name).join(', ')}</div>}
      {inv?.zustand === 'abweichung' && <div className="text-[10.5px] text-red-600">{inv.text}</div>}
    </button>
  )
}

export default function Lager2D(p: Props) {
  const rueckwand = REGALE.filter(r => r.nr <= 4)
  return (
    <div className="h-full overflow-auto p-4 space-y-4" data-lager-2d>
      <div className="flex gap-3 items-start">
        <div className="w-[190px] shrink-0">
          <div className="text-[11px] font-semibold text-muted-foreground mb-1">Linkes Regal</div>
          <div className="flex flex-col gap-1.5">
            {[...R5_FAECHER].reverse().map(f => <Zelle key={f.id} {...p} ort={`r5:${f.id}`} titel={f.kurz} klein />)}
          </div>
        </div>
        {rueckwand.map(r => (
          <div key={r.nr} className="flex-1 min-w-[150px]">
            <div className="text-[11px] font-semibold text-muted-foreground mb-1">Regal {r.nr}</div>
            <div className="flex flex-col gap-1.5">
              {[...r.boeden].map((_, i) => i).reverse().map(ebene => {
                const fach = [...FACH_BY_ORT.values()].find(f => f.regal === r.nr && f.ebene === ebene)!
                return <Zelle key={fach.ort} {...p} ort={fach.ort} titel={fach.zusatz ? `${fach.aufkleber} · ${fach.zusatz}` : fach.aufkleber} />
              })}
            </div>
          </div>
        ))}
      </div>
      <div>
        <div className="text-[11px] font-semibold text-muted-foreground mb-1">Bereiche</div>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-1.5">
          {ZONEN.map(z => (
            <div key={z.ort} className={`rounded-md border-l-4 ${ZONEN_RAND[z.farbe]} ${z.gestrichelt ? 'border-dashed' : ''}`}>
              <Zelle {...p} ort={z.ort} titel={ortKurz(z.ort)} klein />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
