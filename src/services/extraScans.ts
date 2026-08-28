// ── Run-Funktionen der neuen Auto-Scans (Radar, VLAN) ─────────────────────────
// Gemeinsam genutzt von der Scan-Registry (manueller „Jetzt ausführen") und den
// Hintergrund-Controllern. Der Aufrufer setzt/gibt den Claim frei (siehe
// scanSchedules.loadRunStatus/isStatusClaimed).

import { refreshAdHygiene } from './proactiveRadar'
import { loadVlanConfig, discoverDevices, saveScanCache, normalizeCidr, DEFAULT_SITE, type VlanScanCache } from './vlans'
import { getSiteSubnets } from './userPresenceScan'

export const RADAR_SCAN_SCHEDULE = 'radar/scan_schedule.json'
export const VLAN_SCAN_SCHEDULE = 'network/vlan_scan_schedule.json'

/** Proaktives Radar (AD-Hygiene) einmal aktualisieren. refreshAdHygiene cached selbst. */
export async function runRadarScanOnce(): Promise<{ ok: boolean; summary: string }> {
  const r = await refreshAdHygiene()
  return { ok: r.ok, summary: r.ok ? `${r.count} AD-Konten geprüft` : (r.error || 'Fehler') }
}

/** VLAN-/Netzwerk-Scan einmal ausführen: Subnetze (AD ∪ Config) → discoverDevices → Cache.
 *  onTick wird während des (langen) Sweeps regelmäßig aufgerufen → Heartbeat für den Claim. */
export async function runVlanScanOnce(by: string, onTick?: () => void): Promise<{ ok: boolean; summary: string }> {
  const cfg = await loadVlanConfig()
  const cfgCidrs = cfg.vlans.map(v => normalizeCidr(v.cidr)).filter(Boolean)
  let adCidrs: string[] = []
  try {
    const res = await getSiteSubnets(cfg.site || DEFAULT_SITE)
    if (res.ok) adCidrs = res.subnets.map(normalizeCidr).filter(Boolean)
  } catch { /* AD evtl. nicht erreichbar → nur Config-Subnetze */ }
  const cidrs = [...new Set([...adCidrs, ...cfgCidrs])]
  if (cidrs.length === 0) return { ok: false, summary: 'Keine Subnetze (AD nicht erreichbar / keine VLAN-Config)' }
  const { devices, capped } = await discoverDevices(cidrs, onTick ? () => onTick() : undefined)
  const cache: VlanScanCache = {
    scanDate: new Date().toISOString(), scannedBy: by, site: cfg.site || DEFAULT_SITE, subnets: cidrs, capped, devices,
  }
  await saveScanCache(cache)
  return { ok: true, summary: `${devices.length} Geräte / ${devices.filter(d => d.online).length} online` }
}
