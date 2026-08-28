// ── SolidWorks-Diagnose: PDF-Erzeugung (Einzelbericht + Sammelbericht) ────────
// Einzel-PDF je Lauf (Dateiname trägt PC-Name + Anwender) und Sammel-PDF über
// alle PCs: Seite 1 = klickbares Inhaltsverzeichnis (PC-Nr. → Seite), danach je
// PC ein Abschnitt, der IMMER mit PC-Name + Anwender beginnt.
// Speichern über saveFileDialog + writeFile (Base64), wie in PCDiagnosis.

import { jsPDF } from 'jspdf'
import { api } from '../electronAPI'
import type { SwLauf, SwKennwerte } from './swCheck.types'

const PAGE_W = 210, MARGIN = 14, MAX_Y = 282

function fmt(iso: string): string { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString('de-DE') }

const K = (l: SwLauf): SwKennwerte => l.kennwerte ?? {}
const ipOf = (l: SwLauf): string => (K(l).ip as string) || '—'

/** PC (klein) → zugewiesener Besitzer aus der Endgeräte-Übersicht (Fallback-Anwender). */
export type BesitzerMap = Map<string, string>

/** Anwender roh: angemeldeter Benutzer aus dem Bericht, sonst zugewiesener Besitzer, sonst leer. */
function anwenderRoh(l: SwLauf, besitzer?: BesitzerMap): string {
  const b = String(K(l).benutzer ?? '').trim()
  if (b) return b
  return (besitzer?.get(l.pc.toLowerCase()) ?? '').trim()
}
/** Anwender für die Anzeige (voller Wert, z. B. "DEHAM\\muster" bleibt lesbar). */
function anwenderText(l: SwLauf, besitzer?: BesitzerMap): string { return anwenderRoh(l, besitzer) || 'unbekannt' }
/** Angemeldeter Benutzer aus dem Bericht (nur der gemessene Wert, ohne Besitzer-Fallback). */
function benutzerText(l: SwLauf): string { return String(K(l).benutzer ?? '').trim() || 'unbekannt' }
/** Zugewiesener Besitzer aus der Endgeräte-Übersicht (assignedTo). */
function besitzerText(l: SwLauf, besitzer?: BesitzerMap): string { return (besitzer?.get(l.pc.toLowerCase()) ?? '').trim() || '—' }
/** Anwender für Dateinamen: Domäne abtrennen, Sonderzeichen ersetzen. */
function anwenderSlug(l: SwLauf, besitzer?: BesitzerMap): string {
  const raw = anwenderRoh(l, besitzer)
  const short = raw.includes('\\') ? raw.split('\\').pop()! : raw
  return sanitizeName(short) || 'unbekannt'
}
/** Für Dateinamen tauglich machen (Windows-verbotene Zeichen, Leerzeichen). */
export function sanitizeName(s: string): string {
  return (s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
}
/** Dateistamm eines Einzel-Laufs: SWDiagnose_<PC>_<Anwender>_<Zeit>. */
export function laufDateiStamm(l: SwLauf, besitzer?: BesitzerMap): string {
  const zeit = l.ranAt.slice(0, 16).replace(/[:T]/g, '-')
  return `SWDiagnose_${sanitizeName(l.pc)}_${anwenderSlug(l, besitzer)}_${zeit}`
}

interface TextOpts { size?: number; style?: 'normal' | 'bold'; font?: 'helvetica' | 'courier'; color?: [number, number, number]; indent?: number }

/**
 * Schreib-Helfer. `measure: true` = alles wie im echten Lauf (Seitenumbrüche,
 * y-Fortschritt, splitTextToSize), NUR ohne die teure doc.text()-Ausgabe — damit
 * lässt sich die Seitenlage vorab exakt und schnell ausmessen (fürs Inhaltsverz.).
 */
function makeWriter(doc: jsPDF, opts: { measure?: boolean } = {}) {
  const draw = !opts.measure
  let y = 16
  const ensure = (n: number) => { if (y + n > MAX_Y) { doc.addPage(); y = 16 } }
  const text = (s: unknown, o: TextOpts = {}) => {
    const size = o.size ?? 9, font = o.font ?? 'helvetica', style = o.style ?? 'normal', indent = o.indent ?? 0
    const c = o.color ?? [40, 40, 40]
    doc.setFont(font, style); doc.setFontSize(size)   // auch im Messmodus nötig (Breitenmaß)
    if (draw) doc.setTextColor(c[0], c[1], c[2])
    const lh = size * 0.42 + 1.4
    const raw = String(s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '  ').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    const width = PAGE_W - 2 * MARGIN - indent
    let lines: string[] = []
    try { lines = doc.splitTextToSize(raw.length ? raw : ' ', width) } catch { lines = raw.split('\n') }
    for (const ln0 of lines) {
      let ln = ln0
      while (ln.length > 0) { const chunk = ln.slice(0, 400); ln = ln.slice(400); ensure(lh); if (draw) doc.text(chunk, MARGIN + indent, y); y += lh }
      if (ln0.length === 0) { ensure(lh); y += lh }
    }
  }
  const gap = (n = 2) => { y += n }
  const heading = (s: string, size = 12) => {
    gap(3); ensure(size * 0.5 + 5)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(size)
    if (draw) { doc.setTextColor(20, 20, 20); doc.text(String(s), MARGIN, y) }
    y += size * 0.45 + 1.5
    if (draw) { doc.setDrawColor(205); doc.line(MARGIN, y, PAGE_W - MARGIN, y) }
    y += 3
  }
  const newPage = () => { doc.addPage(); y = 16 }
  const pageNo = () => doc.getNumberOfPages()
  return { text, gap, heading, newPage, pageNo }
}

function footer(doc: jsPDF, label: string) {
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(150, 150, 150)
    doc.text(label, MARGIN, 290)
    doc.text(`Seite ${p} / ${pages}`, PAGE_W - MARGIN - 20, 290)
  }
}

function laufBody(w: ReturnType<typeof makeWriter>, lauf: SwLauf, mitText: boolean, onScriptPage?: (scriptIndex: number, seite: number) => void) {
  if (lauf.auffaelligkeiten.length) {
    w.heading('Auffälligkeiten', 11)
    for (const a of lauf.auffaelligkeiten) w.text('• ' + a, { size: 9, color: [155, 55, 20], indent: 2 })
  } else {
    w.text('Keine Auffälligkeiten.', { size: 9, color: [40, 130, 60] })
  }
  const k = K(lauf)
  w.heading('Kennwerte', 11)
  const kv: [string, unknown][] = [
    ['SOLIDWORKS-Version', k.swVersion], ['Benutzer', k.benutzer], ['Toolbox', k.toolboxPfad],
    ['AutoRecover', k.autoRecover], ['Backup', k.backupPfad], ['Defender SOLIDWORKS', k.defenderSw],
    ['Defender C:\\PortaX', k.defenderPortaX], ['Energieplan', k.energieplan], ['Adapter-Energiesparen', k.adapterEnergie],
    ['Latenz w3143 (ms)', k.latenzW3143], ['C: frei (%)', k.cFreiPct], ['GPU + Treiber', k.gpu],
    ['Uptime (Tage)', k.uptimeTage], ['Abstürze 30 Tage', k.abstuerze30d],
  ]
  for (const [label, val] of kv) w.text(`${label}: ${val === undefined || val === null || val === '' ? '—' : val}`, { size: 8.5, indent: 2 })
  // ALLE Skript-Berichte vollständig — jeder Block einzeln abgesichert, damit ein
  // jsPDF-Fehler (oder ein sehr großer Bericht wie die Tiefenanalyse) keinen anderen verdrängt.
  if (mitText) lauf.skripte.forEach((s, si) => {
    const len = (s.textBericht || '').length
    w.heading(`${s.titel} (${s.ziel})${s.ok ? '' : ' — FEHLER'}${s.ok && len ? ` — ${len.toLocaleString('de-DE')} Zeichen` : ''}`, 11)
    onScriptPage?.(si, w.pageNo())   // Startseite dieses Skripts (fürs Inhaltsverzeichnis)
    if (!s.ok) { w.text(s.fehler || 'Fehler', { color: [180, 40, 40] }); return }
    if (!len) { w.text('(kein Textbericht vorhanden)', { color: [150, 100, 40] }); return }
    try { w.text(s.textBericht, { size: 7.2, font: 'courier', color: [60, 60, 60] }) }
    catch (e) { w.text('[Bericht konnte im PDF nicht dargestellt werden: ' + (e instanceof Error ? e.message : String(e)) + ']', { color: [180, 40, 40] }) }
  })
}

/** Kopf jedes PC-Abschnitts im Sammelbericht: Nr. + PC-Name, darunter Anwender/IP/Zeit. */
function pcKopf(w: ReturnType<typeof makeWriter>, l: SwLauf, index: number, besitzer?: BesitzerMap) {
  w.heading(`${index + 1}.  ${l.pc}`, 15)
  w.text(`Angemeldet: ${benutzerText(l)}    ·    Besitzer: ${besitzerText(l, besitzer)}    ·    IP: ${ipOf(l)}`, { size: 9, color: [110, 110, 110] })
  w.text(`${fmt(l.ranAt)}    ·    Bearbeiter: ${l.ranBy}`, { size: 8.5, color: [130, 130, 130] })
}

/** Einzelner Lauf als PDF (alle Skript-Berichte vollständig). Beginnt mit PC + Anwender. */
export function buildLaufPdf(lauf: SwLauf, besitzer?: BesitzerMap): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const w = makeWriter(doc)
  w.heading(`SolidWorks-Diagnose — ${lauf.pc}`, 15)
  w.text(`Anwender: ${anwenderText(lauf, besitzer)}    ·    IP: ${ipOf(lauf)}    ·    ${fmt(lauf.ranAt)}    ·    Bearbeiter: ${lauf.ranBy}`, { size: 9, color: [110, 110, 110] })
  laufBody(w, lauf, true)
  footer(doc, `SolidWorks-Diagnose · ${lauf.pc} (${ipOf(lauf)}) · ${anwenderText(lauf, besitzer)}`)
  return doc
}

// ── Sammelbericht ────────────────────────────────────────────────────────────
// Feste Geometrie des Inhaltsverzeichnisses, damit die Seitenzahl der IHV-Seiten
// VORAB exakt bestimmbar ist (nötig, weil die Body-Seitenzahlen um genau diese
// Zahl verschoben sind). tocPages() und renderToc() MÜSSEN dieselben Werte nutzen.
const TOC_MAIN_H = 9, TOC_SCRIPT_H = 4.2, TOC_FIRST_TOP = 48, TOC_CONT_TOP = 30

interface TocScriptRef { label: string; page: number }
interface TocEntry { label: string; sub: string; page: number; scripts?: TocScriptRef[] }

/** Höhe eines IHV-Eintrags: Haupt-/Unterzeile + je Skript eine Zeile. */
function entryHeight(e: TocEntry): number {
  return TOC_MAIN_H + (e.scripts && e.scripts.length ? e.scripts.length * TOC_SCRIPT_H + 1.5 : 0)
}

/** IHV-Seitenzahl VORAB (nur aus den Eintragshöhen — hängt NICHT von den Seitenzahlen ab). */
function tocPages(entries: TocEntry[]): number {
  let pages = 1, y = TOC_FIRST_TOP
  for (const e of entries) { const h = entryHeight(e); if (y + h > MAX_Y) { pages++; y = TOC_CONT_TOP }; y += h }
  return pages
}

function fitText(doc: jsPDF, s: string, maxW: number): string {
  if (doc.getTextWidth(s) <= maxW) return s
  let t = s
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1)
  return t + '…'
}

// Eine klickbare „… Seite p"-Zeile zeichnen (rechtsbündige Seitenzahl + Punkt-Führung).
function tocLine(doc: jsPDF, label: string, page: number, y: number, o: { indent: number; size: number; bold: boolean; color: [number, number, number]; prefix?: string }) {
  const pageText = o.prefix ? `${o.prefix} ${page}` : `Seite ${page}`
  doc.setFont('helvetica', 'normal'); doc.setFontSize(o.size); const pw = doc.getTextWidth(pageText)
  const pageX = PAGE_W - MARGIN - pw
  doc.setFont('helvetica', o.bold ? 'bold' : 'normal'); doc.setFontSize(o.size); doc.setTextColor(o.color[0], o.color[1], o.color[2])
  const label2 = fitText(doc, label, pageX - MARGIN - o.indent - 6)
  doc.text(label2, MARGIN + o.indent, y)
  const dotStart = MARGIN + o.indent + doc.getTextWidth(label2) + 2, dotEnd = pageX - 2
  if (dotEnd > dotStart) {
    try { doc.setLineDashPattern([0.4, 1.2], 0); doc.setDrawColor(195); doc.line(dotStart, y - 0.8, dotEnd, y - 0.8); doc.setLineDashPattern([], 0) }
    catch { doc.setDrawColor(225); doc.line(dotStart, y - 0.8, dotEnd, y - 0.8) }
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(o.size); doc.setTextColor(60, 90, 150)
  try { doc.textWithLink(pageText, pageX, y, { pageNumber: page }) } catch { doc.text(pageText, pageX, y) }
  try { doc.link(MARGIN + o.indent, y - o.size * 0.4, PAGE_W - 2 * MARGIN - o.indent, o.size * 0.5 + 2, { pageNumber: page }) } catch { /* Link optional */ }
}

/** Zeichnet die Inhaltsverzeichnis-Seiten (belegt exakt tocPages(entries) Seiten). */
function renderToc(doc: jsPDF, titel: string, meta: string, entries: TocEntry[]) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(20, 20, 20)
  doc.text(titel, MARGIN, 22)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 110, 110)
  doc.text(meta, MARGIN, 30)
  const drawHead = (fortsetzung: boolean) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20, 20, 20)
    doc.text(fortsetzung ? 'Inhaltsverzeichnis (Fortsetzung)' : 'Inhaltsverzeichnis', MARGIN, fortsetzung ? 22 : 40)
    doc.setDrawColor(205); doc.line(MARGIN, fortsetzung ? 24 : 42, PAGE_W - MARGIN, fortsetzung ? 24 : 42)
  }
  drawHead(false)
  let y = TOC_FIRST_TOP
  for (const e of entries) {
    const h = entryHeight(e)
    if (y + h > MAX_Y) { doc.addPage(); drawHead(true); y = TOC_CONT_TOP }
    // Hauptzeile: „N. PC — Angemeldet" … Seite p
    tocLine(doc, e.label, e.page, y, { indent: 0, size: 10.5, bold: true, color: [25, 25, 25] })
    // Unterzeile: Besitzer · IP · SW · Auffälligkeiten
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130, 130, 130)
    doc.text(fitText(doc, e.sub, PAGE_W - 2 * MARGIN - 30), MARGIN + 3, y + 4.3)
    // Skript-Zeilen: wo beginnt welches der (bis zu 4) Skripte
    if (e.scripts && e.scripts.length) {
      let sy = y + TOC_MAIN_H
      for (const s of e.scripts) {
        tocLine(doc, `– ${s.label}`, s.page, sy, { indent: 8, size: 8, bold: false, color: [90, 90, 90], prefix: 'S.' })
        sy += TOC_SCRIPT_H
      }
    }
    y += h
  }
}

/** Sammelbefunde über alle PCs (Anhang, häufigste zuerst). */
function renderSammelbefunde(w: ReturnType<typeof makeWriter>, sorted: SwLauf[]) {
  w.heading('Anhang · Sammelbefunde über alle PCs (häufigste zuerst)', 14)
  const gruppen = new Map<string, string[]>()
  for (const l of sorted) for (const a of l.auffaelligkeiten) {
    const key = a.trim(); if (!gruppen.has(key)) gruppen.set(key, [])
    if (!gruppen.get(key)!.includes(l.pc)) gruppen.get(key)!.push(l.pc)
  }
  const sammel = [...gruppen.entries()].map(([b, pcs]) => ({ b, pcs })).sort((a, z) => z.pcs.length - a.pcs.length)
  if (!sammel.length) { w.text('Keine Auffälligkeiten über alle PCs.', { size: 9, color: [40, 130, 60] }); return }
  for (const s of sammel) {
    w.text(`(${s.pcs.length}×)  ${s.b}`, { size: 9, style: 'bold', color: [120, 60, 20] })
    w.text('betroffen: ' + s.pcs.join(', '), { size: 8, color: [110, 110, 110], indent: 4 })
  }
}

/**
 * Body = je PC ein Abschnitt (jeder auf eigener Seite, beginnend mit PC+Anwender)
 * + Sammelbefunde-Anhang. `record(key, seite)` meldet die Startseite jedes
 * Abschnitts ('0','1',… für PCs, 'sammel' für den Anhang).
 * Der erste PC nutzt die AKTUELLE (frische) Seite; jeder weitere eine neue.
 */
function renderBody(
  w: ReturnType<typeof makeWriter>, sorted: SwLauf[], mitEinzel: boolean,
  record?: (key: string, seite: number) => void, besitzer?: BesitzerMap,
) {
  sorted.forEach((l, i) => {
    if (i > 0) w.newPage()
    record?.(String(i), w.pageNo())
    pcKopf(w, l, i, besitzer)
    laufBody(w, l, mitEinzel, record ? (si, page) => record(`${i}:${si}`, page) : undefined)
  })
  w.newPage()
  record?.('sammel', w.pageNo())
  renderSammelbefunde(w, sorted)
}

/** Sammelbericht über alle PCs als EIN PDF: Seite 1 = Inhaltsverzeichnis. */
export function buildSammelPdf(laeufe: SwLauf[], opts: { mitEinzelberichten: boolean }, besitzer?: BesitzerMap): jsPDF {
  const sorted = [...laeufe].sort((a, b) => a.pc.toLowerCase().localeCompare(b.pc.toLowerCase()))
  const zeiten = laeufe.map(l => l.ranAt).sort()
  const von = zeiten[0] ? fmt(zeiten[0]) : '—', bis = zeiten[zeiten.length - 1] ? fmt(zeiten[zeiten.length - 1]) : '—'
  const meta = `Erzeugt am ${new Date().toLocaleString('de-DE')}   ·   ${sorted.length} PCs   ·   ${laeufe.length} Läufe   ·   ${von} bis ${bis}`

  // 1. Messlauf: Seitenlage jedes Abschnitts bestimmen (ohne Zeichnen, schnell).
  const meas = new Map<string, number>()
  const md = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  renderBody(makeWriter(md, { measure: true }), sorted, opts.mitEinzelberichten, (k, p) => meas.set(k, p), besitzer)

  // 2. Einträge zuerst als Struktur (Höhe hängt NUR an der Skriptanzahl, nicht an den
  //    Seitenzahlen) → daraus die IHV-Seitenzahl t. Dann Body um genau t Seiten verschoben.
  const entries: TocEntry[] = sorted.map((l, i) => ({
    label: `${i + 1}.  ${l.pc}   —   ${benutzerText(l)}`,
    sub: `Besitzer: ${besitzerText(l, besitzer)}  ·  IP ${ipOf(l)}  ·  ${K(l).swVersion || 'SW-Version unbekannt'}  ·  ${l.auffaelligkeiten.length} Auffälligkeiten`,
    page: 0,
    scripts: opts.mitEinzelberichten ? l.skripte.map(s => ({ label: `${s.titel} (${s.ziel})`, page: 0 })) : undefined,
  }))
  entries.push({ label: 'Anhang · Sammelbefunde über alle PCs', sub: 'gemeinsame Auffälligkeiten, häufigste zuerst', page: 0 })

  const t = tocPages(entries)
  const shift = (t + 1) - (meas.get('0') ?? 1) // Body startet final auf Seite t+1
  const seite = (key: string) => (meas.get(key) ?? 1) + shift
  sorted.forEach((l, i) => {
    entries[i].page = seite(String(i))
    entries[i].scripts?.forEach((sc, si) => { sc.page = seite(`${i}:${si}`) })
  })
  entries[entries.length - 1].page = seite('sammel')

  // 3. Finaler Lauf: IHV (belegt exakt t Seiten), dann Body ab Seite t+1.
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  renderToc(doc, 'SolidWorks-Diagnose — Sammelbericht', meta, entries)
  const w = makeWriter(doc)
  w.newPage()                                  // frische Seite t+1 für den ersten PC
  renderBody(w, sorted, opts.mitEinzelberichten, undefined, besitzer)
  footer(doc, 'SolidWorks-Diagnose · Sammelbericht')
  return doc
}

function abToB64(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf); let s = ''
  for (let i = 0; i < b.byteLength; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192))
  return btoa(s)
}

/** PDF-Bytes als Base64 (für direktes Schreiben ohne Dialog, z. B. Ordner-Stapel). */
export function pdfBase64(doc: jsPDF): string { return abToB64(doc.output('arraybuffer')) }

/** PDF speichern (Dateidialog). Gibt true zurück, wenn geschrieben. */
export async function savePdf(doc: jsPDF, defaultName: string): Promise<boolean> {
  const path = await api().saveFileDialog(defaultName, [{ name: 'PDF', extensions: ['pdf'] }])
  if (!path) return false
  const r = await api().writeFile(path, pdfBase64(doc))
  return !!r.success
}
