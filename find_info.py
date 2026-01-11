import json

names = ["李鳳翎", "白梅芳", "王姿斐"]
try:
    with open('employee_data.json', 'r') as f:
        data = json.load(f)
        for emp in data:
            if emp['name'] in names:
                print(f"{emp['name']}: {emp.get('org')} {emp.get('unit')} {emp.get('section')}")
except Exception as e:
    print(e)
