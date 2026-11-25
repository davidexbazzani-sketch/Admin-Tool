// Parla Italiano — Tondateien für den Kurs bauen (läuft nur beim Erstellen, nicht im Tool).
// Aus den Roh-Aufnahmen je Lerntag (Wortliste + Dialog) entsteht EINE kleine Ogg/Opus-Datei
// public/italiano/ton/tNNN.ogg; wo jedes Wort und jede Dialogzeile liegt, steht danach in
// src/italiano/ton/zeiten.json.
//
//   npx electron scripts/italiano-ton.cjs analyse <Datei>
//   npx electron scripts/italiano-ton.cjs vergleich <Datei> [Bitraten, mit Komma]
//   npx electron scripts/italiano-ton.cjs probe <Wortdatei> <Zeichen je Wort, mit Komma> <Dialogdatei> <Zeichen je Zeile> <Ziel.ogg>
//   npx electron scripts/italiano-ton.cjs baue <Rohordner> [vonTag] [bisTag]
//
// Rohordner: tNNN-w.<mp3|wav|ogg> (die 12 Wörter des Tages) und tNNN-d.<…> (der Dialog), NNN = Lerntag.
// Daneben liegen die geprüften Schnittstellen tNNN-w.schnitt.json / tNNN-d.schnitt.json (erzeugt von
// scripts/italiano-ton-pruefe.py — VOR dem Bau ausführen) und, wo nötig, einzeln neu vertonte Dialogzeilen
// tNNN-eZZ.<…> mit ihrer Schnittdatei (Liste: scripts/italiano-ton-ersatz.json).
// Nach dem Bau:  python scripts/italiano-ton-pruefe.py fertig 1 120
// Achtung: In der Claude-Shell vorher ELECTRON_RUN_AS_NODE entfernen.
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const WURZEL = path.join(__dirname, '..')
const INHALT = path.join(WURZEL, 'src', 'italiano', 'inhalt')
const ZIEL = path.join(WURZEL, 'public', 'italiano', 'ton')
const ZEITEN = path.join(WURZEL, 'src', 'italiano', 'ton', 'zeiten.json')
const BITRATE = Number(process.env.PI_BITRATE || 10000)
/** bis hierhin gilt ein Schnitt als sicher: so weit darf ein Stück höchstens von der Länge abweichen, die seinem Text entspricht */
const GUETE_BIS = 0.4
/** fester Anteil je Stück beim Schätzen der Länge: einzelne Wörter brauchen mehr Zeit je Buchstabe als ganze Sätze */
const ZUSATZ_WORT = 6, ZUSATZ_ZEILE = 2
/** Dialogzeilen gelten als sicher getrennt, wenn keine Zeile mehr als so viel von ihrer erwarteten Länge abweicht.
 *  Nur dann nutzt das Tool einzelne Zeilen für Hör-Aufgaben; abgespielt wird der Dialog in jedem Fall richtig (der Reihe nach). */
const ZEILEN_SICHER_BIS = 0.3

const [modus, ...arg] = process.argv.slice(2)
const b64 = f => fs.readFileSync(f).toString('base64')
const dreistellig = n => String(n).padStart(3, '0')

function tagInhalt(tag) {
  const level = Math.floor((tag - 1) / 5) + 1
  const datei = path.join(INHALT, `level-${String(level).padStart(2, '0')}.json`)
  if (!fs.existsSync(datei)) return null
  return JSON.parse(fs.readFileSync(datei, 'utf8')).tage.find(t => t.tag === tag) || null
}
function roh(ordner, tag, art) {
  for (const e of ['mp3', 'wav', 'ogg', 'm4a']) { const f = path.join(ordner, `t${dreistellig(tag)}-${art}.${e}`); if (fs.existsSync(f)) return f }
  return null
}
/** Geprüfte Schnittstellen zu einer Roh-Aufnahme (tNNN-w.schnitt.json / tNNN-d.schnitt.json, erzeugt von
 *  scripts/italiano-ton-pruefe.py): { stuecke: [[von, bis] …] in Sekunden der Roh-Aufnahme, geprueft: true|false }.
 *  Gilt nur, wenn die Zahl der Stücke zum heutigen Inhalt passt und die Datei jünger ist als die Aufnahme. */
function schnitt(ordner, tag, art, anzahl, aufnahme) {
  const f = path.join(ordner, `t${dreistellig(tag)}-${art}.schnitt.json`)
  if (!fs.existsSync(f) || !aufnahme) return null
  try {
    if (fs.statSync(f).mtimeMs < fs.statSync(aufnahme).mtimeMs) return null
    const s = JSON.parse(fs.readFileSync(f, 'utf8'))
    if (!Array.isArray(s.stuecke) || s.stuecke.length !== anzahl || !s.stuecke.every(x => Array.isArray(x) && x.length === 2 && x[1] > x[0])) return null
    return s
  } catch { return null }
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } })
  // als Datei laden: WebCodecs (AudioEncoder) gibt es nur in einem sicheren Kontext, nicht auf einer data:-Seite
  await win.loadFile(path.join(__dirname, 'italiano-ton.html'))
  const ruf = (was, ...a) => win.webContents.executeJavaScript(`window.ton.${was}(${a.map(x => JSON.stringify(x)).join(',')})`)
  let code = 0
  try {
    if (modus === 'analyse') {
      const r = await ruf('analyse', b64(arg[0]))
      console.log(`Dauer ${r.dauer.toFixed(2)} s · Sprache ${r.anfang.toFixed(2)}–${r.ende.toFixed(2)} s · ${r.pausen.length} Pausen`)
      console.log(r.pausen.map(([von, d]) => `${von.toFixed(2)}s:${Math.round(d * 1000)}ms`).join('  '))
    } else if (modus === 'vergleich') {
      const r = await ruf('vergleich', b64(arg[0]), (arg[1] || '8000,10000,12000,14000,18000,24000').split(',').map(Number))
      console.log(`${arg[0]} (${r.sekunden} s)`)
      for (const x of r.aus) console.log(`  ${String(x.bitrate / 1000).padStart(4)} kbit/s Vorgabe → ${String(x.kbit).padStart(5)} kbit/s, ${String(x.kb).padStart(6)} KB · Abweichung ${String(x.db).padStart(5)} dB · Klang bis ${x.grenzeHz} Hz`)
    } else if (modus === 'probe') {
      const [wf, wn, df, dn, ziel] = arg
      const r = await ruf('baue', [{ b64: b64(wf), gewichte: wn.split(',').map(Number), zusatz: ZUSATZ_WORT }, { b64: b64(df), gewichte: dn.split(',').map(Number), zusatz: ZUSATZ_ZEILE }], BITRATE)
      console.log(JSON.stringify({ ok: r.ok, sekunden: r.sekunden, bericht: r.bericht, laengeOk: r.laengeOk, fehler: r.fehler, zeiten: r.zeiten }))
      if (r.ogg) { const u = Buffer.from(r.ogg, 'base64'); fs.writeFileSync(ziel, u); console.log(`${ziel}: ${(u.length / 1024).toFixed(1)} KB = ${(u.length * 8 / r.sekunden / 1000).toFixed(1)} kbit/s`) }
    } else if (modus === 'baue') {
      const ordner = arg[0], von = Number(arg[1] || 1), bis = Number(arg[2] || 120)
      fs.mkdirSync(ZIEL, { recursive: true })
      const zeiten = fs.existsSync(ZEITEN) ? JSON.parse(fs.readFileSync(ZEITEN, 'utf8')) : {}
      let gebaut = 0, bytes = 0, sekunden = 0, sichereDialoge = 0
      const unsicher = []
      for (let tag = von; tag <= bis; tag++) {
        const t = tagInhalt(tag), fw = roh(ordner, tag, 'w'), fd = roh(ordner, tag, 'd')
        if (!t || (!fw && !fd)) continue
        const quellen = []
        const sw = schnitt(ordner, tag, 'w', t.woerter.length, fw), sd = schnitt(ordner, tag, 'd', t.dialog.zeilen.length, fd)
        // einzeln neu vertonte Dialogzeilen (tNNN-eZZ.*, Liste in italiano-ton-ersatz.json): nur geprüfte ersetzen das Stück aus der Dialog-Aufnahme
        const ersatz = {}
        if (fd) t.dialog.zeilen.forEach((_, nr) => {
          const art = 'e' + String(nr).padStart(2, '0'), fe = roh(ordner, tag, art), se = schnitt(ordner, tag, art, 1, fe)
          if (se && se.geprueft === true) ersatz[nr] = { b64: b64(fe), stueck: se.stuecke[0] }
        })
        if (fw) quellen.push({ b64: b64(fw), gewichte: t.woerter.map(w => w.it.length), zusatz: ZUSATZ_WORT, ...(sw ? { stuecke: sw.stuecke } : {}) })
        if (fd) quellen.push({ b64: b64(fd), gewichte: t.dialog.zeilen.map(z => z.it.length), zusatz: ZUSATZ_ZEILE, ...(sd ? { stuecke: sd.stuecke } : {}), ersatz })
        const r = await ruf('baue', quellen, BITRATE)
        const kenn = r.bericht.map(b => `${b.guete} (Pausen ${b.sicher})${b.grund ? ' ' + b.grund : ''}`).join(' / ') + (Object.keys(ersatz).length ? ` · Ersatz für Zeile ${Object.keys(ersatz).join(', ')}` : '')
        if (process.env.PI_GENAU) for (const b of r.bericht) console.log('     ', JSON.stringify({ guete: b.guete, pausen: b.sicher, schnitte: b.schnitte }))
        if (!r.ok || !r.ogg) { unsicher.push(`Tag ${tag}: nicht gebaut — ${kenn} · Länge ${r.laengeOk} · Gegenprobe ${r.fehler}`); console.log(`Tag ${dreistellig(tag)}  FEHLER  ${kenn}`); continue }
        const u = Buffer.from(r.ogg, 'base64')
        fs.writeFileSync(path.join(ZIEL, `t${dreistellig(tag)}.ogg`), u)
        const leer = n => Array(n).fill(null)
        const bw = fw ? r.bericht[0] : null, bd = fd ? r.bericht[fw ? 1 : 0] : null
        // (vorgegebene Schnittstellen: sicher, wenn die Prüfung jede Zeile im richtigen Stück gehört hat)
        const zeilenSicher = !!bd && (sd ? sd.geprueft === true : bd.guete <= ZEILEN_SICHER_BIS)
        zeiten[String(tag)] = { w: fw ? r.zeiten[0] : leer(t.woerter.length), d: fd ? r.zeiten[fw ? 1 : 0] : leer(t.dialog.zeilen.length), ds: zeilenSicher ? 1 : 0 }
        if (zeilenSicher) sichereDialoge++
        gebaut++; bytes += u.length; sekunden += r.sekunden
        // Ohne geprüfte Schnittstellen wird wie früher aus Pausen und Textlänge geschätzt — darauf ist kein Verlass
        // (siehe src/italiano/LIESMICH.md): solche Tage immer melden.
        if (fw && !sw) unsicher.push(`Tag ${tag}: Wortliste ohne gültige Schnittdatei — Grenzen nur geschätzt`)
        if (fd && !sd) unsicher.push(`Tag ${tag}: Dialog ohne gültige Schnittdatei — Grenzen nur geschätzt`)
        if (fd && sd && sd.geprueft !== true) unsicher.push(`Tag ${tag}: Dialog-Schnitt nicht als geprüft vermerkt — Zeilen nur zum Abspielen`)
        // Wörter müssen sicher getrennt sein: klare Trennpausen ODER passende Längen. Sonst neu erzeugen.
        const wackelig = !!bw && bw.sicher < 1.4 && bw.guete > GUETE_BIS
        if (wackelig) unsicher.push(`Tag ${tag}: Wortliste unsicher getrennt — ${kenn}`)
        console.log(`Tag ${dreistellig(tag)}  ${String(r.sekunden).padStart(5)} s  ${(u.length / 1024).toFixed(0).padStart(4)} KB  Wörter / Dialog: ${kenn}${zeilenSicher ? '' : '  · Zeilen nur zum Abspielen'}${wackelig ? '  ← Wörter prüfen' : ''}`)
      }
      const sortiert = Object.fromEntries(Object.keys(zeiten).sort((a, b) => Number(a) - Number(b)).map(k => [k, zeiten[k]]))
      fs.mkdirSync(path.dirname(ZEITEN), { recursive: true })
      fs.writeFileSync(ZEITEN, JSON.stringify(sortiert))
      console.log(`\n${gebaut} Lerntage gebaut · ${(bytes / 1048576).toFixed(2)} MB · ${(sekunden / 60).toFixed(1)} min · im Mittel ${gebaut ? (bytes * 8 / sekunden / 1000).toFixed(1) : 0} kbit/s · Dialogzeilen sicher getrennt an ${sichereDialoge} von ${gebaut} Tagen`)
      if (unsicher.length) { console.log(`\n${unsicher.length} zum Nachsehen:`); for (const z of unsicher) console.log('  · ' + z); code = 1 }
    } else { console.error('Aufruf: analyse | probe | baue — siehe Kopf der Datei'); code = 2 }
  } catch (e) { console.error('FEHLER', e && e.message ? e.message : e); code = 3 }
  app.exit(code)
})
