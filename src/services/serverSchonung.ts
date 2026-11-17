// ── Schonung der Cluster-Knoten (HCI) ─────────────────────────────────────────
// Nutzerwunsch 16.11.2026: Die HCI-Knoten W3135–W3138 (+ W3153 „Cluster Admin“) sind
// instabil; sie werden vom Dienstleister verwaltet, das Tool hat dort keinen Zugriff.
// Das Tool pingt sie deshalb NUR noch an — keine WinRM-/DCOM-Abfrage, kein DISM, kein
// Geräte-/VLAN-Scan, keine WinRM-Aktivierung. Die automatischen Abläufe lassen sie mit
// diesen Funktionen aus (damit die übrigen Server eines Stapels normal laufen); jeden
// anderen Weg fängt die Sperre im Hauptprozess ab (electron/zugriffsProtokoll.ts).
//
// Bewusst ohne weitere Abhängigkeiten (wird von vielen Diensten importiert). Die Knoten
// aus der Serverliste und ihre IPs setzt serverZieleKontext.ts.
import { STANDARD_KNOTEN, kurzName } from '../../electron/serverZiele'

export const CLUSTER_KNOTEN_FEST: readonly string[] = STANDARD_KNOTEN
/** Titel der Serverliste, an denen ein Cluster-Knoten erkannt wird. */
export const KNOTEN_TITEL = /HCI\s*Cluster\s*Node|Cluster\s*Admin/i

export const NUR_PING_KURZ = 'nur Ping · Cluster-Knoten'
export const NUR_PING_TEXT = 'Cluster-Knoten (HCI, vom Dienstleister verwaltet): Das IT Admin Tool pingt diesen Server nur an. Es fragt nichts ab, startet nichts und ändert nichts.'

const ausListe = new Set<string>()
/** IP → Knotenname (per DNS aufgelöst) */
let knotenIps: Record<string, string> = {}

const istIp = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s)

/** Ist der Rechner (Name, FQDN, \\Name oder IP) ein Cluster-Knoten? */
export function istClusterKnoten(host?: string | null): boolean {
  const k = kurzName(String(host || ''))
  if (!k) return false
  if (istIp(k)) return !!knotenIps[k]
  return CLUSTER_KNOTEN_FEST.includes(k) || ausListe.has(k)
}

/** Knotenname zu einer IP (nur bekannte Knoten-IPs), sonst undefined. */
export function knotenVonIp(ip?: string | null): string | undefined {
  return knotenIps[String(ip || '').trim()]
}

/** Alle bekannten Cluster-Knoten (fest + Serverliste). */
export function clusterKnoten(): string[] {
  return [...new Set([...CLUSTER_KNOTEN_FEST, ...ausListe])]
}

/** Liste ohne Cluster-Knoten (für automatische Abläufe). */
export function ohneKnoten<T>(liste: T[], host: (x: T) => string | undefined | null): T[] {
  return liste.filter(x => !istClusterKnoten(host(x)))
}

/** Knoten aus der Serverliste ergänzen (feste Knoten bleiben immer). */
export function ergaenzeKnoten(namen: string[]): void {
  for (const n of namen) { const k = kurzName(n); if (k && !istIp(k)) ausListe.add(k) }
}
/** IPs der Knoten (per DNS aufgelöst). */
export function setzeKnotenIps(ips: Record<string, string>): void {
  const neu: Record<string, string> = {}
  for (const [ip, n] of Object.entries(ips || {})) if (istIp(ip.trim()) && n) neu[ip.trim()] = kurzName(n)
  knotenIps = neu
}
export const knotenIpListe = (): Record<string, string> => ({ ...knotenIps })

/** Nur für Tests: Zustand zurücksetzen. */
export function _setzeKnotenTest(namen: string[], ips: Record<string, string> = {}): void {
  ausListe.clear(); ergaenzeKnoten(namen); setzeKnotenIps(ips)
}
