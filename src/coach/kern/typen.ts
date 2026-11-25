// Der Coach — Lernstand (lokal und verschlüsselt, drei Ablagen: coach, coachBuch, coachTon).
// Alles hier ist klein gehalten und begrenzt: Ziel ist ein Lernstand unter 150 KB auch nach 1.000 Lerntagen.
import type { BereichId, FaehId, KursId, SchwerpunktId, Ton } from './inhaltTypen'

export const DATEN_V = 1

export interface Erinnerung { an: boolean; um: string; windows: boolean; proTag: 0 | 1 | 2 | 3 | 4; ruheVon: string; ruheBis: string }

export interface Profil {
  /** gewählte Bereiche (in der Reihenfolge der Wahl) */
  bereiche: BereichId[]
  /** nur wirksam, wenn 'aussprache' gewählt ist */
  schwerpunkte: SchwerpunktId[]
  ton: Ton
  dauer: 10 | 15 | 30
  /** Trainingstage 1 (Mo) … 7 (So) */
  tage: number[]
  wofuer: string
  situationen: string[]
  /** Anrede in Brunos Zeilen; leer = ohne Namen */
  name: string
  lautUeben: boolean
  ohneZeitdruck: boolean
  aufnahmenBehalten: boolean
  mikrofon: boolean
  klang: boolean
  diskret: boolean
  bewegung: boolean
  mutproben: boolean
  erinnerung: Erinnerung
  /** wie viele Bereiche gleichzeitig neue Lerntage bekommen; 0 = nach Tagesdauer (3/4/6), 99 = alle */
  staffel: number
  gewicht: Partial<Record<BereichId, 1 | 2 | 3>>
}

/** Wissen, Können, Tun je Fähigkeit: Werte θ zwischen −3 und +3, Anzahl Belege, zuletzt (Tagnummer), letzte zehn Ergebnisse */
export interface Faehigkeitsstand { w: number; k: number; t: number; nw: number; nk: number; nt: number; zuletzt: number; q: number[] }

export interface KursStand {
  /** Lerntag-Kennung → Tagnummer, an der er erledigt wurde */
  erledigt: Record<string, number>
  /** bekommt neue Lerntage (Staffel) */
  aktiv: boolean
  seit: number
  /** Einheiten, die laut Einstufung schon sitzen → Kurzfassung */
  kurz: string[]
}

/** ein Block des Tagespakets; `ids` sind Verweise: e:<einheit> v:<vorrat> l:<lage> m:<merkkarte> w:<wissen> k:<kurs> a:<modus> */
export interface Block {
  art: 'auf' | 'neu' | 'fest' | 'ueben' | 'tief' | 'transfer' | 'check' | 'einstufung' | 'formcheck'
  titel: string
  kurs?: KursId
  lerntag?: string
  ids: string[]
  minuten: number
  fertig: boolean
}

export interface TagesPlan {
  tag: string
  nr: number
  salz: number
  dauer: 10 | 15 | 30 | 3
  laut: boolean
  begonnen: boolean
  bloecke: Block[]
  /** warum der Coach heute das ausgewählt hat (für „Warum heute das?“) */
  grund: string
  /** Kennzeichen der Wünsche, aus denen der Plan entstand (Dauer, laut, Bereiche …) */
  sig: string
}

export interface OffeneMission { id: string; gewaehlt: number; plan: string; befuerchtung?: string; wahrscheinlich?: number; anspannung?: number }
export interface ErledigteMission { tag: number; eingetreten?: boolean; anspannung?: number; mitnehmen?: string }

export interface CoachDaten {
  v: number
  /** Inhaltsstand beim letzten Speichern */
  iv: number
  benutzer: string
  begonnen: string
  /** Einstieg abgeschlossen? */
  eingestiegen: boolean
  profil: Profil
  f: Record<FaehId, Faehigkeitsstand>
  kurse: Record<KursId, KursStand>
  heute: TagesPlan | null
  /** [Tagnummer, Kurs, Lerntag] — die letzten 60 */
  verlauf: [number, KursId, string][]
  /** Runde = fünf Trainings; danach Rundencheck */
  runde: { nr: number; trainings: number }
  /** Karteikasten: Verweis (m:… oder b:…) → [Fach, fällig (Tagnummer), richtig, falsch] */
  kasten: Record<string, [number, number, number, number]>
  /** Vorrats-Kennung → Tagnummer, an der sie zuletzt dran war (begrenzt) */
  gesehen: Record<string, number>
  /** Datum → [Minuten, Aufgaben, richtig, Lerntage]; älter als 400 Tage → wochen */
  tage: Record<string, [number, number, number, number]>
  wochen: Record<string, [number, number]>
  missionen: { offen: OffeneMission[]; erledigt: Record<string, ErledigteMission[]>; verschoben: Record<string, number> }
  einstufung: Record<KursId, number>
  formcheck: Record<KursId, { tag: number; wert: number; se: number; selbst: number }[]>
  /** [Sicherheit 0..1, Treffer 0|1] — die letzten 60 */
  kalib: [number, number][]
  /** Tendenz → [Tagnummer, getroffen 0|1] (Gelegenheiten der letzten 30 Tage) */
  muster: Record<string, [number, number][]>
  /** Werkzeug → Anspannung vorher minus nachher, die letzten acht */
  wirkung: Record<string, number[]>
  spaeterLaut: string[]
  /** Zähler (z. B. „Wie bitte?“) → [Tagnummer, Anzahl]; nur Tage mit Eintrag */
  zaehler: Record<string, [number, number][]>
  /** Zähler → letzte Tagnummer, an der er auf „Heute“ steht (gleicher Name = derselbe Zähler, verlängert) */
  zaehlerBis: Record<string, number>
  /** einmalige Hinweise schon gesehen */
  gesehenHinweise: Record<string, number>
}

export interface BuchEintrag {
  id: string
  art: 'konter' | 'geschichte' | 'erfolg' | 'satz' | 'reflexion' | 'plan' | 'wortliste' | 'routine' | 'antwort' | 'wofuer'
  tag: number
  bezug?: string
  text: string
}
export interface CoachBuch { v: number; benutzer: string; eintraege: BuchEintrag[] }

export interface Aufnahme { id: string; art: 'start' | 'formcheck' | 'schwerpunkt'; tag: number; sek: number; mime: string; daten: string; titel: string }
export interface CoachTon { v: number; benutzer: string; aufnahmen: Aufnahme[] }

export const MAX_AUFNAHMEN = 8
export const MAX_BUCH = 2000

export function leeresProfil(): Profil {
  return {
    bereiche: [], schwerpunkte: [], ton: 'ruhig', dauer: 10, tage: [1, 2, 3, 4, 5], wofuer: '', situationen: [], name: '',
    lautUeben: false, ohneZeitdruck: false, aufnahmenBehalten: false, mikrofon: true, klang: true, diskret: true, bewegung: true,
    mutproben: false, erinnerung: { an: true, um: '10:00', windows: false, proTag: 1, ruheVon: '18:00', ruheBis: '07:30' },
    staffel: 0, gewicht: {},
  }
}

export function leereDaten(benutzer: string, heute: string): CoachDaten {
  return {
    v: DATEN_V, iv: 0, benutzer, begonnen: heute, eingestiegen: false, profil: leeresProfil(), f: {}, kurse: {}, heute: null,
    verlauf: [], runde: { nr: 1, trainings: 0 }, kasten: {}, gesehen: {}, tage: {}, wochen: {},
    missionen: { offen: [], erledigt: {}, verschoben: {} }, einstufung: {}, formcheck: {}, kalib: [], muster: {}, wirkung: {},
    spaeterLaut: [], zaehler: {}, zaehlerBis: {}, gesehenHinweise: {},
  }
}
export const leeresBuch = (benutzer: string): CoachBuch => ({ v: DATEN_V, benutzer, eintraege: [] })
export const leererTon = (benutzer: string): CoachTon => ({ v: DATEN_V, benutzer, aufnahmen: [] })
