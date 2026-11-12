// ── PC-Fehler: Beheben — ohne dass der Benutzer etwas davon merkt ────────────
// Aus dem Proaktiven Radar heraus wird nur ausgeführt, was am PC UNSICHTBAR bleibt:
//   • Schritte aus dem Problem-Katalog, die als Admin in der Systemsitzung laufen
//     (kein Fenster beim Benutzer), nicht „kritisch" sind, keine Programme schließen,
//     nichts neu starten, keine Nachricht anzeigen — und im Befehls-Test bestanden sind,
//   • „Laufwerk I: verbinden": trägt die dauerhafte Verbindung in die Registry des
//     Benutzers ein (wie „net use /persistent:yes"), wirksam ab seiner nächsten Anmeldung.
// Alles andere bleibt Einzelfall: „Lösung öffnen" → „Gib dein Problem ein".
// Ist der PC nicht erreichbar, kommt die Behebung auf die Warteliste (warteliste.ts).
// Nie auf Servern — die Liste enthält nur Client-PCs aus der Endgeräte-Übersicht.

import { api } from '../electronAPI'
import { aktion } from '../problemAssistent/aktionen'
import { fuehreAus, type PaAktion } from '../problemAssistent/motor'
import type { PaProblem, PaSchritt } from '../problemAssistent/types'
import type { BtStand } from '../befehlsTest/types'
import { b64, fernBefehl, getagged, verbinde } from '../services/enaioInstall'
import { buildParallelOnlineCheck, parseOnlineCheckLine } from '../utils/connectivityCheck'
import { logDeviceAction } from '../services/deviceDossier'
import { pathService } from '../services/pathService'
import type { Befund } from './auswertung'

export interface FixSchritt {
  art: 'aktion' | 'laufwerk-i'
  titel: string
  aktionId?: string
  param?: string
  /** Nur lesend (liefert Hinweise, ändert nichts). */
  liest?: boolean
}
export interface FixPlan {
  host: string
  serial?: string
  befundKey: string
  befundTitel: string
  problemTitel?: string
  schritte: FixSchritt[]
  /** Warum nichts automatisch geht (dann nur „Lösung öffnen"). */
  grund?: string
}

/** Befehle, die der Benutzer bemerken würde: Programme beenden/starten, Neustart, Abmelden, Nachricht, Aufgabe in seiner Sitzung. */
const SICHTBAR = /StopUser|Stop-Process|taskkill|Restart-Computer|Stop-Computer|shutdown(\.exe)?\s|logoff|Spaeter\s|msg(\.exe)?\s|Start-Process|explorer\.exe|rundll32|Register-ScheduledTask|schtasks|New-ScheduledTask|Invoke-Item|\bii\s|Start-Sleep\s+-Seconds\s+(1[5-9]|[2-9]\d)/i
/**
 * Würde der Benutzer ebenfalls merken: Dienste neu starten unterbricht Ton, Internet oder Netz
 * (z. B. mitten in einer Besprechung). Ausnahme ist nur die Druckwarteschlange.
 */
const UNTERBRICHT = /(DienstNeu|Restart-Service|Stop-Service)\b(?![^\n;]*(Spooler|PrintNotify))|Restart-NetAdapter|Disable-NetAdapter|ipconfig\s*\/(release|renew)|netsh\s+(winsock|int|interface|wlan\s+(disconnect|delete))|Clear-DnsClientCache.*Restart/i
/** Lange Volllast oder Installation von Updates — bleibt Einzelfall. */
const SCHWER = /\bDISM\b|Repair-WindowsImage|sfc(\.exe)?\s*\/scannow|chkdsk|Repair-Volume|UsoClient|wuauclt|Microsoft\.Update\.|Install-WindowsUpdate|IUpdateInstaller/i

/** Warum ein Schritt NICHT unbemerkt läuft — oder '' wenn er es tut. */
export function hindernis(a: PaAktion, s: PaSchritt, test: BtStand): string {
  if (s.optional) return 'nur manchmal nötig'
  if (a.risiko === 'kritisch') return 'als kritisch eingestuft'
  if (a.modus === 'benutzer') return 'läuft in der Sitzung des Benutzers (Fenster möglich)'
  if (a.modus === 'lokal') return 'läuft am Admin-PC'
  if (a.trenntVerbindung) return 'trennt kurz die Verbindung'
  if ((s.param || '').includes('{eingabe}') || (a.param?.pflicht && !s.param)) return 'braucht eine Eingabe'
  if (SICHTBAR.test(a.ps)) return 'schließt Programme oder ist am Bildschirm sichtbar'
  if (a.risiko !== 'lesen' && UNTERBRICHT.test(a.ps)) return 'unterbricht Ton, Netz oder Internet kurz'
  if (a.risiko !== 'lesen' && SCHWER.test(a.ps)) return 'belastet den PC lange oder installiert Updates'
  if (a.risiko !== 'lesen' && test['pa:' + a.id]?.s !== 'ok') return 'im Befehls-Test noch nicht bestanden'
  return ''
}

/** Was lässt sich für diesen Befund unbemerkt tun? */
export function planeFix(host: string, serial: string | undefined, b: Befund, problem: PaProblem | null | undefined, test: BtStand): FixPlan {
  const plan: FixPlan = { host, serial, befundKey: b.key, befundTitel: b.titel, schritte: [] }
  if (b.regel === 'laufwerk-i') {
    plan.schritte = [{ art: 'laufwerk-i', titel: `Laufwerk I: dauerhaft verbinden${b.benutzer?.length ? ` (${b.benutzer.join(', ')})` : ''} – wirksam ab der nächsten Anmeldung`, param: (b.benutzer || []).join(',') }]
    return plan
  }
  if (!problem) { plan.grund = 'Kein Lösungsweg im Katalog gefunden.'; return plan }
  plan.problemTitel = problem.titel
  const gruende = new Set<string>()
  for (const s of problem.schritte) {
    if (s.aktion.startsWith('werkzeug:')) continue
    const a = aktion(s.aktion)
    // Reine Prüfschritte beheben nichts — sie kosten nur eine weitere Verbindung zum PC
    if (!a || a.risiko === 'lesen') continue
    const h = hindernis(a, s, test)
    if (h) { gruende.add(h); continue }
    plan.schritte.push({ art: 'aktion', titel: s.titel || a.titel, aktionId: a.id, param: s.param || '' })
  }
  if (!plan.schritte.length) plan.grund = gruende.size ? `Kein Schritt läuft unbemerkt: ${[...gruende].join('; ')}.` : 'Die Lösung besteht nur aus Prüfungen.'
  return plan
}

/** Erreichbar? (Ping, sonst TCP 445/135/5985) — für mehrere PCs in einem Aufruf. */
export async function sindOnline(hosts: string[]): Promise<Set<string>> {
  const an = new Set<string>()
  for (let i = 0; i < hosts.length; i += 40) {
    const teil = hosts.slice(i, i + 40)
    try {
      const r = await api().runPowerShell(buildParallelOnlineCheck(teil), Math.min(110000, 30000 + teil.length * 800))
      for (const zeile of (r.stdout || '').split(/\r?\n/)) {
        if (!/:OK:|:OFFLINE/.test(zeile)) continue
        const p = parseOnlineCheckLine(zeile)
        if (p.online && p.hostname) an.add(p.hostname.trim().split('.')[0].toUpperCase())
      }
    } catch { /* gilt als nicht erreichbar */ }
  }
  return an
}

/** Dauerhafte Verbindung I: in die Registry der angemeldeten Benutzer schreiben — kein Fenster, keine Unterbrechung. */
const LAUFWERK_INNER = String.raw`
$in = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
$ziel = [string]$in.ziel; $nur = @($in.benutzer | Where-Object { $_ })
$zeilen = New-Object System.Collections.Generic.List[string]; $ok = $true
try {
  if (-not $ziel -or $ziel -notmatch '^\\\\[^\\]+\\[^\\]') { throw 'Zielpfad für Laufwerk I: ist kein Netzwerkpfad.' }
  $gesetzt = 0
  foreach ($k in @(Get-ChildItem Registry::HKEY_USERS -EA SilentlyContinue)) {
    $sid = [string]$k.PSChildName
    if ($sid -notmatch '^S-1-5-21-[\d-]+$' -and $sid -notmatch '^S-1-12-1-[\d-]+$') { continue }
    $konto = ''; try { $konto = (New-Object Security.Principal.SecurityIdentifier($sid)).Translate([Security.Principal.NTAccount]).Value } catch {}
    if (-not $konto) { continue }
    $t = $konto -split '\\'
    if ($t.Count -lt 2 -or $t[0] -ieq $env:COMPUTERNAME) { continue }
    if ($nur.Count -and ($nur -notcontains $t[-1])) { continue }
    $p = 'Registry::HKEY_USERS\' + $sid + '\Network\I'
    $alt = ''; try { $alt = [string](Get-ItemProperty -LiteralPath $p -EA Stop).RemotePath } catch {}
    if ($alt) { $zeilen.Add($t[-1] + ': I: ist schon verbunden (' + $alt + ') - nichts geaendert'); continue }
    New-Item -Path $p -Force -EA Stop | Out-Null
    New-ItemProperty -LiteralPath $p -Name RemotePath -Value $ziel -PropertyType String -Force | Out-Null
    New-ItemProperty -LiteralPath $p -Name UserName -Value '' -PropertyType String -Force | Out-Null
    New-ItemProperty -LiteralPath $p -Name ProviderName -Value 'Microsoft Windows Network' -PropertyType String -Force | Out-Null
    New-ItemProperty -LiteralPath $p -Name ProviderType -Value 0x20000 -PropertyType DWord -Force | Out-Null
    New-ItemProperty -LiteralPath $p -Name ConnectionType -Value 1 -PropertyType DWord -Force | Out-Null
    New-ItemProperty -LiteralPath $p -Name DeferFlags -Value 4 -PropertyType DWord -Force | Out-Null
    $gesetzt++
    $zeilen.Add($t[-1] + ': I: -> ' + $ziel + ' eingetragen (verbindet sich bei der naechsten Anmeldung)')
  }
  if (-not $zeilen.Count) { $ok = $false; $zeilen.Add('Kein passender Benutzer angemeldet - nichts eingetragen.') }
} catch { $ok = $false; $zeilen.Add('Fehler: ' + $_.Exception.Message) }
'@@PFLW@@' + (@{ ok = $ok; zeilen = [string[]]$zeilen.ToArray() } | ConvertTo-Json -Compress)
`

export type FixStatus = 'erledigt' | 'fehler' | 'offline'
export interface FixErgebnis { status: FixStatus; zeilen: string[]; geaendert: number }

/**
 * Plan auf einem PC ausführen. `onlineBekannt` = Erreichbarkeit wurde schon geprüft (Sammellauf).
 * Vermerkt ausgeführte Änderungen im Geräte-Dossier und im Aktivitäts-Protokoll.
 */
export async function fuehreFixAus(plan: FixPlan, by: string, onlineBekannt?: boolean): Promise<FixErgebnis> {
  const host = plan.host
  if (!plan.schritte.length) return { status: 'fehler', zeilen: [plan.grund || 'Nichts auszuführen.'], geaendert: 0 }
  const online = onlineBekannt ?? (await sindOnline([host])).has(host.split('.')[0].toUpperCase())
  if (!online) return { status: 'offline', zeilen: ['PC ist nicht erreichbar.'], geaendert: 0 }
  const f = await verbinde(host)
  if (f) return { status: 'offline', zeilen: [f], geaendert: 0 }
  const zeilen: string[] = []
  const erledigt: string[] = []
  let fehler = 0
  for (const s of plan.schritte) {
    if (s.art === 'laufwerk-i') {
      const ziel = pathService.getMarineRoot('unc')
      try {
        const r = await api().runPowerShell(fernBefehl(host, LAUFWERK_INNER, '@@PFLW@@', b64(JSON.stringify({ ziel, benutzer: (s.param || '').split(',').filter(Boolean) }))), 60000)
        const j = getagged<{ ok?: boolean; zeilen?: string[]; fehler?: string }>(r.stdout, '@@PFLW@@')
        if (j?.ok) { erledigt.push('Laufwerk I: eingetragen'); zeilen.push(...(j.zeilen || [])) } else { fehler++; zeilen.push(...(j?.zeilen || [j?.fehler || 'Laufwerk I: keine Antwort vom PC.'])) }
      } catch (e) { fehler++; zeilen.push(e instanceof Error ? e.message : String(e)) }
      continue
    }
    const a = s.aktionId ? aktion(s.aktionId) : undefined
    if (!a) { fehler++; zeilen.push(`${s.titel}: Baustein nicht gefunden.`); continue }
    const e = await fuehreAus(host, a, s.param || '')
    if (e.ok) { if (!s.liest) erledigt.push(s.titel); zeilen.push(`✓ ${s.titel}`, ...e.zeilen.slice(0, 6).map(x => '   ' + x)) }
    else { fehler++; zeilen.push(`✗ ${s.titel}: ${e.fehler || 'fehlgeschlagen'}`) }
  }
  if (erledigt.length) {
    const text = `Proaktive Fehlersuche: „${plan.befundTitel}“ behoben — ${erledigt.join(', ')}${fehler ? ` (${fehler} Schritt(e) mit Fehler)` : ''}`
    void logDeviceAction(host, plan.serial, text, by, 'PC-Fehler', { ohneProtokoll: true })
    void import('../services/aktivitaet').then(m => m.protokolliere({ art: 'manuell', quelle: 'Proaktives Radar · PC-Fehler', aktion: `Behoben: ${plan.befundTitel}`, ziel: host.toUpperCase(), ergebnis: `${erledigt.length} ok · ${fehler} Fehler`, details: erledigt }))
  }
  return { status: erledigt.length ? 'erledigt' : 'fehler', zeilen, geaendert: erledigt.length }
}

/** Nur für den Test: das Skript, das am PC läuft. */
export const LAUFWERK_INNER_TEST = LAUFWERK_INNER
