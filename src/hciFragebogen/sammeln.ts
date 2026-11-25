// HCI-Fragebogen: Fernabfrage EINES Servers (nur lesend) + Ablage auf dem Netzlaufwerk.
// Cluster-Knoten werden nie abgefragt (serverSchonung.ts + Sperre im Hauptprozess).
import { api } from '../electronAPI'
import { fern, lies, kurzFehler } from '../services/serverZustand'
import { hostKey } from '../services/serverMonitor'
import { istClusterKnoten, NUR_PING_TEXT } from '../services/serverSchonung'
import { serverSteckbrief, standText } from '../services/serverListe'
import { protokolliere } from '../services/aktivitaet'
import { HCI_KOMPAKT, normalisiere } from './skript'
import { STANDARD_EINSTELLUNGEN, type Steckbrief } from './auswertung'
import type { HciBogen, HciEinstellungen, HciRoh } from './typen'

export const HCI_QUELLE = 'HCI-Fragebogen (nur lesen)'
export const HCI_ZEITLIMIT_MS = 7 * 60_000
export const HCI_ORDNER = 'server_monitor/hci'
const bogenDatei = (h: string) => `${HCI_ORDNER}/${hostKey(h)}.json`
const EINSTELLUNGEN_DATEI = `${HCI_ORDNER}/einstellungen.json`

/** EINEN Server abfragen (nur lesend). */
export async function sammle(host: string, e: Pick<HciEinstellungen, 'tage' | 'vorMin'>): Promise<{ ok: true; roh: HciRoh } | { ok: false; fehler: string }> {
  if (istClusterKnoten(host)) return { ok: false, fehler: NUR_PING_TEXT }
  const TAG = '@@HCIBOGEN@@'
  const r = await api().runPowerShell(fern(host, HCI_KOMPAKT, TAG, { tage: e.tage, vorMin: e.vorMin }, HCI_ZEITLIMIT_MS - 20_000), HCI_ZEITLIMIT_MS, { quelle: HCI_QUELLE, art: 'lesen' })
  const d = lies<Record<string, unknown>>(r.stdout, TAG)
  if (!d) return { ok: false, fehler: r.timedOut ? `Zeitüberschreitung nach ${Math.round(HCI_ZEITLIMIT_MS / 60000)} min` : kurzFehler(r.stderr) || 'keine Antwort per WinRM' }
  if (d.ok === false) return { ok: false, fehler: kurzFehler(String(d.fehler || 'Abfrage fehlgeschlagen')) }
  if (!d.system) return { ok: false, fehler: 'Antwort unvollständig (kein System-Abschnitt)' }
  return { ok: true, roh: normalisiere(d) }
}

const leer = (host: string): HciBogen => ({ v: 1, host: hostKey(host), eigene: {} })

export async function ladeBogen(host: string): Promise<HciBogen> {
  const d = await api().netReadJsonAsync<HciBogen>(bogenDatei(host)).catch(() => null)
  if (!d || typeof d !== 'object') return leer(host)
  return { ...leer(host), ...d, host: hostKey(host), eigene: d.eigene && typeof d.eigene === 'object' ? d.eigene : {}, roh: d.roh ? normalisiere(d.roh as unknown as Record<string, unknown>) : undefined }
}

export async function speichereBogen(b: HciBogen): Promise<boolean> {
  return api().netWriteJsonAsync(bogenDatei(b.host), b).catch(() => false)
}

export async function ladeEinstellungen(): Promise<HciEinstellungen> {
  const d = await api().netReadJsonAsync<Partial<HciEinstellungen>>(EINSTELLUNGEN_DATEI).catch(() => null)
  const tage = Number(d?.tage), vorMin = Number(d?.vorMin)
  return {
    problemSeit: /^\d{4}-\d{2}-\d{2}$/.test(d?.problemSeit || '') ? d!.problemSeit! : STANDARD_EINSTELLUNGEN.problemSeit,
    tage: tage >= 30 && tage <= 730 ? Math.round(tage) : STANDARD_EINSTELLUNGEN.tage,
    vorMin: vorMin >= 5 && vorMin <= 240 ? Math.round(vorMin) : STANDARD_EINSTELLUNGEN.vorMin,
  }
}
export async function speichereEinstellungen(e: HciEinstellungen): Promise<boolean> {
  return api().netWriteJsonAsync(EINSTELLUNGEN_DATEI, e).catch(() => false)
}

/** Angaben aus der SKFM-Serverliste (Anwendungen, Zuständige) für die Antworten 1 und 2. */
export async function ladeSteckbrief(host: string): Promise<Steckbrief | null> {
  const s = await serverSteckbrief(host).catch(() => null)
  if (!s) return null
  const aktiv = s.eintrag.anwendungen.some(a => a.zustand === 'aktiv') ? s.eintrag.anwendungen.filter(a => a.zustand === 'aktiv') : s.eintrag.anwendungen
  return {
    anwendungen: aktiv.filter(a => a.titel).map(a => ({ titel: a.titel, alias: a.alias || undefined, umgebung: a.umgebung })),
    zustaendig: s.eintrag.zustaendig, plattform: s.eintrag.plattform, stand: standText(s.stand),
  }
}

/** Server abfragen und das Ergebnis ablegen. Eigene (von Hand geänderte) Antworten bleiben erhalten. */
export async function erhebe(host: string, von: string, e: HciEinstellungen): Promise<{ ok: boolean; bogen: HciBogen; fehler?: string }> {
  const t0 = Date.now()
  const r = await sammle(host, e)
  const alt = await ladeBogen(host)
  const am = new Date().toISOString()
  if (!r.ok) {
    const bogen: HciBogen = { ...alt, versuch: { am, fehler: r.fehler } }
    await speichereBogen(bogen)
    protokolliere({ art: 'manuell', quelle: 'HCI-Fragebogen', aktion: 'Server abgefragt (nur lesend)', ziel: hostKey(host), ergebnis: `fehlgeschlagen: ${r.fehler}` })
    return { ok: false, bogen, fehler: r.fehler }
  }
  const bogen: HciBogen = { ...alt, roh: r.roh, erhoben: { am, von, dauerS: Math.round((Date.now() - t0) / 1000) }, versuch: undefined }
  const ok = await speichereBogen(bogen)
  protokolliere({
    art: 'manuell', quelle: 'HCI-Fragebogen', aktion: 'Server abgefragt (nur lesend)', ziel: hostKey(host),
    ergebnis: `gelesen in ${bogen.erhoben!.dauerS} s${ok ? '' : ' – Ablage auf dem Netzlaufwerk fehlgeschlagen'}`,
    details: ['Registry, WMI, Treiber-Dateiversionen, geplante Aufgaben, Ereignisprotokolle; nichts geändert'],
  })
  return { ok: true, bogen }
}

/** Eine Antwort von Hand ändern (`text === undefined` = zurück zum Vorschlag). */
export async function setzeEigene(host: string, nr: number, text: string | undefined, von: string): Promise<HciBogen> {
  const b = await ladeBogen(host)
  const eigene = { ...b.eigene }
  if (text === undefined) delete eigene[String(nr)]
  else eigene[String(nr)] = text
  const neu: HciBogen = { ...b, eigene, geaendert: { am: new Date().toISOString(), von } }
  await speichereBogen(neu)
  return neu
}
