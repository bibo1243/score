#!/usr/bin/env python3
"""
Real-time Score Analysis Server
Uses Supabase database for score storage.
"""

import csv
import json
import os
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
from collections import defaultdict

PORT = 8080
BASE_DIR = '/Users/leegary/考核'

# Supabase configuration
SUPABASE_URL = "https://acrkclmderqewcwugsnl.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjcmtjbG1kZXJxZXdjd3Vnc25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjI1NzQzMCwiZXhwIjoyMDgxODMzNDMwfQ.ZCQl_0dsfPdkG43zQsF47lbbhA6ybiGLa2fw0zSKGzQ"
USE_SUPABASE = True  # Set to False to use CSV file instead

def supabase_request(endpoint, method='GET', data=None, params=None):
    """Make a request to Supabase REST API"""
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    if params:
        url += '?' + '&'.join([f"{k}={v}" for k, v in params.items()])
    
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
        print(f"Supabase Error {e.code}: {error_body}")
        return None


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
        
        # API endpoint for backup (just creates backup)
        if parsed_path.path == '/api/backup':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            
            result = self.backup_scores()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
            return
        
        # API endpoint for backup download (returns CSV file)
        # API endpoint for backup download (returns CSV file)
        if parsed_path.path == '/api/backup-download':
            self.send_response(200)
            self.send_header('Content-Type', 'text/csv; charset=utf-8')
            self.send_header('Content-Disposition', 'attachment; filename="score_backup.csv"')
            self.end_headers()
            
            with open(os.path.join(BASE_DIR, 'score_backup.csv'), 'rb') as f:
                self.wfile.write(f.read())
            return

        # API endpoint for getting bonuses
        if parsed_path.path == '/api/bonuses':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            
            bonuses = {}
            bonus_file = os.path.join(BASE_DIR, 'bonuses.json')
            if os.path.exists(bonus_file):
                try:
                    with open(bonus_file, 'r', encoding='utf-8') as f:
                        bonuses = json.load(f)
                except:
                    bonuses = {}
            self.wfile.write(json.dumps(bonuses, ensure_ascii=False).encode('utf-8'))
            return

        # API endpoint for deleted scores
        if parsed_path.path == '/api/deleted-scores':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            
            data = self.get_deleted_scores()
            self.wfile.write(json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8'))
            return

        # Serve static files normally
        return super().do_GET()

    def do_POST(self):
        parsed_path = urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')

        # Save bonus endpoint
        if parsed_path.path == '/api/save_bonus':
            try:
                data = json.loads(post_data)
                name = data.get('name')
                bonus = data.get('bonus')
                
                if name is not None and bonus is not None:
                    bonus_file = os.path.join(BASE_DIR, 'bonuses.json')
                    bonuses = {}
                    if os.path.exists(bonus_file):
                        try:
                            with open(bonus_file, 'r', encoding='utf-8') as f:
                                bonuses = json.load(f)
                        except:
                            pass
                    
                    bonuses[name] = int(bonus)
                    
                    with open(bonus_file, 'w', encoding='utf-8') as f:
                        json.dump(bonuses, f, ensure_ascii=False, indent=2)
                        
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "ok"}).encode('utf-8'))
                else:
                    self.send_error(400, "Missing name or bonus")
            except Exception as e:
                self.send_error(500, f"Error: {str(e)}")
            return

        # Update a score
        if parsed_path.path == '/api/update-score':
            try:
                data = json.loads(post_data)
                result = self.update_score(data)
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False).encode('utf-8'))
            return
        
        # Add a new rater score
        if parsed_path.path == '/api/add-score':
            try:
                data = json.loads(post_data)
                result = self.add_score(data)
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False).encode('utf-8'))
            return
        
        # Delete a rater's score for an employee
        if parsed_path.path == '/api/delete-score':
            try:
                data = json.loads(post_data)
                result = self.delete_score(data)
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False).encode('utf-8'))
            return
        
        # Restore a score to original values
        if parsed_path.path == '/api/restore-score':
            try:
                data = json.loads(post_data)
                result = self.restore_score(data)
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False).encode('utf-8'))
            return
        
        # Restore ALL modified scores
        if parsed_path.path == '/api/restore-all':
            try:
                result = self.restore_all_scores()
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False).encode('utf-8'))
            return
        
        # Restore a deleted score
        if parsed_path.path == '/api/restore-deleted':
            try:
                data = json.loads(post_data)
                result = self.restore_deleted_score(data)
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False).encode('utf-8'))
            return

        # Save rating rules to file
        if parsed_path.path == '/api/save-rules':
            try:
                # Parse JSON body
                rules_data = json.loads(post_data)
                
                # Write to rating_rules.json
                rules_path = os.path.join(BASE_DIR, 'rating_rules.json')
                with open(rules_path, 'w', encoding='utf-8') as f:
                    json.dump(rules_data, f, ensure_ascii=False, indent=2)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "message": "規則已儲存至伺服器"}, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False).encode('utf-8'))
            return
        

        
        self.send_response(404)
        self.end_headers()
    
    def backup_scores(self):
        """Create a timestamped backup of score.csv"""
        import shutil
        from datetime import datetime
        
        input_file = os.path.join(BASE_DIR, 'score.csv')
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_dir = os.path.join(BASE_DIR, 'backups')
        
        # Create backup directory if not exists
        os.makedirs(backup_dir, exist_ok=True)
        
        backup_file = os.path.join(backup_dir, f'score_backup_{timestamp}.csv')
        shutil.copy2(input_file, backup_file)
        
        return {
            "success": True,
            "message": f"備份成功",
            "filename": f"score_backup_{timestamp}.csv",
            "timestamp": timestamp
        }
    
    def get_backup_csv(self):
        """Generate CSV content from Supabase for download"""
        from datetime import datetime
        import io
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"score_backup_{timestamp}.csv"
        
        if USE_SUPABASE:
            # Fetch all scores from Supabase
            result = supabase_request('scores?select=*&order=ratee,rater')
            
            if result:
                output = io.StringIO()
                writer = csv.writer(output)
                
                # Write header
                writer.writerow(['建立時間', '評分者', '受評者', '第一大類（共40分）', '第二大類（共30分）', '第三大類（共30分）', '總分'])
                
                # Write data
                for row in result:
                    writer.writerow([
                        row.get('created_at', ''),
                        row.get('rater', ''),
                        row.get('ratee', ''),
                        row.get('cat1', 0),
                        row.get('cat2', 0),
                        row.get('cat3', 0),
                        row.get('total', 0)
                    ])
                
                return output.getvalue(), filename
        
        return '', filename
    
    def restore_all_scores(self):
        """Restore ALL modified scores to their original values"""
        if USE_SUPABASE:
            # First, find all modified scores
            result = supabase_request('scores?select=id,ratee,rater,cat1,cat2,cat3,original_cat1,original_cat2,original_cat3')
            
            if result:
                modified = []
                for r in result:
                    if r.get('original_cat1') is not None:
                        if (r['cat1'] != r['original_cat1'] or 
                            r['cat2'] != r['original_cat2'] or 
                            r['cat3'] != r['original_cat3']):
                            modified.append(r)
                
                if not modified:
                    return {"success": True, "message": "沒有需要還原的修改", "count": 0}
                
                # Restore each modified score
                restored_count = 0
                for m in modified:
                    import urllib.parse
                    score_id = m['id']
                    
                    update_data = {
                        'cat1': m['original_cat1'],
                        'cat2': m['original_cat2'],
                        'cat3': m['original_cat3']
                    }
                    
                    url = f"{SUPABASE_URL}/rest/v1/scores?id=eq.{score_id}"
                    headers = {
                        'apikey': SUPABASE_SERVICE_KEY,
                        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    }
                    
                    req_data = json.dumps(update_data).encode('utf-8')
                    req = urllib.request.Request(url, data=req_data, headers=headers, method='PATCH')
                    
                    try:
                        with urllib.request.urlopen(req) as response:
                            restored_count += 1
                    except:
                        pass
                
                return {"success": True, "message": "還原成功", "count": restored_count}
            
            return {"success": False, "error": "無法讀取資料"}
        else:
            return {"success": False, "error": "CSV 模式已停用"}
    
    def update_score(self, data):
        """Update a specific score in Supabase"""
        ratee = data.get('ratee', '').strip()
        rater = data.get('rater', '').strip()
        cat1 = data.get('cat1')
        cat2 = data.get('cat2')
        cat3 = data.get('cat3')
        
        if USE_SUPABASE:
            # Build update data
            update_data = {}
            if cat1 is not None:
                update_data['cat1'] = int(cat1)
            if cat2 is not None:
                update_data['cat2'] = int(cat2)
            if cat3 is not None:
                update_data['cat3'] = int(cat3)
            
            # URL encode the filter parameters
            import urllib.parse
            ratee_encoded = urllib.parse.quote(ratee)
            rater_encoded = urllib.parse.quote(rater)
            
            # Make PATCH request to Supabase
            url = f"{SUPABASE_URL}/rest/v1/scores?ratee=eq.{ratee_encoded}&rater=eq.{rater_encoded}"
            headers = {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            }
            
            req_data = json.dumps(update_data).encode('utf-8')
            req = urllib.request.Request(url, data=req_data, headers=headers, method='PATCH')
            
            try:
                with urllib.request.urlopen(req) as response:
                    result = json.loads(response.read().decode('utf-8'))
                    if result and len(result) > 0:
                        return {"success": True, "message": "更新成功"}
                    else:
                        return {"success": False, "error": f"找不到該評分記錄 (受評者:{ratee}, 評分者:{rater})"}
            except urllib.error.HTTPError as e:
                error_body = e.read().decode('utf-8')
                return {"success": False, "error": f"Supabase 錯誤: {error_body}"}
        else:
            # Fallback to CSV (original code)
            return {"success": False, "error": "CSV 模式已停用"}
    
    def delete_score(self, data):
        """Soft delete a specific score entry (set is_deleted=true)"""
        ratee = data.get('ratee', '').strip()
        rater = data.get('rater', '').strip()
        
        if USE_SUPABASE:
            import urllib.parse
            from datetime import datetime
            ratee_encoded = urllib.parse.quote(ratee)
            rater_encoded = urllib.parse.quote(rater)
            
            # Soft delete: set is_deleted=true and record deletion time
            update_data = {
                'is_deleted': True,
                'deleted_at': datetime.now().isoformat()
            }
            
            url = f"{SUPABASE_URL}/rest/v1/scores?ratee=eq.{ratee_encoded}&rater=eq.{rater_encoded}"
            headers = {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            }
            
            req_data = json.dumps(update_data).encode('utf-8')
            req = urllib.request.Request(url, data=req_data, headers=headers, method='PATCH')
            
            try:
                with urllib.request.urlopen(req) as response:
                    result = json.loads(response.read().decode('utf-8'))
                    if result and len(result) > 0:
                        return {"success": True, "message": f"已刪除 {rater} 對 {ratee} 的評分（可還原）"}
                    else:
                        return {"success": False, "error": f"找不到該評分記錄 (受評者:{ratee}, 評分者:{rater})"}
            except urllib.error.HTTPError as e:
                error_body = e.read().decode('utf-8')
                return {"success": False, "error": f"Supabase 錯誤: {error_body}"}
        else:
            return {"success": False, "error": "CSV 模式已停用"}
    
    def get_deleted_scores(self):
        """Get all soft-deleted scores"""
        if USE_SUPABASE:
            result = supabase_request('scores?is_deleted=eq.true&select=*')
            if result:
                return {"success": True, "deleted": result}
            return {"success": True, "deleted": []}
        return {"success": False, "error": "CSV 模式已停用"}
    
    def restore_deleted_score(self, data):
        """Restore a soft-deleted score"""
        ratee = data.get('ratee', '').strip()
        rater = data.get('rater', '').strip()
        
        if USE_SUPABASE:
            import urllib.parse
            ratee_encoded = urllib.parse.quote(ratee)
            rater_encoded = urllib.parse.quote(rater)
            
            # Restore: set is_deleted=false
            update_data = {
                'is_deleted': False,
                'deleted_at': None
            }
            
            url = f"{SUPABASE_URL}/rest/v1/scores?ratee=eq.{ratee_encoded}&rater=eq.{rater_encoded}"
            headers = {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            }
            
            req_data = json.dumps(update_data).encode('utf-8')
            req = urllib.request.Request(url, data=req_data, headers=headers, method='PATCH')
            
            try:
                with urllib.request.urlopen(req) as response:
                    result = json.loads(response.read().decode('utf-8'))
                    if result and len(result) > 0:
                        return {"success": True, "message": f"已還原 {rater} 對 {ratee} 的評分"}
                    else:
                        return {"success": False, "error": f"找不到該評分記錄"}
            except urllib.error.HTTPError as e:
                error_body = e.read().decode('utf-8')
                return {"success": False, "error": f"Supabase 錯誤: {error_body}"}
        else:
            return {"success": False, "error": "CSV 模式已停用"}
    
    def add_score(self, data):
        """Add a new score entry to Supabase"""
        ratee = data.get('ratee', '').strip()
        rater = data.get('rater', '').strip()
        cat1 = int(data.get('cat1', 0))
        cat2 = int(data.get('cat2', 0))
        cat3 = int(data.get('cat3', 0))
        is_manager = data.get('is_manager', False)  # Whether rater is a manager
        
        if not ratee or not rater:
            return {"success": False, "error": "受評者和評分者不能為空"}
        
        if USE_SUPABASE:
            from datetime import datetime
            
            # First check if this combination already exists
            import urllib.parse
            ratee_encoded = urllib.parse.quote(ratee)
            rater_encoded = urllib.parse.quote(rater)
            
            check_url = f"{SUPABASE_URL}/rest/v1/scores?ratee=eq.{ratee_encoded}&rater=eq.{rater_encoded}&select=id"
            headers = {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'Content-Type': 'application/json'
            }
            
            try:
                req = urllib.request.Request(check_url, headers=headers, method='GET')
                with urllib.request.urlopen(req) as response:
                    existing = json.loads(response.read().decode('utf-8'))
                    if existing and len(existing) > 0:
                        return {"success": False, "error": f"{rater} 對 {ratee} 的評分已存在，請使用編輯功能"}
            except:
                pass  # Continue with insert
            
            # Insert new score (only include columns that exist in the table)
            # Note: 'total' is auto-generated, don't include it
            new_score = {
                'ratee': ratee,
                'rater': rater,
                'cat1': cat1,
                'cat2': cat2,
                'cat3': cat3,
                'original_cat1': cat1,
                'original_cat2': cat2,
                'original_cat3': cat3
            }
            
            url = f"{SUPABASE_URL}/rest/v1/scores"
            headers['Prefer'] = 'return=representation'
            
            req_data = json.dumps(new_score).encode('utf-8')
            req = urllib.request.Request(url, data=req_data, headers=headers, method='POST')
            
            try:
                with urllib.request.urlopen(req) as response:
                    result = json.loads(response.read().decode('utf-8'))
                    if result:
                        role_text = "主管" if is_manager else "平級"
                        return {"success": True, "message": f"已新增 {rater}（{role_text}）對 {ratee} 的評分"}
                    else:
                        return {"success": False, "error": "新增失敗"}
            except urllib.error.HTTPError as e:
                error_body = e.read().decode('utf-8')
                return {"success": False, "error": f"Supabase 錯誤: {error_body}"}
        else:
            return {"success": False, "error": "CSV 模式已停用"}
    
    def restore_score(self, data):
        """Restore a score to its original values"""
        ratee = data.get('ratee', '').strip()
        rater = data.get('rater', '').strip()
        
        if USE_SUPABASE:
            import urllib.parse
            ratee_encoded = urllib.parse.quote(ratee)
            rater_encoded = urllib.parse.quote(rater)
            
            # First, get the original values
            url = f"{SUPABASE_URL}/rest/v1/scores?ratee=eq.{ratee_encoded}&rater=eq.{rater_encoded}&select=original_cat1,original_cat2,original_cat3"
            headers = {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'Content-Type': 'application/json'
            }
            
            req = urllib.request.Request(url, headers=headers, method='GET')
            
            try:
                with urllib.request.urlopen(req) as response:
                    result = json.loads(response.read().decode('utf-8'))
                    if result and len(result) > 0:
                        original = result[0]
                        original_cat1 = original.get('original_cat1')
                        original_cat2 = original.get('original_cat2')
                        original_cat3 = original.get('original_cat3')
                        
                        if original_cat1 is None:
                            return {"success": False, "error": "沒有原始分數記錄"}
                        
                        # Update to original values
                        update_data = {
                            'cat1': original_cat1,
                            'cat2': original_cat2,
                            'cat3': original_cat3
                        }
                        
                        patch_url = f"{SUPABASE_URL}/rest/v1/scores?ratee=eq.{ratee_encoded}&rater=eq.{rater_encoded}"
                        patch_headers = {
                            'apikey': SUPABASE_SERVICE_KEY,
                            'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                            'Content-Type': 'application/json',
                            'Prefer': 'return=representation'
                        }
                        
                        patch_data = json.dumps(update_data).encode('utf-8')
                        patch_req = urllib.request.Request(patch_url, data=patch_data, headers=patch_headers, method='PATCH')
                        
                        with urllib.request.urlopen(patch_req) as patch_response:
                            return {
                                "success": True, 
                                "message": "已還原為原始分數",
                                "original": {
                                    "cat1": original_cat1,
                                    "cat2": original_cat2,
                                    "cat3": original_cat3
                                }
                            }
                    else:
                        return {"success": False, "error": f"找不到該評分記錄"}
            except urllib.error.HTTPError as e:
                error_body = e.read().decode('utf-8')
                return {"success": False, "error": f"Supabase 錯誤: {error_body}"}
        else:
            return {"success": False, "error": "CSV 模式已停用"}
    
    def process_scores(self):
        """Process scores and return structured data."""
        input_file = os.path.join(BASE_DIR, 'score.csv')
        staff_file = os.path.join(BASE_DIR, '工作人員名冊.csv')
        
        employee_scores = defaultdict(list)
        employee_raters = defaultdict(list)
        rater_given_scores = defaultdict(list)  # Track scores GIVEN BY each rater
        
        # Read scores from Supabase or CSV
        if USE_SUPABASE:
            # Fetch all scores from Supabase (exclude soft-deleted)
            result = supabase_request('scores?select=*&or=(is_deleted.is.null,is_deleted.eq.false)')
            if result:
                for row in result:
                    ratee = row.get('ratee', '').strip()
                    rater = row.get('rater', '').strip()
                    cat1 = float(row.get('cat1', 0) or 0)
                    cat2 = float(row.get('cat2', 0) or 0)
                    cat3 = float(row.get('cat3', 0) or 0)
                    total = row.get('total', cat1 + cat2 + cat3)
                    
                    # Get original scores
                    original_cat1 = row.get('original_cat1')
                    original_cat2 = row.get('original_cat2')
                    original_cat3 = row.get('original_cat3')
                    
                    # Check if modified
                    is_modified = (
                        original_cat1 is not None and 
                        (cat1 != original_cat1 or cat2 != original_cat2 or cat3 != original_cat3)
                    )
                    
                    if ratee:
                        employee_scores[ratee].append(total)
                        employee_raters[ratee].append({
                            "name": rater,
                            "total": total,
                            "cat1": cat1,
                            "cat2": cat2,
                            "cat3": cat3,
                            "original_cat1": original_cat1,
                            "original_cat2": original_cat2,
                            "original_cat3": original_cat3,
                            "is_modified": is_modified
                        })
                        if rater:
                            rater_given_scores[rater].append({
                                "ratee": ratee,
                                "total": total,
                                "cat1": cat1,
                                "cat2": cat2,
                                "cat3": cat3
                            })
        else:
            # Fallback to CSV
            try:
                with open(input_file, mode='r', encoding='utf-8-sig') as csvfile:
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
            
            # Explicit mapping for Institution Heads
            if name == '李冠葦' or name == '熊小蓮': return '基金會', '行政組', section
            if name == '廖振杉': return '兒少之家', '教保組', section # Assuming unit/section, org is key
            if name == '廖慧雯': return '少年家園', '教保組', section
            if name == '楊顗帆': return '諮商所', unit, section
            
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
                        role = row.get('考核標準', '').strip()
                        title = row.get('職稱', '').strip()
                        staff_meta[name] = {
                            "org": final_org, 
                            "unit": final_unit, 
                            "section": final_section,
                            "role": role,
                            "title": title
                        }
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
            '王姿斐': [("主管（總幹事）", lambda n: n in {'李冠葦'}, 0.5), ("行政組（不含廚師）", lambda n: is_in_unit(n, '行政組') and n not in {'劉春燕', '熊小蓮'}, 0.5)],
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
            
            # Missing raters - separated from subordinates
            missing_raters = []
            subordinates = []
            
            # --- Dynamic Logic from rating_rules.json ---
            
            # 1. Get Employee Config
            emp_config = EMPLOYEE_CONFIGS.get(employee, {})
            my_managers = set(emp_config.get("managers", []))
            manager_weight_setting = emp_config.get("manager_weight", 0.5)
            sub_rules = emp_config.get("subordinate_rules", [])
            
            # Calculate implied peer weight
            sub_total_weight = sum(r.get("weight", 0) for r in sub_rules)
            peer_weight_setting = max(0.0, 1.0 - manager_weight_setting - sub_total_weight)
            
            # 2. Identify Subordinates (Reverse lookup from rules)
            if not subordinates:
                for other_name, other_conf in EMPLOYEE_CONFIGS.items():
                    if employee in other_conf.get("managers", []):
                        subordinates.append(other_name)
                subordinates = sorted(subordinates)

            # 3. Identify Missing Raters
            if meta['org'] != '未分類':
                peers = peers_map.get((meta['org'], meta['unit']), [])
                existing_rater_names = set(r['name'] for r in current_raters)
                for p in peers:
                    if p != employee and p not in existing_rater_names:
                        # Exclude if they are my manager or my subordinate
                        if p not in my_managers and p not in subordinates:
                            missing_raters.append(p)
                missing_raters = sorted(missing_raters)

            # Helper: Custom rounding
            import math
            def custom_round(value):
                first_decimal = int((value * 10) % 10)
                if first_decimal >= 1:
                    return math.ceil(value)
                else:
                    return math.floor(value)
                    
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
                "role": meta.get('role', ''),
                "title": meta.get('title', ''),
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
                "subordinates": subordinates,
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
        score_map = {}  # Store scores for mutual detection
        
        # First pass: collect all scores
        if USE_SUPABASE:
            result = supabase_request('scores?select=rater,ratee,total')
            if result:
                for row in result:
                    rater = row.get('rater', '').strip()
                    ratee = row.get('ratee', '').strip()
                    total = row.get('total', 0)
                    
                    if rater and ratee:
                        # Store score in map
                        score_map[(rater, ratee)] = total
                        
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
        else:
            try:
                with open(input_file, mode='r', encoding='utf-8-sig') as csvfile:
                    reader = csv.DictReader(csvfile)
                    reader.fieldnames = [name.strip() for name in reader.fieldnames]
                    
                    for row in reader:
                        rater = row.get('評分者', '').strip()
                        ratee = row.get('受評者', '').strip()
                        total_str = row.get('總分', '').strip()
                        
                        if rater and ratee and total_str:
                            try:
                                total = float(total_str)
                                score_map[(rater, ratee)] = total
                                
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
                            except ValueError:
                                continue
            except FileNotFoundError:
                return {"error": "score.csv not found"}
        
        # Second pass: create edges and detect mutual high scores
        mutual_high = []  # Pairs where both gave each other 85+ scores
        HIGH_SCORE_THRESHOLD = 85
        
        for (rater, ratee), score in score_map.items():
            # Check if there's a reverse rating
            reverse_score = score_map.get((ratee, rater))
            is_mutual_high = (
                reverse_score is not None and 
                score >= HIGH_SCORE_THRESHOLD and 
                reverse_score >= HIGH_SCORE_THRESHOLD
            )
            
            edges.append({
                "from": rater,
                "to": ratee,
                "score": score,
                "label": str(int(score)),
                "is_mutual_high": is_mutual_high
            })
            
            # Track mutual high pairs (each pair once)
            if is_mutual_high and rater < ratee:
                mutual_high.append({
                    "person1": rater,
                    "person2": ratee,
                    "score1to2": score,
                    "score2to1": reverse_score,
                    "avg": (score + reverse_score) / 2
                })
        
        # Sort mutual high by average score descending
        mutual_high.sort(key=lambda x: x['avg'], reverse=True)
        
        return {
            "nodes": list(nodes.values()),
            "edges": edges,
            "mutual_high": mutual_high,
            "high_threshold": HIGH_SCORE_THRESHOLD
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
