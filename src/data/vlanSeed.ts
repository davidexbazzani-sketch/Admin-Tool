// ── VLAN-Seed (gefundene Liste, Stand ~2022) ─────────────────────────────────
// Aus einer ~3,5 Jahre alten Netzdoku übernommen (VLAN-Name · VLAN-ID · Subnetz).
// Wird per „Importieren" in die VLAN-Zuordnung (network/vlans.json) gemerged —
// bestehende, manuell gepflegte Labels bleiben erhalten. Als „zu verifizieren"
// markiert; der Live-Scan + AD-Abgleich (Drift-Check) bestätigen die Aktualität.

export const VLAN_SEED_SITE = 'DEHAM'
export const VLAN_SEED_NOTE = 'Stand ~2022 (Import) – zu verifizieren'

export interface VlanSeedEntry { cidr: string; vlanId: string; name: string }

export const VLAN_SEED: VlanSeedEntry[] = [
  { vlanId: '1202', name: 'Office_LAN',                 cidr: '10.170.32.0/23' },
  { vlanId: '1203', name: 'Printers',                   cidr: '10.170.36.0/23' },
  { vlanId: '1302', name: 'Office_Wireless',            cidr: '10.170.34.0/23' },
  { vlanId: '1501', name: 'Shopfloor_LAN_1',            cidr: '10.170.37.0/24' },
  { vlanId: '1502', name: 'Shopfloor_LAN_2',            cidr: '10.170.43.64/29' },
  { vlanId: '1503', name: 'Shopfloor_LAN_3',            cidr: '10.170.43.72/29' },
  { vlanId: '1504', name: 'Shopfloor_LAN_4',            cidr: '10.170.43.80/29' },
  { vlanId: '1505', name: 'Shopfloor_LAN_5',            cidr: '10.170.43.88/29' },
  { vlanId: '1506', name: 'Shopfloor_LAN_6',            cidr: '10.170.43.96/29' },
  { vlanId: '1507', name: 'Shopfloor_LAN_7',            cidr: '10.170.43.104/29' },
  { vlanId: '1508', name: 'Shopfloor_LAN_8',            cidr: '10.170.43.112/29' },
  { vlanId: '1509', name: 'Shopfloor_LAN_9',            cidr: '10.170.43.120/29' },
  { vlanId: '1601', name: 'Shopfloor_Wireless',         cidr: '10.170.43.128/25' },
  { vlanId: '2101', name: 'Facility_1_Tools',           cidr: '10.170.38.0/24' },
  { vlanId: '2102', name: 'Facility_2_AC_Energy_Light', cidr: '10.170.39.0/24' },
  { vlanId: '2103', name: 'Facility_3_Beamers',         cidr: '10.170.40.0/24' },
  { vlanId: '2104', name: 'Facility_4_Toner',           cidr: '10.170.44.24/29' },
  { vlanId: '2105', name: 'Facility_5_UPS',             cidr: '10.170.44.0/28' },
  { vlanId: '2401', name: 'VOIP_Server',                cidr: '10.132.141.0/24' },
  { vlanId: '2402', name: 'VOIP_administration_office', cidr: '10.132.142.0/24' },
  { vlanId: '2403', name: 'VOIP_production',            cidr: '10.132.143.0/24' },
  { vlanId: '3701', name: 'FW_Transit',                 cidr: '10.170.44.16/29' },
  { vlanId: '3901', name: 'DMZ',                        cidr: '10.170.41.0/24' },
  { vlanId: '4001', name: 'LAN_Management',             cidr: '10.170.43.0/26' },
  { vlanId: '4002', name: 'WLAN_Management',            cidr: '10.170.42.0/24' },
  { vlanId: '3902', name: 'Public LAN DMZ',             cidr: '10.170.46.0/24' },
  { vlanId: '3950', name: 'Edge PROD',                  cidr: '10.170.45.0/24' },
  { vlanId: '3960', name: 'Edge DEV',                   cidr: '10.170.44.128/25' },
]
