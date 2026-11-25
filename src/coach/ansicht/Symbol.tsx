// Der Coach — Symbole der Bereiche (Namen stehen in inhalt/bereiche.json).
import { AudioLines, Eye, Flame, Handshake, Heart, MessageCircle, MessagesSquare, Mic, PenLine, Rocket, Shield, Sun, Wind, Zap, Circle } from 'lucide-react'

const SYMBOLE = { AudioLines, Eye, Flame, Handshake, Heart, MessageCircle, MessagesSquare, Mic, PenLine, Rocket, Shield, Sun, Wind, Zap }
export function Symbol({ name, size = 16 }: { name: string; size?: number }) {
  const S = SYMBOLE[name as keyof typeof SYMBOLE] ?? Circle
  return <S size={size} aria-hidden />
}
