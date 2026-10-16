// ── Standort eines Druckers: von Hand gesetzt = endgültig ───────────────────
//
// Anlass: in der Drucker-Liste standen immer wieder falsche Standorte — teils aus dem
// Seed (der aus Wizard-Screenshots stammt), teils aus Importen. Trägt jemand den Standort
// von Hand ein, muss dieser Wert bleiben. Nur ein weiterer Eintrag von Hand darf ihn
// ändern; kein Import und kein Scan.
//
// Zwei Besonderheiten, die den Ärger überhaupt erst erzeugt haben:
//
//   1. Der Standort steht an ZWEI Stellen — `InventoryItem.description` (die Zeile in der
//      Standort-Übersicht) und `PrinterMasterData.location` (das „i"-Fenster). Wer ihn an
//      einer Stelle korrigierte, sah an der anderen weiter den alten Wert. Deshalb schreibt
//      jede Änderung hier IMMER beide.
//   2. Ohne Markierung ist später nicht unterscheidbar, ob ein Wert von Hand gepflegt oder
//      automatisch entstanden ist. Deshalb `locationManual` + wer + wann.

import { api } from '../electronAPI'
import type { InventoryItem } from '../types/auth'
import { loadPrinterDossier, savePrinterMaster, type PrinterMasterData } from './printerDossier'

const INVENTORY_FILE = 'inventory/inventory.json'

export interface StandortStand {
  text: string
  /** true = von Hand gesetzt und damit gegen Import und Scan geschützt. */
  manuell: boolean
  von?: string
  am?: string
}

// ── Reine Logik (ohne Netzzugriff, damit prüfbar) ───────────────────────────

/** Darf eine automatische Quelle (Import, Scan, Seed) den Standort setzen? */
export function darfAutomatischSetzen(master?: PrinterMasterData): boolean {
  return !master?.locationManual
}

export function standortAus(master?: PrinterMasterData): StandortStand {
  return {
    text: (master?.location || '').trim(),
    manuell: !!master?.locationManual,
    von: master?.locationBy,
    am: master?.locationAt,
  }
}

/**
 * Die Felder, die beim Setzen von Hand in die Stammdaten geschrieben werden.
 *
 * Leert jemand das Feld, fällt die Sperre mit weg — dann gilt wieder der Seed-Wert und
 * eine automatische Quelle darf wieder schreiben. Sonst gäbe es keinen Weg zurück.
 */
export function manuellerStand(text: string, by: string, jetzt: string): Partial<PrinterMasterData> {
  const t = (text || '').trim()
  if (!t) return { location: undefined, locationManual: undefined, locationBy: undefined, locationAt: undefined }
  return { location: t, locationManual: true, locationBy: by, locationAt: jetzt }
}

/**
 * Hat sich der Standort gegenüber dem gespeicherten Stand geändert? Nur dann wird neu
 * gestempelt — sonst stünde nach jedem Speichern der Stammdaten ein neuer Name darin,
 * auch wenn jemand nur die Tonerart geändert hat.
 */
export function standortGeaendert(master: PrinterMasterData | undefined, text: string): boolean {
  return (master?.location || '').trim() !== (text || '').trim()
}

// ── Schreiben (Dossier + Inventar) ──────────────────────────────────────────

async function schreibeInventarStandort(name: string, text: string): Promise<void> {
  try {
    const inv = await api().netReadJson<InventoryItem[]>(INVENTORY_FILE)
    const list = Array.isArray(inv) ? inv : []
    const key = name.trim().toUpperCase()
    let ch = false
    const next = list.map(i => {
      if ((i.category || '').toLowerCase() !== 'drucker') return i
      if ((i.name || '').trim().toUpperCase() !== key) return i
      const neu = text.trim() || undefined
      if ((i.description || undefined) === neu) return i
      ch = true
      return { ...i, description: neu }
    })
    if (ch) await api().netWriteJson(INVENTORY_FILE, next)
  } catch { /* offline — das Dossier hat den Wert trotzdem */ }
}

/**
 * Nur den Standort in die Liste (Inventar) spiegeln. Für Aufrufer, die die Stammdaten
 * gerade selbst geschrieben haben und kein zweites Mal ins Dossier schreiben sollen.
 */
export async function spiegleStandortInListe(name: string, text: string): Promise<void> {
  await schreibeInventarStandort(name, text)
}

/** Standort von Hand setzen (oder mit leerem Text wieder freigeben). */
export async function setzeStandortManuell(name: string, text: string, by: string): Promise<void> {
  const d = await loadPrinterDossier(name)
  const master: PrinterMasterData = {
    ...(d?.master || {}),
    ...manuellerStand(text, by, new Date().toISOString()),
  }
  await savePrinterMaster(name, master, by)
  await schreibeInventarStandort(name, text)
}

/**
 * Standort aus einer automatischen Quelle (Import/Scan/Seed) setzen.
 * Gibt `false` zurück, wenn der Standort von Hand gesetzt ist — dann passiert NICHTS.
 */
export async function setzeStandortAutomatisch(name: string, text: string, by: string): Promise<boolean> {
  const t = (text || '').trim()
  if (!t) return false
  const d = await loadPrinterDossier(name)
  if (!darfAutomatischSetzen(d?.master)) return false
  await savePrinterMaster(name, { ...(d?.master || {}), location: t }, by)
  await schreibeInventarStandort(name, t)
  return true
}

/** Standort-Stand eines Druckers lesen (für Anzeige und Sperr-Hinweis). */
export async function ladeStandort(name: string): Promise<StandortStand> {
  const d = await loadPrinterDossier(name).catch(() => null)
  return standortAus(d?.master)
}
