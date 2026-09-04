// ── SolidWorks-Diagnose: Scan-Orchestrierung ─────────────────────────────────
// Vorprüfung (WinRM) → gewählte Skripte per Invoke-Command auf dem Ziel ausführen
// (Skripttext lokal einlesen, als ScriptBlock übergeben — nichts auf den Ziel-PC
// kopieren) → TextBericht + Daten zurück. Streng lesend. Kein Skript darf den Lauf
// abbrechen; Fehler landen im jeweiligen Skript-Ergebnis.

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import { SW_SKRIPTE, loadSkriptText } from './scripts'
import type { SwLauf, SwSkriptResult, SwFortschritt, SwSkript, SwDaten, SwKennwerte } from './swCheck.types'

const TOOL_VERSION = '1.0'
const SKRIPT_TIMEOUT_MS = 180000

export interface RunSwOptions {
  skripte: string[]                       // gewählte Skript-IDs
  server: string                          // Zielserver für Server-Skripte (z. B. w3143)
  onProgress?: (p: SwFortschritt) => void
  isAborted?: () => boolean
  // Vorab EINMAL berechnete Server-Skript-Ergebnisse (je Skript-id). Bei einem
  // Sammellauf läuft das Server-Skript sonst gegen denselben Server einmal PRO PC
  // (10 PCs = 10 identische Serverberichte). Der Aufrufer führt es einmal aus
  // (runServerSkripte) und übergibt es hier; runSwScan ordnet es nur noch zu.
  vorabServer?: Map<string, SwSkriptResult>
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

// Temp-Verzeichnis des Admin-PCs (einmal ermittelt) — dort legen wir die .ps1 ab.
let cachedTempDir = ''
async function adminTempDir(): Promise<string> {
  if (cachedTempDir) return cachedTempDir
  try { const r = await api().runPowerShell('$env:TEMP', 10000); cachedTempDir = (r.stdout ?? '').trim().split(/\r?\n/).filter(Boolean).pop() || '' } catch { /* leer */ }
  return cachedTempDir
}

// Remote-ScriptBlock-Rumpf, Variante A (in der WinRM-Shell): führt das Skript direkt
// aus und gibt sein Objekt gzip-komprimiert zurück. Gut für die leichten Skripte.
function innerInShell(extra: string): string {
  return [
    `    param($txt,$srv)`,
    `    $ProgressPreference='SilentlyContinue'`,
    `    $ErrorActionPreference='SilentlyContinue'`,
    `    try {`,
    `      $sb=[ScriptBlock]::Create($txt)`,
    // Alle Nebenströme (Fehler/Warnung/Verbose/Debug/Information) im Ziel unterdrücken,
    // sonst fluten die vielen nicht-terminierenden Fehler den WinRM-Receive-Kanal
    // ("WSManPluginReceiveResult Fehlercode 14"). Verwertbares steht in $R.Hinweise.
    `      $res=@(& $sb -AlsObjekt -Server $srv ${extra} 2>$null 3>$null 4>$null 5>$null 6>$null)`,
    `      $obj=$res[-1]`,
    `      $json=($obj | ConvertTo-Json -Depth 16 -Compress)`,
    `      if (-not $json) { $json='{}' }`,
    `      $by=[System.Text.Encoding]::UTF8.GetBytes($json)`,
    `      $ms=New-Object System.IO.MemoryStream`,
    `      $gz=New-Object System.IO.Compression.GZipStream($ms,[System.IO.Compression.CompressionMode]::Compress)`,
    `      $gz.Write($by,0,$by.Length); $gz.Dispose()`,
    `      'GZ:'+[Convert]::ToBase64String($ms.ToArray())`,
    `    } catch { 'REMOTEERR:' + $_.Exception.Message }`,
  ].join('\n')
}

// Variante B (dateibasiert, IN der WinRM-Shell — KEIN Start-Process, sonst AV/ASR-Trip
// „PowerShell startet PowerShell" → spawn EPERM). Das Skript läuft in-shell mit
// -Ausgabeordner und serialisiert seinen Bericht SELBST (ConvertTo-Json -Depth 8, schnell)
// in eine Temp-Datei; der Wrapper liest nur .txt/.json und baut {"TextBericht":…,"Daten":…}.
// Vermeidet die langsame Wrapper-Serialisierung (-Depth 16) → kein Timeout bei großen Profilen.
function innerFileBased(extra: string): string {
  return [
    `    param($txt,$srv)`,
    `    $ProgressPreference='SilentlyContinue'`,
    `    try {`,
    `      $sb=[ScriptBlock]::Create($txt)`,
    `      $dir=Join-Path $env:TEMP ('swtiefe_'+[guid]::NewGuid().ToString('N'))`,
    `      New-Item -ItemType Directory -Path $dir -Force | Out-Null`,
    `      & $sb -Ausgabeordner $dir -Server $srv ${extra} 2>$null 3>$null 4>$null 5>$null 6>$null | Out-Null`,
    `      $jf=Get-ChildItem $dir -Filter '*.json' -File -EA SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1`,
    `      $tf=Get-ChildItem $dir -Filter '*.txt' -File -EA SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1`,
    `      $jc= if($jf){[System.IO.File]::ReadAllText($jf.FullName,[System.Text.Encoding]::UTF8)}else{'{}'}`,
    `      $tc= if($tf){[System.IO.File]::ReadAllText($tf.FullName,[System.Text.Encoding]::UTF8)}else{''}`,
    `      $combined='{"TextBericht":'+($tc | ConvertTo-Json)+',"Daten":'+$jc+'}'`,
    `      $by=[System.Text.Encoding]::UTF8.GetBytes($combined)`,
    `      $ms=New-Object System.IO.MemoryStream`,
    `      $gz=New-Object System.IO.Compression.GZipStream($ms,[System.IO.Compression.CompressionMode]::Compress)`,
    `      $gz.Write($by,0,$by.Length); $gz.Dispose()`,
    `      $res='GZ:'+[Convert]::ToBase64String($ms.ToArray())`,
    `      Remove-Item $dir -Recurse -Force -EA SilentlyContinue`,
    `      $res`,
    `    } catch { 'REMOTEERR:' + $_.Exception.Message }`,
  ].join('\n')
}

// Lokaler PS-Befehl (Admin-PC): liest die Skript-.ps1 (kurzer Befehl → kein ENAMETOOLONG),
// führt sie per WinRM AUF DEM ZIEL aus (in-shell oder als Kindprozess) und entpackt das
// gzip-Ergebnis. Aufruf mit benannten Parametern; lokale Temp-.ps1 wird gelöscht.
function buildWrapper(invokeHost: string, tmpPath: string, serverArg: string, remoteArgs: string, fileBased: boolean): string {
  const h = invokeHost.replace(/'/g, "''")
  const srv = serverArg.replace(/'/g, "''")
  const p = tmpPath.replace(/'/g, "''")
  const extra = (remoteArgs || '').trim()   // literale Schalter, keine Nutzereingabe
  const inner = fileBased ? innerFileBased(extra) : innerInShell(extra)
  return [
    `$ErrorActionPreference='Stop'`,
    `try {`,
    `  $t = Get-Content -LiteralPath '${p}' -Raw -Encoding UTF8`,
    `  $out = Invoke-Command -ComputerName '${h}' -ArgumentList $t,'${srv}' -ScriptBlock {`,
    inner,
    `  }`,
    `  if ($out -is [array]) { $out = ($out -join '') }`,
    `  if ($out -and $out.StartsWith('GZ:')) {`,
    `    $b=[Convert]::FromBase64String($out.Substring(3))`,
    `    $mi=New-Object System.IO.MemoryStream(,$b)`,
    `    $gu=New-Object System.IO.Compression.GZipStream($mi,[System.IO.Compression.CompressionMode]::Decompress)`,
    `    $sr=New-Object System.IO.StreamReader($gu,[System.Text.Encoding]::UTF8)`,
    `    $out=$sr.ReadToEnd(); $sr.Dispose()`,
    `  }`,
    `  Write-Output $out`,
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
    `finally { Remove-Item -LiteralPath '${p}' -Force -ErrorAction SilentlyContinue }`,
  ].join('\n')
}

// JSON aus evtl. verrauschtem stdout robust herausschneiden (erstes { … letztes }).
function extractJson(out: string): string {
  const first = out.indexOf('{')
  const last = out.lastIndexOf('}')
  if (first === -1 || last === -1 || last < first) throw new Error('Antwort nicht lesbar (kein JSON)')
  return out.slice(first, last + 1)
}

async function runSkript(sk: SwSkript, invokeHost: string, serverArg: string): Promise<SwSkriptResult> {
  const started = Date.now()
  const base: SwSkriptResult = { id: sk.id, titel: sk.titel, ziel: sk.ziel, ok: false, textBericht: '', dauerMs: 0 }
  try {
    const text = await loadSkriptText(sk.datei)
    // Skript als temporäre .ps1 auf dem Admin-PC ablegen (vermeidet ENAMETOOLONG).
    const dir = await adminTempDir()
    if (!dir) throw new Error('Temp-Verzeichnis des Admin-PCs nicht ermittelbar')
    const tmpPath = `${dir}\\swdiag_${sk.id}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.ps1`
    const w = await api().writeFile(tmpPath, utf8ToBase64(text))
    if (!w.success) throw new Error('Skript konnte nicht temporär gespeichert werden')
    const res = await api().runPowerShell(buildWrapper(invokeHost, tmpPath, serverArg, sk.remoteArgs ?? '', !!sk.fileBased), sk.timeoutMs ?? SKRIPT_TIMEOUT_MS)
    const out = (res.stdout ?? '').trim()
    if (res.timedOut) throw new Error('Zeitüberschreitung')
    if (!out) throw new Error('keine Ausgabe')
    if (out.startsWith('ERR:')) throw new Error(out.replace(/^ERR:/, '') || 'Remote-Fehler')
    if (out.startsWith('REMOTEERR:')) throw new Error(out.replace(/^REMOTEERR:/, '') || 'Fehler im Skript')
    let parsed: { TextBericht?: string; Daten?: SwDaten } | null = null
    try { parsed = JSON.parse(extractJson(out)) } catch { throw new Error('Antwort nicht lesbar (kein JSON)') }
    return {
      ...base, ok: true,
      textBericht: String(parsed?.TextBericht ?? ''),
      daten: (parsed?.Daten ?? undefined) as SwDaten | undefined,
      dauerMs: Date.now() - started,
    }
  } catch (e) {
    return { ...base, ok: false, fehler: e instanceof Error ? e.message : String(e), dauerMs: Date.now() - started }
  }
}

/**
 * Server-Skripte EINMAL ausführen (für Sammelläufe). Läuft gegen genau einen
 * Zielserver und liefert die Ergebnisse je Skript-id zurück. Der Aufrufer reicht
 * die Map über RunSwOptions.vorabServer in jeden PC-Lauf weiter, sodass das
 * Server-Skript nicht je PC wiederholt wird (war vorher 10× identisch).
 */
export async function runServerSkripte(
  serverHost: string,
  skriptIds: string[],
  cb?: { onProgress?: (p: SwFortschritt) => void; isAborted?: () => boolean },
): Promise<Map<string, SwSkriptResult>> {
  const out = new Map<string, SwSkriptResult>()
  const host = (serverHost || '').trim() || 'w3143'
  const serverSkripte = SW_SKRIPTE.filter(s => s.ziel === 'server' && skriptIds.includes(s.id))
  let winrmOk: boolean | null = null
  for (const sk of serverSkripte) {
    if (cb?.isAborted?.()) break
    cb?.onProgress?.({ id: sk.id, titel: sk.titel, status: 'läuft' })
    if (winrmOk === null) { try { winrmOk = await ensureWinRM(host) } catch { winrmOk = false } }
    let result: SwSkriptResult
    if (!winrmOk) {
      result = { id: sk.id, titel: sk.titel, ziel: 'server', ok: false, textBericht: '', dauerMs: 0, fehler: `„${host}" nicht per WinRM erreichbar.` }
    } else {
      result = await runSkript(sk, host, host)
    }
    out.set(sk.id, result)
    cb?.onProgress?.({ id: sk.id, titel: sk.titel, status: result.ok ? 'fertig' : 'fehler' })
  }
  return out
}

/** Vorprüfung: WinRM erreichbar/aktivierbar? Deutscher Klartext bei Fehler. */
export async function precheckSw(host: string): Promise<{ ok: boolean; message?: string }> {
  const h = host.trim()
  if (!h) return { ok: false, message: 'Kein PC-Name angegeben.' }
  let ok = false
  try { ok = await ensureWinRM(h) } catch { ok = false }
  if (!ok) return { ok: false, message: `„${h}" nicht per WinRM erreichbar. Bitte prüfen: PC eingeschaltet & im Netz? WinRM aktiv? Firewall? Name korrekt?` }
  return { ok: true }
}

function scanId(pc: string, iso: string): string {
  const ts = iso.replace(/[:T]/g, '-').slice(0, 16).replace(/-(\d\d)-(\d\d)$/, '_$1$2')
  return `${pc.replace(/[^A-Za-z0-9]/g, '_')}_${ts}`
}

/** Einen PC scannen (gewählte Skripte). Speichern übernimmt der Aufrufer. */
export async function runSwScan(pc: string, by: string, opts: RunSwOptions): Promise<{ ok: boolean; lauf?: SwLauf; error?: string }> {
  const started = Date.now()
  const h = pc.trim()
  const chosen = SW_SKRIPTE.filter(s => opts.skripte.includes(s.id))
  if (chosen.length === 0) return { ok: false, error: 'Keine Skripte gewählt.' }

  for (const s of chosen) opts.onProgress?.({ id: s.id, titel: s.titel, status: 'wartet' })

  // Vorprüfung je benötigtem Host (Client = PC, Server = Zielserver) — einmal pro Host.
  const winrmCache = new Map<string, boolean>()
  const ensure = async (host: string): Promise<boolean> => {
    const key = host.trim().toLowerCase()
    if (winrmCache.has(key)) return winrmCache.get(key)!
    const pre = await precheckSw(host)
    winrmCache.set(key, pre.ok)
    return pre.ok
  }

  // Wenn der PC selbst (für Client-Skripte) nicht erreichbar ist → Gesamtfehler.
  const needsClient = chosen.some(s => s.ziel === 'client')
  if (needsClient) {
    const pcOk = await ensure(h)
    if (!pcOk) return { ok: false, error: `„${h}" nicht per WinRM erreichbar.` }
  }

  const skripte: SwSkriptResult[] = []
  for (const sk of chosen) {
    if (opts.isAborted?.()) return { ok: false, error: 'Abgebrochen.' }
    opts.onProgress?.({ id: sk.id, titel: sk.titel, status: 'läuft' })
    const serverArg = (sk.parameter?.Server ? opts.server : opts.server) || sk.parameter?.Server || h
    const invokeHost = sk.ziel === 'server' ? (opts.server || sk.parameter?.Server || h) : h
    let result: SwSkriptResult
    const vorab = sk.ziel === 'server' ? opts.vorabServer?.get(sk.id) : undefined
    if (vorab) {
      // Server-Skript wurde für den ganzen Sammellauf EINMAL ausgeführt → nur zuordnen.
      result = vorab
    } else if (!(await ensure(invokeHost))) {
      result = { id: sk.id, titel: sk.titel, ziel: sk.ziel, ok: false, textBericht: '', dauerMs: 0, fehler: `„${invokeHost}" nicht per WinRM erreichbar.` }
    } else {
      result = await runSkript(sk, invokeHost, serverArg)
    }
    skripte.push(result)
    opts.onProgress?.({ id: sk.id, titel: sk.titel, status: result.ok ? 'fertig' : 'fehler' })
  }

  // Auffälligkeiten + Kennwerte aggregieren.
  const auff: string[] = []
  let kennwerte: SwKennwerte | undefined
  for (const r of skripte) {
    const a = r.daten?.Auffaelligkeiten
    if (Array.isArray(a)) for (const x of a) { const s = String(x).trim(); if (s && !auff.includes(s)) auff.push(s) }
    if (r.ziel === 'client' && r.daten?.Kennwerte && !kennwerte) kennwerte = r.daten.Kennwerte
  }

  const ranAt = new Date().toISOString()
  const lauf: SwLauf = {
    id: scanId(h, ranAt), pc: h, ranAt, ranBy: by,
    dauerMs: Date.now() - started, toolVersion: TOOL_VERSION,
    winrm: skripte.some(s => s.ok) ? 'ok' : 'fehler',
    skripte, auffaelligkeiten: auff, kennwerte,
  }
  return { ok: true, lauf }
}
