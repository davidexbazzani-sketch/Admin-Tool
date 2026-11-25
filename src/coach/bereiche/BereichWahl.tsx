// Der Coach — alle vierzehn Bereiche als Karten zum An- und Abwählen (Einstieg und Einstellungen).
// „Alle“, „Keine“, jede Karte einzeln; Kennenlernen & Flirten steht abgesetzt als freiwilliger Zusatz.
// Ist Aussprache gewählt, folgt die Frage nach den Schwerpunkten (Mehrfachwahl, Vorgabe: nichts davon).
import type { BereichId, SchwerpunktId } from '../kern/inhaltTypen'
import type { InhaltsIndex } from '../kern/index'
import { Symbol } from '../ansicht/Symbol'

export function BereichWahl({ index, gewaehlt, setGewaehlt, schwerpunkte, setSchwerpunkte }: { index: InhaltsIndex; gewaehlt: BereichId[]; setGewaehlt: (b: BereichId[]) => void; schwerpunkte: SchwerpunktId[]; setSchwerpunkte: (s: SchwerpunktId[]) => void }) {
  const normal = index.bereiche.filter(b => !b.optIn)
  const zusatz = index.bereiche.filter(b => b.optIn)
  const kipp = (b: BereichId) => setGewaehlt(gewaehlt.includes(b) ? gewaehlt.filter(x => x !== b) : [...gewaehlt, b])
  const karte = (b: InhaltsIndex['bereiche'][number]) => {
    const an = gewaehlt.includes(b.id)
    return (
      <button key={b.id} type="button" className="dc-wahl" style={{ flexDirection: 'column', gap: 6, alignItems: 'stretch' }} onClick={() => kipp(b.id)} aria-pressed={an} data-an={an ? '1' : undefined} data-dc-bereich={b.id}>
        <span className="dc-reihe" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <span className="dc-reihe" style={{ gap: 8, flexWrap: 'nowrap' }}><Symbol name={b.zeichen} size={18} /><b>{b.name}</b></span>
          <span aria-hidden style={{ fontWeight: 800, color: an ? 'var(--dc-gelb)' : 'var(--dc-stumm)' }}>{an ? '✓' : '+'}</span>
        </span>
        <span className="dc-klein dc-leise">{b.kurz}</span>
        <span className="dc-klein dc-stumm">Typisch: {b.moment}</span>
        {!b.freigegeben && <span className="dc-chip" style={{ alignSelf: 'flex-start' }}>Inhalte folgen</span>}
      </button>
    )
  }
  return (
    <div className="dc-spalte" data-dc-bereichwahl>
      <div className="dc-reihe">
        <button type="button" className="dc-knopf dc-knopf-leise" onClick={() => setGewaehlt([...normal.map(b => b.id), ...gewaehlt.filter(g => zusatz.some(z => z.id === g))])} data-dc-alle>Alle</button>
        <button type="button" className="dc-knopf dc-knopf-leise" onClick={() => setGewaehlt([])} data-dc-keine>Keine</button>
        <span className="dc-klein dc-stumm">{gewaehlt.length} gewählt – jederzeit änderbar. Abgewählte Bereiche behalten ihren Stand.</span>
      </div>
      <div className="dc-raster">{normal.map(karte)}</div>
      {zusatz.length > 0 && <div className="dc-spalte" style={{ gap: 6 }}>
        <span className="dc-ober">Freiwilliger Zusatz</span>
        <span className="dc-klein dc-leise">Für alle Geschlechter und Orientierungen. Respektvoll, ohne Manipulation: Interesse zeigen ist in Ordnung, Druck nicht – ein Nein gilt sofort.</span>
        <div className="dc-raster">{zusatz.map(karte)}</div>
      </div>}
      {gewaehlt.includes('aussprache') && (
        <div className="dc-karte-flach dc-spalte dc-ein" data-dc-schwerpunkte>
          <b>Möchtest du an etwas Bestimmtem arbeiten?</b>
          <span className="dc-klein dc-leise">Mehrfachwahl. Wer nichts davon wählt, bekommt nur den Kern: klar und deutlich sprechen. Was du hier wählst, sieht niemand außer dir.</span>
          {index.schwerpunkte.map(s => {
            const an = schwerpunkte.includes(s.id)
            return (
              <button key={s.id} type="button" className="dc-wahl" aria-pressed={an} data-an={an ? '1' : undefined} onClick={() => setSchwerpunkte(an ? schwerpunkte.filter(x => x !== s.id) : [...schwerpunkte, s.id])} data-dc-schwerpunkt={s.id}>
                <span className="dc-zeichen">{an ? '✓' : '+'}</span>
                <span><b>{s.name}</b><span className="dc-klein dc-leise" style={{ display: 'block' }}>{s.leistet}</span><span className="dc-klein dc-stumm" style={{ display: 'block' }}>Grenze: {s.grenze}</span></span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
