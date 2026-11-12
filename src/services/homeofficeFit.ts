// „Homeoffice fit?" — prüft (nur lesend, vom Admin-PC aus im AD), ob ein Mitarbeiter die
// Grundvoraussetzungen fürs Arbeiten im Homeoffice hat: Grundrolle Fernzugriff (ZPA Client Role),
// Fileshare (Marine Fileservers), SAP Production + Non Production und Marine enaio.
// Das Tool ändert NIE Berechtigungen — es zeigt nur, was fehlt, und verlinkt den passenden ServiceNow-Antrag.
import { create } from 'zustand'
import { PERMISSIONS } from '../data/infraMarineData'

const api = () => (window as unknown as { electronAPI: { runPowerShell(c: string, t?: number): Promise<{ stdout: string; stderr: string }> } }).electronAPI

export interface HoRolle {
  id: 'basis' | 'fileshare' | 'sapProd' | 'sapNonProd' | 'enaio'
  titel: string
  /** Eine davon genügt (Externe haben bei der Grundrolle _3Pext statt _Client). */
  gruppen: string[]
  antrag: string
  link: string
}

const perm = (id: string) => PERMISSIONS.find(p => p.id === id)
const ZPA_LINK = 'https://skfprod.service-now.com/sp?id=sc_cat_item&table=sc_cat_item&sys_id=0a02a0738796859059d9a8a90cbb3515'
/** EIN Antrag für alle Anwendungs-Rollen im Homeoffice (Marine Fileservers, SAP, enaio, Babtec, SolidWorks …) — höchstens 4 je Formular. */
export const APP_ANTRAG = 'Add/Remove Remote Access to Applications for a User'
export const APP_LINK = 'https://skfprod.service-now.com/sp?id=sc_cat_item&sys_id=02973a8393df92949bdeba647aba1020'
const antragVon = (id: string, label: string, url: string) => ({ antrag: perm(id)?.snowLabel?.replace(/ - Service Portal$/, '') || label, link: perm(id)?.snowUrl || url })

export const HO_ROLLEN: HoRolle[] = [
  { id: 'basis', titel: 'Grundrolle Fernzugriff „Remote Access“', gruppen: ['Azure_AD_SSO_Akamai_EAA_Client', 'Azure_AD_SSO_Akamai_EAA_3Pext'], ...antragVon('perm-ho-remote-intern', 'ZPA Client Role', ZPA_LINK) },
  { id: 'fileshare', titel: 'Fileshare „Marine Fileservers“ (Laufwerke im Homeoffice)', gruppen: ['EAA_File_Servers_Marine_Prod'], ...antragVon('perm-ho-sap', APP_ANTRAG, APP_LINK) },   // NICHT „Fileshare Access Request“ – der ist für Abteilungsordner auf I: (Nutzer 11.11.2026)
  { id: 'sapProd', titel: 'SAP „Marine Production“', gruppen: ['EAA_SAP_Marine_Prod'], ...antragVon('perm-ho-sap', 'Add/Remove Remote Access to Applications for a User', APP_LINK) },
  { id: 'sapNonProd', titel: 'SAP „Marine Non Production“', gruppen: ['EAA_SAP_Marine_NonProd'], ...antragVon('perm-ho-sap', 'Add/Remove Remote Access to Applications for a User', APP_LINK) },
  { id: 'enaio', titel: '„Marine enaio“', gruppen: ['EAA_Enaoi'], ...antragVon('perm-ho-enaio', 'Add/Remove Remote Access to Applications for a User', APP_LINK) },
]

export const HO_INFO = 'Diese Berechtigungen sind die Grundvoraussetzung, um im Homeoffice arbeiten zu können: Ohne die Grundrolle „Remote Access“ (ZPA Client Role) geht von zu Hause keine einzige interne Anwendung; dazu kommen je Anwendung die Rollen für die Netzlaufwerke (Marine Fileservers), SAP (Production + Non Production) und enaio. Geprüft wird im AD, auch über verschachtelte Gruppen.'

export interface HoErgebnis {
  ok: boolean
  /** gefundenes Konto */
  konto?: string
  anzeige?: string
  vorhanden: HoRolle[]
  fehlt: HoRolle[]
  fehler?: string
  geprueftAm: string
}

/** Reine Auswertung: Gruppenliste → vorhanden/fehlt (Groß-/Kleinschreibung egal). */
export function werteHoAus(gruppen: string[]): { vorhanden: HoRolle[]; fehlt: HoRolle[] } {
  const g = new Set(gruppen.map(x => x.toLowerCase()))
  const vorhanden: HoRolle[] = [], fehlt: HoRolle[] = []
  for (const r of HO_ROLLEN) (r.gruppen.some(x => g.has(x.toLowerCase())) ? vorhanden : fehlt).push(r)
  return { vorhanden, fehlt }
}

/** Antrags-Links zusammenfassen: gleicher Antrag nur einmal, mit allen Rollen, die darüber bestellt werden. */
export function antraegeFuer(fehlt: HoRolle[]): { antrag: string; link: string; rollen: string[] }[] {
  const m = new Map<string, { antrag: string; link: string; rollen: string[] }>()
  for (const r of fehlt) {
    const k = r.link
    if (!m.has(k)) m.set(k, { antrag: r.antrag, link: r.link, rollen: [] })
    m.get(k)!.rollen.push(r.titel)
  }
  return [...m.values()]
}

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** PowerShell (nur lesend): Konto forestweit finden (Global ID → UPN/Mail → Anzeigename), dann die
 *  Homeoffice-Gruppen inkl. Verschachtelung (LDAP_MATCHING_RULE_IN_CHAIN) lesen. */
export function hoSkript(p: { globalId?: string; upn?: string; vorname?: string; name?: string }, alleGruppen = false): string {
  const daten = b64(JSON.stringify({ gid: (p.globalId || '').trim(), upn: (p.upn || '').trim(), vn: (p.vorname || '').trim(), nn: (p.name || '').trim() }))
  // alleGruppen (Berechtigungscheck): ALLE Gruppen des Kontos inkl. Verschachtelung, sonst nur die Homeoffice-Rollen
  const gruppen = alleGruppen ? '' : '(|' + [...new Set(HO_ROLLEN.flatMap(r => r.gruppen))].map(g => `(cn=${g})`).join('') + ')'
  return String.raw`
$ErrorActionPreference = 'Stop'
try {
  $in = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${daten}')) | ConvertFrom-Json
  function Esc([string]$s) { $s.Replace('\', '\5c').Replace('*', '\2a').Replace('(', '\28').Replace(')', '\29').Replace([string][char]0, '\00') }
  $doms = @(); try { $doms = @([System.DirectoryServices.ActiveDirectory.Forest]::GetCurrentForest().Domains | ForEach-Object { $_.Name }) } catch {}
  if (-not $doms.Count -and $env:USERDNSDOMAIN) { $doms = @($env:USERDNSDOMAIN) }
  if (-not $doms.Count) { throw 'Kein Active Directory erreichbar (Admin-PC nicht im Firmennetz?).' }
  $filter = @()
  $teile = @()
  if ($in.gid) { $teile += '(sAMAccountName=' + (Esc $in.gid) + ')' }
  if ($in.upn) { $teile += '(userPrincipalName=' + (Esc $in.upn) + ')'; $teile += '(mail=' + (Esc $in.upn) + ')' }
  if ($teile.Count) { $filter += '(&(objectCategory=person)(objectClass=user)(|' + ($teile -join '') + '))' }
  if ($in.vn -and $in.nn) { $filter += '(&(objectCategory=person)(objectClass=user)(|(displayName=' + (Esc ($in.vn + ' ' + $in.nn)) + ')(displayName=' + (Esc ($in.nn + ', ' + $in.vn)) + ')(&(givenName=' + (Esc $in.vn) + ')(sn=' + (Esc $in.nn) + '))))' }
  if (-not $filter.Count) { throw 'Weder Global ID noch Name hinterlegt.' }
  $dn = $null; $sam = ''; $anz = ''; $mehrdeutig = $false
  foreach ($f in $filter) {
    foreach ($dm in $doms) {
      try {
        $su = New-Object System.DirectoryServices.DirectorySearcher([ADSI]('LDAP://' + $dm))
        $su.Filter = $f; $su.SizeLimit = 5
        foreach ($a in 'distinguishedName', 'sAMAccountName', 'displayName') { [void]$su.PropertiesToLoad.Add($a) }
        $tr = @($su.FindAll())
        if ($tr.Count -gt 1) { $mehrdeutig = $true }
        if ($tr.Count -ge 1) { $dn = [string]$tr[0].Properties['distinguishedname'][0]; $sam = [string]$tr[0].Properties['samaccountname'][0]; $anz = [string]$tr[0].Properties['displayname'][0]; break }
      } catch {}
    }
    if ($dn) { break }
  }
  if (-not $dn) { '@@HOFIT@@' + (@{ ok = $false; fehler = 'Kein AD-Konto gefunden (Global ID/Name) – evtl. noch nicht angelegt.' } | ConvertTo-Json -Compress); return }
  $esc = Esc $dn
  $gef = New-Object System.Collections.Generic.HashSet[string]([StringComparer]::OrdinalIgnoreCase)
  foreach ($dm in $doms) {
    try {
      $sg = New-Object System.DirectoryServices.DirectorySearcher([ADSI]('LDAP://' + $dm))
      $sg.Filter = '(&(objectCategory=group)${gruppen}(member:1.2.840.113556.1.4.1941:=' + $esc + '))'
      $sg.PageSize = 200; [void]$sg.PropertiesToLoad.Add('cn')
      foreach ($g in $sg.FindAll()) { [void]$gef.Add([string]$g.Properties['cn'][0]) }
    } catch {}
  }
  '@@HOFIT@@' + (ConvertTo-Json -Compress -InputObject @{ ok = $true; konto = $sam; anzeige = $anz; mehrdeutig = $mehrdeutig; gruppen = @($gef) })
} catch { '@@HOFIT@@' + (@{ ok = $false; fehler = [string]$_.Exception.Message } | ConvertTo-Json -Compress) }
`
}

/** Antwort des Skripts lesen (robust gegen Zusatzausgaben). */
export function leseHoAntwort(stdout: string): { ok: boolean; konto?: string; anzeige?: string; mehrdeutig?: boolean; gruppen?: string[]; fehler?: string } | null {
  const i = (stdout || '').lastIndexOf('@@HOFIT@@')
  if (i < 0) return null
  try {
    const j = JSON.parse(stdout.slice(i + 9).trim())
    const g = j.gruppen == null ? [] : Array.isArray(j.gruppen) ? j.gruppen : [j.gruppen]
    return { ...j, gruppen: g.map(String) }
  } catch { return null }
}

export async function pruefeHomeofficeFit(p: { globalId?: string; upn?: string; vorname?: string; name?: string }): Promise<HoErgebnis> {
  const jetzt = new Date().toISOString()
  try {
    const r = await api().runPowerShell(hoSkript(p), 90000)
    const a = leseHoAntwort(r.stdout || '')
    if (!a) return { ok: false, vorhanden: [], fehlt: [], fehler: (r.stderr || '').trim().split(/\r?\n/)[0] || 'Keine Antwort vom AD.', geprueftAm: jetzt }
    if (!a.ok) return { ok: false, vorhanden: [], fehlt: [], fehler: a.fehler || 'Prüfung fehlgeschlagen.', geprueftAm: jetzt }
    const w = werteHoAus(a.gruppen || [])
    return { ok: true, konto: a.konto, anzeige: a.anzeige, vorhanden: w.vorhanden, fehlt: w.fehlt, geprueftAm: jetzt, fehler: a.mehrdeutig ? 'Mehrere Konten passen – geprüft wurde das erste.' : undefined }
  } catch (e) {
    return { ok: false, vorhanden: [], fehlt: [], fehler: e instanceof Error ? e.message : String(e), geprueftAm: jetzt }
  }
}

/** Ergebnisse je Mitarbeiter (Sitzung) — bleibt beim Hin- und Herwechseln erhalten. */
interface HoStore {
  ergebnis: Record<string, HoErgebnis>
  laeuft: Record<string, boolean>
  pruefe: (key: string, p: { globalId?: string; upn?: string; vorname?: string; name?: string }) => Promise<void>
}
export const useHomeofficeFit = create<HoStore>((set, get) => ({
  ergebnis: {},
  laeuft: {},
  pruefe: async (key, p) => {
    if (get().laeuft[key]) return
    set(s => ({ laeuft: { ...s.laeuft, [key]: true } }))
    try {
      const e = await pruefeHomeofficeFit(p)
      set(s => ({ ergebnis: { ...s.ergebnis, [key]: e } }))
    } finally {
      set(s => ({ laeuft: { ...s.laeuft, [key]: false } }))
    }
  },
}))
