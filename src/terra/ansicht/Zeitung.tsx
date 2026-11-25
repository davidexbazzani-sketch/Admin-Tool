// Terra Incognita — die Hafenzeitung: was seit dem letzten Besuch geschah. Erscheint einmal beim Öffnen des Raums.
import { GESTALT_NAME } from '../kampf/gegner'
import { gesuchtVon } from '../kern/festung'
import { GEBIETE, gebietVon } from '../kern/gebiete'
import { WAREN, wareNr } from '../kern/waren'
import { peilung } from '../kern/hex'
import { grosserGegner } from '../kern/piraten'
import { ART_NAME } from '../kern/namen'
import { RAENGE } from '../kern/schiff'
import { kontorErtrag } from '../kern/spiel'
import { tagesArt, TAGES_NAME } from '../kern/tagesfahrt'
import { windIn, windText } from '../kern/wind'
import { useGemeinsam } from '../netz/gemeinsam'
import { umwelt, useTerra } from '../speicher'
import { tagRelativ, tagText, wochentag } from '../zeit'
import { Blatt, zahl } from './teile'

export default function Zeitung({ onZu, onTagesfahrt }: { onZu: () => void; onTagesfahrt: () => void }) {
  const stand = useTerra(s => s.spiel?.stand)
  // (der erste Abgleich verbucht Überfälle erst nach dem Öffnen: dann neu zeichnen)
  useTerra(s => s.rev)
  const funde = useGemeinsam(s => s.funde)
  const kapitaene = useGemeinsam(s => s.kapitaene)
  const verbunden = useGemeinsam(s => s.verbunden)
  const gross = useGemeinsam(s => s.gross)
  const buende = useGemeinsam(s => s.buende)
  if (!stand) return null
  const u = umwelt()
  const ertrag = kontorErtrag(stand, u.jetzt)
  const offen = Object.values(stand.entdeckt).filter(e => !e.gemeldet).length
  const wind = windIn(gebietVon(stand.q, stand.r), u.tag)
  const tagDran = !stand.tagesfahrt[String(u.tag)]
  const neues = funde.filter(f => u.tag - f.tag <= 7).slice(0, 5)
  const andere = kapitaene.filter(k => !k.ich).slice(0, 3)
  // Stufe 2: der große Gegner, Kopfgeld, Anträge an das eigene Bündnis
  const g = grosserGegner(u.tag)
  const antraege = stand.bund?.rolle === 'gruender' ? buende.find(b => b.key === stand.bund?.key)?.antraege.length ?? 0 : 0
  const grossZeile = gross && gross.teilnehmer.length
    ? gross.besiegt ? `${GESTALT_NAME[g.gestalt ?? 'krake']} ist bezwungen – ${gross.teilnehmer.length} ${gross.teilnehmer.length === 1 ? 'Kapitän hat' : 'Kapitäne haben'} mitgekämpft.` : `${GESTALT_NAME[g.gestalt ?? 'krake']}: ${Math.round((gross.schaden * 100) / Math.max(1, gross.hp))} % geschafft, ${gross.teilnehmer.length} ${gross.teilnehmer.length === 1 ? 'Kapitän kämpft' : 'Kapitäne kämpfen'} mit.`
    : `${GESTALT_NAME[g.gestalt ?? 'krake']} ist gesichtet worden – im ${peilung(stand.q, stand.r, g.q, g.r)} deiner Position. Alle Kapitäne können sich an ihm versuchen.`
  return (
    <Blatt kennung="zeitung" bild="hafen" ueber={`Hafenzeitung · ${tagText(u.tag)}`} titel={`Willkommen an Bord, Kpt. ${stand.kapitaen}`} onZu={onZu}
      fuss={<>{tagDran && <button type="button" className="ti-knopf" onClick={onTagesfahrt} data-ti-zur-tagesfahrt>Zur Tagesfahrt</button>}<button type="button" className="ti-knopf ti-knopf-gold" onClick={onZu} data-ti-weiter autoFocus>An Deck</button></>}>
      <ul className="ti-folgen" data-ti-zeitung>
        <li>Wetter in der {GEBIETE[gebietVon(stand.q, stand.r)].name}: {windText(wind)}.</li>
        {ertrag > 0 && <li>Deine Kontore haben {zahl(ertrag)} Gold erwirtschaftet – ausgezahlt wird im nächsten Hafen.</li>}
        {offen > 0 && <li>{offen} {offen === 1 ? 'Entdeckung wartet' : 'Entdeckungen warten'} im Logbuch auf die Meldung bei der Gilde.</li>}
        <li>Tagesfahrt heute: {TAGES_NAME[tagesArt(wochentag(u.tag))]}{tagDran ? '' : ' – schon gefahren'}.</li>
        <li data-ti-zeitung-gross>{grossZeile}</li>
        {stand.kampf.kopfgeld > 0 && <li>{zahl(stand.kampf.kopfgeld)} Gold Kopfgeld für bezwungene Piraten liegen beim Hafenmeister bereit.</li>}
        {antraege > 0 && <li>{antraege} {antraege === 1 ? 'Kapitän bittet' : 'Kapitäne bitten'} um Aufnahme in dein Bündnis „{stand.bund?.name}“.</li>}
        {/* Stufe 3: die eigene Festung, ein offener Bericht, Kopfgeld auf mich */}
        {stand.festung && stand.festung.chronik.filter(c => u.tag - c.tag <= 3 && (c.zaehlt || c.aus !== 'sieg')).slice(-3).map(c => (
          <li key={`f${c.n}`} data-ti-zeitung-festung>{c.zaehlt ? `Kpt. ${c.vn || c.von} hat deine Festung „${stand.festung?.name}“ überfallen${c.beute ? ` und ${c.beute} ${WAREN[wareNr(stand.festung?.ware ?? '')]?.name ?? ''} erbeutet` : ''} (${tagRelativ(c.tag, u.tag)}). Die Wiederholung steht im Raum „Festung“.` : `Deine Festung „${stand.festung?.name}“ hat Kpt. ${c.vn || c.von} zurückgeschlagen (${tagRelativ(c.tag, u.tag)}).`}</li>
        ))}
        {stand.festung && stand.festung.lager > 0 && <li>Im Lager deiner Festung liegen {stand.festung.lager} {WAREN[wareNr(stand.festung.ware)]?.name ?? ''}.</li>}
        {stand.kampf.bericht && <li>Der Bericht über deine Belagerung von „{stand.kampf.bericht.ziel.n}“ wartet noch auf die Zustellung an die Admiralität (im Raum „Festung“ lässt er sich erneut zustellen – oder ab dem nächsten Tag verwerfen).</li>}
        {(() => { const [kg] = gesuchtVon(stand, u.tag); return kg > 0 ? <li>Die Admiralität hat {zahl(kg)} Gold Kopfgeld auf dich ausgesetzt – wer deine Festung nimmt, kassiert es.</li> : null })()}
      </ul>
      {neues.length > 0 && <>
        <h3>Von den Meeren</h3>
        <ul className="ti-folgen">
          {neues.map(f => <li key={f.u + f.key} style={{ fontWeight: 400 }}>Kpt. <b>{f.von}</b> meldet {f.key.startsWith('i') ? 'eine Insel' : ART_NAME[f.art] ?? 'einen Fund'}{f.name ? <> – getauft <b>„{f.name}“</b></> : ''} <span className="ti-stumm">({tagRelativ(f.tag, u.tag)})</span></li>)}
        </ul>
      </>}
      {andere.length > 0 && <p className="ti-stumm" style={{ marginTop: 10 }}>Auf denselben Meeren: {andere.map(k => `Kpt. ${k.n} (${RAENGE[k.rang]?.name ?? ''})`).join(', ')}{kapitaene.length - 1 > andere.length ? ` und ${kapitaene.length - 1 - andere.length} weitere` : ''}.</p>}
      {verbunden === false && <p className="ti-stumm" style={{ marginTop: 10 }}>Das Netzlaufwerk ist gerade nicht erreichbar. Gespielt wird trotzdem – Meldungen und Taufen werden nachgereicht, sobald es wieder da ist.</p>}
    </Blatt>
  )
}
