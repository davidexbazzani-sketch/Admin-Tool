// ── Bildschirmaufnahme: der Ablauf in der Aufnahme-Leiste ─────────────────────
// Je Monitor ein Bildstrom (nur lesend). 30×/s wird das Bild des Monitors, auf dem die Maus
// gerade ist, in eine Leinwand gezeichnet (beim Wechsel 0,3 s Schieben), Effekte darüber,
// dann H.264 kodiert. Ton: Mikrofon (+ optional Systemton) gemischt → AAC. Kamera: eigene
// Spur, damit sie hinterher frei platziert werden kann. Alles geht sofort in Zwischendateien.

import { aufnahmeApi, pfadIn, type AufnahmeErgebnis, type AufnahmeOptionen, type Bildschirm, type Effekte, type VideoSpurMeta, type AudioSpurMeta } from './typen'
import { zeichneMonitor, zeichneEffekte, zeichneTitel, folgeAnsicht, pflegeSchweif, type Ansicht, type SchweifPunkt } from './effekte'
import type { Probe } from './mp4'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const VideoEncoder: any, AudioEncoder: any, VideoFrame: any, AudioData: any, MediaStreamTrackProcessor: any

export type Status = 'vorbereitung' | 'bereit' | 'laeuft' | 'pause' | 'beendet' | 'fehler'
export interface Zustand { status: Status; ms: number; bildschirm: string; mikroStumm: boolean; effekte: Effekte; hinweis?: string }

const FPS = 30
const KEY_ABSTAND_US = 2_000_000
const WECHSEL_NACH_MS = 250
const WECHSEL_DAUER_MS = 320

interface Monitor { b: Bildschirm; stream: MediaStream; video: HTMLVideoElement }
interface Spurdatei { id: number; pfad: string; pos: number; proben: Probe[] }

/** Passende H.264-Einstellung suchen (High → Main → Baseline). */
async function videoKonfig(w: number, h: number, bitrate: number): Promise<any> {
  for (const codec of ['avc1.640028', 'avc1.4D4028', 'avc1.42E028']) {
    const cfg = { codec, width: w, height: h, bitrate, framerate: FPS, latencyMode: 'realtime', bitrateMode: 'variable', avc: { format: 'avc' } }
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg } catch { /* nächste */ }
  }
  throw new Error('Dieser PC kann kein H.264 kodieren.')
}

export class Aufnahme {
  private o: AufnahmeOptionen
  private melde: (z: Zustand) => void
  private api = aufnahmeApi()
  private monitore: Monitor[] = []
  private W: number
  private H: number
  private leinwand!: OffscreenCanvas
  private g!: OffscreenCanvasRenderingContext2D
  private venc: any = null
  private aenc: any = null
  private kenc: any = null
  private bild!: Spurdatei
  private ton: Spurdatei | null = null
  private kam: Spurdatei | null = null
  private avcC: Uint8Array | null = null
  private kamAvcC: Uint8Array | null = null
  private asc: Uint8Array | null = null
  private kamGroesse = { w: 0, h: 0 }
  private kamCodec = ''
  private vCodec = ''
  private tonInfo = { sr: 48000, ch: 2 }
  private audioCtx: AudioContext | null = null
  private mikroGain: GainNode | null = null
  private leser: any[] = []
  private nebenStroeme: MediaStream[] = []
  kameraStrom: MediaStream | null = null
  private takt: number | null = null
  status: Status = 'vorbereitung'
  private startMs = 0
  private pauseSeit = 0
  private pauseSumme = 0
  private letzteTs = -1
  private letzterKey = -Infinity
  private kamLetzterKey = -Infinity
  private tonStartUs = -1
  private tonSamples = 0
  private maus: { x: number; y: number; displayId: string } | null = null
  private aktiv: string
  private kandidat: { id: string; seit: number } | null = null
  private wechsel: { von: string; nach: string; start: number; richtung: number } | null = null
  private ansicht: Ansicht = { zoom: 1, mitte: { x: 0.5, y: 0.5 } }
  private schweif: SchweifPunkt[] = []
  effekte: Effekte
  private mikroStumm = false
  private verworfen = 0
  private warmBild = false
  private warmKam = false
  private hinweise: string[] = []
  private begonnen = ''

  constructor(o: AufnahmeOptionen, melde: (z: Zustand) => void) {
    this.o = o
    this.melde = melde
    this.effekte = { ...o.effekte }
    this.W = o.aufloesung === '720' ? 1280 : 1920
    this.H = o.aufloesung === '720' ? 720 : 1080
    this.aktiv = (o.folgen ? o.bildschirme.find(b => b.haupt)?.displayId : o.fest) || o.bildschirme[0]?.displayId || ''
  }

  private zustand(hinweis?: string) {
    const b = this.monitore.find(m => m.b.displayId === this.aktiv)?.b
    this.melde({ status: this.status, ms: this.uhrUs() / 1000, bildschirm: b ? b.name : '', mikroStumm: this.mikroStumm, effekte: { ...this.effekte }, hinweis })
  }
  /** Aufnahmezeit in ms (für die Uhr der Leiste) */
  zeitMs(): number { return this.uhrUs() / 1000 }
  /** Aufnahmezeit in µs (Pausen herausgerechnet) */
  private uhrUs(): number {
    if (!this.startMs) return 0
    const jetzt = this.status === 'pause' ? this.pauseSeit : performance.now()
    return Math.max(0, (jetzt - this.startMs - this.pauseSumme) * 1000)
  }

  private async neueDatei(name: string): Promise<Spurdatei> {
    const pfad = pfadIn(this.o.ordner, name)
    return { id: await this.api.oeffne(pfad), pfad, pos: 0, proben: [] }
  }
  private ablegen(d: Spurdatei, chunk: any) {
    const b = new Uint8Array(chunk.byteLength)
    chunk.copyTo(b)
    void this.api.anhaengen(d.id, b)
    d.proben.push({ offset: d.pos, groesse: b.length, ts: chunk.timestamp, dauer: chunk.duration ?? undefined, key: chunk.type === 'key' })
    d.pos += b.length
  }

  /** Ströme öffnen, Kodierer und Dateien vorbereiten (vor dem Countdown). */
  async vorbereiten(): Promise<void> {
    const max = this.o.aufloesung === '720' ? { w: 1920, h: 1200 } : { w: 2560, h: 1600 }
    const ziele = this.o.folgen ? this.o.bildschirme : this.o.bildschirme.filter(b => b.displayId === this.o.fest)
    for (const b of ziele) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: b.sourceId, maxWidth: max.w, maxHeight: max.h, maxFrameRate: FPS } } } as unknown as MediaStreamConstraints)
      const video = document.createElement('video')
      video.muted = true; video.playsInline = true; video.srcObject = stream
      await video.play()
      this.monitore.push({ b, stream, video })
    }
    if (!this.monitore.length) throw new Error('Kein Bildschirm zum Aufnehmen gefunden.')
    if (!this.monitore.some(m => m.b.displayId === this.aktiv)) this.aktiv = this.monitore[0].b.displayId

    this.leinwand = new OffscreenCanvas(this.W, this.H)
    this.g = this.leinwand.getContext('2d', { alpha: false }) as OffscreenCanvasRenderingContext2D
    const vcfg = await videoKonfig(this.W, this.H, this.o.aufloesung === '720' ? 2_500_000 : 4_000_000)
    this.vCodec = vcfg.codec
    this.bild = await this.neueDatei('bildschirm.h264')
    this.venc = new VideoEncoder({
      output: (c: any, m: any) => { if (m?.decoderConfig?.description) this.avcC = new Uint8Array(m.decoderConfig.description); if (!this.warmBild) this.ablegen(this.bild, c) },
      error: (e: any) => { this.hinweise.push('Bild-Kodierer: ' + e.message); this.status = 'fehler'; this.zustand('Fehler beim Kodieren: ' + e.message) },
    })
    this.venc.configure(vcfg)
    // Aufwärmen: der erste Kodiervorgang (Start des Hardware-Kodierers) dauert oft über eine
    // halbe Sekunde — ohne das fehlen am Anfang des Videos Bilder.
    this.g.fillStyle = '#0b0f17'; this.g.fillRect(0, 0, this.W, this.H)
    this.warmBild = true
    try { const f = new VideoFrame(this.leinwand, { timestamp: 0 }); this.venc.encode(f, { keyFrame: true }); f.close(); await this.venc.flush() }
    finally { this.warmBild = false }

    // Ton: Mikrofon und/oder Systemton gemischt
    if (this.o.mikrofon || this.o.systemton) {
      try {
        this.audioCtx = new AudioContext({ sampleRate: 48000 })
        await this.audioCtx.resume()
        const ziel = this.audioCtx.createMediaStreamDestination()
        if (this.o.mikrofon) {
          const mik = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: this.o.mikrofonId ? { exact: this.o.mikrofonId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
          this.nebenStroeme.push(mik)
          this.mikroGain = this.audioCtx.createGain()
          this.audioCtx.createMediaStreamSource(mik).connect(this.mikroGain).connect(ziel)
        }
        if (this.o.systemton) {
          try {
            const sys = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop' } }, video: { mandatory: { chromeMediaSource: 'desktop' } } } as unknown as MediaStreamConstraints)
            sys.getVideoTracks().forEach(t => t.stop())
            this.nebenStroeme.push(sys)
            this.audioCtx.createMediaStreamSource(new MediaStream(sys.getAudioTracks())).connect(ziel)
          } catch (e) { this.hinweise.push('Systemton nicht verfügbar: ' + (e as Error).message) }
        }
        this.ton = await this.neueDatei('ton.aac')
        this.aenc = new AudioEncoder({
          output: (c: any, m: any) => { if (m?.decoderConfig?.description) this.asc = new Uint8Array(m.decoderConfig.description); this.ablegen(this.ton!, c) },
          error: (e: any) => { this.hinweise.push('Ton-Kodierer: ' + e.message); this.aenc = null },
        })
        const spur = ziel.stream.getAudioTracks()[0]
        const leser = new MediaStreamTrackProcessor({ track: spur }).readable.getReader()
        this.leser.push(leser)
        void this.tonSchleife(leser)
      } catch (e) {
        this.hinweise.push('Ton nicht verfügbar: ' + (e as Error).message)
        this.aenc = null; this.ton = null
      }
    }

    // Kamera (Selbstaufnahme) als eigene Spur
    if (this.o.kamera) {
      try {
        this.kameraStrom = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: this.o.kameraId ? { exact: this.o.kameraId } : undefined, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: FPS } } })
        this.nebenStroeme.push(this.kameraStrom)
        this.kam = await this.neueDatei('kamera.h264')
        const spur = this.kameraStrom.getVideoTracks()[0].clone()
        const leser = new MediaStreamTrackProcessor({ track: spur }).readable.getReader()
        this.leser.push(leser)
        // Erstes Kamerabild abwarten: Größe festlegen, Kodierer einrichten und aufwärmen
        const erstes = await Promise.race([leser.read(), new Promise(r => setTimeout(() => r(null), 5000))]) as { value?: any; done?: boolean } | null
        if (!erstes?.value) throw new Error('Kamera liefert kein Bild.')
        const f0 = erstes.value
        try {
          const w = f0.displayWidth & ~1, h = f0.displayHeight & ~1
          this.kamGroesse = { w, h }
          const cfg = await videoKonfig(w, h, 1_200_000)
          this.kamCodec = cfg.codec
          this.kenc = new VideoEncoder({
            output: (c: any, m: any) => { if (m?.decoderConfig?.description) this.kamAvcC = new Uint8Array(m.decoderConfig.description); if (!this.warmKam && this.kam) this.ablegen(this.kam, c) },
            error: (e: any) => { this.hinweise.push('Kamera-Kodierer: ' + e.message); this.kam = null },
          })
          this.kenc.configure(cfg)
          this.warmKam = true
          const wf = new VideoFrame(f0, { timestamp: 0 }); this.kenc.encode(wf, { keyFrame: true }); wf.close()
          await this.kenc.flush()
        } finally { this.warmKam = false; f0.close() }
        void this.kameraSchleife(leser)
      } catch (e) {
        this.hinweise.push('Kamera nicht verfügbar: ' + (e as Error).message)
        if (this.kam) await this.api.schliesse(this.kam.id).catch(() => {})
        try { this.kenc?.close() } catch { /* egal */ }
        this.kam = null; this.kenc = null
      }
    }
    this.status = 'bereit'
    this.zustand()
  }

  starte(): void {
    if (this.status !== 'bereit') return
    this.begonnen = new Date().toISOString()
    this.startMs = performance.now()
    this.status = 'laeuft'
    this.takt = window.setInterval(() => this.bildTakt(), 1000 / FPS)
    this.zustand()
  }
  pause(): void {
    if (this.status === 'laeuft') { this.status = 'pause'; this.pauseSeit = performance.now() }
    else if (this.status === 'pause') { this.pauseSumme += performance.now() - this.pauseSeit; this.status = 'laeuft' }
    this.zustand()
  }
  schalte(was: keyof Effekte): void { this.effekte[was] = !this.effekte[was]; this.zustand() }
  stumm(an: boolean): void { this.mikroStumm = an; if (this.mikroGain) this.mikroGain.gain.value = an ? 0 : 1; this.zustand() }
  setzeMaus(m: { x: number; y: number; displayId: string }): void { this.maus = m }

  // ── 30×/s: Bild zusammensetzen und kodieren ─────────────────────────────────
  private bildTakt(): void {
    if (this.status !== 'laeuft' || !this.venc) return
    const jetzt = performance.now()
    const m = this.maus
    // Monitorwechsel: erst wenn die Maus 250 ms auf dem anderen Monitor bleibt
    if (this.o.folgen && m && m.displayId !== this.aktiv && this.monitore.some(x => x.b.displayId === m.displayId)) {
      if (!this.kandidat || this.kandidat.id !== m.displayId) this.kandidat = { id: m.displayId, seit: jetzt }
      else if (jetzt - this.kandidat.seit >= WECHSEL_NACH_MS) {
        const von = this.monitore.find(x => x.b.displayId === this.aktiv)!.b, nach = this.monitore.find(x => x.b.displayId === m.displayId)!.b
        const dx = (nach.bounds.x + nach.bounds.width / 2) - (von.bounds.x + von.bounds.width / 2)
        const dy = (nach.bounds.y + nach.bounds.height / 2) - (von.bounds.y + von.bounds.height / 2)
        this.wechsel = { von: this.aktiv, nach: m.displayId, start: jetzt, richtung: Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) || 1 : Math.sign(dy) || 1 }
        this.aktiv = m.displayId
        this.kandidat = null
        this.ansicht = { zoom: this.ansicht.zoom, mitte: { x: 0.5, y: 0.5 } }
        this.zustand()
      }
    } else this.kandidat = null

    const mon = this.monitore.find(x => x.b.displayId === this.aktiv)!
    const rel = m && m.displayId === this.aktiv ? { x: (m.x - mon.b.bounds.x) / mon.b.bounds.width, y: (m.y - mon.b.bounds.y) / mon.b.bounds.height } : null
    this.ansicht = folgeAnsicht(this.ansicht, { zoom: this.effekte.lupe ? 2 : 1, x: rel?.x ?? this.ansicht.mitte.x, y: rel?.y ?? this.ansicht.mitte.y })
    this.schweif = pflegeSchweif(this.schweif, rel ? { x: rel.x, y: rel.y, t: jetzt, display: this.aktiv } : null, jetzt)

    const g = this.g, W = this.W, H = this.H
    g.fillStyle = '#0b0f17'; g.fillRect(0, 0, W, H)
    const w = this.wechsel
    let abbild: ((rx: number, ry: number) => { x: number; y: number }) | null = null
    if (w && jetzt - w.start < WECHSEL_DAUER_MS) {
      const p = (jetzt - w.start) / WECHSEL_DAUER_MS, e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
      const alt = this.monitore.find(x => x.b.displayId === w.von)
      if (alt) zeichneMonitor(g, alt.video, W, H, -w.richtung * e * W)
      abbild = zeichneMonitor(g, mon.video, W, H, w.richtung * (1 - e) * W, this.ansicht)
      abbild = null   // während des Schiebens keine Effekte
    } else {
      this.wechsel = null
      abbild = zeichneMonitor(g, mon.video, W, H, 0, this.ansicht)
    }
    if (abbild) {
      const maus = rel ? abbild(rel.x, rel.y) : null
      const schweif = this.schweif.filter(p => p.display === this.aktiv).map(p => ({ ...abbild!(p.x, p.y), alter: Math.min(1, (jetzt - p.t) / 520) }))
      zeichneEffekte(g, W, H, this.effekte, maus, schweif, jetzt)
    }
    const ts = Math.round(this.uhrUs())
    if (this.o.titel) zeichneTitel(g, W, H, this.o.titel, `IT · SKF Marine · ${new Date(this.begonnen).toLocaleDateString('de-DE')}`, ts / 1000)

    if (this.venc.encodeQueueSize > 8 || ts <= this.letzteTs) { this.verworfen++; return }
    const key = ts - this.letzterKey >= KEY_ABSTAND_US
    if (key) this.letzterKey = ts
    this.letzteTs = ts
    const f = new VideoFrame(this.leinwand, { timestamp: ts })
    try { this.venc.encode(f, { keyFrame: key }) } finally { f.close() }
  }

  // ── Ton: Abtastwerte zählen statt Uhrzeit → lückenlos, Pausen fallen heraus ─
  private async tonSchleife(leser: any): Promise<void> {
    for (;;) {
      let r: any
      try { r = await leser.read() } catch { break }
      if (r.done) break
      const ad = r.value
      if (this.status !== 'laeuft' || !this.aenc) { ad.close(); continue }
      try {
        if (this.aenc.state === 'unconfigured') {
          this.tonInfo = { sr: ad.sampleRate, ch: Math.min(2, ad.numberOfChannels) }
          this.aenc.configure({ codec: 'mp4a.40.2', sampleRate: ad.sampleRate, numberOfChannels: this.tonInfo.ch, bitrate: 128_000 })
          this.tonStartUs = this.uhrUs()
          this.tonSamples = 0
        }
        const n = ad.numberOfFrames, ch = this.tonInfo.ch
        const daten = new Float32Array(n * ch)
        for (let c = 0; c < ch; c++) ad.copyTo(daten.subarray(c * n, (c + 1) * n), { planeIndex: c, format: 'f32-planar' })
        const ts = Math.round(this.tonStartUs + this.tonSamples / this.tonInfo.sr * 1e6)
        this.tonSamples += n
        const neu = new AudioData({ format: 'f32-planar', sampleRate: this.tonInfo.sr, numberOfFrames: n, numberOfChannels: ch, timestamp: ts, data: daten })
        this.aenc.encode(neu); neu.close()
      } catch (e) { this.hinweise.push('Ton: ' + (e as Error).message) }
      finally { ad.close() }
    }
  }

  // ── Kamera: eigene Spur mit Aufnahmezeit ────────────────────────────────────
  private async kameraSchleife(leser: any): Promise<void> {
    for (;;) {
      let r: any
      try { r = await leser.read() } catch { break }
      if (r.done) break
      const f = r.value
      if (this.status !== 'laeuft' || !this.kam || !this.kenc) { f.close(); continue }
      try {
        if (this.kenc.encodeQueueSize > 6) continue
        const ts = Math.round(this.uhrUs())
        const key = ts - this.kamLetzterKey >= KEY_ABSTAND_US
        if (key) this.kamLetzterKey = ts
        const nf = new VideoFrame(f, { timestamp: ts })
        try { this.kenc.encode(nf, { keyFrame: key }) } finally { nf.close() }
      } catch (e) { this.hinweise.push('Kamera: ' + (e as Error).message) }
      finally { f.close() }
    }
  }

  private async aufraeumen(): Promise<void> {
    if (this.takt) { clearInterval(this.takt); this.takt = null }
    for (const l of this.leser) { try { await l.cancel() } catch { /* egal */ } }
    for (const m of this.monitore) m.stream.getTracks().forEach(t => t.stop())
    for (const s of this.nebenStroeme) s.getTracks().forEach(t => t.stop())
    try { await this.audioCtx?.close() } catch { /* egal */ }
  }

  /** Beenden: Kodierer leeren, Dateien schließen, Ergebnis für das Hauptfenster. */
  async stoppe(): Promise<AufnahmeErgebnis> {
    if (this.status === 'pause') this.pause()
    const dauerMs = this.uhrUs() / 1000
    this.status = 'beendet'
    this.zustand()
    await this.aufraeumen()
    const leere = async (e: any) => { try { if (e && e.state === 'configured') await e.flush() } catch { /* egal */ } try { e?.close() } catch { /* egal */ } }
    await leere(this.venc); await leere(this.aenc); await leere(this.kenc)
    const zu = async (d: Spurdatei | null) => { if (!d) return null; const r = await this.api.schliesse(d.id); if (!r.ok) throw new Error('Zwischendatei: ' + r.fehler); return d }
    await zu(this.bild); const ton = await zu(this.ton); const kam = await zu(this.kam)
    if (!this.bild.proben.length || !this.avcC) throw new Error('Es wurde kein Bild aufgenommen.')
    if (this.verworfen > 30) this.hinweise.push(`${this.verworfen} Bilder ausgelassen (PC war ausgelastet).`)
    const bildschirm: VideoSpurMeta = { datei: this.bild.pfad, breite: this.W, hoehe: this.H, codec: this.vCodec, avcC: Array.from(this.avcC), proben: this.bild.proben }
    const tonMeta: AudioSpurMeta | undefined = ton && ton.proben.length && this.asc ? { datei: ton.pfad, abtastrate: this.tonInfo.sr, kanaele: this.tonInfo.ch, asc: Array.from(this.asc), bitrate: 128_000, proben: ton.proben } : undefined
    const kamMeta: VideoSpurMeta | undefined = kam && kam.proben.length && this.kamAvcC ? { datei: kam.pfad, breite: this.kamGroesse.w, hoehe: this.kamGroesse.h, codec: this.kamCodec, avcC: Array.from(this.kamAvcC), proben: kam.proben } : undefined
    return { ordner: this.o.ordner, dauerMs, bildschirm, ton: tonMeta, kamera: kamMeta, hinweise: this.hinweise, begonnen: this.begonnen }
  }

  async verwerfe(): Promise<void> {
    this.status = 'beendet'
    await this.aufraeumen()
    for (const e of [this.venc, this.aenc, this.kenc]) { try { e?.close() } catch { /* egal */ } }
    for (const d of [this.bild, this.ton, this.kam]) if (d) await this.api.schliesse(d.id).catch(() => {})
  }
}
