// ── PC-Fehler: der Hintergrund-Scan („Proaktive Fehlersuche“) ─────────────────
// Eigener Scan mit eigenem Zeitplan (Einstellungen → Automatische Scans), getrennt vom
// Änderungsverlauf. Liest von jedem genutzten Client-PC die Fehler der letzten 7 Tage aus
// allen Windows-Ereignisprotokollen (am PC zusammengezählt) und prüft, ob Laufwerk I:
// verbunden ist. Nur lesend, unsichtbar für den Benutzer (Systemsitzung, kein Fenster),
// netzschonend wie der Änderungsverlauf: 12 PCs je Gruppe, höchstens 3 gleichzeitig.

import { api } from '../electronAPI'
import { zielPcs, leseGruppe, hostKey, tag, pause, istStartBlockiert, startBlockiert, GRUPPE, PAUSE_MS, GRUPPEN_TIMEOUT_MS, ABBRUCH_AB, type LaufErgebnis } from '../pcVerlauf/lesen'
import type { Antwort } from '../pcVerlauf/logik'
import { ladeUebersicht, merkeFehler, verarbeiteFehler, type FehlerMeldung } from './speicher'

export const PC_FEHLER_ID = 'pc-fehler'
export const PC_FEHLER_STATUS = 'pc-fehler/_scan_status.json'
export const PC_FEHLER_NACHLESE = 'pc-fehler/_nachlese.json'
/** Welche PCs heute schon gelesen wurden (für Nachlese und Fortsetzen nach Abbruch). */
const GELESEN = 'pc-fehler/_gelesen.json'

async function ladeGelesen(heute: string): Promise<Set<string>> {
  try { const g = await api().netReadJsonAsync<{ tag?: string; hosts?: string[] }>(GELESEN); return new Set(g?.tag === heute && Array.isArray(g.hosts) ? g.hosts : []) } catch { return new Set() }
}

/** Ein Durchgang über alle Client-PCs; PCs, die heute schon gelesen wurden, werden übersprungen. */
export async function runPcFehlerScan(_by: string, onTick?: () => void, nachlese = false): Promise<LaufErgebnis> {
  const uebersicht = await ladeUebersicht()
  if (!uebersicht) return { ok: false, summary: 'Netzlaufwerk nicht erreichbar – Fehlersuche nicht gelaufen.', gelesen: 0, gesamt: 0 }
  const alle = await zielPcs()
  if (!alle.length) return { ok: false, summary: 'Keine genutzten PCs in der Endgeräte-Übersicht gefunden.', gelesen: 0, gesamt: 0 }
  const heute = tag(new Date().toISOString())
  const schonGelesen = await ladeGelesen(heute)
  const offen = alle.filter(h => !schonGelesen.has(hostKey(h)))
  const z = { gelesen: 0, aus: 0, fehler: 0, mitBefund: 0, befunde: 0, bytes: 0 }
  let verbFehler = 0, ersterFehler = ''
  for (let i = 0; i < offen.length; i += GRUPPE) {
    const gruppe = offen.slice(i, i + GRUPPE)
    let antworten: Antwort[] = []
    try { antworten = await leseGruppe(gruppe, {}, GRUPPEN_TIMEOUT_MS, 'fehler') } catch (e) { if (istStartBlockiert(e)) return startBlockiert('Fehlersuche', alle.length, e); antworten = gruppe.map(h => ({ host: hostKey(h), art: 'fehler' as const, text: 'Gruppe fehlgeschlagen' })) }
    const meldung: FehlerMeldung = {}
    for (const a of antworten) {
      const host = hostKey(a.host)
      if (a.art === 'aus') { z.aus++; continue }
      if (a.art === 'fehler') { z.fehler++; verbFehler++; if (!ersterFehler) ersterFehler = a.text; continue }
      z.gelesen++; z.bytes += a.bytes; schonGelesen.add(host)
      const n = await verarbeiteFehler(host, a.roh.am, a.roh, uebersicht, meldung)
      if (n) { z.mitBefund++; z.befunde += n }
    }
    if (Object.keys(meldung).length) {
      await merkeFehler(meldung)
      for (const [h, e] of Object.entries(meldung)) { if (e) uebersicht.pcs[h] = e; else delete uebersicht.pcs[h] }
    }
    try { await api().netWriteJsonAsync(GELESEN, { tag: heute, hosts: [...schonGelesen] }) } catch { /* egal */ }
    onTick?.()
    // Notbremse wie beim Änderungsverlauf: Port offen, aber kein PC antwortet richtig → WinRM gestört
    if (z.gelesen === 0 && verbFehler >= ABBRUCH_AB) {
      return {
        ok: false, nichtWiederholen: true, gelesen: 0, gesamt: alle.length,
        summary: `Fehlersuche abgebrochen: Bei ${verbFehler} PCs war der WinRM-Port offen, aber keiner ließ sich lesen (${(ersterFehler || 'ohne Fehlertext').slice(0, 160)}). Vermutlich ist WinRM gestört (Proxy/Zscaler auf Port 5985) oder die Berechtigung fehlt – die übrigen ${Math.max(0, offen.length - i - gruppe.length)} PCs wurden nicht mehr angefragt.`,
      }
    }
    if (i + GRUPPE < offen.length) await pause(PAUSE_MS)
  }
  const schon = alle.length - offen.length
  await merkeFehler({}, z.gelesen + schon)
  const teile = [
    `${z.gelesen + schon} von ${alle.length} PCs gelesen`, schon ? `${schon} schon vorher` : '',
    `${z.mitBefund} mit Befund (${z.befunde} Fehlerbild(er))`, `${z.aus} aus/nicht erreichbar`, z.fehler ? `${z.fehler} nicht lesbar` : '',
    `übertragen ${Math.max(1, Math.round(z.bytes / 1024))} KB`,
  ].filter(Boolean)
  return { ok: true, summary: `${nachlese ? 'Nachlese' : 'Fehlersuche'}: ${teile.join(' · ')}`, gelesen: z.gelesen, gesamt: alle.length }
}
