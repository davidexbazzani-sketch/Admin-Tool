// ── Netzlaufwerke alt → neu: erfassen und verbinden, im Hintergrund ─────────
// Zwei Stufen je Refresh-Gerät, beide sequenziell und mit klarer Rückmeldung:
//   1) ERFASSEN   — Altgerät erreichbar → verbundene Netzlaufwerke auslesen.
//   2) VERBINDEN  — Neugerät erreichbar UND jemand angemeldet → Laufwerke dort
//                   persistent verbinden (net use /persistent:yes).
//
// WICHTIG zum Auslesen: NICHT `Win32_MappedLogicalDisk` über eine WinRM-Sitzung — ver-
// bundene Laufwerke gehören zur Anmeldesitzung, und die Fernsitzung hat keine. Das war
// der Grund, warum die Übersicht dauerhaft „wird ermittelt" anzeigte. Stattdessen
// refreshNetworkDrivesLive() aus deviceNetworkDrives.ts, das die persistenten Mappings
// aus HKU\<SID>\Network aller Benutzer-Hives liest — und den zentralen Stand unter
// device_network_drives/<host>.json gleich mitpflegt, den auch das Geräte-Dossier nutzt.
//
// Dass niemand am Neugerät angemeldet ist, ist der NORMALFALL und kein Fehler — Stufe 2
// wartet dann einfach auf den nächsten Durchlauf. [[network_drive_migration]]

import { listChecklists } from './checklists'
import { loadChecklistDeviceInfos, hostFromSerial } from './deviceMasterData'
import { loadDeviceSetupState, updateDeviceSetupItem, type DeviceSetupItem } from './deviceSetup'
import { refreshNetworkDrivesLive, loadStoredNetworkDrives } from './deviceNetworkDrives'
import { mapNetworkDrives, checkDrivesApplied } from './migrationOps'
import { checkReachability } from './onboardingDeploy'

export const NETWORK_DRIVE_SETUP_STATUS = 'device_setup/network_drive_setup_status.json'

/** Frühestens nach so vielen Minuten wird ein erfolgloser Versuch wiederholt. */
export const NETDRIVE_RETRY_MIN = 30

/**
 * Höchstens so viele Geräte pro HINTERGRUND-Durchlauf. Der manuelle Lauf aus der
 * Geräte-Einrichtung ignoriert den Deckel (`opts.alle`) — sonst bleiben bei mehreren
 * offenen Geräten welche liegen und wirken fälschlich fehlgeschlagen.
 */
const MAX_HINTERGRUND = 4

function faellig(stamp: string | undefined, now: number): boolean {
  if (!stamp) return true
  const t = new Date(stamp).getTime()
  if (isNaN(t)) return true
  return now - t >= NETDRIVE_RETRY_MIN * 60 * 1000
}

interface Kandidat { id: string; oldHost: string; newHost: string; st: DeviceSetupItem }

/**
 * EIN Durchlauf: erfassen, was zu erfassen ist, und verbinden, was verbunden werden kann.
 * Bricht bei einem fehlgeschlagenen Gerät nicht ab — jedes wird einzeln bewertet.
 */
export async function runNetworkDriveSetupOnce(
  by: string,
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

  // ── Stufe 1: Laufwerke des Altgeräts erfassen ─────────────────────────────
  const zuErfassen = kandidaten.filter(k =>
    !k.st.networkDrivesAt && !k.st.networkDrivesApplied && k.oldHost && faellig(k.st.networkDrivesTriedAt, now))

  let erfasst = 0, ausDossier = 0, altOffline = 0, ohneLaufwerke = 0
  for (const k of zuErfassen.slice(0, deckel)) {
    const stamp = new Date().toISOString()

    // Stehen im Geräte-„i" des Altgeräts schon Laufwerke (z. B. vom allgemeinen
    // Netzlaufwerk-Scan), reicht das — dann muss das Altgerät gar nicht mehr erreichbar
    // sein. Erst wenn dort nichts liegt, wird live nachgesehen.
    const gespeichert = await loadStoredNetworkDrives(k.oldHost).catch(() => null)
    if (gespeichert && gespeichert.drives.length) {
      ausDossier++
      await updateDeviceSetupItem(k.id, {
        networkDrives: gespeichert.drives, networkDrivesAt: stamp, networkDrivesTriedAt: stamp,
        networkDrivesText: `${gespeichert.drives.length} Laufwerk(e) aus dem Geräte-„i" übernommen (Stand ${new Date(gespeichert.scannedAt).toLocaleDateString('de-DE')})`,
      }).catch(() => {})
      onTick?.(); continue
    }

    const reach = await checkReachability(k.oldHost).catch(() => ({ online: false }))
    if (!reach.online) {
      altOffline++
      await updateDeviceSetupItem(k.id, { networkDrivesTriedAt: stamp, networkDrivesText: `Altgerät ${k.oldHost} nicht erreichbar` }).catch(() => {})
      onTick?.(); continue
    }
    const r = await refreshNetworkDrivesLive(k.oldHost, by)
    if (r.drives.length) {
      erfasst++
      await updateDeviceSetupItem(k.id, {
        networkDrives: r.drives, networkDrivesAt: stamp, networkDrivesTriedAt: stamp,
        networkDrivesText: `${r.drives.length} Laufwerk(e) vom Altgerät gelesen`,
      }).catch(() => {})
    } else {
      // Erreichbar, aber nichts gefunden — z. B. Benutzer hat schlicht keine Laufwerke.
      ohneLaufwerke++
      await updateDeviceSetupItem(k.id, {
        networkDrivesTriedAt: stamp,
        networkDrivesText: r.ok ? 'Auf dem Altgerät sind keine Netzlaufwerke verbunden' : (r.reason || 'Auslesen fehlgeschlagen'),
      }).catch(() => {})
    }
    onTick?.()
  }

  // ── Stufe 2: auf dem Neugerät verbinden (Zustand neu lesen) ───────────────
  const frisch = await loadDeviceSetupState().catch(() => state)
  const zuVerbinden = kandidaten
    .map(k => ({ ...k, st: frisch[k.id] || k.st }))
    .filter(k => (k.st.networkDrives?.length || 0) > 0 && !k.st.networkDrivesApplied && k.newHost
      && faellig(k.st.networkDrivesApplyTriedAt, now))

  let verbunden = 0, neuOffline = 0, wartetAnmeldung = 0, fehler = 0
  for (const k of zuVerbinden.slice(0, deckel)) {
    const stamp = new Date().toISOString()

    // Hat der Anwender die .bat vom Desktop selbst ausgeführt? Dann ist nichts mehr zu tun.
    if (await checkDrivesApplied(k.id)) {
      verbunden++
      await updateDeviceSetupItem(k.id, {
        networkDrivesApplied: true, networkDrivesAppliedAt: stamp, networkDrivesApplyTriedAt: stamp,
        networkDrivesApplyText: 'Vom Anwender über das Desktop-Skript verbunden',
      }).catch(() => {})
      onTick?.(); continue
    }

    const reach = await checkReachability(k.newHost).catch(() => ({ online: false }))
    if (!reach.online) {
      neuOffline++
      await updateDeviceSetupItem(k.id, { networkDrivesApplyTriedAt: stamp, networkDrivesApplyText: `Neuer PC ${k.newHost} noch nicht erreichbar` }).catch(() => {})
      onTick?.(); continue
    }

    const r = await mapNetworkDrives(k.newHost, k.st.networkDrives || [])
    // „Kein Benutzer angemeldet" ist der Normalfall, solange das Gerät nur hochgefahren
    // ist — das darf nicht als Fehler zählen, sonst sieht die Karte kaputt aus.
    const keineAnmeldung = !r.ok && /kein benutzer|nicht angemeldet/i.test(r.text || '')
    if (r.ok) verbunden++
    else if (keineAnmeldung) wartetAnmeldung++
    else fehler++
    await updateDeviceSetupItem(k.id, {
      networkDrivesApplied: r.ok,
      networkDrivesAppliedAt: r.ok ? stamp : undefined,
      networkDrivesApplyTriedAt: stamp,
      networkDrivesApplyText: r.ok
        ? `${(k.st.networkDrives || []).length} Laufwerk(e) verbunden`
        : keineAnmeldung ? 'Wartet darauf, dass sich jemand am neuen PC anmeldet' : (r.text || 'Verbinden fehlgeschlagen'),
    }).catch(() => {})
    onTick?.()
  }

  const teile: string[] = []
  if (erfasst) teile.push(`${erfasst} erfasst`)
  if (ausDossier) teile.push(`${ausDossier} aus dem Geräte-„i" übernommen`)
  if (verbunden) teile.push(`${verbunden} verbunden`)
  if (altOffline) teile.push(`${altOffline}× Altgerät offline`)
  if (neuOffline) teile.push(`${neuOffline}× Neugerät offline`)
  if (wartetAnmeldung) teile.push(`${wartetAnmeldung}× wartet auf Anmeldung`)
  if (ohneLaufwerke) teile.push(`${ohneLaufwerke}× ohne Laufwerke`)
  if (fehler) teile.push(`${fehler} Fehler`)
  const offenGeblieben = Math.max(0, zuErfassen.length - Math.min(zuErfassen.length, deckel))
    + Math.max(0, zuVerbinden.length - Math.min(zuVerbinden.length, deckel))
  if (offenGeblieben) teile.push(`${offenGeblieben} beim nächsten Durchlauf`)
  if (teile.length === 0) teile.push('nichts zu tun')
  return { ok: fehler === 0, summary: teile.join(' · ') }
}
