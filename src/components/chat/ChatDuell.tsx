// ── Chat: Kollegen zu einem Duell herausfordern (4 gewinnt oder Brain-Duell) ──────────────
// Wunsch des Nutzers (18.11.2026): Herausfordern geht direkt aus dem Chat — auch für 4 gewinnt.
// Die Herausforderung ist eine normale Chat-Nachricht mit dem Zusatzfeld `duell`; der Empfänger
// sieht darin „Annehmen / Ablehnen“. Es gibt KEINE zusätzliche Dauerabfrage: alles läuft über den
// vorhandenen Chat-Takt. Die Spiel-Logik (Brain Trainer) wird erst beim Klick nachgeladen.
import { useEffect, useRef, useState } from 'react'
import { Swords, Loader2, Check, X, Brain, Grid3x3 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useChatStore } from '../../store/chatStore'
import { useDuellStore } from '../../store/duellStore'
import { sende, type ChatDuell, type ChatIch, type ChatNachricht } from '../../services/chat'
import { acceptMatch, clearInvite, createMatch, getCoins, INVITE_TTL_MS, STAKE } from '../../services/gameLobby'

interface Disziplin { id: string; name: string }

/** Knopf im Kopf eines Gesprächs: öffnet die Auswahl „4 gewinnt“ / „Brain-Duell“. */
export function HerausfordernKnopf({ ich, partner, partnerName, online, onGesendet }: {
  ich: ChatIch; partner: string; partnerName: string; online: boolean; onGesendet: () => void
}) {
  const setScreen = useAppStore(s => s.setScreen)
  const setEingeklappt = useChatStore(s => s.setEingeklappt)
  const [offen, setOffen] = useState(false)
  const [disziplinen, setDisziplinen] = useState<Disziplin[] | null>(null)
  const [disziplin, setDisziplin] = useState('')
  const [dauer, setDauer] = useState(120)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState('')
  const kasten = useRef<HTMLDivElement>(null)

  // Disziplinen erst beim Öffnen laden (Katalog des Brain Trainers gehört nicht ins Hauptpaket)
  useEffect(() => {
    if (!offen || disziplinen) return
    let weg = false
    void import('../../brain/kern/katalog').then(m => {
      if (weg) return
      const l = m.KATALOG.filter(u => u.duell).map(u => ({ id: u.id, name: u.name }))
      setDisziplinen(l); setDisziplin(d => d || l[0]?.id || '')
    }).catch(() => { if (!weg) setDisziplinen([]) })
    return () => { weg = true }
  }, [offen, disziplinen])

  // Klick daneben schließt
  useEffect(() => {
    if (!offen) return
    const zu = (e: MouseEvent) => { if (kasten.current && !kasten.current.contains(e.target as Node)) setOffen(false) }
    document.addEventListener('mousedown', zu)
    return () => document.removeEventListener('mousedown', zu)
  }, [offen])

  const ziel = { username: partner, displayName: partnerName }

  async function vierGewinnt() {
    if (laeuft) return
    setLaeuft(true); setFehler('')
    try {
      if ((await getCoins(ich.username)) < STAKE) { setFehler(`Nicht genug Coins (mind. ${STAKE}).`); return }
      const m = await createMatch({ username: ich.username, displayName: ich.displayName }, ziel)
      const duell: ChatDuell = { art: 'vier-gewinnt', id: m.id, titel: `Einsatz ${STAKE} Coins`, gueltigBis: new Date(Date.now() + INVITE_TTL_MS).toISOString() }
      await sende(ich, ziel, `🎮 Ich fordere dich zu einer Runde 4 gewinnt heraus (Einsatz ${STAKE} Coins). Annehmen geht eine Minute lang.`, undefined, duell)
      onGesendet(); setOffen(false); setEingeklappt(true)
      setScreen('vier-gewinnt')
    } catch { setFehler('Hat nicht geklappt — Netzlaufwerk nicht erreichbar?') } finally { setLaeuft(false) }
  }

  async function brainDuell() {
    const d = disziplinen?.find(x => x.id === disziplin)
    if (laeuft || !d) return
    setLaeuft(true); setFehler('')
    try {
      const dienst = await import('../../brain/duell/duell')
      const meta = await dienst.fordereHeraus({ username: ich.username, displayName: ich.displayName }, ziel, d, dauer)
      if (!meta) { setFehler('Hat nicht geklappt — Netzlaufwerk nicht erreichbar?'); return }
      onGesendet(); setOffen(false); setEingeklappt(true)
      useDuellStore.getState().setze(meta.id)
      setScreen('brain-trainer')
    } catch { setFehler('Hat nicht geklappt.') } finally { setLaeuft(false) }
  }

  return (
    <div className="relative ml-auto" ref={kasten}>
      <button onClick={() => setOffen(o => !o)} disabled={!online} data-chat-herausfordern
        title={online ? `${partnerName} zu einem Duell herausfordern` : `${partnerName} ist gerade nicht im Tool — herausfordern geht nur, wenn beide da sind`}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold border border-border text-foreground hover:bg-accent/40 disabled:opacity-40 disabled:cursor-not-allowed">
        <Swords size={12} />Duell
      </button>
      {offen && (
        <div className="absolute right-0 top-full mt-1 z-10 w-[270px] rounded-lg border border-border bg-card shadow-2xl p-2.5 space-y-2.5" data-chat-duell-menue>
          <button onClick={() => void vierGewinnt()} disabled={laeuft} data-chat-duell-vier
            className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-left border border-border hover:bg-accent/30 disabled:opacity-50">
            <Grid3x3 size={15} className="text-primary shrink-0" />
            <span className="min-w-0"><span className="block text-xs font-semibold text-foreground">4 gewinnt</span><span className="block text-[10px] text-muted-foreground">Einsatz {STAKE} Coins</span></span>
          </button>
          <div className="rounded-md border border-border p-2.5 space-y-2">
            <p className="flex items-center gap-2 text-xs font-semibold text-foreground"><Brain size={15} className="text-primary" />Brain-Duell</p>
            {disziplinen === null ? <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 size={11} className="animate-spin" />lädt …</p> : (
              <>
                <select value={disziplin} onChange={e => setDisziplin(e.target.value)} data-chat-duell-disziplin className="w-full rounded-md bg-background border border-border text-xs px-2 py-1.5 text-foreground">
                  {disziplinen.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <div className="flex items-center gap-1.5">
                  {[60, 120, 180].map(s => (
                    <button key={s} onClick={() => setDauer(s)} className={`flex-1 rounded-md border px-2 py-1 text-[11px] ${dauer === s ? 'border-primary bg-primary/15 text-foreground font-semibold' : 'border-border text-muted-foreground hover:text-foreground'}`}>{s / 60} min</button>
                  ))}
                </div>
                <button onClick={() => void brainDuell()} disabled={laeuft || !disziplin} data-chat-duell-brain
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  {laeuft ? <Loader2 size={12} className="animate-spin" /> : <Swords size={12} />}Herausfordern
                </button>
              </>
            )}
          </div>
          {fehler && <p className="text-[11px] text-red-400">{fehler}</p>}
        </div>
      )}
    </div>
  )
}

/** In der Nachricht: die Herausforderung mit „Annehmen / Ablehnen“ (beim Empfänger) bzw. als Hinweis (beim Absender). */
export function DuellKarte({ n, meins, ich }: { n: ChatNachricht; meins: boolean; ich: ChatIch }) {
  // (Seegefecht: eigenes Feld — ältere Tools mit Duell-Karten sehen es so nur als Text)
  const d = (n.seegefecht ? { art: 'terra', id: n.seegefecht.id, titel: String(n.seegefecht.titel ?? ''), gueltigBis: n.seegefecht.gueltigBis } : n.duell) as ChatDuell
  const setScreen = useAppStore(s => s.setScreen)
  const setEingeklappt = useChatStore(s => s.setEingeklappt)
  const [stand, setStand] = useState<'' | 'laeuft' | 'angenommen' | 'abgelehnt'>('')
  const [grund, setGrund] = useState('')
  const [jetzt, setJetzt] = useState(Date.now())
  const abgelaufen = jetzt > new Date(d.gueltigBis).getTime()

  // Ablauf sichtbar machen, ohne dauernd zu rendern: genau EIN Zeitgeber bis zum Ablauf
  useEffect(() => {
    const rest = new Date(d.gueltigBis).getTime() - Date.now()
    if (rest <= 0) return
    const t = setTimeout(() => setJetzt(Date.now()), rest + 200)
    return () => clearTimeout(t)
  }, [d.gueltigBis])

  async function annehmen() {
    if (stand === 'laeuft') return
    setStand('laeuft'); setGrund('')
    try {
      if (d.art === 'terra') {
        // Seegefecht: Terra Incognita öffnen — dort wird mit dem eigenen Schiff endgültig angenommen
        useDuellStore.getState().setzeTerra({ id: d.id, bis: new Date(d.gueltigBis).getTime() })
        setStand('angenommen'); setEingeklappt(true); setScreen('terra-incognita')
        return
      }
      if (d.art === 'brain') {
        const dienst = await import('../../brain/duell/duell')
        const r = await dienst.nimmAn(d.id, ich.username)
        if (!r.ok) { setStand(''); setGrund(r.grund); return }
        useDuellStore.getState().setze(d.id)
        setStand('angenommen'); setEingeklappt(true); setScreen('brain-trainer')
      } else {
        if ((await getCoins(ich.username)) < STAKE) { setStand(''); setGrund(`Nicht genug Coins (mind. ${STAKE}).`); return }
        const m = await acceptMatch(d.id, ich.username)
        if (!m) { setStand(''); setGrund('Die Partie gibt es nicht mehr.'); return }
        setStand('angenommen'); setEingeklappt(true); setScreen('vier-gewinnt')
      }
    } catch { setStand(''); setGrund('Hat nicht geklappt — Netzlaufwerk nicht erreichbar?') }
  }
  async function ablehnen() {
    setStand('abgelehnt')
    try {
      if (d.art === 'terra') { const dienst = await import('../../terra/netz/duellAntwort'); await dienst.lehneAbAusChat(d.id, ich.username) }
      else if (d.art === 'brain') { const dienst = await import('../../brain/duell/duell'); await dienst.lehneAb(d.id, ich.username) }
      else await clearInvite(ich.username)
    } catch { /* egal — die Einladung läuft ohnehin ab */ }
  }

  return (
    <span className={`mt-1.5 block rounded-lg px-2 py-1.5 ${meins ? 'bg-black/15' : 'bg-background/60 border border-border'}`} data-chat-duell={d.art}>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold"><Swords size={12} className="shrink-0" />{d.art === 'brain' ? 'Brain-Duell' : d.art === 'terra' ? 'Seegefecht' : '4 gewinnt'}<span className="font-normal opacity-80 truncate">· {d.titel}</span></span>
      {meins ? (
        <span className="block text-[10px] opacity-75 mt-0.5">{abgelaufen ? 'Einladung abgelaufen' : 'Einladung gesendet — wartet auf Antwort'}</span>
      ) : stand === 'angenommen' ? <span className="flex items-center gap-1 text-[10px] mt-1"><Check size={11} />angenommen</span>
        : stand === 'abgelehnt' ? <span className="flex items-center gap-1 text-[10px] mt-1 opacity-75"><X size={11} />abgelehnt</span>
          : abgelaufen ? <span className="block text-[10px] opacity-75 mt-0.5">abgelaufen</span> : (
            <span className="flex items-center gap-1.5 mt-1.5">
              <button onClick={() => void annehmen()} disabled={stand === 'laeuft'} data-chat-duell-annehmen
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {stand === 'laeuft' ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}Annehmen
              </button>
              <button onClick={() => void ablehnen()} disabled={stand === 'laeuft'} data-chat-duell-ablehnen
                className="rounded-md px-2 py-1 text-[11px] border border-border text-muted-foreground hover:text-foreground">Ablehnen</button>
            </span>
          )}
      {grund && <span className="block text-[10px] text-red-400 mt-1">{grund}</span>}
    </span>
  )
}
