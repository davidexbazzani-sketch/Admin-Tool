// ── Sound Fix: Dienstschicht für die Daylis-Aktion „Sound Fix“ ───────────────
// Bündelt die drei Teile, die bei Ton-Problemen nacheinander (oder einzeln) durch-
// gegangen werden:
//   1. Sound-Treiber   — derselbe HP-Scan wie im Menüpunkt „Treiber-Installation“,
//                        aber auf sound-relevante SoftPaqs eingegrenzt.
//   2. Sound-Dienste   — Audiosrv & Co. mit Status, Starttyp und Steuerung.
//   3. Audio-Geräte    — die Bausteine aus audioDevices.ts (Remote-Doc-Kategorie
//                        „Audio & Sound“), hier mit richtiger Oberfläche statt Textausgabe.
//
// Die Oberfläche dazu steht in src/components/device/SoundFixPanel.tsx; sie läuft
// sowohl eingebettet (Daylis) als auch in einem eigenen Fenster (#soundfix).

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import type { DriverItem, HpHostReport } from './hpDrivers'
import {
  buildAudioListInner, buildAudioSwitchInner, buildAudioVolumeInner, buildAudioMuteInner,
} from './audioDevices'

// ── Hilfen ───────────────────────────────────────────────────────────────────

function escPs(s: string): string { return s.replace(/'/g, "''") }

/**
 * Gerätenamen als Suchmuster für `-like` entschärfen. Die Bausteine in
 * audioDevices.ts suchen mit `-like ('*' + $suche + '*')`; ein `[` im Namen würde
 * dort als Zeichenklasse gelten und nicht mehr treffen. In `-like` schützt der
 * Backtick die Platzhalterzeichen.
 */
export function likeEscape(s: string): string {
  return s.replace(/([*?[\]`])/g, '`$1')
}

async function ps(script: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  return api().runPowerShell(script, timeoutMs)
}

/** JSON aus einer PowerShell-Ausgabe lösen und immer als Liste liefern. */
function parseListe<T>(stdout: string): T[] {
  const s = (stdout || '').trim()
  if (!s) return []
  const i = Math.min(...[s.indexOf('['), s.indexOf('{')].filter(x => x >= 0))
  const j = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'))
  const cand = Number.isFinite(i) && j > i ? s.slice(i, j + 1) : s
  try {
    const v = JSON.parse(cand)
    return Array.isArray(v) ? v as T[] : [v as T]
  } catch { return [] }
}

/** WinRM sicherstellen — wie in dailyCommands.ts, damit die Fehlermeldung dieselbe ist. */
async function mitWinRM<T>(host: string, fn: () => Promise<T>, beiFehler: (text: string) => T): Promise<T> {
  try {
    const ok = await ensureWinRM(host)
    if (!ok) return beiFehler(`WinRM konnte auf ${host} nicht aktiviert werden — Dienst nicht erreichbar oder Berechtigungen fehlen.`)
  } catch (e) {
    return beiFehler(`WinRM-Aktivierung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
  }
  return fn()
}

// ══ Teil 1: Sound-Treiber ════════════════════════════════════════════════════

// Was als „sound-relevant“ gilt. Die HP-Kategorie allein reicht nicht: Audio-SoftPaqs
// liegen je nach Modell unter „Driver - Audio or Sound“, aber auch unter „Software -
// Multimedia“ oder beim Chipsatz (Intel Smart Sound). Deshalb zusätzlich über den Namen.
// Reine Audio-Marken (Conexant, Dolby, DTS, Waves/MaxxAudio, Bang & Olufsen, Nahimic, IDT)
// zählen für sich; Mischhersteller wie Realtek NICHT — sonst käme auch deren Kartenleser-
// oder Netzwerktreiber mit. Deren Audio-SoftPaqs tragen „Audio“ ohnehin im Namen.
const SOUND_RE = /audio|sound|lautsprech|mikrofon|microphone|headset|speaker|conexant|dolby|nahimic|olufsen|maxxaudio|waves|\bdts\b|\bidt\b/i

/** Ist dieser Treiber für Ton-Probleme relevant? BIOS/Firmware bleiben außen vor. */
export function istSoundTreiber(it: DriverItem): boolean {
  if (it.klasse === 'bios') return false
  return SOUND_RE.test(`${it.category} ${it.name}`)
}

/**
 * Vorauswahl für die Aktualisierung: alles, was offen ist UND sicher zu diesem Rechner
 * gehört. Unsichere Treffer (nur über den Hersteller gematcht) bleiben abgewählt — der
 * Bediener kann sie bewusst dazunehmen.
 */
export function istVorausgewaehlt(it: DriverItem): boolean {
  if (it.status !== 'veraltet' && it.status !== 'verfuegbar') return false
  if (it.matchUnsicher) return false
  return it.anwendbar || it.ohneHardwareBezug
}

// Letztes Suchergebnis je PC — modulweit, nicht in der Komponente. Die Suche kostet
// bis zu fünf Minuten; wird das Fenster versehentlich geschlossen oder der Abschnitt
// zugeklappt, soll das Ergebnis beim erneuten Öffnen wieder da sein. Gilt nur für die
// laufende Sitzung (Dienste und Geräte sind billig nachzuladen und werden nicht gemerkt).
const treiberSuchen = new Map<string, { bericht: HpHostReport; gewaehlt: string[] }>()

export function merkeTreiberSuche(host: string, bericht: HpHostReport, gewaehlt: string[]): void {
  treiberSuchen.set(host.toLowerCase(), { bericht, gewaehlt })
}

export function holeTreiberSuche(host: string): { bericht: HpHostReport; gewaehlt: string[] } | undefined {
  return treiberSuchen.get(host.toLowerCase())
}

// ══ Teil 2: Sound-Dienste ════════════════════════════════════════════════════

export interface SoundService {
  name: string
  displayName: string
  state: string        // Running | Stopped | …
  startMode: string    // Auto | Manual | Disabled
  startName: string    // Konto, unter dem der Dienst läuft
  wichtig: boolean     // Kerndienst — ohne ihn gibt es gar keinen Ton
  hinweis: string      // kurze Erklärung für den Bediener
}

/** Kerndienste mit Erklärung — alles andere wird dynamisch dazugefunden. */
const KERN: Record<string, string> = {
  audiosrv: 'Der Audiodienst selbst. Steht er, gibt es auf dem ganzen PC keinen Ton (Lautsprechersymbol mit rotem Kreuz).',
  audioendpointbuilder: 'Erkennt Lautsprecher, Headsets und Mikrofone. Steht er, ist die Geräteliste im Sound-Dialog leer und Audiosrv startet nicht.',
  mmcss: 'Priorisiert Audio gegenüber anderen Programmen. Fehlt er, knackt oder stottert der Ton unter Last.',
  bthavctpsvc: 'Steuerkanal für Bluetooth-Kopfhörer und -Lautsprecher.',
  btagservice: 'Bluetooth-Audiogateway — nötig für Headset-Mikrofone über Bluetooth.',
}

const KERN_NAMEN = Object.keys(KERN)

/** Dienste auf dem Ziel-PC, die mit Ton zu tun haben. */
export async function listeSoundDienste(host: string): Promise<{ ok: boolean; dienste: SoundService[]; fehler?: string }> {
  return mitWinRM(host, async () => {
    const inner = [
      `$muster = 'audio|sound|conexant|waves|maxxaudio|dolby|olufsen|nahimic|avctp'`,
      `$kern = @('Audiosrv','AudioEndpointBuilder','MMCSS','BthAvctpSvc','BTAGService')`,
      `$alle = @(Get-CimInstance Win32_Service -EA SilentlyContinue | Where-Object {`,
      `  $kern -contains $_.Name -or $_.Name -match $muster -or $_.DisplayName -match $muster })`,
      `$alle | Select-Object Name, DisplayName, State, StartMode, StartName | Sort-Object DisplayName | ConvertTo-Json -Depth 3 -Compress`,
    ].join('\n')
    const script = `try { Invoke-Command -ComputerName '${escPs(host)}' -ScriptBlock { ${inner} } -EA Stop } catch { Write-Output ('FEHLER:' + $_.Exception.Message) }`
    const r = await ps(script, 90000)
    const out = (r.stdout || '').trim()
    if (out.startsWith('FEHLER:')) return { ok: false, dienste: [], fehler: out.slice(7) }
    const roh = parseListe<{ Name?: string; DisplayName?: string; State?: string; StartMode?: string; StartName?: string }>(out)
    if (!roh.length) return { ok: false, dienste: [], fehler: r.stderr?.trim() || 'Keine Dienste gefunden — antwortet der PC über WinRM?' }
    const dienste: SoundService[] = roh
      .filter(x => x.Name)
      .map(x => {
        const key = String(x.Name).toLowerCase()
        return {
          name: String(x.Name),
          displayName: String(x.DisplayName || x.Name),
          state: String(x.State || ''),
          startMode: String(x.StartMode || ''),
          startName: String(x.StartName || ''),
          wichtig: KERN_NAMEN.includes(key),
          hinweis: KERN[key] || '',
        }
      })
    // Kerndienste zuerst — in der Reihenfolge, in der man sie prüft.
    dienste.sort((a, b) => {
      const ra = a.wichtig ? KERN_NAMEN.indexOf(a.name.toLowerCase()) : 99
      const rb = b.wichtig ? KERN_NAMEN.indexOf(b.name.toLowerCase()) : 99
      return ra - rb || a.displayName.localeCompare(b.displayName, 'de')
    })
    return { ok: true, dienste }
  }, text => ({ ok: false, dienste: [], fehler: text }))
}

export type DienstAktion = 'start' | 'stop' | 'restart' | 'auto'

/** Rückmeldung einer Dienst-Aktion — mit dem neuen Zustand, damit die Oberfläche
 *  nur diese eine Zeile auffrischen muss statt alle Dienste neu zu lesen. */
export interface DienstErgebnis { ok: boolean; text: string; state?: string; startMode?: string }

/**
 * Dienst steuern. „auto“ setzt den Starttyp auf Automatisch — nötig, weil ein auf
 * „Deaktiviert“ gesetzter Audiodienst sich sonst gar nicht starten lässt (häufigste
 * Ursache, wenn Ton nach einer Software-Installation komplett weg ist).
 */
export async function steuereDienst(host: string, name: string, aktion: DienstAktion): Promise<DienstErgebnis> {
  return mitWinRM(host, async () => {
    const n = escPs(name)
    const befehl =
      aktion === 'start' ? `Start-Service -Name '${n}' -EA Stop`
      : aktion === 'stop' ? `Stop-Service -Name '${n}' -Force -EA Stop`
      : aktion === 'restart' ? `Restart-Service -Name '${n}' -Force -EA Stop`
      : `Set-Service -Name '${n}' -StartupType Automatic -EA Stop`
    const inner = [
      `try {`,
      `  ${befehl}`,
      `  Start-Sleep -Milliseconds 800`,
      `  $s = Get-CimInstance Win32_Service -Filter "Name='${n}'" -EA SilentlyContinue`,
      `  Write-Output ('OK:' + $(if ($s) { $s.State + '|' + $s.StartMode } else { 'unbekannt|unbekannt' }))`,
      `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
    ].join('\n')
    const script = `try { Invoke-Command -ComputerName '${escPs(host)}' -ScriptBlock { ${inner} } -EA Stop } catch { Write-Output ('ERR:' + $_.Exception.Message) }`
    const r = await ps(script, 120000)
    const zeile = (r.stdout || '').split(/\r?\n/).map(l => l.trim()).find(l => l.startsWith('OK:') || l.startsWith('ERR:'))
    if (!zeile) return { ok: false, text: r.stderr?.trim() || 'Keine Rückmeldung vom PC' }
    if (zeile.startsWith('ERR:')) return { ok: false, text: zeile.slice(4) }
    const [state, mode] = zeile.slice(3).split('|')
    const was = aktion === 'start' ? 'gestartet' : aktion === 'stop' ? 'gestoppt' : aktion === 'restart' ? 'neu gestartet' : 'auf Starttyp „Automatisch“ gesetzt'
    return { ok: true, text: `${name} ${was} — Status jetzt: ${state}, Starttyp: ${mode}`, state, startMode: mode }
  }, text => ({ ok: false, text }))
}

// ══ Teil 3: Audio-Geräte ═════════════════════════════════════════════════════

export interface AudioGeraet {
  typ: string          // Wiedergabe | Aufnahme
  name: string
  guid: string         // eindeutige Kennung des Endpunkts — Namen sind mehrfach vergeben!
  zustand: string      // Aktiv | Deaktiviert | Nicht angeschlossen | …
  standard: boolean
  pegel: number | null // Prozent, null wenn nicht ermittelbar
  stumm: boolean | null
  schaltbar: string    // 'ja' | 'nur ueber Registry'
}

/** Wiedergabe- und Aufnahmegeräte des Ziel-PCs auslesen. */
export async function listeAudioGeraete(host: string): Promise<{ ok: boolean; geraete: AudioGeraet[]; fehler?: string }> {
  return mitWinRM(host, async () => {
    const script = `try { Invoke-Command -ComputerName '${escPs(host)}' -ScriptBlock { ${buildAudioListInner(true)} } -EA Stop } catch { Write-Output ('FEHLER:' + $_.Exception.Message) }`
    const r = await ps(script, 120000)
    const out = (r.stdout || '').trim()
    if (out.startsWith('FEHLER:')) return { ok: false, geraete: [], fehler: out.slice(7) }
    const roh = parseListe<Record<string, unknown>>(out)
    if (!roh.length) return { ok: false, geraete: [], fehler: r.stderr?.trim() || 'Keine Audio-Geräte gemeldet — antwortet der PC über WinRM?' }
    const geraete = roh.map(x => {
      const pegelRoh = String(x.Pegel ?? '').replace('%', '').trim()
      const stummRoh = String(x.Stumm ?? '').trim().toLowerCase()
      return {
        typ: String(x.Typ ?? ''),
        name: String(x.Geraet ?? ''),
        guid: String(x.Guid ?? ''),
        zustand: String(x.Zustand ?? ''),
        standard: String(x.Standard ?? '').trim().toLowerCase() === 'ja',
        pegel: pegelRoh ? Number(pegelRoh) : null,
        stumm: stummRoh === 'ja' ? true : stummRoh === 'nein' ? false : null,
        schaltbar: String(x.Schaltbar ?? ''),
      } as AudioGeraet
    }).filter(g => g.name)
    return { ok: true, geraete }
  }, text => ({ ok: false, geraete: [], fehler: text }))
}

/** Ein Baustein aus audioDevices.ts auf dem Ziel-PC ausführen und die Antwort deuten. */
async function audioBaustein(host: string, inner: string, timeoutMs: number): Promise<{ ok: boolean; text: string }> {
  return mitWinRM(host, async () => {
    const script = `try { Invoke-Command -ComputerName '${escPs(host)}' -ScriptBlock { ${inner} } -EA Stop } catch { Write-Output ('ERR:' + $_.Exception.Message) }`
    const r = await ps(script, timeoutMs)
    const zeilen = (r.stdout || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const treffer = zeilen.find(l => l.startsWith('OK:') || l.startsWith('ERR:'))
    if (!treffer) return { ok: false, text: zeilen.join('\n') || r.stderr?.trim() || 'Keine Rückmeldung vom PC' }
    return treffer.startsWith('OK:') ? { ok: true, text: treffer.slice(3) } : { ok: false, text: treffer.slice(4) }
  }, text => ({ ok: false, text }))
}

/**
 * Wie das Gerät angesprochen wird. IMMER über die GUID, wenn vorhanden: ein PC führt
 * mehrere Endpunkte mit demselben Namen (gemessen: dreimal „Speaker (Realtek(R) Audio)“ —
 * einer aktiv, zwei Reste früherer Anschlüsse). Über den Namen landet jede Aktion auf dem
 * aktiven Gerät, auch wenn der Bediener eine andere Zeile angeklickt hat.
 */
function kennung(g: Pick<AudioGeraet, 'name' | 'guid'>): string {
  return g.guid || likeEscape(g.name)
}

/** Audio-Gerät aktivieren oder deaktivieren (PnP, sonst Registry im SYSTEM-Kontext). */
export async function schalteAudioGeraet(host: string, g: Pick<AudioGeraet, 'name' | 'guid'>, aktivieren: boolean) {
  // Der Registry-Weg registriert eine Aufgabe und wartet bis zu 30 s auf deren Ergebnis.
  return audioBaustein(host, buildAudioSwitchInner(aktivieren, kennung(g)), 180000)
}

/** Pegel eines Geräts in Prozent setzen. */
export async function setzeAudioPegel(host: string, g: Pick<AudioGeraet, 'name' | 'guid'>, prozent: number) {
  const p = Math.max(0, Math.min(100, Math.round(prozent)))
  return audioBaustein(host, buildAudioVolumeInner(`${kennung(g)}=${p}`), 120000)
}

/** Stummschaltung eines Geräts setzen. */
export async function setzeAudioStumm(host: string, g: Pick<AudioGeraet, 'name' | 'guid'>, stumm: boolean) {
  return audioBaustein(host, buildAudioMuteInner(`${kennung(g)}=${stumm ? 'an' : 'aus'}`), 120000)
}
