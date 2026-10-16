// ── Outlook-Profil: Aufbau der Postfach-Liste auslesen (NUR LESEN) ──────────
//
// Hintergrund: Postfächer werden hier im Haus über
//   Kontoeinstellungen → Weitere Einstellungen → Erweitert → „Zusätzlich diese
//   Postfächer öffnen"
// eingebunden. Das ist NICHT AutoMapping, sondern eine Liste im Outlook-PROFIL.
//
// Diese Liste steckt in der Registry unter dem Exchange-Konto des Profils. In welchem
// Wert genau, hängt von der Outlook-Version ab, und die Werte heißen dort nach
// MAPI-Eigenschaftskennungen (Hex), nicht nach Klartext. Ein falsch geschriebener Wert
// macht ein Profil unbrauchbar — deshalb wird hier erst GELESEN und der Aufbau
// berichtet, bevor überhaupt etwas geschrieben wird.
//
// Dieses Modul schreibt nichts. Es öffnet die Profile eines Ziel-PCs über WinRM
// (gleicher Weg wie outlookMailboxes.ts) und meldet, welcher Wert die bekannten
// Postfachnamen enthält und wie er aufgebaut ist.

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'

function psq(s: string): string { return s.replace(/'/g, "''") }

export interface ProfilTreffer {
  hive: string          // Benutzer-SID
  pfad: string          // Registry-Pfad ab „Profiles\"
  wert: string          // Name des Registry-Werts (MAPI-Kennung in Hex)
  typ: string           // REG_BINARY / REG_SZ / REG_MULTI_SZ …
  laenge: number        // Bytes bzw. Zeichen
  inhalt: string        // lesbar gemachter Inhalt (Nullbytes als ·)
}

export interface ProfilAufbau {
  ok: boolean
  profile: string[]           // gefundene Profilnamen
  treffer: ProfilTreffer[]    // Werte, die den Suchbegriff enthalten
  nachbarn: string[]          // alle Wertnamen der Schlüssel mit Treffern (zur Einordnung)
  fehler?: string
  rohtext: string             // alles als Text — zum Kopieren und Weitergeben
}

/**
 * Liest den Profilaufbau eines Ziel-PCs und sucht darin nach `suchbegriff`
 * (z. B. dem Namen eines eingebundenen Postfachs).
 */
export async function leseProfilAufbau(host: string, suchbegriff: string): Promise<ProfilAufbau> {
  const leer: ProfilAufbau = { ok: false, profile: [], treffer: [], nachbarn: [], rohtext: '' }
  const h = (host || '').trim()
  const s = (suchbegriff || '').trim()
  if (!h) return { ...leer, fehler: 'Kein Ziel-PC angegeben.' }
  if (!s) return { ...leer, fehler: 'Kein Suchbegriff angegeben — nimm den Namen eines Postfachs, das dort eingebunden ist.' }

  try {
    const rm = await ensureWinRM(h)
    if (!rm) return { ...leer, fehler: `${h} ist über WinRM nicht erreichbar.` }
  } catch (e) {
    return { ...leer, fehler: `WinRM-Aktivierung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` }
  }

  const inner = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$suche = '${psq(s)}'`,
    `$profile = @()`,
    `$treffer = @()`,
    `$nachbarn = @()`,
    // Geladene Benutzer-Hives durchgehen (wie beim Auslesen der Postfächer).
    `$hives = @(Get-ChildItem 'registry::HKEY_USERS' -EA SilentlyContinue | Where-Object { $_.PSChildName -like 'S-1-5-21-*' -and $_.PSChildName -notlike '*_Classes' })`,
    `foreach ($hv in $hives) {`,
    `  foreach ($ver in @('16.0','15.0')) {`,
    `    $basis = "registry::HKU\\$($hv.PSChildName)\\Software\\Microsoft\\Office\\$ver\\Outlook\\Profiles"`,
    `    if (-not (Test-Path $basis)) { continue }`,
    `    foreach ($prof in @(Get-ChildItem $basis -EA SilentlyContinue)) { $profile += ($ver + ' / ' + $prof.PSChildName) }`,
    `    foreach ($k in @(Get-ChildItem $basis -Recurse -EA SilentlyContinue)) {`,
    `      $p = Get-ItemProperty $k.PSPath -EA SilentlyContinue`,
    `      if ($null -eq $p) { continue }`,
    `      $kurzPfad = ($k.PSPath -replace '.*\\\\Profiles\\\\','')`,
    `      $trefferHier = $false`,
    `      foreach ($eig in @($p.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' })) {`,
    `        $w = $eig.Value`,
    `        $text = ''`,
    `        $typ = 'unbekannt'`,
    `        $laenge = 0`,
    `        if ($w -is [byte[]])        { $typ='REG_BINARY';   $laenge=$w.Length; $text=[System.Text.Encoding]::Unicode.GetString($w) }`,
    `        elseif ($w -is [string])    { $typ='REG_SZ';       $laenge=$w.Length; $text=$w }`,
    `        elseif ($w -is [string[]])  { $typ='REG_MULTI_SZ'; $laenge=$w.Count;  $text=($w -join ' ¶ ') }`,
    `        elseif ($w -is [int])       { $typ='REG_DWORD';    $laenge=4;         $text=[string]$w }`,
    `        else { continue }`,
    `        if ($text -and $text -like ('*' + $suche + '*')) {`,
    `          $trefferHier = $true`,
    `          $lesbar = ($text -replace "\`0", '·')`,
    `          if ($lesbar.Length -gt 400) { $lesbar = $lesbar.Substring(0,400) + ' …' }`,
    `          $treffer += [pscustomobject]@{ hive=$hv.PSChildName; pfad=$kurzPfad; wert=$eig.Name; typ=$typ; laenge=$laenge; inhalt=$lesbar }`,
    `        }`,
    `      }`,
    // Bei einem Treffer auch die Nachbarwerte melden — daran erkennt man, ob es der
    // Konto-Schlüssel oder ein eigener Provider-Unterschlüssel ist.
    `      if ($trefferHier) {`,
    `        $namen = @($p.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { $_.Name }) -join ', '`,
    `        $nachbarn += ($kurzPfad + '  →  ' + $namen)`,
    `      }`,
    `    }`,
    `  }`,
    `}`,
    // Kein Treffer? Dann trotzdem etwas Verwertbares liefern: die Postfachnamen könnten
    // dort als legacyExchangeDN statt als Klartext stehen. Deshalb ersatzweise ein
    // Verzeichnis der Werte je Profilschlüssel — Name, Typ und Länge genügen, um die
    // in Frage kommenden Werte zu erkennen.
    `if ($treffer.Count -eq 0) {`,
    `  foreach ($hv in $hives) {`,
    `    foreach ($ver in @('16.0','15.0')) {`,
    `      $basis = "registry::HKU\\$($hv.PSChildName)\\Software\\Microsoft\\Office\\$ver\\Outlook\\Profiles"`,
    `      if (-not (Test-Path $basis)) { continue }`,
    `      foreach ($k in @(Get-ChildItem $basis -Recurse -EA SilentlyContinue | Select-Object -First 120)) {`,
    `        $p = Get-ItemProperty $k.PSPath -EA SilentlyContinue`,
    `        if ($null -eq $p) { continue }`,
    `        $liste = @()`,
    `        foreach ($eig in @($p.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' })) {`,
    `          $w = $eig.Value`,
    `          $t = if ($w -is [byte[]]) { 'BIN:' + $w.Length } elseif ($w -is [string[]]) { 'MULTI:' + $w.Count } elseif ($w -is [string]) { 'SZ:' + $w.Length } elseif ($w -is [int]) { 'DWORD' } else { 'sonst' }`,
    `          $liste += ($eig.Name + '[' + $t + ']')`,
    `        }`,
    `        if ($liste.Count) { $nachbarn += (($k.PSPath -replace '.*\\\\Profiles\\\\','') + '  →  ' + ($liste -join ', ')) }`,
    `      }`,
    `    }`,
    `  }`,
    `}`,
    `@{ profile=@($profile | Select-Object -Unique); treffer=$treffer; nachbarn=@($nachbarn | Select-Object -Unique) } | ConvertTo-Json -Depth 5 -Compress`,
  ].join('\n')

  const script = `try { Invoke-Command -ComputerName '${psq(h)}' -ScriptBlock { ${inner} } -EA Stop } catch { Write-Output ('FEHLER:' + $_.Exception.Message) }`
  const r = await api().runPowerShell(script, 120000)
  const out = (r.stdout || '').trim()
  if (out.startsWith('FEHLER:')) return { ...leer, fehler: out.slice(7) }

  let j: { profile?: unknown; treffer?: unknown; nachbarn?: unknown } | null = null
  try {
    const i = out.indexOf('{'); const k = out.lastIndexOf('}')
    j = JSON.parse(i >= 0 && k > i ? out.slice(i, k + 1) : out)
  } catch { /* unten behandelt */ }
  if (!j) return { ...leer, fehler: r.stderr?.trim() || 'Antwort vom Ziel-PC nicht lesbar.' }

  const alsListe = <T,>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : v ? [v as T] : [])
  const profile = alsListe<string>(j.profile).map(String)
  const nachbarn = alsListe<string>(j.nachbarn).map(String)
  const treffer = alsListe<Record<string, unknown>>(j.treffer).map(t => ({
    hive: String(t.hive ?? ''), pfad: String(t.pfad ?? ''), wert: String(t.wert ?? ''),
    typ: String(t.typ ?? ''), laenge: Number(t.laenge ?? 0), inhalt: String(t.inhalt ?? ''),
  }))

  const rohtext = [
    `Ziel-PC: ${h}`,
    `Suchbegriff: ${s}`,
    ``,
    `Profile (${profile.length}):`,
    ...profile.map(p => `  ${p}`),
    ``,
    `Treffer (${treffer.length}):`,
    ...treffer.flatMap(t => [
      `  Wert ${t.wert} · ${t.typ} · ${t.laenge}`,
      `    Schlüssel: ${t.pfad}`,
      `    Inhalt:    ${t.inhalt}`,
    ]),
    ``,
    `Wertnamen der Schlüssel mit Treffern (${nachbarn.length}):`,
    ...nachbarn.map(n => `  ${n}`),
  ].join('\n')

  return { ok: true, profile, treffer, nachbarn, rohtext }
}
