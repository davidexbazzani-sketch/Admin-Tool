// ── NIS2 → Kachel „Awareness-Schulung" ───────────────────────────────────────
// Stand der NIS2-Awareness-Schulung (OT-Basis) aus der Schulungsübersicht (Excel):
//   • wer hat abgeschlossen, wer ist noch offen
//   • für die Offenen: AD-Abgleich (Konto aktiv/inaktiv, Abteilung, direkter Vorgesetzter)
//   • Manager-Mail: „folgende Mitarbeitende aus deinem Team sind noch offen"
//
// Excel: Bevorzugt Blatt „Mitarbeiterabgleich" (alle Personen mit Status). Fehlt es,
// werden „Schulungsübersicht" (Bestanden) + „Fehlende Mitarbeitende" (offen) kombiniert.
// Kopfzeilen werden gesucht (nicht fest auf Zeile 1), Spalten über ihre Überschrift.
//
// Speicher (geteilt für alle Admins): nis2/awareness/stand.json. Vor jedem Schreiben
// frisch nachladen; Kontakt-Protokoll wird nur angehängt, nie überschrieben.

import * as XLSX from 'xlsx'
import { api } from '../electronAPI'
import { foldName } from '../utils/nameMatch'

export const AWARENESS_FILE = 'nis2/awareness/stand.json'

export type SchulungsStatus = 'abgeschlossen' | 'offen'

export interface AwarenessPerson {
  /** Schlüssel: E-Mail (klein) oder — ohne Mail — gefalteter Name. */
  key: string
  name: string
  email: string
  art: string                 // Intern / Extern
  status: SchulungsStatus
  datum?: string              // abgeschlossen am
  ergebnis?: string           // Punkte / %
}

export interface AdInfo {
  found: boolean
  enabled?: boolean
  department?: string
  title?: string
  displayName?: string
  sam?: string
  managerName?: string
  managerMail?: string
  managerSam?: string
  managerEnabled?: boolean
  /** Wo gefunden: eigene Domäne oder forestweit (Global Catalog). */
  quelle?: 'domain' | 'gc'
  error?: string
}

export interface ManagerKontakt {
  at: string
  by: string
  managerMail: string
  managerName: string
  /** Schlüssel der genannten Mitarbeitenden. */
  personen: string[]
  art: 'gesendet' | 'entwurf'
}

export interface AwarenessEinstellungen {
  /** Bis wann soll abgeschlossen sein (Freitext, z. B. „31.10.2026"). */
  frist?: string
  /** Link zur Schulung (optional, erscheint in der Manager-Mail). */
  link?: string
  /** Anzahl bereits versendeter Erinnerungen an die Mitarbeitenden. */
  reminderAnzahl?: number
  /** CC jeder Manager-Mail (kommagetrennt). */
  cc?: string
}

/** Steht standardmäßig in CC jeder Manager-Mail. */
export const STANDARD_CC = 'sascha.herges@skf.de'

/**
 * Ablage der Schulung (I:\Public\Public\NIS2\Schulungen\Awareness_Schulung.html) — als
 * UNC-Pfad, weil der Laufwerksbuchstabe I: nicht bei jedem Empfänger gleich ist.
 * I: = Freigabe „SKF Marine" auf \\W3172. In den Text-Einstellungen änderbar.
 */
export const STANDARD_LINK = 'file://W3172/SKF%20Marine/Public/Public/NIS2/Schulungen/Awareness_Schulung.html'

/** Dieser Satz wird in der HTML-Mail zum Hyperlink auf die Schulung. */
export const LINK_TEXT = 'Hier liegt die Schulung'

/** Klartext der Mail → HTML; LINK_TEXT wird (falls vorhanden) zum Hyperlink. */
export function mailZuHtml(text: string, link?: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  let html = esc(text)
  if (link?.trim()) html = html.replace(LINK_TEXT, `<a href="${esc(link.trim())}">${LINK_TEXT}</a>`)
  return `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${html.split(/\r?\n/).join('<br>')}</div>`
}

export interface AwarenessStand {
  importedAt: string
  importedBy: string
  filename: string
  /** „Stand: …" aus der Excel-Kopfzeile, falls vorhanden. */
  standDatum?: string
  quelleBlatt: string
  personen: AwarenessPerson[]
  ad?: { checkedAt: string; checkedBy: string; byKey: Record<string, AdInfo> }
  kontakte: ManagerKontakt[]
  einstellungen?: AwarenessEinstellungen
}

// ── Excel einlesen ─────────────────────────────────────────────────────────────

type Zeile = string[]

function norm(s: unknown): string {
  return foldName(String(s ?? '')).replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Kopfzeile suchen: erste Zeile (in den ersten 15), die alle Pflicht-Überschriften enthält. */
function findeKopf(rows: Zeile[], pflicht: string[]): { idx: number; spalten: Map<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const m = new Map<string, number>()
    rows[i].forEach((c, j) => { const n = norm(c); if (n && !m.has(n)) m.set(n, j) })
    if (pflicht.every(p => [...m.keys()].some(k => k === p || k.startsWith(p)))) return { idx: i, spalten: m }
  }
  return null
}

function spalte(sp: Map<string, number>, ...namen: string[]): number {
  for (const n of namen) {
    const nn = norm(n)
    for (const [k, j] of sp) if (k === nn || k.startsWith(nn)) return j
  }
  return -1
}

function blatt(wb: XLSX.WorkBook, ...namen: string[]): Zeile[] | null {
  const name = wb.SheetNames.find(s => namen.some(n => norm(s) === norm(n)))
  if (!name) return null
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false }) as Zeile[]
}

const leer = (v: unknown) => { const s = String(v ?? '').trim(); return s === '—' || s === '-' ? '' : s }

function personKey(email: string, name: string): string {
  const e = email.trim().toLowerCase()
  return e || 'name:' + foldName(name).replace(/[^a-z0-9]+/g, ' ').trim()
}

function istAbgeschlossen(status: string): boolean {
  return /abgeschlossen|bestanden|absolviert|erledigt|passed|completed/i.test(status)
}

export interface ParseErgebnis { personen: AwarenessPerson[]; quelleBlatt: string; standDatum?: string; hinweis?: string }

export function parseAwarenessWorkbook(bytes: Uint8Array): ParseErgebnis {
  const wb = XLSX.read(bytes, { type: 'array' })

  // „Stand: 15.10.2026" irgendwo in den ersten Zeilen eines Blatts
  let standDatum: string | undefined
  for (const s of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, defval: '', raw: false }) as Zeile[]
    for (const r of rows.slice(0, 6)) for (const c of r) {
      const m = String(c).match(/Stand:\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/i)
      if (m) { standDatum = m[1]; break }
    }
    if (standDatum) break
  }

  // Details zu den Abschlüssen (Ergebnis/Datum) — nach Mail aus „Absender" bzw. Name
  const details = new Map<string, { datum?: string; ergebnis?: string; bestanden: boolean; name: string; email: string; art: string }>()
  const uebersicht = blatt(wb, 'Schulungsübersicht', 'Schulungsuebersicht')
  if (uebersicht) {
    const kopf = findeKopf(uebersicht, ['name', 'status'])
    if (kopf) {
      const cN = spalte(kopf.spalten, 'Name'), cS = spalte(kopf.spalten, 'Status'), cD = spalte(kopf.spalten, 'Datum')
      const cE = spalte(kopf.spalten, 'Ergebnis'), cA = spalte(kopf.spalten, 'Absender'), cI = spalte(kopf.spalten, 'Intern/Extern', 'Intern')
      for (const r of uebersicht.slice(kopf.idx + 1)) {
        const name = leer(r[cN]); if (!name) continue
        const mail = (String(cA >= 0 ? r[cA] : '').match(/<([^>]+@[^>]+)>/)?.[1] || '').toLowerCase()
        const d = { datum: leer(cD >= 0 ? r[cD] : ''), ergebnis: leer(cE >= 0 ? r[cE] : ''), bestanden: istAbgeschlossen(String(r[cS] ?? '')), name, email: mail, art: leer(cI >= 0 ? r[cI] : '') }
        if (mail) details.set(mail, d)
        details.set('name:' + foldName(name).replace(/[^a-z0-9]+/g, ' ').trim(), d)
      }
    }
  }
  const detailFuer = (email: string, name: string) =>
    details.get(email.toLowerCase()) ?? details.get('name:' + foldName(name).replace(/[^a-z0-9]+/g, ' ').trim())

  const personen = new Map<string, AwarenessPerson>()
  const add = (p: AwarenessPerson) => { if (!personen.has(p.key)) personen.set(p.key, p) }

  // 1) Bevorzugt: Mitarbeiterabgleich (vollständige Liste mit Status)
  const abgleich = blatt(wb, 'Mitarbeiterabgleich')
  const kAbgl = abgleich ? findeKopf(abgleich, ['name', 'status']) : null
  if (abgleich && kAbgl) {
    const cN = spalte(kAbgl.spalten, 'Name'), cM = spalte(kAbgl.spalten, 'E-Mail', 'EMail', 'Mail'), cI = spalte(kAbgl.spalten, 'Intern/Extern', 'Intern')
    const cS = spalte(kAbgl.spalten, 'Status'), cD = spalte(kAbgl.spalten, 'Schulung abgeschlossen am', 'abgeschlossen am', 'Datum')
    for (const r of abgleich.slice(kAbgl.idx + 1)) {
      const name = leer(r[cN]); if (!name) continue
      const email = leer(cM >= 0 ? r[cM] : '')
      const status: SchulungsStatus = istAbgeschlossen(String(r[cS] ?? '')) ? 'abgeschlossen' : 'offen'
      const det = status === 'abgeschlossen' ? detailFuer(email, name) : undefined
      add({ key: personKey(email, name), name, email, art: leer(cI >= 0 ? r[cI] : ''), status, datum: leer(cD >= 0 ? r[cD] : '') || det?.datum, ergebnis: det?.ergebnis })
    }
    return { personen: [...personen.values()], quelleBlatt: 'Mitarbeiterabgleich', standDatum }
  }

  // 2) Ersatz: Schulungsübersicht (bestanden) + Fehlende Mitarbeitende (offen)
  for (const d of new Set(details.values())) {
    if (!d.bestanden) continue
    add({ key: personKey(d.email, d.name), name: d.name, email: d.email, art: d.art, status: 'abgeschlossen', datum: d.datum, ergebnis: d.ergebnis })
  }
  const fehlend = blatt(wb, 'Fehlende Mitarbeitende', 'Fehlende Mitarbeiter')
  const kF = fehlend ? findeKopf(fehlend, ['name']) : null
  if (fehlend && kF) {
    const cN = spalte(kF.spalten, 'Name'), cM = spalte(kF.spalten, 'E-Mail', 'EMail', 'Mail'), cI = spalte(kF.spalten, 'Intern/Extern', 'Intern')
    for (const r of fehlend.slice(kF.idx + 1)) {
      const name = leer(r[cN]); if (!name) continue
      const email = leer(cM >= 0 ? r[cM] : '')
      add({ key: personKey(email, name), name, email, art: leer(cI >= 0 ? r[cI] : ''), status: 'offen' })
    }
  }
  if (personen.size === 0) {
    return { personen: [], quelleBlatt: '', standDatum, hinweis: 'Keine passenden Blätter gefunden (erwartet: „Mitarbeiterabgleich" oder „Schulungsübersicht" + „Fehlende Mitarbeitende").' }
  }
  return { personen: [...personen.values()], quelleBlatt: 'Schulungsübersicht + Fehlende Mitarbeitende', standDatum }
}

// ── Speicher ───────────────────────────────────────────────────────────────────

export async function loadAwareness(): Promise<AwarenessStand | null> {
  try {
    const s = await api().netReadJson<AwarenessStand>(AWARENESS_FILE)
    if (!s || !Array.isArray(s.personen)) return null
    return { ...s, kontakte: Array.isArray(s.kontakte) ? s.kontakte : [] }
  } catch { return null }
}

/** Frisch nachladen → ändern → schreiben (mehrere Admins arbeiten parallel). */
async function aendere(fn: (s: AwarenessStand | null) => AwarenessStand | null): Promise<AwarenessStand | null> {
  const neu = fn(await loadAwareness())
  if (!neu) return null
  try { return (await api().netWriteJson(AWARENESS_FILE, neu)) ? neu : null } catch { return null }
}

/** Neue Excel übernehmen. Kontakt-Protokoll, Einstellungen und AD-Daten (für noch vorhandene Personen) bleiben. */
export async function importiereAwareness(p: ParseErgebnis, filename: string, by: string): Promise<AwarenessStand | null> {
  return aendere(alt => {
    const keys = new Set(p.personen.map(x => x.key))
    const byKey: Record<string, AdInfo> = {}
    for (const [k, v] of Object.entries(alt?.ad?.byKey ?? {})) if (keys.has(k)) byKey[k] = v
    return {
      importedAt: new Date().toISOString(), importedBy: by, filename,
      standDatum: p.standDatum, quelleBlatt: p.quelleBlatt, personen: p.personen,
      ad: alt?.ad ? { ...alt.ad, byKey } : undefined,
      kontakte: alt?.kontakte ?? [],
      einstellungen: alt?.einstellungen,
    }
  })
}

export async function speichereAdErgebnis(byKey: Record<string, AdInfo>, by: string): Promise<AwarenessStand | null> {
  return aendere(alt => alt && { ...alt, ad: { checkedAt: new Date().toISOString(), checkedBy: by, byKey: { ...(alt.ad?.byKey ?? {}), ...byKey } } })
}

export async function protokolliereKontakt(k: ManagerKontakt): Promise<AwarenessStand | null> {
  return aendere(alt => alt && { ...alt, kontakte: [...alt.kontakte, k] })
}

export async function speichereEinstellungen(e: AwarenessEinstellungen): Promise<AwarenessStand | null> {
  return aendere(alt => alt && { ...alt, einstellungen: { ...alt.einstellungen, ...e } })
}

// ── AD-Abgleich (nur für Offene) ──────────────────────────────────────────────

function psQ(s: string): string { return "'" + s.replace(/'/g, "''") + "'" }

function buildAdScript(batch: { key: string; email: string; name: string }[]): string {
  // Jede Person einzeln per .Add() — ein Literal @(@('a','b','c')) mit nur EINEM Eintrag
  // würde PowerShell zu drei Einzeltexten flachdrücken (letztes Paket mit 1 Person!).
  const liste = batch.map(b => `[void]$liste.Add(@(${psQ(b.key)},${psQ(b.email)},${psQ(b.name)}))`)
  return [
    '$liste=New-Object System.Collections.ArrayList',
    ...liste,
    "$ErrorActionPreference='SilentlyContinue'",
    "$props=@('Enabled','Department','Title','DisplayName','SamAccountName','EmailAddress','UserPrincipalName','Manager')",
    '$tab=[char]9',
    "$gc=$null; try { $gc=(Get-ADRootDSE).dnsHostName + ':3268' } catch {}",
    "function S($x) { ([string]$x) -replace \"[`t`r`n]\", ' ' }",
    'function Finde($mail, $name, $srv) {',
    '  $p=@{ Properties=$props }; if ($srv) { $p.Server=$srv }',
    "  $m=$mail -replace \"'\",\"''\"",
    '  if ($m) {',
    "    foreach ($f in @(\"EmailAddress -eq '$m'\", \"UserPrincipalName -eq '$m'\", \"proxyAddresses -eq 'smtp:$m'\")) {",
    '      $u=Get-ADUser -Filter $f @p | Select-Object -First 1; if ($u) { return $u } } }',
    '  if ($name) {',
    "    $n=$name -replace \"'\",\"''\"",
    '    $u=Get-ADUser -Filter "DisplayName -eq \'$n\'" @p | Select-Object -First 1; if ($u) { return $u } }',
    '  return $null',
    '}',
    'foreach ($e in $liste) {',
    '  $key=$e[0]; $u=Finde $e[1] $e[2] $null; $q="domain"; $srv=$null',
    '  if (-not $u -and $gc) { $u=Finde $e[1] $e[2] $gc; $q="gc"; $srv=$gc }',
    '  if ($u) {',
    "    $mn=''; $mm=''; $ms=''; $me=''",
    '    if ($u.Manager) {',
    "      $mp=@{ Identity=$u.Manager; Properties=@('DisplayName','EmailAddress','UserPrincipalName','Enabled') }; if ($srv) { $mp.Server=$srv }",
    '      $g=Get-ADUser @mp',
    '      if (-not $g -and $gc -and -not $srv) { $mp.Server=$gc; $g=Get-ADUser @mp }',
    '      if ($g) { $mn=S $g.DisplayName; $mm=S $g.EmailAddress; if (-not $mm) { $mm=S $g.UserPrincipalName }; $ms=S $g.SamAccountName; $me=$(if ($g.Enabled) {"1"} else {"0"}) }',
    '    }',
    '    $en=$(if ($u.Enabled) {"1"} else {"0"})',
    '    Write-Output ("AWR$tab$key$tab" + "1$tab$en$tab" + (S $u.Department) + $tab + (S $u.Title) + $tab + (S $u.DisplayName) + $tab + (S $u.SamAccountName) + $tab + $mn + $tab + $mm + $tab + $ms + $tab + $me + $tab + $q)',
    '  } else { Write-Output ("AWR$tab$key$tab" + "0") }',
    '}',
  ].join('\n')
}

const BATCH = 25
const PARALLEL = 3

export async function adAbgleich(
  personen: AwarenessPerson[], onProgress?: (done: number, total: number) => void,
): Promise<Record<string, AdInfo>> {
  const out: Record<string, AdInfo> = {}
  const liste = personen.map(p => ({ key: p.key, email: p.email, name: p.name }))
  const batches: typeof liste[] = []
  for (let i = 0; i < liste.length; i += BATCH) batches.push(liste.slice(i, i + BATCH))
  let done = 0
  onProgress?.(0, liste.length)
  for (let i = 0; i < batches.length; i += PARALLEL) {
    await Promise.all(batches.slice(i, i + PARALLEL).map(async b => {
      try {
        const r = await api().runPowerShell(buildAdScript(b), 180000)
        for (const line of (r.stdout || '').split(/\r?\n/)) {
          if (!line.startsWith('AWR\t')) continue
          const t = line.split('\t')
          const key = t[1]
          if (t[2] !== '1') { out[key] = { found: false }; continue }
          out[key] = {
            found: true, enabled: t[3] === '1',
            department: t[4] || undefined, title: t[5] || undefined, displayName: t[6] || undefined, sam: t[7] || undefined,
            managerName: t[8] || undefined, managerMail: t[9] || undefined, managerSam: t[10] || undefined,
            managerEnabled: t[11] === '' || t[11] === undefined ? undefined : t[11] === '1',
            quelle: t[12] === 'gc' ? 'gc' : 'domain',
          }
        }
        for (const x of b) if (!out[x.key]) out[x.key] = { found: false, error: r.timedOut ? 'Zeitüberschreitung' : 'Keine Antwort' }
      } catch (e) {
        for (const x of b) out[x.key] = { found: false, error: e instanceof Error ? e.message : String(e) }
      }
      done += b.length
      onProgress?.(done, liste.length)
    }))
  }
  return out
}

// ── Manager-Mail ───────────────────────────────────────────────────────────────

/** Vorname aus „Nachname, Vorname" oder „Vorname Nachname". */
export function vorname(anzeige: string): string {
  const s = (anzeige || '').trim()
  if (!s) return ''
  if (s.includes(',')) return s.split(',')[1].trim().split(/\s+/)[0] || ''
  return s.split(/\s+/)[0]
}

export interface MailPerson { name: string; department?: string }

export function baueManagerMail(o: {
  managerName: string
  personen: MailPerson[]
  standDatum?: string
  frist?: string
  link?: string
  reminderAnzahl?: number
  absender: string
}): { subject: string; body: string } {
  const n = o.personen.length
  const vn = vorname(o.managerName)
  const reminder = o.reminderAnzahl ?? 2
  const reminderText = reminder === 1 ? 'eine Erinnerung' : `${reminder === 2 ? 'zwei' : reminder} Erinnerungen`
  const zeilen = [
    `Hallo ${vn || 'zusammen'},`,
    '',
    'im Rahmen der NIS2-Umsetzung ist die NIS2-Awareness-Schulung (OT-Basis) für alle Mitarbeitenden der SKF Marine GmbH verpflichtend.',
    '',
    `Laut unserem aktuellen Stand${o.standDatum ? ` (${o.standDatum})` : ''} ${n === 1 ? 'hat folgende Person' : `haben folgende ${n} Personen`} aus deinem Team die Schulung noch nicht abgeschlossen:`,
    '',
    ...o.personen.map(p => `  • ${p.name}${p.department ? ` (${p.department})` : ''}`),
    '',
    (reminder > 0 ? `${n === 1 ? 'Die betroffene Person hat' : 'Die Betroffenen haben'} von uns bereits ${reminderText} per E-Mail erhalten. Wir bitten dich daher, ` : 'Wir bitten dich, ')
      + `sie direkt anzusprechen und dafür zu sorgen, dass die Schulung${o.frist ? ` bis zum ${o.frist}` : ' zeitnah'} absolviert wird.`,
  ]
  if (o.link?.trim()) zeilen.push('', `${LINK_TEXT} — gern direkt an dein Team weitergeben.`)
  zeilen.push(
    '',
    'Nach erfolgreichem Abschluss erhalten wir automatisch eine Bestätigung — darüber hinaus ist nichts weiter zu tun. Falls jemand aus deiner Liste das Unternehmen bereits verlassen hat oder aus anderen Gründen nicht teilnehmen muss, gib uns bitte kurz Bescheid.',
    '',
    'Vielen Dank für deine Unterstützung!',
    '',
    'Viele Grüße',
    o.absender,
    'IT · SKF Marine',
  )
  return {
    subject: `NIS2-Awareness-Schulung: ${n === 1 ? '1 Person' : `${n} Personen`} aus deinem Team noch offen`,
    body: zeilen.join('\n'),
  }
}
