// ── Netzwerk-Diagnose: Datenmodell ───────────────────────────────────────────
// Rohdaten des Collector-Skripts (rein lesend, per WinRM) + abgeleitete Befunde.

export type Gewicht = 'HOCH' | 'MITTEL' | 'GERING' | 'INFO'
export type HostRolle = 'problem' | 'referenz'

// Kategorie eines Fixes (bestimmt die Anwende-Engine in applyFix.ts).
export type NetFixKat =
  | 'powercfg-wifi'   // Windows-Energieplan: WLAN-Energiesparmodus (AC/DC)
  | 'netpower'        // Geräte-Energieverwaltung des Adapters (PnPCapabilities)
  | 'netadv'          // Adapter-Advanced-Setting (Set-NetAdapterAdvancedProperty)
  | 'treiber'         // Treiberstand → Hinweis (Fix über „Treiber-Installation")
  | 'netzwerk'        // Hinweis: eher AP-/netzseitig
  | 'info'            // reine Information

export interface Erklaerung {
  wirkung: string     // ausführliches Problem + Auswirkung
  aenderung: string   // was sich beim Umstellen GENAU ändert
  vorteil: string
  nachteil: string
  wannNicht: string   // wann man es bewusst NICHT umstellen sollte
}

// Ein konkreter, anwendbarer Fix.
export interface NetFix {
  art: 'advanced' | 'powercfg' | 'powermgmt'
  keyword?: string        // advanced: RegistryKeyword (z. B. "RoamAggressiveness")
  displayName?: string    // advanced: DisplayName (Fallback-Match)
  zielRegValue?: string   // advanced: Ziel-RegistryValue
  zielDisplay?: string    // advanced: Ziel-DisplayValue (Alternative)
  powercfg?: 'wlan-max'   // powercfg: WLAN-Energiesparmodus AC+DC → Höchstleistung (0)
  powermgmt?: 'disable-turnoff'  // powermgmt: „Gerät ausschalten…" deaktivieren
}

export interface NetBefund {
  id: string
  titel: string
  gewicht: Gewicht
  ist: string
  soll: string
  wirkung: string
  fundort: string
  kategorie: NetFixKat
  fixbar: boolean
  fix?: NetFix
  standardAus?: boolean    // nicht per Default vorausgewählt (invasive/optionale Fixes)
  hinweis?: string
  erklaerung?: Erklaerung
}

// ── Rohdaten aus dem Collector ───────────────────────────────────────────────
export interface AdvProp { name: string; value: string; keyword: string; regValue: string }

export interface NetAdapterInfo {
  name: string
  ifDesc: string           // z. B. "Intel(R) Wi-Fi 6E AX211 160MHz" / "Intel(R) Wi-Fi 7 BE200"
  mac: string
  status: string
  linkSpeed: string
  driverVersion: string
  driverDate: string
  driverProvider: string
}

export interface WlanEreignis { id: number; zeit: string; grund?: string; bssid?: string }

export interface NetEreignisse {
  tage: number
  disconnects: number      // Event 8003
  connects: number         // Event 8001
  securityStops: number    // Event 11004/11010
  gruende: { grund: string; anzahl: number }[]
  bssidCluster: { bssid: string; anzahl: number }[]
  letzte: WlanEreignis[]
}

export interface NetVerbindung {
  state?: string
  ssid?: string
  bssid?: string
  signal?: string
  radio?: string           // 802.11ax / 802.11be
  kanal?: string
  band?: string
  rxRate?: string
  txRate?: string
}

export interface NetPowerMgmt {
  allowTurnOff?: boolean | null   // „Computer kann Gerät ausschalten"
  pnpCapabilities?: number | null
  wakeMagic?: boolean | null
}

export interface NetPowercfg {
  schema?: string                 // Name des aktiven Energieplans
  wlanAc?: number | null          // WLAN-Energiesparmodus Netzbetrieb (0=Höchstleistung..3=Max Sparen)
  wlanDc?: number | null          // WLAN-Energiesparmodus Akku
  modernStandby?: boolean | null  // S0 Low Power Idle vorhanden
}

export interface NetDaten {
  ok: boolean
  fehler?: string
  hostname?: string
  mehrereAdapter?: number
  adapter?: NetAdapterInfo
  advanced: AdvProp[]
  powerMgmt: NetPowerMgmt
  powercfg: NetPowercfg
  verbindung?: NetVerbindung
  ereignisse?: NetEreignisse
  system?: { modell?: string; bios?: string; os?: string }
  textBericht?: string
}

export interface NetLauf {
  pc: string
  ip?: string
  rolle: HostRolle
  ranAt: string            // ISO
  ranBy: string
  ok: boolean
  fehler?: string
  daten: NetDaten
}
