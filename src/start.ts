// Einstieg NUR für start.html (Hauptfenster). Unterfenster laden index.html → main.tsx direkt.
//
// Das eigentliche Tool (Bundle ~7 MB) belegt den Hauptthread beim Ausführen am Stück. Würde es
// sofort ausgeführt, entstünde vorher kein einziges Bild: das Fenster erschiene erst, wenn alles
// fertig ist, und die Start-Animation wäre nie zu sehen. Darum: erst die Schrift holen und EIN
// Bild zeichnen lassen, dann das Tool importieren. Die Animation läuft danach im Compositor-Thread
// weiter.
//
// Keine verlorene Zeit: das Hauptpaket wird schon beim Öffnen der Seite geholt und übersetzt
// (<link rel="modulepreload"> in start.html, eingefügt vom Plugin „start-vorladen" in
// vite.config.ts) — hier wartet nur die AUSFÜHRUNG auf das erste Bild. Obergrenze 250 ms.

let gestartet = false

function ladeTool(): void {
  if (gestartet) return
  gestartet = true
  void import('./main').catch(err => {
    console.error('[start] Tool konnte nicht geladen werden:', err)
    try { document.getElementById('start-logo')?.remove() } catch { /* egal */ }
  })
}

// Schrift VOR dem Import: ist der Hauptthread erst belegt, kann sie nicht mehr eingesetzt werden
// und der Schriftzug bliebe unsichtbar (font-display: block).
const schrift = Promise.all([
  document.fonts.load('600 1em "Space Grotesk ITA"'),
  document.fonts.load('400 1em "Space Grotesk ITA"'),
]).catch(() => undefined)
const hoechstens = new Promise<void>(r => setTimeout(r, 120))

void Promise.race([schrift, hoechstens]).then(() => {
  // rAF: das Bild mit Logo wird gebaut; der Timeout danach läuft erst, wenn es übergeben ist.
  requestAnimationFrame(() => setTimeout(ladeTool, 0))
})

// Rückfall: nie länger als 250 ms warten (z. B. falls kein Bild entsteht).
setTimeout(ladeTool, 250)
