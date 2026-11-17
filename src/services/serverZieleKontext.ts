// ── Kontext fürs Server-Zugriffsprotokoll (electron/zugriffsProtokoll.ts) ─────
// Schiebt dem Hauptprozess die bekannten Servernamen (Kacheln, Inventar „Server“,
// Serverliste), die Cluster-Knoten samt IPs und den angemeldeten Benutzer. Daraus
// erkennt der Hauptprozess, welche Befehle Server ansprechen (→ Protokoll) und welche
// einen Cluster-Knoten mehr als anpingen würden (→ gesperrt).
// Einmal nach dem Login (ServerMonitorController), danach alle 15 min. Wirft nie.
import { api } from '../electronAPI'
import { kurzName } from '../../electron/serverZiele'
import { ladeServerListe, type ServerListe } from './serverListe'
import { loadServerConfig, loadInventoryServers } from './serverMonitor'
import { useAuthStore } from '../store/authStore'
import { KNOTEN_TITEL, clusterKnoten, ergaenzeKnoten, knotenIpListe, setzeKnotenIps } from './serverSchonung'

const istIp = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s)

/** Knoten laut Serverliste (Titel „HCI Cluster Node“ / „Cluster Admin“). */
export function knotenAusListe(liste: ServerListe | null): string[] {
  if (!liste) return []
  return liste.server
    .filter(s => s.gueltigerHost && s.anwendungen.some(a => KNOTEN_TITEL.test(a.titel || '')))
    .map(s => kurzName(s.host))
    .filter(Boolean)
}

/** Knoten-IPs per DNS (nur Namensauflösung beim DNS-Server — der Knoten selbst wird nicht angesprochen). */
async function loeseKnotenAuf(knoten: string[]): Promise<Record<string, string>> {
  if (!knoten.length) return {}
  const liste = knoten.map(k => `'${k.replace(/'/g, "''")}'`).join(',')
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `foreach ($n in @(${liste})) { try { foreach ($a in [System.Net.Dns]::GetHostAddresses($n)) { if ($a.AddressFamily -eq 'InterNetwork') { Write-Output ('KN' + [char]9 + $n + [char]9 + $a.IPAddressToString) } } } catch {} }`,
  ].join('\n')
  const out: Record<string, string> = {}
  try {
    const r = await api().runPowerShell(script, 15000, { quelle: 'DNS-Auflösung Cluster-Knoten' })
    for (const z of (r?.stdout || '').split(/\r?\n/)) {
      const [m, n, ip] = z.split('\t')
      if (m === 'KN' && n && ip && istIp(ip.trim())) out[ip.trim()] = kurzName(n)
    }
  } catch { /* ohne IPs gilt die Namensliste */ }
  return out
}

function benutzerText(): string {
  const u = useAuthStore.getState().session?.user
  return u ? (u.displayName ? `${u.displayName} (${u.username})` : u.username) : ''
}

/** Servernamen, Knoten (+IPs) und Benutzer an den Hauptprozess schieben. Wirft nie. */
export async function aktualisiereServerZiele(): Promise<void> {
  try {
    const [cfg, inv, sl] = await Promise.all([
      loadServerConfig().catch(() => ({ tiles: [] as { hostname: string; ip?: string }[] })),
      loadInventoryServers().catch(() => [] as { hostname: string; ip?: string }[]),
      ladeServerListe().catch(() => ({ liste: null as ServerListe | null })),
    ])
    ergaenzeKnoten(knotenAusListe(sl.liste))
    const namen = new Set<string>()
    const ipNamen: Record<string, string> = {}
    const merke = (hostname?: string, ip?: string) => {
      const n = kurzName(hostname || '')
      if (!n) return
      namen.add(n)
      const i = (ip || '').trim()
      if (istIp(i) && !istIp(n)) ipNamen[i] = n
    }
    for (const t of cfg.tiles || []) merke(t.hostname, t.ip)
    for (const s of inv || []) merke(s.hostname, s.ip)
    for (const s of sl.liste?.server || []) if (s.gueltigerHost && s.zustand !== 'geloescht') merke(s.host)
    const knoten = clusterKnoten()
    const ips = await loeseKnotenAuf(knoten)
    if (Object.keys(ips).length) setzeKnotenIps(ips)
    for (const [ip, n] of Object.entries(knotenIpListe())) ipNamen[ip] = n
    for (const k of knoten) namen.add(k)
    await api().zugriffeKontext({ namen: [...namen], knoten, ipNamen, benutzer: benutzerText() })
  } catch { /* nie stören */ }
}

let gestartet = false
/** Einmal nach dem Login (ServerMonitorController), danach alle 15 min. */
export function starteServerZiele(): void {
  if (gestartet) return
  gestartet = true
  void aktualisiereServerZiele()
  setInterval(() => { void aktualisiereServerZiele() }, 15 * 60_000)
}
