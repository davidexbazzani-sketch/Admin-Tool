// Der Coach — Suche über alle Wissens-Seiten (Stufe 5). Lädt die vierzehn Wissens-Dateien erst beim ersten Tippen
// und sucht ohne Zusatzbibliothek: alle Wörter müssen vorkommen (Groß/klein, Umlaute und ß egal), Titel zählt doppelt.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { WissensEintrag, WissensSeite } from '../kern/inhaltTypen'
import type { InhaltsIndex } from '../kern/index'
import { ladeWissen } from '../kern/inhalt'
import { Eintrag } from './Bereichsseite'

const falte = (t: string): string => t.toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').normalize('NFD').replace(/[̀-ͯ]/g, '')
interface Treffer { b: string; e: WissensEintrag; punkte: number }

export function WissenSuche({ index }: { index: InhaltsIndex }) {
  const [frage, setFrage] = useState('')
  const [seiten, setSeiten] = useState<WissensSeite[] | null>(null)
  const laedt = useRef(false)
  useEffect(() => {
    if (!frage.trim() || seiten || laedt.current) return
    laedt.current = true
    void Promise.all(index.bereiche.map(b => ladeWissen(b.id).catch(() => null))).then(l => setSeiten(l.filter((x): x is WissensSeite => !!x)))
  }, [frage, seiten, index])
  const treffer = useMemo<Treffer[]>(() => {
    const woerter = falte(frage).split(/\s+/).filter(w => w.length >= 2)
    if (!woerter.length || !seiten) return []
    const aus: Treffer[] = []
    for (const s of seiten) for (const e of s.eintraege) {
      if (e.entfallen) continue
      const titel = falte(e.titel), rest = falte([e.text, ...(e.beispiele ?? []), ...(e.punkte ?? []), e.statt ?? '', e.abwehr ?? '', e.preis ?? ''].join(' '))
      if (!woerter.every(w => titel.includes(w) || rest.includes(w))) continue
      aus.push({ b: s.bereich, e, punkte: woerter.reduce((p, w) => p + (titel.includes(w) ? 2 : 0) + (rest.includes(w) ? 1 : 0), 0) })
    }
    return aus.sort((a, z) => z.punkte - a.punkte).slice(0, 30)
  }, [frage, seiten])
  const name = (b: string) => index.bereiche.find(x => x.id === b)?.name ?? b
  return (
    <div className="dc-spalte" style={{ gap: 10 }} data-dc-suche>
      <label className="dc-reihe" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <Search size={16} aria-hidden />
        <input className="dc-eingabe" type="search" value={frage} onChange={e => setFrage(e.target.value)} placeholder="Im ganzen Wissen suchen – z. B. „Pause“, „Anker“, „Lampenfieber“" aria-label="Im Wissen aller Bereiche suchen" data-dc-suche-feld />
        {frage && <button type="button" className="dc-knopf dc-knopf-nackt" onClick={() => setFrage('')} aria-label="Suche leeren"><X size={14} /></button>}
      </label>
      {frage.trim().length >= 2 && (!seiten ? <span className="dc-klein dc-stumm">Lädt …</span>
        : !treffer.length ? <span className="dc-klein dc-stumm">Nichts gefunden. Versuch ein anderes Wort.</span>
          : <div className="dc-spalte" style={{ gap: 8 }} data-dc-suche-treffer={treffer.length}>
            <span className="dc-klein dc-stumm">{treffer.length === 30 ? 'Die ersten 30 Treffer' : `${treffer.length} ${treffer.length === 1 ? 'Treffer' : 'Treffer'}`}</span>
            <div className="dc-raster" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {treffer.map(t => <div key={t.e.id} className="dc-spalte" style={{ gap: 4 }}><span className="dc-ober">{name(t.b)}</span><Eintrag e={t.e} /></div>)}
            </div>
          </div>)}
    </div>
  )
}
