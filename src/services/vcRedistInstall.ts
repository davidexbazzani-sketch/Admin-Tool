// ── Visual C++ Redistributable (alle Versionen) ferninstallieren ──────────────
// Kachel „Visual C++ Laufzeit“ unter Software Installationen. Einzeln oder alle auf einmal.
// Quelle: offizielle Microsoft-Seite „Latest Supported Visual C++ Redistributable Downloads“
//   https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist
//   • v14 (2015–2026): Permalinks aka.ms/vc14/… — liefern immer die neueste Fassung
//   • 2013 / 2012 / 2010 / 2008 / 2005: feste Versionen (nicht mehr unterstützt, aber für alte Programme nötig)
// Ablauf (wie FreeCAD/Jabra):
//   1. Pakete auf dem ADMIN-PC holen → Netzordner (I:\700 Application\711 IT Allgemein\SW_INSTA\VC_Redist),
//      jede Datei muss eine gültige Microsoft-Signatur haben, sonst wird sie verworfen.
//      v14 wird nach 7 Tagen neu geholt (Permalink ändert sich), alte Versionen bleiben liegen.
//   2. Ziel-PC prüfen: nie auf einem Server (Server-Liste + Server-Betriebssystem), Architektur lesen.
//   3. Dateien über \\<host>\C$ kopieren (Admin-PC = Mittelsmann, Doppelhop).
//   4. Auf dem PC in Session 0 still installieren, von alt nach neu, je Paket höchstens 10 Minuten,
//      Signatur dort noch einmal prüfen. Kein Neustart (/norestart) – ggf. „Neustart nötig“ melden.
//   5. Gegenprobe: was steht jetzt in der Programmliste? 6. Dateien vom PC löschen.

import { api } from '../electronAPI'
import { ROBOCOPY_PS } from '../utils/robocopy'
import { pathService } from './pathService'
import { esc, b64, asArr, fernBefehl, getagged, verbinde } from './enaioInstall'
import { istBekannterServer } from './itAdminToolInstall'

export const VC_QUELLE = 'https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist'
export const VC_ORDNER = pathService.getMarineRoot('unc') + '\\700 Application\\711 IT Allgemein\\SW_INSTA\\VC_Redist'
const ZIEL_ORDNER = 'C:\\Windows\\Temp\\itadmintool_vcredist'
const V14_MAX_TAGE = 7
const PAKET_MINUTEN = 10

export type VcArch = 'x86' | 'x64' | 'arm64'
export interface VcPaket {
  id: string
  /** Gruppe für die Anzeige („2015–2026 (v14)“, „2013“ …) */
  reihe: string
  arch: VcArch
  /** feste Version (leer = immer neueste, v14) */
  version: string
  url: string
  /** Schalter für die stille Installation */
  args: string
  /** Erkennung in der Programmliste (DisplayName) */
  erkennung: RegExp
  /** Reihenfolge der Installation: alt → neu */
  rang: number
  unterstuetzt: boolean
}

const R = (s: string) => new RegExp(s, 'i')
export const VC_PAKETE: VcPaket[] = [
  { id: 'vc2005_x86', reihe: '2005 (VC++ 8.0 SP1)', arch: 'x86', version: '8.0.61001', url: 'https://download.microsoft.com/download/8/B/4/8B42259F-5D70-43F4-AC2E-4B208FD8D66A/vcredist_x86.EXE', args: '/Q', erkennung: R(String.raw`Visual C\+\+ 2005 Redistributable(?! \(x64\))`), rang: 1, unterstuetzt: false },
  { id: 'vc2005_x64', reihe: '2005 (VC++ 8.0 SP1)', arch: 'x64', version: '8.0.61001', url: 'https://download.microsoft.com/download/8/B/4/8B42259F-5D70-43F4-AC2E-4B208FD8D66A/vcredist_x64.EXE', args: '/Q', erkennung: R(String.raw`Visual C\+\+ 2005 Redistributable \(x64\)`), rang: 1, unterstuetzt: false },
  { id: 'vc2008_x86', reihe: '2008 (VC++ 9.0 SP1)', arch: 'x86', version: '9.0.30729.5677', url: 'https://download.microsoft.com/download/5/D/8/5D8C65CB-C849-4025-8E95-C3966CAFD8AE/vcredist_x86.exe', args: '/q', erkennung: R(String.raw`Visual C\+\+ 2008 Redistributable - x86`), rang: 2, unterstuetzt: false },
  { id: 'vc2008_x64', reihe: '2008 (VC++ 9.0 SP1)', arch: 'x64', version: '9.0.30729.5677', url: 'https://download.microsoft.com/download/5/D/8/5D8C65CB-C849-4025-8E95-C3966CAFD8AE/vcredist_x64.exe', args: '/q', erkennung: R(String.raw`Visual C\+\+ 2008 Redistributable - x64`), rang: 2, unterstuetzt: false },
  { id: 'vc2010_x86', reihe: '2010 (VC++ 10.0 SP1)', arch: 'x86', version: '10.0.40219.325', url: 'https://download.microsoft.com/download/1/6/5/165255E7-1014-4D0A-B094-B6A430A6BFFC/vcredist_x86.exe', args: '/q /norestart', erkennung: R(String.raw`Visual C\+\+ 2010\s+x86 Redistributable`), rang: 3, unterstuetzt: false },
  { id: 'vc2010_x64', reihe: '2010 (VC++ 10.0 SP1)', arch: 'x64', version: '10.0.40219.325', url: 'https://download.microsoft.com/download/1/6/5/165255E7-1014-4D0A-B094-B6A430A6BFFC/vcredist_x64.exe', args: '/q /norestart', erkennung: R(String.raw`Visual C\+\+ 2010\s+x64 Redistributable`), rang: 3, unterstuetzt: false },
  { id: 'vc2012_x86', reihe: '2012 (VC++ 11.0 Update 4)', arch: 'x86', version: '11.0.61030.0', url: 'https://download.microsoft.com/download/1/6/B/16B06F60-3B20-4FF2-B699-5E9B7962F9AE/VSU_4/vcredist_x86.exe', args: '/install /quiet /norestart', erkennung: R(String.raw`Visual C\+\+ 2012 Redistributable \(x86\)`), rang: 4, unterstuetzt: false },
  { id: 'vc2012_x64', reihe: '2012 (VC++ 11.0 Update 4)', arch: 'x64', version: '11.0.61030.0', url: 'https://download.microsoft.com/download/1/6/B/16B06F60-3B20-4FF2-B699-5E9B7962F9AE/VSU_4/vcredist_x64.exe', args: '/install /quiet /norestart', erkennung: R(String.raw`Visual C\+\+ 2012 Redistributable \(x64\)`), rang: 4, unterstuetzt: false },
  { id: 'vc2013_x86', reihe: '2013 (VC++ 12.0)', arch: 'x86', version: '12.0.40664.0', url: 'https://aka.ms/highdpimfc2013x86enu', args: '/install /quiet /norestart', erkennung: R(String.raw`Visual C\+\+ 2013 Redistributable \(x86\)`), rang: 5, unterstuetzt: false },
  { id: 'vc2013_x64', reihe: '2013 (VC++ 12.0)', arch: 'x64', version: '12.0.40664.0', url: 'https://aka.ms/highdpimfc2013x64enu', args: '/install /quiet /norestart', erkennung: R(String.raw`Visual C\+\+ 2013 Redistributable \(x64\)`), rang: 5, unterstuetzt: false },
  { id: 'vc14_x86', reihe: '2015–2026 (v14, aktuell)', arch: 'x86', version: '', url: 'https://aka.ms/vc14/vc_redist.x86.exe', args: '/install /quiet /norestart', erkennung: R(String.raw`Visual C\+\+ (v14|20(15|17|19|22|26)(-20\d\d)?) Redistributable \(x86\)`), rang: 6, unterstuetzt: true },
  { id: 'vc14_x64', reihe: '2015–2026 (v14, aktuell)', arch: 'x64', version: '', url: 'https://aka.ms/vc14/vc_redist.x64.exe', args: '/install /quiet /norestart', erkennung: R(String.raw`Visual C\+\+ (v14|20(15|17|19|22|26)(-20\d\d)?) Redistributable \(x64\)`), rang: 6, unterstuetzt: true },
  { id: 'vc14_arm64', reihe: '2015–2026 (v14, aktuell)', arch: 'arm64', version: '', url: 'https://aka.ms/vc14/vc_redist.arm64.exe', args: '/install /quiet /norestart', erkennung: R(String.raw`Visual C\+\+ (v14|20(15|17|19|22|26)(-20\d\d)?) Redistributable \(arm64\)`), rang: 6, unterstuetzt: true },
]

export const vcPaket = (id: string) => VC_PAKETE.find(p => p.id === id)
export const VC_REIHEN = [...new Set(VC_PAKETE.map(p => p.reihe))].reverse()   // neueste zuerst anzeigen

/** Passt das Paket zur Architektur des PCs? (x64 nur auf 64-Bit, arm64 nur auf ARM64) */
export function passtZu(p: VcPaket, osArch: string): boolean {
  const a = (osArch || '').toLowerCase()
  if (p.arch === 'x86') return true
  if (p.arch === 'arm64') return a === 'arm64'
  return a === 'x64' || a === 'amd64' || a === 'arm64'   // x64-Paket enthält auch die ARM64-Dateien
}

/** Zuordnung „installierte Programme“ → Paket-IDs (rein, testbar). */
export function ordneInstalliertZu(eintraege: { name: string; version: string }[]): Record<string, { name: string; version: string }> {
  const r: Record<string, { name: string; version: string }> = {}
  for (const p of VC_PAKETE) {
    const hit = eintraege.filter(e => p.erkennung.test(e.name)).sort((a, b) => vergleiche(b.version, a.version))[0]
    if (hit) r[p.id] = hit
  }
  return r
}
export function vergleiche(a: string, b: string): number {
  const t = (s: string) => (s.match(/\d+/g) || []).map(Number)
  const x = t(a), y = t(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1 }
  return 0
}

/** Exitcode deuten (Burn/MSI). */
export function deuteVcCode(code: number): { ok: boolean; neustart: boolean; text: string } {
  if (code === 0) return { ok: true, neustart: false, text: 'installiert' }
  if (code === 3010 || code === 1641) return { ok: true, neustart: true, text: 'installiert – Neustart nötig' }
  if (code === 1638) return { ok: true, neustart: false, text: 'gleiche oder neuere Version war schon da' }
  if (code === 1618) return { ok: false, neustart: false, text: 'eine andere Installation läuft gerade (1618) – später erneut versuchen' }
  if (code === 1602) return { ok: false, neustart: false, text: 'abgebrochen (1602)' }
  if (code === 1603) return { ok: false, neustart: false, text: 'schwerer Installationsfehler (1603)' }
  if (code === 5100) return { ok: false, neustart: false, text: 'Systemvoraussetzungen nicht erfüllt (5100)' }
  if (code === -1) return { ok: false, neustart: false, text: `nach ${PAKET_MINUTEN} Minuten abgebrochen` }
  return { ok: false, neustart: false, text: `Exitcode ${code}` }
}

// ── Ist-Stand auf dem Ziel-PC (nur lesen) ────────────────────────────────────
const STAND_INNER = String.raw`
try {
  $os = Get-CimInstance Win32_OperatingSystem
  $arch = [string]$env:PROCESSOR_ARCHITECTURE
  if ($env:PROCESSOR_ARCHITEW6432) { $arch = [string]$env:PROCESSOR_ARCHITEW6432 }
  if (-not [Environment]::Is64BitOperatingSystem) { $arch = 'x86' }
  $liste = @()
  foreach ($k in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*') {
    foreach ($e in @(Get-ItemProperty $k -EA SilentlyContinue | Where-Object { [string]$_.DisplayName -match 'Visual C\+\+' -and [string]$_.DisplayName -match 'Redistributable|Runtime' })) {
      $liste += [pscustomobject]@{ name = [string]$e.DisplayName; version = [string]$e.DisplayVersion }
    }
  }
  $neustart = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired')
  '@@VCSTAND@@' + (@{ ok = $true; arch = $arch; produktTyp = [int]$os.ProductType; system = [string]$os.Caption; rechner = [string]$env:COMPUTERNAME; neustart = [bool]$neustart; programme = @($liste) } | ConvertTo-Json -Depth 4 -Compress)
} catch { '@@VCSTAND@@' + (@{ ok = $false; fehler = ('' + $_.Exception.Message) } | ConvertTo-Json -Compress) }
`

export interface VcStand {
  ok: boolean
  fehler?: string
  arch: string
  server: boolean
  system: string
  neustartAusstehend: boolean
  programme: { name: string; version: string }[]
  /** Paket-ID → installiert */
  installiert: Record<string, { name: string; version: string }>
}

/** Sperre vor jeder Verbindung: nie auf Server (Server-Liste). */
async function sperre(host: string): Promise<string> {
  if (await istBekannterServer(host)) return `${host} steht in der Server-Liste — auf Servern installiert diese Kachel nichts.`
  return ''
}

export async function pruefeVcStand(host: string): Promise<VcStand> {
  const leer: VcStand = { ok: false, arch: '', server: false, system: '', neustartAusstehend: false, programme: [], installiert: {} }
  const s = await sperre(host)
  if (s) return { ...leer, server: true, fehler: s }
  const f = await verbinde(host)
  if (f) return { ...leer, fehler: f }
  const r = await api().runPowerShell(fernBefehl(host, STAND_INNER, '@@VCSTAND@@'), 120000)
  const j = getagged<{ ok?: boolean; fehler?: string; arch?: string; produktTyp?: number; system?: string; neustart?: boolean; programme?: unknown }>(r.stdout, '@@VCSTAND@@')
  if (!j || j.ok === false) return { ...leer, fehler: j?.fehler || r.stderr?.trim() || 'Keine Rückmeldung vom Ziel-PC.' }
  const programme = asArr<{ name: string; version: string }>(j.programme)
  const server = (j.produktTyp ?? 1) !== 1
  return {
    ok: !server, fehler: server ? `${host} ist ein Server (${j.system || 'Server-Betriebssystem'}) — auf Servern installiert diese Kachel nichts.` : undefined,
    arch: (j.arch || '').toLowerCase(), server, system: j.system || '', neustartAusstehend: !!j.neustart,
    programme, installiert: ordneInstalliertZu(programme),
  }
}

// ── Pakete auf dem Admin-PC holen (Netzordner als gemeinsamer Zwischenspeicher) ──
const LADEN_PS = String.raw`
$ErrorActionPreference = 'Stop'
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
$erg = @()
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  function Neu-SkfWc { $w = New-Object System.Net.WebClient; $w.Headers.Add('User-Agent', 'IT-Admin-Tool'); $p = [System.Net.WebRequest]::GetSystemWebProxy(); $p.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials; $w.Proxy = $p; return $w }
  function Test-SkfMs([string]$f) {
    $sig = Get-AuthenticodeSignature -LiteralPath $f
    return ($sig.Status -eq 'Valid' -and [string]$sig.SignerCertificate.Subject -match 'O=Microsoft Corporation')
  }
  if (-not (Test-Path -LiteralPath $o.ordner)) { New-Item -ItemType Directory -Force -Path $o.ordner | Out-Null }
  foreach ($p in @($o.pakete)) {
    $ziel = Join-Path $o.ordner ($p.id + '.exe')
    try {
      $frisch = $false
      if (Test-Path -LiteralPath $ziel) {
        $alter = ((Get-Date) - (Get-Item -LiteralPath $ziel).LastWriteTime).TotalDays
        $frisch = (Test-SkfMs $ziel) -and (-not $p.immerNeu -or $alter -lt [double]$o.v14Tage)
      }
      $neu = $false
      if (-not $frisch) {
        $teil = $ziel + '.part'
        Remove-Item -LiteralPath $teil -Force -EA SilentlyContinue
        (Neu-SkfWc).DownloadFile($p.url, $teil)
        if (-not (Test-SkfMs $teil)) { $s = Get-AuthenticodeSignature -LiteralPath $teil; Remove-Item -LiteralPath $teil -Force -EA SilentlyContinue; throw ('keine gültige Microsoft-Signatur (' + $s.Status + ') – Datei verworfen') }
        Move-Item -LiteralPath $teil -Destination $ziel -Force
        $neu = $true
      }
      $fi = Get-Item -LiteralPath $ziel
      $erg += [pscustomobject]@{ id = $p.id; ok = $true; neu = $neu; pfad = $fi.FullName; mb = [math]::Round($fi.Length / 1MB, 1); version = [string]$fi.VersionInfo.ProductVersion }
    } catch { $erg += [pscustomobject]@{ id = $p.id; ok = $false; fehler = ('' + $_.Exception.Message) } }
  }
  '@@VCLADEN@@' + (@{ ok = $true; pakete = @($erg) } | ConvertTo-Json -Depth 4 -Compress)
} catch { '@@VCLADEN@@' + (@{ ok = $false; fehler = ('' + $_.Exception.Message) } | ConvertTo-Json -Compress) }
`

export interface VcGeladen { id: string; ok: boolean; neu?: boolean; pfad?: string; mb?: number; version?: string; fehler?: string }

export async function holeVcPakete(ids: string[]): Promise<{ ok: boolean; fehler?: string; pakete: VcGeladen[] }> {
  const pakete = ids.map(vcPaket).filter((p): p is VcPaket => !!p).map(p => ({ id: p.id, url: p.url, immerNeu: !p.version }))
  if (!pakete.length) return { ok: true, pakete: [] }
  const r = await api().runPowerShell(`$b64 = '${b64(JSON.stringify({ ordner: VC_ORDNER, v14Tage: V14_MAX_TAGE, pakete }))}'\n${LADEN_PS}`, 30 * 60 * 1000)
  const j = getagged<{ ok?: boolean; fehler?: string; pakete?: unknown }>(r.stdout, '@@VCLADEN@@')
  if (!j) return { ok: false, fehler: r.timedOut ? 'Zeitüberschreitung beim Herunterladen.' : (r.stderr?.trim() || 'Keine Rückmeldung beim Herunterladen.'), pakete: [] }
  if (j.ok === false) return { ok: false, fehler: j.fehler, pakete: [] }
  return { ok: true, pakete: asArr<VcGeladen>(j.pakete) }
}

// ── Installation auf dem Ziel-PC (Session 0) ─────────────────────────────────
const INSTALL_INNER = String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
try {
  if ((Get-CimInstance Win32_OperatingSystem).ProductType -ne 1) { throw 'Server-Betriebssystem – hier wird nichts installiert.' }
  $erg = @()
  foreach ($p in @($o.pakete)) {
    $f = Join-Path $o.ordner ($p.id + '.exe')
    if (-not (Test-Path -LiteralPath $f)) { $erg += [pscustomobject]@{ id = $p.id; code = -2; text = 'Datei fehlt auf dem PC' }; continue }
    $sig = Get-AuthenticodeSignature -LiteralPath $f
    if ($sig.Status -ne 'Valid' -or [string]$sig.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') { $erg += [pscustomobject]@{ id = $p.id; code = -3; text = ('Signatur ungültig (' + $sig.Status + ')') }; continue }
    $pr = Start-Process -FilePath $f -ArgumentList $p.args -PassThru -WindowStyle Hidden
    $null = $pr.Handle
    $code = -1
    if ($pr.WaitForExit([int]$o.minuten * 60000)) { $code = $pr.ExitCode } else { Stop-Process -Id $pr.Id -Force -EA SilentlyContinue }
    $erg += [pscustomobject]@{ id = $p.id; code = [int]$code }
  }
  '@@VCINST@@' + (@{ ok = $true; ergebnis = @($erg) } | ConvertTo-Json -Depth 4 -Compress)
} catch { '@@VCINST@@' + (@{ ok = $false; fehler = ('' + $_.Exception.Message) } | ConvertTo-Json -Compress) }
`

export type VcSchrittStatus = 'offen' | 'laeuft' | 'ok' | 'fehler' | 'warnung'
export interface VcSchritt { id: string; label: string; status: VcSchrittStatus; info?: string }
export interface VcErgebnis { ok: boolean; text: string; neustart?: boolean; je?: { id: string; ok: boolean; text: string }[] }
export interface VcOptionen {
  /** gewählte Paket-IDs */
  pakete: string[]
  /** auch schon vorhandene Pakete erneut ausführen (Reparatur/Aktualisierung) */
  auchVorhandene: boolean
}

export function vcSchritte(): { id: string; label: string }[] {
  return [
    { id: 'ziel', label: 'Ziel-PC prüfen (kein Server, erreichbar, Architektur, Ist-Stand)' },
    { id: 'laden', label: 'Pakete von Microsoft holen bzw. aus dem Netzordner nehmen (Signatur prüfen)' },
    { id: 'kopie', label: 'Pakete auf den Ziel-PC kopieren' },
    { id: 'install', label: 'Still installieren (alt → neu, ohne Neustart)' },
    { id: 'pruefen', label: 'Gegenprobe in der Programmliste' },
    { id: 'aufraeumen', label: 'Aufräumen' },
  ]
}

const reiheKurz = (p: VcPaket) => `${p.reihe.split(' ')[0]} ${p.arch}`

export async function installiereVc(host: string, opt: VcOptionen, melde: (id: string, s: VcSchrittStatus, info?: string) => void): Promise<VcErgebnis> {
  // 1) Ziel
  melde('ziel', 'laeuft')
  const vor = await pruefeVcStand(host)
  if (!vor.ok) { melde('ziel', 'fehler', vor.fehler); return { ok: false, text: vor.fehler || 'Ziel-PC nicht prüfbar.' } }
  const gewaehlt = opt.pakete.map(vcPaket).filter((p): p is VcPaket => !!p)
  const unpassend = gewaehlt.filter(p => !passtZu(p, vor.arch))
  const vorhanden = gewaehlt.filter(p => passtZu(p, vor.arch) && vor.installiert[p.id])
  // v14 wird immer ausgeführt (aktualisiert auf die neueste Fassung); alte Versionen nur, wenn sie fehlen
  const todo = gewaehlt.filter(p => passtZu(p, vor.arch) && (opt.auchVorhandene || !p.version || !vor.installiert[p.id])).sort((a, b) => a.rang - b.rang || a.arch.localeCompare(b.arch))
  melde('ziel', 'ok', [
    `${host} erreichbar · ${vor.system || 'Windows'} · ${vor.arch || '?'}`,
    unpassend.length ? `übersprungen (passt nicht zur Architektur): ${unpassend.map(reiheKurz).join(', ')}` : '',
    vorhanden.filter(p => !todo.includes(p)).length ? `schon vorhanden: ${vorhanden.filter(p => !todo.includes(p)).map(reiheKurz).join(', ')}` : '',
    vor.neustartAusstehend ? 'Achtung: auf dem PC steht schon ein Neustart aus' : '',
  ].filter(Boolean).join(' · '))
  if (!todo.length) {
    for (const s of ['laden', 'kopie', 'install', 'aufraeumen']) melde(s, 'ok', 'nichts zu tun')
    melde('pruefen', 'ok', 'alle gewählten Pakete sind schon installiert')
    return { ok: true, text: `Auf ${host} war schon alles Gewählte installiert — nichts zu tun.` }
  }

  // 2) Holen
  melde('laden', 'laeuft', `${todo.length} Paket(e) – nur was im Netzordner fehlt bzw. veraltet ist, wird von Microsoft geladen`)
  const g = await holeVcPakete(todo.map(p => p.id))
  if (!g.ok) { melde('laden', 'fehler', g.fehler); return { ok: false, text: g.fehler || 'Pakete konnten nicht geholt werden.' } }
  const geholt = g.pakete.filter(x => x.ok)
  const nichtGeholt = g.pakete.filter(x => !x.ok)
  melde('laden', nichtGeholt.length ? (geholt.length ? 'warnung' : 'fehler') : 'ok', [
    `${geholt.length} bereit (${geholt.filter(x => x.neu).length} neu geladen, Signatur geprüft)`,
    ...nichtGeholt.map(x => `${x.id}: ${x.fehler}`),
  ].join(' · '))
  if (!geholt.length) return { ok: false, text: 'Kein Paket konnte geholt werden.' }

  // 3) Kopieren
  melde('kopie', 'laeuft')
  const zielUnc = `\\\\${host}\\C$\\Windows\\Temp\\itadmintool_vcredist`
  const kopie = await api().runPowerShell([
    ROBOCOPY_PS,
    ...geholt.map(x => `$null = Copy-SkfFile '${esc(x.pfad || '')}' '${esc(zielUnc)}'`),
    `$fehlt = @(); foreach ($n in @(${geholt.map(x => `'${esc(x.id)}.exe'`).join(', ')})) { if (-not (Test-Path -LiteralPath (Join-Path '${esc(zielUnc)}' $n))) { $fehlt += $n } }`,
    `if ($fehlt.Count) { 'ERR:fehlt auf dem PC: ' + ($fehlt -join ', ') } else { 'OK' }`,
  ].join('\n'), 20 * 60 * 1000)
  const kz = (kopie.stdout || '').split(/\r?\n/).map(l => l.trim()).find(l => l === 'OK' || l.startsWith('ERR:'))
  if (kz !== 'OK') { const t = kz ? kz.slice(4) : (kopie.stderr?.trim() || 'Kopie auf den Ziel-PC fehlgeschlagen (Zugriff auf C$?).'); melde('kopie', 'fehler', t); await aufraeumen(host); return { ok: false, text: t } }
  melde('kopie', 'ok', `${geholt.reduce((s, x) => s + (x.mb || 0), 0).toFixed(1)} MB nach ${ZIEL_ORDNER}`)

  // 4) Installieren
  const liste = todo.filter(p => geholt.some(x => x.id === p.id))
  melde('install', 'laeuft', `${liste.length} Paket(e) nacheinander – je höchstens ${PAKET_MINUTEN} Minuten`)
  const ir = await api().runPowerShell(fernBefehl(host, INSTALL_INNER, '@@VCINST@@',
    b64(JSON.stringify({ ordner: ZIEL_ORDNER, minuten: PAKET_MINUTEN, pakete: liste.map(p => ({ id: p.id, args: p.args })) }))),
    (liste.length * PAKET_MINUTEN + 10) * 60 * 1000)
  const ij = getagged<{ ok?: boolean; fehler?: string; ergebnis?: unknown }>(ir.stdout, '@@VCINST@@')
  if (!ij || ij.ok === false) {
    const t = ij?.fehler || (ir.timedOut ? 'Keine Rückmeldung vom Ziel-PC (Zeitüberschreitung).' : (ir.stderr?.trim() || 'Keine Rückmeldung vom Ziel-PC.'))
    melde('install', 'fehler', t); await aufraeumen(host); return { ok: false, text: t }
  }
  const je = asArr<{ id: string; code: number; text?: string }>(ij.ergebnis).map(e => {
    const d = e.text ? { ok: false, neustart: false, text: e.text } : deuteVcCode(e.code)
    return { id: e.id, ok: d.ok, neustart: d.neustart, text: `${reiheKurz(vcPaket(e.id)!)}: ${d.text}` }
  })
  const fehler = je.filter(e => !e.ok)
  const neustart = je.some(e => e.neustart)
  melde('install', fehler.length ? (fehler.length === je.length ? 'fehler' : 'warnung') : 'ok', je.map(e => e.text).join(' · '))

  // 5) Gegenprobe
  melde('pruefen', 'laeuft')
  const nach = await pruefeVcStand(host)
  if (!nach.ok) melde('pruefen', 'warnung', nach.fehler || 'Nachprüfung nicht möglich.')
  else {
    const fehlen = liste.filter(p => !nach.installiert[p.id])
    melde('pruefen', fehlen.length ? 'warnung' : 'ok', fehlen.length
      ? `nicht in der Programmliste: ${fehlen.map(reiheKurz).join(', ')}`
      : liste.map(p => `${reiheKurz(p)} ${nach.installiert[p.id]?.version || ''}`.trim()).join(' · '))
  }

  // 6) Aufräumen
  melde('aufraeumen', 'laeuft')
  const sauber = await aufraeumen(host)
  melde('aufraeumen', sauber ? 'ok' : 'warnung', sauber ? 'Pakete vom PC entfernt.' : `Dateien unter ${ZIEL_ORDNER} konnten nicht entfernt werden.`)

  const okAnz = je.length - fehler.length
  return {
    ok: fehler.length === 0, neustart, je: je.map(({ id, ok, text }) => ({ id, ok, text })),
    text: `${okAnz} von ${je.length} Visual-C++-Paket(en) auf ${host} installiert${neustart ? ' – Neustart nötig, damit alles greift' : ''}.${fehler.length ? ` Fehler: ${fehler.map(f => f.text).join('; ')}` : ''}${nichtGeholt.length ? ` Nicht geladen: ${nichtGeholt.map(x => x.id).join(', ')}.` : ''}`,
  }
}

async function aufraeumen(host: string): Promise<boolean> {
  const ordner = `\\\\${host}\\C$\\Windows\\Temp\\itadmintool_vcredist`
  try {
    const r = await api().runPowerShell([
      `Get-ChildItem -LiteralPath '${esc(ordner)}' -File -Filter 'vc*.exe' -EA SilentlyContinue | Remove-Item -Force -EA SilentlyContinue`,
      `if (@(Get-ChildItem -LiteralPath '${esc(ordner)}' -File -Filter 'vc*.exe' -EA SilentlyContinue).Count) { 'REST' } else { 'OK' }`,
    ].join('\n'), 60000)
    return (r.stdout || '').includes('OK')
  } catch { return false }
}

/** Skripte – exportiert, damit sie sich ohne Ziel-PC prüfen lassen. */
export const VC_SKRIPTE = { STAND_INNER, LADEN_PS, INSTALL_INNER }
