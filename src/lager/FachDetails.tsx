// „Lager einsehen“ — Seitenleiste: Geräte eines Fachs bzw. Bereichs.

import { AlertTriangle, ArrowRightLeft, UserRound, X } from 'lucide-react'
import { DeviceInfoButton } from '../components/device/DeviceDossier'
import { ortName } from './aufbau'
import type { LagerModell } from './bestand'
import { TYP_PUNKT } from './szene/farben'
import { TYP_LABEL, TYP_REIHE, type LagerGeraet, type LagerTyp, type OrtId } from './typen'

export interface InventurInfo { zustand: 'stimmt' | 'abweichung' | 'offen'; text?: string }

export function TypPunkt({ typ, gross }: { typ: LagerTyp; gross?: boolean }) {
  return <span className={`inline-block rounded-sm shrink-0 ${gross ? 'w-3 h-3' : 'w-2.5 h-2.5'}`} style={{ background: TYP_PUNKT[typ], boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.25)' }} />
}

export function GeraetKarte({ g, zeigeOrt }: { g: LagerGeraet; zeigeOrt?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card/60 px-2.5 py-2 text-xs space-y-1" data-lager-geraet={g.serial}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <TypPunkt typ={g.typ} />
        <span className="font-mono font-semibold text-foreground select-all">{g.serial}</span>
        {g.hostname && <span className="inline-flex items-center gap-0.5 font-mono text-muted-foreground">{g.hostname}<DeviceInfoButton hostname={g.hostname} serial={g.serial} /></span>}
        {g.quelle !== 'endgeraete' && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground" title={g.quelle === 'lagerliste' ? 'aus der Lagerliste der Mini-Inventur' : 'nur aus der letzten Inventur bekannt'}>{g.quelle === 'lagerliste' ? 'Lagerliste' : 'Inventur'}</span>}
      </div>
      {g.modell && <div className="text-muted-foreground">{g.modell}{g.state ? ` · ${g.state}${g.substate ? ` / ${g.substate}` : ''}` : ''}</div>}
      {zeigeOrt && <div className="text-foreground">{ortName(g.ort)}</div>}
      {g.leih && (
        <div className="flex items-center gap-1 text-amber-600">
          <ArrowRightLeft size={11} />
          Leihrechner{g.leih.benutzer ? ` · bei ${g.leih.benutzer}` : g.leih.raum ? ` · ${g.leih.raum}` : ''}{g.leih.datum ? ` · seit ${g.leih.datum}` : ''}
        </div>
      )}
      {g.vorgesehen.map(v => (
        <div key={v.name + v.quelle} className="flex items-start gap-1 rounded bg-amber-500/15 border border-amber-500/40 px-1.5 py-1 text-amber-700" data-lager-vorgesehen={v.name}>
          <UserRound size={11} className="mt-0.5 shrink-0" />
          <span><span className="font-semibold">vorgesehen für {v.name}</span> <span className="opacity-80">· {v.quelle}</span></span>
        </div>
      ))}
      {g.kommentar && <div className="whitespace-pre-wrap break-words text-muted-foreground border-l-2 border-border pl-2 line-clamp-4" title={g.kommentar}>{g.kommentar}</div>}
      <div className="text-[10.5px] text-muted-foreground/80">Zuordnung: {g.grund}</div>
      {g.hinweise.map(h => <div key={h} className="flex items-start gap-1 text-amber-600"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{h}</div>)}
    </div>
  )
}

export default function FachDetails({ modell, ort, typ, inventur, onTyp, onSchliessen }: {
  modell: LagerModell; ort: OrtId; typ?: LagerTyp; inventur?: InventurInfo
  onTyp: (t: LagerTyp | undefined) => void; onSchliessen: () => void
}) {
  const alle = modell.proOrt.get(ort) || []
  const typen = TYP_REIHE.filter(t => alle.some(g => g.typ === t))
  const liste = typ ? alle.filter(g => g.typ === typ) : alle
  return (
    <div className="flex flex-col h-full" data-lager-details={ort}>
      <div className="px-3 py-2.5 border-b border-border flex items-start gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground leading-tight">{ortName(ort)}</h2>
          <p className="text-[11px] text-muted-foreground">{alle.length} Gerät(e){typ ? ` · gezeigt: ${TYP_LABEL[typ]} (${liste.length})` : ''}</p>
        </div>
        <button onClick={onSchliessen} className="ml-auto p-1 rounded hover:bg-accent/40 text-muted-foreground" title="Schließen"><X size={14} /></button>
      </div>
      {inventur && (
        <div className={`mx-3 mt-2 rounded-md px-2.5 py-1.5 text-xs border ${inventur.zustand === 'stimmt' ? 'border-green-600/40 bg-green-600/10 text-green-700' : inventur.zustand === 'abweichung' ? 'border-red-600/40 bg-red-600/10 text-red-600' : 'border-border text-muted-foreground'}`}>
          Mini-Inventur: {inventur.zustand === 'stimmt' ? 'stimmt' : inventur.zustand === 'abweichung' ? `Abweichung — ${inventur.text || ''}` : 'noch nicht gezählt'}
        </div>
      )}
      {typen.length > 1 && (
        <div className="px-3 pt-2 flex flex-wrap gap-1">
          <button onClick={() => onTyp(undefined)} className={`px-2 py-0.5 rounded-full text-[11px] border ${!typ ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-accent/30'}`}>Alle {alle.length}</button>
          {typen.map(t => {
            const n = alle.filter(g => g.typ === t).length
            return <button key={t} data-lager-typfilter={t} onClick={() => onTyp(t)} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${typ === t ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-accent/30'}`}><TypPunkt typ={t} />{TYP_LABEL[t]} {n}</button>
          })}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!liste.length && <p className="text-xs text-muted-foreground">Hier liegt laut Daten nichts.</p>}
        {ort === 'zone:ohne' && liste.length > 0 && <p className="text-[11px] text-muted-foreground">Diese Geräte sind laut Daten im Lager, aber ihr Kommentar nennt kein Fach (oder ein unbekanntes). Fach in ServiceNow eintragen, dann landen sie beim nächsten Import am richtigen Platz.</p>}
        {TYP_REIHE.filter(t => liste.some(g => g.typ === t)).map(t => (
          <div key={t} className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><TypPunkt typ={t} />{TYP_LABEL[t]} · {liste.filter(g => g.typ === t).length}</div>
            {liste.filter(g => g.typ === t).map(g => <GeraetKarte key={g.serial} g={g} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
