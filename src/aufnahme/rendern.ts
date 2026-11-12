// ── Aufnahme → fertige MP4 (optional mit Kamera-Blase) ────────────────────────
// Ohne Kamera: Bild- und Tonspur werden nur verpackt (schnell, keine Qualitätsverluste).
// Mit Kamera: Bildschirm und Kamera werden dekodiert, die Blase an der gewählten Stelle
// eingezeichnet und das Ergebnis neu kodiert — Bild für Bild, nie alles im Speicher.
// Alles im Fenster des Tools (WebCodecs), ohne Zusatzprogramm, ohne Netz.

import { aufnahmeApi, pfadIn, oeffneMp4Ziel, type AufnahmeErgebnis, type VideoSpurMeta, type AudioSpurMeta } from './typen'
import { schreibeMp4, type Spur, type Probe, type Mp4Ergebnis } from './mp4'
import { zeichneKamera, type KameraPlatz } from './effekte'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const VideoDecoder: any, VideoEncoder: any, VideoFrame: any, EncodedVideoChunk: any

type Lesen = (pfad: string, offset: number, laenge: number) => Promise<Uint8Array>
const BLOCK = 4 * 1024 * 1024
const KEY_ABSTAND_US = 2_000_000

/** Liest eine Zwischendatei der Reihe nach in 4-MB-Blöcken (wenige Aufrufe zum Hauptprozess). */
class BlockLeser {
  private start = 0
  private daten: Uint8Array | null = null
  constructor(private pfad: string, private lese: Lesen) {}
  async hole(offset: number, laenge: number): Promise<Uint8Array> {
    if (!this.daten || offset < this.start || offset + laenge > this.start + this.daten.length) {
      this.daten = await this.lese(this.pfad, offset, Math.max(laenge, BLOCK))
      this.start = offset
      if (this.daten.length < laenge) throw new Error('Zwischendatei kürzer als erwartet.')
    }
    return this.daten.subarray(offset - this.start, offset - this.start + laenge)
  }
}

/** Eine H.264-Spur Bild für Bild dekodieren (vorausschauend, höchstens wenige Bilder im Speicher). */
export class DekodierStrom {
  private dec: any
  private bilder: any[] = []
  private i = 0
  private geflusht = false
  private fehler: Error | null = null
  private wecker: (() => void) | null = null
  private leser: BlockLeser
  private aktuell: any = null
  private vorschau: any = null
  private ende = false

  constructor(private meta: { codec: string; breite: number; hoehe: number; avcC: number[]; proben: Probe[]; datei: string }, lese: Lesen) {
    this.leser = new BlockLeser(meta.datei, lese)
    this.dec = new VideoDecoder({
      output: (f: any) => { this.bilder.push(f); this.wecke() },
      error: (e: any) => { this.fehler = e instanceof Error ? e : new Error(String(e?.message || e)); this.wecke() },
    })
    this.dec.configure({ codec: meta.codec, codedWidth: meta.breite, codedHeight: meta.hoehe, description: new Uint8Array(meta.avcC), optimizeForLatency: true })
  }
  private wecke() { const w = this.wecker; this.wecker = null; w?.() }
  private warte(ms: number) { return new Promise<void>(r => { this.wecker = r; setTimeout(r, ms) }) }

  private async fuettere(): Promise<void> {
    const p = this.meta.proben[this.i++]
    const daten = await this.leser.hole(p.offset, p.groesse)
    this.dec.decode(new EncodedVideoChunk({ type: p.key ? 'key' : 'delta', timestamp: p.ts, duration: p.dauer, data: daten }))
  }

  /** Nächstes Bild in Reihenfolge; null = Spur zu Ende. Der Aufrufer schließt das Bild. */
  async naechstes(): Promise<any | null> {
    for (;;) {
      if (this.fehler) throw this.fehler
      if (this.bilder.length) return this.bilder.shift()
      if (this.i < this.meta.proben.length) {
        while (this.i < this.meta.proben.length && this.dec.decodeQueueSize < 4 && !this.bilder.length) await this.fuettere()
        if (!this.bilder.length) await this.warte(40)
        continue
      }
      if (!this.geflusht) { this.geflusht = true; await this.dec.flush(); continue }
      return null
    }
  }

  /**
   * Für die Kamera: das letzte Bild mit Zeitstempel ≤ ts (bleibt gültig bis zum nächsten Aufruf).
   * Vor dem ersten Kamerabild (Kamera setzt Sekundenbruchteile später ein) gilt schon das erste.
   */
  async bis(ts: number): Promise<any | null> {
    for (;;) {
      if (!this.vorschau && !this.ende) { this.vorschau = await this.naechstes(); if (!this.vorschau) this.ende = true }
      if (this.vorschau && this.vorschau.timestamp <= ts) { this.aktuell?.close(); this.aktuell = this.vorschau; this.vorschau = null; continue }
      return this.aktuell ?? this.vorschau
    }
  }

  schliesse(): void {
    for (const f of [...this.bilder, this.aktuell, this.vorschau]) { try { f?.close() } catch { /* egal */ } }
    this.bilder = []; this.aktuell = null; this.vorschau = null
    try { if (this.dec.state !== 'closed') this.dec.close() } catch { /* egal */ }
  }
}

async function kodiererKonfig(w: number, h: number, bitrate: number): Promise<any> {
  for (const codec of ['avc1.640028', 'avc1.4D4028', 'avc1.42E028']) {
    // „realtime“ = keine B-Frames → Zeitstempel bleiben in Reihenfolge (so erwartet es mp4.ts)
    const cfg = { codec, width: w, height: h, bitrate, framerate: 30, latencyMode: 'realtime', bitrateMode: 'variable', avc: { format: 'avc' } }
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg } catch { /* nächste */ }
  }
  throw new Error('Dieser PC kann kein H.264 kodieren.')
}

export interface Abbruch { abgebrochen: boolean }

/**
 * Bildschirmspur + Kamera-Blase → neue Bildspur (Zwischendatei `mit-kamera.h264`).
 * `fortschritt(0..1)` nach jedem Bild.
 */
export async function rendereMitKamera(erg: AufnahmeErgebnis, platz: KameraPlatz, fortschritt?: (anteil: number) => void, abbruch?: Abbruch): Promise<VideoSpurMeta> {
  const api = aufnahmeApi()
  const b = erg.bildschirm, k = erg.kamera
  if (!k) throw new Error('Keine Kameraspur vorhanden.')
  const lese: Lesen = (p, o, l) => api.lese(p, o, l)
  const bild = new DekodierStrom(b, lese)
  const kam = new DekodierStrom(k, lese)
  const W = b.breite, H = b.hoehe
  const leinwand = new OffscreenCanvas(W, H)
  const g = leinwand.getContext('2d', { alpha: false }) as OffscreenCanvasRenderingContext2D
  const cfg = await kodiererKonfig(W, H, H <= 720 ? 2_800_000 : 4_500_000)
  const pfad = pfadIn(erg.ordner, 'mit-kamera.h264')
  const id = await api.oeffne(pfad)
  const proben: Probe[] = []
  let pos = 0
  let avcC: Uint8Array | null = null
  let encFehler: Error | null = null
  const enc = new VideoEncoder({
    output: (c: any, m: any) => {
      if (m?.decoderConfig?.description) avcC = new Uint8Array(m.decoderConfig.description)
      const d = new Uint8Array(c.byteLength); c.copyTo(d)
      void api.anhaengen(id, d)
      proben.push({ offset: pos, groesse: d.length, ts: c.timestamp, dauer: c.duration ?? undefined, key: c.type === 'key' })
      pos += d.length
    },
    error: (e: any) => { encFehler = e instanceof Error ? e : new Error(String(e?.message || e)) },
  })
  enc.configure(cfg)
  const gesamt = b.proben.length
  let n = 0, letzterKey = -Infinity
  try {
    for (;;) {
      if (abbruch?.abgebrochen) throw new Error('abgebrochen')
      if (encFehler) throw encFehler
      const f = await bild.naechstes()
      if (!f) break
      try {
        const ts = f.timestamp as number
        g.drawImage(f, 0, 0, W, H)
        const kf = await kam.bis(ts)
        if (kf) zeichneKamera(g, kf, W, H, platz)
        // Kodierer nicht überfluten (sonst wächst der Speicher)
        while (enc.encodeQueueSize > 3) await new Promise(r => setTimeout(r, 4))
        const key = ts - letzterKey >= KEY_ABSTAND_US
        if (key) letzterKey = ts
        const neu = new VideoFrame(leinwand, { timestamp: ts, duration: f.duration ?? undefined })
        try { enc.encode(neu, { keyFrame: key }) } finally { neu.close() }
      } finally { f.close() }
      n++
      if (n % 10 === 0) fortschritt?.(n / gesamt)
    }
    await enc.flush()
    if (encFehler) throw encFehler
  } finally {
    bild.schliesse(); kam.schliesse()
    try { if (enc.state !== 'closed') enc.close() } catch { /* egal */ }
    const r = await api.schliesse(id)
    if (!r.ok && !abbruch?.abgebrochen) throw new Error('Zwischendatei: ' + r.fehler)
  }
  if (!proben.length || !avcC) throw new Error('Beim Einrechnen der Kamera ist kein Bild entstanden.')
  fortschritt?.(1)
  return { datei: pfad, breite: W, hoehe: H, codec: cfg.codec, avcC: Array.from(avcC as Uint8Array), proben }
}

const alsVideo = (m: VideoSpurMeta): Spur => ({ art: 'video', datei: m.datei, breite: m.breite, hoehe: m.hoehe, codec: m.codec, avcC: new Uint8Array(m.avcC), proben: m.proben })
const alsTon = (m: AudioSpurMeta): Spur => ({ art: 'audio', datei: m.datei, abtastrate: m.abtastrate, kanaele: m.kanaele, asc: new Uint8Array(m.asc), bitrate: m.bitrate, proben: m.proben })

/** Spuren in eine MP4 schreiben (Ziel muss im Zwischenordner liegen oder im Speichern-Dialog gewählt sein). */
export async function verpacke(ziel: string, video: VideoSpurMeta, ton: AudioSpurMeta | undefined, fortschritt?: (anteil: number) => void): Promise<Mp4Ergebnis> {
  const { ziel: z, schliesse } = await oeffneMp4Ziel(ziel)
  let erg: Mp4Ergebnis
  try { erg = await schreibeMp4([alsVideo(video), ...(ton ? [alsTon(ton)] : [])], z, fortschritt) }
  catch (e) { await schliesse().catch(() => {}); throw e }
  const r = await schliesse()
  if (!r.ok) throw new Error('Schreiben fehlgeschlagen: ' + (r.fehler || 'unbekannt'))
  return erg
}

/** Vorschau-Dateien im Zwischenordner: Bildschirm+Ton und (falls vorhanden) die Kamera allein. */
export async function baueVorschau(erg: AufnahmeErgebnis): Promise<{ bildschirm: string; kamera?: string; kameraVersatzS: number }> {
  const bildschirm = pfadIn(erg.ordner, 'vorschau.mp4')
  await verpacke(bildschirm, erg.bildschirm, erg.ton)
  let kamera: string | undefined
  let kameraVersatzS = 0
  if (erg.kamera?.proben.length) {
    kamera = pfadIn(erg.ordner, 'vorschau-kamera.mp4')
    await verpacke(kamera, erg.kamera, undefined)
    // Film der Vorschau beginnt beim frühesten Stück (Bild oder Ton) — die Kamera setzt später ein
    const filmStart = Math.min(erg.bildschirm.proben[0].ts, erg.ton?.proben[0]?.ts ?? Infinity)
    kameraVersatzS = (erg.kamera.proben[0].ts - filmStart) / 1e6
  }
  return { bildschirm, kamera, kameraVersatzS }
}

/**
 * Endgültige Datei schreiben. Ohne Kamera-Blase: Vorschau kopieren (identisch).
 * Mit Blase: einrechnen (0…90 %), dann verpacken (90…100 %).
 */
export async function speichereVideo(erg: AufnahmeErgebnis, ziel: string, platz: KameraPlatz | null, fortschritt?: (anteil: number, schritt: string) => void, abbruch?: Abbruch): Promise<number> {
  const api = aufnahmeApi()
  if (!platz || !erg.kamera) {
    fortschritt?.(0.5, 'Datei wird gespeichert …')
    const bytes = await api.kopiereDatei(pfadIn(erg.ordner, 'vorschau.mp4'), ziel)
    fortschritt?.(1, 'Gespeichert')
    return bytes
  }
  const video = await rendereMitKamera(erg, platz, a => fortschritt?.(a * 0.9, 'Kamera wird ins Video eingerechnet …'), abbruch)
  const r = await verpacke(ziel, video, erg.ton, a => fortschritt?.(0.9 + a * 0.1, 'Datei wird geschrieben …'))
  fortschritt?.(1, 'Gespeichert')
  return r.bytes
}
