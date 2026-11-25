// Logo und Symbole des Brain Trainers.
import { Box, Calculator, Compass, Crosshair, Flame, Globe2, Languages, Mountain, Puzzle, Shapes, Sparkles, Star, Target, Trophy, Zap, Brain, BrainCircuit } from 'lucide-react'
import type { Gebiet } from './kern/typen'
import type { AbzeichenInfo } from './kern/fortschritt'

/**
 * Logo: links die „gefaltete“ Hälfte (Denken in Regeln), rechts ein Netz aus Knoten (Verknüpfen),
 * ein Knoten leuchtet warm. Eigene Farben — bewusst anders als das Cyan des IT Admin Tools.
 */
export function BrainLogo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Brain Trainer" style={{ flex: 'none', display: 'block' }}>
      <defs>
        <linearGradient id="bt-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9D8CFF" />
          <stop offset="1" stopColor="#5B45E0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="118" height="118" rx="28" fill="url(#bt-logo-g)" />
      {/* linke Hälfte: gefüllt, mit Windungen */}
      <path d="M56 27 C44 21 32 28 32 40 C22 44 20 59 29 66 C25 78 36 92 49 88 C53 93 56 90 56 86 Z" fill="#FFFFFF" />
      <path d="M56 45 C49 45 45 41 45 36 M56 63 C47 63 41 59 39 53 M56 78 C51 78 47 75 46 71" fill="none" stroke="#6552E0" strokeWidth="3.6" strokeLinecap="round" />
      {/* rechte Hälfte: Umriss mit Netz */}
      <path d="M64 27 C76 21 88 28 88 40 C98 44 100 59 91 66 C95 78 84 92 71 88 C67 93 64 90 64 86 Z" fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinejoin="round" />
      <path d="M75 41 L84 55 L72 61 L78 76 M75 41 L72 61" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="75" cy="41" r="4.6" fill="#FFFFFF" />
      <circle cx="72" cy="61" r="4.6" fill="#FFFFFF" />
      <circle cx="78" cy="76" r="4.6" fill="#FFFFFF" />
      <circle cx="84" cy="55" r="5.6" fill="#FF8A5C" stroke="#FFFFFF" strokeWidth="2" />
    </svg>
  )
}

const GEBIET_SYMBOL = {
  logik: Shapes, gedaechtnis: Brain, tempo: Zap, aufmerksamkeit: Crosshair, raum: Box,
  sprache: Languages, zahlen: Calculator, geo: Globe2, raetsel: Puzzle,
} as const

export function GebietSymbol({ gebiet, size = 18 }: { gebiet: Gebiet; size?: number }) {
  const S = GEBIET_SYMBOL[gebiet]
  return <S size={size} />
}

const ABZEICHEN_SYMBOL = { flamme: Flame, stern: Star, kompass: Compass, berg: Mountain, ziel: Target, pokal: Trophy, hirn: BrainCircuit, blitz: Sparkles } as const

export function AbzeichenSymbol({ symbol, size = 18 }: { symbol: AbzeichenInfo['symbol']; size?: number }) {
  const S = ABZEICHEN_SYMBOL[symbol]
  return <S size={size} />
}
