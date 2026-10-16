// ── Xelion-Durchwahlen prüfen ───────────────────────────────────────────────
// Grundlage ist die Vergabeliste: eine Zeile je Durchwahl. Daneben steht, was das AD
// zu dem Namen sagt. Zweck ist, ungenutzte Durchwahlen zu finden — ohne je eine zu
// erwischen, die noch benutzt wird.
//
// Gefiltert wird direkt in der Kopfzeile, wie im Excel-Autofilter: hinter jeder
// Überschrift steckt ein Trichter mit Kästchen. Alle Haken gesetzt = alles sichtbar,
// Haken weg = Wert ausblenden, alle Haken weg = nichts anzeigen.
//
// Gezählt wird ebenfalls nach Excel-Art: jede Aufklappliste zählt die Zeilen, die ALLE
// ANDEREN Filter passieren. Die eigene Spalte rechnet sich bewusst nicht selbst heraus,
// sonst verschwänden die ausgeblendeten Werte aus der Liste und man bekäme sie nicht
// wieder zurück.
//
// Der Arbeitsstand ist GETEILT: Farbmarkierungen, Filter, Suche und Karenzzeit liegen auf
// dem Netzlaufwerk, bleiben beim Menüwechsel erhalten und stehen bei allen Nutzern gleich.
// Dazu kommt ein Schnappschuss der geprüften Liste, damit sie beim Öffnen sofort da ist,
// statt jedes Mal neu gegen das AD zu laufen.

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  AlertTriangle, CheckSquare, Eraser, FileSpreadsheet, FileText, Loader2, PhoneOff, RotateCw,
  Search, X,
} from 'lucide-react'
import { KopfFilter } from '../KopfFilter'
import FarbWahl from './FarbWahl'
import { useAppStore } from '../../store/appStore'
import { useCurrentUser } from '../../store/authStore'
import { onAppFocus } from '../../utils/appFocus'
import { api } from '../../electronAPI'
import { exportExcelDurchwahlen, exportPdfDurchwahlen } from '../../utils/exportUtils'
import {
  ladeDurchwahlliste, pruefeGegenAd, BEFUND_TEXT, STATUS_TEXT,
  KARENZ_VORGABE_TAGE, zuletztOnlineText, passtText, durchwahlVon,
  type PruefErgebnis,
} from '../../services/rufnummerPruefung'
import {
  ladeAnsicht, speichereFilter, setzeMarkierungen, loescheAlleMarkierungen,
  ladeSchnappschuss, speichereSchnappschuss, alterStunden, farbe, farbName, FARBEN,
  type FarbId,
} from '../../services/durchwahlAnsicht'
import {
  leereAuswahl, naechsteAuswahl, aufSichtbareKuerzen, alleSichtbaren,
  type AuswahlStand,
} from './zeilenAuswahl'
import {
  SPALTEN_DEF, KEIN_FILTER, baueFilter, wendeAn, zaehlwerte, filterAktiv as istGefiltert,
  nurDiesenStatus, filterBeschreibung, ausAlsObjekt, ausAusObjekt,
  type Ausgeblendet, type SpaltenId,
} from './durchwahlFilter'

const CHIP = 'inline-block px-1.5 py-0.5 rounded-full border border-border bg-muted/20 text-foreground text-[10px]'

/** Takt, in dem der geteilte Arbeitsstand abgeglichen wird (nur eine kleine Datei). */
const ABGLEICH_MS = 15_000
/** Änderungen werden gesammelt geschrieben, damit Tippen keine Schreibflut auslöst. */
const SCHREIB_VERZUG_MS = 800
/** Ist der geteilte Listen-Schnappschuss älter, wird beim Öffnen einmal neu geprüft. */
const AUTO_NEU_STUNDEN = 12
/** Ab diesem Alter ist die Liste als Kündigungsgrundlage nicht mehr vertretbar. */
const WARN_TAGE = 7

export default function RufnummerPruefung() {
  const settings = useAppStore(s => s.settings)
  const nutzer = useCurrentUser()
  const [karenzTage, setKarenzTage] = useState(KARENZ_VORGABE_TAGE)
  const [daten, setDaten] = useState<PruefErgebnis | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [prueftAd, setPrueftAd] = useState(false)
  const [fehler, setFehler] = useState('')
  const [suche, setSuche] = useState('')

  /** Je Spalte die AUSGEBLENDETEN Werte (fehlender Eintrag = nichts ausgeblendet). */
  const [aus, setAus] = useState<Ausgeblendet>({})
  const setzeAus = useCallback((id: SpaltenId, neu: Set<string>) =>
    setAus(a => ({ ...a, [id]: neu })), [])

  /** Durchwahl → Farbe, aus dem geteilten Arbeitsstand. */
  const [markierungen, setMarkierungen] = useState<Record<string, FarbId>>({})
  /** Ausgewählte Zeilen — absichtlich NICHT geteilt, sonst zieht einer dem anderen die Auswahl weg. */
  const [ausw, setAusw] = useState<AuswahlStand>(leereAuswahl)
  const [standAlter, setStandAlter] = useState('')
  const [geteiltVon, setGeteiltVon] = useState('')

  const [exportiert, setExportiert] = useState('')
  const [exportLaeuft, setExportLaeuft] = useState(false)

  // Was wir vom geteilten Stand schon übernommen haben — damit der Abgleich eigene
  // Schreibvorgänge nicht als fremde Änderung zurückspielt.
  const uebernommen = useRef({ updatedAt: '', standAt: '' })
  const bereit = useRef(false)
  const schreibt = useRef(false)

  const ich = nutzer?.displayName || nutzer?.username || 'unbekannt'
  const ichRef = useRef(ich)
  ichRef.current = ich

  /**
   * Zweistufig: erst die Vergabeliste (steht sofort), dann die AD-Prüfung im Hintergrund.
   * Bis die durch ist, gilt nichts als kündbar — das ist in der Einstufung abgesichert,
   * nicht nur in der Anzeige.
   */
  async function laden(tage: number = karenzTage) {
    if (laedt || prueftAd) return
    setLaedt(true); setFehler(''); setExportiert('')
    let basis: PruefErgebnis | null = null
    try {
      basis = await ladeDurchwahlliste(tage)
      setDaten(basis)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
    setLaedt(false)
    if (!basis) return

    setPrueftAd(true)
    try {
      const erg = await pruefeGegenAd(basis, tage)
      setDaten(erg)
      // Fertige Liste teilen — nur dann steht sie bei den anderen sofort.
      const stempel = await speichereSchnappschuss(erg, ichRef.current)
      if (stempel) {
        uebernommen.current.standAt = stempel
        setStandAlter(stempel); setGeteiltVon(ichRef.current)
      }
    } catch (e) {
      setFehler(`AD-Prüfung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
    }
    setPrueftAd(false)
  }

  // ── Erster Start: geteilten Stand holen, dann nur bei Bedarf neu prüfen ────
  useEffect(() => {
    void (async () => {
      const [stand, schnapp] = await Promise.all([
        ladeAnsicht(KARENZ_VORGABE_TAGE).catch(() => null),
        ladeSchnappschuss().catch(() => null),
      ])
      let tage = KARENZ_VORGABE_TAGE
      if (stand) {
        tage = stand.karenzTage
        setKarenzTage(tage)
        setSuche(stand.suche)
        setAus(ausAusObjekt(stand.ausgeblendet))
        setMarkierungen(stand.markierungen)
        uebernommen.current = { updatedAt: stand.updatedAt, standAt: stand.standAt }
      }
      if (schnapp) {
        setDaten(schnapp.ergebnis)
        setStandAlter(schnapp.updatedAt); setGeteiltVon(schnapp.updatedBy)
        uebernommen.current.standAt = stand?.standAt || schnapp.updatedAt
      }
      bereit.current = true

      const alter = alterStunden(schnapp?.updatedAt)
      if (!schnapp || alter === null || alter > AUTO_NEU_STUNDEN) void laden(tage)
    })()
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [])

  // ── Abgleich im Takt: fremde Änderungen übernehmen ────────────────────────
  const gleicheAb = useCallback(async () => {
    if (schreibt.current || !bereit.current) return
    const stand = await ladeAnsicht().catch(() => null)
    if (!stand) return
    if (stand.updatedAt && stand.updatedAt !== uebernommen.current.updatedAt) {
      uebernommen.current.updatedAt = stand.updatedAt
      // Markierungen immer übernehmen (sie werden zusammengeführt), Filter nur,
      // wenn sie von jemand anderem kommen.
      setMarkierungen(stand.markierungen)
      if (stand.updatedBy !== ichRef.current) {
        setSuche(stand.suche)
        setAus(ausAusObjekt(stand.ausgeblendet))
        setKarenzTage(stand.karenzTage)
      }
    }
    if (stand.standAt && stand.standAt !== uebernommen.current.standAt) {
      uebernommen.current.standAt = stand.standAt
      const s = await ladeSchnappschuss().catch(() => null)
      if (s) { setDaten(s.ergebnis); setStandAlter(s.updatedAt); setGeteiltVon(s.updatedBy) }
    }
  }, [])
  const abgleichRef = useRef(gleicheAb)
  abgleichRef.current = gleicheAb
  useEffect(() => {
    // Nur abfragen, wenn das Fenster vorn ist. Jeder Netzlaufwerk-Zugriff kann den
    // Hauptprozess kurz ausbremsen; wer gar nicht hinsieht, braucht keinen Abgleich.
    const t = setInterval(() => {
      if (document.hasFocus()) void abgleichRef.current()
    }, ABGLEICH_MS)
    // Beim Zurückklicken ins Tool einmal sofort nachsehen (gebündelt über den
    // gemeinsamen Fokus-Melder, damit nicht alle Controller gleichzeitig losrennen).
    const ab = onAppFocus(() => { void abgleichRef.current() }, 30_000)
    return () => { clearInterval(t); ab() }
  }, [])

  // ── Eigene Filteränderungen gesammelt sichern ─────────────────────────────
  useEffect(() => {
    if (!bereit.current) return
    const t = setTimeout(() => {
      void (async () => {
        schreibt.current = true
        try {
          const neu = await speichereFilter(
            { ausgeblendet: ausAlsObjekt(aus), suche, karenzTage }, ichRef.current)
          uebernommen.current.updatedAt = neu.updatedAt
        } finally { schreibt.current = false }
      })()
    }, SCHREIB_VERZUG_MS)
    return () => clearTimeout(t)
  }, [aus, suche, karenzTage])

  async function markiereViele(durchwahlen: string[], f: FarbId | null) {
    if (durchwahlen.length === 0) return
    // Sofort anzeigen, dann teilen — ein Klick soll nicht aufs Netzlaufwerk warten.
    setMarkierungen(m => {
      const n = { ...m }
      for (const d of durchwahlen) { if (f) n[d] = f; else delete n[d] }
      return n
    })
    schreibt.current = true
    try {
      const neu = await setzeMarkierungen(durchwahlen, f, ichRef.current, karenzTage)
      uebernommen.current.updatedAt = neu.updatedAt
      setMarkierungen(neu.markierungen)
    } finally { schreibt.current = false }
  }

  /**
   * Farbe über den Punkt in der Zeile. Ist die Zeile Teil einer Mehrfachauswahl, wirkt
   * sie auf die ganze Auswahl — wie die Füllfarbe in Excel.
   */
  async function markiere(durchwahl: string, f: FarbId | null) {
    const ziele = ausw.auswahl.size > 1 && ausw.auswahl.has(durchwahl)
      ? [...ausw.auswahl] : [durchwahl]
    await markiereViele(ziele, f)
  }

  async function markierungenWeg() {
    setMarkierungen({})
    schreibt.current = true
    try {
      const neu = await loescheAlleMarkierungen(ichRef.current, karenzTage)
      uebernommen.current.updatedAt = neu.updatedAt
      setMarkierungen(neu.markierungen)
    } finally { schreibt.current = false }
  }

  // Die Markierung steckt im geteilten Stand, nicht in der Prüfliste — fürs Filtern
  // wird sie der Zeile angeheftet.
  const zeilen = useMemo(
    () => (daten?.zeilen ?? []).map(z => ({ ...z, farbe: markierungen[z.durchwahl] ?? '' as const })),
    [daten, markierungen])

  const praedikate = useMemo(() => baueFilter(aus, suche), [aus, suche])
  const gefiltert = useMemo(() => wendeAn(zeilen, praedikate), [zeilen, praedikate])
  const werte = useMemo(() => zaehlwerte(zeilen, praedikate), [zeilen, praedikate])

  // ── Zeilenauswahl (nur lokal — eine Auswahl ist kein Arbeitsstand, den man teilt) ──
  const sichtbareIds = useMemo(() => gefiltert.map(z => z.durchwahl), [gefiltert])

  useEffect(() => {
    // Nach jeder Filteränderung: Auswahl auf das eindampfen, was man noch sieht.
    const neu = aufSichtbareKuerzen(ausw, sichtbareIds)
    if (neu) setAusw(neu)
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [sichtbareIds, ausw])

  useEffect(() => {
    function taste(e: KeyboardEvent) { if (e.key === 'Escape') setAusw(leereAuswahl()) }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [])

  function zeileGeklickt(e: ReactMouseEvent, durchwahl: string) {
    // Umschalt+Klick würde sonst die Textmarkierung des Browsers aufziehen.
    if (e.shiftKey) { e.preventDefault(); window.getSelection()?.removeAllRanges() }
    setAusw(a => naechsteAuswahl(a, sichtbareIds, durchwahl,
      { strg: e.ctrlKey || e.metaKey, shift: e.shiftKey }))
  }

  function allesZuruecksetzen() { setAus({}); setSuche('') }
  const filterAktiv = istGefiltert(aus, suche)
  const anzahlMarkiert = Object.keys(markierungen).length
  const anzahlGewaehlt = ausw.auswahl.size

  /** Schnellgriff: nur den Status „Kündigung möglich" einblenden, alle anderen ausblenden. */
  function nurKuendbar() { setSuche(''); setAus(nurDiesenStatus(STATUS_TEXT.kuendbar)) }

  const filterText = useMemo(() => filterBeschreibung(aus, werte, suche), [aus, werte, suche])

  const tageAlt = (alterStunden(standAlter) ?? 0) / 24
  const zuAlt = !!standAlter && tageAlt > WARN_TAGE

  async function exportiere(art: 'excel' | 'pdf') {
    if (exportLaeuft || gefiltert.length === 0) return
    setExportLaeuft(true); setExportiert(''); setFehler('')
    try {
      const stempel = new Date().toISOString().slice(0, 10)
      const pfad = `${settings.exportPath}/Durchwahlen_${stempel}.${art === 'excel' ? 'xlsx' : 'pdf'}`
      // Die Farbe als Klartext mitgeben — die Vorarbeit soll beim Weitergeben nicht verloren gehen.
      const fuerExport = gefiltert.map(z => ({ ...z, markierung: farbName(z.farbe) }))
      if (art === 'excel') await exportExcelDurchwahlen(fuerExport, pfad, filterText)
      else await exportPdfDurchwahlen(fuerExport, pfad, filterText)
      setExportiert(pfad)
    } catch (e) {
      setFehler(`Export fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
    }
    setExportLaeuft(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 flex-wrap">
        <label className="block">
          <span className="text-[11px] text-muted-foreground">Karenzzeit (Tage ohne Anmeldung)</span>
          <input type="number" min={0} value={karenzTage}
            onChange={e => setKarenzTage(Math.max(0, Number(e.target.value) || 0))}
            onKeyDown={e => { if (e.key === 'Enter') void laden() }}
            title="Erst wenn ein deaktiviertes Konto so lange nicht angemeldet war, kommt seine Durchwahl als kündbar in Frage."
            className="mt-0.5 w-36 px-2.5 py-1.5 text-sm rounded-md bg-card border border-border text-foreground focus:outline-none focus:border-primary" />
        </label>
        <button onClick={() => void laden()} disabled={laedt || prueftAd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          {(laedt || prueftAd) ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
          {laedt ? 'Liste wird gelesen …' : prueftAd ? 'AD-Prüfung läuft …' : 'Neu laden'}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void exportiere('excel')} disabled={exportLaeuft || gefiltert.length === 0}
            title="Die aktuell gefilterte Tabelle als Excel speichern"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40">
            {exportLaeuft ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}Excel
          </button>
          <button onClick={() => void exportiere('pdf')} disabled={exportLaeuft || gefiltert.length === 0}
            title="Die aktuell gefilterte Tabelle als PDF speichern"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40">
            {exportLaeuft ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}PDF
          </button>
        </div>
      </div>

      {fehler && <p className="flex items-start gap-1.5 text-xs text-foreground"><AlertTriangle size={13} className="shrink-0 mt-px" />{fehler}</p>}

      {prueftAd && (
        <p className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-border bg-muted/20 text-[11px] text-foreground">
          <Loader2 size={13} className="animate-spin shrink-0" />
          Die Liste steht. Im Hintergrund wird noch zu jedem Namen im AD nachgesehen —
          erst danach steht fest, welche Durchwahlen ungenutzt sind. Filtern geht schon.
        </p>
      )}
      {daten && !daten.gegengeprueft && !prueftAd && (
        <p className="flex items-start gap-1.5 px-2.5 py-2 rounded-md border border-border bg-muted/20 text-[11px] text-foreground">
          <AlertTriangle size={13} className="shrink-0 mt-px" />
          Die AD-Prüfung ist nicht durchgelaufen — solange gilt <b>keine</b> Durchwahl als kündbar.
        </p>
      )}
      {zuAlt && !prueftAd && (
        <p className="flex items-start gap-1.5 px-2.5 py-2 rounded-md border border-border bg-muted/20 text-[11px] text-foreground">
          <AlertTriangle size={13} className="shrink-0 mt-px" />
          Die geteilte Liste ist <b>{Math.round(tageAlt)} Tage</b> alt. Vor einer Kündigung
          bitte <b>Neu laden</b> — in der Zwischenzeit kann ein Konto wieder aktiv geworden sein.
        </p>
      )}
      {/* Die Karenzzeit steckt in der Einstufung der Zeilen. Steht im Feld eine andere als
          die, mit der gerechnet wurde (etwa weil ein Kollege sie geändert hat), wäre die
          Anzeige sonst stillschweigend falsch. */}
      {daten && daten.karenzTage !== karenzTage && !laedt && !prueftAd && (
        <p className="flex items-start gap-1.5 px-2.5 py-2 rounded-md border border-border bg-muted/20 text-[11px] text-foreground">
          <AlertTriangle size={13} className="shrink-0 mt-px" />
          Die Liste ist mit <b>{daten.karenzTage} Tagen</b> Karenzzeit gerechnet, im Feld
          stehen <b>{karenzTage}</b>. Für die neue Karenzzeit bitte <b>Neu laden</b>.
        </p>
      )}
      {daten?.warnungen.map((w, i) => (
        <p key={i} className="flex items-start gap-1.5 text-[11px] text-foreground"><AlertTriangle size={12} className="shrink-0 mt-px" />{w}</p>
      ))}
      {exportiert && (
        <p className="flex items-center gap-2 text-[11px] text-foreground">
          Gespeichert: <span className="font-mono">{exportiert}</span>
          <button onClick={() => void api().openPath(exportiert)} className="underline">öffnen</button>
        </p>
      )}

      {/* ── Suche über alles + Schnellgriffe; gefiltert wird in der Kopfzeile ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Durchwahl, Name, Bemerkung …"
            className="pl-7 pr-2 py-1.5 w-56 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
        </div>
        <button onClick={nurKuendbar}
          title="Nur Durchwahlen, bei denen kein Hinweis auf Benutzung gefunden wurde — bitte trotzdem jede einzeln ansehen."
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent font-semibold">
          <PhoneOff size={11} />Kündigung möglich
        </button>
        <button onClick={allesZuruecksetzen} disabled={!filterAktiv}
          title={filterAktiv ? 'Alle gesetzten Filter und die Suche zurücksetzen' : 'Es ist kein Filter gesetzt'}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent">
          <X size={11} />Alle Filter aufheben
        </button>
        <button onClick={() => void markierungenWeg()} disabled={anzahlMarkiert === 0}
          title={anzahlMarkiert ? `${anzahlMarkiert} Farbmarkierung(en) entfernen — gilt für alle Nutzer` : 'Es ist nichts markiert'}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent">
          <Eraser size={11} />Markierungen löschen
        </button>
        <button onClick={() => setAusw(alleSichtbaren(sichtbareIds))} disabled={gefiltert.length === 0}
          title="Alle gerade angezeigten Zeilen auswählen"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent">
          <CheckSquare size={11} />Alle sichtbaren auswählen
        </button>
        <span className="text-[11px] text-muted-foreground">
          Filter stecken in den Überschriften (Trichter) — Haken weg blendet den Wert aus.
          Zeilen auswählen mit Klick, Strg+Klick, Umschalt+Klick.
        </span>
      </div>

      {/* ── Was mit der Auswahl geht ───────────────────────────────────────── */}
      {anzahlGewaehlt > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-2.5 py-2 rounded-md border border-border bg-muted/20">
          <span className="text-[11px] text-foreground">
            <b>{anzahlGewaehlt}</b> {anzahlGewaehlt === 1 ? 'Zeile' : 'Zeilen'} ausgewählt
          </span>
          <span className="text-[11px] text-muted-foreground">· färben:</span>
          {FARBEN.map(x => (
            <button key={x.id} onClick={() => void markiereViele([...ausw.auswahl], x.id)}
              title={`Auswahl ${x.name} markieren`}
              className={`w-4 h-4 rounded-full border border-transparent hover:ring-1 hover:ring-foreground/50 ${x.punkt}`} />
          ))}
          <button onClick={() => void markiereViele([...ausw.auswahl], null)}
            title="Markierung der ausgewählten Zeilen entfernen"
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-border text-foreground hover:bg-accent">
            <Eraser size={10} />Markierung weg
          </button>
          <button onClick={() => setAusw(leereAuswahl())}
            title="Auswahl aufheben (oder Esc drücken)"
            className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-border text-foreground hover:bg-accent">
            <X size={10} />Auswahl aufheben
          </button>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        <b className="text-foreground">{gefiltert.length}</b> von {zeilen.length} Durchwahlen
        {anzahlMarkiert > 0 && <> · {anzahlMarkiert} markiert</>}
        {daten && <> · Stand {new Date(daten.geladenAm).toLocaleString('de-DE')}</>}
        {/* Alle arbeiten auf demselben Stand — das muss man sehen, sonst wundert man sich,
            wenn sich ein Filter „von allein" ändert. */}
        {geteiltVon && <> · geteilter Stand, zuletzt von {geteiltVon}</>}
      </p>

      {/* ── Tabelle ───────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border overflow-auto max-h-[64vh]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card border-b border-border z-10">
            <tr className="text-left">
              {SPALTEN_DEF.map(d => (
                <th key={d.id} className="px-3 py-2 align-bottom whitespace-nowrap">
                  <KopfFilter titel={d.titel} werte={werte[d.id]} leerText={d.leerText}
                    ausgeblendet={aus[d.id] ?? KEIN_FILTER}
                    onChange={neu => setzeAus(d.id, neu)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {laedt && zeilen.length === 0 && (
              <tr><td colSpan={SPALTEN_DEF.length} className="px-3 py-8 text-center text-muted-foreground">
                <Loader2 size={16} className="animate-spin inline mr-2" />Vergabeliste wird gelesen …
              </td></tr>
            )}
            {!laedt && gefiltert.length === 0 && (
              <tr><td colSpan={SPALTEN_DEF.length} className="px-3 py-8 text-center text-muted-foreground">
                {zeilen.length === 0 ? 'Keine Daten geladen.' : 'Keine Durchwahl passt zu den gesetzten Filtern.'}
              </td></tr>
            )}
            {gefiltert.map(z => {
              const f = farbe(z.farbe)
              const gewaehlt = ausw.auswahl.has(z.durchwahl)
              return (
              // Markierte Zeilen werden nur getönt — die Schrift bleibt wie überall.
              // Die Auswahl übertönt die Farbe absichtlich: welche Farbe gesetzt ist,
              // sieht man weiter am Punkt in der ersten Spalte.
              <tr key={`${z.durchwahl}-${z.zeile}`} onClick={e => zeileGeklickt(e, z.durchwahl)}
                className={`cursor-default ${gewaehlt ? 'bg-foreground/15' : f ? f.zeile : 'hover:bg-accent/20'}`}>
                {/* Der Farbpunkt öffnet sein eigenes Menü — dieser Klick darf die Auswahl nicht ändern. */}
                <td className={`px-3 py-1.5 border-l-2 ${gewaehlt ? 'border-foreground' : 'border-transparent'}`}
                  onClick={e => e.stopPropagation()}>
                  <FarbWahl aktuell={z.farbe}
                    titel={ausw.auswahl.size > 1 && gewaehlt
                      ? `${ausw.auswahl.size} ausgewählte Zeilen`
                      : `${z.durchwahl} · ${z.name || 'nicht vergeben'}`}
                    onWahl={neu => void markiere(z.durchwahl, neu)} />
                </td>
                <td className="px-3 py-1.5 font-mono font-semibold text-foreground">{z.durchwahl}</td>
                <td className="px-3 py-1.5 text-foreground">
                  {z.name || <span className="text-muted-foreground italic">nicht vergeben</span>}
                  {/* Transparenz: wenn das Konto unter einer anderen Schreibweise gefunden
                      wurde, muss man das sehen können — sonst wirkt die Zuordnung geraten. */}
                  {z.gefundenAls && (
                    <span className="block text-[10px] text-muted-foreground">im AD: {z.gefundenAls}</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-foreground break-all">{z.email || <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-1.5 font-mono text-foreground">{z.corpId || <span className="text-muted-foreground font-sans">—</span>}</td>
                <td className="px-3 py-1.5">
                  {z.abteilung
                    ? <span className="text-foreground">{z.abteilung}</span>
                    : z.abteilungListe
                      ? <span className="text-muted-foreground" title="Kein AD-Konto gefunden — Wert stammt aus der Vergabeliste und kann veraltet sein">{z.abteilungListe} (Liste)</span>
                      : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-1.5"><span className={CHIP}>{BEFUND_TEXT[z.befund]}</span></td>
                <td className="px-3 py-1.5 text-muted-foreground">{zuletztOnlineText(z.zuletztOnline)}</td>
                <td className="px-3 py-1.5">
                  {z.rufnummerAd
                    ? <span className="font-mono text-foreground">{z.rufnummerAd}</span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                {/* Letzte vier Stellen der AD-Rufnummer gegen die Durchwahl. „ungleich" ist
                    ein Hinweis, kein Urteil — die Einstufung macht das weiterhin woanders. */}
                <td className="px-3 py-1.5">
                  {passtText(z)
                    ? <span className={`${CHIP} ${z.rufnummerPasst === false ? 'font-semibold' : ''}`}
                        title={z.rufnummerPasst === false
                          ? `Im AD steht ${durchwahlVon(z.rufnummerAd)}, in der Liste ${z.durchwahl}`
                          : `Letzte vier Stellen stimmen mit ${z.durchwahl} überein`}>
                        {passtText(z)}
                      </span>
                    : <span className="text-muted-foreground" title="Im AD steht keine Rufnummer — nichts zu vergleichen">—</span>}
                </td>
                <td className="px-3 py-1.5">
                  {z.xelionGruppen.length === 0
                    ? <span className="text-muted-foreground">—</span>
                    : <span className="flex flex-wrap gap-1">
                        {z.xelionGruppen.map(g => (
                          <span key={g} title={g}
                            className="inline-block px-1.5 py-0.5 rounded border border-border bg-muted/20 text-foreground text-[10px] font-mono max-w-[14rem] truncate">{g}</span>
                        ))}
                      </span>}
                </td>
                <td className="px-3 py-1.5">
                  <span title={z.grund} className={`${CHIP} cursor-help ${z.status === 'kuendbar' ? 'font-semibold' : ''}`}>
                    {STATUS_TEXT[z.status]}
                  </span>
                  {/* Der wichtigste Gegenhinweis gehört sichtbar in die Zeile. */}
                  {z.traegerAktiv.length > 0 && (
                    <span className="block mt-0.5 text-[10px] text-foreground">
                      Nummer im AD bei {z.traegerAktiv.join(', ')}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{z.bemerkung || '—'}</td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
