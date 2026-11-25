// Terra Incognita — die aufgedeckte Karte eines Spielers: je Abschnitt (16 × 16 Felder) ein Bitfeld von 32 Byte.
import { abschnittKey, spalte, umkreis, type Feld } from './hex'

export type Karte = Map<string, Uint8Array>

export function kennt(karte: Karte, q: number, r: number): boolean {
  const sp = spalte(q, r)
  const a = karte.get(abschnittKey(sp >> 4, r >> 4))
  if (!a) return false
  const bit = ((r & 15) << 4) | (sp & 15)
  return (a[bit >> 3] & (1 << (bit & 7))) !== 0
}

/** ein Feld aufdecken; true, wenn es neu war */
export function merke(karte: Karte, q: number, r: number): boolean {
  const sp = spalte(q, r)
  const k = abschnittKey(sp >> 4, r >> 4)
  let a = karte.get(k)
  if (!a) { a = new Uint8Array(32); karte.set(k, a) }
  const bit = ((r & 15) << 4) | (sp & 15), maske = 1 << (bit & 7)
  if (a[bit >> 3] & maske) return false
  a[bit >> 3] |= maske
  return true
}

/** alles im Umkreis aufdecken; gibt die neu aufgedeckten Felder zurück */
export function deckeAuf(karte: Karte, q: number, r: number, radius: number): Feld[] {
  const neu: Feld[] = []
  for (const f of umkreis(q, r, radius)) if (merke(karte, f.q, f.r)) neu.push(f)
  return neu
}

export function anzahlFelder(karte: Karte): number {
  let n = 0
  for (const a of karte.values()) for (let i = 0; i < 32; i++) { let b = a[i]; while (b) { n += b & 1; b >>= 1 } }
  return n
}

// ── Speicherform: { "ax_ay": "<Base64 von 32 Byte>" } ──
export function karteZuText(karte: Karte): Record<string, string> {
  const aus: Record<string, string> = {}
  for (const [k, a] of karte) { let s = ''; for (let i = 0; i < 32; i++) s += String.fromCharCode(a[i]); aus[k] = btoa(s) }
  return aus
}

export function karteAusText(roh: unknown): Karte {
  const karte: Karte = new Map()
  if (!roh || typeof roh !== 'object') return karte
  for (const [k, v] of Object.entries(roh as Record<string, unknown>)) {
    if (typeof v !== 'string' || !/^-?\d+_-?\d+$/.test(k)) continue
    try {
      const s = atob(v)
      if (s.length !== 32) continue
      const a = new Uint8Array(32)
      for (let i = 0; i < 32; i++) a[i] = s.charCodeAt(i) & 255
      karte.set(k, a)
    } catch { /* kaputter Eintrag: überspringen */ }
  }
  return karte
}
