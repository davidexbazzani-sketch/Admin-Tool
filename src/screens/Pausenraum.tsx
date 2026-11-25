// ── Sonstiges → „Pausenraum“: Auswahl der Räume als Kacheln ──────────────────────────────
// Räume: „4 gewinnt“, der „Brain Trainer“ (seit 18.11.2026), „Parla Italiano“ (Italienisch-Kurs) und
// „Terra Incognita“ (Entdecker-Spiel, seit 20.11.2026) und „Der Coach“ (Training für Wirkung, Mut und Antrieb, seit
// 25.11.2026 – oberste Kachel; bis zur Freigabe nur für den Gründer sichtbar).
// Muster wie „Client Geräte“: Unterpunkte stehen im menuCatalog (elternteil: 'games'),
// sichtbar sind nur die, die der Benutzer sehen darf. Alle Räume werden erst beim Öffnen geladen.

import { useEffect, useState } from 'react'
import { Gamepad2, ChevronRight, Grid3x3, Brain } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useAuthStore } from '../store/authStore'
import { useMenuSichtbar } from '../store/menuSichtbarStore'
import { kinderVon } from '../utils/menuCatalog'
import { api } from '../electronAPI'
import type { Screen } from '../types'

const INFO: Partial<Record<Screen, { icon: React.ReactNode; text: string; unter: string }>> = {
  'vier-gewinnt': { icon: <Grid3x3 size={26} />, text: 'Der Klassiker live gegen Kollegen — mit Lobby, Revanche und Coins.', unter: 'Zu zweit · eine Runde dauert wenige Minuten' },
  'brain-trainer': { icon: <Brain size={26} />, text: 'Gehirntraining mit über 40 Übungen, Tages-Training, IQ-Test, Fortschritt und schnellen Duellen. Deine Ergebnisse siehst nur du.', unter: 'Allein oder im Duell · ab 2 Minuten' },
}

/** Kachel „Parla Italiano“ mit Bild. Das eigene Level kommt aus dem kleinen öffentlichen Eintrag — der Kurs selbst wird hier nicht geladen. */
function ItalienischKachel({ label, onOeffnen }: { label: string; onOeffnen: () => void }) {
  const benutzer = useAuthStore(s => s.session?.user.username ?? '')
  const [level, setLevel] = useState<number | null>(null)
  const [bildFehlt, setBildFehlt] = useState(false)
  /** was heute dran ist — aus dem lokalen, verschlüsselten Lernstand; nur wenn der Kurs begonnen wurde */
  const [heute, setHeute] = useState<{ text: string; offen: boolean; serie: number } | null>(null)
  useEffect(() => {
    if (!benutzer) return
    let lebt = true
    void import('../italiano/kurzStand').then(m => m.ladeKurzStand(benutzer)).then(s => { if (lebt && s && s.begonnen) { setHeute({ text: s.text, offen: s.offen, serie: s.serie }); setLevel(s.level) } }).catch(() => { /* ohne Stand bleibt die Kachel schlicht */ })
    return () => { lebt = false }
  }, [benutzer])
  useEffect(() => {
    if (!benutzer) return
    let lebt = true
    const datei = `italiano/level/${benutzer.toLowerCase().replace(/[^a-z0-9._-]/g, '_')}.json`
    void api().netReadJsonAsync<{ level?: number }>(datei).then(e => { if (lebt && e && typeof e.level === 'number') setLevel(e.level) }).catch(() => { /* kein Eintrag */ })
    return () => { lebt = false }
  }, [benutzer])
  return (
    <button onClick={onOeffnen} data-raum="parla-italiano"
      className="group relative text-left rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors min-h-[200px] md:col-span-2 flex">
      {!bildFehlt && <img src="./italiano/bilder/kachel.webp" alt="" loading="lazy" decoding="async" onError={() => setBildFehlt(true)} className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'right 72%' }} />}
      <span className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(14,10,6,0.9) 0%, rgba(14,10,6,0.72) 38%, rgba(14,10,6,0.08) 72%)' }} />
      <span className="relative z-10 p-5 flex flex-col gap-2 max-w-[520px]" style={{ color: '#FFF6EA' }}>
        <span className="flex items-center gap-2">
          <span className="inline-flex w-[22px] h-[15px] rounded-[3px] overflow-hidden shrink-0" aria-hidden><i className="flex-1" style={{ background: '#2E8B57' }} /><i className="flex-1" style={{ background: '#F5F0E6' }} /><i className="flex-1" style={{ background: '#D1432F' }} /></span>
          <span className="text-lg font-bold" style={{ fontFamily: "Georgia, Cambria, 'Times New Roman', serif" }}>{label}</span>
          {level !== null && <span className="text-[11px] font-bold rounded-full px-2 py-0.5" style={{ background: 'rgba(234,123,75,0.9)', color: '#1F1008' }} data-raum-level={level}>{level > 24 ? 'Am Ziel' : `Dein Level: ${level}`}</span>}
          <ChevronRight size={18} className="opacity-70 group-hover:opacity-100 transition-opacity" />
        </span>
        <span className="text-xs" style={{ color: 'rgba(255,246,234,0.86)' }}>Italienisch lernen in der Pause: jeden Tag eine Lektion und ein kurzer Test, nach fünf Tagen die Prüfung – von Turin bis Cagliari, vom ersten «Ciao» bis zum kleinen Gespräch.</span>
        {heute
          ? <span className="text-xs font-semibold flex items-center gap-2 flex-wrap" data-raum-heute={heute.offen ? 'offen' : 'fertig'}>
              <span className="rounded-full px-2.5 py-1" style={{ background: heute.offen ? 'rgba(242,193,78,0.92)' : 'rgba(94,203,140,0.9)', color: '#1F1008' }}>{heute.offen ? heute.text : `${heute.text} ✓`}</span>
              {heute.serie > 0 && <span style={{ color: 'rgba(255,246,234,0.86)' }}>🔥 {heute.serie} {heute.serie === 1 ? 'Tag' : 'Tage'} in Folge</span>}
            </span>
          : <span className="text-[11px]" style={{ color: 'rgba(255,246,234,0.7)' }}>15 Minuten am Tag · 24 Level · mit Ton, Geschichte und Reisegruppe</span>}
      </span>
    </button>
  )
}

/** Kachel „Terra Incognita“ mit Bild. Der Stand kommt aus einem winzigen Zusatzpaket — das Spiel selbst wird hier nicht geladen. */
function TerraKachel({ label, onOeffnen }: { label: string; onOeffnen: () => void }) {
  const benutzer = useAuthStore(s => s.session?.user.username ?? '')
  const [stand, setStand] = useState<{ kapitaen: string; schiff: string; rang: string; funde: number; offen: number } | null>(null)
  const [bildFehlt, setBildFehlt] = useState(false)
  useEffect(() => {
    if (!benutzer) return
    let lebt = true
    void import('../terra/kurzStand').then(m => m.ladeTerraKurz(benutzer)).then(s => { if (lebt && s) setStand(s) }).catch(() => { /* ohne Stand bleibt die Kachel schlicht */ })
    return () => { lebt = false }
  }, [benutzer])
  return (
    <button onClick={onOeffnen} data-raum="terra-incognita"
      className="group relative text-left rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors min-h-[200px] md:col-span-2 flex">
      {!bildFehlt && <img src="./terra/bilder/kachel.webp" alt="" loading="lazy" decoding="async" onError={() => setBildFehlt(true)} className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'right 55%' }} />}
      <span className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(6,14,26,0.93) 0%, rgba(6,14,26,0.76) 40%, rgba(6,14,26,0.1) 76%)' }} />
      <span className="relative z-10 p-5 flex flex-col gap-2 max-w-[540px]" style={{ color: '#F3E3BC' }}>
        <span className="flex items-center gap-2">
          <span className="text-lg font-bold italic" style={{ fontFamily: "Georgia, Cambria, 'Times New Roman', serif", color: '#FFD27A' }}>{label}</span>
          {stand && <span className="text-[11px] font-bold rounded-full px-2 py-0.5" style={{ background: 'rgba(226,191,120,0.92)', color: '#1B1304' }} data-raum-rang>{stand.rang}</span>}
          <ChevronRight size={18} className="opacity-70 group-hover:opacity-100 transition-opacity" />
        </span>
        <span className="text-xs" style={{ color: 'rgba(243,227,188,0.88)' }}>Stich von Hamburg aus in See und entdecke ein Meer, das für alle Kollegen dasselbe ist. Wer eine Insel als Erster meldet, tauft sie – der Name steht dann auf allen Karten. Handeln, Schiff ausbauen, weiter hinaus.</span>
        {stand
          ? <span className="text-xs font-semibold flex items-center gap-2 flex-wrap" data-raum-stand>
              <span className="rounded-full px-2.5 py-1" style={{ background: 'rgba(18,38,62,0.9)', border: '1px solid rgba(226,191,120,0.5)' }}>Kpt. {stand.kapitaen} · {stand.schiff} · {stand.funde} {stand.funde === 1 ? 'Entdeckung' : 'Entdeckungen'}</span>
              {stand.offen > 0 && <span style={{ color: '#FFD27A' }}>{stand.offen} warten auf die Meldung im Hafen</span>}
            </span>
          : <span className="text-[11px]" style={{ color: 'rgba(243,227,188,0.72)' }}>Ruhig, Zug um Zug · allein oder mit den Kollegen · kein Zwang, keine Fristen</span>}
      </span>
    </button>
  )
}

/** Kachel „Der Coach“ (oberste Kachel). Der Stand kommt aus einem winzigen Zusatzpaket – der Raum selbst wird hier
 *  nicht geladen. Zeigt nie Bereiche oder Inhalte; im Diskret-Modus nur einen allgemeinen Satz. */
function CoachKachel({ label, onOeffnen }: { label: string; onOeffnen: () => void }) {
  const benutzer = useAuthStore(s => s.session?.user.username ?? '')
  const [stand, setStand] = useState<{ darf: boolean; begonnen: boolean; diskret: boolean; heuteFertig: boolean; serie: number; runde: number } | null>(null)
  const [bildFehlt, setBildFehlt] = useState(false)
  useEffect(() => {
    if (!benutzer) return
    let lebt = true
    void import('../coach/kurzStand').then(m => m.ladeCoachKurz()).then(s => { if (lebt) setStand(s) }).catch(() => { /* ohne Stand bleibt die Kachel schlicht */ })
    return () => { lebt = false }
  }, [benutzer])
  if (stand && !stand.darf) return null
  return (
    <button onClick={onOeffnen} data-raum="der-coach"
      className="group relative text-left rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors min-h-[210px] md:col-span-2 flex"
      style={{ background: 'linear-gradient(120deg, #141518 0%, #212328 55%, #2A2D33 100%)' }}>
      {!bildFehlt && <img src="./coach/bilder/kachel.webp" alt="" loading="lazy" decoding="async" onError={() => setBildFehlt(true)} className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'right 35%' }} />}
      <span className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(14,15,18,0.94) 0%, rgba(14,15,18,0.78) 42%, rgba(14,15,18,0.1) 78%)' }} />
      <span className="absolute left-0 right-0 top-0 h-[6px]" style={{ background: 'repeating-linear-gradient(-45deg, rgba(242,182,50,0.92) 0 10px, rgba(26,20,4,0.92) 10px 20px)' }} />
      <span className="relative z-10 p-5 pt-6 flex flex-col gap-2 max-w-[540px]" style={{ color: '#F2EFE8' }}>
        <span className="flex items-center gap-2">
          <i aria-hidden style={{ width: 6, height: 22, background: '#E8493D', display: 'inline-block', transform: 'skewX(-12deg)' }} />
          <span className="text-xl font-bold uppercase" style={{ fontFamily: "'Bahnschrift SemiBold Condensed', 'Bahnschrift Condensed', Bahnschrift, 'Segoe UI', sans-serif", letterSpacing: '0.04em' }}>{label}</span>
          <ChevronRight size={18} className="opacity-70 group-hover:opacity-100 transition-opacity" />
        </span>
        <span className="text-xs" style={{ color: 'rgba(242,239,232,0.86)' }}>Dein Trainingscamp für Wirkung, Mut und Antrieb: schlagfertig bleiben, ruhig werden, klar sprechen, überzeugen, Smalltalk, Selbstbewusstsein, Ziele – vierzehn Bereiche, du wählst. Jeder Tipp mit Beleg. Alles bleibt privat.</span>
        {stand?.begonnen
          ? <span className="text-xs font-semibold flex items-center gap-2 flex-wrap" data-raum-stand>
              <span className="rounded-full px-2.5 py-1" style={{ background: stand.heuteFertig ? 'rgba(92,201,138,0.9)' : 'rgba(242,182,50,0.92)', color: '#1A1404' }}>{stand.diskret ? (stand.heuteFertig ? 'Für heute geschafft ✓' : 'Bruno wartet in der Halle') : (stand.heuteFertig ? 'Training geschafft ✓' : 'Heute: Training offen')}</span>
              {!stand.diskret && stand.serie > 0 && <span style={{ color: 'rgba(242,239,232,0.86)' }}>Serie {stand.serie} · Runde {stand.runde}</span>}
            </span>
          : <span className="text-[11px]" style={{ color: 'rgba(242,239,232,0.72)' }}>10, 15 oder 30 Minuten am Tag · mit Coach Bruno · ohne Ranglisten</span>}
      </span>
    </button>
  )
}

export default function Pausenraum() {
  const setScreen = useAppStore(s => s.setScreen)
  const sichtbar = useMenuSichtbar(s => s.sichtbar)
  const raeume = kinderVon('games').filter(k => !sichtbar || sichtbar[k.id] !== false)

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-6" data-pausenraum>
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Gamepad2 size={24} /> Pausenraum</h1>
        <p className="text-sm text-muted-foreground mt-1">Kurz abschalten, den Kopf fit halten, Italienisch lernen oder in See stechen — Raum wählen. Herausfordern kannst du Kollegen auch direkt im Chat.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
        {raeume.map(r => {
          if (r.id === 'der-coach') return <CoachKachel key={r.id} label={r.label} onOeffnen={() => setScreen(r.id)} />
          if (r.id === 'parla-italiano') return <ItalienischKachel key={r.id} label={r.label} onOeffnen={() => setScreen(r.id)} />
          if (r.id === 'terra-incognita') return <TerraKachel key={r.id} label={r.label} onOeffnen={() => setScreen(r.id)} />
          const i = INFO[r.id]
          return (
            <button key={r.id} onClick={() => setScreen(r.id)} data-raum={r.id}
              className="group text-left rounded-xl border border-border bg-card p-5 hover:border-primary/50 hover:bg-accent/30 transition-colors flex flex-col gap-3 min-h-[160px]">
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">{i?.icon || <Gamepad2 size={26} />}</span>
                <span className="text-base font-semibold text-foreground">{r.label}</span>
                <ChevronRight size={18} className="ml-auto text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className="text-xs text-muted-foreground flex-1">{i?.text}</p>
              <p className="text-[11px] text-muted-foreground">{i?.unter}</p>
            </button>
          )
        })}
        {!raeume.length && <p className="text-sm text-muted-foreground">Für dich ist kein Raum freigegeben.</p>}
      </div>
    </div>
  )
}
