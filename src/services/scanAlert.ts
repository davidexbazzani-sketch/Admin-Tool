// ── Falsch-Scan-Alarm: Web-Audio + Visual ─────────────────────────────────────
// Generiert einen schrillen Ton ohne Audio-Datei (offlinefähig).
// Die UI-Komponente, die den Alarm auslöst, setzt zusätzlich das Flag
// errorFlashActive im AppStore, damit der globale Rot-Blink-Overlay aktiv wird.

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
      ctx = new Ctor()
    }
    // Manche Browser starten suspended bis zur ersten Nutzer-Interaktion
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    return ctx
  } catch { return null }
}

/**
 * Spielt einen schrillen Alarm-Ton (ca. 1.2 s lang). Kombiniert zwei
 * Oszillatoren (2100 Hz + 2800 Hz Rechteck) mit kurzer Anschlag-Hüllkurve.
 */
export function playShrillAlert(): void {
  const c = getCtx()
  if (!c) return
  const now = c.currentTime
  const duration = 1.2
  const master = c.createGain()
  master.gain.setValueAtTime(0.0, now)
  master.gain.linearRampToValueAtTime(0.45, now + 0.02)
  master.gain.setValueAtTime(0.45, now + duration - 0.05)
  master.gain.linearRampToValueAtTime(0.0, now + duration)
  master.connect(c.destination)

  for (const freq of [2100, 2800]) {
    const osc = c.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(freq, now)
    // leichte Modulation für "schriller" Effekt
    osc.frequency.linearRampToValueAtTime(freq + 80, now + duration / 2)
    osc.frequency.linearRampToValueAtTime(freq, now + duration)
    osc.connect(master)
    osc.start(now)
    osc.stop(now + duration)
  }
}
