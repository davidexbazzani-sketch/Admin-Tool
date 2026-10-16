// ── Sprache komplett auf Deutsch — für ALLE Benutzer, auch künftige ─────────
// Reicht NICHT: Set-WinUserLanguageList/Set-Culture — das wirkt nur auf das Profil,
// in dem es läuft. Damit wirklich jeder Anwender Deutsch bekommt, sind vier Ebenen
// nötig ([[setup_scripts_feature]]):
//
//   A) Sprachpaket de-DE sicherstellen (Install-Language, Windows 11). Ohne das Paket
//      bleibt die Oberfläche englisch, egal was eingestellt ist.
//   B) System-Ebene: Set-WinSystemLocale + Standort (gilt maschinenweit).
//   C) Default-Profil + Anmeldebildschirm über die Unattend-XML von intl.cpl
//      (CopySettingsToDefaultUserAcct / ToSystemAcct) → jeder Benutzer, der sich
//      ZUM ERSTEN MAL anmeldet, startet direkt auf Deutsch.
//   D) Alle BEREITS vorhandenen Profile (inkl. C:\Users\Default als Sicherheitsnetz):
//      Regionseinstellungen, Anzeigesprache, Tastatur und Office-Sprache direkt in
//      HKU\<SID> schreiben; nicht geladene Profile werden über NTUSER.DAT angefasst.
//
// Office: Anzeige-/Hilfesprache 1031 in LanguageResources (15.0 + 16.0). Das greift nur,
// wenn das deutsche Office-Sprachpaket installiert ist — sonst fällt Office zurück.

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'

export interface LanguageStep { name: string; ok: boolean; text: string }
export interface LanguageResult { ok: boolean; steps: LanguageStep[]; text?: string }

function psq(s: string): string { return (s || '').replace(/'/g, "''") }

/** Registry-Werte, die ein Benutzerprofil auf de-DE stellen. */
const PROFIL_PS = [
  `function Set-SkfDeutsch($hive) {`,
  `  $intl = $hive + '\\Control Panel\\International'`,
  `  if (-not (Test-Path -LiteralPath $intl)) { New-Item -Path $intl -Force | Out-Null }`,
  `  $werte = @{`,
  `    LocaleName='de-DE'; Locale='00000407'; sCountry='Deutschland'; sLanguage='DEU'; iCountry='49';`,
  `    sList=';'; sDecimal=','; sThousand='.'; sCurrency=[char]0x20AC; iCurrDigits='2';`,
  `    sMonDecimalSep=','; sMonThousandSep='.'; sShortDate='dd.MM.yyyy'; sLongDate='dddd, d. MMMM yyyy';`,
  `    sTimeFormat='HH:mm:ss'; sShortTime='HH:mm'; iTime='1'; iTLZero='1'; s1159=''; s2359='';`,
  `    iFirstDayOfWeek='0'; iMeasure='0'; iDate='1'; sDate='.'`,
  `  }`,
  `  foreach ($k in $werte.Keys) { New-ItemProperty -LiteralPath $intl -Name $k -PropertyType String -Value ([string]$werte[$k]) -Force | Out-Null }`,
  // Anzeigesprache des Benutzers
  `  $up = $intl + '\\User Profile'`,
  `  if (-not (Test-Path -LiteralPath $up)) { New-Item -Path $up -Force | Out-Null }`,
  `  New-ItemProperty -LiteralPath $up -Name 'Languages' -PropertyType MultiString -Value @('de-DE') -Force | Out-Null`,
  `  $upd = $up + '\\de-DE'`,
  `  if (-not (Test-Path -LiteralPath $upd)) { New-Item -Path $upd -Force | Out-Null }`,
  `  New-ItemProperty -LiteralPath $upd -Name '0407:00000407' -PropertyType DWord -Value 1 -Force | Out-Null`,
  `  $desk = $hive + '\\Control Panel\\Desktop'`,
  `  if (-not (Test-Path -LiteralPath $desk)) { New-Item -Path $desk -Force | Out-Null }`,
  `  New-ItemProperty -LiteralPath $desk -Name 'PreferredUILanguages' -PropertyType MultiString -Value @('de-DE') -Force | Out-Null`,
  // Tastaturbelegung
  `  $kb = $hive + '\\Keyboard Layout\\Preload'`,
  `  if (-not (Test-Path -LiteralPath $kb)) { New-Item -Path $kb -Force | Out-Null }`,
  `  New-ItemProperty -LiteralPath $kb -Name '1' -PropertyType String -Value '00000407' -Force | Out-Null`,
  // Office (15.0 = 2013, 16.0 = 2016/2019/2021/365)
  `  foreach ($v in '15.0','16.0') {`,
  `    $lr = $hive + '\\Software\\Microsoft\\Office\\' + $v + '\\Common\\LanguageResources'`,
  `    if (-not (Test-Path -LiteralPath $lr)) { New-Item -Path $lr -Force | Out-Null }`,
  `    New-ItemProperty -LiteralPath $lr -Name 'UILanguage' -PropertyType DWord -Value 1031 -Force | Out-Null`,
  `    New-ItemProperty -LiteralPath $lr -Name 'HelpLanguage' -PropertyType DWord -Value 1031 -Force | Out-Null`,
  `    New-ItemProperty -LiteralPath $lr -Name 'UISettingsLanguage' -PropertyType DWord -Value 1031 -Force | Out-Null`,
  `    New-ItemProperty -LiteralPath $lr -Name 'PreferredUILanguages' -PropertyType MultiString -Value @('de-DE') -Force | Out-Null`,
  `    New-ItemProperty -LiteralPath $lr -Name 'PreferredEditingLanguages' -PropertyType MultiString -Value @('de-DE') -Force | Out-Null`,
  `  }`,
  `}`,
].join('\n')

/** Unattend-XML für intl.cpl — setzt den laufenden Kontext UND kopiert ins Default-/System-Konto. */
const INTL_XML_PS = [
  `$xml = @'`,
  `<gs:GlobalizationServices xmlns:gs="urn:longhornGlobalizationUnattend">`,
  `  <gs:UserList>`,
  `    <gs:User UserID="Current" CopySettingsToDefaultUserAcct="true" CopySettingsToSystemAcct="true"/>`,
  `  </gs:UserList>`,
  `  <gs:UserLocale>`,
  `    <gs:Locale Name="de-DE" SetAsCurrent="true" ResetAllSettings="true"/>`,
  `  </gs:UserLocale>`,
  `  <gs:SystemLocale Name="de-DE"/>`,
  `  <gs:InputPreferences>`,
  `    <gs:InputLanguageID Action="add" ID="0407:00000407" Default="true"/>`,
  `  </gs:InputPreferences>`,
  `  <gs:LocationPreferences>`,
  `    <gs:GeoID Value="94"/>`,
  `  </gs:LocationPreferences>`,
  `  <gs:MUILanguagePreferences>`,
  `    <gs:MUILanguage Value="de-DE"/>`,
  `    <gs:MUIFallback Value="en-US"/>`,
  `  </gs:MUILanguagePreferences>`,
  `</gs:GlobalizationServices>`,
  `'@`,
].join('\n')

const INNER_PS = [
  `param($corp)`,
  `$ErrorActionPreference = 'Continue'`,
  `$res = @()`,
  `function Add-Res($n, $o, $t) { $script:res += [pscustomobject]@{ name=$n; ok=[bool]$o; text=[string]$t } }`,
  PROFIL_PS,
  `$geladen = @()`,
  `try {`,

  // ── A) Sprachpaket de-DE sicherstellen ────────────────────────────────────
  `  try {`,
  `    if (Get-Command Install-Language -EA SilentlyContinue) {`,
  `      $da = $false`,
  `      try { $da = @(Get-InstalledLanguage -EA Stop | Where-Object { $_.LanguageId -eq 'de-DE' }).Count -gt 0 } catch { }`,
  `      if ($da) { Add-Res 'Sprachpaket de-DE' $true 'bereits installiert' }`,
  `      else { Install-Language -Language de-DE -EA Stop | Out-Null; Add-Res 'Sprachpaket de-DE' $true 'nachinstalliert' }`,
  `    } else {`,
  `      $liste = @()`,
  `      try { $liste = (Get-WinUserLanguageList).LanguageTag } catch { }`,
  `      if ($liste -contains 'de-DE') { Add-Res 'Sprachpaket de-DE' $true 'vorhanden (Install-Language nicht verfuegbar)' }`,
  `      else { Add-Res 'Sprachpaket de-DE' $false 'nicht installierbar auf diesem Windows — Oberflaeche bleibt ggf. englisch' }`,
  `    }`,
  `  } catch { Add-Res 'Sprachpaket de-DE' $false $_.Exception.Message }`,

  // ── B) System-Ebene ───────────────────────────────────────────────────────
  `  try { Set-WinSystemLocale de-DE -EA Stop; Set-WinHomeLocation -GeoId 94 -EA Stop; Add-Res 'System-Gebietsschema' $true 'de-DE, Standort Deutschland' }`,
  `  catch { Add-Res 'System-Gebietsschema' $false $_.Exception.Message }`,

  // ── C) Default-Profil + Anmeldebildschirm ─────────────────────────────────
  `  try {`,
  INTL_XML_PS,
  `    if (-not (Test-Path 'C:\\Temp')) { New-Item -Path 'C:\\Temp' -ItemType Directory -Force | Out-Null }`,
  `    $xf = 'C:\\Temp\\SKF-de-DE.xml'`,
  `    Set-Content -LiteralPath $xf -Value $xml -Encoding UTF8 -Force`,
  `    $p = Start-Process -FilePath 'control.exe' -ArgumentList ('intl.cpl,,/f:"' + $xf + '"') -Wait -PassThru -WindowStyle Hidden`,
  `    Remove-Item -LiteralPath $xf -Force -EA SilentlyContinue`,
  `    Add-Res 'Default-Profil + Anmeldebildschirm' $true 'uebernommen (neue Benutzer starten auf Deutsch)'`,
  `  } catch { Add-Res 'Default-Profil + Anmeldebildschirm' $false $_.Exception.Message }`,

  // ── D) Vorhandene Profile + Default-Profil direkt ─────────────────────────
  `  try {`,
  `    $plist = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList'`,
  `    $ziele = @()`,
  `    foreach ($k in (Get-ChildItem $plist -EA SilentlyContinue)) {`,
  `      $sid = $k.PSChildName`,
  `      if ($sid -notmatch '^S-1-5-21') { continue }`,
  `      $prof = (Get-ItemProperty $k.PSPath -EA SilentlyContinue).ProfileImagePath`,
  `      if (-not $prof) { continue }`,
  `      $leaf = Split-Path $prof -Leaf`,
  `      if ($leaf -match '^(defaultuser0)$') { continue }`,
  `      $ziele += [pscustomobject]@{ name=$leaf; sid=$sid; prof=$prof }`,
  `    }`,
  `    $ziele += [pscustomobject]@{ name='Default (neue Benutzer)'; sid=$null; prof='C:\\Users\\Default' }`,
  `    $ok = 0; $fehler = @()`,
  `    foreach ($z in $ziele) {`,
  `      $hive = $null; $tmp = $null`,
  `      try {`,
  `        if ($z.sid -and (Test-Path ('Registry::HKEY_USERS\\' + $z.sid))) { $hive = 'Registry::HKEY_USERS\\' + $z.sid }`,
  `        elseif (Test-Path (Join-Path $z.prof 'NTUSER.DAT')) {`,
  `          $tmp = 'SKFLANG_' + ([guid]::NewGuid().ToString('N').Substring(0,8))`,
  `          reg load ('HKU\\' + $tmp) (Join-Path $z.prof 'NTUSER.DAT') *> $null`,
  `          if (Test-Path ('Registry::HKEY_USERS\\' + $tmp)) { $hive = 'Registry::HKEY_USERS\\' + $tmp; $geladen += $tmp } else { $tmp = $null }`,
  `        }`,
  `        if (-not $hive) { $fehler += ($z.name + ': Profil nicht ladbar'); continue }`,
  `        Set-SkfDeutsch $hive`,
  `        $ok++`,
  `      } catch { $fehler += ($z.name + ': ' + $_.Exception.Message) }`,
  `      finally { if ($tmp) { [gc]::Collect(); Start-Sleep -Milliseconds 200; reg unload ('HKU\\' + $tmp) *> $null; $geladen = $geladen | Where-Object { $_ -ne $tmp } } }`,
  `    }`,
  `    $t = "$ok von " + $ziele.Count + ' Profil(e) auf Deutsch'`,
  `    if ($fehler.Count) { $t += ' · ' + ($fehler -join '; ') }`,
  `    Add-Res 'Benutzerprofile (inkl. kuenftige)' ($fehler.Count -eq 0) $t`,
  `  } catch { Add-Res 'Benutzerprofile (inkl. kuenftige)' $false $_.Exception.Message }`,

  `} finally {`,
  `  foreach ($g in $geladen) { try { [gc]::Collect(); reg unload ('HKU\\' + $g) *> $null } catch { } }`,
  `}`,
  `@($res) | Select-Object name,ok,text | ConvertTo-Json -Depth 4 -Compress`,
].join('\n')

interface RawStep { name?: string; ok?: boolean; text?: string }

/**
 * Stellt den PC vollständig auf Deutsch: Sprachpaket, System-Gebietsschema, Default-Profil
 * (= alle künftigen Anmeldungen), Anmeldebildschirm sowie alle bereits vorhandenen Profile
 * inkl. Office-Anzeigesprache. Nach dem Lauf ist eine Neuanmeldung nötig, für das
 * System-Gebietsschema ein Neustart.
 */
export async function setGermanEverywhere(host: string): Promise<LanguageResult> {
  const h = (host || '').trim()
  if (!h) return { ok: false, steps: [], text: 'Kein Hostname' }
  const up = await ensureWinRM(h)
  if (!up) return { ok: false, steps: [], text: 'WinRM nicht erreichbar' }
  const script = [
    `try {`,
    `  $o = Invoke-Command -ComputerName '${psq(h)}' -ErrorAction Stop -ArgumentList '' -ScriptBlock {`,
    INNER_PS,
    `  }`,
    `  Write-Output ([string]$o)`,
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
  ].join('\n')
  try {
    // Install-Language kann mehrere Minuten dauern (Download/DISM) → großzügiger Rahmen.
    const r = await api().runPowerShell(script, 30 * 60 * 1000)
    const t = (r.stdout ?? '').trim()
    if (!t || t.startsWith('ERR:')) return { ok: false, steps: [], text: t.replace(/^ERR:/, '') || 'keine Antwort' }
    const m = t.match(/[[{][\s\S]*[\]}]/)
    if (!m) return { ok: false, steps: [], text: t.slice(0, 200) }
    const parsed = JSON.parse(m[0]) as RawStep[] | RawStep
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    const steps: LanguageStep[] = arr.map(s => ({ name: String(s.name || ''), ok: !!s.ok, text: String(s.text || '') }))
    const fehler = steps.filter(s => !s.ok)
    return {
      ok: fehler.length === 0,
      steps,
      text: fehler.length === 0
        ? `${steps.length} Ebenen auf Deutsch · Neuanmeldung nötig (System-Gebietsschema erst nach Neustart)`
        : `${fehler.length} von ${steps.length} Ebenen fehlgeschlagen: ${fehler.map(f => f.name).join(', ')}`,
    }
  } catch (e) { return { ok: false, steps: [], text: e instanceof Error ? e.message : String(e) } }
}
