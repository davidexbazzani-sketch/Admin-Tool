// ── Bildschirmaufnahme: gemeinsame Typen + Zugriff auf den Hauptprozess ──────
import type { Probe, Mp4Ziel } from './mp4'

export interface Bildschirm {
  displayId: string
  sourceId: string
  name: string
  bounds: { x: number; y: number; width: number; height: number }
  skalierung: number
  haupt: boolean
}

export interface Effekte {
  /** roter, leuchtender Schweif hinter der Maus */
  schweif: boolean
  /** gelber Leuchtring um die Maus */
  ring: boolean
  /** alles abdunkeln außer einem Kreis um die Maus (Strg+Umschalt+F12) */
  spotlight: boolean
  /** Lupe: Bild vergrößert, folgt der Maus (Strg+Umschalt+F11) */
  lupe: boolean
}

export interface AufnahmeOptionen {
  ordner: string
  bildschirme: Bildschirm[]
  /** true = Aufnahme wechselt mit der Maus den Monitor; false = nur `fest` */
  folgen: boolean
  fest?: string
  aufloesung: '1080' | '720'
  mikrofon: boolean
  mikrofonId?: string
  systemton: boolean
  kamera: boolean
  kameraId?: string
  effekte: Effekte
  /** Einblendung in den ersten Sekunden (leer = keine) */
  titel?: string
  countdown: boolean
  minimieren: boolean
}

export interface VideoSpurMeta { datei: string; breite: number; hoehe: number; codec: string; avcC: number[]; proben: Probe[] }
export interface AudioSpurMeta { datei: string; abtastrate: number; kanaele: number; asc: number[]; bitrate: number; proben: Probe[] }

/** Ergebnis der Aufnahme-Leiste an das Hauptfenster */
export interface AufnahmeErgebnis {
  ordner: string
  dauerMs: number
  bildschirm: VideoSpurMeta
  ton?: AudioSpurMeta
  kamera?: VideoSpurMeta
  hinweise: string[]
  begonnen: string
}

interface AufnahmeApi {
  quellen(): Promise<Bildschirm[]>
  neuerOrdner(): Promise<string>
  starte(o: AufnahmeOptionen): Promise<{ ok: boolean; fehler?: string }>
  optionen(): Promise<AufnahmeOptionen | null>
  fertig(e: AufnahmeErgebnis): Promise<boolean>
  verworfen(ordner?: string): Promise<boolean>
  leisteMinimieren(): Promise<void>
  oeffne(pfad: string): Promise<number>
  anhaengen(id: number, bytes: Uint8Array): Promise<void>
  schreibeBei(id: number, pos: number, bytes: Uint8Array): Promise<void>
  kopiere(id: number, quelle: string, offset: number, laenge: number): Promise<void>
  schliesse(id: number): Promise<{ ok: boolean; bytes?: number; fehler?: string }>
  lese(pfad: string, offset: number, laenge: number): Promise<Uint8Array>
  kopiereDatei(von: string, nach: string): Promise<number>
  loesche(ordner: string): Promise<boolean>
  speichernDialog(vorschlag: string): Promise<string | null>
  imOrdnerZeigen(pfad: string): Promise<void>
  abspielen(pfad: string): Promise<string>
  groesse(pfad: string): Promise<number>
  beiMaus(cb: (m: { x: number; y: number; displayId: string }) => void): () => void
  beiTaste(cb: (t: string) => void): () => void
  beiFertig(cb: (e: AufnahmeErgebnis | null) => void): () => void
}

export const aufnahmeApi = (): AufnahmeApi => (window as unknown as { electronAPI: { aufnahme: AufnahmeApi } }).electronAPI.aufnahme

/** Zieldatei über den Hauptprozess (für den MP4-Schreiber) */
export async function oeffneMp4Ziel(pfad: string): Promise<{ ziel: Mp4Ziel; schliesse: () => Promise<{ ok: boolean; bytes?: number; fehler?: string }> }> {
  const a = aufnahmeApi()
  const id = await a.oeffne(pfad)
  return {
    ziel: {
      schreibe: b => a.anhaengen(id, b),
      schreibeBei: (p, b) => a.schreibeBei(id, p, b),
      kopiere: (d, o, l) => a.kopiere(id, d, o, l),
    },
    schliesse: () => a.schliesse(id),
  }
}

export const pfadIn = (ordner: string, name: string) => ordner.replace(/[\\/]+$/, '') + '\\' + name
export const dauerText = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
