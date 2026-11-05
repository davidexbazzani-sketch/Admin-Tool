// ── Xelion-Lizenzen ─────────────────────────────────────────────────────────
// Lizenzliste des Dienstleisters importieren und gegen AD, Vergabeliste und (per Knopf)
// die PCs prüfen. Ziel: bezahlte Lizenzen finden, die keiner braucht, und Durchwahlen
// ohne Lizenz klären. Das Werkzeug kündigt nichts — es zeigt Empfehlungen mit Begründung.
//
// Ablauf: Import → Vorschau → übernehmen → Tabelle steht sofort (alles „ungeprüft") →
// AD-Abgleich im Hintergrund → Empfehlungen. Der fertige Stand liegt geteilt auf dem
// Netzlaufwerk; Filter und Auswahl sind lokal.

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  AlertTriangle, CheckSquare, FileSpreadsheet, FileText, Loader2, Mail, Monitor, RotateCw, Search, Upload, X,
} from 'lucide-react'
import { KopfFilter } from '../KopfFilter'
import { PersonInfoButton } from '../person/PersonDossier'
import { DeviceInfoButton } from '../device/DeviceDossier'
import { useAppStore } from '../../store/appStore'
import { useCurrentUser } from '../../store/authStore'
import { api } from '../../electronAPI'
import { exportExcelXelionLizenzen, exportPdfXelionLizenzen } from '../../utils/exportUtils'
import { zuletztOnlineText } from '../../services/rufnummerPruefung'
import { parseLizenzCsv, type CsvZeile, type ImportStatistik } from '../../services/xelionLizenzenCsv'
import {
  KARENZ_VORGABE_TAGE, EMPFEHLUNG_TEXT, TYP_TEXT, AD_TEXT, LIZENZ_TEXT,
  baueStand, neueImportDatei, vergleicheImport, ladeImport, speichereImport, ladeStand, speichereStand,
  ladePcBefunde, pruefeLizenzenGegenAd, stufeAlleEin, fassePcZusammen, vergabeText, adNummerText,
  type LizenzStand, type PcPruefungDatei, type ImportVergleich, type Empfehlung,
} from '../../services/xelionLizenzen'
import { pruefeXelionAmPc, SEKUNDEN_JE_BLOCK, type PcPruefFortschritt } from '../../services/xelionPcPruefung'
import {
  leereAuswahl, naechsteAuswahl, aufSichtbareKuerzen, alleSichtbaren, type AuswahlStand,
} from './zeilenAuswahl'
import {
  SPALTEN_DEF, KEIN_FILTER, baueFilter, wendeAn, zaehlwerte, vorgabeFilter, nurEmpfehlungen,
  filterBeschreibung, type Ausgeblendet, type SpaltenId, type LizenzZeile,
} from './lizenzFilter'
import { ladeGeraeteIndex, ausstattungsKlasse, geraeteText, KEIN_PC, type GeraeteSuche } from '../../services/xelionGeraete'
import { ladeMailProtokoll, vornameVon, type MailEintrag } from '../../services/xelionMail'
import XelionMailDialog, { type MailEmpfaenger } from './XelionMailDialog'

/** Ausstattung, bei der eine Xelion-Lizenz fraglich ist (kein Headset-Arbeitsplatz). */
const OHNE_RICHTIGEN_PC = new Set([KEIN_PC, 'Desktop Mini'])

const CHIP = 'inline-block px-1.5 py-0.5 rounded-full border border-border bg-muted/20 text-foreground text-[10px]'
const KNOPF = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent'
/** Ist der geteilte Stand älter, wird beim Öffnen einmal neu gegen das AD geprüft. */
const AUTO_NEU_STUNDEN = 12
/** Anteil verschwundener Einträge, ab dem der Import ausdrücklich bestätigt werden muss. */
const VERDAECHTIG_ANTEIL = 0.3

interface Vorschau {
  datei: string
  zeilen: CsvZeile[]
  warnungen: string[]
  statistik: ImportStatistik
  vergleich: ImportVergleich | null
}

function base64ZuBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function alterStunden(iso: string | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : (Date.now() - t) / 3_600_000
}

export default function XelionLizenzen() {
  const settings = useAppStore(s => s.settings)
  const nutzer = useCurrentUser()
  const ich = nutzer?.displayName || nutzer?.username || 'unbekannt'
  const ichRef = useRef(ich)
  ichRef.current = ich

  const [stand, setStand] = useState<LizenzStand | null>(null)
  const [pcDatei, setPcDatei] = useState<PcPruefungDatei | null>(null)
  const [karenzTage, setKarenzTage] = useState(KARENZ_VORGABE_TAGE)
  const [laedt, setLaedt] = useState(true)
  const [adSchritt, setAdSchritt] = useState('')
  const [fehler, setFehler] = useState('')
  const [meldung, setMeldung] = useState('')
  const [vorschau, setVorschau] = useState<Vorschau | null>(null)
  const [verdachtOk, setVerdachtOk] = useState(false)

  const [aus, setAus] = useState<Ausgeblendet>(vorgabeFilter)
  const [suche, setSuche] = useState('')
  const [ausw, setAusw] = useState<AuswahlStand>(leereAuswahl)

  const [pcLauf, setPcLauf] = useState<PcPruefFortschritt | null>(null)
  const pcAbbruch = useRef(false)
  const [exportLaeuft, setExportLaeuft] = useState(false)
  const [exportiert, setExportiert] = useState('')
  // Zugewiesene Rechner (Endgeräte-Übersicht + Inventar) — einmal im Hintergrund geladen
  const [geraeteSuche, setGeraeteSuche] = useState<GeraeteSuche | null>(null)
  const [mailProtokoll, setMailProtokoll] = useState<Record<string, MailEintrag[]>>({})
  const [mailAn, setMailAn] = useState<MailEmpfaenger[] | null>(null)

  const prueftAd = !!adSchritt
  const standRef = useRef(stand)
  standRef.current = stand

  // ── AD-Abgleich ───────────────────────────────────────────────────────────
  async function adAbgleich(basis: LizenzStand, pc: PcPruefungDatei | null) {
    setFehler('')
    setAdSchritt('AD-Abgleich startet …')
    try {
      const erg = await pruefeLizenzenGegenAd(basis, pc, ichRef.current, t => setAdSchritt(t))
      setStand(erg)
      if (erg.gegengeprueft) await speichereStand(erg)
    } catch (e) {
      setFehler(`AD-Abgleich fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
    }
    setAdSchritt('')
  }

  // ── Erster Start ─────────────────────────────────────────────────────────
  useEffect(() => {
    void ladeGeraeteIndex().then(f => setGeraeteSuche(() => f)).catch(() => { /* Spalte bleibt leer */ })
    void ladeMailProtokoll().then(setMailProtokoll)
    void (async () => {
      const [s, pc] = await Promise.all([ladeStand(), ladePcBefunde()])
      setPcDatei(pc)
      if (pc === null) setFehler('Die Datei mit den PC-Befunden ist nicht lesbar — PC-Prüfungen werden nicht gespeichert, bis das geklärt ist.')
      if (s) {
        setStand(s); setKarenzTage(s.karenzTage)
        setLaedt(false)
        const alt = alterStunden(s.adAm)
        if (alt === null || alt > AUTO_NEU_STUNDEN) void adAbgleich(s, pc)
        return
      }
      // Kein geteilter Stand, aber ein Import → lokal aufbauen und prüfen
      const imp = await ladeImport()
      setLaedt(false)
      if (imp) {
        const basis = baueStand(imp, KARENZ_VORGABE_TAGE, ichRef.current)
        setStand(basis)
        void adAbgleich(basis, pc)
      }
    })()
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [])

  // ── Karenzzeit: nur neu einstufen, keine neue AD-Abfrage ─────────────────
  useEffect(() => {
    if (!stand || stand.karenzTage === karenzTage) return
    const t = setTimeout(() => {
      const s = standRef.current
      if (!s) return
      const neu: LizenzStand = { ...s, karenzTage, eintraege: s.eintraege.map(e => ({ ...e })), updatedAt: new Date().toISOString(), updatedBy: ichRef.current }
      stufeAlleEin(neu, pcDatei?.nachSam ?? {})
      setStand(neu)
      void speichereStand(neu)
    }, 600)
    return () => clearTimeout(t)
  }, [karenzTage, stand, pcDatei])

  // ── Import ────────────────────────────────────────────────────────────────
  async function importieren() {
    setFehler(''); setMeldung('')
    const pfad = await api().openFileDialog([{ name: 'Xelion-Lizenzliste (CSV)', extensions: ['csv', 'txt'] }])
    if (!pfad) return
    const r = await api().readFile(pfad)
    if (!r.success || !r.data) { setFehler(`Datei nicht lesbar: ${r.error || 'unbekannter Fehler'}`); return }
    try {
      const p = parseLizenzCsv(base64ZuBytes(r.data))
      const datei = pfad.split(/[\\/]/).pop() || pfad
      const imp = neueImportDatei(p.zeilen, datei, ichRef.current)
      const vorher = await ladeImport()
      setVerdachtOk(false)
      setVorschau({ datei, zeilen: p.zeilen, warnungen: p.warnungen, statistik: imp.statistik, vergleich: vergleicheImport(vorher?.zeilen ?? null, p.zeilen) })
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }

  const verdaechtig = !!vorschau?.vergleich && vorschau.vergleich.vorherAnzahl > 0
    && vorschau.vergleich.weg.length / vorschau.vergleich.vorherAnzahl > VERDAECHTIG_ANTEIL

  async function importUebernehmen() {
    if (!vorschau) return
    const imp = neueImportDatei(vorschau.zeilen, vorschau.datei, ichRef.current)
    try {
      await speichereImport(imp)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
      return
    }
    setVorschau(null)
    setAusw(leereAuswahl())
    const basis = baueStand(imp, karenzTage, ichRef.current)
    setStand(basis)
    setMeldung(`${imp.statistik.zeilen} Zeilen aus „${imp.datei}" übernommen.`)
    void adAbgleich(basis, pcDatei)
  }

  // ── Zeilen + Filter ──────────────────────────────────────────────────────
  const zeilen: LizenzZeile[] = useMemo(() => (stand?.eintraege ?? []).map(e => ({
    ...e, pc: fassePcZusammen(e.ad.sam ? pcDatei?.nachSam[e.ad.sam.toLowerCase()] : undefined, stand?.karenzTage ?? karenzTage),
    geraete: e.typ === 'person' && geraeteSuche ? geraeteSuche(e.ad.anzeigename || e.name, e.ad.sam || undefined) : null,
  })), [stand, pcDatei, karenzTage, geraeteSuche])

  const praedikate = useMemo(() => baueFilter(aus, suche), [aus, suche])
  const gefiltert = useMemo(() => wendeAn(zeilen, praedikate), [zeilen, praedikate])
  const werte = useMemo(() => zaehlwerte(zeilen, praedikate), [zeilen, praedikate])
  const filterText = useMemo(() => filterBeschreibung(aus, werte, suche), [aus, werte, suche])
  const filterAktiv = Object.values(aus).some(s => s && s.size) || !!suche.trim()

  const sichtbareIds = useMemo(() => gefiltert.map(z => z.key), [gefiltert])
  useEffect(() => {
    const neu = aufSichtbareKuerzen(ausw, sichtbareIds)
    if (neu) setAusw(neu)
  }, [sichtbareIds, ausw])
  useEffect(() => {
    function taste(e: KeyboardEvent) { if (e.key === 'Escape') setAusw(leereAuswahl()) }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [])
  function zeileGeklickt(e: ReactMouseEvent, key: string) {
    if ((e.target as HTMLElement).closest('button, a, input')) return
    if (e.shiftKey) { e.preventDefault(); window.getSelection()?.removeAllRanges() }
    setAusw(a => naechsteAuswahl(a, sichtbareIds, key, { strg: e.ctrlKey || e.metaKey, shift: e.shiftKey }))
  }

  // ── Kennzahlen ───────────────────────────────────────────────────────────
  const zahl = (f: (z: LizenzZeile) => boolean) => zeilen.filter(f).length
  const kacheln: { titel: string; wert: number; klick: () => void; hinweis: string }[] = [
    { titel: 'Bezahlte Lizenzen', wert: zahl(z => z.lizenz === 'ja'), hinweis: 'Alle Einträge mit Lizenz = Ja (Personen und Funktionskonten)',
      klick: () => { setSuche(''); setAus({ lizenz: new Set([LIZENZ_TEXT.nein, LIZENZ_TEXT.leer]) }) } },
    ...(['kuendbar', 'pruefen', 'durchwahl-klaeren', 'durchwahl-freigeben'] as Empfehlung[]).map(x => ({
      titel: EMPFEHLUNG_TEXT[x], wert: zahl(z => z.empfehlung === x), hinweis: `Nur „${EMPFEHLUNG_TEXT[x]}" anzeigen`,
      klick: () => { setSuche(''); setAus(nurEmpfehlungen(vorgabeFilter(), [EMPFEHLUNG_TEXT[x]])) },
    })),
    { titel: 'Funktionskonten', wert: zahl(z => z.typ === 'funktion' || z.typ === 'ohne-user'), hinweis: 'Funktionskonten und Leitungen ohne Benutzer — nie kündbar',
      klick: () => { setSuche(''); setAus({ typ: new Set([TYP_TEXT.person, TYP_TEXT.gruppe]) }) } },
  ]

  // Schnellgriff: Personen mit Lizenz, aber ohne PC oder nur mit Mini-Desktop
  function ohnePcFilter() {
    const klassen = new Set(zeilen.filter(z => z.geraete !== null).map(z => ausstattungsKlasse(z.geraete!)))
    klassen.add('')   // „(entfällt)" — keine Person
    setSuche('')
    setAus({
      ...vorgabeFilter(),
      typ: new Set(Object.values(TYP_TEXT).filter(t => t !== TYP_TEXT.person)),
      lizenz: new Set([LIZENZ_TEXT.nein, LIZENZ_TEXT.leer]),
      geraete: new Set([...klassen].filter(k => !OHNE_RICHTIGEN_PC.has(k))),
    })
  }

  // ── Mail an Auswahl ──────────────────────────────────────────────────────
  function mailDialogOeffnen() {
    const personen = gefiltert.filter(z => ausw.auswahl.has(z.key) && z.typ === 'person')
    setMailAn(personen.map(z => ({
      key: z.key, name: z.ad.anzeigename || z.name, email: z.email,
      vorname: vornameVon(z.ad.anzeigename || z.name, z.email),
    })))
  }

  // ── PC-Prüfung ───────────────────────────────────────────────────────────
  const ausgewaehltePersonen = useMemo(
    () => gefiltert.filter(z => ausw.auswahl.has(z.key) && z.typ === 'person' && z.ad.sam),
    [gefiltert, ausw])
  const gefiltertePersonen = useMemo(() => gefiltert.filter(z => z.typ === 'person' && z.ad.sam), [gefiltert])

  async function pcPruefen(ziel: LizenzZeile[]) {
    if (!ziel.length || pcLauf) return
    if (pcDatei === null) { setFehler('PC-Befunde nicht lesbar — Prüfung gesperrt, damit nichts überschrieben wird.'); return }
    // grob: gut ein PC je Person, 10 PCs je Block
    const blocke = Math.ceil(ziel.length * 1.2 / 10)
    if (ziel.length > 30 && !window.confirm(`PC-Prüfung für ${ziel.length} Personen starten?\nGeschätzte Dauer: ca. ${Math.max(1, Math.round(blocke * SEKUNDEN_JE_BLOCK / 60))} Minuten. Abbrechen ist jederzeit möglich.`)) return
    pcAbbruch.current = false
    setFehler(''); setMeldung('')
    setPcLauf({ text: 'startet …', fertig: 0, gesamt: 0 })
    try {
      const r = await pruefeXelionAmPc(
        ziel.map(z => ({ key: z.key, name: z.ad.anzeigename || z.name, sam: z.ad.sam })),
        ichRef.current, f => setPcLauf(f), () => pcAbbruch.current)
      if (r.datei) {
        setPcDatei(r.datei)
        const s = standRef.current
        if (s) {
          const neu: LizenzStand = { ...s, eintraege: s.eintraege.map(e => ({ ...e })) }
          stufeAlleEin(neu, r.datei.nachSam)
          setStand(neu)
          void speichereStand(neu)
        }
      }
      setMeldung(`PC-Prüfung: ${r.hinweis}`)
    } catch (e) {
      setFehler(`PC-Prüfung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
    }
    setPcLauf(null)
  }

  // ── Export ───────────────────────────────────────────────────────────────
  // Ausgewählte Zeilen in Tabellenreihenfolge (die Auswahl ist ohnehin auf Sichtbares gekürzt)
  const ausgewaehlt = useMemo(() => gefiltert.filter(z => ausw.auswahl.has(z.key)), [gefiltert, ausw])

  async function exportiere(format: 'xlsx' | 'pdf', nurAuswahl = false) {
    const ziel = nurAuswahl ? ausgewaehlt : gefiltert
    if (exportLaeuft || !ziel.length) return
    const name = `Xelion-Lizenzen${nurAuswahl ? '_Auswahl' : ''}_${new Date().toISOString().slice(0, 10)}.${format}`
    const pfad = await api().saveFileDialog(`${settings.exportPath}/${name}`,
      [format === 'pdf' ? { name: 'PDF', extensions: ['pdf'] } : { name: 'Excel', extensions: ['xlsx'] }])
    if (!pfad) return
    setExportLaeuft(true); setExportiert(''); setFehler('')
    try {
      const pcText = new Map(ziel.map(z => [z.key, z.pc.zustand === 'ungeprueft' ? '' : z.pc.text]))
      const pc = (e: { key: string }) => pcText.get(e.key) || ''
      const gerText = new Map(ziel.map(z => [z.key, geraeteText(z.geraete)]))
      const ger = (e: { key: string }) => gerText.get(e.key) || ''
      const text = nurAuswahl ? `Auswahl: ${ziel.length} von Hand ausgewählte Einträge · ${filterText || 'Keine Filter gesetzt'}` : filterText
      if (format === 'pdf') await exportPdfXelionLizenzen(ziel, pc, pfad, text, ger)
      else await exportExcelXelionLizenzen(ziel, pc, pfad, text, nurAuswahl ? 'Auswahl' : undefined, ger)
      setExportiert(pfad)
    } catch (e) {
      setFehler(`Export fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
    }
    setExportLaeuft(false)
  }

  const setzeAus = (id: SpaltenId, neu: Set<string>) => setAus(a => ({ ...a, [id]: neu }))
  const karenzAbweichend = !!stand && stand.karenzTage !== karenzTage

  return (
    <div className="space-y-3">
      {/* ── Kopfleiste ─────────────────────────────────────────────────────── */}
      <div className="flex items-end gap-2 flex-wrap">
        <button onClick={() => void importieren()} disabled={prueftAd || !!pcLauf}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          <Upload size={13} />Lizenzliste importieren (CSV)
        </button>
        <label className="block">
          <span className="text-[11px] text-muted-foreground">Karenzzeit (Tage ohne Anmeldung)</span>
          <input type="number" min={0} value={karenzTage}
            onChange={e => setKarenzTage(Math.max(0, Number(e.target.value) || 0))}
            title="Wer länger nicht angemeldet war bzw. Xelion länger nicht benutzt hat, wird als „Lizenz prüfen“ markiert."
            className="mt-0.5 w-28 px-2.5 py-1.5 text-sm rounded-md bg-card border border-border text-foreground focus:outline-none focus:border-primary" />
        </label>
        <button onClick={() => stand && void adAbgleich(stand, pcDatei)} disabled={!stand || prueftAd || !!pcLauf} className={KNOPF}
          title="AD und Vergabeliste neu abgleichen (die Lizenzliste bleibt dieselbe)">
          {prueftAd ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}AD neu prüfen
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void exportiere('xlsx')} disabled={exportLaeuft || !gefiltert.length} className={KNOPF}
            title="Excel mit drei Blättern: Kündigung Anbieter, Durchwahlen, Alle (gefiltert)">
            {exportLaeuft ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}Excel
          </button>
          <button onClick={() => void exportiere('pdf')} disabled={exportLaeuft || !gefiltert.length} className={KNOPF}
            title="PDF der gefilterten Tabelle (A4 quer)">
            {exportLaeuft ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}PDF
          </button>
        </div>
      </div>

      {stand && (
        <p className="text-[11px] text-muted-foreground">
          Liste „{stand.importDatei}" · importiert {new Date(stand.importAt).toLocaleString('de-DE')} von {stand.importVon}
          {stand.adAm && <> · AD-Abgleich {new Date(stand.adAm).toLocaleString('de-DE')}</>}
          {stand.updatedBy && <> · zuletzt von {stand.updatedBy}</>}
        </p>
      )}

      {fehler && <p className="flex items-start gap-1.5 text-xs text-foreground"><AlertTriangle size={13} className="shrink-0 mt-px" />{fehler}</p>}
      {meldung && <p className="text-[11px] text-foreground">{meldung}</p>}
      {prueftAd && (
        <p className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-border bg-muted/20 text-[11px] text-foreground">
          <Loader2 size={13} className="animate-spin shrink-0" />{adSchritt} Die Tabelle lässt sich schon filtern.
        </p>
      )}
      {stand && !stand.gegengeprueft && !prueftAd && (
        <p className="flex items-start gap-1.5 px-2.5 py-2 rounded-md border border-border bg-muted/20 text-[11px] text-foreground">
          <AlertTriangle size={13} className="shrink-0 mt-px" />
          Der AD-Abgleich ist nicht vollständig durchgelaufen — solange gilt <b>keine</b> Lizenz als kündbar.
        </p>
      )}
      {karenzAbweichend && (
        <p className="text-[11px] text-muted-foreground">Karenzzeit geändert — Empfehlungen werden neu berechnet …</p>
      )}
      {stand?.warnungen.map((w, i) => (
        <p key={i} className="flex items-start gap-1.5 text-[11px] text-foreground"><AlertTriangle size={12} className="shrink-0 mt-px" />{w}</p>
      ))}
      {exportiert && (
        <p className="flex items-center gap-2 text-[11px] text-foreground">
          Gespeichert: <span className="font-mono">{exportiert}</span>
          <button onClick={() => void api().openPath(exportiert)} className="underline">öffnen</button>
        </p>
      )}

      {!stand && !laedt && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Noch keine Lizenzliste importiert. Die CSV vom Xelion-Dienstleister (mit der Spalte „Lizenz") über
          <b className="text-foreground"> Lizenzliste importieren</b> einlesen.
        </div>
      )}
      {laedt && <p className="text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin inline mr-1.5" />Gespeicherter Stand wird geladen …</p>}

      {stand && (
        <>
          {/* ── Kennzahlen ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {kacheln.map(k => (
              <button key={k.titel} onClick={k.klick} title={k.hinweis}
                className="text-left rounded-lg border border-border bg-card px-3 py-2 hover:bg-accent/40">
                <div className="text-xl font-bold text-foreground">{k.wert}</div>
                <div className="text-[11px] text-muted-foreground">{k.titel}</div>
              </button>
            ))}
          </div>

          {/* ── Suche + Schnellgriffe ──────────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Name, E-Mail, Durchwahl, Corp ID …"
                className="pl-7 pr-2 py-1.5 w-60 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
              <input type="checkbox" className="accent-primary"
                checked={!aus.typ?.has(TYP_TEXT.gruppe)}
                onChange={e => setAus(a => {
                  const typ = new Set(a.typ ?? [])
                  if (e.target.checked) typ.delete(TYP_TEXT.gruppe); else typ.add(TYP_TEXT.gruppe)
                  return { ...a, typ }
                })} />
              Gruppenleitungen einblenden
            </label>
            <button onClick={() => { setAus(vorgabeFilter()); setSuche('') }} disabled={!filterAktiv} className={KNOPF}>
              <X size={11} />Filter zurücksetzen
            </button>
            <button onClick={ohnePcFilter} disabled={!geraeteSuche} className={KNOPF}
              title="Personen mit Xelion-Lizenz, denen laut Endgeräte-Übersicht/Inventar kein PC oder nur ein Desktop Mini zugewiesen ist (Filter in der Spalte „Zugewiesene Geräte“ anpassbar)">
              {geraeteSuche ? <Monitor size={11} /> : <Loader2 size={11} className="animate-spin" />}Lizenz ohne PC / nur Mini
            </button>
            <button onClick={() => setAusw(alleSichtbaren(sichtbareIds))} disabled={!gefiltert.length} className={KNOPF}>
              <CheckSquare size={11} />Alle sichtbaren auswählen
            </button>
            <button onClick={() => void pcPruefen(gefiltertePersonen)} disabled={!gefiltertePersonen.length || !!pcLauf || prueftAd} className={KNOPF}
              title="Für alle gerade angezeigten Personen (mit AD-Konto) prüfen, ob Xelion an ihren PCs installiert ist und wann es zuletzt benutzt wurde">
              <Monitor size={11} />PC-Prüfung für alle gefilterten ({gefiltertePersonen.length})
            </button>
          </div>

          {anzahlAuswahlLeiste()}

          {pcLauf && (
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-border bg-muted/20 text-[11px] text-foreground">
              <Loader2 size={13} className="animate-spin shrink-0" />
              <span className="flex-1">{pcLauf.text}{pcLauf.gesamt > 0 && <> · {pcLauf.fertig} / {pcLauf.gesamt} PCs</>}</span>
              <button onClick={() => { pcAbbruch.current = true; setPcLauf(p => p && { ...p, text: 'wird nach dem laufenden Block abgebrochen …' }) }}
                className="px-2 py-0.5 rounded border border-border hover:bg-accent">Abbrechen</button>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            <b className="text-foreground">{gefiltert.length}</b> von {zeilen.length} Einträgen
            {ausw.auswahl.size > 0 && <> · {ausw.auswahl.size} ausgewählt</>}
            {' '}· Filter stecken in den Überschriften (Trichter). Auswahl mit Klick, Strg+Klick, Umschalt+Klick.
          </p>

          {/* ── Tabelle ────────────────────────────────────────────────────── */}
          <div className="rounded-lg border border-border overflow-auto max-h-[62vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card border-b border-border z-10">
                <tr className="text-left">
                  {SPALTEN_DEF.map(d => (
                    <th key={d.id} className="px-2.5 py-2 align-bottom whitespace-nowrap">
                      <KopfFilter titel={d.titel} werte={werte[d.id]} leerText={d.leerText}
                        ausgeblendet={aus[d.id] ?? KEIN_FILTER} onChange={neu => setzeAus(d.id, neu)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {!gefiltert.length && (
                  <tr><td colSpan={SPALTEN_DEF.length} className="px-3 py-8 text-center text-muted-foreground">Kein Eintrag passt zu den gesetzten Filtern.</td></tr>
                )}
                {gefiltert.map(z => {
                  const gewaehlt = ausw.auswahl.has(z.key)
                  const hosts = z.ad.sam ? Object.entries(pcDatei?.nachSam[z.ad.sam.toLowerCase()]?.hosts ?? {}) : []
                  return (
                    <tr key={z.key} onClick={e => zeileGeklickt(e, z.key)}
                      className={`cursor-default align-top ${gewaehlt ? 'bg-foreground/15' : 'hover:bg-accent/20'}`}>
                      <td className={`px-2.5 py-1.5 border-l-2 whitespace-nowrap text-muted-foreground ${gewaehlt ? 'border-foreground' : 'border-transparent'}`}>{TYP_TEXT[z.typ]}</td>
                      <td className="px-2.5 py-1.5 text-foreground">
                        <span className="inline-flex items-center gap-1">
                          {z.name}
                          {z.typ === 'person' && <PersonInfoButton name={z.ad.anzeigename || z.name} sam={z.ad.sam || undefined} />}
                        </span>
                        {mailProtokoll[z.key]?.length ? (() => {
                          const m = mailProtokoll[z.key]
                          const l = m[m.length - 1]
                          return (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground"
                              title={m.map(x => `${new Date(x.am).toLocaleString('de-DE')} · ${x.von} · ${x.betreff}`).join('\n')}>
                              <Mail size={9} />angeschrieben {new Date(l.am).toLocaleDateString('de-DE')}{m.length > 1 ? ` (${m.length}×)` : ''}
                            </span>
                          )
                        })() : null}
                        {z.typ === 'gruppe' && z.mitglieder.length > 0 && (
                          <span className="block text-[10px] text-muted-foreground" title={z.mitglieder.join('\n')}>{z.mitglieder.length} Mitglieder</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-foreground break-all">{z.userName || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-2.5 py-1.5 text-foreground">{z.ad.abteilung || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-2.5 py-1.5"><span className={`${CHIP} ${z.lizenz === 'ja' ? 'font-semibold' : ''}`}>{LIZENZ_TEXT[z.lizenz]}</span></td>
                      <td className="px-2.5 py-1.5 font-mono text-foreground whitespace-nowrap" title={z.nummern.map(n => '+' + n).join('\n')}>
                        {z.durchwahlen.join(', ') || (z.nummern.length ? `+${z.nummern[0]}` : <span className="text-muted-foreground font-sans">—</span>)}
                      </td>
                      <td className="px-2.5 py-1.5 text-foreground">{vergabeText(z) || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-2.5 py-1.5 font-mono text-foreground whitespace-nowrap">{adNummerText(z) || <span className="text-muted-foreground font-sans">—</span>}</td>
                      <td className="px-2.5 py-1.5"><span className={CHIP} title={z.ad.quelle ? `gefunden über: ${z.ad.quelle}` : undefined}>{AD_TEXT[z.ad.befund]}</span>
                        {z.ad.sam && <span className="block text-[10px] font-mono text-muted-foreground">{z.ad.sam}</span>}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground whitespace-nowrap">{z.ad.befund === 'entfaellt' || z.ad.befund === 'ungeprueft' ? '—' : zuletztOnlineText(z.ad.lastLogon)}</td>
                      <td className="px-2.5 py-1.5 text-foreground">
                        {z.ad.xelionGruppen === null ? <span className="text-muted-foreground">—</span>
                          : z.ad.xelionGruppen.length ? z.ad.xelionGruppen.join(', ') : <span className="text-muted-foreground">keine</span>}
                      </td>
                      <td className="px-2.5 py-1.5 text-foreground">{z.sammelrufe.join(', ') || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground whitespace-nowrap">{z.userStatus || '—'}</td>
                      <td className="px-2.5 py-1.5 text-foreground whitespace-nowrap">{z.umleitungAktiv ? (z.umleitung || 'aktiv') : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-2.5 py-1.5 text-foreground">
                        {z.geraete === null ? <span className="text-muted-foreground">{z.typ === 'person' && !geraeteSuche ? '…' : '—'}</span>
                          : !z.geraete.length ? <span className="font-semibold">{KEIN_PC}</span>
                          : z.geraete.map(g => (
                            <span key={g.hostname} className="flex items-center gap-1 whitespace-nowrap" title={[g.model, g.serial && `SN ${g.serial}`].filter(Boolean).join(' · ')}>
                              <span className={g.typ === 'Desktop Mini' ? 'font-semibold' : ''}>{g.typ}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">{g.hostname}</span>
                              <DeviceInfoButton hostname={g.hostname} serial={g.serial} size={10} />
                            </span>
                          ))}
                      </td>
                      <td className="px-2.5 py-1.5 text-foreground">
                        {z.pc.zustand === 'ungeprueft' ? <span className="text-muted-foreground">—</span> : (
                          <>
                            <span title={z.pc.geprueftAm ? `geprüft ${new Date(z.pc.geprueftAm).toLocaleString('de-DE')}${z.pc.frisch ? '' : ' — älter als 30 Tage, zählt nicht für die Empfehlung'}` : undefined}
                              className={z.pc.frisch ? '' : 'text-muted-foreground'}>{z.pc.text}</span>
                            {hosts.map(([h, b]) => (
                              <span key={h} className="flex items-center gap-1 text-[10px] text-muted-foreground"
                                title={[b.version && `Xelion ${b.version}`, b.installState, b.quelle && `Spur: ${b.quelle}`, b.profilZuletzt && `zuletzt angemeldet ${new Date(b.profilZuletzt).toLocaleDateString('de-DE')}`, b.fehler].filter(Boolean).join(' · ')}>
                                <span className="font-mono">{h}</span><DeviceInfoButton hostname={h} size={10} />
                                {b.erreichbar ? (b.installiert ? (b.laeuft ? 'läuft' : 'installiert') : b.reste ? 'nur Reste' : 'nicht inst.') : 'nicht erreichbar'}
                              </span>
                            ))}
                          </>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-[10px] text-foreground max-w-[18rem]">
                        {z.hinweise.length ? <ul className="list-disc pl-3 space-y-0.5">{z.hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2.5 py-1.5 max-w-[20rem]">
                        <span className={`${CHIP} ${z.empfehlung === 'kuendbar' ? 'font-semibold' : ''}`}>{EMPFEHLUNG_TEXT[z.empfehlung]}</span>
                        <span className="block mt-0.5 text-[10px] text-muted-foreground">{z.grund}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {mailAn && (
        <XelionMailDialog empfaenger={mailAn} absender={ich} protokoll={mailProtokoll}
          onClose={() => setMailAn(null)} onProtokoll={setMailProtokoll} />
      )}

      {/* ── Import-Vorschau ──────────────────────────────────────────────────── */}
      {vorschau && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-5 w-[560px] max-h-[85vh] overflow-y-auto space-y-3 shadow-2xl">
            <h2 className="text-base font-semibold text-foreground">Lizenzliste übernehmen?</h2>
            <p className="text-xs text-muted-foreground font-mono break-all">{vorschau.datei}</p>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-border/60">
                {([
                  ['Zeilen in der Datei', vorschau.statistik.zeilen],
                  ['Personen', vorschau.statistik.personen],
                  ['  · Lizenz Ja mit Rufnummer', vorschau.statistik.personJaMitNummer],
                  ['  · Lizenz Ja ohne Rufnummer', vorschau.statistik.personJaOhneNummer],
                  ['  · ohne Lizenz mit Rufnummer', vorschau.statistik.personNeinMitNummer],
                  ['  · ohne Lizenz, ohne Rufnummer', vorschau.statistik.personNeinOhneNummer],
                  ['Funktionskonten', vorschau.statistik.funktion],
                  ['Leitungen ohne Benutzer', vorschau.statistik.ohneUser],
                  ['Sammelrufe (Mitgliedszeilen)', `${vorschau.statistik.gruppen} (${vorschau.statistik.gruppenZeilen})`],
                  ['Chat-Leitungen', vorschau.statistik.chatZeilen],
                  ['Bezahlte Lizenzen gesamt', vorschau.statistik.lizenzJaGesamt],
                ] as [string, number | string][]).map(([k, v]) => (
                  <tr key={k}><td className="py-1 text-foreground whitespace-pre">{k}</td><td className="py-1 text-right font-mono text-foreground">{v}</td></tr>
                ))}
              </tbody>
            </table>
            {vorschau.warnungen.map((w, i) => <p key={i} className="flex items-start gap-1.5 text-[11px] text-foreground"><AlertTriangle size={12} className="shrink-0 mt-px" />{w}</p>)}
            {vorschau.vergleich && (
              <div className="text-[11px] text-foreground space-y-1 rounded-md border border-border bg-muted/20 p-2.5">
                <p className="font-semibold">Gegenüber dem vorigen Import</p>
                <p>neu: {vorschau.vergleich.neu.length} · weggefallen: {vorschau.vergleich.weg.length} · Lizenz geändert: {vorschau.vergleich.lizenzGeaendert.length}</p>
                {vorschau.vergleich.lizenzGeaendert.slice(0, 12).map(x => <p key={x.name} className="text-muted-foreground">{x.name}: {x.vorher} → {x.nachher}</p>)}
                {vorschau.vergleich.weg.length > 0 && <p className="text-muted-foreground" title={vorschau.vergleich.weg.join('\n')}>weggefallen u. a.: {vorschau.vergleich.weg.slice(0, 8).join(', ')}{vorschau.vergleich.weg.length > 8 ? ' …' : ''}</p>}
              </div>
            )}
            {verdaechtig && (
              <label className="flex items-start gap-2 text-[11px] text-foreground">
                <input type="checkbox" className="accent-primary mt-0.5" checked={verdachtOk} onChange={e => setVerdachtOk(e.target.checked)} />
                <span>Mehr als {Math.round(VERDAECHTIG_ANTEIL * 100)} % der bisherigen Einträge fehlen in der neuen Datei. Ist das wirklich die vollständige Liste?</span>
              </label>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setVorschau(null)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground">Abbrechen</button>
              <button onClick={() => void importUebernehmen()} disabled={verdaechtig && !verdachtOk}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">Übernehmen und prüfen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  function anzahlAuswahlLeiste() {
    if (!ausw.auswahl.size) return null
    return (
      <div className="flex items-center gap-2 flex-wrap px-2.5 py-2 rounded-md border border-border bg-muted/20">
        <span className="text-[11px] text-foreground"><b>{ausw.auswahl.size}</b> ausgewählt</span>
        <button onClick={() => void pcPruefen(ausgewaehltePersonen)} disabled={!ausgewaehltePersonen.length || !!pcLauf || prueftAd}
          title={ausgewaehltePersonen.length ? 'Xelion an den PCs dieser Personen prüfen' : 'In der Auswahl ist keine Person mit AD-Konto'}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-border text-foreground hover:bg-accent disabled:opacity-40">
          <Monitor size={10} />PC-Prüfung für Auswahl ({ausgewaehltePersonen.length})
        </button>
        <button onClick={mailDialogOeffnen} disabled={!ausgewaehlt.some(z => z.typ === 'person')}
          title="Persönliche Mail (mit Vorname, per du) an die ausgewählten Personen — Text vorher anpassbar"
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-border text-foreground hover:bg-accent disabled:opacity-40">
          <Mail size={10} />Mail an Auswahl ({ausgewaehlt.filter(z => z.typ === 'person').length})
        </button>
        <button onClick={() => void exportiere('xlsx', true)} disabled={exportLaeuft || !ausgewaehlt.length}
          title="Nur die ausgewählten Zeilen als Excel exportieren"
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-border text-foreground hover:bg-accent disabled:opacity-40">
          <FileSpreadsheet size={10} />Excel für Auswahl ({ausgewaehlt.length})
        </button>
        <button onClick={() => void exportiere('pdf', true)} disabled={exportLaeuft || !ausgewaehlt.length}
          title="Nur die ausgewählten Zeilen als PDF exportieren"
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-border text-foreground hover:bg-accent disabled:opacity-40">
          <FileText size={10} />PDF für Auswahl ({ausgewaehlt.length})
        </button>
        <button onClick={() => setAusw(leereAuswahl())}
          className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-border text-foreground hover:bg-accent">
          <X size={10} />Auswahl aufheben
        </button>
      </div>
    )
  }
}
