// Brain Trainer — eigener Zustand und lokale, verschlüsselte Ablage.
//
// Privatsphäre (Vorgabe des Nutzers, 17.11.2026):
//  • Ergebnisse sieht NUR der eigene Benutzer.
//  • Gespeichert wird nur mit Zustimmung — und nur lokal auf diesem PC, verschlüsselt mit dem
//    Windows-Konto (Electron safeStorage/DPAPI, siehe electron/brainSpeicher.ts).
//  • Nichts davon liegt auf dem Netzlaufwerk. Dorthin geht nur, was der Benutzer selbst teilt
//    (Bestenliste, Chat) oder was ein laufendes Duell braucht.
//  • Ohne Zustimmung bleibt alles im Arbeitsspeicher und ist nach dem Schließen weg.
import { create } from 'zustand'
import type { BrainDaten, BrainEinstellungen, DuellEintrag, Gebiet, IqEintrag, Lauf, Rohergebnis } from './typen'
import { leereDaten, tagVon } from './typen'
import { brainPunkte, naechsteStufe, RUNTER_UNTER } from './wertung'
import { ABZEICHEN, verdienteAbzeichen, type AbzeichenInfo } from './fortschritt'

const MAX_LAEUFE = 4000

interface LadeAntwort { ok: boolean; daten: string | null; verschluesselung: boolean; fehler?: string }
interface BrainIpc {
  brainLaden(benutzer: string): Promise<LadeAntwort>
  brainSpeichern(benutzer: string, json: string): Promise<{ ok: boolean; fehler?: string }>
  brainLoeschen(benutzer: string): Promise<boolean>
}
function ipc(): BrainIpc | null {
  const a = (window as unknown as { electronAPI?: Partial<BrainIpc> }).electronAPI
  return a && typeof a.brainLaden === 'function' && typeof a.brainSpeichern === 'function' && typeof a.brainLoeschen === 'function' ? a as BrainIpc : null
}

const lc = (s: string) => (s || '').trim().toLowerCase()
const merkSchluessel = (benutzer: string) => `bt_zustimmung_${lc(benutzer)}`
function merkeNein(benutzer: string, nein: boolean) {
  try { if (nein) localStorage.setItem(merkSchluessel(benutzer), 'nein'); else localStorage.removeItem(merkSchluessel(benutzer)) } catch { /* egal */ }
}
function hatNeinGesagt(benutzer: string): boolean {
  try { return localStorage.getItem(merkSchluessel(benutzer)) === 'nein' } catch { return false }
}

/** Geladenes prüfen und fehlende Felder ergänzen (ältere Stände, beschädigte Datei). */
function pruefe(roh: unknown, benutzer: string): BrainDaten | null {
  if (!roh || typeof roh !== 'object') return null
  const d = roh as Partial<BrainDaten>
  if (d.v !== 1 || lc(String(d.benutzer ?? '')) !== lc(benutzer)) return null   // fremde oder unbekannte Datei: nicht anzeigen
  const leer = leereDaten(benutzer, true)
  return {
    ...leer, ...d,
    benutzer,
    einstellungen: { ...leer.einstellungen, ...(d.einstellungen ?? {}), speichern: true },
    stufen: d.stufen && typeof d.stufen === 'object' ? d.stufen : {},
    hoechst: d.hoechst && typeof d.hoechst === 'object' ? d.hoechst : {},
    laeufe: Array.isArray(d.laeufe) ? d.laeufe : [],
    tage: d.tage && typeof d.tage === 'object' ? d.tage : {},
    iq: Array.isArray(d.iq) ? d.iq : [],
    duelle: Array.isArray(d.duelle) ? d.duelle : [],
    abzeichen: d.abzeichen && typeof d.abzeichen === 'object' ? d.abzeichen : {},
    gesehen: d.gesehen && typeof d.gesehen === 'object' ? d.gesehen : {},
  }
}

export interface LaufBuchung {
  uebung: string
  gebiet: Gebiet
  stufe: number
  ergebnis: Rohergebnis
  dauerSek: number
  quelle: Lauf['q']
}
export interface LaufQuittung {
  punkte: number
  stufeVorher: number
  stufeNeu: number
  bestwert: boolean
  neueAbzeichen: AbzeichenInfo[]
}

interface BrainZustand {
  geladen: boolean
  benutzer: string
  daten: BrainDaten
  /** null = noch nicht gefragt · true = lokal speichern · false = nur diese Sitzung */
  zustimmung: boolean | null
  /** kann dieser PC verschlüsselt speichern? */
  verschluesselung: boolean
  speicherFehler: string | null

  lade: (benutzer: string) => Promise<void>
  setzeZustimmung: (ja: boolean) => Promise<void>
  stufeVon: (uebung: string) => number
  setzeStufe: (uebung: string, stufe: number) => void
  bucheLauf: (b: LaufBuchung) => LaufQuittung
  markiereTagesTraining: () => void
  speichereIq: (e: IqEintrag) => AbzeichenInfo[]
  loescheIq: (t: string) => void
  bucheDuell: (e: DuellEintrag) => AbzeichenInfo[]
  setzeEinstellung: <K extends keyof BrainEinstellungen>(k: K, v: BrainEinstellungen[K]) => void
  merkeGesehen: (uebung: string, kennung: number, behalten?: number) => void
  loescheAlles: () => Promise<void>
  /** sofort schreiben (z. B. beim Verlassen) */
  sichere: () => Promise<void>
}

let schreibTimer: ReturnType<typeof setTimeout> | null = null

export const useBrain = create<BrainZustand>((set, get) => {
  const schreibe = async (): Promise<void> => {
    if (schreibTimer) { clearTimeout(schreibTimer); schreibTimer = null }
    const { daten, zustimmung, benutzer } = get()
    const i = ipc()
    if (!i || zustimmung !== true || !benutzer) return
    try {
      const r = await i.brainSpeichern(benutzer, JSON.stringify(daten))
      set({ speicherFehler: r.ok ? null : (r.fehler || 'Speichern fehlgeschlagen') })
    } catch (e) { set({ speicherFehler: (e as Error).message }) }
  }
  const plane = () => {
    if (schreibTimer) clearTimeout(schreibTimer)
    schreibTimer = setTimeout(() => { void schreibe() }, 600)
  }
  /** Daten ändern, Abzeichen nachziehen, Speichern einplanen. Gibt die NEU verdienten Abzeichen zurück. */
  const aendere = (f: (d: BrainDaten) => BrainDaten): AbzeichenInfo[] => {
    let d = f(get().daten)
    const neu = verdienteAbzeichen(d).filter(id => !d.abzeichen[id])
    if (neu.length) {
      const am = new Date().toISOString()
      d = { ...d, abzeichen: { ...d.abzeichen, ...Object.fromEntries(neu.map(id => [id, am])) } }
    }
    set({ daten: d })
    plane()
    return ABZEICHEN.filter(a => neu.includes(a.id))
  }

  return {
    geladen: false,
    benutzer: '',
    daten: leereDaten('', false),
    zustimmung: null,
    verschluesselung: false,
    speicherFehler: null,

    lade: async (benutzer) => {
      if (get().geladen && lc(get().benutzer) === lc(benutzer)) return
      const i = ipc()
      let daten: BrainDaten | null = null
      let verschluesselung = false
      if (i) {
        try {
          const r = await i.brainLaden(benutzer)
          verschluesselung = !!r.verschluesselung
          if (r.ok && r.daten) daten = pruefe(JSON.parse(r.daten), benutzer)
        } catch { /* keine oder unlesbare Datei → wie neu */ }
      }
      if (daten) {
        // Abzeichen nachziehen (z. B. wenn neue Abzeichen dazugekommen sind)
        const fehlend = verdienteAbzeichen(daten).filter(id => !daten!.abzeichen[id])
        if (fehlend.length) { const am = new Date().toISOString(); daten = { ...daten, abzeichen: { ...daten.abzeichen, ...Object.fromEntries(fehlend.map(id => [id, am])) } } }
        set({ geladen: true, benutzer, daten, zustimmung: true, verschluesselung, speicherFehler: null })
        return
      }
      // nichts gespeichert: kann der PC nicht verschlüsseln oder wurde früher „nur diese Sitzung“
      // gewählt → nicht speichern; sonst noch nie gefragt (null → Frage beim Öffnen)
      const zustimmung = !verschluesselung || hatNeinGesagt(benutzer) ? false : null
      set({ geladen: true, benutzer, daten: leereDaten(benutzer, false), zustimmung, verschluesselung, speicherFehler: null })
    },

    setzeZustimmung: async (ja) => {
      const { benutzer, daten, verschluesselung } = get()
      const darf = ja && verschluesselung
      merkeNein(benutzer, !darf)
      set({ zustimmung: darf, daten: { ...daten, einstellungen: { ...daten.einstellungen, speichern: darf } } })
      if (darf) await schreibe()
      else { try { await ipc()?.brainLoeschen(benutzer) } catch { /* egal */ } }
    },

    stufeVon: (uebung) => get().daten.stufen[uebung] ?? 1,

    setzeStufe: (uebung, stufe) => { aendere(d => ({ ...d, stufen: { ...d.stufen, [uebung]: Math.max(1, Math.min(10, Math.round(stufe))) } })) },

    bucheLauf: (b) => {
      const punkte = brainPunkte(b.stufe, b.ergebnis.leistung)
      const vorher = get().daten
      const bisherBest = Math.max(0, ...vorher.laeufe.filter(l => l.u === b.uebung).map(l => l.p))
      const stufeNeu = b.quelle === 'duell' ? (vorher.stufen[b.uebung] ?? b.stufe) : naechsteStufe(b.stufe, b.ergebnis.leistung)
      const jetzt = new Date()
      const lauf: Lauf = {
        u: b.uebung, g: b.gebiet, t: jetzt.toISOString(), s: b.stufe, p: punkte,
        r: b.ergebnis.richtig, n: b.ergebnis.gesamt, d: Math.max(1, Math.round(b.dauerSek)), q: b.quelle,
        ...(b.ergebnis.rtMs ? { ms: Math.round(b.ergebnis.rtMs) } : {}),
      }
      const neueAbzeichen = aendere(d => {
        const tag = tagVon(jetzt)
        const alt = d.tage[tag] ?? { n: 0, p: 0, g: [], d: 0 }
        const laeufe = d.laeufe.length >= MAX_LAEUFE ? d.laeufe.slice(d.laeufe.length - MAX_LAEUFE + 1) : d.laeufe.slice()
        laeufe.push(lauf)
        return {
          ...d, laeufe,
          tage: { ...d.tage, [tag]: { ...alt, n: alt.n + 1, p: alt.p + punkte, g: alt.g.includes(b.gebiet) ? alt.g : [...alt.g, b.gebiet], d: alt.d + lauf.d } },
          stufen: { ...d.stufen, [b.uebung]: stufeNeu },
          // „höchste Stufe“ zählt nur, wenn sie auch geschafft wurde (frei gewählte, aber verpatzte Stufen nicht)
          hoechst: { ...d.hoechst, [b.uebung]: Math.max(d.hoechst[b.uebung] ?? 1, b.ergebnis.leistung >= RUNTER_UNTER ? Math.max(b.stufe, stufeNeu) : 1) },
        }
      })
      return { punkte, stufeVorher: b.stufe, stufeNeu, bestwert: vorher.laeufe.some(l => l.u === b.uebung) && punkte > bisherBest, neueAbzeichen }
    },

    markiereTagesTraining: () => {
      aendere(d => {
        const tag = tagVon()
        const alt = d.tage[tag] ?? { n: 0, p: 0, g: [], d: 0 }
        return { ...d, tage: { ...d.tage, [tag]: { ...alt, heute: true } } }
      })
    },

    speichereIq: (e) => aendere(d => ({ ...d, iq: [...d.iq, e] })),
    loescheIq: (t) => { aendere(d => ({ ...d, iq: d.iq.filter(x => x.t !== t) })) },
    bucheDuell: (e) => aendere(d => ({ ...d, duelle: [...d.duelle.slice(-499), e] })),

    setzeEinstellung: (k, v) => { aendere(d => ({ ...d, einstellungen: { ...d.einstellungen, [k]: v } })) },

    merkeGesehen: (uebung, kennung, behalten = 80) => {
      const d = get().daten
      const liste = [...(d.gesehen[uebung] ?? []).filter(x => x !== kennung), kennung].slice(-behalten)
      set({ daten: { ...d, gesehen: { ...d.gesehen, [uebung]: liste } } })
      plane()
    },

    loescheAlles: async () => {
      const { benutzer, zustimmung } = get()
      if (schreibTimer) { clearTimeout(schreibTimer); schreibTimer = null }
      try { await ipc()?.brainLoeschen(benutzer) } catch { /* egal */ }
      set({ daten: leereDaten(benutzer, zustimmung === true), speicherFehler: null })
      if (zustimmung === true) await schreibe()
    },

    sichere: schreibe,
  }
})
