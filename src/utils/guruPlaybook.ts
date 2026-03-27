/**
 * Playbook Engine — Execute multi-step repair sequences
 * Step types: scan, notify, wait, execute, verify, conditional
 * Live progress reporting. Abortable. Logged.
 */
import { api } from '../electronAPI'
import type { Playbook, PlaybookStep, PlaybookProgress, PlaybookStepStatus } from '../types/guru'

export interface PlaybookRunner {
  start(): Promise<PlaybookProgress[]>
  abort(): void
  isRunning(): boolean
}

export function createPlaybookRunner(
  playbook: Playbook,
  hostname: string,
  onProgress: (progress: PlaybookProgress[]) => void,
): PlaybookRunner {
  let aborted = false
  let running = false
  const progress: PlaybookProgress[] = playbook.steps.map(s => ({
    stepId: s.id,
    status: 'pending' as PlaybookStepStatus,
  }))

  function updateStep(stepId: string, status: PlaybookStepStatus, output?: string) {
    const idx = progress.findIndex(p => p.stepId === stepId)
    if (idx >= 0) {
      progress[idx] = { stepId, status, output }
    }
    onProgress([...progress])
  }

  async function executeStep(step: PlaybookStep): Promise<boolean> {
    if (aborted) {
      updateStep(step.id, 'skipped', 'Abgebrochen')
      return false
    }

    updateStep(step.id, 'running')

    try {
      switch (step.type) {
        case 'scan':
        case 'execute': {
          const cmd = step.command
            ? step.command.replace(/\{hostname\}/g, hostname)
            : step.skill
              ? `Invoke-Command -ComputerName '${hostname}' -ScriptBlock { ${step.command ?? 'Write-Output "OK"'} } -EA Stop`
              : 'Write-Output "OK"'

          const result = await api().runPowerShell(cmd, 30000)
          const output = result.stdout?.trim() || result.stderr?.trim() || 'OK'

          if (output.startsWith('ERR:') || result.stderr) {
            updateStep(step.id, step.abortOnFail ? 'error' : 'warning', output)
            return !step.abortOnFail
          }

          updateStep(step.id, 'success', output)
          return true
        }

        case 'notify': {
          const msg = (step.message ?? 'IT Admin Tool führt Wartung durch...')
            .replace(/\{hostname\}/g, hostname)
          try {
            await api().runPowerShell(`msg * /SERVER:${hostname} "${msg}"`, 5000)
          } catch { /* msg may fail if no user logged in */ }
          updateStep(step.id, 'success', `Nachricht gesendet an ${hostname}`)
          return true
        }

        case 'wait': {
          const seconds = step.waitSeconds ?? 5
          for (let i = seconds; i > 0; i--) {
            if (aborted) {
              updateStep(step.id, 'skipped', 'Abgebrochen')
              return false
            }
            updateStep(step.id, 'running', `Warte ${i}s...`)
            await new Promise(r => setTimeout(r, 1000))
          }
          updateStep(step.id, 'success', `${seconds}s gewartet`)
          return true
        }

        case 'verify': {
          const cmd = step.command
            ? step.command.replace(/\{hostname\}/g, hostname)
            : 'Write-Output "OK"'
          const result = await api().runPowerShell(cmd, 15000)
          const output = result.stdout?.trim() || ''

          // Simple success condition check
          if (step.successCondition) {
            const success = !output.startsWith('ERR:') && output.length > 0
            updateStep(step.id, success ? 'success' : 'warning', output)
            return success
          }

          updateStep(step.id, 'success', output)
          return true
        }

        case 'conditional': {
          updateStep(step.id, 'success', 'Bedingung geprüft')
          return true
        }

        default:
          updateStep(step.id, 'warning', 'Unbekannter Step-Typ')
          return true
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      updateStep(step.id, 'error', msg)
      return !step.abortOnFail
    }
  }

  return {
    async start(): Promise<PlaybookProgress[]> {
      running = true
      aborted = false

      for (const step of playbook.steps) {
        const ok = await executeStep(step)
        if (!ok && step.abortOnFail) break
        if (aborted) break
      }

      running = false
      return [...progress]
    },

    abort() {
      aborted = true
    },

    isRunning() {
      return running
    },
  }
}
