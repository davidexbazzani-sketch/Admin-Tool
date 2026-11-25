// Der Coach — Lernstand im Arbeitsspeicher (zustand) und auf der Platte (drei verschlüsselte Ablagen über den Host).
//  • Eine Datei, die sich nicht lesen ließ, wird nie überschrieben, sondern beiseitegelegt.
//  • Ein Stand aus einer neueren Tool-Version wird nur gelesen (Hinweis), nichts wird geschrieben.
//  • Geschrieben wird entprellt (1,5 s), am Ende jedes Blocks und beim Verlassen — erst das Buch, dann der Lernstand.
//  • Benutzerwechsel: Jeder Schreibvorgang nennt den Benutzer ausdrücklich; nach einem Wechsel wird nichts Altes geschrieben.
import { create } from 'zustand'
import { host } from '../host/aktiv'
import type { BuchEintrag, CoachBuch, CoachDaten } from './typen'
import { leereDaten, leeresBuch, DATEN_V } from './typen'
import { pruefeBuch, pruefeDaten } from './uebergang'
import { heute, jetzt } from './zeit'
import { tagNummer } from './zeit'

/** Inhaltsstand, der beim Speichern mitgeschrieben wird (setzt der Raum, sobald das Verzeichnis geladen ist).
 *  Der Speicher selbst lädt keine Inhalte — so bleibt die Kachel im Pausenraum klein. */
let inhaltsstand = 0
export function merkeInhaltsstand(iv: number): void { inhaltsstand = iv }

export type Ladezustand = 'ok' | 'neu' | 'nurLesen' | 'ohneVerschluesselung'

interface Zustand {
  geladen: boolean
  benutzer: string
  daten: CoachDaten
  buch: CoachBuch
  zustand: Ladezustand
  /** gerade beiseitegelegte Datei (Hinweis an den Nutzer) */
  beiseite: string | null
  fehler: string | null
  lade: (benutzer: string) => Promise<void>
  aendere: (f: (d: CoachDaten) => CoachDaten) => void
  aendereBuch: (f: (b: CoachBuch) => CoachBuch) => void
  schreibeIns: (e: Omit<BuchEintrag, 'id' | 'tag'> & { id?: string }) => string
  sichere: () => Promise<void>
  exportiere: () => string
  importiere: (json: string) => Promise<string | null>
  loescheAlles: () => Promise<void>
}

let uhr: ReturnType<typeof setTimeout> | null = null
let buchGeaendert = false
let datenGeaendert = false
let kette: Promise<void> = Promise.resolve()
const lc = (s: string) => (s || '').trim().toLowerCase()
let zaehler = 0
const neueId = () => `${jetzt().getTime().toString(36)}${(zaehler++).toString(36)}`

export const useCoach = create<Zustand>((set, get) => {
  const schreibe = (): Promise<void> => {
    if (uhr) { clearTimeout(uhr); uhr = null }
    const { daten, buch, benutzer, zustand } = get()
    const b = buchGeaendert, d = datenGeaendert
    buchGeaendert = false; datenGeaendert = false
    if (!benutzer || zustand === 'nurLesen' || zustand === 'ohneVerschluesselung' || (!b && !d)) return kette
    kette = kette.then(async () => {
      if (lc(get().benutzer) !== lc(benutzer)) return
      try {
        if (b) { const r = await host().ablage('coachBuch').speichern(benutzer, JSON.stringify(buch)); if (!r.ok) set({ fehler: r.fehler || 'Speichern fehlgeschlagen' }) }
        if (d) { const r = await host().ablage('coach').speichern(benutzer, JSON.stringify({ ...daten, iv: Math.max(daten.iv, inhaltsstand) })); set({ fehler: r.ok ? null : (r.fehler || 'Speichern fehlgeschlagen') }) }
      } catch (e) { set({ fehler: (e as Error).message }) }
    })
    return kette
  }
  const plane = () => { if (uhr) clearTimeout(uhr); uhr = setTimeout(() => { void schreibe() }, 1500) }

  return {
    geladen: false, benutzer: '', daten: leereDaten('', heute()), buch: leeresBuch(''), zustand: 'neu', beiseite: null, fehler: null,

    lade: async (benutzer) => {
      if (get().geladen && lc(get().benutzer) === lc(benutzer)) return
      if (get().geladen) await schreibe()
      const tag = heute()
      let daten: CoachDaten | null = null
      let buch: CoachBuch | null = null
      let zustand: Ladezustand = 'ok'
      let beiseite: string | null = null
      const h = host()
      const [rd, rb] = await Promise.all([h.ablage('coach').laden(benutzer), h.ablage('coachBuch').laden(benutzer)])
      if (!rd.verschluesselung) zustand = 'ohneVerschluesselung'
      // Lernstand
      if (rd.ok && rd.daten) {
        let roh: unknown = null
        try { roh = JSON.parse(rd.daten) } catch { roh = null }
        const p = pruefeDaten(roh, benutzer, tag)
        if (p.status === 'neuer') zustand = 'nurLesen'
        else if (p.daten) { daten = p.daten; if (p.status === 'ueberfuehrt') { await h.ablage('coach').beiseite(benutzer, 'alt'); datenGeaendert = true } }
        else { await h.ablage('coach').beiseite(benutzer, 'defekt'); beiseite = 'Der gespeicherte Lernstand ließ sich nicht lesen. Er liegt unverändert beiseite, du beginnst neu.' }
      } else if (!rd.ok && zustand !== 'ohneVerschluesselung') {
        await h.ablage('coach').beiseite(benutzer, 'defekt')
        beiseite = 'Der gespeicherte Lernstand ließ sich nicht entschlüsseln. Er liegt unverändert beiseite, du beginnst neu.'
      }
      // Buch
      if (rb.ok && rb.daten) {
        let roh: unknown = null
        try { roh = JSON.parse(rb.daten) } catch { roh = null }
        const p = pruefeBuch(roh, benutzer)
        if (p.status === 'neuer') zustand = 'nurLesen'
        else if (p.daten) buch = p.daten
        else await h.ablage('coachBuch').beiseite(benutzer, 'defekt')
      } else if (!rb.ok && rd.verschluesselung) await h.ablage('coachBuch').beiseite(benutzer, 'defekt')
      const neu = !daten
      const d0 = daten ?? leereDaten(benutzer, tag)
      set({ geladen: true, benutzer, daten: d0, buch: buch ?? leeresBuch(benutzer), zustand: neu && zustand === 'ok' ? 'neu' : zustand, beiseite, fehler: null })
    },

    aendere: (f) => {
      if (get().zustand === 'nurLesen') return
      set({ daten: f(get().daten) }); datenGeaendert = true; plane()
    },
    aendereBuch: (f) => {
      if (get().zustand === 'nurLesen') return
      set({ buch: f(get().buch) }); buchGeaendert = true; plane()
    },
    schreibeIns: (e) => {
      const id = e.id ?? neueId()
      const eintrag: BuchEintrag = { ...e, id, tag: tagNummer(heute()) } as BuchEintrag
      get().aendereBuch(b => ({ ...b, eintraege: [...b.eintraege.filter(x => x.id !== id), eintrag].slice(-2000) }))
      return id
    },
    sichere: schreibe,

    exportiere: () => JSON.stringify({ art: 'der-coach', v: DATEN_V, am: jetzt().toISOString(), daten: get().daten, buch: get().buch }, null, 1),
    importiere: async (json) => {
      const { benutzer } = get()
      let roh: { art?: string; daten?: unknown; buch?: unknown } | null = null
      try { roh = JSON.parse(json) } catch { return 'Die Datei ist kein gültiger Export des Coaches.' }
      if (!roh || roh.art !== 'der-coach') return 'Die Datei ist kein Export des Coaches.'
      const d = roh.daten && typeof roh.daten === 'object' ? { ...(roh.daten as object), benutzer } : null
      const b = roh.buch && typeof roh.buch === 'object' ? { ...(roh.buch as object), benutzer } : null
      const p = pruefeDaten(d, benutzer, heute())
      if (p.status === 'neuer') return 'Dieser Export stammt aus einer neueren Fassung des Tools.'
      if (!p.daten) return 'Der Export ließ sich nicht lesen.'
      const pb = pruefeBuch(b, benutzer)
      await host().ablage('coach').beiseite(benutzer, 'alt')
      await host().ablage('coachBuch').beiseite(benutzer, 'alt')
      set({ daten: p.daten, buch: pb.daten ?? leeresBuch(benutzer), zustand: 'ok' })
      datenGeaendert = true; buchGeaendert = true
      await schreibe()
      return null
    },
    loescheAlles: async () => {
      const { benutzer } = get()
      if (uhr) { clearTimeout(uhr); uhr = null }
      datenGeaendert = false; buchGeaendert = false
      await kette
      await Promise.all([host().ablage('coach').loeschen(benutzer), host().ablage('coachBuch').loeschen(benutzer), host().ablage('coachTon').loeschen(benutzer)])
      set({ daten: leereDaten(benutzer, heute()), buch: leeresBuch(benutzer), zustand: 'neu', beiseite: null, fehler: null })
    },
  }
})
