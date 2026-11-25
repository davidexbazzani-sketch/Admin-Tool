// HCI-Fragebogen: die zwölf Fragen — wörtlich wie in „Analysis applications HCI.xlsx“ (Spalte „Question“).
export interface HciFrage { nr: number; frage: string; kurz: string }

export const HCI_FRAGEN: HciFrage[] = [
  { nr: 1, kurz: 'Anwendung, Version, Hersteller', frage: 'Application name, version, and vendor (for all applications)' },
  { nr: 2, kurz: 'Verantwortlich / Ansprechpartner', frage: 'Application owner / technical contact' },
  { nr: 3, kurz: 'Vom Hersteller unterstützt?', frage: 'Is the application/version officially supported on the currently installed Windows Server OS/version (Windows 2019) and HCI Cluster 23H2 version?' },
  { nr: 4, kurz: 'Besondere Anforderungen', frage: 'Does the application have specific OS version, patch level, .NET, Java, driver, firmware, CPU, memory, storage, or virtualization requirements?' },
  { nr: 5, kurz: 'Treiber / Filter / Sicherheitssoftware', frage: 'Does the application install or use kernel-mode drivers, filter drivers, storage/network drivers, antivirus/security components, or other low-level system components?' },
  { nr: 6, kurz: 'Direkter Zugriff auf Speicher, Netz, Cluster …', frage: 'Does the application interact directly with storage, network adapters, clustering, Hyper-V, hardware devices, or system services?' },
  // In der Vorlage steht vor „scripts“ ein geschütztes Leerzeichen (U+00A0) — hier genauso, damit der Text Zeichen für Zeichen gleich ist.
  { nr: 7, kurz: 'Kann einen Neustart auslösen?', frage: 'Can the application or any associated service/process, scheduled tasks, maintenance jobs,  scripts initiate an OS shutdown or restart under any circumstances?' },
  { nr: 8, kurz: 'Änderungen rund um den Problembeginn', frage: 'Have any application upgrades, configuration changes, patches, agents, or integrations been implemented around the time the reboot issue started?' },
  { nr: 9, kurz: 'Auffälligkeiten vor dem Ausfall', frage: 'Do the application logs show errors, crashes, resource exhaustion, watchdog activity, or abnormal events immediately before the unexpected reboot?' },
  { nr: 10, kurz: 'Hersteller kennt ähnliche Fälle?', frage: 'Have similar unexpected reboot issues been reported by the application vendor for the current application/OS combination?' },
  { nr: 11, kurz: 'Bekannte Unverträglichkeiten', frage: 'Are there any known compatibility issues with the current or planned Windows Server/cluster OS version?' },
  { nr: 12, kurz: 'Weitere Abhängigkeiten / Risiken', frage: 'Are there any other known application dependencies or risks that could potentially contribute to OS instability or unexpected reboots?' },
]

/** Kopfzeile der Vorlage */
export const HCI_KOPF = ['#', 'Question', 'Response'] as const
