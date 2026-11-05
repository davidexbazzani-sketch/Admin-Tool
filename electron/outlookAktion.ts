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
import { SCHTASKS, WSCRIPT, WORK_DIR, getDesktopUser, uid, writeVbs, ensureWorkDir } from './outlookMailer'

// Nur ASCII im Skript (PS 5.1 + BOM sicher). Alle Texte kommen aus der Eingabe-JSON.
const OUTLOOK_PS = String.raw`
param([string]$EinPfad, [string]$AusPfad)
$ErrorActionPreference = 'Stop'
# Antwort ATOMAR schreiben: erst Zwischendatei, dann in einem Schritt umbenennen - das Tool
# sieht die Datei erst, wenn sie vollstaendig ist. Kein Out-File (Zeilenbreite/Host-abhaengig).
function Schreib($o) {
  $json = ConvertTo-Json -InputObject $o -Depth 6 -Compress
  $tmp = $AusPfad + '.part'
  [System.IO.File]::WriteAllText($tmp, [string]$json, (New-Object System.Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $tmp -Destination $AusPfad -Force
}
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
    'meeting-find' {
      # Eigene, bereits angelegte Besprechung wiederfinden (gleicher Betreff + Startzeit +/- 1 Min.)
      # -> keine Doppel-Einladung; Rettung, falls die Antwort von meeting-create nicht ankam.
      $s = Zeit $in.start
      $filter = "[Start] >= '" + $s.AddMinutes(-1).ToString('g') + "' AND [Start] <= '" + $s.AddMinutes(1).ToString('g') + "'"
      $hit = $null
      foreach ($c in $ns.GetDefaultFolder(9).Items.Restrict($filter)) {
        try { if ([string]$c.Subject -eq [string]$in.subject -and [int]$c.MeetingStatus -eq 1) { $hit = $c } } catch {}
      }
      # PidLidFInvited (0x8229, PT_BOOLEAN): wurde die Einladung schon verschickt? (nur geoeffnet = $false)
      $gesendet = $true
      if ($hit) { try { $gesendet = [bool]$hit.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/id/{00062002-0000-0000-C000-000000000046}/8229000B') } catch {} }
      if ($hit) { Schreib @{ ok = $true; gefunden = $true; gesendet = $gesendet; entryId = [string]$hit.EntryID; globalId = [string]$hit.GlobalAppointmentID } }
      else { Schreib @{ ok = $true; gefunden = $false } }
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
      [void]$ordner.Add(@('eigener Posteingang', $ns.GetDefaultFolder(6)))
      # Outlook verarbeitet Besprechungsantworten oft automatisch und verschiebt sie in
      # 'Geloeschte Elemente" - dort liegen dann Zusagen/Kommentare ('bin um 8:30 da").
      [void]$ordner.Add(@('eigene Geloeschte Elemente', $ns.GetDefaultFolder(3)))
      foreach ($adr in @($in.postfaecher)) {
        if (-not $adr) { continue }
        try { $rc = $ns.CreateRecipient([string]$adr); [void]$rc.Resolve(); [void]$ordner.Add(@([string]$adr, $ns.GetSharedDefaultFolder($rc, 6))) }
        catch { [void]$ordner.Add(@([string]$adr, $null)) }
      }
      $treffer = New-Object System.Collections.ArrayList
      $fehler = New-Object System.Collections.ArrayList
      $info = New-Object System.Collections.ArrayList
      foreach ($o in $ordner) {
        $name = $o[0]; $f = $o[1]
        if (-not $f) { [void]$fehler.Add("$name nicht erreichbar (nicht im Outlook-Profil oder keine Berechtigung)"); continue }
        $items = $f.Items; $items.Sort('[ReceivedTime]', $true)
        $n = 0; $geprueft = 0; $passend = 0
        foreach ($it in $items) {
          $n++; if ($n -gt [int]$in.maxItems) { break }
          try {
            if ($it.ReceivedTime -lt $since) { break }
            $geprueft++
            $cls = [int]$it.Class
            # 43 Mail, 55-57 Besprechungsantworten. NICHT 53 (Besprechungsanfrage): das ist die
            # eigene Einladung (z. B. beim Test an sich selbst landet sie in Geloeschte Elemente)
            if (@(43, 55, 56, 57) -notcontains $cls) { continue }
            $adr = ''
            try { if ($it.SenderEmailType -eq 'EX') { $adr = $it.Sender.GetExchangeUser().PrimarySmtpAddress } else { $adr = $it.SenderEmailAddress } } catch { $adr = [string]$it.SenderEmailAddress }
            $adr = ([string]$adr).ToLower()
            # Besprechungsantworten (55-57) IMMER mitnehmen - Zuordnung macht das Tool
            # (Adresse ODER Name); normale Mails nur von bekannten Absendern
            if ($cls -lt 55 -and -not $absender.ContainsKey($adr)) { continue }
            $passend++
            $vs = ''; $ve = ''; $neueZeit = $false
            if ($cls -ge 55) {
              # Outlook "Neue Zeit vorschlagen" (auch "Ablehnen und neue Zeit vorschlagen"):
              # PidLidAppointmentProposedStartWhole/EndWhole (0x8250/0x8251, Typ PT_SYSTIME = 0040)
              # und PidLidAppointmentCounterProposal (0x8257, Typ PT_BOOLEAN = 000B).
              # Die Adresse braucht den Typ-Anhang (82500040) - ohne ihn wirft GetProperty.
              $basis = 'http://schemas.microsoft.com/mapi/id/{00062002-0000-0000-C000-000000000046}/'
              $pa = $it.PropertyAccessor
              try { $neueZeit = [bool]$pa.GetProperty($basis + '8257000B') } catch {}
              try {
                $ps = $pa.GetProperty($basis + '82500040')
                $pe = $pa.GetProperty($basis + '82510040')
                if ($ps -and ([datetime]$ps).Year -gt 2000) {
                  $vs = $pa.UTCToLocalTime($ps).ToString('yyyy-MM-dd HH:mm'); $ve = $pa.UTCToLocalTime($pe).ToString('yyyy-MM-dd HH:mm'); $neueZeit = $true
                }
              } catch {}
              # Betreff als zusaetzliches Zeichen ("Neue Zeit vorgeschlagen: ..." / "New Time Proposed: ...")
              if ([string]$it.Subject -match '^(Neue Zeit vorgeschlagen|New Time Proposed)') { $neueZeit = $true }
            }
            $body = [string]$it.Body; if ($body.Length -gt 4000) { $body = $body.Substring(0, 4000) }
            [void]$treffer.Add(@{ id = [string]$it.EntryID; postfach = $name; von = $adr; vonName = [string]$it.SenderName; betreff = [string]$it.Subject; empfangen = $it.ReceivedTime.ToString('yyyy-MM-dd HH:mm'); klasse = $cls; text = $body; vorschlagStart = $vs; vorschlagEnde = $ve; neueZeit = $neueZeit })
          } catch {}
        }
        [void]$info.Add("$name - $geprueft geprueft, $passend relevant")
      }
      Schreib @{ ok = $true; treffer = @($treffer); fehler = @($fehler); info = @($info) }
    }
    'status' {
      # Antwortstatus direkt am Termin im Kalender des Absenders: Outlook fuehrt pro
      # Teilnehmer MeetingResponseStatus (2 = mit Vorbehalt, 3 = zugesagt, 4 = abgesagt),
      # auch wenn keine Antwort-Mail mehr im Posteingang liegt.
      $erg = New-Object System.Collections.ArrayList
      foreach ($t in @($in.termine)) {
        $a = $null
        try { $a = $ns.GetItemFromID([string]$t.entryId) } catch {}
        if (-not $a -and $t.globalId) {
          # Ersatz: im Kalender per GlobalAppointmentID suchen (Zeitraum um den Termin)
          try {
            $cal = $ns.GetDefaultFolder(9).Items
            $von = (Zeit $t.start).AddDays(-60); $bis = (Zeit $t.start).AddDays(60)
            $filter = "[Start] >= '" + $von.ToString('g') + "' AND [Start] <= '" + $bis.ToString('g') + "'"
            foreach ($c in $cal.Restrict($filter)) { if ($c.GlobalAppointmentID -eq [string]$t.globalId) { $a = $c; break } }
          } catch {}
        }
        if (-not $a) { [void]$erg.Add(@{ id = [string]$t.id; gefunden = $false }); continue }
        $antw = New-Object System.Collections.ArrayList
        foreach ($r in $a.Recipients) {
          $adr = ''
          try { $eu = $r.AddressEntry.GetExchangeUser(); if ($eu) { $adr = $eu.PrimarySmtpAddress } } catch {}
          if (-not $adr) { $adr = [string]$r.Address }
          [void]$antw.Add(@{ adresse = ([string]$adr).ToLower(); name = [string]$r.Name; typ = [int]$r.Type; status = [int]$r.MeetingResponseStatus })
        }
        [void]$erg.Add(@{ id = [string]$t.id; gefunden = $true; start = $a.Start.ToString('yyyy-MM-dd HH:mm'); ende = $a.End.ToString('yyyy-MM-dd HH:mm'); ort = [string]$a.Location; meetingStatus = [int]$a.MeetingStatus; antworten = @($antw) })
      }
      Schreib @{ ok = $true; termine = @($erg) }
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
    execSync(`"${SCHTASKS}" /create /tn "${taskName}" /tr "\\"${WSCRIPT}\\" //nologo //B \\"${vbsPath}\\"" /sc once /st 00:00 /ru "${desktopUser}" /rl LIMITED /f`, { windowsHide: true, timeout: 15000 })
    execSync(`"${SCHTASKS}" /run /tn "${taskName}"`, { windowsHide: true, timeout: 15000 })
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (existsSync(ausPath)) {
        // Datei wird atomar umbenannt (siehe Schreib) — trotzdem mehrfach versuchen, falls ein
        // Virenscanner o. Ä. sie kurz sperrt.
        let raw = ''
        for (let versuch = 0; versuch < 8; versuch++) {
          await new Promise(r => setTimeout(r, versuch ? 400 : 150))
          try { raw = readFileSync(ausPath, 'utf-8').replace(/^﻿/, '').trim() } catch { continue }
          try { return JSON.parse(raw) } catch { /* nochmal */ }
        }
        return { ok: false, unlesbar: true, error: `Antwort von Outlook nicht lesbar (${raw.length} Zeichen: ${raw.slice(0, 120) || 'leer'})` }
      }
      await new Promise(r => setTimeout(r, 500))
    }
    return { ok: false, error: `Zeitüberschreitung (${Math.round(timeoutMs / 1000)} s) — Outlook hat nicht geantwortet` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    try { execSync(`"${SCHTASKS}" /delete /tn "${taskName}" /f`, { windowsHide: true, timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }) } catch { /* ok */ }
    setTimeout(() => {
      for (const p of [psPath, einPath, ausPath, ausPath + '.part', vbsPath]) { try { if (existsSync(p)) unlinkSync(p) } catch { /* ok */ } }
    }, 5000)
  }
}

/** Nur fürs Testen/Parser-Check: das eingebettete Skript. */
export const OUTLOOK_PS_SKRIPT = OUTLOOK_PS
