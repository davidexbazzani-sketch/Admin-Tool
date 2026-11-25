// Terra Incognita — der Kartentisch: Kopfleiste, Karte, Kursplanung, Segeln, und alles, was dabei aufgeht.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Anchor, ArrowLeft, BookOpen, Castle, Compass, LocateFixed, Minus, Plus, Settings, Swords, Trophy, Users, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useDuellStore } from '../../store/duellStore'
import type { Ereignis } from '../inhalt/ereignisse'
import { gegnerTitel, type Gegner } from '../kampf/gegner'
import { auskaempfen, nachspielen, spielerAmZug, type KampfAkte } from '../kampf/kampf'
import type { Kampf as KampfZustand } from '../kampf/regeln'
import { heimweg, reichweite, schrittStunden, stundenUnbekannt, sucheRoute, verbrauch, type Route } from '../kern/fahrt'
import { beginneBelagerung, belagerungEnde, schutzVon } from '../kern/festung'
import { beginneKampf, grossAnteil, kampfEnde, merkeBefehle, stellungFuer, versucheFlucht, zahleZoll, type KampfFolge, type Stellung } from '../kern/gefecht'
import { GEBIETE, gebietVon } from '../kern/gebiete'
import { abstand, feldNr, richtungZu, ring, type Feld } from '../kern/hex'
import { meideFelder, sichtbareGegner, wocheVon } from '../kern/piraten'
import { faelligesEreignis, hebeSchatz, untersuche, type LandErgebnis } from '../kern/land'
import { ART_NAME, ortName } from '../kern/namen'
import { kennt } from '../kern/nebel'
import { KLASSEN, RAENGE, rangVon } from '../kern/schiff'
import { fahrtUmwelt, ladungMenge, ortVon, schritt, sichtBei, werteVon } from '../kern/spiel'
import { ankerplaetze, EIS, gelaende, istLand, istOffen, ortBei, orteNahe, RIFF, type Ort } from '../kern/welt'
import { windIn, windText } from '../kern/wind'
import Karte, { type KarteHandle, type KartenMarke } from '../karte/Karte'
import { angebotAusChat, offenesDuell, useDuell, zeige as zeigeDuell } from '../netz/duell'
import { meldeBelagerung, stelleZu, type ZielPruefung, type Zustellung } from '../netz/festungen'
import { flaschenInSicht, grossBonus, sichereInsNetz, useGemeinsam, veroeffentliche, type FremdFlasche } from '../netz/gemeinsam'
import { umwelt, useTerra } from '../speicher'
import { klang, setzeTon } from '../ton/klang'
import Atlas from './Atlas'
import { EntdeckungBlatt, EreignisBlatt, LandBlatt, MeldeBlatt, UmkehrBlatt } from './Blaetter'
import DuellAnsicht, { DuellAngebot } from './Duell'
import Einstellungen from './Einstellungen'
import Festung from './Festung'
import { FlascheGefunden, FlascheSchreiben } from './Flaschenpost'
import Gefechte from './Gefechte'
import Hafen from './Hafen'
import KampfAnsicht, { KampfWiederholung } from './Kampf'
import Kapitaene from './Kapitaene'
import { festungsStatus } from './Festung'
import RaetselBlatt from './Raetsel'
import { BelagerungBlatt, gegnerKopf, KampfEndeBlatt, StellungBlatt } from './Stellung'
import Tagesfahrt from './Tagesfahrt'
import { tageText, toast, Toasts, Windpfeil, zahl } from './teile'
import Zeitung from './Zeitung'

type Fenster =
  | { art: 'entdeckung'; keys: string[] }
  | { art: 'ereignis'; ereignis: Ereignis }
  | { art: 'land'; key: string; ergebnis: LandErgebnis }
  | { art: 'umkehr'; grund: 'proviant' | 'rumpf' }
  | { art: 'raetsel'; key: string; raetsel: number }
  | { art: 'flasche'; flasche: FremdFlasche }
  | { art: 'melden' }
  | { art: 'flascheSchreiben' }
  | { art: 'stellung'; stellung: Stellung }
  | { art: 'kampfEnde'; folge: KampfFolge; gegner: Gegner; akte: KampfAkte; titel: string; zustellung?: Zustellung | 'laeuft' | null }
  | { art: 'belagerung'; owner: string }
type RaumArt = null | 'hafen' | 'atlas' | 'kapitaene' | 'tagesfahrt' | 'einstellungen' | 'zeitung' | 'gefechte' | 'festung'
/** festung: Kurs auf eine Festung ('' = die eigene, sonst der Besitzer) — bei Ankunft öffnet sich Raum bzw. Belagerung */
interface Plan { ziel: Feld; route: Route; ortKey?: string; gegner?: Gegner; festung?: string }

const TUN: Record<string, string> = { hafen: 'In den Hafen einlaufen', dorf: 'Das Dorf besuchen', quelle: 'Proviant holen', ruine: 'Die Ruine erkunden', wunder: 'An Land gehen', einsiedler: 'Den Einsiedler besuchen', wrack: 'Zum Wrack tauchen', treibgut: 'Bergen' }

export default function Spieltisch() {
  const spiel = useTerra(s => s.spiel)
  const rev = useTerra(s => s.rev)
  const tue = useTerra(s => s.tue)
  const setScreen = useAppStore(s => s.setScreen)
  const verbunden = useGemeinsam(s => s.verbunden)
  const fremderStand = useGemeinsam(s => s.fremderStand)
  const veraltet = useGemeinsam(s => s.veraltet)
  const flaschen = useGemeinsam(s => s.flaschen)
  const meldungen = useGemeinsam(s => s.meldungen)
  const bundHinweise = useGemeinsam(s => s.bundHinweise)
  const kapitaene = useGemeinsam(s => s.kapitaene)
  const buende = useGemeinsam(s => s.buende)
  const duellId = useDuell(s => s.id)
  const duellAngebot = useDuell(s => s.angebot)
  const chatAngebot = useDuellStore(s => s.terra)
  const karte = useRef<KarteHandle>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [stapel, setStapel] = useState<Fenster[]>([])
  const stapelRef = useRef(stapel)
  stapelRef.current = stapel
  const [raum, setRaum] = useState<RaumArt>(null)
  const [segelt, setSegelt] = useState(false)
  const [sicher, setSicher] = useState<ReadonlySet<number> | null>(null)
  const [hover, setHover] = useState<Feld | null>(null)
  /** ein laufendes Gefecht (fortsetzen: nach einem Abbruch wieder aufgenommen — der Verlauf wird nicht noch einmal gezeigt) */
  const [gefecht, setGefecht] = useState<{ k: KampfZustand; st: Stellung; fortsetzen: boolean } | null>(null)
  const [wiederholung, setWiederholung] = useState<{ akte: KampfAkte; titel: string; meineId?: number } | null>(null)
  const fahrt = useRef<{ felder: Feld[]; i: number; uhr: number | null; ortKey?: string; ziel: Feld; gegner?: Gegner; festung?: string } | null>(null)
  const zeitungGezeigt = useRef(false)
  /** Gegner, die beim Segeln schon gemeldet wurden („Segel in Sicht“ — je Gegner einmal) */
  const gesichtet = useRef(new Set<string>())

  const stand = spiel?.stand
  const werte = useMemo(() => (stand ? werteVon(stand) : null), [stand, rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const schrittMs = stand?.einstellungen.schnell ? 70 : 190

  const halt = useCallback(() => {
    const f = fahrt.current
    if (f?.uhr) window.clearTimeout(f.uhr)
    fahrt.current = null
    setSegelt(false)
  }, [])
  useEffect(() => halt, [halt])

  // Rückmeldungen aus der gemeinsamen Welt (Erstentdecker, Geschenke)
  useEffect(() => { if (meldungen.length) for (const m of useGemeinsam.getState().nimmMeldungen()) toast(m) }, [meldungen])

  // beim Öffnen: Ton einstellen, Hafenzeitung zeigen
  useEffect(() => {
    if (!stand) return
    setzeTon(stand.einstellungen)
    if (!zeitungGezeigt.current) {
      zeitungGezeigt.current = true
      // wer schon einmal hier war, bekommt die Hafenzeitung; wer neu ist, startet gleich am Kartentisch
      if (stand.gesehen.einstieg) setRaum('zeitung')
      else tue(sp => { sp.stand.gesehen.einstieg = 1 })
    }
  }, [stand?.einstellungen.ton, stand?.einstellungen.musik, stand?.einstellungen.laut]) // eslint-disable-line react-hooks/exhaustive-deps

  const oeffneOrt = useCallback((key: string) => {
    const ort = ortVon(key)
    if (!ort) return
    const erg = tue(sp => untersuche(sp, key, umwelt()))
    if (!erg.ok) { if (erg.grund) toast(erg.grund); return }
    if (erg.hafen) {
      for (const z of erg.folge.zeilen) toast(z)
      klang('glocke')
      setRaum('hafen')
      void veroeffentliche(); void sichereInsNetz()
      return
    }
    klang(erg.kapitel ? 'fanfare' : 'fund')
    setStapel(q => [...q, { art: 'land', key, ergebnis: erg }])
  }, [tue])

  // ── Gefechte ──
  /** der große Gegner aus Sicht dieses Kapitäns: Wer zum ersten Mal in dieser Woche angreift, bringt seinen Anteil am Lebensbalken mit */
  const grossLage = useCallback((): { rest: number; max: number; teilnehmer: number } | null => {
    const sp = useTerra.getState().spiel, g = useGemeinsam.getState().gross
    if (!sp || !g) return null
    const neuDabei = sp.stand.gross.w === wocheVon(umwelt().tag) && sp.stand.gross.kaempfe > 0 ? 0 : grossAnteil(sp.stand.klasse)
    const max = g.hp + neuDabei
    return { rest: max - g.schaden, max, teilnehmer: g.teilnehmer.length + (neuDabei ? 1 : 0) }
  }, [])
  const grossGesperrt = useCallback((): string | undefined => {
    const sp = useTerra.getState().spiel, g = useGemeinsam.getState(), heute = umwelt().tag
    if (!sp) return 'Kein Spiel geladen.'
    if (g.verbunden !== true) return 'Gegen den großen Gegner kämpfen alle gemeinsam – dafür braucht es die Verbindung zum Netzlaufwerk.'
    if (g.gross?.besiegt) return 'Er ist diese Woche schon bezwungen. Nächste Woche zeigt sich ein neuer.'
    if (sp.stand.gross.w === wocheVon(heute) && sp.stand.gross.tag === heute && sp.stand.gross.kaempfe > 0) return 'Heute hast du ihn schon angegriffen. Morgen wieder.'
    const gl = grossLage()
    if (gl && gl.rest <= 0) return 'Sein Lebensbalken ist leer – gleich wird er für bezwungen erklärt.'
    return undefined
  }, [grossLage])

  const beendeGefecht = useCallback((k: KampfZustand, st: Stellung) => {
    // Belagerung einer Festung (Stufe 3): Folgen sofort, die Beute erst, wenn der Bericht auf dem Netzlaufwerk liegt
    if (st.art === 'festung') {
      const owner = st.gegner.u ?? ''
      const f = tue(sp => belagerungEnde(sp, k, umwelt()))
      const akte: KampfAkte = { start: k.start, aktionen: k.aktionen.slice() }
      setGefecht(null)
      setStapel(q => [{ art: 'kampfEnde', folge: { ...f, schaden: 0, todesstoss: false }, gegner: st.gegner, akte, titel: gegnerTitel(st.gegner), zustellung: 'laeuft' }, ...q.filter(x => x.art !== 'stellung' && x.art !== 'belagerung')])
      void stelleZu().then(z => {
        // ist das Ergebnisblatt schon zu, kommt das Ergebnis der Zustellung als Meldung (sonst bliebe es ungesagt)
        if (!stapelRef.current.some(x => x.art === 'kampfEnde' && x.akte === akte) && z?.titel) toast(`${z.titel}: ${z.zeilen.join(' · ')}`)
        setStapel(q => q.map(x => (x.art === 'kampfEnde' && x.akte === akte ? { ...x, zustellung: z } : x)))
        if (z?.zaehlt) klang('fanfare')
        if (!z) void meldeBelagerung(owner, false)
      })
      void veroeffentliche()
      return
    }
    const bonus = st.gegner.art === 'gross' ? grossBonus() : 0
    const folge = tue(sp => kampfEnde(sp, k, st.art, st.gegner, umwelt(), bonus))
    setGefecht(null)
    setStapel(q => [{ art: 'kampfEnde', folge, gegner: st.gegner, akte: { start: k.start, aktionen: k.aktionen.slice() }, titel: gegnerTitel(st.gegner) }, ...q.filter(f => f.art !== 'stellung')])
    void veroeffentliche()
  }, [tue])

  /** Gefecht beginnen — auf dem Feld oder gleich ausgekämpft (sofort). nachFlucht: Die Flucht ist misslungen. */
  const starteGefecht = useCallback((st: Stellung, sofort: boolean, nachFlucht = false) => {
    const gl = st.gegner.art === 'gross' ? grossLage() : null
    const k = tue(sp => beginneKampf(sp, st, umwelt(), nachFlucht, gl ? { rest: gl.rest, max: gl.max } : undefined))
    setStapel(q => q.filter(f => f.art !== 'stellung'))
    if (sofort) { auskaempfen(k); tue(sp => merkeBefehle(sp, k)); beendeGefecht(k, st); return }
    klang('glocke')
    setGefecht({ k, st, fortsetzen: false })
  }, [tue, grossLage, beendeGefecht])

  /** Belagerung beginnen (die frische Prüfung ist schon gelaufen) — auf dem Feld oder gleich ausgekämpft */
  const starteBelagerung = useCallback((p: ZielPruefung, sofort: boolean) => {
    if (!p.ok || !p.ziel || !p.bild) return
    const ziel = p.ziel, bild = p.bild
    const k = tue(sp => beginneBelagerung(sp, ziel, bild, umwelt()))
    const gegner = useTerra.getState().spiel?.stand.kampf.laufend?.gegner
    if (!gegner) return
    const st: Stellung = { art: 'festung', gegner, zoll: 0, flucht: 0, gewarnt: false }
    void meldeBelagerung(ziel.u, true)
    setStapel(q => q.filter(f => f.art !== 'belagerung'))
    if (sofort) { auskaempfen(k); tue(sp => merkeBefehle(sp, k)); beendeGefecht(k, st); return }
    klang('glocke')
    setGefecht({ k, st, fortsetzen: false })
  }, [tue, beendeGefecht])

  // Duelle (Stufe 3): eine im Chat angenommene Einladung hier zu Ende annehmen; ein offenes Duell wieder zeigen
  useEffect(() => {
    if (!chatAngebot) return
    angebotAusChat(chatAngebot.id, chatAngebot.bis)
    useDuellStore.getState().setzeTerra(null)
  }, [chatAngebot])
  useEffect(() => {
    const sp = useTerra.getState().spiel, od = sp ? offenesDuell(sp.stand) : undefined
    if (od && !useDuell.getState().id) zeigeDuell(od.id)
  }, [])

  // ein Kampf, der beim letzten Mal mittendrin abbrach (Tool geschlossen): dort weitermachen
  useEffect(() => {
    const l = useTerra.getState().spiel?.stand.kampf.laufend
    if (!l) return
    const st: Stellung = { art: l.art, gegner: l.gegner, zoll: 0, flucht: 0, gewarnt: false }
    let k: KampfZustand
    try { k = nachspielen(l.akte) } catch { tue(sp => { sp.stand.kampf.laufend = null }); return }
    if (k.ende || !spielerAmZug(k)) { auskaempfen(k); beendeGefecht(k, st); toast('Der letzte Kampf ist zu Ende gebracht.') }
    else { setGefecht({ k, st, fortsetzen: true }); toast('Der Kampf geht weiter, wo er stand.') }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** um sichtbare Piraten und Ungeheuer herum planen — außer um den, auf den der Kurs zielt */
  const meiden = useCallback((ausser?: Gegner): Set<number> => {
    const sp = useTerra.getState().spiel
    if (!sp) return new Set()
    const m = meideFelder(sp.stand, sp.karte, umwelt().tag, sichtBei(sp.stand, sp.stand.q, sp.stand.r) + 5)
    if (ausser) { m.delete(feldNr(ausser.q, ausser.r)); for (const f of ring(ausser.q, ausser.r, 1)) m.delete(feldNr(f.q, f.r)) }
    return m
  }, [])

  /** Begegnung von sich aus (Angriff auf einen Piraten, ein Nest, den großen Gegner) */
  const begegne = useCallback((g: Gegner) => {
    const sp = useTerra.getState().spiel
    if (!sp) return
    const art = g.art === 'nest' ? 'nest' : g.art === 'gross' ? 'gross' : 'angriff'
    setStapel(q => [...q, { art: 'stellung', stellung: stellungFuer(sp, g, art) }])
  }, [])

  const naechster = useRef<() => void>(() => { /* wird unten gesetzt */ })
  naechster.current = () => {
    const f = fahrt.current, sp = useTerra.getState().spiel
    if (!f || !sp) return
    const e = tue(s => schritt(s, f.felder[f.i], umwelt()))
    if (!e.ok) {
      halt(); setPlan(null)
      toast(e.grund === 'riff' ? 'Riff voraus! Ohne Lot kommt hier kein Schiff durch.' : e.grund === 'eis' ? 'Treibeis voraus! Ohne Eisbug geht es hier nicht weiter.' : 'Land voraus!')
      return
    }
    f.i++
    const neu: Fenster[] = []
    if (e.fisch) toast(`Guter Fang: +${tageText(e.fisch)} Proviant`)
    if (e.umkehr) { halt(); setPlan(null); klang('donner'); setStapel([{ art: 'umkehr', grund: e.umkehr }]); return }
    // ein Gegner stellt das Schiff (oder es war das Ziel der Fahrt: dann ist es ein Angriff)
    if (e.gegner && e.stellung) {
      halt(); setPlan(null)
      const absicht = f.gegner && f.gegner.id === e.gegner.id
      const st = stellungFuer(sp, e.gegner, absicht ? 'angriff' : e.stellung)
      klang(e.stellung === 'hinterhalt' && !st.gewarnt ? 'donner' : 'glocke')
      setStapel(q => [...q, { art: 'stellung', stellung: st }, ...(e.entdeckt.length ? [{ art: 'entdeckung', keys: e.entdeckt } as Fenster] : [])])
      return
    }
    // Segel in Sicht: Führt der restliche Kurs an einem frisch gesichteten Gegner vorbei, anhalten und neu abstecken
    {
      const st = sp.stand, sicht = sichtBei(st, st.q, st.r)
      const frisch = sichtbareGegner(st, sp.karte, umwelt().tag, sicht + 1).filter(g => (g.art === 'pirat' || g.art === 'krake' || g.art === 'schlange' || g.art === 'geist') && !gesichtet.current.has(g.id) && g.id !== f.gegner?.id)
      for (const g of frisch) gesichtet.current.add(g.id)
      const rest = f.felder.slice(f.i)
      const imWeg = frisch.find(g => rest.some(x => abstand(x.q, x.r, g.q, g.r) <= 1))
      if (imWeg) {
        const { ziel, ortKey, gegner, festung } = f
        halt()
        const ziele = gegner ? ring(gegner.q, gegner.r, 1) : (ortKey || festung !== undefined) && istLand(gelaende(ziel.q, ziel.r)) ? ankerplaetze(ziel.q, ziel.r) : [ziel]
        const route = sucheRoute(st.q, st.r, ziele, sp.karte, fahrtUmwelt(st, umwelt()), false, 40000, meiden(gegner))
        setPlan(route && route.felder.length ? { ziel, route, ortKey, gegner, festung } : null)
        klang('glocke')
        toast(imWeg.art === 'pirat' ? 'Segel in Sicht! Piraten voraus – der Kurs führt jetzt um sie herum.' : 'Etwas Großes im Wasser voraus – der Kurs führt jetzt darum herum.')
        if (neu.length) setStapel(q => [...q, ...neu])
        return
      }
    }
    if (e.entdeckt.length) { neu.push({ art: 'entdeckung', keys: e.entdeckt }); klang('entdeckung') }
    if (e.hier) { const erg = tue(s => untersuche(s, (e.hier as Ort).key, umwelt())); if (erg.ok) neu.push({ art: 'land', key: e.hier.key, ergebnis: erg }) }
    if (e.ereignis) neu.push({ art: 'ereignis', ereignis: faelligesEreignis(sp.stand) })
    const fl = flaschenInSicht(sp.stand, sichtBei(sp.stand, sp.stand.q, sp.stand.r), abstand)[0]
    if (fl) neu.push({ art: 'flasche', flasche: fl })
    const fertig = f.i >= f.felder.length
    if (neu.length || fertig) {
      const { ziel, ortKey, gegner, festung } = f
      halt()
      if (!fertig) {
        // Rest der Strecke als neuen Plan anbieten
        const st = sp.stand, ziele = gegner ? ring(gegner.q, gegner.r, 1) : (ortKey || festung !== undefined) && istLand(gelaende(ziel.q, ziel.r)) ? ankerplaetze(ziel.q, ziel.r) : [ziel]
        const route = sucheRoute(st.q, st.r, ziele, sp.karte, fahrtUmwelt(st, umwelt()), false, 40000, meiden(gegner))
        setPlan(route && route.felder.length ? { ziel, route, ortKey, gegner, festung } : null)
      } else setPlan(null)
      if (neu.length) setStapel(q => [...q, ...neu])
      else if (gegner) begegne(gegner)
      else if (festung !== undefined) { if (festung) setStapel(q => [...q, { art: 'belagerung', owner: festung }]); else setRaum('festung') }
      else if (ortKey && !e.hier) oeffneOrt(ortKey)
      return
    }
    f.uhr = window.setTimeout(() => naechster.current(), schrittMs)
  }

  const segle = useCallback((p: Plan) => {
    if (!p.route.felder.length) return
    halt()
    setSicher(null)
    if (!useTerra.getState().spiel?.stand.gesehen.kurs) tue(sp => { sp.stand.gesehen.kurs = 1 })
    fahrt.current = { felder: p.route.felder, i: 0, uhr: null, ortKey: p.ortKey, ziel: p.ziel, gegner: p.gegner, festung: p.festung }
    setSegelt(true)
    klang('segel')
    naechster.current()
  }, [halt])

  const aufFeld = useCallback((f: Feld) => {
    const sp = useTerra.getState().spiel
    if (!sp) return
    if (fahrt.current) { halt(); return }
    const st = sp.stand
    if (f.q === st.q && f.r === st.r) { setPlan(null); return }
    let ziele: Feld[] = [f], ortKey: string | undefined, festung: string | undefined
    // ein Gegner auf der Karte: Kurs auf ein Nachbarfeld — liegt das Schiff schon daneben, gleich die Begegnung
    const gegner = kennt(sp.karte, f.q, f.r) ? sichtbareGegner(st, sp.karte, umwelt().tag, sichtBei(st, st.q, st.r) + 5).find(g => g.q === f.q && g.r === f.r) : undefined
    // eine Festung (die eigene oder die eines Kollegen): davor ankern — liegt das Schiff schon davor, gleich hinein
    const fremdeFestung = kennt(sp.karte, f.q, f.r) ? useGemeinsam.getState().kapitaene.find(k => !k.ich && k.fe && k.fe.q === f.q && k.fe.r === f.r) : undefined
    const eigeneFestung = !!st.festung && st.festung.q === f.q && st.festung.r === f.r
    if (!gegner && (fremdeFestung || eigeneFestung)) {
      festung = fremdeFestung ? fremdeFestung.u : ''
      // (auch aus einem Hafen gleich daneben — sonst gäbe es einen Kurs über null Felder, der nichts tut)
      if (abstand(st.q, st.r, f.q, f.r) <= 1) { setPlan(null); if (festung) setStapel(q => [...q, { art: 'belagerung', owner: festung as string }]); else setRaum('festung'); return }
      ziele = ankerplaetze(f.q, f.r)
    } else if (gegner) {
      if (abstand(st.q, st.r, gegner.q, gegner.r) <= 1 && st.imHafen === null) { setPlan(null); begegne(gegner); return }
      ziele = ring(gegner.q, gegner.r, 1)
    } else if (kennt(sp.karte, f.q, f.r)) {
      const g = gelaende(f.q, f.r), ort = ortBei(f.q, f.r), bekannterOrt = ort && st.entdeckt[`o${ort.key}`] ? ort : null
      if (istLand(g)) {
        if (!bekannterOrt) { toast('Dort ist Land. Segeln kann man nur davor.'); return }
        ortKey = bekannterOrt.key
        ziele = ankerplaetze(f.q, f.r)
        if (abstand(st.q, st.r, f.q, f.r) <= 1 && istOffen(gelaende(st.q, st.r))) { setPlan(null); oeffneOrt(ortKey); return }
      } else {
        const w = werteVon(st)
        if (g === RIFF && !w.lot) { toast('Ein Riff. Ohne Lot kommt hier kein Schiff durch.'); return }
        if (g === EIS && !w.eisbug) { toast('Treibeis. Ohne Eisbug kommt hier kein Schiff durch.'); return }
        if (bekannterOrt) ortKey = bekannterOrt.key
      }
    }
    // um sichtbare Piraten und Ungeheuer herum; nur wenn es gar nicht anders geht, mitten hindurch
    const fu = fahrtUmwelt(st, umwelt())
    let route = sucheRoute(st.q, st.r, ziele, sp.karte, fu, false, 40000, meiden(gegner))
    if (!route) { route = sucheRoute(st.q, st.r, ziele, sp.karte, fu); if (route) toast('Achtung: Dieser Kurs führt dicht an Gegnern vorbei.') }
    if (!route) { toast('Dorthin führt kein Weg, den dein Schiff nehmen kann.'); return }
    const gefunden = route
    setPlan(alt => {
      const neu = { ziel: f, route: gefunden, ortKey, gegner, festung }
      if (alt && alt.ziel.q === f.q && alt.ziel.r === f.r) { window.setTimeout(() => segle(neu), 0); return alt }     // zweiter Klick aufs selbe Ziel: los
      return neu
    })
  }, [halt, oeffneOrt, segle, begegne, meiden])

  // Tasten: Eingabe = segeln, Esc = abbrechen
  useEffect(() => {
    const taste = (e: KeyboardEvent): void => {
      if (stapel.length || raum || gefecht || wiederholung || duellId || duellAngebot) return
      if (e.key === 'Enter' && plan && !segelt) { e.preventDefault(); segle(plan) }
      else if (e.key === 'Escape') { if (segelt) halt(); else setPlan(null) }
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [plan, segelt, stapel.length, raum, segle, halt, gefecht, wiederholung, duellId, duellAngebot])

  // Umkehrlinie: von wo reicht der Proviant noch in einen Hafen? (nur in Ruhe berechnet)
  useEffect(() => {
    if (!spiel || segelt) return
    const uhr = window.setTimeout(() => {
      const st = spiel.stand, u = umwelt(), fu = fahrtUmwelt(st, u)
      const stunden = Math.floor((st.proviant * 100) / fu.werte.verbrauch)
      if (stunden <= 0) { setSicher(null); return }
      const grenze = Math.min(stunden, 60 * 24)            // weiter als 60 Tage zeichnet die Linie nicht
      const hin = reichweite(st.q, st.r, spiel.karte, fu, grenze)
      const haefen: Feld[] = []
      for (const [k, e] of Object.entries(st.entdeckt)) if (e.t === 'o' && e.art === 'hafen' && abstand(st.q, st.r, e.q, e.r) <= 140) { void k; for (const a of ankerplaetze(e.q, e.r)) if (kennt(spiel.karte, a.q, a.r)) haefen.push(a) }
      const heim = heimweg(haefen, spiel.karte, fu, grenze)
      const menge = new Set<number>()
      for (const [n, h] of hin) { const z = heim.get(n); if (z !== undefined && h + z <= stunden) menge.add(n) }
      setSicher(menge)
    }, 220)
    return () => window.clearTimeout(uhr)
  }, [spiel, rev, segelt])

  const routeGedeckt = useMemo(() => {
    if (!plan || !stand || !spiel) return 0
    const fu = fahrtUmwelt(stand, umwelt())
    let rest = stand.proviant, q = stand.q, r = stand.r, n = 0
    for (const f of plan.route.felder) {
      const std = kennt(spiel.karte, f.q, f.r) ? schrittStunden(f.q, f.r, richtungZu(q, r, f.q, f.r), fu) : stundenUnbekannt(fu)
      rest -= verbrauch(std ?? stundenUnbekannt(fu), fu)
      if (rest <= 0) break
      n++; q = f.q; r = f.r
    }
    return n
  }, [plan, stand, spiel, rev]) // eslint-disable-line react-hooks/exhaustive-deps

  // Gegner in Sichtweite (und weiter weg auf bekannten Feldern: Nester, der große Gegner) — für alle Kollegen dieselben
  const gegnerListe = useMemo<Gegner[]>(() => (stand && spiel ? sichtbareGegner(stand, spiel.karte, umwelt().tag, sichtBei(stand, stand.q, stand.r) + 5) : []), [stand, spiel, rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const marken = useMemo<KartenMarke[]>(() => {
    if (!stand) return []
    const aus: KartenMarke[] = flaschen.filter(f => !stand.atlas.flaschen.includes(f.id)).map(f => ({ q: f.q, r: f.r, art: 'flasche' as const }))
    for (const g of gegnerListe) aus.push({ q: g.q, r: g.r, art: g.art })
    // Entdeckungen der Bündnis-Kameraden („Karten tauschen“): ein Wimpel an der Stelle
    for (const h of bundHinweise) { const i = h.key.indexOf(','); aus.push({ q: Number(h.key.slice(1, i)), r: Number(h.key.slice(i + 1)), art: 'bund' }) }
    // Festungen: die eigene in Gold, die der Kollegen rot (angreifbar) oder blass (geschützt, im Nebel, Bündnis)
    if (stand.festung) aus.push({ q: stand.festung.q, r: stand.festung.r, art: 'eigeneFestung' })
    const heute = umwelt().tag, meinBund = stand.bund ? buende.find(b => b.key === stand.bund?.key && b.mitglieder.includes(stand.benutzer)) : undefined
    for (const k of kapitaene) if (!k.ich && k.fe) aus.push({ q: k.fe.q, r: k.fe.r, art: festungsStatus(k, heute, !!stand.festung, !!meinBund?.mitglieder.includes(k.u)).angreifbar ? 'festung' : 'festungRuhe' })
    return aus
  }, [flaschen, stand, rev, gegnerListe, bundHinweise, kapitaene, buende]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!spiel || !stand || !werte) return null
  const u = umwelt()
  const gebiet = gebietVon(stand.q, stand.r), wind = windIn(gebiet, u.tag)
  const anteil = Math.max(0, Math.min(1, stand.proviant / werte.proviantMax))
  const imHafen = stand.imHafen ? ortVon(stand.imHafen) : null
  const nahe = stand.imHafen ? [] : orteNahe(stand.q, stand.r, 1).filter(o => stand.entdeckt[`o${o.key}`] && TUN[o.art] && !(o.art === 'wrack' || o.art === 'treibgut' ? stand.erledigt[o.key] : false) && (istLand(gelaende(o.q, o.r)) || (o.q === stand.q && o.r === stand.r)))
  const schaetze = stand.schatzkarten.filter(k => !k.gehoben && abstand(stand.q, stand.r, k.q, k.r) <= 1)
  // (läuft eine Wiederholung, ruht der Stapel darunter — sonst läge das Ergebnisblatt über ihr)
  const oben = wiederholung ? undefined : stapel[0]
  const zu = (): void => setStapel(q => q.slice(1))
  const hoverOrt = hover && kennt(spiel.karte, hover.q, hover.r) ? ortBei(hover.q, hover.r) : null
  const hoverGegner = hover && kennt(spiel.karte, hover.q, hover.r) ? gegnerListe.find(g => g.q === hover.q && g.r === hover.r) : undefined
  const hoverBund = hover ? bundHinweise.find(h => h.key.slice(1) === `${hover.q},${hover.r}`) : undefined
  const hoverFestung = hover && kennt(spiel.karte, hover.q, hover.r) ? kapitaene.find(k => !k.ich && k.fe && k.fe.q === hover.q && k.fe.r === hover.r) : undefined
  const hoverEigene = !!hover && !!stand.festung && stand.festung.q === hover.q && stand.festung.r === hover.r
  const hoverText = hoverEigene ? `Deine Festung „${stand.festung?.name}“ – anklicken, um Kurs zu setzen`
    : hoverFestung?.fe ? `Festung „${hoverFestung.fe.n}“ von Kpt. ${hoverFestung.n || hoverFestung.u} – ${schutzVon(hoverFestung.fe, hoverFestung.tag, u.tag) === 'nebel' ? 'im Nebel' : 'anklicken, um Kurs zu setzen'}`
    : hoverGegner ? (() => { const k = gegnerKopf(hoverGegner); return `${k.ueber}: ${k.titel} – anklicken, um Kurs zu setzen` })()
    : hoverBund ? `Kpt. ${hoverBund.von} (Bündnis) hat hier etwas gefunden${hoverBund.name ? `: „${hoverBund.name}“` : ''}`
      : hoverOrt && stand.entdeckt[`o${hoverOrt.key}`] ?`${ART_NAME[hoverOrt.art]}${hoverOrt.art === 'hafen' || hoverOrt.art === 'dorf' || hoverOrt.art === 'wrack' || hoverOrt.art === 'quelle' ? ': ' + ortName(hoverOrt) : ''}` : hover && kennt(spiel.karte, hover.q, hover.r) ? GEBIETE[gebietVon(hover.q, hover.r)].name : hover ? 'Unbekannte Gewässer' : ''
  const ungemeldet = Object.values(stand.entdeckt).filter(e => !e.gemeldet).length
  const planTage = plan ? tageText(plan.route.stunden) : ''
  const reicht = plan ? routeGedeckt >= plan.route.felder.length : true

  return (
    <>
      <div className="ti-kopf" data-ti-kopf>
        <button type="button" className="ti-zurueck" onClick={() => setScreen('games')} title="Zurück zum Pausenraum"><ArrowLeft size={14} /><span className="ti-lang">Pausenraum</span></button>
        <span className="ti-titel">Terra Incognita</span>
        <span className="ti-wert" title={`Rang: ${RAENGE[rangVon(stand.ruhm)].name}`} data-ti-rang><Trophy size={13} />{RAENGE[rangVon(stand.ruhm)].name} <small>{zahl(stand.ruhm)} Ruhm</small></span>
        <span className="ti-wert ti-wert-gold" data-ti-gold>{zahl(stand.gold)} <small>Gold</small></span>
        <span className={`ti-wert${anteil < 0.12 ? ' ti-wert-knapp' : ''}`} title="Proviant: Ein Tag auf See kostet einen Tag Vorrat." data-ti-proviant-kopf>
          <span className={`ti-balken${anteil < 0.12 ? ' leer' : anteil < 0.3 ? ' knapp' : ''}`}><i style={{ width: `${Math.round(anteil * 100)}%` }} /></span>{tageText(stand.proviant)} <small>Proviant</small>
        </span>
        <span className="ti-wert" title={`${KLASSEN[stand.klasse].name} „${stand.schiffName}“`}><Anchor size={13} />{KLASSEN[stand.klasse].name} <small>{ladungMenge(stand)}/{werte.laderaum} Ladung</small></span>
        <span style={{ flex: 1 }} />
        {fremderStand && <span className="ti-wert ti-wert-knapp" title="Auf einem anderen PC hast du schon weitergespielt. Dieser PC veröffentlicht nichts, bis du in den Einstellungen entscheidest, wo es weitergeht." data-ti-fremder-stand>anderer PC ist weiter</span>}
        {veraltet && <span className="ti-wert ti-wert-knapp" title="Auf einem anderen PC läuft eine neuere Fassung des Tools. Dieser PC veröffentlicht nichts in die gemeinsame Welt, bis auch hier das Tool aktualisiert ist. Gespielt wird trotzdem.">Tool hier älter</span>}
        <span className="ti-wert" title={verbunden ? 'Gemeinsame Karte: verbunden' : 'Gemeinsame Karte: keine Verbindung zum Netzlaufwerk – gespielt wird trotzdem.'} data-ti-netz={verbunden ? 'an' : 'aus'}>{verbunden ? <Wifi size={13} /> : <WifiOff size={13} />}</span>
        <div className="ti-leiste">
          <button type="button" onClick={() => setRaum('tagesfahrt')} title="Tagesfahrt" data-ti-knopf="tagesfahrt"><Compass size={14} /><span className="ti-lang">Tagesfahrt</span>{!stand.tagesfahrt[String(u.tag)] && <span className="ti-punkt" />}</button>
          <button type="button" onClick={() => setRaum('atlas')} title="Atlas und Logbuch" data-ti-knopf="atlas"><BookOpen size={14} /><span className="ti-lang">Atlas</span>{ungemeldet > 0 && <span className="ti-punkt" />}</button>
          <button type="button" onClick={() => setRaum('kapitaene')} title="Die Kapitäne" data-ti-knopf="kapitaene"><Users size={14} /><span className="ti-lang">Kapitäne</span></button>
          <button type="button" onClick={() => setRaum('gefechte')} title="Gefechte: der große Gegner der Woche, Chronik und Trophäen" data-ti-knopf="gefechte"><Swords size={14} /><span className="ti-lang">Gefechte</span></button>
          <button type="button" onClick={() => setRaum('festung')} title="Festung: die eigene und die der Kollegen" data-ti-knopf="festung"><Castle size={14} /><span className="ti-lang">Festung</span>{stand.kampf.bericht && <span className="ti-punkt" />}</button>
          <button type="button" onClick={() => tue(sp => { sp.stand.einstellungen.ton = !sp.stand.einstellungen.ton })} title={stand.einstellungen.ton ? 'Ton aus' : 'Ton an'} data-ti-knopf="ton" aria-pressed={stand.einstellungen.ton}>{stand.einstellungen.ton ? <Volume2 size={14} /> : <VolumeX size={14} />}</button>
          <button type="button" onClick={() => setRaum('einstellungen')} title="Einstellungen" data-ti-knopf="einstellungen"><Settings size={14} /></button>
        </div>
      </div>

      <div className="ti-buehne">
        <Karte ref={karte} spiel={spiel} rev={rev} route={plan?.route ?? null} routeGedeckt={routeGedeckt} sicher={sicher} marken={marken} schrittMs={schrittMs} onFeld={aufFeld} onHover={setHover} />
        <Toasts />

        <div className="ti-ecke ti-ecke-lo">
          <div className="ti-tafel ti-wind" data-ti-wind>
            <Windpfeil richtung={wind.richtung} staerke={wind.staerke} />
            <span><b>{GEBIETE[gebiet].name}</b><span>{windText(wind)} · Tag {Math.floor(stand.stunden / 24) + 1} auf See</span></span>
          </div>
          {hoverText && <div className="ti-tafel ti-notiz" style={{ padding: '5px 10px' }}><span className="ti-leise">{hoverText}</span></div>}
        </div>

        <div className="ti-ecke ti-ecke-ro">
          <div className="ti-tafel ti-zoom">
            <button type="button" onClick={() => karte.current?.zoome(1)} title="Näher"><Plus size={16} /></button>
            <button type="button" onClick={() => karte.current?.zoome(-1)} title="Weiter weg"><Minus size={16} /></button>
            <button type="button" onClick={() => karte.current?.zentriere(stand.q, stand.r)} title="Zum Schiff" data-ti-zentrieren><LocateFixed size={16} /></button>
          </div>
        </div>

        <div className="ti-ecke ti-ecke-lu">
          {segelt ? (
            <div className="ti-tafel ti-notiz" data-ti-segelt>
              <h3>Unter Segeln …</h3>
              <div className="ti-reihe" style={{ marginTop: 6 }}><button type="button" className="ti-knopf ti-knopf-klein" onClick={halt}>Beidrehen</button><span className="ti-stumm">Ein Klick auf die Karte hält das Schiff an.</span></div>
            </div>
          ) : plan ? (
            <div className="ti-tafel ti-notiz" data-ti-plan>
              <h3>{plan.ortKey ? `Kurs auf ${(() => { const o = ortVon(plan.ortKey as string); return o ? (o.art === 'hafen' || o.art === 'dorf' ? ortName(o) : ART_NAME[o.art]) : 'das Ziel' })()}` : kennt(spiel.karte, plan.ziel.q, plan.ziel.r) ? 'Kurs abgesteckt' : 'Kurs ins Unbekannte'}</h3>
              <p>{plan.route.felder.length} Felder, etwa <b>{planTage}</b>{plan.route.unbekannt > 0 ? ` – davon ${plan.route.unbekannt} durch unbekannte Gewässer (geschätzt)` : ''}.</p>
              {!reicht && <p className="ti-fehler" data-ti-knapp>Der Proviant reicht nur für {routeGedeckt} Felder. Geht er aus, kehrt die Mannschaft um.</p>}
              <div className="ti-reihe" style={{ marginTop: 8 }}>
                <button type="button" className="ti-knopf ti-knopf-gold" onClick={() => segle(plan)} data-ti-segeln>Segel setzen</button>
                <button type="button" className="ti-knopf ti-knopf-leise ti-knopf-klein" onClick={() => setPlan(null)}>Verwerfen</button>
                <span className="ti-stumm">Eingabe · Esc</span>
              </div>
            </div>
          ) : !stand.gesehen.kurs ? (
            <div className="ti-tafel ti-notiz"><h3>Wohin, Kapitän?</h3><p>Klicke ein Feld auf der Karte an, um einen Kurs abzustecken. Ein zweiter Klick setzt die Segel. Die goldene Linie zeigt, bis wohin der Proviant für den Rückweg reicht.</p></div>
          ) : null}
        </div>

        <div className="ti-ecke ti-ecke-ru">
          {imHafen && !segelt && (
            <div className="ti-tafel ti-notiz" data-ti-im-hafen>
              <h3>{imHafen.art === 'hafen' ? 'Im Hafen von' : 'Vor'} {ortName(imHafen)}</h3>
              <div className="ti-reihe" style={{ marginTop: 6 }}><button type="button" className="ti-knopf ti-knopf-gold" onClick={() => setRaum('hafen')} data-ti-hafen-oeffnen>{imHafen.art === 'hafen' ? 'An Land gehen' : 'Ins Dorf'}</button>{ungemeldet > 0 && imHafen.art === 'hafen' && <span className="ti-marke ti-marke-gold">{ungemeldet} zu melden</span>}</div>
            </div>
          )}
          {!segelt && nahe.map(o => (
            <div className="ti-tafel ti-notiz" key={o.key} data-ti-nahe={o.art}>
              <h3>{o.art === 'hafen' || o.art === 'dorf' ? ortName(o) : ART_NAME[o.art]}</h3>
              <div className="ti-reihe" style={{ marginTop: 6 }}><button type="button" className="ti-knopf ti-knopf-klein ti-knopf-gold" onClick={() => oeffneOrt(o.key)} data-ti-ort-oeffnen>{TUN[o.art]}</button></div>
            </div>
          ))}
          {!segelt && schaetze.map(k => (
            <div className="ti-tafel ti-notiz" key={k.id}>
              <h3>Hier ist das Kreuz!</h3>
              <div className="ti-reihe" style={{ marginTop: 6 }}><button type="button" className="ti-knopf ti-knopf-klein ti-knopf-gold" onClick={() => { const erg = tue(sp => hebeSchatz(sp, k.id, umwelt())); if (erg.ok) { klang('fanfare'); setStapel(q => [...q, { art: 'land', key: `${k.q},${k.r}`, ergebnis: erg }]) } else if (erg.grund) toast(erg.grund) }} data-ti-schatz>Den Schatz heben</button></div>
            </div>
          ))}
          {!segelt && !stand.imHafen && verbunden && (
            <button type="button" className="ti-knopf ti-knopf-klein ti-knopf-leise ti-tafel" onClick={() => setStapel(q => [...q, { art: 'flascheSchreiben' }])} data-ti-flasche-schreiben>Flaschenpost aussetzen</button>
          )}
        </div>

        {raum === 'hafen' && stand.imHafen && <Hafen ortKey={stand.imHafen} onZu={() => setRaum(null)} onMelden={() => setStapel(q => [...q, { art: 'melden' }])} />}
        {raum === 'atlas' && <Atlas onZu={() => setRaum(null)} onZeige={(q, r) => { setRaum(null); karte.current?.zentriere(q, r) }} />}
        {raum === 'kapitaene' && <Kapitaene onZu={() => setRaum(null)} />}
        {raum === 'tagesfahrt' && <Tagesfahrt onZu={() => setRaum(null)} />}
        {raum === 'einstellungen' && <Einstellungen onZu={() => setRaum(null)} />}
        {raum === 'zeitung' && <Zeitung onZu={() => setRaum(null)} onTagesfahrt={() => setRaum('tagesfahrt')} />}
        {raum === 'gefechte' && <Gefechte onZu={() => setRaum(null)} onWiederholung={(akte, titel) => setWiederholung({ akte, titel })} onKurs={g => { setRaum(null); karte.current?.zentriere(g.q, g.r); aufFeld({ q: g.q, r: g.r }) }} />}
        {raum === 'festung' && <Festung onZu={() => setRaum(null)} onKurs={(q, r) => { setRaum(null); karte.current?.zentriere(q, r); aufFeld({ q, r }) }} onWiederholung={(akte, titel, meineId) => setWiederholung({ akte, titel, meineId })} />}

        {oben?.art === 'entdeckung' && <EntdeckungBlatt keys={oben.keys} onZu={zu} />}
        {oben?.art === 'ereignis' && <EreignisBlatt ereignis={oben.ereignis} onZu={um => { if (um) { setPlan(null); setStapel([{ art: 'umkehr', grund: 'proviant' }]) } else zu() }} />}
        {oben?.art === 'land' && <LandBlatt ergebnis={oben.ergebnis} ortKey={oben.key} onZu={um => { if (um) { setPlan(null); setStapel([{ art: 'umkehr', grund: 'rumpf' }]) } else zu() }} onRaetsel={art => setStapel(q => [{ art: 'raetsel', key: oben.key, raetsel: art }, ...q.slice(1)])} />}
        {oben?.art === 'umkehr' && <UmkehrBlatt grund={oben.grund} onZu={() => { zu(); karte.current?.zentriere(stand.q, stand.r); setRaum('hafen') }} />}
        {oben?.art === 'raetsel' && <RaetselBlatt ortKey={oben.key} art={oben.raetsel} onZu={erg => setStapel(q => (erg ? [{ art: 'land', key: oben.key, ergebnis: erg }, ...q.slice(1)] : q.slice(1)))} />}
        {oben?.art === 'flasche' && <FlascheGefunden flasche={oben.flasche} onZu={zu} />}
        {oben?.art === 'melden' && <MeldeBlatt onZu={zu} />}
        {oben?.art === 'flascheSchreiben' && <FlascheSchreiben onZu={zu} />}
        {oben?.art === 'stellung' && (() => {
          const st = oben.stellung, freiwillig = st.art === 'angriff' || st.art === 'nest' || st.art === 'gross'
          const gl = st.gegner.art === 'gross' ? grossLage() : null
          return (
            <StellungBlatt stellung={st} gross={gl ?? undefined} gesperrt={st.gegner.art === 'gross' ? grossGesperrt() : undefined}
              onKampf={() => starteGefecht(st, false)}
              onSofort={() => starteGefecht(st, true)}
              onZoll={freiwillig ? undefined : () => { const a = tue(sp => zahleZoll(sp, st, umwelt())); if (a.ok) { klang('muenze'); toast(a.text); zu() } else toast(a.grund) }}
              onFlucht={freiwillig ? undefined : () => { const ok = tue(sp => versucheFlucht(sp, st, umwelt())); if (ok) { toast('Mit vollen Segeln davon – sie bleiben zurück.'); zu() } else { toast('Die Flucht misslingt!'); starteGefecht(st, false, true) } }}
              onAbdrehen={freiwillig ? zu : undefined} />
          )
        })()}
        {oben?.art === 'kampfEnde' && <KampfEndeBlatt folge={oben.folge} gegner={oben.gegner} zustellung={oben.zustellung} onZu={() => { const umkehr = oben.folge.umkehr; zu(); if (umkehr) { karte.current?.zentriere(stand.q, stand.r); setRaum('hafen') } }} onWiederholung={() => setWiederholung({ akte: oben.akte, titel: oben.titel })} />}
        {oben?.art === 'belagerung' && <BelagerungBlatt owner={oben.owner} onZu={zu} onAngriff={(p, sofort) => starteBelagerung(p, sofort)} />}
        {gefecht && <KampfAnsicht kampf={gefecht.k} titel={gegnerTitel(gefecht.st.gegner)} fortsetzen={gefecht.fortsetzen} schnell={stand.einstellungen.schnell} onBefehl={k => tue(sp => merkeBefehle(sp, k))} onEnde={k => beendeGefecht(k, gefecht.st)} />}
        {wiederholung && <KampfWiederholung akte={wiederholung.akte} titel={wiederholung.titel} meineId={wiederholung.meineId} onZu={() => setWiederholung(null)} />}
        {duellId && !gefecht && <DuellAnsicht />}
        {duellAngebot && !duellId && !gefecht && <DuellAngebot />}
      </div>
    </>
  )
}
