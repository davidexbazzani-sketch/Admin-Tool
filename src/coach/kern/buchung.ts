// Der Coach — Ergebnisse verbuchen (reine Funktionen auf dem Lernstand; der Speicher ruft sie auf).
import type { KursId, Kopf } from './inhaltTypen'
import { kursTeile } from './inhaltTypen'
import type { InhaltsIndex } from './index'
import type { CoachDaten, ErledigteMission, OffeneMission } from './typen'
import { verbuche, type Kanal3 } from './gehirn/schaetzung'
import { bewerte, neuerEintrag } from './gehirn/wiederholung'
import { pflegeStaffel, schliesstPhase } from './kurs'
import { tagNummer, wochenAnfang, plusTage } from './zeit'

const MAX_GESEHEN = 3000
const TAGE_BEHALTEN = 400

/** eine gewertete Antwort (Übung mit Kopf). ergebnis 0..1; halb = Selbstbewertung oder schon einmal gesehen */
export function bucheAntwort(d: CoachDaten, kopf: Kopf, ergebnis: number, heute: string, o: { halb?: boolean; sicherheit?: number; tendenz?: string; vorrat?: boolean } = {}): CoachDaten {
  const tag = tagNummer(heute)
  const kanal: Kanal3 = kopf.kanal === 'wissen' ? 'w' : 'k'
  const schonGesehen = d.gesehen[kopf.id] !== undefined && kopf.kanal === 'wissen'
  const f = { ...d.f, [kopf.faehigkeit]: verbuche(d.f[kopf.faehigkeit], { kanal, stufe: kopf.stufe, ergebnis, halb: o.halb || schonGesehen }, tag) }
  let gesehen = { ...d.gesehen, [kopf.id]: tag }
  const n = Object.keys(gesehen).length
  if (n > MAX_GESEHEN) gesehen = Object.fromEntries(Object.entries(gesehen).sort((a, b) => b[1] - a[1]).slice(0, MAX_GESEHEN))
  const kalib = o.sicherheit !== undefined ? [...d.kalib, [o.sicherheit, ergebnis >= 0.75 ? 1 : 0] as [number, number]].slice(-60) : d.kalib
  const tage = zaehleTag(d.tage, heute, 0, 1, ergebnis >= 0.75 ? 1 : 0, 0)
  return { ...d, f, gesehen, kalib, tage }
}

/** Gelegenheit für eine Tendenz (Muster): getroffen, wenn die gewählte Antwort sie trägt */
export function bucheTendenz(d: CoachDaten, tendenzen: string[], gewaehlt: string | undefined, heute: string): CoachDaten {
  if (!tendenzen.length) return d
  const tag = tagNummer(heute)
  const muster = { ...d.muster }
  for (const t of new Set(tendenzen)) muster[t] = [...(muster[t] ?? []).filter(x => x[0] > tag - 30), [tag, t === gewaehlt ? 1 : 0] as [number, number]].slice(-40)
  return { ...d, muster }
}

/** Tun: eine erledigte Mission (Stufe der Leiter als Schwierigkeit) */
export function bucheTun(d: CoachDaten, faehigkeiten: string[], stufe: number, heute: string): CoachDaten {
  const tag = tagNummer(heute)
  const f = { ...d.f }
  for (const id of faehigkeiten) f[id] = verbuche(f[id], { kanal: 't', stufe, ergebnis: 1 }, tag)
  return { ...d, f }
}

export function bucheMerkkarte(d: CoachDaten, ref: string, richtig: boolean, heute: string): CoachDaten {
  const tag = tagNummer(heute)
  return { ...d, kasten: { ...d.kasten, [ref]: bewerte(d.kasten[ref], richtig, tag) }, tage: zaehleTag(d.tage, heute, 0, 1, richtig ? 1 : 0, 0) }
}

/** Merkkarten einer Einheit in den Kasten legen (morgen fällig) */
export function legeKarten(d: CoachDaten, refs: string[], heute: string): CoachDaten {
  const tag = tagNummer(heute)
  const kasten = { ...d.kasten }
  for (const r of refs) if (!kasten[r]) kasten[r] = neuerEintrag(tag)
  return { ...d, kasten }
}

/** Lerntag erledigt → Fortschritt, Verlauf, Staffel */
export function schliesseLerntag(d: CoachDaten, index: InhaltsIndex, kurs: KursId, lerntag: string, heute: string): CoachDaten {
  const tag = tagNummer(heute)
  const stand = d.kurse[kurs] ?? { erledigt: {}, aktiv: true, seit: tag, kurz: [] }
  if (stand.erledigt[lerntag] !== undefined) return d
  const phaseZu = schliesstPhase(index, kurs, stand, lerntag)
  const kurse = { ...d.kurse, [kurs]: { ...stand, erledigt: { ...stand.erledigt, [lerntag]: tag } } }
  const verlauf = [...d.verlauf, [tag, kurs, lerntag] as [number, KursId, string]].slice(-60)
  const neu: CoachDaten = { ...d, kurse, verlauf, tage: zaehleTag(d.tage, heute, 0, 0, 0, 1) }
  return { ...neu, kurse: pflegeStaffel(neu, index, tag, phaseZu ? kursTeile(kurs).bereich : undefined) }
}

/** Freilauf-Training ohne Lerntag: nur Verlauf (damit der Bereich nicht morgen gleich wieder dran ist) */
export function merkeVerlauf(d: CoachDaten, kurs: KursId, heute: string): CoachDaten {
  return { ...d, verlauf: [...d.verlauf, [tagNummer(heute), kurs, 'frei'] as [number, KursId, string]].slice(-60) }
}

/** ganzes Paket fertig → Minuten des Tages, Runde */
export function schliessePaket(d: CoachDaten, heute: string, minuten: number): CoachDaten {
  const runde = d.runde.trainings + 1 >= 5 ? { nr: d.runde.nr + 1, trainings: 0 } : { nr: d.runde.nr, trainings: d.runde.trainings + 1 }
  const plan = d.heute && d.heute.tag === heute ? { ...d.heute, bloecke: d.heute.bloecke.map(b => ({ ...b, fertig: true })) } : d.heute
  return verdichte({ ...d, runde: minuten >= 5 ? runde : d.runde, heute: plan, tage: zaehleTag(d.tage, heute, minuten, 0, 0, 0) })
}

export function zaehleTag(tage: CoachDaten['tage'], datum: string, minuten: number, aufgaben: number, richtig: number, lerntage: number): CoachDaten['tage'] {
  const a = tage[datum] ?? [0, 0, 0, 0]
  return { ...tage, [datum]: [a[0] + minuten, a[1] + aufgaben, a[2] + richtig, a[3] + lerntage] }
}

/** Tage älter als 400 Tage zu Wochen verdichten */
export function verdichte(d: CoachDaten): CoachDaten {
  const alle = Object.keys(d.tage).sort()
  if (!alle.length) return d
  const grenze = plusTage(alle[alle.length - 1], -TAGE_BEHALTEN)
  const alt = alle.filter(t => t < grenze)
  if (!alt.length) return d
  const tage = { ...d.tage }
  const wochen = { ...d.wochen }
  for (const t of alt) {
    const w = wochenAnfang(t)
    const a = wochen[w] ?? [0, 0]
    wochen[w] = [a[0] + tage[t][0], a[1] + tage[t][3]]
    delete tage[t]
  }
  return { ...d, tage, wochen }
}

// ── Zähler (Selbstbeobachtung, z. B. „Wie bitte?“) ──

/** Zähler einrichten; gleicher Name = derselbe Zähler, er wird höchstens verlängert */
export function starteZaehler(d: CoachDaten, name: string, tage: number, heute: string): CoachDaten {
  const bis = tagNummer(heute) + Math.max(1, Math.round(tage)) - 1
  return { ...d, zaehler: { ...d.zaehler, [name]: d.zaehler[name] ?? [] }, zaehlerBis: { ...d.zaehlerBis, [name]: Math.max(d.zaehlerBis[name] ?? 0, bis) } }
}
/** heute um `schritt` hoch- oder herunterzählen (nie unter null); höchstens 120 Tage Verlauf */
export function zaehle(d: CoachDaten, name: string, schritt: number, heute: string): CoachDaten {
  const tag = tagNummer(heute)
  const liste = (d.zaehler[name] ?? []).filter(x => x[0] !== tag)
  const jetzt = Math.max(0, ((d.zaehler[name] ?? []).find(x => x[0] === tag)?.[1] ?? 0) + schritt)
  return { ...d, zaehler: { ...d.zaehler, [name]: [...liste, [tag, jetzt] as [number, number]].sort((a, b) => a[0] - b[0]).slice(-120) } }
}
/** Zähler, die heute auf „Heute“ stehen */
export const aktiveZaehler = (d: CoachDaten, heute: string): string[] =>
  Object.entries(d.zaehlerBis ?? {}).filter(([, bis]) => bis >= tagNummer(heute)).map(([n]) => n).sort()

// ── Missionen ──

export function waehleMission(d: CoachDaten, m: OffeneMission): CoachDaten {
  if (d.missionen.offen.some(x => x.id === m.id)) return d
  return { ...d, missionen: { ...d.missionen, offen: [...d.missionen.offen, m].slice(-12) } }
}
export function verschiebeMission(d: CoachDaten, id: string): CoachDaten {
  return { ...d, missionen: { ...d.missionen, verschoben: { ...d.missionen.verschoben, [id]: (d.missionen.verschoben[id] ?? 0) + 1 } } }
}
export function streicheMission(d: CoachDaten, id: string): CoachDaten {
  return { ...d, missionen: { ...d.missionen, offen: d.missionen.offen.filter(x => x.id !== id) } }
}
export function berichteMission(d: CoachDaten, index: InhaltsIndex, id: string, bericht: Omit<ErledigteMission, 'tag'>, heute: string): CoachDaten {
  const tag = tagNummer(heute)
  const m = index.missionen[id]
  const offen = d.missionen.offen.filter(x => x.id !== id)
  const erledigt = { ...d.missionen.erledigt, [id]: [...(d.missionen.erledigt[id] ?? []), { ...bericht, tag }].slice(-5) }
  let neu: CoachDaten = { ...d, missionen: { ...d.missionen, offen, erledigt } }
  if (m) {
    const fs = index.bereiche.find(b => b.id === m.b)?.faehigkeiten.filter(f => !f.spur || f.spur === m.sp).map(f => f.id) ?? []
    neu = bucheTun(neu, fs.slice(0, 3), m.stufe, heute)
  }
  return neu
}

/** höchste erledigte Sprosse einer Leiter */
export function hoechsteSprosse(d: CoachDaten, index: InhaltsIndex, bereich: string, sp?: string): number {
  let max = 0
  for (const id of Object.keys(d.missionen.erledigt)) {
    const m = index.missionen[id]
    if (m && m.b === bereich && (m.sp ?? undefined) === (sp ?? undefined)) max = Math.max(max, m.stufe)
  }
  return max
}

/** nächste vorgeschlagene Mission eines Kurses: Sprosse knapp über dem Gewohnten; bei Lücke eine darunter */
export function missionsVorschlag(d: CoachDaten, index: InhaltsIndex, kurs: KursId, kleiner: boolean): string | null {
  const { bereich, spur } = kursTeile(kurs)
  const sp = spur === 'kern' ? undefined : spur
  const ziel = Math.max(1, Math.min(10, hoechsteSprosse(d, index, bereich, sp) + (kleiner ? 0 : 1)))
  const kand = Object.entries(index.missionen).filter(([, m]) => m.b === bereich && (m.sp ?? undefined) === sp && (!m.mutprobe || d.profil.mutproben))
  const offen = new Set(d.missionen.offen.map(m => m.id))
  kand.sort((a, b) => Math.abs(a[1].stufe - ziel) - Math.abs(b[1].stufe - ziel) || a[1].stufe - b[1].stufe)
  return kand.find(([id]) => !offen.has(id) && !d.missionen.erledigt[id])?.[0] ?? kand.find(([id]) => !offen.has(id))?.[0] ?? null
}
