// ══ Outlook-Aktionen per PowerShell (Termine + Postfach-Scan) ═══════════════════
// Gleiches Prinzip wie outlookMailer: Skript läuft per Scheduled Task in der Sitzung
// des angemeldeten Benutzers (Outlook-COM ist nur dort erreichbar). Ein- und Ausgabe als
// UTF-8-JSON-Dateien — keine Texte im Skript, keine Kodierungsprobleme (Memory
// outlook_mail_encoding). Ein VBS-Starter ruft PowerShell VERSTECKT auf (Fensterstil 0).
//
// Aktionen:
//   meeting-create  → Besprechungsanfrage senden (anzeigen: true = nur im Outlook-Fenster
//                     öffnen, Benutzer sendet selbst), liefert entryId/globalId
//   meeting-update  → bestehende Besprechung (entryId) ändern + Update an Teilnehmer
//   meeting-cancel  → Absage an Teilnehmer + aus dem eigenen Kalender löschen
//   scan            → Posteingänge (eigener + freigegebene, z. B. IT-Support) nach Mails/
//                     Besprechungsantworten bestimmter Absender durchsuchen, inkl. der
//                     exakten Zeiten aus Outlook „Neue Zeit vorschlagen"

import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { SCHTASKS, CSCRIPT, WORK_DIR, getDesktopUser, uid, writeVbs, ensureWorkDir } from './outlookMailer'

// Nur ASCII im Skript (PS 5.1 + BOM sicher). Alle Texte kommen aus der Eingabe-JSON.
const OUTLOOK_PS = String.raw`
param([string]$EinPfad, [string]$AusPfad)
$ErrorActionPreference = 'Stop'
function Schreib($o) { ConvertTo-Json -InputObject $o -Depth 6 -Compress | Out-File -FilePath $AusPfad -Encoding UTF8 }
try {
  $in = Get-Content -Raw -Encoding UTF8 -Path $EinPfad | ConvertFrom-Json
  $ol = New-Object -ComObject Outlook.Application
  $ns = $ol.GetNamespace('MAPI')
  $inv = [System.Globalization.CultureInfo]::InvariantCulture
  function Zeit($s) { [datetime]::ParseExact([string]$s, 'yyyy-MM-dd HH:mm', $inv) }
  switch ([string]$in.aktion) {
    'meeting-create' {
      $a = $ol.CreateItem(1)
      $a.MeetingStatus = 1
      $a.Subject = [string]$in.subject
      $a.Body = [string]$in.body
      $a.Location = [string]$in.location
      $a.Start = Zeit $in.start
      $a.End = Zeit $in.end
      $a.ReminderSet = $true
      $a.ReminderMinutesBeforeStart = 30
      foreach ($e in @($in.required)) { if ($e) { $r = $a.Recipients.Add([string]$e); $r.Type = 1 } }
      foreach ($e in @($in.optional)) { if ($e) { $r = $a.Recipients.Add([string]$e); $r.Type = 2 } }
      [void]$a.Recipients.ResolveAll()
      $a.Save()
      $eid = $a.EntryID; $gid = $a.GlobalAppointmentID
      # anzeigen = Outlook-Fenster oeffnen, der Benutzer prueft und sendet selbst
      if ($in.anzeigen) { $a.Display($false) } else { $a.Send() }
      Schreib @{ ok = $true; entryId = $eid; globalId = $gid }
    }
    'meeting-update' {
      $a = $ns.GetItemFromID([string]$in.entryId)
      if ($in.start) { $a.Start = Zeit $in.start }
      if ($in.end) { $a.End = Zeit $in.end }
      if ($in.location) { $a.Location = [string]$in.location }
      if ($in.subject) { $a.Subject = [string]$in.subject }
      if ($in.body) { $a.Body = [string]$in.body }
      $a.Save(); $a.Send()
      Schreib @{ ok = $true; entryId = [string]$a.EntryID }
    }
    'meeting-cancel' {
      $a = $ns.GetItemFromID([string]$in.entryId)
      $a.MeetingStatus = 5
      if ($in.body) { $a.Body = [string]$in.body }
      $a.Send()
      try { $a.Delete() } catch {}
      Schreib @{ ok = $true }
    }
    'scan' {
      $since = (Get-Date).AddDays(-[int]$in.tage)
      $absender = @{}; foreach ($x in @($in.absender)) { if ($x) { $absender[([string]$x).ToLower()] = $true } }
      $ordner = New-Object System.Collections.ArrayList
      [void]$ordner.Add(@('eigenes Postfach', $ns.GetDefaultFolder(6)))
      foreach ($adr in @($in.postfaecher)) {
        if (-not $adr) { continue }
        try { $rc = $ns.CreateRecipient([string]$adr); [void]$rc.Resolve(); [void]$ordner.Add(@([string]$adr, $ns.GetSharedDefaultFolder($rc, 6))) }
        catch { [void]$ordner.Add(@([string]$adr, $null)) }
      }
      $treffer = New-Object System.Collections.ArrayList
      $fehler = New-Object System.Collections.ArrayList
      foreach ($o in $ordner) {
        $name = $o[0]; $f = $o[1]
        if (-not $f) { [void]$fehler.Add("$name nicht erreichbar (nicht im Outlook-Profil oder keine Berechtigung)"); continue }
        $items = $f.Items; $items.Sort('[ReceivedTime]', $true)
        $n = 0
        foreach ($it in $items) {
          $n++; if ($n -gt [int]$in.maxItems) { break }
          try {
            if ($it.ReceivedTime -lt $since) { break }
            $cls = [int]$it.Class
            if (@(43, 53, 55, 56, 57) -notcontains $cls) { continue }
            $adr = ''
            try { if ($it.SenderEmailType -eq 'EX') { $adr = $it.Sender.GetExchangeUser().PrimarySmtpAddress } else { $adr = $it.SenderEmailAddress } } catch { $adr = [string]$it.SenderEmailAddress }
            $adr = ([string]$adr).ToLower()
            if (-not $absender.ContainsKey($adr)) { continue }
            $vs = ''; $ve = ''
            if ($cls -ge 55) {
              try {
                $pa = $it.PropertyAccessor
                $ps = $pa.GetProperty('http://schemas.microsoft.com/mapi/id/{00062002-0000-0000-C000-000000000046}/0x8250')
                $pe = $pa.GetProperty('http://schemas.microsoft.com/mapi/id/{00062002-0000-0000-C000-000000000046}/0x8251')
                if ($ps -and $ps.Year -gt 2000) { $vs = $pa.UTCToLocalTime($ps).ToString('yyyy-MM-dd HH:mm'); $ve = $pa.UTCToLocalTime($pe).ToString('yyyy-MM-dd HH:mm') }
              } catch {}
            }
            $body = [string]$it.Body; if ($body.Length -gt 4000) { $body = $body.Substring(0, 4000) }
            [void]$treffer.Add(@{ id = [string]$it.EntryID; postfach = $name; von = $adr; betreff = [string]$it.Subject; empfangen = $it.ReceivedTime.ToString('yyyy-MM-dd HH:mm'); klasse = $cls; text = $body; vorschlagStart = $vs; vorschlagEnde = $ve })
          } catch {}
        }
      }
      Schreib @{ ok = $true; treffer = @($treffer); fehler = @($fehler) }
    }
    default { Schreib @{ ok = $false; error = ('Unbekannte Aktion: ' + $in.aktion) } }
  }
} catch {
  Schreib @{ ok = $false; error = $_.Exception.Message }
}
`

export async function outlookAktion(eingabe: Record<string, unknown>, timeoutMs = 60000): Promise<Record<string, unknown>> {
  const id = uid()
  ensureWorkDir()
  const psPath = join(WORK_DIR, `ol_${id}.ps1`)
  const einPath = join(WORK_DIR, `ol_${id}_in.json`)
  const ausPath = join(WORK_DIR, `ol_${id}_out.json`)
  const vbsPath = join(WORK_DIR, `ol_${id}.vbs`)
  const taskName = `ITOutlook_${id}`
  try {
    writeFileSync(psPath, '\uFEFF' + OUTLOOK_PS, 'utf-8')
    writeFileSync(einPath, JSON.stringify(eingabe), 'utf-8')
    const ps = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const cmd = `"${ps}" -NoProfile -ExecutionPolicy Bypass -File "${psPath}" -EinPfad "${einPath}" -AusPfad "${ausPath}"`
    // Versteckt starten (Fensterstil 0) und auf das Ende warten (True)
    writeVbs(vbsPath, `CreateObject("WScript.Shell").Run "${cmd.replace(/"/g, '""')}", 0, True`)
    const desktopUser = getDesktopUser()
    execSync(`"${SCHTASKS}" /create /tn "${taskName}" /tr "\\"${CSCRIPT}\\" //nologo //B \\"${vbsPath}\\"" /sc once /st 00:00 /ru "${desktopUser}" /rl LIMITED /f`, { windowsHide: true, timeout: 15000 })
    execSync(`"${SCHTASKS}" /run /tn "${taskName}"`, { windowsHide: true, timeout: 15000 })
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (existsSync(ausPath)) {
        await new Promise(r => setTimeout(r, 300))   // Schreiben abschließen lassen
        const raw = readFileSync(ausPath, 'utf-8').replace(/^\uFEFF/, '').trim()
        try { return JSON.parse(raw) } catch { return { ok: false, error: 'Antwort von Outlook nicht lesbar' } }
      }
      await new Promise(r => setTimeout(r, 500))
    }
    return { ok: false, error: `Zeitüberschreitung (${Math.round(timeoutMs / 1000)} s) — Outlook hat nicht geantwortet` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    try { execSync(`"${SCHTASKS}" /delete /tn "${taskName}" /f`, { windowsHide: true, timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }) } catch { /* ok */ }
    setTimeout(() => {
      for (const p of [psPath, einPath, ausPath, vbsPath]) { try { if (existsSync(p)) unlinkSync(p) } catch { /* ok */ } }
    }, 5000)
  }
}

/** Nur fürs Testen/Parser-Check: das eingebettete Skript. */
export const OUTLOOK_PS_SKRIPT = OUTLOOK_PS
