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
  | 'ursache'         // Tiefenanalyse: wer/was trennt (Zeitmuster, Grund, Umfeld) — kein Fix
  | 'aufgabe'         // Notlösung als geplante Aufgabe (z. B. automatisch neu verbinden)
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
  art: 'advanced' | 'powercfg' | 'powermgmt' | 'reconnect-task' | 'standby-netz' | 'profil-auto' | 'aufgabe-aus'
  profil?: string         // reconnect-task / profil-auto: WLAN-Profilname
  aufgabePfad?: string    // aufgabe-aus: TaskPath (z. B. "\HP\")
  aufgabeName?: string    // aufgabe-aus: TaskName
  adapter?: 'wlan' | 'lan'   // welcher Adapter (Default: wlan)
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
  verbindung?: 'WLAN' | 'LAN'   // welcher Verbindungsart der Befund zugeordnet ist
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
  authFehler?: number      // Event 11006 — WLAN-Sicherheit/802.1X-Authentifizierung fehlgeschlagen
  connectFehler?: number   // Event 8002 — Verbindungsaufbau fehlgeschlagen
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

// ── LAN-spezifisch ───────────────────────────────────────────────────────────
export interface LanStatistik { rxBytes?: number; txBytes?: number; rxErr?: number; txErr?: number; rxDisc?: number; txDisc?: number }
export interface LanVerbindung { linkSpeed?: string; mediaState?: string }
export interface LanEreignis { id: number; zeit: string; grund?: string }
export interface LanEreignisse { tage: number; disconnects: number; connects: number; letzte: LanEreignis[] }
export interface IpConfig { ip?: string; gateway?: string; dns?: string; profil?: string }
export interface PingTest { ziel: string; verlust: number; min?: number | null; avg?: number | null; max?: number | null; jitter?: number | null }
export interface TcpGlobal { autotuning?: string; rss?: string; rsc?: string }

export interface NetDaten {
  ok: boolean
  fehler?: string
  hostname?: string
  aktiv?: { wlan: boolean; lan: boolean }   // welche Verbindungsart(en) sind AKTIV (Up + verbunden)
  mehrereAdapter?: number
  // WLAN
  adapter?: NetAdapterInfo
  advanced: AdvProp[]
  powerMgmt: NetPowerMgmt
  powercfg: NetPowercfg
  verbindung?: NetVerbindung
  ereignisse?: NetEreignisse
  // LAN
  lan?: NetAdapterInfo
  lanAdvanced?: AdvProp[]
  lanPowerMgmt?: NetPowerMgmt
  lanStatistik?: LanStatistik
  lanVerbindung?: LanVerbindung
  lanEreignisse?: LanEreignisse
  // gemeinsam
  ipconfig?: IpConfig
  pingTests?: PingTest[]
  tcpGlobal?: TcpGlobal
  system?: { modell?: string; bios?: string; os?: string; benutzer?: string }
  textBericht?: string
  /** Tiefenanalyse (zweiter Lesedurchgang): wer/was trennt, Umfeld, Änderungen */
  tiefe?: NetTiefe
}

// ── Tiefenanalyse ────────────────────────────────────────────────────────────
/** Event 8003 mit den echten Feldern (Reason/ReasonCode/ConnectionMode) — nicht nur die erste Meldungszeile */
export interface WlanTrennung { zeit: string; grund?: string; code?: string; modus?: string; profil?: string; ssid?: string }
/** Event 8001 (verbunden): Verbindungsart „Automatisch/Manuell mit einem Profil" */
export interface WlanVerbindungEreignis { zeit: string; modus?: string; profil?: string; ssid?: string; auth?: string; onex?: string; phy?: string }
export type UmfeldLog = 'System' | 'Anwendung' | 'WLAN' | 'Richtlinie' | 'MDM' | 'Aufgabe' | 'Netzprofil' | 'Verbindungsmanager'
export interface UmfeldEreignis { log: UmfeldLog; zeit: string; quelle: string; id: number; text: string; extra?: string }
/** Alles, was in den Minuten um EINE Trennung herum protokolliert wurde */
export interface UmfeldFenster { trennung: string; ereignisse: UmfeldEreignis[] }
export interface AufgabeTrigger { typ: string; start?: string; wdh?: string; aktiv?: boolean }
export interface AufgabeInfo { pfad: string; name: string; autor?: string; zustand?: string; letzterLauf?: string; registriert?: string; trigger: AufgabeTrigger[]; aktion?: string }
export interface Aenderung { art: 'Update' | 'Treiber' | 'Software' | 'Aufgabe' | 'Dienst'; zeit: string; text: string }
export interface WlanProfil { name: string; quelle?: string; modus?: string; auth?: string; authMode?: string; eap?: string }
export interface NetTiefe {
  ok?: boolean
  fehler?: string
  trennungen: WlanTrennung[]
  verbindungen: WlanVerbindungEreignis[]
  umfeld: UmfeldFenster[]
  aufgaben: AufgabeInfo[]
  aenderungen: Aenderung[]
  profile: WlanProfil[]
  /** „Netzwerkverbindung im Standbymodus": 0 = Deaktivieren, 1 = Aktivieren, 2 = Von Windows verwaltet */
  standbyNetz?: { ac?: number | null; dc?: number | null; richtlinieAc?: number | null; richtlinieDc?: number | null }
  /** Richtlinien des Verbindungs-Managers (WcmSvc) */
  wcm?: { minimize?: number | null; blockNonDomain?: number | null; softDisconnect?: number | null }
  bios?: { name: string; wert: string }[]
  software?: { name: string; version?: string; datum?: string }[]
  /** `netsh wlan show interfaces` braucht unter Windows 11 die Standortberechtigung */
  netshBlockiert?: boolean
  /** NetworkProfile 10000/10001 mit Netzname — zur Zuordnung WLAN vs. LAN */
  netzprofil?: { zeit: string; id: number; name?: string }[]
  taskLogAktiv?: boolean
  dauerMs?: number
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
