// ── PDF-Werkzeuge: gemeinsame UI-Bausteine ───────────────────────────────────
import { type ReactNode } from 'react'
import {
  FileText, FolderOpen, Folder, Clock, Search, ZoomIn, RotateCw, Highlighter,
  Underline, PenTool, Pen, Pencil, Square, Type, Lock, Shield, Send, Ruler,
  Bookmark, Table, Calculator, Image as ImageIcon, Layers, Scissors, Hash,
  Droplets, Minimize2, Eye, Printer, Mail, MessageSquare, Crop, CheckCircle,
  GitCompare, List, AlignJustify, Volume2, LayoutGrid, LayoutList, FilePlus,
  Download, Minus, Eraser, X, Loader2, type LucideIcon,
} from 'lucide-react'

// Katalog-Icon-Namen -> sichere lucide-Komponenten (Fallback: FileText).
const ICONS: Record<string, LucideIcon> = {
  FolderOpen, Clock, LayoutGrid, ZoomIn, RotateCw, GalleryVerticalEnd: LayoutGrid,
  Search, TextCursorInput: Type, Volume2, Printer, Mail,
  StickyNote: MessageSquare, Highlighter, Underline, Strikethrough: Minus, PenTool,
  Square, Type, MessageSquareMore: MessageSquare, Stamp: CheckCircle, MessagesSquare: MessageSquare,
  FormInput: Type, Signature: Pen, Pen,
  PencilRuler: Pencil, LayoutList, FilePlus2: FilePlus, FileMinus2: Minus, FileOutput: Download,
  SplitSquareHorizontal: Scissors, Combine: Layers, Crop, Droplets, PanelTop: FileText, Hash, Layers,
  FilePlus, FileImage: ImageIcon, FileType: FileText, ScanText: FileText, Minimize2, BadgeCheck: CheckCircle,
  ScanLine: AlignJustify, Table, Calculator,
  Lock, EraserOff: Eraser, ShieldCheck: Shield, Send,
  GitCompareArrows: GitCompare, Workflow: List, Accessibility: Eye, Ruler, Bookmark, FolderTree: Folder,
}

export function ToolIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Cmp = ICONS[name] ?? FileText
  return <Cmp size={size} strokeWidth={1.75} />
}

// Einzeiliger Tooltip in Alltagssprache.
export function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="pdfx-tip" style={{ display: 'inline-flex' }}>
      {children}
      <span className="pdfx-tip-bubble" role="tooltip">{text}</span>
    </span>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="pdfx-spin" />
}

// Schlichtes, zentriertes Modal (Sheet).
export function Modal({ title, onClose, children, footer, wide }: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 70,
        background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(2px)',
        display: 'grid', placeItems: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="pdfx-card pdfx-fade-in"
        style={{ width: '100%', maxWidth: wide ? 760 : 460, maxHeight: '88%', display: 'flex', flexDirection: 'column', boxShadow: 'var(--px-shadow)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--px-border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>{title}</h3>
          <button className="pdfx-btn" onClick={onClose} style={{ padding: 6 }} aria-label="Schließen"><X size={16} /></button>
        </div>
        <div className="pdfx-scroll" style={{ padding: 20, overflowY: 'auto' }}>{children}</div>
        {footer && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--px-border)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--px-text-2)', marginBottom: 6 }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 11, color: 'var(--px-text-3)', marginTop: 4 }}>{hint}</span>}
    </label>
  )
}

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 'var(--px-radius-sm)',
  border: '1px solid var(--px-border)', background: 'var(--px-surface-2)',
  color: 'var(--px-text)', fontSize: 14, outline: 'none',
}

// Informationsblatt fuer Funktionen, die einen Dienst/Backend benoetigen.
export function ServiceNote({ text }: { text: string }) {
  return (
    <div style={{
      display: 'flex', gap: 10, padding: 14, borderRadius: 'var(--px-radius-sm)',
      background: 'color-mix(in srgb, var(--px-pro) 8%, transparent)',
      border: '1px solid color-mix(in srgb, var(--px-pro) 30%, transparent)',
      fontSize: 13, color: 'var(--px-text)',
    }}>
      <span className="pdfx-pro-badge" style={{ height: 'fit-content' }}>DIENST</span>
      <span>{text}</span>
    </div>
  )
}
