// Terra Incognita — Raum „Festung“ (Stufe 3): die eigene Festung (gründen, ausbauen, reparieren, Ware abholen,
// Überfälle mit Wiederholung) und die Festungen der Kollegen (Schutz, Kopfgeld, Kurs setzen).
import { useEffect, useState } from 'react'
import type { KampfAkte } from '../kampf/kampf'
import {
  BAUTEN, baue, baupreis, beuteVon, ertragRate, erntet, FESTUNG_PREIS, FESTUNG_RANG, gesuchtVon, inselnZumGruenden, kammerPlaetze, lagerVon,
  NEBEL_TAGE, rateVon, reparaturPreis, schutzVon, sicherVon, vorDerFestung, type FestungBild,
} from '../kern/festung'
import { abstand, peilung } from '../kern/hex'
import { RAENGE, rangVon } from '../kern/schiff'
import { BAU_ARTEN, type BauArt } from '../kern/stand'
import { WAREN, wareNr } from '../kern/waren'
import { gibFestungAuf, gruendeFestung, holeWare, repariereFestung, stelleZu, useFestungNetz, verwirfBericht } from '../netz/festungen'
import { useGemeinsam, type Kapitaen } from '../netz/gemeinsam'
import { umwelt, useTerra } from '../speicher'
import { klang } from '../ton/klang'
import { tagRelativ, tagText } from '../zeit'
import { Bild, Raum, toast, zahl, type Reiter } from './teile'

const AUS_TEXT: Record<string, string> = { sieg: 'genommen', niederlage: 'zurückgeschlagen', flucht: 'abgedreht', remis: 'standgehalten' }
const wareName = (id: string): string => WAREN[wareNr(id)]?.name ?? id
const felder = (n: number): string => `${n} ${n === 1 ? 'Feld' : 'Felder'}`

/** Stand einer fremden Festung in Worten (für die Liste und die Karte) */
export function festungsStatus(k: Kapitaen, heute: number, eigeneFestung: boolean, gleicherBund: boolean): { text: string; art: 'gut' | 'rot' | 'grau' | 'gold'; angreifbar: boolean } {
  const fe = k.fe as FestungBild
  const schutz = schutzVon(fe, k.tag, heute)
  if (schutz === 'nebel') return { text: 'im Nebel', art: 'grau', angreifbar: false }
  if (schutz === 'bau') return { text: 'noch im Bau', art: 'grau', angreifbar: false }
  if (schutz === 'schonfrist') return { text: `Schonfrist bis ${tagText(fe.sb)}`, art: 'grau', angreifbar: false }
  if (gleicherBund) return { text: 'Bündnis', art: 'gut', angreifbar: false }
  if (!eigeneFestung) return { text: 'angreifbar – für Festungsherren', art: 'gold', angreifbar: false }
  return { text: 'angreifbar', art: 'rot', angreifbar: true }
}

export default function Festung({ onZu, onKurs, onWiederholung }: { onZu: () => void; onKurs: (q: number, r: number) => void; onWiederholung: (akte: KampfAkte, titel: string, meineId: number) => void }) {
  const spiel = useTerra(s => s.spiel)
  useTerra(s => s.rev)
  const tue = useTerra(s => s.tue)
  const kapitaene = useGemeinsam(s => s.kapitaene)
  const buende = useGemeinsam(s => s.buende)
  const verbunden = useGemeinsam(s => s.verbunden)
  const [reiter, setReiter] = useState('meine')
  const [name, setName] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [aufgeben, setAufgeben] = useState(false)
  const belagerer = useFestungNetz(st => st.belagerer)

  // beim Öffnen den Ertrag bis jetzt verbuchen (das Lager soll stimmen, das man sieht)
  useEffect(() => { if (useTerra.getState().spiel?.stand.festung) tue(sp => (sp.stand.festung ? erntet(sp.stand.festung, umwelt().jetzt) : 0)) }, [tue])

  if (!spiel) return null
  const s = spiel.stand, f = s.festung, u = umwelt(), mich = s.benutzer
  const andere = kapitaene.filter(k => !k.ich && k.fe)
  const meinBund = s.bund ? buende.find(b => b.key === s.bund?.key) : undefined
  const reiterListe: Reiter[] = [{ id: 'meine', name: f ? f.name : 'Eigene Festung' }, { id: 'andere', name: `Festungen der Kollegen (${andere.length})` }, ...(f ? [{ id: 'chronik', name: `Überfälle (${f.chronik.length})` }] : [])]

  async function gruenden(insel: string): Promise<void> {
    if (laeuft) return
    setLaeuft(true)
    const fehler = await gruendeFestung(insel, name)
    setLaeuft(false)
    if (fehler) toast(fehler)
    else { klang('fanfare'); setName('') }
  }

  const unter = f
    ? `${wareName(f.ware)} · Stufe ${f.stufe} · ${f.verteidigt} verteidigt · ${f.gepluendert} geplündert`
    : 'Wer eine Festung hat, kann die Festungen anderer angreifen – und wird selbst angreifbar.'

  // ein Bericht über die letzte Belagerung, der noch nicht bei der Admiralität ist (sperrt jede weitere Belagerung):
  // erneut zustellen — oder, wenn das dauerhaft nicht geht (seit gestern), verwerfen: Ein Sieg gilt dann als Übung
  const bericht = s.kampf.bericht
  const berichtKasten = bericht && (
    <div className="ti-kasten" style={{ marginBottom: 14 }} data-ti-bericht-offen>
      <h3>Bericht an die Admiralität</h3>
      <p>Die Belagerung von „{bericht.ziel.n}“ (Kpt. {bericht.ziel.kn || bericht.ziel.u}, {tagRelativ(bericht.tag, u.tag)}) ist noch nicht zugestellt. Bis dahin {bericht.aus === 'sieg' ? 'bleibt die Beute offen, und ' : ''}geht keine weitere Belagerung.</p>
      <div className="ti-reihe" style={{ marginTop: 8 }}>
        <button type="button" className="ti-knopf ti-knopf-gold" disabled={laeuft || verbunden !== true} onClick={() => { setLaeuft(true); void stelleZu().then(z => { setLaeuft(false); if (!z) toast('Das Netzlaufwerk antwortet gerade nicht – der Bericht wird später zugestellt.'); else if (z.titel) toast(`${z.titel}: ${z.zeilen.join(' · ')}`); else toast('Der Bericht ist zugestellt.') }) }} data-ti-bericht-zustellen>Jetzt zustellen</button>
        {bericht.tag < u.tag && <button type="button" className="ti-knopf ti-knopf-leise" disabled={laeuft} onClick={() => { verwirfBericht(); toast(bericht.aus === 'sieg' ? 'Der Bericht ist verworfen – das Gefecht gilt als Übung.' : 'Der Bericht ist verworfen.') }} title="Wenn er sich dauerhaft nicht zustellen lässt: Ein Sieg gilt dann als Übung (keine Beute), die Schäden am Schiff sind behoben." data-ti-bericht-verwerfen>Verwerfen (gilt als Übung)</button>}
      </div>
    </div>
  )

  return (
    <Raum kennung="festung" titel="Festung" unter={unter} reiter={reiterListe} aktiv={reiter} onReiter={setReiter} onZu={onZu}>
      {reiter === 'meine' && berichtKasten}
      {reiter === 'meine' && !f && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-ti-festung-neu>
          <div className="ti-kasten" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Bild name="bollwerk" className="ti-gross-bild" />
            <div style={{ flex: 1, minWidth: 240 }}>
              <h3>Eine eigene Festung</h3>
              <p>Auf einer entdeckten Insel: Mauern, Kanonentürme, Hafenkette, Lagerhaus, Schatzkammer, Wachschiffe. Die Insel erzeugt Waren in echter Zeit; das Lagerhaus fasst zwei Tage Ertrag (ausgebaut bis vier) – abholen kannst du sie, wenn du vor der Festung liegst.</p>
              <p style={{ marginTop: 6 }}><b>Ganz freiwillig:</b> Nur wer eine Festung hat, kann die Festungen anderer angreifen – und wird selbst angegriffen. Ein Schiff auf See greift kein Kollege an. Wer {NEBEL_TAGE} Tage nicht spielt, liegt im Nebel; nach jedem Überfall gilt eine Schonfrist.</p>
            </div>
          </div>
          <div className="ti-kasten">
            <h3>Was es braucht</h3>
            <ul className="ti-folgen">
              <li>{rangVon(s.ruhm) >= FESTUNG_RANG ? '✓' : '✗'} Rang {RAENGE[FESTUNG_RANG].name} (du: {RAENGE[rangVon(s.ruhm)].name})</li>
              <li>{s.gold >= FESTUNG_PREIS ? '✓' : '✗'} {zahl(FESTUNG_PREIS)} Gold</li>
              <li>Das Schiff ankert vor einer getauften, gemeldeten Insel außerhalb der Heimatsee</li>
              <li>Die Verbindung zum Netzlaufwerk (auf jeder Insel steht höchstens eine Festung)</li>
            </ul>
            {(() => {
              const inseln = inselnZumGruenden(s)
              if (!inseln.length) return <p className="ti-stumm" style={{ marginTop: 8 }}>Gerade liegt keine passende Insel neben dem Schiff.</p>
              return (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input className="ti-eingabe" value={name} maxLength={28} placeholder="Name der Festung (sonst „Fort …“)" onChange={e => setName(e.target.value)} data-ti-festung-name />
                  {inseln.map(i => {
                    const e = s.entdeckt[i]
                    return (
                      <div className="ti-reihe" key={i}>
                        <span>Insel <b>{e?.name || 'ohne Namen'}</b>{e?.felder ? ` · ${e.felder} Felder` : ''}</span>
                        <button type="button" className="ti-knopf ti-knopf-gold" disabled={laeuft || verbunden !== true || rangVon(s.ruhm) < FESTUNG_RANG || s.gold < FESTUNG_PREIS} onClick={() => void gruenden(i)} data-ti-festung-gruenden>Hier gründen ({zahl(FESTUNG_PREIS)} Gold)</button>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {reiter === 'meine' && f && (() => {
        const rate = rateVon(f), kap = lagerVon(f), sicher = sicherVon(f), repar = reparaturPreis(f)
        const tagesErtrag = Math.floor((rate * 24) / 100), ware = wareName(f.ware)
        const schutzText = u.tag <= f.seit + 2 ? `Noch im Bau – geschützt bis ${tagText(f.seit + 2)}` : u.tag <= f.schonBis ? `Schonfrist bis ${tagText(f.schonBis)}` : 'Angreifbar (außer im Nebel)'
        const [kg, kgBis] = gesuchtVon(s, u.tag)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-ti-festung>
            <div className="ti-gitter">
              <div className="ti-kasten" data-ti-festung-lager>
                <h3>Lager</h3>
                <div className="ti-balken" style={{ width: '100%', height: 10, margin: '6px 0' }}><i style={{ width: `${Math.round((f.lager * 100) / Math.max(1, kap))}%` }} /></div>
                <p><b>{f.lager}</b> von {kap} {ware} · etwa {tagesErtrag} am Tag</p>
                <p>Davon sicher in der Schatzkammer: {Math.min(f.lager, sicher)}. Ein Plünderer nimmt die Hälfte des Rests mit.</p>
                <div className="ti-reihe" style={{ marginTop: 8 }}>
                  <button type="button" className="ti-knopf ti-knopf-gold" disabled={!vorDerFestung(s) || f.lager <= 0 || laeuft} onClick={() => { setLaeuft(true); void holeWare().then(a => { setLaeuft(false); if (a.ok) { klang('muenze'); toast(a.text) } else toast(a.grund) }) }} data-ti-festung-holen>Ware an Bord nehmen</button>
                  {!vorDerFestung(s) && <span className="ti-stumm">Dafür muss das Schiff vor der Festung liegen ({peilung(s.q, s.r, f.q, f.r)}, {felder(abstand(s.q, s.r, f.q, f.r))}).</span>}
                </div>
              </div>
              <div className="ti-kasten" data-ti-festung-schutz>
                <h3>Schutz</h3>
                <p>{schutzText}</p>
                {repar > 0 && <p style={{ marginTop: 4 }}>Schaden nach dem letzten Überfall: Mauern {f.schaden.mauer} %, Türme {f.schaden.tuerme} %{f.schaden.wache ? `, ${f.schaden.wache} Wachschiff${f.schaden.wache > 1 ? 'e' : ''} verloren` : ''}.</p>}
                {kg > 0 && <p style={{ marginTop: 4 }}><span className="ti-marke ti-marke-rot">Kopfgeld {zahl(kg)} Gold</span> auf dich, bis {tagText(kgBis)} – wer deine Festung nimmt, kassiert es.</p>}
                {belagerer.length > 0 && <p className="ti-fehler" style={{ marginTop: 4 }} data-ti-festung-belagert>Gerade {belagerer.length > 1 ? 'belagern' : 'belagert'} Kpt. {belagerer.join(' und Kpt. ')} deine Festung – solange bleiben Lager und Bautrupp in den Mauern.</p>}
                <div className="ti-reihe" style={{ marginTop: 8 }}>
                  {repar > 0 && <button type="button" className="ti-knopf" disabled={s.gold < repar || laeuft} onClick={() => { setLaeuft(true); void repariereFestung().then(a => { setLaeuft(false); if (a.ok) { klang('muenze'); toast(a.text) } else toast(a.grund) }) }} data-ti-festung-reparieren>Ausbessern ({zahl(repar)} Gold)</button>}
                  <button type="button" className="ti-knopf ti-knopf-leise ti-knopf-klein" onClick={() => onKurs(f.q, f.r)} data-ti-festung-kurs>Kurs auf die Festung</button>
                </div>
              </div>
            </div>
            <div className="ti-kasten">
              <h3>Bauten</h3>
              <p>Ein Bautrupp wird von überall beauftragt – bezahlt wird gleich. Jede Baustufe lockt Siedler an: ein Zwanzigstel mehr Ertrag.</p>
              <table className="ti-tabelle" style={{ marginTop: 8 }} data-ti-bauten>
                <tbody>
                  {BAU_ARTEN.map((art: BauArt) => {
                    const b = BAUTEN[art], p = baupreis(f, art)
                    return (
                      <tr key={art} data-ti-bau={art}>
                        <td style={{ width: '24%' }}><b>{b.name}</b><br /><span className="ti-stumm">Stufe {f.bau[art]} von {b.max}</span></td>
                        <td className="ti-leise">{b.text}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {p === null ? <span className="ti-marke ti-marke-gut">fertig</span>
                            : <button type="button" className="ti-knopf ti-knopf-klein" disabled={s.gold < p} onClick={() => { const a = tue(sp => baue(sp, art, umwelt())); if (a.ok) { klang('muenze'); toast(a.text) } else toast(a.grund) }} data-ti-bauen={art}>Stufe {f.bau[art] + 1}: {zahl(p)} Gold</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {Object.keys(f.vergeltung).some(k => f.vergeltung[k] >= u.tag) && (
              <div className="ti-kasten" data-ti-vergeltung>
                <h3>Vergeltung</h3>
                <p>Wer dich überfallen hat, dessen Festung bringt dir binnen sieben Tagen eine Belohnung der Admiralität obendrauf:</p>
                <ul className="ti-folgen">{Object.entries(f.vergeltung).filter(([, bis]) => bis >= u.tag).map(([wer, bis]) => <li key={wer}>Kpt. {kapitaene.find(k => k.u === wer)?.n || wer} – bis {tagText(bis)}</li>)}</ul>
              </div>
            )}
            <div className="ti-reihe">
              {!aufgeben ? <button type="button" className="ti-knopf ti-knopf-leise ti-knopf-klein" onClick={() => setAufgeben(true)} data-ti-festung-aufgeben>Festung aufgeben …</button> : (
                <>
                  <span className="ti-fehler">Wirklich? Bauten und Lager sind dann verloren, die Insel ist wieder frei.</span>
                  <button type="button" className="ti-knopf ti-knopf-klein" onClick={() => { setAufgeben(false); void gibFestungAuf().then(fe => { if (fe) toast(fe); else { toast('Die Festung ist aufgegeben.'); setReiter('meine') } }) }} data-ti-festung-aufgeben-ja>Ja, aufgeben</button>
                  <button type="button" className="ti-knopf ti-knopf-leise ti-knopf-klein" onClick={() => setAufgeben(false)}>Nein</button>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {reiter === 'chronik' && f && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-ti-festung-chronik>
          {!f.chronik.length ? <p className="ti-leise">Noch hat niemand deine Festung angegriffen.</p> : [...f.chronik].reverse().map(c => (
            <div className="ti-kasten" key={c.n} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }} data-ti-festung-angriff>
              <span style={{ flex: 1, minWidth: 200 }}><b>Kpt. {c.vn || c.von}</b> · {tagRelativ(c.tag, u.tag)} · {c.aus === 'sieg' ? (c.zaehlt ? `genommen${c.beute ? `, ${c.beute} ${wareName(f.ware)} erbeutet` : ''}` : 'genommen – zählte nicht (ein anderer war schneller)') : `${AUS_TEXT[c.aus] ?? c.aus} – verteidigt`}</span>
              <button type="button" className="ti-knopf ti-knopf-klein" onClick={() => onWiederholung(c.akte, `Angriff von Kpt. ${c.vn || c.von}`, 10)} data-ti-festung-wiederholung>Wiederholung</button>
            </div>
          ))}
        </div>
      )}

      {reiter === 'andere' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-ti-festungen>
          {verbunden !== true && <p className="ti-leise">Keine Verbindung zum Netzlaufwerk – was die Kollegen gebaut haben, ist gerade nicht zu sehen.</p>}
          {verbunden === true && !andere.length && <p className="ti-leise">Noch hat kein Kollege eine Festung.</p>}
          {andere.map(k => {
            const fe = k.fe as FestungBild, gleich = !!meinBund && meinBund.mitglieder.includes(mich) && meinBund.mitglieder.includes(k.u)
            const st = festungsStatus(k, u.tag, !!f, gleich)
            const wehr = fe.b[0] + fe.b[1] + fe.b[5], beute = beuteVon(fe), rate = ertragRate(fe.st, fe.w, fe.b)
            return (
              <div className="ti-kasten" key={k.u} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }} data-ti-fremde-festung={k.u}>
                <span style={{ flex: 1, minWidth: 220 }}>
                  <b>„{fe.n}“</b> von Kpt. {k.n || k.u}<br />
                  <span className="ti-stumm">Mauern {fe.b[0]} · Türme {fe.b[1]} · Kette {fe.b[2]} · Wachschiffe {fe.b[5]}{fe.sd[0] ? ' · beschädigt' : ''} · {wareName(fe.w)}, etwa {beute} zu holen (sicher: {kammerPlaetze(rate, fe.b[4])}) · Wehr {wehr}</span>
                </span>
                <span className={`ti-marke ti-marke-${st.art}`} data-ti-festung-status={st.angreifbar ? 'angreifbar' : 'geschuetzt'}>{st.text}</span>
                {k.kg && k.kg[1] >= u.tag && k.kg[0] > 0 && <span className="ti-marke ti-marke-rot" title="Wer die Festung nimmt, kassiert das Kopfgeld der Admiralität">Kopfgeld {zahl(k.kg[0])}</span>}
                {f?.vergeltung[k.u] !== undefined && (f.vergeltung[k.u] ?? 0) >= u.tag && <span className="ti-marke ti-marke-gold">Vergeltung</span>}
                <span className="ti-stumm">{peilung(s.q, s.r, fe.q, fe.r)}, {felder(abstand(s.q, s.r, fe.q, fe.r))}</span>
                <button type="button" className="ti-knopf ti-knopf-klein" onClick={() => onKurs(fe.q, fe.r)} data-ti-festung-kurs={k.u}>Kurs setzen</button>
              </div>
            )
          })}
        </div>
      )}
    </Raum>
  )
}
