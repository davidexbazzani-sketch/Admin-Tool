// ── Live verbundene Drucker je Hostname (WinRM) ──────────────────────────────
// Fragt die tatsächlich installierten/verbundenen Drucker eines Rechners LIVE ab
// (wie Remote-Doc „DIAG: Drucker-Komplett"), damit die verbundenen Drucker im
// Geräte- und Personen-Dossier IMMER angezeigt werden — unabhängig davon, ob der
// periodische Verbindungs-Scan gerade etwas erfasst hat. Virtuelle/lokale Drucker
// (PDF, XPS, OneNote, Fax, Snagit …) werden herausgefiltert.

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import { shareOf, canonPrinterName } from './printerConnections'

export interface LivePrinter { name: string; port: string; driver: string; status: string; isDefault: boolean }
export interface LivePrintersResult { ok: boolean; printers: LivePrinter[]; reason?: string }

// Virtuelle / lokale „Drucker", die keine echten (Netzwerk-)Drucker sind.
const VIRTUAL_NAME = /(microsoft print to pdf|microsoft xps|xps document|onenote|send to onenote|\bfax\b|snagit|pdf-?xchange|cutepdf|custpdf|movicon|phoenix contact|adobe pdf|foxit|primopdf|bullzip|pdfcreator|print to pdf|pdf writer|text only|onedrive|remote desktop|webex|zoom)/i
const VIRTUAL_PORT = /^(portprompt|nul|file:|ts\d|cpwpv|pdf|onenote|xps|microsoft\.office)/i

function isRealPrinter(p: LivePrinter): boolean {
  if (!p.name) return false
  if (VIRTUAL_NAME.test(p.name) || VIRTUAL_NAME.test(p.driver)) return false
  if (VIRTUAL_PORT.test(p.port.toLowerCase())) return false
  return true
}

const cache = new Map<string, { at: number; res: LivePrintersResult }>()
const TTL_MS = 3 * 60 * 1000

export function clearLivePrinterCache(): void { cache.clear() }

export async function queryLivePrinters(hostname: string, opts?: { force?: boolean }): Promise<LivePrintersResult> {
  const h = (hostname || '').trim().replace(/'/g, '')
  if (!h) return { ok: false, printers: [], reason: 'kein Hostname' }
  const key = h.toUpperCase()
  const cached = cache.get(key)
  if (!opts?.force && cached && Date.now() - cached.at < TTL_MS) return cached.res

  let res: LivePrintersResult
  try {
    const up = await ensureWinRM(h)
    if (!up) {
      res = { ok: false, printers: [], reason: 'nicht erreichbar / WinRM nicht aktiv' }
    } else {
      const script = [
        `$ErrorActionPreference='SilentlyContinue'`,
        `try {`,
        `  $o = Invoke-Command -ComputerName '${h}' -ErrorAction Stop -ScriptBlock {`,
        // Standarddrucker ist eine PRO-BENUTZER-Einstellung (HKCU …\Windows Wert 'Device')
        // und über den WinRM-Admin-Kontext von Win32_Printer.Default NICHT sichtbar — daher
        // wie im Verbindungs-Scan das geladene Benutzer-Hive direkt lesen (gestaffelter Fallback).
        `    $def = ''`,
        `    try {`,
        `      $cu = (Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).UserName`,
        `      if ($cu) {`,
        `        $sid = (New-Object System.Security.Principal.NTAccount($cu)).Translate([System.Security.Principal.SecurityIdentifier]).Value`,
        `        $dev = (Get-ItemProperty "registry::HKU\\$sid\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows" -Name Device -ErrorAction Stop).Device`,
        `        if ($dev) { $def = ($dev -split ',')[0] }`,
        `      }`,
        `    } catch {}`,
        `    if (-not $def) {`,
        `      try {`,
        `        $hives = @(Get-ChildItem 'registry::HKEY_USERS' -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -like 'S-1-5-21-*' -and $_.PSChildName -notlike '*_Classes' })`,
        `        foreach ($hv in $hives) {`,
        `          try { $dev = (Get-ItemProperty "registry::HKU\\$($hv.PSChildName)\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows" -Name Device -ErrorAction Stop).Device; if ($dev) { $def = ($dev -split ',')[0]; break } } catch {}`,
        `        }`,
        `      } catch {}`,
        `    }`,
        `    if (-not $def) { $def = (Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Default } | Select-Object -First 1 -ExpandProperty Name) }`,
        `    $p = Get-Printer -ErrorAction SilentlyContinue | Select-Object Name, PortName, DriverName, @{N='Status';E={ "$($_.PrinterStatus)" }}`,
        `    [pscustomobject]@{ def = $def; printers = @($p) }`,
        `  }`,
        `  $o | Select-Object def, printers | ConvertTo-Json -Compress -Depth 5`,
        `} catch { 'ERR:' + $_.Exception.Message }`,
      ].join('\n')
      const r = await api().runPowerShell(script, 45000)
      const txt = (r.stdout ?? '').trim()
      if (!txt || txt.startsWith('ERR:')) {
        res = { ok: false, printers: [], reason: txt.replace(/^ERR:/, '').trim() || 'keine Antwort' }
      } else {
        const parsed = JSON.parse(txt) as { def?: string; printers?: unknown }
        const rawList = Array.isArray(parsed.printers) ? parsed.printers : parsed.printers ? [parsed.printers] : []
        const def = String(parsed.def ?? '').trim()
        // `def` kann eine UNC (\\Server\Freigabe) ODER ein kurzer Queue-Name sein,
        // während Get-Printer.Name meist nur den kurzen Namen liefert → auf die letzte
        // Pfadkomponente (groß) normalisieren und vergleichen.
        const defKey = def ? canonPrinterName(shareOf(def)) : ''
        const all: LivePrinter[] = rawList.map(o => {
          const oo = o as { Name?: unknown; PortName?: unknown; DriverName?: unknown; Status?: unknown }
          const name = String(oo?.Name ?? '').trim()
          const isDefault = !!def && (name === def || (!!defKey && canonPrinterName(shareOf(name)) === defKey))
          return { name, port: String(oo?.PortName ?? '').trim(), driver: String(oo?.DriverName ?? '').trim(), status: String(oo?.Status ?? '').trim(), isDefault }
        })
        res = { ok: true, printers: all.filter(isRealPrinter) }
      }
    }
  } catch (e) {
    res = { ok: false, printers: [], reason: e instanceof Error ? e.message : String(e) }
  }
  cache.set(key, { at: Date.now(), res })
  return res
}
