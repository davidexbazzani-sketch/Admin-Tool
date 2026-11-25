// Parla Italiano — Lernstand: Zustand im Tool und lokale, verschlüsselte Ablage.
//
// Vorgabe des Nutzers (18.11.2026): Fortschritte und Ergebnisse werden LOKAL und VERSCHLÜSSELT
// gespeichert (Electron safeStorage/DPAPI, siehe electron/brainSpeicher.ts). Öffentlich ist nur
// das Level (kern/gruppe.ts) — das soll ausdrücklich jeder sehen.
import { create } from 'zustand'
import type { Ergebnis, ItDaten, ItEinstellungen, PruefungEintrag, PruefungsTeil, TestEintrag } from './typen'
import { leereDaten, leereFaehig } from './typen'
import { LEVEL_ANZAHL, TAGE_JE_LEVEL } from './inhaltTypen'
import { bewerte, neuerEintrag } from './kasten'
import { JOKER_MAX, setzeJokerEin } from './serie'
import { BESTEHEN_AB, sterneFuer } from './regeln'
import { heute, jetzt, tagNummer } from './zeit'
import { verdient } from './abzeichen'

export const PUNKTE = { richtig: 10, lektion: 50, stern: 20, pruefung: 200 }
const MAX_TESTS = 300

interface LadeAntwort { ok: boolean; daten: string | null; verschluesselung: boolean; fehler?: string }
interface ItIpc {
  italianoLaden(benutzer: string): Promise<LadeAntwort>
  italianoSpeichern(benutzer: string, json: string): Promise<{ ok: boolean; fehler?: string }>
  italianoLoeschen(benutzer: string): Promise<boolean>
}
function ipc(): ItIpc | null {
  const a = (window as unknown as { electronAPI?: Partial<ItIpc> }).electronAPI
  return a && typeof a.italianoLaden === 'function' && typeof a.italianoSpeichern === 'function' && typeof a.italianoLoeschen === 'function' ? a as ItIpc : null
}
const lc = (s: string) => (s || '').trim().toLowerCase()

/** Geladenes prüfen und fehlende Felder ergänzen (ältere Stände, beschädigte Datei). */
export function pruefeDaten(roh: unknown, benutzer: string): ItDaten | null {
  if (!roh || typeof roh !== 'object') return null
  const d = roh as Partial<ItDaten>
  if (d.v !== 1 || lc(String(d.benutzer ?? '')) !== lc(benutzer)) return null   // fremde oder unbekannte Datei: nicht anzeigen
  const leer = leereDaten(benutzer, heute())
  const obj = <T extends object>(x: unknown, sonst: T): T => (x && typeof x === 'object' && !Array.isArray(x) ? x as T : sonst)
  const zahl = (x: unknown, sonst: number, von: number, bis: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(von, Math.min(bis, Math.round(x))) : sonst)
  return {
    ...leer,
    begonnen: typeof d.begonnen === 'string' ? d.begonnen : leer.begonnen,
    level: zahl(d.level, 1, 1, LEVEL_ANZAHL + 1),
    lektionen: zahl(d.lektionen, 0, 0, LEVEL_ANZAHL * TAGE_JE_LEVEL),
    lektionAm: obj(d.lektionAm, {}),
    sterne: obj(d.sterne, {}),
    pruefungen: Array.isArray(d.pruefungen) ? d.pruefungen : [],
    tests: Array.isArray(d.tests) ? d.tests : [],
    kasten: obj(d.kasten, {}),
    faehig: { ...leereFaehig(), ...obj(d.faehig, {}) },
    tage: obj(d.tage, {}),
    punkte: zahl(d.punkte, 0, 0, 1e9),
    joker: zahl(d.joker, 0, 0, JOKER_MAX),
    jokerTage: Array.isArray(d.jokerTage) ? d.jokerTage.filter(x => typeof x === 'string') : [],
    einstellungen: { ...leer.einstellungen, ...obj(d.einstellungen, {}) },
    gesehen: obj(d.gesehen, {}),
    urkunden: obj(d.urkunden, {}),
    abzeichen: obj(d.abzeichen, {}),
  }
}

export interface PruefungsQuittung { ok: boolean; aufstieg: boolean; quote: number; neuesLevel: number }

interface ItZustand {
  geladen: boolean
  benutzer: string
  daten: ItDaten
  /** kann dieser PC verschlüsselt speichern? Wenn nicht, bleibt alles nur für diese Sitzung. */
  verschluesselung: boolean
  speicherFehler: string | null
  /** Tage, die beim Öffnen ein Joker überbrückt hat (für den Hinweis) */
  jokerEingesetzt: string[]
  /** gab es schon gespeicherte Daten? (sonst: Begrüßung) */
  neu: boolean
  /** gerade verdiente Abzeichen, die noch nicht gezeigt wurden */
  neueAbzeichen: string[]
  /** das vorderste gezeigte Abzeichen abhaken */
  abzeichenGesehen: () => void

  lade: (benutzer: string) => Promise<void>
  sichere: () => Promise<void>
  setzeEinstellung: <K extends keyof ItEinstellungen>(k: K, v: ItEinstellungen[K]) => void
  merkeGesehen: (was: string) => void
  /** neue Wörter in den Karteikasten legen (Fach 1, morgen fällig) */
  lerneWoerter: (kennungen: readonly number[]) => void
  /** gewertete Antworten verbuchen; gibt die Punkte zurück */
  bucheErgebnisse: (ergebnisse: readonly Ergebnis[], sekunden: number) => number
  schliesseLektion: (tag: number) => void
  bucheTagestest: (tag: number, richtig: number, gesamt: number) => number
  buchePruefung: (level: number, richtig: number, gesamt: number, teile: Partial<Record<PruefungsTeil, [number, number]>>) => PruefungsQuittung
  bucheTest: (e: Omit<TestEintrag, 'am'>) => void
  /** Einstufung oder „an anderem PC weitermachen“: bei diesem Level beginnen */
  beginneBei: (level: number) => void
  bucheUrkunde: (name: string) => void
  loescheAlles: () => Promise<void>
}

let schreibTimer: ReturnType<typeof setTimeout> | null = null

export const useItaliano = create<ItZustand>((set, get) => {
  const schreibe = async (): Promise<void> => {
    if (schreibTimer) { clearTimeout(schreibTimer); schreibTimer = null }
    const { daten, benutzer, verschluesselung } = get()
    const i = ipc()
    if (!i || !benutzer || !verschluesselung) return
    try {
      const r = await i.italianoSpeichern(benutzer, JSON.stringify(daten))
      set({ speicherFehler: r.ok ? null : (r.fehler || 'Speichern fehlgeschlagen') })
    } catch (e) { set({ speicherFehler: (e as Error).message }) }
  }
  const plane = () => {
    if (schreibTimer) clearTimeout(schreibTimer)
    schreibTimer = setTimeout(() => { void schreibe() }, 600)
  }
  /** Daten ändern, neu verdiente Abzeichen eintragen, Speichern einplanen */
  const aendere = (f: (d: ItDaten) => ItDaten) => {
    let d = f(get().daten)
    const neu = verdient(d, heute()).filter(id => !d.abzeichen[id])
    if (neu.length) d = { ...d, abzeichen: { ...d.abzeichen, ...Object.fromEntries(neu.map(id => [id, heute()])) } }
    set(neu.length ? { daten: d, neueAbzeichen: [...get().neueAbzeichen, ...neu] } : { daten: d })
    plane()
  }
  /** Tageswerte fortschreiben */
  const mitTag = (d: ItDaten, aufgaben: number, richtig: number, sekunden: number, punkte: number): ItDaten => {
    const tag = heute()
    const alt = d.tage[tag] ?? [0, 0, 0, 0]
    return { ...d, punkte: d.punkte + punkte, tage: { ...d.tage, [tag]: [alt[0] + aufgaben, alt[1] + richtig, alt[2] + Math.max(0, Math.round(sekunden)), alt[3] + punkte] } }
  }

  return {
    geladen: false,
    benutzer: '',
    daten: leereDaten('', heute()),
    verschluesselung: false,
    speicherFehler: null,
    jokerEingesetzt: [],
    neu: false,
    neueAbzeichen: [],
    abzeichenGesehen: () => set({ neueAbzeichen: get().neueAbzeichen.slice(1) }),

    lade: async (benutzer) => {
      if (get().geladen && lc(get().benutzer) === lc(benutzer)) return
      const i = ipc()
      let daten: ItDaten | null = null
      let verschluesselung = false
      let fehler: string | null = null
      if (i) {
        try {
          const r = await i.italianoLaden(benutzer)
          verschluesselung = !!r.verschluesselung
          if (r.ok && r.daten) daten = pruefeDaten(JSON.parse(r.daten), benutzer)
          else if (!r.ok) fehler = r.fehler || 'Der gespeicherte Lernstand ließ sich nicht lesen.'
        } catch { /* keine oder unlesbare Datei → wie neu */ }
      }
      const neu = !daten
      const basis = daten ?? leereDaten(benutzer, heute())
      const { daten: mitJoker, eingesetzt } = setzeJokerEin(basis, heute())
      // Abzeichen still nachtragen (z. B. wenn neue dazugekommen sind) — ohne Feier, die gilt nur für frisch verdiente
      const nach = verdient(mitJoker, heute()).filter(id => !mitJoker.abzeichen[id])
      const stand = nach.length ? { ...mitJoker, abzeichen: { ...mitJoker.abzeichen, ...Object.fromEntries(nach.map(id => [id, heute()])) } } : mitJoker
      set({ geladen: true, benutzer, daten: stand, verschluesselung, speicherFehler: fehler, jokerEingesetzt: eingesetzt, neu, neueAbzeichen: [] })
      if (eingesetzt.length) plane()
    },

    sichere: schreibe,

    setzeEinstellung: (k, v) => aendere(d => ({ ...d, einstellungen: { ...d.einstellungen, [k]: v } })),
    merkeGesehen: (was) => { if (!get().daten.gesehen[was]) aendere(d => ({ ...d, gesehen: { ...d.gesehen, [was]: true } })) },

    lerneWoerter: (kennungen) => aendere(d => {
      const nr = tagNummer(heute())
      const kasten = { ...d.kasten }
      for (const k of kennungen) if (!kasten[k]) kasten[k] = neuerEintrag(nr)
      return { ...d, kasten }
    }),

    bucheErgebnisse: (ergebnisse, sekunden) => {
      if (!ergebnisse.length) return 0
      const richtig = ergebnisse.filter(e => e.richtig).length
      const punkte = richtig * PUNKTE.richtig
      aendere(d => {
        const nr = tagNummer(heute())
        const kasten = { ...d.kasten }
        const faehig = { ...d.faehig }
        for (const e of ergebnisse) {
          const alt = faehig[e.f] ?? [0, 0]
          faehig[e.f] = [alt[0] + (e.richtig ? 1 : 0), alt[1] + 1]
          for (const w of e.woerter) kasten[w.kennung] = bewerte(kasten[w.kennung], w.richtig, nr)
        }
        return mitTag({ ...d, kasten, faehig }, ergebnisse.length, richtig, sekunden, punkte)
      })
      return punkte
    },

    schliesseLektion: (tag) => aendere(d => {
      if (d.lektionAm[tag]) return d
      return mitTag({ ...d, lektionen: Math.max(d.lektionen, tag), lektionAm: { ...d.lektionAm, [tag]: heute() } }, 0, 0, 0, PUNKTE.lektion)
    }),

    bucheTagestest: (tag, richtig, gesamt) => {
      const sterne = sterneFuer(richtig, gesamt)
      aendere(d => {
        const besser = Math.max(d.sterne[tag] ?? 0, sterne)
        const neuePunkte = d.sterne[tag] === undefined ? sterne * PUNKTE.stern : Math.max(0, sterne - (d.sterne[tag] ?? 0)) * PUNKTE.stern
        const tests = [...d.tests, { art: 'tag' as const, am: jetzt().toISOString(), r: richtig, n: gesamt, tag }].slice(-MAX_TESTS)
        return mitTag({ ...d, sterne: { ...d.sterne, [tag]: besser }, tests }, 0, 0, 0, neuePunkte)
      })
      return sterne
    },

    buchePruefung: (level, richtig, gesamt, teile) => {
      const quote = gesamt ? richtig / gesamt : 0
      const ok = quote >= BESTEHEN_AB
      const vorher = get().daten.level
      const aufstieg = ok && level === vorher && vorher <= LEVEL_ANZAHL
      const eintrag: PruefungEintrag = { level, am: jetzt().toISOString(), r: richtig, n: gesamt, teile, ok }
      aendere(d => {
        const basis = { ...d, pruefungen: [...d.pruefungen, eintrag].slice(-400) }
        if (!aufstieg) return basis
        return mitTag({ ...basis, level: d.level + 1, joker: Math.min(JOKER_MAX, d.joker + 1) }, 0, 0, 0, PUNKTE.pruefung)
      })
      void schreibe()
      return { ok, aufstieg, quote, neuesLevel: aufstieg ? vorher + 1 : vorher }
    },

    bucheTest: (e) => aendere(d => ({ ...d, tests: [...d.tests, { ...e, am: jetzt().toISOString() }].slice(-MAX_TESTS) })),

    beginneBei: (level) => aendere(d => {
      const l = Math.max(1, Math.min(LEVEL_ANZAHL, Math.round(level)))
      if (l <= d.level) return d
      return { ...d, level: l, lektionen: Math.max(d.lektionen, (l - 1) * TAGE_JE_LEVEL) }
    }),

    bucheUrkunde: (name) => aendere(d => (d.urkunden[name] ? d : { ...d, urkunden: { ...d.urkunden, [name]: heute() } })),

    loescheAlles: async () => {
      const { benutzer } = get()
      if (schreibTimer) { clearTimeout(schreibTimer); schreibTimer = null }
      try { await ipc()?.italianoLoeschen(benutzer) } catch { /* egal */ }
      set({ daten: leereDaten(benutzer, heute()), speicherFehler: null, jokerEingesetzt: [], neu: true, neueAbzeichen: [] })
    },
  }
})
