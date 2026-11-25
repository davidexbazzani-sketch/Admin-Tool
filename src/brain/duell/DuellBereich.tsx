// Duelle: Kollegen herausfordern (höchstens 3 Minuten), Einladungen annehmen, Bestenliste, eigene Bilanz.
// Wer online ist, kommt aus dem Chat (dort meldet sich jeder, der das Tool offen hat).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Clock, RefreshCw, Swords, Trash2, Trophy, X } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useDuellStore } from '../../store/duellStore'
import { ladeNutzer, sicher, type ChatNutzer } from '../../services/chat'
import type { KatalogEintrag } from '../kern/typen'
import { GEBIETE } from '../kern/typen'
import { KATALOG, uebung } from '../kern/katalog'
import { useBrain } from '../kern/speicher'
import { bereichText, iqText } from '../iq/irt'
import { GebietSymbol } from '../Symbole'
import { DUELL_DAUERN, EINLADUNG_GILT_MS, dauerText, fordereHeraus, gleicherBenutzer, istAbgelaufen, ladeMeta, lehneAb, nimmAn, offeneEinladungen, raeumeAlteAuf, zieheZurueck, type DuellMeta, type Spieler } from './duell'
import { entferneEintrag, ladeBestenliste, type BestenEintrag } from './teilen'
import DuellSpiel from './DuellSpiel'

type Ansicht = { art: 'lobby' } | { art: 'warte'; meta: DuellMeta } | { art: 'spiel'; meta: DuellMeta }

export default function DuellBereich({ onSperre }: { onSperre: (an: boolean) => void }) {
  const benutzer = useAuthStore(s => s.session?.user)
  const ich = useMemo<Spieler>(() => ({ username: benutzer?.username ?? '', displayName: benutzer?.displayName ?? benutzer?.username ?? '' }), [benutzer])
  const duelle = useBrain(s => s.daten.duelle)
  const anstehend = useDuellStore(s => s.anstehend)
  const setzeAnstehend = useDuellStore(s => s.setze)

  const [ansicht, setAnsicht] = useState<Ansicht>({ art: 'lobby' })
  const [nutzer, setNutzer] = useState<ChatNutzer[] | null>(null)
  const [einladungen, setEinladungen] = useState<DuellMeta[]>([])
  const [liste, setListe] = useState<BestenEintrag[] | null>(null)
  const [gegner, setGegner] = useState<string | null>(null)
  const [disziplin, setDisziplin] = useState<string | null>(null)
  const [dauer, setDauer] = useState<number>(120)
  const [meldung, setMeldung] = useState('')
  const [beschaeftigt, setBeschaeftigt] = useState(false)
  const [jetzt, setJetzt] = useState(Date.now())

  const disziplinen = useMemo(() => KATALOG.filter(u => u.duell), [])
  useEffect(() => { onSperre(ansicht.art === 'spiel'); return () => onSperre(false) }, [ansicht.art, onSperre])

  // ── Lobby: wer ist da, offene Einladungen, Bestenliste ──
  const ladeListe = useCallback(() => { void ladeBestenliste().then(setListe) }, [])
  useEffect(() => {
    if (!ich.username || ansicht.art !== 'lobby') return
    let weg = false
    const nutzerLaden = () => { void ladeNutzer().then(n => { if (!weg) setNutzer(n.filter(x => sicher(x.username) !== sicher(ich.username))) }).catch(() => { if (!weg) setNutzer([]) }) }
    const einlLaden = () => { void offeneEinladungen(ich.username).then(e => { if (!weg) setEinladungen(e) }) }
    nutzerLaden(); einlLaden(); ladeListe()
    void raeumeAlteAuf(ich.username)
    const t1 = setInterval(nutzerLaden, 15_000), t2 = setInterval(einlLaden, 5_000)
    return () => { weg = true; clearInterval(t1); clearInterval(t2) }
  }, [ich.username, ansicht.art, ladeListe])

  // ── aus dem Chat heraus gestartet oder angenommen ──
  useEffect(() => {
    if (!anstehend || !ich.username) return
    const id = anstehend
    setzeAnstehend(null)
    void ladeMeta(id).then(m => {
      if (!m) { setMeldung('Das Duell gibt es nicht mehr.'); return }
      if (m.status === 'angenommen') setAnsicht({ art: 'spiel', meta: m })
      else if (m.status === 'offen' && gleicherBenutzer(m.von.username, ich.username)) setAnsicht({ art: 'warte', meta: m })
    })
  }, [anstehend, ich.username, setzeAnstehend])

  // ── warten, bis der Gegner annimmt ──
  useEffect(() => {
    if (ansicht.art !== 'warte') return
    const id = ansicht.meta.id, name = ansicht.meta.an.displayName
    const t = setInterval(() => {
      setJetzt(Date.now())
      void ladeMeta(id).then(m => {
        if (!m) return
        if (m.status === 'angenommen') setAnsicht({ art: 'spiel', meta: m })
        else if (m.status === 'abgelehnt') { setMeldung(`${name} hat abgelehnt.`); setAnsicht({ art: 'lobby' }) }
        else if (istAbgelaufen(m)) { void zieheZurueck(id, ich.username); setMeldung(`${name} hat nicht geantwortet — die Einladung ist abgelaufen.`); setAnsicht({ art: 'lobby' }) }
      })
    }, 1500)
    return () => clearInterval(t)
  }, [ansicht, ich.username])

  const fordere = async () => {
    const g = nutzer?.find(n => n.username === gegner), d = disziplin ? uebung(disziplin) : undefined
    if (!g || !d || beschaeftigt) return
    setBeschaeftigt(true); setMeldung('')
    const m = await fordereHeraus(ich, { username: g.username, displayName: g.displayName }, { id: d.id, name: d.name }, dauer)
    setBeschaeftigt(false)
    if (m) setAnsicht({ art: 'warte', meta: m }); else setMeldung('Die Herausforderung konnte nicht gesendet werden (Netzlaufwerk nicht erreichbar?).')
  }
  const annehmen = async (m: DuellMeta) => {
    if (beschaeftigt) return
    setBeschaeftigt(true); setMeldung('')
    const r = await nimmAn(m.id, ich.username)
    setBeschaeftigt(false)
    if (r.ok) setAnsicht({ art: 'spiel', meta: r.meta }); else { setMeldung(r.grund); setEinladungen(e => e.filter(x => x.id !== m.id)) }
  }

  if (ansicht.art === 'spiel') return <DuellSpiel key={ansicht.meta.id} meta={ansicht.meta} ich={ich} onEnde={() => setAnsicht({ art: 'lobby' })} />

  if (ansicht.art === 'warte') {
    const rest = Math.max(0, Math.ceil((EINLADUNG_GILT_MS - (jetzt - new Date(ansicht.meta.erstellt).getTime())) / 1000))
    return (
      <div className="bt-breite" data-bt-duell-warte>
        <div className="bt-karte bt-ein" style={{ maxWidth: 540, margin: '48px auto 0', padding: 28, textAlign: 'center' }}>
          <span className="bt-symbol" style={{ width: 54, height: 54, margin: '0 auto 12px', background: 'var(--bt-akzent2-weich)', color: 'var(--bt-akzent2)' }}><Swords size={24} /></span>
          <h2 className="bt-h2">Warte auf {ansicht.meta.an.displayName} …</h2>
          <p className="bt-leise" style={{ margin: '8px 0 4px' }}>{ansicht.meta.disziplinName} · {dauerText(ansicht.meta.dauerSek)}</p>
          <p className="bt-klein bt-stumm" style={{ margin: 0 }}>Die Einladung steht im Chat. Sie gilt noch {Math.floor(rest / 60)}:{String(rest % 60).padStart(2, '0')} Minuten.</p>
          <button type="button" className="bt-knopf bt-knopf-leise" style={{ marginTop: 18 }} onClick={() => { void zieheZurueck(ansicht.meta.id, ich.username); setAnsicht({ art: 'lobby' }) }} data-bt-duell-zurueckziehen><X size={15} />Zurückziehen</button>
        </div>
      </div>
    )
  }

  const online = (nutzer ?? []).filter(n => n.online)
  const siege = duelle.filter(d => d.ausgang === 1).length, niederlagen = duelle.filter(d => d.ausgang === -1).length
  const meinEintrag = liste?.find(e => gleicherBenutzer(e.username, ich.username))

  return (
    <div className="bt-breite" data-bt-bereich="duelle">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <span className="bt-symbol" style={{ width: 46, height: 46, background: 'var(--bt-akzent2-weich)', color: 'var(--bt-akzent2)' }}><Swords size={22} /></span>
        <div style={{ flex: 1 }}>
          <h1 className="bt-h1">Duelle</h1>
          <p className="bt-leise" style={{ margin: '2px 0 0' }}>Dieselben Aufgaben, dieselbe Zeit — wer holt mehr Punkte? Ein Duell dauert 1 bis 3 Minuten.</p>
        </div>
        {duelle.length > 0 && <span className="bt-chip bt-zahl" title="Deine Bilanz (nur für dich sichtbar)"><Trophy size={12} />{siege} : {niederlagen}</span>}
      </div>

      {meldung && <div className="bt-hinweis" style={{ marginBottom: 14 }} data-bt-duell-meldung>{meldung}</div>}

      {einladungen.length > 0 && (
        <section className="bt-karte" style={{ marginBottom: 14, borderColor: 'var(--bt-akzent2)' }} data-bt-einladungen>
          <h2 className="bt-h3" style={{ marginBottom: 8 }}>Du wirst herausgefordert</h2>
          {einladungen.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <span style={{ flex: 1 }}><b>{m.von.displayName}</b> <span className="bt-leise">· {m.disziplinName} · {dauerText(m.dauerSek)}</span></span>
              <button type="button" className="bt-knopf" disabled={beschaeftigt} onClick={() => void annehmen(m)} data-bt-einladung-annehmen={m.id}><Check size={15} />Annehmen</button>
              <button type="button" className="bt-knopf bt-knopf-leise" onClick={() => { void lehneAb(m.id, ich.username); setEinladungen(e => e.filter(x => x.id !== m.id)) }}>Ablehnen</button>
            </div>
          ))}
        </section>
      )}

      <div className="bt-raster bt-heute-raster">
        {/* ── Herausfordern ── */}
        <section className="bt-karte" data-bt-herausfordern>
          <h2 className="bt-h2" style={{ marginBottom: 12 }}>Jemanden herausfordern</h2>

          <div className="bt-label" style={{ marginBottom: 6 }}>1 · Wer?</div>
          {nutzer === null ? <div className="bt-klein bt-stumm">Lädt …</div>
            : online.length === 0 ? <div className="bt-klein bt-leise">Gerade hat niemand außer dir das Tool offen. Sobald jemand da ist, erscheint er hier.</div> : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {online.map(n => (
                  <button key={n.username} type="button" className={`bt-chip ${gegner === n.username ? 'bt-chip-akzent' : ''}`} style={{ cursor: 'pointer', padding: '6px 12px', fontSize: 13 }}
                    aria-pressed={gegner === n.username} onClick={() => setGegner(n.username)} data-bt-gegner={n.username}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: n.inaktiv ? 'var(--bt-warn)' : 'var(--bt-gut)' }} />{n.displayName}
                  </button>
                ))}
              </div>
            )}

          <div className="bt-label" style={{ margin: '16px 0 6px' }}>2 · Worin?</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {GEBIETE.filter(g => disziplinen.some(d => d.gebiet === g.id)).map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="bt-klein bt-leise" style={{ width: 118, display: 'inline-flex', alignItems: 'center', gap: 6 }}><GebietSymbol gebiet={g.id} size={13} />{g.name}</span>
                {disziplinen.filter(d => d.gebiet === g.id).map((d: KatalogEintrag) => (
                  <button key={d.id} type="button" className={`bt-chip ${disziplin === d.id ? 'bt-chip-akzent' : ''}`} style={{ cursor: 'pointer', padding: '5px 11px' }}
                    aria-pressed={disziplin === d.id} onClick={() => setDisziplin(d.id)} title={d.kurz} data-bt-disziplin={d.id}>{d.name}</button>
                ))}
              </div>
            ))}
          </div>

          <div className="bt-label" style={{ margin: '16px 0 6px' }}>3 · Wie lange?</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {DUELL_DAUERN.map(s => (
              <button key={s} type="button" className={`bt-chip ${dauer === s ? 'bt-chip-akzent' : ''}`} style={{ cursor: 'pointer', padding: '5px 12px' }} aria-pressed={dauer === s} onClick={() => setDauer(s)} data-bt-dauer={s}><Clock size={12} />{dauerText(s)}</button>
            ))}
          </div>

          <button type="button" className="bt-knopf bt-knopf-gross" style={{ marginTop: 18, width: '100%' }} disabled={!gegner || !disziplin || beschaeftigt} onClick={() => void fordere()} data-bt-fordere>
            <Swords size={17} />{beschaeftigt ? 'Sende …' : 'Herausfordern'}
          </button>
          <div className="bt-klein bt-stumm" style={{ marginTop: 8 }}>Die Einladung kommt beim Gegner als Chat-Nachricht an. Im Duell sieht er deinen Punktestand — sonst nichts von dir.</div>
        </section>

        <div className="bt-raster">
          {/* ── Bestenliste ── */}
          <section className="bt-karte" data-bt-bestenliste>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h2 className="bt-h2" style={{ flex: 1 }}>Bestenliste IQ-Test</h2>
              <button type="button" className="bt-knopf bt-knopf-nackt" style={{ padding: 6 }} onClick={ladeListe} aria-label="Neu laden" title="Neu laden"><RefreshCw size={14} /></button>
            </div>
            <div className="bt-klein bt-leise" style={{ marginBottom: 8 }}>Freiwillig: Hier steht nur, wer sein Ergebnis selbst eingetragen hat.</div>
            {liste === null ? <div className="bt-klein bt-stumm">Lädt …</div>
              : liste.length === 0 ? <div className="bt-klein bt-leise">Noch kein Eintrag. Nach einem IQ-Test kannst du dich über „Teilen“ eintragen.</div> : (
                <table className="bt-tabelle">
                  <thead><tr><th>#</th><th>Name</th><th>Schätzwert</th><th>Bereich</th><th>Fragen</th></tr></thead>
                  <tbody>
                    {liste.slice(0, 15).map((e, i) => (
                      <tr key={e.username} style={gleicherBenutzer(e.username, ich.username) ? { background: 'var(--bt-akzent-weich)' } : undefined}>
                        <td>{i + 1}</td><td><b>{e.displayName}</b></td><td>{iqText(e.iq)}</td><td>{bereichText(e.von, e.bis)}</td><td>{e.fragen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            {meinEintrag && (
              <button type="button" className="bt-knopf bt-knopf-nackt" style={{ marginTop: 8, marginLeft: -10 }} onClick={() => { void entferneEintrag(ich.username).then(ladeListe) }} data-bt-bestenliste-entfernen><Trash2 size={14} />Meinen Eintrag entfernen</button>
            )}
          </section>

          {/* ── eigene Bilanz ── */}
          <section className="bt-karte" data-bt-bilanz>
            <h2 className="bt-h2" style={{ marginBottom: 4 }}>Deine letzten Duelle</h2>
            <div className="bt-klein bt-leise" style={{ marginBottom: 8 }}>Nur für dich sichtbar.</div>
            {duelle.length === 0 ? <div className="bt-klein bt-leise">Noch kein Duell gespielt.</div> : (
              <table className="bt-tabelle">
                <thead><tr><th>Datum</th><th>Gegner</th><th>Disziplin</th><th>Stand</th><th /></tr></thead>
                <tbody>
                  {duelle.slice(-8).reverse().map(d => (
                    <tr key={d.t}>
                      <td>{new Date(d.t).toLocaleDateString('de-DE')}</td><td>{d.gegner}</td><td>{uebung(d.disziplin)?.name ?? d.disziplin}</td><td>{d.ich} : {d.er}</td>
                      <td><span className={`bt-chip ${d.ausgang === 1 ? 'bt-chip-gut' : d.ausgang === -1 ? 'bt-chip-warm' : ''}`}>{d.ausgang === 1 ? 'Sieg' : d.ausgang === -1 ? 'Niederlage' : 'Remis'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
