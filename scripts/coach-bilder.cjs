// Der Coach — Bilder verkleinern und als WebP ablegen (läuft nur beim Erstellen, nicht im Tool).
// Braucht keine Zusatzprogramme: Electron zeichnet jedes Bild auf eine Fläche und kodiert es.
//
//   npx electron scripts/coach-bilder.cjs <Quellordner mit PNG> <Zielordner> [Übersicht.png]
//
// Dateinamen „NN-name.png“ (die Nummer fällt weg). Das Format ergibt sich aus dem Seitenverhältnis:
//   quadratisch → bruno.webp-Art, 320 × 320 (Kopf für Sprechblasen)
//   4:5 (Haltung) → bruno-<name>.webp, 640 × 800
//   16:9 (Raum)   → <name>.webp, 960 × 540; „kachel“ 1000 × 563
// Ziel ist public/coach/bilder/ (liegt nicht im Repo, nur lokal und im Build). WebP-Güte 0,72.
// Achtung: In der Claude-Shell vorher ELECTRON_RUN_AS_NODE entfernen.
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const [quelle, ziel, uebersicht] = process.argv.slice(2)
if (!quelle || !ziel) { console.error('Aufruf: electron scripts/coach-bilder.cjs <Quelle> <Ziel> [Übersicht.png]'); process.exit(2) }
const GUETE = Number(process.env.DC_GUETE || 0.72)

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, backgroundThrottling: false } })
  await win.loadURL('data:text/html,<meta charset="utf-8"><body></body>')
  fs.mkdirSync(ziel, { recursive: true })
  const dateien = fs.readdirSync(quelle).filter(f => /\.png$/.test(f)).sort()
  let summe = 0
  const klein = []
  for (const f of dateien) {
    const roh = f.replace(/\.png$/, '').replace(/^\d+-/, '')
    const b64 = fs.readFileSync(path.join(quelle, f)).toString('base64')
    const aus = await win.webContents.executeJavaScript(`(async () => {
      const bild = new Image(); bild.src = 'data:image/png;base64,${b64}'; await bild.decode()
      const r = bild.naturalWidth / bild.naturalHeight
      const art = r > 1.4 ? 'raum' : r < 0.9 ? 'haltung' : 'kopf'
      const name = ${JSON.stringify(roh)}
      const [w, h] = art === 'raum' ? (name === 'kachel' ? [1000, 563] : [960, 540]) : art === 'haltung' ? [640, 800] : [320, 320]
      const zeichne = (w, h, oben) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h
        const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'
        // Kopf: enger Ausschnitt aufs Gesicht (oberer, mittlerer Teil), damit er auch als 64-Punkte-Kreis erkennbar ist
        if (oben) { const s = bild.naturalWidth * 0.62; x.drawImage(bild, (bild.naturalWidth - s) / 2, 0, s, s, 0, 0, w, h); return c }
        const v = Math.max(w / bild.naturalWidth, h / bild.naturalHeight)
        const bw = bild.naturalWidth * v, bh = bild.naturalHeight * v
        x.drawImage(bild, (w - bw) / 2, oben ? 0 : (h - bh) / 2, bw, bh)
        return c
      }
      const alsB64 = async (c, typ, q) => { const blob = await new Promise(r => c.toBlob(r, typ, q)); const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s) }
      return { art, webp: await alsB64(zeichne(w, h, art === 'kopf'), 'image/webp', ${GUETE}), klein: await alsB64(zeichne(art === 'raum' ? 320 : 180, art === 'raum' ? 180 : 225, false), 'image/jpeg', 0.82) }
    })()`)
    const datei = aus.art === 'haltung' ? `bruno-${roh}.webp` : aus.art === 'kopf' ? (roh === 'bruno' ? 'bruno.webp' : `${roh}.webp`) : `${roh}.webp`
    const buf = Buffer.from(aus.webp, 'base64')
    fs.writeFileSync(path.join(ziel, datei), buf)
    summe += buf.length
    klein.push({ name: datei, b64: aus.klein, art: aus.art })
    console.log(`${datei.padEnd(26)} ${(buf.length / 1024).toFixed(0).padStart(4)} KB`)
  }
  console.log(`zusammen ${(summe / 1024).toFixed(0)} KB in ${dateien.length} Bildern`)
  if (uebersicht) {
    const png = await win.webContents.executeJavaScript(`(async () => {
      const liste = ${JSON.stringify(klein)}
      const sp = 4, zw = 330, zh = 250
      const c = document.createElement('canvas'); c.width = sp * zw; c.height = Math.ceil(liste.length / sp) * zh
      const x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height)
      for (let i = 0; i < liste.length; i++) {
        const b = new Image(); b.src = 'data:image/jpeg;base64,' + liste[i].b64; await b.decode()
        const px = (i % sp) * zw + (zw - b.naturalWidth) / 2, py = Math.floor(i / sp) * zh + 4
        x.drawImage(b, px, py)
        x.fillStyle = '#eee'; x.font = '14px sans-serif'; x.fillText(liste[i].name, (i % sp) * zw + 8, Math.floor(i / sp) * zh + 244)
      }
      const blob = await new Promise(r => c.toBlob(r, 'image/png')); const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s)
    })()`)
    fs.writeFileSync(uebersicht, Buffer.from(png, 'base64'))
  }
  app.exit(0)
})
