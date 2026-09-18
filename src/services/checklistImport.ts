// ── Checklisten-Import: fehlende TASK-Nummern aus Excel anlegen ──────────────
// Aus einer Excel werden NUR TASK-Nummern gelesen. Für jede TASK, die es im Tool
// noch nicht gibt, wird ein LEERER Checklisten-Eintrag angelegt (nur taskNumber).
// Bestehende Checklisten werden NIEMALS überschrieben oder gelöscht — es wird nur
// angehängt. Zusätzlich wird gemeldet, welche TASKs im Tool sind, aber nicht in
// der Excel stehen.

import { listChecklists, createManyChecklists, type Checklist } from './checklists'

/** Nur für den Abgleich normalisieren (Groß, getrimmt, ohne interne Leerzeichen). */
export function normalizeTask(s: string): string {
  return (s || '').trim().toUpperCase().replace(/\s+/g, '')
}

export interface TaskDiff {
  toCreate: string[]         // in Excel, aber nicht im Tool → neu anlegen
  alreadyPresent: string[]   // in Excel UND im Tool → unberührt
  missingInExcel: string[]   // offen im Tool, aber nicht in der Excel → nur Hinweis
}

/** Reiner Abgleich (unit-testbar). Gespeichert wird der getrimmte Originalwert. */
export function diffTasks(excelTasks: string[], existing: Checklist[]): TaskDiff {
  // Excel dedupen (case-insensitiv), Originalschreibweise des ersten Vorkommens behalten.
  const excelByNorm = new Map<string, string>()
  for (const raw of excelTasks) {
    const val = (raw || '').trim()
    if (!val) continue
    const norm = normalizeTask(val)
    if (!excelByNorm.has(norm)) excelByNorm.set(norm, val)
  }
  const existingNorms = new Set(existing.map(c => normalizeTask(c.taskNumber)).filter(Boolean))

  const toCreate: string[] = []
  const alreadyPresent: string[] = []
  for (const [norm, val] of excelByNorm) {
    if (existingNorms.has(norm)) alreadyPresent.push(val)
    else toCreate.push(val)
  }

  // Offene Tool-TASKs, die es in der Excel nicht (mehr) gibt.
  const excelNorms = new Set(excelByNorm.keys())
  const missingInExcel = existing
    .filter(c => !c.completed && (c.taskNumber || '').trim() && !excelNorms.has(normalizeTask(c.taskNumber)))
    .map(c => c.taskNumber.trim())

  return { toCreate, alreadyPresent, missingInExcel }
}

/** Leerer Import-Platzhalter — nur die TASK-Nummer ist gesetzt (landet im offenen Tab). */
function emptyImported(taskNumber: string, currentUser: string): Omit<Checklist, 'id' | 'createdAt'> {
  return {
    taskNumber,
    name: '',
    corpId: '',
    technician: currentUser,
    deviceType: 'new',
    newDeviceSerial: '',
    oldDeviceId: '',
    comment: '',
    priority: false,
    signatureDataUrl: undefined,
    signatureDate: undefined,
    createdBy: currentUser,
  }
}

export interface ImportResult {
  ok: boolean
  error?: string
  created: string[]
  alreadyPresent: string[]
  missing: string[]
}

/** Führt den Import aus: nur fehlende TASKs anlegen, nichts Bestehendes anfassen. */
export async function importTasks(excelTasks: string[], currentUser: string): Promise<ImportResult> {
  const existing = await listChecklists()
  const { toCreate, alreadyPresent, missingInExcel } = diffTasks(excelTasks, existing)
  if (toCreate.length > 0) {
    const res = await createManyChecklists(toCreate.map(t => emptyImported(t, currentUser)))
    if (!res.ok) return { ok: false, error: res.error, created: [], alreadyPresent, missing: missingInExcel }
  }
  return { ok: true, created: toCreate, alreadyPresent, missing: missingInExcel }
}
