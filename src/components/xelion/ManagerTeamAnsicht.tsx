// ── Everphone-Register → „Team / Abteilung" ───────────────────────────────────
// Nach Manager:   Manager eintippen → alle Mitarbeiter darunter (direkt / alle Ebenen)
// Nach Abteilung: Abteilung(en) wählen → alle Personen darin
// jeweils mit Rufnummer/Diensthandys aus dem Everphone-Register.
// Daten: zentrales AD-Verzeichnis (Manager + Abteilung je Benutzer) + Everphone-Register.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Loader2, Users, Copy, Check, FileSpreadsheet, X, AlertTriangle, Smartphone, Building2 } from 'lucide-react'
import { ensureDailyAdUsers } from '../../services/adUserDirectory'
import type { AdUserListItem } from '../../services/adUsersList'
import type { EverphoneEntry } from '../../services/everphone'
import {
  managerVorschlaege, direktAnzahl, teamVon, ordneEverphoneZu, alsText, exportiereTeam,
  abteilungen, abteilungPasst, personenInAbteilungen, type TeamMitglied, type ListenKopf,
} from '../../services/managerTeam'
import { PersonInfoButton } from '../person/PersonDossier'

type Modus = 'manager' | 'abteilung'

export default function ManagerTeamAnsicht({ entries }: { entries: EverphoneEntry[] }) {
  const [users, setUsers] = useState<AdUserListItem[] | null>(null)
  const [stand, setStand] = useState('')
  const [fehler, setFehler] = useState('')
  const [modus, setModus] = useState<Modus>('manager')
  const [nurMitHandy, setNurMitHandy] = useState(false)

  useEffect(() => {
    let weg = false
    void ensureDailyAdUsers().then(r => {
      if (weg) return
      if (r.dir) { setUsers(r.dir.users); setStand(r.dir.loadedAt) }
      else { setUsers([]); setFehler(r.error || 'AD-Verzeichnis nicht verfügbar') }
    }).catch(e => { if (!weg) { setUsers([]); setFehler(e instanceof Error ? e.message : String(e)) } })
    return () => { weg = true }
  }, [])

  if (users === null) return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center"><Loader2 size={16} className="animate-spin" />AD-Verzeichnis wird geladen…</div>
  )

  const standText = stand ? new Date(stand).toLocaleString('de-DE') : '—'
  return (
    <div className="space-y-3">
      {fehler && (
        <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-foreground text-xs flex items-start gap-2">
          <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />Ohne AD-Verzeichnis lassen sich Team und Abteilung nicht ermitteln: {fehler}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-md border border-border overflow-hidden">
          {([['manager', 'Nach Manager', <Users key="u" size={13} />], ['abteilung', 'Nach Abteilung', <Building2 key="b" size={13} />]] as [Modus, string, JSX.Element][]).map(([m, t, icon]) => (
            <button key={m} onClick={() => setModus(m)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${modus === m ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent'}`}>{icon}{t}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
          <input type="checkbox" checked={nurMitHandy} onChange={e => setNurMitHandy(e.target.checked)} className="rounded accent-primary" />nur mit Diensthandy
        </label>
      </div>
      {modus === 'manager'
        ? <NachManager users={users} entries={entries} nurMitHandy={nurMitHandy} stand={standText} />
        : <NachAbteilung users={users} entries={entries} nurMitHandy={nurMitHandy} stand={standText} />}
    </div>
  )
}

// ── Nach Manager ─────────────────────────────────────────────────────────────
function NachManager({ users, entries, nurMitHandy, stand }: { users: AdUserListItem[]; entries: EverphoneEntry[]; nurMitHandy: boolean; stand: string }) {
  const [eingabe, setEingabe] = useState('')
  const [offen, setOffen] = useState(false)
  const [manager, setManager] = useState<AdUserListItem | null>(null)
  const [alleEbenen, setAlleEbenen] = useState(true)
  const feld = useRef<HTMLInputElement>(null)

  const vorschlaege = useMemo(() => offen ? managerVorschlaege(users, eingabe) : [], [users, eingabe, offen])
  const team = useMemo(() => manager ? ordneEverphoneZu(teamVon(users, manager.sam, alleEbenen), entries) : [], [users, manager, alleEbenen, entries])
  const direkt = team.filter(m => m.ebene === 1).length
  const waehle = (u: AdUserListItem) => { setManager(u); setEingabe(u.displayName); setOffen(false) }

  return (
    <>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="relative w-80">
          <Search size={13} className="absolute left-2 top-2.5 text-muted-foreground" />
          <input ref={feld} value={eingabe} disabled={!users.length}
            onChange={e => { setEingabe(e.target.value); setOffen(true); if (manager && e.target.value !== manager.displayName) setManager(null) }}
            onFocus={() => setOffen(true)} onBlur={() => setTimeout(() => setOffen(false), 150)}
            onKeyDown={e => { if (e.key === 'Enter' && vorschlaege[0]) waehle(vorschlaege[0]); if (e.key === 'Escape') setOffen(false) }}
            placeholder="Manager eingeben (Name oder Corp-ID)…"
            className="w-full pl-7 pr-7 py-1.5 rounded-md bg-background border border-border text-xs text-foreground" />
          {eingabe && <button onClick={() => { setEingabe(''); setManager(null); feld.current?.focus() }} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"><X size={13} /></button>}
          {offen && vorschlaege.length > 0 && !manager && (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-xl py-1 max-h-72 overflow-auto">
              {vorschlaege.map(u => {
                const n = direktAnzahl(users, u.sam)
                return (
                  <button key={u.sam} onMouseDown={e => { e.preventDefault(); waehle(u) }}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent flex items-center gap-2">
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs text-foreground truncate">{u.displayName} <span className="font-mono text-[10px] text-muted-foreground">{u.sam}</span></span>
                      <span className="block text-[10px] text-muted-foreground truncate">{[u.title, u.department].filter(Boolean).join(' · ') || '—'}</span>
                    </span>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{n ? `${n} direkt` : 'kein Team'}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-foreground pt-1.5">
          <label className="flex items-center gap-1.5 cursor-pointer" title="Auch die Mitarbeiter der Teamleiter unter diesem Manager">
            <input type="radio" checked={alleEbenen} onChange={() => setAlleEbenen(true)} className="accent-primary" />alle Ebenen
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={!alleEbenen} onChange={() => setAlleEbenen(false)} className="accent-primary" />nur direkt unterstellt
          </label>
        </div>
      </div>
      {!manager ? (
        <Leer icon={<Users size={36} className="opacity-30" />} text="Manager eingeben — dann erscheinen alle Mitarbeiter darunter mit ihren Rufnummern." stand={stand} />
      ) : (
        <ErgebnisListe team={team} nurMitHandy={nurMitHandy} stand={stand}
          kopf={{ titel: `Mitarbeiter unter ${manager.displayName}${manager.title ? ` (${manager.title})` : ''} — ${alleEbenen ? 'alle Ebenen' : 'nur direkt unterstellt'}`, dateiname: `Team ${manager.displayName}`, letzteSpalte: 'Ebene' }}
          zusammenfassung={<><b>{manager.displayName}</b>{manager.title && <span className="text-muted-foreground"> · {manager.title}</span>}
            <span className="text-muted-foreground"> — {team.length} Mitarbeiter{alleEbenen && team.length !== direkt ? ` (${direkt} direkt, ${team.length - direkt} darunter)` : ''}</span></>}
          leerText={team.length ? 'Niemand davon hat ein Diensthandy.' : 'Laut AD-Verzeichnis ist diesem Manager niemand (aktiv) unterstellt.'} />
      )}
    </>
  )
}

// ── Nach Abteilung ───────────────────────────────────────────────────────────
function NachAbteilung({ users, entries, nurMitHandy, stand }: { users: AdUserListItem[]; entries: EverphoneEntry[]; nurMitHandy: boolean; stand: string }) {
  const alle = useMemo(() => abteilungen(users), [users])
  const [suche, setSuche] = useState('')
  const [gewaehlt, setGewaehlt] = useState<string[]>([])
  const liste = alle.filter(a => abteilungPasst(a.name, suche))
  const personen = useMemo(() => gewaehlt.length ? ordneEverphoneZu(personenInAbteilungen(users, gewaehlt), entries) : [], [users, gewaehlt, entries])
  const umschalten = (n: string) => setGewaehlt(g => g.includes(n) ? g.filter(x => x !== n) : [...g, n])

  return (
    <>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-80 rounded-md border border-border">
          <div className="relative border-b border-border">
            <Search size={13} className="absolute left-2 top-2.5 text-muted-foreground" />
            <input value={suche} onChange={e => setSuche(e.target.value)} disabled={!alle.length} placeholder={`Abteilung suchen (${alle.length} Abteilungen)…`}
              className="w-full pl-7 pr-2 py-1.5 rounded-t-md bg-background text-xs text-foreground focus:outline-none" />
          </div>
          <div className="max-h-56 overflow-auto py-1">
            {liste.map(a => (
              <label key={a.name} className="flex items-center gap-2 px-3 py-1 text-xs text-foreground hover:bg-accent cursor-pointer">
                <input type="checkbox" checked={gewaehlt.includes(a.name)} onChange={() => umschalten(a.name)} className="rounded accent-primary" />
                <span className="flex-1 truncate">{a.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{a.anzahl}</span>
              </label>
            ))}
            {!liste.length && <div className="px-3 py-2 text-[11px] text-muted-foreground">Keine Abteilung gefunden.</div>}
          </div>
        </div>
        {gewaehlt.length > 0 && (
          <div className="flex-1 min-w-[200px] flex items-center gap-1.5 flex-wrap pt-1">
            {gewaehlt.map(a => (
              <span key={a} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-[11px] font-medium">
                {a}<button onClick={() => umschalten(a)} title="Abwählen" className="hover:opacity-80"><X size={11} /></button>
              </span>
            ))}
            <button onClick={() => setGewaehlt([])} className="text-[11px] text-muted-foreground hover:text-foreground underline">Auswahl aufheben</button>
          </div>
        )}
      </div>
      {!gewaehlt.length ? (
        <Leer icon={<Building2 size={36} className="opacity-30" />} text="Eine oder mehrere Abteilungen anhaken — dann erscheinen alle Personen darin mit ihren Rufnummern." stand={stand} />
      ) : (
        <ErgebnisListe team={personen} nurMitHandy={nurMitHandy} stand={stand}
          kopf={{ titel: `Personen in ${gewaehlt.length === 1 ? 'der Abteilung' : 'den Abteilungen'} ${gewaehlt.join(', ')}`, dateiname: `Abteilung ${gewaehlt.join(', ')}`, letzteSpalte: 'Vorgesetzter' }}
          zusammenfassung={<><b>{gewaehlt.length === 1 ? gewaehlt[0] : `${gewaehlt.length} Abteilungen`}</b><span className="text-muted-foreground"> — {personen.length} Personen</span></>}
          leerText={personen.length ? 'Niemand davon hat ein Diensthandy.' : 'In dieser Auswahl ist niemand (aktiv).'} />
      )}
    </>
  )
}

// ── gemeinsame Teile ─────────────────────────────────────────────────────────
function Leer({ icon, text, stand }: { icon: JSX.Element; text: string; stand: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-10 text-center">
      {icon}
      <p className="text-sm">{text}</p>
      <p className="text-[11px]">Grundlage: AD-Verzeichnis vom {stand} (Felder „Manager" und „Abteilung") + dieses Everphone-Register.</p>
    </div>
  )
}

function ErgebnisListe({ team, nurMitHandy, kopf, zusammenfassung, leerText, stand }: {
  team: TeamMitglied[]; nurMitHandy: boolean; kopf: ListenKopf; zusammenfassung: JSX.Element; leerText: string; stand: string
}) {
  const [kopiert, setKopiert] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  const sichtbar = nurMitHandy ? team.filter(m => m.everphone) : team
  const mitHandy = team.filter(m => m.everphone).length
  useEffect(() => { setExportMsg('') }, [kopf.titel])

  async function kopieren() {
    try { await navigator.clipboard.writeText(alsText(kopf, sichtbar)); setKopiert(true); setTimeout(() => setKopiert(false), 2000) } catch { /* egal */ }
  }
  async function exportieren() {
    setExportMsg('')
    const r = await exportiereTeam(kopf, sichtbar)
    if (r.ok) setExportMsg(`Gespeichert: ${r.pfad}`)
    else if (!r.abgebrochen) setExportMsg(`Export fehlgeschlagen: ${r.fehler}`)
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs text-foreground">
          {zusammenfassung}<span className="text-muted-foreground"> · </span>
          <span className="inline-flex items-center gap-1"><Smartphone size={11} className="text-primary" />{mitHandy} mit Diensthandy</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void kopieren()} disabled={!sichtbar.length} title="Als Tabelle kopieren — direkt in Excel oder Outlook einfügbar"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border text-foreground hover:bg-accent disabled:opacity-50">
            {kopiert ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}{kopiert ? 'Kopiert' : 'Liste kopieren'}
          </button>
          <button onClick={() => void exportieren()} disabled={!sichtbar.length}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <FileSpreadsheet size={13} />Excel exportieren
          </button>
        </div>
      </div>
      {exportMsg && <p className="text-[11px] text-muted-foreground break-all">{exportMsg}</p>}
      <div className="rounded-lg border border-border overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/20 text-muted-foreground text-[10px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Rufnummer</th>
              <th className="text-center px-3 py-2 font-medium">Geräte</th>
              <th className="text-left px-3 py-2 font-medium">Funktion</th>
              <th className="text-left px-3 py-2 font-medium">Abteilung</th>
              <th className="text-left px-3 py-2 font-medium">E-Mail</th>
              <th className="text-left px-3 py-2 font-medium">{kopf.letzteSpalte}</th>
            </tr>
          </thead>
          <tbody>
            {sichtbar.map(m => (
              <tr key={m.user.sam} className="border-t border-border/50 hover:bg-accent/10">
                <td className="px-3 py-1.5 text-foreground"><span className="inline-flex items-center gap-1">{m.user.displayName}<PersonInfoButton name={m.user.displayName} sam={m.user.sam} /></span></td>
                <td className="px-3 py-1.5 font-mono text-foreground">
                  {m.everphone ? (m.everphone.phone || <span className="font-sans text-muted-foreground">Gerät ohne Rufnummer</span>) : <span className="font-sans text-muted-foreground">kein Diensthandy</span>}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {m.everphone
                    ? <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold">{m.everphone.deviceCount || m.everphone.deviceIds.length}</span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{m.user.title || '—'}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{(m.user.department || '').trim() || '—'}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{m.user.email || '—'}</td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {kopf.letzteSpalte === 'Vorgesetzter' ? (m.ueber || '—') : m.ebene === 1 ? 'direkt' : <span title={`Ebene ${m.ebene}`}>über {m.ueber}</span>}
                </td>
              </tr>
            ))}
            {!sichtbar.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">{leerText}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">Zuordnung zum Everphone-Register über die E-Mail-Adresse, sonst über den Namen. Nur aktive AD-Konten der SKF Marine GmbH · AD-Stand {stand}.</p>
    </>
  )
}
