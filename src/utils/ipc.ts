// Thin wrapper for fire-and-forget ipcRenderer sends (window controls)
// Since contextBridge doesn't expose ipcRenderer.send directly,
// we use a hidden channel via the main process through postMessage or
// simply call the matching API methods.
export function ipcRenderer(channel: 'window:minimize' | 'window:maximize' | 'window:close') {
  // These are handled via a separate send channel exposed in preload
  // We call electronAPI helper that maps to ipcRenderer.send
  const w = window as unknown as {
    electronSend?: (ch: string) => void
  }
  if (w.electronSend) {
    w.electronSend(channel)
  }
}
