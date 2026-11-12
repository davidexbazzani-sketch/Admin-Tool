// ── Kachel „Visual C++ Laufzeit“ (Software Installationen) ───────────────────
// Alle Visual-C++-Redistributables (2005 … 2015–2026) einzeln oder alle auf einmal still
// auf einen PC bringen. Ist-Stand je Paket, passend zur Architektur des PCs. Die Arbeit läuft
// im vcRedistInstallStore, damit ein Menüwechsel sie nicht abbricht.

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Cpu, ExternalLink, Loader2, Monitor, PackageCheck, Search, UserSearch } from 'lucide-react'
import Card from '../Card'
import UserPcSearch from '../UserPcSearch'
import { DeviceInfoButton } from '../device/DeviceDossier'
import { isValidRemoteTarget } from '../../utils/remoteTarget'
import { VC_PAKETE, VC_REIHEN, VC_QUELLE, VC_ORDNER, passtZu, pruefeVcStand, type VcStand } from '../../services/vcRedistInstall'
import { useVcRedistInstallStore } from '../../store/vcRedistInstallStore'
import InstallLogbuch from './InstallLogbuch'
import { AnmeldeStatus, useAnmeldeCheck } from './AnmeldeCheck'

function mmss(s: number): string { const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}` }

export default function VcRedistInstallation() {
  const [host, setHost] = useState('')
  const [serial, setSerial] = useState<string | undefined>(undefined)
  const [eingabe, setEingabe] = useState('')
  const uebernehmen = (h: string, s?: string) => { setHost(h.trim()); setSerial(s) }
  const eingabeOk = isValidRemoteTarget(eingabe.trim())

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Cpu size={24} className="text-violet-400" />
        <div>
          <h2 className="text-lg font-bold text-foreground">Visual C++ Laufzeit (Redistributable)</h2>
          <p className="text-xs text-muted-foreground">
            Viele Programme brauchen eine bestimmte Visual-C++-Laufzeit („VCRUNTIME140.dll fehlt“, „MSVCP120.dll nicht gefunden“, Fehler 0xc000007b).
            Hier lassen sich alle Versionen einzeln oder auf einmal still installieren — direkt von Microsoft.
          </p>
        </div>
      </div>

      <Card>
        <div className="p-4 space-y-3">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold"><UserSearch size={12} />Ziel-PC wählen</p>
          <UserPcSearch onPick={uebernehmen} mitOnlineStatus mitCheckbox placeholder="Name, Kürzel oder E-Mail eintippen …" />
          <div className="flex items-center gap-2 pt-1 border-t border-border/50">
            <Monitor size={13} className="text-muted-foreground shrink-0" />
            <span className="text-[11px] text-muted-foreground shrink-0">oder direkt:</span>
            <input value={eingabe} onChange={e => setEingabe(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && eingabeOk) uebernehmen(eingabe) }}
              placeholder="Hostname (DE…) oder IP-Adresse"
              className="flex-1 min-w-0 px-2 py-1 text-xs font-mono rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
            <button onClick={() => uebernehmen(eingabe)} disabled={!eingabeOk}
              className="shrink-0 px-2.5 py-1 text-[11px] rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">Übernehmen</button>
          </div>
        </div>
      </Card>

      {host && (
        <Card>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Ziel-PC:</span>
              <span className="text-sm font-mono text-foreground">{host}</span>
              <DeviceInfoButton hostname={host} serial={serial} />
              <button onClick={() => { setHost(''); setSerial(undefined) }} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">anderer PC</button>
            </div>
            <AnmeldeStatus host={host} />
            <VcPanel host={host} />
          </div>
        </Card>
      )}

      <InstallLogbuch software="Visual C++" titel="Logbuch Visual C++ Laufzeit" />
      <div className="rounded-lg border border-border bg-card/50 p-3 space-y-1 text-[11px] text-muted-foreground">
        <p className="text-[10px] uppercase tracking-wider font-semibold">Herkunft</p>
        <p>
          Offizielle Downloads von Microsoft (<a href={VC_QUELLE} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">Latest Supported Visual C++ Redistributable Downloads<ExternalLink size={10} /></a>).
          Jede Datei muss eine gültige Microsoft-Signatur haben — sonst wird sie verworfen. Zwischengespeichert für alle Admins in <span className="font-mono break-all">{VC_ORDNER}</span>; die aktuelle Version (2015–2026) wird nach 7 Tagen neu geholt.
        </p>
      </div>
    </div>
  )
}

function VcPanel({ host }: { host: string }) {
  const key = host.trim().toLowerCase()
  const lauf = useVcRedistInstallStore(s => s.laeufe[key])
  const starte = useVcRedistInstallStore(s => s.starte)
  const verwerfe = useVcRedistInstallStore(s => s.verwerfe)
  const laeuft = lauf?.phase === 'laeuft' || lauf?.phase === 'wartet'

  const [stand, setStand] = useState<VcStand | null>(null)
  const [prueft, setPrueft] = useState(false)
  const [wahl, setWahl] = useState<Set<string>>(new Set())
  const [auchVorhandene, setAuchVorhandene] = useState(false)
  const [dauer, setDauer] = useState(0)
  const { vorStart, anmeldeDialog } = useAnmeldeCheck()

  useEffect(() => { setStand(null); setWahl(new Set()); setDauer(0) }, [key])
  useEffect(() => { if (!laeuft) return; const t = setInterval(() => setDauer(d => d + 1), 1000); return () => clearInterval(t) }, [laeuft])

  async function pruefen() {
    if (prueft) return
    setPrueft(true)
    const s = await pruefeVcStand(host)
    setStand(s)
    // Vorschlag: alles Passende, was fehlt, plus die aktuelle Version (Update)
    if (s.ok && wahl.size === 0) setWahl(new Set(VC_PAKETE.filter(p => passtZu(p, s.arch) && (!s.installiert[p.id] || !p.version)).map(p => p.id)))
    setPrueft(false)
  }
  useEffect(() => { void pruefen() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key])
  useEffect(() => { if (lauf?.phase === 'fertig' || lauf?.phase === 'fehler') void pruefen() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lauf?.phase])

  const passend = useMemo(() => VC_PAKETE.filter(p => !stand?.ok || passtZu(p, stand.arch)), [stand])
  const kipp = (id: string) => setWahl(w => { const n = new Set(w); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const alle = () => setWahl(new Set(passend.map(p => p.id)))
  const nurFehlende = () => setWahl(new Set(passend.filter(p => !stand?.installiert[p.id]).map(p => p.id)))
  const keine = () => setWahl(new Set())
  const reiheKippen = (reihe: string) => {
    const ids = passend.filter(p => p.reihe === reihe).map(p => p.id)
    const alleDrin = ids.every(id => wahl.has(id))
    setWahl(w => { const n = new Set(w); ids.forEach(id => (alleDrin ? n.delete(id) : n.add(id))); return n })
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-background p-2.5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-foreground">Pakete</span>
          {stand?.ok && <span className="text-[11px] text-muted-foreground">{stand.system} · {stand.arch === 'x86' ? '32 Bit' : stand.arch}{stand.neustartAusstehend ? ' · Neustart steht aus' : ''}</span>}
          <span className="ml-auto flex items-center gap-1.5 flex-wrap">
            <button onClick={alle} disabled={laeuft} data-vc-alle className="px-2 py-0.5 text-[11px] rounded-md border border-border hover:bg-accent text-foreground disabled:opacity-40">Alle auswählen</button>
            <button onClick={nurFehlende} disabled={laeuft || !stand?.ok} className="px-2 py-0.5 text-[11px] rounded-md border border-border hover:bg-accent text-foreground disabled:opacity-40">Nur fehlende</button>
            <button onClick={keine} disabled={laeuft} className="px-2 py-0.5 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground disabled:opacity-40">Keine</button>
            <button onClick={() => void pruefen()} disabled={prueft || laeuft}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground disabled:opacity-40">
              {prueft ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}{prueft ? 'prüft …' : 'Ist-Stand'}
            </button>
          </span>
        </div>
        {stand?.fehler && <p className="flex items-start gap-1.5 text-[11px] text-red-500"><AlertTriangle size={12} className="shrink-0 mt-px" />{stand.fehler}</p>}
        <div className="rounded border border-border divide-y divide-border/60">
          {VC_REIHEN.map(reihe => {
            const pakete = VC_PAKETE.filter(p => p.reihe === reihe)
            const sichtbar = pakete.filter(p => passend.includes(p))
            const alleDrin = sichtbar.length > 0 && sichtbar.every(p => wahl.has(p.id))
            return (
              <div key={reihe} className="flex items-start gap-3 px-2 py-1.5">
                <label className="flex items-center gap-1.5 w-56 shrink-0 text-xs text-foreground cursor-pointer">
                  <input type="checkbox" className="accent-primary" checked={alleDrin} disabled={laeuft || !sichtbar.length} onChange={() => reiheKippen(reihe)} />
                  <span>{reihe}{!pakete[0].unterstuetzt && <span className="block text-[10px] text-muted-foreground">von Microsoft nicht mehr unterstützt</span>}</span>
                </label>
                <div className="flex-1 flex flex-wrap gap-x-4 gap-y-1">
                  {pakete.map(p => {
                    const inst = stand?.installiert[p.id]
                    const nichtPassend = !!stand?.ok && !passtZu(p, stand.arch)
                    return (
                      <label key={p.id} className={`flex items-center gap-1.5 text-[11px] ${nichtPassend ? 'opacity-40' : 'cursor-pointer'}`}
                        title={nichtPassend ? (p.arch === 'arm64' ? 'Nur für ARM64-PCs (das x64-Paket enthält die ARM64-Dateien schon)' : 'Passt nicht zu diesem 32-Bit-Windows') : p.version ? `Version ${p.version}` : 'immer die neueste Version von Microsoft'}>
                        <input type="checkbox" className="accent-primary" checked={wahl.has(p.id) && !nichtPassend} disabled={laeuft || nichtPassend} onChange={() => kipp(p.id)} data-vc-paket={p.id} />
                        <span className="font-mono text-foreground">{p.arch}</span>
                        {stand?.ok && !nichtPassend && (inst
                          ? <span className="text-emerald-500 inline-flex items-center gap-0.5"><CheckCircle2 size={10} />{inst.version}</span>
                          : <span className="text-amber-500">fehlt</span>)}
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
          <input type="checkbox" className="accent-primary mt-0.5" checked={auchVorhandene} disabled={laeuft} onChange={e => setAuchVorhandene(e.target.checked)} />
          <span>Auch schon vorhandene alte Versionen neu ausführen (Reparatur)
            <span className="block text-[11px] text-muted-foreground">Sonst werden 2005–2013 nur installiert, wo sie fehlen. Die aktuelle Version (2015–2026) wird immer auf den neuesten Stand gebracht.</span>
          </span>
        </label>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => { const opt = { pakete: [...wahl].filter(id => passend.some(p => p.id === id)), auchVorhandene }; void vorStart(host, () => starte(host, opt)) }}
          disabled={laeuft || !stand?.ok || ![...wahl].some(id => passend.some(p => p.id === id))} data-vc-start
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40">
          {laeuft ? <Loader2 size={13} className="animate-spin" /> : <PackageCheck size={13} />}
          {laeuft ? 'läuft …' : `${[...wahl].filter(id => passend.some(p => p.id === id)).length} Paket(e) installieren`}
        </button>
        {lauf?.phase === 'wartet' && <span className="text-[11px] text-muted-foreground">wartet auf einen freien Platz …</span>}
        {laeuft && <span className="text-[11px] text-muted-foreground tabular-nums">läuft seit {mmss(dauer)}</span>}
        {(lauf?.phase === 'fertig' || lauf?.phase === 'fehler') && <button onClick={() => verwerfe(host)} className="text-[11px] text-muted-foreground hover:text-foreground underline">Meldung schließen</button>}
      </div>

      {lauf && (
        <div className="rounded-md border border-border divide-y divide-border/60">
          {lauf.schritte.map(s => (
            <div key={s.id} className="flex items-start gap-2 px-2.5 py-1.5">
              <span className="shrink-0 mt-px">
                {s.status === 'laeuft' ? <Loader2 size={12} className="animate-spin text-blue-400" />
                  : s.status === 'ok' ? <CheckCircle2 size={12} className="text-emerald-500" />
                  : s.status === 'fehler' ? <AlertTriangle size={12} className="text-red-500" />
                  : s.status === 'warnung' ? <AlertTriangle size={12} className="text-amber-500" />
                  : <span className="block w-3 h-3 rounded-full border border-border" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className={`block text-[11px] ${s.status === 'offen' ? 'text-muted-foreground' : 'text-foreground'}`}>{s.label}</span>
                {s.info && <span className="block text-[10px] text-muted-foreground break-words">{s.info}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {lauf?.ergebnis && (
        <div className={`flex items-start gap-2 px-2.5 py-2 rounded-md text-[11px] border text-foreground ${lauf.ergebnis.ok ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-red-500/40 bg-red-500/10'}`}>
          {lauf.ergebnis.ok ? <CheckCircle2 size={13} className="shrink-0 mt-px text-emerald-500" /> : <AlertTriangle size={13} className="shrink-0 mt-px text-red-500" />}
          <span className="whitespace-pre-wrap break-words">{lauf.ergebnis.text}</span>
        </div>
      )}
      {anmeldeDialog}
    </div>
  )
}
