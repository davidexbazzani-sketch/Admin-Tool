// ── „Was hat sich an diesem PC geändert?“ — Anzeige ──────────────────────────
// Zeigt die Änderungen der letzten Tage (Standard 14) und — wenn ein Problem bekannt ist —
// zuerst die, die fachlich dazu passen, jeweils mit Begründung. Nur Anzeige und Lesen:
// am PC wird nichts verändert.
//
// Überall einsetzbar: <PcAenderungen host="PC123" />. Mit `live` wird der PC sofort gelesen
// (setzt voraus, dass er schon über WinRM erreichbar ist), sonst nur der gespeicherte Stand
// gezeigt; „jetzt lesen“ geht immer.

import { useEffect, useMemo, useRef, useState } from 'react'
import { History, Loader2, RefreshCw, ChevronDown, AlertTriangle, Lightbulb } from 'lucide-react'
import { ladePc, lesePcJetzt, hostKey } from './lesen'
import { letzteTage, zeitpunkt, genau } from './logik'
import { bewerte, type Bezug, type BezugKontext } from './bezug'
import { KAT_TEXT, type Aenderung, type PcDatei } from './typen'

/** Jünger als das → beim Öffnen nicht noch einmal vom PC lesen. */
const FRISCH_MS = 10 * 60_000

const d2 = (n: number) => String(n).padStart(2, '0')
const tagText = (t: number) => { const d = new Date(t); return `${d2(d.getDate())}.${d2(d.getMonth() + 1)}.` }
const zeitText = (t: number) => { const d = new Date(t); return `${tagText(t)} ${d2(d.getHours())}:${d2(d.getMinutes())}` }

/** Wann? — genau, auf den Tag, oder nur der Zeitraum zwischen zwei Lesevorgängen. */
export function wann(a: Aenderung): string {
  const g = genau(a)
  if (g === 'zeit') return zeitText(zeitpunkt(a))
  if (g === 'tag') return tagText(zeitpunkt(a))
  const bis = new Date(a.bis).getTime()
  if (a.von) { const von = new Date(a.von).getTime(); return tagText(von) === tagText(bis) ? tagText(bis) : `${tagText(von)}–${tagText(bis)}` }
  return `bis ${tagText(bis)}`
}

const kurz = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** Was ist passiert? — in einem Satzteil. */
export function beschreibe(a: Aenderung): string {
  const vonNach = a.alt && a.neu ? `${kurz(a.alt, 60)} → ${kurz(a.neu, 60)}` : ''
  const nurWindows = a.quelle === 'windows'
  switch (a.kat) {
    case 'software': case 'app':
      if (a.art === 'geaendert') return vonNach ? `aktualisiert: ${vonNach}` : 'geändert'
      if (a.art === 'entfernt') return `entfernt${a.alt ? ` (war ${kurz(a.alt, 40)})` : ''}`
      return `${nurWindows ? 'installiert oder aktualisiert' : 'neu installiert'}${a.neu ? ` – Version ${kurz(a.neu, 40)}` : ''}`
    case 'update': return a.art === 'entfernt' ? 'deinstalliert' : 'installiert'
    case 'treiber':
      if (a.art === 'geaendert') return vonNach ? `Treiber geändert: ${vonNach}` : 'Treiber geändert'
      if (a.art === 'entfernt') return `Treiber entfernt${a.alt ? ` (war ${kurz(a.alt, 40)})` : ''}`
      return `${nurWindows ? 'Treiber installiert oder aktualisiert' : 'neuer Treiber'}${a.neu ? ` – Version ${kurz(a.neu, 40)}` : ''}`
    case 'dienst':
      if (a.art === 'geaendert') return a.neu === 'Deaktiviert' ? 'Dienst wurde deaktiviert' : a.alt === 'Deaktiviert' ? 'Dienst wieder aktiviert (war deaktiviert)' : `Startart geändert: ${vonNach}`
      return a.art === 'entfernt' ? 'Dienst entfernt' : `neuer Dienst${a.neu === 'Deaktiviert' ? ' (deaktiviert)' : ''}`
    case 'autostart':
      if (a.art === 'geaendert') return 'Autostart-Eintrag geändert'
      return a.art === 'entfernt' ? 'startet nicht mehr automatisch mit' : 'startet jetzt automatisch mit'
    case 'aufgabe': return a.art === 'entfernt' ? 'geplante Aufgabe entfernt' : 'neue geplante Aufgabe'
    case 'netz':
      if (a.art === 'geaendert') return vonNach ? `geändert: ${vonNach}` : `geändert${a.neu ? ` (${a.neu})` : ''}`
      return a.art === 'entfernt' ? 'Netzwerkadapter entfernt' : `neuer Netzwerkadapter${a.neu ? ` (${a.neu})` : ''}`
    case 'system': return vonNach ? `geändert: ${vonNach}` : a.art === 'neu' ? `${a.neu || ''}` : 'geändert'
  }
}

const KAT_FARBE: Record<Aenderung['kat'], string> = {
  software: 'border-sky-500/40 text-sky-600', app: 'border-sky-500/40 text-sky-600',
  update: 'border-violet-500/40 text-violet-500', treiber: 'border-amber-500/40 text-amber-600',
  dienst: 'border-emerald-500/40 text-emerald-600', autostart: 'border-emerald-500/40 text-emerald-600',
  aufgabe: 'border-emerald-500/40 text-emerald-600', netz: 'border-rose-500/40 text-rose-500',
  system: 'border-border text-muted-foreground',
}

function Zeile({ a, bezug }: { a: Aenderung; bezug?: Bezug | null }) {
  return (
    <li className="px-3 py-1.5 flex items-start gap-2 text-[12px]" data-aenderung={a.kat}>
      <span className="w-[92px] shrink-0 text-muted-foreground tabular-nums leading-5 whitespace-nowrap" title={genau(a) === 'zeitraum' ? 'Irgendwann in diesem Zeitraum: Die Änderung fiel beim Vergleich zweier gelesener Stände auf, Windows hat keinen genauen Zeitpunkt vermerkt.' : 'Zeitpunkt von Windows selbst protokolliert.'}>{wann(a)}</span>
      <span className={`shrink-0 text-[10px] px-1.5 py-px rounded-full border leading-4 mt-0.5 ${KAT_FARBE[a.kat]}`}>{KAT_TEXT[a.kat]}</span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground font-medium break-words">{a.name}</span>
        <span className="text-muted-foreground"> — {beschreibe(a)}</span>
        {a.zusatz && <span className="text-muted-foreground/70" title={a.zusatz}> · {kurz(a.zusatz, 70)}</span>}
        {bezug && <span className="block text-[11px] text-amber-600">{bezug.grund}.</span>}
      </span>
      {bezug && <span className={`shrink-0 text-[10px] px-1.5 py-px rounded-full leading-4 mt-0.5 ${bezug.stufe === 'wahrscheinlich' ? 'bg-amber-500 text-white' : 'border border-amber-500/50 text-amber-600'}`}>{bezug.stufe === 'wahrscheinlich' ? 'passt gut' : 'möglich'}</span>}
    </li>
  )
}

export default function PcAenderungen({ host, live = false, kontext, tage = 14, zeitraumWahl = false }: {
  host: string
  /** PC ist erreichbar (WinRM steht) → gleich lesen. */
  live?: boolean
  /** Problem, zu dem passende Änderungen hervorgehoben werden. */
  kontext?: BezugKontext | null
  tage?: number
  /** Auswahl 14 / 30 / 90 Tage / 12 Monate anbieten (Geräte-„i“). */
  zeitraumWahl?: boolean
}) {
  const [datei, setDatei] = useState<PcDatei | null>(null)
  const [geladen, setGeladen] = useState(false)
  const [liest, setLiest] = useState(false)
  const [hinweis, setHinweis] = useState('')
  const [alleOffen, setAlleOffen] = useState(false)
  const [mehrPassend, setMehrPassend] = useState(false)
  const [zeitraum, setZeitraum] = useState(tage)
  const gelesenFuer = useRef('')
  const aktuell = useRef('')
  const k = hostKey(host)

  useEffect(() => {
    let weg = false
    setDatei(null); setGeladen(false); setHinweis(''); setAlleOffen(false); setMehrPassend(false); gelesenFuer.current = ''; aktuell.current = k
    if (!k) return
    void ladePc(k).then(d => { if (!weg) { setDatei(d); setGeladen(true) } })
    return () => { weg = true }
  }, [k])

  const lies = (erzwingen: boolean) => {
    if (!k || liest) return
    setLiest(true); setHinweis('')
    void lesePcJetzt(k).then(e => {
      if (aktuell.current !== k) return   // inzwischen ein anderer PC gewählt
      if (e.datei) setDatei(e.datei)
      if (e.status === 'aus') setHinweis(erzwingen ? 'Der PC ist gerade nicht erreichbar (aus, nicht im Netz oder WinRM nicht aktiv) – gezeigt wird der gespeicherte Stand.' : '')
      else if (e.status === 'fehler') setHinweis(e.text || 'Der PC ließ sich nicht lesen.')
    }).finally(() => setLiest(false))
  }

  // Erreichbarer PC: einmal je Auswahl frisch lesen (außer der Stand ist ohnehin gerade erst gelesen)
  useEffect(() => {
    if (!live || !geladen || !k || gelesenFuer.current === k) return
    gelesenFuer.current = k
    if (datei && Date.now() - new Date(datei.gelesenAm).getTime() < FRISCH_MS) return
    lies(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, geladen, k])

  const liste = useMemo(() => (datei ? letzteTage(datei.aenderungen, zeitraum) : []), [datei, zeitraum])
  const bewertet = useMemo(() => liste.map(a => ({ a, b: bewerte(a, kontext) })), [liste, kontext])
  const passend = useMemo(() => bewertet.filter(x => x.b).sort((x, y) => (x.b!.stufe === y.b!.stufe ? zeitpunkt(y.a) - zeitpunkt(x.a) : x.b!.stufe === 'wahrscheinlich' ? -1 : 1)), [bewertet])
  // Damit die Eingabe darunter sichtbar bleibt: alle guten Treffer, von den nur „möglichen“ zunächst zwei
  const gut = passend.filter(x => x.b!.stufe === 'wahrscheinlich').length
  const sichtbar = mehrPassend ? passend : passend.slice(0, Math.max(gut, 1) + 2)
  const hatKontext = !!kontext && (kontext.bereiche.length > 0 || !!kontext.text.trim())
  const zeigeAlle = alleOffen || (!passend.length && liste.length <= 8)
  const beobachtetSeit = datei ? new Date(datei.erstAm).getTime() : 0
  const kurzBeobachtet = !!datei && Date.now() - beobachtetSeit < zeitraum * 24 * 60 * 60_000

  if (!k) return null
  return (
    <div className="rounded-lg border border-border bg-card text-xs" data-pc-aenderungen>
      <div className="px-3 py-2 flex items-center gap-2 flex-wrap">
        <History size={14} className="text-primary shrink-0" />
        <span className="font-semibold text-foreground">Änderungen der letzten {zeitraum === 365 ? '12 Monate' : `${zeitraum} Tage`}</span>
        {datei && <span className="px-1.5 py-px rounded-full bg-muted/60 border border-border text-muted-foreground tabular-nums" data-aenderungen-anzahl>{liste.length}</span>}
        {zeitraumWahl && (
          <span className="inline-flex rounded-md border border-border p-0.5 bg-muted/30">
            {[14, 30, 90, 365].map(t => (
              <button key={t} onClick={() => setZeitraum(t)} className={`px-2 py-0.5 rounded ${zeitraum === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{t === 365 ? '12 Mon.' : `${t} T.`}</button>
            ))}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          {liest ? <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />wird vom PC gelesen …</span>
            : datei ? <span title="Zuletzt vom PC gelesen">Stand {zeitText(new Date(datei.gelesenAm).getTime())}</span> : null}
          <button onClick={() => lies(true)} disabled={liest} title="Jetzt vom PC lesen (nur lesend)" data-aenderungen-lesen
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border hover:bg-accent/30 disabled:opacity-40"><RefreshCw size={11} />jetzt lesen</button>
        </span>
      </div>

      {hinweis && <p className="px-3 pb-2 text-[11px] text-amber-600 flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{hinweis}</p>}

      {!geladen ? (
        <p className="px-3 pb-2.5 text-muted-foreground inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />Verlauf wird geladen …</p>
      ) : !datei ? (
        <p className="px-3 pb-2.5 text-muted-foreground" data-aenderungen-leer>
          {liest ? 'Dieser PC wird zum ersten Mal gelesen …' : 'Für diesen PC liegt noch kein Verlauf vor. Er wird beim nächsten Hintergrund-Lauf erfasst (werktags) – oder sofort mit „jetzt lesen“, wenn der PC erreichbar ist.'}
        </p>
      ) : (
        <>
          {/* Zum Problem passende Änderungen */}
          {hatKontext && passend.length > 0 && (
            <div className="border-t border-amber-500/30 bg-amber-500/[0.06]" data-aenderungen-passend>
              <p className="px-3 pt-2 text-[11px] font-semibold text-foreground inline-flex items-center gap-1.5">
                <Lightbulb size={13} className="text-amber-500" />Kann mit dem Problem zusammenhängen ({passend.length})
              </p>
              <ul className="divide-y divide-amber-500/15">{sichtbar.map(x => <Zeile key={x.a.id} a={x.a} bezug={x.b} />)}</ul>
              {passend.length > sichtbar.length && (
                <button onClick={() => setMehrPassend(true)} data-aenderungen-mehr className="px-3 py-1 text-[11px] text-amber-600 hover:underline">+ {passend.length - sichtbar.length} weitere mögliche zeigen</button>
              )}
              <p className="px-3 pb-2 text-[10px] text-muted-foreground">Hinweis, kein Beweis: Die Änderungen passen fachlich und zeitlich zum Problem. Ob sie die Ursache sind, zeigt erst die Gegenprobe.</p>
            </div>
          )}
          {hatKontext && !passend.length && liste.length > 0 && (
            <p className="px-3 pb-2 text-[11px] text-muted-foreground border-t border-border pt-2" data-aenderungen-kein-bezug>Keine der Änderungen passt fachlich zu diesem Problem.</p>
          )}

          {/* Alle Änderungen */}
          {liste.length === 0 ? (
            <p className="px-3 pb-2.5 text-muted-foreground border-t border-border pt-2" data-aenderungen-keine>In diesem Zeitraum wurde keine Änderung gefunden.</p>
          ) : (
            <div className="border-t border-border">
              {(passend.length > 0 || liste.length > 8) && (
                <button onClick={() => setAlleOffen(o => !o)} data-aenderungen-alle className="w-full px-3 py-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <ChevronDown size={12} className={zeigeAlle ? 'rotate-180' : ''} />{zeigeAlle ? 'Liste einklappen' : `Alle ${liste.length} Änderungen zeigen`}
                </button>
              )}
              {zeigeAlle && <ul className="divide-y divide-border/60 max-h-72 overflow-y-auto">{liste.map(a => <Zeile key={a.id} a={a} />)}</ul>}
            </div>
          )}

          {kurzBeobachtet && (
            <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border">
              Das Tool beobachtet diesen PC erst seit {tagText(beobachtetSeit)}. Für die Zeit davor ist nur bekannt, was Windows selbst protokolliert (Installationen, Updates, Treiber, neue Dienste) – geänderte Einstellungen fallen erst ab dann auf.
            </p>
          )}
        </>
      )}
    </div>
  )
}
