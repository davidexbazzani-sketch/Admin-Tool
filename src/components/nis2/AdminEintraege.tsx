// ── NIS2 Zugänge-Check: „Nach PCs“ – lokale Administratoren je PC live ansehen und einzeln entziehen ──
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Lock, Monitor, RefreshCw, Search, ShieldOff, User, Users, X } from 'lucide-react'
import { DeviceInfoButton } from '../device/DeviceDossier'
import { PersonInfoButton } from '../person/PersonDossier'
import { approvalFor, type AccessCheckResult, type ApprovedEntry } from '../../services/nis2Access'
import { entzieheAdmin, liesAdministratoren, type AdminEintrag } from '../../services/nis2AdminEintraege'

function fmt(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso); return isNaN(d.getTime()) ? '—' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

type Live = { laedt: boolean; ok?: boolean; eintraege: AdminEintrag[]; fehler?: string; um?: string }

/** Liste aller gescannten PCs; aufgeklappt werden die Administratoren LIVE vom PC gelesen. */
export function AdminNachPcs({ result, entries, ich, onGeaendert }: {
  result: AccessCheckResult; entries: ApprovedEntry[]; ich: string; onGeaendert: () => void
}) {
  const [suche, setSuche] = useState('')
  const [offen, setOffen] = useState<Record<string, boolean>>({})
  const [live, setLive] = useState<Record<string, Live>>({})
  const [entzug, setEntzug] = useState<{ host: string; e: AdminEintrag } | null>(null)

  const userBySam = useMemo(() => new Map(result.users.map(u => [u.sam.toLowerCase(), u])), [result.users])
  const pcs = useMemo(() => {
    const q = suche.trim().toLowerCase()
    return Object.entries(result.hostMembers ?? {})
      .map(([host, leaves]) => ({ host, leaves: Array.isArray(leaves) ? leaves : [], at: result.hostScannedAt?.[host] }))
      .filter(p => !q || p.host.toLowerCase().includes(q) || p.leaves.some(l => l.toLowerCase().includes(q)
        || (userBySam.get(l.toLowerCase())?.displayName || '').toLowerCase().includes(q)))
      .sort((a, b) => a.host.localeCompare(b.host))
  }, [result, suche, userBySam])

  async function lade(host: string) {
    setLive(p => ({ ...p, [host]: { laedt: true, eintraege: p[host]?.eintraege ?? [] } }))
    const r = await liesAdministratoren(host)
    setLive(p => ({ ...p, [host]: { laedt: false, ok: r.ok, eintraege: r.eintraege, fehler: r.fehler, um: new Date().toISOString() } }))
  }
  function klappe(host: string) {
    const auf = !offen[host]
    setOffen(p => ({ ...p, [host]: auf }))
    if (auf && !live[host]) void lade(host)
  }

  return (
    <div className="flex flex-col gap-2" data-nis2-pcs>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative w-64">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="PC, Corp-ID, Name…" className="w-full pl-6 pr-2 py-1 rounded-md bg-card border border-border text-xs" />
        </div>
        <span className="text-[11px] text-muted-foreground">{pcs.length} PCs · Aufklappen liest die Gruppe „Administratoren“ <b>live</b> vom PC (alle Einträge: Benutzer, Gruppen, lokale Konten). „Entziehen“ entfernt genau diesen Eintrag – unsichtbar für den Nutzer, wirksam ab seiner nächsten Anmeldung. Server sind gesperrt.</span>
      </div>
      {pcs.map(p => {
        const l = live[p.host]
        return (
          <div key={p.host} className="rounded-lg border border-border bg-card/40">
            <div className="flex items-center gap-2 px-3 py-2">
              <button onClick={() => klappe(p.host)} className="inline-flex items-center gap-1.5 text-left text-foreground hover:text-primary" data-nis2-pc={p.host}>
                {offen[p.host] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<Monitor size={13} className="text-muted-foreground" />
                <span className="font-mono text-xs font-semibold">{p.host}</span>
              </button>
              <DeviceInfoButton hostname={p.host} />
              <span className="text-[11px] text-muted-foreground">Letzter Scan: {p.leaves.length} Domänen-Eintrag/-Einträge · {fmt(p.at)}</span>
              {offen[p.host] && <button onClick={() => void lade(p.host)} disabled={l?.laedt} className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground" title="Neu vom PC lesen"><RefreshCw size={12} className={l?.laedt ? 'animate-spin' : ''} /></button>}
            </div>
            {offen[p.host] && (
              <div className="px-3 pb-3 pl-9">
                {l?.laedt && !l.eintraege.length ? <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />Lese Administratoren von {p.host} …</p>
                  : l && !l.ok ? <p className="text-[11px] text-red-300 flex items-center gap-1.5"><AlertTriangle size={12} />Nicht erreichbar: {l.fehler}</p>
                  : l && (
                    <table className="w-full text-xs">
                      <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                        <tr><th className="py-1 pr-2">Eintrag</th><th className="py-1 pr-2">Art</th><th className="py-1 pr-2">Quelle</th><th className="py-1 pr-2">Antrag</th><th className="py-1">Aktion</th></tr>
                      </thead>
                      <tbody>
                        {l.eintraege.map(e => {
                          const u = e.klasse !== 'Gruppe' ? userBySam.get(e.leaf.toLowerCase()) : undefined
                          const st = u ? approvalFor(u, entries).state : null
                          return (
                            <tr key={e.sid || e.name} className="border-b border-border/30" data-nis2-eintrag={e.name}>
                              <td className="py-1 pr-2 font-mono text-foreground">
                                <span className="inline-flex items-center gap-1">{e.name}{u && <><span className="font-sans text-muted-foreground">· {u.displayName}</span><PersonInfoButton name={u.displayName} sam={u.sam} /></>}</span>
                              </td>
                              <td className="py-1 pr-2"><span className="inline-flex items-center gap-1 text-muted-foreground">{e.klasse === 'Gruppe' ? <Users size={11} /> : <User size={11} />}{e.klasse}</span></td>
                              <td className="py-1 pr-2 text-muted-foreground">{e.quelle}</td>
                              <td className="py-1 pr-2">{st === 'genehmigt' ? <span className="text-emerald-300">genehmigt</span> : st === 'beantragt' ? <span className="text-amber-500">beantragt</span> : st === 'nicht' ? <span className="text-red-300 font-semibold">ohne Antrag</span> : <span className="text-muted-foreground">—</span>}</td>
                              <td className="py-1">
                                {e.schutz ? <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={e.schutz}><Lock size={11} />geschützt</span>
                                  : <button onClick={() => setEntzug({ host: p.host, e })} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border border-red-500/40 text-red-300 hover:bg-red-500/10" data-nis2-entziehen={e.name}><ShieldOff size={11} />Entziehen</button>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                {l?.um && l.ok && <p className="text-[10px] text-muted-foreground mt-1">Live gelesen {fmt(l.um)} · {l.eintraege.length} Einträge</p>}
              </div>
            )}
          </div>
        )
      })}
      {entzug && (
        <EntzugDialog host={entzug.host} eintrag={entzug.e} ich={ich}
          person={(() => { const u = userBySam.get(entzug.e.leaf.toLowerCase()); return u ? { name: u.displayName, sam: u.sam } : undefined })()}
          onClose={() => setEntzug(null)}
          onFertig={ok => { const h = entzug.host; setEntzug(null); if (ok) { void lade(h); onGeaendert() } }} />
      )}
    </div>
  )
}

/** Entzug für einen Nutzer aus der Nutzerliste: liest den PC live und sucht den passenden Eintrag. */
export function EntzugFuerNutzer({ host, sam, name, ich, onClose, onFertig }: {
  host: string; sam: string; name: string; ich: string; onClose: () => void; onFertig: (ok: boolean) => void
}) {
  const [stand, setStand] = useState<{ laedt: boolean; e?: AdminEintrag; fehler?: string }>({ laedt: true })
  useEffect(() => {
    let lebt = true
    void liesAdministratoren(host).then(r => {
      if (!lebt) return
      if (!r.ok) { setStand({ laedt: false, fehler: `Nicht erreichbar: ${r.fehler}` }); return }
      const e = r.eintraege.find(x => x.leaf.toLowerCase() === sam.toLowerCase() && x.klasse !== 'Gruppe')
      setStand(e ? { laedt: false, e } : { laedt: false, fehler: `${sam} steht auf ${host} nicht (mehr) direkt in „Administratoren“.` })
    })
    return () => { lebt = false }
  }, [host, sam])
  if (stand.e) return <EntzugDialog host={host} eintrag={stand.e} ich={ich} person={{ name, sam }} onClose={onClose} onFertig={onFertig} />
  return (
    <Hulle onClose={onClose}>
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><ShieldOff size={16} className="text-red-400" />Zugang entziehen · {host}</h3>
      {stand.laedt ? <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" />Lese Administratoren von {host} …</p>
        : <p className="text-xs text-red-300 flex items-center gap-1.5"><AlertTriangle size={13} />{stand.fehler}</p>}
      <div className="flex"><button onClick={onClose} className="ml-auto px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Schließen</button></div>
    </Hulle>
  )
}

function EntzugDialog({ host, eintrag, person, ich, onClose, onFertig }: {
  host: string; eintrag: AdminEintrag; person?: { name: string; sam: string }; ich: string
  onClose: () => void; onFertig: (ok: boolean) => void
}) {
  const [sicher, setSicher] = useState(false)
  const [lauf, setLauf] = useState<'' | 'laeuft' | 'fertig'>('')
  const [erg, setErg] = useState<{ ok: boolean; meldung: string } | null>(null)
  async function los() {
    setLauf('laeuft')
    const r = await entzieheAdmin(host, eintrag, ich, person)
    setErg(r); setLauf('fertig')
  }
  return (
    <Hulle onClose={() => lauf !== 'laeuft' && (erg ? onFertig(erg.ok) : onClose())}>
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><ShieldOff size={16} className="text-red-400" />Lokalen Admin-Zugang entziehen</h3>
      <div className="text-xs space-y-1">
        <p><span className="text-muted-foreground">PC:</span> <b className="font-mono">{host}</b></p>
        <p><span className="text-muted-foreground">Eintrag:</span> <b className="font-mono">{eintrag.name}</b> ({eintrag.klasse}{person ? ` · ${person.name}` : ''})</p>
      </div>
      <p className="text-[11px] text-muted-foreground">Entfernt genau diesen Eintrag aus der Gruppe „Administratoren“ des PCs. Der Nutzer merkt davon nichts (kein Fenster); die Rechte fallen bei seiner nächsten Anmeldung weg. Danach prüft das Tool, ob der Eintrag wirklich weg ist. Protokoll: Geräte-Dossier, Aktivitätsprotokoll{person ? ', Personen-Dossier' : ''}.</p>
      {eintrag.klasse === 'Gruppe' && <p className="text-[11px] text-amber-500 flex items-start gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" />Das ist eine <b>Gruppe</b> – alle ihre Mitglieder verlieren auf diesem PC die Adminrechte.</p>}
      {!erg && (
        <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
          <input type="checkbox" checked={sicher} onChange={e => setSicher(e.target.checked)} disabled={!!lauf} className="accent-red-500" data-nis2-sicher />
          Ja, diesen Zugang auf {host} entziehen
        </label>
      )}
      {erg && <p className={`text-xs flex items-start gap-1.5 ${erg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{erg.ok ? <Check size={13} className="shrink-0 mt-0.5" /> : <AlertTriangle size={13} className="shrink-0 mt-0.5" />}{erg.meldung}</p>}
      <div className="flex gap-2">
        {!erg ? <>
          <button onClick={onClose} disabled={lauf === 'laeuft'} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-40">Abbrechen</button>
          <button onClick={() => void los()} disabled={!sicher || lauf === 'laeuft'} data-nis2-entzug-los
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40">
            {lauf === 'laeuft' ? <Loader2 size={13} className="animate-spin" /> : <ShieldOff size={13} />}Zugang entziehen
          </button>
        </> : <button onClick={() => onFertig(erg.ok)} className="ml-auto px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90">Schließen</button>}
      </div>
    </Hulle>
  )
}

function Hulle({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-5 space-y-3 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 p-1 rounded text-muted-foreground hover:text-foreground"><X size={15} /></button>
        {children}
      </div>
    </div>
  )
}
