// Terra Incognita — die anderen Kapitäne: Ranglisten, Geschenke und (für den Masteradmin) die Aufsicht über Namen.
import { useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { EINSAETZE } from '../kampf/duell'
import { ART_NAME } from '../kern/namen'
import { KLASSEN, RAENGE } from '../kern/schiff'
import { fordereHeraus, istOnline, offenesDuell, zeige as zeigeDuell } from '../netz/duell'
import { abgleich, blendeAus, darfSchreiben, GABEN_OFFEN_MAX, kannSchenken, schenkeGold, useGemeinsam, type Kapitaen } from '../netz/gemeinsam'
import { useTerra } from '../speicher'
import { tagRelativ } from '../zeit'
import { Flagge } from './Skizze'
import Buendnisse from './Buendnisse'
// Bewusst nicht gezeigt: wann ein Kollege zuletzt gespielt hat. Sichtbar sind nur die Tage seiner Meldungen.
import { Raum, toast, zahl, type Reiter } from './teile'

const SPALTEN: { id: string; name: string; wert: (k: Kapitaen) => number; text?: (k: Kapitaen) => string }[] = [
  { id: 'ruhm', name: 'Ruhm', wert: k => k.ruhm },
  { id: 'erst', name: 'Erstentdeckungen', wert: k => k.z.erst },
  { id: 'felder', name: 'Vermessene Felder', wert: k => k.z.felder },
  { id: 'weit', name: 'Weiteste Fahrt', wert: k => k.z.weit, text: k => `${k.z.weit} Felder` },
  { id: 'atlas', name: 'Atlas', wert: k => k.z.atlas, text: k => `${k.z.atlas} Einträge` },
  { id: 'med', name: 'Tagesfahrten', wert: k => k.z.med[0] * 10000 + k.z.med[1] * 100 + k.z.med[2], text: k => `${k.z.med[0]} Gold · ${k.z.med[1]} Silber · ${k.z.med[2]} Bronze` },
  { id: 'siege', name: 'Gefechte', wert: k => (k.kz?.[0] ?? 0) * 1000 + (k.kz?.[1] ?? 0), text: k => `${k.kz?.[0] ?? 0} Siege · ${k.kz?.[1] ?? 0} bezwungen` },
]

export default function Kapitaene({ onZu }: { onZu: () => void }) {
  const kapitaene = useGemeinsam(s => s.kapitaene)
  const funde = useGemeinsam(s => s.funde)
  const flaschen = useGemeinsam(s => s.flaschen)
  const verbunden = useGemeinsam(s => s.verbunden)
  const gold = useTerra(s => s.spiel?.stand.gold ?? 0)
  const unterwegs = useTerra(s => s.spiel?.stand.gabenOffen.length ?? 0)
  const fremderStand = useGemeinsam(s => s.fremderStand)
  useTerra(s => s.rev)
  const rolle = useAuthStore(s => s.session?.user.role)
  const [reiter, setReiter] = useState('liste')
  const [sortiert, setSortiert] = useState('ruhm')
  const [gabe, setGabe] = useState<{ an: string; menge: string } | null>(null)
  const [duell, setDuell] = useState<{ an: string; ein: number; laeuft: boolean } | null>(null)
  // (wer gerade im Tool ist, weiß der Chat — kein eigener Blick aufs Netzlaufwerk)
  useChatStore(s => s.nutzer)
  const offen = useTerra(s => (s.spiel ? offenesDuell(s.spiel.stand) : undefined))
  const spalte = SPALTEN.find(s => s.id === sortiert) ?? SPALTEN[0]
  const liste = kapitaene.slice().sort((a, b) => spalte.wert(b) - spalte.wert(a))
  const buende = useGemeinsam(s => s.buende)
  const bundVon = (u: string): string | undefined => buende.find(b => b.mitglieder.includes(u))?.name
  const meinBund = useTerra(s => s.spiel?.stand.bund)
  const antraege = meinBund?.rolle === 'gruender' ? buende.find(b => b.key === meinBund.key)?.antraege.length ?? 0 : 0
  const reiterListe: Reiter[] = [{ id: 'liste', name: 'Rangliste' }, { id: 'buende', name: 'Bündnisse', punkt: antraege > 0 }, { id: 'neues', name: 'Neues von den Meeren' }, ...(rolle === 'master_admin' ? [{ id: 'aufsicht', name: 'Aufsicht' }] : [])]
  return (
    <Raum kennung="kapitaene" titel="Die Kapitäne" unter={verbunden ? `${kapitaene.length} ${kapitaene.length === 1 ? 'Kapitän fährt' : 'Kapitäne fahren'} auf denselben Meeren` : 'Keine Verbindung zum Netzlaufwerk – hier steht nur dein eigener Stand'} reiter={reiterListe} aktiv={reiter} onReiter={setReiter} onZu={onZu}
      rechts={<button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => void abgleich()}>Aktualisieren</button>}>
      {reiter === 'liste' && (
        <>
          <div className="ti-reihe" style={{ marginBottom: 10 }}>{SPALTEN.map(s => <button key={s.id} type="button" className={`ti-knopf ti-knopf-klein${sortiert === s.id ? ' ti-knopf-gold' : ''}`} onClick={() => setSortiert(s.id)} data-ti-sortiere={s.id}>{s.name}</button>)}</div>
          <table className="ti-tabelle" data-ti-rangliste>
            <thead><tr><th style={{ width: 30 }}>#</th><th>Kapitän</th><th>Schiff</th><th>Rang</th><th className="ti-zahl">{spalte.name}</th><th /></tr></thead>
            <tbody>
              {liste.map((k, i) => (
                <tr key={k.u} data-ti-kapitaen={k.u} style={k.ich ? { background: 'var(--ti-gold-weich)' } : undefined}>
                  <td className="ti-stumm">{i + 1}</td>
                  <td><Flagge fl={k.fl} /> <b>{k.n || k.u}</b>{k.ich && <span className="ti-marke ti-marke-gold" style={{ marginLeft: 6 }}>du</span>}<div className="ti-stumm">{k.a}{bundVon(k.u) ? ` · Bündnis „${bundVon(k.u)}“` : ''}</div></td>
                  <td>{KLASSEN[k.schiff]?.name ?? 'Schiff'}<div className="ti-stumm">„{k.sn}“</div></td>
                  <td>{RAENGE[k.rang]?.name ?? ''}</td>
                  <td className="ti-zahl"><b>{spalte.text ? spalte.text(k) : zahl(spalte.wert(k))}</b></td>
                  <td className="ti-zahl" style={{ whiteSpace: 'nowrap' }}>{!k.ich && <>
                    {offen && offen.gegner === k.u
                      ? <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-gold" title="Das laufende Duell auf den Bildschirm holen" onClick={() => { onZu(); zeigeDuell(offen.id) }} data-ti-duell-zeigen={k.u}>Zum Duell</button>
                      : <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" disabled={!istOnline(k.u) || !!offen}
                        title={offen ? 'Ein Duell läuft schon.' : istOnline(k.u) ? `Kpt. ${k.n || k.u} zu einem Seegefecht herausfordern` : `${k.a || k.u} ist gerade nicht im Tool – ein Duell geht nur, wenn beide da sind`}
                        onClick={() => { setGabe(null); setDuell({ an: k.u, ein: 0, laeuft: false }) }} data-ti-duell-fordern={k.u}>Duell</button>}{' '}
                    <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => { setDuell(null); setGabe({ an: k.u, menge: '50' }) }} data-ti-schenken>Gold schicken</button>
                  </>}</td>
                </tr>
              ))}
              {!liste.length && <tr><td colSpan={6} className="ti-leise">Noch ist niemand ausgelaufen.</td></tr>}
            </tbody>
          </table>
          {duell && (() => {
            const k = kapitaene.find(x => x.u === duell.an)
            return (
              <div className="ti-kasten" style={{ marginTop: 12, maxWidth: 480 }} data-ti-duell-einladen>
                <h3>Seegefecht gegen Kpt. {k?.n ?? duell.an}</h3>
                <p>Flaggschiff gegen Flaggschiff, Zug um Zug, höchstens zehn Runden – beide mit vollem Rumpf, kein Schiff nimmt Schaden. Die Einladung kommt als Karte im Chat und gilt zehn Minuten. Der Einsatz geht gleich als Pfand aus der Kasse: Der Sieger bekommt beide Einsätze, bei Unentschieden, Ablehnung oder wenn keiner antritt kommt er zurück.</p>
                <div className="ti-reihe" style={{ marginTop: 8 }} role="radiogroup" aria-label="Einsatz">
                  {EINSAETZE.map(e => <button key={e} type="button" role="radio" aria-checked={duell.ein === e} disabled={e > gold} className={`ti-knopf ti-knopf-klein${duell.ein === e ? ' ti-knopf-gold' : ''}`} onClick={() => setDuell({ ...duell, ein: e })} data-ti-einsatz={e}>{e ? `${zahl(e)} Gold` : 'ohne Einsatz'}</button>)}
                </div>
                {!darfSchreiben() && <p className="ti-fehler">Dafür braucht es die Verbindung zum Netzlaufwerk.</p>}
                <div className="ti-reihe" style={{ marginTop: 8 }}>
                  <button type="button" className="ti-knopf ti-knopf-gold" disabled={duell.laeuft || !darfSchreiben() || !k}
                    onClick={() => { if (!k) return; setDuell({ ...duell, laeuft: true }); void fordereHeraus({ u: k.u, n: k.n || k.u }, duell.ein).then(f => { if (f) { toast(f); setDuell(d => (d ? { ...d, laeuft: false } : d)) } else { setDuell(null); onZu() } }) }}
                    data-ti-duell-senden>Herausfordern</button>
                  <button type="button" className="ti-knopf ti-knopf-leise" onClick={() => setDuell(null)}>Abbrechen</button>
                </div>
              </div>
            )
          })()}
          {gabe && (
            <div className="ti-kasten" style={{ marginTop: 12, maxWidth: 420 }} data-ti-gabe>
              <h3>Gold für Kpt. {kapitaene.find(k => k.u === gabe.an)?.n ?? gabe.an}</h3>
              <p>Ein Wechsel aufs Hamburger Kontor: Das Gold ist sofort weg und kommt an, sobald der Empfänger das nächste Mal spielt. Du hast {zahl(gold)} Gold.</p>
              {!kannSchenken() && <p className="ti-fehler" data-ti-gabe-gesperrt>{unterwegs >= GABEN_OFFEN_MAX ? `Es sind schon ${unterwegs} Wechsel unterwegs, die noch niemand eingelöst hat. Mehr nimmt das Kontor gerade nicht an.` : fremderStand ? 'Auf einem anderen PC liegt ein neuerer Spielstand von dir. Entscheide erst in den Einstellungen, wo du weiterspielst.' : 'Dafür braucht es die Verbindung zum Netzlaufwerk – im Moment geht es nicht.'}</p>}
              <div className="ti-reihe" style={{ marginTop: 8 }}>
                <input className="ti-eingabe" style={{ width: 120 }} inputMode="numeric" value={gabe.menge} onChange={e => setGabe({ an: gabe.an, menge: e.target.value.replace(/\D/g, '').slice(0, 7) })} aria-label="Betrag" data-ti-gabe-menge />
                <button type="button" className="ti-knopf ti-knopf-gold" disabled={!Number(gabe.menge) || Number(gabe.menge) > gold || !kannSchenken()} onClick={() => { if (schenkeGold(gabe.an, Number(gabe.menge))) { toast(`${zahl(Number(gabe.menge))} Gold sind unterwegs.`); setGabe(null) } else toast('Das ging gerade nicht.') }} data-ti-gabe-ok>Schicken</button>
                <button type="button" className="ti-knopf ti-knopf-leise" onClick={() => setGabe(null)}>Abbrechen</button>
              </div>
            </div>
          )}
        </>
      )}
      {reiter === 'buende' && <Buendnisse />}
      {reiter === 'neues' && (
        <table className="ti-tabelle" data-ti-neues><tbody>
          {funde.slice(0, 40).map(f => <tr key={f.u + f.key}><td className="ti-stumm" style={{ width: 110 }}>{tagRelativ(f.tag)}</td><td>Kpt. <b>{f.von}</b> meldet {f.key.startsWith('i') ? 'eine Insel' : `${ART_NAME[f.art] ? ART_NAME[f.art] : 'einen Fund'}`}{f.name ? <> und tauft sie <b>„{f.name}“</b></> : ''}.</td></tr>)}
          {!funde.length && <tr><td className="ti-leise">Noch keine Meldungen anderer Kapitäne. Wo genau etwas liegt, verrät die Gilde nicht – aber in den Tavernen wird geredet.</td></tr>}
        </tbody></table>
      )}
      {reiter === 'aufsicht' && rolle === 'master_admin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="ti-leise">Nur für den Masteradmin: unpassende Taufnamen und Flaschenpost ausblenden. Ausgeblendetes verschwindet bei allen; der Fund selbst bleibt.</p>
          <table className="ti-tabelle" data-ti-aufsicht><tbody>
            {funde.filter(f => f.name).slice(0, 60).map(f => <tr key={f.u + f.key}><td>„{f.name}“</td><td className="ti-leise">Kpt. {f.von}</td><td className="ti-zahl"><button type="button" className="ti-knopf ti-knopf-klein" onClick={() => void blendeAus('name', f.key).then(ok => toast(ok ? 'Name ausgeblendet.' : 'Das ging nicht – keine Verbindung?'))}>Namen ausblenden</button></td></tr>)}
            {flaschen.slice(0, 60).map(f => <tr key={f.id}><td>Flaschenpost: {f.text}</td><td className="ti-leise">Kpt. {f.von}</td><td className="ti-zahl"><button type="button" className="ti-knopf ti-knopf-klein" onClick={() => void blendeAus('flasche', f.id).then(ok => toast(ok ? 'Flaschenpost ausgeblendet.' : 'Das ging nicht – keine Verbindung?'))}>Ausblenden</button></td></tr>)}
          </tbody></table>
        </div>
      )}
    </Raum>
  )
}
