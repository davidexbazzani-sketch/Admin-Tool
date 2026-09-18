// COSCOM-Anleitungen (Installation + Arbeitsplatz einrichten) – Wrapper um GuideHelp.
import GuideHelp, { type GuideDef } from '../guides/GuideHelp'
import type { ReactNode } from 'react'

const COSCOM_GUIDES: GuideDef[] = [
  { title: 'COSCOM – Installation', asset: 'guides/coscom-installation.pdf', exportName: 'Coscom Installation.pdf' },
  { title: 'COSCOM – Arbeitsplatz einrichten', asset: 'guides/coscom-arbeitsplatz.pdf', exportName: 'Coscom am Arbeitsplatz einrichten.pdf' },
]

export default function CoscomHelp({ children, className }: { children: ReactNode; className?: string }) {
  return <GuideHelp guides={COSCOM_GUIDES} className={className}>{children}</GuideHelp>
}
