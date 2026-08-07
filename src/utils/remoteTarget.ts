// ── Remote-Ziel: Hostname ODER IP-Adresse ────────────────────────────────────
// Für Remote-Aktionen (Software-Installation, Diagnose …) kann der Zielrechner
// entweder über seinen AD-Hostnamen (beginnt mit "DE…") ODER direkt über seine
// IP-Adresse angesprochen werden.
//
// WICHTIG (WinRM per IP): Kerberos funktioniert nur über den Hostnamen (SPN).
// Für eine Verbindung per IP fällt WinRM auf NTLM zurück — dafür muss die IP in
// den lokalen WinRM-TrustedHosts stehen. ensureWinRmTrustedHost() trägt sie bei
// Bedarf idempotent ein (Best-Effort, benötigt lokale Admin-Rechte). SMB/UNC
// (\\<ip>\C$) funktioniert ohnehin ohne TrustedHosts.

import { api } from '../electronAPI'

/** Gültige IPv4-Adresse (0-255 pro Oktett)? */
export function isIpv4(s: string): boolean {
  const t = (s ?? '').trim()
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(t)
  if (!m) return false
  return m.slice(1, 5).every(o => { const n = Number(o); return n >= 0 && n <= 255 })
}

/** AD-Hostname (beginnt mit "DE…")? */
export function isDeHostname(s: string): boolean {
  return /^DE/i.test((s ?? '').trim())
}

/** Gültiges Remote-Ziel: DE-Hostname ODER IPv4-Adresse. */
export function isValidRemoteTarget(s: string): boolean {
  return isDeHostname(s) || isIpv4(s)
}

/**
 * Stellt sicher, dass eine IP-Adresse in den lokalen WinRM-TrustedHosts steht,
 * damit `Invoke-Command -ComputerName <IP>` (NTLM) funktioniert. Für Hostnamen
 * eine No-Op. Idempotent; wenn bereits '*' gesetzt ist, bleibt es unverändert.
 * Best-Effort: schlägt es fehl (z. B. keine Admin-Rechte), meldet die Remote-
 * Prüfung das ohnehin.
 */
export async function ensureWinRmTrustedHost(target: string): Promise<{ ok: boolean; message?: string }> {
  const t = (target ?? '').trim()
  if (!isIpv4(t)) return { ok: true }  // Hostnamen brauchen keinen TrustedHosts-Eintrag
  const script = [
    `$ErrorActionPreference='Stop'`,
    `try {`,
    `  $cur = ''`,
    `  try { $cur = (Get-Item WSMan:\\localhost\\Client\\TrustedHosts -EA Stop).Value } catch {}`,
    `  if ($cur -eq '*') { 'OK'; return }`,
    `  $list = @()`,
    `  if ($cur) { $list = $cur -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ } }`,
    `  if ($list -contains '${t}') { 'OK'; return }`,
    `  $new = (($list + '${t}') -join ',')`,
    `  Set-Item WSMan:\\localhost\\Client\\TrustedHosts -Value $new -Force -EA Stop`,
    `  'OK'`,
    `} catch { 'FAIL: ' + $_.Exception.Message }`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 15000)
    const out = (res.stdout ?? '').trim()
    if (out.startsWith('OK')) return { ok: true }
    return { ok: false, message: out.replace(/^FAIL:\s*/, '') || 'TrustedHosts konnte nicht gesetzt werden' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
