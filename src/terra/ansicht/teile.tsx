// Terra Incognita — kleine Bausteine der Oberfläche: Blatt (Dialog), Raum (große Tafel), Rückmeldungen, Zahlen.
import { useEffect, useState, type ReactNode } from 'react'
import { create } from 'zustand'

export const zahl = (n: number): string => Math.round(n).toLocaleString('de-DE')
/** Stunden als Tage mit einer Nachkommastelle: „6,5 Tage“ */
export function tageText(stunden: number, kurz = false): string {
  const zehntel = Math.round((Math.max(0, stunden) * 10) / 24)
  const t = `${Math.floor(zehntel / 10)}${zehntel % 10 ? ',' + (zehntel % 10) : ''}`
  return kurz ? `${t} T.` : `${t} ${zehntel === 10 ? 'Tag' : 'Tage'}`
}
export const bildPfad = (name: string): string => `./terra/bilder/${name}.webp`

// ── kurze Rückmeldungen oben in der Mitte ──
interface ToastStore { liste: { id: number; text: string }[]; zeige: (text: string) => void }
let toastNr = 0
export const useToasts = create<ToastStore>((set, get) => ({
  liste: [],
  zeige: text => {
    const id = ++toastNr
    set({ liste: [...get().liste.slice(-3), { id, text }] })
    setTimeout(() => set({ liste: get().liste.filter(t => t.id !== id) }), 3800)
  },
}))
export const toast = (text: string): void => useToasts.getState().zeige(text)
export function Toasts() {
  const liste = useToasts(s => s.liste)
  if (!liste.length) return null
  return <div className="ti-toasts" aria-live="polite">{liste.map(t => <div key={t.id} className="ti-toast" data-ti-toast>{t.text}</div>)}</div>
}

/** Stimmungsbild, das einfach wegbleibt, wenn die Datei fehlt */
export function Bild({ name, className }: { name?: string; className?: string }) {
  const [fehlt, setFehlt] = useState(false)
  useEffect(() => setFehlt(false), [name])
  if (!name || fehlt) return null
  return <img src={bildPfad(name)} alt="" className={className} decoding="async" onError={() => setFehlt(true)} />
}

/** Ein Blatt Papier über der Karte (Dialog) */
export function Blatt({ bild, ueber, titel, children, fuss, breit, onZu, kennung }: { bild?: string; ueber?: string; titel?: string; children?: ReactNode; fuss?: ReactNode; breit?: boolean; onZu?: () => void; kennung?: string }) {
  useEffect(() => {
    if (!onZu) return
    const taste = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); onZu() } }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [onZu])
  return (
    <div className="ti-schleier" role="dialog" aria-modal="true" data-ti-blatt={kennung ?? ''} onMouseDown={e => { if (e.target === e.currentTarget && onZu) onZu() }}>
      <div className={`ti-blatt${breit ? ' ti-blatt-breit' : ''}`}>
        <Bild name={bild} className="ti-blatt-bild" />
        <div className="ti-blatt-in">
          {ueber && <div className="ti-ueber">{ueber}</div>}
          {titel && <h2>{titel}</h2>}
          {children}
          {fuss && <div className="ti-fuss">{fuss}</div>}
        </div>
      </div>
    </div>
  )
}

export function Folgen({ zeilen }: { zeilen: readonly string[] }) {
  if (!zeilen.length) return null
  return <ul className="ti-folgen" data-ti-folgen>{zeilen.map((z, i) => <li key={i}>{z}</li>)}</ul>
}

export interface Reiter { id: string; name: string; punkt?: boolean }
/** Große Tafel über der Karte (Hafen, Atlas, Ranglisten …) */
export function Raum({ titel, unter, rechts, reiter, aktiv, onReiter, onZu, zuText = 'Schließen', children, kennung }: { titel: string; unter?: string; rechts?: ReactNode; reiter?: readonly Reiter[]; aktiv?: string; onReiter?: (id: string) => void; onZu: () => void; zuText?: string; children: ReactNode; kennung?: string }) {
  useEffect(() => {
    const taste = (e: KeyboardEvent): void => { if (e.key === 'Escape') onZu() }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [onZu])
  return (
    <div className="ti-raum" data-ti-raum={kennung ?? ''}>
      <div className="ti-raum-in">
        <div className="ti-raum-kopf">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2>{titel}</h2>
            {unter && <p>{unter}</p>}
          </div>
          {rechts}
          <button type="button" className="ti-knopf ti-knopf-gold" onClick={onZu} data-ti-zu>{zuText}</button>
        </div>
        {reiter && reiter.length > 1 && (
          <div className="ti-reiter" role="tablist">
            {reiter.map(r => <button key={r.id} type="button" role="tab" aria-selected={aktiv === r.id} className={aktiv === r.id ? 'an' : ''} onClick={() => onReiter?.(r.id)} data-ti-reiter={r.id}>{r.name}{r.punkt && <span className="ti-punkt" />}</button>)}
          </div>
        )}
        <div className="ti-raum-leib">{children}</div>
      </div>
    </div>
  )
}

/** Windrose: Pfeil zeigt, wohin der Wind weht (0 = Ost, im Uhrzeigersinn in Sechstel-Schritten) */
export function Windpfeil({ richtung, staerke, groesse = 34 }: { richtung: number; staerke: number; groesse?: number }) {
  return (
    <svg width={groesse} height={groesse} viewBox="-20 -20 40 40" aria-hidden>
      <circle r="18" fill="none" stroke="var(--ti-rand-stark)" strokeWidth="1" />
      {[0, 1, 2, 3, 4, 5].map(i => <line key={i} x1="14.5" y1="0" x2="18" y2="0" stroke="var(--ti-stumm)" strokeWidth="1" transform={`rotate(${i * 60})`} />)}
      <g transform={`rotate(${richtung * 60})`}>
        <path d="M-11 0 L8 0 M3 -5 L9 0 L3 5" fill="none" stroke="var(--ti-gold-stark)" strokeWidth={1.4 + staerke * 0.5} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
