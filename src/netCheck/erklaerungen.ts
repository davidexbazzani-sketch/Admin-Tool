// ── Netzwerk-Diagnose: ausführliche Erklärungen je Befund ────────────────────
// wirkung = Problem + Auswirkung; aenderung/vorteil/nachteil/wannNicht = für den
// „Ausführliche Erklärung"-Aufklapper in der Analyse.

import type { Erklaerung } from './types'

const LISTE: { test: RegExp; e: Erklaerung }[] = [
  {
    test: /energiespar|powercfg|drahtlosadapter/i,
    e: {
      wirkung: 'Der Windows-Energieplan darf den WLAN-Adapter in einen Sparmodus versetzen. Fließen kurz keine Daten, drosselt Windows den Funk — das führt zu kurzen, sporadischen Aussetzern, die genau dann auftreten, wenn man gerade nichts überträgt.',
      aenderung: 'Der Wert „Energiesparmodus" der Drahtlosadaptereinstellungen wird für Netzbetrieb UND Akku auf „Höchstleistung" (Index 0) gesetzt.',
      vorteil: 'Der Adapter läuft durchgehend auf voller Leistung → deutlich stabilere Verbindung, keine energiebedingten Mikro-Trennungen.',
      nachteil: 'Minimal höherer Stromverbrauch im Akkubetrieb (in der Praxis vernachlässigbar).',
      wannNicht: 'Nur wenn maximale Akkulaufzeit wichtiger ist als eine stabile Verbindung — dann ggf. nur den Netzbetrieb auf Höchstleistung setzen.',
    },
  },
  {
    test: /abschalt|ausschalten|energieverwaltung|pnpcapab|turnoff/i,
    e: {
      wirkung: 'Im Geräte-Manager ist „Computer kann das Gerät ausschalten, um Energie zu sparen" aktiv. Windows schaltet den WLAN-Adapter in Ruhephasen ab und wieder ein — beim Wiedereinschalten entsteht eine kurze Trennung.',
      aenderung: 'Der Haken „Gerät ausschalten…" wird entfernt (PnPCapabilities so gesetzt, dass Windows den Adapter nicht mehr abschaltet).',
      vorteil: 'Der Adapter bleibt dauerhaft aktiv → keine Aussetzer durch Ab-/Einschalten.',
      nachteil: 'Etwas höherer Standby-Verbrauch.',
      wannNicht: 'Praktisch immer sinnvoll bei Verbindungsproblemen; nur bei bewusst maximaler Energiesparkonfiguration belassen.',
    },
  },
  {
    test: /roaming|roam/i,
    e: {
      wirkung: 'Die Roaming-Aggressivität steuert, wie früh der Adapter zu einem anderen Access Point wechselt. Zu hoch eingestellt „springt" der Adapter in Umgebungen mit vielen APs schon bei kleinen Signalschwankungen — und trennt dabei kurz. Das erklärt, warum nur einzelne Geräte betroffen sind.',
      aenderung: 'Die Roaming-Aggressivität wird auf „Mittel" gesetzt.',
      vorteil: 'Ausgewogenes Verhalten: Wechsel nur bei wirklich schlechtem Signal → weniger unnötige Trennungen.',
      nachteil: 'Bei tatsächlich schwachem Signal wechselt der Adapter minimal später auf einen besseren AP.',
      wannNicht: 'In reinen Ein-AP-Umgebungen kann sogar „Niedrigste" besser sein; in großen Mesh-/Roaming-Umgebungen ggf. „Mittel-Hoch" — hier bewusst abwägen.',
    },
  },
  {
    test: /uapsd|u-apsd|wmm/i,
    e: {
      wirkung: 'U-APSD (WMM-Stromsparen) spart Energie bei latenzarmem Verkehr (z. B. VoIP). Mit manchen Access-Point-Firmwares gibt es aber Interoperabilitätsprobleme, die zu Verbindungsstörungen und Drops führen.',
      aenderung: 'U-APSD-Unterstützung wird deaktiviert.',
      vorteil: 'Beseitigt eine bekannte Ursache für AP-bedingte WLAN-Störungen.',
      nachteil: 'Minimal höherer Energieverbrauch bei latenzsensitivem Verkehr.',
      wannNicht: 'Wenn gezielt VoIP-Stromsparen benötigt wird und der AP U-APSD sauber unterstützt.',
    },
  },
  {
    test: /throughput.?booster/i,
    e: {
      wirkung: 'Der Throughput Booster optimiert einseitig den Upload, kann aber in dichten WLAN-Umgebungen die Fairness/Stabilität verschlechtern.',
      aenderung: 'Throughput Booster wird deaktiviert (Standard).',
      vorteil: 'Normales, faires WLAN-Verhalten → stabiler in belegten Umgebungen.',
      nachteil: 'Etwas geringerer Upload-Spitzendurchsatz in Sonderfällen.',
      wannNicht: 'Nur für dedizierte Upload-lastige Arbeitsplätze aktiv lassen.',
    },
  },
  {
    test: /be200|mlo|multi.?link|802\.11be|wi-?fi\s*7/i,
    e: {
      wirkung: 'Für die Intel BE200 (Wi-Fi 7) ist ein Bug dokumentiert: bei aktiviertem Multi-Link-Betrieb (MLO) trennt der Access Point die Verbindung wiederholt.',
      aenderung: 'Der Adapter wird auf 802.11ax festgelegt bzw. MLO deaktiviert.',
      vorteil: 'Beseitigt die MLO-bedingten Dauertrennungen der BE200.',
      nachteil: 'Kein Wi-Fi-7-Multi-Link mehr (in der Praxis für Büro-WLAN meist irrelevant, da APs oft noch kein Wi-Fi 7 sind).',
      wannNicht: 'Wenn der Access Point nachweislich Wi-Fi 7/MLO stabil unterstützt und kein Drop-Problem besteht.',
    },
  },
  {
    test: /treiber|driver/i,
    e: {
      wirkung: 'Frühe Intel-WLAN-Treiber/Firmware (AX211/BE200) sind für sporadische Trennungen unter Windows 11 bekannt. Ein veralteter oder von den funktionierenden Geräten abweichender Treiberstand ist ein starker Verdächtiger.',
      aenderung: 'Über den Menüpunkt „Treiber-Installation" wird der WLAN-Treiber auf einen aktuellen, stabilen Stand (≥ 23.30) gebracht.',
      vorteil: 'Behebt herstellerseitig bekannte Firmware-/Treiberfehler.',
      nachteil: 'Kurzer Adapter-Neustart während der Installation.',
      wannNicht: 'Wenn bereits ein aktueller, für die Umgebung freigegebener Treiber läuft.',
    },
  },
  {
    test: /bssid|access point|netzseit|ap-firmware/i,
    e: {
      wirkung: 'Häufen sich die Trennungen an einem bestimmten Access Point (BSSID), liegt die Ursache eher im Netz (dieser AP, DFS-Kanalwechsel, AP-Firmware) als in einer PC-Einstellung.',
      aenderung: 'Keine PC-Änderung — der betroffene Access Point / die Netzwerkseite sollte geprüft werden.',
      vorteil: 'Vermeidet unnötige Änderungen am Client, wenn der Fehler netzseitig ist.',
      nachteil: '—',
      wannNicht: '—',
    },
  },
]

export function findeErklaerung(opts: { name?: string; titel?: string; fundort?: string }): Erklaerung | undefined {
  const text = `${opts.name || ''} ${opts.titel || ''} ${opts.fundort || ''}`
  for (const { test, e } of LISTE) if (test.test(text)) return e
  return undefined
}
