// Der Coach — Wurzel des Raums im Pausenraum (seit 25.11.2026). Wird erst beim Öffnen geladen (lazy in App.tsx);
// Inhalte kommen einzeln nach, wenn sie gebraucht werden. Bauplan: src/coach/LIESMICH.md.
import { useEffect, useState } from 'react'
import { ArrowLeft, Compass, CalendarCheck, Dumbbell, LifeBuoy, Lock, Map as KarteSymbol, Settings, UserRound } from 'lucide-react'
import './coach.css'
import { setzeHost, host } from './host/aktiv'
import { adminToolHost } from './host/adminTool'
import type { BereichId } from './kern/inhaltTypen'
import type { InhaltsIndex } from './kern/index'
import type { Block, TagesPlan } from './kern/typen'
import { ladeIndex } from './kern/inhalt'
import { merkeInhaltsstand, useCoach } from './kern/speicher'
import { pflegeStaffel } from './kern/kurs'
import { heute, tagNummer } from './kern/zeit'
import { gibTonFrei } from './ton/aufnahme'
import { Laedt } from './ansicht/hilfen'
import { Einstieg } from './bereiche/Einstieg'
import { Heute } from './bereiche/Heute'
import { Halle } from './bereiche/Halle'
import { Bereichsseite } from './bereiche/Bereichsseite'
import { Reise } from './bereiche/Reise'
import { Ecke } from './bereiche/Ecke'
import { Einstellungen } from './bereiche/Einstellungen'
import { Notfallkoffer } from './bereiche/Notfallkoffer'
import { Paket } from './ablauf/Paket'

setzeHost(adminToolHost)

type Ansicht = 'heute' | 'reise' | 'halle' | 'ecke' | 'einstellungen' | 'notfall'
const NAV: { id: Ansicht; name: string; S: typeof Compass }[] = [
  { id: 'heute', name: 'Heute', S: CalendarCheck },
  { id: 'reise', name: 'Reise', S: KarteSymbol },
  { id: 'halle', name: 'Halle', S: Dumbbell },
  { id: 'ecke', name: 'Ecke', S: UserRound },
  { id: 'einstellungen', name: 'Einstellungen', S: Settings },
]

function useBenutzer(): string {
  const [b, setB] = useState(host().benutzer())
  useEffect(() => host().beobachte(() => setB(host().benutzer())), [])
  return b
}

export default function DerCoach() {
  const benutzer = useBenutzer()
  const [index, setIndex] = useState<InhaltsIndex | null>(null)
  const geladen = useCoach(s => s.geladen && s.benutzer.toLowerCase() === benutzer.toLowerCase())
  const eingestiegen = useCoach(s => s.daten.eingestiegen)
  const zustand = useCoach(s => s.zustand)
  const beiseite = useCoach(s => s.beiseite)
  const bewegung = useCoach(s => s.daten.profil.bewegung)
  const ohneZeitdruck = useCoach(s => s.daten.profil.ohneZeitdruck)
  const [ansicht, setAnsicht] = useState<Ansicht>('heute')
  const [bereich, setBereich] = useState<BereichId | null>(null)
  const [notfall, setNotfall] = useState<string | undefined>(undefined)
  const [lauf, setLauf] = useState<{ bloecke: Block[]; imPlan: boolean; laut: boolean } | null>(null)

  useEffect(() => {
    if (!benutzer) return
    let lebt = true
    void (async () => {
      const i = await ladeIndex()
      merkeInhaltsstand(i.iv)
      await useCoach.getState().lade(benutzer)
      if (!lebt) return
      // Staffel an den heutigen Inhalt anpassen (neue Bereiche, neue Spuren) – geschrieben wird nur bei Änderung
      const d = useCoach.getState().daten
      if (d.eingestiegen) {
        const kurse = pflegeStaffel(d, i, tagNummer(heute()))
        if (JSON.stringify(kurse) !== JSON.stringify(d.kurse)) useCoach.getState().aendere(x => ({ ...x, kurse }))
      }
      setIndex(i)
    })()
    return () => { lebt = false }
  }, [benutzer])
  // beim Verlassen sofort schreiben und den Tonweg freigeben
  useEffect(() => () => { void useCoach.getState().sichere(); gibTonFrei() }, [])

  if (!benutzer) return <div className="dc-app"><div className="dc-inhalt dc-leise">Bitte zuerst anmelden.</div></div>
  if (!host().darfSehen()) return <div className="dc-app"><div className="dc-inhalt dc-leise">Der Coach ist für dich noch nicht freigegeben.</div></div>

  const geh = (a: Ansicht) => { setLauf(null); setBereich(null); setNotfall(undefined); setAnsicht(a) }
  const starte = (p: TagesPlan) => setLauf({ bloecke: p.bloecke, imPlan: true, laut: p.laut })
  const uebe = (bloecke: Block[]) => setLauf({ bloecke, imPlan: false, laut: useCoach.getState().daten.profil.lautUeben })

  return (
    <div className="dc-app" data-dc-app data-ruhig={bewegung ? undefined : '1'}>
      <nav className="dc-nav" aria-label="Der Coach">
        <div className="dc-marke"><i aria-hidden />Der Coach</div>
        {NAV.map(n => <button key={n.id} type="button" aria-current={ansicht === n.id && !lauf && !bereich ? 'page' : undefined} disabled={!eingestiegen || !index} onClick={() => geh(n.id)} data-dc-nav={n.id}><n.S size={16} />{n.name}</button>)}
        <button type="button" className="dc-notfall" aria-current={ansicht === 'notfall' && !lauf ? 'page' : undefined} disabled={!index} onClick={() => geh('notfall')} data-dc-nav="notfall"><LifeBuoy size={16} />Notfallkoffer</button>
        <div className="dc-nav-unten dc-spalte" style={{ gap: 6 }}>
          {zustand === 'ohneVerschluesselung' && <span className="dc-chip" title="Auf diesem PC kann nicht verschlüsselt gespeichert werden – der Stand gilt nur für diese Sitzung."><Lock size={12} />nur diese Sitzung</span>}
          {zustand === 'nurLesen' && <span className="dc-chip dc-chip-rot" title="Dein Stand stammt aus einer neueren Fassung des Tools. Hier wird nichts gespeichert.">nur lesen</span>}
          <button type="button" onClick={() => { void useCoach.getState().sichere(); host().oeffne('pausenraum') }} data-dc-pausenraum><ArrowLeft size={16} />Pausenraum</button>
        </div>
      </nav>
      <main className="dc-inhalt">
        {beiseite && <div className="dc-rueck" style={{ marginBottom: 12 }}>{beiseite}</div>}
        {!geladen || !index ? <Laedt />
          : !eingestiegen ? <Einstieg index={index} onFertig={() => setAnsicht('heute')} />
            : lauf ? <Paket bloecke={lauf.bloecke} laut={lauf.laut} ohneUhr={ohneZeitdruck} imPlan={lauf.imPlan} onEnde={() => setLauf(null)} />
              : bereich ? <Bereichsseite index={index} bereich={bereich} onZurueck={() => setBereich(null)} onUeben={uebe} />
                : ansicht === 'heute' ? <Heute index={index} onStart={starte} onNotfall={id => { setNotfall(id); setAnsicht('notfall') }} />
                  : ansicht === 'halle' ? <Halle index={index} onBereich={setBereich} />
                    : ansicht === 'reise' ? <Reise index={index} />
                      : ansicht === 'ecke' ? <Ecke index={index} />
                        : ansicht === 'einstellungen' ? <Einstellungen index={index} />
                          : <Notfallkoffer start={notfall} onZurueck={() => geh('heute')} />}
      </main>
    </div>
  )
}
