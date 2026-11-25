// Terra Incognita — Spielstand im Arbeitsspeicher und auf der Platte.
//
// Gespielt wird ausschließlich mit dem lokalen, verschlüsselten Stand (Hauptprozess: electron/brainSpeicher.ts,
// Ablagen „terra“ und „terraKarte“). Regeln:
//  • Es läuft immer nur EIN Schreibvorgang; kommt währenddessen Neues, folgt danach genau einer mit dem letzten Stand.
//  • Was sich nicht lesen ließ, wird nie überschrieben: Der Spieler entscheidet (beiseitelegen, Sicherung holen).
//  • Ein Stand aus einer neueren Tool-Version wird gar nicht erst geöffnet.
//  • Beim Verlassen des Raums und beim Beenden des Tools wird sofort geschrieben.
import { create } from 'zustand'
import { karteAusText, karteZuText, type Karte } from './kern/nebel'
import { neuesSpiel, type Spiel, type Umwelt } from './kern/spiel'
import { pruefeStand, type TiStand } from './kern/stand'
import { tagNr } from './zeit'

interface LadeAntwort { ok: boolean; daten: string | null; verschluesselung: boolean; fehler?: string }
interface TiIpc {
  terraLaden(benutzer: string): Promise<LadeAntwort>
  terraSpeichern(benutzer: string, json: string): Promise<{ ok: boolean; fehler?: string }>
  terraLoeschen(benutzer: string): Promise<boolean>
  terraBeiseite(benutzer: string, kennung?: string): Promise<boolean>
  terraKarteLaden(benutzer: string): Promise<LadeAntwort>
  terraKarteSpeichern(benutzer: string, json: string): Promise<{ ok: boolean; fehler?: string }>
  terraKarteLoeschen(benutzer: string): Promise<boolean>
  terraKarteBeiseite(benutzer: string, kennung?: string): Promise<boolean>
}
function ipc(): TiIpc | null {
  const a = (window as unknown as { electronAPI?: Partial<TiIpc> }).electronAPI
  return a && typeof a.terraLaden === 'function' && typeof a.terraSpeichern === 'function' && typeof a.terraKarteLaden === 'function' ? a as TiIpc : null
}

export const umwelt = (): Umwelt => { const jetzt = Date.now(); return { tag: tagNr(jetzt), jetzt } }

/** Kennung dieses PCs (nicht geheim; unterscheidet zwei Geräte desselben Benutzers) */
export function geraeteKennung(): string {
  try {
    let k = localStorage.getItem('ti-geraet')
    if (!k) { k = Math.random().toString(36).slice(2, 8); localStorage.setItem('ti-geraet', k) }
    return k
  } catch { return 'ohne' }
}

export type Zustand = 'laedt' | 'neu' | 'bereit' | 'defekt' | 'neuer'

interface TerraStore {
  zustand: Zustand
  benutzer: string
  anzeigeName: string
  spiel: Spiel | null
  /** zählt jede Änderung — daran hängt das Neuzeichnen */
  rev: number
  /** zählt jeden WECHSEL des Spielstands (geladen, neu begonnen, Sicherung übernommen, gelöscht) — daran erkennt der
   *  Abgleich mit der gemeinsamen Welt, dass er das eigene Buch neu prüfen muss */
  standNr: number
  verschluesselung: boolean
  speicherFehler: string | null
  lade: (benutzer: string, anzeigeName: string) => Promise<void>
  beginne: (kapitaen: string, schiffName: string, flagge: [number, number, number, number]) => void
  /** Einen Spielzug ausführen. Alles, was den Stand ändert, läuft hier durch. */
  tue: <T>(zug: (spiel: Spiel, u: Umwelt) => T) => T
  /** sofort schreiben und warten, bis es auf der Platte ist */
  sichere: () => Promise<void>
  /** den unlesbaren Stand beiseitelegen und neu anfangen */
  legeBeiseite: () => Promise<void>
  /** Einen Stand aus der Sicherung übernehmen. Was bisher auf diesem PC lag, wird nicht überschrieben, sondern
   *  beiseitegelegt (auch ein unlesbarer Stand). */
  uebernimm: (standRoh: unknown, karteRoh: unknown) => Promise<boolean>
  loescheAlles: () => Promise<void>
  /** alles vergessen (Benutzerwechsel) */
  leere: () => void
}

// ── Schreiben: einer nach dem anderen ──
let schreibUhr: ReturnType<typeof setTimeout> | null = null
let laeuft: Promise<void> | null = null
let nochmal = false
let karteOffen = false
let felderZuletzt = -1

export const useTerra = create<TerraStore>((set, get) => {
  async function schreibeEinmal(): Promise<void> {
    const { spiel, benutzer, verschluesselung, zustand } = get()
    const i = ipc()
    if (!i || !spiel || !benutzer || !verschluesselung || zustand !== 'bereit') return
    try {
      const r = await i.terraSpeichern(benutzer, JSON.stringify(spiel.stand))
      let fehler = r.ok ? null : (r.fehler || 'Speichern fehlgeschlagen')
      if (karteOffen) {
        karteOffen = false
        const k = await i.terraKarteSpeichern(benutzer, JSON.stringify({ v: 1, benutzer, a: karteZuText(spiel.karte) }))
        if (!k.ok) { karteOffen = true; fehler = k.fehler || 'Die Karte ließ sich nicht speichern' }
      }
      if (get().speicherFehler !== fehler) set({ speicherFehler: fehler })
    } catch (e) {
      set({ speicherFehler: (e as Error).message || 'Speichern fehlgeschlagen' })
    }
  }
  function schreibe(): Promise<void> {
    if (schreibUhr) { clearTimeout(schreibUhr); schreibUhr = null }
    if (laeuft) { nochmal = true; return laeuft }
    laeuft = (async () => {
      do { nochmal = false; await schreibeEinmal() } while (nochmal)
      laeuft = null
    })()
    return laeuft
  }
  const plane = (): void => { if (schreibUhr) clearTimeout(schreibUhr); schreibUhr = setTimeout(() => { void schreibe() }, 600) }

  return {
    zustand: 'laedt', benutzer: '', anzeigeName: '', spiel: null, rev: 0, standNr: 0, verschluesselung: true, speicherFehler: null,

    lade: async (benutzer, anzeigeName) => {
      const name = (benutzer || '').toLowerCase()
      if (get().benutzer === name && get().zustand !== 'laedt') { if (anzeigeName && get().anzeigeName !== anzeigeName) set({ anzeigeName }); return }
      set({ zustand: 'laedt', benutzer: name, anzeigeName, spiel: null, speicherFehler: null })
      const i = ipc()
      if (!i || !name) { set({ zustand: 'neu', verschluesselung: false }); return }
      try {
        const [r, k] = await Promise.all([i.terraLaden(name), i.terraKarteLaden(name)])
        if (get().benutzer !== name) return
        const verschluesselung = !!r.verschluesselung
        if (!r.ok) { set({ zustand: 'defekt', verschluesselung, speicherFehler: r.fehler || 'Der Spielstand ließ sich nicht lesen.' }); return }
        if (!r.daten) { set({ zustand: 'neu', verschluesselung }); return }
        const u = umwelt()
        let roh: unknown
        try { roh = JSON.parse(r.daten) } catch { set({ zustand: 'defekt', verschluesselung, speicherFehler: 'Der Spielstand ist beschädigt.' }); return }
        const p = pruefeStand(roh, name, u.tag, u.jetzt)
        if (!p.ok) { set({ zustand: p.grund === 'neuer' ? 'neuer' : 'defekt', verschluesselung, speicherFehler: p.grund === 'neuer' ? null : 'Der Spielstand ist beschädigt.' }); return }
        let karte: Karte = new Map()
        if (k.ok && k.daten) { try { karte = karteAusText((JSON.parse(k.daten) as { a?: unknown }).a) } catch { /* Karte fehlt: wird beim Segeln neu aufgedeckt */ } }
        felderZuletzt = p.stand.statistik.felder
        karteOffen = false
        set({ zustand: 'bereit', spiel: { stand: p.stand, karte }, verschluesselung, rev: get().rev + 1, standNr: get().standNr + 1 })
      } catch (e) {
        if (get().benutzer === name) set({ zustand: 'defekt', speicherFehler: (e as Error).message || 'Der Spielstand ließ sich nicht lesen.' })
      }
    },

    beginne: (kapitaen, schiffName, flagge) => {
      const { benutzer, zustand } = get()
      if (zustand !== 'neu' || !benutzer) return
      const saat = (Math.floor(Math.random() * 0xFFFFFFFF) ^ Date.now()) >>> 0
      const spiel = neuesSpiel(benutzer, kapitaen, schiffName, saat, umwelt())
      spiel.stand.flagge = flagge
      felderZuletzt = spiel.stand.statistik.felder
      karteOffen = true
      set({ zustand: 'bereit', spiel, rev: get().rev + 1, standNr: get().standNr + 1 })
      void schreibe()
    },

    tue: zug => {
      const { spiel, zustand } = get()
      if (!spiel || zustand !== 'bereit') throw new Error('Kein Spiel geladen')
      const ergebnis = zug(spiel, umwelt())
      if (spiel.stand.statistik.felder !== felderZuletzt) { felderZuletzt = spiel.stand.statistik.felder; karteOffen = true }
      set({ rev: get().rev + 1 })
      plane()
      return ergebnis
    },

    sichere: () => schreibe(),

    legeBeiseite: async () => {
      const { benutzer } = get(), i = ipc()
      if (i && benutzer) { try { await i.terraBeiseite(benutzer); await i.terraKarteBeiseite(benutzer) } catch { /* dann eben nicht */ } }
      set({ zustand: 'neu', spiel: null, speicherFehler: null, standNr: get().standNr + 1 })
    },

    uebernimm: async (standRoh, karteRoh) => {
      const { benutzer, zustand } = get(), u = umwelt(), i = ipc()
      const p = pruefeStand(standRoh, benutzer, u.tag, u.jetzt)
      if (!p.ok) return false
      // erst alles Laufende zu Ende schreiben (der bisherige Stand kommt vollständig in die beiseitegelegte Datei),
      // dann die bisherigen Dateien wegräumen — überschrieben wird nie
      if (zustand === 'bereit') await schreibe()
      else { if (schreibUhr) { clearTimeout(schreibUhr); schreibUhr = null } if (laeuft) await laeuft }
      if (i && benutzer && zustand !== 'neu') {
        const kennung = zustand === 'defekt' ? 'defekt' : 'alt'
        try { if (!(await i.terraBeiseite(benutzer, kennung))) return false; await i.terraKarteBeiseite(benutzer, kennung) } catch { return false }
      }
      if (get().benutzer !== benutzer) return false
      felderZuletzt = p.stand.statistik.felder
      karteOffen = true
      set({ zustand: 'bereit', spiel: { stand: p.stand, karte: karteAusText(karteRoh) }, rev: get().rev + 1, standNr: get().standNr + 1, speicherFehler: null })
      await schreibe()
      return true
    },

    loescheAlles: async () => {
      const { benutzer } = get(), i = ipc()
      if (schreibUhr) { clearTimeout(schreibUhr); schreibUhr = null }
      if (laeuft) await laeuft
      if (i && benutzer) { await i.terraLoeschen(benutzer); await i.terraKarteLoeschen(benutzer) }
      set({ zustand: 'neu', spiel: null, speicherFehler: null, rev: get().rev + 1, standNr: get().standNr + 1 })
    },

    leere: () => { if (schreibUhr) { clearTimeout(schreibUhr); schreibUhr = null } set({ zustand: 'laedt', benutzer: '', spiel: null, standNr: get().standNr + 1 }) },
  }
})

export type { TiStand }
