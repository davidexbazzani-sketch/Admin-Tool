// Terra Incognita — der Ton, vollständig vom Tool erzeugt (Web Audio): Meer, Wind, leise Musik, kurze Zeichen.
// Keine einzige Tondatei. Regeln:
//  • Der Ton pausiert, sobald das Fenster nicht im Vordergrund ist, und endet beim Verlassen des Raums.
//  • Leise: Die eingestellte Lautstärke (0 … 100) wird auf höchstens ein Viertel der vollen Aussteuerung abgebildet.
import type { TiEinstellungen } from '../kern/stand'

type Zeichen = 'klick' | 'segel' | 'entdeckung' | 'fund' | 'fanfare' | 'glocke' | 'muenze' | 'donner' | 'kanone' | 'treffer' | 'platsch' | 'entern'

let ctx: AudioContext | null = null
let haupt: GainNode | null = null
let meer: { quelle: AudioBufferSourceNode; gain: GainNode } | null = null
let musikUhr: ReturnType<typeof setTimeout> | null = null
let einst = { ton: false, musik: false, laut: 35 }
let aktiv = false
let horcht = false

const zielLaut = (): number => (einst.ton ? (einst.laut / 100) * 0.25 : 0)

function rauschen(c: AudioContext, sekunden: number): AudioBuffer {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * sekunden), c.sampleRate), d = b.getChannelData(0)
  let letzter = 0
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; letzter = (letzter + 0.02 * w) / 1.02; d[i] = letzter * 3.2 }      // braunes Rauschen: tief und weich
  return b
}

function starte(): void {
  if (ctx || !aktiv || !einst.ton) return
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return
    ctx = new C({ latencyHint: 'playback' })
    haupt = ctx.createGain()
    haupt.gain.value = 0
    haupt.connect(ctx.destination)
    haupt.gain.linearRampToValueAtTime(zielLaut(), ctx.currentTime + 1.5)
    // Meer: Rauschen durch einen Tiefpass, der langsam auf- und zugeht (Wellen)
    const quelle = ctx.createBufferSource()
    quelle.buffer = rauschen(ctx, 6)
    quelle.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'; filter.frequency.value = 420; filter.Q.value = 0.4
    const gain = ctx.createGain()
    gain.gain.value = 0.55
    const welle = ctx.createOscillator(), tiefe = ctx.createGain()
    welle.frequency.value = 0.11; tiefe.gain.value = 0.28
    welle.connect(tiefe); tiefe.connect(gain.gain)
    const welle2 = ctx.createOscillator(), tiefe2 = ctx.createGain()
    welle2.frequency.value = 0.07; tiefe2.gain.value = 180
    welle2.connect(tiefe2); tiefe2.connect(filter.frequency)
    quelle.connect(filter); filter.connect(gain); gain.connect(haupt)
    quelle.start(); welle.start(); welle2.start()
    meer = { quelle, gain }
    planeMusik(2500)
  } catch { ctx = null; haupt = null }
}

function ende(): void {
  if (musikUhr) { clearTimeout(musikUhr); musikUhr = null }
  const c = ctx
  ctx = null; haupt = null; meer = null
  if (c) void c.close().catch(() => { /* egal */ })
}

/** ein gezupfter Ton (Laute/Harfe): Dreieck + Oberton, schnell abklingend */
function zupfe(frequenz: number, wann: number, laut: number, dauer = 1.6): void {
  if (!ctx || !haupt) return
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain()
  o.type = 'triangle'; o.frequency.value = frequenz
  o2.type = 'sine'; o2.frequency.value = frequenz * 2.001
  const g2 = ctx.createGain()
  g2.gain.value = 0.25
  g.gain.setValueAtTime(0, wann)
  g.gain.linearRampToValueAtTime(laut, wann + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0008, wann + dauer)
  o.connect(g); o2.connect(g2); g2.connect(g); g.connect(haupt)
  o.start(wann); o2.start(wann); o.stop(wann + dauer + 0.05); o2.stop(wann + dauer + 0.05)
}

// Musik: ruhige Motive in D-Dorisch, mit langen Pausen — eher eine Ahnung von Musik als ein Lied
const LEITER = [146.83, 164.81, 174.61, 196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0]
function planeMusik(inMs: number): void {
  if (musikUhr) clearTimeout(musikUhr)
  musikUhr = setTimeout(() => {
    musikUhr = null
    if (!ctx || !einst.musik || !einst.ton) { if (ctx) planeMusik(4000); return }
    const t = ctx.currentTime + 0.05
    let stufe = 2 + Math.floor(Math.random() * 5)
    const toene = 3 + Math.floor(Math.random() * 4)
    let zeit = 0
    for (let i = 0; i < toene; i++) {
      zupfe(LEITER[stufe], t + zeit, 0.16 + Math.random() * 0.06)
      if (i === 0 || Math.random() < 0.3) zupfe(LEITER[Math.max(0, stufe - 4)] / 2, t + zeit, 0.1, 2.4)       // Basston
      zeit += [0.45, 0.6, 0.9, 1.2][Math.floor(Math.random() * 4)]
      stufe = Math.max(0, Math.min(LEITER.length - 1, stufe + [-2, -1, -1, 1, 1, 2, 3][Math.floor(Math.random() * 7)]))
    }
    planeMusik((zeit + 3 + Math.random() * 7) * 1000)
  }, inMs)
}

/** ein kurzes Zeichen spielen */
export function klang(z: Zeichen): void {
  if (!ctx || !haupt || !einst.ton || ctx.state !== 'running') return
  const t = ctx.currentTime + 0.01
  switch (z) {
    case 'klick': zupfe(880, t, 0.06, 0.12); break
    case 'segel': zupfe(196, t, 0.14, 0.9); zupfe(293.66, t + 0.12, 0.12, 0.9); break
    case 'entdeckung': [293.66, 369.99, 440, 587.33].forEach((f, i) => zupfe(f, t + i * 0.11, 0.2, 1.4)); break
    case 'fund': zupfe(440, t, 0.18, 0.8); zupfe(659.25, t + 0.1, 0.18, 1.1); break
    case 'fanfare': [293.66, 440, 587.33, 739.99, 880].forEach((f, i) => zupfe(f, t + i * 0.13, 0.22, 1.8)); break
    case 'glocke': zupfe(659.25, t, 0.22, 2.2); zupfe(1318.5, t, 0.08, 1.6); zupfe(659.25, t + 0.55, 0.18, 2.2); break
    case 'muenze': zupfe(1567.98, t, 0.1, 0.25); zupfe(2093, t + 0.07, 0.1, 0.3); break
    case 'donner': {
      const q = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
      q.buffer = rauschen(ctx, 1.6)
      f.type = 'lowpass'; f.frequency.value = 160
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.5)
      q.connect(f); f.connect(g); g.connect(haupt)
      q.start(t); q.stop(t + 1.6)
      break
    }
    // Gefecht: dumpfer Knall (Rauschen, Tiefpass, der schnell zufällt), harter Einschlag, Platschen, Klingen
    case 'kanone': stoss(t, 0.7, 420, 90, 0.9); break
    case 'treffer': stoss(t, 0.35, 2400, 600, 0.55); break
    case 'platsch': stoss(t, 0.5, 1400, 300, 0.3, 'bandpass'); break
    case 'entern': [1760, 2093, 1568, 2349].forEach((fr, i) => zupfe(fr, t + i * 0.07, 0.06, 0.18)); stoss(t, 0.4, 900, 200, 0.25); break
  }
}

/** ein kurzer Stoß aus Rauschen, dessen Filter von `von` auf `bis` Hertz fällt */
function stoss(t: number, dauer: number, von: number, bis: number, laut: number, art: BiquadFilterType = 'lowpass'): void {
  if (!ctx || !haupt) return
  const q = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
  q.buffer = rauschen(ctx, dauer + 0.05)
  f.type = art; f.frequency.setValueAtTime(von, t); f.frequency.exponentialRampToValueAtTime(bis, t + dauer)
  g.gain.setValueAtTime(laut, t); g.gain.exponentialRampToValueAtTime(0.001, t + dauer)
  q.connect(f); f.connect(g); g.connect(haupt)
  q.start(t); q.stop(t + dauer + 0.05)
}

function sichtbarkeit(): void {
  if (!ctx) { if (aktiv && einst.ton && document.hasFocus() && !document.hidden) starte(); return }
  const vorn = document.hasFocus() && !document.hidden
  if (vorn && ctx.state === 'suspended') void ctx.resume().catch(() => { /* egal */ })
  else if (!vorn && ctx.state === 'running') void ctx.suspend().catch(() => { /* egal */ })
}

/** Raum betreten: Ton darf laufen */
export function oeffneTon(): void {
  aktiv = true
  if (!horcht) { horcht = true; window.addEventListener('focus', sichtbarkeit); window.addEventListener('blur', sichtbarkeit); document.addEventListener('visibilitychange', sichtbarkeit) }
  if (einst.ton && document.hasFocus() && !document.hidden) starte()
}
/** Raum verlassen: alles aus, nichts bleibt offen */
export function schliesseTon(): void {
  aktiv = false
  if (horcht) { horcht = false; window.removeEventListener('focus', sichtbarkeit); window.removeEventListener('blur', sichtbarkeit); document.removeEventListener('visibilitychange', sichtbarkeit) }
  ende()
}
/** Einstellungen übernehmen (an/aus, Musik, Lautstärke) */
export function setzeTon(e: Pick<TiEinstellungen, 'ton' | 'musik' | 'laut'>): void {
  einst = { ton: e.ton, musik: e.musik, laut: e.laut }
  if (!einst.ton) { ende(); return }
  if (!ctx) { if (aktiv && document.hasFocus() && !document.hidden) starte(); return }
  if (haupt) haupt.gain.linearRampToValueAtTime(zielLaut(), ctx.currentTime + 0.3)
  void meer
}
/** für die Leistungsprüfung */
export const tonLaeuft = (): boolean => !!ctx
