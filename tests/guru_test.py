#!/usr/bin/env python3
"""IT Guru - 30 Tests"""
import json, os, sys, io, time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

KB = "resources/knowledge_base"
CAT = os.path.join(KB, "categories")

# Load data
problems = []
for f in sorted(os.listdir(CAT)):
    if f.endswith(".json"):
        with open(os.path.join(CAT, f), "r", encoding="utf-8") as fh:
            problems.extend(json.load(fh))

def load(name):
    with open(os.path.join(KB, name), "r", encoding="utf-8") as f:
        return json.load(f)

synonyms = load("synonyms.json")
typo_map = load("typo_map.json")
colloquial_map = load("colloquial_map.json")
correlations = load("correlations.json")
chains = load("diagnostic_chains.json")
playbooks = load("playbooks.json")
skill_map = load("skill_problem_map.json")
templates = load("answer_templates.json")

# Build index
idx = {}
for p in problems:
    for kw in p.get("keywords", []):
        for w in kw.lower().split():
            if len(w) >= 2:
                idx.setdefault(w, set()).add(p["id"])
    for ek in p.get("extendedKeywords", []):
        for w in ek.lower().split():
            if len(w) >= 2:
                idx.setdefault(w, set()).add(p["id"])

pmap = {p["id"]: p for p in problems}

def search(query):
    words = query.lower().split()
    fixed = [typo_map.get(w, w) for w in words]
    expanded = set(fixed)
    for w in fixed:
        for canon, syns in synonyms.items():
            if w == canon or w in syns:
                expanded.add(canon)
                expanded.update(syns)
    cands = set()
    for w in expanded:
        if w in idx:
            cands.update(idx[w])
    results = []
    for pid in cands:
        p = pmap[pid]
        score = 0
        for w in fixed:
            if any(w in kw.lower() for kw in p.get("keywords", [])):
                score += 10
            elif any(w in ek.lower() for ek in p.get("extendedKeywords", [])):
                score += 8
        if score > 0:
            results.append((score, pid, p["title"]))
    results.sort(reverse=True)
    return results[:5]

def find_chain(query):
    words = query.lower().split()
    for c in chains:
        if sum(1 for t in c["trigger"] if any(t in w or w in t for w in words)) >= 1:
            return c
    return None

def apply_colloquial(text):
    for k, v in sorted(colloquial_map.items(), key=lambda x: -len(x[0])):
        if k in text:
            text = text.replace(k, v)
    return text

passed = failed = 0

def test(n, desc, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  [{n:02d}] PASS: {desc}")
    else:
        failed += 1
        print(f"  [{n:02d}] FAIL: {desc} -- {detail}")

print("=" * 60)
print("IT GURU - 30 TESTS")
print("=" * 60)

# 1-2: Data volume
test(1, f"DB 700+ Eintraege ({len(problems)})", len(problems) >= 700)
cat_files = [f for f in os.listdir(CAT) if f.endswith(".json")]
test(2, f"22 Kategorien ({len(cat_files)})", len(cat_files) >= 22)

# 3: Search speed
t0 = time.time()
for _ in range(100):
    search("drucker offline")
ms = (time.time() - t0) / 100 * 1000
test(3, f"Suche <100ms ({ms:.1f}ms)", ms < 100)

# 4-8: Typos
r = search("druker")
test(4, "Typo druker", len(r) > 0)
r = search("outlock startet nicht")
test(5, "Typo outlock", len(r) > 0)
r = search("tems kamera")
test(6, "Typo tems", len(r) > 0)
r = search("zsclaer blockiert")
test(7, "Typo zsclaer", len(r) > 0)
r = search("enaoi geht nicht")
test(8, "Typo enaoi", len(r) > 0)

# 9-11: Colloquial
test(9, "Umgangssprache: macht nichts", "reagiert" in apply_colloquial("der macht nichts mehr"))
test(10, "Umgangssprache: nix geht", "nichts" in apply_colloquial("nix geht mehr"))
test(11, "Umgangssprache: rausgeflogen", "abgemeldet" in apply_colloquial("bin rausgeflogen"))

# 12-14: Diagnosis chains
c = find_chain("pc langsam performance")
test(12, "Kette: pc langsam", c is not None, str(c["id"]) if c else "None")
c = find_chain("uhrzeit falsch zeit stimmt nicht")
test(13, "Kette: zeit/uhrzeit", c is not None, str(c["id"]) if c else "None")
c = find_chain("outlook haengt langsam")
test(14, "Kette: outlook haengt", c is not None, str(c["id"]) if c else "None")

# 15-16: Correlations
def find_corr(words):
    for corr in correlations:
        m = [s for s in corr["symptoms"] if any(s in w or w in s for w in words)]
        if len(m) >= corr["min"]:
            return corr
    return None

cr = find_corr(["anmeldung", "uhrzeit"])
test(15, "Korrelation Anmeldung+Uhrzeit", cr is not None and "kerberos" in cr.get("cause", "").lower())
cr2 = find_corr(["outlook", "teams"])
test(16, "Korrelation Outlook+Teams", cr2 is not None)

# 17-18: Volume
test(17, f"200+ Ketten ({len(chains)})", len(chains) >= 200)
test(18, f"70+ Playbooks ({len(playbooks)})", len(playbooks) >= 70)

# 19: Playbook structure
pb = next((p for p in playbooks if "WIN" in p["id"]), None)
if pb:
    types = [s["type"] for s in pb["steps"]]
    test(19, "Playbook hat steps", len(types) >= 2, str(types))
else:
    test(19, "Playbook existiert", False)

# 20: Templates
total_t = sum(len(v) for v in templates.values())
test(20, f"50+ Antwort-Templates ({total_t})", total_t >= 50)

# 21-24: Search finds specific topics
test(21, "Suche: drucker druckt nicht", len(search("drucker druckt nicht")) > 0)
test(22, "Suche: vpn verbindet nicht", len(search("vpn verbindet nicht")) > 0)
test(23, "Suche: bluescreen absturz", len(search("bluescreen absturz")) > 0)
test(24, "Suche: sap startet nicht", len(search("sap startet nicht")) > 0)

# 25-29: Data completeness
test(25, f"Skill-Map 100+ ({len(skill_map)})", len(skill_map) >= 100)
test(26, f"20+ Korrelationen ({len(correlations)})", len(correlations) >= 20)
test(27, f"80+ Synonymgruppen ({len(synonyms)})", len(synonyms) >= 80)
test(28, f"200+ Tippfehler ({len(typo_map)})", len(typo_map) >= 200)
test(29, f"150+ Umgangssprache ({len(colloquial_map)})", len(colloquial_map) >= 150)

# 30: All files valid
ok = all(
    isinstance(json.load(open(os.path.join(CAT, f), encoding="utf-8")), list)
    for f in cat_files
)
test(30, f"Alle {len(cat_files)} Dateien valide", ok)

print("=" * 60)
print(f"ERGEBNIS: {passed}/30 Tests bestanden")
if failed:
    print(f"{failed} Tests fehlgeschlagen")
else:
    print("ALLE TESTS BESTANDEN!")
print("=" * 60)
