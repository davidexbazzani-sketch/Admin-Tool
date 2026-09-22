// ── Verbundene Netzlaufwerke je Gerät (Dossier) ──────────────────────────────
// Zeigt/verwaltet die verbundenen Netzlaufwerke eines PCs im Geräte-Dossier.
// Wie bei den verbundenen Druckern wird NICHT automatisch live abgefragt — erst
// wenn ein Admin-Tool-Nutzer „Live aktualisieren" klickt. Das Ergebnis wird
// ZENTRAL auf dem Netzlaufwerk gespeichert (pro Host eine JSON) und bleibt damit
// für ALLE Tool-Nutzer sichtbar, bis es das nächste Mal live aktualisiert wird.
//
// Verbinden/Trennen laufen im Kontext des am Ziel-PC angemeldeten Benutzers
// (runInUserContext, Scheduled-Task) — persistente Mappings (HKCU\Network).

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import { runInUserContext, type ClientActionResult } from './printerConnections'
import type { InventoryItem } from '../types/auth'

export interface NetDriveEntry { letter: string; unc: string }
export interface StoredNetworkDrives {
  hostname: string
  drives: NetDriveEntry[]
  ok: boolean
  reason?: string
  scannedAt: string
  scannedBy: string
}

function slug(h: string): string { return (h || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') }
function storePath(host: string): string { return `device_network_drives/${slug(host)}.json` }
function psq(s: string): string { return (s || '').replace(/'/g, "''") }
function normLetter(l: string): string { return (l || '').replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase() }

/** Zuletzt gespeicherten (zentralen) Stand der Netzlaufwerke lesen — ohne WinRM. */
export async function loadStoredNetworkDrives(hostname: string): Promise<StoredNetworkDrives | null> {
  if (!hostname) return null
  try { return await api().netReadJson<StoredNetworkDrives>(storePath(hostname)) } catch { return null }
}

async function saveStoredNetworkDrives(v: StoredNetworkDrives): Promise<void> {
  try { await api().netWriteJson(storePath(v.hostname), v) } catch { /* best effort */ }
}

/** Ein Laufwerk deterministisch aus dem gespeicherten (zentralen) Stand entfernen. */
async function removeStoredDrive(hostname: string, letter: string): Promise<StoredNetworkDrives | null> {
  const prev = await loadStoredNetworkDrives(hostname)
  if (!prev) return null
  const next: StoredNetworkDrives = { ...prev, drives: prev.drives.filter(d => d.letter !== letter) }
  await saveStoredNetworkDrives(next)
  return next
}

/**
 * Netzlaufwerke des Hosts LIVE per WinRM lesen (persistente Mappings aus den
 * geladenen Benutzer-Hives HKU\…\Network) und bei Erfolg zentral speichern.
 * Bei Nicht-Erreichbarkeit bleibt der zuletzt gespeicherte Stand erhalten.
 */
export async function refreshNetworkDrivesLive(hostname: string, by: string): Promise<StoredNetworkDrives> {
  const h = (hostname || '').trim()
  const nowIso = new Date().toISOString()
  if (!h) return { hostname: h, drives: [], ok: false, reason: 'kein Hostname', scannedAt: nowIso, scannedBy: by }

  const up = await ensureWinRM(h)
  if (!up) {
    // Erreichbarkeit fehlt → gespeicherten Stand behalten, nur Grund melden.
    const prev = await loadStoredNetworkDrives(h)
    return prev
      ? { ...prev, ok: false, reason: 'nicht erreichbar / WinRM nicht aktiv' }
      : { hostname: h, drives: [], ok: false, reason: 'nicht erreichbar / WinRM nicht aktiv', scannedAt: nowIso, scannedBy: by }
  }

  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `try {`,
    `  $o = Invoke-Command -ComputerName '${psq(h)}' -ErrorAction Stop -ScriptBlock {`,
    `    $out=@()`,
    // Persistente Netzlaufwerke stehen je Benutzer unter HKU\<SID>\Network\<Buchstabe>\RemotePath.
    `    foreach ($hv in @(Get-ChildItem 'registry::HKEY_USERS' -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -like 'S-1-5-21-*' -and $_.PSChildName -notlike '*_Classes' })) {`,
    `      $net = 'registry::HKU\\' + $hv.PSChildName + '\\Network'`,
    `      if (Test-Path $net) { foreach ($k in (Get-ChildItem $net -ErrorAction SilentlyContinue)) { $rp = (Get-ItemProperty $k.PSPath -Name RemotePath -ErrorAction SilentlyContinue).RemotePath; if ($rp) { $out += [pscustomobject]@{ letter=([string]$k.PSChildName).ToUpper(); unc=[string]$rp } } } }`,
    `    }`,
    // Zusätzlich aktuell verbundene (auch nicht-persistente) Sitzungslaufwerke.
    `    foreach ($m in @(Get-CimInstance Win32_MappedLogicalDisk -ErrorAction SilentlyContinue)) { $out += [pscustomobject]@{ letter=([string]$m.DeviceID).TrimEnd(':').ToUpper(); unc=[string]$m.ProviderName } }`,
    `    $out`,
    `  }`,
    `  $o | Select-Object letter, unc | ConvertTo-Json -Compress -Depth 4`,
    `} catch { 'ERR:' + $_.Exception.Message }`,
  ].join('\n')

  try {
    const r = await api().runPowerShell(script, 45000)
    const txt = (r.stdout ?? '').trim()
    if (!txt || txt.startsWith('ERR:')) {
      const prev = await loadStoredNetworkDrives(h)
      const reason = txt.replace(/^ERR:/, '').trim() || 'keine Antwort'
      return prev ? { ...prev, ok: false, reason } : { hostname: h, drives: [], ok: false, reason, scannedAt: nowIso, scannedBy: by }
    }
    const parsed = JSON.parse(txt) as { letter?: string; unc?: string }[] | { letter?: string; unc?: string }
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    const seen = new Set<string>()
    const drives: NetDriveEntry[] = []
    for (const d of arr) {
      const letter = normLetter(String(d?.letter ?? ''))
      const unc = String(d?.unc ?? '').trim()
      if (!letter || !unc || seen.has(letter)) continue
      seen.add(letter); drives.push({ letter, unc })
    }
    drives.sort((a, b) => a.letter.localeCompare(b.letter))
    const result: StoredNetworkDrives = { hostname: h, drives, ok: true, scannedAt: nowIso, scannedBy: by }
    await saveStoredNetworkDrives(result)
    return result
  } catch (e) {
    const prev = await loadStoredNetworkDrives(h)
    const reason = e instanceof Error ? e.message : String(e)
    return prev ? { ...prev, ok: false, reason } : { hostname: h, drives: [], ok: false, reason, scannedAt: nowIso, scannedBy: by }
  }
}

// ── Geplanter Scan über ALLE Computer (Automatische Scans) ───────────────────
/** Status-Datei für den Zeitplan/Claim des Netzlaufwerk-Scans. */
export const NETWORK_DRIVES_STATUS = 'device_network_drives/_scan_status.json'

/** Computer-Hostnamen aus dem Inventar (Kategorie „Computer", dedupliziert). */
async function loadComputerHostnames(): Promise<string[]> {
  try {
    const items = (await api().netReadJson<InventoryItem[]>('inventory/inventory.json')) ?? []
    const seen = new Set<string>()
    const out: string[] = []
    for (const i of Array.isArray(items) ? items : []) {
      if ((i.category || '').toLowerCase() !== 'computer') continue
      const name = (i.name || '').trim()
      if (!name) continue
      const key = name.toLowerCase().split('.')[0]
      if (seen.has(key)) continue
      seen.add(key); out.push(name)
    }
    return out
  } catch { return [] }
}

/**
 * EIN geplanter Lauf: liest für ALLE Computer die verbundenen Netzlaufwerke live
 * ein (max. 10 parallel, WinRM-Regel) und speichert je Host zentral. Offline-PCs
 * behalten automatisch ihren zuletzt gespeicherten Stand (refreshNetworkDrivesLive).
 * Ergebnis erscheint danach im Geräte-„i" unter „Verbundene Netzlaufwerke".
 */
export async function runNetworkDrivesScanOnce(by: string, onTick?: () => void): Promise<{ ok: boolean; summary: string }> {
  const hosts = await loadComputerHostnames()
  if (hosts.length === 0) return { ok: false, summary: 'Keine Computer im Inventar gefunden.' }
  let ok = 0, off = 0, drives = 0
  const BATCH = 10
  for (let i = 0; i < hosts.length; i += BATCH) {
    const chunk = hosts.slice(i, i + BATCH)
    const results = await Promise.all(chunk.map(h => refreshNetworkDrivesLive(h, by).catch(() => null)))
    for (const r of results) {
      if (!r) { off++; continue }
      if (r.ok) { ok++; drives += r.drives.length } else off++
    }
    onTick?.()
  }
  return { ok: true, summary: `${hosts.length} Computer · ${ok} gescannt (${drives} Laufwerke) · ${off} offline/Fehler` }
}

/** Ein Netzlaufwerk im Kontext des angemeldeten Benutzers verbinden (persistent). */
export async function connectNetworkDrive(hostname: string, letter: string, unc: string): Promise<ClientActionResult> {
  const l = normLetter(letter); const u = (unc || '').trim()
  if (!l) return { ok: false, text: 'Kein gültiger Laufwerksbuchstabe.' }
  if (!/^\\\\/.test(u)) return { ok: false, text: 'Bitte einen UNC-Pfad angeben (\\\\Server\\Freigabe).' }
  const op = `try { cmd /c "net use ${l}: /delete /y" | Out-Null } catch {}\ntry { cmd /c "net use ${l}: ""${u.replace(/"/g, '')}"" /persistent:yes" | Out-Null } catch {}`
  return runInUserContext(hostname, op, 90000)
}

/**
 * Ein Netzlaufwerk im Kontext des angemeldeten Benutzers trennen. Nach Erfolg wird
 * das Laufwerk SOFORT aus dem gespeicherten Stand entfernt (deterministisch) und der
 * neue Stand zurückgegeben — KEIN Live-Rescan, der es (wegen des noch laufenden
 * Scheduled-Tasks) versehentlich wieder einliest. So verschwindet es zuverlässig
 * aus der Übersicht — auch für alle anderen Tool-Nutzer.
 */
export async function disconnectNetworkDrive(hostname: string, letter: string): Promise<ClientActionResult & { stored?: StoredNetworkDrives }> {
  const l = normLetter(letter)
  if (!l) return { ok: false, text: 'Kein gültiger Laufwerksbuchstabe.' }
  const op = `try { cmd /c "net use ${l}: /delete /y" | Out-Null } catch {}`
  const r = await runInUserContext(hostname, op, 60000)
  if (!r.ok) return { ok: false, text: r.text }
  const stored = await removeStoredDrive(hostname, l)
  return { ok: true, text: r.text, stored: stored || undefined }
}
