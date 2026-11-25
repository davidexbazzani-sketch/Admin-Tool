// ── Protokolle & Werkzeuge (Einstellungen „Für alle“) — die Karten selbst bleiben lazy ──
import { lazy, Suspense } from 'react'

const AktivitaetsProtokollKarte = lazy(() => import('../../components/AktivitaetsProtokollKarte'))
const BefehlsTestKarte = lazy(() => import('../../befehlsTest/BefehlsTestKarte'))
const BerechtigungsAbzugKarte = lazy(() => import('../../components/BerechtigungsAbzugKarte'))

const Laden = ({ was }: { was: string }) => <div className="text-xs text-muted-foreground px-1 py-2">{was} wird geladen …</div>

export default function Werkzeuge() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<Laden was="Aktivitätsprotokoll" />}><AktivitaetsProtokollKarte /></Suspense>
      <Suspense fallback={<Laden was="Befehls-Test" />}><BefehlsTestKarte /></Suspense>
      <Suspense fallback={<Laden was="Berechtigungs-Abzug" />}><BerechtigungsAbzugKarte /></Suspense>
    </div>
  )
}
