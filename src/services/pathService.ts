// ── Central Path Service ─────────────────────────────────────────────────────
// All network/drive paths used by the IT Admin Tool are managed here.
// No module should contain a hardcoded path string - use pathService instead.

export type AccessMode = 'unc' | 'drive'

export interface PathsConfig {
  version: number
  lastModified: string
  modifiedBy: string
  comment: string

  base: {
    toolRoot_unc: string
    toolRoot_drive: string
    publicRoot_unc: string
    publicRoot_drive: string
    marineRoot_unc: string
    marineRoot_drive: string
  }

  toolSubfolders: Record<string, string>

  softwareInstall: {
    solidworks: Record<string, string>
  }

  tools: Record<string, string>

  domains: Record<string, string>

  preferredAccessMode: AccessMode
}

// ── Hardcoded defaults (fallback if paths.json not loadable) ─────────────────

export const DEFAULT_PATHS: PathsConfig = {
  version: 1,
  lastModified: '2026-04-29T12:00:00Z',
  modifiedBy: 'system',
  comment: 'Default configuration',

  base: {
    toolRoot_unc: '\\\\w3172\\skf marine\\700 Application\\711 IT Allgemein\\SW_INSTA\\Tool IT',
    toolRoot_drive: 'I:\\700 Application\\711 IT Allgemein\\SW_INSTA\\Tool IT',
    publicRoot_unc: '\\\\w3172\\skf marine\\Public\\Public',
    publicRoot_drive: 'I:\\Public\\Public',
    marineRoot_unc: '\\\\w3172\\skf marine',
    marineRoot_drive: 'I:\\',
  },

  toolSubfolders: {
    users: 'users',
    recovery: 'recovery',
    logs: 'logs',
    config: 'config',
    templates: 'templates',
    approvals: 'approvals',
    scheduledTasks: 'scheduled_tasks',
    bugs: 'bugs',
    knowledgeBase: 'knowledge_base',
    tools: 'tools',
    softwareInstalls: 'logs/software_installs',
    setupScripts: 'setup_scripts',
    inventory: 'inventory',
    incidentResponseConfig: 'config/incident_response',
    berechtigungenConfig: 'config/berechtigungen_beantragen',
  },

  softwareInstall: {
    solidworks: {
      robocopyFallback_unc: '\\\\w3172\\skf marine\\_SWX2024SP5_Update\\sRobocopy_SWX2024SP5.bat',
      robocopyFallback_drive: 'G:\\_SWX2024SP5_Update\\sRobocopy_SWX2024SP5.bat',
      swMappingScript_unc: '\\\\w3172\\skf marine\\Public\\Public\\Davide\\SOFTWARE\\SOLIDWORKS\\Solid Works\\Mapping.bat',
      swMappingScript_drive: 'I:\\Public\\Public\\Davide\\SOFTWARE\\SOLIDWORKS\\Solid Works\\Mapping.bat',
      driver3dConnexion_unc: '\\\\w3172\\skf marine\\700 Application\\711 IT Allgemein\\SW_INSTA\\3DConnexion',
      driver3dConnexion_drive: 'I:\\700 Application\\711 IT Allgemein\\SW_INSTA\\3DConnexion',
      hpiaInstaller_unc: '\\\\w3172\\skf marine\\Public\\Public\\Davide\\NEW PC-Refresh\\ALL\\hp-hpia-5.3.4.exe',
      hpiaInstaller_drive: 'I:\\Public\\Public\\Davide\\NEW PC-Refresh\\ALL\\hp-hpia-5.3.4.exe',
      installerLocalDir: 'C:\\TEMP',
      adminImageSubfolder: 'SOLIDWORKS 2024 SP5.0',
    },
  },

  tools: {
    psExec_unc: '\\\\w3172\\skf marine\\700 Application\\711 IT Allgemein\\SW_INSTA\\Tool IT\\tools\\PsExec.exe',
    psExec_drive: 'I:\\700 Application\\711 IT Allgemein\\SW_INSTA\\Tool IT\\tools\\PsExec.exe',
    dontSleep_unc: '\\\\w3172\\skf marine\\Public\\Public\\Elbsupport\\DontSleep_x64.exe',
    dontSleep_drive: 'I:\\Public\\Public\\Elbsupport\\DontSleep_x64.exe',
  },

  domains: {
    fileServer: 'w3172',
    appServer: 'w3143',
    intranetSite: 'file://w3143.corp.skf.net',
    intranetRegistryHost: 'w3143.corp',
    corpDomain: 'corp.skf.net',
  },

  preferredAccessMode: 'unc',
}

// ── PathService singleton ────────────────────────────────────────────────────

class PathService {
  private config: PathsConfig = { ...DEFAULT_PATHS }
  private loaded = false

  /** Load config from provided data (called from main process via IPC) */
  loadFromData(data: PathsConfig): void {
    this.config = data
    this.loaded = true
  }

  /** Reset to defaults */
  resetToDefaults(): void {
    this.config = { ...DEFAULT_PATHS }
  }

  /** Get current config (for UI editing) */
  getConfig(): PathsConfig {
    return this.config
  }

  /** Update config (from UI save) */
  updateConfig(data: PathsConfig): void {
    this.config = data
    this.loaded = true
  }

  get isLoaded(): boolean { return this.loaded }
  get preferredMode(): AccessMode { return this.config.preferredAccessMode }

  // ── Getters ────────────────────────────────────────────────────────────

  getToolRoot(mode?: AccessMode): string {
    const m = mode || this.config.preferredAccessMode
    return m === 'drive' ? this.config.base.toolRoot_drive : this.config.base.toolRoot_unc
  }

  getPublicRoot(mode?: AccessMode): string {
    const m = mode || this.config.preferredAccessMode
    return m === 'drive' ? this.config.base.publicRoot_drive : this.config.base.publicRoot_unc
  }

  getMarineRoot(mode?: AccessMode): string {
    const m = mode || this.config.preferredAccessMode
    return m === 'drive' ? this.config.base.marineRoot_drive : this.config.base.marineRoot_unc
  }

  getToolSubfolder(name: string, mode?: AccessMode): string {
    const sub = this.config.toolSubfolders[name] || name
    return this.getToolRoot(mode) + '\\' + sub
  }

  getToolsDir(mode?: AccessMode): string {
    return this.getToolSubfolder('tools', mode)
  }

  getPsExecDir(mode?: AccessMode): string {
    const m = mode || this.config.preferredAccessMode
    const full = m === 'drive' ? this.config.tools.psExec_drive : this.config.tools.psExec_unc
    // Return directory, not full exe path
    return full.replace(/\\[^\\]+$/, '')
  }

  getPsExecPath(mode?: AccessMode): string {
    const m = mode || this.config.preferredAccessMode
    return m === 'drive' ? this.config.tools.psExec_drive : this.config.tools.psExec_unc
  }

  getToolExecutable(name: string, mode?: AccessMode): string {
    const m = mode || this.config.preferredAccessMode
    const keyUnc = `${name}_unc`
    const keyDrive = `${name}_drive`
    if (m === 'drive' && this.config.tools[keyDrive]) return this.config.tools[keyDrive]
    if (this.config.tools[keyUnc]) return this.config.tools[keyUnc]
    return this.config.tools[keyDrive] || ''
  }

  getSoftwarePath(software: string, key: string, mode?: AccessMode): string {
    const sw = (this.config.softwareInstall as Record<string, Record<string, string>>)[software]
    if (!sw) return ''
    // If key has no _unc/_drive suffix, return as-is (e.g. installerLocalDir)
    if (sw[key] !== undefined) return sw[key]
    const m = mode || this.config.preferredAccessMode
    const keyUnc = `${key}_unc`
    const keyDrive = `${key}_drive`
    if (m === 'drive' && sw[keyDrive]) return sw[keyDrive]
    if (sw[keyUnc]) return sw[keyUnc]
    return sw[keyDrive] || ''
  }

  getDomain(name: string): string {
    return this.config.domains[name] || ''
  }
}

export const pathService = new PathService()
