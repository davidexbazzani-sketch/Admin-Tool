// ── Ein gemeinsamer Fenster-Fokus-Melder für die Hintergrund-Controller ──────
//
// Vorher hing jeder der rund 20 dauerhaft laufenden Controller mit einem eigenen
// `window.addEventListener('focus', …)` am Fenster. Jedes Zurückklicken ins Tool
// — also genau der Moment, in dem jemand etwas eintippen will — hat damit ALLE
// gleichzeitig losgeschickt: 20 Netzlaufwerk-Lesevorgänge und die daraus folgenden
// PowerShell-Starts auf einen Schlag. Das Fenster ruckelt dann und nimmt keine
// Klicks an.
//
// Dieser Melder ändert nichts daran, DASS beim Fokus nachgesehen wird — nur daran,
// WANN:
//   · mehrere Fokus-Ereignisse kurz hintereinander werden zu einem zusammengefasst,
//   · jeder Abonnent läuft höchstens alle `minAbstandMs` (Standard 5 Minuten),
//   · die fälligen Abonnenten werden nacheinander mit Abstand aufgerufen statt alle
//     im selben Moment.

interface Abo {
  cb: () => void
  minAbstandMs: number
  zuletzt: number
}

const abos: Abo[] = []

/** Fokus-Ereignisse bündeln: erst wenn kurz Ruhe ist, wird ausgelöst. */
const SAMMEL_MS = 1_500
/** Abstand zwischen zwei Abonnenten, damit nichts gleichzeitig startet. */
const ABSTAND_MS = 700
/** Standard-Mindestabstand je Abonnent. */
const STANDARD_MIN_ABSTAND_MS = 5 * 60 * 1000

let gebunden = false
let sammelTimer: ReturnType<typeof setTimeout> | null = null
const laufendeTimer = new Set<ReturnType<typeof setTimeout>>()

function ausloesen(): void {
  const jetzt = Date.now()
  const faellig = abos.filter(a => jetzt - a.zuletzt >= a.minAbstandMs)
  faellig.forEach((a, i) => {
    a.zuletzt = jetzt
    const t = setTimeout(() => {
      laufendeTimer.delete(t)
      // Zwischenzeitlich abgemeldet? Dann nichts mehr tun.
      if (!abos.includes(a)) return
      try { a.cb() } catch { /* ein Controller darf die anderen nicht mitreißen */ }
    }, i * ABSTAND_MS)
    laufendeTimer.add(t)
  })
}

function beiFokus(): void {
  if (sammelTimer) clearTimeout(sammelTimer)
  sammelTimer = setTimeout(() => { sammelTimer = null; ausloesen() }, SAMMEL_MS)
}

function binden(): void {
  if (gebunden || typeof window === 'undefined') return
  window.addEventListener('focus', beiFokus)
  gebunden = true
}

/**
 * Beim Zurückkehren ins Fenster benachrichtigt werden — gebündelt und entzerrt.
 * Rückgabe: Abmeldefunktion für das useEffect-Aufräumen.
 */
export function onAppFocus(cb: () => void, minAbstandMs = STANDARD_MIN_ABSTAND_MS): () => void {
  const abo: Abo = { cb, minAbstandMs, zuletzt: Date.now() }
  abos.push(abo)
  binden()
  return () => {
    const i = abos.indexOf(abo)
    if (i >= 0) abos.splice(i, 1)
    if (abos.length === 0) {
      // Keine Abonnenten mehr: Listener und offene Timer abräumen.
      if (gebunden && typeof window !== 'undefined') { window.removeEventListener('focus', beiFokus); gebunden = false }
      if (sammelTimer) { clearTimeout(sammelTimer); sammelTimer = null }
      for (const t of laufendeTimer) clearTimeout(t)
      laufendeTimer.clear()
    }
  }
}

// ── Entzerrter erster Lauf nach dem Programmstart ────────────────────────────
// Dasselbe Problem wie beim Fokus, nur beim Start: jeder Controller stößt sofort
// beim Einhängen seinen ersten Lauf an. Zwanzig gleichzeitige Netzlaufwerk-Zugriffe
// direkt nach dem Start sind genau die Phase, in der das Fenster hakt. Die Läufe
// entfallen nicht — sie werden nur hintereinander gelegt.
const STARTABSTAND_MS = 500
let startZaehler = 0
let startFenster = 0

/**
 * Den ersten Lauf eines Hintergrund-Controllers einreihen statt sofort zu starten.
 * Rückgabe: Abbruchfunktion fürs useEffect-Aufräumen.
 */
export function ersterLaufEntzerrt(cb: () => void): () => void {
  const jetzt = Date.now()
  // Nach einer Pause von mehr als 10 s beginnt eine neue Startgruppe (z. B. nach
  // dem Anmelden), damit der Abstand nicht unbegrenzt weiterwächst.
  if (jetzt - startFenster > 10_000) { startZaehler = 0; startFenster = jetzt }
  const verzug = startZaehler * STARTABSTAND_MS
  startZaehler++
  const t = setTimeout(() => { try { cb() } catch { /* einer darf die anderen nicht mitreißen */ } }, verzug)
  return () => clearTimeout(t)
}

/** Nur für Tests: Zustand zurücksetzen. */
export function _resetAppFocus(): void {
  startZaehler = 0
  startFenster = 0
  abos.length = 0
  if (gebunden && typeof window !== 'undefined') { window.removeEventListener('focus', beiFokus); gebunden = false }
  if (sammelTimer) { clearTimeout(sammelTimer); sammelTimer = null }
  for (const t of laufendeTimer) clearTimeout(t)
  laufendeTimer.clear()
}
