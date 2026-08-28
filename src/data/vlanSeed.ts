// ── VLAN-Katalog (aktuelle Liste, Stand 2026 – inkl. Subnetze & Gateways) ─────
// Vollständige aktuelle VLAN-Liste von deham / Hamburg Marine (vom Kollegen als
// Netz-Export geliefert: VLAN-ID, Name, Subnetz/CIDR, Gateway). Alle VLANs haben
// jetzt ein bekanntes Subnetz.
//
// Wird per „Liste importieren" in network/vlans.json gemerged — bestehende,
// manuell gepflegte Labels bleiben erhalten. Live-Scan + Drift-Check bestätigen
// die Aktualität.

export const VLAN_SEED_SITE = 'DEHAM'
export const VLAN_SEED_NOTE = 'Stand 2026 (aktuelle VLAN-Liste inkl. Subnetze & Gateways)'

/** Ein Eintrag der aktuellen VLAN-Liste. */
export interface VlanCatalogEntry { vlanId: string; name: string; cidr?: string; gateway?: string }

/**
 * Aktuelle VLAN-Liste (deham / Hamburg Marine, Stand 2026). Reihenfolge wie
 * geliefert. Alle Einträge haben CIDR; Gateway soweit dokumentiert.
 */
export const VLAN_CATALOG_2026: VlanCatalogEntry[] = [
  { vlanId: '2401', name: 'Voice/IPT',                     cidr: '10.132.141.0/24', gateway: '10.132.141.254' },
  { vlanId: '2402', name: 'Voice/IPT',                     cidr: '10.132.142.0/24', gateway: '10.132.142.254' },
  { vlanId: '2403', name: 'Voice/IPT',                     cidr: '10.132.143.0/24', gateway: '10.132.143.254' },
  { vlanId: '1202', name: 'Office LAN',                    cidr: '10.170.32.0/23',  gateway: '10.170.33.254' },
  { vlanId: '1302', name: 'Office Wireless',               cidr: '10.170.34.0/23',  gateway: '10.170.35.254' },
  { vlanId: '1203', name: 'Printer / Drucker',             cidr: '10.170.36.0/24',  gateway: '10.170.36.254' },
  { vlanId: '1501', name: 'Shopfloor Wired',               cidr: '10.170.37.0/24' },
  { vlanId: '2101', name: 'Facility services Wired',       cidr: '10.170.38.0/24',  gateway: '10.170.38.254' },
  { vlanId: '2102', name: 'Facility services Wired',       cidr: '10.170.39.0/24',  gateway: '10.170.39.254' },
  { vlanId: '2103', name: 'Facility services Wired',       cidr: '10.170.40.0/24',  gateway: '10.170.40.254' },
  { vlanId: '3901', name: 'Smart_Factory DMZ',             cidr: '10.170.41.0/24' },
  { vlanId: '4002', name: 'WLAN management',               cidr: '10.170.42.0/24' },
  { vlanId: '4001', name: 'LAN management',                cidr: '10.170.43.0/26' },
  { vlanId: '1502', name: 'Shopfloor Wired',               cidr: '10.170.43.64/29',  gateway: '10.170.43.70' },
  { vlanId: '1503', name: 'Shopfloor Wired',               cidr: '10.170.43.72/29',  gateway: '10.170.43.78' },
  { vlanId: '1504', name: 'Shopfloor Wired',               cidr: '10.170.43.80/29',  gateway: '10.170.43.86' },
  { vlanId: '1505', name: 'Shopfloor Wired',               cidr: '10.170.43.88/29',  gateway: '10.170.43.94' },
  { vlanId: '1506', name: 'Shopfloor Wired',               cidr: '10.170.43.96/29',  gateway: '10.170.43.102' },
  { vlanId: '1507', name: 'Shopfloor Wired',               cidr: '10.170.43.104/29', gateway: '10.170.43.110' },
  { vlanId: '1508', name: 'Shopfloor Wired',               cidr: '10.170.43.112/29', gateway: '10.170.43.118' },
  { vlanId: '1509', name: 'Shopfloor Wired',               cidr: '10.170.43.120/29', gateway: '10.170.43.126' },
  { vlanId: '1601', name: 'Shopfloor Wireless',            cidr: '10.170.43.128/25' },
  { vlanId: '2105', name: 'Facility services Wired',       cidr: '10.170.44.0/28',   gateway: '10.170.44.14' },
  { vlanId: '3701', name: 'Firewall transit',              cidr: '10.170.44.16/29' },
  { vlanId: '2104', name: 'Facility services Wired',       cidr: '10.170.44.24/29',  gateway: '10.170.44.30' },
  { vlanId: '3702', name: 'Firewall transit',              cidr: '10.170.44.32/29',  gateway: '10.170.44.38' },
  { vlanId: '2107', name: 'Facility services Wired',       cidr: '10.170.44.48/28',  gateway: '10.170.44.62' },
  { vlanId: '3960', name: 'Azure On-Prem Development Edge', cidr: '10.170.44.128/25' },
  { vlanId: '3950', name: 'Azure On-Prem Production Edge',  cidr: '10.170.45.0/24' },
  { vlanId: '3902', name: 'Smart_Factory DMZ public',       cidr: '10.170.46.0/24' },
  { vlanId: '1250', name: 'HCI Office Production Edge',      cidr: '10.170.47.0/24',   gateway: '10.170.47.254' },
  { vlanId: '1260', name: 'HCI Office Development Edge',     cidr: '10.170.54.128/25', gateway: '10.170.54.254' },
  { vlanId: '2106', name: 'Facility services Wired',        cidr: '10.170.118.0/23',  gateway: '10.170.119.254' },
  { vlanId: '1402', name: 'Internet-only Wireless',         cidr: '10.170.121.0/24',  gateway: '10.170.121.254' },
  { vlanId: '4006', name: 'Guest Wireless',                 cidr: '172.25.0.0/21',    gateway: '172.25.7.254' },
]

// ── Import-Seed (CIDR-basiert) ────────────────────────────────────────────────
export interface VlanSeedEntry { cidr: string; vlanId: string; name: string; gateway?: string }

export const VLAN_SEED: VlanSeedEntry[] = VLAN_CATALOG_2026
  .filter((v): v is VlanCatalogEntry & { cidr: string } => !!v.cidr)
  .map(v => ({ cidr: v.cidr, vlanId: v.vlanId, name: v.name, gateway: v.gateway }))
