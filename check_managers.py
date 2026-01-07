#!/usr/bin/env python3
import json
import urllib.request

# Fetch data from API
url = "http://localhost:8080/api/data"
with urllib.request.urlopen(url) as response:
    data = json.loads(response.read().decode('utf-8'))

# Managers to check
managers = ['鍾宜珮', '林品亨', '廖慧雯', '廖振杉', '陳宛妤', '簡采琦', '林紀騰', '陳淑錡', '高靜華', '楊顗帆', '李冠葦']

for p in data:
    if p['name'] in managers:
        print(f"\n{'='*50}")
        print(f"【{p['name']}】({p.get('org','')}) - 總分: {p['average_score']}")
        print(f"各類取整: {p['cat1_rounded']} + {p['cat2_rounded']} + {p['cat3_rounded']} = {p['cat1_rounded']+p['cat2_rounded']+p['cat3_rounded']}")
        print(f"各類平均: {p['cat1_avg']:.2f} + {p['cat2_avg']:.2f} + {p['cat3_avg']:.2f}")
        print(f"評分人數: {p['rater_count']}")
        
        if p.get('breakdown'):
            print(f"計分權重: {p['breakdown']}")
        
        print(f"評分者名單:")
        mgr_raters = []
        other_raters = []
        for r in p.get('raters', []):
            label = "[主管]" if r.get('is_special') else ""
            info = f"  - {r['name']}{label}: {r['cat1']}+{r['cat2']}+{r['cat3']}={r['total']}"
            if r.get('is_special'):
                mgr_raters.append(info)
            else:
                other_raters.append(info)
        
        if mgr_raters:
            print("  【主管評分】")
            for m in mgr_raters:
                print(m)
        if other_raters:
            print("  【同仁評分】")
            for o in other_raters:
                print(o)
        
        if not p.get('raters'):
            print("  (尚無評分)")
