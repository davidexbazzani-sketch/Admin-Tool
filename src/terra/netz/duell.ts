// Terra Incognita — Live-Duelle übers Netzlaufwerk (Stufe 3).
//
// Ablauf: A lädt ein (Datei z0, dazu eine Karte im Chat — Wunsch des Nutzers: wie bei 4 gewinnt und dem Brain-Duell),
// B nimmt an (z1), dann schreibt jeder seine Züge (z2 …), je Zug eine Datei. Jede Datei wird exklusiv angelegt: Was
// zuerst da war, entscheidet der Dateiserver — so sehen beide immer dieselbe Folge und rechnen denselben Kampf
// (kampf/duell.ts).
//
// Der Einsatz ist ein PFAND: Er geht beim Einladen bzw. Annehmen aus der Kasse — bevor die Datei geschrieben wird, und
// der Spielstand ist dann schon gesichert. Am Ende kommt er zurück: doppelt an den Sieger, gar nicht an den Verlierer,
// einfach bei Unentschieden, Abbruch, Ablehnung, Rückzug, Verfall oder wenn einer nie erschienen ist. So kann niemand
// mehr setzen, als er hat, und unterwegs nichts beiseiteschaffen. Was verbucht ist, steht im öffentlichen Buch (dz),
// offene Duelle ebenso (do) — ein zurückgespielter Stand bekommt nichts doppelt und bleibt nichts schuldig.
//
// Abgefragt wird nur, solange der Raum offen ist: das Duell auf dem Bildschirm alle 3 s (wartend; Fenster im
// Hintergrund 8 s) bzw. 10 s (selbst am Zug), eine offene eigene Einladung im Hintergrund alle 10–20 s, sonst im
// gewöhnlichen Abgleich (90 s). Alles durch die Schleuse — auch die Karte im Chat.
import { create } from 'zustand'
import { sende } from '../../services/chat'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { DUELL_VERFALL, duellFassung, duellLage, EINSAETZE, pruefeEinladung, zugInhalt, type DuellDatei, type DuellEinladung, type DuellLage, type DuellZug } from '../kampf/duell'
import { aktiv, befehl } from '../kampf/kampf'
import type { Aktion, Kampf, SchiffStart } from '../kampf/regeln'
import { eigeneSchiffe } from '../kern/gefecht'
import { werteVon } from '../kern/spiel'
import { kuerzeDuelle, type DuellEintrag, type TiStand } from '../kern/stand'
import { umwelt, useTerra } from '../speicher'
import { darfSchreiben, fremdesBuch, melde, sicher, veroeffentliche } from './gemeinsam'
import { oeffne, versiegle } from './huelle'
import { netz, netzLegeAn, netzListeGenau, netzLiesGenau, netzLoesche, netzLoescheOrdner, netzZustand } from './schleuse'

const DUELLE = 'terra/duelle'
const ordner = (id: string): string => `${DUELLE}/${id}`
const dateiPfad = (id: string, n: number): string => `${DUELLE}/${id}/z${n}.json`
/** so lange gilt eine Einladung */
export const EINLADUNG_MS = 10 * 60 * 1000
/** so lange darf ein Zug dauern, dann darf der andere ihn der Mannschaft überlassen */
export const ZUG_FRIST_MS = 90 * 1000
/** so lange hat jeder Zeit für seinen ersten eigenen Zug — wer bis dahin nicht erscheint, mit dem gibt es kein Gefecht
 *  (und keinen Einsatz): Die Mannschaft kämpft nie für einen, der das Duell gar nicht gesehen hat */
export const ANTRITT_MS = 3 * 60 * 1000

const ich = (): string => useTerra.getState().benutzer
const spiel = () => (useTerra.getState().zustand === 'bereit' ? useTerra.getState().spiel : null)
/** Ist der Raum offen? (Sonst läuft nichts: kein Zeitgeber, kein Zugriff.) */
const raumOffen = (): boolean => netzZustand() !== 'zu'

export interface DuellAnsichtStand {
  /** das Duell auf dem Bildschirm */
  id: string | null
  lage: DuellLage | null
  /** echte Zeit, seit der dieser Stand gilt (daran misst sich die Frist des Kapitäns am Zug) */
  seit: number
  /** zählt, wenn eigene, noch nicht geschriebene Befehle verworfen wurden (die Ansicht beginnt dann neu) */
  fassung: number
  hinweis: string | null
  /** ein eigener Zug wird gerade geschrieben (bis er auf dem Laufwerk liegt, gibt es keine weiteren Befehle) */
  sendet: boolean
  /** über die Chat-Karte angenommen: Einladung und bis wann sie gilt (echte Zeit) */
  angebot: { id: string; bis: number } | null
}
export const useDuell = create<DuellAnsichtStand>(() => ({ id: null, lage: null, seit: 0, fassung: 0, hinweis: null, sendet: false, angebot: null }))

// ── Dateien: je Duell streng nacheinander (Lesen und Anlegen kommen sich so nie in die Quere) ──
const cache = new Map<string, { dateien: DuellDatei[]; fehl: number }>()
const reihen = new Map<string, Promise<unknown>>()
function nacheinander<T>(id: string, f: () => Promise<T>): Promise<T> {
  const lauf = (reihen.get(id) ?? Promise.resolve()).then(f, f)
  const rest = lauf.then(() => undefined, () => undefined)
  reihen.set(id, rest)
  void rest.then(() => { if (reihen.get(id) === rest) reihen.delete(id) })
  return lauf
}

/** alles vergessen (Raum zu, anderer Spielstand) */
export function vergissDuelle(): void {
  cache.clear(); reihen.clear(); stoppeTakt()
  offenerZug = null; eigeneOffen = 0; hintergrund = null; angekuendigt.clear()
  useDuell.setState({ id: null, lage: null, seit: 0, hinweis: null, sendet: false, angebot: null })
}

/** neue Dateien eines Duells lesen (der Reihe nach ab der ersten unbekannten). null = Laufwerk antwortet nicht */
function ladeDateien(id: string): Promise<DuellDatei[] | null> {
  return nacheinander(id, async () => {
    let c = cache.get(id)
    if (!c) { c = { dateien: [], fehl: 0 }; cache.set(id, c) }
    const l = await netzListeGenau(ordner(id))
    if (!l.ok) return null
    const da = new Set(l.wert.map(x => /^z(\d{1,4})\.json$/.exec(x)).filter((m): m is RegExpExecArray => !!m).map(m => Number(m[1])))
    while (da.has(c.dateien.length)) {
      const n = c.dateien.length
      const r = await netzLiesGenau(dateiPfad(id, n))
      if (!r.ok || r.wert.status === 'fehler') return null
      if (r.wert.status !== 'ok') {
        // gerade im Entstehen? Ein paar Mal warten; bleibt sie unlesbar, zählt sie als Datei von niemandem (= Abbruch)
        if (++c.fehl < 5) break
        c.dateien.push({ n, u: '', inhalt: null }); c.fehl = 0; continue
      }
      const o = await oeffne<unknown>(r.wert.daten, { art: 'duell', rev: n })
      if (!o.ok && o.grund === 'neuer') break
      c.fehl = 0
      if (c.dateien.length !== n) break
      c.dateien.push(o.ok ? { n, u: sicher(o.u), inhalt: o.inhalt } : { n, u: '', inhalt: null })
    }
    return c.dateien.slice()
  })
}
/** eine Datei exklusiv anlegen und gleich in den Zwischenspeicher nehmen */
async function legeAn(id: string, n: number, inhalt: unknown): Promise<'ok' | 'vorhanden' | 'fehler'> {
  const u = ich()
  if (!u || !raumOffen()) return 'fehler'
  const huelle = await versiegle('duell', u, n, inhalt)
  return nacheinander(id, async () => {
    const r = await netzLegeAn(dateiPfad(id, n), huelle)
    if (!r.ok || r.wert === 'fehler') return 'fehler'
    if (r.wert === 'ok') { const c = cache.get(id); if (c && c.dateien.length === n) c.dateien.push({ n, u: sicher(u), inhalt: JSON.parse(JSON.stringify(inhalt)) }) }
    return r.wert
  })
}

// ── eigene Duelle im Spielstand ──
const eintrag = (s: TiStand, id: string): DuellEintrag | undefined => s.duelle.find(d => d.id === id)
/** offenes Duell (höchstens eines zugleich) */
export const offenesDuell = (s: TiStand): DuellEintrag | undefined => s.duelle.find(d => !d.fertig)

/** Das Pfand nehmen: Eintrag anlegen, Einsatz aus der Kasse — und den Stand sichern, BEVOR irgendetwas aufs Laufwerk
 *  geht (stürzt das Tool danach ab, ist das Duell im Stand und wird verbucht). false = geht gerade nicht. */
async function nimmPfand(d: DuellEintrag): Promise<boolean> {
  const sp = spiel()
  if (!sp) return false
  const ok = useTerra.getState().tue(s => {
    if (eintrag(s.stand, d.id) || offenesDuell(s.stand) || d.ein > s.stand.gold) return false
    s.stand.gold -= d.ein
    s.stand.duelle.push({ ...d, es: true })
    kuerzeDuelle(s.stand)
    s.stand.zug++
    return true
  })
  if (ok) await useTerra.getState().sichere()
  return ok && spiel() === sp
}

/** das eigene Flaggschiff fürs Duell: alle Werte wie im Gefecht, voller Rumpf (ein Duell beschädigt kein Schiff) */
export function duellSchiff(s: TiStand): SchiffStart {
  const w = werteVon(s), f = eigeneSchiffe(s, w)[0]
  return { ...f, rumpf: w.rumpfMax, rumpfMax: w.rumpfMax, standhaft: true }
}

const ENDE: readonly DuellLage['phase'][] = ['ende', 'abgelehnt', 'zurueck']
/** Einsatz verbuchen, sobald das Duell entschieden ist (oder nie zustande kam) — genau einmal. Erst wird der Stand
 *  lokal gesichert, dann das Buch veröffentlicht (ein Absturz dazwischen kostet nichts). */
async function verbuche(id: string, lage: DuellLage): Promise<void> {
  if (!ENDE.includes(lage.phase) && lage.phase !== 'leer' && lage.phase !== 'fassung') return
  const sp = spiel(), d = sp ? eintrag(sp.stand, id) : undefined
  if (!sp || !d || d.fertig || !darfSchreiben()) return
  let text = ''
  useTerra.getState().tue(s => {
    const e = eintrag(s.stand, id)
    if (!e || e.fertig) return
    const pfand = e.es ? e.ein : 0, wer = e.gn ? `Kpt. ${e.gn}` : 'Der Kollege'
    if (lage.phase !== 'ende') {
      e.erg = 'remis'; e.fertig = true; delete e.ang; s.stand.gold += pfand; s.stand.zug++
      text = lage.phase === 'abgelehnt' ? (lage.fassung ? `${wer} hat eine andere Fassung des Tools – ein Duell geht erst, wenn beide dieselbe haben.` : `${wer} hat das Duell abgelehnt.`)
        : lage.phase === 'fassung' ? 'Das Duell lief mit einer anderen Fassung des Tools und ist abgebrochen.'
          : lage.phase === 'zurueck' && e.rolle === 'b' ? `${wer} hat die Einladung zurückgezogen.` : ''
      if (text && pfand) text += ` Dein Einsatz (${pfand} Gold) ist zurück in der Kasse.`
      return
    }
    e.erg = lage.sieger === null ? 'remis' : lage.sieger === e.rolle ? 'sieg' : 'niederlage'
    delete e.ang
    if (e.erg === 'sieg') { s.stand.gold += pfand + e.ein; s.stand.ruhm += 25 }
    else if (e.erg === 'niederlage') { if (!e.es) s.stand.gold -= Math.min(e.ein, s.stand.gold) }
    else s.stand.gold += pfand
    e.fertig = true
    s.stand.zug++
    if (lage.grund === 'fern') {
      const ichFern = !!lage.k && aktiv(lage.k)?.id === (e.rolle === 'a' ? 0 : 10)
      text = ichFern ? `Duell gegen ${e.gn}: Du bist nicht angetreten – kein Gefecht${e.ein ? ', dein Einsatz ist zurück' : ''}.` : `Duell gegen ${e.gn}: Kpt. ${e.gn} ist nicht angetreten – kein Gefecht${e.ein ? ', dein Einsatz ist zurück' : ''}.`
      return
    }
    const wie = lage.grund === 'aufgabe' ? ' (Aufgabe)' : lage.grund === 'verfallen' ? ' – verfallen' : lage.grund === 'abbruch' ? ' – abgebrochen' : ''
    text = e.erg === 'sieg' ? `Duell gegen ${e.gn} gewonnen${wie}!${e.ein ? ` +${e.ein} Gold` : ''} (+25 Ruhm)` : e.erg === 'niederlage' ? `Duell gegen ${e.gn} verloren${wie}.${e.ein ? ` −${e.ein} Gold` : ''}` : `Duell gegen ${e.gn}: unentschieden${wie}.${e.ein ? ' Der Einsatz ist zurück.' : ''}`
  })
  await useTerra.getState().sichere()
  if (text) melde(text)
  void veroeffentliche(true)
}

// ── Einladen, Annehmen, Ablehnen, Zurückziehen ──
const neueId = (u: string, tag: number): string => `${tag}-${sicher(u).slice(0, 40)}-${Math.random().toString(36).slice(2, 8)}`
const KLASSE_NAME = (k: number): string => ['Jolle', 'Kutter', 'Schoner', 'Brigg', 'Fregatte', 'Ostindienfahrer', 'Entdeckerschiff'][Math.max(0, Math.min(6, k))]

/** Einen Kollegen herausfordern: Pfand nehmen, Einladung anlegen, Karte im Chat schicken. Gibt einen Fehlertext zurück oder null. */
export async function fordereHeraus(gegner: { u: string; n: string }, ein: number): Promise<string | null> {
  const sp = spiel(), u = ich(), user = useAuthStore.getState().session?.user
  if (!sp || !u || !user) return 'Kein Spiel geladen.'
  if (!darfSchreiben()) return 'Dafür braucht es die Verbindung zum Netzlaufwerk.'
  if (offenesDuell(sp.stand)) return 'Ein Duell läuft schon.'
  if (!Number.isSafeInteger(ein) || !EINSAETZE.includes(ein) || ein > sp.stand.gold) return 'So viel Gold ist nicht in der Kasse.'
  const ziel = useChatStore.getState().nutzer.find(n => sicher(n.username) === gegner.u)
  if (!ziel || !ziel.online) return `${gegner.n || gegner.u} ist gerade nicht im Tool – ein Duell geht nur, wenn beide da sind.`
  const tag = umwelt().tag, id = neueId(u, tag)
  const e: DuellEinladung & { d: string } = { d: id, a: sicher(u), an: sp.stand.kapitaen, b: gegner.u, bn: gegner.n, ein, regel: duellFassung(), tag, schiff: { ...duellSchiff(sp.stand), id: 0, seite: 0 } }
  if (!(await nimmPfand({ id, gegner: gegner.u, gn: gegner.n, rolle: 'a', ein, tag, bis: Date.now() + EINLADUNG_MS }))) return 'Das ging gerade nicht.'
  cache.set(id, { dateien: [], fehl: 0 })
  const r = await legeAn(id, 0, e)
  if (r !== 'ok') {
    // nicht angelegt (oder unklar): Ohne Karte im Chat kennt niemand die Einladung — das Pfand kommt gleich zurück
    await verbucheLeer(id)
    return 'Das Netzlaufwerk antwortet gerade nicht.'
  }
  const bis = Date.now() + EINLADUNG_MS
  const karte = await netz(() => sende({ username: user.username, displayName: user.displayName || user.username }, { username: ziel.username, displayName: ziel.displayName },
    `⚓ Kpt. ${sp.stand.kapitaen} fordert dich zu einem Seegefecht in Terra Incognita heraus${ein ? ` – Einsatz ${ein} Gold` : ''}. Annehmen geht zehn Minuten lang.`,
    undefined, undefined, { id, titel: `${KLASSE_NAME(e.schiff.klasse)} „${e.schiff.name}“${ein ? ` · Einsatz ${ein} Gold` : ''}`, gueltigBis: new Date(bis).toISOString() }))
  if (!karte.ok || !karte.wert) {
    // ohne Karte kann niemand annehmen: zurückziehen (geht das gerade nicht, holt es der nächste Blick nach)
    useTerra.getState().tue(s => { const x = eintrag(s.stand, id); if (x) x.bis = 0 })
    void ziehZurueck(id)
    return 'Die Karte im Chat ließ sich nicht schicken – die Einladung wird zurückgezogen.'
  }
  zeige(id)
  return null
}
/** Ein eigenes Duell, das es auf dem Laufwerk nicht gibt (Einladung ließ sich nicht anlegen): ohne Folgen abhaken */
async function verbucheLeer(id: string): Promise<void> {
  useTerra.getState().tue(s => { const e = eintrag(s.stand, id); if (e && !e.fertig) { s.stand.gold += e.es ? e.ein : 0; e.erg = 'remis'; e.fertig = true; delete e.ang; s.stand.zug++ } })
  await useTerra.getState().sichere()
}

/** Die Einladung lesen (für das Blatt „Herausforderung“). null = Laufwerk antwortet nicht oder es gibt sie nicht */
export async function liesEinladung(id: string): Promise<{ e: DuellEinladung; lage: DuellLage } | null> {
  const d = await ladeDateien(id)
  if (!d || !d.length) return null
  const lage = duellLage(id, d)
  if (lage.phase === 'leer') return null
  return { e: lage.e, lage }
}

const annahme = (id: string, s: TiStand): unknown => ({ d: id, ja: true, schiff: { ...duellSchiff(s), id: 10, seite: 1 } })

/** annehmen (B): Pfand nehmen, dann die Antwort anlegen. Gibt einen Fehlertext zurück oder null. */
export async function nimmAn(id: string, bis: number): Promise<string | null> {
  const sp = spiel(), u = ich()
  if (!sp || !u) return 'Kein Spiel geladen.'
  if (!darfSchreiben()) return 'Dafür braucht es die Verbindung zum Netzlaufwerk.'
  if (Date.now() > bis) return 'Die Einladung ist abgelaufen.'
  if (offenesDuell(sp.stand)) return 'Ein anderes Duell läuft noch.'
  const x = await liesEinladung(id)
  if (spiel() !== sp || !raumOffen()) return 'Das ging gerade nicht.'
  if (!x) return 'Die Einladung ließ sich nicht lesen – vielleicht antwortet das Netzlaufwerk gerade nicht.'
  if (x.lage.phase === 'fassung') { void lehneAb(id, 'fassung'); return 'Dein Kollege hat eine andere Fassung des Tools – ein Duell geht erst, wenn beide dieselbe haben.' }
  if (x.e.b !== sicher(u)) return 'Diese Einladung gilt jemand anderem.'
  if (x.lage.phase !== 'einladung') return x.lage.phase === 'zurueck' ? 'Die Einladung wurde zurückgezogen.' : 'Das Duell hat schon begonnen oder ist vorbei.'
  if (x.e.tag !== umwelt().tag) return 'Die Einladung ist abgelaufen.'
  if (x.e.ein > sp.stand.gold) return `Der Einsatz ist ${x.e.ein} Gold – so viel ist nicht in der Kasse.`
  if (!(await nimmPfand({ id, gegner: x.e.a, gn: x.e.an, rolle: 'b', ein: x.e.ein, tag: x.e.tag, bis, ang: true }))) return 'Das ging gerade nicht.'
  useDuell.setState({ angebot: null })
  const r = await legeAn(id, 1, annahme(id, sp.stand))
  const f = await klaereAnnahme(id, r)
  if (f === null) zeige(id)
  else if (r === 'fehler') { hintergrund = id; planeHintergrund() }
  return f
}
const annahmeBestaetigt = (id: string): void => { useTerra.getState().tue(s => { const e = eintrag(s.stand, id); if (e) delete e.ang }) }
/** Wie ging die eigene Annahme aus? ok: angenommen. vorhanden: An z1 steht schon etwas — von wem? (Eine frühere,
 *  scheinbar gescheiterte Annahme kann doch angekommen sein.) fehler: unklar — bleibt offen, der nächste Blick
 *  versucht es noch einmal (und schreibt nach Ablauf der Einladung eine Absage, damit es entschieden ist). */
async function klaereAnnahme(id: string, r: 'ok' | 'vorhanden' | 'fehler'): Promise<string | null> {
  if (r === 'fehler') return 'Das Netzlaufwerk antwortet gerade nicht – die Annahme wird gleich noch einmal versucht.'
  if (r === 'ok') { annahmeBestaetigt(id); return null }
  const d = await ladeDateien(id)
  if (!d) return 'Das Netzlaufwerk antwortet gerade nicht – die Annahme wird gleich noch einmal geprüft.'
  const meine = !!d[1] && d[1].u === sicher(ich()) && (d[1].inhalt as { ja?: unknown } | null)?.ja === true
  if (meine) { annahmeBestaetigt(id); return null }
  await verbuche(id, duellLage(id, d))
  return 'Zu spät – die Einladung ist nicht mehr offen.'
}
export async function lehneAb(id: string, grund?: 'fassung'): Promise<void> {
  if (useDuell.getState().angebot?.id === id) useDuell.setState({ angebot: null })
  await legeAn(id, 1, { d: id, ja: false, ...(grund ? { grund } : {}) })
}
/** A zieht die Einladung zurück (oder sie ist abgelaufen) */
export async function ziehZurueck(id: string): Promise<void> {
  if (!darfSchreiben()) return
  const r = await legeAn(id, 1, { d: id, zurueck: true })
  if (r === 'fehler') return
  if (useDuell.getState().id === id) await lade(id)
  else { const d = await ladeDateien(id); if (d) await verbuche(id, duellLage(id, d)) }
}

// ── auf dem Bildschirm ──
let takt: ReturnType<typeof setTimeout> | null = null
function stoppeTakt(): void { if (takt) { clearTimeout(takt); takt = null } }
/** ein eigenes Duell, das gerade nicht auf dem Bildschirm ist, aber im Blick bleibt (offene Einladung) */
let hintergrund: string | null = null
/** Duelle, deren Beginn schon gemeldet wurde */
const angekuendigt = new Set<string>()

/** ein eigenes Duell auf den Bildschirm holen (und abfragen, solange es offen ist) */
export function zeige(id: string): void {
  const sp = spiel()
  if (!raumOffen() || !sp || !eintrag(sp.stand, id)) return
  if (useDuell.getState().id !== id) useDuell.setState({ id, lage: null, seit: Date.now(), hinweis: null, sendet: offenerZug?.id === id })
  if (hintergrund === id) hintergrund = null
  void lade(id)
}
/** Die Ansicht schließen. Eine offene Einladung (oder ein Duell, das noch nicht entschieden ist) bleibt im Blick:
 *  Sobald sich etwas tut, kommt es wieder auf den Bildschirm. */
export function schliesse(): void {
  const st = useDuell.getState()
  stoppeTakt()
  if (st.id && st.lage && (st.lage.phase === 'einladung' || st.lage.phase === 'kampf' || st.lage.phase === 'gestoert')) hintergrund = st.id
  useDuell.setState({ id: null, lage: null, hinweis: null, sendet: false })
  planeHintergrund()
}

let ladeLauf: { id: string; p: Promise<void> } | null = null
let ladeNochmal = false
/** Dateien nachladen und den Stand neu rechnen; danach den nächsten Blick planen. Läuft für dieses Duell schon ein
 *  Nachladen, folgt danach genau noch eines — wer wartet, bekommt so immer einen Stand, der nach seinem Aufruf gelesen
 *  wurde. Lädt gerade ein ANDERES Duell (eben gewechselt), kommt dieses danach an die Reihe. */
export function lade(id: string): Promise<void> {
  if (ladeLauf) {
    if (ladeLauf.id === id) { ladeNochmal = true; return ladeLauf.p }
    return ladeLauf.p.then(() => lade(id))
  }
  const p = (async () => {
    try { do { ladeNochmal = false; await ladeEinmal(id) } while (ladeNochmal && useDuell.getState().id === id) } catch { /* nie nach außen */ } finally { ladeLauf = null; ladeNochmal = false }
    plane(id)
  })()
  ladeLauf = { id, p }
  return p
}
/** woran sich erkennen lässt, ob ein Stand neu ist (die Einladung bleibt dieselbe, bis jemand antwortet) */
const schluessel = (l: DuellLage | null): string => (l ? `${l.phase}:${'naechste' in l ? l.naechste : ''}` : '')

async function ladeEinmal(id: string): Promise<void> {
  const d = await ladeDateien(id)
  if (useDuell.getState().id !== id || !d) return
  const alt = useDuell.getState().lage
  const lage = duellLage(id, d)
  if (offenerZug && offenerZug.id === id && (lage.phase !== 'kampf' || lage.naechste > offenerZug.n)) offenerZug = null
  if (schluessel(alt) !== schluessel(lage)) {
    const verworfen = eigeneOffen > 0
    eigeneOffen = 0
    useDuell.setState(s => ({ lage, seit: Date.now(), fassung: verworfen ? s.fassung + 1 : s.fassung, sendet: !!offenerZug, hinweis: verworfen ? 'Dein Zug kam zu spät – die Mannschaft hat ihn übernommen.' : null }))
  }
  await handle(id, lage)
}
/** was ein Stand verlangt: verbuchen, den Abbruch schreiben, ein Duell anderer Fassung beenden */
async function handle(id: string, lage: DuellLage): Promise<void> {
  const sp = spiel(), e = sp ? eintrag(sp.stand, id) : undefined
  if (!e || e.fertig) return
  if (ENDE.includes(lage.phase)) { await verbuche(id, lage); return }
  if (lage.phase === 'leer') { if (umwelt().tag > e.tag + DUELL_VERFALL) await verbuche(id, lage); return }
  if (!darfSchreiben()) return
  if (lage.phase === 'gestoert') { await legeAn(id, lage.naechste, { d: id, t: 'abbruch' }); return }
  if (lage.phase === 'fassung') {
    // ein eigenes Duell, das mit einer anderen Fassung des Tools lief (nach einem Update): für beide beenden
    const inhalt = lage.naechste <= 1 ? (e.rolle === 'a' ? { d: id, zurueck: true } : { d: id, ja: false, grund: 'fassung' }) : { d: id, t: 'abbruch' }
    if ((await legeAn(id, Math.max(1, lage.naechste), inhalt)) !== 'fehler') await verbuche(id, lage)
  }
}

/** Wie oft nachsehen? Wartend auf den anderen: alle 3 s (Fenster nicht im Vordergrund: 8 s); selbst am Zug: alle 10 s
 *  (nur um eine Übernahme oder Aufgabe zu bemerken); ein Zug wartet aufs Schreiben: alle 4 s; entschieden: gar nicht mehr. */
function plane(id: string): void {
  stoppeTakt()
  const st = useDuell.getState(), lage = st.lage
  if (st.id !== id || !raumOffen()) return
  // noch nichts gelesen (Laufwerk gerade weg): in fünf Sekunden noch einmal
  if (!lage) { takt = setTimeout(() => { takt = null; void lade(id) }, 5000); return }
  if (lage.phase === 'ende' || lage.phase === 'abgelehnt' || lage.phase === 'zurueck' || lage.phase === 'leer' || lage.phase === 'fassung') return
  const warte = offenerZug ? 4000 : lage.phase === 'kampf' && lage.amZug === meineId(lage) ? 10000 : document.hasFocus() ? 3000 : 8000
  takt = setTimeout(() => { takt = null; void nachsehen(id) }, warte)
}
/** einmal nachsehen: eigener Zug noch nicht geschrieben? Einladung abgelaufen? Duell verfallen? Frist des anderen
 *  verstrichen? Neue Dateien? (sonst vom Takt aufgerufen) */
export async function nachsehen(id: string): Promise<void> {
  const st = useDuell.getState(), lage = st.lage
  if (st.id !== id || !lage || !raumOffen()) return
  if (offenerZug && offenerZug.id === id) { await schreibeOffenenZug(); return }
  const sp = spiel(), e = sp ? eintrag(sp.stand, id) : undefined
  if (e && !e.fertig && darfSchreiben()) {
    // A: Einladung abgelaufen (gemessen an der echten Zeit der Einladung, nicht am Öffnen der Ansicht) → zurückziehen
    if (lage.phase === 'einladung' && e.rolle === 'a' && (Date.now() > (e.bis ?? 0) || umwelt().tag > e.tag)) { await ziehZurueck(id); return }
    // zwei Tage nicht entschieden: verfallen (unentschieden, kein Einsatz)
    if ((lage.phase === 'kampf' || lage.phase === 'gestoert') && umwelt().tag > e.tag + DUELL_VERFALL) { await legeAn(id, lage.naechste, { d: id, t: 'verfallen' }); await lade(id); return }
    // der andere zögert zu lange: Hat er schon einmal gezogen, übernimmt die Mannschaft seinen Zug (beim zweiten Mal in
    // Folge für den Rest); ist er nie erschienen, gibt es kein Gefecht. Gerechnet wird an einer frischen Nachrechnung —
    // der Kampf auf dem Bildschirm bleibt, bis die Datei wirklich da ist.
    if (lage.phase === 'kampf' && lage.amZug !== meineId(lage) && Date.now() - st.seit > (lage.erschienen ? ZUG_FRIST_MS : ANTRITT_MS)) {
      const dd = cache.get(id)?.dateien, frisch = dd ? duellLage(id, dd.slice()) : null
      if (frisch && frisch.phase === 'kampf' && frisch.naechste === lage.naechste) {
        if (!frisch.erschienen) await legeAn(id, frisch.naechste, { d: id, t: 'fern', id: frisch.amZug })
        else { const a: Aktion = { a: frisch.fristen >= 1 ? 'auto' : 'ki' }; if (befehl(frisch.k, a)) await legeAn(id, frisch.naechste, zugInhalt(id, frisch.amZug, [a], frisch.k, true)) }
      }
    }
  }
  await lade(id)
}

/** meine Seite im Duell: A steuert die 0, B die 10 */
export const meineId = (lage: DuellLage): 0 | 10 => ('e' in lage && lage.e.b === sicher(ich()) ? 10 : 0)

/** eigene Befehle des laufenden Zugs, die noch nicht geschrieben sind */
let eigeneOffen = 0
export function befehlGegeben(): void { eigeneOffen++ }
/** der eigene Zug, der aufs Laufwerk muss (bis er dort liegt, wird es weiter versucht — mit genau demselben Inhalt) */
let offenerZug: { id: string; n: number; inhalt: DuellZug } | null = null
/** Der eigene Zug ist zu Ende: die Befehle (alles seit Zugbeginn) als nächste Datei schreiben */
export async function sendeZug(k: Kampf, akt: readonly Aktion[]): Promise<boolean> {
  const st = useDuell.getState(), lage = st.lage, id = st.id, sp = spiel()
  if (!id || !lage || lage.phase !== 'kampf' || !sp || !eintrag(sp.stand, id)) return false
  offenerZug = { id, n: lage.naechste, inhalt: zugInhalt(id, meineId(lage), akt, k) }
  useDuell.setState({ sendet: true })
  return schreibeOffenenZug()
}
async function schreibeOffenenZug(): Promise<boolean> {
  const o = offenerZug
  if (!o) return true
  const r = darfSchreiben() ? await legeAn(o.id, o.n, o.inhalt) : 'fehler'
  if (offenerZug !== o) return false
  if (r === 'fehler') {
    if (useDuell.getState().id === o.id) useDuell.setState({ hinweis: 'Dein Zug ist noch nicht beim Gegner – das Netzlaufwerk antwortet gerade nicht. Er wird gleich noch einmal geschickt.' })
    plane(o.id)
    return false
  }
  if (r === 'ok') eigeneOffen = 0
  else {
    // schon vorhanden: Ist es mein Zug (ein früherer Versuch kam doch an) oder hat der andere übernommen?
    const d = await ladeDateien(o.id), f = d?.[o.n]
    if (f && f.u === sicher(ich()) && JSON.stringify(f.inhalt) === JSON.stringify(o.inhalt)) eigeneOffen = 0
  }
  if (offenerZug === o) offenerZug = null
  if (useDuell.getState().id === o.id) useDuell.setState({ sendet: false })
  await lade(o.id)
  return r === 'ok'
}
/** Aufgeben geht jederzeit: Ist die Nummer schon vergeben (der andere war gerade dran), mit der nächsten noch einmal.
 *  Gibt einen Fehlertext zurück oder null. */
export async function gibAuf(): Promise<string | null> {
  if (!darfSchreiben()) return 'Gerade keine Verbindung zum Netzlaufwerk – Aufgeben geht, sobald sie wieder da ist.'
  offenerZug = null
  for (let versuch = 0; versuch < 4; versuch++) {
    const st = useDuell.getState(), lage = st.lage, id = st.id
    if (!id || !lage || lage.phase !== 'kampf') return null
    const r = await legeAn(id, lage.naechste, { d: id, t: 'aufgabe', id: meineId(lage) })
    await lade(id)
    if (r === 'ok') return null
    if (r === 'fehler') return 'Das Netzlaufwerk antwortet gerade nicht – bitte gleich noch einmal.'
  }
  return null
}

// ── im Hintergrund: die eigene offene Einladung (nach „Im Hintergrund warten“) ──
function planeHintergrund(): void {
  if (takt || useDuell.getState().id || !hintergrund || !raumOffen()) return
  takt = setTimeout(() => { takt = null; void blickHintergrund() }, document.hasFocus() ? 10000 : 20000)
}
async function blickHintergrund(): Promise<void> {
  const id = hintergrund, sp = spiel()
  if (!id || useDuell.getState().id || !sp) return
  const d = eintrag(sp.stand, id)
  if (!d || d.fertig) { hintergrund = null; return }
  await pruefeDuell(d)
  if (hintergrund === id && !useDuell.getState().id) planeHintergrund()
}

/** Ein eigenes offenes Duell, das nicht auf dem Bildschirm ist: nachsehen, was zu tun ist — zurückziehen, absagen,
 *  abbrechen, verfallen lassen, verbuchen. Beginnt das Gefecht, kommt es auf den Bildschirm. false = Laufwerk weg. */
async function pruefeDuell(d: DuellEintrag): Promise<boolean> {
  let dateien = await ladeDateien(d.id)
  if (!dateien || !raumOffen()) return false
  let lage = duellLage(d.id, dateien)
  const heute = umwelt().tag
  let schreib: { n: number; inhalt: unknown } | null = null
  if (darfSchreiben()) {
    if (lage.phase === 'einladung') {
      const abgelaufen = Date.now() > (d.bis ?? 0) || heute > d.tag
      if (d.rolle === 'a' && abgelaufen) schreib = { n: 1, inhalt: { d: d.id, zurueck: true } }
      // B: die eigene Annahme kam (noch) nicht an — solange die Einladung gilt, noch einmal; danach absagen
      else if (d.rolle === 'b' && d.ang) { const sp = spiel(); schreib = { n: 1, inhalt: !abgelaufen && sp ? annahme(d.id, sp.stand) : { d: d.id, ja: false } } }
    } else if ((lage.phase === 'kampf' || lage.phase === 'gestoert') && heute > d.tag + DUELL_VERFALL) schreib = { n: lage.naechste, inhalt: { d: d.id, t: 'verfallen' } }
  }
  if (schreib) {
    if ((await legeAn(d.id, schreib.n, schreib.inhalt)) === 'fehler') return false
    dateien = await ladeDateien(d.id)
    if (!dateien) return false
    lage = duellLage(d.id, dateien)
  }
  if (d.ang && lage.phase !== 'einladung' && lage.phase !== 'leer') {
    const meine = !!dateien[1] && dateien[1].u === sicher(ich()) && (dateien[1].inhalt as { ja?: unknown } | null)?.ja === true
    if (meine) annahmeBestaetigt(d.id)
  }
  // das Gefecht hat begonnen (angenommen, während die Ansicht zu war): auf den Bildschirm damit
  if (lage.phase === 'kampf' && !useDuell.getState().id && raumOffen()) {
    if (lage.phase === 'kampf' && d.rolle === 'a' && !angekuendigt.has(d.id)) { angekuendigt.add(d.id); melde(`Kpt. ${lage.e.bn} hat angenommen – das Seegefecht beginnt!`) }
    zeige(d.id)
    return true
  }
  await handle(d.id, lage)
  return true
}

// ── im Abgleich (alle 90 s): offene Duelle, die nicht auf dem Bildschirm sind; alte Duelle aufräumen ──
export async function duelleAbgleich(): Promise<void> {
  const sp = spiel()
  if (!sp) return
  for (const d of sp.stand.duelle.filter(x => !x.fertig).slice(0, 3)) {
    if (useDuell.getState().id === d.id) continue
    if (!(await pruefeDuell(d)) || !raumOffen()) return
  }
  await raeumeAuf()
}
/** Die Dateien alter Duelle wegräumen (das tut der Einladende): wenn das Duell entschieden ist, die Verfallsfrist
 *  vorbei ist und der Gegner es auch verbucht hat (steht in seinem Buch — oder es ging um nichts, oder es ist ein
 *  Monat her). Höchstens sechs Dateien je Abgleich. */
async function raeumeAuf(): Promise<void> {
  const sp = spiel(), heute = umwelt().tag
  if (!sp || !darfSchreiben()) return
  const d = sp.stand.duelle.find(x => x.fertig && !x.weg && x.rolle === 'a' && heute > x.tag + DUELL_VERFALL + 1
    && (x.erg === 'remis' || !x.ein || heute > x.tag + 30 || (fremdesBuch(x.gegner)?.dz ?? []).some(z => Array.isArray(z) && z[0] === x.id)))
  if (!d) return
  const l = await netzListeGenau(ordner(d.id))
  if (!l.ok) return
  const namen = l.wert.filter(n => /^z\d{1,4}\.json$/.test(n))
  for (const n of namen.slice(0, 6)) { const r = await netzLoesche(`${ordner(d.id)}/${n}`); if (!r.ok) return }
  if (namen.length > 6) return
  if (l.wert.length > namen.length) return                 // (etwas Fremdes liegt darin: der Ordner bleibt)
  await netzLoescheOrdner(ordner(d.id))
  useTerra.getState().tue(s => { const e = eintrag(s.stand, d.id); if (e) e.weg = true })
  cache.delete(d.id)
}

/** Duell-Einladung aus dem Chat (die Karte ruft das über den kleinen Duell-Speicher auf): merken, die Ansicht fragt */
export function angebotAusChat(id: string, bis: number): void { useDuell.setState({ angebot: { id, bis } }) }
/** Wer ist gerade im Tool? (aus dem Chat — kein eigener Blick aufs Netzlaufwerk) */
export function istOnline(u: string): boolean { return useChatStore.getState().nutzer.some(n => sicher(n.username) === u && n.online) }
export const chatBereit = (): boolean => useChatStore.getState().bereit
