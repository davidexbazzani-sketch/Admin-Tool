// Der Coach — ein Schritt, gleich welchen Formats: wählt den passenden Baustein.
import type { Schritt as S } from '../kern/inhaltTypen'
import type { BausteinProps } from './typen'
import { Fachhilfe, Karte, Mythos, Schaetzen, Studie, Vergleich, Weiter } from './Lesen'
import { Auswahl, Buendel } from './Wahl'
import { Fehler, Rangfolge, Zuordnen } from './Sortieren'
import { Bauplan, Blitz, Freitext, Reflexion } from './Freitext'
import { GespraechSpieler } from './Gespraech'
import { AnleitungSchritt, Atem, Lockern, Routine } from './Gefuehrt'
import { Klartext, Lautleiter, Nachsprechen, Sprechen, Stumm } from './Sprechen'
import { Experiment, Sammeln, Selbstbild, Wenndann, Zaehler } from './Plan'

export function Schritt(p: BausteinProps<S>) {
  const { s } = p
  switch (s.art) {
    case 'karte': return <Karte {...p} s={s} />
    case 'studie': return <Studie {...p} s={s} />
    case 'fachhilfe': return <Fachhilfe {...p} s={s} />
    case 'schaetzen': return <Schaetzen {...p} s={s} />
    case 'mythos': return <Mythos {...p} s={s} />
    case 'vergleich': return <Vergleich {...p} s={s} />
    case 'auswahl': case 'wortwahl': case 'kunstgriff': case 'tonfall': case 'szene': return <Auswahl {...p} s={s} />
    case 'buendel': return <Buendel {...p} s={s} />
    case 'zuordnen': return <Zuordnen {...p} s={s} />
    case 'rangfolge': return <Rangfolge {...p} s={s} />
    case 'fehler': return <Fehler {...p} s={s} />
    case 'konter': case 'umformulieren': case 'anschluss': case 'spiegeln': case 'jaund': case 'kern': case 'humorlabor': case 'kritiker': return <Freitext {...p} s={s} />
    case 'bauplan': return <Bauplan {...p} s={s} />
    case 'blitz': return <Blitz {...p} s={s} />
    case 'reflexion': return <Reflexion {...p} s={s} />
    case 'dialog': return <GespraechSpieler g={s.gespraech} onFertig={p.onFertig} />
    case 'atem': return <Atem {...p} s={s} />
    case 'lockern': return <Lockern {...p} s={s} />
    case 'anleitung': return <AnleitungSchritt {...p} s={s} />
    case 'routine': return <Routine {...p} s={s} />
    case 'stumm': return <Stumm {...p} s={s} />
    case 'nachsprechen': return <Nachsprechen {...p} s={s} />
    case 'klartext': return <Klartext {...p} s={s} />
    case 'lautleiter': return <Lautleiter {...p} s={s} />
    case 'sprechen': return <Sprechen {...p} s={s} />
    case 'wenndann': return <Wenndann {...p} s={s} />
    case 'selbstbild': return <Selbstbild {...p} s={s} />
    case 'sammeln': return <Sammeln {...p} s={s} />
    case 'zaehler': return <Zaehler {...p} s={s} />
    case 'experiment': return <Experiment {...p} s={s} />
    case 'mission': return <Weiter onClick={() => p.onFertig({})} />   // Missionen führt der Ablauf selbst (Mission.tsx)
  }
}
