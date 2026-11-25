// Terra Incognita — Tuscheskizzen für den Atlas, per Code gezeichnet (keine Bilddateien). Motiv = Kennwort aus
// inhalt/atlas.ts; unbekannte Motive bekommen ein Fragezeichen. Zeichenfläche 120 × 80.
import type { ReactNode } from 'react'

const W = 'M4 62 q8 -4 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0'      // Wasserlinie
const MOTIVE: Record<string, ReactNode> = {
  // ── Naturwunder ──
  tor: <><path d="M30 62 V34 q0 -18 30 -18 q30 0 30 18 V62" /><path d="M46 62 V42 q0 -10 14 -10 q14 0 14 10 V62" /><path d={W} /></>,
  saeulen: <><path d="M22 62 V30 h10 V62 M36 62 V22 h10 V62 M50 62 V34 h10 V62 M64 62 V18 h10 V62 M78 62 V28 h10 V62 M92 62 V40 h8 V62" /><path d={W} /></>,
  fontaene: <><path d="M60 62 V18 M60 18 q-10 -8 -14 4 M60 18 q10 -8 14 4 M60 24 q-16 -4 -20 12 M60 24 q16 -4 20 12" /><path d="M30 62 q30 -10 60 0" /><path d="M48 52 q-4 -6 2 -10 M72 50 q6 -6 0 -12" strokeDasharray="2 3" /></>,
  bucht: <><path d="M10 30 q20 -14 40 4 q16 14 40 6 q14 -6 22 4" /><path d="M10 30 V70 M112 44 V70" /><path d="M30 52 l2 2 M52 60 l2 2 M70 52 l2 2 M88 62 l2 2 M44 46 l2 2 M96 54 l2 2" strokeWidth="2.5" /></>,
  fall: <><path d="M20 14 H62 V62 M62 14 q20 2 40 12 V62" /><path d="M34 14 V62 M42 14 V62 M50 14 V62" strokeDasharray="5 3" /><path d="M22 66 q20 -8 44 0" /></>,
  hoehle: <><path d="M12 64 q0 -50 48 -50 q48 0 48 50" /><path d="M36 64 q0 -28 24 -28 q24 0 24 28" /><path d="M48 20 v10 M60 16 v14 M72 20 v9" /></>,
  baum: <><path d="M56 66 q2 -16 -2 -26 M64 66 q-2 -16 2 -26" /><path d="M60 40 q-34 4 -30 -12 q-4 -14 14 -14 q6 -10 18 -6 q14 -6 20 6 q16 2 10 16 q4 14 -32 10z" /><path d="M48 66 h24" /></>,
  berg: <><path d="M14 64 L48 22 h14 L98 64" /><path d="M50 22 q2 -8 -4 -12 M56 20 q8 -6 2 -14 M62 22 q8 -2 8 -10" strokeDasharray="3 3" /><path d="M40 40 l6 6 l6 -8 l8 10" /></>,
  duene: <><path d="M6 60 q30 -40 62 -8 q14 12 46 -4" /><path d="M40 44 q14 4 22 16 M22 58 q20 -6 34 4" /><path d="M74 26 q4 -4 8 0 M82 20 q4 -4 8 0" /></>,
  see: <><ellipse cx="60" cy="46" rx="44" ry="16" /><path d="M32 46 h18 M58 50 h22 M44 40 h12 M70 42 h14" /><path d="M14 30 l14 -14 l12 12 M80 28 l12 -14 l14 14" /></>,
  koralle: <><path d="M40 66 V44 M40 54 l-10 -10 M40 48 l10 -10 M30 44 v-8 M50 38 v-8" /><path d="M74 66 V40 M74 52 l-12 -8 M74 46 l12 -10 M62 44 v-10 M86 36 v-10 M74 40 v-12" /><path d="M16 30 q6 -4 10 0 q-4 4 -10 0 M94 20 q6 -4 10 0 q-4 4 -10 0" /></>,
  licht: <><path d="M10 26 q18 -18 34 0 t34 0 t32 -4" /><path d="M14 38 q18 -16 34 0 t34 0 t28 -2" strokeDasharray="6 3" /><path d="M20 26 v22 M44 26 v20 M70 24 v24 M96 24 v20" strokeDasharray="1 4" /><path d="M8 64 l20 -10 l16 8 l22 -12 l24 12 l22 -8" /></>,
  nadel: <><path d="M52 64 L56 14 q4 -6 8 0 L70 64" /><path d="M58 30 h6 M57 44 h9" /><path d={W} /><path d="M84 22 q4 -4 8 0 M92 30 q4 -4 8 0" /></>,
  klippe: <><path d="M8 26 H44 V62 M44 30 H74 V62 M74 22 H112" /><path d="M18 26 v20 M30 26 v28 M54 30 v18 M64 30 v26 M88 22 v30 M100 22 v22" strokeDasharray="4 4" /><path d={W} /></>,
  eis: <><path d="M26 62 L36 30 L50 40 L60 14 L74 36 L86 28 L96 62" /><path d="M50 40 L56 62 M74 36 L70 62 M60 14 l2 30" /><path d={W} /></>,
  vogel: <><path d="M30 64 V34 q0 -16 30 -16 q30 0 30 16 V64" /><path d="M40 30 q3 -3 6 0 M54 24 q3 -3 6 0 M70 28 q3 -3 6 0 M46 42 q3 -3 6 0 M64 40 q3 -3 6 0 M78 44 q3 -3 6 0 M36 50 q3 -3 6 0 M56 54 q3 -3 6 0" /><path d="M8 20 q5 -5 10 0 q5 -5 10 0 M96 12 q5 -5 10 0 q5 -5 10 0" /></>,
  // ── Tierwelt ──
  wal: <><path d="M12 46 q30 -28 70 -4 q10 6 20 -6 q-2 10 4 16 q-10 -2 -18 2 q-44 16 -76 -8z" /><circle cx="30" cy="42" r="1.6" /><path d="M36 26 q-2 -10 -8 -12 M38 26 q4 -10 10 -10" /></>,
  robbe: <><path d="M16 60 q4 -22 26 -24 q10 -12 22 -6 q8 6 0 14 q20 6 40 16z" /><circle cx="60" cy="36" r="1.5" /><path d="M66 40 l8 -1 M66 42 l8 2" /></>,
  fisch: <><path d="M18 40 q30 -22 60 0 q-30 22 -60 0z" /><path d="M78 40 l20 -14 v28z" /><circle cx="34" cy="38" r="1.8" /><path d="M48 30 q4 10 0 20" /></>,
  schildkroete: <><ellipse cx="58" cy="42" rx="28" ry="18" /><path d="M86 42 q12 -6 16 2 q-6 6 -16 2 M38 30 l-14 -8 M36 54 l-14 8 M76 28 l10 -10 M78 56 l10 10" /><path d="M44 32 l12 10 l-12 10 M56 42 h16 l8 -8 M72 42 l8 8" /></>,
  kalmar: <><path d="M40 40 q0 -22 20 -22 q20 0 20 22 q-6 8 -20 8 q-14 0 -20 -8z" /><path d="M46 48 q-8 12 -2 22 M54 50 q-4 12 2 22 M62 50 q6 10 0 22 M70 48 q10 10 6 22 M76 44 q16 6 14 20" /><circle cx="52" cy="36" r="3" /><circle cx="68" cy="36" r="3" /></>,
  schlange: <><path d="M10 54 q10 -24 20 0 M36 54 q10 -24 20 0 M62 54 q10 -20 20 0" /><path d="M86 54 q6 -30 16 -26 q8 2 6 10 q-6 -2 -10 2" /><circle cx="103" cy="33" r="1.3" /><path d="M4 58 q8 -4 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0" /></>,
  schiff: <><path d="M26 54 h64 l-8 12 h-48z" /><path d="M58 54 V12 M58 16 q22 12 0 34 M58 20 q-18 10 0 28" strokeDasharray="5 3" /><path d="M4 70 q8 -4 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0" /></>,
  baer: <><path d="M20 58 q-2 -22 20 -24 h30 q12 -10 22 -2 q6 8 -2 14 q0 8 -6 12 h-8 v-8 h-28 v8 h-8 v-10 q-6 2 -6 10z" /><circle cx="88" cy="38" r="1.5" /><path d="M10 62 h100" /></>,
  qualle: <><path d="M34 40 q0 -24 26 -24 q26 0 26 24z" /><path d="M42 40 q-4 12 2 26 M52 40 q4 14 -2 28 M62 40 q-4 14 4 28 M72 40 q4 12 -2 24 M80 40 q-4 12 4 22" /></>,
  // ── Kuriositäten ──
  kompass: <><circle cx="60" cy="40" r="26" /><circle cx="60" cy="40" r="20" /><path d="M60 22 L66 40 L60 58 L54 40z" /><path d="M60 14 v6 M60 60 v6 M34 40 h6 M80 40 h6" /></>,
  figur: <><circle cx="60" cy="20" r="8" /><path d="M48 66 q0 -34 12 -38 q12 4 12 38z" /><path d="M50 40 q-10 -4 -12 -14 M70 40 q10 -4 12 -14" /></>,
  flasche: <><path d="M20 30 h52 q8 0 12 8 h16 v8 h-16 q-4 8 -12 8 h-52z" /><path d="M36 46 h28 l-6 6 h-16z M50 46 V34 l12 8" /></>,
  zahn: <><path d="M34 62 q-8 -30 26 -46 q30 14 26 46 q-10 6 -26 4 q-16 2 -26 -4z" /><path d="M46 48 h28 l-4 6 h-20z M60 48 V32 l10 10" /></>,
  stein: <><path d="M28 60 q-10 -22 12 -34 q24 -12 40 4 q16 16 2 30 q-26 12 -54 0z" /><path d="M48 40 l8 6 l8 -8 M54 52 h14" /></>,
  maske: <><path d="M36 16 h48 v26 q0 24 -24 26 q-24 -2 -24 -26z" /><path d="M44 34 q6 -5 12 0 M64 34 q6 -5 12 0 M60 38 v10 M50 56 q10 6 20 0" /></>,
  buch: <><path d="M16 22 q22 -8 44 2 q22 -10 44 -2 v40 q-22 -8 -44 2 q-22 -10 -44 -2z M60 24 v40" /><path d="M26 32 h24 M26 40 h24 M26 48 h18 M70 32 h24 M70 40 h24 M70 48 h18" /></>,
  muenze: <><circle cx="60" cy="40" r="26" /><circle cx="60" cy="40" r="21" /><path d="M60 24 l4 12 h12 l-10 8 l4 12 l-10 -8 l-10 8 l4 -12 l-10 -8 h12z" /></>,
  schluessel: <><circle cx="32" cy="40" r="14" /><circle cx="32" cy="40" r="6" /><path d="M46 40 h56 M84 40 v12 M94 40 v10 M100 40 v14" /></>,
  horn: <><path d="M16 46 q10 -30 44 -24 q30 6 44 -8 q4 20 -18 30 q-30 14 -52 12 q-12 0 -18 -10z" /><path d="M40 32 q10 10 4 24 M62 28 q8 10 2 24" /></>,
  uhr: <><path d="M38 12 h44 M38 68 h44 M42 12 q0 20 18 28 q18 -8 18 -28 M42 68 q0 -20 18 -28 q18 8 18 28" /><path d="M52 62 q8 -10 16 0z M58 30 h4" /></>,
  kette: <><path d="M14 22 q46 46 92 0" /><circle cx="24" cy="31" r="4" /><circle cx="36" cy="39" r="4" /><circle cx="48" cy="44" r="4" /><circle cx="60" cy="46" r="5" /><circle cx="72" cy="44" r="4" /><circle cx="84" cy="39" r="4" /><circle cx="96" cy="31" r="4" /></>,
}

/** Eine Skizze. `blass` zeichnet nur einen Umriss mit Fragezeichen (noch nicht gefunden). */
export default function Skizze({ motiv, breite = 120, blass = false }: { motiv: string; breite?: number; blass?: boolean }) {
  const inhalt = MOTIVE[motiv]
  return (
    <svg viewBox="0 0 120 80" width={breite} height={(breite * 80) / 120} style={{ display: 'block', borderRadius: 6, background: 'var(--ti-flaeche2)', border: '1px solid var(--ti-rand)' }} aria-hidden>
      {blass || !inhalt
        ? <text x="60" y="52" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="34" fill="var(--ti-rand-stark)">?</text>
        : <g fill="none" stroke="var(--ti-ink)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{inhalt}</g>}
    </svg>
  )
}

const FARBEN = ['#C8322B', '#1F4E8C', '#F2C94C', '#F4F1E8', '#1E1E24', '#2E7D4F', '#7A3E9D', '#E07B1F']
const ZEICHEN: ReactNode[] = [
  null,
  <path key="1" d="M30 9 v20 M24 15 h12 M21 23 q0 7 9 7 q9 0 9 -7" fill="none" strokeWidth="2.4" />,
  <path key="2" d="M30 8 l3.5 8 h8 l-6.5 5 l2.5 8 l-7.5 -5 l-7.5 5 l2.5 -8 l-6.5 -5 h8z" strokeWidth="0" />,
  <circle key="3" cx="30" cy="20" r="8" strokeWidth="0" />,
  <path key="4" d="M30 8 l10 12 l-10 12 l-10 -12z" strokeWidth="0" />,
  <path key="5" d="M16 22 q7 -8 14 0 t14 0" fill="none" strokeWidth="3" />,
  <path key="6" d="M18 28 v-12 l6 6 l6 -9 l6 9 l6 -6 v12z" strokeWidth="0" />,
  <path key="7" d="M30 9 v22 M19 20 h22" fill="none" strokeWidth="4" />,
]
export const FLAGGEN_MUSTER = 6, FLAGGEN_FARBEN = FARBEN.length, FLAGGEN_ZEICHEN = ZEICHEN.length

/** Flagge eines Kapitäns: [Muster, Farbe 1, Farbe 2, Zeichen] */
export function Flagge({ fl, breite = 30 }: { fl: readonly number[]; breite?: number }) {
  const a = FARBEN[fl[1] % FARBEN.length], b = FARBEN[fl[2] % FARBEN.length], m = fl[0] % FLAGGEN_MUSTER
  const hell = (f: string): boolean => f === '#F2C94C' || f === '#F4F1E8'
  const zf = hell(m === 0 ? a : b) && m !== 0 ? '#1E1E24' : hell(a) ? '#1E1E24' : '#F4F1E8'
  return (
    <svg viewBox="0 0 60 40" width={breite} height={(breite * 40) / 60} style={{ display: 'inline-block', borderRadius: 2, verticalAlign: 'middle', boxShadow: '0 0 0 1px rgba(0,0,0,0.35)' }} aria-hidden>
      <rect width="60" height="40" fill={a} />
      {m === 1 && <rect y="20" width="60" height="20" fill={b} />}
      {m === 2 && <rect x="30" width="30" height="40" fill={b} />}
      {m === 3 && <path d="M0 15 h60 v10 h-60z M22 0 h10 v40 h-10z" fill={b} />}
      {m === 4 && <path d="M0 0 L60 40 L0 40z" fill={b} />}
      {m === 5 && <rect x="5" y="5" width="50" height="30" fill="none" stroke={b} strokeWidth="5" />}
      <g fill={zf} stroke={zf} strokeLinecap="round" strokeLinejoin="round">{ZEICHEN[fl[3] % ZEICHEN.length]}</g>
    </svg>
  )
}
