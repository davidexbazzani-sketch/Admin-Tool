import { useState, type ClipboardEvent } from 'react'
import { ClipboardPaste, Loader2, Wand2, Image as ImageIcon, AlertTriangle, Check } from 'lucide-react'
import { parseTicketText, type ParseErgebnis } from '../../services/zuweisung/ticketParse'
import { ocrScreenshot, blobToBase64 } from '../../services/zuweisung/ocr'

interface OptionenLite { queues: string[]; cis: string[]; subcats: string[] }

const CHIP_LABEL: Record<string, string> = { group: 'Queue', ci: 'CI', sub: 'Subcat.', caller: 'Melder', short: 'Short', desc: 'Description' }

export default function SchnellEingabe({ optionen, generics = [], onParsed }: { optionen: OptionenLite; generics?: string[]; onParsed: (p: ParseErgebnis) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [err, setErr] = useState('')
  const [erkannt, setErkannt] = useState<Record<string, string> | null>(null)

  const anwenden = (p: ParseErgebnis, quelle: string) => {
    setErkannt(p.erkannt)
    onParsed(p)
    const n = Object.keys(p.erkannt).length
    setStatus(n ? `${quelle}: ${n} Feld(er) erkannt und übernommen.` : `${quelle}: keine Felder erkannt — bitte manuell ausfüllen.`)
  }

  function ausText() {
    if (!text.trim()) { setErr('Bitte zuerst den Ticket-Text einfügen.'); return }
    setErr(''); anwenden(parseTicketText(text, optionen, generics), 'Text')
  }

  async function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const it of Array.from(items)) {
      if (it.type.startsWith('image/')) {
        e.preventDefault()
        const blob = it.getAsFile(); if (!blob) return
        setBusy(true); setErr(''); setStatus('Screenshot wird gelesen (Windows-Texterkennung, offline)…')
        try {
          const b64 = await blobToBase64(blob)
          const txt = await ocrScreenshot(b64)
          setText(txt)
          anwenden(parseTicketText(txt, optionen, generics), 'Screenshot')
        } catch (ex) {
          setErr('Texterkennung fehlgeschlagen: ' + (ex instanceof Error ? ex.message : String(ex))); setStatus('')
        } finally { setBusy(false) }
        return   // Bild verarbeitet, Text-Paste ignorieren
      }
    }
    // kein Bild → normaler Text-Paste (Default)
  }

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ClipboardPaste size={15} className="text-primary" />Ticket einfügen
        <span className="text-[11px] font-normal text-muted-foreground">— ganzes Ticket als Text ODER Screenshot mit <b>Strg&nbsp;+&nbsp;V</b></span>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onPaste={onPaste}
        rows={4}
        placeholder="Hier den kopierten Ticket-Block einfügen (Assignment group, Configuration Item, Caller, Short description, Description …) — oder einen Screenshot des Tickets mit Strg+V."
        className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary resize-y font-mono"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={ausText} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}Auslesen
        </button>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><ImageIcon size={12} />Screenshot: einfach in das Feld einfügen</span>
        {busy && <span className="inline-flex items-center gap-1 text-[11px] text-primary"><Loader2 size={11} className="animate-spin" />OCR läuft…</span>}
      </div>
      {status && <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300"><Check size={12} />{status}</div>}
      {err && <div className="inline-flex items-start gap-1.5 text-[11px] text-red-300"><AlertTriangle size={12} className="mt-0.5" />{err}</div>}
      {erkannt && Object.keys(erkannt).length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {Object.entries(erkannt).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border max-w-[22rem] truncate" title={v}>
              <b className="text-foreground/80">{CHIP_LABEL[k] || k}:</b> {v.slice(0, 60)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
