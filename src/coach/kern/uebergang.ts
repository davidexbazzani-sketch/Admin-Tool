// Der Coach — Gelesenes prüfen, fehlende Felder ergänzen, ältere Fassungen überführen.
// Anders als Parla Italiano wird ein Stand mit anderer Fassung NIE verworfen:
//   • ältere Fassung → einmal beiseitelegen („alt“), dann über reine Funktionen überführen
//   • neuere Fassung (anderes, neueres Tool) → nur lesen, nichts schreiben
//   • fremder Benutzer oder Unsinn → nicht anzeigen (der Speicher legt die Datei beiseite)
import type { BuchEintrag, CoachBuch, CoachDaten, CoachTon, Profil } from './typen'
import { DATEN_V, leereDaten, leeresProfil, MAX_AUFNAHMEN, MAX_BUCH } from './typen'
import { BEREICHE, SCHWERPUNKTE } from './inhaltTypen'

export type Pruefung<T> = { status: 'ok' | 'ueberfuehrt'; daten: T } | { status: 'neuer' | 'fremd' | 'kaputt'; daten: null }

const lc = (s: unknown) => String(s ?? '').trim().toLowerCase()
const obj = <T extends object>(x: unknown, sonst: T): T => (x && typeof x === 'object' && !Array.isArray(x) ? x as T : sonst)
const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? x as T[] : [])
const zahl = (x: unknown, sonst: number, von: number, bis: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(von, Math.min(bis, x)) : sonst)
const text = (x: unknown, sonst = '', max = 2000) => (typeof x === 'string' ? x.slice(0, max) : sonst)
const bool = (x: unknown, sonst: boolean) => (typeof x === 'boolean' ? x : sonst)

/** Kette der Überführungen: UEBERGAENGE[v] macht aus Fassung v die Fassung v + 1 */
const UEBERGAENGE: Record<number, (roh: Record<string, unknown>) => Record<string, unknown>> = {}

function profilAus(roh: unknown): Profil {
  const p = obj<Partial<Profil>>(roh, {})
  const l = leeresProfil()
  const e = obj<Partial<Profil['erinnerung']>>(p.erinnerung, {})
  const dauer = p.dauer === 15 || p.dauer === 30 ? p.dauer : 10
  const ton = p.ton === 'klar' || p.ton === 'trocken' ? p.ton : 'ruhig'
  return {
    ...l,
    bereiche: arr<string>(p.bereiche).filter((b): b is Profil['bereiche'][number] => (BEREICHE as readonly string[]).includes(b)),
    schwerpunkte: arr<string>(p.schwerpunkte).filter((s): s is Profil['schwerpunkte'][number] => (SCHWERPUNKTE as readonly string[]).includes(s)),
    ton, dauer,
    tage: arr<number>(p.tage).filter(t => Number.isInteger(t) && t >= 1 && t <= 7),
    wofuer: text(p.wofuer, '', 400), situationen: arr<string>(p.situationen).filter(s => typeof s === 'string').slice(0, 20), name: text(p.name, '', 40),
    lautUeben: bool(p.lautUeben, l.lautUeben), ohneZeitdruck: bool(p.ohneZeitdruck, l.ohneZeitdruck), aufnahmenBehalten: bool(p.aufnahmenBehalten, false),
    mikrofon: bool(p.mikrofon, l.mikrofon), klang: bool(p.klang, l.klang), diskret: bool(p.diskret, l.diskret), bewegung: bool(p.bewegung, l.bewegung),
    mutproben: bool(p.mutproben, false),
    erinnerung: {
      an: bool(e.an, l.erinnerung.an), um: /^\d\d:\d\d$/.test(String(e.um)) ? String(e.um) : l.erinnerung.um, windows: bool(e.windows, false),
      proTag: ([0, 1, 2, 3, 4] as const).find(x => x === e.proTag) ?? l.erinnerung.proTag,
      ruheVon: /^\d\d:\d\d$/.test(String(e.ruheVon)) ? String(e.ruheVon) : l.erinnerung.ruheVon,
      ruheBis: /^\d\d:\d\d$/.test(String(e.ruheBis)) ? String(e.ruheBis) : l.erinnerung.ruheBis,
    },
    staffel: zahl(p.staffel, 0, 0, 99),
    gewicht: obj(p.gewicht, {}),
  }
}

export function pruefeDaten(roh: unknown, benutzer: string, heute: string): Pruefung<CoachDaten> {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return { status: 'kaputt', daten: null }
  let d = roh as Record<string, unknown>
  if (lc(d.benutzer) !== lc(benutzer)) return { status: 'fremd', daten: null }
  const v = typeof d.v === 'number' ? d.v : 0
  if (v > DATEN_V) return { status: 'neuer', daten: null }
  let ueberfuehrt = false
  for (let x = v; x < DATEN_V; x++) { const f = UEBERGAENGE[x]; if (f) d = f(d); ueberfuehrt = true }
  const l = leereDaten(benutzer, heute)
  const m = obj<Partial<CoachDaten['missionen']>>(d.missionen, {})
  const daten: CoachDaten = {
    ...l,
    iv: zahl(d.iv, 0, 0, 1e9),
    begonnen: text(d.begonnen, l.begonnen, 10),
    eingestiegen: bool(d.eingestiegen, false),
    profil: profilAus(d.profil),
    f: obj(d.f, {}), kurse: obj(d.kurse, {}),
    heute: d.heute && typeof d.heute === 'object' && Array.isArray((d.heute as { bloecke?: unknown }).bloecke) ? d.heute as CoachDaten['heute'] : null,
    verlauf: arr<CoachDaten['verlauf'][number]>(d.verlauf).filter(x => Array.isArray(x) && x.length === 3).slice(-60),
    runde: obj(d.runde, l.runde), kasten: obj(d.kasten, {}), gesehen: obj(d.gesehen, {}), tage: obj(d.tage, {}), wochen: obj(d.wochen, {}),
    missionen: { offen: arr(m.offen), erledigt: obj(m.erledigt, {}), verschoben: obj(m.verschoben, {}) },
    einstufung: obj(d.einstufung, {}), formcheck: obj(d.formcheck, {}), kalib: arr<[number, number]>(d.kalib).slice(-60),
    muster: obj(d.muster, {}), wirkung: obj(d.wirkung, {}), spaeterLaut: arr<string>(d.spaeterLaut).slice(-10), zaehler: obj(d.zaehler, {}), zaehlerBis: obj(d.zaehlerBis, {}),
    gesehenHinweise: obj(d.gesehenHinweise, {}),
  }
  return { status: ueberfuehrt ? 'ueberfuehrt' : 'ok', daten }
}

const BUCH_ARTEN: BuchEintrag['art'][] = ['konter', 'geschichte', 'erfolg', 'satz', 'reflexion', 'plan', 'wortliste', 'routine', 'antwort', 'wofuer']
export function pruefeBuch(roh: unknown, benutzer: string): Pruefung<CoachBuch> {
  if (!roh || typeof roh !== 'object') return { status: 'kaputt', daten: null }
  const b = roh as Partial<CoachBuch>
  if (lc(b.benutzer) !== lc(benutzer)) return { status: 'fremd', daten: null }
  if ((b.v ?? 0) > DATEN_V) return { status: 'neuer', daten: null }
  const eintraege = arr<BuchEintrag>(b.eintraege).filter(e => e && typeof e.id === 'string' && typeof e.text === 'string' && BUCH_ARTEN.includes(e.art)).slice(-MAX_BUCH)
  return { status: (b.v ?? 0) < DATEN_V ? 'ueberfuehrt' : 'ok', daten: { v: DATEN_V, benutzer, eintraege } }
}

export function pruefeTon(roh: unknown, benutzer: string): Pruefung<CoachTon> {
  if (!roh || typeof roh !== 'object') return { status: 'kaputt', daten: null }
  const t = roh as Partial<CoachTon>
  if (lc(t.benutzer) !== lc(benutzer)) return { status: 'fremd', daten: null }
  if ((t.v ?? 0) > DATEN_V) return { status: 'neuer', daten: null }
  const aufnahmen = arr<CoachTon['aufnahmen'][number]>(t.aufnahmen).filter(a => a && typeof a.daten === 'string').slice(-MAX_AUFNAHMEN)
  return { status: 'ok', daten: { v: DATEN_V, benutzer, aufnahmen } }
}
