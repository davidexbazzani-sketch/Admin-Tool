// Der Coach — Aufnahme auswerten und (auf Wunsch) Vergleichsaufnahmen ablegen.
// Dekodiert über einen OfflineAudioContext mit 8 kHz (reicht für Pegel und Grundton, spart Rechenzeit) und rechnet
// im nächsten Takt, damit die Oberfläche nicht hängt. Töne verlassen den PC nie; gespeichert wird verschlüsselt (coachTon).
import { analysiere, type Messung } from '../kern/mikro/analyse'
import type { Aufnahme, CoachTon, SprechMessung } from '../kern/typen'
import { MAX_AUFNAHMEN, leererTon } from '../kern/typen'
import { pruefeTon } from '../kern/uebergang'
import { useCoach } from '../kern/speicher'
import { heute, tagNummer } from '../kern/zeit'
import { host } from '../host/aktiv'
import { zuBase64, type Aufgenommen } from './aufnahme'

const RATE = 8000

export async function miss(daten: ArrayBuffer, silben?: number): Promise<Messung | null> {
  try {
    const ctx = new OfflineAudioContext(1, RATE, RATE)
    const puffer = await ctx.decodeAudioData(daten.slice(0))
    const x = puffer.getChannelData(0)
    await new Promise(r => setTimeout(r, 0))
    return analysiere(x, puffer.sampleRate, silben)
  } catch { return null }
}

/** Messwerte merken: Startaufnahme bleibt immer, sonst die letzten 40 */
export function merkeMessung(art: SprechMessung['art'], m: Messung, text?: string): void {
  const tag = tagNummer(heute())
  useCoach.getState().aendere(d => {
    const neu: SprechMessung = { tag, art, ...(text ? { text } : {}), m }
    const start = d.messungen.filter(x => x.art === 'start').slice(-1)
    const andere = d.messungen.filter(x => x.art !== 'start')
    return { ...d, messungen: art === 'start' ? [neu, ...andere.slice(-40)] : [...start, ...[...andere, neu].slice(-40)] }
  })
}

export const startMessung = (): SprechMessung | undefined => useCoach.getState().daten.messungen.find(x => x.art === 'start')

export async function ladeTon(): Promise<CoachTon> {
  const b = host().benutzer()
  const r = await host().ablage('coachTon').laden(b).catch(() => null)
  if (!r?.ok || !r.daten) return leererTon(b)
  try { const p = pruefeTon(JSON.parse(r.daten), b); return p.daten ?? leererTon(b) } catch { return leererTon(b) }
}

/** Aufnahme verschlüsselt ablegen (nur mit Schalter „Vergleichsaufnahmen behalten“); die Startaufnahme wird nie verdrängt */
export async function legeAufnahmeAb(a: Aufgenommen, art: Aufnahme['art'], titel: string): Promise<boolean> {
  if (!useCoach.getState().daten.profil.aufnahmenBehalten) return false
  const b = host().benutzer()
  const ton = await ladeTon()
  const neu: Aufnahme = { id: `ton-${Date.now().toString(36)}`, art, tag: tagNummer(heute()), sek: Math.round(a.sek), mime: a.mime, daten: zuBase64(a.daten), titel }
  const start = art === 'start' ? [] : ton.aufnahmen.filter(x => x.art === 'start').slice(-1)
  const andere = ton.aufnahmen.filter(x => x.art !== 'start')
  const aufnahmen = art === 'start' ? [neu, ...andere].slice(-MAX_AUFNAHMEN) : [...start, ...[...andere, neu].slice(-(MAX_AUFNAHMEN - start.length))]
  const r = await host().ablage('coachTon').speichern(b, JSON.stringify({ ...ton, aufnahmen })).catch(() => ({ ok: false }))
  return r.ok
}
