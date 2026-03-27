#!/usr/bin/env python3
"""Merge brain parts + starter into guru_brain.json, then validate."""
import json, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

KB = "resources/knowledge_base"
parts = ["brain_part1.json", "brain_part2.json", "brain_part3.json", "brain_part4.json"]
starter = "prompts/guru_brain_starter.json"
output = os.path.join(KB, "guru_brain.json")

all_problems = []
seen_ids = set()

# Load starter first
if os.path.exists(starter):
    with open(starter, 'r', encoding='utf-8') as f:
        data = json.load(f)
        for p in data.get("problems", []):
            if p["id"] not in seen_ids:
                all_problems.append(p)
                seen_ids.add(p["id"])
    print(f"Starter: {len(data['problems'])} entries")

# Load parts
for part in parts:
    path = os.path.join(KB, part)
    if not os.path.exists(path):
        print(f"MISSING: {part}")
        continue
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        problems = data.get("problems", [])
        added = 0
        for p in problems:
            if p["id"] not in seen_ids:
                all_problems.append(p)
                seen_ids.add(p["id"])
                added += 1
        print(f"{part}: {len(problems)} entries ({added} new)")
    except Exception as e:
        print(f"{part}: ERROR - {e}")

# Write merged
result = {"problems": all_problems}
with open(output, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)
print(f"\nMerged: {len(all_problems)} total entries")
print(f"File size: {os.path.getsize(output) // 1024} KB")

# Validate
errors = 0
warnings = 0
from collections import Counter
cats = Counter()

for p in all_problems:
    cats[p.get("category", "?")] += 1

    if not p.get("skillChain") or len(p["skillChain"]) == 0:
        print(f"ERROR: {p['id']} has no skillChain!")
        errors += 1
    else:
        for step in p["skillChain"]:
            if not step.get("skill") or not step.get("action") or "step" not in step:
                print(f"ERROR: {p['id']} Step {step.get('step','?')} missing skill/action")
                errors += 1

    us = p.get("userSays", [])
    if len(us) < 10:
        warnings += 1

print(f"\nCategories:")
for cat, count in sorted(cats.items(), key=lambda x: -x[1]):
    print(f"  {cat}: {count}")

print(f"\nValidation: {errors} errors, {warnings} warnings (userSays < 10)")
if errors == 0:
    print("VALID!")
else:
    print("HAS ERRORS!")

# Cleanup part files
for part in parts:
    path = os.path.join(KB, part)
    if os.path.exists(path):
        os.remove(path)
        print(f"Cleaned up: {part}")
