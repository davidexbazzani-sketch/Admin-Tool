// Terra Incognita — Entdecker-Spiel im Pausenraum (seit November 2026). Wird erst beim Öffnen der Kachel geladen.
//
// Solange dieser Raum offen ist: Netz-Schleuse auf, Abgleich mit der gemeinsamen Welt, Ton. Beim Verlassen wird
// alles geschlossen — danach läuft vom Spiel nichts mehr (keine Abfragen, keine Zeitgeber, kein Ton).
import { useEffect, useLayoutEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useAuthStore } from '../store/authStore'
import Einstieg from './ansicht/Einstieg'
import Spieltisch from './ansicht/Spieltisch'
import { Blatt } from './ansicht/teile'
import { neuereSicherung, spieleHierWeiter, starteGemeinsam, stoppeGemeinsam, useGemeinsam, type SicherungInfo } from './netz/gemeinsam'
import { oeffneNetz, schliesseNetz } from './netz/schleuse'
import { useTerra } from './speicher'
import { oeffneTon, schliesseTon } from './ton/klang'
import { tagText } from './zeit'
import './terra.css'

export default function TerraIncognita() {
  const user = useAuthStore(s => s.session?.user)
  const setScreen = useAppStore(s => s.setScreen)
  const zustand = useTerra(s => s.zustand)
  const benutzer = useTerra(s => s.benutzer)
  const speicherFehler = useTerra(s => s.speicherFehler)
  const standNr = useTerra(s => s.standNr)
  const lade = useTerra(s => s.lade)
  const legeBeiseite = useTerra(s => s.legeBeiseite)
  const uebernimm = useTerra(s => s.uebernimm)
  const verbunden = useGemeinsam(s => s.verbunden)
  const [sicherung, setSicherung] = useState<SicherungInfo | null>(null)

  useEffect(() => { if (user?.username) void lade(user.username, user.displayName || user.username) }, [user?.username, user?.displayName, lade])

  // (Die Schleuse öffnet schon im Layout-Effekt: Sie muss offen sein, BEVOR die Effekte des Spieltischs laufen —
  // Kinder-Effekte laufen vor denen der Eltern; ein offenes Duell wird dort beim Betreten gleich wieder angezeigt.
  // Geschlossen wird sie beim Verlassen unten, mit allem anderen.)
  useLayoutEffect(() => { oeffneNetz() }, [])
  useEffect(() => {
    oeffneNetz(); oeffneTon()
    const schreibe = (): void => { void useTerra.getState().sichere() }
    window.addEventListener('beforeunload', schreibe)
    return () => {
      window.removeEventListener('beforeunload', schreibe)
      stoppeGemeinsam(); schliesseNetz(); schliesseTon()
      void useTerra.getState().sichere()
    }
  }, [])
  // (standNr: Wechselt der Spielstand — neu begonnen, Sicherung übernommen —, gleicht die gemeinsame Welt sofort neu ab)
  useEffect(() => { if (zustand !== 'laedt' && benutzer) starteGemeinsam() }, [zustand, benutzer, standNr])
  // unlesbarer Stand: nachsehen, ob auf dem Netzlaufwerk eine Sicherung liegt
  useEffect(() => {
    if (zustand !== 'defekt' || !benutzer || !verbunden) return
    let lebt = true
    void neuereSicherung(benutzer, -1).then(s => { if (lebt) setSicherung(s) })
    return () => { lebt = false }
  }, [zustand, benutzer, verbunden])

  if (!user) return <div className="flex items-center justify-center h-full text-muted-foreground">Bitte anmelden.</div>
  return (
    <div className="ti-app" data-ti-app={zustand}>
      {zustand === 'bereit' ? <Spieltisch /> : (
        <>
          <div className="ti-kopf">
            <button type="button" className="ti-zurueck" onClick={() => setScreen('games')}><ArrowLeft size={14} />Pausenraum</button>
            <span className="ti-titel">Terra Incognita</span>
          </div>
          <div className="ti-buehne">
            {zustand === 'laedt' && <p className="ti-prosa" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ti-leise)' }}>Die Karten werden ausgerollt …</p>}
            {zustand === 'neu' && <Einstieg />}
            {zustand === 'neuer' && (
              <Blatt kennung="neuer" ueber="Zu neu für dieses Tool" titel="Dein Spielstand stammt aus einer neueren Version"
                fuss={<button type="button" className="ti-knopf ti-knopf-gold" onClick={() => setScreen('games')}>Zurück</button>}>
                <p className="ti-prosa">Auf diesem PC ist eine ältere Fassung des Tools installiert, als du zuletzt benutzt hast. Damit nichts verloren geht, wird der Spielstand hier nicht geöffnet. Nach der Aktualisierung des Tools geht es weiter.</p>
              </Blatt>
            )}
            {zustand === 'defekt' && (
              <Blatt kennung="defekt" ueber="Wasser im Logbuch" titel="Der Spielstand lässt sich nicht lesen"
                fuss={<>
                  <button type="button" className="ti-knopf ti-knopf-leise" onClick={() => setScreen('games')}>Zurück</button>
                  <button type="button" className="ti-knopf" onClick={() => void legeBeiseite()} data-ti-beiseite>Beiseitelegen und neu beginnen</button>
                  {sicherung && <button type="button" className="ti-knopf ti-knopf-gold" onClick={() => void sicherung.hole().then(d => (d ? uebernimm(d.stand, d.karte) : false)).then(ok => { if (ok) spieleHierWeiter() })} data-ti-sicherung-holen>Sicherung vom {tagText(sicherung.tag)} holen</button>}
                </>}>
                <p className="ti-prosa">Die Datei auf diesem PC ist beschädigt oder gehört zu einem anderen Windows-Konto. Sie wird nicht überschrieben, sondern aufgehoben.</p>
                {speicherFehler && <p className="ti-stumm" style={{ marginTop: 6 }}>{speicherFehler}</p>}
                <p style={{ marginTop: 8 }}>{sicherung ? 'Auf dem Netzlaufwerk liegt eine Sicherung, mit der du weitermachen kannst.' : verbunden ? 'Auf dem Netzlaufwerk liegt keine Sicherung.' : 'Das Netzlaufwerk ist nicht erreichbar – ob es eine Sicherung gibt, lässt sich gerade nicht sagen.'} „Beiseitelegen“ hebt die unlesbare Datei auf und beginnt ein neues Spiel.</p>
              </Blatt>
            )}
          </div>
        </>
      )}
    </div>
  )
}
