// Der Coach — eine Folge von Schritten ohne Einheit drumherum (Kompass-Stationen, Notfall-Abläufe).
// Jeder Schritt wird wie in einer Einheit verbucht (Buch, Kompass, Ernstfall …).
import { useState } from 'react'
import type { Schritt as S } from '../kern/inhaltTypen'
import { hatKopf } from '../kern/inhaltTypen'
import { Schritt } from '../uebungen/Schritt'
import { verbucheErgebnis } from './verbuchen'

export function Folge({ schritte, titel, ohneUhr, onFertig }: { schritte: S[]; titel: string; ohneUhr: boolean; onFertig: () => void }) {
  const [i, setI] = useState(0)
  const s = schritte[i]
  if (!s) return <div className="dc-lauf"><button type="button" className="dc-knopf" onClick={onFertig}>Weiter</button></div>
  return (
    <div className="dc-lauf dc-ein" data-dc-folge={titel}>
      <div className="dc-reihe" style={{ justifyContent: 'space-between' }}><span className="dc-ober">{titel}</span><span className="dc-klein dc-stumm dc-zahl">{i + 1} / {schritte.length}</span></div>
      <div className="dc-fortschritt" aria-hidden><i style={{ width: `${((i + 1) / schritte.length) * 100}%` }} /></div>
      <div className="dc-karte" key={i}>
        <Schritt s={s} ohneUhr={ohneUhr} onFertig={r => { verbucheErgebnis(hatKopf(s) ? s.kopf : undefined, r); if (i + 1 >= schritte.length) onFertig(); else setI(i + 1) }} />
      </div>
    </div>
  )
}
