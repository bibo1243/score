
import json
import os

# 1. Define the Manager -> Subordinates mapping (Copied from server.py)
MANAGER_SUBORDINATES = {
    '李冠葦': {'陳淑錡', '林紀騰', '劉春燕', '林麗娟', '熊小蓮', '王元鼎', '王芊蓉', '陸廷瑋', '林港博', '謝秀桃', '徐銘澤', '羅如光'},
    '陳淑錡': {'林紀騰', '劉春燕', '林麗娟', '熊小蓮', '王元鼎', '王芊蓉', '陸廷瑋', '林港博', '謝秀桃', '徐銘澤', '羅如光'},
    '林紀騰': {'林港博', '謝秀桃', '徐銘澤', '羅如光'},
    '高靜華': set(), # 高靜華沒有下屬列表，她是總幹事，由三位主任評
    '廖振杉': {'陳宛妤', '簡采琦', '林東美', '賀郁茵', '廖玟慈', '張宜芳', '蕭婷予', '陳亮寧', '王卉蓁', '許芸嘉', '李炎輝', '曾婷婷'},
    '陳宛妤': {'林東美', '賀郁茵', '廖玟慈', '張宜芳', '蕭婷予', '陳亮寧', '王卉蓁', '許芸嘉', '李炎輝', '曾婷婷', '簡采琦'},
    '簡采琦': {'廖玟慈', '張宜芳', '蕭婷予', '陳亮寧', '曾婷婷', '李炎輝', '林東美', '梁偉培', '王卉蓁', '許芸嘉', '賀郁茵'},
    '廖慧雯': {'鍾宜珮', '林品亨', '蘇盟惠', '劉宛宣', '郭楷欣', '吳秉熹', '胡少淇', '陳昱綸', '黃穎蓁', '蔣郡哲', '劉婷瑜', '吳思函', '黃歆藝'},
    '鍾宜珮': {'蘇盟惠', '劉宛宣', '郭楷欣', '吳秉熹', '胡少淇', '陳昱綸', '黃穎蓁', '蔣郡哲', '劉婷瑜', '吳思函', '林品亨', '黃歆藝'},
    '林品亨': {'胡少淇', '陳昱綸', '蔣郡哲', '劉婷瑜', '吳思函', '郭楷欣', '吳秉熹', '劉宛宣', '蘇盟惠', '黃歆藝', '黃穎蓁'},
    '楊顗帆': {'陳柔安', '林彥秀'},
}

# Special mapping for institution heads (From server.py: INSTITUTION_HEAD_RULES)
# 李冠葦, 廖振杉, 廖慧雯, 楊顗帆 -> Manager is '董事長'
INSTITUTION_HEADS = ['李冠葦', '廖振杉', '廖慧雯', '楊顗帆']

# Special mapping for 高靜華 (Directly from server.py rule)
# '高靜華': [("總幹事、兩家園主任", lambda n: n in {'李冠葦', '廖振杉', '廖慧雯'}, 1.0)],
KAO_MANAGERS = ['李冠葦', '廖振杉', '廖慧雯']

# Special Supervisor Rules (Subordinate Groups) - Copied for restoring rules
SPECIAL_RULES_SRC = {
    '林紀騰': {
        "manager_weight": 0.5,
        "subordinate_rules": [
            { "name": "庶務股股員", "weight": 0.3, "members": ["林港博", "謝秀桃", "徐銘澤", "羅如光"] },
            { "name": "行政組其他組員", "weight": 0.2, "members": ["劉春燕", "林麗娟", "熊小蓮", "王元鼎", "王芊蓉", "陸廷瑋"] }
        ]
    },
    '簡采琦': {
        "manager_weight": 0.5,
        "subordinate_rules": [
            { "name": "兒少之家社工股", "weight": 0.4, "members": ["曾婷婷"] },
            { "name": "兒少之家教保組其他員工", "weight": 0.1, "members": ["林東美", "賀郁茵", "梁偉培", "廖玟慈", "張宜芳", "蕭婷予", "王卉蓁", "陳亮寧", "李炎輝", "許芸嘉"] }
        ]
    },
    '林品亨': {
        "manager_weight": 0.5,
        "subordinate_rules": [
            { "name": "少年家園生輔股", "weight": 0.4, "members": ["胡少淇", "郭楷欣", "吳秉熹", "蔣郡哲", "劉婷瑜", "吳思函", "陳昱綸"] },
            { "name": "少年家園教保組其他員工", "weight": 0.1, "members": ["蘇盟惠", "劉宛宣", "黃歆藝", "黃穎蓁"] }
        ]
    },
    '陳宛妤': {
        "manager_weight": 0.5,
        "subordinate_rules": [
            { "name": "兒少之家教保組員", "weight": 0.5, "members": ["簡采琦", "林東美", "賀郁茵", "梁偉培", "廖玟慈", "張宜芳", "蕭婷予", "王卉蓁", "陳亮寧", "曾婷婷", "李炎輝", "許芸嘉"] }
        ]
    },
    '鍾宜珮': {
        "manager_weight": 0.5,
        "subordinate_rules": [
            { "name": "少年家園教保組員", "weight": 0.5, "members": ["林品亨", "胡少淇", "郭楷欣", "吳秉熹", "蔣郡哲", "劉婷瑜", "黃穎蓁", "吳思函", "蘇盟惠", "劉宛宣", "黃歆藝", "陳昱綸"] }
        ]
    },
    '陳淑錡': {
        "manager_weight": 0.5,
        "subordinate_rules": [
            { "name": "行政組員", "weight": 0.5, "members": ["劉春燕", "徐銘澤", "林港博", "林紀騰", "林麗娟", "王元鼎", "王芊蓉", "羅如光", "謝秀桃", "陸廷瑋"] }
        ]
    },
    '李冠葦': {
        "manager_weight": 0.5,
        "subordinate_rules": [
            { "name": "機構員工", "weight": 0.5, "members": ["劉春燕", "徐銘澤", "林港博", "林紀騰", "林麗娟", "王元鼎", "王芊蓉", "羅如光", "謝秀桃", "陳淑錡", "陸廷瑋"] }
        ]
    },
    '廖振杉': {
        "manager_weight": 0.5,
        "subordinate_rules": [
            { "name": "機構員工", "weight": 0.5, "members": ["熊小蓮", "簡采琦", "廖玟慈", "張宜芳", "曾婷婷", "李炎輝", "林東美", "梁偉培", "王卉蓁", "蕭婷予", "許芸嘉", "賀郁茵", "陳亮寧", "陳宛妤"] }
        ]
    },
    '廖慧雯': {
        "manager_weight": 0.5,
        "subordinate_rules": [
            { "name": "機構員工", "weight": 0.5, "members": ["劉婷瑜", "劉宛宣", "吳思函", "吳秉熹", "林品亨", "胡少淇", "蔣郡哲", "蘇盟惠", "郭楷欣", "鍾宜珮", "陳昱綸", "黃歆藝", "黃穎蓁"] }
        ]
    },
    '楊顗帆': {
        "manager_weight": 0.5,
        "subordinate_rules": [
            { "name": "機構員工", "weight": 0.5, "members": ["林彥秀", "陳柔安"] }
        ]
    },
    '高靜華': {
        "manager_weight": 1.0,
        "subordinate_rules": []
    }
}

# 2. Reverse Map: Employee -> Managers List
employee_managers = {}

for manager_name, subordinates in MANAGER_SUBORDINATES.items():
    for sub in subordinates:
        if sub not in employee_managers:
            employee_managers[sub] = set()
        employee_managers[sub].add(manager_name)

# 3. Build the final JSON structure
rating_rules = {
    "system_settings": {
        "default_manager_weight": 0.5,
        "default_peer_weight": 0.5,
        "default_rounding": "custom"
    },
    "groups": {
        "MANAGERS": list(MANAGER_SUBORDINATES.keys())
    },
    "employees": {}
}

# 4. Populate employees
# We need a list of ALL employees to ensure everyone is covered.
# Let's try to load employee_data.json if exists, otherwise infer from usage.
all_names = set(employee_managers.keys()) | set(MANAGER_SUBORDINATES.keys())

# Add Special Heads and Kao
all_names.update(INSTITUTION_HEADS)
all_names.add('高靜華')

for name in all_names:
    config = {
        "manager_weight": 0.5,
        "managers": [],
        "subordinate_rules": []
    }
    
    # Set Managers
    if name in employee_managers:
        config["managers"] = sorted(list(employee_managers[name]))
    elif name in INSTITUTION_HEADS:
        config["managers"] = ["董事長"]
    elif name == "高靜華":
        config["managers"] = KAO_MANAGERS
        config["manager_weight"] = 1.0
        
    # Set Special Rules (Subordinates)
    if name in SPECIAL_RULES_SRC:
        src = SPECIAL_RULES_SRC[name]
        config["manager_weight"] = src["manager_weight"]
        config["subordinate_rules"] = src["subordinate_rules"]
        
    rating_rules["employees"][name] = config

# 5. Write to file
with open('rating_rules.json', 'w', encoding='utf-8') as f:
    json.dump(rating_rules, f, ensure_ascii=False, indent=2)

print(f"Generated rating_rules.json with {len(rating_rules['employees'])} employees configured.")
