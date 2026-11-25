// Der Coach — Kurse und Staffel.
// Ein Kurs ist ein Bereich (oder ein Schwerpunkt in aussprache) mit festem Kursplan aus Lerntagen. Fortschritt ist die
// MENGE erledigter Lerntag-Kennungen — so lassen sich später Lerntage ergänzen, ohne Lernstände zu brechen.
// Staffel: nur so viele Bereiche bekommen gleichzeitig neue Lerntage, wie es zur Tagesdauer passt; die übrigen gewählten
// laufen über Wiederholungen mit und rücken nach, sobald ein aktiver Bereich eine Phase abgeschlossen hat.
import type { BereichId, KursId, Lerntag, Phase, SchwerpunktId } from './inhaltTypen'
import { kursId, kursTeile } from './inhaltTypen'
import type { InhaltsIndex } from './index'
import type { CoachDaten, KursStand, Profil } from './typen'

export const STAFFEL_JE_DAUER: Record<number, number> = { 3: 3, 10: 3, 15: 4, 30: 6 }

/** Bereiche, die angeboten werden (freigegeben und mit Inhalt) */
export function angeboten(index: InhaltsIndex): BereichId[] {
  return index.bereiche.filter(b => b.freigegeben && index.kurse[b.id]?.length).map(b => b.id)
}

/** gewählte Bereiche, die es gibt */
export function gewaehlt(profil: Profil, index: InhaltsIndex): BereichId[] {
  const da = new Set(angeboten(index))
  return profil.bereiche.filter(b => da.has(b))
}

/** alle Kurse der gewählten Bereiche (aussprache: Kern + gewählte Schwerpunkte) */
export function kurseVon(profil: Profil, index: InhaltsIndex): KursId[] {
  const aus: KursId[] = []
  for (const b of gewaehlt(profil, index)) {
    aus.push(kursId(b))
    if (b === 'aussprache') for (const s of profil.schwerpunkte) if (index.kurse[kursId(b, s)]?.length) aus.push(kursId(b, s))
  }
  return aus
}

export const lerntageVon = (index: InhaltsIndex, kurs: KursId): Lerntag[] => (index.kurse[kurs] ?? []).filter(t => !t.entfallen)

export function offeneLerntage(index: InhaltsIndex, kurs: KursId, stand: KursStand | undefined): Lerntag[] {
  const erledigt = stand?.erledigt ?? {}
  return lerntageVon(index, kurs).filter(t => !(t.id in erledigt))
}
export const naechsterLerntag = (index: InhaltsIndex, kurs: KursId, stand: KursStand | undefined): Lerntag | null =>
  offeneLerntage(index, kurs, stand)[0] ?? null

export interface KursFortschritt { erledigt: number; gesamt: number; phase: Phase | null; phaseErledigt: number; phaseGesamt: number; fertig: boolean }
export function fortschritt(index: InhaltsIndex, kurs: KursId, stand: KursStand | undefined): KursFortschritt {
  const alle = lerntageVon(index, kurs)
  const erledigt = alle.filter(t => stand?.erledigt[t.id] !== undefined).length
  const naechster = naechsterLerntag(index, kurs, stand)
  const phase = naechster?.phase ?? (alle.length ? alle[alle.length - 1].phase : null)
  const inPhase = alle.filter(t => t.phase === phase)
  return { erledigt, gesamt: alle.length, phase, phaseErledigt: inPhase.filter(t => stand?.erledigt[t.id] !== undefined).length, phaseGesamt: inPhase.length, fertig: !naechster }
}

/** Wie viele Bereiche bekommen gleichzeitig neue Lerntage? */
export function staffelGroesse(profil: Profil): number {
  if (profil.staffel === 99) return 99
  if (profil.staffel > 0) return profil.staffel
  return STAFFEL_JE_DAUER[profil.dauer] ?? 3
}

const neuerKurs = (tag: number, aktiv: boolean): KursStand => ({ erledigt: {}, aktiv, seit: tag, kurz: [] })

/**
 * Staffel pflegen (rein). Aktiv bleiben, die aktiv sind (sofern noch gewählt); freie Plätze füllen die wartenden
 * Bereiche in der Reihenfolge der Wahl. Hat ein aktiver Bereich gerade eine Phase abgeschlossen und warten andere,
 * stellt er sich hinten an (`phaseFertig`). Bereiche ohne offene Lerntage (Freilauf) belegen keinen Platz,
 * solange andere warten.
 */
export function pflegeStaffel(d: CoachDaten, index: InhaltsIndex, tag: number, phaseFertig?: BereichId): Record<KursId, KursStand> {
  const kurse = { ...d.kurse }
  const bereiche = gewaehlt(d.profil, index)
  const plaetze = staffelGroesse(d.profil)
  const offen = (b: BereichId) => kurseVonBereich(d.profil, index, b).some(k => naechsterLerntag(index, k, kurse[k]))
  const istAktiv = (b: BereichId) => !!kurse[kursId(b)]?.aktiv
  // abgewählte Bereiche ruhen (der Stand bleibt erhalten)
  for (const [k, s] of Object.entries(kurse)) if (!bereiche.includes(kursTeile(k).bereich) && s.aktiv) kurse[k] = { ...s, aktiv: false }
  const wartend = bereiche.filter(b => !istAktiv(b) && offen(b))
  const setze = (b: BereichId, aktiv: boolean) => {
    for (const k of kurseVonBereich(d.profil, index, b)) kurse[k] = { ...(kurse[k] ?? neuerKurs(tag, aktiv)), aktiv }
  }
  if (phaseFertig && istAktiv(phaseFertig) && wartend.length && plaetze < 99) setze(phaseFertig, false)
  // fertige Bereiche (Freilauf) geben ihren Platz frei, wenn jemand wartet
  for (const b of bereiche) if (istAktiv(b) && !offen(b) && wartend.length) setze(b, false)
  let aktiv = bereiche.filter(istAktiv)
  for (const b of bereiche) {
    if (aktiv.length >= Math.min(plaetze, bereiche.length)) break
    if (!istAktiv(b) && (offen(b) || !wartend.length) && b !== phaseFertig) { setze(b, true); aktiv = [...aktiv, b] }
  }
  // noch Platz und nur der gerade Zurückgestellte übrig → wieder aktiv
  if (aktiv.length < Math.min(plaetze, bereiche.length) && phaseFertig && bereiche.includes(phaseFertig) && !istAktiv(phaseFertig)) setze(phaseFertig, true)
  // jede gewählte Spur hat einen Stand
  for (const k of kurseVon(d.profil, index)) if (!kurse[k]) kurse[k] = neuerKurs(tag, istAktiv(kursTeile(k).bereich))
  return kurse
}

export function kurseVonBereich(profil: Profil, index: InhaltsIndex, b: BereichId): KursId[] {
  const aus: KursId[] = [kursId(b)]
  if (b === 'aussprache') for (const s of profil.schwerpunkte) if (index.kurse[kursId(b, s)]?.length) aus.push(kursId(b, s as SchwerpunktId))
  return aus
}

/** aktive Bereiche (Staffel) */
export function aktiveBereiche(d: CoachDaten, index: InhaltsIndex): BereichId[] {
  return gewaehlt(d.profil, index).filter(b => d.kurse[kursId(b)]?.aktiv)
}

/** Hat dieser Lerntag eine Phase abgeschlossen (war er der letzte offene seiner Phase)? */
export function schliesstPhase(index: InhaltsIndex, kurs: KursId, stand: KursStand, lerntag: string): boolean {
  const alle = lerntageVon(index, kurs)
  const t = alle.find(x => x.id === lerntag)
  if (!t) return false
  return alle.filter(x => x.phase === t.phase).every(x => x.id === lerntag || stand.erledigt[x.id] !== undefined)
}
