// ── Auto-Scan „EuroPAR-Ordner" (täglich 12:00) ────────────────────────────────
// Prüft für alle offenen Refresh-Checklisten der Geräte-Einrichtung, ob auf dem
// ALTGERÄT die drei EuroPAR-Ordner (C:\EuroPAR, C:\Local, C:\SCHNITTDATEN) liegen.
// Nur wer mindestens einen davon hat, wird als EuroPAR-Gerät markiert — erst dann
// erscheint in der Geräte-Einrichtung die EuroPAR-Kachel und das Tool sichert die
// Ordner selbstständig in den Netz-Zwischenspeicher ([[europar_folder_migration]]).
// Der Scan ist bewusst leichtgewichtig (nur Test-Path); Dateizahl/Größe entstehen
// erst beim Sichern. Zeitplan: Einstellungen → Automatische Scans (id `europar-scan`).

import { listChecklists } from './checklists'
import { loadChecklistDeviceInfos, hostFromSerial } from './deviceMasterData'
import { probeEuroparOnHost, europarDirName } from './europar'
import { loadDeviceSetupState, updateDeviceSetupItems, type DeviceSetupItem } from './deviceSetup'
import { loadRunStatus, saveRunStatus, isStatusClaimed, claimExclusive } from './scanSchedules'

export const EUROPAR_SCAN_STATUS = 'device_setup/europar_scan_status.json'
export const EUROPAR_SCAN_ID = 'europar-scan'

/** Gleichzeitig geprüfte Altgeräte (SMB-Leselast klein halten). */
const BATCH = 5

/**
 * EIN Scan-Lauf über alle offenen Refresh-Checklisten. Bereits übertragene Geräte werden
 * übersprungen. Ergebnis wird je Checkliste im Geräte-Einrichtungs-Zustand vermerkt
 * (`europarMarked` / `europarFound` / `europarScannedAt`).
 */
export async function runEuroparScanOnce(_by: string, onTick?: () => void): Promise<{ ok: boolean; summary: string }> {
  const all = await listChecklists().catch(() => [])
  const offen = all.filter(c => !c.completed && c.deviceType === 'refresh' && (c.oldDeviceId || '').trim())
  if (offen.length === 0) return { ok: true, summary: 'Keine offenen Refresh-Checklisten.' }

  const infos = await loadChecklistDeviceInfos(
    offen.map(c => ({ key: c.id, newSerial: c.newDeviceSerial || '', oldId: c.oldDeviceId || '' })),
  ).catch(() => new Map())
  const state = await loadDeviceSetupState().catch(() => ({} as Record<string, DeviceSetupItem>))

  let markiert = 0, ohne = 0, offline = 0, uebersprungen = 0
  const patches: Record<string, Partial<DeviceSetupItem>> = {}

  for (let i = 0; i < offen.length; i += BATCH) {
    const chunk = offen.slice(i, i + BATCH)
    await Promise.all(chunk.map(async c => {
      const info = infos.get(c.id)
      const oldHost = (info?.oldHostname || hostFromSerial((c.oldDeviceId || '').trim()) || '').trim()
      const newHost = (info?.newHostname || hostFromSerial((c.newDeviceSerial || '').trim()) || '').trim()
      if (!oldHost) { uebersprungen++; return }
      // Schon vollständig übertragen → das Altgerät nicht erneut behelligen.
      if (state[c.id]?.europarApplied) { uebersprungen++; return }

      const now = new Date().toISOString()
      const r = await probeEuroparOnHost(oldHost)
      if (!r.ok) {
        offline++
        patches[c.id] = { europarScannedAt: now, europarScanText: r.text || 'Altgerät nicht erreichbar' }
        return
      }
      const found = r.folders.filter(f => f.state !== 'missing').map(f => f.name)
      if (found.length) markiert++; else ohne++
      patches[c.id] = {
        europarScannedAt: now,
        europarScanText: '',
        europarMarked: found.length > 0,
        europarFound: found,
        ...(found.length ? { europarDir: state[c.id]?.europarDir || europarDirName(newHost, c.id) } : {}),
      }
    }))
    onTick?.()
  }

  if (Object.keys(patches).length) await updateDeviceSetupItems(patches)
  return {
    ok: true,
    summary: `${offen.length} Refresh-Geräte · ${markiert} mit EuroPAR-Ordnern · ${ohne} ohne · ${offline} nicht erreichbar${uebersprungen ? ` · ${uebersprungen} übersprungen` : ''}`,
  }
}

/**
 * Scan-Lauf mit Claim — für den manuellen Start aus der Geräte-Einrichtung und für
 * „Jetzt ausführen" in den Einstellungen. Verhindert Doppelläufe über mehrere
 * Tool-Instanzen und schreibt den Lauf-Status fort.
 */
export async function runEuroparScanClaimed(by: string, onTick?: () => void): Promise<{ ok: boolean; summary: string }> {
  const s = await loadRunStatus(EUROPAR_SCAN_STATUS)
  if (isStatusClaimed(s)) return { ok: false, summary: 'Läuft bereits (Hintergrund oder andere Instanz).' }
  const token = `manual#${Math.random().toString(36).slice(2, 10)}`
  const won = await claimExclusive(EUROPAR_SCAN_STATUS, token, s)
  if (!won) return { ok: false, summary: 'Läuft bereits (andere Instanz war schneller).' }
  try {
    const res = await runEuroparScanOnce(by, onTick)
    try { await saveRunStatus(EUROPAR_SCAN_STATUS, { lastRunAt: res.ok ? new Date().toISOString() : s.lastRunAt, lastResult: res.ok ? 'success' : 'error', lastSummary: res.summary, running: undefined }) } catch { /* egal */ }
    return res
  } catch (e) {
    try { await saveRunStatus(EUROPAR_SCAN_STATUS, { ...s, running: undefined }) } catch { /* egal */ }
    return { ok: false, summary: e instanceof Error ? e.message : String(e) }
  }
}
