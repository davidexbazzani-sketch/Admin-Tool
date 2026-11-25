// Der Coach — Brunos Aufnahmen in kleine Ogg/Opus-Dateien umwandeln (läuft nur beim Erstellen, nicht im Tool).
// Nutzt die Kodier-Seite des Italienischkurses (scripts/italiano-ton.html: WebCodecs braucht einen sicheren Kontext).
// Stille am Anfang und Ende wird bis auf einen kleinen Rand gekürzt; die Datei wird zur Gegenprobe wieder dekodiert.
//
//   npx electron scripts/coach-ton.cjs <Rohordner mit .mp3/.wav> [Bitrate, Vorgabe 24000]
// Ziel: public/coach/ton/<name>.ogg (liegt nicht im Repo, nur lokal und im Build).
// Achtung: In der Claude-Shell vorher ELECTRON_RUN_AS_NODE entfernen.
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const [quelle, br] = process.argv.slice(2)
const BITRATE = Number(br || 24000)
const ZIEL = path.join(__dirname, '..', 'public', 'coach', 'ton')

app.whenReady().then(async () => {
  let code = 0
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } })
    await win.loadFile(path.join(__dirname, 'italiano-ton.html'))
    const ruf = (was, ...a) => win.webContents.executeJavaScript(`window.ton.${was}(${a.map(x => JSON.stringify(x)).join(',')})`)
    fs.mkdirSync(ZIEL, { recursive: true })
    let summe = 0
    for (const f of fs.readdirSync(quelle).filter(x => /\.(mp3|wav)$/.test(x)).sort()) {
      const b64 = fs.readFileSync(path.join(quelle, f)).toString('base64')
      const a = await ruf('analyse', b64)
      const stueck = [Math.max(0, a.anfang - 0.12), Math.min(a.dauer, a.ende + 0.35)]
      const r = await ruf('baue', [{ b64, gewichte: [1], stuecke: [stueck] }], BITRATE)
      if (!r.ok || !r.ogg) { console.log(`${f}: FEHLER (Länge ${r.laengeOk}, Gegenprobe ${r.fehler})`); code = 1; continue }
      const u = Buffer.from(r.ogg, 'base64')
      const name = f.replace(/\.(mp3|wav)$/, '.ogg')
      fs.writeFileSync(path.join(ZIEL, name), u)
      summe += u.length
      console.log(`${name.padEnd(34)} ${r.sekunden.toFixed(1).padStart(5)} s  ${(u.length / 1024).toFixed(1).padStart(6)} KB`)
    }
    console.log(`zusammen ${(summe / 1024).toFixed(0)} KB`)
  } catch (e) { console.error(e); code = 1 }
  app.exit(code)
})
