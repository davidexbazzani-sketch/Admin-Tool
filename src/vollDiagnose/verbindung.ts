// ── PC-Volldiagnose Stufe 0: Ziel lesen — OHNE etwas zu ändern ───────────────
// Bewusst NICHT verbinde()/ensureWinRM()/verbindeUndLies(): die schalten WinRM ein (Eingriff).
// Hier nur: Ping/Port-Probe, Test-WSMan, dann lesend Betriebssystem/Benutzer per WinRM.
// Ist WinRM aus: PC → Knopf „WinRM einschalten“ (Eingriff, nur nach Bestätigung);
// Server → nie einschalten (Grundsatz: auf Servern nichts ändern ohne Bestätigung, WinRM nie).

import { api } from '../electronAPI'
import { esc } from '../services/enaioInstall'
import { fern, lies, kurzFehler } from '../services/serverZustand'
import { istBekannterServer } from '../services/itAdminToolInstall'
import { istClusterKnoten } from '../services/serverSchonung'
import { pingBatch } from '../services/userPresenceScan'
import { ZIEL_PS } from './skripte'
import type { VdZiel } from './typen'

/** Erreichbarkeit + WinRM-Port ohne Eingriff (Ping, sonst TCP 5985/445/135, dann Test-WSMan). */
export function probeSkript(host: string): string {
  return [
    `$h = '${esc(host)}'; $on = $false; $wsman = $false`,
    `try { $on = Test-Connection -ComputerName $h -Count 1 -Quiet -EA SilentlyContinue } catch {}`,
    `if (-not $on) { foreach ($port in 5985, 445, 135) { try { $t = New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync($h, $port).Wait(2000)) { $on = $true }; $t.Close() } catch {}; if ($on) { break } } }`,
    `if ($on) { try { Test-WSMan -ComputerName $h -EA Stop | Out-Null; $wsman = $true } catch {} }`,
    `'@@VDPROBE@@' + (@{ online = [bool]$on; winrm = [bool]$wsman } | ConvertTo-Json -Compress)`,
  ].join('\n')
}

export async function liesZiel(host: string): Promise<VdZiel> {
  const h = host.trim()
  // Cluster-Knoten (HCI, vom Dienstleister verwaltet): nur Ping, nichts auslesen (serverSchonung.ts)
  if (h && istClusterKnoten(h)) {
    const up = await pingBatch([h], 1200, { quelle: 'Komplett-Diagnose: Ping', art: 'ping' }).catch(() => ({ up: [] as string[] }))
    const on = up.up.length > 0
    return {
      host: h, online: on, winrm: false, geraet: 'server', bekannterServer: true,
      fehler: `${h} ist ein Cluster-Knoten (HCI, vom Dienstleister verwaltet). Das IT Admin Tool pingt ihn nur an (${on ? 'antwortet' : 'antwortet nicht'}) – es liest dort nichts aus und ändert nichts.`,
    }
  }
  const bekannt = await istBekannterServer(h).catch(() => false)
  const basis: VdZiel = { host: h, online: false, winrm: false, geraet: bekannt ? 'server' : 'pc', bekannterServer: bekannt }
  if (!h) return { ...basis, fehler: 'Kein Ziel gewählt.' }
  const p = await api().runPowerShell(probeSkript(h), 30000, { quelle: 'Komplett-Diagnose: Erreichbarkeit', art: 'lesen' }).catch(() => null)
  const pr = p ? lies<{ online?: boolean; winrm?: boolean }>(p.stdout, '@@VDPROBE@@') : null
  if (!pr?.online) return { ...basis, fehler: `${h} antwortet nicht (ausgeschaltet, nicht im Netz oder falscher Name).` }
  if (!pr.winrm) return { ...basis, online: true, fehler: `${h} ist erreichbar, aber WinRM (Fernverwaltung) antwortet nicht.` }
  const r = await api().runPowerShell(fern(h, ZIEL_PS, '@@VDZIEL@@', {}, 60000), 75000, { quelle: 'Komplett-Diagnose', art: 'lesen' }).catch(() => null)
  const d = r ? lies<Record<string, unknown>>(r.stdout, '@@VDZIEL@@') : null
  if (!d || d.ok === false) return { ...basis, online: true, winrm: true, fehler: d?.fehler ? kurzFehler(String(d.fehler)) : 'Geräteinformationen nicht lesbar (Rechte?).' }
  const produktTyp = typeof d.produktTyp === 'number' ? d.produktTyp : undefined
  const benutzer = String(d.benutzer || '').trim() || undefined
  return {
    ...basis, online: true, winrm: true,
    geraet: bekannt || (produktTyp !== undefined && produktTyp !== 1) ? 'server' : 'pc',
    produktTyp, os: String(d.os || '') || undefined, build: String(d.build || '') || undefined, boot: String(d.boot || '') || undefined,
    benutzer, sam: benutzer ? benutzer.split('\\').pop() : undefined, sitzung: String(d.sitzung || '') || undefined, gesperrt: !!d.gesperrt,
    modell: String(d.modell || '') || undefined, seriennummer: String(d.seriennummer || '') || undefined, domaene: String(d.domaene || '') || undefined,
  }
}

/** Eingriff (nur PC, nur nach Bestätigung): WinRM auf dem PC einschalten — wie Remote Doc. */
export async function winrmEinschalten(host: string, von: string): Promise<string> {
  const z = await liesZiel(host)
  if (z.geraet === 'server') return 'Auf Servern schaltet die Volldiagnose WinRM nie ein.'
  const { verbinde } = await import('../services/enaioInstall')
  const f = await verbinde(host)
  void import('../services/aktivitaet').then(m => m.protokolliere({ art: 'manuell', quelle: 'PC-Volldiagnose', aktion: 'WinRM eingeschaltet (nach Bestätigung)', ziel: host.toUpperCase(), ergebnis: f || 'ok', benutzer: von })).catch(() => {})
  return f
}
