// Terra Incognita — Bündnisse: gründen, um Aufnahme bitten, aufnehmen, austreten. Mitglied ist nur, wer selbst
// „Mitglied“ sagt und beim Gründer auf der Liste steht (siehe kern/buendnis.ts).
import { useState } from 'react'
import { BUND_MAX, BUND_PREIS, BUND_RANG, type Bund } from '../kern/buendnis'
import { RAENGE, rangVon } from '../kern/schiff'
import { beantrageBund, entlasseMitglied, entscheideAntrag, gruendeBund, sicher as sicherName, useGemeinsam, verlasseBund } from '../netz/gemeinsam'
import { useTerra } from '../speicher'
import { FlaggenWahl } from './Einstellungen'
import { Flagge } from './Skizze'
import { toast, zahl } from './teile'

export default function Buendnisse() {
  const spiel = useTerra(s => s.spiel)
  useTerra(s => s.rev)
  const benutzer = useTerra(s => s.benutzer)
  const buende = useGemeinsam(s => s.buende)
  const kapitaene = useGemeinsam(s => s.kapitaene)
  const verbunden = useGemeinsam(s => s.verbunden)
  const gross = useGemeinsam(s => s.gross)
  const [neu, setNeu] = useState<{ name: string; fl: [number, number, number, number] } | null>(null)
  const [arbeitet, setArbeitet] = useState(false)
  const [sicher, setSicher] = useState<string | null>(null)
  if (!spiel) return null
  const s = spiel.stand
  const ich = sicherName(benutzer)
  const name = (u: string): string => kapitaene.find(k => k.u === u)?.n || u
  const mein = s.bund, meinBund = mein ? buende.find(b => b.key === mein.key) : undefined
  const grossVon = (b: Bund): number => (gross?.teilnehmer ?? []).filter(t => b.mitglieder.includes(t.u)).reduce((n, t) => n + t.schaden, 0)
  const darfGruenden = !mein && rangVon(s.ruhm) >= BUND_RANG && s.gold >= BUND_PREIS && verbunden === true

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-ti-buende>
      <p className="ti-leise">Ein Bündnis bringt zweierlei: Was deine Kameraden entdecken, steht als Wimpel auf deiner Karte. Und gegen den großen Gegner zählt jeder Treffer ein Zehntel mehr je Kamerad, der in derselben Woche mitgekämpft hat (höchstens drei Zehntel).</p>

      {mein && (
        <div className="ti-kasten" data-ti-mein-bund={mein.rolle}>
          <h3><Flagge fl={mein.fl} /> {mein.name}</h3>
          {mein.rolle === 'antrag' && <p>Dein Antrag auf Aufnahme liegt beim Gründer, Kpt. {name(mein.gruender)}. Sobald er entscheidet, erfährst du es hier.</p>}
          {mein.rolle !== 'antrag' && (
            <>
              <p>{mein.rolle === 'gruender' ? 'Du hast dieses Bündnis gegründet und nimmst neue Kapitäne auf.' : `Gegründet von Kpt. ${name(meinBund?.gruender ?? mein.gruender)}.`} {meinBund ? `${meinBund.mitglieder.length} von ${BUND_MAX} Plätzen belegt · ${zahl(meinBund.ruhm)} Ruhm zusammen.` : 'Die Mitgliederliste ist gerade nicht zu sehen.'}</p>
              {meinBund && (
                <table className="ti-tabelle" style={{ marginTop: 8 }}><tbody>
                  {meinBund.mitglieder.map(u => (
                    <tr key={u}><td><b>{name(u)}</b>{u === meinBund.gruender && <span className="ti-marke ti-marke-gold" style={{ marginLeft: 6 }}>Gründer</span>}{u === ich && <span className="ti-marke ti-marke-gold" style={{ marginLeft: 6 }}>du</span>}</td>
                      <td className="ti-zahl">{mein.rolle === 'gruender' && u !== ich && <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => { if (entlasseMitglied(u)) toast(`Kpt. ${name(u)} gehört nicht mehr dazu.`) }} data-ti-entlassen>Entlassen</button>}</td></tr>
                  ))}
                </tbody></table>
              )}
              {mein.rolle === 'gruender' && meinBund && meinBund.antraege.length > 0 && (
                <div style={{ marginTop: 10 }} data-ti-antraege>
                  <b>Anträge</b>
                  {meinBund.antraege.map(u => (
                    <div key={u} className="ti-reihe" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                      <span>Kpt. <b>{name(u)}</b> bittet um Aufnahme.</span>
                      <span className="ti-reihe" style={{ gap: 4 }}>
                        <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-gold" disabled={meinBund.mitglieder.length >= BUND_MAX} onClick={() => { if (entscheideAntrag(u, true)) toast(`Kpt. ${name(u)} ist aufgenommen.`) }} data-ti-aufnehmen>Aufnehmen</button>
                        <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => entscheideAntrag(u, false)} data-ti-ablehnen>Ablehnen</button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="ti-fuss">
            {sicher === 'verlassen'
              ? <><span className="ti-stumm">{mein.rolle === 'gruender' ? 'Das Bündnis wird für alle aufgelöst.' : 'Sicher?'}</span><button type="button" className="ti-knopf ti-knopf-klein" onClick={() => { verlasseBund(); setSicher(null) }} data-ti-verlassen-ja>Ja</button><button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => setSicher(null)}>Nein</button></>
              : <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => setSicher('verlassen')} data-ti-verlassen>{mein.rolle === 'antrag' ? 'Antrag zurückziehen' : mein.rolle === 'gruender' ? 'Bündnis auflösen' : 'Austreten'}</button>}
          </div>
        </div>
      )}

      <div>
        <h3 style={{ fontFamily: 'var(--ti-zier)', color: 'var(--ti-gold-stark)', marginBottom: 6 }}>Die Bündnisse</h3>
        <table className="ti-tabelle" data-ti-bund-liste>
          <thead><tr><th>Bündnis</th><th>Gründer</th><th className="ti-zahl">Kapitäne</th><th className="ti-zahl">Ruhm</th><th className="ti-zahl">Großer Gegner</th><th /></tr></thead>
          <tbody>
            {buende.map(b => (
              <tr key={b.key} data-ti-bund={b.key} style={mein?.key === b.key ? { background: 'var(--ti-gold-weich)' } : undefined}>
                <td><Flagge fl={b.fl} /> <b>{b.name}</b></td>
                <td>{name(b.gruender)}</td>
                <td className="ti-zahl">{b.mitglieder.length}/{BUND_MAX}</td>
                <td className="ti-zahl">{zahl(b.ruhm)}</td>
                <td className="ti-zahl">{zahl(grossVon(b))}</td>
                <td className="ti-zahl">{!mein && verbunden === true && <button type="button" className="ti-knopf ti-knopf-klein" disabled={b.mitglieder.length >= BUND_MAX} onClick={() => { if (beantrageBund(b)) toast(`Dein Antrag ist beim Bündnis „${b.name}“.`) }} data-ti-beantragen>Um Aufnahme bitten</button>}</td>
              </tr>
            ))}
            {!buende.length && <tr><td colSpan={6} className="ti-leise">Noch gibt es kein Bündnis.</td></tr>}
          </tbody>
        </table>
      </div>

      {!mein && (
        <div className="ti-kasten" data-ti-gruenden>
          <h3>Ein Bündnis gründen</h3>
          <p>Kostet {zahl(BUND_PREIS)} Gold und den Rang {RAENGE[BUND_RANG].name}. Den Namen gibt es danach nur einmal. Als Gründer nimmst du Kapitäne auf – höchstens {BUND_MAX}.</p>
          {neu ? (
            <div style={{ marginTop: 8 }}>
              <input className="ti-eingabe" maxLength={28} value={neu.name} onChange={e => setNeu({ ...neu, name: e.target.value })} placeholder="Name des Bündnisses" aria-label="Name des Bündnisses" data-ti-bund-name autoFocus />
              <div style={{ marginTop: 8 }}><FlaggenWahl fl={neu.fl} onChange={fl => setNeu({ ...neu, fl })} /></div>
              <div className="ti-fuss">
                <button type="button" className="ti-knopf ti-knopf-leise" onClick={() => setNeu(null)}>Abbrechen</button>
                <button type="button" className="ti-knopf ti-knopf-gold" disabled={arbeitet || !darfGruenden || neu.name.trim().length < 3} onClick={() => { setArbeitet(true); void gruendeBund(neu.name, neu.fl).then(fehler => { setArbeitet(false); if (fehler) toast(fehler); else { toast(`Das Bündnis „${neu.name.trim()}“ ist gegründet.`); setNeu(null) } }) }} data-ti-bund-gruenden>Gründen ({zahl(BUND_PREIS)} Gold)</button>
              </div>
            </div>
          ) : (
            <div className="ti-fuss">
              {!darfGruenden && <span className="ti-stumm">{verbunden !== true ? 'Dafür braucht es die Verbindung zum Netzlaufwerk.' : rangVon(s.ruhm) < BUND_RANG ? `Erst ab dem Rang ${RAENGE[BUND_RANG].name}.` : `Dafür fehlen noch ${zahl(BUND_PREIS - s.gold)} Gold.`}</span>}
              <button type="button" className="ti-knopf" disabled={!darfGruenden} onClick={() => setNeu({ name: '', fl: [s.flagge[0], s.flagge[2], s.flagge[1], s.flagge[3]] })} data-ti-bund-neu>Bündnis gründen …</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
