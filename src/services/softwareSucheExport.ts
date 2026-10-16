// ── Software-Suche: Export als PDF und Excel — mit Standort-Karten IN der Datei ──
//
// PDF (pdf-lib):
//   • Tabelle (A4 quer): Nr · Hostname · Corp-ID · Name · Modell · Kommentar · Standort · „Karte ›"
//   • je Karte eine Übersichtsseite (alle PCs der Liste nummeriert) und je PC mit Standort
//     eine eigene Kartenseite (PC groß markiert). Der Lageplan wird als VEKTOR-Seite
//     eingebettet (embedPage: einmal in der Datei, beliebig oft gezeichnet) → scharf zoombar.
//   • „Karte ›" in der Tabelle springt per interner PDF-Verknüpfung zur Kartenseite,
//     „‹ Zurück zur Liste" wieder zurück.
// Excel (exceljs):
//   • Blatt „Ergebnis" mit Hyperlink „Standort anzeigen" je PC
//   • je Karte ein Blatt mit dem Plan als Bild (pdf.js → Canvas) + nummerierten Markern;
//     der Link springt auf die Zelle unter dem Marker (festes 24-px-Zellraster).

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type PDFEmbeddedPage, type PDFRef } from 'pdf-lib'
import ExcelJS from 'exceljs'
import { api } from '../electronAPI'
import { DEVICE_MAPS } from './deviceMaps'
import pdfjsLib from '../components/accessPoints/pdfjsSetup'
import type { SucheZeile } from './softwareSuche'

export interface ExportKopf { titel: string; software: string[]; scanStand?: string }

function b64ToU8(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64
  const bin = atob(clean); const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}
function u8ToB64(u: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < u.byteLength; i += 8192) bin += String.fromCharCode(...u.subarray(i, i + 8192))
  return btoa(bin)
}
const jetzt = () => new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const datei = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80)
const standortText = (z: SucheZeile) => (z.standort ? `${z.standort.label}${z.standort.arbeitsplatz ? ` · ${z.standort.arbeitsplatz}` : ''}` : '')

async function speichere(name: string, ext: 'pdf' | 'xlsx', bytes: Uint8Array): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  const pfad = await api().saveFileDialog(`${datei(name)}.${ext}`, [{ name: ext === 'pdf' ? 'PDF' : 'Excel', extensions: [ext] }])
  if (!pfad) return { ok: true, cancelled: true }
  const r = await api().writeFile(pfad, u8ToB64(bytes))
  if (!r.success) return { ok: false, error: r.error || 'Datei konnte nicht gespeichert werden.' }
  api().openPath(pfad).catch(() => {})
  return { ok: true }
}

/** Nummerierung wie in der Tabelle (1-basiert, Reihenfolge der Zeilen). */
const nummern = (zeilen: SucheZeile[]) => zeilen.map((z, i) => ({ z, n: i + 1 }))

// ══ PDF ════════════════════════════════════════════════════════════════════════

const ROT = rgb(0.86, 0.1, 0.1), WEISS = rgb(1, 1, 1), SCHWARZ = rgb(0, 0, 0)
const TEXT = rgb(0.05, 0.07, 0.12), GRAU = rgb(0.4, 0.45, 0.55), BLAU = rgb(0.1, 0.35, 0.85), ZEBRA = rgb(0.95, 0.96, 0.98)
const GRAU_MARKER = rgb(0.45, 0.45, 0.5)

// Buchstaben ohne Zerlegung in Grundbuchstabe + Akzent (NFD hilft hier nicht)
const ERSATZ: Record<string, string> = { 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ø': 'O', 'ø': 'o', 'Ħ': 'H', 'ħ': 'h', 'ı': 'i' }

/** Text auf WinAnsi (Standardschrift) bringen — fremde Zeichen (ł, č, …) ohne Akzent statt Absturz. */
function sicher(font: PDFFont, s: string): string {
  let out = ''
  for (const ch of s || '') {
    try { font.encodeText(ch); out += ch } catch {
      const ohne = ERSATZ[ch] ?? ch.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      try { font.encodeText(ohne); out += ohne } catch { out += '?' }
    }
  }
  return out
}

function kuerze(font: PDFFont, s: string, size: number, maxW: number): string {
  let t = sicher(font, s)
  if (font.widthOfTextAtSize(t, size) <= maxW) return t
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxW) t = t.slice(0, -1)
  return t + '…'
}

/** Interne Verknüpfung (Klickfläche → Zielseite, ganze Seite einpassen). */
function verlinke(out: PDFDocument, page: PDFPage, rect: [number, number, number, number], ziel: PDFRef) {
  const ctx = out.context
  const annot = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0], Dest: [ziel, 'Fit'] }))
  page.node.addAnnot(annot)
}

/**
 * Kreis als eigener Bézier-Pfad. NICHT page.drawCircle: pdf-lib 1.17 schreibt dort den
 * Pfad in q…Q und füllt erst danach — strenge Viewer (pdf.js) brechen an der Stelle ab
 * und zeichnen den REST DER SEITE nicht mehr (Marker + Zurück-Link fehlten).
 */
function kreis(page: PDFPage, x: number, y: number, r: number, o: { fill?: ReturnType<typeof rgb>; stroke?: ReturnType<typeof rgb>; width?: number; opacity?: number }) {
  const k = 0.5523 * r
  const pfad = `M ${r} 0 C ${r} ${k} ${k} ${r} 0 ${r} C ${-k} ${r} ${-r} ${k} ${-r} 0 C ${-r} ${-k} ${-k} ${-r} 0 ${-r} C ${k} ${-r} ${r} ${-k} ${r} 0 Z`
  page.drawSvgPath(pfad, { x, y, color: o.fill, opacity: o.opacity, borderColor: o.stroke, borderWidth: o.stroke ? o.width ?? 1 : undefined })
}

function marker(page: PDFPage, font: PDFFont, x: number, y: number, label: string, groesse: number, gross: boolean) {
  const r = gross ? groesse * 1.6 : groesse
  if (gross) {
    // Fadenkreuz + Ring, damit der PC auf großen Plänen sofort ins Auge fällt
    kreis(page, x, y, r * 3.2, { stroke: ROT, width: r * 0.35 })
    page.drawLine({ start: { x: x - r * 6, y }, end: { x: x - r * 3.4, y }, color: ROT, thickness: r * 0.3 })
    page.drawLine({ start: { x: x + r * 3.4, y }, end: { x: x + r * 6, y }, color: ROT, thickness: r * 0.3 })
    page.drawLine({ start: { x, y: y - r * 6 }, end: { x, y: y - r * 3.4 }, color: ROT, thickness: r * 0.3 })
    page.drawLine({ start: { x, y: y + r * 3.4 }, end: { x, y: y + r * 6 }, color: ROT, thickness: r * 0.3 })
  }
  kreis(page, x, y, r + r * 0.3, { fill: WEISS, opacity: 0.95 })
  kreis(page, x, y, r, { fill: gross ? ROT : GRAU_MARKER })
  if (label) {
    const fs = gross ? r * 1.6 : r * 1.3
    const t = sicher(font, label)
    const tw = font.widthOfTextAtSize(t, fs), th = font.heightAtSize(fs)
    const lx = x + r * (gross ? 6.5 : 1.8), ly = y - th / 2
    page.drawRectangle({ x: lx - fs * 0.3, y: ly - fs * 0.25, width: tw + fs * 0.6, height: th + fs * 0.5, color: gross ? ROT : SCHWARZ, opacity: gross ? 0.95 : 0.7 })
    page.drawText(t, { x: lx, y: ly, size: fs, font, color: WEISS })
  }
}

export async function exportSuchePdf(zeilen: SucheZeile[], kopf: ExportKopf): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  try {
    const out = await PDFDocument.create()
    out.setTitle(kopf.titel); out.setProducer('IT Admin Tool'); out.setCreator('IT Admin Tool'); out.setCreationDate(new Date())
    const font = await out.embedFont(StandardFonts.Helvetica)
    const fett = await out.embedFont(StandardFonts.HelveticaBold)
    const liste = nummern(zeilen)

    // ── Tabelle ──
    const W = 842, H = 595, M = 32
    const sp = { nr: M, host: M + 24, corp: M + 122, name: M + 180, modell: M + 292, komm: M + 412, ort: M + 582, karte: M + 726 }
    const tabSeiten: PDFPage[] = []
    const kartenLinks: { page: PDFPage; rect: [number, number, number, number]; n: number }[] = []
    const seiteVonZeile = new Map<number, PDFPage>()
    let page = out.addPage([W, H]); tabSeiten.push(page)
    let y = H - M
    const kopfzeile = (erste: boolean) => {
      page.drawText(kuerze(fett, erste ? kopf.titel : `${kopf.titel} (Forts.)`, erste ? 16 : 12, W - 2 * M), { x: M, y: y - 14, size: erste ? 16 : 12, font: fett, color: BLAU })
      y -= erste ? 30 : 24
      if (erste) {
        const info = `${zeilen.length} PC(s) · Software: ${kopf.software.join(', ')} · erstellt ${jetzt()}${kopf.scanStand ? ` · Software-Scan Stand ${kopf.scanStand}` : ''}`
        page.drawText(kuerze(font, info, 8.5, W - 2 * M), { x: M, y, size: 8.5, font, color: GRAU })
        y -= 12
        page.drawText(sicher(font, '„Karte ›" anklicken = Standort des PCs auf der beigefügten Karte anzeigen.'), { x: M, y, size: 8, font, color: GRAU })
        y -= 16
      }
      const kopfText: [number, string][] = [[sp.nr, 'Nr.'], [sp.host, 'Hostname'], [sp.corp, 'Corp-ID'], [sp.name, 'Name'], [sp.modell, 'Modell'], [sp.komm, 'Kommentar'], [sp.ort, 'Standort'], [sp.karte, 'Karte']]
      for (const [x, t] of kopfText) page.drawText(t, { x, y, size: 8, font: fett, color: GRAU })
      y -= 5
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, color: GRAU, thickness: 0.5 })
      y -= 13
    }
    kopfzeile(true)
    liste.forEach(({ z, n }, i) => {
      if (y < M + 14) { page = out.addPage([W, H]); tabSeiten.push(page); y = H - M; kopfzeile(false) }
      if (i % 2 === 1) page.drawRectangle({ x: M - 3, y: y - 3, width: W - 2 * M + 6, height: 13, color: ZEBRA })
      const fs = 8.5
      page.drawText(String(n), { x: sp.nr, y, size: fs, font, color: GRAU })
      page.drawText(kuerze(fett, z.hostname, fs, sp.corp - sp.host - 4), { x: sp.host, y, size: fs, font: fett, color: TEXT })
      page.drawText(kuerze(font, z.corpId || '—', fs, sp.name - sp.corp - 4), { x: sp.corp, y, size: fs, font, color: TEXT })
      page.drawText(kuerze(font, z.name || '—', fs, sp.modell - sp.name - 4), { x: sp.name, y, size: fs, font, color: TEXT })
      page.drawText(kuerze(font, z.modell || '—', fs, sp.komm - sp.modell - 4), { x: sp.modell, y, size: fs, font, color: TEXT })
      page.drawText(kuerze(font, z.kommentar || '', fs - 0.5, sp.ort - sp.komm - 4), { x: sp.komm, y, size: fs - 0.5, font, color: GRAU })
      page.drawText(kuerze(font, standortText(z) || 'kein Standort', fs, sp.karte - sp.ort - 4), { x: sp.ort, y, size: fs, font, color: z.standort ? TEXT : GRAU })
      if (z.standort) {
        const t = 'Karte ›'
        page.drawText(sicher(fett, t), { x: sp.karte, y, size: fs, font: fett, color: BLAU })
        const tw = fett.widthOfTextAtSize(sicher(fett, t), fs)
        kartenLinks.push({ page, rect: [sp.karte - 2, y - 3, sp.karte + tw + 2, y + 10], n })
      }
      seiteVonZeile.set(n, page)
      y -= 14
    })

    // ── Karten ──
    const zielSeite = new Map<number, PDFRef>()          // Nr → Kartenseite des PCs
    const uebersichtLinks: { label: string; ref: PDFRef }[] = []
    for (const karte of DEVICE_MAPS) {
      const hier = liste.filter(x => x.z.standort?.mapId === karte.id)
      if (!hier.length) continue
      const asset = await api().readAsset(karte.planAsset)
      if (!asset.success || !asset.data) continue
      const src = await PDFDocument.load(b64ToU8(asset.data), { ignoreEncryption: true })
      const eingebettet = new Map<number, PDFEmbeddedPage>()
      const planSeite = async (p: number) => {
        const idx = Math.min(Math.max(p, 1), src.getPageCount()) - 1
        if (!eingebettet.has(idx)) eingebettet.set(idx, await out.embedPage(src.getPage(idx)))
        return eingebettet.get(idx)!
      }
      const neueSeite = async (planNr: number, titel: string, unterzeile: string) => {
        const plan = await planSeite(planNr)
        const pw = plan.width, ph = plan.height
        const band = Math.max(48, ph * 0.07)
        const s = out.addPage([pw, ph + band])
        s.drawPage(plan, { x: 0, y: 0, width: pw, height: ph })
        const k = pw / 842
        s.drawRectangle({ x: 0, y: ph, width: pw, height: band, color: WEISS })
        s.drawText(kuerze(fett, titel, 15 * k, pw * 0.7), { x: 18 * k, y: ph + band - 22 * k, size: 15 * k, font: fett, color: TEXT })
        s.drawText(kuerze(font, unterzeile, 9 * k, pw * 0.7), { x: 18 * k, y: ph + band - 36 * k, size: 9 * k, font, color: GRAU })
        return { s, pw, ph, band, k }
      }

      // Übersicht dieser Karte (alle PCs der Liste, nummeriert)
      const seiten = [...new Set(hier.map(x => x.z.standort!.page))]
      for (const p of seiten) {
        const { s, pw, ph, k } = await neueSeite(p, `Übersicht: ${karte.label}`, `${hier.length} PC(s) aus der Liste · Nummern = Spalte „Nr." der Tabelle`)
        for (const { z, n } of hier.filter(x => x.z.standort!.page === p)) marker(s, fett, z.standort!.x * pw, (1 - z.standort!.y) * ph, `${n}`, 4.5 * k, false)
        uebersichtLinks.push({ label: karte.label, ref: s.ref })
      }

      // Je PC eine eigene Kartenseite
      for (const { z, n } of hier) {
        const st = z.standort!
        const { s, pw, ph, band, k } = await neueSeite(st.page, `Nr. ${n} · ${z.hostname} — ${karte.label}${st.arbeitsplatz ? ` · ${karte.roomLabel} ${st.arbeitsplatz}` : ''}`,
          [z.name, z.corpId && `(${z.corpId})`, z.modell].filter(Boolean).join(' · '))
        for (const { z: o, n: on } of hier) if (on !== n && o.standort!.page === st.page) marker(s, fett, o.standort!.x * pw, (1 - o.standort!.y) * ph, `${on}`, 3.5 * k, false)
        marker(s, fett, st.x * pw, (1 - st.y) * ph, `${n} ${z.hostname}`, 5 * k, true)
        // „‹ Zurück zur Liste"
        const zt = sicher(fett, '‹ Zurück zur Liste'), zs = 10 * k
        const zw = fett.widthOfTextAtSize(zt, zs), zx = pw - zw - 18 * k, zy = ph + band - 24 * k
        s.drawText(zt, { x: zx, y: zy, size: zs, font: fett, color: BLAU })
        verlinke(out, s, [zx - 4, zy - 4, zx + zw + 4, zy + zs + 2], seiteVonZeile.get(n)!.ref)
        zielSeite.set(n, s.ref)
      }
    }

    // Links aus der Tabelle setzen (erst jetzt sind die Kartenseiten bekannt)
    for (const l of kartenLinks) { const ziel = zielSeite.get(l.n); if (ziel) verlinke(out, l.page, l.rect, ziel) }
    // Übersichtskarten auf der ersten Tabellenseite verlinken
    if (uebersichtLinks.length) {
      const p0 = tabSeiten[0]; let x = M
      const yy = M - 14
      p0.drawText('Übersichtskarten:', { x, y: yy, size: 8, font: fett, color: GRAU }); x += fett.widthOfTextAtSize('Übersichtskarten:', 8) + 6
      for (const u of uebersichtLinks) {
        const t = sicher(fett, u.label + ' ›'); const tw = fett.widthOfTextAtSize(t, 8)
        p0.drawText(t, { x, y: yy, size: 8, font: fett, color: BLAU })
        verlinke(out, p0, [x - 2, yy - 3, x + tw + 2, yy + 9], u.ref)
        x += tw + 12
      }
    }

    return await speichere(kopf.titel, 'pdf', await out.save())
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ══ Excel ══════════════════════════════════════════════════════════════════════

const ZELLE = 24          // Kartenblatt: festes Raster 24 × 24 px
const KOPF_ZEILEN = 3     // Titel/Link-Zeilen über dem Kartenbild
const BILD_BREITE = 2200  // Plan-Rendering in Pixeln (Breite)

/** Lageplan-Seite mit pdf.js rendern und Marker einzeichnen → PNG (Base64) + Pixelgröße. */
async function planAlsBild(asset: string, seite: number, punkte: { x: number; y: number; n: number }[]): Promise<{ b64: string; w: number; h: number } | null> {
  const a = await api().readAsset(asset)
  if (!a.success || !a.data) return null
  const doc = await pdfjsLib.getDocument({ data: b64ToU8(a.data) }).promise
  try {
    const p = await doc.getPage(Math.min(Math.max(seite, 1), doc.numPages))
    const v0 = p.getViewport({ scale: 1 })
    const vp = p.getViewport({ scale: BILD_BREITE / v0.width })
    const c = document.createElement('canvas')
    c.width = Math.round(vp.width); c.height = Math.round(vp.height)
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
    await p.render({ canvasContext: g, viewport: vp } as Parameters<typeof p.render>[0]).promise
    const r = Math.max(9, c.width * 0.006)
    for (const pt of punkte) {
      const x = pt.x * c.width, y = pt.y * c.height
      g.beginPath(); g.arc(x, y, r * 1.35, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill()
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = '#dc1a1a'; g.fill()
      g.font = `bold ${Math.round(r * 1.5)}px Arial`; g.textBaseline = 'middle'
      const t = String(pt.n), tw = g.measureText(t).width
      g.fillStyle = 'rgba(0,0,0,0.78)'; g.fillRect(x + r * 1.6, y - r * 1.05, tw + r * 0.9, r * 2.1)
      g.fillStyle = '#fff'; g.fillText(t, x + r * 2.05, y)
    }
    const b64 = c.toDataURL('image/png').split(',')[1]
    return { b64, w: c.width, h: c.height }
  } finally { void doc.destroy() }
}

function blattName(s: string, belegt: Set<string>): string {
  let n = ('Karte ' + s).replace(/[\\/?*[\]:]/g, '-').slice(0, 31)
  let i = 2
  while (belegt.has(n.toLowerCase())) n = n.slice(0, 28) + ' ' + i++
  belegt.add(n.toLowerCase())
  return n
}

export async function exportSucheExcel(zeilen: SucheZeile[], kopf: ExportKopf): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  try {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'IT Admin Tool'; wb.created = new Date()
    const liste = nummern(zeilen)
    const ws = wb.addWorksheet('Ergebnis', { views: [{ state: 'frozen', ySplit: 4 }] })
    ws.getCell('A1').value = kopf.titel
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1A59D9' } }
    ws.getCell('A2').value = `${zeilen.length} PC(s) · Software: ${kopf.software.join(', ')} · erstellt ${jetzt()}${kopf.scanStand ? ` · Software-Scan Stand ${kopf.scanStand}` : ''}`
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF667085' } }
    const spalten = ['Nr.', 'Hostname', 'Corp-ID', 'Name', 'Modell', 'Kommentar', 'Standort', 'Karte', 'Software']
    const breiten = [6, 18, 12, 24, 26, 36, 30, 20, 50]
    ws.getRow(4).values = spalten
    ws.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A93' } }
    breiten.forEach((b, i) => { ws.getColumn(i + 1).width = b })
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + liste.length, column: spalten.length } }

    // Kartenblätter vorbereiten (eines je Karte + Seite), Ziel-Zelle je PC berechnen
    const belegt = new Set<string>(['ergebnis'])
    const ziel = new Map<number, string>()     // Nr → "'Blatt'!C12"
    for (const karte of DEVICE_MAPS) {
      const hier = liste.filter(x => x.z.standort?.mapId === karte.id)
      for (const seite of [...new Set(hier.map(x => x.z.standort!.page))]) {
        const aufSeite = hier.filter(x => x.z.standort!.page === seite)
        const bild = await planAlsBild(karte.planAsset, seite, aufSeite.map(x => ({ x: x.z.standort!.x, y: x.z.standort!.y, n: x.n })))
        if (!bild) continue
        const name = blattName(karte.label + (seite > 1 ? ` S${seite}` : ''), belegt)
        const ks = wb.addWorksheet(name)
        const spaltenN = Math.ceil(bild.w / ZELLE) + 2, zeilenN = Math.ceil(bild.h / ZELLE) + KOPF_ZEILEN + 2
        for (let c = 1; c <= spaltenN; c++) ks.getColumn(c).width = 2.71          // ≈ 24 px
        for (let r = 1; r <= zeilenN; r++) ks.getRow(r).height = 18               // 18 pt = 24 px
        ks.getCell('A1').value = `${karte.label} — ${aufSeite.length} PC(s) aus der Liste (Nummern = Spalte „Nr.")`
        ks.getCell('A1').font = { bold: true, size: 12 }
        ks.getCell('A2').value = { text: '‹ Zurück zur Liste', hyperlink: "#'Ergebnis'!A1" }
        ks.getCell('A2').font = { color: { argb: 'FF1A59D9' }, underline: true }
        const img = wb.addImage({ base64: bild.b64, extension: 'png' })
        ks.addImage(img, { tl: { col: 0, row: KOPF_ZEILEN }, ext: { width: bild.w, height: bild.h } })
        for (const { z, n } of aufSeite) {
          const col = Math.floor((z.standort!.x * bild.w) / ZELLE) + 1
          const row = Math.floor((z.standort!.y * bild.h) / ZELLE) + KOPF_ZEILEN + 1
          ziel.set(n, `'${name.replace(/'/g, "''")}'!${ks.getColumn(col).letter}${row}`)
        }
      }
    }

    liste.forEach(({ z, n }, i) => {
      const r = ws.getRow(5 + i)
      r.values = [n, z.hostname, z.corpId, z.name, z.modell, z.kommentar, standortText(z) || 'kein Standort', '', z.software]
      const zl = ziel.get(n)
      if (zl) { const c = r.getCell(8); c.value = { text: 'Standort anzeigen', hyperlink: '#' + zl }; c.font = { color: { argb: 'FF1A59D9' }, underline: true } }
      if (i % 2 === 1) r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F7' } }
    })

    const buf = await wb.xlsx.writeBuffer()
    return await speichere(kopf.titel, 'xlsx', new Uint8Array(buf as ArrayBuffer))
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
