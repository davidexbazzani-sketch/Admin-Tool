// Parla Italiano — Bilder für den Kurs verkleinern und als WebP ablegen (läuft nur beim Erstellen).
// Braucht keine Zusatzprogramme: Electron zeichnet jedes Bild auf eine Fläche und kodiert es.
//
//   npx electron scripts/italiano-bilder.cjs <Quellordner mit PNG> <Zielordner> [Übersicht.png]
//
// station-NN, quaderno, finale, lernen → 720 × 405 · kachel, reise → 1000 × 563
// Achtung: In der Claude-Shell vorher ELECTRON_RUN_AS_NODE entfernen.
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const [quelle, ziel, uebersicht] = process.argv.slice(2)
if (!quelle || !ziel) { console.error('Aufruf: electron scripts/italiano-bilder.cjs <Quelle> <Ziel> [Übersicht.png]'); process.exit(2) }
const GROSS = new Set(['kachel', 'reise'])
const GUETE = 0.68

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, backgroundThrottling: false } })
  await win.loadURL('data:text/html,<meta charset="utf-8"><body></body>')
  fs.mkdirSync(ziel, { recursive: true })
  const dateien = fs.readdirSync(quelle).filter(f => /^(station-\d\d|kachel|reise|lernen|quaderno|finale)\.png$/.test(f)).sort()
  let summe = 0
  const klein = []
  for (const f of dateien) {
    const name = f.replace(/\.png$/, '')
    const breite = GROSS.has(name) ? 1000 : 720
    const hoehe = Math.round(breite * 9 / 16)
    const b64 = fs.readFileSync(path.join(quelle, f)).toString('base64')
    const aus = await win.webContents.executeJavaScript(`(async () => {
      const bild = new Image(); bild.src = 'data:image/png;base64,${b64}'; await bild.decode()
      const zeichne = (w, h) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h
        const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'
        // mittig auf 16:9 zuschneiden
        const v = Math.max(w / bild.naturalWidth, h / bild.naturalHeight)
        const bw = bild.naturalWidth * v, bh = bild.naturalHeight * v
        x.drawImage(bild, (w - bw) / 2, (h - bh) / 2, bw, bh)
        return c
      }
      const alsB64 = async (c, typ, q) => { const blob = await new Promise(r => c.toBlob(r, typ, q)); const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s) }
      return { webp: await alsB64(zeichne(${breite}, ${hoehe}), 'image/webp', ${GUETE}), klein: await alsB64(zeichne(240, 135), 'image/jpeg', 0.8) }
    })()`)
    const daten = Buffer.from(aus.webp, 'base64')
    fs.writeFileSync(path.join(ziel, name + '.webp'), daten)
    summe += daten.length
    klein.push({ name, b64: aus.klein })
    console.log(`${name.padEnd(12)} ${breite}×${hoehe}  ${(daten.length / 1024).toFixed(0).padStart(4)} KB`)
  }
  console.log(`${dateien.length} Bilder, zusammen ${(summe / 1024).toFixed(0)} KB`)
  if (uebersicht) {
    const spalten = 6, zeilen = Math.ceil(klein.length / spalten)
    const png = await win.webContents.executeJavaScript(`(async () => {
      const liste = ${JSON.stringify(klein)}
      const c = document.createElement('canvas'); c.width = ${spalten} * 244; c.height = ${zeilen} * 155
      const x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height); x.font = 'bold 12px sans-serif'
      for (let i = 0; i < liste.length; i++) {
        const b = new Image(); b.src = 'data:image/jpeg;base64,' + liste[i].b64; await b.decode()
        const px = (i % ${spalten}) * 244 + 2, py = Math.floor(i / ${spalten}) * 155 + 2
        x.drawImage(b, px, py); x.fillStyle = '#fff'; x.fillText(liste[i].name, px + 4, py + 149)
      }
      return c.toDataURL('image/png').split(',')[1]
    })()`)
    fs.writeFileSync(uebersicht, Buffer.from(png, 'base64'))
    console.log('Übersicht: ' + uebersicht)
  }
  app.exit(0)
})
