// „Lager einsehen“ — „Erkennung prüfen“: alle Lagergeräte mit Kommentar, erkanntem Ort und Grund.
// Damit lässt sich am Admin-PC sofort sehen, ob die Regeln zu den echten Kommentaren passen.

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { ortName } from './aufbau'
import type { LagerModell } from './bestand'
import { TypPunkt } from './FachDetails'
import type { OrtId } from './typen'

type Filter = 'alle' | 'ohne' | 'hinweis' | 'leih' | 'vorgesehen'

export default function Diagnose({ modell, onSchliessen, onZeige }: { modell: LagerModell; onSchliessen: () => void; onZeige: (ort: OrtId) => void }) {
  const [filter, setFilter] = useState<Filter>('alle')
  const [text, setText] = useState('')
  const liste = useMemo(() => {
    const t = text.trim().toLowerCase()
    return modell.geraete.filter(g =>
      (filter === 'alle' || (filter === 'ohne' && g.ort === 'zone:ohne') || (filter === 'hinweis' && g.hinweise.length > 0)
        || (filter === 'leih' && !!g.leih) || (filter === 'vorgesehen' && g.vorgesehen.length > 0))
      && (!t || `${g.serial} ${g.hostname} ${g.modell} ${g.kommentar} ${ortName(g.ort)} ${g.grund}`.toLowerCase().includes(t)))
  }, [modell, filter, text])
  const zahl = (f: Filter) => modell.geraete.filter(g => f === 'alle' || (f === 'ohne' && g.ort === 'zone:ohne') || (f === 'hinweis' && g.hinweise.length > 0) || (f === 'leih' && !!g.leih) || (f === 'vorgesehen' && g.vorgesehen.length > 0)).length
  const FILTER: [Filter, string][] = [['alle', 'Alle'], ['ohne', 'Ohne Fach'], ['hinweis', 'Mit Hinweis'], ['leih', 'Leihrechner'], ['vorgesehen', 'Vorgesehen']]
  return (
    <div className="absolute inset-0 z-20 bg-background flex flex-col" data-lager-diagnose>
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Erkennung prüfen</h2>
          <p className="text-[11px] text-muted-foreground">Jeder Kommentar und wo das Tool das Gerät deshalb hinlegt. Stimmt etwas nicht, den Kommentar in ServiceNow anpassen — oder Bescheid geben, dann wird die Regel erweitert.</p>
        </div>
        <button onClick={onSchliessen} className="ml-auto p-1.5 rounded hover:bg-accent/40 text-muted-foreground" title="Schließen"><X size={15} /></button>
      </div>
      <div className="px-4 py-2 flex items-center gap-1.5 flex-wrap border-b border-border">
        {FILTER.map(([f, l]) => (
          <button key={f} onClick={() => setFilter(f)} data-lager-diagfilter={f}
            className={`px-2.5 py-1 rounded-full text-xs border ${filter === f ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-accent/30'}`}>{l} {zahl(f)}</button>
        ))}
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Suchen …" className="ml-auto w-56 px-2 py-1 rounded-md border border-border bg-background text-xs" />
      </div>
      {modell.abgeholt.length > 0 && filter === 'alle' && (
        <div className="mx-4 mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          {modell.abgeholt.length} Gerät(e) stehen in einem Pick-Up (abgeholt), laut Daten aber noch „In stock“ — sie werden im Lager nicht gezeigt: {modell.abgeholt.map(a => `${a.serial} (${a.datum})`).join(', ')}
        </div>
      )}
      <div className="flex-1 overflow-auto px-4 py-2">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-background">
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-1.5 pr-2 font-medium">Gerät</th>
              <th className="py-1.5 pr-2 font-medium">Status</th>
              <th className="py-1.5 pr-2 font-medium w-[34%]">Kommentar</th>
              <th className="py-1.5 pr-2 font-medium">Erkannt</th>
              <th className="py-1.5 font-medium">Grund / Hinweis</th>
            </tr>
          </thead>
          <tbody>
            {liste.map(g => (
              <tr key={g.serial} className="border-b border-border/50 align-top" data-lager-diagzeile={g.serial}>
                <td className="py-1.5 pr-2"><div className="flex items-center gap-1.5"><TypPunkt typ={g.typ} /><span className="font-mono">{g.serial}</span></div><div className="text-muted-foreground">{g.modell}</div></td>
                <td className="py-1.5 pr-2 text-muted-foreground">{g.state}{g.substate ? <><br />{g.substate}</> : null}</td>
                <td className="py-1.5 pr-2 whitespace-pre-wrap break-words text-foreground">{g.kommentar || <span className="text-muted-foreground">—</span>}</td>
                <td className="py-1.5 pr-2"><button onClick={() => onZeige(g.ort)} className={`text-left hover:underline ${g.ort === 'zone:ohne' ? 'text-amber-600' : 'text-primary'}`}>{ortName(g.ort)}</button></td>
                <td className="py-1.5 text-muted-foreground">{g.grund}{g.hinweise.map(h => <div key={h} className="text-amber-600">{h}</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!liste.length && <p className="text-xs text-muted-foreground py-4">Keine Geräte.</p>}
      </div>
    </div>
  )
}
