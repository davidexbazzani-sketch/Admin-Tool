// ── Pick-Ups – Belegerkennung (Foto / PDF / Excel) ────────────────────────────
// Ziel: Beleg hochladen → Geräte stehen sofort in der Liste.
//
// Bild (auch gescannte PDF-Seiten):
//   1. EXIF-Drehung übernehmen, auf ~2400–3200 px Kantenlänge skalieren
//   2. Barcodes lesen (Code128/39/EAN/QR/DataMatrix …) — streifenweise, damit auch
//      mehrere Barcodes untereinander gefunden werden
//   3. Texterkennung (tesseract, lokal) auf zwei aufbereiteten Varianten
//      (Kontrast gestreckt + adaptiv binarisiert), je „verstreuter Text" + „Block"
// PDF mit Textebene / Excel: Text direkt auslesen (bei leerer PDF → wie Bild).
//
// Danach Abgleich ALLER gefundenen Zeichenketten gegen die Endgeräte-Übersicht:
//   exakt (Seriennummer oder Hostname = Präfix + Seriennummer) → sicher
//   mit typischen OCR-Verwechslungen (O/0, I/1, S/5, B/8, Z/2, G/6) oder 1 Zeichen
//   Abweichung, wenn eindeutig → „korrigiert"
//   sonst nur, wenn es wie eine Seriennummer aussieht → „unbekannt" (nicht vorausgewählt,
//   außer aus einem Barcode)

import * as XLSX from 'xlsx'
import { PSM } from 'tesseract.js'
import {
  BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader, RGBLuminanceSource,
} from '@zxing/library'
import { erstelleOcrWorker } from '../pdftools/tools/ocr'
import { loadPdf, renderPageToCanvas, getAllText } from '../pdftools/tools/render'
import { normalizeSerial } from './hardwareInventory'
import { alsPickupGeraet, type GeraeteIndex, type PickupGeraet } from './pickups'

export interface Kandidat extends PickupGeraet {
  ausgewaehlt: boolean
  herkunft: 'barcode' | 'text'
}

export interface ErkennungsErgebnis {
  kandidaten: Kandidat[]
  datum: string            // YYYY-MM-DD oder ''
  datumQuelle: 'beleg' | 'foto' | ''   // vom Beleg gelesen oder Aufnahmedatum des Fotos (EXIF)
  text: string             // gesamter erkannter Text (zur Kontrolle)
  barcodes: string[]
  hinweis: string
}

export type Fortschritt = (text: string, anteil?: number) => void

const pause = () => new Promise<void>(r => setTimeout(r, 0))

// ── Bild laden + aufbereiten ──────────────────────────────────────────────────

async function bildZuCanvas(bytes: Uint8Array, mime: string): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }), { imageOrientation: 'from-image' })
  const lang = Math.max(bmp.width, bmp.height)
  // Kleine Fotos hochskalieren (Tesseract mag ~30 px hohe Zeichen), riesige begrenzen
  const f = lang < 2400 ? 2400 / lang : lang > 3200 ? 3200 / lang : 1
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return c
}

function luminanz(c: HTMLCanvasElement): Uint8ClampedArray {
  const { data } = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height)
  const lum = new Uint8ClampedArray(c.width * c.height)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) lum[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
  return lum
}

function ausLuminanz(lum: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let j = 0, i = 0; j < lum.length; j++, i += 4) { img.data[i] = img.data[i + 1] = img.data[i + 2] = lum[j]; img.data[i + 3] = 255 }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Graustufen mit gestrecktem Kontrast (2.–98. Perzentil) — gegen graue Fotos/Schatten. */
function kontrast(lum: Uint8ClampedArray): Uint8ClampedArray {
  const hist = new Uint32Array(256); for (const v of lum) hist[v]++
  const n = lum.length; let s = 0, lo = 0, hi = 255
  for (let v = 0; v < 256; v++) { s += hist[v]; if (s >= n * 0.02) { lo = v; break } }
  s = 0; for (let v = 255; v >= 0; v--) { s += hist[v]; if (s >= n * 0.02) { hi = v; break } }
  const span = Math.max(hi - lo, 1), out = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i++) out[i] = ((lum[i] - lo) * 255) / span
  return out
}

/** Adaptive Binarisierung (Bradley): robust bei ungleichmäßiger Beleuchtung im Foto. */
function binaer(lum: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const ii = new Float64Array((w + 1) * (h + 1))
  for (let y = 1; y <= h; y++) {
    let zeile = 0
    for (let x = 1; x <= w; x++) { zeile += lum[(y - 1) * w + x - 1]; ii[y * (w + 1) + x] = ii[(y - 1) * (w + 1) + x] + zeile }
  }
  const r = Math.max(8, Math.round(Math.min(w, h) / 40)), out = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r)
      const summe = ii[(y1 + 1) * (w + 1) + x1 + 1] - ii[y0 * (w + 1) + x1 + 1] - ii[(y1 + 1) * (w + 1) + x0] + ii[y0 * (w + 1) + x0]
      const mittel = summe / ((x1 - x0 + 1) * (y1 - y0 + 1))
      // Schwarz nur bei deutlichem Abstand zur Umgebung — sonst wird Bildrauschen auf hellem Papier zu
      // Tausenden Punkten, an denen die Texterkennung endlos rechnet
      const v = lum[y * w + x]
      out[y * w + x] = v < mittel * 0.85 && mittel - v > 18 ? 0 : 255
    }
  }
  // Einzelne schwarze Pixel ohne schwarze Nachbarn entfernen (Restrauschen)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x
    if (out[i]) continue
    let n = 0
    for (const d of [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1]) if (!out[i + d]) n++
    if (n <= 1) out[i] = 255
  }
  return out
}

/** 3×3-Mittelwert — dämpft Sensorrauschen von Handyfotos vor Kontrast/Binarisierung. */
function glaette(lum: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const tmp = new Uint16Array(w * h), out = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    tmp[i] = lum[i] + (x > 0 ? lum[i - 1] : lum[i]) + (x < w - 1 ? lum[i + 1] : lum[i])
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    out[i] = (tmp[i] + (y > 0 ? tmp[i - w] : tmp[i]) + (y < h - 1 ? tmp[i + w] : tmp[i])) / 9
  }
  return out
}

// ── Barcodes ──────────────────────────────────────────────────────────────────

function barcodeLeser(): MultiFormatReader {
  const r = new MultiFormatReader()
  const hints = new Map<DecodeHintType, unknown>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.EAN_13,
    BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.PDF_417,
  ])
  hints.set(DecodeHintType.TRY_HARDER, true)
  r.setHints(hints)
  return r
}

/** Bild verkleinern (Mittelwert über Blöcke) — Barcodes/QR scheitern oft an Rauschen in voller Auflösung. */
function verkleinere(lum: Uint8ClampedArray, w: number, h: number, f: number): { lum: Uint8ClampedArray; w: number; h: number } {
  const nw = Math.max(1, Math.floor(w / f)), nh = Math.max(1, Math.floor(h / f)), out = new Uint8ClampedArray(nw * nh)
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    let s = 0, n = 0
    for (let yy = y * f; yy < (y + 1) * f && yy < h; yy++) for (let xx = x * f; xx < (x + 1) * f && xx < w; xx++) { s += lum[yy * w + xx]; n++ }
    out[y * nw + x] = s / n
  }
  return { lum: out, w: nw, h: nh }
}

/** zxing meldet jeden Fehlversuch per console.warn — während des Lesens stummschalten. */
function leise<T>(f: () => T): T {
  const warn = console.warn, log = console.log
  console.warn = () => undefined; console.log = () => undefined
  try { return f() } finally { console.warn = warn; console.log = log }
}

/** Liest alle Barcodes: ganzes Bild (voll + verkleinert) + überlappende Streifen (mehrere Barcodes untereinander). */
async function liesBarcodes(lum: Uint8ClampedArray, w: number, h: number, melde: Fortschritt): Promise<string[]> {
  const leser = barcodeLeser()
  const gefunden = new Set<string>()
  const versuche = (l: Uint8ClampedArray, bw: number, y0: number, hoehe: number) => leise(() => {
    try {
      const src = new RGBLuminanceSource(new Uint8ClampedArray(l.subarray(y0 * bw, (y0 + hoehe) * bw)), bw, hoehe)
      const t = leser.decode(new BinaryBitmap(new HybridBinarizer(src))).getText().trim()
      if (t) gefunden.add(t)
    } catch { /* kein Barcode in diesem Ausschnitt */ }
  })
  const stufen = [{ lum, w, h }, verkleinere(lum, w, h, 2)]
  for (const s of stufen) {
    versuche(s.lum, s.w, 0, s.h)
    for (const teile of [4, 8, 14]) {
      const hoehe = Math.min(Math.ceil(s.h / teile) * 2, s.h)   // 50 % Überlappung
      for (let i = 0; i < teile * 2 - 1; i++) {
        const y0 = Math.min(Math.floor((i * s.h) / (teile * 2)), s.h - hoehe)
        versuche(s.lum, s.w, y0, hoehe)
        if (i % 4 === 0) { melde(`Barcodes lesen … (${gefunden.size} gefunden)`); await pause() }
      }
    }
  }
  return [...gefunden]
}

// ── Begradigen ────────────────────────────────────────────────────────────────

/**
 * Neigung des Fotos schätzen: Textzeilen ergeben bei richtigem Winkel eine Zeilen-Projektion
 * mit scharfen Spitzen (hohe Varianz). Grob −12…12° in 0,5°-Schritten, dann fein 0,1°.
 */
function schaetzeNeigung(bin: Uint8ClampedArray, w: number, h: number): number {
  const f = Math.max(1, Math.round(w / 900))
  const pts: number[] = []
  for (let y = 0; y < h; y += f) for (let x = 0; x < w; x += f) if (bin[y * w + x] === 0) pts.push(x / f, y / f)
  if (pts.length < 200) return 0
  const hoehe = Math.ceil(h / f) + Math.ceil(w / f)
  const guete = (grad: number) => {
    const r = (grad * Math.PI) / 180, s = Math.sin(r), c = Math.cos(r), hist = new Float64Array(hoehe * 2)
    for (let i = 0; i < pts.length; i += 2) { const yy = Math.round(pts[i + 1] * c - pts[i] * s) + hoehe; if (yy >= 0 && yy < hist.length) hist[yy]++ }
    let q = 0; for (let i = 1; i < hist.length; i++) { const d = hist[i] - hist[i - 1]; q += d * d }
    return q
  }
  let best = 0, bq = -1
  for (let a = -12; a <= 12; a += 0.5) { const q = guete(a); if (q > bq) { bq = q; best = a } }
  const grob = best
  for (let a = grob - 0.5; a <= grob + 0.5; a += 0.1) { const q = guete(a); if (q > bq) { bq = q; best = a } }
  return Math.round(best * 10) / 10
}

function drehe(c: HTMLCanvasElement, grad: number): HTMLCanvasElement {
  const r = (grad * Math.PI) / 180, s = Math.abs(Math.sin(r)), co = Math.abs(Math.cos(r))
  const n = document.createElement('canvas')
  n.width = Math.round(c.width * co + c.height * s); n.height = Math.round(c.width * s + c.height * co)
  const x = n.getContext('2d', { willReadFrequently: true })!
  x.fillStyle = '#fff'; x.fillRect(0, 0, n.width, n.height)
  x.translate(n.width / 2, n.height / 2); x.rotate(r); x.imageSmoothingQuality = 'high'
  x.drawImage(c, -c.width / 2, -c.height / 2)
  return n
}

// ── Texterkennung ─────────────────────────────────────────────────────────────

/** Mehrere Durchgänge auf 2 parallelen Erkennungs-Prozessen (halbiert die Wartezeit). */
const OCR_ZEITLIMIT_MS = 90_000

async function ocrCanvases(canvases: HTMLCanvasElement[], melde: Fortschritt): Promise<string> {
  const auftraege: { c: HTMLCanvasElement; psm: PSM }[] = []
  for (const c of canvases) for (const psm of [PSM.SPARSE_TEXT, PSM.SINGLE_BLOCK]) auftraege.push({ c, psm })
  const fortschritt = new Array(auftraege.length).fill(0)
  const melden = () => { const a = fortschritt.reduce((s, v) => s + v, 0) / auftraege.length; melde(`Texterkennung … ${Math.round(a * 100)} %`, a) }
  const teile: string[] = new Array(auftraege.length).fill('')
  let naechster = 0
  let abgebrochen = 0
  const lauf = async () => {
    let aktuell = -1
    const neuerWorker = () => erstelleOcrWorker('eng', m => { if (m.status === 'recognizing text' && aktuell >= 0) { fortschritt[aktuell] = m.progress; melden() } })
    let worker = await neuerWorker()
    try {
      while (naechster < auftraege.length) {
        aktuell = naechster++
        const { c, psm } = auftraege[aktuell]
        await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' })
        // Zeitlimit: hängt ein Durchgang (z. B. extrem verrauschtes Bild), Prozess beenden und mit frischem weiter
        let uhr: ReturnType<typeof setTimeout> | undefined
        const ergebnis = await Promise.race([
          worker.recognize(c).then(r => r.data.text),
          new Promise<null>(res => { uhr = setTimeout(() => res(null), OCR_ZEITLIMIT_MS) }),
        ])
        clearTimeout(uhr)
        if (ergebnis === null) {
          abgebrochen++
          await worker.terminate().catch(() => undefined)
          worker = await neuerWorker()
        } else teile[aktuell] = ergebnis
        fortschritt[aktuell] = 1; melden()
      }
    } finally { await worker.terminate().catch(() => undefined) }
  }
  melde('Texterkennung startet …', 0)
  await Promise.all([lauf(), lauf()])
  if (abgebrochen) melde(`Texterkennung: ${abgebrochen} von ${auftraege.length} Durchgängen wegen Zeitlimit übersprungen`)
  return teile.join('\n')
}

/** Komplette Bild-Strecke: Barcodes + Begradigen + OCR auf zwei Varianten. */
async function erkenneCanvas(c0: HTMLCanvasElement, melde: Fortschritt): Promise<{ text: string; barcodes: string[]; neigung: number }> {
  const lum0 = glaette(luminanz(c0), c0.width, c0.height)
  melde('Bild aufbereiten …'); await pause()
  const neigung = schaetzeNeigung(binaer(kontrast(lum0), c0.width, c0.height), c0.width, c0.height)
  const c = Math.abs(neigung) >= 0.3 ? drehe(c0, -neigung) : c0
  const w = c.width, h = c.height
  const k = kontrast(c === c0 ? lum0 : glaette(luminanz(c), c.width, c.height))
  const b = binaer(k, w, h)
  melde('Barcodes lesen …')
  const barcodes = [...new Set([...await liesBarcodes(k, w, h, melde), ...await liesBarcodes(b, w, h, melde)])]
  const text = await ocrCanvases([ausLuminanz(k, w, h), ausLuminanz(b, w, h)], melde)
  return { text, barcodes, neigung }
}

// ── Text aus PDF / Excel ──────────────────────────────────────────────────────

function textAusExcel(bytes: Uint8Array): string {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true })
  return wb.SheetNames.map(n => XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: ' ; ', blankrows: false, dateNF: 'dd.mm.yyyy' })).join('\n')
}

// ── Abgleich ──────────────────────────────────────────────────────────────────

const VERWECHSLUNG: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', J: '1', S: '5', B: '8', Z: '2', G: '6', T: '7' }
const kanon = (s: string) => s.replace(/[OQDILJSBZGT]/g, ch => VERWECHSLUNG[ch])

/** Levenshtein-Abstand, abgebrochen sobald er größer als max ist (dann max + 1). */
function abstand(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let vor = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const akt = [i]; let zeileMin = i
    for (let j = 1; j <= b.length; j++) {
      akt[j] = Math.min(vor[j] + 1, akt[j - 1] + 1, vor[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (akt[j] < zeileMin) zeileMin = akt[j]
    }
    if (zeileMin > max) return max + 1
    vor = akt
  }
  return vor[b.length]
}

const PRAEFIX = /^(DEHAM|DESCH|DE)/
const siehtAusWieSerial = (t: string) => /^[A-Z0-9]{8,12}$/.test(t) && (t.match(/\d/g) || []).length >= 3 && (t.match(/[A-Z]/g) || []).length >= 2
  && !/^(19|20)\d{6}$/.test(t)

/** Zeichenketten aus Text: einzelne Tokens + zusammengesetzte Nachbarn (OCR trennt gern „5CG 1234ABC"). */
function tokens(text: string): string[] {
  const out = new Set<string>()
  for (const zeile of text.toUpperCase().split(/\r?\n/)) {
    const t = zeile.replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
    for (let i = 0; i < t.length; i++) {
      if (t[i].length >= 5 && t[i].length <= 16) out.add(t[i])
      if (i + 1 < t.length) { const z = t[i] + t[i + 1]; if (z.length >= 8 && z.length <= 16 && t[i].length <= 6) out.add(z) }
    }
  }
  return [...out]
}

export function gleicheAb(roh: string[], idx: GeraeteIndex, herkunft: 'barcode' | 'text'): Kandidat[] {
  // Index der kanonischen Formen (nur einmal pro Aufruf)
  const kanonSerial = new Map<string, string[]>()
  for (const s of idx.perSerial.keys()) { const k = kanon(s); kanonSerial.set(k, [...(kanonSerial.get(k) || []), s]) }
  const serials = [...idx.perSerial.keys()]
  const ergebnis = new Map<string, Kandidat>()
  const rang = { endgeraete: 3, korrigiert: 2, manuell: 2, unbekannt: 1 } as const
  const merke = (k: Kandidat) => {
    const alt = ergebnis.get(k.serial)
    const wert = (x: Kandidat) => rang[x.erkannt] * 4 + (x.ausgewaehlt ? 2 : 0) + (x.herkunft === 'barcode' ? 1 : 0)
    if (!alt || wert(k) > wert(alt)) ergebnis.set(k.serial, k)
  }

  for (const t0 of roh) {
    const t = normalizeSerial(t0).replace(/[^A-Z0-9]/g, '')
    if (t.length < 5) continue
    const ohne = t.replace(PRAEFIX, '')
    // 1) exakt
    const g = alsPickupGeraet(t, idx, 'endgeraete')
    if (g.erkannt === 'endgeraete') { merke({ ...g, ausgewaehlt: true, herkunft }); continue }
    // 2) OCR-Verwechslungen
    const treffer = new Set<string>([...(kanonSerial.get(kanon(t)) || []), ...(kanonSerial.get(kanon(ohne)) || [])])
    if (treffer.size === 1) {
      const s = [...treffer][0]
      merke({ ...alsPickupGeraet(s, idx, 'korrigiert'), roh: t, ausgewaehlt: true, herkunft })
      continue
    }
    // 3) Abweichung nach Verwechslungs-Ausgleich: 1 Zeichen + eindeutig (kein anderes Gerät mit ≤ 2) → angehakt;
    //    2 Zeichen + eindeutig → nur Vorschlag (fortlaufende Seriennummern einer Lieferung liegen oft nah beieinander)
    if (ohne.length >= 9) {
      const k = kanon(ohne)
      const nah = serials.map(s => ({ s, d: abstand(kanon(s), k, 2) })).filter(x => x.d <= 2).sort((x, y) => x.d - y.d)
      if (nah.length === 1 || (nah.length > 1 && nah[1].d > nah[0].d)) {
        // Angehakt nur bei höchstens 1 Abweichung UND klarem Abstand zum Zweitbesten (≥ 2)
        const eins = nah[0].d <= 1 && (nah.length === 1 || nah[1].d >= nah[0].d + 1) && (nah.length === 1 || nah[1].d >= 2)
        merke({ ...alsPickupGeraet(nah[0].s, idx, 'korrigiert'), roh: t, ausgewaehlt: eins, herkunft })
        if (eins || ohne.length >= 10) continue
      }
    }
    // 4) unbekannt, aber plausibel — aus Fließtext nur HP-typische 10 Zeichen (sonst viel OCR-Rauschen),
    //    aus Barcodes 8–12 Zeichen
    if (siehtAusWieSerial(ohne) && (herkunft === 'barcode' || ohne.length === 10)) merke({ ...alsPickupGeraet(t, idx, 'unbekannt'), ausgewaehlt: herkunft === 'barcode', herkunft })
  }
  return [...ergebnis.values()].sort((a, b) => rang[b.erkannt] - rang[a.erkannt] || a.serial.localeCompare(b.serial))
}

// ── Datum ─────────────────────────────────────────────────────────────────────

const MONATE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']

export function erkenneDatum(text: string, heute = new Date()): string {
  const kandidaten: Date[] = []
  const neu = (j: number, m: number, t: number) => {
    if (j < 100) j += 2000
    const d = new Date(j, m - 1, t, 12)
    if (d.getFullYear() === j && d.getMonth() === m - 1 && d.getDate() === t) kandidaten.push(d)
  }
  for (const m of text.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/g)) neu(+m[3], +m[2], +m[1])
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) neu(+m[1], +m[2], +m[3])
  for (const m of text.toLowerCase().matchAll(/\b(\d{1,2})\.?\s*(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(\d{4})\b/g)) {
    neu(+m[3], MONATE.indexOf(m[2] === 'maerz' ? 'märz' : m[2]) + 1, +m[1])
  }
  // Plausibel: letzte ~13 Monate bis 2 Wochen voraus; das häufigste, bei Gleichstand das erste
  const von = heute.getTime() - 400 * 86400000, bis = heute.getTime() + 14 * 86400000
  const ok = kandidaten.filter(d => d.getTime() >= von && d.getTime() <= bis)
  if (!ok.length) return ''
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const zaehl = new Map<string, number>(); for (const d of ok) zaehl.set(iso(d), (zaehl.get(iso(d)) || 0) + 1)
  return [...zaehl.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

// ── Aufnahmedatum (EXIF) ──────────────────────────────────────────────────────

/** DateTimeOriginal (bzw. DateTime) aus einem JPEG — Handyfotos werden meist bei der Abholung gemacht. */
export function exifDatum(b: Uint8Array): string {
  try {
    if (b[0] !== 0xff || b[1] !== 0xd8) return ''
    let p = 2
    while (p + 4 < b.length && b[p] === 0xff) {
      const marker = b[p + 1], len = (b[p + 2] << 8) | b[p + 3]
      if (marker === 0xe1 && b[p + 4] === 0x45 && b[p + 5] === 0x78 && b[p + 6] === 0x69 && b[p + 7] === 0x66) {
        const tiff = p + 10, le = b[tiff] === 0x49
        const u16 = (o: number) => le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]
        const u32 = (o: number) => le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216 : b[o] * 16777216 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3])
        const ascii = (o: number) => { let s = ''; for (let i = 0; i < 19; i++) s += String.fromCharCode(b[tiff + o + i]); return s }
        const lies = (ifd: number, tag: number): number => {
          const n = u16(tiff + ifd)
          for (let i = 0; i < n; i++) { const e = tiff + ifd + 2 + i * 12; if (u16(e) === tag) return u32(e + 8) }
          return -1
        }
        const ifd0 = u32(tiff + 4)
        const exif = lies(ifd0, 0x8769)
        const off = (exif > 0 ? lies(exif, 0x9003) : -1) > 0 ? lies(exif, 0x9003) : lies(ifd0, 0x0132)
        if (off <= 0) return ''
        const m = ascii(off).match(/^(\d{4}):(\d{2}):(\d{2})/)
        return m && m[1] !== '0000' ? `${m[1]}-${m[2]}-${m[3]}` : ''
      }
      if (marker === 0xda) break
      p += 2 + len
    }
  } catch { /* kein/kaputtes EXIF */ }
  return ''
}

// ── Einstieg ──────────────────────────────────────────────────────────────────

export const BELEG_ENDUNGEN = ['jpg', 'jpeg', 'png', 'bmp', 'webp', 'gif', 'tif', 'tiff', 'heic', 'pdf', 'xlsx', 'xls', 'csv']

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', bmp: 'image/bmp', webp: 'image/webp', gif: 'image/gif', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic' }

export async function erkenneBeleg(name: string, bytes: Uint8Array, idx: GeraeteIndex, melde: Fortschritt): Promise<ErkennungsErgebnis> {
  const ext = (name.split('.').pop() || '').toLowerCase()
  let text = '', barcodes: string[] = [], hinweis = ''

  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    melde('Excel auslesen …')
    text = textAusExcel(bytes)
  } else if (ext === 'pdf') {
    melde('PDF auslesen …')
    const doc = await loadPdf(bytes)
    text = await getAllText(doc)
    // Gescannte PDF (keine/kaum Textebene oder nichts Brauchbares darin) → Seiten als Bild erkennen
    const brauchbar = gleicheAb(tokens(text), idx, 'text').some(k => k.erkannt !== 'unbekannt')
    if (text.replace(/---\s*Seite \d+\s*---/g, '').trim().length < 40 || !brauchbar) {
      const seiten = Math.min(doc.numPages, 8)
      if (doc.numPages > 8) hinweis = `PDF hat ${doc.numPages} Seiten — erkannt wurden die ersten 8.`
      for (let p = 1; p <= seiten; p++) {
        const c = document.createElement('canvas')
        await renderPageToCanvas(await doc.getPage(p), c, 3)
        const r = await erkenneCanvas(c, (t, a) => melde(`Seite ${p}/${seiten}: ${t}`, a))
        text += '\n' + r.text; barcodes.push(...r.barcodes)
      }
    }
  } else if (MIME[ext]) {
    melde('Bild laden …')
    let c: HTMLCanvasElement
    try { c = await bildZuCanvas(bytes, MIME[ext]) }
    catch { throw new Error(ext === 'heic' ? 'HEIC-Fotos (iPhone) kann Windows hier nicht öffnen — bitte als JPG speichern/senden.' : 'Bild konnte nicht geöffnet werden.') }
    const r = await erkenneCanvas(c, melde)
    text = r.text; barcodes = r.barcodes
    if (Math.abs(r.neigung) >= 0.3) hinweis = `Foto um ${r.neigung.toLocaleString('de-DE')}° begradigt`
  } else {
    throw new Error(`Dateityp .${ext} wird nicht unterstützt (Bild, PDF oder Excel).`)
  }

  melde('Abgleich mit der Endgeräte-Übersicht …')
  const ausBarcode = gleicheAb(barcodes.flatMap(b => [b, ...tokens(b)]), idx, 'barcode')
  const ausText = gleicheAb(tokens(text), idx, 'text')
  const alle = new Map<string, Kandidat>()
  for (const k of [...ausBarcode, ...ausText]) if (!alle.has(k.serial)) alle.set(k.serial, k)
  // Nicht angehakte Vorschläge, die nur eine Fehllesung eines schon erkannten Geräts sind, weglassen
  const sicher = [...alle.values()].filter(k => k.ausgewaehlt).map(k => kanon(k.serial))
  for (const [s, k] of alle) {
    if (!k.ausgewaehlt && sicher.some(x => abstand(x, kanon(s.replace(PRAEFIX, '')), 2) <= 2)) alle.delete(s)
  }
  // Datum: vom Beleg (gedruckt) — sonst Aufnahmedatum des Fotos (handschriftliche Daten liest die OCR kaum)
  let datum = erkenneDatum(text), datumQuelle: ErkennungsErgebnis['datumQuelle'] = datum ? 'beleg' : ''
  if (!datum && (ext === 'jpg' || ext === 'jpeg')) { datum = exifDatum(bytes); if (datum) datumQuelle = 'foto' }
  return { kandidaten: [...alle.values()], datum, datumQuelle, text, barcodes: [...new Set(barcodes)], hinweis }
}
