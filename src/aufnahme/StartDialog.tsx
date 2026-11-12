// ── Präsentiermodus: Einstellungen + Einwilligung vor der Aufnahme ───────────
// Klick auf „Aufnahme starten“ = Zustimmung zur Bildschirmaufzeichnung (Pflicht-Haken).
// Mikrofon und Kamera nur mit eigener Zustimmung (eigene Haken, werden nicht gemerkt).
import { useEffect, useRef, useState } from 'react'
import { X, Video, Monitor, Mic, Camera, Sparkles, Circle, Sun, ZoomIn, Volume2, Loader2, AlertTriangle, ShieldCheck, Keyboard, Type } from 'lucide-react'
import { aufnahmeApi, type Bildschirm, type AufnahmeOptionen, type Effekte } from './typen'
import { useAufnahmeStore, ladeGemerkt, merkeOptionen, type GemerkteOptionen } from './aufnahmeStore'
import { protokolliere } from '../services/aktivitaet'

const stoppe = (s: MediaStream | null) => s?.getTracks().forEach(t => t.stop())

export default function StartDialog() {
  const schliesse = useAufnahmeStore(s => s.schliesse)
  const gestartet = useAufnahmeStore(s => s.gestartet)
  const api = aufnahmeApi()
  const [bildschirme, setBildschirme] = useState<Bildschirm[] | null>(null)
  const [o, setO] = useState<GemerkteOptionen>(ladeGemerkt)
  const [titel, setTitel] = useState('')
  const [zustimmung, setZustimmung] = useState(false)
  const [geraete, setGeraete] = useState<MediaDeviceInfo[]>([])
  const [pegel, setPegel] = useState(0)
  const [mikFehler, setMikFehler] = useState('')
  const [kamFehler, setKamFehler] = useState('')
  const [startet, setStartet] = useState(false)
  const [fehler, setFehler] = useState('')
  const kamVideo = useRef<HTMLVideoElement>(null)
  const mikStrom = useRef<MediaStream | null>(null)
  const kamStrom = useRef<MediaStream | null>(null)

  const setze = (p: Partial<GemerkteOptionen>) => setO(alt => ({ ...alt, ...p }))
  const setzeEffekt = (k: keyof Effekte) => setO(alt => ({ ...alt, effekte: { ...alt.effekte, [k]: !alt.effekte[k] } }))

  useEffect(() => {
    api.quellen().then(l => setBildschirme(l)).catch(e => { setBildschirme([]); setFehler('Bildschirme nicht lesbar: ' + (e as Error).message) })
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const ladeGeraete = () => { void navigator.mediaDevices?.enumerateDevices().then(setGeraete).catch(() => {}) }
  useEffect(() => {
    ladeGeraete()
    navigator.mediaDevices?.addEventListener?.('devicechange', ladeGeraete)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', ladeGeraete)
  }, [])

  // Mikrofon-Probe: Pegel anzeigen, damit man sieht, dass es ankommt
  useEffect(() => {
    if (!o.mikrofon) { setPegel(0); setMikFehler(''); return }
    let aus = false, raf = 0
    let ctx: AudioContext | null = null
    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: o.mikrofonId ? { exact: o.mikrofonId } : undefined }, video: false })
        if (aus) { stoppe(s); return }
        mikStrom.current = s
        setMikFehler('')
        ladeGeraete()
        ctx = new AudioContext()
        const an = ctx.createAnalyser(); an.fftSize = 512
        ctx.createMediaStreamSource(s).connect(an)
        const d = new Float32Array(an.fftSize)
        const tick = () => {
          an.getFloatTimeDomainData(d)
          let q = 0; for (const v of d) q += v * v
          setPegel(Math.min(1, Math.sqrt(q / d.length) * 4))
          raf = requestAnimationFrame(tick)
        }
        tick()
      } catch (e) { if (!aus) setMikFehler((e as Error).message || 'Mikrofon nicht verfügbar') }
    })()
    return () => { aus = true; cancelAnimationFrame(raf); stoppe(mikStrom.current); mikStrom.current = null; void ctx?.close().catch(() => {}) }
  }, [o.mikrofon, o.mikrofonId])   // eslint-disable-line react-hooks/exhaustive-deps

  // Kamera-Vorschau
  useEffect(() => {
    if (!o.kamera) { setKamFehler(''); return }
    let aus = false
    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: o.kameraId ? { exact: o.kameraId } : undefined, width: { ideal: 640 }, height: { ideal: 480 } } })
        if (aus) { stoppe(s); return }
        kamStrom.current = s
        setKamFehler('')
        ladeGeraete()
        if (kamVideo.current) { kamVideo.current.srcObject = s; void kamVideo.current.play().catch(() => {}) }
      } catch (e) { if (!aus) setKamFehler((e as Error).message || 'Kamera nicht verfügbar') }
    })()
    return () => { aus = true; stoppe(kamStrom.current); kamStrom.current = null }
  }, [o.kamera, o.kameraId])   // eslint-disable-line react-hooks/exhaustive-deps

  const mikros = geraete.filter(g => g.kind === 'audioinput' && g.deviceId !== 'communications')
  const kameras = geraete.filter(g => g.kind === 'videoinput')
  const liste = bildschirme || []
  const festId = o.fest && liste.some(b => b.displayId === o.fest) ? o.fest : liste.find(b => b.haupt)?.displayId
  const kannStarten = zustimmung && liste.length > 0 && !startet

  async function starte() {
    if (!kannStarten) return
    setStartet(true); setFehler('')
    // Geräte freigeben, bevor die Aufnahme-Leiste sie öffnet
    stoppe(mikStrom.current); mikStrom.current = null
    stoppe(kamStrom.current); kamStrom.current = null
    try {
      const ordner = await api.neuerOrdner()
      const opts: AufnahmeOptionen = { ...o, fest: o.folgen ? undefined : festId, ordner, bildschirme: liste, titel: titel.trim() || undefined }
      merkeOptionen({ ...o, fest: festId })
      const r = await api.starte(opts)
      if (!r.ok) { setFehler(r.fehler || 'Die Aufnahme konnte nicht gestartet werden.'); setStartet(false); return }
      protokolliere({
        art: 'manuell', quelle: 'Präsentiermodus', aktion: 'Bildschirmaufnahme gestartet (Einwilligung erteilt)',
        details: [
          o.folgen ? `Bildschirme: alle ${liste.length} (folgt der Maus)` : `Bildschirm: ${liste.find(b => b.displayId === festId)?.name || festId}`,
          `Mikrofon: ${o.mikrofon ? 'ja' : 'nein'} · PC-Ton: ${o.systemton ? 'ja' : 'nein'} · Kamera: ${o.kamera ? 'ja' : 'nein'}`,
        ],
      })
      gestartet(opts)
    } catch (e) {
      setFehler((e as Error).message || String(e)); setStartet(false)
    }
  }

  const effektKarte = (k: keyof Effekte, Icon: typeof Sparkles, name: string, text: string, taste?: string) => (
    <button type="button" onClick={() => setzeEffekt(k)} data-effekt={k}
      className={`text-left rounded-lg border px-3 py-2 transition-colors ${o.effekte[k] ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/30'}`}>
      <span className="flex items-center gap-2">
        <Icon size={15} className={o.effekte[k] ? 'text-primary' : 'text-muted-foreground'} />
        <span className="text-xs font-semibold text-foreground">{name}</span>
        <span className={`ml-auto text-[10px] px-1.5 rounded-full ${o.effekte[k] ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{o.effekte[k] ? 'an' : 'aus'}</span>
      </span>
      <span className="block text-[11px] text-muted-foreground mt-0.5">{text}{taste && <span className="text-foreground/70"> · {taste}</span>}</span>
    </button>
  )

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4" onClick={() => { if (!startet) schliesse() }}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()} data-aufnahme-start>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <Video size={18} className="text-red-500" />
          <h3 className="text-base font-semibold text-foreground">Präsentiermodus – Erklärvideo aufnehmen</h3>
          <button onClick={schliesse} disabled={startet} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-40" title="Schließen"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Bildschirme */}
          <section>
            <p className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5"><Monitor size={13} />Was wird aufgenommen?</p>
            {!bildschirme ? <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />Bildschirme werden erkannt …</p>
              : !liste.length ? <p className="text-[11px] text-red-500">Kein Bildschirm zum Aufnehmen gefunden.</p>
              : (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-center">
                  <div className="space-y-1.5">
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input type="radio" checked={o.folgen} onChange={() => setze({ folgen: true })} className="mt-0.5 accent-primary" />
                      <span><span className="font-medium text-foreground">Alle {liste.length > 1 ? `${liste.length} Bildschirme` : 'Bildschirme'} – das Video folgt der Maus</span>
                        <span className="block text-[11px] text-muted-foreground">Es wird immer nur der Bildschirm gezeigt, auf dem die Maus gerade ist (mit kurzem Übergang) – kein breites Gesamtbild.</span></span>
                    </label>
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input type="radio" checked={!o.folgen} onChange={() => setze({ folgen: false, fest: festId })} className="mt-0.5 accent-primary" />
                      <span><span className="font-medium text-foreground">Nur einen Bildschirm</span>
                        <span className="block text-[11px] text-muted-foreground">Rechts im Plan anklicken.</span></span>
                    </label>
                  </div>
                  <MonitorPlan liste={liste} folgen={o.folgen} fest={festId} onWaehle={id => setze({ folgen: false, fest: id })} />
                </div>
              )}
          </section>

          {/* Ton */}
          <section className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Mic size={13} />Ton</p>
              <label className="flex items-start gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={o.mikrofon} onChange={e => setze({ mikrofon: e.target.checked })} className="mt-0.5 accent-primary" data-mikrofon />
                <span className="text-foreground">Ich bin einverstanden, dass mein <b>Mikrofon</b> aufgenommen wird (zum Erklären).</span>
              </label>
              {o.mikrofon && (
                <div className="pl-6 space-y-1">
                  <select value={o.mikrofonId || ''} onChange={e => setze({ mikrofonId: e.target.value || undefined })} className="w-full px-2 py-1 rounded-md bg-background border border-border text-xs">
                    <option value="">Standard-Mikrofon</option>
                    {mikros.filter(m => m.deviceId !== 'default').map(m => <option key={m.deviceId} value={m.deviceId}>{m.label || 'Mikrofon'}</option>)}
                  </select>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden" title="Pegel – sprich etwas zur Probe"><div className="h-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${Math.round(pegel * 100)}%` }} /></div>
                  {mikFehler ? <p className="text-[11px] text-red-500">Mikrofon: {mikFehler}</p> : <p className="text-[10px] text-muted-foreground">Sprich etwas – der grüne Balken muss ausschlagen.</p>}
                </div>
              )}
              <label className="flex items-start gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={o.systemton} onChange={e => setze({ systemton: e.target.checked })} className="mt-0.5 accent-primary" />
                <span className="text-foreground flex items-center gap-1"><Volume2 size={12} />Ton des PCs mitnehmen (Videos, Hinweistöne)</span>
              </label>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Camera size={13} />Selbstaufnahme</p>
              <label className="flex items-start gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={o.kamera} onChange={e => setze({ kamera: e.target.checked })} className="mt-0.5 accent-primary" data-kamera />
                <span className="text-foreground">Ich bin einverstanden, dass ich mit der <b>Kamera</b> aufgenommen werde. Die kleine Blase platziere ich am Ende selbst.</span>
              </label>
              {o.kamera && (
                <div className="pl-6 flex items-center gap-2">
                  <video ref={kamVideo} muted playsInline className="h-16 w-16 rounded-full object-cover bg-black border border-border shrink-0" style={{ transform: 'scaleX(-1)' }} />
                  <div className="flex-1 min-w-0 space-y-1">
                    <select value={o.kameraId || ''} onChange={e => setze({ kameraId: e.target.value || undefined })} className="w-full px-2 py-1 rounded-md bg-background border border-border text-xs">
                      <option value="">Standard-Kamera</option>
                      {kameras.map(k => <option key={k.deviceId} value={k.deviceId}>{k.label || 'Kamera'}</option>)}
                    </select>
                    {kamFehler && <p className="text-[11px] text-red-500">Kamera: {kamFehler}</p>}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Effekte */}
          <section>
            <p className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5"><Sparkles size={13} />Präsentations-Effekte <span className="font-normal text-muted-foreground">– auch während der Aufnahme an der Leiste umschaltbar</span></p>
            <div className="grid grid-cols-2 gap-2">
              {effektKarte('schweif', Sparkles, 'Roter Schweif', 'Leuchtende, funkelnde Spur hinter der Maus')}
              {effektKarte('ring', Circle, 'Leuchtring', 'Gelber Kreis um den Mauszeiger')}
              {effektKarte('spotlight', Sun, 'Spotlight', 'Alles abdunkeln außer der Stelle an der Maus', 'Strg+Umschalt+F12')}
              {effektKarte('lupe', ZoomIn, 'Lupe', 'Bild 2× vergrößert, folgt weich der Maus', 'Strg+Umschalt+F11')}
            </div>
          </section>

          {/* Weiteres */}
          <section className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Type size={13} />Titel-Einblendung <span className="font-normal text-muted-foreground">(optional)</span></p>
              <input value={titel} onChange={e => setTitel(e.target.value.slice(0, 80))} placeholder="z. B. So verbindest du Laufwerk I:" className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-xs placeholder:text-muted-foreground/60" data-titel />
              <p className="text-[10px] text-muted-foreground">Erscheint die ersten 5 Sekunden unten links und ist auch der Dateiname-Vorschlag.</p>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-foreground">Qualität</span>
                {(['1080', '720'] as const).map(q => (
                  <button key={q} type="button" onClick={() => setze({ aufloesung: q })} className={`px-2 py-0.5 rounded-md border text-[11px] ${o.aufloesung === q ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}`}>
                    {q === '1080' ? 'Full HD (1080p)' : 'Kleiner (720p)'}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={o.countdown} onChange={e => setze({ countdown: e.target.checked })} className="accent-primary" /><span className="text-foreground">3-2-1-Countdown vor dem Start</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={o.minimieren} onChange={e => setze({ minimieren: e.target.checked })} className="accent-primary" /><span className="text-foreground">IT Admin Tool während der Aufnahme minimieren</span></label>
            </div>
          </section>

          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 rounded-md bg-muted/40 px-3 py-2">
            <Keyboard size={13} className="mt-0.5 shrink-0" />
            <span>Während der Aufnahme: <b>Strg+Umschalt+F9</b> Pause/Weiter · <b>F10</b> Stopp · <b>F11</b> Lupe · <b>F12</b> Spotlight. Die kleine Steuerleiste oben erscheint selbst nicht im Video.</span>
          </p>

          {fehler && <p className="text-xs text-red-500 flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{fehler}</p>}
        </div>

        {/* Einwilligung – immer sichtbar direkt am Start-Knopf */}
        <div className="flex items-center gap-3 px-5 py-3 border-t border-border">
          <label className={`flex-1 min-w-0 flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer ${zustimmung ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-amber-500/60 bg-amber-500/10'}`} data-zustimmung>
            <input type="checkbox" checked={zustimmung} onChange={e => setZustimmung(e.target.checked)} className="mt-0.5 w-4 h-4 accent-primary shrink-0" />
            <span className="text-xs text-foreground min-w-0">
              <span className="font-semibold flex items-center gap-1"><ShieldCheck size={13} className="shrink-0" />Ich bin einverstanden, dass mein Bildschirm aufgezeichnet wird.</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">Vorher vertrauliche Fenster schließen (Kennwörter, Personaldaten, private Nachrichten). Die Aufnahme bleibt auf diesem PC, bis du sie speicherst oder verschickst.</span>
            </span>
          </label>
          <button onClick={schliesse} disabled={startet} className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent disabled:opacity-40">Abbrechen</button>
          <button onClick={() => void starte()} disabled={!kannStarten} data-aufnahme-starten
            title={zustimmung ? 'Aufnahme starten' : 'Bitte zuerst der Bildschirmaufzeichnung zustimmen'}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-40 disabled:hover:bg-red-600">
            {startet ? <Loader2 size={14} className="animate-spin" /> : <span className="w-2.5 h-2.5 rounded-full bg-white" />}Aufnahme starten
          </button>
        </div>
      </div>
    </div>
  )
}

/** Kleiner Plan der Bildschirme in ihrer echten Anordnung */
function MonitorPlan({ liste, folgen, fest, onWaehle }: { liste: Bildschirm[]; folgen: boolean; fest?: string; onWaehle: (id: string) => void }) {
  const minX = Math.min(...liste.map(b => b.bounds.x)), minY = Math.min(...liste.map(b => b.bounds.y))
  const maxX = Math.max(...liste.map(b => b.bounds.x + b.bounds.width)), maxY = Math.max(...liste.map(b => b.bounds.y + b.bounds.height))
  const s = Math.min(300 / Math.max(1, maxX - minX), 110 / Math.max(1, maxY - minY))
  return (
    <div className="relative shrink-0" style={{ width: Math.round((maxX - minX) * s), height: Math.round((maxY - minY) * s) }} data-monitor-plan>
      {liste.map((b, i) => {
        const aktiv = folgen || fest === b.displayId
        return (
          <button key={b.displayId} type="button" onClick={() => onWaehle(b.displayId)} title={`${b.name} – nur diesen aufnehmen`}
            className={`absolute rounded-md border-2 flex flex-col items-center justify-center leading-tight transition-colors ${aktiv ? 'border-primary bg-primary/15 text-foreground' : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/50'}`}
            style={{ left: (b.bounds.x - minX) * s + 2, top: (b.bounds.y - minY) * s + 2, width: Math.max(24, b.bounds.width * s - 4), height: Math.max(18, b.bounds.height * s - 4) }}>
            <span className="text-sm font-bold">{i + 1}</span>
            <span className="text-[9px]">{b.haupt ? 'Haupt · ' : ''}{Math.round(b.bounds.width * b.skalierung)}×{Math.round(b.bounds.height * b.skalierung)}</span>
          </button>
        )
      })}
    </div>
  )
}
