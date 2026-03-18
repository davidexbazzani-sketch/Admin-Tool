import { spawn, ChildProcess } from 'child_process'

export interface PSResult {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
}

// ── Active process registry (for cancel-all support) ─────────────────────────
const activeProcesses = new Set<ChildProcess>()

export function killAllProcesses(): void {
  for (const proc of activeProcesses) {
    try { proc.kill('SIGTERM') } catch { /* already exited */ }
  }
  activeProcesses.clear()
}

// ── PowerShell runner ─────────────────────────────────────────────────────────
export function runPowerShell(command: string, timeoutMs = 30000): Promise<PSResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const proc = spawn('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command', command,
    ], {
      windowsHide: true,
    })

    activeProcesses.add(proc)

    const timer = setTimeout(() => {
      timedOut = true
      proc.kill('SIGTERM')
    }, timeoutMs)

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code) => {
      clearTimeout(timer)
      activeProcesses.delete(proc)
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? -1,
        timedOut,
      })
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      activeProcesses.delete(proc)
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: -1,
        timedOut: false,
      })
    })
  })
}

// ── CMD runner ────────────────────────────────────────────────────────────────
export function runCmd(command: string, timeoutMs = 30000): Promise<PSResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const proc = spawn('cmd', ['/c', command], { windowsHide: true })

    activeProcesses.add(proc)

    const timer = setTimeout(() => {
      timedOut = true
      proc.kill('SIGTERM')
    }, timeoutMs)

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code) => {
      clearTimeout(timer)
      activeProcesses.delete(proc)
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? -1, timedOut })
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      activeProcesses.delete(proc)
      resolve({ stdout: '', stderr: err.message, exitCode: -1, timedOut: false })
    })
  })
}
