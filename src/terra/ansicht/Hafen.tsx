// Terra Incognita — im Hafen (oder im Dorf): Kai, Markt, Werft, Taverne, Aufträge.
import { useMemo, useState } from 'react'
import { offizier } from '../inhalt/offiziere'
import { angebote, AUFTRAG_MAX, auftragZiel, erfuelle, gibAuf, istErfuellt, nimmAn } from '../kern/auftraege'
import { GEBIETE } from '../kern/gebiete'
import { baueKontor, entlasse, entlasseGeleit, GELEIT_MAX, geleitPreis, geleitReparaturPreis, hafenarbeit, hafenarbeitLohn, hafenarbeitMoeglich, hatGrosseWerft, heuere, heuereGeleit, inZahlung, kaufe, kaufeAusbau, kaufeKlasse, kaufeProviant, kaufSumme, KONTOR_MAX_STUFE, kontorPlaetze, kontorPreis, notreparatur, notreparaturMoeglich, offizierHier, repariere, repariereGeleit, reparaturPreis, verkaufe, verkaufeAusbau, verkaufSumme, type Antwort } from '../kern/handel'
import { abstand, feldAus, peilung } from '../kern/hex'
import { ART_NAME, ortName } from '../kern/namen'
import { grosserGegner } from '../kern/piraten'
import { AUSBAUTEN, KLASSEN, RAENGE, rangVon, ROLLE_KAMPF, ROLLE_NAME, ROLLE_WIRKUNG } from '../kern/schiff'
import { GESTALT_NAME } from '../kampf/gegner'
import { kontorErtrag, ladungMenge, ortVon, werteVon } from '../kern/spiel'
import { marktVon, preise, proviantPreis, WAREN } from '../kern/waren'
import { geruechtNahe, geruechtText } from '../kern/wirkung'
import { useGemeinsam } from '../netz/gemeinsam'
import { umwelt, useTerra } from '../speicher'
import { Raum, tageText, toast, zahl, type Reiter } from './teile'

export default function Hafen({ ortKey, onZu, onMelden }: { ortKey: string; onZu: () => void; onMelden: () => void }) {
  const spiel = useTerra(s => s.spiel)
  useTerra(s => s.rev)
  const tue = useTerra(s => s.tue)
  const [reiter, setReiter] = useState('kai')
  const [fehler, setFehler] = useState('')
  const ort = useMemo(() => ortVon(ortKey), [ortKey])
  if (!spiel || !ort) return null
  const s = spiel.stand, w = werteVon(s), u = umwelt()
  const istHafen = ort.art === 'hafen'
  const versuche = (a: Antwort): void => { setFehler(a.ok ? '' : a.grund); if (a.ok && a.text) toast(a.text) }
  const offen = Object.values(s.entdeckt).filter(e => !e.gemeldet).length
  const erfuellbar = s.auftraege.filter(a => istErfuellt(s, a))
  const reiterListe: Reiter[] = istHafen
    ? [{ id: 'kai', name: 'Am Kai', punkt: offen > 0 || s.neueFelder > 0 || erfuellbar.length > 0 }, { id: 'markt', name: 'Markt' }, { id: 'werft', name: 'Werft' }, { id: 'taverne', name: 'Taverne' }, { id: 'auftraege', name: 'Aufträge' }]
    : [{ id: 'kai', name: 'Am Strand' }, { id: 'markt', name: 'Tauschhandel' }, { id: 'taverne', name: 'Am Feuer' }]
  const voll = ladungMenge(s), platz = w.laderaum - voll

  return (
    <Raum kennung="hafen" titel={ortName(ort)} unter={`${istHafen ? 'Hafenstadt' : 'Dorf'} · ${GEBIETE[ort.gebiet].name}`} reiter={reiterListe} aktiv={reiter} onReiter={r => { setReiter(r); setFehler('') }} onZu={onZu} zuText="Auslaufen"
      rechts={<span className="ti-reihe"><span className="ti-wert ti-wert-gold">{zahl(s.gold)} <small>Gold</small></span><span className="ti-wert">{voll}/{w.laderaum} <small>Ladung</small></span></span>}>
      {fehler && <p className="ti-fehler" style={{ marginBottom: 10 }} data-ti-fehler>{fehler}</p>}

      {reiter === 'kai' && (
        <div className="ti-gitter">
          {istHafen && (
            <div className="ti-kasten" data-ti-gilde>
              <h3>Kartographen-Gilde</h3>
              {offen > 0 || s.neueFelder > 0
                ? <><p>{offen > 0 ? `${offen} ${offen === 1 ? 'Entdeckung' : 'Entdeckungen'}` : 'Keine neuen Entdeckungen'} und {zahl(s.neueFelder)} neu vermessene Felder warten auf die Meldung. Erst gemeldet zählen sie – und wer zuerst meldet, tauft.</p>
                  <div className="ti-fuss"><button type="button" className="ti-knopf ti-knopf-gold" onClick={onMelden} data-ti-melden>Bei der Gilde melden</button></div></>
                : <p>Nichts zu melden. Die Gilde zahlt für jedes neu vermessene Feld und für jede Entdeckung.</p>}
            </div>
          )}
          <div className="ti-kasten" data-ti-proviant>
            <h3>Proviant</h3>
            <p>An Bord: <b>{tageText(s.proviant)}</b> von {tageText(w.proviantMax)}. Ein Tag kostet hier {proviantPreis(ort)} Gold.</p>
            <div className="ti-fuss" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="ti-knopf ti-knopf-klein" disabled={s.proviant >= w.proviantMax} onClick={() => versuche(kaufeUnd(tue, 24))}>+1 Tag</button>
              <button type="button" className="ti-knopf ti-knopf-klein" disabled={s.proviant >= w.proviantMax} onClick={() => versuche(kaufeUnd(tue, 120))}>+5 Tage</button>
              <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-gold" disabled={s.proviant >= w.proviantMax} onClick={() => versuche(kaufeUnd(tue, 99999))} data-ti-auffuellen>Auffüllen ({zahl(Math.ceil(((w.proviantMax - s.proviant) * proviantPreis(ort)) / 24))} Gold)</button>
            </div>
          </div>
          {erfuellbar.map(a => (
            <div className="ti-kasten" key={a.id}>
              <h3>Auftrag erfüllt</h3>
              <p>{a.text}</p>
              <div className="ti-fuss"><button type="button" className="ti-knopf ti-knopf-gold" onClick={() => { const r = tue(sp => erfuelle(sp, a.id)); if (r.ok) toast(`Auftrag erfüllt: +${zahl(r.gold)} Gold, +${r.ruhm} Ruhm`) }} data-ti-abliefern>Lohn abholen ({zahl(a.gold)} Gold)</button></div>
            </div>
          ))}
          {istHafen && (
            <div className="ti-kasten" data-ti-kontor>
              <h3>Kontor</h3>
              {(() => {
                const stufe = s.kontore[ortKey] ?? 0, plaetze = kontorPlaetze(s.ruhm), zahlKontore = Object.keys(s.kontore).length
                if (!stufe && !plaetze) return <p>Ein eigenes Kontor bringt Gold, auch wenn du nicht an Bord bist. Gründen darf es, wer es zum {RAENGE[2].name}n gebracht hat.</p>
                return <>
                  <p>{stufe ? `Dein Kontor (Stufe ${stufe}) bringt hier ${(2 + ort.stufe) * stufe} Gold je Stunde – auch wenn du nicht spielst, höchstens für 48 Stunden am Stück.` : `Ein Kontor in ${ortName(ort)} brächte ${2 + ort.stufe} Gold je Stunde – auch wenn du nicht spielst.`}</p>
                  {stufe < KONTOR_MAX_STUFE && (stufe > 0 || zahlKontore < plaetze)
                    ? <div className="ti-fuss"><button type="button" className="ti-knopf" onClick={() => versuche(tue(sp => baueKontor(sp, umwelt())))} data-ti-kontor-bauen>{stufe ? 'Ausbauen' : 'Kontor gründen'} ({zahl(kontorPreis(ort, stufe + 1))} Gold)</button></div>
                    : stufe >= KONTOR_MAX_STUFE ? <p className="ti-stumm">Voll ausgebaut.</p> : <p className="ti-stumm">Dein Rang erlaubt {plaetze} {plaetze === 1 ? 'Kontor' : 'Kontore'}.</p>}
                </>
              })()}
            </div>
          )}
          {istHafen && s.rumpf < w.rumpfMax && (
            <div className="ti-kasten" data-ti-rumpf>
              <h3>Der Rumpf hat gelitten</h3>
              <p>Zustand {s.rumpf} von {w.rumpfMax}. Die Werft bessert ihn aus.</p>
              <div className="ti-fuss">
                {notreparaturMoeglich(spiel) && <button type="button" className="ti-knopf ti-knopf-leise" onClick={() => versuche(tue(sp => notreparatur(sp)))} title="Hamburg lässt niemanden liegen: umsonst auf die Hälfte" data-ti-notreparatur>Notdürftig flicken (umsonst)</button>}
                <button type="button" className="ti-knopf" disabled={reparaturPreis(spiel) > s.gold} onClick={() => versuche(tue(sp => repariere(sp)))} data-ti-reparieren>Ausbessern ({zahl(reparaturPreis(spiel))} Gold)</button>
              </div>
            </div>
          )}
          {istHafen && hafenarbeitMoeglich(spiel) && (
            <div className="ti-kasten" data-ti-arbeit>
              <h3>Arbeit im Hafen</h3>
              <p>Knapp bei Kasse? Beim Löschen der Kauffahrer aushelfen bringt {hafenarbeitLohn(ort)} Gold und kostet einen Tag. Arbeit gibt es, solange die Kasse fast leer ist.</p>
              <div className="ti-fuss"><button type="button" className="ti-knopf ti-knopf-klein" onClick={() => versuche(tue(sp => hafenarbeit(sp)))} data-ti-hafenarbeit>Einen Tag aushelfen</button></div>
            </div>
          )}
        </div>
      )}

      {reiter === 'markt' && (
        <>
          <p className="ti-leise" style={{ marginBottom: 10 }}>{istHafen ? 'Was der Hafen selbst erzeugt, ist billig zu haben. Was er sucht, bezahlt er gut. Jeder Kauf und Verkauf bewegt den Preis – er erholt sich, während du auf See bist.' : 'Ein Dorf hat wenig, aber es tauscht gern.'} Noch {platz} {platz === 1 ? 'Platz' : 'Plätze'} im Laderaum.</p>
          <table className="ti-tabelle" data-ti-markt>
            <thead><tr><th>Ware</th><th /><th className="ti-zahl">Kaufen</th><th className="ti-zahl">Verkaufen</th><th className="ti-zahl">An Bord</th><th /></tr></thead>
            <tbody>
              {WAREN.map((ware, nr) => {
                const p = preise(ort, nr, u.tag, s.druck[ortKey]?.[ware.id], s.stunden, w.handel), hat = s.ladung[ware.id] ?? 0
                if (p.kauf === null && !hat && p.rolle === '') return null
                const maxKauf = p.kauf === null ? 0 : (() => { let n = Math.min(platz, 99); while (n > 0 && (kaufSumme(spiel, nr, n, u) ?? 1e12) > s.gold) n--; return n })()
                return (
                  <tr key={ware.id} data-ti-ware={ware.id}>
                    <td><b>{ware.name}</b></td>
                    <td>{p.rolle === 'angebot' ? <span className="ti-marke ti-marke-gold">von hier</span> : p.rolle === 'nachfrage' ? <span className="ti-marke ti-marke-gut">gesucht</span> : null}</td>
                    <td className="ti-zahl">{p.kauf === null ? '–' : zahl(p.kauf)}</td>
                    <td className="ti-zahl">{zahl(p.verkauf)}{hat > 0 && s.einkauf[ware.id] ? <span className="ti-stumm"> · {p.verkauf >= s.einkauf[ware.id] ? '+' : '−'}{zahl(Math.abs(p.verkauf - s.einkauf[ware.id]))}</span> : null}</td>
                    <td className="ti-zahl">{hat || '–'}</td>
                    <td className="ti-zahl">
                      <span className="ti-reihe" style={{ justifyContent: 'flex-end', gap: 4 }}>
                        {p.kauf !== null && <>
                          <button type="button" className="ti-knopf ti-knopf-klein" disabled={maxKauf < 1} onClick={() => versuche(tue(sp => kaufe(sp, ware.id, 1, umwelt())))} data-ti-kauf="1">+1</button>
                          <button type="button" className="ti-knopf ti-knopf-klein" disabled={maxKauf < 2} onClick={() => versuche(tue(sp => kaufe(sp, ware.id, maxKauf, umwelt())))} data-ti-kauf="max" title={maxKauf > 0 ? `${maxKauf} Stück für ${zahl(kaufSumme(spiel, nr, maxKauf, u) ?? 0)} Gold` : undefined}>+{Math.max(maxKauf, 2)}</button>
                        </>}
                        {hat > 0 && <>
                          <button type="button" className="ti-knopf ti-knopf-klein" onClick={() => versuche(tue(sp => verkaufe(sp, ware.id, 1, umwelt())))} data-ti-verkauf="1">−1</button>
                          <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-gold" onClick={() => versuche(tue(sp => verkaufe(sp, ware.id, hat, umwelt())))} data-ti-verkauf="alle" title={`Alle ${hat} für ${zahl(verkaufSumme(spiel, nr, hat, u) ?? 0)} Gold`}>Alle</button>
                        </>}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {reiter === 'werft' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="ti-kasten">
            <h3>{KLASSEN[s.klasse].name} „{s.schiffName}“</h3>
            <p>{KLASSEN[s.klasse].text}</p>
            <p style={{ marginTop: 6 }}>Proviant {tageText(w.proviantMax)} · Laderaum {w.laderaum} · Sicht {w.sicht} Felder · Tempo {w.tempo} % · Rumpf {s.rumpf}/{w.rumpfMax} · Ausbauten {s.ausbauten.length}/{KLASSEN[s.klasse].plaetze} · Offiziere {s.offiziere.length}/{KLASSEN[s.klasse].offiziere}</p>
            <p style={{ marginTop: 2 }} data-ti-gefechtswerte>Im Gefecht: {w.kanonen} {w.kanonen === 1 ? 'Kanone' : 'Kanonen'} je Breitseite · {w.crew} Mann · {w.fahrt} Bewegungspunkte{w.enter ? ' · Enterhaken' : ''}{w.drehbassen ? ' · Drehbassen' : ''}</p>
          </div>
          {istHafen && (s.geleit.length > 0 || (hatGrosseWerft(ort) && s.klasse >= 2)) && <Geleit ortKey={ortKey} versuche={versuche} />}
          {hatGrosseWerft(ort) ? (
            <div data-ti-schiffe>
              <h3 style={{ fontFamily: 'var(--ti-zier)', color: 'var(--ti-gold-stark)', marginBottom: 6 }}>Auf der Helling</h3>
              <table className="ti-tabelle">
                <thead><tr><th>Schiff</th><th className="ti-zahl">Proviant</th><th className="ti-zahl">Laderaum</th><th className="ti-zahl">Sicht</th><th className="ti-zahl">Tempo</th><th className="ti-zahl">Plätze</th><th className="ti-zahl">Preis</th><th /></tr></thead>
                <tbody>
                  {KLASSEN.filter(k => k.id > s.klasse).slice(0, 3).map(k => {
                    const kosten = k.preis - inZahlung(s.klasse)
                    return (
                      <tr key={k.id} data-ti-klasse={k.id}>
                        <td><b>{k.name}</b><div className="ti-stumm">{k.text}</div></td>
                        <td className="ti-zahl">{k.proviant} Tage</td><td className="ti-zahl">{k.laderaum}</td><td className="ti-zahl">{k.sicht}</td><td className="ti-zahl">{k.tempo} %</td><td className="ti-zahl">{k.plaetze}</td>
                        <td className="ti-zahl"><b>{zahl(kosten)}</b>{inZahlung(s.klasse) > 0 && <div className="ti-stumm">nach Inzahlungnahme</div>}</td>
                        <td className="ti-zahl"><button type="button" className="ti-knopf ti-knopf-klein ti-knopf-gold" disabled={k.id !== s.klasse + 1 && kosten > s.gold} onClick={() => { const a = tue(sp => kaufeKlasse(sp, k.id)); versuche(a); if (a.ok) toast(`Stapellauf! Die „${s.schiffName}“ ist jetzt ein ${k.name}.`) }} data-ti-schiff-kaufen>Kaufen</button></td>
                      </tr>
                    )
                  })}
                  {s.klasse >= KLASSEN.length - 1 && <tr><td colSpan={8} className="ti-leise">Ein besseres Schiff als deines baut niemand.</td></tr>}
                </tbody>
              </table>
            </div>
          ) : istHafen && <p className="ti-leise">Diese kleine Werft bessert aus und baut ein, aber sie legt keine Schiffe auf Kiel. Neue Schiffe gibt es in Hamburg und in großen Häfen.</p>}
          <div data-ti-ausbauten>
            <h3 style={{ fontFamily: 'var(--ti-zier)', color: 'var(--ti-gold-stark)', marginBottom: 6 }}>Ausbauten ({s.ausbauten.length} von {KLASSEN[s.klasse].plaetze} Plätzen belegt)</h3>
            <table className="ti-tabelle">
              <tbody>
                {AUSBAUTEN.map(a => {
                  const hat = s.ausbauten.includes(a.id), gesperrt = (a.abKlasse ?? 0) > s.klasse
                  return (
                    <tr key={a.id} data-ti-ausbau={a.id}>
                      <td style={{ width: 170 }}><b>{a.name}</b>{a.kampf && <div><span className="ti-marke ti-marke-rot">Gefecht</span></div>}</td>
                      <td className="ti-leise">{a.text}{gesperrt && <span className="ti-stumm"> Ab {KLASSEN[a.abKlasse ?? 0].name}.</span>}</td>
                      <td className="ti-zahl">{hat ? <span className="ti-marke ti-marke-gut">eingebaut</span> : zahl(a.preis)}</td>
                      <td className="ti-zahl">{hat
                        ? <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => versuche(tue(sp => verkaufeAusbau(sp, a.id)))}>Ausbauen (+{zahl(Math.floor(a.preis / 2))})</button>
                        : <button type="button" className="ti-knopf ti-knopf-klein" disabled={gesperrt} onClick={() => versuche(tue(sp => kaufeAusbau(sp, a.id)))} data-ti-ausbau-kaufen>Einbauen</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reiter === 'taverne' && <Taverne ortKey={ortKey} versuche={versuche} />}

      {reiter === 'auftraege' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--ti-zier)', color: 'var(--ti-gold-stark)', marginBottom: 6 }}>Am schwarzen Brett</h3>
            <div className="ti-gitter" data-ti-angebote>
              {angebote(ort, s, u).map(a => (
                <div className="ti-kasten" key={a.id}>
                  <h3>{{ fracht: 'Fracht', post: 'Post', vermessung: 'Vermessung', suche: 'Suche' }[a.art]}</h3>
                  <p>{a.text}</p>
                  <div className="ti-fuss"><span className="ti-marke ti-marke-gold">{zahl(a.gold)} Gold · {a.ruhm} Ruhm</span><button type="button" className="ti-knopf ti-knopf-klein" disabled={s.auftraege.length >= AUFTRAG_MAX} onClick={() => { const r = tue(sp => nimmAn(sp, a)); setFehler(r.ok ? '' : r.grund) }} data-ti-annehmen>Annehmen</button></div>
                </div>
              ))}
              {!angebote(ort, s, u).length && <p className="ti-leise">Heute hängt nichts Neues aus. Morgen wieder.</p>}
            </div>
          </div>
          <div>
            <h3 style={{ fontFamily: 'var(--ti-zier)', color: 'var(--ti-gold-stark)', marginBottom: 6 }}>Angenommen ({s.auftraege.length} von {AUFTRAG_MAX})</h3>
            {s.auftraege.length ? (
              <table className="ti-tabelle">
                <tbody>{s.auftraege.map(a => (
                  <tr key={a.id}><td>{a.text}</td><td className="ti-leise">{auftragZiel(a)}</td><td className="ti-zahl">{zahl(a.gold)} Gold</td>
                    <td className="ti-zahl"><button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => tue(sp => gibAuf(sp, a.id))}>Aufgeben</button></td></tr>
                ))}</tbody>
              </table>
            ) : <p className="ti-leise">Keine Aufträge. Kein Auftrag hat eine Frist – du erledigst ihn, wann es passt.</p>}
          </div>
        </div>
      )}
    </Raum>
  )
}

type Tue = ReturnType<typeof useTerra.getState>['tue']
const kaufeUnd = (tue: Tue, stunden: number): Antwort => tue(sp => kaufeProviant(sp, stunden))

function Taverne({ ortKey, versuche }: { ortKey: string; versuche: (a: Antwort) => void }) {
  const spiel = useTerra(s => s.spiel)
  useTerra(s => s.rev)
  const tue = useTerra(s => s.tue)
  const funde = useGemeinsam(s => s.funde)
  const [garn, setGarn] = useState('')
  const ort = ortVon(ortKey)
  if (!spiel || !ort) return null
  const s = spiel.stand, wartet = offizierHier(ort)
  const schonGefragt = s.genutzt[`g${ortKey}`] !== undefined && s.stunden - s.genutzt[`g${ortKey}`] < 240
  // was Kollegen gemeldet haben und ich noch nicht kenne
  const fremd = funde.filter(f => !s.entdeckt[f.key] && !s.geruechte.some(g => `${f.key.slice(0, 1)}${g.q},${g.r}` === f.key)).slice(0, 5)
  return (
    <div className="ti-gitter">
      <div className="ti-kasten" data-ti-heuer>
        <h3>Wer sucht eine Heuer?</h3>
        {wartet && !s.offiziere.includes(wartet.id) ? <>
          <p><b>{wartet.name}</b>, {ROLLE_NAME[wartet.rolle]}{wartet.rang === 2 ? ' (ein Meister des Fachs)' : ''}. {wartet.text}</p>
          <p style={{ marginTop: 4 }}>{ROLLE_WIRKUNG[wartet.rolle][wartet.rang - 1]}{ROLLE_KAMPF[wartet.rolle] ? ` ${ROLLE_KAMPF[wartet.rolle]?.[wartet.rang - 1]}` : ''}</p>
          <div className="ti-fuss"><button type="button" className="ti-knopf ti-knopf-gold" onClick={() => versuche(tue(sp => heuere(sp, ortKey)))} data-ti-heuern>Anheuern ({zahl(wartet.heuer)} Gold Handgeld)</button></div>
        </> : <p>Heute sitzt hier niemand, der zur See will.</p>}
      </div>
      <div className="ti-kasten">
        <h3>Deine Offiziere ({s.offiziere.length} von {KLASSEN[s.klasse].offiziere})</h3>
        {s.offiziere.length ? s.offiziere.map(id => { const o = offizier(id); return o ? (
          <div key={id} className="ti-reihe" style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <span><b>{o.name}</b> <span className="ti-stumm">{ROLLE_NAME[o.rolle]}</span><div className="ti-stumm">{ROLLE_WIRKUNG[o.rolle][o.rang - 1]}{ROLLE_KAMPF[o.rolle] ? ` ${ROLLE_KAMPF[o.rolle]?.[o.rang - 1]}` : ''}</div></span>
            <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => versuche(tue(sp => entlasse(sp, id)))}>Entlassen</button>
          </div>) : null }) : <p>Noch fährt niemand mit. Offiziere trifft man in Häfen, Dörfern und bei Einsiedlern.</p>}
      </div>
      <div className="ti-kasten" data-ti-garn>
        <h3>Seemannsgarn</h3>
        {garn ? <p>„{garn}“ <span className="ti-stumm">(Das Fragezeichen steht jetzt auf deiner Karte.)</span></p>
          : schonGefragt ? <p>Der Wirt hat seit deinem letzten Besuch nichts Neues gehört.</p>
          : <><p>Der Wirt weiß, was die Schiffer erzählen. Eine Runde lockert die Zungen.</p>
            <div className="ti-fuss"><button type="button" className="ti-knopf" onClick={() => { const g = tue(sp => { sp.stand.genutzt[`g${ortKey}`] = sp.stand.stunden; return geruechtNahe(sp.stand, ort.q, ort.r, umwelt()) }); setGarn(g ? geruechtText(g, ort.q, ort.r) : 'Hier in der Gegend gibt es nichts mehr, was du nicht schon kennst.') }} data-ti-garn-fragen>Zuhören</button></div></>}
      </div>
      {fremd.length > 0 && (
        <div className="ti-kasten" data-ti-kollegen>
          <h3>Was andere Kapitäne melden</h3>
          {fremd.map(f => { const o = feldAus(f.key.slice(1)); return (
            <div key={f.key} className="ti-reihe" style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <span>Kpt. <b>{f.von}</b>: {f.name ? `„${f.name}“, ` : ''}{ART_NAME[f.art] ?? 'ein Fund'} <span className="ti-stumm">im {peilung(ort.q, ort.r, o.q, o.r)}, etwa {Math.max(5, Math.round(abstand(ort.q, ort.r, o.q, o.r) / 5) * 5)} Felder</span></span>
              <button type="button" className="ti-knopf ti-knopf-klein" onClick={() => tue(sp => { sp.stand.geruechte.push({ q: o.q, r: o.r, art: f.art, von: f.von, tag: umwelt().tag }); if (sp.stand.geruechte.length > 12) sp.stand.geruechte.shift() })}>Auf die Karte</button>
            </div>) })}
        </div>
      )}
      {(() => {
        const g = grosserGegner(umwelt().tag)
        return (
          <div className="ti-kasten" data-ti-gross-geruecht>
            <h3>Was die Fischer erzählen</h3>
            <p>{GESTALT_NAME[g.gestalt ?? 'krake']} ist gesichtet worden – im {peilung(ort.q, ort.r, g.q, g.r)}, etwa {Math.max(5, Math.round(abstand(ort.q, ort.r, g.q, g.r) / 5) * 5)} Felder von hier. Alle Kapitäne kämpfen gegen denselben Gegner; wer mitmacht, bekommt seinen Anteil an der Beute. (Mehr unter „Gefechte“.)</p>
          </div>
        )
      })()}
      <div className="ti-kasten">
        <h3>Kontore</h3>
        <p>{Object.keys(s.kontore).length ? `Deine ${Object.keys(s.kontore).length === 1 ? 'Niederlassung hat' : `${Object.keys(s.kontore).length} Niederlassungen haben`} seit der letzten Abrechnung ${zahl(kontorErtrag(s, Date.now()))} Gold erwirtschaftet. Ausgezahlt wird beim Einlaufen in einen Hafen.` : `Rang: ${RAENGE[rangVon(s.ruhm)].name}. Ein Kontor gründet man am Kai einer Hafenstadt.`}</p>
      </div>
    </div>
  )
}

/** Begleitschiffe: anheuern (nur bei einer großen Werft, kleiner als das eigene Schiff), ausbessern, ziehen lassen */
function Geleit({ ortKey, versuche }: { ortKey: string; versuche: (a: Antwort) => void }) {
  const spiel = useTerra(s => s.spiel)
  useTerra(s => s.rev)
  const tue = useTerra(s => s.tue)
  const [name, setName] = useState('')
  const ort = ortVon(ortKey)
  if (!spiel || !ort) return null
  const s = spiel.stand, gross = hatGrosseWerft(ort)
  const moeglich = KLASSEN.filter(k => k.id >= 1 && k.id < s.klasse)
  return (
    <div className="ti-kasten" data-ti-geleit>
      <h3>Begleitschiffe ({s.geleit.length} von {GELEIT_MAX})</h3>
      <p>Ein Begleitschiff kämpft an deiner Seite und bringt die Hälfte seines Laderaums mit – isst aber ein Fünftel mehr Proviant. Es ist immer kleiner als dein eigenes Schiff.</p>
      {s.geleit.map((g, i) => {
        const k = KLASSEN[g.klasse], kosten = geleitReparaturPreis(spiel, i)
        return (
          <div key={i} className="ti-reihe" style={{ justifyContent: 'space-between', marginTop: 8 }} data-ti-geleit-schiff={i}>
            <span><b>„{g.name}“</b> <span className="ti-stumm">{k.name} · Rumpf {g.rumpf}/{k.rumpf}{g.rumpf <= 0 ? ' · kampfunfähig' : ''}</span></span>
            <span className="ti-reihe" style={{ gap: 4 }}>
              {kosten > 0 && <button type="button" className="ti-knopf ti-knopf-klein" disabled={kosten > s.gold} onClick={() => versuche(tue(sp => repariereGeleit(sp, i)))}>Ausbessern ({zahl(kosten)})</button>}
              <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" onClick={() => versuche(tue(sp => entlasseGeleit(sp, i)))}>Ziehen lassen</button>
            </span>
          </div>
        )
      })}
      {gross && s.geleit.length < GELEIT_MAX && moeglich.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <input className="ti-eingabe" maxLength={28} placeholder="Name des Begleitschiffs" value={name} onChange={e => setName(e.target.value)} style={{ marginBottom: 6 }} aria-label="Name des Begleitschiffs" data-ti-geleit-name />
          <div className="ti-reihe">
            {moeglich.map(k => <button key={k.id} type="button" className="ti-knopf ti-knopf-klein" disabled={geleitPreis(k.id) > s.gold} onClick={() => { versuche(tue(sp => heuereGeleit(sp, k.id, name.trim() || k.name))); setName('') }} data-ti-geleit-kaufen={k.id}>{k.name} ({zahl(geleitPreis(k.id))} Gold)</button>)}
          </div>
        </div>
      )}
      {!gross && s.geleit.length < GELEIT_MAX && <p className="ti-stumm" style={{ marginTop: 6 }}>Neue Begleitschiffe gibt es nur bei einer großen Werft.</p>}
    </div>
  )
}

/** Was der Markt eines Ortes anbietet und sucht — als kurzer Text für Hinweise */
export function marktKurz(ortKey: string): string {
  const o = ortVon(ortKey)
  if (!o) return ''
  const m = marktVon(o)
  return `bietet ${m.angebot.map(i => WAREN[i].name).join(', ')} · sucht ${m.nachfrage.map(i => WAREN[i].name).join(', ')}`
}
