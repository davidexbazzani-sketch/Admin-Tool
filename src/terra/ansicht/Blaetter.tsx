// Terra Incognita — die Blätter, die über der Karte aufgehen: Entdeckung, Ereignis, Landgang, Meldung, Umkehr.
import { useMemo, useState } from 'react'
import type { Ereignis } from '../inhalt/ereignisse'
import { heuere } from '../kern/handel'
import { feldAus } from '../kern/hex'
import { antworte, kannWaehlen, wunderVon, type Antwortfolge, type LandErgebnis } from '../kern/land'
import { ART_NAME, inselVorschlag, ortName, saeubereName } from '../kern/namen'
import { ROLLE_NAME, ROLLE_WIRKUNG } from '../kern/schiff'
import { melde, ortVon, ruhmVon } from '../kern/spiel'
import { goldFuerRuhm } from '../kern/waren'
import { abgleich } from '../netz/gemeinsam'
import { umwelt, useTerra } from '../speicher'
import { tagText } from '../zeit'
import { Blatt, Folgen, toast, zahl } from './teile'

const BILD_FUER: Record<string, string> = { hafen: 'hafen', dorf: 'insel', quelle: 'insel', ruine: 'ruine', wunder: 'wunder', einsiedler: 'insel', wrack: 'see', fischgrund: 'see', strudel: 'sturm', treibgut: 'see', insel: 'insel' }

/** „Land in Sicht!“ — was eben neu auf der Karte erschienen ist */
export function EntdeckungBlatt({ keys, onZu }: { keys: readonly string[]; onZu: () => void }) {
  const stand = useTerra(s => s.spiel?.stand)
  useTerra(s => s.rev)
  if (!stand) return null
  const funde = keys.map(k => ({ k, e: stand.entdeckt[k] })).filter(x => x.e)
  const insel = funde.find(f => f.e.t === 'i'), erster = insel ?? funde[0]
  if (!erster) return null
  return (
    <Blatt kennung="entdeckung" bild={BILD_FUER[erster.e.art] ?? 'see'} ueber={insel ? 'Land in Sicht!' : 'Der Ausguck meldet'} titel={funde.length === 1 ? (erster.e.t === 'i' ? 'Eine unbekannte Insel' : ART_NAME[erster.e.art] ?? 'Ein Fund') : `${funde.length} Entdeckungen`} onZu={onZu}
      fuss={<button type="button" className="ti-knopf ti-knopf-gold" onClick={onZu} data-ti-weiter autoFocus>Ins Logbuch</button>}>
      <ul className="ti-folgen">
        {funde.map(({ k, e }) => {
          const o = e.t === 'o' ? ortVon(k.slice(1)) : null
          const wer = e.anspruch === 2 ? ` – entdeckt von Kpt. ${e.von ?? '?'}${e.seit ? ` am ${tagText(e.seit)}` : ''}` : ''
          return <li key={k} data-ti-fund={k}>
            {e.t === 'i'
              ? <>{e.name ? `„${e.name}“` : 'Unbekannte Insel'} <span className="ti-stumm">· {e.felder} Felder{wer}</span></>
              : <>{ART_NAME[e.art] ?? e.art}{o && (e.art === 'hafen' || e.art === 'dorf' || e.art === 'wrack') ? `: ${ortName(o)}` : e.art === 'wunder' && o ? `: ${wunderVon(o).art}` : ''}<span className="ti-stumm">{wer}</span></>}
          </li>
        })}
      </ul>
      <p className="ti-prosa" style={{ marginTop: 12 }}>{funde.some(f => f.e.anspruch === 0)
        ? 'Noch steht das auf keiner Karte. Melde es im nächsten Hafen der Gilde: Wer zuerst meldet, gilt als Entdecker – und darf Inseln und Naturwunder taufen.'
        : 'Hier war schon jemand vor dir. Ruhm bringt die Meldung trotzdem – nur der Name ist vergeben.'}</p>
    </Blatt>
  )
}

/** Ein Ereignis auf See: erst die Lage, dann die Antwort, dann was daraus wurde */
export function EreignisBlatt({ ereignis, onZu }: { ereignis: Ereignis; onZu: (umkehr: boolean) => void }) {
  const stand = useTerra(s => s.spiel?.stand)
  const tue = useTerra(s => s.tue)
  const [ausgang, setAusgang] = useState<Antwortfolge | null>(null)
  if (!stand) return null
  if (ausgang) {
    return (
      <Blatt kennung="ereignis-ausgang" bild={ereignis.bild} ueber={ereignis.titel} fuss={<button type="button" className="ti-knopf ti-knopf-gold" onClick={() => onZu(!!ausgang.folge.umkehr)} data-ti-weiter autoFocus>Weiter</button>}>
        <p className="ti-prosa">{ausgang.text}</p>
        {ausgang.folge.tier && <p className="ti-prosa" style={{ marginTop: 8 }}><b>{ausgang.folge.tier.name}.</b> {ausgang.folge.tier.text}</p>}
        {ausgang.folge.kurios && <p className="ti-prosa" style={{ marginTop: 8 }}><b>{ausgang.folge.kurios.name}.</b> {ausgang.folge.kurios.text}</p>}
        <Folgen zeilen={ausgang.folge.zeilen} />
      </Blatt>
    )
  }
  return (
    <Blatt kennung="ereignis" bild={ereignis.bild} ueber="Auf See" titel={ereignis.titel}>
      <p className="ti-prosa">{ereignis.text}</p>
      <div className="ti-wahl">
        {ereignis.wahl.map((w, i) => {
          const geht = kannWaehlen(stand, w)
          const was = w.braucht?.rolle ? `Dafür braucht es: ${ROLLE_NAME[w.braucht.rolle]}` : w.braucht?.ausbau ? 'Dafür fehlt die Ausrüstung' : w.braucht?.ware ? 'Dafür fehlt die Ware an Bord' : w.braucht?.gold ? 'Dafür reicht das Gold nicht' : ''
          return <button key={i} type="button" disabled={!geht} onClick={() => { const a = tue(sp => antworte(sp, ereignis.id, i, umwelt())); if (a) setAusgang(a); else onZu(false) }} data-ti-wahl={i}>{w.text}{!geht && was && <small>{was}</small>}</button>
        })}
      </div>
    </Blatt>
  )
}

/** Ergebnis eines Landgangs oder einer Fundstelle */
export function LandBlatt({ ergebnis, ortKey, onZu, onRaetsel }: { ergebnis: LandErgebnis; ortKey: string; onZu: (umkehr: boolean) => void; onRaetsel: (art: number) => void }) {
  const tue = useTerra(s => s.tue)
  const stand = useTerra(s => s.spiel?.stand)
  useTerra(s => s.rev)
  const ort = useMemo(() => ortVon(ortKey), [ortKey])
  const [angeheuert, setAngeheuert] = useState('')
  if (!ort || !stand) return null
  const o = ergebnis.offizier && !stand.offiziere.includes(ergebnis.offizier.id) ? ergebnis.offizier : null
  return (
    <Blatt kennung="land" bild={ergebnis.kapitel ? 'ruine' : BILD_FUER[ort.art] ?? 'insel'} ueber={ergebnis.wunder ? 'Naturwunder' : ortName(ort)} titel={ergebnis.titel} onZu={ergebnis.raetsel === undefined ? () => onZu(!!ergebnis.folge.umkehr) : undefined}
      fuss={ergebnis.raetsel !== undefined
        ? <><button type="button" className="ti-knopf ti-knopf-leise" onClick={() => onZu(false)}>Später</button><button type="button" className="ti-knopf ti-knopf-gold" onClick={() => onRaetsel(ergebnis.raetsel as number)} data-ti-raetsel autoFocus>Das Rätsel angehen</button></>
        : <button type="button" className="ti-knopf ti-knopf-gold" onClick={() => onZu(!!ergebnis.folge.umkehr)} data-ti-weiter autoFocus>Weiter</button>}>
      <p className="ti-prosa">{ergebnis.text}</p>
      {ergebnis.folge.kurios && <p className="ti-prosa" style={{ marginTop: 8 }}><b>{ergebnis.folge.kurios.name}.</b> {ergebnis.folge.kurios.text}</p>}
      <Folgen zeilen={ergebnis.folge.zeilen} />
      {ergebnis.kapitel && (
        <div style={{ marginTop: 14, padding: '12px 14px', borderLeft: '3px solid var(--ti-gold)', background: 'var(--ti-flaeche)', borderRadius: 6 }} data-ti-kapitel={ergebnis.kapitel.nr}>
          <div className="ti-ueber">Die Legende der Fortuna · Kapitel {ergebnis.kapitel.nr} von 8</div>
          <h3 style={{ marginTop: 0 }}>{ergebnis.kapitel.titel}</h3>
          <p className="ti-prosa">{ergebnis.kapitel.text}</p>
          <p className="ti-stumm" style={{ marginTop: 6 }}>{ergebnis.kapitel.hinweis}</p>
        </div>
      )}
      {o && (
        <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--ti-flaeche)', borderRadius: 6 }}>
          <p><b>{o.name}</b> ({ROLLE_NAME[o.rolle]}) würde mitkommen. {o.text} <span className="ti-stumm">{ROLLE_WIRKUNG[o.rolle][o.rang - 1]}</span></p>
          {angeheuert ? <p className="ti-fehler" style={{ color: 'var(--ti-gut)' }}>{angeheuert}</p> : <button type="button" className="ti-knopf ti-knopf-klein" style={{ marginTop: 6 }} onClick={() => { const a = tue(sp => heuere(sp, ortKey)); setAngeheuert(a.ok ? `${o.name} kommt an Bord.` : a.grund) }} data-ti-heuern>Anheuern ({zahl(o.heuer)} Gold)</button>}
        </div>
      )}
    </Blatt>
  )
}

/** Die Mannschaft hat das Schiff zurückgebracht */
export function UmkehrBlatt({ grund, onZu }: { grund: 'proviant' | 'rumpf'; onZu: () => void }) {
  const stand = useTerra(s => s.spiel?.stand)
  const hafen = stand ? ortVon(stand.letzterHafen) : null
  return (
    <Blatt kennung="umkehr" bild="sturm" ueber={grund === 'proviant' ? 'Die Fässer sind leer' : 'Das Schiff macht Wasser'} titel="Umkehr" fuss={<button type="button" className="ti-knopf ti-knopf-gold" onClick={onZu} data-ti-weiter autoFocus>Verstanden</button>}>
      <p className="ti-prosa">{grund === 'proviant'
        ? 'Der letzte Zwieback ist gegessen. Die Mannschaft hat das Ruder übernommen und das Schiff auf kürzestem Weg zurückgebracht – mit knurrendem Magen und halber Ladung, der Rest ging als Ballast über Bord.'
        : 'Der Rumpf hielt nicht mehr. Mit letzter Kraft und pausenlosem Pumpen hat die Mannschaft das Schiff zurückgeschleppt. Die halbe Ladung musste über Bord.'}</p>
      <ul className="ti-folgen">
        <li>Zurück in {hafen ? ortName(hafen) : 'Hamburg'}</li>
        {stand && stand.letzterHafen === '0,0'
          ? <li>Der Hafenmeister füllt den Proviant auf vier Tage auf – in Hamburg läuft niemand hungrig aus.</li>
          : <li>Proviant gibt es am Kai. Wer knapp bei Kasse ist, findet dort auch Arbeit.</li>}
        <li>Schiff, Karte und Logbuch sind unversehrt – alle Entdeckungen kannst du hier melden.</li>
      </ul>
    </Blatt>
  )
}

/** Meldung bei der Gilde: Inseln und Naturwunder taufen, Ruhm und Gold kassieren */
export function MeldeBlatt({ onZu }: { onZu: () => void }) {
  const spiel = useTerra(s => s.spiel)
  const tue = useTerra(s => s.tue)
  const offen = useMemo(() => (spiel ? Object.entries(spiel.stand.entdeckt).filter(([, e]) => !e.gemeldet) : []), [spiel])
  const [namen, setNamen] = useState<Record<string, string>>(() => {
    const n: Record<string, string> = {}
    for (const [k, e] of offen) {
      if (e.anspruch !== 0) continue
      if (e.t === 'i') n[k] = e.vorschlag ?? inselVorschlag(e.q, e.r)
      else if (e.art === 'wunder') { const o = ortVon(k.slice(1)); if (o) { const w = wunderVon(o); n[k] = e.vorschlag ?? w.vorschlag[(o.saat >>> 4) % w.vorschlag.length] } }
    }
    return n
  })
  if (!spiel) return null
  const s = spiel.stand
  const ruhm = offen.reduce((a, [, e]) => a + ruhmVon(e), 0)
  const gold = Math.floor(s.gildeLohn / 100) + offen.reduce((a, [, e]) => a + goldFuerRuhm(ruhmVon(e)), 0)
  const sende = (): void => {
    const r = tue(sp => {
      for (const [k, name] of Object.entries(namen)) { const e = sp.stand.entdeckt[k]; if (e && e.anspruch === 0) e.vorschlag = saeubereName(name) || (e.t === 'i' ? inselVorschlag(e.q, e.r) : undefined) }
      return melde(sp)
    })
    if (r.ok) toast(`Die Gilde zahlt ${zahl(r.gold)} Gold. +${zahl(r.ruhm)} Ruhm`)
    void abgleich()          // Ansprüche als Erstentdecker klären (läuft im Hintergrund)
    onZu()
  }
  return (
    <Blatt kennung="melden" breit ueber="Kartographen-Gilde" titel="Meldung der Entdeckungen" onZu={onZu}
      fuss={<><span className="ti-marke ti-marke-gold" style={{ marginRight: 'auto', fontSize: 12 }}>{zahl(gold)} Gold · {zahl(ruhm)} Ruhm</span><button type="button" className="ti-knopf ti-knopf-leise" onClick={onZu}>Noch nicht</button><button type="button" className="ti-knopf ti-knopf-gold" onClick={sende} data-ti-melden-ok>Melden</button></>}>
      <p className="ti-prosa">Der Gildenmeister rückt die Brille zurecht und zieht das große Buch heran. „Dann lasst hören, Kapitän.“</p>
      {s.neueFelder > 0 && <p style={{ marginTop: 8 }}><b>{zahl(s.neueFelder)}</b> neu vermessene Felder: <b>{zahl(Math.floor(s.gildeLohn / 100))} Gold</b></p>}
      {offen.length > 0 && (
        <table className="ti-tabelle" style={{ marginTop: 10 }}>
          <thead><tr><th>Entdeckung</th><th>Name</th><th className="ti-zahl">Ruhm</th></tr></thead>
          <tbody>
            {offen.map(([k, e]) => {
              const o = e.t === 'o' ? ortVon(k.slice(1)) : null, f = feldAus(k.slice(1))
              const taufbar = e.anspruch === 0 && namen[k] !== undefined
              return (
                <tr key={k} data-ti-meldung={k}>
                  <td style={{ whiteSpace: 'nowrap' }}><b>{e.t === 'i' ? 'Insel' : ART_NAME[e.art]}</b>{e.t === 'i' ? <span className="ti-stumm"> · {e.felder} Felder</span> : e.art === 'wunder' && o ? <span className="ti-stumm"> · {wunderVon(o).art}</span> : null}</td>
                  <td>{taufbar
                    ? <span className="ti-reihe" style={{ flexWrap: 'nowrap' }}><input className="ti-eingabe" style={{ padding: '4px 8px' }} maxLength={28} value={namen[k]} onChange={ev => setNamen(n => ({ ...n, [k]: ev.target.value }))} aria-label="Taufname" data-ti-name />
                        {e.t === 'i' && <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise" title="Anderer Vorschlag" onClick={() => setNamen(n => ({ ...n, [k]: inselVorschlag(f.q, f.r, Math.floor(Math.random() * 1000)) }))}>↻</button>}</span>
                    : e.anspruch === 2 ? <span className="ti-leise">{e.name ? `„${e.name}“ – ` : ''}entdeckt von Kpt. {e.von ?? '?'}</span>
                    : <span className="ti-leise">{o ? ortName(o) : ''}</span>}</td>
                  <td className="ti-zahl">{ruhmVon(e)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="ti-stumm" style={{ marginTop: 10 }}>Taufnamen sind für alle Kollegen sichtbar. Bist du der Erste, der meldet, verdoppelt sich der Ruhm – das klärt sich gleich nach der Meldung.</p>
    </Blatt>
  )
}
