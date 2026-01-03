#!/usr/bin/env python3
"""
Setup Supabase database and import score data from CSV.
"""

import csv
import json
import urllib.request
import os

# Supabase credentials
SUPABASE_URL = "https://acrkclmderqewcwugsnl.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjcmtjbG1kZXJxZXdjd3Vnc25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjI1NzQzMCwiZXhwIjoyMDgxODMzNDMwfQ.ZCQl_0dsfPdkG43zQsF47lbbhA6ybiGLa2fw0zSKGzQ"

BASE_DIR = '/Users/leegary/考核'

def make_request(endpoint, method='GET', data=None):
    """Make a request to Supabase REST API"""
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    headers = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }
    
    req_data = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        print(f"HTTP Error {e.code}: {error_body}")
        return None

def create_table():
    """Create the scores table using SQL"""
    sql = """
    DROP TABLE IF EXISTS scores;
    
    CREATE TABLE scores (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        ratee TEXT NOT NULL,
        rater TEXT NOT NULL,
        cat1 INTEGER DEFAULT 0,
        cat2 INTEGER DEFAULT 0,
        cat3 INTEGER DEFAULT 0,
        total INTEGER GENERATED ALWAYS AS (cat1 + cat2 + cat3) STORED
    );
    
    CREATE UNIQUE INDEX IF NOT EXISTS scores_ratee_rater_idx ON scores(ratee, rater);
    
    ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Allow public read" ON scores;
    DROP POLICY IF EXISTS "Allow public insert" ON scores;
    DROP POLICY IF EXISTS "Allow public update" ON scores;
    DROP POLICY IF EXISTS "Allow public delete" ON scores;
    
    CREATE POLICY "Allow public read" ON scores FOR SELECT USING (true);
    CREATE POLICY "Allow public insert" ON scores FOR INSERT WITH CHECK (true);
    CREATE POLICY "Allow public update" ON scores FOR UPDATE USING (true);
    CREATE POLICY "Allow public delete" ON scores FOR DELETE USING (true);
    """
    
    # Execute SQL via Supabase SQL endpoint
    url = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql"
    headers = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json'
    }
    
    # Note: We need to use the SQL Editor in Supabase Dashboard for DDL
    print("⚠️  請在 Supabase Dashboard 的 SQL Editor 執行以下 SQL：")
    print("=" * 60)
    print(sql)
    print("=" * 60)
    return False

def import_csv_data():
    """Import data from score.csv to Supabase"""
    csv_file = os.path.join(BASE_DIR, 'score.csv')
    
    records = []
    with open(csv_file, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        print(f"📋 CSV columns: {fieldnames}")
        
        for row in reader:
            try:
                # Find columns by partial match
                ratee = ''
                rater = ''
                cat1 = 0
                cat2 = 0
                cat3 = 0
                
                for key, value in row.items():
                    key_clean = key.strip()
                    if '受評者' in key_clean:
                        ratee = value.strip()
                    elif '評分者' in key_clean:
                        rater = value.strip()
                    elif '第一大類' in key_clean:
                        cat1 = int(float(value)) if value else 0
                    elif '第二大類' in key_clean:
                        cat2 = int(float(value)) if value else 0
                    elif '第三大類' in key_clean:
                        cat3 = int(float(value)) if value else 0
                
                if ratee and rater:
                    records.append({
                        'ratee': ratee,
                        'rater': rater,
                        'cat1': cat1,
                        'cat2': cat2,
                        'cat3': cat3
                    })
            except (ValueError, KeyError) as e:
                print(f"Skipping row: {e}")
    
    print(f"📊 Found {len(records)} score records")
    
    # Insert in batches
    batch_size = 50
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        result = make_request('scores', method='POST', data=batch)
        if result:
            print(f"✅ Imported batch {i//batch_size + 1} ({len(batch)} records)")
        else:
            print(f"❌ Failed to import batch {i//batch_size + 1}")
    
    print(f"🎉 Import complete! Total: {len(records)} records")

def check_table_exists():
    """Check if scores table exists"""
    result = make_request('scores?select=count&limit=1')
    return result is not None

if __name__ == '__main__':
    print("🚀 Supabase Setup Script")
    print(f"📍 URL: {SUPABASE_URL}")
    
    # Check if table exists
    if check_table_exists():
        print("✅ scores table exists")
        
        # Ask to import
        response = input("Import CSV data to Supabase? (y/n): ")
        if response.lower() == 'y':
            import_csv_data()
    else:
        print("❌ scores table does not exist")
        create_table()
        print("\n請先在 Supabase Dashboard 建立資料表，然後再執行此腳本匯入資料。")
