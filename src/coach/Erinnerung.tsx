// Der Coach — Erinnerung ans Training: eine kleine Karte unten rechts im Tool.
//  • höchstens einmal am Tag, erst ab der eingestellten Uhrzeit, nur an Trainingstagen, nie im Raum selbst
//  • nie gleichzeitig mit der Karte eines anderen Raums (Parla Italiano) – dann wartet sie auf die nächste Prüfung
//  • Diskret-Modus (Vorgabe an): zugeklappt nur „Bruno hat etwas für dich“; Windows-Hinweis (falls an) immer neutral
//  • wird erst eine Weile nach dem Start des Tools nachgeladen (App.tsx); betrifft nur den eigenen Benutzer auf diesem PC
//  • Merker in localStorage enthalten nie Inhalte, nur das Datum
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import './erinnerung.css'
import { host } from './host/aktiv'
import { ladeCoachKurz, type CoachKurz } from './kurzStand'

const PRUEFEN_ALLE_MS = 5 * 60_000
const heuteText = (): string => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }
const schluessel = (b: string): string => `dc_erinnert_${b.toLowerCase()}`

export default function CoachErinnerung() {
  const [stand, setStand] = useState<CoachKurz | null>(null)
  const [zeigen, setZeigen] = useState(false)
  const [auf, setAuf] = useState(false)
  const [offen, setOffen] = useState(host().raumOffen())
  useEffect(() => host().beobachte(() => setOffen(host().raumOffen())), [])
  useEffect(() => {
    let lebt = true
    let takt: ReturnType<typeof setInterval> | undefined
    const pruefe = async () => {
      const b = host().benutzer()
      if (!b) return
      try { if (localStorage.getItem(schluessel(b)) === heuteText()) return } catch { /* egal */ }
      if (host().raumOffen() || host().andereKarteSichtbar()) return
      const s = await ladeCoachKurz().catch(() => null)
      if (s && (!s.darf || !s.begonnen || !s.erinnerung.an)) { if (takt) clearInterval(takt); return }
      if (!lebt || !s || s.heuteFertig || !s.trainingstag || !s.zeit) return
      setStand(s); setZeigen(true); setAuf(!s.diskret)
      if (s.erinnerung.windows) host().benachrichtige('Der Coach', 'Der Coach hat etwas für dich.')
    }
    takt = setInterval(() => { void pruefe() }, PRUEFEN_ALLE_MS)
    void pruefe()
    return () => { lebt = false; if (takt) clearInterval(takt) }
  }, [])
  const erledigt = () => { try { localStorage.setItem(schluessel(host().benutzer()), heuteText()) } catch { /* egal */ } setZeigen(false) }
  useEffect(() => { if (offen && zeigen) erledigt() })   // eslint-disable-line react-hooks/exhaustive-deps
  if (!zeigen || !stand || offen) return null
  return (
    <div role="status" className="dc-karte-aussen" data-dc-erinnerung>
      <div className="dc-ea-band" />
      <div className="dc-ea-innen">
        <div className="dc-ea-kopf">
          <b className="dc-ea-titel">Der Coach</b>
          <button type="button" onClick={erledigt} className="dc-ea-zu" aria-label="Heute nicht mehr erinnern" title="Heute nicht mehr erinnern" data-dc-erinnerung-zu><X size={16} /></button>
        </div>
        {!auf ? <button type="button" className="dc-ea-link" onClick={() => setAuf(true)} data-dc-erinnerung-auf>Bruno hat etwas für dich.</button>
          : <div className="dc-ea-text">Dein Training wartet – zehn Minuten genügen.{stand.serie > 0 && ` Deine Serie: ${stand.serie} ${stand.serie === 1 ? 'Tag' : 'Tage'}.`}</div>}
        <div className="dc-ea-knoepfe">
          <button type="button" className="dc-ea-leise" onClick={erledigt}>Heute nicht</button>
          <button type="button" className="dc-ea-los" onClick={() => { erledigt(); host().oeffne('der-coach') }} data-dc-erinnerung-los>Zum Training</button>
        </div>
        <div className="dc-ea-fuss">Abschalten: Der Coach → Einstellungen.</div>
      </div>
    </div>
  )
}
