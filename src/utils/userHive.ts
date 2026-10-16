// ── Registry-Hive des Ziel-Benutzers auf einem entfernten PC ─────────────────
// Gemeinsamer PowerShell-Baustein für alle Aktionen, die etwas im HKCU-Bereich eines
// ANDEREN Benutzers schreiben müssen (Umgebungsvariablen, Office-Sprache, Intranet-
// zone …). Über WinRM ist HKCU immer das Profil des Admin-Kontos der Fernsitzung —
// deshalb wird stattdessen HKU\<SID> des Zielbenutzers angesprochen. Ist niemand
// angemeldet, wird dessen NTUSER.DAT temporär geladen und wieder entladen.
// Muster aus src/swCheck/applyFix.ts. [[setup_scripts_feature]]

/**
 * Setzt `$uHive` (z. B. 'Registry::HKEY_USERS\S-1-5-21-…') und `$out.user`, oder lässt
 * `$uHive` auf $null, wenn kein Profil gefunden wurde. Erwartet die Variablen
 * `$corp` (Corp-ID, darf leer sein), `$out` (ordered hashtable mit user/hiveLoaded)
 * sowie `$uTmp`/`$uHiveLoaded` (für das Entladen im finally).
 * Reihenfolge der Kandidaten: Corp-ID-Profil → angemeldeter Benutzer → zuletzt benutztes.
 */
export const RESOLVE_USER_HIVE_PS = [
  `$plist = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList'`,
  `$cands = @()`,
  `foreach ($k in (Get-ChildItem $plist -EA SilentlyContinue)) {`,
  `  $sid = $k.PSChildName`,
  `  if ($sid -notmatch '^S-1-5-21') { continue }`,
  `  $prof = (Get-ItemProperty $k.PSPath -EA SilentlyContinue).ProfileImagePath`,
  `  if (-not $prof) { continue }`,
  `  $leaf = Split-Path $prof -Leaf`,
  `  if ($leaf -match '^(Public|Default|Default User|defaultuser0|All Users|Administrator)$') { continue }`,
  `  $lw = 0`,
  `  try { $lw = (Get-Item (Join-Path $prof 'NTUSER.DAT') -Force -EA SilentlyContinue).LastWriteTime.Ticks } catch { }`,
  `  $cands += [pscustomobject]@{ sid=$sid; prof=$prof; leaf=$leaf; lw=$lw }`,
  `}`,
  `$ziel = $null`,
  `if ($corp) { $ziel = $cands | Where-Object { $_.leaf -ieq $corp } | Select-Object -First 1 }`,
  `if (-not $ziel) {`,
  `  $ln = (Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue).UserName`,
  `  if ($ln) { $lu = ($ln -split '\\\\')[-1]; $ziel = $cands | Where-Object { $_.leaf -ieq $lu } | Select-Object -First 1 }`,
  `}`,
  `if (-not $ziel) { $ziel = $cands | Sort-Object lw -Descending | Select-Object -First 1 }`,
  `$uHive = $null`,
  `if ($ziel) {`,
  `  $out.user = $ziel.leaf`,
  `  if (Test-Path ('Registry::HKEY_USERS\\' + $ziel.sid)) { $uHive = 'Registry::HKEY_USERS\\' + $ziel.sid }`,
  `  elseif (Test-Path (Join-Path $ziel.prof 'NTUSER.DAT')) {`,
  `    $uTmp = 'SKFHIVE_' + ($ziel.sid -replace '[^0-9A-Za-z]','')`,
  `    reg load ('HKU\\' + $uTmp) (Join-Path $ziel.prof 'NTUSER.DAT') *> $null`,
  `    if (Test-Path ('Registry::HKEY_USERS\\' + $uTmp)) { $uHive = 'Registry::HKEY_USERS\\' + $uTmp; $uHiveLoaded = $true }`,
  `  }`,
  `}`,
  `$out.hiveLoaded = $uHiveLoaded`,
].join('\n')

/** Gegenstück fürs `finally`: entlädt eine zuvor geladene NTUSER.DAT wieder. */
export const UNLOAD_USER_HIVE_PS =
  `if ($uHiveLoaded -and $uTmp) { [gc]::Collect(); Start-Sleep -Milliseconds 300; reg unload ('HKU\\' + $uTmp) *> $null }`
