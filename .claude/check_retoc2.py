import json, sys
d = json.load(sys.stdin)
items = d if isinstance(d, list) else d.get("data", [])
vs = [i for i in items if i.get("strategy") == "RETOC2"]
print("RETOC2字段:")
if vs:
    for k, v in vs[0].items():
        if v is not None:
            print(f"  {k}: {v}")
else:
    print("  无数据")
