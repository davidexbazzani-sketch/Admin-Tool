// ── Wissens-Snapshot (Backup) ─────────────────────────────────────────────────
// Baut aus ALLEN vom Tool gesammelten Daten eine einzelne Markdown-Datei — als
// Kontext für künftige Aufgaben und als Überblick, was das Tool über das
// Unternehmen weiß (Mitarbeiter/AD, Geräte, Netzwerk, Telefonie, Drucker …).
//
// WICHTIG:
//  • Enthält (bewusst) personenbezogene Daten → nur PIN-geschützt erreichbar.
//  • Geheimnisse (Passwörter, Hashes, SMTP-/ServiceNow-Zugangsdaten, Recovery-
//    Keys) werden NIEMALS exportiert.
//  • Option `pseudonymize`: Namen/IDs/Mails/Telefon werden maskiert (verschickbare
//    Variante), Struktur/Statistik bleibt erhalten.

import { api } from '../electronAPI'
import type { InventoryItem } from '../types/auth'
import { listEmployees, listDepartures } from './employees'
import { readCentralAdUsers } from './adUserDirectory'
import { loadDevices, loadMeta, modelTypeDisplay } from './endpointDevices'
import { loadPhoneList } from './phoneAssignment'
import { listLicenses } from './licenses'
import { loadConnData, flatten } from './printerConnections'
import { loadPersistent } from './softwareInventoryScan'
import { loadVlanConfig, loadScanCache, findVlanDef } from './vlans'
import { loadOnboardingSettings, loadDeployments } from './onboarding'
import { listAllProjects } from './infraProjects'
import { listChecklists } from './checklists'
import { loadItems as loadAccessoryItems } from './accessoryInventory'
import { listRuns as listHardwareRuns } from './hardwareInventory'
import { listFloorPlans, loadInventory as loadApInventory } from './accessPoints'
import { loadConfig as loadSnConfig, loadIntegrationAccount } from './servicenow'

export interface SnapshotOptions { pseudonymize?: boolean }
export interface SnapshotResult { md: string; stats: { label: string; count: number; source: string }[] }

/* eslint-disable @typescript-eslint/no-explicit-any */

function mdTable(headers: string[], rows: (string | number | undefined)[][]): string {
  const esc = (v: unknown) => String(v ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()
  const head = `| ${headers.join(' | ')} |`
  const sep = `| ${headers.map(() => '---').join(' | ')} |`
  if (rows.length === 0) return `${head}\n${sep}\n| ${headers.map(() => '_(keine)_').join(' | ')} |`
  const body = rows.map(r => `| ${headers.map((_, i) => esc(r[i])).join(' | ')} |`).join('\n')
  return `${head}\n${sep}\n${body}`
}

// ── Auto-Discovery: Netzlaufwerk rekursiv erfassen ────────────────────────────
// Damit der Snapshot AUCH NEUE Datenarten automatisch erfasst (ohne Code-Änderung).

// Pfad-Präfixe, die oben bereits als eigene, kuratierte Sektion erscheinen.
const COVERED_PREFIXES = [
  'employees/', 'config/user-overview/', 'inventory/inventory.json', 'endpoint-devices/',
  'settings/phone_assignment.json', 'printer_connections/', 'software_inventar/', 'network/',
  'licenses/', 'person-dossiers/', 'device-dossiers/', 'printer-dossiers/', 'onboarding/',
  'infra-projects/', 'checklists/', 'accessory-inventory/', 'hardware-inventory/', 'access-points/',
  'config/servicenow/',
]
// Pfade, die NIE ausgegeben werden (Geheimnisse/sensible Konten).
const SECRET_PREFIXES = ['email_config/', 'config/servicenow/', 'users/', 'recovery/', 'approvals/', 'config/auth']
// Feldnamen, die generisch redigiert werden.
const SECRET_KEY_RE = /pass|secret|token|hash|\bpin\b|credential|recovery|smtppass|apikey/i

const isCovered = (p: string) => COVERED_PREFIXES.some(pre => p === pre || p.startsWith(pre))
const isSecretPath = (p: string) => SECRET_PREFIXES.some(pre => p.startsWith(pre))

/** Rekursiver Datei-Walk über das Netzlaufwerk (Namen ohne Endung = Ordner). */
async function walkShare(rel: string, depth: number, acc: string[]): Promise<void> {
  if (depth > 5 || acc.length > 2000) return
  let names: string[] = []
  try { names = await api().netListDir(rel) } catch { return }
  for (const name of names) {
    if (!name || name.startsWith('.')) continue
    const sub = rel ? `${rel}/${name}` : name
    if (/\.[a-z0-9]{1,6}$/i.test(name)) acc.push(sub)     // Datei
    else await walkShare(sub, depth + 1, acc)             // Ordner
  }
}

/** Generische, redigierte Ausgabe einer unbekannten JSON-Datei. */
function genericDump(data: any): string {
  const red = (k: string, v: any) => (SECRET_KEY_RE.test(k) ? '«redigiert»' : v)
  const cell = (k: string, v: any) => { const rv = red(k, v); return typeof rv === 'object' && rv !== null ? JSON.stringify(rv).slice(0, 200) : String(rv ?? '') }
  if (Array.isArray(data)) {
    if (data.length === 0) return '_(leer)_'
    if (typeof data[0] !== 'object') return `${data.length} Einträge: ${data.slice(0, 20).map(String).join(', ')}${data.length > 20 ? ' …' : ''}`
    const keys = [...new Set(data.flatMap((o: any) => (o && typeof o === 'object' ? Object.keys(o) : [])))].slice(0, 12)
    const rows = data.slice(0, 50).map((o: any) => keys.map(k => cell(k, o?.[k])))
    return mdTable(keys, rows) + (data.length > 50 ? `\n\n_… und ${data.length - 50} weitere_` : '')
  }
  if (data && typeof data === 'object') {
    return mdTable(['Feld', 'Wert'], Object.entries(data).slice(0, 60).map(([k, v]) => [k, cell(k, v)]))
  }
  return String(data)
}

export async function buildKnowledgeSnapshot(opts: SnapshotOptions = {}): Promise<SnapshotResult> {
  const P = !!opts.pseudonymize
  const nameMap = new Map<string, string>(); let nameSeq = 0
  const idMap = new Map<string, string>(); let idSeq = 0
  const pn = (name?: string): string => {
    const n = (name || '').trim(); if (!n) return ''
    if (!P) return n
    const k = n.toLowerCase()
    if (!nameMap.has(k)) nameMap.set(k, `Person-${String(++nameSeq).padStart(3, '0')}`)
    return nameMap.get(k)!
  }
  const pid = (id?: string): string => {
    const s = (id || '').trim(); if (!s) return ''
    if (!P) return s
    const k = s.toLowerCase()
    if (!idMap.has(k)) idMap.set(k, `ID-${String(++idSeq).padStart(3, '0')}`)
    return idMap.get(k)!
  }
  const pmail = (e?: string) => { const s = (e || '').trim(); return !s ? '' : (P ? '«redigiert»' : s) }
  const pphone = (p?: string) => { const s = (p || '').trim(); return !s ? '' : (P ? '****' : s) }

  const parts: string[] = []
  const stats: { label: string; count: number; source: string }[] = []
  const add = (label: string, count: number, source: string) => stats.push({ label, count, source })

  // Jede Domäne einzeln laden — Fehler dürfen den Rest nicht kippen.
  const safe = async (fn: () => Promise<void>, title: string, source: string) => {
    try { await fn() }
    catch (e) { parts.push(`## ${title}\n\n⚠️ Konnte nicht geladen werden (${source}): ${e instanceof Error ? e.message : String(e)}\n`) }
  }

  // ── Mitarbeiter (Eintritte) ─────────────────────────────────────────────────
  await safe(async () => {
    const emps = await listEmployees()
    add('Mitarbeiter (Eintritte)', emps.length, 'employees/employees.json')
    parts.push(`## Mitarbeiter – Eintritte (${emps.length})\n\nQuelle: Mitarbeiterverwaltung.\n\n` + mdTable(
      ['Vorname', 'Nachname', 'Global-ID', 'Start', 'Abteilung', 'Position', 'Manager', 'Raum', 'Durchwahl'],
      emps.map(e => [pn(e.vorname), pn(e.name), pid(e.globalId), e.startDate, e.department, (e as any).jobTitle, pn(e.manager), e.roomNumber, pphone(e.phoneExtension)]),
    ) + '\n')
  }, 'Mitarbeiter – Eintritte', 'employees')

  // ── Mitarbeiter (Austritte) ─────────────────────────────────────────────────
  await safe(async () => {
    const deps = await listDepartures()
    add('Mitarbeiter (Austritte)', deps.length, 'employees/departures.json')
    parts.push(`## Mitarbeiter – Austritte (${deps.length})\n\n` + mdTable(
      ['Name', 'Global-ID', 'Austritt', 'Manager', 'Gerät', 'Gerät zurück?'],
      deps.map(d => [pn(d.name), pid(d.globalId), d.exitDate, pn(d.manager), d.deviceName, d.deviceReturned ? 'ja' : 'nein']),
    ) + '\n')
  }, 'Mitarbeiter – Austritte', 'departures')

  // ── AD-Benutzerverzeichnis ──────────────────────────────────────────────────
  await safe(async () => {
    const dir = await readCentralAdUsers()
    const users = dir?.users ?? []
    add('AD-Benutzer', users.length, 'config/user-overview/ad-users.json')
    parts.push(`## AD-Benutzer (${users.length})\n\nStand: ${dir?.loadedAt ? new Date(dir.loadedAt).toLocaleString('de-DE') : 'unbekannt'} · Quelle: Active Directory (Company „SKF MARINE GMBH").\n\n` + mdTable(
      ['Anzeigename', 'Corp-ID', 'Abteilung', 'Position', 'E-Mail', 'Aktiv', 'Manager', 'Letzter Login'],
      users.map(u => [pn(u.displayName), pid(u.sam), u.department, u.title, pmail(u.email), u.enabled ? 'ja' : 'nein', pn(u.managerName), u.lastLogon ? new Date(u.lastLogon).toLocaleDateString('de-DE') : '']),
    ) + '\n')
  }, 'AD-Benutzer', 'ad-users')

  // ── Geräte-Inventar (Standort-Übersicht) ────────────────────────────────────
  await safe(async () => {
    const inv = (await api().netReadJson<InventoryItem[]>('inventory/inventory.json')) ?? []
    const list = Array.isArray(inv) ? inv : []
    add('Inventar-Geräte', list.length, 'inventory/inventory.json')
    parts.push(`## Geräte-Inventar / Standort-Übersicht (${list.length})\n\n` + mdTable(
      ['Name', 'IP', 'Kategorie', 'Zugewiesen an', 'Corp-ID', 'Abteilung', 'Position', 'Manager'],
      list.map(i => [i.name, i.ip, i.category, pn(i.assignedTo), pid(i.corpId), i.department, i.jobTitle, pn(i.manager)]),
    ) + '\n')
  }, 'Geräte-Inventar', 'inventory')

  // ── Endgeräte-Übersicht (Leasing) ───────────────────────────────────────────
  await safe(async () => {
    const devs = await loadDevices()
    const meta = await loadMeta().catch(() => ({}))
    add('Endgeräte', devs.length, 'endpoint-devices/devices.json')
    parts.push(`## Endgeräte-Übersicht (${devs.length})\n\n${(meta as any).importedAt ? `Import: ${new Date((meta as any).importedAt).toLocaleDateString('de-DE')} · ${(meta as any).importedFilename ?? ''}\n\n` : ''}` + mdTable(
      ['Hostname', 'Seriennr.', 'Modell', 'Typ', 'Zugewiesen an', 'Status', 'Verwendung', 'Leasingende', 'Unternehmen', 'Wer bezahlt?'],
      devs.map(d => [d.hostname, d.serial, d.model, modelTypeDisplay(d.model), pn(d.assignedTo), d.state, d.substate, d.retiredDate, d.company, d.assetOwnership]),
    ) + '\n')
  }, 'Endgeräte-Übersicht', 'endpoint-devices')

  // ── Telefonie / Durchwahlen ─────────────────────────────────────────────────
  await safe(async () => {
    const data: any = await loadPhoneList()
    const entries: any[] = data?.entries ?? []
    const vergeben = entries.filter(e => e.user)
    add('Durchwahlen (vergeben)', vergeben.length, 'settings/phone_assignment.json')
    parts.push(`## Telefonie – Durchwahlen (${entries.length} gesamt, ${vergeben.length} vergeben)\n\n` + mdTable(
      ['Durchwahl', 'Zugewiesen an', 'Status', 'Bemerkung'],
      entries.map(e => [pphone(String(e.nummer ?? '')), pn(e.user), e.status, e.bemerkung]),
    ) + '\n')
  }, 'Telefonie – Durchwahlen', 'phone_assignment')

  // ── Drucker ↔ Benutzer/PC-Verbindungen ──────────────────────────────────────
  await safe(async () => {
    const conn = await loadConnData()
    const flat = flatten(conn)
    add('Drucker-Verbindungen', flat.length, 'printer_connections/scan_data.json')
    parts.push(`## Drucker ↔ Benutzer/PC-Verbindungen (${flat.length})\n\n` + mdTable(
      ['PC', 'Drucker', 'Verbindung (UNC)', 'Benutzer', 'Standard'],
      flat.map(f => [f.hostname, f.printerName, f.connection, pn(f.display || f.user || ''), f.isDefault ? 'ja' : '']),
    ) + '\n')
  }, 'Drucker-Verbindungen', 'printer_connections')

  // ── Software-Inventar ───────────────────────────────────────────────────────
  await safe(async () => {
    const sw: any = await loadPersistent()
    const pcs: any[] = sw?.scannedPCs ?? []
    add('Software-Inventar (PCs)', pcs.length, 'software_inventar/scan_data.json')
    parts.push(`## Software-Inventar (${pcs.length} PCs)\n\nStand: ${sw?.lastUpdated ? new Date(sw.lastUpdated).toLocaleString('de-DE') : 'unbekannt'}.\n\n` + mdTable(
      ['Hostname', '# Programme', 'Zuletzt gescannt'],
      pcs.map(p => [p.hostname, Array.isArray(p.software) ? p.software.length : (p.softwareCount ?? ''), p.scannedAt ? new Date(p.scannedAt).toLocaleDateString('de-DE') : '']),
    ) + '\n')
  }, 'Software-Inventar', 'software_inventar')

  // ── Netzwerk / VLANs ────────────────────────────────────────────────────────
  await safe(async () => {
    const cfg = await loadVlanConfig()
    const cache = await loadScanCache()
    const devs = cache?.devices ?? []
    const byCidr = new Map<string, { t: number; o: number }>()
    for (const d of devs) { if (!d.cidr) continue; const c = byCidr.get(d.cidr) ?? { t: 0, o: 0 }; c.t++; if (d.online) c.o++; byCidr.set(d.cidr, c) }
    const cidrs = [...new Set([...cfg.vlans.map(v => v.cidr), ...byCidr.keys()])]
    add('VLANs/Subnetze', cidrs.length, 'network/vlans.json + vlan_scan.json')
    parts.push(`## Netzwerk – VLANs / Subnetze (${cidrs.length})\n\n${cache?.scanDate ? `Letzter Scan: ${new Date(cache.scanDate).toLocaleString('de-DE')} · ${devs.length} Geräte\n\n` : ''}` + mdTable(
      ['Subnetz', 'VLAN-ID', 'Name', 'Soll-Typ', 'Geräte (online/gesamt)'],
      cidrs.map(cidr => {
        const def = findVlanDef(cidr, cfg)
        const c = byCidr.get(cidr)
        return [cidr, def?.vlanId, def?.name, def?.expectedType, c ? `${c.o}/${c.t}` : '']
      }),
    ) + '\n')
  }, 'Netzwerk – VLANs', 'network')

  // ── Lizenzen ────────────────────────────────────────────────────────────────
  await safe(async () => {
    const lic = await listLicenses()
    add('Lizenzen', lic.length, 'licenses/licenses.json')
    parts.push(`## Lizenzen-Kalender (${lic.length})\n\n` + mdTable(
      ['Name', 'Ablauf', 'Hinweis'],
      lic.map(l => [l.name, l.expiryDate, l.comment1]),
    ) + '\n')
  }, 'Lizenzen', 'licenses')

  // ── Personen-Dossiers (Notizen & protokollierte Eingriffe) ──────────────────
  await safe(async () => {
    const dossierMd = await dossierSection('person-dossiers/data', 'personName', pn)
    add('Personen-Dossiers', dossierMd.count, 'person-dossiers/data')
    parts.push(`## Personen-Dossiers – Notizen & Eingriffe (${dossierMd.count})\n\n${dossierMd.md}\n`)
  }, 'Personen-Dossiers', 'person-dossiers')

  // ── Geräte-Dossiers ─────────────────────────────────────────────────────────
  await safe(async () => {
    const dossierMd = await dossierSection('device-dossiers/data', 'hostname', (s?: string) => s || '')
    add('Geräte-Dossiers', dossierMd.count, 'device-dossiers/data')
    parts.push(`## Geräte-Dossiers – Notizen & Eingriffe (${dossierMd.count})\n\n${dossierMd.md}\n`)
  }, 'Geräte-Dossiers', 'device-dossiers')

  // ── Übrige Domänen (Kurzüberblick) ──────────────────────────────────────────
  await safe(async () => {
    const rows: (string | number)[][] = []
    const tryCount = async (label: string, fn: () => Promise<number>, extra = '') => {
      try { const n = await fn(); rows.push([label, n, extra]); add(label, n, extra) } catch { rows.push([label, '—', extra]) }
    }
    await tryCount('Infrastruktur-Projekte', async () => (await listAllProjects()).length, 'infra-projects')
    await tryCount('Checklisten', async () => (await listChecklists()).length, 'checklists')
    await tryCount('Zubehör-Artikel', async () => (await loadAccessoryItems()).length, 'accessory-inventory')
    await tryCount('Hardware-Inventur-Läufe', async () => (await listHardwareRuns()).length, 'hardware-inventory')
    await tryCount('Access-Point-Lagepläne', async () => (await listFloorPlans()).length, 'access-points')
    await tryCount('Access-Point-Inventar', async () => { const inv: any = await loadApInventory(); return Array.isArray(inv?.items) ? inv.items.length : 0 }, 'access-points')
    await tryCount('Onboarding-Verteilungen', async () => (await loadDeployments()).length, 'onboarding/deployments')
    parts.push(`## Weitere Datenbestände (Kurzüberblick)\n\n` + mdTable(['Bereich', 'Anzahl', 'Quelle'], rows) + '\n')
  }, 'Weitere Datenbestände', 'diverse')

  // ── Konfiguration / Anbindungen (OHNE Geheimnisse) ──────────────────────────
  await safe(async () => {
    const on = await loadOnboardingSettings().catch(() => null as any)
    const sn = await loadSnConfig().catch(() => null as any)
    const snAcc = await loadIntegrationAccount().catch(() => null as any)
    const lines: string[] = []
    if (sn) lines.push(`- **ServiceNow-Instanz:** ${sn.instanceUrl}${Array.isArray(sn.assignmentGroups) && sn.assignmentGroups.length ? ` · Gruppen: ${sn.assignmentGroups.join(', ')}` : ''}`)
    if (snAcc?.user) lines.push(`- **ServiceNow-Integrationskonto:** ${snAcc.user} _(Passwort NICHT exportiert)_`)
    if (on) lines.push(`- **Onboarding:** ${on.rooms?.length ?? 0} Konferenzräume · ${on.generalInfo?.contacts?.length ?? 0} Ansprechpartner · IT-Kontakt: ${on.itContact?.name ?? '—'}`)
    parts.push(`## Konfiguration & Anbindungen\n\n${lines.join('\n') || '_keine_'}\n`)
  }, 'Konfiguration & Anbindungen', 'config')

  // ── Automatische Datei-Landkarte (erfasst AUCH Neues, ohne Code-Änderung) ────
  await safe(async () => {
    const files: string[] = []
    await walkShare('', 0, files)
    files.sort()
    add('Dateien auf dem Netzlaufwerk', files.length, 'rekursiver Scan')
    let countReads = 0
    const rows: (string | number)[][] = []
    for (const f of files) {
      const covered = isCovered(f)
      const secret = isSecretPath(f)
      let umfang = ''
      if (f.toLowerCase().endsWith('.json') && !secret && countReads < 500) {
        countReads++
        try {
          const d: any = await api().netReadJson<any>(f)
          umfang = Array.isArray(d) ? `${d.length} Einträge` : (d && typeof d === 'object' ? `${Object.keys(d).length} Felder` : '')
        } catch { /* egal */ }
      }
      rows.push([f, umfang, covered ? 'kuratiert' : (secret ? 'Secret – ausgelassen' : '⚠ neu (auto)')])
    }
    parts.push(`## Automatische Datei-Landkarte (${files.length} Dateien)\n\nRekursiver Scan des Netzlaufwerks — so erscheint **auch Neues automatisch**. „kuratiert" = weiter oben als eigene Sektion; „⚠ neu (auto)" = neue Datenart (unten generisch ausgegeben); „Secret" = bewusst ausgelassen.\n\n` + mdTable(['Datei', 'Umfang', 'Status'], rows) + '\n')

    // Neue/uncurierte JSONs generisch mit ausgeben (im pseudonymisierten Modus nur listen).
    const newOnes = files.filter(f => f.toLowerCase().endsWith('.json') && !isCovered(f) && !isSecretPath(f))
    if (P) {
      parts.push(`## Neue/uncurierte Datenbestände\n\n_(pseudonymisierter Modus: nur in der Datei-Landkarte gelistet, nicht ausgegeben)_\n`)
    } else if (newOnes.length) {
      const blocks: string[] = []
      for (const f of newOnes.slice(0, 40)) {
        try { const d: any = await api().netReadJson<any>(f); blocks.push(`### \`${f}\`\n\n${genericDump(d)}`) } catch { /* egal */ }
      }
      parts.push(`## Neue/uncurierte Datenbestände (automatisch erfasst)\n\nDatenarten ohne eigene Sektion — automatisch generisch ausgegeben (Secret-Felder redigiert):\n\n${blocks.join('\n\n')}\n`)
    }
  }, 'Automatische Datei-Landkarte', 'Netzlaufwerk')

  // ── Kopf zusammenbauen (Daten-Landkarte zuerst) ─────────────────────────────
  const now = new Date()
  let base = ''
  try { base = await api().netGetBasePath() } catch { /* egal */ }
  const header = [
    `# Wissens-Snapshot – IT Admin Tool`,
    ``,
    `Erstellt: **${now.toLocaleString('de-DE')}**${base ? ` · Netzlaufwerk: \`${base}\`` : ''}${P ? ' · **pseudonymisiert**' : ''}`,
    ``,
    `> ⚠️ **Datenschutz:** Diese Datei enthält ${P ? 'pseudonymisierte' : '**echte personenbezogene**'} Daten (Mitarbeiter, AD, Gerätezuordnungen, Durchwahlen). ${P ? '' : 'Nicht unkontrolliert weitergeben.'} Geheimnisse (Passwörter, Hashes, Zugangsdaten) sind bewusst **nicht** enthalten.`,
    ``,
    `## Daten-Landkarte`,
    ``,
    mdTable(['Datenbestand', 'Anzahl', 'Quelle'], stats.map(s => [s.label, s.count, s.source])),
    ``,
    `---`,
    ``,
  ].join('\n')

  return { md: header + parts.join('\n'), stats }
}

// Liest alle Dossier-JSONs eines Verzeichnisses und fasst ihre Einträge zusammen.
async function dossierSection(dir: string, nameField: string, pn: (s?: string) => string): Promise<{ md: string; count: number }> {
  let files: string[] = []
  try { files = await api().netListDir(dir) } catch { return { md: '_(nicht verfügbar)_', count: 0 } }
  const jsons = files.filter(f => f.toLowerCase().endsWith('.json'))
  const blocks: string[] = []
  let count = 0
  for (const f of jsons) {
    try {
      const d: any = await api().netReadJson<any>(`${dir}/${f}`)
      const entries: any[] = Array.isArray(d?.entries) ? d.entries : []
      if (!d || entries.length === 0) continue
      count++
      const title = pn(d[nameField] || d.key || f)
      const meta = [d.sam ? `Corp-ID: ${pn(d.sam)}` : '', d.serial ? `SN: ${d.serial}` : '', d.roomNumber ? `Raum: ${d.roomNumber}` : ''].filter(Boolean).join(' · ')
      const rows = entries.map(e => [
        e.createdAt ? new Date(e.createdAt).toLocaleDateString('de-DE') : '',
        e.kind === 'action' ? 'Eingriff' : 'Notiz',
        e.source || '',
        pn(e.createdBy || ''),
        e.text || '',
      ])
      blocks.push(`### ${title}${meta ? ` — ${meta}` : ''}\n\n` + mdTable(['Datum', 'Art', 'Quelle', 'Von', 'Text'], rows))
    } catch { /* einzelnes Dossier überspringen */ }
  }
  return { md: blocks.join('\n\n') || '_(keine Einträge)_', count }
}
