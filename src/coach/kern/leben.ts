// Der Coach — echtes Leben (Stufe 2): Ernstfall-Fahrplan, Vorhaben mit Erinnerungen, Beweisliste, Kompass.
// Reine Funktionen ohne Uhr und ohne Zufall (Zeit und Startwert kommen von außen) – testbar und vorhersagbar.
import type { ErinnerungsArt, FahrplanEtappe, Leben, NotfallAblauf, SchaerfeId } from './inhaltTypen'
import type { CoachDaten, Ernstfall, Vorhaben } from './typen'
import { plusTage, tagNummer, wochentag } from './zeit'
import { hash32 } from './zufall'

// ── Ernstfall-Fahrplan ──

/** wann eine Etappe dran ist, relativ zum Termin (Tage) */
const ETAPPE_TAG: Record<FahrplanEtappe, [number, number]> = { woche: [-7, -2], vortag: [-1, -1], stunde: [0, 0], fuenf: [0, 0], minute: [0, 0], danach: [0, 2] }

export interface EtappeHeute { ernstfall: Ernstfall; etappe: FahrplanEtappe; titel: string; schritte: string[]; faellig: boolean }

/** offene Etappen eines Ernstfalls, die heute in ihrem Zeitfenster liegen (für „Heute“ und den Notfallkoffer) */
/** Termin schon vorbei? Am Termintag nur mit Uhrzeit entscheidbar – ohne Uhrzeit gilt er erst am Folgetag als vorbei */
export function terminVorbei(e: Ernstfall, heute: string, jetztMin?: number): boolean {
  const nr = tagNummer(heute), termin = tagNummer(e.datum)
  if (nr !== termin) return nr > termin
  return !!e.zeit && jetztMin !== undefined && jetztMin >= minuten(e.zeit)
}

export function etappenHeute(d: CoachDaten, ablaeufe: NotfallAblauf[], heute: string, jetztMin?: number): EtappeHeute[] {
  const nr = tagNummer(heute)
  const aus: EtappeHeute[] = []
  for (const e of d.ernstfaelle) {
    if (e.auswertung) continue
    const a = ablaeufe.find(x => x.art === e.art) ?? ablaeufe.find(x => x.art === 'sonst')
    if (!a) continue
    const termin = tagNummer(e.datum)
    for (const et of a.etappen) {
      if (e.erledigt.includes(et.id)) continue
      const [von, bis] = ETAPPE_TAG[et.id]
      if (nr < termin + von || nr > termin + bis) continue
      // am Termintag: vorher die Etappen bis zur letzten Minute, danach nur noch „danach“
      const vorbei = terminVorbei(e, heute, jetztMin)
      if (et.id === 'danach' ? !vorbei : nr === termin && vorbei) continue
      aus.push({ ernstfall: e, etappe: et.id, titel: et.titel, schritte: et.schritte, faellig: true })
    }
  }
  return aus
}

/** nächster offener Ernstfall in den kommenden `tage` Tagen (Planer: Training darauf einstellen) */
export function ernstfallBald(d: CoachDaten, heute: string, tage = 7): Ernstfall | null {
  const nr = tagNummer(heute)
  const offen = d.ernstfaelle.filter(e => !e.auswertung && tagNummer(e.datum) >= nr && tagNummer(e.datum) - nr <= tage)
  return offen.sort((a, b) => a.datum.localeCompare(b.datum))[0] ?? null
}

/** Ernstfälle, die vorbei sind und auf die Auswertung warten */
export const auswertungOffen = (d: CoachDaten, heute: string, jetztMin?: number): Ernstfall[] => d.ernstfaelle.filter(e => !e.auswertung && terminVorbei(e, heute, jetztMin))

export function etappeErledigt(d: CoachDaten, id: string, etappe: FahrplanEtappe): CoachDaten {
  return { ...d, ernstfaelle: d.ernstfaelle.map(e => (e.id === id && !e.erledigt.includes(etappe) ? { ...e, erledigt: [...e.erledigt, etappe] } : e)) }
}

// ── Vorhaben und Erinnerungen ──

const FENSTER: Record<'morgen' | 'mittag' | 'abend', [number, number]> = { morgen: [6 * 60, 11 * 60], mittag: [11 * 60, 15 * 60], abend: [15 * 60, 22 * 60] }
const minuten = (hhmm: string): number => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
/** liegt `jetzt` (Minuten) in der Ruhezeit von–bis (auch über Mitternacht)? */
export function inRuhe(jetzt: number, von: string, bis: string): boolean {
  const a = minuten(von), b = minuten(bis)
  return a <= b ? jetzt >= a && jetzt < b : jetzt >= a || jetzt < b
}

/** Montag der Woche (ISO) als Tagnummer */
const wochenStart = (heute: string): number => tagNummer(heute) - (wochentag(heute) - 1)
/** wie oft das Vorhaben in dieser Woche schon erledigt wurde */
export const dieseWoche = (v: Vorhaben, heute: string): number => v.gemacht.filter(t => t >= wochenStart(heute)).length
export const letzteWoche = (v: Vorhaben, heute: string): number => { const s = wochenStart(heute); return v.gemacht.filter(t => t >= s - 7 && t < s).length }

export interface VorhabenErinnerung { vorhaben: Vorhaben; art: ErinnerungsArt; text: string; sprung?: 'parla-italiano' }

/**
 * Welche Erinnerung (wenn überhaupt) passt jetzt? Regeln gegen das Nerven:
 * Obergrenze je Tag (profil.erinnerung.proTag), Ruhezeiten, mindestens zwei Stunden Abstand, nie zwei Karten zugleich
 * (das prüft die Oberfläche), „Heute nicht“ gilt den ganzen Tag, Wochenziel erreicht → still, Zeitfenster passend,
 * Art wechselt; nach drei Mal Wegklicken fragt die Karte einmal „leiser, kleiner oder streichen?“.
 */
export function waehleErinnerung(d: CoachDaten, leben: Leben, heute: string, jetztMin: number, name: string): VorhabenErinnerung | null {
  const e = d.profil.erinnerung
  if (!e.an || e.proTag === 0) return null
  if (inRuhe(jetztMin, e.ruheVon, e.ruheBis)) return null
  const [tag, anzahl, zuletzt] = d.vorhabenHeute[0] === heute ? d.vorhabenHeute : [heute, 0, -999]
  if (anzahl >= e.proTag || jetztMin - zuletzt < 120) return null
  const nr = tagNummer(heute)
  void tag
  const kandidaten = d.vorhaben.filter(v => v.an && v.heuteNicht !== nr && !v.gemacht.includes(nr) && v.zuletzt !== nr && dieseWoche(v, heute) < v.proWoche
    && (v.fenster.length === 0 || v.fenster.some(f => jetztMin >= FENSTER[f][0] && jetztMin < FENSTER[f][1])))
  if (!kandidaten.length) return null
  // Rückstand: wie weit liegt das Vorhaben hinter seinem Wochenziel? Bei Gleichstand: das, auf das öfter reagiert wurde
  const restTage = 8 - wochentag(heute)
  const prio = (v: Vorhaben) => (v.proWoche - dieseWoche(v, heute)) / restTage + (v.reagiert[v.fenster[0] ?? 'morgen'] ?? 0) * 0.01
  const v = [...kandidaten].sort((a, b) => prio(b) - prio(a))[0]
  const kat = leben.vorhaben.find(k => k.kat === v.kat)
  // Art: Neustart am Montag oder Monatsanfang, Rückblick, wenn letzte Woche etwas lief; sonst reihum ohne Wiederholung
  const neustart = wochentag(heute) === 1 || heute.endsWith('-01')
  const reihe: ErinnerungsArt[] = ['wennDann', 'kleinster', 'frage', 'idee', 'spruch']
  let art: ErinnerungsArt
  if (neustart && v.letzteArt !== 'neustart') art = 'neustart'
  else if (letzteWoche(v, heute) > 0 && v.letzteArt !== 'rueckblick' && hash32(`${v.id}|${heute}`) % 3 === 0) art = 'rueckblick'
  else {
    const frei = reihe.filter(a => a !== v.letzteArt && (a !== 'idee' || (kat?.impulse.length ?? 0) > 0) && (a !== 'wennDann' || v.wennDann) && (a !== 'kleinster' || v.kleinster))
    art = frei[hash32(`${v.id}|${heute}|${anzahl}`) % frei.length] ?? 'frage'
  }
  const texte = leben.erinnerungen[art]?.[v.schaerfe as SchaerfeId] ?? leben.erinnerungen[art]?.normal ?? []
  let text = texte.length ? texte[hash32(`${v.id}|${heute}|${art}`) % texte.length] : v.titel
  const idee = kat && kat.impulse.length ? kat.impulse[hash32(`${v.id}|${heute}|i`) % kat.impulse.length] : ''
  text = text.replace(/\{titel\}/g, v.titel).replace(/\{kleinster\}/g, v.kleinster).replace(/\{wennDann\}/g, v.wennDann)
    .replace(/\{anzahl\}-mal/g, letzteWoche(v, heute) === 1 ? 'einmal' : `${letzteWoche(v, heute)}-mal`)
    .replace(/\{anzahl\}/g, String(letzteWoche(v, heute))).replace(/\{idee\}/g, idee)
  text = name ? text.replace(/\{name\}/g, name) : text.replace(/\{name\},\s*/g, '').replace(/,?\s*\{name\}/g, '')
  return { vorhaben: v, art, text, ...(kat?.sprung ? { sprung: kat.sprung } : {}) }
}

/** Karte gezeigt: Tageszähler und „zuletzt“ setzen */
export function erinnerungGezeigt(d: CoachDaten, id: string, art: ErinnerungsArt, heute: string, jetztMin: number): CoachDaten {
  const [tag, anzahl] = d.vorhabenHeute[0] === heute ? d.vorhabenHeute : [heute, 0]
  return {
    ...d, vorhabenHeute: [tag, anzahl + 1, jetztMin],
    vorhaben: d.vorhaben.map(v => (v.id === id ? { ...v, zuletzt: tagNummer(heute), letzteArt: art } : v)),
  }
}

export type Antwort = 'gemacht' | 'spaeter' | 'heuteNicht' | 'weg'
/** Reaktion auf eine Erinnerung; „weg“ zählt hoch, alles andere setzt den Zähler zurück */
export function aufErinnerung(d: CoachDaten, id: string, antwort: Antwort, heute: string, jetztMin: number): CoachDaten {
  const nr = tagNummer(heute)
  const fenster = (Object.keys(FENSTER) as (keyof typeof FENSTER)[]).find(f => jetztMin >= FENSTER[f][0] && jetztMin < FENSTER[f][1]) ?? 'abend'
  return {
    ...d,
    vorhaben: d.vorhaben.map(v => {
      if (v.id !== id) return v
      const reagiert = antwort === 'weg' ? v.reagiert : { ...v.reagiert, [fenster]: (v.reagiert[fenster] ?? 0) + 1 }
      if (antwort === 'gemacht') return { ...v, weg: 0, reagiert, gemacht: [...v.gemacht.filter(t => t !== nr), nr].slice(-120) }
      if (antwort === 'heuteNicht') return { ...v, weg: 0, reagiert, heuteNicht: nr }
      if (antwort === 'spaeter') return { ...v, weg: 0, reagiert, zuletzt: nr - 1 }   // darf heute noch einmal kommen
      return { ...v, weg: v.weg + 1 }
    }),
  }
}

/** nach drei Mal Wegklicken: einmal fragen (leiser, kleiner, streichen) */
export const sollFragen = (v: Vorhaben): boolean => v.weg >= 3 && !v.gefragt

export function vorhabenGemacht(d: CoachDaten, id: string, heute: string): CoachDaten {
  const nr = tagNummer(heute)
  return { ...d, vorhaben: d.vorhaben.map(v => (v.id === id ? { ...v, weg: 0, gemacht: v.gemacht.includes(nr) ? v.gemacht.filter(t => t !== nr) : [...v.gemacht, nr].slice(-120) } : v)) }
}

/** Wochenübersicht: je Vorhaben die sieben Tage der laufenden Woche (true = gemacht) */
export function wochenUebersicht(d: CoachDaten, heute: string): { vorhaben: Vorhaben; tage: boolean[]; soll: number; ist: number }[] {
  const s = wochenStart(heute)
  return d.vorhaben.filter(v => v.an).map(v => ({ vorhaben: v, tage: Array.from({ length: 7 }, (_, i) => v.gemacht.includes(s + i)), soll: v.proWoche, ist: dieseWoche(v, heute) }))
}

// ── Beweisliste (befürchtet / passiert) ──

export interface Beweis { mission: string; tag: number; befuerchtung: string; wahrscheinlich?: number; eingetreten: boolean; vorher?: number; nachher?: number; mitnehmen?: string }
export function beweisliste(d: CoachDaten): Beweis[] {
  const aus: Beweis[] = []
  for (const [mission, liste] of Object.entries(d.missionen.erledigt)) for (const e of liste) {
    if (!e.befuerchtung || e.eingetreten === undefined) continue
    aus.push({ mission, tag: e.tag, befuerchtung: e.befuerchtung, wahrscheinlich: e.wahrscheinlich, eingetreten: e.eingetreten, vorher: e.vorher, nachher: e.anspannung, mitnehmen: e.mitnehmen })
  }
  return aus.sort((a, b) => b.tag - a.tag)
}
/** Zusammenfassung: wie oft trat das Befürchtete ein, im Mittel erwartet vs. passiert */
export function beweisBilanz(b: Beweis[]): { n: number; eingetreten: number; erwartet: number } {
  const mitW = b.filter(x => x.wahrscheinlich !== undefined)
  return { n: b.length, eingetreten: b.filter(x => x.eingetreten).length, erwartet: mitW.length ? Math.round(mitW.reduce((s, x) => s + (x.wahrscheinlich ?? 0), 0) / mitW.length) : 0 }
}

// ── Kompass ──

export const KOMPASS_ZEIT = { wochenCheck: 7, rueckblick: 90 }
/** steht der Wochen-Check für ein Ziel an (letzter Check älter als sieben Tage)? */
export function wochenCheckFaellig(d: CoachDaten, heute: string): string[] {
  const nr = tagNummer(heute)
  return d.kompass.ziele.filter(z => !z.erledigt && nr - (z.checks[z.checks.length - 1]?.tag ?? z.angelegt) >= KOMPASS_ZEIT.wochenCheck).map(z => z.id)
}
export const rueckblickFaellig = (d: CoachDaten, heute: string): boolean => d.kompass.ziele.length > 0 && tagNummer(heute) - (d.kompass.rueckblick ?? Math.min(...d.kompass.ziele.map(z => z.angelegt))) >= KOMPASS_ZEIT.rueckblick
export const naechsteStation = (d: CoachDaten, leben: Leben): string | null => [...leben.kompass.stationen].sort((a, b) => a.nr - b.nr).find(s => d.kompass.stationen[s.id] === undefined)?.id ?? null

/** Datum in n Tagen (für Ernstfall-Vorschläge) */
export const inTagen = (heute: string, n: number): string => plusTage(heute, n)
