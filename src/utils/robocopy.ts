// ── robocopy sicher aufrufen ─────────────────────────────────────────────────
// In manchen Sitzungen findet PowerShell `robocopy` nicht über den PATH („Die Benennung
// robocopy wurde nicht als Name eines Cmdlet … erkannt"). Passiert real vorgekommen beim
// EuroPAR-Sichern: der Ordner wurde angelegt, die Kopie fiel aus. Deshalb wird die exe
// hier immer über einen absoluten Pfad gesucht — inklusive Sysnative-Umweg für 32-Bit-
// Prozesse auf 64-Bit-Windows — und notfalls durch Copy-Item ersetzt.
//
// `Copy-SkfTree $quelle $ziel` liefert einen robocopy-artigen Exit-Code zurück:
//   < 8 = in Ordnung (0 = nichts zu tun, 1 = kopiert) · >= 8 = Fehler.
// Kopiert wird additiv (/E) — am Ziel wird nie etwas gelöscht.

export const ROBOCOPY_PS = [
  `function Get-SkfRobocopy {`,
  `  $kand = New-Object System.Collections.ArrayList`,
  // 32-Bit-Prozess auf 64-Bit-Windows: System32 wird nach SysWOW64 umgeleitet, dort
  // liegt robocopy.exe NICHT. Sysnative führt am Umleiter vorbei.
  `  if ((-not [Environment]::Is64BitProcess) -and [Environment]::Is64BitOperatingSystem) { [void]$kand.Add((Join-Path $env:SystemRoot 'Sysnative\\robocopy.exe')) }`,
  `  if ($env:SystemRoot) { [void]$kand.Add((Join-Path $env:SystemRoot 'System32\\robocopy.exe')) }`,
  `  if ($env:SystemRoot) { [void]$kand.Add((Join-Path $env:SystemRoot 'SysWOW64\\robocopy.exe')) }`,
  `  [void]$kand.Add('C:\\Windows\\System32\\robocopy.exe')`,
  `  foreach ($p in $kand) { if ($p -and (Test-Path -LiteralPath $p)) { return $p } }`,
  `  $c = Get-Command robocopy.exe -ErrorAction SilentlyContinue`,
  `  if ($c) { return $c.Source }`,
  `  return $null`,
  `}`,
  `function Copy-SkfTree($quelle, $ziel) {`,
  `  if (-not (Test-Path -LiteralPath $ziel)) { New-Item -ItemType Directory -Force -Path $ziel | Out-Null }`,
  `  $exe = Get-SkfRobocopy`,
  `  if ($exe) {`,
  `    & $exe $quelle $ziel /E /Z /XJ /R:1 /W:2 /MT:8 /NP /NFL /NDL /NJH /NJS | Out-Null`,
  `    return $LASTEXITCODE`,
  `  }`,
  // Notnagel ohne robocopy: langsamer, aber ebenfalls additiv und ohne Löschen.
  `  try {`,
  `    Copy-Item -LiteralPath (Join-Path $quelle '*') -Destination $ziel -Recurse -Force -ErrorAction Stop`,
  `    return 1`,
  `  } catch { return 16 }`,
  `}`,
  // Eine EINZELNE Datei in einen Ordner kopieren (Dateiname bleibt erhalten). Für große
  // Installer wichtig: robocopy /Z kann eine abgebrochene Übertragung fortsetzen, Copy-Item
  // fängt von vorn an. Gleicher Rückgabewert wie Copy-SkfTree (< 8 = in Ordnung).
  //
  // Split-Path ist hier bewusst NICHT verwendet: `-LiteralPath` zusammen mit `-Parent`
  // bzw. `-Leaf` ist in PowerShell 5.1 mehrdeutig und bricht mit „AmbiguousParameterSet"
  // ab (lokal nachgestellt) — deshalb die .NET-Pfadfunktionen.
  `function Copy-SkfFile($quellDatei, $zielOrdner) {`,
  `  if (-not (Test-Path -LiteralPath $zielOrdner)) { New-Item -ItemType Directory -Force -Path $zielOrdner | Out-Null }`,
  `  $ordner = [System.IO.Path]::GetDirectoryName($quellDatei)`,
  `  $name   = [System.IO.Path]::GetFileName($quellDatei)`,
  `  $exe = Get-SkfRobocopy`,
  `  if ($exe) {`,
  `    & $exe $ordner $zielOrdner $name /Z /R:1 /W:2 /NP /NFL /NDL /NJH /NJS | Out-Null`,
  `    return $LASTEXITCODE`,
  `  }`,
  `  try { Copy-Item -LiteralPath $quellDatei -Destination $zielOrdner -Force -ErrorAction Stop; return 1 } catch { return 16 }`,
  `}`,
].join('\n')
