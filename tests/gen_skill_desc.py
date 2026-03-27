#!/usr/bin/env python3
"""Generate skill_descriptions.json from remoteCommands.ts + remoteCommandsExtra.ts"""
import re, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

skills = []

for fname in ['src/utils/remoteCommands.ts', 'src/utils/remoteCommandsExtra.ts']:
    with open(fname, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    current_cat_id = None
    current_cat_label = None

    for line in lines:
        # Detect category: id: 'xxx', label: 'yyy',
        m = re.search(r"id:\s*'([^']+)',\s*label:\s*'([^']+)'", line)
        if m and 'commands' not in line.split(m.group(0))[0]:
            cid, clabel = m.group(1), m.group(2)
            # Only treat as category if label looks like a category name (has space or &)
            if len(clabel) > 5:
                current_cat_id = cid
                current_cat_label = clabel
                continue

        # Detect command: { id: 'xxx', func: 'yyy', when: 'zzz',
        m = re.search(r"\{\s*id:\s*'([^']+)',\s*func:\s*'([^']+)',\s*when:\s*'([^']+)'", line)
        if m and current_cat_id:
            cmd_id = m.group(1)
            func = m.group(2)
            when = m.group(3)

            action = 'read'
            if "action: 'write'" in line: action = 'write'
            elif "action: 'critical'" in line: action = 'critical'

            long_running = 'longRunning: true' in line

            skills.append({
                'cat_id': current_cat_id,
                'cat_label': current_cat_label,
                'cmd_id': cmd_id,
                'func': func,
                'when': when,
                'action': action,
                'long_running': long_running,
            })

print(f'Found {len(skills)} skills')

# Generate descriptions
risk_map = {'read': 'niedrig', 'write': 'mittel', 'critical': 'hoch'}
duration_map = {
    'read': '2-5 Sekunden',
    'write': '5-15 Sekunden',
    'critical': '10-30 Sekunden',
}

# Category-specific knowledge for better descriptions
cat_context = {
    'net': {'domain': 'Netzwerk', 'restart': False},
    'gpo': {'domain': 'Gruppenrichtlinien', 'restart': False},
    'repair': {'domain': 'System-Reparatur', 'restart': False},
    'procs': {'domain': 'Prozesse', 'restart': False},
    'svc': {'domain': 'Dienste', 'restart': False},
    'sessions': {'domain': 'Benutzersitzungen', 'restart': False},
    'software': {'domain': 'Software', 'restart': False},
    'printer': {'domain': 'Drucker', 'restart': False},
    'disk': {'domain': 'Festplatte', 'restart': False},
    'reboot': {'domain': 'Neustart', 'restart': True},
    'security': {'domain': 'Sicherheit', 'restart': False},
    'hw': {'domain': 'Hardware', 'restart': False},
    'shares': {'domain': 'Netzlaufwerke', 'restart': False},
    'tasks': {'domain': 'Geplante Aufgaben', 'restart': False},
    'rdp': {'domain': 'Remote Desktop', 'restart': False},
    'certs': {'domain': 'Zertifikate', 'restart': False},
    'domain': {'domain': 'Domäne/AD', 'restart': False},
    'wlan': {'domain': 'WLAN', 'restart': False},
    'explorer': {'domain': 'Explorer/Shell', 'restart': False},
    'screenshot': {'domain': 'Screenshot', 'restart': False},
    'swinstall': {'domain': 'Software-Installation', 'restart': False},
    'filetransfer': {'domain': 'Dateiübertragung', 'restart': False},
    'drivemap': {'domain': 'Laufwerk-Mapping', 'restart': False},
    'drivers': {'domain': 'Treiber', 'restart': False},
    'power': {'domain': 'Energie/WOL', 'restart': False},
    'appcache': {'domain': 'App-Reparatur/Cache', 'restart': False},
    'zscaler': {'domain': 'Zscaler', 'restart': False},
    'enaio': {'domain': 'enaio/DMS', 'restart': False},
    'devmgr': {'domain': 'Gerätemanager', 'restart': False},
    'sysconfig': {'domain': 'Systemeinstellungen', 'restart': False},
    'audio': {'domain': 'Audio/Display', 'restart': False},
    'fileops': {'domain': 'Datei-Operationen', 'restart': False},
    'userprofiles': {'domain': 'Benutzer/Profile', 'restart': False},
    'diskmgmt': {'domain': 'Datenträger', 'restart': False},
    'remotetasks': {'domain': 'Geplante Aufgaben (Ziel-PC)', 'restart': False},
    'diag': {'domain': 'Diagnose', 'restart': False},
}

# Build detailed descriptions based on func and when
def gen_kurz(s):
    """Generate 1-sentence description from func and when."""
    func = s['func']
    when = s['when']
    action = s['action']

    if action == 'read':
        return f"{func} — {when}."
    elif action == 'write':
        return f"{func} auf dem Ziel-PC. Anwendung: {when}."
    else:  # critical
        return f"{func} auf dem Ziel-PC (kritische Aktion). {when}."

def gen_info(s):
    """Generate detailed info object."""
    func = s['func']
    when = s['when']
    action = s['action']
    cat_id = s['cat_id']
    cat_label = s['cat_label']
    ctx = cat_context.get(cat_id, {'domain': cat_label, 'restart': False})

    # wasPassiert
    if action == 'read':
        was = f"Führt '{func}' auf dem Ziel-PC aus und gibt das Ergebnis als strukturierte Daten zurück."
    elif action == 'write':
        was = f"Führt '{func}' auf dem Ziel-PC aus. Dies ändert Einstellungen oder Konfigurationen im Bereich {ctx['domain']}."
    else:
        was = f"Führt '{func}' auf dem Ziel-PC aus. ACHTUNG: Dies ist eine kritische Aktion im Bereich {ctx['domain']} die nicht einfach rückgängig gemacht werden kann."

    # wannBenutzen
    wann = [when]
    if 'prüfen' in func.lower() or 'anzeigen' in func.lower() or 'status' in func.lower():
        wann.append(f"Schneller Überblick über {ctx['domain']}-Status")
    if 'reparieren' in func.lower() or 'fix' in func.lower() or 'reset' in func.lower():
        wann.append(f"Wenn {ctx['domain']}-Probleme auftreten")
        wann.append("Nach anderen Diagnose-Schritten als Reparatur")
    if 'löschen' in func.lower() or 'leeren' in func.lower() or 'bereinigen' in func.lower():
        wann.append("Bei Cache- oder Speicher-Problemen")
    if 'neustarten' in func.lower() or 'restart' in func.lower():
        wann.append(f"Wenn der {ctx['domain']}-Dienst nicht reagiert")

    # zuBeachten
    beachten = []
    if action == 'read':
        beachten.append("Nur Lese-Befehl, ändert nichts am System")
    elif action == 'write':
        beachten.append("Ändert Einstellungen auf dem Ziel-PC")
        if 'cache' in func.lower() or 'löschen' in func.lower():
            beachten.append("Benutzer vorher benachrichtigen empfohlen")
    elif action == 'critical':
        beachten.append("KRITISCHE AKTION — nicht ohne Rücksprache ausführen")
        beachten.append("Vorher Wiederherstellungspunkt empfohlen")

    if s['long_running']:
        beachten.append("Kann mehrere Minuten dauern — Geduld haben")

    beachten.append("Erfordert WinRM-Zugriff auf den Ziel-PC")

    # kombiniertMit — suggest related skills in same category
    kombi = []
    same_cat = [sk for sk in skills if sk['cat_id'] == cat_id and sk['cmd_id'] != s['cmd_id']]
    if same_cat:
        # Pick up to 3 related skills
        for related in same_cat[:3]:
            kombi.append(f"rd_{cat_id}_{related['cmd_id']}")

    # risikoLevel
    risk = risk_map.get(action, 'niedrig')
    if s['long_running'] and action == 'write':
        risk = 'mittel'
    if 'profil löschen' in func.lower() or 'partition' in func.lower() or 'formatier' in func.lower():
        risk = 'hoch'

    # geschaetzteDauer
    dauer = duration_map.get(action, '5 Sekunden')
    if s['long_running']:
        dauer = '1-5 Minuten'

    return {
        'wasPassiert': was,
        'wannBenutzen': wann,
        'zuBeachten': beachten,
        'kombiniertMit': kombi,
        'neustartNoetig': ctx.get('restart', False),
        'risikoLevel': risk,
        'geschaetzteDauer': dauer,
    }

# Build the full descriptions object
descriptions = {}
for s in skills:
    key = f"rd_{s['cat_id']}_{s['cmd_id']}"
    descriptions[key] = {
        'kurz': gen_kurz(s),
        'info': gen_info(s),
    }

# Write output
with open('resources/knowledge_base/skill_descriptions.json', 'w', encoding='utf-8') as f:
    json.dump(descriptions, f, indent=2, ensure_ascii=False)

print(f'Generated skill_descriptions.json with {len(descriptions)} entries')
print(f'File size: {len(json.dumps(descriptions, ensure_ascii=False))//1024} KB')
