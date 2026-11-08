// ── Server-Steckbrief aus der SKFM-Serverliste ───────────────────────────────
// Bausteine für das „i" (Geräte-Dossier → Stammdaten) und die Server-Kacheln:
// Plattform, Umgebung, Server-Typ, Zuständige, Anwendungen mit Alias und Kommentar.

import { useState, type ReactNode } from 'react'
import { AppWindow, Cloud, Server, Users, ChevronDown, ChevronRight, MessageSquareText } from 'lucide-react'
import { api } from '../../electronAPI'
import { PersonInfoButton } from '../person/PersonDossier'
import { kommentarTeile, standText, type ServerAnwendung, type ServerEintrag } from '../../services/serverListe'

// ── Abzeichen ────────────────────────────────────────────────────────────────
export function umgebungFarbe(u: string): string {
  const l = u.toLowerCase()
  if (l === 'produktiv') return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/35'
  if (l.includes('prod & non')) return 'bg-teal-500/15 text-teal-500 border-teal-500/35'
  if (l === 'test') return 'bg-amber-500/15 text-amber-500 border-amber-500/40'
  if (l.startsWith('entwick')) return 'bg-sky-500/15 text-sky-500 border-sky-500/35'
  return 'bg-muted/40 text-muted-foreground border-border'
}
const chip = 'inline-flex items-center gap-1 px-1.5 py-px rounded border text-[10px] font-semibold whitespace-nowrap'

export function UmgebungBadge({ u }: { u: string }) {
  return <span className={`${chip} ${umgebungFarbe(u)}`} data-umgebung={u}>{u}</span>
}
export function PlattformBadge({ p }: { p: string }) {
  if (!p) return null
  const azure = /^azure/i.test(p)
  return (
    <span className={`${chip} ${azure ? 'bg-blue-500/15 text-blue-500 border-blue-500/35' : 'bg-indigo-500/15 text-indigo-500 border-indigo-500/35'}`} title={azure ? 'Microsoft Azure (Cloud)' : 'HCI-Cluster Hamburg (Serverraum)'}>
      {azure ? <Cloud size={9} /> : <Server size={9} />}{p}
    </span>
  )
}
export function TypBadge({ t }: { t: string }) {
  return <span className={`${chip} font-medium bg-background text-muted-foreground border-border`}>{t}</span>
}
export function ZustandBadge({ e }: { e: Pick<ServerEintrag, 'zustand'> | Pick<ServerAnwendung, 'zustand'> }) {
  if (e.zustand === 'aktiv') return null
  return e.zustand === 'offline'
    ? <span className={`${chip} bg-red-500/15 text-red-500 border-red-500/35`}>laut Liste offline</span>
    : <span className={`${chip} bg-muted/40 text-muted-foreground border-border line-through`}>laut Liste gelöscht</span>
}

/** Kommentar mit klickbaren Links; lange Texte auf Wunsch gekürzt mit „mehr". */
export function KommentarText({ text, kuerzen }: { text: string; kuerzen?: number }) {
  const [offen, setOffen] = useState(false)
  if (!text) return null
  const lang = !!kuerzen && text.length > kuerzen
  const zeige = lang && !offen ? text.slice(0, kuerzen).replace(/\s+\S*$/, '') + ' …' : text
  return (
    <span className="break-words">
      {kommentarTeile(zeige).map((t, i) => t.link
        ? <a key={i} href={t.link} onClick={e => { e.preventDefault(); e.stopPropagation(); void api().openExternal(t.link!) }} className="text-primary hover:underline break-all">{t.text}</a>
        : <span key={i}>{t.text}</span>)}
      {lang && <button type="button" onClick={e => { e.stopPropagation(); setOffen(o => !o) }} className="ml-1 text-primary hover:underline">{offen ? 'weniger' : 'mehr'}</button>}
    </span>
  )
}

function Personen({ namen }: { namen: string[] }) {
  if (!namen.length) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {namen.map(n => <span key={n} className="inline-flex items-center gap-0.5 text-foreground">{n}<PersonInfoButton name={n} /></span>)}
    </span>
  )
}

function Zeile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1 pl-1">
      <span className="text-xs text-muted-foreground w-40 shrink-0 pt-px">{label}</span>
      <span className="text-sm text-foreground min-w-0 flex-1 break-words">{children}</span>
    </div>
  )
}

/** Eine Anwendung als Karte (im „i"). */
function AnwendungKarte({ a, host }: { a: ServerAnwendung; host?: string }) {
  const weg = a.zustand !== 'aktiv'
  return (
    <div className={`rounded-md border border-border bg-background px-3 py-2 ${weg ? 'opacity-60' : ''}`} data-anwendung={a.titel}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <AppWindow size={12} className="text-primary shrink-0" />
        <span className={`text-sm font-semibold text-foreground ${weg ? 'line-through' : ''}`}>{a.titel || 'ohne Titel'}</span>
        {a.alias && <span className="text-[11px] font-mono text-muted-foreground">{a.alias}</span>}
        <ZustandBadge e={a} />
        <span className="ml-auto flex items-center gap-1 flex-wrap">{a.umgebung.map(u => <UmgebungBadge key={u} u={u} />)}{a.typ.map(t => <TypBadge key={t} t={t} />)}</span>
      </div>
      {(a.zustaendig.length > 0 || a.kommentar) && (
        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
          {a.zustaendig.length > 0 && <div className="flex items-center gap-1"><Users size={10} className="shrink-0" /><Personen namen={a.zustaendig} /></div>}
          {a.kommentar && <div className="flex items-start gap-1"><MessageSquareText size={10} className="shrink-0 mt-0.5" /><span className="text-foreground/90"><KommentarText text={a.kommentar} /></span></div>}
        </div>
      )}
      {host && a.nameInListe && a.nameInListe.toUpperCase() !== host && (
        <div className="mt-0.5 text-[10px] text-muted-foreground/70">in der Liste als <span className="font-mono">{a.nameInListe}</span></div>
      )}
    </div>
  )
}

/** Vollständiger Steckbrief (Geräte-„i" → Stammdaten). */
export function ServerSteckbriefVoll({ e, stand, herkunft }: { e: ServerEintrag; stand: string; herkunft: 'zentral' | 'eingebaut' }) {
  const datum = standText(stand)
  return (
    <div className="space-y-1" data-server-steckbrief={e.host}>
      <Zeile label="Plattform">{e.plattform ? <PlattformBadge p={e.plattform} /> : <span className="text-muted-foreground">—</span>} <ZustandBadge e={e} /></Zeile>
      {e.umgebungen.length > 0 && <Zeile label="Umgebung"><span className="inline-flex flex-wrap gap-1">{e.umgebungen.map(u => <UmgebungBadge key={u} u={u} />)}</span></Zeile>}
      {e.typen.length > 0 && <Zeile label="Server-Typ"><span className="inline-flex flex-wrap gap-1">{e.typen.map(t => <TypBadge key={t} t={t} />)}</span></Zeile>}
      <Zeile label="Zuständig"><Personen namen={e.zustaendig} /></Zeile>
      {e.aliase.length > 0 && <Zeile label="Alias / DNS-Name"><span className="font-mono text-xs">{e.aliase.join(' · ')}</span></Zeile>}
      <div className="pt-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold pl-1 mb-1">Anwendungen auf diesem Server ({e.anwendungen.length})</p>
        <div className="space-y-1.5">{e.anwendungen.map((a, i) => <AnwendungKarte key={i} a={a} host={e.host} />)}</div>
      </div>
      <p className="pt-1.5 pl-1 text-[10px] text-muted-foreground/70">
        Quelle: SKFM-Serverliste vom {datum}{herkunft === 'eingebaut' ? ' (im Programm hinterlegt)' : ' (zentral gespeichert)'} — aktualisieren unter Server → „Serverliste"
      </p>
    </div>
  )
}

/** Kompakter Block für die Server-Kachel. */
export function ServerKachelInfo({ e }: { e: ServerEintrag }) {
  const [alle, setAlle] = useState(false)
  const aktive = e.anwendungen.filter(a => a.zustand === 'aktiv')
  const apps = aktive.length ? aktive : e.anwendungen
  const zeige = alle ? apps : apps.slice(0, 3)
  return (
    <div className="mt-2 rounded-lg border border-border/70 bg-background/60 px-2.5 py-2 space-y-1.5" data-kachel-steckbrief={e.host}>
      <div className="flex items-center gap-1 flex-wrap">
        <PlattformBadge p={e.plattform} />
        {e.umgebungen.map(u => <UmgebungBadge key={u} u={u} />)}
        {e.typen.map(t => <TypBadge key={t} t={t} />)}
        <ZustandBadge e={e} />
      </div>
      {apps.length === 1 ? (
        // Eine Anwendung: der Titel steht schon oben auf der Kachel → nur Alias + Kommentar
        (apps[0].alias || apps[0].kommentar) ? (
          <div className="text-[11px] leading-snug space-y-0.5">
            {apps[0].alias && <div className="font-mono text-[10px] text-muted-foreground">{apps[0].alias}</div>}
            {apps[0].kommentar && <div className="text-[10px] text-muted-foreground"><KommentarText text={apps[0].kommentar} kuerzen={140} /></div>}
          </div>
        ) : null
      ) : (
      <div className="space-y-1">
        {zeige.map((a, i) => (
          <div key={i} className="text-[11px] leading-snug">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <AppWindow size={10} className="text-primary shrink-0 translate-y-px" />
              <span className="font-semibold text-foreground">{a.titel || 'ohne Titel'}</span>
              {a.alias && <span className="font-mono text-[10px] text-muted-foreground truncate">{a.alias}</span>}
            </div>
            {a.kommentar && <div className="pl-[15px] text-[10px] text-muted-foreground"><KommentarText text={a.kommentar} kuerzen={110} /></div>}
          </div>
        ))}
        {apps.length > 3 && (
          <button type="button" onClick={ev => { ev.stopPropagation(); setAlle(v => !v) }} className="pl-[15px] inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline">
            {alle ? <ChevronDown size={10} /> : <ChevronRight size={10} />}{alle ? 'weniger' : `${apps.length - 3} weitere Anwendung${apps.length - 3 === 1 ? '' : 'en'}`}
          </button>
        )}
      </div>
      )}
      {e.zustaendig.length > 0 && (
        <div className="flex items-start gap-1 text-[11px] text-muted-foreground"><Users size={10} className="shrink-0 mt-0.5" /><Personen namen={e.zustaendig} /></div>
      )}
    </div>
  )
}
