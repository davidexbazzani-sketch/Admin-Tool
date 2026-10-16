// ── Automatische Komplett-Einrichtung: stündlicher Ping ─────────────────────
// Prüft jede Stunde, ob der neue PC einer offenen Checkliste erreichbar ist. Beim ersten
// Treffer läuft die Komplett-Einrichtung durch (autoSetup.ts) — Meldung an den Anwender,
// dann die sieben Schritte der Reihe nach.
//
// Die Automatik schaltet sich je Gerät ab, sobald ein vollständiger Durchlauf gelaufen
// ist (`autoSetupAutomatikAus`) — egal ob automatisch oder manuell ausgelöst. Ebenso
// fällt ein Gerät heraus, sobald die Checkliste als erledigt markiert ist.
// Claim + Heartbeat verhindern, dass zwei Tool-Instanzen denselben PC einrichten.
// [[auto_setup_feature]]

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { loadRunStatus, saveRunStatus, isStatusClaimed } from '../../services/scanSchedules'
import { listChecklists } from '../../services/checklists'
import { loadChecklistDeviceInfos, hostFromSerial } from '../../services/deviceMasterData'
import { loadDeviceSetupState, updateDeviceSetupItem, type DeviceSetupItem } from '../../services/deviceSetup'
import { checkReachability } from '../../services/onboardingDeploy'
import { runAutoSetup } from '../../services/autoSetup'

export const AUTO_SETUP_STATUS = 'device_setup/auto_setup_status.json'

const POLL_MS = 60 * 60 * 1000       // stündlich, wie gewünscht
const HEARTBEAT_MS = 5 * 60 * 1000
/** Höchstens so viele Geräte pro Durchlauf — eine Einrichtung dauert lange. */
const MAX_PRO_LAUF = 1

export default function AutoSetupController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    let s
    try { s = await loadRunStatus(AUTO_SETUP_STATUS) } catch { return }
    if (isStatusClaimed(s, Date.now())) return

    busy.current = true
    const claimToken = `${username}#${Math.random().toString(36).slice(2, 10)}`
    try { await saveRunStatus(AUTO_SETUP_STATUS, { ...s, running: { by: claimToken, at: new Date().toISOString() } }) } catch { busy.current = false; return }
    try { const chk = await loadRunStatus(AUTO_SETUP_STATUS); if (chk.running && chk.running.by !== claimToken) { busy.current = false; return } } catch { /* im Zweifel laufen */ }

    const beat = setInterval(() => {
      void (async () => {
        try { const cur = await loadRunStatus(AUTO_SETUP_STATUS); if (cur.running?.by === claimToken) await saveRunStatus(AUTO_SETUP_STATUS, { ...cur, running: { by: claimToken, at: new Date().toISOString() } }) } catch { /* nächster Beat */ }
      })()
    }, HEARTBEAT_MS)

    const by = user?.displayName || username
    let summary = 'nichts zu tun'
    let ok = true
    try {
      const all = await listChecklists().catch(() => [])
      const offen = all.filter(c => !c.completed && (c.deviceType === 'new' || c.deviceType === 'refresh'))
      const state = await loadDeviceSetupState().catch(() => ({} as Record<string, DeviceSetupItem>))
      const infos = await loadChecklistDeviceInfos(
        offen.map(c => ({ key: c.id, newSerial: c.newDeviceSerial || '', oldId: c.deviceType === 'refresh' ? (c.oldDeviceId || '') : '' })),
      ).catch(() => new Map())

      // Nur Geräte, für die die Automatik noch aktiv ist.
      const kandidaten = offen.filter(c => {
        const st = state[c.id]
        if (st?.autoSetupAutomatikAus || st?.autoSetupDoneAt) return false
        const info = infos.get(c.id)
        return !!(info?.newHostname || hostFromSerial((c.newDeviceSerial || '').trim()) || '').trim()
      })

      let eingerichtet = 0, offline = 0
      for (const c of kandidaten) {
        if (eingerichtet >= MAX_PRO_LAUF) break
        const info = infos.get(c.id)
        const host = (info?.newHostname || hostFromSerial((c.newDeviceSerial || '').trim()) || '').trim()
        const reach = await checkReachability(host).catch(() => ({ online: false }))
        await updateDeviceSetupItem(c.id, { autoSetupPingAt: new Date().toISOString() }).catch(() => {})
        if (!reach.online) { offline++; continue }
        const r = await runAutoSetup(c, info, by)
        eingerichtet++
        if (!r.ok) ok = false
      }
      summary = `${kandidaten.length} offen · ${eingerichtet} eingerichtet · ${offline} noch offline`
    } catch (e) {
      ok = false
      summary = e instanceof Error ? e.message : String(e)
    } finally {
      clearInterval(beat)
      try { await saveRunStatus(AUTO_SETUP_STATUS, { lastRunAt: new Date().toISOString(), lastResult: ok ? 'success' : 'error', lastSummary: summary, running: undefined }) } catch { /* egal */ }
      busy.current = false
    }
  }, [isAdmin, username, user?.displayName])

  useEffect(() => {
    if (!username) return
    void tick()
    const t = setInterval(() => { void tick() }, POLL_MS)
    return () => { clearInterval(t) }
  }, [tick, username])

  return null
}
