// ── Aufnahme-Leiste (eigenes kleines Fenster, #aufnahme) ─────────────────────
// Oben mittig, immer im Vordergrund, selbst nicht im Video. Zeigt Zeit, Monitor, Ton und
// steuert Pause/Stopp/Effekte; Tastenkürzel Strg+Umschalt+F9 (Pause), F10 (Stopp),
// F11 (Lupe), F12 (Spotlight). Hier läuft die eigentliche Aufnahme (aufnehmen.ts).
import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Square, Mic, MicOff, ZoomIn, Sun, Sparkles, Loader2, Trash2, Monitor, Minus, Circle } from 'lucide-react'
import { Aufnahme, type Zustand } from './aufnehmen'
import { aufnahmeApi, dauerText } from './typen'

export default function AufnahmeLeiste() {
  const api = aufnahmeApi()
  const auf = useRef<Aufnahme | null>(null)
  const [z, setZ] = useState<Zustand | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [phase, setPhase] = useState<'start' | 'laeuft' | 'speichern' | 'fehler'>('start')
  const [fehler, setFehler] = useState('')
  const [frage, setFrage] = useState(false)
  const kamRef = useRef<HTMLVideoElement>(null)
  const [mitKamera, setMitKamera] = useState(false)
  const [tick, setTick] = useState(0)
  const [mitMikro, setMitMikro] = useState(false)
  const stoppeRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    document.title = 'Aufnahme — IT Admin Tool'
    document.body.style.margin = '0'
    document.body.style.background = '#111827'
    let weg = false
    const aus1 = api.beiMaus(m => auf.current?.setzeMaus(m))
    const aus2 = api.beiTaste(t => {
      const a = auf.current
      if (!a) return
      if (t === 'pause') a.pause()
      else if (t === 'stopp') void stoppeRef.current()
      else if (t === 'lupe') a.schalte('lupe')
      else if (t === 'spotlight') a.schalte('spotlight')
    })
    void (async () => {
      const o = await api.optionen()
      if (!o || weg) return
      const a = new Aufnahme(o, s => setZ(s))
      auf.current = a
      setMitMikro(o.mikrofon)
      try {
        await a.vorbereiten()
        if (a.kameraStrom && kamRef.current) { kamRef.current.srcObject = a.kameraStrom; void kamRef.current.play().catch(() => {}); setMitKamera(true) }
        if (o.countdown) for (let i = 3; i >= 1 && a.status === 'bereit'; i--) { setCountdown(i); await new Promise(r => setTimeout(r, 1000)) }
        setCountdown(0)
        if (a.status !== 'bereit' || weg) return   // während des Countdowns abgebrochen
        a.starte()
        setPhase('laeuft')
      } catch (e) {
        setFehler((e as Error).message || String(e)); setPhase('fehler')
        await a.verwerfe().catch(() => {})
      }
    })()
    const uhr = window.setInterval(() => setTick(t => t + 1), 250)
    return () => { weg = true; aus1(); aus2(); clearInterval(uhr) }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function stoppe() {
    const a = auf.current
    if (!a || a.status === 'beendet') return
    // Vor dem eigentlichen Start (Vorbereitung/Countdown) heißt Stopp: abbrechen
    if (a.status !== 'laeuft' && a.status !== 'pause') { await verwerfe(); return }
    setPhase('speichern')
    try { const erg = await a.stoppe(); await api.fertig(erg) }
    catch (e) { setFehler((e as Error).message || String(e)); setPhase('fehler') }
  }
  async function verwerfe() {
    const a = auf.current
    setFrage(false)
    if (a) await a.verwerfe().catch(() => {})
    const o = await api.optionen()
    await api.verworfen(o?.ordner)
  }

  stoppeRef.current = stoppe
  void tick
  const a = auf.current
  const ms = a && (a.status === 'laeuft' || a.status === 'pause') ? a.zeitMs() : 0
  const pause = z?.status === 'pause'
  const knopf = (aktiv: boolean) => `h-9 w-9 rounded-lg flex items-center justify-center transition-colors ${aktiv ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`

  return (
    <div className="h-screen w-screen flex items-center gap-2 px-3 text-white select-none" style={{ WebkitAppRegion: 'drag', fontFamily: '"Segoe UI", sans-serif' } as React.CSSProperties} data-aufnahme-leiste>
      {phase === 'start' && (
        <div className="flex items-center gap-3 flex-1">
          {countdown > 0
            ? <><span className="text-3xl font-bold tabular-nums text-red-400 w-8 text-center" data-countdown>{countdown}</span><span className="text-sm text-white/80">Aufnahme beginnt gleich …</span></>
            : <><Loader2 size={18} className="animate-spin text-white/70" /><span className="text-sm text-white/80">Aufnahme wird vorbereitet …</span></>}
          <button onClick={() => void verwerfe()} className="ml-auto px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sm" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>Abbrechen</button>
        </div>
      )}
      {phase === 'fehler' && (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm text-red-300 truncate" title={fehler} data-aufnahme-fehler>Aufnahme nicht möglich: {fehler}</span>
          <button onClick={() => void verwerfe()} className="ml-auto px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sm" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>Schließen</button>
        </div>
      )}
      {phase === 'speichern' && <div className="flex items-center gap-2 flex-1"><Loader2 size={18} className="animate-spin" /><span className="text-sm">Aufnahme wird abgeschlossen …</span></div>}
      {phase === 'laeuft' && z && (
        <>
          <span className={`h-3 w-3 rounded-full ${pause ? 'bg-amber-400' : 'bg-red-500 animate-pulse'}`} />
          <span className="text-lg font-semibold tabular-nums w-14" data-aufnahme-zeit>{dauerText(ms)}</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-white/70 max-w-[110px] truncate" title="Aufgenommen wird der Bildschirm, auf dem die Maus ist"><Monitor size={12} />{z.bildschirm}</span>
          <div className="flex items-center gap-1 ml-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {mitMikro && <button onClick={() => a?.stumm(!z.mikroStumm)} className={knopf(false)} title={z.mikroStumm ? 'Mikrofon wieder an' : 'Mikrofon stumm schalten'}>{z.mikroStumm ? <MicOff size={17} className="text-red-400" /> : <Mic size={17} />}</button>}
            <button onClick={() => a?.schalte('schweif')} className={knopf(z.effekte.schweif)} title="Roter Schweif hinter der Maus"><Sparkles size={17} /></button>
            <button onClick={() => a?.schalte('ring')} className={knopf(z.effekte.ring)} title="Leuchtring um die Maus"><Circle size={17} /></button>
            <button onClick={() => a?.schalte('lupe')} className={knopf(z.effekte.lupe)} title="Lupe – folgt der Maus (Strg+Umschalt+F11)"><ZoomIn size={17} /></button>
            <button onClick={() => a?.schalte('spotlight')} className={knopf(z.effekte.spotlight)} title="Spotlight – alles außer der Maus abdunkeln (Strg+Umschalt+F12)"><Sun size={17} /></button>
            <span className="w-px h-6 bg-white/20 mx-1" />
            <button onClick={() => a?.pause()} className={knopf(pause)} title={pause ? 'Weiter (Strg+Umschalt+F9)' : 'Pause (Strg+Umschalt+F9)'} data-aufnahme-pause>{pause ? <Play size={17} /> : <Pause size={17} />}</button>
            <button onClick={() => void stoppe()} className="h-9 px-3 rounded-lg bg-red-600 hover:bg-red-500 flex items-center gap-1.5 text-sm font-semibold" title="Aufnahme beenden (Strg+Umschalt+F10)" data-aufnahme-stopp><Square size={14} fill="currentColor" />Stopp</button>
            <button onClick={() => setFrage(true)} className={knopf(false)} title="Aufnahme verwerfen"><Trash2 size={16} /></button>
            <button onClick={() => void api.leisteMinimieren()} className={knopf(false)} title="Leiste minimieren (Aufnahme läuft weiter)"><Minus size={16} /></button>
          </div>
        </>
      )}
      <video ref={kamRef} muted playsInline className={`h-12 w-12 rounded-full object-cover border-2 border-white/80 shrink-0 ${mitKamera && phase === 'laeuft' ? '' : 'hidden'}`} style={{ transform: 'scaleX(-1)' }} />
      {frage && (
        <div className="absolute inset-0 bg-gray-900 flex items-center gap-2 px-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <span className="text-sm flex-1">Aufnahme wirklich verwerfen? Sie wird nicht gespeichert.</span>
          <button onClick={() => void verwerfe()} className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-sm font-semibold">Verwerfen</button>
          <button onClick={() => setFrage(false)} className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sm">Weiter aufnehmen</button>
        </div>
      )}
    </div>
  )
}
