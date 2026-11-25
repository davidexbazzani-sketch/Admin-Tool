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
import { useCoach } from './kern/speicher'
import { ladeLeben } from './kern/inhalt'
import { aufErinnerung, erinnerungGezeigt, sollFragen, waehleErinnerung, type Antwort, type VorhabenErinnerung } from './kern/leben'
import { heute, tagNummer, uhrzeit } from './kern/zeit'

const jetztMin = (): number => { const [h, m] = uhrzeit().split(':').map(Number); return h * 60 + m }

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
  if (offen) return null
  if (!zeigen || !stand) return <VorhabenKarte />
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

/**
 * Erinnerung an ein Vorhaben (Stufe 2). Regeln in kern/leben.ts (Obergrenze je Tag, Ruhezeiten, zwei Stunden Abstand,
 * Wochenziel erreicht → still). Erscheint nie im Raum, nie neben der Trainings- oder einer anderen Karte.
 * Diskret-Modus: zugeklappt nur „Bruno hat etwas für dich.“ Nach drei Mal Wegklicken fragt sie einmal: leiser, kleiner, streichen?
 */
function VorhabenKarte() {
  const [karte, setKarte] = useState<VorhabenErinnerung | null>(null)
  const [auf, setAuf] = useState(false)
  const [frage, setFrage] = useState(false)
  useEffect(() => {
    let lebt = true
    const pruefe = async () => {
      if (karte || !host().benutzer() || host().raumOffen() || host().andereKarteSichtbar() || document.querySelector('[data-dc-erinnerung]')) return
      if (!host().darfSehen()) return
      const b = host().benutzer()
      if (!useCoach.getState().geladen || useCoach.getState().benutzer.toLowerCase() !== b.toLowerCase()) await useCoach.getState().lade(b).catch(() => undefined)
      const st = useCoach.getState()
      if (!lebt || !st.geladen || st.benutzer.toLowerCase() !== b.toLowerCase() || !st.daten.eingestiegen) return
      const d = st.daten
      if (!d.vorhaben.some(v => v.an) || !d.profil.erinnerung.an) return
      const leben = await ladeLeben().catch(() => null)
      if (!lebt || !leben) return
      const tag = heute(), min = jetztMin()
      const w = waehleErinnerung(d, leben, tag, min, d.profil.name ?? '')
      if (!w) return
      useCoach.getState().aendere(x => erinnerungGezeigt(x, w.vorhaben.id, w.art, tag, min))
      void useCoach.getState().sichere()
      setKarte(w); setAuf(!d.profil.diskret); setFrage(sollFragen(w.vorhaben))
    }
    const takt = setInterval(() => { void pruefe() }, PRUEFEN_ALLE_MS)
    const erst = setTimeout(() => { void pruefe() }, 20_000)
    return () => { lebt = false; clearInterval(takt); clearTimeout(erst) }
  }, [karte])
  if (!karte) return null
  const antworte = (a: Antwort) => {
    useCoach.getState().aendere(d => aufErinnerung(d, karte.vorhaben.id, a, heute(), jetztMin()))
    void useCoach.getState().sichere(); setKarte(null)
  }
  const aendere = (wie: 'leiser' | 'kleiner' | 'streichen') => {
    const tag = tagNummer(heute())
    useCoach.getState().aendere(d => ({ ...d, vorhaben: d.vorhaben.map(v => (v.id !== karte.vorhaben.id ? v
      : wie === 'leiser' ? { ...v, schaerfe: 'sanft' as const, weg: 0, gefragt: tag }
        : wie === 'kleiner' ? { ...v, proWoche: Math.max(1, v.proWoche - 1), weg: 0, gefragt: tag }
          : { ...v, an: false, weg: 0, gefragt: tag })) }))
    void useCoach.getState().sichere(); setKarte(null)
  }
  return (
    <div role="status" className="dc-karte-aussen" data-dc-erinnerung-vorhaben>
      <div className="dc-ea-band" />
      <div className="dc-ea-innen">
        <div className="dc-ea-kopf">
          <b className="dc-ea-titel">Der Coach</b>
          <button type="button" onClick={() => antworte('weg')} className="dc-ea-zu" aria-label="Schließen" title="Schließen" data-dc-vh-weg><X size={16} /></button>
        </div>
        {!auf ? <button type="button" className="dc-ea-link" onClick={() => setAuf(true)}>Bruno hat etwas für dich.</button>
          : frage ? <div className="dc-ea-text">Ich habe dich jetzt ein paar Mal erinnert und du hast weggeklickt. Soll ich leiser werden, das Ziel kleiner machen – oder pausieren wir es?</div>
            : <div className="dc-ea-text" data-dc-vh-text>{karte.text}</div>}
        {auf && frage ? (
          <div className="dc-ea-knoepfe">
            <button type="button" className="dc-ea-leise" onClick={() => aendere('leiser')}>Leiser</button>
            <button type="button" className="dc-ea-leise" onClick={() => aendere('kleiner')}>Kleiner</button>
            <button type="button" className="dc-ea-leise" onClick={() => aendere('streichen')}>Pausieren</button>
            <button type="button" className="dc-ea-los" onClick={() => setFrage(false)}>Passt so</button>
          </div>
        ) : (
          <div className="dc-ea-knoepfe">
            <button type="button" className="dc-ea-leise" onClick={() => antworte('heuteNicht')} data-dc-vh-heutenicht>Heute nicht</button>
            <button type="button" className="dc-ea-leise" onClick={() => antworte('spaeter')}>Später</button>
            {karte.sprung && host().kannOeffnen(karte.sprung) && <button type="button" className="dc-ea-leise" onClick={() => { antworte('spaeter'); host().oeffne(karte.sprung!) }}>Los geht's</button>}
            <button type="button" className="dc-ea-los" onClick={() => antworte('gemacht')} data-dc-vh-gemacht>Gemacht</button>
          </div>
        )}
        <div className="dc-ea-fuss">Vorhaben und Erinnerungen: Der Coach → Vorhaben.</div>
      </div>
    </div>
  )
}
