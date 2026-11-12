// ── Bildschirmaufnahme („Erklärvideo“) — Hauptprozess ────────────────────────
// Aufgaben hier:
//   • Bildschirme + Aufnahmequellen liefern (je Monitor eine Quelle)
//   • die kleine Aufnahme-Leiste öffnen (eigenes Fenster, immer im Vordergrund, selbst NICHT im
//     Video: setContentProtection) — dort laufen Aufnahme und Kodierung
//   • Mausposition 30×/s an die Leiste schicken (die Aufnahme folgt der Maus über die Monitore)
//   • Tastenkürzel während der Aufnahme (Strg+Umschalt+F9…F12)
//   • Dateien: Zwischendateien je Spur + Zieldatei (MP4) — nur fs/promises, nichts blockiert
// Sicherheit: Gelesen/geschrieben wird nur im eigenen Zwischenordner und in Zielen, die der
// Nutzer im Speichern-Dialog gewählt hat.
import { app, BrowserWindow, ipcMain, dialog, shell, desktopCapturer, globalShortcut, screen } from 'electron'
import { join, resolve, sep, basename } from 'path'
import { tmpdir } from 'os'
import { promises as fsp } from 'fs'
import type { FileHandle } from 'fs/promises'

interface Kontext { hauptfenster: () => BrowserWindow | null; isDev: boolean; preload: string; distIndex: string }

const BASIS = join(tmpdir(), 'IT-Admin-Tool-Aufnahmen')
const erlaubteZiele = new Set<string>()
const norm = (p: string) => resolve(p).toLowerCase()
const imZwischenordner = (p: string) => norm(p).startsWith(norm(BASIS) + sep)
const darfSchreiben = (p: string) => imZwischenordner(p) || erlaubteZiele.has(norm(p))

let leiste: BrowserWindow | null = null
let optionen: unknown = null
let mausTakt: NodeJS.Timeout | null = null
let hauptWarMinimiert = false
const KUERZEL: Record<string, string> = { 'Control+Shift+F9': 'pause', 'Control+Shift+F10': 'stopp', 'Control+Shift+F11': 'lupe', 'Control+Shift+F12': 'spotlight' }

// ── Dateien ────────────────────────────────────────────────────────────────────
interface Offen { fh: FileHandle; pos: number; kette: Promise<void>; pfad: string; fehler?: string }
const offen = new Map<number, Offen>()
let naechsteId = 1

async function oeffne(pfad: string): Promise<number> {
  if (!darfSchreiben(pfad)) throw new Error('Ziel nicht freigegeben: ' + pfad)
  await fsp.mkdir(resolve(pfad, '..'), { recursive: true })
  const fh = await fsp.open(pfad, 'w')
  const id = naechsteId++
  offen.set(id, { fh, pos: 0, kette: Promise.resolve(), pfad })
  return id
}
/** Schreibvorgänge je Datei streng nacheinander (die Leiste wartet nicht auf jede Antwort). */
function inReihe(id: number, arbeit: (o: Offen) => Promise<void>): Promise<void> {
  const o = offen.get(id)
  if (!o) return Promise.reject(new Error('Datei nicht offen'))
  o.kette = o.kette.then(() => (o.fehler ? undefined : arbeit(o))).catch(e => { o.fehler = e instanceof Error ? e.message : String(e) })
  return o.kette
}

function stoppeTakt() {
  if (mausTakt) { clearInterval(mausTakt); mausTakt = null }
  for (const k of Object.keys(KUERZEL)) { try { globalShortcut.unregister(k) } catch { /* egal */ } }
}

function hauptZurueck(ctx: Kontext) {
  const h = ctx.hauptfenster()
  if (h && !h.isDestroyed() && !hauptWarMinimiert) { h.restore(); h.show(); h.focus() }
}

let ordentlichBeendet = false
function beendeLeiste(ctx: Kontext) {
  ordentlichBeendet = true
  stoppeTakt()
  if (leiste && !leiste.isDestroyed()) leiste.destroy()
  leiste = null
  hauptZurueck(ctx)
}

export function registriereAufnahme(ctx: Kontext): void {
  // Bildschirme mit ihrer Aufnahmequelle
  ipcMain.handle('aufnahme:quellen', async () => {
    const quellen = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
    const prim = screen.getPrimaryDisplay().id
    return screen.getAllDisplays().map((d, i) => {
      const q = quellen.find(s => String(s.display_id) === String(d.id)) || (quellen.length === 1 ? quellen[0] : quellen[i])
      return { displayId: String(d.id), sourceId: q?.id || '', name: `Bildschirm ${i + 1}${d.id === prim ? ' (Haupt)' : ''}`, bounds: d.bounds, skalierung: d.scaleFactor, haupt: d.id === prim }
    }).filter(d => d.sourceId)
  })

  // Neuen Zwischenordner für eine Aufnahme anlegen
  ipcMain.handle('aufnahme:neuer-ordner', async () => {
    const id = new Date().toISOString().replace(/[:.]/g, '-') + '_' + Math.random().toString(36).slice(2, 6)
    const ordner = join(BASIS, id)
    await fsp.mkdir(ordner, { recursive: true })
    return ordner
  })

  // Aufnahme starten: Leiste öffnen, Hauptfenster ggf. minimieren, Maus + Tastenkürzel
  ipcMain.handle('aufnahme:starte', async (_e, opts: { minimieren?: boolean } & Record<string, unknown>) => {
    if (leiste && !leiste.isDestroyed()) { leiste.focus(); return { ok: false, fehler: 'Es läuft bereits eine Aufnahme.' } }
    optionen = opts
    const maus = screen.getCursorScreenPoint()
    const d = screen.getDisplayNearestPoint(maus)
    const breite = 720, hoehe = 76
    leiste = new BrowserWindow({
      x: Math.round(d.workArea.x + (d.workArea.width - breite) / 2), y: d.workArea.y + 12, width: breite, height: hoehe,
      frame: false, resizable: false, maximizable: false, minimizable: true, alwaysOnTop: true, skipTaskbar: false,
      title: 'Aufnahme — IT Admin Tool', backgroundColor: '#111827', show: false,
      webPreferences: { preload: ctx.preload, contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false },
    })
    leiste.setAlwaysOnTop(true, 'screen-saver')
    // Die Leiste selbst soll nicht im Video landen
    try { leiste.setContentProtection(true) } catch { /* ältere Windows-Versionen: Leiste erscheint schwarz */ }
    if (ctx.isDev) void leiste.loadURL('http://localhost:5173/#aufnahme')
    else void leiste.loadFile(ctx.distIndex, { hash: 'aufnahme' })
    leiste.once('ready-to-show', () => leiste?.show())
    ordentlichBeendet = false
    // Alt+F4 / Schließen über die Taskleiste: erst ordentlich stoppen (Video bleibt erhalten);
    // reagiert die Leiste nicht, schließt der zweite Versuch hart.
    let stoppAngefragt = false
    leiste.on('close', ev => {
      if (ordentlichBeendet || stoppAngefragt || !leiste || leiste.isDestroyed()) return
      ev.preventDefault()
      stoppAngefragt = true
      leiste.webContents.send('aufnahme:taste', 'stopp')
    })
    leiste.on('closed', () => {
      leiste = null
      stoppeTakt()
      if (!ordentlichBeendet) {
        // unerwartet weg (Absturz/hart geschlossen) → Hauptfenster zurück, Dialog schließen
        ordentlichBeendet = true
        hauptZurueck(ctx)
        ctx.hauptfenster()?.webContents.send('aufnahme:fertig', null)
      }
    })
    leiste.webContents.on('render-process-gone', () => { if (leiste && !leiste.isDestroyed()) leiste.destroy() })
    const h = ctx.hauptfenster()
    hauptWarMinimiert = !!h?.isMinimized()
    if (opts.minimieren && h && !h.isDestroyed()) h.minimize()
    mausTakt = setInterval(() => {
      if (!leiste || leiste.isDestroyed()) return
      const p = screen.getCursorScreenPoint()
      leiste.webContents.send('aufnahme:maus', { x: p.x, y: p.y, displayId: String(screen.getDisplayNearestPoint(p).id) })
    }, 33)
    for (const [k, was] of Object.entries(KUERZEL)) {
      try { globalShortcut.register(k, () => leiste?.webContents.send('aufnahme:taste', was)) } catch { /* belegt → nur per Klick */ }
    }
    return { ok: true }
  })
  ipcMain.handle('aufnahme:optionen', () => optionen)

  // Leiste meldet: fertig (mit Spur-Tabellen) bzw. verworfen
  ipcMain.handle('aufnahme:fertig', (_e, ergebnis: unknown) => {
    beendeLeiste(ctx)
    ctx.hauptfenster()?.webContents.send('aufnahme:fertig', ergebnis)
    return true
  })
  ipcMain.handle('aufnahme:verworfen', async (_e, ordner?: string) => {
    beendeLeiste(ctx)
    if (ordner && imZwischenordner(ordner)) await fsp.rm(ordner, { recursive: true, force: true }).catch(() => {})
    ctx.hauptfenster()?.webContents.send('aufnahme:fertig', null)
    return true
  })
  ipcMain.handle('aufnahme:leiste-minimieren', () => { leiste?.minimize() })

  // Dateien
  ipcMain.handle('aufnahme:oeffne', (_e, pfad: string) => oeffne(pfad))
  ipcMain.handle('aufnahme:anhaengen', (_e, id: number, bytes: Uint8Array) =>
    inReihe(id, async o => { await o.fh.write(bytes, 0, bytes.length, o.pos); o.pos += bytes.length }))
  ipcMain.handle('aufnahme:schreibe-bei', (_e, id: number, pos: number, bytes: Uint8Array) =>
    inReihe(id, async o => { await o.fh.write(bytes, 0, bytes.length, pos) }))
  ipcMain.handle('aufnahme:kopiere', (_e, id: number, quelle: string, offset: number, laenge: number) =>
    inReihe(id, async o => {
      if (!imZwischenordner(quelle)) throw new Error('Quelle nicht erlaubt')
      const q = await fsp.open(quelle, 'r')
      try {
        const STUECK = 4 * 1024 * 1024
        const puffer = Buffer.alloc(Math.min(STUECK, Math.max(1, laenge)))
        let rest = laenge, von = offset
        while (rest > 0) {
          const n = Math.min(rest, puffer.length)
          const { bytesRead } = await q.read(puffer, 0, n, von)
          if (bytesRead !== n) throw new Error('Zwischendatei kürzer als erwartet')
          await o.fh.write(puffer, 0, n, o.pos)
          o.pos += n; von += n; rest -= n
        }
      } finally { await q.close() }
    }))
  ipcMain.handle('aufnahme:schliesse', async (_e, id: number) => {
    const o = offen.get(id)
    if (!o) return { ok: false, fehler: 'Datei nicht offen' }
    await o.kette
    offen.delete(id)
    await o.fh.close().catch(() => {})
    return o.fehler ? { ok: false, fehler: o.fehler } : { ok: true, bytes: o.pos }
  })
  ipcMain.handle('aufnahme:lese', async (_e, pfad: string, offset: number, laenge: number) => {
    if (!imZwischenordner(pfad)) throw new Error('Quelle nicht erlaubt')
    const q = await fsp.open(pfad, 'r')
    try { const b = Buffer.alloc(laenge); const { bytesRead } = await q.read(b, 0, laenge, offset); return new Uint8Array(b.buffer, b.byteOffset, bytesRead) } finally { await q.close() }
  })
  ipcMain.handle('aufnahme:kopiere-datei', async (_e, von: string, nach: string) => {
    if (!imZwischenordner(von) || !darfSchreiben(nach)) throw new Error('Pfad nicht erlaubt')
    await fsp.copyFile(von, nach)
    return (await fsp.stat(nach)).size
  })
  ipcMain.handle('aufnahme:loesche', async (_e, ordner: string) => {
    if (imZwischenordner(ordner)) await fsp.rm(ordner, { recursive: true, force: true }).catch(() => {})
    return true
  })
  ipcMain.handle('aufnahme:speichern-dialog', async (_e, vorschlag: string) => {
    const h = ctx.hauptfenster()
    const opts = { defaultPath: join(app.getPath('videos'), basename(vorschlag || 'Erklaervideo.mp4')), filters: [{ name: 'MP4-Video', extensions: ['mp4'] }] }
    const r = h ? await dialog.showSaveDialog(h, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return null
    const ziel = /\.mp4$/i.test(r.filePath) ? r.filePath : r.filePath + '.mp4'
    erlaubteZiele.add(norm(ziel))
    return ziel
  })
  ipcMain.handle('aufnahme:im-ordner-zeigen', (_e, pfad: string) => { if (erlaubteZiele.has(norm(pfad))) shell.showItemInFolder(pfad) })
  ipcMain.handle('aufnahme:abspielen', async (_e, pfad: string) => (erlaubteZiele.has(norm(pfad)) ? shell.openPath(pfad) : 'nicht erlaubt'))
  ipcMain.handle('aufnahme:groesse', async (_e, pfad: string) => { if (!darfSchreiben(pfad)) return 0; try { return (await fsp.stat(pfad)).size } catch { return 0 } })

  // Alte Zwischenordner (Absturz, nicht gespeichert) nach 2 Tagen aufräumen
  void (async () => {
    try {
      for (const n of await fsp.readdir(BASIS)) {
        const p = join(BASIS, n)
        const st = await fsp.stat(p).catch(() => null)
        if (st && Date.now() - st.mtimeMs > 2 * 24 * 3600_000) await fsp.rm(p, { recursive: true, force: true }).catch(() => {})
      }
    } catch { /* Ordner gibt es noch nicht */ }
  })()
  app.on('will-quit', () => stoppeTakt())
}
