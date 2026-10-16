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

// ── UTF-8 encoding header prepended to every PS command ───────────────────────
// Wrapped in try-catch: [Console]::OutputEncoding can throw when PowerShell runs
// without an attached console (child process of a GUI app like Electron).
const PS_UTF8_HEADER = 'try{[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;$OutputEncoding=[System.Text.Encoding]::UTF8}catch{};'

// ── Globale Bremse ────────────────────────────────────────────────────────────
// Jeder Aufruf startet ein eigenes powershell.exe. Der Interpreterstart allein
// kostet spürbar CPU — auf einem 8-Kern-Rechner gemessen (nur Start, Befehl gratis):
//   8 gleichzeitig = 0,85 s · 16 = 2,4 s · 24 = 4,2 s
// Die Module bremsen zwar jedes für sich (Batches zu 4–15), aber sie wissen nichts
// voneinander: ein Flotten-Scan, ein geöffnetes Dossier und eine laufende Installation
// ergaben zusammen mühelos 25+ Prozesse. Dann bleibt für die Oberfläche nichts übrig —
// das Fenster ruckelt und nimmt keine Klicks mehr an.
//
// Deshalb hier eine Warteschlange für den ganzen Hauptprozess. Sie begrenzt nur, wie
// viele GLEICHZEITIG laufen; es geht nichts verloren und nichts wird abgelehnt.
// Die Zeitüberwachung startet erst, wenn der Prozess wirklich läuft — ein Aufruf in
// der Warteschlange kann also nicht fälschlich in den Timeout laufen.
//
// ZWEI getrennte Spuren, sonst würde eine Software-Installation (Zeitfenster bis
// 25 Minuten) alle Plätze belegen und jede kurze Abfrage dahinter einfrieren:
//   · kurz  — alles bis 2 Minuten: die Abfragen, an denen die Oberfläche hängt
//   · lang  — Installationen und Kopiervorgänge; die WARTEN überwiegend auf den
//             Ziel-PC und kosten hier kaum CPU, dürfen aber die kurze Spur nicht füllen
const LANG_AB_MS = 120_000
const MAX_KURZ = 8
const MAX_LANG = 4

interface Spur { laufend: number; max: number; warteschlange: (() => void)[] }
const spurKurz: Spur = { laufend: 0, max: MAX_KURZ, warteschlange: [] }
const spurLang: Spur = { laufend: 0, max: MAX_LANG, warteschlange: [] }

// SICHERHEITSVENTIL: Wer länger als diese Zeit wartet, startet trotzdem.
//
// Ohne das Ventil kann die Bremse selbst zum Ausfall werden: `ensureWinRM` läuft mit
// 60 s Zeitfenster und gehört damit in die kurze Spur — acht nicht erreichbare Geräte
// belegen also alle acht Plätze eine Minute lang, und jede andere Abfrage (auch der
// Online-Status) hängt dahinter. Dann meldet das Tool flächendeckend „offline", obwohl
// die Geräte da sind. Mit dem Ventil glättet die Bremse weiterhin Lastspitzen, kann
// aber niemanden dauerhaft aussperren.
const WARTE_MAX_MS = 10_000

function platzNehmen(spur: Spur): Promise<void> {
  if (spur.laufend < spur.max) { spur.laufend++; return Promise.resolve() }
  return new Promise<void>(frei => {
    let erledigt = false
    const starten = () => {
      if (erledigt) return
      erledigt = true
      clearTimeout(ventil)
      spur.laufend++
      frei()
    }
    const ventil = setTimeout(() => {
      // Platz überziehen statt verhungern lassen. Der Eintrag bleibt in der
      // Warteschlange und wird beim nächsten Freigeben übersprungen (erledigt=true).
      starten()
    }, WARTE_MAX_MS)
    spur.warteschlange.push(starten)
  })
}

function platzFreigeben(spur: Spur): void {
  spur.laufend--
  // Einträge, die schon durchs Ventil gestartet sind, bleiben als Leerläufer in der
  // Warteschlange zurück. Deshalb so lange weiterreichen, bis wirklich einer startet —
  // sonst ginge der Weckruf verloren und die Spur bliebe stehen, obwohl Platz frei ist.
  while (spur.laufend < spur.max) {
    const naechster = spur.warteschlange.shift()
    if (!naechster) return
    const vorher = spur.laufend
    naechster()
    if (spur.laufend > vorher) return
  }
}

/** Nur für Diagnose/Tests: aktuelle Auslastung der Bremse. */
export function psAuslastung(): { kurz: { laufend: number; wartend: number }; lang: { laufend: number; wartend: number } } {
  return {
    kurz: { laufend: spurKurz.laufend, wartend: spurKurz.warteschlange.length },
    lang: { laufend: spurLang.laufend, wartend: spurLang.warteschlange.length },
  }
}

// ── PowerShell runner ─────────────────────────────────────────────────────────
export async function runPowerShell(command: string, timeoutMs = 30000): Promise<PSResult> {
  const spur = timeoutMs > LANG_AB_MS ? spurLang : spurKurz
  await platzNehmen(spur)
  try {
    return await spawnePowerShell(command, timeoutMs)
  } finally {
    platzFreigeben(spur)
  }
}

function spawnePowerShell(command: string, timeoutMs: number): Promise<PSResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const proc = spawn('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command', PS_UTF8_HEADER + command,
    ], {
      windowsHide: true,
    })

    activeProcesses.add(proc)

    const timer = setTimeout(() => {
      timedOut = true
      proc.kill('SIGTERM')
    }, timeoutMs)

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8') })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8') })

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
