// ── EuroPAR: Sichern und Übertragen im Hintergrund ──────────────────────────
// Der Scan (europarScan.ts) markiert nur, WELCHE Altgeräte die drei Ordner haben.
// Die eigentliche Arbeit passiert hier — und zwar als globaler Hintergrundlauf, nicht
// im Screen: früher hing das Sichern am geöffneten Menüpunkt „Geräte-Einrichtung", so
// dass markierte Geräte nie gesichert wurden, wenn man dort nicht stehen blieb.
//
// Zwei Stufen je Gerät, beide sequenziell und mit klarer Rückmeldung:
//   1) SICHERN  — Altgerät erreichbar → …\Tool IT\Europar\<Hostname des NEUEN PCs>
//                 anlegen und C:\EuroPAR, C:\Local, C:\SCHNITTDATEN hineinkopieren.
//   2) ÜBERTRAGEN — Neugerät erreichbar → aus dem Zwischenspeicher nach C:\ des neuen
//                 PCs kopieren, jede Datei prüfen und erst dann den Zwischenspeicher-
//                 Unterordner löschen.
// [[europar_folder_migration]]

import { listChecklists } from './checklists'
import { loadChecklistDeviceInfos, hostFromSerial } from './deviceMasterData'
import { loadDeviceSetupState, updateDeviceSetupItem, type DeviceSetupItem } from './deviceSetup'
import { stageEuroparFolders, applyEuroparFolders, europarDirName } from './europar'
import { checkReachability } from './onboardingDeploy'

export const EUROPAR_STAGING_STATUS = 'device_setup/europar_staging_status.json'

/** Frühestens nach so vielen Minuten wird ein fehlgeschlagener Versuch wiederholt. */
export const EUROPAR_RETRY_MIN = 30
const RETRY_MIN = EUROPAR_RETRY_MIN
/**
 * Höchstens so viele Geräte pro HINTERGRUND-Durchlauf (Kopien können groß sein und
 * sollen den Admin-PC nicht dauerbelegen). Der manuelle Lauf aus der Geräte-Einrichtung
 * ignoriert den Deckel — sonst blieben bei mehr als zwei offenen Geräten welche liegen
 * und man hält sie fälschlich für fehlgeschlagen.
 */
const MAX_HINTERGRUND = 2

function faellig(stamp: string | undefined, now: number): boolean {
  if (!stamp) return true
  const t = new Date(stamp).getTime()
  if (isNaN(t)) return true
  return now - t >= RETRY_MIN * 60 * 1000
}

interface Kandidat { id: string; oldHost: string; newHost: string; st: DeviceSetupItem }

/**
 * EIN Durchlauf über alle offenen Refresh-Checklisten: sichern, was zu sichern ist,
 * und übertragen, was übertragen werden kann. Nicht erreichbare Geräte werden vermerkt
 * und beim nächsten Durchlauf erneut versucht.
 */
export async function runEuroparStagingOnce(
  _by: string,
  onTick?: () => void,
  opts?: { alle?: boolean },
): Promise<{ ok: boolean; summary: string }> {
  const deckel = opts?.alle ? Number.MAX_SAFE_INTEGER : MAX_HINTERGRUND
  const all = await listChecklists().catch(() => [])
  const offen = all.filter(c => !c.completed && c.deviceType === 'refresh' && (c.oldDeviceId || '').trim())
  if (offen.length === 0) return { ok: true, summary: 'Keine offenen Refresh-Checklisten.' }

  const infos = await loadChecklistDeviceInfos(
    offen.map(c => ({ key: c.id, newSerial: c.newDeviceSerial || '', oldId: c.oldDeviceId || '' })),
  ).catch(() => new Map())
  const state = await loadDeviceSetupState().catch(() => ({} as Record<string, DeviceSetupItem>))
  const now = Date.now()

  const kandidaten: Kandidat[] = offen.map(c => {
    const info = infos.get(c.id)
    return {
      id: c.id,
      oldHost: (info?.oldHostname || hostFromSerial((c.oldDeviceId || '').trim()) || '').trim(),
      newHost: (info?.newHostname || hostFromSerial((c.newDeviceSerial || '').trim()) || '').trim(),
      st: state[c.id] || ({} as DeviceSetupItem),
    }
  })

  // ── Stufe 1: sichern ──────────────────────────────────────────────────────
  const zuSichern = kandidaten.filter(k =>
    k.st.europarMarked && !k.st.europarStaged && !k.st.europarApplied && k.oldHost && faellig(k.st.europarTriedAt, now))

  let gesichert = 0, altOffline = 0, sicherFehler = 0
  for (const k of zuSichern.slice(0, deckel)) {
    const stamp = new Date().toISOString()
    const dir = k.st.europarDir || europarDirName(k.newHost, k.id)
    if (!dir) {
      await updateDeviceSetupItem(k.id, { europarTriedAt: stamp, europarStageText: 'Hostname des neuen PCs unbekannt — Ordnername im Zwischenspeicher nicht bildbar' }).catch(() => {})
      sicherFehler++; onTick?.(); continue
    }
    const reach = await checkReachability(k.oldHost).catch(() => ({ online: false }))
    if (!reach.online) {
      altOffline++
      await updateDeviceSetupItem(k.id, { europarTriedAt: stamp, europarStageText: `Altgerät ${k.oldHost} nicht erreichbar` }).catch(() => {})
      onTick?.(); continue
    }
    const r = await stageEuroparFolders(k.oldHost, dir)
    if (r.busy) { onTick?.(); continue }
    const vorhanden = r.folders.filter(f => f.state !== 'missing')
    if (r.folders.length > 0 && vorhanden.length === 0) {
      // Ordner sind zwischen Scan und Sicherung verschwunden → Markierung zurücknehmen.
      await updateDeviceSetupItem(k.id, {
        europarMarked: false, europarFound: [], europarFolders: r.folders,
        europarTriedAt: stamp, europarStageText: 'Auf dem Altgerät liegt keiner der drei Ordner mehr',
      }).catch(() => {})
      onTick?.(); continue
    }
    if (r.ok) gesichert++; else sicherFehler++
    await updateDeviceSetupItem(k.id, {
      europarDir: dir,
      europarFolders: r.folders,
      europarStaged: r.ok,
      europarStagedAt: r.ok ? new Date().toISOString() : k.st.europarStagedAt,
      europarTriedAt: stamp,
      europarStageText: r.text,
    }).catch(() => {})
    onTick?.()
  }

  // ── Stufe 2: übertragen (Zustand neu lesen, Stufe 1 hat ihn verändert) ────
  const frisch = await loadDeviceSetupState().catch(() => state)
  const zuUebertragen = kandidaten
    .map(k => ({ ...k, st: frisch[k.id] || k.st }))
    .filter(k => k.st.europarStaged && !k.st.europarApplied && k.newHost && faellig(k.st.europarApplyTriedAt, now))

  let uebertragen = 0, neuOffline = 0, uebertragFehler = 0
  for (const k of zuUebertragen.slice(0, deckel)) {
    const stamp = new Date().toISOString()
    const dir = k.st.europarDir || europarDirName(k.newHost, k.id)
    if (!dir) { uebertragFehler++; onTick?.(); continue }
    const reach = await checkReachability(k.newHost).catch(() => ({ online: false }))
    if (!reach.online) {
      neuOffline++
      await updateDeviceSetupItem(k.id, { europarApplyTriedAt: stamp, europarApplyText: `Neuer PC ${k.newHost} noch nicht erreichbar` }).catch(() => {})
      onTick?.(); continue
    }
    const r = await applyEuroparFolders(k.newHost, dir)
    if (r.ok) uebertragen++; else uebertragFehler++
    await updateDeviceSetupItem(k.id, {
      europarFolders: r.folders.length ? r.folders : k.st.europarFolders,
      europarStaged: r.ok ? false : true,
      europarApplied: r.ok,
      europarAppliedAt: r.ok ? new Date().toISOString() : undefined,
      europarApplyTriedAt: stamp,
      europarApplyText: r.text,
    }).catch(() => {})
    onTick?.()
  }

  const teile: string[] = []
  if (gesichert) teile.push(`${gesichert} gesichert`)
  if (uebertragen) teile.push(`${uebertragen} übertragen`)
  if (altOffline) teile.push(`${altOffline}× Altgerät offline`)
  if (neuOffline) teile.push(`${neuOffline}× Neugerät offline`)
  if (sicherFehler + uebertragFehler) teile.push(`${sicherFehler + uebertragFehler} Fehler`)
  const offenGeblieben = Math.max(0, zuSichern.length - Math.min(zuSichern.length, deckel))
    + Math.max(0, zuUebertragen.length - Math.min(zuUebertragen.length, deckel))
  if (offenGeblieben) teile.push(`${offenGeblieben} beim nächsten Durchlauf`)
  if (teile.length === 0) teile.push('nichts zu tun')
  return { ok: sicherFehler + uebertragFehler === 0, summary: teile.join(' · ') }
}
