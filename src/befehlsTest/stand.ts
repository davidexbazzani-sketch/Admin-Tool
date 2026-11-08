// ── Befehls-Test: letzter Teststand je Befehl (für Stempel in „Gib dein Problem ein“) ──
import { useEffect, useState } from 'react'
import { api } from '../electronAPI'
import type { BtStand } from './types'

let cache: { bis: number; p: Promise<BtStand> } | null = null
export function ladeTestStand(): Promise<BtStand> {
  if (!cache || cache.bis < Date.now()) {
    cache = { bis: Date.now() + 5 * 60_000, p: api().netReadJsonAsync<BtStand>('befehls-test/stand.json').then(s => s || {}).catch(() => ({})) }
  }
  return cache.p
}

export function useTestStand(): BtStand {
  const [s, setS] = useState<BtStand>({})
  useEffect(() => { let an = true; void ladeTestStand().then(x => { if (an) setS(x) }); return () => { an = false } }, [])
  return s
}
