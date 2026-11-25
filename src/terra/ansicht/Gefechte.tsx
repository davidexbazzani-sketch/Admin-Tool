// Terra Incognita — Gefechte: der große Gegner der Woche (gemeinsam mit allen Kapitänen), die Chronik der eigenen Kämpfe
// (jeder als Wiederholung ansehbar), Trophäen und Bilanz.
import { useState } from 'react'
import { GEGNER_NAME, GESTALT_NAME, type Gegner } from '../kampf/gegner'
import type { KampfAkte } from '../kampf/kampf'
import { grossAnteil } from '../kern/gefecht'
import { abstand, peilung } from '../kern/hex'
import { grosserGegner, wocheVon } from '../kern/piraten'
import { GROSS_LOHN, grossBonus, useGemeinsam } from '../netz/gemeinsam'
import { umwelt, useTerra } from '../speicher'
import { tagRelativ } from '../zeit'
import { gegnerBild } from './Stellung'
import { Bild, Raum, zahl, type Reiter } from './teile'

const AUSGANG: Record<string, [string, string]> = { sieg: ['Sieg', 'gut'], niederlage: ['Niederlage', 'rot'], flucht: ['entkommen', 'grau'], remis: ['ohne Entscheidung', 'grau'] }

export default function Gefechte({ onZu, onWiederholung, onKurs }: { onZu: () => void; onWiederholung: (akte: KampfAkte, titel: string) => void; onKurs: (g: Gegner) => void }) {
  const spiel = useTerra(s => s.spiel)
  useTerra(s => s.rev)
  const gross = useGemeinsam(s => s.gross)
  const verbunden = useGemeinsam(s => s.verbunden)
  const [reiter, setReiter] = useState('gross')
  if (!spiel) return null
  const s = spiel.stand, u = umwelt(), w = wocheVon(u.tag), g = grosserGegner(u.tag)
  const meins = s.gross.w === w ? s.gross : null
  const heuteSchon = !!meins && meins.tag === u.tag && meins.kaempfe > 0
  const dabei = !!meins && meins.kaempfe > 0
  const max = (gross?.hp ?? 0), rest = Math.max(0, max - (gross?.schaden ?? 0))
  const anteil = dabei && gross && gross.schaden > 0 ? Math.floor((GROSS_LOHN * gross.hp * (meins?.schaden ?? 0)) / gross.schaden) : 0
  const bonus = grossBonus()
  let versenkt = 0
  for (const n of Object.values(s.kampf.versenkt)) versenkt += n
  const reiterListe: Reiter[] = [{ id: 'gross', name: 'Der große Gegner' }, { id: 'chronik', name: `Chronik (${s.kampf.chronik.length})` }, { id: 'trophaeen', name: `Trophäen (${Object.keys(s.kampf.trophaeen).length})` }]
  return (
    <Raum kennung="gefechte" titel="Gefechte" unter={`${s.kampf.siege} ${s.kampf.siege === 1 ? 'Sieg' : 'Siege'} · ${versenkt} Gegner bezwungen${s.kampf.kopfgeld ? ` · ${zahl(s.kampf.kopfgeld)} Gold Kopfgeld warten im nächsten Hafen` : ''}`} reiter={reiterListe} aktiv={reiter} onReiter={setReiter} onZu={onZu}>
      {reiter === 'gross' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-ti-gross>
          <div className="ti-kasten" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Bild name={gegnerBild(g)} className="ti-gross-bild" />
            <div style={{ flex: 1, minWidth: 240 }}>
              <h3>{GESTALT_NAME[g.gestalt ?? 'krake']}</h3>
              <p>Diese Woche gesichtet im {peilung(s.q, s.r, g.q, g.r)}, etwa {Math.max(1, abstand(s.q, s.r, g.q, g.r))} Felder von dir – jeden Tag an einem anderen Ort, immer rund 20 Felder vor Hamburg.</p>
              <p style={{ marginTop: 6 }}>Alle Kapitäne kämpfen gegen denselben Gegner. Wer zum ersten Mal in der Woche angreift, macht ihn zäher ({grossAnteil(s.klasse)} Punkte für {s.klasse <= 1 ? 'dein Boot' : 'dein Schiff'}) – und bringt doch mehr Schaden, als er hinzufügt. Allein ist er in etwa fünf Angriffen zu schaffen. Ein Angriff je Tag, höchstens sechs Runden.</p>
              <div className="ti-reihe" style={{ marginTop: 8 }}>
                <button type="button" className="ti-knopf ti-knopf-gold" onClick={() => onKurs(g)} data-ti-gross-kurs>Kurs setzen</button>
                {heuteSchon && <span className="ti-marke ti-marke-grau">heute schon angegriffen</span>}
                {bonus > 0 && <span className="ti-marke ti-marke-gut" title="Bündnis-Kameraden haben diese Woche mitgekämpft">Bündnis-Bonus +{bonus} % Schaden</span>}
              </div>
            </div>
          </div>
          {verbunden !== true ? (
            <p className="ti-leise">Keine Verbindung zum Netzlaufwerk – wie es um den großen Gegner steht, ist gerade nicht zu sehen. Angreifen geht nur mit Verbindung.</p>
          ) : !gross || !gross.teilnehmer.length ? (
            <p className="ti-leise">Diese Woche hat ihn noch niemand angegriffen – der erste Treffer kann deiner sein.</p>
          ) : (
            <>
              <div>
                <div className="ti-balken" style={{ width: '100%', height: 14 }} data-ti-gross-rest><i style={{ width: `${Math.round((rest * 100) / Math.max(1, max))}%`, background: 'var(--ti-gefahr)' }} /></div>
                <p className="ti-stumm" style={{ marginTop: 4 }}>{gross.besiegt ? `Bezwungen${gross.besiegtVon ? ` – den letzten Treffer setzte Kpt. ${gross.besiegtVon}` : ''}${gross.besiegtTag ? ` (${tagRelativ(gross.besiegtTag)})` : ''}. Die Beute ist nach Anteil am Schaden verteilt.` : `Noch ${zahl(rest)} von ${zahl(max)} · ${gross.teilnehmer.length} ${gross.teilnehmer.length === 1 ? 'Kapitän kämpft' : 'Kapitäne kämpfen'} mit`}</p>
              </div>
              <table className="ti-tabelle" data-ti-gross-liste>
                <thead><tr><th>Kapitän</th><th className="ti-zahl">Schaden</th><th className="ti-zahl">Anteil</th></tr></thead>
                <tbody>{gross.teilnehmer.map(t => (
                  <tr key={t.u} style={t.ich ? { background: 'var(--ti-gold-weich)' } : undefined}><td><b>{t.n}</b>{t.ich && <span className="ti-marke ti-marke-gold" style={{ marginLeft: 6 }}>du</span>}</td><td className="ti-zahl">{zahl(t.schaden)}</td><td className="ti-zahl">{Math.round((t.schaden * 100) / Math.max(1, gross.schaden))} %</td></tr>
                ))}</tbody>
              </table>
              {dabei && <p className="ti-leise">Dein Schaden diese Woche: <b>{zahl(meins?.schaden ?? 0)}</b> in {meins?.kaempfe} {meins?.kaempfe === 1 ? 'Angriff' : 'Angriffen'}. {gross.besiegt ? (s.gross.bezahlt.includes(w) ? 'Dein Anteil an der Beute ist ausgezahlt.' : 'Dein Anteil wird beim nächsten Abgleich ausgezahlt.') : `Fällt er, bekommst du nach heutigem Stand etwa ${zahl(anteil)} Gold; entkommt er bis Sonntag, zwei Fünftel davon.`}</p>}
            </>
          )}
        </div>
      )}

      {reiter === 'chronik' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-ti-chronik>
          {!s.kampf.chronik.length && <p className="ti-leise">Noch kein Gefecht. Piraten stehen auf der Karte – und manche lauern dort, wo man sie nicht sieht.</p>}
          {s.kampf.chronik.slice().reverse().map(c => (
            <div key={c.nr} className="ti-kasten" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }} data-ti-chronik-eintrag={c.nr}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3 style={{ marginBottom: 2 }}>{c.titel}</h3>
                <p className="ti-stumm">{tagRelativ(c.tag)} · {c.art === 'hinterhalt' ? 'aus dem Hinterhalt' : c.art === 'gestellt' ? 'gestellt' : 'eigener Angriff'} · <span className={`ti-marke ti-marke-${AUSGANG[c.ausgang][1]}`}>{AUSGANG[c.ausgang][0]}</span></p>
                {c.zeilen.length > 0 && <p style={{ marginTop: 4 }}>{c.zeilen.slice(0, 3).join(' · ')}</p>}
              </div>
              <button type="button" className="ti-knopf ti-knopf-klein" onClick={() => onWiederholung(c.akte, c.titel)} data-ti-wiederholung={c.nr}>Wiederholung</button>
            </div>
          ))}
          {s.kampf.chronik.length > 0 && <p className="ti-stumm">Die letzten zehn Gefechte bleiben im Logbuch – jedes lässt sich Zug um Zug noch einmal ansehen.</p>}
        </div>
      )}

      {reiter === 'trophaeen' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-ti-trophaeen>
          <div className="ti-gitter">
            <div className="ti-kasten"><h3>Bilanz</h3><p>{s.kampf.siege} Siege · {s.kampf.niederlagen} Niederlagen · {s.kampf.fluchten} Fluchten · {s.kampf.zoelle}× Zoll gezahlt</p></div>
            <div className="ti-kasten"><h3>Bezwungen</h3><p>{Object.entries(s.kampf.versenkt).map(([art, n]) => `${n}× ${GEGNER_NAME[art as keyof typeof GEGNER_NAME] ?? art}`).join(' · ') || 'Noch niemand.'}</p></div>
          </div>
          <table className="ti-tabelle"><tbody>
            {Object.entries(s.kampf.trophaeen).map(([k, name]) => <tr key={k}><td>{k.startsWith('p') ? 'Piratenkapitän' : k.startsWith('n') ? 'Piratennest' : 'Ungeheuer'}</td><td><b>{name}</b></td></tr>)}
            {!Object.keys(s.kampf.trophaeen).length && <tr><td className="ti-leise">Wer einen Piratenkapitän, ein Nest oder ein Ungeheuer bezwingt, findet es hier wieder.</td></tr>}
          </tbody></table>
        </div>
      )}
    </Raum>
  )
}
