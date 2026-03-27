#!/usr/bin/env python3
"""Expand guru_brain.json to 1000+ by converting KB category entries to brain entries."""
import json, sys, io, os, re, random
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

KB = "resources/knowledge_base"
BRAIN_PATH = os.path.join(KB, "guru_brain.json")
CAT_DIR = os.path.join(KB, "categories")

# Load current brain
with open(BRAIN_PATH, 'r', encoding='utf-8') as f:
    brain = json.load(f)
existing = {p['id']: p for p in brain['problems']}
print(f"Starting brain: {len(existing)} entries")

# Category slug -> brain prefix mapping
CAT_PREFIX = {
    "windows_allgemein": "WIN", "outlook": "OUT", "teams": "TEAMS",
    "office": "OFF", "onedrive_sharepoint": "OD", "drucker": "PRN",
    "netzwerk": "NET", "sap": "SAP", "zscaler": "ZSC", "enaio": "ENA",
    "passwort_sicherheit": "SEC", "hardware_geraetemanager": "HW",
    "software_updates": "SW", "festplatte_speicher": "DSK",
    "performance": "PERF", "intune_autopilot": "INT", "vpn_remote": "VPN",
    "systemeinstellungen": "SYS", "audio_display": "AUD",
    "datei_operationen": "FIL", "benutzer_profile": "USR",
    "email": "MAIL",
}

# Category slug -> brain category mapping
CAT_BRAIN = {
    "windows_allgemein": "windows", "outlook": "outlook", "teams": "teams",
    "office": "office", "onedrive_sharepoint": "onedrive", "drucker": "drucker",
    "netzwerk": "netzwerk", "sap": "sap", "zscaler": "zscaler", "enaio": "enaio",
    "passwort_sicherheit": "sicherheit", "hardware_geraetemanager": "hardware",
    "software_updates": "updates", "festplatte_speicher": "festplatte",
    "performance": "performance", "intune_autopilot": "intune", "vpn_remote": "netzwerk",
    "systemeinstellungen": "systemeinstellungen", "audio_display": "audio_display",
    "datei_operationen": "remote", "benutzer_profile": "sicherheit",
    "email": "email",
}

# Target minimums per brain category
MINIMUMS = {
    "windows": 80, "outlook": 60, "teams": 50, "office": 40,
    "drucker": 45, "netzwerk": 60, "performance": 35, "hardware": 40,
    "sicherheit": 40, "sap": 25, "zscaler": 20, "enaio": 15,
    "festplatte": 25, "onedrive": 20, "intune": 20, "browser": 20,
    "sprache": 15, "standard_apps": 15, "zertifikate": 15,
    "wiederherstellung": 15, "barrierefreiheit": 15, "personalisierung": 20,
    "privacy": 15, "remote": 15, "systemeinstellungen": 20,
    "audio_display": 15, "email": 15, "updates": 20, "dienste": 15,
}

def make_user_says(kb_entry):
    """Generate 12+ userSays from a KB problem entry."""
    says = []
    # From title
    title_lower = kb_entry['title'].lower()
    says.append(title_lower)
    # From keywords
    for kw in kb_entry.get('keywords', [])[:8]:
        says.append(kw.lower())
    # From extendedKeywords (the gold!)
    for ek in kb_entry.get('extendedKeywords', [])[:12]:
        says.append(ek.lower())
    # From symptoms
    for s in kb_entry.get('symptoms', [])[:5]:
        says.append(s.lower())
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for s in says:
        s = s.strip()
        if s and s not in seen and len(s) > 3:
            seen.add(s)
            unique.append(s)
    return unique[:20] if len(unique) >= 10 else unique + [f"{unique[0]} problem", f"hilfe {unique[0]}", f"{unique[0]} fehler", f"{unique[0]} hilfe", f"was tun bei {unique[0]}"][:20]

def make_skill_chain(kb_entry):
    """Generate skillChain from KB entry skillMapping."""
    chain = []
    mappings = kb_entry.get('skillMapping', [])
    if not mappings:
        # Fallback: generic chain
        return [
            {"step": 1, "skill": "rd_diag_diag-performance", "action": "System-Diagnose ausfuehren"},
            {"step": 2, "skill": "rd_repair_sfc", "action": "Systemdateien pruefen"},
            {"step": 3, "skill": "rd_repair_dism", "action": "Windows-Image reparieren"},
        ]
    # Sort by priority
    sorted_m = sorted(mappings, key=lambda x: x.get('priority', 99))
    for i, m in enumerate(sorted_m[:6]):
        chain.append({
            "step": i + 1,
            "skill": m['skillId'],
            "action": m['label']
        })
    return chain

def make_nachfragen(kb_entry):
    """Generate follow-up questions."""
    fqs = kb_entry.get('followUpQuestions', [])
    if fqs:
        return [fq['question'] for fq in fqs[:3]]
    return [
        "Seit wann besteht das Problem?",
        "Wurde kuerzlich etwas geaendert?",
        "Betrifft es nur diesen PC?"
    ]

def make_tags(kb_entry):
    """Generate tags from keywords."""
    tags = []
    for kw in kb_entry.get('keywords', [])[:8]:
        for w in kw.lower().split():
            if len(w) > 2 and w not in tags:
                tags.append(w)
    return tags[:10]

# Process each KB category file
new_count = 0
for cat_file in sorted(os.listdir(CAT_DIR)):
    if not cat_file.endswith('.json'):
        continue
    cat_slug = cat_file.replace('.json', '')
    brain_cat = CAT_BRAIN.get(cat_slug, cat_slug)
    prefix = CAT_PREFIX.get(cat_slug, cat_slug.upper()[:4])

    # Count existing in this brain category
    current_count = len([p for p in existing.values() if p['category'] == brain_cat])

    with open(os.path.join(CAT_DIR, cat_file), 'r', encoding='utf-8') as f:
        kb_problems = json.load(f)

    # Find max ID number for this prefix
    max_num = 0
    for pid in existing:
        if pid.startswith(prefix + '-'):
            try:
                num = int(pid.split('-')[-1])
                max_num = max(max_num, num)
            except: pass

    for kb_p in kb_problems:
        # Skip if we already have enough for this category
        current_count_now = len([p for p in existing.values() if p['category'] == brain_cat])
        target = MINIMUMS.get(brain_cat, 15)
        if current_count_now >= target:
            break

        # Generate brain entry from KB entry
        max_num += 1
        new_id = f"{prefix}-{max_num:03d}"
        while new_id in existing:
            max_num += 1
            new_id = f"{prefix}-{max_num:03d}"

        user_says = make_user_says(kb_p)
        skill_chain = make_skill_chain(kb_p)
        diagnose = [sc['skill'] for sc in skill_chain if 'diag' in sc['skill'] or sc['step'] <= 2][:3]

        entry = {
            "id": new_id,
            "category": brain_cat,
            "title": kb_p['title'],
            "userSays": user_says,
            "diagnose": diagnose if diagnose else [skill_chain[0]['skill']],
            "skillChain": skill_chain,
            "erklaerung": '. '.join(kb_p.get('solutions', ['Siehe Skill-Chain fuer Loesungsschritte.'])[:2]),
            "tags": make_tags(kb_p),
            "nachfragen": make_nachfragen(kb_p),
            "hinweis": kb_p.get('quickCheck', '')
        }

        existing[new_id] = entry
        new_count += 1

print(f"Added {new_count} entries from KB categories")
print(f"Total: {len(existing)} entries")

# Final category counts
print("\nCategory summary:")
total_by_cat = {}
for p in existing.values():
    cat = p['category']
    total_by_cat[cat] = total_by_cat.get(cat, 0) + 1

for cat in sorted(total_by_cat.keys()):
    count = total_by_cat[cat]
    target = MINIMUMS.get(cat, 10)
    status = "OK" if count >= target else f"UNDER ({target - count} short)"
    print(f"  {cat}: {count}/{target} {status}")

total = len(existing)
print(f"\nGRAND TOTAL: {total} entries")

# Write final brain
result = {"problems": list(existing.values())}
with open(BRAIN_PATH, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

sz = os.path.getsize(BRAIN_PATH)
print(f"Written: {BRAIN_PATH} ({sz // 1024} KB)")

# Validation
errors = 0
short_usersays = 0
for p in existing.values():
    if not p.get('skillChain') or len(p['skillChain']) == 0:
        errors += 1
    us = p.get('userSays', [])
    if len(us) < 10:
        short_usersays += 1

print(f"Validation: {errors} errors, {short_usersays} entries with <10 userSays")

# Cleanup temp files
for f in ['brain_part1.json','brain_part2.json','brain_part3.json','brain_part4.json']:
    p = os.path.join(KB, f)
    if os.path.exists(p):
        os.remove(p)
        print(f"Cleaned up: {f}")
