// ── NIS2 Zugänge-Check: lokale Administratoren eines PCs live lesen und Einträge entziehen ──
// Liest die Gruppe „Administratoren“ (SID S-1-5-32-544, sprachunabhängig) per WinRM direkt vom PC –
// Benutzer, Gruppen, lokale Konten – und entfernt auf Wunsch genau EINEN Eintrag (per SID).
// Schutz: nie auf Servern; nie das eingebaute Administrator-Konto (Notfallzugang), keine System-
// konten, keine IT-Standard-/zentralen Workstation-Admin-Gruppen. Läuft unsichtbar (kein Fenster am
// Ziel-PC); die Änderung greift für den Nutzer ab der nächsten Anmeldung. Jeder Eingriff steht im
// Geräte-Dossier + Aktivitätsprotokoll (logDeviceAction) und – bei Personen – im Personen-Dossier.

import { api } from '../electronAPI'
import { isValidRemoteTarget } from '../utils/remoteTarget'
import { istBekannterServer } from './itAdminToolInstall'
import { logDeviceAction } from './deviceDossier'
import { logDossierAction } from './personDossier'
import { canon, isStandardAdminGroup, loadAccessResult, saveAccessResult } from './nis2Access'

export interface AdminEintrag {
  /** wie Windows ihn meldet, z. B. „CORP\BQ8069“ oder „DE5CG…\Administrator“ */
  name: string
  /** Teil hinter dem Backslash */
  leaf: string
  /** Domäne bzw. Computername vor dem Backslash */
  domaene: string
  klasse: 'Benutzer' | 'Gruppe' | 'unbekannt'
  /** AD / Lokal / ADSI (Rückfall) */
  quelle: string
  sid: string
  /** warum dieser Eintrag nicht entzogen wird – '' = entziehbar */
  schutz: string
}

const PS_QUELLE = 'NIS2 Zugänge-Check'
const psStr = (s: string) => "'" + String(s).replace(/'/g, "''") + "'"

/** Warum ein Eintrag NICHT entzogen werden darf – oder '' (rein, testbar). */
export function schutzGrund(e: { name: string; sid: string; klasse: string }, host: string): string {
  const [dom, leaf] = e.name.includes('\\') ? e.name.split('\\') : ['', e.name]
  const d = (dom || '').toUpperCase(), l = (leaf || '').trim()
  if (/-500$/.test(e.sid) || (d === canon(host) && l.toUpperCase() === 'ADMINISTRATOR')) return 'Eingebautes Administrator-Konto des PCs (Notfallzugang) – bleibt.'
  if (['BUILTIN', 'NT AUTHORITY', 'NT SERVICE'].includes(d) || /^S-1-5-(18|19|20)$/.test(e.sid)) return 'Systemkonto – bleibt.'
  if (isStandardAdminGroup(l) || /^S-1-5-21-.*-(512|519|518)$/.test(e.sid)) return 'IT-Standardgruppe (Domänen-Admins) – bleibt.'
  if (/workstation.?admin|wks.?admin|^eds_/i.test(l)) return 'Zentrale IT-Admin-Gruppe – nur über die zentrale IT ändern.'
  return ''
}

function alsEintrag(r: { Name?: string; Class?: string; Source?: string; Sid?: string }, host: string): AdminEintrag {
  const name = String(r.Name || '').trim()
  const [dom, leaf] = name.includes('\\') ? name.split('\\') : ['', name]
  const c = String(r.Class || '').toLowerCase()
  // ObjectClass ist sprachabhängig: „User/Group“ (EN) bzw. „Benutzer/Gruppe“ (DE)
  const klasse: AdminEintrag['klasse'] = (c === 'user' || c === 'benutzer') ? 'Benutzer' : (c === 'group' || c === 'gruppe') ? 'Gruppe' : 'unbekannt'
  const src = String(r.Source || '')
  const quelle = /activedirectory/i.test(src) ? 'AD' : /local/i.test(src) ? 'Lokal' : src || '—'
  const e = { name, leaf: leaf || name, domaene: dom || '', klasse, quelle, sid: String(r.Sid || '').trim(), schutz: '' }
  e.schutz = schutzGrund(e, host)
  return e
}

async function zielPruefen(host: string): Promise<string> {
  const h = (host || '').trim()
  if (!h || !isValidRemoteTarget(h)) return `„${h}“ ist kein gültiger PC-Name.`
  if (await istBekannterServer(h)) return `${h} steht in der Server-Liste – auf Servern ändert der Zugänge-Check nichts.`
  return ''
}

/** Alle Einträge der lokalen Administratoren-Gruppe eines PCs, live per WinRM. */
export async function liesAdministratoren(host: string): Promise<{ ok: boolean; eintraege: AdminEintrag[]; fehler?: string }> {
  const h = (host || '').trim()
  if (!h || !isValidRemoteTarget(h)) return { ok: false, eintraege: [], fehler: `„${h}“ ist kein gültiger PC-Name.` }
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `try {`,
    `  $r = Invoke-Command -ComputerName ${psStr(h)} -ErrorAction Stop -ScriptBlock {`,
    `    $res=@()`,
    `    try {`,
    `      Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction Stop | ForEach-Object {`,
    `        $res += [pscustomobject]@{ Name="$($_.Name)"; Class="$($_.ObjectClass)"; Source="$($_.PrincipalSource)"; Sid="$($_.SID.Value)" }`,
    `      }`,
    `    } catch {`,
    `      $gn=(New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')).Translate([System.Security.Principal.NTAccount]).Value.Split('\\')[1]`,
    `      $grp=[ADSI]("WinNT://./$gn,group")`,
    `      foreach ($m in @($grp.psbase.Invoke('Members'))) {`,
    `        $p=$m.GetType().InvokeMember('AdsPath','GetProperty',$null,$m,$null)`,
    `        $c=$m.GetType().InvokeMember('Class','GetProperty',$null,$m,$null)`,
    `        $sid=''; try { $b=$m.GetType().InvokeMember('objectSid','GetProperty',$null,$m,$null); $sid=(New-Object System.Security.Principal.SecurityIdentifier($b,0)).Value } catch {}`,
    `        $nm=($p -replace '^WinNT://','') -replace '/','\\'`,
    `        $res += [pscustomobject]@{ Name="$nm"; Class="$c"; Source='ADSI'; Sid="$sid" }`,
    `      }`,
    `    }`,
    `    $res`,
    `  }`,
    `  ConvertTo-Json -Compress -Depth 3 -InputObject @($r | Select-Object Name, Class, Source, Sid)`,
    `} catch { 'ERR:' + $_.Exception.Message }`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 90000, { quelle: PS_QUELLE, art: 'lesen' })
    const txt = (res.stdout ?? '').trim()
    if (!txt) return { ok: false, eintraege: [], fehler: res.timedOut ? 'Zeitüberschreitung – PC nicht erreichbar?' : 'Keine Antwort vom PC (offline oder WinRM gesperrt?).' }
    if (txt.startsWith('ERR:')) return { ok: false, eintraege: [], fehler: txt.slice(4).trim() || 'PC nicht erreichbar.' }
    const parsed = JSON.parse(txt)
    const arr = (Array.isArray(parsed) ? parsed : [parsed]).filter(x => x && x.Name)
    const eintraege = arr.map(r => alsEintrag(r, h))
      .sort((a, b) => (a.schutz ? 1 : 0) - (b.schutz ? 1 : 0) || a.klasse.localeCompare(b.klasse) || a.name.localeCompare(b.name))
    return { ok: true, eintraege }
  } catch (e) {
    return { ok: false, eintraege: [], fehler: e instanceof Error ? e.message : String(e) }
  }
}

export interface EntzugErgebnis { ok: boolean; meldung: string }

/**
 * Entfernt GENAU einen Eintrag (per SID, sonst per Name) aus den lokalen Administratoren des PCs
 * und prüft danach, ob er wirklich weg ist. Schreibt Dossier + Aktivitätsprotokoll und
 * aktualisiert den gespeicherten Scan-Stand, damit die Liste sofort stimmt.
 */
export async function entzieheAdmin(
  host: string, e: AdminEintrag, von: string, person?: { name: string; sam: string },
): Promise<EntzugErgebnis> {
  const sperre = await zielPruefen(host)
  if (sperre) return { ok: false, meldung: sperre }
  const schutz = schutzGrund(e, host)
  if (schutz) return { ok: false, meldung: schutz }
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `try {`,
    `  $o = Invoke-Command -ComputerName ${psStr(host.trim())} -ErrorAction Stop -ArgumentList ${psStr(e.sid)}, ${psStr(e.name)} -ScriptBlock {`,
    `    param($sid, $name)`,
    `    $ok=$false; $msg=''`,
    `    $ziel = if ($sid) { $sid } else { $name }`,
    `    try { Remove-LocalGroupMember -SID 'S-1-5-32-544' -Member $ziel -ErrorAction Stop; $ok=$true } catch { $msg="$($_.Exception.Message)" }`,
    `    if (-not $ok) {`,
    `      try {`,
    `        $gn=(New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')).Translate([System.Security.Principal.NTAccount]).Value.Split('\\')[1]`,
    `        $grp=[ADSI]("WinNT://./$gn,group")`,
    `        $pfad = if ($sid) { "WinNT://$sid" } else { 'WinNT://' + ($name -replace '\\\\','/') }`,
    `        $grp.Remove($pfad); $ok=$true`,
    `      } catch { $msg += ' | ' + $_.Exception.Message }`,
    `    }`,
    // Kontrolle: Gruppe neu lesen. Kann sie nicht gelesen werden, gilt das NICHT als „weg“ (geprueft=$false).
    `    $geprueft=$false; $noch=$false`,
    `    try {`,
    `      $mit = @(Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction Stop); $geprueft=$true`,
    `      $noch = @($mit | Where-Object { ($sid -and $_.SID.Value -eq $sid) -or ($_.Name -eq $name) }).Count -gt 0`,
    `    } catch {`,
    `      try {`,
    `        $gn=(New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')).Translate([System.Security.Principal.NTAccount]).Value.Split('\\')[1]`,
    `        $pf=@(([ADSI]("WinNT://./$gn,group")).psbase.Invoke('Members') | ForEach-Object { $_.GetType().InvokeMember('AdsPath','GetProperty',$null,$_,$null) })`,
    `        $geprueft=$true; $nm='WinNT://' + ($name -replace '\\\\','/')`,
    `        $noch = @($pf | Where-Object { $_ -eq $nm -or ($sid -and $_ -eq "WinNT://$sid") }).Count -gt 0`,
    `      } catch {}`,
    `    }`,
    `    [pscustomobject]@{ ok=$ok; noch=$noch; geprueft=$geprueft; msg=$msg }`,
    `  }`,
    `  ConvertTo-Json -Compress -InputObject ($o | Select-Object ok, noch, geprueft, msg)`,
    `} catch { 'ERR:' + $_.Exception.Message }`,
  ].join('\n')
  let ok = false, meldung = ''
  try {
    const res = await api().runPowerShell(script, 90000, { quelle: PS_QUELLE, art: 'aendern' })
    const txt = (res.stdout ?? '').trim()
    if (!txt) meldung = res.timedOut ? 'Zeitüberschreitung – PC nicht erreichbar?' : 'Keine Antwort vom PC.'
    else if (txt.startsWith('ERR:')) meldung = txt.slice(4).trim() || 'PC nicht erreichbar.'
    else {
      const r = JSON.parse(txt) as { ok?: boolean; noch?: boolean; geprueft?: boolean; msg?: string }
      const grund = r.msg ? ` (${r.msg.trim()})` : ''
      // Erfolg NUR, wenn das Entfernen geklappt hat UND die Kontrolle den Eintrag nicht mehr findet
      if (!r.ok) meldung = `Entfernen fehlgeschlagen${grund}.`
      else if (!r.geprueft) meldung = 'Entfernt gemeldet, aber die Kontrolle konnte die Gruppe nicht lesen – bitte „Neu vom PC lesen“.'
      else if (r.noch) meldung = `Eintrag ist noch vorhanden${grund}.`
      else { ok = true; meldung = `${e.name} ist auf ${host} kein lokaler Admin mehr. Gilt ab der nächsten Anmeldung.` }
    }
  } catch (x) { meldung = x instanceof Error ? x.message : String(x) }

  const text = ok
    ? `NIS2 Zugänge-Check: lokaler Admin-Zugang entzogen – ${e.name} (${e.klasse}) aus „Administratoren“ entfernt`
    : `NIS2 Zugänge-Check: Entzug von ${e.name} fehlgeschlagen – ${meldung}`
  await logDeviceAction(host, undefined, text, von, PS_QUELLE)
  if (person?.name) void logDossierAction(person.name, person.sam, `${text} (PC ${host})`, von, 'NIS2')
  if (ok) await ausErgebnisEntfernen(host, e.leaf)
  return { ok, meldung }
}

/** Gespeicherten Scan-Stand nachziehen (frisch laden → nur diesen PC/Eintrag ändern → speichern). */
async function ausErgebnisEntfernen(host: string, leaf: string): Promise<void> {
  const r = await loadAccessResult()
  if (!r) return
  const h = canon(host), l = leaf.trim().toLowerCase()
  const hm = { ...(r.hostMembers ?? {}) }
  if (Array.isArray(hm[h])) hm[h] = hm[h].filter(x => x.trim().toLowerCase() !== l)
  const users = r.users.map(u => {
    if (u.sam.trim().toLowerCase() !== l) return u
    const pcs = u.pcs.filter(p => canon(p) !== h)
    return { ...u, pcs, access: (u.access ?? []).filter(a => canon(a.pc) !== h) }
  }).filter(u => u.pcs.length > 0)
  await saveAccessResult({ ...r, users, hostMembers: hm })
}
