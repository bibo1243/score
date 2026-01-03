
import csv
from collections import defaultdict

input_file = '/Users/leegary/考核/score.csv'

# Store data: ratee -> list of scores
employee_scores = defaultdict(list)
employee_raters = defaultdict(list)

try:
    with open(input_file, mode='r', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        
        # Normalize field names (strip whitespace)
        reader.fieldnames = [name.strip() for name in reader.fieldnames]
        
        for row in reader:
            ratee = row.get('受評者', '').strip()
            total_score_str = row.get('總分', '').strip()
            rater = row.get('評分者', '').strip()
            
            # Extract sub-scores
            cat1 = row.get('第一大類（共40分）', '0').strip()
            cat2 = row.get('第二大類（共30分）', '0').strip()
            cat3 = row.get('第三大類（共30分）', '0').strip()
            
            if ratee and total_score_str:
                try:
                    score = float(total_score_str)
                    employee_scores[ratee].append(score)
                    
                    # Store detailed rater info
                    employee_raters[ratee].append({
                        "name": rater,
                        "total": score,
                        "cat1": float(cat1) if cat1 else 0,
                        "cat2": float(cat2) if cat2 else 0,
                        "cat3": float(cat3) if cat3 else 0
                    })
                except ValueError:
                    continue

    print(f"{'員工 (Employee)':<10} | {'平均分數 (Avg Score)':<15} | {'評分人數 (Count)':<15}")
    print("-" * 50)

    for employee, scores in sorted(employee_scores.items()):
        avg_score = sum(scores) / len(scores)
        count = len(scores)
        print(f"{employee:<10} | {avg_score:<15.2f} | {count:<15}")

    # Save to CSV
    output_file = '/Users/leegary/考核/employee_stats.csv'
    with open(output_file, mode='w', encoding='utf-8', newline='') as outfile:
        writer = csv.writer(outfile)
        writer.writerow(['員工', '平均分數', '評分人數'])
        for employee, scores in sorted(employee_scores.items()):
            avg_score = sum(scores) / len(scores)
            count = len(scores)
            writer.writerow([employee, f"{avg_score:.2f}", count])

    print(f"\nStats saved to {output_file}")

    import json
    # Save to JSON for Web App
    json_output_file = '/Users/leegary/考核/employee_data.json'
    # Also save as a JS file to avoid CORS issues when opening locally
    js_output_file = '/Users/leegary/考核/data.js'
    
    # Load Staff List for metadata
    staff_file = '/Users/leegary/考核/工作人員名冊.csv'
    staff_meta = {}
    
    SPECIAL_RATERS = {'廖慧雯', '廖振杉', '李冠葦', '陳淑錡'}
    
    def normalize_classification(name, raw_org, raw_unit, raw_section):
        """
        Apply rules to determine the correct Organization, Unit, and Section.
        """
        org = raw_org
        unit = raw_unit
        section = raw_section
        
        # Rule 0: Special Case for 熊小蓮
        if name == '熊小蓮':
            return '基金會', '行政組', section

        # Rule 1: Specific Employees -> 諮商所
        if name in ['陳柔安', '林彥秀']:
            return '諮商所', unit, section
            
        # Rule 2: Foundation Units
        foundation_units = ['行政組', '社資組', '人資公關組', '圖書組', '會計室']
        if unit in foundation_units:
            return '基金會', unit, section

        # Rule 3: Fix Data Contamination (Org/Unit Swaps or Mislabeling)
        # e.g., Row with Org='教保組', Unit='兒少之家' -> Org='兒少之家', Unit='教保組'
        if org == '教保組' and unit == '兒少之家':
            return '兒少之家', '教保組', section
            
        # If Unit is explicitly the Org Name (sometimes happens in messy data)
        if unit == '兒少之家':
            org = '兒少之家'  
        if unit == '少年家園':
            org = '少年家園'

        # Rule 4: Handle "教保組" -> must belong to 兒少之家 or 少年家園
        if unit == '教保組':
            if '兒少' in org:
                org = '兒少之家'
            elif '少年' in org:
                org = '少年家園'
            
        # Normalization of Org Names to standard 4
        if '基金會' in org: org = '基金會'
        elif '兒少' in org: org = '兒少之家'
        elif '少年' in org: org = '少年家園'
        elif '諮商' in org: org = '諮商所'
        
        return org, unit, section

    try:
        with open(staff_file, mode='r', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile)
            reader.fieldnames = [name.strip() for name in reader.fieldnames]
            for row in reader:
                name = row.get('員工姓名', '').strip()
                if name:
                    raw_org = row.get('所屬機構', '').strip()
                    raw_unit = row.get('所屬單位', '').strip()
                    raw_section = row.get('股別', '').strip()
                    
                    final_org, final_unit, final_section = normalize_classification(
                        name, raw_org, raw_unit, raw_section
                    )
                    
                    staff_meta[name] = {
                        "org": final_org,
                        "unit": final_unit,
                        "section": final_section
                    }
    except FileNotFoundError:
        print(f"Warning: Staff list file '{staff_file}' not found. Grouping will be unavailable.")

    output_data = []
    
    # Pre-calculate peers by (Org, Unit) for missing rater detection
    peers_map = defaultdict(list)
    for name, meta in staff_meta.items():
        key = (meta['org'], meta['unit'])
        peers_map[key].append(name)

    for employee, scores in sorted(employee_scores.items()):
        current_raters = employee_raters[employee] # List of dicts
        
        # 1. Sort raters by name
        current_raters.sort(key=lambda x: x['name'])
        
        meta = staff_meta.get(employee, {"org": "未分類", "unit": "", "section": ""})
        
        # 2. Identify missing raters (Same Org + Unit, excluding self and existing raters)
        missing_raters = []
        if meta['org'] != '未分類':
            peers = peers_map.get((meta['org'], meta['unit']), [])
            existing_rater_names = set(r['name'] for r in current_raters)
            
            for peer in peers:
                if peer != employee and peer not in existing_rater_names:
                    missing_raters.append(peer)
            
            missing_raters.sort()
        
        # ==============================================
        # NEW: Complex Scoring Rules from 評分配比.docx
        # ==============================================
        
        # Define rater groups for filtering
        # 主管級（不含督導）
        MANAGERS = {'廖振杉', '廖慧雯', '李冠葦', '陳淑錡', '楊顗帆', '高靜華', '陳宛妤', '鍾宜珮'}
        # 督導（股長級，屬於主管但不在MANAGERS內用於區分）
        SUPERVISORS = {'簡采琦', '林品亨'}  # 簡采琦管社工股, 林品亨管生輔股
        ALL_MANAGERS = MANAGERS | SUPERVISORS  # 合併用於部分規則
        
        # Helper: Get meta for a rater name
        def get_rater_meta(name):
            return staff_meta.get(name, {"org": "", "unit": "", "section": ""})
        
        # Helper: Get scores from a filtered subset of raters
        def avg_from_raters(raters, filter_fn):
            filtered = [r['total'] for r in raters if filter_fn(r['name'])]
            return sum(filtered) / len(filtered) if filtered else 0.0
        
        # Helper: Check if rater is in a specific section (股)
        def is_in_section(rater_name, target_section):
            m = get_rater_meta(rater_name)
            section = m.get('section', '')
            # Handle alias: 保育股 == 保育/生輔股
            if target_section in ['保育股', '保育/生輔股', '生輔股']:
                return section in ['保育股', '保育/生輔股', '生輔股']
            return section == target_section
        
        # Helper: Check if rater is in a specific unit (組)
        def is_in_unit(rater_name, target_unit):
            m = get_rater_meta(rater_name)
            return m.get('unit', '') == target_unit
        
        # Helper: Check if rater is in a specific org (機構)
        def is_in_org(rater_name, target_org):
            m = get_rater_meta(rater_name)
            return m.get('org', '') == target_org
        
        # Employee-specific rules (from document)
        # Format: Each rule is a list of (description, filter_fn, weight)
        #         where filter_fn takes (rater_name) -> bool
        
        # Default rule: 主管 50% + 其他 50%
        def default_rule():
            return [
                ("主管", lambda n: n in MANAGERS, 0.5),
                ("其他同仁", lambda n: n not in MANAGERS, 0.5)
            ]
        
        # Specific overrides
        EMPLOYEE_RULES = {
            # === 兒少之家 ===
            '廖振杉': [("教保組全員平均", lambda n: is_in_unit(n, '教保組'), 1.0)],
            '陳宛妤': [
                ("主管", lambda n: n in MANAGERS, 0.5),
                ("兒少之家教保組員", lambda n: is_in_org(n, '兒少之家') and is_in_unit(n, '教保組') and n not in ALL_MANAGERS, 0.5)
            ],
            '簡采琦': [
                ("主管", lambda n: n in MANAGERS, 0.5),
                ("兒少之家社工股", lambda n: is_in_org(n, '兒少之家') and is_in_section(n, '社工股'), 0.4),
                ("兒少之家教保組其他員工", lambda n: is_in_org(n, '兒少之家') and is_in_unit(n, '教保組') and not is_in_section(n, '社工股') and n not in ALL_MANAGERS, 0.1)
            ],
            '林東美': default_rule(),
            '賀郁茵': default_rule(),
            '廖玟慈': default_rule(),
            '張宜芳': default_rule(),
            '蕭婷予': default_rule(),
            '陳亮寧': default_rule(),
            '王卉蓁': default_rule(),
            '許芸嘉': default_rule(),
            '李炎輝': default_rule(),
            '曾婷婷': default_rule(),
            
            # === 少年家園 ===
            '廖慧雯': [("教保組全員平均", lambda n: is_in_unit(n, '教保組'), 1.0)],
            '鍾宜珮': [
                ("主管", lambda n: n in MANAGERS, 0.5),
                ("少年家園教保組員", lambda n: is_in_org(n, '少年家園') and is_in_unit(n, '教保組') and n not in ALL_MANAGERS, 0.5)
            ],
            '林品亨': [
                ("主管", lambda n: n in MANAGERS, 0.5),
                ("少年家園生輔股", lambda n: is_in_org(n, '少年家園') and is_in_section(n, '保育/生輔股'), 0.4),
                ("少年家園教保組其他員工", lambda n: is_in_org(n, '少年家園') and is_in_unit(n, '教保組') and not is_in_section(n, '保育/生輔股') and n not in ALL_MANAGERS, 0.1)
            ],
            '蘇盟惠': default_rule(),
            '劉宛宣': default_rule(),
            '郭楷欣': default_rule(),
            '吳秉熹': default_rule(),
            '胡少淇': default_rule(),
            '陳昱綸': default_rule(),
            '黃穎蓁': default_rule(),
            '蔣郡哲': default_rule(),
            '劉婷瑜': default_rule(),
            '吳思函': default_rule(),
            
            # === 諮商所 ===
            '楊顗帆': [("一般員工", lambda n: n not in MANAGERS, 1.0)],
            '陳柔安': default_rule(),
            '林彥秀': default_rule(),
            
            # === 行政組 ===
            '李冠葦': [("庶務股長+資深一般員工", lambda n: n not in {'李冠葦'}, 1.0)],
            '陳淑錡': default_rule(),
            '林紀騰': [
                ("主管", lambda n: n in MANAGERS, 0.5),
                ("庶務股股員", lambda n: is_in_section(n, '庶務股') and n != '林紀騰', 0.3),
                ("行政組其他組員", lambda n: is_in_unit(n, '行政組') and not is_in_section(n, '庶務股') and n not in MANAGERS, 0.2)
            ],
            '王芊蓉': default_rule(),
            '李鳳翎': default_rule(),
            '王元鼎': default_rule(),
            '林港博': default_rule(),
            '謝秀桃': default_rule(),
            '羅如光': default_rule(),
            '陸廷瑋': default_rule(),
            '林麗娟': default_rule(),
            '徐銘澤': default_rule(),
            '劉春燕': default_rule(),
            '熊小蓮': default_rule(),
            
            # === 社資組 ===
            '王姿斐': [
                ("主管（總幹事、社資組長）", lambda n: n in {'李冠葦', '陳淑錡'}, 0.5),  # Assuming 總幹事 is 李冠葦
                ("行政組（不含廚師）", lambda n: is_in_unit(n, '行政組') and n not in {'劉春燕', '熊小蓮'}, 0.5)
            ],
            
            # === 圖書教育組 ===
            '高靜華': [("總幹事、兩家園主任", lambda n: n in {'李冠葦', '廖振杉', '廖慧雯'}, 1.0)],
        }
        
        # Apply rules
        rules = EMPLOYEE_RULES.get(employee, default_rule())
        
        breakdown = []
        total_weighted_score = 0.0
        total_weight_used = 0.0
        
        for desc, filter_fn, weight in rules:
            avg = avg_from_raters(current_raters, filter_fn)
            # Get filtered raters for this rule
            filtered_raters = [r for r in current_raters if filter_fn(r['name'])]
            filtered_count = len(filtered_raters)
            filtered_names = [r['name'] for r in filtered_raters]
            
            if filtered_count > 0:
                total_weighted_score += avg * weight
                total_weight_used += weight
                breakdown.append({
                    "desc": desc,
                    "weight": int(weight * 100),
                    "avg": float(f"{avg:.2f}"),
                    "count": filtered_count,
                    "raters": filtered_names
                })
        
        # Normalize if total weight used is less than 1 (some groups missing)
        if total_weight_used > 0 and total_weight_used < 1.0:
            final_score = total_weighted_score / total_weight_used
        elif total_weight_used > 0:
            final_score = total_weighted_score
        else:
            final_score = sum(scores) / len(scores) if scores else 0  # Fallback
        
        is_weighted = len(breakdown) > 1 or (len(breakdown) == 1 and breakdown[0]['weight'] < 100)

        # Mark raters for UI
        processed_raters = []
        for r in current_raters:
            r_copy = r.copy()
            r_copy['is_special'] = (r['name'] in MANAGERS)
            processed_raters.append(r_copy)

        output_data.append({
            "name": employee,
            "org": meta['org'],
            "unit": meta['unit'],
            "section": meta['section'],
            "average_score": float(f"{final_score:.2f}"),
            "rater_count": len(scores),
            "raters": processed_raters,
            "missing_raters": missing_raters,
            "is_weighted": is_weighted,
            "breakdown": breakdown
        })

    # Save JSON
    with open(json_output_file, mode='w', encoding='utf-8') as jsonfile:
        json.dump(output_data, jsonfile, ensure_ascii=False, indent=4)

    # Save JS
    with open(js_output_file, mode='w', encoding='utf-8') as jsfile:
        json_str = json.dumps(output_data, ensure_ascii=False, indent=4)
        jsfile.write(f"const EMPLOYEE_DATA = {json_str};")

    print(f"Web data saved to {json_output_file} and {js_output_file}")

except FileNotFoundError:
    print(f"Error: File '{input_file}' not found.")
except Exception as e:
    print(f"An error occurred: {e}")
