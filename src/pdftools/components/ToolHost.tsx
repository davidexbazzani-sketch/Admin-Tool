// ── PDF-Werkzeuge: Aktions-Dispatcher (Operations-Modals) ────────────────────
// Pro Werkzeug ein passendes Modal. Clientseitig umsetzbare Funktionen sind
// real; Funktionen, die einen Dienst brauchen, zeigen einen klaren Hinweis.
import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import SignaturePad from '../../components/SignaturePad'
import { toolById } from '../config'
import type { PlacementResult } from './PdfViewer'
import { Modal, Field, inputStyle, ServiceNote, Spinner } from './ui'
import {
  openPdfViaDialog, openFilesViaDialog, savePdf, saveText, base64ToBytes, stripExt,
} from '../tools/io'
import {
  mergePdfs, deletePages, extractPages, rotatePages, insertBlankPage, reorderPages,
  addWatermark, addHeaderFooter, addBatesNumbering, flattenDocument, placePngImage,
  placeText, placeRect, listFormFields, setTextFieldValues, createBlankPdf, createPdfFromImage,
  recompress, createTextFieldAt, getPageCount, type FormFieldInfo,
} from '../tools/pdfOps'
import { loadPdf, getAllText, exportPagesAsImages } from '../tools/render'
import { ocrDocument } from '../tools/ocr'
import { exportOffice, type OfficeFormat } from '../tools/officeExport'

interface Props {
  toolId: string
  data: Uint8Array | null
  fileName: string
  sourcePath?: string
  onClose: () => void
  onReplace: (bytes: Uint8Array, fileName?: string) => void
  onOpenNew: (fileName: string, bytes: Uint8Array) => void
  placeThen: (cb: (pos: PlacementResult) => void | Promise<void>) => void
}

const STAMP_PRESETS = ['Genehmigt', 'Geprüft', 'Vertraulich', 'Erledigt', 'Entwurf', 'Bezahlt']

export default function ToolHost(props: Props) {
  const { toolId, data, fileName, onClose, onReplace, onOpenNew, placeThen } = props
  const tool = toolById(toolId)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  // generische Formularzustaende
  const [text, setText] = useState('')
  const [n1, setN1] = useState(0)
  const [n2, setN2] = useState(60)
  const [b1, setB1] = useState(true)
  const [fields, setFields] = useState<FormFieldInfo[]>([])
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [picked, setPicked] = useState<{ name: string; data: Uint8Array }[]>([])
  const [pageCount, setPageCount] = useState(0)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [order, setOrder] = useState<number[]>([])
  const sigData = useRef<string | null>(null)

  const needsDoc = !['mergePdf', 'createPdf'].includes(toolId)

  useEffect(() => {
    if (!data) return
    if (['organize', 'deletePages', 'extractPages', 'insertPages', 'splitPdf'].includes(toolId)) {
      getPageCount(data).then(c => { setPageCount(c); setOrder(Array.from({ length: c }, (_, i) => i)) })
    }
    if (['fillForm', 'detectFields', 'formData'].includes(toolId)) {
      listFormFields(data).then(setFields)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolId, data])

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true); setErr(''); setMsg('')
    try { await fn() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  function toggleSel(i: number) {
    setSel(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  }

  if (!tool) return null

  if (needsDoc && !data) {
    return <Modal title={tool.label} onClose={onClose}><p style={{ color: 'var(--px-text-2)' }}>Bitte öffne zuerst ein PDF-Dokument.</p></Modal>
  }

  const footerBusy = busy ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--px-text-2)', fontSize: 13 }}><Spinner /> Bitte warten…</span> : null
  const errBox = err ? <p style={{ color: 'var(--px-danger)', fontSize: 13, marginTop: 10 }}>{err}</p> : null
  const msgBox = msg ? <p style={{ color: 'var(--px-safe)', fontSize: 13, marginTop: 10 }}>{msg}</p> : null

  // ── Service-Hinweise ──
  const SERVICE: Record<string, string> = {
    editContent: 'Direktes Bearbeiten von vorhandenem Text/Bild im PDF ist sehr aufwändig und wird über einen Bearbeitungs-Dienst angebunden. Du kannst vorerst Text/Notizen überlagern (Ausfüllen & Unterschreiben).',
    cropPages: 'Zuschneiden der Seitenränder wird in einer Folgeversion ergänzt.',
    preflight: 'PDF/A- und PDF/X-Prüfung/Konvertierung erfolgt über einen Preflight-Dienst.',
    formCalc: 'Feldberechnungen und Validierungen per Skript werden über einen Formular-Dienst angebunden.',
    password: 'Passwortschutz/Verschlüsselung wird über einen Sicherheits-Dienst angebunden (clientseitig nicht sicher umsetzbar).',
    certSign: 'Zertifikatsbasierte, rechtssichere Signatur erfolgt über einen Signatur-Dienst (z.B. mit Smartcard/HSM).',
    sendForSign: 'Der E-Sign-Versand mit Statusverfolgung wird an einen E-Sign-Dienst angebunden.',
    accessibility: 'Automatisches Taggen und die Barrierefreiheits-Prüfung werden über einen Dienst ergänzt.',
    measure: 'Mess-Werkzeuge (Distanz/Fläche/Umfang) folgen in einer Folgeversion.',
    portfolio: 'PDF-Portfolios (Sammlungen) werden in einer Folgeversion ergänzt.',
    draw: 'Freihand-Zeichnen direkt auf der Seite folgt; nutze vorerst „Formen“ oder „Notiz“.',
    callout: 'Sprechblasen folgen; nutze vorerst „Textfeld“ + „Formen“.',
    comments: 'Die Kommentar-Verwaltung (Liste, Filter, Antworten) folgt in einer Folgeversion.',
  }
  if (SERVICE[toolId]) {
    return <Modal title={tool.label} onClose={onClose}><ServiceNote text={SERVICE[toolId]} /></Modal>
  }

  // ── Platzierungs-Werkzeuge (Klick auf Seite) ──
  function startPlace(cb: (pos: PlacementResult) => void | Promise<void>) {
    placeThen(cb)  // schliesst das Modal und aktiviert den Klick-Modus im Viewer
  }

  switch (toolId) {
    case 'mergePdf':
      return (
        <Modal title="PDFs zusammenführen" onClose={onClose}
          footer={<><span style={{ flex: 1 }} />{footerBusy}<button className="pdfx-btn" onClick={async () => {
            const f = await openPdfViaDialog(); if (f) setPicked(p => [...p, { name: f.name, data: f.data }])
          }}>Datei hinzufügen</button>
          <button className="pdfx-btn pdfx-btn-primary" disabled={busy || (picked.length + (data ? 1 : 0) < 2)} onClick={() => withBusy(async () => {
            const parts: Uint8Array[] = []
            if (data) parts.push(data)
            picked.forEach(p => parts.push(p.data))
            const out = await mergePdfs(parts)
            if (data) onReplace(out, 'Zusammengefuehrt.pdf'); else onOpenNew('Zusammengefuehrt.pdf', out)
            onClose()
          })}>Zusammenführen</button></>}>
          <p style={{ color: 'var(--px-text-2)', fontSize: 13, marginBottom: 12 }}>{data ? 'Das aktuelle Dokument bildet den Anfang. Füge weitere PDFs hinzu.' : 'Füge mindestens zwei PDFs hinzu.'}</p>
          <ol style={{ paddingLeft: 18, fontSize: 13 }}>
            {data && <li style={{ marginBottom: 4 }}><strong>{fileName}</strong> (aktuell)</li>}
            {picked.map((p, i) => <li key={i} style={{ marginBottom: 4 }}>{p.name}</li>)}
          </ol>
          {errBox}
        </Modal>
      )

    case 'organize':
    case 'deletePages':
    case 'extractPages':
    case 'insertPages':
    case 'splitPdf':
      return (
        <Modal title="Seiten organisieren" onClose={onClose} wide footer={<>{footerBusy}<span style={{ flex: 1 }} /><button className="pdfx-btn" onClick={onClose}>Schließen</button></>}>
          <p style={{ color: 'var(--px-text-2)', fontSize: 13, marginBottom: 12 }}>
            Seiten auswählen, dann eine Aktion wählen. Reihenfolge mit den Pfeilen ändern.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <button className="pdfx-btn" onClick={() => setSel(new Set(order))}>Alle</button>
            <button className="pdfx-btn" onClick={() => setSel(new Set())}>Keine</button>
            <button className="pdfx-btn pdfx-btn-danger" disabled={busy || sel.size === 0} onClick={() => withBusy(async () => {
              const out = await deletePages(data!, Array.from(sel)); onReplace(out); onClose()
            })}>Löschen</button>
            <button className="pdfx-btn" disabled={busy || sel.size === 0} onClick={() => withBusy(async () => {
              const out = await extractPages(data!, Array.from(sel).sort((a, b) => a - b)); await savePdf(out, `${stripExt(fileName)}_Auszug.pdf`)
            })}>Extrahieren</button>
            <button className="pdfx-btn" disabled={busy || sel.size === 0} onClick={() => withBusy(async () => {
              const out = await rotatePages(data!, Array.from(sel), 90); onReplace(out)
            })}>90° drehen</button>
            <button className="pdfx-btn" disabled={busy} onClick={() => withBusy(async () => {
              const out = await insertBlankPage(data!, pageCount, undefined); onReplace(out); onClose()
            })}>Leere Seite</button>
            <button className="pdfx-btn" disabled={busy} onClick={() => withBusy(async () => {
              const out = await reorderPages(data!, order); onReplace(out)
            })}>Reihenfolge anwenden</button>
            <button className="pdfx-btn" disabled={busy} onClick={() => withBusy(async () => {
              const dir = await (await import('../../electronAPI')).api().selectDirectory()
              if (!dir) return
              const apiRef = (await import('../../electronAPI')).api()
              const { bytesToBase64 } = await import('../tools/io')
              for (let i = 0; i < order.length; i++) {
                const single = await extractPages(data!, [order[i]])
                await apiRef.writeFile(`${dir}\\${stripExt(fileName)}_Seite_${String(i + 1).padStart(3, '0')}.pdf`, bytesToBase64(single))
              }
              setMsg(`${order.length} Einzelseiten gespeichert.`)
            })}>In Einzelseiten teilen</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
            {order.map((pageIdx, pos) => (
              <div key={pageIdx} className="pdfx-card" style={{ padding: 8, textAlign: 'center', border: sel.has(pageIdx) ? '2px solid var(--px-accent)' : undefined }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={sel.has(pageIdx)} onChange={() => toggleSel(pageIdx)} />
                  Seite {pageIdx + 1}
                </label>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 6 }}>
                  <button className="pdfx-btn" style={{ padding: '2px 8px' }} disabled={pos === 0} onClick={() => setOrder(o => { const n = [...o];[n[pos - 1], n[pos]] = [n[pos], n[pos - 1]]; return n })}>↑</button>
                  <button className="pdfx-btn" style={{ padding: '2px 8px' }} disabled={pos === order.length - 1} onClick={() => setOrder(o => { const n = [...o];[n[pos + 1], n[pos]] = [n[pos], n[pos + 1]]; return n })}>↓</button>
                </div>
              </div>
            ))}
          </div>
          {errBox}{msgBox}
        </Modal>
      )

    case 'watermark':
      return (
        <Modal title="Wasserzeichen" onClose={onClose} footer={<>{footerBusy}<button className="pdfx-btn" onClick={onClose}>Abbrechen</button>
          <button className="pdfx-btn pdfx-btn-primary" disabled={busy || !text.trim()} onClick={() => withBusy(async () => {
            const out = await addWatermark(data!, { text, opacity: (n2 || 18) / 100 }); onReplace(out); onClose()
          })}>Anwenden</button></>}>
          <Field label="Text" hint="Wird diagonal über alle Seiten gelegt."><input style={inputStyle} value={text} onChange={e => setText(e.target.value)} placeholder="z.B. Vertraulich" /></Field>
          <Field label="Deckkraft (%)"><input style={inputStyle} type="number" min={5} max={100} value={n2} onChange={e => setN2(Number(e.target.value))} /></Field>
          {errBox}
        </Modal>
      )

    case 'headerFooter':
      return (
        <Modal title="Kopf-/Fußzeile" onClose={onClose} footer={<>{footerBusy}<button className="pdfx-btn" onClick={onClose}>Abbrechen</button>
          <button className="pdfx-btn pdfx-btn-primary" disabled={busy} onClick={() => withBusy(async () => {
            const out = await addHeaderFooter(data!, { headerText: text || undefined, footerText: undefined, showPageNumbers: b1 }); onReplace(out); onClose()
          })}>Anwenden</button></>}>
          <Field label="Kopfzeilen-Text (optional)"><input style={inputStyle} value={text} onChange={e => setText(e.target.value)} /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}><input type="checkbox" checked={b1} onChange={e => setB1(e.target.checked)} /> Seitenzahlen unten einfügen</label>
          {errBox}
        </Modal>
      )

    case 'bates':
      return (
        <Modal title="Bates-Nummerierung" onClose={onClose} footer={<>{footerBusy}<button className="pdfx-btn" onClick={onClose}>Abbrechen</button>
          <button className="pdfx-btn pdfx-btn-primary" disabled={busy} onClick={() => withBusy(async () => {
            const out = await addBatesNumbering(data!, { prefix: text, start: n1 || 1, digits: 6 }); onReplace(out); onClose()
          })}>Anwenden</button></>}>
          <Field label="Präfix (optional)" hint="z.B. AKTE-"><input style={inputStyle} value={text} onChange={e => setText(e.target.value)} /></Field>
          <Field label="Startnummer"><input style={inputStyle} type="number" value={n1} onChange={e => setN1(Number(e.target.value))} /></Field>
          {errBox}
        </Modal>
      )

    case 'flatten':
      return (
        <Modal title="Fixieren (Flatten)" onClose={onClose} footer={<>{footerBusy}<button className="pdfx-btn" onClick={onClose}>Abbrechen</button>
          <button className="pdfx-btn pdfx-btn-primary" disabled={busy} onClick={() => withBusy(async () => { const out = await flattenDocument(data!); onReplace(out); onClose() })}>Fixieren</button></>}>
          <p style={{ fontSize: 14, color: 'var(--px-text-2)' }}>Brennt Formularfelder und Anmerkungen fest ins PDF ein. Danach sind sie nicht mehr separat bearbeitbar.</p>
          {errBox}
        </Modal>
      )

    case 'compress':
      return (
        <Modal title="Verkleinern" onClose={onClose} footer={<>{footerBusy}<button className="pdfx-btn" onClick={onClose}>Schließen</button>
          <button className="pdfx-btn pdfx-btn-primary" disabled={busy} onClick={() => withBusy(async () => {
            const before = data!.byteLength; const out = await recompress(data!); onReplace(out)
            setMsg(`Größe: ${(before / 1024).toFixed(0)} KB → ${(out.byteLength / 1024).toFixed(0)} KB`)
          })}>Optimieren</button></>}>
          <p style={{ fontSize: 14, color: 'var(--px-text-2)' }}>Speichert das PDF neu und kann die Dateigröße etwas reduzieren. Für starke Komprimierung (Bild-Neukodierung) ist später ein Dienst vorgesehen.</p>
          {errBox}{msgBox}
        </Modal>
      )

    case 'exportImage':
      return (
        <Modal title="Als Bild exportieren" onClose={onClose} footer={<>{footerBusy}<button className="pdfx-btn" onClick={onClose}>Schließen</button>
          <button className="pdfx-btn pdfx-btn-primary" disabled={busy} onClick={() => withBusy(async () => {
            const res = await exportPagesAsImages(data!, stripExt(fileName), b1 ? 'png' : 'jpeg', 2)
            if (res.cancelled) return
            setMsg(`${res.count} Bild(er) gespeichert.`)
          })}>Exportieren</button></>}>
          <p style={{ fontSize: 13, color: 'var(--px-text-2)', marginBottom: 12 }}>Jede Seite wird als Bild in einen Ordner deiner Wahl gespeichert.</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}><input type="checkbox" checked={b1} onChange={e => setB1(e.target.checked)} /> Als PNG (sonst JPG)</label>
          {errBox}{msgBox}
        </Modal>
      )

    case 'exportText':
      return (
        <Modal title="Als Text exportieren" onClose={onClose} footer={<>{footerBusy}<button className="pdfx-btn" onClick={onClose}>Schließen</button>
          <button className="pdfx-btn pdfx-btn-primary" disabled={busy} onClick={() => withBusy(async () => {
            const doc = await loadPdf(data!); const txt = await getAllText(doc); await saveText(txt, `${stripExt(fileName)}.txt`)
          })}>Text speichern</button></>}>
          <p style={{ fontSize: 14, color: 'var(--px-text-2)' }}>Extrahiert den Textinhalt aller Seiten und speichert ihn als .txt-Datei.</p>
          {errBox}
        </Modal>
      )

    case 'ocr':
      return (
        <Modal title="Texterkennung (OCR)" onClose={onClose} footer={<>{footerBusy}<button className="pdfx-btn" onClick={onClose}>Schließen</button>
          <button className="pdfx-btn pdfx-btn-primary" disabled={busy} onClick={() => withBusy(async () => {
            const txt = await ocrDocument(data!, { onProgress: p => setMsg(`Seite ${p.page}/${p.totalPages}: ${p.status} ${Math.round(p.progress * 100)}%`) })
            await saveText(txt, `${stripExt(fileName)}_OCR.txt`); setMsg('Fertig — Text gespeichert.')
          })}>Erkennen & speichern</button></>}>
          <p style={{ fontSize: 13, color: 'var(--px-text-2)' }}>Erkennt Text in gescannten Seiten (Deutsch + Englisch) und speichert ihn als Textdatei.</p>
          <p style={{ fontSize: 11, color: 'var(--px-text-3)', marginTop: 8 }}>Hinweis: Beim ersten Lauf werden Sprachdaten geladen — das kann kurz dauern.</p>
          {msgBox}{errBox}
        </Modal>
      )

    case 'exportOffice':
      return (
        <Modal title="Word / Excel / PowerPoint" onClose={onClose} footer={<>{footerBusy}<button className="pdfx-btn" onClick={onClose}>Schließen</button></>}>
          <p style={{ fontSize: 13, color: 'var(--px-text-2)', marginBottom: 12 }}>Exportiert den Textinhalt des PDFs in das gewählte Office-Format.</p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {(['word', 'excel', 'ppt'] as OfficeFormat[]).map(fmt => (
              <button key={fmt} className="pdfx-btn pdfx-btn-primary" disabled={busy} onClick={() => withBusy(async () => {
                const res = await exportOffice(data!, fileName, fmt)
                if (res.ok && !res.cancelled) setMsg('Datei gespeichert.')
                else if (res.error) setErr(res.error)
              })}>{fmt === 'word' ? 'Word (.docx)' : fmt === 'excel' ? 'Excel (.xlsx)' : 'PowerPoint (.pptx)'}</button>
            ))}
          </div>
          <ServiceNote text="Es wird der erkennbare Text uebertragen. Originalgetreues Layout (Spalten, eingebettete Bilder, Tabellen-Erkennung) erfordert einen Konvertierungs-Dienst." />
          {msgBox}{errBox}
        </Modal>
      )

    case 'createPdf':
      return (
        <Modal title="PDF erstellen" onClose={onClose} footer={<>{footerBusy}<button className="pdfx-btn" onClick={onClose}>Abbrechen</button></>}>
          <p style={{ fontSize: 13, color: 'var(--px-text-2)', marginBottom: 14 }}>Womit möchtest du starten?</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="pdfx-btn" disabled={busy} onClick={() => withBusy(async () => { const out = await createBlankPdf(1); onOpenNew('Neu.pdf', out); onClose() })}>Leeres Dokument</button>
            <button className="pdfx-btn" disabled={busy} onClick={() => withBusy(async () => {
              const f = await openFilesViaDialog(['png', 'jpg', 'jpeg']); if (!f) return
              const kind = f.name.toLowerCase().endsWith('.png') ? 'png' : 'jpg'
              const out = await createPdfFromImage(f.data, kind); onOpenNew(`${stripExt(f.name)}.pdf`, out); onClose()
            })}>Aus Bild (PNG/JPG)</button>
          </div>
          {errBox}
        </Modal>
      )

    case 'sign':
      return (
        <Modal title="Unterschreiben" onClose={onClose} footer={<><span style={{ flex: 1 }} /><button className="pdfx-btn" onClick={onClose}>Abbrechen</button>
          <button className="pdfx-btn pdfx-btn-primary" onClick={() => {
            const url = sigData.current
            if (!url) { setErr('Bitte zuerst unterschreiben.'); return }
            const bytes = base64ToBytes(url.split(',')[1] ?? '')
            startPlace(async (pos) => { const out = await placePngImage(data!, bytes, { pageIndex: pos.pageIndex, x: pos.xPdf, y: pos.yPdf - 50, width: 170, height: 60 }); onReplace(out) })
          }}>Platzieren →</button></>}>
          <p style={{ fontSize: 13, color: 'var(--px-text-2)', marginBottom: 12 }}>Unterschreibe unten, dann klicke „Platzieren“ und tippe auf die Stelle im Dokument.</p>
          <SignaturePad onChange={(d) => { sigData.current = d }} />
          {errBox}
        </Modal>
      )

    case 'addText':
    case 'note':
    case 'textbox':
      return (
        <Modal title={tool.label} onClose={onClose} footer={<><span style={{ flex: 1 }} /><button className="pdfx-btn" onClick={onClose}>Abbrechen</button>
          <button className="pdfx-btn pdfx-btn-primary" disabled={!text.trim()} onClick={() => {
            const value = text
            startPlace(async (pos) => { const out = await placeText(data!, { pageIndex: pos.pageIndex, x: pos.xPdf, y: pos.yPdf, text: value, size: 12 }); onReplace(out) })
          }}>Platzieren →</button></>}>
          <Field label="Text" hint="Nach dem Klick auf „Platzieren“ tippst du die Stelle im Dokument an.">
            <input style={inputStyle} value={text} onChange={e => setText(e.target.value)} placeholder="Text eingeben…" autoFocus />
          </Field>
          <button className="pdfx-btn" style={{ marginTop: 4 }} onClick={() => setText(new Date().toLocaleDateString('de-DE'))}>Heutiges Datum einsetzen</button>
        </Modal>
      )

    case 'stamp':
      return (
        <Modal title="Stempel" onClose={onClose}>
          <p style={{ fontSize: 13, color: 'var(--px-text-2)', marginBottom: 12 }}>Stempel wählen, dann auf die Stelle im Dokument tippen.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {STAMP_PRESETS.map(s => (
              <button key={s} className="pdfx-btn" onClick={() => startPlace(async (pos) => {
                const out = await placeText(data!, { pageIndex: pos.pageIndex, x: pos.xPdf, y: pos.yPdf, text: s, size: 22, color: [0.78, 0, 0.08] }); onReplace(out)
              })}>{s}</button>
            ))}
          </div>
        </Modal>
      )

    case 'highlight':
      return (
        <Modal title="Hervorheben" onClose={onClose}>
          <p style={{ fontSize: 13, color: 'var(--px-text-2)', marginBottom: 12 }}>Tippe auf die Stelle, die markiert werden soll (gelber Balken).</p>
          <button className="pdfx-btn pdfx-btn-primary" onClick={() => startPlace(async (pos) => {
            const out = await placeRect(data!, { pageIndex: pos.pageIndex, x: pos.xPdf, y: pos.yPdf, width: 160, height: 16, color: [1, 0.92, 0.2], opacity: 0.4 }); onReplace(out)
          })}>Markierung platzieren →</button>
        </Modal>
      )

    case 'shapes':
      return (
        <Modal title="Form einfügen" onClose={onClose}>
          <p style={{ fontSize: 13, color: 'var(--px-text-2)', marginBottom: 12 }}>Tippe auf die Stelle, an der ein Rechteck eingefügt werden soll.</p>
          <button className="pdfx-btn pdfx-btn-primary" onClick={() => startPlace(async (pos) => {
            const out = await placeRect(data!, { pageIndex: pos.pageIndex, x: pos.xPdf, y: pos.yPdf, width: 120, height: 70, opacity: 0, border: true }); onReplace(out)
          })}>Rechteck platzieren →</button>
        </Modal>
      )

    case 'redact':
      return (
        <Modal title="Schwärzen" onClose={onClose}>
          <ServiceNote text="Achtung: Diese Schnell-Schwärzung legt einen deckenden schwarzen Balken über die Stelle. Für rechtssicheres, unwiderrufliches Entfernen samt Metadaten ist ein Redaction-Dienst vorgesehen — bitte anschließend „Fixieren“ anwenden." />
          <button className="pdfx-btn pdfx-btn-danger" style={{ marginTop: 14 }} onClick={() => startPlace(async (pos) => {
            const out = await placeRect(data!, { pageIndex: pos.pageIndex, x: pos.xPdf, y: pos.yPdf, width: 160, height: 18, color: [0, 0, 0], opacity: 1 }); onReplace(out)
          })}>Schwarzen Balken platzieren →</button>
        </Modal>
      )

    case 'fillForm':
      return (
        <Modal title="Formular ausfüllen" onClose={onClose} footer={<>{footerBusy}<button className="pdfx-btn" onClick={onClose}>Abbrechen</button>
          <button className="pdfx-btn pdfx-btn-primary" disabled={busy || fields.length === 0} onClick={() => withBusy(async () => { const out = await setTextFieldValues(data!, fieldValues); onReplace(out); onClose() })}>Übernehmen</button></>}>
          {fields.length === 0 ? <p style={{ color: 'var(--px-text-2)' }}>In diesem PDF wurden keine Formularfelder gefunden. Du kannst Text frei platzieren („Text/Datum setzen“).</p> : (
            fields.map(f => (
              <Field key={f.name} label={f.name}>
                <input style={inputStyle} value={fieldValues[f.name] ?? ''} onChange={e => setFieldValues(v => ({ ...v, [f.name]: e.target.value }))} />
              </Field>
            ))
          )}
          {errBox}
        </Modal>
      )

    case 'detectFields':
      return (
        <Modal title="Felder erkennen" onClose={onClose}>
          {fields.length === 0 ? <p style={{ color: 'var(--px-text-2)' }}>Keine Formularfelder gefunden.</p> : (
            <ul style={{ fontSize: 13, paddingLeft: 18 }}>{fields.map(f => <li key={f.name} style={{ marginBottom: 4 }}><strong>{f.name}</strong> <span style={{ color: 'var(--px-text-3)' }}>({f.type})</span></li>)}</ul>
          )}
        </Modal>
      )

    case 'addFields':
      return (
        <Modal title="Feld anlegen" onClose={onClose} footer={<><span style={{ flex: 1 }} /><button className="pdfx-btn" onClick={onClose}>Abbrechen</button>
          <button className="pdfx-btn pdfx-btn-primary" disabled={!text.trim()} onClick={() => { const name = text; startPlace(async (pos) => { const out = await createTextFieldAt(data!, name, { pageIndex: pos.pageIndex, x: pos.xPdf, y: pos.yPdf, width: 160, height: 22 }); onReplace(out) }) }}>Platzieren →</button></>}>
          <Field label="Feldname" hint="Eindeutiger Name des Textfelds."><input style={inputStyle} value={text} onChange={e => setText(e.target.value)} placeholder="z.B. Name" autoFocus /></Field>
        </Modal>
      )

    case 'formData':
      return (
        <Modal title="Formulardaten" onClose={onClose} footer={<>{footerBusy}<button className="pdfx-btn" onClick={onClose}>Schließen</button></>}>
          <p style={{ fontSize: 13, color: 'var(--px-text-2)', marginBottom: 12 }}>{fields.length} Feld(er) gefunden.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pdfx-btn" disabled={busy} onClick={() => withBusy(async () => {
              const out: Record<string, string> = {}
              fields.forEach(f => { out[f.name] = f.value ?? '' })
              await saveText(JSON.stringify(out, null, 2), `${stripExt(fileName)}_Formulardaten.json`)
            })}>Daten exportieren (JSON)</button>
            <button className="pdfx-btn" disabled={busy} onClick={() => withBusy(async () => {
              const f = await openFilesViaDialog(['json']); if (!f) return
              const obj = JSON.parse(new TextDecoder().decode(f.data)) as Record<string, string>
              const out = await setTextFieldValues(data!, obj); onReplace(out); setMsg('Daten importiert.')
            })}>Daten importieren (JSON)</button>
          </div>
          {msgBox}{errBox}
        </Modal>
      )

    case 'compare':
      return (
        <Modal title="Versionen vergleichen" onClose={onClose} wide footer={<>{footerBusy}<button className="pdfx-btn" onClick={onClose}>Schließen</button>
          <button className="pdfx-btn pdfx-btn-primary" disabled={busy} onClick={() => withBusy(async () => {
            const f = await openPdfViaDialog(); if (!f) return
            const a = await getAllText(await loadPdf(data!)); const b = await getAllText(await loadPdf(f.data))
            const la = a.split('\n'); const lb = new Set(b.split('\n'))
            const laSet = new Set(la)
            const removed = la.filter(l => l.trim() && !lb.has(l)).length
            const added = b.split('\n').filter(l => l.trim() && !laSet.has(l)).length
            setMsg(`Im Vergleich zu „${f.name}“: ${added} neue, ${removed} entfernte Zeilen (textbasiert).`)
          })}>Zweites PDF wählen</button></>}>
          <p style={{ fontSize: 14, color: 'var(--px-text-2)' }}>Vergleicht den Textinhalt des aktuellen Dokuments mit einem zweiten PDF. (Eine seitengenaue visuelle Gegenüberstellung folgt.)</p>
          {msgBox}{errBox}
        </Modal>
      )

    case 'batch':
      return (
        <Modal title="Stapelverarbeitung" onClose={onClose} footer={<>{footerBusy}<span style={{ flex: 1 }} /><button className="pdfx-btn" onClick={async () => { const f = await openPdfViaDialog(); if (f) setPicked(p => [...p, { name: f.name, data: f.data }]) }}>PDF hinzufügen</button>
          <button className="pdfx-btn pdfx-btn-primary" disabled={busy || picked.length === 0} onClick={() => withBusy(async () => {
            const apiRef = (await import('../../electronAPI')).api()
            const { bytesToBase64 } = await import('../tools/io')
            const dir = await apiRef.selectDirectory(); if (!dir) return
            for (const p of picked) {
              let out = p.data
              if (n1 === 0) out = await flattenDocument(p.data)
              else if (n1 === 1) out = await addWatermark(p.data, { text: text || 'Kopie' })
              else out = await recompress(p.data)
              await apiRef.writeFile(`${dir}\\${stripExt(p.name)}_bearbeitet.pdf`, bytesToBase64(out))
            }
            setMsg(`${picked.length} Datei(en) verarbeitet.`)
          })}>Ausführen</button></>}>
          <p style={{ fontSize: 13, color: 'var(--px-text-2)', marginBottom: 12 }}>Wende denselben Schritt auf mehrere PDFs an. Ergebnis landet in einem Ordner deiner Wahl.</p>
          <Field label="Aktion">
            <select style={inputStyle} value={n1} onChange={e => setN1(Number(e.target.value))}>
              <option value={0}>Fixieren (Flatten)</option>
              <option value={1}>Wasserzeichen</option>
              <option value={2}>Verkleinern</option>
            </select>
          </Field>
          {n1 === 1 && <Field label="Wasserzeichen-Text"><input style={inputStyle} value={text} onChange={e => setText(e.target.value)} placeholder="Kopie" /></Field>}
          <div style={{ fontSize: 13 }}>{picked.length} Datei(en): {picked.map(p => p.name).join(', ')}</div>
          {msgBox}{errBox}
        </Modal>
      )

    case 'bookmarks':
      return <BookmarksModal data={data!} onClose={onClose} />

    default:
      return (
        <Modal title={tool.label} onClose={onClose}>
          <p style={{ color: 'var(--px-text-2)', fontSize: 14 }}>{tool.tooltip}</p>
          <ServiceNote text="Diese Funktion ist im Aufbau und wird in einer Folgeversion ergänzt." />
        </Modal>
      )
  }
}

// Lesezeichen (Gliederung) anzeigen — pdfjs getOutline.
function BookmarksModal({ data, onClose }: { data: Uint8Array; onClose: () => void }) {
  const [items, setItems] = useState<{ title: string; level: number }[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const doc = await loadPdf(data)
      const outline = await doc.getOutline().catch(() => null)
      const flat: { title: string; level: number }[] = []
      const walk = (arr: { title: string; items?: unknown[] }[], level: number) => {
        for (const it of arr) { flat.push({ title: it.title, level }); if (Array.isArray(it.items)) walk(it.items as typeof arr, level + 1) }
      }
      if (Array.isArray(outline)) walk(outline as { title: string; items?: unknown[] }[], 0)
      if (alive) { setItems(flat); setLoading(false) }
    })()
    return () => { alive = false }
  }, [data])
  return (
    <Modal title="Lesezeichen & Links" onClose={onClose}>
      {loading ? <p style={{ display: 'flex', gap: 8, color: 'var(--px-text-2)' }}><Loader2 size={16} className="pdfx-spin" /> Lade …</p>
        : items.length === 0 ? <p style={{ color: 'var(--px-text-2)' }}>Dieses PDF hat keine Lesezeichen. Das Anlegen/Bearbeiten folgt in einer Folgeversion.</p>
          : <ul style={{ fontSize: 13, listStyle: 'none', padding: 0 }}>{items.map((it, i) => <li key={i} style={{ padding: '4px 0', paddingLeft: it.level * 16, color: 'var(--px-text)' }}>• {it.title}</li>)}</ul>}
    </Modal>
  )
}
