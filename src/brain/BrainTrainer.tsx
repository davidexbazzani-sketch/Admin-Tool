// Brain Trainer — eigenständiger Bereich im Pausenraum (seit 17.11.2026).
// Hat mit den IT-Funktionen des Tools nichts zu tun: eigenes Logo, eigene Farben, eigene Navigation.
// Wird erst beim Öffnen geladen (lazy), jede Übungsfamilie als eigenes Teilpaket.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BarChart3, BrainCircuit, CalendarCheck, Dumbbell, Flame, Lock, Settings, Swords } from 'lucide-react'
import './brain.css'
import { useAuthStore } from '../store/authStore'
import { useAppStore } from '../store/appStore'
import { useDuellStore } from '../store/duellStore'
import type { KatalogEintrag } from './kern/typen'
import { useBrain } from './kern/speicher'
import { serie } from './kern/fortschritt'
import { brainIndex, profil } from './kern/wertung'
import { BrainLogo } from './Symbole'
import Training from './bereiche/Training'
import UebungSpielen from './ablauf/UebungSpielen'

const Heute = lazy(() => import('./bereiche/Heute'))
const Fortschritt = lazy(() => import('./fortschritt/Fortschritt'))
const IqBereich = lazy(() => import('./iq/IqBereich'))
const DuellBereich = lazy(() => import('./duell/DuellBereich'))
const Einstellungen = lazy(() => import('./bereiche/Einstellungen'))

export type Bereich = 'heute' | 'training' | 'iq' | 'duelle' | 'fortschritt' | 'einstellungen'

const NAV: { id: Bereich; name: string; Symbol: typeof Flame }[] = [
  { id: 'heute', name: 'Heute', Symbol: CalendarCheck },
  { id: 'training', name: 'Training', Symbol: Dumbbell },
  { id: 'iq', name: 'IQ-Test', Symbol: BrainCircuit },
  { id: 'duelle', name: 'Duelle', Symbol: Swords },
  { id: 'fortschritt', name: 'Fortschritt', Symbol: BarChart3 },
  { id: 'einstellungen', name: 'Einstellungen', Symbol: Settings },
]

const Laedt = () => <div className="bt-leise" style={{ padding: 40, textAlign: 'center' }}>Lädt …</div>

export default function BrainTrainer({ startBereich }: { startBereich?: Bereich }) {
  const benutzer = useAuthStore(s => s.session?.user.username ?? '')
  const anzeigeName = useAuthStore(s => s.session?.user.displayName ?? '')
  const setScreen = useAppStore(s => s.setScreen)
  const geladen = useBrain(s => s.geladen && s.benutzer.toLowerCase() === benutzer.toLowerCase())
  const lade = useBrain(s => s.lade)
  const sichere = useBrain(s => s.sichere)
  const zustimmung = useBrain(s => s.zustimmung)
  const daten = useBrain(s => s.daten)
  const [bereich, setBereich] = useState<Bereich>(startBereich ?? 'heute')
  const [spiel, setSpiel] = useState<KatalogEintrag | null>(null)
  /** läuft gerade etwas, das man nicht versehentlich verlassen soll (IQ-Test, Duell)? */
  const [gesperrt, setGesperrt] = useState(false)

  useEffect(() => { if (benutzer) void lade(benutzer) }, [benutzer, lade])
  // Ein Duell wurde im Chat gestartet oder angenommen → direkt zu den Duellen (DuellBereich öffnet es)
  const duellAnstehend = useDuellStore(s => s.anstehend)
  useEffect(() => { if (duellAnstehend) { setSpiel(null); setBereich('duelle') } }, [duellAnstehend])
  // beim Verlassen sofort schreiben (nicht auf den Zeitgeber warten)
  useEffect(() => () => { void sichere() }, [sichere])

  const s = useMemo(() => serie(daten.tage), [daten.tage])
  const index = useMemo(() => brainIndex(profil(daten)), [daten])

  if (!benutzer) return <div className="bt-app"><div className="bt-inhalt bt-leise">Bitte zuerst anmelden.</div></div>

  return (
    <div className="bt-app" data-bt-app>
      <header className="bt-kopf">
        <button type="button" className="bt-knopf bt-knopf-nackt" style={{ padding: 6, marginRight: -8 }} disabled={gesperrt} onClick={() => setScreen('games')} aria-label="Zurück zum Pausenraum" title="Zurück zum Pausenraum" data-bt-pausenraum><ArrowLeft size={16} /></button>
        <div className="bt-marke"><BrainLogo /><span>Brain <em>Trainer</em></span></div>
        <nav className="bt-nav" aria-label="Brain Trainer">
          {NAV.map(n => (
            <button key={n.id} type="button" aria-current={bereich === n.id && !spiel ? 'page' : undefined} disabled={gesperrt}
              onClick={() => { setSpiel(null); setBereich(n.id) }} data-bt-nav={n.id}>
              <n.Symbol size={15} />{n.name}
            </button>
          ))}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {zustimmung === false && <span className="bt-chip" title="Es wird nichts gespeichert — nach dem Schließen ist der Fortschritt weg. Änderbar unter Einstellungen."><Lock size={12} />nur diese Sitzung</span>}
          {index !== null && <span className="bt-chip bt-chip-akzent bt-zahl" title="Brain-Index: Mittel deiner Gebiete (0–1000)">Index {index}</span>}
          <span className={`bt-chip bt-zahl ${s.aktuell > 0 ? 'bt-chip-warm' : ''}`} title={s.heuteGeuebt ? 'Heute schon geübt' : 'Heute noch nicht geübt'} data-bt-serie>
            <Flame size={13} />{s.aktuell} {s.aktuell === 1 ? 'Tag' : 'Tage'}
          </span>
        </div>
      </header>

      <main className="bt-inhalt">
        {!geladen ? <Laedt /> : spiel ? (
          <UebungSpielen key={spiel.id} eintrag={spiel} quelle="training" onZurueck={() => setSpiel(null)} />
        ) : (
          <Suspense fallback={<Laedt />}>
            {bereich === 'heute' && <Heute name={anzeigeName || benutzer} onBereich={setBereich} onUebung={setSpiel} />}
            {bereich === 'training' && <Training onStart={setSpiel} />}
            {bereich === 'iq' && <IqBereich onSperre={setGesperrt} onUebung={u => { setBereich('training'); setSpiel(u) }} />}
            {bereich === 'duelle' && <DuellBereich onSperre={setGesperrt} />}
            {bereich === 'fortschritt' && <Fortschritt onBereich={setBereich} onUebung={setSpiel} />}
            {bereich === 'einstellungen' && <Einstellungen />}
          </Suspense>
        )}
      </main>

      {geladen && zustimmung === null && <ZustimmungDialog />}
    </div>
  )
}

/** Erste Frage beim Öffnen: Fortschritt speichern? (Vorgabe: nur wenn man möchte, nur für einen selbst sichtbar.) */
function ZustimmungDialog() {
  const setze = useBrain(s => s.setzeZustimmung)
  return (
    <div className="bt-schleier" role="dialog" aria-modal="true" aria-labelledby="bt-zustimmung-titel" data-bt-zustimmung>
      <div className="bt-karte bt-dialog bt-ein">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span className="bt-symbol"><Lock size={18} /></span>
          <h2 className="bt-h2" id="bt-zustimmung-titel">Soll dein Fortschritt gespeichert werden?</h2>
        </div>
        <ul className="bt-liste">
          <li><b>Nur du siehst deine Ergebnisse.</b> Kein Kollege, kein Administrator.</li>
          <li>Gespeichert wird <b>nur auf diesem PC</b>, verschlüsselt mit deinem Windows-Konto — nichts auf dem Netzlaufwerk.</li>
          <li>Du kannst das jederzeit ändern und alle Daten löschen (Einstellungen).</li>
        </ul>
        <p className="bt-klein bt-leise" style={{ margin: '12px 0 18px' }}>Ohne Speichern funktioniert alles genauso — Serie, Stufen und Verläufe sind dann nach dem Schließen wieder weg.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="bt-knopf bt-knopf-leise" onClick={() => void setze(false)} data-bt-zustimmung-nein>Nicht speichern</button>
          <button type="button" className="bt-knopf" onClick={() => void setze(true)} data-bt-zustimmung-ja>Ja, für mich speichern</button>
        </div>
      </div>
    </div>
  )
}
