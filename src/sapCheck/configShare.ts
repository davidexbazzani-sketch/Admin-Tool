// ── SAP-Fehlersuche: zentrale Konfigurationsverteilung (Regeln 16–19) ─────────
// Kombiniert zwei Messquellen, um den Doppelhop (WinRM-Sitzung → SMB-Freigabe)
// zu vermeiden — CredSSP wird NICHT aktiviert:
//   • Die ZENTRALE SAPUILandscape.xml liest der Admin-PC SELBST, lokal, mit dem
//     angemeldeten Admin-Konto (Soll-Liste aller SAP-Systeme; Hash + Includes).
//   • Auf dem CLIENT wird nur gelesen, was lokal liegt (Cache + lokale Kopie,
//     kommt aus dem Konfigurations-Collector) und die Erreichbarkeit der Freigabe
//     (DNS/Ping/TCP 445) gemessen — dafür ist keine zweite Anmeldung nötig.
// Gesunder Referenzwert: ~22 ms zur Azure-NetApp-Freigabe (mehrere Hops, NICHT im
// Hamburger LAN). Alles streng lesend. TODO-VERIFY: exakte HKU-Value-Namen der
// SAP-Logon-Optionen (Cache-Modus/Zwischenspeichern) auf einem echten SAP-PC.

import { api } from '../electronAPI'
import { THRESHOLDS } from './rules'
import type { SapBefund } from './sapCheck.types'

const s = (v: unknown): string => (v === undefined || v === null ? '' : String(v)).trim()
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null }
function bef(b: Omit<SapBefund, 'vergleichbar'> & { vergleichbar?: boolean }): SapBefund {
  return { vergleichbar: false, ...b }
}

/** \\host\share\… → host */
function shareHostOf(p: string): string {
  const m = /^\\\\([^\\]+)\\/.exec(p || '')
  return m ? m[1] : ''
}

/** Client-Wrapper (Invoke-Command + JSON) — identisch zu runScan.buildWrapper. */
function clientWrap(host: string, script: string): string {
  const h = host.replace(/'/g, "''")
  return `try { Invoke-Command -ComputerName '${h}' -ScriptBlock { ${script} } -EA Stop | ConvertTo-Json -Depth 8 -Compress } catch { Write-Output "ERR:$($_.Exception.Message)" }`
}

// Admin-PC-LOKAL: zentrale Datei lesen, hashen, Öffnungszeit messen, Includes auflösen.
function adminCentralScript(serverPath: string): string {
  const p = serverPath.replace(/'/g, "''")
  return [
    `$p='${p}'`,
    `$r=[ordered]@{ exists=$false }`,
    `try{`,
    `  if(Test-Path -LiteralPath $p){`,
    `    $sw=[System.Diagnostics.Stopwatch]::StartNew()`,
    `    $c=Get-Content -LiteralPath $p -Raw -EA Stop`,
    `    $r.openMs=[int]$sw.ElapsedMilliseconds`,
    `    $r.exists=$true`,
    `    $r.sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash`,
    `    $r.groesse=(Get-Item -LiteralPath $p).Length`,
    `    $r.geaendert=(Get-Item -LiteralPath $p).LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')`,
    `    $base=Split-Path -Parent $p`,
    `    $inc=@()`,
    `    try{ [xml]$x=$c; foreach($n in @($x.SelectNodes('//Include'))){ $u=$n.url; if($u){ $path=$u -replace '^(?i)file:/+','' -replace '/','\\'; if($path -notmatch '^\\\\\\\\|^[A-Za-z]:'){ $path=Join-Path $base $path }; $ok=[bool](Test-Path -LiteralPath $path); $h=$null; if($ok){ try{ $h=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }catch{} }; $inc+=[ordered]@{ url=$u; pfad=$path; resolvable=$ok; sha256=$h } } } }catch{}`,
    `    $r.includes=@($inc)`,
    `  } else { $r.fehler='nicht gefunden/erreichbar' }`,
    `}catch{ $r.fehler=$_.Exception.Message }`,
    `$r | ConvertTo-Json -Depth 6 -Compress`,
  ].join('\n')
}

// CLIENT: reine Erreichbarkeit der Freigabe (keine SMB-Anmeldung → kein Doppelhop).
function reachScript(shareHost: string): string {
  const h = shareHost.replace(/'/g, "''")
  return [
    `$hn='${h}'`,
    `$r=[ordered]@{ host=$hn }`,
    `try{ $rd=Resolve-DnsName -Name $hn -Type A -EA SilentlyContinue | Where-Object { $_.IPAddress } | Select-Object -First 1; if($rd){ $r.dnsIp=$rd.IPAddress } }catch{}`,
    `try{ $srv=Get-DnsClientServerAddress -AddressFamily IPv4 -EA SilentlyContinue | Where-Object { $_.ServerAddresses } | Select-Object -First 1 -ExpandProperty ServerAddresses; if($srv){ $r.dnsServer=$srv[0] } }catch{}`,
    `$ping=Test-Connection -ComputerName $hn -Count 4 -EA SilentlyContinue`,
    `if($ping){ $r.avgMs=[math]::Round(($ping | Measure-Object -Property ResponseTime -Average).Average,0); $r.lossPct=[math]::Round(100*(4-$ping.Count)/4,0) } else { $r.lossPct=100 }`,
    `try{ $sw=[System.Diagnostics.Stopwatch]::StartNew(); $tc=Test-NetConnection -ComputerName $hn -Port 445 -WarningAction SilentlyContinue; $r.tcp445=[ordered]@{ open=[bool]$tc.TcpTestSucceeded; ms=[int]$sw.ElapsedMilliseconds } }catch{}`,
    `$r`,
  ].join('\n')
}

// Cache-Modus heuristisch aus den SAP-Logon-Optionen ableiten (TODO-VERIFY Namen).
function detectCacheMode(options: Record<string, unknown>): 'everyStart' | 'interval' | 'unbekannt' {
  const entries = Object.entries(options || {}).map(([k, v]) => [k.toLowerCase(), s(v)] as [string, string])
  const interval = entries.find(([k]) => /interval|refreshrate|refreshmin|refreshevery/.test(k))
  if (interval) { const n = parseInt(interval[1], 10); if (Number.isFinite(n) && n > 0) return 'interval' }
  const startup = entries.find(([k]) => /startup|onstart|everystart|atstart|eachstart/.test(k))
  if (startup && /^(1|true|yes|ja)$/i.test(startup[1])) return 'everyStart'
  const cacheEnabled = entries.find(([k]) => /(cache.*enabl|enabl.*cache|allowcach|remotecach|cacheremote)/.test(k))
  if (cacheEnabled && /^(1|true|yes|ja)$/i.test(cacheEnabled[1])) return 'everyStart'
  return 'unbekannt'
}

function ageInDays(ts: string): number | null {
  const t = Date.parse(s(ts).replace(' ', 'T'))
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000)
}

/**
 * Analysiert die zentrale SAP-Konfigurationsverteilung (Kategorie B/D, Regeln 16–19).
 * `konfig` = geparstes JSON des Konfigurations-Collectors (serverPath/localFile/cacheHash/…).
 * Liefert zusätzliche Befunde; jede Messung ist abgesichert (Scan läuft immer weiter).
 */
export async function analyzeConfigShare(host: string, konfig: Record<string, unknown> | null): Promise<SapBefund[]> {
  const out: SapBefund[] = []
  if (!konfig) return out

  const serverPath = s(konfig.serverPath)
  const localFile = konfig.localFile as Record<string, unknown> | undefined
  const localHash = s(localFile?.sha256)
  const cacheHash = s(konfig.cacheHash)
  const cacheNewest = s(konfig.cacheNewest)
  const options = (konfig.options && typeof konfig.options === 'object') ? konfig.options as Record<string, unknown> : {}

  if (!serverPath) {
    out.push(bef({ id: 'config.central', kategorie: 'Konfiguration', titel: 'Zentrale Konfigurationsverteilung', quelle: 'SAP-Logon-Optionen',
      wert: 'kein Server-XML-Pfad', erwartung: 'zentrale SAPUILandscape.xml auf Freigabe', bewertung: 'unbekannt',
      begruendung: 'Ohne Server-XML-Pfad in den SAP-Logon-Optionen können zentrale Datei/Freigabe nicht geprüft werden.' }))
    return out
  }

  const shareHost = shareHostOf(serverPath)

  // (1) Admin-PC LOKAL: zentrale Datei lesen (Doppelhop vermieden).
  let central: Record<string, unknown> | null = null
  try {
    const res = await api().runPowerShell(adminCentralScript(serverPath), 30000)
    const t = (res.stdout ?? '').trim()
    if (t && !t.startsWith('ERR:')) central = JSON.parse(t)
  } catch { /* central bleibt null */ }

  // (2) CLIENT: Erreichbarkeit der Freigabe (DNS/Ping/TCP 445).
  let reach: Record<string, unknown> | null = null
  if (shareHost) {
    try {
      const res = await api().runPowerShell(clientWrap(host, reachScript(shareHost)), 30000)
      const t = (res.stdout ?? '').trim()
      if (t && !t.startsWith('ERR:')) reach = JSON.parse(t)
    } catch { /* reach bleibt null */ }
  }

  const centralHash = s(central?.sha256)
  const centralOk = central?.exists === true
  const avg = num(reach?.avgMs)
  const loss = num(reach?.lossPct)
  const tcp = reach?.tcp445 as Record<string, unknown> | undefined
  const tcpOpen = tcp?.open === true
  const dnsIp = s(reach?.dnsIp)
  const dnsServer = s(reach?.dnsServer)
  const cacheEmpty = !cacheHash

  // Anzeige: zentrale Datei + Öffnungszeit (Admin-PC-lokal).
  if (centralOk) {
    out.push(bef({ id: 'config.central', kategorie: 'Konfiguration', titel: 'Zentrale Systemliste (vom Admin-PC gelesen)', quelle: serverPath,
      wert: `SHA256 ${centralHash.slice(0, 12)}…, geöffnet in ${s(central?.openMs) || '?'} ms`,
      erwartung: 'lesbar; Soll-Liste aller SAP-Systeme', bewertung: 'ok',
      begruendung: `geändert ${s(central?.geaendert)}, ${s(central?.groesse)} Bytes. Gelesen mit dem angemeldeten Admin-Konto (kein Client-Doppelhop).`,
      rawData: JSON.stringify(central, null, 2) }))
  } else {
    out.push(bef({ id: 'config.central', kategorie: 'Konfiguration', titel: 'Zentrale Systemliste (vom Admin-PC gelesen)', quelle: serverPath,
      wert: 'nicht lesbar', erwartung: 'lesbar', bewertung: 'warnung',
      begruendung: `Der Admin-PC kann die zentrale SAPUILandscape.xml nicht lesen (${s(central?.fehler) || 'keine Antwort'}) — Soll-Vergleich nicht möglich.` }))
  }

  // Regel 16: Erreichbarkeit der Freigabe vom Client aus.
  const reachable = (loss !== null && loss < 100) || tcpOpen
  if (!reachable) {
    out.push(bef({ id: 'config.share.reach', kategorie: 'Netzwerk', titel: `Config-Freigabe ${shareHost || '(unbekannt)'}`, quelle: 'DNS/Ping/TCP445 (Client)',
      wert: 'nicht erreichbar', erwartung: `erreichbar, ≤ ${THRESHOLDS.configShareLatWarnMs} ms`, bewertung: cacheEmpty ? 'fehler' : 'warnung',
      begruendung: cacheEmpty
        ? 'Zentrale SAP-Config-Freigabe nicht erreichbar UND kein lokaler Cache — SAP Logon startet mit fehlender/leerer Systemliste.'
        : 'Zentrale SAP-Config-Freigabe nicht erreichbar — SAP Logon startet verzögert bzw. arbeitet mit der (veralteten) Cache-Systemliste.',
      empfehlung: 'Weil der Cache bei jedem Start aktualisiert wird, macht jeder SAP-Logon-Start einen SMB-Zugriff über diese Strecke. Ist die Freigabe langsam/weg, fühlt sich SAP langsam an, obwohl das SAP-System selbst läuft.' }))
  } else {
    const bewR = avg !== null && avg > THRESHOLDS.configShareLatWarnMs ? 'warnung' : 'ok'
    const teile = [
      avg !== null ? `${avg} ms` : null,
      loss !== null ? `${loss}% Verlust` : null,
      tcp ? `TCP445 ${tcpOpen ? 'offen' : 'zu'}${num(tcp.ms) !== null ? ` (${s(tcp.ms)} ms)` : ''}` : null,
      dnsIp ? dnsIp : null,
      dnsServer ? `DNS ${dnsServer}` : null,
    ].filter(Boolean)
    out.push(bef({ id: 'config.share.reach', kategorie: 'Netzwerk', titel: `Config-Freigabe ${shareHost}`, quelle: 'DNS/Ping/TCP445 (Client)',
      wert: teile.join(', ') || 'erreichbar', erwartung: `erreichbar, ≤ ${THRESHOLDS.configShareLatWarnMs} ms (gesund ~22 ms)`, bewertung: bewR,
      begruendung: bewR === 'warnung'
        ? 'Höhere Latenz zur zentralen Config-Freigabe als üblich — SAP-Logon-Start fühlt sich langsam an (SMB-Zugriff bei jedem Start).'
        : 'Config-Freigabe erreichbar, Latenz im Normalbereich (mehrere Hops, Azure-NetApp — bewusst nicht im Hamburger LAN).' }))
  }

  // Regel 17: Dreifachvergleich zentral ↔ Cache ↔ lokal.
  if (centralHash && (cacheHash || localHash)) {
    const up = (x: string) => x.toUpperCase()
    const cacheMatch = cacheHash ? up(centralHash) === up(cacheHash) : null
    const localMatch = localHash ? up(centralHash) === up(localHash) : null
    const abweichung = cacheMatch === false || localMatch === false
    const alter = ageInDays(cacheNewest)
    const alt = alter !== null && alter > THRESHOLDS.configCacheAgeWarnTage
    const bewC = abweichung ? (alt ? 'warnung' : 'hinweis') : 'ok'
    const mark = (m: boolean | null) => m === null ? '' : m ? ' ✓' : ' ✗'
    out.push(bef({ id: 'config.compare', kategorie: 'Konfiguration', titel: 'Systemliste zentral ↔ Cache ↔ lokal', quelle: 'SHA-256-Vergleich',
      wert: `zentral ${centralHash.slice(0, 12)}… | Cache ${cacheHash ? cacheHash.slice(0, 12) + '…' + mark(cacheMatch) : '—'} | lokal ${localHash ? localHash.slice(0, 12) + '…' + mark(localMatch) : '—'}`,
      erwartung: 'alle drei identisch', bewertung: bewC,
      begruendung: abweichung
        ? `Lokale Systemliste weicht von der zentralen ab${alter !== null ? ` (Cache ${alter} Tage alt)` : ''} — erklärt „ich finde das System nicht" und „ich lande auf dem falschen Applikationsserver".`
        : 'Zentrale, Cache- und lokale Systemliste sind identisch.',
      empfehlung: abweichung ? 'SAP Logon neu starten (aktualisiert den Cache); bleibt die Abweichung, Cache-Datei erneuern lassen.' : undefined,
      rawData: JSON.stringify({ centralHash, cacheHash, localHash, cacheNewest, cacheAlterTage: alter }, null, 2) }))
  } else if (centralHash) {
    out.push(bef({ id: 'config.compare', kategorie: 'Konfiguration', titel: 'Systemliste zentral ↔ Cache ↔ lokal', quelle: 'SHA-256-Vergleich',
      wert: 'kein lokaler Cache/keine lokale Datei zum Vergleich', erwartung: 'lokale Kopie vorhanden', bewertung: 'hinweis',
      begruendung: 'Es gibt keine lokale Kopie/keinen Cache — SAP Logon lädt die Systemliste bei jedem Start neu über die Freigabe.' }))
  }

  // Regel 18: Cache-Modus „bei jedem Start" + Latenz über Schwellwert.
  const cacheMode = detectCacheMode(options)
  if (cacheMode === 'everyStart' && avg !== null && avg > THRESHOLDS.configShareLatWarnMs) {
    out.push(bef({ id: 'config.share.latmode', kategorie: 'Konfiguration', titel: 'Cache-Modus vs. Latenz', quelle: 'SAP-Logon-Optionen + Ping',
      wert: `„bei jedem Start aktualisieren" + ${avg} ms`, erwartung: `≤ ${THRESHOLDS.configShareLatWarnMs} ms bei jedem Start`, bewertung: 'warnung',
      begruendung: 'Der Cache wird bei jedem SAP-Logon-Start über eine langsame Strecke aktualisiert — das verzögert jeden Start spürbar.',
      empfehlung: 'Vorschlag (Entscheidung liegt bei SAP Basis): statt „bei jedem Start aktualisieren" ein Update-Intervall einstellen.' }))
  }

  // Regel 19: eingebundene Landschaftsdateien fehlen/nicht auflösbar (zentrale Auflösung).
  const centralIncludes = Array.isArray(central?.includes) ? central!.includes as Record<string, unknown>[] : []
  let idx = 0
  for (const ic of centralIncludes) {
    idx++
    if (ic && ic.resolvable === false) {
      out.push(bef({ id: `config.include.${idx}`, kategorie: 'Konfiguration', titel: 'Eingebundene Landschaftsdatei fehlt', quelle: 'Include-Auflösung (Admin-PC)',
        wert: s(ic.url) || `Include ${idx}`, erwartung: 'auflösbar', bewertung: 'warnung',
        begruendung: 'Eine in der zentralen SAPUILandscape.xml eingebundene Datei ist nicht auflösbar — Systeme aus dieser Datei fehlen in der Auswahl.' }))
    }
  }
  const geprueft = centralIncludes.length
  if (geprueft > 0) {
    const fehlend = centralIncludes.filter(i => i.resolvable === false).length
    out.push(bef({ id: 'config.include.summary', kategorie: 'Konfiguration', titel: 'Eingebundene Landschaftsdateien (zentral)', quelle: 'Include-Auflösung (Admin-PC)',
      wert: `${geprueft} geprüft, ${fehlend} fehlend`, erwartung: 'alle auflösbar', bewertung: fehlend ? 'warnung' : 'ok',
      begruendung: fehlend ? 'Mindestens eine eingebundene Datei fehlt (siehe Einzelbefunde).' : 'Alle eingebundenen Landschaftsdateien sind auflösbar.',
      rawData: JSON.stringify(centralIncludes, null, 2) }))
  }

  return out
}
