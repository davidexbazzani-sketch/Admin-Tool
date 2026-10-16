// ── NIS2 → Kachel „Awareness-Schulung" ───────────────────────────────────────
// Excel hochladen → Stand der Schulung (abgeschlossen / offen). Für die Offenen
// AD-Abgleich: Konto aktiv/inaktiv, Abteilung, direkter Vorgesetzter. Reiter
// „Nach Manager": je Vorgesetztem eine Mail (direkt senden ODER in Outlook öffnen),
// jede Benachrichtigung wird mit Zeitpunkt protokolliert (geteilt für alle Admins).

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft, GraduationCap, FileSpreadsheet, Loader2, RefreshCw, Search, Mail, Send,
  ExternalLink, CheckCircle2, AlertTriangle, Users, UserX, UserCheck, HelpCircle, Clock, Settings2, X,
} from 'lucide-react'
import { api } from '../../electronAPI'
import { useAuthStore } from '../../store/authStore'
import { PersonInfoButton } from '../person/PersonDossier'
import { KopfFilter } from '../KopfFilter'
import { openFileForImport } from '../../utils/fileImport'
import { foldName } from '../../utils/nameMatch'
import { logDossierAction } from '../../services/personDossier'
import {
  loadAwareness, parseAwarenessWorkbook, importiereAwareness, adAbgleich, speichereAdErgebnis,
  protokolliereKontakt, speichereEinstellungen, baueManagerMail, mailZuHtml, STANDARD_CC, STANDARD_LINK, LINK_TEXT,
  type AwarenessStand, type AwarenessPerson, type AdInfo, type ManagerKontakt, type AwarenessEinstellungen,
} from '../../services/nis2Awareness'

type Konto = 'aktiv' | 'inaktiv' | 'nicht im AD' | 'nicht geprüft'
type Reiter = 'offen' | 'manager' | 'abgeschlossen'
type FilterId = 'art' | 'konto' | 'abteilung' | 'manager'
const LEER = new Set<string>()
const GRUPPE = 10   // Sammelversand in 10er-Gruppen (Projektregel Bulk-Ops)

function fmt(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function kontoVon(ad: AdInfo | undefined): Konto {
  if (!ad) return 'nicht geprüft'
  if (!ad.found) return 'nicht im AD'
  return ad.enabled ? 'aktiv' : 'inaktiv'
}

interface OffenZeile { p: AwarenessPerson; ad?: AdInfo; konto: Konto; letzterKontakt?: ManagerKontakt }
interface ManagerGruppe { mail: string; name: string; sam?: string; personen: OffenZeile[]; kontakte: ManagerKontakt[] }

export default function AwarenessView({ onBack }: { onBack: () => void }) {
  const user = useAuthStore(s => s.session?.user)
  const ich = user?.displayName || user?.username || 'unbekannt'

  const [stand, setStand] = useState<AwarenessStand | null>(null)
  const [laden, setLaden] = useState(true)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  const [importiert, setImportiert] = useState(false)
  const [adLauf, setAdLauf] = useState<{ done: number; total: number } | null>(null)
  const [reiter, setReiter] = useState<Reiter>('offen')
  const [suche, setSuche] = useState('')
  const [aus, setAus] = useState<Partial<Record<FilterId, Set<string>>>>({})
  const [mail, setMail] = useState<ManagerGruppe | null>(null)
  const [sammel, setSammel] = useState(false)
  const [einstOffen, setEinstOffen] = useState(false)

  const neuLaden = useCallback(async () => {
    setLaden(true)
    try { setStand(await loadAwareness()) } finally { setLaden(false) }
  }, [])
  useEffect(() => { void neuLaden() }, [neuLaden])

  const einst: AwarenessEinstellungen = { reminderAnzahl: 2, cc: STANDARD_CC, link: STANDARD_LINK, ...stand?.einstellungen }

  // ── Import + AD ────────────────────────────────────────────────────────────
  async function adStarten(basis: AwarenessStand) {
    const offen = basis.personen.filter(p => p.status === 'offen')
    if (!offen.length) return
    setAdLauf({ done: 0, total: offen.length })
    try {
      const r = await adAbgleich(offen, (done, total) => setAdLauf({ done, total }))
      const neu = await speichereAdErgebnis(r, ich)
      if (neu) setStand(neu)
      const gef = Object.values(r).filter(x => x.found).length
      setMeldung({ ok: true, text: `AD-Abgleich fertig: ${gef} von ${offen.length} offenen Personen im AD gefunden.` })
    } finally { setAdLauf(null) }
  }

  async function hochladen() {
    setMeldung(null)
    try {
      const f = await openFileForImport()
      if (!f) return
      if (!['xlsx', 'xls'].includes(f.ext)) { setMeldung({ ok: false, text: 'Bitte die Excel-Schulungsübersicht (.xlsx) wählen.' }); return }
      setImportiert(true)
      const p = parseAwarenessWorkbook(f.bytes)
      if (!p.personen.length) { setMeldung({ ok: false, text: p.hinweis || 'Keine Personen in der Datei gefunden.' }); return }
      const name = f.filePath.split(/[\\/]/).pop() || f.filePath
      const neu = await importiereAwareness(p, name, ich)
      if (!neu) { setMeldung({ ok: false, text: 'Speichern auf dem Netzlaufwerk fehlgeschlagen.' }); return }
      setStand(neu)
      const offen = p.personen.filter(x => x.status === 'offen').length
      setMeldung({ ok: true, text: `${p.personen.length} Personen übernommen (Blatt „${p.quelleBlatt}"${p.standDatum ? `, Stand ${p.standDatum}` : ''}) — ${offen} offen. AD-Abgleich läuft…` })
      void adStarten(neu)
    } catch (e) {
      setMeldung({ ok: false, text: 'Datei konnte nicht gelesen werden: ' + (e instanceof Error ? e.message : String(e)) })
    } finally { setImportiert(false) }
  }

  // ── Abgeleitete Daten ──────────────────────────────────────────────────────
  const personen = stand?.personen ?? []
  const abgeschlossen = useMemo(() => personen.filter(p => p.status === 'abgeschlossen'), [personen])
  const kontakte = stand?.kontakte ?? []

  const offenZeilen: OffenZeile[] = useMemo(() => {
    const byKey = stand?.ad?.byKey ?? {}
    return personen.filter(p => p.status === 'offen').map(p => {
      const ad = byKey[p.key]
      const letzter = [...kontakte].reverse().find(k => k.personen.includes(p.key))
      return { p, ad, konto: kontoVon(ad), letzterKontakt: letzter }
    })
  }, [personen, stand, kontakte])

  // Manager-Gruppen: nur AKTIVE Konten mit Vorgesetztem + Mailadresse
  const gruppen: ManagerGruppe[] = useMemo(() => {
    const m = new Map<string, ManagerGruppe>()
    for (const z of offenZeilen) {
      if (z.konto !== 'aktiv' || !z.ad?.managerMail) continue
      const k = z.ad.managerMail.toLowerCase()
      if (!m.has(k)) m.set(k, { mail: z.ad.managerMail, name: z.ad.managerName || z.ad.managerMail, sam: z.ad.managerSam, personen: [], kontakte: [] })
      m.get(k)!.personen.push(z)
    }
    for (const g of m.values()) g.kontakte = kontakte.filter(k => k.managerMail.toLowerCase() === g.mail.toLowerCase())
    return [...m.values()].sort((a, b) => b.personen.length - a.personen.length || a.name.localeCompare(b.name))
  }, [offenZeilen, kontakte])
  const ohneManager = offenZeilen.filter(z => z.konto === 'aktiv' && !z.ad?.managerMail)

  const zahlen = useMemo(() => ({
    gesamt: personen.length, ab: abgeschlossen.length, offen: offenZeilen.length,
    aktiv: offenZeilen.filter(z => z.konto === 'aktiv').length,
    inaktiv: offenZeilen.filter(z => z.konto === 'inaktiv').length,
    nichtAd: offenZeilen.filter(z => z.konto === 'nicht im AD').length,
    ungeprueft: offenZeilen.filter(z => z.konto === 'nicht geprüft').length,
  }), [personen, abgeschlossen, offenZeilen])
  const quote = zahlen.gesamt ? Math.round((zahlen.ab / zahlen.gesamt) * 100) : 0

  // ── Offen-Tabelle: Suche + Kopf-Filter (Zählwerte über alle ANDEREN Filter) ──
  const suchWoerter = foldName(suche).split(/[\s,;]+/).filter(Boolean)
  const filterDefs: { id: FilterId; titel: string; wert: (z: OffenZeile) => string; leerText?: string }[] = [
    { id: 'art', titel: 'Intern/Extern', wert: z => z.p.art },
    { id: 'konto', titel: 'Konto', wert: z => z.konto },
    { id: 'abteilung', titel: 'Abteilung', wert: z => z.ad?.department || '', leerText: '(ohne)' },
    { id: 'manager', titel: 'Manager', wert: z => z.ad?.managerName || '', leerText: '(ohne)' },
  ]
  const trifft = (texte: string[]) => !suchWoerter.length || (() => { const t = foldName(texte.join(' ')); return suchWoerter.every(w => t.includes(w)) })()
  const { zeilen, werte } = useMemo(() => {
    const passt = (f: typeof filterDefs[number], z: OffenZeile) => !(aus[f.id]?.has(f.wert(z)))
    const sucht = (z: OffenZeile) => trifft([z.p.name, z.p.email, z.ad?.department || '', z.ad?.managerName || ''])
    const werte = {} as Record<FilterId, Map<string, number>>
    for (const f of filterDefs) {
      werte[f.id] = new Map(offenZeilen.map(z => [f.wert(z), 0]))
      for (const z of offenZeilen) {
        if (!sucht(z) || !filterDefs.every(x => x.id === f.id || passt(x, z))) continue
        werte[f.id].set(f.wert(z), (werte[f.id].get(f.wert(z)) ?? 0) + 1)
      }
    }
    return { zeilen: offenZeilen.filter(z => sucht(z) && filterDefs.every(f => passt(f, z))), werte }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offenZeilen, aus, suche])
  const abZeilen = useMemo(() => abgeschlossen.filter(p => trifft([p.name, p.email, p.art])), [abgeschlossen, suche]) // eslint-disable-line react-hooks/exhaustive-deps
  const gruppenGefiltert = useMemo(() => gruppen.filter(g => trifft([g.name, g.mail, ...g.personen.map(z => z.p.name)])), [gruppen, suche]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mail ───────────────────────────────────────────────────────────────────
  function mailFuer(g: ManagerGruppe) {
    return baueManagerMail({
      managerName: g.name,
      personen: g.personen.map(z => ({ name: z.ad?.displayName && !z.ad.displayName.includes(',') ? z.ad.displayName : z.p.name, department: z.ad?.department })),
      standDatum: stand?.standDatum, frist: einst.frist, link: einst.link, reminderAnzahl: einst.reminderAnzahl, absender: ich,
    })
  }

  async function protokolliere(g: ManagerGruppe, art: ManagerKontakt['art']) {
    const neu = await protokolliereKontakt({ at: new Date().toISOString(), by: ich, managerMail: g.mail, managerName: g.name, personen: g.personen.map(z => z.p.key), art })
    if (neu) setStand(neu)
    if (art === 'gesendet') void logDossierAction(g.name, g.sam, `NIS2-Awareness: an ${g.personen.length} offene Schulung(en) im Team erinnert (${g.personen.map(z => z.p.name).join(', ')})`, ich, 'NIS2')
  }

  if (laden) return <div className="flex items-center justify-center h-full gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />Lade Schulungsstand…</div>

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Kopf */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"><ChevronLeft size={18} /></button>
        <GraduationCap size={22} className="text-emerald-400" />
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-lg font-bold text-foreground">Awareness-Schulung</h1>
          <p className="text-xs text-muted-foreground">
            {stand ? <>Datei <b>{stand.filename}</b>{stand.standDatum && <> · Stand {stand.standDatum}</>} · hochgeladen {fmt(stand.importedAt)} von {stand.importedBy}{stand.ad && <> · AD-Abgleich {fmt(stand.ad.checkedAt)}</>}</> : 'Noch keine Schulungsübersicht hochgeladen.'}
          </p>
        </div>
        {stand && (
          <button onClick={() => void adStarten(stand)} disabled={!!adLauf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50">
            {adLauf ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}{adLauf ? `AD ${adLauf.done}/${adLauf.total}` : 'AD neu abgleichen'}
          </button>
        )}
        <button onClick={() => void hochladen()} disabled={importiert || !!adLauf}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {importiert ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}Excel hochladen
        </button>
      </div>

      {meldung && (
        <div className={`mx-6 mt-3 rounded-md border px-3 py-2 text-xs ${meldung.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>{meldung.text}</div>
      )}

      {!stand ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-2">
            <FileSpreadsheet size={36} className="mx-auto text-muted-foreground" />
            <p className="text-sm text-foreground">Lade die Datei <b>Schulungsübersicht_Awareness-Schulungen.xlsx</b> hoch.</p>
            <p className="text-xs text-muted-foreground">Gelesen wird das Blatt „Mitarbeiterabgleich" (sonst „Schulungsübersicht" + „Fehlende Mitarbeitende"). Danach prüft das Tool für alle Offenen im AD: Konto aktiv/inaktiv, Abteilung und Vorgesetzten.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col px-6 py-4 gap-3">
          {/* Kennzahlen */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 shrink-0">
            <Kachel icon={<Users size={15} />} titel="Gesamt" wert={zahlen.gesamt} />
            <Kachel icon={<CheckCircle2 size={15} />} titel="Abgeschlossen" wert={zahlen.ab} zusatz={`${quote} %`} farbe="text-emerald-300" />
            <Kachel icon={<Clock size={15} />} titel="Noch offen" wert={zahlen.offen} farbe="text-amber-300" />
            <Kachel icon={<UserCheck size={15} />} titel="… davon Konto aktiv" wert={zahlen.aktiv} zusatz="anschreiben" />
            <Kachel icon={<UserX size={15} />} titel="… davon Konto inaktiv" wert={zahlen.inaktiv} zusatz="vermutl. ausgeschieden" farbe="text-red-300" />
            <Kachel icon={<HelpCircle size={15} />} titel="… nicht im AD" wert={zahlen.nichtAd + zahlen.ungeprueft} zusatz={zahlen.ungeprueft ? `${zahlen.ungeprueft} ungeprüft` : undefined} />
          </div>
          <div className="h-2 rounded-full bg-muted/40 overflow-hidden shrink-0"><div className="h-full bg-emerald-500" style={{ width: `${quote}%` }} /></div>

          {/* Reiter + Suche */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <ReiterKnopf aktiv={reiter === 'offen'} onClick={() => setReiter('offen')}>Noch offen ({zahlen.offen})</ReiterKnopf>
            <ReiterKnopf aktiv={reiter === 'manager'} onClick={() => setReiter('manager')}>Nach Manager ({gruppen.length})</ReiterKnopf>
            <ReiterKnopf aktiv={reiter === 'abgeschlossen'} onClick={() => setReiter('abgeschlossen')}>Abgeschlossen ({zahlen.ab})</ReiterKnopf>
            <div className="relative ml-auto">
              <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Suchen…"
                className="pl-7 pr-2 py-1.5 text-xs rounded-md border border-border bg-background w-56 focus:outline-none focus:border-primary" />
            </div>
          </div>

          {reiter === 'offen' && (
            <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs border-separate border-spacing-0">
                <thead className="sticky top-0 z-10 bg-card text-muted-foreground">
                  <tr>
                    <th className="text-left font-semibold px-2.5 py-2 border-b border-border">Name</th>
                    {filterDefs.map(f => (
                      <th key={f.id} className="text-left font-semibold px-2.5 py-2 border-b border-border">
                        <KopfFilter titel={f.titel} werte={werte[f.id]} ausgeblendet={aus[f.id] ?? LEER} leerText={f.leerText}
                          onChange={neu => setAus(a => ({ ...a, [f.id]: neu }))} />
                      </th>
                    ))}
                    <th className="text-left font-semibold px-2.5 py-2 border-b border-border">Manager benachrichtigt</th>
                  </tr>
                </thead>
                <tbody>
                  {zeilen.map(z => (
                    <tr key={z.p.key} className="hover:bg-accent/10">
                      <td className="px-2.5 py-1.5 border-b border-border">
                        <span className="inline-flex items-center gap-1 text-foreground font-medium">{z.p.name}<PersonInfoButton name={z.ad?.displayName || z.p.name} sam={z.ad?.sam} /></span>
                        <span className="block text-[10px] text-muted-foreground">{z.p.email}</span>
                      </td>
                      <td className="px-2.5 py-1.5 border-b border-border text-foreground/90">{z.p.art || '—'}</td>
                      <td className="px-2.5 py-1.5 border-b border-border"><KontoBadge konto={z.konto} quelle={z.ad?.quelle} /></td>
                      <td className="px-2.5 py-1.5 border-b border-border text-foreground/90">{z.ad?.department || '—'}</td>
                      <td className="px-2.5 py-1.5 border-b border-border text-foreground/90">
                        {z.ad?.managerName ? <span className="inline-flex items-center gap-1">{z.ad.managerName}<PersonInfoButton name={z.ad.managerName} sam={z.ad.managerSam} /></span> : '—'}
                      </td>
                      <td className="px-2.5 py-1.5 border-b border-border text-foreground/90 whitespace-nowrap">
                        {z.letzterKontakt ? <span title={`${z.letzterKontakt.art === 'gesendet' ? 'gesendet' : 'in Outlook geöffnet'} von ${z.letzterKontakt.by}`}>{fmt(z.letzterKontakt.at)}{z.letzterKontakt.art === 'entwurf' ? ' (Outlook)' : ''}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                  {!zeilen.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Keine Treffer.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {reiter === 'abgeschlossen' && (
            <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs border-separate border-spacing-0">
                <thead className="sticky top-0 z-10 bg-card text-muted-foreground">
                  <tr>{['Name', 'Intern/Extern', 'Abgeschlossen am', 'Ergebnis'].map(h => <th key={h} className="text-left font-semibold px-2.5 py-2 border-b border-border">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {abZeilen.map(p => (
                    <tr key={p.key} className="hover:bg-accent/10">
                      <td className="px-2.5 py-1.5 border-b border-border"><span className="inline-flex items-center gap-1 text-foreground">{p.name}<PersonInfoButton name={p.name} /></span></td>
                      <td className="px-2.5 py-1.5 border-b border-border text-foreground/90">{p.art || '—'}</td>
                      <td className="px-2.5 py-1.5 border-b border-border text-foreground/90">{p.datum || '—'}</td>
                      <td className="px-2.5 py-1.5 border-b border-border text-foreground/90">{p.ergebnis || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {reiter === 'manager' && (
            <div className="flex-1 min-h-0 overflow-auto space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <p className="text-xs text-muted-foreground flex-1 min-w-[260px]">
                  Je Vorgesetztem eine Mail mit seinen offenen Mitarbeitenden (nur <b>aktive</b> Konten; Vorgesetzter = <i>Manager</i> im AD, eine Ebene darüber). CC: <b>{einst.cc || '—'}</b>
                  {einst.frist && <> · Frist {einst.frist}</>}
                </p>
                <button onClick={() => setEinstOffen(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent"><Settings2 size={13} />Text-Einstellungen</button>
                <button onClick={() => setSammel(true)} disabled={!gruppen.length}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"><Send size={13} />Alle Manager anschreiben…</button>
              </div>

              {gruppenGefiltert.map(g => {
                const letzter = g.kontakte[g.kontakte.length - 1]
                return (
                  <div key={g.mail} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground inline-flex items-center gap-1">{g.name}<PersonInfoButton name={g.name} sam={g.sam} /></span>
                      <span className="text-[11px] text-muted-foreground">{g.mail}</span>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">{g.personen.length} offen</span>
                      <span className={`ml-auto text-[11px] ${letzter ? 'text-emerald-300' : 'text-muted-foreground'}`}
                        title={g.kontakte.map(k => `${fmt(k.at)} · ${k.art === 'gesendet' ? 'gesendet' : 'in Outlook geöffnet'} · ${k.by}`).join('\n')}>
                        {letzter ? `benachrichtigt ${fmt(letzter.at)}${letzter.art === 'entwurf' ? ' (in Outlook geöffnet)' : ''}${g.kontakte.length > 1 ? ` · ${g.kontakte.length}×` : ''}` : 'noch nicht benachrichtigt'}
                      </span>
                      <button onClick={() => setMail(g)} className="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-md border border-border text-foreground hover:bg-accent"><Mail size={13} />Mail…</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {g.personen.map(z => (
                        <span key={z.p.key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/30 text-[11px] text-foreground/90">
                          {z.p.name}{z.ad?.department && <span className="text-muted-foreground">· {z.ad.department}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}

              {(ohneManager.length > 0 || zahlen.inaktiv > 0) && (
                <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground space-y-1">
                  {ohneManager.length > 0 && <p><AlertTriangle size={12} className="inline text-amber-400" /> <b>{ohneManager.length}</b> aktive Konten ohne Vorgesetzten (oder ohne Mail) im AD — von Hand klären: {ohneManager.map(z => z.p.name).join(', ')}</p>}
                  {zahlen.inaktiv > 0 && <p><UserX size={12} className="inline text-red-400" /> <b>{zahlen.inaktiv}</b> offene Personen mit <b>inaktivem</b> Konto werden nicht an Manager gemeldet (vermutlich ausgeschieden — aus der Liste nehmen).</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {mail && (
        <MailDialog g={mail} vorschlag={mailFuer(mail)} cc={einst.cc || ''} link={einst.link} onClose={() => setMail(null)}
          onErledigt={async (art) => { await protokolliere(mail, art); setMail(null); setMeldung({ ok: true, text: art === 'gesendet' ? `Mail an ${mail.name} gesendet.` : `Mail an ${mail.name} in Outlook geöffnet — bitte dort absenden.` }) }} />
      )}
      {sammel && (
        <SammelDialog gruppen={gruppen} mailFuer={mailFuer} cc={einst.cc || ''} link={einst.link} onClose={() => setSammel(false)} protokolliere={protokolliere}
          onFertig={(n, fehler) => { setSammel(false); setMeldung({ ok: !fehler, text: `${n} Manager angeschrieben${fehler ? ` · ${fehler} fehlgeschlagen` : ''}.` }) }} />
      )}
      {einstOffen && stand && (
        <EinstellungenDialog einst={einst} onClose={() => setEinstOffen(false)}
          onSpeichern={async e => { const neu = await speichereEinstellungen(e); if (neu) setStand(neu); setEinstOffen(false) }} />
      )}
    </div>
  )
}

// ── Bausteine ─────────────────────────────────────────────────────────────────

function Kachel({ icon, titel, wert, zusatz, farbe }: { icon: React.ReactNode; titel: string; wert: number; zusatz?: string; farbe?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">{icon}{titel}</p>
      <p className={`text-xl font-bold ${farbe ?? 'text-foreground'}`}>{wert}{zusatz && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{zusatz}</span>}</p>
    </div>
  )
}

function ReiterKnopf({ aktiv, onClick, children }: { aktiv: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`px-3 py-1.5 text-xs rounded-md border ${aktiv ? 'border-primary/60 bg-primary/10 text-foreground font-semibold' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'}`}>{children}</button>
}

function KontoBadge({ konto, quelle }: { konto: Konto; quelle?: 'domain' | 'gc' }) {
  const stil = konto === 'aktiv' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    : konto === 'inaktiv' ? 'bg-red-500/15 text-red-300 border-red-500/30'
    : 'bg-muted/30 text-muted-foreground border-border'
  return <span title={quelle === 'gc' ? 'forestweit gefunden (andere Domäne)' : undefined} className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${stil}`}>{konto}</span>
}

function MailDialog({ g, vorschlag, cc: ccStart, link, onClose, onErledigt }: {
  g: ManagerGruppe; vorschlag: { subject: string; body: string }; cc: string; link?: string
  onClose: () => void; onErledigt: (art: ManagerKontakt['art']) => Promise<void>
}) {
  const [to, setTo] = useState(g.mail)
  const [cc, setCc] = useState(ccStart)
  const [subject, setSubject] = useState(vorschlag.subject)
  const [body, setBody] = useState(vorschlag.body)
  const [busy, setBusy] = useState<'' | 'senden' | 'outlook'>('')
  const [fehler, setFehler] = useState('')

  async function senden() {
    setBusy('senden'); setFehler('')
    try {
      const r = await api().sendEmailRaw({ to: to.trim(), cc: cc.trim(), subject, body: mailZuHtml(body, link), html: true, smtp: '', port: 587 })
      if (!r.success) { setFehler(r.error || 'Senden fehlgeschlagen.'); return }
      await onErledigt('gesendet')
    } finally { setBusy('') }
  }
  async function outlook() {
    setBusy('outlook'); setFehler('')
    try {
      await api().composeEmail({ to: to.trim(), cc: cc.trim(), subject, body: mailZuHtml(body, link), html: true })
      await onErledigt('entwurf')
    } finally { setBusy('') }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Mail size={16} className="text-blue-400" />
          <h3 className="text-sm font-semibold text-foreground">Mail an {g.name}</h3>
          <span className="text-[11px] text-muted-foreground">{g.personen.length} offene Mitarbeitende</span>
          <button onClick={onClose} disabled={!!busy} className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-2 overflow-auto">
          <Feld label="An" value={to} onChange={setTo} />
          <Feld label="CC" value={cc} onChange={setCc} />
          <Feld label="Betreff" value={subject} onChange={setSubject} />
          <label className="block text-[11px] text-muted-foreground">Text
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={18}
              className="w-full mt-0.5 px-2.5 py-2 text-xs rounded-md bg-background border border-border text-foreground font-mono leading-relaxed focus:outline-none focus:border-primary" />
          </label>
          {link && body.includes(LINK_TEXT) && <p className="text-[10px] text-muted-foreground">„{LINK_TEXT}“ wird in der Mail als <b>Hyperlink</b> auf die Schulung gesendet.</p>}
          {fehler && <p className="text-xs text-red-300 flex items-center gap-1"><AlertTriangle size={13} />{fehler}</p>}
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground flex-1">Beide Wege werden mit Datum/Uhrzeit protokolliert. „In Outlook öffnen" zählt als benachrichtigt, sobald das Fenster geöffnet wurde — dort bitte absenden.</p>
          <button onClick={() => void outlook()} disabled={!!busy || !to.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40">
            {busy === 'outlook' ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}In Outlook öffnen
          </button>
          <button onClick={() => void senden()} disabled={!!busy || !to.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
            {busy === 'senden' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}Direkt senden
          </button>
        </div>
      </div>
    </div>
  )
}

function SammelDialog({ gruppen, mailFuer, cc, link, onClose, protokolliere, onFertig }: {
  gruppen: ManagerGruppe[]; mailFuer: (g: ManagerGruppe) => { subject: string; body: string }; cc: string; link?: string
  onClose: () => void; protokolliere: (g: ManagerGruppe, art: ManagerKontakt['art']) => Promise<void>
  onFertig: (n: number, fehler: number) => void
}) {
  const [nurNeue, setNurNeue] = useState(true)
  const [lauf, setLauf] = useState<{ done: number; total: number; fehler: number } | null>(null)
  const ziel = gruppen.filter(g => !nurNeue || g.kontakte.length === 0)
  const personen = ziel.reduce((n, g) => n + g.personen.length, 0)

  async function los() {
    let done = 0, fehler = 0
    setLauf({ done, total: ziel.length, fehler })
    for (let i = 0; i < ziel.length; i += GRUPPE) {
      for (const g of ziel.slice(i, i + GRUPPE)) {
        const m = mailFuer(g)
        try {
          const r = await api().sendEmailRaw({ to: g.mail, cc, subject: m.subject, body: mailZuHtml(m.body, link), html: true, smtp: '', port: 587 })
          if (r.success) await protokolliere(g, 'gesendet'); else fehler++
        } catch { fehler++ }
        done++
        setLauf({ done, total: ziel.length, fehler })
      }
    }
    onFertig(done - fehler, fehler)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => !lauf && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Send size={16} className="text-blue-400" />Alle Manager anschreiben</h3>
        <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
          <input type="checkbox" checked={nurNeue} onChange={e => setNurNeue(e.target.checked)} disabled={!!lauf} className="accent-primary" />
          nur Manager, die noch <b>nicht</b> benachrichtigt wurden
        </label>
        <p className="text-xs text-muted-foreground">Es werden <b className="text-foreground">{ziel.length} Mails</b> direkt über Outlook gesendet ({personen} offene Mitarbeitende), CC: {cc || '—'}. Jede Mail wird mit Zeitpunkt protokolliert.</p>
        {lauf && (
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-muted/40 overflow-hidden"><div className="h-full bg-primary" style={{ width: `${lauf.total ? (lauf.done / lauf.total) * 100 : 0}%` }} /></div>
            <p className="text-[11px] text-muted-foreground">{lauf.done} / {lauf.total}{lauf.fehler ? ` · ${lauf.fehler} fehlgeschlagen` : ''}</p>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} disabled={!!lauf} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-40">Abbrechen</button>
          <button onClick={() => void los()} disabled={!!lauf || !ziel.length}
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
            {lauf ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}{ziel.length} Mails senden
          </button>
        </div>
      </div>
    </div>
  )
}

function EinstellungenDialog({ einst, onClose, onSpeichern }: { einst: AwarenessEinstellungen; onClose: () => void; onSpeichern: (e: AwarenessEinstellungen) => Promise<void> }) {
  const [frist, setFrist] = useState(einst.frist ?? '')
  const [link, setLink] = useState(einst.link ?? '')
  const [cc, setCc] = useState(einst.cc ?? STANDARD_CC)
  const [anzahl, setAnzahl] = useState(String(einst.reminderAnzahl ?? 2))
  const [busy, setBusy] = useState(false)
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-5 space-y-2" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Settings2 size={16} className="text-blue-400" />Text-Einstellungen (für alle Admins)</h3>
        <Feld label="Frist („bis zum …“, leer = „zeitnah“)" value={frist} onChange={setFrist} placeholder="31.10.2026" />
        <Feld label={`Link zur Schulung (wird zum Hyperlink „${LINK_TEXT}“, leer = ohne)`} value={link} onChange={setLink} placeholder={STANDARD_LINK} />
        <Feld label="CC" value={cc} onChange={setCc} />
        <Feld label="Bereits versendete Erinnerungen an die Mitarbeitenden" value={anzahl} onChange={setAnzahl} />
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Abbrechen</button>
          <button disabled={busy} onClick={async () => { setBusy(true); try { await onSpeichern({ frist: frist.trim() || undefined, link: link.trim(), cc: cc.trim(), reminderAnzahl: Math.max(0, parseInt(anzahl, 10) || 0) }) } finally { setBusy(false) } }}
            className="ml-auto px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">Speichern</button>
        </div>
      </div>
    </div>
  )
}

function Feld({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block text-[11px] text-muted-foreground">{label}
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full mt-0.5 px-2.5 py-1.5 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary" />
    </label>
  )
}
