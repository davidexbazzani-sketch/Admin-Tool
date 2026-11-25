// Der Coach — das tägliche Lernpaket zusammenstellen (rein, ohne Uhr: der Tag kommt als Eingabe).
//
//  • Gleicher Tag → gleicher Plan: Der Plan wird im Lernstand festgehalten (`heute`). Neu geplant wird nur, solange das
//    Training nicht begonnen hat und sich Bereiche, Dauer oder der Laut-Schalter geändert haben.
//  • Bereich für den neuen Lerntag: unter den aktiven (Staffel); ein Übungstag folgt seiner Einheit spätestens nach drei
//    Trainings; sonst Gewicht × Rückstand, nicht derselbe wie beim letzten Mal.
//  • Übungen aus dem Vorrat: nie Gesehenes zuerst, dann am längsten nicht Gesehenes; Stufe aus der Schätzung im Band
//    des Kursplans; laut aus → stille Ersatzübung; ohne Zeitdruck → nichts mit Uhr; Schwerpunkte nur, wenn gewählt;
//    nie zweimal dasselbe Format hintereinander.
import type { BereichId, FaehId, KursId, Lerntag, SchrittArt } from '../inhaltTypen'
import { kursId, kursTeile } from '../inhaltTypen'
import type { InhaltsIndex, VorratKopf } from '../index'
import type { Block, CoachDaten, TagesPlan } from '../typen'
import { hash32, rng, type Rng } from '../zufall'
import { tagNummer } from '../zeit'
import { ernstfallBald } from '../leben'
import { aktiveBereiche, gewaehlt, kurseVonBereich, naechsterLerntag, lerntageVon } from '../kurs'
import { faellige } from './wiederholung'
import { form, luecke, stufeFuer } from './schaetzung'

export interface PlanWunsch { dauer: 10 | 15 | 30 | 3; laut: boolean; nr?: number }

const MIN: Record<string, number> = { auf: 1, neu: 6, fest: 2, ueben: 5, tief: 3, transfer: 1, check: 3, einstufung: 3, formcheck: 4 }
const FESTIGEN_ANZAHL: Record<number, number> = { 3: 2, 10: 4, 15: 5, 30: 8 }
/** so viele Lerntage eines Bereichs, dann ist ein Formcheck dran */
export const FORMCHECK_NACH = 20
/** Trainings, nach denen der Rundencheck kommt */
export const RUNDE = 5

/** Kennzeichen der Wünsche, bei deren Änderung ein noch nicht begonnener Plan neu entsteht */
export const signatur = (d: CoachDaten, w: PlanWunsch): string =>
  [w.dauer, w.laut ? 1 : 0, d.profil.bereiche.join(','), d.profil.schwerpunkte.join(','), d.profil.ohneZeitdruck ? 1 : 0, d.profil.staffel, d.ernstfaelle.filter(e => !e.auswertung).map(e => e.datum).join(',')].join('|')

export interface VorratFilter { faehigkeiten?: FaehId[]; bereiche?: BereichId[]; formate?: SchrittArt[]; band: [number, number]; kanal?: 'wissen' | 'koennen' }

/** darf dieser Vorrats-Eintrag für diesen Nutzer überhaupt dran sein? */
export function erlaubt(v: VorratKopf, d: CoachDaten, laut: boolean): boolean {
  if (v.entf || v.test) return false
  if (v.sp && !(d.profil.bereiche.includes('aussprache') && d.profil.schwerpunkte.includes(v.sp))) return false
  if (v.laut && !laut && !v.leise) return false
  if (v.uhr && d.profil.ohneZeitdruck && v.a !== 'blitz') return false
  return true
}

/** n Vorrats-Einträge ziehen. Laute werden bei „laut aus“ durch ihren stillen Ersatz ersetzt. */
export function zieheVorrat(index: InhaltsIndex, d: CoachDaten, f: VorratFilter, n: number, r: Rng, laut: boolean, schonDa: Set<string>, letzteArt?: SchrittArt): string[] {
  const kand: [string, VorratKopf][] = []
  for (const [id, v] of Object.entries(index.vorrat)) {
    if (schonDa.has(id) || !erlaubt(v, d, laut)) continue
    if (f.faehigkeiten && !f.faehigkeiten.includes(v.f)) continue
    if (f.bereiche && !f.bereiche.includes(v.b)) continue
    if (f.formate && f.formate.length && !f.formate.includes(v.a)) continue
    if (f.kanal && v.k !== f.kanal) continue
    if (v.s < f.band[0] - 1 || v.s > f.band[1] + 1) continue
    kand.push([id, v])
  }
  // Rang: nie gesehen → am längsten nicht gesehen; Stufe nahe an der Zielstufe der Fähigkeit; Zufall als Gleichstand
  const ziel = (v: VorratKopf) => stufeFuer(d.f[v.f], v.k === 'wissen' ? 'w' : 'k', f.band)
  const gemischt = r.misch(kand)
  gemischt.sort((a, b) => {
    const ga = d.gesehen[a[0]] ?? -1, gb = d.gesehen[b[0]] ?? -1
    if ((ga < 0) !== (gb < 0)) return ga < 0 ? -1 : 1
    if (ga !== gb) return ga - gb
    return Math.abs(a[1].s - ziel(a[1])) - Math.abs(b[1].s - ziel(b[1]))
  })
  const aus: string[] = []
  let art = letzteArt
  const rest = [...gemischt]
  while (aus.length < n && rest.length) {
    let i = rest.findIndex(([, v]) => v.a !== art)
    if (i < 0) i = 0
    const [id, v] = rest.splice(i, 1)[0]
    const nimm = v.laut && !laut && v.leise ? v.leise : id
    if (schonDa.has(nimm) || aus.includes(nimm)) continue
    aus.push(nimm)
    schonDa.add(nimm)
    art = (index.vorrat[nimm] ?? v).a
  }
  return aus
}

/** Ein Übungstag findet so viele Aufgaben, wie er braucht? (für das Prüfskript und den Freilauf) */
export const uebungstagFuellbar = (index: InhaltsIndex, d: CoachDaten, t: Extract<Lerntag, { art: 'U' }>, laut: boolean): number =>
  zieheVorrat(index, d, { faehigkeiten: t.faehigkeiten, formate: t.formate, band: t.band }, t.anzahl, rng(1), laut, new Set()).length

interface Wahl { kurs: KursId; lerntag: Lerntag | null; grund: string }

/** Welcher Kurs bekommt heute den neuen Lerntag? */
export function waehleKurs(d: CoachDaten, index: InhaltsIndex, r: Rng, ausser?: BereichId, vorzug?: BereichId): Wahl | null {
  let aktiv = aktiveBereiche(d, index).filter(b => b !== ausser)
  if (!aktiv.length) aktiv = gewaehlt(d.profil, index).filter(b => b !== ausser)
  if (!aktiv.length) return null
  const letzte = d.verlauf.length ? d.verlauf[d.verlauf.length - 1] : null
  const tagNr = d.verlauf.length
  // 1. Übungstag, dessen Einheit schon erledigt ist: Vorrang (spätestens drei Trainings nach der Einheit)
  for (const b of aktiv) for (const k of kurseVonBereich(d.profil, index, b)) {
    const t = naechsterLerntag(index, k, d.kurse[k])
    if (t?.art !== 'U') continue
    const vorher = lerntageVon(index, k).slice(0, lerntageVon(index, k).findIndex(x => x.id === t.id)).reverse().find(x => x.art === 'E')
    if (vorher && d.kurse[k]?.erledigt[vorher.id] !== undefined) {
      const seit = d.verlauf.length - 1 - d.verlauf.map(v => v[2]).lastIndexOf(vorher.id)
      if (seit >= 1 || aktiv.length === 1) return { kurs: k, lerntag: t, grund: `Die Übung zu „${index.einheiten[(vorher as { einheit: string }).einheit]?.titel ?? 'deiner letzten Einheit'}“ ist dran – solange sie frisch ist, sitzt sie am besten.` }
    }
  }
  // Ernstfall in Sicht und „ruhe“ gewählt → ruhe zuerst (auch wenn er gerade nicht in der Staffel ist)
  if (vorzug && vorzug !== ausser && gewaehlt(d.profil, index).includes(vorzug)) {
    const k = kurseVonBereich(d.profil, index, vorzug)[0]
    if (k) return { kurs: k, lerntag: naechsterLerntag(index, k, d.kurse[k]), grund: '' }
  }
  // 2. Gewicht × Rückstand: wie lange ist der Bereich nicht drangewesen?
  const punkte = aktiv.map(b => {
    const zuletzt = d.verlauf.map(v => kursTeile(v[1]).bereich).lastIndexOf(b)
    const rueck = zuletzt < 0 ? 99 : tagNr - zuletzt
    const gewicht = d.profil.gewicht[b] ?? 2
    const gestern = letzte && kursTeile(letzte[1]).bereich === b && aktiv.length > 1 ? -1000 : 0
    return { b, p: gewicht * rueck + gestern + r() * 0.01 }
  }).sort((a, z) => z.p - a.p)
  const b = punkte[0].b
  // Spur: in aussprache wechseln Kern und Schwerpunkte sich ab (höchstens jede zweite Einheit aus einem Schwerpunkt)
  const kurse = kurseVonBereich(d.profil, index, b)
  let kurs = kurse[0]
  if (kurse.length > 1) {
    const letzteSpur = [...d.verlauf].reverse().find(v => kursTeile(v[1]).bereich === b)?.[1]
    const reihenfolge = letzteSpur === kursId(b) ? [...kurse.slice(1), kurse[0]] : kurse
    kurs = reihenfolge.find(k => naechsterLerntag(index, k, d.kurse[k])) ?? kurs
  }
  return { kurs, lerntag: naechsterLerntag(index, kurs, d.kurse[kurs]), grund: '' }
}

/** Inhalt eines Lerntags als Verweise */
function inhaltVon(t: Lerntag, kurs: KursId, index: InhaltsIndex, d: CoachDaten, r: Rng, laut: boolean, schonDa: Set<string>): string[] {
  switch (t.art) {
    case 'E': return [`e:${t.einheit}`]
    case 'L': case 'S': return [`l:${t.lage}`]
    case 'A': return [`a:${t.modus}:${kurs}`]
    case 'U': return zieheVorrat(index, d, { faehigkeiten: t.faehigkeiten, formate: t.formate, band: t.band }, t.anzahl, r, laut, schonDa).map(id => `v:${id}`)
  }
}

/** Freilauf: Übungstag zu den schwächsten Fähigkeiten eines Bereichs (nach dem Kursplan oder bis Inhalte nachwachsen) */
function freilauf(kurs: KursId, index: InhaltsIndex, d: CoachDaten, tag: number, r: Rng, laut: boolean, schonDa: Set<string>, n: number): string[] {
  const { bereich } = kursTeile(kurs)
  const fs = (index.bereiche.find(b => b.id === bereich)?.faehigkeiten ?? []).map(f => f.id)
  const schwach = [...fs].sort((a, b) => (form(d.f[a], tag) ?? 0.5) - (form(d.f[b], tag) ?? 0.5)).slice(0, 3)
  const hoechste = Math.max(4, ...Object.values(d.f).map(s => Math.round(((s.k + 3) / 6) * 10)))
  const ids = zieheVorrat(index, d, { faehigkeiten: schwach, band: [1, Math.min(10, hoechste)] }, n, r, laut, schonDa)
  return ids.length >= Math.min(2, n) ? ids.map(id => `v:${id}`) : zieheVorrat(index, d, { bereiche: [bereich], band: [1, 10] }, n, r, laut, schonDa).map(id => `v:${id}`)
}

const titelVon = (t: Lerntag | null, index: InhaltsIndex): string => {
  if (!t) return 'Meisterklasse'
  if (t.titel) return t.titel
  if (t.art === 'E') return index.einheiten[t.einheit]?.titel ?? 'Neue Einheit'
  if (t.art === 'L' || t.art === 'S') return index.lagen[t.lage]?.titel ?? 'Lage'
  if (t.art === 'U') return 'Übungstag'
  return t.modus === 'mission' ? 'Echtes Leben' : t.modus === 'nachbereitung' ? 'Nachbereitung' : 'Wiederholung'
}

export function planeTag(d: CoachDaten, index: InhaltsIndex, heute: string, w: PlanWunsch): TagesPlan {
  const nr = w.nr ?? 1
  const sig = signatur(d, w)
  if (d.heute && d.heute.tag === heute && d.heute.nr === nr && (d.heute.begonnen || d.heute.sig === sig)) return d.heute
  const tag = tagNummer(heute)
  const salz = (d.heute?.tag === heute && d.heute.nr === nr ? d.heute.salz + 1 : 0)
  const r = rng(hash32(`${d.benutzer.toLowerCase()}|${heute}|${nr}|${salz}`))
  const schonDa = new Set<string>()
  const bloecke: Block[] = []
  const bereiche = gewaehlt(d.profil, index)
  const erlaubtKarte = (ref: string) => {
    const b = ref.slice(2).split(/[-./]/)[0] as BereichId
    if (!bereiche.includes(b)) return false
    const sp = ref.match(/^m:aussprache-([nls])-/)?.[1]
    if (sp) return d.profil.schwerpunkte.includes(({ n: 'nuscheln', l: 'lispeln', s: 'stottern' } as const)[sp as 'n' | 'l' | 's'])
    return true
  }
  let grund = ''

  // Kurztraining: drei Minuten (rettet die Serie, rückt den Kurs nicht weiter)
  if (w.dauer === 3) {
    const karten = faellige(d.kasten, tag, erlaubtKarte).slice(0, 2)
    if (karten.length) bloecke.push({ art: 'fest', titel: 'Merkkarten', ids: karten.map(k => k), minuten: 1, fertig: false })
    const eine = zieheVorrat(index, d, { bereiche: bereiche.length ? bereiche : undefined, band: [1, 5], formate: ['auswahl', 'wortwahl', 'zuordnen', 'konter', 'umformulieren', 'anschluss'] }, 1, r, w.laut, schonDa)
    if (eine.length) bloecke.push({ art: 'ueben', titel: 'Eine Übung', ids: eine.map(id => `v:${id}`), minuten: 2, fertig: false })
    return { tag: heute, nr, salz, dauer: 3, laut: w.laut, begonnen: false, bloecke, grund: 'Kurztraining: drei Minuten, damit der Faden nicht reißt.', sig }
  }

  // Ernstfall in den nächsten sieben Tagen: ruhe zuerst; morgen oder heute: nur Leichtes, kein neuer Stoff
  const ernst = ernstfallBald(d, heute, 7)
  const ernstNah = ernst ? tagNummer(ernst.datum) - tag <= 1 : false
  const wahl = waehleKurs(d, index, r, undefined, ernst ? 'ruhe' : undefined)
  const kurs = wahl?.kurs
  const { bereich } = kurs ? kursTeile(kurs) : { bereich: undefined }

  // Aufwärmen: offene Einstufung des Bereichs, sonst eine leichte, kurze Aufgabe
  if (kurs && bereich && d.einstufung[kurs] === undefined && index.tests[kurs]) {
    bloecke.push({ art: 'einstufung', titel: 'Kurze Einstufung', kurs, ids: [`k:${kurs}`], minuten: MIN.einstufung, fertig: false })
  } else {
    const karte = faellige(d.kasten, tag, erlaubtKarte)[0]
    const auf = karte ? [karte] : zieheVorrat(index, d, { bereiche: bereiche.length ? bereiche : undefined, band: [1, 4], formate: ['auswahl', 'wortwahl', 'zuordnen', 'blitz'] }, 1, r, w.laut, schonDa).map(id => `v:${id}`)
    if (auf.length) bloecke.push({ art: 'auf', titel: 'Aufwärmen', ids: auf, minuten: MIN.auf, fertig: false })
  }

  // der neue Lerntag
  if (kurs) {
    const t = wahl?.lerntag ?? null
    let ids = t ? inhaltVon(t, kurs, index, d, r, w.laut, schonDa) : []
    if (!t || !ids.length) ids = freilauf(kurs, index, d, tag, r, w.laut, schonDa, 5)
    // Meisterklasse (Kursplan durch): jedes dritte Training des Bereichs eine Lage erneut – reihum, Meisterschaft zuerst
    if (!t) {
      const { spur } = kursTeile(kurs)
      const lagen = Object.entries(index.lagen).filter(([, l]) => l.b === bereich && (l.sp ?? 'kern') === spur).sort((a, z) => z[1].s - a[1].s).map(([id]) => id)
      const frei = d.verlauf.filter(v => v[1] === kurs && v[2] === 'frei').length
      if (lagen.length && frei % 3 === 2) ids = [`l:${lagen[Math.floor(frei / 3) % lagen.length]}`]
    }
    if (ernstNah) {
      // kurz vor dem Ernstfall: nichts Neues, nur Sicheres – der Lerntag wartet
      const sicher = freilauf(kurs, index, d, tag, r, w.laut, new Set(schonDa), 4)
      if (sicher.length) {
        grund = 'Dein Ernstfall ist nah. Heute kein neuer Stoff – nur Sicheres festigen. Im Notfallkoffer warten deine Startroutine und der Fahrplan.'
        bloecke.push({ art: 'ueben', titel: 'Sicher bleiben', kurs, ids: sicher, minuten: MIN.neu, fertig: false })
      }
    }
    // Wissen hoch, Tun niedrig → Anwendung statt Lektion (die Einheit wartet bis morgen)
    const fs = index.bereiche.find(b => b.id === bereich)?.faehigkeiten.map(f => f.id) ?? []
    if (ernstNah && bloecke.some(b => b.titel === 'Sicher bleiben')) { /* schon geplant */ }
    else if (t?.art === 'E' && fs.some(f => luecke(d.f[f], tag)) && !d.missionen.offen.some(m => m.id.startsWith(`${bereich}-`)) && d.verlauf.slice(-3).every(v => !v[2].includes('-a-'))) {
      grund = 'Du weißt in diesem Bereich schon viel – jetzt zählt, es draußen zu tun. Heute eine kleine Aufgabe fürs echte Leben.'
      bloecke.push({ art: 'neu', titel: 'Echtes Leben', kurs, ids: [`a:mission:${kurs}`], minuten: MIN.neu, fertig: false })
    } else {
      grund = wahl?.grund || (t ? '' : 'Kurs geschafft – willkommen in der Meisterklasse. Bruno trainiert deine schwächsten Fähigkeiten mit frischen Aufgaben und holt ab und zu eine Lage zurück, damit du andere Wege gehst.')
      bloecke.push({ art: 'neu', titel: titelVon(t, index), kurs, lerntag: t?.id, ids, minuten: MIN.neu, fertig: false })
    }
  }

  // Festigen: fällige Merkkarten aus allen gewählten Bereichen
  const karten = faellige(d.kasten, tag, erlaubtKarte).filter(k => !bloecke.some(b => b.ids.includes(k))).slice(0, FESTIGEN_ANZAHL[w.dauer] ?? 4)
  if (karten.length) bloecke.push({ art: 'fest', titel: 'Festigen', ids: karten, minuten: MIN.fest, fertig: false })

  // Formcheck: höchstens einer je Training, für den Bereich mit den meisten Lerntagen seit dem letzten
  const fc = kurseFuerFormcheck(d, index)
  if (fc && w.dauer >= 15) bloecke.push({ art: 'formcheck', titel: 'Formcheck', kurs: fc, ids: [`k:${fc}`], minuten: MIN.formcheck, fertig: false })

  // gezieltes Üben (ab 15 Minuten): schwächste begonnene Fähigkeit
  if (w.dauer >= 15 && bereiche.length) {
    const begonnen = Object.keys(d.f).filter(f => bereiche.includes(f.split('.')[0] as BereichId))
    // „Das stimmt so nicht“ (Ecke): eine Woche lang wird diese Fähigkeit gezielt nachgeprüft
    const widerspruch = Object.entries(d.widerspruch ?? {}).filter(([f, t]) => tag - t <= 7 && bereiche.includes(f.split('.')[0] as BereichId)).sort((a, b) => b[1] - a[1])[0]?.[0]
    const schwach = widerspruch ?? begonnen.sort((a, b) => (form(d.f[a], tag) ?? 0.5) - (form(d.f[b], tag) ?? 0.5))[0]
    const letzteArt = bloecke.flatMap(b => b.ids).filter(i => i.startsWith('v:')).map(i => index.vorrat[i.slice(2)]?.a).pop()
    const nachholen = w.laut ? d.spaeterLaut.filter(id => index.vorrat[id] && erlaubt(index.vorrat[id], d, true)).slice(0, 2) : []
    nachholen.forEach(id => schonDa.add(id))
    const ids = [...nachholen, ...zieheVorrat(index, d, schwach ? { faehigkeiten: [schwach], band: [1, 10] } : { bereiche, band: [1, 6] }, (w.dauer === 30 ? 5 : 3) - nachholen.length, r, w.laut, schonDa, letzteArt)]
    if (ids.length) bloecke.push({ art: 'ueben', titel: 'Gezielt üben', ids: ids.map(id => `v:${id}`), minuten: w.dauer === 30 ? 8 : 5, fertig: false })
  }

  // Vertiefen (30 Minuten): zweiter Lerntag aus einem anderen Bereich
  if (w.dauer === 30 && bereich) {
    const dv = { ...d, verlauf: kurs ? [...d.verlauf, [tag, kurs, wahl?.lerntag?.id ?? ''] as typeof d.verlauf[number]] : d.verlauf }
    // kein anderer Bereich gewählt → die andere Spur desselben Bereichs (z. B. aussprache ↔ aussprache/stottern)
    const zweit = waehleKurs(dv, index, r, bereich) ?? waehleKurs(dv, index, r)
    if (zweit && zweit.kurs !== kurs) {
      const ids = zweit.lerntag ? inhaltVon(zweit.lerntag, zweit.kurs, index, d, r, w.laut, schonDa) : freilauf(zweit.kurs, index, d, tag, r, w.laut, schonDa, 4)
      if (ids.length) bloecke.push({ art: 'tief', titel: titelVon(zweit.lerntag, index), kurs: zweit.kurs, lerntag: zweit.lerntag?.id, ids, minuten: MIN.neu, fertig: false })
    }
  }

  // Rundencheck nach fünf Trainings
  if (d.runde.trainings >= RUNDE - 1 && bereiche.length) {
    const runde = [...new Set(d.verlauf.slice(-RUNDE).map(v => kursTeile(v[1]).bereich))]
    const ids = zieheVorrat(index, d, { bereiche: runde.length ? runde : bereiche, band: [1, 8], formate: ['auswahl', 'wortwahl', 'zuordnen', 'rangfolge', 'konter', 'kunstgriff', 'anschluss'] }, 4, r, w.laut, schonDa)
    if (ids.length) bloecke.push({ art: 'check', titel: `Rundencheck ${d.runde.nr}`, ids: ids.map(id => `v:${id}`), minuten: MIN.check, fertig: false })
  }

  // Transfer: offene Mission nachfragen, sonst eine vorschlagen
  if (kurs) {
    const offen = d.missionen.offen.filter(m => m.gewaehlt < tag)[0]
    bloecke.push({ art: 'transfer', titel: offen ? 'Wie lief es?' : 'Fürs echte Leben', ids: [offen ? `a:bericht:${offen.id}` : `a:vorschlag:${kurs}`], minuten: MIN.transfer, fertig: false })
  }

  return { tag: heute, nr, salz, dauer: w.dauer, laut: w.laut, begonnen: false, bloecke, grund, sig }
}

/** Kurs, für den ein Formcheck fällig ist (nach FORMCHECK_NACH Lerntagen seit dem letzten) */
export function kurseFuerFormcheck(d: CoachDaten, index: InhaltsIndex): KursId | null {
  let best: KursId | null = null, max = 0
  for (const [k, s] of Object.entries(d.kurse)) {
    if (!index.tests[k]) continue
    const letzter = d.formcheck[k]?.[d.formcheck[k].length - 1]?.tag ?? (d.einstufung[k] ?? -1)
    const seit = Object.values(s.erledigt).filter(t => t > letzter).length
    if (seit >= FORMCHECK_NACH && seit > max) { max = seit; best = k }
  }
  return best
}

export const minutenVon = (p: TagesPlan): number => p.bloecke.reduce((s, b) => s + b.minuten, 0)
