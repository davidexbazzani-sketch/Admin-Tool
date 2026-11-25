// Terra Incognita — der Atlas: Logbuch, Entdeckungen, Naturwunder, Tierwelt, Kuriositäten, Offiziere, Legende.
import { useMemo, useState } from 'react'
import { KURIOSA, LEGENDE, STERNPLATTE, TIERE } from '../inhalt/atlas'
import { OFFIZIERE } from '../inhalt/offiziere'
import { GEBIETE, gebietVon } from '../kern/gebiete'
import { feldAus, qAusSpalte } from '../kern/hex'
import { wunderVon } from '../kern/land'
import { ART_NAME, ortName } from '../kern/namen'
import { ROLLE_NAME } from '../kern/schiff'
import { ortVon, ruhmVon } from '../kern/spiel'
import { useTerra } from '../speicher'
import { tagText } from '../zeit'
import Skizze from './Skizze'
import { Raum, zahl, type Reiter } from './teile'

export default function Atlas({ onZu, onZeige }: { onZu: () => void; onZeige: (q: number, r: number) => void }) {
  const spiel = useTerra(s => s.spiel)
  useTerra(s => s.rev)
  const [reiter, setReiter] = useState('logbuch')
  const gebiete = useMemo(() => {
    // vermessene Felder je Gebiet (nur beim Öffnen des Atlas gezählt)
    const z = new Array<number>(GEBIETE.length).fill(0)
    if (spiel) for (const [key, a] of spiel.karte) {
      const [ax, ay] = key.split('_').map(Number)
      for (let bit = 0; bit < 256; bit++) if (a[bit >> 3] & (1 << (bit & 7))) { const r = ay * 16 + (bit >> 4); z[gebietVon(qAusSpalte(ax * 16 + (bit & 15), r), r)]++ }
    }
    return z
  }, [spiel]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!spiel) return null
  const s = spiel.stand
  const alle = Object.entries(s.entdeckt).filter(([, e]) => e.anspruch !== 3)
  const offen = alle.filter(([, e]) => !e.gemeldet)
  const inseln = alle.filter(([, e]) => e.t === 'i'), orte = alle.filter(([, e]) => e.t === 'o')
  const wunder = orte.filter(([, e]) => e.art === 'wunder')
  const erste = alle.filter(([, e]) => e.anspruch === 1).length
  const reiterListe: Reiter[] = [{ id: 'logbuch', name: 'Logbuch', punkt: offen.length > 0 }, { id: 'karte', name: `Entdeckungen (${alle.length})` }, { id: 'wunder', name: `Naturwunder (${wunder.filter(([, e]) => e.besucht).length})` }, { id: 'tiere', name: `Tierwelt (${s.atlas.tiere.length}/${TIERE.length})` }, { id: 'kurios', name: `Kuriositäten (${s.atlas.kurios.length})` }, { id: 'leute', name: 'Offiziere' }, { id: 'legende', name: `Legende (${s.atlas.legende}/8)` }]
  return (
    <Raum kennung="atlas" titel="Atlas" unter={`${zahl(s.statistik.felder)} Felder vermessen · ${erste} Erstentdeckungen · weiteste Fahrt ${s.statistik.weiteste} Felder von Hamburg`} reiter={reiterListe} aktiv={reiter} onReiter={setReiter} onZu={onZu}>
      {reiter === 'logbuch' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="ti-kasten">
            <h3>Noch nicht gemeldet</h3>
            {offen.length ? <>
              <p>Diese Entdeckungen stehen im Logbuch, aber noch in keinem Buch der Gilde. Erst im Hafen gemeldet bringen sie Ruhm und Gold – und wer zuerst meldet, tauft.</p>
              <table className="ti-tabelle" style={{ marginTop: 8 }}><tbody>
                {offen.map(([k, e]) => <tr key={k}><td><b>{e.t === 'i' ? 'Insel' : ART_NAME[e.art]}</b>{e.t === 'i' && <span className="ti-stumm"> · {e.felder} Felder</span>}</td><td className="ti-leise">gesichtet am {tagText(e.tag)}{e.anspruch === 2 ? ` · schon gemeldet von Kpt. ${e.von ?? '?'}` : ''}</td><td className="ti-zahl">{ruhmVon(e)} Ruhm</td><td className="ti-zahl"><button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => onZeige(e.q, e.r)}>Zeigen</button></td></tr>)}
              </tbody></table>
            </> : <p>Alles gemeldet. Das Logbuch ist sauber geführt.</p>}
          </div>
          <div className="ti-kasten">
            <h3>Vermessen je Gebiet</h3>
            <table className="ti-tabelle"><tbody>
              {GEBIETE.filter(g => gebiete[g.id] > 0).map(g => <tr key={g.id}><td style={{ width: 150 }}><b>{g.name}</b></td><td className="ti-leise">{g.text}</td><td className="ti-zahl">{zahl(gebiete[g.id])} Felder</td></tr>)}
            </tbody></table>
          </div>
          {s.schatzkarten.some(k => !k.gehoben) && (
            <div className="ti-kasten">
              <h3>Schatzkarten</h3>
              <table className="ti-tabelle"><tbody>
                {s.schatzkarten.filter(k => !k.gehoben).map(k => <tr key={k.id}><td>Ein Kreuz in der {GEBIETE[gebietVon(k.q, k.r)].name}</td><td className="ti-zahl"><button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => onZeige(k.q, k.r)}>Zeigen</button></td></tr>)}
              </tbody></table>
            </div>
          )}
        </div>
      )}

      {reiter === 'karte' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--ti-zier)', color: 'var(--ti-gold-stark)', marginBottom: 6 }}>Inseln ({inseln.length})</h3>
            <table className="ti-tabelle" data-ti-inseln><tbody>
              {inseln.slice().sort((a, b) => b[1].tag - a[1].tag).slice(0, 200).map(([k, e]) => (
                <tr key={k}><td><b>{e.name ? `„${e.name}“` : <span className="ti-leise">noch ohne Namen</span>}</b></td><td className="ti-leise">{e.felder} Felder · {GEBIETE[gebietVon(e.q, e.r)].name}</td>
                  <td>{e.anspruch === 1 ? <span className="ti-marke ti-marke-gold">von dir getauft</span> : e.anspruch === 2 ? <span className="ti-stumm">Kpt. {e.von ?? '?'}{e.seit ? `, ${tagText(e.seit)}` : ''}</span> : e.gemeldet ? <span className="ti-stumm">Meldung unterwegs</span> : <span className="ti-marke ti-marke-grau">ungemeldet</span>}</td>
                  <td className="ti-zahl"><button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => onZeige(e.q, e.r)}>Zeigen</button></td></tr>
              ))}
              {!inseln.length && <tr><td className="ti-leise">Noch keine Insel entdeckt. Hinaus mit dir!</td></tr>}
            </tbody></table>
          </div>
          <div>
            <h3 style={{ fontFamily: 'var(--ti-zier)', color: 'var(--ti-gold-stark)', marginBottom: 6 }}>Orte ({orte.length})</h3>
            <div className="ti-reihe">{Object.entries(orte.reduce<Record<string, number>>((z, [, e]) => { z[e.art] = (z[e.art] ?? 0) + 1; return z }, {})).map(([art, n]) => <span key={art} className="ti-wert">{n} <small>{ART_NAME[art]}</small></span>)}</div>
            <table className="ti-tabelle" style={{ marginTop: 8 }}><tbody>
              {orte.filter(([, e]) => e.art === 'hafen' || e.art === 'dorf').map(([k, e]) => { const o = ortVon(k.slice(1)); return o ? <tr key={k}><td><b>{ortName(o)}</b></td><td className="ti-leise">{ART_NAME[e.art]} · {GEBIETE[o.gebiet].name}</td><td>{e.anspruch === 1 ? <span className="ti-marke ti-marke-gold">Erstentdecker</span> : null}{s.kontore[o.key] ? <span className="ti-marke ti-marke-gut" style={{ marginLeft: 4 }}>Kontor {s.kontore[o.key]}</span> : null}</td><td className="ti-zahl"><button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => onZeige(e.q, e.r)}>Zeigen</button></td></tr> : null })}
            </tbody></table>
          </div>
        </div>
      )}

      {reiter === 'wunder' && (
        <div className="ti-gitter" data-ti-wunder>
          {wunder.map(([k, e]) => { const o = ortVon(k.slice(1)); if (!o) return null; const w = wunderVon(o); const f = feldAus(k.slice(1)); return (
            <div className="ti-kasten" key={k}>
              <Skizze motiv={w.motiv} breite={232} blass={!e.besucht} />
              <h3 style={{ marginTop: 8 }}>{e.name ? `„${e.name}“` : w.art}</h3>
              <p>{e.besucht ? w.text : 'Vom Schiff aus gesichtet. Wer an Land geht, kann es zeichnen.'}</p>
              <div className="ti-fuss"><span className="ti-stumm" style={{ marginRight: 'auto' }}>{w.art} · {GEBIETE[o.gebiet].name}{e.anspruch === 2 ? ` · Kpt. ${e.von ?? '?'}` : ''}</span><button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => onZeige(f.q, f.r)}>Zeigen</button></div>
            </div>) })}
          {!wunder.length && <p className="ti-leise">Noch kein Naturwunder gefunden. Auf der Karte tragen sie einen goldenen Stern.</p>}
        </div>
      )}

      {reiter === 'tiere' && (
        <div className="ti-gitter" data-ti-tiere>
          {TIERE.map(t => { const hat = s.atlas.tiere.includes(t.id); return (
            <div className="ti-kasten" key={t.id} style={{ opacity: hat ? 1 : 0.7 }}>
              <Skizze motiv={t.motiv} breite={232} blass={!hat} />
              <h3 style={{ marginTop: 8 }}>{hat ? t.name : '???'}</h3>
              <p>{hat ? t.text : ['Kommt häufig vor.', 'Selten zu sehen.', 'Seemannsgarn? Wer weiß.'][t.selten - 1]}</p>
            </div>) })}
        </div>
      )}

      {reiter === 'kurios' && (
        <div className="ti-gitter" data-ti-kurios>
          {[...KURIOSA, STERNPLATTE].filter(k => s.atlas.kurios.includes(k.id)).map(k => (
            <div className="ti-kasten" key={k.id}><Skizze motiv={k.motiv} breite={232} /><h3 style={{ marginTop: 8 }}>{k.name}</h3><p>{k.text}</p></div>
          ))}
          {!s.atlas.kurios.length && <p className="ti-leise">Die Vitrine in der Kajüte ist noch leer. Kuriositäten finden sich in Wracks, Ruinen und manchmal einfach im Meer.</p>}
        </div>
      )}

      {reiter === 'leute' && (
        <table className="ti-tabelle" data-ti-leute><tbody>
          {OFFIZIERE.map(o => { const kennt = s.atlas.offiziere.includes(o.id), anBord = s.offiziere.includes(o.id); return (
            <tr key={o.id} style={{ opacity: kennt ? 1 : 0.6 }}><td style={{ width: 190 }}><b>{kennt ? o.name : '???'}</b><div className="ti-stumm">{ROLLE_NAME[o.rolle]}{o.rang === 2 ? ' · Meister' : ''}</div></td>
              <td className="ti-leise">{kennt ? o.text : `Soll sich in ${o.gebiete.map(g => GEBIETE[g].kurz).join(', ')} herumtreiben.`}</td>
              <td className="ti-zahl">{anBord ? <span className="ti-marke ti-marke-gut">an Bord</span> : kennt ? <span className="ti-marke ti-marke-grau">bekannt</span> : null}</td></tr>) })}
        </tbody></table>
      )}

      {reiter === 'legende' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 680 }} data-ti-legende>
          <p className="ti-prosa" style={{ color: 'var(--ti-leise)' }}>Die Legende der Fortuna – ein Schiff, das vor vierzig Jahren aus Hamburg auslief und nie zurückkam. Ihre Spur zieht sich durch alle Meere. Einsiedler und Ruinen wissen mehr.</p>
          {LEGENDE.filter(k => k.nr <= s.atlas.legende).map(k => (
            <div className="ti-kasten" key={k.nr}><div className="ti-ueber">Kapitel {k.nr}</div><h3>{k.titel}</h3><p className="ti-prosa" style={{ color: 'var(--ti-ink)' }}>{k.text}</p></div>
          ))}
          {s.atlas.legende < 8
            ? <div className="ti-kasten"><h3>{s.atlas.legende ? 'Die Spur führt weiter' : 'Wo anfangen?'}</h3><p>{s.atlas.legende ? LEGENDE[s.atlas.legende - 1].hinweis : 'Frag die Einsiedler der Heimatsee – oder sieh dich in ihren Ruinen um.'}</p></div>
            : <div className="ti-kasten"><h3>Du hast die Fortuna gefunden.</h3><p>Die Legende ist zu Ende erzählt. Das Meer nicht.</p></div>}
        </div>
      )}
    </Raum>
  )
}
