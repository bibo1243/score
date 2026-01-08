import csv

filename = '114下半年員工回饋&自我考核表 (回覆) - 表單回應 1.csv'
try:
    with open(filename, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        headers = next(reader)
        for i, h in enumerate(headers):
            print(f"{i}: {h}")
except Exception as e:
    print(e)
