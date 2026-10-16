// ── Kachel „Jabra Software" (Software Installationen) ───────────────────────
// Zielauswahl + Erkennung + stille Installation. Die eigentliche Arbeit steckt in
// JabraPanel (gemeinsam mit Daylis → Sound Fix, Schritt 4) und im jabraInstallStore,
// damit ein laufender Vorgang einen Menüwechsel übersteht.

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Headphones, Loader2, Monitor, UserSearch } from 'lucide-react'
import Card from '../Card'
import UserPcSearch from '../UserPcSearch'
import { DeviceInfoButton } from '../device/DeviceDossier'
import { isValidRemoteTarget } from '../../utils/remoteTarget'
import { ladeJabraQuellordner, setzeJabraQuellordner, findeJabraSetup, JABRA_NETZ_ORDNER_STANDARD } from '../../services/jabraInstall'
import JabraPanel from './JabraPanel'

export default function JabraInstallation() {
  const [host, setHost] = useState('')
  const [serial, setSerial] = useState<string | undefined>(undefined)
  const [eingabe, setEingabe] = useState('')

  function uebernehmen(h: string, s?: string) { setHost(h.trim()); setSerial(s) }

  const eingabeOk = isValidRemoteTarget(eingabe.trim())

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Headphones size={24} className="text-emerald-400" />
        <div>
          <h2 className="text-lg font-bold text-foreground">Jabra Software</h2>
          <p className="text-xs text-muted-foreground">
            Jabra Direct still auf einem Ziel-PC installieren — ohne Fenster, ohne Zutun des Anwenders.
          </p>
        </div>
      </div>

      <Card>
        <div className="p-4 space-y-3">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            <UserSearch size={12} />Ziel-PC wählen
          </p>
          <p className="text-[11px] text-muted-foreground">
            Benutzernamen eintippen — passende Personen werden sofort vorgeschlagen. Nach der Auswahl erscheinen die ihm
            zugewiesenen Rechner samt Hinweis, ob sie gerade erreichbar sind.
          </p>

          <UserPcSearch onPick={uebernehmen} mitOnlineStatus placeholder="Name, Kürzel oder E-Mail eintippen …" />

          <div className="flex items-center gap-2 pt-1 border-t border-border/50">
            <Monitor size={13} className="text-muted-foreground shrink-0" />
            <span className="text-[11px] text-muted-foreground shrink-0">oder direkt:</span>
            <input
              value={eingabe}
              onChange={e => setEingabe(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && eingabeOk) uebernehmen(eingabe) }}
              placeholder="Hostname oder IP"
              className="flex-1 min-w-0 px-2 py-1 text-xs font-mono rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary"
            />
            <button onClick={() => uebernehmen(eingabe)} disabled={!eingabeOk}
              className="shrink-0 px-2.5 py-1 text-[11px] rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              Übernehmen
            </button>
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
              <button onClick={() => { setHost(''); setSerial(undefined) }}
                className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">anderer PC</button>
            </div>
            <JabraPanel host={host} />
          </div>
        </Card>
      )}

      <Quellordner />
    </div>
  )
}

/**
 * Herkunft des Setups. Der Pfad steht zentral auf dem Netzlaufwerk und ist hier
 * änderbar — so lässt sich ein verschobener Ordner ohne neues Programm-Paket richten.
 */
function Quellordner() {
  const [ordner, setOrdner] = useState('')
  const [geladen, setGeladen] = useState(false)
  const [prueft, setPrueft] = useState(false)
  const [befund, setBefund] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { void ladeJabraQuellordner().then(o => { setOrdner(o); setGeladen(true) }) }, [])

  async function pruefen() {
    setPrueft(true); setBefund(null)
    await setzeJabraQuellordner(ordner)
    const q = await findeJabraSetup()
    setBefund(q.ok
      ? { ok: true, text: `Gefunden: ${q.name}${q.version ? ` · Version ${q.version}` : ''} · ${q.groesseMB} MB` }
      : { ok: false, text: q.fehler || 'Kein Setup gefunden.' })
    setPrueft(false)
  }

  if (!geladen) return null

  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Herkunft des Setups</p>
      <p className="text-[11px] text-muted-foreground">
        Verwendet wird immer die <b>neueste</b> Datei <span className="font-mono">JabraDirect*.exe</span> in diesem Ordner —
        eine neue Version muss also nur dort hineingelegt werden. Der Pfad gilt für alle Admin-PCs.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <input value={ordner} onChange={e => setOrdner(e.target.value)}
          className="flex-1 min-w-[18rem] px-2 py-1 text-[11px] font-mono rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
        <button onClick={pruefen} disabled={prueft}
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
          {prueft ? <Loader2 size={11} className="animate-spin" /> : null}Speichern & prüfen
        </button>
        {ordner !== JABRA_NETZ_ORDNER_STANDARD && (
          <button onClick={() => setOrdner(JABRA_NETZ_ORDNER_STANDARD)}
            className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground underline">Standard</button>
        )}
      </div>
      {befund && (
        <p className={`flex items-start gap-1.5 text-[11px] ${befund.ok ? 'text-emerald-300' : 'text-red-300'}`}>
          {befund.ok ? <CheckCircle2 size={12} className="shrink-0 mt-px" /> : <AlertTriangle size={12} className="shrink-0 mt-px" />}
          {befund.text}
        </p>
      )}
    </div>
  )
}
