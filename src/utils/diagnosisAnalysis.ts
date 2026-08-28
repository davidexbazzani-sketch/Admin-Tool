// ── PC-Diagnose: Analyse-Helfer ───────────────────────────────────────────────
// Reine Funktionen für die erweiterte Diagnose: Exception-Codes übersetzen,
// fehlerhaftes Modul interpretieren, Befunde zu „Wahrscheinliche Ursache"
// korrelieren. Keine IO — testbar & wiederverwendbar.

/** Windows-Ausnahmecodes im Klartext. */
export const EXCEPTION_CODES: Record<string, string> = {
  '0xc0000005': 'Access Violation (Speicherzugriffsfehler)',
  '0xc0000374': 'Heap Corruption (Heap beschädigt)',
  '0xc000041d': 'Unhandled Exception',
  '0xc0000409': 'Stack Buffer Overrun',
  '0xc00000fd': 'Stack Overflow',
  '0xc0000006': 'In-Page-I/O-Fehler (Disk/Paging)',
  '0xc0000135': 'DLL nicht gefunden',
  '0xc0000142': 'DLL-Initialisierung fehlgeschlagen',
  '0x80000003': 'Breakpoint',
  '0xe0434352': '.NET/CLR-Ausnahme',
  '0xe06d7363': 'C++-Ausnahme',
}

export function exceptionText(code?: string): string {
  if (!code) return ''
  return EXCEPTION_CODES[code.toLowerCase()] || ''
}

export type ModuleKind = 'generic' | 'gpu' | 'shellext' | 'net' | 'antivirus' | 'other'
export interface ModuleInfo { kind: ModuleKind; hint: string; solution: string }

function isSystemPath(p: string): boolean {
  const s = (p || '').toLowerCase()
  return s.includes('\\windows\\system32\\') || s.includes('\\windows\\syswow64\\') || s.includes('\\windows\\winsxs\\')
}

/** Automatische Interpretation des fehlerhaften Moduls aus Event 1000. */
export function interpretModule(module?: string, modPath?: string): ModuleInfo {
  const m = (module || '').toLowerCase()
  const p = (modPath || '').toLowerCase()
  if (/^(ntdll|kernelbase|kernel32|msvcrt|ucrtbase|combase|shcore)\.dll$/.test(m))
    return {
      kind: 'generic',
      hint: 'Generisches Windows-Systemmodul — die eigentliche Ursache liegt fast immer woanders (Speicher-/Heap-/Disk-Problem oder eine einschleusende Fremd-DLL).',
      solution: 'Datenträger-SMART prüfen (siehe Hardware), ggf. RAM-Test (mdsched); geladene Nicht-Microsoft-Module (Shell Extensions) einzeln ausschließen.',
    }
  if (/^(ig[a-z0-9]+|dxgi|d3d\d*|d3dcompiler|nvwgf|nvd3d|nvoglv|atig|atiumd|amdvlk|opengl|vulkan)/.test(m))
    return {
      kind: 'gpu',
      hint: 'Grafiktreiber-Modul — deutet auf ein GPU-Treiberproblem hin.',
      solution: 'Grafiktreiber sauber neu installieren (mit DDU entfernen, dann aktueller Herstellertreiber).',
    }
  if (/(avast|avgnt|mcafee|symantec|savonaccess|mfeavfk|klif|ekrn|mpengine|windefend)/.test(m))
    return {
      kind: 'antivirus',
      hint: 'Antiviren-/Sicherheitsmodul greift in den Prozess ein.',
      solution: 'Ausnahme für die betroffene App prüfen bzw. AV-Software aktualisieren.',
    }
  if (/(ws2_32|wininet|winhttp|dnsapi|mswsock)\.dll$/.test(m))
    return { kind: 'net', hint: 'Netzwerkmodul.', solution: 'Winsock/Netzwerk zurücksetzen (netsh winsock reset) und Netzwerktreiber prüfen.' }
  if (/\.dll$/.test(m) && p && !isSystemPath(p))
    return {
      kind: 'shellext',
      hint: 'Drittanbieter-DLL außerhalb von system32 — häufig eine Explorer-Shell-Erweiterung.',
      solution: 'ShellExView: Nicht-Microsoft-Erweiterungen deaktivieren und einzeln wieder aktivieren, um den Verursacher zu finden.',
    }
  return { kind: 'other', hint: '', solution: '' }
}

// ── Root-Cause-Korrelation ────────────────────────────────────────────────────
// Befunde tragen strukturierte Marker in `rawData`; daraus werden Hypothesen
// mit konkreten nächsten Schritten priorisiert.

export interface CrashMarker { kind: 'crash'; app: string; module: string; code: string; count: number; moduleKind: ModuleKind }
export interface DiskEventMarker { kind: 'disk-event'; count: number }
export interface SmartMarker { kind: 'smart-bad'; name: string }
export interface ShellExtMarker { kind: 'shellext'; name: string; publisher: string }
export type DiagMarker = CrashMarker | DiskEventMarker | SmartMarker | ShellExtMarker | { kind: string }

export interface RootCauseHypothesis { title: string; steps: string[] }

export function buildRootCause(markers: DiagMarker[]): RootCauseHypothesis[] {
  const crashes = markers.filter((m): m is CrashMarker => m.kind === 'crash')
  const disk = markers.filter((m): m is DiskEventMarker => m.kind === 'disk-event')
  const smart = markers.filter((m): m is SmartMarker => m.kind === 'smart-bad')
  const shellExt = markers.filter((m): m is ShellExtMarker => m.kind === 'shellext')
  const explorer = crashes.filter(c => /explorer\.exe/i.test(c.app))
  const explorerTotal = explorer.reduce((s, c) => s + c.count, 0)
  const gpuCrash = crashes.filter(c => c.moduleKind === 'gpu')
  const genericCrash = crashes.filter(c => c.moduleKind === 'generic')
  const shellCrash = crashes.filter(c => c.moduleKind === 'shellext')

  const out: RootCauseHypothesis[] = []

  if (smart.length) {
    out.push({
      title: `Datenträger defekt/verschlissen (SMART): ${[...new Set(smart.map(s => s.name))].join(', ')}`,
      steps: ['Sofort Daten sichern.', 'Datenträger tauschen — SMART meldet Health≠Healthy oder unkorrigierte Fehler (Details unter „Hardware").'],
    })
  }

  if (explorerTotal >= 10) {
    const steps: string[] = []
    if (disk.length || smart.length) steps.push('SSD/Datenträger-SMART prüfen (siehe „Hardware") — bei ntdll/Heap-Fehlern oft ein Speicher-/Disk-Problem.')
    if (shellCrash.length || shellExt.length) steps.push(`Nicht-Microsoft Shell Extensions mit ShellExView deaktivieren${shellExt.length ? ` (verdächtig: ${shellExt.slice(0, 3).map(s => s.name).join(', ')})` : ''} und einzeln reaktivieren.`)
    if (gpuCrash.length) steps.push('Grafiktreiber sauber neu installieren (DDU + aktueller Treiber).')
    if (genericCrash.length && !disk.length && !smart.length) steps.push('Modul ntdll/KERNELBASE = generisch → RAM-Test (mdsched) und geladene Fremd-DLLs ausschließen.')
    if (steps.length === 0) steps.push('Shell Extensions (ShellExView), Grafiktreiber und Datenträger prüfen.')
    out.push({ title: `Explorer.EXE stürzt gehäuft ab (${explorerTotal}×) → Taskleisten-Flackern`, steps })
  }

  for (const c of crashes.filter(c => !/explorer\.exe/i.test(c.app) && c.count >= 10).slice(0, 2)) {
    const mi = interpretModule(c.module)
    out.push({ title: `${c.app} stürzt gehäuft ab (${c.count}×, Modul ${c.module})`, steps: [mi.solution || 'App/Treiber aktualisieren, ggf. neu installieren.'] })
  }

  if (gpuCrash.length && explorerTotal < 10) {
    out.push({ title: `Grafiktreiber-Absturz (${[...new Set(gpuCrash.map(c => c.module))].join(', ')})`, steps: ['Grafiktreiber sauber neu installieren (DDU + aktueller Herstellertreiber).'] })
  }

  return out
}
