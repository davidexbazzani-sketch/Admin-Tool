// Parla Italiano — Ton abspielen.
// Je Lerntag gibt es EINE kleine Tondatei (public/italiano/ton/tNNN.ogg) mit allen Wörtern und
// Dialogzeilen hintereinander. Wo ein Stück beginnt und endet, steht in ton/zeiten.json.
// Beides wird erst geholt, wenn zum ersten Mal etwas abgespielt werden soll.
import type { TonStelle } from './typen'

/** je Lerntag: w = Wörter, d = Dialogzeilen; jedes Stück [Anfang, Ende] in Sekunden (null = kein Ton);
 *  ds = 1: die Dialogzeilen sind nachweislich sauber getrennt und taugen für Hör-Aufgaben */
type Zeiten = Record<string, { w: ([number, number] | null)[]; d: ([number, number] | null)[]; ds?: number }>

let zeiten: Zeiten | null = null
let zeitenLaden: Promise<Zeiten> | null = null

/** Zeitmarken holen (einmal). Ohne Tondateien bleibt die Liste leer — dann gibt es eben keinen Ton. */
export function ladeTon(): Promise<Zeiten> {
  if (zeiten) return Promise.resolve(zeiten)
  if (!zeitenLaden) {
    zeitenLaden = import('../ton/zeiten.json')
      .then(m => { zeiten = (m.default ?? m) as unknown as Zeiten; return zeiten })
      .catch(() => { zeiten = {}; return zeiten })
  }
  return zeitenLaden
}

/** Gibt es Ton für diesen Lerntag? (erst nach ladeTon() aussagekräftig) */
export const hatTon = (tag: number): boolean => !!zeiten?.[String(tag)]
export const hatStelle = (s: TonStelle | undefined): boolean => !!s && !!zeiten?.[String(s.tag)]?.[s.art]?.[s.nr]
/** Sind die einzelnen Dialogzeilen dieses Lerntags sicher getrennt? (Abspielen des ganzen Dialogs geht immer.) */
export const zeilenSicher = (tag: number): boolean => zeiten?.[String(tag)]?.ds === 1

const datei = (tag: number): string => `./italiano/ton/t${String(tag).padStart(3, '0')}.ogg`

// ── Tonweg wach halten ──
// Viele Headsets (Funk/Bluetooth, z. B. Jabra) und Laptop-Lautsprecher schalten sich nach ein paar Sekunden ohne Ton ab
// und brauchen beim nächsten Ton einige Zehntelsekunden zum Aufwachen — so lange wurde der Wortanfang verschluckt
// (beim zweiten Drücken war das Gerät dann noch wach). Solange im Kurs geübt wird, hält deshalb ein unhörbares
// Signal den Tonweg offen. Nach WACH_MS ohne Ton wird er wieder freigegeben, damit das Headset nicht belegt bleibt
// und der PC trotzdem in den Ruhezustand gehen kann.
const WACH_MS = 3 * 60_000
/** so lange nach dem Öffnen des Tonwegs warten, bevor das erste Stück beginnt (Gerät wacht auf) */
const AUFWACHEN_MS = 450
/** −80 dB: nicht zu hören, aber keine „digitale Stille“ (die würde Chromium nach 30 s abschalten — dann schliefe das Gerät wieder ein) */
const LEISE = 1e-4

let wach: { ctx: AudioContext; bereitAb: number } | null = null
let schlafUhr: ReturnType<typeof setTimeout> | undefined

/** Tonweg öffnen bzw. offen halten. Ergebnis: so viele Millisekunden noch warten, bis das Gerät sicher wach ist. */
function halteWach(): number {
  if (schlafUhr !== undefined) clearTimeout(schlafUhr)
  schlafUhr = setTimeout(gibTonwegFrei, WACH_MS)
  if (wach && wach.ctx.state !== 'closed') {
    if (wach.ctx.state !== 'running') {
      const w = wach
      void w.ctx.resume().then(() => { w.bereitAb = performance.now() + AUFWACHEN_MS }).catch(() => { /* egal */ })
      return AUFWACHEN_MS
    }
    return Math.max(0, wach.bereitAb - performance.now())
  }
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return 0
    const ctx = new Ctor({ latencyHint: 'playback' })
    const quelle = ctx.createConstantSource()
    quelle.offset.value = LEISE
    quelle.connect(ctx.destination)
    quelle.start()
    const w = { ctx, bereitAb: performance.now() + AUFWACHEN_MS }
    wach = w
    if (ctx.state !== 'running') void ctx.resume().then(() => { w.bereitAb = performance.now() + AUFWACHEN_MS }).catch(() => { /* egal */ })
    return AUFWACHEN_MS
  } catch { return 0 }
}

/** Tonweg freigeben (beim Verlassen des Kurses und nach WACH_MS ohne Ton) */
export function gibTonwegFrei(): void {
  if (schlafUhr !== undefined) { clearTimeout(schlafUhr); schlafUhr = undefined }
  const w = wach
  wach = null
  if (w) void w.ctx.close().catch(() => { /* egal */ })
}

const spieler = new Map<number, HTMLAudioElement>()
let aktiv: { audio: HTMLAudioElement; bild: number; fertig: () => void } | null = null
/** zählt jedes Abspielen/Stoppen — ein Stück, das noch auf das Aufwachen wartet, merkt so, dass es überholt ist */
let laufNr = 0
/** beendet das Warten auf das Aufwachen sofort (beim Stoppen) */
let warteAbbruch: (() => void) | null = null

function spielerFuer(tag: number): HTMLAudioElement {
  let a = spieler.get(tag)
  if (!a) {
    a = new Audio(datei(tag))
    a.preload = 'auto'
    spieler.set(tag, a)
    // nicht unbegrenzt viele Dateien offen halten
    if (spieler.size > 6) { const erster = spieler.keys().next().value as number; if (erster !== tag) { spieler.get(erster)?.removeAttribute('src'); spieler.delete(erster) } }
  }
  return a
}

export function stoppeTon(): void {
  laufNr++
  if (warteAbbruch) { const f = warteAbbruch; warteAbbruch = null; f() }
  if (!aktiv) return
  const a = aktiv
  aktiv = null
  cancelAnimationFrame(a.bild)
  try { a.audio.pause() } catch { /* egal */ }
  a.fertig()
}

/** Ein Stück abspielen. Löst auf, wenn es zu Ende ist (oder gestoppt wurde / kein Ton da ist). */
export async function spiele(stelle: TonStelle, langsam = false): Promise<void> {
  const z = (await ladeTon())[String(stelle.tag)]?.[stelle.art]?.[stelle.nr]
  stoppeTon()
  if (!z) return
  const meins = laufNr
  const [von, bis] = z
  const audio = spielerFuer(stelle.tag)
  const warten = halteWach()
  if (warten > 0) {
    await new Promise<void>(r => {
      const uhr = setTimeout(() => { warteAbbruch = null; r() }, warten)
      warteAbbruch = () => { clearTimeout(uhr); r() }
    })
    if (meins !== laufNr) return   // inzwischen gestoppt oder etwas anderes angetippt
  }
  await new Promise<void>(fertig => {
    let erledigt = false
    const ende = () => { if (!erledigt) { erledigt = true; fertig() } }
    const starte = () => {
      try {
        audio.playbackRate = langsam ? 0.8 : 1
        audio.currentTime = von
        const pruefe = () => {
          if (aktiv?.audio !== audio) return
          if (audio.currentTime >= bis || audio.ended) { stoppeTon(); return }
          aktiv.bild = requestAnimationFrame(pruefe)
        }
        aktiv = { audio, bild: 0, fertig: ende }
        void audio.play().then(() => { if (aktiv?.audio === audio) aktiv.bild = requestAnimationFrame(pruefe) }).catch(() => { if (aktiv?.audio === audio) aktiv = null; ende() })
      } catch { ende() }
    }
    if (audio.readyState >= 1) starte()
    else {
      const bereit = () => { audio.removeEventListener('loadedmetadata', bereit); audio.removeEventListener('error', kaputt); starte() }
      const kaputt = () => { audio.removeEventListener('loadedmetadata', bereit); audio.removeEventListener('error', kaputt); ende() }
      audio.addEventListener('loadedmetadata', bereit)
      audio.addEventListener('error', kaputt)
      audio.load()
    }
  })
}

/** Tondatei eines Lerntags schon einmal anfordern und den Tonweg öffnen, damit das erste Wort ohne Wartezeit
 *  und ohne verschluckten Anfang kommt */
export function wecke(tag: number): void {
  void ladeTon().then(z => { if (z[String(tag)]) { spielerFuer(tag).load(); halteWach() } })
}
