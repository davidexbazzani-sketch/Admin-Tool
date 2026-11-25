// Parla Italiano — Italienisch lernen im Pausenraum (seit 18.11.2026).
// Eigenständiger Bereich mit eigener Farbwelt und Navigation. Wird erst beim Öffnen geladen;
// Lerninhalte, Bilder und Ton kommen einzeln nach, wenn sie gebraucht werden.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BarChart3, CalendarCheck, ClipboardCheck, Dumbbell, Flame, Headphones, Lock, Map as KartenSymbol, Settings, Users, VolumeX } from 'lucide-react'
import './italiano.css'
import { useAuthStore } from '../store/authStore'
import { useAppStore } from '../store/appStore'
import { useItaliano } from './kern/speicher'
import { serie } from './kern/serie'
import { tagesStand } from './kern/stand'
import { heute } from './kern/zeit'
import { stufenName, AM_ZIEL } from './kern/lehrplan'
import { ladeEigenen, veroeffentliche } from './kern/gruppe'
import { EINSTUFUNG_STUFEN } from './kern/aufgaben'
import { gibTonwegFrei, stoppeTon } from './kern/ton'
import Heute from './bereiche/Heute'
import { EsameAblauf, LektionAblauf, TagestestAblauf } from './ablauf/Programm'
import { Konfetti, Laedt } from './ablauf/gemeinsam'
import { ABZEICHEN, abzeichenVon } from './kern/abzeichen'

const Reise = lazy(() => import('./bereiche/Reise'))
const Training = lazy(() => import('./bereiche/Training'))
const Tests = lazy(() => import('./bereiche/Tests'))
const Reisegruppe = lazy(() => import('./bereiche/Reisegruppe'))
const Fortschritt = lazy(() => import('./bereiche/Fortschritt'))
const Einstellungen = lazy(() => import('./bereiche/Einstellungen'))

export type Bereich = 'heute' | 'reise' | 'training' | 'tests' | 'gruppe' | 'fortschritt' | 'einstellungen'
export type Programm = null | { art: 'lektion'; tag: number } | { art: 'test'; tag: number; stoff: number } | { art: 'esame'; level: number }

const NAV: { id: Bereich; name: string; Symbol: typeof Flame }[] = [
  { id: 'heute', name: 'Heute', Symbol: CalendarCheck },
  { id: 'reise', name: 'Reise', Symbol: KartenSymbol },
  { id: 'training', name: 'Training', Symbol: Dumbbell },
  { id: 'tests', name: 'Tests', Symbol: ClipboardCheck },
  { id: 'gruppe', name: 'Reisegruppe', Symbol: Users },
  { id: 'fortschritt', name: 'Fortschritt', Symbol: BarChart3 },
  { id: 'einstellungen', name: 'Einstellungen', Symbol: Settings },
]

export default function ParlaItaliano({ startBereich }: { startBereich?: Bereich }) {
  const benutzer = useAuthStore(s => s.session?.user.username ?? '')
  const anzeigeName = useAuthStore(s => s.session?.user.displayName ?? '')
  const setScreen = useAppStore(s => s.setScreen)
  const geladen = useItaliano(s => s.geladen && s.benutzer.toLowerCase() === benutzer.toLowerCase())
  const lade = useItaliano(s => s.lade)
  const sichere = useItaliano(s => s.sichere)
  const daten = useItaliano(s => s.daten)
  const neu = useItaliano(s => s.neu)
  const verschluesselung = useItaliano(s => s.verschluesselung)
  const [bereich, setBereich] = useState<Bereich>(startBereich ?? 'heute')
  const [programm, setProgramm] = useState<Programm>(null)
  /** läuft im Bereich selbst etwas, das man nicht versehentlich verlassen soll (Training, Test)? */
  const [gesperrt, setGesperrt] = useState(false)
  /** Tests-Bereich soll gleich die Einstufung öffnen */
  const [einstufung, setEinstufung] = useState(false)

  useEffect(() => { if (benutzer) void lade(benutzer) }, [benutzer, lade])
  // beim Verlassen sofort schreiben und Ton anhalten
  useEffect(() => () => { stoppeTon(); void sichere() }, [sichere])
  // beim Verlassen des Kurses das Headset sofort wieder freigeben (siehe kern/ton.ts „Tonweg wach halten“)
  useEffect(() => () => gibTonwegFrei(), [])

  const s = useMemo(() => serie(daten, heute()), [daten])
  const stand = useMemo(() => tagesStand(daten, heute()), [daten])

  // Level für alle sichtbar machen: einmal beim Öffnen und bei jedem Aufstieg (nur Name, Level, seit wann)
  const level = daten.level
  const seit = useMemo(() => {
    const letzte = [...daten.pruefungen].reverse().find(p => p.ok)
    return (letzte?.am ?? daten.begonnen).slice(0, 10)
  }, [daten.pruefungen, daten.begonnen])
  useEffect(() => {
    if (!geladen || !benutzer || (neu && !daten.gesehen.willkommen)) return
    void veroeffentliche({ username: benutzer.toLowerCase(), displayName: anzeigeName || benutzer, level, seit })
  }, [geladen, benutzer, anzeigeName, level, seit, neu, daten.gesehen.willkommen])

  if (!benutzer) return <div className="pi-app"><div className="pi-inhalt pi-leise">Bitte zuerst anmelden.</div></div>

  const zu = !!programm || gesperrt
  const geh = (b: Bereich) => { setProgramm(null); setEinstufung(false); setBereich(b) }

  return (
    <div className="pi-app" data-pi-app>
      <header className="pi-kopf">
        <button type="button" className="pi-knopf pi-knopf-nackt" style={{ padding: 6, marginRight: -6 }} disabled={zu} onClick={() => setScreen('games')} aria-label="Zurück zum Pausenraum" title="Zurück zum Pausenraum" data-pi-pausenraum><ArrowLeft size={16} /></button>
        <div className="pi-marke"><span className="pi-flagge" aria-hidden><i /><i /><i /></span><span>Parla <em>Italiano</em></span></div>
        <nav className="pi-nav" aria-label="Parla Italiano">
          {NAV.map(n => (
            <button key={n.id} type="button" aria-current={bereich === n.id && !programm ? 'page' : undefined} disabled={zu} onClick={() => geh(n.id)} data-pi-nav={n.id}>
              <n.Symbol size={15} />{n.name}
            </button>
          ))}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {geladen && !verschluesselung && <span className="pi-chip" title="Auf diesem PC kann nicht verschlüsselt gespeichert werden – der Lernstand gilt nur für diese Sitzung."><Lock size={12} />nur diese Sitzung</span>}
          {geladen && <span className="pi-chip" title={daten.einstellungen.ton ? 'Ton ist an – am besten mit Kopfhörer' : 'Ton ist aus (Einstellungen)'}>{daten.einstellungen.ton ? <Headphones size={12} /> : <VolumeX size={12} />}</span>}
          {geladen && <span className="pi-chip pi-chip-akzent" data-pi-level={level}>{level >= AM_ZIEL ? 'Am Ziel · B1' : stufenName(level)}</span>}
          {geladen && <span className={`pi-chip pi-zahl ${s.aktuell > 0 ? 'pi-chip-gold' : ''}`} title={s.heuteGelernt ? 'Heute schon gelernt' : s.offen ? 'Heute noch nicht gelernt – die Serie läuft noch' : 'Lern heute, um eine Serie zu beginnen'} data-pi-serie={s.aktuell}><Flame size={13} />{s.aktuell} {s.aktuell === 1 ? 'Tag' : 'Tage'}</span>}
        </div>
      </header>

      <main className="pi-inhalt">
        {!geladen ? <Laedt /> : programm ? (
          <>
            {programm.art === 'lektion' && <LektionAblauf key={programm.tag} tag={programm.tag} onEnde={() => setProgramm(null)} onTest={() => { const t = tagesStand(useItaliano.getState().daten, heute()); setProgramm(t.heutigerTag && t.testStoff ? { art: 'test', tag: t.heutigerTag, stoff: t.testStoff } : null) }} />}
            {programm.art === 'test' && <TagestestAblauf key={programm.tag} tag={programm.tag} stoff={programm.stoff} onEnde={() => setProgramm(null)} />}
            {programm.art === 'esame' && <EsameAblauf key={programm.level} level={programm.level} onEnde={() => setProgramm(null)} onUeben={() => geh('training')} />}
          </>
        ) : (
          <Suspense fallback={<Laedt />}>
            {bereich === 'heute' && <Heute name={anzeigeName || benutzer} stand={stand} onProgramm={setProgramm} onBereich={geh} />}
            {bereich === 'reise' && <Reise onProgramm={setProgramm} />}
            {bereich === 'training' && <Training onSperre={setGesperrt} />}
            {bereich === 'tests' && <Tests onSperre={setGesperrt} gleichEinstufung={einstufung} onEinstufungAuf={() => setEinstufung(false)} />}
            {bereich === 'gruppe' && <Reisegruppe />}
            {bereich === 'fortschritt' && <Fortschritt onBereich={geh} />}
            {bereich === 'einstellungen' && <Einstellungen />}
          </Suspense>
        )}
      </main>

      {geladen && !(neu && !daten.gesehen.willkommen) && <AbzeichenFeier />}
      {geladen && neu && !daten.gesehen.willkommen && <Willkommen benutzer={benutzer} onEinstufung={() => { setEinstufung(true); setBereich('tests') }} />}
    </div>
  )
}

/** Ein frisch verdientes Abzeichen feiern — eines nach dem anderen. */
function AbzeichenFeier() {
  const neue = useItaliano(s => s.neueAbzeichen)
  const gesehen = useItaliano(s => s.abzeichenGesehen)
  const anzahl = useItaliano(s => Object.keys(s.daten.abzeichen).length)
  const a = neue.length ? abzeichenVon(neue[0]) : undefined
  useEffect(() => { if (neue.length && !a) gesehen() }, [neue, a, gesehen])
  if (!a) return null
  return (
    <div className="pi-schleier" role="dialog" aria-modal="true" aria-labelledby="pi-abzeichen-titel" data-pi-abzeichen-feier={a.id}>
      <div className="pi-karte pi-dialog pi-ein pi-spalte" style={{ alignItems: 'center', textAlign: 'center', position: 'relative', width: 'min(420px, 100%)' }} key={a.id}>
        <Konfetti />
        <div className="pi-ober" lang="it">Nuovo distintivo!</div>
        <span className="pi-abzeichen pi-abzeichen-gross pi-aufploppen" aria-hidden>{a.zeichen}</span>
        <h2 className="pi-h1 pi-it" lang="it" id="pi-abzeichen-titel">{a.name}</h2>
        <p>{a.text}</p>
        <p className="pi-klein pi-stumm">Abzeichen {anzahl} von {ABZEICHEN.length}{neue.length > 1 ? ` · gleich noch ${neue.length - 1} mehr` : ''}</p>
        <button type="button" className="pi-knopf pi-knopf-gross" onClick={gesehen} autoFocus data-pi-abzeichen-ok>Grazie!</button>
      </div>
    </div>
  )
}

/** Erste Begrüßung: worum es geht, was gespeichert wird, und ob man bei null beginnt. */
function Willkommen({ benutzer, onEinstufung }: { benutzer: string; onEinstufung: () => void }) {
  const merke = useItaliano(s => s.merkeGesehen)
  const setze = useItaliano(s => s.setzeEinstellung)
  const beginneBei = useItaliano(s => s.beginneBei)
  const verschluesselung = useItaliano(s => s.verschluesselung)
  const [ton, setTon] = useState(true)
  const [frueher, setFrueher] = useState<number | null>(null)
  // Hat der Benutzer an einem anderen PC schon ein Level erreicht? Dann dort weitermachen anbieten.
  useEffect(() => { void ladeEigenen(benutzer).then(e => { if (e && e.level > 1) setFrueher(Math.min(e.level, EINSTUFUNG_STUFEN[EINSTUFUNG_STUFEN.length - 1] + 3)) }) }, [benutzer])
  const los = (wie: 'neu' | 'einstufung' | 'frueher') => {
    setze('ton', ton)
    if (wie === 'frueher' && frueher) beginneBei(frueher)
    merke('willkommen')
    if (wie === 'einstufung') onEinstufung()
  }
  return (
    <div className="pi-schleier" role="dialog" aria-modal="true" aria-labelledby="pi-willkommen" data-pi-willkommen>
      <div className="pi-karte pi-dialog pi-ein pi-spalte">
        <div><div className="pi-ober" lang="it">Benvenuto!</div><h2 className="pi-h1" id="pi-willkommen">Italienisch lernen in der Pause</h2></div>
        <p>Jeden Tag 15 Minuten: eine Lektion mit neuen Wörtern, etwas Grammatik und einer Folge der Geschichte – danach ein kurzer Test. Nach fünf Lerntagen kommt die Prüfung, und wer besteht, reist eine Station weiter: von Turin bis Cagliari.</p>
        <ul className="pi-liste pi-leise">
          <li><b style={{ color: 'var(--pi-ink)' }}>Dein Level sehen alle</b> in der Reisegruppe.</li>
          <li>Ergebnisse, Fehler und Lernstand siehst <b style={{ color: 'var(--pi-ink)' }}>nur du</b>. {verschluesselung ? 'Sie liegen nur auf diesem PC, verschlüsselt mit deinem Windows-Konto.' : 'Auf diesem PC kann nicht verschlüsselt gespeichert werden – der Lernstand gilt deshalb nur für diese Sitzung.'}</li>
        </ul>
        <label className="pi-karte-flach pi-reihe" style={{ cursor: 'pointer', flexWrap: 'nowrap' }}>
          <input type="checkbox" checked={ton} onChange={e => setTon(e.target.checked)} data-pi-ton-wahl />
          <span><b>Mit Ton lernen</b><span className="pi-leise pi-klein" style={{ display: 'block' }}>Wörter und Dialoge zum Anhören – am besten mit Kopfhörer. Jederzeit änderbar.</span></span>
        </label>
        <div className="pi-reihe" style={{ justifyContent: 'flex-end' }}>
          {frueher && <button type="button" className="pi-knopf pi-knopf-leise" onClick={() => los('frueher')} data-pi-frueher>Bei Level {frueher} weitermachen</button>}
          <button type="button" className="pi-knopf pi-knopf-leise" onClick={() => los('einstufung')} data-pi-einstufung>Ich kann schon etwas</button>
          <button type="button" className="pi-knopf pi-knopf-gross" onClick={() => los('neu')} autoFocus data-pi-neu>Von vorn beginnen</button>
        </div>
      </div>
    </div>
  )
}
