// Terra Incognita — die Hülle jeder öffentlichen Datei: Art, Benutzer, laufende Nummer, Version, Inhalt, Siegel.
//
// Das Siegel (HMAC-SHA256 mit einem Schlüssel aus dem Tool) verhindert, dass jemand eine Datei von Hand bearbeitet,
// umbenennt (Annas Datei unter Berts Namen) oder eine alte wieder einspielt. Es ist KEIN Schutz gegen jemanden, der
// den Quelltext des Tools kennt.
// Der Inhalt steht als Text in der Hülle: So ist eindeutig, worüber das Siegel gerechnet wurde.

/** Version, die dieses Tool schreibt (2 = Stufe 3). Liest ein Tool sein EIGENES Buch mit höherer Version, weiß es, dass
 *  auf einem anderen PC ein neueres Tool läuft — dann veröffentlicht und verbucht es nichts mehr (siehe gemeinsam.ts). */
export const PV = 2
/** diese Version muss ein Tool mindestens haben, um zu verstehen, was dieses Tool schreibt */
export const AB = 1

export interface Huelle {
  art: string
  u: string
  rev: number
  /** Version des Schreibers */
  pv: number
  /** älteste Version, die den Inhalt verstehen darf */
  ab: number
  /** Inhalt als JSON-Text */
  p: string
  /** Siegel */
  s: string
}

/** So groß darf der Inhalt einer Hülle höchstens sein (Zeichen). Öffentliche Dateien sind klein; die Sicherung trägt
 *  den ganzen Spielstand samt Karte (nach einem Jahr Spielzeit rund 1 MB) und bekommt deshalb viel Luft. */
const GRENZE: Record<string, number> = { sicherung: 12 * 1024 * 1024 }
const GRENZE_SONST = 64 * 1024

const GEHEIM = 'Terra Incognita · Siegel der Kartographen-Gilde zu Hamburg · 1789'
let schluessel: Promise<CryptoKey> | null = null
function hole(): Promise<CryptoKey> {
  schluessel ??= crypto.subtle.importKey('raw', new TextEncoder().encode(GEHEIM), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return schluessel
}
async function siegel(art: string, u: string, rev: number, pv: number, ab: number, p: string): Promise<string> {
  const daten = new TextEncoder().encode(`${art}|${u}|${rev}|${pv}|${ab}|${p}`)
  const roh = new Uint8Array(await crypto.subtle.sign('HMAC', await hole(), daten))
  let s = ''
  for (const b of roh) s += b.toString(16).padStart(2, '0')
  return s
}

export async function versiegle(art: string, u: string, rev: number, inhalt: unknown, pv: number = PV, ab: number = AB): Promise<Huelle> {
  const p = JSON.stringify(inhalt)
  return { art, u, rev, pv, ab, p, s: await siegel(art, u, rev, pv, ab, p) }
}

export type Geoeffnet<T> = { ok: true; inhalt: T; rev: number; u: string; pv: number } | { ok: false; grund: 'kaputt' | 'siegel' | 'fremd' | 'neuer' }

/** Hülle prüfen und öffnen. `erwartet` muss zu dem passen, was der Dateiname sagt. */
export async function oeffne<T>(roh: unknown, erwartet: { art: string; u?: string; rev?: number }): Promise<Geoeffnet<T>> {
  try {
    const h = roh as Partial<Huelle> | null
    if (!h || typeof h !== 'object' || typeof h.art !== 'string' || typeof h.u !== 'string' || typeof h.rev !== 'number' || typeof h.p !== 'string' || typeof h.s !== 'string' || typeof h.pv !== 'number' || typeof h.ab !== 'number') return { ok: false, grund: 'kaputt' }
    if (h.p.length > (GRENZE[h.art] ?? GRENZE_SONST)) return { ok: false, grund: 'kaputt' }
    if (h.art !== erwartet.art || (erwartet.u !== undefined && h.u !== erwartet.u) || (erwartet.rev !== undefined && h.rev !== erwartet.rev)) return { ok: false, grund: 'fremd' }
    if ((await siegel(h.art, h.u, h.rev, h.pv, h.ab, h.p)) !== h.s) return { ok: false, grund: 'siegel' }
    if (h.ab > PV) return { ok: false, grund: 'neuer' }
    return { ok: true, inhalt: JSON.parse(h.p) as T, rev: h.rev, u: h.u, pv: h.pv }
  } catch { return { ok: false, grund: 'kaputt' } }
}

// ── Verschlüsselung der Sicherung (AES-GCM). Schlüssel aus dem Tool + Benutzername: schützt vor neugierigen
//    Blicken auf dem Netzlaufwerk, nicht vor jemandem mit dem Quelltext. ──
async function sicherungsSchluessel(u: string): Promise<CryptoKey> {
  const roh = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${GEHEIM}|Sicherung|${u}`))
  return crypto.subtle.importKey('raw', roh, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
const zuB64 = (a: Uint8Array): string => { let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s) }
const vonB64 = (t: string): Uint8Array => { const s = atob(t), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a }

export async function verschluessle(u: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const geheim = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sicherungsSchluessel(u), new TextEncoder().encode(text)))
  const alles = new Uint8Array(12 + geheim.length)
  alles.set(iv, 0); alles.set(geheim, 12)
  return zuB64(alles)
}
export async function entschluessle(u: string, b64: string): Promise<string | null> {
  try {
    const alles = vonB64(b64)
    const klar = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: alles.slice(0, 12) as BufferSource }, await sicherungsSchluessel(u), alles.slice(12) as BufferSource)
    return new TextDecoder().decode(klar)
  } catch { return null }
}
