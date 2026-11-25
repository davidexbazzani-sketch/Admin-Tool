// Terra Incognita — das Seegefecht auf dem Bildschirm: das Sechseck-Feld (SVG), die Befehle des Kapitäns, die Züge der
// anderen als kurze Bilderfolge. Kein Dauerlauf: Ein Bild entsteht nur, wenn etwas geschieht. Auch als Wiederholung
// eines vergangenen Kampfes nutzbar (nur ansehen).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FastForward, Flag, Pause, Play, RotateCcw, RotateCw, SkipForward, Swords } from 'lucide-react'
import { aktiv, auskaempfen, befehl, duellSieger, kannFliehen, nachspielen, spielerAmZug, type KampfAkte } from '../kampf/kampf'
import {
  bestesZiel, enterChance, erreichbar, erwartung, kannEntern, kannFeuern, lebt, MUNITION, RADIUS, seiteZu, stelleKey, TREFFER, wegZu, zieleVon,
  type Aktion, type Bild, type Eintrag, type Kampf, type KEreignis, type KSchiff, type Munition, type Stelle,
} from '../kampf/regeln'
import { abstand } from '../kern/hex'
import { windText } from '../kern/wind'
import { klang } from '../ton/klang'
import { Windpfeil } from './teile'

// ── Geometrie (Spitze oben, wie die Seekarte: Richtung 0 = Osten, im Uhrzeigersinn) ──
const S = 30, W3 = Math.sqrt(3)
const px = (q: number, r: number): [number, number] => [S * W3 * (q + r / 2), S * 1.5 * r]
const ECKEN = [0, 1, 2, 3, 4, 5].map(i => { const w = ((60 * i - 30) * Math.PI) / 180; return [Math.cos(w), Math.sin(w)] as const })
const sechseck = (x: number, y: number, s = S - 0.6): string => ECKEN.map(([cx, cy]) => `${(x + cx * s).toFixed(1)},${(y + cy * s).toFixed(1)}`).join(' ')
const FELDER: [number, number][] = []
for (let q = -RADIUS; q <= RADIUS; q++) for (let r = -RADIUS; r <= RADIUS; r++) if (abstand(q, r, 0, 0) <= RADIUS) FELDER.push([q, r])
const fk = (q: number, r: number): string => `${q},${r}`

const NAME_ART: Record<string, string> = { krake: 'die Krake', schlange: 'die Seeschlange', geist: 'das Geisterschiff', fort: 'die Festung' }
function nennung(s: KSchiff | undefined): string {
  if (!s) return 'jemand'
  if (s.boss) return s.name
  if (s.art !== 'segler') return NAME_ART[s.art] ?? s.name
  return `die „${s.name}“`
}
const Gross = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)

/** Ausgang aus Sicht des eigenen Schiffs (der Kampf rechnet aus Sicht der Seite 0; im Duell zählt, wer noch schwimmt) */
export function fuerMich(k: Kampf, meineId: number): 'sieg' | 'niederlage' | 'remis' | null {
  if (!k.ende) return null
  const seite = k.schiffe.find(s => s.id === meineId)?.seite ?? 0
  if (k.start.mensch && k.start.mensch.length > 1) { const w = duellSieger(k); return w === null ? 'remis' : w === seite ? 'sieg' : 'niederlage' }
  if (seite === 0) return k.ende === 'sieg' ? 'sieg' : k.ende === 'niederlage' ? 'niederlage' : 'remis'
  return k.ende === 'niederlage' ? 'sieg' : k.ende === 'sieg' ? 'niederlage' : 'remis'
}

/** ein Ereignis in Worten (für das Logbuch am Rand) */
export function ereignisText(e: KEreignis, k: Kampf): string | null {
  const n = (id: number): string => nennung(k.schiffe.find(s => s.id === id))
  switch (e.t) {
    case 'runde': return `— Runde ${e.n} —`
    case 'feuer': {
      const was = [e.rumpf ? `Rumpf −${e.rumpf}` : '', e.crew ? `Mannschaft −${e.crew}` : '', e.segel ? `Segel −${e.segel} %` : ''].filter(Boolean).join(', ')
      const von = k.schiffe.find(s => s.id === e.von)
      const quelle = von?.art === 'fort' ? `${Gross(n(e.von))} feuert` : `${Gross(n(e.von))} feuert ${MUNITION[e.mun].name} aus der ${e.seite ? 'Steuerbord' : 'Backbord'}-Breitseite`
      return `${quelle}: ${e.treffer} von ${e.schuesse} treffen${e.laengs ? ' – Längsfeuer!' : ''}${was ? ` (${was})` : '.'}`
    }
    case 'drehbasse': return `Drehbassen von ${n(e.von)}: −${e.crew} Mann bei ${n(e.auf)}.`
    case 'enter': return e.ok ? `${Gross(n(e.von))} entert ${n(e.auf)}!` : `Der Enterversuch von ${n(e.von)} wird abgeschlagen (−${e.verlustA} Mann).`
    case 'packt': return `Die Krake schlingt ihre Arme um ${n(e.auf)}: Rumpf −${e.rumpf}${e.crew ? `, Mannschaft −${e.crew}` : ''}. Im nächsten Zug kommt sie nicht von der Stelle!`
    case 'biss': return e.rumpf ? `Die Seeschlange beißt zu: Rumpf −${e.rumpf}${e.crew ? `, Mannschaft −${e.crew}` : ''}.` : `Ein Peitschenhieb mit dem Schwanz: Segel −${e.segel} %.`
    case 'taucht': return e.ab ? 'Die Seeschlange taucht ab – unter Wasser ist sie nicht zu treffen.' : 'Die Seeschlange taucht auf!'
    case 'gehalten': return `${Gross(n(e.id))} ist gefangen und kommt nicht von der Stelle.`
    case 'flieht': return `${Gross(n(e.id))} flieht über den Rand.`
    case 'streicht': return `${Gross(n(e.id))} streicht die Flagge!`
    case 'sinkt': { const s = k.schiffe.find(x => x.id === e.id); return s?.boss ? `${s.name} ist bezwungen!` : s?.art === 'fort' ? `${Gross(n(e.id))} fällt – die Mauern sind gebrochen, die Flagge sinkt.` : s && s.art !== 'segler' ? `${Gross(n(e.id))} versinkt in der Tiefe.` : `${Gross(n(e.id))} ist manövrierunfähig.` }
    case 'abbruch': return k.schiffe.some(s => s.boss) ? 'Der große Gegner zieht sich zurück.' : 'Es wird dunkel – man verliert sich aus den Augen.'
    default: return null
  }
}

interface Effekt { id: number; art: 'rauch' | 'treffer' | 'platsch' | 'kugel' | 'enter' | 'biss' | 'zahl'; x: number; y: number; x2?: number; y2?: number; text?: string; schlecht?: boolean }

/** Darstellung eines Schiffs oder Ungeheuers (Bug nach rechts; gedreht wird von außen) */
function Figur({ s, b, eigen }: { s: KSchiff; b: Bild; eigen: boolean }) {
  if (s.art === 'krake') {
    return (
      <g className="ti-k-krake">
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => { const w = (i * 45 * Math.PI) / 180, c = Math.cos(w), d = Math.sin(w); return <path key={i} d={`M ${c * 8} ${d * 8} Q ${c * 18 + d * 6} ${d * 18 - c * 6} ${c * 24} ${d * 24}`} /> })}
        <circle r="11" />
        <circle cx="3" cy="-3" r="2.2" className="ti-k-auge" /><circle cx="3" cy="3" r="2.2" className="ti-k-auge" />
      </g>
    )
  }
  if (s.art === 'schlange') {
    return (
      <g className={`ti-k-schlange${b.abgetaucht ? ' unten' : ''}`}>
        {b.abgetaucht && <><circle r="16" className="ti-k-welle" /><circle r="24" className="ti-k-welle" /></>}
        <path d="M -26 6 C -18 -10 -10 14 -2 0 S 12 -10 18 0" />
        <circle cx="21" cy="0" r="5.5" className="ti-k-kopf" />
      </g>
    )
  }
  if (s.art === 'fort') {
    return (
      <g className="ti-k-fort">
        <path d="M -22 14 Q -18 -4 0 -6 Q 18 -4 22 14 Z" className="ti-k-fels" />
        <rect x="-11" y="-16" width="22" height="22" rx="2" />
        {[-9, -3, 3].map(x => <rect key={x} x={x} y="-21" width="5" height="6" />)}
        <path d="M 0 -16 L 0 -30 L 10 -26 L 0 -22" className="ti-k-wimpel" />
      </g>
    )
  }
  const geist = s.art === 'geist'
  const laenge = [0.9, 0.98, 1.08, 1.18, 1.3, 1.36, 1.25][Math.max(0, Math.min(6, s.klasse))]
  const masten = s.klasse <= 1 ? [2] : s.klasse <= 3 ? [-6, 8] : [-10, 2, 13]
  return (
    <g className={`ti-k-schiff ${eigen ? 'eigen' : 'feind'}${geist ? ' geist' : ''}`} transform={`scale(${laenge})`}>
      <path d="M 24 0 C 16 -9 -4 -10 -19 -7.5 L -21 0 L -19 7.5 C -4 10 16 9 24 0 Z" className="ti-k-rumpf" />
      <path d="M -15 0 L 17 0" className="ti-k-deck" />
      {masten.map(m => <path key={m} d={`M ${m - 2} -11 Q ${m + 5} 0 ${m - 2} 11`} className="ti-k-segel" style={{ opacity: Math.max(0.25, b.segel / 100) }} />)}
      {masten.map(m => <circle key={`m${m}`} cx={m - 2} cy="0" r="1.6" className="ti-k-mast" />)}
      <path d="M -19 0 L -27 -3 L -27 3 Z" className="ti-k-flagge" />
    </g>
  )
}

function Balken({ x, y, s, b }: { x: number; y: number; s: KSchiff; b: Bild }) {
  const r = Math.max(0, Math.min(1, b.rumpf / Math.max(1, s.rumpfMax)))
  const farbe = r > 0.5 ? 'gut' : r > 0.25 ? 'warn' : 'gefahr'
  const segler = s.art === 'segler'
  return (
    <g transform={`translate(${x - 18},${y - 34})`} className="ti-k-balken">
      <rect width="36" height="5" rx="2" className="grund" />
      <rect width={36 * r} height="5" rx="2" className={farbe} />
      {segler && <>
        <rect y="6" width="36" height="2.5" rx="1" className="grund" /><rect y="6" width={(36 * Math.max(0, b.crew)) / Math.max(1, s.crewMax)} height="2.5" rx="1" className="crew" />
        <rect y="9.5" width="36" height="2.5" rx="1" className="grund" /><rect y="9.5" width={(36 * Math.max(0, b.segel)) / 100} height="2.5" rx="1" className="tuch" />
      </>}
    </g>
  )
}

/** einen vergangenen Kampf noch einmal ansehen: aus Aufstellung und Befehlen exakt nachgespielt.
 *  meineId: aus wessen Sicht (Verteidiger einer Festung: 10); offen: nicht zu Ende kämpfen lassen (ein aufgegebenes Duell) */
export function KampfWiederholung({ akte, titel, onZu, meineId = 0, offen = false }: { akte: KampfAkte; titel: string; onZu: () => void; meineId?: number; offen?: boolean }) {
  const k = useMemo(() => { try { const x = nachspielen(akte); if (!x.ende && !offen) auskaempfen(x); return x } catch { return null } }, [akte, offen])
  if (!k) return null
  return <KampfAnsicht kampf={k} titel={titel} wiederholung onZu={onZu} meineId={meineId} />
}

export interface KampfAnsichtProps {
  kampf: Kampf
  /** Titel oben (Gegner) */
  titel: string
  /** nach jedem eigenen Befehl (zum Speichern) */
  onBefehl?: (k: Kampf) => void
  /** der Kampf ist entschieden (alles gezeigt) */
  onEnde?: (k: Kampf) => void
  /** Wiederholung: nur ansehen, mit Abspieltasten */
  wiederholung?: boolean
  onZu?: () => void
  schnell?: boolean
  /** den bisherigen Verlauf nicht noch einmal zeigen (Kampf wird fortgesetzt) */
  fortsetzen?: boolean
  /** Stufe 3: das eigene Schiff (gewöhnlich 0; im Duell bei der Antwort 10, in der Wiederholung eines Überfalls auf die
   *  eigene Festung die Festung) */
  meineId?: number
  /** Duell: Name des Gegners (für „… ist am Zug“), kein „Sofort auskämpfen“, stattdessen Aufgeben. sperre: gerade keine
   *  Befehle (der eigene Zug wird übertragen); onSchliessen: die Ansicht darf geschlossen werden (Duell gestört) */
  duell?: { gegner: string; onAufgabe: () => void; hinweis?: string; sperre?: boolean; onSchliessen?: () => void }
}

export default function KampfAnsicht({ kampf: k, titel, onBefehl, onEnde, wiederholung, onZu, schnell, fortsetzen, meineId = 0, duell }: KampfAnsichtProps) {
  const [, setNeu] = useState(0)
  const neu = useCallback(() => setNeu(n => n + 1), [])
  const [mun, setMun] = useState<Munition>(0)
  const [hover, setHover] = useState<[number, number] | null>(null)
  const [vorschau, setVorschau] = useState<0 | 1 | null>(null)
  const [effekte, setEffekte] = useState<Effekt[]>([])
  const [abspielen, setAbspielen] = useState(true)
  const [tempo, setTempo] = useState(schnell ? 2 : 1)
  // (fortsetzen: der bisherige Verlauf steht gleich im Logbuch, wird aber nicht noch einmal abgespielt)
  const z = useRef({ i: fortsetzen ? k.log.length : 0, unter: 0, bild: null as Bild[] | null, laeuft: false, uhr: 0, effektNr: 0, endeGemeldet: false, zeilen: fortsetzen ? k.log.map(e => ereignisText(e.e, k)).filter((x): x is string => !!x).slice(-40) : [] as string[], runde: fortsetzen ? k.runde : 0, zeilenNr: 0 })
  const logRef = useRef<HTMLDivElement>(null)
  /** so viele Zeilen standen beim letzten Mal im Logbuch (gescrollt wird nur, wenn neue dazukommen) */
  const gescrollt = useRef(-1)
  // (Rückrufe über Verweise: Ein neues Zeichnen der Eltern darf die laufende Bilderfolge nicht abbrechen)
  const onEndeRef = useRef(onEnde)
  onEndeRef.current = onEnde
  const abspielenRef = useRef(abspielen)
  abspielenRef.current = abspielen

  const effekt = useCallback((e: Omit<Effekt, 'id'>, ms: number) => {
    const id = ++z.current.effektNr
    setEffekte(l => [...l.slice(-24), { ...e, id }])
    window.setTimeout(() => setEffekte(l => l.filter(x => x.id !== id)), ms)
  }, [])

  /** ein Ereignis zeigen; gibt die Wartezeit bis zum nächsten zurück */
  const zeige = useCallback((eintrag: Eintrag): number => {
    const st = z.current, e = eintrag.e, f = 1 / tempo
    const text = ereignisText(e, k)
    if (text && st.unter === 0) { st.zeilen = [...st.zeilen.slice(-40), text]; st.zeilenNr++ }
    if (e.t === 'runde') st.runde = e.n
    switch (e.t) {
      case 'zieht': {
        const w = e.weg[st.unter]
        if (!w) { st.unter = 0; st.bild = eintrag.bild; return 0 }
        st.bild = eintrag.bild.map(b => (b.id === e.id ? { ...b, q: w[0], r: w[1], kurs: w[2] } : b))
        st.unter++
        if (st.unter < e.weg.length) return -Math.round(150 * f)            // negativ: dasselbe Ereignis noch einmal (nächster Schritt)
        st.unter = 0
        return Math.round(170 * f)
      }
      case 'feuer': {
        st.bild = eintrag.bild
        const von = eintrag.bild.find(b => b.id === e.von), auf = eintrag.bild.find(b => b.id === e.auf)
        if (von && auf) {
          const [x1, y1] = px(von.q, von.r), [x2, y2] = px(auf.q, auf.r)
          effekt({ art: 'rauch', x: x1, y: y1 }, 900 * f)
          effekt({ art: 'kugel', x: x1, y: y1, x2, y2 }, 420 * f)
          if (e.treffer > 0) effekt({ art: 'treffer', x: x2, y: y2 }, 800 * f)
          else effekt({ art: 'platsch', x: x2 + 8, y: y2 - 6 }, 800 * f)
          const zahl = [e.rumpf ? `−${e.rumpf}` : '', e.crew ? `−${e.crew} Mann` : '', e.segel ? `−${e.segel} %` : ''].filter(Boolean).join(' ')
          if (zahl) effekt({ art: 'zahl', x: x2, y: y2 - 40, text: zahl, schlecht: auf.id === meineId }, 1300 * f)
        }
        klang('kanone')
        window.setTimeout(() => klang(e.treffer > 0 ? 'treffer' : 'platsch'), 260 * f)
        return Math.round(720 * f)
      }
      case 'enter': case 'packt': case 'biss': case 'drehbasse': {
        st.bild = eintrag.bild
        const von = eintrag.bild.find(b => b.id === e.von), auf = eintrag.bild.find(b => b.id === e.auf)
        if (von && auf) {
          const [x1, y1] = px(von.q, von.r), [x2, y2] = px(auf.q, auf.r)
          effekt({ art: e.t === 'enter' ? 'enter' : 'biss', x: (x1 + x2) / 2, y: (y1 + y2) / 2 }, 900 * f)
          const zahl = e.t === 'enter' ? (e.ok ? 'geentert!' : 'abgeschlagen') : e.t === 'drehbasse' ? `−${e.crew} Mann` : [e.rumpf ? `−${e.rumpf}` : '', 'crew' in e && e.crew ? `−${e.crew} Mann` : '', 'segel' in e && e.segel ? `−${e.segel} %` : ''].filter(Boolean).join(' ')
          if (zahl) effekt({ art: 'zahl', x: x2, y: y2 - 40, text: zahl, schlecht: auf.id === meineId }, 1300 * f)
        }
        klang(e.t === 'enter' ? 'entern' : e.t === 'drehbasse' ? 'klick' : 'treffer')
        return Math.round((e.t === 'enter' ? 1000 : 650) * f)
      }
      case 'sinkt': case 'streicht': case 'flieht': st.bild = eintrag.bild; return Math.round(650 * f)
      case 'runde': st.bild = eintrag.bild; return Math.round(260 * f)
      case 'ende': { st.bild = eintrag.bild; const fm = fuerMich(k, meineId); klang(fm === 'sieg' ? 'fanfare' : fm === 'niederlage' ? 'donner' : 'glocke'); return Math.round(900 * f) }
      default: st.bild = eintrag.bild; return e.t === 'zug' ? 0 : Math.round(220 * f)
    }
  }, [k, tempo, effekt, meineId])

  /** die Bilderfolge abspielen, bis alles gezeigt ist */
  const spiele = useCallback(() => {
    const st = z.current
    if (st.laeuft) return
    st.laeuft = true
    const tick = (): void => {
      if (!abspielenRef.current) { st.laeuft = false; neu(); return }
      if (st.i >= k.log.length) {
        st.laeuft = false
        st.bild = null
        neu()
        if (k.ende && !st.endeGemeldet && !wiederholung) st.uhr = window.setTimeout(() => { if (!st.endeGemeldet) { st.endeGemeldet = true; onEndeRef.current?.(k) } }, 500)
        return
      }
      const warte = zeige(k.log[st.i])
      if (warte >= 0) st.i++
      neu()
      st.uhr = window.setTimeout(tick, Math.abs(warte))
    }
    tick()
  }, [k, zeige, neu, wiederholung])

  // abspielen (und nach „Anhalten“ weiter); beim Verlassen läuft nichts weiter
  useEffect(() => {
    if (abspielen) spiele()
    return () => { window.clearTimeout(z.current.uhr); z.current.laeuft = false }
  }, [spiele, abspielen])
  // (nur wenn neue Zeilen dazukommen — wer zurückscrollt, um nachzulesen, wird nicht jede Sekunde ans Ende gerissen)
  useEffect(() => { if (logRef.current && gescrollt.current !== z.current.zeilenNr) { gescrollt.current = z.current.zeilenNr; logRef.current.scrollTop = logRef.current.scrollHeight } })

  const sperre = !!duell?.sperre
  const gib = useCallback((a: Aktion): void => {
    if (z.current.laeuft || sperre || !spielerAmZug(k) || aktiv(k)?.id !== meineId) return
    if (!befehl(k, a)) return
    onBefehl?.(k)
    setVorschau(null)
    spiele()
    neu()
  }, [k, onBefehl, spiele, neu, meineId, sperre])

  // ── was gerade zu sehen ist ──
  const st = z.current
  const bild: Bild[] = st.bild ?? k.schiffe.map(s => ({ id: s.id, q: s.q, r: s.r, kurs: s.kurs, rumpf: s.rumpf, crew: s.crew, segel: s.segel, zustand: s.zustand, abgetaucht: s.abgetaucht, gehalten: s.gehalten }))
  const ruhig = !st.laeuft
  const dran = aktiv(k)
  const amZug = ruhig && !wiederholung && !sperre && spielerAmZug(k) && dran?.id === meineId
  // die Runde, die gerade zu sehen ist (die Bilderfolge hinkt der Rechnung hinterher — erst recht in der Wiederholung)
  const zeigRunde = st.laeuft || st.i < k.log.length ? Math.max(1, st.runde) : k.runde
  const ich = (k.schiffe.find(s => s.id === meineId) ?? k.schiffe[0]) as KSchiff

  // erreichbare Felder: je Feld die beste Stelle (Kurs mit der meisten Wirkung der Breitseiten, sonst die billigste)
  const ziele = useMemo(() => {
    const aus = new Map<string, Stelle>()
    if (!amZug) return { aus, stellen: new Map<number, Stelle>() }
    const stellen = erreichbar(k, ich)
    const feinde = k.schiffe.filter(s => lebt(s) && s.seite !== ich.seite && !s.abgetaucht)
    const wert = (st2: Stelle): number => {
      let w = 0
      for (const seite of [0, 1] as const) {
        let beste = 0
        for (const f of feinde) {
          const d = abstand(st2.q, st2.r, f.q, f.r)
          if (d > MUNITION[mun].weite || seiteZu(st2, f.q, f.r) !== seite) continue
          const e = erwartung(ich, st2, f, mun)
          beste = Math.max(beste, e.rumpf * 3 + e.crew + Math.floor(e.segel / 4))
        }
        w += beste
      }
      return w
    }
    for (const st2 of stellen.values()) {
      if (st2.kosten === 0) continue
      const key = fk(st2.q, st2.r), alt = aus.get(key)
      if (!alt) { aus.set(key, st2); continue }
      const wa = wert(alt), wn = wert(st2)
      if (wn > wa || (wn === wa && st2.kosten < alt.kosten)) aus.set(key, st2)
    }
    return { aus, stellen }
  }, [amZug, k, ich, mun, k.log.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const pfad = hover && amZug ? (() => { const st2 = ziele.aus.get(fk(hover[0], hover[1])); return st2 ? wegZu(ziele.stellen, st2) : null })() : null

  // Breitseiten
  const seitenInfo = ([0, 1] as const).map(seite => {
    if (!amZug) return null
    if (!kannFeuern(k, ich, seite, mun)) return null
    const zl = zieleVon(k, ich, ich, seite, mun), ziel = bestesZiel(ich, ich, zl, mun) as KSchiff
    const d = abstand(ich.q, ich.r, ziel.q, ziel.r), e = erwartung(ich, ich, ziel, mun)
    return { ziel, d, chance: TREFFER[d], rumpf: Math.round(e.rumpf / 100), crew: Math.round(e.crew / 100), segel: Math.round(e.segel / 100) }
  })
  const enterZiel = amZug ? k.schiffe.filter(z2 => kannEntern(ich, z2)).sort((a, b) => enterChance(ich, b) - enterChance(ich, a))[0] : undefined
  const vorschauFelder = vorschau !== null && amZug ? new Set(FELDER.filter(([q, r]) => abstand(ich.q, ich.r, q, r) <= MUNITION[mun].weite && abstand(ich.q, ich.r, q, r) > 0 && seiteZu(ich, q, r) === vorschau).map(([q, r]) => fk(q, r))) : null

  // Tasten: 1–3 Munition, Q/E Breitseite, Leertaste Zug beenden
  useEffect(() => {
    if (wiederholung) return
    const taste = (e: KeyboardEvent): void => {
      // (auf einem Knopf löst die Leertaste schon den Knopf aus — dann nicht noch einmal)
      if (!amZug || e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return
      if (e.key === '1' || e.key === '2' || e.key === '3') setMun((Number(e.key) - 1) as Munition)
      else if (e.key === 'q' || e.key === 'Q') gib({ a: 'feuer', seite: 0, mun })
      else if (e.key === 'e' || e.key === 'E') gib({ a: 'feuer', seite: 1, mun })
      else if (e.key === ' ') { e.preventDefault(); gib({ a: 'fertig' }) }
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [amZug, gib, mun, wiederholung])

  const istFeind = (s: KSchiff): boolean => s.seite !== ich.seite
  const dranText = k.ende ? '' : !ruhig || sperre ? '' : dran?.id === meineId && k.mensch.includes(meineId) ? `Du bist am Zug – ${ich.mp} ${ich.mp === 1 ? 'Bewegungspunkt' : 'Bewegungspunkte'} übrig`
    : dran && duell && k.mensch.includes(dran.id) ? `Kpt. ${duell.gegner} ist am Zug …` : dran ? `${Gross(nennung(dran))} ist am Zug …` : ''

  return (
    <div className="ti-raum ti-kampf" data-ti-kampf={wiederholung ? 'wiederholung' : k.ende ?? 'laeuft'}>
      <div className="ti-kampf-in">
        <div className="ti-kampf-kopf">
          <Swords size={18} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2>{titel}</h2>
            <p>{wiederholung ? 'Wiederholung · ' : ''}Runde {Math.min(zeigRunde, k.start.maxRunden)} von {k.start.maxRunden} · {windText(k.start.wind)}</p>
          </div>
          <Windpfeil richtung={k.start.wind.richtung} staerke={k.start.wind.staerke} groesse={36} />
          {wiederholung && onZu && <button type="button" className="ti-knopf ti-knopf-gold" onClick={onZu} data-ti-zu>Schließen</button>}
          {!wiederholung && duell?.onSchliessen && <button type="button" className="ti-knopf" onClick={duell.onSchliessen} data-ti-duell-zu>Schließen</button>}
        </div>
        <div className="ti-kampf-leib">
          <div className="ti-kampf-feld">
            <svg viewBox="-300 -282 600 564" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Gefechtsfeld" onMouseLeave={() => setHover(null)}>
              <defs>
                <radialGradient id="ti-k-see" cx="50%" cy="45%" r="70%"><stop offset="0%" className="ti-k-see1" /><stop offset="100%" className="ti-k-see2" /></radialGradient>
              </defs>
              <circle r="290" fill="url(#ti-k-see)" />
              {FELDER.map(([q, r]) => {
                const [x, y] = px(q, r), key = fk(q, r), fels = k.fels.includes((q + 64) * 128 + (r + 64))
                const kann = ziele.aus.has(key), rand = abstand(q, r, 0, 0) === RADIUS
                const cls = ['ti-k-hex', rand ? 'rand' : '', kann ? 'kann' : '', vorschauFelder?.has(key) ? 'bogen' : '', hover && hover[0] === q && hover[1] === r ? 'hover' : ''].filter(Boolean).join(' ')
                return (
                  <g key={key}>
                    <polygon points={sechseck(x, y)} className={cls} data-ti-hex={key}
                      onMouseEnter={() => setHover([q, r])}
                      onClick={() => { const st2 = ziele.aus.get(key); if (st2) gib({ a: 'fahre', q: st2.q, r: st2.r, kurs: st2.kurs }) }} />
                    {fels && <path d={`M ${x - 14} ${y + 9} L ${x - 8} ${y - 7} L ${x - 1} ${y - 2} L ${x + 5} ${y - 12} L ${x + 14} ${y + 9} Z`} className="ti-k-felsen" />}
                  </g>
                )
              })}
              {pfad && pfad.length > 0 && <polyline className="ti-k-pfad" points={[[ich.q, ich.r], ...pfad.map(p => [p.q, p.r])].map(([q, r]) => px(q, r).join(',')).join(' ')} />}
              {k.schiffe.map(s => {
                const b = bild.find(x => x.id === s.id)
                if (!b || b.zustand === 'geflohen' || b.zustand === 'geentert') return null
                const [x, y] = px(b.q, b.r), weg = b.zustand !== 'kampf'
                return (
                  <g key={s.id} className={`ti-k-figur${weg ? ' weg' : ''}${dran?.id === s.id && ruhig && !k.ende ? ' dran' : ''}`} style={{ transform: `translate(${x}px, ${y}px)` }} data-ti-figur={s.id}>
                    {dran?.id === s.id && ruhig && !k.ende && <circle r="27" className="ti-k-ring" />}
                    {b.gehalten > 0 && <circle r="24" className="ti-k-gefangen" />}
                    <g transform={`rotate(${(s.art === 'krake' || s.art === 'fort') ? 0 : b.kurs * 60})`}><Figur s={s} b={b} eigen={!istFeind(s)} /></g>
                    {!weg && <Balken x={0} y={0} s={s} b={b} />}
                    {istFeind(s) && seitenInfo.some(i => i?.ziel.id === s.id) && <circle r="29" className="ti-k-ziel" />}
                  </g>
                )
              })}
              {effekte.map(e => {
                switch (e.art) {
                  case 'rauch': return <g key={e.id} transform={`translate(${e.x},${e.y})`} className="ti-k-rauch">{[0, 1, 2, 3].map(i => <circle key={i} cx={(i - 1.5) * 9} cy={(i % 2) * 6 - 3} r={7 + (i % 2) * 3} />)}</g>
                  case 'kugel': return <line key={e.id} x1={e.x} y1={e.y} x2={e.x2} y2={e.y2} className="ti-k-kugel" />
                  case 'treffer': return <g key={e.id} transform={`translate(${e.x},${e.y})`} className="ti-k-treffer"><circle r="14" /><circle r="6" className="kern" /></g>
                  case 'platsch': return <g key={e.id} transform={`translate(${e.x},${e.y})`} className="ti-k-platsch"><circle r="6" /><circle r="12" /></g>
                  case 'enter': return <g key={e.id} transform={`translate(${e.x},${e.y})`} className="ti-k-enter"><path d="M -10 -10 L 10 10 M 10 -10 L -10 10" /></g>
                  case 'biss': return <g key={e.id} transform={`translate(${e.x},${e.y})`} className="ti-k-biss"><circle r="13" /></g>
                  case 'zahl': return <text key={e.id} x={e.x} y={e.y} className={`ti-k-zahl${e.schlecht ? ' schlecht' : ''}`} textAnchor="middle">{e.text}</text>
                  default: return null
                }
              })}
            </svg>
            {dranText && <div className="ti-kampf-dran" data-ti-dran>{dranText}</div>}
          </div>

          <div className="ti-kampf-tafel">
            {!wiederholung && (
              <>
                <div className="ti-kampf-werte">
                  <b>„{ich.name}“</b>
                  <span>Rumpf <b>{Math.max(0, ich.rumpf)}</b>/{ich.rumpfMax}</span>
                  <span>Mannschaft <b>{ich.crew}</b>/{ich.crewMax}</span>
                  <span>Segel <b>{ich.segel} %</b></span>
                  <span>Kanonen <b>{ich.kanonen}</b> je Seite</span>
                </div>
                <div className="ti-kampf-mun" role="radiogroup" aria-label="Munition">
                  {MUNITION.map((m, i) => (
                    <button key={i} type="button" role="radio" aria-checked={mun === i} className={mun === i ? 'an' : ''} onClick={() => setMun(i as Munition)} title={`${m.text} Reichweite ${m.weite} Felder.`} data-ti-mun={i}>{m.name}<small>bis {m.weite} Felder</small></button>
                  ))}
                </div>
                <div className="ti-kampf-breit">
                  {([0, 1] as const).map(seite => {
                    const info = seitenInfo[seite], schon = ich.gefeuert[seite]
                    return (
                      <button key={seite} type="button" className="ti-knopf" disabled={!info} onClick={() => gib({ a: 'feuer', seite, mun })} onMouseEnter={() => setVorschau(seite)} onMouseLeave={() => setVorschau(null)} onFocus={() => setVorschau(seite)} onBlur={() => setVorschau(null)} data-ti-feuer={seite}>
                        <span>{seite === 0 ? 'Backbord' : 'Steuerbord'} <small>({seite === 0 ? 'Q' : 'E'})</small></span>
                        <small>{schon ? 'schon gefeuert' : info ? `${nennung(info.ziel)} · ${info.d} ${info.d === 1 ? 'Feld' : 'Felder'} · ${info.chance} % je Kanone · ~${[info.rumpf ? `${info.rumpf} Rumpf` : '', info.crew ? `${info.crew} Mann` : '', info.segel ? `${info.segel} % Segel` : ''].filter(Boolean).join(', ') || 'wenig'}` : 'kein Ziel in Reichweite'}</small>
                      </button>
                    )
                  })}
                </div>
                <div className="ti-reihe">
                  <button type="button" className="ti-knopf ti-knopf-klein" disabled={!amZug || !ziele.stellen.has(stelleKey(ich.q, ich.r, (ich.kurs + 5) % 6))} onClick={() => gib({ a: 'fahre', q: ich.q, r: ich.r, kurs: (ich.kurs + 5) % 6 })} title="Nach Backbord drehen (1 Punkt)" data-ti-drehe="-1"><RotateCcw size={14} />Drehen</button>
                  <button type="button" className="ti-knopf ti-knopf-klein" disabled={!amZug || !ziele.stellen.has(stelleKey(ich.q, ich.r, (ich.kurs + 1) % 6))} onClick={() => gib({ a: 'fahre', q: ich.q, r: ich.r, kurs: (ich.kurs + 1) % 6 })} title="Nach Steuerbord drehen (1 Punkt)" data-ti-drehe="1"><RotateCw size={14} />Drehen</button>
                  {enterZiel && <button type="button" className="ti-knopf ti-knopf-klein" onClick={() => gib({ a: 'entern', ziel: enterZiel.id })} data-ti-entern>Entern ({enterChance(ich, enterZiel)} %)</button>}
                  {amZug && kannFliehen(k) && <button type="button" className="ti-knopf ti-knopf-klein" onClick={() => gib({ a: 'fliehe' })} data-ti-fliehen><Flag size={13} />Fliehen</button>}
                </div>
                <div className="ti-reihe">
                  <button type="button" className="ti-knopf ti-knopf-gold" disabled={!amZug} onClick={() => gib({ a: 'fertig' })} data-ti-fertig>Zug beenden <small style={{ fontWeight: 400 }}>(Leertaste)</small></button>
                  {duell
                    ? <button type="button" className="ti-knopf ti-knopf-leise ti-knopf-klein" disabled={!!k.ende} onClick={duell.onAufgabe} title="Das Duell verloren geben" data-ti-aufgeben><Flag size={13} />Aufgeben</button>
                    : <button type="button" className="ti-knopf ti-knopf-leise ti-knopf-klein" disabled={!amZug} onClick={() => gib({ a: 'auto' })} title="Die Mannschaft kämpft den Rest des Gefechts selbst aus" data-ti-auto><FastForward size={13} />Sofort auskämpfen</button>}
                </div>
                {duell?.hinweis && <p className="ti-stumm" data-ti-duell-hinweis>{duell.hinweis}</p>}
                {amZug && k.runde === 1 && !k.aktionen.length && (
                  <p className="ti-stumm" data-ti-kampf-hilfe>Klicke ein goldenes Feld an, um dorthin zu segeln (gegen den Wind geht es nicht). Gefeuert wird zur Seite: Bring den Gegner neben dich. Wer genau vor dem Bug oder hinter dem Heck des Gegners steht, schießt längs übers Deck – anderthalbfacher Schaden. Am Rand des Feldes kannst du fliehen.</p>
                )}
              </>
            )}
            {wiederholung && (
              <div className="ti-reihe" data-ti-wiederholung>
                <button type="button" className="ti-knopf ti-knopf-klein" onClick={() => setAbspielen(a => !a)} data-ti-abspielen>{abspielen ? <Pause size={13} /> : <Play size={13} />}{abspielen ? 'Anhalten' : 'Weiter'}</button>
                <button type="button" className="ti-knopf ti-knopf-klein" onClick={() => setTempo(t => (t >= 4 ? 1 : t * 2))} data-ti-tempo><SkipForward size={13} />{tempo}×</button>
              </div>
            )}
            <div className="ti-kampf-log" ref={logRef} data-ti-kampf-log>
              {st.zeilen.map((zl, i) => <p key={i} className={zl.startsWith('—') ? 'runde' : ''}>{zl}</p>)}
            </div>
            <div className="ti-kampf-feinde">
              {k.schiffe.filter(istFeind).map(s => { const b = bild.find(x => x.id === s.id); return b ? (
                <div key={s.id} className={b.zustand !== 'kampf' ? 'weg' : ''}><b>{s.boss ? s.name : s.art === 'segler' ? `„${s.name}“` : Gross(NAME_ART[s.art] ?? s.name)}</b>
                  <span>{b.zustand === 'kampf' ? <>Rumpf {Math.max(0, b.rumpf)}{s.boss ? '' : `/${s.rumpfMax}`}{s.art === 'segler' ? ` · ${b.crew} Mann · ${s.kanonen} Kanonen` : s.art === 'geist' || s.art === 'fort' ? ` · ${s.kanonen} Kanonen` : ''}{b.abgetaucht ? ' · abgetaucht' : ''}</> : { gesunken: 'erledigt', gestrichen: 'hat die Flagge gestrichen', geentert: 'geentert', geflohen: 'geflohen', kampf: '' }[b.zustand]}</span></div>) : null })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
