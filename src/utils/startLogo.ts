// Start-Animation (Logo) ausblenden — das Logo selbst steht in start.html (nur Hauptfenster).
// Keine Mindestdauer: es verschwindet, sobald das Tool bereit ist, und blockiert nie
// (pointer-events: none) — das Tool darunter ist schon während des Ausblendens bedienbar.

const AUSBLENDEN_MS = 450

export function startLogoAusblenden(): void {
  if (typeof document === 'undefined') return
  const el = document.getElementById('start-logo')
  if (!el || el.classList.contains('weg')) return
  el.classList.add('weg')
  setTimeout(() => { try { el.remove() } catch { /* egal */ } }, AUSBLENDEN_MS)
}
