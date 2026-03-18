// Type-safe wrapper around window.electronAPI exposed by preload

export interface PSResult {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
}

export interface FileReadResult {
  success: boolean
  data?: string   // base64
  filePath?: string
  error?: string
}

declare global {
  interface Window {
    electronAPI: {
      runPowerShell(command: string, timeoutMs?: number): Promise<PSResult>
      checkAdmin(): Promise<boolean>
      openFileDialog(filters?: { name: string; extensions: string[] }[]): Promise<string | null>
      saveFileDialog(defaultPath?: string, filters?: { name: string; extensions: string[] }[]): Promise<string | null>
      selectDirectory(): Promise<string | null>
      readFile(filePath: string): Promise<FileReadResult>
      writeFile(filePath: string, dataBase64: string): Promise<{ success: boolean; error?: string }>
      getSettings(): Promise<Record<string, unknown>>
      setSetting(key: string, value: unknown): Promise<boolean>
      openExternal(url: string): Promise<void>
      getAppVersion(): Promise<string>
      onQueryProgress(cb: (data: { deviceId: string; queryId: string; status: string }) => void): () => void
    }
  }
}

// Convenience re-export
export const api = () => window.electronAPI
