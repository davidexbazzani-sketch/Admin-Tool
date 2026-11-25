// Lokale, verschlüsselte Ablagen je Benutzer — für den Brain Trainer, „Parla Italiano“ und „Terra Incognita“.
//
// Vorgabe des Nutzers (17.11.2026, Brain Trainer): Trainings- und Testergebnisse sieht ausdrücklich
// NUR der eigene Benutzer; sie liegen lokal auf dem Rechner, verschlüsselt. Für „Parla Italiano“
// (18.11.2026) gilt dasselbe für Fortschritt und Ergebnisse.
//  • Ort:  %APPDATA%\IT Admin Tool\<ordner>\<Kennung><endung>   (NICHT auf dem Netzlaufwerk)
//  • Schutz: Electron safeStorage = Windows-DPAPI, an das Windows-Konto gebunden. Ein anderes
//    Windows-Konto (auch ein Administrator, der die Datei kopiert) kann sie nicht entschlüsseln.
//  • Der Dateiname ist ein Hash des Tool-Benutzernamens — am Namen ist nicht zu erkennen, wem
//    die Datei gehört. Der Inhalt trägt den Benutzernamen; der Renderer zeigt nur Passendes.
//  • Alles asynchron (fs.promises), Schreiben über Zwischendatei + Umbenennen.
//  • Je Ablage läuft immer nur EIN Vorgang (schreiben, löschen, beiseitelegen): Überschneiden sich zwei Aufrufe,
//    folgt der zweite auf den ersten — so kann nie eine halb geschriebene Zwischendatei zum Spielstand werden.
//  • Terra Incognita (19.11.2026): Spielstand und aufgedeckte Karte. Eine Datei, die sich nicht lesen ließ, wird
//    nie überschrieben, sondern beiseitegelegt („….defekt-<Zeit>“); ebenso der bisherige Stand, bevor eine
//    Sicherung übernommen wird („….alt-<Zeit>“).
import { app, ipcMain, safeStorage } from 'electron'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import { join } from 'path'

const MAX_BYTES = 8 * 1024 * 1024     // Schutz gegen Unsinn: mehr als 8 MB wird nicht geschrieben

function kannVerschluesseln(): boolean {
  try { return safeStorage.isEncryptionAvailable() } catch { return false }
}

export interface BrainLadeAntwort { ok: boolean; daten: string | null; verschluesselung: boolean; fehler?: string }

interface AblageArt {
  /** Unterordner in userData */
  ordner: string
  /** geht in den Hash des Dateinamens ein */
  salz: string
  endung: string
  /** Kennung am Dateianfang (Format-Version) */
  kopf: string
}

function erstelleAblage(art: AblageArt) {
  const ordner = (): string => join(app.getPath('userData'), art.ordner)
  const kennung = (benutzer: string): string => createHash('sha256').update(art.salz + String(benutzer || '').trim().toLowerCase()).digest('hex').slice(0, 32)
  const pfad = (benutzer: string): string => join(ordner(), kennung(benutzer) + art.endung)

  async function laden(benutzer: string): Promise<BrainLadeAntwort> {
    const verschluesselung = kannVerschluesseln()
    if (!benutzer || !verschluesselung) return { ok: true, daten: null, verschluesselung }
    try {
      const roh = await fs.readFile(pfad(benutzer))
      if (roh.subarray(0, art.kopf.length).toString('latin1') !== art.kopf) return { ok: false, daten: null, verschluesselung, fehler: 'Unbekanntes Dateiformat' }
      const klar = safeStorage.decryptString(roh.subarray(art.kopf.length))
      return { ok: true, daten: klar, verschluesselung }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { ok: true, daten: null, verschluesselung }
      // z. B. Datei von einem anderen Windows-Konto → nicht entschlüsselbar
      return { ok: false, daten: null, verschluesselung, fehler: (e as Error).message }
    }
  }

  /** ein Vorgang nach dem anderen (siehe oben) */
  let kette: Promise<unknown> = Promise.resolve()
  function derReihe<T>(tun: () => Promise<T>): Promise<T> {
    const lauf = kette.then(tun, tun)
    kette = lauf.then(() => undefined, () => undefined)
    return lauf
  }

  async function schreibe(benutzer: string, json: string): Promise<{ ok: boolean; fehler?: string }> {
    if (!benutzer) return { ok: false, fehler: 'Kein Benutzer' }
    if (!kannVerschluesseln()) return { ok: false, fehler: 'Verschlüsselung auf diesem PC nicht verfügbar' }
    if (typeof json !== 'string' || json.length > MAX_BYTES) return { ok: false, fehler: 'Daten zu groß' }
    try {
      const geheim = safeStorage.encryptString(json)
      const ziel = pfad(benutzer)
      await fs.mkdir(ordner(), { recursive: true })
      const tmp = ziel + '.tmp'
      await fs.writeFile(tmp, Buffer.concat([Buffer.from(art.kopf, 'latin1'), geheim]))
      await fs.rename(tmp, ziel)
      return { ok: true }
    } catch (e) {
      return { ok: false, fehler: (e as Error).message }
    }
  }
  const speichern = (benutzer: string, json: string): Promise<{ ok: boolean; fehler?: string }> => derReihe(() => schreibe(benutzer, json))

  function loeschen(benutzer: string): Promise<boolean> {
    return derReihe(async () => {
      if (!benutzer) return false
      try { await fs.unlink(pfad(benutzer)) } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return false }
      try { await fs.unlink(pfad(benutzer) + '.tmp') } catch { /* egal */ }
      return true
    })
  }

  /** Eine Datei wegräumen statt überschreiben: Sie bleibt als „….<grund>-<Zeit>“ liegen (defekt = ließ sich nicht
   *  lesen und lässt sich vielleicht später retten; alt = der bisherige Stand vor dem Übernehmen einer Sicherung),
   *  und der Platz ist frei für einen neuen Stand. Je Grund bleiben die drei jüngsten liegen. */
  function beiseite(benutzer: string, grund: 'defekt' | 'alt' = 'defekt'): Promise<boolean> {
    return derReihe(async () => {
      if (!benutzer) return false
      const quelle = pfad(benutzer)
      try { await fs.rename(quelle, `${quelle}.${grund}-${Date.now()}`) }
      catch (e) { return (e as NodeJS.ErrnoException).code === 'ENOENT' }
      try {
        const vorne = `${kennung(benutzer)}${art.endung}.${grund}-`
        const alte = (await fs.readdir(ordner())).filter(n => n.startsWith(vorne)).sort().reverse().slice(3)
        for (const n of alte) { try { await fs.unlink(join(ordner(), n)) } catch { /* egal */ } }
      } catch { /* Aufräumen ist nicht wichtig */ }
      return true
    })
  }

  return { laden, speichern, loeschen, beiseite }
}

// Brain Trainer: Namen und Format unverändert seit 17.11.2026 — bestehende Dateien bleiben lesbar.
const brain = erstelleAblage({ ordner: 'brain', salz: 'brain|', endung: '.bt', kopf: 'BT1\n' })
// Parla Italiano: Lernstand, Ergebnisse, Reisepass.
const italiano = erstelleAblage({ ordner: 'italiano', salz: 'italiano|', endung: '.pi', kopf: 'PI1\n' })
// Terra Incognita: Spielstand und — getrennt, weil sie nur selten wächst — die aufgedeckte Karte.
const terra = erstelleAblage({ ordner: 'terra', salz: 'terra|', endung: '.ti', kopf: 'TI1\n' })
const terraKarte = erstelleAblage({ ordner: 'terra', salz: 'terra-karte|', endung: '.tk', kopf: 'TK1\n' })
// Der Coach (25.11.2026): Lernstand, das „Buch“ (alles Geschriebene) und die Vergleichsaufnahmen der eigenen Stimme —
// getrennt, damit der oft geschriebene Lernstand klein bleibt und die Aufnahmen nur bei Bedarf geladen werden.
const coach = erstelleAblage({ ordner: 'coach', salz: 'coach|', endung: '.dc', kopf: 'DC1\n' })
const coachBuch = erstelleAblage({ ordner: 'coach', salz: 'coach-buch|', endung: '.dcb', kopf: 'DB1\n' })
const coachTon = erstelleAblage({ ordner: 'coach', salz: 'coach-ton|', endung: '.dct', kopf: 'DT1\n' })

export const ladeBrain = brain.laden
export const speichereBrain = brain.speichern
export const loescheBrain = brain.loeschen
/** für den Test des Hauptprozesses (.tmp-test/terra/main_test.cjs) */
export const terraAblagen = { stand: terra, karte: terraKarte }
/** für den Test des Hauptprozesses (.tmp-test/coach/main_test.cjs) */
export const coachAblagen = { coach, coachBuch, coachTon }

/** Einmal beim Start aufrufen (safeStorage selbst wird erst bei Benutzung angesprochen, also nach app.whenReady). */
export function registriereBrainSpeicher(): void {
  ipcMain.handle('brain:laden', (_e, benutzer: string) => brain.laden(String(benutzer || '')))
  ipcMain.handle('brain:speichern', (_e, benutzer: string, json: string) => brain.speichern(String(benutzer || ''), json))
  ipcMain.handle('brain:loeschen', (_e, benutzer: string) => brain.loeschen(String(benutzer || '')))
  ipcMain.handle('italiano:laden', (_e, benutzer: string) => italiano.laden(String(benutzer || '')))
  ipcMain.handle('italiano:speichern', (_e, benutzer: string, json: string) => italiano.speichern(String(benutzer || ''), json))
  ipcMain.handle('italiano:loeschen', (_e, benutzer: string) => italiano.loeschen(String(benutzer || '')))
  for (const [name, ablage] of [['terra', terra], ['terraKarte', terraKarte], ['coach', coach], ['coachBuch', coachBuch], ['coachTon', coachTon]] as const) {
    ipcMain.handle(`${name}:laden`, (_e, benutzer: string) => ablage.laden(String(benutzer || '')))
    ipcMain.handle(`${name}:speichern`, (_e, benutzer: string, json: string) => ablage.speichern(String(benutzer || ''), json))
    ipcMain.handle(`${name}:loeschen`, (_e, benutzer: string) => ablage.loeschen(String(benutzer || '')))
    ipcMain.handle(`${name}:beiseite`, (_e, benutzer: string, kennung?: string) => ablage.beiseite(String(benutzer || ''), kennung === 'alt' ? 'alt' : 'defekt'))
  }
}
