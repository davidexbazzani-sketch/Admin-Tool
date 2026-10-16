// ── Windows-Updates automatisch, solange ein Gerät in der Einrichtung steht ──
// Alle 8 Stunden je Gerät: ist der neue PC online, werden verfügbare Updates gesucht
// und installiert. Der Kreis der Geräte ist bewusst eng — genau die, die in der
// Geräte-Einrichtung sichtbar sind: offene Neu-/Refresh-Checklisten. Sobald eine
// Checkliste als erledigt markiert wird (completed), verschwindet das Gerät aus der
// Übersicht UND fällt damit sofort aus dieser Automatik heraus.
//
// Läuft sequenziell (eine Update-Installation nach der anderen) — parallele
// Windows-Update-Läufe über mehrere PCs sind weder nötig noch gesund.
// Neu gestartet wird nie automatisch. [[setup_scripts_feature]]

import { listChecklists } from './checklists'
import { loadChecklistDeviceInfos, hostFromSerial } from './deviceMasterData'
import { loadDeviceSetupState, updateDeviceSetupItem, type DeviceSetupItem } from './deviceSetup'
import { installWindowsUpdates } from './migrationOps'
import { checkReachability } from './onboardingDeploy'

export const WINUPDATE_STATUS = 'device_setup/winupdate_status.json'

/** Abstand zwischen zwei Update-Läufen je Gerät. */
export const WINUPDATE_INTERVAL_H = 8

/** Wie viele Geräte ein einzelner Durchlauf höchstens abarbeitet (Laufzeit begrenzen). */
const MAX_PRO_LAUF = 4

function faellig(st: DeviceSetupItem | undefined, now: number): boolean {
  if (!st?.winUpdateTriedAt) return true
  const t = new Date(st.winUpdateTriedAt).getTime()
  if (isNaN(t)) return true
  return now - t >= WINUPDATE_INTERVAL_H * 60 * 60 * 1000
}

/**
 * EIN Durchlauf: alle offenen Neu-/Refresh-Checklisten durchgehen und für jedes fällige,
 * erreichbare Gerät die Updates installieren. Offline-Geräte zählen als Versuch und
 * kommen nach dem Intervall wieder dran.
 */
export async function runAutoWindowsUpdatesOnce(_by: string, onTick?: () => void): Promise<{ ok: boolean; summary: string }> {
  const all = await listChecklists().catch(() => [])
  const offen = all.filter(c => !c.completed && (c.deviceType === 'new' || c.deviceType === 'refresh'))
  if (offen.length === 0) return { ok: true, summary: 'Keine offenen Checklisten in der Geräte-Einrichtung.' }

  const infos = await loadChecklistDeviceInfos(
    offen.map(c => ({ key: c.id, newSerial: c.newDeviceSerial || '', oldId: '' })),
  ).catch(() => new Map())
  const state = await loadDeviceSetupState().catch(() => ({} as Record<string, DeviceSetupItem>))
  const now = Date.now()

  const dran = offen
    .map(c => ({ c, host: (infos.get(c.id)?.newHostname || hostFromSerial((c.newDeviceSerial || '').trim()) || '').trim() }))
    .filter(x => x.host && faellig(state[x.c.id], now))

  if (dran.length === 0) return { ok: true, summary: `${offen.length} Geräte — keines fällig (Intervall ${WINUPDATE_INTERVAL_H} h).` }

  let installiert = 0, offline = 0, fehler = 0
  for (const { c, host } of dran.slice(0, MAX_PRO_LAUF)) {
    const stamp = new Date().toISOString()
    const reach = await checkReachability(host).catch(() => ({ online: false }))
    if (!reach.online) {
      offline++
      await updateDeviceSetupItem(c.id, { winUpdateTriedAt: stamp, winUpdateText: 'Gerät war offline' }).catch(() => {})
      onTick?.()
      continue
    }
    try {
      const r = await installWindowsUpdates(host)
      if (r.ok) installiert++; else fehler++
      await updateDeviceSetupItem(c.id, {
        winUpdateTriedAt: stamp,
        winUpdateAt: r.ok ? new Date().toISOString() : state[c.id]?.winUpdateAt,
        winUpdateOk: r.ok,
        winUpdateText: r.text || (r.ok ? 'ausgeführt' : 'fehlgeschlagen'),
      }).catch(() => {})
    } catch (e) {
      fehler++
      await updateDeviceSetupItem(c.id, {
        winUpdateTriedAt: stamp, winUpdateOk: false,
        winUpdateText: e instanceof Error ? e.message : String(e),
      }).catch(() => {})
    }
    onTick?.()
  }

  const rest = Math.max(0, dran.length - MAX_PRO_LAUF)
  return {
    ok: fehler === 0,
    summary: `${installiert} aktualisiert · ${offline} offline · ${fehler} Fehler${rest ? ` · ${rest} beim nächsten Durchlauf` : ''}`,
  }
}
