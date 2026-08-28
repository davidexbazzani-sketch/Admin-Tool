// ── SAP-Fehlersuche: Scan-Orchestrierung ─────────────────────────────────────
// WinRM-Vorprüfung → Kategorien (jede einzeln abgesichert) → Regeln → SapScan.
// Streng lesend. Kein Test darf den Scan abbrechen (jede Kategorie → 'unbekannt').

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import { SAP_COLLECTORS, type SapCollector } from './collectors'
import { analyzeConfigShare } from './configShare'
import { applyKnownCases } from './rules'
import type { SapBefund, SapScan } from './sapCheck.types'

const TOOL_VERSION = '1.0'
const TIMEOUTS: Record<string, number> = { netzwerk: 60000, ereignisse: 45000, konfiguration: 40000, anmeldung: 40000, browser: 45000, ressourcen: 40000, drucken: 30000 }

export interface SapScanProgress { id: string; label: string; status: 'wartet' | 'läuft' | 'fertig' | 'fehler' }
export interface RunSapOptions {
  days: number
  onProgress?: (p: SapScanProgress) => void
  isAborted?: () => boolean
}

function buildWrapper(host: string, script: string): string {
  const h = host.replace(/'/g, "''")
  return `try { Invoke-Command -ComputerName '${h}' -ScriptBlock { ${script} } -EA Stop | ConvertTo-Json -Depth 8 -Compress } catch { Write-Output "ERR:$($_.Exception.Message)" }`
}

async function runCollector(host: string, c: SapCollector, days: number): Promise<{ befunde: SapBefund[]; parsed: Record<string, unknown> | null }> {
  const ctx = { host, days }
  try {
    const res = await api().runPowerShell(buildWrapper(host, c.script(ctx)), TIMEOUTS[c.id] ?? 30000)
    const out = (res.stdout ?? '').trim()
    if (res.timedOut) throw new Error('Zeitüberschreitung')
    if (!out || out.startsWith('ERR:')) throw new Error(out.replace(/^ERR:/, '') || 'keine Ausgabe')
    let parsed: Record<string, unknown> | null = null
    try { parsed = JSON.parse(out) } catch { throw new Error('Antwort nicht lesbar (kein JSON)') }
    return { befunde: c.build(parsed, out, ctx), parsed }
  } catch (e) {
    // Kategorie abgesichert → EIN 'unbekannt'-Befund mit Grund, kein Scan-Abbruch.
    return {
      parsed: null,
      befunde: [{
        id: `${c.id}.unbekannt`, kategorie: c.kategorie, titel: c.label, quelle: 'Scan',
        wert: 'unbekannt', erwartung: '—', bewertung: 'unbekannt', vergleichbar: false,
        begruendung: `Kategorie nicht auslesbar: ${e instanceof Error ? e.message : String(e)}`,
      }],
    }
  }
}

/** Vorprüfung: WinRM erreichbar/aktivierbar? Liefert deutschen Klartext bei Fehler. */
export async function precheckSap(host: string): Promise<{ ok: boolean; winrm: 'ok' | 'aktiviert' | 'fehler'; message?: string }> {
  const h = host.trim()
  if (!h) return { ok: false, winrm: 'fehler', message: 'Kein PC-Name angegeben.' }
  let winrmOk = false
  try { winrmOk = await ensureWinRM(h) } catch { winrmOk = false }
  if (!winrmOk) {
    return { ok: false, winrm: 'fehler', message: `„${h}" nicht per WinRM erreichbar. Bitte prüfen: PC eingeschaltet & im Netz? WinRM aktiv (winrm quickconfig)? Firewall? Name korrekt?` }
  }
  return { ok: true, winrm: 'ok' }
}

export async function runSapScan(host: string, by: string, opts: RunSapOptions): Promise<{ ok: boolean; scan?: SapScan; error?: string }> {
  const started = Date.now()
  const h = host.trim()
  const pre = await precheckSap(h)
  if (!pre.ok) return { ok: false, error: pre.message }

  for (const c of SAP_COLLECTORS) opts.onProgress?.({ id: c.id, label: c.label, status: 'wartet' })
  opts.onProgress?.({ id: 'configshare', label: 'Zentrale SAP-Konfigurationsverteilung', status: 'wartet' })

  const befunde: SapBefund[] = []
  let konfigParsed: Record<string, unknown> | null = null
  // Kategorien parallel, aber Fortschritt je Kategorie melden.
  await Promise.all(SAP_COLLECTORS.map(async c => {
    if (opts.isAborted?.()) return
    opts.onProgress?.({ id: c.id, label: c.label, status: 'läuft' })
    const { befunde: found, parsed } = await runCollector(h, c, opts.days)
    if (c.id === 'konfiguration') konfigParsed = parsed
    befunde.push(...found)
    opts.onProgress?.({ id: c.id, label: c.label, status: found.some(b => b.bewertung === 'unbekannt') ? 'fehler' : 'fertig' })
  }))

  if (opts.isAborted?.()) return { ok: false, error: 'Abgebrochen.' }

  // Zentrale SAP-Konfigurationsverteilung (Regeln 16–19): kombiniert Admin-lokal
  // (zentrale Datei, kein Doppelhop) + Client-Erreichbarkeit. Immer abgesichert.
  const CONFIGSHARE_ID = 'configshare'
  const CONFIGSHARE_LABEL = 'Zentrale SAP-Konfigurationsverteilung'
  if (!opts.isAborted?.()) {
    opts.onProgress?.({ id: CONFIGSHARE_ID, label: CONFIGSHARE_LABEL, status: 'läuft' })
    try {
      const extra = await analyzeConfigShare(h, konfigParsed)
      befunde.push(...extra)
      opts.onProgress?.({ id: CONFIGSHARE_ID, label: CONFIGSHARE_LABEL, status: extra.some(b => b.bewertung === 'unbekannt') ? 'fehler' : 'fertig' })
    } catch (e) {
      befunde.push({ id: 'configshare.unbekannt', kategorie: 'Konfiguration', titel: CONFIGSHARE_LABEL, quelle: 'Scan',
        wert: 'unbekannt', erwartung: '—', bewertung: 'unbekannt', vergleichbar: false,
        begruendung: `Konfigurationsverteilung nicht prüfbar: ${e instanceof Error ? e.message : String(e)}` })
      opts.onProgress?.({ id: CONFIGSHARE_ID, label: CONFIGSHARE_LABEL, status: 'fehler' })
    }
  }

  const final = applyKnownCases(befunde)
  const scan: SapScan = {
    pc: h, ranAt: new Date().toISOString(), ranBy: by, befunde: final,
    meta: { toolVersion: TOOL_VERSION, dauerMs: Date.now() - started, winrm: pre.winrm },
  }
  return { ok: true, scan }
}
