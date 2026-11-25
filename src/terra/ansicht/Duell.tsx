// Terra Incognita — Live-Duell auf dem Bildschirm (Stufe 3): Einladung, Annehmen, das Gefecht Zug um Zug, Ergebnis.
// Die Netzarbeit steckt in netz/duell.ts; hier wird nur gezeigt und weitergegeben.
import { useEffect, useRef, useState } from 'react'
import { type KampfAkte } from '../kampf/kampf'
import type { DuellEinladung } from '../kampf/duell'
import { KLASSEN } from '../kern/schiff'
import { ANTRITT_MS, EINLADUNG_MS, gibAuf, liesEinladung, lehneAb, meineId, nimmAn, schliesse, sendeZug, befehlGegeben, useDuell, ziehZurueck, ZUG_FRIST_MS, duellSchiff } from '../netz/duell'
import { useTerra } from '../speicher'
import { klang } from '../ton/klang'
import KampfAnsicht, { KampfWiederholung } from './Kampf'
import { Blatt, Folgen, toast, zahl } from './teile'

const schiffText = (s: { klasse: number; name: string; kanonen: number; rumpfMax: number; crewMax: number }): string => `${KLASSEN[s.klasse]?.name ?? 'Schiff'} „${s.name}“ · Rumpf ${s.rumpfMax} · ${s.kanonen} Kanonen je Seite · ${s.crewMax} Mann`
const minuten = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** Sekunden-Takt, solange etwas auf eine Frist wartet (nur dann — kein Dauerlauf) */
function useSekunde(an: boolean): number {
  const [jetzt, setJetzt] = useState(Date.now())
  useEffect(() => { if (!an) return; const t = window.setInterval(() => setJetzt(Date.now()), 1000); return () => window.clearInterval(t) }, [an])
  return jetzt
}

/** B hat im Chat „Annehmen“ geklickt: hier wird mit dem eigenen Schiff endgültig angenommen (oder abgelehnt) */
export function DuellAngebot() {
  const angebot = useDuell(s => s.angebot)
  const spiel = useTerra(s => s.spiel)
  const [e, setE] = useState<DuellEinladung | null | 'fehlt' | 'fassung'>(null)
  const [laeuft, setLaeuft] = useState(false)
  const jetzt = useSekunde(!!angebot)
  useEffect(() => {
    if (!angebot) return
    let lebt = true
    setE(null)
    void liesEinladung(angebot.id).then(x => {
      if (!lebt) return
      // eine Einladung aus einer anderen Fassung des Tools: gleich absagen (mit Grund — der andere erfährt es so)
      if (x && x.lage.phase === 'fassung') { setE('fassung'); void lehneAb(angebot.id, 'fassung'); return }
      setE(x && x.lage.phase === 'einladung' ? x.e : 'fehlt')
    })
    return () => { lebt = false }
  }, [angebot])
  if (!angebot || !spiel) return null
  const rest = Math.max(0, Math.ceil((angebot.bis - jetzt) / 1000))
  const zu = (): void => useDuell.setState({ angebot: null })
  if (e === null) return <Blatt kennung="duell-angebot" ueber="Seegefecht" titel="Die Einladung wird gelesen …" onZu={zu} />
  if (e === 'fassung') return <Blatt kennung="duell-angebot" ueber="Seegefecht" titel="Verschiedene Fassungen des Tools" onZu={zu} fuss={<button type="button" className="ti-knopf ti-knopf-gold" onClick={zu}>Schließen</button>}><p className="ti-prosa" data-ti-duell-fassung>Dein Kollege hat eine andere Fassung des IT Admin Tools – ein Seegefecht geht erst, wenn beide dieselbe haben. Die Einladung ist abgesagt (mit diesem Grund).</p></Blatt>
  if (e === 'fehlt') return <Blatt kennung="duell-angebot" ueber="Seegefecht" titel="Die Einladung ist nicht mehr offen" onZu={zu} fuss={<button type="button" className="ti-knopf ti-knopf-gold" onClick={zu}>Schließen</button>}><p className="ti-prosa">Sie wurde zurückgezogen, ist abgelaufen oder das Duell hat schon begonnen.</p></Blatt>
  const mein = duellSchiff(spiel.stand)
  return (
    <Blatt kennung="duell-angebot" bild="duell" ueber="Herausforderung zum Seegefecht" titel={`Kpt. ${e.an} fordert dich heraus`} breit onZu={zu}
      fuss={<>
        <button type="button" className="ti-knopf ti-knopf-leise" disabled={laeuft} onClick={() => { void lehneAb(angebot.id); toast('Abgelehnt.') }} data-ti-duell-ablehnen>Ablehnen</button>
        <button type="button" className="ti-knopf ti-knopf-gold" disabled={laeuft || rest <= 0 || spiel.stand.gold < e.ein} onClick={() => { setLaeuft(true); void nimmAn(angebot.id, angebot.bis).then(f => { setLaeuft(false); if (f) toast(f); else klang('glocke') }) }} data-ti-duell-annehmen>Annehmen</button>
      </>}>
      <p className="ti-prosa">Ein Duell Zug um Zug, Flaggschiff gegen Flaggschiff, höchstens zehn Runden. Beide segeln mit vollem Rumpf – ein Duell beschädigt kein Schiff. Wer flieht, die Flagge streicht oder aufgibt, hat verloren. Wer zu lange zögert, dem nimmt die Mannschaft den Zug ab.</p>
      <ul className="ti-folgen" style={{ marginTop: 10 }}>
        <li>Kpt. {e.an}: {schiffText(e.schiff)}</li>
        <li>Du: {schiffText(mein)}</li>
        <li>{e.ein ? `Einsatz: ${zahl(e.ein)} Gold – er geht beim Annehmen als Pfand aus deiner Kasse; der Sieger bekommt beide Einsätze, bei Unentschieden kommt er zurück` : 'Ohne Einsatz – nur um die Ehre'}</li>
      </ul>
      {spiel.stand.gold < e.ein && <p className="ti-fehler" style={{ marginTop: 8 }}>So viel Gold ist nicht in deiner Kasse.</p>}
      <p className="ti-stumm" style={{ marginTop: 8 }}>{rest > 0 ? `Die Einladung gilt noch ${minuten(rest)} Minuten.` : 'Die Einladung ist abgelaufen.'}</p>
    </Blatt>
  )
}

/** Das Duell auf dem Bildschirm (solange useDuell.id gesetzt ist) */
export default function DuellAnsicht() {
  const id = useDuell(s => s.id)
  const lage = useDuell(s => s.lage)
  const seit = useDuell(s => s.seit)
  const fassung = useDuell(s => s.fassung)
  const hinweis = useDuell(s => s.hinweis)
  const sendet = useDuell(s => s.sendet)
  const schnell = useTerra(s => s.spiel?.stand.einstellungen.schnell ?? false)
  const bis = useTerra(s => (id ? s.spiel?.stand.duelle.find(d => d.id === id)?.bis : undefined))
  const [gezeigt, setGezeigt] = useState(false)
  const [wiederholung, setWiederholung] = useState<KampfAkte | null>(null)
  /** wo der eigene Zug begann: Zahl der Befehle, Runde und Stelle in der Reihe (daran erkennt die Ansicht sein Ende) */
  const zugStart = useRef({ n: 0, runde: 0, pos: 0 })
  const ersteFassung = useRef<number | null>(null)
  const jetzt = useSekunde(!!lage && (lage.phase === 'kampf' || lage.phase === 'einladung'))
  // zu Beginn jedes neuen Stands: Hier beginnt (falls ich dran bin) mein Zug
  useEffect(() => { if (lage && 'k' in lage && lage.k) zugStart.current = { n: lage.k.aktionen.length, runde: lage.k.runde, pos: lage.k.pos } }, [lage])
  useEffect(() => { setGezeigt(false); ersteFassung.current = null }, [id])
  if (!id) return null
  if (!lage) return <Blatt kennung="duell" ueber="Seegefecht" titel="Das Duell wird geladen …" onZu={schliesse} />
  if (lage.phase === 'leer') return <Blatt kennung="duell" ueber="Seegefecht" titel="Dieses Duell gibt es nicht" onZu={schliesse} fuss={<button type="button" className="ti-knopf ti-knopf-gold" onClick={schliesse}>Schließen</button>} />
  if (lage.phase === 'fassung') return <Blatt kennung="duell" ueber="Seegefecht" titel="Verschiedene Fassungen des Tools" onZu={schliesse} fuss={<button type="button" className="ti-knopf ti-knopf-gold" onClick={schliesse}>Schließen</button>}><p className="ti-prosa">Dieses Duell lief mit einer anderen Fassung des Tools (ein Update dazwischen?). Es ist abgebrochen – ohne Einsatz.</p></Blatt>
  const e = lage.e, mein = meineId(lage), gegner = mein === 0 ? e.bn : e.an
  if (lage.phase === 'einladung') {
    const rest = Math.max(0, Math.ceil(((bis ?? seit + EINLADUNG_MS) - jetzt) / 1000))
    return (
      <Blatt kennung="duell" bild="duell" ueber="Seegefecht" titel={`Einladung an Kpt. ${gegner}`} onZu={schliesse}
        fuss={<>
          <button type="button" className="ti-knopf ti-knopf-leise" onClick={() => { void ziehZurueck(id) }} data-ti-duell-zurueck>Zurückziehen</button>
          <button type="button" className="ti-knopf" onClick={schliesse} data-ti-duell-hintergrund>Im Hintergrund warten</button>
        </>}>
        <p className="ti-prosa" data-ti-duell-wartet>Die Karte liegt im Chat. Sobald Kpt. {gegner} annimmt, beginnt das Gefecht{e.ein ? ` – Einsatz ${zahl(e.ein)} Gold (er liegt als Pfand bereit)` : ''}. Wartest du im Hintergrund, holt dich das Gefecht zurück, sobald es beginnt.</p>
        <p className="ti-stumm" style={{ marginTop: 8 }}>{rest > 0 ? `Noch ${minuten(rest)} Minuten, dann verfällt die Einladung.` : 'Die Einladung ist abgelaufen und wird zurückgezogen …'}</p>
      </Blatt>
    )
  }
  if (lage.phase === 'abgelehnt' || lage.phase === 'zurueck') {
    return (
      <Blatt kennung="duell" ueber="Seegefecht" titel={lage.phase === 'abgelehnt' ? `Kpt. ${gegner} hat abgelehnt` : 'Die Einladung ist zurückgezogen'} onZu={schliesse}
        fuss={<button type="button" className="ti-knopf ti-knopf-gold" onClick={schliesse} data-ti-duell-schliessen>Schließen</button>}>
        <p className="ti-prosa">{lage.phase === 'abgelehnt' ? (lage.fassung ? `Kpt. ${gegner} hat eine andere Fassung des Tools – ein Duell geht erst, wenn beide dieselbe haben.` : 'Vielleicht ein andermal.') : 'Es gab kein Gefecht.'}{e.ein ? ' Der Einsatz ist zurück in der Kasse.' : ''}</p>
      </Blatt>
    )
  }
  if (wiederholung) return <KampfWiederholung akte={wiederholung} titel={`Duell gegen Kpt. ${gegner}`} meineId={mein} offen onZu={() => setWiederholung(null)} />
  // entschieden ohne Kampfende (Aufgabe, Abbruch, verfallen, nicht angetreten) oder der Kampf ist fertig gezeigt: das Ergebnis
  const ende = lage.phase === 'ende' && (lage.grund !== 'kampf' || gezeigt || !lage.k)
  if (ende && lage.phase === 'ende') {
    const ich = mein === 0 ? 'a' : 'b', erg = lage.sieger === null ? 'remis' : lage.sieger === ich ? 'sieg' : 'niederlage'
    const grund = lage.grund === 'aufgabe' ? (erg === 'sieg' ? `Kpt. ${gegner} hat aufgegeben.` : 'Du hast aufgegeben.')
      : lage.grund === 'verfallen' ? 'Das Duell blieb zwei Tage unentschieden und ist verfallen.'
        : lage.grund === 'fern' ? 'Einer der beiden ist nicht angetreten – es gab kein Gefecht.'
          : lage.grund === 'abbruch' ? 'Das Duell wurde abgebrochen – die beiden PCs rechneten nicht gleich (verschiedene Fassungen des Tools?).'
            : erg === 'remis' ? 'Nach zehn Runden ist keiner geschlagen.'
              : erg === 'sieg' ? 'Das Schiff deines Gegners ist kampfunfähig, hat die Flagge gestrichen oder ist geflohen.' : 'Dein Schiff ist kampfunfähig, hat die Flagge gestrichen oder ist geflohen.'
    const zeilen = [erg === 'remis' ? (e.ein ? 'Unentschieden – dein Einsatz ist zurück in der Kasse.' : 'Unentschieden.') : e.ein ? (erg === 'sieg' ? `+${zahl(e.ein)} Gold Einsatz (beide Einsätze gehen an dich)` : `−${zahl(e.ein)} Gold Einsatz`) : 'Ohne Einsatz – nur um die Ehre.', ...(erg === 'sieg' ? ['+25 Ruhm'] : [])]
    const akte: KampfAkte | null = lage.k ? { start: lage.k.start, aktionen: lage.k.aktionen.slice() } : null
    return (
      <Blatt kennung="duell-ende" bild="duell" ueber="Seegefecht" titel={erg === 'sieg' ? 'Gewonnen!' : erg === 'niederlage' ? 'Verloren' : 'Unentschieden'} onZu={schliesse}
        fuss={<>
          {akte && akte.aktionen.length > 0 && <button type="button" className="ti-knopf ti-knopf-leise" onClick={() => setWiederholung(akte)} data-ti-duell-wiederholung>Wiederholung ansehen</button>}
          <button type="button" className="ti-knopf ti-knopf-gold" onClick={schliesse} data-ti-duell-schliessen autoFocus>Weiter</button>
        </>}>
        <p className="ti-prosa" data-ti-duell-ergebnis={erg}>Duell gegen Kpt. {gegner}. {grund}</p>
        <Folgen zeilen={zeilen} />
      </Blatt>
    )
  }
  // das Gefecht
  if (!('k' in lage) || !lage.k) return null
  const k = lage.k
  if (ersteFassung.current === null) ersteFassung.current = fassung
  const dran = lage.phase === 'kampf' ? lage.amZug : null
  const frist = lage.phase === 'kampf' && !lage.erschienen ? ANTRITT_MS : ZUG_FRIST_MS
  const rest = Math.max(0, Math.ceil((seit + frist - jetzt) / 1000))
  const kopf = lage.phase === 'gestoert' ? 'Die beiden PCs rechnen nicht gleich – das Duell wird abgebrochen …'
    : lage.phase === 'ende' ? ''
      : sendet ? 'Dein Zug geht an den Gegner …'
        : dran === mein ? (lage.phase === 'kampf' && !lage.erschienen ? `Du bist am Zug – zieh innerhalb von ${minuten(rest)} Minuten, sonst gilt das Duell als nicht angetreten.` : `Du bist am Zug – nach ${rest} s darf Kpt. ${gegner} ihn deiner Mannschaft überlassen.`)
          : lage.phase === 'kampf' && !lage.erschienen ? `Kpt. ${gegner} ist am Zug – erscheint er nicht innerhalb von ${minuten(rest)} Minuten, endet das Duell ohne Gefecht.` : `Kpt. ${gegner} ist am Zug – noch ${rest} s, dann übernimmt die Mannschaft.`
  return (
    <KampfAnsicht key={`${id}-${fassung}`} kampf={k} titel={`Duell gegen Kpt. ${gegner}`} schnell={schnell} meineId={mein}
      fortsetzen={fassung !== ersteFassung.current || k.aktionen.length > 0}
      onBefehl={kk => {
        befehlGegeben()
        // der eigene Zug ist zu Ende (Zug beendet, geflohen, Schiff außer Gefecht, Kampf entschieden): alle Befehle
        // seit Zugbeginn als EINE Datei hinaus. (Steuert die Mannschaft das andere Schiff, ist man danach gleich
        // wieder dran — das ist dann schon der nächste Zug.)
        const s = zugStart.current
        if (kk.ende || kk.runde !== s.runde || kk.pos !== s.pos) {
          const akt = kk.aktionen.slice(s.n)
          zugStart.current = { n: kk.aktionen.length, runde: kk.runde, pos: kk.pos }
          void sendeZug(kk, akt)
        }
      }}
      onEnde={() => setGezeigt(true)}
      duell={{ gegner, onAufgabe: () => { void gibAuf().then(f => { if (f) toast(f) }) }, hinweis: [kopf, hinweis].filter(Boolean).join(' ') || undefined, sperre: sendet || lage.phase !== 'kampf', onSchliessen: lage.phase === 'gestoert' ? schliesse : undefined }} />
  )
}
