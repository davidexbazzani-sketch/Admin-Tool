// Terra Incognita — die Schleuse für ALLE Zugriffe des Spiels aufs Netzlaufwerk.
//
// Warum: Im Hauptprozess laufen Dateizugriffe über wenige Arbeitsfäden (libuv, vier Stück), die sich das ganze Tool
// teilt. Antwortet das Laufwerk nicht, hängt jeder Zugriff, bis Windows aufgibt — und belegt so lange einen Faden.
// Vier hängende Zugriffe, und nichts im Tool kann mehr eine Datei lesen oder schreiben (auch nicht den lokalen
// Spielstand). Deshalb:
//  • höchstens zwei Zugriffe gleichzeitig — auch aufgegebene zählen, bis sie wirklich zurückkommen
//  • antwortet einer nicht rechtzeitig, macht das Spiel Pause (30 s, dann länger) und versucht es dann mit EINEM Zugriff
//  • ist der Raum zu, geht gar nichts hinaus
// Das Spiel selbst wartet nie auf einen dieser Zugriffe: Gespielt wird mit dem lokalen Stand.

export type NetzGrund = 'zu' | 'pause' | 'zeit' | 'fehler'
export type NetzErgebnis<T> = { ok: true; wert: T } | { ok: false; grund: NetzGrund }

/** einstellbar für Tests */
export const netzEinstellung = { gleichzeitig: 2, zeitMs: 8000, pausen: [30000, 60000, 120000, 300000] }

let offen = false
let unterwegs = 0
let pauseBis = 0
let pausenStufe = 0
let probeLaeuft = false
let wartende: (() => void)[] = []
/** für die Leistungsprüfung: wie viele Zugriffe liefen je gleichzeitig, wie viele insgesamt */
export const netzZaehler = { gesamt: 0, hoechstens: 0 }

export function oeffneNetz(): void { offen = true }
export function schliesseNetz(): void {
  offen = false
  const w = wartende
  wartende = []
  for (const weiter of w) weiter()
}
export type NetzZustand = 'zu' | 'ok' | 'pause'
export function netzZustand(): NetzZustand { return !offen ? 'zu' : Date.now() < pauseBis ? 'pause' : 'ok' }
/** nur für Tests: alles auf Anfang */
export function netzZurueck(): void { offen = false; unterwegs = 0; pauseBis = 0; pausenStufe = 0; probeLaeuft = false; wartende = []; netzZaehler.gesamt = 0; netzZaehler.hoechstens = 0 }

function platzFrei(): void {
  unterwegs--
  const weiter = wartende.shift()
  if (weiter) weiter()
}

/** Einen Zugriff durch die Schleuse schicken. Wirft nie. */
export async function netz<T>(zugriff: () => Promise<T>, zeitMs: number = netzEinstellung.zeitMs): Promise<NetzErgebnis<T>> {
  if (!offen) return { ok: false, grund: 'zu' }
  let probe = false
  if (pausenStufe > 0) {
    // nach einer Störung: bis zum Ende der Pause gar nichts, danach genau ein Versuch
    if (Date.now() < pauseBis || probeLaeuft) return { ok: false, grund: 'pause' }
    probe = true
    probeLaeuft = true
  }
  while (unterwegs >= netzEinstellung.gleichzeitig) {
    await new Promise<void>(r => wartende.push(r))
    if (!offen) { if (probe) probeLaeuft = false; return { ok: false, grund: 'zu' } }
    if (!probe && pausenStufe > 0) return { ok: false, grund: 'pause' }
  }
  unterwegs++
  netzZaehler.gesamt++
  if (unterwegs > netzZaehler.hoechstens) netzZaehler.hoechstens = unterwegs
  let fertig = false
  let uhr: ReturnType<typeof setTimeout> | undefined
  const lauf = (async () => {
    try { return { ok: true as const, wert: await zugriff() } }
    catch { return { ok: false as const, grund: 'fehler' as const } }
    finally { fertig = true; platzFrei() }        // der Platz wird erst frei, wenn der Zugriff wirklich zurück ist
  })()
  const zeit = new Promise<{ ok: false; grund: 'zeit' }>(r => { uhr = setTimeout(() => r({ ok: false, grund: 'zeit' }), zeitMs) })
  const ergebnis = await Promise.race([lauf, zeit])
  if (uhr !== undefined) clearTimeout(uhr)
  if (!ergebnis.ok && ergebnis.grund === 'zeit' && !fertig) {
    pauseBis = Date.now() + netzEinstellung.pausen[Math.min(pausenStufe, netzEinstellung.pausen.length - 1)]
    pausenStufe++
    // wer noch ansteht, soll nicht auch noch hängen bleiben
    const w = wartende
    wartende = []
    for (const weiter of w) weiter()
  } else if (ergebnis.ok || fertig) {
    pausenStufe = 0
    pauseBis = 0
  }
  if (probe) probeLaeuft = false
  return ergebnis
}

// ── die einzelnen Zugriffe ──
interface NetzApi {
  netListDirAsync(pfad: string): Promise<string[]>
  netReadJsonAsync(pfad: string): Promise<unknown>
  netWriteJsonAsync(pfad: string, daten: unknown): Promise<boolean>
  netDeleteFileAsync(pfad: string): Promise<boolean>
  netCreateExclusiveAsync(pfad: string, daten: unknown): Promise<'ok' | 'vorhanden' | 'fehler'>
  netReadJsonStatusAsync(pfad: string): Promise<{ status: 'ok' | 'fehlt' | 'kaputt' | 'fehler'; daten?: unknown }>
  netListDirStatusAsync(pfad: string): Promise<{ ok: boolean; namen: string[] }>
  netDeleteEmptyDirAsync(pfad: string): Promise<boolean>
}
const api = (): NetzApi => (globalThis as unknown as { electronAPI: NetzApi }).electronAPI

export const netzListe = (pfad: string): Promise<NetzErgebnis<string[]>> => netz(() => api().netListDirAsync(pfad))
export const netzLies = <T>(pfad: string): Promise<NetzErgebnis<T | null>> => netz(() => api().netReadJsonAsync(pfad) as Promise<T | null>)
export const netzLiesGenau = (pfad: string): Promise<NetzErgebnis<{ status: 'ok' | 'fehlt' | 'kaputt' | 'fehler'; daten?: unknown }>> => netz(() => api().netReadJsonStatusAsync(pfad))
export const netzSchreibe = (pfad: string, daten: unknown): Promise<NetzErgebnis<boolean>> => netz(() => api().netWriteJsonAsync(pfad, daten))
export const netzLegeAn = (pfad: string, daten: unknown): Promise<NetzErgebnis<'ok' | 'vorhanden' | 'fehler'>> => netz(() => api().netCreateExclusiveAsync(pfad, daten))
export const netzLoesche = (pfad: string): Promise<NetzErgebnis<boolean>> => netz(() => api().netDeleteFileAsync(pfad))
/** Verzeichnis lesen — antwortet das Laufwerk nicht, ist das ein Fehler (nie ein scheinbar leeres Verzeichnis) */
export const netzListeGenau = (pfad: string): Promise<NetzErgebnis<string[]>> => netz(async () => {
  const r = await api().netListDirStatusAsync(pfad)
  if (!r || r.ok !== true) throw new Error('Laufwerk antwortet nicht')
  return Array.isArray(r.namen) ? r.namen : []
})
/** ein leeres Verzeichnis entfernen */
export const netzLoescheOrdner = (pfad: string): Promise<NetzErgebnis<boolean>> => netz(() => api().netDeleteEmptyDirAsync(pfad))
