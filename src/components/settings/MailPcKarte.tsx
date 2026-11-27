// ── Einstellungen → „Automatik & Scans“ → Mail-PCs ──────────────────────────────
// Reihenfolge der PCs, über die automatische Mails rausgehen (services/mailPc.ts). Der Automatik-PC
// ist immer die letzte Wahl. Nutzerwunsch 27.11.2026: erst Timos oder Tims PC, Davides PC zuletzt.
// Liegt hinter dem Passwort des Bereichs „Für alle“ (wie die Karte „Automatik-PC“).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, CheckCircle, AlertTriangle, Info, Loader, Mail, Plus, Trash2 } from 'lucide-react'
import Card from '../Card'
import { DeviceInfoButton } from '../device/DeviceDossier'
import { api } from '../../electronAPI'
import { herzAktiv, ladeHerzen, ladeListe, POSTAUSGANG, speichereListe, waehleMailPc, type MailPcHerz, type PostausgangMail } from '../../services/mailPc'
import { ladeTeilnehmer, type Teilnehmer } from '../../services/automatikLeiter'
import { rechnerKurz, vorzugsName, wirksameVorgabe } from '../../services/serverMelder'
import { protokolliere } from '../../services/aktivitaet'

const PC_OK = /^[A-Z0-9][A-Z0-9-]{1,14}$/
const vor = (iso: string | undefined, jetzt: number) => {
  const t = Date.parse(iso || '')
  if (isNaN(t) || t < 1000) return 'nie'
  const min = Math.max(0, Math.round((jetzt - t) / 60_000))
  if (min < 2) return 'gerade eben'
  if (min < 90) return `vor ${min} min`
  if (min < 48 * 60) return `vor ${Math.round(min / 60)} h`
  return `vor ${Math.round(min / 1440)} Tagen`
}

export default function MailPcKarte({ entsperrt, von }: { entsperrt: boolean; von: string }) {
  const [gespeichert, setGespeichert] = useState<string[]>([])
  const [reihe, setReihe] = useState<string[]>([])
  const [herzen, setHerzen] = useState<Map<string, MailPcHerz>>(new Map())
  const [teilnehmer, setTeilnehmer] = useState<Teilnehmer[]>([])
  const [postausgang, setPostausgang] = useState<{ anzahl: number; fehler: number }>({ anzahl: 0, fehler: 0 })
  const [neu, setNeu] = useState('')
  const [laedt, setLaedt] = useState(true)
  const [speichert, setSpeichert] = useState(false)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  const [jetzt, setJetzt] = useState(Date.now())

  const lade = useCallback(async (felder: boolean) => {
    const [l, t] = await Promise.all([ladeListe(), ladeTeilnehmer()])
    const namen = [...new Set([...l.reihenfolge, ...t.map(x => x.rechner)])]
    const h = await ladeHerzen(namen)
    let anzahl = 0, fehler = 0
    try {
      const dateien = ((await api().netListDirAsync(POSTAUSGANG)) || []).filter(n => /^pm_.*\.json$/.test(n))
      anzahl = dateien.length
      for (const d of dateien.slice(0, 20)) {
        const m = await api().netReadJsonAsync<PostausgangMail>(`${POSTAUSGANG}/${d}`).catch(() => null)
        if (m?.fehlschlaege?.length) fehler++
      }
    } catch { /* Netzlaufwerk */ }
    setGespeichert(l.reihenfolge); setHerzen(h); setTeilnehmer(t); setPostausgang({ anzahl, fehler }); setJetzt(Date.now())
    if (felder) setReihe(l.reihenfolge)
    setLaedt(false)
  }, [])
  useEffect(() => { void lade(true) }, [lade])
  useEffect(() => { const i = setInterval(() => { void lade(false) }, 60_000); return () => clearInterval(i) }, [lade])

  const geaendert = reihe.join('|') !== gespeichert.join('|')
  const aktuell = useMemo(() => waehleMailPc(gespeichert, herzen, jetzt), [gespeichert, herzen, jetzt])
  // der Automatik-PC ist ohnehin die letzte Wahl — als Vorschlag würde er nur wieder nach vorne rutschen
  const auswahl = useMemo(() => teilnehmer.filter(t => !reihe.includes(t.rechner) && t.rechner !== wirksameVorgabe().rechner), [teilnehmer, reihe])
  const neuKurz = rechnerKurz(neu)
  const automatik = vorzugsName()

  const schiebe = (i: number, d: -1 | 1) => setReihe(r => { const n = [...r]; const j = i + d; if (j < 0 || j >= n.length) return r; [n[i], n[j]] = [n[j], n[i]]; return n })
  const entferne = (pc: string) => setReihe(r => r.filter(x => x !== pc))
  const fuegeHinzu = (pc: string) => { const k = rechnerKurz(pc); if (!PC_OK.test(k) || reihe.includes(k)) return; setReihe(r => [...r, k].slice(0, 8)); setNeu(''); setMeldung(null) }

  async function speichern() {
    setSpeichert(true); setMeldung(null)
    const ok = await speichereListe(reihe, von)
    if (ok) {
      protokolliere({ art: 'manuell', quelle: 'Einstellungen', aktion: 'Mail-PCs für automatische Mails festgelegt', ergebnis: reihe.length ? `${reihe.join(' → ')} → zuletzt Automatik-PC` : 'keine – der Automatik-PC verschickt selbst', details: gespeichert.length ? [`vorher: ${gespeichert.join(' → ')}`] : undefined })
      await lade(true)
      setMeldung({ ok: true, text: reihe.length ? `Gespeichert. Automatische Mails gehen ab jetzt zuerst über ${reihe.join(', dann ')} – dein Automatik-PC nur, wenn keiner davon online ist.` : 'Gespeichert. Der Automatik-PC verschickt alle automatischen Mails selbst (wie bisher).' })
    } else setMeldung({ ok: false, text: 'Speichern fehlgeschlagen – Netzlaufwerk nicht erreichbar?' })
    setSpeichert(false)
  }

  const knopf = 'p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent'
  return (
    <Card title="Mail-PCs für automatische Mails" icon={<Mail size={15} />}
      subtitle="Über welche PCs die automatischen Outlook-Mails rausgehen (Server-Meldungen, PC-Überwachung, Austritte, Lizenzen, Passwort-Erinnerungen, Geplante Aufgaben). Der erste PC der Liste, auf dem das Tool offen ist, verschickt. Der Automatik-PC ist immer die letzte Wahl.">
      {laedt ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader size={13} className="animate-spin" />Lade …</div>
      ) : (
        <div className="space-y-3" data-mailpc-karte>
          <div className={`rounded-lg border p-3 ${aktuell ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-background'}`} data-mailpc-aktuell={aktuell || 'automatik'}>
            <p className="text-[11px] text-muted-foreground">Automatische Mails gehen gerade über</p>
            <p className="text-sm text-foreground font-semibold">{aktuell ? <span className="font-mono">{aktuell}</span> : <>den Automatik-PC <span className="font-mono">{automatik}</span></>}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {aktuell ? 'Absender ist das Outlook-Postfach dieses PCs.' : gespeichert.length ? 'Keiner der Mail-PCs ist gerade online (Tool offen) – deshalb der Automatik-PC.' : 'Es sind keine Mail-PCs festgelegt.'}
              {postausgang.anzahl > 0 && <span className={postausgang.fehler ? ' text-amber-500' : ''} data-mailpc-postausgang> · {postausgang.anzahl} Mail(s) im Postausgang{postausgang.fehler ? `, ${postausgang.fehler} mit Fehlversuch` : ''}</span>}
            </p>
          </div>

          <div>
            <p className="text-[11px] text-muted-foreground mb-1">Reihenfolge (oben = zuerst)</p>
            <div className="rounded-lg border border-border overflow-hidden" data-mailpc-liste>
              {reihe.map((pc, i) => {
                const h = herzen.get(pc)
                const online = herzAktiv(h, jetzt)
                const t = teilnehmer.find(x => x.rechner === pc)
                return (
                  <div key={pc} className="px-3 py-1.5 flex items-center gap-2 text-xs border-b border-border/60 bg-background" data-mailpc-zeile={pc}>
                    <span className="w-5 text-muted-foreground">{i + 1}.</span>
                    <span className="inline-flex items-center gap-1 w-40"><span className="font-mono font-semibold text-foreground">{pc}</span><DeviceInfoButton hostname={pc} /></span>
                    <span className="flex-1 min-w-0 truncate text-muted-foreground">{h?.benutzer || t?.benutzer || ''}</span>
                    <span className={`text-[11px] ${online ? 'text-emerald-500' : 'text-muted-foreground'}`}>{online ? '● online' : `offline · zuletzt ${vor(h?.at, jetzt)}`}</span>
                    {entsperrt && <>
                      <button className={knopf} onClick={() => schiebe(i, -1)} disabled={i === 0} title="nach oben"><ArrowUp size={13} /></button>
                      <button className={knopf} onClick={() => schiebe(i, 1)} disabled={i === reihe.length - 1} title="nach unten"><ArrowDown size={13} /></button>
                      <button className={knopf} onClick={() => entferne(pc)} title="aus der Liste nehmen" data-mailpc-entfernen={pc}><Trash2 size={13} /></button>
                    </>}
                  </div>
                )
              })}
              <div className="px-3 py-1.5 flex items-center gap-2 text-xs bg-muted/30 text-muted-foreground" data-mailpc-letzte>
                <span className="w-5">{reihe.length + 1}.</span>
                <span>zuletzt: der Automatik-PC (<span className="font-mono">{automatik}</span>) – wenn keiner darüber online ist</span>
              </div>
            </div>
          </div>

          {entsperrt && (
            <div className="flex items-end gap-2 flex-wrap">
              <label className="text-[11px] text-muted-foreground flex flex-col gap-1">
                PC hinzufügen
                <input list="mailpc-auswahl" value={neu} spellCheck={false} data-mailpc-neu placeholder="z. B. DE5CG…"
                  onChange={e => { setNeu(e.target.value.toUpperCase()); setMeldung(null) }} onKeyDown={e => { if (e.key === 'Enter') fuegeHinzu(neu) }}
                  className="px-2.5 py-1.5 text-xs rounded-md border border-border bg-background text-foreground font-mono w-52 focus:outline-none focus:border-primary" />
              </label>
              <datalist id="mailpc-auswahl">{auswahl.map(t => <option key={t.rechner} value={t.rechner}>{t.benutzer || t.konto || ''}</option>)}</datalist>
              <button onClick={() => fuegeHinzu(neu)} disabled={!PC_OK.test(neuKurz) || reihe.includes(neuKurz)} data-mailpc-hinzu
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40"><Plus size={13} />Hinzufügen</button>
              <button onClick={() => void speichern()} disabled={speichert || !geaendert} data-mailpc-speichern
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                {speichert ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />}Speichern
              </button>
            </div>
          )}
          {entsperrt && auswahl.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-mailpc-vorschlaege>
              <span className="text-[11px] text-muted-foreground self-center">Bekannte Admin-PCs:</span>
              {auswahl.slice(0, 12).map(t => (
                <button key={t.rechner} onClick={() => fuegeHinzu(t.rechner)} data-mailpc-vorschlag={t.rechner}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-border text-foreground hover:bg-accent" title={`${t.rechner}${t.konto ? ` · ${t.konto}` : ''} – zuletzt ${vor(t.at, jetzt)}`}>
                  <span className="font-mono">{t.rechner}</span>{t.benutzer ? ` · ${t.benutzer}` : ''}
                </button>
              ))}
            </div>
          )}
          {meldung && <p className={`text-[11px] flex gap-1.5 ${meldung.ok ? 'text-emerald-500' : 'text-red-500'}`} data-mailpc-meldung>{meldung.ok ? <CheckCircle size={12} className="mt-0.5 shrink-0" /> : <AlertTriangle size={12} className="mt-0.5 shrink-0" />}{meldung.text}</p>}

          <p className="text-[11px] text-muted-foreground flex gap-1.5"><Info size={12} className="mt-0.5 shrink-0" />
            Scans und Prüfungen laufen weiter nur auf dem Automatik-PC – hier geht es nur ums Verschicken. Ein Mail-PC zählt als online, solange dort das Tool mit Admin-Anmeldung offen ist (und dieser Stand installiert ist). Absender ist sein Outlook-Postfach; die Mail liegt dann in seinen „Gesendeten Elementen“. Schlägt der Versand dort fehl oder geht der PC aus, verschickt der nächste in der Liste bzw. nach spätestens 4 Minuten der Automatik-PC.
          </p>
        </div>
      )}
    </Card>
  )
}
