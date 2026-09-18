// ── Live: tatsächlich in Outlook eingebundene (Zusatz-)Postfächer je Rechner ──
// Liest die im Outlook-Profil des angemeldeten Benutzers gemounteten Postfächer
// direkt aus der Registry (WinRM). Jedes eingebundene Exchange-Postfach ist ein
// eigener MAPI-Provider-Unterschlüssel unter
//   HKU\<SID>\Software\Microsoft\Office\<ver>\Outlook\Profiles\<Profil>\<Provider>
// mit den Werten 001f6641 = "SMTP:<primäre SMTP>" und 001f3001 = Anzeigename.
// So sehen wir die Gruppenpostfächer AUCH dann, wenn sie manuell (ohne AutoMapping)
// eingebunden wurden — die AD-Quelle (msExchDelegateListBL) kennt nur AutoMapping.
// (Reine Anzeige — Einbinden ist clientseitig nicht verlässlich skriptbar.)

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import type { MailboxRef } from './personMasterData'

export interface LiveMailboxResult { ok: boolean; mailboxes: MailboxRef[]; reason?: string }

const cache = new Map<string, { at: number; res: LiveMailboxResult }>()
const TTL_MS = 3 * 60 * 1000

export function clearLiveMailboxCache(): void { cache.clear() }

export async function queryLiveMailboxes(hostname: string, opts?: { force?: boolean }): Promise<LiveMailboxResult> {
  const h = (hostname || '').trim().replace(/'/g, '')
  if (!h) return { ok: false, mailboxes: [], reason: 'kein Hostname' }
  const key = h.toUpperCase()
  const cached = cache.get(key)
  if (!opts?.force && cached && Date.now() - cached.at < TTL_MS) return cached.res

  let res: LiveMailboxResult
  try {
    const up = await ensureWinRM(h)
    if (!up) {
      res = { ok: false, mailboxes: [], reason: 'nicht erreichbar / WinRM nicht aktiv' }
    } else {
      const script = [
        `$ErrorActionPreference='SilentlyContinue'`,
        `try {`,
        `  $o = Invoke-Command -ComputerName '${h}' -ErrorAction Stop -ScriptBlock {`,
        `    $acc = @{}`,
        `    $hives = @(Get-ChildItem 'registry::HKEY_USERS' -EA SilentlyContinue | Where-Object { $_.PSChildName -like 'S-1-5-21-*' -and $_.PSChildName -notlike '*_Classes' })`,
        `    foreach ($hv in $hives) {`,
        `      foreach ($ver in @('16.0','15.0')) {`,
        `        $base = "registry::HKU\\$($hv.PSChildName)\\Software\\Microsoft\\Office\\$ver\\Outlook\\Profiles"`,
        `        if (-not (Test-Path $base)) { continue }`,
        `        foreach ($k in @(Get-ChildItem $base -Recurse -EA SilentlyContinue)) {`,
        `          $p = Get-ItemProperty $k.PSPath -EA SilentlyContinue`,
        `          if ($null -eq $p) { continue }`,
        `          $sb = $p.'001f6641'; $nb = $p.'001f3001'`,
        `          if (($sb -isnot [byte[]]) -or ($nb -isnot [byte[]])) { continue }`,
        `          $smtp = ([System.Text.Encoding]::Unicode.GetString($sb)).Split([char]0)[0] -replace '^SMTP:',''`,
        `          $name = ([System.Text.Encoding]::Unicode.GetString($nb)).Split([char]0)[0]`,
        `          if (-not $smtp -or -not $name) { continue }`,
        `          if ($smtp -match '^ExchangeGuid\\+') { continue }`,
        `          $acc[$smtp.ToLower()] = [pscustomobject]@{ smtp = $smtp; name = $name }`,
        `        }`,
        `      }`,
        `    }`,
        `    @($acc.Values)`,
        `  }`,
        `  $o | Select-Object smtp, name | ConvertTo-Json -Compress -Depth 4`,
        `} catch { 'ERR:' + $_.Exception.Message }`,
      ].join('\n')
      const r = await api().runPowerShell(script, 45000)
      const txt = (r.stdout ?? '').trim()
      if (!txt || txt === 'null' || txt.startsWith('ERR:')) {
        res = txt.startsWith('ERR:')
          ? { ok: false, mailboxes: [], reason: txt.replace(/^ERR:/, '').trim() || 'Fehler' }
          : { ok: true, mailboxes: [] }
      } else {
        const parsed = JSON.parse(txt) as unknown
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        const seen = new Set<string>()
        const mailboxes: MailboxRef[] = arr
          .map(o => { const oo = o as { smtp?: unknown; name?: unknown }; return { email: String(oo?.smtp ?? '').trim(), name: String(oo?.name ?? '').trim() } })
          .filter(m => (m.email || m.name) && !seen.has((m.email || m.name).toLowerCase()) && seen.add((m.email || m.name).toLowerCase()))
        res = { ok: true, mailboxes }
      }
    }
  } catch (e) {
    res = { ok: false, mailboxes: [], reason: e instanceof Error ? e.message : String(e) }
  }
  cache.set(key, { at: Date.now(), res })
  return res
}
