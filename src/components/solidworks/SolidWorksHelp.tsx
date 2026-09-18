// SolidWorks-Installationsanleitung – dünner Wrapper um den generischen GuideHelp.
import GuideHelp, { type GuideDef } from '../guides/GuideHelp'
import type { ReactNode } from 'react'

const SOLIDWORKS_GUIDES: GuideDef[] = [
  { title: 'SolidWorks 2024 – Installationsanleitung', asset: 'guides/solidworks-2024.pdf', exportName: 'SolidWorks 2024 Installationsanleitung.pdf' },
]

export default function SolidWorksHelp({ children, className }: { children: ReactNode; className?: string }) {
  return <GuideHelp guides={SOLIDWORKS_GUIDES} className={className}>{children}</GuideHelp>
}
