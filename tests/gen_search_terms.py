#!/usr/bin/env python3
"""Add searchTerms to every skill in skill_descriptions.json"""
import json, sys, io, os, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PATH = 'resources/knowledge_base/skill_descriptions.json'
with open(PATH, 'r', encoding='utf-8') as f:
    descs = json.load(f)

# Parse skill IDs to extract category and command info
# Format: rd_{catId}_{cmdId}

# Also read remoteCommands.ts to get func/when
skills_meta = {}
for fname in ['src/utils/remoteCommands.ts', 'src/utils/remoteCommandsExtra.ts']:
    with open(fname, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    current_cat = None
    for line in lines:
        m = re.search(r"id:\s*'([^']+)',\s*label:\s*'([^']+)'", line)
        if m and len(m.group(2)) > 5:
            current_cat = (m.group(1), m.group(2))
        m = re.search(r"\{\s*id:\s*'([^']+)',\s*func:\s*'([^']+)',\s*when:\s*'([^']+)'", line)
        if m and current_cat:
            key = f"rd_{current_cat[0]}_{m.group(1)}"
            skills_meta[key] = {
                'cat_id': current_cat[0],
                'cat_label': current_cat[1],
                'cmd_id': m.group(1),
                'func': m.group(2),
                'when': m.group(3),
            }

# Common typo patterns for German IT terms
TYPO_PATTERNS = {
    'drucker': ['druker','drukcer','drucekr','drcker'],
    'netzwerk': ['netzwrek','netwerk','ntzwerk','netwekr'],
    'passwort': ['paswort','passowrt','pasword','passwotr'],
    'bluetooth': ['bluethooth','blutooth','bluetoth'],
    'bildschirm': ['bildchirm','bilschirm','bildschrim'],
    'festplatte': ['festpaltte','fetsplatte','festpltte'],
    'speicher': ['speichre','spiecher','sepeicher'],
    'laufwerk': ['laufwrek','luafwerk','lauwferk'],
    'prozess': ['prozses','porzess','prozes'],
    'service': ['serviec','servce','serivce'],
    'update': ['updtae','udpate','upadte','upate'],
    'installieren': ['instalieren','insatllieren','installiren'],
    'konfiguration': ['konifguration','konfiguraiton'],
    'verbindung': ['vebindung','verbindugn','vrbindung'],
    'zertifikat': ['zertifkat','zerfitikat','zetifikat'],
    'deaktivieren': ['deaktiveiren','deaktiviern'],
    'aktivieren': ['aktiverein','aktvieren'],
    'loeschen': ['loeshen','loeshcen','loechen'],
    'anzeigen': ['anzegen','anziegen','azeigen'],
    'pruefen': ['preufen','preuefen','prufen'],
    'starten': ['straten','statren','sartten'],
    'stoppen': ['stopen','stoppen','stoppne'],
    'neustarten': ['neustaten','neustraten','neusatrten'],
    'cache': ['cashe','cahce','cahe','chache'],
    'spooler': ['spooelr','spoler','spoller'],
    'outlook': ['outlock','outlok','outllook'],
    'teams': ['tems','teems','tams','taems'],
    'zscaler': ['zsclaer','zsacler','zcaler'],
    'enaio': ['enaoi','eniao','enio'],
    'defender': ['defendr','defneder','deffender'],
    'firewall': ['firewal','fierwall','firwall'],
    'registry': ['registy','regsitry','registriy'],
    'partition': ['partitoin','partiton','parition'],
    'diagnose': ['diagnoe','diagnoes','dianose'],
    'treiber': ['trieber','triber','trieber'],
    'adapter': ['adpater','adatper','adaptr'],
    'monitor': ['monitro','mointor','montor'],
    'mikrofon': ['mikorfon','mikofon','mirko'],
    'lautsprecher': ['lautsprcher','luatsprecher'],
    'kopfhoerer': ['kopfhöre','kopfhöhre'],
    'tastatur': ['tasttur','tatsatur','tasattur'],
    'profil': ['profli','porlfil','pofil'],
    'benutzer': ['benutzr','bnutzer','benuzer'],
    'berechtigung': ['berechigtung','berechtiung'],
}

# Colloquial patterns
COLLOQUIAL = {
    'loeschen': ['platt machen','weg machen','wegmachen','aufraemen'],
    'neustarten': ['durchstarten','ankicken','neu machen'],
    'pruefen': ['checken','nachschauen','nachgucken','kontrollieren'],
    'anzeigen': ['zeigen','nachschauen','gucken','schauen'],
    'reparieren': ['fixen','heilen','wieder hinbekommen','in ordnung bringen'],
    'installieren': ['drauf machen','aufspielen','einrichten'],
    'deaktivieren': ['ausschalten','abschalten','aus machen'],
    'aktivieren': ['einschalten','anschalten','an machen'],
    'verbinden': ['anschliessen','koppeln','verbinden'],
    'konfigurieren': ['einstellen','einrichten','setzen'],
}

def normalize(s):
    return s.lower().replace('ä','ae').replace('ö','oe').replace('ü','ue').replace('ß','ss')

def gen_terms(key, meta, desc):
    """Generate searchTerms for a skill."""
    func = meta.get('func', key.split('_')[-1])
    when = meta.get('when', '')
    cat_label = meta.get('cat_label', '')
    kurz = desc.get('kurz', '')

    func_lower = func.lower()
    when_lower = when.lower()
    cat_lower = cat_label.lower()
    kurz_lower = kurz.lower()

    # Primary: exact action descriptions
    primary = [func_lower]
    if when_lower and when_lower != func_lower:
        primary.append(when_lower)
    # Add "skill-verb + object" variants
    words = func_lower.split()
    if len(words) >= 2:
        primary.append(f"{words[-1]} {words[0]}")

    # Secondary: related problems/symptoms from kurz and wannBenutzen
    secondary = []
    wann = desc.get('info', {}).get('wannBenutzen', [])
    for w in wann[:4]:
        secondary.append(w.lower())
    if not secondary:
        secondary.append(f"problem mit {func_lower}")

    # Keywords: individual important words
    all_words = set()
    for text in [func_lower, when_lower, cat_lower, kurz_lower]:
        for w in text.split():
            w = w.strip('.,;:!?()[]')
            if len(w) >= 3 and w not in {'und','oder','der','die','das','ein','eine','fuer','mit','auf','von','bei','nach','vor','zum','zur','den','dem','des','ist','wird','kann','sind','alle','nur','auch'}:
                all_words.add(w)
    keywords = sorted(all_words)[:15]

    # Typos: find matching typo patterns
    typos = []
    for kw in keywords[:8]:
        kw_norm = normalize(kw)
        if kw_norm in TYPO_PATTERNS:
            typos.extend(TYPO_PATTERNS[kw_norm][:3])
        # Also add swapped chars
        if len(kw_norm) >= 4:
            typos.append(kw_norm[0] + kw_norm[2] + kw_norm[1] + kw_norm[3:])
    typos = list(set(typos))[:8]

    # Umgangssprache
    umgangssprache = []
    for kw in keywords[:5]:
        kw_norm = normalize(kw)
        if kw_norm in COLLOQUIAL:
            for col in COLLOQUIAL[kw_norm][:2]:
                umgangssprache.append(f"{col} {func_lower.split()[0] if func_lower.split() else ''}")
    if not umgangssprache:
        umgangssprache = [f"ich brauche {func_lower}", f"bitte {func_lower}"]
    umgangssprache = umgangssprache[:5]

    return {
        'primary': primary[:4],
        'secondary': secondary[:6],
        'keywords': keywords,
        'typos': typos,
        'umgangssprache': umgangssprache,
    }

# Process all skills
added = 0
for key, desc in descs.items():
    meta = skills_meta.get(key, {
        'func': key.split('_')[-1],
        'when': '',
        'cat_label': key.split('_')[1] if len(key.split('_')) > 1 else '',
    })
    desc['searchTerms'] = gen_terms(key, meta, desc)
    added += 1

with open(PATH, 'w', encoding='utf-8') as f:
    json.dump(descs, f, indent=2, ensure_ascii=False)

print(f'Added searchTerms to {added} skills')
print(f'File: {os.path.getsize(PATH)//1024} KB')

# Verify
with open(PATH, 'r', encoding='utf-8') as f:
    d = json.load(f)
with_terms = sum(1 for v in d.values() if 'searchTerms' in v)
print(f'Verification: {with_terms}/{len(d)} skills have searchTerms')
