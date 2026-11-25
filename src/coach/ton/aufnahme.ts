// Der Coach — Mikrofon: aufnehmen, im Arbeitsspeicher halten, anhören.
// Aufnahmen bleiben im Arbeitsspeicher und werden nach der Übung verworfen. Gespeichert wird nur auf ausdrücklichen
// Wunsch (Vergleichsaufnahmen in der Ablage coachTon, höchstens acht).
// Abgespielt wird über Web Audio (decodeAudioData) – die Sicherheitsrichtlinie des Tools erlaubt keine blob:-Adressen
// für <audio>, und die dekodierten Daten dienen später der Auswertung (Tempo, Pausen).

export const MAX_SEK = 30

export interface Aufgenommen { daten: ArrayBuffer; mime: string; sek: number }

export class Rekorder {
  private strom: MediaStream | null = null
  private rec: MediaRecorder | null = null
  private stuecke: Blob[] = []
  private start = 0
  private uhr: ReturnType<typeof setTimeout> | null = null

  async starte(onAuto?: () => void): Promise<void> {
    this.strom = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported(m)) ?? ''
    this.rec = new MediaRecorder(this.strom, mime ? { mimeType: mime, audioBitsPerSecond: 16000 } : undefined)
    this.stuecke = []
    this.rec.ondataavailable = e => { if (e.data.size) this.stuecke.push(e.data) }
    this.rec.start(250)
    this.start = performance.now()
    this.uhr = setTimeout(() => onAuto?.(), MAX_SEK * 1000)
  }

  stoppe(): Promise<Aufgenommen | null> {
    if (this.uhr) { clearTimeout(this.uhr); this.uhr = null }
    const rec = this.rec
    if (!rec) return Promise.resolve(null)
    return new Promise(fertig => {
      rec.onstop = async () => {
        this.strom?.getTracks().forEach(t => t.stop())
        this.strom = null; this.rec = null
        const blob = new Blob(this.stuecke, { type: rec.mimeType || 'audio/webm' })
        fertig({ daten: await blob.arrayBuffer(), mime: blob.type, sek: Math.min(MAX_SEK, (performance.now() - this.start) / 1000) })
      }
      try { rec.stop() } catch { fertig(null) }
    })
  }

  verwirf(): void {
    if (this.uhr) { clearTimeout(this.uhr); this.uhr = null }
    try { this.rec?.stop() } catch { /* egal */ }
    this.strom?.getTracks().forEach(t => t.stop())
    this.strom = null; this.rec = null; this.stuecke = []
  }
}

let ctx: AudioContext | null = null
let laufend: AudioBufferSourceNode | null = null

/** eine Aufnahme abspielen; löst auf, wenn sie zu Ende ist (oder gestoppt wurde) */
export async function spieleAufnahme(daten: ArrayBuffer): Promise<void> {
  stoppeAufnahme()
  ctx ??= new AudioContext()
  if (ctx.state !== 'running') await ctx.resume().catch(() => undefined)
  const puffer = await ctx.decodeAudioData(daten.slice(0))
  const q = ctx.createBufferSource()
  q.buffer = puffer
  q.connect(ctx.destination)
  laufend = q
  await new Promise<void>(r => { q.onended = () => r(); q.start() })
  if (laufend === q) laufend = null
}
export function stoppeAufnahme(): void { try { laufend?.stop() } catch { /* egal */ } laufend = null }
/** beim Verlassen des Raums: Tonweg freigeben */
export function gibTonFrei(): void { stoppeAufnahme(); void ctx?.close().catch(() => undefined); ctx = null }

export function zuBase64(b: ArrayBuffer): string {
  const u = new Uint8Array(b)
  let s = ''
  for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 32768)))
  return btoa(s)
}
export const ausBase64 = (s: string): ArrayBuffer => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer
