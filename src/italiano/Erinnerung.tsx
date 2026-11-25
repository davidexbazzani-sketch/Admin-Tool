// Parla Italiano — tägliche Erinnerung: ein kleiner Hinweis unten rechts, wenn die Lektion von heute noch offen ist.
//  • nur für Benutzer, die den Kurs begonnen haben, und nur, wenn sie es nicht abgeschaltet haben (Einstellungen im Kurs)
//  • höchstens einmal am Tag, frühestens ab der eingestellten Uhrzeit, nie während man im Kurs ist
//  • wird erst eine Weile nach dem Start des Tools nachgeladen (App.tsx) — der Start wird dadurch nicht langsamer
//  • betrifft nur den eigenen Benutzer auf diesem PC (kein Scan, nichts im Netz) → fällt nicht unter die Automatik-PC-Regel
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useAppStore } from '../store/appStore'
import { useMenuSichtbar } from '../store/menuSichtbarStore'
import { ladeKurzStand, type KurzStand } from './kurzStand'

const PRUEFEN_ALLE_MS = 5 * 60_000
const heuteText = (): string => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }
const schluessel = (benutzer: string): string => `pi_erinnert_${benutzer.toLowerCase()}`

export default function ItalienischErinnerung() {
  const benutzer = useAuthStore(s => s.session?.user.username ?? '')
  const screen = useAppStore(s => s.screen)
  const setScreen = useAppStore(s => s.setScreen)
  // ist der Kurs für diesen Benutzer ausgeblendet (Menü-Sichtbarkeit), gibt es auch keine Erinnerung daran
  const ausgeblendet = useMenuSichtbar(s => s.sichtbar?.['parla-italiano'] === false)
  const [stand, setStand] = useState<KurzStand | null>(null)
  const [zeigen, setZeigen] = useState(false)

  useEffect(() => {
    if (!benutzer) return
    let lebt = true
    let takt: ReturnType<typeof setInterval> | undefined
    const pruefe = async () => {
      // heute schon erinnert oder weggeklickt? (nur dieser Merker liegt unverschlüsselt vor — er sagt nichts über den Lernstand)
      try { if (localStorage.getItem(schluessel(benutzer)) === heuteText()) return } catch { /* egal */ }
      const s = await ladeKurzStand(benutzer).catch(() => null)
      // wer den Kurs nicht begonnen oder die Erinnerung abgeschaltet hat, wird in dieser Sitzung nicht weiter geprüft
      if (s && (!s.begonnen || !s.erinnerung)) { if (takt) clearInterval(takt); return }
      if (!lebt || !s || !s.offen) return
      const [std, min] = s.erinnerungUm.split(':').map(Number)
      const jetzt = new Date()
      if (jetzt.getHours() * 60 + jetzt.getMinutes() < (std || 0) * 60 + (min || 0)) return
      setStand(s); setZeigen(true)
    }
    takt = setInterval(() => { void pruefe() }, PRUEFEN_ALLE_MS)
    void pruefe()
    return () => { lebt = false; if (takt) clearInterval(takt) }
  }, [benutzer])

  const erledigt = () => { try { localStorage.setItem(schluessel(benutzer), heuteText()) } catch { /* egal */ } setZeigen(false) }
  // wer den Kurs selbst öffnet, braucht heute keine Erinnerung mehr
  useEffect(() => { if (screen === 'parla-italiano' && zeigen) erledigt() })   // eslint-disable-line react-hooks/exhaustive-deps

  if (!zeigen || !stand || ausgeblendet || screen === 'parla-italiano') return null
  return (
    <div role="status" data-pi-erinnerung className="fixed bottom-5 right-5 z-40 w-[340px] rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
      <div className="flex h-1"><i className="flex-1" style={{ background: '#2E8B57' }} /><i className="flex-1" style={{ background: '#F5F0E6' }} /><i className="flex-1" style={{ background: '#D1432F' }} /></div>
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div className="text-sm font-bold text-foreground" style={{ fontFamily: "Georgia, Cambria, 'Times New Roman', serif" }}>Parla Italiano · {stand.ort}</div>
            <div className="text-sm text-foreground mt-1">{stand.text}{stand.dauer ? ` – ${stand.dauer}.` : '.'}</div>
            <div className="text-xs text-muted-foreground mt-1" data-pi-erinnerung-serie={stand.serie}>{stand.serie > 0
              ? `Deine Serie: ${stand.serie} ${stand.serie === 1 ? 'Tag' : 'Tage'} in Folge. Heute nicht abreißen lassen!`
              : 'Heute kann eine neue Serie beginnen.'}</div>
          </div>
          <button type="button" onClick={erledigt} className="text-muted-foreground hover:text-foreground p-1 -m-1" aria-label="Schließen" title="Heute nicht mehr erinnern" data-pi-erinnerung-zu><X size={16} /></button>
        </div>
        <div className="flex items-center justify-end gap-2 mt-1">
          <button type="button" onClick={erledigt} className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-accent">Heute nicht</button>
          <button type="button" onClick={() => { erledigt(); setScreen('parla-italiano') }} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90" data-pi-erinnerung-los>Jetzt lernen</button>
        </div>
        <div className="text-[10px] text-muted-foreground">Abschalten: Parla Italiano → Einstellungen.</div>
      </div>
    </div>
  )
}
