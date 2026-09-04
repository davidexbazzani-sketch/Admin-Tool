// ── SolidWorks-Diagnose: Skript-Registry ─────────────────────────────────────
// Neues Skript hinzufügen = EIN Eintrag hier + die .ps1 unter
// public/diagnose/solidworks/ ablegen. Die Kachel liest die Liste, mehr nicht.

import { api } from '../electronAPI'
import type { SwSkript } from './swCheck.types'

export const SW_SKRIPTE: SwSkript[] = [
  {
    id: 'bestandsaufnahme', titel: 'Arbeitsplatz-Bestandsaufnahme',
    datei: 'SOLIDWORKS_Bestandsaufnahme.ps1', ziel: 'client',
    ausgaben: ['txt', 'json'], standard: true,
  },
  {
    id: 'tiefenanalyse', titel: 'Tiefenanalyse (umfassend)',
    datei: 'SOLIDWORKS_Tiefenanalyse.ps1', ziel: 'client',
    ausgaben: ['txt', 'json'], standard: true,
    // -OhneMessung schaltet ALLE Netz-Dateizugriffe ab (Durchsatz/Enum/Get-Acl auf
    // Freigaben/Toolbox) — die blockieren aus der Remote-Sitzung am Double-Hop.
    // Die Befunde (RDP-Rendering, AutoRecover-Pfad, AV-Ausnahmen, Toolbox-im-Netz)
    // kommen aus Registry/CIM und bleiben erhalten. -OhneAufgabe: keine geplante
    // Aufgabe (read-only). -HiveLaden: nur nötig, wenn niemand angemeldet ist.
    remoteArgs: '-HiveLaden -OhneAufgabe -OhneMessung', timeoutMs: 600000,
    // Dateibasiert (in-shell): Skript schreibt selbst per -Ausgabeordner (schnelle -Depth-8-
    // Serialisierung), Wrapper liest nur die Datei → keine langsame Wrapper-Serialisierung.
    fileBased: true,
  },
  {
    id: 'server', titel: 'Lizenz-/PortaX-Server',
    datei: 'SOLIDWORKS_Server_W3143.ps1', ziel: 'server',
    parameter: { Server: 'w3143' },
    ausgaben: ['txt'], standard: true,
  },
  {
    id: 'bewertung', titel: 'Bewertung & Messung (Modul 4)',
    datei: 'SOLIDWORKS_Bewertung.ps1', ziel: 'client',
    // Bewusst NICHT vorausgewählt: gezielt anhaken (bewertet/misst statt zu sammeln).
    ausgaben: ['txt', 'json'], standard: false,
    // Aus der WinRM-Sitzung scheitert jeder Netzzugriff am Doppelhop → vorerst ohne
    // Freigabemessung (Block 3). Der Bericht schreibt den fehlenden Kernwert selbst in
    // „Was dieser Lauf nicht messen konnte".
    remoteArgs: '-OhneFreigabemessung', timeoutMs: 600000,
    // Dateibasiert wie die Tiefenanalyse: Skript schreibt selbst per -Ausgabeordner,
    // Wrapper liest nur die Datei (vermeidet WinRM-Shell-Speicher/Serialisierungslast).
    fileBased: true,
  },
  {
    id: 'herkunft', titel: 'Herkunft der Einstellungen (Modul 5)',
    datei: 'SOLIDWORKS_Herkunft.ps1', ziel: 'client',
    // Rein lesend: WER verwaltet eine Einstellung (lokal / GPO / Intune-CSP / HKCU) und
    // ueber welchen Weg ist sie aenderbar. Liefert die Tabelle „Einstellung → Eigentuemer
    // → Weg" als Vorlage fuer Schritt 2. Bewusst NICHT vorausgewaehlt: gezielt anhaken.
    ausgaben: ['txt', 'json'], standard: false,
    // Leichtgewichtig (Registry/CIM + gpresult) → in-shell wie die Bestandsaufnahme,
    // kein -Ausgabeordner noetig. gpresult kann etwas dauern → grosszuegiger Timeout.
    timeoutMs: 300000,
  },
  // Neues Skript = ein Eintrag hier + die .ps1 unter public/diagnose/solidworks/ ablegen.
]

function b64ToUtf8(b64: string): string {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

/** Skriptinhalt aus dem gebündelten Asset lesen (public/ → dist/ via readAsset). */
export async function loadSkriptText(datei: string): Promise<string> {
  const r = await api().readAsset(`diagnose/solidworks/${datei}`)
  if (!r.success || !r.data) throw new Error(`Skript „${datei}" nicht gefunden (public/diagnose/solidworks/).`)
  return b64ToUtf8(r.data)
}
