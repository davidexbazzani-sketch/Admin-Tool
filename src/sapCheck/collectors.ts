// ── SAP-Fehlersuche: Kategorie-Collectors (je ein PowerShell-Block) ───────────
// Jede Kategorie liefert EIN Objekt (Invoke-Command → ConvertTo-Json macht der
// Runner). `build()` bewertet die Rohdaten zu Befunden. STRENG LESEND.
// Hinweis: einige Registry-/Dateipfade sind best-effort und im Code markiert
// (TODO-VERIFY) — auf einem echten SAP-PC gegenprüfen.

import type { SapBefund, SapKategorie } from './sapCheck.types'
import { THRESHOLDS, cmpVersion } from './rules'

export interface SapCollectorCtx { host: string; days: number }
export interface SapCollector {
  id: string
  kategorie: SapKategorie
  label: string
  script: (ctx: SapCollectorCtx) => string    // ScriptBlock-Rumpf (läuft auf dem Ziel)
  build: (parsed: Record<string, unknown> | null, raw: string, ctx: SapCollectorCtx) => SapBefund[]
}

// Kleiner Helfer zum Bauen eines Befunds.
function bef(b: Omit<SapBefund, 'vergleichbar'> & { vergleichbar?: boolean }): SapBefund {
  return { vergleichbar: true, ...b }
}
const s = (v: unknown): string => (v === undefined || v === null ? '' : String(v)).trim()
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null }

// PS-Prelude: SID + Profilpfad + Name des INTERAKTIV angemeldeten Users (nicht Admin!).
// (Muster aus remoteCommands.ts:2102-2117 — HKCU-/HKU-Falle, Fallstrick 3.)
const PS_USER = [
  `$ex = Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -EA SilentlyContinue | Select-Object -First 1`,
  `$sid=$null;$uname=$null;$prof=$null`,
  `if($ex){ try{$sid=(Invoke-CimMethod -InputObject $ex -MethodName GetOwnerSid).Sid}catch{}; try{$o=Invoke-CimMethod -InputObject $ex -MethodName GetOwner; $uname="$($o.Domain)\\$($o.User)"}catch{} }`,
  `if($sid){ try{$prof=(Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$sid" -EA Stop).ProfileImagePath}catch{}; if(-not(Get-PSDrive -Name HKU -EA SilentlyContinue)){try{New-PSDrive -Name HKU -PSProvider Registry -Root HKEY_USERS -EA SilentlyContinue|Out-Null}catch{}} }`,
].join('\n')

// ══ A — Installation ══════════════════════════════════════════════════════════
const installation: SapCollector = {
  id: 'installation', kategorie: 'Installation', label: 'SAP-Frontend-Installation',
  script: () => [
    `$r=[ordered]@{}`,
    // SAP GUI / saplogon.exe aus Uninstall-Registry
    `$paths=@('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')`,
    `$sap=Get-ItemProperty $paths -EA SilentlyContinue | Where-Object { $_.DisplayName -match 'SAP GUI|SAP Business Client|SAP Logon|SAPGUI' } | Select-Object DisplayName,DisplayVersion,Publisher,InstallDate | Sort-Object DisplayName -Unique`,
    `$r.produkte=@($sap)`,
    // saplogon.exe-Dateiversion (Standardpfade, TODO-VERIFY)
    `$exe=@('C:\\Program Files\\SAP\\FrontEnd\\SAPgui\\saplogon.exe','C:\\Program Files (x86)\\SAP\\FrontEnd\\SAPgui\\saplogon.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1`,
    `if($exe){ $fi=(Get-Item $exe).VersionInfo; $r.saplogon=[ordered]@{ pfad=$exe; version=$fi.ProductVersion; fileversion=$fi.FileVersion } }`,
    // WebView2 Runtime
    `$wv=Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}','HKLM:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -EA SilentlyContinue | Select-Object -First 1`,
    `$r.webview2=if($wv){$wv.pv}else{$null}`,
    `$r`,
  ].join('\n'),
  build: (p) => {
    const out: SapBefund[] = []
    const prod = Array.isArray(p?.produkte) ? (p!.produkte as Record<string, unknown>[]) : []
    const gui = prod.find(x => /SAP GUI|SAPGUI/i.test(s(x.DisplayName)))
    if (gui || p?.saplogon) {
      const ver = s((p?.saplogon as Record<string, unknown>)?.version) || s(gui?.DisplayVersion)
      out.push(bef({ id: 'install.sapgui', kategorie: 'Installation', titel: 'SAP GUI', quelle: 'Registry / saplogon.exe',
        wert: ver || 'installiert (Version unbekannt)', erwartung: 'aktueller Stand laut Referenz-PC',
        bewertung: ver ? 'ok' : 'hinweis', begruendung: gui ? s(gui.DisplayName) : 'saplogon.exe gefunden',
        rawData: JSON.stringify(prod, null, 2) }))
    } else {
      out.push(bef({ id: 'install.sapgui', kategorie: 'Installation', titel: 'SAP GUI', quelle: 'Registry',
        wert: 'nicht installiert', erwartung: 'SAP GUI installiert', bewertung: 'hinweis',
        begruendung: 'Kein SAP-GUI-Eintrag in der Uninstall-Registry gefunden.', vergleichbar: true }))
    }
    const wv = s(p?.webview2)
    out.push(bef({ id: 'install.webview2', kategorie: 'Installation', titel: 'Edge WebView2 Runtime', quelle: 'Registry (EdgeUpdate)',
      wert: wv || 'nicht gefunden', erwartung: 'installiert (SAP-Vorschau-/Web-Controls)',
      bewertung: wv ? 'ok' : 'hinweis', begruendung: wv ? '' : 'WebView2-Runtime nicht gefunden — SAP-GUI-Web-/Vorschaufenster können fehlschlagen.' }))
    return out
  },
}

// ══ B — Konfiguration (HKU des angemeldeten Users) ════════════════════════════
const konfiguration: SapCollector = {
  id: 'konfiguration', kategorie: 'Konfiguration', label: 'SAP-Konfiguration des Benutzers',
  script: () => [
    PS_USER,
    `$r=[ordered]@{ user=$uname; sid=$sid; profil=$prof }`,
    `if(-not $sid){ $r.fehler='Kein interaktiv angemeldeter Benutzer ermittelbar'; return $r }`,
    // Lokaler Config-Ordner (Praxis: C:\Users\<Kennung>\AppData\Roaming\SAP\Common)
    `$cfgDir="$prof\\AppData\\Roaming\\SAP\\Common"`,
    `$r.localDir=$cfgDir`,
    `$files=@('SAPUILandscape.xml','saplogon.ini') | ForEach-Object { $f=Join-Path $cfgDir $_; if(Test-Path $f){ $h=(Get-FileHash $f -Algorithm SHA256).Hash; [ordered]@{ name=$_; pfad=$f; groesse=(Get-Item $f).Length; geaendert=(Get-Item $f).LastWriteTime.ToString('yyyy-MM-dd HH:mm'); sha256=$h } } }`,
    `$r.dateien=@($files)`,
    `$r.onedrive= ($cfgDir -match 'OneDrive')`,
    // Lokale SAPUILandscape.xml explizit fuer den Dreifachvergleich (zentral<->Cache<->lokal)
    `$loc=Join-Path $cfgDir 'SAPUILandscape.xml'`,
    `if(Test-Path $loc){ $r.localFile=[ordered]@{ exists=$true; pfad=$loc; sha256=(Get-FileHash $loc -Algorithm SHA256).Hash; geaendert=(Get-Item $loc).LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'); groesse=(Get-Item $loc).Length } } else { $r.localFile=[ordered]@{ exists=$false } }`,
    // In der lokalen Datei eingebundene Landschaftsdateien (<Include url="...">)
    `$inc=@(); if(Test-Path $loc){ try{ [xml]$lx=Get-Content $loc -Raw; $inc=@($lx.SelectNodes('//Include') | ForEach-Object { $_.url } | Where-Object { $_ }) }catch{} }`,
    `$r.includes=@($inc)`,
    // SAP-Logon-Optionen: Server-XML-Pfad, Zwischenspeichern, Cache-Modus (HKU) — TODO-VERIFY Value-Namen
    `$opt=$null; try{ $opt=Get-ItemProperty "HKU:\\$sid\\Software\\SAP\\SAPLogon\\Options" -EA SilentlyContinue }catch{}`,
    `$optMap=[ordered]@{}; if($opt){ foreach($pp in $opt.PSObject.Properties){ if($pp.Name -notlike 'PS*'){ $optMap[$pp.Name]="$($pp.Value)" } } }`,
    `$r.options=$optMap`,
    // Server-XML-Pfad heuristisch = erster UNC/xml-Wert (Praxis: \\aznetapp01-4517.corp.skf.net\SapGui-EndUser\config\users\SAPUILandscape.xml)
    `$sp=$null; foreach($k in $optMap.Keys){ $v="$($optMap[$k])"; if($v -match '(?i)^\\\\\\\\.+\\.xml$'){ $sp=$v; break } }`,
    `$r.serverPath=$sp`,
    // Cache-Ordner (Praxis: ...\AppData\Roaming\SAP\LogonServerConfigCache) + Inhalt (neueste Datei = Cache-Stand)
    `$cacheDir="$prof\\AppData\\Roaming\\SAP\\LogonServerConfigCache"; $r.cachePath=$cacheDir`,
    `$cf=@(); if(Test-Path $cacheDir){ $cf=Get-ChildItem $cacheDir -File -Recurse -EA SilentlyContinue | Where-Object { $_.Extension -match '(?i)xml' -or $_.Length -gt 0 } | Sort-Object LastWriteTime -Descending | Select-Object -First 20 | ForEach-Object { [ordered]@{ name=$_.Name; sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash; geaendert=$_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'); groesse=$_.Length } } }`,
    `$r.cacheFiles=@($cf); if($cf.Count -gt 0){ $r.cacheNewest=$cf[0].geaendert; $r.cacheHash=$cf[0].sha256 }`,
    // GUI-Optionen aus HKU (Interaktionsdesign / Trace) — TODO-VERIFY Schluesselnamen
    `try{ $g=Get-ItemProperty "HKU:\\$sid\\Software\\SAP\\SAPGUI Front\\SAP Frontend Server\\Customize" -EA SilentlyContinue; if($g){ $r.trace=$g.TraceLevel; $r.design=$g.'Interaction Design' } }catch{}`,
    `$r`,
  ].join('\n'),
  build: (p) => {
    const out: SapBefund[] = []
    if (!p || p.fehler) {
      out.push(bef({ id: 'config.user', kategorie: 'Konfiguration', titel: 'Angemeldeter Benutzer', quelle: 'CIM/HKU',
        wert: 'unbekannt', erwartung: 'interaktiv angemeldeter Anwender', bewertung: 'unbekannt',
        begruendung: s(p?.fehler) || 'Kein angemeldeter Benutzer ermittelbar — SAP-GUI-Optionen (HKU) nicht lesbar.', vergleichbar: false }))
      return out
    }
    const files = Array.isArray(p.dateien) ? (p.dateien as Record<string, unknown>[]) : []
    const land = files.find(f => /SAPUILandscape/i.test(s(f.name)))
    out.push(bef({ id: 'config.landscape', kategorie: 'Konfiguration', titel: 'SAPUILandscape.xml', quelle: 'Datei (Userprofil)',
      wert: land ? `${s(land.pfad)} (SHA256 ${s(land.sha256).slice(0, 12)}…)` : 'nicht gefunden',
      erwartung: 'vorhanden; Hash = Referenz-PC', bewertung: land ? 'ok' : 'hinweis',
      begruendung: land ? `geändert ${s(land.geaendert)}, ${s(land.groesse)} Bytes` : 'Landschaftsdatei nicht im erwarteten Pfad — Verbindungen evtl. woanders konfiguriert.',
      rawData: JSON.stringify(files, null, 2) }))
    if (p.onedrive === true) {
      out.push(bef({ id: 'config.onedrive', kategorie: 'Konfiguration', titel: '%APPDATA%\\SAP im OneDrive', quelle: 'Pfad',
        wert: 'ja (OneDrive/Roaming)', erwartung: 'lokaler Pfad', bewertung: 'warnung',
        begruendung: 'SAP-Konfig liegt in einem OneDrive-/Roaming-Pfad — bremst den SAP-Start spürbar.' }))
    }
    // Server-XML-Pfad (Verteilung) — client-lesbar; die eigentliche Prüfung macht configShare.ts
    const serverPath = s(p.serverPath)
    out.push(bef({ id: 'config.serverpath', kategorie: 'Konfiguration', titel: 'Zentrale Systemliste (Server-XML)', quelle: 'SAP-Logon-Optionen (HKU)',
      wert: serverPath || 'nicht konfiguriert', erwartung: 'zentrale SAPUILandscape.xml auf Freigabe', bewertung: serverPath ? 'ok' : 'hinweis', vergleichbar: false,
      begruendung: serverPath ? 'SAP Logon lädt die Systemliste von dieser Freigabe.' : 'Kein Server-XML-Pfad in den SAP-Logon-Optionen — Systemliste kommt nur lokal.',
      rawData: JSON.stringify(p.options ?? {}, null, 2) }))
    // Cache-Ordner (Zwischenspeicher der Server-Systemliste)
    const cacheFiles = Array.isArray(p.cacheFiles) ? p.cacheFiles as Record<string, unknown>[] : []
    out.push(bef({ id: 'config.cache', kategorie: 'Konfiguration', titel: 'Lokaler Konfigurations-Cache', quelle: s(p.cachePath) || 'LogonServerConfigCache',
      wert: cacheFiles.length ? `${cacheFiles.length} Datei(en), zuletzt ${s(p.cacheNewest)}` : 'leer/nicht vorhanden',
      erwartung: 'aktueller Cache der zentralen Systemliste', bewertung: cacheFiles.length ? 'ok' : 'hinweis', vergleichbar: false,
      begruendung: cacheFiles.length ? 'Zwischenspeicher der Server-Systemliste vorhanden (Hash-Abgleich siehe „Systemliste zentral ↔ Cache ↔ lokal").' : 'Kein Cache — bei nicht erreichbarer Freigabe hat SAP Logon keine Systemliste.',
      rawData: JSON.stringify(cacheFiles, null, 2) }))
    const includes = Array.isArray(p.includes) ? (p.includes as unknown[]).map(s).filter(Boolean) : []
    if (includes.length) {
      out.push(bef({ id: 'config.includes', kategorie: 'Konfiguration', titel: 'Eingebundene Landschaftsdateien', quelle: 'SAPUILandscape.xml (lokal)',
        wert: `${includes.length} Include(s)`, erwartung: 'alle auflösbar', bewertung: 'ok', vergleichbar: false,
        begruendung: 'Auflösbarkeit jeder Datei wird zentral geprüft (siehe Include-Befunde).', rawData: JSON.stringify(includes, null, 2) }))
    }
    const trace = num(p.trace)
    if (trace !== null) {
      out.push(bef({ id: 'config.trace', kategorie: 'Konfiguration', titel: 'SAP-GUI-Trace', quelle: 'HKU (Customize)',
        wert: `Trace-Level ${trace}`, erwartung: '0 (aus)', bewertung: trace > 0 ? 'warnung' : 'ok',
        begruendung: trace > 0 ? 'Dauerhaft aktivierter Trace bremst das GUI und füllt die Platte.' : '' }))
    }
    const design = s(p.design)
    if (design) {
      out.push(bef({ id: 'config.design', kategorie: 'Konfiguration', titel: 'Interaktionsdesign (Rendering)', quelle: 'HKU (Customize)',
        wert: design, erwartung: 'Edge (außer bei bekanntem Vorschau-Bug)', bewertung: 'hinweis',
        begruendung: 'Rendering-Engine-Einstellung — für den Edge-Vorschau-Bug relevant (siehe Browser).' }))
    }
    return out
  },
}

// ══ C — Ressourcen ════════════════════════════════════════════════════════════
const ressourcen: SapCollector = {
  id: 'ressourcen', kategorie: 'Ressourcen', label: 'PC-Ressourcen & -Zustand',
  script: () => [
    `$r=[ordered]@{}`,
    `$os=Get-CimInstance Win32_OperatingSystem`,
    `$r.uptimeStunden=[math]::Round(((Get-Date)-$os.LastBootUpTime).TotalHours,1)`,
    `$r.ramFreiPct=[math]::Round(100*$os.FreePhysicalMemory/$os.TotalVisibleMemorySize,0)`,
    `$sys=Get-Volume -DriveLetter C -EA SilentlyContinue; if($sys){ $r.diskFreiGB=[math]::Round($sys.SizeRemaining/1GB,1); $r.diskFreiPct=[math]::Round(100*$sys.SizeRemaining/$sys.Size,0) }`,
    `try{ $pd=Get-PhysicalDisk -EA SilentlyContinue | Select-Object MediaType,HealthStatus; $r.disk=@($pd) }catch{}`,
    `try{ $r.energieplan=(powercfg /getactivescheme) }catch{}`,
    `try{ $bat=Get-CimInstance Win32_Battery -EA SilentlyContinue; if($bat){ $r.akku=$bat.BatteryStatus } }catch{}`,
    // Defender-Ausnahmen (nur wenn Defender aktiv)
    `try{ $mp=Get-MpPreference -EA Stop; $r.defenderExclProcess=@($mp.ExclusionProcess); $r.defenderExclPath=@($mp.ExclusionPath); $r.defenderAktiv=$true }catch{ $r.defenderAktiv=$false }`,
    // Zscaler
    `$r.zscaler=@(Get-Process -Name 'ZSATunnel','ZSATray','ZSAService' -EA SilentlyContinue | Select-Object -First 1 Name,Path,Product)`,
    // Aggressives Energiesparen (Regel 22): Platten-Abschaltzeit, USB-Selective-Suspend, Adapter-Energiesparen
    `try{ $d=(powercfg /q SCHEME_CURRENT 0012ee47-9041-4b5d-9b77-535fba8b1442 6738e2c4-e8a5-4a42-b16a-e040e769756e) -join "\`n"; $mx=[regex]::Matches($d,'0x[0-9a-fA-F]{8}'); if($mx.Count -ge 2){ $r.diskIdleAcSek=[Convert]::ToInt32($mx[$mx.Count-2].Value,16) } }catch{}`,
    `try{ $u=(powercfg /q SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226) -join "\`n"; $mu=[regex]::Matches($u,'0x[0-9a-fA-F]{8}'); if($mu.Count -ge 2){ $r.usbSelectiveAc=[Convert]::ToInt32($mu[$mu.Count-2].Value,16) } }catch{}`,
    `try{ $r.adapterPowerOff=@(Get-NetAdapterPowerManagement -EA SilentlyContinue | Where-Object { $_.AllowComputerToTurnOffDevice -eq 'Enabled' } | Select-Object -ExpandProperty Name) }catch{}`,
    // Windows-Updates (Regel 23) + ausstehender Neustart
    `try{ $hf=Get-HotFix -EA SilentlyContinue | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 5; $r.updates=@($hf | ForEach-Object { [ordered]@{ kb=$_.HotFixID; datum=$_.InstalledOn.ToString('yyyy-MM-dd') } }) }catch{}`,
    `try{ $r.rebootPending=[bool]((Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') -or (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending')) }catch{}`,
    `$r`,
  ].join('\n'),
  build: (p) => {
    const out: SapBefund[] = []
    const up = num(p?.uptimeStunden)
    if (up !== null) {
      const tage = up / 24
      const bew = tage > THRESHOLDS.uptimeWarnungTage ? 'warnung' : tage > THRESHOLDS.uptimeHinweisTage ? 'hinweis' : 'ok'
      out.push(bef({ id: 'res.uptime', kategorie: 'Ressourcen', titel: 'Betriebsdauer seit Neustart', quelle: 'Win32_OperatingSystem',
        wert: `${tage.toFixed(1)} Tage`, erwartung: `< ${THRESHOLDS.uptimeHinweisTage} Tage`, bewertung: bew,
        begruendung: bew !== 'ok' ? 'Lange Uptime ist eine der häufigsten Ursachen für SAP-Trägheit — Neustart empfehlen.' : '' }))
    }
    const dfp = num(p?.diskFreiPct), dfg = num(p?.diskFreiGB)
    if (dfp !== null) {
      const bew = dfp < THRESHOLDS.diskFehlerPct ? 'fehler' : (dfp < THRESHOLDS.diskWarnPct || (dfg !== null && dfg < THRESHOLDS.diskWarnGB)) ? 'warnung' : 'ok'
      out.push(bef({ id: 'res.disk', kategorie: 'Ressourcen', titel: 'Freier Platz Systempartition', quelle: 'Get-Volume C:',
        wert: `${dfp}% frei (${dfg ?? '?'} GB)`, erwartung: `≥ ${THRESHOLDS.diskWarnPct}% und ≥ ${THRESHOLDS.diskWarnGB} GB`, bewertung: bew,
        begruendung: bew !== 'ok' ? 'Wenig freier Platz kann SAP-GUI/Traces/Temp blockieren.' : '' }))
    }
    const plan = s(p?.energieplan)
    if (plan) {
      const spar = /sparsam|energiespar|power saver/i.test(plan)
      out.push(bef({ id: 'res.power', kategorie: 'Ressourcen', titel: 'Energieplan', quelle: 'powercfg',
        wert: plan.replace(/.*:\s*/, '').trim(), erwartung: 'Ausbalanciert/Höchstleistung', bewertung: spar ? 'warnung' : 'ok',
        begruendung: spar ? 'Energiesparmodus drosselt die CPU — SAP spürbar langsamer.' : '' }))
    }
    if (p && 'defenderAktiv' in p) {
      if (p.defenderAktiv) {
        const proc = Array.isArray(p.defenderExclProcess) ? p.defenderExclProcess as string[] : []
        const path = Array.isArray(p.defenderExclPath) ? p.defenderExclPath as string[] : []
        const hasSap = [...proc, ...path].some(x => /sap/i.test(String(x)))
        out.push(bef({ id: 'res.avexcl', kategorie: 'Ressourcen', titel: 'Antimalware-Ausnahmen für SAP', quelle: 'Get-MpPreference',
          wert: hasSap ? 'vorhanden' : 'keine SAP-Ausnahme', erwartung: 'SAP-Prozesse/-Verzeichnisse ausgenommen', bewertung: hasSap ? 'ok' : 'hinweis',
          begruendung: hasSap ? '' : 'Kein Defender-Ausschluss für SAP — bei Trägheit prüfen (vgl. Babtec-Fall).',
          rawData: JSON.stringify({ proc, path }, null, 2) }))
      } else {
        out.push(bef({ id: 'res.avexcl', kategorie: 'Ressourcen', titel: 'Antimalware-Ausnahmen für SAP', quelle: 'Get-MpPreference',
          wert: 'unbekannt', erwartung: 'SAP ausgenommen', bewertung: 'unbekannt', vergleichbar: false,
          begruendung: 'Kein Microsoft Defender aktiv (Drittprodukt?) — Ausnahmen nicht auslesbar.' }))
      }
    }
    const zs = Array.isArray(p?.zscaler) ? p!.zscaler as Record<string, unknown>[] : []
    out.push(bef({ id: 'res.zscaler', kategorie: 'Ressourcen', titel: 'Zscaler', quelle: 'Prozesse',
      wert: zs.length ? `aktiv (${s(zs[0].Product) || s(zs[0].Name)})` : 'nicht aktiv', erwartung: 'aktiv (Remote-Zugriff)',
      bewertung: 'hinweis', begruendung: zs.length ? '' : 'Kein Zscaler-Prozess gefunden — bei Remote-SAP-Zugriff relevant.' }))
    // Regel 22 — aggressives Energiesparen (Platten-Timeout/USB-Suspend/Adapter)
    const diskIdle = num(p?.diskIdleAcSek), usb = num(p?.usbSelectiveAc)
    const adPower = Array.isArray(p?.adapterPowerOff) ? p!.adapterPowerOff as string[] : []
    if (diskIdle !== null || usb !== null || adPower.length) {
      const teile: string[] = []
      const aggressivDisk = diskIdle !== null && diskIdle > 0 && diskIdle < 1200
      if (diskIdle !== null) teile.push(`Platte aus nach ${diskIdle === 0 ? 'nie' : Math.round(diskIdle / 60) + ' min'}`)
      if (usb !== null) teile.push(`USB-Selective-Suspend ${usb === 1 ? 'an' : 'aus'}`)
      if (adPower.length) teile.push(`Adapter-Energiesparen: ${adPower.join(', ')}`)
      const aggressiv = aggressivDisk || usb === 1 || adPower.length > 0
      out.push(bef({ id: 'res.power.detail', kategorie: 'Ressourcen', titel: 'Aggressives Energiesparen', quelle: 'powercfg / NetAdapterPowerManagement',
        wert: teile.join(' · '), erwartung: 'Platte nie abschalten, USB-Suspend aus, Adapter nicht abschaltbar', bewertung: aggressiv ? 'warnung' : 'ok', vergleichbar: true,
        begruendung: aggressiv ? 'Aggressives Energiesparen kann SAP-Abstürze auslösen (nicht nur Trägheit) — v. a. eine niedrige Festplatten-Abschaltzeit.' : '',
        empfehlung: aggressivDisk ? 'Festplatten-Abschaltzeit hochsetzen (bzw. „nie").' : undefined }))
    }
    // Regel 23 — Windows-Update-Aktualität
    const updates = Array.isArray(p?.updates) ? p!.updates as Record<string, unknown>[] : []
    if (updates.length) {
      const letzte = updates[0]
      const datum = s(letzte.datum)
      const tage = datum ? Math.floor((Date.now() - Date.parse(datum)) / 86400000) : null
      const jung = tage !== null && tage <= 14
      out.push(bef({ id: 'res.updates', kategorie: 'Ressourcen', titel: 'Letztes Windows-Update', quelle: 'Get-HotFix',
        wert: `${s(letzte.kb)} (${datum || '?'}${tage !== null ? `, vor ${tage} Tagen` : ''})`, erwartung: 'unauffällig', bewertung: jung ? 'hinweis' : 'ok', vergleichbar: false,
        begruendung: jung ? 'Update in den letzten 14 Tagen — bei gleichzeitigen SAP-GUI-Befunden kann das Update die Ursache sein (Workaround war Edge→IE).' : '',
        rawData: JSON.stringify(updates, null, 2) }))
    }
    if (p?.rebootPending === true) {
      out.push(bef({ id: 'res.reboot', kategorie: 'Ressourcen', titel: 'Ausstehender Neustart', quelle: 'Registry (RebootRequired/RebootPending)',
        wert: 'Neustart ausstehend', erwartung: 'kein ausstehender Neustart', bewertung: 'warnung', vergleichbar: false,
        begruendung: 'Ausstehender Neustart nach Updates — häufige Ursache für sporadische Probleme.', empfehlung: 'Neustart durchführen.' }))
    }
    return out
  },
}

// ══ D — Netzwerkpfad zu SAP (dynamisch aus der Landschaftsdatei) ══════════════
const netzwerk: SapCollector = {
  id: 'netzwerk', kategorie: 'Netzwerk', label: 'Netzwerkpfad zu SAP',
  script: () => [
    PS_USER,
    `$r=[ordered]@{}`,
    // Aktiver Adapter (LAN/WLAN)
    `$ad=Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object Status -eq 'Up' | Select-Object -First 1 Name,LinkSpeed,PhysicalMediaType`,
    `if($ad){ $r.adapter=[ordered]@{ name=$ad.Name; speed=$ad.LinkSpeed; wlan=($ad.PhysicalMediaType -match '802.11') } }`,
    `try{ if($ad -and $ad.PhysicalMediaType -match '802.11'){ $w=(netsh wlan show interfaces) -join "\`n"; if($w -match 'Signal\\s*:\\s*(\\d+)%'){ $r.wlanSignal=[int]$Matches[1] }; if($w -match 'Band\\s*:\\s*([\\d.]+ GHz)'){ $r.wlanBand=$Matches[1] } } }catch{}`,
    // Zielhosts + Ports aus SAPUILandscape.xml (Server-Attribut "host:port") — Ports NICHT raten,
    // sondern die tatsaechlich konfigurierten testen.
    `$svc=@()`,
    `$cfg="$prof\\AppData\\Roaming\\SAP\\Common\\SAPUILandscape.xml"`,
    `if($prof -and (Test-Path $cfg)){ try{ [xml]$x=Get-Content $cfg -Raw; $svc=@($x.SelectNodes('//Service') | ForEach-Object { $_.server } | Where-Object { $_ } | Select-Object -Unique) }catch{} }`,
    `$hosts=@($svc | ForEach-Object { ($_ -split ':')[0] } | Where-Object { $_ } | Select-Object -Unique)`,
    `$portMap=@{}; foreach($sv in $svc){ $pp=$sv -split ':'; if($pp.Count -ge 2){ $hh=$pp[0]; if(-not $portMap.ContainsKey($hh)){ $portMap[$hh]=@() }; $portMap[$hh]+=$pp[1] } }`,
    `$tests=@(); foreach($h in ($hosts | Select-Object -First 6)){ $ping=Test-Connection -ComputerName $h -Count 4 -EA SilentlyContinue; $avg=if($ping){[math]::Round(($ping | Measure-Object -Property ResponseTime -Average).Average,0)}else{$null}; $loss=if($ping){[math]::Round(100*(4-$ping.Count)/4,0)}else{100}; $dns=$null; try{$dns=[System.Net.Dns]::GetHostAddresses($h)[0].IPAddressToString}catch{}; $ports=@(); foreach($pt in (@($portMap[$h]) | Select-Object -Unique)){ $pn=0; if([int]::TryParse("$pt",[ref]$pn) -and $pn -gt 0){ try{ $sw=[System.Diagnostics.Stopwatch]::StartNew(); $tc=Test-NetConnection -ComputerName $h -Port $pn -WarningAction SilentlyContinue; $ports+=[ordered]@{ port=$pn; open=[bool]$tc.TcpTestSucceeded; ms=[int]$sw.ElapsedMilliseconds } }catch{} } }; $tests+=[ordered]@{ host=$h; ip=$dns; avgMs=$avg; lossPct=$loss; ports=@($ports) } }`,
    `$r.ziele=@($tests)`,
    // Kerberos-Zeitabweichung zum DC
    `try{ $dc=(w32tm /query /source) 2>$null; $strip=(w32tm /stripchart /computer:$env:USERDNSDOMAIN /samples:1 /dataonly) 2>$null; $r.zeitquelle=$dc; if(($strip -join ' ') -match '([-+]?\\d+\\.\\d+)s'){ $r.zeitabweichungSek=[double]$Matches[1] } }catch{}`,
    `$r`,
  ].join('\n'),
  build: (p) => {
    const out: SapBefund[] = []
    const ad = p?.adapter as Record<string, unknown> | undefined
    if (ad) {
      const wlan = ad.wlan === true
      const sig = num(p?.wlanSignal)
      const bew = wlan && sig !== null && sig < THRESHOLDS.wlanSignalWarnPct ? 'warnung' : 'ok'
      out.push(bef({ id: 'net.adapter', kategorie: 'Netzwerk', titel: 'Netzwerkanbindung', quelle: 'Get-NetAdapter/netsh',
        wert: wlan ? `WLAN${sig !== null ? ` (${sig}%${s(p?.wlanBand) ? ', ' + s(p?.wlanBand) : ''})` : ''}` : `LAN (${s(ad.speed)})`,
        erwartung: 'LAN oder starkes WLAN', bewertung: bew,
        begruendung: bew === 'warnung' ? 'Schwaches WLAN ist bei uns eine häufige Ursache für „SAP ist langsam".' : '' }))
    }
    const ziele = Array.isArray(p?.ziele) ? p!.ziele as Record<string, unknown>[] : []
    if (ziele.length === 0) {
      out.push(bef({ id: 'net.ziele', kategorie: 'Netzwerk', titel: 'SAP-Zielhosts', quelle: 'SAPUILandscape.xml',
        wert: 'keine ermittelt', erwartung: 'Hosts aus der Landschaftsdatei', bewertung: 'unbekannt', vergleichbar: false,
        begruendung: 'Keine Zielhosts aus der Landschaftsdatei gelesen (Datei fehlt/leer oder kein angemeldeter User).' }))
    }
    for (const z of ziele) {
      const avg = num(z.avgMs), loss = num(z.lossPct)
      const ports = Array.isArray(z.ports) ? z.ports as Record<string, unknown>[] : []
      const zu = ports.filter(pt => pt.open === false)
      const latAuff = (loss !== null && loss > 0) || (avg !== null && avg > THRESHOLDS.netLatenzWarnMs)
      const bew = zu.length > 0 || latAuff ? 'warnung' : avg === null && !ports.some(pt => pt.open === true) ? 'unbekannt' : 'ok'
      const portTxt = ports.length ? `; Ports ${ports.map(pt => `${s(pt.port)} ${pt.open ? 'offen' : 'zu'}`).join(', ')}` : ''
      out.push(bef({ id: `net.ziel.${s(z.host).toLowerCase()}`, kategorie: 'Netzwerk', titel: `Erreichbarkeit ${s(z.host)}`, quelle: 'Test-Connection/DNS/TCP',
        wert: (avg !== null ? `${avg} ms, ${loss ?? '?'}% Verlust${s(z.ip) ? ` (${s(z.ip)})` : ''}` : 'Ping nicht beantwortet') + portTxt,
        erwartung: `≤ ${THRESHOLDS.netLatenzWarnMs} ms, 0% Verlust, konfigurierte Ports offen`, bewertung: bew, vergleichbar: false,
        begruendung: zu.length ? `Konfigurierte(r) SAP-Port(s) nicht erreichbar: ${zu.map(pt => s(pt.port)).join(', ')} — Verbindung zum SAP-Host blockiert (Firewall/Zscaler/Route?).` : latAuff ? 'Hohe Latenz/Paketverlust zum SAP-Host.' : bew === 'unbekannt' ? 'Host nicht erreichbar (Ping blockiert und keine offenen Ports gefunden).' : '',
        rawData: ports.length ? JSON.stringify(ports, null, 2) : undefined }))
    }
    const skew = num(p?.zeitabweichungSek)
    if (skew !== null) {
      const min = Math.abs(skew) / 60
      out.push(bef({ id: 'net.kerberos', kategorie: 'Netzwerk', titel: 'Zeitabweichung zum Domänencontroller', quelle: 'w32tm',
        wert: `${skew.toFixed(1)} s`, erwartung: `< ${THRESHOLDS.kerberosSkewFehlerMin} min`, bewertung: min > THRESHOLDS.kerberosSkewFehlerMin ? 'fehler' : 'ok',
        begruendung: min > THRESHOLDS.kerberosSkewFehlerMin ? 'Über 5 Minuten Abweichung → Kerberos/SSO scheitert komplett.' : '' }))
    }
    return out
  },
}

// ══ F — Ereignisprotokoll ═════════════════════════════════════════════════════
const ereignisse: SapCollector = {
  id: 'ereignisse', kategorie: 'Ereignisse', label: 'Ereignisprotokoll & Absturzspuren',
  script: (ctx) => [
    `$since=(Get-Date).AddDays(-${ctx.days})`,
    `$ev=@()`,
    `try{ $ev += Get-WinEvent -FilterHashtable @{LogName='Application';StartTime=$since;ProviderName='Application Error','Application Hang','.NET Runtime','Windows Error Reporting'} -MaxEvents 200 -EA SilentlyContinue }catch{}`,
    `try{ $ev += Get-WinEvent -FilterHashtable @{LogName='System';StartTime=$since;ProviderName='Microsoft-Windows-Kerberos-Key-Distribution-Center','Kerberos','LsaSrv','Schannel','Netlogon'} -MaxEvents 200 -EA SilentlyContinue }catch{}`,
    `$rel=$ev | Where-Object { $_.Message -match 'sap|saplogon|sapgui|nwbc|msedge|kerberos|schannel' -or $_.ProviderName -match 'Kerberos|Schannel|LsaSrv' }`,
    `$grp=$rel | Group-Object Id,ProviderName | Sort-Object Count -Descending | Select-Object -First 15 | ForEach-Object { [ordered]@{ id=($_.Group[0].Id); quelle=$_.Group[0].ProviderName; anzahl=$_.Count; zuletzt=$_.Group[0].TimeCreated.ToString('yyyy-MM-dd HH:mm'); text=($_.Group[0].Message -split "\`n")[0] } }`,
    `[ordered]@{ tage=${ctx.days}; treffer=$rel.Count; gruppen=@($grp) }`,
  ].join('\n'),
  build: (p, _raw, ctx) => {
    const groups = Array.isArray(p?.gruppen) ? p!.gruppen as Record<string, unknown>[] : []
    const total = num(p?.treffer) ?? 0
    const bew = groups.some(g => (num(g.anzahl) ?? 0) >= 10) ? 'warnung' : total > 0 ? 'hinweis' : 'ok'
    return [bef({ id: 'events.sap', kategorie: 'Ereignisse', titel: `SAP-/SSO-relevante Ereignisse (${ctx.days} Tage)`, quelle: 'Get-WinEvent',
      wert: `${total} Treffer, ${groups.length} Häufungen`, erwartung: 'keine gehäuften Fehler', bewertung: bew, vergleichbar: false,
      begruendung: groups.length ? `Top: ${groups.slice(0, 3).map(g => `ID ${s(g.id)}×${s(g.anzahl)}`).join(', ')}` : 'Keine auffälligen Ereignisse.',
      rawData: JSON.stringify(groups, null, 2) })]
  },
}

// ══ G — SAP-Traces (nur Metadaten) ════════════════════════════════════════════
const traces: SapCollector = {
  id: 'traces', kategorie: 'Traces', label: 'SAP-Logs & Traces',
  script: () => [
    PS_USER,
    `$r=[ordered]@{}`,
    `$dir="$prof\\AppData\\Roaming\\SAP\\Common"`,
    `$tr=@(); if($prof -and (Test-Path $dir)){ $tr=Get-ChildItem $dir -Recurse -Include '*.trc','dev_*' -EA SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 20 | ForEach-Object { [ordered]@{ name=$_.Name; groesseKB=[math]::Round($_.Length/1KB,0); geaendert=$_.LastWriteTime.ToString('yyyy-MM-dd HH:mm') } } }`,
    `$r.dateien=@($tr); $r.gesamtKB=[math]::Round((($tr | Measure-Object -Property groesseKB -Sum).Sum),0)`,
    `$r`,
  ].join('\n'),
  build: (p) => {
    const files = Array.isArray(p?.dateien) ? p!.dateien as Record<string, unknown>[] : []
    const sum = num(p?.gesamtKB) ?? 0
    const bew = sum > 200000 ? 'warnung' : files.length ? 'hinweis' : 'ok'
    return [bef({ id: 'traces.files', kategorie: 'Traces', titel: 'SAP-Trace-Dateien', quelle: 'Dateisystem (nur Metadaten)',
      wert: `${files.length} Dateien, ${(sum / 1024).toFixed(1)} MB`, erwartung: 'wenige/kleine Traces', bewertung: bew, vergleichbar: false,
      begruendung: bew === 'warnung' ? 'Große Trace-Menge — evtl. dauerhaft aktivierter Trace (bremst + füllt Platte).' : files.length ? 'Traces vorhanden.' : 'Keine Traces.',
      rawData: JSON.stringify(files, null, 2) })]
  },
}

// ══ H — Browser (Edge/WebView2/Fiori/ZHIP) ════════════════════════════════════
const browser: SapCollector = {
  id: 'browser', kategorie: 'Browser', label: 'Browser-Umfeld (Fiori/ShipManager)',
  script: () => [
    PS_USER,
    `$r=[ordered]@{}`,
    `$edge=@('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1`,
    `if($edge){ $r.edgeVersion=(Get-Item $edge).VersionInfo.ProductVersion }`,
    // Standard-Browser fuer https (aus HKU des Users)
    `if($sid){ try{ $p=(Get-ItemProperty "HKU:\\$sid\\SOFTWARE\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice" -EA SilentlyContinue).ProgId; $r.httpsHandler=$p }catch{} }`,
    // ZHIP/ShipManager-Nutzung (Verknuepfung/Verlauf grob) — best effort
    `$r.zhip = (Test-Path "$prof\\AppData\\Roaming\\Microsoft\\Windows\\Recent\\*ShipManager*") -or (Test-Path "$prof\\Desktop\\*ZHIP*")`,
    // enaiocore.skf.net: DNS/TCP443/TLS/Cert (Regel 25) — Dokumentenablage aus SAP haengt daran
    `$r.enaio=[ordered]@{}`,
    `try{ $tc=Test-NetConnection -ComputerName 'enaiocore.skf.net' -Port 443 -WarningAction SilentlyContinue; $r.enaio.tcp443=[bool]$tc.TcpTestSucceeded; if($tc.RemoteAddress){ $r.enaio.ip=$tc.RemoteAddress.IPAddressToString } }catch{}`,
    `try{ [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $req=[Net.HttpWebRequest]::Create('https://enaiocore.skf.net'); $req.Method='HEAD'; $req.Timeout=8000; $resp=$req.GetResponse(); $r.enaio.status=[int]$resp.StatusCode; $c=$req.ServicePoint.Certificate; if($c){ $r.enaio.certAblauf=([DateTime]::Parse($c.GetExpirationDateString())).ToString('yyyy-MM-dd') }; $resp.Close() }catch{ $r.enaio.fehler=$_.Exception.Message }`,
    // Anzeige-/Benutzersprache (best effort, TODO-VERIFY)
    `try{ $r.systemLocale=(Get-Culture).Name }catch{}`,
    `if($sid){ try{ $r.userLocale=(Get-ItemProperty "HKU:\\$sid\\Control Panel\\International" -EA SilentlyContinue).LocaleName }catch{} }`,
    // Zscaler-Root-CA im Maschinen-Vertrauensspeicher (fuer TLS-Interception noetig)
    `try{ $r.zscalerRootCA=@(Get-ChildItem Cert:\\LocalMachine\\Root -EA SilentlyContinue | Where-Object { $_.Subject -match 'Zscaler' } | Select-Object -First 1 | ForEach-Object { [ordered]@{ subject=$_.Subject; ablauf=$_.NotAfter.ToString('yyyy-MM-dd'); gueltig=($_.NotAfter -gt (Get-Date)) } }) }catch{}`,
    // ShipManager/BTP-Weiterleitung erreichbar? (nur HEAD, nichts anmelden)
    `$r.shipmanager=[ordered]@{}`,
    `try{ [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $rq=[Net.HttpWebRequest]::Create('https://url.skf-marine.com'); $rq.Method='HEAD'; $rq.Timeout=8000; $rp=$rq.GetResponse(); $r.shipmanager.status=[int]$rp.StatusCode; $rp.Close() }catch{ $r.shipmanager.fehler=$_.Exception.Message }`,
    `$r`,
  ].join('\n'),
  build: (p) => {
    const out: SapBefund[] = []
    const ev = s(p?.edgeVersion)
    out.push(bef({ id: 'browser.edge', kategorie: 'Browser', titel: 'Microsoft Edge Version', quelle: 'msedge.exe',
      wert: ev || 'nicht gefunden', erwartung: 'aktuell', bewertung: ev ? 'ok' : 'hinweis', begruendung: ev ? '' : 'Edge nicht gefunden.' }))
    // Edge-Vorschau-Bug
    if (ev && cmpVersion(ev, THRESHOLDS.edgeBrokenPreviewFrom) >= 0 && cmpVersion(ev, THRESHOLDS.edgeBrokenPreviewFixed) < 0) {
      out.push(bef({ id: 'browser.edge.previewbug', kategorie: 'Browser', titel: 'Edge-Vorschaufenster-Bug (SAP GUI)', quelle: 'Edge-Version',
        wert: ev, erwartung: `≥ ${THRESHOLDS.edgeBrokenPreviewFixed}`, bewertung: 'warnung',
        begruendung: `Edge ${ev} bricht SAP-GUI-Vorschaufenster (AFI Direct Invoice Monitor, Objektnavigator).`,
        empfehlung: 'ALT+F12 → Optionen → Interaktionsdesign auf Internet Explorer — sofern KEIN ShipManager/ZHIP genutzt wird.' }))
    }
    const zhip = p?.zhip === true
    out.push(bef({ id: 'browser.zhip', kategorie: 'Browser', titel: 'ShipManager/ZHIP-Nutzung', quelle: 'Verknüpfung/Verlauf',
      wert: zhip ? 'ja (erkannt)' : 'nicht erkannt', erwartung: '—', bewertung: 'ok', vergleichbar: false,
      begruendung: zhip ? 'ZHIP braucht zwingend Edge — Edge nicht deaktivieren.' : '' }))
    const https = s(p?.httpsHandler)
    if (https && !/edge|MSEdge/i.test(https)) {
      out.push(bef({ id: 'browser.default', kategorie: 'Browser', titel: 'Standard-Browser (https)', quelle: 'HKU UserChoice',
        wert: https, erwartung: 'Microsoft Edge', bewertung: 'hinweis',
        begruendung: 'Nicht Edge als Standard — ZHIP/ShipManager-Weiterleitungen können brechen.' }))
    }
    // Regel 25 — enaiocore.skf.net (Dokumentenablage aus SAP)
    const enaio = p?.enaio as Record<string, unknown> | undefined
    if (enaio) {
      const fehler = s(enaio.fehler)
      const tcp = enaio.tcp443 === true
      const status = num(enaio.status)
      const okTls = !fehler && (status !== null ? status < 400 : tcp)
      out.push(bef({ id: 'browser.enaio', kategorie: 'Browser', titel: 'enaiocore.skf.net (TLS)', quelle: 'TCP443/HTTPS',
        wert: okTls ? `erreichbar${status !== null ? `, HTTP ${status}` : ''}${s(enaio.certAblauf) ? `, Cert bis ${s(enaio.certAblauf)}` : ''}` : fehler ? `TLS-Fehler: ${fehler}` : tcp ? 'TCP 443 offen, HTTPS unklar' : 'nicht erreichbar',
        erwartung: 'TLS-Aufbau ok, Zertifikat gültig', bewertung: okTls ? 'ok' : 'fehler', vergleichbar: false,
        begruendung: okTls ? 'Dokumentenablage/-anzeige aus SAP erreichbar.' : 'Dokumentenablage/-anzeige aus SAP hängt an enaiocore.skf.net (nicht an SAP selbst) — TLS/Zertifikat prüfen.',
        rawData: JSON.stringify(enaio, null, 2) }))
    }
    const userLoc = s(p?.userLocale), sysLoc = s(p?.systemLocale)
    if (userLoc || sysLoc) {
      out.push(bef({ id: 'browser.language', kategorie: 'Browser', titel: 'Anzeigesprache', quelle: 'Registry/Get-Culture',
        wert: `Benutzer ${userLoc || '?'} · System ${sysLoc || '?'}`, erwartung: 'konsistent (i. d. R. de-DE)', bewertung: (userLoc && !/^de|^en/i.test(userLoc)) ? 'hinweis' : 'ok', vergleichbar: true,
        begruendung: (userLoc && !/^de|^en/i.test(userLoc)) ? 'Ungewöhnliche Sprache — Fiori kann in falscher Sprache erscheinen.' : '' }))
    }
    // Zscaler-Root-CA
    const zca = Array.isArray(p?.zscalerRootCA) ? p!.zscalerRootCA as Record<string, unknown>[] : []
    const zcaOk = zca.length > 0 && zca[0]?.gueltig === true
    out.push(bef({ id: 'browser.zscalercert', kategorie: 'Browser', titel: 'Zscaler-Root-CA im Vertrauensspeicher', quelle: 'Cert:\\LocalMachine\\Root',
      wert: zca.length ? `vorhanden${s(zca[0].ablauf) ? `, gültig bis ${s(zca[0].ablauf)}` : ''}${zca[0]?.gueltig === false ? ' (ABGELAUFEN)' : ''}` : 'nicht gefunden',
      erwartung: 'vorhanden & gültig (bei Zscaler-Interception)', bewertung: zca.length ? (zcaOk ? 'ok' : 'warnung') : 'hinweis', vergleichbar: true,
      begruendung: zcaOk ? '' : zca.length ? 'Zscaler-Root-CA abgelaufen — TLS-Interception schlägt fehl, HTTPS-Seiten brechen.' : 'Keine Zscaler-Root-CA im Speicher — bei aktiver Zscaler-Interception brechen TLS-Verbindungen (Fiori/BTP).',
      rawData: zca.length ? JSON.stringify(zca, null, 2) : undefined }))
    // ShipManager/BTP-Weiterleitung
    const sm = p?.shipmanager as Record<string, unknown> | undefined
    if (sm && (s(sm.status) || s(sm.fehler))) {
      const st = num(sm.status), fehler = s(sm.fehler)
      const okSm = st !== null && st < 400
      out.push(bef({ id: 'browser.shipmanager', kategorie: 'Browser', titel: 'ShipManager-Weiterleitung (url.skf-marine.com)', quelle: 'HTTPS HEAD',
        wert: okSm ? `erreichbar (HTTP ${st})` : fehler ? `Fehler: ${fehler}` : `HTTP ${st ?? '?'}`,
        erwartung: 'erreichbar (HTTP < 400)', bewertung: okSm ? 'ok' : zhip ? 'warnung' : 'hinweis', vergleichbar: false,
        begruendung: okSm ? '' : 'ShipManager-/BTP-Einstieg nicht erreichbar — Zscaler/DNS/Proxy prüfen (nur bei ZHIP-Nutzung kritisch).' }))
    }
    return out
  },
}

// ══ I — Anmelde-/Kerberos-Kontext (höchste Ursachen-Priorität) ════════════════
// Fallstrick 3+4: klist im Kontext des ANGEMELDETEN Users (nicht des Admins) über
// dessen LogonId (`klist -li`), read-only. TODO-VERIFY: exakte klist-Ausgabe (Locale)
// und die SAP-SNC-SPN-Erkennung auf einem echten Client gegenprüfen.
const anmeldung: SapCollector = {
  id: 'anmeldung', kategorie: 'Anmeldung', label: 'Anmeldung & Kerberos/SNC',
  script: () => [
    PS_USER,
    `$r=[ordered]@{ user=$uname; sid=$sid }`,
    `if(-not $sid){ $r.fehler='Kein interaktiv angemeldeter Benutzer ermittelbar'; return $r }`,
    // Sitzungstyp (2=lokal, 10=RDP)
    `try{ $lt=(Get-CimInstance Win32_LogonSession -Filter 'LogonType=2 OR LogonType=10' -EA SilentlyContinue | Select-Object -First 1).LogonType; $r.sitzungstyp= if($lt -eq 10){'RDP'}elseif($lt -eq 2){'lokal'}else{"$lt"} }catch{}`,
    // LogonId (LUID) der interaktiven Session des Users aus 'klist sessions'
    `$luid=$null; try{ $sess=klist sessions 2>$null; foreach($ln in $sess){ if($uname -and ($ln -match [regex]::Escape($uname))){ if($ln -match '0:(0x[0-9a-fA-F]+)'){ $luid=$Matches[1]; break } } } }catch{}`,
    `$r.luid=$luid`,
    // Tickets des Users (per LUID, sonst Fallback ohne — dann Admin-Kontext, wird als unbekannt bewertet)
    `$kl=$null; try{ if($luid){ $kl=klist -li $luid 2>$null } else { $kl=klist 2>$null } }catch{ $r.klistFehler=$_.Exception.Message }`,
    `if($kl){ $txt=($kl -join "\`n"); $r.ticketAnzahl=([regex]::Matches($txt,'#\\d+>')).Count; $r.tgt=[bool]($txt -match '(?i)krbtgt'); $r.sapTicket=[bool]($txt -match '(?i)SAP[/ ]'); $r.klistRoh=$txt } else { $r.ticketAnzahl=0 }`,
    // Windows Hello / NGC eingerichtet? (best effort)
    `try{ $r.helloEingerichtet=[bool](Test-Path "$prof\\AppData\\Local\\Microsoft\\Ngc") }catch{}`,
    `try{ $r.authPackage=(Get-CimInstance Win32_LogonSession -Filter 'LogonType=2' -EA SilentlyContinue | Select-Object -First 1).AuthenticationPackage }catch{}`,
    `$r`,
  ].join('\n'),
  build: (p) => {
    const out: SapBefund[] = []
    if (!p || p.fehler) {
      out.push(bef({ id: 'anmeldung.ticket', kategorie: 'Anmeldung', titel: 'Kerberos-Ticket (SAP-SNC)', quelle: 'klist',
        wert: 'unbekannt', erwartung: 'gültiges TGT + SAP-Serviceticket', bewertung: 'unbekannt', vergleichbar: false,
        begruendung: s(p?.fehler) || 'Angemeldeter Benutzer/LUID nicht ermittelbar — Ticketstatus im Anwenderkontext nicht lesbar.' }))
      return out
    }
    out.push(bef({ id: 'anmeldung.user', kategorie: 'Anmeldung', titel: 'Angemeldeter Benutzer', quelle: 'CIM',
      wert: `${s(p.user) || 'unbekannt'}${s(p.sitzungstyp) ? ` (${s(p.sitzungstyp)})` : ''}`, erwartung: 'interaktiv angemeldeter Anwender', bewertung: 'ok', vergleichbar: false,
      begruendung: 'Basis für alle HKU-/Kerberos-Prüfungen (Fallstrick 3).' }))
    // Regel 20 — Kerberos-Ticket im Anwenderkontext
    if (!p.luid) {
      out.push(bef({ id: 'anmeldung.ticket', kategorie: 'Anmeldung', titel: 'Kerberos-Ticket (SAP-SNC)', quelle: 'klist',
        wert: 'nicht im Anwenderkontext lesbar', erwartung: 'gültiges TGT + SAP-Serviceticket', bewertung: 'unbekannt', vergleichbar: false,
        begruendung: 'LogonId des Anwenders nicht ermittelbar — klist würde nur die Admin-Tickets zeigen (Fallstrick 3), daher nicht bewertet.' }))
    } else {
      const cnt = num(p.ticketAnzahl) ?? 0
      const tgt = p.tgt === true
      const sapT = p.sapTicket === true
      const bew = cnt === 0 || !tgt ? 'fehler' : 'ok'
      out.push(bef({ id: 'anmeldung.ticket', kategorie: 'Anmeldung', titel: 'Kerberos-Ticket (SAP-SNC)', quelle: 'klist -li',
        wert: cnt === 0 ? 'keine Tickets' : `${cnt} Ticket(s), TGT ${tgt ? 'ja' : 'nein'}, SAP-Serviceticket ${sapT ? 'erkannt' : 'nicht sicher erkannt'}`,
        erwartung: 'gültiges TGT + SAP-Serviceticket', bewertung: bew, vergleichbar: false,
        begruendung: bew === 'fehler'
          ? 'Kein gültiges Kerberos-Ticket/TGT — SSO/SNC zu SAP scheitert. Häufigste Ursache laut Ticketauswertung.'
          : sapT ? 'TGT und SAP-Serviceticket vorhanden.' : 'TGT vorhanden; ein SAP-spezifisches Serviceticket wird oft erst bei Verbindungsaufbau ausgestellt (SPN-Erkennung best-effort).',
        empfehlung: bew === 'fehler' ? 'Am Client behebbar: kinit, sonst klist purge + Neustart.' : undefined,
        rawData: s(p.klistRoh) || undefined }))
    }
    // Regel 21 — Windows-Hello-Anmeldung (Korrektur zusammen mit Ticket in applyKnownCases)
    if (p.helloEingerichtet === true) {
      out.push(bef({ id: 'anmeldung.hello', kategorie: 'Anmeldung', titel: 'Windows-Hello-Anmeldung', quelle: 'NGC/Registry',
        wert: `Windows Hello/PIN eingerichtet${s(p.authPackage) ? ` (Auth: ${s(p.authPackage)})` : ''}`, erwartung: '—', bewertung: 'ok', vergleichbar: false,
        begruendung: 'Bei SSO-Problemen zusammen mit dem Kerberos-Ticketstatus bewerten (Hello-Anmeldung kann SAP-Ticket verhindern).' }))
    }
    return out
  },
}

// ══ E — Drucken & Office-Export ═══════════════════════════════════════════════
const drucken: SapCollector = {
  id: 'drucken', kategorie: 'Drucken', label: 'Drucken & Office-Export',
  script: () => [
    PS_USER,
    `$r=[ordered]@{}`,
    `try{ $dp=Get-CimInstance Win32_Printer -Filter 'Default=TRUE' -EA SilentlyContinue | Select-Object -First 1 Name,DriverName,PortName; if($dp){ $r.standarddrucker=[ordered]@{ name=$dp.Name; treiber=$dp.DriverName; port=$dp.PortName } } }catch{}`,
    `try{ $sp=Get-Service -Name Spooler -EA SilentlyContinue; if($sp){ $r.spooler=$sp.Status.ToString() } }catch{}`,
    `try{ if($sid){ $r.pdfHandler=(Get-ItemProperty "HKU:\\$sid\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pdf\\UserChoice" -EA SilentlyContinue).ProgId } }catch{}`,
    `$xls="$prof\\AppData\\Roaming\\Microsoft\\Excel\\XLSTART"`,
    `$r.personalXlsb=[bool](Test-Path (Join-Path $xls 'PERSONAL.XLSB'))`,
    `try{ $r.xlstartDateien=@(Get-ChildItem $xls -File -EA SilentlyContinue | Select-Object -ExpandProperty Name) }catch{ $r.xlstartDateien=@() }`,
    `$r`,
  ].join('\n'),
  build: (p) => {
    const out: SapBefund[] = []
    const dp = p?.standarddrucker as Record<string, unknown> | undefined
    out.push(bef({ id: 'print.default', kategorie: 'Drucken', titel: 'Standarddrucker', quelle: 'Win32_Printer',
      wert: dp ? `${s(dp.name)} (${s(dp.treiber)})` : 'keiner gesetzt', erwartung: 'gesetzt', bewertung: dp ? 'ok' : 'hinweis', vergleichbar: false,
      begruendung: dp ? '' : 'Kein Standarddrucker — Drucken aus SAP schlägt fehl.' }))
    const sp = s(p?.spooler)
    if (sp) {
      out.push(bef({ id: 'print.spooler', kategorie: 'Drucken', titel: 'Druckwarteschlangendienst', quelle: 'Get-Service Spooler',
        wert: sp, erwartung: 'Running', bewertung: /running/i.test(sp) ? 'ok' : 'warnung', vergleichbar: false,
        begruendung: /running/i.test(sp) ? '' : 'Spooler läuft nicht — kein Druck aus SAP möglich.' }))
    }
    const pdf = s(p?.pdfHandler)
    if (pdf) {
      out.push(bef({ id: 'print.pdf', kategorie: 'Drucken', titel: 'Standard-App für PDF', quelle: 'HKU UserChoice',
        wert: pdf, erwartung: 'funktionierender PDF-Viewer', bewertung: 'hinweis', vergleichbar: true,
        begruendung: 'Bei „Montagescheine/Belege lassen sich nicht anzeigen" den PDF-Standard prüfen (INC2881722/INC2695323).' }))
    }
    // Regel 24 — PERSONAL.XLSB
    if (p?.personalXlsb === true) {
      out.push(bef({ id: 'print.personalxlsb', kategorie: 'Drucken', titel: 'Excel PERSONAL.XLSB', quelle: 'XLSTART',
        wert: 'vorhanden', erwartung: 'kein blockierendes Makro', bewertung: 'hinweis', vergleichbar: false,
        begruendung: 'Ein Makro in PERSONAL.XLSB kann den kompletten Excel-Export aus SAP lahmlegen.',
        rawData: JSON.stringify(p.xlstartDateien ?? [], null, 2) }))
    }
    return out
  },
}

export const SAP_COLLECTORS: SapCollector[] = [
  anmeldung, installation, konfiguration, ressourcen, netzwerk, drucken, ereignisse, traces, browser,
]
