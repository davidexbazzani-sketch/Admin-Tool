// ── Zscaler auf dem Ziel-PC öffnen ──────────────────────────────────────────
// Wird von zwei Stellen genutzt: Remote Doc (Kategorie „Zscaler") und Daylis.
// Deshalb steht der PowerShell-Baustein hier zentral.
//
// Zscaler ist eine GUI-Anwendung: über WinRM gestartet landet sie in Session 0 und
// ist für den Anwender unsichtbar. Der Start läuft daher als einmalige geplante
// Aufgabe im Kontext des ANGEMELDETEN Benutzers — dasselbe Muster wie beim
// Laufwerk-Mapping in dailyCommands.ts.
//
// Die Meldung kommt aus derselben Aufgabe zwei Sekunden nach dem Start: so ist die
// Reihenfolge garantiert (erst Fenster, dann Hinweis) und es braucht nur eine Aufgabe.

/** Verknüpfung aus dem Startmenü (alle Benutzer) — der übliche Weg, Zscaler zu starten. */
export const ZSCALER_LNK = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Zscaler\\Zscaler.lnk'

/** Hinweis an den Anwender, sobald das Fenster offen ist. */
export const ZSCALER_HINWEIS =
  'Zscaler wurde geöffnet.\n\n'
  + '1. Links auf „Private Access" klicken\n'
  + '2. Rechts bei „Authentication Status" auf „Authenticate Early" klicken\n'
  + '3. Anschließend den Anweisungen auf dem Bildschirm folgen (Anmeldung).'

/** Wartezeit zwischen Start und Hinweis — das Fenster soll vorher oben sein. */
const WARTE_SEKUNDEN = 2

function b64Utf16(s: string): string {
  // UTF-16LE → Base64, passend für powershell.exe -EncodedCommand
  let bin = ''
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); bin += String.fromCharCode(c & 0xff, (c >> 8) & 0xff) }
  return btoa(bin)
}

/**
 * Das Skript, das AUF dem Ziel-PC läuft (als Inhalt eines Invoke-Command-ScriptBlocks).
 * Gibt eine Zeile `RES:OK:<Benutzer>`, `RES:NOUSER`, `RES:NOTFOUND` oder `RES:ERR:<Text>`
 * zurück.
 */
export function buildZscalerOpenInner(): string {
  // Der Hinweis wird als Base64 durchgereicht: er enthält Umlaute, Anführungszeichen und
  // Zeilenumbrüche und müsste sonst durch mehrere Quoting-Ebenen (JS → PS → Task) hindurch.
  const hinweisB64 = b64Utf16(ZSCALER_HINWEIS)
  const innerCmd = [
    `Start-Sleep -Seconds ${WARTE_SEKUNDEN}`,
    `[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')`,
    `$t = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('${hinweisB64}'))`,
    `[System.Windows.Forms.MessageBox]::Show($t, 'Zscaler', 'OK', 'Information') | Out-Null`,
  ].join('; ')

  return [
    `$result = 'ERR:Skript unvollstaendig'`,
    `try {`,
    // ── Starter finden: erst die Startmenü-Verknüpfung, sonst die exe suchen ──
    `  $ziel = '${ZSCALER_LNK.replace(/'/g, "''")}'`,
    `  if (-not (Test-Path -LiteralPath $ziel)) {`,
    `    $exe = Get-ChildItem 'C:\\Program Files\\Zscaler','C:\\Program Files (x86)\\Zscaler' -Filter 'ZSATray.exe' -Recurse -EA SilentlyContinue | Select-Object -First 1`,
    `    if ($exe) { $ziel = $exe.FullName } else { $ziel = $null }`,
    `  }`,
    `  if (-not $ziel) { Write-Output 'RES:NOTFOUND'; return }`,
    // ── Angemeldeten Benutzer ermitteln (GUI braucht dessen Sitzung) ──────────
    `  $user = $null`,
    `  try { $cs = Get-CimInstance Win32_ComputerSystem -EA Stop; if ($cs.UserName) { $user = $cs.UserName } } catch {}`,
    `  if (-not $user) {`,
    `    try {`,
    `      $qr = @(quser 2>&1) | Where-Object { "$_" -and "$_" -notmatch '^\\s*USERNAME|^\\s*BENUTZERNAME' }`,
    `      $line = $qr | Where-Object { "$_" -match 'Active|Aktiv' } | Select-Object -First 1`,
    `      if (-not $line) { $line = $qr | Select-Object -First 1 }`,
    `      if ($line) { $p = ("$line" -replace '^[> ]+','') -split '\\s{2,}'; $c = $p[0]; if ($c -and $c -notmatch '\\\\') { $c = "$env:USERDOMAIN\\$c" }; $user = $c }`,
    `    } catch {}`,
    `  }`,
    `  if (-not $user) {`,
    `    try { $ep = @(Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -EA Stop) | Select-Object -First 1; if ($ep) { $ow = Invoke-CimMethod -InputObject $ep -MethodName GetOwner -EA Stop; if ($ow.User) { $user = "$($ow.Domain)\\$($ow.User)" } } } catch {}`,
    `  }`,
    `  if (-not $user) { Write-Output 'RES:NOUSER'; return }`,
    // ── Einmalige Aufgabe im Benutzerkontext: starten, warten, Hinweis zeigen ──
    `  $taskName = 'ITAdminZscaler_' + (Get-Date -Format 'yyyyMMddHHmmssfff')`,
    `  try {`,
    `    $arg = '-NoProfile -WindowStyle Hidden -EncodedCommand ${b64Utf16(innerCmd)}'`,
    `    $a1 = New-ScheduledTaskAction -Execute 'explorer.exe' -Argument ('"' + $ziel + '"')`,
    `    $a2 = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg`,
    `    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2)`,
    `    Register-ScheduledTask -TaskName $taskName -Action @($a1,$a2) -Trigger $trigger -User $user -Force | Out-Null`,
    `    Start-ScheduledTask -TaskName $taskName`,
    `    Start-Sleep -Seconds 6`,
    `    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -EA SilentlyContinue`,
    `    $result = 'OK:' + $user`,
    `  } catch { $result = 'ERR:Aufgabe fehlgeschlagen: ' + $_.Exception.Message }`,
    `} catch { $result = 'ERR:' + $_.Exception.Message }`,
    `Write-Output ('RES:' + $result)`,
  ].join('\n')
}

/** Antwortzeile des Ziel-PCs in einen verständlichen Satz übersetzen. */
export function deuteZscalerAntwort(stdout: string): { ok: boolean; text: string } {
  const zeile = (stdout || '').split(/\r?\n/).map(l => l.trim()).find(l => l.startsWith('RES:'))
  if (!zeile) return { ok: false, text: 'Keine Antwort vom Ziel-PC' }
  const body = zeile.slice(4)
  if (body === 'NOUSER') return { ok: false, text: 'Kein Benutzer am PC angemeldet — Zscaler kann nur in einer Benutzersitzung geöffnet werden.' }
  if (body === 'NOTFOUND') return { ok: false, text: 'Zscaler wurde auf dem PC nicht gefunden (weder Startmenü-Verknüpfung noch ZSATray.exe).' }
  if (body.startsWith('ERR:')) return { ok: false, text: body.slice(4) }
  if (body.startsWith('OK:')) return { ok: true, text: `Zscaler geöffnet, Hinweis angezeigt (Benutzer: ${body.slice(3)})` }
  return { ok: false, text: body || 'Zscaler konnte nicht geöffnet werden' }
}
