// ── Nach der Aufnahme: ansehen, Kamera-Blase platzieren, als MP4 speichern, per Chat senden ──
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Film, Save, Play, FolderOpen, Send, Loader2, AlertTriangle, Camera, Circle, Square, FlipHorizontal, CheckCircle2, Search, Trash2, EyeOff } from 'lucide-react'
import { aufnahmeApi, dauerText, type AufnahmeErgebnis } from './typen'
import { useAufnahmeStore } from './aufnahmeStore'
import { baueVorschau, speichereVideo, type Abbruch } from './rendern'
import type { KameraPlatz } from './effekte'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import { sendeDatei, sicher, groesseText, type ChatNutzer } from '../services/chat'
import { protokolliere } from '../services/aktivitaet'

/** Lokaler Pfad → file://-Adresse für <video> (wie bei den Video-Folien der Präsentation) */
export const dateiUrl = (p: string) => encodeURI('file:///' + p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')

/** Dateiname-Vorschlag: Titel (falls vergeben) + Datum/Uhrzeit */
export function dateiVorschlag(titel: string, begonnenIso: string): string {
  const d = new Date(begonnenIso || Date.now())
  const z = (n: number) => String(n).padStart(2, '0')
  const stempel = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}`
  const t = (titel || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  return `${t || 'Erklaervideo'}_${stempel}.mp4`
}

const ECKEN: { name: string; x: number; y: number }[] = [
  { name: 'oben links', x: 0.12, y: 0.17 }, { name: 'oben rechts', x: 0.88, y: 0.17 },
  { name: 'unten links', x: 0.12, y: 0.8 }, { name: 'unten rechts', x: 0.88, y: 0.8 },
]

type Status = 'vorschau' | 'bereit' | 'speichert' | 'fehler'

export default function FertigDialog() {
  const erg = useAufnahmeStore(s => s.ergebnis) as AufnahmeErgebnis
  const titel = useAufnahmeStore(s => s.titel)
  const schliesse = useAufnahmeStore(s => s.schliesse)
  const api = aufnahmeApi()
  const [status, setStatus] = useState<Status>('vorschau')
  const [fehler, setFehler] = useState('')
  const [vorschau, setVorschau] = useState<{ bildschirm: string; kamera?: string; kameraVersatzS: number } | null>(null)
  const [platz, setPlatz] = useState<KameraPlatz & { zeigen: boolean }>({ x: 0.88, y: 0.8, groesse: 0.26, form: 'kreis', spiegeln: true, zeigen: true })
  const [fortschritt, setFortschritt] = useState<{ a: number; s: string }>({ a: 0, s: '' })
  const [gespeichert, setGespeichert] = useState<{ pfad: string; bytes: number; mitKamera: boolean } | null>(null)
  const [frageVerwerfen, setFrageVerwerfen] = useState(false)
  const [chatOffen, setChatOffen] = useState(false)
  const abbruch = useRef<Abbruch>({ abgebrochen: false })
  const bildRef = useRef<HTMLVideoElement>(null)
  const kamRef = useRef<HTMLVideoElement>(null)
  const flaeche = useRef<HTMLDivElement>(null)
  const [flaecheGr, setFlaecheGr] = useState({ w: 0, h: 0 })
  const hatKamera = !!erg?.kamera?.proben.length

  // Vorschau-Dateien bauen (nur verpacken – dauert Sekunden)
  useEffect(() => {
    if (!erg) return
    let weg = false
    baueVorschau(erg).then(v => { if (!weg) { setVorschau(v); setStatus('bereit') } })
      .catch(e => { if (!weg) { setFehler((e as Error).message || String(e)); setStatus('fehler') } })
    return () => { weg = true; abbruch.current.abgebrochen = true }
  }, [erg])

  // Größe der Vorschaufläche (für die Blase in Pixeln)
  useEffect(() => {
    const el = flaeche.current
    if (!el) return
    const ro = new ResizeObserver(() => setFlaecheGr({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [status])

  // Kamera-Video im Takt des Bildschirm-Videos halten
  useEffect(() => {
    if (!vorschau?.kamera) return
    let raf = 0
    const tick = () => {
      const b = bildRef.current, k = kamRef.current
      if (b && k) {
        // Vor dem ersten bzw. nach dem letzten Kamerabild: dieses stehen lassen (wie beim Einrechnen)
        const roh = b.currentTime - vorschau.kameraVersatzS
        const ende = k.duration ? Math.max(0, k.duration - 0.05) : Infinity
        const t = Math.min(Math.max(0, roh), ende)
        const laeuft = roh >= 0 && roh < ende
        if (Math.abs(k.currentTime - t) > 0.25) k.currentTime = t
        if (!b.paused && laeuft && k.paused) void k.play().catch(() => {})
        if ((b.paused || !laeuft) && !k.paused) k.pause()
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [vorschau])

  if (!erg) return null
  const W = erg.bildschirm.breite, H = erg.bildschirm.hoehe
  const d = platz.groesse * flaecheGr.h
  const bw = platz.form === 'kreis' ? d : d * 4 / 3
  const begrenze = (p: KameraPlatz & { zeigen: boolean }) => {
    const gr = p.groesse, rx = ((p.form === 'kreis' ? gr : gr * 4 / 3) * H / W) / 2, ry = gr / 2
    return { ...p, x: Math.min(1 - rx, Math.max(rx, p.x)), y: Math.min(1 - ry, Math.max(ry, p.y)) }
  }
  const aendere = (p: Partial<KameraPlatz & { zeigen: boolean }>) => setPlatz(alt => begrenze({ ...alt, ...p }))

  function ziehen(e: React.PointerEvent) {
    const el = flaeche.current
    if (!el || status === 'speichert') return
    e.preventDefault()
    const r = el.getBoundingClientRect()
    const start = { x: e.clientX, y: e.clientY, px: platz.x, py: platz.y }
    const move = (ev: PointerEvent) => aendere({ x: start.px + (ev.clientX - start.x) / r.width, y: start.py + (ev.clientY - start.y) / r.height })
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  async function speichern() {
    const ziel = await api.speichernDialog(dateiVorschlag(titel, erg.begonnen))
    if (!ziel) return
    const mitKamera = hatKamera && platz.zeigen
    bildRef.current?.pause()
    setStatus('speichert'); setFehler(''); setFortschritt({ a: 0, s: 'Wird vorbereitet …' })
    abbruch.current = { abgebrochen: false }
    try {
      const bytes = await speichereVideo(erg, ziel, mitKamera ? platz : null, (a, s) => setFortschritt({ a, s }), abbruch.current)
      setGespeichert({ pfad: ziel, bytes, mitKamera })
      setStatus('bereit')
      protokolliere({ art: 'manuell', quelle: 'Präsentiermodus', aktion: 'Erklärvideo gespeichert', ziel: ziel.split(/[\\/]/).pop(), details: [`Länge ${dauerText(erg.dauerMs)}`, groesseText(bytes), mitKamera ? 'mit Kamera-Blase' : 'ohne Kamera'] })
    } catch (e) {
      if (abbruch.current.abgebrochen) { setStatus('bereit'); return }
      setFehler('Speichern fehlgeschlagen: ' + ((e as Error).message || String(e)))
      setStatus('bereit')
    }
  }

  async function fertig(verwerfen = false) {
    if (!gespeichert && !verwerfen) { setFrageVerwerfen(true); return }
    abbruch.current.abgebrochen = true
    bildRef.current?.pause(); kamRef.current?.pause()
    if (bildRef.current) bildRef.current.removeAttribute('src')
    if (kamRef.current) kamRef.current.removeAttribute('src')
    if (!gespeichert) protokolliere({ art: 'manuell', quelle: 'Präsentiermodus', aktion: 'Bildschirmaufnahme verworfen (nicht gespeichert)', details: [`Länge ${dauerText(erg.dauerMs)}`] })
    await api.loesche(erg.ordner).catch(() => false)
    schliesse()
  }

  const speichertGerade = status === 'speichert'
  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4" data-aufnahme-fertig>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <Film size={18} className="text-primary" />
          <h3 className="text-base font-semibold text-foreground">Aufnahme fertig</h3>
          <span className="text-xs text-muted-foreground">{dauerText(erg.dauerMs)} Min · {W}×{H}{erg.ton ? ' · mit Ton' : ' · ohne Ton'}{hatKamera ? ' · mit Kamera' : ''}</span>
          <button onClick={() => void fertig()} disabled={speichertGerade} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-40" title="Schließen"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-[minmax(0,1fr)_260px] gap-5">
          {/* Vorschau */}
          <div className="min-w-0 space-y-2">
            <div ref={flaeche} className="relative w-full bg-black rounded-lg overflow-hidden" style={{ aspectRatio: `${W} / ${H}` }}>
              {status === 'vorschau' && <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/80"><Loader2 size={16} className="animate-spin" />Vorschau wird erstellt …</div>}
              {vorschau && <video ref={bildRef} src={dateiUrl(vorschau.bildschirm)} controls className="absolute inset-0 w-full h-full" data-vorschau />}
              {vorschau?.kamera && platz.zeigen && flaecheGr.h > 0 && (
                <div onPointerDown={ziehen} title="Ziehen, um die Kamera-Blase zu verschieben"
                  className={`absolute cursor-move overflow-hidden border-2 border-white/90 shadow-xl ${platz.form === 'kreis' ? 'rounded-full' : 'rounded-[8%]'}`}
                  style={{ width: bw, height: d, left: platz.x * flaecheGr.w - bw / 2, top: platz.y * flaecheGr.h - d / 2, background: '#000' }} data-kamera-blase>
                  <video ref={kamRef} src={dateiUrl(vorschau.kamera)} muted playsInline className="w-full h-full object-cover pointer-events-none" style={{ transform: platz.spiegeln ? 'scaleX(-1)' : undefined }} />
                </div>
              )}
            </div>
            {erg.hinweise.length > 0 && (
              <div className="text-[11px] text-amber-600 flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" /><span>{erg.hinweise.slice(0, 4).join(' · ')}</span></div>
            )}
            {fehler && <p className="text-xs text-red-500 flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{fehler}</p>}
          </div>

          {/* Seitenleiste */}
          <div className="space-y-4">
            {hatKamera && (
              <section className="space-y-2">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Camera size={13} />Kamera-Blase</p>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={platz.zeigen} onChange={e => aendere({ zeigen: e.target.checked })} disabled={speichertGerade} className="accent-primary" />
                  <span className="text-foreground">Im Video zeigen</span>
                </label>
                {platz.zeigen ? (
                  <>
                    <p className="text-[11px] text-muted-foreground">In der Vorschau mit der Maus an die gewünschte Stelle ziehen – oder schnell in eine Ecke:</p>
                    <div className="grid grid-cols-2 gap-1">
                      {ECKEN.map(e => (
                        <button key={e.name} onClick={() => aendere({ x: e.x, y: e.y })} disabled={speichertGerade} className="px-2 py-1 rounded-md border border-border text-[11px] text-foreground hover:bg-accent/40 disabled:opacity-40">{e.name}</button>
                      ))}
                    </div>
                    <label className="block text-[11px] text-muted-foreground">Größe
                      <input type="range" min={0.14} max={0.45} step={0.01} value={platz.groesse} onChange={e => aendere({ groesse: Number(e.target.value) })} disabled={speichertGerade} className="w-full accent-primary" data-blase-groesse />
                    </label>
                    <div className="flex items-center gap-1">
                      <button onClick={() => aendere({ form: 'kreis' })} disabled={speichertGerade} className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border text-[11px] ${platz.form === 'kreis' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}`}><Circle size={12} />Kreis</button>
                      <button onClick={() => aendere({ form: 'rechteck' })} disabled={speichertGerade} className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border text-[11px] ${platz.form === 'rechteck' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}`}><Square size={12} />Rechteck</button>
                      <button onClick={() => aendere({ spiegeln: !platz.spiegeln })} disabled={speichertGerade} title="Spiegeln" className={`px-2 py-1 rounded-md border text-[11px] ${platz.spiegeln ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}`}><FlipHorizontal size={12} /></button>
                    </div>
                  </>
                ) : <p className="text-[11px] text-muted-foreground flex items-center gap-1"><EyeOff size={12} />Das Video wird ohne Kamera gespeichert.</p>}
              </section>
            )}

            <section className="space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Save size={13} />Speichern</p>
              {speichertGerade ? (
                <div className="space-y-1.5">
                  <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(fortschritt.a * 100)}%` }} /></div>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" />{fortschritt.s} {Math.round(fortschritt.a * 100)} %</p>
                  <button onClick={() => { abbruch.current.abgebrochen = true }} className="text-[11px] text-muted-foreground hover:text-foreground underline">Abbrechen</button>
                </div>
              ) : (
                <button onClick={() => void speichern()} disabled={status !== 'bereit'} data-speichern
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40">
                  <Save size={14} />{gespeichert ? 'Nochmal speichern …' : 'Als MP4 speichern …'}
                </button>
              )}
              {hatKamera && platz.zeigen && !speichertGerade && <p className="text-[10px] text-muted-foreground">Die Kamera wird beim Speichern ins Video eingerechnet – dauert etwa so lange wie das Video selbst.</p>}
              {gespeichert && !speichertGerade && (
                <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-2 space-y-1.5" data-gespeichert>
                  <p className="text-[11px] text-foreground flex items-start gap-1.5"><CheckCircle2 size={13} className="text-emerald-500 mt-0.5 shrink-0" /><span className="break-all">{gespeichert.pfad}<span className="text-muted-foreground"> · {groesseText(gespeichert.bytes)}</span></span></p>
                  <div className="flex gap-1">
                    <button onClick={() => void api.abspielen(gespeichert.pfad)} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] text-foreground hover:bg-accent/40"><Play size={11} />Abspielen</button>
                    <button onClick={() => void api.imOrdnerZeigen(gespeichert.pfad)} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] text-foreground hover:bg-accent/40"><FolderOpen size={11} />Im Ordner</button>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Send size={13} />Per Chat senden <span className="font-normal text-muted-foreground">(optional)</span></p>
              {!gespeichert ? <p className="text-[11px] text-muted-foreground">Erst speichern – danach kannst du das Video an eine Person im Tool schicken.</p>
                : chatOffen ? <ChatSenden pfad={gespeichert.pfad} bytes={gespeichert.bytes} onZu={() => setChatOffen(false)} />
                : <button onClick={() => setChatOffen(true)} disabled={speichertGerade} className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-accent/40 disabled:opacity-40" data-chat-senden><Send size={13} />Person auswählen …</button>}
            </section>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-border">
          <button onClick={() => setFrageVerwerfen(true)} disabled={speichertGerade} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent disabled:opacity-40"><Trash2 size={13} />{gespeichert ? 'Zwischendateien löschen' : 'Verwerfen'}</button>
          <button onClick={() => void fertig()} disabled={speichertGerade} className="ml-auto px-4 py-1.5 rounded-md bg-accent text-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40" data-fertig>Fertig</button>
        </div>
      </div>

      {frageVerwerfen && (
        <div className="fixed inset-0 z-[95] bg-black/60 flex items-center justify-center p-6" onClick={() => setFrageVerwerfen(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">{gespeichert ? 'Fenster schließen?' : 'Aufnahme verwerfen?'}</p>
            <p className="text-xs text-muted-foreground">{gespeichert ? 'Die gespeicherte Datei bleibt erhalten, nur die Zwischendateien werden gelöscht.' : 'Das Video wurde noch nicht gespeichert und geht verloren.'}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setFrageVerwerfen(false)} className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent">Zurück</button>
              <button onClick={() => void fertig(true)} className={`px-3 py-1.5 rounded-md text-sm font-semibold text-white ${gespeichert ? 'bg-primary' : 'bg-red-600 hover:bg-red-500'}`} data-verwerfen-ja>{gespeichert ? 'Schließen' : 'Verwerfen'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Person aus dem Chat wählen, kurzen Text dazu, Video ins Netz kopieren und als Nachricht schicken */
function ChatSenden({ pfad, bytes, onZu }: { pfad: string; bytes: number; onZu: () => void }) {
  const ich = useAuthStore(s => s.session?.user)
  const nutzer = useChatStore(s => s.nutzer)
  const [suche, setSuche] = useState('')
  const [an, setAn] = useState<ChatNutzer | null>(null)
  const [text, setText] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [erledigt, setErledigt] = useState<string[]>([])
  const [fehler, setFehler] = useState('')
  const andere = useMemo(() => nutzer.filter(n => !ich || sicher(n.username) !== sicher(ich.username)), [nutzer, ich])
  const q = suche.trim().toLowerCase()
  const liste = andere.filter(n => !q || n.displayName.toLowerCase().includes(q) || n.username.toLowerCase().includes(q)).slice(0, 40)

  async function senden() {
    if (!an || !ich) return
    setLaeuft(true); setFehler('')
    const name = pfad.split(/[\\/]/).pop() || 'Erklaervideo.mp4'
    const r = await sendeDatei({ username: ich.username, displayName: ich.displayName || ich.username }, { username: an.username, displayName: an.displayName }, pfad, name, text)
    setLaeuft(false)
    if (!r.ok) { setFehler(r.fehler); return }
    protokolliere({ art: 'manuell', quelle: 'Präsentiermodus', aktion: 'Erklärvideo per Chat gesendet', ziel: an.displayName, details: [name, groesseText(bytes)] })
    setErledigt(e => [...e, an.displayName]); setAn(null); setText('')
  }

  return (
    <div className="space-y-1.5" data-chat-auswahl>
      {erledigt.length > 0 && <p className="text-[11px] text-emerald-600 flex items-start gap-1"><CheckCircle2 size={12} className="mt-0.5 shrink-0" />Gesendet an {erledigt.join(', ')}</p>}
      {!an ? (
        <>
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Person suchen …" autoFocus className="w-full pl-6 pr-2 py-1 rounded-md bg-background border border-border text-xs" />
          </div>
          <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {!liste.length && <p className="px-2 py-2 text-[11px] text-muted-foreground">{andere.length ? 'Niemand gefunden.' : 'Noch keine Personen im Chat bekannt.'}</p>}
            {liste.map(n => (
              <button key={n.username} onClick={() => setAn(n)} className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-accent/30" data-person={n.username}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${n.online ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                <span className="text-xs text-foreground truncate">{n.displayName}</span>
              </button>
            ))}
          </div>
          <button onClick={onZu} className="text-[11px] text-muted-foreground hover:text-foreground underline">Schließen</button>
        </>
      ) : (
        <>
          <p className="text-xs text-foreground">An <b>{an.displayName}</b>{!an.online && <span className="text-muted-foreground"> (gerade nicht im Tool – sieht es beim nächsten Öffnen)</span>}</p>
          <textarea value={text} onChange={e => setText(e.target.value.slice(0, 500))} rows={2} placeholder="Kurzer Text dazu (optional) …" className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-xs resize-none" />
          {bytes > 300 * 1024 * 1024 && <p className="text-[10px] text-amber-600">Großes Video ({groesseText(bytes)}) – das Kopieren ins Netzlaufwerk dauert etwas.</p>}
          {fehler && <p className="text-[11px] text-red-500">{fehler}</p>}
          <div className="flex gap-1.5">
            <button onClick={() => setAn(null)} disabled={laeuft} className="px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:bg-accent disabled:opacity-40">Andere Person</button>
            <button onClick={() => void senden()} disabled={laeuft} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50" data-senden>
              {laeuft ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}Senden
            </button>
          </div>
        </>
      )}
    </div>
  )
}
