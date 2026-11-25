// HCI-Fragebogen: Excel-Export.
// Je Server EIN Blatt im Aufbau der Vorlage „Analysis applications HCI.xlsx“ (Spalten #, Question,
// Response; gleiche Schrift, Kopf-Füllung und Rahmen) — das Blatt lässt sich in Excel per
// „Verschieben oder kopieren“ direkt in die gemeinsame Liste übernehmen.
// Auf Wunsch dazu je Server ein Datenblatt mit den gelesenen Belegen.
import ExcelJS from 'exceljs'
import { api } from '../electronAPI'
import { HCI_FRAGEN, HCI_KOPF } from './fragen'
import { ausfallBefund, endText, filterKlasse, leiteAb, liegtWindowsBei, osText, zeitraumAb, type Steckbrief } from './auswertung'
import type { HciAntwort, HciRoh } from './typen'

export interface ExportServer { host: string; antworten: HciAntwort[]; eigene: Record<string, string>; roh: HciRoh; steckbrief?: Steckbrief | null; von?: string }

const SCHRIFT = 'Aptos'
const RAND: Partial<ExcelJS.Borders> = (() => { const s = { style: 'medium' as const, color: { argb: 'FFE6E6E6' } }; return { left: s, right: s, top: s, bottom: s } })()
const KOPF_FUELLUNG: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } }
const blattName = (s: string) => s.replace(/[[\]:*?/\\]/g, '-').slice(0, 31)
const minute = (iso: string) => (iso || '').slice(0, 16).replace('T', ' ')

function u8ToB64(u: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < u.byteLength; i += 8192) bin += String.fromCharCode(...u.subarray(i, i + 8192))
  return btoa(bin)
}

/** Antwort-Blatt genau im Aufbau der Vorlage */
function antwortBlatt(wb: ExcelJS.Workbook, s: ExportServer) {
  const ws = wb.addWorksheet(blattName(s.host))
  ws.columns = [{ width: 4 }, { width: 62 }, { width: 105 }]
  const kopf = ws.addRow([...HCI_KOPF])
  kopf.eachCell(c => { c.font = { name: SCHRIFT, size: 11, bold: true, color: { argb: 'FF000000' } }; c.fill = KOPF_FUELLUNG; c.border = RAND; c.alignment = { vertical: 'middle', wrapText: true } })
  for (const f of HCI_FRAGEN) {
    const a = s.antworten.find(x => x.nr === f.nr)
    const zeile = ws.addRow([f.nr, f.frage, a ? endText(a, s.eigene) : ''])
    zeile.eachCell({ includeEmpty: true }, c => { c.font = { name: SCHRIFT, size: 11 }; c.border = RAND; c.alignment = { vertical: 'top', wrapText: true } })
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

/** Datenblatt: die gelesenen Belege als Tabellen */
function datenBlatt(wb: ExcelJS.Workbook, s: ExportServer) {
  const r = s.roh
  const a = leiteAb(r)
  const ws = wb.addWorksheet(blattName(`${s.host} data`))
  ws.columns = [{ width: 34 }, { width: 44 }, { width: 28 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 30 }]
  const fett = (z: ExcelJS.Row, groesse = 11) => z.eachCell(c => { c.font = { name: SCHRIFT, size: groesse, bold: true } })
  const titel = (t: string) => { ws.addRow([]); const z = ws.addRow([t]); fett(z, 12); z.getCell(1).fill = KOPF_FUELLUNG }
  const tabelle = (kopf: string[], zeilen: (string | number)[][], leerText = 'none') => {
    const k = ws.addRow(kopf); k.eachCell(c => { c.font = { name: SCHRIFT, size: 10, bold: true }; c.border = { bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } } } })
    if (!zeilen.length) { ws.addRow([leerText]).getCell(1).font = { name: SCHRIFT, size: 10, italic: true, color: { argb: 'FF7F7F7F' } }; return }
    for (const z of zeilen) ws.addRow(z).eachCell(c => { c.font = { name: SCHRIFT, size: 10 }; c.alignment = { vertical: 'top', wrapText: true } })
  }
  const kv = (zeilen: [string, string | number][]) => { for (const [k, v] of zeilen) { const z = ws.addRow([k, v]); z.getCell(1).font = { name: SCHRIFT, size: 10, bold: true }; z.getCell(2).font = { name: SCHRIFT, size: 10 }; z.getCell(2).alignment = { wrapText: true, vertical: 'top' } } }

  fett(ws.addRow([`${s.host} — data read from the server (IT Admin Tool, read-only)`]), 13)
  kv([
    ['Read on', `${minute(r.am)} (server time${r.zone ? ', ' + r.zone : ''})${s.von ? ` by ${s.von}` : ''}`],
    ['Period analysed', `${zeitraumAb(r) || '?'} to ${r.am.slice(0, 10)} (${r.tage} days requested; System log starts ${r.protokollAb.system.slice(0, 10) || '?'}, Application log ${r.protokollAb.anwendung.slice(0, 10) || '?'})`],
    ['Operating system', `${osText(r)}; installed ${r.system.installiert.slice(0, 10)}; last boot ${minute(r.system.boot)}`],
    ['Hardware', `${r.system.hersteller} ${r.system.modell}; ${r.system.kerne} logical CPUs; ${r.system.ramGB} GB RAM (${r.system.ramFreiGB} GB free)`],
    ['Hyper-V host (as seen by the guest)', r.system.gast.PhysicalHostNameFullyQualified || r.system.gast.PhysicalHostName || r.system.gast.HostName || 'n/a'],
    ['Disks', r.system.platten.map(p => `${p.n} ${p.g} GB (${p.f} GB free)`).join('; ') || 'n/a'],
    ['Page file', r.system.auslagerung.map(p => `${p.n} ${p.mb} MB, peak ${p.spitze} MB`).join('; ') || 'n/a'],
    ['Restart pending', r.system.neustartAusstehend ? 'yes' : 'no'],
    ['Crash dumps', [r.system.abbild.voll && `MEMORY.DMP ${minute(r.system.abbild.voll)} (${r.system.abbild.vollMB} MB)`, r.system.abbild.klein.length && `${r.system.abbild.klein.length} minidump(s), latest ${minute(r.system.abbild.klein[0])}`].filter(Boolean).join('; ') || 'none'],
    ['Windows roles', r.rollen.join(', ') || 'none'],
    ['Not readable', r.luecken.join('; ') || '—'],
  ])

  const artText: Record<string, string> = { anwendung: 'application', datenbank: 'database', laufzeit: 'runtime', agent: 'agent', werkzeug: 'tool', system: 'Microsoft component' }
  titel('Installed software')
  tabelle(['Name', 'Version', 'Vendor', 'Installed', 'Category'], a.software.map(x => [x.n, x.v, x.h, /^\d{8}$/.test(x.d) ? `${x.d.slice(0, 4)}-${x.d.slice(4, 6)}-${x.d.slice(6, 8)}` : '', artText[x.art] || x.art]))
  if (r.sql.length) { titel('SQL Server instances'); tabelle(['Instance', 'Version', 'Patch level', 'Edition'], r.sql.map(x => [x.n, x.v, x.pl, x.e])) }
  titel('Runtimes')
  kv([['.NET Framework', `${r.dotnet.version} (release ${r.dotnet.release})`], ['.NET runtimes', r.dotnet.core.join(', ') || 'none'], ['Java', r.java.map(j => `${j.v} (${j.q === 'prozess' ? 'in use: ' : ''}${j.o})`).join('; ') || 'none']])

  titel('Services not part of Windows')
  tabelle(['Name', 'Display name', 'State', 'Start', 'Account', 'Program', 'Category'], a.dienste.filter(d => d.art !== 'windows').map(d => [d.n, d.d, d.s, d.m, d.u, d.p, artText[d.art] || d.art]))

  titel(`Drivers installed additionally (${r.treiberGesamt} checked: ${r.treiberMicrosoft} Microsoft, ${a.treiberBeiliegend} in-box third-party, ${a.treiber.length} additional)`)
  tabelle(['Name', 'Description', 'Vendor', 'Version', 'State', 'Type', 'Signer', 'Assigned to'], a.treiber.map(t => [t.n, t.b || t.d, t.h, t.v, t.s, t.a, t.sig, t.art === 'anwendung' ? (t.zu || 'application') : t.art === 'agent' ? 'security/management agent' : t.art === 'hardware' ? 'hardware / virtual device' : 'not assigned']))
  titel('File-system minifilters')
  if (r.filterFehlt) tabelle(['Name'], [], 'could not be read (fltmc needs administrator rights)')
  else tabelle(['Name', 'Altitude', 'Class', 'Instances', 'Vendor'], r.filter.map(f => { const t = r.treiber.find(x => x.n.toLowerCase() === f.n.toLowerCase()); return [f.n, f.h, filterKlasse(f.h), f.i, t && !liegtWindowsBei(t) ? (t.h || t.sig) : 'Microsoft / in-box'] }))
  if (r.bindungen.length) { titel('Network bindings not from Microsoft'); tabelle(['Adapter', 'Component', 'Name'], r.bindungen.map(b => [b.a, b.k, b.d])) }

  titel('Scheduled tasks (non-Microsoft)')
  tabelle(['Path', 'Name', 'State', 'Runs as', 'Program', 'Restart command found', 'Last run'], r.aufgaben.map(t => [t.pf, t.n, t.s, t.u, t.prog.join(', '), [...t.tok, ...t.sk.flatMap(k => k.tok.map(x => `${x} (${k.p})`))].join('; ') || (t.sk.some(k => !k.lesbar) ? 'script not readable' : 'no'), minute(t.l)]))
  titel('Services with recovery action “Restart the computer”')
  tabelle(['Service'], r.dienstNeustart.map(n => [n]))

  const klasse: Record<string, string> = { update: 'Windows Update/servicing', admin: 'administrator', fern: 'remote management', host: 'Hyper-V host', installer: 'installer', skript: 'script as SYSTEM', anwendung: 'non-Windows process' }
  titel('Planned restarts/shutdowns (event 1074)')
  tabelle(['Time', 'Process', 'Type', 'Reason', 'User', 'Class', 'Comment'], a.neustarts.map(n => [minute(n.t), n.proz, n.art, n.grund, n.wer, klasse[n.klasse] || n.klasse, n.kommentar]))

  titel('Unexpected stops (Kernel-Power 41 / EventLog 6008)')
  tabelle(['Last sign of life', 'OS started again', 'Events', 'Bugcheck code', 'Source of time'], r.unerwartet.map(u => [minute(u.aus), minute(u.start), u.ids.join(', '), u.ids.includes(41) ? (u.bug || '0') : 'n/a', u.ausQuelle === '6008' ? 'event 6008' : u.ausQuelle ? 'last log entry' : '']))
  for (const u of r.unerwartet) {
    const b = ausfallBefund(u)
    if (!b.davor.length) continue
    titel(`Events in the ${r.vorMin} min before the stop of ${minute(u.aus || u.start)}`)
    tabelle(['Time', 'Log', 'Source', 'ID', 'Level', 'Message'], b.davor.map(e => [minute(e.t), e.l, e.q, e.id, e.st === 1 ? 'critical' : e.st === 2 ? 'error' : 'warning', e.m]))
  }
  if (r.bugcheck.length) { titel('Bugcheck events'); tabelle(['Time', 'Message'], r.bugcheck.map(x => [minute(x.t), x.m])) }

  titel('Installer events (MsiInstaller)')
  tabelle(['Time', 'Action', 'Product', 'Version'], r.msi.map(m => [minute(m.t), m.id === 1034 ? 'removed' : m.id === 1036 ? 'update' : 'installed', m.n, m.v]))
  titel('Windows updates')
  tabelle(['Date', 'Update'], [...r.hotfix.map(h => [h.d, `${h.id} (${h.a})`] as (string | number)[]), ...r.updates.filter(u => /KB\d{6,}/.test(u.n)).map(u => [u.t.slice(0, 10), u.n] as (string | number)[])])
  titel('New services/drivers registered (event 7045)')
  tabelle(['Time', 'Service', 'File', 'Type'], r.neueDienste.map(d => [minute(d.t), d.n, d.datei, d.art]))

  titel(`System log: errors and critical events by source${r.sysFehlerGekappt ? ' (most recent 4000 only)' : ''}`)
  tabelle(['Source', 'ID', 'Count', 'Last', 'Last message'], r.sysFehler.map(x => [x.q, x.id, x.n, minute(x.l), x.m]))
  titel('Storage-related events')
  tabelle(['Source', 'ID', 'Count', 'Last', 'Last message'], r.speicherEreignisse.map(x => [x.q, x.id, x.n, minute(x.l), x.m]))
  titel('Application crashes and hangs')
  tabelle(['Type', 'Application', 'Module', 'Count', 'Last'], r.abstuerze.map(x => [x.art, x.app, x.modul, x.n, minute(x.l)]))
  if (r.ressourcen.length) { titel('Resource exhaustion'); tabelle(['Time', 'Message'], r.ressourcen.map(x => [minute(x.t), x.m])) }
  if (r.whea.length) { titel('Hardware error events (WHEA)'); tabelle(['Time', 'ID', 'Message'], r.whea.map(x => [minute(x.t), x.id, x.m])) }
}

/** Mappe bauen (ohne zu speichern) — auch für Tests. */
export async function baueMappe(server: ExportServer[], opt: { daten: boolean }): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'
  wb.created = new Date()
  for (const s of server) antwortBlatt(wb, s)
  if (opt.daten) for (const s of server) datenBlatt(wb, s)
  return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

export async function exportiere(server: ExportServer[], opt: { daten: boolean }): Promise<{ ok: boolean; pfad?: string; abgebrochen?: boolean; fehler?: string }> {
  if (!server.length) return { ok: false, fehler: 'Kein Server mit gelesenen Daten gewählt.' }
  const d = new Date()
  const stempel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const name = `Analysis applications HCI_${server.length === 1 ? server[0].host : `${server.length} servers`}_${stempel}.xlsx`
  try {
    const ziel = await api().saveFileDialog(name, [{ name: 'Excel', extensions: ['xlsx'] }])
    if (!ziel) return { ok: true, abgebrochen: true }
    const pfad = /\.xlsx$/i.test(ziel) ? ziel : `${ziel}.xlsx`
    const r = await api().writeFile(pfad, u8ToB64(await baueMappe(server, opt)))
    if (!r.success) return { ok: false, fehler: r.error || 'Datei konnte nicht gespeichert werden.' }
    api().openPath(pfad).catch(() => {})
    return { ok: true, pfad }
  } catch (e) { return { ok: false, fehler: e instanceof Error ? e.message : String(e) } }
}
