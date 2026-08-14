import json

with open("scratch/bom.json", "r", encoding="utf-8") as f:
    bom = json.load(f)

with open("scratch/otcheti.json", "r", encoding="utf-8") as f:
    otcheti = json.load(f)

otcheti_by_detail = {}
for r in otcheti:
    d = r.get("ID Детайл", "").strip().lower()
    otcheti_by_detail[d] = otcheti_by_detail.get(d, 0) + float(r.get("Количество") or 0)

parents = set()
queue = ["макара вар. 11"]
visited = set()

while queue:
    current = queue.pop(0)
    if current in visited:
        continue
    visited.add(current)
    
    current_parents = [b["ID Родител"].strip().lower() for b in bom if b["ID Компонент"].strip().lower() == current]
    for p in current_parents:
        if p not in visited:
            parents.add(p)
            queue.append(p)

print("Tracing parents of 'Макара вар. 11':")
found = False
for p in parents:
    if p in otcheti_by_detail:
        print(f"Parent '{p}' has {otcheti_by_detail[p]} pieces in otcheti!")
        found = True

if not found:
    print("No pieces found for any parent!")
