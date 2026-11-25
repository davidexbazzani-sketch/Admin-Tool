// Der Coach — Knopf „Bruno spricht es vor“ (Stufe 4). Fehlt die Datei, verschwindet der Knopf still.
import { useEffect, useState } from 'react'
import { Square, Volume2 } from 'lucide-react'
import { spieleBruno, stoppeBruno } from '../ton/bruno'

export function BrunoTon({ datei, text = 'Bruno spricht es vor' }: { datei: string; text?: string }) {
  const [spielt, setSpielt] = useState(false)
  const [kaputt, setKaputt] = useState(false)
  useEffect(() => () => stoppeBruno(), [])
  if (kaputt) return null
  return spielt
    ? <button type="button" className="dc-knopf dc-knopf-leise" onClick={() => { stoppeBruno(); setSpielt(false) }} data-dc-bruno-ton="stopp"><Square size={14} />Stopp</button>
    : <button type="button" className="dc-knopf dc-knopf-leise" onClick={() => {
      setSpielt(true)
      const start = Date.now()
      spieleBruno(datei, () => { setSpielt(false); if (Date.now() - start < 150) setKaputt(true) })
    }} data-dc-bruno-ton={datei}><Volume2 size={15} />{text}</button>
}
