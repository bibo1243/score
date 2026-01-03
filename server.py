#!/usr/bin/env python3
"""
Real-time Score Analysis Server
Reads score.csv on each request and serves updated data.
"""

import csv
import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
from collections import defaultdict

PORT = 8080
BASE_DIR = '/Users/leegary/考核'

class ScoreHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)
    
    def do_GET(self):
        parsed_path = urlparse(self.path)
        
        # API endpoint for real-time data
        if parsed_path.path == '/api/data':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            
            data = self.process_scores()
            self.wfile.write(json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8'))
            return
        
        # API endpoint for rater statistics
        if parsed_path.path == '/api/rater-stats':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            
            data = self.get_rater_stats()
            self.wfile.write(json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8'))
            return
        
        # API endpoint for rating relationships
        if parsed_path.path == '/api/relationships':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            
            data = self.get_relationships()
            self.wfile.write(json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8'))
            return
        
        # Serve static files normally
        return super().do_GET()
    
    def process_scores(self):
        """Process score.csv and return structured data."""
        input_file = os.path.join(BASE_DIR, 'score.csv')
        staff_file = os.path.join(BASE_DIR, '工作人員名冊.csv')
        
        employee_scores = defaultdict(list)
        employee_raters = defaultdict(list)
        rater_given_scores = defaultdict(list)  # Track scores GIVEN BY each rater
        
        # Read scores
        try:
            with open(input_file, mode='r', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)
                reader.fieldnames = [name.strip() for name in reader.fieldnames]
                
                for row in reader:
                    ratee = row.get('受評者', '').strip()
                    total_score_str = row.get('總分', '').strip()
                    rater = row.get('評分者', '').strip()
                    
                    cat1 = row.get('第一大類（共40分）', '0').strip()
                    cat2 = row.get('第二大類（共30分）', '0').strip()
                    cat3 = row.get('第三大類（共30分）', '0').strip()
                    
                    if ratee and total_score_str:
                        try:
                            score = float(total_score_str)
                            employee_scores[ratee].append(score)
                            employee_raters[ratee].append({
                                "name": rater,
                                "total": score,
                                "cat1": float(cat1) if cat1 else 0,
                                "cat2": float(cat2) if cat2 else 0,
                                "cat3": float(cat3) if cat3 else 0
                            })
                            # Also track scores given BY this rater
                            if rater:
                                rater_given_scores[rater].append({
                                    "ratee": ratee,
                                    "total": score,
                                    "cat1": float(cat1) if cat1 else 0,
                                    "cat2": float(cat2) if cat2 else 0,
                                    "cat3": float(cat3) if cat3 else 0
                                })
                        except ValueError:
                            continue
        except FileNotFoundError:
            return {"error": "score.csv not found"}
        
        # Load staff metadata
        staff_meta = {}
        MANAGERS = {'廖振杉', '廖慧雯', '李冠葦', '陳淑錡', '楊顗帆', '高靜華', '陳宛妤', '鍾宜珮'}
        SUPERVISORS = {'簡采琦', '林品亨', '林紀騰'}  # 股長/督導級
        ALL_MANAGERS = MANAGERS | SUPERVISORS
        
        # Define which section each supervisor manages
        SUPERVISOR_SECTIONS = {
            '簡采琦': '社工股',      # 簡采琦 只管 社工股
            '林品亨': '生輔股',      # 林品亨 只管 生輔股
            '林紀騰': '庶務股'       # 林紀騰 只管 庶務股
        }
        
        def normalize_classification(name, raw_org, raw_unit, raw_section):
            org, unit, section = raw_org, raw_unit, raw_section
            if name == '熊小蓮': return '基金會', '行政組', section
            if name in ['陳柔安', '林彥秀']: return '諮商所', unit, section
            if unit in ['行政組', '社資組', '人資公關組', '圖書組', '會計室']: return '基金會', unit, section
            if org == '教保組' and unit == '兒少之家': return '兒少之家', '教保組', section
            if unit == '兒少之家': org = '兒少之家'
            if unit == '少年家園': org = '少年家園'
            if unit == '教保組':
                if '兒少' in org: org = '兒少之家'
                elif '少年' in org: org = '少年家園'
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
                        final_org, final_unit, final_section = normalize_classification(name, raw_org, raw_unit, raw_section)
                        staff_meta[name] = {"org": final_org, "unit": final_unit, "section": final_section}
        except FileNotFoundError:
            pass
        
        # Helper functions
        def get_rater_meta(name):
            return staff_meta.get(name, {"org": "", "unit": "", "section": ""})
        
        def avg_from_raters(raters, filter_fn):
            filtered = [r['total'] for r in raters if filter_fn(r['name'])]
            return sum(filtered) / len(filtered) if filtered else 0.0
        
        def is_in_section(rater_name, target_section):
            m = get_rater_meta(rater_name)
            section = m.get('section', '')
            if target_section in ['保育股', '保育/生輔股', '生輔股']:
                return section in ['保育股', '保育/生輔股', '生輔股']
            return section == target_section
        
        def is_in_unit(rater_name, target_unit):
            return get_rater_meta(rater_name).get('unit', '') == target_unit
        
        def is_in_org(rater_name, target_org):
            return get_rater_meta(rater_name).get('org', '') == target_org
        def is_manager_for_employee(rater_name, employee_section):
            """Check if rater is a manager for an employee in the given section."""
            # Core managers are managers for everyone
            if rater_name in MANAGERS:
                return True
            # Supervisors are only managers for their specific section
            if rater_name in SUPERVISORS:
                supervisor_section = SUPERVISOR_SECTIONS.get(rater_name, '')
                # Check if the supervisor's section matches the employee's section
                if supervisor_section in ['保育股', '保育/生輔股', '生輔股']:
                    return employee_section in ['保育股', '保育/生輔股', '生輔股']
                return supervisor_section == employee_section
            return False
        
        def default_rule():
            return [
                ("主管", lambda n: n in ALL_MANAGERS, 0.5),
                ("其他同仁", lambda n: n not in ALL_MANAGERS, 0.5)
            ]
        
        def get_rules_for_employee(employee_name, employee_section):
            """Get weighted rules specific to an employee, considering their section."""
            def is_mgr(n):
                return is_manager_for_employee(n, employee_section)
            return [
                ("主管", is_mgr, 0.5),
                ("其他同仁", lambda n: not is_manager_for_employee(n, employee_section), 0.5)
            ]
        
        # Employee rules (same as analyze_scores.py)
        EMPLOYEE_RULES = {
            '陳宛妤': [("主管", lambda n: n in MANAGERS, 0.5), ("兒少之家教保組員", lambda n: is_in_org(n, '兒少之家') and is_in_unit(n, '教保組') and n not in ALL_MANAGERS, 0.5)],
            '簡采琦': [("主管", lambda n: n in MANAGERS, 0.5), ("兒少之家社工股", lambda n: is_in_org(n, '兒少之家') and is_in_section(n, '社工股'), 0.4), ("兒少之家教保組其他員工", lambda n: is_in_org(n, '兒少之家') and is_in_unit(n, '教保組') and not is_in_section(n, '社工股') and n not in ALL_MANAGERS, 0.1)],
            '鍾宜珮': [("主管", lambda n: n in MANAGERS, 0.5), ("少年家園教保組員", lambda n: is_in_org(n, '少年家園') and is_in_unit(n, '教保組') and n not in ALL_MANAGERS, 0.5)],
            '林品亨': [("主管", lambda n: n in MANAGERS, 0.5), ("少年家園生輔股", lambda n: is_in_org(n, '少年家園') and is_in_section(n, '保育/生輔股'), 0.4), ("少年家園教保組其他員工", lambda n: is_in_org(n, '少年家園') and is_in_unit(n, '教保組') and not is_in_section(n, '保育/生輔股') and n not in ALL_MANAGERS, 0.1)],
            '林紀騰': [("主管", lambda n: n in MANAGERS, 0.5), ("庶務股股員", lambda n: is_in_section(n, '庶務股') and n != '林紀騰', 0.3), ("行政組其他組員", lambda n: is_in_unit(n, '行政組') and not is_in_section(n, '庶務股') and n not in MANAGERS, 0.2)],
            '王姿斐': [("主管（總幹事、社資組長）", lambda n: n in {'李冠葦', '陳淑錡'}, 0.5), ("行政組（不含廚師）", lambda n: is_in_unit(n, '行政組') and n not in {'劉春燕', '熊小蓮'}, 0.5)],
            '高靜華': [("總幹事、兩家園主任", lambda n: n in {'李冠葦', '廖振杉', '廖慧雯'}, 1.0)],
            # 行政副組長: 50% 主管 + 50% 行政組員工績效
            '陳淑錡': [("主管", lambda n: n in MANAGERS, 0.5), ("行政組員", lambda n: is_in_unit(n, '行政組') and n not in MANAGERS and n != '陳淑錡', 0.5)],
            # 4 Institution Heads: 50% 董事長 + 50% 機構員工績效平均
            '李冠葦': [("董事長", lambda n: n == '董事長', 0.5), ("機構員工", lambda n: True, 0.5)],
            '廖振杉': [("董事長", lambda n: n == '董事長', 0.5), ("機構員工", lambda n: True, 0.5)],
            '廖慧雯': [("董事長", lambda n: n == '董事長', 0.5), ("機構員工", lambda n: True, 0.5)],
            '楊顗帆': [("董事長", lambda n: n == '董事長', 0.5), ("機構員工", lambda n: True, 0.5)],
        }
        
        # Build output
        peers_map = defaultdict(list)
        for name, meta in staff_meta.items():
            peers_map[(meta['org'], meta['unit'])].append(name)
        
        # Ensure institution heads are included even if not rated yet
        INSTITUTION_HEADS = ['李冠葦', '廖振杉', '廖慧雯', '楊顗帆']
        for head in INSTITUTION_HEADS:
            if head not in employee_scores:
                employee_scores[head] = []  # No scores yet, will be calculated from subordinates
        
        output_data = []
        for employee, scores in sorted(employee_scores.items()):
            current_raters = employee_raters[employee]
            current_raters.sort(key=lambda x: x['name'])
            
            meta = staff_meta.get(employee, {"org": "未分類", "unit": "", "section": ""})
            
            # Missing raters
            missing_raters = []
            if meta['org'] != '未分類':
                peers = peers_map.get((meta['org'], meta['unit']), [])
                existing_rater_names = set(r['name'] for r in current_raters)
                missing_raters = sorted([p for p in peers if p != employee and p not in existing_rater_names])
            
            # Custom rounding: .1-.9 → round up (ceil), .0 → round down (floor)
            import math
            def custom_round(value):
                first_decimal = int((value * 10) % 10)  # Get first decimal digit
                if first_decimal >= 1:
                    return math.ceil(value)
                else:
                    return math.floor(value)
            
            # Special case: Supervisors' scores come from the SCORES of their subordinates
            SPECIAL_SUPERVISOR_RULES = {
                '林紀騰': {
                    '庶務股股員': (['林港博', '謝秀桃', '徐銘澤', '羅如光'], '庶務股員績效平均')
                },
                '簡采琦': {
                    '兒少之家社工股': (['曾婷婷'], '社工股員績效平均'),
                    '兒少之家教保組其他員工': (['林東美', '賀郁茵', '梁偉培', '廖玟慈', '張宜芳', '蕭婷予', '王卉蓁', '陳亮寧', '李炎輝', '許芸嘉'], '保育股員績效平均')
                },
                '林品亨': {
                    '少年家園生輔股': (['胡少淇', '郭楷欣', '吳秉熹', '蔣郡哲', '劉婷瑜', '黃穎蓁', '吳思函'], '生輔股員績效平均'),
                    '少年家園教保組其他員工': (['蘇盟惠', '劉宛宣', '黃歆藝'], '社工心輔股員績效平均')
                },
                # 4 Institution Heads: 50% 董事長 + 50% 下轄員工績效
                '李冠葦': {
                    '機構員工': (['劉春燕', '徐銘澤', '林港博', '林紀騰', '林麗娟', '王元鼎', '王芊蓉', '羅如光', '謝秀桃', '陳淑錡', '陸廷瑋'], '行政組員工績效平均')
                },
                '廖振杉': {
                    '機構員工': (['熊小蓮', '簡采琦', '廖玟慈', '張宜芳', '曾婷婷', '李炎輝', '林東美', '梁偉培', '王卉蓁', '蕭婷予', '許芸嘉', '賀郁茵', '陳亮寧', '陳宛妤'], '兒少之家員工績效平均')
                },
                '廖慧雯': {
                    '機構員工': (['劉婷瑜', '劉宛宣', '吳思函', '吳秉熹', '林品亨', '胡少淇', '蔣郡哲', '蘇盟惠', '郭楷欣', '鍾宜珮', '陳昱綸', '黃歆藝', '黃穎蓁'], '少年家園員工績效平均')
                },
                '楊顗帆': {
                    '機構員工': (['林彥秀', '陳柔安'], '諮商所員工績效平均')
                },
                # 教保組長: 50% 主管 + 50% 教保組員工績效
                '陳宛妤': {
                    '兒少之家教保組員': (['簡采琦', '林東美', '賀郁茵', '梁偉培', '廖玟慈', '張宜芳', '蕭婷予', '王卉蓁', '陳亮寧', '曾婷婷', '李炎輝', '許芸嘉'], '兒少之家教保組員工績效平均')
                },
                '鍾宜珮': {
                    '少年家園教保組員': (['林品亨', '胡少淇', '郭楷欣', '吳秉熹', '蔣郡哲', '劉婷瑜', '黃穎蓁', '吳思函', '蘇盟惠', '劉宛宣', '黃歆藝', '陳昱綸'], '少年家園教保組員工績效平均')
                },
                # 行政副組長: 50% 主管 + 50% 行政組員工績效
                '陳淑錡': {
                    '行政組員': (['劉春燕', '徐銘澤', '林港博', '林紀騰', '林麗娟', '王元鼎', '王芊蓉', '羅如光', '謝秀桃', '陸廷瑋'], '行政組員工績效平均')
                }
            }
            
            # Institution head rules: 50% 董事長 + 50% 員工績效
            INSTITUTION_HEAD_RULES = {
                '李冠葦': [("董事長", lambda n: n == '董事長', 0.5), ("機構員工", lambda n: True, 0.5)],
                '廖振杉': [("董事長", lambda n: n == '董事長', 0.5), ("機構員工", lambda n: True, 0.5)],
                '廖慧雯': [("董事長", lambda n: n == '董事長', 0.5), ("機構員工", lambda n: True, 0.5)],
                '楊顗帆': [("董事長", lambda n: n == '董事長', 0.5), ("機構員工", lambda n: True, 0.5)]
            }
            
            # Helper to calculate weighted category averages based on rules
            def calc_weighted_category(raters, rules, cat_key, emp_name, special_rules):
                total_weighted = 0.0
                total_weight = 0.0
                
                # Check if this employee has special supervisor rules
                if emp_name in special_rules:
                    supervisor_rules = special_rules[emp_name]
                    for desc, filter_fn, weight in rules:
                        if desc in supervisor_rules:
                            members, _ = supervisor_rules[desc]
                            # Get category avg from employees' own scores
                            member_cats = []
                            for m in members:
                                if m in employee_scores:
                                    m_raters = employee_raters[m]
                                    if m_raters:
                                        m_cat_avg = sum(r[cat_key] for r in m_raters) / len(m_raters)
                                        member_cats.append(m_cat_avg)
                            if member_cats:
                                avg = sum(member_cats) / len(member_cats)
                                total_weighted += avg * weight
                                total_weight += weight
                        else:
                            filtered = [r[cat_key] for r in raters if filter_fn(r['name'])]
                            if filtered:
                                avg = sum(filtered) / len(filtered)
                                total_weighted += avg * weight
                                total_weight += weight
                else:
                    # Normal rules
                    for desc, filter_fn, weight in rules:
                        filtered = [r[cat_key] for r in raters if filter_fn(r['name'])]
                        if filtered:
                            avg = sum(filtered) / len(filtered)
                            total_weighted += avg * weight
                            total_weight += weight
                
                if total_weight > 0 and total_weight < 1.0:
                    return total_weighted / total_weight
                elif total_weight > 0:
                    return total_weighted
                else:
                    # Fallback to simple average
                    return sum(r[cat_key] for r in raters) / len(raters) if raters else 0.0
            
            employee_section_for_rules = meta.get('section', '')
            rules = EMPLOYEE_RULES.get(employee, get_rules_for_employee(employee, employee_section_for_rules))
            
            cat1_avg = calc_weighted_category(current_raters, rules, 'cat1', employee, SPECIAL_SUPERVISOR_RULES)
            cat2_avg = calc_weighted_category(current_raters, rules, 'cat2', employee, SPECIAL_SUPERVISOR_RULES)
            cat3_avg = calc_weighted_category(current_raters, rules, 'cat3', employee, SPECIAL_SUPERVISOR_RULES)
            
            cat1_rounded = custom_round(cat1_avg)
            cat2_rounded = custom_round(cat2_avg)
            cat3_rounded = custom_round(cat3_avg)
            
            # Apply rules
            employee_section = meta.get('section', '')
            rules = EMPLOYEE_RULES.get(employee, get_rules_for_employee(employee, employee_section))
            breakdown = []
            total_weighted_score = 0.0
            total_weight_used = 0.0
            
            if employee in SPECIAL_SUPERVISOR_RULES:
                supervisor_rules = SPECIAL_SUPERVISOR_RULES[employee]
                for desc, filter_fn, weight in rules:
                    if desc in supervisor_rules:
                        members, new_desc = supervisor_rules[desc]
                        member_scores = []
                        for m in members:
                            if m in employee_scores:
                                m_avg = sum(employee_scores[m]) / len(employee_scores[m])
                                member_scores.append(m_avg)
                        
                        if member_scores:
                            avg = sum(member_scores) / len(member_scores)
                            total_weighted_score += avg * weight
                            total_weight_used += weight
                            breakdown.append({
                                "desc": new_desc,
                                "weight": int(weight * 100),
                                "avg": float(f"{avg:.2f}"),
                                "count": len(member_scores),
                                "raters": [f"{m}({sum(employee_scores[m])/len(employee_scores[m]):.1f})" for m in members if m in employee_scores]
                            })
                    else:
                        # Normal processing for other rules (主管, etc.)
                        avg = avg_from_raters(current_raters, filter_fn)
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
            else:
                # Normal processing for non-special employees
                # Calculate breakdown with rounded category sums
                for desc, filter_fn, weight in rules:
                    filtered_raters = [r for r in current_raters if filter_fn(r['name'])]
                    filtered_count = len(filtered_raters)
                    filtered_names = [r['name'] for r in filtered_raters]
                    
                    if filtered_count > 0:
                        # Calculate each category average for this group
                        group_cat1 = sum(r['cat1'] for r in filtered_raters) / filtered_count
                        group_cat2 = sum(r['cat2'] for r in filtered_raters) / filtered_count
                        group_cat3 = sum(r['cat3'] for r in filtered_raters) / filtered_count
                        
                        # Apply rounding to each category
                        group_cat1_rounded = custom_round(group_cat1)
                        group_cat2_rounded = custom_round(group_cat2)
                        group_cat3_rounded = custom_round(group_cat3)
                        
                        # Sum of rounded categories for this group
                        group_rounded_total = group_cat1_rounded + group_cat2_rounded + group_cat3_rounded
                        
                        total_weighted_score += group_rounded_total * weight
                        total_weight_used += weight
                        breakdown.append({
                            "desc": desc,
                            "weight": int(weight * 100),
                            "avg": group_rounded_total,  # Now showing rounded sum
                            "count": filtered_count,
                            "raters": filtered_names
                        })
            
            if total_weight_used > 0 and total_weight_used < 1.0:
                final_score = total_weighted_score / total_weight_used
            elif total_weight_used > 0:
                final_score = total_weighted_score
            else:
                final_score = sum(scores) / len(scores) if scores else 0
            
            is_weighted = len(breakdown) > 1 or (len(breakdown) == 1 and breakdown[0]['weight'] < 100)
            
            # Get employee's section for determining who their managers are
            employee_section = meta.get('section', '')
            
            processed_raters = []
            for r in current_raters:
                r_copy = r.copy()
                # Use section-aware manager check
                r_copy['is_special'] = is_manager_for_employee(r['name'], employee_section)
                processed_raters.append(r_copy)
            
            # Total score = sum of rounded category scores (integer)
            total_rounded = cat1_rounded + cat2_rounded + cat3_rounded
            
            output_data.append({
                "name": employee,
                "org": meta['org'],
                "unit": meta['unit'],
                "section": meta['section'],
                "average_score": total_rounded,  # Now using integer sum of rounded categories
                "weighted_score": float(f"{final_score:.2f}"),  # Keep weighted score for reference
                "cat1_avg": float(f"{cat1_avg:.2f}"),
                "cat2_avg": float(f"{cat2_avg:.2f}"),
                "cat3_avg": float(f"{cat3_avg:.2f}"),
                "cat1_rounded": cat1_rounded,
                "cat2_rounded": cat2_rounded,
                "cat3_rounded": cat3_rounded,
                "rater_count": len(scores),
                "raters": processed_raters,
                "missing_raters": missing_raters,
                "is_weighted": is_weighted,
                "breakdown": breakdown
            })
        
        return output_data
    
    def get_rater_stats(self):
        """Calculate average scores GIVEN BY each rater."""
        input_file = os.path.join(BASE_DIR, 'score.csv')
        
        rater_given_scores = defaultdict(list)
        
        try:
            with open(input_file, mode='r', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)
                reader.fieldnames = [name.strip() for name in reader.fieldnames]
                
                for row in reader:
                    ratee = row.get('受評者', '').strip()
                    total_score_str = row.get('總分', '').strip()
                    rater = row.get('評分者', '').strip()
                    
                    cat1 = row.get('第一大類（共40分）', '0').strip()
                    cat2 = row.get('第二大類（共30分）', '0').strip()
                    cat3 = row.get('第三大類（共30分）', '0').strip()
                    
                    if rater and total_score_str:
                        try:
                            score = float(total_score_str)
                            rater_given_scores[rater].append({
                                "total": score,
                                "cat1": float(cat1) if cat1 else 0,
                                "cat2": float(cat2) if cat2 else 0,
                                "cat3": float(cat3) if cat3 else 0
                            })
                        except ValueError:
                            continue
        except FileNotFoundError:
            return {"error": "score.csv not found"}
        
        # Load staff metadata for org info
        staff_file = os.path.join(BASE_DIR, '工作人員名冊.csv')
        staff_org = {}
        try:
            with open(staff_file, mode='r', encoding='utf-8-sig') as csvfile:
                reader = csv.DictReader(csvfile)
                reader.fieldnames = [name.strip() for name in reader.fieldnames]
                for row in reader:
                    name = row.get('員工姓名', '').strip()
                    org = row.get('所屬機構', '').strip()
                    unit = row.get('所屬單位', '').strip()
                    if name:
                        # Normalize org names
                        if org in ['行政組', '社資組', '人資公關組', '圖書組', '會計室'] or unit in ['行政組', '社資組', '人資公關組', '圖書組', '會計室']:
                            org = '基金會'
                        elif '基金會' in org:
                            org = '基金會'
                        elif '兒少' in org or unit == '兒少之家':
                            org = '兒少之家'
                        elif '少年' in org or unit == '少年家園':
                            org = '少年家園'
                        elif '諮商' in org:
                            org = '諮商所'
                        elif org == '教保組' or unit == '教保組':
                            # Determine based on other context or default
                            if '兒少' in str(row):
                                org = '兒少之家'
                            elif '少年' in str(row):
                                org = '少年家園'
                            else:
                                org = '未分類'
                        elif not org or org == '-':
                            org = '未分類'
                        staff_org[name] = org
        except FileNotFoundError:
            pass
        
        # Calculate averages for each rater
        rater_stats = []
        org_scores = defaultdict(lambda: {'cat1': [], 'cat2': [], 'cat3': [], 'total': []})
        
        for rater, given_scores in sorted(rater_given_scores.items()):
            if not given_scores:
                continue
            
            avg_cat1 = sum(s['cat1'] for s in given_scores) / len(given_scores)
            avg_cat2 = sum(s['cat2'] for s in given_scores) / len(given_scores)
            avg_cat3 = sum(s['cat3'] for s in given_scores) / len(given_scores)
            avg_total = sum(s['total'] for s in given_scores) / len(given_scores)
            
            rater_org = staff_org.get(rater, '未分類')
            
            rater_stats.append({
                "name": rater,
                "org": rater_org,
                "count": len(given_scores),
                "avg_cat1": float(f"{avg_cat1:.2f}"),
                "avg_cat2": float(f"{avg_cat2:.2f}"),
                "avg_cat3": float(f"{avg_cat3:.2f}"),
                "avg_total": float(f"{avg_total:.2f}")
            })
            
            # Aggregate by org
            org_scores[rater_org]['cat1'].append(avg_cat1)
            org_scores[rater_org]['cat2'].append(avg_cat2)
            org_scores[rater_org]['cat3'].append(avg_cat3)
            org_scores[rater_org]['total'].append(avg_total)
        
        # Calculate org averages
        org_stats = []
        for org, scores in sorted(org_scores.items()):
            if org == '未分類':
                continue
            org_stats.append({
                "name": org,
                "count": len(scores['total']),
                "avg_cat1": float(f"{sum(scores['cat1'])/len(scores['cat1']):.2f}"),
                "avg_cat2": float(f"{sum(scores['cat2'])/len(scores['cat2']):.2f}"),
                "avg_cat3": float(f"{sum(scores['cat3'])/len(scores['cat3']):.2f}"),
                "avg_total": float(f"{sum(scores['total'])/len(scores['total']):.2f}")
            })
        
        return {
            "raters": rater_stats,
            "orgs": org_stats
        }
    
    def get_relationships(self):
        """Get rating relationships as nodes and edges for graph visualization."""
        import csv
        input_file = os.path.join(BASE_DIR, 'score.csv')
        staff_file = os.path.join(BASE_DIR, '工作人員名冊.csv')
        
        # Read staff metadata for org info
        staff_org = {}
        try:
            with open(staff_file, mode='r', encoding='utf-8-sig') as csvfile:
                reader = csv.DictReader(csvfile)
                reader.fieldnames = [name.strip() for name in reader.fieldnames]
                for row in reader:
                    name = row.get('員工姓名', '').strip()
                    org = row.get('所屬機構', '').strip()
                    unit = row.get('所屬單位', '').strip()
                    if name:
                        # Normalize org
                        if unit in ['行政組', '社資組', '人資公關組', '圖書組', '會計室']:
                            org = '基金會'
                        elif '基金會' in org:
                            org = '基金會'
                        elif '兒少' in org or unit == '兒少之家':
                            org = '兒少之家'
                        elif '少年' in org or unit == '少年家園':
                            org = '少年家園'
                        elif '諮商' in org:
                            org = '諮商所'
                        staff_org[name] = org
        except FileNotFoundError:
            pass
        
        nodes = {}
        edges = []
        
        try:
            with open(input_file, mode='r', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)
                reader.fieldnames = [name.strip() for name in reader.fieldnames]
                
                for row in reader:
                    rater = row.get('評分者', '').strip()
                    ratee = row.get('受評者', '').strip()
                    total_str = row.get('總分', '').strip()
                    
                    if rater and ratee and total_str:
                        try:
                            total = float(total_str)
                            
                            # Add nodes
                            if rater not in nodes:
                                nodes[rater] = {
                                    "id": rater,
                                    "label": rater,
                                    "org": staff_org.get(rater, '未分類')
                                }
                            if ratee not in nodes:
                                nodes[ratee] = {
                                    "id": ratee,
                                    "label": ratee,
                                    "org": staff_org.get(ratee, '未分類')
                                }
                            
                            # Add edge
                            edges.append({
                                "from": rater,
                                "to": ratee,
                                "score": total,
                                "label": str(int(total))
                            })
                        except ValueError:
                            continue
        except FileNotFoundError:
            return {"error": "score.csv not found"}
        
        return {
            "nodes": list(nodes.values()),
            "edges": edges
        }

def run_server():
    print(f"🚀 Starting Real-time Score Server at http://localhost:{PORT}")
    print(f"📂 Serving files from: {BASE_DIR}")
    print(f"🔄 Data endpoint: http://localhost:{PORT}/api/data")
    print("💡 Press Ctrl+C to stop the server.")
    
    server = HTTPServer(('', PORT), ScoreHandler)
    server.serve_forever()

if __name__ == '__main__':
    run_server()
