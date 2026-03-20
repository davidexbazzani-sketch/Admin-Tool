// ── Central Activity Logger ─────────────────────────────────────────────────
// Call logAction() anywhere in the renderer to log user actions to the
// network share. Silently ignores errors to never block the UI.

import { api } from '../electronAPI'
import { useAuthStore } from '../store/authStore'

export interface LogEntry {
  action: string
  target?: string
  screen: string
}

let _cachedHostname: string | null = null

export async function logAction(entry: LogEntry): Promise<void> {
  try {
    const session = useAuthStore.getState().session
    if (!session) return

    if (!_cachedHostname) {
      _cachedHostname = await api().getHostname().catch(() => 'unknown')
    }

    await api().logActivity({
      userId: session.user.id,
      username: session.user.username,
      displayName: session.user.displayName,
      action: entry.action,
      target: entry.target,
      screen: entry.screen,
      timestamp: new Date().toISOString(),
    })
  } catch {
    /* never block UI on logging errors */
  }
}

// Convenience: log with current screen from store
export function createLogger(screen: string) {
  return (action: string, target?: string) => logAction({ action, target, screen })
}
